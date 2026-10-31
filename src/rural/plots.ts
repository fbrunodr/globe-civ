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
// owner's farming techs, techs.ts improvementStage): a first farm's small
// patches, the plough's long strips, enclosed fields, larger fields, the
// machine age's great ones.
export const PLOT_SIZES = [[0.075, 0.11], [0.055, 0.3], [0.11, 0.24], [0.15, 0.3], [0.22, 0.42]] as const;
export const MAX_STAGE = PLOT_SIZES.length - 1;
// A plantation's rows across a plot, this far apart (tile steps; its plants on every other).
export const PLANT_ROW_W = 0.016;
// A first farm's plots wander (no surveyor yet): the frame bent by this much.
export const PLOT_WARP = 0.02;

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

// The plot at uv (tile steps, in the farm's turned frame) of tile `salt`, at `stage`.
export function plotAt(u0: number, v0: number, salt: number, stage = 2): Plot {
  const st = Math.max(0, Math.min(MAX_STAGE, stage));
  let [sx, sy]: [number, number] = [PLOT_SIZES[st]![0], PLOT_SIZES[st]![1]];
  const w = st === 0 ? PLOT_WARP : 0;
  const u = u0 + w * Math.sin(v0 * 31 + salt * 0.37), v = v0 + w * Math.sin(u0 * 27 + salt * 0.53);
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
float plotAt(vec2 uv0, int salt, int stage, out vec2 f, out float edge) {
  vec2 sz = PLOT_SIZES[clamp(stage, 0, ${MAX_STAGE})];
  float w = stage == 0 ? ${PLOT_WARP} : 0.0;
  vec2 uv = uv0 + w * vec2(sin(uv0.y * 31.0 + float(salt) * 0.37), sin(uv0.x * 27.0 + float(salt) * 0.53));
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
// land fallow: grass and bare earth.)
export type CropIndex = 0 | 1 | 2 | 3 | 4;
export const cropIndex = (h: number, stage = 2): CropIndex => stage === 0
  ? (h < 0.28 ? 0 : h < 0.42 ? 1 : h < 0.74 ? 2 : h < 0.86 ? 3 : 4)
  : (h < 0.3 ? 0 : h < 0.55 ? 1 : h < 0.72 ? 2 : h < 0.86 ? 3 : 4);
export const CROP_INDEX_GLSL = `int cropIndex(float h, int stage) { return stage == 0
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
