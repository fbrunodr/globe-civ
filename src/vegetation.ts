// What stands at one prop spot. The tile's variant (flora.ts) gives a mix
// and a density; modifiers follow the land under the spot:
//   - features: 80% the feature's mix, 20% the biome variant under it;
//   - hills: fewer props (×0.8), thinner on crests and denser in hollows,
//     a few boulders and tors, more conifers in temperate forests;
//   - mountains, by height (share of the tile's nominal peak): the foot keeps
//     the biome's mix at half density, favoring conifers; above the tree
//     line (lower toward the poles) stunted spruce, boulders and scree (or the
//     volcano's / glacier's mix); the upper part stays bare;
//   - steep slopes: trees give way to boulders and scree;
//   - river banks: a riparian strip (willows, poplars, reeds; palms in dry
//     lands) at up to +50% density;
//   - sea coasts: coconut palms leaning out to sea where warm, wind-bent pines
//     leaning inland and driftwood elsewhere; lake shores: reeds and cattails;
//   - forest edges facing open land: fewer canopy trees, more shrubs;
//   - groves: noise at a 1-2 tile scale biases which species of the mix wins,
//     without changing the density (no bare clearings);
//   - each kind's water rule (propCatalog.ts): dry ground, wading, floating,
//     or on the bed under water.
// Everything is a pure function of the spot, the map and the seed.

import * as THREE from 'three';
import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import type { TileLook } from './look.ts';
import { isWaterKey, isWorldOcean } from './mapRules.ts';
import { makePerlin, mulberry32, type Noise3, type Rng } from './rng.ts';
import { WORLD_SCALE } from './worldScale.ts';
import { CATALOG, CATALOG_KINDS, catalogEntry, type CatalogKind } from './propCatalog.ts';
import {
  BANK_CLIMATE, COASTS, FOREST_FRINGE, HILL_ROCKS, LAKE_SHORES, MOUNTAIN_SLOPES, RIVER_BANKS, WARM_COASTS,
  type Entry, type Tint,
} from './floraData.ts';
import { biomeVariant, featureVariant, type Flora } from './flora.ts';

// Everything known about the ground at a spot.
export interface SpotEnv {
  t: number;        // tile the spot lies in
  i: number;        // fan of t
  r: number;        // 0 at t's center .. 1 at its edge
  u: number;        // tile whose props show here (the painting's pick)
  dir: THREE.Vector3;
  ground: number;   // ground height above radius 1
  water: number;    // water level above radius 1
  slope: number;    // ground slope, height per radian
  bank: number;     // 1 at a river's bank .. 0 at 0.3 tile radii from it
  coast: number;    // signed distance to the painted shore, tile radii (land > 0)
  inland: THREE.Vector3; // unit tangent pointing away from the shore (zero far from it)
}

export interface PropPick {
  kind: CatalogKind;
  leaf: number | null;   // leaf tint, null = the model's own
  size: number;
  height: number;        // radius-1 of where it stands (ground, or the water surface)
  lean: THREE.Vector3 | null; // tilt toward this tangent direction...
  leanAngle: number;          // ...by this angle
}

interface Mix { density: number; entries: Entry[] }

export const FEATURE_SHARE = 0.8;
const HILL_DENSITY = 0.8;
const CONIFERS: ReadonlySet<CatalogKind> = new Set(['fir', 'spruce', 'pine', 'larch', 'giantCedar', 'araucaria']);
const TREES = (k: CatalogKind) => CATALOG[k].layer === 'Canopy' || CATALOG[k].layer === 'Understory';
const BARE_FROM = 0.6;          // mountains: no props above this share of the peak
const SHORE_BAND = 0.25;        // tile radii
const FRINGE_BAND = 0.75;       // r beyond which a forest edge thins
const GROVE_SCALE = 1.5;        // tile radii
const DRY = -0.00008;           // land props need the water this far under the ground

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const scaled = (es: readonly Entry[], k: number): Entry[] => es.map(([kind, s, leaf, size]) => [kind, s * k, leaf, size] as const);
const canopyShare = (es: readonly Entry[]) => {
  const all = es.reduce((a, e) => a + e[1], 0);
  return all > 0 ? es.reduce((a, e) => a + (CATALOG[e[0]].layer === 'Canopy' ? e[1] : 0), 0) / all : 0;
};

export class Vegetation {
  private readonly plain: Mix[];      // per tile: the mix away from modifiers (mountains: the foot)
  private readonly slopes: (Mix | null)[]; // mountains: above the tree line
  private readonly forest: Uint8Array;
  private readonly nearSea: Uint8Array;
  private readonly nearLake: Uint8Array;
  private readonly treeTop: Float32Array;
  private readonly hillSpan: Float32Array;
  private readonly noise: Noise3;
  private readonly kindIndex = new Map(CATALOG_KINDS.map((k, i) => [k, i]));

  constructor(private readonly globe: Globe, private readonly map: MapData, flora: Flora,
    looks: readonly TileLook[], private readonly base: Float32Array, private readonly peak: Float32Array,
    private readonly r0: number, seed: number) {
    const N = globe.tiles.length;
    this.noise = makePerlin(mulberry32(seed ^ 0x6e0e5));
    this.plain = []; this.slopes = [];
    this.forest = new Uint8Array(N); this.nearSea = new Uint8Array(N); this.nearLake = new Uint8Array(N);
    this.treeTop = new Float32Array(N); this.hillSpan = new Float32Array(N);
    for (let t = 0; t < N; t++) {
      const bv = biomeVariant(map, flora, t), fv = featureVariant(map, flora, t);
      const mountain = map.relief[t] === 'mountains';
      let mix: Mix;
      if (mountain) {
        mix = { density: bv.density * 0.5, entries: bv.mix.map(([k, s, l, z]) => [k, CONIFERS.has(k) ? s * 2 : s, l, z] as const) };
        this.slopes.push(fv ? { density: fv.density, entries: [...fv.mix] } : { density: MOUNTAIN_SLOPES.density, entries: [...MOUNTAIN_SLOPES.mix] });
      } else {
        mix = fv
          ? { density: fv.density, entries: bv.mix.length ? [...scaled(fv.mix, FEATURE_SHARE), ...scaled(bv.mix, 1 - FEATURE_SHARE)] : [...fv.mix] }
          : { density: bv.density, entries: [...bv.mix] };
        this.slopes.push(null);
      }
      if (map.relief[t] === 'hills') {
        const temperate = map.biome[t] === 'temperateForest' || map.biome[t] === 'temperateRainforest';
        mix = {
          density: mix.density * HILL_DENSITY,
          entries: [...mix.entries.map(([k, s, l, z]) => [k, temperate && CONIFERS.has(k) ? s * 1.5 : s, l, z] as const), ...HILL_ROCKS],
        };
        this.hillSpan[t] = Math.max(1e-4, (looks[t].height - base[t]) * WORLD_SCALE.linear);
      }
      this.plain.push(mix);
      this.forest[t] = !mountain && mix.density >= 35 && canopyShare(mix.entries) >= 0.35 ? 1 : 0;
      const nbs = [t, ...globe.tiles[t].neighbors];
      this.nearSea[t] = nbs.some((n) => isWorldOcean(map.biome[n])) ? 1 : 0;
      this.nearLake[t] = nbs.some((n) => map.biome[n] === 'lake') ? 1 : 0;
      const lat = Math.abs(Math.asin(Math.max(-1, Math.min(1, globe.tiles[t].center.y)))) * 180 / Math.PI;
      this.treeTop[t] = 0.08 + 0.32 * (1 - smoothstep(25, 65, lat));
    }
  }

  // Most props a spot near this tile can get, per flat tile (sizes the lattice).
  maxDensity(u: number): number {
    const m = this.plain[u], s = this.slopes[u];
    const land = !isWaterKey(this.map.biome[u]);
    return Math.max(m.density, s?.density ?? 0) * (this.map.relief[u] === 'hills' ? 1.25 : 1) * (land ? 1.5 : 1);
  }

  // Canopy trees per tile (forest floors are shaded).
  isForest(t: number): boolean { return this.forest[t] === 1; }

  // One landmark tree (×2.5) in about a third of forest tiles.
  hasAncientTree(t: number): boolean { return this.forest[t] === 1 && (Math.imul(t + 1, 2654435761) >>> 0) % 3 === 0; }

  private zone(e: SpotEnv): Mix | null {
    const u = e.u;
    const s = this.slopes[u];
    if (!s) return this.plain[u];
    const frac = this.peak[u] > 0 ? (e.ground - this.base[u]) / this.peak[u] : 0;
    if (frac >= BARE_FROM) return null;
    return frac >= this.treeTop[u] ? s : this.plain[u];
  }

  density(e: SpotEnv): number {
    const m = this.zone(e);
    if (!m) return 0;
    let d = m.density;
    const u = e.u;
    if (this.map.relief[u] === 'hills') {
      // Thinner on crests, denser in hollows.
      const frac = (e.ground - this.base[u]) / this.hillSpan[u];
      d *= 1.25 - 0.5 * Math.min(1, Math.max(0, frac));
    }
    if (!isWaterKey(this.map.biome[u])) d *= 1 + 0.5 * e.bank;
    return d;
  }

  pick(e: SpotEnv, rand: Rng, ancient: boolean): PropPick | null {
    const m = this.zone(e);
    if (!m || m.entries.length === 0) return null;
    const u = e.u, map = this.map;
    const biome = map.biome[u], feature = map.feature[u];
    const land = !isWaterKey(biome);
    const open = feature === null || feature === 'floodplain';
    const mountain = map.relief[u] === 'mountains';
    let entries: readonly Entry[] = m.entries;
    let lean: THREE.Vector3 | null = null, leanAngle = 0, leanBy: 'sea' | 'inland' | null = null;

    const riverRoll = rand(), shoreRoll = rand();
    if (land && open && !mountain && riverRoll < 0.6 * e.bank) {
      entries = RIVER_BANKS[BANK_CLIMATE[biome]];
    } else if (land && feature === null && !mountain && e.coast > 0 && e.coast < SHORE_BAND
      && shoreRoll < 0.6 * (1 - e.coast / SHORE_BAND) && (this.nearSea[u] || this.nearLake[u])) {
      const warm = WARM_COASTS.has(biome) ? 'warm' : 'cool';
      if (this.nearSea[u] && biome !== 'tundra' && biome !== 'iceSheet') { entries = COASTS[warm]; leanBy = 'sea'; }
      else if (this.nearLake[u]) entries = LAKE_SHORES[warm];
    } else if (this.forest[u] && u === e.t && e.r > FRINGE_BAND) {
      const nb = this.globe.tiles[e.t].neighbors[e.i];
      if (nb !== undefined && !isWaterKey(map.biome[nb]) && !this.forest[nb] && map.relief[nb] !== 'mountains') {
        entries = [...entries.map(([k, s, l, z]) => [k, CATALOG[k].layer === 'Canopy' ? s * 0.5 : s, l, z] as const), ...FOREST_FRINGE];
      }
    }

    // Groves: per-species noise biases the pick.
    const f = 1 / (GROVE_SCALE * this.r0);
    const d = e.dir;
    let total = 0;
    const w = entries.map(([k, s]) => {
      const j = this.kindIndex.get(k)! * 7.31;
      const x = s * Math.exp(2.5 * this.noise.noise(d.x * f + j, d.y * f - j * 0.6, d.z * f + j * 1.7));
      total += x;
      return x;
    });
    let r = rand() * total, j = 0;
    while (j < w.length - 1 && (r -= w[j]) > 0) j++;
    let [kind, , tint, size = 1] = entries[j];

    // Steep ground: rocks instead of trees.
    if (TREES(kind) && e.slope > 0.35 && rand() < smoothstep(0.35, 0.6, e.slope)) {
      kind = rand() < 0.5 ? 'boulder' : 'scree';
      tint = undefined; size = 1;
    }
    const leaf = pickTint(tint, rand);
    if (ancient && CATALOG[kind].layer === 'Canopy') size *= 2.5;

    // Coast trees lean: palms out to sea, pines inland (away from the wind).
    if (leanBy && e.inland.lengthSq() > 0.5) {
      if (kind === 'coconutPalm') { lean = e.inland.clone().negate(); leanAngle = 0.3; }
      else if (kind === 'pine') { lean = e.inland.clone(); leanAngle = 0.2; }
    }

    // Water.
    const depth = e.water - e.ground;
    const wu = catalogEntry(kind).water;
    let height = e.ground;
    if (!wu) { if (depth > DRY) return null; }
    else if (wu.kind === 'wade') { if (depth > wu.depth) return null; }
    else if (wu.kind === 'bed') { if (depth < wu.minDepth) return null; }
    else {
      if (depth > wu.maxDepth || (wu.needWater && depth < 0.00005)) return null;
      height = Math.max(e.ground, e.water);
    }
    return { kind, leaf, size, height, lean, leanAngle };
  }
}

const pickTint = (t: Tint | undefined, rand: Rng): number | null =>
  t === undefined ? null : typeof t === 'number' ? t : t[Math.floor(rand() * t.length)] ?? null;
