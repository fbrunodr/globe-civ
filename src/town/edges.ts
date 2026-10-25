// Edge values: what crosses each side of a built-up hex.
//   0  no street (open land, water, or a tile that is not built up)
//   1  a street, through the middle of the side
// Both tiles of an edge read the same value, and the stub is the side's
// middle, so their streets meet exactly.
//
// A hex's six values (its colouring, side by side) fall into 13 classes
// under turning and mirroring (the dihedral group D6); one drawing per class
// (role, density, and variant) serves every colouring in it, turned and
// mirrored into place.
// Pentagons are never built up, so only hexes have drawings.

import { corner, type Pt } from './geometry.ts';

export type EdgeValue = 0 | 1;
export type Colouring = readonly EdgeValue[]; // per side, length 6
// Where streets cross a side: shares of the way along it from its first corner.
export const STUB_U: Record<EdgeValue, readonly number[]> = { 0: [], 1: [0.5] };

// A turn and a mirror of the hex: drawing side j lies on tile side
// (flip ? -j : j) + rot (mod 6).
export interface Turn { readonly rot: number; readonly flip: boolean }
export const TURNS: readonly Turn[] = [false, true].flatMap((flip) => [0, 1, 2, 3, 4, 5].map((rot) => ({ rot, flip })));
export const sideUnder = (t: Turn, j: number): number => (((t.flip ? -j : j) + t.rot) % 6 + 6) % 6;

export const key = (c: Colouring): string => c.join('');
export const parseKey = (k: string): Colouring => [...k].map((ch) => Number(ch) as EdgeValue);

// The colouring a drawing must have to show `c` under turn t.
export const underTurn = (c: Colouring, t: Turn): EdgeValue[] => [0, 1, 2, 3, 4, 5].map((j) => c[sideUnder(t, j)]!);

// A colouring's class: its smallest key under all turns, and the turn that
// lays that class's drawing onto the colouring.
export function classOf(c: Colouring): { key: string; turn: Turn } {
  let best: string | null = null, turn = TURNS[0]!;
  for (const t of TURNS) {
    const k = key(underTurn(c, t));
    if (best === null || k < best) { best = k; turn = t; }
  }
  return { key: best!, turn };
}

// Every class, in key order.
export const CLASSES: readonly string[] = (() => {
  const set = new Set<string>();
  for (let n = 0; n < 64; n++) {
    const c: EdgeValue[] = [];
    for (let j = 0; j < 6; j++) c.push(((n >> j) & 1) as EdgeValue);
    set.add(classOf(c).key);
  }
  return [...set].sort();
})();

// ---------- the drawing frame (the canonical hex, inradius 0.5) ----------

// A stub: where a street crosses side j, and the way into the tile.
export interface Stub { readonly side: number; readonly n: number; readonly p: Pt; readonly into: Pt; readonly value: EdgeValue }
export function stubsOf(c: Colouring): Stub[] {
  const out: Stub[] = [];
  c.forEach((v, j) => {
    const a = corner(6, j), b = corner(6, j + 1);
    const into = { x: -Math.cos((j * Math.PI) / 3), y: -Math.sin((j * Math.PI) / 3) };
    STUB_U[v].forEach((u, n) => out.push({ side: j, n, p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, into, value: v }));
  });
  return out;
}

// A drawing point laid on the tile under turn t (mirror across the x axis,
// then turn by 60° per step), in the same canonical frame.
export function turnPoint(t: Turn, p: Pt): Pt {
  const y = t.flip ? -p.y : p.y, a = (t.rot * Math.PI) / 3;
  return { x: p.x * Math.cos(a) - y * Math.sin(a), y: p.x * Math.sin(a) + y * Math.cos(a) };
}

