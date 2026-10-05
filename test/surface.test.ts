// Guarantees of the surface (surface.ts): water shows where the tiles say
// water, land stays dry, lakes sit under the land around them, and every
// river's water runs unbroken into the sea, lake or river it ends in.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../src/world.ts';
import { buildPaintData, warpAt } from '../src/paint.ts';
import { buildRelief } from '../src/relief.ts';
import { tileLook } from '../src/look.ts';
import { buildTerrainMesh, locate } from '../src/terrainMesh.ts';
import { buildSurface, meshLevels, waterLevels, MAX_RIVER_SLOPE, type Surface } from '../src/surface.ts';
import type { MapSizeKey } from '../src/rules.ts';

const SEEDS: Record<MapSizeKey, number[]> = { small: [1, 2], medium: [4], large: [6] };

function setup(size: MapSizeKey, seed: number) {
  const w = generateWorld(size, seed);
  const { globe, map } = w;
  const looks = globe.tiles.map((t) => tileLook(map, t.id));
  const paint = buildPaintData(globe, map, seed);
  const params = paint.params;
  const relief = buildRelief(globe, map, looks, seed, params.r0, (x, y, z, out) => warpAt(params, x, y, z, out));
  const levels = meshLevels(globe, map, looks);
  let surface: Surface | null = null;
  const mesh = buildTerrainMesh(globe, {
    level: (t) => levels[t] as 1 | 2 | 4,
    surface: (topo) => (surface = buildSurface(globe, map, looks, paint, relief, seed, topo)).fields,
    warp: (dir, out) => { warpAt(params, dir.x, dir.y, dir.z, out); },
    fanAttributes: [],
  }, 4);
  return { w, looks, relief, mesh, surface: surface!, r0: params.r0 };
}

describe('surface', () => {
  for (const [size, seeds] of Object.entries(SEEDS) as [MapSizeKey, number[]][]) {
    for (const seed of seeds) {
      const { w, looks, relief, mesh, surface, r0 } = setup(size, seed);
      const { globe, map } = w;

      it(`W1 ${size} seed ${seed}: water tiles are under water at their center, land tiles dry`, () => {
        for (const tile of globe.tiles) {
          const t = tile.id;
          const { ground, water } = mesh.at(t, 0, 0, 0);
          if (looks[t].water) expect(water - ground, `tile ${t}`).toBeGreaterThanOrEqual(0.0005);
          else if (!looks[t].pool) expect(ground - water, `tile ${t}`).toBeGreaterThanOrEqual(0.0002);
        }
      });

      it(`W2 ${size} seed ${seed}: rivers end in their water, at its level; levels never rise downstream`, () => {
        expect(surface.rivers.length).toBe(map.rivers.length);
        const hint = { t: 0 };
        for (const c of surface.rivers) {
          const n = c.pts.length;
          if (!c.tributary) {
            // The end lies in open water (the ground there is a sea or lake
            // bed), and the river meets it at its level.
            const at = locate(globe, c.pts[n - 1], hint.t);
            hint.t = at.t;
            const s = mesh.at(at.t, at.i, at.wa, at.wb);
            expect(s.water - s.ground).toBeGreaterThan(0.0005);
            expect(Math.abs(1 + c.level[n - 1] - s.water)).toBeLessThan(1e-5);
          }
          for (let j = 0; j + 1 < n; j++) {
            expect(c.level[j + 1]).toBeLessThanOrEqual(c.level[j] + 1e-12);
            expect(c.level[j] - c.level[j + 1]).toBeLessThanOrEqual(MAX_RIVER_SLOPE * c.pts[j].distanceTo(c.pts[j + 1]) + 1e-12);
          }
        }
      });

      it(`W4 ${size} seed ${seed}: each lake is one level, under all the land around it`, () => {
        const level = waterLevels(globe, map, looks, relief);
        for (const tile of globe.tiles) {
          if (map.biome[tile.id] !== 'lake') continue;
          for (const nb of tile.neighbors) {
            if (map.biome[nb] === 'lake') expect(level[nb]).toBe(level[tile.id]);
            else if (!looks[nb].water) expect(level[tile.id]).toBeLessThan(relief.base[nb]);
          }
        }
      });

      it(`W3 ${size} seed ${seed}: every river's water is unbroken from near its source to its end`, () => {
        let hint = 0;
        const mid = new THREE.Vector3();
        for (const c of surface.rivers) {
          let along = 0;
          for (let j = 0; j < c.pts.length; j++) {
            if (j > 0) along += c.pts[j].distanceTo(c.pts[j - 1]);
            if (along < 0.5 * r0) continue; // the source itself may be a trickle
            // The course points and the midpoints between them.
            for (const p of j > 0 ? [c.pts[j], mid.copy(c.pts[j]).add(c.pts[j - 1]).normalize()] : [c.pts[j]]) {
              const at = locate(globe, p, hint);
              hint = at.t;
              const s = mesh.at(at.t, at.i, at.wa, at.wb);
              expect(s.water - s.ground, `river point ${j}`).toBeGreaterThan(0);
            }
          }
        }
      });
    }
  }
});
