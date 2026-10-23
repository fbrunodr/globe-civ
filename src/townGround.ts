// The ground of built-up tiles, fine enough to cut a house's floor into
// (render.ts). The terrain mesh is coarse there (a triangle is wider than
// a house), so over built tiles its triangles are hidden and drawn instead
// subdivided: every attribute of the fine vertices interpolated from the
// coarse triangle they lie in, so untouched it looks exactly the same,
// and cut where houses dig their floors in (terraform.ts padCuts). Made
// anew from the coarse terrain whenever the town changes: nothing to undo.

import * as THREE from 'three';
import { padCuts, type FloorPad } from './terraform.ts';

export interface TownGround {
  geometry: THREE.BufferGeometry;
  // Each fine vertex: the 3 coarse vertices it is made from and their weights.
  src: Uint32Array;
  w: Float32Array;
  // The coarse triangles it replaces (hidden in the terrain mesh).
  hidden: Set<number>;
}

// Copies attribute `name` of the coarse geometry onto the fine one, by the weights.
export function interpolate(coarse: THREE.BufferGeometry, g: TownGround, name: string): void {
  const from = coarse.getAttribute(name), to = g.geometry.getAttribute(name) as THREE.BufferAttribute;
  const k = from.itemSize, out = to.array as Float32Array, n = g.w.length / 3;
  const get = [from.getX.bind(from), from.getY.bind(from), from.getZ.bind(from), from.getW.bind(from)];
  for (let v = 0; v < n; v++) {
    for (let c = 0; c < k; c++) {
      let s = 0;
      for (let q = 0; q < 3; q++) s += g.w[v * 3 + q]! * get[c]!(g.src[v * 3 + q]!);
      out[v * k + c] = s;
    }
  }
  to.needsUpdate = true;
}

export interface TownGroundSpec {
  coarse: THREE.BufferGeometry;    // the terrain mesh (indexed, split per fan)
  triToTile: Int32Array;           // coarse triangle -> tile
  built: ReadonlySet<number>;      // the tiles to redraw
  splits: (t: number) => number;   // subdivisions of a coarse triangle's edge on tile t
  group: (v: number) => number;    // which coarse vertices may share a fine one (their fan)
  pads: readonly FloorPad[];       // the floors to cut in
  D: number;                       // radians per tile step
  // Fine vertices that must not move: on an edge toward a tile not redrawn
  // (it keeps the coarse ground there; moving them would open a crack).
}

export function buildTownGround(s: TownGroundSpec): TownGround {
  const idx = s.coarse.getIndex()!, pos = s.coarse.getAttribute('position');
  const hidden = new Set<number>();
  const src: number[] = [], w: number[] = [], index: number[] = [];
  const at = new Map<string, number>();
  const edgeUse = new Map<string, number>(); // coarse edges (by position) used by redrawn triangles
  const pkey = (x: number, y: number, z: number) => `${Math.round(x * 1e7)},${Math.round(y * 1e7)},${Math.round(z * 1e7)}`;
  const P = (v: number) => [pos.getX(v), pos.getY(v), pos.getZ(v)] as const;
  const T = idx.count / 3;
  // Coarse edges shared with triangles not redrawn: their fine points stay put.
  const outerEdges = new Set<string>();
  const ekey = (a: number, b: number) => { const ka = pkey(...P(a)), kb = pkey(...P(b)); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };
  for (let tr = 0; tr < T; tr++) {
    const mine = s.built.has(s.triToTile[tr]!);
    for (let c = 0; c < 3; c++) {
      const k = ekey(idx.getX(tr * 3 + c), idx.getX(tr * 3 + (c + 1) % 3));
      edgeUse.set(k, (edgeUse.get(k) ?? 0) | (mine ? 1 : 2));
    }
  }
  for (const [k, u] of edgeUse) if (u & 2) outerEdges.add(k);
  const pinned: boolean[] = [];
  for (let tr = 0; tr < T; tr++) {
    const t = s.triToTile[tr]!;
    if (!s.built.has(t)) continue;
    hidden.add(tr);
    const a = idx.getX(tr * 3), b = idx.getX(tr * 3 + 1), c = idx.getX(tr * 3 + 2), n = s.splits(t);
    const pa = P(a), pb = P(b), pc = P(c), grp = s.group(a);
    const onOuter = [ekey(a, b), ekey(b, c), ekey(c, a)].map((k) => outerEdges.has(k));
    const id = (i: number, j: number) => {
      const wa = 1 - (i + j) / n, wb = i / n, wc = j / n;
      const x = wa * pa[0] + wb * pb[0] + wc * pc[0], y = wa * pa[1] + wb * pb[1] + wc * pc[1], z = wa * pa[2] + wb * pb[2] + wc * pc[2];
      const key = `${grp}|${pkey(x, y, z)}`;
      let v = at.get(key);
      // (On an edge toward the coarse ground: ab when j = 0, bc when i + j = n, ca when i = 0.)
      const pin = (j === 0 && onOuter[0]!) || (i + j === n && onOuter[1]!) || (i === 0 && onOuter[2]!);
      if (v === undefined) {
        v = w.length / 3;
        at.set(key, v);
        src.push(a, b, c); w.push(wa, wb, wc);
        pinned.push(pin);
      } else if (pin) pinned[v] = true;
      return v;
    };
    for (let j = 0; j < n; j++) for (let i = 0; i + j < n; i++) {
      const v0 = id(i, j), v1 = id(i + 1, j), v2 = id(i, j + 1);
      index.push(v0, v1, v2);
      if (i + j + 1 < n) index.push(v1, id(i + 1, j + 1), v2);
    }
  }
  const V = w.length / 3;
  const g: TownGround = { geometry: new THREE.BufferGeometry(), src: Uint32Array.from(src), w: Float32Array.from(w), hidden };
  for (const name of Object.keys(s.coarse.attributes)) {
    g.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(V * s.coarse.getAttribute(name).itemSize), s.coarse.getAttribute(name).itemSize));
    interpolate(s.coarse, g, name);
  }
  g.geometry.setIndex(index);
  // The floors cut in: from the heights as interpolated (the coarse ground).
  const p = g.geometry.getAttribute('position') as THREE.BufferAttribute, pa = p.array as Float32Array;
  const dirs = new Float32Array(V * 3), heights = new Float32Array(V);
  for (let v = 0; v < V; v++) {
    const r = Math.hypot(pa[v * 3]!, pa[v * 3 + 1]!, pa[v * 3 + 2]!);
    for (let c = 0; c < 3; c++) dirs[v * 3 + c] = pa[v * 3 + c]! / r;
    heights[v] = r - 1;
  }
  // (Fine vertices in buckets, to find those near a floor.)
  const cell = 0.05 * s.D, bucket = new Map<string, number[]>();
  const bkey = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let v = 0; v < V; v++) { const k = bkey(dirs[v * 3]!, dirs[v * 3 + 1]!, dirs[v * 3 + 2]!); const l = bucket.get(k); if (l) l.push(v); else bucket.set(k, [v]); }
  const cut = padCuts(dirs, heights, s.pads, s.D, (pd) => {
    const reach = Math.hypot(Math.hypot(pd.X.x, pd.X.y, pd.X.z), Math.hypot(pd.Z.x, pd.Z.y, pd.Z.z)) + 0.04 * s.D, out: number[] = [];
    const lo = [pd.at.x - reach, pd.at.y - reach, pd.at.z - reach], hi = [pd.at.x + reach, pd.at.y + reach, pd.at.z + reach];
    for (let x = Math.floor(lo[0]! / cell); x <= Math.floor(hi[0]! / cell); x++) for (let y = Math.floor(lo[1]! / cell); y <= Math.floor(hi[1]! / cell); y++) for (let z = Math.floor(lo[2]! / cell); z <= Math.floor(hi[2]! / cell); z++) {
      for (const v of bucket.get(`${x},${y},${z}`) ?? []) out.push(v);
    }
    return out;
  });
  const dep = g.geometry.getAttribute('depth') as THREE.BufferAttribute | undefined;
  const moved = new Uint8Array(V);
  for (const [v, c] of cut) {
    if (pinned[v]) continue;
    const r = 1 + c.height;
    for (let k = 0; k < 3; k++) pa[v * 3 + k] = dirs[v * 3 + k]! * r;
    if (dep) dep.setX(v, dep.getX(v) + heights[v]! - c.height);
    moved[v] = 1;
  }
  // Normals: as interpolated where nothing moved; from the cut shape on
  // the cut and round it.
  const nrm = g.geometry.getAttribute('normal') as THREE.BufferAttribute;
  const sum = new Float32Array(V * 3), touched = new Uint8Array(V);
  for (let f = 0; f < index.length; f += 3) {
    const i0 = index[f]!, i1 = index[f + 1]!, i2 = index[f + 2]!;
    if (!moved[i0] && !moved[i1] && !moved[i2]) continue;
    const ax = pa[i1 * 3]! - pa[i0 * 3]!, ay = pa[i1 * 3 + 1]! - pa[i0 * 3 + 1]!, az = pa[i1 * 3 + 2]! - pa[i0 * 3 + 2]!;
    const bx = pa[i2 * 3]! - pa[i0 * 3]!, by = pa[i2 * 3 + 1]! - pa[i0 * 3 + 1]!, bz = pa[i2 * 3 + 2]! - pa[i0 * 3 + 2]!;
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    for (const i of [i0, i1, i2]) { sum[i * 3] += nx; sum[i * 3 + 1] += ny; sum[i * 3 + 2] += nz; touched[i] = 1; }
  }
  for (let v = 0; v < V; v++) {
    if (!touched[v]) continue;
    // (Faces wound as the terrain's: their normal points out of the globe.)
    let x = sum[v * 3]!, y = sum[v * 3 + 1]!, z = sum[v * 3 + 2]!;
    if (x * dirs[v * 3]! + y * dirs[v * 3 + 1]! + z * dirs[v * 3 + 2]! < 0) { x = -x; y = -y; z = -z; }
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(v, x / l, y / l, z / l);
  }
  p.needsUpdate = true; nrm.needsUpdate = true;
  g.geometry.computeBoundingSphere();
  return g;
}
