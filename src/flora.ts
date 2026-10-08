// Which variant of its biome (and feature) each tile shows. A pure function
// of the map and the seed, computed once per game.
//
// 1. Realm per landmass: each connected landmass gets a flora realm, a seeded
//    pick weighted by its mean latitude. Landmasses over SPLIT tiles are cut in
//    two by a seeded great circle, each side with its own realm; islands under
//    ISLAND tiles take the realm of the nearest large landmass.
// 2. Biome patches (connected tiles of one biome and realm) are split into regions of
//    REGION_MIN..REGION_MAX tiles (smaller patches are one region).
// 3. Each region picks a variant of its biome allowed in its realm (any
//    variant if the realm has none), weighted by how well the region's climate
//    fits the variant's preference, and keeps a neighboring region's variant
//    SAME_AS_NEIGHBOR of the time, so the result is not a patchwork.
// 4. Hill tiles use their biome's hills variant when it has one (tropical
//    temperate-rainforest hills: cloud forest). Features use their first variant whose biomes and realms match.

import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import type { BiomeKey } from './terrain.ts';
import { components } from './mapRules.ts';
import { isWaterKey } from './mapRules.ts';
import { mulberry32, type Rng } from './rng.ts';
import { BIOME_FLORA, FEATURE_FLORA, REALMS, realmAllows, type Realm, type Variant } from './floraData.ts';

export const SPLIT = 300;
export const ISLAND = 15;
export const REGION_MIN = 12;
export const REGION_MAX = 30;
const REGION_TARGET = 22;
const SAME_AS_NEIGHBOR = 0.6;

export interface Flora {
  landmass: Int32Array;   // per tile, -1 on water
  realm: (Realm | null)[]; // per tile, null on water
  region: Int32Array;     // per land tile, -1 on water
  variant: Int16Array;    // index into BIOME_FLORA[biome].variants (every tile)
  featureVariant: Int16Array; // index into FEATURE_FLORA[feature].variants, -1 without a feature
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function pickWeighted<T>(items: readonly T[], weight: (x: T) => number, rand: Rng): T {
  const w = items.map(weight);
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r < 0) return items[i]; }
  return items[items.length - 1];
}

// Realm weights by signed mean latitude (degrees, north > 0).
function realmWeight(realm: Realm, lat: number): number {
  switch (realm) {
    case 'northern': return 1 + 3 * smoothstep(15, 45, lat);
    case 'austral': return 1 + 3 * smoothstep(15, 45, -lat);
    case 'oldWorld': case 'newWorld': return 1 + 2 * (1 - smoothstep(10, 35, Math.abs(lat)));
  }
}

export function buildFlora(globe: Globe, map: MapData, seed: number): Flora {
  const { tiles } = globe;
  const N = tiles.length;
  const rand = mulberry32(seed ^ 0xf10a);
  const land = (t: number) => !isWaterKey(map.biome[t]);
  const signedLat = (t: number) => (Math.asin(Math.max(-1, Math.min(1, tiles[t].center.y))) * 180) / Math.PI;

  // ---- 1. realms ----
  const landmass = new Int32Array(N).fill(-1);
  const realm: (Realm | null)[] = new Array(N).fill(null);
  const masses = components(globe, land);
  masses.forEach((m, i) => { for (const t of m) landmass[t] = i; });
  const centroid = (ts: readonly number[]) => {
    let x = 0, y = 0, z = 0;
    for (const t of ts) { x += tiles[t].center.x; y += tiles[t].center.y; z += tiles[t].center.z; }
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l] as const;
  };
  const meanLat = (ts: readonly number[]) => ts.reduce((a, t) => a + signedLat(t), 0) / ts.length;
  const pickRealm = (ts: readonly number[], not: Realm | null) =>
    pickWeighted(REALMS.filter((r) => r !== not), (r) => realmWeight(r, meanLat(ts)), rand);
  const large: { c: readonly [number, number, number]; i: number }[] = [];
  masses.forEach((m, i) => {
    if (m.length < ISLAND) return;
    const c = centroid(m);
    large.push({ c, i });
    if (m.length <= SPLIT) {
      const r = pickRealm(m, null);
      for (const t of m) realm[t] = r;
      return;
    }
    // A great circle through the centroid, at a seeded angle.
    let nx = rand() - 0.5, ny = rand() - 0.5, nz = rand() - 0.5;
    const d = nx * c[0] + ny * c[1] + nz * c[2];
    nx -= d * c[0]; ny -= d * c[1]; nz -= d * c[2];
    const side = (t: number) => tiles[t].center.x * nx + tiles[t].center.y * ny + tiles[t].center.z * nz >= 0;
    const a = m.filter(side), b = m.filter((t) => !side(t));
    const ra = pickRealm(a.length ? a : m, null);
    for (const t of a) realm[t] = ra;
    if (b.length) { const rb = pickRealm(b, ra); for (const t of b) realm[t] = rb; }
  });
  masses.forEach((m) => {
    if (m.length >= ISLAND) return;
    const c = centroid(m);
    let best: number | null = null, bestDot = -2;
    for (const L of large) {
      const dot = L.c[0] * c[0] + L.c[1] * c[1] + L.c[2] * c[2];
      if (dot > bestDot) { bestDot = dot; best = L.i; }
    }
    // The realm of the large landmass's tile nearest this island.
    let r: Realm | null = null;
    if (best !== null) {
      let near = -1, nd = -2;
      for (const t of masses[best]) {
        const dot = tiles[t].center.dot(tiles[m[0]].center);
        if (dot > nd) { nd = dot; near = t; }
      }
      r = realm[near];
    }
    const rr = r ?? pickRealm(m, null);
    for (const t of m) realm[t] = rr;
  });

  // ---- 2. regions ----
  const region = new Int32Array(N).fill(-1);
  const regions: number[][] = [];
  // Patches: connected tiles of one biome and one realm.
  const patches = components(globe, land).flatMap((m) => {
    const groups = new Map<string, Set<number>>();
    for (const t of m) {
      const key = `${map.biome[t]}|${realm[t]}`;
      const s = groups.get(key) ?? new Set();
      s.add(t);
      groups.set(key, s);
    }
    return [...groups.values()].flatMap((set) => components(globe, (t) => set.has(t)));
  });
  for (const patch of patches) {
    for (const part of splitPatch(globe, patch, rand)) {
      for (const t of part) region[t] = regions.length;
      regions.push(part);
    }
  }

  // ---- 3. variant per region ----
  // Climate of each biome on this map, for normalizing a region's climate to -1..1.
  const spread = new Map<BiomeKey, { t: [number, number]; r: [number, number] }>();
  const quantiles = (xs: number[]): [number, number] => {
    xs.sort((a, b) => a - b);
    return [xs[Math.floor(0.1 * (xs.length - 1))], xs[Math.ceil(0.9 * (xs.length - 1))]];
  };
  const byBiome = new Map<BiomeKey, number[]>();
  for (let t = 0; t < N; t++) if (land(t)) { const l = byBiome.get(map.biome[t]) ?? []; l.push(t); byBiome.set(map.biome[t], l); }
  for (const [b, ts] of byBiome) {
    spread.set(b, { t: quantiles(ts.map((t) => map.temperature[t])), r: quantiles(ts.map((t) => map.rainfall[t])) });
  }
  const norm = (x: number, [lo, hi]: [number, number]) => (hi - lo < 1e-6 ? 0 : Math.max(-1, Math.min(1, ((x - lo) / (hi - lo)) * 2 - 1)));
  const fit = (pref: number | undefined, x: number) => (pref === undefined ? 0.6 : Math.exp(-((x - pref) ** 2) / 0.5));

  const variant = new Int16Array(N);
  const regionVariant = new Int16Array(regions.length).fill(-1);
  regions.forEach((ts, id) => {
    const biome = map.biome[ts[0]];
    const vs = BIOME_FLORA[biome].variants;
    const rr = realm[ts[0]];
    const plain = vs.map((_, i) => i).filter((i) => !vs[i].hills);
    let allowed = plain.filter((i) => realmAllows(vs[i], rr));
    if (allowed.length === 0) allowed = plain;
    // Keep a neighbor region's variant (same patch, already decided) some of the time.
    const nbr = new Set<number>();
    for (const t of ts) for (const nb of tiles[t].neighbors) {
      const o = region[nb];
      if (o >= 0 && o !== id && map.biome[nb] === biome && realm[nb] === rr && regionVariant[o] >= 0) nbr.add(regionVariant[o]);
    }
    const keep = [...nbr].filter((i) => allowed.includes(i));
    const sameRoll = rand(), pickRoll = rand();
    let chosen: number;
    if (keep.length && sameRoll < SAME_AS_NEIGHBOR) chosen = keep[Math.floor(pickRoll * keep.length)];
    else {
      const s = spread.get(biome)!;
      const xt = norm(ts.reduce((a, t) => a + map.temperature[t], 0) / ts.length, s.t);
      const xr = norm(ts.reduce((a, t) => a + map.rainfall[t], 0) / ts.length, s.r);
      chosen = pickWeighted(allowed, (i) => fit(vs[i].warm, xt) * fit(vs[i].wet, xr) * (0.6 + 0.8 * rand()), rand);
    }
    regionVariant[id] = chosen;
    for (const t of ts) variant[t] = chosen;
  });

  // ---- 4. hills, water, features ----
  const firstMatch = (vs: readonly Variant[], t: number) => {
    const i = vs.findIndex((v) => realmAllows(v, realm[t]) && (!v.biomes || v.biomes.includes(map.biome[t]))
      && (v.maxTemp === undefined || map.temperature[t] <= v.maxTemp));
    return i >= 0 ? i : vs.length - 1;
  };
  const featureVariant = new Int16Array(N).fill(-1);
  for (let t = 0; t < N; t++) {
    const vs = BIOME_FLORA[map.biome[t]].variants;
    if (!land(t)) variant[t] = firstMatch(vs, t);
    else if (map.relief[t] === 'hills') {
      const lat = Math.abs(signedLat(t));
      const h = vs.findIndex((v) => v.hills && (v.maxLat === undefined || lat <= v.maxLat));
      if (h >= 0) variant[t] = h;
    }
    const f = map.feature[t];
    if (f) featureVariant[t] = firstMatch(FEATURE_FLORA[f].variants, t);
  }
  return { landmass, realm, region, variant, featureVariant };
}

// Splits a connected patch into connected regions of REGION_MIN..REGION_MAX
// tiles (one region when the patch is small): seeds spread far apart grow in
// turns, smallest first; then too-small regions merge into a neighbor and
// too-big ones split in two, until sizes settle.
function splitPatch(globe: Globe, patch: number[], rand: Rng): number[][] {
  if (patch.length <= REGION_MAX) return [patch];
  const inPatch = new Set(patch);
  const k = Math.max(2, Math.round(patch.length / REGION_TARGET));
  let parts = grow(globe, patch, inPatch, k, rand);
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    // Merge small regions into their smallest neighbor.
    parts.sort((a, b) => a.length - b.length);
    const owner = new Map<number, number>();
    parts.forEach((p, i) => { for (const t of p) owner.set(t, i); });
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length === 0 || parts[i].length >= REGION_MIN) continue;
      let best = -1;
      for (const t of parts[i]) for (const nb of globe.tiles[t].neighbors) {
        const o = owner.get(nb);
        if (o !== undefined && o !== i && parts[o].length > 0 && (best < 0 || parts[o].length < parts[best].length)) best = o;
      }
      if (best < 0) continue;
      for (const t of parts[i]) { parts[best].push(t); owner.set(t, best); }
      parts[i] = [];
      changed = true;
    }
    parts = parts.filter((p) => p.length > 0);
    // Split big ones.
    const next: number[][] = [];
    for (const p of parts) {
      if (p.length > REGION_MAX) {
        next.push(...grow(globe, p, new Set(p), Math.ceil(p.length / REGION_TARGET), rand));
        changed = true;
      } else next.push(p);
    }
    parts = next;
    if (!changed) break;
  }
  return parts;
}

function grow(globe: Globe, tiles: number[], inSet: Set<number>, k: number, rand: Rng): number[][] {
  const hops = (from: number[]) => {
    const d = new Map<number, number>(from.map((t) => [t, 0]));
    const q = [...from];
    for (let i = 0; i < q.length; i++) for (const nb of globe.tiles[q[i]].neighbors) {
      if (inSet.has(nb) && !d.has(nb)) { d.set(nb, d.get(q[i])! + 1); q.push(nb); }
    }
    return d;
  };
  // Seeds far apart (farthest point sampling).
  const seeds = [tiles[Math.floor(rand() * tiles.length)]];
  while (seeds.length < k) {
    const d = hops(seeds);
    let far = seeds[0], fd = -1;
    for (const t of tiles) { const x = d.get(t) ?? 0; if (x > fd) { fd = x; far = t; } }
    if (fd <= 0) break;
    seeds.push(far);
  }
  const owner = new Map<number, number>();
  const parts = seeds.map((s, i) => { owner.set(s, i); return [s]; });
  const queues = seeds.map((s) => [s]);
  const heads = seeds.map(() => 0);
  // Grow in turns, the smallest region that can still grow first.
  for (;;) {
    let best = -1;
    for (let i = 0; i < parts.length; i++) {
      // Drop frontier entries with no free neighbor left.
      while (heads[i] < queues[i].length && !globe.tiles[queues[i][heads[i]]].neighbors.some((nb) => inSet.has(nb) && !owner.has(nb))) heads[i]++;
      if (heads[i] < queues[i].length && (best < 0 || parts[i].length < parts[best].length)) best = i;
    }
    if (best < 0) break;
    const from = queues[best][heads[best]];
    const nb = globe.tiles[from].neighbors.find((x) => inSet.has(x) && !owner.has(x))!;
    owner.set(nb, best);
    parts[best].push(nb);
    queues[best].push(nb);
  }
  return parts;
}

export const biomeVariant = (map: MapData, flora: Flora, t: number): Variant =>
  BIOME_FLORA[map.biome[t]].variants[flora.variant[t]];
export const featureVariant = (map: MapData, flora: Flora, t: number): Variant | null => {
  const f = map.feature[t];
  return f ? FEATURE_FLORA[f].variants[flora.featureVariant[t]] : null;
};

// The variant's name for the tile info ("Cascadian", "Cypress swamp"), or
// null where there is nothing to name.
export function floraLabel(map: MapData, flora: Flora, t: number): string | null {
  const fv = featureVariant(map, flora, t);
  if (fv && fv.mix.length) return fv.name;
  const bv = biomeVariant(map, flora, t);
  return BIOME_FLORA[map.biome[t]].variants.length > 1 && bv.mix.length ? bv.name : null;
}
