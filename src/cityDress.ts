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
import { CELL, LOT_SIZE, pointInPoly, type Floors, type Footprint, type Pt } from './town/geometry.ts';
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

// A walled city's buildings keep this far inside its walls (tile steps).
const WALL_ROOM = 0.05;
// The middle of the city's land (`free`, sampled every WALL_STEP over the
// tile), and the wall round it: twelve corners, each as far out from that
// middle as the land goes (closed: the first repeated).
const WALL_STEP = 0.02;
function landMiddle(free: (p: Pt) => boolean): Pt {
  let x = 0, y = 0, n = 0;
  for (let j = -30; j <= 30; j++) for (let i = -30; i <= 30; i++) { const p = { x: i * WALL_STEP, y: j * WALL_STEP }; if (free(p)) { x += p.x; y += p.y; n++; } }
  return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}
function wallRing(free: (p: Pt) => boolean): Pt[] {
  const m = landMiddle(free);
  const corner = (i: number) => {
    const a = (i / 12) * Math.PI * 2, at = (k: number) => ({ x: m.x + k * Math.cos(a), y: m.y + k * Math.sin(a) });
    let k = 0;
    while (k < 0.6 && free(at(k + WALL_STEP))) k += WALL_STEP;
    return at(Math.max(k, 0.08));
  };
  const ring = Array.from({ length: 12 }, (_, i) => corner(i));
  return [...ring, ring[0]!];
}
const wallMiddle = (wall: readonly Pt[]): Pt => { const r = wall.slice(0, -1); return { x: r.reduce((a, p) => a + p.x, 0) / r.length, y: r.reduce((a, p) => a + p.y, 0) / r.length }; };
// The eras a city is dressed for: the game's (Ancient, Classical,
// Medieval) and the Modern era ahead of it (the City samples preview it).
export type DressEra = 0 | 1 | 2 | 3;
export const DRESS_ERA_NAME: readonly string[] = ['Ancient', 'Classical', 'Medieval', 'Modern'];
// Roads by era: dirt, paving, asphalt.
const ROAD_RGB: Record<DressEra, RGB> = { 0: [0.55, 0.49, 0.39], 1: [0.58, 0.57, 0.54], 2: [0.58, 0.57, 0.54], 3: [0.3, 0.3, 0.31] };
// Skyscrapers: one per this many citizens, from the Modern era (none
// before) and from this size (none in a smaller city).
const SKYSCRAPER_PER = 3;
const SKYSCRAPER_FROM = 10;

// The heights each era builds (floorsOf below; the Buildings page shows them).
export const ERA_HEIGHTS: Record<DressEra, readonly Floors[]> = { 0: [1, 2], 1: [1, 2], 2: [1, 2, 3], 3: [2, 3, 4, 12] };
// The first era that builds a height.
export const firstEra = (f: Floors): DressEra => ([0, 1, 2, 3] as const).find((e) => ERA_HEIGHTS[e].includes(f)) ?? 3;
// The house model for a painted rectangle (front × depth, units): the
// footprint of whole cells that covers it (UNITS_PER_CELL units a cell),
// squeezed to it across its floor plan where it falls short (by a sixth at most).
export function fitHouse(front: number, depth: number): { fp: Footprint; sx: number; sz: number } {
  const cf = Math.ceil(front / UNITS_PER_CELL), cd = Math.ceil(depth / UNITS_PER_CELL);
  return { fp: `b${cf}${cd}` as Footprint, sx: front / (UNITS_PER_CELL * cf), sz: depth / (UNITS_PER_CELL * cd) };
}

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

// The most buildings and skyscrapers a city shows (its wonders besides).
const MAX_BUILDINGS = 50;

export function dressCity(c: CityLook): DressedCity {
  const wonders = c.wonders.slice(0, MAX_WONDERS);
  const total = Math.min(MAX_BUILDINGS, Math.round(4 + 3 * c.pop));
  const skyscrapers = c.era >= 3 && c.pop >= SKYSCRAPER_FROM ? Math.min(total, Math.floor(c.pop / SKYSCRAPER_PER)) : 0;
  // The walls first: round the city's land (`free`), from its middle out to
  // where it ends in twelve directions; the town then keeps inside them,
  // WALL_ROOM in from them.
  const wall = c.walled ? wallRing(c.free) : null;
  const inner = wall ? wall.slice(0, -1).map((p, i) => { const m = wallMiddle(wall), d = Math.hypot(p.x - m.x, p.y - m.y); return { x: m.x + (p.x - m.x) * Math.max(0, d - WALL_ROOM) / d, y: m.y + (p.y - m.y) * Math.max(0, d - WALL_ROOM) / d, i }; }) : null;
  const free = inner ? (p: Pt) => c.free(p) && pointInPoly(p, inner) : c.free;
  const painting = paintCity({ wonders: wonders.length, skyscrapers, buildings: total - skyscrapers, seed: c.seed, free });
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
    const { fp, sx, sz } = fitHouse(b.front, b.depth), floors = floorsOf(b);
    const model = houseKind(styleOf(c.civ, floors), fp, floors, Math.floor(rand() * HOUSE_VARIANTS));
    const [hw, hd] = LOT_SIZE[fp];
    return { model, at: b.at, yaw: b.yaw, hw: hw * sx, hd: hd * sz, scale: CITY_CELL / CELL, sx, sz, variant: rand() };
  });
  return { painting, buildings, roadRgb: ROAD_RGB[c.era], wall };
}
