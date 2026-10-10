// Laying the drawings (cityDesigns.ts) onto real tiles. A tile is any
// polygon with a center and k corners; a point of it is given as fan
// coordinates (fan i = the triangle center, corner i, corner i+1, and the
// weights toward those corners), the same coordinates the terrain uses, so
// the result can be placed on the globe (render.ts) or on a plane (the
// design sheet). Pure: no game, no rendering.
//
// A core point goes through its drawing's rotation. A strip point is
// placed by its distance from the edge and its position along it, on
// whichever side of the edge it lies: the two tiles agree exactly on the
// edge, so streets run straight across.

import {
  INR, RC, WALL_AT, connection, densify, sideLength, stripDepth, toFan,
  type Across, type Design, type LotKind, type Pt, type Sides, type StreetClass,
} from './cityDesigns.ts';

export interface FanPt { t: number; i: number; wa: number; wb: number }

// A built-up tile to stamp.
export interface StampTile {
  tile: number;
  sides: Sides;
  design: Design;
  rot: number;              // design side j lies on tile side (j + rot) % k
  walled: boolean;          // walls around its core (the center)
  // Per tile side: who is across it.
  across: { tile: number; back: number; kind: 'town' | 'land' | 'water' }[];
}

export interface StampedLot {
  tile: number;      // the tile it stands on (as drawn: its core or its half of a strip)
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
  middles: StampedSpot[];
  streets: StampedStreet[];
  squares: StampedSquare[];
  walls: StampedWall[];
}

const FACE = 0.01; // how far ahead the facing point is (tile steps)
const STEP = 0.02; // street points every this far

export function coreToFan(s: StampTile, p: Pt): FanPt {
  const f = toFan(s.sides, p);
  return { t: s.tile, i: (f.j + s.rot) % s.sides, wa: f.wa, wb: f.wb };
}

// A strip point (x along the edge, y across: negative on A's side) on
// tile A (side ia) or tile B (side ib).
export function stripToFan(a: StampTile, ia: number, b: { tile: number; sides: Sides; back: number } | null, p: Pt, side?: -1 | 1): FanPt {
  const onA = side ? side < 0 : p.y <= 0 || !b;
  if (onA) {
    const rho = 1 + p.y / INR[a.sides];
    const u = 0.5 + p.x / (sideLength(a.sides) * rho);
    return { t: a.tile, i: ia, wa: rho * (1 - u), wb: rho * u };
  }
  const rho = 1 - p.y / INR[b!.sides];
  const u = 0.5 - p.x / (sideLength(b!.sides) * rho);
  return { t: b!.tile, i: b!.back, wa: rho * (1 - u), wb: rho * u };
}

const hashInts = (...xs: number[]) => { let h = 2166136261; for (const x of xs) h = Math.imul(h ^ (x | 0), 16777619); return h >>> 0; };

// Stamps a set of built-up tiles (one or several cities): their cores,
// and every edge's strip once (shared edges between two of them, the
// outskirts toward everything else).
export function stamp(tiles: readonly StampTile[]): Stamp {
  const out: Stamp = { lots: [], spots: [], halls: [], middles: [], streets: [], squares: [], walls: [] };
  const byTile = new Map(tiles.map((s) => [s.tile, s]));
  for (const s of tiles) {
    const core = (p: Pt) => coreToFan(s, p);
    const ahead = (p: Pt, yaw: number) => core({ x: p.x + FACE * Math.cos(yaw), y: p.y + FACE * Math.sin(yaw) });
    const d = s.design;
    d.lots.forEach((l, n) => {
      const lot: StampedLot = { tile: s.tile, at: core(l), face: ahead(l, l.yaw), kind: l.kind, seed: hashInts(s.tile, n, 1) };
      if (l.spot !== undefined) lot.spot = l.spot;
      out.lots.push(lot);
    });
    d.spots.forEach((sp, k) => out.spots.push({ tile: s.tile, k, at: core(sp), face: ahead(sp, sp.yaw), r: sp.r }));
    if (d.hall) out.halls.push({ tile: s.tile, k: -1, at: core(d.hall), face: ahead(d.hall, d.hall.yaw), r: d.hall.r });
    if (d.middle) out.middles.push({ tile: s.tile, k: -1, at: core(d.middle), face: ahead(d.middle, d.middle.yaw), r: d.middle.r });
    for (const st of d.streets) out.streets.push({ tile: s.tile, pts: densify(st.pts, STEP).map(core), cls: st.cls });
    for (const q of d.squares) out.squares.push({ tile: s.tile, pts: q.pts.map(core), paved: q.paved });
    if (s.walled) out.walls.push(...wallRuns(s));

    // Strips: each shared edge once (from the tile whose drawing comes
    // first), every other edge from this tile.
    for (let i = 0; i < s.sides; i++) {
      const x = s.across[i]!;
      const nb = x.kind === 'town' ? byTile.get(x.tile) : undefined;
      let A = s, ia = i, B: StampTile | null = null, ib = -1, far: Across = x.kind === 'water' ? 'water' : 'land';
      if (nb) {
        const first = s.design.id < nb.design.id || (s.design.id === nb.design.id && s.tile < nb.tile);
        if (!first) continue;
        B = nb; ib = x.back; far = nb.design;
      }
      const strip = connection(A.design, far, { wallA: A.walled, wallB: B?.walled ?? false });
      const bInfo = B ? { tile: B.tile, sides: B.sides, back: ib } : null;
      const place = (p: Pt, side?: -1 | 1) => stripToFan(A, ia, bInfo, p, side);
      strip.lots.forEach((l, n) => {
        const side: -1 | 1 = l.y <= 0 || !B ? -1 : 1;
        const at = place(l, side);
        out.lots.push({
          tile: at.t, at, kind: l.kind, seed: hashInts(A.tile, ia, n, 2),
          face: place({ x: l.x + FACE * Math.cos(l.yaw), y: l.y + FACE * Math.sin(l.yaw) }, side),
        });
      });
      for (const st of strip.streets) {
        // Split where a street crosses the edge, so each part lies on one tile.
        const pts = densify(st.pts, STEP);
        const negative = pts.filter((p) => p.y <= 0), positive = pts.filter((p) => p.y >= 0);
        if (negative.length > 1) out.streets.push({ tile: A.tile, pts: negative.map((p) => place(p, -1)), cls: st.cls });
        if (B && positive.length > 1) out.streets.push({ tile: B.tile, pts: positive.map((p) => place(p, 1)), cls: st.cls });
      }
    }
  }
  return out;
}

// Walls just outside the core, all the way round, with a gate where each
// port street passes (the middle of every side).
const GATE = 0.03; // half width of a gate (tile steps)
function wallRuns(s: StampTile): StampedWall[] {
  const k = s.sides, out: StampedWall[] = [];
  const rho = RC + WALL_AT / INR[k];
  const L = sideLength(k) * rho;
  const g = GATE / L;
  // From the middle of side i (after its gate) round to the middle of side i+1 (before its gate).
  for (let i = 0; i < k; i++) {
    const pts: FanPt[] = [];
    for (const u of [0.5 + g, 0.75, 1]) pts.push({ t: s.tile, i, wa: rho * (1 - u), wb: rho * u });
    const j = (i + 1) % k;
    for (const u of [0.25, 0.5 - g]) pts.push({ t: s.tile, i: j, wa: rho * (1 - u), wb: rho * u });
    out.push({ tile: s.tile, pts });
  }
  return out;
}

export { stripDepth };
