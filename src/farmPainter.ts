// The farm painter: where things stand on a worked land tile (its ground
// is painted by the terrain shader: plots, spoil, pits, clearings). On a
// grid in the tile's canonical hex (tile steps), along its plots (farmAxis), it
// places a homestead near the middle and then a few yards round it
// (haystacks, a herd, a grove, heaps, stones, logs) as rectangles: each on
// dry ground inside the tile, near the homestead but scattered, a gap of
// one square round each. Pure and deterministic.

import { rhoOf, type Pt } from './town/geometry.ts';
import type { ImprovementKey } from './cities.ts';
import { mulberry32 } from './rng.ts';

// Which work an improvement is (fishing boats: none, they stand on water).
export type Work = 'cultivation' | 'extraction' | 'forest';
export const WORK_OF: Record<ImprovementKey, Work | null> = {
  farm: 'cultivation', wetland: 'cultivation', mine: 'extraction', quarry: 'extraction', camp: 'forest', boats: null,
};
// How far the countryside has filled up (by era, until the tech tree).
export type RuralDensity = 'low' | 'medium' | 'high';

// Which way a tile's farm runs: along one of its hex's sides (the terrain
// shader lays its plots this way too). Radians, from the canonical x axis.
export const farmAxis = (t: number): number => ((Math.imul(t + 1, 0x9e3779b1) >>> 16) % 3) * (Math.PI / 3);

export interface FarmInput {
  readonly work: Work;
  readonly axis: number;   // farmAxis
  readonly density: RuralDensity;
  readonly seed: number;
  readonly free: (p: Pt) => boolean; // open dry ground
}
export interface Farm {
  readonly home: Pt;                  // the homestead's middle
  readonly u: Pt;                     // the grid's axis (the homestead faces it)
  readonly yards: readonly (readonly Pt[])[]; // rectangles (4 corners)
}

const UNIT = 0.02;            // a grid square (tile steps)
const N = 25;                 // squares from the middle to the edge
const REACH = 0.86;           // the hex radius the farm keeps inside
const HOME = 3;               // the homestead's square (squares a side)
const COUNT: Record<RuralDensity, number> = { low: 2, medium: 3, high: 4 };
// Yard sizes (squares: the long side's range, the short side's) by work.
const SIZE: Record<Work, readonly [number, number, number, number]> = {
  cultivation: [4, 6, 3, 5], extraction: [3, 5, 3, 5], forest: [4, 6, 4, 6],
};
// How freely the yards stray from the homestead (squares).
const SPREAD = 12;

export function paintFarm(inp: FarmInput): Farm | null {
  const rand = mulberry32(inp.seed);
  const a = inp.axis, u = { x: Math.cos(a), y: Math.sin(a) }, v = { x: -u.y, y: u.x };
  const at = (x: number, y: number): Pt => ({ x: (x * u.x + y * v.x) * UNIT, y: (x * u.y + y * v.y) * UNIT });
  const S = 2 * N, ok = new Uint8Array(S * S), taken = new Uint8Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const p = at(i - N + 0.5, j - N + 0.5);
    ok[j * S + i] = rhoOf(6, p) <= REACH && inp.free(p) ? 1 : 0;
  }
  const fits = (i0: number, j0: number, w: number, h: number) => {
    if (i0 < 0 || j0 < 0 || i0 + w > S || j0 + h > S) return false;
    for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) if (!ok[j * S + i] || taken[j * S + i]) return false;
    return true;
  };
  const take = (i0: number, j0: number, w: number, h: number) => {
    for (let j = j0 - 1; j <= j0 + h; j++) for (let i = i0 - 1; i <= i0 + w; i++) if (i >= 0 && j >= 0 && i < S && j < S) taken[j * S + i] = 1;
  };
  // The free w × h spot whose middle is nearest `to` (squares, from the grid's corner), a little at random.
  const nearest = (w: number, h: number, tx: number, ty: number, jitter: number): [number, number] | null => {
    let best: [number, number] | null = null, bestS = Infinity;
    for (let j0 = 0; j0 + h <= S; j0++) for (let i0 = 0; i0 + w <= S; i0++) {
      const s = Math.hypot(i0 + w / 2 - tx, j0 + h / 2 - ty) + jitter * rand();
      if (s < bestS && fits(i0, j0, w, h)) { best = [i0, j0]; bestS = s; }
    }
    return best;
  };
  // The homestead: near the middle (off it a little, so tiles differ).
  const r0 = 3 * rand(), a0 = rand() * Math.PI * 2;
  const h0 = nearest(HOME, HOME, N + r0 * Math.cos(a0), N + r0 * Math.sin(a0), 0);
  if (!h0) return null;
  take(h0[0], h0[1], HOME, HOME);
  const hx = h0[0] + HOME / 2, hy = h0[1] + HOME / 2;
  // The yards, round it.
  const [l0, l1, s0, s1] = SIZE[inp.work];
  const yards: Pt[][] = [];
  for (let n = 0; n < COUNT[inp.density]; n++) {
    const long = l0 + Math.floor(rand() * (l1 - l0 + 1)), short = s0 + Math.floor(rand() * (s1 - s0 + 1));
    const [w, h] = rand() < 0.5 ? [long, short] : [short, long];
    const spot = nearest(w, h, hx, hy, SPREAD);
    if (!spot) continue;
    take(spot[0], spot[1], w, h);
    const [x0, y0] = [spot[0] - N, spot[1] - N];
    yards.push([at(x0, y0), at(x0 + w, y0), at(x0 + w, y0 + h), at(x0, y0 + h)]);
  }
  return { home: at(hx - N, hy - N), u, yards };
}
