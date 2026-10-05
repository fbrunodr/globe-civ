import * as THREE from 'three';
import { mulberry32 } from './rng.ts';

// The terrain material: three's MeshStandardMaterial with extra shader code.
// The look comes from the basics (the painting, the relief, the props); the
// shader keeps its own effects few and cheap.
//
// Materials come from the terrain painting (paint.ts): each pixel mixes the
// rows of up to four tiles from the tile table. Tile table rows (TILE_ROWS
// texels each):
//   0 color.rgb, wet        (wet: 1 on water -> glossy, animated ripples)
//   1 detail                (grain, patch, strata, dunes) -> procedural surface painting
//   2 patchColor.rgb, bump  (blotches drawn by detail.y: pools, coral, kelp)
//   3 rock.rgb, amount      (the biome's bare rock, shown where the ground is steep)
//   4 snow.rgb, beach       (snow as this tile shows it; sandy shores)
//   5 shallow, group        (clear shallows; tiles of one group look alike)
// Fan table rows (FAN_ROWS texels):
//   0 ids (t, A, B, C)
//   1 rounding of edges i-1, i, i+1 and A|B
//   2 rounding of B|C, river strength of edges i-1, i, i+1
//   3 warp share of edges i-1, i, i+1 and A|B
//   4 warp share of B|C
//
// Per-vertex attributes:
//   ring        0 at a tile center, 1 on its edge -> hex grid line
//   unexplored  1 under fog of war -> flat dark fog, no lighting
//   shade       baked ambient occlusion and tint
//   snow        snow cover on peaks
//   pc0, pc1    warped distances to the fan's 5 boundaries (fanCoords in
//               paint.ts) and the fan id
//
// Noise comes from a small tiling 3D texture (one fetch per octave), sampled
// at the object-space position, so it wraps the sphere without seams.

export const TEX_W = 2048;
export const TILE_ROWS = 6;
export const FAN_ROWS = 5;
const NOISE_SIZE = 64;

const NOISE = /* glsl */ `
float tNoise(vec3 x) { return texture(uNoise, x * ${(1 / NOISE_SIZE).toFixed(8)}).r; }
float tFbm(vec3 p, int octaves) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    if (i >= octaves) break;
    s += a * tNoise(p);
    p = p * 2.03 + 1.7;
    a *= 0.5;
  }
  return s / (1.0 - 2.0 * a); // normalized to [0, 1]
}

// ---- painting (mirror of paintAt in paint.ts, plus a GPU-only fine wiggle) ----
vec4 tileRow(int t, int k) { int i = t * ${TILE_ROWS} + k; return texelFetch(uTileTex, ivec2(i % ${TEX_W}, i / ${TEX_W}), 0); }
vec4 fanRow(int f, int k) { int i = f * ${FAN_ROWS} + k; return texelFetch(uFanTex, ivec2(i % ${TEX_W}, i / ${TEX_W}), 0); }
vec4 paintWeights(int fan, vec3 P, vec4 ids, out vec3 sEdge, out vec4 soft) {
  vec3 s = vPc0.xyz;
  vec4 r1 = fanRow(fan, 1);
  sEdge = s;
  soft = vec4(1.0, 0.0, 0.0, 0.0);
  if (s.x >= r1.x + uFine && s.y >= r1.y + uFine && s.z >= r1.z + uFine) return soft;
  vec4 r2 = fanRow(fan, 2), r3 = fanRow(fan, 3), r4 = fanRow(fan, 4);
  float fine = clamp((tNoise(P * uFineFreq) - 0.5) * 3.0, -1.0, 1.0) * uFine;
  s += r3.xyz * fine * vec3(ids.x < ids.y ? 1.0 : -1.0, ids.x < ids.z ? 1.0 : -1.0, ids.x < ids.w ? 1.0 : -1.0);
  float uL = (vPc0.w + r3.w * fine * (ids.z < ids.y ? 1.0 : -1.0)) / r1.w;
  float uR = (vPc1.x + r4.x * fine * (ids.z < ids.w ? 1.0 : -1.0)) / r2.x;
  sEdge = s;
  vec3 c = smoothstep(-1.0, 1.0, -s / r1.xyz);
  vec4 w = vec4(
    (1.0 - c.x) * (1.0 - c.y) * (1.0 - c.z),
    c.x * smoothstep(-1.0, 1.0, -uL),
    c.y * smoothstep(-1.0, 1.0, uL) * smoothstep(-1.0, 1.0, uR),
    c.z * smoothstep(-1.0, 1.0, -uR));
  float total = w.x + w.y + w.z + w.w;
  if (total < 1e-9) return vec4(1.0, 0.0, 0.0, 0.0);
  w /= total;
  soft = w;
  // Sharpen groups against each other (sharpen() in paint.ts).
  vec4 g = vec4(tileRow(int(ids.x), 5).y, tileRow(int(ids.y), 5).y, tileRow(int(ids.z), 5).y, tileRow(int(ids.w), 5).y);
  vec4 S = vec4(
    dot(w, vec4(equal(g, vec4(g.x)))), dot(w, vec4(equal(g, vec4(g.y)))),
    dot(w, vec4(equal(g, vec4(g.z)))), dot(w, vec4(equal(g, vec4(g.w)))));
  vec4 S2 = S * S;
  vec4 q = w / max(S, vec4(1e-9)) * S2 * S2 * S2;
  return q / dot(q, vec4(1.0));
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

export interface PaintUniforms {
  tileTex: THREE.DataTexture;
  fanTex: THREE.DataTexture;
  r0: number;       // tile inner radius (radians)
  fine: number;     // fine wiggle amplitude (radians)
  fineFreq: number; // fine wiggle frequency (noise cells per radian)
}

// A float RGBA texture TEX_W wide holding `texels` texels, read with texelFetch.
export function makeTable(texels: number): THREE.DataTexture {
  const h = Math.max(1, Math.ceil(texels / TEX_W));
  const tex = new THREE.DataTexture(new Float32Array(TEX_W * h * 4), TEX_W, h, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Tiling value noise: random values on a 64³ lattice, interpolated by the GPU.
function makeNoiseTexture(): THREE.Data3DTexture {
  const rand = mulberry32(0x5eed);
  const data = new Uint8Array(NOISE_SIZE ** 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  const tex = new THREE.Data3DTexture(data, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export function makeTerrainMaterial(paint: PaintUniforms): TerrainMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const uTime = { value: 0 };
  const noise = makeNoiseTexture();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uTime;
    shader.uniforms['uTileTex'] = { value: paint.tileTex };
    shader.uniforms['uFanTex'] = { value: paint.fanTex };
    shader.uniforms['uNoise'] = { value: noise };
    shader.uniforms['uR0'] = { value: paint.r0 };
    shader.uniforms['uFine'] = { value: paint.fine };
    shader.uniforms['uFineFreq'] = { value: paint.fineFreq };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float ring;
        attribute float unexplored;
        attribute float shade;
        attribute float snow;
        attribute vec4 pc0;
        attribute vec2 pc1;
        varying vec4 vPc0;
        varying vec2 vPc1;
        varying vec3 vObjNormal;
        varying float vRing;
        varying float vFog;
        varying float vShade;
        varying float vSnow;
        varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRing = ring; vFog = unexplored; vShade = shade; vSnow = snow;
        vPc0 = pc0; vPc1 = pc1;
        vObjPos = position; vObjNormal = normal;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform highp sampler2D uTileTex;
        uniform highp sampler2D uFanTex;
        uniform highp sampler3D uNoise;
        uniform float uR0;
        uniform float uFine;
        uniform float uFineFreq;
        varying vec4 vPc0;
        varying vec2 vPc1;
        varying float vRing;
        varying float vFog;
        varying float vShade;
        varying float vSnow;
        varying vec3 vObjPos;
        varying vec3 vObjNormal;
        float tLod;
        float gridLine;
        float waterMask;
        float duneWave;
        float vWet;
        vec4 vDetail;
        float vBump;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 P = vObjPos;
          tLod = length(fwidth(P)); // world units per pixel

          // The painting: mix the materials of the tiles that reach this pixel.
          int fan = int(round(vPc1.y));
          vec4 ids = fanRow(fan, 0);
          vec3 sEdge;
          vec4 soft;
          vec4 w = paintWeights(fan, P, ids, sEdge, soft);
          vec4 m0 = vec4(0.0), m1 = vec4(0.0), m2 = vec4(0.0), m3 = vec4(0.0), m4 = vec4(0.0), m5 = vec4(0.0);
          for (int k = 0; k < 4; k++) {
            if (w[k] > 0.001) {
              int tt = int(ids[k]);
              m0 += w[k] * tileRow(tt, 0); m1 += w[k] * tileRow(tt, 1); m2 += w[k] * tileRow(tt, 2);
              m3 += w[k] * tileRow(tt, 3); m4 += w[k] * tileRow(tt, 4); m5 += w[k] * tileRow(tt, 5);
            }
          }
          float wsum = w.x * step(0.001, w.x) + w.y * step(0.001, w.y) + w.z * step(0.001, w.z) + w.w * step(0.001, w.w);
          m0 /= wsum; m1 /= wsum; m2 /= wsum; m3 /= wsum; m4 /= wsum; m5 /= wsum;
          vDetail = m1; vBump = m2.a;
          vec4 vRock = m3;
          // Wetness and coast data come from the soft (unsharpened) weights, so
          // shores keep a gradient for beaches and foam.
          vWet = 0.0;
          vec2 vCoast = vec2(0.0);
          for (int k = 0; k < 4; k++) {
            if (soft[k] > 0.001) {
              int tt = int(ids[k]);
              vWet += soft[k] * tileRow(tt, 0).a;
              vCoast += soft[k] * vec2(tileRow(tt, 4).a, tileRow(tt, 5).x);
            }
          }
          diffuseColor.rgb = mix(m0.rgb, m4.rgb, vSnow) * vShade;
          // Open water darkens smoothly with depth.
          float depth = smoothstep(-0.0045, -0.0105, length(P) - 1.0) * smoothstep(0.5, 0.9, vWet);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.62, 0.78), depth);
          float land = 1.0 - smoothstep(0.45, 0.55, vWet);

          // River banks: a strip of greener, damper ground along the river's curve.
          float bank = 0.0;
          vec4 river = fanRow(fan, 2);
          for (int j = 0; j < 3; j++) {
            float bw = uR0 * (0.12 + 0.1 * river[j + 1]);
            bank = max(bank, step(0.001, river[j + 1]) * (1.0 - smoothstep(bw, bw * 2.2, abs(sEdge[j]))));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.2, 0.035) * vShade, bank * 0.75 * land * (1.0 - vSnow));

          // Grain: fine speckle plus medium-scale patchiness.
          float grain = (tFbm(P * 380.0, 2) - 0.5) * tFade(380.0);
          float patchy = tNoise(P * 70.0) - 0.5;
          diffuseColor.rgb *= 1.0 + vDetail.x * (0.4 * grain + 0.3 * patchy);

          // Dunes: warped ripples.
          duneWave = 0.0;
          if (vDetail.w > 0.01) {
            duneWave = sin(dot(P, vec3(0.31, 0.88, 0.36)) * 900.0 + tNoise(P * 40.0) * 10.0) * tFade(900.0);
            diffuseColor.rgb *= 1.0 + vDetail.w * 0.1 * duneWave;
          }

          // Strata: bands by altitude plus contour lines of a noise field.
          if (vDetail.z > 0.01) {
            float strata = sin((length(P) - 1.0) * 2600.0 + tNoise(P * 45.0) * 28.0) * tFade(500.0);
            diffuseColor.rgb *= 1.0 + vDetail.z * 0.16 * strata;
          }

          // Patches: pools, coral, kelp.
          float pm = 0.0;
          if (vDetail.y > 0.01) {
            pm = smoothstep(0.5, 0.58, tFbm(P * 140.0 + 3.1, 2)) * clamp(vDetail.y * 1.4, 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, m2.rgb, pm);
          }
          waterMask = max(vWet, pm * 0.6);

          // Rock follows the relief, not the tiles: steep slopes show it where the
          // tile allows (vRock.a), anything high enough shows it on its slopes,
          // and mountain crests are bare whatever their slope.
          float rock = 0.0;
          if (land > 0.0) {
            float steep = 1.0 - dot(normalize(vObjNormal), normalize(P));
            float alt = length(P) - 1.0;
            float allow = max(vRock.a, smoothstep(0.016, 0.026, alt));
            float alpine = smoothstep(0.026, 0.036, alt);
            rock = max(smoothstep(0.04, 0.09, steep) * allow, alpine) * land * (1.0 - 0.8 * vSnow) * (1.0 - bank);
            diffuseColor.rgb = mix(diffuseColor.rgb, vRock.rgb * (0.88 + 0.24 * patchy), rock * 0.8);
          }

          // Coasts: a sand strip on the land side of sandy shores; on the water
          // side, lighter turquoise and a broken, slowly drifting line of foam.
          if (vWet > 0.12 && vWet < 0.995) {
            float sandEdge = 0.2 + 0.12 * tNoise(P * 120.0 + 9.0);
            float sand = smoothstep(sandEdge, sandEdge + 0.08, vWet) * (1.0 - smoothstep(0.48, 0.52, vWet)) * smoothstep(0.75, 0.95, vCoast.x);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.71, 0.40) * (0.95 + 0.1 * grain), sand * (1.0 - rock));
            float shore = smoothstep(0.97, 0.6, vWet) * step(0.5, vWet);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + vec3(0.03, 0.08, 0.08), shore * 0.6);
            float foamEdge = 0.6 + 0.22 * tFbm(P * 150.0 + vec3(uTime * 0.03, 0.0, -uTime * 0.02), 2);
            float foamBand = smoothstep(foamEdge, foamEdge - 0.1, vWet) * smoothstep(0.5, 0.53, vWet);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.98, 1.0), foamBand * tFade(150.0) * 0.7);
          }

          // Hex grid: a thin anti-aliased line where ring reaches 1.
          float fw = fwidth(vRing);
          gridLine = 1.0 - smoothstep(0.0, fw * 1.5, 1.0 - vRing);
          gridLine *= 1.0 - smoothstep(0.05, 0.16, fw);
          diffuseColor.rgb *= 1.0 - 0.18 * gridLine;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(1.0, 0.6, waterMask);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Bumps on land, slow drifting ripples on water. No branches here:
          // the bump needs screen derivatives.
          vec3 P = vObjPos;
          float h = vBump * 0.00045 * (tFbm(P * 260.0, 2) - 0.5) * tFade(260.0)
                  + vDetail.w * 0.00012 * duneWave
                  + waterMask * 0.00006 * (tNoise(P * 420.0 + vec3(uTime * 0.12, -uTime * 0.08, uTime * 0.05)) - 0.5) * tFade(420.0);
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
