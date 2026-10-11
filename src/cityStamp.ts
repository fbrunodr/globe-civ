// Laying the town drawings (src/town) onto real tiles. A tile is any
// polygon with a center and k corners; a point of it is given as fan
// coordinates (fan i = the triangle center, corner i, corner i+1, and the
// weights toward those corners), the same coordinates the terrain uses, so
// the result can be placed on the globe (render.ts) or on a plane (the
// design sheet). Pure: no game, no rendering.
//
// A middle's points go through its rotation. A strip's points are placed
// by their share of the way along the edge and their distance from it, on
// whichever side of the edge they lie, so the two tiles agree exactly on
// the edge and streets run straight across.

import { RC, INR, densify, sideLength, stripToRhoU, toFan, type LotKind, type Pt, type Sides, type StreetClass } from './town/geometry.ts';
import { STUBS, borderType, shapeOfType, type Far } from './town/borders.ts';
import { stripFor, type Middle } from './town/index.ts';

export interface FanPt { t: number; i: number; wa: number; wb: number }

// A built-up tile to stamp.
export interface StampTile {
  tile: number;
  sides: Sides;
  middle: Middle;
  rot: number;              // drawing side j lies on tile side (j + rot) % k
  walled: boolean;          // walls around its middle (the center)
  // Per tile side: who is across it.
  across: { tile: number; back: number; kind: 'town' | 'land' | 'water' }[];
}

export interface StampedLot {
  tile: number;      // the tile it stands on
  at: FanPt;
  face: FanPt;       // a point a little in front of it (which way it faces)
  kind: LotKind;
  spot?: number;     // the building spot it gives way to
  seed: number;      // stable per lot, for its look
}
export interface StampedSpot { tile: number; k: number; at: FanPt; face: FanPt; r: number }
export interface StampedStreet { tile: number; pts: FanPt[]; cls: StreetClass }
export interface StampedSquare { tile: number; pts: FanPt[]; paved: boolean }
export interface StampedWall { tile: number; pts: FanPt[] } // a run of wall (gates between runs)

export interface Stamp {
  lots: StampedLot[];
  spots: StampedSpot[];
  halls: StampedSpot[];
  wonders: StampedSpot[];
  streets: StampedStreet[];
  squares: StampedSquare[];
  walls: StampedWall[];
  missing: string[]; // strips not drawn yet (should stay empty)
}

const FACE = 0.01; // how far ahead the facing point is (tile steps)
export const STAMP_STEP = 0.02; // street points every this far (tile steps, as drawn)
const STEP = STAMP_STEP;
// Walls stand this far outside the middle (strips keep their lots clear of it).
export const WALL_AT = 0.012;

export function coreToFan(s: StampTile, p: Pt): FanPt {
  const f = toFan(s.sides, p);
  return { t: s.tile, i: (f.j + s.rot) % s.sides, wa: f.wa, wb: f.wb };
}

// The tile side a drawing side lies on, and back.
export const tileSide = (s: StampTile, j: number) => (j + s.rot) % s.sides;
export const drawingSide = (s: StampTile, i: number) => (i - s.rot + s.sides) % s.sides;
export const typeOnSide = (s: StampTile, i: number) => borderType(s.middle.density, s.middle.borders[drawingSide(s, i)]!);

// A strip point on tile A (side ia) or across the edge on tile B (side ib).
export function stripToFan(a: number, ia: number, b: { tile: number; back: number } | null, p: Pt, side?: -1 | 1): FanPt {
  const { rho, u } = stripToRhoU(p);
  const onA = side ? side < 0 : p.y <= 0 || !b;
  if (onA) return { t: a, i: ia, wa: rho * (1 - u), wb: rho * u };
  // B's side runs the other way along the edge.
  return { t: b!.tile, i: b!.back, wa: rho * u, wb: rho * (1 - u) };
}

// The turn of a middle that best suits its neighbors: open sides toward
// the town's other tiles, closed sides toward open land and water (ties by
// the hash h).
export function bestTurn(m: Middle, k: Sides, across: readonly { kind: 'town' | 'land' | 'water' }[], h: number): number {
  let best = 0, bestScore = -Infinity;
  for (let r = 0; r < k; r++) {
    const probe: StampTile = { tile: 0, sides: k, middle: m, rot: r, walled: false, across: [] };
    let score = 0;
    for (let i = 0; i < k; i++) {
      const closed = shapeOfType(typeOnSide(probe, i)) === 'closed';
      score += across[i]!.kind === 'town' ? (closed ? 0 : 1) : closed ? 1 : 0;
    }
    score += (((h + r * 2654435761) >>> 0) % 1000) / 10000; // ties
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

const hashInts = (...xs: number[]) => { let h = 2166136261; for (const x of xs) h = Math.imul(h ^ (x | 0), 16777619); return h >>> 0; };

// Stamps a set of built-up tiles (one city, or several): their middles,
// and every edge's strip once (between two of them: the strip for their
// two border types; toward everything else: the outskirts or waterfront).
export function stamp(tiles: readonly StampTile[]): Stamp {
  const out: Stamp = { lots: [], spots: [], halls: [], wonders: [], streets: [], squares: [], walls: [], missing: [] };
  const byTile = new Map(tiles.map((s) => [s.tile, s]));
  for (const s of tiles) {
    const core = (p: Pt) => coreToFan(s, p);
    const ahead = (p: Pt, yaw: number) => core({ x: p.x + FACE * Math.cos(yaw), y: p.y + FACE * Math.sin(yaw) });
    const m = s.middle;
    m.lots.forEach((l, n) => {
      const lot: StampedLot = { tile: s.tile, at: core(l), face: ahead(l, l.yaw), kind: l.kind, seed: hashInts(s.tile, n, 1) };
      if (l.spot !== undefined) lot.spot = l.spot;
      out.lots.push(lot);
    });
    m.spots.forEach((sp, k) => out.spots.push({ tile: s.tile, k, at: core(sp), face: ahead(sp, sp.yaw), r: sp.r }));
    if (m.hall) out.halls.push({ tile: s.tile, k: -1, at: core(m.hall), face: ahead(m.hall, m.hall.yaw), r: m.hall.r });
    if (m.wonder) out.wonders.push({ tile: s.tile, k: -1, at: core(m.wonder), face: ahead(m.wonder, m.wonder.yaw), r: m.wonder.r });
    for (const st of m.streets) out.streets.push({ tile: s.tile, pts: densify(st.pts, STEP).map(core), cls: st.cls });
    for (const q of m.squares) out.squares.push({ tile: s.tile, pts: q.pts.map(core), paved: q.paved });
    if (s.walled) out.walls.push(...wallRuns(s));

    for (let i = 0; i < s.sides; i++) {
      const x = s.across[i]!;
      const nb = x.kind === 'town' ? byTile.get(x.tile) : undefined;
      // A shared edge is stamped once, from the lower tile id.
      if (nb && nb.tile < s.tile) continue;
      const far: Far = nb ? typeOnSide(nb, x.back) : x.kind === 'water' ? 'water' : 'land';
      const strip = stripFor(typeOnSide(s, i), far);
      if (!strip) { out.missing.push(`${typeOnSide(s, i)}|${far}`); continue; }
      const b = nb ? { tile: nb.tile, back: x.back } : null;
      const place = (p: Pt, side?: -1 | 1) => stripToFan(s.tile, i, b, p, side);
      strip.lots.forEach((l, n) => {
        const side: -1 | 1 = l.y <= 0 || !b ? -1 : 1;
        const at = place(l, side);
        out.lots.push({
          tile: at.t, at, kind: l.kind, seed: hashInts(s.tile, i, n, 2),
          face: place({ x: l.x + FACE * Math.cos(l.yaw), y: l.y + FACE * Math.sin(l.yaw) }, side),
        });
      });
      // Whole streets: each point on the side of the edge it lies on.
      for (const st of strip.streets) {
        out.streets.push({ tile: s.tile, pts: densify(st.pts, STEP).map((p) => place(p, p.y <= 0 || !b ? -1 : 1)), cls: st.cls });
      }
      for (const q of strip.squares) {
        const side: -1 | 1 = q.pts.reduce((a, p) => a + p.y, 0) <= 0 || !b ? -1 : 1;
        out.squares.push({ tile: side < 0 ? s.tile : b!.tile, pts: q.pts.map((p) => place(p, side)), paved: q.paved });
      }
    }
  }
  return out;
}

// Walls just outside the middle, all the way round, with a gate wherever a
// street leaves the middle (closed sides have none).
const GATE = 0.048; // half width of a gate (tile steps): the widest street and a tower beside it
function wallRuns(s: StampTile): StampedWall[] {
  const k = s.sides;
  const rho = RC + WALL_AT / INR[6];
  const L = sideLength(k) * rho;
  // Around the tile: each side's gates as (from, to) shares; walls between.
  const pts: FanPt[][] = [];
  let run: FanPt[] = [];
  const at = (i: number, u: number): FanPt => ({ t: s.tile, i, wa: rho * (1 - u), wb: rho * u });
  for (let i = 0; i < k; i++) {
    const gates = STUBS[s.middle.borders[drawingSide(s, i)]!].map((u) => [u - GATE / L, u + GATE / L] as const);
    let u = 0;
    for (const [g0, g1] of gates) {
      run.push(at(i, u), at(i, (u + g0) / 2), at(i, g0));
      pts.push(run);
      run = [];
      u = g1;
    }
    run.push(at(i, u), at(i, (u + 1) / 2));
  }
  // The last run joins the first round the corner.
  if (pts.length) pts[0] = [...run, ...pts[0]!];
  else pts.push([...run, run[0]!]);
  return pts.map((p) => ({ tile: s.tile, pts: p }));
}
