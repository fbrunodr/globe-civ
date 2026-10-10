import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BUILDING_KINDS, buildBuildingGeometry, buildingEntry } from '../src/buildingCatalog.ts';
import { triangles } from '../src/propCatalog.ts';
import { CityProps, type CitySpot } from '../src/cityProps.ts';
import { stamp, type StampTile } from '../src/cityStamp.ts';
import { Game } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { USE, WONDER_KEYS, isWonderKey } from '../src/cities.ts';
import { planRoads } from '../src/roads.ts';
import { locate } from '../src/terrainMesh.ts';

// City look guarantees (design doc "Cities: Feel & Play", city look v1).

describe('L1: building models', () => {
  it('houses, rural structures and buildings stay within 40 triangles, wonders within 120', () => {
    const over = BUILDING_KINDS.map((k) => [k, triangles(buildBuildingGeometry(k))] as const).filter(([k, t]) => t > (isWonderKey(k) ? 120 : 40));
    expect(over).toEqual([]);
  });
  it('every wonder has a model', () => {
    expect(WONDER_KEYS.filter((w) => !(BUILDING_KINDS as string[]).includes(w))).toEqual([]);
  });
});

// (Was a housesOn(pop) bound on houses per tile; houses now come from the
// hand-drawn tiles, so the bound is on what the drawings stamp.)
describe('L2: houses grow with the city', () => {
  const count = (tiles: StampTile[]) => stamp(tiles).lots.filter((l) => l.kind === 'house' || l.kind === 'row' || l.kind === 'block' || l.kind === 'tower').length;
  const g = new Game({ size: 'small', seed: 5 });
  const settler = g.units.find((u) => u.owner === 0 && u.type === 'settler')!;
  const city = g.foundCity(settler)!;
  const cp = new CityProps(g, () => ({ dir: new THREE.Vector3(0, 1, 0), ground: 0, water: 0, slope: 0, urban: 1 }), (d) => ({ dir: d, ground: 0, water: 0, slope: 0, urban: 1, t: 0 }), 1);
  it('a small town shows a few dozen houses on its center (and its outskirts)', () => {
    const n = count(cp.stampTiles([city.tile], null));
    expect(n).toBeGreaterThanOrEqual(25);
    expect(n).toBeLessThanOrEqual(90);
  });
  it('a capital with 5 urban tiles at medium density shows a couple of hundred', () => {
    const tiles = [city.tile, ...g.tiles[city.tile].neighbors.slice(0, 5)];
    for (const t of tiles) cp.setDensity(t, 'medium');
    for (const t of tiles.slice(1)) g.use[t] = USE.urban, g.tileCity[t] = city.id;
    expect(count(cp.stampTiles(tiles, null))).toBeGreaterThanOrEqual(300);
  });
  it('denser tiles, more houses', () => {
    const tiles = [city.tile, ...g.tiles[city.tile].neighbors.slice(0, 5)];
    for (const t of tiles) cp.setDensity(t, 'low');
    const low = count(cp.stampTiles(tiles, null));
    for (const t of tiles) cp.setDensity(t, 'medium');
    expect(count(cp.stampTiles(tiles, null))).toBeGreaterThan(low);
  });
});

// A grown world, and a fake terrain: a third of the spots wet, some steep.
function grownGame(): Game {
  const g = new Game({ size: 'small', seed: 222 });
  g.players[0]!.isHuman = false;
  for (let i = 0; i < 120; i++) { aiTurn(g, g.players[0]!); g.endTurn(); }
  return g;
}

describe('L3: city buildings stand on dry, gentle ground (boats on water)', () => {
  const g = grownGame();
  const spots = new Map<string, CitySpot>();
  const sampler = (t: number, i: number, wa: number, wb: number): CitySpot => {
    const h = Math.abs(Math.sin(t * 12.9898 + i * 78.233 + wa * 37.719 + wb * 11.1)) * 1000 % 1;
    const dir = g.tiles[t].center.clone().add(new THREE.Vector3(wa * 0.01, i * 0.001, wb * 0.01)).normalize();
    const s: CitySpot = { dir, ground: 0.01, water: h < 0.33 ? 0.0105 : 0.009, slope: h > 0.9 ? 0.5 : 0.05, urban: 0.5 + 0.5 * h };
    spots.set(key(dir), s);
    return s;
  };
  const key = (d: THREE.Vector3) => `${d.x.toFixed(6)},${d.y.toFixed(6)},${d.z.toFixed(6)}`;
  // Any direction: its tile by the globe, its ground by a hash of the direction.
  const dirSampler = (dir: THREE.Vector3) => {
    const t = locate(g.globe, dir).t;
    const h = Math.abs(Math.sin(dir.x * 12989.8 + dir.y * 78233.1 + dir.z * 37719.3)) * 1000 % 1;
    const s: CitySpot = { dir, ground: 0.01, water: h < 0.2 ? 0.0105 : 0.009, slope: h > 0.93 ? 0.5 : 0.05, urban: g.use[t] === USE.urban || g.use[t] === USE.center ? 0.9 : 0.1 };
    spots.set(key(dir), s);
    return { ...s, t };
  };
  const cp = new CityProps(g, sampler, dirSampler, 1);
  const bad: string[] = [];
  let count = 0;
  for (let t = 0; t < g.N; t++) {
    if (g.use[t] === USE.wild) continue;
    for (const b of cp.place(t)) {
      count++;
      const pos = new THREE.Vector3().setFromMatrixPosition(b.matrix).normalize();
      const s = spots.get(key(pos));
      if (!s) continue;
      const rule = buildingEntry(b.kind).water;
      const wet = s.water - s.ground >= 0.0003, dry = s.water <= s.ground && s.slope <= 0.3;
      if (rule === 'float' ? !wet : rule === 'shore' ? !wet && !dry : !dry) bad.push(`tile ${t}: ${b.kind}`);
    }
  }
  it('places buildings', () => expect(count).toBeGreaterThan(200));
  it('none in water or on steep ground, boats only on water', () => expect(bad).toEqual([]));
  it('roads join cities over land', () => {
    const roads = planRoads(g);
    expect(roads.length).toBeGreaterThan(0);
    const wet = roads.flatMap((r) => r.tiles.slice(1, -1).filter((t) => g.isWater(t)).map((t) => `road ${r.a}-${r.b} tile ${t}`));
    expect(wet).toEqual([]);
  });
});

describe('L4: City Lab presets build as described', () => {
  it('every preset finds a site and reaches its size, buildings and wonders', async () => {
    const { buildPresets, PRESETS } = await import('../src/sandbox.ts');
    const bad: string[] = [];
    for (const seed of [7, 8]) {
      const g = new Game({ size: 'medium', seed });
      g.units.length = 0;
      const built = buildPresets(g);
      if (built.length !== PRESETS.length) bad.push(`seed ${seed}: ${built.length}/${PRESETS.length} presets placed`);
      for (const b of built) {
        if (!b.city) continue;
        const p = b.preset;
        if (b.city.pop < p.pop) bad.push(`seed ${seed} ${p.name}: size ${b.city.pop}/${p.pop}`);
        const missing = p.buildings.filter((k) => !b.city!.buildings.has(k));
        if (missing.length) bad.push(`seed ${seed} ${p.name}: missing ${missing.join(', ')}`);
        const noWonder = p.wonders.filter((w) => !g.wondersBuilt.has(w));
        if (noWonder.length) bad.push(`seed ${seed} ${p.name}: no ${noWonder.join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
