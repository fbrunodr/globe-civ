// The city painter: what a city's center tile shows, grown from its middle
// rather than drawn by hand. Three kinds of building, each a rectangle of
// the grid (UNIT = a quarter of a cell; SIZES): a building 8 × 8, 8 × 10
// or 10 × 10 units, a skyscraper 12 × 12 or 10 × 12 (from the Modern era),
// a wonder 14 × 14 to 16 × 16. Guarantees (test/cityPainter.test.ts):
//   1. no two buildings touch, not even at a corner: at least 1 unit apart;
//   2. two buildings are joined when their facing sides are exactly 1 unit
//      apart and overlap (side by side, not corner to corner);
//   3. every building is joined, through others, to the first, which stands
//      as near the middle as it fits in the largest stretch of dry land
//      (where water cuts the tile in pieces, the city keeps to one);
//   4. every wonder the city has is placed (at most MAX_WONDERS), wholly
//      inside the safe zone. The order they go up is drawn, the wonders
//      and skyscrapers favoured (WEIGHT), so they mostly stand near the
//      middle, but not always, and houses mix in among them;
//   5. the tallest stand nearest the middle (heights: cityDress.ts);
//   6. roads fill the gap between each joined pair, from the end of one
//      building to the end of the other, the corners where they meet, and
//      every gap inside the town (on dry ground); painted once (a set of
//      grid squares), never under a building.
// Where the ground allows it (the `free` test: dry land inside the tile,
// with a margin round every building), as many buildings as asked; fewer
// if the ground runs out.
//
// Pure: the tile's canonical hex (tile steps, inradius 0.5), a seed, and
// the ground test. Each city turns the grid its own way, so towns differ.

import { mulberry32, type Rng } from './rng.ts';
import { rhoOf, SAFE_RHO, type Pt } from './town/geometry.ts';

// A cell as the city is drawn (lot models' 0.0225 tile steps, drawn 1.3 ×
// larger so a town reads from the board), and the grid's unit: half of it.
export const CITY_CELL = 0.0225 * 1.3;
// (A quarter of a cell: the streets, a unit wide, as narrow as a quarter cell.)
export const UNITS_PER_CELL = 4;
export const UNIT = CITY_CELL / UNITS_PER_CELL;
export const MAX_WONDERS = 10;
export type Kind = 'building' | 'skyscraper' | 'wonder';
// Each kind's rectangles (units, either way round), the first most often.
export const SIZES: Record<Kind, readonly (readonly [number, number])[]> = {
  building: [[8, 8], [8, 10], [10, 8], [10, 10]],
  skyscraper: [[12, 12], [10, 12], [12, 10]],
  wonder: [[16, 16], [14, 16], [16, 14], [14, 14]],
};
// How far out each kind may stand (share of the inradius): wonders inside
// the safe zone, the rest short of the rim.
const REACH: Record<Kind, number> = { wonder: SAFE_RHO, skyscraper: 0.88, building: 0.92 };

// A building: its rectangle on the grid (units, [x0, x1) × [y0, y1)) and
// its middle and front in the tile (front: the way it faces, toward a road;
// `front` its width along that side, `depth` back from it, units).
export interface Painted {
  readonly kind: Kind;
  readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number;
  readonly at: Pt;
  readonly yaw: number;
  readonly front: number; readonly depth: number;
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

// How strongly each kind is drawn to go up next (per one left of it), and
// pulled toward the middle where it goes (paintCity).
const KINDS = ['wonder', 'skyscraper', 'building'] as const;
const WEIGHT: Record<Kind, number> = { wonder: 5, skyscraper: 2, building: 1 };
const PULL: Record<Kind, number> = { wonder: 1, skyscraper: 3, building: 1 };
// Gaps in a town this narrow or less (units, each side) are paved over.
const CLOSE = 2;
// Dry ground kept round every building (units).
const MARGIN = Math.ceil(0.013 / UNIT);
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

  // Which grid squares each kind may cover: its middle in reach, and free
  // with the squares round it (a margin of dry ground round every building,
  // MARGIN units, more than cityProps.ts WATER_GAP).
  const free = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) free[j * N + i] = inp.free(toTile(i - H + 0.5, j - H + 0.5)) ? 1 : 0;
  const dry = (i: number, j: number) => {
    for (let dj = -MARGIN; dj <= MARGIN; dj++) for (let di = -MARGIN; di <= MARGIN; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < N && b < N && !free[b * N + a]) return false;
    }
    return true;
  };
  const ok: Record<Kind, Uint8Array> = { wonder: new Uint8Array(N * N), skyscraper: new Uint8Array(N * N), building: new Uint8Array(N * N) };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const r = rhoOf(6, toTile(i - H + 0.5, j - H + 0.5)), f = dry(i, j);
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
  // (Wonders by their very corners too: the squares are tested at their
  // middles, and a wonder must lie wholly inside the safe zone.)
  const inside = (x0: number, y0: number, w: number, h: number) =>
    [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]].every(([x, y]) => rhoOf(6, toTile(x!, y!)) <= Math.min(REACH.wonder, limit));
  const fits = (k: Kind, x0: number, y0: number, w: number, h: number) =>
    x0 >= -H && y0 >= -H && x0 + w <= H && y0 + h <= H && area(allowed[k], x0, y0, x0 + w, y0 + h) === w * h
    && (k !== 'wonder' || inside(x0, y0, w, h));
  // The stretches of dry land (4-connected squares where a building may
  // stand); the city keeps to the largest.
  const piece = new Int32Array(N * N).fill(-1);
  let largest = -1, largestSize = 0;
  for (let st = 0, label = 0; st < N * N; st++) {
    if (!ok.building[st] || piece[st] >= 0) continue;
    const stack = [st];
    piece[st] = label;
    let size = 0;
    while (stack.length) {
      const q = stack.pop()!, qi = q % N, qj = (q - qi) / N;
      size++;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = qi + di, nj = qj + dj, nq = nj * N + ni;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N || !ok.building[nq] || piece[nq] >= 0) continue;
        piece[nq] = label;
        stack.push(nq);
      }
    }
    if (size > largestSize) { largestSize = size; largest = label; }
    label++;
  }
  const inLargest = (x0: number, y0: number) => piece[(y0 + H) * N + x0 + H] === largest;

  // Taken: every building's square grown by 1 (nothing may stand there: guarantee 1).
  let taken = new Uint8Array(N * N);
  let takenSums = sums(taken);
  let placed: { kind: Kind; x0: number; y0: number; w: number; h: number }[] = [];
  const clear = (x0: number, y0: number, w: number, h: number) => area(takenSums, x0, y0, x0 + w, y0 + h) === 0;
  const take = (x0: number, y0: number, w: number, h: number) => {
    for (let j = y0 - 1; j < y0 + h + 1; j++) for (let i = x0 - 1; i < x0 + w + 1; i++) if (i >= -H && j >= -H && i < H && j < H) taken[(j + H) * N + i + H] = 1;
    takenSums = sums(taken);
  };
  // How many placed buildings a rectangle joins (guarantee 2).
  const joins = (x0: number, y0: number, w: number, h: number) => placed.reduce((a, p) => a + (joined(x0, y0, x0 + w, y0 + h, p.x0, p.y0, p.x0 + p.w, p.y0 + p.h) ? 1 : 0), 0);

  // Where a w × h rectangle may go: beside a placed building, 1 unit away
  // on one of its sides, overlapping it along that side by at least a
  // unit; aligned with it (a row) or slid along it (a lane that jogs).
  const candidates = (w: number, h: number): [number, number][] => {
    const out: [number, number][] = [];
    for (const p of placed) {
      for (let s = -(h - 1); s <= p.h - 1; s++) out.push([p.x0 + p.w + 1, p.y0 + s], [p.x0 - 1 - w, p.y0 + s]);
      for (let s = -(w - 1); s <= p.w - 1; s++) out.push([p.x0 + s, p.y0 + p.h + 1], [p.x0 + s, p.y0 - 1 - h]);
    }
    return out;
  };
  const place = (k: Kind, centre: number, r: Rng): boolean => {
    // (A size drawn for it, the first of the kind's most often; another if that one finds no room.)
    const sizes = SIZES[k], first = r() < 0.4 ? 0 : 1 + Math.floor(r() * (sizes.length - 1));
    for (const [w, h] of [sizes[first]!, ...sizes.filter((_, i) => i !== first)]) {
      let best: [number, number] | null = null, bs = -Infinity;
      const pool: [number, number][] = placed.length ? candidates(w, h) : (() => {
        // The first: as near the middle as it fits, in the largest stretch of land.
        const out: [number, number][] = [];
        for (let y = -H; y + h <= H; y++) for (let x = -H; x + w <= H; x++) if (inLargest(x, y)) out.push([x, y]);
        return out;
      })();
      for (const [x0, y0] of pool) {
        if (!fits(k, x0, y0, w, h) || !clear(x0, y0, w, h)) continue;
        const cx = x0 + w / 2, cy = y0 + h / 2, d = Math.hypot(cx, cy) * UNIT;
        // Near the middle (the skyscrapers most), joining more neighbours (the
        // town fills in), and staggered against the ones beside it rather
        // than squared up in rows (a grown town, not a grid).
        const aligned = placed.some((p) => p.x0 === x0 || p.y0 === y0 || p.x0 + p.w === x0 + w || p.y0 + p.h === y0 + h) ? 1 : 0;
        const sc = -centre * d + 0.012 * joins(x0, y0, w, h) - STAGGER * aligned + 0.03 * r();
        if (sc > bs) { bs = sc; best = [x0, y0]; }
      }
      if (!best) continue;
      placed.push({ kind: k, x0: best[0], y0: best[1], w, h });
      take(best[0], best[1], w, h);
      return true;
    }
    return false;
  };
  // The order they go up: each next one drawn by how many of its kind are
  // left times the kind's WEIGHT, so wonders and skyscrapers mostly come
  // early (near the middle) but houses mix in among them. A kind that finds
  // no more room stops there. A wonder must find room (guarantee 4): should
  // one drawn late find none, the city is drawn again with its wonders
  // first.
  const build = (wondersFirst: boolean): boolean => {
    const r = mulberry32(inp.seed ^ 0x9e3779b9);
    placed = [];
    taken = new Uint8Array(N * N);
    takenSums = sums(taken);
    const left: Record<Kind, number> = { wonder: Math.min(MAX_WONDERS, inp.wonders), skyscraper: inp.skyscrapers, building: inp.buildings };
    if (wondersFirst) for (; left.wonder > 0; left.wonder--) if (!place('wonder', PULL.wonder, r)) return false;
    for (;;) {
      const total = KINDS.reduce((a, k) => a + left[k] * WEIGHT[k], 0);
      if (total <= 0) return true;
      let pick = r() * total, k: Kind = 'building';
      for (const kk of KINDS) { pick -= left[kk] * WEIGHT[kk]; if (pick < 0) { k = kk; break; } }
      if (place(k, PULL[k], r)) left[k]--;
      else if (k === 'wonder') return false;
      else left[k] = 0;
    }
  };
  if (!build(false)) build(true);

  // Roads: the gap between each joined pair (guarantee 6), as grid squares.
  const road = new Uint8Array(N * N);
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) if (i >= -H && j >= -H && i < H && j < H) road[(j + H) * N + i + H] = 1;
  };
  for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
    const p = placed[a]!, q = placed[b]!;
    const strip = gapBetween(p.x0, p.y0, p.x0 + p.w, p.y0 + p.h, q.x0, q.y0, q.x0 + q.w, q.y0 + q.h);
    if (strip) mark(...strip);
  }
  // The corners where roads meet (a road on one side across and one along).
  const inBuilding = new Uint8Array(N * N);
  for (const p of placed) for (let j = p.y0; j < p.y0 + p.h; j++) for (let i = p.x0; i < p.x0 + p.w; i++) inBuilding[(j + H) * N + i + H] = 1;
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < N && j < N ? road[j * N + i]! : 0);
  const corners: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (road[j * N + i] || inBuilding[j * N + i]) continue;
    if ((at(i - 1, j) || at(i + 1, j)) && (at(i, j - 1) || at(i, j + 1))) corners.push(j * N + i);
  }
  for (const k of corners) road[k] = 1;
  // Everything inside painted too, so the town has no gaps: the buildings
  // and roads closed (grown by CLOSE squares, then shrunk back: narrow gaps
  // between them fill, the town's outline stays), and the holes enclosed
  // within; never on water.
  const grow = (a: Uint8Array, on: 0 | 1): Uint8Array => {
    const out = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let hit = false;
      for (let dj = -CLOSE; dj <= CLOSE && !hit; dj++) for (let di = -CLOSE; di <= CLOSE; di++) {
        const x = i + di, y = j + dj, v = x >= 0 && y >= 0 && x < N && y < N ? a[y * N + x]! : 0;
        if (v === on) { hit = true; break; }
      }
      out[j * N + i] = (on ? hit : !hit) ? 1 : 0;
    }
    return out;
  };
  const town = new Uint8Array(N * N);
  for (let q = 0; q < N * N; q++) town[q] = road[q] || inBuilding[q] ? 1 : 0;
  const closed = grow(grow(town, 1), 0);
  const outside = new Uint8Array(N * N), stack: number[] = [];
  for (let q = 0; q < N; q++) for (const k of [q, (N - 1) * N + q, q * N, q * N + N - 1]) if (!closed[k] && !outside[k]) { outside[k] = 1; stack.push(k); }
  while (stack.length) {
    const q = stack.pop()!, qi = q % N, qj = (q - qi) / N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = qi + di, nj = qj + dj, nq = nj * N + ni;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N || closed[nq] || outside[nq]) continue;
      outside[nq] = 1;
      stack.push(nq);
    }
  }
  for (let q = 0; q < N * N; q++) if (!outside[q] && !inBuilding[q] && free[q]) road[q] = 1;
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
  const middle = (p: { x0: number; y0: number; w: number; h: number }) => ({ x: p.x0 + p.w / 2, y: p.y0 + p.h / 2 });
  const ranked = [...placed].sort((a, b) => Math.hypot(middle(a).x, middle(a).y) - Math.hypot(middle(b).x, middle(b).y));
  const buildings: Painted[] = placed.map((p) => {
    const m = middle(p);
    let face: { x: number; y: number } | null = null, fd = Infinity;
    for (const q of placed) {
      if (q === p || !joined(p.x0, p.y0, p.x0 + p.w, p.y0 + p.h, q.x0, q.y0, q.x0 + q.w, q.y0 + q.h)) continue;
      const mq = middle(q), d = Math.hypot(mq.x, mq.y);
      if (d < fd) { fd = d; face = { x: Math.abs(mq.x - m.x) > Math.abs(mq.y - m.y) ? Math.sign(mq.x - m.x) : 0, y: Math.abs(mq.x - m.x) > Math.abs(mq.y - m.y) ? 0 : Math.sign(mq.y - m.y) }; }
    }
    face ??= Math.abs(m.x) > Math.abs(m.y) ? { x: Math.sign(m.x) || 1, y: 0 } : { x: 0, y: Math.sign(m.y) || 1 };
    const dir = { x: face.x * u.x + face.y * v.x, y: face.x * u.y + face.y * v.y };
    return {
      kind: p.kind, x0: p.x0, y0: p.y0, x1: p.x0 + p.w, y1: p.y0 + p.h,
      at: toTile(m.x, m.y), yaw: Math.atan2(dir.y, dir.x),
      front: face.x ? p.h : p.w, depth: face.x ? p.w : p.h,
      order: placed.length > 1 ? ranked.indexOf(p) / (placed.length - 1) : 0,
    };
  });
  const reach = placed.reduce((a, p) => Math.max(a, ...[[p.x0, p.y0], [p.x0 + p.w, p.y0], [p.x0, p.y0 + p.h], [p.x0 + p.w, p.y0 + p.h]].map(([x, y]) => Math.hypot(toTile(x!, y!).x, toTile(x!, y!).y))), 0);
  return { buildings, roads, reach, origin, u, v };
}

// Whether two rectangles are joined: facing sides exactly 1 unit apart,
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
