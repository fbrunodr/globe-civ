// Town lots as models: a building in its yard, SimCity 4 style (the
// building takes part of the lot; the rest is garden, paving, a fence or
// wall, a path to its door, shrubs and trees). One parametric model per
// architectural style (architecture.ts), built to the lot's footprint and
// height, in three variants. Detailed but stylised (the maquette look):
// plinths, cornices, windows and shutters, timber framing, porches,
// chimneys, dormers, balconies, awnings.
//
// Units are tile steps (a lot of b22 is 2 × 2 cells, CELL wide each); the
// origin is the middle of the lot on the ground, the front (+z) faces its
// street, x runs along the street. Colors are baked (per variant); an
// instance adds only a shade.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cone, cyl, part, tf, type Tf } from './propCatalog.ts';
import { CELL, FOOTPRINT_CELLS, wallHeight, type Floors, type Footprint } from './town/geometry.ts';
import { mulberry32, type Rng } from './rng.ts';
import type { Style } from './architecture.ts';

type G = THREE.BufferGeometry;
export const HOUSE_VARIANTS = 3;
// A lot model's key (a model kind of its own for the renderers).
export type HouseKind = `house|${Style}|${Footprint}|${Floors}|${number}`;
export const houseKind = (style: Style, fp: Footprint, floors: Floors, variant: number): HouseKind => `house|${style}|${fp}|${floors}|${variant % HOUSE_VARIANTS}`;
export const isHouseKind = (k: string): k is HouseKind => k.startsWith('house|');
export function parseHouseKind(k: HouseKind): { style: Style; fp: Footprint; floors: Floors; variant: number } {
  const [, style, fp, floors, v] = k.split('|');
  return { style: style as Style, fp: fp as Footprint, floors: Number(floors) as Floors, variant: Number(v) };
}

// ---------- primitives (tile steps) ----------

const P = (g: G, c: number, o: Tf = {}) => part(g, c, tf(o));
const E = 0.00025; // how far details stand proud of a wall
// A closed box standing on y = o.y (walls and a top; no floor).
function box(w: number, h: number, d: number, c: number, o: Tf = {}, top = c): G[] {
  return [
    P(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w, h, d), c, o),
    P(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, h, 0), top, o),
  ];
}
// Four walls only (an open box: a parapet, a fence, a yard wall).
const ring = (w: number, h: number, d: number, c: number, o: Tf = {}) =>
  P(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w, h, d), c, o);
// A flat patch on the ground (y slightly up so it shows over the terrain).
const patch = (w: number, d: number, c: number, x = 0, z = 0, y = 0.0003, ry = 0) =>
  P(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), c, { x, y, z, ry });
// A frustum: a w0 × d0 base rising h to a w1 × d1 top (8 triangles; the top
// closed when `top` is given).
function frustum(w0: number, d0: number, w1: number, d1: number, h: number, c: number, o: Tf = {}, top?: number): G[] {
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
function gable(w: number, d: number, h: number, c: number, o: Tf = {}, alongZ = false, end = c): G[] {
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
function hip(w: number, d: number, h: number, c: number, o: Tf = {}): G {
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
const shrub = (x: number, z: number, r: number, c: number) => P(new THREE.OctahedronGeometry(r, 0), c, { x, y: r * 0.7, z, sy: 0.8 });
function tree(x: number, z: number, s: number, crown: number): G[] {
  return [cyl(0.0007 * s, 0.0005 * s, 0.006 * s, 3, 0x6a5038, { x, z }), P(new THREE.OctahedronGeometry(0.0045 * s, 0), crown, { x, y: 0.008 * s, z, sy: 1.1 })];
}
const cypress = (x: number, z: number, s: number) => [cyl(0.0005 * s, 0.0004 * s, 0.002 * s, 3, 0x5a4030, { x, z }), cone(0.0018 * s, 0.013 * s, 5, 0x3f5a35, { x, y: 0.0015 * s, z })];
function palm(x: number, z: number, s: number): G[] {
  return [cyl(0.0006 * s, 0.0004 * s, 0.011 * s, 3, 0x7a6448, { x, z, rz: 0.08 }), P(new THREE.OctahedronGeometry(0.004 * s, 0), 0x5e8a44, { x: x + 0.0008 * s, y: 0.011 * s, z, sy: 0.3 })];
}

// ---------- the building body and its facades ----------

interface Body { x: number; z: number; w: number; d: number; y: number; h: number }
type Face = 'front' | 'back' | 'left' | 'right';
const FACE_TURN: Record<Face, number> = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };
// A quad on a face of a body: `along` from the face's middle, `y` up from the ground, w × h.
function onFace(b: Body, face: Face, along: number, y: number, w: number, h: number, c: number, out = E): G {
  const g = new THREE.PlaneGeometry(w, h).translate(along, y + h / 2, 0).rotateY(FACE_TURN[face]);
  const [dx, dz] = face === 'front' ? [0, b.d / 2 + out] : face === 'back' ? [0, -b.d / 2 - out] : face === 'right' ? [b.w / 2 + out, 0] : [-b.w / 2 - out, 0];
  return P(g, c, { x: b.x + dx, z: b.z + dz });
}
const faceWidth = (b: Body, f: Face) => (f === 'front' || f === 'back' ? b.w : b.d);
// Windows on a face, floor by floor: as many as fit `spacing` apart (the
// middle of the ground floor of the front left for the door when `door`).
interface WinOpts { w: number; h: number; spacing: number; sill: number; color: number; frame?: number | undefined; shutter?: number | undefined; door?: boolean; floors: number; storey: number; base: number }
function windows(b: Body, face: Face, o: WinOpts): G[] {
  const out: G[] = [], fw = faceWidth(b, face), n = Math.max(1, Math.floor((fw - 0.004) / o.spacing));
  for (let f = 0; f < o.floors; f++) {
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * (fw / n);
      if (o.door && f === 0 && face === 'front' && Math.abs(along) < fw / n / 2) continue;
      const y = b.y + o.base + f * o.storey + o.sill;
      if (o.frame !== undefined) out.push(onFace(b, face, along, y - 0.0005, o.w + 0.001, o.h + 0.001, o.frame, E * 0.5));
      out.push(onFace(b, face, along, y, o.w, o.h, o.color));
      if (o.shutter !== undefined) for (const s of [-1, 1]) out.push(onFace(b, face, along + s * (o.w / 2 + o.w * 0.28), y, o.w * 0.5, o.h, o.shutter));
    }
  }
  return out;
}

// ---------- the yard ----------

interface Lot { lw: number; ld: number; floors: Floors; H: number; v: number; rand: Rng; fp: Footprint }
// The building's place on its lot: a share of the lot's width and depth,
// set back from the front by `setback` (tile steps).
function place(l: Lot, cw: number, cd: number, setback: number): Body {
  const w = 2 * l.lw * cw, d = 2 * l.ld * cd;
  return { x: 0, z: l.ld - setback - d / 2, w, d, y: 0, h: l.H };
}
// The ground of the lot, a path from the door to the street.
function yard(l: Lot, b: Body, ground: number, path: number, pathW = 0.005): G[] {
  const out = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, ground)];
  const front = b.z + b.d / 2, len = l.ld - front;
  if (len > 0.001) out.push(patch(pathW, len, path, b.x, front + len / 2, 0.0005));
  return out;
}
// A fence or wall round the lot (open at the path).
function fence(l: Lot, h: number, c: number, gap = 0.008): G[] {
  const w = 2 * l.lw * 0.96, d = 2 * l.ld * 0.96, side = (w - gap) / 2;
  return [
    ...box(0.0007, h, d, c, { x: -w / 2 }), ...box(0.0007, h, d, c, { x: w / 2 }), ...box(w, h, 0.0007, c, { z: -d / 2 }),
    ...box(side, h, 0.0007, c, { x: -(gap + side) / 2, z: d / 2 }), ...box(side, h, 0.0007, c, { x: (gap + side) / 2, z: d / 2 }),
  ];
}
// Shrubs along the back and the sides of the yard, where there is room.
function plant(l: Lot, b: Body, n: number, c: number, r = 0.0026): G[] {
  const out: G[] = [];
  const spots: [number, number][] = [[-l.lw * 0.7, -l.ld * 0.75], [l.lw * 0.7, -l.ld * 0.75], [-l.lw * 0.75, l.ld * 0.7], [l.lw * 0.75, l.ld * 0.7], [0, -l.ld * 0.8]];
  for (const [x, z] of spots) {
    if (out.length >= n) break;
    const inside = Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r;
    if (!inside) out.push(shrub(x, z, r * (0.8 + 0.4 * l.rand()), c));
  }
  return out;
}
const pick = <T>(l: Lot, xs: readonly T[]): T => xs[l.v % xs.length]!;

// ---------- the styles ----------

// The storey layout of a body: floor heights from the walls' height.
const storeys = (l: Lot, base = 0.15) => ({ floors: l.floors, base: l.H * base / l.floors, storey: (l.H * (1 - base / l.floors)) / l.floors });

const STYLE_BUILD: Record<Style, (l: Lot) => G[]> = {
  mediterranean(l) {
    const wall = pick(l, [0xe8dcc4, 0xddc9a6, 0xefe6d6]), roof = pick(l, [0xb5653f, 0xa85a3a, 0xc07a50]), shutter = pick(l, [0x5a7a5a, 0x4a6a8a, 0x7a5a3a]);
    const b = place(l, 0.68, 0.6, l.ld * 0.22), out: G[] = [];
    out.push(...yard(l, b, 0xcab89a, 0xd8ccb0));
    out.push(...box(b.w + 0.002, 0.0015, b.d + 0.002, 0xcfc4ac, { x: b.x, z: b.z }));                 // plinth
    out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
    out.push(...box(b.w + 0.0016, 0.0009, b.d + 0.0016, 0xcfc4ac, { x: b.x, y: b.h - 0.0009, z: b.z })); // cornice
    out.push(hip(b.w + 0.004, b.d + 0.004, Math.min(b.w, b.d) * 0.28, roof, { x: b.x, y: b.h, z: b.z }));
    const s = storeys(l);
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0032, h: s.storey * 0.42, spacing: 0.011, sill: s.storey * 0.3, color: 0x3a3028, shutter: f === 'front' ? shutter : undefined, door: true }));
    out.push(onFace(b, 'front', 0, b.y + 0.0012, 0.0055, Math.min(0.009, s.storey * 0.7), 0x5a3e2a));
    // A porch on columns before the door of the larger houses.
    if (b.w > 0.05) {
      for (const x of [-0.008, 0.008]) out.push(cyl(0.0007, 0.0006, s.storey * 0.85, 5, 0xe8e2d4, { x, z: b.z + b.d / 2 + 0.006 }));
      out.push(...box(0.022, 0.0008, 0.008, 0xcfc4ac, { y: s.storey * 0.85, z: b.z + b.d / 2 + 0.004 }));
      out.push(...gable(0.024, 0.009, 0.004, roof, { y: s.storey * 0.85 + 0.0008, z: b.z + b.d / 2 + 0.004 }, true, wall));
    }
    // A low courtyard wall, a cypress and shrubs.
    out.push(...fence(l, 0.003, wall));
    out.push(...cypress(-l.lw * 0.72, -l.ld * 0.7, 1), ...plant(l, b, 2, 0x5e7a44));
    return out;
  },
  nile(l) {
    const wall = pick(l, [0xc9a878, 0xd8bc8c, 0xbf9c6c]), cloth = pick(l, [0xe0d6c0, 0xc8a070, 0x9a6a50]);
    const b = place(l, 0.7, 0.62, l.ld * 0.14), out: G[] = [];
    out.push(...yard(l, b, 0xcdb48a, 0xb8a07a));
    out.push(...frustum(b.w + 0.002, b.d + 0.002, b.w, b.d, b.h, wall, { x: b.x, z: b.z }, wall)); // battered walls, flat roof
    out.push(ring(b.w, 0.0022, b.d, wall, { x: b.x, y: b.h, z: b.z }));                          // parapet
    // A shade on the roof: four poles and a cloth.
    const sw = b.w * 0.45, sd = b.d * 0.45;
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.0003, 0.0003, 0.006, 3, 0x6a5038, { x: b.x - b.w / 4 + x * sw / 2, y: b.h, z: b.z + z * sd / 2 }));
    out.push(P(new THREE.PlaneGeometry(sw, sd).rotateX(-Math.PI / 2 + 0.12), cloth, { x: b.x - b.w / 4, y: b.h + 0.006, z: b.z }));
    if (l.floors > 1) out.push(...box(b.w * 0.45, b.h * 0.35, b.d * 0.5, wall, { x: b.x + b.w * 0.25, y: b.h, z: b.z - b.d * 0.2 }));
    const s = storeys(l, 0.1);
    for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.22, spacing: 0.012, sill: s.storey * 0.6, color: 0x2e2620, door: true }));
    out.push(onFace(b, 'front', 0, 0, 0.005, Math.min(0.0085, s.storey * 0.65), 0x3a2c22));
    out.push(...fence(l, 0.0042, wall, 0.009), ...palm(l.lw * 0.65, -l.ld * 0.65, 1));
    return out;
  },
  eastAsian(l) {
    const roof = pick(l, [0x4f5862, 0x5a5e66, 0x4a5a52]), wall = pick(l, [0xebe6da, 0xe2dccc, 0xd9cfba]), wood = pick(l, [0x5a3a2a, 0x6a2e24, 0x4a3426]);
    const out: G[] = [];
    if (l.floors > 2) {
      // A shophouse: an open timber shop front, plastered floors above with
      // shuttered windows, a thin eave at each floor, a tiled hip roof.
      const b = place(l, 0.84, 0.7, l.ld * 0.04), s = storeys(l, 0.06);
      out.push(...yard(l, b, 0xb0a890, 0xb0a890));
      out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
      out.push(onFace(b, 'front', 0, 0, b.w * 0.8, s.base + s.storey * 0.8, wood));
      for (let f = 1; f <= l.floors; f++) out.push(...frustum(b.w + 0.005, b.d + 0.005, b.w, b.d, 0.0018, roof, { x: b.x, y: s.base + f * s.storey - 0.0018, z: b.z }));
      for (const face of ['front', 'back', 'left', 'right'] as Face[]) out.push(...windows(b, face, { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.0034, h: s.storey * 0.42, spacing: 0.0095, sill: s.storey * 0.25, color: 0x8a6a48, frame: wood }));
      out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.2, roof, { x: b.x, y: b.h, z: b.z }));
      return out;
    }
    const b = place(l, 0.62, 0.55, l.ld * 0.26);
    out.push(...yard(l, b, 0xc8c0aa, 0xb0a890, 0.006));
    out.push(...box(b.w + 0.003, 0.0018, b.d + 0.003, 0x9a948a, { x: b.x, z: b.z }));        // stone base
    const tiers = l.floors, th = (b.h - 0.0018) / tiers;
    for (let t = 0; t < tiers; t++) {
      const k = 1 - t * 0.1, w = b.w * k, d = b.d * k, y = 0.0018 + t * th;
      out.push(...box(w, th, d, wall, { x: b.x, y, z: b.z }));
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0012, th, 0.0012, wood, { x: b.x + x * w / 2, y, z: b.z + z * d / 2 }));
      // Lattice panels between the posts.
      const tb: Body = { x: b.x, z: b.z, w, d, y, h: th };
      out.push(onFace(tb, 'front', 0, y + th * 0.2, w * 0.7, th * 0.55, 0xb08a60), onFace(tb, 'back', 0, y + th * 0.25, w * 0.6, th * 0.45, 0xb08a60));
      // A storey's eaves flare out a little (the curved look); the last becomes the roof.
      if (t < tiers - 1) out.push(...frustum(w * 1.2, d * 1.26, w * 0.94, d * 0.94, th * 0.16, roof, { x: b.x, y: y + th - 0.0004, z: b.z }));
    }
    const k = 1 - (tiers - 1) * 0.1, tw = b.w * k, td = b.d * k, rh = Math.min(tw, td) * 0.26;
    out.push(...frustum(tw * 1.24, td * 1.3, tw * 0.98, td * 0.98, rh * 0.25, roof, { x: b.x, y: b.h - 0.0004, z: b.z }));
    out.push(hip(tw * 0.98, td * 0.98, rh * 0.75, roof, { x: b.x, y: b.h - 0.0004 + rh * 0.25, z: b.z }));
    out.push(...box(Math.abs(tw - td) * 0.5 + 0.004, 0.001, 0.0012, 0x3a3a3a, { x: b.x, y: b.h + rh - 0.0005, z: b.z })); // ridge
    out.push(...fence(l, 0.0032, 0xd9d2c0), shrub(-l.lw * 0.7, -l.ld * 0.7, 0.0032, 0x4f6e3a), shrub(l.lw * 0.72, l.ld * 0.68, 0.0022, 0x6a8a4a));
    return out;
  },
  northern(l) {
    const timber = pick(l, [0x6a4e34, 0x5e4430, 0x725638]), thatch = pick(l, [0x9a7a40, 0x8a6e3a, 0xa8884a]), daub = pick(l, [0xddd0b0, 0xd4c4a0, 0xe2d6bc]);
    // A longhouse: its length along the lot's longer side.
    const long = FOOTPRINT_CELLS[l.fp][1] > FOOTPRINT_CELLS[l.fp][0];
    const b = place(l, long ? 0.52 : 0.66, long ? 0.74 : 0.56, l.ld * 0.18), out: G[] = [];
    out.push(...yard(l, b, 0x7d9a55, 0x9a8a6a));
    out.push(...box(b.w, b.h, b.d, daub, { x: b.x, z: b.z }));
    // Timber frame: corner posts and a sill and head beam on the front.
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0013, b.h, 0.0013, timber, { x: b.x + x * b.w / 2, z: b.z + z * b.d / 2 }));
    out.push(onFace(b, 'front', 0, b.h - 0.0012, b.w, 0.0012, timber), onFace(b, 'front', 0, 0, b.w, 0.0012, timber));
    if (l.floors > 1) out.push(onFace(b, 'front', 0, b.h / 2, b.w, 0.0011, timber), onFace(b, 'left', 0, b.h / 2, b.d, 0.0011, timber), onFace(b, 'right', 0, b.h / 2, b.d, 0.0011, timber));
    const s = storeys(l);
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.3, spacing: 0.014, sill: s.storey * 0.35, color: 0x2a2420, door: true }));
    out.push(onFace(b, 'front', 0, 0, 0.0055, Math.min(0.0095, s.storey * 0.72), 0x5a4030));
    // A steep thatch roof, low over the walls, its ridge along the length.
    out.push(...gable(b.w + 0.009, b.d + 0.009, Math.min(b.w, b.d) * 0.6, thatch, { x: b.x, y: b.h - 0.0015, z: b.z }, long, timber));
    out.push(...box(0.0028, 0.006, 0.0028, 0x7a7068, { x: b.x + b.w * 0.25, y: b.h + Math.min(b.w, b.d) * 0.3, z: b.z - b.d * 0.1 })); // smoke hole / chimney
    // A wattle fence, a vegetable patch and a tree.
    out.push(...fence(l, 0.0028, 0x7a6248, 0.007));
    out.push(patch(l.lw * 0.6, l.ld * 0.35, 0x6a5a3a, -l.lw * 0.4, -l.ld * 0.62, 0.0006));
    for (let i = 0; i < 3; i++) out.push(patch(l.lw * 0.5, 0.0012, 0x5e8a44, -l.lw * 0.4, -l.ld * 0.72 + i * l.ld * 0.1, 0.0008));
    out.push(...tree(l.lw * 0.68, -l.ld * 0.62, 1, 0x4f6e38));
    return out;
  },
  yurt(l) {
    const felt = pick(l, [0xebe2cc, 0xe0d4b8, 0xd8ccb0]), band = pick(l, [0xa84a3a, 0x3a5a8a, 0x7a5a2a]);
    const out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8aa060)];
    // One yurt per floor's worth of room: a big one, smaller ones on larger lots.
    const big = Math.min(l.lw, l.ld) * (l.floors > 1 ? 0.62 : 0.52), h = l.H * (l.floors > 1 ? 0.55 : 0.75);
    const yurt = (x: number, z: number, r: number, hh: number) => [
      cyl(r, r, hh, 9, felt, { x, z }), cyl(r * 1.01, r * 1.01, hh * 0.12, 9, band, { x, y: hh * 0.55, z }),
      cone(r * 1.04, r * 0.55, 9, felt, { x, y: hh, z }), cyl(r * 0.18, r * 0.18, r * 0.12, 6, 0x6a5038, { x, y: hh + r * 0.5, z }),
      onFace({ x, z, w: r * 2, d: r * 2, y: 0, h: hh }, 'front', 0, 0, r * 0.45, hh * 0.75, 0xb8603a, E * 2),
    ];
    out.push(...yurt(0, l.ld * 0.1, big, h));
    if (l.lw > 0.03) out.push(...yurt(-l.lw * 0.62, -l.ld * 0.55, big * 0.55, h * 0.7));
    if (l.lw > 0.04 || l.ld > 0.04) out.push(...yurt(l.lw * 0.6, -l.ld * 0.6, big * 0.5, h * 0.65));
    // A hitching rail and a cart track.
    out.push(...box(l.lw * 0.6, 0.0006, 0.0006, 0x6a5038, { x: l.lw * 0.2, y: 0.003, z: l.ld * 0.8 }), cyl(0.0004, 0.0004, 0.0035, 3, 0x6a5038, { x: l.lw * 0.5, z: l.ld * 0.8 }));
    out.push(patch(0.005, l.ld * 0.5, 0xa89a72, 0, l.ld * 0.7, 0.0005));
    return out;
  },
  mesoamerican(l) {
    const plaster = pick(l, [0xe8e2d4, 0xe0d0b0, 0xd8c8a8]), band = pick(l, [0xa84a3a, 0x3a7a8a, 0xc08a3a]), stone = 0xb8ae98;
    const b = place(l, 0.62, 0.52, l.ld * 0.3), out: G[] = [];
    out.push(...yard(l, b, 0xb8a888, 0xc8bca0));
    // A stepped platform, the house on top, stairs up the front.
    const step = l.floors > 1 ? 0.0045 : 0.0028;
    out.push(...box(b.w * 1.3, step, b.d * 1.3, stone, { x: b.x, z: b.z }), ...box(b.w * 1.15, step, b.d * 1.15, stone, { x: b.x, y: step, z: b.z }));
    const top: Body = { ...b, y: 2 * step, h: b.h - step };
    out.push(...box(top.w, top.h, top.d, plaster, { x: b.x, y: top.y, z: b.z }));
    out.push(...box(top.w + 0.0006, top.h * 0.14, top.d + 0.0006, band, { x: b.x, y: top.y + top.h * 0.86, z: b.z }, plaster));  // painted frieze (the roof plastered)
    out.push(ring(top.w, 0.0016, top.d, plaster, { x: b.x, y: top.y + top.h, z: b.z }));                         // roof parapet
    out.push(...box(top.w * 0.4, 0.004, 0.0012, plaster, { x: b.x, y: top.y + top.h, z: b.z - top.d * 0.2 }));   // roof comb
    out.push(onFace(top, 'front', 0, top.y, 0.0055, top.h * 0.55, 0x2e2420));
    out.push(P(new THREE.PlaneGeometry(0.008, Math.hypot(2 * step, b.d * 0.15)).rotateX(-Math.PI / 2 + Math.atan2(2 * step, b.d * 0.15)), stone, { x: b.x, y: step, z: b.z + b.d * 0.65 }));
    // A maize patch and a tree.
    for (let i = 0; i < 3; i++) out.push(patch(l.lw * 0.45, 0.0016, 0x7a9a3a, -l.lw * 0.45, -l.ld * 0.62 + i * 0.004, 0.0008));
    out.push(...tree(l.lw * 0.65, -l.ld * 0.6, 1, 0x5e8a44));
    return out;
  },
  african(l) {
    const mud = pick(l, [0xb88a5a, 0xa87a4e, 0xc49a6a]), thatch = pick(l, [0xa88a50, 0x9a7e48, 0xb09858]);
    const out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8a070)];
    const hut = (x: number, z: number, r: number, h: number) => [
      cyl(r, r, h, 8, mud, { x, z }), cone(r * 1.3, r * 1.25, 8, thatch, { x, y: h * 0.92, z }),
      onFace({ x, z, w: r * 2, d: r * 2, y: 0, h }, 'front', 0, 0, r * 0.5, h * 0.7, 0x3a2a20, E * 2),
    ];
    const r = Math.min(l.lw, l.ld) * (l.floors > 1 ? 0.42 : 0.36), h = l.H * 0.55;
    out.push(...hut(0, l.ld * 0.05, r, h));
    if (l.lw > 0.03) out.push(...hut(-l.lw * 0.55, -l.ld * 0.5, r * 0.7, h * 0.85));
    if (l.floors > 1) { // a granary on stilts
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.0003, 0.0003, 0.004, 3, 0x6a5038, { x: l.lw * 0.55 + x * 0.002, z: -l.ld * 0.5 + z * 0.002 }));
      out.push(cyl(0.0032, 0.0032, 0.004, 7, mud, { x: l.lw * 0.55, y: 0.004, z: -l.ld * 0.5 }), cone(0.0042, 0.004, 7, thatch, { x: l.lw * 0.55, y: 0.0078, z: -l.ld * 0.5 }));
    }
    // The kraal's palisade: a ring of stakes (an open drum), open at the front.
    const R = Math.min(l.lw, l.ld) * 0.95;
    out.push(P(new THREE.CylinderGeometry(R, R, 0.0035, 14, 1, true, 0.35, Math.PI * 2 - 0.7).translate(0, 0.00175, 0), 0x7a5a3a));
    return out;
  },
  southAsian(l) {
    const wall = pick(l, [0xd8a878, 0xe0b890, 0xeae0d0]), trim = pick(l, [0xc8805a, 0xb86a4a, 0x8a6a4a]);
    const b = place(l, 0.68, 0.6, l.ld * 0.18), out: G[] = [];
    out.push(...yard(l, b, 0xd0b890, 0xc0a888));
    out.push(...box(b.w + 0.002, 0.0016, b.d + 0.002, trim, { x: b.x, z: b.z }));
    out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
    out.push(...box(b.w + 0.0014, 0.0008, b.d + 0.0014, trim, { x: b.x, y: b.h, z: b.z }, wall));            // cornice (the flat roof in the wall's color)
    out.push(ring(b.w, 0.0022, b.d, wall, { x: b.x, y: b.h + 0.0008, z: b.z }));                             // parapet
    // A small domed pavilion (chhatri) on a corner of the roof.
    const cx = b.x + b.w / 2 - 0.004, cz = b.z - b.d / 2 + 0.004, py = b.h + 0.0008;
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.0003, 0.0003, 0.004, 3, trim, { x: cx + x * 0.0022, y: py, z: cz + z * 0.0022 }));
    out.push(...box(0.0058, 0.0006, 0.0058, trim, { x: cx, y: py + 0.004, z: cz }), P(new THREE.SphereGeometry(0.0026, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2), wall, { x: cx, y: py + 0.0046, z: cz }));
    const s = storeys(l);
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.003, h: s.storey * 0.42, spacing: 0.011, sill: s.storey * 0.32, color: 0x3a2a24, frame: trim, door: true }));
    // A carved balcony (jharokha) over the door of a taller house.
    if (l.floors > 1) out.push(...box(0.008, s.storey * 0.4, 0.003, trim, { x: b.x, y: s.base + s.storey * 1.2, z: b.z + b.d / 2 + 0.0015 }));
    out.push(onFace(b, 'front', 0, 0, 0.005, Math.min(0.009, s.storey * 0.7), 0x5a3a2a));
    out.push(...fence(l, 0.003, wall, 0.008), ...tree(-l.lw * 0.7, -l.ld * 0.66, 1, 0x4f7a3a), shrub(l.lw * 0.7, l.ld * 0.7, 0.0022, 0x5e8a44));
    return out;
  },
  islamic(l) {
    const wall = pick(l, [0xefe9dc, 0xe6dccb, 0xdcd0bc]), wood = 0x6a4a30, dome = pick(l, [0xe8e2d4, 0x4a8a8a, 0xc8b8a0]);
    const b = place(l, 0.82, 0.72, l.ld * 0.14), out: G[] = [];
    out.push(...yard(l, b, 0xd8ccb4, 0xc8bca4));
    // A house round a courtyard: walls to the street, few windows; a screened
    // wooden bay (mashrabiya) on the upper floor; a dome on the larger ones.
    out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
    out.push(ring(b.w, 0.0018, b.d, wall, { x: b.x, y: b.h, z: b.z }));
    // (Crenellated parapet: small merlons along the front.)
    const m = Math.max(2, Math.floor(b.w / 0.006));
    for (let i = 0; i < m; i++) out.push(...box(0.0018, 0.0016, 0.0012, wall, { x: b.x - b.w / 2 + (i + 0.5) * (b.w / m), y: b.h + 0.0018, z: b.z + b.d / 2 - 0.0006 }));
    // The courtyard: a light well in the roof, a palm and a fountain seen from above.
    out.push(patch(b.w * 0.4, b.d * 0.4, 0xc8bca4, b.x, b.z, b.h + 0.0002), cyl(0.002, 0.002, 0.0012, 7, 0x6a9ab0, { x: b.x, y: b.h, z: b.z }));
    const s = storeys(l);
    out.push(onFace(b, 'front', 0, 0, 0.0055, Math.min(0.0095, s.storey * 0.75), 0x5a3a2a));
    out.push(P(new THREE.CircleGeometry(0.00275, 6, 0, Math.PI), 0x5a3a2a, { x: b.x, y: Math.min(0.0095, s.storey * 0.75), z: b.z + b.d / 2 + E })); // the door's arch
    for (const f of ['left', 'right', 'back'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.35, spacing: 0.013, sill: s.storey * 0.4, color: 0x3a2a24 }));
    if (l.floors > 1) out.push(...box(b.w * 0.36, s.storey * 0.7, 0.003, wood, { x: b.x + b.w * 0.22, y: s.base + s.storey * 1.1, z: b.z + b.d / 2 + 0.0015 }));
    if (b.w > 0.045) {
      out.push(...box(0.008, 0.002, 0.008, wall, { x: b.x - b.w * 0.25, y: b.h, z: b.z - b.d * 0.22 }));
      out.push(P(new THREE.SphereGeometry(0.0042, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), dome, { x: b.x - b.w * 0.25, y: b.h + 0.002, z: b.z - b.d * 0.22 }));
    }
    out.push(...palm(l.lw * 0.75, -l.ld * 0.8, 0.8));
    return out;
  },
  renaissance(l) {
    const wall = pick(l, [0xe0b88a, 0xd8a070, 0xe8d0a0]), roof = pick(l, [0xb0603c, 0xa45a38, 0xbc7048]), stone = 0xe2d8c4, shutter = pick(l, [0x4a6a4a, 0x6a5a3a, 0x4a5a6a]);
    const b = place(l, 0.8, 0.66, l.ld * 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xbcae94, 0xc8bca4));
    out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
    const s = storeys(l);
    out.push(...box(b.w + 0.0012, s.base + s.storey * 0.12, b.d + 0.0012, stone, { x: b.x, z: b.z }));            // rusticated base
    for (let f = 1; f < l.floors; f++) out.push(...box(b.w + 0.001, 0.0007, b.d + 0.001, stone, { x: b.x, y: s.base + f * s.storey, z: b.z })); // string course
    out.push(...box(b.w + 0.002, 0.001, b.d + 0.002, stone, { x: b.x, y: b.h - 0.001, z: b.z }));                 // cornice
    out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.22, roof, { x: b.x, y: b.h, z: b.z }));
    // An arcade on the ground floor of a wide front; windows with stone frames above.
    if (b.w > 0.05) {
      const n = Math.floor(b.w / 0.012);
      for (let i = 0; i < n; i++) out.push(onFace(b, 'front', (i - (n - 1) / 2) * (b.w / n), 0, b.w / n * 0.6, s.base + s.storey * 0.8, 0x4a3a30));
    } else out.push(onFace(b, 'front', 0, 0, 0.0055, Math.min(0.0095, s.storey * 0.75), 0x5a3e2a));
    const upper = { ...s, floors: l.floors - 1, base: s.base + s.storey };
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) {
      if (upper.floors > 0) out.push(...windows(b, f, { ...upper, w: 0.003, h: s.storey * 0.5, spacing: 0.0105, sill: s.storey * 0.25, color: 0x3a3028, frame: stone, shutter: f === 'front' ? shutter : undefined }));
      else if (f !== 'front') out.push(...windows(b, f, { ...s, w: 0.003, h: s.storey * 0.45, spacing: 0.012, sill: s.storey * 0.3, color: 0x3a3028, frame: stone }));
    }
    // A small walled garden behind, with a lemon tree.
    out.push(...tree(l.lw * 0.6, -l.ld * 0.78, 0.9, 0x5e7a3a));
    return out;
  },
  gothic(l) {
    const plaster = pick(l, [0xe8dcc0, 0xe0d0b0, 0xd8c8a0]), timber = 0x4a3828, roof = pick(l, [0x4a4e58, 0x8a4e38, 0x5a4a44]);
    const b = place(l, 0.74, 0.62, l.ld * 0.06), out: G[] = [];
    out.push(...yard(l, b, 0x7d9a55, 0x9a9488));
    const s = storeys(l);
    // A stone ground floor; the upper floors jutting out a little (jettied), half-timbered.
    out.push(...box(b.w, s.base + s.storey, b.d, 0xb8ae9a, { x: b.x, z: b.z }));
    if (l.floors > 1) {
      const up: Body = { ...b, w: b.w + 0.002, d: b.d + 0.002, y: s.base + s.storey, h: b.h - s.base - s.storey };
      out.push(...box(up.w, up.h, up.d, plaster, { x: b.x, y: up.y, z: b.z }));
      for (const f of ['front', 'left', 'right', 'back'] as Face[]) {
        const fw = faceWidth(up, f), n = Math.max(2, Math.round(fw / 0.008));
        for (let i = 0; i <= n; i++) out.push(onFace(up, f, -fw / 2 + (i * fw) / n, up.y, 0.0008, up.h, timber));
        out.push(onFace(up, f, 0, up.y + up.h / 2, fw, 0.0008, timber));
      }
    }
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(...windows({ ...b, w: b.w + 0.002, d: b.d + 0.002 }, f, { ...s, w: 0.0026, h: s.storey * 0.42, spacing: 0.009, sill: s.storey * 0.3, color: 0x2e2a28, door: true }));
    out.push(onFace(b, 'front', 0, 0, 0.005, Math.min(0.009, s.storey * 0.75), 0x4a3426));
    // A steep roof, its gable to the street; a dormer on each side; a chimney.
    const rh = Math.min(b.w * 0.7, 0.03);
    out.push(...gable(b.w + 0.004, b.d + 0.004, rh, roof, { x: b.x, y: b.h, z: b.z }, true, plaster));
    // Dormers out on the slopes (where the roof is half its height), a chimney through the ridge's side.
    for (const sx of [-1, 1]) {
      const x = b.x + sx * (b.w + 0.004) * 0.25, y = b.h + rh * 0.5 - 0.0015;
      out.push(...box(0.0042, 0.0042, 0.005, plaster, { x: x + sx * 0.0012, y, z: b.z + b.d * 0.1 }), ...gable(0.0055, 0.0056, 0.0022, roof, { x: x + sx * 0.0012, y: y + 0.0042, z: b.z + b.d * 0.1 }, false));
    }
    out.push(...box(0.0032, rh * 0.45, 0.0032, 0x8a5a44, { x: b.x + b.w * 0.18, y: b.h + rh * 0.55, z: b.z - b.d * 0.25 }));
    // A hedge at the back.
    out.push(...box(2 * l.lw * 0.9, 0.003, 0.003, 0x4f6e38, { z: -l.ld * 0.88 }), ...tree(-l.lw * 0.6, -l.ld * 0.7, 0.85, 0x4f6e38));
    return out;
  },
  brick(l) {
    const brick = pick(l, [0x9a5a44, 0x8a4e3c, 0x7a5040]), slate = pick(l, [0x50555e, 0x4a4e56, 0x5a5654]), sash = 0xe8e2d4;
    const tall = l.floors > 2;
    const b = place(l, tall ? 0.86 : 0.78, tall ? 0.72 : 0.62, l.ld * (tall ? 0.04 : 0.1)), out: G[] = [];
    out.push(...yard(l, b, tall ? 0x9a948a : 0x7d9a55, 0xa8a094));
    out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
    const s = storeys(l, 0.1);
    for (let f = 1; f < l.floors; f++) out.push(...box(b.w + 0.0008, 0.0006, b.d + 0.0008, 0xd8d0c0, { x: b.x, y: s.base + f * s.storey, z: b.z }));
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0028, h: s.storey * 0.52, spacing: 0.0085, sill: s.storey * 0.24, color: 0x2a3038, frame: sash, door: true }));
    out.push(onFace(b, 'front', 0, 0, 0.0055, Math.min(0.0095, s.storey * 0.75), 0x2a3a4a));
    if (tall) {
      // A tenement: a cornice, a flat roof with a water tank.
      out.push(...box(b.w + 0.002, 0.0014, b.d + 0.002, 0xd8d0c0, { x: b.x, y: b.h - 0.0014, z: b.z }, 0x5a5650));
      out.push(cyl(0.003, 0.003, 0.005, 7, 0x6a5038, { x: b.x - b.w * 0.25, y: b.h, z: b.z - b.d * 0.2 }), cone(0.0033, 0.002, 7, 0x4a4a4a, { x: b.x - b.w * 0.25, y: b.h + 0.005, z: b.z - b.d * 0.2 }));
    } else {
      out.push(...gable(b.w + 0.002, b.d + 0.003, Math.min(b.w, b.d) * 0.42, slate, { x: b.x, y: b.h, z: b.z }, false, brick));
    }
    // Chimneys with pots at both ends.
    for (const sx of [-1, 1]) out.push(...box(0.0034, tall ? 0.004 : Math.min(b.w, b.d) * 0.5, 0.0024, brick, { x: b.x + sx * (b.w / 2 - 0.003), y: b.h, z: b.z - b.d * 0.15 }), cyl(0.0006, 0.0006, 0.0018, 4, 0xa86a4a, { x: b.x + sx * (b.w / 2 - 0.003), y: b.h + (tall ? 0.004 : Math.min(b.w, b.d) * 0.5), z: b.z - b.d * 0.15 }));
    // Iron railings at the front; a small back yard with a tree.
    out.push(...box(2 * l.lw * 0.92, 0.0025, 0.0005, 0x2a2a2a, { z: l.ld * 0.95 }));
    if (!tall) out.push(...tree(l.lw * 0.55, -l.ld * 0.8, 0.8, 0x4f6e38));
    return out;
  },
  haussmann(l) {
    const stone = pick(l, [0xe6dcc8, 0xddd2bc, 0xe8e0cc]), zinc = pick(l, [0x6a7480, 0x5e6874, 0x707880]), iron = 0x2a2a2a;
    const b = place(l, 0.86, 0.7, l.ld * 0.05), out: G[] = [];
    out.push(...yard(l, b, 0xb0a894, 0xc0b8a8));
    const s = storeys(l, 0.08);
    out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }));
    out.push(...box(b.w + 0.0008, s.base + s.storey, b.d + 0.0008, 0xd2c6ae, { x: b.x, z: b.z }));               // rusticated ground floor
    for (let f = 1; f < l.floors; f++) out.push(...box(b.w + 0.001, 0.0006, b.d + 0.001, 0xd8ccb4, { x: b.x, y: s.base + f * s.storey, z: b.z }));
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0028, h: s.storey * 0.6, spacing: 0.0085, sill: s.storey * 0.18, color: 0x34383e, door: true }));
    out.push(onFace(b, 'front', 0, 0, 0.0065, Math.min(0.0105, s.storey * 0.8), 0x2a3a3a));
    // Wrought-iron balconies along the second and the top floors.
    for (const f of [1, l.floors - 1]) if (f >= 1 && f < l.floors) out.push(...box(b.w * 0.94, 0.0024, 0.0022, iron, { x: b.x, y: s.base + f * s.storey, z: b.z + b.d / 2 + 0.0011 }));
    // A mansard: steep zinc slopes, a flat top, dormers on the front.
    const mh = Math.max(0.006, s.storey * 0.9);
    out.push(...box(b.w + 0.0016, 0.0012, b.d + 0.0016, stone, { x: b.x, y: b.h - 0.0012, z: b.z }));
    out.push(...frustum(b.w, b.d, b.w * 0.82, b.d * 0.7, mh, zinc, { x: b.x, y: b.h, z: b.z }, zinc));
    const n = Math.max(1, Math.floor(b.w / 0.012));
    for (let i = 0; i < n; i++) {
      const x = b.x + (i - (n - 1) / 2) * (b.w / n);
      out.push(...box(0.0034, mh * 0.55, 0.003, stone, { x, y: b.h + mh * 0.15, z: b.z + b.d / 2 - 0.0035 }), ...gable(0.0042, 0.0034, 0.0016, zinc, { x, y: b.h + mh * 0.7, z: b.z + b.d / 2 - 0.0035 }, true, stone));
    }
    for (const sx of [-1, 1]) out.push(...box(0.003, mh * 1.2, 0.0022, 0xa86a4a, { x: b.x + sx * b.w * 0.36, y: b.h, z: b.z - b.d * 0.25 }));
    out.push(...tree(l.lw * 0.6, -l.ld * 0.82, 0.9, 0x5e7a44));
    return out;
  },
  modern(l) {
    const concrete = pick(l, [0xd8d8d4, 0xe8e6e0, 0xc4c2bc]), glass = pick(l, [0x6a8aa0, 0x5a7890, 0x7a98a8]), out: G[] = [];
    if (l.floors >= 12) {
      // A glass tower on a plaza: a podium, two setbacks, a crown.
      const b = place(l, 0.62, 0.62, l.ld * 0.19);
      out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8b4ac));
      const tiers = [[1, 0.42], [0.82, 0.36], [0.64, 0.22]] as const;
      let y = 0;
      for (const [k, share] of tiers) {
        const w = b.w * k, d = b.d * k, h = b.h * share, tb: Body = { x: b.x, z: b.z, w, d, y, h };
        out.push(...box(w, h, d, glass, { x: b.x, y, z: b.z }, concrete));
        // Floor bands: a pale line every few storeys.
        const bands = Math.max(2, Math.round(h / 0.012));
        for (let i = 1; i < bands; i++) for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(onFace(tb, f, 0, y + (i * h) / bands, faceWidth(tb, f), 0.0007, concrete));
        y += h;
      }
      out.push(...box(b.w * 0.3, 0.008, b.d * 0.3, concrete, { x: b.x, y, z: b.z }), cyl(0.0004, 0.0002, 0.012, 3, 0x8a8a8a, { x: b.x, y: y + 0.008, z: b.z }));
      out.push(...box(b.w * 1.15, 0.006, b.d * 1.15, concrete, { x: b.x, z: b.z }));                            // lobby podium
      out.push(onFace({ ...b, w: b.w * 1.15, d: b.d * 1.15 }, 'front', 0, 0, b.w * 0.5, 0.005, glass));
      out.push(...tree(-l.lw * 0.72, l.ld * 0.72, 0.9, 0x5e8a44), ...tree(l.lw * 0.72, l.ld * 0.72, 0.9, 0x5e8a44));
      return out;
    }
    const tall = l.floors > 2;
    const b = place(l, tall ? 0.78 : 0.62, tall ? 0.66 : 0.52, l.ld * (tall ? 0.12 : 0.2));
    out.push(...yard(l, b, tall ? 0xb8b4ac : 0x86a85a, 0xc8c4bc, 0.006));
    const s = storeys(l, 0.05);
    out.push(...box(b.w, b.h, b.d, concrete, { x: b.x, z: b.z }));
    // Ribbon windows: a glass band on each floor.
    for (let f = 0; f < l.floors; f++) for (const face of ['front', 'back', 'left', 'right'] as Face[]) {
      out.push(onFace(b, face, 0, s.base + f * s.storey + s.storey * 0.3, faceWidth(b, face) * 0.86, s.storey * 0.5, glass));
    }
    if (tall) for (let f = 1; f < l.floors; f++) out.push(...box(b.w * 0.8, 0.0006, 0.004, concrete, { x: b.x, y: s.base + f * s.storey, z: b.z + b.d / 2 + 0.002 })); // balconies
    // A roof box (plant room); for a villa, a second offset storey and a pool.
    out.push(...box(b.w * 0.3, 0.004, b.d * 0.3, concrete, { x: b.x - b.w * 0.2, y: b.h, z: b.z - b.d * 0.15 }));
    if (!tall) {
      out.push(patch(l.lw * 0.6, l.ld * 0.32, 0x5a9ac0, l.lw * 0.3, -l.ld * 0.68, 0.0007));
      out.push(shrub(-l.lw * 0.7, -l.ld * 0.7, 0.0026, 0x4f7a3a), shrub(-l.lw * 0.72, l.ld * 0.72, 0.0022, 0x5e8a44));
    }
    out.push(onFace(b, 'front', b.w * 0.25, 0, 0.006, Math.min(0.009, s.storey * 0.75), glass));
    return out;
  },
};

// ---------- the models ----------

const cache = new Map<string, G>();
// The model of a lot (cached): its parts merged, colors per vertex, no
// leaf parts (houses take only a shade per instance).
export function houseGeometry(kind: HouseKind): G {
  let g = cache.get(kind);
  if (!g) {
    const { style, fp, floors, variant } = parseHouseKind(kind);
    const [cw, cd] = FOOTPRINT_CELLS[fp];
    const lot: Lot = { lw: (cw * CELL) / 2, ld: (cd * CELL) / 2, floors, H: wallHeight(floors), v: variant, fp, rand: mulberry32(variant * 7919 + cw * 31 + cd * 131 + floors) };
    const parts = STYLE_BUILD[style](lot).map((p) => p.index ? p.toNonIndexed() : p);
    g = mergeGeometries(parts)!;
    if (!g) throw new Error(`house ${kind}`);
    for (const p of parts) p.dispose();
    g.setAttribute('leafMask', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
    g.computeVertexNormals();
    cache.set(kind, g);
  }
  return g;
}
