// Definitions and limits for generated maps. The generator and the tests both
// import this module, so a rule can never mean one thing in one place and
// something else in the other.

import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import type { MapSizeKey } from './rules.ts';
import { terrainYield, type BiomeKey, type FeatureKey } from './terrain.ts';

// ---------- limits ----------

export interface Range {
  readonly min: number;
  readonly max: number; // Infinity = no upper bound
}
const r = (min: number, max = Infinity): Range => ({ min, max });
export const inRange = (x: number, rg: Range): boolean => x >= rg.min && x <= rg.max;

export interface MapLimits {
  // Geography
  readonly continents: Range;              // G1
  readonly continentMinTileShare: number;  // a continent covers at least this share of all tiles
  readonly continentMaxIceShare: number;   // ...and is less than this share ice sheet
  readonly largestContinentMaxLandShare: number; // G3
  readonly landShare: Range;               // G4
  readonly islands: Range;                 // G5
  readonly lakes: Range;                   // G6
  readonly lakeMaxTiles: number;
  // Climate
  readonly polarIceMinShareAbove78: number;   // C1
  readonly iceGlobeShare: Range;              // C2
  readonly iceMaxShare60to68: number;
  readonly tropicsMaxLat: number;             // C3
  readonly iceMinLat: number;                 // C4: no ice sheet / sea ice equatorward of this
  readonly lowlandTundraMinLat: number;       //     no flat tundra equatorward of this
  readonly biomesPresentMin: number;          // C6 (of 13 land biomes)
  readonly forestLandShare: Range;            // C7
  readonly desertLandShare: Range;
  readonly iceSheetLandShareMax: number;
  // Relief
  readonly mountainLandShare: Range;          // R1
  readonly hillLandShare: Range;
  readonly mountainNeighborMinShare: number;  // R2
  readonly longestRangeMin: number;
  // Features
  readonly volcanoes: Range;                  // F1
  readonly volcanoSpacing: number;
  readonly reefSystems: Range;                // F2
  readonly kelpSystems: Range;                // F3
  readonly clusterTiles: Range;
  readonly oases: Range;                      // F4
  readonly oasisSpacing: number;
  readonly glacierMaxTemp: number;            // F5
  readonly glacierMaxMountainShare: number;
  readonly marsh: Range;                      // F7
  readonly swamp: Range;
  readonly floodplain: Range;
  // Starts
  readonly startSpacing: number;              // S2
  readonly startQualityMaxRatio: number;      // S3
  readonly startRoomRadius: number;           // S4
  readonly startRoomSites: number;
  readonly startWaterRadius: number;          // S5
}

const BASE = {
  continents: r(2, 5),
  continentMinTileShare: 0.025,
  continentMaxIceShare: 0.5,
  largestContinentMaxLandShare: 0.6,
  landShare: r(0.35, 0.4),
  islands: r(3),
  polarIceMinShareAbove78: 0.95,
  iceGlobeShare: r(0.03, 0.075),
  iceMaxShare60to68: 0.3,
  tropicsMaxLat: 35,
  iceMinLat: 45,
  lowlandTundraMinLat: 35,
  forestLandShare: r(0.2, 0.45),
  desertLandShare: r(0.08, 0.3),
  iceSheetLandShareMax: 0.15,
  mountainLandShare: r(0.05, 0.09),
  hillLandShare: r(0.12, 0.18),
  mountainNeighborMinShare: 0.8,
  longestRangeMin: 6,
  volcanoSpacing: 8,
  clusterTiles: r(4, 10),
  oasisSpacing: 4,
  glacierMaxTemp: -4,
  glacierMaxMountainShare: 0.5,
  startQualityMaxRatio: 1.35,
  startRoomRadius: 8,
  startRoomSites: 3,
  startWaterRadius: 2,
} as const;

export const MAP_LIMITS: Record<MapSizeKey, MapLimits> = {
  small: {
    ...BASE, lakes: r(5, 30), lakeMaxTiles: 7, biomesPresentMin: 12,
    volcanoes: r(2, 4), reefSystems: r(2, 4), kelpSystems: r(2, 4), oases: r(2, 8),
    marsh: r(1, 40), swamp: r(1, 60), floodplain: r(3, 60), startSpacing: 10,
  },
  medium: {
    ...BASE, lakes: r(8, 45), lakeMaxTiles: 11, biomesPresentMin: 13,
    volcanoes: r(2, 5), reefSystems: r(3, 5), kelpSystems: r(3, 5), oases: r(3, 10),
    marsh: r(2, 60), swamp: r(2, 90), floodplain: r(5, 90), startSpacing: 11,
  },
  large: {
    ...BASE, lakes: r(10, 55), lakeMaxTiles: 14, biomesPresentMin: 13,
    volcanoes: r(3, 6), reefSystems: r(4, 6), kelpSystems: r(4, 6), oases: r(4, 12),
    marsh: r(3, 80), swamp: r(3, 120), floodplain: r(6, 120), startSpacing: 12,
  },
};

// ---------- categories ----------

export const isNavigable = (b: BiomeKey): boolean => b === 'ocean' || b === 'shallowSea';
export const isWorldOcean = (b: BiomeKey): boolean => isNavigable(b) || b === 'seaIce';
export const isWaterKey = (b: BiomeKey): boolean => isWorldOcean(b) || b === 'lake';

export const FOREST_BIOMES: ReadonlySet<BiomeKey> = new Set(['taiga', 'temperateForest', 'temperateRainforest', 'monsoonForest', 'jungle']);
export const DESERT_BIOMES: ReadonlySet<BiomeKey> = new Set(['hotDesert', 'coldDesert']);
export const TROPICAL_BIOMES: ReadonlySet<BiomeKey> = new Set(['jungle', 'monsoonForest', 'savanna']);
export const TROPICAL_FEATURES: ReadonlySet<FeatureKey> = new Set(['mangrove', 'reef']);
export const GOOD_START_BIOMES: ReadonlySet<BiomeKey> = new Set(['prairie', 'steppe', 'savanna', 'mediterranean', 'temperateForest', 'monsoonForest']);

// Pairs of biomes that must never touch (C5): [warm, cold].
export const FORBIDDEN_NEIGHBORS: readonly (readonly [BiomeKey, readonly BiomeKey[]])[] = [
  ['hotDesert', ['iceSheet', 'tundra', 'seaIce']],
  ['jungle', ['tundra', 'taiga', 'iceSheet', 'seaIce']],
];

// ---------- graph helpers ----------

export function latDeg(globe: Globe, t: number): number {
  return (Math.asin(Math.min(1, Math.abs(globe.tiles[t].center.y))) * 180) / Math.PI;
}

export function components(globe: Globe, member: (t: number) => boolean): number[][] {
  const N = globe.tiles.length;
  const seen = new Uint8Array(N);
  const out: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !member(s)) continue;
    const comp = [s];
    seen[s] = 1;
    for (let i = 0; i < comp.length; i++) {
      for (const nb of globe.tiles[comp[i]].neighbors) {
        if (!seen[nb] && member(nb)) { seen[nb] = 1; comp.push(nb); }
      }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

// Graph distance (in tiles) from the nearest source, optionally only through
// tiles that pass `through`, and up to maxDist. Unreached tiles are -1.
export function bfs(globe: Globe, sources: Iterable<number>, maxDist = Infinity, through: (t: number) => boolean = () => true): Int32Array {
  const dist = new Int32Array(globe.tiles.length).fill(-1);
  let frontier: number[] = [];
  for (const s of sources) { dist[s] = 0; frontier.push(s); }
  for (let d = 1; frontier.length && d <= maxDist; d++) {
    const next: number[] = [];
    for (const f of frontier) {
      for (const nb of globe.tiles[f].neighbors) {
        if (dist[nb] === -1 && through(nb)) { dist[nb] = d; next.push(nb); }
      }
    }
    frontier = next;
  }
  return dist;
}

// Breadth-first search around one tile that only touches the tiles it visits
// (a stamp array is reused per globe), so small radii are cheap on big maps.
export interface Ball {
  tiles: number[]; // in order of distance, starting with the center
  dist: number[];  // parallel to tiles
}

const scratch = new WeakMap<Globe, { stamp: Int32Array; gen: number }>();

export function ball(globe: Globe, start: number, radius: number, through: (t: number) => boolean = () => true): Ball {
  let sc = scratch.get(globe);
  if (!sc) { sc = { stamp: new Int32Array(globe.tiles.length), gen: 0 }; scratch.set(globe, sc); }
  const gen = ++sc.gen;
  const stamp = sc.stamp;
  const tiles = [start], dist = [0];
  stamp[start] = gen;
  for (let i = 0; i < tiles.length; i++) {
    const d = dist[i];
    if (d >= radius) continue;
    for (const nb of globe.tiles[tiles[i]].neighbors) {
      if (stamp[nb] === gen || !through(nb)) continue;
      stamp[nb] = gen;
      tiles.push(nb);
      dist.push(d + 1);
    }
  }
  return { tiles, dist };
}

export const tilesWithin = (globe: Globe, t: number, radius: number): number[] => ball(globe, t, radius).tiles;

// ---------- definitions ----------

type Biomes = Pick<MapData, 'biome'>;

export const isLandTile = (map: Biomes, t: number): boolean => !isWaterKey(map.biome[t]);

export function landmasses(globe: Globe, map: Biomes): number[][] {
  return components(globe, (t) => isLandTile(map, t));
}

export function isContinent(globe: Globe, map: Biomes, limits: MapLimits, mass: readonly number[]): boolean {
  if (mass.length < limits.continentMinTileShare * globe.tiles.length) return false;
  const ice = mass.filter((t) => map.biome[t] === 'iceSheet').length;
  return ice / mass.length < limits.continentMaxIceShare;
}

export interface Geography {
  landmasses: number[][];
  continents: number[][];
  islands: number[][];   // landmasses below the continent size (ice landmasses count as neither)
  landTiles: number;
}

export function geography(globe: Globe, map: Biomes, limits: MapLimits): Geography {
  const masses = landmasses(globe, map);
  const minTiles = limits.continentMinTileShare * globe.tiles.length;
  return {
    landmasses: masses,
    continents: masses.filter((m) => isContinent(globe, map, limits, m)),
    islands: masses.filter((m) => m.length < minTiles),
    landTiles: masses.reduce((a, m) => a + m.length, 0),
  };
}

// G7: groups of tiles reachable from each other over land and shallow sea
// (where early boats can go) that contain more than one continent. Each entry
// lists the tiles of one such group; an empty result means continents are
// only reachable from each other across deep ocean.
export function shelfLinkedGroups(globe: Globe, map: Biomes, limits: MapLimits): number[][] {
  const geo = geography(globe, map, limits);
  const continentOf = new Int32Array(globe.tiles.length).fill(-1);
  geo.continents.forEach((c, i) => { for (const t of c) continentOf[t] = i; });
  const groups = components(globe, (t) => isLandTile(map, t) || map.biome[t] === 'shallowSea');
  return groups.filter((g) => new Set(g.map((t) => continentOf[t]).filter((c) => c >= 0)).size > 1);
}

// ---------- start evaluation (shared by start placement and S-checks) ----------

// Yield value of the 19 tiles (radius 2) around a start.
export function startQuality(globe: Globe, map: MapData, t: number): number {
  let q = 0;
  for (const x of tilesWithin(globe, t, 2)) {
    const y = terrainYield({ biome: map.biome[x], relief: map.relief[x], feature: map.feature[x] });
    q += y.food * 1.5 + y.prod + y.gold * 0.5;
  }
  return q;
}

// Terrain on which a city may be founded (ignores other cities).
export function canHostCity(map: MapData, t: number): boolean {
  if (!isLandTile(map, t) || map.relief[t] === 'mountains' || map.biome[t] === 'iceSheet') return false;
  const f = map.feature[t];
  return f !== 'volcano' && f !== 'glacier';
}

// How many cities could be packed (each ≥3 apart, as the game requires)
// around a start, within `radius` steps over land, not counting the start.
export function roomToGrow(globe: Globe, map: MapData, start: number, radius: number): number {
  const reach = ball(globe, start, radius, (t) => isLandTile(map, t));
  const near = new Set(tilesWithin(globe, start, 2));
  let sites = 0;
  for (const t of reach.tiles) { // already ordered by distance
    if (near.has(t) || !canHostCity(map, t)) continue;
    sites++;
    for (const x of tilesWithin(globe, t, 2)) near.add(x);
  }
  return sites;
}

export function hasWaterNear(globe: Globe, map: MapData, t: number, radius: number): boolean {
  return tilesWithin(globe, t, radius).some((x) => isNavigable(map.biome[x]) || map.biome[x] === 'lake');
}
