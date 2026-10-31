// Low-poly modelling for people and animals, in the PS1's way: few
// faces, hard edges (flat normals, one per face), colours painted per
// vertex (shading across a face) or per face (crisp bands). A person or an
// animal is at most LOWPOLY_BUDGET triangles.
//
// One builder, the hull: rings of points along a path (each ring square to
// the path, never twisting), joined face to face; a ring of no size is a
// point (a cone's tip, a snout), the ends closed or open.

import * as THREE from 'three';
import type { Paint } from './creatures.ts';

export const LOWPOLY_BUDGET = 200;

export type V3 = readonly [number, number, number];
export type LpPaint = Paint | ((p: THREE.Vector3) => Paint);
// A ring: its middle, its half extents (a: across, in the plane of the
// path and the first ring's up; b: sideways).
export interface Ring { readonly c: V3; readonly a: number; readonly b: number }
export const R = (c: V3, a: number, b = a): Ring => ({ c, a, b });

export interface HullOpts {
  readonly caps?: readonly [boolean, boolean]; // close the first and last ring (default both)
  readonly side?: V3;     // the first ring's sideways axis (default +z)
  readonly turn?: number; // where the ring's first point sits, radians from `a`'s axis
  readonly faces?: boolean; // paint per face (default per vertex)
  readonly lumps?: number;  // swell each point by up to this share (a hash of its place): fleece, rock
  readonly skip?: (j: number) => boolean; // leave out the faces after the ring's j-th point
}

// A hull of `radial` points a ring. A 4-point ring is a box's section (its
// faces square to a and b, out at a and b); others are polygons whose points
// lie on the ellipse a, b.
export function hull(rings: readonly Ring[], radial: number, paint: LpPaint, o: HullOpts = {}): THREE.BufferGeometry {
  const n = rings.length, P = rings.map((r) => new THREE.Vector3(...r.c));
  const turn = o.turn ?? (radial === 4 ? Math.PI / 4 : 0), k = radial === 4 && o.turn === undefined ? Math.SQRT2 : 1;
  let Sd = new THREE.Vector3(...(o.side ?? [0, 0, 1]));
  const T = new THREE.Vector3(), U = new THREE.Vector3();
  const pts: THREE.Vector3[][] = [], axes: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    T.subVectors(P[Math.min(n - 1, i + 1)]!, P[Math.max(0, i - 1)]!).normalize();
    Sd.addScaledVector(T, -Sd.dot(T));
    if (Sd.lengthSq() < 1e-8) Sd = new THREE.Vector3(1, 0, 0).addScaledVector(T, -T.x);
    Sd.normalize();
    U.crossVectors(Sd, T).normalize();
    axes.push(T.clone());
    const r = rings[i]!, ring: THREE.Vector3[] = [];
    for (let j = 0; j < radial; j++) {
      const th = turn + (j / radial) * Math.PI * 2;
      const v = P[i]!.clone().addScaledVector(U, Math.cos(th) * r.a * k).addScaledVector(Sd, Math.sin(th) * r.b * k);
      if (o.lumps) v.sub(P[i]!).multiplyScalar(1 + o.lumps * hash(v)).add(P[i]!);
      ring.push(v);
    }
    pts.push(ring);
  }
  const tris: THREE.Vector3[] = [];
  // (Each face wound to face out from the path, or along it at the ends.)
  const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, out: THREE.Vector3) => {
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (nrm.lengthSq() < 1e-14) return;
    if (nrm.dot(out) < 0) tris.push(a, c, b); else tris.push(a, b, c);
  };
  const point = (r: Ring) => r.a === 0 && r.b === 0;
  for (let i = 0; i < n - 1; i++) {
    const mid = P[i]!.clone().add(P[i + 1]!).multiplyScalar(0.5);
    for (let j = 0; j < radial; j++) {
      if (o.skip?.(j)) continue;
      const j1 = (j + 1) % radial, a = pts[i]![j]!, b = pts[i]![j1]!, c = pts[i + 1]![j]!, d = pts[i + 1]![j1]!;
      const out = a.clone().add(b).add(c).add(d).multiplyScalar(0.25).sub(mid);
      if (!point(rings[i]!)) face(a, b, d, out);
      if (!point(rings[i + 1]!)) face(a, d, c, out);
    }
  }
  const [c0, c1] = o.caps ?? [true, true];
  for (const [i, on, sign] of [[0, c0, -1], [n - 1, c1, 1]] as const) {
    if (!on || point(rings[i]!)) continue;
    const out = axes[i]!.clone().multiplyScalar(sign);
    for (let j = 1; j < radial - 1; j++) face(pts[i]![0]!, pts[i]![j]!, pts[i]![j + 1]!, out);
  }
  return flat(tris, paint, o.faces === true);
}

// A limb (or any rod): a hull through points with their radii, `flat`
// times as wide sideways.
export function limb(points: readonly V3[], radii: readonly number[], paint: LpPaint, radial = 4, o: HullOpts = {}, flat = 1): THREE.BufferGeometry {
  return hull(points.map((p, i) => R(p, radii[i]!, radii[i]! * flat)), radial, paint, o);
}
// A spike (horn, ear, tusk, beak): a hull through points tapering to a
// point, its base open (set into a head or a body).
export function spike(points: readonly V3[], r0: number, paint: LpPaint, radial = 3, flat = 1): THREE.BufferGeometry {
  const n = points.length;
  return hull(points.map((p, i) => (i === n - 1 ? R(p, 0, 0) : R(p, r0 * (1 - i / (n - 1)), r0 * (1 - i / (n - 1)) * flat))), radial, paint, { caps: [false, false] });
}
// A gem: a low ellipsoid at c with half extents r (a ring round its waist,
// a point above and below), turned by `rot`.
export function gem(c: V3, r: V3, paint: LpPaint, radial = 6, rot?: V3, o: HullOpts = {}): THREE.BufferGeometry {
  const g = hull([R([0, -1, 0], 0, 0), R([0, 0, 0], 1, 1), R([0, 1, 0], 0, 0)], radial, 0xffffff, { side: [0, 0, 1], ...o });
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))), new THREE.Vector3(...r)));
  g.computeVertexNormals();
  return paintIt(g, paint, o.faces === true);
}
// A flat polygon (a shield's face, an ear): `pts` in its plane (x, y), both
// sides, `depth` thick (0: one sheet; the material draws both sides).
export function plate(pts: readonly (readonly [number, number])[], paint: LpPaint, depth = 0): THREE.BufferGeometry {
  const tris: THREE.Vector3[] = [], m = pts.length;
  const at = (i: number, z: number) => new THREE.Vector3(pts[i]![0], pts[i]![1], z);
  for (let j = 1; j < m - 1; j++) tris.push(at(0, depth / 2), at(j, depth / 2), at(j + 1, depth / 2));
  if (depth > 0) {
    for (let j = 1; j < m - 1; j++) tris.push(at(0, -depth / 2), at(j + 1, -depth / 2), at(j, -depth / 2));
    for (let j = 0; j < m; j++) { const j1 = (j + 1) % m; tris.push(at(j, depth / 2), at(j, -depth / 2), at(j1, -depth / 2), at(j, depth / 2), at(j1, -depth / 2), at(j1, depth / 2)); }
  }
  return flat(tris, paint, true);
}

// ---- painting ----
// (A smooth hash of a place, -1..1: lumps.)
const hash = (v: THREE.Vector3) => Math.sin(v.x * 231.1 + v.y * 73.3) * Math.sin(v.y * 197.7 + v.z * 51.1) * Math.sin(v.z * 173.3 + v.x * 119.9);
const tmpC = new THREE.Color();
function flat(tris: readonly THREE.Vector3[], paint: LpPaint, faces: boolean): THREE.BufferGeometry {
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => pos.set([v.x, v.y, v.z], i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals(); // (unindexed: each face its own normal)
  return paintIt(g, paint, faces);
}
// Colours (and the coat's leaf mask) from a paint: at each vertex, or at
// each face's middle.
export function paintIt(g: THREE.BufferGeometry, paint: LpPaint, faces: boolean): THREE.BufferGeometry {
  const pos = g.getAttribute('position'), n = pos.count;
  const col = new Float32Array(n * 3), mask = new Float32Array(n), p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (faces) {
      const f = i - (i % 3);
      p.fromBufferAttribute(pos, f).add(q.fromBufferAttribute(pos, f + 1)).add(q.fromBufferAttribute(pos, f + 2)).multiplyScalar(1 / 3);
    } else p.fromBufferAttribute(pos, i);
    const pt = typeof paint === 'function' ? paint(p) : paint;
    if (typeof pt === 'number') { tmpC.setHex(pt); col.set([tmpC.r, tmpC.g, tmpC.b], i * 3); }
    else { col.set([pt.coat, pt.coat, pt.coat], i * 3); mask[i] = 1; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('leafMask', new THREE.BufferAttribute(mask, 1));
  return g;
}

// Triangles in a set of parts.
export const triangles = (parts: readonly THREE.BufferGeometry[]): number =>
  parts.reduce((s, g) => s + (g.index ? g.index.count : g.getAttribute('position').count) / 3, 0);
