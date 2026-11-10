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
  const zc = -0.0025, DS = 0.5; // (DS: the domes' squash, before the lift below)
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
  const dome = (sc: number) => P(new THREE.SphereGeometry(0.0208 * sc, 40, 8, 0, Math.PI * 2, 0, Math.PI / 2), LEAD, { y: yd + 0.005, z: zc, sy: DS });
  out.push(dome(1));
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2, pts = [0, 0.4, 0.75, 1].map((f) => { const th = f * Math.PI / 2 * 0.92; return V(Math.sin(a) * Math.cos(th) * 0.0209, yd + 0.005 + Math.sin(th) * 0.0209 * DS, zc + Math.cos(a) * Math.cos(th) * 0.0209); });
    for (let k = 0; k < 3; k++) out.push(rod(pts[k]!, pts[k + 1]!, 0.00025, shade(LEAD, 0.85), 3));
  }
  out.push(rod(V(0, yd + 0.0162, zc), V(0, yd + 0.021, zc), 0.0003, GOLD, 4), ball(0.0007, GOLD, { y: yd + 0.0185, z: zc }));
  out.push(P(new THREE.TorusGeometry(0.0013, 0.00035, 3, 8, Math.PI * 1.3), GOLD, { y: yd + 0.0225, z: zc, rz: Math.PI * 0.85 }));
  // The half domes east and west on their half drums, each with two small semidomes below.
  for (const t of [-1, 1] as const) {
    const z = zc + t * 0.021;
    out.push(halfDrum(rd, 0.008, PL, 0, 0.024, z, t, 20));
    for (let k = 0; k < 5; k++) { const a = (t > 0 ? 0 : Math.PI) + (k - 2) * 0.5; out.push(...archPane(0.002, 0.003, WIN, Math.sin(a) * (rd + 0.0002), 0.0255, z + Math.cos(a) * (rd + 0.0002), a)); }
    out.push(halfDome(rd, LEAD, 0, 0.032, z, t, DS, 20));
    for (const s of [-1, 1]) {
      const x = s * 0.0128, zz = zc + t * 0.033;
      out.push(halfDrum(0.0085, 0.003, PL, x, 0.024, zz, t, 10), halfDome(0.0085, LEAD, x, 0.027, zz, t, DS + 0.05, 10));
    }
  }
  // The narthex and exonarthex before it, windows and the bronze doors.
  out.push(...box(0.0736, 0.02, 0.012, PL2, { z: 0.037 }, LEAD));
  out.push(...rowOf(9, 0.068, (x, z) => archPane(0.0032, 0.004, WIN, x, 0.0128, z), 0, 0.0433, 0));
  out.push(...box(0.07, 0.012, 0.006, PL, { z: 0.04625 }, shade(LEAD, 0.92)));
  out.push(...rowOf(9, 0.064, (x, z) => archPane(0.0032, 0.0045, 0x6a5030, x, 0, z), 0, 0.0496, 0));
  // The minarets, two taller at the west, close by the corners (so the
  // whole stands nearly square and fills its lot).
  const minaret = (x: number, z: number, h: number) => {
    out.push(...box(0.0072, 0.012, 0.0072, WHITE, { x, z }));
    out.push(cyl(0.0027, 0.0022, h - 0.012, 12, WHITE, { x, y: 0.012, z }));
    for (const f of [0.62, 0.82]) {
      const y = 0.012 + (h - 0.012) * f;
      out.push(drumC(0.0036, 0.0034, 0.0011, 12, shade(WHITE, 0.95), { x, y, z }), cyl(0.0036, 0.0036, 0.0011, 12, shade(WHITE, 0.9), { x, y: y + 0.0011, z }));
    }
    out.push(cone(0.0027, 0.013, 12, LEAD, { x, y: h, z }), rod(V(x, h + 0.013, z), V(x, h + 0.0165, z), 0.0002, GOLD, 3));
  };
  minaret(-0.042, 0.046, 0.076); minaret(0.042, 0.046, 0.076); minaret(-0.042, -0.042, 0.066); minaret(0.042, -0.042, 0.066);
  // Lifted a little (its domes squashed to match), so the mass reads as the
  // great building it is beside the town's houses.
  const lift = new THREE.Matrix4().makeScale(1, 1.15, 1);
  return onPad(out.map((g) => g.applyMatrix4(lift)), 5.3);
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
  // The temple: its three galleries on their terraces (each storey a
  // little taller than true, to stand by the town's).
  const cz = -0.006, T0 = 0.008, G0 = 0.0075, T1 = 0.011, G1 = 0.0082, G2 = 0.0082;
  out.push(...box(0.09, T0, 0.076, shade(S, 0.9), { z: cz }, shade(S, 1.05)));
  out.push(...gallery(0, cz, 0.086, 0.072, 0.006, T0, G0, S, ROOF));
  const yl0 = T0 + G0;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...lotus(x * 0.04, yl0, cz + z * 0.033, 0.014, 0.0028, S));
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const along = Math.abs(Math.sin(a)) > 0.5, x = Math.sin(a) * (along ? 0.04 : 0), z = cz + Math.cos(a) * (along ? 0 : 0.033);
    out.push(...lotus(x, yl0, z, 0.016, 0.0034, S));
  }
  out.push(...box(0.062, T1, 0.052, shade(S, 0.88), { y: T0, z: cz }, shade(S, 1.04)));
  const y2 = T0 + T1;
  out.push(...gallery(0, cz, 0.058, 0.048, 0.005, y2, G1, S, ROOF));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...lotus(x * 0.0265, y2 + G1, cz + z * 0.0215, 0.016, 0.0026, S));
  // The highest terrace, banded, its steep stairs, the inner gallery and its cross.
  const yt = y2, ht = 0.021;
  out.push(...frustum(0.04, 0.036, 0.034, 0.03, ht, shade(S, 0.92), { y: yt, z: cz }, shade(S, 1.05)));
  for (let k = 1; k < 5; k++) { const f = k / 5; out.push(...frustum(0.04 - 0.006 * f + 0.0006, 0.036 - 0.006 * f + 0.0006, 0.04 - 0.006 * (f + 0.03) + 0.0006, 0.036 - 0.006 * (f + 0.03) + 0.0006, ht * 0.03, shade(S, 0.8), { y: yt + ht * f, z: cz })); }
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const along = Math.abs(Math.sin(a)) > 0.5, half = along ? 0.017 : 0.015;
    out.push(...turned(stair(0, 0.005, cz + half + 0.009, yt, cz + half - 0.0005, yt + ht, shade(S, 1.05), 14), a, 0, cz));
  }
  const y1 = yt + ht;
  out.push(...gallery(0, cz, 0.034, 0.03, 0.004, y1, G2, S, ROOF));
  out.push(...box(0.004, G2, 0.022, shade(S, 0.85), { y: y1, z: cz }), ...box(0.026, G2, 0.004, shade(S, 0.85), { y: y1, z: cz }));
  out.push(...gable(0.0048, 0.0228, 0.002, ROOF, { y: y1 + G2, z: cz }, true, S), ...gable(0.0268, 0.0048, 0.002, ROOF, { y: y1 + G2, z: cz }));
  // The five towers.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...lotus(x * 0.015, y1, cz + z * 0.013, 0.036, 0.0042, S));
  out.push(...lotus(0, y1, cz, 0.062, 0.0058, shade(S, 1.03)));
  return onPad(out, 5.6);
}

// ---------- Paris ----------

// Notre-Dame, squeezed along its length to sit on a square lot (wider and
// taller than true, its nave three bays long): the west front with its
// three portals, the gallery of kings, the rose window and the open
// gallery, the two square towers; the nave under its steep lead roof, its
// double aisles, the transept with its roses, the choir, the apse and the
// ambulatory, flying buttresses all round on their pinnacled piers; the
// spire over the crossing with the apostles climbing to it.
function notreDame(): G[] {
  const out: G[] = [];
  const ST = 0xd5ccb6, ST2 = shade(ST, 0.9), LEAD = 0x6f7a80, DOOR = 0x4a3e34, GLASS = 0x2a3f7a, DARK = 0x2e2a26;
  // Widths of the nave and its aisles, their heights; the outer walls at xe.
  const nw = 0.024, ia = 0.011, oa = 0.0065, hN = 0.036, hI = 0.026, hO = 0.017, rH = 0.016;
  const xi = nw / 2 + ia / 2, xo = nw / 2 + ia + oa / 2, xe = nw / 2 + ia + oa;
  const zf = 0.031, zb = -0.023, zl = (zf + zb) / 2, L = zf - zb;
  // The nave, the inner and outer aisles.
  out.push(...box(nw, hN, L, ST, { z: zl }));
  out.push(...gable(nw + 0.0012, L, rH, LEAD, { y: hN, z: zl }, true, ST));
  for (const s of [-1, 1]) {
    const za = zb + 0.0004, zz = zf - 0.0004;
    out.push(...box(ia, hI, zz - za, ST2, { x: s * xi, z: (zz + za) / 2 }, LEAD));
    out.push(...box(oa, hO, zz - za, ST2, { x: s * xo, z: (zz + za) / 2 }, shade(LEAD, 0.95)));
    // Clerestory, inner aisle and outer aisle windows.
    out.push(...rowOf(7, L - 0.004, (x, z) => lancet(0.0026, 0.0052, GLASS, x, hI + 0.0012, z, s * Math.PI / 2), s * (nw / 2 + 0.0002), zl, s * Math.PI / 2));
    out.push(...rowOf(7, L - 0.004, (x, z) => lancet(0.0022, 0.0042, GLASS, x, hO + 0.0012, z, s * Math.PI / 2), s * (nw / 2 + ia + 0.0002), zl, s * Math.PI / 2));
    out.push(...rowOf(8, L - 0.004, (x, z) => lancet(0.0024, 0.0065, GLASS, x, 0.004, z, s * Math.PI / 2), s * (xe + 0.0002), zl, s * Math.PI / 2));
  }
  // The transept, its rose windows and portals at the ends.
  const zt = -0.0025, dt = 0.017, xt = 0.039;
  out.push(...box(2 * xt, hN, dt, ST, { z: zt }));
  out.push(...gable(2 * xt, dt + 0.0012, rH, LEAD, { y: hN, z: zt }, false, ST));
  for (const s of [-1, 1]) {
    const x = s * xt, ry = s * Math.PI / 2;
    out.push(P(new THREE.CircleGeometry(0.0066, 20).rotateY(ry), ST2, { x: x + s * 0.0002, y: 0.0262, z: zt }));
    out.push(P(new THREE.CircleGeometry(0.0057, 20).rotateY(ry), GLASS, { x: x + s * 0.0004, y: 0.0262, z: zt }));
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; out.push(P(new THREE.CircleGeometry(0.0008, 6).rotateY(ry), k % 2 ? 0x9a2a3a : 0x6a3a8a, { x: x + s * 0.0006, y: 0.0262 + Math.sin(a) * 0.0038, z: zt + Math.cos(a) * 0.0038 })); }
    out.push(P(new THREE.CircleGeometry(0.0018, 8).rotateY(ry), 0x8a3a6a, { x: x + s * 0.0006, y: 0.0262, z: zt }));
    out.push(...lancet(0.0076, 0.011, DOOR, x + s * 0.0002, 0, zt, ry));
    out.push(...box(0.0013, 0.0013, dt + 0.0014, ST2, { x: x - s * 0.0004, y: 0.0182, z: zt }));
    for (const t of [-1, 1]) out.push(cone(0.0016, 0.007, 4, ST2, { x: x - s * 0.0008, y: hN, z: zt + t * (dt / 2 - 0.0008), ry: Math.PI / 4 }));
  }
  // The apse and the ambulatory round the east end (a little flattened).
  const AZ = 0.8, apse = (g: G) => g.translate(0, 0, -zb).scale(1, 1, AZ).translate(0, 0, zb);
  const r1 = nw / 2, r2 = nw / 2 + ia, r3 = xe;
  out.push(...[
    halfDrum(r1, hN, ST, 0, 0, zb, -1, 16), halfCone(r1 + 0.0006, rH, LEAD, 0, hN, zb, -1, 16),
    halfDrum(r2, hI, ST2, 0, 0, zb, -1, 18), halfDrum(r3, hO, ST2, 0, 0, zb, -1, 20),
    P(new THREE.RingGeometry(r1 - 0.0001, r2 + 0.0001, 18, 1, 0, Math.PI).rotateX(-Math.PI / 2), LEAD, { y: hI, z: zb }),
    P(new THREE.RingGeometry(r2 - 0.0001, r3 + 0.0001, 20, 1, 0, Math.PI).rotateX(-Math.PI / 2), shade(LEAD, 0.95), { y: hO, z: zb }),
  ].map(apse));
  const onApse = (r: number, t: number) => [Math.cos(t) * r, zb - Math.sin(t) * r * AZ, Math.atan2(Math.cos(t) * AZ, -Math.sin(t))] as const;
  for (let k = 0; k < 7; k++) {
    const t = (k + 0.5) * (Math.PI / 7);
    { const [x, z, ry] = onApse(r1 + 0.0002, t); out.push(...lancet(0.0022, 0.0052, GLASS, x, hI + 0.0012, z, ry)); }
    { const [x, z, ry] = onApse(r2 + 0.0002, t); out.push(...lancet(0.002, 0.0042, GLASS, x, hO + 0.0012, z, ry)); }
    { const [x, z, ry] = onApse(r3 + 0.0002, t); out.push(...lancet(0.0022, 0.0065, GLASS, x, 0.004, z, ry)); }
  }
  // Flying buttresses: piers with pinnacles down both sides and round the
  // apse, two flyers from each to the clerestory wall.
  const hP = hO + 0.014;
  const pier = (x: number, z: number, ry: number, toX: number, toZ: number) => {
    out.push(...box(0.003, hP, 0.0038, ST2, { x, z, ry }));
    out.push(cone(0.002, 0.0075, 4, ST, { x, y: hP, z, ry: ry + Math.PI / 4 }));
    out.push(rod(V(x, hP - 0.002, z), V(toX, hN - 0.0015, toZ), 0.0007, ST, 4));
    out.push(rod(V(x, hO + 0.003, z), V(x + (toX - x) * 0.5, hI - 0.001, z + (toZ - z) * 0.5), 0.0006, ST, 4));
  };
  const xp = xe + 0.0045;
  for (const z of [0.0105, 0.0185, 0.0265, -0.0165]) for (const s of [-1, 1]) pier(s * xp, z, 0, s * (nw / 2), z);
  for (let k = 0; k < 5; k++) {
    const t = (k + 0.5) * (Math.PI / 5), [x, z] = onApse(r3 + 0.0045, t), [tx, tz] = onApse(r1, t);
    pier(x, z, -Math.atan2(zb - z, x) - Math.PI / 2, tx, tz);
  }
  // The west front: its block, portals, kings, rose, gallery, and the two towers.
  const fw = 2 * xe + 0.001, fd = 0.016, zw = zf + fd / 2 - 0.0005, fz = zw + fd / 2, hF = 0.05;
  out.push(...box(fw, hF, fd, ST, { z: zw }, LEAD));
  for (const [x, w, h] of [[0, 0.011, 0.0105], [-0.0195, 0.0092, 0.0092], [0.0195, 0.0092, 0.0092]] as const) {
    out.push(...lancet(w + 0.0024, h + 0.0012, ST2, x, 0, fz + 0.0002), ...lancet(w, h, DOOR, x, 0, fz + 0.0004));
  }
  for (const yb of [0.0168, 0.0382]) out.push(...box(fw + 0.0012, 0.0013, fd + 0.0012, ST2, { y: yb, z: zw }));
  for (let k = 0; k < 28; k++) out.push(...figure(-0.0275 + k * (0.055 / 27), fz + 0.0012, 0.0036, shade(ST, 0.8), { y: 0.0181, skin: shade(ST, 0.85) }));
  const yr = 0.0288;
  out.push(P(new THREE.CircleGeometry(0.0078, 24), ST2, { y: yr, z: fz + 0.0003 }));
  out.push(P(new THREE.CircleGeometry(0.0067, 24), GLASS, { y: yr, z: fz + 0.0005 }));
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; out.push(P(new THREE.CircleGeometry(0.0009, 6), k % 2 ? 0x9a2a3a : 0x6a3a8a, { x: Math.cos(a) * 0.0046, y: yr + Math.sin(a) * 0.0046, z: fz + 0.0007 })); }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; out.push(P(new THREE.CircleGeometry(0.0006, 5), 0xb05a40, { x: Math.cos(a) * 0.0026, y: yr + Math.sin(a) * 0.0026, z: fz + 0.0007 })); }
  out.push(P(new THREE.CircleGeometry(0.0014, 8), 0xc8a040, { y: yr, z: fz + 0.0007 }));
  for (const s of [-1, 1]) out.push(...lancet(0.0034, 0.0088, GLASS, s * 0.0195, 0.0215, fz + 0.0003));
  out.push(pane(fw - 0.004, 0.0058, DARK, 0, 0.0397, fz + 0.0003));
  for (let k = 0; k < 28; k++) out.push(cyl(0.0004, 0.0004, 0.0058, 4, ST, { x: -0.0275 + k * (0.055 / 27), y: 0.0397, z: fz + 0.001 }));
  // The towers, each with two tall lancets a face and pinnacles at its corners.
  const tw = 0.02, hT = 0.03;
  for (const s of [-1, 1]) {
    const x = s * (fw / 2 - tw / 2);
    out.push(...box(tw, hT, fd, ST, { x, y: hF, z: zw }, LEAD));
    out.push(...box(tw + 0.0012, 0.0011, fd + 0.0012, ST2, { x, y: hF + hT - 0.0013, z: zw }));
    for (const [ry, o, len] of [[0, fd / 2, tw], [Math.PI, fd / 2, tw], [Math.PI / 2, tw / 2, fd], [-Math.PI / 2, tw / 2, fd]] as const) {
      const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry), sp = len * 0.22;
      for (const t of [-1, 1]) out.push(...lancet(0.0032, 0.017, DARK, x + nx * (o + 0.0003) + tx * t * sp, hF + 0.004, zw + nz * (o + 0.0003) + tz * t * sp, ry));
    }
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(cone(0.0011, 0.0055, 4, ST2, { x: x + a * (tw / 2 - 0.0012), y: hF + hT, z: zw + b * (fd / 2 - 0.0012) }));
  }
  // The gable between the towers, behind the gallery.
  out.push(...gable(fw - 2 * tw, 0.004, 0.012, ST2, { y: hF, z: zw - 0.002 }, false, ST));
  // The spire over the crossing, its rooster, the apostles climbing to it.
  const ys = hN + 0.011;
  out.push(cyl(0.0048, 0.0046, 0.0105, 8, LEAD, { y: ys, z: zt }));
  out.push(...roundPanes(8, 0.0049, 0.0014, 0.006, DARK, 0, ys + 0.0022, zt, 0.5));
  out.push(cone(0.0046, 0.056, 8, LEAD, { y: ys + 0.0105, z: zt, ry: Math.PI / 8 }), ball(0.001, 0xd9b04a, { y: ys + 0.0675, z: zt }));
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (let k = 0; k < 3; k++) {
    const f = 0.007 + k * 0.0042, x = dx * f, z = zt + dz * f;
    out.push(...figure(x, z, 0.0036, 0x6f9a88, { y: hN + rH - 0.0018 - 0.0014 * k, skin: 0x6f9a88 }));
  }
  return onPad(out, 6);
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

// The stave church: dark tarred timber, compact and tall, its roofs
// stacked in tiers of shingles, dragons' heads reaching from the gables;
// the open gallery round its foot under its own roof; the turret on the
// ridge with its two skirts, its belfry and spire; the chancel and the
// round apse with its little tower.
function staveChurch(): G[] {
  const out: G[] = [];
  const WOOD = 0x6e4a32, SH = 0x46362c, LINE = 0x2e2119;
  const cx = 0, cz = 0.004;
  // Gallery, aisles and nave: widths, depths and the heights of their tops.
  const GW = 0.062, GD = 0.058, AW = 0.046, AD = 0.042, NW = 0.032, ND = 0.028;
  const yG = 0.009, yA = 0.03, yN = 0.054, rN = 0.024;
  // The gallery round the foot: low walls with round arches, its roof.
  out.push(...box(GW, yG, GD, WOOD, { x: cx, z: cz }, SH));
  for (const [ry, len, o] of [[0, GW, GD / 2], [Math.PI, GW, GD / 2], [Math.PI / 2, GD, GW / 2], [-Math.PI / 2, GD, GW / 2]] as const) {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    out.push(...rowOf(Math.floor(len / 0.0035), len - 0.004, (x, z) => (ry === 0 && Math.abs(x - cx) < 0.006 ? [] : archPane(0.0018, 0.0035, LINE, x, 0.0035, z, ry)), cx + nx * (o + 0.0002), cz + nz * (o + 0.0002), ry));
  }
  out.push(...frustum(GW + 0.005, GD + 0.005, AW, AD, 0.008, SH, { x: cx, y: yG, z: cz }));
  // The porch on the gallery's front, its gable and a dragon.
  const pz = cz + GD / 2 + 0.0032;
  out.push(...box(0.013, 0.013, 0.007, WOOD, { x: cx, z: pz }));
  out.push(pane(0.0055, 0.0088, LINE, cx, 0, pz + 0.0037));
  out.push(...shingled(0.015, 0.0082, 0.0075, SH, { x: cx, y: 0.013, z: pz }, true, WOOD));
  out.push(...dragon(cx, 0.0195, pz + 0.0041, 1, 0.0065, SH));
  // The aisles' wall above the gallery roof, their roof; the tall nave, its steep roof.
  out.push(...box(AW, yA, AD, WOOD, { x: cx, z: cz }, SH));
  out.push(...staves(cx, cz, AW, AD, yG + 0.008, yA - yG - 0.008, LINE));
  out.push(...frustum(AW + 0.005, AD + 0.005, NW, ND, 0.008, SH, { x: cx, y: yA, z: cz }));
  out.push(...box(NW, yN - yA, ND, WOOD, { x: cx, y: yA, z: cz }));
  out.push(...staves(cx, cz, NW, ND, yA + 0.008, yN - yA - 0.008, LINE));
  // The little round windows high in the nave walls.
  for (const [ry, len, o] of [[0, NW, ND / 2], [Math.PI, NW, ND / 2], [Math.PI / 2, ND, NW / 2], [-Math.PI / 2, ND, NW / 2]] as const) {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    out.push(...rowOf(3, len - 0.01, (x, z) => [P(new THREE.CircleGeometry(0.0011, 8).rotateY(ry), LINE, { x, y: yN - 0.0045, z })], cx + nx * (o + 0.0004), cz + nz * (o + 0.0004), ry));
  }
  out.push(...shingled(NW + 0.004, ND + 0.004, rN, SH, { x: cx, y: yN, z: cz }, true, WOOD));
  for (const s of [-1, 1]) out.push(...dragon(cx, yN + rN, cz + s * (ND / 2 + 0.002), s, 0.0095, SH));
  // Small gabled dormers on the aisle roof, front and back, crossed.
  for (const s of [-1, 1]) {
    const z = cz + s * (AD / 2 - 0.0005);
    out.push(...box(0.016, 0.006, 0.007, WOOD, { x: cx, y: yA, z }, SH));
    out.push(...shingled(0.0172, 0.0076, 0.008, SH, { x: cx, y: yA + 0.006, z }, false, WOOD));
    const zf = z + s * 0.0039;
    out.push(rod(V(cx, yA + 0.0135, zf), V(cx, yA + 0.019, zf), 0.0003, LINE, 3), rod(V(cx - 0.0017, yA + 0.0172, zf), V(cx + 0.0017, yA + 0.0172, zf), 0.0003, LINE, 3));
  }
  // The turret on the ridge: its lower stage and skirt, the belfry with its
  // little gables and second skirt, the spire.
  const ty = yN + rN - 0.008, t1 = ty + 0.0105, t2 = t1 + 0.0095;
  out.push(...box(0.012, t1 - ty, 0.012, WOOD, { x: cx, y: ty, z: cz }));
  out.push(...staves(cx, cz, 0.012, 0.012, ty + 0.004, t1 - ty - 0.0045, LINE));
  out.push(...frustum(0.0175, 0.0175, 0.0098, 0.0098, 0.0048, SH, { x: cx, y: t1 - 0.0005, z: cz }, SH));
  out.push(...box(0.0092, t2 - t1, 0.0092, WOOD, { x: cx, y: t1 + 0.004, z: cz }));
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const nx = Math.sin(a), nz = Math.cos(a);
    out.push(...archPane(0.0022, 0.003, LINE, cx + nx * 0.0048, t1 + 0.0062, cz + nz * 0.0048, a));
    out.push(...shingled(a % Math.PI === 0 ? 0.0062 : 0.003, a % Math.PI === 0 ? 0.003 : 0.0062, 0.0035, SH, { x: cx + nx * 0.004, y: t2 + 0.004 - 0.0004, z: cz + nz * 0.004 }, a % Math.PI !== 0, WOOD));
  }
  out.push(...frustum(0.0135, 0.0135, 0.0082, 0.0082, 0.0042, SH, { x: cx, y: t2 + 0.004, z: cz }, SH));
  out.push(spire(0.0088, 0.03, SH, { x: cx, y: t2 + 0.0082, z: cz }));
  out.push(rod(V(cx, t2 + 0.0382, cz), V(cx, t2 + 0.0435, cz), 0.0002, 0xb89a4a, 3));
  // The chancel behind, its skirt and roof; the round apse and its little tower.
  const kz = cz - GD / 2 - 0.006, hK = 0.028;
  out.push(...box(0.026, hK, 0.016, WOOD, { x: cx, z: kz }, SH));
  out.push(...staves(cx, kz, 0.026, 0.016, 0.019, hK - 0.019, LINE));
  out.push(...frustum(0.031, 0.021, 0.02, 0.012, 0.005, SH, { x: cx, y: 0.014, z: kz }));
  out.push(...shingled(0.028, 0.0172, 0.013, SH, { x: cx, y: hK, z: kz }, true, WOOD));
  out.push(...dragon(cx, hK + 0.013, kz - 0.0086, -1, 0.0075, SH));
  out.push(halfDrum(0.0085, 0.02, WOOD, cx, 0, kz - 0.008, -1, 12), halfCone(0.0092, 0.01, SH, cx, 0.02, kz - 0.008, -1, 12));
  out.push(cyl(0.0026, 0.0026, 0.01, 8, WOOD, { x: cx, y: 0.024, z: kz - 0.011 }), cone(0.0034, 0.013, 8, SH, { x: cx, y: 0.034, z: kz - 0.011 }));
  return onPad(out, 5.5);
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

// The Leaning Tower of Pisa: its blind arcade, four open galleries ringed
// with columns (two fewer than the real six, so it stands nearer the
// town's height) and its belfry, leaning.
function leaningTower(): G[] {
  const out: G[] = [];
  const M = 0xece6d8, M2 = shade(M, 0.92), DARK = 0x3a3632;
  // The tower.
  const tw: G[] = [];
  const rb = 0.0094, h0 = 0.012, hg = 0.0074, rc = 0.0069, NG = 4;
  tw.push(drumC(rb, rb, h0, 24, M));
  tw.push(...roundPanes(15, rb + 0.0002, 0.0026, 0.009, shade(M, 0.86), 0, 0.0015, 0, 0, true));
  tw.push(...archPane(0.0026, 0.0045, DARK, 0, 0.0005, rb + 0.0004));
  for (let i = 0; i < NG; i++) {
    const y = h0 + i * hg;
    tw.push(drumC(rb + 0.0005, rb + 0.0005, 0.0009, 24, M2, { y }));
    tw.push(cyl(rc, rc, hg, 16, M, { y: y + 0.0009 }));
    tw.push(...roundPanes(8, rc + 0.0002, 0.0016, 0.0042, DARK, 0, y + 0.0015, 0, i * 0.25, true));
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; tw.push(cyl(0.00042, 0.00038, hg - 0.0021, 5, M, { x: Math.sin(a) * (rb - 0.0004), y: y + 0.0009, z: Math.cos(a) * (rb - 0.0004) })); }
    tw.push(cyl(rb, rb, 0.0012, 24, M, { y: y + hg - 0.0012 }));
  }
  const yb = h0 + NG * hg;
  tw.push(drumC(rb + 0.0005, rb + 0.0005, 0.0009, 24, M2, { y: yb }));
  tw.push(cyl(0.0058, 0.0058, 0.0072, 16, M, { y: yb + 0.0009 }));
  tw.push(...roundPanes(6, 0.006, 0.0018, 0.0042, DARK, 0, yb + 0.0018, 0, 0, true));
  tw.push(drumC(0.0062, 0.0062, 0.0008, 16, M2, { y: yb + 0.0081 }));
  tw.push(cyl(rb, rb, 0.0011, 24, shade(M, 0.95), { y: yb + 0.0009 }));
  // (Leaning on a low round plinth, its foot sunk into it on the low side.)
  out.push(drumC(0.0112, 0.0112, 0.0018, 24, shade(M, 0.9)));
  out.push(...leaning(tw, 0.09, 0, 0).map((g) => g.translate(0, rb * Math.sin(0.09) + 0.00002, 0)));
  // (At the scale the six-gallery tower had at 6 cells.)
  return onPad(out, 4.65);
}

export const MEDIEVAL: Models<'hagiaSophia' | 'angkorWat' | 'notreDame' | 'staveChurch' | 'chichenItza' | 'leaningTower'> = {
  hagiaSophia,
  angkorWat,
  notreDame,
  staveChurch,
  chichenItza,
  leaningTower,
};
