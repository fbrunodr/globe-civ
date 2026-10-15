// Drafts of the town drawings, one per edge class (edges.ts) and role:
// the street skeleton, squares, the hall or wonder, and the building spots.
// A draft is a pure function of its class, role and variant; hand-corrected
// drawings (the editor) take its place.
//
// Streets are laid like a street plan grows, not like spokes: first a
// through street between the two most opposite sides that have streets,
// then every other stub's
// street runs in and meets the nearest street at a T, then lanes reach into
// any ground left far from a street. Every street leaves its stub straight
// in, square to the side, so it carries on smoothly from the neighbor's.

import { mulberry32, type Rng } from '../rng.ts';
import {
  HALF_WIDTH, add, sub, mul, len, lerp, distToLine, linesMeet, nearestOn, pointInPoly, rhoOf,
  type Density, type Pt, type Spot, type Square, type StreetClass,
} from './geometry.ts';
import { parseKey, stubsOf, type EdgeValue, type Stub } from './edges.ts';

export type Role = 'block' | 'center' | 'wonder';
export const ROLES: readonly Role[] = ['block', 'center', 'wonder'];
export type Rank = 'main' | 'side' | 'lane';

// Street widths by rank and density; a stub's street is as wide as its
// edge's rank (one street: main, two: side).
export const RANK_CLASS: Record<Density, Record<Rank, StreetClass>> = {
  low: { main: 'street', side: 'lane', lane: 'lane' },
  medium: { main: 'main', side: 'street', lane: 'lane' },
  high: { main: 'avenue', side: 'main', lane: 'street' },
  metropolitan: { main: 'avenue', side: 'avenue', lane: 'main' },
};
// The city hall grows with its tile's density (a quad's height and more
// ground at high density and above; cityProps.ts, flatTown.ts scale it).
export const HALL_RADIUS: Record<Density, number> = { low: 0.045, medium: 0.045, high: 0.062, metropolitan: 0.075 };
export const HALL_TALL: Record<Density, number> = { low: 1, medium: 1, high: 1.8, metropolitan: 2.4 };
export const rankOfValue = (v: EdgeValue): Rank => (v === 1 ? 'main' : 'side');
const DENSITY_ORDER: Record<Density, number> = { low: 0, medium: 1, high: 2, metropolitan: 3 };
// The width where an edge's streets cross it: by the denser of its two tiles,
// so both tiles agree.
export function edgeClass(v: EdgeValue, a: Density, b: Density): StreetClass {
  return RANK_CLASS[DENSITY_ORDER[a] >= DENSITY_ORDER[b] ? a : b][rankOfValue(v)];
}
// A street's width blends from its edge's width at the stub to its own
// over this far in (tile steps).
export const EDGE_BLEND = 0.12;

export interface SkelStreet {
  readonly pts: readonly Pt[];
  readonly rank: Rank;
  readonly ends: readonly [number | null, number | null]; // the stubs (indices) its ends are at
}
export interface Skeleton {
  readonly key: string;
  readonly role: Role;
  readonly stubs: readonly Stub[];
  readonly streets: readonly SkelStreet[];
  readonly squares: readonly Square[];
  readonly spots: readonly Spot[]; // building slots
  readonly hall: Spot | null;
  readonly wonder: Spot | null;
}

// ---------- limits (tile steps; the hex's inradius is 0.5) ----------

export const LEAD = 0.07; // a stub's street runs straight in this far
const INNER = 0.88;      // streets stay within this share of the inradius (but at their stubs)
const FAR = 0.17;        // ground farther than this from every street gets a lane
const SPOT_R = 0.062;    // building spots
const HALL_R = 0.075; // (room for the largest hall, HALL_RADIUS)
const WONDER_R = 0.16;
const WIDEST = HALF_WIDTH.avenue;

const hashStr = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const norm = (p: Pt): Pt => { const l = len(p); return l > 1e-12 ? mul(p, 1 / l) : { x: 1, y: 0 }; };
const perp = (p: Pt): Pt => ({ x: -p.y, y: p.x });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

// A cubic from p0 heading t0 to p1 arriving heading t1.
function bezier(p0: Pt, t0: Pt, p1: Pt, t1: Pt, bend: Pt = { x: 0, y: 0 }, n = 18): Pt[] {
  const d = len(sub(p1, p0)), h = 0.38 * d;
  const c0 = add(add(p0, mul(t0, h)), bend), c1 = add(sub(p1, mul(t1, h)), bend);
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * p1.y,
    });
  }
  return out;
}

// Where segment ab first crosses segment cd (as a share of ab), or null.
function crossAt(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const r = sub(b, a), s = sub(d, c), den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t > 1e-9 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

// The nearest point of the network to p, and the direction of its street there.
function nearestStreet(streets: readonly SkelStreet[], p: Pt, skip = -1): { q: Pt; along: Pt; s: number } | null {
  let best: { q: Pt; along: Pt; s: number } | null = null, bd = Infinity;
  streets.forEach((st, si) => {
    if (si === skip) return;
    const pts = st.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!, ab = sub(b, a), l2 = dot(ab, ab);
      const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
      const q = lerp(a, b, t), d = len(sub(p, q));
      if (d < bd) { bd = d; best = { q, along: norm(ab), s: si }; }
    }
  });
  return best;
}

class Plan {
  readonly streets: SkelStreet[] = [];
  constructor(readonly stubs: readonly Stub[], readonly rand: Rng) {}

  // Returns false if it was cut short.
  add(pts: Pt[], rank: Rank, ends: [number | null, number | null]): boolean {
    // A street stops where it first runs into another (a junction there).
    // (The first stretch is exempt: it starts on a street or a stub.)
    for (let i = 2; i + 1 < pts.length; i++) {
      for (const st of this.streets) {
        for (let k = 0; k + 1 < st.pts.length; k++) {
          const t = crossAt(pts[i]!, pts[i + 1]!, st.pts[k]!, st.pts[k + 1]!);
          if (t === null) continue;
          this.streets.push({ pts: [...pts.slice(0, i + 1), lerp(pts[i]!, pts[i + 1]!, t)], rank, ends: [ends[0], null] });
          return false;
        }
      }
    }
    this.streets.push({ pts, rank, ends });
    return true;
  }

  // From stub i: straight in, then on to `to` arriving heading `arrive`.
  fromStub(i: number, to: Pt, arrive: Pt, rank: Rank, endStub: number | null = null, bendAmt = 0): boolean {
    const s = this.stubs[i]!;
    const lead = add(s.p, mul(s.into, LEAD));
    const endLead = endStub === null ? null : add(this.stubs[endStub]!.p, mul(this.stubs[endStub]!.into, LEAD));
    const target = endLead ?? to;
    const bend = mul(perp(norm(sub(target, lead))), bendAmt);
    const body = bezier(lead, s.into, target, arrive, bend);
    const pts = [s.p, ...body, ...(endLead ? [this.stubs[endStub!]!.p] : [])];
    return this.add(pts, rank, [i, endStub]);
  }

  // A stub's street running in to meet the nearest street at a T.
  join(i: number): void {
    const s = this.stubs[i]!;
    const lead = add(s.p, mul(s.into, LEAD));
    const ahead = add(lead, mul(s.into, 0.12));
    const near = nearestStreet(this.streets, ahead);
    if (!near) return;
    let n = perp(near.along);
    if (dot(sub(near.q, lead), n) < 0) n = mul(n, -1);
    this.fromStub(i, near.q, n, rankOfValue(s.value));
  }
}

// ---------- the draft ----------

export function draftSkeleton(key: string, role: Role, variant = 0): Skeleton {
  const colouring = parseKey(key);
  const stubs = stubsOf(colouring);
  const rand = mulberry32(hashStr(`${key}|${role}|${variant}`));
  const plan = new Plan(stubs, rand);
  const squares: Square[] = [];
  let hall: Spot | null = null, wonder: Spot | null = null;

  if (role === 'wonder') {
    // A ring street round the wonder's green; every stub's street runs in to it.
    const R = 0.21;
    plan.streets.push({ pts: ring({ x: 0, y: 0 }, R, 36), rank: 'side', ends: [null, null] });
    squares.push({ pts: ring({ x: 0, y: 0 }, R - 0.02, 24).slice(0, -1), paved: false });
    wonder = { x: 0, y: 0, r: WONDER_R, yaw: 0 };
    stubs.forEach((s, i) => {
      const q = mul(norm(add(s.p, mul(s.into, LEAD))), R);
      plan.fromStub(i, q, mul(norm(q), -1), rankOfValue(s.value));
    });
  } else {
    layStreets(plan, colouring);
    connect(plan);
  }
  if (plan.streets.length === 0 || role === 'center' && stubs.length === 0) {
    // No street comes in: a loop round the middle (a village green, or the square).
    const c = { x: (rand() - 0.5) * 0.04, y: (rand() - 0.5) * 0.04 };
    plan.streets.push({ pts: ring(c, 0.17 + 0.03 * rand(), 30, 0.12, rand), rank: 'side', ends: [null, null] });
  }
  if (role !== 'wonder') infill(plan, wonder);
  // (The hall after the lanes, so none runs through it.)
  if (role === 'center') {
    const c = centerSquare(plan.streets);
    squares.push(c.square);
    hall = c.hall;
  }
  const spots = role === 'wonder' ? [] : placeSpots(plan.streets, squares, hall, rand);
  return { key, role, stubs, streets: plan.streets, squares, spots, hall, wonder };
}

// Through streets, then T junctions.
function layStreets(plan: Plan, c: readonly EdgeValue[]): void {
  const stubs = plan.stubs, rand = plan.rand;
  if (stubs.length === 0) return;
  const sides = [...new Set(stubs.map((s) => s.side))];
  const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 6 - Math.abs(a - b));
  const done = new Set<number>();
  if (sides.length === 1) {
    // One side only: in past the middle, then a cross street (or a loop between two stubs).
    const j = sides[0]!, mine = stubs.map((_, i) => i).filter((i) => stubs[i]!.side === j);
    const into = stubs[mine[0]!]!.into, across = perp(into);
    if (mine.length === 1) {
      const end = mul(into, -0.02 - 0.08 * rand());
      plan.fromStub(mine[0]!, end, into, 'main');
      const w = 0.2 + 0.06 * rand();
      plan.add([add(end, mul(across, -w)), lerp(add(end, mul(across, -w)), end, 0.5), end, add(end, mul(across, w * 0.5)), add(add(end, mul(across, w)), mul(into, 0.04))], 'side', [null, null]);
    } else {
      const [a, b] = mine as [number, number];
      // A loop: the curve between the two leads bulges in.
      done.add(a);
      if (plan.fromStub(a, stubs[b]!.p, mul(stubs[b]!.into, -1), 'side', b, 0)) done.add(b);
    }
    done.add(mine[0]!);
  } else {
    // The most opposite pair of sides with streets (ties at random).
    let best: [number, number] = [sides[0]!, sides[1]!], bestScore = -1;
    for (let x = 0; x < sides.length; x++) for (let y = x + 1; y < sides.length; y++) {
      const s = apart(sides[x]!, sides[y]!) + 0.3 * rand() + 0.2 * (c[sides[x]!] === 1 ? 1 : 0) + 0.2 * (c[sides[y]!] === 1 ? 1 : 0);
      if (s > bestScore) { bestScore = s; best = [sides[x]!, sides[y]!]; }
    }
    const on = (j: number) => stubs.map((_, i) => i).filter((i) => stubs[i]!.side === j);
    const A = on(best[0]), B = on(best[1]);
    // Pair stubs across: a double with a double makes two through streets.
    const pairs: [number, number][] = [];
    if (A.length === 2 && B.length === 2) {
      // Match by position across the tile (the near ones together).
      const d0 = len(sub(stubs[A[0]!]!.p, stubs[B[0]!]!.p)) + len(sub(stubs[A[1]!]!.p, stubs[B[1]!]!.p));
      const d1 = len(sub(stubs[A[0]!]!.p, stubs[B[1]!]!.p)) + len(sub(stubs[A[1]!]!.p, stubs[B[0]!]!.p));
      pairs.push(...(d0 <= d1 ? [[A[0]!, B[0]!], [A[1]!, B[1]!]] : [[A[0]!, B[1]!], [A[1]!, B[0]!]]) as [number, number][]);
    } else {
      let bp: [number, number] = [A[0]!, B[0]!], bd = Infinity;
      for (const a of A) for (const b of B) { const d = len(sub(stubs[a]!.p, stubs[b]!.p)); if (d < bd) { bd = d; bp = [a, b]; } }
      pairs.push(bp);
    }
    for (const [a, b] of pairs) {
      const rank: Rank = stubs[a]!.value === 1 || stubs[b]!.value === 1 ? 'main' : 'side';
      done.add(a);
      if (plan.fromStub(a, stubs[b]!.p, mul(stubs[b]!.into, -1), rank, b, (rand() - 0.5) * 0.08)) done.add(b);
    }
  }
  // The rest meet the network, nearest first.
  const rest = stubs.map((_, i) => i).filter((i) => !done.has(i));
  while (rest.length) {
    rest.sort((x, y) => distToNet(plan, stubs[x]!) - distToNet(plan, stubs[y]!));
    plan.join(rest.shift()!);
  }
}
const distToNet = (plan: Plan, s: Stub) => {
  const n = nearestStreet(plan.streets, add(s.p, mul(s.into, LEAD)));
  return n ? len(sub(n.q, s.p)) : Infinity;
};

// Streets that ended up apart (two through streets side by side) are
// joined: a lane between the nearest points of the two networks, until
// there is one.
function connect(plan: Plan): void {
  for (let guard = 0; guard < 8; guard++) {
    const parts = components(plan.streets);
    if (parts.length <= 1) return;
    const [A, ...rest] = parts;
    let best: { a: Pt; b: Pt; sa: number; sb: number } | null = null, bd = Infinity;
    for (const ia of A!) for (const B of rest) for (const ib of B) {
      for (const p of plan.streets[ia]!.pts) {
        const q = nearestOn(plan.streets[ib]!.pts, p), d = len(sub(q, p));
        // (Not at a street's very end, where it meets its stub.)
        if (d < bd && rhoOf(6, p) < 0.85 && rhoOf(6, q) < 0.85) { bd = d; best = { a: p, b: q, sa: ia, sb: ib }; }
      }
    }
    if (!best) return;
    const ta = nearestStreet([plan.streets[best.sa]!], best.a)!.along, tb = nearestStreet([plan.streets[best.sb]!], best.b)!.along;
    let out = perp(ta);
    if (dot(sub(best.b, best.a), out) < 0) out = mul(out, -1);
    let arrive = perp(tb);
    if (dot(sub(best.b, best.a), arrive) < 0) arrive = mul(arrive, -1);
    plan.streets.push({ pts: bezier(best.a, out, best.b, arrive, { x: 0, y: 0 }, 10), rank: 'lane', ends: [null, null] });
  }
}
// Groups of streets that meet each other (by index).
export function components(streets: readonly SkelStreet[]): number[][] {
  const parent = streets.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < streets.length; i++) for (let j = i + 1; j < streets.length; j++) {
    if (find(i) !== find(j) && linesMeet(streets[i]!.pts, streets[j]!.pts, 3e-3)) parent[find(i)] = find(j);
  }
  const groups = new Map<number, number[]>();
  streets.forEach((_, i) => { const r = find(i); const g = groups.get(r); if (g) g.push(i); else groups.set(r, [i]); });
  return [...groups.values()];
}

// A closed ring of n points round c (a little uneven by `wobble`).
function ring(c: Pt, r: number, n: number, wobble = 0, rand?: Rng): Pt[] {
  const phase = rand ? rand() * 6.28 : 0, k = rand ? 2 + Math.floor(rand() * 2) : 0;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + wobble * Math.sin(k * a + phase));
    return { x: c.x + rr * Math.cos(a), y: c.y + rr * Math.sin(a) };
  });
  return [...pts, pts[0]!];
}

// The center's square: round the junction nearest the middle, the hall on it.
function centerSquare(streets: readonly SkelStreet[]): { square: Square; hall: Spot } {
  const near = nearestStreet(streets, { x: 0, y: 0 })!;
  const J = near.q;
  // The hall: as near the junction as it stands clear of every street
  // (failing that, wherever it is clearest).
  let hallAt: Pt = J, bd = Infinity, clearest = -Infinity, fallback: Pt = J;
  for (let r = 0.05; r <= 0.34; r += 0.01) {
    for (let k = 0; k < 36; k++) {
      const p = add(J, { x: r * Math.cos((k / 36) * 6.283), y: r * Math.sin((k / 36) * 6.283) });
      if (rhoOf(6, p) + HALL_R / 0.5 > 0.86) continue;
      const clear = Math.min(...streets.map((s) => distToLine(p, s.pts))) - WIDEST - HALL_R - 0.006;
      if (clear > clearest) { clearest = clear; fallback = p; }
      if (clear < 0) continue;
      const d = len(sub(p, J)) + 0.3 * len(p);
      if (d < bd) { bd = d; hallAt = p; }
    }
    if (bd < Infinity) break;
  }
  if (bd === Infinity) hallAt = fallback;
  const r = Math.max(0.1, len(sub(hallAt, J)) + HALL_R + 0.015);
  const mid = lerp(J, hallAt, 0.45);
  const square: Square = { pts: ring(mid, r * 0.78, 16).slice(0, -1), paved: true };
  const yaw = Math.atan2(J.y - hallAt.y, J.x - hallAt.x);
  return { square, hall: { x: hallAt.x, y: hallAt.y, r: HALL_R, yaw } };
}

// Lanes into ground left far from every street (the farthest first).
function infill(plan: Plan, wonder: Spot | null): void {
  const grid: Pt[] = [];
  for (let x = -0.5; x <= 0.5; x += 0.025) for (let y = -0.5; y <= 0.5; y += 0.025) if (rhoOf(6, { x, y }) <= 0.8) grid.push({ x, y });
  for (let n = 0; n < 6; n++) {
    let far: Pt | null = null, fd = FAR;
    for (const p of grid) {
      if (wonder && len(sub(p, wonder)) < wonder.r + 0.05) continue;
      const d = Math.min(...plan.streets.map((s) => distToLine(p, s.pts)));
      if (d > fd) { fd = d; far = p; }
    }
    if (!far) return;
    const near = nearestStreet(plan.streets, far)!;
    let out = perp(near.along);
    if (dot(sub(far, near.q), out) < 0) out = mul(out, -1);
    // Reach most of the way, and on to a street close beyond it (a loop) if there is one.
    let end = lerp(near.q, far, 1.15);
    if (rhoOf(6, end) > INNER - 0.06) end = mul(end, (INNER - 0.06) / rhoOf(6, end));
    const beyond = nearestStreet(plan.streets, end, near.s);
    const pts = bezier(near.q, out, end, norm(sub(end, near.q)), { x: 0, y: 0 }, 12);
    if (beyond && len(sub(beyond.q, end)) < 0.09 && len(sub(beyond.q, near.q)) > 0.15) pts.push(beyond.q);
    plan.add(pts, 'lane', [null, null]);
  }
}

// Two building spots beside the streets, far apart (main streets preferred).
function placeSpots(streets: readonly SkelStreet[], squares: readonly Square[], hall: Spot | null, rand: Rng): Spot[] {
  const cands: { p: Pt; yaw: number; main: boolean }[] = [];
  const widthAt = (s: SkelStreet) => HALF_WIDTH[RANK_CLASS.high[s.rank]];
  for (const st of streets) {
    for (let i = 1; i + 1 < st.pts.length; i++) {
      const p = st.pts[i]!, t = norm(sub(st.pts[i + 1]!, st.pts[i - 1]!));
      for (const sg of [1, -1]) {
        const c = add(p, mul(perp(t), sg * (SPOT_R + widthAt(st) + 0.012)));
        if (rhoOf(6, c) > 1 - (SPOT_R + 0.04) / 0.5) continue;
        if (streets.some((s) => distToLine(c, s.pts) < SPOT_R + WIDEST + 0.006)) continue;
        if (squares.some((q) => q.paved && (pointInPoly(c, q.pts) || distToLine(c, [...q.pts, q.pts[0]!]) < SPOT_R))) continue;
        if (hall && len(sub(c, hall)) < hall.r + SPOT_R + 0.02) continue;
        cands.push({ p: c, yaw: Math.atan2(p.y - c.y, p.x - c.x), main: st.rank === 'main' });
      }
    }
  }
  // Open ground anywhere (facing its nearest street), for when the street sides are all taken.
  const open = (): typeof cands => {
    const out: typeof cands = [];
    for (let x = -0.4; x <= 0.4; x += 0.02) for (let y = -0.4; y <= 0.4; y += 0.02) {
      const c = { x, y };
      if (rhoOf(6, c) > 1 - (SPOT_R + 0.04) / 0.5) continue;
      if (streets.some((s) => distToLine(c, s.pts) < SPOT_R + WIDEST + 0.006)) continue;
      if (squares.some((q) => q.paved && (pointInPoly(c, q.pts) || distToLine(c, [...q.pts, q.pts[0]!]) < SPOT_R))) continue;
      if (hall && len(sub(c, hall)) < hall.r + SPOT_R + 0.02) continue;
      const near = nearestStreet(streets, c);
      out.push({ p: c, yaw: near ? Math.atan2(near.q.y - c.y, near.q.x - c.x) : 0, main: false });
    }
    return out;
  };
  if (cands.length === 0) cands.push(...open());
  if (cands.length === 0) return [];
  const first = cands.filter((c) => c.main).length ? cands.filter((c) => c.main) : cands;
  const a = first[Math.floor(rand() * first.length)]!;
  const farthest = (list: typeof cands) => {
    let b = list[0]!, bd = -1;
    for (const c of list) { const d = len(sub(c.p, a.p)); if (d > bd) { bd = d; b = c; } }
    return { b, bd };
  };
  const MIN = 2 * SPOT_R + 0.03;
  let { b, bd } = farthest(cands);
  if (bd < MIN) { const o = open(); if (o.length) ({ b, bd } = farthest(o)); }
  const spot = (c: { p: Pt; yaw: number }): Spot => ({ x: c.p.x, y: c.p.y, r: SPOT_R, yaw: c.yaw });
  return bd >= MIN ? [spot(a), spot(b)] : [spot(a)];
}
