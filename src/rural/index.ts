// Rural drawings: what stands on a rural tile, drawn like the towns
// (src/town) but simpler. One set per kind of work, each with its own
// drawings for every edge class (town/edges.ts: the sides a track crosses)
// and density:
//   - tracks: from the stubs to the farmyard (one network);
//   - worked areas: fields, pits and heaps, or cut clearings, as polygons;
//     what an area looks like is the tile's (rural/look.ts: the improvement,
//     the biome; later the player's crop), never the drawing's;
//   - the homestead: houses and sheds fronting the tracks (lots, as in towns);
//   - one rural building spot (4 × 4 cells).
// Everything not drawn keeps the tile's own wild flora.
//
// A drawing is a pure function of its class, work, density and variant,
// unless drawn by hand (the rural editor, stored in drawings.json).

import { mulberry32, type Rng } from '../rng.ts';
import type { ImprovementKey } from '../cities.ts';
import {
  HALF_WIDTH, LOT_INNER, LOT_SIZE, SAFE_RHO, add, buildingSpot, distToLine, len, lerp, lotSamples, mul, pointInPoly, rhoOf, spotCorners, spotOutline, sub, isBuilding,
  LOT_KINDS, FLOORS, inSpot,
  type Floors, type Lot, type LotKind, type Pt, type Spot, type Street2,
} from '../town/geometry.ts';
import { parseKey, stubsOf, type Stub } from '../town/edges.ts';
import { streetPath } from '../town/index.ts';
import { LEAD } from '../town/skeleton.ts';
import { draftLots } from '../town/draft.ts';
import STORED from './drawings.json';

// ---------- what there is ----------

export const WORKS = ['cultivation', 'extraction', 'forest'] as const;
export type Work = (typeof WORKS)[number];
export const WORK_NAME: Record<Work, string> = { cultivation: 'cultivation (farms, paddies)', extraction: 'extraction (mines, quarries)', forest: 'forest (camps)' };
// Which work an improvement is (fishing boats: none, they stand on water).
export const WORK_OF: Record<ImprovementKey, Work | null> = {
  farm: 'cultivation', wetland: 'cultivation', mine: 'extraction', quarry: 'extraction', camp: 'forest', boats: null,
};
export const RURAL_DENSITIES = ['low', 'medium', 'high'] as const;
export type RuralDensity = (typeof RURAL_DENSITIES)[number];
export const RURAL_DENSITY_NAME: Record<RuralDensity, string> = { low: 'homestead', medium: 'hamlet', high: 'estate' };

// Tracks: unpaved, a lane's width.
export const TRACK = 'lane' as const;
export const TRACK_HALF = HALF_WIDTH[TRACK];
// Worked areas keep inside this share of the inradius (the rim stays wild,
// so neighboring tiles' fields never touch).
export const AREA_INNER = 0.94;

export interface Track { readonly pts: readonly Pt[]; readonly ends: readonly [number | null, number | null] }
export interface RuralDrawing {
  readonly key: string;
  readonly work: Work;
  readonly density: RuralDensity;
  readonly stubs: readonly Stub[];
  readonly tracks: readonly Track[];
  readonly areas: readonly (readonly Pt[])[];
  readonly lots: readonly Lot[];
  readonly spot: Spot;
}

// ---------- the draft ----------

const hashStr = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const norm = (p: Pt): Pt => { const l = len(p); return l > 1e-12 ? mul(p, 1 / l) : { x: 1, y: 0 }; };
const perp = (p: Pt): Pt => ({ x: -p.y, y: p.x });
const rot = (p: Pt, a: number): Pt => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

// How far the homestead reaches from the farmyard, by density (tile steps).
const HOMESTEAD: Record<RuralDensity, number> = { low: 0.075, medium: 0.13, high: 0.18 };
// The fewest houses a homestead has, by density.
const HOUSES: Record<RuralDensity, number> = { low: 1, medium: 3, high: 5 };
// How far the worked land reaches from the farmyard (fields: the whole tile when high).
const REACH: Record<Work, Record<RuralDensity, number>> = {
  cultivation: { low: 0.3, medium: 0.44, high: 1 },
  extraction: { low: 0.26, medium: 0.34, high: 0.44 },
  forest: { low: 0.28, medium: 0.36, high: 0.46 },
};

export const tracksAsStreets = (tracks: readonly Track[]): Street2[] => tracks.map((t) => ({ pts: t.pts, cls: TRACK }));

// (The farmyard, tracks, spot and field grid are the same at every density,
// so a farm keeps its layout as it grows: a density adds houses and reaches
// farther.)
export function draftRural(key: string, work: Work, density: RuralDensity, variant = 0): RuralDrawing {
  const rand = mulberry32(hashStr(`${key}|${work}|${variant}`));
  const stubs = stubsOf(parseKey(key));
  // The farmyard: near the middle, a little toward where the tracks come in.
  const pull = stubs.reduce((a, s) => add(a, s.p), { x: 0, y: 0 });
  const yard = add(mul(pull, stubs.length ? 0.22 / stubs.length : 0), { x: (rand() - 0.5) * 0.12, y: (rand() - 0.5) * 0.12 });
  // Tracks: each stub's straight in, then on to the farmyard.
  const ctrls: Pt[][] = stubs.map((s) => {
    const lead = add(s.p, mul(s.into, LEAD));
    const mid = add(lerp(lead, yard, 0.5), mul(perp(norm(sub(yard, lead))), (rand() - 0.5) * 0.08));
    return [s.p, mid, yard];
  });
  // (No track comes in: a lane from the farmyard out to the fields.)
  if (!stubs.length) {
    const a = rand() * Math.PI * 2, out = { x: Math.cos(a), y: Math.sin(a) };
    ctrls.push([yard, add(yard, mul(out, 0.14)), add(yard, mul(rot(out, 0.3), 0.3))]);
  }
  const tracks: Track[] = ctrls.map((c) => streetPath(c, stubs));
  const streets = tracksAsStreets(tracks);
  const spot = placeSpot(tracks, yard, rand);
  // The homestead: houses and sheds fronting the tracks round the farmyard.
  // (At least HOUSES of them: the homestead reaches farther until it has them.)
  let lots: Lot[] = [];
  for (let grow = 1, n = 0; n < 6; n++, grow *= 1.3) {
    const R = HOMESTEAD[density] * (work === 'cultivation' ? 1 : 0.8) * grow;
    lots = draftLots({
      region: (p) => rhoOf(6, p) <= LOT_INNER - 0.003,
      built: (p) => rhoOf(6, p) <= SAFE_RHO,
      density: 'low',
      intensity: (p) => Math.exp(-((len(sub(p, yard)) / R) ** 2)),
      streets,
      squares: [],
      keepClear: [spot],
      decor: [],
      seed: hashStr(`${key}|${work}|${density}|lots|${n}`),
    });
    if (lots.filter((l) => isBuilding(l.kind)).length >= HOUSES[density]) break;
  }
  const landRand = mulberry32(hashStr(`${key}|${work}|${variant}|land`));
  const areas = work === 'cultivation' ? fields(tracks, lots, spot, yard, REACH[work][density], landRand)
    : blobs(tracks, lots, spot, yard, REACH[work][density], work === 'extraction' ? { low: 2, medium: 3, high: 5 }[density] : { low: 2, medium: 3, high: 4 }[density], work === 'extraction' ? [0.035, 0.06] : [0.05, 0.085], landRand);
  return { key, work, density, stubs, tracks, areas, lots, spot };
}

// The rural building spot: beside a track near the farmyard, facing it.
function placeSpot(tracks: readonly Track[], yard: Pt, rand: Rng): Spot {
  const half = buildingSpot(0, 0, 0).hw!;
  let best: Spot | null = null, bs = Infinity;
  for (const t of tracks) {
    for (let i = 1; i + 1 < t.pts.length; i++) {
      const p = t.pts[i]!, dir = norm(sub(t.pts[i + 1]!, t.pts[i - 1]!));
      for (const sg of [1, -1]) {
        const c = add(p, mul(perp(dir), sg * (half + TRACK_HALF + 0.006)));
        const sp = buildingSpot(c.x, c.y, Math.atan2(p.y - c.y, p.x - c.x));
        if (!spotCorners(sp).every((q) => rhoOf(6, q) <= SAFE_RHO)) continue;
        if (tracks.some((o) => spotOutline(sp).some((q) => distToLine(q, o.pts) < TRACK_HALF + 0.002) || o.pts.some((q) => inSpot(q, sp)))) continue;
        const s = len(sub(c, yard)) + 0.02 * rand();
        if (s < bs) { bs = s; best = sp; }
      }
    }
  }
  return best ?? buildingSpot(yard.x + 0.08, yard.y, Math.PI);
}

// What an area must keep clear of: the tracks (with a verge), the lots, the spot.
function clearOf(poly: readonly Pt[], tracks: readonly Track[], lots: readonly Lot[], spot: Spot, others: readonly (readonly Pt[])[]): boolean {
  const pts = [...poly, ...poly.map((p, i) => lerp(p, poly[(i + 1) % poly.length]!, 0.5)), poly.reduce((a, p) => add(a, mul(p, 1 / poly.length)), { x: 0, y: 0 })];
  if (!pts.every((p) => rhoOf(6, p) <= AREA_INNER)) return false;
  if (tracks.some((t) => pts.some((p) => distToLine(p, t.pts) < TRACK_HALF + 0.005) || t.pts.some((q) => pointInPoly(q, poly)))) return false;
  if (pts.some((p) => inSpot(p, spot, 0.005)) || spotCorners(spot).some((q) => pointInPoly(q, poly))) return false;
  for (const l of lots) {
    const ls = lotSamples(l);
    if (ls.some((q) => pointInPoly(q, poly)) || pts.some((p) => inLot(p, l, 0.004))) return false;
  }
  return !others.some((o) => polysOverlap(o, poly));
}
export function inLot(p: Pt, l: Lot, m = 0): boolean {
  const [hw, hd] = LOT_SIZE[l.kind], f = { x: Math.cos(l.yaw), y: Math.sin(l.yaw) }, d = sub(p, l);
  return Math.abs(d.x * -f.y + d.y * f.x) < hw + m && Math.abs(d.x * f.x + d.y * f.y) < hd + m;
}
// Whether two simple polygons overlap (a vertex inside the other, or edges crossing).
export function polysOverlap(a: readonly Pt[], b: readonly Pt[]): boolean {
  if (a.some((p) => pointInPoly(p, b)) || b.some((p) => pointInPoly(p, a))) return true;
  const cross = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i]!, q = a[(i + 1) % a.length]!, r = b[j]!, s = b[(j + 1) % b.length]!;
    if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true;
  }
  return false;
}

// Fields: a patchwork of parcels turned along the main track, each a strip
// or a block, a hedge's gap between them, out as far as the farm reaches
// (the far ones first dropped, so the farm thins away from its yard).
function fields(tracks: readonly Track[], lots: readonly Lot[], spot: Spot, yard: Pt, reach: number, rand: Rng): Pt[][] {
  // (Along the longest track's middle stretch.)
  const main = [...tracks].sort((a, b) => b.pts.length - a.pts.length)[0];
  const k = main ? Math.floor(main.pts.length / 2) : 0;
  const ang = main && main.pts.length > 2 ? Math.atan2(main.pts[k + 1]!.y - main.pts[k - 1]!.y, main.pts[k + 1]!.x - main.pts[k - 1]!.x) : rand() * Math.PI;
  const W = 0.17 + 0.05 * rand(), D = 0.095 + 0.025 * rand(), GAP = 0.006;
  const out: Pt[][] = [];
  // (Every random draw is made here, whatever the reach, so the grid is the same at every density.)
  const cells: { c: Pt; w: number; d: number; keep: number; meadow: number }[] = [];
  for (let j = -6; j <= 6; j++) {
    const shift = rand() * W;
    for (let i = -4; i <= 4; i++) {
      const c = add(yard, rot({ x: i * W + shift, y: j * D }, ang));
      // Some blocks are split into strips (lengthwise).
      if (rand() < 0.35) for (const s of [-0.25, 0.25]) cells.push({ c: add(c, rot({ x: 0, y: s * D }, ang)), w: W, d: D / 2, keep: rand(), meadow: rand() });
      else cells.push({ c, w: W, d: D, keep: rand(), meadow: rand() });
    }
  }
  // Nearest the farmyard first.
  cells.sort((a, b) => len(sub(a.c, yard)) - len(sub(b.c, yard)));
  for (const cell of cells) {
    const r = len(sub(cell.c, yard));
    if (r > reach || (r > reach * 0.7 && cell.keep < 0.35) || cell.meadow < 0.06) continue; // (a meadow here and there)
    for (const w of [cell.w, cell.w * 0.66, cell.w / 2, cell.w / 3]) {
      const hw = w / 2 - GAP, hd = cell.d / 2 - GAP;
      const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(cell.c, rot({ x: a! * hw, y: b! * hd }, ang)));
      if (clearOf(poly, tracks, lots, spot, out)) { out.push(poly); break; }
    }
  }
  return out;
}

// Pits and heaps, or cut clearings: a few round, uneven patches beside the
// tracks, nearest the farmyard first.
function blobs(tracks: readonly Track[], lots: readonly Lot[], spot: Spot, yard: Pt, reach: number, n: number, size: readonly [number, number], rand: Rng): Pt[][] {
  const out: Pt[][] = [];
  const cands: Pt[] = [];
  for (const t of tracks) for (let i = 1; i + 1 < t.pts.length; i += 2) {
    const p = t.pts[i]!, dir = norm(sub(t.pts[i + 1]!, t.pts[i - 1]!));
    for (const sg of [1, -1]) cands.push(add(p, mul(perp(dir), sg * (size[1] + TRACK_HALF + 0.015))));
  }
  for (let a = 0; a < 24; a++) cands.push(add(yard, { x: Math.cos(a) * reach * 0.7, y: Math.sin(a) * reach * 0.7 }));
  cands.sort((a, b) => len(sub(a, yard)) - len(sub(b, yard)) + (rand() - 0.5) * 0.1);
  for (const c of cands) {
    if (out.length >= n) break;
    if (len(sub(c, yard)) > reach) continue;
    const r = size[0] + (size[1] - size[0]) * rand(), m = 9, ph = rand() * 6.28;
    const poly = Array.from({ length: m }, (_, i) => {
      const a = (i / m) * Math.PI * 2, rr = r * (1 + 0.22 * Math.sin(2 * a + ph) + 0.12 * Math.sin(3 * a + 2 * ph));
      return add(c, { x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    });
    if (clearOf(poly, tracks, lots, spot, out)) out.push(poly);
  }
  return out;
}

// ---------- drawings by hand (the rural editor; stored in drawings.json) ----------

type XY = [number, number];
export interface RuralRecord {
  tracks: { ctrl: XY[] }[];
  areas: XY[][];
  lots: (string | number)[][];   // kind, x, y, yaw[, floors]
  spot: [number, number, number]; // x, y, yaw
}
const records: Record<string, RuralRecord> = { ...(STORED as Record<string, RuralRecord>) };
// Stored as `class|work|density|variant` (variants from 1).
export const ruralKey = (key: string, work: Work, density: RuralDensity, variant: number) => `${key}|${work}|${density}|${variant}`;
export const storedRural = (k: string): RuralRecord | null => records[k] ?? null;
export const allRural = (): Record<string, RuralRecord> => records;
export function setRural(k: string, rec: RuralRecord | null): void {
  if (rec) records[k] = rec; else delete records[k];
  drawings.delete(k);
}
export function ruralVariants(key: string, work: Work, density: RuralDensity): number[] {
  const head = `${key}|${work}|${density}|`;
  return Object.keys(records).filter((k) => k.startsWith(head)).map((k) => Number(k.slice(head.length))).filter((n) => n > 0).sort((a, b) => a - b);
}

const DEG = Math.PI / 180;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const xy = (p: Pt): XY => [r4(p.x), r4(p.y)];

export function ruralFromRecord(key: string, work: Work, density: RuralDensity, r: RuralRecord): RuralDrawing {
  const stubs = stubsOf(parseKey(key));
  const lots: Lot[] = r.lots.flatMap((row) => {
    const [kind, x, y, yaw, floors] = row as [string, number, number, number, number?];
    if (!(LOT_KINDS as readonly string[]).includes(kind)) return [];
    const f = isBuilding(kind as LotKind) && (FLOORS as readonly number[]).includes(floors ?? 1) ? { floors: (floors ?? 1) as Floors } : {};
    return [{ kind: kind as LotKind, x, y, yaw: yaw * DEG, ...f }];
  });
  return {
    key, work, density, stubs,
    tracks: r.tracks.filter((t) => t.ctrl.length >= 2).map((t) => streetPath(t.ctrl.map(([x, y]) => ({ x, y })), stubs)),
    areas: r.areas.filter((a) => a.length >= 3).map((a) => a.map(([x, y]) => ({ x, y }))),
    lots, spot: buildingSpot(r.spot[0], r.spot[1], r.spot[2] * DEG),
  };
}
export function ruralToRecord(d: RuralDrawing, ctrlOf: (t: Track) => readonly Pt[]): RuralRecord {
  return {
    tracks: d.tracks.map((t) => ({ ctrl: ctrlOf(t).map(xy) })),
    areas: d.areas.map((a) => a.map(xy)),
    lots: d.lots.map((l) => [l.kind, r4(l.x), r4(l.y), Math.round(l.yaw / DEG), ...(isBuilding(l.kind) ? [l.floors ?? 1] : [])]),
    spot: [r4(d.spot.x), r4(d.spot.y), Math.round(d.spot.yaw / DEG)],
  };
}

const drawings = new Map<string, RuralDrawing>();
// A drawing: by hand (variant n), or the generated draft (variant 0, or one not drawn).
export function ruralDrawing(key: string, work: Work, density: RuralDensity, variant = 0): RuralDrawing {
  const k = ruralKey(key, work, density, variant);
  let d = drawings.get(k);
  if (!d) {
    const rec = variant > 0 ? records[k] : undefined;
    d = rec ? ruralFromRecord(key, work, density, rec) : draftRural(key, work, density);
    drawings.set(k, d);
  }
  return d;
}
// The drawing a tile shows: one of the variants by hand (by the tile's hash), or the draft.
export function pickRural(key: string, work: Work, density: RuralDensity, hash: number): RuralDrawing {
  const vs = ruralVariants(key, work, density);
  return ruralDrawing(key, work, density, vs.length ? vs[hash % vs.length]! : 0);
}
