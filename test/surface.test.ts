// Guarantees of the surface (surface.ts): water shows where the tiles say
// water, land stays dry, lakes sit under the land around them, every
// river's water runs unbroken into the sea, lake or river it ends in, and
// mountain ranges stand high and peak inside, away from their edges.

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
  const relief = buildRelief(globe, map, looks, seed, params.r0);
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

      it(`M1 ${size} seed ${seed}: mountain tiles stand high; every range peaks inside, away from its edge`, () => {
        // Mountain (non-volcano) tile centers stand clearly above the mountain
        // foot (ends of ranges and saddles between crests may be low: at
        // least 15% of the nominal height), and typically high (median at
        // least 60%).
        const share: number[] = [];
        for (const tile of globe.tiles) {
          const t = tile.id;
          if (map.relief[t] !== 'mountains' || map.feature[t] === 'volcano' || looks[t].water) continue;
          const s = (mesh.at(t, 0, 0, 0).ground - 1 - relief.base[t]) / relief.peak[t];
          expect(s, `tile ${t}`).toBeGreaterThanOrEqual(0.15);
          share.push(s);
        }
        share.sort((a, b) => a - b);
        expect(share[Math.floor(share.length / 2)]).toBeGreaterThanOrEqual(0.6);
        // Every range's highest vertex lies inside it: at least 0.3 r0 from any
        // other tile (narrow ranges, with warped edges, are only about that deep).
        const { topo, fields } = mesh;
        const inRange = (t: number) => map.relief[t] === 'mountains' && map.feature[t] !== 'volcano' && !looks[t].water;
        const seen = new Uint8Array(globe.tiles.length);
        for (const tile of globe.tiles) {
          if (!inRange(tile.id) || seen[tile.id]) continue;
          const range: number[] = [tile.id];
          seen[tile.id] = 1;
          for (let k = 0; k < range.length; k++) for (const nb of globe.tiles[range[k]].neighbors) if (inRange(nb) && !seen[nb]) { seen[nb] = 1; range.push(nb); }
          const set = new Set(range);
          let top = -1, best = -Infinity;
          for (let v = 0; v < topo.V; v++) if (set.has(topo.tile[v]) && fields.height[v] > best) { best = fields.height[v]; top = v; }
          // Distance from the top to the nearest vertex of a non-range tile.
          let near = Infinity;
          for (let v = 0; v < topo.V; v++) {
            if (set.has(topo.tile[v]) || inRange(topo.tile[v])) continue;
            const dx = topo.dir[v * 3] - topo.dir[top * 3], dy = topo.dir[v * 3 + 1] - topo.dir[top * 3 + 1], dz = topo.dir[v * 3 + 2] - topo.dir[top * 3 + 2];
            near = Math.min(near, Math.hypot(dx, dy, dz));
          }
          expect(near / r0, `range of ${range.length} at tile ${tile.id}`).toBeGreaterThanOrEqual(0.3);
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
