// A farm's plots: the layout the terrain shader paints on a farm tile
// (terrainMaterial.ts) and the crops standing on them (cityProps.ts) share,
// in TypeScript and in GLSL, kept side by side so they never drift apart.
// Plots are laid in the tile's own frame (cityProps.onTile: tile steps),
// turned to the farm's axis (farmPainter.farmAxis): strips in columns,
// staggered, some split across. Hashes are on integers, so the GPU and the
// CPU agree on every plot.
//
// A farm keeps to its tile's safe zone (town/geometry.ts SAFE_RHO), so the
// farms of a crowded countryside never run into one another.

import type { CropRegion } from './look.ts';

// A plot's size (tile steps: across, along), by the farm's stage (its
// owner's techs that improve it, techs.ts improvementStage): a first
// farm's fields of every size (fieldAt: its own layout; these sizes for
// its rows), enclosed fields, larger fields, the machine age's great ones.
// (Stage 0, a farm held by a civ that couldn't have made it, keeps the
// first farm's fields, gone to weed.)
export const PLOT_SIZES = [[0.065, 0.1], [0.065, 0.1], [0.11, 0.24], [0.15, 0.3], [0.22, 0.42]] as const;
export const MAX_STAGE = PLOT_SIZES.length - 1;
// A plantation's rows across a plot, this far apart (tile steps; its plants on every other).
// A farm's lanes of trodden earth between its plots, and its border (half
// one, so two farms side by side meet in one), in tile steps.
export const FARM_LANE = 0.024;
export const PLANT_ROW_W = 0.016;

// The integer hash of a cell and a salt, in [0, 1) (24 bits).
export function plotHash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(salt | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h >>> 8) / 16777216;
}

export interface Plot {
  readonly h: number;    // the plot's hash: what grows there (cropIndex)
  readonly f: readonly [number, number]; // the position in it (0..1)
  readonly edge: number; // the distance to its border (tile steps)
}

// A first farm's fields: rectangles of every size, as the land was taken
// in bit by bit. Squares FIELD and half that across, interlocked (the
// Pythagorean tiling: no line runs past two of them), each cut in two
// (across its longer side, anywhere near its middle) and its halves cut
// again or not, up to three times for a large one.
const FIELD = 0.2, SMALL = FIELD / 2, LATTICE = FIELD * FIELD + SMALL * SMALL;
function fieldAt(u: number, v: number, salt: number): Plot {
  // (The square holding uv: a large one at m (FIELD, SMALL) + n (-SMALL, FIELD), its small one beside it.)
  const m0 = Math.round((u * FIELD + v * SMALL) / LATTICE), n0 = Math.round((-u * SMALL + v * FIELD) / LATTICE);
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0, cell = 0;
  for (let m = m0 - 1; m <= m0 + 1 && !cell; m++) for (let n = n0 - 1; n <= n0 + 1 && !cell; n++) {
    const ox = m * FIELD - n * SMALL, oy = m * SMALL + n * FIELD;
    if (u >= ox && u < ox + FIELD && v >= oy && v < oy + FIELD) { x0 = ox; y0 = oy; x1 = ox + FIELD; y1 = oy + FIELD; cell = (m * 64 + n) * 2 + 1; }
    else if (u >= ox + FIELD && u < ox + FIELD + SMALL && v >= oy && v < oy + SMALL) { x0 = ox + FIELD; y0 = oy; x1 = x0 + SMALL; y1 = oy + SMALL; cell = (m * 64 + n) * 2 + 2; }
  }
  let id = 1;
  for (let d = 0; d < 3; d++) {
    const r = (k: number) => plotHash(cell, id * 4 + k, salt * 4 + 6);
    if ((d > 0 && r(0) < d * 0.3) || x1 - x0 < 0.06) break;
    const w = x1 - x0, h = y1 - y0, t = 0.3 + 0.4 * r(2);
    if (w > h * 1.3 || (h <= w * 1.3 && r(1) < 0.5)) { const c = x0 + w * t; if (u < c) x1 = c; else x0 = c; id = id * 2 + (u < c ? 0 : 1); }
    else { const c = y0 + h * t; if (v < c) y1 = c; else y0 = c; id = id * 2 + (v < c ? 0 : 1); }
  }
  // (Its furrows run either way, field by field.)
  const f: [number, number] = [(u - x0) / (x1 - x0), (v - y0) / (y1 - y0)];
  return { h: plotHash(cell, id, salt * 4 + 3), f: plotHash(cell, id, salt * 4) < 0.5 ? [f[1], f[0]] : f, edge: Math.min(u - x0, x1 - u, v - y0, y1 - v) };
}

// The plot at uv (tile steps, in the farm's turned frame) of tile `salt`, at `stage`.
export function plotAt(u: number, v: number, salt: number, stage = 2): Plot {
  const st = Math.max(0, Math.min(MAX_STAGE, stage));
  if (st <= 1) return fieldAt(u, v, salt);
  let [sx, sy]: [number, number] = [PLOT_SIZES[st]![0], PLOT_SIZES[st]![1]];
  const cx = u / sx;
  const cy = v / sy + plotHash(Math.floor(cx), 0, salt * 4 + 1) * 3;
  let ix = Math.floor(cx), iy = Math.floor(cy);
  const fx = cx - ix;
  let fy = cy - iy;
  const h0 = plotHash(ix, iy, salt * 4 + 2);
  if (h0 > 0.6) {
    const k = h0 > 0.85 ? 3 : 2;
    ix = ix * 4; iy = iy * 4 + Math.floor(fy * k);
    fy = fy * k - Math.floor(fy * k);
    sy /= k;
  }
  const edge = Math.min(Math.min(fx, 1 - fx) * sx, Math.min(fy, 1 - fy) * sy);
  return { h: plotHash(ix, iy, salt * 4 + 3), f: [fx, fy], edge };
}

export const PLOTS_GLSL = /* glsl */ `
float plotHash(int x, int y, int salt) {
  uint h = (uint(x) * 0x8da6b343u) ^ (uint(y) * 0xd8163841u) ^ (uint(salt) * 0xcb1ab31fu);
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
  h = (h ^ (h >> 12u)) * 0x297a2d39u;
  h = h ^ (h >> 15u);
  return float(h >> 8u) / 16777216.0;
}
const vec2 PLOT_SIZES[${PLOT_SIZES.length}] = vec2[](${PLOT_SIZES.map(([a, b]) => `vec2(${a}, ${b})`).join(', ')});
float fieldAt(vec2 uv, int salt, out vec2 f, out float edge) {
  int m0 = int(floor((uv.x * ${FIELD} + uv.y * ${SMALL}) / ${LATTICE} + 0.5)), n0 = int(floor((-uv.x * ${SMALL} + uv.y * ${FIELD}) / ${LATTICE} + 0.5));
  vec2 a = vec2(0.0), b = vec2(0.0);
  int cell = 0;
  for (int k = 0; k < 9; k++) {
    int m = m0 + k % 3 - 1, n = n0 + k / 3 - 1;
    vec2 o = vec2(float(m) * ${FIELD} - float(n) * ${SMALL}, float(m) * ${SMALL} + float(n) * ${FIELD});
    vec2 q = uv - o;
    if (cell == 0 && q.x >= 0.0 && q.x < ${FIELD} && q.y >= 0.0 && q.y < ${FIELD}) { a = o; b = o + ${FIELD}; cell = (m * 64 + n) * 2 + 1; }
    else if (cell == 0 && q.x >= ${FIELD} && q.x < ${FIELD + SMALL} && q.y >= 0.0 && q.y < ${SMALL}) { a = o + vec2(${FIELD}, 0.0); b = a + ${SMALL}; cell = (m * 64 + n) * 2 + 2; }
  }
  int id = 1;
  for (int d = 0; d < 3; d++) {
    if ((d > 0 && plotHash(cell, id * 4, salt * 4 + 6) < float(d) * 0.3) || b.x - a.x < 0.06) break;
    vec2 s = b - a;
    float t = 0.3 + 0.4 * plotHash(cell, id * 4 + 2, salt * 4 + 6);
    if (s.x > s.y * 1.3 || (s.y <= s.x * 1.3 && plotHash(cell, id * 4 + 1, salt * 4 + 6) < 0.5)) {
      float c = a.x + s.x * t; bool lo = uv.x < c;
      if (lo) b.x = c; else a.x = c;
      id = id * 2 + (lo ? 0 : 1);
    } else {
      float c = a.y + s.y * t; bool lo = uv.y < c;
      if (lo) b.y = c; else a.y = c;
      id = id * 2 + (lo ? 0 : 1);
    }
  }
  f = (uv - a) / (b - a);
  if (plotHash(cell, id, salt * 4) < 0.5) f = f.yx;
  vec2 e = min(uv - a, b - uv);
  edge = min(e.x, e.y);
  return plotHash(cell, id, salt * 4 + 3);
}
float plotAt(vec2 uv, int salt, int stage, out vec2 f, out float edge) {
  if (stage <= 1) return fieldAt(uv, salt, f, edge);
  vec2 sz = PLOT_SIZES[clamp(stage, 0, ${MAX_STAGE})];
  float cx = uv.x / sz.x;
  float cy = uv.y / sz.y + plotHash(int(floor(cx)), 0, salt * 4 + 1) * 3.0;
  int ix = int(floor(cx)), iy = int(floor(cy));
  f = vec2(cx - float(ix), cy - float(iy));
  float h0 = plotHash(ix, iy, salt * 4 + 2);
  if (h0 > 0.6) {
    float k = h0 > 0.85 ? 3.0 : 2.0;
    ix = ix * 4; iy = iy * 4 + int(floor(f.y * k));
    f.y = fract(f.y * k);
    sz.y /= k;
  }
  vec2 e = min(f, 1.0 - f) * sz;
  edge = min(e.x, e.y);
  return plotHash(ix, iy, salt * 4 + 3);
}
`;

// What grows on a plot, by its hash: grain, a second crop, pasture,
// ploughed earth (bare), a fourth crop. (A first farm leaves more of its
// land fallow: grass and bare earth; a neglected one, most of it.)
export type CropIndex = 0 | 1 | 2 | 3 | 4;
export const cropIndex = (h: number, stage = 2): CropIndex => stage === 0
  ? (h < 0.14 ? 0 : h < 0.2 ? 1 : h < 0.82 ? 2 : h < 0.9 ? 3 : 4)
  : stage === 1
    ? (h < 0.28 ? 0 : h < 0.42 ? 1 : h < 0.74 ? 2 : h < 0.86 ? 3 : 4)
    : (h < 0.3 ? 0 : h < 0.55 ? 1 : h < 0.72 ? 2 : h < 0.86 ? 3 : 4);
export const CROP_INDEX_GLSL = `int cropIndex(float h, int stage) { return stage == 0
  ? (h < 0.14 ? 0 : h < 0.2 ? 1 : h < 0.82 ? 2 : h < 0.9 ? 3 : 4)
  : stage == 1
    ? (h < 0.28 ? 0 : h < 0.42 ? 1 : h < 0.74 ? 2 : h < 0.86 ? 3 : 4)
    : (h < 0.3 ? 0 : h < 0.55 ? 1 : h < 0.72 ? 2 : h < 0.86 ? 3 : 4); }`;

// How much of their saturation the crops keep (fields read as fields, not a quilt).
export const CROP_SATURATION = 0.5;
// Each region's five colours, by CropIndex.
export const CROP_PALETTE: Record<CropRegion, readonly [number, number, number, number, number]> = {
  temperate:     [0xc9a443, 0x8fa045, 0x5f8a36, 0x6e5233, 0xa9a65a],
  steppe:        [0xd0ad52, 0xbfa35e, 0x8f9a52, 0x7a6040, 0xc7b470],
  mediterranean: [0x8a8f5c, 0x6f7a3a, 0xc4a660, 0x9a6a44, 0x7f8a52],
  savanna:       [0xc2964e, 0xa0522f, 0x9a9a4e, 0x8a5a36, 0xb08446],
  tropical:      [0x86b84a, 0x6fa23a, 0x5f9a5a, 0x5a4a2e, 0x9cc457],
  oasis:         [0x6fa043, 0x8ab04f, 0xd2b066, 0x9a7a4a, 0x5f8f3a],
  cold:          [0xa8954e, 0x4f7034, 0x8a9a6a, 0x5a4632, 0x9aa070],
  // Rice standing in its flooded paddies; peat cut in dark beds.
  paddy:         [0x7fb43f, 0x9cc85a, 0x6aa24a, 0x4f7a6e, 0x8ebe4c],
  peat:          [0x4a3a2c, 0x5a4632, 0x3e3328, 0x2e261e, 0x6a5a3a],
  // A resource's own farm: all wheat, all maize (a little fallow).
  wheat:         [0xd2a73c, 0xc99a34, 0x7a8a40, 0x6e5233, 0xdcb24a],
  maize:         [0x6f9a36, 0x86a840, 0x7a8a40, 0x5e4a30, 0x9aae48],
  // Pasture: meadows of a few greens; a plantation's rows on bare earth.
  pasture:       [0x5f8a36, 0x6e9640, 0x557f30, 0x7a9a48, 0x68903a],
  plantation:    [0x4f7a30, 0x5e8a3a, 0x6a5a3c, 0x5a4a32, 0x46702c],
};

// The crops standing on the plots keep more of theirs (the stalks' shading
// greys them).
export const CROP_STAND_SATURATION = 0.75;

// How tall each crop stands (tile steps; a house's storey is 0.02), and
// none on ploughed earth: slim stalks, a plantation's rows.
export const CROP_HEIGHT: Record<CropIndex, number> = { 0: 0.0288, 1: 0.0234, 2: 0.009, 3: 0, 4: 0.0198 };
