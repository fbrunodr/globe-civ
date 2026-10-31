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
import { USE, improvementFor, wonderBeside, isWonderKey, type ImprovementKey, type EraIndex } from './cities.ts';
import { ROOFS, buildingEntry, isFloraModel, isLotModel, placedGeometry, waterRule, type BuildingKind, type LotModelKind, type PlacedKind } from './buildingCatalog.ts';
import { ON_BARE_GROUND, isWonderModelKind, wonderModelKind, type SiteModel } from './wonderModels.ts';
import type { CatalogKind } from './propCatalog.ts';
import { HOUSE_VARIANTS, houseKind } from './houses.ts';
import { styleOf } from './architecture.ts';
import { LOT_SIZE, rhoOf, type Floors, type Footprint } from './town/geometry.ts';
import { planRoads, roadLines, ROAD_HALF_WIDTH } from './roads.ts';
import { farmAxis, paintFarm, WORK_OF, type Farm, type RuralDensity } from './farmPainter.ts';
import { CROP_HEIGHT, CROP_PALETTE, CROP_STAND_SATURATION, cropIndex, plotAt } from './rural/plots.ts';
import { SCATTER_GAP, areaLook, cropRegion, scatterIn, type Fill, type RGB } from './rural/look.ts';
import { ruralModelKind, type RuralModel } from './rural/models.ts';
import { SAFE_RHO, len as len2, pointInPoly, sub as sub2, type Pt as Pt2 } from './town/geometry.ts';
import { mulberry32, type Rng } from './rng.ts';
import { dressCity, type DressEra } from './cityDress.ts';
import { paintCity, CITY_CELL } from './cityPainter.ts';

// The ground at a spot of a tile (render.ts samples the terrain).
export interface CitySpot {
  dir: THREE.Vector3;
  ground: number; // height above radius 1
  water: number;
  slope: number;
  urban: number;  // soft urban weight of the painting here (0..1)
}
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
export interface Paving { points: THREE.Vector3[]; paved: boolean; rgb?: RGB; exact?: boolean }

interface CityLayout {
  sig: string;
  byTile: Map<number, PlacedBuilding[]>;
  streets: Street[];
  pavings: Paving[];
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
}

const UP = new THREE.Vector3(0, 1, 0);
const DRY = -0.00008;      // like the flora: the water this far under the ground
// A wonder on the sea (the Great Lighthouse): its scale (model units, tile
// steps) and its islet's radius (model units, wonderModels.ts).
const SEA_WONDER = 0.9, SEA_ISLET = 0.075;
// A wonder on flat land beside its city (the Pyramids, Stonehenge): half
// its square (tile steps: twice the size it has in a city) and the ground
// kept clear round it.
const LAND_WONDER_HALF = 0.12, LAND_WONDER_GAP = 0.015;
// A mine's adits: how many (by how far the countryside has filled up), how
// far apart, how far from the homestead, and the spots tried (every
// ADIT_STEP across the tile, tile steps).
const ADITS: Record<RuralDensity, number> = { low: 1, medium: 2, high: 3 };
// (Adits drawn twice true size, so they read beside their heaps.)
const ADIT_SCALE = 2;
const ADIT_GAP = 0.22, ADIT_HOME_GAP = 0.12, ADIT_REACH = 0.4, ADIT_STEP = 0.04;
// A farm's crops (tile steps): its rows CROP_ROW apart, a tuft every
// CROP_STEP along them, each CROP_WIDTH across (they overlap, so a plot
// reads as one crop); none within CROP_EDGE of a plot's border (the
// hedges), CROP_MARGIN of the safe zone's, CROP_HOME_GAP of the homestead.
// Rice stands in its paddies' water up to this share of its height.
export const PADDY_DEPTH = 0.45;
const CROP_ROW = 0.014, CROP_STEP = 0.01, CROP_WIDTH = 0.013, CROP_EDGE = 0.007, CROP_MARGIN = 0.03, CROP_HOME_GAP = 0.06;
// What a crop's yard holds: haystacks.
const HARVEST: Fill = { t: 'scatter', model: 'haystack', color: 0xc9a85a, per: 1.6 };
// Models are enlarged a little over true scale so towns read from afar
// (the drawings' lot sizes assume this scale).
const HOUSE_SCALE = 1.5;
// Machu Picchu: the least houses its summit holds (render.ts cuts it deeper
// until they fit), and how level ground must be to count as the cut's top.
export const SUMMIT_HOUSES = 6;
const SUMMIT_FLAT = 0.00008;
// Foundations: under a building whose footprint's corners differ by more
// than this (× the world scale); the model is FOUNDATION_UNIT on a side.
const FOUNDATION_MIN = 0.00005;
const FOUNDATION_UNIT = 0.01;
// Each civ builds its foundations its own way (by player): grey stone,
// sandstone, brick, basalt, timber, marble, adobe, mossy stone.
const FOUNDATION_STYLE = [0x8d877c, 0xb59a72, 0x9a6a55, 0x5f5a55, 0x7a5f45, 0xd2ccbe, 0xb08a5a, 0x6f7a62] as const;
// render.ts draws prop models at 1.5 × PROP_SIZE of the reference size.
const PROP_SCALE = 1.5 * 0.276;
// Dry ground a land building keeps round its footprint (tile steps).
export const WATER_GAP = 0.012;


const RURAL: Record<ImprovementKey, BuildingKind> = {
  farm: 'farmstead', mine: 'mineHead', camp: 'lodge', quarry: 'quarryStones', wetland: 'stiltHut', boats: 'fishingBoat',
};


// The look a city takes in a game era (cityDress.ts has four): the
// Renaissance keeps the medieval town; the Industrial and Modern eras build
// in their own styles (cityDress era 3, skyscrapers and all).
const DRESS_ERA: Record<EraIndex, DressEra> = { 0: 0, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 };
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

// A rural tile drawn with a rural drawing: land, a hex, its improvement a kind of work.
export const isFarmland = (g: Game, t: number): boolean => g.use[t] === USE.rural && g.tiles[t].corners.length === 6 && !g.isWater(t)
  && (() => { const k = improvementFor(g.terrainAt(t)); return k !== null && WORK_OF[k] !== null; })();
// How far a city's countryside has filled up: by its civ's era (until the tech tree).
const ruralDensity = (g: Game, city: City): RuralDensity => { const e = g.players[city.owner]!.era; return e === 0 ? 'low' : e === 1 ? 'medium' : 'high'; };

// Built-up tiles: the cities' centers.
export const isBuilt = (g: Game, t: number): boolean => g.use[t] === USE.center && g.tiles[t].corners.length === 6 && !g.isWater(t);


export class CityProps {
  private readonly cache = new Map<number, { sig: string; items: PlacedBuilding[] }>();
  private readonly layouts = new Map<number, CityLayout>();
  private readonly box = new Map<PlacedKind, readonly [number, number]>();
  private roads: THREE.Vector3[][] = [];
  private roadsKey = '';
  private version = 0;

  constructor(private readonly game: Game, private readonly sample: SpotSampler, private readonly sampleDir: DirSampler,
    private readonly scale: number) {}

  // Forget every layout (the ground under them changed).
  invalidate(): void { this.version++; }

  // Its rural tiles with drawings.
  private farmland(city: City): number[] {
    return this.game.cityTiles(city, USE.rural).filter((t) => isFarmland(this.game, t));
  }

  // Everything the town's layout depends on.
  private citySig(city: City, memo?: Map<number, string>): string {
    const m = memo?.get(city.id);
    if (m !== undefined) return m;
    const g = this.game;
    const wonders = g.cityWonders(city).map((w) => `${w}@${g.wondersBuilt.get(w)}`).join(',');
    const farms = this.farmland(city).map((t) => `${t}:${improvementFor(g.terrainAt(t))}:${g.pillaged[t]}`).join(';');
    const sig = `${city.id}|${city.pop}|${g.players[city.owner]!.era}|${city.buildings.has('walls') ? 'w' : ''}|${city.wonderTile ?? ''}|${city.building ?? ''}|${this.version}|${wonders}|${farms}`;
    memo?.set(city.id, sig);
    return sig;
  }

  // What this tile shows now, and a signature that changes when it must be rebuilt.
  private signature(t: number, memo?: Map<number, string>): string {
    const g = this.game;
    const u = g.use[t];
    if (u === USE.wild) {
      const owner = g.cityById.get(g.tileCity[t]);
      if (owner && this.landWonderOf(t)) return `town|${this.citySig(owner, memo)}`;
      const site = g.cities.some((c) => c.wonderTile === t) ? 's' : '';
      return g.wonderOn(t) ? `w${g.wonderOn(t)}` : site || (g.ruins[t] ? 'ruins' : '');
    }
    const city = g.cityById.get(g.tileCity[t]);
    if (!city) return '';
    if (u === USE.center || isFarmland(g, t)) return `town|${this.citySig(city, memo)}`;
    return `${u}|${city.id}|${g.eraAt(t)}|${g.useVersion}`;
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
    if (g.use[t] === USE.wild) {
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
    if (u === USE.rural && !isFarmland(g, t)) {
      const k = improvementFor(g.terrainAt(t));
      return [...(k ? this.rural(t, RURAL[k], rand) : []), ...(this.besideWonder(t) ?? [])];
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
    const walled = city.buildings.has('walls');
    const wet = (s: CitySpot) => s.water - s.ground > DRY;
    // How much a drawing is stretched or squeezed here (tiles vary in size).
    const local = (a: THREE.Vector3, b: THREE.Vector3) => Math.min(1.25, Math.max(0.7, a.angleTo(b) / (0.01 * D)));

    // No streets in a city (its diorama suggests them) or a farm.
    const streets: Street[] = [];
    const pavings: Paving[] = [];
    // Nothing may stand on the roads between cities: every building's
    // footprint is checked (shrunk a little if it touches one, left out if
    // it still does). Roads run up to the city's diorama.
    const roads = this.roadLines().map((pts) => ({ points: pts, halfWidth: pts.map(() => ROAD_HALF_WIDTH * D), paved: false }));
    const clear = new StreetIndex(roads, D);
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
    const fits = (b: PlacedBuilding, dry: boolean) => clear.free(this.footprint(b)) && (!dry || dryAround(b));
    const settle = (make: (shrink: number) => PlacedBuilding[], dry = true): PlacedBuilding[] => {
      for (const shrink of [1, 0.85]) { const bs = make(shrink); if (fits(bs[0]!, dry)) return bs; }
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
      free: (p) => !wet(this.sampleDir(toDir(p))),
    });
    // (The painter keeps them apart and off the water: each stands where painted.)
    dressed.buildings.forEach((b, n) => {
      const s = this.sampleDir(toDir(b.at)), rand = mulberry32(mix(city.id, n + 1));
      if (wet(s)) return;
      put(city.tile, ...this.standLot(b.model, s.dir, facing(s.dir, ahead(b.at, b.yaw)) + Math.PI / 2, b.hw, b.hd, unit * b.scale, rand, city.owner, [b.sx, b.sz]));
    });
    // (Exactly where painted: they meet the buildings' sides.)
    for (const r of dressed.painting.roads) pavings.push({ points: r.map(toDir), paved: era > 0, rgb: dressed.roadRgb, exact: true });

    // Walls: a segment between each pair of the ring's points, a tower at every other.
    if (dressed.wall) {
      const rand = mulberry32(city.id * 7919 + 5);
      const pts = dressed.wall.map((p) => this.sampleDir(toDir(p)));
      pts.forEach((s, n) => {
        if (n % 2 === 0 && n < pts.length - 1 && standsAt('wallTower', s)) {
          put(city.tile, ...settle((k) => this.stand('wallTower', s.dir, 0, HOUSE_SCALE * k, buildingEntry('wallTower').leaf, rand, city.owner), false));
        }
        const nx = pts[n + 1];
        if (!nx) return;
        const mid = this.sampleDir(s.dir.clone().add(nx.dir).normalize());
        if (!standsAt('wallSegment', mid)) return;
        // Stretched to the gap between its ends (model length 0.01 at prop scale).
        const len = Math.max(0.3, Math.min(4, s.dir.angleTo(nx.dir) / (0.01 * HOUSE_SCALE * this.scale * PROP_SCALE)));
        put(city.tile, ...settle((k) => this.stand('wallSegment', mid.dir, facing(mid.dir, nx.dir), HOUSE_SCALE * k, buildingEntry('wallSegment').leaf, rand, city.owner, len), false));
      });
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
      const sc = LAND_WONDER_HALF / Math.max(hw, hd), r = Math.SQRT2 * (LAND_WONDER_HALF + LAND_WONDER_GAP);
      const tl = g.tiles[t]!, i = tl.neighbors.indexOf(city.tile), n = tl.corners.length;
      const edge = g.globe.triCenters[tl.corners[i]!]!.clone().add(g.globe.triCenters[tl.corners[(i + 1) % n]!]!).normalize();
      // (Spots nearest the edge first; the first whose circle is all dry
      // and clear of roads, checked every 0.02 across it.)
      const disk: Pt2[] = [];
      for (let x = -r; x <= r; x += 0.02) for (let y = -r; y <= r; y += 0.02) if (Math.hypot(x, y) <= r) disk.push({ x, y });
      const spots: { p: Pt2; dist: number }[] = [];
      for (let x = -0.4; x <= 0.4; x += 0.02) for (let y = -0.4; y <= 0.4; y += 0.02) spots.push({ p: { x, y }, dist: toDir({ x, y }).angleTo(edge) });
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
      put(t, ...this.standLot(kind, dir, facing(dir, edge) + Math.PI / 2, hw, hd, k * sc, mulberry32(mix(t, 0x3a)), city.owner));
      keep.set(t, { p: best, r });
    }

    // The countryside: each worked land tile's ground is painted by the
    // terrain shader (plots, spoil, pits, clearings); on it stand its
    // farm's homestead and a few yards (farmPainter.ts), each filled with
    // what the tile grows or digs (rural/look.ts): haystacks by the grain,
    // a herd, a grove, heaps, stones, logs.
    const density = ruralDensity(g, city);
    for (const t of this.farmland(city)) {
      const imp = improvementFor(g.terrainAt(t))!, work = WORK_OF[imp]!;
      const { toDir: toT } = onTile(g, t);
      const ko = keep.get(t);
      const farm = paintFarm({ work, axis: farmAxis(t), density, seed: mix(t, 0x51), free: (p) => (!ko || len2(sub2(p, ko.p)) > ko.r) && !wet(this.sampleDir(toT(p))) && clear.free([toT(p)]) });
      if (!farm) continue;
      const clearHere = new StreetIndex([...streets, ...roads], D);
      const settleHere = (make: (shrink: number) => PlacedBuilding[]): PlacedBuilding[] => {
        for (const shrink of [1, 0.85]) { const bs = make(shrink); if (clearHere.free(this.footprint(bs[0]!)) && dryAround(bs[0]!)) return bs; }
        return [];
      };
      const one = (m: RuralModel, p: Pt2, yaw: number, s: number, leaf: number) => {
        const dir = toT(p), smp = this.sampleDir(dir);
        if (wet(smp)) return;
        const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
        const pos = dir.clone().multiplyScalar(1 + smp.ground - 0.00005 * this.scale);
        const b: PlacedBuilding = { kind: ruralModelKind(m), matrix: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(s, s, s)), color: new THREE.Color(1, 1, 1), leaf: new THREE.Color(leaf) };
        // (Never on a road crossing the farm.)
        if (clearHere.free(this.footprint(b))) put(t, b);
      };
      // (Yaws on the tile: the angle of a direction drawn there.)
      const yawOf = (a: Pt2, b: Pt2) => { const da = toT(a), db = toT(b); return facing(da, db) + Math.PI / 2; };
      const fillWith = (fl: Fill, poly: readonly Pt2[], seed: number) => {
        if (fl.t === 'scatter') {
          const r = mulberry32(seed + 1);
          for (const p of scatterIn(poly, fl.per, seed, SCATTER_GAP[fl.model])) one(fl.model, p, r() * 6.28, D * (0.8 + 0.4 * r()), fl.color);
        }
      };
      if (imp === 'mine') this.adits(t, farm.home, ko, ADITS[density], (bs) => put(t, ...bs), settle, (poly, seed) => fillWith(areaLook(imp, g.biome[t]!, null, 0, 0, t).fill, poly, seed), city.owner);
      // (A mine's yards are its adits' spoil.)
      if (imp !== 'mine') farm.yards.forEach((poly, i) => {
        const look = areaLook(imp, g.biome[t]!, g.feature[t] ?? null, g.map.temperature[t]!, i, t);
        // (The crop itself is painted: its yard holds the harvest.)
        fillWith(look.fill.t === 'rows' ? HARVEST : look.fill, poly, mix(t, i));
        if (look.extra) fillWith(look.extra, poly, mix(t, i + 99));
        // A camp's drying rack by each clearing.
        const near = poly.reduce((a, p) => (len2(sub2(p, farm.home)) < len2(sub2(a, farm.home)) ? p : a));
        if (imp === 'camp') one('rack', near, yawOf(near, farm.home), D, 0xffffff);
      });
      // (Farms and rice paddies grow crops; peat is only cut.)
      if (imp === 'farm' || (imp === 'wetland' && cropRegion(imp, g.biome[t]!, g.feature[t] ?? null, g.map.temperature[t]!) === 'paddy')) {
        this.crops(t, farm, ko, (b) => { if (clearHere.free(this.footprint(b))) put(t, b); });
      }
      // The homestead: a house in the civ's style and its barn, facing along the grid.
      const placeLot = (kind: Footprint, floors: Floors, p: Pt2, lr: Rng) => {
        const s0 = this.sampleDir(toT(p));
        if (wet(s0)) return;
        const f = toT({ x: p.x + 0.01 * farm.u.x, y: p.y + 0.01 * farm.u.y });
        const hk = houseKind(styleOf(g.players[city.owner]!.name, floors), kind, floors, Math.floor(lr() * HOUSE_VARIANTS));
        const [lw, ld] = LOT_SIZE[kind];
        put(t, ...settleHere((k) => this.standLot(hk, s0.dir, facing(s0.dir, f) + Math.PI / 2, lw, ld, D * local(s0.dir, f) * k, lr, city.owner)));
      };
      const v = { x: -farm.u.y, y: farm.u.x };
      placeLot('b22', 1, { x: farm.home.x - 0.012 * v.x, y: farm.home.y - 0.012 * v.y }, mulberry32(mix(t, 0x5a)));
      if (density !== 'low') placeLot('b32', 1, { x: farm.home.x + 0.02 * v.x, y: farm.home.y + 0.02 * v.y }, mulberry32(mix(t, 0x5b)));
    }
    return { sig, byTile, streets, pavings };
  }

  // Half extents of a model's footprint (x, z), in model units.
  private modelBox(kind: PlacedKind): readonly [number, number] {
    let r = this.box.get(kind);
    if (r === undefined) {
      const geo = placedGeometry(kind);
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      r = [Math.max(-b.min.x, b.max.x), Math.max(-b.min.z, b.max.z)];
      this.box.set(kind, r);
    }
    return r;
  }

  // Machu Picchu: houses and halls of dressed stone, a city cell each, on
  // the summit cut flat for them (render.ts levelSummit), filling every cell
  // of the flat top on a grid round its highest point.
  private machuPicchu(t: number): PlacedBuilding[] {
    const rand = mulberry32((t + 3) * 2654435761);
    let top: CitySpot | null = null;
    for (const sp of this.tileSpots(t, 8, rand)) {
      const s = this.sample(t, sp.i, sp.wa, sp.wb);
      if (!top || s.ground > top.ground) top = s;
    }
    if (!top) return [];
    const P = top.dir, { e1, k } = tileFrame(this.game, t), cell = CITY_CELL * k;
    const u = e1.clone().addScaledVector(P, -e1.dot(P)).normalize(), w = P.clone().cross(u);
    const at = (x: number, y: number) => P.clone().addScaledVector(u, x * cell).addScaledVector(w, y * cell).normalize();
    const flat = (d: THREE.Vector3) => Math.abs(this.sampleDir(d).ground - top!.ground) < SUMMIT_FLAT * this.scale;
    const out: PlacedBuilding[] = [];
    // (Nudged so the grid's cells fall round the top, not across it.)
    for (const [ox, oy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]] as const) {
      const here: PlacedBuilding[] = [];
      for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) {
        const x = a + ox, y = b + oy;
        if (![[x, y], [x - 0.45, y - 0.45], [x + 0.45, y - 0.45], [x + 0.45, y + 0.45], [x - 0.45, y + 0.45]].every(([p, q]) => flat(at(p!, q!)))) continue;
        const d = at(x, y), quarter = Math.floor(rand() * 4);
        const qn = new THREE.Quaternion().setFromUnitVectors(UP, d).multiply(new THREE.Quaternion().setFromAxisAngle(UP, facing(d, at(x + 1, y)) + Math.PI / 2 + quarter * Math.PI / 2));
        const pos = d.clone().multiplyScalar(1 + top.ground - 0.00005 * this.scale);
        here.push({ kind: ruralModelKind(rand() < 0.3 ? 'incaHall' : 'incaHouse'), matrix: new THREE.Matrix4().compose(pos, qn, new THREE.Vector3(k, k, k)), color: new THREE.Color(1, 1, 1).multiplyScalar(0.92 + 0.12 * rand()), leaf: new THREE.Color(1, 1, 1) });
      }
      if (here.length > out.length) out.splice(0, out.length, ...here);
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

  // Where a wonder on the sea stands: on the line from the tile's middle to
  // the middle of the edge it shares with its city, as near that edge as
  // its islet keeps wholly in the water; facing the city.
  private seaSpot(t: number): { dir: THREE.Vector3; toward: THREE.Vector3; r: number; k: number } | null {
    const g = this.game, city = g.cityById.get(g.tileCity[t]!);
    if (!city) return null;
    const tl = g.tiles[t]!, i = tl.neighbors.indexOf(city.tile);
    if (i < 0) return null;
    const n = tl.corners.length, c = tl.center;
    const edge = g.globe.triCenters[tl.corners[i]!]!.clone().add(g.globe.triCenters[tl.corners[(i + 1) % n]!]!).normalize();
    const { k } = onTile(g, t), r = SEA_ISLET * SEA_WONDER * k;
    const wet = (d: THREE.Vector3) => { const s = this.sampleDir(d); return s.water - s.ground >= 0.0003; };
    for (let f = 0.75; f >= 0; f -= 0.05) {
      const dir = c.clone().lerp(edge, f).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      const ring = Array.from({ length: 8 }, (_, j) => dir.clone().add(new THREE.Vector3(Math.cos(j * Math.PI / 4) * r, 0, Math.sin(j * Math.PI / 4) * r).applyQuaternion(q)).normalize());
      if (wet(dir) && ring.every(wet)) return { dir, toward: g.tiles[city.tile]!.center, r, k };
    }
    return null;
  }
  private seaWonder(t: number, kind: LotModelKind): PlacedBuilding[] {
    const s = this.seaSpot(t);
    if (!s) return [];
    const water = this.sampleDir(s.dir).water;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, s.dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, facing(s.dir, s.toward) + Math.PI / 2));
    return [{ kind, matrix: new THREE.Matrix4().compose(s.dir.clone().multiplyScalar(1 + water), q, new THREE.Vector3().setScalar(SEA_WONDER * s.k)), color: new THREE.Color(1, 1, 1), leaf: new THREE.Color(1, 1, 1) }];
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
    const town = paintCity({ wonders: 0, skyscrapers: 0, buildings: 12, seed: mix(t, 0x7ab), free: (p) => { const s = this.sampleDir(toDir(p)); return s.water - s.ground <= DRY; } });
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
    for (const b of [...l.byTile.values()].flat()) {
      if (isFloraModel(b.kind) || b.kind === 'foundation') continue;
      const [hx, hz] = this.modelBox(b.kind), G = isLotModel(b.kind) ? 1 : PROP_SCALE * this.scale;
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      b.matrix.decompose(pos, q, sc);
      const box: Box = { inv: b.matrix.clone().invert(), hx: hx * G, hz: hz * G, gx: gap / sc.x, gz: gap / sc.z, at: pos, reach: Math.hypot(hx * G * sc.x, hz * G * sc.z) + gap };
      if (box.reach > cell) big.push(box); else { const k = key(pos); const c = cells.get(k); if (c) c.push(box); else cells.set(k, [box]); }
    }
    const streets = new StreetIndex(l.streets, D);
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
    const g = this.game, key = `${g.useVersion}|${g.cities.length}`;
    if (this.roadsKey !== key) {
      this.roadsKey = key;
      const planned = planRoads(g);
      this.roads = roadLines(g, planned).map((r) => r.points);
    }
    return this.roads;
  }
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

  // A farm's crops: tufts in rows along its plots (rural/plots.ts, the
  // layout the ground is painted with), inside its safe zone, off the
  // hedges, the bare ploughed plots, the homestead and its yards, the water
  // (rice stands in it, its foot under: up to PADDY_DEPTH of its height);
  // each the colour and height of its plot's crop.
  private crops(t: number, farm: Farm, keepOut: { p: Pt2; r: number } | undefined, put: (b: PlacedBuilding) => void): void {
    const g = this.game, D = g.globe.avgEdgeAngle, { toDir } = onTile(g, t);
    const region = cropRegion(improvementFor(g.terrainAt(t)), g.biome[t]!, g.feature[t] ?? null, g.map.temperature[t]!);
    const tint = CROP_PALETTE[region].map((h) => {
      const c = new THREE.Color(h), l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
      return new THREE.Color(l + (c.r - l) * CROP_STAND_SATURATION, l + (c.g - l) * CROP_STAND_SATURATION, l + (c.b - l) * CROP_STAND_SATURATION);
    });
    const a = farmAxis(t), u = { x: Math.cos(a), y: Math.sin(a) }, v = { x: -u.y, y: u.x };
    const rand = mulberry32(mix(t, 0xc4));
    for (let x = -0.45; x <= 0.45; x += CROP_ROW) for (let y = -0.45; y <= 0.45; y += CROP_STEP) {
      const pu = x + (rand() - 0.5) * CROP_ROW * 0.3, pv = y + (rand() - 0.5) * CROP_STEP * 0.8, yaw = rand() * Math.PI, shade = 0.9 + 0.2 * rand();
      const p = { x: pu * u.x + pv * v.x, y: pu * u.y + pv * v.y };
      if (rhoOf(6, p) > SAFE_RHO - CROP_MARGIN) continue;
      const plot = plotAt(pu, pv, t), k = cropIndex(plot.h), height = CROP_HEIGHT[k];
      if (height === 0 || plot.edge < CROP_EDGE) continue;
      if (len2(sub2(p, farm.home)) < CROP_HOME_GAP || farm.yards.some((poly) => pointInPoly(p, poly)) || (keepOut && len2(sub2(p, keepOut.p)) < keepOut.r)) continue;
      const dir = toDir(p), smp = this.sampleDir(dir), tall = height * D * (0.9 + 0.2 * rand());
      if (smp.water - smp.ground > (region === 'paddy' ? PADDY_DEPTH * tall : DRY)) continue;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
      const pos = dir.clone().multiplyScalar(1 + smp.ground - 0.00005 * this.scale);
      put({ kind: ruralModelKind('crop'), matrix: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(CROP_WIDTH * D, tall, CROP_WIDTH * D)),
        color: new THREE.Color(1, 1, 1), leaf: tint[k]!.clone().multiplyScalar(shade) });
    }
  }

  // A mine's adits: where its tile is steepest, each cut into the slope
  // (its back to the hill, facing down it), apart from each other and the
  // homestead, its spoil heaps below it.
  private adits(t: number, home: Pt2, keepOut: { p: Pt2; r: number } | undefined, want: number, put: (bs: PlacedBuilding[]) => void,
    settle: (make: (shrink: number) => PlacedBuilding[], dry?: boolean) => PlacedBuilding[],
    spoil: (poly: readonly Pt2[], seed: number) => void, owner: number): void {
    const { toDir } = onTile(this.game, t);
    const D = this.game.globe.avgEdgeAngle;
    const h = (p: Pt2) => this.sampleDir(toDir(p)).ground;
    const at = (p: Pt2, d: Pt2, s: number): Pt2 => ({ x: p.x + d.x * s, y: p.y + d.y * s });
    const spots: { p: Pt2; down: Pt2; steep: number }[] = [];
    for (let x = -ADIT_REACH; x <= ADIT_REACH; x += ADIT_STEP) for (let y = -ADIT_REACH; y <= ADIT_REACH; y += ADIT_STEP) {
      const p = { x, y };
      if (rhoOf(6, p) > 0.8 || len2(sub2(p, home)) < ADIT_HOME_GAP || (keepOut && len2(sub2(p, keepOut.p)) < keepOut.r + ADIT_HOME_GAP)) continue;
      const gx = h({ x: x + 0.02, y }) - h({ x: x - 0.02, y }), gy = h({ x, y: y + 0.02 }) - h({ x, y: y - 0.02 });
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
      const yaw = facing(da, toDir(at(p, down, 0.01))) + Math.PI / 2;
      const bs = settle((k) => this.standLot(ruralModelKind('adit'), da, yaw, 0.004, 0.002, D * k * ADIT_SCALE, mulberry32(mix(t, placed.length)), owner), false);
      if (bs.length === 0) continue;
      put(bs);
      // Its spoil: a yard down the slope in front of it.
      const c = at(p, down, 0.07), side = { x: -down.y, y: down.x };
      spoil([at(at(c, down, -0.035), side, -0.06), at(at(c, down, -0.035), side, 0.06), at(at(c, down, 0.035), side, 0.06), at(at(c, down, 0.035), side, -0.06)], mix(t, 0xad + placed.length));
      placed.push(p);
    }
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
    // (A wonder on the bare ground stands at the lowest corner, sunk into
    // the slope: no foundation.)
    const bare = isWonderModelKind(kind) && ON_BARE_GROUND.has(kind.slice('wonder|'.length));
    const base = bare ? low : high;
    const sink = 0.00012 * this.scale, shade = 0.92 + 0.12 * rand();
    const out: PlacedBuilding[] = [{
      kind,
      matrix: new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + base - sink), q, new THREE.Vector3(s * stretch[0], s, s * stretch[1])),
      color: new THREE.Color(shade, shade, shade),
      leaf: new THREE.Color(1, 1, 1),
    }];
    if (base - low >= FOUNDATION_MIN * this.scale) {
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

// Whether a model may stand at a spot: on dry ground (any slope: a
// foundation makes up the difference); boats on water deep enough; shore
// buildings on either.
// Streets in buckets, to ask quickly whether points are clear of all of them.
class StreetIndex {
  private readonly cells = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; wa: number; wb: number }[]>();
  private readonly size: number;
  constructor(streets: readonly Street[], D: number) {
    this.size = 0.12 * D;
    for (const s of streets) {
      for (let i = 0; i + 1 < s.points.length; i++) {
        const seg = { a: s.points[i]!, b: s.points[i + 1]!, wa: s.halfWidth[i]!, wb: s.halfWidth[i + 1]! };
        const keys = new Set([this.key(seg.a), this.key(seg.b), this.key(seg.a.clone().add(seg.b).normalize())]);
        for (const k of keys) { const l = this.cells.get(k); if (l) l.push(seg); else this.cells.set(k, [seg]); }
      }
    }
  }
  private key(d: THREE.Vector3, dx = 0, dy = 0, dz = 0): string {
    return `${Math.floor(d.x / this.size) + dx},${Math.floor(d.y / this.size) + dy},${Math.floor(d.z / this.size) + dz}`;
  }
  // Whether p is clear of every street by `gap` beyond its half width.
  clear(p: THREE.Vector3, gap: number): boolean {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const s of this.cells.get(this.key(p, dx, dy, dz)) ?? []) {
        const ab = s.b.clone().sub(s.a), l2 = ab.lengthSq();
        const u = l2 > 0 ? Math.max(0, Math.min(1, p.clone().sub(s.a).dot(ab) / l2)) : 0;
        if (s.a.clone().addScaledVector(ab, u).distanceTo(p) < s.wa + (s.wb - s.wa) * u + gap) return false;
      }
    }
    return true;
  }
  // Every point clear of every street (beyond its half width).
  free(pts: readonly THREE.Vector3[]): boolean {
    for (const p of pts) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const s of this.cells.get(this.key(p, dx, dy, dz)) ?? []) {
          const ab = s.b.clone().sub(s.a), l2 = ab.lengthSq();
          const u = l2 > 0 ? Math.max(0, Math.min(1, p.clone().sub(s.a).dot(ab) / l2)) : 0;
          if (s.a.clone().addScaledVector(ab, u).distanceTo(p) < s.wa + (s.wb - s.wa) * u) return false;
        }
      }
    }
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
