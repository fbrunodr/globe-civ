import * as THREE from 'three';

// The air around the planet.
//   - Haze (aerial perspective): the air thins out with height (scale height
//     AIR.scale), and what you see is veiled by the amount of air the view ray
//     crosses. Looking down from up high stays clear; the horizon turns blue
//     and hazy; on the ground, near things are crisp and far ones fade.
//   - Sky: seen from near the ground, a gradient from a pale horizon to a
//     deeper blue overhead with a glow around the sun. It thins out as the
//     camera rises, until only black space and stars remain.
//   - Halo: seen from orbit, a thin glowing shell around the planet's limb,
//     brighter on the sunny side. It fades in as the sky fades out.

// The sky seen from near the ground: a gradient from a pale horizon to a
// deeper blue overhead, with a glow around the sun. It fades in as the
// camera comes down (space stays black from orbit). Drawn first, behind
// everything (first among the opaque objects, without depth), on a sphere
// that follows the camera; it blends toward space itself, so it needs no
// transparency.
export function makeSky(): { mesh: THREE.Mesh; update(camera: THREE.Camera, sunDir: THREE.Vector3, alt: number): void } {
  const uniforms = {
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uDip: { value: 0 },    // sine of how far the horizon lies below level
    uThick: { value: 10 }, // how far up from the horizon the sky reaches (sine of elevation)
    uAmount: { value: 0 },
    uSpace: { value: new THREE.Color(0x04050a) },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uUp;
        uniform vec3 uSun;
        uniform float uDip;
        uniform float uThick;
        uniform float uAmount;
        uniform vec3 uSpace;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          // Elevation above the horizon (which dips as the camera rises).
          float e = max(dot(d, uUp) + uDip, 0.0);
          // (A pale horizon a touch greyer, toward the distance haze; a deep
          // blue overhead.)
          vec3 horizon = vec3(0.732, 0.818, 0.912), zenith = vec3(0.284, 0.492, 0.832);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, e / max(1.0, uThick * 0.1)));
          float s = max(dot(d, uSun), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
          float band = exp(-e / uThick) * uAmount;
          gl_FragColor = vec4(mix(uSpace, col, band), 1.0);
        }`,
    }),
  );
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    // alt: the camera's height above sea level. On the ground the whole sky is
    // blue; higher up, a band over the horizon that thins out into space.
    update(camera, sunDir, alt) {
      const r = camera.position.length();
      mesh.position.copy(camera.position);
      uniforms.uUp.value.copy(camera.position).normalize();
      uniforms.uSun.value.copy(sunDir);
      uniforms.uDip.value = Math.sqrt(Math.max(0, 1 - 1 / (r * r)));
      const h = alt / AIR.height;
      const k = smoothstep(0.008, 0.4, h);
      uniforms.uThick.value = 10 * Math.pow(0.004, k); // 10 on the ground, 0.04 high up
      uniforms.uAmount.value = 1 - smoothstep(0.4, 1.2, h);
      mesh.visible = uniforms.uAmount.value > 0.001;
    },
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const HAZE = new THREE.Color(0.66, 0.78, 0.93);

// How tall the atmosphere is: the haze's scale height, the halo, how high
// the sky reaches and the cloud layer's height all follow it.
export const AIR = { height: 0.85, scale: 0.02 * 0.85 };
export const HAZE_DENSITY = 2.3; // veil per unit of air crossed at sea level density

// Optical depth (amount of air) along the straight path from a to b, with the
// air thinning exponentially with height above sea level.
export function airGLSL(): string {
  return /* glsl */ `
float airDepth(vec3 a, vec3 b) {
  float H = ${AIR.scale.toFixed(5)};
  float ha = max(length(a) - 1.0, 0.0), hb = max(length(b) - 1.0, 0.0);
  float L = distance(a, b), dh = hb - ha;
  return abs(dh) > 1e-6 ? L * (exp(-ha / H) - exp(-hb / H)) / (dh / H) : L * exp(-ha / H);
}`;
}

// The distance haze over the board and walking (the haze above is the
// planet's atmosphere seen from high up, and fades out down here). It is
// measured in camera heights, so it looks the same at every zoom: nothing
// within about DISTANCE_HAZE.start heights is veiled (looking down, the
// board keeps its colours), and further out the land pales and greys toward
// DISTANCE_HAZE.color, up to DISTANCE_HAZE.most at the horizon of a tilted
// view. It fades out as the camera rises past DISTANCE_HAZE.fade (camera
// heights above sea level, world units), where the atmosphere takes over.
const DISTANCE_HAZE = {
  color: new THREE.Color(0.7, 0.77, 0.84),
  start: 1.75, scale: 3, most: 0.15, grey: 0.5,
  fade: [0.15, 0.4] as const, minHeight: 0.002,
};
function distanceHazeGLSL(): string {
  const H = DISTANCE_HAZE, f = (x: number) => x.toFixed(4), c = H.color;
  return /* glsl */ `{
    float camH = max(length(cameraPosition) - 1.0, ${f(H.minHeight)});
    float past = max(distance(cameraPosition, vFogWorld) - ${f(H.start)} * camH, 0.0);
    float haze = (1.0 - exp(-past / (${f(H.scale)} * camH))) * ${f(H.most)} * (1.0 - smoothstep(${f(H.fade[0])}, ${f(H.fade[1])}, camH));
    // (Greyer first, then paler: distant colours lose their saturation.)
    float lum = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum), haze * ${f(H.grey)});
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)}), haze);
  }`;
}

// Replaces three's fog with the haze above, for every material that uses
// fog (FogExp2: color = HAZE, density = HAZE_DENSITY). Call before building
// materials.
export function installHaze(): void {
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${airGLSL()}
#endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * airDepth(cameraPosition, vFogWorld));
  #else
    float fogFactor = smoothstep(fogNear, fogFar, distance(cameraPosition, vFogWorld));
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  ${distanceHazeGLSL()}
#endif`;
}

// The halo: a sphere around the planet drawn from inside (back faces); each
// pixel glows by how close its view ray passes to the surface, so the glow
// hugs the limb and falls off into space. The planet hides the part behind it.
const HALO_R = 1.18;

export function makeHalo(): { mesh: THREE.Mesh; update(sunDir: THREE.Vector3, amount: number): void } {
  const uniforms = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uAmount: { value: 1 } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(HALO_R, 64, 32),
    new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        uniform float uAmount;
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld - cameraPosition);
          // Closest point of the view ray to the planet's center.
          float s = max(0.0, -dot(cameraPosition, dir));
          vec3 p = cameraPosition + dir * s;
          float d = length(p);
          float glow = exp(-max(d - 1.0, 0.0) / ${(1.75 * AIR.scale).toFixed(4)});
          float sun = 0.5 + 0.5 * dot(p / d, uSun);
          vec3 col = mix(vec3(0.25, 0.45, 1.0), vec3(0.55, 0.78, 1.0), sun);
          gl_FragColor = vec4(col * glow * (0.25 + 0.95 * sun) * uAmount, 1.0);
        }`,
    }),
  );
  return {
    mesh,
    update(sunDir, amount) {
      uniforms.uSun.value.copy(sunDir);
      uniforms.uAmount.value = amount;
      mesh.visible = amount > 0.001;
    },
  };
}
