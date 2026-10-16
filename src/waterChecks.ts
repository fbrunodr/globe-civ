// Water and the tiles (src/town/geometry.ts SAFE_RHO, HARBOR_RHO), checked
// on a world's surface as the game builds it. Written once: the quick tests
// (test/surface.test.ts W7, W8) and the deep sweep (npm run surfacecheck)
// both ask this.
//   W7  a land tile keeps its safe zone dry: no sea, lake or river water
//       nearer its center than SAFE_RHO of the way to the edge (wetland
//       pools excepted: cities drain them);
//   W8  a water tile beside land is open water out to HARBOR_RHO.
// Distances are the hex norm (0 at the center, 1 on the edges), sampled on
// a fine grid over each tile's fans. Sea ice keeps its own ragged border:
// nothing is built beside it, so it and water tiles beside it are left out.

import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import type { MapSizeKey } from './rules.ts';
import { generateWorld } from './world.ts';
import { buildPaintData, warpAt, softAt, fanCoords, fanFrames, FAN_COORDS, type PaintData } from './paint.ts';
import { buildRelief } from './relief.ts';
import { tileLook, type TileLook } from './look.ts';
import { buildTerrainMesh, type TerrainMesh } from './terrainMesh.ts';
import { buildSurface, meshLevels, type Surface } from './surface.ts';
import { SAFE_RHO, HARBOR_RHO } from './town/geometry.ts';

export interface WaterWorld {
  globe: Globe;
  map: MapData;
  looks: TileLook[];
  paint: PaintData;
  mesh: TerrainMesh;
  surface: Surface;
}

// A world's surface, built as render.ts builds it (without the GPU parts).
export function waterWorld(size: MapSizeKey, seed: number): WaterWorld {
  const { globe, map } = generateWorld(size, seed);
  const looks = globe.tiles.map((t) => tileLook(map, t.id));
  const paint = buildPaintData(globe, map, seed);
  const relief = buildRelief(globe, map, looks, seed, paint.params.r0);
  const levels = meshLevels(globe, map, looks);
  let surface: Surface | null = null;
  const mesh = buildTerrainMesh(globe, {
    level: (t) => levels[t] as 1 | 2 | 4,
    surface: (topo) => (surface = buildSurface(globe, map, looks, paint, relief, seed, topo)).fields,
    warp: (dir, out) => { warpAt(paint.params, dir.x, dir.y, dir.z, out); },
    fanAttributes: [],
  }, 4);
  return { globe, map, looks, paint, mesh, surface: surface! };
}

export interface WaterProblem { id: 'W7' | 'W8'; tile: number; message: string }
export interface WaterReport {
  problems: WaterProblem[];
  checked: { land: number; water: number };
  // The nearest any water came to a land tile's center, and dry ground to a water tile's.
  worst: { land: number; water: number };
}

const GRID = 24;

export function waterProblems(w: Pick<WaterWorld, 'globe' | 'map' | 'looks' | 'paint' | 'mesh'>): WaterReport {
  const { globe, map, looks, paint, mesh } = w;
  const frames = fanFrames(globe), co = new Float32Array(FAN_COORDS);
  // Whether the water at a point is a wetland pool (as the painting has it).
  const isPool = (t: number, i: number, wa: number, wb: number): boolean => {
    const tl = globe.tiles[t], k = tl.corners.length;
    const A = globe.triCenters[tl.corners[i]], B = globe.triCenters[tl.corners[(i + 1) % k]];
    const d = tl.center.clone().multiplyScalar(1 - wa - wb).addScaledVector(A, wa).addScaledVector(B, wb).normalize();
    const fid = paint.fanStart[t] + i, fan = paint.fans[fid];
    fanCoords(frames[fid], fan, warpAt(paint.params, d.x, d.y, d.z), d.x, d.y, d.z, co);
    const sw = softAt(paint, fid, co);
    let open = 0, pool = 0;
    for (let c = 0; c < 4; c++) { const l = looks[fan.ids[c]]; if (l.water) open += sw[c]; else if (l.pool) pool += sw[c]; }
    return open < 0.5 && pool >= 0.05;
  };
  const grid = (t: number, f: (i: number, wa: number, wb: number) => void) => {
    for (let i = 0; i < globe.tiles[t].corners.length; i++) for (let a = 0; a <= GRID; a++) for (let b = 0; a + b <= GRID; b++) f(i, a / GRID, b / GRID);
  };
  const report: WaterReport = { problems: [], checked: { land: 0, water: 0 }, worst: { land: Infinity, water: Infinity } };
  for (const tile of globe.tiles) {
    const t = tile.id;
    if (map.biome[t] === 'seaIce') continue;
    if (!looks[t].water) {
      if (!tile.neighbors.some((n) => looks[n].water) && !map.riverTile[t]) continue;
      report.checked.land++;
      let nearest = Infinity;
      grid(t, (i, wa, wb) => {
        if (wa + wb >= nearest) return;
        const s = mesh.at(t, i, wa, wb);
        if (s.water > s.ground && !isPool(t, i, wa, wb)) nearest = wa + wb;
      });
      report.worst.land = Math.min(report.worst.land, nearest);
      if (nearest < SAFE_RHO) report.problems.push({ id: 'W7', tile: t, message: `land tile ${t}: water at ${nearest.toFixed(2)} of the way to its edge (safe zone ${SAFE_RHO})` });
    } else {
      if (!tile.neighbors.some((n) => !looks[n].water) || tile.neighbors.some((n) => map.biome[n] === 'seaIce')) continue;
      report.checked.water++;
      let nearest = Infinity;
      grid(t, (i, wa, wb) => {
        if (wa + wb >= nearest) return;
        const s = mesh.at(t, i, wa, wb);
        if (s.water <= s.ground) nearest = wa + wb;
      });
      report.worst.water = Math.min(report.worst.water, nearest);
      if (nearest < HARBOR_RHO) report.problems.push({ id: 'W8', tile: t, message: `water tile ${t}: dry at ${nearest.toFixed(2)} of the way to its edge (open water to ${HARBOR_RHO})` });
    }
  }
  return report;
}
