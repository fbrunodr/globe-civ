import * as THREE from 'three';
import { mulberry32 } from './rng.ts';
import type { ImprovementKey } from './cities.ts';

// The terrain material: three's MeshStandardMaterial with extra shader code.
// The look comes from the basics (the painting, the relief, the props); the
// shader keeps its own effects few and cheap.
//
// Materials come from the terrain painting (paint.ts): each pixel mixes the
// rows of up to four tiles from the tile table. Tile table rows (TILE_ROWS
// texels each):
//   0 color.rgb, wet        (water tiles: the bed's color; wet: 1 on open water)
//   1 detail                (grain, patch, strata, dunes) -> procedural surface painting
//   2 patchColor.rgb, bump  (blotches drawn by detail.y: coral, kelp, tussocks, moss)
//   3 rock.rgb, amount      (the biome's bare rock, shown where the ground is steep)
//   4 snow.rgb, beach       (snow as this tile shows it; sandy shores)
//   5 urban, group, improvement, center   (city ground, see CITY_GLSL; urban:
//                           1 on urban and center tiles; improvement: IMPROVEMENT_CODE)
//   6 owner.rgb, owned      (the owner's color: a tint seen only from afar)
// Fan table rows (FAN_ROWS texels):
//   0 ids (t, A, B, C)
//   1 rounding of edges i-1, i, i+1 and A|B
//   2 rounding of B|C, river strength of edges i-1, i, i+1
//   3 warp share of edges i-1, i, i+1 and A|B
//   4 warp share of B|C, look similarity B|C and A|C
//   5 look similarity t|A, t|B, t|C, A|B (1 = same group)
//
// Per-vertex attributes:
//   ring        0 at a tile center, 1 on its edge -> hex grid line
//   unexplored  1 under fog of war -> flat dark fog, no lighting
//   shade       baked ambient occlusion and tint
//   snow        snowline altitude (height above radius 1; NO_SNOW where none)
//   depth       water level minus ground height (> 0 under water; the water
//               surface itself is its own mesh, see water.ts)
//   bank        1 beside a river, fading away from it
//   shore       1 on a sea or lake shore's beach strip (and under the water)
//   pc0, pc1    warped distances to the fan's 5 boundaries (fanCoords in
//               paint.ts) and the fan id
//
// Noise comes from a small tiling 3D texture (one fetch per octave), sampled
// at the object-space position, so it wraps the sphere without seams.

export const TEX_W = 2048;
export const TILE_ROWS = 7;
export const FAN_ROWS = 6;
const NOISE_SIZE = 64;

// Noise and bump helpers, shared with the water shader (needs uNoise and tLod).
// Color grade shared by terrain, water and props: everything in sight loses
// some saturation, so the world reads natural rather than cartoonish.
// grade(c, s) keeps share s of the saturation: ground 0.72, props (whose
// leaves would otherwise read lime) 0.6 and a little darker.
export const GRADE_GLSL = /* glsl */ `
vec3 grade(vec3 c, float s) { return mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, s); }
`;

export const NOISE_GLSL = /* glsl */ `
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

const PAINT_GLSL = /* glsl */ `
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
  float fine = clamp((tFbm(P * uFineFreq, 3) - 0.5) * 3.2, -1.0, 1.0) * uFine;
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
  // Sharpen unlike looks against each other (sharpen() in paint.ts).
  vec4 m = fanRow(fan, 5); // t|A, t|B, t|C, A|B; r4.yz = B|C, A|C
  vec4 S = vec4(
    dot(w, vec4(1.0, m.x, m.y, m.z)),
    dot(w, vec4(m.x, 1.0, m.w, r4.z)),
    dot(w, vec4(m.y, m.w, 1.0, r4.y)),
    dot(w, vec4(m.z, r4.z, r4.y, 1.0)));
  vec4 S2 = S * S;
  vec4 q = w * S2 * S2 * S; // w · S^(SHARPEN-1), SHARPEN = 6
  return q / dot(q, vec4(1.0));
}
`;

// City ground: urban ground with winding streets, and the rural
// improvements painted over the biome (field patchworks, spoil, cut stone,
// clearings, paddies). Masks come from the soft painting weights plus noise,
// so their edges are organic like the painting's, never hexes.
const CITY_GLSL = /* glsl */ `
float cHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// Rectangular plots in a local tangent frame (size in tile radii); plots of a
// region share one of three orientations. Returns the plot's hash; f is the
// position inside the plot (0..1) and edge the distance to its border (tile radii).
float cPlots(vec3 P, vec2 size, float salt, out vec2 f, out float edge) {
  // Plane coordinates from the two world axes most across the surface here.
  vec3 an = abs(P);
  vec2 uv = (an.y > an.x && an.y > an.z ? P.xz : an.x > an.z ? P.yz : P.xy) / uR0;
  float region = floor(tNoise(P / (2.5 * uR0) + salt) * 3.0);
  float a = 0.35 + region * 0.95;
  uv = mat2(cos(a), -sin(a), sin(a), cos(a)) * uv;
  vec2 c = uv / size;
  // Rows are staggered, and some plots are split into strips, so the plots
  // never line up into a grid.
  c.x += cHash(vec2(floor(c.y), salt + 3.0)) * 3.0;
  vec2 id = floor(c);
  f = c - id;
  vec2 sz = size;
  float h0 = cHash(id + region * 37.0 + salt);
  if (h0 > 0.55) {
    float k = h0 > 0.82 ? 3.0 : 2.0;
    id = id * 4.0 + vec2(floor(f.x * k), 0.0);
    f.x = fract(f.x * k);
    sz.x /= k;
  }
  vec2 e = min(f, 1.0 - f) * sz;
  edge = min(e.x, e.y);
  return cHash(id + region * 37.0 + salt + 0.5);
}
`;

// A pillaged rural tile (burnt fields until repaired).
export const BURNT_CODE = 7;
export const IMPROVEMENT_CODE = { none: 0, farm: 1, mine: 2, camp: 3, quarry: 4, wetland: 5, boats: 6 } as const satisfies Record<ImprovementKey | 'none', number>;

export interface TerrainMaterial {
  material: THREE.MeshStandardMaterial;
  setTime(seconds: number): void;
  setGrid(on: boolean): void; // the hex grid lines (fog of war shows them regardless)
  setView(mode: number): void; // debug views: 0 normal, 1 height map, 2 water (ground grayed)
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
let noiseTex: THREE.Data3DTexture | null = null;
export function noiseTexture(): THREE.Data3DTexture {
  noiseTex ??= makeNoiseTexture();
  return noiseTex;
}
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
  const uGrid = { value: 0 };
  const uView = { value: 0 };
  const noise = noiseTexture();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uTime;
    shader.uniforms['uTileTex'] = { value: paint.tileTex };
    shader.uniforms['uFanTex'] = { value: paint.fanTex };
    shader.uniforms['uNoise'] = { value: noise };
    shader.uniforms['uR0'] = { value: paint.r0 };
    shader.uniforms['uFine'] = { value: paint.fine };
    shader.uniforms['uFineFreq'] = { value: paint.fineFreq };
    shader.uniforms['uGrid'] = uGrid;
    shader.uniforms['uView'] = uView;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float ring;
        attribute float unexplored;
        attribute float shade;
        attribute float snow;
        attribute float depth;
        attribute float bank;
        attribute float shore;
        attribute vec4 pc0;
        attribute vec2 pc1;
        varying vec4 vPc0;
        varying vec2 vPc1;
        varying vec3 vObjNormal;
        varying float vRing;
        varying float vFog;
        varying float vShade;
        varying float vSnow;
        varying float vDepth;
        varying float vBank;
        varying float vShore;
        varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRing = ring; vFog = unexplored; vShade = shade; vSnow = snow; vDepth = depth; vBank = bank; vShore = shore;
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
        uniform float uGrid;
        uniform float uView;
        varying vec4 vPc0;
        varying vec2 vPc1;
        varying float vRing;
        varying float vFog;
        varying float vShade;
        varying float vSnow;
        varying float vDepth;
        varying float vShore;
        varying float vBank;
        varying vec3 vObjPos;
        varying vec3 vObjNormal;
        float tLod;
        float gridLine;
        float wetGround;
        float duneWave;
        float vWet;
        vec4 vDetail;
        float vBump;
        ${NOISE_GLSL}
        ${GRADE_GLSL}
        ${PAINT_GLSL}
        ${CITY_GLSL}`)
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
          vec4 m0 = vec4(0.0), m1 = vec4(0.0), m2 = vec4(0.0), m3 = vec4(0.0), m4 = vec4(0.0);
          for (int k = 0; k < 4; k++) {
            if (w[k] > 0.001) {
              int tt = int(ids[k]);
              m0 += w[k] * tileRow(tt, 0); m1 += w[k] * tileRow(tt, 1); m2 += w[k] * tileRow(tt, 2);
              m3 += w[k] * tileRow(tt, 3); m4 += w[k] * tileRow(tt, 4);
            }
          }
          float wsum = w.x * step(0.001, w.x) + w.y * step(0.001, w.y) + w.z * step(0.001, w.z) + w.w * step(0.001, w.w);
          m0 /= wsum; m1 /= wsum; m2 /= wsum; m3 /= wsum; m4 /= wsum;
          vDetail = m1; vBump = m2.a;
          vec4 vRock = m3;
          // Wetness and coast data come from the soft (unsharpened) weights, so
          // shores keep a gradient.
          vWet = 0.0;
          float vBeach = 0.0;
          for (int k = 0; k < 4; k++) {
            if (soft[k] > 0.001) {
              int tt = int(ids[k]);
              vWet += soft[k] * tileRow(tt, 0).a;
              vBeach += soft[k] * tileRow(tt, 4).a;
            }
          }
          // Snow: a crisp, ragged edge where the interpolated cover crosses one
          // half; it slides off steep faces (bare rock shows there).
          float steepness = 1.0 - dot(normalize(vObjNormal), normalize(P));
          float snowCover = 0.0;
          if (vSnow < 0.5) {
            float edge = length(P) - 1.0 - vSnow + 0.0016 * (tFbm(P * 260.0 + 5.3, 3) - 0.5);
            snowCover = smoothstep(-0.00015, 0.00015, edge) * (1.0 - smoothstep(0.16, 0.3, steepness));
          }
          diffuseColor.rgb = mix(m0.rgb, m4.rgb, snowCover) * vShade;
          // The owner's color, faintly, and only from afar: territory reads
          // at strategic zoom, the land keeps its own colors up close.
          {
            vec4 m6 = vec4(0.0);
            for (int k = 0; k < 4; k++) if (w[k] > 0.001) m6 += w[k] * tileRow(int(ids[k]), 6);
            m6 /= wsum;
            float far = smoothstep(0.3, 0.9, distance(cameraPosition, P));
            if (m6.a > 0.001) diffuseColor.rgb = mix(diffuseColor.rgb, m6.rgb / max(m6.a, 1e-3) * vShade, 0.12 * m6.a * far);
          }
          // Water is geometry: vDepth > 0 under the water surface (water.ts
          // draws the surface), < 0 above it.
          float under = smoothstep(0.0, 0.00015, vDepth);
          float dry = 1.0 - under;
          float above = -vDepth;

          // River banks: greener, damper ground beside the water.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.2, 0.035) * vShade, vBank * 0.55 * dry * (1.0 - snowCover));

          // Grain: fine speckle plus medium-scale patchiness.
          float grain = (tFbm(P * 380.0, 2) - 0.5) * tFade(380.0);
          float patchy = tNoise(P * 70.0) - 0.5;
          diffuseColor.rgb *= 1.0 + vDetail.x * (0.4 * grain + 0.3 * patchy);

          // Dunes and sand ripples: warped ripples.
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

          // Patches: coral, kelp, tussocks, moss.
          if (vDetail.y > 0.01) {
            float pm = smoothstep(0.5, 0.58, tFbm(P * 140.0 + 3.1, 2)) * clamp(vDetail.y * 1.4, 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, m2.rgb, pm);
          }

          // City ground (CITY_GLSL): urban ground and rural patterns.
          float urban = 0.0;
          {
            float uS = 0.0, cS = 0.0, farmS = 0.0, mineS = 0.0, campS = 0.0, quarryS = 0.0, wetS = 0.0, burntS = 0.0;
            for (int k = 0; k < 4; k++) {
              if (soft[k] > 0.001) {
                vec4 r5 = tileRow(int(ids[k]), 5);
                uS += soft[k] * r5.x; cS += soft[k] * r5.w;
                int code = int(r5.z + 0.5);
                if (code == 1) farmS += soft[k];
                else if (code == 2) mineS += soft[k];
                else if (code == 3) campS += soft[k];
                else if (code == 4) quarryS += soft[k];
                else if (code == 5) wetS += soft[k];
                else if (code == ${BURNT_CODE}) burntS += soft[k];
              }
            }
            float keep = dry * (1.0 - snowCover);
            float edgeN = tFbm(P / (0.45 * uR0) + 4.1, 2) - 0.5;
            if (uS > 0.02) {
              urban = smoothstep(0.36, 0.5, uS + 0.5 * edgeN) * keep;
              // Packed earth and paving, lighter toward the center's plaza.
              vec3 ground = mix(vec3(0.33, 0.3, 0.26), vec3(0.42, 0.38, 0.33), tNoise(P / (0.08 * uR0)));
              ground = mix(ground, vec3(0.5, 0.47, 0.42), smoothstep(0.5, 0.9, cS) * 0.6);
              // Streets are drawn over this by render.ts (cityProps.ts lays them out).
              diffuseColor.rgb = mix(diffuseColor.rgb, ground * (0.92 + 0.12 * grain) * vShade, urban);
            }
            float fieldMask = 1.0 - urban;
            if (farmS > 0.02) {
              float farm = smoothstep(0.38, 0.52, farmS + 0.35 * edgeN) * keep * fieldMask;
              vec2 f; float edge;
              float h = cPlots(P, vec2(0.38, 0.17), 0.0, f, edge);
              vec3 crop = h < 0.25 ? vec3(0.6, 0.55, 0.37) : h < 0.5 ? vec3(0.43, 0.5, 0.3) : h < 0.68 ? vec3(0.49, 0.42, 0.32) : h < 0.85 ? vec3(0.52, 0.55, 0.36) : vec3(0.56, 0.51, 0.39);
              crop *= 0.94 + 0.12 * fract(h * 7.3);
              // Furrows along each plot, and hedges between plots.
              crop *= 1.0 + 0.06 * sin((h > 0.5 ? f.x : f.y) * 50.0) * tFade(50.0 / (0.15 * uR0));
              float hedge = (1.0 - smoothstep(0.006, 0.006 + 1.5 * fwidth(edge), edge)) * tFade(1.0 / (0.05 * uR0));
              crop = mix(crop, vec3(0.24, 0.3, 0.17), hedge * 0.8);
              diffuseColor.rgb = mix(diffuseColor.rgb, crop * vShade, farm * 0.9);
            }
            if (wetS > 0.02) {
              float wet = smoothstep(0.38, 0.52, wetS + 0.35 * edgeN) * keep * fieldMask;
              vec2 f; float edge;
              float h = cPlots(P, vec2(0.12, 0.09), 5.0, f, edge);
              vec3 paddy = mix(vec3(0.33, 0.45, 0.28), vec3(0.42, 0.52, 0.32), h);
              float bund = (1.0 - smoothstep(0.004, 0.004 + 1.5 * fwidth(edge), edge)) * tFade(1.0 / (0.04 * uR0));
              paddy = mix(paddy, vec3(0.52, 0.5, 0.4), bund * 0.7);
              diffuseColor.rgb = mix(diffuseColor.rgb, paddy * vShade, wet * 0.75);
            }
            if (mineS > 0.02) {
              float mine = smoothstep(0.4, 0.55, mineS + 0.35 * edgeN) * keep * fieldMask;
              float spoil = smoothstep(0.45, 0.62, tFbm(P / (0.12 * uR0) + 1.3, 2));
              vec3 c = mix(vec3(0.42, 0.38, 0.34), vec3(0.55, 0.45, 0.32), tNoise(P / (0.05 * uR0)));
              diffuseColor.rgb = mix(diffuseColor.rgb, c * vShade, mine * spoil * 0.8);
            }
            if (quarryS > 0.02) {
              // Open pits: a couple of irregular hollows per tile, cut in
              // steps (benches) of pale stone, dusty ground around them.
              float quarry = smoothstep(0.4, 0.55, quarryS + 0.35 * edgeN) * keep * fieldMask;
              float n = tFbm(P / (0.32 * uR0) + 6.1, 2);
              float pit = smoothstep(0.6, 0.63, n);
              float dust = smoothstep(0.52, 0.6, n) * (1.0 - pit);
              // Broad benches, darker toward the floor; each starts with the
              // shaded face of the step down, then its flat lighter top.
              float depth = max(0.0, n - 0.6) * 16.0;
              float bench = fract(depth), level = min(floor(depth), 5.0);
              float face = mix(1.0, 1.0 - smoothstep(0.0, 0.3, bench), tFade(1.0 / (0.04 * uR0)));
              vec3 stone = vec3(0.78, 0.74, 0.66) * (0.94 + 0.1 * tNoise(P / (0.025 * uR0))) * (1.0 - 0.1 * level);
              stone *= mix(1.0, 0.68, face * pit * step(0.5, depth));
              vec3 c = mix(diffuseColor.rgb, vec3(0.62, 0.58, 0.5) * vShade, dust * 0.6);
              c = mix(c, stone * vShade, pit);
              diffuseColor.rgb = mix(diffuseColor.rgb, c, quarry);
            }
            if (burntS > 0.02) {
              // Pillaged: scorched ground and ash, the plots still showing faintly.
              float burnt = smoothstep(0.35, 0.5, burntS + 0.35 * edgeN) * keep * fieldMask;
              vec2 f; float edge;
              float h = cPlots(P, vec2(0.38, 0.17), 0.0, f, edge);
              vec3 ash = mix(vec3(0.13, 0.12, 0.1), vec3(0.32, 0.29, 0.25), tFbm(P / (0.06 * uR0) + 2.0, 2)) * (0.9 + 0.2 * h);
              diffuseColor.rgb = mix(diffuseColor.rgb, ash * vShade, burnt * 0.9);
            }
            if (campS > 0.02) {
              float camp = smoothstep(0.4, 0.55, campS + 0.35 * edgeN) * keep * fieldMask;
              float clearing = smoothstep(0.58, 0.7, tFbm(P / (0.2 * uR0) + 3.3, 2));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.45, 0.34) * vShade, camp * clearing * 0.55);
            }
          }

          // Rock follows the relief, not the tiles: steep slopes show it where the
          // tile allows (vRock.a), anything high enough shows it on its slopes,
          // and mountain crests are bare whatever their slope.
          float rock = 0.0;
          if (dry > 0.0) {
            float steep = steepness;
            float alt = length(P) - 1.0;
            float allow = max(vRock.a, smoothstep(0.0104, 0.0169, alt));
            float alpine = smoothstep(0.0169, 0.0234, alt);
            rock = max(smoothstep(0.04, 0.09, steep) * allow, alpine) * dry * (1.0 - snowCover) * (1.0 - vBank) * (1.0 - 0.8 * urban);
            // Rock tone varies: greyer bands and lighter speckle, so faces read as stone.
            vec3 stone = mix(vRock.rgb, vec3(0.62, 0.6, 0.57), 0.45 * tNoise(P * 55.0 + 1.7)) * (0.9 + 0.3 * patchy + 0.15 * grain);
            diffuseColor.rgb = mix(diffuseColor.rgb, stone * vShade, rock * 0.95);
          }

          // Shores, at the real waterline: sandy coasts get a beach that runs on
          // under the water; land that dips under the water turns to silt;
          // ground just above the water is darker and glossy (wet).
          wetGround = 0.0;
          if (above < 0.0015) {
            // Beaches on sea and lake shores; river banks above the water stay
            // green (faded, so a river mouth has no edge; under water the bed
            // stays sandy).
            if (vShore > 0.0) {
              float top = 0.0009 + 0.0005 * tNoise(P * 120.0 + 9.0);
              float noBank = mix(1.0 - smoothstep(0.02, 0.4, vBank), 1.0, under);
              float sand = (1.0 - smoothstep(top * 0.6, top, above)) * smoothstep(0.15, 0.45, vShore + 0.4 * (tFbm(P * 160.0 + 2.7, 2) - 0.5)) * noBank;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.73, 0.45) * (0.95 + 0.1 * grain) * vShade, sand * (1.0 - rock));
            }
            float landBed = 1.0 - smoothstep(0.3, 0.8, vWet);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + vec3(0.05, 0.045, 0.03), under * landBed * 0.75);
            wetGround = (1.0 - smoothstep(0.0, 0.00022, above)) * dry;
            diffuseColor.rgb *= 1.0 - 0.28 * wetGround;
          }
          // Caustics: light focused by the waves, dancing on shallow beds.
          if (vDepth > 0.0 && vDepth < 0.003) {
            vec3 q = P * 520.0;
            float c1 = tNoise(q + vec3(uTime * 0.35, 0.0, uTime * 0.2));
            float c2 = tNoise(q * 1.31 - vec3(0.0, uTime * 0.3, uTime * 0.25));
            float caustic = pow(1.0 - abs(c1 - c2), 10.0);
            diffuseColor.rgb += vec3(0.5, 0.6, 0.55) * caustic * 0.35 * under * (1.0 - smoothstep(0.0006, 0.003, vDepth)) * tFade(520.0);
          }

          // Hex grid: a thin anti-aliased line where ring reaches 1.
          float fw = fwidth(vRing);
          gridLine = 1.0 - smoothstep(0.0, fw * 1.5, 1.0 - vRing);
          gridLine *= (1.0 - smoothstep(0.05, 0.16, fw)) * dry; // the water surface draws its own
          diffuseColor.rgb *= 1.0 - 0.18 * gridLine * uGrid;

          // Debug views: the ground's height as colors with contour lines
          // (thin every 0.0005, thick every 0.0025), so steps, terraces and
          // trenches show as bunched lines.
          if (uView > 0.5) {
            float alt = length(vObjPos) - 1.0;
            vec3 hc = alt < 0.0 ? mix(vec3(0.05, 0.15, 0.45), vec3(0.45, 0.75, 0.95), clamp(1.0 + alt / 0.008, 0.0, 1.0))
              : alt < 0.01 ? mix(vec3(0.15, 0.5, 0.2), vec3(0.75, 0.8, 0.3), alt / 0.01)
              : alt < 0.025 ? mix(vec3(0.75, 0.8, 0.3), vec3(0.8, 0.45, 0.15), (alt - 0.01) / 0.015)
              : mix(vec3(0.8, 0.45, 0.15), vec3(1.0), clamp((alt - 0.025) / 0.03, 0.0, 1.0));
            float c1 = alt / 0.0005, c2 = alt / 0.0025;
            float l1 = 1.0 - smoothstep(0.0, fwidth(c1) * 1.2, abs(fract(c1 - 0.5) - 0.5));
            float l2 = 1.0 - smoothstep(0.0, fwidth(c2) * 1.5, abs(fract(c2 - 0.5) - 0.5));
            hc *= 1.0 - 0.25 * l1 * (1.0 - smoothstep(0.2, 0.6, fwidth(c1))) - 0.5 * l2;
            if (uView > 1.5) hc = mix(vec3(dot(hc, vec3(0.333))), hc, 0.25);
            diffuseColor.rgb = hc;
          }
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(1.0, 0.5, wetGround);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Bumps and ripples. No branches here: the bump needs screen derivatives.
          vec3 P = vObjPos;
          float h = vBump * 0.00045 * (tFbm(P * 260.0, 2) - 0.5) * tFade(260.0)
                  + vDetail.w * 0.00012 * duneWave;
          normal = tPerturb(-vViewPosition, normal, h);
        }`)
      .replace('#include <opaque_fragment>', `{
          outgoingLight = grade(outgoingLight, 0.72);
          vec3 fogCol = vec3(0.012, 0.016, 0.026) * (1.0 + 0.6 * gridLine);
          outgoingLight = mix(outgoingLight, fogCol, smoothstep(0.0, 1.0, vFog));
        }
        #include <opaque_fragment>`);
  };
  return { material: mat, setTime: (s) => { uTime.value = s; }, setGrid: (on) => { uGrid.value = on ? 1 : 0; }, setView: (m) => { uView.value = m; } };
}
