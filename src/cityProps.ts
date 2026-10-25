// What stands on a city's tiles. A city is painted on its center tile
// (cityPainter.ts, dressed by cityDress.ts): its houses, skyscrapers and
// wonders, the roads between them, its walls, laid evenly on the tile
// (onTile). Its other tiles show what is worked there.
//
// Nothing is built on water or right beside it.
//
// Rural land tiles show a rural drawing (src/rural: tracks, worked areas,
// the homestead, a building spot) chosen by the tracks that cross their
// sides; what the areas hold is the tile's (rural/look.ts). A city's rural
// tracks form a tree that joins its center at a few sides (ruralLinks).
// Fishing boats stay on their water tiles. Everything is a pure function of
// the city's state and the seed, so a reload looks identical.

import * as THREE from 'three';
import type { Game, City } from './game.ts';
import { USE, improvementFor, type ImprovementKey, type EraIndex } from './cities.ts';
import { ROOFS, PROP_MODEL, buildingEntry, isFloraModel, isLotModel, placedGeometry, waterRule, type BuildingKind, type LotModelKind, type PlacedKind } from './buildingCatalog.ts';
import { wonderModelKind, type SiteModel } from './wonderModels.ts';
import type { CatalogKind } from './propCatalog.ts';
import { HOUSE_VARIANTS, houseKind } from './houses.ts';
import { styleOf } from './architecture.ts';
import { LOT_SIZE, isBuilding, type Floors, type Footprint } from './town/geometry.ts';
import { planRoads, roadLines, ROAD_HALF_WIDTH } from './roads.ts';
import { classOf, key as colouringKey, type EdgeValue } from './town/edges.ts';
import { toTile, STAMP_STEP, type FanPt } from './tileFan.ts';
import { pickRural, TRACK_HALF, WORK_OF, type RuralDensity, type Work } from './rural/index.ts';
import { SCATTER_GAP, areaLook, fieldEdge, gridIn, rowsIn, scatterIn, type Fill, type RGB } from './rural/look.ts';
import { ruralModelKind, type RuralModel } from './rural/models.ts';
import { densify as densify2, len as len2, sub as sub2, type Pt as Pt2 } from './town/geometry.ts';
import { mulberry32, type Rng } from './rng.ts';
import { dressCity } from './cityDress.ts';
import { paintCity } from './cityPainter.ts';

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
// Models are enlarged a little over true scale so towns read from afar
// (the drawings' lot sizes assume this scale).
const HOUSE_SCALE = 1.5;
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
const ruralDensity = (g: Game, city: City): RuralDensity => (['low', 'medium', 'high'] as const)[g.players[city.owner]!.era] ?? 'high';

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

  // The built-up tiles of a city: its center.
  private built(city: City): number[] {
    return [city.tile].filter((t) => isBuilt(this.game, t));
  }
  // Its rural tiles with drawings.
  private farmland(city: City): number[] {
    return this.game.cityTiles(city, USE.rural).filter((t) => isFarmland(this.game, t));
  }

  // The tracks of a city's countryside: a tree over its rural tiles, joined
  // to the town at as few sides as it can (one per piece of countryside
  // that touches the town), each link the edge a track crosses. (`a:b`,
  // both ways.)
  private readonly linkCache = new Map<number, { key: string; links: Set<string> }>();
  private ruralLinks(city: City): Set<string> {
    const g = this.game, rural = this.farmland(city), built = new Set(this.built(city));
    const key = `${[...built].join(',')}|${rural.join(',')}`;
    const hit = this.linkCache.get(city.id);
    if (hit && hit.key === key) return hit.links;
    const links = new Set<string>(), R = new Set(rural), done = new Set<number>();
    const link = (a: number, b: number) => { links.add(`${a}:${b}`); links.add(`${b}:${a}`); };
    for (const start of [...rural].sort((a, b) => a - b)) {
      if (done.has(start)) continue;
      const into = g.tiles[start].neighbors.filter((n) => built.has(n)).sort((a, b) => a - b)[0];
      if (into === undefined) continue;
      link(start, into);
      done.add(start);
      const queue = [start];
      while (queue.length) {
        const u = queue.shift()!;
        for (const n of g.tiles[u].neighbors) if (R.has(n) && !done.has(n)) { done.add(n); link(u, n); queue.push(n); }
      }
    }
    this.linkCache.set(city.id, { key, links });
    return links;
  }
  ruralLink(t: number, n: number): boolean { return this.linked(t, n); }
  private linked(t: number, n: number): boolean {
    const g = this.game, city = g.cityById.get(g.tileCity[t]!) ?? g.cityById.get(g.tileCity[n]!);
    return !!city && this.ruralLinks(city).has(`${t}:${n}`);
  }

  // Whether a rural tile's track crosses its edge with neighbor n
  // (ruralLinks): the same from either side.
  edgeValue(t: number, n: number): EdgeValue {
    return this.linked(t, n) ? 1 : 0;
  }
  colouring(t: number): EdgeValue[] {
    return this.game.tiles[t].neighbors.map((n) => this.edgeValue(t, n));
  }

  // Everything the town's layout depends on.
  private citySig(city: City, memo?: Map<number, string>): string {
    const m = memo?.get(city.id);
    if (m !== undefined) return m;
    const g = this.game;
    const wonders = g.wondersAt(city.tile).join(',');
    const farms = this.farmland(city).map((t) => `${t}:${improvementFor(g.terrainAt(t))}:${colouringKey(this.colouring(t))}`).join(';');
    const sig = `${city.id}|${city.pop}|${g.players[city.owner]!.era}|${city.buildings.has('walls') ? 'w' : ''}|${city.wonderTile ?? ''}|${city.building ?? ''}|${this.version}|${wonders}|${farms}`;
    memo?.set(city.id, sig);
    return sig;
  }

  // What this tile shows now, and a signature that changes when it must be rebuilt.
  private signature(t: number, memo?: Map<number, string>): string {
    const g = this.game;
    const u = g.use[t];
    if (u === USE.wild) {
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
      // Lighthouse on the sea; scaffolding while one goes up.)
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
    const dirAt = (p: FanPt) => {
      const tl = g.tiles[p.t], k = tl.corners.length;
      const A = g.globe.triCenters[tl.corners[p.i]!]!, B = g.globe.triCenters[tl.corners[(p.i + 1) % k]!]!;
      const w0 = 1 - p.wa - p.wb;
      return new THREE.Vector3(tl.center.x * w0 + A.x * p.wa + B.x * p.wb, tl.center.y * w0 + A.y * p.wa + B.y * p.wb, tl.center.z * w0 + A.z * p.wa + B.z * p.wb).normalize();
    };
    const wet = (s: CitySpot) => s.water - s.ground > DRY;
    // How much a drawing is stretched or squeezed here (tiles vary in size).
    const local = (a: THREE.Vector3, b: THREE.Vector3) => Math.min(1.25, Math.max(0.7, a.angleTo(b) / (0.01 * D)));

    // No streets in the city (its diorama suggests them); farm tracks below.
    const streets: Street[] = [];
    const pavings: Paving[] = [];
    // Street widths follow the local tile size (tiles vary in size).
    const widths = (x: { pts: FanPt[]; hw: number[] }) => {
      const dirs = x.pts.map(dirAt);
      return { pts: dirs, hw: dirs.map((d, i) => {
        const o = dirs[i + 1] ?? dirs[i - 1];
        return x.hw[i]! * D * (o ? Math.min(1.25, Math.max(0.7, d.angleTo(o) / (STAMP_STEP * D))) : 1);
      }) };
    };
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
      civ: g.players[city.owner]!.name, era, pop: city.pop, wonders, walled, seed: mix(city.id, 0xc17),
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

    // The countryside: each rural tile's drawing (its tracks, worked areas,
    // homestead and building spot), its areas filled as the tile grows them.
    const density = ruralDensity(g, city);
    for (const t of this.farmland(city)) {
      const imp = improvementFor(g.terrainAt(t))!, work = WORK_OF[imp] as Work;
      const colouring = this.colouring(t), { key, turn } = classOf(colouring);
      const d = pickRural(key, work, density, mix(t, 0x51));
      const toT = (p: Pt2) => dirAt(toTile(t, turn, p));
      // Tracks: a lane's width.
      const tracks: Street[] = [];
      for (const tr of d.tracks) {
        const pts = densify2(tr.pts, STAMP_STEP);
        const hw = pts.map(() => TRACK_HALF);
        // (Scaled with the tile.)
        const wd = widths({ pts: pts.map((p) => toTile(t, turn, p)), hw });
        tracks.push({ points: wd.pts, halfWidth: wd.hw, paved: false });
      }
      streets.push(...tracks);
      // What the homestead keeps clear of: its tracks too.
      const clearHere = new StreetIndex([...tracks, ...streets, ...roads], D);
      const settleHere = (make: (shrink: number) => PlacedBuilding[]): PlacedBuilding[] => {
        for (const shrink of [1, 0.85]) { const bs = make(shrink); if (clearHere.free(this.footprint(bs[0]!)) && dryAround(bs[0]!)) return bs; }
        return [];
      };
      const rand = mulberry32(mix(t, 0x77));
      const one = (m: RuralModel, p: Pt2, yaw: number, s: number, leaf: number, sx = 1, sy = 1, sz = 1) => {
        const dir = toT(p), smp = this.sampleDir(dir);
        if (wet(smp)) return;
        const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
        const pos = dir.clone().multiplyScalar(1 + smp.ground - 0.00005 * this.scale);
        const b: PlacedBuilding = { kind: ruralModelKind(m), matrix: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(s * sx, s * sy, s * sz)), color: new THREE.Color(1, 1, 1), leaf: new THREE.Color(leaf) };
        // (Never on a track or a road crossing the farm.)
        if (clearHere.free(this.footprint(b))) put(t, b);
      };
      // (A drawing's yaw turns with the tile: the angle of its x axis there.)
      const yawOf = (a: Pt2, b: Pt2) => { const da = toT(a), db = toT(b); return facing(da, db) + Math.PI / 2; };
      const sc = D;
      const fillWith = (f: Fill, poly: readonly Pt2[], seed: number) => {
        if (f.t === 'rows') {
          // (Each row a shade of its own, so the field ripples.)
          const r = mulberry32(seed + 2), base = new THREE.Color(f.color);
          for (const [a, b] of rowsIn(poly, f.spacing, 0.002)) {
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, k = 0.9 + 0.2 * r();
            one('ridge', mid, yawOf(a, b) - Math.PI / 2, sc, base.clone().multiplyScalar(k).getHex(), len2(sub2(b, a)), f.height * (0.9 + 0.2 * r()), f.width);
          }
        } else if (f.t === 'trees') {
          const r = mulberry32(seed);
          for (const p of gridIn(poly, f.spacing)) one(f.model, p, r() * 6.28, sc * (0.85 + 0.3 * r()), f.color);
        } else if (f.t === 'scatter') {
          const r = mulberry32(seed + 1);
          for (const p of scatterIn(poly, f.per, seed, SCATTER_GAP[f.model])) one(f.model, p, r() * 6.28, sc * (0.8 + 0.4 * r()), f.color);
        }
      };
      // Field edges (hedgerows, walls, fences) in the gaps between fields, once each.
      const edge = fieldEdge(imp, g.biome[t]!), edgeAt: Pt2[] = [];
      const edgeRand = mulberry32(mix(t, 0xed));
      d.areas.forEach((poly, i) => {
        const look = areaLook(imp, g.biome[t]!, g.feature[t] ?? null, g.map.temperature[t]!, i, t);
        if (edge) {
          const c = poly.reduce((a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }), { x: 0, y: 0 });
          poly.forEach((p, k) => {
            const q = poly[(k + 1) % poly.length]!, l = len2(sub2(q, p)), n = Math.max(1, Math.round(l / edge.step));
            for (let m = 0; m < n; m++) {
              const u = (m + 0.5) / n, e = { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u };
              // (Out into the gap, away from the field's middle.)
              const out = sub2(e, c), ol = len2(out) || 1, at = { x: e.x + (out.x / ol) * 0.004, y: e.y + (out.y / ol) * 0.004 };
              if (edgeAt.some((o) => len2(sub2(o, at)) < edge.step * 0.7)) continue;
              edgeAt.push(at);
              const yaw = edge.model === 'bush' ? edgeRand() * 6.28 : yawOf(p, q) - Math.PI / 2;
              one(edge.model, at, yaw, sc * (edge.model === 'bush' ? 0.8 + 0.45 * edgeRand() : 1), edge.color, 1, 1, 1);
            }
          });
        }
        const points = poly.map(toT);
        if (wet(this.sampleDir(points.reduce((a, p) => a.add(p), new THREE.Vector3()).normalize()))) return;
        pavings.push({ points, paved: false, rgb: look.ground });
        fillWith(look.fill, poly, mix(t, i));
        if (look.extra) fillWith(look.extra, poly, mix(t, i + 99));
        // A mine's adit at the heap nearest the homestead, facing it.
        // A camp's drying racks by each clearing, on the homestead's side.
        if (imp === 'camp') {
          const near = poly.reduce((a, p) => (len2(sub2(p, d.spot)) < len2(sub2(a, d.spot)) ? p : a));
          one('rack', near, yawOf(near, d.spot), sc, 0xffffff);
        }
        if (imp === 'mine') {
          const near = poly.reduce((a, p) => (len2(sub2(p, d.spot)) < len2(sub2(a, d.spot)) ? p : a));
          const da = toT(near), smp = this.sampleDir(da);
          if (!wet(smp)) put(t, ...settle((k) => this.standLot(ruralModelKind('adit'), da, facing(da, toT(d.spot)) + Math.PI / 2, 0.004, 0.002, D * k, rand, city.owner), false));
        }
      });
      // The homestead: houses in the civ's style, sheds.
      const placeLot = (kind: Footprint, floors: Floors, p: Pt2, yaw: number, lr: Rng) => {
        const s0 = this.sampleDir(toT(p));
        if (wet(s0)) return;
        const f = toT({ x: p.x + 0.01 * Math.cos(yaw), y: p.y + 0.01 * Math.sin(yaw) });
        const hk = houseKind(styleOf(g.players[city.owner]!.name, floors), kind, floors, Math.floor(lr() * HOUSE_VARIANTS));
        const [lw, ld] = LOT_SIZE[kind];
        put(t, ...settleHere((k) => this.standLot(hk, s0.dir, facing(s0.dir, f) + Math.PI / 2, lw, ld, D * local(s0.dir, f) * k, lr, city.owner)));
      };
      for (const l of d.lots) {
        const lr = mulberry32(mix(t, Math.round(l.x * 1e4) ^ Math.round(l.y * 1e4)));
        if (isBuilding(l.kind)) { placeLot(l.kind, l.floors ?? 1, l, l.yaw, lr); continue; }
        const s0 = this.sampleDir(toT(l));
        if (wet(s0)) continue;
        const kind = PROP_MODEL[l.kind], f = toT({ x: l.x + 0.01 * Math.cos(l.yaw), y: l.y + 0.01 * Math.sin(l.yaw) });
        put(t, this.make(kind, s0.dir, s0.ground, facing(s0.dir, f) + Math.PI / 2, HOUSE_SCALE * local(s0.dir, f), buildingEntry(kind).leaf, lr));
      }
      // The building spot: a barn (the countryside's own buildings come later).
      placeLot('b44', 1, d.spot, d.spot.yaw, mulberry32(mix(t, 0x5b)));
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

  // A wonder on a mountain top: at the highest point of the tile (levelled
  // for it by the renderer).
  private summit(t: number, kind: BuildingKind): PlacedBuilding[] {
    const rand = mulberry32((t + 3) * 2654435761);
    let best: CitySpot | null = null;
    for (const sp of this.tileSpots(t, 6, rand)) {
      const s = this.sample(t, sp.i, sp.wa, sp.wb);
      if (!best || s.ground > best.ground) best = s;
    }
    const c = this.sample(t, 0, 0.01, 0.01);
    if (!best || c.ground >= best.ground) best = c;
    return this.stand(kind, best.dir, rand() * Math.PI * 2, HOUSE_SCALE, buildingEntry(kind).leaf, rand, this.game.ownerOf(t));
  }

  // The wonder standing on tile t beside its city, or going up there.
  private besideWonder(t: number): PlacedBuilding[] | null {
    const g = this.game, w = g.wonderOn(t);
    if (w === 'machuPicchu') return this.summit(t, 'machuPicchu');
    if (w) return this.seaWonder(t, wonderModelKind(w));
    if (!g.cities.some((c) => c.wonderTile === t)) return null;
    return g.isSea(t) ? this.seaWonder(t, wonderModelKind('scaffold')) : this.landmark(t, 'scaffold', mulberry32((t + 1) * 2654435761));
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
    const city = this.game.cityById.get(this.game.tileCity[t]);
    if (!city) return true;
    const l = this.layout(city);
    l.flora ??= this.floraIndex(l);
    return l.flora(d);
  }
  private floraIndex(l: CityLayout): (d: THREE.Vector3) => boolean {
    const D = this.game.globe.avgEdgeAngle, gap = FLORA_GAP * D;
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
    const base = high;
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
  const tl = g.tiles[t]!, c = tl.center, n = tl.corners.length;
  const mids = tl.corners.map((cn, j) => g.globe.triCenters[cn]!.clone().add(g.globe.triCenters[tl.corners[(j + 1) % n]!]!).normalize());
  const k = (2 * mids.reduce((a, m) => a + m.angleTo(c), 0)) / n;
  const e1 = mids[0]!.clone().addScaledVector(c, -mids[0]!.dot(c)).normalize();
  let e2 = c.clone().cross(e1);
  if (e2.dot(mids[1]!) < 0) e2 = e2.negate();
  return { toDir: (p) => c.clone().addScaledVector(e1, p.x * k).addScaledVector(e2, p.y * k).normalize(), k };
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

