// Plain 2D geometry for the town drawings (see index.ts): the canonical
// hex, street widths, lot footprints, and small helpers to draw with.
// Distances are in tile steps (neighboring tile centers are 1 apart).

export interface Pt { readonly x: number; readonly y: number }
export type Sides = 5 | 6;
// low: mostly single storeys (a village); medium: double (a town); dense:
// three storeys (a Renaissance city of townhouses and palazzi); high:
// quads, Industrial blocks (Haussmann's Paris); metropolitan: skyscrapers
// among quads (a modern downtown).
export const DENSITIES = ['low', 'medium', 'dense', 'high', 'metropolitan'] as const;
export type Density = (typeof DENSITIES)[number];

// Canonical shapes: inradius per shape, as on the globe (hexes 0.5 on
// average, pentagons smaller). Only hexes are built up.
export const INR: Record<Sides, number> = { 5: 0.34, 6: 0.5 };
export const sideLength = (k: Sides) => 2 * INR[k] * Math.tan(Math.PI / k);
// Water and the tiles (the hex norm, rhoOf: 0 at the center, 1 on the
// edges; src/waterChecks.ts W7, W8). Shores follow the hex edges a little
// inside the water tile (paint.ts SHORE_RULE, SHORE_SHIFT), rivers run
// along the edges (RIVER_RULE):
//   - a land tile keeps its safe zone dry: no sea, lake or river water
//     inside SAFE_RHO. Almost every land tile has no sea or lake water at
//     all; rivers along its edges, and rarely a sliver of sea where two
//     land tiles meet at a coast, come in past it, where a building may be
//     left out (wetland pools are not bounded: cities drain them);
//   - a water tile is open water inside HARBOR_RHO (its rim is a strip of
//     beach, about 0.86 out at the middles of its sides).
export const SAFE_RHO = 0.8;
// What a player builds keeps inside the safe zone (no river reaches it):
// the building spots and the site (checks.ts spotPastRim). Houses
// may stand out to the lot area's edge (LOT_INNER): where a river comes in
// the game leaves out those at its bank.
// Lots stay within this share of the inradius: nearly to the edge, so a
// town reads as one across its tiles (no strip of rim between them).
export const LOT_INNER = 0.995;
export const HARBOR_RHO = 0.75;

export type StreetClass = 'lane' | 'street' | 'main' | 'avenue';
// Half widths.
export const HALF_WIDTH: Record<StreetClass, number> = { lane: 0.013, street: 0.017, main: 0.021, avenue: 0.027 };

// What stands on a lot. Buildings are measured on the terrain grid, as in
// SimCity: a footprint of whole cells (front × depth: b23 is 2 cells along
// its street and 3 deep) and a height in floors. The rest is garden and
// street furniture.
export const CELL = 0.0225; // tile steps
export const FOOTPRINTS = ['b22', 'b23', 'b32', 'b33', 'b44'] as const;
export type Footprint = (typeof FOOTPRINTS)[number];
export const FOOTPRINT_CELLS: Record<Footprint, readonly [number, number]> = { b22: [2, 2], b23: [2, 3], b32: [3, 2], b33: [3, 3], b44: [4, 4] };
// Props: garden, street and square furniture (one model each, cityProps.ts).
export const PROPS = ['tree', 'bush', 'hedge', 'flowerbed', 'well', 'fountain', 'statue', 'bench', 'lamp', 'stall', 'crates', 'shed'] as const;
export type PropKind = (typeof PROPS)[number];
export type LotKind = Footprint | PropKind;
export const LOT_KINDS: readonly LotKind[] = [...FOOTPRINTS, ...PROPS];
// Props that may stand on a paved square, in a green, turned any way (not
// facing a street), and on a river bank (plants).
export const ON_SQUARES: ReadonlySet<LotKind> = new Set<LotKind>(['tree', 'flowerbed', 'well', 'fountain', 'statue', 'bench', 'lamp', 'stall', 'crates']);
export const ON_GREENS: ReadonlySet<LotKind> = new Set<LotKind>(['tree', 'bush', 'hedge', 'flowerbed', 'statue', 'bench', 'lamp', 'well', 'fountain']);
export const SPINS: ReadonlySet<LotKind> = new Set<LotKind>(['tree', 'bush']);
export const PLANTS: ReadonlySet<LotKind> = new Set<LotKind>(['tree', 'bush', 'hedge']);
export const HOMES: ReadonlySet<LotKind> = new Set(FOOTPRINTS);
export const isBuilding = (k: LotKind): k is Footprint => HOMES.has(k);
// Heights: single, double, triple, quad, skyscraper.
export const FLOORS = [1, 2, 3, 4, 12] as const;
export type Floors = (typeof FLOORS)[number];
export const FLOOR_NAME: Record<Floors, string> = { 1: 'single', 2: 'double', 3: 'triple', 4: 'quad', 12: 'skyscraper' };
// How tall a building's walls are, in cells (chosen by eye: a double is
// not twice a single, nor a skyscraper twelve times one). Low buildings get
// a roof on top.
// The tallest building a density holds: what a density unlocks is room for
// taller buildings (low and medium: doubles; dense: triples; high: quads;
// metropolitan: skyscrapers).
export const DENSITY_TALLEST: Record<Density, Floors> = { low: 2, medium: 2, dense: 3, high: 4, metropolitan: 12 };
export const densityAllows = (d: Density, floors: Floors): boolean => floors <= DENSITY_TALLEST[d];
export const WALL_CELLS: Record<Floors, number> = { 1: 0.9, 2: 1.5, 3: 2.25, 4: 3.0, 12: 9.0 };
export const wallHeight = (floors: Floors): number => WALL_CELLS[floors] * CELL;
// Above this many floors a building is a tall block (flat top, no gable roof).
export const isTall = (floors: Floors): boolean => floors > 2;
// A building's front door (tile steps: width, height), on the side facing
// its street; a skyscraper gets a wide lobby entrance, the rest a street door.
export function doorSize(kind: Footprint, floors: Floors): readonly [number, number] {
  const w = FOOTPRINT_CELLS[kind][0] * CELL;
  return floors === 12 ? [Math.min(0.018, 0.4 * w), 0.75 * wallHeight(1)] : [Math.min(0.01, 0.35 * w), 0.6 * wallHeight(1)];
}
// Footprint half extents: along its front, and in depth.
export const LOT_SIZE: Record<LotKind, readonly [number, number]> = {
  ...Object.fromEntries(FOOTPRINTS.map((f) => [f, [FOOTPRINT_CELLS[f][0] * CELL / 2, FOOTPRINT_CELLS[f][1] * CELL / 2] as const])) as Record<Footprint, readonly [number, number]>,
  tree: [0.012, 0.012], bush: [0.008, 0.008], hedge: [0.0135, 0.003], flowerbed: [0.012, 0.006],
  well: [0.008, 0.008], fountain: [0.02, 0.02], statue: [0.006, 0.006], bench: [0.008, 0.004], lamp: [0.003, 0.003],
  stall: [0.011, 0.009], crates: [0.009, 0.008], shed: [0.012, 0.009],
};

export interface Lot {
  readonly x: number; readonly y: number;
  readonly yaw: number;   // the way its front faces (radians)
  readonly kind: LotKind;
  readonly floors?: Floors; // buildings
  readonly spot?: number; // stands on building spot k (gone once a building is there)
}
// A place for a building: its middle, radius (round), and the way it faces.
export interface Spot {
  readonly x: number; readonly y: number; readonly r: number; readonly yaw: number;
  // A rectangle instead of a circle: hw across its front, hd deep (its
  // front faces yaw); r is then the distance to its corners.
  readonly hw?: number; readonly hd?: number;
}
// What the player builds stands on squares of the grid, inside the safe
// zone and clear of each other: building spots (SPOT_CELLS a side: one of
// the tile's buildings, and a house as large until one stands there) and
// the tile's site (SITE_CELLS a side: the city hall on the center, a wonder
// on any other tile; the houses on it give way to them).
export const SPOT_CELLS = 4, SITE_CELLS = 7;
export const SPOT_HOUSE: Footprint = 'b44';
// How tall that house is, by density (a tall one where the density holds it).
export const SPOT_HOUSE_FLOORS: Record<Density, Floors> = { low: 1, medium: 2, dense: 3, high: 4, metropolitan: 4 };
const squareSpot = (cells: number, x: number, y: number, yaw: number): Spot => {
  const h = (cells * CELL) / 2;
  return { x, y, yaw, r: Math.SQRT2 * h, hw: h, hd: h };
};
export const buildingSpot = (x: number, y: number, yaw: number): Spot => squareSpot(SPOT_CELLS, x, y, yaw);
export const siteSpot = (x: number, y: number, yaw: number): Spot => squareSpot(SITE_CELLS, x, y, yaw);
// Building spots a tile has, by its density (and so its building slots:
// density.ts).
export const SPOTS: Record<Density, number> = { low: 1, medium: 2, dense: 2, high: 3, metropolitan: 3 };
export const MAX_SPOTS = 3;
// Whether two spots overlap, each grown by `pad` (separating axes; round
// spots as their bounding squares).
export function spotsOverlap(a: Spot, b: Spot, pad = 0): boolean {
  if (len(sub(a, b)) > a.r + b.r + 2 * pad) return false;
  const box = (s: Spot) => spotCorners(s, pad);
  const ca = box(a), cb = box(b);
  for (const poly of [ca, cb]) {
    for (let i = 0; i < 4; i++) {
      const e = sub(poly[(i + 1) % 4]!, poly[i]!), n = { x: -e.y, y: e.x };
      const pa = ca.map((p) => p.x * n.x + p.y * n.y), pb = cb.map((p) => p.x * n.x + p.y * n.y);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}
export function spotCorners(s: Spot, grow = 0): Pt[] {
  const hw = (s.hw ?? s.r) + grow, hd = (s.hd ?? s.r) + grow;
  const f = { x: Math.cos(s.yaw), y: Math.sin(s.yaw) }, side = { x: -f.y, y: f.x };
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => add(s, add(mul(side, a! * hw), mul(f, b! * hd))));
}
// Whether a lot's footprint reaches into a spot.
export const lotOnSpot = (l: Pick<Lot, 'x' | 'y' | 'yaw' | 'kind'>, s: Spot): boolean =>
  lotsOverlap({ ...l } as Lot, { x: s.x, y: s.y, yaw: s.yaw, kind: 'b22' } as Lot, 0, [s.hw ?? s.r, s.hd ?? s.r]);
// Whether p lies in a spot's footprint, grown by `margin`.
export function inSpot(p: Pt, s: Spot, margin = 0): boolean {
  if (s.hw === undefined || s.hd === undefined) return len(sub(p, s)) < s.r + margin;
  const d = sub(p, s), fx = Math.cos(s.yaw), fy = Math.sin(s.yaw);
  return Math.abs(d.x * -fy + d.y * fx) < s.hw + margin && Math.abs(d.x * fx + d.y * fy) < s.hd + margin;
}
// A spot's outline, a point every `step` or so.
export function spotOutline(s: Spot, step = 0.01): Pt[] {
  if (s.hw === undefined || s.hd === undefined) {
    const n = Math.max(12, Math.ceil((2 * Math.PI * s.r) / step));
    return Array.from({ length: n }, (_, i) => ({ x: s.x + s.r * Math.cos((2 * Math.PI * i) / n), y: s.y + s.r * Math.sin((2 * Math.PI * i) / n) }));
  }
  const fx = Math.cos(s.yaw), fy = Math.sin(s.yaw), at = (a: number, b: number) => ({ x: s.x - fy * a + fx * b, y: s.y + fx * a + fy * b });
  const corners = [at(s.hw, s.hd), at(-s.hw, s.hd), at(-s.hw, -s.hd), at(s.hw, -s.hd)];
  return corners.flatMap((c, i) => { const d = corners[(i + 1) % 4]!, n = Math.max(1, Math.ceil(len(sub(d, c)) / step)); return Array.from({ length: n }, (_, k) => ({ x: c.x + ((d.x - c.x) * k) / n, y: c.y + ((d.y - c.y) * k) / n })); });
}
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
// Whether two footprints overlap (separating axes), each grown by `pad`
// (b at size `bSize` instead of its kind's, if given).
export function lotsOverlap(a: Lot, b: Lot, pad = 0, bSize?: readonly [number, number]): boolean {
  const sb = bSize ?? LOT_SIZE[b.kind];
  const ra = Math.hypot(...LOT_SIZE[a.kind]) + pad, rb = Math.hypot(...sb) + pad;
  if (Math.hypot(a.x - b.x, a.y - b.y) > ra + rb) return false;
  const ca = lotCorners(a, pad / 2), cb = bSize ? spotCorners({ x: b.x, y: b.y, yaw: b.yaw, r: rb, hw: sb[0], hd: sb[1] }, pad / 2) : lotCorners(b, pad / 2);
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
  const furniture = (k: LotKind) => ON_SQUARES.has(k);
  lots.forEach((l, i) => {
    const pts = lotSamples(l);
    if (!pts.every(region)) out.push(`lot ${i} (${l.kind}) outside`);
    for (const s of streets) if (pts.some((p) => distToLine(p, s.pts) < HALF_WIDTH[s.cls])) { out.push(`lot ${i} (${l.kind}) on a street`); break; }
    for (const q of squares) if (q.paved && !furniture(l.kind) && pts.some((p) => pointInPoly(p, q.pts))) out.push(`lot ${i} on a square`);
    spots.forEach((s, k) => {
      if (l.spot === k) { if (!inSpot(l, s)) out.push(`lot ${i} of spot ${k} outside it`); }
      else if (pts.some((p) => inSpot(p, s))) out.push(`lot ${i} on spot ${k}`);
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
