// Guarantees of the ground cities reshape (terraform.ts): wetlands drained
// and hills softened on their own tiles only.
// (Was also DS4, DS5, DS7: how the old town drawings met across tiles,
// their densities and harbors. Cities are painted on their center tile
// now, cityPainter.test.ts.)

import { describe, it, expect } from 'vitest';
import { builtMask, cityGround } from '../src/terraform.ts';

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
