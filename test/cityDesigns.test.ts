// Guarantees of how the town drawings (src/town; their own guarantees in
// townDrawings.test.ts) are laid onto the globe (cityStamp.ts), and the
// ground cities reshape (terraform.ts).

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stamp, type FanPt } from '../src/cityStamp.ts';
import { roadEntries, roadLines } from '../src/roads.ts';
import { builtMask, cityGround } from '../src/terraform.ts';
import { CityProps, tileDensity, allowedDensity, isBuilt, isHarbor, type CitySpot } from '../src/cityProps.ts';
import { Game } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { USE } from '../src/cities.ts';
import { locate } from '../src/terrainMesh.ts';
import type { Globe } from '../src/goldberg.ts';


// The globe direction of a fan point (as the terrain places it).
function dirOf(globe: Globe, p: FanPt): THREE.Vector3 {
  const tl = globe.tiles[p.t]!, k = tl.corners.length;
  const A = globe.triCenters[tl.corners[p.i]!]!, B = globe.triCenters[tl.corners[(p.i + 1) % k]!]!;
  const w0 = 1 - p.wa - p.wb;
  return new THREE.Vector3().addScaledVector(tl.center, w0).addScaledVector(A, p.wa).addScaledVector(B, p.wb).normalize();
}

function grownGame(): Game {
  const g = new Game({ size: 'small', seed: 222 });
  g.players[0]!.isHuman = false;
  for (let i = 0; i < 120; i++) { aiTurn(g, g.players[0]!); g.endTurn(); }
  return g;
}

describe('DS4: drawings meet on the globe', () => {
  const g = grownGame();
  const D = g.globe.avgEdgeAngle;
  const fake = (t: number, i: number, wa: number, wb: number): CitySpot => ({ dir: dirOf(g.globe, { t, i, wa, wb }), ground: 0.01, water: 0, slope: 0, urban: 1 });
  const cp = new CityProps(g, fake, (d) => ({ ...fake(locate(g.globe, d).t, 0, 0, 0), dir: d, t: locate(g.globe, d).t }), 1);
  const cities = g.cities.filter((c) => g.cityTiles(c, USE.urban).length > 0);
  const built = (t: number) => isBuilt(g, t);
  it('the game has towns with urban tiles to test', () => expect(cities.length).toBeGreaterThan(0));

  it('no pentagon is ever built up', () => {
    for (let t = 0; t < g.N; t++) if (g.tiles[t]!.corners.length !== 6) expect(g.use[t] === USE.urban || g.use[t] === USE.center, `tile ${t}`).toBe(false);
  });

  it('both tiles of an edge read the same value: 1 or 2 between built-up tiles, 1 where a road comes in from open land, else 0', () => {
    const entries = roadEntries(g);
    const bad: string[] = [];
    for (let t = 0; t < g.N; t++) {
      if (!built(t)) continue;
      for (const n of g.tiles[t]!.neighbors) {
        const v = cp.edgeValue(t, n);
        if (built(n)) { if (v === 0 || v !== cp.edgeValue(n, t)) bad.push(`${t}-${n}: ${v} / ${cp.edgeValue(n, t)}`); }
        else if (v !== (entries.has(`${t}:${n}`) ? 1 : 0)) bad.push(`${t}-${n} (open land): ${v}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("every street end on a tile's rim meets a street of the tile across it (or a road), at the same point", () => {
    const bad: string[] = [];
    const key = (d: THREE.Vector3) => `${Math.round(d.x * 1e6)},${Math.round(d.y * 1e6)},${Math.round(d.z * 1e6)}`;
    const roadEnds = new Set(roadLines(g).flatMap((r) => [key(r.points[0]!), key(r.points[r.points.length - 1]!)]));
    for (const c of cities) {
      const tiles = [c.tile, ...g.cityTiles(c, USE.urban)].filter(built);
      // (The tiles across: this city's and any other built-up neighbors.)
      const around = [...new Set(tiles.flatMap((t) => [t, ...g.tiles[t]!.neighbors.filter(built)]))];
      const st = stamp(cp.stampTiles(around, null));
      const ends = new Map<string, number[]>();
      for (const s of st.streets) for (const p of [s.pts[0]!, s.pts[s.pts.length - 1]!]) {
        if (Math.abs(p.wa + p.wb - 1) > 1e-9) continue; // not on the rim
        const k = key(dirOf(g.globe, p)), l = ends.get(k);
        if (l) l.push(p.t); else ends.set(k, [p.t]);
      }
      for (const [k, ts] of ends) {
        if (!tiles.includes(ts[0]!) && !tiles.includes(ts[1] ?? -1)) continue;
        const across = new Set(ts).size >= 2;
        if (!across && !roadEnds.has(k)) bad.push(`${c.name}: a street ends alone on the rim of tile ${ts[0]}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("a city's streets are one network: every two neighboring built-up tiles share a street across their edge", () => {
    const bad: string[] = [];
    for (const c of cities) {
      const tiles = [c.tile, ...g.cityTiles(c, USE.urban)].filter(built);
      for (const t of tiles) for (const n of g.tiles[t]!.neighbors) if (tiles.includes(n) && cp.edgeValue(t, n) === 0) bad.push(`${c.name}: ${t}-${n}`);
    }
    expect(bad).toEqual([]);
  });

  it('lots from different tiles never stand on each other', () => {
    const bad: string[] = [];
    for (const c of cities) {
      const st = stamp(cp.stampTiles([c.tile, ...g.cityTiles(c, USE.urban)], c.buildings.has('walls') ? c.tile : null));
      const pts = st.lots.map((l) => ({ d: dirOf(g.globe, l.at), l }));
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          if (pts[a]!.l.tile === pts[b]!.l.tile) continue;
          // Footprints are at least 0.008 tile steps from their middle to their side (wells).
          if (pts[a]!.d.angleTo(pts[b]!.d) / D < 0.012) bad.push(`city ${c.name}: lots ${a} (${pts[a]!.l.kind}) and ${b} (${pts[b]!.l.kind})`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe('DS7: harbors (urban water tiles) take no streets; their buildings stand on the water', async () => {
  const { buildPresets, PRESETS } = await import('../src/sandbox.ts');
  const g = new Game({ size: 'medium', seed: 7 });
  g.units.length = 0;
  buildPresets(g, PRESETS.filter((p) => p.name === 'Lighthouse port'));
  // Water tiles wet, land dry.
  const at = (t: number, dir: THREE.Vector3): CitySpot => ({ dir, ground: 0.01, water: g.isWater(t) ? 0.011 : 0, slope: 0, urban: 1 });
  const cp = new CityProps(g, (t, i, wa, wb) => at(t, dirOf(g.globe, { t, i, wa, wb })), (d) => { const t = locate(g.globe, d).t; return { ...at(t, d), t }; }, 1);
  const harbors = Array.from({ length: g.N }, (_, t) => t).filter((t) => isHarbor(g, t));
  it('the port has a harbor tile', () => expect(harbors.length).toBeGreaterThan(0));
  it('a harbor is not built up, and no street of a town crosses into it', () => {
    const bad: string[] = [];
    for (const t of harbors) {
      if (isBuilt(g, t)) bad.push(`${t} built up`);
      for (const n of g.tiles[t]!.neighbors) if (isBuilt(g, n) && cp.edgeValue(n, t) !== 0) bad.push(`${n}-${t}: a street`);
    }
    expect(bad).toEqual([]);
  });
  it('every building of a harbor is placed', () => {
    const bad: string[] = [];
    for (const t of harbors) {
      const want = g.slotKeys(t).filter((k) => k !== null && k !== 'walls').length;
      const got = cp.place(t).filter((b) => b.kind !== 'foundation').length;
      if (got < want) bad.push(`tile ${t}: ${got}/${want}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('DS5: densities', () => {
  const g = grownGame();
  // (Was: hills never high. High is now the quads, fine on hills; skyscrapers are not.)
  it('a tile with two buildings is never low; hills are never metropolitan', () => {
    for (let t = 0; t < g.N; t++) {
      if (g.use[t] !== USE.urban && g.use[t] !== USE.center) continue;
      const two = g.slotKeys(t).filter((k) => k !== null).length >= 2;
      if (two) expect(allowedDensity(g, t, 'low')).not.toBe('low');
      if (g.relief[t] === 'hills') expect(allowedDensity(g, t, 'metropolitan')).not.toBe('metropolitan');
      // Triples, quads and skyscrapers only by hand (the City Lab), until the Renaissance, Industrial and Modern eras exist.
      expect(['dense', 'high', 'metropolitan']).not.toContain(tileDensity(g, t));
    }
  });
});

describe('DS6: cities drain wetlands and soften hills on their own tiles only', async () => {
  const { generateWorld } = await import('../src/world.ts');
  const { buildPaintData, warpAt } = await import('../src/paint.ts');
  const { buildRelief } = await import('../src/relief.ts');
  const { tileLook } = await import('../src/look.ts');
  const { buildTerrainMesh } = await import('../src/terrainMesh.ts');
  const { buildSurface, meshLevels } = await import('../src/surface.ts');
  type S = ReturnType<typeof buildSurface>;
  const seed = 4;
  const { globe, map } = generateWorld('medium', seed);
  const looks = globe.tiles.map((t) => tileLook(map, t.id));
  const paint = buildPaintData(globe, map, seed);
  const relief = buildRelief(globe, map, looks, seed, paint.params.r0);
  const levels = meshLevels(globe, map, looks);
  let surface: S | null = null;
  const mesh = buildTerrainMesh(globe, {
    level: (t) => levels[t] as 1 | 2 | 4,
    surface: (topo) => (surface = buildSurface(globe, map, looks, paint, relief, seed, topo)).fields,
    warp: (dir, out) => { warpAt(paint.params, dir.x, dir.y, dir.z, out); },
    fanAttributes: [],
  }, 4);
  const sf = surface! as S;
  const { topo, fields } = mesh;
  // Built: every pool tile and every hill tile with a few of its neighbors.
  const wet = globe.tiles.filter((t) => looks[t.id]!.pool && !looks[t.id]!.water).map((t) => t.id);
  const hilly = globe.tiles.filter((t) => map.relief[t.id] === 'hills').map((t) => t.id).slice(0, 40);
  const built = new Set<number>();
  for (const t of [...wet, ...hilly]) { built.add(t); if (t % 2) for (const n of globe.tiles[t]!.neighbors.slice(0, 2)) if (!looks[n]!.water && map.relief[n] !== 'mountains') built.add(n); }
  const isBuilt = (t: number) => built.has(t);
  const orig = fields.height.slice();

  it('there are wetlands and hills to test', () => { expect(wet.length).toBeGreaterThan(5); expect(hilly.length).toBeGreaterThan(5); });
  for (const keep of [1, 0.6]) {
    const changes = cityGround(globe, topo, sf.layers, orig, fields.water, isBuilt, keep);
    it(`hills at ${keep}: nothing changes on a vertex touching a tile that is not built up`, () => {
      const bad: number[] = [];
      for (const v of changes.keys()) {
        for (let s = 0; s < 3; s++) { const o = topo.owners[v * 3 + s]!; if (o >= 0 && !built.has(o)) bad.push(v); }
        if (!built.has(topo.tile[v]!)) bad.push(v);
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });
    it(`hills at ${keep}: no pool water is left in the built-up middle of a tile`, () => {
      const mask = builtMask(globe, topo, isBuilt);
      let left = 0, pools = 0;
      for (let v = 0; v < topo.V; v++) {
        if (mask[v]! < 1 || Number.isNaN(sf.layers.poolLevel[v]!)) continue;
        pools++;
        const h = changes.get(v)?.height ?? orig[v]!;
        if (h <= fields.water[v]!) left++;
      }
      expect(pools).toBeGreaterThan(50);
      expect(left).toBe(0);
    });
    it(`hills at ${keep}: built ground that was dry stays above the water`, () => {
      let bad = 0;
      for (const [v, c] of changes) if (orig[v]! > fields.water[v]! && c.height <= fields.water[v]!) bad++;
      expect(bad).toBe(0);
    });
  }
  it('softening hills lowers them: at 0.6 the built hill tops are lower than as generated', () => {
    const changes = cityGround(globe, topo, sf.layers, orig, fields.water, isBuilt, 0.6);
    const mask = builtMask(globe, topo, isBuilt);
    let lowered = 0, n = 0;
    for (let v = 0; v < topo.V; v++) {
      if (mask[v]! < 1 || sf.layers.hill[v]! < 0.002) continue;
      n++;
      if ((changes.get(v)?.height ?? orig[v]!) < orig[v]! - 0.0005) lowered++;
    }
    expect(n).toBeGreaterThan(20);
    expect(lowered / n).toBeGreaterThan(0.9);
  });
});
