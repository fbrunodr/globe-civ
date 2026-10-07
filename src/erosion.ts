// Procedural erosion: gullies and sharp ridges on slopes, as rain carves
// them into real mountains and hills (Civ V's hand-sculpted mountain stamps
// are full of them).
//
// Each point is computed on its own from the height field's slope there, so
// it stays a pure function of the map: no simulation. The idea follows
// gradient-aligned erosion noise (in the spirit of Clay John's and Rune
// Skovbo Johansen's erosion filters): around every point of a jittered
// lattice, a wave runs straight down the local slope; summed over the
// nearby lattice points, the waves form furrows that run downhill. Each
// octave adds finer furrows, aligned to the slope including the coarser
// ones, so small gullies branch off big ones.
//
// The result is the height to add (negative in gullies, positive on the
// ridges between them), strongest on steep slopes and zero on flat ground.

import { cellHash } from './paint.ts';

export interface ErosionParams {
  wavelength: number; // of the coarsest gullies (radians)
  octaves: number;
  amplitude: number;  // height of the coarsest gullies, at full slope
  slope: [number, number]; // slope (height per radian) where gullies start and reach full depth
  seed: number;
}

const TAU = Math.PI * 2;

// p: unit direction; n: the surface normal there (≈ p); g: the height
// gradient (tangent, height per radian).
export function erosionAt(P: ErosionParams, px: number, py: number, pz: number, gx: number, gy: number, gz: number): number {
  let total = 0;
  let amp = P.amplitude;
  let freq = 1 / P.wavelength;
  // Running gradient: the slope including the furrows added so far.
  let rx = gx, ry = gy, rz = gz;
  const steep = (s: number) => {
    const t = Math.min(1, Math.max(0, (s - P.slope[0]) / (P.slope[1] - P.slope[0])));
    return t * t * (3 - 2 * t);
  };
  const fade0 = steep(Math.hypot(gx, gy, gz));
  if (fade0 <= 0) return 0;
  for (let o = 0; o < P.octaves; o++) {
    const glen = Math.hypot(rx, ry, rz);
    if (glen < 1e-9) break;
    // Across the slope, in the tangent plane: furrows vary along it.
    let ax = py * rz - pz * ry, ay = pz * rx - px * rz, az = px * ry - py * rx;
    const al = Math.hypot(ax, ay, az);
    if (al < 1e-12) break;
    ax /= al; ay /= al; az /= al;
    const qx = px * freq, qy = py * freq, qz = pz * freq;
    const fx = Math.floor(qx), fy = Math.floor(qy), fz = Math.floor(qz);
    let h = 0, dh = 0, wsum = 0;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
      const cx = fx + i, cy = fy + j, cz = fz + k;
      const hs = cellHash(cx, cy, cz, P.seed + o);
      // Jittered lattice point.
      const ox = cx + ((hs & 255) / 255 - 0.5) * 0.8;
      const oy = cy + (((hs >>> 8) & 255) / 255 - 0.5) * 0.8;
      const oz = cz + (((hs >>> 16) & 255) / 255 - 0.5) * 0.8;
      const dx = qx - ox, dy = qy - oy, dz = qz - oz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const w = Math.exp(-d2 * 2);
      // Distance across the slope from the lattice point, in wavelengths.
      const u = dx * ax + dy * ay + dz * az;
      h += Math.cos(u * TAU) * w;
      dh += -Math.sin(u * TAU) * TAU * w;
      wsum += w;
    }
    h /= wsum; dh /= wsum;
    total += amp * h;
    // Steer the next octave by the slope this one added (d/dx of amp·cos).
    const k = amp * dh * freq;
    rx += ax * k; ry += ay * k; rz += az * k;
    amp *= 0.45;
    freq *= 2.1;
  }
  return total * fade0;
}
