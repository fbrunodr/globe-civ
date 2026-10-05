import * as THREE from 'three';

// The terrain material: three's MeshStandardMaterial with extra shader code.
//
// Materials come from the terrain painting (paint.ts), evaluated per pixel:
// each pixel mixes the rows of up to four tiles from the tile table, with
// weights from the wobbly borders. Tile table rows (TILE_ROWS texels each):
//   0 color.rgb, wet        (wet: 1 on water -> glossy, animated ripples)
//   1 detail                (grain, patch, strata, dunes) -> procedural surface painting
//   2 patchColor.rgb, bump  (blotches drawn by detail.y: pools, coral, kelp)
//   3 rock.rgb, amount      (the biome's bare rock, shown where the ground is steep)
//   4 snow.rgb, beach       (snow as this tile shows it; sandy shores)
//   5 shallow               (caustics in clear shallows)
// Fan table rows (FAN_ROWS texels): ids, wobble, blend, seeds, the fifth
// boundary, rivers (see FanRules in paint.ts).
//
// Per-vertex attributes:
//   ring        0 at a tile center, 1 on its edge -> hex grid line
//   unexplored  1 under fog of war -> flat dark fog, no lighting
//   shade       baked ambient occlusion and tint
//   snow        snow cover on peaks
//   pc0..pc3    painting coordinates (fanCoords in paint.ts) and the fan id
//
// Patterns are 3D value noise sampled at the object-space position, so they
// wrap the sphere without seams, and fade out with distance to avoid shimmer.

export const TEX_W = 2048;
export const TILE_ROWS = 6;
export const FAN_ROWS = 6;

// Hash and value noise of the painting; must match paint.ts exactly
// (checked by npm run paintcheck). Needs `uniform float uFreq`.
export const PAINT_NOISE_GLSL = /* glsl */ `
uint pHash(ivec3 c, uint s) {
  uint h = (uint(c.x) * 73856093u) ^ (uint(c.y) * 19349663u) ^ (uint(c.z) * 83492791u) ^ (s * 2654435761u);
  h ^= h >> 16; h *= 0x7feb352du;
  h ^= h >> 15; h *= 0x846ca68bu;
  h ^= h >> 16;
  return h;
}
float pCell(ivec3 c, uint s) { return float(pHash(c, s) >> 8) / 16777215.0; }
float pValue(vec3 p, uint s) {
  vec3 fl = floor(p);
  ivec3 i = ivec3(fl);
  vec3 u = p - fl;
  u = u * u * (3.0 - 2.0 * u);
  return mix(
    mix(mix(pCell(i, s), pCell(i + ivec3(1, 0, 0), s), u.x), mix(pCell(i + ivec3(0, 1, 0), s), pCell(i + ivec3(1, 1, 0), s), u.x), u.y),
    mix(mix(pCell(i + ivec3(0, 0, 1), s), pCell(i + ivec3(1, 0, 1), s), u.x), mix(pCell(i + ivec3(0, 1, 1), s), pCell(i + ivec3(1, 1, 1), s), u.x), u.y),
    u.z);
}
// Border noise in [-1, 1] (borderNoise in paint.ts).
float pEta(vec3 d, uint s) {
  vec3 p = d * uFreq;
  return clamp(((pValue(p, s) + 0.5 * pValue(p * 2.03 + 7.1, s + 1u)) / 1.5 - 0.5) * 3.2, -1.0, 1.0);
}
`;

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
// ---- painting (mirror of paint.ts) ----
vec4 tileRow(int t, int k) { int i = t * ${TILE_ROWS} + k; return texelFetch(uTileTex, ivec2(i % ${TEX_W}, i / ${TEX_W}), 0); }
vec4 fanRow(int f, int k) { int i = f * ${FAN_ROWS} + k; return texelFetch(uFanTex, ivec2(i % ${TEX_W}, i / ${TEX_W}), 0); }
${PAINT_NOISE_GLSL}
float pWarp(float dist, float amp, float seed, float tp, vec3 d) {
  if (amp == 0.0 || tp == 0.0) return dist;
  return dist + amp * tp * pEta(d, uint(abs(seed))) * sign(seed);
}
// Weights of the fan's tiles (t, A, B, C); sEdge = warped distances to the 3 real edges.
vec4 paintWeights(int fan, vec3 d, out vec3 sEdge) {
  vec4 amp = fanRow(fan, 1), bl = fanRow(fan, 2), sd = fanRow(fan, 3), ex = fanRow(fan, 4);
  vec3 dd = vPc0.xyz;
  vec3 aa = vec3(vPc0.w, vPc1.xy);
  vec3 bb = vec3(vPc1.zw, vPc2.x);
  sEdge = dd;
  vec3 cr = vec3(0.0);
  for (int j = 0; j < 3; j++) {
    if (dd[j] < amp[j] + bl[j]) {
      float tp = smoothstep(0.0, uTaper, aa[j]) * smoothstep(0.0, uTaper, bb[j]);
      sEdge[j] = pWarp(dd[j], amp[j], sd[j], tp, d);
      cr[j] = smoothstep(-1.0, 1.0, -sEdge[j] / bl[j]);
    }
  }
  if (cr.x == 0.0 && cr.y == 0.0 && cr.z == 0.0) return vec4(1.0, 0.0, 0.0, 0.0);
  float sL = pWarp(vPc2.y, amp.w, sd.w, smoothstep(0.0, uTaper, vPc2.w), d);
  float sR = pWarp(vPc2.z, ex.x, ex.z, smoothstep(0.0, uTaper, vPc3.x), d);
  vec4 w = vec4(
    (1.0 - cr.x) * (1.0 - cr.y) * (1.0 - cr.z),
    cr.x * smoothstep(-1.0, 1.0, -sL / bl.w),
    cr.y * smoothstep(-1.0, 1.0, sL / bl.w) * smoothstep(-1.0, 1.0, sR / ex.y),
    cr.z * smoothstep(-1.0, 1.0, -sR / ex.y));
  float sum = w.x + w.y + w.z + w.w;
  return sum < 1e-9 ? vec4(1.0, 0.0, 0.0, 0.0) : w / sum;
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
  taper: number;
  freq: number;
  r0: number;
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

export function makeTerrainMaterial(paint: PaintUniforms): TerrainMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uTime;
    shader.uniforms['uTileTex'] = { value: paint.tileTex };
    shader.uniforms['uFanTex'] = { value: paint.fanTex };
    shader.uniforms['uTaper'] = { value: paint.taper };
    shader.uniforms['uFreq'] = { value: paint.freq };
    shader.uniforms['uR0'] = { value: paint.r0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float ring;
        attribute float unexplored;
        attribute float shade;
        attribute float snow;
        attribute vec4 pc0;
        attribute vec4 pc1;
        attribute vec4 pc2;
        attribute vec2 pc3;
        varying vec4 vPc0;
        varying vec4 vPc1;
        varying vec4 vPc2;
        varying vec2 vPc3;
        varying vec3 vObjNormal;
        varying float vRing;
        varying float vFog;
        varying float vShade;
        varying float vSnow;
        varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRing = ring; vFog = unexplored; vShade = shade; vSnow = snow;
        vPc0 = pc0; vPc1 = pc1; vPc2 = pc2; vPc3 = pc3;
        vObjPos = position; vObjNormal = normal;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform highp sampler2D uTileTex;
        uniform highp sampler2D uFanTex;
        uniform float uTaper;
        uniform float uFreq;
        uniform float uR0;
        varying vec4 vPc0;
        varying vec4 vPc1;
        varying vec4 vPc2;
        varying vec2 vPc3;
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
        float bank;
        float vWet;
        vec4 vDetail;
        float vBump;
        vec3 vPatchColor;
        vec2 vCoast;
        vec4 vRock;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 P = vObjPos;
          tLod = length(fwidth(P)); // world units per pixel

          // The painting: mix the materials of the tiles that reach this pixel.
          int fan = int(round(vPc3.y));
          vec4 ids = fanRow(fan, 0);
          vec3 sEdge;
          vec4 w = paintWeights(fan, normalize(P), sEdge);
          vec4 m0 = vec4(0.0), m1 = vec4(0.0), m2 = vec4(0.0), m3 = vec4(0.0), m4 = vec4(0.0), m5 = vec4(0.0);
          for (int k = 0; k < 4; k++) {
            if (w[k] > 0.0) {
              int tt = int(round(ids[k]));
              m0 += w[k] * tileRow(tt, 0); m1 += w[k] * tileRow(tt, 1); m2 += w[k] * tileRow(tt, 2);
              m3 += w[k] * tileRow(tt, 3); m4 += w[k] * tileRow(tt, 4); m5 += w[k] * tileRow(tt, 5);
            }
          }
          vWet = m0.a; vDetail = m1; vPatchColor = m2.rgb; vBump = m2.a; vRock = m3; vCoast = vec2(m4.a, m5.x);
          diffuseColor.rgb = mix(m0.rgb, m4.rgb, vSnow) * vShade;

          float land = 1.0 - smoothstep(0.45, 0.55, vWet);

          // River banks: a strip of greener, damper ground along the river's curve.
          vec4 river = fanRow(fan, 5);
          float bankM = 0.0;
          for (int j = 0; j < 3; j++) {
            float bw = uR0 * (0.12 + 0.1 * river[j]);
            bankM = max(bankM, step(0.001, river[j]) * (1.0 - smoothstep(bw, bw * 2.2, abs(sEdge[j]))));
          }
          bank = bankM;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.2, 0.035) * vShade, bank * 0.75 * land * (1.0 - vSnow));

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

          // Bare rock where land is steep (coastal cliffs, hill and mountain
          // flanks), in the rock color of the biome underneath.
          float steep = 1.0 - dot(normalize(vObjNormal), normalize(P));
          // Rock follows the relief, not the tiles: steep slopes show it where the
          // tile allows (vRock.a), anything high enough shows it on its slopes,
          // and mountain crests are bare whatever their slope.
          float alt = length(P) - 1.0;
          float allow = max(vRock.a, smoothstep(0.016, 0.026, alt));
          float alpine = smoothstep(0.026, 0.036, alt);
          float rock = max(smoothstep(0.04, 0.09, steep) * allow, alpine) * land * (1.0 - 0.8 * vSnow) * (1.0 - bank);
          diffuseColor.rgb = mix(diffuseColor.rgb, vRock.rgb * (0.88 + 0.24 * patchy), rock * 0.8);

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
