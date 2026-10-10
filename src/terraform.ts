// Cities reshape the ground they are built on (render.ts applies it):
//   - wetlands are drained: the pools dug into a marsh, swamp, mangrove or
//     peat bog (and an oasis pond) are filled back up to dry ground, so
//     the drawings can be laid on firm land;
//   - hills are softened: what hills add over flat land is scaled by
//     `hillKeep` (1 keeps them as they are).
// Only built-up tiles change. Toward a tile that is not built up the
// change fades out inside the built tile, so the edge itself and every
// other tile keep their ground exactly. Pure: from the surface's layers
// and the original heights.

import type { Globe } from './goldberg.ts';
import type { Topology } from './terrainMesh.ts';
import type { SurfaceLayers } from './surface.ts';
import { POOL_BANK } from './surface.ts';

// The change fades out between these hex radii of a built tile, toward a
// side whose neighbor is not built.
const FADE: readonly [number, number] = [0.98, 0.8];
const ABOVE_WATER = 0.0002; // softened hills stay at least this far above water they were above

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// How much each vertex belongs to built-up ground (0..1).
export function builtMask(globe: Globe, topo: Topology, built: (t: number) => boolean): Float32Array {
  const m = new Float32Array(topo.V);
  const { tiles, triCenters } = globe;
  // Per tile: for each side, its middle (to measure how near a point is to it).
  const mids = tiles.map((tl) => tl.corners.map((c, j) => {
    const a = triCenters[c]!, b = triCenters[tl.corners[(j + 1) % tl.corners.length]!]!;
    const mx = (a.x + b.x) / 2 - tl.center.x, my = (a.y + b.y) / 2 - tl.center.y, mz = (a.z + b.z) / 2 - tl.center.z;
    const l2 = mx * mx + my * my + mz * mz;
    return [mx / l2, my / l2, mz / l2] as const;
  }));
  for (let v = 0; v < topo.V; v++) {
    const t = topo.tile[v]!;
    if (!built(t)) continue;
    let ok = true;
    for (let s = 0; s < 3; s++) { const o = topo.owners[v * 3 + s]!; if (o >= 0 && !built(o)) ok = false; }
    if (!ok) continue;
    const tl = tiles[t]!;
    const dx = topo.dir[v * 3]! - tl.center.x, dy = topo.dir[v * 3 + 1]! - tl.center.y, dz = topo.dir[v * 3 + 2]! - tl.center.z;
    let k = 1;
    tl.neighbors.forEach((n, j) => {
      if (built(n)) return;
      const [mx, my, mz] = mids[t]![j]!;
      k *= smoothstep(FADE[0], FADE[1], dx * mx + dy * my + dz * mz);
    });
    m[v] = k;
  }
  return m;
}

// New heights for the vertices of built-up ground (only those that change).
export function cityGround(globe: Globe, topo: Topology, layers: SurfaceLayers, orig: Float32Array, water: Float32Array,
  built: (t: number) => boolean, hillKeep: number): Map<number, { height: number; up: number }> {
  const m = builtMask(globe, topo, built);
  const out = new Map<number, { height: number; up: number }>();
  for (let v = 0; v < topo.V; v++) {
    const k = m[v]!;
    if (k <= 0) continue;
    let h = orig[v]!, up = 0;
    const lvl = layers.poolLevel[v]!;
    if (!Number.isNaN(lvl)) {
      const dry = Math.max(layers.preDig[v]!, lvl + POOL_BANK + 0.00005);
      if (dry > h) { h += k * (dry - h); up = k; }
    }
    if (hillKeep !== 1 && layers.hill[v]! > 0) {
      const soft = h - k * (1 - hillKeep) * layers.hill[v]!;
      h = h > water[v]! ? Math.max(soft, Math.min(h, water[v]! + ABOVE_WATER)) : soft;
      up = Math.max(up, k * (1 - hillKeep));
    }
    if (h !== orig[v]) out.set(v, { height: h, up });
  }
  return out;
}
