// The terrain painting: which tile's material shows at each point of the
// globe. Tiles stay the game truth; the painting is derived from them.
//
// Every tile border becomes a wobbly curve that stays inside a thin band
// around the real edge: the border is pushed sideways by smooth noise of
// amplitude A (at most WOBBLE_MAX of the tile's inner radius) and softened
// over a blend half-width B. Points farther than A + B from every border are
// painted 100% in their own tile, so every tile is mostly its own terrain.
//
// The painting is drawn per pixel by the terrain shader (terrainMaterial.ts)
// and evaluated here on the CPU for props and tests. Both use the same
// integer hash noise and the same formulas, so they agree; keep them in sync.
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

// wobble = border push A, blend = soft half-width B, both as a share of the
// tile's inner radius.
export interface PairRule { wobble: number; blend: number }

// A pair of classes takes the calmer wobble and the softer blend of the two,
// unless an override names the pair (either order).
export const CLASS_RULES: Record<GroundClass, PairRule> = {
  water:  { wobble: 0.14, blend: 0.10 },
  ice:    { wobble: 0.12, blend: 0.06 },
  arid:   { wobble: 0.18, blend: 0.08 },
  grass:  { wobble: 0.18, blend: 0.08 },
  forest: { wobble: 0.18, blend: 0.06 },
  wet:    { wobble: 0.10, blend: 0.06 }, // features carry yields: they stay in their tile
  rock:   { wobble: 0.15, blend: 0.11 },
};
type ClassPair = `${GroundClass}-${GroundClass}`;
export const PAIR_OVERRIDES: Partial<Record<ClassPair, PairRule>> = {
  'ice-water': { wobble: 0.10, blend: 0.04 },  // ice floes read sharp
  'arid-grass': { wobble: 0.16, blend: 0.10 }, // savanna fading into prairie
};
// Borders along rivers follow the river's meander.
export const RIVER_RULE: PairRule = { wobble: 0.14, blend: 0.05 };

export function pairRule(a: GroundClass, b: GroundClass): PairRule {
  const o = PAIR_OVERRIDES[`${a}-${b}`] ?? PAIR_OVERRIDES[`${b}-${a}`];
  if (o) return o;
  const ra = CLASS_RULES[a], rb = CLASS_RULES[b];
  return { wobble: Math.min(ra.wobble, rb.wobble), blend: Math.max(ra.blend, rb.blend) };
}

// The largest wobble + blend any border can have: the pure core of every
// tile starts this far (as a share of the inner radius) from its edges.
export const BAND_MAX = Math.max(
  RIVER_RULE.wobble + RIVER_RULE.blend,
  ...(Object.keys(CLASS_RULES) as GroundClass[]).flatMap((a) =>
    (Object.keys(CLASS_RULES) as GroundClass[]).map((b) => { const r = pairRule(a, b); return r.wobble + r.blend; })),
);

export function tileClass(map: MapData, t: number): GroundClass {
  const f = map.feature[t];
  const fc = f ? FEATURE_CLASS[f] : null;
  if (fc) return fc;
  const bc = BIOME_CLASS[map.biome[t]];
  if (map.relief[t] === 'mountains' && bc !== 'water' && bc !== 'ice') return 'rock';
  return bc;
}

// ---------- noise (mirrored in GLSL: terrainMaterial.ts PAINT_GLSL) ----------

// 32-bit integer hash of a lattice cell and a seed. Inputs are int32 and
// wrap exactly like GLSL uint arithmetic.
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

// Border noise in [-1, 1] for one border (seed), sampled at a unit direction.
// freq = lattice cells per radian. Value noise mostly stays near its middle,
// so it is stretched (and clamped) to use the whole band.
export function borderNoise(x: number, y: number, z: number, seed: number, freq: number): number {
  const n1 = valueNoise(x * freq, y * freq, z * freq, seed);
  const n2 = valueNoise(x * freq * 2.03 + 7.1, y * freq * 2.03 + 7.1, z * freq * 2.03 + 7.1, seed + 1);
  return Math.min(1, Math.max(-1, ((n1 + 0.5 * n2) / 1.5 - 0.5) * 3.2));
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- per-fan data ----------

export interface PaintParams {
  r0: number;    // mean tile inner radius (radians); rule shares are relative to it
  taper: number; // distance from a corner over which a border's wobble fades in
  freq: number;  // border noise frequency (cells per radian)
}

// Boundaries of a fan, in order: edge i-1, edge i, edge i+1, A|B, B|C.
export interface FanRules {
  ids: [number, number, number, number]; // t, A, B, C
  amp: number[];   // 5 wobble amplitudes (radians)
  blend: number[]; // 5 blend half-widths (radians)
  seed: number[];  // 5 noise seeds, signed: + when the reference tile has the smaller id
  river: number[]; // 3 (real edges): river strength 0..1, 0 = no river
}

export interface PaintData {
  params: PaintParams;
  fanStart: Int32Array; // first fan id of each tile; fan id = fanStart[t] + i
  fans: FanRules[];
  edgeRiver: Map<number, number>; // edge key -> river strength 0..1
}

export const edgeKey = (n: number, a: number, b: number) => Math.min(a, b) * n + Math.max(a, b);

function borderSeed(worldSeed: number, a: number, b: number): number {
  return 1 + (cellHash(Math.min(a, b), Math.max(a, b), 0x5eed, worldSeed | 0) >>> 9); // < 2^23, exact in float32
}

export function buildPaintData(globe: Globe, map: MapData, worldSeed: number): PaintData {
  const { tiles } = globe;
  const N = tiles.length;
  // Mean inner radius: angular distance from each center to its edge planes.
  let sum = 0, count = 0;
  for (const tile of tiles) {
    const k = tile.corners.length;
    for (let i = 0; i < k; i++) {
      const p = globe.triCenters[tile.corners[i]], q = globe.triCenters[tile.corners[(i + 1) % k]];
      const n = p.clone().cross(q).normalize();
      sum += Math.abs(n.dot(tile.center)); count++;
    }
  }
  const r0 = sum / count;
  const params: PaintParams = { r0, taper: 0.22 * globe.avgEdgeAngle, freq: 3.4 / globe.avgEdgeAngle };

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
  const rule = (a: number, b: number): PairRule =>
    edgeRiver.has(edgeKey(N, a, b)) ? RIVER_RULE : pairRule(cls[a], cls[b]);
  const fanStart = new Int32Array(N + 1);
  for (let t = 0; t < N; t++) fanStart[t + 1] = fanStart[t] + tiles[t].corners.length;
  const fans: FanRules[] = [];
  for (const tile of tiles) {
    const t = tile.id, k = tile.corners.length;
    for (let i = 0; i < k; i++) {
      const A = tile.neighbors[(i + k - 1) % k], B = tile.neighbors[i], C = tile.neighbors[(i + 1) % k];
      // Reference tile per boundary: t for real edges, B for the virtual ones.
      const bounds: [number, number][] = [[t, A], [t, B], [t, C], [B, A], [B, C]];
      const rules = bounds.map(([a, b]) => rule(a, b));
      fans.push({
        ids: [t, A, B, C],
        amp: rules.map((r) => r.wobble * r0),
        blend: rules.map((r) => r.blend * r0),
        seed: bounds.map(([a, b]) => (a < b ? 1 : -1) * borderSeed(worldSeed, a, b)),
        river: [A, B, C].map((nb) => edgeRiver.get(edgeKey(N, t, nb)) ?? 0),
      });
    }
  }
  return { params, fanStart, fans, edgeRiver };
}

// The two tiles on either side of the border between corners c1 and c2.
function borderTilesOf(globe: Globe, c1: number, c2: number): [number, number] | null {
  const a = globe.tris[c1], b = globe.tris[c2];
  const shared = a.filter((x) => b.includes(x));
  return shared.length === 2 ? [shared[0], shared[1]] : null;
}

// ---------- per-point coordinates (vertex attributes in the shader) ----------

// 13 numbers per point of fan i of tile t, all linear in the point:
//   d[3]  signed distance to edges i-1, i, i+1 (positive inside t)
//   a[3]  distance along each edge from its first corner
//   b[3]  distance along each edge from its second corner
//   z[2]  signed distance to the A|B and B|C boundaries (positive toward B)
//   za[2] distance outward from corner c_i / c_{i+1} along those boundaries
export const FAN_COORDS = 13;

export interface FanFrame {
  n: number[];  // 3 edge plane normals (xyz each), oriented toward t
  p: number[];  // 3 edge start corners
  u: number[];  // 3 edge unit directions (start -> end)
  len: number[]; // 3 edge chord lengths
  m: number[];  // 2 boundary plane normals, oriented toward B
  c: number[];  // 2 boundary start corners (c_i, c_{i+1})
  o: number[];  // 2 outward directions at those corners
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
      const fr: FanFrame = { n: [], p: [], u: [], len: [], m: [], c: [], o: [] };
      for (let j = 0; j < 3; j++) {
        const p = C(i - 1 + j), q = C(i + j);
        const n = p.clone().cross(q).normalize();
        if (n.dot(ctr) < 0) n.negate();
        const d = q.clone().sub(p);
        const len = d.length();
        d.divideScalar(len);
        fr.n.push(n.x, n.y, n.z); fr.p.push(p.x, p.y, p.z); fr.u.push(d.x, d.y, d.z); fr.len.push(len);
      }
      for (let j = 0; j < 2; j++) {
        const c = C(i + j), toward = C(i + 1 - j); // B lies on the side of the other fan corner
        const m = ctr.clone().cross(c).normalize();
        if (m.dot(toward) < 0) m.negate();
        const o = c.clone().sub(ctr).normalize();
        fr.m.push(m.x, m.y, m.z); fr.c.push(c.x, c.y, c.z); fr.o.push(o.x, o.y, o.z);
      }
      f.push(fr);
    }
  }
  frames.set(globe, f);
  return f;
}

export function fanCoords(fr: FanFrame, x: number, y: number, z: number, out: Float32Array | number[], off = 0): void {
  for (let j = 0; j < 3; j++) {
    const n = 3 * j;
    out[off + j] = x * fr.n[n] + y * fr.n[n + 1] + z * fr.n[n + 2];
    const a = (x - fr.p[n]) * fr.u[n] + (y - fr.p[n + 1]) * fr.u[n + 1] + (z - fr.p[n + 2]) * fr.u[n + 2];
    out[off + 3 + j] = a;
    out[off + 6 + j] = fr.len[j] - a;
  }
  for (let j = 0; j < 2; j++) {
    const n = 3 * j;
    out[off + 9 + j] = x * fr.m[n] + y * fr.m[n + 1] + z * fr.m[n + 2];
    out[off + 11 + j] = (x - fr.c[n]) * fr.o[n] + (y - fr.c[n + 1]) * fr.o[n + 1] + (z - fr.c[n + 2]) * fr.o[n + 2];
  }
}

// ---------- the painting ----------

// Signed distance from a point to boundary j after the wobble (positive on
// the reference tile's side). Exported for river curves.
export function warpedDistance(params: PaintParams, fan: FanRules, j: number, dist: number, taper: number,
  x: number, y: number, z: number): number {
  const seed = fan.seed[j];
  if (fan.amp[j] === 0 || taper === 0) return dist;
  const eta = borderNoise(x, y, z, Math.abs(seed), params.freq);
  return dist + fan.amp[j] * taper * eta * Math.sign(seed);
}

export interface PaintSample {
  w: [number, number, number, number]; // weights of fan.ids (t, A, B, C), summing to 1
  s: [number, number, number];          // warped distances to the 3 real edges
}

// Weights of the four candidate tiles at a point with coordinates `co`
// (from fanCoords) and unit direction (x, y, z).
export function paintAt(params: PaintParams, fan: FanRules, co: ArrayLike<number>, x: number, y: number, z: number): PaintSample {
  const T = params.taper;
  const tap = (a: number, b: number) => smoothstep(0, T, a) * smoothstep(0, T, b);
  const sig = (u: number) => smoothstep(-1, 1, u);
  const s: [number, number, number] = [0, 0, 0];
  const cross = [0, 0, 0];
  for (let j = 0; j < 3; j++) {
    const d = co[j];
    if (d >= fan.amp[j] + fan.blend[j]) { s[j] = d; continue; }
    s[j] = warpedDistance(params, fan, j, d, tap(co[3 + j], co[6 + j]), x, y, z);
    cross[j] = sig(-s[j] / fan.blend[j]);
  }
  if (cross[0] === 0 && cross[1] === 0 && cross[2] === 0) return { w: [1, 0, 0, 0], s };
  const sL = warpedDistance(params, fan, 3, co[9], smoothstep(0, T, co[11]), x, y, z);
  const sR = warpedDistance(params, fan, 4, co[10], smoothstep(0, T, co[12]), x, y, z);
  const wt = (1 - cross[0]) * (1 - cross[1]) * (1 - cross[2]);
  const wA = cross[0] * sig(-sL / fan.blend[3]);
  const wB = cross[1] * sig(sL / fan.blend[3]) * sig(sR / fan.blend[4]);
  const wC = cross[2] * sig(-sR / fan.blend[4]);
  const sum = wt + wA + wB + wC;
  if (sum < 1e-9) return { w: [1, 0, 0, 0], s };
  return { w: [wt / sum, wA / sum, wB / sum, wC / sum], s };
}
