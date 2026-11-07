// The Medieval era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z. (Machu Picchu stands on its mountain
// top instead: buildingCatalog.ts, cityProps.ts.)

import * as THREE from 'three';
import { frustum, gable, spire } from '../houseKit.ts';
import {
  H, P, V, archPane, ball, box, cone, cyl, drumC, figure, flat, pane, rod, shade,
  type G, type Models,
} from './kit.ts';

// In a city a wonder is fitted to its rectangle by its widest extent: each
// stands on a plain pad covering the whole site, so the fit is the same for
// all (a city cell 0.039 site units), and is scaled to fill as much of the
// pad as its proportions allow at about its height in cells.
const CELL_SITE = 0.039, PAD = 0xc2baa6;
function onPad(parts: G[], cells: number): G[] {
  const b = new THREE.Box3();
  for (const g of parts) { g.computeBoundingBox(); b.union(g.boundingBox!); }
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, half = Math.max(b.max.x - cx, b.max.z - cz);
  const k = Math.min((cells * CELL_SITE) / b.max.y, (H * 0.97) / half);
  // (Where the pad's width stops it short, it is raised a little more, at
  // most 1.3 times: wide low wonders keep storeys near the town's.)
  const ky = k * Math.min(1.3, (cells * CELL_SITE) / (k * b.max.y));
  const m = new THREE.Matrix4().makeScale(k, ky, k).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
  return [flat(2 * H, 2 * H, PAD, 0, 0, 0.0003), ...parts.map((g) => g.applyMatrix4(m))];
}

// ---------- local pieces ----------

// A pointed (lancet) opening facing ry: a pane with a triangle on top.
function lancet(w: number, h: number, c: number, x: number, y: number, z: number, ry = 0): G[] {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, h, 0, w / 2, h, 0, 0, h + w * 0.85, 0], 3));
  return [pane(w, h, c, x, y, z, ry), P(tri, c, { x, y, z, ry })];
}
// Openings round a drum: n panes facing out at radius r.
function roundPanes(n: number, r: number, w: number, h: number, c: number, cx: number, y: number, cz: number, phase = 0, arched = false): G[] {
  const out: G[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + phase) / n) * Math.PI * 2, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
    if (arched) out.push(...archPane(w, h - w / 2, c, x, y, z, a));
    else out.push(pane(w, h, c, x, y, z, a));
  }
  return out;
}
// Openings along a wall: n panes facing ry, spread over `len` about the
// point (x, z), their bottoms at y.
function rowOf(n: number, len: number, make: (x: number, z: number) => G[], x: number, z: number, ry: number): G[] {
  const out: G[] = [], tx = Math.cos(ry), tz = -Math.sin(ry);
  for (let i = 0; i < n; i++) { const t = -len / 2 + (i + 0.5) * (len / n); out.push(...make(x + tx * t, z + tz * t)); }
  return out;
}
// Half a cylinder's wall (the round end of an apse), facing +z or -z.
const halfDrum = (r: number, h: number, c: number, x: number, y: number, z: number, toward: 1 | -1, n = 14) =>
  P(new THREE.CylinderGeometry(r, r, h, n, 1, true, toward > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).translate(0, h / 2, 0), c, { x, y, z });
// Half a dome (a semidome), facing +z or -z; sy squashes it.
const halfDome = (r: number, c: number, x: number, y: number, z: number, toward: 1 | -1, sy = 1, n = 14) =>
  P(new THREE.SphereGeometry(r, n, 5, toward > 0 ? 0 : Math.PI, Math.PI, 0, Math.PI / 2), c, { x, y, z, sy });
// A half cone (an apse's roof), facing +z or -z.
const halfCone = (r: number, h: number, c: number, x: number, y: number, z: number, toward: 1 | -1, n = 14) =>
  P(new THREE.ConeGeometry(r, h, n, 1, true, toward > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).translate(0, h / 2, 0), c, { x, y, z });
// Each part turned about the point (px, 0, pz): leaning `lean` toward +x.
function leaning(parts: G[], lean: number, px: number, pz: number): G[] {
  const m = new THREE.Matrix4().makeTranslation(px, 0, pz).multiply(new THREE.Matrix4().makeRotationZ(-lean));
  return parts.map((g) => g.applyMatrix4(m));
}
// A wedge of stair rising from (z0, y0) to (z1, y1) along z, w wide, at x;
// its steps marked by lines.
function stair(x: number, w: number, z0: number, y0: number, z1: number, y1: number, c: number, steps = 8): G[] {
  const hw = w / 2, g = new THREE.BufferGeometry(), dy = y1 - y0;
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -hw, dy, z1, hw, dy, z1, hw, 0, z0, -hw, dy, z1, hw, 0, z0, -hw, 0, z0,
    -hw, 0, z0, -hw, dy, z1, -hw, 0, z1, hw, dy, z1, hw, 0, z0, hw, 0, z1,
  ], 3));
  const out: G[] = [P(g, c, { x, y: y0 })];
  const n = Math.hypot(z1 - z0, dy), nz = dy / n * Math.sign(z0 - z1), ny = Math.abs(z1 - z0) / n;
  for (let s = 1; s < steps; s++) {
    const f = s / steps, y = y0 + f * dy + ny * 0.00025, z = z0 + f * (z1 - z0) + nz * 0.00025;
    out.push(rod(V(x - hw, y, z), V(x + hw, y, z), 0.00018, shade(c, 0.78), 3));
  }
  return out;
}
// The same stair turned to rise toward the middle from any side: ry about (cx, cz).
const turned = (parts: G[], ry: number, cx: number, cz: number) => {
  const m = new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
  return parts.map((g) => g.applyMatrix4(m));
};

// ---------- Constantinople ----------

// Hagia Sophia: the great shallow dome on its ring of forty windows, set
// on the square of its four arches (the tympanum walls north and south
// pierced with windows, the massive buttresses beside them), the half domes
// east and west with their small semidomes, the galleries' long block, the
// narthex before it; the four minarets of its Ottoman years; a fountain in
// the court, cypresses and tombs in the gardens.
function hagiaSophia(): G[] {
  const out: G[] = [];
  const PL = 0xd6a07c, PL2 = shade(PL, 0.88), LEAD = 0x8d949a, WIN = 0x3a3330, GOLD = 0xd9b04a, WHITE = 0xe8e2d4;
  const zc = -0.006;
  // The galleries' block, two rows of arched windows down each side.
  out.push(...box(0.074, 0.024, 0.08, PL, { z: zc }, shade(LEAD, 0.95)));
  for (const s of [-1, 1]) for (const y of [0.004, 0.014]) out.push(...rowOf(12, 0.072, (x, z) => archPane(0.0028, 0.004, WIN, x, y, z, s * Math.PI / 2), s * 0.0373, zc, s * Math.PI / 2));
  // The square of the four great arches rising over it, its tympana windowed.
  out.push(...box(0.042, 0.044, 0.042, PL, { z: zc }, LEAD));
  for (const s of [-1, 1]) {
    const x = s * 0.0213;
    out.push(...archPane(0.034, 0.014, PL2, x, 0.024, zc, s * Math.PI / 2));
    out.push(...rowOf(7, 0.03, (xx, z) => archPane(0.0024, 0.0045, WIN, xx, 0.0255, z, s * Math.PI / 2), x + s * 0.0003, zc, s * Math.PI / 2));
    out.push(...rowOf(5, 0.022, (xx, z) => archPane(0.0024, 0.004, WIN, xx, 0.0335, z, s * Math.PI / 2), x + s * 0.0003, zc, s * Math.PI / 2));
    // The buttresses either side of the arch, sloped on top.
    for (const t of [-1, 1]) {
      const bz = zc + t * 0.0185;
      out.push(...box(0.0245, 0.034, 0.009, PL2, { x: s * 0.03275, z: bz }));
      out.push(...frustum(0.0245, 0.009, 0.008, 0.007, 0.006, PL2, { x: s * 0.03275, y: 0.034, z: bz }, LEAD));
    }
  }
  // The dome: its drum of forty windows between little buttresses, the shallow cap ribbed, a gilded crescent.
  const yd = 0.044, rd = 0.0195;
  out.push(drumC(rd, rd, 0.0052, 40, PL, { y: yd, z: zc }));
  out.push(...roundPanes(40, rd + 0.0002, 0.0017, 0.003, WIN, 0, yd + 0.0009, zc, 0.5));
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; out.push(...box(0.0011, 0.0046, 0.0018, PL2, { x: Math.sin(a) * (rd + 0.0006), y: yd, z: zc + Math.cos(a) * (rd + 0.0006), ry: a })); }
  const dome = (sc: number) => P(new THREE.SphereGeometry(0.0208 * sc, 40, 8, 0, Math.PI * 2, 0, Math.PI / 2), LEAD, { y: yd + 0.005, z: zc, sy: 0.55 });
  out.push(dome(1));
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2, pts = [0, 0.4, 0.75, 1].map((f) => { const th = f * Math.PI / 2 * 0.92; return V(Math.sin(a) * Math.cos(th) * 0.0209, yd + 0.005 + Math.sin(th) * 0.0209 * 0.55, zc + Math.cos(a) * Math.cos(th) * 0.0209); });
    for (let k = 0; k < 3; k++) out.push(rod(pts[k]!, pts[k + 1]!, 0.00025, shade(LEAD, 0.85), 3));
  }
  out.push(rod(V(0, yd + 0.0162, zc), V(0, yd + 0.021, zc), 0.0003, GOLD, 4), ball(0.0007, GOLD, { y: yd + 0.0185, z: zc }));
  out.push(P(new THREE.TorusGeometry(0.0013, 0.00035, 3, 8, Math.PI * 1.3), GOLD, { y: yd + 0.0225, z: zc, rz: Math.PI * 0.85 }));
  // The half domes east and west on their half drums, each with two small semidomes below.
  for (const t of [-1, 1] as const) {
    const z = zc + t * 0.021;
    out.push(halfDrum(rd, 0.008, PL, 0, 0.024, z, t, 20));
    for (let k = 0; k < 5; k++) { const a = (t > 0 ? 0 : Math.PI) + (k - 2) * 0.5; out.push(...archPane(0.002, 0.003, WIN, Math.sin(a) * (rd + 0.0002), 0.0255, z + Math.cos(a) * (rd + 0.0002), a)); }
    out.push(halfDome(rd, LEAD, 0, 0.032, z, t, 0.55, 20));
    for (const s of [-1, 1]) {
      const x = s * 0.0128, zz = zc + t * 0.033;
      out.push(halfDrum(0.0085, 0.003, PL, x, 0.024, zz, t, 10), halfDome(0.0085, LEAD, x, 0.027, zz, t, 0.6, 10));
    }
  }
  // The narthex and exonarthex before it, windows and the bronze doors.
  out.push(...box(0.074, 0.02, 0.012, PL2, { z: 0.0405 }, LEAD));
  out.push(...rowOf(9, 0.068, (x, z) => archPane(0.0032, 0.004, WIN, x, 0.0128, z), 0, 0.0468, 0));
  out.push(...box(0.07, 0.012, 0.006, PL, { z: 0.04975 }, shade(LEAD, 0.92)));
  out.push(...rowOf(9, 0.064, (x, z) => archPane(0.0032, 0.0045, 0x6a5030, x, 0, z), 0, 0.0531, 0));
  // The minarets, two taller at the west.
  const minaret = (x: number, z: number, h: number) => {
    out.push(...box(0.0072, 0.012, 0.0072, WHITE, { x, z }));
    out.push(cyl(0.0027, 0.0022, h - 0.012, 12, WHITE, { x, y: 0.012, z }));
    for (const f of [0.62, 0.82]) {
      const y = 0.012 + (h - 0.012) * f;
      out.push(drumC(0.0036, 0.0034, 0.0011, 12, shade(WHITE, 0.95), { x, y, z }), cyl(0.0036, 0.0036, 0.0011, 12, shade(WHITE, 0.9), { x, y: y + 0.0011, z }));
    }
    out.push(cone(0.0027, 0.013, 12, LEAD, { x, y: h, z }), rod(V(x, h + 0.013, z), V(x, h + 0.0165, z), 0.0002, GOLD, 3));
  };
  minaret(-0.041, 0.052, 0.076); minaret(0.041, 0.052, 0.076); minaret(-0.041, -0.052, 0.066); minaret(0.041, -0.052, 0.066);
  return onPad(out, 5);
}

// ---------- Angkor ----------

// A lotus tower: tiers swelling and narrowing to a bud, alternately shaded,
// on a square shrine with its four doors.
function lotus(x: number, y: number, z: number, h: number, r: number, c: number): G[] {
  const out: G[] = [];
  out.push(...box(r * 2.2, h * 0.2, r * 2.2, shade(c, 0.95), { x, y, z }));
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) out.push(pane(r * 0.6, h * 0.12, 0x2e2822, x + Math.sin(a) * (r * 1.1 + 0.0002), y, z + Math.cos(a) * (r * 1.1 + 0.0002), a));
  const prof = [[1.05, 0.2], [1.1, 0.27], [0.98, 0.33], [1.0, 0.39], [0.86, 0.46], [0.88, 0.52], [0.72, 0.59], [0.72, 0.65], [0.55, 0.72], [0.52, 0.78], [0.36, 0.85], [0.3, 0.9], [0.16, 0.95], [0.0, 1.0]];
  for (let i = 0; i + 1 < prof.length; i++) {
    const [r0, y0] = prof[i]!, [r1, y1] = prof[i + 1]!;
    const lathe = new THREE.LatheGeometry([new THREE.Vector2(r0 * r, y0 * h), new THREE.Vector2(r1 * r, y1 * h)], 8);
    out.push(P(lathe, shade(c, i % 2 ? 0.9 : 1.04), { x, y, z, ry: Math.PI / 8 }));
  }
  return out;
}
// A gallery: a rectangle of covered walks w × d, each `t` wide and h high
// under its stone roof, pillars along its outer faces.
function gallery(cx: number, cz: number, w: number, d: number, t: number, y: number, h: number, c: number, roof: number): G[] {
  const out: G[] = [];
  for (const [x, z, sw, sd, along] of [[cx, cz + d / 2 - t / 2, w, t, false], [cx, cz - d / 2 + t / 2, w, t, false], [cx - w / 2 + t / 2, cz, t, d - 2 * t, true], [cx + w / 2 - t / 2, cz, t, d - 2 * t, true]] as const) {
    out.push(...box(sw, h, sd, shade(c, 0.85), { x, y, z }));
    out.push(...gable(sw + 0.0008, sd + 0.0008, t * 0.5, roof, { x, y: y + h, z }, along, shade(c, 0.9)));
  }
  // Pillars down the outer faces, before the dark walk.
  for (const [ry, len, o] of [[0, w, d / 2], [Math.PI, w, d / 2], [Math.PI / 2, d, w / 2], [-Math.PI / 2, d, w / 2]] as const) {
    const nx = Math.sin(ry), nz = Math.cos(ry), n = Math.floor(len / 0.0034);
    out.push(pane(len - 0.002, h * 0.8, 0x3a332c, cx + nx * (o + 0.0002), y, cz + nz * (o + 0.0002), ry));
    out.push(...rowOf(n, len - 0.002, (xx, zz) => box(0.0011, h * 0.8, 0.0011, c, { x: xx, y, z: zz }), cx + nx * (o + 0.0009), cz + nz * (o + 0.0009), ry));
  }
  return out;
}
// Angkor Wat: the temple mountain within its moat: the causeway with its
// naga balustrades over the water to the western gate, the long raised way
// on to the temple between the libraries and the pools; the three galleries
// rising one within another on their terraces, steep stairs to the highest,
// and the quincunx of lotus towers, the middle one tallest; sugar palms and
// forest on the island, monks in saffron, an elephant at the gate.
function angkorWat(): G[] {
  const out: G[] = [];
  const S = 0xa39478, ROOF = 0x857a66;
  // The temple: its three galleries on their terraces.
  const cz = -0.006;
  out.push(...box(0.09, 0.006, 0.076, shade(S, 0.9), { z: cz }, shade(S, 1.05)));
  out.push(...gallery(0, cz, 0.086, 0.072, 0.006, 0.006, 0.0055, S, ROOF));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...lotus(x * 0.04, 0.0115, cz + z * 0.033, 0.014, 0.0028, S));
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const along = Math.abs(Math.sin(a)) > 0.5, x = Math.sin(a) * (along ? 0.04 : 0), z = cz + Math.cos(a) * (along ? 0 : 0.033);
    out.push(...lotus(x, 0.0115, z, 0.016, 0.0034, S));
  }
  out.push(...box(0.062, 0.008, 0.052, shade(S, 0.88), { y: 0.006, z: cz }, shade(S, 1.04)));
  out.push(...gallery(0, cz, 0.058, 0.048, 0.005, 0.014, 0.006, S, ROOF));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...lotus(x * 0.0265, 0.02, cz + z * 0.0215, 0.016, 0.0026, S));
  // The highest terrace, banded, its steep stairs, the inner gallery and its cross.
  const yt = 0.014, ht = 0.016;
  out.push(...frustum(0.04, 0.036, 0.034, 0.03, ht, shade(S, 0.92), { y: yt, z: cz }, shade(S, 1.05)));
  for (let k = 1; k < 5; k++) { const f = k / 5; out.push(...frustum(0.04 - 0.006 * f + 0.0006, 0.036 - 0.006 * f + 0.0006, 0.04 - 0.006 * (f + 0.03) + 0.0006, 0.036 - 0.006 * (f + 0.03) + 0.0006, ht * 0.03, shade(S, 0.8), { y: yt + ht * f, z: cz })); }
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const along = Math.abs(Math.sin(a)) > 0.5, half = along ? 0.017 : 0.015;
    out.push(...turned(stair(0, 0.005, cz + half + 0.009, yt, cz + half - 0.0005, yt + ht, shade(S, 1.05), 12), a, 0, cz));
  }
  const y1 = yt + ht;
  out.push(...gallery(0, cz, 0.034, 0.03, 0.004, y1, 0.006, S, ROOF));
  out.push(...box(0.004, 0.006, 0.022, shade(S, 0.85), { y: y1, z: cz }), ...box(0.026, 0.006, 0.004, shade(S, 0.85), { y: y1, z: cz }));
  out.push(...gable(0.0048, 0.0228, 0.002, ROOF, { y: y1 + 0.006, z: cz }, true, S), ...gable(0.0268, 0.0048, 0.002, ROOF, { y: y1 + 0.006, z: cz }));
  // The five towers.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...lotus(x * 0.015, y1, cz + z * 0.013, 0.036, 0.0042, S));
  out.push(...lotus(0, y1, cz, 0.062, 0.0058, shade(S, 1.03)));
  return onPad(out, 5);
}

// ---------- Paris ----------

// Notre-Dame on its island: the west front with its three portals, the
// gallery of kings, the rose window and the open gallery, the two square
// towers; the nave under its steep lead roof, its double aisles, the
// transept with its roses, the apse and the ambulatory, flying buttresses
// all round on their pinnacled piers; the spire over the crossing with the
// apostles climbing to it; the Seine either side, a boat on it, trees.
function notreDame(): G[] {
  const out: G[] = [];
  const ST = 0xd5ccb6, ST2 = shade(ST, 0.9), LEAD = 0x6f7a80, DOOR = 0x4a3e34, GLASS = 0x2a3f7a;
  const y0 = 0;
  // The nave, the inner and outer aisles.
  const zf = 0.0495, zb = -0.042;
  out.push(...box(0.016, 0.036, zf - zb, ST, { y: y0, z: (zf + zb) / 2 }));
  out.push(...gable(0.0172, zf - zb, 0.014, LEAD, { y: y0 + 0.036, z: (zf + zb) / 2 }, true, ST));
  for (const s of [-1, 1]) {
    const za = zb + 0.0004, zz = zf - 0.0004;
    out.push(...box(0.0083, 0.024, zz - za, ST2, { x: s * 0.01185, y: y0, z: (zz + za) / 2 }, LEAD));
    out.push(...box(0.005, 0.016, zz - za, ST2, { x: s * 0.0185, y: y0, z: (zz + za) / 2 }, shade(LEAD, 0.95)));
    // Clerestory and aisle windows.
    out.push(...rowOf(10, zf - zb - 0.004, (x, z) => lancet(0.0022, 0.006, GLASS, x, y0 + 0.026, z, s * Math.PI / 2), s * 0.0081, (zf + zb) / 2, s * Math.PI / 2));
    out.push(...rowOf(12, zf - zb - 0.004, (x, z) => lancet(0.002, 0.0055, GLASS, x, y0 + 0.004, z, s * Math.PI / 2), s * 0.0212, (zf + zb) / 2, s * Math.PI / 2));
  }
  // The transept, its rose windows at the ends.
  const zt = -0.007;
  out.push(...box(0.052, 0.036, 0.014, ST, { y: y0, z: zt }));
  out.push(...gable(0.052, 0.0152, 0.014, LEAD, { y: y0 + 0.036, z: zt }, false, ST));
  for (const s of [-1, 1]) {
    const x = s * 0.0262;
    out.push(P(new THREE.CircleGeometry(0.0052, 16).rotateY(s * Math.PI / 2), ST2, { x: x + s * 0.0002, y: y0 + 0.026, z: zt }));
    out.push(P(new THREE.CircleGeometry(0.0044, 16).rotateY(s * Math.PI / 2), GLASS, { x: x + s * 0.0004, y: y0 + 0.026, z: zt }));
    out.push(P(new THREE.CircleGeometry(0.0016, 8).rotateY(s * Math.PI / 2), 0x8a3a6a, { x: x + s * 0.0006, y: y0 + 0.026, z: zt }));
    out.push(...lancet(0.006, 0.01, DOOR, x + s * 0.0002, y0, zt, s * Math.PI / 2));
  }
  // The apse and the ambulatory round the east end.
  out.push(halfDrum(0.008, 0.036, ST, 0, y0, zb, -1, 14), halfCone(0.0086, 0.014, LEAD, 0, y0 + 0.036, zb, -1, 14));
  out.push(halfDrum(0.0165, 0.024, ST2, 0, y0, zb, -1, 16), halfDrum(0.0212, 0.016, ST2, 0, y0, zb, -1, 18));
  out.push(P(new THREE.RingGeometry(0.0079, 0.0166, 16, 1, 0, Math.PI).rotateX(-Math.PI / 2), LEAD, { y: y0 + 0.024, z: zb }));
  out.push(P(new THREE.RingGeometry(0.0164, 0.0213, 18, 1, 0, Math.PI).rotateX(-Math.PI / 2), shade(LEAD, 0.95), { y: y0 + 0.016, z: zb }));
  for (let k = 0; k < 7; k++) { const t = (k + 0.5) * (Math.PI / 7); out.push(...lancet(0.0018, 0.006, GLASS, Math.cos(t) * 0.0082, y0 + 0.0255, zb - Math.sin(t) * 0.0082, Math.atan2(Math.cos(t), -Math.sin(t)))); }
  // Flying buttresses: piers with pinnacles down both sides, flyers to the walls.
  const pier = (x: number, z: number, ry: number, toX: number, toZ: number) => {
    out.push(...box(0.0028, 0.03, 0.0036, ST2, { x, y: y0, z, ry }));
    out.push(cone(0.0019, 0.0065, 4, ST, { x, y: y0 + 0.03, z, ry: ry + Math.PI / 4 }));
    out.push(rod(V(x, y0 + 0.028, z), V(toX, y0 + 0.0345, toZ), 0.0006, ST, 4));
    out.push(rod(V(x, y0 + 0.019, z), V(x + (toX - x) * 0.47, y0 + 0.0235, z + (toZ - z) * 0.47), 0.0005, ST, 4));
  };
  for (let k = 0; k < 11; k++) {
    const z = -0.038 + k * 0.0082;
    if (z > -0.016 && z < 0.002) continue;
    for (const s of [-1, 1]) pier(s * 0.0235, z, 0, s * 0.008, z);
  }
  for (let k = 0; k < 5; k++) { const a = Math.PI + (k + 0.5) * (Math.PI / 5); pier(Math.cos(a) * 0.0235, zb + Math.sin(a) * 0.0235, -a, Math.cos(a) * 0.0082, zb + Math.sin(a) * 0.0082); }
  // The west front: its block, portals, kings, rose, gallery, and the two towers.
  const zw = 0.057, fz = 0.064;
  out.push(...box(0.042, 0.047, 0.014, ST, { y: y0, z: zw }, LEAD));
  out.push(...lancet(0.0085, 0.008, DOOR, 0, y0, fz + 0.0003), ...lancet(0.0068, 0.007, DOOR, -0.0128, y0, fz + 0.0003), ...lancet(0.0068, 0.007, DOOR, 0.0128, y0, fz + 0.0003));
  for (const yb of [0.0155, 0.0355]) out.push(...box(0.0432, 0.0013, 0.0144, ST2, { y: y0 + yb, z: zw }));
  for (let k = 0; k < 24; k++) out.push(...figure(-0.0195 + k * (0.039 / 23), fz + 0.0012, 0.0036, shade(ST, 0.8), { y: y0 + 0.0168, skin: shade(ST, 0.85) }));
  out.push(P(new THREE.CircleGeometry(0.0062, 20), ST2, { y: y0 + 0.027, z: fz + 0.0003 }));
  out.push(P(new THREE.CircleGeometry(0.0053, 20), GLASS, { y: y0 + 0.027, z: fz + 0.0005 }));
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; out.push(P(new THREE.CircleGeometry(0.0008, 6), k % 2 ? 0x9a2a3a : 0x6a3a8a, { x: Math.cos(a) * 0.0036, y: y0 + 0.027 + Math.sin(a) * 0.0036, z: fz + 0.0007 })); }
  out.push(P(new THREE.CircleGeometry(0.0014, 8), 0xc8a040, { y: y0 + 0.027, z: fz + 0.0007 }));
  for (const s of [-1, 1]) out.push(...lancet(0.0026, 0.008, GLASS, s * 0.0128, y0 + 0.022, fz + 0.0003));
  out.push(pane(0.04, 0.0055, 0x2e2a26, 0, y0 + 0.0375, fz + 0.0003));
  for (let k = 0; k < 22; k++) out.push(cyl(0.00035, 0.00035, 0.0055, 4, ST, { x: -0.0195 + k * (0.039 / 21), y: y0 + 0.0375, z: fz + 0.0009 }));
  for (const s of [-1, 1]) {
    const x = s * 0.0125, yT = y0 + 0.047, hT = 0.027;
    out.push(...box(0.0155, hT, 0.014, ST, { x, y: yT, z: zw }, LEAD));
    for (const [ry, o] of [[0, 0.007], [Math.PI, 0.007], [Math.PI / 2, 0.00775], [-Math.PI / 2, 0.00775]] as const) {
      const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
      for (const t of [-1, 1]) out.push(...lancet(0.0026, 0.015, 0x2e2a26, x + nx * (o + 0.0003) + tx * t * 0.0034, yT + 0.004, zw + nz * (o + 0.0003) + tz * t * 0.0034, ry));
    }
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(cone(0.0009, 0.0045, 4, ST2, { x: x + a * 0.0068, y: yT + hT, z: zw + b * 0.006 }));
  }
  // The spire over the crossing, its rooster, the apostles climbing to it.
  const ys = y0 + 0.046;
  out.push(cyl(0.0042, 0.004, 0.009, 8, LEAD, { y: ys, z: zt }));
  out.push(...roundPanes(8, 0.0043, 0.0012, 0.005, 0x2e2a26, 0, ys + 0.002, zt, 0.5));
  out.push(cone(0.004, 0.05, 8, LEAD, { y: ys + 0.009, z: zt, ry: Math.PI / 8 }), ball(0.0009, 0xd9b04a, { y: ys + 0.0595, z: zt }));
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (let k = 0; k < 3; k++) {
    const f = 0.006 + k * 0.004, x = dx * f, z = zt + dz * f;
    out.push(...figure(x, z, 0.0034, 0x6f9a88, { y: y0 + 0.05 - 0.0014 * k - (Math.abs(dz) * 0.0007), skin: 0x6f9a88 }));
  }
  return onPad(out, 5.5);
}

// ---------- Borgund ----------

// A dragon's head reaching out from a gable's apex at (x, y, z), toward s (±z).
function dragon(x: number, y: number, z: number, s: number, l: number, c: number): G[] {
  const a = V(x, y, z), b = V(x, y + l * 0.45, z + s * l * 0.35), d = V(x, y + l * 0.7, z + s * l * 0.85);
  return [rod(a, b, l * 0.07, c, 4), rod(b, d, l * 0.06, c, 4), ball(l * 0.1, c, { x, y: d.y, z: d.z + s * l * 0.05, sz: 1.5 }), cone(l * 0.06, l * 0.25, 4, c, { x, y: d.y - l * 0.04, z: d.z + s * l * 0.12, rx: s * Math.PI / 2 })];
}
// A shingled gable roof (ridge along z when alongZ), its courses marked.
function shingled(w: number, d: number, h: number, c: number, o: { x?: number; y: number; z?: number }, alongZ: boolean, end: number): G[] {
  const out = gable(w, d, h, c, o, alongZ, end);
  const x0 = o.x ?? 0, z0 = o.z ?? 0, n = 6;
  for (let k = 1; k < n; k++) {
    const f = k / n, y = o.y + f * h + 0.0002;
    for (const s of [-1, 1]) {
      if (alongZ) { const x = x0 + s * (w / 2) * (1 - f); out.push(rod(V(x + s * 0.0002, y, z0 - d / 2), V(x + s * 0.0002, y, z0 + d / 2), 0.00022, shade(c, 0.75), 3)); }
      else { const z = z0 + s * (d / 2) * (1 - f); out.push(rod(V(x0 - w / 2, y, z + s * 0.0002), V(x0 + w / 2, y, z + s * 0.0002), 0.00022, shade(c, 0.75), 3)); }
    }
  }
  return out;
}
// Staves: dark vertical lines down a wall's faces.
function staves(cx: number, cz: number, w: number, d: number, y: number, h: number, c: number): G[] {
  const out: G[] = [];
  for (const [ry, len, o] of [[0, w, d / 2], [Math.PI, w, d / 2], [Math.PI / 2, d, w / 2], [-Math.PI / 2, d, w / 2]] as const) {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    out.push(...rowOf(Math.floor(len / 0.0022), len, (x, z) => [pane(0.0003, h, c, x, y, z, ry)], cx + nx * (o + 0.0002), cz + nz * (o + 0.0002), ry));
  }
  return out;
}

// The stave church: dark tarred timber, its roofs stacked in tiers of
// shingles, dragons' heads reaching from the gables, a turret and spire on
// the ridge; the open gallery round its foot under its own roof; the
// chancel and the round apse with its little tower; the belfry apart; the
// churchyard with its stone wall, lychgate, gravestones, birches and pines.
function staveChurch(): G[] {
  const out: G[] = [];
  const WOOD = 0x6e4a32, SH = 0x46362c, LINE = 0x2e2119;
  const cx = -0.004, cz = -0.004;
  // The gallery round the foot: low walls with round arches, its roof.
  out.push(...box(0.056, 0.009, 0.066, WOOD, { x: cx, z: cz }, SH));
  for (const [ry, len, o] of [[0, 0.056, 0.033], [Math.PI, 0.056, 0.033], [Math.PI / 2, 0.066, 0.028], [-Math.PI / 2, 0.066, 0.028]] as const) {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    out.push(...rowOf(Math.floor(len / 0.0035), len - 0.004, (x, z) => (ry === 0 && Math.abs(x - cx) < 0.005 ? [] : archPane(0.0018, 0.0035, LINE, x, 0.0035, z, ry)), cx + nx * (o + 0.0002), cz + nz * (o + 0.0002), ry));
  }
  out.push(...frustum(0.061, 0.071, 0.044, 0.054, 0.008, SH, { x: cx, y: 0.009, z: cz }));
  // The porch on the gallery's front, its gable and a dragon.
  out.push(...box(0.012, 0.012, 0.007, WOOD, { x: cx, z: cz + 0.0367 }));
  out.push(pane(0.005, 0.008, LINE, cx, 0, cz + 0.0404));
  out.push(...shingled(0.014, 0.0082, 0.007, SH, { x: cx, y: 0.012, z: cz + 0.0365 }, true, WOOD));
  out.push(...dragon(cx, 0.018, cz + 0.0406, 1, 0.006, SH));
  // The aisles' wall above the gallery roof, their roof; the nave, its roof.
  out.push(...box(0.044, 0.025, 0.054, WOOD, { x: cx, z: cz }, SH));
  out.push(...staves(cx, cz, 0.044, 0.054, 0.017, 0.008, LINE));
  out.push(...frustum(0.049, 0.059, 0.032, 0.042, 0.008, SH, { x: cx, y: 0.025, z: cz }));
  out.push(...box(0.032, 0.042 - 0.025, 0.042, WOOD, { x: cx, y: 0.025, z: cz }));
  out.push(...staves(cx, cz, 0.032, 0.042, 0.033, 0.009, LINE));
  out.push(...shingled(0.036, 0.046, 0.019, SH, { x: cx, y: 0.042, z: cz }, true, WOOD));
  for (const s of [-1, 1]) out.push(...dragon(cx, 0.061, cz + s * 0.0232, s, 0.011, SH));
  // Small gables on the aisle roof, front and back, crossed.
  for (const s of [-1, 1]) {
    out.push(...shingled(0.016, 0.006, 0.007, SH, { x: cx, y: 0.029, z: cz + s * 0.0262 }, false, WOOD));
    out.push(rod(V(cx, 0.036, cz + s * 0.029), V(cx, 0.041, cz + s * 0.029), 0.0003, LINE, 3), rod(V(cx - 0.0015, 0.0395, cz + s * 0.029), V(cx + 0.0015, 0.0395, cz + s * 0.029), 0.0003, LINE, 3));
  }
  // The turret on the ridge: its shingled skirt, little gables, the spire.
  const ty = 0.054;
  out.push(...box(0.009, 0.014, 0.009, WOOD, { x: cx, y: ty, z: cz }));
  out.push(...frustum(0.013, 0.013, 0.008, 0.008, 0.004, SH, { x: cx, y: ty + 0.006, z: cz }));
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) out.push(pane(0.002, 0.003, LINE, cx + Math.sin(a) * 0.0047, ty + 0.0105, cz + Math.cos(a) * 0.0047, a));
  out.push(spire(0.0095, 0.032, SH, { x: cx, y: ty + 0.014, z: cz }));
  out.push(rod(V(cx, ty + 0.046, cz), V(cx, ty + 0.051, cz), 0.0002, 0xb89a4a, 3));
  // The chancel behind, its roof; the round apse and its little tower.
  const kz = cz - 0.035;
  out.push(...box(0.022, 0.022, 0.016, WOOD, { x: cx, z: kz }, SH));
  out.push(...staves(cx, kz, 0.022, 0.016, 0.012, 0.01, LINE));
  out.push(...frustum(0.026, 0.02, 0.016, 0.012, 0.005, SH, { x: cx, y: 0.012, z: kz }));
  out.push(...shingled(0.024, 0.0172, 0.012, SH, { x: cx, y: 0.022, z: kz }, true, WOOD));
  out.push(...dragon(cx, 0.033, kz - 0.0086, -1, 0.007, SH));
  out.push(halfDrum(0.0075, 0.018, WOOD, cx, 0, kz - 0.008, -1, 10), halfCone(0.0082, 0.009, SH, cx, 0.018, kz - 0.008, -1, 10));
  out.push(cyl(0.0024, 0.0024, 0.009, 8, WOOD, { x: cx, y: 0.022, z: kz - 0.011 }), cone(0.0032, 0.011, 8, SH, { x: cx, y: 0.031, z: kz - 0.011 }));
  return onPad(out, 3.5);
}

// ---------- Yucatán ----------

// A feathered serpent's head at the foot of a stair, facing ry.
function serpentHead(x: number, z: number, s: number, ry: number): G[] {
  const c = 0xc8bea6, nx = Math.sin(ry), nz = Math.cos(ry);
  return [
    ...box(s, s * 0.8, s * 1.2, c, { x, z, ry }),
    cone(s * 0.45, s * 0.8, 4, shade(c, 0.9), { x: x + nx * s * 0.8, y: s * 0.3, z: z + nz * s * 0.8, rx: nz * Math.PI / 2, rz: -nx * Math.PI / 2 }),
    ...[-1, 1].map((k) => ball(s * 0.12, 0x3a2a22, { x: x + nx * s * 0.6 + Math.cos(ry) * k * s * 0.35, y: s * 0.65, z: z + nz * s * 0.6 - Math.sin(ry) * k * s * 0.35 })),
  ];
}

// Chichén Itzá: El Castillo, the pyramid of Kukulcán, its nine terraces
// panelled, a stair up each side between serpent balustrades (the heads
// at the foot of the north stair), the temple on the top; the Temple of
// the Warriors and its hall of a thousand columns; the ball court with its
// stone rings; the Platform of Venus; the sacred cenote; the forest round
// the great plaza; people in white and red.
function chichenItza(): G[] {
  const out: G[] = [];
  const LS = 0xc8bea6, LS2 = shade(LS, 0.86), PANEL = shade(LS, 0.76);
  // El Castillo.
  const px = 0.012, pz = -0.008, base = 0.074, top = 0.024, n = 9, th = 0.0042;
  for (let i = 0; i < n; i++) {
    const w = base - i * ((base - top) / n), y = i * th;
    out.push(...frustum(w, w, w - 0.0016, w - 0.0016, th * 0.55, shade(LS, 0.97 + (i % 2) * 0.04), { x: px, y, z: pz }));
    out.push(...box(w - 0.0016, th * 0.45, w - 0.0016, LS2, { x: px, y: y + th * 0.55, z: pz }, shade(LS, 1.04)));
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const nx = Math.sin(ry), nz = Math.cos(ry), o = (w - 0.0016) / 2 + 0.0002, m = Math.max(2, Math.floor((w - 0.014) / 0.0045));
      for (const sd of [-1, 1]) out.push(...rowOf(m, (w - 0.016) / 2 - 0.002, (x, z) => [pane(0.0026, th * 0.3, PANEL, x, y + th * 0.6, z, ry)], px + nx * o + Math.cos(ry) * sd * ((w - 0.016) / 4 + 0.0065), pz + nz * o - Math.sin(ry) * sd * ((w - 0.016) / 4 + 0.0065), ry));
    }
  }
  const yTop = n * th;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const st = stair(px, 0.0105, pz + base / 2 + 0.006, 0, pz + top / 2 - 0.0005, yTop, shade(LS, 1.06), 18);
    for (const s of [-1, 1]) {
      const a0 = V(px + s * 0.0058, 0.0016, pz + base / 2 + 0.006), a1 = V(px + s * 0.0058, yTop + 0.0012, pz + top / 2);
      st.push(rod(a0, a1, 0.0011, LS2, 4));
      if (a === 0) st.push(...serpentHead(px + s * 0.0058, pz + base / 2 + 0.0085, 0.0034, 0));
    }
    out.push(...turned(st, a, px, pz));
  }
  // The temple on top: its doors, the serpent columns at the north, the frieze, the cresting.
  out.push(...box(0.017, 0.0115, 0.016, LS, { x: px, y: yTop, z: pz }, LS2));
  for (const [ry, x, z] of [[Math.PI / 2, px + 0.0082, pz], [-Math.PI / 2, px - 0.0082, pz], [Math.PI, px, pz - 0.0077]] as const) out.push(pane(0.003, 0.0055, 0x2e2822, x, yTop, z, ry));
  out.push(pane(0.009, 0.0058, 0x2e2822, px, yTop, pz + 0.0077));
  for (const s of [-1, 1]) out.push(...box(0.0018, 0.0058, 0.0018, LS2, { x: px + s * 0.0018, y: yTop, z: pz + 0.0077 }));
  out.push(...box(0.0166, 0.0024, 0.0156, PANEL, { x: px, y: yTop + 0.0068, z: pz }));
  for (let k = 0; k < 7; k++) out.push(...box(0.0014, 0.0016, 0.0014, LS, { x: px - 0.0068 + k * 0.00227, y: yTop + 0.0105, z: pz + 0.0068 }));
  return onPad(out, 2.8);
}

// ---------- Pisa ----------

// The Leaning Tower of Pisa, the cathedral and the baptistery on the lawn
// of the Campo dei Miracoli: the tower's blind arcade, its six open
// galleries ringed with columns and its belfry, leaning; the cathedral of
// white marble banded in grey, its facade of four tiers of galleries, its
// transept and dome; the round baptistery, its dome half lead and half red
// tile; the Camposanto's long marble wall, the city wall behind; tourists,
// one of them holding the tower up.
function leaningTower(): G[] {
  const out: G[] = [];
  const M = 0xece6d8, M2 = shade(M, 0.92), DARK = 0x3a3632;
  // The tower.
  const tw: G[] = [];
  const rb = 0.0094, h0 = 0.012, hg = 0.0074, rc = 0.0069;
  tw.push(drumC(rb, rb, h0, 24, M));
  tw.push(...roundPanes(15, rb + 0.0002, 0.0026, 0.009, shade(M, 0.86), 0, 0.0015, 0, 0, true));
  tw.push(...archPane(0.0026, 0.0045, DARK, 0, 0.0005, rb + 0.0004));
  for (let i = 0; i < 6; i++) {
    const y = h0 + i * hg;
    tw.push(drumC(rb + 0.0005, rb + 0.0005, 0.0009, 24, M2, { y }));
    tw.push(cyl(rc, rc, hg, 16, M, { y: y + 0.0009 }));
    tw.push(...roundPanes(8, rc + 0.0002, 0.0016, 0.0042, DARK, 0, y + 0.0015, 0, i * 0.25, true));
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; tw.push(cyl(0.00042, 0.00038, hg - 0.0021, 5, M, { x: Math.sin(a) * (rb - 0.0004), y: y + 0.0009, z: Math.cos(a) * (rb - 0.0004) })); }
    tw.push(cyl(rb, rb, 0.0012, 24, M, { y: y + hg - 0.0012 }));
  }
  const yb = h0 + 6 * hg;
  tw.push(drumC(rb + 0.0005, rb + 0.0005, 0.0009, 24, M2, { y: yb }));
  tw.push(cyl(0.0058, 0.0058, 0.0072, 16, M, { y: yb + 0.0009 }));
  tw.push(...roundPanes(6, 0.006, 0.0018, 0.0042, DARK, 0, yb + 0.0018, 0, 0, true));
  tw.push(drumC(0.0062, 0.0062, 0.0008, 16, M2, { y: yb + 0.0081 }));
  tw.push(cyl(rb, rb, 0.0011, 24, shade(M, 0.95), { y: yb + 0.0009 }));
  // (Leaning on a low round plinth, its foot sunk into it on the low side.)
  out.push(drumC(0.0112, 0.0112, 0.0018, 24, shade(M, 0.9)));
  out.push(...leaning(tw, 0.09, 0, 0).map((g) => g.translate(0, rb * Math.sin(0.09) + 0.00002, 0)));
  return onPad(out, 6);
}

export const MEDIEVAL: Models<'hagiaSophia' | 'angkorWat' | 'notreDame' | 'staveChurch' | 'chichenItza' | 'leaningTower'> = {
  hagiaSophia,
  angkorWat,
  notreDame,
  staveChurch,
  chichenItza,
  leaningTower,
};
