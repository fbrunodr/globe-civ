// Plain 2D geometry for drawing on a tile (the city and farm painters):
// the canonical hex, building footprints and heights, and small helpers.
// Distances are in tile steps (neighboring tile centers are 1 apart).

export interface Pt { readonly x: number; readonly y: number }
export type Sides = 5 | 6;

// Canonical shapes: inradius per shape, as on the globe (hexes 0.5 on
// average, pentagons smaller). Only hexes are built up.
export const INR: Record<Sides, number> = { 5: 0.34, 6: 0.5 };
// The safe zone (the hex norm, rhoOf: 0 at the center, 1 on the edges):
// what matters most stands inside SAFE_RHO, a city's wonders
// (cityPainter.ts). (Water may reach into it: shores and rivers bend
// freely, and a city keeps off the water wherever it lies.)
export const SAFE_RHO = 0.8;

// Buildings are measured on a grid, as in SimCity: a footprint of whole
// cells (front × depth: b23 is 2 cells along its front and 3 deep) and a
// height in floors.
export const CELL = 0.0225; // tile steps
export const FOOTPRINTS = ['b22', 'b23', 'b32', 'b33', 'b44'] as const;
export type Footprint = (typeof FOOTPRINTS)[number];
export const FOOTPRINT_CELLS: Record<Footprint, readonly [number, number]> = { b22: [2, 2], b23: [2, 3], b32: [3, 2], b33: [3, 3], b44: [4, 4] };
// Heights: single, double, triple, quad, skyscraper.
export const FLOORS = [1, 2, 3, 4, 12] as const;
export type Floors = (typeof FLOORS)[number];
export const FLOOR_NAME: Record<Floors, string> = { 1: 'single', 2: 'double', 3: 'triple', 4: 'quad', 12: 'skyscraper' };
// How tall a building's walls are, in cells (chosen by eye: a double is
// not twice a single, nor a skyscraper twelve times one). Low buildings get
// a roof on top.
const WALL_CELLS: Record<Floors, number> = { 1: 0.9, 2: 1.5, 3: 2.25, 4: 3.0, 12: 9.0 };
export const wallHeight = (floors: Floors): number => WALL_CELLS[floors] * CELL;
// Footprint half extents: along its front, and in depth.
export const LOT_SIZE = Object.fromEntries(FOOTPRINTS.map((f) => [f, [FOOTPRINT_CELLS[f][0] * CELL / 2, FOOTPRINT_CELLS[f][1] * CELL / 2] as const])) as Record<Footprint, readonly [number, number]>;

export const polar = (r: number, a: number): Pt => ({ x: r * Math.cos(a), y: r * Math.sin(a) });

// Corner j of the canonical k-gon: side j runs from corner j to corner j+1
// and faces angle 2πj/k.
export function corner(k: Sides, j: number): Pt {
  return polar(INR[k] / Math.cos(Math.PI / k), ((2 * j - 1) * Math.PI) / k);
}
// Hex radius of a point: 1 on the tile's edge.
export function rhoOf(k: Sides, p: Pt): number {
  let m = -Infinity;
  for (let j = 0; j < k; j++) {
    const a = (2 * Math.PI * j) / k;
    m = Math.max(m, p.x * Math.cos(a) + p.y * Math.sin(a));
  }
  return m / INR[k];
}
// The fan holding p (the triangle center, corner j, corner j+1) and p's
// weights toward those corners. Outside the polygon the weights extrapolate.
export function toFan(k: Sides, p: Pt): { j: number; wa: number; wb: number } {
  const step = (2 * Math.PI) / k;
  let a = Math.atan2(p.y, p.x) + Math.PI / k;
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const j = Math.min(k - 1, Math.floor(a / step));
  const A = corner(k, j), B = corner(k, j + 1);
  const det = A.x * B.y - A.y * B.x;
  return { j, wa: (p.x * B.y - p.y * B.x) / det, wb: (A.x * p.y - A.y * p.x) / det };
}

// ---------- 2D helpers ----------

export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
export const len = (a: Pt) => Math.hypot(a.x, a.y);
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function pointInPoly(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
