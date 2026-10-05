// The drawn course of a river: it follows the painted border along each
// tile edge it runs on (so the biome change follows the water), which keeps
// it within the border's wobble of the real edge, then corner cutting rounds
// the turns at tile corners.

import * as THREE from 'three';
import type { Globe } from './goldberg.ts';
import type { River } from './rivers.ts';
import { borderBetween } from './rivers.ts';
import { fanCoords, fanFrames, warpedDistance, type PaintData } from './paint.ts';

export interface RiverPoint {
  dir: THREE.Vector3; // unit direction on the globe
  tile: number;       // a tile whose fan holds the point's edge
  fan: number;        // index i of that edge in the tile
  edge: number;       // index k of the river edge (corners k -> k+1)
}

// Share of an edge, at each end, replaced by the rounded turn at a corner.
const TURN = 0.3;
const SAMPLES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export function riverCurve(globe: Globe, paint: PaintData, river: River): RiverPoint[] {
  const frames = fanFrames(globe);
  const co = new Float32Array(13);
  const T = paint.params.taper;
  const ss = (x: number) => { const t = Math.min(1, Math.max(0, x / T)); return t * t * (3 - 2 * t); };
  const n = river.corners.length;
  // Course along each edge: the painted border's zero crossing, sampled.
  const edges: RiverPoint[][] = [];
  for (let k = 0; k + 1 < n; k++) {
    const c0 = river.corners[k], c1 = river.corners[k + 1];
    const pair = borderBetween(globe, c0, c1);
    if (!pair) continue;
    const a = pair[0];
    const tile = globe.tiles[a];
    const kk = tile.corners.length;
    const i = tile.corners.findIndex((c, j) => (c === c0 && tile.corners[(j + 1) % kk] === c1) || (c === c1 && tile.corners[(j + 1) % kk] === c0));
    if (i < 0) continue;
    const fanId = paint.fanStart[a] + i;
    const fr = frames[fanId], fan = paint.fans[fanId];
    const p0 = globe.triCenters[c0], p1 = globe.triCenters[c1];
    const lo = k === 0 ? 0 : TURN, hi = k + 2 === n ? 1 : 1 - TURN;
    const pts: RiverPoint[] = [];
    for (const f of SAMPLES) {
      if (f < lo - 1e-9 || f > hi + 1e-9) continue;
      const x0 = p0.clone().lerp(p1, f).normalize();
      fanCoords(fr, x0.x, x0.y, x0.z, co);
      const s = warpedDistance(paint.params, fan, 1, 0, ss(co[4]) * ss(co[7]), x0.x, x0.y, x0.z);
      const dir = x0.clone().addScaledVector(new THREE.Vector3(fr.n[3], fr.n[4], fr.n[5]), -s).normalize();
      pts.push({ dir, tile: a, fan: i, edge: k });
    }
    edges.push(pts);
  }
  // Join the edges with rounded turns: a quadratic curve through each corner.
  const out: RiverPoint[] = [];
  edges.forEach((pts, e) => {
    if (e > 0) {
      const A = edges[e - 1][edges[e - 1].length - 1], B = pts[0];
      const C = globe.triCenters[river.corners[A.edge + 1]];
      for (let j = 1; j < 6; j++) {
        const u = j / 6;
        const dir = A.dir.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(C, 2 * u * (1 - u)).addScaledVector(B.dir, u * u).normalize();
        out.push({ ...(u < 0.5 ? A : B), dir });
      }
    }
    out.push(...pts);
  });
  return out;
}
