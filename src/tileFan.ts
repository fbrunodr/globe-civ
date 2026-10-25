// Points of a tile as fan coordinates (fan i = the triangle center, corner
// i, corner i+1, and the weights toward those corners), the coordinates the
// terrain uses: how a rural drawing (src/rural), drawn on the canonical hex
// (town/geometry.ts) and turned into place by its colouring's class
// (town/edges.ts), is laid onto a real tile. Pure.

import { toFan, type Pt } from './town/geometry.ts';
import { turnPoint, type Turn } from './town/edges.ts';

export interface FanPt { t: number; i: number; wa: number; wb: number }

// Points along a drawn line every this far (tile steps, as drawn).
export const STAMP_STEP = 0.02;

export function toTile(tile: number, turn: Turn, p: Pt): FanPt {
  const f = toFan(6, turnPoint(turn, p));
  return { t: tile, i: f.j, wa: f.wa, wb: f.wb };
}
