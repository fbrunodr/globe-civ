// Builds the ground texture array (public/ground/ground.ktx2) from the scans
// in assets/ground (CC0, see CREDITS.md): npm run textures.
//
// Each layer is packed as the terrain shader reads it (groundTextures.ts):
//   r  brightness / 2 (mean 1 over the layer), evened out at large scale
//   g  height (the luminance)
//   b, a  normal x, y (0.5 = flat)
// snow is drawn here; then basisu compresses all the layers, with their
// mipmaps, into one UASTC KTX2 array (about a quarter of the GPU memory of
// plain RGBA).
//
// Needs dwebp (libwebp) and basisu (basis_universal) on the PATH.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { GROUND_LAYERS, GROUND_TEX as N, type GroundLayer } from '../src/groundTextures.ts';
import { mulberry32 } from '../src/rng.ts';

const SRC = 'assets/ground', OUT = 'public/ground/ground.ktx2';

const wrap = (i: number) => ((i % N) + N) % N;

// A scan's pixels (RGB) at N x N, through dwebp's PPM output.
function decode(file: string, tmp: string): Uint8Array {
  const ppm = join(tmp, 'scan.ppm');
  execFileSync('dwebp', [file, '-ppm', '-o', ppm], { stdio: 'ignore' });
  const buf = readFileSync(ppm);
  // (Header: P6, width, height, max value, each followed by whitespace.)
  let pos = 0;
  const field = () => {
    while (/\s/.test(String.fromCharCode(buf[pos]!))) pos++;
    const start = pos;
    while (!/\s/.test(String.fromCharCode(buf[pos]!))) pos++;
    return buf.subarray(start, pos).toString();
  };
  const magic = field(), w = Number(field()), h = Number(field()), max = Number(field());
  pos++;
  if (magic !== 'P6' || w !== N || h !== N || max !== 255) throw new Error(`${file}: expected a ${N}x${N} 8-bit image, got ${magic} ${w}x${h} max ${max}`);
  return buf.subarray(pos, pos + N * N * 3);
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

// A scanned layer, packed: brightness and height from the colour's
// luminance, the normal from the normal map (GL convention; the image's rows
// run down, the layer's up the v axis).
function scanned(layer: GroundLayer, tmp: string): Uint8Array {
  const col = decode(join(SRC, `${layer}.webp`), tmp);
  const nor = decode(join(SRC, `${layer}_normal.webp`), tmp).slice();
  const raw = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) raw[i] = col[i * 3]! * 0.3 + col[i * 3 + 1]! * 0.55 + col[i * 3 + 2]! * 0.15;
  const lum = flatten(raw);
  let mean = 0;
  for (let i = 0; i < N * N; i++) mean += lum[i]!;
  mean /= N * N;
  const out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    out[i * 4] = Math.min(255, Math.round(127.5 * lum[i]! / mean));
    out[i * 4 + 1] = Math.min(255, Math.round(lum[i]!));
    out[i * 4 + 2] = nor[i * 3]!;
    out[i * 4 + 3] = 255 - nor[i * 3 + 1]!;
  }
  return out;
}

// Periodic value noise, `cells` lattice cells across, smooth steps.
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
// Snow: soft drifts (fractal noise), drawn.
function snow(): Uint8Array {
  const rand = mulberry32(0x6e0d + 977 * GROUND_LAYERS.indexOf('snow'));
  const fields = Array.from({ length: 4 }, (_, i) => noiseField(rand, 6 << i));
  const f = (x: number, y: number) => {
    let s = 0, a = 1, total = 0;
    for (const fl of fields) { s += a * fl(x, y); total += a; a *= 0.5; }
    return s / total;
  };
  const out = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4, v = f(x, y);
    const dx = f(x + 1, y) - f(x - 1, y), dy = f(x, y + 1) - f(x, y - 1);
    out[o] = Math.round(127.5 * (0.97 + 0.06 * v));
    out[o + 1] = Math.round(255 * v);
    out[o + 2] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - 0.4 * dx)));
    out[o + 3] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - 0.4 * dy)));
  }
  return out;
}

// An RGBA PNG (8 bits a channel, no filtering).
function png(rgba: Uint8Array): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(N * (N * 4 + 1));
  for (let y = 0; y < N; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * N * 4, N * 4).copy(rows, y * (N * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const tmp = mkdtempSync(join(tmpdir(), 'ground-'));
try {
  const files = GROUND_LAYERS.map((layer) => {
    const file = join(tmp, `${layer}.png`);
    writeFileSync(file, png(layer === 'snow' ? snow() : scanned(layer, tmp)));
    return file;
  });
  // (Linear data, not colours: no sRGB anywhere; mipmaps wrap like the texture.)
  execFileSync('basisu', ['-ktx2', '-uastc', '-uastc_level', '2', '-linear', '-mipmap', '-tex_type', '2darray',
    ...files.flatMap((f) => ['-file', f]), '-output_file', OUT], { stdio: 'inherit' });
  console.log(`wrote ${OUT}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
