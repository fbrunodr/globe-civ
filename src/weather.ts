import * as THREE from 'three';
import type { Globe } from './goldberg.ts';
import { noiseTexture } from './terrainMaterial.ts';
import { mulberry32 } from './rng.ts';
import { AIR, airGLSL } from './sky.ts';

// Weather: a cloud layer painted over the globe, and rain under its thickest
// parts. All of it is computed on the GPU, per pixel, from two fields:
//   - P(p), the chance of cloud at a point: the yearly rain of the ground
//     there (a smooth, blurred map of the tiles) — 10% over deserts, up to
//     85% over rainforest;
//   - N(p, t), moving noise, remapped to be spread evenly over 0..1. It
//     drifts with the wind of its latitude (easterly trade winds near the
//     equator, westerlies at mid latitudes) and slowly changes shape.
// There is cloud wherever N > 1 − P. Since N is even over 0..1, a point is
// covered a share P of the time: over time the sky averages to the climate,
// while at any moment it is a smooth, ever-changing painting with no tiles.
// To keep the shear between wind bands from stretching the noise without
// end, it is read from two drifting copies that take turns (like the
// rivers' flow), each restarting while the other shows.
//
// The layer is one sphere at cloud height: lit white from above, gray
// underneath (seen from the ground), hazy far away. Rain falls from fixed
// columns under thick cloud over wet ground. In the map view the layer only
// shows from high above (orbit), so it never hides the board.

const WIND = 0.0014;       // wind speed (radians per second) at its strongest
const CYCLE = 240;         // seconds each drifting copy of the noise lives
const RAIN_SPACING = 1.3;  // distance between rain columns, in tile inner radii
const RAIN_STREAKS = 28;   // streaks per raining column
const RAIN_SCALE = 2400;   // yearly rain (mm) that counts as fully wet

// Shared by the cloud layer and the rain.
const WEATHER_GLSL = /* glsl */ `
uniform float uTime;
uniform float uR0;
uniform sampler2D uRain;
uniform highp sampler3D uNoise;
float wWet(vec3 p) {
  vec2 uv = vec2(atan(p.z, p.x) / 6.2831853 + 0.5, asin(clamp(p.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  return texture(uRain, uv).r;
}
float wFbm(vec3 q) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * texture(uNoise, q / 64.0).r; q = q * 2.07 + 5.3; a *= 0.5; }
  return s / 0.96875;
}
vec3 wTurn(vec3 p, float ang) { float c = cos(ang), s = sin(ang); return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z); }
// Cloud cover (0..1) at unit direction p; rain (0..1) out.
float wCover(vec3 p, out float rain) {
  float wet = wWet(p);
  float P = clamp(0.06 + 0.62 * wet, 0.0, 0.75);
  float wind = -${WIND.toFixed(5)} * cos(3.0 * asin(clamp(p.y, -1.0, 1.0))) * ${CYCLE.toFixed(1)};
  float ph = uTime / ${CYCLE.toFixed(1)};
  float f0 = fract(ph), f1 = fract(ph + 0.5);
  vec3 drift = vec3(0.0, 0.0, uTime * 0.012);
  float k = 1.0 / (2.4 * uR0);
  float n0 = wFbm(wTurn(p, wind * f0) * k + drift + floor(ph) * 37.1);
  float n1 = wFbm(wTurn(p, wind * f1) * k + drift + floor(ph + 0.5) * 37.1 + 19.7);
  float blend = abs(2.0 * f0 - 1.0);
  float n = mix(n0, n1, blend);
  // Spread evenly over 0..1 (logistic fit of the noise's bell curve).
  float u = 1.0 / (1.0 + exp(-(n - 0.5) / 0.06));
  // Soft edges, thicker toward the middle of each cloud.
  float cover = smoothstep(1.0 - P - 0.04, 1.0 - P + 0.22, u);
  // Only about half the clouds rain: a second field, drifting with the
  // clouds (so a raining cloud keeps raining), picks which ones.
  float g0 = wFbm(wTurn(p, wind * f0) * k * 0.7 + drift + floor(ph) * 37.1 + 53.0);
  float g1 = wFbm(wTurn(p, wind * f1) * k * 0.7 + drift + floor(ph + 0.5) * 37.1 + 71.0);
  float rainy = smoothstep(0.48, 0.52, mix(g0, g1, blend));
  rain = smoothstep(0.75, 0.95, u - (1.0 - P) + 0.75) * smoothstep(0.35, 0.7, wet) * cover * rainy;
  return cover;
}
`;

export interface Weather {
  group: THREE.Group;
  // time: seconds; fade: distance to the camera over which clouds fade
  // ([near, far], or [0, 0] for none); amount: how much of the layer shows (0..1);
  // haze: fog color and density.
  update(time: number, sunDir: THREE.Vector3, fade: [number, number], amount: number, haze: { color: THREE.Color; density: number }): void;
}

export function makeWeather(globe: Globe, rainfall: Float32Array, r0: number, seed: number): Weather {
  const ALT = 0.05 * AIR.height; // cloud height above sea level (globe radii), above most peaks
  const rand = mulberry32(seed ^ 0x77ea7e);
  const uniforms = {
    uTime: { value: 0 },
    uR0: { value: r0 },
    uRain: { value: rainTexture(globe, rainfall) },
    uNoise: { value: noiseTexture() },
    uFade: { value: new THREE.Vector2(0, 0) },
    uAmount: { value: 1 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uHaze: { value: new THREE.Color() },
    uHazeDensity: { value: 0 },
  };

  // ---- the cloud layer ----
  const layer = new THREE.Mesh(
    new THREE.SphereGeometry(1 + ALT, 192, 96),
    new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${WEATHER_GLSL}
        uniform vec2 uFade;
        uniform float uAmount;
        uniform vec3 uSun;
        uniform vec3 uHaze;
        uniform float uHazeDensity;
        varying vec3 vPos;
        ${airGLSL()}
        void main() {
          vec3 p = normalize(vPos);
          float rain;
          float cover = wCover(p, rain);
          if (cover < 0.004) discard;
          float dist = distance(vPos, cameraPosition);
          float fade = uFade.y > 0.0 ? smoothstep(uFade.x, uFade.y, dist) : 1.0;
          // Lit from above, darker on the night side; gray underneath, darker
          // where thick or raining (only seen from below).
          bool below = length(cameraPosition) < ${(1 + ALT).toFixed(3)};
          float light = 0.45 + 0.6 * smoothstep(-0.25, 0.6, dot(p, uSun));
          vec3 col = below ? mix(vec3(0.93, 0.95, 0.98), vec3(0.5, 0.53, 0.58), max(cover * cover, rain))
                           : vec3(1.0) * light; // cloud tops stay white, raining or not
          float hz = 1.0 - exp(-uHazeDensity * airDepth(cameraPosition, vPos));
          col = mix(col, uHaze, hz);
          gl_FragColor = vec4(col, cover * 0.95 * fade * uAmount);
        }`,
    }),
  );
  layer.renderOrder = 4;

  // ---- rain: streaks in fixed columns, shown where thick cloud passes over wet ground ----
  const count = Math.round((4 * Math.PI) / (RAIN_SPACING * r0) ** 2);
  const anchors: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < count; k++) {
    const y = 1 - (2 * (k + 0.5)) / count, rr = Math.sqrt(1 - y * y);
    const a = new THREE.Vector3(Math.cos(golden * k) * rr, y, Math.sin(golden * k) * rr);
    a.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8 * RAIN_SPACING * r0)).normalize();
    anchors.push(a.x, a.y, a.z);
  }
  const streak = new Float32Array(RAIN_STREAKS * 2 * 4);
  for (let s = 0; s < RAIN_STREAKS; s++) {
    const ang = rand() * Math.PI * 2, rad = Math.sqrt(rand());
    const phase = rand();
    for (let e = 0; e < 2; e++) streak.set([Math.cos(ang) * rad, Math.sin(ang) * rad, phase, e], (s * 2 + e) * 4);
  }
  const rgeo = new THREE.InstancedBufferGeometry();
  rgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_STREAKS * 2 * 3), 3));
  rgeo.setAttribute('aStreak', new THREE.BufferAttribute(streak, 4));
  rgeo.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(Float32Array.from(anchors), 3));
  rgeo.instanceCount = count;
  const rmat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      ${WEATHER_GLSL}
      attribute vec4 aStreak;
      attribute vec3 aAnchor;
      varying float vAlpha;
      void main() {
        float rain;
        wCover(aAnchor, rain);
        // Only as many streaks as the rain is heavy.
        if (fract(aStreak.z * 7.13) > rain) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vAlpha = 0.0; return; }
        vec3 east = cross(vec3(0.0, 1.0, 0.0), aAnchor);
        east = dot(east, east) < 1e-8 ? vec3(1.0, 0.0, 0.0) : normalize(east);
        vec3 north = cross(aAnchor, east);
        float fall = fract(aStreak.z + uTime * 0.8); // 0 at the cloud, 1 at the ground
        float h = mix(1.0 + ${(ALT - 0.002).toFixed(4)}, 0.995, fall) + aStreak.w * 0.004;
        vec3 p = aAnchor * h + (east * aStreak.x + north * aStreak.y) * (0.6 * uR0);
        vAlpha = rain;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() { gl_FragColor = vec4(0.72, 0.78, 0.86, 0.5 * vAlpha); }`,
  });
  const rain = new THREE.LineSegments(rgeo, rmat);
  rain.frustumCulled = false;

  const group = new THREE.Group();
  group.add(layer, rain);
  return {
    group,
    update(time, sunDir, fade, amount, haze) {
      uniforms.uAmount.value = amount;
      layer.visible = amount > 0.001;
      uniforms.uTime.value = time;
      uniforms.uSun.value.copy(sunDir);
      uniforms.uFade.value.set(fade[0], fade[1]);
      uniforms.uHaze.value.copy(haze.color);
      uniforms.uHazeDensity.value = haze.density;
    },
  };
}

// The tiles' yearly rain as a small longitude-latitude map (0..1), blurred
// into a smooth field (no tile edges).
function rainTexture(globe: Globe, rainfall: Float32Array): THREE.DataTexture {
  const W = 256, H = 128;
  let wet = new Float32Array(W * H);
  const d = new THREE.Vector3();
  let t = 0;
  for (let y = 0; y < H; y++) {
    const lat = ((y + 0.5) / H - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W - 0.5) * Math.PI * 2;
      d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      t = nearestTile(globe, d, t);
      wet[y * W + x] = Math.min(1, rainfall[t] / RAIN_SCALE) ** 0.8;
    }
  }
  for (let pass = 0; pass < 6; pass++) {
    const next = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) { s += wet[yy * W + ((x + dx + W) % W)]; c++; }
      }
      next[y * W + x] = s / c;
    }
    wet = next;
  }
  const tex = new THREE.DataTexture(Uint8Array.from(wet, (v) => Math.round(v * 255)), W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function nearestTile(globe: Globe, dir: THREE.Vector3, start: number): number {
  const tiles = globe.tiles;
  let t = start, best = tiles[t].center.dot(dir);
  for (;;) {
    let next = -1;
    for (const nb of tiles[t].neighbors) {
      const v = tiles[nb].center.dot(dir);
      if (v > best) { best = v; next = nb; }
    }
    if (next < 0) return t;
    t = next;
  }
}
