// Parts for shops and works (styles/trade), over the house kit's
// (houseKit.ts): what trade puts in front of a building and in its yard.
// Each style composes them its own way, with its own forms and colours;
// none is a shop or a works by itself. Units are tile steps, the lot's
// frame as in houseKit.ts (the street at +z).

import * as THREE from 'three';
import { cone, cyl, type Tf } from './propCatalog.ts';
import { E, P, box, onFace, type Body, type Face, type G } from './houseKit.ts';

// An awning hung from a wall (its top edge along x at y, z; out over +z,
// turned by o.ry), `depth` out and sloping by `tilt` (radians down from
// level), in stripes of `colors` (one colour: plain).
export function awning(w: number, depth: number, colors: readonly number[], o: Tf & { tilt?: number; stripes?: number } = {}): G[] {
  const tilt = o.tilt ?? 0.45, n = colors.length > 1 ? (o.stripes ?? 7) : 1, sw = w / n, out: G[] = [];
  const a = Math.PI / 2 + tilt; // (the plane's +y edge out over the street, dropping by tilt)
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(sw, depth).rotateX(a).translate(-w / 2 + sw * (i + 0.5), -Math.sin(tilt) * depth / 2, Math.cos(tilt) * depth / 2);
    out.push(P(g, colors[i % colors.length]!, o));
  }
  return out;
}
// A valance: a short skirt hanging from an awning's front edge.
export function valance(w: number, depth: number, h: number, c: number, o: Tf & { tilt?: number } = {}): G {
  const tilt = o.tilt ?? 0.45;
  return P(new THREE.PlaneGeometry(w, h).translate(0, -Math.sin(tilt) * depth - h / 2, Math.cos(tilt) * depth), c, o);
}
// A board on a face (a sign, a fascia), its lettering suggested by short
// strokes of `ink` along it.
export function signBoard(b: Body, face: Face, along: number, y: number, w: number, h: number, board: number, ink: number, out = E * 2): G[] {
  const res: G[] = [onFace(b, face, along, y, w, h, board, out)];
  const n = Math.max(2, Math.floor(w / (h * 0.9))), sw = (w * 0.8) / n;
  for (let i = 0; i < n; i++) res.push(onFace(b, face, along - w * 0.4 + sw * (i + 0.5), y + h * 0.3, sw * 0.6, h * 0.4, ink, out + E));
  return res;
}
// A sign hung out from a wall on a bracket (at x, y, z on the wall, out
// along +z turned by ry): a board edge-on to the street, seen both ways.
export function hangingSign(w: number, h: number, board: number, iron: number, o: Tf = {}): G[] {
  return [
    ...box(0.0003, 0.0003, w + 0.001, iron, { ...o, z: (o.z ?? 0) + (w + 0.001) / 2 * Math.cos(o.ry ?? 0), x: (o.x ?? 0) + (w + 0.001) / 2 * Math.sin(o.ry ?? 0) }),
    ...box(0.00035, h, w, board, { ...o, y: (o.y ?? 0) - h - 0.0002, z: (o.z ?? 0) + (w / 2 + 0.0008) * Math.cos(o.ry ?? 0), x: (o.x ?? 0) + (w / 2 + 0.0008) * Math.sin(o.ry ?? 0) }),
  ];
}
// Doors in two leaves in a frame, on a face.
export function doubleDoor(b: Body, face: Face, along: number, w: number, h: number, leaf: number, frame: number, out = E * 2): G[] {
  const gap = Math.max(0.0002, w * 0.03);
  return [
    onFace(b, face, along, 0, w + 0.0012, h + 0.0006, frame, out),
    onFace(b, face, along - (w + gap) / 4, 0, (w - gap) / 2, h, leaf, out + E),
    onFace(b, face, along + (w + gap) / 4, 0, (w - gap) / 2, h, leaf, out + E),
  ];
}
// A square chimney stack standing on the ground (or o.y), capped darker.
export const stack = (w: number, h: number, c: number, cap: number, o: Tf = {}): G[] => [...box(w, h, w, c, o, cap), ...box(w * 1.25, w * 0.35, w * 1.25, cap, { ...o, y: (o.y ?? 0) + h })];
// A round chimney, tapering, banded near its top.
export const roundStack = (r: number, h: number, c: number, band: number, o: Tf = {}): G[] => [
  cyl(r, r * 0.72, h, 8, c, o), cyl(r * 0.8, r * 0.8, h * 0.05, 8, band, { ...o, y: (o.y ?? 0) + h * 0.9 }),
];
// A sawtooth roof over w × d (its teeth across x, `teeth` of them along z,
// each `h` high: a slope of `roof` rising toward -z, then a glazed face of
// `glass` dropping to the next, the north lights).
export function sawtooth(w: number, d: number, teeth: number, h: number, roof: number, glass: number, o: Tf = {}): G[] {
  const x = w / 2, t = d / teeth, out: G[] = [];
  for (let i = 0; i < teeth; i++) {
    const z0 = d / 2 - i * t, z1 = z0 - t;
    const slope = new THREE.BufferGeometry(), face = new THREE.BufferGeometry(), ends = new THREE.BufferGeometry();
    slope.setAttribute('position', new THREE.Float32BufferAttribute([-x, 0, z0, x, 0, z0, x, h, z1, -x, 0, z0, x, h, z1, -x, h, z1], 3));
    face.setAttribute('position', new THREE.Float32BufferAttribute([x, 0, z1, -x, 0, z1, -x, h, z1, x, 0, z1, -x, h, z1, x, h, z1], 3));
    ends.setAttribute('position', new THREE.Float32BufferAttribute([-x, 0, z1, -x, 0, z0, -x, h, z1, x, 0, z0, x, 0, z1, x, h, z1], 3));
    out.push(P(slope, roof, o), P(face, glass, o), P(ends, roof, o));
  }
  return out;
}
// A lean-to: a roof sloping from `hi` against a wall down to `lo` over
// posts, w along the wall, d out (toward +z, turned by o.ry).
export function leanTo(w: number, d: number, hi: number, lo: number, roof: number, post: number, o: Tf = {}): G[] {
  const slope = new THREE.BufferGeometry(), x = w / 2;
  slope.setAttribute('position', new THREE.Float32BufferAttribute([-x, hi, 0, -x, lo, d, x, lo, d, -x, hi, 0, x, lo, d, x, hi, 0], 3));
  const out: G[] = [P(slope, roof, o)];
  const ry = o.ry ?? 0, c = Math.cos(ry), s = Math.sin(ry);
  for (const px of [-x + 0.0004, x - 0.0004]) {
    const lx = px, lz = d - 0.0004;
    out.push(cyl(0.00028, 0.00028, lo, 4, post, { x: (o.x ?? 0) + lx * c + lz * s, y: o.y ?? 0, z: (o.z ?? 0) - lx * s + lz * c }));
  }
  return out;
}
// A market stall: four posts and a cloth or thatch roof pitched over w × d, h high.
export function stall(w: number, d: number, h: number, roof: number, post: number, o: Tf = {}): G[] {
  const out: G[] = [];
  const ry = o.ry ?? 0, c = Math.cos(ry), s = Math.sin(ry);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const lx = a * (w / 2 - 0.0003), lz = b * (d / 2 - 0.0003);
    out.push(cyl(0.00022, 0.00022, h, 4, post, { x: (o.x ?? 0) + lx * c + lz * s, y: o.y ?? 0, z: (o.z ?? 0) - lx * s + lz * c }));
  }
  const g = new THREE.BufferGeometry(), x = w / 2 + 0.0008, z = d / 2 + 0.0008, r = Math.min(w, d) * 0.22;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-x, 0, z, x, 0, z, x, r, 0, -x, 0, z, x, r, 0, -x, r, 0, x, 0, -z, -x, 0, -z, -x, r, 0, x, 0, -z, -x, r, 0, x, r, 0], 3));
  out.push(P(g, roof, { ...o, y: (o.y ?? 0) + h }));
  return out;
}
// A counter or table: a slab on a base (w × d, h high).
export const counter = (w: number, d: number, h: number, base: number, top: number, o: Tf = {}): G[] => [...box(w, h - 0.0003, d, base, o), ...box(w + 0.0004, 0.0003, d + 0.0004, top, { ...o, y: (o.y ?? 0) + h - 0.0003 })];
// Goods: a few of each, laid by a seed so they are not in rows.
const jitter = (i: number, k: number) => Math.sin(i * 12.9898 + k * 78.233) * 0.5;
export function crates(n: number, s: number, c: number, o: Tf = {}): G[] {
  const out: G[] = [];
  for (let i = 0; i < n; i++) {
    const up = i >= 3 ? 1 : 0, j = i % 3;
    out.push(...box(s, s * 0.8, s, c, { x: (o.x ?? 0) + (j - 1) * s * 1.05, y: (o.y ?? 0) + up * s * 0.8, z: (o.z ?? 0) + jitter(i, 1) * s * 0.3, ry: jitter(i, 2) * 0.3 }));
  }
  return out;
}
export function barrels(n: number, r: number, c: number, o: Tf = {}): G[] {
  const out: G[] = [];
  for (let i = 0; i < n; i++) out.push(cyl(r, r, r * 2.4, 6, c, { x: (o.x ?? 0) + (i - (n - 1) / 2) * r * 2.15, y: o.y ?? 0, z: (o.z ?? 0) + jitter(i, 3) * r }));
  return out;
}
// Sacks: squat lumps.
export function sacks(n: number, r: number, c: number, o: Tf = {}): G[] {
  const out: G[] = [];
  for (let i = 0; i < n; i++) out.push(P(new THREE.OctahedronGeometry(r, 0), c, { x: (o.x ?? 0) + (i % 3 - 1) * r * 1.6, y: (o.y ?? 0) + r * 0.6 + (i >= 3 ? r * 1.1 : 0), z: (o.z ?? 0) + jitter(i, 4) * r, sy: 0.65 }));
  return out;
}
// Logs (or timber) stacked lengthwise along x.
export function logs(n: number, len: number, r: number, c: number, o: Tf = {}): G[] {
  const out: G[] = [];
  let row = 0, k = 0;
  for (let i = 0; i < n; i++) {
    const across = Math.max(1, 3 - row);
    const ry = o.ry ?? 0, off = (k - (across - 1) / 2) * r * 2.05;
    out.push(lying(r, len, 5, c, (o.x ?? 0) + off * Math.sin(ry), (o.y ?? 0) + r + row * r * 1.7, (o.z ?? 0) + off * Math.cos(ry), ry));
    if (++k >= across) { k = 0; row++; }
  }
  return out;
}
// A cylinder lying along x (turned by ry), its middle at x, y, z (cyl grows from its base).
export function lying(r: number, len: number, n: number, c: number, x: number, y: number, z: number, ry = 0): G {
  return cyl(r, r, len, n, c, { x: x + (len / 2) * Math.cos(ry), y, z: z - (len / 2) * Math.sin(ry), rz: Math.PI / 2, ry });
}
// Jars, amphorae, pots: a body and a neck.
export function jars(n: number, r: number, c: number, o: Tf = {}): G[] {
  const out: G[] = [];
  for (let i = 0; i < n; i++) {
    const x = (o.x ?? 0) + (i % 4 - 1.5) * r * 2.3, z = (o.z ?? 0) + Math.floor(i / 4) * r * 2.3 + jitter(i, 5) * r * 0.4;
    out.push(P(new THREE.SphereGeometry(r, 6, 4), c, { x, y: (o.y ?? 0) + r, z, sy: 1.3 }), cyl(r * 0.35, r * 0.4, r * 0.7, 5, c, { x, y: (o.y ?? 0) + r * 2.1, z }));
  }
  return out;
}
// A beehive kiln: a round base, its dome, a firing mouth's dark arch facing +z (turned by ry), a small flue.
export function kiln(r: number, h: number, c: number, o: Tf = {}): G[] {
  const ry = o.ry ?? 0;
  return [
    cyl(r, r * 1.05, h * 0.45, 8, c, o),
    P(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), c, { ...o, y: (o.y ?? 0) + h * 0.45, sy: (h * 0.55) / r }),
    P(new THREE.PlaneGeometry(r * 0.7, h * 0.35).translate(0, h * 0.175, r * 1.03 + E), 0x1e1a16, { ...o, ry }),
    cyl(r * 0.18, r * 0.15, h * 0.35, 5, c, { ...o, y: (o.y ?? 0) + h * 0.9 }),
  ];
}
// A lantern: a small round glow on a cord (red paper, a lamp).
export const lantern = (r: number, c: number, o: Tf = {}): G[] => [P(new THREE.SphereGeometry(r, 6, 4), c, { ...o, sy: 1.25 }), cyl(r * 0.5, r * 0.5, r * 0.3, 5, 0x2a2420, { ...o, y: (o.y ?? 0) + r * 1.15 })];
// Cloth hung to dry on a frame: two posts, a rail, banners down from it.
export function dryingRack(w: number, h: number, cloths: readonly number[], post: number, o: Tf = {}): G[] {
  const ry = o.ry ?? 0, c = Math.cos(ry), s = Math.sin(ry), at = (lx: number) => ({ x: (o.x ?? 0) + lx * c, z: (o.z ?? 0) - lx * s });
  const out: G[] = [cyl(0.00025, 0.00025, h, 4, post, { ...at(-w / 2), y: o.y ?? 0 }), cyl(0.00025, 0.00025, h, 4, post, { ...at(w / 2), y: o.y ?? 0 })];
  out.push(lying(0.0002, w, 4, post, at(0).x, (o.y ?? 0) + h, at(0).z, ry));
  const n = cloths.length, cw = (w * 0.86) / n;
  for (let i = 0; i < n; i++) out.push(P(new THREE.PlaneGeometry(cw * 0.9, h * 0.75).translate(-w * 0.43 + cw * (i + 0.5), h - h * 0.375, 0), cloths[i]!, { ...o, ry }));
  return out;
}
// A cart: a box bed on two wheels, its shafts down to the ground.
export function cart(len: number, c: number, wheel: number, o: Tf = {}): G[] {
  const ry = o.ry ?? 0, cs = Math.cos(ry), sn = Math.sin(ry), w = len * 0.55, r = len * 0.28;
  const at = (lx: number, lz: number) => ({ x: (o.x ?? 0) + lx * cs + lz * sn, z: (o.z ?? 0) - lx * sn + lz * cs });
  return [
    ...box(len, r * 0.6, w, c, { ...at(0, 0), y: r * 0.9, ry }),
    cyl(r, r, 0.00025, 7, wheel, { ...at(0, w / 2 + 0.0002), y: r, rx: Math.PI / 2, ry }),
    cyl(r, r, 0.00025, 7, wheel, { ...at(0, -w / 2 - 0.0002), y: r, rx: Math.PI / 2, ry }),
    ...box(len * 0.7, 0.0003, 0.0003, c, { ...at(len * 0.75, 0), y: r * 0.6, ry, rz: -0.35 }),
  ];
}
// A millstone pair (a Roman donkey mill: an hourglass on a cone).
export const hourglassMill = (r: number, h: number, c: number, o: Tf = {}): G[] => [
  cyl(r * 1.1, r * 1.1, h * 0.12, 8, c, o), cone(r, h * 0.45, 8, c, { ...o, y: (o.y ?? 0) + h * 0.12 }),
  cyl(r * 0.25, r * 0.95, h * 0.4, 8, shadeOf(c, 0.9), { ...o, y: (o.y ?? 0) + h * 0.35 }), cyl(r * 0.95, r * 0.25, h * 0.4, 8, shadeOf(c, 0.9), { ...o, y: (o.y ?? 0) + h * 1.15, rx: Math.PI }),
];
const shadeOf = (c: number, k: number) => { const x = new THREE.Color(c).multiplyScalar(k); return (Math.round(x.r * 255) << 16) | (Math.round(x.g * 255) << 8) | Math.round(x.b * 255); };
// An anvil on its block.
export const anvil = (s: number, o: Tf = {}): G[] => [...box(s * 0.7, s * 0.9, s * 0.7, 0x5a4232, o), ...box(s * 1.4, s * 0.4, s * 0.55, 0x2c2c2e, { ...o, y: (o.y ?? 0) + s * 0.9 })];
// A water wheel against a wall (its axle along x, at o).
export const waterWheel = (r: number, w: number, c: number, o: Tf = {}): G[] => [
  lying(r, w, 10, c, o.x ?? 0, o.y ?? 0, o.z ?? 0, o.ry ?? 0), lying(r * 0.2, w * 1.3, 5, 0x3a3028, o.x ?? 0, o.y ?? 0, o.z ?? 0, o.ry ?? 0),
];
