// Builds the surface texture array (public/surfaces/surfaces.png) from the
// scans in assets/surfaces (CC0, see CREDITS.md) and the layers painted
// here: npm run surfaces.
//
// The layers (src/surfaceLayers.ts) are stacked top to bottom in one PNG,
// SURFACE_TEX wide; each texel's brightness, halved (a layer's mean 1 reads
// 127.5), in all three channels. A scan's brightness is its colour's
// luminance (ambient occlusion already in), lit a little from the upper
// left through its normal map, evened out at large scale (a repeat must not
// show as a blotch), and scaled to the layer's contrast.
//
// Needs dwebp (libwebp) on the PATH.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { SURFACE_LAYERS, SURFACE_TEX as N, type SurfaceLayer } from '../src/surfaceLayers.ts';
import { mulberry32 } from '../src/rng.ts';

const SRC = 'assets/surfaces', OUT = 'public/surfaces/surfaces.png', SCAN = 256;

const wrap = (i: number, n: number) => ((i % n) + n) % n;

// A scan's pixels (RGB) at SCAN x SCAN, through dwebp's PPM output.
function decode(file: string, tmp: string): Uint8Array {
  const ppm = join(tmp, 'scan.ppm');
  execFileSync('dwebp', [file, '-ppm', '-o', ppm], { stdio: 'ignore' });
  const buf = readFileSync(ppm);
  let pos = 0;
  const field = () => {
    while (/\s/.test(String.fromCharCode(buf[pos]!))) pos++;
    const start = pos;
    while (!/\s/.test(String.fromCharCode(buf[pos]!))) pos++;
    return buf.subarray(start, pos).toString();
  };
  const magic = field(), w = Number(field()), h = Number(field()), max = Number(field());
  pos++;
  if (magic !== 'P6' || w !== SCAN || h !== SCAN || max !== 255) throw new Error(`${file}: expected a ${SCAN}x${SCAN} 8-bit image, got ${magic} ${w}x${h} max ${max}`);
  return buf.subarray(pos, pos + SCAN * SCAN * 3);
}

// A box blur R texels about, wrapping (n x n).
function boxBlur(src: ArrayLike<number>, n: number, R: number): Float32Array {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) { let s = 0; for (let i = -R; i <= R; i++) s += src[y * n + wrap(i, n)]!; for (let x = 0; x < n; x++) { tmp[y * n + x] = s / (2 * R + 1); s += src[y * n + wrap(x + R + 1, n)]! - src[y * n + wrap(x - R, n)]!; } }
  for (let x = 0; x < n; x++) { let s = 0; for (let i = -R; i <= R; i++) s += tmp[wrap(i, n) * n + x]!; for (let y = 0; y < n; y++) { out[y * n + x] = s / (2 * R + 1); s += tmp[wrap(y + R + 1, n) * n + x]! - tmp[wrap(y - R, n) * n + x]!; } }
  return out;
}

// A layer from its brightness (n x n, any scale): its mean brought to 1,
// its pattern to `contrast`, packed.
function pack(v: Float32Array, contrast: number): Uint8Array {
  let mean = 0;
  for (const x of v) mean += x;
  mean /= v.length;
  const out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const b = Math.max(0, 1 + contrast * (v[i]! / mean - 1));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = Math.min(255, Math.round(127.5 * b));
    out[i * 4 + 3] = 255;
  }
  return out;
}

// A scanned layer.
function scanned(l: SurfaceLayer, tmp: string): Uint8Array {
  const col = decode(join(SRC, `${l.key}.webp`), tmp), nor = decode(join(SRC, `${l.key}_normal.webp`), tmp);
  const S = SCAN, lum = new Float32Array(S * S);
  // (The light from the upper left and in front; the image's rows run down, its normals' green up.)
  const L = [-0.45, 0.55, 0.7], ll = Math.hypot(...L);
  for (let i = 0; i < S * S; i++) {
    const nx = nor[i * 3]! / 127.5 - 1, ny = nor[i * 3 + 1]! / 127.5 - 1, nz = nor[i * 3 + 2]! / 127.5 - 1;
    const lit = (nx * L[0]! + ny * L[1]! + nz * L[2]!) / (ll * Math.max(1e-3, Math.hypot(nx, ny, nz))) - L[2]! / ll;
    lum[i] = (col[i * 3]! * 0.3 + col[i * 3 + 1]! * 0.55 + col[i * 3 + 2]! * 0.15 + 1) * Math.max(0.2, 1 + 2 * l.relief * lit);
  }
  // (Even out the large scale, keeping the detail.)
  const low = boxBlur(boxBlur(lum, S, 24), S, 24);
  let mean = 0;
  for (const x of lum) mean += x;
  mean /= S * S;
  for (let i = 0; i < S * S; i++) lum[i] = lum[i]! * mean / Math.max(1e-3, low[i]!);
  // (Down to N, each texel the mean of its block; the image's rows down, the layer's v up.)
  const k = S / N, v = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += lum[(y * k + j) * S + x * k + i]!;
    v[(N - 1 - y) * N + x] = s / (k * k);
  }
  return pack(v, l.contrast);
}

// Periodic value noise over the layer, `cx` x `cy` lattice cells, smooth steps.
function noiseField(rand: () => number, cx: number, cy = cx): (x: number, y: number) => number {
  const v = new Float32Array(cx * cy);
  for (let i = 0; i < v.length; i++) v[i] = rand();
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / N) * cx, fy = (y / N) * cy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = s(fx - x0), ty = s(fy - y0);
    const a = (i: number, j: number) => v[wrap(j, cy) * cx + wrap(i, cx)]!;
    const top = a(x0, y0) + (a(x0 + 1, y0) - a(x0, y0)) * tx;
    const bot = a(x0, y0 + 1) + (a(x0 + 1, y0 + 1) - a(x0, y0 + 1)) * tx;
    return top + (bot - top) * ty;
  };
}
const field = (f: (x: number, y: number) => number) => {
  const v = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) v[y * N + x] = f(x, y);
  return v;
};

// Hair (and a horse's coat): strands down the layer (v), each its own
// shade, waving a little, darker in the partings.
function hair(): Uint8Array {
  const rand = mulberry32(0x4a1e), strands = noiseField(rand, 48, 3), wave = noiseField(rand, 4, 6), fine = noiseField(rand, 96, 12);
  return pack(field((x, y) => {
    const sx = x + 6 * (wave(x, y) - 0.5);
    return 0.55 + 0.6 * strands(sx, y) + 0.25 * fine(sx, y);
  }), 1.1);
}

// Skin: barely mottled.
function skin(): Uint8Array {
  const rand = mulberry32(0x5c1a), a = noiseField(rand, 16), b = noiseField(rand, 48);
  return pack(field((x, y) => 1 + 0.5 * a(x, y) + 0.5 * b(x, y)), 0.08);
}

// The face (surfaceLayers.ts FACE_BOX: u across the head, v up it): the
// features a PS1 figure had drawn on: brows, eyes (white, a dark iris),
// the shadow under the nose and the brow, the lips, a little shade under
// the cheekbones. Neutral (1) elsewhere: the skin tone shows through.
function face(): Uint8Array {
  const v = new Float32Array(N * N).fill(1);
  // (Blend a value into an ellipse about (u, v), `ru` x `rv` wide (layer
  // fractions), soft over its last `soft` of radius.)
  const blob = (u: number, w: number, ru: number, rv: number, val: number, soft = 0.35, tilt = 0) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const du = (x + 0.5) / N - u, dv = (y + 0.5) / N - w + tilt * du;
      const r = Math.hypot(du / ru, dv / rv);
      if (r >= 1) continue;
      const a = r < 1 - soft ? 1 : (1 - r) / soft;
      v[y * N + x] = v[y * N + x]! * (1 - a) + val * a;
    }
  };
  const mul = (u: number, w: number, ru: number, rv: number, k: number) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(((x + 0.5) / N - u) / ru, ((y + 0.5) / N - w) / rv);
      if (r < 1) v[y * N + x]! *= 1 + (k - 1) * (1 - r * r);
    }
  };
  for (const s of [-1, 1]) {
    const eu = 0.5 + s * 0.17;
    mul(eu, 0.5, 0.15, 0.09, 0.82);                 // the socket's shade
    blob(eu, 0.585, 0.12, 0.026, 0.45, 0.3, -s * 0.18); // the brow, rising outward a little
    blob(eu, 0.478, 0.085, 0.04, 1.45, 0.25);       // the white of the eye
    blob(eu + s * 0.012, 0.476, 0.042, 0.042, 0.18, 0.2); // the iris
    mul(0.5 + s * 0.22, 0.31, 0.1, 0.07, 0.95);     // under the cheekbone
  }
  mul(0.5, 0.35, 0.07, 0.035, 0.7);                 // under the nose
  blob(0.5, 0.215, 0.11, 0.024, 0.55, 0.45);        // the lips
  mul(0.5, 0.17, 0.08, 0.03, 0.85);                 // under the lower lip
  return pack(v, 1);
}

// An RGBA PNG (8 bits a channel, no filtering), w x h.
function png(rgba: Uint8Array, w: number, h: number): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(rows, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const PAINTED: Record<string, () => Uint8Array> = { none: () => pack(new Float32Array(N * N).fill(1), 0), hair, skin, face };

const tmp = mkdtempSync(join(tmpdir(), 'surfaces-'));
try {
  // (Each layer's rows: the PNG's rows run down, a layer's v up; stacked in order.)
  const all = new Uint8Array(N * N * 4 * SURFACE_LAYERS.length);
  SURFACE_LAYERS.forEach((l, i) => {
    const layer = l.scan ? scanned(l, tmp) : PAINTED[l.key]!();
    for (let y = 0; y < N; y++) all.set(layer.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), (i * N + y) * N * 4);
  });
  mkdirSync('public/surfaces', { recursive: true });
  writeFileSync(OUT, png(all, N, N * SURFACE_LAYERS.length));
  console.log(`wrote ${OUT} (${SURFACE_LAYERS.length} layers)`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
