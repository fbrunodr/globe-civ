// What stands on a city's tiles. A city is painted on its center tile
// (cityPainter.ts, dressed by cityDress.ts): its houses, skyscrapers and
// wonders, the roads between them, its walls, laid evenly on the tile
// (onTile). Its other tiles show what is worked there.
//
// Nothing is built on water or right beside it.
//
// Rural land tiles have their ground painted by the terrain shader (plots,
// spoil, pits, clearings); on it a homestead and a few yards
// (farmPainter.ts) holding what the tile grows or digs (rural/look.ts). Fishing boats stay on their water tiles. Everything is a pure function of
// the city's state and the seed, so a reload looks identical.

import * as THREE from 'three';
import type { Game, City } from './game.ts';
import { USE, BORDER_MAX, wonderBeside, isWonderKey, type ImprovementKey, type EraIndex } from './cities.ts';
import { ROOFS, buildingEntry, isFloraModel, isLotModel, placedGeometry, waterRule, type BuildingKind, type LotModelKind, type PlacedKind } from './buildingCatalog.ts';
import { CLEARANCE, ON_BARE_GROUND, ON_SUMMIT, groundsBox, isWonderModelKind, landHalf, seaScale, siteModelOf, wonderGrounds, wonderModelKind, wonderPieces, type SiteModel, type WonderGrounds, type WonderModelKind } from './wonderModels.ts';
import { ROUND_SIDES } from './wonders/kit.ts';
import type { TerrainHole } from './terrainMaterial.ts';
import { CATALOG, type CatalogKind } from './propCatalog.ts';
import { WORKS_VARIANT, houseKind } from './houses.ts';
import { styleOf } from './architecture.ts';
import { LOT_SIZE, rhoOf, type Floors, type Footprint } from './town/geometry.ts';
import { planRoads, roadLines, ROAD_HALF_WIDTH } from './roads.ts';
import { farmAxis, WORK_OF, type RuralDensity } from './farmPainter.ts';
import { SCATTER_GAP, areaLook, cropRegion, scatterIn, type RGB } from './rural/look.ts';
import { ruralModelKind, footingOf, isFloraRural, type RuralModel } from './rural/models.ts';
import { stageLook, waterLook } from './rural/stages.ts';
import { kitBoost, isWorks, FIGURES, type KitModel } from './rural/kit.ts';
import { FENCE_BANDS } from './propMaterial.ts';
import { CREATURE_SCALE } from './creatures.ts';
import { planFarm, layoutRural, largestRect, HOMESTEAD_SCALE, HOMESTEAD_LOT, PADDY_DEPTH, type FieldRect, type RuralInput, type RuralSite } from './rural/layout.ts';
import { RESOURCE_IMPROVEMENT } from './resources.ts';
import { BIOMES } from './terrain.ts';
import { borderBetween } from './rivers.ts';
import { FARM_LANE } from './rural/plots.ts';
import { len as len2, sub as sub2, type Pt as Pt2 } from './town/geometry.ts';
import { mulberry32, type Rng } from './rng.ts';
import { dressCity, type DressEra } from './cityDress.ts';
import { wearSalt, wornNear } from './rural/wear.ts';
import { paintCity, CITY_CELL } from './cityPainter.ts';

// The ground at a spot of a tile (render.ts samples the terrain).
export interface CitySpot {
  dir: THREE.Vector3;
  ground: number; // height above radius 1
  water: number;
  slope: number;
  urban: number;  // soft urban weight of the painting here (0..1)
  owner?: number; // the tile whose painting it is (where the tiles' paintings wander over their hexes' sides)
  own?: number;   // how much of the painting here is the owner's (its soft weight, 0..1: under 1 near its border)
  bank?: number;  // how near a river (render.ts: its banks' greening, 0..1)
  coast?: number; // how far from the sea (tile inner radii)
}
// A straight side of a farm's fields (farmShape): inside where nx·x + ny·y ≥ c.
export interface FarmSide { readonly nx: number; readonly ny: number; readonly c: number; readonly water: boolean }
// Its fields keep this far in from it (tile steps): the border band, 1.5 lanes.
export const FARM_BAND = 1.5 * FARM_LANE;
export type SpotSampler = (t: number, i: number, wa: number, wb: number) => CitySpot;
// The ground under any direction, and the tile it falls in.
export type DirSampler = (dir: THREE.Vector3) => CitySpot & { t: number };

// A street, drawn by render.ts as a ribbon on the ground.
export interface Street {
  points: THREE.Vector3[]; // unit directions along it
  halfWidth: number[];     // radians, per point (a street may widen where it crosses an edge)
  paved: boolean;
}
// A square, drawn by render.ts as paving on the ground (or a worked rural
// area, in its ground colour).
// (`layer`: what a wonder lays on the ground, a higher layer over a lower.)
export interface Paving { points: THREE.Vector3[]; paved: boolean; rgb?: RGB; exact?: boolean; layer?: number }
// A wonder's sink as dug (wonderModels.ts Sink), drawn by render.ts: its
// rim (directions, round it), its floor's triangles (indices into the
// rim), the heights of its floor and water (as a spot's `ground`: over
// radius 1), its colours, and the holes it cuts in the ground's surface.
// (Its floor and water as heights at each point of its rim: level with the lie of the land.)
export interface SinkSheet { rim: THREE.Vector3[]; tris: number[]; floor: number[]; water: number[] | null; side: RGB; bottom: RGB; holes: TerrainHole[] }

interface CityLayout {
  sig: string;
  byTile: Map<number, PlacedBuilding[]>;
  streets: Street[];
  pavings: Paving[];
  sinks: SinkSheet[];
  reserved: PlacedBuilding[]; // a wonder drawn in pieces: the whole of it, not drawn (no wild flora there)
  approaches: THREE.Vector3[][]; // the roads' ways in to the town (approach), from its tile's edge
  flora?: (d: THREE.Vector3) => boolean; // where wild flora may stay (made when first asked)
}

// Wild flora on a built tile stays where it stands at least this far
// (tile steps) from every building and street, off the squares.
export const FLORA_GAP = 0.03;

export interface PlacedBuilding {
  kind: PlacedKind; // (a town's trees are its tile's own flora)
  matrix: THREE.Matrix4;
  color: THREE.Color; // per-instance shade
  leaf: THREE.Color;  // roof
  wander?: number;    // a walker's: the circle it wanders round where it stands (model units; rural/models.ts wanderIn)
}

const UP = new THREE.Vector3(0, 1, 0);
export const DRY = -0.00008; // like the flora: the water this far under the ground
// A wonder on the sea (the Great Lighthouse): its islet's radius (model
// units, wonders/kit.ts); its scale is its own (wonderModels.ts seaScale).
const SEA_ISLET = 0.075;
// A wonder on land beside its city (the Pyramids, Stonehenge): the ground
// kept clear round it (its size is its own: wonderModels.ts landHalf).
const LAND_WONDER_GAP = 0.015;
// A wonder's sinks: a point of its rim at least every this many model
// units; what it lays on the ground: in cells at most this wide.
const SINK_STEP = 0.0015, PAINT_CELL = 0.012;
// A mine's adits: how many (by how far the countryside has filled up), how
// far apart, how far from the homestead, and the spots tried (every
// ADIT_STEP across the tile, tile steps).
const ADITS: Record<RuralDensity, number> = { low: 1, medium: 2, high: 3 };
// (Adits drawn twice true size, so they read beside their heaps.)
const ADIT_SCALE = 2;
const ADIT_GAP = 0.22, ADIT_HOME_GAP = 0.12, ADIT_REACH = 0.4, ADIT_STEP = 0.04;
// Rice stands in its paddies' water up to this share of its height (rural/layout.ts).
export { PADDY_DEPTH };
// Models are enlarged a little over true scale so towns read from afar
// (the drawings' lot sizes assume this scale).
const HOUSE_SCALE = 1.5;
// A wall gate's passage and half length, and a wall tower's radius (model units: buildingCatalog.ts).
const GATE_PASSAGE = 0.005, GATE_HALF = 0.0059, WALL_TOWER_R = 0.0022;
// The most a gate is scaled up over the walls (the rest of its passage's room: widened).
const GATE_GROW = 1.15;
// Machu Picchu's houses: each on a lot this many town cells square (a
// town's smallest lots are two), its widest foot (the hall's, rural/models.ts) filling it.
const MP_LOT = 1.5, INCA_FOOT = 0.0248;
// The town: every lot within this of its middle (tile steps: two dozen
// houses at most), on a summit render.ts cuts for it (levelSummit), flat
// at most out to SUMMIT_FLAT: past the farthest lot's corners.
const MP_TOWN = 2.7 * MP_LOT * CITY_CELL;
// The least houses the town has: render.ts cuts the summit no lower than they need.
export const SUMMIT_HOUSES = 10;
export const SUMMIT_FLAT = MP_TOWN + MP_LOT * CITY_CELL;
// (How much a lot may fall across it, and how far below the summit the town goes.)
const MP_STEP = 0.0015, MP_DROP = 0.0025, MP_GRANITE = 0x8d877c;
// Foundations: under a building whose footprint's corners differ by more
// than this (× the world scale); the model is FOUNDATION_UNIT on a side.
const FOUNDATION_MIN = 0.00005;
const FOUNDATION_UNIT = 0.01;
// Each civ builds its foundations its own way (by player): grey stone,
// sandstone, brick, basalt, timber, marble, adobe, mossy stone.
const FOUNDATION_STYLE = [0x8d877c, 0xb59a72, 0x9a6a55, 0x5f5a55, 0x7a5f45, 0xd2ccbe, 0xb08a5a, 0x6f7a62] as const;
// A pasture's fences (rural/models.ts fenceCard): bays drawn post to post on the ground.
const FENCES: ReadonlySet<string> = new Set(FENCE_BANDS);
const isFence = (m: RuralModel): boolean => FENCES.has(m);
// render.ts draws prop models at 1.5 × PROP_SIZE of the reference size.
const PROP_SCALE = 1.5 * 0.276;
// The breathing room a town (its walls) and a pasture's fence keep from
// the edge of their tile's painted land and from water (tile steps): the
// land sampled on a grid of MASK_STEP squares over the tile (MASK_HALF of
// them out from its middle), then worn back INSET.
const INSET = 0.05, MASK_STEP = 0.02, MASK_HALF = 32;
// A farm keeps in from its tile's painted border (its soft weight there at
// least FIELD_PAD: the shader's too, terrainMaterial.ts) and off a beach
// (BEACH inner radii from the shore).
const FIELD_PAD = 0.595; // (its border band then 1.5 lanes wide, rural/plots.ts FARM_LANE)
export const BEACH = 0.35;
// (A town short of land builds on its beach down to this far from the shore.)
const TOWN_STRAND = 0.1;
// The land of tile t (`ok` at each square's middle) worn back INSET, as a test of a point (tile steps).
function innerMask(toDir: (p: Pt2) => THREE.Vector3, sample: (d: THREE.Vector3) => CitySpot, ok: (s: CitySpot) => boolean): (p: Pt2) => boolean {
  const S = 2 * MASK_HALF, good = new Uint8Array(S * S), inner = new Uint8Array(S * S), R = Math.ceil(INSET / MASK_STEP);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) good[j * S + i] = ok(sample(toDir({ x: (i - MASK_HALF + 0.5) * MASK_STEP, y: (j - MASK_HALF + 0.5) * MASK_STEP }))) ? 1 : 0;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    let all = good[j * S + i] === 1;
    for (let dj = -R; dj <= R && all; dj++) for (let di = -R; di <= R && all; di++) {
      if (di * di + dj * dj > R * R) continue;
      const x = i + di, y = j + dj;
      all = x >= 0 && y >= 0 && x < S && y < S && good[y * S + x] === 1;
    }
    inner[j * S + i] = all ? 1 : 0;
  }
  return (p) => {
    const i = Math.floor(p.x / MASK_STEP) + MASK_HALF, j = Math.floor(p.y / MASK_STEP) + MASK_HALF;
    return i >= 0 && j >= 0 && i < S && j < S && inner[j * S + i] === 1;
  };
}
// Dry ground a land building keeps round its footprint (tile steps).
export const WATER_GAP = 0.012;


const RURAL: Record<ImprovementKey, BuildingKind> = {
  farm: 'farmstead', mine: 'mineHead', camp: 'lodge', quarry: 'quarryStones', wetland: 'stiltHut', boats: 'fishingBoat', pasture: 'farmstead', plantation: 'farmstead', well: 'mineHead',
};


// The look a city takes in a game era (cityDress.ts has five), by its
// tallest building: Ancient one floor, Classical and Medieval two,
// Renaissance three, Industrial four, Modern and Information four and
// skyscrapers.
const DRESS_ERA: Record<EraIndex, DressEra> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4 };
const dressEraOf = (e: EraIndex): DressEra => DRESS_ERA[e];

// Roofs follow the era and the climate: thatch in the Ancient era and small
// towns, then tiles in the warm south and slate in the cold.
function roofOf(temp: number, pop: number, era: EraIndex, rand: Rng): number {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const thatch = era === 0 ? 0.7 : era === 1 ? 0.15 : 0.05;
  if ((pop <= 3 || era === 0) && rand() < thatch + (pop <= 3 ? 0.3 : 0)) return pick(ROOFS.thatch);
  if (temp > 14) return pick(ROOFS.terracotta);
  if (temp < 4) return pick(ROOFS.slate);
  return rand() < (era >= 2 ? 0.4 : 0.6) ? pick(ROOFS.terracotta) : pick(ROOFS.slate);
}


const mix = (a: number, b: number) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };

// An improved tile drawn with a rural drawing: a city's land, a hex, its improvement a kind of work.
export const isFarmland = (g: Game, t: number): boolean => g.tileCity[t]! >= 0 && g.tiles[t].corners.length === 6 && !g.isWater(t)
  && (() => { const k = g.builtAt(t); return k !== null && WORK_OF[k] !== null; })();

// Built-up tiles: the cities' centers.
export const isBuilt = (g: Game, t: number): boolean => g.use[t] === USE.center && g.tiles[t].corners.length === 6 && !g.isWater(t);


export class CityProps {
  private readonly cache = new Map<number, { sig: string; items: PlacedBuilding[] }>();
  private readonly layouts = new Map<number, CityLayout>();
  private readonly box = new Map<PlacedKind, readonly [number, number]>();
  private readonly floraTall = new Map<CatalogKind, number>();
  private roads: THREE.Vector3[][] = [];
  // Where the roads reach each city's tile (roads.ts RoadLine ends): the middles of its edges.
  private roadEnds = new Map<number, THREE.Vector3[]>();
  private roadsKey = '';
  private version = 0;

  constructor(private readonly game: Game, private readonly sample: SpotSampler, private readonly sampleDir: DirSampler,
    private readonly scale: number) {}

  // A pasture's field on tile t (its fence round it): the largest rectangle along its axis in its
  // painted land, padded (FIELD_PAD, BEACH; dry, but for a wetland's
  // paddies), in the farm's frame. Fixed with the painting: cached.
  private readonly fields = new Map<number, FieldRect | null>();
  farmRect(t: number): FieldRect | null {
    if (this.fields.has(t)) return this.fields.get(t)!;
    const g = this.game, { toDir } = onTile(g, t), a = farmAxis(t), ux = Math.cos(a), uy = Math.sin(a), wetland = g.builtAt(t) === 'wetland';
    const r = largestRect((pu, pv) => {
      const s = this.sampleDir(toDir({ x: pu * ux - pv * uy, y: pu * uy + pv * ux }));
      return (s.owner === undefined || (s.owner === t && (s.own ?? 1) >= FIELD_PAD)) && (s.coast ?? 9) >= BEACH && (wetland || s.water - s.ground <= DRY);
    });
    this.fields.set(t, r);
    return r;
  }

  // A farm's fields (a pasture's keep its rectangle): straight between the
  // corners of its painted land (where its land reaches toward each corner
  // of its hex), but along water (the sea, a lake, a river on that side),
  // where they run on to the painted shore (`water`: the painting decides
  // near it). Lines in onTile's frame (tile steps), inside where n · p ≥ c.
  // Fixed with the painting: cached.
  private readonly shapes = new Map<number, FarmSide[]>();
  private riverEdges: Set<number> | null = null;
  farmShape(t: number): FarmSide[] {
    const hit = this.shapes.get(t);
    if (hit) return hit;
    const g = this.game, tl = g.tiles[t]!, n = tl.corners.length, { toDir } = onTile(g, t), { c, e1, e2, k } = tileFrame(g, t);
    if (!this.riverEdges) {
      this.riverEdges = new Set();
      for (const r of g.map.rivers) for (let i = 0; i + 1 < r.corners.length; i++) {
        const pair = borderBetween(g.globe, r.corners[i]!, r.corners[i + 1]!);
        if (pair) this.riverEdges.add(Math.min(...pair) * g.N + Math.max(...pair));
      }
    }
    const at = (d: THREE.Vector3): Pt2 => { const s = d.dot(c) * k; return { x: d.dot(e1) / s, y: d.dot(e2) / s }; };
    const ours = (p: Pt2) => { const s = this.sampleDir(toDir(p)); return s.owner === undefined || s.owner === t; };
    // (Where its land ends on the ray from its middle out through q.)
    const reach = (q: Pt2): Pt2 => {
      let lo = 0, hi = NaN;
      for (let u = 0.05; u <= 1.5; u += 0.05) { if (!ours({ x: q.x * u, y: q.y * u })) { hi = u; break; } lo = u; }
      if (!Number.isNaN(hi)) for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; if (ours({ x: q.x * m, y: q.y * m })) lo = m; else hi = m; }
      return { x: q.x * lo, y: q.y * lo };
    };
    const corner = (j: number) => at(g.globe.triCenters[tl.corners[j % n]!]!);
    // Its painted corners: where the painting of the three tiles at each
    // corner of its hex meet (paintedCorner: one point per corner, its
    // neighbours' too, so a side two farms share is the same line in both),
    // else where its land ends toward that corner.
    const meet = (j: number): Pt2 => {
      const d = this.paintedCorner(tl.corners[j % n]!, k);
      return d ? at(d) : reach(corner(j));
    };
    const V = Array.from({ length: n }, (_, j) => meet(j));
    const sides: FarmSide[] = [];
    for (let j = 0; j < n; j++) {
      const nb = tl.neighbors[j]!, water = BIOMES[g.biome[nb]!].water || this.riverEdges.has(Math.min(t, nb) * g.N + Math.max(t, nb));
      const a = V[j]!, b = V[(j + 1) % n]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
      if (nx * -a.x + ny * -a.y < 0) { nx = -nx; ny = -ny; }
      sides.push({ nx, ny, c: nx * a.x + ny * a.y, water });
    }
    this.shapes.set(t, sides);
    return sides;
  }

  // Whether direction d is on, or near, tile t's worn ground (rural/wear.ts:
  // a mine's spoil and its dust, a camp's trodden earth), on its painted land.
  nearWear(t: number, d: THREE.Vector3): boolean {
    const g = this.game, imp = g.builtAt(t);
    if (imp !== 'mine' && imp !== 'camp') return false;
    const { c, e1, e2, k } = tileFrame(g, t), { toDir } = onTile(g, t), s = d.dot(c) * k;
    return wornNear(imp, d.dot(e1) / s, d.dot(e2) / s, wearSalt(t), (x, y) => { const o = this.sampleDir(toDir({ x, y })).owner; return o === undefined || o === t; });
  }

  // The middle of tile t's painted hexagon: the mean of its painted corners
  // (paintedCorner; the hex's own where none is found).
  paintedMiddle(t: number): THREE.Vector3 {
    const g = this.game, tl = g.tiles[t]!, { k } = onTile(g, t), m = new THREE.Vector3();
    for (const cn of tl.corners) m.add(this.paintedCorner(cn, k) ?? g.globe.triCenters[cn]!);
    return m.normalize();
  }

  // Where the painting of the three tiles round a corner of the globe's
  // hexes meet (owners sampled on a grid round the corner, then finer round
  // the meeting found): a unit direction, or null. k: a tile step there
  // (radians). Fixed with the painting: cached.
  private readonly corners = new Map<number, THREE.Vector3 | null>();
  private paintedCorner(cn: number, k: number): THREE.Vector3 | null {
    if (this.corners.has(cn)) return this.corners.get(cn)!;
    const g = this.game, P = g.globe.triCenters[cn]!, three = g.globe.tris[cn]!;
    const e1 = new THREE.Vector3(1, 0, 0).addScaledVector(P, -P.x);
    if (e1.lengthSq() < 1e-6) e1.set(0, 1, 0).addScaledVector(P, -P.y);
    e1.normalize();
    const e2 = P.clone().cross(e1);
    const dirAt = (x: number, y: number) => P.clone().addScaledVector(e1, x * k).addScaledVector(e2, y * k).normalize();
    let ox = 0, oy = 0, found = false;
    // (The first grid wide; the finer ones need only reach past the cell found before.)
    for (const [step, N] of [[0.045, 8], [0.008, 4], [0.0015, 4], [0.0003, 4]] as const) {
      const id: (number | undefined)[][] = [];
      for (let a = -N; a <= N; a++) { const row: (number | undefined)[] = []; for (let b = -N; b <= N; b++) row.push(this.sampleDir(dirAt(ox + a * step, oy + b * step)).owner); id.push(row); }
      let best: [number, number] | null = null, bd = Infinity;
      for (let a = 0; a < 2 * N; a++) for (let b = 0; b < 2 * N; b++) {
        const q = new Set([id[a]![b], id[a + 1]![b], id[a]![b + 1], id[a + 1]![b + 1]]);
        if (!three.every((t) => q.has(t))) continue;
        const x = ox + (a - N + 0.5) * step, y = oy + (b - N + 0.5) * step, dd = Math.hypot(x - ox, y - oy);
        if (dd < bd) { bd = dd; best = [x, y]; }
      }
      if (!best) break;
      [ox, oy] = best; found = true;
    }
    const out = found ? dirAt(ox, oy) : null;
    this.corners.set(cn, out);
    return out;
  }

  // Forget every layout (the ground under them changed).
  invalidate(): void { this.version++; }

  // Its improved tiles with drawings.
  private farmland(city: City): number[] {
    const g = this.game;
    // (Every tile it owns, out to its widest border: its ring may lag what it holds.)
    return g.tilesWithin(city.tile, Math.max(city.ring, BORDER_MAX)).filter((t) => g.tileCity[t] === city.id && isFarmland(g, t));
  }

  // Everything the town's layout depends on.
  private citySig(city: City, memo?: Map<number, string>): string {
    const m = memo?.get(city.id);
    if (m !== undefined) return m;
    const g = this.game;
    const wonders = g.cityWonders(city).map((w) => `${w}@${g.wondersBuilt.get(w)}`).join(',');
    const farms = this.farmland(city).map((t) => `${t}:${g.builtAt(t)}:${g.stageAt(t, city.owner)}:${g.pillaged[t]}`).join(';');
    const sig = `${city.id}|${city.pop}|${g.players[city.owner]!.era}|${city.buildings.has('walls') && !g.wallsObsolete(city.owner) ? 'w' : ''}|${city.wonderTile ?? ''}|${city.building ?? ''}|${this.version}|${wonders}|${farms}|${this.roadsInto(city.tile).map((p) => p.x.toFixed(5)).join(',')}`;
    memo?.set(city.id, sig);
    return sig;
  }

  // What this tile shows now, and a signature that changes when it must be rebuilt.
  private signature(t: number, memo?: Map<number, string>): string {
    const g = this.game;
    const u = g.use[t];
    if (u === USE.wild && !g.builtAt(t)) {
      const owner = g.cityById.get(g.tileCity[t]);
      if (owner && this.landWonderOf(t)) return `town|${this.citySig(owner, memo)}`;
      const site = g.cities.some((c) => c.wonderTile === t) ? 's' : '';
      return g.wonderOn(t) ? `w${g.wonderOn(t)}` : site || (g.ruins[t] ? 'ruins' : '');
    }
    const city = g.cityById.get(g.tileCity[t]);
    if (!city) return '';
    if (u === USE.center || isFarmland(g, t)) return `town|${this.citySig(city, memo)}`;
    return `${u}|${city.id}|${g.eraAt(t)}|${g.builtAt(t)}|${g.useVersion}`;
  }

  // The tiles whose buildings changed since they were last placed.
  changed(): number[] {
    const out: number[] = [];
    const memo = new Map<number, string>();
    for (let t = 0; t < this.game.N; t++) {
      const sig = this.signature(t, memo);
      const c = this.cache.get(t);
      if ((c?.sig ?? '') !== sig) out.push(t);
    }
    return out;
  }

  // Every city's streets (for the ground ribbons) and squares.
  streets(): Street[] {
    return this.game.cities.flatMap((c) => this.layout(c).streets);
  }
  pavings(): Paving[] {
    return this.game.cities.flatMap((c) => this.layout(c).pavings);
  }
  sinks(): SinkSheet[] {
    return this.game.cities.flatMap((c) => this.layout(c).sinks);
  }

  place(t: number): PlacedBuilding[] {
    const sig = this.signature(t);
    const c = this.cache.get(t);
    if (c && c.sig === sig) return c.items;
    const items = sig === '' ? [] : this.build(t);
    this.cache.set(t, { sig, items });
    return items;
  }

  private build(t: number): PlacedBuilding[] {
    const g = this.game;
    if (g.use[t] === USE.wild && !g.builtAt(t)) {
      // (A wonder beside a city: Machu Picchu on its summit, the Great
      // Lighthouse on the sea, on flat land with the city's layout;
      // scaffolding while one goes up.)
      const owner = g.cityById.get(g.tileCity[t]);
      if (owner && this.landWonderOf(t)) return this.layout(owner).byTile.get(t) ?? [];
      const beside = this.besideWonder(t);
      if (beside) return beside;
      return g.ruins[t] ? this.ruins(t) : [];
    }
    const city = g.cityById.get(g.tileCity[t]);
    if (!city) return [];
    const u = g.use[t];
    const rand = mulberry32((t + 1) * 2654435761 ^ city.id * 40503);
    if (u !== USE.center && !isFarmland(g, t)) {
      const k = g.builtAt(t);
      const here = k === 'boats' || k === 'well' ? this.works(t, k, g.stageAt(t), rand) : k ? this.rural(t, RURAL[k], rand) : [];
      return [...here, ...(this.besideWonder(t) ?? [])];
    }
    return this.layout(city).byTile.get(t) ?? [];
  }

  private layout(city: City): CityLayout {
    const sig = this.citySig(city);
    const c = this.layouts.get(city.id);
    if (c && c.sig === sig) return c;
    const l = this.buildLayout(city, sig);
    this.layouts.set(city.id, l);
    return l;
  }

  // ---------- the town ----------

  private buildLayout(city: City, sig: string): CityLayout {
    const g = this.game, D = g.globe.avgEdgeAngle;
    const byTile = new Map<number, PlacedBuilding[]>();
    const put = (t: number, ...bs: PlacedBuilding[]) => { const l = byTile.get(t); if (l) l.push(...bs); else byTile.set(t, bs); };
    const era = g.players[city.owner]!.era;
    const walled = city.buildings.has('walls') && !g.wallsObsolete(city.owner);
    const wet = (s: CitySpot) => s.water - s.ground > DRY;
    // How much a drawing is stretched or squeezed here (tiles vary in size).
    const local = (a: THREE.Vector3, b: THREE.Vector3) => Math.min(1.25, Math.max(0.7, a.angleTo(b) / (0.01 * D)));

    // No streets in a city (its diorama suggests them) or a farm.
    const streets: Street[] = [];
    const pavings: Paving[] = [];
    const sinks: SinkSheet[] = [];
    const reserved: PlacedBuilding[] = [];
    // Nothing may stand on the roads between cities: every building's
    // footprint is checked (shrunk a little if it touches one, left out if
    // it still does). Roads run up to the city's diorama.
    const clear = this.roadIndex();
    // Nor at the water: a land building's footprint, and a margin round it,
    // stays dry (no house touching a river or the sea). Walls may follow a bank.
    const dryAround = (b: PlacedBuilding) => {
      if (waterRule(b.kind) !== undefined) return true;
      const c = new THREE.Vector3().setFromMatrixPosition(b.matrix).normalize();
      return this.footprint(b).every((p) => {
        const out = p.clone().sub(c);
        const l = out.length();
        return !wet(this.sampleDir(l > 1e-12 ? p.clone().addScaledVector(out, (WATER_GAP * D) / l).normalize() : p));
      });
    };
    // (`roads`: kept off the roads; the walls are not: a gate lets them through.)
    const fits = (b: PlacedBuilding, dry: boolean, roads: boolean) => (!roads || clear.free(this.footprint(b))) && (!dry || dryAround(b));
    const settle = (make: (shrink: number) => PlacedBuilding[], dry = true, roads = true): PlacedBuilding[] => {
      for (const shrink of [1, 0.85]) { const bs = make(shrink); if (fits(bs[0]!, dry, roads)) return bs; }
      return [];
    };

    // The city: painted on its center tile (cityPainter.ts), dressed in
    // its civ's style for its size and era (cityDress.ts). Laid on the tile
    // evenly (onTile: no tile is a perfect hex, and the fans' mapping would
    // shear the painting), sized to the tile.
    const { toDir, k: unit } = onTile(g, city.tile);
    const ahead = (p: Pt2, yaw: number) => toDir({ x: p.x + 0.01 * Math.cos(yaw), y: p.y + 0.01 * Math.sin(yaw) });
    // Every wonder in the city (Machu Picchu stands on its summit, a wild
    // tile) and the one going up, as scaffolding.
    const wonders: SiteModel[] = [...g.wondersAt(city.tile).flatMap((w) => (w === 'machuPicchu' ? [] : [w])), ...(city.wonderTile === city.tile ? ['scaffold' as const] : [])];
    const dressed = dressCity({
      civ: g.players[city.owner]!.name, era: dressEraOf(era), pop: city.pop, wonders, walled, seed: mix(city.id, 0xc17),
      // (Its own land: dry, off a beach (sea or lake), painted as its tile's,
      // and so all round it for INSET: breathing room from a river, the sea
      // and the next tile's land.)
      free: innerMask(toDir, (d) => this.sampleDir(d), (s) => !wet(s) && (s.coast ?? 9) >= BEACH && (s.owner === undefined || s.owner === city.tile)),
      // (A town too large for that builds down its beach as well, a strand left at the water: TOWN_STRAND.)
      spare: (() => { let m: ((p: Pt2) => boolean) | null = null; return (p: Pt2) => (m ??= innerMask(toDir, (d) => this.sampleDir(d), (s) => !wet(s) && (s.coast ?? 9) >= TOWN_STRAND && (s.owner === undefined || s.owner === city.tile)))(p); })(),
    });
    // (The painter keeps them apart and off the water: each stands where painted.)
    dressed.buildings.forEach((b, n) => {
      const s = this.sampleDir(toDir(b.at)), rand = mulberry32(mix(city.id, n + 1));
      if (wet(s)) return;
      const lot = this.standLot(b.model, s.dir, facing(s.dir, ahead(b.at, b.yaw)) + Math.PI / 2, b.hw, b.hd, unit * b.scale, rand, city.owner, [b.sx, b.sz]);
      put(city.tile, ...lot);
      // (A wonder's grounds: the Hanging Gardens' trees on their terraces.)
      const gr = isWonderModelKind(b.model) ? wonderGrounds(siteModelOf(b.model)) : null;
      if (gr && lot[0]) put(city.tile, ...this.grounds(siteModelOf(b.model as WonderModelKind), gr, lot[0].matrix, unit * b.scale, mulberry32(mix(city.id, n + 0x3b)), sinks, pavings, () => true));
    });
    // (Exactly where painted: they meet the buildings' sides.)
    for (const r of dressed.painting.roads) pavings.push({ points: r.map(toDir), paved: era > 0, rgb: dressed.roadRgb, exact: true });
    // (A wonder's lot paved as the streets right up to them: its model,
    // fitted a hair inside and square where its lot may not be, leaves no
    // grass showing round it.)
    {
      const pt = dressed.painting, at = (x: number, y: number) => toDir({ x: pt.origin.x + (x * pt.u.x + y * pt.v.x) * pt.unit, y: pt.origin.y + (x * pt.u.y + y * pt.v.y) * pt.unit });
      for (const b of pt.buildings) if (b.kind === 'wonder') pavings.push({ points: [at(b.x0, b.y0), at(b.x1, b.y0), at(b.x1, b.y1), at(b.x0, b.y1)], paved: era > 0, rgb: dressed.roadRgb, exact: true });
    }

    // The roads into town: from where each reaches the tile's edge on to
    // the nearest of its streets it can reach in a straight line between
    // the buildings (or, with none, up to the buildings toward the middle).
    const frame = tileFrame(g, city.tile), P = dressed.painting;
    const toPt = (d: THREE.Vector3): Pt2 => { const s = d.dot(frame.c) * frame.k; return { x: d.dot(frame.e1) / s, y: d.dot(frame.e2) / s }; };
    const gridOf = (p: Pt2): Pt2 => { const x = p.x - P.origin.x, y = p.y - P.origin.y; return { x: (x * P.u.x + y * P.u.y) / P.unit, y: (x * P.v.x + y * P.v.y) / P.unit }; };
    const tileOf = (x: number, y: number): Pt2 => ({ x: P.origin.x + (x * P.u.x + y * P.v.x) * P.unit, y: P.origin.y + (x * P.u.y + y * P.v.y) * P.unit });
    const inBuilding = (p: Pt2) => { const q = gridOf(p); return P.buildings.some((b) => q.x > b.x0 - 0.5 && q.x < b.x1 + 0.5 && q.y > b.y0 - 0.5 && q.y < b.y1 + 0.5); };
    const STEP = 0.25 * P.unit;
    const clearWay = (a: Pt2, b: Pt2) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP); for (let i = 0; i <= n; i++) if (inBuilding({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })) return false; return true; };
    const cells: Pt2[] = P.roads.flatMap((r) => {
      const a = gridOf(r[0]!), b = gridOf(r[2]!), out: Pt2[] = [];
      for (let x = Math.round(Math.min(a.x, b.x)); x < Math.round(Math.max(a.x, b.x)); x++) for (let y = Math.round(Math.min(a.y, b.y)); y < Math.round(Math.max(a.y, b.y)); y++) out.push(tileOf(x + 0.5, y + 0.5));
      return out;
    });
    const approaches: THREE.Vector3[][] = [], ways: [Pt2, Pt2][] = [];
    for (const edge of this.roadsInto(city.tile)) {
      const e = toPt(edge);
      let to: Pt2 | null = null, best = Infinity;
      for (const c of cells) { const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < best && clearWay(e, c)) { best = d; to = c; } }
      if (!to) {
        // (Straight toward the middle, as far as the buildings.)
        const l = Math.hypot(e.x, e.y), n = Math.ceil(l / STEP);
        let i = 0;
        while (i < n && !inBuilding({ x: e.x * (1 - (i + 1) / n), y: e.y * (1 - (i + 1) / n) })) i++;
        to = { x: e.x * (1 - i / n), y: e.y * (1 - i / n) };
      }
      const n = Math.max(1, Math.ceil(Math.hypot(to.x - e.x, to.y - e.y) / (2 * STEP)));
      approaches.push([edge.clone(), ...Array.from({ length: n }, (_, i) => toDir({ x: e.x + ((to.x - e.x) * (i + 1)) / n, y: e.y + ((to.y - e.y) * (i + 1)) / n }))]);
      ways.push([e, to]);
    }

    // Walls: a segment between each pair of the ring's points, a tower at
    // every other; a gate where a road runs through them (its passage a
    // little wider than the road, its towers either side: no segment or
    // tower stands in its way).
    if (dressed.wall) {
      const rand = mulberry32(city.id * 7919 + 5);
      const ring = dressed.wall;
      // (The gate's size: a little larger than the walls', then widened as
      // the road needs; its half length in tile steps.)
      const need = (2.2 * ROAD_HALF_WIDTH * D) / (GATE_PASSAGE * this.scale * PROP_SCALE * HOUSE_SCALE);
      const gateSize = HOUSE_SCALE * Math.min(GATE_GROW, Math.max(1, need)), gateWide = Math.max(1, need / GATE_GROW);
      const gateHalf = (GATE_HALF * this.scale * PROP_SCALE * gateSize * gateWide) / frame.k;
      const towerR = (WALL_TOWER_R * this.scale * PROP_SCALE * HOUSE_SCALE) / frame.k;
      // (The ring measured along: where each of its points stands, from the
      // first, and the point that far along it, round and round: closed.)
      const S: number[] = [0];
      for (let n = 0; n + 1 < ring.length; n++) S.push(S[n]! + Math.hypot(ring[n + 1]!.x - ring[n]!.x, ring[n + 1]!.y - ring[n]!.y));
      const L = S[S.length - 1]!;
      const ringAt = (s: number): Pt2 => {
        const w = ((s % L) + L) % L;
        let n = 0;
        while (n + 2 < S.length && S[n + 1]! < w) n++;
        const a = ring[n]!, b = ring[n + 1]!, l = S[n + 1]! - S[n]!, t = l > 0 ? (w - S[n]!) / l : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      };
      // Where each road crosses the ring: how far along it. (A gate is
      // longer than the ring's pieces are apart: its passage is cut out of
      // the ring as a whole, across the joints it spans, not out of its
      // piece alone. Roads crossing within a gate's half length of each
      // other share one gate.)
      const crossings: number[] = [];
      for (const [a, b] of ways) for (let n = 0; n + 1 < ring.length; n++) {
        const c = ring[n]!, d = ring[n + 1]!;
        const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den, u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) crossings.push(S[n]! + u * (S[n + 1]! - S[n]!));
      }
      crossings.sort((a, b) => a - b);
      const along: number[][] = [];
      for (const s of crossings) {
        const last = along[along.length - 1];
        if (last && s - last[0]! < gateHalf) last.push(s); else along.push([s]);
      }
      // (Round the joint where the ring closes: the last and the first.)
      if (along.length > 1 && along[0]![0]! + L - along[along.length - 1]![0]! < gateHalf) along[0]!.unshift(...along.pop()!.map((s) => s - L));
      // Each gate: its middle, and the ring's points where its walls end
      // either side (it stands along the line between them, so it meets
      // the walls at both ends, however the ring bends under it).
      // (Two gates closer than their length: moved apart about their middle
      // to stand side by side, neither tower in the other's passage.)
      const mids = along.map((ss) => ss.reduce((a, b) => a + b, 0) / ss.length);
      for (let pass = 0; pass < 4 && mids.length > 1; pass++) {
        let moved = false;
        mids.forEach((s, i) => {
          const j = (i + 1) % mids.length, gap = ((mids[j]! - s) % L + L) % L;
          if (gap >= 2 * gateHalf - 1e-9 || i === j) return;
          const push = gateHalf - gap / 2;
          mids[i] = s - push; mids[j] = mids[j]! + push; moved = true;
        });
        if (!moved) break;
      }
      const gates = mids.map((s) => {
        const a = ringAt(s - gateHalf), b = ringAt(s + gateHalf);
        return { s, a, b, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      });
      const nearGate = (p: Pt2, r: number) => gates.some((q) => Math.hypot(q.at.x - p.x, q.at.y - p.y) < r);
      const segment = (p: Pt2, q: Pt2) => {
        const s = this.sampleDir(toDir(p)), nx = this.sampleDir(toDir(q));
        const mid = this.sampleDir(s.dir.clone().add(nx.dir).normalize());
        if (!standsAt('wallSegment', mid)) return;
        // Stretched to the gap between its ends (model length 0.01 at prop scale).
        const len = Math.max(0.3, Math.min(4, s.dir.angleTo(nx.dir) / (0.01 * HOUSE_SCALE * this.scale * PROP_SCALE)));
        put(city.tile, ...settle((k) => this.stand('wallSegment', mid.dir, facing(mid.dir, nx.dir), HOUSE_SCALE * k, buildingEntry('wallSegment').leaf, rand, city.owner, len), false, false));
      };
      ring.forEach((p, n) => {
        const s = this.sampleDir(toDir(p));
        if (n % 2 === 0 && n < ring.length - 1 && standsAt('wallTower', s) && !nearGate(p, gateHalf + towerR)) {
          put(city.tile, ...settle((k) => this.stand('wallTower', s.dir, 0, HOUSE_SCALE * k, buildingEntry('wallTower').leaf, rand, city.owner), false, false));
        }
        const q = ring[n + 1];
        if (!q) return;
        // (The piece in parts outside its gates' passages, which may reach
        // in from a gate on the pieces either side, or across the ring's
        // closing joint; a sliver left by a cut, too short to stand, left
        // out: the gate's tower and the next piece close it.)
        const s0 = S[n]!, s1 = S[n + 1]!, len = s1 - s0;
        const point = (s: number): Pt2 => ({ x: p.x + ((q.x - p.x) * (s - s0)) / len, y: p.y + ((q.y - p.y) * (s - s0)) / len });
        const cuts = gates.flatMap((x) => [-L, 0, L].map((w) => [x.s + w - gateHalf, x.s + w + gateHalf] as const)).filter(([a, b]) => b > s0 && a < s1).sort((a, b) => a[0] - b[0]);
        let from = s0;
        for (const [a, b] of [...cuts, [s1, s1] as const]) {
          if (a - from > 0.05 * gateHalf) segment(point(from), point(a));
          from = Math.max(from, b);
        }
      });
      for (const x of gates) {
        const at = this.sampleDir(toDir(x.at));
        put(city.tile, ...this.stand('wallGate', at.dir, facing(at.dir, toDir(x.b)), gateSize, buildingEntry('wallGate').leaf, rand, city.owner, gateWide));
      }
    }

    // Wonders beside the city on flat land (the Pyramids, Stonehenge, or
    // the scaffolding of one), each on a square of its tile placed by a
    // simple painting: the dry spot clear of roads nearest the edge the
    // tile shares with the city, facing it. The tile's farm keeps round it.
    const keep = new Map<number, { p: Pt2; r: number }>();
    for (const t of g.tiles[city.tile].neighbors) {
      const m = g.tileCity[t] === city.id ? this.landWonderOf(t) : null;
      if (!m) continue;
      const { toDir, k } = onTile(g, t);
      const kind = wonderModelKind(m), [hw, hd] = this.modelBox(kind);
      const half = landHalf(m), sc = half / Math.max(hw, hd), r = Math.SQRT2 * (half + LAND_WONDER_GAP);
      const tl = g.tiles[t]!, i = tl.neighbors.indexOf(city.tile), n = tl.corners.length;
      const edge = g.globe.triCenters[tl.corners[i]!]!.clone().add(g.globe.triCenters[tl.corners[(i + 1) % n]!]!).normalize();
      // (Spots nearest the middle of its painted hexagon first; the first whose circle is
      // all dry and clear of roads, checked every 0.02 across it.)
      const disk: Pt2[] = [];
      for (let x = -r; x <= r; x += 0.02) for (let y = -r; y <= r; y += 0.02) if (Math.hypot(x, y) <= r) disk.push({ x, y });
      const spots: { p: Pt2; dist: number }[] = [];
      const mid = this.paintedMiddle(t);
      // (One on a summit: the highest spots first.)
      const summit = ON_SUMMIT.has(m);
      for (let x = -0.4; x <= 0.4; x += 0.02) for (let y = -0.4; y <= 0.4; y += 0.02) {
        const d = toDir({ x, y });
        spots.push({ p: { x, y }, dist: summit ? -this.sampleDir(d).ground : d.angleTo(mid) });
      }
      spots.sort((a, b) => a.dist - b.dist);
      let best: Pt2 | null = null;
      for (const { p } of spots) {
        if ([0, 1, 2, 3, 4, 5].some((j) => rhoOf(6, { x: p.x + r * Math.cos((j * Math.PI) / 3), y: p.y + r * Math.sin((j * Math.PI) / 3) }) > 0.95)) continue;
        const dirs = disk.map((q) => toDir({ x: p.x + q.x, y: p.y + q.y }));
        if (dirs.some((dd) => wet(this.sampleDir(dd))) || !clear.free(dirs)) continue;
        best = p;
        break;
      }
      if (!best) continue;
      const dir = toDir(best);
      const lot = this.standLot(kind, dir, facing(dir, edge) + Math.PI / 2, hw, hd, k * sc, mulberry32(mix(t, 0x3a)), city.owner);
      const gr = wonderGrounds(m);
      // (A wonder in pieces: each piece where it stands, not the whole.)
      if (gr?.pieces && lot[0]) reserved.push(lot[0]); else put(t, ...lot);
      if (gr && lot[0]) put(t, ...this.grounds(m, gr, lot[0].matrix, k * sc, mulberry32(mix(t, 0x3b)), sinks, pavings, (d) => clear.free([d])));
      keep.set(t, { p: best, r });
    }

    // The countryside: each worked land tile's ground is painted by the
    // terrain shader (plots, spoil, pits, clearings); on it stand its
    // farm's homestead and a few yards (farmPainter.ts), each filled with
    // what the tile grows or digs (rural/look.ts): haystacks by the grain,
    // a herd, a grove, heaps, stones, logs.
    for (const t of this.farmland(city)) {
      const imp = g.builtAt(t)!, stage = g.stageAt(t, city.owner);
      const r0 = g.resourceFor(t, city.owner), res = r0 && RESOURCE_IMPROVEMENT[r0] === imp ? r0 : null;
      const { toDir: toT, k: kT } = onTile(g, t);
      const ko = keep.get(t);
      // (The farm's painting samples its points more than once: what the ground is at each, remembered.)
      const seen = new Map<string, CitySpot>();
      const spotAt = (p: Pt2): CitySpot => { const key = `${p.x},${p.y}`; let s = seen.get(key); if (!s) { s = this.sampleDir(toT(p)); seen.set(key, s); } return s; };
      const inp: RuralInput = { imp, stage, res, region: cropRegion(imp, g.biome[t]!, g.feature[t] ?? null, g.map.temperature[t]!, res), axis: farmAxis(t), salt: t, seed: mix(t, 0x51),
        yard: (i) => areaLook(imp, g.biome[t]!, g.feature[t] ?? null, g.map.temperature[t]!, i, t) };
      const site: RuralSite = {
        free: (p) => (!ko || len2(sub2(p, ko.p)) > ko.r) && clear.free([toT(p)]),
        // (Water this near under the ground counts as water: a river's banks, under its surface as drawn.)
        depth: (p) => { const smp = spotAt(p); return (smp.water - smp.ground - DRY) / D; },
        wade: (0.0004 * this.scale) / D,
        // (The farm goes where the land is painted as this tile's, a little in
        // from its border (FIELD_PAD), off a beach, and on the tile's side of
        // a river: no water between it and the tile's middle.)
        ours: (p) => {
          if (imp !== 'pasture' && this.farmShape(t).some((sd) => !sd.water && sd.nx * p.x + sd.ny * p.y - sd.c < FARM_BAND)) return false;
          const s = spotAt(p);
          if (s.owner !== undefined && (s.owner !== t || (s.own ?? 1) < FIELD_PAD)) return false;
          if ((s.coast ?? 9) < BEACH) return false;
          if ((s.bank ?? 0) > 0.02) for (let k = 1; k < 8; k++) { const q = spotAt({ x: (p.x * k) / 8, y: (p.y * k) / 8 }); if (q.water - q.ground > 0.0003) return false; }
          return true;
        },
        // (A fence keeps INSET in from that, and from the water.)
        inner: imp === 'pasture' ? innerMask(toT, (d) => this.sampleDir(d), (s) => (s.owner === undefined || s.owner === t) && s.water - s.ground <= DRY) : () => false,
        // (A paddy's water is its own pools: not a river running by, nor the sea.)
        pool: (p) => { const s = spotAt(p); return (s.bank ?? 0) < 0.05 && (s.coast ?? 1) > 0.3; },
        ground: (p) => spotAt(p).ground / D,
        field: imp === 'pasture' ? this.farmRect(t) : null,
      };
      const farm = planFarm(inp, site);
      if (!farm) continue;
      const settleHere = (make: (shrink: number) => PlacedBuilding[]): PlacedBuilding[] => {
        for (const shrink of [1, 0.85]) { const bs = make(shrink); if (clear.free(this.footprint(bs[0]!)) && dryAround(bs[0]!)) return bs; }
        return [];
      };
      // One model at p, facing `heading` (the hex's frame), never on a road crossing the farm.
      // On a slope: a fence's bay runs from post to post on the ground; a
      // work (WORKS) stands level with the highest ground under it on a
      // foundation, as the town's houses do; what else stands still sits
      // down to the lowest; people, beasts and plants where they stand.
      const one = (m: RuralModel, p: Pt2, heading: number, size: readonly [number, number, number], leaf: number, shade = 1, wander = 0) => {
        const kind = ruralModelKind(m), dir = toT(p), smp = this.sampleDir(dir);
        const yaw = facing(dir, toT({ x: p.x + 0.01 * Math.cos(heading), y: p.y + 0.01 * Math.sin(heading) }));
        const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
        const sc = new THREE.Vector3(size[0] * D, size[1] * D, size[2] * D), sink = 0.00005 * this.scale;
        const out: PlacedBuilding[] = [];
        let matrix: THREE.Matrix4;
        if (isFence(m)) {
          // (Its ends on the ground, the bay sheared between them: the posts upright, the rails along the slope.)
          const half = (size[0] * CREATURE_SCALE) / 2, c = Math.cos(heading), sn = Math.sin(heading);
          const [a, b] = [-1, 1].map((k) => { const d = toT({ x: p.x + k * half * c, y: p.y + k * half * sn }); return d.multiplyScalar(1 + this.sampleDir(d).ground - sink); }) as [THREE.Vector3, THREE.Vector3];
          const mid = a.clone().add(b).multiplyScalar(0.5), up = mid.clone().normalize(), run = b.clone().sub(a);
          const side = run.clone().cross(up).normalize();
          matrix = new THREE.Matrix4().makeBasis(run.multiplyScalar(1 / CREATURE_SCALE), up.multiplyScalar(sc.y), side.multiplyScalar(sc.z)).setPosition(mid);
        } else if (isWorks(m) || (!FIGURES.has(m as KitModel) && !isFloraRural(kind))) {
          // (The ground under its footing (rural/models.ts): its corners, sides' middles and middle.)
          const f = footingOf(kind), X = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(sc.x), Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(sc.z);
          let low = smp.ground, high = low;
          for (const x of [f.x0, (f.x0 + f.x1) / 2, f.x1]) for (const z of [f.z0, (f.z0 + f.z1) / 2, f.z1]) {
            const h = this.sampleDir(dir.clone().addScaledVector(X, x).addScaledVector(Z, z).normalize()).ground;
            low = Math.min(low, h); high = Math.max(high, h);
          }
          if (isWorks(m)) {
            const lift = 0.00012 * this.scale;
            matrix = new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + high - lift), q, sc);
            if (high - low >= FOUNDATION_MIN * this.scale) {
              const fu = this.scale * PROP_SCALE * FOUNDATION_UNIT, fs = 0.0002 * this.scale;
              const at = dir.clone().addScaledVector(X, (f.x0 + f.x1) / 2).addScaledVector(Z, (f.z0 + f.z1) / 2).normalize();
              const k = 0.92 + 0.1 * mulberry32(mix(t, Math.round(p.x * 1e4) ^ Math.round(p.y * 1e4) * 7919))();
              out.push({ kind: 'foundation', matrix: new THREE.Matrix4().compose(at.multiplyScalar(1 + low - fs), q, new THREE.Vector3(((f.x1 - f.x0) * sc.x) / fu, (high - lift - low + fs) / fu, ((f.z1 - f.z0) * sc.z) / fu)),
                color: new THREE.Color(k, k, k), leaf: new THREE.Color(FOUNDATION_STYLE[((city.owner % FOUNDATION_STYLE.length) + FOUNDATION_STYLE.length) % FOUNDATION_STYLE.length]!) });
            }
          } else matrix = new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + low - sink), q, sc);
        } else matrix = new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + smp.ground - sink), q, sc);
        const b: PlacedBuilding = { kind, matrix, color: new THREE.Color(shade, shade, shade), leaf: new THREE.Color(leaf), wander: (wander * kT) / (size[0] * D) };
        if (!clear.free(this.footprint(b))) return false;
        put(t, b, ...out);
        return true;
      };
      // A mine's adits, cut where the tile is steepest, each with its spoil below it.
      const adits: { p: Pt2; r: number }[] = [];
      const look = stageLook(imp, stage, res);
      if (imp === 'mine' && look.adits > 0) this.adits(t, farm.home, ko, ADITS[look.density] * look.adits, (bs) => put(t, ...bs), settle, (poly, seed) => {
        const fl = areaLook(imp, g.biome[t]!, null, 0, 0, t).fill, r = mulberry32(seed + 1);
        if (fl.t === 'scatter') for (const p of scatterIn(poly, fl.per, seed, SCATTER_GAP[fl.model])) { const k = 0.8 + 0.4 * r(); one(fl.model, p, r() * 6.28, [k, k, k], fl.color); }
      }, city.owner, (p) => adits.push({ p, r: 0.09 }));
      const plan = layoutRural(inp, farm, site, adits);
      for (const it of plan.items) one(it.model, it.p, it.heading, it.size, it.leaf, it.shade, it.wander);
      // The homestead: a house in the civ's style (one floor to three as its
      // techs take it on) and its barn, facing along the grid.
      const placeLot = (kind: Footprint, floors: Floors, p: Pt2, lr: Rng) => {
        const s0 = this.sampleDir(toT(p));
        if (wet(s0)) return;
        const f = toT({ x: p.x + 0.01 * farm.u.x, y: p.y + 0.01 * farm.u.y });
        // (A farm's house a home, one of its style's two; a mine's its works.)
        const hk = houseKind(styleOf(g.players[city.owner]!.name, floors), kind, floors, imp === 'mine' && kind === HOMESTEAD_LOT ? WORKS_VARIANT : Math.floor(lr() * 2));
        const [lw, ld] = LOT_SIZE[kind];
        // (As large as a town's houses: their lots CITY_CELL / CELL the plain ones.)
        put(t, ...settleHere((k) => this.standLot(hk, s0.dir, facing(s0.dir, f) + Math.PI / 2, lw, ld, D * local(s0.dir, f) * k * HOMESTEAD_SCALE, lr, city.owner)));
      };
      if (plan.house) placeLot(HOMESTEAD_LOT, plan.house.floors, plan.house.p, mulberry32(mix(t, 0x5a)));
      if (plan.barn) placeLot('b32', 1, plan.barn, mulberry32(mix(t, 0x5b)));
    }
    return { sig, byTile, streets, pavings, sinks, reserved, approaches };
  }

  // A wonder's grounds (wonderModels.ts WonderGrounds) where its model
  // stands (`frame`, its matrix; `s` its scale): its sinks dug (into
  // `sinks`, their rims a point every SINK_STEP of the model at most), what
  // it lays on the ground (into `pavings`), its trees the flora's own, each
  // as tall as its spot asks, on dry ground off the roads (`free`) or up on
  // the model, and its pieces, each on the ground where it stands or on its
  // sink's floor.
  private grounds(m: SiteModel, gr: WonderGrounds, frame: THREE.Matrix4, s: number, rand: Rng, sinks: SinkSheet[], pavings: Paving[], free: (d: THREE.Vector3) => boolean): PlacedBuilding[] {
    const at = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(frame).normalize();
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
    frame.decompose(pos, quat, scale);
    const middle = pos.clone().normalize();
    // (Each sink's floor: a plane, its height over radius 1 at d, and its slope's normal there.)
    const floors: { at: (d: THREE.Vector3) => number; up: (d: THREE.Vector3) => THREE.Vector3 }[] = [];
    for (const sk of gr.sinks ?? []) {
      // (Its outline, each side cut in pieces SINK_STEP long at most.)
      const pts: [number, number][] = [];
      sk.outline.forEach(([x0, z0], i) => {
        const [x1, z1] = sk.outline[(i + 1) % sk.outline.length]!, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / SINK_STEP));
        for (let j = 0; j < n; j++) pts.push([x0 + ((x1 - x0) * j) / n, z0 + ((z1 - z0) * j) / n]);
      });
      const rim = pts.map(([x, z]) => at(x, z));
      // (The lie of the land round it: a plane fitted to its rim's ground
      // (least squares). A level sink is dug flat along it, lowered to its
      // rim's lowest point, so on a slope its sides keep about the same
      // height all round; one that follows the ground, `depth` under it all
      // round, its water likewise.)
      const c = rim.reduce((a, d) => a.add(d), new THREE.Vector3()).normalize();
      const e1 = new THREE.Vector3(0, 1, 0).cross(c).normalize(), e2 = c.clone().cross(e1);
      const hs = rim.map((d) => this.sampleDir(d).ground), xs = rim.map((d) => d.dot(e1)), zs = rim.map((d) => d.dot(e2));
      const plane = fitPlane(xs, zs, hs);
      const lower = sk.follow ? 0 : Math.min(...hs.map((h, i) => h - plane(xs[i]!, zs[i]!)));
      const lie = (d: THREE.Vector3) => plane(d.dot(e1), d.dot(e2)) + lower;
      const [gx, gz] = [plane(1e-3, 0) - plane(0, 0), plane(0, 1e-3) - plane(0, 0)].map((v) => v / 1e-3) as [number, number];
      floors.push({ at: (d) => lie(d) - sk.depth * s, up: (d) => d.clone().addScaledVector(e1, -gx).addScaledVector(e2, -gz).normalize() });
      const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []).flat();
      const holes = sk.cut.map((c): TerrainHole => {
        const mid = at(c.x, c.z), k = c.round ? Math.cos(Math.PI / ROUND_SIDES) : 1;
        const u = at(c.x + c.hw, c.z).sub(at(c.x - c.hw, c.z)), v = at(c.x, c.z + c.hd).sub(at(c.x, c.z - c.hd));
        const hu = (u.length() / 2) * k, hv = (v.length() / 2) * k;
        u.addScaledVector(mid, -u.dot(mid)).normalize();
        v.addScaledVector(mid, -v.dot(mid)).addScaledVector(u, -v.dot(u)).normalize();
        return { c: mid, u, v, hu, hv, round: !!c.round };
      });
      const rgb = (c: number): RGB => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
      const ground = (d: THREE.Vector3, i: number) => (sk.follow ? hs[i]! : lie(d));
      sinks.push({ rim, tris, floor: rim.map((d, i) => ground(d, i) - sk.depth * s), water: sk.water === undefined ? null : rim.map((d, i) => ground(d, i) - sk.water! * s), side: rgb(sk.side), bottom: rgb(sk.floor), holes });
    }
    // What it lays on the ground: rectangles in cells PAINT_CELL across at
    // most (so each follows the ground), ellipses as polygons.
    for (const p of gr.paint ?? []) {
      const c = new THREE.Color(p.color), rgb: RGB = [c.r, c.g, c.b], layer = p.layer;
      if (p.round) {
        pavings.push({ points: Array.from({ length: 20 }, (_, i) => { const a = (-i / 20) * Math.PI * 2; return at(p.x + Math.cos(a) * p.hw, p.z + Math.sin(a) * p.hd); }), paved: false, rgb, exact: true, layer });
        continue;
      }
      const nx = Math.max(1, Math.ceil((2 * p.hw) / PAINT_CELL)), nz = Math.max(1, Math.ceil((2 * p.hd) / PAINT_CELL));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x0 = p.x - p.hw + (2 * p.hw * i) / nx, x1 = p.x - p.hw + (2 * p.hw * (i + 1)) / nx, z0 = p.z - p.hd + (2 * p.hd * j) / nz, z1 = p.z - p.hd + (2 * p.hd * (j + 1)) / nz;
        pavings.push({ points: [at(x0, z0), at(x0, z1), at(x1, z1), at(x1, z0)], paved: false, rgb, exact: true, layer });
      }
    }
    const out: PlacedBuilding[] = [];
    const sink = 0.00001 * this.scale;
    for (const tr of gr.trees ?? []) {
      // (On the ground, dry and off the roads; or up on the model, where its frame puts it.)
      let base: THREE.Vector3, dir: THREE.Vector3;
      if (tr.y === undefined) {
        dir = at(tr.x, tr.z);
        const spot = this.sampleDir(dir);
        if (spot.water - spot.ground > DRY || !free(dir)) continue;
        base = dir.clone().multiplyScalar(1 + spot.ground - sink);
      } else {
        base = new THREE.Vector3(tr.x, tr.y, tr.z).applyMatrix4(frame);
        dir = base.clone().normalize();
      }
      // (The flora's models are drawn at PROP_SCALE of their reference size.)
      const size = (tr.height * s) / (this.floraHeight(tr.kind) * PROP_SCALE * this.scale), stretch = 0.92 + 0.16 * rand();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, rand() * Math.PI * 2));
      const shade = 0.88 + 0.2 * rand();
      out.push({ kind: tr.kind, matrix: new THREE.Matrix4().compose(base, q, new THREE.Vector3(size, size * stretch, size)),
        color: new THREE.Color(shade, shade, shade * 0.97), leaf: new THREE.Color(CATALOG[tr.kind].leaf) });
    }
    // Its pieces: each level with the middle of the ground under it
    // (between its lowest and highest corners, a little sunk), or on its
    // sink's floor; turned as the whole is.
    for (const pc of wonderPieces(m)) {
      const dir = at(pc.x, pc.z);
      let base: number, tilt = new THREE.Quaternion();
      if (pc.sink !== undefined) { const f = floors[pc.sink]!; base = f.at(dir); tilt = new THREE.Quaternion().setFromUnitVectors(dir, f.up(dir)); }
      else {
        let lo = Infinity, hi = -Infinity;
        for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, -1], [-1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
          const g = this.sampleDir(at(pc.x + a * pc.hw, pc.z + b * pc.hd)).ground;
          lo = Math.min(lo, g); hi = Math.max(hi, g);
        }
        base = (lo + hi) / 2 - 0.00002 * this.scale;
      }
      const q = tilt.multiply(new THREE.Quaternion().setFromUnitVectors(middle, dir)).multiply(quat);
      out.push({ kind: pc.kind, matrix: new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + base), q, scale), color: new THREE.Color(1, 1, 1), leaf: new THREE.Color(1, 1, 1) });
    }
    return out;
  }
  // A flora model's height at its reference size.
  private floraHeight(kind: CatalogKind): number {
    let h = this.floraTall.get(kind);
    if (h === undefined) {
      const geo = placedGeometry(kind);
      geo.computeBoundingBox();
      h = geo.boundingBox!.max.y;
      geo.dispose();
      this.floraTall.set(kind, h);
    }
    return h;
  }

  // Half extents of a model's footprint (x, z), in model units.
  private modelBox(kind: PlacedKind): readonly [number, number] {
    let r = this.box.get(kind);
    if (r === undefined) {
      const geo = placedGeometry(kind);
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      r = [Math.max(-b.min.x, b.max.x), Math.max(-b.min.z, b.max.z)];
      // (A wonder's grounds are part of its footprint.)
      if (isWonderModelKind(kind) && !kind.includes('#')) { const [gx, gz] = groundsBox(siteModelOf(kind)); r = [Math.max(r[0], gx), Math.max(r[1], gz)]; }
      this.box.set(kind, r);
    }
    return r;
  }

  // Machu Picchu: houses and halls of dressed stone, a city cell each, on
  // the shelf levelled for them (render.ts levelSummit), filling every lot
  // of it on a grid round its middle.
  private readonly summits = new Map<number, { readonly dir: THREE.Vector3; readonly ground: number }>();
  // The shelf levelled for Machu Picchu on tile t (render.ts levelSummit): its middle, its ground (radius - 1).
  setSummit(t: number, dir: THREE.Vector3, ground: number): void { this.summits.set(t, { dir: dir.clone(), ground }); }
  // The lots Machu Picchu's houses take round P on tile t (cells from P,
  // each lot's lowest and highest ground), the summit's ground `top`, over
  // the ground `groundAt` (radius - 1): the real one, or render.ts
  // levelSummit's trial of a cut. Terraced down the peak as the town is:
  // every lot of the town (MP_TOWN) takes a house unless it falls too
  // steeply across or lies too far below the summit, the house on the
  // lot's highest corner and a terrace of granite under it down to its
  // lowest. (The grid nudged so its lots fall round the top, not across
  // it: the nudge that holds the most.)
  summitLots(t: number, P: THREE.Vector3, top: number, groundAt: (d: THREE.Vector3) => number): { x: number; y: number; lo: number; hi: number }[] {
    const { e1, k } = tileFrame(this.game, t), cell = CITY_CELL * k, L = MP_LOT, h = L * 0.5;
    const u = e1.clone().addScaledVector(P, -e1.dot(P)).normalize(), w = P.clone().cross(u);
    const at = (x: number, y: number) => P.clone().addScaledVector(u, x * cell).addScaledVector(w, y * cell).normalize();
    let best: { x: number; y: number; lo: number; hi: number }[] = [];
    for (const [ox, oy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]] as const) {
      const here: typeof best = [];
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
        const x = (a + ox) * L, y = (b + oy) * L;
        if (Math.hypot(x, y) * CITY_CELL > MP_TOWN) continue;
        const gs = [[x, y], [x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]].map(([p, q]) => groundAt(at(p!, q!)));
        const lo = Math.min(...gs), hi = Math.max(...gs);
        if (hi - lo > MP_STEP * this.scale || top - lo > MP_DROP * this.scale) continue;
        here.push({ x, y, lo, hi });
      }
      if (here.length > best.length) best = here;
    }
    return best;
  }

  private machuPicchu(t: number): PlacedBuilding[] {
    const rand = mulberry32((t + 3) * 2654435761);
    // (Round the middle of its shelf; without one, the tile's highest ground.)
    let top: { readonly dir: THREE.Vector3; readonly ground: number } | null = this.summits.get(t) ?? null;
    if (!top) for (const sp of this.tileSpots(t, 8, rand)) {
      const s = this.sample(t, sp.i, sp.wa, sp.wb);
      if (!top || s.ground > top.ground) top = s;
    }
    if (!top) return [];
    const P = top.dir, { e1, k } = tileFrame(this.game, t), cell = CITY_CELL * k;
    const u = e1.clone().addScaledVector(P, -e1.dot(P)).normalize(), w = P.clone().cross(u);
    const at = (x: number, y: number) => P.clone().addScaledVector(u, x * cell).addScaledVector(w, y * cell).normalize();
    // (Each house on a lot of MP_LOT × MP_LOT town cells, side by side with
    // no gap between: drawn up so its foot fills its lot, a hair inside.)
    const L = MP_LOT, size = (k * L * CITY_CELL * 0.97) / INCA_FOOT;
    const out: PlacedBuilding[] = [];
    for (const { x, y, lo, hi } of this.summitLots(t, P, top.ground, (d) => this.sampleDir(d).ground)) {
      const d = at(x, y), quarter = Math.floor(rand() * 4);
      const qn = new THREE.Quaternion().setFromUnitVectors(UP, d).multiply(new THREE.Quaternion().setFromAxisAngle(UP, facing(d, at(x + 1, y)) + Math.PI / 2 + quarter * Math.PI / 2));
      const pos = d.clone().multiplyScalar(1 + hi - 0.00002 * this.scale);
      if (hi - lo > 0.00003 * this.scale) {
        const fu = this.scale * PROP_SCALE * FOUNDATION_UNIT, fs = 0.0002 * this.scale, side = (L * cell) / fu;
        const qf = new THREE.Quaternion().setFromUnitVectors(UP, d).multiply(new THREE.Quaternion().setFromAxisAngle(UP, facing(d, at(x + 1, y)) + Math.PI / 2));
        out.push({ kind: 'foundation', matrix: new THREE.Matrix4().compose(d.clone().multiplyScalar(1 + lo - fs), qf, new THREE.Vector3(side, (hi - lo + fs) / fu, side)), color: new THREE.Color(1, 1, 1).multiplyScalar(0.9 + 0.1 * rand()), leaf: new THREE.Color(MP_GRANITE) });
      }
      out.push({ kind: ruralModelKind(rand() < 0.3 ? 'incaHall' : 'incaHouse'), matrix: new THREE.Matrix4().compose(pos, qn, new THREE.Vector3(size, size, size)), color: new THREE.Color(1, 1, 1).multiplyScalar(0.92 + 0.12 * rand()), leaf: new THREE.Color(1, 1, 1) });
    }
    return out;
  }

  // The wonder standing on tile t beside its city, or going up there.
  // (On a mountain or the sea; on flat land it is the city's layout's.)
  private besideWonder(t: number): PlacedBuilding[] | null {
    const g = this.game, w = g.wonderOn(t);
    if (w === 'machuPicchu') return this.machuPicchu(t);
    if (w) return wonderBeside(w) === 'sea' ? this.seaWonder(t, wonderModelKind(w)) : null;
    if (!g.cities.some((c) => c.wonderTile === t) || this.landWonderOf(t)) return null;
    return g.isSea(t) ? this.seaWonder(t, wonderModelKind('scaffold')) : this.landmark(t, 'scaffold', mulberry32((t + 1) * 2654435761));
  }

  // The wonder on flat land on tile t beside its city (or its scaffolding).
  landWonderOf(t: number): SiteModel | null {
    const g = this.game, w = g.wonderOn(t);
    if (w) return wonderBeside(w) === 'land' && w !== 'machuPicchu' ? w : null;
    const c = g.cities.find((x) => x.wonderTile === t);
    return c?.building && isWonderKey(c.building) && wonderBeside(c.building) === 'land' ? 'scaffold' : null;
  }
  // Whether the flora of tile t keeps clear of what the city's layout puts there.
  keepsFloraClear(t: number): boolean {
    const g = this.game;
    return g.use[t] === USE.center || isFarmland(g, t) || (g.use[t] === USE.wild && (this.landWonderOf(t) !== null || g.wonderOn(t) === 'machuPicchu'));
  }

  // Where a wonder on the sea stands: on the line from the middle of its
  // painted hexagon (paintedMiddle) to the middle of the edge it shares
  // with its city, as near that middle as its islet keeps wholly in the
  // water; facing the city.
  private seaSpot(t: number): { dir: THREE.Vector3; toward: THREE.Vector3; r: number; k: number; scale: number } | null {
    const g = this.game, city = g.cityById.get(g.tileCity[t]!);
    if (!city) return null;
    const tl = g.tiles[t]!, i = tl.neighbors.indexOf(city.tile);
    if (i < 0) return null;
    const n = tl.corners.length, c = this.paintedMiddle(t);
    const edge = g.globe.triCenters[tl.corners[i]!]!.clone().add(g.globe.triCenters[tl.corners[(i + 1) % n]!]!).normalize();
    const w = g.wonderOn(t), scale = w && w !== 'machuPicchu' && wonderBeside(w) === 'sea' ? seaScale(w) : seaScale('scaffold');
    const { k } = onTile(g, t), r = SEA_ISLET * scale * k;
    const wet = (d: THREE.Vector3) => { const s = this.sampleDir(d); return s.water - s.ground >= 0.0003; };
    for (let f = 0; f <= 0.75; f += 0.05) {
      const dir = c.clone().lerp(edge, f).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      const ring = Array.from({ length: 8 }, (_, j) => dir.clone().add(new THREE.Vector3(Math.cos(j * Math.PI / 4) * r, 0, Math.sin(j * Math.PI / 4) * r).applyQuaternion(q)).normalize());
      if (wet(dir) && ring.every(wet)) return { dir, toward: g.tiles[city.tile]!.center, r, k, scale };
    }
    return null;
  }
  private seaWonder(t: number, kind: LotModelKind): PlacedBuilding[] {
    const s = this.seaSpot(t);
    if (!s) return [];
    const water = this.sampleDir(s.dir).water;
    // (Facing its city; the Colossus looks out to sea.)
    const out = kind === wonderModelKind('colossus') ? Math.PI : 0;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, s.dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, facing(s.dir, s.toward) + Math.PI / 2 + out));
    return [{ kind, matrix: new THREE.Matrix4().compose(s.dir.clone().multiplyScalar(1 + water), q, new THREE.Vector3().setScalar(s.scale * s.k)), color: new THREE.Color(1, 1, 1), leaf: new THREE.Color(1, 1, 1) }];
  }

  private tileSpots(t: number, rows: number, rand: Rng): { i: number; wa: number; wb: number }[] {
    const k = this.game.tiles[t].corners.length;
    const out: { i: number; wa: number; wb: number }[] = [];
    for (let i = 0; i < k; i++) {
      for (let a = 0; a < rows; a++) {
        for (let b = 0; a + b < rows; b++) {
          const ja = (rand() - 0.5) * 0.7, jb = (rand() - 0.5) * 0.7;
          const wa = Math.min(0.98, Math.max(0.02, (a + 1 / 3 + ja) / rows));
          const wb = Math.min(0.98 - wa, Math.max(0.02, (b + 1 / 3 + jb) / rows));
          out.push({ i, wa, wb });
        }
      }
    }
    return out;
  }

  // What is left of a razed city: broken walls where some of a small
  // town's houses stood (a town painted as cityPainter.ts would).
  private ruins(t: number): PlacedBuilding[] {
    const g = this.game, rand = mulberry32((t + 7) * 2246822519);
    if (g.tiles[t].corners.length !== 6) return [];
    const { toDir } = onTile(g, t);
    const town = paintCity({ wonders: 0, skyscrapers: 0, buildings: { 1: 12, 2: 0, 3: 0, 4: 0 }, seed: mix(t, 0x7ab), free: (p) => { const s = this.sampleDir(toDir(p)); return s.water - s.ground <= DRY; } });
    const out: PlacedBuilding[] = [];
    for (const b of town.buildings) {
      if (rand() > 0.35) continue;
      const sp = this.sampleDir(toDir(b.at));
      if (!standsAt('ruins', sp)) continue;
      out.push(this.make('ruins', sp.dir, sp.ground, rand() * Math.PI * 2, HOUSE_SCALE * (0.7 + 0.4 * rand()), buildingEntry('ruins').leaf, rand));
    }
    return out;
  }

  // A landmark (wonder or scaffolding) as close to the tile's heart as it can stand.
  private landmark(t: number, kind: BuildingKind, rand: Rng): PlacedBuilding[] {
    const s0 = this.sample(t, 0, 0.03, 0.03);
    const s = standsAt(kind, s0) ? s0 : this.findSpot(t, kind, rand, s0.dir);
    return s ? this.stand(kind, s.dir, rand() * Math.PI * 2, HOUSE_SCALE, buildingEntry(kind).leaf, rand, this.game.ownerOf(t)) : [];
  }

  // A spot of tile t where the model can stand (by its water rule), the
  // nearest to `near` of a few tries.
  private findSpot(t: number, kind: BuildingKind, rand: Rng, near: THREE.Vector3): CitySpot | null {
    const k = this.game.tiles[t].corners.length;
    let best: CitySpot | null = null;
    for (let tries = 0; tries < 24; tries++) {
      const s = this.sample(t, Math.floor(rand() * k), 0.08 + 0.75 * rand(), 0.05 + 0.3 * rand());
      if (standsAt(kind, s) && (!best || s.dir.angleTo(near) < best.dir.angleTo(near))) best = s;
    }
    return best;
  }

  // Whether the tile's own flora may stay at d on built tile t: clear of
  // every building and street of its town by FLORA_GAP, off its squares.
  // (So a town keeps the trees that grew there, never more than the wild.)
  floraClear(t: number, d: THREE.Vector3): boolean {
    if (this.game.use[t] === USE.wild && this.game.wonderOn(t) === 'machuPicchu') {
      // (Clear of Machu Picchu's houses by most of a cell.)
      const gap = 0.75 * CITY_CELL * tileFrame(this.game, t).k, at = new THREE.Vector3();
      return this.place(t).every((b) => at.setFromMatrixPosition(b.matrix).normalize().angleTo(d) > gap);
    }
    const city = this.game.cityById.get(this.game.tileCity[t]);
    if (!city) return true;
    const l = this.layout(city);
    l.flora ??= this.floraIndex(l, city.tile);
    return l.flora(d);
  }
  private floraIndex(l: CityLayout, center: number): (d: THREE.Vector3) => boolean {
    const D = this.game.globe.avgEdgeAngle, gap = FLORA_GAP * D;
    // The town itself: the hull round the buildings of its center, where no
    // tree stands, though a gap between two houses would fit one (a town
    // keeps the trees round it, not among its houses).
    const hull = townHull([...(l.byTile.get(center) ?? [])].filter((b) => !isFloraModel(b.kind) && b.kind !== 'foundation').flatMap((b) => this.footprint(b)), this.game.tiles[center]!.center);
    // Buildings: each a box in its own frame (its matrix's inverse), bucketed by where it stands.
    const cell = 0.15 * D, key = (p: THREE.Vector3, dx = 0, dy = 0, dz = 0) => `${Math.floor(p.x / cell) + dx},${Math.floor(p.y / cell) + dy},${Math.floor(p.z / cell) + dz}`;
    interface Box { inv: THREE.Matrix4; hx: number; hz: number; gx: number; gz: number; at: THREE.Vector3; reach: number }
    const cells = new Map<string, Box[]>(), big: Box[] = [];
    for (const b of [...l.byTile.values()].flat().concat(l.reserved)) {
      if (isFloraModel(b.kind) || b.kind === 'foundation') continue;
      const [hx, hz] = this.modelBox(b.kind), G = isLotModel(b.kind) ? 1 : PROP_SCALE * this.scale;
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      b.matrix.decompose(pos, q, sc);
      const box: Box = { inv: b.matrix.clone().invert(), hx: hx * G, hz: hz * G, gx: gap / sc.x, gz: gap / sc.z, at: pos, reach: Math.hypot(hx * G * sc.x, hz * G * sc.z) + gap };
      if (box.reach > cell) big.push(box); else { const k = key(pos); const c = cells.get(k); if (c) c.push(box); else cells.set(k, [box]); }
    }
    // (And the roads' ways in.)
    const streets = new StreetIndex([...l.streets, ...l.approaches.map((pts) => ({ points: pts, halfWidth: pts.map(() => ROAD_HALF_WIDTH * D), paved: false }))], D);
    // Squares: polygons on the tangent plane at their middle.
    const squares = l.pavings.map((p) => {
      const c = p.points.reduce((a, v) => a.add(v), new THREE.Vector3()).normalize();
      const e1 = new THREE.Vector3(0, 1, 0).cross(c).normalize(), e2 = c.clone().cross(e1);
      const flat = (v: THREE.Vector3) => [v.dot(e1), v.dot(e2)] as const;
      return { c, flat, poly: p.points.map(flat), r: Math.max(...p.points.map((v) => v.angleTo(c))) + gap };
    });
    const inBox = (bx: Box, d: THREE.Vector3) => {
      if (bx.at.distanceTo(d.clone().multiplyScalar(bx.at.length())) > bx.reach) return false;
      const p = d.clone().multiplyScalar(bx.at.length()).applyMatrix4(bx.inv);
      return Math.abs(p.x) < bx.hx + bx.gx && Math.abs(p.z) < bx.hz + bx.gz;
    };
    return (d) => {
      if (hull && hull.near(d, gap)) return false;
      for (const bx of big) if (inBox(bx, d)) return false;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const bx of cells.get(key(d, dx, dy, dz)) ?? []) if (inBox(bx, d)) return false;
      }
      if (!streets.clear(d, gap)) return false;
      for (const s of squares) {
        if (d.angleTo(s.c) > s.r) continue;
        const [x, y] = s.flat(d);
        let inside = false;
        for (let i = 0, j = s.poly.length - 1; i < s.poly.length; j = i++) {
          const a = s.poly[i]!, b = s.poly[j]!;
          if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        if (inside) return false;
      }
      return true;
    };
  }

  // A placed building's footprint on the ground: its corners and the
  // middles of its sides (unit directions).
  footprint(b: PlacedBuilding): THREE.Vector3[] {
    // (A town lot is in tile steps, its scale in its matrix; the others at prop scale.)
    const [hx, hz] = this.modelBox(b.kind), G = isLotModel(b.kind) ? 1 : PROP_SCALE * this.scale;
    const out: THREE.Vector3[] = [];
    for (const [x, z] of [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      out.push(new THREE.Vector3(x * hx * G, 0, z * hz * G).applyMatrix4(b.matrix).normalize());
    }
    return out;
  }

  // Whether a model standing at dir would touch a road between cities.
  private roadLines(): THREE.Vector3[][] {
    const g = this.game, key = `${g.useVersion}|${g.cities.length}|${g.roadVersion}`;
    if (this.roadsKey !== key) {
      this.roadsKey = key;
      const lines = roadLines(g, planRoads(g));
      this.roads = lines.map((r) => r.points);
      this.roadEnds = new Map();
      const end = (t: number | null, p: THREE.Vector3) => { if (t === null) return; const l = this.roadEnds.get(t); if (l) l.push(p); else this.roadEnds.set(t, [p]); };
      for (const r of lines) { end(r.ends[0], r.points[0]!); end(r.ends[1], r.points[r.points.length - 1]!); }
    }
    return this.roads;
  }
  // The roads between cities, indexed (shared by every city's layout).
  private roadIdx: { key: string; idx: StreetIndex } | null = null;
  private roadIndex(): StreetIndex {
    const roads = this.roadLines();
    if (this.roadIdx?.key !== this.roadsKey) {
      const D = this.game.globe.avgEdgeAngle;
      this.roadIdx = { key: this.roadsKey, idx: new StreetIndex(roads.map((pts) => ({ points: pts, halfWidth: pts.map(() => ROAD_HALF_WIDTH * D), paved: false })), D) };
    }
    return this.roadIdx.idx;
  }
  // The middles of the edges where roads reach city tile t.
  private roadsInto(t: number): readonly THREE.Vector3[] { this.roadLines(); return this.roadEnds.get(t) ?? []; }
  // A road's way on from where it reaches city tile t (`edge`, the middle
  // of an edge: roads.ts) to its town's streets, if the town has one.
  approach(t: number, edge: THREE.Vector3): readonly THREE.Vector3[] | null {
    const city = this.game.cityById.get(this.game.tileCity[t]);
    if (!city || city.tile !== t) return null;
    return this.layout(city).approaches.find((a) => a[0]!.distanceTo(edge) < 1e-7) ?? null;
  }
  // Whether flora may grow at d: clear of every road between cities by a
  // tree's reach (FLORA_GAP, as in a town).
  offRoads(d: THREE.Vector3): boolean { return this.roadIndex().clear(d, FLORA_GAP * this.game.globe.avgEdgeAngle); }
  private onRoad(dir: THREE.Vector3, kind: BuildingKind): boolean {
    const g = this.game;
    this.roadLines();
    const [hx, hz] = this.modelBox(kind);
    const clear = ROAD_HALF_WIDTH * g.globe.avgEdgeAngle + Math.hypot(hx, hz) * HOUSE_SCALE * 1.1 * PROP_SCALE * this.scale;
    for (const pts of this.roads) {
      if (pts[0]!.distanceTo(dir) > 0.3) continue;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!, ab = pts[i + 1]!.clone().sub(a), l2 = ab.lengthSq();
        const u = l2 > 0 ? Math.max(0, Math.min(1, dir.clone().sub(a).dot(ab) / l2)) : 0;
        if (a.clone().addScaledVector(ab, u).distanceTo(dir) < clear) return true;
      }
    }
    return false;
  }

  // A mine's adits: where its tile is steepest, each cut into the slope
  // (its back to the hill, facing down it), apart from each other and the
  // homestead, its spoil heaps below it.
  private adits(t: number, home: Pt2, keepOut: { p: Pt2; r: number } | undefined, want: number, put: (bs: PlacedBuilding[]) => void,
    settle: (make: (shrink: number) => PlacedBuilding[], dry?: boolean) => PlacedBuilding[],
    spoil: (poly: readonly Pt2[], seed: number) => void, owner: number, cut: (p: Pt2) => void): void {
    const { toDir } = onTile(this.game, t);
    const D = this.game.globe.avgEdgeAngle;
    const h = (p: Pt2) => this.sampleDir(toDir(p)).ground;
    const at = (p: Pt2, d: Pt2, s: number): Pt2 => ({ x: p.x + d.x * s, y: p.y + d.y * s });
    const spots: { p: Pt2; down: Pt2; steep: number }[] = [];
    for (let x = -ADIT_REACH; x <= ADIT_REACH; x += ADIT_STEP) for (let y = -ADIT_REACH; y <= ADIT_REACH; y += ADIT_STEP) {
      const p = { x, y };
      if (rhoOf(6, p) > 0.8 || len2(sub2(p, home)) < ADIT_HOME_GAP || (keepOut && len2(sub2(p, keepOut.p)) < keepOut.r + ADIT_HOME_GAP)) continue;
      // (The hill's slope, not the ground's small bumps.)
      const gx = h({ x: x + 0.05, y }) - h({ x: x - 0.05, y }), gy = h({ x, y: y + 0.05 }) - h({ x, y: y - 0.05 });
      const steep = Math.hypot(gx, gy);
      if (steep > 1e-9) spots.push({ p, down: { x: -gx / steep, y: -gy / steep }, steep });
    }
    spots.sort((a, b) => b.steep - a.steep);
    const placed: Pt2[] = [];
    for (const { p, down } of spots) {
      if (placed.length >= want) break;
      if (placed.some((q) => len2(sub2(q, p)) < ADIT_GAP)) continue;
      const da = toDir(p), s = this.sampleDir(da);
      if (s.water - s.ground > DRY) continue;
      // (Its mouth is the model's +x: facing down the slope, the hill
      // straight behind it, uphill.)
      const yaw = facing(da, toDir(at(p, down, 0.01)));
      const bs = settle((k) => this.standLot(ruralModelKind('adit'), da, yaw, 0.004, 0.002, D * k * ADIT_SCALE, mulberry32(mix(t, placed.length)), owner), false);
      if (bs.length === 0) continue;
      put(bs);
      cut(p);
      // Its spoil: a yard down the slope in front of it.
      const c = at(p, down, 0.07), side = { x: -down.y, y: down.x };
      spoil([at(at(c, down, -0.035), side, -0.06), at(at(c, down, -0.035), side, 0.06), at(at(c, down, 0.035), side, 0.06), at(at(c, down, 0.035), side, -0.06)], mix(t, 0xad + placed.length));
      placed.push(p);
    }
  }

  // A fishing tile's boats and an oil well's works, by stage (rural/stages.ts
  // waterLook): boats afloat, the well's derricks, pumpjacks and tanks on
  // dry ground; apart, off the roads and clear of a wonder on the sea.
  private works(t: number, imp: 'boats' | 'well', stage: number, rand: Rng): PlacedBuilding[] {
    const g = this.game, D = g.globe.avgEdgeAngle, out: PlacedBuilding[] = [], at: THREE.Vector3[] = [];
    const clearOf = g.wonderOn(t) || g.cities.some((c) => c.wonderTile === t) ? this.seaSpot(t) : null;
    // (An oil well at sea: a platform, afloat as boats are.)
    const sea = g.isWater(t);
    for (const th of waterLook(imp, stage, sea)) for (let n = 0; n < th.n; n++) {
      for (let tries = 0; tries < 30; tries++) {
        const s = this.sample(t, Math.floor(rand() * g.tiles[t].corners.length), 0.12 + 0.45 * rand(), 0.1 + 0.3 * rand());
        const afloat = s.water - s.ground > 0.0003;
        if (afloat !== (imp === 'boats' || sea) || (clearOf && s.dir.angleTo(clearOf.dir) < clearOf.r * 1.6) || at.some((d) => d.angleTo(s.dir) < D * 0.12)) continue;
        const sc = D * kitBoost(th.model) * (0.9 + 0.2 * rand());
        const q = new THREE.Quaternion().setFromUnitVectors(UP, s.dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, rand() * Math.PI * 2));
        const b: PlacedBuilding = { kind: ruralModelKind(th.model), matrix: new THREE.Matrix4().compose(s.dir.clone().multiplyScalar(1 + (afloat ? s.water : s.ground) - 0.00004 * this.scale), q, new THREE.Vector3(sc, sc, sc)),
          color: new THREE.Color(1, 1, 1), leaf: new THREE.Color(th.colors ? th.colors[Math.floor(rand() * th.colors.length)]! : 0xffffff) };
        if (this.onRoadDir(s.dir, D * 0.05)) continue;
        out.push(b); at.push(s.dir);
        break;
      }
    }
    return out;
  }
  private onRoadDir(dir: THREE.Vector3, r: number): boolean {
    this.roadLines();
    const clear = ROAD_HALF_WIDTH * this.game.globe.avgEdgeAngle + r;
    for (const pts of this.roads) {
      if (pts[0]!.distanceTo(dir) > 0.3) continue;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!, ab = pts[i + 1]!.clone().sub(a), l2 = ab.lengthSq();
        const u = l2 > 0 ? Math.max(0, Math.min(1, dir.clone().sub(a).dot(ab) / l2)) : 0;
        if (a.clone().addScaledVector(ab, u).distanceTo(dir) < clear) return true;
      }
    }
    return false;
  }

  // One structure per rural tile (two boats on the water), off the roads.
  private rural(t: number, kind: BuildingKind, rand: Rng): PlacedBuilding[] {
    const out: PlacedBuilding[] = [];
    // (Boats keep clear of a wonder standing on their sea.)
    const clearOf = this.game.wonderOn(t) || this.game.cities.some((c) => c.wonderTile === t) ? this.seaSpot(t) : null;
    const want = kind === 'fishingBoat' ? 2 : 1;
    const water = buildingEntry(kind).water === 'float';
    for (let tries = 0; tries < 24 && out.length < want; tries++) {
      const i = Math.floor(rand() * this.game.tiles[t].corners.length);
      const wa = 0.15 + 0.4 * rand(), wb = 0.1 + 0.3 * rand();
      const s = this.sample(t, i, wa, wb);
      if (!standsAt(kind, s) || this.onRoad(s.dir, kind) || (clearOf && s.dir.angleTo(clearOf.dir) < clearOf.r * 1.6)) continue;
      const roof = kind === 'farmstead' ? roofOf(this.game.map.temperature[t], 6, this.game.eraAt(t), rand) : buildingEntry(kind).leaf;
      const yaw = rand() * Math.PI * 2, size = HOUSE_SCALE * (0.9 + 0.2 * rand());
      if (water) out.push(this.make(kind, s.dir, s.water, yaw, size, roof, rand));
      else out.push(...this.stand(kind, s.dir, yaw, size, roof, rand, this.game.ownerOf(t)));
    }
    return out;
  }

  // A building on the ground as it is: level at the highest corner of its
  // footprint, with a foundation (in its civ's style) filling down to the
  // lowest, so slopes need no flattening (as in SimCity). `stretchX`
  // widens the footprint (wall segments).
  private stand(kind: BuildingKind, dir: THREE.Vector3, yaw: number, size: number, roof: number, rand: Rng, owner: number, stretchX = 1): PlacedBuilding[] {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    const G = this.scale * PROP_SCALE * size; // model units to radians
    const [hx, hz] = this.modelBox(kind);
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(hx * G * stretchX);
    const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(hz * G);
    let low = this.sampleDir(dir).ground, high = low;
    for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
      const h = this.sampleDir(dir.clone().addScaledVector(X, a).addScaledVector(Z, b).normalize()).ground;
      low = Math.min(low, h); high = Math.max(high, h);
    }
    const b = this.make(kind, dir, high, yaw, size, roof, rand);
    if (stretchX !== 1) b.matrix.multiply(new THREE.Matrix4().makeScale(stretchX, 1, 1));
    if (high - low < FOUNDATION_MIN * this.scale) return [b];
    // The foundation: footprint wide, from under the lowest corner up to the floor.
    const unit = this.scale * PROP_SCALE * FOUNDATION_UNIT;
    const sink = 0.0002 * this.scale;
    const pos = dir.clone().multiplyScalar(1 + low - sink);
    const f: PlacedBuilding = {
      kind: 'foundation',
      matrix: new THREE.Matrix4().compose(pos, q, new THREE.Vector3((2 * hx * G * stretchX * 1.04) / unit, (high - low + sink) / unit, (2 * hz * G * 1.04) / unit)),
      color: new THREE.Color(1, 1, 1).multiplyScalar(0.92 + 0.1 * rand()),
      leaf: new THREE.Color(FOUNDATION_STYLE[((owner % FOUNDATION_STYLE.length) + FOUNDATION_STYLE.length) % FOUNDATION_STYLE.length]!),
    };
    return [b, f];
  }

  // A lot model (a house in its yard, a wonder, a rural model: in tile
  // steps) on the ground, scaled by s (radians per tile step), its floor
  // level with the highest ground under it, a foundation (in its civ's
  // style) filling down to the lowest. (`stretch`: across its front and
  // deep, as a painted city fits a model to its rectangle.)
  private standLot(kind: LotModelKind, dir: THREE.Vector3, yaw: number, lw: number, ld: number, s: number, rand: Rng, owner: number, stretch: readonly [number, number] = [1, 1]): PlacedBuilding[] {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(lw * s);
    const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(ld * s);
    let low = this.sampleDir(dir).ground, high = low;
    for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const g = this.sampleDir(dir.clone().addScaledVector(X, a).addScaledVector(Z, b).normalize()).ground;
      low = Math.min(low, g); high = Math.max(high, g);
    }
    // (A wonder on the bare ground stands halfway between its lowest and
    // highest corners, sunk into the slope: no foundation; barely sunk, so
    // what lies flat on its ground (a garden's lawns and gravel) shows.)
    const bare = isWonderModelKind(kind) && ON_BARE_GROUND.has(kind.slice('wonder|'.length));
    let base = bare ? (low + high) / 2 : high;
    const sink = (bare ? 0.00002 : 0.00012) * this.scale, shade = 0.92 + 0.12 * rand();
    // (One with something held up over the ground, as FAST's dish: raised
    // until the ground keeps under it everywhere, a sixteenth of a town cell
    // to spare. Its underside sampled over the model every few thousandths.)
    const m = isWonderModelKind(kind) ? (kind.slice('wonder|'.length) as SiteModel) : null, under = m ? CLEARANCE[m] : undefined;
    if (m && under) {
      // (A town cell in model units: the city's cell over the scale a wonder beside it is drawn at.)
      const cell = (CITY_CELL * Math.max(lw, ld)) / landHalf(m);
      const room = (cell / 16) * s, step = 0.006;
      let lift = 0;
      for (let x = -lw; x <= lw; x += step) for (let z = -ld; z <= ld; z += step) {
        const u = under(x, z);
        if (u === null) continue;
        const g = this.sampleDir(dir.clone().addScaledVector(X, x / lw).addScaledVector(Z, z / ld).normalize()).ground;
        lift = Math.max(lift, g + room - (base - sink + u * s));
      }
      base += lift;
    }
    const out: PlacedBuilding[] = [{
      kind,
      matrix: new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + base - sink), q, new THREE.Vector3(s * stretch[0], s, s * stretch[1])),
      color: new THREE.Color(shade, shade, shade),
      leaf: new THREE.Color(1, 1, 1),
    }];
    // (None under a wonder on the bare ground: it is set into the slope.)
    if (!bare && base - low >= FOUNDATION_MIN * this.scale) {
      const fu = this.scale * PROP_SCALE * FOUNDATION_UNIT, fs = 0.0002 * this.scale;
      out.push({
        kind: 'foundation',
        matrix: new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + low - fs), q, new THREE.Vector3((2 * lw * s * 1.0) / fu, (base - low + fs) / fu, (2 * ld * s * 1.0) / fu)),
        color: new THREE.Color(1, 1, 1).multiplyScalar(0.92 + 0.1 * rand()),
        leaf: new THREE.Color(FOUNDATION_STYLE[((owner % FOUNDATION_STYLE.length) + FOUNDATION_STYLE.length) % FOUNDATION_STYLE.length]!),
      });
    }
    return out;
  }

  private make(kind: BuildingKind | CatalogKind, dir: THREE.Vector3, height: number, yaw: number, size: number, roof: number, rand: Rng): PlacedBuilding {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    // Sink a little so slopes never show a gap under the walls.
    const pos = dir.clone().multiplyScalar(1 + height - 0.00012 * this.scale);
    const shade = 0.9 + 0.18 * rand();
    return {
      kind,
      matrix: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(size, size, size)),
      color: new THREE.Color(shade, shade * (0.98 + 0.04 * rand()), shade * (0.96 + 0.04 * rand())),
      leaf: new THREE.Color(roof),
    };
  }
}

// The plane h = a + b x + c z nearest the points (least squares), as a function.
function fitPlane(xs: readonly number[], zs: readonly number[], hs: readonly number[]): (x: number, z: number) => number {
  const n = xs.length, mx = xs.reduce((a, v) => a + v, 0) / n, mz = zs.reduce((a, v) => a + v, 0) / n, mh = hs.reduce((a, v) => a + v, 0) / n;
  let sxx = 0, sxz = 0, szz = 0, sxh = 0, szh = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]! - mx, z = zs[i]! - mz, h = hs[i]! - mh;
    sxx += x * x; sxz += x * z; szz += z * z; sxh += x * h; szh += z * h;
  }
  const det = sxx * szz - sxz * sxz;
  const b = Math.abs(det) < 1e-30 ? 0 : (sxh * szz - szh * sxz) / det, c = Math.abs(det) < 1e-30 ? 0 : (szh * sxx - sxh * sxz) / det;
  return (x, z) => mh + b * (x - mx) + c * (z - mz);
}

// Whether a model may stand at a spot: on dry ground (any slope: a
// foundation makes up the difference); boats on water deep enough; shore
// buildings on either.
// Streets in buckets, to ask quickly whether points are clear of all of them.
class StreetIndex {
  // (Cells keyed by their integer coordinates packed in one number; segments
  // as flat numbers: a, b, half widths.)
  private readonly cells = new Map<number, number[]>();
  private readonly size: number;
  constructor(streets: readonly Street[], D: number) {
    this.size = 0.12 * D;
    const mid = new THREE.Vector3();
    for (const s of streets) {
      for (let i = 0; i + 1 < s.points.length; i++) {
        const a = s.points[i]!, b = s.points[i + 1]!;
        const seg = [a.x, a.y, a.z, b.x, b.y, b.z, s.halfWidth[i]!, s.halfWidth[i + 1]!];
        const keys = new Set([this.key(a.x, a.y, a.z), this.key(b.x, b.y, b.z), this.key(...mid.copy(a).add(b).normalize().toArray())]);
        for (const k of keys) { const l = this.cells.get(k); if (l) l.push(...seg); else this.cells.set(k, seg.slice()); }
      }
    }
  }
  private key(x: number, y: number, z: number): number {
    // (Cells within ±512 of the origin on each axis: the globe's radius is 1, a cell at least 0.12 D.)
    return ((Math.floor(x / this.size) + 512) * 1024 + Math.floor(y / this.size) + 512) * 1024 + Math.floor(z / this.size) + 512;
  }
  // Whether p is clear of every street by `gap` beyond its half width.
  clear(p: THREE.Vector3, gap: number): boolean {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size), cz = Math.floor(p.z / this.size);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = this.cells.get(((cx + dx + 512) * 1024 + cy + dy + 512) * 1024 + cz + dz + 512);
      if (!l) continue;
      for (let i = 0; i < l.length; i += 8) {
        const ax = l[i]!, ay = l[i + 1]!, az = l[i + 2]!, bx = l[i + 3]! - ax, by = l[i + 4]! - ay, bz = l[i + 5]! - az;
        const px = p.x - ax, py = p.y - ay, pz = p.z - az, l2 = bx * bx + by * by + bz * bz;
        const u = l2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / l2)) : 0;
        const ex = px - bx * u, ey = py - by * u, ez = pz - bz * u, r = l[i + 6]! + (l[i + 7]! - l[i + 6]!) * u + gap;
        if (ex * ex + ey * ey + ez * ez < r * r) return false;
      }
    }
    return true;
  }
  // Every point clear of every street (beyond its half width).
  free(pts: readonly THREE.Vector3[]): boolean {
    for (const p of pts) if (!this.clear(p, 0)) return false;
    return true;
  }
}

// A tile's canonical hex (tile steps, inradius 0.5) laid evenly on the
// globe: its middle at the tile's center, its x axis toward the middle of
// the tile's first side, one tile step `k` radians (twice the tile's mean
// inner radius). Unlike the fans' mapping (cityStamp.ts toTile) it never
// shears, so a painted city keeps its shapes on an uneven tile.
export function onTile(g: Game, t: number): { toDir: (p: Pt2) => THREE.Vector3; k: number } {
  const { c, e1, e2, k } = tileFrame(g, t);
  return { toDir: (p) => c.clone().addScaledVector(e1, p.x * k).addScaledVector(e2, p.y * k).normalize(), k };
}
// The frame onTile lays things in (the terrain shader lays farms' plots in
// it too): the tile's center, e1 toward its side 0, e2 toward side 1, and
// k radians per tile step.
export function tileFrame(g: Game, t: number): { c: THREE.Vector3; e1: THREE.Vector3; e2: THREE.Vector3; k: number } {
  const tl = g.tiles[t]!, c = tl.center, n = tl.corners.length;
  const mids = tl.corners.map((cn, j) => g.globe.triCenters[cn]!.clone().add(g.globe.triCenters[tl.corners[(j + 1) % n]!]!).normalize());
  const k = (2 * mids.reduce((a, m) => a + m.angleTo(c), 0)) / n;
  const e1 = mids[0]!.clone().addScaledVector(c, -mids[0]!.dot(c)).normalize();
  let e2 = c.clone().cross(e1);
  if (e2.dot(mids[1]!) < 0) e2 = e2.negate();
  return { c: c.clone(), e1, e2, k };
}

export function standsAt(kind: BuildingKind, s: CitySpot): boolean {
  const depth = s.water - s.ground, rule = buildingEntry(kind).water;
  if (rule === 'float') return depth >= 0.0003;
  if (rule === 'shore') return depth >= 0.0003 || depth <= DRY;
  return depth <= DRY;
}

// Yaw (around the local up, matching setFromUnitVectors(UP, dir)) that turns
// a model's +x axis toward `target` along the surface.
export function facing(dir: THREE.Vector3, target: THREE.Vector3): number {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const inv = q.clone().invert();
  const local = target.clone().sub(dir).applyQuaternion(inv);
  return Math.atan2(-local.z, local.x);
}

// The convex hull of points (unit directions) on the tangent plane at c;
// near(d, r): whether d is inside it or within r of it. Null under three points.
function townHull(pts: THREE.Vector3[], c: THREE.Vector3): { near: (d: THREE.Vector3, r: number) => boolean } | null {
  if (pts.length < 3) return null;
  const e1 = Math.abs(c.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(c).normalize() : new THREE.Vector3(1, 0, 0).cross(c).normalize(), e2 = c.clone().cross(e1);
  const flat = (v: THREE.Vector3): [number, number] => [v.dot(e1), v.dot(e2)];
  const p = pts.map(flat).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const h: [number, number][] = [];
    for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop(); h.push(q); }
    return h.slice(0, -1);
  };
  const poly = [...half(p), ...half([...p].reverse())];   // counter-clockwise
  if (poly.length < 3) return null;
  return {
    near: (d, r) => {
      if (d.dot(c) < 0) return false;
      const q = flat(d);
      let inside = true, best = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        if (cross(a, b, q) < 0) inside = false;
        const abx = b[0] - a[0], aby = b[1] - a[1], l2 = abx * abx + aby * aby;
        const u = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * abx + (q[1] - a[1]) * aby) / l2)) : 0;
        best = Math.min(best, Math.hypot(q[0] - a[0] - u * abx, q[1] - a[1] - u * aby));
      }
      return inside || best < r;
    },
  };
}
