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
  HALF_WIDTH, SAFE_RHO, add, sub, mul, len, lerp, distToLine, inSpot, linesMeet, nearestOn, pointInPoly, rhoOf, spotOutline,
  type Density, type Pt, type Spot, type Square, type StreetClass,
} from './geometry.ts';
import { parseKey, stubsOf, type EdgeValue, type Stub } from './edges.ts';
import { WONDER_ROLES, groupOf, isWonderRole, wonderSpot, type WonderGroup, type WonderRole } from './wonders.ts';
import { townField, type Field } from './field.ts';
import { DRAFT_RHO, WALL_CLEAR, WALL_HALF } from './walls.ts';

// What the center keeps inside its walls (the walled center has the
// center's skeleton): lanes end, and the hall and spots stand, within the
// draft walls (walls.ts) and clear of them.
const CENTER_REACH = DRAFT_RHO - 0.08;
const insideWalls = (p: Pt, r: number) => rhoOf(6, p) + (r + WALL_CLEAR + WALL_HALF) / 0.5 <= DRAFT_RHO;

// A tile's part in its town: an ordinary block, the center (the hall and
// its square), the center within walls (drawn by hand, town/walls.ts), or
// a wonder's tile (by the wonder's group: town/wonders.ts).
export type Role = 'block' | 'center' | 'walled' | WonderRole;
export const ROLES: readonly Role[] = ['block', 'center', 'walled', ...WONDER_ROLES];
// The roles with the city hall.
export const hasHall = (r: Role): boolean => r === 'center' || r === 'walled';
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
// The city hall grows with its tile's density: more ground, and a grander
// model (civic.ts: each civ's own, by tier).
export const HALL_RADIUS: Record<Density, number> = { low: 0.045, medium: 0.045, dense: 0.054, high: 0.062, metropolitan: 0.075 };
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
  readonly spots: readonly Spot[]; // building slots
  readonly hall: Spot | null;
  readonly wonder: Spot | null;
}

// ---------- limits (tile steps; the hex's inradius is 0.5) ----------

// A stub's street runs straight in this far: past the walled center's
// wall (its gate), so a street goes through a gate square to the wall.
export const LEAD = 0.125;
const INNER = 0.88;      // streets stay within this share of the inradius (but at their stubs)
const FAR = 0.12;        // ground farther than this from every street gets a lane
const SPOT_R = 0.062;    // building spots
const HALL_R = 0.075; // (room for the largest hall, HALL_RADIUS)
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
  // (The walled center's streets are the center's: its walls go round them.)
  if (role === 'walled') return { ...draftSkeleton(key, 'center', variant), role };
  const colouring = parseKey(key);
  const stubs = stubsOf(colouring);
  const rand = mulberry32(hashStr(`${key}|${role}|${variant}`));
  const plan = new Plan(stubs, rand);
  const field = townField(key, role === 'center');
  const squares: Square[] = [];
  let hall: Spot | null = null, wonder: Spot | null = null;

  if (isWonderRole(role)) {
    const w = wonderPlan(plan, groupOf(role));
    wonder = w.wonder;
    squares.push(...w.squares);
  } else if (stubs.length === 0) {
    village(plan, role === 'center');
  } else {
    layStreets(plan, colouring);
    connect(plan);
  }
  if (role === 'center') {
    const c = centerPlaza(plan.streets, field);
    squares.push(c.square);
    hall = c.hall;
  }
  // (Lanes into empty ground where the town is thick; none across the hall, its square or a wonder.)
  const center = role === 'center';
  infill(plan, field, [...(wonder ? [wonder] : []), ...(hall ? [hall] : [])], squares.filter((q) => q.paved), center ? CENTER_REACH : INNER - 0.06);
  const spots = isWonderRole(role) ? [] : placeSpots(plan.streets, squares, hall, rand, field, center);
  return { key, role, stubs, streets: plan.streets, squares, spots, hall, wonder };
}

// No street comes in (the first tile of a town, or a block on its own): a
// loop round the middle, where the hall and its square stand, and a few
// tracks out toward the fields.
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

// A wonder's tile: the wonder stands in the middle of its tile (inside
// the safe zone, whatever its group), facing the town. Each street comes
// in and meets a street curving round the wonder's town side (none round
// its far side), and a forecourt opens before its front; a lawn round it.
// With one street, that street ends at the forecourt.
const WONDER_GAP = 0.045; // between the wonder's corners and the street round it
function wonderPlan(plan: Plan, g: WonderGroup): { wonder: Spot; squares: Square[] } {
  const stubs = plan.stubs;
  const leads = stubs.map((s) => add(s.p, mul(s.into, LEAD)));
  // (Toward the town: the mean way to its streets.)
  const c = leads.reduce((a, l) => add(a, norm(l)), { x: 0, y: 0 });
  const f0 = leads.length && len(c) > 0.2 * leads.length ? norm(c) : { x: 0, y: 1 };
  const sp = wonderSpot(g, 0, 0, Math.atan2(f0.y, f0.x));
  // (The street round it as far out as its streets' leads allow.)
  const R = Math.max(sp.r + 0.02, Math.min(sp.r + WONDER_GAP, ...leads.map((l) => len(l) - 0.04)));
  const arc = arcRound(sp, R, leads);
  const f = { x: Math.cos(sp.yaw), y: Math.sin(sp.yaw) }, side = perp(f);
  if (arc) plan.streets.push({ pts: arc, rank: 'side', ends: [null, null] });
  stubs.forEach((s, i) => {
    const a = add(sp, mul(norm(sub(leads[i]!, sp)), R));
    plan.fromStub(i, a, norm(sub(sp, a)), rankOfValue(s.value));
  });
  // (No street comes in: a drive up to the forecourt.)
  if (!stubs.length) {
    const a = add(sp, mul(f, R)), b = add(sp, mul(f, Math.min(R + 0.13, 0.42)));
    plan.streets.push({ pts: [a, lerp(a, b, 0.5), b], rank: 'lane', ends: [null, null] });
  }
  const depth = sp.hd ?? sp.r, half = Math.min(sp.hw ?? sp.r, 0.09);
  const front = add(sp, mul(f, depth)), toStreet = add(sp, mul(f, R));
  const forecourt: Square = { pts: [add(front, mul(side, half)), add(toStreet, mul(side, half)), add(toStreet, mul(side, -half)), add(front, mul(side, -half))], paved: true };
  const lawn: Square = { pts: spotOutline({ ...sp, r: sp.r + 0.025, ...(sp.hw !== undefined ? { hw: sp.hw + 0.025, hd: sp.hd! + 0.025 } : {}) }, 0.03), paved: false };
  return { wonder: sp, squares: [lawn, forecourt] };
}
// The street round a wonder at radius R on its town side: over the
// arrivals of the streets coming in (all but the widest gap between them).
function arcRound(c: Pt, R: number, leads: readonly Pt[]): Pt[] | null {
  if (leads.length < 2) return null;
  const angs = leads.map((l) => Math.atan2(l.y - c.y, l.x - c.x)).sort((a, b) => a - b);
  let gapAt = angs.length - 1, gap = angs[0]! + 2 * Math.PI - angs[angs.length - 1]!;
  for (let i = 0; i + 1 < angs.length; i++) if (angs[i + 1]! - angs[i]! > gap) { gap = angs[i + 1]! - angs[i]!; gapAt = i; }
  const a0 = angs[(gapAt + 1) % angs.length]!, span = 2 * Math.PI - gap;
  const n = Math.max(3, Math.ceil(span / (Math.PI / 18)));
  return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (span * i) / n; return { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) }; });
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


// The center's hall and its square: the hall where the town is thickest,
// back from a street by the square's depth, facing the street across it;
// the square runs from the hall's front to the street.
const PLAZA_MIN = 0.035, PLAZA_MAX = 0.07;
function centerPlaza(streets: readonly SkelStreet[], field: Field): { square: Square; hall: Spot } {
  let at: Pt | null = null, bs = -Infinity, fallback: Pt = { x: 0, y: 0 }, clearest = -Infinity;
  for (let x = -0.4; x <= 0.4001; x += 0.01) for (let y = -0.4; y <= 0.4001; y += 0.01) {
    const p = { x, y };
    if (!insideWalls(p, HALL_R)) continue;
    const clear = Math.min(...streets.map((s) => distToLine(p, s.pts))) - WIDEST - HALL_R;
    if (clear > clearest) { clearest = clear; fallback = p; }
    if (clear < PLAZA_MIN) continue;
    const score = field.at(p) - 2 * Math.max(0, clear - PLAZA_MAX) - 0.2 * len(p);
    if (score > bs) { bs = score; at = p; }
  }
  const h = at ?? fallback;
  const near = nearestStreet(streets, h)!;
  const f = norm(sub(near.q, h)), s = perp(f), w = HALL_R * 1.25;
  const a = add(h, mul(f, HALL_R * 0.6)), b = near.q;
  const square: Square = { pts: [add(a, mul(s, w)), add(b, mul(s, w)), add(b, mul(s, -w)), add(a, mul(s, -w))], paved: true };
  return { square, hall: { x: h.x, y: h.y, r: HALL_R, yaw: Math.atan2(f.y, f.x) } };
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
    // (Never across a wonder, the hall or its square.)
    if (pts.some((p) => blocked(p, 0.035))) { grid.splice(grid.indexOf(far), 1); n--; continue; }
    plan.add(pts, 'lane', [null, null]);
  }
}

// Two building spots beside the streets: the first where the town is
// thickest (on a main street if there is one), the second apart from it
// but in thick town too.
// (Their buildings stand within the safe zone; the center's within its walls.)
function placeSpots(streets: readonly SkelStreet[], squares: readonly Square[], hall: Spot | null, rand: Rng, field: Field, center: boolean): Spot[] {
  const cands: { p: Pt; yaw: number; main: boolean }[] = [];
  const widthAt = (s: SkelStreet) => HALF_WIDTH[RANK_CLASS.high[s.rank]];
  const free = (c: Pt) => rhoOf(6, c) + SPOT_R / 0.5 <= SAFE_RHO && (!center || insideWalls(c, SPOT_R))
    && !streets.some((s) => distToLine(c, s.pts) < SPOT_R + WIDEST + 0.006)
    && !squares.some((q) => q.paved && (pointInPoly(c, q.pts) || distToLine(c, [...q.pts, q.pts[0]!]) < SPOT_R))
    && !(hall && len(sub(c, hall)) < hall.r + SPOT_R + 0.02);
  for (const st of streets) {
    for (let i = 1; i + 1 < st.pts.length; i++) {
      const p = st.pts[i]!, t = norm(sub(st.pts[i + 1]!, st.pts[i - 1]!));
      for (const sg of [1, -1]) {
        const c = add(p, mul(perp(t), sg * (SPOT_R + widthAt(st) + 0.012)));
        if (free(c)) cands.push({ p: c, yaw: Math.atan2(p.y - c.y, p.x - c.x), main: st.rank === 'main' });
      }
    }
  }
  // Open ground anywhere (facing its nearest street), for when the street sides are all taken.
  const open = (): typeof cands => {
    const out: typeof cands = [];
    for (let x = -0.4; x <= 0.4; x += 0.02) for (let y = -0.4; y <= 0.4; y += 0.02) {
      const c = { x, y };
      if (!free(c)) continue;
      const near = nearestStreet(streets, c);
      out.push({ p: c, yaw: near ? Math.atan2(near.q.y - c.y, near.q.x - c.x) : 0, main: false });
    }
    return out;
  };
  if (cands.length === 0) cands.push(...open());
  if (cands.length === 0) return [];
  const score = (c: (typeof cands)[number]) => field.at(c.p) + (c.main ? 0.08 : 0) + 0.05 * rand();
  let a = cands[0]!;
  for (const c of cands) if (score(c) > score(a)) a = c;
  const MIN = 2 * SPOT_R + 0.03;
  const second = (list: typeof cands) => {
    let b: (typeof cands)[number] | null = null, bv = -Infinity;
    for (const c of list) {
      const d = len(sub(c.p, a.p));
      if (d < MIN) continue;
      const v = field.at(c.p) + 0.8 * Math.min(d, 0.3);
      if (v > bv) { bv = v; b = c; }
    }
    return b;
  };
  const b = second(cands) ?? second(open());
  const spot = (c: { p: Pt; yaw: number }): Spot => ({ x: c.p.x, y: c.p.y, r: SPOT_R, yaw: c.yaw });
  return b ? [spot(a), spot(b)] : [spot(a)];
}
