// Animals, low-poly in the PS1's way (lowpoly.ts): a body hull along the
// spine (a ridge on top, flat flanks), box legs with their joints (the hind
// leg's hock bent back), a box head with its muzzle, spikes for ears,
// horns, tusks and tails; each at most about LOWPOLY_BUDGET triangles.
// Painted miniatures in the props' way: per-vertex colours, the coat marked
// leaf (each instance's own colour: a herd of bays and greys and chestnuts
// from one model), shaded (a lighter belly, a darker muzzle, dark hooves).
//
// Built in metres, facing +x, standing on y = 0; CREATURE_SCALE turns that
// into tile steps (the countryside's models, rural/models.ts). The smooth
// loft above it (loft, smooth, tube, ellipsoid, fleece, finish) builds the
// countryside's props (rural/kit.ts).

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { hull, limb, spike, gem, plate, R, type HullOpts, type LpPaint, type V3 } from './lowpoly.ts';

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
const HOOF = 0x2c2622, NOSE = 0x2a201c, HORN = 0xd8ccb0, TUSK = 0xf0e8d4, PINK = 0xc89488;
const DARK_MANE = 0x241a14;

// A leg: box sections through its joints down to the ground, its foot
// (below `foot` high, face by face) the hoof's colour.
const leg = (pts: readonly (readonly [number, number])[], radii: readonly number[], z: number, foot: number, footColor: number, legPaint: LpPaint = COAT) =>
  limb(pts.map(([x, y]) => [x, y, z] as const), radii, (p) => (p.y < foot ? footColor : typeof legPaint === 'function' ? legPaint(p) : legPaint), 4, { caps: [false, false], faces: true });
// Lighter underneath (belly, throat): the coat shaded by height in the body.
const bellied = (below: number, light = 1.18): LpPaint => (p) => coat(p.y < below ? light : 1);
// A body along the spine: rings (x, y, depth, width), from a point at the
// rump to the chest, closed there (the neck goes on from it).
const body = (rump: V3, rings: readonly (readonly [number, number, number, number])[], paint: LpPaint, o: HullOpts = {}) =>
  hull([R(rump, 0, 0), ...rings.map(([x, y, a, b]) => R([x, y, 0], a, b))], 6, paint, o);

// ---- the animals ----
export type Species = 'horse' | 'cow' | 'pied' | 'ox' | 'sheep' | 'mouflon' | 'deer' | 'stag' | 'elephant' | 'fox';

// A horse, its legs apart (a rider's horse swings them: unitModels.ts):
// front and hind, on its left (+z) and right.
export interface HorseParts { readonly body: THREE.BufferGeometry[]; readonly legs: { readonly fl: THREE.BufferGeometry; readonly fr: THREE.BufferGeometry; readonly hl: THREE.BufferGeometry; readonly hr: THREE.BufferGeometry } }
export function horseParts(): HorseParts {
  const trunk = body([-0.92, 1.16, 0], [[-0.7, 1.15, 0.33, 0.26], [0.22, 1.1, 0.37, 0.28], [0.62, 1.15, 0.3, 0.22]], bellied(0.98));
  const neck = hull([R([0.42, 1.2, 0], 0.27, 0.17), R([0.9, 1.76, 0], 0.15, 0.1)], 4, COAT, { caps: [false, false] });
  const head = hull([R([0.86, 1.87, 0], 0.11, 0.09), R([1.04, 1.74, 0], 0.13, 0.1), R([1.4, 1.46, 0], 0.075, 0.064)], 4, (p) => (p.x > 1.3 ? coat(0.55) : COAT));
  const mane = hull([R([0.97, 1.94, 0], 0.05, 0.025), R([0.66, 1.64, 0], 0.08, 0.03), R([0.34, 1.4, 0], 0, 0)], 3, DARK_MANE, { side: [0, 0, 1], turn: 0 });
  const tail = spike([[-0.86, 1.24, 0], [-1.0, 1.02, 0], [-1.05, 0.58, 0]], 0.075, DARK_MANE, 3, 0.7);
  const front = (s: number) => leg([[0.5, 1.05], [0.5, 0.55], [0.55, 0.12], [0.58, 0]], [0.1, 0.055, 0.042, 0.055], s * 0.14, 0.1, HOOF);
  const hind = (s: number) => leg([[-0.58, 1.05], [-0.64, 0.46], [-0.57, 0.12], [-0.54, 0]], [0.14, 0.06, 0.042, 0.055], s * 0.15, 0.1, HOOF);
  const ears = pair((s) => [spike([[0.92, 1.9, s * 0.05], [0.95, 2.02, s * 0.065]], 0.032, COAT, 3, 0.6)]);
  return { body: [trunk, neck, head, mane, tail, ...ears], legs: { fl: front(1), fr: front(-1), hl: hind(1), hr: hind(-1) } };
}
function horse(): THREE.BufferGeometry[] {
  const h = horseParts();
  return [...h.body, h.legs.fl, h.legs.fr, h.legs.hl, h.legs.hr];
}

function cow(pied: boolean, ox = false): THREE.BufferGeometry[] {
  // (A pied cow: white patches over the coat, face by face where a hash of the place says.)
  const patch = (p: THREE.Vector3) => Math.sin(p.x * 6.1 + 1.3) * Math.sin(p.y * 5.3 + p.z * 4.1) + 0.6 * Math.sin(p.z * 7.7 + p.x * 3.9) > 0.15;
  const skin = (inner: LpPaint): LpPaint => (p) => (pied && patch(p) ? 0xece8de : typeof inner === 'function' ? inner(p) : inner);
  const parts = [
    body([-0.98, 0.98, 0], [[-0.8, 1.0, 0.38, 0.32], [0.3, 0.94, 0.45, 0.37], [0.66, 0.96, 0.34, 0.26]], skin(bellied(0.7)), { faces: pied }),
    hull([R([0.55, 1.0, 0], 0.3, 0.22), R([0.88, 1.1, 0], 0.2, 0.15)], 4, skin(COAT), { caps: [false, false], faces: pied }),
    hull([R([0.86, 1.22, 0], 0.14, 0.13), R([1.06, 1.04, 0], 0.14, 0.12), R([1.34, 0.78, 0], 0.1, 0.09)], 4, (p) => (p.x > 1.25 ? (ox ? NOSE : PINK) : COAT)),
    spike([[-0.95, 1.12, 0], [-1.0, 0.75, 0], [-1.0, 0.4, 0]], 0.04, (p) => (p.y < 0.55 ? DARK_MANE : COAT)),
    ...pair((s) => [
      leg([[0.45, 0.8], [0.44, 0.42], [0.47, 0]], [0.1, 0.06, 0.055], s * 0.2, 0.07, HOOF, skin(COAT)),
      leg([[-0.62, 0.86], [-0.6, 0.38], [-0.57, 0]], [0.14, 0.06, 0.055], s * 0.21, 0.07, HOOF, skin(COAT)),
      spike([[0.92, 1.18, s * 0.1], [0.95, 1.16, s * 0.27]], 0.045, COAT, 3, 0.5),
      spike(ox ? [[0.9, 1.28, s * 0.09], [0.92, 1.34, s * 0.26], [1.0, 1.55, s * 0.3]] : [[0.9, 1.28, s * 0.09], [0.91, 1.31, s * 0.17], [0.95, 1.4, s * 0.21]], ox ? 0.045 : 0.032, HORN),
    ]),
  ];
  if (!ox) parts.push(gem([-0.42, 0.56, 0], [0.15, 0.1, 0.13], PINK, 3));
  return parts;
}

function sheep(wild: boolean): THREE.BufferGeometry[] {
  if (wild) {
    // The mouflon: slim, a russet coat with a pale saddle and belly, and great curled horns.
    const paint: LpPaint = (p) => coat(p.y < 0.5 ? 1.7 : p.y > 0.7 && p.x < 0.0 && p.x > -0.3 ? 1.35 : 1);
    return [
      body([-0.5, 0.62, 0], [[-0.36, 0.62, 0.18, 0.15], [0.12, 0.6, 0.2, 0.16], [0.36, 0.64, 0.16, 0.12]], paint),
      hull([R([0.3, 0.68, 0], 0.13, 0.1), R([0.47, 0.88, 0], 0.09, 0.07)], 4, COAT, { caps: [false, false] }),
      hull([R([0.44, 0.95, 0], 0.07, 0.06), R([0.52, 0.9, 0], 0.075, 0.06), R([0.7, 0.76, 0], 0.035, 0.032)], 4, (p) => (p.x > 0.62 ? coat(1.6) : COAT)),
      ...pair((s) => [
        leg([[0.28, 0.52], [0.28, 0.28], [0.3, 0]], [0.055, 0.03, 0.026], s * 0.09, 0.04, HOOF, (p) => coat(p.y < 0.22 ? 1.7 : 1)),
        leg([[-0.34, 0.55], [-0.36, 0.24], [-0.32, 0]], [0.07, 0.03, 0.026], s * 0.09, 0.04, HOOF, (p) => coat(p.y < 0.22 ? 1.7 : 1)),
        // (The horn sweeps back, down and forward round the ear, a spiral.)
        spike(Array.from({ length: 5 }, (_, i) => { const a = i * 1.25; return [0.47 - 0.075 * Math.sin(a) - i * 0.008, 0.92 + 0.075 * Math.cos(a) - 0.012 * i, s * (0.05 + i * 0.024)] as const; }), 0.038, 0xb8a888),
        spike([[0.47, 0.95, s * 0.05], [0.47, 0.96, s * 0.13]], 0.025, COAT, 3, 0.5),
      ]),
    ];
  }
  // A woolly sheep: the fleece (the coat, lumpy), a dark face and legs.
  const FACE = 0x2e2824;
  return [
    hull([R([-0.58, 0.6, 0], 0, 0), R([-0.4, 0.6, 0], 0.25, 0.25), R([0.12, 0.62, 0], 0.28, 0.27), R([0.38, 0.68, 0], 0.2, 0.19), R([0.48, 0.74, 0], 0, 0)], 8, (p) => coat(p.y < 0.45 ? 0.85 : 1), { lumps: 0.12 }),
    hull([R([0.4, 0.8, 0], 0.08, 0.07), R([0.5, 0.77, 0], 0.085, 0.068), R([0.66, 0.6, 0], 0.042, 0.038)], 4, FACE),
    gem([-0.6, 0.62, 0], [0.05, 0.06, 0.04], COAT, 4),
    ...pair((s) => [
      leg([[0.26, 0.44], [0.26, 0.22], [0.28, 0]], [0.035, 0.026, 0.025], s * 0.12, 0.03, HOOF, FACE),
      leg([[-0.3, 0.44], [-0.32, 0.2], [-0.3, 0]], [0.04, 0.026, 0.025], s * 0.12, 0.03, HOOF, FACE),
      spike([[0.48, 0.8, s * 0.05], [0.47, 0.76, s * 0.15]], 0.028, FACE, 3, 0.5),
    ]),
  ];
}

function deer(stag: boolean): THREE.BufferGeometry[] {
  const RUMP = 0xf2ece0;
  const parts = [
    body([-0.62, 0.88, 0], [[-0.46, 0.87, 0.21, 0.16], [0.02, 0.84, 0.23, 0.17], [0.42, 0.9, 0.17, 0.13]], (p) => (p.x < -0.5 && p.y > 0.8 ? RUMP : coat(p.y < 0.74 ? 1.3 : 1))),
    hull([R([0.34, 0.95, 0], 0.17, 0.12), R([0.52, 1.34, 0], 0.085, 0.07)], 4, COAT, { caps: [false, false] }),
    hull([R([0.48, 1.42, 0], 0.07, 0.06), R([0.56, 1.37, 0], 0.075, 0.062), R([0.76, 1.22, 0], 0.03, 0.028)], 4, (p) => (p.x > 0.71 ? NOSE : COAT)),
    spike([[-0.6, 0.94, 0], [-0.67, 0.84, 0]], 0.04, RUMP),
    ...pair((s) => [
      leg([[0.34, 0.78], [0.34, 0.42], [0.38, 0]], [0.065, 0.03, 0.026], s * 0.1, 0.05, HOOF),
      leg([[-0.42, 0.8], [-0.44, 0.34], [-0.39, 0]], [0.09, 0.032, 0.026], s * 0.1, 0.05, HOOF),
      spike([[0.52, 1.45, s * 0.05], [0.53, 1.52, s * 0.15]], 0.035, COAT, 3, 0.45),
    ]),
  ];
  if (stag) parts.push(...pair((s) => {
    // Antlers: a beam sweeping up and back, its tines forward and up.
    const ANT = 0xcdb998, beam: V3[] = [[0.51, 1.46, s * 0.04], [0.47, 1.66, s * 0.13], [0.39, 1.84, s * 0.18], [0.35, 1.97, s * 0.17]];
    return [spike(beam, 0.024, ANT), ...[[1, 0.09], [2, 0.09]].map(([i, l]) => { const b = beam[i!]!; return spike([b, [b[0] + l! * 0.8, b[1] + l! * 0.8, b[2]]], 0.015, ANT); })];
  }));
  return parts;
}

function elephant(): THREE.BufferGeometry[] {
  const SKIN: LpPaint = (p) => coat(p.y < 1.4 ? 0.88 : 1), NAIL = 0x6a625a;
  return [
    body([-1.62, 2.05, 0], [[-1.3, 2.08, 0.85, 0.75], [0.3, 2.15, 1.05, 0.9], [1.0, 2.25, 0.85, 0.72]], SKIN),
    hull([R([0.95, 2.55, 0], 0.45, 0.45), R([1.5, 2.6, 0], 0.68, 0.56), R([1.92, 2.42, 0], 0.4, 0.34)], 6, COAT),
    limb([[1.95, 2.4, 0], [2.12, 1.6, 0], [2.16, 0.8, 0], [2.32, 0.38, 0]], [0.25, 0.17, 0.12, 0.09], COAT, 4, { caps: [false, true] }),
    spike([[-1.55, 2.3, 0], [-1.64, 1.8, 0], [-1.65, 1.2, 0]], 0.06, (p) => (p.y < 1.4 ? DARK_MANE : COAT)),
    ...pair((s) => [
      leg([[0.75, 1.7], [0.75, 0.9], [0.77, 0]], [0.4, 0.32, 0.32], s * 0.48, 0.08, NAIL, SKIN),
      leg([[-0.95, 1.75], [-0.92, 0.9], [-0.98, 0]], [0.44, 0.32, 0.32], s * 0.5, 0.08, NAIL, SKIN),
      // The ears: great flaps against the head's sides.
      plate([[0, 0.55], [0.3, 0.45], [0.42, -0.1], [0.1, -0.6], [-0.35, -0.2]], coat(0.92)).rotateY(s > 0 ? 0.35 : Math.PI - 0.35).translate(1.15, 2.45, s * 0.6),
      spike([[1.85, 1.95, s * 0.22], [2.2, 1.5, s * 0.28], [2.72, 1.62, s * 0.28]], 0.09, TUSK, 4),
    ]),
  ];
}

function fox(): THREE.BufferGeometry[] {
  const WHITE = 0xf2ece4, SOCK = 0x2a201a;
  return [
    body([-0.38, 0.3, 0], [[-0.26, 0.3, 0.085, 0.075], [0.14, 0.32, 0.1, 0.08], [0.3, 0.35, 0.07, 0.06]], (p) => (p.y < 0.26 && p.x > -0.1 ? WHITE : COAT)),
    hull([R([0.26, 0.36, 0], 0.07, 0.06), R([0.4, 0.47, 0], 0.06, 0.05)], 4, (p) => (p.y < 0.42 ? WHITE : COAT), { caps: [false, false] }),
    hull([R([0.37, 0.51, 0], 0.06, 0.058), R([0.45, 0.48, 0], 0.052, 0.05), R([0.6, 0.42, 0], 0, 0)], 4, (p) => (p.x > 0.56 ? NOSE : p.y < 0.46 ? WHITE : COAT)),
    hull([R([-0.34, 0.32, 0], 0.03, 0.03), R([-0.56, 0.26, 0], 0.075, 0.07), R([-0.8, 0.2, 0], 0, 0)], 4, (p) => (p.x < -0.68 ? WHITE : COAT), { caps: [false, false] }),
    ...pair((s) => [
      leg([[0.22, 0.27], [0.22, 0.14], [0.24, 0]], [0.032, 0.02, 0.018], s * 0.05, 0.12, SOCK),
      leg([[-0.24, 0.28], [-0.27, 0.12], [-0.25, 0]], [0.04, 0.02, 0.018], s * 0.05, 0.1, SOCK),
      spike([[0.39, 0.54, s * 0.035], [0.37, 0.64, s * 0.05]], 0.032, COAT, 3, 0.45),
    ]),
  ];
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
