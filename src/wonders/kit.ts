// The wonders' kit: the pieces their models share (wonderModels.ts and the
// era files beside this one). Wonders are the game's showpieces, drawn with
// far more detail than the town's buildings: columns with their bases and
// capitals, stepped platforms, people, animals and gardens.
//
// Units are site units (wonderModels.ts SITE_HALF); the origin is the middle
// of the site on the ground, the front +z.

import * as THREE from 'three';
import { cone, cyl } from '../propCatalog.ts';
import { P, box, patch, shade, type G } from '../houseKit.ts';
import { CELL } from '../town/geometry.ts';
import type { StatueMesh } from './statues.ts';
import type { GroundShape, Sink, WonderGrounds } from '../wonderModels.ts';

export { P, box, shade, cone, cyl, type G };
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// A wonder's site: a square of 7 × 7 cells, SITE_HALF from its middle to
// each side; H, the most a wonder spreads from the middle (room to spare).
export const SITE_HALF = (7 * CELL) / 2; // 0.07875
export const H = SITE_HALF * 0.94;

// A small deterministic random source for a model's irregularity (the
// same model every time).
export function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A rod from a to b (a beam, a limb, a cable), n-sided.
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, c: number, n = 5, r1 = r): G {
  const l = a.distanceTo(b), g = new THREE.CylinderGeometry(r1, r, l, n, 1, false).translate(0, l / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())));
  return P(g.translate(a.x, a.y, a.z), c);
}
// A closed cylinder (a drum, a column's base), standing on y = o.y.
export const drumC = (r0: number, r1: number, h: number, n: number, c: number, o: { x?: number; y?: number; z?: number; sx?: number; sz?: number; ry?: number } = {}) =>
  P(new THREE.CylinderGeometry(r1, r0, h, n, 1, false).translate(0, h / 2, 0), c, o);
// A ball (a head, a crown of leaves, a boulder).
export const ball = (r: number, c: number, o: { x?: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number; ry?: number } = {}, detail = 0) =>
  P(new THREE.IcosahedronGeometry(r, detail), c, o);
// A flat patch at height y (several ground patches must keep apart in y).
export const flat = (w: number, d: number, c: number, x: number, z: number, y: number, ry = 0) =>
  P(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), c, { x, y, z, ry });
export const disc = (r: number, c: number, x: number, z: number, y: number, n = 16) =>
  P(new THREE.CircleGeometry(r, n).rotateX(-Math.PI / 2), c, { x, y, z });
export const annulus = (r0: number, r1: number, c: number, x: number, z: number, y: number, n = 32) =>
  P(new THREE.RingGeometry(r0, r1, n).rotateX(-Math.PI / 2), c, { x, y, z });
// A quad standing in a vertical plane facing `ry` (a window, a door, a
// relief), its bottom middle at x, y, z.
export const pane = (w: number, h: number, c: number, x: number, y: number, z: number, ry = 0) =>
  P(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), c, { x, y, z, ry });
// An arched opening (a pane with a round top) facing `ry`.
export function archPane(w: number, h: number, c: number, x: number, y: number, z: number, ry = 0): G[] {
  return [
    P(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), c, { x, y, z, ry }),
    P(new THREE.CircleGeometry(w / 2, 8, 0, Math.PI).translate(0, h, 0), c, { x, y, z, ry }),
  ];
}

// A stepped platform (a crepidoma, a terrace): n steps of h each, each
// `inset` in from the one under it, the lowest w × d; returns the top's
// height and size.
export function steps(w: number, d: number, n: number, h: number, inset: number, c: number, o: { x?: number; y?: number; z?: number } = {}, top = c): { parts: G[]; y: number; w: number; d: number } {
  const parts: G[] = [];
  for (let i = 0; i < n; i++) {
    const k = i * inset * 2;
    parts.push(...box(w - k, h, d - k, shade(c, 1 - (n - 1 - i) * 0.02), { x: o.x ?? 0, y: (o.y ?? 0) + i * h, z: o.z ?? 0 }, i === n - 1 ? top : shade(c, 1.04)));
  }
  return { parts, y: (o.y ?? 0) + n * h, w: w - (n - 1) * inset * 2, d: d - (n - 1) * inset * 2 };
}

// ---------- columns ----------

export type Order = 'doric' | 'ionic' | 'egyptian';
// A column standing on y: its base, a shaft tapering to 0.85 of r, its
// capital; `band` (a carved lower drum, as at Ephesus) in its own colour.
export function column(x: number, y: number, z: number, r: number, h: number, c: number, order: Order, band?: number): G[] {
  const out: G[] = [];
  const cap = order === 'doric' ? r * 1.1 : r * 1.25, base = order === 'doric' ? 0 : r * 0.7;
  if (order === 'ionic') {
    out.push(...box(r * 2.7, r * 0.35, r * 2.7, shade(c, 0.95), { x, y, z }));
    out.push(drumC(r * 1.32, r * 1.18, r * 0.35, 8, c, { x, y: y + r * 0.35, z }));
  }
  const sh = h - base - cap;
  if (band !== undefined) {
    const bh = sh * 0.16;
    out.push(cyl(r * 1.04, r * 1.02, bh, 10, band, { x, y: y + base, z }));
    out.push(cyl(r, r * 0.85, sh - bh, 10, c, { x, y: y + base + bh, z }));
  } else out.push(cyl(r, r * 0.85, sh, order === 'egyptian' ? 8 : 10, c, { x, y: y + base, z }));
  const yc = y + base + sh;
  if (order === 'doric') {
    out.push(cyl(r * 0.85, r * 1.2, cap * 0.55, 10, c, { x, y: yc, z }));
    out.push(...box(r * 2.5, cap * 0.45, r * 2.5, c, { x, y: yc + cap * 0.55, z }));
  } else if (order === 'ionic') {
    out.push(cyl(r * 0.9, r * 1.05, cap * 0.35, 8, c, { x, y: yc, z }));
    // The volutes: a scroll either side, rolled about the front-back axis.
    for (const s of [-1, 1]) out.push(P(new THREE.CylinderGeometry(cap * 0.42, cap * 0.42, r * 1.9, 6).rotateX(Math.PI / 2), shade(c, 0.97), { x: x + s * r * 1.05, y: yc + cap * 0.48, z }));
    out.push(...box(r * 2.3, cap * 0.22, r * 2.0, c, { x, y: yc + cap * 0.78, z }));
  } else {
    // A papyrus bundle opening into a bell.
    out.push(cyl(r * 0.85, r * 1.5, cap * 0.75, 8, c, { x, y: yc, z }));
    out.push(...box(r * 2.2, cap * 0.25, r * 2.2, shade(c, 0.95), { x, y: yc + cap * 0.75, z }));
  }
  return out;
}
// Columns round a rectangle's edge, nx along x and nz along z (corners
// counted on both), their middles on the rectangle hw × hd.
export function peristyle(cx: number, cz: number, hw: number, hd: number, nx: number, nz: number, make: (x: number, z: number) => G[]): G[] {
  const out: G[] = [];
  for (let i = 0; i < nx; i++) { const x = cx - hw + (2 * hw * i) / (nx - 1); out.push(...make(x, cz - hd), ...make(x, cz + hd)); }
  for (let j = 1; j < nz - 1; j++) { const z = cz - hd + (2 * hd * j) / (nz - 1); out.push(...make(cx - hw, z), ...make(cx + hw, z)); }
  return out;
}

// A temple's entablature and roof over w × d at y: architrave, frieze (its
// own colour), cornice, then a gabled roof along z with its pediments
// (tympana in `tympanum`), acroteria at the apex and the corners.
export function templeRoof(cx: number, cz: number, w: number, d: number, y: number, c: number, frieze: number, tiles: number, tympanum: number, pitch = 0.24): { parts: G[]; top: number } {
  const out: G[] = [];
  const ah = w * 0.045, fh = w * 0.05, ch = w * 0.022;
  out.push(...box(w, ah * 0.5, d, shade(c, 0.97), { x: cx, y, z: cz }));
  out.push(...box(w + w * 0.006, ah * 0.5, d + w * 0.006, c, { x: cx, y: y + ah * 0.5, z: cz }));
  out.push(...box(w + w * 0.004, fh, d + w * 0.004, frieze, { x: cx, y: y + ah, z: cz }));
  const yc = y + ah + fh;
  out.push(...box(w + w * 0.05, ch, d + w * 0.05, c, { x: cx, y: yc, z: cz }, shade(c, 0.9)));
  const rw = w + w * 0.06, rd = d + w * 0.06, rh = rw * pitch * 0.5, yr = yc + ch;
  // The roof's slopes (tiles) and its two pediments.
  const slopes = new THREE.BufferGeometry(), x0 = rw / 2, z0 = rd / 2;
  slopes.setAttribute('position', new THREE.Float32BufferAttribute([
    -x0, 0, -z0, -x0, 0, z0, 0, rh, z0, -x0, 0, -z0, 0, rh, z0, 0, rh, -z0,
    x0, 0, z0, x0, 0, -z0, 0, rh, -z0, x0, 0, z0, 0, rh, -z0, 0, rh, z0,
  ], 3));
  out.push(P(slopes, tiles, { x: cx, y: yr, z: cz }));
  // Tile ribs down each slope: a ridge of darker lines.
  const ribs = Math.round(d / (w * 0.06));
  for (let i = 0; i <= ribs; i++) {
    const z = cz - z0 + (rd * i) / ribs;
    for (const s of [-1, 1]) out.push(rod(V(cx + s * x0, yr + 0.00015, z), V(cx, yr + rh + 0.00015, z), w * 0.0035, shade(tiles, 0.82), 3));
  }
  out.push(rod(V(cx, yr + rh, cz - z0), V(cx, yr + rh, cz + z0), w * 0.008, shade(tiles, 0.75), 4));
  for (const s of [-1, 1]) {
    const zf = cz + s * (z0 - w * 0.004);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-x0, 0, 0, x0, 0, 0, 0, rh, 0], 3));
    out.push(P(tri, c, { x: cx, y: yr, z: zf }));
    const inner = new THREE.BufferGeometry(), k = 0.78;
    inner.setAttribute('position', new THREE.Float32BufferAttribute([-x0 * k, rh * 0.1, 0, x0 * k, rh * 0.1, 0, 0, rh * 0.86, 0], 3));
    out.push(P(inner, tympanum, { x: cx, y: yr, z: zf + s * 0.0003 }));
    // Raking cornices along the pediment's sloping sides.
    out.push(rod(V(cx - x0, yr, zf + s * 0.0004), V(cx, yr + rh, zf + s * 0.0004), w * 0.012, c, 4));
    out.push(rod(V(cx + x0, yr, zf + s * 0.0004), V(cx, yr + rh, zf + s * 0.0004), w * 0.012, c, 4));
    // Acroteria: a palmette at the apex, smaller ones at the corners.
    out.push(P(new THREE.ConeGeometry(w * 0.03, w * 0.07, 5).translate(0, w * 0.035, 0), shade(c, 1.03), { x: cx, y: yr + rh, z: zf, sz: 0.35 }));
    for (const t of [-1, 1]) out.push(P(new THREE.ConeGeometry(w * 0.02, w * 0.045, 4).translate(0, w * 0.022, 0), shade(c, 1.03), { x: cx + t * x0, y: yr, z: zf, sz: 0.4 }));
  }
  return { parts: out, top: yr + rh + w * 0.07 };
}

// ---------- pyramids ----------

// A pyramid of courses: n tiers on a square base, each a short sloped band
// and a ledge (its masonry), tiers shaded alternately; the top `smooth`
// fraction left in its casing (a smooth point in `casing`), or the top
// flat when `truncate` (the stones gone).
export function steppedPyramid(base: number, h: number, n: number, c: number, o: { x?: number; z?: number; y?: number; ry?: number; smooth?: number; casing?: number; truncate?: number } = {}): G[] {
  const out: G[] = [], smooth = o.smooth ?? 0, trunc = o.truncate ?? 0;
  const hs = h * (1 - smooth - trunc), th = hs / n, slope = base / 2 / h;
  const at = { x: o.x ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 };
  for (let i = 0; i < n; i++) {
    const y = (o.y ?? 0) + i * th, w0 = base - 2 * slope * i * th, w1 = w0 - 2 * slope * th;
    const band = shade(c, i % 2 ? 0.97 : 1.02);
    const g = new THREE.CylinderGeometry(Math.SQRT1_2 * (w0 - (w0 - w1) * 0.65), Math.SQRT1_2 * w0, th * 0.82, 4, 1, true).rotateY(Math.PI / 4).translate(0, th * 0.41, 0);
    out.push(P(g, band, { ...at, y }));
    const ledge = new THREE.CylinderGeometry(Math.SQRT1_2 * w1, Math.SQRT1_2 * (w0 - (w0 - w1) * 0.65), th * 0.18, 4, 1, true).rotateY(Math.PI / 4).translate(0, th * 0.82 + th * 0.09, 0);
    out.push(P(ledge, shade(band, 1.06), { ...at, y }));
  }
  const yTop = (o.y ?? 0) + hs, wTop = base - 2 * slope * hs;
  if (smooth > 0) {
    const cap = new THREE.ConeGeometry(Math.SQRT1_2 * wTop, h * smooth, 4, 1, true).rotateY(Math.PI / 4).translate(0, (h * smooth) / 2, 0);
    out.push(P(cap, o.casing ?? shade(c, 1.15), { ...at, y: yTop }));
  } else if (trunc > 0) {
    out.push(P(new THREE.PlaneGeometry(wTop, wTop).rotateX(-Math.PI / 2), shade(c, 1.05), { ...at, y: yTop }));
  }
  return out;
}

// ---------- plants ----------

// A date palm: a gently curved trunk of rings, a crown of drooping fronds.
export function palm(x: number, z: number, h: number, seed = 1): G[] {
  const r = rnd(seed), out: G[] = [], lean = (r() - 0.5) * 0.25, dir = r() * Math.PI * 2;
  const top = V(x + Math.cos(dir) * lean * h, h, z + Math.sin(dir) * lean * h), mid = V(x + Math.cos(dir) * lean * h * 0.35, h * 0.5, z + Math.sin(dir) * lean * h * 0.35);
  out.push(rod(V(x, 0, z), mid, h * 0.045, 0x7c6448, 5, h * 0.04), rod(mid, top, h * 0.038, 0x86704f, 6, h * 0.033));
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), l = h * (0.38 + r() * 0.1), droop = 0.25 + r() * 0.35;
    const tip = V(top.x + Math.cos(a) * l, top.y - l * droop, top.z + Math.sin(a) * l);
    const m = V(top.x + Math.cos(a) * l * 0.55, top.y + l * 0.08, top.z + Math.sin(a) * l * 0.55);
    // A frond: two thin leaves, base to middle (rising) and middle to tip (drooping).
    for (const [p, q] of [[top, m], [m, tip]] as const) {
      const g = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
      const d = q.clone().sub(p), len = d.length(), w = h * 0.1;
      g.scale(len, w, 1).rotateX(Math.PI / 2);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), d.normalize())));
      out.push(P(g.translate(p.x, p.y, p.z), shade(0x5a8a3c, 0.85 + r() * 0.3)));
    }
  }
  out.push(ball(h * 0.05, 0x8a6a3a, { x: top.x, y: top.y - h * 0.04, z: top.z })); // dates
  return out;
}
// A cypress: a tall dark flame.
export const cypressT = (x: number, z: number, h: number) => [
  rod(V(x, 0, z), V(x, h * 0.12, z), h * 0.03, 0x5a4030, 4),
  P(new THREE.SphereGeometry(h * 0.13, 7, 6).scale(1, 3.6, 1).translate(0, h * 0.57, 0), 0x3d5a35, { x, z }),
];
// A round leafy tree (an olive, a fig).
export function roundTree(x: number, z: number, h: number, crown: number, seed = 1): G[] {
  const r = rnd(seed);
  return [
    rod(V(x, 0, z), V(x, h * 0.5, z), h * 0.06, 0x6a5038, 5, h * 0.045),
    ball(h * 0.32, crown, { x, y: h * 0.68, z, sy: 0.85 }, 1),
    ball(h * 0.2, shade(crown, 1.08), { x: x + (r() - 0.5) * h * 0.3, y: h * 0.82, z: z + (r() - 0.5) * h * 0.3 }, 0),
  ];
}
// A low flowering shrub.
export const bush = (x: number, z: number, r: number, c: number, y = 0) => ball(r, c, { x, y: y + r * 0.6, z, sy: 0.75 });

// ---------- people and animals ----------

// A person, h tall, in a robe of `robe`, facing ry; `arm` raised, if given.
export function figure(x: number, z: number, h: number, robe: number, o: { y?: number; ry?: number; skin?: number; arm?: number } = {}): G[] {
  const y = o.y ?? 0, sk = o.skin ?? 0xb98a64, ry = o.ry ?? 0;
  const out: G[] = [
    P(new THREE.CylinderGeometry(h * 0.1, h * 0.17, h * 0.62, 6).translate(0, h * 0.31, 0), robe, { x, y, z, ry }),
    ball(h * 0.095, sk, { x, y: y + h * 0.72, z }),
    ball(h * 0.075, shade(robe, 0.85), { x, y: y + h * 0.79, z, sy: 0.7 }),
  ];
  if (o.arm !== undefined) {
    const a = ry + Math.PI / 2;
    out.push(rod(V(x + Math.cos(a) * h * 0.1, y + h * 0.58, z - Math.sin(a) * h * 0.1), V(x + Math.cos(a) * h * 0.16, y + h * (0.58 + 0.3 * o.arm), z - Math.sin(a) * h * 0.16), h * 0.035, robe, 4));
  }
  return out;
}
// A sheep, l long, facing ry.
export function sheep(x: number, z: number, l: number, ry: number): G[] {
  const c = Math.cos(ry), s = Math.sin(ry), at = (f: number, y: number) => ({ x: x + c * f * l, y, z: z - s * f * l });
  return [
    ball(l * 0.42, 0xeae4d6, { ...at(0, l * 0.5), sx: 1.25, sz: 0.9, ry }, 0),
    ball(l * 0.17, 0x3a3430, { ...at(0.55, l * 0.6), ry }),
    ...[[-0.3, -0.2], [-0.3, 0.2], [0.3, -0.2], [0.3, 0.2]].map(([f, w]) => rod(V(at(f!, 0).x - s * w! * l, 0, at(f!, 0).z - c * w! * l), V(at(f!, 0).x - s * w! * l, l * 0.35, at(f!, 0).z - c * w! * l), l * 0.05, 0x3a3430, 3)),
  ];
}
// A camel, l long, facing ry, with a rider in `rider` (if given).
export function camel(x: number, z: number, l: number, ry: number, rider?: number): G[] {
  const c = Math.cos(ry), s = Math.sin(ry), C = 0xb8936a;
  const at = (f: number, y: number, w = 0) => V(x + c * f * l - s * w * l, y, z - s * f * l - c * w * l);
  const out: G[] = [
    ball(l * 0.3, C, { x: at(0, l * 0.75).x, y: l * 0.75, z: at(0, l * 0.75).z, sx: 1.5, sy: 0.85, sz: 0.9, ry }),
    ball(l * 0.17, shade(C, 1.05), { x: at(-0.02, 1.02 * l).x, y: l * 1.0, z: at(-0.02, 1.02 * l).z }),
    rod(at(0.38, l * 0.8), at(0.58, l * 1.12), l * 0.07, C, 4),
    ball(l * 0.1, C, { x: at(0.66, l * 1.12).x, y: l * 1.12, z: at(0.66, l * 1.12).z, sx: 1.4, ry }),
  ];
  for (const [f, w] of [[-0.3, -0.12], [-0.3, 0.12], [0.3, -0.12], [0.3, 0.12]] as const) out.push(rod(at(f, 0, w), at(f, l * 0.68, w), l * 0.045, shade(C, 0.9), 3));
  if (rider !== undefined) out.push(...figure(at(0.12, 0).x, at(0.12, 0).z, l * 0.7, rider, { y: l * 0.95, ry }));
  return out;
}
// A small boat, l long, facing ry: its hull, a mast and a sail (if `sail`).
export function boat(x: number, z: number, l: number, ry: number, y = 0, sail?: number): G[] {
  // (A hull: the lower half of a long ellipsoid, a deck over it.)
  const hull = new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(l, l * 0.3, l * 0.3).translate(0, l * 0.12, 0);
  const out: G[] = [P(hull, 0x6e5238, { x, y, z, ry }), P(new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2).scale(l, 1, l * 0.3).translate(0, l * 0.121, 0), 0x9a7a54, { x, y, z, ry })];
  if (sail !== undefined) {
    out.push(rod(V(x, y + l * 0.1, z), V(x, y + l * 0.85, z), l * 0.02, 0x5a4030, 3));
    out.push(P(new THREE.PlaneGeometry(l * 0.5, l * 0.55).translate(0, l * 0.55, 0), sail, { x, y, z, ry: ry + Math.PI / 2 }));
  }
  return out;
}

// ---------- shared grounds ----------

const ROCK = 0x7d776c, TIMBER = 0x7a5f45, IRON = 0x4a4744, STONE = 0xb8b0a0;
// A rocky islet in the sea, its top at the water line (origin): what a
// wonder standing on the sea stands on (cityProps.ts seaWonder). Its rock
// goes on down to well under any sea floor it stands on.
export const ISLET_DEPTH = 0.3;
// How far below the ground a wonder on the bare ground may reach (a crag's
// foot run on down into the hill, so on a slope it never shows a gap).
export const CRAG_DEPTH = 0.05;
export const islet = (): G[] => [
  P(new THREE.CylinderGeometry(0.068, 0.075, 0.0078, 9).translate(0, 0.0021, 0), ROCK, { ry: 0.3 }),
  P(new THREE.CylinderGeometry(0.075, 0.078, ISLET_DEPTH, 9, 1, true).translate(0, -0.0018 - ISLET_DEPTH / 2, 0), shade(ROCK, 0.85), { ry: 0.3 }),
  ...[[0.06, 0.025, 1.1], [-0.045, 0.05, 0.9], [-0.03, -0.058, 1], [0.035, -0.055, 0.8]].map(([x, z, s]) =>
    P(new THREE.DodecahedronGeometry(0.011 * s!, 0).scale(1, 0.7, 1), shade(ROCK, 0.9 + 0.1 * s!), { x: x!, y: 0.0065, z: z!, ry: x! * 40 })),
];
// A wonder going up: poles and boards round the site, a crane (and what
// stands in for a wonder not modelled yet).
export function scaffold(): G[] {
  const out: G[] = [patch(2 * H * 0.9, 2 * H * 0.9, 0xa08a6a)];
  const c = H * 0.8, top = 0.05;
  for (const [x, z] of [[-c, -c], [c, -c], [-c, c], [c, c], [0, -c], [0, c], [-c, 0], [c, 0]] as const) out.push(rod(V(x, 0, z), V(x, top, z), 0.0012, TIMBER, 3));
  for (const y of [0.016, 0.033, top]) {
    for (const [a, b] of [[[-c, -c], [c, -c]], [[c, -c], [c, c]], [[c, c], [-c, c]], [[-c, c], [-c, -c]]] as const) out.push(rod(V(a[0], y, a[1]), V(b[0], y, b[1]), 0.0009, TIMBER, 3));
  }
  out.push(...box(c * 1.4, 0.022, c * 1.4, STONE, {}, shade(STONE, 0.95)));
  out.push(rod(V(c * 0.6, 0, -c * 0.5), V(c * 0.6, 0.11, -c * 0.5), 0.0016, IRON, 3));
  out.push(rod(V(c * 0.6, 0.11, -c * 0.5), V(-c * 0.7, 0.105, -c * 0.5), 0.0012, IRON, 3));
  out.push(rod(V(-c * 0.5, 0.105, -c * 0.5), V(-c * 0.5, 0.06, -c * 0.5), 0.0003, IRON, 3));
  out.push(...box(0.01, 0.006, 0.01, STONE, { x: -c * 0.5, y: 0.054, z: -c * 0.5 }));
  return out;
}
// (Each era's file gives its wonders' models as one of these.)
export type Models<K extends string> = { readonly [k in K]: () => G[] };

// A statue's mesh (statues.ts) as one piece of colour c, `h` tall, its base
// at o.y, turned by o.ry (its front +z before).
export function statue(m: StatueMesh, h: number, c: number, o: { x?: number; y?: number; z?: number; ry?: number } = {}): G {
  const bytes = (b64: string) => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a.buffer; };
  const q = new Int16Array(bytes(m.pos)), idx = new Uint16Array(bytes(m.idx));
  let top = 0;
  for (let i = 1; i < q.length; i += 3) top = Math.max(top, q[i]!);
  const k = h / top, pos = new Float32Array(idx.length * 3);
  idx.forEach((v, i) => { for (let a = 0; a < 3; a++) pos[i * 3 + a] = q[v * 3 + a]! * k; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return P(g, c, o);
}

// ---------- a wonder in pieces ----------

// The whole of a wonder drawn in pieces (wonderModels.ts WonderGrounds),
// each where it stands, a sunk piece down on its sink's floor: its model
// as the gallery shows it.
export function assemble(gr: WonderGrounds): G[] {
  return (gr.pieces ?? []).flatMap((p) => {
    const parts = p.parts();
    return p.sink === undefined ? parts : parts.map((g) => g.translate(0, -gr.sinks![p.sink!]!.depth, 0));
  });
}
// A sink (wonderModels.ts Sink) over one shape: its outline a rectangle's
// corners, or ROUND_SIDES points round an ellipse (cut by the ground's
// hole: render.ts shrinks it to the polygon's inner edge).
export const ROUND_SIDES = 48;
export function sinkOf(shape: GroundShape, depth: number, side: number, floor: number, water?: number, follow = false): Sink {
  const { x, z, hw, hd } = shape;
  const outline: [number, number][] = shape.round
    ? Array.from({ length: ROUND_SIDES }, (_, i) => { const a = (i / ROUND_SIDES) * Math.PI * 2; return [x + Math.cos(a) * hw, z + Math.sin(a) * hd]; })
    : [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z + hd], [x - hw, z + hd]];
  return { outline, cut: [shape], depth, side, floor, follow, ...(water === undefined ? {} : { water }) };
}
