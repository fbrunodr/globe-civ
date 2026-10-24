// Painted maps (map_editor.html): a map script whose land, lakes, relief
// and, where painted, biomes are drawn tile by tile, one painting per map
// size (stored in src/maps/<script>.json). mapgen.ts takes them as they
// are and adds the climate, rivers, features and starts.

import type { Globe } from './goldberg.ts';
import { globeFor } from './globes.ts';
import { nearestTile } from './geo.ts';
import { MAP_SIZES, type MapSizeKey } from './rules.ts';
import type { BiomeKey } from './terrain.ts';
import EARTH from './maps/earth.json';

export const SEA = 0, LAND = 1, LAKE = 2;
export const FLAT = 0, HILLS = 1, MOUNTAINS = 2;

export interface Painting {
  terrain: Uint8Array;           // SEA, LAND or LAKE
  relief: Uint8Array;            // FLAT, HILLS or MOUNTAINS (land only)
  biome: (BiomeKey | null)[];    // painted biome (land only), or null: the climate's
}

// ---------- the stored form ----------

// Each layer is one character per tile, run-length coded ("120.3#": 120
// tiles of '.', then 3 of '#').
export interface StoredPainting { terrain: string; relief: string; biome: string }
export type PaintFile = Partial<Record<MapSizeKey, StoredPainting>>;

const TERRAIN_CH = '.#o';
const RELIEF_CH = 'fhm';
export const PAINTABLE_BIOMES = [
  'iceSheet', 'tundra', 'taiga', 'coldDesert', 'steppe', 'prairie', 'temperateForest', 'temperateRainforest',
  'mediterranean', 'hotDesert', 'savanna', 'monsoonForest', 'jungle',
] as const satisfies readonly BiomeKey[];
const BIOME_CH = '-ItTcspFRmdvMJ'; // '-' = the climate's, then PAINTABLE_BIOMES in order

export function encodeRuns(chars: string): string {
  let out = '';
  for (let i = 0; i < chars.length;) {
    let j = i;
    while (j < chars.length && chars[j] === chars[i]) j++;
    out += `${j - i}${chars[i]}`;
    i = j;
  }
  return out;
}
export function decodeRuns(runs: string, n: number): string {
  let out = '';
  for (const m of runs.matchAll(/(\d+)(\D)/g)) out += m[2]!.repeat(Number(m[1]));
  if (out.length !== n) throw new Error(`painting has ${out.length} tiles, the globe ${n}`);
  return out;
}

export function store(p: Painting): StoredPainting {
  return {
    terrain: encodeRuns(Array.from(p.terrain, (v) => TERRAIN_CH[v]!).join('')),
    relief: encodeRuns(Array.from(p.relief, (v) => RELIEF_CH[v]!).join('')),
    biome: encodeRuns(p.biome.map((b) => BIOME_CH[b ? PAINTABLE_BIOMES.indexOf(b as typeof PAINTABLE_BIOMES[number]) + 1 : 0]!).join('')),
  };
}
export function load(s: StoredPainting, n: number): Painting {
  const code = (str: string, chars: string) => Uint8Array.from(decodeRuns(str, n), (c) => Math.max(0, chars.indexOf(c)));
  const b = code(s.biome, BIOME_CH);
  return {
    terrain: code(s.terrain, TERRAIN_CH),
    relief: code(s.relief, RELIEF_CH),
    biome: Array.from(b, (i) => (i ? PAINTABLE_BIOMES[i - 1]! : null)),
  };
}

export const blank = (n: number): Painting => ({ terrain: new Uint8Array(n), relief: new Uint8Array(n), biome: new Array<BiomeKey | null>(n).fill(null) });

// ---------- between sizes ----------

// A painting laid onto another globe: each tile takes the nearest tile's paint.
export function resample(p: Painting, from: Globe, to: Globe): Painting {
  const out = blank(to.tiles.length);
  let near = -1;
  for (const t of to.tiles) {
    near = nearestTile(from, t.center, near);
    out.terrain[t.id] = p.terrain[near]!;
    out.relief[t.id] = p.relief[near]!;
    out.biome[t.id] = p.biome[near]!;
  }
  return out;
}

// The painting for a size: its own, or else the largest painted size's, resampled.
export function paintingFor(file: PaintFile, size: MapSizeKey): Painting {
  const globe = globeFor(size);
  const own = file[size];
  if (own) return load(own, globe.tiles.length);
  const sizes = (Object.keys(MAP_SIZES) as MapSizeKey[]).filter((k) => file[k]).sort((a, b) => MAP_SIZES[b].n - MAP_SIZES[a].n);
  if (!sizes.length) return blank(globe.tiles.length);
  const from = globeFor(sizes[0]!);
  return resample(load(file[sizes[0]!]!, from.tiles.length), from, globe);
}

// The painted map scripts' files (rules.ts MAP_SCRIPTS).
export const PAINTED = { earth: EARTH as PaintFile };
export type PaintedScript = keyof typeof PAINTED;
