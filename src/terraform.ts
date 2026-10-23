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

// ---------- floors cut into the ground ----------

// A building's floor (cityProps.ts Pad): its middle, half extents (tangent
// vectors, radians), and the floor's height above radius 1.
export interface FloorPad { readonly at: { x: number; y: number; z: number }; readonly X: { x: number; y: number; z: number }; readonly Z: { x: number; y: number; z: number }; readonly base: number }
// The cut round a floor: flat this far beyond its lot (tile steps), then
// banked up at this slope (rise over run) to the ground as it was.
export const PAD_MARGIN = 0.003, PAD_SLOPE = 1.2;

// Where the ground (heights per vertex, `dirs` their unit directions) is
// higher than a floor over it, the new height: down to the floor under
// the lot, a bank round it. Only ever lowers; pure, from the heights given
// (the ground as it was before any floor), so with fewer floors there is
// less cut and with none, none: nothing to undo. `near` lists the vertices
// worth testing for a pad; D is the radians per tile step.
export function padCuts<P extends FloorPad>(dirs: ArrayLike<number>, heights: ArrayLike<number>, pads: readonly P[], D: number,
  near: (p: P) => Iterable<number>): Map<number, { height: number; up: number }> {
  const cut = new Map<number, { height: number; up: number }>();
  const margin = PAD_MARGIN * D;
  for (const p of pads) {
    const x2 = p.X.x ** 2 + p.X.y ** 2 + p.X.z ** 2, z2 = p.Z.x ** 2 + p.Z.y ** 2 + p.Z.z ** 2, xl = Math.sqrt(x2), zl = Math.sqrt(z2);
    for (const v of near(p)) {
      const h = heights[v]!;
      if (h <= p.base) continue;
      const dx = dirs[v * 3]! - p.at.x, dy = dirs[v * 3 + 1]! - p.at.y, dz = dirs[v * 3 + 2]! - p.at.z;
      const a = Math.abs((dx * p.X.x + dy * p.X.y + dz * p.X.z) / x2), b = Math.abs((dx * p.Z.x + dy * p.Z.y + dz * p.Z.z) / z2);
      const d = Math.max(0, Math.hypot(Math.max(0, a - 1) * xl, Math.max(0, b - 1) * zl) - margin);
      // (Flat at the floor over the lot, then a bank up to the ground as it was;
      // the floor's normals straight up, a bank's left as they were.)
      const allowed = p.base + d * PAD_SLOPE;
      if (allowed < (cut.get(v)?.height ?? h)) cut.set(v, { height: allowed, up: d > 0 ? 0 : 1 });
    }
  }
  return cut;
}
