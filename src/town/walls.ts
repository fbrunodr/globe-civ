// Town walls, for the walled center (role 'walled'): drawn by hand as wall
// runs (polylines; a ring ends where it starts) with gates cut into them.
// A gate is a point on a wall: the wall opens GATE_HALF to either side of
// it, with a tower on each side. Streets may cross a wall only through a
// gate (checks.ts). Towers also stand at every corner of a run and at its
// loose ends. The generated draft is a ring inside the tile's safe zone
// with a gate where each street comes in.

import { corner, len, mul, sub, type Pt } from './geometry.ts';
import type { Stub } from './edges.ts';

export const WALL_HALF = 0.008;  // half the wall's thickness (tile steps)
export const TOWER_R = 0.02;     // a tower's radius
export const GATE_HALF = 0.048;  // half a gate's opening, along its wall
export const WALL_CLEAR = 0.02;  // lots keep this far from a wall's line (clear of its towers)
export const DRAFT_RHO = 0.76;   // the draft ring's share of the inradius (inside the safe zone, geometry.ts SAFE_RHO: no river reaches it)

export interface Walls { readonly walls: readonly (readonly Pt[])[]; readonly gates: readonly Pt[] }

const closed = (w: readonly Pt[]) => w.length > 2 && len(sub(w[0]!, w[w.length - 1]!)) < 1e-6;

// The draft: a ring round the rim (through the corners), a gate where each stub's street comes in.
export function draftWalls(stubs: readonly Stub[]): Walls {
  const ring = Array.from({ length: 7 }, (_, j) => mul(corner(6, j % 6), DRAFT_RHO));
  return { walls: [ring], gates: stubs.map((s) => mul(s.p, DRAFT_RHO)) };
}

// Where along a wall (its length from the start) the point nearest to p
// lies, and how far p is from it.
function along(w: readonly Pt[], p: Pt): { s: number; d: number } {
  let best = { s: 0, d: Infinity }, acc = 0;
  for (let i = 0; i + 1 < w.length; i++) {
    const a = w[i]!, b = w[i + 1]!, ab = sub(b, a), l = len(ab);
    if (l < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (l * l)));
    const d = len(sub(p, { x: a.x + ab.x * t, y: a.y + ab.y * t }));
    if (d < best.d) best = { s: acc + t * l, d };
    acc += l;
  }
  return best;
}
// The point at length s along a wall.
function pointAt(w: readonly Pt[], s: number): Pt {
  let acc = 0;
  for (let i = 0; i + 1 < w.length; i++) {
    const a = w[i]!, b = w[i + 1]!, l = len(sub(b, a));
    if (s <= acc + l || i + 2 === w.length) { const t = l > 0 ? Math.max(0, Math.min(1, (s - acc) / l)) : 0; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    acc += l;
  }
  return w[w.length - 1]!;
}
const lengthOf = (w: readonly Pt[]) => w.reduce((a, p, i) => (i ? a + len(sub(p, w[i - 1]!)) : 0), 0);

// The gate a point stands on, if any: within this distance of a wall.
export const ON_WALL = 0.006;
export const gateWall = (walls: readonly (readonly Pt[])[], g: Pt): number => walls.findIndex((w) => along(w, g).d < ON_WALL);

// A run of standing wall: its points (every `step` at most) and where towers stand.
export interface WallRun { readonly pts: readonly Pt[]; readonly towers: readonly boolean[] }

// The walls as they stand: each cut open at its gates, towers at the
// openings, the corners and the loose ends.
export function wallRuns(w: Walls, step = 0.05): WallRun[] {
  const out: WallRun[] = [];
  w.walls.forEach((wall, wi) => {
    if (wall.length < 2) return;
    const L = lengthOf(wall), ring = closed(wall);
    // Each vertex's length along the wall (the corners, for towers).
    const corners: number[] = [];
    let acc = 0;
    wall.forEach((p, i) => { if (i) acc += len(sub(p, wall[i - 1]!)); corners.push(acc); });
    const cuts = w.gates.filter((g) => gateWall(w.walls, g) === wi).map((g) => along(wall, g).s).sort((a, b) => a - b);
    // The stretches left standing, as [from, to] lengths (on a ring, `to` may run past L).
    let keep: [number, number][];
    if (!cuts.length) keep = [[0, L]];
    else if (ring) keep = cuts.map((c, i) => [c + GATE_HALF, (i + 1 < cuts.length ? cuts[i + 1]! : cuts[0]! + L) - GATE_HALF]);
    else keep = [[0, cuts[0]! - GATE_HALF], ...cuts.map((c, i): [number, number] => [c + GATE_HALF, i + 1 < cuts.length ? cuts[i + 1]! - GATE_HALF : L])];
    for (const [a, b] of keep) {
      if (b - a < 1e-4) continue;
      const at = (s: number) => pointAt(wall, ring ? ((s % L) + L) % L : s);
      // Its corners inside the stretch (on a ring, once round), then points every `step` between.
      const marks = [a, ...corners.flatMap((c) => (ring ? [c, c + L] : [c])).filter((c) => c > a + 1e-6 && c < b - 1e-6).sort((x, y) => x - y), b]
        .filter((c, i, arr) => i === 0 || c - arr[i - 1]! > 1e-6);
      const pts: Pt[] = [], towers: boolean[] = [];
      marks.forEach((m, i) => {
        if (i) {
          const prev = marks[i - 1]!, n = Math.ceil((m - prev) / step);
          for (let k = 1; k < n; k++) { pts.push(at(prev + ((m - prev) * k) / n)); towers.push(false); }
        }
        pts.push(at(m));
        towers.push(true);
      });
      out.push({ pts, towers });
    }
  });
  return out;
}

// Where a street (polyline) crosses a wall (polyline).
export function crossings(street: readonly Pt[], wall: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < street.length; i++) {
    const p = street[i]!, r = sub(street[i + 1]!, p);
    for (let j = 0; j + 1 < wall.length; j++) {
      const q = wall[j]!, s = sub(wall[j + 1]!, q);
      const den = r.x * s.y - r.y * s.x;
      if (Math.abs(den) < 1e-12) continue;
      const qp = sub(q, p), t = (qp.x * s.y - qp.y * s.x) / den, u = (qp.x * r.y - qp.y * r.x) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push({ x: p.x + r.x * t, y: p.y + r.y * t });
    }
  }
  return out;
}
