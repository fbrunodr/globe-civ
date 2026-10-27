// What a rural tile's worked areas look like: decided by the tile (its
// improvement, biome, feature, climate), never by the farm's layout, so one
// layout is a wheat farm in France, an olive grove in Tuscany and a rice
// estate in Bengal. Each area gets a ground colour and what fills it: the
// harvest (crop rows), animals at pasture, spoil heaps, stone blocks, cut
// logs; tree crops leave theirs empty (the ground is painted, the terrain
// shader). Areas of one tile vary among the crops its climate grows.
// Pure 2D (the tile's canonical hex, tile steps): the game and the farm painter
// place the same things.

import type { BiomeKey, FeatureKey } from '../terrain.ts';
import type { ImprovementKey } from '../cities.ts';
import { len, pointInPoly, sub, type Pt } from '../town/geometry.ts';
import { mulberry32 } from '../rng.ts';
import type { RuralModel } from './models.ts';

export type RGB = readonly [number, number, number];
export type Fill =
  | { readonly t: 'rows'; readonly color: number; readonly spacing: number; readonly height: number; readonly width: number }
  | { readonly t: 'scatter'; readonly model: Extract<RuralModel, 'sheep' | 'cow' | 'heap' | 'block' | 'stump' | 'logs' | 'haystack'>; readonly color: number; readonly per: number }
  | { readonly t: 'none' };
export interface AreaLook { readonly name: string; readonly ground: RGB; readonly fill: Fill; readonly extra?: Fill }

const rgb = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
// Rows set close, so a field reads as its crop (the ground a darker tone of it between the rows).
const rows = (color: number, spacing = 0.0078, height = 0.0062, width = 0.0074): Fill => ({ t: 'rows', color, spacing, height, width });
const GRASS = rgb(0x4f6e30);

// Crops (farms) by climate: each area of a farm takes one of its region's.
const WHEAT: AreaLook = { name: 'wheat', ground: rgb(0x8a6a2a), fill: rows(0xd2a73c) };
const BARLEY: AreaLook = { name: 'barley', ground: rgb(0x6a6a2a), fill: rows(0xb2b25a) };
const OATS: AreaLook = { name: 'oats', ground: rgb(0x5a5a2c), fill: rows(0x9aa85a) };
const RYE: AreaLook = { name: 'rye', ground: rgb(0x6a5a34), fill: rows(0xa8954e) };
const POTATO: AreaLook = { name: 'potatoes', ground: rgb(0x4a3624), fill: rows(0x3f6a2e, 0.0095, 0.0046, 0.0068) };
const MAIZE: AreaLook = { name: 'maize', ground: rgb(0x4e4a26), fill: rows(0x6f8f32, 0.009, 0.011, 0.006) };
const MEADOW: AreaLook = { name: 'pasture', ground: rgb(0x4f7a2e), fill: { t: 'scatter', model: 'cow', color: 0x7a4a30, per: 1.2 }, extra: { t: 'scatter', model: 'haystack', color: 0xc9a85a, per: 0.6 } };
const SHEEP: AreaLook = { name: 'sheep pasture', ground: rgb(0x7a8a46), fill: { t: 'scatter', model: 'sheep', color: 0xece6d8, per: 3 } };
const OLIVE: AreaLook = { name: 'olive grove', ground: rgb(0x8a7a52), fill: { t: 'none' } };
const VINES: AreaLook = { name: 'vineyard', ground: rgb(0x7a5e3a), fill: { t: 'none' } };
const ORCHARD: AreaLook = { name: 'orchard', ground: rgb(0x557a32), fill: { t: 'none' } };
const MILLET: AreaLook = { name: 'millet', ground: rgb(0x7a5a30), fill: rows(0xc29a52, 0.0085, 0.0075) };
const SORGHUM: AreaLook = { name: 'sorghum', ground: rgb(0x6a3e26), fill: rows(0xa0482c, 0.009, 0.009, 0.0068) };
const CATTLE: AreaLook = { name: 'cattle', ground: rgb(0x8a8a4a), fill: { t: 'scatter', model: 'cow', color: 0xb08a5a, per: 1.2 } };
const RICE: AreaLook = { name: 'rice paddy', ground: rgb(0x3f6a6a), fill: rows(0x86c24a, 0.0075, 0.0038, 0.0048) };
const CANE: AreaLook = { name: 'sugar cane', ground: rgb(0x4a5226), fill: rows(0x6fa23a, 0.0095, 0.013, 0.0065) };
const DATES: AreaLook = { name: 'date palms', ground: rgb(0x8a7448), fill: { t: 'none' } };
const IRRIGATED: AreaLook = { name: 'irrigated fields', ground: rgb(0x46622c), fill: rows(0x7fae44) };
const PEAT: AreaLook = { name: 'peat cutting', ground: rgb(0x3e3328), fill: { t: 'scatter', model: 'block', color: 0x4a3a2c, per: 3 } };

const CROPS: Partial<Record<BiomeKey, readonly AreaLook[]>> = {
  prairie: [WHEAT, BARLEY, MEADOW, WHEAT, MAIZE, OATS],
  temperateForest: [WHEAT, MEADOW, BARLEY, ORCHARD, POTATO, OATS],
  temperateRainforest: [MEADOW, POTATO, OATS, ORCHARD],
  steppe: [WHEAT, SHEEP, WHEAT, BARLEY],
  mediterranean: [OLIVE, VINES, WHEAT, OLIVE, VINES],
  savanna: [MILLET, SORGHUM, CATTLE, MILLET, MAIZE],
  monsoonForest: [RICE, CANE, RICE],
  jungle: [RICE, CANE],
  hotDesert: [DATES, IRRIGATED, WHEAT],
  coldDesert: [IRRIGATED, SHEEP, BARLEY],
  taiga: [RYE, POTATO, SHEEP],
  tundra: [SHEEP, RYE],
};

// Which palette a farm's plots are painted in (terrainMaterial.ts, CROP_CODE).
// (A wetland is worked as rice paddies where warm, cut for peat where
// colder than PEAT_BELOW.)
export type CropRegion = 'temperate' | 'steppe' | 'mediterranean' | 'savanna' | 'tropical' | 'oasis' | 'cold' | 'paddy' | 'peat';
export const PEAT_BELOW = 9;
export function cropRegion(imp: ImprovementKey | null, biome: BiomeKey, feature: FeatureKey | null, temp: number): CropRegion {
  if (imp === 'wetland') return temp < PEAT_BELOW ? 'peat' : 'paddy';
  if (feature === 'oasis' || feature === 'floodplain') return 'oasis';
  switch (biome) {
    case 'steppe': return 'steppe';
    case 'mediterranean': return 'mediterranean';
    case 'savanna': return 'savanna';
    case 'monsoonForest': case 'jungle': return 'tropical';
    case 'hotDesert': case 'coldDesert': return 'oasis';
    case 'taiga': case 'tundra': return 'cold';
    default: return 'temperate';
  }
}

// The look of area `i` of a tile.
export function areaLook(imp: ImprovementKey, biome: BiomeKey, feature: FeatureKey | null, temp: number, i: number, seed: number): AreaLook {
  switch (imp) {
    case 'mine': return { name: 'spoil heaps', ground: rgb(0x3a332c), fill: { t: 'scatter', model: 'heap', color: 0x8a7e6c, per: 6 } };
    case 'quarry': return { name: 'quarry', ground: rgb(0xa8a08e), fill: { t: 'scatter', model: 'block', color: 0xe2dac8, per: 7 } };
    case 'camp': return { name: 'logging', ground: rgb(0x4a3a24), fill: { t: 'scatter', model: 'stump', color: 0x6a5038, per: 14 }, extra: { t: 'scatter', model: 'logs', color: 0x7a5f45, per: 3 } };
    case 'wetland': return temp < PEAT_BELOW ? PEAT : RICE;
    case 'boats': return { name: 'water', ground: GRASS, fill: { t: 'none' } };
    case 'farm': {
      const list = feature === 'oasis' || feature === 'floodplain' ? [DATES, IRRIGATED, WHEAT] : CROPS[biome] ?? [WHEAT, BARLEY, MEADOW];
      const r = mulberry32(seed * 977 + i * 131)();
      return list[Math.floor(r * list.length)]!;
    }
  }
}

// ---------- placing a fill in an area ----------

// How far apart scattered things stand (tile steps).
export const SCATTER_GAP: Record<Extract<Fill, { t: 'scatter' }>['model'], number> = { heap: 0.03, block: 0.016, stump: 0.008, logs: 0.024, cow: 0.012, sheep: 0.007, haystack: 0.012 };
// `per` points per 0.01 square tile steps of area, scattered (at least one), `gap` apart.
export function scatterIn(poly: readonly Pt[], per: number, seed: number, gap = 0.006): Pt[] {
  const rand = mulberry32(seed);
  let area = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]!; area += p.x * q.y - q.x * p.y; });
  area = Math.abs(area) / 2;
  const n = Math.max(1, Math.round((area / 0.01) * per));
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const out: Pt[] = [];
  for (let tries = 0; tries < n * 20 && out.length < n; tries++) {
    const p = { x: Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + rand() * (Math.max(...ys) - Math.min(...ys)) };
    if (pointInPoly(p, poly) && out.every((q) => len(sub(p, q)) > gap)) out.push(p);
  }
  return out;
}
