// The drafting pen (scripts/draftTowns.ts only, never at runtime): puts a
// first set of lots along a drawing's hand-drawn streets, which is then
// frozen into lots.json and corrected by hand. Lots face their street, row
// after row back from it; skipped lots become gardens; open ground far
// from any street gets garden trees and sheds.

import { mulberry32, type Rng } from '../rng.ts';
import {
  HALF_WIDTH, LOT_SIZE, add, densify, distToLine, len, lotSamples, lotsOverlap, mul, nearestOn, pointInPoly, sub,
  type Density, type Lot, type LotKind, type Pt, type Spot, type Square, type Street2,
} from './geometry.ts';

// Lot rows back from a street, by density.
export const ROWS: Record<Density, { rows: readonly LotKind[]; skip: number; garden: number; gap: number; yard: number }> = {
  low: { rows: ['house', 'tree'], skip: 0.2, garden: 0.5, gap: 0.01, yard: 0.1 },
  medium: { rows: ['row', 'row', 'house'], skip: 0.04, garden: 0.5, gap: 0.004, yard: 0.12 },
  high: { rows: ['tower', 'block'], skip: 0.05, garden: 0.9, gap: 0.006, yard: 0.1 },
};

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
  const streetGap = (p: Pt, pad: number) => {
    let m = Infinity;
    for (const s of inp.streets) m = Math.min(m, distToLine(p, s.pts) - HALF_WIDTH[s.cls] - pad);
    return m;
  };
  const fits = (l: Lot, spot?: number) => {
    const pts = lotSamples(l);
    if (!pts.every(inp.region)) return false;
    if (pts.some((p) => streetGap(p, 0.002) < 0)) return false;
    if (pts.some((p) => inp.squares.some((q) => pointInPoly(p, q.pts)))) return false;
    for (let k = 0; k < inp.spots.length; k++) {
      const s = inp.spots[k]!, inside = len(sub(l, s)) < s.r;
      if (k === spot ? !inside : pts.some((p) => len(sub(p, s)) < s.r)) return false;
    }
    if (inp.keepClear.some((s) => pts.some((p) => len(sub(p, s)) < s.r))) return false;
    return !lots.some((o) => lotsOverlap(o, l, 0.003));
  };
  const along = (spot?: number) => {
    for (let row = 0; row < 3; row++) {
      inp.streets.forEach((st, si) => {
        if (inp.frontage && !inp.frontage(si)) return;
        const sw = HALF_WIDTH[st.cls];
        const pts = densify(st.pts, 0.004);
        let run = rand() * 0.02, last = -Infinity;
        for (let i = 1; i < pts.length; i++) {
          run += len(sub(pts[i]!, pts[i - 1]!));
          const d = inp.density(pts[i]!), R = ROWS[d];
          if (row >= R.rows.length) continue;
          const kind = R.rows[row]!;
          const [hw, hd] = LOT_SIZE[kind];
          if (run - last < 2 * hw + R.gap + 0.004 * rand()) continue;
          const a = pts[Math.max(0, i - 3)]!, b = pts[Math.min(pts.length - 1, i + 3)]!;
          const t = sub(b, a), tl = len(t);
          if (tl < 1e-9) continue;
          const first = LOT_SIZE[R.rows[0]!][1];
          const off = sw + 0.004 + (row === 0 ? hd : 2 * first + 0.005 * row + hd + (row - 1) * 2 * first);
          let placed = false;
          for (const sgn of [1, -1]) {
            const n = { x: (-t.y / tl) * sgn, y: (t.x / tl) * sgn };
            const c = add(pts[i]!, mul(n, off));
            const base = { x: c.x, y: c.y, yaw: Math.atan2(-n.y, -n.x), kind };
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
          if (placed) last = run;
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
      if (!inp.region(p) || streetGap(p, 0) < 0.03) continue;
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
