import * as THREE from 'three';
import type { Globe } from './goldberg.ts';

// Extra per-vertex data that depends on the fan a vertex belongs to (e.g.
// the painting coordinates): fan id = position of (t, i) in tile order.
export interface FanAttribute {
  name: string;
  itemSize: number;
  // Optional: expose the data as several shader attributes (each at most 4
  // wide) sharing one interleaved buffer, instead of one attribute `name`.
  views?: { name: string; offset: number; size: number }[];
  // delta: the warp field at the vertex (TerrainSpec.warp), or zeros.
  compute(fan: number, t: number, i: number, dir: THREE.Vector3, delta: ArrayLike<number>, out: Float32Array, offset: number): void;
}

export interface TerrainSpec {
  heightAt(t: number, i: number, wa: number, wb: number, dir: THREE.Vector3): number;
  // Subdivisions per fan for each tile: `coarse` or 2 × coarse (fine tiles
  // get evenly spaced rings, for smooth relief).
  fine(t: number): boolean;
  fanAttributes: FanAttribute[];
  // A smooth vector field evaluated once per vertex and handed to fan attributes.
  warp?(dir: THREE.Vector3, out: number[]): void;
}

export interface TerrainMesh {
  geometry: THREE.BufferGeometry;
  triToTile: Int32Array;      // triangle index -> tile id
  vertTiles: Int32Array;      // 3 tile ids per vertex (-1 padded); >1 on shared boundaries
  vertDir: Float32Array;      // unit direction per vertex (xyz)
  vertRadius: Float32Array;   // distance from the globe center per vertex
  vertAO: Float32Array;       // baked ambient occlusion per vertex
  tileVerts: Int32Array[];    // all vertices that touch a tile
  centerRadius: Float32Array; // surface radius at each tile center
  // Surface point inside tile t, in fan i (between corners i and i+1), at
  // barycentric weights wa (toward corner i) and wb (toward corner i+1).
  samplePoint(t: number, i: number, wa: number, wb: number): THREE.Vector3;
}

// Lattice rings are packed toward the tile edge so the relief can ease into
// the neighbors in a band while the tile's middle stays calm.
const warpRing = (r: number) => 1 - Math.pow(1 - r, 1.8);

// Builds the globe surface. Each tile is split into fans (one per corner pair)
// and each fan into S² small triangles, S = coarse or 2 × coarse. Where a
// fine tile meets a coarse one, the fine tile's extra edge vertices sit
// exactly on the coarse edge, so the surface stays watertight.
//
// The surface is first built with vertices shared between fans and tiles, so
// it is watertight and normals and ambient occlusion come out smooth. Then
// every fan gets its own copy of its vertices, because the painting needs
// per-fan data (which neighbors a pixel can be painted by).
export function buildTerrainMesh(globe: Globe, spec: TerrainSpec, coarse: number): TerrainMesh {
  const { tiles, tris, triCenters } = globe;

  const dirOf = (t: number, i: number, wa: number, wb: number) => {
    const tile = tiles[t];
    const k = tile.corners.length;
    return new THREE.Vector3()
      .addScaledVector(tile.center, 1 - wa - wb)
      .addScaledVector(triCenters[tile.corners[i]], wa)
      .addScaledVector(triCenters[tile.corners[(i + 1) % k]], wb)
      .normalize();
  };
  const radiusAt = (t: number, i: number, wa: number, wb: number, dir: THREE.Vector3) => 1 + spec.heightAt(t, i, wa, wb, dir);

  // ---- shared mesh ----
  const positions: number[] = [];
  const dirs: number[] = [];
  const radii: number[] = [];
  const rings: number[] = [];
  const vTiles: number[] = [];
  const index: number[] = [];
  const triFan: number[] = [];
  const triToTile: number[] = [];
  const shared = new Map<string, number>();
  const centerRadius = new Float32Array(tiles.length);

  const addVertex = (t: number, i: number, wa: number, wb: number, owners: readonly number[], ring: number): number => {
    const dir = dirOf(t, i, wa, wb);
    const r = radiusAt(t, i, wa, wb, dir);
    const idx = radii.length;
    positions.push(dir.x * r, dir.y * r, dir.z * r);
    dirs.push(dir.x, dir.y, dir.z);
    radii.push(r);
    rings.push(ring);
    vTiles.push(owners[0] ?? -1, owners[1] ?? -1, owners[2] ?? -1);
    return idx;
  };
  const sharedVertex = (key: string, make: () => number): number => {
    let v = shared.get(key);
    if (v === undefined) { v = make(); shared.set(key, v); }
    return v;
  };

  const fineOf = tiles.map((t) => spec.fine(t.id));
  const SF = coarse * 2;
  const grid: number[][] = Array.from({ length: SF + 1 }, () => new Array<number>(SF + 1).fill(-1));
  const tJunctions: [number, string, string][] = []; // vertex, coarse neighbors on its edge
  let fan = 0;
  for (const tile of tiles) {
    const t = tile.id;
    const k = tile.corners.length;
    const S = fineOf[t] ? SF : coarse;
    for (let i = 0; i < k; i++, fan++) {
      const ci = tile.corners[i], cj = tile.corners[(i + 1) % k], nb = tile.neighbors[i];
      const lo = Math.min(ci, cj), hi = Math.max(ci, cj);
      const mixed = fineOf[t] !== fineOf[nb];
      for (let a = 0; a <= S; a++) {
        for (let b = 0; a + b <= S; b++) {
          const lin = (a + b) / S;
          const ring = fineOf[t] ? lin : warpRing(lin);
          const k2 = lin > 0 ? ring / lin : 0;
          const wa = (a / S) * k2, wb = (b / S) * k2;
          let v: number;
          if (a === 0 && b === 0) {
            v = sharedVertex(`t${t}`, () => addVertex(t, i, 0, 0, [t], 0));
            centerRadius[t] = radii[v];
          } else if (a + b === S) {
            if (b === 0) v = sharedVertex(`c${ci}`, () => addVertex(t, i, 1, 0, tris[ci], 1));
            else if (a === 0) v = sharedVertex(`c${cj}`, () => addVertex(t, i, 0, 1, tris[cj], 1));
            else {
              const step = ci === lo ? b : S - b;
              const make = () => addVertex(t, i, wa, wb, [t, nb], 1);
              if (!mixed) v = sharedVertex(`e${S}_${lo}_${hi}_${step}`, make);
              else if (S === coarse) v = sharedVertex(`e${coarse}_${lo}_${hi}_${step}`, make);
              else if (step % 2 === 0) v = sharedVertex(`e${coarse}_${lo}_${hi}_${step / 2}`, make);
              else {
                v = sharedVertex(`e${SF}_${lo}_${hi}_${step}`, make);
                const key = (st: number) => (st === 0 ? `c${lo}` : st === coarse ? `c${hi}` : `e${coarse}_${lo}_${hi}_${st}`);
                tJunctions.push([v, key((step - 1) / 2), key((step + 1) / 2)]);
              }
            }
          } else if (b === 0) {
            v = sharedVertex(`s${t}_${ci}_${a}`, () => addVertex(t, i, wa, 0, [t], ring));
          } else if (a === 0) {
            v = sharedVertex(`s${t}_${cj}_${b}`, () => addVertex(t, i, 0, wb, [t], ring));
          } else {
            v = addVertex(t, i, wa, wb, [t], ring);
          }
          grid[a][b] = v;
        }
      }
      for (let a = 0; a < S; a++) {
        for (let b = 0; a + b < S; b++) {
          index.push(grid[a][b], grid[a + 1][b], grid[a][b + 1]);
          triToTile.push(t); triFan.push(fan);
          if (a + b < S - 1) {
            index.push(grid[a + 1][b], grid[a + 1][b + 1], grid[a][b + 1]);
            triToTile.push(t); triFan.push(fan);
          }
        }
      }
    }
  }
  // Extra edge vertices of fine tiles sit on the coarse neighbor's edge.
  for (const [v, ka, kb] of tJunctions) {
    const a = shared.get(ka)!, b = shared.get(kb)!;
    let len = 0;
    for (let c = 0; c < 3; c++) {
      positions[v * 3 + c] = (positions[a * 3 + c] + positions[b * 3 + c]) / 2;
      len += positions[v * 3 + c] ** 2;
    }
    len = Math.sqrt(len);
    radii[v] = len;
    for (let c = 0; c < 3; c++) dirs[v * 3 + c] = positions[v * 3 + c] / len;
  }

  const sharedGeo = new THREE.BufferGeometry();
  sharedGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sharedGeo.setIndex(index);
  sharedGeo.computeVertexNormals();
  const sharedNormals = sharedGeo.getAttribute('normal').array as Float32Array;
  const sharedAO = bakeOcclusion(Float32Array.from(radii), index);

  // ---- split per fan ----
  const fanOfTile: [number, number][] = [];
  for (const tile of tiles) for (let i = 0; i < tile.corners.length; i++) fanOfTile.push([tile.id, i]);
  const copyOf = new Map<number, number>(); // fan * Vs + shared vertex -> split vertex
  const Vs = radii.length;
  const origin: number[] = [];
  const splitIndex = new Uint32Array(index.length);
  for (let tr = 0; tr < triFan.length; tr++) {
    const f = triFan[tr];
    for (let c = 0; c < 3; c++) {
      const sv = index[tr * 3 + c];
      const key = f * Vs + sv;
      let v = copyOf.get(key);
      if (v === undefined) { v = origin.length; origin.push(sv); copyOf.set(key, v); }
      splitIndex[tr * 3 + c] = v;
    }
  }
  const V = origin.length;
  const vertFan = new Int32Array(V);
  for (let tr = 0; tr < triFan.length; tr++) for (let c = 0; c < 3; c++) vertFan[splitIndex[tr * 3 + c]] = triFan[tr];

  const pick = (src: ArrayLike<number>, size: number) => {
    const out = new Float32Array(V * size);
    for (let v = 0; v < V; v++) for (let c = 0; c < size; c++) out[v * size + c] = src[origin[v] * size + c];
    return out;
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pick(positions, 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(pick(sharedNormals, 3), 3));
  geometry.setAttribute('ring', new THREE.BufferAttribute(pick(rings, 1), 1));
  const vertDir = pick(dirs, 3);
  const dir = new THREE.Vector3();
  // Warp field per shared vertex, so every copy of a vertex gets the same value.
  const sharedWarp = new Float32Array(Vs * 3);
  if (spec.warp) {
    const tmp = [0, 0, 0];
    for (let v = 0; v < Vs; v++) {
      dir.set(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2]);
      spec.warp(dir, tmp);
      sharedWarp[v * 3] = tmp[0]; sharedWarp[v * 3 + 1] = tmp[1]; sharedWarp[v * 3 + 2] = tmp[2];
    }
  }
  for (const fa of spec.fanAttributes) {
    const data = new Float32Array(V * fa.itemSize);
    for (let v = 0; v < V; v++) {
      const f = vertFan[v];
      const [t, i] = fanOfTile[f];
      dir.set(vertDir[v * 3], vertDir[v * 3 + 1], vertDir[v * 3 + 2]);
      fa.compute(f, t, i, dir, sharedWarp.subarray(origin[v] * 3, origin[v] * 3 + 3), data, v * fa.itemSize);
    }
    if (fa.views) {
      const buf = new THREE.InterleavedBuffer(data, fa.itemSize);
      for (const vw of fa.views) geometry.setAttribute(vw.name, new THREE.InterleavedBufferAttribute(buf, vw.size, vw.offset));
    } else {
      geometry.setAttribute(fa.name, new THREE.BufferAttribute(data, fa.itemSize));
    }
  }
  geometry.setIndex(new THREE.BufferAttribute(splitIndex, 1));
  geometry.computeBoundingSphere();

  const vertTiles = Int32Array.from(pick(vTiles, 3));
  const lists: number[][] = tiles.map(() => []);
  for (let v = 0; v < V; v++) {
    for (let s = 0; s < 3; s++) {
      const o = vertTiles[v * 3 + s];
      if (o >= 0) lists[o].push(v);
    }
  }

  return {
    geometry,
    triToTile: Int32Array.from(triToTile),
    vertTiles,
    vertDir,
    vertRadius: pick(radii, 1),
    vertAO: pick(sharedAO, 1),
    tileVerts: lists.map((l) => Int32Array.from(l)),
    centerRadius,
    samplePoint(t, i, wa, wb) {
      const d = dirOf(t, i, wa, wb);
      return d.multiplyScalar(radiusAt(t, i, wa, wb, d));
    },
  };
}

// Ambient occlusion from the terrain's shape: each vertex is compared with a
// blurred copy of the height field, so valleys and hollows darken and ridges
// catch a little extra light. Baked once; costs nothing per frame.
function bakeOcclusion(R: Float32Array, index: readonly number[]): Float32Array {
  const V = R.length;
  // Vertex adjacency (compressed rows) from the triangle list.
  const deg = new Uint32Array(V + 1);
  for (let i = 0; i < index.length; i += 3) for (let k = 0; k < 3; k++) deg[index[i + k] + 1] += 2;
  for (let v = 0; v < V; v++) deg[v + 1] += deg[v];
  const adj = new Uint32Array(deg[V]);
  const fill = deg.slice(0, V);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    adj[fill[a]++] = b; adj[fill[a]++] = c;
    adj[fill[b]++] = a; adj[fill[b]++] = c;
    adj[fill[c]++] = a; adj[fill[c]++] = b;
  }
  let smooth = Float32Array.from(R);
  for (let iter = 0; iter < 4; iter++) {
    const next = new Float32Array(V);
    for (let v = 0; v < V; v++) {
      let sum = 0;
      for (let j = deg[v]; j < deg[v + 1]; j++) sum += smooth[adj[j]];
      next[v] = sum / Math.max(1, deg[v + 1] - deg[v]);
    }
    smooth = next;
  }
  const ao = new Float32Array(V);
  for (let v = 0; v < V; v++) ao[v] = 1 - Math.min(0.4, Math.max(-0.1, (smooth[v] - R[v]) * 110));
  return ao;
}
