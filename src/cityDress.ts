// What a painted city is made of (cityPainter.ts lays it out): how many
// buildings a city of its size and era has and how many of them
// skyscrapers (3 × 3, from the Modern era; every other building is 2 × 2),
// how tall each stands (the era's tallest nearest the middle, more of
// them as the city grows), which model each is in its civ's style, its
// wonders fitted to their squares, its roads' colour, its walls. The game
// (cityProps.ts) and the City samples page (citySamples.ts) both dress
// cities with it, so the samples are what the game shows.
//
// In the tile's canonical hex (tile steps); models in their own units with
// the scale that stands them in tile steps.

import { paintCity, CITY_CELL, MAX_WONDERS, UNIT, UNITS_PER_CELL, type Painted, type Painting } from './cityPainter.ts';
import { CELL, LOT_SIZE, type Floors, type Footprint, type Pt } from './town/geometry.ts';
import { HOUSE_VARIANTS, houseKind } from './houses.ts';
import { styleOf, type ArchCiv } from './architecture.ts';
import { wonderModelKind, type SiteModel } from './wonderModels.ts';
import { modelGeometry, type LotModelKind } from './buildingCatalog.ts';
import type { RGB } from './rural/look.ts';
import { mulberry32 } from './rng.ts';

export interface CityLook {
  readonly civ: ArchCiv;
  readonly era: DressEra;
  readonly pop: number;
  readonly wonders: readonly SiteModel[];  // built, and 'scaffold' for one going up
  readonly walled: boolean;
  readonly seed: number;
  readonly free: (p: Pt) => boolean;      // dry land in the tile
}
export interface DressedBuilding {
  readonly model: LotModelKind;
  readonly at: Pt;
  readonly yaw: number;                   // its front, in the tile
  readonly hw: number; readonly hd: number; // its footprint's half extents (model units, stretched)
  readonly scale: number;                 // model units → tile steps
  readonly sx: number; readonly sz: number; // stretched across its front, and deep (1: as built)
  readonly variant: number;               // a random draw of its own (shade)
}
export interface DressedCity {
  readonly painting: Painting;
  readonly buildings: readonly DressedBuilding[];
  readonly roadRgb: RGB;
  readonly wall: readonly Pt[] | null;    // a closed ring (first point repeated)
}

// A walled city keeps inside its walls (share of the inradius: the walls
// stand in the safe zone, town/geometry.ts SAFE_RHO).
export const WALLED_LIMIT = 0.7;
// The eras a city is dressed for: the game's (Ancient, Classical,
// Medieval) and the Modern era ahead of it (the City samples preview it).
export type DressEra = 0 | 1 | 2 | 3;
export const DRESS_ERA_NAME: readonly string[] = ['Ancient', 'Classical', 'Medieval', 'Modern'];
// Roads by era: dirt, paving, asphalt.
const ROAD_RGB: Record<DressEra, RGB> = { 0: [0.55, 0.49, 0.39], 1: [0.58, 0.57, 0.54], 2: [0.58, 0.57, 0.54], 3: [0.3, 0.3, 0.31] };
// Skyscrapers: one per this many citizens, from the Modern era (none before).
const SKYSCRAPER_PER = 3;

const box = new Map<LotModelKind, readonly [number, number]>();
const halfExtents = (k: LotModelKind): readonly [number, number] => {
  let r = box.get(k);
  if (!r) {
    const g = modelGeometry(k);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    r = [Math.max(-b.min.x, b.max.x), Math.max(-b.min.z, b.max.z)];
    box.set(k, r);
  }
  return r;
};

export function dressCity(c: CityLook): DressedCity {
  const wonders = c.wonders.slice(0, MAX_WONDERS);
  const total = Math.round(4 + 3 * c.pop);
  const skyscrapers = c.era >= 3 ? Math.min(total, Math.floor(c.pop / SKYSCRAPER_PER)) : 0;
  const painting = paintCity({ wonders: wonders.length, skyscrapers, buildings: total - skyscrapers, seed: c.seed, free: c.free, ...(c.walled ? { limit: WALLED_LIMIT } : {}) });
  const tall = Math.min(0.8, Math.max(0.15, c.pop / 20));
  const floorsOf = (b: Painted): Floors => {
    if (b.kind === 'skyscraper') return 12;
    if (c.era === 0) return b.order < tall * 0.5 ? 2 : 1;
    if (c.era === 1) return b.order < tall ? 2 : 1;
    if (c.era === 2) return b.order < tall * 0.5 ? 3 : b.order < tall + 0.2 ? 2 : 1;
    return b.order < tall * 0.5 ? 4 : b.order < tall ? 3 : 2;
  };
  let w = 0;
  const buildings = painting.buildings.map((b, n): DressedBuilding => {
    const rand = mulberry32(c.seed * 31 + n + 1);
    if (b.kind === 'wonder') {
      const model = wonderModelKind(wonders[w++]!);
      const [hw, hd] = halfExtents(model);
      // (Fitted to its rectangle, a hair inside, never stretched.)
      const scale = 0.95 * Math.min((b.front * UNIT) / (2 * hw), (b.depth * UNIT) / (2 * hd));
      return { model, at: b.at, yaw: b.yaw, hw, hd, scale, sx: 1, sz: 1, variant: rand() };
    }
    // The footprint of whole cells that covers its rectangle (UNITS_PER_CELL
    // units a cell), squeezed to it where it falls short (by a sixth at most).
    const cf = Math.ceil(b.front / UNITS_PER_CELL), cd = Math.ceil(b.depth / UNITS_PER_CELL);
    const fp = `b${cf}${cd}` as Footprint, floors = floorsOf(b);
    const model = houseKind(styleOf(c.civ, floors), fp, floors, Math.floor(rand() * HOUSE_VARIANTS));
    const sx = b.front / (UNITS_PER_CELL * cf), sz = b.depth / (UNITS_PER_CELL * cd), [hw, hd] = LOT_SIZE[fp];
    return { model, at: b.at, yaw: b.yaw, hw: hw * sx, hd: hd * sz, scale: CITY_CELL / CELL, sx, sz, variant: rand() };
  });
  // The walls: a ring round the town, inside the safe zone.
  const R = Math.min(WALLED_LIMIT * 0.5 + 0.02, painting.reach + 0.03);
  const wall = c.walled ? Array.from({ length: 13 }, (_, i) => ({ x: R * Math.cos((i / 12) * Math.PI * 2), y: R * Math.sin((i / 12) * Math.PI * 2) })) : null;
  return { painting, buildings, roadRgb: ROAD_RGB[c.era], wall };
}
