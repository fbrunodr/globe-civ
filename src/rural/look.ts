// What a rural tile's worked areas look like: decided by the tile (its
// improvement, biome, feature, climate), never by the drawing, so one
// drawing is a wheat farm in France, an olive grove in Tuscany and a rice
// estate in Bengal. Each area gets a ground colour and what fills it: crop
// rows, trees in rows, animals at pasture, spoil heaps, stone blocks, cut
// logs. Areas of one tile vary among the crops its climate grows.
// Pure 2D (drawing coordinates, tile steps): the game and the rural editor
// place the same things.

import type { BiomeKey, FeatureKey } from '../terrain.ts';
import type { ImprovementKey } from '../cities.ts';
import { add, len, lerp, mul, pointInPoly, sub, type Pt } from '../town/geometry.ts';
import { mulberry32 } from '../rng.ts';
import type { RuralModel } from './models.ts';

export type RGB = readonly [number, number, number];
export type Fill =
  | { readonly t: 'rows'; readonly color: number; readonly spacing: number; readonly height: number; readonly width: number }
  | { readonly t: 'trees'; readonly model: Extract<RuralModel, 'olive' | 'orchard' | 'palm' | 'vine'>; readonly color: number; readonly spacing: number }
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
const OLIVE: AreaLook = { name: 'olive grove', ground: rgb(0x8a7a52), fill: { t: 'trees', model: 'olive', color: 0x7f9466, spacing: 0.017 } };
const VINES: AreaLook = { name: 'vineyard', ground: rgb(0x7a5e3a), fill: rows(0x3f6a26, 0.011, 0.0085, 0.0045) };
const ORCHARD: AreaLook = { name: 'orchard', ground: rgb(0x557a32), fill: { t: 'trees', model: 'orchard', color: 0x3f6e2a, spacing: 0.016 } };
const MILLET: AreaLook = { name: 'millet', ground: rgb(0x7a5a30), fill: rows(0xc29a52, 0.0085, 0.0075) };
const SORGHUM: AreaLook = { name: 'sorghum', ground: rgb(0x6a3e26), fill: rows(0xa0482c, 0.009, 0.009, 0.0068) };
const CATTLE: AreaLook = { name: 'cattle', ground: rgb(0x8a8a4a), fill: { t: 'scatter', model: 'cow', color: 0xb08a5a, per: 1.2 } };
const RICE: AreaLook = { name: 'rice paddy', ground: rgb(0x3f6a6a), fill: rows(0x86c24a, 0.0075, 0.0038, 0.0048) };
const CANE: AreaLook = { name: 'sugar cane', ground: rgb(0x4a5226), fill: rows(0x6fa23a, 0.0095, 0.013, 0.0065) };
const DATES: AreaLook = { name: 'date palms', ground: rgb(0x8a7448), fill: { t: 'trees', model: 'palm', color: 0x5f8a3a, spacing: 0.02 }, extra: { t: 'scatter', model: 'haystack', color: 0x9aae5a, per: 0 } };
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

// The look of area `i` of a tile.
export function areaLook(imp: ImprovementKey, biome: BiomeKey, feature: FeatureKey | null, temp: number, i: number, seed: number): AreaLook {
  switch (imp) {
    case 'mine': return { name: 'spoil heaps', ground: rgb(0x3a332c), fill: { t: 'scatter', model: 'heap', color: 0x8a7e6c, per: 6 } };
    case 'quarry': return { name: 'quarry', ground: rgb(0xa8a08e), fill: { t: 'scatter', model: 'block', color: 0xe2dac8, per: 7 } };
    case 'camp': return { name: 'logging', ground: rgb(0x4a3a24), fill: { t: 'scatter', model: 'stump', color: 0x6a5038, per: 14 }, extra: { t: 'scatter', model: 'logs', color: 0x7a5f45, per: 3 } };
    case 'wetland': return temp < 9 ? PEAT : RICE;
    case 'boats': return { name: 'water', ground: GRASS, fill: { t: 'none' } };
    case 'farm': {
      const list = feature === 'oasis' || feature === 'floodplain' ? [DATES, IRRIGATED, WHEAT] : CROPS[biome] ?? [WHEAT, BARLEY, MEADOW];
      const r = mulberry32(seed * 977 + i * 131)();
      return list[Math.floor(r * list.length)]!;
    }
  }
}

// What runs along a farm's field edges, by climate: hedgerows (bocage),
// dry-stone walls, fences, or nothing (open steppe and paddies).
export type Edge = { readonly model: Extract<RuralModel, 'bush' | 'wallStone' | 'fence'>; readonly color: number; readonly step: number } | null;
export function fieldEdge(imp: ImprovementKey, biome: BiomeKey): Edge {
  if (imp !== 'farm') return null;
  switch (biome) {
    case 'prairie': case 'temperateForest': case 'temperateRainforest': return { model: 'bush', color: 0x3e5e2a, step: 0.0068 };
    case 'mediterranean': case 'coldDesert': case 'tundra': return { model: 'wallStone', color: 0xa49c8a, step: 0.0098 };
    case 'savanna': case 'hotDesert': return { model: 'fence', color: 0x7a6a4a, step: 0.0098 };
    case 'taiga': return { model: 'fence', color: 0x6a5038, step: 0.0098 };
    default: return null;
  }
}

// ---------- placing a fill in an area ----------

// The area's long axis (its longest edge).
export function axisOf(poly: readonly Pt[]): Pt {
  let best = { x: 1, y: 0 }, bl = -1;
  poly.forEach((p, i) => { const d = sub(poly[(i + 1) % poly.length]!, p), l = len(d); if (l > bl) { bl = l; best = mul(d, 1 / l); } });
  return best;
}

// Rows along the area's long axis, `spacing` apart, clipped to it (each
// stops a little short of its edge).
export function rowsIn(poly: readonly Pt[], spacing: number, margin = 0.003): [Pt, Pt][] {
  const ax = axisOf(poly), n = { x: -ax.y, y: ax.x };
  const along = poly.map((p) => p.x * ax.x + p.y * ax.y), across = poly.map((p) => p.x * n.x + p.y * n.y);
  const lo = Math.min(...across) + spacing / 2, hi = Math.max(...across);
  const out: [Pt, Pt][] = [];
  for (let c = lo; c < hi; c += spacing) {
    // Where the line `across = c` meets the edges.
    const ts: number[] = [];
    poly.forEach((_, i) => {
      const j = (i + 1) % poly.length, a = across[i]!, b = across[j]!;
      if ((a - c) * (b - c) < 0) ts.push(along[i]! + ((c - a) / (b - a)) * (along[j]! - along[i]!));
    });
    ts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k += 2) {
      const t0 = ts[k]! + margin, t1 = ts[k + 1]! - margin;
      if (t1 - t0 < 0.004) continue;
      out.push([add(mul(ax, t0), mul(n, c)), add(mul(ax, t1), mul(n, c))]);
    }
  }
  return out;
}

// Points on a grid along the area's axis, `spacing` apart (trees in rows).
export function gridIn(poly: readonly Pt[], spacing: number): Pt[] {
  return rowsIn(poly, spacing, spacing * 0.4).flatMap(([a, b]) => {
    const l = len(sub(b, a)), n = Math.max(1, Math.floor(l / spacing) + 1);
    return Array.from({ length: n }, (_, k) => lerp(a, b, n === 1 ? 0.5 : k / (n - 1)));
  });
}

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
