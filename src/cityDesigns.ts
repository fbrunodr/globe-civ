// Hand-drawn town tiles. A built-up tile is not grown street by street: it
// is stamped with one of a fixed set of drawings, each made once in a
// canonical regular hexagon (or pentagon) and laid onto the real tile.
//
// Every drawing has two parts:
//   core   the middle of the tile (hex radius up to RC): streets, house lots,
//          the spots where buildings go, squares and greens;
//   rim    the band between the core and the tile's edge, split into one
//          trapezoid per side. The two trapezoids on either side of an edge
//          make that edge's connection strip, drawn per pair of drawings
//          (connection()), so neighboring tiles read as one town.
//
// What makes any two drawings fit: each core's streets leave it through
// the middle of every side (its ports, the same on all sides, so rotations
// never matter), and every connection strip runs a street from one port
// across the edge's midpoint to the other. Lots stay inside their own core
// or trapezoid, so nothing from two drawings can overlap.
//
// Densities: low (houses and gardens, one building spot), medium (rows of
// town houses, two spots), high (towers, two spots; later eras). Five hex
// drawings per density, one pentagon drawing per density, plus the city
// center's (a square with the hall) and a wonder's (an open square) per
// density and shape.
//
// Everything is plain 2D data and pure functions: render.ts maps it onto
// the globe (cityProps.ts), the design sheet (designSheet.ts) onto a plane.

import { mulberry32, type Rng } from './rng.ts';

export interface Pt { readonly x: number; readonly y: number }
export type Sides = 5 | 6;
export const DENSITIES = ['low', 'medium', 'high'] as const;
export type Density = (typeof DENSITIES)[number];
export type Role = 'block' | 'center' | 'wonder';

// Canonical shapes, in tile steps (the distance between neighboring tile
// centers is 1): inradius per shape, as on the globe (hexes 0.5 on average,
// pentagons smaller).
export const INR: Record<Sides, number> = { 5: 0.34, 6: 0.5 };
// The core: up to this share of the hex radius (the rest is the rim).
export const RC = 0.64;
export const sideLength = (k: Sides) => 2 * INR[k] * Math.tan(Math.PI / k);

export type StreetClass = 'lane' | 'street' | 'main' | 'avenue';
// Half widths.
export const HALF_WIDTH: Record<StreetClass, number> = { lane: 0.009, street: 0.012, main: 0.015, avenue: 0.02 };
// The street that leaves a core through its ports, by density.
export const PORT_STREET: Record<Density, StreetClass> = { low: 'street', medium: 'main', high: 'avenue' };

export interface Street2 { readonly pts: readonly Pt[]; readonly cls: StreetClass }

// What stands on a lot. Houses, rows and towers are homes (their model
// follows the era and climate); the rest is street furniture.
export type LotKind = 'house' | 'row' | 'block' | 'tower' | 'tree' | 'well' | 'fountain' | 'stall';
// Footprint half extents: along the street (frontage) and in depth.
export const LOT_SIZE: Record<LotKind, readonly [number, number]> = {
  house: [0.022, 0.017], row: [0.017, 0.02], block: [0.031, 0.027], tower: [0.03, 0.03],
  tree: [0.012, 0.012], well: [0.008, 0.008], fountain: [0.02, 0.02], stall: [0.011, 0.009],
};

export interface Lot {
  readonly x: number; readonly y: number;
  readonly yaw: number;   // the way its front faces (radians, canonical frame)
  readonly kind: LotKind;
  readonly spot?: number; // stands on building spot k (gone once a building is there)
}

// A round place for a building (or the hall): its middle, radius, and the
// way it faces (toward its street).
export interface Spot { readonly x: number; readonly y: number; readonly r: number; readonly yaw: number }

// A paved square (drawn on the ground) or a green (kept clear, not paved).
export interface Square { readonly pts: readonly Pt[]; readonly paved: boolean }

export interface Design {
  readonly id: string;
  readonly name: string;
  readonly sides: Sides;
  readonly density: Density;
  readonly role: Role;
  readonly streets: readonly Street2[];
  readonly lots: readonly Lot[];
  readonly spots: readonly Spot[]; // building slots, in order
  readonly hall: Spot | null;      // the city hall (centers)
  readonly middle: Spot | null;    // the wonder (wonder tiles)
  readonly squares: readonly Square[];
}

// ---------- canonical geometry ----------

const polar = (r: number, a: number): Pt => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
const deg = Math.PI / 180;

// Corner j of the canonical k-gon: side j runs from corner j to corner j+1
// and faces angle 2πj/k.
export function corner(k: Sides, j: number): Pt {
  return polar(INR[k] / Math.cos(Math.PI / k), ((2 * j - 1) * Math.PI) / k);
}
// Where streets leave the core: the middle of each side of the core.
export function port(k: Sides, j: number): Pt {
  return polar(INR[k] * RC, (2 * Math.PI * j) / k);
}
// Hex radius of a point: 1 on the tile's edge (the largest projection on a
// side's normal, over the inradius).
export function rhoOf(k: Sides, p: Pt): number {
  let m = -Infinity;
  for (let j = 0; j < k; j++) {
    const a = (2 * Math.PI * j) / k;
    m = Math.max(m, p.x * Math.cos(a) + p.y * Math.sin(a));
  }
  return m / INR[k];
}
// The fan of the k-gon holding p (the triangle center, corner j, corner j+1)
// and p's weights toward those corners. Outside the polygon the weights
// extrapolate.
export function toFan(k: Sides, p: Pt): { j: number; wa: number; wb: number } {
  const step = (2 * Math.PI) / k;
  let a = Math.atan2(p.y, p.x) + Math.PI / k;
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const j = Math.min(k - 1, Math.floor(a / step));
  const A = corner(k, j), B = corner(k, j + 1);
  const det = A.x * B.y - A.y * B.x;
  return { j, wa: (p.x * B.y - p.y * B.x) / det, wb: (A.x * p.y - A.y * p.x) / det };
}

// ---------- small 2D helpers ----------

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

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
function nearestOn(pts: readonly Pt[], p: Pt): Pt {
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
  return Array.from({ length: n + 1 }, (_, i) => add(c, polar(r, (a0 + ((a1 - a0) * i) / n) * deg)));
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

// A lot's footprint corners.
export function lotCorners(l: Pick<Lot, 'x' | 'y' | 'yaw' | 'kind'>, grow = 0): Pt[] {
  const [hw, hd] = LOT_SIZE[l.kind];
  const f = { x: Math.cos(l.yaw), y: Math.sin(l.yaw) }, s = { x: -f.y, y: f.x };
  const c = { x: l.x, y: l.y };
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => add(c, add(mul(s, a! * (hw + grow)), mul(f, b! * (hd + grow)))));
}
// Points to test a footprint with: corners, edge middles, the middle.
function lotSamples(l: Pick<Lot, 'x' | 'y' | 'yaw' | 'kind'>): Pt[] {
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

// ---------- drawing a layout ----------

// Drawings that could not be drawn as written (a spot with no room): must
// stay empty (test/cityDesigns.test.ts).
export const DESIGN_ERRORS: string[] = [];

// What a lot must stay inside, and clear of.
interface Area { inside(p: Pt): boolean }
const circle = (c: Pt, r: number): Area => ({ inside: (p) => len(sub(p, c)) < r });
const poly = (pts: readonly Pt[]): Area => ({ inside: (p) => pointInPoly(p, pts) });

export interface FillOpts {
  rows: readonly LotKind[];   // lot kind per row back from the street
  skip?: number;              // chance a lot is left as a garden
  garden?: number;            // chance a skipped lot gets a tree
  gap?: number;               // extra space between lots along the street
  streets?: readonly number[]; // which streets (default all)
  spot?: number;              // fill building spot k's circle (and only it)
}

// A layout being drawn: a design's core, or one half of a connection strip.
class Layout {
  readonly streets: Street2[] = [];
  readonly lots: Lot[] = [];
  readonly spots: Spot[] = [];
  readonly squares: Square[] = [];
  readonly clear: Area[] = []; // squares, greens, the hall: no lots
  hall: Spot | null = null;
  middle: Spot | null = null;
  name = '';
  constructor(readonly region: (p: Pt) => boolean, readonly rand: Rng, readonly inCircle: (c: Pt, r: number) => boolean) {}

  street(pts: readonly Pt[], cls: StreetClass): number {
    this.streets.push({ pts, cls });
    return this.streets.length - 1;
  }
  // The point of street s nearest to p (to end a street on it: a junction).
  on(s: number, p: Pt): Pt { return nearestOn(this.streets[s]!.pts, p); }
  square(pts: readonly Pt[], paved: boolean): void {
    this.squares.push({ pts, paved });
    this.clear.push(poly(pts));
  }
  round(c: Pt, r: number, paved: boolean): void {
    this.square(arc(c, r, 0, 360, 15).slice(0, -1), paved);
  }
  keepClear(c: Pt, r: number): void { this.clear.push(circle(c, r)); }

  private streetGap(p: Pt, pad: number): number {
    let m = Infinity;
    for (const s of this.streets) m = Math.min(m, distToLine(p, s.pts) - HALF_WIDTH[s.cls] - pad);
    return m;
  }
  private facing(p: Pt): number {
    let best: Pt = p, bd = Infinity;
    for (const s of this.streets) {
      const q = nearestOn(s.pts, p), d = len(sub(q, p)) - HALF_WIDTH[s.cls];
      if (d < bd) { bd = d; best = q; }
    }
    return Math.atan2(best.y - p.y, best.x - p.x);
  }

  // A building spot of radius r as near the hint as fits: inside the
  // region, clear of streets, squares and other spots, beside a street.
  spot(hint: Pt, r: number, kind: 'slot' | 'hall' | 'middle' = 'slot'): void {
    let best: Pt | null = null, bd = Infinity;
    for (let dx = -0.1; dx <= 0.1001; dx += 0.005) {
      for (let dy = -0.1; dy <= 0.1001; dy += 0.005) {
        const p = { x: hint.x + dx, y: hint.y + dy }, d = Math.hypot(dx, dy);
        if (d >= bd || !this.inCircle(p, r + 0.006)) continue;
        const g = this.streetGap(p, 0.004);
        if (g < r || (kind !== 'middle' && g > r + 0.03)) continue;
        if (this.spots.some((s) => len(sub(s, p)) < s.r + r + 0.006)) continue;
        if (this.hall && len(sub(this.hall, p)) < this.hall.r + r + 0.006) continue;
        if (kind === 'slot' && this.clear.some((a) => a.inside(p))) continue;
        best = p; bd = d;
      }
    }
    if (!best) { DESIGN_ERRORS.push(`${this.name}: no room for a ${kind} near ${hint.x.toFixed(3)},${hint.y.toFixed(3)}`); return; }
    const s: Spot = { x: best.x, y: best.y, r, yaw: this.facing(best) };
    if (kind === 'hall') { this.hall = s; this.keepClear(best, r); }
    else if (kind === 'middle') { this.middle = s; this.keepClear(best, r); }
    else this.spots.push(s);
  }

  decor(kind: LotKind, p: Pt, yaw = 0): void {
    this.lots.push({ x: p.x, y: p.y, yaw, kind });
  }
  decorIfFits(kind: LotKind, p: Pt, yaw = 0): void {
    const l: Lot = { x: p.x, y: p.y, yaw, kind };
    if (this.fits(l)) this.lots.push(l);
  }

  // Whether a lot fits: inside the region, off the streets and squares,
  // clear of other lots and spots.
  fits(l: Lot, spot?: number): boolean {
    const pts = lotSamples(l);
    if (!pts.every(this.region)) return false;
    if (pts.some((p) => this.streetGap(p, 0.002) < 0)) return false;
    if (pts.some((p) => this.clear.some((a) => a.inside(p)))) return false;
    for (let k = 0; k < this.spots.length; k++) {
      const s = this.spots[k]!, inside = len(sub(l, s)) < s.r;
      if (k === spot ? !inside : pts.some((p) => len(sub(p, s)) < s.r)) return false;
    }
    if (this.hall && pts.some((p) => len(sub(p, this.hall!)) < this.hall!.r)) return false;
    return !this.lots.some((o) => lotsOverlap(o, l, 0.003));
  }

  // Lots along both sides of the streets, facing them, row after row back.
  fill(o: FillOpts): void {
    const which = o.streets ?? this.streets.map((_, i) => i);
    for (let row = 0; row < o.rows.length; row++) {
      const kind = o.rows[row]!;
      const [hw, hd] = LOT_SIZE[kind];
      for (const si of which) {
        const st = this.streets[si]!, sw = HALF_WIDTH[st.cls];
        const off = sw + 0.004 + hd + LOT_SIZE[o.rows[0]!][1] * 2 * row + 0.005 * row
          + (row > 0 ? hd - LOT_SIZE[o.rows[0]!][1] : 0);
        const pts = densify(st.pts, 0.004);
        let along = this.rand() * hw, last = -Infinity;
        for (let i = 1; i < pts.length; i++) {
          along += len(sub(pts[i]!, pts[i - 1]!));
          if (along - last < 2 * hw + (o.gap ?? 0.004) + 0.004 * this.rand()) continue;
          const a = pts[Math.max(0, i - 3)]!, b = pts[Math.min(pts.length - 1, i + 3)]!;
          const t = sub(b, a), tl = len(t);
          if (tl < 1e-9) continue;
          let placed = false;
          for (const sgn of [1, -1]) {
            const n = { x: (-t.y / tl) * sgn, y: (t.x / tl) * sgn };
            const c = add(pts[i]!, mul(n, off));
            const lot: Lot = o.spot === undefined
              ? { x: c.x, y: c.y, yaw: Math.atan2(-n.y, -n.x), kind }
              : { x: c.x, y: c.y, yaw: Math.atan2(-n.y, -n.x), kind, spot: o.spot };
            if (!this.fits(lot, o.spot)) continue;
            if (o.skip && this.rand() < o.skip) {
              const tree: Lot = { x: c.x, y: c.y, yaw: 0, kind: 'tree' };
              if (o.garden && this.rand() < o.garden && this.fits(tree, o.spot)) this.lots.push(o.spot === undefined ? tree : { ...tree, spot: o.spot });
              placed = true;
              continue;
            }
            this.lots.push(lot);
            placed = true;
          }
          if (placed) last = along;
        }
      }
    }
  }

  // Trees scattered over an area (greens, parks), clear of everything.
  trees(c: Pt, r: number, n: number): void {
    for (let tries = 0; tries < n * 8 && n > 0; tries++) {
      const p = add(c, polar(r * Math.sqrt(this.rand()), this.rand() * Math.PI * 2));
      const t: Lot = { x: p.x, y: p.y, yaw: 0, kind: 'tree' };
      const pts = lotSamples(t);
      if (!pts.every(this.region) || pts.some((q) => this.streetGap(q, 0.002) < 0)) continue;
      if (this.lots.some((o) => lotsOverlap(o, t, 0.002))) continue;
      this.lots.push(t);
      n--;
    }
  }
}

// ---------- the drawings ----------

// Lot rows by density: low houses with gardens, medium rows of town
// houses, high towers with blocks behind.
const ROWS: Record<Density, FillOpts> = {
  low: { rows: ['house', 'tree'], skip: 0.25, garden: 0.8, gap: 0.012 },
  medium: { rows: ['row', 'row', 'house'], skip: 0.04, garden: 0.5 },
  high: { rows: ['tower', 'block'], skip: 0.05, garden: 0.9, gap: 0.006 },
};
// Building spot radius by shape.
const SPOT_R: Record<Sides, number> = { 6: 0.064, 5: 0.054 };

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

interface Ctx {
  k: Sides;
  d: Density;
  L: Layout;
  P: (j: number) => Pt;        // port j
  main: StreetClass;           // port street class
  r: number;                   // spot radius
  core: number;                // core inradius
}

function coreLayout(k: Sides, id: string): Layout {
  const lim = RC - 0.012 / INR[k];
  const inCircle = (c: Pt, r: number) => {
    for (let j = 0; j < k; j++) {
      const a = (2 * Math.PI * j) / k;
      if (c.x * Math.cos(a) + c.y * Math.sin(a) + r > lim * INR[k]) return false;
    }
    return true;
  };
  return new Layout((p) => rhoOf(k, p) <= lim, mulberry32(hash(id)), inCircle);
}

function make(id: string, name: string, k: Sides, d: Density, role: Role, draw: (c: Ctx) => void): Design {
  const L = coreLayout(k, id);
  L.name = id;
  const c: Ctx = { k, d, L, P: (j) => port(k, j), main: PORT_STREET[d], r: SPOT_R[k], core: INR[k] * RC };
  draw(c);
  return {
    id, name, sides: k, density: d, role,
    streets: L.streets, lots: L.lots, spots: L.spots, hall: L.hall, middle: L.middle, squares: L.squares,
  };
}

// Fills the layout: rows along the streets, then the building spots' own
// houses (shown until a building stands there).
function finish(c: Ctx, o: Partial<FillOpts> = {}): void {
  const rows = { ...ROWS[c.d], ...o };
  c.L.fill(rows);
  c.L.spots.forEach((_, k) => c.L.fill({ ...rows, skip: 0, spot: k }));
}

// Spokes from every port to a point each (straight, or bent through a midpoint).
function spokes(c: Ctx, to: (j: number) => Pt, bend = 0, cls: StreetClass = c.main): number[] {
  const out: number[] = [];
  for (let j = 0; j < c.k; j++) {
    const a = c.P(j), b = to(j);
    const m = lerp(a, b, 0.5), t = sub(b, a), tl = len(t) || 1;
    const mid = add(m, mul({ x: -t.y / tl, y: t.x / tl }, bend * (j % 2 ? -1 : 1)));
    out.push(c.L.street(bend ? curve([a, mid, b]) : [a, b], cls));
  }
  return out;
}

const ring = (c: Ctx, r: number, cls: StreetClass, a0 = 0) => c.L.street(arc({ x: 0, y: 0 }, r, a0, a0 + 360, 10), cls);
const hexAng = (c: Ctx, j: number) => (360 * j) / c.k;

// ----- low density: villages, gardens between the houses -----

const LOW: ((c: Ctx) => void)[] = [
  // Green: a village green with a well; lanes meet around it.
  (c) => {
    c.L.round({ x: 0, y: 0 }, 0.055, false);
    ring(c, 0.07, 'lane');
    spokes(c, (j) => polar(0.07, hexAng(c, j) * deg), 0.02);
    c.L.decor('well', { x: 0.015, y: -0.01 });
    c.L.trees({ x: 0, y: 0 }, 0.045, 3);
    c.L.spot(polar(0.19, 30 * deg), c.r);
    finish(c);
  },
  // Bend: one street winding through, the others joining it.
  (c) => {
    const m = c.L.street(curve([c.P(0), { x: 0.12, y: -0.06 }, { x: -0.1, y: 0.05 }, c.P(3)], 8), c.main);
    c.L.street(curve([c.P(1), { x: 0.1, y: 0.12 }, c.L.on(m, { x: 0.05, y: -0.02 })]), c.main);
    c.L.street(curve([c.P(2), { x: -0.12, y: 0.17 }, c.L.on(m, { x: -0.14, y: 0.06 })]), c.main);
    c.L.street(curve([c.P(4), { x: -0.12, y: -0.15 }, c.L.on(m, { x: -0.06, y: 0.02 })]), c.main);
    c.L.street(curve([c.P(5), { x: 0.16, y: -0.18 }, c.L.on(m, { x: 0.2, y: -0.05 })]), c.main);
    c.L.spot({ x: -0.02, y: 0.17 }, c.r);
    finish(c);
  },
  // Orchard: a loop lane around an orchard, spokes out to the edges.
  (c) => {
    ring(c, 0.15, 'lane', 15);
    spokes(c, (j) => polar(0.15, hexAng(c, j) * deg));
    c.L.round({ x: 0, y: 0 }, 0.11, false);
    c.L.trees({ x: 0, y: 0 }, 0.1, 12);
    c.L.spot(polar(0.235, 210 * deg), c.r);
    finish(c, { rows: ['house'] });
  },
  // Fork: three streets meet off-middle; the others join them halfway.
  (c) => {
    const J = { x: -0.04, y: 0.03 };
    const s0 = c.L.street(curve([c.P(0), { x: 0.15, y: 0.03 }, J]), c.main);
    const s2 = c.L.street(curve([c.P(2), { x: -0.1, y: 0.16 }, J]), c.main);
    const s4 = c.L.street(curve([c.P(4), { x: -0.1, y: -0.12 }, J]), c.main);
    c.L.street(curve([c.P(1), { x: 0.12, y: 0.15 }, c.L.on(s0, { x: 0.12, y: 0.05 })]), 'lane');
    c.L.street(curve([c.P(3), { x: -0.2, y: 0.02 }, c.L.on(s2, { x: -0.1, y: 0.1 })]), 'lane');
    c.L.street(curve([c.P(5), { x: 0.1, y: -0.2 }, c.L.on(s4, { x: -0.02, y: -0.08 })]), 'lane');
    c.L.spot({ x: 0.12, y: -0.1 }, c.r);
    finish(c);
  },
  // Eye: two lanes bow apart around a meadow between two ends.
  (c) => {
    const W = { x: -0.15, y: 0 }, E = { x: 0.15, y: 0 };
    c.L.street([c.P(0), E], c.main);
    c.L.street([c.P(3), W], c.main);
    const top = c.L.street(curve([E, { x: 0, y: 0.1 }, W]), 'street');
    const bot = c.L.street(curve([E, { x: 0, y: -0.1 }, W]), 'street');
    c.L.street(curve([c.P(1), { x: 0.12, y: 0.15 }, c.L.on(top, { x: 0.07, y: 0.09 })]), 'lane');
    c.L.street(curve([c.P(2), { x: -0.12, y: 0.15 }, c.L.on(top, { x: -0.07, y: 0.09 })]), 'lane');
    c.L.street(curve([c.P(4), { x: -0.12, y: -0.15 }, c.L.on(bot, { x: -0.07, y: -0.09 })]), 'lane');
    c.L.street(curve([c.P(5), { x: 0.12, y: -0.15 }, c.L.on(bot, { x: 0.07, y: -0.09 })]), 'lane');
    c.L.square([{ x: -0.1, y: 0 }, { x: -0.03, y: 0.06 }, { x: 0.03, y: 0.06 }, { x: 0.1, y: 0 }, { x: 0.03, y: -0.06 }, { x: -0.03, y: -0.06 }], false);
    c.L.trees({ x: 0, y: 0 }, 0.06, 4);
    c.L.spot({ x: 0, y: 0.2 }, c.r);
    finish(c);
  },
];

// ----- medium density: towns, terraced rows -----

const MEDIUM: ((c: Ctx) => void)[] = [
  // Market square: a square in the middle, streets from its sides and corners.
  (c) => {
    const h = 0.075;
    const sq = [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }, { x: -h, y: -h }];
    c.L.street(sq, 'street');
    c.L.square(sq.slice(0, 4).map((p) => mul(p, 0.82)), true);
    c.L.street([c.P(0), { x: h, y: 0 }], c.main);
    c.L.street([c.P(3), { x: -h, y: 0 }], c.main);
    c.L.street(curve([c.P(1), { x: 0.07, y: 0.15 }, { x: 0.03, y: h }]), c.main);
    c.L.street(curve([c.P(2), { x: -0.07, y: 0.15 }, { x: -0.03, y: h }]), c.main);
    c.L.street(curve([c.P(4), { x: -0.07, y: -0.15 }, { x: -0.03, y: -h }]), c.main);
    c.L.street(curve([c.P(5), { x: 0.07, y: -0.15 }, { x: 0.03, y: -h }]), c.main);
    c.L.decor('fountain', { x: 0, y: 0 });
    for (const p of [{ x: -0.035, y: 0.03 }, { x: 0.035, y: 0.03 }, { x: -0.035, y: -0.03 }, { x: 0.035, y: -0.03 }]) c.L.decor('stall', p, Math.atan2(-p.y, -p.x));
    c.L.spot(polar(0.21, 30 * deg), c.r);
    c.L.spot(polar(0.21, 210 * deg), c.r);
    finish(c);
  },
  // Blocks: a street straight through, cross streets, blocks between.
  (c) => {
    c.L.street([c.P(3), c.P(0)], c.main);
    const n = c.L.street([{ x: -0.24, y: 0.165 }, { x: 0.24, y: 0.165 }], 'street');
    const s = c.L.street([{ x: -0.24, y: -0.165 }, { x: 0.24, y: -0.165 }], 'street');
    for (const x of [-0.14, 0.14]) c.L.street([{ x, y: -0.165 }, { x, y: 0.165 }], 'lane');
    c.L.street([c.P(1), c.L.on(n, c.P(1))], c.main);
    c.L.street([c.P(2), c.L.on(n, c.P(2))], c.main);
    c.L.street([c.P(4), c.L.on(s, c.P(4))], c.main);
    c.L.street([c.P(5), c.L.on(s, c.P(5))], c.main);
    c.L.spot({ x: 0, y: 0.083 }, c.r);
    c.L.spot({ x: 0, y: -0.083 }, c.r);
    finish(c);
  },
  // Ring: a ring street, two buildings inside it, spokes out.
  (c) => {
    ring(c, 0.155, 'street');
    spokes(c, (j) => polar(0.155, hexAng(c, j) * deg));
    c.L.spot({ x: 0, y: 0.068 }, c.r);
    c.L.spot({ x: 0, y: -0.068 }, c.r);
    finish(c);
  },
  // High street: one main street, back lanes on either side.
  (c) => {
    const m = c.L.street(curve([c.P(3), { x: -0.1, y: 0.015 }, { x: 0.1, y: -0.015 }, c.P(0)]), c.main);
    const n = c.L.street(curve([c.P(2), { x: -0.11, y: 0.16 }, { x: 0, y: 0.155 }, { x: 0.11, y: 0.16 }, c.P(1)]), c.main);
    const s = c.L.street(curve([c.P(4), { x: -0.11, y: -0.16 }, { x: 0, y: -0.155 }, { x: 0.11, y: -0.16 }, c.P(5)]), c.main);
    c.L.street([c.L.on(n, { x: -0.02, y: 0.15 }), c.L.on(m, { x: -0.02, y: 0.01 })], 'lane');
    c.L.street([c.L.on(s, { x: 0.03, y: -0.15 }), c.L.on(m, { x: 0.03, y: -0.01 })], 'lane');
    c.L.spot({ x: 0.1, y: 0.08 }, c.r);
    c.L.spot({ x: -0.1, y: -0.08 }, c.r);
    finish(c);
  },
  // Crescents: two bowed streets around a long green.
  (c) => {
    const a = c.L.street(curve([c.P(2), { x: -0.14, y: 0.1 }, { x: 0, y: 0.08 }, { x: 0.14, y: 0.1 }, c.P(1)]), c.main);
    const b = c.L.street(curve([c.P(4), { x: -0.14, y: -0.1 }, { x: 0, y: -0.08 }, { x: 0.14, y: -0.1 }, c.P(5)]), c.main);
    const e = c.L.street(curve([c.P(0), { x: 0.2, y: 0.01 }, c.L.on(a, { x: 0.17, y: 0.09 })]), c.main);
    c.L.street([c.L.on(e, { x: 0.2, y: 0.005 }), c.L.on(b, { x: 0.17, y: -0.09 })], 'street');
    const w = c.L.street(curve([c.P(3), { x: -0.2, y: -0.01 }, c.L.on(b, { x: -0.17, y: -0.09 })]), c.main);
    c.L.street([c.L.on(w, { x: -0.2, y: -0.005 }), c.L.on(a, { x: -0.17, y: 0.09 })], 'street');
    c.L.square([{ x: -0.13, y: 0 }, { x: -0.05, y: 0.05 }, { x: 0.05, y: 0.05 }, { x: 0.13, y: 0 }, { x: 0.05, y: -0.05 }, { x: -0.05, y: -0.05 }], false);
    c.L.trees({ x: 0, y: 0 }, 0.05, 5);
    c.L.spot({ x: 0.02, y: 0.19 }, c.r);
    c.L.spot({ x: -0.02, y: -0.19 }, c.r);
    finish(c);
  },
];

// ----- high density: towers (later eras) -----

const HIGH: ((c: Ctx) => void)[] = [
  // Plaza: a paved plaza in the middle, avenues out.
  (c) => {
    const h = 0.08;
    const sq = [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }, { x: -h, y: -h }];
    c.L.street(sq, 'street');
    c.L.square(sq.slice(0, 4).map((p) => mul(p, 0.85)), true);
    spokes(c, (j) => nearestOn(sq, mul(c.P(j), 0.3)));
    c.L.decor('fountain', { x: 0, y: 0 });
    for (const p of [{ x: -0.045, y: 0.045 }, { x: 0.045, y: -0.045 }]) c.L.decor('tree', p);
    c.L.spot(polar(0.215, 30 * deg), c.r);
    c.L.spot(polar(0.215, 210 * deg), c.r);
    finish(c);
  },
  // Grid: a tight grid of blocks.
  (c) => {
    c.L.street([c.P(3), c.P(0)], c.main);
    const n = c.L.street([{ x: -0.25, y: 0.175 }, { x: 0.25, y: 0.175 }], 'street');
    const s = c.L.street([{ x: -0.25, y: -0.175 }, { x: 0.25, y: -0.175 }], 'street');
    for (const x of [-0.16, 0.16]) c.L.street([{ x, y: -0.175 }, { x, y: 0.175 }], 'street');
    c.L.street([{ x: 0, y: 0.175 }, { x: 0, y: 0.02 }], 'lane');
    c.L.street([c.P(1), c.L.on(n, c.P(1))], c.main);
    c.L.street([c.P(2), c.L.on(n, c.P(2))], c.main);
    c.L.street([c.P(4), c.L.on(s, c.P(4))], c.main);
    c.L.street([c.P(5), c.L.on(s, c.P(5))], c.main);
    c.L.spot({ x: 0.08, y: -0.09 }, c.r);
    c.L.spot({ x: -0.08, y: -0.09 }, c.r);
    finish(c);
  },
  // Boulevard: a wide avenue lined with trees, towers on both sides.
  (c) => {
    c.L.street([c.P(3), c.P(0)], 'avenue');
    const n = c.L.street(curve([c.P(2), { x: -0.1, y: 0.15 }, { x: 0.1, y: 0.15 }, c.P(1)]), c.main);
    const s = c.L.street(curve([c.P(4), { x: -0.1, y: -0.15 }, { x: 0.1, y: -0.15 }, c.P(5)]), c.main);
    c.L.street([c.L.on(n, { x: 0, y: 0.15 }), { x: 0, y: 0 }], 'street');
    c.L.street([c.L.on(s, { x: 0, y: -0.15 }), { x: 0, y: 0 }], 'street');
    c.L.spot({ x: 0.1, y: 0.085 }, c.r);
    c.L.spot({ x: -0.1, y: -0.085 }, c.r);
    for (let x = -0.27; x <= 0.27; x += 0.045) for (const y of [0.035, -0.035]) c.L.decorIfFits('tree', { x, y });
    finish(c);
  },
  // Park: a round park, towers around it.
  (c) => {
    ring(c, 0.14, 'street');
    spokes(c, (j) => polar(0.14, hexAng(c, j) * deg));
    c.L.round({ x: 0, y: 0 }, 0.12, false);
    c.L.trees({ x: 0, y: 0 }, 0.11, 16);
    c.L.spot(polar(0.235, 30 * deg), c.r);
    c.L.spot(polar(0.235, 210 * deg), c.r);
    finish(c);
  },
  // Roundabout: avenues straight to a roundabout.
  (c) => {
    ring(c, 0.05, 'street');
    spokes(c, (j) => polar(0.05, hexAng(c, j) * deg));
    c.L.round({ x: 0, y: 0 }, 0.032, false);
    c.L.decor('tree', { x: 0, y: 0 });
    c.L.spot(polar(0.2, 30 * deg), c.r);
    c.L.spot(polar(0.2, 210 * deg), c.r);
    finish(c);
  },
];

// ----- pentagons: one per density -----

const PENT: Record<Density, (c: Ctx) => void> = {
  low: (c) => {
    c.L.round({ x: 0, y: 0 }, 0.04, false);
    ring(c, 0.055, 'lane');
    spokes(c, (j) => polar(0.055, hexAng(c, j) * deg));
    c.L.decor('well', { x: 0, y: 0 });
    c.L.spot(polar(0.13, 36 * deg), c.r);
    finish(c);
  },
  medium: (c) => {
    ring(c, 0.1, 'street');
    spokes(c, (j) => polar(0.1, hexAng(c, j) * deg));
    c.L.spot(polar(0.04, 90 * deg), 0.042);
    c.L.spot(polar(0.04, 270 * deg), 0.042);
    finish(c);
  },
  high: (c) => {
    ring(c, 0.045, 'street');
    spokes(c, (j) => polar(0.045, hexAng(c, j) * deg));
    c.L.decor('tree', { x: 0, y: 0 });
    c.L.spot(polar(0.14, 36 * deg), c.r);
    c.L.spot(polar(0.14, 180 * deg), c.r);
    finish(c);
  },
};

// ----- city centers: a square with the hall, two building spots beside it -----

function center(c: Ctx): void {
  const r = c.k === 6 ? (c.d === 'low' ? 0.085 : 0.1) : 0.07;
  if (c.d === 'medium') {
    const sq = [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }, { x: -r, y: -r }];
    c.L.street(sq, 'street');
    c.L.square(sq.slice(0, 4).map((p) => mul(p, 0.84)), true);
    spokes(c, (j) => nearestOn(sq, mul(c.P(j), 0.3)));
  } else {
    ring(c, r, 'street');
    c.L.round({ x: 0, y: 0 }, r - 0.014, true);
    spokes(c, (j) => polar(r, hexAng(c, j) * deg));
  }
  const hr = c.k === 6 ? 0.05 : 0.04;
  c.L.spot(polar(r - 0.016 - hr, 90 * deg), hr, 'hall');
  c.L.decor(c.d === 'low' ? 'well' : 'fountain', polar(c.k === 6 ? 0.035 : 0.025, 270 * deg));
  const sr = c.k === 6 ? c.r : 0.044;
  c.L.spot(polar(r + sr + 0.03, (c.k === 6 ? 30 : 36) * deg), sr);
  c.L.spot(polar(r + sr + 0.03, (c.k === 6 ? 210 : 216) * deg), sr);
  finish(c);
}

// ----- wonders: an open square for the wonder, a ring of houses -----

function wonder(c: Ctx): void {
  const rr = c.core - (c.k === 6 ? 0.06 : 0.045);
  ring(c, rr, 'street');
  spokes(c, (j) => polar(rr, hexAng(c, j) * deg));
  c.L.round({ x: 0, y: 0 }, rr - 0.016, false);
  c.L.spot({ x: 0, y: 0 }, rr - HALF_WIDTH[c.main] - 0.012, 'middle');
  finish(c, { rows: [ROWS[c.d].rows[0]!] });
}

const NAMES: Record<Density, readonly string[]> = {
  low: ['Green', 'Bend', 'Orchard', 'Fork', 'Eye'],
  medium: ['Market square', 'Blocks', 'Ring', 'High street', 'Crescents'],
  high: ['Plaza', 'Grid', 'Boulevard', 'Park', 'Roundabout'],
};
const DRAW: Record<Density, readonly ((c: Ctx) => void)[]> = { low: LOW, medium: MEDIUM, high: HIGH };
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export const VARIANTS = 5;
// Hex blocks by density (VARIANTS each), the pentagon block, centers and
// wonder squares per density and shape.
export const BLOCKS: Record<Density, readonly Design[]> = {
  low: [], medium: [], high: [],
};
export const PENT_BLOCK = {} as Record<Density, Design>;
export const CENTER = { 5: {}, 6: {} } as Record<Sides, Record<Density, Design>>;
export const WONDER_SQUARE = { 5: {}, 6: {} } as Record<Sides, Record<Density, Design>>;
for (const d of DENSITIES) {
  (BLOCKS as Record<Density, Design[]>)[d] = DRAW[d].map((f, i) => make(`${d}-${i + 1}`, `${cap(d)} ${i + 1}: ${NAMES[d][i]}`, 6, d, 'block', f));
  PENT_BLOCK[d] = make(`${d}-pent`, `${cap(d)} pentagon`, 5, d, 'block', PENT[d]);
  for (const k of [5, 6] as const) {
    const s = k === 6 ? 'hex' : 'pent';
    CENTER[k][d] = make(`${d}-center-${s}`, `${cap(d)} center (${s})`, k, d, 'center', center);
    WONDER_SQUARE[k][d] = make(`${d}-wonder-${s}`, `${cap(d)} wonder square (${s})`, k, d, 'wonder', wonder);
  }
}
export const ALL_DESIGNS: readonly Design[] = DENSITIES.flatMap((d) => [
  ...BLOCKS[d], PENT_BLOCK[d], CENTER[6][d], CENTER[5][d], WONDER_SQUARE[6][d], WONDER_SQUARE[5][d],
]);

// The drawing for a tile.
export function designFor(k: Sides, role: Role, d: Density, variant: number): Design {
  if (role === 'center') return CENTER[k][d];
  if (role === 'wonder') return WONDER_SQUARE[k][d];
  return k === 5 ? PENT_BLOCK[d] : BLOCKS[d][((variant % VARIANTS) + VARIANTS) % VARIANTS]!;
}

// ---------- connection strips ----------

// The far side of an edge: another drawing, open land (the town's
// outskirts), or water.
export type Across = Design | 'land' | 'water';

// A strip's frame: x along the edge (0 at its middle, positive toward
// corner j+1 of side A), y across it (negative inside A, positive inside
// B). Side A reaches from the edge (y = 0) to its core at y = -depth(A).
export const stripDepth = (k: Sides) => (1 - RC) * INR[k];

export interface Strip {
  readonly streets: readonly Street2[];
  readonly lots: readonly Lot[];
}

// Whether a strip point lies inside side A (y <= 0) or B's trapezoid.
function inTrapezoid(k: Sides, p: Pt, sgn: -1 | 1, margin: number): boolean {
  const h = stripDepth(k), y = p.y * sgn;
  if (y < 0 || y > h - margin) return false;
  const rho = 1 - y / INR[k];
  return Math.abs(p.x) <= (sideLength(k) / 2) * rho - margin;
}

export interface StripOpts { wallA?: boolean; wallB?: boolean } // walls run along that side's core: keep clear of them

// Walls stand just outside the center's core: strips keep this much clear there.
export const WALL_CLEAR = 0.035;
export const WALL_AT = 0.018; // the wall line, outside the core boundary

// The connection strip between a and b (b may be land or water). Fixed per
// pair of drawings, so every edge between the same two drawings looks the
// same; connection(b, a) is connection(a, b) mirrored.
export function connection(a: Design, b: Across, opts: StripOpts = {}): Strip {
  const rand = mulberry32(hash(`${a.id}|${typeof b === 'string' ? b : b.id}`));
  const halves: { k: Sides; d: Density; sgn: -1 | 1; outer: 'land' | 'water' | null; own: Street2[] }[] =
    [{ k: a.sides, d: a.density, sgn: -1, outer: typeof b === 'string' ? b : null, own: [] }];
  if (typeof b !== 'string') halves.push({ k: b.sides, d: b.density, sgn: 1, outer: null, own: [] });
  // Streets first (both halves), so each half's lots keep clear of all of them.
  for (const h of halves) {
    const depth = stripDepth(h.k);
    // The street from the core's port to the edge's middle (stopping short of water).
    const amp = (rand() - 0.5) * 0.03;
    const end = h.outer === 'water' ? 0.03 : 0;
    const pts: Pt[] = [];
    for (let s = 0; s <= 8; s++) {
      const y = depth - (depth - end) * (s / 8);
      pts.push({ x: amp * Math.sin((Math.PI * (depth - y)) / depth), y: h.sgn * y });
    }
    h.own.push({ pts, cls: PORT_STREET[h.d] });
    // A lane along the edge, so the strip's corners are built up too:
    // across the whole strip in towns, on one side in villages (or none).
    if (h.outer === 'water') continue;
    const y = h.sgn * depth * (0.42 + 0.16 * rand());
    const reach = (sideLength(h.k) / 2) * (1 - Math.abs(y) / INR[h.k]) - 0.035;
    const mid = nearestOn(pts, { x: 0, y });
    const low = h.d === 'low' || h.outer !== null;
    if (low && rand() < 0.4) continue;
    const dirs = low ? [rand() < 0.5 ? 1 : -1] : [1, -1];
    for (const dir of dirs) h.own.push({ pts: [mid, { x: dir * reach, y: y + (rand() - 0.5) * 0.02 }], cls: 'lane' });
  }
  const streets = halves.flatMap((h) => h.own);
  const lots: Lot[] = [];
  for (const h of halves) {
    const depth = stripDepth(h.k);
    const wall = (h.sgn === -1 ? opts.wallA : opts.wallB) ? WALL_CLEAR : 0;
    const L = new Layout((p) => inTrapezoid(h.k, p, h.sgn, 0.004) && Math.abs(p.y) <= depth - 0.004 - wall, rand, () => true);
    const own = h.own.map((st) => L.street(st.pts, st.cls));
    for (const st of streets) if (!h.own.includes(st)) L.street(st.pts, st.cls);
    L.lots.push(...lots);
    const rows = h.outer ? { ...ROWS[h.d], rows: [ROWS[h.d].rows[0]!], skip: 0.35 } : ROWS[h.d];
    L.fill({ ...rows, streets: own });
    lots.push(...L.lots.slice(lots.length));
  }
  return { streets, lots };
}

// ---------- checks (test/cityDesigns.test.ts) ----------

// Problems with a drawn layout: lots outside their region or overlapping
// each other, the streets, the squares or the spots.
export function layoutProblems(region: (p: Pt) => boolean, streets: readonly Street2[], lots: readonly Lot[],
  spots: readonly Spot[], squares: readonly Square[] = []): string[] {
  const out: string[] = [];
  lots.forEach((l, i) => {
    const pts = lotSamples(l);
    if (!pts.every(region)) out.push(`lot ${i} (${l.kind}) outside`);
    for (const s of streets) if (pts.some((p) => distToLine(p, s.pts) < HALF_WIDTH[s.cls])) { out.push(`lot ${i} (${l.kind}) on a street`); break; }
    for (const q of squares) if (q.paved && l.kind !== 'fountain' && l.kind !== 'stall' && l.kind !== 'tree' && l.kind !== 'well' && pts.some((p) => pointInPoly(p, q.pts))) out.push(`lot ${i} on a square`);
    spots.forEach((s, k) => {
      if (l.spot === k) { if (len(sub(l, s)) >= s.r) out.push(`lot ${i} of spot ${k} outside it`); }
      else if (pts.some((p) => len(sub(p, s)) < s.r)) out.push(`lot ${i} on spot ${k}`);
    });
    for (let j = i + 1; j < lots.length; j++) {
      const o = lots[j]!;
      // A spot's own houses may share ground with nothing but each other.
      if (lotsOverlap(l, o)) out.push(`lots ${i} and ${j} overlap`);
    }
  });
  return out;
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// Whether two polylines cross or come within tol of each other.
function linesMeet(a: readonly Pt[], b: readonly Pt[], tol: number): boolean {
  for (let i = 0; i + 1 < a.length; i++) {
    for (let j = 0; j + 1 < b.length; j++) {
      const p = a[i]!, q = a[i + 1]!, r = b[j]!, t = b[j + 1]!;
      if (segsCross(p, q, r, t)) return true;
      if (Math.min(distToSeg(p, r, t), distToSeg(q, r, t), distToSeg(r, p, q), distToSeg(t, p, q)) < tol) return true;
    }
  }
  return false;
}

// The streets of a layout form one network reaching every given point.
export function connected(streets: readonly Street2[], reach: readonly Pt[], tol = 1e-6): boolean {
  if (!streets.length) return reach.length === 0;
  const parent = streets.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < streets.length; i++) {
    for (let j = i + 1; j < streets.length; j++) {
      const a = streets[i]!, b = streets[j]!;
      const touch = linesMeet(a.pts, b.pts, 3e-3);
      if (touch) parent[find(i)] = find(j);
    }
  }
  const roots = new Set(streets.map((_, i) => find(i)));
  if (roots.size !== 1) return false;
  return reach.every((p) => streets.some((s) => len(sub(s.pts[0]!, p)) < tol || len(sub(s.pts[s.pts.length - 1]!, p)) < tol));
}

export const coreRegion = (k: Sides) => (p: Pt) => rhoOf(k, p) <= RC;
export const halfRegion = (k: Sides, sgn: -1 | 1) => (p: Pt) => inTrapezoid(k, p, sgn, -1e-9);
