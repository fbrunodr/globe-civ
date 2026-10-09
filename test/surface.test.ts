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
import { buildSurface, meshLevels, waterLevels, MAX_RIVER_SLOPE, LOWLAND, type Surface } from '../src/surface.ts';
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
          if (looks[t].water) expect(water - ground, `tile ${t}`).toBeGreaterThanOrEqual(0.00045);
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
        // least 5% of the nominal height), and typically high (median at
        // least 50%).
        const share: number[] = [];
        for (const tile of globe.tiles) {
          const t = tile.id;
          if (map.relief[t] !== 'mountains' || map.feature[t] === 'volcano' || looks[t].water) continue;
          const s = (mesh.at(t, 0, 0, 0).ground - 1 - relief.base[t]) / relief.peak[t];
          expect(s, `tile ${t}`).toBeGreaterThanOrEqual(0.05);
          share.push(s);
        }
        share.sort((a, b) => a - b);
        expect(share[Math.floor(share.length / 2)]).toBeGreaterThanOrEqual(0.5);
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

      it(`W5 ${size} seed ${seed}: the water surface has no steps`, () => {
        // Between neighboring vertices that are both under water (sea, lake,
        // river or wetland pool), the water level changes no faster than a
        // river may fall: no walls of water where two waters meet, and every
        // pool is flat.
        const { topo, fields } = mesh;
        const steps: string[] = [];
        const wetAt = (v: number) => fields.water[v] > fields.height[v];
        for (let v = 0; v < topo.V; v++) {
          if (!wetAt(v)) continue;
          for (let k = topo.adjStart[v]; k < topo.adjStart[v + 1]; k++) {
            const u = topo.adj[k];
            if (u < v || !wetAt(u)) continue;
            const dist = Math.hypot(topo.dir[u * 3] - topo.dir[v * 3], topo.dir[u * 3 + 1] - topo.dir[v * 3 + 1], topo.dir[u * 3 + 2] - topo.dir[v * 3 + 2]);
            const dw = Math.abs(fields.water[u] - fields.water[v]);
            if (dw > 2 * MAX_RIVER_SLOPE * dist + 2e-5) steps.push(`tile ${topo.tile[v]}: ${dw.toFixed(5)}`);
          }
        }
        expect(steps.slice(0, 10)).toEqual([]);
      });

      it(`W6 ${size} seed ${seed}: flat land away from water keeps its own relief (no terraces or trenches)`, () => {
        // Water levels shape the land only near their shores: further inland,
        // even ground below a nearby lake's level is left as it is.
        const { topo, fields } = mesh;
        const plain = (t: number) => map.relief[t] === 'flat' && !looks[t].water && !looks[t].pool && map.feature[t] === null;
        const off: string[] = [];
        const d = new THREE.Vector3();
        let checked = 0;
        for (let v = 0; v < topo.V; v++) {
          const t = topo.tile[v];
          // (Two rings of plain tiles: hills' erosion fades out over about that.)
          if (!plain(t) || !globe.tiles[t].neighbors.every((nb) => plain(nb) && globe.tiles[nb].neighbors.every(plain)) || surface.coast[v] < (LOWLAND.reach + LOWLAND.vary) * r0) continue;
          d.set(topo.dir[v * 3], topo.dir[v * 3 + 1], topo.dir[v * 3 + 2]);
          // Away from rivers and the valleys they cut.
          if (surface.rivers.some((c) => c.pts.some((p, j) => p.distanceTo(d) < c.half[j] + 0.7 * r0))) continue;
          const own = relief.heightAt(t, topo.fanIndex[v], topo.wa[v], topo.wb[v], d);
          checked++;
          if (Math.abs(fields.height[v] - own) > 0.0005) off.push(`tile ${t}: ${fields.height[v].toFixed(5)} vs ${own.toFixed(5)}`);
        }
        expect(off.slice(0, 10)).toEqual([]);
        expect(checked).toBeGreaterThan(200);
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
