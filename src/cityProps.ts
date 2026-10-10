// What stands on a city's tiles (design doc "Cities: Feel & Play", city
// look v1): houses filling urban tiles, a hall on the center, one structure
// per rural tile (farmstead, mine head, quarry stones, lodge, stilt hut,
// fishing boats). Houses grow in number with the city's population and its
// specialists, denser toward the center, thinning at the edge of the urban
// ground into gardens. Everything is a pure function of the tile, the city's
// state and the seed, so a reload looks identical.

import * as THREE from 'three';
import type { Game, City } from './game.ts';
import { USE, SLOTS, improvementFor, type ImprovementKey, type BuildingKey, type WonderKey, type EraIndex } from './cities.ts';
import { ROOFS, buildingEntry, type BuildingKind } from './buildingCatalog.ts';
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

export interface PlacedBuilding {
  kind: BuildingKind;
  matrix: THREE.Matrix4;
  color: THREE.Color; // per-instance shade
  leaf: THREE.Color;  // roof
}

const UP = new THREE.Vector3(0, 1, 0);
// render.ts draws prop models at 1.5 × PROP_SIZE of the reference size.
const PROP_SCALE = 1.5 * 0.276;
const DRY = -0.00008;      // like the flora: the water this far under the ground
const MAX_SLOPE = 0.3;
const HOUSE_URBAN = 0.5;   // houses stand where the urban weight is at least this (the ground shows urban from ~0.4)

// Houses on an urban tile (×1.3 on the center): a size-3 town shows about 15,
// a size-15 capital a couple of hundred.
export const housesOn = (pop: number, specialists: number, center: boolean): number =>
  Math.min(120, Math.round((10 + 3.5 * pop) * (center ? 1.3 : 1) + 8 * specialists));
// Models are enlarged a little over true scale so towns read from afar.
const HOUSE_SCALE = 1.5;

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
const WONDER_CLEAR = 0.55; // tile radii around a wonder with no houses: a square, then the neighborhood

// Where a tile's slots stand: (fan, wa, wb) near its middle, on opposite sides.
const SLOT_SPOTS = [[0, 0.2, 0.08], [3, 0.2, 0.08]] as const;
const CENTER_SLOT_SPOTS = [[1, 0.34, 0.1], [4, 0.34, 0.1]] as const;
const KEEP_CLEAR = 0.3; // tile radii around a slot building with no houses

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

// Walls by era (multiplies the plaster): timber and mud, then white plaster,
// then warmer stone.
const ERA_WALL: Record<EraIndex, [number, number, number]> = { 0: [0.82, 0.72, 0.6], 1: [1, 0.99, 0.96], 2: [0.93, 0.88, 0.8] };

export class CityProps {
  private readonly cache = new Map<number, { sig: string; items: PlacedBuilding[] }>();

  constructor(private readonly game: Game, private readonly sample: SpotSampler, private readonly scale: number) {}

  // What this tile shows now, and a signature that changes when it must be rebuilt.
  private signature(t: number): string {
    const g = this.game;
    const u = g.use[t];
    if (u === USE.wild) return '';
    const city = g.cityById.get(g.tileCity[t]);
    const slots = Array.from({ length: SLOTS }, (_, k) => g.slots[t * SLOTS + k]).join(',');
    const walls = city && city.tile === t && city.buildings.has('walls') ? 'w' : '';
    const site = city && city.wonderTile === t ? 's' : '';
    return `${u}|${city?.pop ?? 0}|${g.specialists[t]}|${city?.id ?? 0}|${slots}|${walls}|${g.wonderAt[t]}${site}|${g.eraAt(t)}`;
  }

  // The tiles whose buildings changed since they were last placed.
  changed(): number[] {
    const out: number[] = [];
    for (let t = 0; t < this.game.N; t++) {
      const sig = this.signature(t);
      const c = this.cache.get(t);
      if ((c?.sig ?? '') !== sig) out.push(t);
    }
    return out;
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
    return this.town(t, city, rand);
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

  // Houses (and the hall on the center), the densest toward the center.
  private town(t: number, city: City, rand: Rng): PlacedBuilding[] {
    const g = this.game;
    const center = t === city.tile;
    const n = housesOn(city.pop, g.specialists[t], center);
    const k = g.tiles[t].corners.length;
    const rows = Math.max(3, Math.ceil(Math.sqrt((2 * 2.2 * n) / k)));
    const cdir = g.tiles[city.tile].center;
    const temp = g.map.temperature[t];
    const out: PlacedBuilding[] = [];
    // Slot buildings first; houses keep clear of them.
    const clear: THREE.Vector3[] = [];
    (center ? CENTER_SLOT_SPOTS : SLOT_SPOTS).forEach(([i, wa, wb], slot) => {
      const b = g.slotKeys(t)[slot];
      if (!b || b === 'walls') return;
      const kind = MODEL[b];
      const s = this.findSpot(t, i % k, wa, wb, kind, rand);
      if (!s) return;
      clear.push(s.dir);
      const yaw = facing(s.dir, cdir) + Math.PI / 2;
      out.push(this.make(kind, s.dir, Math.max(s.ground, s.water), yaw, HOUSE_SCALE, buildingEntry(kind).leaf, rand));
    });
    if (center && city.buildings.has('walls')) out.push(...this.walls(t, rand));
    // A wonder (or its scaffolding) at the heart of its tile, a square around it.
    const w = g.wonderOn(t);
    const landmark = w ? WONDER_MODEL[w] : city.wonderTile === t ? 'scaffold' : null;
    let wonderClear = 0;
    if (landmark) {
      const items = this.landmark(t, landmark, rand);
      out.push(...items);
      for (const it of items) clear.push(new THREE.Vector3().setFromMatrixPosition(it.matrix).normalize());
      wonderClear = WONDER_CLEAR * g.globe.avgEdgeAngle / 2;
    }
    const clearAngle = KEEP_CLEAR * g.globe.avgEdgeAngle / 2;
    const era = g.eraAt(t);
    const cand: { s: CitySpot; score: number; r: number }[] = [];
    for (const sp of this.tileSpots(t, rows, rand)) {
      const jitter = rand();
      const s = this.sample(t, sp.i, sp.wa, sp.wb);
      if (s.water - s.ground > DRY || s.slope > MAX_SLOPE || s.urban < HOUSE_URBAN) continue;
      if (clear.some((d, ci) => d.angleTo(s.dir) < (landmark && ci === clear.length - 1 ? wonderClear : clearAngle))) continue;
      // Keep the hall's square free on the center.
      const r = sp.wa + sp.wb;
      if (center && r < 0.3) continue;
      const fromCenter = s.dir.angleTo(cdir) / g.globe.avgEdgeAngle; // in tiles
      // Houses spread over the whole tile, a little denser toward the center.
      cand.push({ s, score: -0.25 * fromCenter + jitter + 0.8 * (s.urban - HOUSE_URBAN), r: fromCenter });
    }
    cand.sort((a, b) => b.score - a.score);
    if (center) {
      // The hall at the heart of the center, or nearby if that is wet (an oasis pond).
      for (let tries = 0; tries < 12; tries++) {
        const r = 0.02 + 0.04 * tries;
        const s = this.sample(t, tries % k, r, r * 0.5);
        if (s.water - s.ground > DRY || s.slope > MAX_SLOPE) continue;
        out.push(this.make('hall', s.dir, s.ground, rand() * Math.PI * 2, HOUSE_SCALE, 0x5f5650, rand));
        break;
      }
    }
    for (const c of cand.slice(0, n)) {
      const roll = rand();
      const inner = c.r < 0.9 && city.pop >= 6;
      const kind: BuildingKind = city.pop <= 2 && roll < 0.4 ? 'hut'
        : inner && roll < 0.45 ? 'townhouse'
        : roll < 0.6 ? 'cottage' : roll < 0.8 ? 'longhouse' : 'cornerHouse';
      // Houses face the center (roughly), so streets ring and radiate from it.
      const toward = facing(c.s.dir, cdir);
      const yaw = toward + (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.4;
      const size = HOUSE_SCALE * (inner ? 1.05 : 0.95) * (0.85 + 0.3 * rand());
      const b = this.make(kind, c.s.dir, c.s.ground, yaw, size, roofOf(temp, city.pop, era, rand), rand);
      const [wr, wg, wb] = ERA_WALL[era];
      b.color.multiply(new THREE.Color(wr, wg, wb));
      out.push(b);
    }
    return out;
  }

  // A landmark (wonder or scaffolding) as close to the tile's heart as it can stand.
  private landmark(t: number, kind: BuildingKind, rand: Rng): PlacedBuilding[] {
    const s = this.findSpot(t, 0, 0.03, 0.03, kind, rand);
    return s ? [this.make(kind, s.dir, s.ground, rand() * Math.PI * 2, HOUSE_SCALE, buildingEntry(kind).leaf, rand)] : [];
  }

  // A spot near (i, wa, wb) where the model can stand (by its water rule).
  private findSpot(t: number, i: number, wa: number, wb: number, kind: BuildingKind, rand: Rng): CitySpot | null {
    const k = this.game.tiles[t].corners.length;
    for (let tries = 0; tries < 16; tries++) {
      const s = tries === 0 ? this.sample(t, i, wa, wb)
        : this.sample(t, (i + Math.floor(rand() * k)) % k, 0.05 + 0.6 * rand(), 0.05 + 0.3 * rand());
      if (standsAt(kind, s)) return s;
    }
    return null;
  }

  // Walls along the center's edge: segments with a tower at each corner
  // (gaps where the edge runs through water).
  private walls(t: number, rand: Rng): PlacedBuilding[] {
    const g = this.game;
    const out: PlacedBuilding[] = [];
    const k = g.tiles[t].corners.length;
    const R = 0.86, STEPS = 4;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j <= STEPS; j++) {
        if (j === STEPS) continue; // the next fan's corner
        const f = j / STEPS, f2 = (j + 0.5) / STEPS;
        const corner = this.sample(t, i, R, 0);
        if (j === 0 && standsAt('wallTower', corner)) out.push(this.make('wallTower', corner.dir, corner.ground, 0, HOUSE_SCALE, buildingEntry('wallTower').leaf, rand));
        const s = this.sample(t, i, R * (1 - f2), R * f2);
        if (!standsAt('wallSegment', s)) continue;
        const a = this.sample(t, i, R * (1 - f), R * f).dir, b = this.sample(t, i, R * (1 - f - 1 / STEPS), R * (f + 1 / STEPS)).dir;
        const yaw = facing(s.dir, b);
        // Stretch the segment to the gap between its ends (model length 0.01 at prop scale).
        const len = a.angleTo(b) / (0.01 * HOUSE_SCALE * this.scale * PROP_SCALE);
        const seg = this.make('wallSegment', s.dir, s.ground, yaw, HOUSE_SCALE, buildingEntry('wallSegment').leaf, rand);
        seg.matrix.multiply(new THREE.Matrix4().makeScale(Math.max(0.6, Math.min(2.5, len)), 1, 1));
        out.push(seg);
      }
    }
    return out;
  }

  // One structure per rural tile (two boats on the water).
  private rural(t: number, kind: BuildingKind, rand: Rng): PlacedBuilding[] {
    const out: PlacedBuilding[] = [];
    const want = kind === 'fishingBoat' ? 2 : 1;
    const water = buildingEntry(kind).water === 'float';
    for (let tries = 0; tries < 24 && out.length < want; tries++) {
      const i = Math.floor(rand() * this.game.tiles[t].corners.length);
      const wa = 0.15 + 0.4 * rand(), wb = 0.1 + 0.3 * rand();
      const s = this.sample(t, i, wa, wb);
      if (!standsAt(kind, s)) continue;
      const roof = kind === 'farmstead' ? roofOf(this.game.map.temperature[t], 6, this.game.eraAt(t), rand) : buildingEntry(kind).leaf;
      out.push(this.make(kind, s.dir, water ? s.water : s.ground, rand() * Math.PI * 2, HOUSE_SCALE * (0.9 + 0.2 * rand()), roof, rand));
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

// Whether a model may stand at a spot: on dry, gentle ground; boats on water
// deep enough; shore buildings on either.
export function standsAt(kind: BuildingKind, s: CitySpot): boolean {
  const depth = s.water - s.ground, rule = buildingEntry(kind).water;
  if (rule === 'float') return depth >= 0.0003;
  if (rule === 'shore') return depth >= 0.0003 || (depth <= DRY && s.slope <= MAX_SLOPE);
  return depth <= DRY && s.slope <= MAX_SLOPE;
}

// Yaw (around the local up, matching setFromUnitVectors(UP, dir)) that turns
// a model's +x axis toward `target` along the surface.
function facing(dir: THREE.Vector3, target: THREE.Vector3): number {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const inv = q.clone().invert();
  const local = target.clone().sub(dir).applyQuaternion(inv);
  return Math.atan2(-local.z, local.x);
}
