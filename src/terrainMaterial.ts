import * as THREE from 'three';

// The terrain material: three's MeshStandardMaterial with extra shader code.
//
// Per-vertex attributes it reads (blended across tile edges):
//   ring        0 at a tile center, 1 on its edge -> hex grid line
//   wet         1 on water -> glossy, animated ripples
//   unexplored  1 under fog of war -> flat dark fog, no lighting
//   detail      (grain, patch, strata, dunes) -> procedural surface painting
//   bump        strength of the procedural bump
//   patchColor  color of the blotches drawn by detail.y (pools, coral, kelp)
//   coast       (beach, shallow): sandy shores, and caustics in clear shallows
//
// Patterns are 3D value noise sampled at the object-space position, so they
// wrap the sphere without seams, and fade out with distance to avoid shimmer.

const NOISE = /* glsl */ `
float tHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float tNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(tHash(i), tHash(i + vec3(1, 0, 0)), f.x), mix(tHash(i + vec3(0, 1, 0)), tHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(tHash(i + vec3(0, 0, 1)), tHash(i + vec3(1, 0, 1)), f.x), mix(tHash(i + vec3(0, 1, 1)), tHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float tFbm(vec3 p, int octaves) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    s += a * tNoise(p);
    p = p * 2.03 + 1.7;
    a *= 0.5;
  }
  return s;
}
// 1 when a pattern of this frequency is well resolved on screen, 0 when it would alias.
float tFade(float freq) { return 1.0 - smoothstep(0.35, 0.9, tLod * freq); }

// Bump mapping (Mikkelsen 2010) with unnormalized screen derivatives, so the
// height h is in world units and bump strength does not change with zoom.
vec3 tPerturb(vec3 surfPos, vec3 n, float h) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

export interface TerrainMaterial {
  material: THREE.MeshStandardMaterial;
  setTime(seconds: number): void;
}

export function makeTerrainMaterial(): TerrainMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float ring;
        attribute float wet;
        attribute float unexplored;
        attribute vec4 detail;
        attribute float bump;
        attribute vec3 patchColor;
        attribute vec2 coast;
        varying vec2 vCoast;
        varying vec3 vObjNormal;
        varying float vRing;
        varying float vWet;
        varying float vFog;
        varying vec4 vDetail;
        varying float vBump;
        varying vec3 vPatchColor;
        varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRing = ring; vWet = wet; vFog = unexplored; vDetail = detail; vBump = bump;
        vPatchColor = patchColor; vObjPos = position; vCoast = coast; vObjNormal = normal;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying float vRing;
        varying float vWet;
        varying float vFog;
        varying vec4 vDetail;
        varying float vBump;
        varying vec3 vPatchColor;
        varying vec3 vObjPos;
        varying vec2 vCoast;
        varying vec3 vObjNormal;
        float tLod;
        float gridLine;
        float waterMask;
        float duneWave;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 P = vObjPos;
          tLod = length(fwidth(P)); // world units per pixel

          // Grain: fine speckle plus medium-scale patchiness.
          float grain = (tFbm(P * 380.0, 3) - 0.5) * tFade(380.0);
          float patchy = tFbm(P * 70.0, 3) - 0.5;
          diffuseColor.rgb *= 1.0 + vDetail.x * (0.4 * grain + 0.25 * patchy);

          // Dunes: warped ripples.
          duneWave = sin(dot(P, vec3(0.31, 0.88, 0.36)) * 900.0 + tFbm(P * 40.0, 2) * 10.0) * tFade(900.0);
          diffuseColor.rgb *= 1.0 + vDetail.w * 0.1 * duneWave;

          // Strata: bands by altitude plus contour lines of a noise field, so
          // layered rock shows on flat ground (badlands) as well as on slopes.
          float strata = sin((length(P) - 1.0) * 2600.0 + tFbm(P * 45.0, 3) * 28.0) * tFade(500.0);
          diffuseColor.rgb *= 1.0 + vDetail.z * 0.16 * strata;

          // Patches: pools, coral, kelp.
          float pm = smoothstep(0.5, 0.56, tFbm(P * 140.0 + 3.1, 3)) * clamp(vDetail.y * 1.4, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vPatchColor, pm);
          waterMask = max(vWet, pm * 0.6);

          float land = 1.0 - smoothstep(0.45, 0.55, vWet);

          // Cliffs and bare rock wherever land is steep (coastal hills, mountain flanks).
          float steep = 1.0 - dot(normalize(vObjNormal), normalize(P));
          float rock = smoothstep(0.035, 0.08, steep) * land;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.33, 0.29) * (0.9 + 0.2 * patchy), rock * 0.75);

          // Beaches: a sand strip on the land side of sandy coasts, edge wobbling with noise.
          float sandEdge = 0.2 + 0.12 * tFbm(P * 120.0 + 9.0, 2);
          float sand = smoothstep(sandEdge, sandEdge + 0.08, vWet) * (1.0 - smoothstep(0.48, 0.52, vWet)) * smoothstep(0.75, 0.95, vCoast.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.71, 0.40) * (0.95 + 0.1 * grain), sand * (1.0 - rock));

          // Caustics: a faint moving web of light in clear shallow water.
          float web = 1.0 - abs(tFbm(P * 170.0 + vec3(uTime * 0.05, uTime * 0.03, 0.0), 2) * 2.0 - 1.0);
          float caustic = smoothstep(0.93, 0.99, web) * smoothstep(0.75, 1.0, vWet) * vCoast.y * tFade(170.0);
          diffuseColor.rgb += vec3(0.04, 0.06, 0.055) * caustic;

          // Shore: water just off a coast turns a lighter turquoise, with a
          // broken, slowly drifting line of foam along the land.
          float shore = smoothstep(0.97, 0.6, vWet) * step(0.5, vWet);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + vec3(0.03, 0.08, 0.08), shore * 0.6);
          // Foam: a soft band hugging the shore whose width wobbles with noise.
          float foamNoise = tFbm(P * 150.0 + vec3(uTime * 0.03, 0.0, -uTime * 0.02), 3);
          float foamEdge = 0.6 + 0.22 * foamNoise;
          float foamBand = smoothstep(foamEdge, foamEdge - 0.1, vWet) * smoothstep(0.5, 0.53, vWet);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.98, 1.0), foamBand * tFade(150.0) * 0.7);

          // Hex grid: a thin anti-aliased line where ring reaches 1.
          float fw = fwidth(vRing);
          gridLine = 1.0 - smoothstep(0.0, fw * 1.5, 1.0 - vRing);
          gridLine *= 1.0 - smoothstep(0.08, 0.25, fw);
          diffuseColor.rgb *= 1.0 - 0.18 * gridLine;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(1.0, 0.6, waterMask);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 P = vObjPos;
          float h = vBump * 0.00045 * (tFbm(P * 260.0, 3) - 0.5) * tFade(260.0)
                  + vDetail.w * 0.00012 * duneWave;
          // Water: slow drifting ripples.
          h += waterMask * 0.00006 * (tFbm(P * 420.0 + vec3(uTime * 0.12, -uTime * 0.08, uTime * 0.05), 2) - 0.5) * tFade(420.0);
          normal = tPerturb(-vViewPosition, normal, h);
        }`)
      .replace('#include <opaque_fragment>', `{
          vec3 fogCol = vec3(0.012, 0.016, 0.026) * (1.0 + 0.6 * gridLine);
          outgoingLight = mix(outgoingLight, fogCol, smoothstep(0.0, 1.0, vFog));
        }
        #include <opaque_fragment>`);
  };
  return { material: mat, setTime: (s) => { uTime.value = s; } };
}
