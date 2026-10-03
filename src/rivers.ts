// Rivers run along the edges between tiles (as in Civilization V). The edge
// network is the "corner graph": every tile corner is a node, and two corners
// are linked by the tile border between them. A corner is one triangle of the
// geodesic grid, so corner ids are indices into globe.tris.
//
// Water is routed with a priority flood from every corner that touches water:
// each land corner drains to the neighbor it was reached from, so following
// the drainage always ends at a coast or a lake, never in a loop. Rain is then
// accumulated downstream, and corners carrying enough water become rivers.

import type { Globe } from './goldberg.ts';
import type { BiomeKey } from './terrain.ts';
import { isWaterKey } from './mapRules.ts';

export interface River {
  // Corners from source to mouth. The last corner touches water (a mouth) or
  // lies on another river (a tributary's confluence).
  corners: number[];
  // Water carried at each corner (same length as corners), for drawing width.
  flow: number[];
  tributary: boolean;
}

export interface CornerGraph {
  // 3 neighbor corners per corner (-1 if none), and for each link the two
  // tiles whose shared border it is.
  neighbors: Int32Array;
  borderTiles: Int32Array; // 6 per corner: [tileA, tileB] for each of the 3 links
}

const graphs = new WeakMap<Globe, CornerGraph>();

export function cornerGraph(globe: Globe): CornerGraph {
  let g = graphs.get(globe);
  if (g) return g;
  const { tris } = globe;
  const N = globe.tiles.length;
  const T = tris.length;
  const byEdge = new Map<number, number>();
  const neighbors = new Int32Array(T * 3).fill(-1);
  const borderTiles = new Int32Array(T * 6).fill(-1);
  const link = (c: number, other: number, a: number, b: number) => {
    for (let k = 0; k < 3; k++) {
      if (neighbors[c * 3 + k] === -1) {
        neighbors[c * 3 + k] = other;
        borderTiles[c * 6 + k * 2] = a;
        borderTiles[c * 6 + k * 2 + 1] = b;
        return;
      }
    }
  };
  for (let c = 0; c < T; c++) {
    const [x, y, z] = tris[c];
    for (const [a, b] of [[x, y], [y, z], [z, x]] as const) {
      const key = Math.min(a, b) * N + Math.max(a, b);
      const other = byEdge.get(key);
      if (other === undefined) byEdge.set(key, c);
      else { link(c, other, a, b); link(other, c, a, b); }
    }
  }
  g = { neighbors, borderTiles };
  graphs.set(globe, g);
  return g;
}

// The two tiles on either side of the border between corners c1 and c2, or null.
export function borderBetween(globe: Globe, c1: number, c2: number): [number, number] | null {
  const g = cornerGraph(globe);
  for (let k = 0; k < 3; k++) {
    if (g.neighbors[c1 * 3 + k] === c2) return [g.borderTiles[c1 * 6 + k * 2], g.borderTiles[c1 * 6 + k * 2 + 1]];
  }
  return null;
}

export interface RiverOptions {
  // Share of land corners whose accumulated water is too little for a river.
  flowQuantile: number;
  minMainEdges: number;      // shorter rivers reaching the sea are dropped
  minTributaryEdges: number; // shorter tributaries are dropped
}

export const RIVER_DEFAULTS: RiverOptions = { flowQuantile: 0.93, minMainEdges: 4, minTributaryEdges: 2 };

export interface RiverNetwork {
  rivers: River[];
  cornerElevation: Float32Array; // mean elevation of each corner's 3 tiles
}

export function generateRivers(globe: Globe, biome: readonly BiomeKey[], elevation: Float32Array,
  rainfall: Float32Array, opts: RiverOptions = RIVER_DEFAULTS): RiverNetwork {
  const { tris } = globe;
  const T = tris.length;
  const g = cornerGraph(globe);
  const elev = new Float32Array(T);
  const rain = new Float32Array(T);
  const sink = new Uint8Array(T);
  for (let c = 0; c < T; c++) {
    const [a, b, d] = tris[c];
    elev[c] = (elevation[a] + elevation[b] + elevation[d]) / 3;
    // Ice sheets lock their water away; no rivers start on them.
    const r = (t: number) => (biome[t] === 'iceSheet' ? 0 : rainfall[t]);
    rain[c] = (r(a) + r(b) + r(d)) / 3;
    if (isWaterKey(biome[a]) || isWaterKey(biome[b]) || isWaterKey(biome[d])) sink[c] = 1;
  }

  // Priority flood from every water-touching corner, lowest first.
  const parent = new Int32Array(T).fill(-1);
  const visited = new Uint8Array(T);
  const order: number[] = [];
  const heap = new CornerHeap();
  for (let c = 0; c < T; c++) if (sink[c]) { visited[c] = 1; heap.push(elev[c], c); }
  while (heap.size) {
    const [level, c] = heap.pop();
    order.push(c);
    for (let k = 0; k < 3; k++) {
      const n = g.neighbors[c * 3 + k];
      if (n < 0 || visited[n]) continue;
      visited[n] = 1;
      parent[n] = c;
      heap.push(Math.max(elev[n], level + 1e-6), n);
    }
  }

  // Accumulate rain downstream (reverse flood order visits children first).
  const flow = Float32Array.from(rain);
  for (let i = order.length - 1; i >= 0; i--) {
    const c = order[i];
    if (parent[c] >= 0) flow[parent[c]] += flow[c];
  }

  const landFlows = order.filter((c) => !sink[c]).map((c) => flow[c]).sort((x, y) => x - y);
  const threshold = landFlows[Math.min(landFlows.length - 1, Math.floor(opts.flowQuantile * landFlows.length))] ?? Infinity;
  const isRiver = (c: number) => !sink[c] && flow[c] >= threshold;

  // Heads: river corners no upstream river corner drains into.
  const fed = new Uint8Array(T);
  for (let c = 0; c < T; c++) if (isRiver(c) && parent[c] >= 0) fed[parent[c]] = 1;
  const depth = (c: number) => { let d = 0; for (let x = c; x >= 0 && !sink[x]; x = parent[x]) d++; return d; };
  const heads: number[] = [];
  for (let c = 0; c < T; c++) if (isRiver(c) && !fed[c]) heads.push(c);
  // Longest courses first, so main stems claim the trunk and others join them.
  heads.sort((a, b) => depth(b) - depth(a) || a - b);

  const onRiver = new Uint8Array(T);
  const rivers: River[] = [];
  for (const h of heads) {
    const corners: number[] = [];
    let c = h;
    while (c >= 0 && !onRiver[c] && !sink[c]) { corners.push(c); c = parent[c]; }
    if (c < 0) continue;
    corners.push(c); // the mouth, or the confluence with an earlier river
    // A river must start higher than it ends: a head sitting in a hollow
    // would really be a pond, so the course starts at its first corner
    // above the end.
    const endElev = elev[c];
    const firstHigh = corners.findIndex((x) => elev[x] > endElev);
    if (firstHigh < 0 || firstHigh >= corners.length - 1) continue;
    corners.splice(0, firstHigh);
    const tributary = !sink[c];
    const edges = corners.length - 1;
    if (edges < (tributary ? opts.minTributaryEdges : opts.minMainEdges)) continue;
    for (const x of corners.slice(0, -1)) onRiver[x] = 1;
    rivers.push({ corners, flow: corners.map((x) => flow[x]), tributary });
  }
  return { rivers, cornerElevation: elev };
}

class CornerHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number { return this.keys.length; }

  push(key: number, val: number): void {
    const k = this.keys, v = this.vals;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] < k[i] || (k[p] === k[i] && v[p] <= v[i])) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }

  pop(): [number, number] {
    const k = this.keys, v = this.vals;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && (k[l] < k[m] || (k[l] === k[m] && v[l] < v[m]))) m = l;
        if (r < k.length && (k[r] < k[m] || (k[r] === k[m] && v[r] < v[m]))) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
