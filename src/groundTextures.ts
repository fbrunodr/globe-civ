import * as THREE from 'three';
import { mulberry32 } from './rng.ts';

// Ground materials: small tileable close-up textures of what the ground is
// made of (grass, dry grass, soil, sand, litter, moss, rock, snow). The
// terrain shader (terrainMaterial.ts) lays them over the painting, so the
// ground has the same fine detail as the props on it, and catches the same sun.
//
// All but snow are scans (public/ground, CC0, see CREDITS.md), loaded after
// start; snow is drawn here. One layer per material in a texture array; each
// texel holds
//   r  brightness / 2   (1 = the material's own color; mean 1 over the layer)
//   g  height           (0..1: blends one material into the next)
//   b, a  normal x, y   (0.5 = flat)
// Brightness only: the colors come from the tile (look.ts GroundLook), so
// the same grass is green on a prairie and khaki on a steppe.

export const GROUND_LAYERS = ['grass', 'dry', 'soil', 'sand', 'litter', 'moss', 'rock', 'snow'] as const;
export type GroundLayer = typeof GROUND_LAYERS[number];
export const GROUND_LAYER = Object.fromEntries(GROUND_LAYERS.map((k, i) => [k, i])) as Record<GroundLayer, number>;

export const GROUND_TEX = 512;
const N = GROUND_TEX;

// The scanned layers (public/ground/<layer>.webp and <layer>_normal.webp).
type ScannedLayer = Exclude<GroundLayer, 'snow'>;
const SCANNED: readonly ScannedLayer[] = ['grass', 'dry', 'soil', 'sand', 'litter', 'moss', 'rock'];

const wrap = (i: number) => ((i % N) + N) % N;

// Periodic value noise, `cells` lattice cells across the layer, smooth steps.
function noiseField(rand: () => number, cells: number): (x: number, y: number) => number {
  const v = new Float32Array(cells * cells);
  for (let i = 0; i < v.length; i++) v[i] = rand();
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / N) * cells, fy = (y / N) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = s(fx - x0), ty = s(fy - y0);
    const a = (i: number, j: number) => v[((j % cells) + cells) % cells * cells + ((i % cells) + cells) % cells]!;
    const top = a(x0, y0) + (a(x0 + 1, y0) - a(x0, y0)) * tx;
    const bot = a(x0, y0 + 1) + (a(x0 + 1, y0 + 1) - a(x0, y0 + 1)) * tx;
    return top + (bot - top) * ty;
  };
}
// Fractal sum of noise fields from `cells` across, normalized to 0..1.
function fbmField(rand: () => number, cells: number, octaves: number): (x: number, y: number) => number {
  const fields = Array.from({ length: octaves }, (_, i) => noiseField(rand, cells << i));
  return (x, y) => {
    let s = 0, a = 1, total = 0;
    for (const f of fields) { s += a * f(x, y); total += a; a *= 0.5; }
    return s / total;
  };
}

// A box blur R texels about, wrapping.
function boxBlur(src: ArrayLike<number>, R: number): Float32Array {
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) { let s = 0; for (let i = -R; i <= R; i++) s += src[y * N + wrap(i)]!; for (let x = 0; x < N; x++) { tmp[y * N + x] = s / (2 * R + 1); s += src[y * N + wrap(x + R + 1)]! - src[y * N + wrap(x - R)]!; } }
  for (let x = 0; x < N; x++) { let s = 0; for (let i = -R; i <= R; i++) s += tmp[wrap(i) * N + x]!; for (let y = 0; y < N; y++) { out[y * N + x] = s / (2 * R + 1); s += tmp[wrap(y + R + 1) * N + x]! - tmp[wrap(y - R) * N + x]!; } }
  return out;
}
// Even out a layer's brightness at large scale (keeping the detail): what
// the eye picks out as a texture repeats from afar is its big light and
// dark areas. (Two passes: near enough a gaussian.)
function flatten(lum: Float32Array, R = 40): Float32Array {
  const low = boxBlur(boxBlur(lum, R), R), out = new Float32Array(N * N);
  let mean = 0;
  for (let i = 0; i < N * N; i++) mean += lum[i]!;
  mean /= N * N;
  for (let i = 0; i < N * N; i++) out[i] = lum[i]! * mean / Math.max(1e-3, low[i]!);
  return out;
}

// Snow: soft drifts, drawn (no scan needed).
function drawSnow(data: Uint8Array, o0: number): void {
  const f = fbmField(mulberry32(0x6e0d + 977 * GROUND_LAYER.snow), 6, 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = o0 + (y * N + x) * 4, v = f(x, y);
    const dx = f(x + 1, y) - f(x - 1, y), dy = f(x, y + 1) - f(x, y - 1);
    data[o] = Math.round(127.5 * (0.97 + 0.06 * v));
    data[o + 1] = Math.round(255 * v);
    data[o + 2] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - 0.4 * dx)));
    data[o + 3] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - 0.4 * dy)));
  }
}

// A scan's pixels, RGBA at N x N.
async function pixels(url: string): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, N, N);
  return ctx.getImageData(0, 0, N, N).data;
}
// Fill a layer from its scan: brightness (evened out at large scale) and
// height from the colour's luminance, the normal from the normal map (GL
// convention; the image's rows run down, the layer's up the v axis).
async function loadScan(data: Uint8Array, layer: ScannedLayer): Promise<void> {
  const base = `${import.meta.env.BASE_URL}ground/${layer}`;
  const [col, nor] = await Promise.all([pixels(`${base}.webp`), pixels(`${base}_normal.webp`)]);
  const raw = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) raw[i] = col[i * 4]! * 0.3 + col[i * 4 + 1]! * 0.55 + col[i * 4 + 2]! * 0.15;
  const lum = flatten(raw);
  let mean = 0;
  for (let i = 0; i < N * N; i++) mean += lum[i]!;
  mean /= N * N;
  const o0 = GROUND_LAYER[layer] * N * N * 4;
  for (let i = 0; i < N * N; i++) {
    const o = o0 + i * 4;
    data[o] = Math.min(255, Math.round(127.5 * lum[i]! / mean));
    data[o + 1] = Math.min(255, Math.round(lum[i]!));
    data[o + 2] = nor[i * 4]!;
    data[o + 3] = 255 - nor[i * 4 + 1]!;
  }
}

let groundTex: THREE.DataArrayTexture | null = null;
// The ground texture array. The scanned layers start flat (each material's
// plain color) and fill in once their images have loaded (not at all where
// there is no DOM to decode them: tests).
export function groundTextures(): THREE.DataArrayTexture {
  if (groundTex) return groundTex;
  const L = GROUND_LAYERS.length, data = new Uint8Array(N * N * 4 * L).fill(128);
  drawSnow(data, GROUND_LAYER.snow * N * N * 4);
  const tex = new THREE.DataArrayTexture(data, N, N, L);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  groundTex = tex;
  if (typeof document !== 'undefined') {
    void Promise.all(SCANNED.map((k) => loadScan(data, k)))
      .then(() => { tex.needsUpdate = true; })
      .catch((e: unknown) => console.error('ground textures failed to load', e));
  }
  return tex;
}
