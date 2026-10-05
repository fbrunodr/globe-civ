// The land relief: one height field over the whole globe, as if it were
// all land. The coast, sea beds, rivers and pools are cut into it by
// surface.ts.
//
//   height = base + noise + mountain ridges + hill bumps
//
// - Base: each tile's level (sea floor, lowland, hill or mountain foot),
//   flat in the tile's middle and eased into its neighbors at the edges.
// - Mountain ranges are drawn from a ridge skeleton: segments between the
//   centers of adjacent mountain tiles (pruned so clusters branch instead of
//   forming pyramids), plus short spurs into neighboring hills. Height falls
//   off with distance from the skeleton, so neighboring mountain tiles merge
//   into one crest, and the crest always lies on mountain tiles.
// - Hills get one to three soft bumps inside their core.
// - Water tiles continue the land around them (the mean level of their land
//   neighbors), so the land does not sag toward the hex edges of the coast.
//
// Everything is a pure function of the map and the seed.

import * as THREE from 'three';
import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import type { TileLook } from './look.ts';
import { makePerlin, mulberry32 } from './rng.ts';

export interface Relief {
  // Height above radius 1 of a point in fan i of tile t, at barycentric
  // weights wa (toward corner i) and wb (toward corner i+1); dir is its unit direction.
  heightAt(t: number, i: number, wa: number, wb: number, dir: THREE.Vector3): number;
  peak: Float32Array; // highest point of each mountain tile's crest (0 elsewhere)
  base: Float32Array; // base level of each tile
  ridges: readonly Ridge[];
}

export interface Ridge {
  a: THREE.Vector3; b: THREE.Vector3; // crest end points (unit vectors)
  ha: number; hb: number;             // crest height above the base at each end
  dip: number;                         // saddle depth, as a share of the lower end
  tiles: [number, number];             // the tiles it joins (b = -1 for a spur)
}

// Share of the lower peak a saddle may dip (P7 guarantees at least 70% remains).
export const MAX_SADDLE_DIP = 0.18;
const MOUNTAIN_BASE = 0.009;
// Volcano crater: radius as a share of the cone's radius, depth as a share of its height.
export const CRATER = 0.24;
export const CRATER_DEPTH = 0.3;
export const CONE_RADIUS = 1.15; // share of the tile's inner radius
const HILL_BUMP = 0.005;
const LOWLAND = 0.005;

const smoothstep = (a: number, b: number, x: number): number => {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Soft bump: 1 at q = 0, 0 (with zero slope) at q >= 1.
const bump = (q: number) => (q >= 1 ? 0 : (1 - q * q) * (1 - q * q));

// warp: the painting's warp field (paint.ts warpAt), so ranges bend with the
// regions around them instead of following the hex grid.
export function buildRelief(globe: Globe, map: MapData, looks: readonly TileLook[], seed: number, r0: number,
  warp?: (x: number, y: number, z: number, out: number[]) => number[]): Relief {
  const { tiles, tris } = globe;
  const N = tiles.length;
  const noise = makePerlin(mulberry32(seed ^ 0x51ed270b));
  const crag = makePerlin(mulberry32(seed ^ 0x2c4a6e1f));
  const rand = mulberry32(seed ^ 0x1e1ef);
  // Volcanoes are lone cones with a crater, not part of ranges.
  const volcano = (t: number) => map.feature[t] === 'volcano';
  const mountain = (t: number) => map.relief[t] === 'mountains' && looks[t].wet < 0.5 && !volcano(t);

  // ---- per-tile base level, plateau and noise amplitude ----
  const base = new Float32Array(N), plateau = new Float32Array(N), amp = new Float32Array(N), peak = new Float32Array(N);
  for (let t = 0; t < N; t++) {
    const l = looks[t];
    base[t] = l.height; plateau[t] = l.plateau; amp[t] = l.roughness;
    if (mountain(t)) {
      peak[t] = l.height - MOUNTAIN_BASE;
      base[t] = MOUNTAIN_BASE; plateau[t] = 0.2; amp[t] = 0.0012;
    } else if (map.relief[t] === 'hills' && l.wet < 0.5) {
      base[t] = l.height - HILL_BUMP; plateau[t] = 0.3; amp[t] = 0.0015;
    }
  }
  for (let t = 0; t < N; t++) {
    if (!looks[t].water) continue;
    const land = tiles[t].neighbors.filter((nb) => !looks[nb].water);
    base[t] = land.length ? land.reduce((a, nb) => a + base[nb], 0) / land.length : LOWLAND;
    amp[t] = land.length ? land.reduce((a, nb) => a + amp[nb], 0) / land.length : 0;
    plateau[t] = 0.6;
  }

  // ---- ridge skeleton ----
  const links: [number, number, number][] = [];
  for (let t = 0; t < N; t++) {
    if (!mountain(t)) continue;
    for (const nb of tiles[t].neighbors) if (nb > t && mountain(nb)) links.push([t, nb, Math.min(map.elevation[t], map.elevation[nb])]);
  }
  links.sort((x, y) => y[2] - x[2] || x[0] - y[0] || x[1] - y[1]);
  const kept = new Map<number, Set<number>>();
  const keptOf = (t: number) => { let s = kept.get(t); if (!s) { s = new Set(); kept.set(t, s); } return s; };
  const ridges: Ridge[] = [];
  const dipFor = () => 0.06 + (MAX_SADDLE_DIP - 0.06) * rand();
  for (const [a, b] of links) {
    const ka = keptOf(a), kb = keptOf(b);
    if ([...ka].some((c) => kb.has(c))) continue; // would close a triangle
    ka.add(b); kb.add(a);
    ridges.push({ a: tiles[a].center, b: tiles[b].center, ha: peak[a], hb: peak[b], dip: dipFor(), tiles: [a, b] });
  }
  for (let t = 0; t < N; t++) {
    if (!mountain(t)) continue;
    // Every peak gets a cap, even where no link survived.
    ridges.push({ a: tiles[t].center, b: tiles[t].center, ha: peak[t], hb: peak[t], dip: 0, tiles: [t, -1] });
    // Spurs run halfway into the two highest neighboring hills.
    const hills = tiles[t].neighbors.filter((nb) => map.relief[nb] === 'hills' && looks[nb].wet < 0.5)
      .sort((x, y) => map.elevation[y] - map.elevation[x] || x - y).slice(0, 2);
    for (const h of hills) {
      const end = tiles[t].center.clone().add(tiles[h].center).normalize();
      ridges.push({ a: tiles[t].center, b: end, ha: peak[t], hb: 0.3 * peak[t], dip: 0, tiles: [t, -1] });
    }
  }
  // Ridges that can reach each tile: those touching it or its neighbors.
  const ridgesNear: number[][] = tiles.map(() => []);
  ridges.forEach((r, k) => {
    const near = new Set<number>();
    for (const t of r.tiles) if (t >= 0) { near.add(t); for (const nb of tiles[t].neighbors) near.add(nb); }
    if (r.tiles[1] < 0) for (const nb of tiles[r.tiles[0]].neighbors) for (const nn of tiles[nb].neighbors) near.add(nn);
    for (const t of near) ridgesNear[t].push(k);
  });
  const W = 1.25 * r0;
  const tmp = new THREE.Vector3(), seg = new THREE.Vector3(), wdir = new THREE.Vector3();
  const delta = [0, 0, 0];
  const RIDGE_WARP = 0.9;
  const ridgeAt = (t: number, d: THREE.Vector3): number => {
    if (ridgesNear[t].length === 0) return 0;
    let dir = d;
    if (warp) {
      warp(d.x, d.y, d.z, delta);
      dir = wdir.set(d.x + RIDGE_WARP * delta[0], d.y + RIDGE_WARP * delta[1], d.z + RIDGE_WARP * delta[2]).normalize();
    }
    let best = 0;
    for (const k of ridgesNear[t]) {
      const r = ridges[k];
      seg.subVectors(r.b, r.a);
      const len2 = seg.lengthSq();
      const u = len2 > 0 ? Math.min(1, Math.max(0, tmp.subVectors(dir, r.a).dot(seg) / len2)) : 0;
      const dist = tmp.copy(r.a).addScaledVector(seg, u).distanceTo(dir);
      const q = dist / W;
      if (q >= 1) continue;
      const crest = lerp(r.ha, r.hb, u) - r.dip * Math.min(r.ha, r.hb) * Math.sin(Math.PI * u);
      best = Math.max(best, crest * bump(q));
    }
    if (best === 0) return 0;
    // Crags: ridged noise roughens the range, strongest along the crest.
    const f = 3.2 / globe.avgEdgeAngle;
    const rn = 1 - Math.abs(crag.noise(dir.x * f, dir.y * f, dir.z * f) * 2);
    return best * (0.9 + 0.15 * rn);
  };

  // ---- hill bumps ----
  const bumps: { c: THREE.Vector3; r: number; h: number }[][] = tiles.map(() => []);
  for (let t = 0; t < N; t++) {
    if (map.relief[t] !== 'hills' || looks[t].wet >= 0.5) continue;
    const c = tiles[t].center;
    const e1 = new THREE.Vector3(c.y, -c.x, 0);
    if (e1.lengthSq() < 1e-6) e1.set(0, c.z, -c.y);
    e1.normalize();
    const e2 = c.clone().cross(e1);
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const ang = rand() * Math.PI * 2, off = (k === 0 ? 0.15 : 0.35) * r0 * rand();
      const p = c.clone().addScaledVector(e1, Math.cos(ang) * off).addScaledVector(e2, Math.sin(ang) * off).normalize();
      bumps[t].push({ c: p, r: (0.5 + 0.12 * rand()) * r0, h: HILL_BUMP * (k === 0 ? 1 : 0.5 + 0.4 * rand()) });
    }
  }
  const bumpAt = (t: number, dir: THREE.Vector3): number => {
    let h = 0;
    for (const b of bumps[t]) h = Math.max(h, b.h * bump(b.c.distanceTo(dir) / b.r));
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
    const cone = { c: tiles[t].center, h: Math.max(0.02, looks[t].height - MOUNTAIN_BASE) };
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
        + Math.max(ridgeAt(t, dir), coneAt(t, dir)) + bumpAt(t, dir);
    },
    peak, base, ridges,
  };
}
