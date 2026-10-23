// How built-up each point of a drawing wants to be: a smooth field over
// the hex, 1 where the town is thickest, 0 where it gives way to open land.
// It is the steady state of heat flowing in from the tile's sides (Laplace's
// equation): a side with a street (the town goes on past it) is held at 1,
// a side without (open land, water) at 0. So a tile joined on one side is
// thick by that side and thins away from it, one joined on opposite sides
// is a corridor between them, one joined all round is thick everywhere.
// The center adds a source at its middle (a town grows round its hall),
// so the lone first tile is thickest in the middle and thins to its rim.
//
// The drafts (skeleton.ts, draft.ts) read it to decide where lanes go,
// where the hall and a wonder stand, and how many and how tall the
// buildings are; near a street (built along it) the field rises a little.

import { rhoOf, distToLine, type Pt } from './geometry.ts';
import { parseKey } from './edges.ts';

export interface Field {
  // The field at p (0..1), bilinear between grid points.
  at(p: Pt): number;
}

const H = 0.02;            // grid step (tile steps)
const N = 61;              // grid points per row: -0.6 .. 0.6
const ITER = 400;          // relaxation sweeps
const OMEGA = 1.85;        // over-relaxation
// The center's source: its share at the middle, and how far it reaches.
export const CENTER_SOURCE = 0.95, CENTER_REACH = 0.24;

const idx = (i: number, j: number) => j * N + i;
const coord = (i: number) => -0.6 + i * H;

// The side a point outside the hex lies beyond (its outward normal nearest the point's direction).
function sideOf(p: Pt): number {
  let best = 0, bm = -Infinity;
  for (let j = 0; j < 6; j++) {
    const a = (j * Math.PI) / 3, m = p.x * Math.cos(a) + p.y * Math.sin(a);
    if (m > bm) { bm = m; best = j; }
  }
  return best;
}

// The harmonic part: sides held at their values, relaxed inside.
function harmonic(sides: readonly number[]): Float64Array {
  const v = new Float64Array(N * N), inside = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p = { x: coord(i), y: coord(j) };
    if (rhoOf(6, p) < 1) { inside[idx(i, j)] = 1; v[idx(i, j)] = 0.5; }
    else v[idx(i, j)] = sides[sideOf(p)]!;
  }
  for (let it = 0; it < ITER; it++) {
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const k = idx(i, j);
      if (!inside[k]) continue;
      const avg = (v[k - 1]! + v[k + 1]! + v[k - N]! + v[k + N]!) / 4;
      v[k] = v[k]! + OMEGA * (avg - v[k]!);
    }
  }
  return v;
}

const cache = new Map<string, Field>();

// The field of an edge class, for the center (with its source) or not.
export function townField(key: string, center: boolean): Field {
  const ck = `${key}|${center ? 1 : 0}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const h = harmonic(parseKey(key));
  const v = new Float64Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = idx(i, j), r = Math.hypot(coord(i), coord(j));
    const c = center ? CENTER_SOURCE * Math.exp(-((r / CENTER_REACH) ** 2)) : 0;
    v[k] = 1 - (1 - h[k]!) * (1 - c);
  }
  const f: Field = {
    at(p) {
      const x = Math.max(0, Math.min(N - 1.001, (p.x + 0.6) / H)), y = Math.max(0, Math.min(N - 1.001, (p.y + 0.6) / H));
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const a = v[idx(i, j)]!, b = v[idx(i + 1, j)]!, c = v[idx(i, j + 1)]!, d = v[idx(i + 1, j + 1)]!;
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    },
  };
  cache.set(ck, f);
  return f;
}

// The field where buildings stand: a street draws building to it (most
// a main street, least a lane), so the field rises near one.
export interface PullStreet { readonly pts: readonly Pt[]; readonly pull: number }
export const STREET_REACH = 0.07;
export function withStreets(f: Field, streets: readonly PullStreet[]): Field {
  return {
    at(p) {
      let keep = 1 - f.at(p);
      for (const s of streets) {
        const d = distToLine(p, s.pts);
        if (d < 3 * STREET_REACH) keep *= 1 - s.pull * Math.exp(-((d / STREET_REACH) ** 2));
      }
      return 1 - keep;
    },
  };
}
