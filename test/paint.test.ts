// Guarantees of the terrain painting (paint.ts), relief (relief.ts) and
// river curves (riverCurve.ts): how close the drawn world stays to the tiles.
// P9 (the shader computes the same noise as paint.ts) runs in a browser:
// npm run paintcheck.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../src/world.ts';
import { BAND_MAX, buildPaintData, fanCoords, fanFrames, paintAt, FAN_COORDS } from '../src/paint.ts';
import { buildRelief } from '../src/relief.ts';
import { riverCurve } from '../src/riverCurve.ts';
import { tileLook } from '../src/look.ts';
import { mulberry32 } from '../src/rng.ts';
import type { MapSizeKey } from '../src/rules.ts';

const SEEDS: Record<MapSizeKey, number[]> = { small: [1, 2, 3], medium: [4, 5], large: [6] };
const SAMPLES = 64; // per tile

// Painted share of every candidate tile, sampled uniformly over tile t.
function setup(size: MapSizeKey, seed: number) {
  const w = generateWorld(size, seed);
  const paint = buildPaintData(w.globe, w.map, seed);
  const frames = fanFrames(w.globe);
  return { w, paint, frames };
}

describe('terrain painting', () => {
  it('P1 the band (wobble + blend) is at most 0.26 of the inner radius', () => {
    expect(BAND_MAX).toBeLessThanOrEqual(0.26 + 1e-9);
  });

  it('same seed, same painting, relief and rivers (reloads look identical)', () => {
    const snap = () => {
      const { w, paint } = setup('small', 7);
      const looks = w.globe.tiles.map((t) => tileLook(w.map, t.id));
      const relief = buildRelief(w.globe, w.map, looks, 7, paint.params.r0);
      const d = new THREE.Vector3(0.3, 0.8, 0.52).normalize();
      return JSON.stringify({
        fans: paint.fans,
        heights: w.globe.tiles.slice(0, 200).map((t) => relief.heightAt(t.id, 0, 0.3, 0.2, d)),
        rivers: w.map.rivers.map((r) => riverCurve(w.globe, paint, r).map((p) => p.dir.toArray())),
      });
    };
    expect(snap()).toBe(snap());
  });

  for (const [size, seeds] of Object.entries(SEEDS) as [MapSizeKey, number[]][]) {
    for (const seed of seeds) {
      it(`P1–P4, P6 ${size} seed ${seed}: pure cores, own majority, bounded drift`, () => {
        const { w, paint, frames } = setup(size, seed);
        const { globe, map } = w;
        const r0 = paint.params.r0;
        const looks = globe.tiles.map((t) => tileLook(map, t.id));
        const co = new Float32Array(FAN_COORDS);
        const rand = mulberry32(seed);
        const d = new THREE.Vector3();
        let sumShare = 0;
        for (const tile of globe.tiles) {
          const t = tile.id, k = tile.corners.length;
          const share = new Map<number, number>();
          let wetShare = 0;
          for (let n = 0; n < SAMPLES; n++) {
            const i = Math.floor(rand() * k);
            let wa = rand(), wb = rand();
            if (wa + wb > 1) { wa = 1 - wa; wb = 1 - wb; }
            d.copy(tile.center).multiplyScalar(1 - wa - wb)
              .addScaledVector(globe.triCenters[tile.corners[i]], wa)
              .addScaledVector(globe.triCenters[tile.corners[(i + 1) % k]], wb).normalize();
            const fanId = paint.fanStart[t] + i;
            const fan = paint.fans[fanId];
            fanCoords(frames[fanId], d.x, d.y, d.z, co);
            const ps = paintAt(paint.params, fan, co, d.x, d.y, d.z);
            const edgeDist = Math.min(co[0], co[1], co[2]);
            // P1: beyond the band from every edge, the point is 100% its own tile.
            if (edgeDist > BAND_MAX * r0) expect(ps.w[0]).toBe(1);
            // P3: a point painted mostly by another tile lies within the band.
            if (ps.w[0] < 0.5) expect(edgeDist).toBeLessThanOrEqual(BAND_MAX * r0 + 1e-9);
            fan.ids.forEach((u, c) => share.set(u, (share.get(u) ?? 0) + ps.w[c] / SAMPLES));
            fan.ids.forEach((u, c) => { if ((looks[u].wet >= 0.5) === (looks[t].wet >= 0.5)) wetShare += ps.w[c] / SAMPLES; });
          }
          const own = share.get(t) ?? 0;
          sumShare += own;
          // P2: every tile keeps at least 75% of its own area.
          expect(own, `tile ${t}`).toBeGreaterThanOrEqual(0.75);
          // P4: no other tile takes more of it.
          for (const [u, s] of share) if (u !== t) expect(s).toBeLessThan(own);
          // P6: land stays land and water stays water on at least 75% of the tile.
          expect(wetShare).toBeGreaterThanOrEqual(0.75);
        }
        expect(sumShare / globe.tiles.length).toBeGreaterThanOrEqual(0.88);
      });

      it(`P5 ${size} seed ${seed}: rivers stay within 0.15 r of their edges`, () => {
        const { w, paint } = setup(size, seed);
        const { globe, map } = w;
        const r0 = paint.params.r0;
        const tmp = new THREE.Vector3(), seg = new THREE.Vector3();
        for (const r of map.rivers) {
          const pts = riverCurve(globe, paint, r);
          expect(pts.length).toBeGreaterThan(1);
          for (const p of pts) {
            let best = Infinity;
            for (let k = 0; k + 1 < r.corners.length; k++) {
              const a = globe.triCenters[r.corners[k]], b = globe.triCenters[r.corners[k + 1]];
              seg.subVectors(b, a);
              const u = Math.min(1, Math.max(0, tmp.subVectors(p.dir, a).dot(seg) / seg.lengthSq()));
              best = Math.min(best, tmp.copy(a).addScaledVector(seg, u).distanceTo(p.dir));
            }
            expect(best / r0).toBeLessThanOrEqual(0.15 + 1e-6);
          }
        }
      });

      it(`P7–P8 ${size} seed ${seed}: crests hold between mountains; centers sit at their level`, () => {
        const { w, paint } = setup(size, seed);
        const { globe, map } = w;
        const looks = globe.tiles.map((t) => tileLook(map, t.id));
        const relief = buildRelief(globe, map, looks, seed, paint.params.r0);
        const dir = (t: number, i: number, wa: number, wb: number) => {
          const tile = globe.tiles[t], k = tile.corners.length;
          return tile.center.clone().multiplyScalar(1 - wa - wb)
            .addScaledVector(globe.triCenters[tile.corners[i]], wa)
            .addScaledVector(globe.triCenters[tile.corners[(i + 1) % k]], wb).normalize();
        };
        const h = (t: number, i: number, wa: number, wb: number) => relief.heightAt(t, i, wa, wb, dir(t, i, wa, wb));
        // P7: along every ridge link, the crest keeps at least 70% of the lower peak.
        for (const r of relief.ridges) {
          const [a, b] = r.tiles;
          if (b < 0) continue;
          const i = globe.tiles[a].neighbors.indexOf(b);
          const j = globe.tiles[b].neighbors.indexOf(a);
          const low = Math.min(h(a, 0, 0, 0), h(b, 0, 0, 0));
          for (let s = 0; s <= 10; s++) {
            const u = s / 20; // center -> edge midpoint, from both sides
            expect(h(a, i, u, u)).toBeGreaterThanOrEqual(0.7 * low);
            expect(h(b, j, u, u)).toBeGreaterThanOrEqual(0.7 * low);
          }
        }
        // P8: flat land and water centers sit at their tile's level, up to the noise.
        for (const tile of globe.tiles) {
          const t = tile.id;
          if (map.relief[t] !== 'flat' && looks[t].wet < 0.5) continue;
          if (map.riverTile[t]) continue; // valleys may reach the center of small tiles
          expect(Math.abs(h(t, 0, 0, 0) - looks[t].height)).toBeLessThanOrEqual(looks[t].roughness * 1.2 + 1e-6);
        }
      });
    }
  }
});
