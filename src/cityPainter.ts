// The city painter: what a city's center tile shows, grown from its middle
// rather than drawn by hand. Three kinds of building, each a square of the
// grid (UNIT = half a cell): a building 4 × 4 units (2 × 2 cells), a
// skyscraper 6 × 6 (3 × 3 cells; from the Modern era), a wonder 8 × 8 (4 × 4
// cells). Guarantees (test/cityPainter.test.ts):
//   1. no two buildings touch, not even at a corner: at least 1 unit apart;
//   2. two buildings are joined when their facing sides are exactly 1 unit
//      apart and overlap (side by side, not corner to corner);
//   3. every building is joined, through others, to the first, at the middle;
//   4. every wonder the city has is placed (at most MAX_WONDERS), wholly
//      inside the safe zone; they are placed first, then the skyscrapers
//      as near the middle as they fit, then the other buildings;
//   5. the tallest stand nearest the middle (heights: cityDress.ts);
//   6. roads fill the gap between each joined pair, from the end of one
//      building to the end of the other, and the corners where they meet;
//      painted once (a set of grid squares), never under a building.
// Where the ground allows it (the `free` test: dry land inside the tile),
// as many buildings as asked; fewer if the ground runs out.
//
// Pure: the tile's canonical hex (tile steps, inradius 0.5), a seed, and
// the ground test. Each city turns the grid its own way, so towns differ.

import { mulberry32, type Rng } from './rng.ts';
import { rhoOf, SAFE_RHO, type Pt } from './town/geometry.ts';

// A cell as the city is drawn (lot models' 0.0225 tile steps, drawn 1.3 ×
// larger so a town reads from the board), and the grid's unit: half of it.
export const CITY_CELL = 0.0225 * 1.3;
export const UNIT = CITY_CELL / 2;
export const MAX_WONDERS = 10;
export type Kind = 'building' | 'skyscraper' | 'wonder';
export const SIZE: Record<Kind, number> = { building: 4, skyscraper: 6, wonder: 8 };
// How far out each kind may stand (share of the inradius): wonders inside
// the safe zone, the rest short of the rim.
const REACH: Record<Kind, number> = { wonder: SAFE_RHO, skyscraper: 0.88, building: 0.92 };

// A building: its square on the grid (units, [x0, x1) × [y0, y1)) and its
// middle and front in the tile (front: the way it faces, toward a road).
export interface Painted {
  readonly kind: Kind;
  readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number;
  readonly at: Pt;
  readonly yaw: number;
  readonly order: number;   // 0 at the middle, 1 the farthest: how tall it stands
}
export interface Painting {
  readonly buildings: readonly Painted[];
  readonly roads: readonly (readonly Pt[])[];   // rectangles in the tile, merged from the road squares
  readonly reach: number;                       // the farthest a building reaches from the middle (tile steps)
  // The grid: its middle and axes in the tile (for tests and tools).
  readonly origin: Pt; readonly u: Pt; readonly v: Pt;
}
export interface PaintInput {
  readonly wonders: number;
  readonly skyscrapers: number;
  readonly buildings: number;
  readonly seed: number;
  // Whether a point of the tile may be built on (dry land); the painter
  // adds the reach of each kind.
  readonly free: (p: Pt) => boolean;
  // How far out (share of the inradius) anything may stand: a walled city
  // keeps inside its walls.
  readonly limit?: number;
}

// How much a building lined up with its neighbours is passed over.
const STAGGER = 0.01;
// The grid spans the tile: units from -H to H on each axis.
const H = Math.ceil(0.62 / UNIT);
const N = 2 * H;

export function paintCity(inp: PaintInput): Painting {
  const rand = mulberry32(inp.seed);
  const turn = rand() * (Math.PI / 2);
  const u = { x: Math.cos(turn), y: Math.sin(turn) }, v = { x: -u.y, y: u.x };
  const origin = { x: (rand() - 0.5) * UNIT, y: (rand() - 0.5) * UNIT };
  const toTile = (x: number, y: number): Pt => ({ x: origin.x + (x * u.x + y * v.x) * UNIT, y: origin.y + (x * u.y + y * v.y) * UNIT });
  const limit = inp.limit ?? 1;

  // Which grid squares each kind may cover (its square's middle in reach and free).
  const ok: Record<Kind, Uint8Array> = { wonder: new Uint8Array(N * N), skyscraper: new Uint8Array(N * N), building: new Uint8Array(N * N) };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = toTile(i - H + 0.5, j - H + 0.5), r = rhoOf(6, c), f = inp.free(c);
    for (const k of ['wonder', 'skyscraper', 'building'] as const) ok[k][j * N + i] = f && r <= Math.min(REACH[k], limit) ? 1 : 0;
  }
  // Sums over the grid, to ask whether a square is all allowed, or all clear, at once.
  const sums = (a: Uint8Array) => {
    const s = new Int32Array((N + 1) * (N + 1));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) s[(j + 1) * (N + 1) + i + 1] = a[j * N + i]! + s[j * (N + 1) + i + 1]! + s[(j + 1) * (N + 1) + i]! - s[j * (N + 1) + i]!;
    return s;
  };
  const area = (s: Int32Array, x0: number, y0: number, x1: number, y1: number) => {
    const a = Math.max(0, x0 + H), b = Math.max(0, y0 + H), c = Math.min(N, x1 + H), d = Math.min(N, y1 + H);
    if (c <= a || d <= b) return 0;
    return s[d * (N + 1) + c]! - s[b * (N + 1) + c]! - s[d * (N + 1) + a]! + s[b * (N + 1) + a]!;
  };
  const allowed = Object.fromEntries((['wonder', 'skyscraper', 'building'] as const).map((k) => [k, sums(ok[k])])) as Record<Kind, Int32Array>;
  const fits = (k: Kind, x0: number, y0: number) => {
    const n = SIZE[k];
    return x0 >= -H && y0 >= -H && x0 + n <= H && y0 + n <= H && area(allowed[k], x0, y0, x0 + n, y0 + n) === n * n;
  };

  // Taken: every building's square grown by 1 (nothing may stand there: guarantee 1).
  const taken = new Uint8Array(N * N);
  let takenSums = sums(taken);
  const placed: { kind: Kind; x0: number; y0: number; n: number }[] = [];
  const clear = (x0: number, y0: number, n: number) => area(takenSums, x0, y0, x0 + n, y0 + n) === 0;
  const take = (x0: number, y0: number, n: number) => {
    for (let j = y0 - 1; j < y0 + n + 1; j++) for (let i = x0 - 1; i < x0 + n + 1; i++) if (i >= -H && j >= -H && i < H && j < H) taken[(j + H) * N + i + H] = 1;
    takenSums = sums(taken);
  };
  // How many placed buildings a square at (x0, y0) of side n joins (guarantee 2).
  const joins = (x0: number, y0: number, n: number) => placed.reduce((a, p) => a + (joined(x0, y0, x0 + n, y0 + n, p.x0, p.y0, p.x0 + p.n, p.y0 + p.n) ? 1 : 0), 0);

  // Where a square of side n may go: beside a placed building, 1 unit
  // away on one of its sides, overlapping it along that side by at least
  // a unit; aligned with it (a row) or slid along it (a lane that jogs).
  const candidates = (n: number): [number, number][] => {
    const out: [number, number][] = [];
    for (const p of placed) {
      for (let s = -(n - 1); s <= p.n - 1; s++) {
        out.push([p.x0 + p.n + 1, p.y0 + s], [p.x0 - 1 - n, p.y0 + s], [p.x0 + s, p.y0 + p.n + 1], [p.x0 + s, p.y0 - 1 - n]);
      }
    }
    return out;
  };
  const place = (k: Kind, centre: number, r: Rng): boolean => {
    const n = SIZE[k];
    let best: [number, number] | null = null, bs = -Infinity;
    const pool: [number, number][] = placed.length ? candidates(n) : (() => {
      // The first: as near the middle as it fits.
      const out: [number, number][] = [];
      for (let y = -H; y + n <= H; y++) for (let x = -H; x + n <= H; x++) out.push([x, y]);
      return out;
    })();
    for (const [x0, y0] of pool) {
      if (!fits(k, x0, y0) || !clear(x0, y0, n)) continue;
      const cx = x0 + n / 2, cy = y0 + n / 2, d = Math.hypot(cx, cy) * UNIT;
      // Near the middle (the skyscrapers most), joining more neighbours (the
      // town fills in), and staggered against the ones beside it rather
      // than squared up in rows (a grown town, not a grid).
      const aligned = placed.some((p) => p.x0 === x0 || p.y0 === y0 || p.x0 + p.n === x0 + n || p.y0 + p.n === y0 + n) ? 1 : 0;
      const sc = -centre * d + 0.012 * joins(x0, y0, n) - STAGGER * aligned + 0.03 * r();
      if (sc > bs) { bs = sc; best = [x0, y0]; }
    }
    if (!best) return false;
    placed.push({ kind: k, x0: best[0], y0: best[1], n });
    take(best[0], best[1], n);
    return true;
  };
  const wonders = Math.min(MAX_WONDERS, inp.wonders);
  for (let i = 0; i < wonders; i++) place('wonder', 1, rand);
  for (let i = 0; i < inp.skyscrapers; i++) if (!place('skyscraper', 3, rand)) break;
  for (let i = 0; i < inp.buildings; i++) if (!place('building', 1, rand)) break;

  // Roads: the gap between each joined pair (guarantee 6), as grid squares.
  const road = new Uint8Array(N * N);
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) if (i >= -H && j >= -H && i < H && j < H) road[(j + H) * N + i + H] = 1;
  };
  for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
    const p = placed[a]!, q = placed[b]!;
    const strip = gapBetween(p.x0, p.y0, p.x0 + p.n, p.y0 + p.n, q.x0, q.y0, q.x0 + q.n, q.y0 + q.n);
    if (strip) mark(...strip);
  }
  // The corners where roads meet (a road on one side across and one along).
  const inBuilding = new Uint8Array(N * N);
  for (const p of placed) for (let j = p.y0; j < p.y0 + p.n; j++) for (let i = p.x0; i < p.x0 + p.n; i++) inBuilding[(j + H) * N + i + H] = 1;
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < N && j < N ? road[j * N + i]! : 0);
  const corners: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (road[j * N + i] || inBuilding[j * N + i]) continue;
    if ((at(i - 1, j) || at(i + 1, j)) && (at(i, j - 1) || at(i, j + 1))) corners.push(j * N + i);
  }
  for (const k of corners) road[k] = 1;
  // Merged into rectangles: runs along each row, then runs of equal rows.
  const roads: Pt[][] = [];
  const done = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!road[j * N + i] || done[j * N + i]) continue;
    let w = 1;
    while (i + w < N && road[j * N + i + w] && !done[j * N + i + w]) w++;
    let h = 1;
    grow: for (; j + h < N; h++) for (let x = i; x < i + w; x++) if (!road[(j + h) * N + x] || done[(j + h) * N + x]) break grow;
    for (let y = j; y < j + h; y++) for (let x = i; x < i + w; x++) done[y * N + x] = 1;
    const x0 = i - H, y0 = j - H, x1 = x0 + w, y1 = y0 + h;
    roads.push([toTile(x0, y0), toTile(x1, y0), toTile(x1, y1), toTile(x0, y1)]);
  }

  // Each building faces the joined neighbour nearest the middle (its road
  // there), or out; its order: how far it stands from the middle, ranked.
  const middle = (p: { x0: number; y0: number; n: number }) => ({ x: p.x0 + p.n / 2, y: p.y0 + p.n / 2 });
  const ranked = [...placed].sort((a, b) => Math.hypot(middle(a).x, middle(a).y) - Math.hypot(middle(b).x, middle(b).y));
  const buildings: Painted[] = placed.map((p) => {
    const m = middle(p);
    let face: { x: number; y: number } | null = null, fd = Infinity;
    for (const q of placed) {
      if (q === p || !joined(p.x0, p.y0, p.x0 + p.n, p.y0 + p.n, q.x0, q.y0, q.x0 + q.n, q.y0 + q.n)) continue;
      const mq = middle(q), d = Math.hypot(mq.x, mq.y);
      if (d < fd) { fd = d; face = { x: Math.abs(mq.x - m.x) > Math.abs(mq.y - m.y) ? Math.sign(mq.x - m.x) : 0, y: Math.abs(mq.x - m.x) > Math.abs(mq.y - m.y) ? 0 : Math.sign(mq.y - m.y) }; }
    }
    face ??= Math.abs(m.x) > Math.abs(m.y) ? { x: Math.sign(m.x) || 1, y: 0 } : { x: 0, y: Math.sign(m.y) || 1 };
    const dir = { x: face.x * u.x + face.y * v.x, y: face.x * u.y + face.y * v.y };
    return {
      kind: p.kind, x0: p.x0, y0: p.y0, x1: p.x0 + p.n, y1: p.y0 + p.n,
      at: toTile(m.x, m.y), yaw: Math.atan2(dir.y, dir.x),
      order: placed.length > 1 ? ranked.indexOf(p) / (placed.length - 1) : 0,
    };
  });
  const reach = placed.reduce((a, p) => Math.max(a, ...[[p.x0, p.y0], [p.x0 + p.n, p.y0], [p.x0, p.y0 + p.n], [p.x0 + p.n, p.y0 + p.n]].map(([x, y]) => Math.hypot(toTile(x!, y!).x, toTile(x!, y!).y))), 0);
  return { buildings, roads, reach, origin, u, v };
}

// Whether two squares are joined: facing sides exactly 1 unit apart,
// overlapping along them.
export function joined(ax0: number, ay0: number, ax1: number, ay1: number, bx0: number, by0: number, bx1: number, by1: number): boolean {
  return gapBetween(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) !== null;
}
// The road between two joined squares: the 1-unit gap between their facing
// sides, from the end of one to the end of the other ([x0, y0, x1, y1],
// units), or null if they are not joined.
export function gapBetween(ax0: number, ay0: number, ax1: number, ay1: number, bx0: number, by0: number, bx1: number, by1: number): [number, number, number, number] | null {
  const overX = Math.min(ax1, bx1) - Math.max(ax0, bx0), overY = Math.min(ay1, by1) - Math.max(ay0, by0);
  if (overY > 0 && (bx0 - ax1 === 1 || ax0 - bx1 === 1)) {
    const x0 = bx0 - ax1 === 1 ? ax1 : bx1;
    return [x0, Math.min(ay0, by0), x0 + 1, Math.max(ay1, by1)];
  }
  if (overX > 0 && (by0 - ay1 === 1 || ay0 - by1 === 1)) {
    const y0 = by0 - ay1 === 1 ? ay1 : by1;
    return [Math.min(ax0, bx0), y0, Math.max(ax1, bx1), y0 + 1];
  }
  return null;
}
