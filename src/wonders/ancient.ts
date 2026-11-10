// The Ancient era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units, the front +z. Those standing beside their city (the
// Pyramids, Stonehenge, the Great Lighthouse) keep their own proportions;
// those in it rise over the town (wonderModels.ts MIN_HEIGHT).

import * as THREE from 'three';
import { frustum, ring } from '../houseKit.ts';
import {
  P, annulus, archPane, ball, box, bush, cone, cyl, disc, drumC, figure, flat, pane,
  peristyle, rnd, rod, shade, steppedPyramid, steps, templeRoof, H, islet, type G, type Models,
} from './kit.ts';
import type { GroundTree, WonderGrounds } from '../wonderModels.ts';

const WATER = 0x5f8fa3, GRASS = 0x86a058, LEAF = 0x557a36;
const MARBLE = 0xe6e0d2, BRONZE = 0x9a7a4a;

// ---------- Giza ----------

// The Great Pyramid alone on the plateau, whole as built: its courses of
// stone rising to a gilded capstone (on the desert itself: no base).
export function pyramids(): G[] {
  const out: G[] = [];
  const LIME = 0xcfb07a, base = 0.12;
  out.push(...steppedPyramid(base, 0.64 * base, 28, LIME, { smooth: 0.07, casing: 0xe2b448 }));
  return out;
}

// ---------- the Pharos ----------

type PhPt = readonly [number, number];
// An opening's outline, w × h, its sill at y, its middle at x; round-headed if `arched`.
function phOpening(x: number, y: number, w: number, h: number, arched = false): PhPt[] {
  if (!arched) return [[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + h], [x - w / 2, y + h]];
  const r = w / 2, ys = y + h - r, pts: PhPt[] = [[x - w / 2, y], [x + w / 2, y]];
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI; pts.push([x + r * Math.cos(a), ys + r * Math.sin(a)]); }
  return pts;
}
// A wall face (its outline in u, v facing +z) pierced by openings, each a
// real recess: its reveals going `deep` back to a dark back; placed by `at`.
function phWall(outline: readonly PhPt[], holes: readonly (readonly PhPt[])[], deep: number, c: number, dark: number, at: Parameters<typeof P>[2]): G[] {
  const v2 = (pts: readonly PhPt[]) => pts.map(([u, v]) => new THREE.Vector2(u, v));
  const shape = new THREE.Shape(v2(outline));
  for (const h of holes) shape.holes.push(new THREE.Path(v2(h)));
  const out: G[] = [P(new THREE.ShapeGeometry(shape, 1), c, at)];
  const sides: number[] = [];
  for (const h of holes) {
    const cx = h.reduce((s, p) => s + p[0], 0) / h.length, cy = h.reduce((s, p) => s + p[1], 0) / h.length;
    for (let i = 0; i < h.length; i++) {
      let p = h[i]!, q = h[(i + 1) % h.length]!;
      // (Each reveal faces into the opening.)
      if (-(q[1] - p[1]) * (cx - p[0]) + (q[0] - p[0]) * (cy - p[1]) < 0) [p, q] = [q, p];
      sides.push(p[0], p[1], 0, q[0], q[1], 0, q[0], q[1], -deep, p[0], p[1], 0, q[0], q[1], -deep, p[0], p[1], -deep);
    }
    out.push(P(new THREE.ShapeGeometry(new THREE.Shape(v2(h)), 1).translate(0, 0, -deep), dark, at));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
  out.push(P(g, shade(c, 0.86), at));
  return out;
}
// Parts built facing +z about the origin, set at (x, y, z) facing ry.
function phAt(parts: G[], x: number, y: number, z: number, ry: number): G[] {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  return parts.map((g) => g.applyMatrix4(m));
}
// An octagonal course (apothem a, h tall) with its faces to the axes and diagonals.
const phOct = (a: number, h: number, c: number, y: number, open = false) =>
  P(new THREE.CylinderGeometry(a / Math.cos(Math.PI / 8), a / Math.cos(Math.PI / 8), h, 8, 1, open).rotateY(Math.PI / 8).translate(0, h / 2, 0), c, { y });
// A triton kneeling on its block, blowing his conch, facing +z.
function phTriton(c: number): G[] {
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return [
    ...box(0.006, 0.0025, 0.006, shade(0xe4d8ba, 0.92)),
    // The fish tail coiled behind him, its fin up.
    rod(V3(0, 0.0025, 0.0015), V3(0.0012, 0.0035, -0.0022), 0.0017, c, 6, 0.0012),
    rod(V3(0.0012, 0.0035, -0.0022), V3(-0.0008, 0.0062, -0.0028), 0.0012, c, 5, 0.0006),
    P(new THREE.ConeGeometry(0.0016, 0.0022, 4).rotateZ(Math.PI).scale(1, 1, 0.3), c, { x: -0.0011, y: 0.0068, z: -0.0029, rz: 0.5 }),
    // His body, head, arms and the conch to his lips.
    P(new THREE.CylinderGeometry(0.0019, 0.0015, 0.0045, 6).translate(0, 0.00225, 0), c, { y: 0.004, z: 0.0012 }),
    ball(0.0012, c, { y: 0.0098, z: 0.0014 }, 0),
    rod(V3(0.0018, 0.0082, 0.0012), V3(0.0008, 0.0094, 0.0034), 0.0005, c, 4),
    rod(V3(-0.0018, 0.0082, 0.0012), V3(-0.0004, 0.0088, 0.0036), 0.0005, c, 4),
    rod(V3(0, 0.0097, 0.0024), V3(0.0004, 0.0112, 0.0052), 0.00025, shade(c, 1.12), 5, 0.0008),
  ];
}
// Zeus the Saviour, his sceptre in his raised hand, facing +z.
function phZeus(c: number): G[] {
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return [
    P(new THREE.CylinderGeometry(0.0016, 0.0024, 0.0075, 7).translate(0, 0.00375, 0), c), // the himation
    P(new THREE.CylinderGeometry(0.0021, 0.0016, 0.0042, 7).translate(0, 0.0021, 0), c, { y: 0.0075 }), // the chest
    ball(0.0012, c, { y: 0.0128, z: 0.0001 }, 1),
    ball(0.0009, shade(c, 0.9), { y: 0.0122, z: 0.0008, sy: 1.2 }, 0), // the beard
    rod(V3(0.0021, 0.0113, 0), V3(0.0036, 0.0145, 0.0006), 0.0005, c, 4),
    rod(V3(0.0038, 0.0005, 0.0006), V3(0.0038, 0.0168, 0.0006), 0.00028, shade(c, 1.15), 4),
    rod(V3(-0.0021, 0.0113, 0), V3(-0.0032, 0.0082, 0.0026), 0.0005, c, 4),
    P(new THREE.ConeGeometry(0.0007, 0.0014, 5).translate(0, 0.0007, 0), shade(c, 1.15), { x: -0.0033, y: 0.0075, z: 0.0029 }), // an orb of victory
  ];
}

// On its islet: the walled precinct, its corner towers, a stair up from the
// shore; the great square first stage, a little narrowed toward the top,
// its rows of windows sunk in its walls between string courses, its
// pilasters, its cornice and the terrace with tritons blowing conchs at the
// corners; the octagonal second, windowed and corniced, its balcony; the
// round lantern of columns with its fire under a dome, Zeus the Saviour on
// top; a ramp on arches up to the door.
export function greatLighthouse(islet: () => G[]): G[] {
  const L = 0xe4d8ba, D = 0x2e2a26, out: G[] = [...islet()];
  const TOWER = 0xa8604a;
  // The precinct: a battered footing, a wall with its cornice and merlons,
  // arrow slits; round towers at the corners; a stair up from the shore.
  const pw = 0.104;
  out.push(...frustum(pw + 0.006, pw + 0.006, pw, pw, 0.003, shade(L, 0.82), { y: 0.0035 }));
  out.push(...box(pw, 0.0055, pw, shade(L, 0.92), { y: 0.0065 }, shade(L, 0.86)));
  out.push(...box(pw + 0.0018, 0.0012, pw + 0.0018, shade(L, 0.98), { y: 0.0108 }, shade(L, 0.86)));
  for (let i = 0; i < 12; i++) for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t = -0.046 + (i * 0.092) / 11;
    if (!(fz === 1 && Math.abs(t) < 0.01)) out.push(...box(0.003, 0.003, 0.003, shade(L, 0.9), { x: fx ? fx * 0.0505 : t, y: 0.012, z: fz ? fz * 0.0505 : t }));
    if (i % 2 === 1 && !(fz === 1 && Math.abs(t) < 0.01)) {
      const ry = Math.atan2(fx, fz), o = pw / 2 + 0.0002;
      out.push(pane(0.0012, 0.0032, D, fx ? fx * o : t + 0.0042, 0.007, fz ? fz * o : t + 0.0042, ry));
    }
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const at = { x: x * 0.05, z: z * 0.05 };
    out.push(drumC(0.0082, 0.0075, 0.0035, 12, shade(L, 0.84), { ...at, y: 0.0035 }));
    out.push(P(new THREE.CylinderGeometry(0.0072, 0.0075, 0.0125, 12, 1, true).translate(0, 0.00625, 0), shade(L, 0.95), { ...at, y: 0.007 }));
    out.push(drumC(0.0083, 0.0083, 0.002, 12, shade(L, 1.02), { ...at, y: 0.0195 }));
    out.push(cone(0.0082, 0.0075, 12, TOWER, { ...at, y: 0.0215 }));
    out.push(ball(0.0008, BRONZE, { ...at, y: 0.0292 }));
    for (const k of [0, 1, 2]) {
      const a = Math.atan2(x, z) + (k - 1) * 0.9;
      out.push(pane(0.0012, 0.003, D, at.x + Math.sin(a) * 0.00745, 0.0125, at.z + Math.cos(a) * 0.00745, a));
    }
  }
  // The stair from the landing stage to the precinct's gate.
  for (let i = 0; i < 4; i++) out.push(...box(0.014, 0.003 + i * 0.0021, 0.003, shade(L, 0.9 - i * 0.015), { y: 0.0035, z: pw / 2 + 0.0125 - i * 0.003 }, shade(L, 0.94)));
  out.push(...box(0.018, 0.0055, 0.0012, shade(L, 0.86), { y: 0.012, z: pw / 2 - 0.0006 }));
  out.push(...archPane(0.006, 0.0025, D, 0, 0.012, pw / 2 + 0.00005));

  // The first stage: a square tower on its plinth, its windows sunk in its
  // walls, pilasters at its corners, string courses, the cornice.
  const y0 = 0.012, h1 = 0.086, w1 = 0.046, yb = y0 + 0.004;
  out.push(...box(w1 + 0.007, 0.0025, w1 + 0.007, shade(L, 0.9), { y: y0 }));
  out.push(...box(w1 + 0.004, 0.0015, w1 + 0.004, shade(L, 0.96), { y: y0 + 0.0025 }));
  const rows = [0.012, 0.0245, 0.037, 0.0495, 0.062, 0.0745], cols = [-0.0135, 0, 0.0135];
  const doorH = 0.0105, doorY = 0.012;
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const nx = Math.sin(ry), nz = Math.cos(ry), o = w1 / 2;
    const holes: PhPt[][] = [];
    for (const [ri, v] of rows.entries()) for (const u of cols) {
      if (ry === 0 && u === 0 && ri === 0) continue;
      holes.push(phOpening(u, v, u === 0 ? 0.0042 : 0.0034, u === 0 ? 0.0068 : 0.0058, ri >= 4));
    }
    if (ry === 0) holes.push(phOpening(0, doorY, 0.0072, doorH, true));
    out.push(...phWall([[-w1 / 2, 0], [w1 / 2, 0], [w1 / 2, h1], [-w1 / 2, h1]], holes, 0.0018, L, D, { x: nx * o, y: yb, z: nz * o, ry }));
    // Each window's lintel and sill.
    const tx = Math.cos(ry), tz = -Math.sin(ry), f = o + 0.0003;
    for (const [ri, v] of rows.entries()) for (const u of cols) {
      if (ry === 0 && u === 0 && ri === 0) continue;
      const w = u === 0 ? 0.0042 : 0.0034, h = u === 0 ? 0.0068 : 0.0058;
      out.push(pane(w + 0.0016, 0.0009, shade(L, 0.9), nx * f + tx * u, yb + v - 0.0009, nz * f + tz * u, ry));
      if (ri < 4) out.push(pane(w + 0.0012, 0.0012, shade(L, 1.05), nx * f + tx * u, yb + v + h, nz * f + tz * u, ry));
    }
    // Pilasters at the corners.
    for (const s of [-1, 1]) out.push(...box(0.0034, h1 - 0.0016, 0.0034, shade(L, 1.04), { x: nx * o + tx * s * o, y: yb, z: nz * o + tz * s * o }));
  }
  // The door's frame and its bronze doors.
  const frame = new THREE.Shape(phOpening(0, doorY - 0.0004, 0.0096, doorH + 0.0016, true).map(([u, v]) => new THREE.Vector2(u, v)));
  frame.holes.push(new THREE.Path(phOpening(0, doorY, 0.0072, doorH, true).map(([u, v]) => new THREE.Vector2(u, v))));
  out.push(P(new THREE.ShapeGeometry(frame, 1), shade(L, 1.07), { y: yb, z: w1 / 2 + 0.00025 }));
  out.push(...archPane(0.0066, doorH - 0.0003, 0x6a4a2a, 0, yb + doorY, w1 / 2 - 0.0015));
  // String courses between the windows.
  for (const v of [0.0365, 0.0615]) out.push(...box(w1 + 0.0042, 0.0016, w1 + 0.0042, shade(L, 0.93), { y: yb + v - 0.0034 }));
  // The cornice in steps, the terrace's parapet, the tritons on its corners.
  const y1 = yb + h1;
  out.push(...box(w1 + 0.0046, 0.0016, w1 + 0.0046, shade(L, 0.93), { y: y1 - 0.0016 }));
  // (Its dentils: the shadowed gaps between them.)
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (let i = 0; i < 15; i++) {
    const o = (w1 + 0.0046) / 2 + 0.0002, u = -0.0238 + (i * 0.0476) / 14;
    out.push(pane(0.0009, 0.0011, shade(L, 0.62), Math.sin(ry) * o + Math.cos(ry) * u, y1 - 0.0013, Math.cos(ry) * o - Math.sin(ry) * u, ry));
  }
  out.push(...box(w1 + 0.007, 0.0018, w1 + 0.007, shade(L, 0.98), { y: y1 }));
  out.push(...box(w1 + 0.0095, 0.0018, w1 + 0.0095, shade(L, 1.03), { y: y1 + 0.0018 }, shade(L, 0.9)));
  const yt = y1 + 0.0036, pr = (w1 + 0.0085) / 2;
  out.push(ring(w1 + 0.0085, 0.0022, w1 + 0.0085, shade(L, 1.0), { y: yt }));
  out.push(ring(w1 + 0.0075, 0.0022, w1 + 0.0075, shade(L, 0.94), { y: yt }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...phAt(phTriton(BRONZE), x * (pr - 0.0032), yt, z * (pr - 0.0032), Math.atan2(x, z)));

  // The second stage: octagonal, on its plinth, windowed between corner
  // piers, a string course, the cornice and its balcony.
  const y2 = yt, h2 = 0.038, a2 = 0.017, s2 = 2 * a2 * Math.tan(Math.PI / 8);
  out.push(phOct(a2 + 0.0018, 0.0025, shade(L, 0.93), y2));
  const y2b = y2 + 0.0025;
  for (let k = 0; k < 8; k++) {
    const ry = (k * Math.PI) / 4;
    const holes = [0.0045, 0.0165, 0.0285].map((v, i) => phOpening(0, v, 0.0032, i === 2 ? 0.0065 : 0.0058, true));
    out.push(...phWall([[-s2 / 2, 0], [s2 / 2, 0], [s2 / 2, h2], [-s2 / 2, h2]], holes, 0.0016, shade(L, 1.02), D, { x: Math.sin(ry) * a2, y: y2b, z: Math.cos(ry) * a2, ry }));
    for (const v of [0.0045, 0.0165, 0.0285]) out.push(pane(0.0044, 0.0008, shade(L, 0.9), Math.sin(ry) * (a2 + 0.0003), y2b + v - 0.0008, Math.cos(ry) * (a2 + 0.0003), ry));
    const rc = a2 / Math.cos(Math.PI / 8), ac = ry + Math.PI / 8;
    out.push(...box(0.0022, h2 - 0.0015, 0.0022, shade(L, 1.06), { x: Math.sin(ac) * rc, y: y2b, z: Math.cos(ac) * rc, ry: ac }));
  }
  out.push(phOct(a2 + 0.0011, 0.0014, shade(L, 0.94), y2b + 0.0132));
  out.push(phOct(a2 + 0.0011, 0.0014, shade(L, 0.94), y2b + 0.0252));
  const y2t = y2b + h2;
  out.push(phOct(a2 + 0.0012, 0.0015, shade(L, 0.93), y2t - 0.0015));
  out.push(phOct(a2 + 0.0026, 0.002, shade(L, 1.03), y2t));
  out.push(phOct(a2 + 0.0022, 0.002, shade(L, 0.98), y2t + 0.002, true));
  out.push(phOct(a2 + 0.0014, 0.002, shade(L, 0.92), y2t + 0.002, true));

  // The lantern: a ring of columns round the fire, the entablature, a dome,
  // the god on top.
  const y3 = y2t + 0.002;
  out.push(drumC(0.0128, 0.0128, 0.003, 16, shade(L, 0.97), { y: y3 }));
  out.push(drumC(0.0134, 0.0134, 0.001, 16, shade(L, 1.03), { y: y3 + 0.003 }));
  const yc = y3 + 0.004, ch = 0.0105;
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2, x = Math.sin(a) * 0.0108, z = Math.cos(a) * 0.0108;
    out.push(...box(0.0026, 0.0007, 0.0026, shade(L, 0.95), { x, y: yc, z, ry: a }));
    out.push(P(new THREE.CylinderGeometry(0.00095, 0.00115, ch - 0.0016, 6, 1, true).translate(0, (ch - 0.0016) / 2, 0), L, { x, y: yc + 0.0007, z }));
    out.push(...box(0.0026, 0.0009, 0.0026, shade(L, 1.04), { x, y: yc + ch - 0.0009, z, ry: a }));
  }
  // The fire in its brazier, the bronze mirror behind it.
  out.push(drumC(0.0042, 0.0052, 0.0025, 10, BRONZE, { y: yc }));
  out.push(P(new THREE.ConeGeometry(0.0045, 0.0075, 7, 1, true).translate(0, 0.00375, 0), 0xe8803a, { y: yc + 0.0025 }));
  for (const [x, z, h] of [[0.0022, 0.001, 0.006], [-0.002, -0.0015, 0.0065], [0.0004, 0.0022, 0.005]] as const) out.push(P(new THREE.ConeGeometry(0.0022, h, 5, 1, true).translate(0, h / 2, 0), 0xffc45a, { x, y: yc + 0.0025, z }));
  out.push(ball(0.0026, 0xfff0b0, { y: yc + 0.004 }, 0));
  out.push(P(new THREE.CircleGeometry(0.0042, 10), 0xc9a14a, { y: yc + 0.0085, z: -0.0068, rx: 0.35 }));
  // The entablature, the dome, the plinth and the god.
  const ye = yc + ch;
  out.push(P(new THREE.CylinderGeometry(0.0126, 0.0126, 0.0022, 16, 1, true).translate(0, 0.0011, 0), shade(L, 0.97), { y: ye }));
  out.push(drumC(0.0138, 0.0138, 0.0014, 16, shade(L, 1.03), { y: ye + 0.0022 }));
  const yd = ye + 0.0036;
  out.push(P(new THREE.SphereGeometry(0.0128, 16, 4, 0, Math.PI * 2, 0, Math.PI / 2), BRONZE, { y: yd, sy: 0.52 }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    out.push(P(new THREE.TorusGeometry(0.0128, 0.00035, 3, 6, Math.PI / 2), shade(BRONZE, 0.82), { y: yd, ry: a + Math.PI / 2, sy: 0.52 }));
  }
  const yz = yd + 0.0128 * 0.52;
  out.push(drumC(0.0028, 0.0022, 0.0024, 8, shade(L, 1.02), { y: yz - 0.0006 }));
  out.push(...phAt(phZeus(0xc9a14a), 0, yz + 0.0018, 0, 0));

  // The ramp on its arches from the gate up to the door.
  const rz0 = pw / 2 - 0.0014, rz1 = w1 / 2 + 0.0035, ry0 = 0.012, ry1 = yb + doorY;
  const prof: PhPt[] = [[rz1, ry0], [rz0, ry0], [rz0, ry0 + 0.0025], [rz1, ry1]];
  const arches = [0.25, 0.5, 0.75].map((t) => {
    const z = rz0 + (rz1 - rz0) * t, top = ry0 + 0.0025 + (ry1 - ry0 - 0.0025) * t - 0.0025;
    return phOpening(z, ry0, 0.0048, top - ry0, true);
  });
  const shape = new THREE.Shape(prof.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of arches) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  out.push(P(new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -0.004).rotateY(-Math.PI / 2).translate(0, 0.0001, 0), shade(L, 0.93)));
  const rl = Math.hypot(rz0 - rz1, ry1 - ry0 - 0.0025), tilt = Math.atan2(ry1 - ry0 - 0.0025, rz0 - rz1);
  for (const s of [-1, 1]) out.push(P(new THREE.BoxGeometry(0.0009, 0.0022, rl), shade(L, 1.02), { x: s * 0.00365, y: (ry0 + 0.0025 + ry1) / 2 + 0.0011, z: (rz0 + rz1) / 2, rx: tilt }));
  return out;
}

// ---------- Salisbury Plain ----------

// The circle whole as built: thirty sarsens under a ring of lintels, the
// horseshoe of five trilithons rising to the tallest at the back, the
// bluestone circle and horseshoe, the altar stone; the bank and its chalk
// ditch round it, open to the avenue and the Heel Stone; the station
// stones. (On the bare ground, no
// platform: wonderModels.ts ON_BARE_GROUND.)
export function stonehenge(): G[] {
  const r = rnd(11), out: G[] = [];
  const SARSEN = 0xa09a8c, BLUE = 0x7f8a94, CHALK = 0xe6e2d6;
  const stone = (c: number) => shade(c, 0.88 + r() * 0.2);
  out.push(disc(0.06, shade(GRASS, 1.06), 0, 0, 0.0003, 28));
  out.push(annulus(0.064, 0.0685, CHALK, 0, 0, 0.0004, 40));
  // The bank, open toward the avenue (+z).
  const gap = 0.5;
  out.push(P(new THREE.TorusGeometry(0.0715, 0.003, 4, 40, Math.PI * 2 - gap).rotateX(Math.PI / 2).rotateY(1.5 * Math.PI - gap / 2), shade(GRASS, 0.92), { y: 0.0003, sy: 0.5 }));
  for (const s of [-1, 1]) out.push(...box(0.0025, 0.0012, 0.012, shade(GRASS, 0.92), { x: s * 0.011, z: 0.072 }));
  // The sarsen circle and its lintels (three lintels fallen, one upright down).
  const R = 0.046, n = 30;
  const fallen = new Set([7, 8, 19, 20]);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, ry = -a + Math.PI / 2;
    if (i === 20) { out.push(...box(0.0062, 0.0048, 0.021, stone(SARSEN), { x: Math.cos(a) * (R + 0.012), y: 0, z: Math.sin(a) * (R + 0.012), ry: ry + 0.3 })); continue; }
    out.push(...frustum(0.0064, 0.005, 0.0056, 0.0044, 0.021, stone(SARSEN), { x: Math.cos(a) * R, z: Math.sin(a) * R, ry }, stone(SARSEN)));
    const b = a + Math.PI / n;
    if (!fallen.has(i)) out.push(...box(0.0098, 0.0028, 0.0042, stone(SARSEN), { x: Math.cos(b) * R, y: 0.021, z: Math.sin(b) * R, ry: -b + Math.PI / 2 }).map((g) => g.translate(0, (i % 3) * 0.00012, 0)));
  }
  out.push(...box(0.0095, 0.0028, 0.0042, stone(SARSEN), { x: Math.cos(0.9) * (R + 0.008), y: 0, z: Math.sin(0.9) * (R + 0.008), ry: 0.4 }));
  // The bluestone circle.
  for (let i = 0; i < 40; i++) {
    const a = ((i + 0.3 * r()) / 40) * Math.PI * 2;
    out.push(...frustum(0.003, 0.0024, 0.0024, 0.0018, 0.008 + r() * 0.004, stone(BLUE), { x: Math.cos(a) * 0.037, z: Math.sin(a) * 0.037, ry: -a + r() * 0.4 }));
  }
  // The trilithons: a horseshoe open to the avenue, the back one tallest.
  const tri = [[-1.25, 0.024], [-0.62, 0.027], [0, 0.032], [0.62, 0.027], [1.25, 0.024]] as const;
  for (const [f, h] of tri) {
    const a = -Math.PI / 2 + f * 1.05, x = Math.cos(a) * 0.026, z = Math.sin(a) * 0.024, ry = -a + Math.PI / 2;
    const tx = Math.cos(ry), tz = -Math.sin(ry);
    for (const s of [-1, 1]) out.push(...frustum(0.0068, 0.0052, 0.0058, 0.0046, h, stone(SARSEN), { x: x + tx * s * 0.0046, z: z + tz * s * 0.0046, ry }, stone(SARSEN)));
    out.push(...box(0.0172, 0.0034, 0.0052, stone(SARSEN), { x, y: h, z, ry }));
  }
  // The bluestone horseshoe inside, the altar stone at its heart.
  for (let i = 0; i < 15; i++) {
    const a = Math.PI / 2 + Math.PI * (0.2 + (1.6 * i) / 14);
    out.push(...box(0.0024, 0.009 + (Math.abs(i - 7) < 3 ? 0.003 : 0), 0.002, stone(BLUE), { x: Math.cos(a) * 0.016, z: Math.sin(a) * 0.0145, ry: -a }));
  }
  out.push(...box(0.012, 0.0016, 0.0035, 0x8a7a6a, { z: -0.004 }));
  // The Heel Stone in the avenue, the Slaughter Stone lying at the entrance, the station stones.
  out.push(...frustum(0.008, 0.007, 0.005, 0.004, 0.016, stone(SARSEN), { x: 0.004, z: 0.0735, ry: 0.4 }, stone(SARSEN)));
  out.push(...box(0.0056, 0.002, 0.012, stone(SARSEN), { x: 0.002, z: 0.061, ry: 0.2 }));
  for (const [x, z] of [[-0.03, -0.05], [0.032, -0.048], [-0.031, 0.049], [0.03, 0.05]] as const) out.push(...box(0.0035, 0.004, 0.0028, stone(SARSEN), { x, z }));
  return out;
}

// ---------- Babylon ----------

// A mountain of gardens: five terraces of brick on vaulted arcades,
// planted with palms, cypresses, fruit trees and flowers, vines hanging over
// every edge; a stair up the front; water running down the front in
// cascades, terrace by terrace; a
// pavilion on the top; at the foot, a band of blue glazed brick with
// golden lions and dragons.
// Its terraces' tiers (widths, each TIER tall, the stack set back GARDEN_DZ),
// and the spots along each ledge where its plants stand: a tree (a palm,
// a cypress, a round-headed tree) or flowering bushes (pick 3).
const TIERS = [0.146, 0.118, 0.092, 0.068, 0.046], TIER = 0.022, GARDEN_DZ = -0.002;
// (Where the water runs down the front: inside every terrace's face it falls over.)
const CASCADE = 0.022;
function gardenSpots(i: number): { x: number; z: number; y: number; pick: number; k: number }[] {
  const w = TIERS[i]!, d = w * 0.94, next = TIERS[i + 1];
  if (next === undefined) return [];
  const yl = (i + 1) * TIER, mid = (w + next) / 4, midD = (d + next * 0.94) / 4;
  const spots: [number, number][] = [];
  const nAlong = Math.max(3, Math.round(w / 0.016));
  for (let k = 0; k < nAlong; k++) {
    const t = -w / 2 + 0.006 + (k * (w - 0.012)) / (nAlong - 1);
    if (Math.abs(t) > 0.01 && Math.abs(t - CASCADE) > 0.006) spots.push([t, midD]);
    spots.push([t, -midD]);
  }
  for (let k = 1; k < nAlong - 1; k++) { const t = -d / 2 + 0.006 + (k * (d - 0.012)) / (nAlong - 1); spots.push([mid, t], [-mid, t]); }
  return spots.map(([x, z], k) => ({ x, z: z + GARDEN_DZ, y: yl, pick: (k + i) % 4, k }));
}
// Its trees, the flora's own (wonderModels.ts WonderGrounds), standing on
// its terraces: palms, cypresses and round-headed trees along the ledges,
// two palms by the pavilion on the top.
export function hangingGardensGrounds(): WonderGrounds {
  const r = rnd(6), trees: GroundTree[] = [];
  for (let i = 0; i < TIERS.length; i++) for (const sp of gardenSpots(i)) {
    if (sp.pick === 0) trees.push({ x: sp.x, z: sp.z, y: sp.y, kind: 'palm', height: 0.018 + r() * 0.006 });
    else if (sp.pick === 1) trees.push({ x: sp.x, z: sp.z, y: sp.y, kind: 'cypress', height: 0.016 + r() * 0.005 });
    else if (sp.pick === 2) trees.push({ x: sp.x, z: sp.z, y: sp.y, kind: 'beechMaple', height: 0.011 + r() * 0.002 });
  }
  const yt = TIERS.length * TIER;
  trees.push({ x: 0.016, z: GARDEN_DZ + 0.012, y: yt, kind: 'palm', height: 0.022 }, { x: -0.016, z: GARDEN_DZ + 0.01, y: yt, kind: 'palm', height: 0.019 });
  return { trees };
}
export function hangingGardens(H: number): G[] {
  const r = rnd(5), out: G[] = [];
  const BRICK = 0xc49c66, DARK = 0x3d3026, SOIL = 0x6f8a3c, GLAZE = 0x2f5e9e, GOLD = 0xe2b84a;
  out.push(flat(2 * H, 2 * H, 0xc8b48c, 0, 0, 0.0003));
  const tiers = TIERS, th = TIER, dz = GARDEN_DZ;
  const flowers = [0xd77aa0, 0xe8c84a, 0xf0ece0, 0x9a6ac0, 0xe0703a];
  tiers.forEach((w, i) => {
    const d = w * 0.94, y = i * th;
    out.push(...box(w, th, d, shade(BRICK, 1 - i * 0.015), { y, z: dz }, SOIL));
    out.push(ring(w, 0.0028, d, shade(BRICK, 1.08), { y: y + th, z: dz }));
    // The arcades on the front and sides (the front's middle left for the stair).
    const arcY = y + (i === 0 ? 0.0095 : 0.004), aw = 0.0055, ah = 0.0085;
    for (const [face, len] of [[0, w], [1, d], [3, d]] as const) {
      const ry = face === 0 ? 0 : face === 1 ? Math.PI / 2 : -Math.PI / 2;
      const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
      const o = (face === 0 ? d : w) / 2 + 0.0003, n = Math.floor(len / 0.0095);
      for (let k = 0; k < n; k++) {
        const t = -len / 2 + (k + 0.5) * (len / n);
        if (face === 0 && (Math.abs(t) < 0.009 || Math.abs(t - CASCADE) < 0.005)) continue;
        out.push(...archPane(aw, ah - aw / 2, DARK, nx * o + tx * t, arcY, dz + nz * o + tz * t, ry));
      }
      // Vines hanging from the edge above, of every length.
      const m = Math.floor(len / 0.0032);
      for (let k = 0; k < m; k++) {
        const t = -len / 2 + (k + 0.5) * (len / m);
        if (face === 0 && (Math.abs(t) < 0.008 || Math.abs(t - CASCADE) < 0.004)) continue;
        if (r() < 0.3) continue;
        const l = 0.004 + r() * r() * 0.014, ov = o + 0.0006 + r() * 0.0004;
        out.push(...box(0.0016 + r() * 0.001, l, 0.0009, shade(LEAF, 0.8 + r() * 0.35), { x: nx * ov + tx * t, y: y + th + 0.0028 - l, z: dz + nz * ov + tz * t, ry }));
        if (r() < 0.25) out.push(ball(0.0011, flowers[Math.floor(r() * flowers.length)]!, { x: nx * (ov + 0.0006) + tx * t, y: y + th - l * 0.6, z: dz + nz * (ov + 0.0006) + tz * t }));
      }
    }
    // The ledge between this terrace and the next: flowers along it, among
    // its trees (the flora's own: hangingGardensGrounds).
    for (const sp of gardenSpots(i)) if (sp.pick === 3) {
      const k = sp.k;
      out.push(bush(sp.x, sp.z, 0.0026, flowers[k % flowers.length]!, sp.y), bush(sp.x + 0.003, sp.z + 0.002, 0.002, shade(LEAF, 1.1), sp.y));
    }
  });
  // The stair up the front, flight by flight (the first from the ground),
  // each of its steps a block.
  const flight = (z0: number, z1: number, y: number, hw: number) => {
    const n = 7, run = (z0 - z1) / n, rise = th / n;
    // (Each block runs back into the wall behind, so none shares its face.)
    for (let s = 0; s < n; s++) { const zf = z0 - s * run, zb = z1 - 0.0006; out.push(...box(hw * 2, rise * (s + 1) - 0.00015, zf - zb, shade(BRICK, 1.1), { y, z: (zf + zb) / 2 }, shade(BRICK, s % 2 ? 1.12 : 1.18))); }
  };
  flight(dz + tiers[0]! * 0.47 + 0.011, dz + tiers[0]! * 0.47, 0, 0.007);
  for (let i = 0; i < tiers.length - 1; i++) flight(dz + tiers[i]! * 0.47 - 0.0004, dz + tiers[i + 1]! * 0.47, (i + 1) * th, 0.006);
  // The pavilion on the top, its parapet stepped, a dome of reeds.
  const yt = tiers.length * th;
  out.push(...box(0.028, 0.012, 0.022, shade(BRICK, 1.08), { y: yt, z: dz - 0.004 }));
  for (let k = 0; k < 7; k++) out.push(...box(0.0028, 0.003, 0.0028, shade(BRICK, 1.02), { x: -0.0125 + k * 0.0042, y: yt + 0.012, z: dz - 0.004 + 0.0096 }));
  out.push(...archPane(0.006, 0.006, DARK, 0, yt, dz - 0.004 + 0.0113));
  out.push(P(new THREE.SphereGeometry(0.008, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xb89a5e, { y: yt + 0.012, z: dz - 0.006 }));
  // The water: lifted (by hidden screws) to a pool on the highest terrace
  // but one, running down the front from it in cascades, terrace by terrace.
  for (let i = 0; i < tiers.length - 1; i++) {
    const d = tiers[i]! * 0.94, y = i * th;
    out.push(pane(0.004, th, 0x7fb4cc, CASCADE, y, dz + d / 2 + 0.0009));
    out.push(pane(0.0018, th, 0xd8eef4, CASCADE + 0.0004, y, dz + d / 2 + 0.0011));
    if (i > 0) out.push(flat(0.007, 0.006, WATER, CASCADE, dz + d / 2 + 0.0035, y + 0.0004));
  }
  { const n = tiers.length - 1, d = tiers[n - 1]! * 0.94; out.push(flat(0.007, 0.006, WATER, CASCADE, dz + d / 2 - 0.0035, n * th + 0.0004)); }
  // At the foot, the band of blue glaze, golden beasts striding along it.
  const w0 = tiers[0]!, d0 = w0 * 0.94;
  for (const [ry, len, o] of [[0, w0, d0 / 2], [Math.PI / 2, d0, w0 / 2], [-Math.PI / 2, d0, w0 / 2], [Math.PI, w0, d0 / 2]] as const) {
    const nx = Math.sin(ry), nz = Math.cos(ry), tx2 = Math.cos(ry), tz2 = -Math.sin(ry);
    out.push(pane(len, 0.0065, GLAZE, nx * (o + 0.0002), 0.0015, dz + nz * (o + 0.0002), ry));
    for (let k = 0; k < Math.floor(len / 0.009); k++) {
      const t = -len / 2 + 0.0045 + k * 0.009;
      if (ry === 0 && Math.abs(t) < 0.008) continue;
      out.push(pane(0.0042, 0.0028, GOLD, nx * (o + 0.0004) + tx2 * t, 0.0033, dz + nz * (o + 0.0004) + tz2 * t, ry));
    }
  }
  return out;
}

// ---------- Ephesus ----------

// An Ionic column as kit.ts column draws it, in fewer triangles: open
// drums, no hidden tops (the abacus's under the architrave), its carved
// lower drum in `band`; the inner rows (`plain`), seen only between the
// outer, with fewer sides and no volutes.
function ephColumn(x: number, y: number, z: number, r: number, h: number, c: number, band?: number, plain = false): G[] {
  const out: G[] = [], cap = r * 1.25, base = r * 0.7, sh = h - base - cap;
  const tube = (r0: number, r1: number, hh: number, n: number, col: number, yy: number) => cyl(r0, r1, hh, n, col, { x, y: yy, z });
  if (plain) out.push(ring(r * 2.7, r * 0.35, r * 2.7, shade(c, 0.95), { x, y, z }));
  else out.push(...box(r * 2.7, r * 0.35, r * 2.7, shade(c, 0.95), { x, y, z }));
  out.push(tube(r * (plain ? 1.18 : 1.32), r * 1.18, r * 0.35, 6, c, y + r * 0.35));
  if (band !== undefined) {
    const bh = sh * 0.16;
    out.push(tube(r * 1.04, r * 1.02, bh, 10, band, y + base));
    out.push(tube(r, r * 0.85, sh - bh, 10, c, y + base + bh));
  } else out.push(tube(r, r * 0.85, sh, plain ? 8 : 10, c, y + base));
  const yc = y + base + sh;
  out.push(tube(r * 0.9, r * 1.05, cap * 0.35, plain ? 6 : 8, c, yc));
  // The volutes: a scroll either side, rolled about the front-back axis.
  if (!plain) for (const s of [-1, 1]) out.push(P(new THREE.CylinderGeometry(cap * 0.42, cap * 0.42, r * 1.9, 5).rotateX(Math.PI / 2), shade(c, 0.97), { x: x + s * r * 1.05, y: yc + cap * 0.48, z }));
  out.push(ring(r * 2.3, cap * 0.22, r * 2.0, c, { x, y: yc + cap * 0.78, z }));
  return out;
}

// The great temple of Artemis on its walled precinct: a stepped platform,
// a double forest of Ionic columns (the outer ones with their carved lower
// drums), the cella within; the entablature with its painted frieze, the
// tiled roof with its pediments and acroteria.
export function templeOfArtemis(): G[] {
  const out: G[] = [], C = MARBLE, PAINT = 0x3d5f8f, TILE = 0xb5603e, CARVED = 0xd8c8a8;
  // The precinct: a paved terrace.
  out.push(...box(0.11, 0.012, 0.152, shade(C, 0.86), {}, 0xcfc4ae));
  for (let i = 0; i < 18; i++) out.push(flat(0.11, 0.0003, shade(0xcfc4ae, 0.93), 0, -0.0755 + i * 0.0088, 0.01205));
  const st = steps(0.088, 0.126, 4, 0.0035, 0.002, shade(C, 0.95), { y: 0.012, z: -0.008 }, shade(C, 1.02));
  out.push(...st.parts);
  const y = st.y, zc = -0.008, colH = 0.064, r = 0.0034;
  const hw = st.w / 2 - 0.0045, hd = st.d / 2 - 0.0045;
  // The outer colonnade (carved drums), the inner one, the cella within.
  out.push(...peristyle(0, zc, hw, hd, 8, 12, (x, z) => ephColumn(x, y, z, r, colH, C, CARVED)));
  const sx = (2 * hw) / 7, sz = (2 * hd) / 11;
  out.push(...peristyle(0, zc, hw - sx, hd - sz, 6, 10, (x, z) => ephColumn(x, y, z, r * 0.95, colH, C, undefined, true)));
  out.push(...box(0.03, colH, 0.07, shade(C, 0.96), { y, z: zc - 0.004 }));
  out.push(pane(0.009, 0.03, 0x3a2e24, 0, y, zc - 0.004 + 0.0353));
  // Her statue before the doorway, gilded.
  out.push(...figure(0, zc + 0.036, 0.022, 0xd2a64a, { y, skin: 0x8a6a4a }));
  // The entablature and the roof.
  const roof = templeRoof(0, zc, st.w, st.d, y + colH, C, PAINT, TILE, 0x4a6c9a);
  out.push(...roof.parts);
  // The frieze's figures: a procession in white on the blue.
  const fy = y + colH + st.w * 0.045 + 0.0007, fo = st.w * 0.002 + 0.0003;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 30; k++) out.push(pane(0.0012, 0.0024, 0xf0ebe0, s * (st.w / 2 + fo), fy, zc - st.d / 2 + 0.003 + k * ((st.d - 0.006) / 29), s * Math.PI / 2));
    for (let k = 0; k < 18; k++) out.push(pane(0.0012, 0.0024, 0xf0ebe0, -st.w / 2 + 0.003 + k * ((st.w - 0.006) / 17), fy, zc + s * (st.d / 2 + fo), s > 0 ? 0 : Math.PI));
  }
  return out;
}
export const ANCIENT: Models<'pyramids' | 'greatLighthouse' | 'stonehenge' | 'hangingGardens' | 'templeOfArtemis'> = {
  pyramids,
  greatLighthouse: () => greatLighthouse(islet),
  stonehenge,
  hangingGardens: () => hangingGardens(H),
  templeOfArtemis,
};
