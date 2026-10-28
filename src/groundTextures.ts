import * as THREE from 'three';
import { mulberry32 } from './rng.ts';

// Ground materials: small tileable close-up textures of what the ground is
// made of (grass, dry grass, soil, sand, litter, moss, rock, snow), drawn in
// code at load time like the leaf cards. The terrain shader (terrainMaterial.ts)
// lays them over the painting, so up close the ground has the same fine
// detail as the props on it, and catches the same sun.
//
// One layer per material in a texture array; each texel holds
//   r  brightness / 2   (1 = the material's own color; mean 1 over the layer)
//   g  height           (0..1: blends one material into the next, and the normal)
//   b, a  normal x, y   (from the height, 0.5 = flat)
// Brightness only: the colors come from the tile (look.ts GroundLook), so
// the same grass is green on a prairie and khaki on a steppe.

export const GROUND_LAYERS = ['grass', 'dry', 'soil', 'sand', 'litter', 'moss', 'rock', 'snow'] as const;
export type GroundLayer = typeof GROUND_LAYERS[number];
export const GROUND_LAYER = Object.fromEntries(GROUND_LAYERS.map((k, i) => [k, i])) as Record<GroundLayer, number>;

export const GROUND_TEX = 512;
const N = GROUND_TEX;

// A layer being drawn: brightness and height, both wrapping at the edges.
interface Canvas { lum: Float32Array; hgt: Float32Array; rand: () => number }

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
function fill(c: Canvas, f: (x: number, y: number) => [number, number]): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [l, h] = f(x, y);
    c.lum[y * N + x] = l; c.hgt[y * N + x] = h;
  }
}
// A stroke (a blade of grass, a twig): brightness and height ramp from the
// foot to the tip; drawn only where it stands higher than what is there.
function stroke(c: Canvas, x0: number, y0: number, x1: number, y1: number, w: number,
  lum0: number, lum1: number, h0: number, h1: number): void {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, r = (w / 2) * (1 - 0.6 * t);
    const l = lum0 + (lum1 - lum0) * t, h = h0 + (h1 - h0) * t;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 0.5) continue;
      const o = wrap(y) * N + wrap(x), hh = h * (1 - 0.3 * (d / (r + 0.5)) ** 2);
      if (hh <= c.hgt[o]!) continue;
      c.hgt[o] = hh; c.lum[o] = l;
    }
  }
}
// A blob (a pebble, a leaf, a cushion of moss): an ellipse with a domed top.
function blob(c: Canvas, cx: number, cy: number, rx: number, ry: number, ang: number, lum: number, h: number, dome = 0.5): void {
  const R = Math.max(rx, ry), ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
    const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry, q = u * u + v * v;
    if (q > 1) continue;
    const o = wrap(y) * N + wrap(x), hh = h * (1 - dome + dome * Math.sqrt(1 - q));
    if (hh <= c.hgt[o]!) continue;
    c.hgt[o] = hh; c.lum[o] = lum * (1 - 0.15 * q);
  }
}

type Drawer = (c: Canvas) => void;

// Tufts of short blades over dark ground between them.
const grass: Drawer = (c) => {
  const { rand } = c, f = fbmField(rand, 8, 3), dense = fbmField(rand, 4, 2);
  fill(c, (x, y) => [0.55 + 0.2 * f(x, y), 0.15 * f(x, y)]);
  for (let k = 0; k < 900; k++) {
    const x = rand() * N, y = rand() * N;
    if (dense(x, y) < 0.3 + 0.25 * rand()) continue;
    const blades = 6 + Math.floor(rand() * 8), tone = 0.85 + 0.25 * rand();
    for (let b = 0; b < blades; b++) {
      const a = rand() * Math.PI * 2, len = 5 + 8 * rand(), sx = x + (rand() - 0.5) * 4, sy = y + (rand() - 0.5) * 4;
      stroke(c, sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len, 2 + rand(), 0.7 * tone, 1.35 * tone, 0.35, 0.65 + 0.35 * rand());
    }
  }
};
// Sparse, long, pale straw lying in tussocks, soil showing between.
const dry: Drawer = (c) => {
  const { rand } = c, f = fbmField(rand, 8, 3);
  fill(c, (x, y) => [0.75 + 0.2 * f(x, y), 0.1 * f(x, y)]);
  for (let k = 0; k < 420; k++) {
    const x = rand() * N, y = rand() * N, blades = 8 + Math.floor(rand() * 10), lean = rand() * Math.PI * 2;
    for (let b = 0; b < blades; b++) {
      const a = lean + (rand() - 0.5) * 2.2, len = 9 + 13 * rand();
      stroke(c, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 1.4 + 0.8 * rand(), 0.85, 1.1 + 0.1 * rand(), 0.4, 0.7 + 0.3 * rand());
    }
  }
};
// Earth: lumpy, with pebbles and fine cracks.
const soil: Drawer = (c) => {
  const { rand } = c, f = fbmField(rand, 16, 4), cr = fbmField(rand, 12, 3);
  fill(c, (x, y) => {
    const crack = Math.abs(cr(x, y) - 0.5) < 0.012 ? 0.6 : 1;
    return [(0.8 + 0.35 * f(x, y)) * crack, 0.3 * f(x, y) * crack];
  });
  for (let k = 0; k < 700; k++) {
    const r = 1.2 + 3 * rand() ** 2;
    blob(c, rand() * N, rand() * N, r * (0.8 + 0.4 * rand()), r, rand() * 3, 0.95 + 0.5 * rand(), 0.4 + 0.5 * rand());
  }
};
// Sand: fine grain and wind ripples.
const sand: Drawer = (c) => {
  const { rand } = c, f = fbmField(rand, 6, 2), g = noiseField(rand, 256);
  fill(c, (x, y) => {
    const w = Math.sin(((x + 40 * f(x, y) + y * 0.35) / N) * Math.PI * 2 * 22);
    return [0.95 + 0.06 * w + 0.12 * (g(x, y) - 0.5), 0.5 + 0.35 * w + 0.1 * g(x, y)];
  });
};
// Forest floor: fallen leaves of many tones, twigs, dark earth between.
const litter: Drawer = (c) => {
  const { rand } = c, f = fbmField(rand, 12, 3);
  fill(c, (x, y) => [0.5 + 0.3 * f(x, y), 0.1 * f(x, y)]);
  for (let k = 0; k < 2600; k++) {
    const r = 2.5 + 3 * rand();
    blob(c, rand() * N, rand() * N, r, r * (0.45 + 0.2 * rand()), rand() * Math.PI, 0.7 + 0.75 * rand(), 0.3 + 0.6 * rand(), 0.25);
  }
  for (let k = 0; k < 90; k++) {
    const x = rand() * N, y = rand() * N, a = rand() * Math.PI, len = 12 + 25 * rand();
    stroke(c, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 1.6, 0.55, 0.65, 0.95, 0.9);
  }
};
// Moss and mud: soft cushions, darker hollows.
const moss: Drawer = (c) => {
  const { rand } = c, f = fbmField(rand, 10, 4);
  fill(c, (x, y) => [0.55 + 0.4 * f(x, y), 0.4 * f(x, y)]);
  for (let k = 0; k < 900; k++) {
    const r = 3 + 6 * rand();
    blob(c, rand() * N, rand() * N, r, r * (0.7 + 0.3 * rand()), rand() * 3, 0.85 + 0.45 * rand(), 0.45 + 0.5 * rand(), 0.8);
  }
};
// Rock: crags. Ridged noise (sharp crests where the noise folds) makes
// ledges and gullies, a finer ridged layer breaks them up, grain on top;
// hollows are darker.
const rock: Drawer = (c) => {
  const { rand } = c, big = fbmField(rand, 4, 4), mid = fbmField(rand, 12, 3), g = fbmField(rand, 64, 2);
  const ridge = (v: number) => 1 - Math.abs(2 * v - 1);
  fill(c, (x, y) => {
    const r1 = ridge(big(x, y)) ** 2, r2 = ridge(mid(x, y)) ** 3, n = g(x, y);
    const h = 0.6 * r1 + 0.3 * r2 + 0.1 * n;
    return [(0.55 + 0.8 * h) * (0.9 + 0.2 * n), h];
  });
};
// Snow: soft drifts.
const snow: Drawer = (c) => {
  const { rand } = c, f = fbmField(rand, 6, 4);
  fill(c, (x, y) => [0.97 + 0.06 * f(x, y), f(x, y)]);
};

const DRAW: Record<GroundLayer, Drawer> = { grass, dry, soil, sand, litter, moss, rock, snow };
// How bumpy each layer's normal is (height units per texel).
const BUMP: Record<GroundLayer, number> = { grass: 2.2, dry: 2, soil: 2.5, sand: 1.2, litter: 2.5, moss: 2, rock: 6, snow: 0.8 };

let groundTex: THREE.DataArrayTexture | null = null;
export function groundTextures(): THREE.DataArrayTexture {
  if (groundTex) return groundTex;
  const L = GROUND_LAYERS.length, data = new Uint8Array(N * N * 4 * L);
  GROUND_LAYERS.forEach((k, layer) => {
    const c: Canvas = { lum: new Float32Array(N * N), hgt: new Float32Array(N * N), rand: mulberry32(0x6e0d + 977 * layer) };
    DRAW[k](c);
    let mean = 0;
    for (let i = 0; i < N * N; i++) mean += c.lum[i]!;
    mean /= N * N;
    const o0 = layer * N * N * 4, bump = BUMP[k];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, o = o0 + i * 4;
      const dx = c.hgt[y * N + wrap(x + 1)]! - c.hgt[y * N + wrap(x - 1)]!;
      const dy = c.hgt[wrap(y + 1) * N + x]! - c.hgt[wrap(y - 1) * N + x]!;
      data[o] = Math.round(255 * Math.min(1, c.lum[i]! / mean / 2));
      data[o + 1] = Math.round(255 * Math.min(1, Math.max(0, c.hgt[i]!)));
      // (The slope's tangent part of the normal: -dh/dx, -dh/dy.)
      data[o + 2] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - 0.5 * bump * dx)));
      data[o + 3] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - 0.5 * bump * dy)));
    }
  });
  const tex = new THREE.DataArrayTexture(data, N, N, L);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  groundTex = tex;
  return tex;
}
