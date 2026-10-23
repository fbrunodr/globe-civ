import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { padCuts } from '../src/terraform.ts';
import { isFloraModel, isLotModel, waterRule, BUILDING_KINDS, buildBuildingGeometry, modelGeometry, type ModelKind } from '../src/buildingCatalog.ts';
import { isHouseKind } from '../src/houses.ts';
import { triangles } from '../src/propCatalog.ts';
import { CityProps, WATER_GAP, type CitySpot } from '../src/cityProps.ts';
import { stamp, type StampTile } from '../src/cityStamp.ts';
import { Game } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { USE, WONDER_KEYS, isWonderKey } from '../src/cities.ts';
import { planRoads, roadLines, ROAD_HALF_WIDTH } from '../src/roads.ts';
import { HOMES } from '../src/town/geometry.ts';
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
  const count = (tiles: StampTile[]) => stamp(tiles).lots.filter((l) => HOMES.has(l.kind)).length;
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
    // (Every building fronts a street, and the town thins away from its edge: town/field.ts.)
    expect(count(cp.stampTiles(tiles, null))).toBeGreaterThanOrEqual(200);
  });
  // (Every street front is built at any density, so a denser tile holds
  // about as many houses, built higher: more storeys in all.)
  it('denser tiles, more storeys', () => {
    const tiles = [city.tile, ...g.tiles[city.tile].neighbors.slice(0, 5)];
    const storeys = (ts: StampTile[]) => stamp(ts).lots.reduce((a, l) => a + (HOMES.has(l.kind) ? l.floors ?? 1 : 0), 0);
    for (const t of tiles) cp.setDensity(t, 'low');
    const low = storeys(cp.stampTiles(tiles, null));
    for (const t of tiles) cp.setDensity(t, 'medium');
    expect(storeys(cp.stampTiles(tiles, null))).toBeGreaterThan(low);
  });
});

// A grown world, and a fake terrain: a third of the spots wet, some steep.
function grownGame(): Game {
  const g = new Game({ size: 'small', seed: 222 });
  g.players[0]!.isHuman = false;
  for (let i = 0; i < 120; i++) { aiTurn(g, g.players[0]!); g.endTurn(); }
  return g;
}

// (Was: dry and gentle ground, slope <= 0.3. Slopes are allowed now: a
// foundation fills under the building, see L5.)
describe('L3: city buildings stand on dry ground (boats on water)', () => {
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
    // (The two fake samplers disagree at the same point; keep the one placement used.)
    if (!spots.has(key(dir))) spots.set(key(dir), s);
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
      const rule = waterRule(b.kind);
      const wet = s.water - s.ground >= 0.0003, dry = s.water <= s.ground;
      if (rule === 'float' ? !wet : rule === 'shore' ? !wet && !dry : !dry) bad.push(`tile ${t}: ${b.kind}`);
    }
  }
  it('places buildings', () => expect(count).toBeGreaterThan(200));
  it('none in water, boats only on water', () => expect(bad).toEqual([]));
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

describe('L5: on slopes, houses stand level at their street: a foundation below, a cut above', () => {
  const g = grownGame();
  // A tilted world: the ground rises steadily along x (far steeper than any hill).
  const ground = (d: THREE.Vector3) => 0.01 + 0.08 * d.x;
  const at = (d: THREE.Vector3): CitySpot => ({ dir: d, ground: ground(d), water: 0, slope: 0.6, urban: 1 });
  const sampler = (t: number, i: number, wa: number, wb: number): CitySpot => {
    const tl = g.tiles[t]!, k = tl.corners.length;
    const A = g.globe.triCenters[tl.corners[i]!]!, B = g.globe.triCenters[tl.corners[(i + 1) % k]!]!;
    return at(tl.center.clone().multiplyScalar(1 - wa - wb).addScaledVector(A, wa).addScaledVector(B, wb).normalize());
  };
  const cp = new CityProps(g, sampler, (d) => ({ ...at(d), t: locate(g.globe, d).t }), 1);
  let homes = 0, levelled = 0;
  const sunk: string[] = [], offStreet: string[] = [];
  for (let t = 0; t < g.N; t++) {
    if (g.use[t] !== USE.urban && g.use[t] !== USE.center) continue;
    const items = cp.place(t);
    for (const [i, b] of items.entries()) {
      if (b.kind === 'foundation') continue;
      const p = new THREE.Vector3().setFromMatrixPosition(b.matrix), floor = p.length() - 1;
      if (isLotModel(b.kind)) {
        if (isHouseKind(b.kind)) homes++;
        // Its floor at the ground of its door (the front of its lot, at the street).
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(b.matrix)).normalize();
        const s = new THREE.Vector3().setFromMatrixScale(b.matrix).x, ld = new THREE.Box3().setFromBufferAttribute(modelGeometry(b.kind).getAttribute('position') as THREE.BufferAttribute).max.z;
        const door = ground(p.clone().normalize().addScaledVector(front, ld * s).normalize());
        if (Math.abs(floor - door) > 0.0006) offStreet.push(`tile ${t}: ${b.kind} floor ${floor.toFixed(5)} door ${door.toFixed(5)}`);
        // Lower ground under it: a foundation follows; higher: a cut (its pad, at its floor).
        if (items[i + 1]?.kind === 'foundation' || b.pad) levelled++;
        if (b.pad && Math.abs(b.pad.base - floor) > 1e-9) offStreet.push(`tile ${t}: pad off its floor`);
        continue;
      }
      if (['gardenTree', 'well', 'fountain', 'stall'].includes(b.kind) || isFloraModel(b.kind)) continue;
      if (floor < ground(p.clone().normalize()) - 0.0003) sunk.push(`tile ${t}: ${b.kind}`);
    }
  }
  it('houses still stand on the slope', () => expect(homes).toBeGreaterThan(200));
  it('each house\'s floor is at the street, at its door', () => expect(offStreet.slice(0, 5)).toEqual([]));
  it('on the slope every house has a foundation, a cut, or both', () => expect(levelled).toBeGreaterThanOrEqual(homes));
  it('no other building sinks below the ground under it (it stands at its highest corner)', () => expect(sunk.slice(0, 5)).toEqual([]));
});

describe('L7: no land building touches water: its footprint and a margin round it stay dry', () => {
  const g = grownGame();
  const D = g.globe.avgEdgeAngle;
  // Flat ground with bands of water across it, about a tile apart (like rivers).
  const wetAt = (d: THREE.Vector3) => Math.sin((d.x + 0.7 * d.z) / (2.2 * D)) > 0.75;
  const at = (d: THREE.Vector3): CitySpot => ({ dir: d, ground: 0.01, water: wetAt(d) ? 0.0105 : 0, slope: 0, urban: 1 });
  const sampler = (t: number, i: number, wa: number, wb: number): CitySpot => {
    const tl = g.tiles[t]!, k = tl.corners.length;
    const A = g.globe.triCenters[tl.corners[i]!]!, B = g.globe.triCenters[tl.corners[(i + 1) % k]!]!;
    return at(tl.center.clone().multiplyScalar(1 - wa - wb).addScaledVector(A, wa).addScaledVector(B, wb).normalize());
  };
  const cp = new CityProps(g, sampler, (d) => ({ ...at(d), t: locate(g.globe, d).t }), 1);
  let homes = 0;
  const bad: string[] = [];
  for (let t = 0; t < g.N; t++) {
    if (g.use[t] !== USE.urban && g.use[t] !== USE.center) continue;
    for (const b of cp.place(t)) {
      // (Walls may follow a bank and garden trees grow on it; roofs, doors and foundations sit with their walls.)
      // (Town lots: the house and its yard.)
      // (The town's trees are its tile's flora, which may grow on a bank.)
      if (waterRule(b.kind) !== undefined || isFloraModel(b.kind) || ['wallSegment', 'wallTower', 'gardenTree', 'bush', 'hedge', 'foundation'].includes(b.kind)) continue;
      if (isHouseKind(b.kind)) homes++;
      const c = new THREE.Vector3().setFromMatrixPosition(b.matrix).normalize();
      for (const p of cp.footprint(b)) {
        const out = p.clone().sub(c), l = out.length();
        // (A hair inside the margin: the check samples exactly at it.)
        const q = l > 1e-12 ? p.clone().addScaledVector(out, (0.95 * WATER_GAP * D) / l).normalize() : p;
        if (wetAt(p) || wetAt(q)) { bad.push(`tile ${t}: ${b.kind}`); break; }
      }
    }
  }
  it('houses still stand between the bands', () => expect(homes).toBeGreaterThan(100));
  it('none reaches the water', () => expect(bad.slice(0, 5)).toEqual([]));
});

describe('L6: no building stands on a street or a road', () => {
  const g = grownGame();
  // Flat dry ground (so every lot is used and nothing gets a foundation).
  const at = (d: THREE.Vector3): CitySpot => ({ dir: d, ground: 0.01, water: 0, slope: 0, urban: 1 });
  const sampler = (t: number, i: number, wa: number, wb: number): CitySpot => {
    const tl = g.tiles[t]!, k = tl.corners.length;
    const A = g.globe.triCenters[tl.corners[i]!]!, B = g.globe.triCenters[tl.corners[(i + 1) % k]!]!;
    return at(tl.center.clone().multiplyScalar(1 - wa - wb).addScaledVector(A, wa).addScaledVector(B, wb).normalize());
  };
  // The world scale render.ts uses: the tile size against its reference edge of 0.07.
  const scale = g.globe.avgEdgeAngle / 0.07;
  const cp = new CityProps(g, sampler, (d) => ({ ...at(d), t: locate(g.globe, d).t }), scale);
  const PROP = 1.5 * 0.276 * scale; // render.ts draws building models at this scale
  const box = new Map<string, THREE.Box3>();
  const footprint = (kind: ModelKind) => {
    let b = box.get(kind);
    if (!b) { const geo = modelGeometry(kind); geo.computeBoundingBox(); b = geo.boundingBox!; box.set(kind, b); }
    return b;
  };
  const FURNITURE = new Set<string>(['gardenTree', 'well', 'fountain', 'stall', 'shed', 'foundation']);
  for (let t = 0; t < g.N; t++) cp.place(t);
  const streets = [
    ...cp.streets().map((s) => ({ pts: s.points, hw: s.halfWidth })),
    ...roadLines(g).map((r) => ({ pts: r.points, hw: r.points.map(() => ROAD_HALF_WIDTH * g.globe.avgEdgeAngle) })),
  ];
  // Distance (radians) from a direction to a street's middle line, and its half width there.
  const near = (d: THREE.Vector3, s: { pts: THREE.Vector3[]; hw: number[] }) => {
    let best = Infinity, w = 0;
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const a = s.pts[i]!, b = s.pts[i + 1]!, ab = b.clone().sub(a), l2 = ab.lengthSq();
      const u = l2 > 0 ? Math.max(0, Math.min(1, d.clone().sub(a).dot(ab) / l2)) : 0;
      const dist = a.clone().addScaledVector(ab, u).distanceTo(d);
      if (dist < best) { best = dist; w = s.hw[i]! + (s.hw[i + 1]! - s.hw[i]!) * u; }
    }
    return best - w;
  };
  const bad = new Map<string, number>();
  let checked = 0;
  for (let t = 0; t < g.N; t++) {
    if (g.use[t] === USE.wild) continue;
    for (const b of cp.place(t)) {
      if (FURNITURE.has(b.kind) || isFloraModel(b.kind)) continue;
      checked++;
      const fb = footprint(b.kind);
      const pts: THREE.Vector3[] = [];
      for (const [x, z] of [[fb.min.x, fb.min.z], [fb.max.x, fb.min.z], [fb.max.x, fb.max.z], [fb.min.x, fb.max.z], [(fb.min.x + fb.max.x) / 2, fb.min.z], [(fb.min.x + fb.max.x) / 2, fb.max.z], [fb.min.x, (fb.min.z + fb.max.z) / 2], [fb.max.x, (fb.min.z + fb.max.z) / 2]] as const) {
        // (A town lot, its yard included, is in tile steps with its scale in its matrix.)
        const k = isHouseKind(b.kind) ? 1 : PROP;
        pts.push(new THREE.Vector3(x * k, 0, z * k).applyMatrix4(b.matrix).normalize());
      }
      const c = new THREE.Vector3().setFromMatrixPosition(b.matrix).normalize();
      if (streets.some((s) => s.pts.length > 1 && c.distanceTo(s.pts[0]!) < 0.1 && pts.some((p) => near(p, s) < 0))) bad.set(b.kind, (bad.get(b.kind) ?? 0) + 1);
    }
  }
  it('checks the buildings of a grown world', () => expect(checked).toBeGreaterThan(500));
  it('no footprint touches a street or road', () => expect(Object.fromEntries(bad)).toEqual({}));
});

describe('L8: floors cut into the ground, reversibly', () => {
  // A patch of ground round the north pole, rising along x; vertices every 0.002 rad.
  const D = 0.057, dirs: number[] = [], heights: number[] = [];
  for (let i = -30; i <= 30; i++) for (let j = -30; j <= 30; j++) {
    const v = new THREE.Vector3(i * 0.002, j * 0.002, 1).normalize();
    dirs.push(v.x, v.y, v.z); heights.push(0.01 + 0.05 * v.x);
  }
  const all = Array.from({ length: heights.length }, (_, k) => k);
  const pad = (x: number, y: number, base: number) => ({ at: new THREE.Vector3(x, y, 1).normalize(), X: new THREE.Vector3(0.01, 0, 0), Z: new THREE.Vector3(0, 0.01, 0), base });
  const pads = [pad(0, 0, 0.01), pad(0.03, 0.03, 0.0105)];
  const cut = padCuts(dirs, heights, pads, D, () => all);
  it('only ever lowers the ground, and only where it is above a floor', () => {
    for (const [v, c] of cut) expect(c.height).toBeLessThan(heights[v]!);
  });
  it('under a lot the ground is at the floor (or lower, as it was)', () => {
    for (const p of pads) for (const v of all) {
      const d = new THREE.Vector3(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2]).sub(p.at);
      if (Math.abs(d.dot(p.X)) / p.X.lengthSq() < 1 && Math.abs(d.dot(p.Z)) / p.Z.lengthSq() < 1) expect(cut.get(v)?.height ?? heights[v]!).toBeLessThanOrEqual(p.base + 1e-12);
    }
  });
  it('the same floors give the same cut, from the ground as it was: one floor gone, its cut goes; none, none', () => {
    expect([...padCuts(dirs, heights, pads, D, () => all)]).toEqual([...cut]);
    const one = padCuts(dirs, heights, [pads[0]!], D, () => all);
    expect([...one.keys()].every((v) => cut.has(v))).toBe(true);
    expect(one.size).toBeLessThan(cut.size);
    expect(padCuts(dirs, heights, [], D, () => all).size).toBe(0);
  });
});
