// The surface: ground height and water level at every vertex of the globe.
//
// The painting decides where water is; this module gives it depth, so the
// world reads as a place you could walk on, not a painted map.
//
// 1. Coast. The painted shore (where the soft water weight of the painting
//    crosses 1/2) is found on the mesh, and every vertex gets its signed
//    distance D to it along the surface (land > 0). The land relief rises
//    from sea level at the shore, gently at first (beaches), and reaches its
//    full height inland; sea and lake beds fall away on the other side. The
//    ground crosses sea level exactly on the painted shore.
// 2. Beds. Below the water the ground blends the beds of the tiles that
//    paint it (shallow shelves, deep ocean, reefs close under the surface).
// 3. Rivers. Each river follows its drawn course, carries on past its mouth
//    until it is well inside the painted water, and carves a channel. Its
//    level never rises downstream, stays a little under the banks, ends at
//    sea level at the mouth (or at the level of the river it joins), and
//    never falls steeper than MAX_RIVER_SLOPE: where the land is high near
//    the coast, the river cuts a valley instead of a waterfall.
// 4. Pools. Wetlands get pools of their own water among dry tussocks; oases
//    a pond. Coastal wetlands sit at sea level.
//
// Water stands wherever the water level is above the ground: sea level
// everywhere, a river's level near the river, a wetland's level on it.
// Everything is a pure function of the map and the seed.

import * as THREE from 'three';
import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import { SEA_LEVEL, SEA_TINT, RIVER_TINT, type TileLook, type WaterTint } from './look.ts';
import type { Relief } from './relief.ts';
import { fanCoords, fanFrames, softAt, FAN_COORDS, type PaintData } from './paint.ts';
import { riverCurve } from './riverCurve.ts';
import { locate, newSample, type Topology, type SurfaceFields } from './terrainMesh.ts';
import { makePerlin, mulberry32 } from './rng.ts';
import { erosionAt, type ErosionParams } from './erosion.ts';

// River courses as drawn: points from source to the end inside the water.
export interface RiverCourse {
  pts: THREE.Vector3[];
  level: number[]; // water level at each point
  half: number[];  // half width of the water
  depth: number[]; // water depth in the middle of the channel
  ground: number[]; // the ground along the course before it was cut (lowest of middle and banks)
  mouth: number;   // index of the point where the drawn course met the coast (or the river it joins)
  tributary: boolean;
}

export interface Surface {
  fields: SurfaceFields;
  coast: Float32Array; // signed distance to the painted shore per vertex (radians, land > 0)
  rivers: RiverCourse[];
}

// The river surface stays this far under the banks beside it.
export const RIVER_BANK = 0.0004;
// Steepest a river may fall (height per radian along its course).
export const MAX_RIVER_SLOPE = 0.07;
const K_BANK = 0.6;    // slope of the channel's banks
const BANK_H = 0.00025; // height of the banks above the water, before the valley's gentler slope
const K_VALLEY = 0.16; // slope of the valley sides a river cuts
const POOL_DEPTH = 0.0004;
const POOL_BANK = 0.0002; // pools sit this far under their tile's ground
const LAKE_BANK = 0.0006; // lakes sit this far under the lowest land around them
const COAST_CAP = 3;
// Erosion on slopes: wavelength of the coarsest gullies (tile radii), octaves,
// their depth at full slope, the slopes where they start / reach full depth,
// and the strength on hills (mountains: 1).
// Mountain ranges (tile radii): how far the height field reaches inside, the
// depth of the foothills, the depth at which a range reaches full height, the
// crest wavelength; and how much the crests vary the height.
export const RANGE = { reach: 6, foot: 0.65, full: 1.6, crest: 2.2, texture: 0.5 };
export const EROSION = { wavelength: 0.55, octaves: 3, amplitude: 0.0045, slope: [0.12, 0.7] as [number, number], hills: 0.25 };
const MARGIN_R = 0.35; // rivers own the water level this far beyond their edge (tile radii) // distances to the shore are tracked up to this many tile radii

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Mesh level of each tile (terrainMesh.ts): river channels, pools and
// mountains need the finest mesh (4×); coasts, hills and the neighbors of
// mountains a finer one (2×) for smooth relief and shorelines; the rest is coarse.
export function meshLevels(globe: Globe, map: MapData, looks: readonly TileLook[]): Uint8Array {
  const N = globe.tiles.length;
  const rough = (t: number) => map.relief[t] !== 'flat' && !looks[t].water;
  const level = new Uint8Array(N).fill(1);
  for (let t = 0; t < N; t++) {
    if (rough(t) || globe.tiles[t].neighbors.some((nb) => (map.relief[nb] === 'mountains' && !looks[nb].water) || looks[nb].water !== looks[t].water)) level[t] = 2;
    // Rivers, pools and mountains (fine gullies) need the finest mesh.
    if (map.riverTile[t] || looks[t].pool || (map.relief[t] === 'mountains' && !looks[t].water)) level[t] = 4;
  }
  for (const r of map.rivers) if (!r.tributary) for (const t of globe.tris[r.corners[r.corners.length - 1]]) level[t] = 4;
  return level;
}

export function buildSurface(globe: Globe, map: MapData, looks: readonly TileLook[], paint: PaintData,
  relief: Relief, seed: number, topo: Topology): Surface {
  const { tiles } = globe;
  const V = topo.V;
  const r0 = paint.params.r0;
  const frames = fanFrames(globe);
  const noise = makePerlin(mulberry32(seed ^ 0x3a7e5f01));
  const dirOf = (v: number, out: THREE.Vector3) => out.set(topo.dir[v * 3], topo.dir[v * 3 + 1], topo.dir[v * 3 + 2]);

  // ---- what the painting puts at each vertex ----
  const wet = new Float32Array(V);     // soft weight of open water (the shore is at 1/2)
  const level0 = new Float32Array(V);  // level of the open water painted here
  const rocky = new Float32Array(V);   // soft weight of mountain tiles (ranges; the edge is at 1/2)
  const rockH = new Float32Array(V);   // their nominal height, weighted
  const lake = new Float32Array(V);    // share of that water that is lake
  const bed = new Float32Array(V);     // bed level
  const poolQ = new Float32Array(V);   // soft weight of pool tiles (wetlands, oases)
  const poolLvl = new Float32Array(V); // their water level
  const poolThr = new Float32Array(V); // their flooding threshold
  const poolPond = new Float32Array(V);
  const poolTint = new Float32Array(V * 4);
  const co = new Float32Array(FAN_COORDS);
  // Tiles that make up mountain ranges (volcanoes are cones of their own).
  const inRange = (t: number) => map.relief[t] === 'mountains' && !looks[t].water && map.feature[t] !== 'volcano';
  // Pools sit just under their own ground.
  const poolLevelOf = tiles.map((tile) => (looks[tile.id].pool ? looks[tile.id].height - POOL_BANK : 0));
  const bodyLevel = waterLevels(globe, map, looks, relief);
  const tintRGB = (t: WaterTint) => new THREE.Color(t.deep);
  const poolColor = tiles.map((tile) => { const pl = looks[tile.id].pool; return pl ? tintRGB(pl.tint) : null; });
  for (let v = 0; v < V; v++) {
    const f = topo.fan[v];
    const fan = paint.fans[f];
    fanCoords(frames[f], fan, topo.warp.subarray(v * 3, v * 3 + 3), topo.dir[v * 3], topo.dir[v * 3 + 1], topo.dir[v * 3 + 2], co);
    const w = softAt(paint, f, co);
    let m = 0, lk = 0, b = 0, q = 0, lvl = 0, thr = 0, pond = 0, wl = 0;
    const tint = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      if (w[k] <= 0) continue;
      const u = fan.ids[k], l = looks[u];
      if (l.water) { m += w[k]; wl += w[k] * bodyLevel[u]; if (map.biome[u] === 'lake') lk += w[k]; }
      if (inRange(u)) { rocky[v] += w[k]; rockH[v] += w[k] * relief.peak[u]; }
      b += w[k] * l.bed;
      if (l.pool) {
        q += w[k]; lvl += w[k] * poolLevelOf[u]; thr += w[k] * l.pool.threshold; pond += w[k] * (l.pool.pond ? 1 : 0);
        const c = poolColor[u]!;
        tint[0] += w[k] * c.r; tint[1] += w[k] * c.g; tint[2] += w[k] * c.b; tint[3] += w[k] * l.pool.tint.murk;
      }
    }
    wet[v] = m; lake[v] = m > 0 ? lk / m : 0; bed[v] = b; poolQ[v] = q;
    level0[v] = m > 0 ? wl / m : SEA_LEVEL;
    if (q > 0) {
      poolLvl[v] = lvl / q; poolThr[v] = thr / q; poolPond[v] = pond / q;
      for (let c = 0; c < 4; c++) poolTint[v * 4 + c] = tint[c] / q;
    }
  }

  // ---- 1. distance to the painted shore, and the level of the water there ----
  const { dist: coast, level: shoreLevel } = coastDistance(topo, wet, level0, COAST_CAP * r0);

  // ---- land relief, coast and beds ----
  const height = new Float32Array(V);
  const ramp = new Float32Array(V); // 0 at a shore, 1 inland: how far the land has risen from the water
  const d = new THREE.Vector3();
  for (let v = 0; v < V; v++) {
    dirOf(v, d);
    const D = coast[v], wl = shoreLevel[v];
    if (D >= 0) {
      const land = Math.max(relief.heightAt(topo.tile[v], topo.fanIndex[v], topo.wa[v], topo.wb[v], d), wl + 0.0015);
      // Beach width varies along the coast.
      const fl = 1 / (3 * r0);
      const L = r0 * (0.42 + 0.3 * noise.noise(d.x * fl, d.y * fl, d.z * fl));
      const x = D / L;
      ramp[v] = 1 - Math.exp(-(0.35 * x + 0.6 * x * x));
      height[v] = wl + (land - wl) * ramp[v];
    } else {
      // Beds are depths below the water's own level.
      const f = 1 / (0.6 * r0);
      const b = Math.min(bed[v] + 0.0011 * noise.fbm(d.x * f, d.y * f, d.z * f, 3), -0.0007);
      const y = -D / (0.55 * r0);
      height[v] = wl + b * (1 - Math.exp(-(0.7 * y + 0.5 * y * y)));
    }
  }
  // ---- mountain ranges: one landform per connected range ----
  // Each range's height grows with the distance from its painted edge, so
  // its highest ground lies deepest inside (whatever the tiles), and ridged
  // noise breaks that dome into crests, peaks and saddles.
  {
    const { dist } = coastDistance(topo, rocky, rocky, RANGE.reach * r0);
    // Ranges: connected areas inside the painted edge; their depth and height.
    const comp = new Int32Array(V).fill(-1);
    const depthMax: number[] = [], heightOf: number[] = [];
    for (let v0 = 0; v0 < V; v0++) {
      if (rocky[v0] < 0.5 || comp[v0] >= 0) continue;
      const id = depthMax.length;
      let deepest = 0, hs = 0, ws = 0;
      const stack = [v0];
      comp[v0] = id;
      while (stack.length) {
        const v = stack.pop()!;
        deepest = Math.max(deepest, -dist[v]);
        hs += rockH[v]; ws += rocky[v];
        for (let k = topo.adjStart[v]; k < topo.adjStart[v + 1]; k++) {
          const u = topo.adj[k];
          if (comp[u] < 0 && rocky[u] >= 0.5) { comp[u] = id; stack.push(u); }
        }
      }
      depthMax.push(deepest);
      heightOf.push(ws > 0 ? hs / ws : 0);
    }
    const fr = 1 / (RANGE.crest * r0);
    for (let v = 0; v < V; v++) {
      const c = comp[v];
      if (c < 0) continue;
      dirOf(v, d);
      // Depth inside the range, as a share of how deep the range gets
      // (capped, so wide ranges have broad high interiors with room for
      // crests, not one cone).
      const deep = -dist[v], full = Math.min(depthMax[c], RANGE.full * r0);
      // Gentle at the foot (zero slope at the painted edge), rising inward,
      // so a range's highest ground lies deepest inside.
      const dome = smoothstep(0, Math.max(full, RANGE.foot * r0), deep);
      // Bigger ranges stand a little taller.
      const size = 1 + 0.3 * smoothstep(0.8 * r0, 2.5 * r0, depthMax[c]);
      // Ridged noise: sharp crests and peaks, saddles and cols between.
      const crest = Math.max(0, 1 - Math.abs(noise.fbm(d.x * fr + 11.3, d.y * fr - 4.2, d.z * fr + 7.7, 2) * 2));
      // Crests shape the interior; near the edge the rise itself dominates.
      const tex = RANGE.texture * smoothstep(0.2 * r0, Math.max(full, RANGE.foot * r0), deep);
      height[v] += heightOf[c] * size * dome * (1 - tex + 1.3 * tex * crest) * ramp[v];
    }
  }

  // ---- erosion: gullies and ridges on slopes (erosion.ts) ----
  {
    // The slope at each vertex, from its neighbors (least squares in the tangent plane).
    const grad = new Float32Array(V * 3);
    for (let v = 0; v < V; v++) {
      if (coast[v] < 0) continue;
      const px = topo.dir[v * 3], py = topo.dir[v * 3 + 1], pz = topo.dir[v * 3 + 2];
      let gx = 0, gy = 0, gz = 0, n = 0;
      for (let k = topo.adjStart[v]; k < topo.adjStart[v + 1]; k++) {
        const u = topo.adj[k];
        let dx = topo.dir[u * 3] - px, dy = topo.dir[u * 3 + 1] - py, dz = topo.dir[u * 3 + 2] - pz;
        const along = dx * px + dy * py + dz * pz;
        dx -= along * px; dy -= along * py; dz -= along * pz;
        const l2 = dx * dx + dy * dy + dz * dz;
        if (l2 < 1e-16) continue;
        const dh = (height[u] - height[v]) / l2;
        gx += dh * dx; gy += dh * dy; gz += dh * dz; n++;
      }
      // Each neighbor gives the slope along its own direction; summed over a
      // ring of neighbors this is about half the gradient.
      if (n > 0) { grad[v * 3] = 2 * gx / n; grad[v * 3 + 1] = 2 * gy / n; grad[v * 3 + 2] = 2 * gz / n; }
    }
    // Only mountains and hills erode (full on mountains, less on hills),
    // blurred over the mesh so the strength has no seam at tile edges.
    let mask = Float32Array.from(topo.tile, (t) =>
      looks[t].water ? 0 : map.relief[t] === 'mountains' ? 1 : map.relief[t] === 'hills' ? EROSION.hills : 0);
    for (let it = 0; it < 6; it++) {
      const next = new Float32Array(V);
      for (let v = 0; v < V; v++) {
        let sum = mask[v], n = 1;
        for (let k = topo.adjStart[v]; k < topo.adjStart[v + 1]; k++) { sum += mask[topo.adj[k]]; n++; }
        next[v] = sum / n;
      }
      mask = next;
    }
    const P: ErosionParams = { wavelength: EROSION.wavelength * r0, octaves: EROSION.octaves, amplitude: EROSION.amplitude, slope: EROSION.slope, seed: seed ^ 0x6e70 };
    for (let v = 0; v < V; v++) {
      const m = mask[v] * ramp[v];
      if (coast[v] < 0 || m <= 0.01) continue;
      height[v] += m * erosionAt(P, topo.dir[v * 3], topo.dir[v * 3 + 1], topo.dir[v * 3 + 2], grad[v * 3], grad[v * 3 + 1], grad[v * 3 + 2]);
    }
  }

  // Water: open water near its shores (the land stays above it), nothing
  // elsewhere until rivers and pools add theirs.
  const NONE = -1;
  const water = Float32Array.from(coast, (D, v) => (Math.abs(D) < COAST_CAP * r0 ? shoreLevel[v] : wet[v] >= 0.5 ? level0[v] : NONE));
  const source = new Uint8Array(V); // 0 open water, 1 river, 2 pool

  // ---- 3. rivers ----
  const smp = newSample();
  let hint = 0;
  const sampleField = (f: Float32Array, p: THREE.Vector3): number => {
    const at = locate(globe, p, hint);
    hint = at.t;
    topo.sample(at.t, at.i, at.wa, at.wb, smp);
    return smp.w[0] * f[smp.v[0]] + smp.w[1] * f[smp.v[1]] + smp.w[2] * f[smp.v[2]];
  };
  const MARGIN = MARGIN_R * r0;
  const maxFlow = Math.max(1, ...map.rivers.flatMap((r) => r.flow));
  const courses: RiverCourse[] = [];
  for (const r of map.rivers) {
    const curve = riverCurve(globe, paint, r);
    const pts: THREE.Vector3[] = [];
    const flow: number[] = [];
    for (const c of curve) {
      if (pts.length && pts[pts.length - 1].distanceTo(c.dir) < 0.01 * r0) continue;
      pts.push(c.dir.clone());
      flow.push(Math.sqrt(r.flow[c.edge] / maxFlow));
    }
    if (pts.length < 2) continue;
    const mouth = pts.length - 1;
    let joinLevel = SEA_LEVEL;
    if (!r.tributary) {
      joinLevel = Math.max(...globe.tris[r.corners[r.corners.length - 1]].map((t) => (looks[t].water ? bodyLevel[t] : -Infinity)));
      if (!Number.isFinite(joinLevel)) joinLevel = SEA_LEVEL;
      // Carry on into the water: steer toward the water tiles at the mouth
      // until well inside the painted water.
      const corner = r.corners[r.corners.length - 1];
      const target = new THREE.Vector3();
      for (const t of globe.tris[corner]) if (looks[t].water) target.add(tiles[t].center);
      if (target.lengthSq() === 0) target.copy(pts[mouth]);
      target.normalize();
      const dirv = pts[mouth].clone().sub(pts[mouth - 1]).normalize();
      const step = 0.05 * r0;
      let inside = -1;
      for (let s = 0; s < 60; s++) {
        const p = pts[pts.length - 1];
        const toward = target.clone().sub(p);
        toward.addScaledVector(p, -toward.dot(p));
        if (toward.lengthSq() > 1e-16) dirv.lerp(toward.normalize(), 0.25).normalize();
        dirv.addScaledVector(p, -dirv.dot(p)).normalize();
        const next = p.clone().addScaledVector(dirv, step).normalize();
        pts.push(next);
        flow.push(flow[flow.length - 1]);
        if (inside < 0 && sampleField(wet, next) > 0.9) inside = s;
        if (inside >= 0 && s - inside >= 5) break;
      }
    } else {
      // Join the river it flows into, at that river's nearest point.
      let best: { c: RiverCourse; j: number; dist: number } | null = null;
      for (const c of courses) {
        for (let j = 0; j < c.pts.length; j++) {
          const dist = c.pts[j].distanceTo(pts[mouth]);
          if (!best || dist < best.dist) best = { c, j, dist };
        }
      }
      if (best && best.dist < 1.5 * r0) {
        pts.push(best.c.pts[best.j].clone());
        flow.push(flow[flow.length - 1]);
        joinLevel = best.c.level[best.j];
      }
    }
    const n = pts.length;
    // Width: from the flow, varying a little along the course, and narrow
    // at the source.
    let along = 0;
    const half = flow.map((f, j) => {
      if (j > 0) along += pts[j].distanceTo(pts[j - 1]);
      const p = pts[j], fw = 1 / (1.5 * r0);
      const vary = 1 + 0.3 * noise.noise(p.x * fw + 3.3, p.y * fw, p.z * fw - 8.1);
      return r0 * (0.06 + 0.08 * f) * vary * (0.45 + 0.55 * smoothstep(0, 0.8 * r0, along));
    });
    const depth = flow.map((f, j) => (0.00035 + 0.0005 * f) * Math.min(1, half[j] / (r0 * (0.06 + 0.08 * f))));
    for (let j = mouth + 1; j < n; j++) half[j] *= 1 + 0.5 * Math.min(1, (j - mouth) / 8); // estuary
    // Ground along the course: the lowest of the middle and both banks.
    const ground = pts.map((p, j) => {
      const tan = pts[Math.min(n - 1, j + 1)].clone().sub(pts[Math.max(0, j - 1)]);
      const side = p.clone().cross(tan).normalize().multiplyScalar(1.6 * half[j]);
      const a = p.clone().add(side).normalize(), b = p.clone().sub(side).normalize();
      return Math.min(sampleField(height, p), sampleField(height, a), sampleField(height, b));
    });
    // Levels: never rising downstream, under the banks, at least the level
    // it ends in, then no steeper than MAX_RIVER_SLOPE (cutting a valley).
    const level = new Array<number>(n);
    for (let j = 0; j < n; j++) {
      const under = ground[j] - RIVER_BANK;
      level[j] = Math.max(joinLevel, j === 0 ? under : Math.min(level[j - 1], under));
    }
    level[n - 1] = joinLevel; // meets the sea, or the river it joins, at its level
    for (let j = n - 2; j >= 0; j--) level[j] = Math.min(level[j], level[j + 1] + MAX_RIVER_SLOPE * pts[j].distanceTo(pts[j + 1]));
    courses.push({ pts, level, half, depth, ground, mouth, tributary: r.tributary });
  }

  // Segments that can reach each tile: those within two rings of tiles.
  const segsNear: number[][] = tiles.map(() => []);
  const segs: { c: number; j: number }[] = [];
  courses.forEach((c, ci) => {
    for (let j = 0; j + 1 < c.pts.length; j++) {
      const k = segs.length;
      segs.push({ c: ci, j });
      const mid = c.pts[j].clone().add(c.pts[j + 1]).normalize();
      const t0 = locate(globe, mid, hint).t;
      hint = t0;
      const near = new Set([t0]);
      for (const nb of tiles[t0].neighbors) { near.add(nb); for (const nn of tiles[nb].neighbors) near.add(nn); }
      for (const t of near) segsNear[t].push(k);
    }
  });
  const bank = new Float32Array(V);
  const riverGap = new Float32Array(V).fill(Infinity); // distance from the river's water edge
  const riverW = new Float32Array(V); // how much the water here is a river's (vs the sea it runs into)
  const flowVec = new Float32Array(V * 3);
  const seg = new THREE.Vector3(), rel = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (let v = 0; v < V; v++) {
    const list = segsNear[topo.tile[v]];
    if (list.length === 0) continue;
    dirOf(v, d);
    let carve = Infinity, bestDist = Infinity, bestLevel = 0, bestHalf = 0, bestSeg = -1;
    for (const k of list) {
      const { c, j } = segs[k];
      const course = courses[c];
      const a = course.pts[j], b = course.pts[j + 1];
      seg.subVectors(b, a);
      const len2 = seg.lengthSq();
      const u = len2 > 0 ? Math.min(1, Math.max(0, rel.subVectors(d, a).dot(seg) / len2)) : 0;
      const dist = tmp.copy(a).addScaledVector(seg, u).distanceTo(d);
      const lv = course.level[j] + (course.level[j + 1] - course.level[j]) * u;
      const w = course.half[j] + (course.half[j + 1] - course.half[j]) * u;
      const dp = course.depth[j] + (course.depth[j + 1] - course.depth[j]) * u;
      // Channel: a rounded bed under the water, steep banks, then the valley.
      // The valley only cuts down to about the ground the river runs on: hills
      // and mountains beside a river keep their shape.
      let profile: number;
      if (dist < w) profile = lv - dp * (1 - (dist / w) ** 2);
      else {
        const x = dist - w;
        profile = lv + Math.min(K_BANK * x, BANK_H + K_VALLEY * x);
        const g = course.ground[j] + (course.ground[j + 1] - course.ground[j]) * u;
        // Valleys stay narrow: none beyond half a tile radius from the river.
        const keep = Math.max(smoothstep(g, g + 0.002, profile), smoothstep(0.25 * r0, 0.5 * r0, x));
        if (keep >= 1) continue;
        if (keep > 0) profile = Math.max(profile, height[v]) * keep + profile * (1 - keep);
      }
      carve = Math.min(carve, profile);
      if (dist < bestDist) { bestDist = dist; bestLevel = lv; bestHalf = w; bestSeg = k; }
    }
    if (carve < Infinity) height[v] = smin(height[v], carve, 0.00025);
    if (bestSeg >= 0) riverGap[v] = bestDist - bestHalf;
    if (bestSeg >= 0 && bestDist < bestHalf + MARGIN) {
      bank[v] = 1 - smoothstep(bestHalf, bestHalf + 0.3 * r0, bestDist);
      if (bestLevel >= water[v]) {
        // Above the water it runs into, the ground beside it stays just above it (no spills).
        const above = water[v] === NONE ? 1 : bestLevel - water[v];
        water[v] = bestLevel;
        source[v] = 1;
        if (above > 1e-6 && bestDist > bestHalf) height[v] = Math.max(height[v], bestLevel + 0.0001 * smoothstep(bestHalf, 1.6 * bestHalf, bestDist));
        // Rivers fade into the sea where they reach its level.
        riverW[v] = smoothstep(0, 0.0008, above);
        const { c, j } = segs[bestSeg];
        const course = courses[c];
        seg.subVectors(course.pts[j + 1], course.pts[j]).normalize();
        const speed = (0.6 + 0.6 * (course.half[j] / r0 - 0.06) / 0.08) * (1 - smoothstep(bestHalf, bestHalf + MARGIN, bestDist));
        flowVec[v * 3] = seg.x * speed; flowVec[v * 3 + 1] = seg.y * speed; flowVec[v * 3 + 2] = seg.z * speed;
      }
    }
  }

  // ---- 4. pools: away from the coast and from rivers (no steps between waters) ----
  {
    const fp = 1 / (0.42 * r0);
    for (let v = 0; v < V; v++) {
      const q = poolQ[v];
      if (q <= 0.25) continue;
      dirOf(v, d);
      // Filled to just under the ground they are cut into, which descends
      // toward a shore like the land around it.
      const lvl = shoreLevel[v] + (poolLvl[v] - shoreLevel[v]) * ramp[v];
      const nearRiver = smoothstep(MARGIN, MARGIN + 0.25 * r0, riverGap[v]);
      if (nearRiver <= 0) continue;
      const clear = smoothstep(0.15 * r0, 0.4 * r0, coast[v]) * nearRiver;
      let p: number;
      if (poolPond[v] > 0.5) {
        // Oasis: one pond around the tile center.
        const c = tiles[topo.tile[v]].center;
        const r = c.distanceTo(d) / r0 + 0.12 * noise.noise(d.x * fp, d.y * fp, d.z * fp);
        p = smoothstep(0.42, 0.3, r);
      } else {
        const n = noise.fbm(d.x * fp + 7.3, d.y * fp, d.z * fp - 2.1, 3);
        p = smoothstep(poolThr[v] - 0.07, poolThr[v] + 0.07, n);
      }
      const pw = p * smoothstep(0.45, 0.85, q) * clear;
      const flat = lvl + BANK_H - (BANK_H + POOL_DEPTH) * pw + 0.00008 * noise.noise(d.x * fp * 3, d.y * fp * 3, d.z * fp * 3);
      let h = height[v] + (flat - height[v]) * smoothstep(0.25, 0.6, q) * clear;
      if (q > 0.3) {
        // Outside the pools the ground stays above their water, so every pool
        // has a rim of dry ground and no water spills or slopes away.
        if (pw < 0.02) h = Math.max(h, lvl + 0.0001);
        if (lvl >= water[v]) { water[v] = lvl; source[v] = 2; }
      }
      height[v] = h;
    }
  }

  // ---- water look per vertex: deep color and murk ----
  const tint = new Float32Array(V * 4);
  const ocean = tintRGB(SEA_TINT.ocean), lakeC = tintRGB(SEA_TINT.lake), river = tintRGB(RIVER_TINT);
  const c = new THREE.Color();
  for (let v = 0; v < V; v++) {
    if (source[v] === 2) { tint.set(poolTint.subarray(v * 4, v * 4 + 4), v * 4); continue; }
    const rw = source[v] === 1 ? riverW[v] : 0;
    c.copy(ocean).lerp(lakeC, lake[v]).lerp(river, rw);
    tint[v * 4] = c.r; tint[v * 4 + 1] = c.g; tint[v * 4 + 2] = c.b;
    const sea = SEA_TINT.ocean.murk + (SEA_TINT.lake.murk - SEA_TINT.ocean.murk) * lake[v];
    tint[v * 4 + 3] = sea + (RIVER_TINT.murk - sea) * rw;
  }

  return {
    fields: {
      height, water,
      ground: { bank },
      water3d: [{ name: 'tint', itemSize: 4, data: tint }, { name: 'flow', itemSize: 3, data: flowVec }],
    },
    coast,
    rivers: courses,
  };
}

// Smooth minimum: like min(a, b), rounded where they are within k.
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Signed distance along the surface to where `wet` crosses 1/2 (wet < 1/2
// is positive), up to `cap`, and the level of the water at that nearest
// shore point (`level` is each vertex's painted water level; water vertices
// keep their own). Each crossing point on a mesh edge seeds both ends; the
// nearest seed then spreads over the mesh (every vertex keeps the seed point
// itself, so distances stay straight-line, not grid paths).
function coastDistance(topo: Topology, wet: Float32Array, level: Float32Array, cap: number): { dist: Float32Array; level: Float32Array } {
  const V = topo.V, dir = topo.dir;
  const dist = new Float64Array(V).fill(cap);
  const src = new Float32Array(V * 3);
  const lvl = Float32Array.from(level);
  const heap = new MinHeap();
  const offer = (v: number, x: number, y: number, z: number, l: number) => {
    const dd = Math.hypot(dir[v * 3] - x, dir[v * 3 + 1] - y, dir[v * 3 + 2] - z);
    if (dd >= dist[v]) return;
    dist[v] = dd;
    src[v * 3] = x; src[v * 3 + 1] = y; src[v * 3 + 2] = z;
    if (wet[v] < 0.5) lvl[v] = l;
    heap.push(dd, v);
  };
  for (let u = 0; u < V; u++) {
    const wu = wet[u] >= 0.5;
    for (let k = topo.adjStart[u]; k < topo.adjStart[u + 1]; k++) {
      const v = topo.adj[k];
      if (v <= u || (wet[v] >= 0.5) === wu) continue;
      const t = (0.5 - wet[u]) / (wet[v] - wet[u]);
      const x = dir[u * 3] + (dir[v * 3] - dir[u * 3]) * t;
      const y = dir[u * 3 + 1] + (dir[v * 3 + 1] - dir[u * 3 + 1]) * t;
      const z = dir[u * 3 + 2] + (dir[v * 3 + 2] - dir[u * 3 + 2]) * t;
      const l = wu ? level[u] : level[v];
      offer(u, x, y, z, l);
      offer(v, x, y, z, l);
    }
  }
  while (heap.size) {
    const [dd, u] = heap.pop();
    if (dd > dist[u]) continue;
    for (let k = topo.adjStart[u]; k < topo.adjStart[u + 1]; k++) offer(topo.adj[k], src[u * 3], src[u * 3 + 1], src[u * 3 + 2], lvl[u]);
  }
  return { dist: Float32Array.from(dist, (dd, v) => (wet[v] >= 0.5 ? -dd : dd)), level: lvl };
}

// Level of each open-water tile: the sea at sea level; each lake just under
// the lowest land around it (all tiles of a lake share one level).
export function waterLevels(globe: Globe, map: MapData, looks: readonly TileLook[], relief: Relief): Float32Array {
  const { tiles } = globe;
  const level = new Float32Array(tiles.length).fill(SEA_LEVEL);
  const seen = new Uint8Array(tiles.length);
  for (const start of tiles) {
    if (map.biome[start.id] !== 'lake' || seen[start.id]) continue;
    const lake: number[] = [start.id];
    seen[start.id] = 1;
    let low = Infinity;
    for (let k = 0; k < lake.length; k++) {
      for (const nb of tiles[lake[k]].neighbors) {
        if (map.biome[nb] === 'lake') { if (!seen[nb]) { seen[nb] = 1; lake.push(nb); } }
        else if (!looks[nb].water) low = Math.min(low, relief.base[nb]);
      }
    }
    const l = Number.isFinite(low) ? Math.max(SEA_LEVEL + 0.001, low - LAKE_BANK) : SEA_LEVEL;
    for (const t of lake) level[t] = l;
  }
  return level;
}

class MinHeap {
  private keys = new Float64Array(1024);
  private vals = new Int32Array(1024);
  size = 0;

  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2); k.set(this.keys); this.keys = k;
      const v = new Int32Array(this.size * 2); v.set(this.vals); this.vals = v;
    }
    const K = this.keys, Vv = this.vals;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= key) break;
      K[i] = K[p]; Vv[i] = Vv[p];
      i = p;
    }
    K[i] = key; Vv[i] = val;
  }

  pop(): [number, number] {
    const K = this.keys, Vv = this.vals;
    const top: [number, number] = [K[0], Vv[0]];
    const n = --this.size;
    const key = K[n], val = Vv[n];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const m = l + 1 < n && K[l + 1] < K[l] ? l + 1 : l;
      if (K[m] >= key) break;
      K[i] = K[m]; Vv[i] = Vv[m];
      i = m;
    }
    K[i] = key; Vv[i] = val;
    return top;
  }
}
