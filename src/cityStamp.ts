// Laying the town drawings (src/town) onto real tiles. A tile is any hex
// with a center and 6 corners; a point of it is given as fan coordinates
// (fan i = the triangle center, corner i, corner i+1, and the weights
// toward those corners), the same coordinates the terrain uses, so the
// result can be placed on the globe (render.ts) or on a plane (the design
// sheet). Pure: no game, no rendering.
//
// Each tile shows the drawing of its colouring's class (town/edges.ts),
// turned and mirrored into place. Its streets end exactly at the stubs of
// its sides, where the neighbor's streets end too.

import { HALF_WIDTH, densify, lotOnSpot, toFan, len, sub, type Density, type Floors, type LotKind, type Pt, type Spot, type StreetClass } from './town/geometry.ts';
import { classOf, turnPoint, sideUnder, type EdgeValue, type Turn } from './town/edges.ts';
import { pickDrawing, type Drawing, type Role } from './town/index.ts';
import { EDGE_BLEND } from './town/skeleton.ts';
import { wallRuns } from './town/walls.ts';

export interface FanPt { t: number; i: number; wa: number; wb: number }

// A built-up tile to stamp.
export interface StampTile {
  tile: number;
  colouring: readonly EdgeValue[];          // per tile side
  edgeCls: readonly (StreetClass | null)[]; // per tile side: how wide its streets are where they cross it
  role: Role;
  density: Density;
  pick?: number;                            // which of the hand-drawn variants (a hash; default 0)
  drawing?: Drawing;                        // this one instead (the editor; drawn for the colouring's class)
}

export interface StampedLot {
  tile: number;      // the tile it stands on
  at: FanPt;
  face: FanPt;       // a point a little in front of it (which way it faces)
  kind: LotKind;
  floors?: Floors;   // buildings
  spot?: number;     // the building spot it gives way to
  onSite?: true;     // it reaches onto the tile's site (gives way to the hall or a wonder)
  seed: number;      // stable per lot, for its look
}
// A spot or a site: its middle, facing point, radius and square (half width, half depth); its tile's density.
export interface StampedSpot { tile: number; k: number; at: FanPt; face: FanPt; r: number; hw: number; hd: number; density: Density }
export interface StampedStreet { tile: number; pts: FanPt[]; hw: number[] } // half widths (tile steps), per point
export interface StampedSquare { tile: number; pts: FanPt[]; paved: boolean }
export interface StampedWall { tile: number; pts: FanPt[]; towers: boolean[] } // a run of wall (gates between runs), towers where true

export interface Stamp {
  lots: StampedLot[];
  spots: StampedSpot[];
  sites: StampedSpot[];
  streets: StampedStreet[];
  squares: StampedSquare[];
  walls: StampedWall[];
}

const FACE = 0.01; // how far ahead the facing point is (tile steps)
export const STAMP_STEP = 0.02; // street points every this far (tile steps, as drawn)

const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hashInts = (...xs: number[]) => { let h = 2166136261; for (const x of xs) h = Math.imul(h ^ (x | 0), 16777619); return h >>> 0; };

// The drawing a tile shows, and the turn that lays it in place.
export function drawingOf(s: StampTile): { drawing: Drawing; turn: Turn } {
  const { key, turn } = classOf(s.colouring);
  return { drawing: s.drawing ?? pickDrawing(key, s.role, s.density, s.pick ?? 0), turn };
}

export function toTile(tile: number, turn: Turn, p: Pt): FanPt {
  const f = toFan(6, turnPoint(turn, p));
  return { t: tile, i: f.j, wa: f.wa, wb: f.wb };
}

export function stamp(tiles: readonly StampTile[]): Stamp {
  const out: Stamp = { lots: [], spots: [], sites: [], streets: [], squares: [], walls: [] };
  for (const s of tiles) {
    const { drawing: d, turn } = drawingOf(s);
    const at = (p: Pt) => toTile(s.tile, turn, p);
    const ahead = (p: Pt, yaw: number) => at({ x: p.x + FACE * Math.cos(yaw), y: p.y + FACE * Math.sin(yaw) });
    d.lots.forEach((l, n) => {
      const lot: StampedLot = { tile: s.tile, at: at(l), face: ahead(l, l.yaw), kind: l.kind, seed: hashInts(s.tile, n, 1) };
      if (l.spot !== undefined) lot.spot = l.spot;
      if (l.floors !== undefined) lot.floors = l.floors;
      if (l.spot === undefined && lotOnSpot(l, d.site)) lot.onSite = true;
      out.lots.push(lot);
    });
    const spot = (sp: Spot, k: number): StampedSpot =>
      ({ tile: s.tile, k, at: at(sp), face: ahead(sp, sp.yaw), r: sp.r, hw: sp.hw ?? sp.r, hd: sp.hd ?? sp.r, density: s.density });
    d.spots.forEach((sp, k) => out.spots.push(spot(sp, k)));
    out.sites.push(spot(d.site, -1));
    for (const st of d.streets) {
      const pts = densify(st.pts, STAMP_STEP);
      const own = HALF_WIDTH[st.cls];
      // Near a stub, as wide as the edge it crosses (both tiles agree there).
      const hw = pts.map((p) => {
        let w = own;
        for (const e of st.ends) {
          if (e === null) continue;
          const stub = d.stubs[e]!, cls = s.edgeCls[sideUnder(turn, stub.side)];
          if (!cls) continue;
          const f = smoothstep(0, EDGE_BLEND, len(sub(p, stub.p)));
          w = HALF_WIDTH[cls] + (w - HALF_WIDTH[cls]) * f;
        }
        return w;
      });
      out.streets.push({ tile: s.tile, pts: pts.map(at), hw });
    }
    for (const q of d.squares) out.squares.push({ tile: s.tile, pts: q.pts.map(at), paved: q.paved });
    for (const r of wallRuns(d)) out.walls.push({ tile: s.tile, pts: r.pts.map(at), towers: [...r.towers] });
  }
  return out;
}
