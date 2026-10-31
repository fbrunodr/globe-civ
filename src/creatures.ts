// Animals, modelled as living things rather than blocks: smooth bodies
// lofted along their spines (a ring of points at each section, joined into
// one skin), legs with their joints (shoulder, elbow, knee, fetlock, hoof;
// the hind leg's hock bent back), heads with their muzzles, ears, eyes and
// nostrils, manes, tails, horns, antlers, tusks and wool. Painted miniatures
// in the props' way: per-vertex colours, the coat marked leaf (each
// instance's own colour: a herd of bays and greys and chestnuts from one
// model), shaded (a lighter belly, a darker muzzle). Smooth-shaded: drawn
// with the props' smooth material (propMaterial.ts `smooth`).
//
// Built in metres, facing +x, standing on y = 0; CREATURE_SCALE turns that
// into tile steps (the countryside's models, rural/models.ts). The shared
// loft (loft, smooth, ellipsoid, finish) also builds the people (people.ts).

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// A metre, in tile steps (a cow stands about 0.005 at the withers).
export const CREATURE_SCALE = 0.0036;

// ---- painting ----
// A fixed colour, or the coat: the instance's colour (leaf), shaded.
export type Paint = number | { readonly coat: number };
export const COAT: Paint = { coat: 1 };
export const coat = (shade: number): Paint => ({ coat: shade });
type PaintFn = (p: THREE.Vector3, along?: number, around?: number) => Paint;

const tmpC = new THREE.Color();
// Sets a geometry's colours (and leaf mask) from a paint, per vertex, and
// returns it unindexed (its smooth normals kept), ready to merge.
// (`paint`: one for all, by place, or one per vertex.)
export function finish(geo: THREE.BufferGeometry, paint: Paint | ((p: THREE.Vector3) => Paint) | readonly Paint[]): THREE.BufferGeometry {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position'), n = pos.count;
  const col = new Float32Array(n * 3), mask = new Float32Array(n), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const pt = Array.isArray(paint) ? (paint as readonly Paint[])[i]! : typeof paint === 'function' ? paint(p.fromBufferAttribute(pos, i)) : (paint as Paint);
    if (typeof pt === 'number') { tmpC.setHex(pt); col.set([tmpC.r, tmpC.g, tmpC.b], i * 3); }
    else { col.set([pt.coat, pt.coat, pt.coat], i * 3); mask[i] = 1; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('leafMask', new THREE.BufferAttribute(mask, 1));
  return geo.index ? geo.toNonIndexed() : geo;
}

// ---- lofting ----
// A section of a body: its middle, its half extents across (a: in the
// plane of the path and up, b: sideways).
export interface Sec { readonly x: number; readonly y: number; readonly z: number; readonly a: number; readonly b: number }
export const S = (x: number, y: number, a: number, b: number, z = 0): Sec => ({ x, y, z, a, b });

// A smooth run of sections through `keys` (Catmull-Rom), `per` to a span.
export function smooth(keys: readonly Sec[], per: number): Sec[] {
  if (keys.length < 3) return [...keys];
  const out: Sec[] = [];
  const k = (i: number) => keys[Math.max(0, Math.min(keys.length - 1, i))]!;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < keys.length - 1; i++) {
    for (let j = 0; j < per; j++) {
      const t = j / per, a = k(i - 1), b = k(i), c = k(i + 1), d = k(i + 2);
      out.push({ x: cr(a.x, b.x, c.x, d.x, t), y: cr(a.y, b.y, c.y, d.y, t), z: cr(a.z, b.z, c.z, d.z, t), a: Math.max(0.0005, cr(a.a, b.a, c.a, d.a, t)), b: Math.max(0.0005, cr(a.b, b.b, c.b, d.b, t)) });
    }
  }
  out.push(keys[keys.length - 1]!);
  return out;
}

// A skin round sections along a path: `radial` points a ring, each ring
// square to the path (its sideways axis carried along it, so it never
// twists), the ends closed. `side`: the first ring's sideways axis
// (default: +z, across a body facing +x). Smooth normals.
export function loft(secs: readonly Sec[], radial: number, paint: Paint | PaintFn, side = new THREE.Vector3(0, 0, 1), caps = true): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [], paints: Paint[] = [];
  const P = secs.map((s) => new THREE.Vector3(s.x, s.y, s.z));
  let Sd = side.clone();
  const T = new THREE.Vector3(), U = new THREE.Vector3(), v = new THREE.Vector3();
  const n = secs.length;
  for (let i = 0; i < n; i++) {
    T.subVectors(P[Math.min(n - 1, i + 1)]!, P[Math.max(0, i - 1)]!).normalize();
    Sd.addScaledVector(T, -Sd.dot(T));
    if (Sd.lengthSq() < 1e-8) Sd = new THREE.Vector3(1, 0, 0).addScaledVector(T, -T.x);
    Sd.normalize();
    U.crossVectors(Sd, T).normalize();
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      v.copy(P[i]!).addScaledVector(U, Math.cos(th) * secs[i]!.a).addScaledVector(Sd, Math.sin(th) * secs[i]!.b);
      pos.push(v.x, v.y, v.z);
      paints.push(typeof paint === 'function' ? paint(v, i / (n - 1), th) : paint);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);
  }
  if (caps) {
    for (const [ring, flip] of [[0, true], [n - 1, false]] as const) {
      const c = pos.length / 3, p = P[ring]!;
      pos.push(p.x, p.y, p.z);
      paints.push(paints[ring * radial]!);
      for (let j = 0; j < radial; j++) {
        const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
        if (flip) idx.push(c, a, b); else idx.push(c, b, a);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return finish(g, paints);
}

// A limb or any tube: a smooth run through points with their radii
// (round, or `flat` times as wide sideways).
export function tube(points: readonly (readonly [number, number, number])[], radii: readonly number[], paint: Paint | PaintFn, radial = 8, per = 3, flat = 1, side?: THREE.Vector3): THREE.BufferGeometry {
  return loft(smooth(points.map(([x, y, z], i) => S(x, y, radii[i]!, radii[i]! * flat, z)), per), radial, paint, side);
}

// An ellipsoid (smooth), at c with half extents r, turned by `rot` (Euler).
export function ellipsoid(c: readonly [number, number, number], r: readonly [number, number, number], paint: Paint | ((p: THREE.Vector3) => Paint), seg = 10, rot?: readonly [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.7)));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))), new THREE.Vector3(...r)));
  return finish(g, paint);
}
// A cone along a path (horns, ears, tusks): a tube tapering to a point.
export function horn(points: readonly (readonly [number, number, number])[], r0: number, paint: Paint, radial = 6, flat = 1): THREE.BufferGeometry {
  const n = points.length;
  return tube(points, points.map((_, i) => Math.max(0.002, r0 * (1 - i / (n - 1)) ** 1.1)), paint, radial, 3, flat);
}
// A lumpy fleece (or any bumpy mass): an ellipsoid whose surface swells in
// curls (a hash of the direction), smooth-shaded.
export function fleece(c: readonly [number, number, number], r: readonly [number, number, number], paint: Paint | ((p: THREE.Vector3) => Paint), lump = 0.12, detail = 3): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const h = Math.sin(v.x * 23.1 + v.y * 7.3) * Math.sin(v.y * 19.7 + v.z * 5.1) * Math.sin(v.z * 17.3 + v.x * 11.9);
    v.multiplyScalar(1 + lump * h);
    pos.setXYZ(i, c[0] + v.x * r[0], c[1] + v.y * r[1], c[2] + v.z * r[2]);
  }
  g.computeVertexNormals();
  return finish(g, paint);
}
// Both sides: a part and its mirror across the body's middle (z).
export const pair = (make: (s: 1 | -1) => THREE.BufferGeometry[]): THREE.BufferGeometry[] => [...make(1), ...make(-1)];

// ---- colours ----
const HOOF = 0x2c2622, EYE = 0x100c0a, NOSE = 0x2a201c, HORN = 0xd8ccb0, TUSK = 0xf0e8d4, PINK = 0xc89488;
const DARK_MANE = 0x241a14;

// A leg: from the body down to the ground, its foot (below `foot` high) the hoof's colour.
const leg = (pts: readonly (readonly [number, number])[], radii: readonly number[], z: number, foot: number, footColor: number, legPaint: Paint | ((p: THREE.Vector3) => Paint) = COAT, radial = 8) =>
  tube(pts.map(([x, y]) => [x, y, z] as const), radii, (p) => (p.y < foot ? footColor : typeof legPaint === 'function' ? legPaint(p) : legPaint), radial, 3);
// Lighter underneath (belly, throat): the coat shaded by height in the body.
const bellied = (mid: number, depth: number, light = 1.18, dark = 0.92): PaintFn => (p) => coat(p.y < mid - depth * 0.45 ? light : p.y > mid + depth * 0.6 ? dark : 1);

// ---- the animals ----
export type Species = 'horse' | 'cow' | 'pied' | 'ox' | 'sheep' | 'mouflon' | 'deer' | 'stag' | 'elephant' | 'fox';

// A horse, its legs apart (a rider's horse swings them: unitModels.ts):
// front and hind, on its left (+z) and right.
export interface HorseParts { readonly body: THREE.BufferGeometry[]; readonly legs: { readonly fl: THREE.BufferGeometry; readonly fr: THREE.BufferGeometry; readonly hl: THREE.BufferGeometry; readonly hr: THREE.BufferGeometry } }
export function horseParts(): HorseParts {
  const body = loft(smooth([S(-0.86, 1.13, 0.05, 0.05), S(-0.8, 1.13, 0.25, 0.21), S(-0.58, 1.15, 0.33, 0.27), S(-0.22, 1.1, 0.33, 0.26), S(0.14, 1.09, 0.36, 0.28), S(0.48, 1.13, 0.33, 0.24), S(0.66, 1.13, 0.26, 0.2), S(0.74, 1.16, 0.09, 0.09)], 3), 14, bellied(1.1, 0.34));
  const neck = loft(smooth([S(0.38, 1.22, 0.3, 0.2), S(0.6, 1.45, 0.22, 0.15), S(0.8, 1.66, 0.16, 0.11), S(0.94, 1.79, 0.14, 0.1)], 3), 12, COAT);
  const head = loft(smooth([S(0.88, 1.85, 0.07, 0.07), S(0.93, 1.82, 0.13, 0.1), S(1.06, 1.73, 0.13, 0.11), S(1.22, 1.6, 0.09, 0.075), S(1.35, 1.49, 0.075, 0.066), S(1.41, 1.44, 0.05, 0.05)], 3), 12, (p) => (p.x > 1.3 ? coat(0.7) : COAT));
  const mane = loft(smooth([S(0.95, 1.9, 0.03, 0.02), S(0.86, 1.86, 0.07, 0.03), S(0.7, 1.7, 0.07, 0.03), S(0.52, 1.55, 0.06, 0.03), S(0.34, 1.47, 0.03, 0.02)], 3), 6, DARK_MANE);
  const tail = tube([[-0.84, 1.2, 0], [-0.95, 1.12, 0], [-1.02, 0.9, 0], [-1.04, 0.62, 0], [-1.03, 0.5, 0]], [0.06, 0.07, 0.08, 0.09, 0.02], DARK_MANE, 8, 3, 0.7);
  const front = (s: number) => leg([[0.5, 1.05], [0.48, 0.8], [0.5, 0.62], [0.52, 0.45], [0.53, 0.26], [0.55, 0.12], [0.58, 0.05], [0.6, 0]], [0.13, 0.09, 0.07, 0.055, 0.04, 0.05, 0.045, 0.055], s * 0.14, 0.07, HOOF, COAT, 7);
  const hind = (s: number) => leg([[-0.55, 1.05], [-0.42, 0.78], [-0.55, 0.58], [-0.62, 0.45], [-0.6, 0.26], [-0.58, 0.12], [-0.56, 0.05], [-0.54, 0]], [0.16, 0.12, 0.07, 0.055, 0.042, 0.05, 0.045, 0.055], s * 0.15, 0.07, HOOF, COAT, 7);
  const rest = pair((s) => [
    horn([[0.92, 1.89, s * 0.05], [0.935, 1.94, s * 0.058], [0.95, 1.98, s * 0.06]], 0.026, COAT, 5, 0.55),
    ellipsoid([1.04, 1.78, s * 0.095], [0.022, 0.022, 0.016], EYE, 6),
    ellipsoid([1.4, 1.46, s * 0.035], [0.016, 0.012, 0.012], NOSE, 5),
  ]);
  return { body: [body, neck, head, mane, tail, ...rest], legs: { fl: front(1), fr: front(-1), hl: hind(1), hr: hind(-1) } };
}
function horse(): THREE.BufferGeometry[] {
  const h = horseParts();
  return [...h.body, h.legs.fl, h.legs.fr, h.legs.hl, h.legs.hr];
}

function cow(pied: boolean, ox = false): THREE.BufferGeometry[] {
  // (A pied cow: white patches over the coat, where a hash of the place says.)
  const patch = (p: THREE.Vector3) => Math.sin(p.x * 6.1 + 1.3) * Math.sin(p.y * 5.3 + p.z * 4.1) + 0.6 * Math.sin(p.z * 7.7 + p.x * 3.9) > 0.15;
  const skin = (shade: number | PaintFn): PaintFn => (p, a, b) => (pied && patch(p) ? 0xece8de : typeof shade === 'number' ? coat(shade) : shade(p, a, b));
  const body = loft(smooth([S(-0.94, 0.98, 0.05, 0.05), S(-0.88, 0.99, 0.3, 0.27), S(-0.62, 1.0, 0.4, 0.36), S(-0.15, 0.92, 0.46, 0.4), S(0.4, 0.95, 0.42, 0.32), S(0.66, 0.93, 0.32, 0.24), S(0.74, 0.95, 0.1, 0.1)], 3), 14, skin(bellied(0.95, 0.44)));
  const neck = loft(smooth([S(0.52, 1.02, 0.3, 0.22), S(0.72, 1.07, 0.25, 0.18), S(0.9, 1.12, 0.21, 0.15)], 3), 12, skin(1));
  const dewlap = ellipsoid([0.72, 0.8, 0], [0.2, 0.15, 0.05], COAT, 8);
  const head = loft(smooth([S(0.86, 1.22, 0.08, 0.08), S(0.9, 1.2, 0.16, 0.13), S(1.05, 1.06, 0.15, 0.12), S(1.22, 0.89, 0.12, 0.1), S(1.32, 0.79, 0.1, 0.095), S(1.36, 0.75, 0.06, 0.06)], 3), 12, (p) => (p.x > 1.27 ? (ox ? NOSE : PINK) : pied && p.x < 1.1 && patch(p) ? 0xece8de : COAT));
  const tail = tube([[-0.92, 1.14, 0], [-0.98, 0.95, 0], [-1.0, 0.6, 0], [-1.0, 0.48, 0], [-1.0, 0.4, 0]], [0.03, 0.025, 0.022, 0.06, 0.02], (p) => (p.y < 0.52 ? DARK_MANE : COAT), 6);
  const parts = [body, neck, dewlap, head, tail, ...pair((s) => [
    leg([[0.45, 0.78], [0.43, 0.5], [0.45, 0.3], [0.46, 0.12], [0.47, 0.04], [0.48, 0]], [0.12, 0.085, 0.055, 0.045, 0.05, 0.056], s * 0.2, 0.06, HOOF, skin(1)),
    leg([[-0.62, 0.86], [-0.52, 0.55], [-0.62, 0.35], [-0.6, 0.12], [-0.58, 0.04], [-0.57, 0]], [0.17, 0.1, 0.055, 0.045, 0.05, 0.056], s * 0.21, 0.06, HOOF, skin(1)),
    ellipsoid([0.93, 1.18, s * 0.17], [0.09, 0.035, 0.06], COAT, 6, [0, 0, s * 0.3]),
    horn(ox ? [[0.9, 1.28, s * 0.09], [0.9, 1.32, s * 0.22], [0.95, 1.45, s * 0.3], [1.0, 1.55, s * 0.28]] : [[0.9, 1.28, s * 0.09], [0.9, 1.31, s * 0.16], [0.93, 1.37, s * 0.2]], ox ? 0.04 : 0.028, HORN, 6),
    ellipsoid([1.04, 1.13, s * 0.12], [0.024, 0.024, 0.018], EYE, 6),
    ellipsoid([1.35, 0.79, s * 0.04], [0.016, 0.012, 0.012], NOSE, 5),
  ])];
  if (!ox) parts.push(ellipsoid([-0.42, 0.55, 0], [0.15, 0.1, 0.13], PINK, 8), ...[[-0.36, 0.06], [-0.48, 0.06], [-0.36, -0.06], [-0.48, -0.06]].map(([x, z]) => tube([[x!, 0.48, z!], [x!, 0.4, z!]], [0.016, 0.012], PINK, 5, 1)));
  return parts;
}

function sheep(wild: boolean): THREE.BufferGeometry[] {
  if (wild) {
    // The mouflon: slim, a russet coat with a pale saddle and belly, and great curled horns.
    const body = loft(smooth([S(-0.48, 0.6, 0.04, 0.04), S(-0.44, 0.6, 0.15, 0.13), S(-0.25, 0.62, 0.19, 0.16), S(0.12, 0.6, 0.2, 0.16), S(0.34, 0.63, 0.17, 0.13), S(0.42, 0.66, 0.06, 0.06)], 3), 12, (p) => coat(p.y < 0.5 ? 1.7 : p.y > 0.72 && p.x < 0.0 && p.x > -0.25 ? 1.35 : 1));
    const neck = loft(smooth([S(0.28, 0.68, 0.13, 0.1), S(0.4, 0.8, 0.1, 0.08), S(0.48, 0.88, 0.09, 0.07)], 3), 10, COAT);
    const head = loft(smooth([S(0.44, 0.94, 0.05, 0.05), S(0.48, 0.92, 0.08, 0.065), S(0.58, 0.85, 0.07, 0.055), S(0.66, 0.78, 0.045, 0.04), S(0.69, 0.76, 0.03, 0.03)], 3), 10, (p) => (p.x > 0.62 ? coat(1.6) : COAT));
    return [body, neck, head, tube([[-0.46, 0.64, 0], [-0.5, 0.58, 0], [-0.51, 0.52, 0]], [0.03, 0.03, 0.01], DARK_MANE, 5, 2), ...pair((s) => [
      leg([[0.28, 0.5], [0.27, 0.32], [0.28, 0.14], [0.29, 0.03], [0.3, 0]], [0.06, 0.035, 0.025, 0.026, 0.028], s * 0.09, 0.03, HOOF, (p) => coat(p.y < 0.2 ? 1.7 : 1)),
      leg([[-0.32, 0.54], [-0.26, 0.36], [-0.34, 0.2], [-0.33, 0.03], [-0.32, 0]], [0.08, 0.05, 0.027, 0.026, 0.028], s * 0.09, 0.03, HOOF, (p) => coat(p.y < 0.2 ? 1.7 : 1)),
      // (The horn sweeps back, down and forward round the ear, a spiral.)
      horn(Array.from({ length: 9 }, (_, i) => { const a = i * 0.62; return [0.47 - 0.07 * Math.sin(a) - i * 0.004, 0.96 + 0.07 * Math.cos(a) - 0.02 * i / 8 - 0.05, s * (0.05 + i * 0.012)] as const; }), 0.035, 0xb8a888, 6),
      ellipsoid([0.48, 0.95, s * 0.06], [0.04, 0.018, 0.03], COAT, 5, [0, 0, s * 0.5]),
      ellipsoid([0.55, 0.89, s * 0.052], [0.014, 0.014, 0.01], EYE, 5),
    ])];
  }
  // A woolly sheep: the fleece (the coat), a dark face and legs.
  const FACE = 0x2e2824;
  return [
    fleece([-0.04, 0.6, 0], [0.5, 0.27, 0.27], (p) => coat(p.y < 0.45 ? 0.85 : 1), 0.07, 3),
    fleece([0.36, 0.7, 0], [0.16, 0.17, 0.15], COAT, 0.09, 2),
    loft(smooth([S(0.44, 0.8, 0.05, 0.05), S(0.48, 0.78, 0.085, 0.065), S(0.58, 0.68, 0.065, 0.05), S(0.64, 0.6, 0.045, 0.04), S(0.66, 0.58, 0.03, 0.03)], 3), 10, FACE),
    fleece([0.47, 0.84, 0], [0.07, 0.05, 0.07], COAT, 0.1, 1),
    ellipsoid([-0.53, 0.62, 0], [0.05, 0.06, 0.04], COAT, 6),
    ...pair((s) => [
      leg([[0.26, 0.42], [0.26, 0.25], [0.27, 0.1], [0.27, 0.02], [0.28, 0]], [0.04, 0.03, 0.024, 0.025, 0.027], s * 0.12, 0.025, HOOF, FACE),
      leg([[-0.3, 0.42], [-0.27, 0.26], [-0.32, 0.12], [-0.31, 0.02], [-0.3, 0]], [0.045, 0.032, 0.024, 0.025, 0.027], s * 0.12, 0.025, HOOF, FACE),
      ellipsoid([0.48, 0.79, s * 0.08], [0.06, 0.018, 0.03], FACE, 5, [0, s * 0.3, s * -0.4]),
      ellipsoid([0.53, 0.76, s * 0.05], [0.012, 0.012, 0.01], EYE, 5),
    ]),
  ];
}

function deer(stag: boolean): THREE.BufferGeometry[] {
  const RUMP = 0xf2ece0;
  const body = loft(smooth([S(-0.6, 0.86, 0.04, 0.04), S(-0.56, 0.86, 0.17, 0.14), S(-0.38, 0.88, 0.22, 0.17), S(0.0, 0.84, 0.23, 0.17), S(0.32, 0.87, 0.22, 0.15), S(0.46, 0.9, 0.15, 0.12), S(0.5, 0.92, 0.05, 0.05)], 3), 12,
    (p) => (p.x < -0.5 && p.y > 0.78 ? RUMP : coat(p.y < 0.72 ? 1.3 : 1)));
  const neck = loft(smooth([S(0.3, 0.95, 0.17, 0.12), S(0.44, 1.15, 0.11, 0.08), S(0.52, 1.32, 0.085, 0.07)], 3), 10, COAT);
  const head = loft(smooth([S(0.48, 1.4, 0.05, 0.05), S(0.52, 1.38, 0.08, 0.07), S(0.62, 1.31, 0.065, 0.055), S(0.72, 1.24, 0.04, 0.035), S(0.75, 1.22, 0.025, 0.025)], 3), 10, (p) => (p.x > 0.7 ? NOSE : COAT));
  const parts = [body, neck, head, tube([[-0.59, 0.92, 0], [-0.64, 0.88, 0], [-0.66, 0.82, 0]], [0.035, 0.035, 0.012], RUMP, 5, 2), ...pair((s) => [
    leg([[0.34, 0.76], [0.33, 0.52], [0.35, 0.3], [0.36, 0.1], [0.37, 0.03], [0.38, 0]], [0.08, 0.05, 0.032, 0.026, 0.028, 0.03], s * 0.1, 0.035, HOOF),
    leg([[-0.4, 0.8], [-0.3, 0.56], [-0.42, 0.36], [-0.41, 0.1], [-0.4, 0.03], [-0.39, 0]], [0.11, 0.07, 0.032, 0.026, 0.028, 0.03], s * 0.1, 0.035, HOOF),
    ellipsoid([0.52, 1.46, s * 0.07], [0.035, 0.07, 0.022], COAT, 6, [s * -0.5, 0, s * -0.3]),
    ellipsoid([0.6, 1.36, s * 0.055], [0.016, 0.016, 0.012], EYE, 5),
  ])];
  if (stag) parts.push(...pair((s) => {
    // Antlers: a beam sweeping up and back, its tines forward and up.
    const ANT = 0xcdb998, beam: [number, number, number][] = [[0.52, 1.45, s * 0.04], [0.5, 1.58, s * 0.1], [0.44, 1.74, s * 0.16], [0.38, 1.86, s * 0.18], [0.36, 1.95, s * 0.17]];
    return [horn(beam, 0.022, ANT, 5), ...[[1, 0.08], [2, 0.09], [3, 0.07]].map(([i, l]) => { const b = beam[i!]!; return horn([b, [b[0] + l! * 0.8, b[1] + l! * 0.7, b[2]]], 0.014, ANT, 4); })];
  }));
  return parts;
}

function elephant(): THREE.BufferGeometry[] {
  const SKIN = (p: THREE.Vector3) => coat(p.y < 1.4 ? 0.88 : 1);
  const body = loft(smooth([S(-1.55, 2.05, 0.15, 0.15), S(-1.45, 2.05, 0.82, 0.72), S(-0.6, 2.12, 1.05, 0.92), S(0.35, 2.15, 1.05, 0.88), S(0.95, 2.22, 0.9, 0.76), S(1.2, 2.3, 0.45, 0.45)], 3), 16, SKIN);
  const head = ellipsoid([1.42, 2.55, 0], [0.62, 0.72, 0.55], COAT, 14);
  const trunk = tube([[1.85, 2.45, 0], [2.08, 2.0, 0], [2.18, 1.4, 0], [2.16, 0.8, 0], [2.24, 0.42, 0], [2.36, 0.34, 0]], [0.27, 0.22, 0.17, 0.13, 0.1, 0.09], COAT, 10, 3);
  const tail = tube([[-1.5, 2.3, 0], [-1.62, 1.9, 0], [-1.64, 1.3, 0], [-1.64, 1.15, 0]], [0.05, 0.04, 0.03, 0.05], (p) => (p.y < 1.25 ? DARK_MANE : COAT), 6);
  return [body, head, trunk, tail, ...pair((s) => [
    leg([[0.75, 1.7], [0.74, 1.0], [0.76, 0.3], [0.77, 0.06], [0.77, 0]], [0.42, 0.34, 0.3, 0.33, 0.33], s * 0.48, 0.07, 0x6a625a, SKIN, 10),
    leg([[-0.95, 1.75], [-0.9, 1.0], [-0.98, 0.3], [-0.98, 0.06], [-0.98, 0]], [0.46, 0.34, 0.3, 0.33, 0.33], s * 0.5, 0.07, 0x6a625a, SKIN, 10),
    // The ears: great flaps against the head's sides.
    ellipsoid([1.15, 2.45, s * 0.6], [0.48, 0.66, 0.06], coat(0.92), 10, [0, s * 0.45, s * -0.1]),
    horn([[1.85, 1.95, s * 0.22], [2.15, 1.55, s * 0.28], [2.5, 1.45, s * 0.3], [2.75, 1.62, s * 0.28]], 0.09, TUSK, 8),
    ellipsoid([1.78, 2.75, s * 0.42], [0.04, 0.04, 0.03], EYE, 6),
  ])];
}

function fox(): THREE.BufferGeometry[] {
  const WHITE = 0xf2ece4, SOCK = 0x2a201a;
  const under = (p: THREE.Vector3) => (p.y < 0.24 && p.x > -0.1 ? WHITE : COAT);
  const body = loft(smooth([S(-0.36, 0.3, 0.03, 0.03), S(-0.32, 0.3, 0.085, 0.075), S(-0.1, 0.31, 0.1, 0.08), S(0.16, 0.32, 0.1, 0.08), S(0.3, 0.34, 0.07, 0.06), S(0.34, 0.36, 0.03, 0.03)], 3), 10, under);
  const neck = loft(smooth([S(0.24, 0.36, 0.08, 0.065), S(0.34, 0.42, 0.065, 0.055), S(0.4, 0.46, 0.06, 0.05)], 3), 10, (p) => (p.y < 0.4 ? WHITE : COAT));
  const head = loft(smooth([S(0.36, 0.5, 0.03, 0.03), S(0.4, 0.49, 0.065, 0.06), S(0.48, 0.46, 0.045, 0.04), S(0.56, 0.43, 0.022, 0.02), S(0.58, 0.425, 0.01, 0.01)], 3), 10, (p) => (p.x > 0.555 ? NOSE : p.y < 0.45 ? WHITE : COAT));
  const tail = tube([[-0.33, 0.32, 0], [-0.46, 0.3, 0], [-0.6, 0.24, 0], [-0.72, 0.2, 0], [-0.78, 0.2, 0]], [0.04, 0.07, 0.075, 0.06, 0.02], (p) => (p.x < -0.68 ? WHITE : COAT), 8, 3);
  return [body, neck, head, tail, ...pair((s) => [
    leg([[0.22, 0.26], [0.22, 0.14], [0.23, 0.03], [0.24, 0]], [0.035, 0.022, 0.018, 0.02], s * 0.05, 0.12, SOCK),
    leg([[-0.24, 0.28], [-0.2, 0.16], [-0.26, 0.06], [-0.25, 0]], [0.045, 0.026, 0.018, 0.02], s * 0.05, 0.1, SOCK),
    horn([[0.4, 0.53, s * 0.035], [0.39, 0.58, s * 0.045], [0.38, 0.63, s * 0.05]], 0.03, COAT, 5, 0.45),
    ellipsoid([0.47, 0.49, s * 0.035], [0.01, 0.009, 0.008], EYE, 5),
  ])];
}

export function creature(sp: Species): THREE.BufferGeometry[] {
  switch (sp) {
    case 'horse': return horse();
    case 'cow': return cow(false);
    case 'pied': return cow(true);
    case 'ox': return cow(false, true);
    case 'sheep': return sheep(false);
    case 'mouflon': return sheep(true);
    case 'deer': return deer(false);
    case 'stag': return deer(true);
    case 'elephant': return elephant();
    case 'fox': return fox();
  }
}
// A creature in tile steps (scaled by CREATURE_SCALE, times `s`).
export function creatureModel(sp: Species, s = 1): THREE.BufferGeometry[] {
  const m = new THREE.Matrix4().makeScale(CREATURE_SCALE * s, CREATURE_SCALE * s, CREATURE_SCALE * s);
  return creature(sp).map((g) => g.applyMatrix4(m));
}
