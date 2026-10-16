// Plain 2D geometry for the town drawings (see index.ts): the canonical
// hex, street widths, lot footprints, and small helpers to draw with.
// Distances are in tile steps (neighboring tile centers are 1 apart).

export interface Pt { readonly x: number; readonly y: number }
export type Sides = 5 | 6;
// low: mostly single storeys (a village); medium: double (a town); high:
// quads, Industrial blocks (Haussmann's Paris); metropolitan: skyscrapers
// among quads (a modern downtown).
export const DENSITIES = ['low', 'medium', 'high', 'metropolitan'] as const;
export type Density = (typeof DENSITIES)[number];

// Canonical shapes: inradius per shape, as on the globe (hexes 0.5 on
// average, pentagons smaller). Only hexes are built up.
export const INR: Record<Sides, number> = { 5: 0.34, 6: 0.5 };
export const sideLength = (k: Sides) => 2 * INR[k] * Math.tan(Math.PI / k);
// Water and the tiles (the hex norm, rhoOf: 0 at the center, 1 on the
// edges; surface.test.ts W7, W8). Shores follow the hex edges a little
// inside the water tile (paint.ts SHORE_RULE, SHORE_SHIFT), rivers run
// along the edges (RIVER_RULE):
//   - a land tile has no sea or lake water at all;
//   - river water stays out of its safe zone, inside SAFE_RHO: past it,
//     beside a river, a building may be left out (wetland pools are not
//     bounded: cities drain them);
//   - a water tile is open water inside HARBOR_RHO (its rim is a strip of
//     beach, about 0.86 out at the middles of its sides).
export const SAFE_RHO = 0.8;
export const HARBOR_RHO = 0.75;

export type StreetClass = 'lane' | 'street' | 'main' | 'avenue';
// Half widths.
export const HALF_WIDTH: Record<StreetClass, number> = { lane: 0.013, street: 0.017, main: 0.021, avenue: 0.027 };

// What stands on a lot. Buildings are measured on the terrain grid, as in
// SimCity: a footprint of whole cells (front × depth: b23 is 2 cells along
// its street and 3 deep) and a height in floors. The rest is garden and
// street furniture.
export const CELL = 0.025; // tile steps
export const FOOTPRINTS = ['b22', 'b23', 'b32', 'b33', 'b44'] as const;
export type Footprint = (typeof FOOTPRINTS)[number];
export const FOOTPRINT_CELLS: Record<Footprint, readonly [number, number]> = { b22: [2, 2], b23: [2, 3], b32: [3, 2], b33: [3, 3], b44: [4, 4] };
export type LotKind = Footprint | 'tree' | 'well' | 'fountain' | 'stall' | 'shed';
export const LOT_KINDS: readonly LotKind[] = [...FOOTPRINTS, 'tree', 'well', 'fountain', 'stall', 'shed'];
export const HOMES: ReadonlySet<LotKind> = new Set(FOOTPRINTS);
export const isBuilding = (k: LotKind): k is Footprint => HOMES.has(k);
// Heights: single, double, quad, skyscraper.
export const FLOORS = [1, 2, 4, 12] as const;
export type Floors = (typeof FLOORS)[number];
export const FLOOR_NAME: Record<Floors, string> = { 1: 'single', 2: 'double', 4: 'quad', 12: 'skyscraper' };
export const FLOOR_HEIGHT = 0.9 * CELL; // tile steps per floor (a single storey as tall as a cottage's walls)
// A building's front door (tile steps: width, height), on the side facing
// its street; tall buildings get a wider entrance.
export function doorSize(kind: Footprint, floors: Floors): readonly [number, number] {
  const w = FOOTPRINT_CELLS[kind][0] * CELL;
  return floors > 2 ? [Math.min(0.018, 0.4 * w), 0.75 * FLOOR_HEIGHT] : [Math.min(0.01, 0.35 * w), 0.6 * FLOOR_HEIGHT];
}
// Footprint half extents: along its front, and in depth.
export const LOT_SIZE: Record<LotKind, readonly [number, number]> = {
  ...Object.fromEntries(FOOTPRINTS.map((f) => [f, [FOOTPRINT_CELLS[f][0] * CELL / 2, FOOTPRINT_CELLS[f][1] * CELL / 2] as const])) as Record<Footprint, readonly [number, number]>,
  tree: [0.012, 0.012], well: [0.008, 0.008], fountain: [0.02, 0.02], stall: [0.011, 0.009], shed: [0.012, 0.009],
};

export interface Lot {
  readonly x: number; readonly y: number;
  readonly yaw: number;   // the way its front faces (radians)
  readonly kind: LotKind;
  readonly floors?: Floors; // buildings
  readonly spot?: number; // stands on building spot k (gone once a building is there)
}
// A round place for a building (the slots, the hall, a wonder): its middle,
// radius, and the way it faces.
export interface Spot { readonly x: number; readonly y: number; readonly r: number; readonly yaw: number }
export interface Street2 { readonly pts: readonly Pt[]; readonly cls: StreetClass }
// A paved square (drawn on the ground) or a green (kept clear, not paved).
export interface Square { readonly pts: readonly Pt[]; readonly paved: boolean }

// ---------- the canonical tile ----------

export const polar = (r: number, a: number): Pt => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
export const DEG = Math.PI / 180;

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
export const P = (x: number, y: number): Pt => ({ x, y });

export function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a), l2 = ab.x * ab.x + ab.y * ab.y;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2)) : 0;
  return len(sub(p, lerp(a, b, t)));
}
export function distToLine(p: Pt, pts: readonly Pt[]): number {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, distToSeg(p, pts[i]!, pts[i + 1]!));
  return pts.length === 1 ? len(sub(p, pts[0]!)) : d;
}
export function nearestOn(pts: readonly Pt[], p: Pt): Pt {
  let best = pts[0]!, bd = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, ab = sub(b, a), l2 = ab.x * ab.x + ab.y * ab.y;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2)) : 0;
    const q = lerp(a, b, t), d = len(sub(p, q));
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
export function pointInPoly(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
// A smooth curve through the points (Catmull-Rom), ends kept exactly.
export function curve(pts: readonly Pt[], per = 6): Pt[] {
  if (pts.length < 3) return [...pts];
  const out: Pt[] = [pts[0]!];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let s = 1; s <= per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}
// An arc around c from angle a0 to a1 (degrees).
export function arc(c: Pt, r: number, a0: number, a1: number, step = 12): Pt[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  return Array.from({ length: n + 1 }, (_, i) => add(c, polar(r, (a0 + ((a1 - a0) * i) / n) * DEG)));
}
// Points every `step` along a polyline (ends kept).
export function densify(pts: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, n = Math.max(1, Math.ceil(len(sub(b, a)) / step));
    for (let s = 0; s < n; s++) out.push(lerp(a, b, s / n));
  }
  if (pts.length) out.push(pts[pts.length - 1]!);
  return out;
}

// ---------- lots ----------

export function lotCorners(l: Pick<Lot, 'x' | 'y' | 'yaw' | 'kind'>, grow = 0): Pt[] {
  const [hw, hd] = LOT_SIZE[l.kind];
  const f = { x: Math.cos(l.yaw), y: Math.sin(l.yaw) }, s = { x: -f.y, y: f.x };
  const c = { x: l.x, y: l.y };
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => add(c, add(mul(s, a! * (hw + grow)), mul(f, b! * (hd + grow)))));
}
// Points to test a footprint with: corners, edge middles, the middle.
export function lotSamples(l: Pick<Lot, 'x' | 'y' | 'yaw' | 'kind'>): Pt[] {
  const c = lotCorners(l);
  return [...c, ...c.map((p, i) => lerp(p, c[(i + 1) % 4]!, 0.5)), { x: l.x, y: l.y }];
}
// Whether two footprints overlap (separating axes), each grown by `pad`.
export function lotsOverlap(a: Lot, b: Lot, pad = 0): boolean {
  const ra = Math.hypot(...LOT_SIZE[a.kind]) + pad, rb = Math.hypot(...LOT_SIZE[b.kind]) + pad;
  if (Math.hypot(a.x - b.x, a.y - b.y) > ra + rb) return false;
  const ca = lotCorners(a, pad / 2), cb = lotCorners(b, pad / 2);
  for (const poly of [ca, cb]) {
    for (let i = 0; i < 4; i++) {
      const e = sub(poly[(i + 1) % 4]!, poly[i]!), n = { x: -e.y, y: e.x };
      const pa = ca.map((p) => p.x * n.x + p.y * n.y), pb = cb.map((p) => p.x * n.x + p.y * n.y);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

// ---------- checks ----------

// Problems with a drawn layout: lots outside their region or overlapping
// each other, the streets, paved squares or spots.
export function layoutProblems(region: (p: Pt) => boolean, streets: readonly Street2[], lots: readonly Lot[],
  spots: readonly Spot[], squares: readonly Square[] = []): string[] {
  const out: string[] = [];
  const furniture = (k: LotKind) => k === 'fountain' || k === 'stall' || k === 'tree' || k === 'well';
  lots.forEach((l, i) => {
    const pts = lotSamples(l);
    if (!pts.every(region)) out.push(`lot ${i} (${l.kind}) outside`);
    for (const s of streets) if (pts.some((p) => distToLine(p, s.pts) < HALF_WIDTH[s.cls])) { out.push(`lot ${i} (${l.kind}) on a street`); break; }
    for (const q of squares) if (q.paved && !furniture(l.kind) && pts.some((p) => pointInPoly(p, q.pts))) out.push(`lot ${i} on a square`);
    spots.forEach((s, k) => {
      if (l.spot === k) { if (len(sub(l, s)) >= s.r) out.push(`lot ${i} of spot ${k} outside it`); }
      else if (pts.some((p) => len(sub(p, s)) < s.r)) out.push(`lot ${i} on spot ${k}`);
    });
    for (let j = i + 1; j < lots.length; j++) if (lotsOverlap(l, lots[j]!)) out.push(`lots ${i} and ${j} overlap`);
  });
  return out;
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// Whether two polylines cross or come within tol of each other.
export function linesMeet(a: readonly Pt[], b: readonly Pt[], tol: number): boolean {
  for (let i = 0; i + 1 < a.length; i++) {
    for (let j = 0; j + 1 < b.length; j++) {
      const p = a[i]!, q = a[i + 1]!, r = b[j]!, t = b[j + 1]!;
      if (segsCross(p, q, r, t)) return true;
      if (Math.min(distToSeg(p, r, t), distToSeg(q, r, t), distToSeg(r, p, q), distToSeg(t, p, q)) < tol) return true;
    }
  }
  return false;
}
// The streets form one network (if `one`), and every given point is the
// end of some street.
export function reaches(streets: readonly Street2[], ends: readonly Pt[], one = true, tol = 1e-6): boolean {
  if (one && streets.length > 1) {
    const parent = streets.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    for (let i = 0; i < streets.length; i++) for (let j = i + 1; j < streets.length; j++) {
      if (linesMeet(streets[i]!.pts, streets[j]!.pts, 3e-3)) parent[find(i)] = find(j);
    }
    if (new Set(streets.map((_, i) => find(i))).size !== 1) return false;
  }
  return ends.every((p) => streets.some((s) => len(sub(s.pts[0]!, p)) < tol || len(sub(s.pts[s.pts.length - 1]!, p)) < tol));
}
