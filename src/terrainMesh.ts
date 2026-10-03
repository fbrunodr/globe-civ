import * as THREE from 'three';
import type { Globe } from './goldberg.ts';
import { makePerlin, mulberry32 } from './rng.ts';

// A per-tile value written to every vertex; vertices shared by several tiles
// get the average, which blends neighbors smoothly at the edges.
export interface TileAttribute {
  name: string;
  itemSize: number;
  perTile: Float32Array; // length = tiles × itemSize
}

// Per-tile scalars that shape the surface.
export interface TerrainField {
  height: Float32Array;    // plateau height above radius 1
  amp: Float32Array;       // noise displacement amplitude
  plateau: Float32Array;   // flat-top fraction of the tile radius (0 = cone)
  attributes: TileAttribute[];
}

export interface TerrainMesh {
  geometry: THREE.BufferGeometry;
  triToTile: Int32Array;      // triangle index -> tile id
  vertTiles: Int32Array;      // 3 tile ids per vertex (-1 padded); >1 on shared boundaries
  vertDir: Float32Array;      // unit direction per vertex (xyz)
  vertRadius: Float32Array;   // distance from the globe center per vertex
  tileVerts: Int32Array[];    // all vertices that touch a tile
  centerRadius: Float32Array; // surface radius at each tile center
  // Surface point inside tile t, in fan i (between corners i and i+1), at
  // barycentric weights wa (toward corner i) and wb (toward corner i+1).
  samplePoint(t: number, i: number, wa: number, wb: number): THREE.Vector3;
}

const smoothstep = (a: number, b: number, x: number): number => {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Lattice rings are packed toward the tile edge so color blending between
// neighbors stays in a thin band and the tile interior keeps its own color.
const warpRing = (r: number) => 1 - Math.pow(1 - r, 1.8);

// Builds the globe surface. Each tile is split into fans (one per corner pair)
// and each fan into S² small triangles. Vertices on tile boundaries are shared
// with the neighbors, so the mesh is watertight and normals come out smooth.
//
// Height inside a tile: the tile's plateau height in the middle, easing out to
// a boundary height that is the average of the tiles meeting there. Fine noise
// is added on top, scaled by each tile's roughness.
export function buildTerrainMesh(globe: Globe, field: TerrainField, S: number, seed: number): TerrainMesh {
  const { tiles, tris, triCenters } = globe;
  const noise = makePerlin(mulberry32(seed ^ 0x51ed270b));
  const detail = (d: THREE.Vector3) => 2 * noise.fbm(d.x * 22 + 5.1, d.y * 22 - 3.3, d.z * 22 + 1.7, 5);

  const cornerVal = (arr: Float32Array, tri: number) => {
    const [a, b, c] = tris[tri];
    return (arr[a] + arr[b] + arr[c]) / 3;
  };
  // Value on the edge from corner ci (f=0) to corner cj (f=1), shared by tiles t and nb.
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
    return lerp(arr[t], b, smoothstep(field.plateau[t], 1, r));
  };
  const dirOf = (t: number, i: number, wa: number, wb: number) => {
    const tile = tiles[t];
    const k = tile.corners.length;
    return new THREE.Vector3()
      .addScaledVector(tile.center, 1 - wa - wb)
      .addScaledVector(triCenters[tile.corners[i]], wa)
      .addScaledVector(triCenters[tile.corners[(i + 1) % k]], wb)
      .normalize();
  };
  const radiusAt = (t: number, i: number, wa: number, wb: number, dir: THREE.Vector3) =>
    1 + interiorVal(field.height, t, i, wa, wb) + interiorVal(field.amp, t, i, wa, wb) * detail(dir);

  const positions: number[] = [];
  const dirs: number[] = [];
  const radii: number[] = [];
  const rings: number[] = [];
  const attrData: number[][] = field.attributes.map(() => []);
  const vTiles: number[] = [];
  const index: number[] = [];
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
    field.attributes.forEach((a, ai) => {
      for (let c = 0; c < a.itemSize; c++) {
        let sum = 0;
        for (const o of owners) sum += a.perTile[o * a.itemSize + c];
        attrData[ai].push(sum / owners.length);
      }
    });
    vTiles.push(owners[0] ?? -1, owners[1] ?? -1, owners[2] ?? -1);
    return idx;
  };
  const sharedVertex = (key: string, make: () => number): number => {
    let v = shared.get(key);
    if (v === undefined) { v = make(); shared.set(key, v); }
    return v;
  };

  const grid: number[][] = Array.from({ length: S + 1 }, () => new Array<number>(S + 1).fill(-1));
  for (const tile of tiles) {
    const t = tile.id;
    const k = tile.corners.length;
    for (let i = 0; i < k; i++) {
      const ci = tile.corners[i], cj = tile.corners[(i + 1) % k], nb = tile.neighbors[i];
      for (let a = 0; a <= S; a++) {
        for (let b = 0; a + b <= S; b++) {
          const lin = (a + b) / S;
          const ring = warpRing(lin);
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
              const lo = Math.min(ci, cj), hi = Math.max(ci, cj);
              const step = ci === lo ? b : S - b;
              v = sharedVertex(`e${lo}_${hi}_${step}`, () => addVertex(t, i, wa, wb, [t, nb], 1));
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
          triToTile.push(t);
          if (a + b < S - 1) {
            index.push(grid[a + 1][b], grid[a + 1][b + 1], grid[a][b + 1]);
            triToTile.push(t);
          }
        }
      }
    }
  }

  const V = radii.length;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(V * 3), 3));
  geometry.setAttribute('ring', new THREE.Float32BufferAttribute(rings, 1));
  field.attributes.forEach((a, ai) => geometry.setAttribute(a.name, new THREE.Float32BufferAttribute(attrData[ai], a.itemSize)));
  geometry.setAttribute('unexplored', new THREE.Float32BufferAttribute(new Float32Array(V).fill(1), 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const vertTiles = Int32Array.from(vTiles);
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
    vertDir: Float32Array.from(dirs),
    vertRadius: Float32Array.from(radii),
    tileVerts: lists.map((l) => Int32Array.from(l)),
    centerRadius,
    samplePoint(t, i, wa, wb) {
      const dir = dirOf(t, i, wa, wb);
      return dir.multiplyScalar(radiusAt(t, i, wa, wb, dir));
    },
  };
}
