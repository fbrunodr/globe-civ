// The drawn course of a river: the painted border itself. Along each tile
// edge it runs on, its middle is where the painting (paintAt, as the shader
// and the props see it) changes hands between the edge's two tiles, so the
// two banks never share a tile. Around a tile corner it keeps to the border
// of the tile both edges share, which the painting already rounds.

import * as THREE from 'three';
import type { Globe } from './goldberg.ts';
import type { River } from './rivers.ts';
import { borderBetween } from './rivers.ts';
import { FAN_COORDS, fanCoords, fanFrames, paintAt, warpAt, type PaintData } from './paint.ts';
import { locate } from './terrainMesh.ts';

export interface RiverPoint {
  dir: THREE.Vector3; // unit direction on the globe
  tile: number;       // a tile whose fan holds the point's edge
  fan: number;        // index i of that edge in the tile
  edge: number;       // index k of the river edge (corners k -> k+1)
}

// Points along each edge (its share f from corner k to corner k + 1).
const SAMPLES = 24;
// The border is looked for out to this share of the way from a tile's center
// past its edge, in steps.
const REACH = 1.6, STEP = 0.04;
// A turn sharper than this at one point is a stray (the border's corners turn less).
const STRAY_TURN = (70 * Math.PI) / 180;

export function riverCurve(globe: Globe, paint: PaintData, river: River): RiverPoint[] {
  const frames = fanFrames(globe);
  const delta = [0, 0, 0], co = new Float32Array(FAN_COORDS);
  let hint = 0;
  // The tile that owns the painting at a point.
  const owner = (dir: THREE.Vector3): number => {
    const { t, i } = locate(globe, dir, hint);
    hint = t;
    const fanId = paint.fanStart[t] + i, fan = paint.fans[fanId];
    fanCoords(frames[fanId], fan, warpAt(paint.params, dir.x, dir.y, dir.z, delta), dir.x, dir.y, dir.z, co);
    const w = paintAt(paint, fanId, co).w;
    let o = 0;
    for (let c = 1; c < 4; c++) if (w[c] > w[o]) o = c;
    return fan.ids[o];
  };

  const n = river.corners.length;
  const pairs: ([number, number] | null)[] = [];
  for (let k = 0; k + 1 < n; k++) pairs.push(borderBetween(globe, river.corners[k], river.corners[k + 1]));
  const shared = (p: readonly number[] | null, q: readonly number[] | null) => (p && q ? p.find((t) => q.includes(t)) : undefined);

  // Where S's land ends, on the ray from S's center out through `through`:
  // only into a tile across the river (near its source, or its mouth, S's
  // land may end into a third tile, where the river isn't yet).
  const trace = (S: number, across: readonly number[], through: THREE.Vector3): THREE.Vector3 | null => {
    const ctr = globe.tiles[S].center;
    const point = (u: number) => ctr.clone().lerp(through, u).normalize();
    let lo = NaN, hi = NaN;
    for (let m = 1; m * STEP <= REACH; m++) {
      const o = owner(point(m * STEP));
      if (o === S) continue;
      if (across.includes(o)) { lo = (m - 1) * STEP; hi = m * STEP; }
      break;
    }
    if (Number.isNaN(lo)) return null;
    for (let it = 0; it < 18; it++) {
      const mid = (lo + hi) / 2;
      if (owner(point(mid)) === S) lo = mid; else hi = mid;
    }
    return point((lo + hi) / 2);
  };

  type Traced = RiverPoint & { S: number; across: number[] };
  const out: Traced[] = [];
  const at = new THREE.Vector3();
  for (let k = 0; k + 1 < n; k++) {
    const pair = pairs[k];
    if (!pair) continue;
    const a = pair[0];
    const c0 = river.corners[k], c1 = river.corners[k + 1];
    const tile = globe.tiles[a];
    const kk = tile.corners.length;
    const i = tile.corners.findIndex((c, j) => (c === c0 && tile.corners[(j + 1) % kk] === c1) || (c === c1 && tile.corners[(j + 1) % kk] === c0));
    if (i < 0) continue;
    const p0 = globe.triCenters[c0], p1 = globe.triCenters[c1];
    // Whose border it follows: toward each corner, the tile this edge shares
    // with the next (or last) edge, so the turn keeps to one tile's outline.
    const start = shared(pairs[k - 1] ?? null, pair) ?? a, end = shared(pair, pairs[k + 1] ?? null) ?? a;
    const edgePts: Traced[] = [];
    for (let s = k === 0 ? 0 : 1; s <= SAMPLES; s++) {
      const f = s / SAMPLES;
      const S = f <= 0.5 ? start : end;
      const across = [...pair, ...((f <= 0.5 ? pairs[k - 1] : pairs[k + 1]) ?? [])].filter((t) => t !== S);
      const dir = trace(S, across, at.copy(p0).lerp(p1, f).normalize());
      if (dir) edgePts.push({ dir, tile: a, fan: i, edge: k, S, across });
    }
    // (In order along the edge: past its middle the rays come from the other
    // bank's center and reach the border a little apart from the first's.)
    const along = p1.clone().sub(p0);
    edgePts.sort((x, y) => x.dir.dot(along) - y.dir.dot(along));
    out.push(...edgePts);
  }
  // (A lone point turning sharper than any corner of the border is a stray:
  // a ray that met the border where it wiggles. Dropped.)
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const turn = (j: number) => {
    if (j < 1 || j + 1 >= out.length) return 0;
    t1.subVectors(out[j].dir, out[j - 1].dir); t2.subVectors(out[j + 1].dir, out[j].dir);
    return Math.acos(Math.max(-1, Math.min(1, t1.dot(t2) / (t1.length() * t2.length() || 1))));
  };
  for (let j = 1; j + 1 < out.length; j++) if (turn(j) > STRAY_TURN) { out.splice(j, 1); j = Math.max(0, j - 2); }
  return out.map(({ dir, tile, fan, edge }) => ({ dir, tile, fan, edge }));
}
