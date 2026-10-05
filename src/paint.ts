// The terrain painting: which tile's material shows at each point of the
// globe. Tiles stay the game truth; the painting is derived from them.
//
// 1. Warp. One smooth vector field δ(x) pushes every border sideways: a
//    region-scale layer (a few tiles across) bends whole coastlines and forest
//    edges, a tile-scale layer adds bends along each border. |δ| ≤ WARP_MAX.
//    It is a single field, so both sides of a border, and the three borders
//    at a corner, always agree.
// 2. Soft weights. Each tile's weight falls off over a rounding width B
//    around its (warped) edges.
// 3. Sharpening. Weights of tiles with the same look (same group) are summed
//    and the groups are sharpened against each other. Same-look tiles merge
//    without a seam, and a region's zigzag hex outline turns into a rounded
//    one (blur, then threshold).
//
// The warp is evaluated per vertex on the CPU and interpolated by the GPU,
// so the shader does no noise work for it. The shader adds a tiny fine
// wiggle (at most FINE_MAX) that the CPU ignores.
//
// Coordinates. The mesh splits each tile into fans, one per edge. Fan i of
// tile t lies between corners c_i and c_{i+1}. A point in it can only be
// painted by t or by the tiles across its three nearest edges:
//   A = across edge i-1 (c_{i-1}–c_i), B = across edge i (c_i–c_{i+1}),
//   C = across edge i+1 (c_{i+1}–c_{i+2}).
// Five boundaries matter: the three real edges, plus the A|B and B|C
// boundaries, which start at corners c_i and c_{i+1} and continue the
// spokes from t's center outward (exact on a regular hex grid).

import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import type { BiomeKey, FeatureKey } from './terrain.ts';

// ---------- rules ----------

export type GroundClass = 'water' | 'ice' | 'arid' | 'grass' | 'forest' | 'wet' | 'rock';

export const BIOME_CLASS: Record<BiomeKey, GroundClass> = {
  ocean: 'water', shallowSea: 'water', lake: 'water',
  seaIce: 'ice', iceSheet: 'ice',
  hotDesert: 'arid', coldDesert: 'arid', savanna: 'arid', steppe: 'arid',
  tundra: 'grass', prairie: 'grass', mediterranean: 'grass',
  taiga: 'forest', temperateForest: 'forest', temperateRainforest: 'forest', monsoonForest: 'forest', jungle: 'forest',
};

// null = the biome's class decides.
export const FEATURE_CLASS: Record<FeatureKey, GroundClass | null> = {
  marsh: 'wet', swamp: 'wet', mangrove: 'wet', bog: 'wet', floodplain: 'wet', oasis: 'wet',
  volcano: 'rock', glacier: null, reef: null, kelp: null,
};

// warp: share of the warp field a border follows (0 = stays on the edge).
// round: rounding width B, as a share of the tile's inner radius.
export interface PairRule { warp: number; round: number }

// A pair of classes takes the calmer warp and the wider rounding of the two,
// unless an override names the pair (either order).
export const CLASS_RULES: Record<GroundClass, PairRule> = {
  water:  { warp: 1,    round: 0.4 },
  ice:    { warp: 0.6,  round: 0.2 },
  arid:   { warp: 1,    round: 0.5 },
  grass:  { warp: 1,    round: 0.5 },
  forest: { warp: 1,    round: 0.45 },
  wet:    { warp: 0.55, round: 0.25 }, // features carry yields: they stay closer to their tile
  rock:   { warp: 0.9,  round: 0.45 },
};
type ClassPair = `${GroundClass}-${GroundClass}`;
export const PAIR_OVERRIDES: Partial<Record<ClassPair, PairRule>> = {
  'ice-water': { warp: 0.5, round: 0.12 }, // ice floes read sharp
};
// Borders along rivers stay near the river (P5).
export const RIVER_RULE: PairRule = { warp: 0.2, round: 0.12 };

export function pairRule(a: GroundClass, b: GroundClass): PairRule {
  const o = PAIR_OVERRIDES[`${a}-${b}`] ?? PAIR_OVERRIDES[`${b}-${a}`];
  if (o) return o;
  const ra = CLASS_RULES[a], rb = CLASS_RULES[b];
  return { warp: Math.min(ra.warp, rb.warp), round: Math.max(ra.round, rb.round) };
}

// Warp layers (shares of the inner radius): amplitude and wavelength.
export const WARP_LAYERS = [
  { amp: 0.36, wavelength: 8 },   // region scale: ~4 tiles
  { amp: 0.18, wavelength: 3 },   // a tile and a half
  { amp: 0.09, wavelength: 1.2 }, // bends along each border
] as const;
export const WARP_MAX = WARP_LAYERS.reduce((a, l) => a + l.amp, 0);
// GPU-only fine wiggle (share of the inner radius) and its wavelength.
export const FINE_MAX = 0.035;
export const FINE_WAVELENGTH = 0.7;
// Sharpening between groups: higher = crisper region outlines.
export const SHARPEN = 6;

export function tileClass(map: MapData, t: number): GroundClass {
  const f = map.feature[t];
  const fc = f ? FEATURE_CLASS[f] : null;
  if (fc) return fc;
  const bc = BIOME_CLASS[map.biome[t]];
  if (map.relief[t] === 'mountains' && bc !== 'water' && bc !== 'ice') return 'rock';
  return bc;
}

// Tiles that look alike share a group: their borders do not show. Relief is
// not part of it: hills and mountains get their look from the height field.
export function tileGroupKey(map: MapData, t: number): string {
  return `${map.biome[t]}|${map.feature[t] ?? ''}`;
}

// ---------- noise ----------

// 32-bit integer hash of a lattice cell and a seed.
export function cellHash(x: number, y: number, z: number, s: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(s, -1640531535)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
const cellValue = (x: number, y: number, z: number, s: number) => (cellHash(x, y, z, s) >>> 8) / 16777215;

// Value noise in [0, 1] with smoothstep interpolation.
export function valueNoise(px: number, py: number, pz: number, s: number): number {
  const fx = Math.floor(px), fy = Math.floor(py), fz = Math.floor(pz);
  let ux = px - fx, uy = py - fy, uz = pz - fz;
  ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy); uz = uz * uz * (3 - 2 * uz);
  const v = (dx: number, dy: number, dz: number) => cellValue(fx + dx, fy + dy, fz + dz, s);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(v(0, 0, 0), v(1, 0, 0), ux), l(v(0, 1, 0), v(1, 1, 0), ux), uy),
    l(l(v(0, 0, 1), v(1, 0, 1), ux), l(v(0, 1, 1), v(1, 1, 1), ux), uy),
    uz);
}

export interface PaintParams {
  r0: number;   // mean tile inner radius (radians); rule shares are relative to it
  seed: number;
}

// The warp field at unit direction (x, y, z), in radians (|δ| ≤ WARP_MAX·r0).
export function warpAt(params: PaintParams, x: number, y: number, z: number, out: number[] = [0, 0, 0]): number[] {
  out[0] = 0; out[1] = 0; out[2] = 0;
  WARP_LAYERS.forEach((layer, li) => {
    const f = 1 / (layer.wavelength * params.r0);
    const s = (params.seed ^ Math.imul(0x9e3779b9, li + 1)) | 0;
    // Value noise mostly stays near its middle: stretch it, then keep the
    // vector inside the unit ball so the bound holds.
    const vx = Math.min(1, Math.max(-1, (valueNoise(x * f, y * f, z * f, s) - 0.5) * 3.2));
    const vy = Math.min(1, Math.max(-1, (valueNoise(x * f + 31.7, y * f, z * f, s + 1) - 0.5) * 3.2));
    const vz = Math.min(1, Math.max(-1, (valueNoise(x * f, y * f - 17.3, z * f, s + 2) - 0.5) * 3.2));
    const k = (layer.amp * params.r0) / Math.max(1, Math.hypot(vx, vy, vz));
    out[0] += vx * k; out[1] += vy * k; out[2] += vz * k;
  });
  return out;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- per-fan data ----------

// Boundaries of a fan, in order: edge i-1, edge i, edge i+1, A|B, B|C.
export interface FanRules {
  ids: [number, number, number, number]; // t, A, B, C
  warp: number[];  // 5 warp shares
  round: number[]; // 5 rounding widths (radians)
  river: number[]; // 3 (real edges): river strength 0..1, 0 = no river
}

export interface PaintData {
  params: PaintParams;
  fanStart: Int32Array; // first fan id of each tile; fan id = fanStart[t] + i
  fans: FanRules[];
  group: Int32Array;    // per tile: tiles with the same group look alike
  edgeRiver: Map<number, number>; // edge key -> river strength 0..1
}

export const edgeKey = (n: number, a: number, b: number) => Math.min(a, b) * n + Math.max(a, b);

export function buildPaintData(globe: Globe, map: MapData, worldSeed: number): PaintData {
  const { tiles } = globe;
  const N = tiles.length;
  // Mean inner radius: angular distance from each center to its edge planes.
  let sum = 0, count = 0;
  for (const tile of tiles) {
    const k = tile.corners.length;
    for (let i = 0; i < k; i++) {
      const p = globe.triCenters[tile.corners[i]], q = globe.triCenters[tile.corners[(i + 1) % k]];
      sum += Math.abs(p.clone().cross(q).normalize().dot(tile.center)); count++;
    }
  }
  const r0 = sum / count;
  const params: PaintParams = { r0, seed: worldSeed | 0 };

  // River strength per edge, from the flow it carries.
  const edgeRiver = new Map<number, number>();
  const maxFlow = Math.max(1, ...map.rivers.flatMap((r) => r.flow));
  for (const r of map.rivers) {
    for (let k = 0; k + 1 < r.corners.length; k++) {
      const pair = borderTilesOf(globe, r.corners[k], r.corners[k + 1]);
      if (!pair) continue;
      const key = edgeKey(N, pair[0], pair[1]);
      edgeRiver.set(key, Math.max(edgeRiver.get(key) ?? 0, 0.25 + 0.75 * Math.sqrt(r.flow[k] / maxFlow)));
    }
  }

  const cls = tiles.map((t) => tileClass(map, t.id));
  const groupIds = new Map<string, number>();
  const group = Int32Array.from(tiles, (t) => {
    const key = tileGroupKey(map, t.id);
    let g = groupIds.get(key);
    if (g === undefined) { g = groupIds.size; groupIds.set(key, g); }
    return g;
  });
  const rule = (a: number, b: number): PairRule =>
    edgeRiver.has(edgeKey(N, a, b)) ? RIVER_RULE : pairRule(cls[a], cls[b]);
  const fanStart = new Int32Array(N + 1);
  for (let t = 0; t < N; t++) fanStart[t + 1] = fanStart[t] + tiles[t].corners.length;
  const fans: FanRules[] = [];
  for (const tile of tiles) {
    const t = tile.id, k = tile.corners.length;
    for (let i = 0; i < k; i++) {
      const A = tile.neighbors[(i + k - 1) % k], B = tile.neighbors[i], C = tile.neighbors[(i + 1) % k];
      const rules = [rule(t, A), rule(t, B), rule(t, C), rule(B, A), rule(B, C)];
      fans.push({
        ids: [t, A, B, C],
        warp: rules.map((r) => r.warp),
        round: rules.map((r) => r.round * r0),
        river: [A, B, C].map((nb) => edgeRiver.get(edgeKey(N, t, nb)) ?? 0),
      });
    }
  }
  return { params, fanStart, fans, group, edgeRiver };
}

// The two tiles on either side of the border between corners c1 and c2.
function borderTilesOf(globe: Globe, c1: number, c2: number): [number, number] | null {
  const a = globe.tris[c1], b = globe.tris[c2];
  const shared = a.filter((x) => b.includes(x));
  return shared.length === 2 ? [shared[0], shared[1]] : null;
}

// ---------- per-point coordinates ----------

// Plane normals of a fan's five boundaries, each oriented toward its
// reference tile (t for the real edges, B for A|B and B|C). The signed
// distance of a point to boundary j is dot(point, normal j).
export interface FanFrame {
  n: number[]; // 5 × xyz
}

const frames = new WeakMap<Globe, FanFrame[]>();

export function fanFrames(globe: Globe): FanFrame[] {
  let f = frames.get(globe);
  if (f) return f;
  f = [];
  for (const tile of globe.tiles) {
    const k = tile.corners.length, ctr = tile.center;
    const C = (j: number) => globe.triCenters[tile.corners[((j % k) + k) % k]];
    for (let i = 0; i < k; i++) {
      const n: number[] = [];
      for (let j = 0; j < 3; j++) {
        const v = C(i - 1 + j).clone().cross(C(i + j)).normalize();
        if (v.dot(ctr) < 0) v.negate();
        n.push(v.x, v.y, v.z);
      }
      for (let j = 0; j < 2; j++) {
        const c = C(i + j), toward = C(i + 1 - j); // B lies on the side of the other fan corner
        const m = ctr.clone().cross(c).normalize();
        if (m.dot(toward) < 0) m.negate();
        n.push(m.x, m.y, m.z);
      }
      f.push({ n });
    }
  }
  frames.set(globe, f);
  return f;
}

// Warped signed distances of point (x, y, z) to the fan's five boundaries
// (vertex attributes in the shader): distance + warp share × (δ · normal).
export const FAN_COORDS = 5;

export function fanCoords(fr: FanFrame, fan: FanRules, delta: ArrayLike<number>, x: number, y: number, z: number,
  out: Float32Array | number[], off = 0): void {
  for (let j = 0; j < 5; j++) {
    const nx = fr.n[3 * j], ny = fr.n[3 * j + 1], nz = fr.n[3 * j + 2];
    out[off + j] = x * nx + y * ny + z * nz + fan.warp[j] * (delta[0] * nx + delta[1] * ny + delta[2] * nz);
  }
}

// ---------- the painting ----------

export interface PaintSample {
  w: [number, number, number, number]; // weights of fan.ids (t, A, B, C), summing to 1
  s: [number, number, number];          // warped distances to the 3 real edges
}

// Weights of the four candidate tiles at a point, from its warped distances
// `s` (fanCoords). Mirrored in the shader (terrainMaterial.ts).
export function paintAt(data: PaintData, fanId: number, s: ArrayLike<number>): PaintSample {
  const fan = data.fans[fanId];
  const edges: [number, number, number] = [s[0], s[1], s[2]];
  if (s[0] >= fan.round[0] && s[1] >= fan.round[1] && s[2] >= fan.round[2]) return { w: [1, 0, 0, 0], s: edges };
  const sig = (u: number) => smoothstep(-1, 1, u);
  const c0 = sig(-s[0] / fan.round[0]), c1 = sig(-s[1] / fan.round[1]), c2 = sig(-s[2] / fan.round[2]);
  const sL = s[3] / fan.round[3], sR = s[4] / fan.round[4];
  const w = [
    (1 - c0) * (1 - c1) * (1 - c2),
    c0 * sig(-sL),
    c1 * sig(sL) * sig(sR),
    c2 * sig(-sR),
  ];
  return { w: sharpen(w, fan.ids.map((t) => data.group[t])), s: edges };
}

// Sums the weights of each group, sharpens the groups against each other and
// shares each group's result among its tiles.
export function sharpen(w: number[], g: number[]): [number, number, number, number] {
  const total = w[0] + w[1] + w[2] + w[3];
  if (total < 1e-9) return [1, 0, 0, 0];
  const S = [0, 0, 0, 0];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (g[a] === g[b]) S[a] += w[b] / total;
  const p = S.map((x) => x ** SHARPEN);
  let D = 0;
  for (let a = 0; a < 4; a++) if (S[a] > 0) D += (w[a] / total / S[a]) * p[a];
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let a = 0; a < 4; a++) out[a] = S[a] > 0 ? (w[a] / total / S[a]) * p[a] / D : 0;
  return out;
}
