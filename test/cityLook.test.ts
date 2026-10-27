import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { isFloraModel, isLotModel, waterRule, BUILDING_KINDS, buildBuildingGeometry, modelGeometry, type ModelKind } from '../src/buildingCatalog.ts';
import { isHouseKind } from '../src/houses.ts';
import { triangles } from '../src/propCatalog.ts';
import { CityProps, PADDY_DEPTH, WATER_GAP, type CitySpot } from '../src/cityProps.ts';
import { Game } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { USE, WONDER_KEYS, improvementFor, isWonderKey } from '../src/cities.ts';
import { planRoads, roadLines, ROAD_HALF_WIDTH } from '../src/roads.ts';
import { SITE_MODELS } from '../src/wonderModels.ts';
import { locate } from '../src/terrainMesh.ts';

// City look guarantees (design doc "Cities: Feel & Play", city look v1).

describe('L1: building models', () => {
  it('houses, rural structures and buildings stay within 40 triangles, wonders within 120', () => {
    const over = BUILDING_KINDS.map((k) => [k, triangles(buildBuildingGeometry(k))] as const).filter(([k, t]) => t > (isWonderKey(k) ? 120 : 40));
    expect(over).toEqual([]);
  });
  // (Machu Picchu on its summit, the catalog; the others on their square, wonderModels.ts.)
  it('every wonder has a model', () => {
    expect(WONDER_KEYS.filter((w) => !(w === 'machuPicchu' ? (BUILDING_KINDS as string[]).includes(w) : (SITE_MODELS as string[]).includes(w)))).toEqual([]);
  });
});

// (Was: houses stamped by the hand-drawn tiles, by density. A city is
// painted on its center now: 4 + 3 × size buildings, cityDress.ts.)
describe('L2: houses grow with the city', () => {
  const g = new Game({ size: 'small', seed: 5 });
  const settler = g.units.find((u) => u.owner === 0 && u.type === 'settler')!;
  const city = g.foundCity(settler)!;
  // (Flat dry ground everywhere.)
  const cp = new CityProps(g, () => ({ dir: new THREE.Vector3(0, 1, 0), ground: 0.01, water: 0, slope: 0, urban: 1 }), (d) => ({ dir: d, ground: 0.01, water: 0, slope: 0, urban: 1, t: 0 }), 1);
  const houses = () => cp.place(city.tile).filter((b) => isHouseKind(b.kind)).length;
  it('on open land, a city of size n shows 4 + 3n houses on its center', () => {
    for (const pop of [1, 4, 10]) {
      city.pop = pop;
      expect(houses(), `size ${pop}`).toBe(4 + 3 * pop);
    }
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
    const s: CitySpot = { dir, ground: 0.01, water: h < 0.2 ? 0.0105 : 0.009, slope: h > 0.93 ? 0.5 : 0.05, urban: g.use[t] === USE.center ? 0.9 : 0.1 };
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
      // (Rice stands in its paddy's water, up to PADDY_DEPTH of its height.)
      const paddy = b.kind === 'rural|crop' && improvementFor(g.terrainAt(t)) === 'wetland'
        && s.water - s.ground <= PADDY_DEPTH * new THREE.Vector3().setFromMatrixColumn(b.matrix, 1).length() + 1e-12;
      if (!paddy && (rule === 'float' ? !wet : rule === 'shore' ? !wet && !dry : !dry)) bad.push(`tile ${t}: ${b.kind}`);
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

// (Was: houses stand level at their street, the ground cut where higher.
// A city is now a diorama with no streets, cityProps.ts: its houses stand
// level with the highest ground under them, a foundation below.)
describe('L5: on slopes, city houses stand level: at the highest ground under them, a foundation below', () => {
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
  let homes = 0, founded = 0;
  const sunk: string[] = [];
  for (let t = 0; t < g.N; t++) {
    if (g.use[t] !== USE.center) continue;
    const items = cp.place(t);
    for (const [i, b] of items.entries()) {
      if (b.kind === 'foundation' || isFloraModel(b.kind)) continue;
      const p = new THREE.Vector3().setFromMatrixPosition(b.matrix), floor = p.length() - 1;
      const top = Math.max(...cp.footprint(b).map((d) => ground(d)));
      if (floor < top - 0.0003) sunk.push(`tile ${t}: ${b.kind} floor ${floor.toFixed(5)} ground ${top.toFixed(5)}`);
      if (isHouseKind(b.kind)) { homes++; if (items[i + 1]?.kind === 'foundation') founded++; }
    }
  }
  it('houses still stand on the slope', () => expect(homes).toBeGreaterThan(50));
  it('nothing sinks below the highest ground under it', () => expect(sunk.slice(0, 5)).toEqual([]));
  it('on the slope every house has a foundation', () => expect(founded).toBe(homes));
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
    if (g.use[t] !== USE.center) continue;
    for (const b of cp.place(t)) {
      // (Walls may follow a bank and garden trees grow on it; roofs, doors and foundations sit with their walls.)
      // (Town lots: the house and its yard.)
      // (The town's trees are its tile's flora, which may grow on a bank.)
      if (waterRule(b.kind) !== undefined || isFloraModel(b.kind) || ['wallSegment', 'wallTower', 'foundation'].includes(b.kind)) continue;
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
  const FURNITURE = new Set<string>(['foundation']);
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
        // (A lot model, its yard included, is in tile steps with its scale in its matrix.)
        const k = isLotModel(b.kind) ? 1 : PROP;
        pts.push(new THREE.Vector3(x * k, 0, z * k).applyMatrix4(b.matrix).normalize());
      }
      const c = new THREE.Vector3().setFromMatrixPosition(b.matrix).normalize();
      if (streets.some((s) => s.pts.length > 1 && c.distanceTo(s.pts[0]!) < 0.1 && pts.some((p) => near(p, s) < 0))) bad.set(b.kind, (bad.get(b.kind) ?? 0) + 1);
    }
  }
  it('checks the buildings of a grown world', () => expect(checked).toBeGreaterThan(500));
  it('no footprint touches a street or road', () => expect(Object.fromEntries(bad)).toEqual({}));
});
// (Was L8: floors cut into the ground. Nothing is cut now: a house stands
// at the highest ground under it, a foundation below, L5.)
