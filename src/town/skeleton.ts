// Drafts of the town drawings, one per edge class (edges.ts) and role:
// the street skeleton, the site (the hall or a wonder) and the building
// spots.
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
  HALF_WIDTH, MAX_SPOTS, SAFE_RHO, add, sub, mul, len, lerp, distToLine, buildingSpot, inSpot, linesMeet, nearestOn, pointInPoly, rhoOf, siteSpot, spotCorners, spotOutline, spotsOverlap,
  type Density, type Pt, type Spot, type Square, type StreetClass,
} from './geometry.ts';
import { parseKey, stubsOf, type EdgeValue, type Stub } from './edges.ts';
import { townField, type Field } from './field.ts';
import { DRAFT_RHO, WALL_CLEAR, WALL_HALF } from './walls.ts';

// What the walled center keeps inside its walls: lanes end, and the site
// and spots stand, within the draft walls (walls.ts) and clear of them.
const CENTER_REACH = DRAFT_RHO - 0.08;
const insideWalls = (p: Pt, r: number) => rhoOf(6, p) + (r + WALL_CLEAR + WALL_HALF) / 0.5 <= DRAFT_RHO;

// A tile's part in its town: a block (any built-up tile: on the center its
// site holds the city hall, elsewhere a wonder if one is built there), or
// the center within walls (drawn by hand, town/walls.ts).
export type Role = 'block' | 'walled';
export const ROLES: readonly Role[] = ['block', 'walled'];
export type Rank = 'main' | 'side' | 'lane';

// Street widths by rank and density; a stub's street is as wide as its
// edge's rank (one street: main, two: side).
export const RANK_CLASS: Record<Density, Record<Rank, StreetClass>> = {
  low: { main: 'street', side: 'lane', lane: 'lane' },
  medium: { main: 'main', side: 'street', lane: 'lane' },
  dense: { main: 'main', side: 'main', lane: 'street' },
  high: { main: 'avenue', side: 'main', lane: 'street' },
  metropolitan: { main: 'avenue', side: 'avenue', lane: 'main' },
};
// The widest each rank gets (at the densest), for what must keep clear of it at any density.
export const WIDEST_CLASS: Record<Rank, StreetClass> = RANK_CLASS.metropolitan;
export const rankOfValue = (v: EdgeValue): Rank => (v === 1 ? 'main' : 'side');
const DENSITY_ORDER: Record<Density, number> = { low: 0, medium: 1, dense: 2, high: 3, metropolitan: 4 };
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
  readonly site: Spot;              // the hall (on the center) or a wonder
  readonly spots: readonly Spot[];  // building spots, MAX_SPOTS (a density uses the first SPOTS[density])
}

// ---------- limits (tile steps; the hex's inradius is 0.5) ----------

// A stub's street runs straight in this far: past the walled center's
// wall (its gate), so a street goes through a gate square to the wall.
export const LEAD = 0.125;
const INNER = 0.88;      // streets stay within this share of the inradius (but at their stubs)
const FAR = 0.12;        // ground farther than this from every street gets a lane

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
  // (The walled center has no rim streets: its walls go round, and nothing
  // stands outside them.)
  const walled = role === 'walled';
  const colouring = parseKey(key);
  const stubs = stubsOf(colouring);
  const rand = mulberry32(hashStr(`${key}|${role}|${variant}`));
  const plan = new Plan(stubs, rand);
  const field = townField(key, thickInMiddle(key, role));
  if (stubs.length === 0) village(plan, true);
  else {
    layStreets(plan, colouring);
    connect(plan);
    if (!walled) rimStreets(plan, colouring);
  }
  // (The site and spots before the lanes, so they find room and no lane
  // runs through them; spots that found no street front then go beside the lanes.)
  const place = placer(rand, field, walled);
  const site = place.site(plan.streets);
  const spots = place.spots(plan.streets, [site], MAX_SPOTS);
  infill(plan, field, [site, ...spots], [], walled ? CENTER_REACH : INNER - 0.06);
  if (spots.length < MAX_SPOTS) spots.push(...place.spots(plan.streets, [site, ...spots], MAX_SPOTS - spots.length));
  return { key, role, stubs, streets: plan.streets, squares: [], site, spots };
}

// Where the town is thickest in the middle (town/field.ts): the walled
// center, and a tile no street comes into (only ever a city's first tile:
// every other built tile touches one).
export const thickInMiddle = (key: string, role: Role): boolean => role === 'walled' || !key.includes('1');

// No street comes in (the first tile of a town): a loop round the middle,
// where the hall stands, and a few tracks out toward the fields.
function village(plan: Plan, center: boolean): void {
  const rand = plan.rand;
  const R = center ? 0.21 : 0.15;
  const c = { x: (rand() - 0.5) * 0.02, y: (rand() - 0.5) * 0.02 };
  plan.streets.push({ pts: ring(c, R, 32, 0.06, rand), rank: 'side', ends: [null, null] });
  const n = center ? 3 : 2, phase = rand() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const out = { x: Math.cos(a), y: Math.sin(a) }, start = nearestOn(plan.streets[0]!.pts, add(c, mul(out, R)));
    const reach = (center ? 0.27 : 0.36) + 0.04 * rand(), side = perp(out), sway = (rand() - 0.5) * 0.08;
    const end = add(add(c, mul(out, reach)), mul(side, sway));
    plan.streets.push({ pts: bezier(start, out, end, norm(sub(end, start)), mul(side, sway * 0.5), 10), rank: 'lane', ends: [null, null] });
  }
}

// Along each side whose street joins another built tile, a street at
// RIM_RHO: the houses outside it back onto the edge, back to back with
// the neighbor's, so a town reads as one across its tiles. It runs from
// the side's own street out toward each corner, round the corner where
// the next side is joined too (meeting that side's), short of it where
// the town ends there.
export const RIM_RHO = 0.81;
function rimStreets(plan: Plan, c: readonly EdgeValue[]): void {
  const d = 0.5 * RIM_RHO, toCorner = d / Math.cos(Math.PI / 6);
  for (let j = 0; j < 6; j++) {
    if (!c[j]) continue;
    const n = { x: Math.cos((j * Math.PI) / 3), y: Math.sin((j * Math.PI) / 3) }, mid = mul(n, d);
    for (const dir of [1, -1]) {
      const k = (j + dir + 6) % 6, a = ((j + dir * 0.5) * Math.PI) / 3;
      const cornerPt = { x: Math.cos(a) * toCorner, y: Math.sin(a) * toCorner };
      // (Where the next side is open: stop short of the corner, the row of houses ends there.)
      const end = c[k] ? cornerPt : lerp(mid, cornerPt, 0.72);
      plan.add([mid, lerp(mid, end, 0.34), lerp(mid, end, 0.67), end], 'side', [null, null]);
    }
  }
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
      // (Short of the middle: the town thins away from its one side.)
      const end = mul(into, -0.08 - 0.05 * rand());
      plan.fromStub(mine[0]!, end, into, 'main');
      const w = 0.15 + 0.05 * rand();
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


// Lanes into ground left far from every street, where the town is thick
// enough for them (the farthest first); thin ground stays open.
const LANE_FIELD = 0.42;
function infill(plan: Plan, field: Field, keep: readonly Spot[], paved: readonly Square[], reach: number): void {
  const blocked = (p: Pt, m: number) => keep.some((k) => inSpot(p, k, m)) || paved.some((q) => pointInPoly(p, q.pts) || distToLine(p, [...q.pts, q.pts[0]!]) < m);
  const grid: Pt[] = [];
  for (let x = -0.5; x <= 0.5; x += 0.025) for (let y = -0.5; y <= 0.5; y += 0.025) {
    const p = { x, y };
    if (rhoOf(6, p) <= Math.min(0.8, reach) && field.at(p) >= LANE_FIELD && !blocked(p, 0.07)) grid.push(p);
  }
  for (let n = 0; n < 10; n++) {
    let far: Pt | null = null, fd = FAR;
    for (const p of grid) {
      const d = Math.min(...plan.streets.map((s) => distToLine(p, s.pts)));
      if (d > fd) { fd = d; far = p; }
    }
    if (!far) return;
    const near = nearestStreet(plan.streets, far)!;
    let out = perp(near.along);
    if (dot(sub(far, near.q), out) < 0) out = mul(out, -1);
    // Reach most of the way, and on to a street close beyond it (a loop) if there is one.
    let end = lerp(near.q, far, 1.15);
    if (rhoOf(6, end) > reach) end = mul(end, reach / rhoOf(6, end));
    const beyond = nearestStreet(plan.streets, end, near.s);
    const pts = bezier(near.q, out, end, norm(sub(end, near.q)), { x: 0, y: 0 }, 12);
    if (beyond && len(sub(beyond.q, end)) < 0.09 && len(sub(beyond.q, near.q)) > 0.15) pts.push(beyond.q);
    // (Never across the site or a spot.)
    if (pts.some((p) => blocked(p, 0.035))) { grid.splice(grid.indexOf(far), 1); n--; continue; }
    plan.add(pts, 'lane', [null, null]);
  }
}

// The site and the building spots beside the streets, facing them, inside
// the safe zone (the walled center's within its walls) and clear of each
// other: the site where the town is thickest, then each spot in thick town
// apart from those before it (a low tile uses the first, a medium one the
// first two: geometry.ts SPOTS). Each is placed where its square stands
// clear of every street at its widest.
function placer(rand: Rng, field: Field, walled: boolean) {
  type Cand = { sp: Spot; main: boolean };
  const widthAt = (s: SkelStreet) => HALF_WIDTH[WIDEST_CLASS[s.rank]];
  // (Off every street at its widest, by its square's outline: town/checks.ts spotOnStreet.)
  const free = (streets: readonly SkelStreet[], sp: Spot) => spotCorners(sp).every((c) => rhoOf(6, c) <= SAFE_RHO) && (!walled || insideWalls(sp, sp.r))
    && !streets.some((s) => { const hw = widthAt(s) + 0.002; return distToLine(sp, s.pts) < sp.r + hw && (spotOutline(sp).some((p) => distToLine(p, s.pts) < hw) || s.pts.some((p) => inSpot(p, sp))); });
  // Beside the streets, facing them (or, where no street side has room, open ground facing the nearest).
  const cands = (streets: readonly SkelStreet[], half: number, at: (x: number, y: number, yaw: number) => Spot, open: boolean): Cand[] => {
    const out: Cand[] = [];
    for (const st of streets) {
      for (let i = 1; i + 1 < st.pts.length; i++) {
        const p = st.pts[i]!, t = norm(sub(st.pts[i + 1]!, st.pts[i - 1]!));
        for (const sg of [1, -1]) {
          const c = add(p, mul(perp(t), sg * (half + widthAt(st) + 0.006)));
          const sp = at(c.x, c.y, Math.atan2(p.y - c.y, p.x - c.x));
          if (free(streets, sp)) out.push({ sp, main: st.rank === 'main' });
        }
      }
    }
    if (!out.length && open) {
      for (let x = -0.4; x <= 0.4; x += 0.02) for (let y = -0.4; y <= 0.4; y += 0.02) {
        const near = nearestStreet(streets, { x, y });
        const sp = at(x, y, near ? Math.atan2(near.q.y - y, near.q.x - x) : 0);
        if (free(streets, sp)) out.push({ sp, main: false });
      }
    }
    return out;
  };
  const best = (cs: readonly Cand[], value: (c: Cand) => number): Cand | null => {
    let b: Cand | null = null, bv = -Infinity;
    for (const c of cs) { const v = value(c); if (v > bv) { bv = v; b = c; } }
    return b;
  };
  return {
    site: (streets: readonly SkelStreet[]): Spot =>
      best(cands(streets, siteSpot(0, 0, 0).hw!, siteSpot, true), (c) => field.at(c.sp) + (c.main ? 0.08 : 0) + 0.05 * rand() - 0.3 * len(c.sp))?.sp ?? siteSpot(0, 0, 0),
    // Up to n more spots, clear of those placed.
    spots: (streets: readonly SkelStreet[], placed: readonly Spot[], n: number): Spot[] => {
      const out: Spot[] = [];
      const cs = cands(streets, buildingSpot(0, 0, 0).hw!, buildingSpot, false);
      for (let k = 0; k < n; k++) {
        const all = [...placed, ...out], mine = all.slice(1);
        const ok = cs.filter((c) => all.every((o) => !spotsOverlap(c.sp, o, 0.012)));
        const c = best(ok, (c) => field.at(c.sp) + 0.8 * Math.min(0.3, ...mine.map((o) => len(sub(c.sp, o)))) + (c.main ? 0.08 : 0) + 0.05 * rand());
        if (!c) break;
        out.push(c.sp);
      }
      return out;
    },
  };
}
