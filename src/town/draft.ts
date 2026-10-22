// The drafting pen (scripts/draftTowns.ts only, never at runtime): puts a
// first set of lots along a drawing's hand-drawn streets, which is then
// frozen into lots.json and corrected by hand. Lots face their street, row
// after row back from it; skipped lots become gardens; open ground far
// from any street gets garden trees and sheds.

import { mulberry32, type Rng } from '../rng.ts';
import {
  HALF_WIDTH, LOT_SIZE, type Floors, add, densify, distToSeg, inSpot, len, lotSamples, lotsOverlap, mul, nearestOn, pointInPoly, sub,
  type Density, type Lot, type LotKind, type Pt, type Spot, type Square, type Street2,
} from './geometry.ts';

// Street segments in grid cells, to find the ones near a point quickly.
class SegIndex {
  private readonly cells = new Map<number, { a: Pt; b: Pt; hw: number }[]>();
  constructor(streets: readonly Street2[], private readonly reach: number, private readonly size = 0.06) {
    for (const s of streets) {
      const hw = HALF_WIDTH[s.cls];
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const a = s.pts[i]!, b = s.pts[i + 1]!, seg = { a, b, hw };
        const r = hw + reach;
        for (let cx = this.c(Math.min(a.x, b.x) - r); cx <= this.c(Math.max(a.x, b.x) + r); cx++) {
          for (let cy = this.c(Math.min(a.y, b.y) - r); cy <= this.c(Math.max(a.y, b.y) + r); cy++) {
            const k = cx * 4096 + cy, l = this.cells.get(k);
            if (l) l.push(seg); else this.cells.set(k, [seg]);
          }
        }
      }
    }
  }
  private c(v: number): number { return Math.floor(v / this.size); }
  // The smallest gap from p to a street's side (minus pad), as far as `reach`
  // (beyond it: reach).
  gap(p: Pt, pad: number): number {
    let m = this.reach;
    for (const s of this.cells.get(this.c(p.x) * 4096 + this.c(p.y)) ?? []) m = Math.min(m, distToSeg(p, s.a, s.b) - s.hw - pad);
    return m;
  }
}

// Lot rows back from a street, by density: each row's buildings (footprints
// and floors, picked at random) or garden trees.
interface Row { kinds: readonly LotKind[]; floors: readonly Floors[] }
export const ROWS: Record<Density, { rows: readonly Row[]; skip: number; garden: number; gap: number; yard: number }> = {
  low: { rows: [{ kinds: ['b22', 'b22', 'b32'], floors: [1, 1, 2] }, { kinds: ['tree'], floors: [1] }], skip: 0.2, garden: 0.5, gap: 0.01, yard: 0.1 },
  medium: { rows: [{ kinds: ['b23', 'b23', 'b22'], floors: [2, 2, 1] }, { kinds: ['b22', 'b23'], floors: [1, 2] }], skip: 0.04, garden: 0.5, gap: 0.004, yard: 0.12 },
  dense: { rows: [{ kinds: ['b23', 'b33', 'b23'], floors: [3, 3, 2] }, { kinds: ['b23', 'b22'], floors: [2, 3] }], skip: 0.04, garden: 0.6, gap: 0.004, yard: 0.11 },
  high: { rows: [{ kinds: ['b33', 'b23', 'b32'], floors: [4, 4, 2] }, { kinds: ['b23', 'b33'], floors: [2, 4] }], skip: 0.04, garden: 0.7, gap: 0.004, yard: 0.1 },
  metropolitan: { rows: [{ kinds: ['b44', 'b33', 'b44'], floors: [12, 4, 12] }, { kinds: ['b33'], floors: [4] }], skip: 0.05, garden: 0.9, gap: 0.006, yard: 0.1 },
};
const rowDepth = (r: Row) => Math.max(...r.kinds.map((k) => LOT_SIZE[k][1]));

export interface DraftInput {
  region: (p: Pt) => boolean;      // where lots may stand
  density: (p: Pt) => Density;     // whose density the ground is (strips: one per half)
  streets: readonly Street2[];
  squares: readonly Square[];
  spots: readonly Spot[];          // building spots (their own lots are drafted inside them)
  keepClear: readonly Spot[];      // the hall, a wonder: nothing there
  decor: readonly Lot[];           // drawn by hand: kept, lots avoid them
  seed: number;
  frontage?: (s: number) => boolean; // which streets get lots (default all)
}

export function draftLots(inp: DraftInput): Lot[] {
  const rand: Rng = mulberry32(inp.seed);
  const lots: Lot[] = [...inp.decor];
  // (Gaps beyond 0.05 are not needed exactly: lots only ask whether they are clear.)
  const index = new SegIndex(inp.streets, 0.05);
  const streetGap = (p: Pt, pad: number) => index.gap(p, pad);
  const fits = (l: Lot, spot?: number) => {
    const pts = lotSamples(l);
    if (!pts.every(inp.region)) return false;
    if (pts.some((p) => streetGap(p, 0.002) < 0)) return false;
    if (pts.some((p) => inp.squares.some((q) => pointInPoly(p, q.pts)))) return false;
    for (let k = 0; k < inp.spots.length; k++) {
      const s = inp.spots[k]!, inside = inSpot(l, s);
      if (k === spot ? !inside : pts.some((p) => inSpot(p, s))) return false;
    }
    if (inp.keepClear.some((s) => pts.some((p) => inSpot(p, s)))) return false;
    return !lots.some((o) => lotsOverlap(o, l, 0.003));
  };
  const along = (spot?: number) => {
    for (let row = 0; row < 3; row++) {
      inp.streets.forEach((st, si) => {
        if (inp.frontage && !inp.frontage(si)) return;
        const sw = HALF_WIDTH[st.cls];
        const pts = densify(st.pts, 0.004);
        let run = rand() * 0.02, last = -Infinity;
        const near = spot === undefined ? null : inp.spots[spot]!;
        const pick = (r: Row) => ({ kind: r.kinds[Math.floor(rand() * r.kinds.length)]!, floors: r.floors[Math.floor(rand() * r.floors.length)]! });
        let next: { kind: LotKind; floors: Floors } | null = null;
        for (let i = 1; i < pts.length; i++) {
          run += len(sub(pts[i]!, pts[i - 1]!));
          // (A spot's own lots front the streets beside it.)
          if (near && len(sub(pts[i]!, near)) > near.r + 0.09) continue;
          const d = inp.density(pts[i]!), R = ROWS[d];
          if (row >= R.rows.length) continue;
          next ??= pick(R.rows[row]!);
          const { kind, floors } = next;
          const [hw, hd] = LOT_SIZE[kind];
          if (run - last < 2 * hw + R.gap + 0.004 * rand()) continue;
          const a = pts[Math.max(0, i - 3)]!, b = pts[Math.min(pts.length - 1, i + 3)]!;
          const t = sub(b, a), tl = len(t);
          if (tl < 1e-9) continue;
          // Rows stand one behind the other, fronts aligned.
          let front = sw + 0.004;
          for (let r = 0; r < row; r++) front += 2 * rowDepth(R.rows[r]!) + 0.005;
          const off = front + hd;
          let placed = false;
          for (const sgn of [1, -1]) {
            const n = { x: (-t.y / tl) * sgn, y: (t.x / tl) * sgn };
            const c = add(pts[i]!, mul(n, off));
            const base: Lot = kind === 'tree' ? { x: c.x, y: c.y, yaw: Math.atan2(-n.y, -n.x), kind } : { x: c.x, y: c.y, yaw: Math.atan2(-n.y, -n.x), kind, floors };
            const lot: Lot = spot === undefined ? base : { ...base, spot };
            if (!fits(lot, spot)) continue;
            placed = true;
            if (spot === undefined && rand() < R.skip) {
              const tree: Lot = { x: c.x, y: c.y, yaw: 0, kind: 'tree' };
              if (rand() < R.garden && fits(tree)) lots.push(tree);
              continue;
            }
            lots.push(lot);
          }
          if (placed) { last = run; next = null; }
        }
      });
    }
  };
  along();
  inp.spots.forEach((_, k) => along(k));
  // Gardens: trees and sheds on open ground away from the streets.
  for (let x = -0.6; x <= 0.6; x += 0.04) {
    for (let y = -0.6; y <= 0.6; y += 0.04) {
      const p = { x: x + (rand() - 0.5) * 0.02, y: y + (rand() - 0.5) * 0.02 };
      if (!inp.region(p) || streetGap(p, 0) < 0.03) continue; // (gap is capped at 0.05, above this)
      const R = ROWS[inp.density(p)];
      const r = rand();
      const kind: LotKind | null = r < R.yard ? 'tree' : r < R.yard + 0.04 ? 'shed' : null;
      if (!kind) continue;
      const q = nearestStreet(inp.streets, p);
      const lot: Lot = { x: p.x, y: p.y, yaw: q ? Math.atan2(q.y - p.y, q.x - p.x) : rand() * 6.28, kind };
      if (fits(lot)) lots.push(lot);
    }
  }
  return lots.slice(inp.decor.length);
}

function nearestStreet(streets: readonly Street2[], p: Pt): Pt | null {
  let best: Pt | null = null, bd = Infinity;
  for (const s of streets) { const q = nearestOn(s.pts, p), d = len(sub(q, p)); if (d < bd) { bd = d; best = q; } }
  return best;
}
