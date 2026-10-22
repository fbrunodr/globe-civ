// The town drawings: for each edge class (edges.ts), role and density, the
// street skeleton (skeleton.ts: the same for every density) with its lots
// (draft.ts: by density). Built on first use and kept.

import { HALF_WIDTH, curve, len, lotSamples, pointInPoly, rhoOf, sub, distToLine, add, mul, isBuilding, LOT_KINDS, FLOORS, ON_GREENS, type Density, type Floors, type Lot, type LotKind, type Pt, type Spot, type Square, type StreetClass, type Street2 } from './geometry.ts';
import { draftLots } from './draft.ts';
import { draftSkeleton, hasHall, RANK_CLASS, EDGE_BLEND, LEAD, HALL_RADIUS, type Rank, type Role, type Skeleton } from './skeleton.ts';
import { draftWalls, DRAFT_RHO, WALL_CLEAR } from './walls.ts';
import { groupOf, isWonderRole, wonderSpot } from './wonders.ts';
import { parseKey, stubsOf, type Stub } from './edges.ts';
import STORED from './drawings.json';

export interface DrawnStreet {
  readonly pts: readonly Pt[];
  readonly rank: Rank;
  readonly cls: StreetClass;                            // its width, away from its stubs
  readonly ends: readonly [number | null, number | null]; // the stubs its ends are at
}
export interface Drawing {
  readonly key: string;
  readonly role: Role;
  readonly density: Density;
  readonly stubs: readonly Stub[];
  readonly streets: readonly DrawnStreet[];
  readonly squares: readonly Square[];
  readonly spots: readonly Spot[];
  readonly hall: Spot | null;
  readonly wonder: Spot | null;
  readonly lots: readonly Lot[];
  // The walled center's walls (none on other tiles): runs, and gates on them.
  readonly walls: readonly (readonly Pt[])[];
  readonly gates: readonly Pt[];
}

// Lots stay within this share of the inradius (the rest is the tile's rim:
// gardens back to back with the neighbor's, and room for walls).
export const LOT_INNER = 0.95;

const skeletons = new Map<string, Skeleton>();
const drawings = new Map<string, Drawing>();
const hashStr = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

export function skeletonFor(key: string, role: Role): Skeleton {
  const k = `${key}|${role}`;
  let s = skeletons.get(k);
  if (!s) { s = draftSkeleton(key, role); skeletons.set(k, s); }
  return s;
}

// A drawing: by hand (variant n of its class, role and density), or the
// generated draft (variant 0, or one not drawn).
export function drawingFor(key: string, role: Role, density: Density, variant = 0): Drawing {
  const k = recordKey(key, role, density, variant);
  let d = drawings.get(k);
  if (!d) {
    const rec = variant > 0 ? records[k] : undefined;
    d = rec ? fromRecord(key, role, density, rec) : assemble(skeletonFor(key, role), density);
    drawings.set(k, d);
  }
  return d;
}
// The variants drawn by hand for a class, role and density (in order).
export function variantsOf(key: string, role: Role, density: Density): number[] {
  const head = `${key}|${role}|${density}|`;
  return Object.keys(records).filter((k) => k.startsWith(head)).map((k) => Number(k.slice(head.length))).filter((n) => n > 0).sort((a, b) => a - b);
}
// The drawing a tile shows: one of the variants by hand (by the tile's
// hash), or the draft while there is none.
export function pickDrawing(key: string, role: Role, density: Density, hash: number): Drawing {
  const vs = variantsOf(key, role, density);
  return drawingFor(key, role, density, vs.length ? vs[hash % vs.length]! : 0);
}

// ---------- drawings by hand (the editor; stored in drawings.json) ----------
//
// One record per class, role and density: streets as the points they were
// drawn through (a street drawn from a stub runs straight in from it first),
// squares, spots, and every lot. Numbers rounded; angles in degrees.

type XY = [number, number];
export interface DrawingRecord {
  streets: { ctrl: XY[]; rank: Rank }[];
  squares: { pts: XY[]; paved: boolean }[];
  spots: [number, number, number, number][];        // x, y, r, yaw
  hall: [number, number, number, number] | null;
  wonder: [number, number, number, number] | null;
  lots: (string | number)[][];                       // kind, x, y, yaw[, floors[, spot]]
  walls?: XY[][];                                    // the walled center: wall runs
  gates?: XY[];                                      // and gates on them
}
// Stored as `class|role|density|variant` (variants from 1).
const records: Record<string, DrawingRecord> = Object.fromEntries(Object.entries(STORED as Record<string, DrawingRecord>)
  .map(([k, v]) => [k.split('|').length === 3 ? `${k}|1` : k, v]));
export const recordKey = (key: string, role: Role, density: Density, variant: number) => `${key}|${role}|${density}|${variant}`;
export const storedRecord = (k: string): DrawingRecord | null => records[k] ?? null;
export const storedKeys = (): string[] => Object.keys(records);
export const allRecords = (): Record<string, DrawingRecord> => records;
// Sets (or with null, drops) a drawing by hand; it is used from now on.
export function setRecord(k: string, rec: DrawingRecord | null): void {
  if (rec) records[k] = rec; else delete records[k];
  drawings.delete(k);
}

const DEG = Math.PI / 180;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const xy = (p: Pt): XY => [r4(p.x), r4(p.y)];
const pt = ([x, y]: XY): Pt => ({ x, y });

// A street through its drawn points: from a stub, straight in first.
export function streetPath(ctrl: readonly Pt[], stubs: readonly Stub[]): { pts: Pt[]; ends: [number | null, number | null] } {
  const at = (p: Pt) => { const i = stubs.findIndex((s) => len(sub(s.p, p)) < 1e-4); return i < 0 ? null : i; };
  const ends: [number | null, number | null] = [at(ctrl[0]!), ctrl.length > 1 ? at(ctrl[ctrl.length - 1]!) : null];
  const lead = (i: number) => [stubs[i]!.p, add(stubs[i]!.p, mul(stubs[i]!.into, LEAD / 2)), add(stubs[i]!.p, mul(stubs[i]!.into, LEAD))];
  let mid = [...ctrl];
  if (ends[0] !== null) mid = mid.slice(1);
  if (ends[1] !== null) mid = mid.slice(0, -1);
  // (Drawn points too close to a lead's end are dropped.)
  const head = ends[0] !== null ? lead(ends[0]) : [], tail = ends[1] !== null ? lead(ends[1]).reverse() : [];
  mid = mid.filter((p) => ![...head, ...tail].some((q) => len(sub(p, q)) < 0.02));
  const all = [...head, ...mid, ...tail];
  return { pts: all.length >= 3 ? curve(all, 6) : all, ends };
}

export function fromRecord(key: string, role: Role, density: Density, r: DrawingRecord): Drawing {
  const stubs = stubsOf(parseKey(key));
  const streets: DrawnStreet[] = r.streets.filter((s) => s.ctrl.length >= 2).map((s) => {
    const { pts, ends } = streetPath(s.ctrl.map(pt), stubs);
    return { pts, rank: s.rank, cls: RANK_CLASS[density][s.rank], ends };
  });
  const spot = (a: [number, number, number, number] | null): Spot | null => (a ? { x: a[0], y: a[1], r: a[2], yaw: a[3] * DEG } : null);
  // (A wonder's footprint is its group's: the record only places and turns it.)
  const wonderAt = (a: [number, number, number, number] | null): Spot | null => (a && isWonderRole(role) ? wonderSpot(groupOf(role), a[0], a[1], a[3] * DEG) : null);
  const lots: Lot[] = r.lots.flatMap((row) => {
    const [kind, x, y, yaw, floors, sp] = row as [string, number, number, number, number?, number?];
    if (!(LOT_KINDS as readonly string[]).includes(kind)) return [];
    const base: Lot = { kind: kind as LotKind, x, y, yaw: yaw * DEG };
    const f = isBuilding(kind as LotKind) && (FLOORS as readonly number[]).includes(floors ?? 1) ? { floors: (floors ?? 1) as Floors } : {};
    return [{ ...base, ...f, ...(sp !== undefined && sp >= 0 ? { spot: sp } : {}) }];
  });
  return {
    key, role, density, stubs, streets,
    squares: r.squares.map((q) => ({ pts: q.pts.map(pt), paved: q.paved })),
    spots: r.spots.map((a) => spot(a)!), hall: spot(r.hall), wonder: wonderAt(r.wonder), lots,
    walls: (r.walls ?? []).map((w) => w.map(pt)), gates: (r.gates ?? []).map(pt),
  };
}

// A drawing as a record (to start editing from a draft).
export function toRecord(d: Drawing, ctrlOf: (s: DrawnStreet) => readonly Pt[]): DrawingRecord {
  const sp = (s: Spot | null): [number, number, number, number] | null => (s ? [r4(s.x), r4(s.y), r4(s.r), Math.round(s.yaw / DEG)] : null);
  return {
    streets: d.streets.map((s) => ({ ctrl: ctrlOf(s).map(xy), rank: s.rank })),
    squares: d.squares.map((q) => ({ pts: q.pts.map(xy), paved: q.paved })),
    spots: d.spots.map((s) => sp(s)!), hall: sp(d.hall), wonder: sp(d.wonder),
    lots: d.lots.map((l) => {
      const row: (string | number)[] = [l.kind, r4(l.x), r4(l.y), Math.round(l.yaw / DEG)];
      if (isBuilding(l.kind) || l.spot !== undefined) row.push(l.floors ?? 1);
      if (l.spot !== undefined) row.push(l.spot);
      return row;
    }),
    ...(d.walls.length ? { walls: d.walls.map((w) => w.map(xy)), gates: d.gates.map(xy) } : {}),
  };
}

// The widest a street may be where it nears a stub: its edge takes the
// denser tile's width (up to the widest of its rank).
export const widestNearStub = (rank: Rank): StreetClass => RANK_CLASS.high[rank];

// What lots keep clear of: each street at its width, and near its stubs at
// the widest it may get there.
export function clearance(streets: readonly DrawnStreet[], stubs: readonly Stub[]): Street2[] {
  const out: Street2[] = streets.map((s) => ({ pts: s.pts, cls: s.cls }));
  for (const s of streets) {
    for (const [e, from] of [[s.ends[0], 0], [s.ends[1], s.pts.length - 1]] as const) {
      if (e === null) continue;
      const stub = stubs[e]!.p;
      const near = s.pts.filter((p) => len(sub(p, stub)) <= EDGE_BLEND + 0.02);
      if (near.length >= 2) out.push({ pts: from === 0 ? near : near.reverse(), cls: widestNearStub(s.rank) });
    }
  }
  return out;
}

export function assemble(sk: Skeleton, density: Density): Drawing {
  const streets: DrawnStreet[] = sk.streets.map((s) => ({ pts: s.pts, rank: s.rank, cls: RANK_CLASS[density][s.rank], ends: s.ends }));
  const clear = clearance(streets, sk.stubs);
  const decor: Lot[] = [];
  if (hasHall(sk.role)) {
    // A well or fountain on the square, clear of the streets and the hall.
    const sq = sk.squares.find((q) => q.paved);
    if (sq) {
      const c = sq.pts.reduce((a, p) => ({ x: a.x + p.x / sq.pts.length, y: a.y + p.y / sq.pts.length }), { x: 0, y: 0 });
      const kind = density === 'low' ? 'well' as const : 'fountain' as const;
      const lot: Lot = { x: c.x, y: c.y, yaw: 0, kind };
      const clearOfAll = lotSamples(lot).every((p) => clear.every((s) => distToLine(p, s.pts) > HALF_WIDTH[s.cls] + 0.004)
        && (!sk.hall || len(sub(p, sk.hall)) > sk.hall.r + 0.006));
      if (clearOfAll) decor.push(lot);
    }
  }
  const keepClear = [...(sk.hall ? [{ ...sk.hall, r: HALL_RADIUS[density] }] : []), ...(sk.wonder ? [sk.wonder] : [])];
  // The walled center's draft walls: a ring round the rim (the lots keep inside it).
  const walls = sk.role === 'walled' ? draftWalls(sk.stubs) : { walls: [], gates: [] };
  const inner = sk.role === 'walled' ? DRAFT_RHO - WALL_CLEAR / 0.5 - 0.01 : LOT_INNER;
  // (A hair inside it: the editor stores lots rounded, turned to whole degrees.)
  const lots = draftLots({
    region: (p) => rhoOf(6, p) <= inner - 0.003,
    density: () => density,
    streets: clear,
    squares: sk.squares.filter((q) => q.paved),
    spots: sk.spots,
    keepClear,
    decor,
    seed: hashStr(`${sk.key}|${sk.role}|${density}`),
    frontage: (i) => i < streets.length,
  });
  // (Greens are kept clear of homes too.)
  const greens = sk.squares.filter((q) => !q.paved);
  const kept = lots.filter((l) => ON_GREENS.has(l.kind) || !greens.some((q) => pointInPoly(l, q.pts)));
  return { key: sk.key, role: sk.role, density, stubs: sk.stubs, streets, squares: sk.squares, spots: sk.spots, hall: sk.hall && { ...sk.hall, r: HALL_RADIUS[density] }, wonder: sk.wonder, lots: [...decor, ...kept], walls: walls.walls, gates: walls.gates };
}

export type { Role, Rank, Skeleton };
