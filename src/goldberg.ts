import * as THREE from 'three';

// Builds a Goldberg polyhedron GP(n, 0) as the dual of an icosahedron
// subdivided with frequency n. Result: 10n² + 2 tiles, exactly 12 of which
// are pentagons (the original icosahedron vertices) and the rest hexagons.
//
export interface Tile {
  id: number;
  center: THREE.Vector3; // unit vector
  // Indices into Globe.tris / Globe.triCenters, counter-clockwise seen from
  // outside. The edge between corners[i] and corners[i+1] is shared with
  // neighbors[i].
  corners: number[];
  neighbors: number[];
}

export interface Globe {
  tiles: Tile[];
  tris: [number, number, number][];
  triCenters: THREE.Vector3[];
  maxEdgeAngle: number;
  avgEdgeAngle: number;
}

export function buildGoldberg(n: number): Globe {
  const t = (1 + Math.sqrt(5)) / 2;
  const icoV = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]: number[]) => new THREE.Vector3(x, y, z).normalize());
  const icoF: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  // Points are deduplicated by a canonical key so that points on shared
  // icosahedron edges/corners are computed exactly once.
  const points: THREE.Vector3[] = [];
  const keyToIdx = new Map<string, number>();
  const getPoint = (f: number, i: number, j: number): number => {
    const [a, b, c] = icoF[f];
    const w = ([[a, n - i - j], [b, i], [c, j]] as [number, number][]).filter((x) => x[1] > 0);
    let key: string;
    if (w.length === 1) key = 'v' + w[0][0];
    else if (w.length === 2) {
      w.sort((x, y) => x[0] - y[0]);
      key = `e${w[0][0]}_${w[1][0]}_${w[0][1]}`;
    } else key = `f${f}_${i}_${j}`;
    let idx = keyToIdx.get(key);
    if (idx === undefined) {
      const pos = new THREE.Vector3();
      for (const [vi, wt] of w) pos.addScaledVector(icoV[vi], wt);
      pos.normalize();
      idx = points.length;
      points.push(pos);
      keyToIdx.set(key, idx);
    }
    return idx;
  };

  const tris: [number, number, number][] = [];
  for (let f = 0; f < 20; f++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        tris.push([getPoint(f, i, j), getPoint(f, i + 1, j), getPoint(f, i, j + 1)]);
        if (i + j < n - 1) {
          tris.push([getPoint(f, i + 1, j), getPoint(f, i + 1, j + 1), getPoint(f, i, j + 1)]);
        }
      }
    }
  }

  // Make every triangle counter-clockwise when seen from outside.
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (const tri of tris) {
    const [a, b, c] = tri.map((k) => points[k]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).dot(a) < 0) [tri[1], tri[2]] = [tri[2], tri[1]];
  }

  const triCenters = tris.map(([a, b, c]) =>
    new THREE.Vector3().add(points[a]).add(points[b]).add(points[c]).normalize()
  );

  const vertTris: number[][] = points.map(() => []);
  tris.forEach((tri, ti) => tri.forEach((v) => vertTris[v].push(ti)));

  const tiles: Tile[] = points.map((center, v) => {
    // For each incident CCW triangle (v, a, b), the next triangle CCW around v
    // is the one starting with edge (v, b).
    const next = new Map<number, { ti: number; b: number }>();
    for (const ti of vertTris[v]) {
      const tri = tris[ti];
      const k = tri.indexOf(v);
      next.set(tri[(k + 1) % 3], { ti, b: tri[(k + 2) % 3] });
    }
    const corners: number[] = [], neighbors: number[] = [];
    const start = next.keys().next().value!;
    let cur = start;
    do {
      const { ti, b } = next.get(cur)!;
      corners.push(ti);
      neighbors.push(b);
      cur = b;
    } while (cur !== start && corners.length <= 6);
    return { id: v, center, corners, neighbors };
  });

  let maxEdge = 0, sumEdge = 0, edges = 0;
  for (const tile of tiles) {
    for (const nb of tile.neighbors) {
      const a = tile.center.angleTo(tiles[nb].center);
      maxEdge = Math.max(maxEdge, a);
      sumEdge += a;
      edges++;
    }
  }

  return { tiles, tris, triCenters, maxEdgeAngle: maxEdge, avgEdgeAngle: sumEdge / edges };
}
