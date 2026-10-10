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

// Per-vertex data of the surface, on the shared (watertight) vertices.
export interface SurfaceFields {
  height: Float32Array; // ground height above radius 1
  water: Float32Array;  // water level above radius 1 (water shows where water > height)
  // Extra float attributes for the ground mesh, by name, itemSize 1.
  ground: Record<string, Float32Array>;
  // Extra attributes for the water mesh, by name.
  water3d: { name: string; itemSize: number; data: Float32Array }[];
}

export interface TerrainSpec {
  // Subdivisions per fan for each tile, as a multiple of `coarse` (1, 2 or 4).
  // Only coarse tiles pack their rings toward the edge.
  level(t: number): 1 | 2 | 4;
  // All the surface fields, computed once the vertices are known.
  surface(topo: Topology): SurfaceFields;
  fanAttributes: FanAttribute[];
  // A smooth vector field evaluated once per vertex and handed to fan attributes.
  warp?(dir: THREE.Vector3, out: number[]): void;
}

// The surface's vertices before any height is known: where each one is and
// which fan created it, so fields can be computed per vertex.
export interface Topology {
  V: number;
  dir: Float32Array;       // unit direction (xyz)
  tile: Int32Array;        // creating tile
  fanIndex: Uint8Array;    // creating fan i within that tile
  wa: Float32Array;        // barycentric weights toward corners i, i+1
  wb: Float32Array;
  fan: Int32Array;         // creating fan id (fanStart[tile] + i)
  owners: Int32Array;      // 3 tile ids per vertex (-1 padded)
  warp: Float32Array;      // the warp field per vertex (xyz), zeros without spec.warp
  index: Uint32Array;      // triangles
  // Neighbors of each vertex (compressed rows): adj[adjStart[v] .. adjStart[v+1]).
  adjStart: Uint32Array;
  adj: Uint32Array;
  // The triangle under fan point (t, i, wa, wb): vertex ids and weights.
  sample(t: number, i: number, wa: number, wb: number, out: LatticeSample): LatticeSample;
}

export interface LatticeSample { v: [number, number, number]; w: [number, number, number] }
export const newSample = (): LatticeSample => ({ v: [0, 0, 0], w: [1, 0, 0] });

// A point of the globe, as fan coordinates.
export interface FanPoint { t: number; i: number; wa: number; wb: number }

export interface TerrainMesh {
  geometry: THREE.BufferGeometry;
  water: THREE.BufferGeometry; // the water surface: triangles where water stands above the ground
  waterVerts: Int32Array;      // shared vertex id of each water vertex
  triToTile: Int32Array;       // triangle index -> tile id
  vertTiles: Int32Array;       // 3 tile ids per vertex (-1 padded); >1 on shared boundaries
  vertDir: Float32Array;       // unit direction per vertex (xyz)
  vertRadius: Float32Array;    // distance from the globe center per vertex
  vertAO: Float32Array;        // baked ambient occlusion per vertex
  tileVerts: Int32Array[];     // all vertices that touch a tile
  centerRadius: Float32Array;  // ground or water surface radius at each tile center, whichever is higher
  topo: Topology;
  fields: SurfaceFields;       // final, on the shared vertices
  // Ground and water radius at a fan point, as drawn.
  at(t: number, i: number, wa: number, wb: number): { ground: number; water: number };
  // Ground point inside tile t, in fan i, at barycentric weights wa, wb.
  samplePoint(t: number, i: number, wa: number, wb: number): THREE.Vector3;
  // Moves shared vertices to new ground heights (e.g. a summit levelled for a
  // wonder); `up` (0..1) turns their normal toward straight up. Everything
  // drawn and sampled follows.
  reshape(changes: ReadonlyMap<number, { height: number; up: number }>): void;
}

const MAX_LEVEL = 4;
// Lattice rings are packed toward the tile edge on coarse tiles, so the
// relief can ease into the neighbors in a band while the tile's middle stays calm.
const RING_POW = 1.8;
const warpRing = (r: number) => 1 - Math.pow(1 - r, RING_POW);
const unwarpRing = (r: number) => 1 - Math.pow(Math.max(0, 1 - r), 1 / RING_POW);
// Offset of row a in a fan's lattice of S subdivisions (rows of S+1, S, ... entries).
const rowStart = (a: number, S: number) => a * (S + 1) - (a * (a - 1)) / 2;

// Builds the globe surface. Each tile is split into fans (one per corner pair)
// and each fan into S² small triangles, S = coarse × level. Where tiles of
// different levels meet, the finer tile's extra edge vertices sit exactly
// on the coarser edge, so the surface stays watertight.
//
// The vertices are laid out first (shared between fans and tiles), then the
// spec computes every surface field on them at once (heights can depend on
// distances along the surface, e.g. to the coast). Normals and ambient
// occlusion come from the shared mesh, so they are smooth. Finally every fan
// gets its own copy of its vertices, because the painting needs per-fan data
// (which neighbors a pixel can be painted by).
export function buildTerrainMesh(globe: Globe, spec: TerrainSpec, coarse: number): TerrainMesh {
  const { tiles, tris, triCenters } = globe;
  const N = tiles.length;
  const UNIT = coarse * MAX_LEVEL; // edge positions are counted in 1 / UNIT of an edge

  const dirOf = (t: number, i: number, wa: number, wb: number, out = new THREE.Vector3()) => {
    const tile = tiles[t];
    const k = tile.corners.length;
    const c = tile.center, A = triCenters[tile.corners[i]], B = triCenters[tile.corners[(i + 1) % k]];
    const w0 = 1 - wa - wb;
    return out.set(c.x * w0 + A.x * wa + B.x * wb, c.y * w0 + A.y * wa + B.y * wb, c.z * w0 + A.z * wa + B.z * wb).normalize();
  };

  // ---- vertices and triangles ----
  const dirs: number[] = [];
  const vTile: number[] = [], vFanI: number[] = [], vWa: number[] = [], vWb: number[] = [];
  const vTiles: number[] = [];
  const rings: number[] = [];
  const index: number[] = [];
  const triFan: number[] = [];
  const triToTile: number[] = [];
  const shared = new Map<string, number>();
  const tmpDir = new THREE.Vector3();

  const addVertex = (t: number, i: number, wa: number, wb: number, owners: readonly number[], ring: number): number => {
    const d = dirOf(t, i, wa, wb, tmpDir);
    const idx = rings.length;
    dirs.push(d.x, d.y, d.z);
    vTile.push(t); vFanI.push(i); vWa.push(wa); vWb.push(wb);
    rings.push(ring);
    vTiles.push(owners[0] ?? -1, owners[1] ?? -1, owners[2] ?? -1);
    return idx;
  };
  const sharedVertex = (key: string, make: () => number): number => {
    let v = shared.get(key);
    if (v === undefined) { v = make(); shared.set(key, v); }
    return v;
  };

  const levelOf = tiles.map((t) => spec.level(t.id));
  const fanStart = new Int32Array(N + 1);
  for (let t = 0; t < N; t++) fanStart[t + 1] = fanStart[t] + tiles[t].corners.length;
  const fanGrid: Int32Array[] = [];
  const tJunctions: { v: number; a: string; b: string; f: number }[] = [];
  const isJunction = new Set<number>();
  for (const tile of tiles) {
    const t = tile.id;
    const k = tile.corners.length;
    const S = coarse * levelOf[t];
    const packed = levelOf[t] === 1;
    for (let i = 0; i < k; i++) {
      const ci = tile.corners[i], cj = tile.corners[(i + 1) % k], nb = tile.neighbors[i];
      const lo = Math.min(ci, cj), hi = Math.max(ci, cj);
      // Edge positions both tiles have, in 1 / UNIT of the edge.
      const cs = UNIT / (coarse * Math.min(levelOf[t], levelOf[nb]));
      const edgeKey = (p: number) => (p === 0 ? `c${lo}` : p === UNIT ? `c${hi}` : `e${lo}_${hi}_${p}`);
      const grid = new Int32Array(rowStart(S + 1, S));
      for (let a = 0; a <= S; a++) {
        for (let b = 0; a + b <= S; b++) {
          const lin = (a + b) / S;
          const ring = packed ? warpRing(lin) : lin;
          const k2 = lin > 0 ? ring / lin : 0;
          const wa = (a / S) * k2, wb = (b / S) * k2;
          let v: number;
          if (a === 0 && b === 0) {
            v = sharedVertex(`t${t}`, () => addVertex(t, i, 0, 0, [t], 0));
          } else if (a + b === S) {
            if (b === 0) v = sharedVertex(`c${ci}`, () => addVertex(t, i, 1, 0, tris[ci], 1));
            else if (a === 0) v = sharedVertex(`c${cj}`, () => addVertex(t, i, 0, 1, tris[cj], 1));
            else {
              const p = (ci === lo ? b : S - b) * (UNIT / S);
              v = sharedVertex(edgeKey(p), () => addVertex(t, i, wa, wb, [t, nb], 1));
              if (p % cs !== 0) {
                // Only this (finer) tile has it: it must lie on the coarser edge.
                const p0 = p - (p % cs);
                if (!isJunction.has(v)) { isJunction.add(v); tJunctions.push({ v, a: edgeKey(p0), b: edgeKey(p0 + cs), f: (p - p0) / cs }); }
              }
            }
          } else if (b === 0) {
            v = sharedVertex(`s${t}_${ci}_${a}`, () => addVertex(t, i, wa, 0, [t], ring));
          } else if (a === 0) {
            v = sharedVertex(`s${t}_${cj}_${b}`, () => addVertex(t, i, 0, wb, [t], ring));
          } else {
            v = addVertex(t, i, wa, wb, [t], ring);
          }
          grid[rowStart(a, S) + b] = v;
        }
      }
      fanGrid.push(grid);
      const fan = fanStart[t] + i;
      for (let a = 0; a < S; a++) {
        for (let b = 0; a + b < S; b++) {
          const g = (aa: number, bb: number) => grid[rowStart(aa, S) + bb];
          index.push(g(a, b), g(a + 1, b), g(a, b + 1));
          triToTile.push(t); triFan.push(fan);
          if (a + b < S - 1) {
            index.push(g(a + 1, b), g(a + 1, b + 1), g(a, b + 1));
            triToTile.push(t); triFan.push(fan);
          }
        }
      }
    }
  }

  const Vs = rings.length;
  const sharedIndex = Uint32Array.from(index);
  const sharedDir = Float32Array.from(dirs);
  // Vertex adjacency (compressed rows) from the triangle list.
  const adjStart = new Uint32Array(Vs + 1);
  for (let j = 0; j < index.length; j++) adjStart[index[j] + 1] += 2;
  for (let v = 0; v < Vs; v++) adjStart[v + 1] += adjStart[v];
  const adj = new Uint32Array(adjStart[Vs]);
  {
    const fill = adjStart.slice(0, Vs);
    for (let j = 0; j < index.length; j += 3) {
      const a = index[j], b = index[j + 1], c = index[j + 2];
      adj[fill[a]++] = b; adj[fill[a]++] = c;
      adj[fill[b]++] = a; adj[fill[b]++] = c;
      adj[fill[c]++] = a; adj[fill[c]++] = b;
    }
  }
  const sharedWarp = new Float32Array(Vs * 3);
  if (spec.warp) {
    const tmp = [0, 0, 0];
    const d = new THREE.Vector3();
    for (let v = 0; v < Vs; v++) {
      d.set(sharedDir[v * 3], sharedDir[v * 3 + 1], sharedDir[v * 3 + 2]);
      spec.warp(d, tmp);
      sharedWarp[v * 3] = tmp[0]; sharedWarp[v * 3 + 1] = tmp[1]; sharedWarp[v * 3 + 2] = tmp[2];
    }
  }

  const sample = (t: number, i: number, wa: number, wb: number, out: LatticeSample): LatticeSample => {
    const S = coarse * levelOf[t];
    const grid = fanGrid[fanStart[t] + i];
    const r = Math.min(1, Math.max(0, wa + wb));
    const lin = levelOf[t] === 1 ? unwarpRing(r) : r;
    const k = r > 1e-12 ? lin / r : 0;
    const A = Math.max(0, wa) * k * S, B = Math.max(0, wb) * k * S;
    let a0 = Math.floor(A), b0 = Math.floor(B);
    let fa = A - a0, fb = B - b0;
    while (a0 + b0 > S - 1) { if (a0 > 0) { a0--; fa += 1; } else { b0--; fb += 1; } }
    const g = (aa: number, bb: number) => grid[rowStart(aa, S) + bb];
    if (fa + fb <= 1 || a0 + b0 === S - 1) {
      let w0 = 1 - fa - fb, w1 = fa, w2 = fb;
      if (w0 < 0) { const s = w1 + w2; w1 /= s; w2 /= s; w0 = 0; }
      out.v[0] = g(a0, b0); out.v[1] = g(a0 + 1, b0); out.v[2] = g(a0, b0 + 1);
      out.w[0] = w0; out.w[1] = w1; out.w[2] = w2;
    } else {
      out.v[0] = g(a0 + 1, b0); out.v[1] = g(a0 + 1, b0 + 1); out.v[2] = g(a0, b0 + 1);
      out.w[0] = 1 - fb; out.w[1] = fa + fb - 1; out.w[2] = 1 - fa;
    }
    return out;
  };

  const topo: Topology = {
    V: Vs, dir: sharedDir,
    tile: Int32Array.from(vTile), fanIndex: Uint8Array.from(vFanI),
    wa: Float32Array.from(vWa), wb: Float32Array.from(vWb),
    fan: Int32Array.from(vTile, (t, v) => fanStart[t] + vFanI[v]),
    owners: Int32Array.from(vTiles), warp: sharedWarp,
    index: sharedIndex, adjStart, adj, sample,
  };

  // ---- surface fields ----
  const fields = spec.surface(topo);
  const { height, water } = fields;
  const positions = new Float32Array(Vs * 3);
  const waterPos = new Float32Array(Vs * 3);
  for (let v = 0; v < Vs; v++) {
    const rg = 1 + height[v], rw = 1 + water[v];
    for (let c = 0; c < 3; c++) { positions[v * 3 + c] = sharedDir[v * 3 + c] * rg; waterPos[v * 3 + c] = sharedDir[v * 3 + c] * rw; }
  }
  // Extra edge vertices of finer tiles sit on the coarser neighbor's edge
  // (ground and water alike). Ends may be junctions themselves only if they
  // were fixed first, which never happens: their ends are coarse vertices.
  for (const j of tJunctions) {
    const a = shared.get(j.a)!, b = shared.get(j.b)!, v = j.v;
    for (let c = 0; c < 3; c++) {
      positions[v * 3 + c] = positions[a * 3 + c] * (1 - j.f) + positions[b * 3 + c] * j.f;
      waterPos[v * 3 + c] = waterPos[a * 3 + c] * (1 - j.f) + waterPos[b * 3 + c] * j.f;
    }
    height[v] = Math.hypot(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]) - 1;
    water[v] = Math.hypot(waterPos[v * 3], waterPos[v * 3 + 1], waterPos[v * 3 + 2]) - 1;
    for (const f of Object.values(fields.ground)) f[v] = f[a] * (1 - j.f) + f[b] * j.f;
    for (const f of fields.water3d) for (let c = 0; c < f.itemSize; c++) {
      f.data[v * f.itemSize + c] = f.data[a * f.itemSize + c] * (1 - j.f) + f.data[b * f.itemSize + c] * j.f;
    }
  }
  const radii = new Float32Array(Vs);
  for (let v = 0; v < Vs; v++) radii[v] = 1 + height[v];

  const sharedGeo = new THREE.BufferGeometry();
  sharedGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  sharedGeo.setIndex(new THREE.BufferAttribute(sharedIndex, 1));
  sharedGeo.computeVertexNormals();
  const sharedNormals = sharedGeo.getAttribute('normal').array as Float32Array;
  const sharedAO = bakeOcclusion(radii, adjStart, adj);

  // ---- water surface: triangles where water stands above the ground ----
  const waterOf = new Int32Array(Vs).fill(-1);
  const waterVerts: number[] = [];
  const waterIndex: number[] = [];
  for (let j = 0; j < sharedIndex.length; j += 3) {
    const a = sharedIndex[j], b = sharedIndex[j + 1], c = sharedIndex[j + 2];
    if (water[a] <= height[a] && water[b] <= height[b] && water[c] <= height[c]) continue;
    for (const v of [a, b, c]) {
      if (waterOf[v] < 0) { waterOf[v] = waterVerts.length; waterVerts.push(v); }
      waterIndex.push(waterOf[v]);
    }
  }
  const waterGeo = new THREE.BufferGeometry();
  const W = waterVerts.length;
  const wPos = new Float32Array(W * 3), wDepth = new Float32Array(W), wRing = new Float32Array(W);
  waterVerts.forEach((v, n) => {
    for (let c = 0; c < 3; c++) wPos[n * 3 + c] = waterPos[v * 3 + c];
    wDepth[n] = water[v] - height[v];
    wRing[n] = rings[v];
  });
  waterGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
  waterGeo.setAttribute('depth', new THREE.BufferAttribute(wDepth, 1));
  waterGeo.setAttribute('ring', new THREE.BufferAttribute(wRing, 1));
  for (const f of fields.water3d) {
    const out = new Float32Array(W * f.itemSize);
    waterVerts.forEach((v, n) => { for (let c = 0; c < f.itemSize; c++) out[n * f.itemSize + c] = f.data[v * f.itemSize + c]; });
    waterGeo.setAttribute(f.name, new THREE.BufferAttribute(out, f.itemSize));
  }
  waterGeo.setIndex(new THREE.BufferAttribute(Uint32Array.from(waterIndex), 1));
  waterGeo.computeBoundingSphere();

  // ---- split per fan ----
  const fanOfTile: [number, number][] = [];
  for (const tile of tiles) for (let i = 0; i < tile.corners.length; i++) fanOfTile.push([tile.id, i]);
  const copyOf = new Map<number, number>(); // fan * Vs + shared vertex -> split vertex
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
  const depth = new Float32Array(Vs);
  for (let v = 0; v < Vs; v++) depth[v] = water[v] - height[v];
  geometry.setAttribute('depth', new THREE.BufferAttribute(pick(depth, 1), 1));
  for (const [name, f] of Object.entries(fields.ground)) geometry.setAttribute(name, new THREE.BufferAttribute(pick(f, 1), 1));
  const vertDir = pick(sharedDir, 3);
  const dir = new THREE.Vector3();
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
  const centerRadius = Float32Array.from(tiles, (t) => {
    const v = shared.get(`t${t.id}`)!;
    return 1 + Math.max(height[v], water[v]);
  });

  const smp = newSample();
  const at = (t: number, i: number, wa: number, wb: number) => {
    sample(t, i, wa, wb, smp);
    let g = 0, w = 0;
    for (let c = 0; c < 3; c++) {
      const v = smp.v[c];
      g += smp.w[c] * Math.hypot(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      w += smp.w[c] * (1 + water[v]);
    }
    return { ground: g, water: w };
  };

  let splitsOf: number[][] | null = null;
  const vertRadiusOut = pick(radii, 1);
  const reshape = (changes: ReadonlyMap<number, { height: number; up: number }>) => {
    if (!splitsOf) { splitsOf = Array.from({ length: Vs }, () => []); for (let v = 0; v < V; v++) splitsOf[origin[v]].push(v); }
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const dep = geometry.getAttribute('depth') as THREE.BufferAttribute;
    for (const [sv, c] of changes) {
      height[sv] = c.height;
      const r = 1 + c.height;
      for (let k = 0; k < 3; k++) positions[sv * 3 + k] = sharedDir[sv * 3 + k] * r;
      for (const v of splitsOf[sv]) {
        pos.setXYZ(v, positions[sv * 3], positions[sv * 3 + 1], positions[sv * 3 + 2]);
        const dx = sharedDir[sv * 3], dy = sharedDir[sv * 3 + 1], dz = sharedDir[sv * 3 + 2];
        const nx = nrm.getX(v) + (dx - nrm.getX(v)) * c.up, ny = nrm.getY(v) + (dy - nrm.getY(v)) * c.up, nz = nrm.getZ(v) + (dz - nrm.getZ(v)) * c.up;
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm.setXYZ(v, nx / l, ny / l, nz / l);
        dep.setX(v, water[sv] - c.height);
        vertRadiusOut[v] = r;
      }
    }
    pos.needsUpdate = true; nrm.needsUpdate = true; dep.needsUpdate = true;
    for (const tile of tiles) {
      const cv = shared.get(`t${tile.id}`)!;
      if (changes.has(cv)) centerRadius[tile.id] = 1 + Math.max(height[cv], water[cv]);
    }
  };

  return {
    geometry,
    water: waterGeo,
    waterVerts: Int32Array.from(waterVerts),
    triToTile: Int32Array.from(triToTile),
    vertTiles,
    vertDir,
    vertRadius: vertRadiusOut,
    vertAO: pick(sharedAO, 1),
    tileVerts: lists.map((l) => Int32Array.from(l)),
    centerRadius,
    topo,
    fields,
    at,
    samplePoint(t, i, wa, wb) {
      return dirOf(t, i, wa, wb).multiplyScalar(at(t, i, wa, wb).ground);
    },
    reshape,
  };
}

// The fan holding unit direction dir: the nearest tile center (walking from
// `hint`), then the fan whose triangle contains the point. Falls back to the
// neighbors when the point sits just outside the nearest tile's polygon.
export function locate(globe: Globe, dir: THREE.Vector3, hint = 0): FanPoint {
  const { tiles, triCenters } = globe;
  let t = Math.min(Math.max(0, hint), tiles.length - 1), best = tiles[t].center.dot(dir);
  for (;;) {
    let next = -1;
    for (const nb of tiles[t].neighbors) {
      const d = tiles[nb].center.dot(dir);
      if (d > best) { best = d; next = nb; }
    }
    if (next < 0) break;
    t = next;
  }
  let fallback: FanPoint | null = null, fallbackErr = Infinity;
  for (const tt of [t, ...tiles[t].neighbors]) {
    const tile = tiles[tt], k = tile.corners.length;
    const C = tile.center;
    for (let i = 0; i < k; i++) {
      const A = triCenters[tile.corners[i]], B = triCenters[tile.corners[(i + 1) % k]];
      // dir * l = C + wa (A - C) + wb (B - C), by Cramer's rule.
      const ax = A.x - C.x, ay = A.y - C.y, az = A.z - C.z, bx = B.x - C.x, by = B.y - C.y, bz = B.z - C.z;
      const det = dir.x * (ay * bz - az * by) - dir.y * (ax * bz - az * bx) + dir.z * (ax * by - ay * bx);
      if (Math.abs(det) < 1e-14) continue;
      // Solve [dir, -a, -b] (l, wa, wb) = C.
      const l = (C.x * (ay * bz - az * by) - C.y * (ax * bz - az * bx) + C.z * (ax * by - ay * bx)) / det;
      const wa = -(dir.x * (C.y * bz - C.z * by) - dir.y * (C.x * bz - C.z * bx) + dir.z * (C.x * by - C.y * bx)) / det;
      const wb = -(dir.x * (ay * C.z - az * C.y) - dir.y * (ax * C.z - az * C.x) + dir.z * (ax * C.y - ay * C.x)) / det;
      if (l <= 0) continue;
      const err = Math.max(0, -wa) + Math.max(0, -wb) + Math.max(0, wa + wb - 1);
      if (err < 1e-9) return { t: tt, i, wa, wb };
      if (err < fallbackErr) {
        fallbackErr = err;
        const ca = Math.max(0, wa), cb = Math.max(0, wb), s = Math.max(1, ca + cb);
        fallback = { t: tt, i, wa: ca / s, wb: cb / s };
      }
    }
  }
  return fallback ?? { t, i: 0, wa: 0, wb: 0 };
}

// Ambient occlusion from the terrain's shape: each vertex is compared with a
// blurred copy of the height field, so valleys and hollows darken and ridges
// catch a little extra light. Baked once; costs nothing per frame.
function bakeOcclusion(R: Float32Array, deg: Uint32Array, adj: Uint32Array): Float32Array {
  const V = R.length;
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
