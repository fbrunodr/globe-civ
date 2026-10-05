// Guarantees of the terrain painting (paint.ts), relief (relief.ts) and
// river curves (riverCurve.ts): how close the drawn world stays to the tiles.
// P9: the GPU interpolates the warp between vertices; the CPU evaluates it
// exactly. The difference stays small.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../src/world.ts';
import { buildPaintData, fanCoords, fanFrames, paintAt, warpAt, WARP_MAX, FAN_COORDS } from '../src/paint.ts';
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
  it('P9 the warp changes slowly enough for per-vertex interpolation (error ≤ 0.035 r)', () => {
    const { paint } = setup('medium', 3);
    const p = paint.params, r0 = p.r0;
    const rand = mulberry32(5);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), m = new THREE.Vector3();
    let worst = 0;
    for (let n = 0; n < 4000; n++) {
      a.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
      // Neighboring vertices are at most ~0.5 r apart (coarse tiles' widest ring).
      b.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(0.5 * r0).add(a).normalize();
      m.addVectors(a, b).normalize();
      const da = warpAt(p, a.x, a.y, a.z), db = warpAt(p, b.x, b.y, b.z), dm = warpAt(p, m.x, m.y, m.z);
      worst = Math.max(worst, Math.hypot(dm[0] - (da[0] + db[0]) / 2, dm[1] - (da[1] + db[1]) / 2, dm[2] - (da[2] + db[2]) / 2) / r0);
    }
    expect(worst).toBeLessThanOrEqual(0.035);
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
        const CORE = 0.7; // share of the inner radius: farther from every edge = own tile
        const { w, paint, frames } = setup(size, seed);
        const { globe, map } = w;
        const r0 = paint.params.r0;
        const looks = globe.tiles.map((t) => tileLook(map, t.id));
        const co = new Float32Array(FAN_COORDS);
        const rand = mulberry32(seed);
        const d = new THREE.Vector3();
        let sumShare = 0, below = 0;
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
            fanCoords(frames[fanId], fan, warpAt(paint.params, d.x, d.y, d.z), d.x, d.y, d.z, co);
            const ps = paintAt(paint, fanId, co);
            const fr = frames[fanId].n;
            const edgeDist = Math.min(...[0, 1, 2].map((j) => d.x * fr[3 * j] + d.y * fr[3 * j + 1] + d.z * fr[3 * j + 2]));
            // P1: far enough from every edge, the point is (at least 99%) its own tile.
            const ownLook = fan.ids.reduce((a, u, c) => a + (paint.group[u] === paint.group[t] ? ps.w[c] : 0), 0);
            if (edgeDist > CORE * r0) expect(ownLook).toBeGreaterThanOrEqual(0.99);
            // P3: a point painted mostly by another tile lies within the warp of an edge.
            if (ownLook < 0.5) expect(edgeDist).toBeLessThanOrEqual(WARP_MAX * r0 + 1e-9);
            // A neighbor that looks the same (same group) takes no area visually.
            fan.ids.forEach((u, c) => { const key = paint.group[u] === paint.group[t] ? t : u; share.set(key, (share.get(key) ?? 0) + ps.w[c] / SAMPLES); });
            fan.ids.forEach((u, c) => { if ((looks[u].wet >= 0.5) === (looks[t].wet >= 0.5)) wetShare += ps.w[c] / SAMPLES; });
          }
          const own = share.get(t) ?? 0;
          sumShare += own;
          // P2: every tile keeps a majority of its area; few keep less than 75%.
          expect(own, `tile ${t}`).toBeGreaterThan(0.5);
          if (own < 0.75) below++;
          // P4: no other look takes more of it.
          for (const [u, s] of share) if (u !== t) expect(s).toBeLessThan(own);
          // P6: land stays mostly land and water mostly water.
          expect(wetShare).toBeGreaterThan(0.5);
        }
        expect(below / globe.tiles.length).toBeLessThanOrEqual(0.05);
        expect(sumShare / globe.tiles.length).toBeGreaterThanOrEqual(0.9);
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
