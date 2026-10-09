// The land relief: one height field over the whole globe, as if it were
// all land. The coast, sea beds, rivers and pools are cut into it by
// surface.ts.
//
//   height = base + noise + hill bumps + volcano cones
//
// Mountains get only a low base here: their shape is made per connected
// range in surface.ts (height grows with distance from the range's painted
// edge), where the mesh is known.
// - Base: each tile's level (sea floor, lowland, hill or mountain foot),
//   flat in the tile's middle and eased into its neighbors at the edges.
// - Hills are drawn per cluster of adjacent hill tiles, not per tile: a
//   low base, with rounded, elongated bumps scattered across the cluster
//   (around tile centers and across the edges between hill tiles), freely
//   rotated. Bumps fade out outside hill tiles, so hills stay on hill tiles.
// - Water tiles continue the land around them (the mean level of their land
//   neighbors), so the land does not sag toward the hex edges of the coast.
//
// Everything is a pure function of the map and the seed.

import * as THREE from 'three';
import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import type { TileLook } from './look.ts';
import { makePerlin, mulberry32 } from './rng.ts';
import { WORLD_SCALE } from './worldScale.ts';

export interface Relief {
  // Height above radius 1 of a point in fan i of tile t, at barycentric
  // weights wa (toward corner i) and wb (toward corner i+1); dir is its unit direction.
  heightAt(t: number, i: number, wa: number, wb: number, dir: THREE.Vector3): number;
  peak: Float32Array; // nominal height of each mountain tile above its base (0 elsewhere)
  base: Float32Array; // base level of each tile
}

const MOUNTAIN_BASE = 0.009;
// Volcano crater: radius as a share of the cone's radius, depth as a share of its height.
export const CRATER = 0.24;
export const CRATER_DEPTH = 0.3;
export const CONE_RADIUS = 1.15; // share of the tile's inner radius
const HILL_FOOT = 0.007; // level hills rise from (that of flat land)
// Hills are broad, gentle mounds (room to build on, as in Civ VI): bump
// height and width relative to the original design.
const HILL_RISE = 0.75;
const HILL_WIDTH = 1.35;
const LOWLAND = 0.005;

const smoothstep = (a: number, b: number, x: number): number => {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Soft bump: 1 at q = 0, 0 (with zero slope) at q >= 1.
const bump = (q: number) => (q >= 1 ? 0 : (1 - q * q) * (1 - q * q));

export function buildRelief(globe: Globe, map: MapData, looks: readonly TileLook[], seed: number, r0: number): Relief {
  const { tiles, tris } = globe;
  const N = tiles.length;
  const noise = makePerlin(mulberry32(seed ^ 0x51ed270b));
  const rand = mulberry32(seed ^ 0x1e1ef);
  // Volcanoes are lone cones with a crater, not part of ranges.
  const volcano = (t: number) => map.feature[t] === 'volcano';
  const mountain = (t: number) => map.relief[t] === 'mountains' && looks[t].wet < 0.5 && !volcano(t);
  const hill = (t: number) => map.relief[t] === 'hills' && looks[t].wet < 0.5;
  // A hill's top: its height above the lowland follows the world's scale.
  const hillTop = (t: number) => HILL_FOOT + (looks[t].height - HILL_FOOT) * WORLD_SCALE.linear;

  // ---- per-tile base level, plateau and noise amplitude ----
  const base = new Float32Array(N), plateau = new Float32Array(N), amp = new Float32Array(N), peak = new Float32Array(N);
  for (let t = 0; t < N; t++) {
    const l = looks[t];
    base[t] = l.height; plateau[t] = l.plateau; amp[t] = l.roughness;
    if (mountain(t)) {
      peak[t] = (l.height - MOUNTAIN_BASE) * WORLD_SCALE.linear;
      base[t] = MOUNTAIN_BASE; plateau[t] = 0.2; amp[t] = 0.0012;
    } else if (hill(t)) {
      // Most of a hill's height comes from its bumps; the base only lifts a little.
      base[t] = HILL_FOOT + 0.3 * (hillTop(t) - HILL_FOOT); plateau[t] = 0; amp[t] = 0.0015;
    }
  }
  for (let t = 0; t < N; t++) {
    if (!looks[t].water) continue;
    const land = tiles[t].neighbors.filter((nb) => !looks[nb].water);
    base[t] = land.length ? land.reduce((a, nb) => a + base[nb], 0) / land.length : LOWLAND;
    amp[t] = land.length ? land.reduce((a, nb) => a + amp[nb], 0) / land.length : 0;
    plateau[t] = 0.6;
  }

  // ---- hills: bumps scattered over each cluster ----
  interface Bump { c: THREE.Vector3; e1: THREE.Vector3; e2: THREE.Vector3; ra: number; rb: number; h: number }
  const bumps: Bump[][] = tiles.map(() => []);
  const isHill = Float32Array.from(tiles, (tl) => (hill(tl.id) ? 1 : 0));
  const addBump = (at: THREE.Vector3, home: number, h: number, size: number) => {
    // An ellipse, longer one way, at a random angle.
    const e1 = new THREE.Vector3(at.y, -at.x, 0);
    if (e1.lengthSq() < 1e-6) e1.set(0, at.z, -at.y);
    e1.normalize();
    const e2 = at.clone().cross(e1);
    const ang = rand() * Math.PI;
    const a1 = e1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(e2, Math.sin(ang));
    const a2 = at.clone().cross(a1);
    const b: Bump = { c: at, e1: a1, e2: a2, ra: size * (1.15 + 0.5 * rand()) * r0, rb: size * (0.7 + 0.2 * rand()) * r0, h };
    // Reach: the home tile, its neighbors and theirs.
    const near = new Set([home]);
    for (const nb of tiles[home].neighbors) { near.add(nb); for (const nn of tiles[nb].neighbors) near.add(nn); }
    for (const t of near) bumps[t].push(b);
  };
  const jitter = (p: THREE.Vector3, amount: number) =>
    p.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2 * amount * r0)).normalize();
  for (let t = 0; t < N; t++) {
    if (!hill(t)) continue;
    const rise = HILL_RISE * (hillTop(t) - base[t]);
    addBump(jitter(tiles[t].center, 0.35), t, rise * (0.85 + 0.25 * rand()), 0.62 * HILL_WIDTH);
    if (rand() < 0.5) addBump(jitter(tiles[t].center, 0.55), t, rise * (0.5 + 0.3 * rand()), 0.42 * HILL_WIDTH);
    // Across the edges between hill tiles, so a cluster reads as one landform.
    for (const nb of tiles[t].neighbors) {
      if (nb < t || !hill(nb) || rand() > 0.75) continue;
      const mid = tiles[t].center.clone().add(tiles[nb].center).normalize();
      addBump(jitter(mid, 0.25), t, 0.5 * (rise + HILL_RISE * (hillTop(nb) - base[nb])) * (0.7 + 0.3 * rand()), 0.55 * HILL_WIDTH);
    }
  }
  const tmpB = new THREE.Vector3();
  const bumpAt = (t: number, dir: THREE.Vector3): number => {
    let h = 0;
    for (const b of bumps[t]) {
      tmpB.subVectors(dir, b.c);
      const x = tmpB.dot(b.e1) / b.ra, y = tmpB.dot(b.e2) / b.rb;
      const q = Math.sqrt(x * x + y * y);
      if (q < 1) h = Math.max(h, b.h * bump(q));
    }
    return h;
  };

  // ---- base field: plateau in the middle, eased to the edges ----
  const cornerVal = (arr: Float32Array, tri: number) => {
    const [a, b, c] = tris[tri];
    return (arr[a] + arr[b] + arr[c]) / 3;
  };
  const boundaryVal = (arr: Float32Array, t: number, nb: number, ci: number, cj: number, f: number) => {
    const mid = (arr[t] + arr[nb]) / 2;
    return f < 0.5
      ? lerp(cornerVal(arr, ci), mid, smoothstep(0, 1, f * 2))
      : lerp(mid, cornerVal(arr, cj), smoothstep(0, 1, (f - 0.5) * 2));
  };
  const interiorVal = (arr: Float32Array, t: number, i: number, wa: number, wb: number) => {
    const r = wa + wb;
    if (r < 1e-9) return arr[t];
    const tile = tiles[t];
    const k = tile.corners.length;
    const b = boundaryVal(arr, t, tile.neighbors[i], tile.corners[i], tile.corners[(i + 1) % k], wb / r);
    return lerp(arr[t], b, smoothstep(plateau[t], 1, r));
  };

  // ---- volcanoes: a cone with a crater at the tile center ----
  const cones: { c: THREE.Vector3; h: number }[][] = tiles.map(() => []);
  for (let t = 0; t < N; t++) {
    if (!volcano(t)) continue;
    const cone = { c: tiles[t].center, h: Math.max(0.02, looks[t].height - MOUNTAIN_BASE) * WORLD_SCALE.linear };
    peak[t] = cone.h;
    base[t] = MOUNTAIN_BASE; plateau[t] = 0.2; amp[t] = 0.0008;
    cones[t].push(cone);
    for (const nb of tiles[t].neighbors) cones[nb].push(cone);
  }
  const CONE_R = CONE_RADIUS * r0;
  const coneAt = (t: number, dir: THREE.Vector3): number => {
    let best = 0;
    for (const cone of cones[t]) {
      const q = cone.c.distanceTo(dir) / CONE_R;
      if (q >= 1) continue;
      // Concave flanks rising to a rim, then a bowl down into the crater.
      const flank = (u: number) => cone.h * Math.pow(1 - smoothstep(0, 1, u), 1.6);
      const h = q >= CRATER ? flank(q) : flank(CRATER) - CRATER_DEPTH * cone.h * (1 - (q / CRATER) ** 2);
      best = Math.max(best, h);
    }
    return best;
  };

  return {
    heightAt(t, i, wa, wb, dir) {
      const n = 2 * noise.fbm(dir.x * 22 + 5.1, dir.y * 22 - 3.3, dir.z * 22 + 1.7, 5);
      return interiorVal(base, t, i, wa, wb) + interiorVal(amp, t, i, wa, wb) * n
        + coneAt(t, dir)
        + (bumps[t].length ? bumpAt(t, dir) * smoothstep(0.25, 0.75, interiorVal(isHill, t, i, wa, wb)) : 0);
    },
    peak, base,
  };
}
