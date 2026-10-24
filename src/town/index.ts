// The town drawings: for each edge class (edges.ts), role and density, the
// street skeleton (skeleton.ts: the same for every density) with its site,
// its building spots (as many as the density has) and its lots (draft.ts:
// by density). Built on first use and kept.

import {
  LOT_INNER, SPOTS, SPOT_HOUSE, SPOT_HOUSE_FLOORS, curve, len, pointInPoly, rhoOf, sub, add, mul, isBuilding, buildingSpot, siteSpot, LOT_KINDS, FLOORS, ON_GREENS,
  type Density, type Floors, type Lot, type LotKind, type Pt, type Spot, type Square, type StreetClass, type Street2,
} from './geometry.ts';
import { draftLots } from './draft.ts';
import { draftSkeleton, thickInMiddle, RANK_CLASS, WIDEST_CLASS, EDGE_BLEND, LEAD, type Rank, type Role, type Skeleton } from './skeleton.ts';
import { draftWalls, DRAFT_RHO, WALL_CLEAR } from './walls.ts';
import { parseKey, stubsOf, type Stub } from './edges.ts';
import { townField, withStreets } from './field.ts';

// How much a street draws building to it, by rank.
const STREET_PULL: Record<Rank, number> = { main: 0.55, side: 0.4, lane: 0.2 };
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
  readonly site: Spot;              // the hall on the center, a wonder elsewhere (the houses on it give way)
  readonly spots: readonly Spot[];  // building spots: SPOTS[density], each with its house (a lot with its spot)
  readonly lots: readonly Lot[];
  // The walled center's walls (none on other tiles): runs, and gates on them.
  readonly walls: readonly (readonly Pt[])[];
  readonly gates: readonly Pt[];
}

export { LOT_INNER };

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
// squares, the site, the spots, and every lot. Numbers rounded; angles in
// degrees.

type XY = [number, number];
export interface DrawingRecord {
  streets: { ctrl: XY[]; rank: Rank }[];
  squares: { pts: XY[]; paved: boolean }[];
  site: [number, number, number];                    // x, y, yaw
  spots: [number, number, number][];                 // x, y, yaw
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
    site: siteSpot(r.site[0], r.site[1], r.site[2] * DEG), spots: r.spots.map(([x, y, yaw]) => buildingSpot(x, y, yaw * DEG)), lots,
    walls: (r.walls ?? []).map((w) => w.map(pt)), gates: (r.gates ?? []).map(pt),
  };
}

// A drawing as a record (to start editing from a draft).
export function toRecord(d: Drawing, ctrlOf: (s: DrawnStreet) => readonly Pt[]): DrawingRecord {
  const sp = (s: Spot): [number, number, number] => [r4(s.x), r4(s.y), Math.round(s.yaw / DEG)];
  return {
    streets: d.streets.map((s) => ({ ctrl: ctrlOf(s).map(xy), rank: s.rank })),
    squares: d.squares.map((q) => ({ pts: q.pts.map(xy), paved: q.paved })),
    site: sp(d.site), spots: d.spots.map(sp),
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
export const widestNearStub = (rank: Rank): StreetClass => WIDEST_CLASS[rank];

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

// A spot's house, until a building stands there.
export const spotHouse = (sp: Spot, k: number, density: Density): Lot =>
  ({ x: sp.x, y: sp.y, yaw: sp.yaw, kind: SPOT_HOUSE, floors: SPOT_HOUSE_FLOORS[density], spot: k });

export function assemble(sk: Skeleton, density: Density): Drawing {
  const streets: DrawnStreet[] = sk.streets.map((s) => ({ pts: s.pts, rank: s.rank, cls: RANK_CLASS[density][s.rank], ends: s.ends }));
  const clear = clearance(streets, sk.stubs);
  const spots = sk.spots.slice(0, SPOTS[density]);
  const walled = sk.role === 'walled';
  // The walled center's draft walls: a ring round the rim (the lots keep inside it).
  const walls = walled ? draftWalls(sk.stubs) : { walls: [], gates: [] };
  const inner = walled ? DRAFT_RHO - WALL_CLEAR / 0.5 - 0.01 : LOT_INNER;
  // (A hair inside it: the editor stores lots rounded, turned to whole degrees.)
  // How thick the town is: the class's field, risen along the streets
  // (most along main streets).
  const field = withStreets(townField(sk.key, thickInMiddle(sk.key, sk.role)), streets.map((s) => ({ pts: s.pts, pull: STREET_PULL[s.rank] })));
  // (Houses on the site too: they stand until the hall or a wonder does.)
  const lots = draftLots({
    region: (p) => rhoOf(6, p) <= inner - 0.003,
    built: (p) => rhoOf(6, p) <= inner - 0.003,
    density,
    intensity: (p) => field.at(p),
    streets: clear,
    squares: sk.squares.filter((q) => q.paved),
    keepClear: spots,
    decor: [],
    seed: hashStr(`${sk.key}|${sk.role}|${density}`),
    frontage: (i) => i < streets.length,
  });
  // (Greens are kept clear of homes too.)
  const greens = sk.squares.filter((q) => !q.paved);
  const kept = lots.filter((l) => ON_GREENS.has(l.kind) || !greens.some((q) => pointInPoly(l, q.pts)));
  return {
    key: sk.key, role: sk.role, density, stubs: sk.stubs, streets, squares: sk.squares, site: sk.site, spots,
    lots: [...spots.map((sp, k) => spotHouse(sp, k, density)), ...kept], walls: walls.walls, gates: walls.gates,
  };
}

export type { Role, Rank, Skeleton };
