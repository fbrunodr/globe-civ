// What stands on a city's tiles (design doc "Cities: Feel & Play", city
// look): the town is laid out for the whole city at once, in order:
//   1. what has a fixed place: buildings in their slots, wonders, the hall
//      on the center's plaza;
//   2. streets over the whole built-up area: streets radiating from the
//      plaza and rings around it, each running until the urban ground ends;
//   3. walls along the center's edge, with a gate (and towers) wherever a
//      street passes through;
//   4. houses along both sides of the streets, facing them, kept clear of
//      the streets, walls, buildings and each other, the nearest to the
//      center first.
// Rural tiles get one structure each (farmstead, mine head, quarry stones,
// lodge, stilt hut, fishing boats). Everything is a pure function of the
// city's state and the seed, so a reload looks identical.

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
// The ground under any direction, and the tile it falls in.
export type DirSampler = (dir: THREE.Vector3) => CitySpot & { t: number };

// A street, drawn by render.ts as a ribbon on the ground.
export interface Street {
  points: THREE.Vector3[]; // unit directions along it
  halfWidth: number;       // radians
  paved: boolean;
}

interface CityLayout {
  sig: string;
  byTile: Map<number, PlacedBuilding[]>;
  streets: Street[];
}

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
  private readonly layouts = new Map<number, CityLayout>();

  constructor(private readonly game: Game, private readonly sample: SpotSampler, private readonly sampleDir: DirSampler,
    private readonly scale: number) {}

  // The built-up tiles of a city (its center first).
  private built(city: City): number[] {
    return [city.tile, ...this.game.cityTiles(city, USE.urban)];
  }

  // Everything the town's layout depends on.
  private citySig(city: City, memo?: Map<number, string>): string {
    const m = memo?.get(city.id);
    if (m !== undefined) return m;
    const g = this.game;
    const tiles = this.built(city).map((t) => `${t}:${g.specialists[t]}:${g.slots[t * SLOTS]},${g.slots[t * SLOTS + 1]}:${g.wonderAt[t]}`).join(';');
    const sig = `${city.id}|${city.pop}|${g.players[city.owner]!.era}|${city.buildings.has('walls') ? 'w' : ''}|${city.wonderTile ?? ''}|${tiles}`;
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
    return `${u}|${city.id}|${site}|${g.eraAt(t)}`;
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

  // Every city's streets (for the ground ribbons).
  streets(): Street[] {
    return this.game.cities.flatMap((c) => this.layout(c).streets);
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
  // ---------- the town ----------

  private buildLayout(city: City, sig: string): CityLayout {
    const g = this.game, D = g.globe.avgEdgeAngle;
    const rand = mulberry32(city.id * 7919 + city.tile * 31 + 5);
    const byTile = new Map<number, PlacedBuilding[]>();
    const put = (t: number, b: PlacedBuilding) => { const l = byTile.get(t); if (l) l.push(b); else byTile.set(t, [b]); };
    const era = g.players[city.owner]!.era;
    const tiles = this.built(city);
    const mine = new Set(tiles);

    // A frame at the center: polar coordinates in tile steps (D radians).
    const up = g.tiles[city.tile].center.clone();
    const east = new THREE.Vector3(0, 1, 0).cross(up);
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0).cross(up);
    east.normalize();
    const north = up.clone().cross(east);
    const polar = (r: number, th: number) => {
      const tan = east.clone().multiplyScalar(Math.cos(th)).addScaledVector(north, Math.sin(th));
      return up.clone().multiplyScalar(Math.cos(r * D)).addScaledVector(tan, Math.sin(r * D)).normalize();
    };
    const dist = (a: THREE.Vector3, b: THREE.Vector3) => a.angleTo(b) / D; // in tile steps
    const town = (s: CitySpot & { t: number }, minUrban: number) =>
      mine.has(s.t) && s.urban >= minUrban && s.water - s.ground <= DRY && s.slope <= MAX_SLOPE;

    // 1. Fixed places: slot buildings, wonders (or scaffolding), the hall and its plaza.
    const keepOut: { d: THREE.Vector3; r: number }[] = [];
    for (const t of tiles) {
      const center = t === city.tile;
      const k = g.tiles[t].corners.length;
      (center ? CENTER_SLOT_SPOTS : SLOT_SPOTS).forEach(([i, wa, wb], slot) => {
        const b = g.slotKeys(t)[slot];
        if (!b || b === 'walls') return;
        const kind = MODEL[b];
        const s = this.findSpot(t, i % k, wa, wb, kind, rand);
        if (!s) return;
        keepOut.push({ d: s.dir, r: KEEP_CLEAR * 0.5 });
        put(t, this.make(kind, s.dir, Math.max(s.ground, s.water), facing(s.dir, up) + Math.PI / 2, HOUSE_SCALE, buildingEntry(kind).leaf, rand));
      });
      const w = g.wonderOn(t);
      const landmark = w ? WONDER_MODEL[w] : city.wonderTile === t ? 'scaffold' : null;
      if (landmark) {
        for (const it of this.landmark(t, landmark, rand)) {
          keepOut.push({ d: new THREE.Vector3().setFromMatrixPosition(it.matrix).normalize(), r: WONDER_CLEAR * 0.5 });
          put(t, it);
        }
      }
    }
    for (let tries = 0; tries < 12; tries++) {
      const r = 0.02 + 0.04 * tries;
      const s = this.sample(city.tile, tries % g.tiles[city.tile].corners.length, r, r * 0.5);
      if (s.water - s.ground > DRY || s.slope > MAX_SLOPE) continue;
      put(city.tile, this.make('hall', s.dir, s.ground, facing(s.dir, east.clone().add(up)), HOUSE_SCALE, 0x5f5650, rand));
      keepOut.push({ d: s.dir, r: 0.1 });
      break;
    }
    keepOut.push({ d: up, r: 0.13 }); // the plaza

    // 2. Streets: radiating from the plaza, and rings around it.
    const streets: Street[] = [];
    const main = 0.016 * D, lane = 0.011 * D;
    const paved = era > 0;
    const K = Math.min(9, 5 + Math.floor(tiles.length / 2));
    const radials: THREE.Vector3[][] = [];
    for (let i = 0; i < K; i++) {
      let th = (i / K) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const pts: THREE.Vector3[] = [];
      for (let r = 0.12; r < 3.8; r += 0.05) {
        const d = polar(r, th);
        if (!town(this.sampleDir(d), 0.45)) break;
        pts.push(d);
        th += (rand() - 0.5) * 0.08 + 0.025 * Math.sin(r * 4 + i);
      }
      if (pts.length >= 3) { radials.push(pts); streets.push({ points: pts, halfWidth: main, paved }); }
    }
    const rings: THREE.Vector3[][] = [];
    const phase = rand() * 6;
    for (const r0 of [0.3, 0.64, 0.98, 1.34, 1.72, 2.14, 2.6, 3.1]) {
      const steps = Math.max(12, Math.ceil((Math.PI * 2 * r0) / 0.05));
      let run: THREE.Vector3[] = [];
      const runs: THREE.Vector3[][] = [];
      for (let j = 0; j <= steps; j++) {
        const th = (j / steps) * Math.PI * 2;
        const d = polar(r0 + 0.045 * Math.sin(3 * th + phase + r0), th);
        if (town(this.sampleDir(d), 0.5)) run.push(d);
        else { if (run.length >= 3) runs.push(run); run = []; }
      }
      if (run.length >= 3) {
        // Closed all the way round: the last run joins the first.
        if (runs.length && runs[0]![0]!.angleTo(polar(r0, 0)) < 0.2 * D && run.length > 0) runs[0] = [...run, ...runs[0]!];
        else runs.push(run);
      }
      for (const rr of runs) { rings.push(rr); streets.push({ points: rr, halfWidth: lane, paved }); }
    }

    // Street points in a grid, for "is this spot on a street?".
    const CELL = 0.08;
    const cellOf = (d: THREE.Vector3) => `${Math.floor(d.dot(east) / D / CELL)},${Math.floor(d.dot(north) / D / CELL)}`;
    const onStreet = new Map<string, { d: THREE.Vector3; hw: number }[]>();
    for (const st of streets) for (const d of st.points) {
      const key = cellOf(d);
      const l = onStreet.get(key);
      if (l) l.push({ d, hw: st.halfWidth / D }); else onStreet.set(key, [{ d, hw: st.halfWidth / D }]);
    }
    const near = (d: THREE.Vector3, f: (x: { d: THREE.Vector3; hw: number }) => boolean) => {
      const cx = Math.floor(d.dot(east) / D / CELL), cy = Math.floor(d.dot(north) / D / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const x of onStreet.get(`${cx + dx},${cy + dy}`) ?? []) if (f(x)) return true;
      return false;
    };

    // 3. Walls along the center's edge, with a gate where a street passes.
    const wallLine: THREE.Vector3[] = [];
    if (city.buildings.has('walls')) {
      const t = city.tile, k = g.tiles[t].corners.length;
      const R = 0.86, STEPS = 4;
      const crossed = (d: THREE.Vector3) => radials.some((pts) => pts.some((p) => dist(p, d) < 0.06));
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < STEPS; j++) {
          const f = j / STEPS, f2 = (j + 0.5) / STEPS;
          const a = this.sample(t, i, R * (1 - f), R * f), b = this.sample(t, i, R * (1 - f - 1 / STEPS), R * (f + 1 / STEPS));
          const m = this.sample(t, i, R * (1 - f2), R * f2);
          const gate = crossed(m.dir);
          if (j === 0 && standsAt('wallTower', a) && !crossed(a.dir)) put(t, this.make('wallTower', a.dir, a.ground, 0, HOUSE_SCALE, buildingEntry('wallTower').leaf, rand));
          wallLine.push(m.dir, a.dir);
          if (gate) {
            // Towers either side of the gate.
            for (const s of [a, b]) if (standsAt('wallTower', s) && !crossed(s.dir)) put(t, this.make('wallTower', s.dir, s.ground, 0, HOUSE_SCALE * 0.85, buildingEntry('wallTower').leaf, rand));
            continue;
          }
          if (!standsAt('wallSegment', m)) continue;
          const seg = this.make('wallSegment', m.dir, m.ground, facing(m.dir, b.dir), HOUSE_SCALE, buildingEntry('wallSegment').leaf, rand);
          // Stretch the segment to the gap between its ends (model length 0.01 at prop scale).
          const len = a.dir.angleTo(b.dir) / (0.01 * HOUSE_SCALE * this.scale * PROP_SCALE);
          seg.matrix.multiply(new THREE.Matrix4().makeScale(Math.max(0.6, Math.min(2.5, len)), 1, 1));
          put(t, seg);
        }
      }
    }

    // 4. Houses along the streets, facing them.
    const want = tiles.reduce((n, t) => n + housesOn(city.pop, g.specialists[t]!, t === city.tile), 0);
    const cand: { d: THREE.Vector3; yaw: number; score: number; r: number }[] = [];
    const HOUSE = 0.022; // half a house's depth, tile steps
    for (const st of streets) {
      const pts = st.points, hw = st.halfWidth / D;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k]!;
        const tan = pts[Math.min(pts.length - 1, k + 1)]!.clone().sub(pts[Math.max(0, k - 1)]!);
        if (tan.lengthSq() < 1e-12) continue;
        const side = p.clone().cross(tan).normalize();
        for (const sgn of [-1, 1]) {
          for (let row = 0; row < 2; row++) {
            const off = (hw + HOUSE + 0.006 + row * (2 * HOUSE + 0.008)) * D;
            const d = p.clone().addScaledVector(side, sgn * off).normalize();
            const r = dist(d, up);
            cand.push({ d, yaw: facing(d, d.clone().add(tan)), score: r + row * 0.35 + rand() * 0.12, r });
          }
        }
      }
    }
    cand.sort((a, b) => a.score - b.score);
    const houses: THREE.Vector3[] = [];
    const temp = g.map.temperature[city.tile]!;
    let placed = 0;
    for (const c of cand) {
      if (placed >= want) break;
      if (keepOut.some((o) => dist(o.d, c.d) < o.r)) continue;
      if (wallLine.some((w) => dist(w, c.d) < 0.045)) continue;
      if (near(c.d, (x) => dist(x.d, c.d) < x.hw + HOUSE * 0.9)) continue;
      if (houses.some((h) => dist(h, c.d) < 2 * HOUSE * 0.95)) continue;
      const s = this.sampleDir(c.d);
      if (!town(s, HOUSE_URBAN)) continue;
      houses.push(c.d);
      placed++;
      const roll = rand();
      const inner = c.r < 0.9 && city.pop >= 6;
      const kind: BuildingKind = city.pop <= 2 && roll < 0.4 ? 'hut'
        : inner && roll < 0.45 ? 'townhouse'
        : roll < 0.6 ? 'cottage' : roll < 0.8 ? 'longhouse' : 'cornerHouse';
      const size = HOUSE_SCALE * (inner ? 1.05 : 0.95) * (0.88 + 0.2 * rand());
      const b = this.make(kind, c.d, s.ground, c.yaw + (rand() - 0.5) * 0.12, size, roofOf(temp, city.pop, era, rand), rand);
      const [wr, wg, wb] = ERA_WALL[era];
      b.color.multiply(new THREE.Color(wr, wg, wb));
      put(s.t, b);
    }
    return { sig, byTile, streets };
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
    return [this.make(kind, best.dir, best.ground, rand() * Math.PI * 2, HOUSE_SCALE, buildingEntry(kind).leaf, rand)];
  }

  // What is left of a razed city's built-up tile: broken walls here and there.
  private ruins(t: number): PlacedBuilding[] {
    const rand = mulberry32((t + 7) * 2246822519);
    const out: PlacedBuilding[] = [];
    for (let tries = 0; tries < 30 && out.length < 9; tries++) {
      const i = Math.floor(rand() * this.game.tiles[t].corners.length);
      const s = this.sample(t, i, 0.1 + 0.6 * rand(), 0.05 + 0.3 * rand());
      if (!standsAt('ruins', s)) continue;
      out.push(this.make('ruins', s.dir, s.ground, rand() * Math.PI * 2, HOUSE_SCALE * (0.8 + 0.5 * rand()), buildingEntry('ruins').leaf, rand));
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
