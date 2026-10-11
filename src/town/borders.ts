// Border types: what a side of a tile's middle looks like where it meets
// its strip. A few fixed shapes per density, each mirror-symmetric about
// the side's middle (so it reads the same from either tile, and tiles can
// turn freely):
//   single  one street through the middle of the side
//   double  two narrower streets, at a quarter of the way from each end
//   closed  no street: garden backs
// Every middle picks a type for each of its sides; every pair of types has
// one hand-drawn strip (drawings.ts), so any middle fits beside any other.

import { DENSITIES, STRIP_DEPTH, STRIP_SIDE, RC, coreEdge, type Density, type Pt, type Sides, type StreetClass } from './geometry.ts';

export const SHAPES = ['single', 'double', 'closed'] as const;
export type Shape = (typeof SHAPES)[number];
export type BorderType = `${Density}-${Shape}`;
export const BORDER_TYPES: readonly BorderType[] = DENSITIES.flatMap((d) => SHAPES.map((s): BorderType => `${d}-${s}`));
export const borderType = (d: Density, s: Shape): BorderType => `${d}-${s}`;
export const densityOfType = (t: BorderType) => t.split('-')[0] as Density;
export const shapeOfType = (t: BorderType) => t.split('-')[1] as Shape;

// Where streets cross a side: shares of the way along it (symmetric).
export const STUBS: Record<Shape, readonly number[]> = { single: [0.5], double: [0.28, 0.72], closed: [] };
// How wide they are.
export const STUB_CLASS: Record<Density, Record<Exclude<Shape, 'closed'>, StreetClass>> = {
  low: { single: 'street', double: 'lane' },
  medium: { single: 'main', double: 'street' },
  high: { single: 'avenue', double: 'main' },
};
export const stubClass = (t: BorderType): StreetClass | null => {
  const s = shapeOfType(t);
  return s === 'closed' ? null : STUB_CLASS[densityOfType(t)][s];
};

// A middle's stubs on side j (canonical frame), in order along the side.
export const middleStubs = (k: Sides, j: number, s: Shape): Pt[] => STUBS[s].map((u) => coreEdge(k, j, u));
// A strip's stubs on side A (y = -STRIP_DEPTH) or B (y = +STRIP_DEPTH).
// Side B runs the other way along the edge, so its shares are mirrored
// (the same set, since every shape is symmetric).
export const stripStubs = (s: Shape, side: -1 | 1): Pt[] =>
  STUBS[s].map((u) => ({ x: (u - 0.5) * STRIP_SIDE * RC * (side < 0 ? 1 : -1), y: side * STRIP_DEPTH }));

// The order strips are keyed in: a strip is drawn for (a, b) with a at or
// before b; used for (b, a) it is mirrored across the edge.
export const typeIndex = (t: BorderType) => BORDER_TYPES.indexOf(t);
export type Far = BorderType | 'land' | 'water';
export const stripKey = (a: BorderType, b: Far): string => `${a}|${b}`;
