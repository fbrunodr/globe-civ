// The drafting pen: lots along a drawing's streets (the generated drafts,
// and the editor's "Redraft lots"). Every building fronts its street, in
// one row along each side; skipped lots are gardens; the open ground keeps
// what grew there (the game keeps the tile's own flora), a shed here and
// there.

import { mulberry32, type Rng } from '../rng.ts';
import {
  HALF_WIDTH, LOT_SIZE, isBuilding, type Density, type Floors, type Footprint, add, densify, distToSeg, inSpot, len, lotSamples, lotsOverlap, mul, nearestOn, pointInPoly, sub,
  type Lot, type LotKind, type Pt, type Spot, type Square, type Street2,
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

// What a lot holds, by density and by how thick the town is there (the
// field, town/field.ts): the thickest ground gets the tallest buildings
// the density holds, thinner ground lower ones. Tiers from the thickest;
// footprints and floors picked at random within a tier.
interface Tier { readonly min: number; readonly kinds: readonly Footprint[]; readonly floors: readonly Floors[] }
export const TIERS: Record<Density, readonly Tier[]> = {
  low: [{ min: 0.6, kinds: ['b32', 'b22', 'b23'], floors: [1, 2, 1] }, { min: 0, kinds: ['b22', 'b22', 'b32'], floors: [1] }],
  medium: [{ min: 0.5, kinds: ['b23', 'b22', 'b32'], floors: [2] }, { min: 0.25, kinds: ['b22', 'b32'], floors: [1, 2] }, { min: 0, kinds: ['b22'], floors: [1] }],
  dense: [{ min: 0.62, kinds: ['b23', 'b33', 'b23'], floors: [3] }, { min: 0.38, kinds: ['b23', 'b22'], floors: [2] }, { min: 0, kinds: ['b22', 'b32'], floors: [1] }],
  high: [{ min: 0.7, kinds: ['b33', 'b23', 'b32'], floors: [4] }, { min: 0.48, kinds: ['b23', 'b33'], floors: [3] }, { min: 0.28, kinds: ['b23', 'b22'], floors: [2] }, { min: 0, kinds: ['b22'], floors: [1] }],
  metropolitan: [{ min: 0.8, kinds: ['b44', 'b44', 'b33'], floors: [12, 12, 4] }, { min: 0.6, kinds: ['b33', 'b44'], floors: [4] }, { min: 0.4, kinds: ['b33', 'b23'], floors: [3] }, { min: 0, kinds: ['b23', 'b22'], floors: [2] }],
};
// Whether a lot is built at all: rises from nothing to always over this
// range of the field (below it, gardens).
export const BUILD_FROM: Record<Density, readonly [number, number]> = {
  low: [0.2, 0.62], medium: [0.12, 0.42], dense: [0.1, 0.38], high: [0.1, 0.36], metropolitan: [0.1, 0.36],
};
// Skyscrapers stand apart: none closer than this to another (the second is a quad).
const TOWER_APART = 0.09;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface DraftInput {
  region: (p: Pt) => boolean;      // where lots may stand
  built: (p: Pt) => boolean;       // where buildings may stand (the building line)
  density: Density;
  intensity: (p: Pt) => number;    // how thick the town is there (0..1, town/field.ts)
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
    if (!pts.every(isBuilding(l.kind) ? inp.built : inp.region)) return false;
    if (pts.some((p) => streetGap(p, 0.002) < 0)) return false;
    if (pts.some((p) => inp.squares.some((q) => pointInPoly(p, q.pts)))) return false;
    for (let k = 0; k < inp.spots.length; k++) {
      const s = inp.spots[k]!, inside = inSpot(l, s);
      if (k === spot ? !inside : pts.some((p) => inSpot(p, s))) return false;
    }
    if (inp.keepClear.some((s) => pts.some((p) => inSpot(p, s)))) return false;
    return !lots.some((o) => lotsOverlap(o, l, 0.003));
  };
  // A building for ground this thick (null: leave it a garden).
  const d = inp.density;
  const pick = (at: number, inSpot: boolean): { kind: Footprint; floors: Floors } | null => {
    const [lo, hi] = BUILD_FROM[d];
    if (!inSpot && rand() > smooth(lo, hi, at)) return null;
    const v = at + (rand() - 0.5) * 0.12;
    const tier = TIERS[d].find((t) => v >= t.min) ?? TIERS[d][TIERS[d].length - 1]!;
    return { kind: tier.kinds[Math.floor(rand() * tier.kinds.length)]!, floors: tier.floors[Math.floor(rand() * tier.floors.length)]! };
  };
  // Every building fronts a street: one row along each side of it (lanes
  // reach the ground farther in, skeleton.ts). Where a building does not
  // fit, a smaller one is tried before moving on.
  const SMALLER: readonly Footprint[] = ['b44', 'b33', 'b23', 'b32', 'b22'];
  const along = (spot?: number) => {
    inp.streets.forEach((st, si) => {
      if (inp.frontage && !inp.frontage(si)) return;
      const sw = HALF_WIDTH[st.cls];
      const pts = densify(st.pts, 0.004);
      const near = spot === undefined ? null : inp.spots[spot]!;
      for (const sgn of [1, -1]) {
        let run = rand() * 0.02, last = -Infinity;
        let next: { kind: Footprint; floors: Floors } | 'garden' | null = null;
        for (let i = 1; i < pts.length; i++) {
          run += len(sub(pts[i]!, pts[i - 1]!));
          // (A spot's own lots front the streets beside it.)
          if (near && len(sub(pts[i]!, near)) > near.r + 0.09) continue;
          next ??= pick(inp.intensity(pts[i]!), spot !== undefined) ?? 'garden';
          const a = pts[Math.max(0, i - 3)]!, b = pts[Math.min(pts.length - 1, i + 3)]!;
          const t = sub(b, a), tl = len(t);
          if (tl < 1e-9) continue;
          const n = { x: (-t.y / tl) * sgn, y: (t.x / tl) * sgn }, yaw = Math.atan2(-n.y, -n.x);
          const at = (kind: LotKind) => add(pts[i]!, mul(n, sw + 0.004 + LOT_SIZE[kind][1]));
          // (A garden is a gap of a small house's width: the tile's own trees grow there, the game keeps them.)
          if (next === 'garden') {
            if (run - last < 2 * LOT_SIZE.b22[0] + 0.004) continue;
            const c = at('b22');
            if (!fits({ x: c.x, y: c.y, yaw, kind: 'b22' })) continue;
            last = run; next = null;
            continue;
          }
          const want = next;
          for (const kind of SMALLER.slice(SMALLER.indexOf(want.kind))) {
            if (run - last < 2 * LOT_SIZE[kind][0] + 0.004 + 0.003 * rand()) continue;
            const c = at(kind);
            // (Skyscrapers apart: a quad beside one already there.)
            const floors: Floors = want.floors === 12 && lots.some((o) => o.floors === 12 && len(sub(o, c)) < TOWER_APART) ? 4 : want.floors;
            const lot: Lot = spot === undefined ? { x: c.x, y: c.y, yaw, kind, floors } : { x: c.x, y: c.y, yaw, kind, floors, spot };
            if (!fits(lot, spot)) continue;
            lots.push(lot);
            last = run; next = null;
            break;
          }
        }
      }
    });
  };
  along();
  inp.spots.forEach((_, k) => along(k));
  // Open ground keeps what grew there (the game keeps the tile's own
  // flora clear of buildings and streets: render.ts); a shed here and there
  // where the town thins.
  for (let x = -0.6; x <= 0.6; x += 0.05) {
    for (let y = -0.6; y <= 0.6; y += 0.05) {
      const p = { x: x + (rand() - 0.5) * 0.03, y: y + (rand() - 0.5) * 0.03 };
      if (!inp.region(p) || streetGap(p, 0) < 0.025) continue; // (gap is capped at 0.05, above this)
      const at = inp.intensity(p);
      if (at < 0.25 || at > 0.7 || rand() > 0.06) continue;
      const q = nearestStreet(inp.streets, p);
      const lot: Lot = { x: p.x, y: p.y, yaw: q ? Math.atan2(q.y - p.y, q.x - p.x) : rand() * 6.28, kind: 'shed' };
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
