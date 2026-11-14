import * as THREE from 'three';
import { GRADE_GLSL, NOISE_GLSL, noiseTexture } from './terrainMaterial.ts';
import { NOISE_SIZE } from './fineNoise.ts';

// The water surface: a translucent sheet at the water level over the carved
// ground (the trick of old console games: a see-through, gently moving
// layer over a visible bed). Everything comes from the water's depth, which
// each vertex carries (water level minus ground height; linear across a
// triangle, like both surfaces):
//   - color: light and clear in the shallows, the body's deep color further out;
//   - transparency: the bed shows through shallow water and fades with depth;
//   - foam: a line where the water meets the ground, plus bands rolling in
//     toward the shore;
//   - ripples and the sun's glints, rivers' ripples drifting downstream;
//   - the sky's reflection at grazing angles (Fresnel).
//
// Per-vertex attributes:
//   depth       water level minus ground height
//   tint        deep color (rgb) and murk (a: 1 = clear sea, higher = murkier)
//   flow        downstream direction × speed (rivers), else 0
//   ring        hex grid line, as on the ground
//   unexplored  fog of war: the water is hidden
//   dim         seen before but not in sight now: grayed like the ground

export interface WaterMaterial {
  material: THREE.MeshPhysicalMaterial;
  setTime(seconds: number): void;
  setGrid(on: boolean): void;
  setView(mode: number): void; // 2 = debug water view: color by source, steps in red
}

export const SKY_COLOR = new THREE.Color(0.62, 0.76, 0.92);

export function makeWaterMaterial(): WaterMaterial {
  // A dim specular: a small sun glint, not a blinding disc.
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.1, metalness: 0, specularIntensity: 0.7, transparent: true, depthWrite: false });
  const uTime = { value: 0 };
  const uGrid = { value: 0 };
  const uView = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uTime;
    shader.uniforms['uNoise'] = { value: noiseTexture() };
    shader.uniforms['uSky'] = { value: SKY_COLOR };
    shader.uniforms['uGrid'] = uGrid;
    shader.uniforms['uView'] = uView;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float depth;
        attribute vec4 tint;
        attribute vec3 flow;
        attribute float ring;
        attribute float unexplored;
        attribute float dim;
        attribute float wsrc;
        attribute float wstep;
        varying float vSrc;
        varying float vStep;
        varying float vDepth;
        varying vec4 vTint;
        varying vec3 vFlow;
        varying float vRing;
        varying float vFog;
        varying float vDim;
        varying vec3 vObjPos;`)
      // The surface is level: its normal points straight up, away from the center.
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(position);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSrc = wsrc; vStep = wstep;
        vDepth = depth; vTint = tint; vFlow = flow; vRing = ring; vFog = unexplored; vDim = dim;
        vObjPos = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform highp sampler3D uNoise;
        uniform vec3 uSky;
        uniform float uGrid;
        uniform float uView;
        varying float vSrc;
        varying float vStep;
        varying float vDepth;
        varying vec4 vTint;
        varying vec3 vFlow;
        varying float vRing;
        varying float vFog;
        varying float vDim;
        varying vec3 vObjPos;
        float tLod;
        float foam;
        ${NOISE_GLSL}
        ${GRADE_GLSL}
        // The waves' height at P (world units), for the surface's normal: on
        // a river, ripples carried downstream (two phases, so the pattern
        // never stretches), short and steep, the current's chop; on still
        // and open water, a longer swell and a fine chop drifting across it.
        // (The noise, eased between its texels: read plainly its slope is constant across each, and
        // waves shaded by their slope show the texels as blocks.)
        float wNoise(vec3 x) { vec3 q = x - 0.5, f = fract(q); return texture(uNoise, (floor(q) + f * f * (3.0 - 2.0 * f) + 0.5) * ${(1 / NOISE_SIZE).toFixed(8)}).r; }
        float waveHeight(vec3 P) {
          // (How much a river's: eased in with its current, so where it runs out into a lake or
          // the sea its ripples pass into the swell with no line between them.)
          float river = smoothstep(0.2, 0.75, length(vFlow)), h = 0.0;
          if (river > 0.0) {
            float ph = uTime * 0.3, t0 = fract(ph), t1 = fract(ph + 0.5), w = abs(2.0 * t0 - 1.0);
            vec3 a = P - vFlow * t0 * 0.0016, b = P - vFlow * t1 * 0.0016;
            float big = mix(wNoise(a * 1500.0), wNoise(b * 1500.0 + 17.0), w);
            float fine = mix(wNoise(a * 3600.0 + 5.0), wNoise(b * 3600.0 + 31.0), w);
            h += river * (0.00024 * (big - 0.5) * tFade(1500.0) + 0.00008 * (fine - 0.5) * tFade(3600.0));
          }
          // Still and open water: a swell and a finer chop, each two layers of noise sliding
          // across each other in opposite ways (so the surface is always changing, the light on
          // it shifting and glinting, and nothing travels: no current, no direction).
          if (river < 1.0) {
            vec3 d1 = vec3(0.34, 0.21, -0.27) * uTime, d2 = vec3(-0.5, 0.36, 0.42) * uTime;
            float swell = 0.5 * (tNoise(P * 700.0 + d1) + tNoise(P * 760.0 + 19.0 - d1));
            float chop = 0.5 * (tNoise(P * 2300.0 + d2) + tNoise(P * 2500.0 + 41.0 - d2));
            h += (1.0 - river) * (0.00042 * (swell - 0.5) * tFade(700.0) + 0.00013 * (chop - 0.5) * tFade(2300.0));
          }
          return h;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // Under the ground (past the waterline): the ground hides it anyway.
          if (vDepth < 0.0) discard;
          vec3 P = vObjPos;
          tLod = length(fwidth(P));
          float d = vDepth;
          float murk = vTint.a;
          vec3 deep = vTint.rgb;
          // Open water (murk ~1) rolls waves onto its shores; rivers and pools
          // are calmer.
          float open = clamp(1.6 / murk - 0.3, 0.0, 1.0);
          vec3 shallow = mix(deep, vec3(0.1, 0.45, 0.48), 0.65 * clamp(1.3 / murk, 0.0, 1.0));
          float k = d * murk;
          // (The deep a shade deeper than its tint: the waves' light stands out on it.)
          vec3 col = mix(shallow, deep * vec3(0.5, 0.64, 0.86), 1.0 - exp(-k / 0.0008));
          // (Deep water is opaque: nothing shows through the open sea.)
          // (Clear in the shallows: the bed, its stones and the light playing on it show through.)
          float alpha = mix(0.4, 1.0, 1.0 - exp(-k / 0.0009));

          // Rivers: white water where the current breaks, in flecks carried
          // downstream (two phases, so the pattern never stretches), gathered
          // in patches (the rapids), more of it the faster the river runs.
          float streak = 0.0;
          float speed = length(vFlow);
          if (speed > 0.0) {
            float ph = uTime * 0.3;
            float t0 = fract(ph), t1 = fract(ph + 0.5);
            float n0 = tNoise((P - vFlow * t0 * 0.0016) * 2900.0 + 3.0);
            float n1 = tNoise((P - vFlow * t1 * 0.0016) * 2900.0 + 23.0);
            float n = mix(n0, n1, abs(2.0 * t0 - 1.0));
            float rapids = smoothstep(0.42, 0.7, tNoise(P * 420.0 + 9.0));
            streak = smoothstep(0.62, 0.8, n) * rapids * smoothstep(0.15, 0.7, speed) * tFade(2900.0); // (dying away with the current: none carried out into still water)
          }

          // Foam: a line at the waterline and bands rolling in toward it.
          float shoreW = 0.00045;
          float zone = 1.0 - smoothstep(0.0, shoreW, d);
          float line = 1.0 - smoothstep(0.0, 0.00006, d);
          float waves = sin(d / shoreW * 9.0 - uTime * 1.3 + tNoise(P * 300.0) * 6.0);
          float broken = 0.45 + 0.55 * tNoise(P * 900.0 + vec3(uTime * 0.08, 0.0, -uTime * 0.06));
          foam = max(line * mix(0.35, 0.85, open), zone * smoothstep(0.55, 0.95, waves) * broken * 0.65 * open * tFade(300.0));
          foam = max(foam, streak * 0.55);
          col = mix(col, vec3(0.93, 0.97, 1.0), foam);
          alpha = max(alpha, foam);

          // Hex grid, drawn on the surface where the ground's would be hidden.
          float fw = fwidth(vRing);
          float grid = (1.0 - smoothstep(0.0, fw * 1.5, 1.0 - vRing)) * (1.0 - smoothstep(0.05, 0.16, fw));
          col *= 1.0 - 0.15 * grid * uGrid;

          // Remembered but not in sight: grayed and darker, like the ground.
          col = mix(col, vec3(dot(col, vec3(0.333))), 0.6 * vDim) * (1.0 - 0.5 * vDim);
          diffuseColor = vec4(col, alpha);
          // Debug water view: blue = sea or lake, teal = river, magenta =
          // wetland pool; red where the surface steps (faster than a river may fall).
          if (uView > 1.5) {
            vec3 sc = vSrc < 0.5 ? vec3(0.15, 0.4, 1.0) : vSrc < 1.5 ? vec3(0.1, 0.85, 0.7) : vec3(0.9, 0.3, 0.9);
            diffuseColor = vec4(mix(sc, vec3(1.0, 0.0, 0.0), smoothstep(0.8, 1.2, vStep)), 0.9);
            foam = 0.0;
          }
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.24, 0.7, foam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // The waves: the surface's normal from their height.
          normal = tPerturb(-vViewPosition, normal, waveHeight(vObjPos));
        }`)
      .replace('#include <opaque_fragment>', `{
          // The sky's reflection, by where each wave's face throws the eye's
          // ray: pale and bright toward the horizon, deeper overhead; strong
          // where the face is seen at a grazing angle (Fresnel). On rippled
          // water every wave has faces turned to the horizon and faces
          // turned up: the light breaks into streaks and flecks.
          vec3 V = normalize(vViewPosition), up = normalize(mat3(viewMatrix) * normalize(vObjPos));
          float fres = (0.03 + 0.97 * pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 5.0)) * (1.0 - foam);
          float elev = dot(reflect(-V, normal), up);
          vec3 sky = mix(uSky * 0.85, uSky * vec3(0.2, 0.32, 0.55), smoothstep(0.0, 0.6, elev));
          // (Never all sky: far off, seen flat, the water keeps its own colour under the sheen.)
          outgoingLight = grade(mix(outgoingLight, sky, min(0.45, fres * 1.4)), 0.95);
          diffuseColor.a = max(diffuseColor.a, min(1.0, fres * 2.2)) * (1.0 - smoothstep(0.0, 0.5, vFog));
        }
        #include <opaque_fragment>`);
  };
  return { material: mat, setTime: (s) => { uTime.value = s; }, setGrid: (on) => { uGrid.value = on ? 1 : 0; }, setView: (m) => { uView.value = m; } };
}

// The water's depth alone, no colour: the surface is drawn see-through
// and so writes no depth itself, and what is drawn after it (borders,
// labels' lines, smoke) showed through the sea from beyond the horizon,
// hidden only by the sea bed. A twin of each water mesh with this material,
// drawn last of the opaque things (so nothing under the water is lost),
// hides them as the surface would: past the shallows only, WATER_OCCLUDER_SUNK
// under the surface (its twin drawn that much smaller: the water and the
// borders lying on it stand clear above it, the bed of water that deep
// below), and not under the fog of war (no water is drawn there). Only
// while the view is near enough to tilt toward a horizon (render.ts):
// from afar there is none to see past, and so thin a gap would flicker.
export const WATER_OCCLUDER_FROM = 0.0008, WATER_OCCLUDER_SUNK = 0.0004;
export function makeWaterOccluder(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    colorWrite: false,
    vertexShader: /* glsl */ `
      attribute float depth;
      attribute float unexplored;
      varying float vDepth;
      varying float vFog;
      void main() { vDepth = depth; vFog = unexplored; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying float vDepth;
      varying float vFog;
      void main() { if (vDepth < ${WATER_OCCLUDER_FROM} || vFog > 0.25) discard; gl_FragColor = vec4(0.0); }`,
  });
}
