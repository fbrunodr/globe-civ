// What stands on a city's tiles. Built-up tiles (the center and urban
// tiles) are stamped with town drawings (src/town, laid onto the tiles by
// cityStamp.ts): every edge of a built-up tile carries 0, 1 or 2 streets
// (edgeValue below; both tiles of the edge agree), and the tile shows the
// drawing for its six values, turned into place, so streets always meet.
// The drawings fix the skeleton (streets, building spots); the density
// picks the lots, the era and climate the models (houses, roofs, walls).
//
// Nothing is built on water or right beside it: lots there are left out,
// streets stop at the water (or bridge a narrow river).
//
// Rural tiles get one structure each (farmstead, mine head, quarry stones,
// lodge, stilt hut, fishing boats). Everything is a pure function of the
// city's state and the seed, so a reload looks identical.

import * as THREE from 'three';
import type { Game, City } from './game.ts';
import { USE, SLOTS, improvementFor, type ImprovementKey, type BuildingKey, type WonderKey, type EraIndex } from './cities.ts';
import { ROOFS, buildingEntry, buildBuildingGeometry, type BuildingKind } from './buildingCatalog.ts';
import { LOT_SIZE, FLOOR_HEIGHT, doorSize, isBuilding, type Density, type Floors, type LotKind, type StreetClass } from './town/geometry.ts';
import { planRoads, roadLines, roadEntries, ROAD_HALF_WIDTH } from './roads.ts';
import { key as colouringKey, type EdgeValue } from './town/edges.ts';
import { edgeClass, type Role } from './town/skeleton.ts';
import { stamp, STAMP_STEP, type FanPt, type Stamp, type StampTile, type StampedSpot } from './cityStamp.ts';
import { mulberry32, type Rng } from './rng.ts';

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
// A square, drawn by render.ts as paving on the ground.
export interface Paving { points: THREE.Vector3[]; paved: boolean }

interface CityLayout {
  sig: string;
  byTile: Map<number, PlacedBuilding[]>;
  streets: Street[];
  pavings: Paving[];
}

export interface PlacedBuilding {
  kind: BuildingKind;
  matrix: THREE.Matrix4;
  color: THREE.Color; // per-instance shade
  leaf: THREE.Color;  // roof
}

const UP = new THREE.Vector3(0, 1, 0);
const DRY = -0.00008;      // like the flora: the water this far under the ground
// Models are enlarged a little over true scale so towns read from afar
// (the drawings' lot sizes assume this scale).
const HOUSE_SCALE = 1.5;
// How much of its lot or spot a building may fill (room for its turn and its foundation).
const FIT = 0.92;
// Foundations: under a building whose footprint's corners differ by more
// than this (× the world scale); the model is FOUNDATION_UNIT on a side.
const FOUNDATION_MIN = 0.00005;
const FOUNDATION_UNIT = 0.01;
// Each civ builds its foundations its own way (by player): grey stone,
// sandstone, brick, basalt, timber, marble, adobe, mossy stone.
const FOUNDATION_STYLE = [0x8d877c, 0xb59a72, 0x9a6a55, 0x5f5a55, 0x7a5f45, 0xd2ccbe, 0xb08a5a, 0x6f7a62] as const;
// render.ts draws prop models at 1.5 × PROP_SIZE of the reference size.
const PROP_SCALE = 1.5 * 0.276;
// The longest bridge a street gets (tile steps): rivers, inlets, pools.
const BRIDGE = 0.4;

// The model of each building that sits in a slot (walls are drawn around
// the center instead). A Record, so a building without a model does not compile.
const MODEL: Record<Exclude<BuildingKey, 'walls'>, BuildingKind> = {
  library: 'library', academy: 'academy', market: 'market', countingHouse: 'countingHouse',
  workshop: 'workshop', smithy: 'smithy', lighthouse: 'lighthouse', shipyard: 'shipyard',
  shrine: 'shrine', temple: 'temple', amphitheater: 'amphitheater', odeon: 'odeon',
  barracks: 'barracks', stable: 'stable', granary: 'granary', monument: 'monument',
  waterMill: 'waterMill', aqueduct: 'aqueduct',
};
const WONDER_MODEL: Record<WonderKey, BuildingKind> = {
  pyramids: 'pyramids', greatLighthouse: 'greatLighthouse', hangingGardens: 'hangingGardens', machuPicchu: 'machuPicchu',
  greatLibrary: 'greatLibrary', stonehenge: 'stonehenge', colosseum: 'colosseum',
};

const RURAL: Record<ImprovementKey, BuildingKind> = {
  farm: 'farmstead', mine: 'mineHead', camp: 'lodge', quarry: 'quarryStones', wetland: 'stiltHut', boats: 'fishingBoat',
};

// Street furniture: one model each.
const DECOR: Record<Exclude<LotKind, `b${string}`>, BuildingKind> = {
  tree: 'gardenTree', well: 'well', fountain: 'fountain', stall: 'stall', shed: 'shed',
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

// Walls by era (multiplies the plaster): timber and mud, then white plaster,
// then warmer stone.
const ERA_WALL: Record<EraIndex, [number, number, number]> = { 0: [0.82, 0.72, 0.6], 1: [1, 0.99, 0.96], 2: [0.93, 0.88, 0.8] };

// ---------- which drawing a tile gets ----------

// A tile's density (for now a look; the mechanics come later): villages
// are low, a grown town's center and its busiest tiles medium; high
// density (towers) only where set by hand (the City Lab) until later
// eras exist. A tile with two buildings is never low (low tiles have one
// building spot); hills are never high.
export function tileDensity(g: Game, t: number): Density {
  const city = g.cityById.get(g.tileCity[t]!);
  if (!city) return 'low';
  const built = g.slotKeys(t).filter((k) => k !== null).length;
  if (g.use[t] === USE.center) return city.pop >= 6 ? 'medium' : 'low';
  if (built >= 2) return 'medium';
  const busy = g.specialists[t]! > 0 || g.tiles[t].neighbors.some((n) => g.use[n] === USE.center);
  return busy && city.pop >= 8 ? 'medium' : 'low';
}
export function allowedDensity(g: Game, t: number, d: Density): Density {
  if (d === 'low' && g.slotKeys(t).filter((k) => k !== null).length >= 2) d = 'medium';
  if (d === 'metropolitan' && g.relief[t] === 'hills') d = 'high';
  return d;
}

const mix = (a: number, b: number) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };

// Built-up tiles: the centers and urban tiles (never pentagons, which have no drawings).
// Built-up: a center or urban land hex, stamped with a town drawing. An
// urban water tile is a harbor: no streets cross into it (its edges read 0
// from the land), its buildings stand by the quay.
export const isBuilt = (g: Game, t: number): boolean => (g.use[t] === USE.urban || g.use[t] === USE.center) && g.tiles[t].corners.length === 6 && !g.isWater(t);
export const isHarbor = (g: Game, t: number): boolean => g.use[t] === USE.urban && g.isWater(t);


export class CityProps {
  private readonly cache = new Map<number, { sig: string; items: PlacedBuilding[] }>();
  private readonly layouts = new Map<number, CityLayout>();
  private readonly box = new Map<BuildingKind, readonly [number, number]>();
  private roads: THREE.Vector3[][] = [];
  private entries = new Set<string>();
  private roadsKey = '';
  // Densities set by hand (the City Lab), per tile.
  readonly density = new Map<number, Density>();
  private densityVersion = 0;

  constructor(private readonly game: Game, private readonly sample: SpotSampler, private readonly sampleDir: DirSampler,
    private readonly scale: number) {}

  setDensity(t: number, d: Density | null): void {
    if (d === null) this.density.delete(t); else this.density.set(t, d);
    this.densityVersion++;
  }
  // Forget every layout (the ground under them changed).
  invalidate(): void { this.densityVersion++; }
  densityOf(t: number): Density {
    return allowedDensity(this.game, t, this.density.get(t) ?? tileDensity(this.game, t));
  }

  // The built-up tiles of a city (its center first).
  private built(city: City): number[] {
    return [city.tile, ...this.game.cityTiles(city, USE.urban)].filter((t) => isBuilt(this.game, t));
  }

  // Whether a street crosses the edge between built-up tile t and its
  // neighbor n: always to another built-up tile (of any city); to open land
  // where a road comes in. The same from either side.
  edgeValue(t: number, n: number): EdgeValue {
    const g = this.game;
    if (isBuilt(g, n)) return 1;
    this.roadLines();
    return this.entries.has(`${t}:${n}`) ? 1 : 0;
  }
  colouring(t: number): EdgeValue[] {
    return this.game.tiles[t].neighbors.map((n) => this.edgeValue(t, n));
  }
  // How wide an edge's streets are where they cross it (by the denser tile).
  private edgeClasses(t: number, c: readonly EdgeValue[]): (StreetClass | null)[] {
    const g = this.game, d = this.densityOf(t);
    return c.map((v, i) => {
      if (v === 0) return null;
      const n = g.tiles[t].neighbors[i]!;
      return edgeClass(v, d, isBuilt(g, n) ? this.densityOf(n) : d);
    });
  }

  // Everything the town's layout depends on.
  private citySig(city: City, memo?: Map<number, string>): string {
    const m = memo?.get(city.id);
    if (m !== undefined) return m;
    const g = this.game;
    const tiles = this.built(city).map((t) => {
      const c = this.colouring(t);
      return `${t}:${this.densityOf(t)}:${g.slots[t * SLOTS]},${g.slots[t * SLOTS + 1]}:${g.wonderAt[t]}:${colouringKey(c)}:${this.edgeClasses(t, c).join(',')}`;
    }).join(';');
    const sig = `${city.id}|${city.pop}|${g.players[city.owner]!.era}|${city.buildings.has('walls') ? 'w' : ''}|${city.wonderTile ?? ''}|${this.densityVersion}|${tiles}`;
    memo?.set(city.id, sig);
    return sig;
  }

  // What this tile shows now, and a signature that changes when it must be rebuilt.
  private signature(t: number, memo?: Map<number, string>): string {
    const g = this.game;
    const u = g.use[t];
    if (u === USE.wild) return g.wonderAt[t] ? `w${g.wonderAt[t]}` : g.ruins[t] ? 'ruins' : '';
    const city = g.cityById.get(g.tileCity[t]);
    if (!city) return '';
    if (u === USE.urban || u === USE.center) return `town|${this.citySig(city, memo)}`;
    const site = city.wonderTile === t ? 's' : '';
    return `${u}|${city.id}|${site}|${g.eraAt(t)}|${g.useVersion}`;
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
      const w = g.wonderOn(t);
      if (w) return this.summit(t, WONDER_MODEL[w]);
      return g.ruins[t] ? this.ruins(t) : [];
    }
    const city = g.cityById.get(g.tileCity[t]);
    if (!city) return [];
    const u = g.use[t];
    const rand = mulberry32((t + 1) * 2654435761 ^ city.id * 40503);
    if (u === USE.rural) {
      const k = improvementFor(g.terrainAt(t));
      const items = k ? this.rural(t, RURAL[k], rand) : [];
      if (city.wonderTile === t) items.push(...this.landmark(t, 'scaffold', rand));
      return items;
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

  // The tiles to stamp: each built-up tile's edge values, role and density.
  stampTiles(tiles: readonly number[], walledCenter: number | null): StampTile[] {
    const g = this.game;
    return tiles.filter((t) => isBuilt(g, t)).map((t) => {
      const city = g.cityById.get(g.tileCity[t]!);
      const role: Role = g.use[t] === USE.center ? 'center'
        : g.wonderAt[t] || city?.wonderTile === t ? 'wonder' : 'block';
      const colouring = this.colouring(t);
      return { tile: t, colouring, edgeCls: this.edgeClasses(t, colouring), role, density: this.densityOf(t), walled: t === walledCenter, pick: mix(t, 0x7a11) };
    });
  }

  private buildLayout(city: City, sig: string): CityLayout {
    const g = this.game, D = g.globe.avgEdgeAngle;
    const byTile = new Map<number, PlacedBuilding[]>();
    const put = (t: number, ...bs: PlacedBuilding[]) => { const l = byTile.get(t); if (l) l.push(...bs); else byTile.set(t, bs); };
    const era = g.players[city.owner]!.era;
    const temp = g.map.temperature[city.tile]!;
    const tiles = this.built(city);
    const walled = city.buildings.has('walls');
    const st = stamp(this.stampTiles(tiles, walled ? city.tile : null));
    const at = (p: FanPt) => this.sample(p.t, p.i, p.wa, p.wb);
    const dirAt = (p: FanPt) => {
      const tl = g.tiles[p.t], k = tl.corners.length;
      const A = g.globe.triCenters[tl.corners[p.i]!]!, B = g.globe.triCenters[tl.corners[(p.i + 1) % k]!]!;
      const w0 = 1 - p.wa - p.wb;
      return new THREE.Vector3(tl.center.x * w0 + A.x * p.wa + B.x * p.wb, tl.center.y * w0 + A.y * p.wa + B.y * p.wb, tl.center.z * w0 + A.z * p.wa + B.z * p.wb).normalize();
    };
    const wet = (s: CitySpot) => s.water - s.ground > DRY;
    // How much a drawing is stretched or squeezed here (tiles vary in size).
    const local = (a: THREE.Vector3, b: THREE.Vector3) => Math.min(1.25, Math.max(0.7, a.angleTo(b) / (0.01 * D)));

    // Streets: where they cross water with land on both sides (a river, an
    // inlet, a pool) they go on as bridges (render.ts builds them); where
    // they run into water they stop at the shore.
    const streets: Street[] = [];
    const paved = era > 0;
    // Street widths follow the local tile size, like the lots beside them
    // (tiles vary in size; a street drawn for an average tile would crowd a small one).
    const widths = (x: { pts: FanPt[]; hw: number[] }) => {
      const dirs = x.pts.map(dirAt);
      return { pts: dirs, hw: dirs.map((d, i) => {
        const o = dirs[i + 1] ?? dirs[i - 1];
        return x.hw[i]! * D * (o ? Math.min(1.25, Math.max(0.7, d.angleTo(o) / (STAMP_STEP * D))) : 1);
      }) };
    };
    for (const s of joinStreets(st.streets.map(widths))) {
      const dry = s.pts.map((d) => !wet(this.sampleDir(d)));
      let run: number[] = [], gap: number[] = [];
      const flush = () => { if (run.length > 1) streets.push({ points: run.map((i) => s.pts[i]!), halfWidth: run.map((i) => s.hw[i]!), paved }); run = []; };
      for (let n = 0; n < s.pts.length; n++) {
        if (dry[n]) {
          if (gap.length) {
            const span = s.pts[gap[0]!]!.angleTo(s.pts[gap[gap.length - 1]!]!) / D;
            if (run.length && span <= BRIDGE) run.push(...gap); else flush();
            gap = [];
          }
          run.push(n);
        } else gap.push(n);
      }
      flush();
    }
    // Nothing may stand on them: every building's footprint is checked
    // (shrunk a little if it touches one, left out if it still does).
    // (The roads between cities too: they end at the town's edge, where they meet its streets.)
    const roads = this.roadLines().map((pts) => ({ points: pts, halfWidth: pts.map(() => ROAD_HALF_WIDTH * D), paved: false }));
    const clear = new StreetIndex([...streets, ...roads], D);
    const fits = (b: PlacedBuilding) => clear.free(this.footprint(b));
    const settle = (make: (shrink: number) => PlacedBuilding[]): PlacedBuilding[] => {
      for (const shrink of [1, 0.85]) { const bs = make(shrink); if (fits(bs[0]!)) return bs; }
      return [];
    };

    // Building spots: what stands there (or the houses, until something does).
    const builtSpot = new Set<string>();
    // A building fits its spot by its footprint's corners (the rectangle inside the circle).
    const fitSpot = (kind: BuildingKind, r: number, sc: number, grow = 1) => {
      const [hx, hz] = this.modelBox(kind);
      return Math.min(HOUSE_SCALE * sc * grow, (FIT * r * D * sc) / (Math.hypot(hx, hz) * PROP_SCALE * this.scale));
    };
    const placeAt = (sp: StampedSpot, kind: BuildingKind, roof: number, rand: Rng) => {
      const s = at(sp.at), f = dirAt(sp.face);
      const water = buildingEntry(kind).water;
      let spot: CitySpot | null = s;
      if (!standsAt(kind, s)) spot = this.findSpot(sp.tile, kind, rand, s.dir);
      if (!spot) return;
      // (A hall grows with its tile's density: wider, and taller still.)
      const tall = sp.tall ?? 1;
      const size = fitSpot(kind, sp.r, local(s.dir, f), tall > 1 ? sp.r / 0.045 : 1);
      const yaw = facing(spot.dir, f) + Math.PI / 2;
      if (water === 'float') { put(sp.tile, this.make(kind, spot.dir, spot.water, yaw, size, roof, rand)); return; }
      const bs = settle((k) => this.stand(kind, spot!.dir, yaw, size * k, roof, rand, city.owner));
      if (bs[0] && tall !== 1) bs[0].matrix.multiply(new THREE.Matrix4().makeScale(1, tall, 1));
      put(sp.tile, ...bs);
    };
    for (const sp of st.spots) {
      const b = g.slotKeys(sp.tile)[sp.k];
      if (!b || b === 'walls') continue;
      builtSpot.add(`${sp.tile}:${sp.k}`);
      const kind = MODEL[b];
      placeAt(sp, kind, buildingEntry(kind).leaf, mulberry32(mix(sp.tile, sp.k + 11)));
    }
    for (const sp of st.halls) placeAt(sp, 'hall', 0x5f5650, mulberry32(mix(sp.tile, 7)));
    // Harbors: each building on the quay side of the fan toward a built-up
    // neighbor (side by side), facing it; anywhere it can stand otherwise.
    for (const t of g.cityTiles(city, USE.urban)) {
      if (!isHarbor(g, t)) continue;
      const nbs = g.tiles[t].neighbors;
      const quays = nbs.flatMap((n, j) => (isBuilt(g, n) ? [j] : []));
      g.slotKeys(t).forEach((b, k) => {
        if (!b || b === 'walls') return;
        const kind = MODEL[b], rand = mulberry32(mix(t, k + 11));
        const j = quays.length ? quays[k % quays.length]! : Math.floor(rand() * nbs.length);
        const s0 = this.sample(t, j, k ? 0.22 : 0.45, k ? 0.45 : 0.22);
        const s = standsAt(kind, s0) ? s0 : this.findSpot(t, kind, rand, s0.dir);
        if (!s) return;
        const yaw = facing(s.dir, g.tiles[nbs[j]!]!.center) + Math.PI / 2, roof = buildingEntry(kind).leaf;
        if (buildingEntry(kind).water === 'float') put(t, this.make(kind, s.dir, s.water, yaw, HOUSE_SCALE, roof, rand));
        else put(t, ...this.stand(kind, s.dir, yaw, HOUSE_SCALE, roof, rand, city.owner));
      });
      const w = g.wonderOn(t), site = w ? WONDER_MODEL[w] : city.wonderTile === t ? 'scaffold' : null;
      if (site) put(t, ...this.landmark(t, site, mulberry32(mix(t, 9))));
    }
    for (const sp of st.wonders) {
      const w = g.wonderOn(sp.tile);
      const kind = w ? WONDER_MODEL[w] : city.wonderTile === sp.tile ? 'scaffold' : null;
      if (kind) placeAt(sp, kind, buildingEntry(kind).leaf, mulberry32(mix(sp.tile, 9)));
    }

    // Lots: homes and street furniture, never on water.
    for (const l of st.lots) {
      if (l.spot !== undefined && builtSpot.has(`${l.tile}:${l.spot}`)) continue;
      const s = at(l.at);
      if (wet(s)) continue;
      const f = dirAt(l.face);
      // The ground behind and beside it must be dry too (no houses at the water's edge).
      const back = s.dir.clone().multiplyScalar(2).sub(f).normalize();
      if (wet(this.sampleDir(back)) || wet(this.sampleDir(f))) continue;
      const rand = mulberry32(l.seed);
      const sc = local(s.dir, f);
      const yaw = facing(s.dir, f) + Math.PI / 2;
      if (l.kind === 'tree' || l.kind === 'well' || l.kind === 'fountain' || l.kind === 'stall' || l.kind === 'shed') {
        const kind = DECOR[l.kind];
        put(l.tile, this.make(kind, s.dir, s.ground, yaw + (l.kind === 'tree' ? rand() * 6.28 : 0), HOUSE_SCALE * sc * (l.kind === 'tree' ? 0.8 + 0.4 * rand() : 1), buildingEntry(kind).leaf, rand));
        continue;
      }
      if (!isBuilding(l.kind)) continue;
      // A building fills its footprint (a little in from the edges) and is as tall as its floors.
      const [lw, ld] = LOT_SIZE[l.kind];
      const floors: Floors = l.floors ?? 1;
      const roof = floors <= 2 ? roofOf(temp, city.pop, era, rand) : buildingEntry('massTower').leaf;
      const [dw, dh] = doorSize(l.kind, floors);
      const bs = settle((k) => this.standMass(s.dir, yaw, lw * FIT * D * sc * k, ld * FIT * D * sc * k, floors * FLOOR_HEIGHT * D * sc, roof, rand, city.owner, [dw * D * sc, dh * D * sc]));
      if (!bs.length) continue;
      if (floors <= 2) { const [wr, wg, wb] = ERA_WALL[era]; bs[0]!.color.multiply(new THREE.Color(wr, wg, wb)); }
      put(l.tile, ...bs);
    }

    // Walls: a segment between each pair of points of a run, a tower at
    // its ends (the gates' sides) and its middle (the core's corner).
    const rand = mulberry32(city.id * 7919 + 5);
    for (const w of st.walls) {
      const pts = w.pts.map(at);
      pts.forEach((s, n) => {
        const corner = w.pts[n]!.wb === 0;
        if ((n === 0 || n === pts.length - 1 || corner) && standsAt('wallTower', s)) {
          put(w.tile, ...settle((k) => this.stand('wallTower', s.dir, 0, HOUSE_SCALE * (corner ? 1 : 0.85) * k, buildingEntry('wallTower').leaf, rand, city.owner)));
        }
        const nx = pts[n + 1];
        if (!nx) return;
        const mid = this.sampleDir(s.dir.clone().add(nx.dir).normalize());
        if (!standsAt('wallSegment', mid)) return;
        // Stretched to the gap between its ends (model length 0.01 at prop scale).
        const len = Math.max(0.3, Math.min(4, s.dir.angleTo(nx.dir) / (0.01 * HOUSE_SCALE * this.scale * PROP_SCALE)));
        put(w.tile, ...settle((k) => this.stand('wallSegment', mid.dir, facing(mid.dir, nx.dir), HOUSE_SCALE * k, buildingEntry('wallSegment').leaf, rand, city.owner, len)));
      });
    }

    // Squares, but none on the water (a quay where the shore is further in).
    const pavings: Paving[] = st.squares.filter((q) => q.paved).map((q) => ({ points: q.pts.map(dirAt), paved }))
      .filter((q) => !wet(this.sampleDir(q.points.reduce((a, p) => a.add(p), new THREE.Vector3()).normalize())));
    return { sig, byTile, streets, pavings };
  }

  // Half extents of a model's footprint (x, z), in model units.
  private modelBox(kind: BuildingKind): readonly [number, number] {
    let r = this.box.get(kind);
    if (r === undefined) {
      const geo = buildBuildingGeometry(kind);
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

  // What is left of a razed city's built-up tile: broken walls where some
  // of a village drawing's houses stood.
  private ruins(t: number): PlacedBuilding[] {
    const g = this.game, rand = mulberry32((t + 7) * 2246822519);
    if (g.tiles[t].corners.length !== 6) return [];
    const none: EdgeValue[] = [0, 0, 0, 0, 0, 0];
    const { lots } = stamp([{ tile: t, colouring: none, edgeCls: none.map(() => null), role: 'block', density: 'low', walled: false }]);
    const out: PlacedBuilding[] = [];
    for (const l of lots) {
      if (l.tile !== t || !isBuilding(l.kind) || rand() > 0.35) continue;
      const sp = this.sample(l.at.t, l.at.i, l.at.wa, l.at.wb);
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

  // A placed building's footprint on the ground: its corners and the
  // middles of its sides (unit directions).
  footprint(b: PlacedBuilding): THREE.Vector3[] {
    const [hx, hz] = this.modelBox(b.kind), G = PROP_SCALE * this.scale;
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
      this.entries = roadEntries(g, planned);
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
    const want = kind === 'fishingBoat' ? 2 : 1;
    const water = buildingEntry(kind).water === 'float';
    for (let tries = 0; tries < 24 && out.length < want; tries++) {
      const i = Math.floor(rand() * this.game.tiles[t].corners.length);
      const wa = 0.15 + 0.4 * rand(), wb = 0.1 + 0.3 * rand();
      const s = this.sample(t, i, wa, wb);
      if (!standsAt(kind, s) || this.onRoad(s.dir, kind)) continue;
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

  // A massing model (town drawings): walls hw × hd (half extents, radians)
  // and h high, level at the highest corner of its footprint on a
  // foundation; a gable roof on low buildings, a flat top on tall ones
  // (the block's own). The walls come first (its footprint is theirs).
  private standMass(dir: THREE.Vector3, yaw: number, hw: number, hd: number, h: number, roof: number, rand: Rng, owner: number, door: readonly [number, number]): PlacedBuilding[] {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(hw);
    const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(hd);
    let low = this.sampleDir(dir).ground, high = low;
    for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
      const g = this.sampleDir(dir.clone().addScaledVector(X, a).addScaledVector(Z, b).normalize()).ground;
      low = Math.min(low, g); high = Math.max(high, g);
    }
    const unit = this.scale * PROP_SCALE * 0.01; // the unit block, in radians
    const sink = 0.00012 * this.scale;
    const tall = h > 2.5 * FLOOR_HEIGHT * this.game.globe.avgEdgeAngle;
    const shade = 0.9 + 0.18 * rand();
    const kind: BuildingKind = tall ? 'massTower' : 'massWalls';
    const walls: PlacedBuilding = {
      kind,
      matrix: new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + high - sink), q, new THREE.Vector3((2 * hw) / unit, (h + sink) / unit, (2 * hd) / unit)),
      color: new THREE.Color(shade, shade * (0.98 + 0.04 * rand()), shade * (0.96 + 0.04 * rand())),
      leaf: new THREE.Color(roof),
    };
    const out = [walls];
    if (!tall) {
      // The ridge runs along the front; the roof rises a third of the depth.
      out.push({
        kind: 'massGable',
        matrix: new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + high + h - sink), q, new THREE.Vector3((2 * hw) / unit, (0.66 * hd) / unit, (2 * hd) / unit)),
        color: new THREE.Color(1, 1, 1),
        leaf: new THREE.Color(roof),
      });
    }
    // The door, on the front (the model's +z: toward its street).
    out.push({
      kind: 'massDoor',
      matrix: new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + high - sink).add(Z), q, new THREE.Vector3(door[0] / unit, (door[1] + sink) / unit, (0.003 * this.game.globe.avgEdgeAngle) / unit)),
      color: new THREE.Color(1, 1, 1),
      leaf: new THREE.Color(buildingEntry('massDoor').leaf),
    });
    if (high - low >= FOUNDATION_MIN * this.scale) {
      const fu = this.scale * PROP_SCALE * FOUNDATION_UNIT, fs = 0.0002 * this.scale;
      out.push({
        kind: 'foundation',
        matrix: new THREE.Matrix4().compose(dir.clone().multiplyScalar(1 + low - fs), q, new THREE.Vector3((2 * hw * 1.04) / fu, (high - low + fs) / fu, (2 * hd * 1.04) / fu)),
        color: new THREE.Color(1, 1, 1).multiplyScalar(0.92 + 0.1 * rand()),
        leaf: new THREE.Color(FOUNDATION_STYLE[((owner % FOUNDATION_STYLE.length) + FOUNDATION_STYLE.length) % FOUNDATION_STYLE.length]!),
      });
    }
    return out;
  }

  private make(kind: BuildingKind, dir: THREE.Vector3, height: number, yaw: number, size: number, roof: number, rand: Rng): PlacedBuilding {
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

// Streets joined end to end where exactly two meet (a middle's street and
// the strip's that goes on from it, the two halves of a strip's street),
// so a street is judged as a whole where it crosses water.
function joinStreets(list: { pts: THREE.Vector3[]; hw: number[] }[]): { pts: THREE.Vector3[]; hw: number[] }[] {
  const key = (d: THREE.Vector3) => `${Math.round(d.x * 1e6)},${Math.round(d.y * 1e6)},${Math.round(d.z * 1e6)}`;
  const ends = new Map<string, number[]>();
  list.forEach((s, i) => {
    if (s.pts.length < 2) return;
    for (const d of [s.pts[0]!, s.pts[s.pts.length - 1]!]) { const k = key(d); const l = ends.get(k); if (l) l.push(i); else ends.set(k, [i]); }
  });
  const used = new Uint8Array(list.length);
  const out: { pts: THREE.Vector3[]; hw: number[] }[] = [];
  // The other street at a joint where exactly two meet.
  const next = (d: THREE.Vector3, from: number) => {
    const l = ends.get(key(d));
    if (!l || l.length !== 2) return -1;
    const o = l[0] === from ? l[1]! : l[0]!;
    return o === from || used[o] ? -1 : o;
  };
  list.forEach((s, i) => {
    if (used[i] || s.pts.length < 2) return;
    used[i] = 1;
    let pts = [...s.pts], hw = [...s.hw];
    for (const atEnd of [true, false]) {
      for (;;) {
        const tip = atEnd ? pts[pts.length - 1]! : pts[0]!;
        const o = next(tip, i);
        if (o < 0) break;
        used[o] = 1;
        let op = [...list[o]!.pts], ow = [...list[o]!.hw];
        // Orient the other street to continue from the tip.
        if (key(op[0]!) !== key(tip)) { op = op.reverse(); ow = ow.reverse(); }
        if (atEnd) { pts = [...pts, ...op.slice(1)]; hw = [...hw, ...ow.slice(1)]; }
        else { op.reverse(); ow.reverse(); pts = [...op.slice(0, -1), ...pts]; hw = [...ow.slice(0, -1), ...hw]; }
      }
    }
    out.push({ pts, hw });
  });
  return out;
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

export type { Stamp };
