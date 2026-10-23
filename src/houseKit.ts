// The kit the lot models are built from (houses.ts and the style files):
// primitives in tile steps, a building's body and its facades, the yard.
// Units are tile steps; the origin is the middle of the lot on the ground,
// the front (+z) faces its street.

import * as THREE from 'three';
import { cone, cyl, part, tf, type Tf } from './propCatalog.ts';
import type { Floors, Footprint } from './town/geometry.ts';
import type { Rng } from './rng.ts';

export type G = THREE.BufferGeometry;
// A style's model of a lot.
export type Build = (l: Lot) => G[];
// ---------- primitives (tile steps) ----------

export const P = (g: G, c: number, o: Tf = {}) => part(g, c, tf(o));
export const E = 0.00025; // how far details stand proud of a wall
// Details lie in layers off a wall, so none share a plane (they would
// flicker): painted bands and strips lowest, window frames over them,
// windows and doors (E) over both, anything laid on those at E * 2 and up.
export const BAND = E * 0.4, FRAME = E * 0.7;
// A closed box standing on y = o.y (walls and a top; no floor).
export function box(w: number, h: number, d: number, c: number, o: Tf = {}, top = c): G[] {
  return [
    P(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w, h, d), c, o),
    P(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, h, 0), top, o),
  ];
}
// Four walls only (an open box: a parapet, a fence, a yard wall).
export const ring = (w: number, h: number, d: number, c: number, o: Tf = {}) =>
  P(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w, h, d), c, o);
// A flat patch on the ground (y slightly up so it shows over the terrain).
export const patch = (w: number, d: number, c: number, x = 0, z = 0, y = 0.0003, ry = 0) =>
  P(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), c, { x, y, z, ry });
// A frustum: a w0 × d0 base rising h to a w1 × d1 top (8 triangles; the top
// closed when `top` is given).
export function frustum(w0: number, d0: number, w1: number, d1: number, h: number, c: number, o: Tf = {}, top?: number): G[] {
  const a = [w0 / 2, d0 / 2], b = [w1 / 2, d1 / 2];
  const q = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number) => [x0, 0, z0, x1, 0, z1, x2, h, z2, x0, 0, z0, x2, h, z2, x3, h, z3];
  const p = [
    ...q(-a[0]!, a[1]!, a[0]!, a[1]!, b[0]!, b[1]!, -b[0]!, b[1]!),
    ...q(a[0]!, -a[1]!, -a[0]!, -a[1]!, -b[0]!, -b[1]!, b[0]!, -b[1]!),
    ...q(a[0]!, a[1]!, a[0]!, -a[1]!, b[0]!, -b[1]!, b[0]!, b[1]!),
    ...q(-a[0]!, -a[1]!, -a[0]!, a[1]!, -b[0]!, b[1]!, -b[0]!, -b[1]!),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const out = [P(g, c, o)];
  if (top !== undefined) out.push(P(new THREE.PlaneGeometry(w1, d1).rotateX(-Math.PI / 2).translate(0, h, 0), top, o));
  return out;
}
// A gable roof over w × d, h high, its ridge along x (or along z: `alongZ`).
export function gable(w: number, d: number, h: number, c: number, o: Tf = {}, alongZ = false, end = c): G[] {
  if (alongZ) return gable(d, w, h, c, { ...o, ry: (o.ry ?? 0) + Math.PI / 2 }, false, end);
  const x = w / 2, z = d / 2;
  const slopes = new THREE.BufferGeometry();
  slopes.setAttribute('position', new THREE.Float32BufferAttribute([
    -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0,
    x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0,
  ], 3));
  const ends = new THREE.BufferGeometry();
  ends.setAttribute('position', new THREE.Float32BufferAttribute([-x, 0, -z, -x, 0, z, -x, h, 0, x, 0, z, x, 0, -z, x, h, 0], 3));
  return [P(slopes, c, o), P(ends, end, o)];
}
// A hipped roof over w × d, h high (its ridge along the longer side).
export function hip(w: number, d: number, h: number, c: number, o: Tf = {}): G {
  const x = w / 2, z = d / 2, r = Math.max(0, (Math.max(w, d) - Math.min(w, d)) / 2);
  const [rx, rz] = w >= d ? [r, 0] : [0, r];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -x, 0, z, x, 0, z, rx, h, rz, -x, 0, z, rx, h, rz, -rx, h, -rz,
    x, 0, -z, -x, 0, -z, -rx, h, -rz, x, 0, -z, -rx, h, -rz, rx, h, rz,
    x, 0, z, x, 0, -z, rx, h, rz, -x, 0, -z, -x, 0, z, -rx, h, -rz,
  ], 3));
  // (Front and back are trapezoids and the ends triangles when the ridge
  // runs along x; along z they swap, with the same faces.)
  return P(g, c, o);
}
export const shrub = (x: number, z: number, r: number, c: number) => P(new THREE.OctahedronGeometry(r, 0), c, { x, y: r * 0.7, z, sy: 0.8 });
export function tree(x: number, z: number, s: number, crown: number): G[] {
  return [cyl(0.0007 * s, 0.0005 * s, 0.006 * s, 3, 0x6a5038, { x, z }), P(new THREE.OctahedronGeometry(0.0045 * s, 0), crown, { x, y: 0.008 * s, z, sy: 1.1 })];
}
export const cypress = (x: number, z: number, s: number) => [cyl(0.0005 * s, 0.0004 * s, 0.002 * s, 3, 0x5a4030, { x, z }), cone(0.0018 * s, 0.013 * s, 5, 0x3f5a35, { x, y: 0.0015 * s, z })];
export function palm(x: number, z: number, s: number): G[] {
  return [cyl(0.0006 * s, 0.0004 * s, 0.011 * s, 3, 0x7a6448, { x, z, rz: 0.08 }), P(new THREE.OctahedronGeometry(0.004 * s, 0), 0x5e8a44, { x: x + 0.0008 * s, y: 0.011 * s, z, sy: 0.3 })];
}

// ---------- the building body and its facades ----------

export interface Body { x: number; z: number; w: number; d: number; y: number; h: number }
export type Face = 'front' | 'back' | 'left' | 'right';
export const FACE_TURN: Record<Face, number> = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };
// A quad on a face of a body: `along` from the face's middle, `y` up from the ground, w × h.
export function onFace(b: Body, face: Face, along: number, y: number, w: number, h: number, c: number, out = E): G {
  const g = new THREE.PlaneGeometry(w, h).translate(along, y + h / 2, 0).rotateY(FACE_TURN[face]);
  const [dx, dz] = face === 'front' ? [0, b.d / 2 + out] : face === 'back' ? [0, -b.d / 2 - out] : face === 'right' ? [b.w / 2 + out, 0] : [-b.w / 2 - out, 0];
  return P(g, c, { x: b.x + dx, z: b.z + dz });
}
export const faceWidth = (b: Body, f: Face) => (f === 'front' || f === 'back' ? b.w : b.d);
// Windows on a face, floor by floor: as many as fit `spacing` apart (the
// middle of the ground floor of the front left for the door when `door`).
export interface WinOpts { w: number; h: number; spacing: number; sill: number; color: number; frame?: number | undefined; shutter?: number | undefined; door?: boolean; floors: number; storey: number; base: number }
export function windows(b: Body, face: Face, o: WinOpts): G[] {
  const out: G[] = [], fw = faceWidth(b, face), n = Math.max(1, Math.floor((fw - 0.004) / o.spacing));
  for (let f = 0; f < o.floors; f++) {
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * (fw / n);
      if (o.door && f === 0 && face === 'front' && Math.abs(along) < fw / n / 2) continue;
      const y = b.y + o.base + f * o.storey + o.sill;
      if (o.frame !== undefined) out.push(onFace(b, face, along, y - 0.0005, o.w + 0.001, o.h + 0.001, o.frame, FRAME));
      out.push(onFace(b, face, along, y, o.w, o.h, o.color));
      if (o.shutter !== undefined) for (const s of [-1, 1]) out.push(onFace(b, face, along + s * (o.w / 2 + o.w * 0.28), y, o.w * 0.5, o.h, o.shutter));
    }
  }
  return out;
}

// ---------- the yard ----------

export interface Lot { lw: number; ld: number; floors: Floors; H: number; v: number; rand: Rng; fp: Footprint }
// The building's place on its lot: a share of the lot's width and depth,
// set back from the front by `setback` (tile steps).
export function place(l: Lot, cw: number, cd: number, setback: number): Body {
  const w = 2 * l.lw * cw, d = 2 * l.ld * cd;
  return { x: 0, z: l.ld - setback - d / 2, w, d, y: 0, h: l.H };
}
// The ground of the lot, a path from the door to the street.
export function yard(l: Lot, b: Body, ground: number, path: number, pathW = 0.005): G[] {
  const out = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, ground)];
  const front = b.z + b.d / 2, len = l.ld - front;
  if (len > 0.001) out.push(patch(pathW, len, path, b.x, front + len / 2, 0.0005));
  return out;
}
// A fence or wall round the lot (open at the path).
export function fence(l: Lot, h: number, c: number, gap = 0.008): G[] {
  const w = 2 * l.lw * 0.96, d = 2 * l.ld * 0.96, side = (w - gap) / 2;
  return [
    ...box(0.0007, h, d, c, { x: -w / 2 }), ...box(0.0007, h, d, c, { x: w / 2 }), ...box(w, h, 0.0007, c, { z: -d / 2 }),
    ...box(side, h, 0.0007, c, { x: -(gap + side) / 2, z: d / 2 }), ...box(side, h, 0.0007, c, { x: (gap + side) / 2, z: d / 2 }),
  ];
}
// Shrubs along the back and the sides of the yard, where there is room.
export function plant(l: Lot, b: Body, n: number, c: number, r = 0.0026): G[] {
  const out: G[] = [];
  const spots: [number, number][] = [[-l.lw * 0.7, -l.ld * 0.75], [l.lw * 0.7, -l.ld * 0.75], [-l.lw * 0.75, l.ld * 0.7], [l.lw * 0.75, l.ld * 0.7], [0, -l.ld * 0.8]];
  for (const [x, z] of spots) {
    if (out.length >= n) break;
    const inside = Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r;
    if (!inside) out.push(shrub(x, z, r * (0.8 + 0.4 * l.rand()), c));
  }
  return out;
}
export const pick = <T>(l: Lot, xs: readonly T[]): T => xs[l.v % xs.length]!;


// The storey layout of a body: floor heights from the walls' height.
export const storeys = (l: Lot, base = 0.15) => ({ floors: l.floors, base: l.H * base / l.floors, storey: (l.H * (1 - base / l.floors)) / l.floors });

// ---------- more shapes ----------

// A dome (a half sphere), r wide, its base at o.y; `sy` squashes or stretches it.
export const dome = (r: number, c: number, o: Tf = {}, n = 8) => P(new THREE.SphereGeometry(r, n, 3, 0, Math.PI * 2, 0, Math.PI / 2), c, o);
// An onion dome: a sphere on its point, a spike on top.
export const onion = (r: number, c: number, o: Tf = {}): G[] => [
  P(new THREE.SphereGeometry(r, 7, 4), c, { ...o, y: (o.y ?? 0) + r * 0.9, sy: 1.15 }),
  cone(r * 0.35, r * 1.4, 4, c, { ...o, y: (o.y ?? 0) + r * 1.9 }),
];
// A 4-sided spire (a tented roof), w across, h high.
export const spire = (w: number, h: number, c: number, o: Tf = {}) => cone(w * Math.SQRT1_2, h, 4, c, { ...o, ry: (o.ry ?? 0) + Math.PI / 4 });
// An arched opening on a face: a w × h rectangle with a half circle on top
// (pointed: a steeper top, for pointed arches).
export function arch(b: Body, face: Face, along: number, y: number, w: number, h: number, c: number, pointed = false, out = E): G[] {
  const top = new THREE.CircleGeometry(w / 2, pointed ? 3 : 6, 0, Math.PI).scale(1, pointed ? 1.5 : 1, 1).translate(along, y + h, 0).rotateY(FACE_TURN[face]);
  const [dx, dz] = face === 'front' ? [0, b.d / 2 + out] : face === 'back' ? [0, -b.d / 2 - out] : face === 'right' ? [b.w / 2 + out, 0] : [-b.w / 2 - out, 0];
  return [onFace(b, face, along, y, w, h, c, out), P(top, c, { x: b.x + dx, z: b.z + dz })];
}
// A round window (a disc) on a face, its middle at `along`, y.
export function disc(b: Body, face: Face, along: number, y: number, r: number, c: number, out = E): G {
  const g = new THREE.CircleGeometry(r, 6).translate(along, y, 0).rotateY(FACE_TURN[face]);
  const [dx, dz] = face === 'front' ? [0, b.d / 2 + out] : face === 'back' ? [0, -b.d / 2 - out] : face === 'right' ? [b.w / 2 + out, 0] : [-b.w / 2 - out, 0];
  return P(g, c, { x: b.x + dx, z: b.z + dz });
}
// A quad on a face turned by `angle` in the face's plane (a brace, a diamond).
export function tilted(b: Body, face: Face, along: number, y: number, w: number, h: number, angle: number, c: number, out = E): G {
  const g = new THREE.PlaneGeometry(w, h).rotateZ(angle).translate(along, y, 0).rotateY(FACE_TURN[face]);
  const [dx, dz] = face === 'front' ? [0, b.d / 2 + out] : face === 'back' ? [0, -b.d / 2 - out] : face === 'right' ? [b.w / 2 + out, 0] : [-b.w / 2 - out, 0];
  return P(g, c, { x: b.x + dx, z: b.z + dz });
}
// A prism: the outline (x, z points, counter-clockwise seen from above) raised h, closed on top.
export function prism(pts: readonly (readonly [number, number])[], h: number, c: number, o: Tf = {}, top = c): G[] {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const walls = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2);
  // (ExtrudeGeometry makes both caps; the top is redone in its own color.)
  const cap = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, h + 0.00005, 0);
  return [P(walls, c, o), P(cap, top, o)];
}
// A box with its corners cut (an octagon w × d; `cut` of the shorter side).
export function chamfered(w: number, h: number, d: number, cut: number, c: number, o: Tf = {}, top = c): G[] {
  const x = w / 2, z = d / 2, k = Math.min(w, d) * cut;
  return prism([[-x + k, z], [x - k, z], [x, z - k], [x, -z + k], [x - k, -z], [-x + k, -z], [-x, -z + k], [-x, z - k]], h, c, o, top);
}
// Merlons along the top edges of a body (crenellations), about `step` apart.
export function merlons(b: Body, y: number, size: number, step: number, c: number, faces: readonly Face[] = ['front', 'back', 'left', 'right']): G[] {
  const out: G[] = [];
  for (const f of faces) {
    const fw = faceWidth(b, f), n = Math.max(2, Math.floor(fw / step));
    for (let i = 0; i < n; i++) {
      const a = -fw / 2 + (i + 0.5) * (fw / n);
      const [x, z] = f === 'front' ? [a, b.d / 2 - size / 2] : f === 'back' ? [-a, -b.d / 2 + size / 2] : f === 'right' ? [b.w / 2 - size / 2, -a] : [-b.w / 2 + size / 2, a];
      out.push(...box(size, size, size, c, { x: b.x + x, y, z: b.z + z }));
    }
  }
  return out;
}
// Vertical strips on a face, `step` apart (fins, piers, boards).
export function strips(b: Body, face: Face, y: number, h: number, w: number, step: number, c: number, out = BAND): G[] {
  const fw = faceWidth(b, face), n = Math.max(1, Math.floor(fw / step));
  return Array.from({ length: n + 1 }, (_, i) => onFace(b, face, -fw / 2 + (i * fw) / n, y, w, h, c, out));
}
// Horizontal bands round a body at heights ys (string courses, log lines).
export const bands = (b: Body, ys: readonly number[], h: number, c: number, faces: readonly Face[] = ['front', 'back', 'left', 'right']): G[] =>
  ys.flatMap((y) => faces.map((f) => onFace(b, f, 0, y, faceWidth(b, f), h, c, BAND)));
// A tree with a flat, wide crown (an acacia, a pine), a slender one (a birch).
export const flatTree = (x: number, z: number, s: number, crown: number): G[] => [
  cyl(0.0006 * s, 0.0005 * s, 0.008 * s, 3, 0x6a5038, { x, z }), P(new THREE.OctahedronGeometry(0.006 * s, 0), crown, { x, y: 0.009 * s, z, sy: 0.35 }),
];
export const birch = (x: number, z: number, s: number): G[] => [
  cyl(0.0005 * s, 0.0004 * s, 0.01 * s, 3, 0xe8e4dc, { x, z }), P(new THREE.OctahedronGeometry(0.0035 * s, 0), 0x7a9a48, { x, y: 0.011 * s, z, sy: 1.5 }),
];
// A closed cylinder (walls and a top), r0 at the foot, r1 at the top.
export const drum = (r0: number, r1: number, h: number, n: number, c: number, o: Tf = {}, top = c): G[] => [
  cyl(r0, r1, h, n, c, o), P(new THREE.CircleGeometry(r1, n).rotateX(-Math.PI / 2).translate(0, h, 0), top, o),
];
// A color darkened (k < 1) or lightened (k > 1).
export const shade = (c: number, k: number): number => {
  const f = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (f(16) << 16) | (f(8) << 8) | f(0);
};
// The faces of a body, all four, and those a passer-by sees.
export const ALL: readonly Face[] = ['front', 'back', 'left', 'right'];
export const SEEN: readonly Face[] = ['front', 'left', 'right'];
// Heights a step apart up a body, from `from` to below `to`.
export const steps = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let y = from; y < to - 1e-9; y += step) out.push(y);
  return out;
};
