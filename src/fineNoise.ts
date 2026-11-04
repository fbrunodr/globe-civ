// The small tiling noise the shaders sample (terrainMaterial.ts uNoise: a
// 64³ texture of random bytes, linearly filtered, repeating), and the same
// noise read on the CPU, so what the GPU draws from it (the painting's fine
// wiggle) can be known here too.

import { mulberry32 } from './rng.ts';

export const NOISE_SIZE = 64;
let data: Uint8Array | null = null;
export function noiseData(): Uint8Array {
  if (!data) {
    const rand = mulberry32(0x5eed);
    data = new Uint8Array(NOISE_SIZE ** 3);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  }
  return data;
}

// tNoise (NOISE_GLSL): the texture at x / NOISE_SIZE, trilinear between
// texel centers, wrapping.
export function tNoise(x: number, y: number, z: number): number {
  const d = noiseData(), N = NOISE_SIZE;
  const fx = x - 0.5, fy = y - 0.5, fz = z - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const ux = fx - ix, uy = fy - iy, uz = fz - iz;
  const w = (i: number) => ((i % N) + N) % N;
  const at = (a: number, b: number, c: number) => d[w(a) + w(b) * N + w(c) * N * N]! / 255;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = lerp(at(ix, iy, iz), at(ix + 1, iy, iz), ux), x10 = lerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), ux);
  const x01 = lerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), ux), x11 = lerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
}

// tFbm (NOISE_GLSL): up to three octaves, normalized to [0, 1].
export function tFbm(x: number, y: number, z: number, octaves: number): number {
  let s = 0, a = 0.5;
  for (let i = 0; i < Math.min(3, octaves); i++) {
    s += a * tNoise(x, y, z);
    x = x * 2.03 + 1.7; y = y * 2.03 + 1.7; z = z * 2.03 + 1.7;
    a *= 0.5;
  }
  return s / (1 - 2 * a);
}
