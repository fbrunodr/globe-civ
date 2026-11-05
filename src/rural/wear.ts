// Worn ground: a camp's trodden earth and a mine's spoil, in patches over
// its painted land (fading out toward its border; a neighbouring farm's
// fields win where they reach), thicker toward its middle.
// A mine's spoil has a halo of dust round it, and nothing grows on either
// (render.ts and the gallery keep the flora off it). Read in the tile's own
// frame (tile steps), so the shader, the flora and the gallery all see the
// same patches; `salt` tells tiles apart.

import { tFbm } from '../fineNoise.ts';

export type WearKind = 'camp' | 'mine';
// How it wears (`size`: its patches', tile steps; `bias`: how much thicker
// at the middle; `lo`: where its patches begin, the noise and bias summed;
// `halo`: how far below that its dust reaches).
const WEAR: Record<WearKind, { size: number; bias: number; lo: number; halo: number }> = {
  camp: { size: 0.1, bias: 0.18, lo: 0.62, halo: 0 },     // (about 45% worn at its middle, 30% halfway out, 15% at its edge)
  mine: { size: 0.13, bias: 0.3, lo: 0.62, halo: 0.05 },   // (80%, 50%, 20%)
};
const EDGE = 0.04;
export const WEAR_CODE: Record<WearKind, number> = { mine: 2, camp: 3 };
export const wearSalt = (t: number): number => (t * 7.31) % 64;

const smooth = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
// [its worn ground, its dust] (0..1) at (x, y).
export function wearAt(kind: WearKind, x: number, y: number, salt: number): [number, number] {
  const w = WEAR[kind], r = Math.hypot(x, y) / 0.5;
  const v = tFbm(x / w.size + 0.5, y / w.size + 0.5, salt, 3) + w.bias * (1 - r);
  return [smooth(w.lo, w.lo + EDGE, v), w.halo > 0 ? smooth(w.lo - w.halo, w.lo, v) : 0];
}

// The same in GLSL (tFbm: NOISE_GLSL); `code` an IMPROVEMENT_CODE.
const glslOf = (k: WearKind) => { const w = WEAR[k]; return `vec4(${w.size}, ${w.bias.toFixed(3)}, ${w.lo.toFixed(3)}, ${w.halo.toFixed(3)})`; };
export const WEAR_GLSL = /* glsl */ `
vec2 wearAt(int code, vec2 lp, float salt) {
  vec4 w = code == ${WEAR_CODE.mine} ? ${glslOf('mine')} : ${glslOf('camp')};
  float v = tFbm(vec3(lp / w.x + 0.5, salt), 3) + w.y * (1.0 - length(lp) / 0.5);
  return vec2(smoothstep(w.z, w.z + ${EDGE}, v), w.w > 0.0 ? smoothstep(w.z - w.w, w.z, v) : 0.0);
}
`;

// How far round a tree its crown reaches (tile steps): kept that far off
// worn ground and its dust.
const REACH = 0.03;
export const wornNear = (kind: WearKind, x: number, y: number, salt: number, inside: (x: number, y: number) => boolean = () => true): boolean =>
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => {
    const px = x + a! * REACH, py = y + b! * REACH;
    if (!inside(px, py)) return false;
    const [worn, dust] = wearAt(kind, px, py, salt);
    return Math.max(worn, dust) > 0.02;
  });
