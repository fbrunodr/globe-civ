// The material and instanced geometry shared by every prop (flora and
// buildings): render.ts and the design sheet.

import * as THREE from 'three';
import { GRADE_GLSL } from './terrainMaterial.ts';

// How far leaves sway in the wind (a share of their height in the model).
const WIND = 0.04;

// The stalks on a crop's card (rural/models.ts, cropTuft): slim tapering
// blades of varied height, darker at the foot (in the crop's shade) and
// lighter at the tip, transparent between them. Made once, in code.
// A card texture drawn in code: W × H texels, transparent but white
// between the strokes (the blurred mipmaps seen from afar stay light), each
// stroke (draw(rand, stroke)) a line of texels from (x0, y0) to (x1, y1),
// `w` texels across, in a shade of white. Row 0 is v 0.
type Stroke = (x0: number, y0: number, x1: number, y1: number, w: number, shade: number) => void;
function drawnTexture(W: number, H: number, salt: number, draw: (rand: () => number, stroke: Stroke) => void): THREE.DataTexture {
  const data = new Uint8Array(W * H * 4).fill(232);
  for (let o = 3; o < data.length; o += 4) data[o] = 0;
  let h = salt;
  const rand = () => { h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return (h >>> 8) / 16777216; };
  draw(rand, (x0, y0, x1, y1, w, shade) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1, v = Math.round(255 * shade);
    for (let i = 0; i <= n; i++) {
      const cx = x0 + ((x1 - x0) * i) / n, cy = y0 + ((y1 - y0) * i) / n;
      for (let y = Math.floor(cy - w / 2); y <= cy + w / 2; y++) for (let x = Math.floor(cx - w / 2); x <= cx + w / 2; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || Math.hypot(x - cx, y - cy) > w / 2 + 0.3) continue;
        const o = (y * W + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
  });
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// A palm frond (propCatalog.ts, frond): a rib up the middle (v along it),
// leaflets either side slanting toward the tip, longest a third of the way
// along, none at the very tip.
let frondTex: THREE.DataTexture | null = null;
const frondTexture = (): THREE.DataTexture => (frondTex ??= drawnTexture(64, 128, 0xf20d, (rand, stroke) => {
  stroke(32, 0, 32, 124, 2.2, 0.7);
  for (let y = 8; y < 120; y += 4.6) {
    const t = y / 128, reach = 29 * Math.sin(Math.PI * Math.min(1, t * 1.2)) * (0.8 + 0.2 * rand());
    // (Leaflets droop from the rib, thin, light between them.)
    for (const side of [-1, 1]) stroke(32, y, 32 + side * reach, y + reach * 0.9 + 3 * rand(), 1.5, 0.78 + 0.22 * rand());
  }
}));

// A conifer's branch (propCatalog.ts, tier): a twig up the middle (v from
// the trunk out), sprigs of needles along it, shorter toward the tip.
let needleTex: THREE.DataTexture | null = null;
const needleTexture = (): THREE.DataTexture => (needleTex ??= drawnTexture(64, 128, 0x9ee1, (rand, stroke) => {
  stroke(32, 0, 32, 126, 2, 0.55);
  for (let y = 2; y < 124; y += 3.2) {
    const t = y / 128, reach = 30 * (1 - 0.75 * t) * (0.75 + 0.25 * rand());
    for (const side of [-1, 1]) {
      const x1 = 32 + side * reach, y1 = y + reach * 0.45;
      stroke(32, y, x1, y1, 1.8, 0.75 + 0.25 * rand());
      // (needles off each sprig)
      for (let k = 0.3; k < 1; k += 0.22) stroke(32 + side * reach * k, y + reach * 0.45 * k, 32 + side * reach * (k + 0.12), y + reach * 0.45 * k + 4, 1.1, 0.7 + 0.3 * rand());
    }
  }
}));

const BLADE_W = 64, BLADE_H = 128, BLADES = 22;
let bladeTex: THREE.DataTexture | null = null;
function bladeTexture(): THREE.DataTexture {
  if (bladeTex) return bladeTex;
  const W = BLADE_W, H = BLADE_H, data = new Uint8Array(W * H * 4).fill(232);
  for (let o = 3; o < data.length; o += 4) data[o] = 0;
  let h = 0xb1ade;
  const rand = () => { h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return (h >>> 8) / 16777216; };
  for (let n = 0; n < BLADES; n++) {
    const x0 = 3 + rand() * (W - 6), top = H * (0.55 + 0.45 * rand()), lean = (rand() - 0.5) * 10, w0 = 1.6 + 1.2 * rand();
    for (let y = 0; y < top; y++) {
      const t = y / top, cx = x0 + lean * t * t, half = w0 * (1 - 0.85 * t);
      const shade = Math.round(255 * (0.6 + 0.4 * Math.min(1, t * 1.4)));
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        if (x < 0 || x >= W) continue;
        const o = (y * W + x) * 4; // (row 0 is v 0, the foot)
        data[o] = data[o + 1] = data[o + 2] = shade;
        data[o + 3] = 255;
      }
    }
  }
  bladeTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  bladeTex.generateMipmaps = true;
  bladeTex.minFilter = THREE.LinearMipmapLinearFilter;
  bladeTex.magFilter = THREE.LinearFilter;
  bladeTex.needsUpdate = true;
  return bladeTex;
}

// A fence's card (rural/models.ts fenceCard): three kinds in bands up the
// texture (v: a third each, from the foot): woven wattle hurdles on stakes,
// posts and two rails, posts and three strands of wire. A unit of u is a
// bay (rural/models.ts): a post at each end (half of it at each edge, so
// bays side by side share a whole post where they meet) and one midway;
// the rails and wattle run edge to edge, unbroken from bay to bay.
let fenceTex: THREE.DataTexture | null = null;
export const FENCE_BANDS = ['wattle', 'rails', 'wire'] as const;
function fenceTexture(): THREE.DataTexture {
  if (fenceTex) return fenceTex;
  const W = 128, B = 42, H = 128;
  fenceTex = drawnTexture(W, H, 0xfe4ce, (rand, stroke) => {
    // (Each band: its foot at y0, B texels tall; the end posts straight
    // (halves that meet), the middle one a little out of true.)
    const posts = (y0: number, top: number, w: number, shade: number, at: readonly number[]) => {
      for (const x of [0, W]) stroke(x, y0, x, y0 + top, w, shade);
      for (const x of at) stroke(x + (rand() - 0.5) * 2, y0, x + (rand() - 0.5) * 2, y0 + top, w * 0.85, shade);
    };
    // Wattle: hurdles of rods woven between stakes, close set, under the stakes' tops.
    for (let y = 3; y < B * 0.8; y += 3.4) stroke(0, y + (rand() - 0.5), W, y + (rand() - 0.5), 2.4, 0.78 + 0.18 * rand());
    posts(0, B * 0.9, 3.6, 0.7, [W * 0.25, W * 0.5, W * 0.75]);
    // Rails: posts, two slim rails.
    for (const y of [B * 0.45, B * 0.8]) stroke(0, B + y, W, B + y, 3.2, 0.95);
    posts(B, B * 0.95, 4, 0.78, [W * 0.5]);
    // Wire: posts, three strands.
    for (const y of [B * 0.33, B * 0.6, B * 0.86]) stroke(0, 2 * B + y, W, 2 * B + y, 1.1, 1);
    posts(2 * B, B * 0.95, 3.4, 0.75, [W * 0.5]);
  });
  fenceTex.wrapS = THREE.RepeatWrapping;
  return fenceTex;
}

const LEAF_TEX = 128;
// A crown's leaf card (propCatalog.ts, clumpCards) as a bough: twigs out
// from the card's middle, forking, and on them clumps of small round
// leaves (several to a clump, overlapping: a mass of foliage, not single
// leaves on a stem, which read as a fern's frond, spiky), the largest at
// the twigs' ends, so the bough's outline is lobed and round; each leaf
// its own shade from deep to light (lighter in the outer clumps, where the
// light reaches; the instance's leaf colour shows through), sky showing
// between the clumps. A crown of them reads as boughs with depth, not as
// one soft ball. Made once, in code.
let sprayTex: THREE.DataTexture | null = null;
const sprayTexture = (): THREE.DataTexture => (sprayTex ??= drawnTexture(LEAF_TEX, LEAF_TEX, 0x5b7a9, (rand, stroke) => {
  const N = LEAF_TEX, c = N / 2, TWIGS = 7;
  // (The twigs first, then the clumps over them, the inner ones first.)
  const clumps: [number, number, number, number][] = [];
  const twig = (x: number, y: number, a: number, len: number, w: number, forks: number) => {
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const nx = x + Math.cos(a) * len / steps, ny = y + Math.sin(a) * len / steps;
      stroke(x, y, nx, ny, w, 0.32);
      x = nx; y = ny; a += (rand() - 0.5) * 0.4;
      if (forks > 0 && i >= 1 && i < steps - 1) twig(x, y, a + (rand() < 0.5 ? -1 : 1) * (0.6 + 0.4 * rand()), len * 0.5, w * 0.7, forks - 1);
      if (i >= 1) clumps.push([x, y, (i === steps - 1 ? 0.085 : 0.06) * N * (0.85 + 0.3 * rand()), Math.hypot(x - c, y - c) / (N / 2)]);
    }
  };
  for (let k = 0; k < TWIGS; k++) twig(c, c, (k / TWIGS) * Math.PI * 2 + (rand() - 0.5) * 0.5, (0.3 + 0.08 * rand()) * N, 1.8, 1);
  clumps.sort((p, q) => p[3] - q[3]);
  for (const [x, y, r, out] of clumps) for (let n = 0; n < 9; n++) {
    const a = rand() * Math.PI * 2, d = r * Math.sqrt(rand()), lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d;
    stroke(lx, ly, lx + (rand() - 0.5) * 1.5, ly + (rand() - 0.5) * 1.5, 4.6 + 2 * rand(), Math.min(1, 0.42 + 0.34 * out + 0.26 * rand()));
  }
}));

// Prop material: per-vertex colors, with the leaf parts (leafMask) taking
// each instance's leaf color (leafTint), times the instance's color.
// `bounce`: light bounced off the sunlit ground onto walls (buildings, whose
// walls would otherwise sit dark under a high sun), on the sunny side only:
// a wall turned from the sun keeps its shade. `saturation`: how much color
// the lit result keeps. `sunDir` (on the globe, the sun's direction, kept up
// to date by the caller): the planet's shadow, worked out: no direct sun
// where the sun is below a prop's horizon.
//
// What flora does to its vertices: the leaves stir in the wind, a farm's
// crops (cardUv z 2) shrink away with distance from the eye (the camera, uEye).
export interface FloraUniforms {
  time: { value: number };
  cropFar?: { value: number };
  eye?: { value: THREE.Vector3 };
  barkScale?: { value: number }; // the models' scale against their catalog's size (the bark's grain is in the catalog's)
}
const FLORA_VERTEX_DECL = `
  attribute float leafMask;
  attribute vec3 cardUv;
  varying vec4 vBark;
  uniform float uTime; uniform float uCropFar; uniform vec3 uEye;`;
const FLORA_VERTEX = `
  vBark = vec4(position, leafMask);
  #ifdef USE_INSTANCING
    // Wind: leaves sway with their height in the model, each prop in its own phase.
    {
      vec3 o = instanceMatrix[3].xyz;
      float ph = dot(o, vec3(4100.0, 3700.0, 2900.0));
      float gust = sin(uTime * 1.7 + ph) + 0.5 * sin(uTime * 2.9 + ph * 1.3);
      // (Every leaf card sways, a bush's bursts of berries too, whatever their colour.)
      float sway = max(leafMask, step(0.5, cardUv.z) * step(cardUv.z, 1.5));
      transformed.xz += sway * transformed.y * ${WIND.toFixed(3)} * gust * vec2(1.0, 0.6);
      if (cardUv.z > 1.5) {
        float far = distance((modelMatrix * vec4(o, 1.0)).xyz, uEye) / uCropFar;
        transformed *= 1.0 - smoothstep(0.6, 1.0, far);
      }
    }
  #endif`;
// Bark, on a flora model's wood (what is neither leaf nor card: trunks,
// limbs, logs, stumps), worked out per pixel in the model's own space (no
// texture to draw): a quiet mottle, its patches longer up the stem than
// across it, a finer grain over it; a few parts in a hundred lighter or
// darker, never stripes. Faded out where finer than the pixels.
const BARK_GLSL = /* glsl */ `
  varying vec4 vBark;
  uniform float uBarkScale;
  float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float bNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), u.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float barkShade(vec3 p) {
    vec3 q = p / uBarkScale * vec3(1300.0, 420.0, 1300.0);
    float show = 1.0 - smoothstep(0.3, 1.0, max(fwidth(q.x) + fwidth(q.z), fwidth(q.y)));
    float n = 0.5 * (bNoise(q.xy + q.z * 1.7) + bNoise(q.zy * 1.1 + q.x * 0.6 + 11.3));
    float grain = bNoise(q.xy * 3.1 + q.z * 4.3 + 5.7);
    return 1.0 + show * (0.34 * (n - 0.5) + 0.12 * (grain - 0.5));
  }`;
// The card textures (uLeaves, uBlades, uFronds, uNeedles), for CARD_TEXEL.
export const cardTextures = (): Record<string, THREE.IUniform> => ({
  uLeaves: { value: sprayTexture() }, uBlades: { value: bladeTexture() }, uFronds: { value: frondTexture() }, uNeedles: { value: needleTexture() }, uFences: { value: fenceTexture() },
});
const floraUniforms = (f: FloraUniforms): Record<string, THREE.IUniform> => ({
  uTime: f.time, uCropFar: f.cropFar ?? { value: 1e9 }, uEye: f.eye ?? { value: new THREE.Vector3() }, uBarkScale: f.barkScale ?? { value: 1 }, ...cardTextures(),
});
// A card's texel: a fence (z 5, rural/models.ts), a conifer's needles (z
// 4), a palm's frond (z 3), a crop's stalks (z 2, rural/models.ts) or a
// crown's leaves;
// far off, its leaves are kept from fading away in the blurred mipmaps.
export const CARD_TEXEL = `
  uniform sampler2D uLeaves; uniform sampler2D uBlades; uniform sampler2D uFronds; uniform sampler2D uNeedles; uniform sampler2D uFences;
  vec4 cardTexel(vec3 card) {
    vec4 lt = card.z > 4.5 ? texture2D(uFences, card.xy) : card.z > 3.5 ? texture2D(uNeedles, card.xy) : card.z > 2.5 ? texture2D(uFronds, card.xy) : card.z > 1.5 ? texture2D(uBlades, card.xy) : texture2D(uLeaves, card.xy);
    vec2 dx = dFdx(card.xy) * ${LEAF_TEX}.0, dy = dFdy(card.xy) * ${LEAF_TEX}.0;
    lt.a *= 1.0 + 0.3 * max(0.5 * log2(max(dot(dx, dx), dot(dy, dy))), 0.0);
    return lt;
  }`;

// The countryside's beasts and people roam (`roam`, a model's: the radius
// of its walk, model units; 0 for what stands still), each in its own phase
// (by where it stands). Given room (`wander`, an instance's: the circle it
// may go about in, model units, all of it on its own ground: rural/models.ts
// wanderIn), from one spot in it to the next: it stops a while (to graze, to
// work), turns toward the next spot, walks there. Else round a small loop
// of its own, a few steps at a time. Turned the way it walks. A swimmer
// (`roam` negative: a shoal of fish, a whale) never stops: round a smooth
// closed loop of its own in its circle (a wobbling ellipse, its own size,
// tilt, way round and pace), facing along it; its `gait` its pace and, for
// a whale, how far it rises to breathe now and then.
// uRoamTime: seconds.
const ROAM_DECL = `
  attribute float roam;
  attribute vec2 gait;
  attribute float wander;
  uniform float uRoamTime;
  float roamHash(float n, float h) { return fract(sin(n * 91.3458 + h * 47.453) * 43758.5453); }
  // (The n-th spot of its wanders: anywhere in its circle, evenly.)
  vec2 roamSpot(float n, float h) { float a = roamHash(n, h) * 6.2831853, r = sqrt(roamHash(n + 0.5, h)); return vec2(cos(a), sin(a)) * r * wander; }
  // (The angle walked so far, signed by which way round; the loop's offset;
  // and the legs' swing now: 0 at rest, ±1 mid-stride.)
  float roamAngle(out vec3 off, out float swing) {
    off = vec3(0.0); swing = 0.0;
    #ifdef USE_INSTANCING
      if (roam == 0.0) return 0.0;
      vec3 o = instanceMatrix[3].xyz;
      float h = fract(sin(dot(o, vec3(12.9898, 78.233, 37.719)) * 1e4) * 43758.5453);
      if (roam < 0.0 && gait.y < 0.0) {
        // (A turner: round where it stands, slowly, always from +x toward +z,
        // the way its model faces: the crabs round their rock.)
        return uRoamTime * 6.2831853 / ((30.0 + 12.0 * roamHash(9.0, h)) * max(gait.x, 0.1)) + 6.2831853 * h;
      }
      if (roam < 0.0) {
        // p(t) = R · turn(q) · (a cos t + c sin(2t + e), b sin t + d cos(2t + f)): the second terms small, so it never doubles back.
        float R = wander > 0.0 ? wander : -2.0 * roam, way = roamHash(1.0, h) < 0.5 ? -1.0 : 1.0;
        float a = 0.62 + 0.2 * roamHash(2.0, h), b = 0.45 + 0.3 * roamHash(3.0, h), c = 0.12 * roamHash(4.0, h), d = 0.12 * roamHash(5.0, h);
        float e = 6.2831853 * roamHash(6.0, h), f = 6.2831853 * roamHash(7.0, h), q = 6.2831853 * roamHash(8.0, h);
        // (Its pace: gait.x, a shoal's 1.)
        float t = way * uRoamTime * 6.2831853 / ((24.0 + 16.0 * roamHash(9.0, h)) * max(gait.x, 0.1)) + 6.2831853 * h;
        vec2 p = vec2(a * cos(t) + c * sin(2.0 * t + e), b * sin(t) + d * cos(2.0 * t + f));
        vec2 v = way * vec2(-a * sin(t) + 2.0 * c * cos(2.0 * t + e), b * cos(t) - 2.0 * d * sin(2.0 * t + f));
        float cq = cos(q), sq = sin(q);
        p = R * vec2(cq * p.x - sq * p.y, sq * p.x + cq * p.y);
        v = vec2(cq * v.x - sq * v.y, sq * v.x + cq * v.y);
        // (A diver, gait.y its rise: up for air a few seconds in every twenty or so.)
        float k = fract(uRoamTime / (18.0 + 8.0 * roamHash(10.0, h)) + h);
        off = vec3(p.x, gait.y * smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.28, 0.42, k)), p.y);
        return atan(v.y, v.x);
      }
      if (wander > 0.0) {
        // A leg: a pause (its first part), a turn, then the walk to the next spot, slowing at the end.
        float k = uRoamTime / (8.0 + 6.0 * h) + h * 31.0, n = floor(k), f = fract(k);
        vec2 z = roamSpot(n - 1.0, h), a = roamSpot(n, h), b = roamSpot(n + 1.0, h);
        float s = smoothstep(0.45, 1.0, f);
        vec2 p = mix(a, b, s);
        off = vec3(p.x, 0.0, p.y);
        float a0 = atan(a.y - z.y, a.x - z.x), a1 = atan(b.y - a.y, b.x - a.x), d = a1 - a0;
        d -= 6.2831853 * floor((d + 3.14159265) / 6.2831853);
        // (The legs swing once a stride, twice the small loop's radius: about a body's length.)
        swing = sin(s * length(b - a) / (roam * 2.0) * 6.2831853) * smoothstep(0.45, 0.55, f) * (1.0 - smoothstep(0.92, 1.0, f));
        return a0 + d * smoothstep(0.3, 0.45, f);
      }
      float side = h < 0.5 ? -1.0 : 1.0;
      float k = uRoamTime / (5.0 + 4.0 * h) + h * 17.0;
      float s = smoothstep(0.55, 1.0, fract(k)), th = (floor(k) + s) * 0.8;
      off = vec3(roam * sin(th), 0.0, side * roam * (1.0 - cos(th)));
      // (A stride is half the walk's radius: the legs swing once a stride, only while walking.)
      swing = sin(th * 2.0 * 3.14159265) * 4.0 * s * (1.0 - s) * step(0.001, fract(k) - 0.55);
      return side * th;
    #else
      return 0.0;
    #endif
  }
  vec3 roamTurn(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.z * s, v.y, v.x * s + v.z * c); }`;
const ROAM_NORMAL = `
  { vec3 off; float sw; float ra = roamAngle(off, sw); objectNormal = roamTurn(objectNormal, ra); }`;
// (The legs swing forward and back from the hips, alternately, then the walker turns and moves along its loop.)
const ROAM_VERTEX = `
  { vec3 off; float sw; float ra = roamAngle(off, sw);
    transformed.x += gait.y * gait.x * 0.55 * sw;
    transformed = roamTurn(transformed, ra) + off; }`;
// The roaming models' depth, for their shadows to walk with them.
export function makeRoamDepthMaterial(time: { value: number }): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uRoamTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${ROAM_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${ROAM_VERTEX}`);
  };
  mat.customProgramCacheKey = () => 'roam-depth';
  return mat;
}

// The depth flora is drawn into the sun's shadow map with ('real' shadows,
// render.ts): the same vertices (wind, crops by distance), its cards cut
// out to their leaves and stalks (a card would otherwise cast a square).
export function makeFloraDepthMaterial(flora: FloraUniforms): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floraUniforms(flora));
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${FLORA_VERTEX_DECL}
        varying vec3 vCard;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCard = cardUv;
        ${FLORA_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCard;
        ${CARD_TEXEL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vCard.z > 0.5 && cardTexel(vCard).a < 0.5) discard;`);
  };
  mat.customProgramCacheKey = () => 'flora-depth';
  return mat;
}

// Built surfaces (makePropMaterial `surfaces`): a texture worked out per
// pixel, in the model's own axes (its walls upright, its roofs' slopes)
// at the world's size (a storey: uStorey), from what each face is: walls
// of brick, stone, plaster or timber, roofs of clay tiles, slate or
// thatch, flat tops of fine grit, each told by its colour and slope (no
// texture to draw or load). Faded out where it would be finer than the
// pixels.
const SURFACE_VERTEX = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 sScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  #else
    vec3 sScale = vec3(1.0);
  #endif
  vSurfP = position * sScale;
  vSurfN = normalize(objectNormal / sScale);
`;
const SURFACE_FRAGMENT = /* glsl */ `
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Courses of h by blocks of w, every other course shifted half a block:
// its mortar (1 on a joint, j its width as a share), the block's id.
float sCourses(vec2 q, float w, float h, float j, out vec2 id) {
  float row = floor(q.y / h);
  float x = q.x / w + 0.5 * mod(row, 2.0);
  id = vec2(floor(x), row);
  vec2 f = vec2(fract(x), fract(q.y / h));
  vec2 e = min(f, 1.0 - f) / vec2(j * h / w, j);
  return 1.0 - smoothstep(0.5, 1.0, min(e.x, e.y));
}
// How much of a pattern of this period shows (none where finer than the pixels).
float sShow(float coord, float period) { return 1.0 - smoothstep(0.25, 0.7, fwidth(coord) / period); }
float surfaceShade(vec3 c, vec3 P, vec3 N) {
  float S = uStorey;
  float hi = max(c.r, max(c.g, c.b)), lo = min(c.r, min(c.g, c.b));
  float lum = dot(c, vec3(0.3, 0.59, 0.11)), sat = hi > 0.0 ? (hi - lo) / hi : 0.0, gr = c.g / max(c.r, 1e-3);
  bool red = c.r >= hi && c.r > c.b * 1.4;
  vec2 id;
  if (abs(N.y) < 0.3) {
    // A wall: along it (u) and up (v).
    vec2 t = normalize(vec2(-N.z, N.x) + 1e-5);
    vec2 q = vec2(dot(P.xz, t), P.y);
    if (lum < 0.03) return 1.0; // (windows, doors: dark glass and wood)
    if (red && gr < 0.33 && sat > 0.5) {
      // Brick: small courses, pale mortar, each brick its own fired shade.
      float h = S / 9.0, show = sShow(q.y, h);
      float m = sCourses(q, 2.2 * h, h, 0.12, id);
      return 1.0 + show * (mix((sHash(id) - 0.5) * 0.32, 0.3, m));
    }
    if (red && gr >= 0.33 && sat > 0.55 && lum < 0.22) {
      // Timber: boards across, a dark seam between, the grain along them.
      float h = S / 6.0, show = sShow(q.y, h);
      float seam = 1.0 - smoothstep(0.0, 0.08, min(fract(q.y / h), 1.0 - fract(q.y / h)));
      float grain = sNoise(vec2(q.x / (h * 4.0), q.y / (h * 0.15)));
      return 1.0 + show * (-0.3 * seam + 0.16 * (grain - 0.5) + 0.1 * (sHash(vec2(0.0, floor(q.y / h))) - 0.5));
    }
    if (sat < 0.38 && lum < 0.5) {
      // Stone: dressed blocks, each its own shade, dark joints.
      float h = S / 7.0, show = sShow(q.y, h);
      float m = sCourses(q + vec2(0.0, 0.0), h * (1.4 + 0.6 * sHash(vec2(floor(q.y / h), 7.0))), h, 0.07, id);
      float n = sNoise(q / (h * 0.35));
      return 1.0 + show * (mix((sHash(id) - 0.5) * 0.4 + 0.16 * (n - 0.5), -0.5, m));
    }
    // Plaster: a soft mottle and fine grit, stained low where the rain splashes.
    float show = sShow(q.y, S * 0.08);
    float mottle = sNoise(q / (S * 0.7)) - 0.5, grit = sNoise(q / (S * 0.05)) - 0.5;
    float stain = 1.0 - smoothstep(0.0, S * 0.35, P.y);
    return 1.0 + 0.24 * mottle + show * 0.16 * grit - 0.16 * stain;
  }
  if (N.y > 0.3 && N.y < 0.95) {
    // A roof: across its slope (u) and down it (v).
    vec2 d = normalize(N.xz);
    vec3 down = normalize(vec3(d.x, 0.0, d.y) * N.y - vec3(0.0, 1.0 - N.y * N.y, 0.0));
    vec2 q = vec2(dot(P.xz, vec2(-d.y, d.x)), -dot(P, down));
    if (red && gr < 0.55) {
      // Clay tiles: rows of them, each darker at its lower lip (the next row's shadow).
      float h = S / 6.0, show = sShow(q.y, h);
      float m = sCourses(q, h * 0.9, h, 0.06, id);
      float lip = fract(q.y / h);
      return 1.0 + show * (0.22 * (lip - 0.5) + (sHash(id) - 0.5) * 0.16 - 0.15 * m);
    }
    if (red && gr >= 0.55) {
      // Thatch: straw down the slope, in bundles, the courses' edges dark.
      float h = S / 4.0, show = sShow(q.x, S * 0.05);
      float straw = sNoise(vec2(q.x / (S * 0.025), q.y / (S * 0.6)));
      float edge = smoothstep(0.75, 1.0, fract(q.y / h));
      return 1.0 + show * (0.24 * (straw - 0.5)) - sShow(q.y, h) * 0.14 * edge;
    }
    if (c.g >= c.r && c.g > c.b * 1.15) {
      // Turf (green): grass in tufts, no courses, darker in its hollows.
      float tuft = sNoise(q / (S * 0.12)), clump = sNoise(q / (S * 0.6));
      return 1.0 + sShow(q.x, S * 0.12) * 0.22 * (tuft - 0.5) + 0.18 * (clump - 0.5);
    }
    // Slate (or any other roof): small dark-jointed slates.
    float h = S / 7.0, show = sShow(q.y, h);
    float m = sCourses(q, h * 1.3, h, 0.08, id);
    return 1.0 + show * ((sHash(id) - 0.5) * 0.2 - 0.3 * m);
  }
  // Flat (a terrace, a top, a paved yard): fine grit.
  vec2 q = P.xz;
  return 1.0 + sShow(q.x, S * 0.1) * 0.1 * (sNoise(q / (S * 0.1)) - 0.5) + 0.06 * (sNoise(q / S) - 0.5);
}
`;

// `flora` (trees, shrubs, ground cover): smooth shading over the models'
// clump normals (propCatalog.ts: fluffy foliage), crowns darker underneath
// (leafShade), and the leaves stirring in the wind (`time`, seconds, kept
// up to date by the caller). Buildings stay flat-shaded.
// `flora.cropFar` (world units): a farm's crops (cardUv z 2) shrink into
// the ground as they near this distance from the camera, and are gone past
// it (the painted plots go on alone, at no cost).
// `smooth`: smooth-shaded over the models' own normals (people, animals,
// plants: rural/kit.ts), not flat; with `roam` (its clock), the beasts and
// people among them walk about.
// `surfaces` (world units a storey, cityProps' houses as placed): built
// surfaces textured (SURFACE_FRAGMENT).
export function makePropMaterial(bounce = 0, saturation = 0.6, sunDir?: THREE.Vector3, flora?: FloraUniforms, smooth = false, roam?: { value: number }, surfaces?: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: smooth ? 0.85 : 1, flatShading: !flora && !smooth, side: THREE.DoubleSide });
  const day = sunDir !== undefined;
  mat.onBeforeCompile = (shader) => {
    if (day) shader.uniforms['uSunDir'] = { value: sunDir };
    if (flora) Object.assign(shader.uniforms, floraUniforms(flora));
    if (roam) shader.uniforms['uRoamTime'] = roam;
    if (surfaces) shader.uniforms['uStorey'] = { value: surfaces };
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${roam ? ROAM_NORMAL : ''}`)
      .replace('#include <common>', `#include <common>
        ${surfaces ? 'varying vec3 vSurfP; varying vec3 vSurfN;' : ''}
        ${roam ? ROAM_DECL : ''}
        ${flora ? FLORA_VERTEX_DECL : 'attribute float leafMask; attribute vec3 cardUv;'}
        attribute float leafShade;
        attribute vec3 leafTint;
        varying vec3 vCard;
        varying float vDay;
        ${day ? 'uniform vec3 uSunDir;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCard = cardUv;
        ${surfaces ? SURFACE_VERTEX : ''}
        ${flora ? FLORA_VERTEX : ''}
        ${roam ? ROAM_VERTEX : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz = mix(color.xyz, leafTint, leafMask) * instanceColor.xyz * (1.0 - leafShade);
        #endif
        vDay = 1.0;
        ${day ? `#ifdef USE_INSTANCING
          // The sun's height over this prop's horizon (the globe is centered on the origin).
          vDay = smoothstep(-0.03, 0.08, dot(normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz), uSunDir));
        #else
          // (Merged models, placed in the world: by where each vertex stands.)
          vDay = smoothstep(-0.03, 0.08, dot(normalize((modelMatrix * vec4(position, 1.0)).xyz), uSunDir));
        #endif` : ''}`);
    let frag = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vDay;
        varying vec3 vCard;
        ${surfaces ? `varying vec3 vSurfP; varying vec3 vSurfN; uniform float uStorey; ${SURFACE_FRAGMENT}` : ''}
        ${flora ? `${CARD_TEXEL} ${BARK_GLSL}` : ''}
        ${GRADE_GLSL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= vDay;
        reflectedLight.directSpecular *= vDay;`)
      .replace('#include <opaque_fragment>', `
        #if NUM_DIR_LIGHTS > 0
          outgoingLight += diffuseColor.rgb * ${bounce.toFixed(3)} * vDay * smoothstep(-0.1, 0.4, dot(normal, directionalLights[0].direction));
          ${flora ? `// (Leaves seen against the sun glow with its light through them.)
          if (vCard.z > 0.5 && vCard.z < 1.5) outgoingLight += diffuseColor.rgb * vec3(1.0, 0.85, 0.45) * 0.7 * vDay * pow(max(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0), 2.0);` : ''}
        #else
          outgoingLight += diffuseColor.rgb * ${bounce.toFixed(3)} * vDay;
        #endif
        outgoingLight = grade(outgoingLight, ${saturation.toFixed(3)}) * 0.9;
        #include <opaque_fragment>`);
    // (A card's two sides share its outward normal, so light never falls
    // into the clump; a flat leaf's (vCard.z -1) share its normal up.)
    if (surfaces) frag = frag.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= surfaceShade(diffuseColor.rgb, vSurfP, normalize(vSurfN));`);
    if (flora) frag = frag.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (abs(vCard.z) > 0.5) normal *= faceDirection;`);
    if (flora) frag = frag.replace('#include <color_fragment>', `#include <color_fragment>
        // (Wood, a trunk, a limb, a log: bark.)
        if (vBark.w < 0.5 && abs(vCard.z) < 0.5) diffuseColor.rgb *= barkShade(vBark.xyz);
        // A leaf card: its leaves cut out of it; seen edge-on it thins out
        // and goes (no hard edges).
        if (vCard.z > 0.5) {
          vec4 lt = cardTexel(vCard);
          vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          float facing = abs(dot(fn, normalize(vViewPosition)));
          // (Nearly edge-on, a crown's card is a sliver: gone.)
          if ((vCard.z < 1.5 && facing < 0.16) || lt.a < mix(0.97, 0.5, smoothstep(0.12, 0.4, facing))) discard;
          diffuseColor.rgb *= lt.r;
          // (A spray's heart lies inside the crown, in its shade; its tips in the light.)
          if (vCard.z < 1.5) diffuseColor.rgb *= mix(0.62, 1.14, smoothstep(0.1, 0.95, length(vCard.xy - 0.5) * 2.0));
        }`);
    shader.fragmentShader = frag;
  };
  // Distinct programs per bounce, saturation and sun.
  mat.customProgramCacheKey = () => `prop-${bounce}-${saturation}-${day}-${!!flora}-${smooth}-${!!roam}-${surfaces ?? 0}`;
  return mat;
}

// A geometry sharing a prop model's buffers, with its own per-instance leaf
// colors and walkers' circles (ROAM: 0, their small loop).
export function instanceGeometry(model: THREE.BufferGeometry, capacity: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(model.attributes)) g.setAttribute(name, attr);
  g.setAttribute('leafTint', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  g.setAttribute('wander', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
  return g;
}

// A tree's far model, for when it is a few pixels tall: its crown as one
// solid octahedron (8 triangles) fitted to the leaves: as tall as they
// reach, widest at the height where they spread widest (low for a conifer,
// midway for a broadleaf), a little slimmer than their outline (cards let
// light through), darker underneath like the crown. The trunk is left out.
export function farGeometry(model: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = model.getAttribute('position'), mask = model.getAttribute('leafMask');
  let cx = 0, cz = 0, n = 0, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (mask.getX(i) < 0.5) continue;
    cx += pos.getX(i); cz += pos.getZ(i); n++;
    y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i));
  }
  if (n === 0) { y0 = 0; y1 = 1; n = 1; }
  cx /= n; cz /= n;
  let rx = 0, rz = 0, spread = 0, ym = (y0 + y1) / 2;
  for (let i = 0; i < pos.count; i++) {
    if (mask.getX(i) < 0.5) continue;
    const dx = pos.getX(i) - cx, dz = pos.getZ(i) - cz, r = Math.hypot(dx, dz);
    rx = Math.max(rx, Math.abs(dx)); rz = Math.max(rz, Math.abs(dz));
    if (r > spread) { spread = r; ym = pos.getY(i); }
  }
  ym = Math.min(Math.max(ym, y0 + 0.15 * (y1 - y0)), y0 + 0.75 * (y1 - y0));
  const k = 0.85;
  const top = [cx, y1, cz], bot = [cx, y0, cz];
  const ring = [[cx + k * rx, ym, cz], [cx, ym, cz + k * rz], [cx - k * rx, ym, cz], [cx, ym, cz - k * rz]];
  const p: number[] = [], shade: number[] = [];
  for (let s = 0; s < 4; s++) {
    const a = ring[s]!, b = ring[(s + 1) % 4]!;
    p.push(...top, ...b, ...a); shade.push(0, 0, 0);
    p.push(...bot, ...a, ...b); shade.push(0.35, 0.15, 0.15);
  }
  const g = new THREE.BufferGeometry();
  const V = p.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(V * 3).fill(1), 3));
  g.setAttribute('leafMask', new THREE.Float32BufferAttribute(new Array(V).fill(1), 1));
  g.setAttribute('leafShade', new THREE.Float32BufferAttribute(shade, 1));
  g.setAttribute('cardUv', new THREE.Float32BufferAttribute(new Array(V * 3).fill(0), 3));
  g.computeVertexNormals();
  return g;
}
