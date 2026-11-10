// The Medieval era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z. (Machu Picchu stands on its mountain
// top instead: buildingCatalog.ts, cityProps.ts.)

import * as THREE from 'three';
import { frustum, gable } from '../houseKit.ts';
import {
  H, P, V, archPane, ball, box, cone, cyl, drumC, flat, pane, rod, shade,
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

// A prism: the polygon pts (u, y) extruded d along z, centred on z = 0
// (an arched wall with its opening, a buttress's sloped cap, a lean-to roof).
function prism(pts: readonly (readonly [number, number])[], d: number, c: number, o: Parameters<typeof P>[2] = {}): G {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y))), { depth: d, bevelEnabled: false });
  return P(g.translate(0, 0, -d / 2), c, o);
}
// Points along a round arch of radius r centred at (0, cy), from angle a0 to a1.
const arcPts = (r: number, cy: number, n: number, a0: number, a1: number) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [r * Math.cos(a), cy + r * Math.sin(a)] as const; });
// An arched window facing ry in its stone surround (f wide), the opening
// standing just proud of the surround.
function framedWin(w: number, h: number, x: number, y: number, z: number, ry: number, frame: number, f = 0.0004, glass = 0x3a3330): G[] {
  return [...archPane(w + 2 * f, h + f, frame, x, y - f, z, ry), ...archPane(w, h, glass, x + Math.sin(ry) * 0.0001, y, z + Math.cos(ry) * 0.0001, ry)];
}
// Half a closed drum (a cornice round a half dome's drum), facing +z or -z.
const halfDrumC = (r: number, h: number, c: number, x: number, y: number, z: number, toward: 1 | -1, n = 20) =>
  P(new THREE.CylinderGeometry(r, r, h, n, 1, false, toward > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).translate(0, h / 2, 0), c, { x, y, z });

// Hagia Sophia: the great shallow dome, ribbed in lead, on its ring of forty
// windows between little buttresses, set on the square of its four arches.
// North and south each great arch is a deep niche in the square, its rim
// standing proud, the tympanum wall at its back pierced with rows of
// windows; the massive sloping buttresses stand either side of it. East and
// west the half domes on their half drums, each with two small semidomes
// (the exedrae) below; the galleries' long block under its low lead roofs,
// on a stone base course with its string courses and cornice; the narthex
// before it under a lean-to roof and the exonarthex with its row of little
// domes and bronze doors. The four minarets of its Ottoman years, the two at
// the front (west) of white stone with two balconies each, the two at the
// back of red brick with one.
function hagiaSophia(): G[] {
  const out: G[] = [];
  const PL = 0xd6a07c, PL2 = shade(PL, 0.88), BAND = 0xe8cba6, STONE = 0xd9cdb6, LEAD = 0x8d949a, LEAD2 = shade(LEAD, 0.85);
  const GOLD = 0xd9b04a, WHITE = 0xe8e2d4, BRICK = 0xa4553f, DOOR = 0x6a5030;
  const zc = -0.0025, DS = 0.5; // (DS: the domes' squash, before the lift below)
  const SIDE = [-1, 1] as const;

  // The galleries' block: a stone base course, a string course between its
  // two rows of framed windows, a cornice, the low hipped lead roof.
  out.push(...box(0.074, 0.024, 0.08, PL, { z: zc }, LEAD));
  out.push(...box(0.0748, 0.0022, 0.0808, STONE, { z: zc }));
  out.push(...box(0.0746, 0.0008, 0.0806, BAND, { y: 0.0112, z: zc }));
  out.push(...box(0.0752, 0.0012, 0.0812, STONE, { y: 0.0234, z: zc }, LEAD));
  out.push(...frustum(0.0752, 0.0812, 0.058, 0.064, 0.0018, LEAD, { y: 0.0246, z: zc }, LEAD));
  for (const s of SIDE) for (const [y, h] of [[0.0034, 0.0048], [0.0136, 0.0052]] as const) {
    out.push(...rowOf(12, 0.072, (x, z) => (Math.abs(z - zc) > 0.012 && Math.abs(z - zc) < 0.025 ? [] : framedWin(0.0026, h, x, y, z, s * Math.PI / 2, BAND)), s * 0.0371, zc, s * Math.PI / 2));
  }
  for (const [y, h] of [[0.0034, 0.0048], [0.0136, 0.0052]] as const) out.push(...rowOf(10, 0.068, (x, z) => framedWin(0.0026, h, x, y, z, Math.PI, BAND), 0, zc - 0.0401, Math.PI));

  // The square of the four great arches. North and south (±x) each arch is
  // a niche: the square's core stands back dr, and a wall with the arch cut
  // out of it fills the rest; the tympanum at the back of the niche.
  const SH = 0.046, dr = 0.0032, hw = 0.021, aw = 0.0135, yb = 0.0242, yc = 0.029, xi = hw - dr;
  out.push(...box(2 * xi, SH, 2 * hw, PL, { z: zc }, LEAD));
  out.push(...box(0.0436, 0.0014, 0.0436, STONE, { y: SH - 0.001, z: zc }, LEAD));
  const opening = (r: number) => arcPts(r, yc, 16, Math.PI, 0);
  for (const s of SIDE) {
    const ry = s * Math.PI / 2;
    const d = dr + 0.0002;
    out.push(prism([[-hw, yb], [-aw, yb], ...opening(aw), [aw, yb], [hw, yb], [hw, SH - 0.0004], [-hw, SH - 0.0004]], d, PL, { x: s * (hw - d / 2), z: zc, ry }));
    // The arch's rim: a thick moulding standing proud, its lip over the niche.
    const yr = yb + 0.0004, ri = aw - 0.0003, ro = aw + 0.0016, rd0 = hw - 0.0004, rd1 = hw + 0.0009;
    out.push(prism([[-ro, yr], ...arcPts(ro, yc, 16, Math.PI, 0), [ro, yr], [ri, yr], ...arcPts(ri, yc, 16, 0, Math.PI), [-ri, yr]], rd1 - rd0, BAND, { x: s * (rd0 + rd1) / 2, z: zc, ry }));
    // The tympanum: a shaded wall, two ledges, three rows of windows.
    const tym = new THREE.ShapeGeometry(new THREE.Shape([[-aw, yb] as const, ...opening(aw), [aw, yb] as const].map(([u, y]) => new THREE.Vector2(u, y))));
    out.push(P(tym, PL2, { x: s * (xi + 0.0001), z: zc, ry }));
    for (const y of [0.0322, 0.0377]) {
      const half = Math.sqrt(aw * aw - (y + 0.0004 - yc) ** 2) - 0.0001;
      out.push(...box(0.0006, 0.0004, 2 * half, BAND, { x: s * (xi + 0.00035), y, z: zc }));
    }
    const wx = s * (xi + 0.0002);
    out.push(...rowOf(7, 0.025, (xx, z) => framedWin(0.0022, 0.0034, xx, 0.027, z, ry, STONE, 0.0003), wx, zc, ry));
    out.push(...rowOf(7, 0.021, (xx, z) => framedWin(0.0019, 0.003, xx, 0.033, z, ry, STONE, 0.0003), wx, zc, ry));
    out.push(...rowOf(3, 0.009, (xx, z) => framedWin(0.0017, 0.0018, xx, 0.0386, z, ry, STONE, 0.0003), wx, zc, ry));

    // The buttresses either side of the arch: a tall inner pier and a lower
    // outer one, each capped by a lead slope falling outward; a base course,
    // string courses and small windows on every face.
    for (const t of SIDE) {
      const bz = zc + t * 0.0192, D = 0.0078, Do = D + 0.0004;
      out.push(...box(0.015, 0.036, D, PL, { x: s * 0.028, z: bz }, LEAD));
      out.push(...box(0.0095, 0.026, D, PL, { x: s * 0.04025, z: bz }, LEAD));
      out.push(...box(0.025, 0.0022, Do, STONE, { x: s * 0.03275, z: bz }));
      out.push(...box(0.0249, 0.0008, Do - 0.0001, BAND, { x: s * 0.03275, y: 0.0112, z: bz }));
      out.push(...box(0.0152, 0.0008, Do - 0.0001, BAND, { x: s * 0.0283, y: 0.0318, z: bz }));
      const m = (pts: [number, number][]) => pts.map(([u, y]) => [s * u, y] as const);
      out.push(prism(m([[0.0205, 0.036], [0.0358, 0.036], [0.0358, 0.0368], [0.0205, 0.0405]]), Do, LEAD, { z: bz }));
      out.push(prism(m([[0.0353, 0.026], [0.0453, 0.026], [0.0453, 0.0267], [0.0353, 0.0293]]), Do, LEAD, { z: bz }));
      for (const y of [0.0040, 0.0140]) out.push(...framedWin(0.0022, 0.0042, s * 0.0451, y, bz, ry, BAND, 0.0003));
      out.push(...framedWin(0.002, 0.0032, s * 0.0356, 0.0265, bz, ry, BAND, 0.0003));
      for (const q of SIDE) for (const y of [0.0040, 0.0140]) out.push(...framedWin(0.0022, 0.0042, s * 0.04025, y, bz + q * (D / 2 + 0.0001), q > 0 ? 0 : Math.PI, BAND, 0.0003));
    }
  }
  // The four stair turrets at the square's corners, rising over its cornice.
  for (const s of SIDE) for (const t of SIDE) {
    const x = s * 0.0185, z = zc + t * 0.0185;
    out.push(...box(0.005, 0.0048, 0.005, PL, { x, y: SH - 0.001, z }, LEAD));
    out.push(cone(0.0037, 0.0024, 4, LEAD, { x, y: SH + 0.0038, z, ry: Math.PI / 4 }));
    out.push(...framedWin(0.0012, 0.0014, x + s * 0.0026, SH + 0.0012, z, s * Math.PI / 2, BAND, 0.0002));
  }

  // The dome: its drum of forty framed windows between little sloping
  // buttresses, base ring and cornice; the shallow lead cap with its forty
  // ribs, a crown ring and the gilded crescent.
  const yd = SH - 0.0003, rd = 0.0195, yD = yd + 0.0057;
  out.push(drumC(rd, rd, 0.0055, 40, PL, { y: yd, z: zc }));
  out.push(drumC(rd + 0.0006, rd + 0.0006, 0.0008, 40, STONE, { y: yd + 0.0001, z: zc }));
  out.push(drumC(rd + 0.0012, rd + 0.0012, 0.0007, 40, STONE, { y: yd + 0.0052, z: zc }));
  for (let i = 0; i < 40; i++) {
    const a = ((i + 0.5) / 40) * Math.PI * 2, r = rd * Math.cos(Math.PI / 40) + 0.0001;
    out.push(...framedWin(0.0015, 0.0024, Math.sin(a) * r, yd + 0.0013, zc + Math.cos(a) * r, a, BAND, 0.0002));
    const b = (i / 40) * Math.PI * 2;
    out.push(...frustum(0.0009, 0.0026, 0.0009, 0.0012, 0.005, PL2, { x: Math.sin(b) * (rd + 0.0005), y: yd + 0.0002, z: zc + Math.cos(b) * (rd + 0.0005), ry: b }, PL2));
  }
  const R = 0.0209;
  out.push(P(new THREE.SphereGeometry(R, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), LEAD, { y: yD, z: zc, sy: DS }));
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, pts = [0, 0.35, 0.65, 0.9].map((f) => { const th = f * Math.PI / 2 * 0.9; return V(Math.sin(a) * Math.cos(th) * (R + 0.0001), yD + Math.sin(th) * (R + 0.0001) * DS, zc + Math.cos(a) * Math.cos(th) * (R + 0.0001)); });
    for (let k = 0; k < 3; k++) out.push(rod(pts[k]!, pts[k + 1]!, 0.00022, LEAD2, 3));
  }
  out.push(drumC(0.0026, 0.0022, 0.0006, 12, LEAD2, { y: yD + R * DS - 0.0004, z: zc }));
  out.push(rod(V(0, yD + R * DS, zc), V(0, yd + 0.0217, zc), 0.0003, GOLD, 4), ball(0.0007, GOLD, { y: yd + 0.0192, z: zc }));
  out.push(P(new THREE.TorusGeometry(0.0013, 0.00035, 3, 8, Math.PI * 1.3), GOLD, { y: yd + 0.0232, z: zc, rz: Math.PI * 0.85 }));

  // The half domes east and west on their half drums (five framed windows,
  // a cornice, lead ribs), each with two small semidomes below, windowed too.
  for (const t of SIDE) {
    const z = zc + t * 0.021, base = t > 0 ? 0 : Math.PI;
    out.push(halfDrum(rd, 0.008, PL, 0, 0.024, z, t, 20));
    out.push(halfDrumC(rd + 0.0007, 0.0008, STONE, 0, 0.0316, z, t));
    for (let k = 0; k < 5; k++) { const a = base + (k - 2) * 0.5; out.push(...framedWin(0.002, 0.0028, Math.sin(a) * (rd + 0.0002), 0.0275, z + Math.cos(a) * (rd + 0.0002), a, BAND, 0.0003)); }
    out.push(halfDome(rd, LEAD, 0, 0.032, z, t, DS, 20));
    // The great arch over it, its rim proud of the square's face.
    const ell = (r: number, a0: number, a1: number) => arcPts(r, 0, 16, a0, a1).map(([u, y]) => [u, 0.032 + y * (DS + 0.06)] as const);
    out.push(prism([[-0.0209, 0.0255], ...ell(0.0209, Math.PI, 0), [0.0209, 0.0255], [0.0197, 0.0255], ...ell(0.0197, 0, Math.PI), [-0.0197, 0.0255]], 0.0012, BAND, { z: zc + t * 0.0212 }));
    for (let k = 1; k < 8; k++) {
      const a = base - Math.PI / 2 + (k / 8) * Math.PI, pts = [0, 0.4, 0.8].map((f) => { const th = f * Math.PI / 2 * 0.95; return V(Math.sin(a) * Math.cos(th) * (rd + 0.0001), 0.0324 + Math.sin(th) * (rd + 0.0001) * DS, z + Math.cos(a) * Math.cos(th) * (rd + 0.0001)); });
      for (let j = 0; j < 2; j++) out.push(rod(pts[j]!, pts[j + 1]!, 0.0002, LEAD2, 3));
    }
    for (const s of SIDE) {
      const x = s * 0.0128, zz = zc + t * 0.033;
      out.push(halfDrum(0.0085, 0.0047, PL, x, 0.025, zz, t, 12), halfDrumC(0.0091, 0.0006, STONE, x, 0.0294, zz, t, 12), halfDome(0.0085, LEAD, x, 0.0297, zz, t, DS + 0.05, 12));
      for (let k = 0; k < 3; k++) { const a = base + (k - 1) * 0.75; out.push(...framedWin(0.0014, 0.0016, x + Math.sin(a) * 0.0086, 0.0268, zz + Math.cos(a) * 0.0086, a, BAND, 0.0002)); }
    }
  }

  // The narthex before it under a lean-to lead roof, a row of framed windows
  // over the exonarthex; the exonarthex with its pilasters, bronze doors in
  // framed arches and a row of little lead domes.
  out.push(...box(0.0736, 0.02, 0.012, PL2, { z: 0.037 }, LEAD));
  out.push(...box(0.0744, 0.0022, 0.0124, STONE, { z: 0.037 }));
  out.push(...box(0.0747, 0.001, 0.0126, STONE, { y: 0.0192, z: 0.037 }, LEAD));
  out.push(prism([[-0.0063, 0.0202], [0.006, 0.0202], [0.006, 0.0232], [-0.0063, 0.0212]], 0.0749, LEAD, { z: 0.037, ry: Math.PI / 2 }));
  out.push(...rowOf(9, 0.068, (x, z) => framedWin(0.003, 0.0038, x, 0.0136, z, 0, BAND, 0.0003), 0, 0.0431, 0));
  const ze = 0.0461;
  out.push(...box(0.07, 0.012, 0.006, PL, { z: ze }, LEAD));
  out.push(...box(0.0704, 0.0022, 0.0064, STONE, { z: ze }));
  out.push(...box(0.0706, 0.0008, 0.0066, STONE, { y: 0.0114, z: ze }, LEAD));
  out.push(...rowOf(9, 0.07, (x, z) => [
    ...framedWin(0.0032, 0.0046, x, 0.0004, z, 0, STONE, 0.0004, DOOR),
    drumC(0.0025, 0.0025, 0.0008, 10, PL, { x, y: 0.0118, z: ze }),
    P(new THREE.SphereGeometry(0.0024, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), LEAD, { x, y: 0.0126, z: ze, sy: 0.7 }),
  ], 0, ze + 0.0033, 0));
  for (let i = 0; i <= 9; i++) out.push(...box(0.0012, 0.0114, 0.0004, shade(PL, 0.94), { x: -0.035 + i * (0.07 / 9), z: ze + 0.00325 }));

  // The minarets, two taller at the front (west), close by the corners (so
  // the whole stands nearly square and fills its lot): a stone base, a
  // shaft with its balconies (corbelled out, railed), the lead cone.
  const minaret = (x: number, z: number, h: number, shaft: number, balconies: readonly number[]) => {
    out.push(...box(0.0074, 0.0022, 0.0074, STONE, { x, z }));
    out.push(...box(0.0068, 0.0125, 0.0068, shade(STONE, 1.03), { x, z }));
    out.push(...box(0.0072, 0.0008, 0.0072, STONE, { x, y: 0.0125, z }));
    out.push(...frustum(0.0062, 0.0062, 0.005, 0.005, 0.0028, STONE, { x, y: 0.0133, z }, STONE));
    const y0 = 0.0161, rOf = (y: number) => 0.0027 - 0.0005 * (y - y0) / (h - y0);
    out.push(cyl(0.0027, 0.0022, h - y0, 12, shaft, { x, y: y0, z }));
    out.push(drumC(0.0031, 0.0029, 0.0008, 12, STONE, { x, y: y0, z }));
    for (const f of balconies) {
      const y = y0 + (h - y0) * f;
      out.push(drumC(rOf(y - 0.0014) + 0.0001, 0.0038, 0.0014, 12, shade(shaft, 0.94), { x, y: y - 0.0014, z }));
      out.push(drumC(0.0039, 0.0039, 0.0012, 12, WHITE, { x, y, z }));
      out.push(drumC(0.0040, 0.0040, 0.0002, 12, shade(WHITE, 0.9), { x, y: y + 0.0011, z }));
      out.push(...roundPanes(12, 0.0039 * Math.cos(Math.PI / 12) + 0.0001, 0.0012, 0.0006, shade(WHITE, 0.62), x, y + 0.0003, z, 0.5));
    }
    out.push(drumC(0.0029, 0.0029, 0.0006, 12, STONE, { x, y: h - 0.0006, z }));
    out.push(cone(0.0028, 0.013, 12, LEAD, { x, y: h, z }));
    out.push(rod(V(x, h + 0.0125, z), V(x, h + 0.0165, z), 0.0002, GOLD, 3), ball(0.00045, GOLD, { x, y: h + 0.0142, z }));
  };
  minaret(-0.042, 0.046, 0.076, WHITE, [0.6, 0.8]); minaret(0.042, 0.046, 0.076, WHITE, [0.6, 0.8]);
  minaret(-0.042, -0.042, 0.066, BRICK, [0.78]); minaret(0.042, -0.042, 0.066, BRICK, [0.78]);
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

// A point (u, y) of an outline in a wall's plane.
type NdPt = readonly [number, number];
// A pointed arch from its right springing (w/2, ys) over the apex to its
// left springing (-w/2, ys): two arcs of radius k w meeting at the apex.
function ndArc(w: number, ys: number, k = 0.85, n = 4): NdPt[] {
  const R = k * w, c = w / 2 - R, a1 = Math.acos(-c / R), out: NdPt[] = [];
  for (let i = 0; i <= n; i++) { const a = (a1 * i) / n; out.push([c + R * Math.cos(a), ys + R * Math.sin(a)]); }
  for (let i = 1; i <= n; i++) { const a = Math.PI - a1 + (a1 * i) / n; out.push([-c + R * Math.cos(a), ys + R * Math.sin(a)]); }
  return out;
}
// How far a pointed arch w wide rises over its springing.
const ndRise = (w: number, k = 0.85) => k * w * Math.sin(Math.acos((k * w - w / 2) / (k * w)));
// A pointed opening's outline: its sill at y0, springing at ys.
const ndArch = (w: number, ys: number, y0 = 0, k = 0.85, n = 4): NdPt[] => [[-w / 2, y0], [w / 2, y0], ...ndArc(w, ys, k, n)];
// A pointed band (an archivolt, a hood mould): the outer arch wo wide less
// the inner wi, both springing at ys, standing on yb.
const ndBand = (wo: number, wi: number, ys: number, yb: number, k = 0.85, n = 5): NdPt[] =>
  [[-wo / 2, yb], [-wi / 2, yb], ...ndArc(wi, ys, k, n).reverse(), [wi / 2, yb], [wo / 2, yb], ...ndArc(wo, ys, k, n)];
const ndShift = (pts: readonly NdPt[], dx: number, dy = 0): NdPt[] => pts.map(([u, y]) => [u + dx, y + dy] as const);
const ndRect = (x0: number, y0: number, x1: number, y1: number): NdPt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ndCircle = (r: number, cx: number, cy: number, n: number): NdPt[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)] as const);
// A wall's front from x0 to x1, y1 tall, with pointed doorways cut up
// into it from the ground.
function ndNotched(x0: number, x1: number, y1: number, notches: readonly { x: number; w: number; hs: number }[]): NdPt[] {
  const pts: NdPt[] = [[x0, 0]];
  for (const n of notches) pts.push([n.x - n.w / 2, 0], ...ndShift(ndArc(n.w, n.hs, 0.85, 4).reverse(), n.x), [n.x + n.w / 2, 0]);
  pts.push([x1, 0], [x1, y1], [x0, y1]);
  return pts;
}
const ndShape = (pts: readonly NdPt[], holes: readonly (readonly NdPt[])[] = []) => {
  const s = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([u, y]) => new THREE.Vector2(u, y))));
  return s;
};
// A slab d thick (centred on z = 0) of the outline, pierced by the holes.
const ndSlab = (pts: readonly NdPt[], holes: readonly (readonly NdPt[])[], d: number, c: number, o: Parameters<typeof P>[2] = {}) =>
  P(new THREE.ExtrudeGeometry(ndShape(pts, holes), { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), c, o);
// A flat outline (glass, a shadowed recess) facing +z.
const ndFlat = (pts: readonly NdPt[], c: number, o: Parameters<typeof P>[2] = {}) => P(new THREE.ShapeGeometry(ndShape(pts)), c, o);
// Parts built facing +z about the origin, set at (x, y, z) facing ry.
function ndXf(parts: G[], x: number, y: number, z: number, ry: number): G[] {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(1, 1, 1));
  return parts.map((g) => g.applyMatrix4(m));
}
// A lancet window facing ry, its sill at y: its stone surround, the glass,
// and (tr) its tracery, a mullion and an oculus in the head.
function ndWin(w: number, hs: number, x: number, y: number, z: number, ry: number, frame: number, glass: number, tr = true): G[] {
  const f = Math.min(0.0004, w * 0.14), nx = Math.sin(ry), nz = Math.cos(ry), rise = ndRise(w);
  const at = (k: number, dy = 0) => ({ x: x + nx * k, y: y + dy, z: z + nz * k, ry });
  const out = [ndFlat(ndArch(w + 2 * f, hs, -f), frame, at(0.0001)), ndFlat(ndArch(w, hs), glass, at(0.0002))];
  if (tr) out.push(pane(w * 0.09, hs + rise * 0.3, frame, x + nx * 0.0003, y, z + nz * 0.0003, ry), P(new THREE.RingGeometry(w * 0.12, w * 0.2, 5), frame, at(0.0003, hs + rise * 0.42)));
  return out;
}
// A round window r across, its centre at y, facing ry.
function ndOculus(r: number, x: number, y: number, z: number, ry: number, frame: number, glass: number): G[] {
  const nx = Math.sin(ry), nz = Math.cos(ry);
  return [P(new THREE.CircleGeometry(r * 0.8, 8), glass, { x: x + nx * 0.0001, y, z: z + nz * 0.0001, ry }), P(new THREE.RingGeometry(r * 0.72, r, 8), frame, { x: x + nx * 0.0002, y, z: z + nz * 0.0002, ry })];
}
// A rose window r across at the origin facing +z, on a wall at z = 0: in
// a square stone frame (fh its half width; 0 for none), its glass, the
// moulded rim, two rings of tracery and the spokes between, coloured
// lights, the dark eye.
function ndRose(r: number, fh: number, stone: number, trim: number, glass: number, lights: readonly number[], eye: number): G[] {
  const out: G[] = [];
  if (fh) out.push(ndSlab(ndRect(-fh, -fh, fh, fh), [ndCircle(r, 0, 0, 16)], 0.0012, stone, { z: 0.0006 }));
  out.push(P(new THREE.CircleGeometry(r, 16), glass, { z: 0.0001 }));
  out.push(P(new THREE.RingGeometry(r * 0.88, r * 1.001, 16), trim, { z: 0.0003 }));
  out.push(P(new THREE.RingGeometry(r * 0.56, r * 0.62, 12), trim, { z: 0.0003 }));
  out.push(P(new THREE.RingGeometry(r * 0.25, r * 0.31, 8), trim, { z: 0.0003 }));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, b = a + Math.PI / 24;
    out.push(P(new THREE.PlaneGeometry(r * 0.025, r * 0.28).translate(0, r * 0.75, 0).rotateZ(a), trim, { z: 0.0003 }));
    out.push(P(new THREE.CircleGeometry(r * 0.07, 4), lights[i % lights.length]!, { x: Math.cos(b) * r * 0.76, y: Math.sin(b) * r * 0.76, z: 0.0002 }));
    if (i % 2) continue;
    out.push(P(new THREE.PlaneGeometry(r * 0.03, r * 0.27).translate(0, r * 0.43, 0).rotateZ(a), trim, { z: 0.0003 }));
    const c = a + Math.PI / 12;
    out.push(P(new THREE.CircleGeometry(r * 0.08, 4), lights[(i / 2 + 1) % lights.length]!, { x: Math.cos(c) * r * 0.44, y: Math.sin(c) * r * 0.44, z: 0.0002 }));
  }
  out.push(P(new THREE.CircleGeometry(r * 0.25, 10), eye, { z: 0.0002 }), P(new THREE.CircleGeometry(r * 0.09, 6), lights[3]!, { z: 0.0003 }));
  return out;
}
// A railing len long facing ry, h tall, standing on y: its plinth, the
// balusters and the coping.
function ndRail(len: number, h: number, c: number, x: number, y: number, z: number, ry: number, pitch = 0.0022): G[] {
  const n = Math.max(2, Math.round(len / pitch)), lx = Math.cos(ry), lz = -Math.sin(ry);
  const out = [...box(len, h * 0.2, 0.0006, c, { x, y, z, ry }), ...box(len + 0.0002, h * 0.16, 0.0008, c, { x, y: y + h * 0.84, z, ry })];
  for (let i = 0; i < n; i++) { const t = -len / 2 + ((i + 0.5) * len) / n; out.push(cyl(0.00021, 0.00021, h * 0.64, 3, c, { x: x + lx * t, y: y + h * 0.2, z: z + lz * t })); }
  return out;
}
// A stone (or copper) statue h tall standing on y, facing ry.
const ndStatue = (x: number, y: number, z: number, h: number, c: number, ry = 0): G[] => [
  cyl(h * 0.15, h * 0.09, h * 0.74, 5, c, { x, y, z, ry }),
  P(new THREE.OctahedronGeometry(h * 0.1), shade(c, 1.05), { x, y: y + h * 0.84, z }),
];
// A deep portal at x facing +z: w wide, springing at hs; nb archivolts
// stepping in s each from the face zf back to the wall at zb, alternately
// shaded; the tympanum and the doors at the back (a trumeau with its
// statue between them if `trumeau`).
function ndPortal(w: number, hs: number, s: number, nb: number, x: number, zf: number, zb: number, cs: readonly [number, number], tym: number, door: number, trumeau: boolean): G[] {
  const out: G[] = [], dl = (zf - zb) / (nb + 1);
  for (let k = 0; k < nb; k++) {
    const wo = w - 2 * k * s, wi = w - 2 * (k + 1) * s + 0.00012, d = zf - k * dl - (zb + 0.0001);
    out.push(ndSlab(ndBand(wo, wi, hs, 0, 0.85, 4), [], d, cs[k % 2]!, { x, z: zb + 0.0001 + d / 2 }));
  }
  const wi = w - 2 * nb * s + 0.00012, hd = hs * 0.68;
  out.push(ndFlat(ndArch(wi, hs, 0, 0.85, 4), tym, { x, z: zb + 0.00008 }));
  out.push(pane(wi, hd, door, x, 0, zb + 0.00016), pane(wi, 0.0005, cs[0], x, hd, zb + 0.00016));
  out.push(P(new THREE.CircleGeometry(wi * 0.16, 8), shade(tym, 0.8), { x, y: hd + 0.0005 + (hs + ndRise(wi) - hd) * 0.45, z: zb + 0.00016, sy: 1.5 }));
  if (trumeau) out.push(...box(wi * 0.12, hd, 0.0006, cs[0], { x, z: zb + 0.0003 }), ...ndStatue(x, hd * 0.25, zb + 0.0009, hd * 0.6, cs[0]));
  return out;
}

// Notre-Dame, squeezed along its length to sit on a square lot (its nave
// three bays long), in pale limestone under blue-grey lead. The west front
// spans the whole lot: three deep portals with their stepped archivolts,
// tympana and doors between four buttresses (statues in niches on them);
// the gallery of kings, twenty-eight statues behind an arcade; the Virgin's
// balustrade before the great rose in its square frame, paired lancets
// under relieving arches either side; the open gallery of slender arches,
// its balustrade; the two square towers, each face with its two tall
// belfry lancets under hood moulds, clasping corner buttresses, a
// balustrade and corner pinnacles on the flat top. The nave and choir with
// tall traceried clerestory windows, the galleries' oculi and the chapels'
// windows under lean-to lead roofs; flying buttresses (true arched struts)
// leaping from stepped pinnacled piers down both sides and radiating round
// the polygonal chevet; balustrades along the eaves; the steep lead roof
// with its seams and crested ridge. The transept ends with their porches
// under gablets, triforia, roses and pierced gables, flanked by pinnacled
// turrets. Viollet-le-Duc's spire: two traceried, gabled, pinnacled tiers
// and the crocketed needle, its cross and rooster; the copper apostles
// stepping down the roof valleys at its foot.
function notreDame(): G[] {
  const out: G[] = [];
  const ST = 0xe4dac4, ST2 = shade(ST, 0.9), TRIM = 0xf1eadb, DEEP = shade(ST, 0.62);
  const LEAD = 0x7d8a98, LEAD2 = shade(LEAD, 0.8), GLASS = 0x2b3956, DOOR = 0x4a3a2c, DARK = 0x222128;
  const COPPER = 0x6fa68e, GOLD = 0xd9b04a, LIGHTS = [0x9a2a3a, 0x4e3a8a, 0x2f5fa0, 0xb07a30] as const;
  const SIDE = [-1, 1] as const, Q = Math.PI / 2, CF = Math.cos(Math.PI / 12);
  // The body: the nave wall, the inner aisle (the galleries) and the outer
  // (the chapels) at r1, r2, r3 from the axis; their heights.
  const r1 = 0.012, r2 = 0.023, r3 = 0.0295, hN = 0.036, hI = 0.023, hO = 0.016, rH = 0.017;
  const zf = 0.03, zb = -0.023, zm = (zf + zb) / 2, L = zf - zb;
  const zt = -0.0025, dt = 0.017, xt = 0.0375;
  const bays = [0.0089, 0.0148, 0.0207, 0.0266, -0.02, -0.014], piers = [0.0118, 0.0177, 0.0236, -0.017];

  // ----- the nave, its aisles and roofs -----
  out.push(...box(2 * r1, hN, L, ST, { z: zm }));
  out.push(...gable(2 * r1, L, rH, LEAD, { y: hN, z: zm }, true, ST));
  out.push(...box(2 * r1 + 0.0016, 0.0008, L + 0.0004, TRIM, { y: hN - 0.0009, z: zm }));
  for (const s of SIDE) {
    const m = (pts: readonly NdPt[]) => pts.map(([u, y]) => [s * u, y] as const);
    out.push(...box(r2 - r1, hI - 0.0012, L, ST, { x: (s * (r1 + r2)) / 2, z: zm }));
    out.push(...box(r3 - r2, hO - 0.0012, L, ST, { x: (s * (r2 + r3)) / 2, z: zm }));
    out.push(prism(m([[r1 - 0.0002, hI + 0.0035], [r1 - 0.0002, hI - 0.0014], [r2 + 0.0006, hI - 0.0016], [r2 + 0.0006, hI - 0.0002]]), L + 0.0008, LEAD, { z: zm }));
    out.push(prism(m([[r2 - 0.0002, hO + 0.0028], [r2 - 0.0002, hO - 0.0014], [r3 + 0.0006, hO - 0.0016], [r3 + 0.0006, hO - 0.0002]]), L + 0.0008, LEAD, { z: zm }));
    out.push(...box(0.0008, 0.0018, L + 0.0012, ST2, { x: s * (r3 + 0.0001), z: zm }));
    out.push(...box(0.0008, 0.0007, L + 0.0016, TRIM, { x: s * (r3 + 0.0001), y: hO - 0.0028, z: zm }));
    // Each bay: a traceried clerestory window, a gallery oculus, a chapel window.
    for (const z of bays) {
      out.push(...ndWin(0.0028, 0.0048, s * r1, 0.0268, z, s * Q, TRIM, GLASS));
      out.push(...ndOculus(0.0009, s * r2, 0.0201, z, s * Q, TRIM, GLASS));
      out.push(...ndWin(0.003, 0.0074, s * r3, 0.0028, z, s * Q, TRIM, GLASS, false));
    }
    // Pilasters on the clerestory wall where the flyers land.
    for (const z of piers) out.push(...box(0.0008, hN - 0.0009 - hI, 0.0016, ST, { x: s * (r1 + 0.00025), y: hI, z }));
    // The balustrades along the nave's eaves (west of the crossing and the choir).
    for (const [z0, z1] of [[zt + dt / 2 + 0.0004, zf], [zb, zt - dt / 2 - 0.0004]] as const) out.push(...ndRail(z1 - z0, 0.0016, TRIM, s * (r1 + 0.0005), hN - 0.0001, (z0 + z1) / 2, Q));
  }

  // ----- the flying buttresses -----
  // Built along +x from the axis (u out from it): the stepped pier against
  // the chapels with its set-off, cornice and pinnacle; the flyer, its
  // underside a quarter arch from the pier up to the clerestory wall, its
  // back a straight coping.
  const hP = 0.0285, yF = 0.0215, Ry = 0.0085, tF = 0.0024, uP = r3 + 0.0017, Lf = uP - r1, uc = r3 + 0.0039;
  const buttress = (): G[] => {
    const pts: NdPt[] = [[r1, yF + Ry + tF], [uP + 0.0002, yF + 0.55 * Ry + 0.5 * tF], [uP + 0.0002, yF]];
    for (let i = 1; i <= 8; i++) { const a = (i / 8) * Q; pts.push([r1 + Lf * Math.cos(a), yF + Ry * Math.sin(a)]); }
    return [
      ...box(0.00635, 0.012, 0.0026, ST, { x: r3 + 0.002925 }),
      ...box(0.0044, hP - 0.012, 0.0022, ST, { x: uc, y: 0.012 }),
      prism([[r3 - 0.0003, 0.0121], [uP + 0.0002, 0.0121], [uP + 0.0002, 0.0148]], 0.0026, TRIM),
      ...box(0.0024, 0.0034, 0.0018, ST, { x: uc, y: hP }),
      cone(0.0019, 0.0068, 4, TRIM, { x: uc, y: hP + 0.0034, ry: Math.PI / 4 }),
      prism(pts, 0.0011, ST),
      rod(V(r1 + 0.0007, yF + Ry + tF + 0.00005, 0), V(uP, yF + 0.55 * Ry + 0.5 * tF + 0.0001, 0), 0.0003, TRIM, 3),
    ];
  };
  for (const z of piers) for (const s of SIDE) out.push(...ndXf(buttress(), 0, 0, z, s > 0 ? 0 : Math.PI));

  // ----- the chevet -----
  // Polygonal (six sides over the half turn), built round (0, zb) and then
  // flattened a little along z: the walls, the half-pyramid roof and the
  // lean-to roofs of the ambulatory and chapels, cornices, the windows of
  // each side, the radiating buttresses at the corners, the balustrade.
  const AZ = 0.8, ap: G[] = [];
  const half = (rt: number, rb: number, h: number, c: number, y: number, open: boolean, n = 6) =>
    P(new THREE.CylinderGeometry(rt, rb, h, n, 1, open, Q, Math.PI).translate(0, h / 2, 0), c, { y, z: zb });
  ap.push(half(r1, r1, hN, ST, 0, true), half(r2, r2, hI - 0.0012, ST, 0, true), half(r3, r3, hO - 0.0012, ST, 0, true));
  ap.push(halfCone(r1, rH, LEAD, 0, hN, zb, -1, 6));
  ap.push(half(r1 - 0.0002, r2 + 0.0006, 0.0037, LEAD, hI - 0.0002, true), half(r2 - 0.0002, r3 + 0.0006, 0.003, LEAD, hO - 0.0002, true));
  ap.push(half(r1 + 0.0008, r1 + 0.0008, 0.0008, TRIM, hN - 0.0009, false), half(r3 + 0.0005, r3 + 0.0005, 0.0018, ST2, 0, false), half(r3 + 0.0005, r3 + 0.0005, 0.0007, TRIM, hO - 0.0028, false));
  for (let k = 0; k <= 6; k++) {
    const t = (k * Math.PI) / 6;
    ap.push(...ndXf(buttress(), 0, 0, zb, t));
    if (k > 0 && k < 6) ap.push(rod(V(Math.cos(t) * r1, hN + 0.0001, zb - Math.sin(t) * r1), V(0, hN + rH + 0.0001, zb), 0.0002, LEAD2, 3));
    if (k === 6) break;
    const tm = t + Math.PI / 12;
    ap.push(...ndXf([
      ...ndWin(0.0026, 0.0048, r1 * CF, 0.0268, 0, Q, TRIM, GLASS),
      ...ndOculus(0.0009, r2 * CF, 0.0201, 0, Q, TRIM, GLASS),
      ...ndWin(0.003, 0.0074, r3 * CF, 0.0028, 0, Q, TRIM, GLASS, false),
      ...ndRail(2 * r1 * Math.sin(Math.PI / 12), 0.0016, TRIM, r1 * CF + 0.0005, hN - 0.0001, 0, Q, 0.002),
    ], 0, 0, zb, tm));
  }
  const squash = new THREE.Matrix4().makeTranslation(0, 0, zb).multiply(new THREE.Matrix4().makeScale(1, 1, AZ)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -zb));
  out.push(...ap.map((g) => g.applyMatrix4(squash)));

  // ----- the transept -----
  out.push(...box(2 * xt, hN, dt, ST, { z: zt }));
  out.push(...gable(2 * xt, dt, rH, LEAD, { y: hN, z: zt }, false, ST));
  out.push(...box(2 * xt - 0.0004, 0.0008, dt + 0.0016, TRIM, { y: hN - 0.0009, z: zt }));
  for (const s of SIDE) for (const q of SIDE) {
    const z = zt + (q * dt) / 2, ry = q > 0 ? 0 : Math.PI;
    for (const x of [0.0158, 0.0207]) out.push(...ndWin(0.0026, 0.0048, s * x, 0.0268, z, ry, TRIM, GLASS));
    out.push(...ndWin(0.003, 0.017, s * 0.0322, 0.004, z, ry, TRIM, GLASS));
  }
  // Each end (built facing +z, its wall at z = 0): the porch with its
  // archivolts under a crocketed gablet between two pinnacles; a string
  // course and the glazed triforium; the rose in its square frame; the
  // pierced gable over the roof's end with its cross; the corner turrets.
  const W = dt / 2;
  const transeptEnd = (): G[] => {
    const p: G[] = [];
    const pw = 0.0066, phs = 0.0056, PH = 0.0114, PW = 0.0108;
    p.push(...box(dt - 0.0004, 0.0018, 0.0006, ST2, { z: 0.0002 }));
    p.push(ndSlab(ndNotched(-PW / 2, PW / 2, PH, [{ x: 0, w: pw + 0.00012, hs: phs }]), [], 0.003, ST, { z: 0.0015 }));
    p.push(...ndPortal(pw, phs, 0.0005, 3, 0, 0.0028, 0, [TRIM, ST2], ST2, DOOR, false));
    const gx = PW / 2 + 0.0003, gh = 0.0064;
    p.push(prism([[-gx, PH], [gx, PH], [0, PH + gh]], 0.003, ST, { z: 0.0015 }));
    p.push(P(new THREE.CircleGeometry(0.0013, 8), DEEP, { y: PH + 0.0024, z: 0.0031 }));
    for (let i = 1; i <= 4; i++) for (const a of SIDE) { const f = i / 5; p.push(cone(0.00028, 0.0008, 3, TRIM, { x: a * gx * (1 - f), y: PH + gh * f, z: 0.0015 })); }
    p.push(cone(0.0006, 0.0018, 4, TRIM, { y: PH + gh - 0.0002, z: 0.0015 }));
    for (const a of SIDE) p.push(...box(0.0012, PH + 0.0022, 0.0012, ST, { x: a * (PW / 2 + 0.0009), z: 0.0012 }), cone(0.0009, 0.0042, 4, TRIM, { x: a * (PW / 2 + 0.0009), y: PH + 0.0022, z: 0.0012, ry: Math.PI / 4 }));
    p.push(...box(dt - 0.0006, 0.0006, 0.0008, TRIM, { y: 0.0158, z: 0.0003 }));
    for (let i = 0; i < 6; i++) p.push(...ndWin(0.0016, 0.0017, -0.0068 + ((i + 0.5) * 0.0136) / 6, 0.0166, 0, 0, TRIM, GLASS, false));
    p.push(...ndXf(ndRose(0.0061, 0.0072, ST, TRIM, GLASS, LIGHTS, DARK), 0, 0.0272, 0, 0));
    p.push(...box(dt - 0.0004, 0.0008, 0.0012, TRIM, { y: hN - 0.0009, z: 0.0004 }));
    const top = hN + rH + 0.0015, oc = hN + 0.0066;
    p.push(ndSlab([[-W + 0.0002, hN], [W - 0.0002, hN], [0, top]], [ndCircle(0.0021, 0, oc, 10), ...SIDE.map((a) => ndShift(ndArch(0.0012, hN + 0.0028, hN + 0.0012, 0.85, 3), a * 0.0034))], 0.0008, ST, { z: 0.0007 }));
    p.push(P(new THREE.CircleGeometry(0.0021, 10), DEEP, { y: oc, z: 0.00012 }));
    for (const a of SIDE) p.push(ndFlat(ndShift(ndArch(0.0012, hN + 0.0028, hN + 0.0012, 0.85, 3), a * 0.0034), DEEP, { z: 0.00012 }));
    for (let i = 1; i <= 5; i++) for (const a of SIDE) { const f = i / 6; p.push(cone(0.0003, 0.0009, 3, TRIM, { x: a * (W - 0.0002) * (1 - f), y: hN + (top - hN) * f, z: 0.0007 })); }
    p.push(rod(V(0, top - 0.0004, 0.0007), V(0, top + 0.0034, 0.0007), 0.00022, TRIM, 3), rod(V(-0.001, top + 0.0022, 0.0007), V(0.001, top + 0.0022, 0.0007), 0.0002, TRIM, 3));
    for (const a of SIDE) {
      const x = a * (W + 0.001), z = -0.0012, rt = 0.002, ht = hN + 0.004;
      p.push(cyl(rt, rt, ht, 8, ST, { x, z, ry: Math.PI / 8 }));
      for (const y of [0.0158, hN - 0.0009, ht - 0.0006]) p.push(cyl(rt + 0.0003, rt + 0.0003, 0.0006, 8, TRIM, { x, y, z, ry: Math.PI / 8 }));
      for (const y of [0.006, 0.021, 0.029]) for (const th of [0, a * Q]) p.push(pane(0.0006, 0.0022, DARK, x + Math.sin(th) * (rt * Math.cos(Math.PI / 8) + 0.0001), y, z + Math.cos(th) * (rt * Math.cos(Math.PI / 8) + 0.0001), th));
      p.push(cone(rt + 0.0002, 0.0092, 8, TRIM, { x, y: ht, z, ry: Math.PI / 8 }));
      for (let j = 0; j < 8; j++) for (const f of [0.45]) {
        const th = Math.PI / 8 + (j * Math.PI) / 4, r = (rt + 0.0002) * (1 - f) + 0.0001;
        p.push(cone(0.00022, 0.0007, 3, TRIM, { x: x + Math.sin(th) * r, y: ht + 0.0092 * f, z: z + Math.cos(th) * r }));
      }
    }
    return p;
  };
  for (const s of SIDE) out.push(...ndXf(transeptEnd(), s * xt, 0, zt, s * Q));

  // ----- the west front -----
  const fw = 0.074, fz = 0.0475, zbk = zf - 0.0005, yK = 0.0172, yG = 0.0405, yT = 0.0515, PD = 0.0042;
  const portals = [{ x: -0.0235, w: 0.0088, hs: 0.0072, s: 0.0005 }, { x: 0, w: 0.0108, hs: 0.0074, s: 0.0006 }, { x: 0.0235, w: 0.0088, hs: 0.0072, s: 0.0005 }] as const;
  out.push(ndSlab(ndNotched(-fw / 2, fw / 2, yK, portals.map((p) => ({ x: p.x, w: p.w + 0.00012, hs: p.hs }))), [], PD, ST, { z: fz - PD / 2 }));
  out.push(...box(fw, yK, fz - PD - zbk, ST, { z: (fz - PD + zbk) / 2 }));
  for (const p of portals) out.push(...ndPortal(p.w, p.hs, p.s, p.x === 0 ? 4 : 3, p.x, fz - 0.0002, fz - PD, [TRIM, ST2], ST2, DOOR, p.x === 0));
  out.push(...box(fw, yG - yK, fz - zbk, ST, { y: yK, z: (fz + zbk) / 2 }));
  // The four buttresses, a statue in a niche on each.
  for (const bx of [-0.0352, -0.0125, 0.0125, 0.0352]) {
    out.push(...box(0.0036, yK, 0.003, ST, { x: bx, z: fz + 0.0013 }));
    out.push(...box(0.0036, yG - yK, 0.002, ST, { x: bx, y: yK, z: fz + 0.0008 }));
    out.push(ndFlat(ndArch(0.0022, 0.0098, 0.0072), DEEP, { x: bx, z: fz + 0.0029 }));
    out.push(...ndStatue(bx, 0.0074, fz + 0.0034, 0.0046, shade(ST, 0.92)));
  }
  // The gallery of kings: an arcade before twenty-eight statues, between
  // two cornices; the Virgin's balustrade over it, her statue and two
  // angels before the rose, Adam and Eve to the sides.
  out.push(...box(fw + 0.0008, 0.0008, 0.0044, TRIM, { y: yK, z: fz + 0.0018 }));
  out.push(...box(fw, 0.0222 - yK - 0.0008, 0.0022, ST, { y: yK + 0.0008, z: fz + 0.0009 }));
  const kx = (i: number) => -fw / 2 + ((i + 0.5) * fw) / 28;
  for (let i = 0; i < 28; i++) {
    out.push(ndFlat(ndArch(0.0019, yK + 0.003, yK + 0.0009, 0.85, 3), DEEP, { x: kx(i), z: fz + 0.0021 }));
    out.push(...ndStatue(kx(i), yK + 0.0008, fz + 0.0028, 0.0033, shade(ST, 0.86)));
  }
  for (let i = 0; i <= 28; i++) out.push(rod(V(-fw / 2 + (i * fw) / 28, yK + 0.0008, fz + 0.0033), V(-fw / 2 + (i * fw) / 28, 0.0222, fz + 0.0033), 0.00022, TRIM, 3));
  out.push(...box(fw + 0.0004, 0.0007, 0.0004, TRIM, { y: 0.0214, z: fz + 0.0034 }));
  out.push(...box(fw + 0.0008, 0.0008, 0.0044, TRIM, { y: 0.0222, z: fz + 0.0018 }));
  out.push(...ndRail(fw + 0.0008, 0.0018, TRIM, 0, 0.023, fz + 0.0034, 0));
  for (const [x, h] of [[0, 0.0044], [-0.0042, 0.0036], [0.0042, 0.0036], [-0.0235, 0.0038], [0.0235, 0.0038]] as const) out.push(...ndStatue(x, 0.023, fz + 0.0022, h, shade(ST, 0.92)));
  // The rose in its square frame; the paired lancets either side under
  // their relieving arch, an oculus between their heads.
  out.push(...ndXf(ndRose(0.0081, 0.0091, ST, TRIM, GLASS, LIGHTS, DARK), 0, 0.0313, fz, 0));
  for (const sx of [-0.0235, 0.0235]) {
    out.push(ndFlat(ndArch(0.0112, 0.0322, 0.0248, 0.65, 5), ST2, { x: sx, z: fz + 0.00008 }));
    for (const a of SIDE) out.push(...ndWin(0.0034, 0.0072, sx + a * 0.0026, 0.025, fz + 0.0001, 0, TRIM, GLASS));
    out.push(...ndOculus(0.0013, sx, 0.0367, fz + 0.0001, 0, TRIM, GLASS));
    out.push(ndSlab(ndBand(0.0124, 0.0112, 0.0322, 0.0248, 0.65), [], 0.0006, TRIM, { x: sx, z: fz + 0.0003 }));
  }
  for (const s of SIDE) out.push(...ndWin(0.003, 0.009, (s * fw) / 2, 0.025, fz - 0.009, s * Q, TRIM, GLASS));
  // The open gallery: slender pointed arches before a shadowed wall, a
  // cornice under and over it, the balustrade on top.
  out.push(...box(fw + 0.0008, 0.0008, 0.0058, TRIM, { y: yG, z: fz - 0.0007 }));
  out.push(...box(fw, yT - yG, fz - 0.0035 - zbk, ST, { y: yG, z: (fz - 0.0035 + zbk) / 2 }));
  out.push(pane(fw, yT - yG - 0.0008, DEEP, 0, yG + 0.0008, fz - 0.0034));
  const gal: NdPt[][] = [];
  for (const [x0, x1, n] of [[-0.0334, -0.0143, 7], [-0.0107, 0.0107, 8], [0.0143, 0.0334, 7]] as const) {
    for (let i = 0; i < n; i++) gal.push(ndShift(ndArch(0.0017, yG + 0.0074, yG + 0.0016, 0.85, 2), x0 + ((i + 0.5) * (x1 - x0)) / n));
  }
  out.push(ndSlab(ndRect(-fw / 2, yG + 0.0004, fw / 2, yT), gal, 0.0008, ST, { z: fz - 0.0005 }));
  out.push(...box(fw + 0.0008, 0.0008, 0.0024, TRIM, { y: yT, z: fz - 0.0007 }));
  out.push(...ndRail(fw, 0.0018, TRIM, 0, yT + 0.0008, fz - 0.0002, 0));
  // The towers: four walls pierced by the belfry lancets round a dark
  // core, hood moulds and colonnettes, a string course, the clasping
  // buttresses with their set-offs; the cornice, balustrade and pinnacles.
  const tw = 0.0238, td = 0.0164, hT = 0.0285, tT = 0.0018, tzc = fz - 0.0012 - td / 2, yb0 = yT + 0.0034, ysB = yT + 0.0206;
  const face = (len: number, wall: number, hw: number, hx: number): G[] => {
    const p: G[] = [ndSlab(ndRect(-wall / 2, yT, wall / 2, yT + hT), SIDE.map((a) => ndShift(ndArch(hw, ysB, yb0, 0.85, 3), a * hx)), tT, ST, { z: -tT / 2 })];
    p.push(...box(len - 0.0002, 0.0005, 0.0006, TRIM, { y: yT + 0.0024, z: 0.0001 }));
    for (const a of SIDE) {
      p.push(ndFlat(ndBand(hw + 0.0018, hw + 0.0002, ysB, ysB - 0.0014, 0.85, 4), shade(ST, 0.8), { x: a * hx, z: 0.00012 }));
    }
    return p;
  };
  for (const s of SIDE) {
    const xc = s * 0.0245;
    for (const q of SIDE) {
      out.push(...ndXf(face(tw, tw, 0.0044, 0.0041), xc, 0, tzc + (q * td) / 2, q > 0 ? 0 : Math.PI));
      out.push(...ndXf(face(td, td - 2 * tT, 0.0034, 0.003), xc + (q * tw) / 2, 0, tzc, q * Q));
    }
    out.push(...box(tw - 2 * tT - 0.0002, hT - 0.0004, td - 2 * tT - 0.0002, DARK, { x: xc, y: yT, z: tzc }, LEAD));
    for (const a of SIDE) for (const b of SIDE) {
      const x = xc + a * (tw / 2 - 0.0006), z = tzc + b * (td / 2 - 0.0006);
      out.push(...box(0.0028, 0.021, 0.0028, ST, { x, y: yT, z }));
      out.push(...frustum(0.0028, 0.0028, 0.0012, 0.0012, 0.0024, TRIM, { x, y: yT + 0.021, z }, TRIM));
      out.push(cone(0.0009, 0.0048, 4, ST, { x: xc + a * (tw / 2 - 0.0005), y: yT + hT, z: tzc + b * (td / 2 - 0.0005), ry: Math.PI / 4 }));
    }
    out.push(...box(tw + 0.0012, 0.0008, td + 0.0012, TRIM, { x: xc, y: yT + hT - 0.0015, z: tzc }));
    for (const q of SIDE) {
      out.push(...ndRail(tw - 0.0008, 0.0016, ST, xc, yT + hT, tzc + q * (td / 2 - 0.0003), 0, 0.0034));
      out.push(...ndRail(td - 0.0008, 0.0016, ST, xc + q * (tw / 2 - 0.0003), yT + hT, tzc, Q, 0.0034));
    }
  }

  // ----- the roofs' seams and crests -----
  const nOff = 0.00012, hyN = Math.hypot(rH, r1), hyT = Math.hypot(rH, dt / 2);
  for (let z = zb + 0.0016; z < zf - 0.0005; z += 0.0034) {
    if (Math.abs(z - zt) < dt / 2 + 0.0006) continue;
    for (const s of SIDE) {
      const nx = (s * rH * nOff) / hyN, ny = (r1 * nOff) / hyN;
      out.push(rod(V(s * r1 + nx, hN + ny, z), V(nx, hN + rH + ny - 0.0002, z), 0.00011, LEAD2, 3));
    }
  }
  for (let x = r1 + 0.0016; x < xt - 0.0005; x += 0.0034) for (const s of SIDE) for (const q of SIDE) {
    const nz = (q * rH * nOff) / hyT, ny = ((dt / 2) * nOff) / hyT;
    out.push(rod(V(s * x, hN + ny, zt + (q * dt) / 2 + nz), V(s * x, hN + rH + ny - 0.0002, zt + nz), 0.00011, LEAD2, 3));
  }
  out.push(rod(V(0, hN + rH, zb + 0.0003), V(0, hN + rH, zf - 0.0003), 0.0003, LEAD2, 4), rod(V(-xt + 0.0003, hN + rH, zt), V(xt - 0.0003, hN + rH, zt), 0.0003, LEAD2, 4));
  for (let z = zb + 0.0012; z < zf; z += 0.0024) if (Math.abs(z - zt) > 0.0062) out.push(cone(0.00035, 0.0011, 3, LEAD2, { y: hN + rH, z }));
  for (let x = 0.0062; x < xt - 0.0008; x += 0.0024) for (const s of SIDE) out.push(cone(0.00035, 0.0011, 3, LEAD2, { x: s * x, y: hN + rH, z: zt }));

  // ----- the spire -----
  // Its octagonal base out of the crossing; two tiers, each a ring of
  // lancets under gablets with pinnacles at the corners and a cornice; the
  // needle with its crockets and bands; the gilt cross and rooster.
  const sp: G[] = [], yS = hN + rH * 0.6, R8 = Math.PI / 8, c8 = Math.cos(R8);
  sp.push(drumC(0.0049, 0.0049, 0.0066, 8, LEAD, { y: yS, ry: R8 }));
  const tier = (y: number, R: number, h: number, wl: number, hs: number, gh: number, ph: number) => {
    sp.push(cyl(R, R, h, 8, LEAD, { y, ry: R8 }));
    const fwid = 2 * R * Math.sin(R8);
    for (let i = 0; i < 8; i++) {
      const th = (i * Math.PI) / 4, ri = R * c8, tv = th + R8;
      sp.push(ndFlat(ndArch(wl, hs, 0, 0.85, 3), DARK, { x: Math.sin(th) * (ri + 0.0001), y: y + 0.0008, z: Math.cos(th) * (ri + 0.0001), ry: th }));
      sp.push(ndFlat([[-fwid * 0.48, 0], [fwid * 0.48, 0], [0, gh]], LEAD2, { x: Math.sin(th) * (ri + 0.0002), y: y + h - 0.0012, z: Math.cos(th) * (ri + 0.0002), ry: th }));
      sp.push(rod(V(Math.sin(tv) * (R + 0.0002), y, Math.cos(tv) * (R + 0.0002)), V(Math.sin(tv) * (R + 0.0002), y + h * 0.55, Math.cos(tv) * (R + 0.0002)), 0.0003, LEAD, 3));
      sp.push(cone(0.00045, ph, 4, LEAD, { x: Math.sin(tv) * (R + 0.0002), y: y + h * 0.55, z: Math.cos(tv) * (R + 0.0002) }));
    }
    sp.push(drumC(R + 0.0003, R + 0.0003, 0.0005, 8, LEAD2, { y: y + h, ry: R8 }));
  };
  const y1 = yS + 0.0066, y2 = y1 + 0.0095 + 0.0005, y3 = y2 + 0.0072 + 0.0005, NH = 0.04, NR = 0.0028;
  tier(y1, 0.0042, 0.0095, 0.0016, 0.0062, 0.0032, 0.0068);
  tier(y2, 0.0031, 0.0072, 0.0012, 0.0045, 0.0024, 0.0052);
  sp.push(cone(NR, NH, 8, LEAD, { y: y3, ry: R8 }));
  for (let j = 0; j < 8; j++) for (let f = 0.12; f < 0.86; f += 0.1) {
    const tv = R8 + (j * Math.PI) / 4, r = NR * (1 - f) + 0.00012;
    sp.push(cone(0.0003, 0.0008, 3, LEAD2, { x: Math.sin(tv) * r, y: y3 + NH * f, z: Math.cos(tv) * r }));
  }
  for (const f of [0.33, 0.62]) sp.push(drumC(NR * (1 - f) + 0.0002, NR * (1 - f - 0.012) + 0.0002, 0.0005, 8, LEAD2, { y: y3 + NH * f, ry: R8 }));
  const yA = y3 + NH;
  sp.push(rod(V(0, yA - 0.0006, 0), V(0, yA + 0.0046, 0), 0.00018, GOLD, 3), ball(0.0005, GOLD, { y: yA + 0.0008 }));
  sp.push(rod(V(-0.0011, yA + 0.0032, 0), V(0.0011, yA + 0.0032, 0), 0.00016, GOLD, 3), ball(0.00042, GOLD, { y: yA + 0.0049, sx: 1.4 }));
  out.push(...sp.map((g) => g.translate(0, 0, zt)));
  // The apostles (and the evangelists' beasts, last) stepping down the
  // four roof valleys at its foot, in copper gone green, on their plinths.
  for (const a of SIDE) for (const b of SIDE) for (let i = 0; i < 4; i++) {
    const f = 0.44 + 0.13 * i, x = a * r1 * f, z = zt + (b * dt * f) / 2, y = hN + rH * (1 - f), ry = Math.atan2(a, b);
    out.push(...box(0.0013, 0.003, 0.0013, shade(COPPER, 0.78), { x, y: y - 0.0018, z, ry }));
    if (i === 3) out.push(P(new THREE.OctahedronGeometry(0.0009), COPPER, { x, y: y + 0.0021, z, sx: 1.3 }));
    else out.push(...ndStatue(x, y + 0.0012, z, 0.0036, COPPER, ry));
  }
  return onPad(out, 6);
}

// ---------- Borgund ----------

// Tarred timber: the walls, their dark joints, the shingles, the weathered
// (lighter) boards, the carving, the gallery's shade, iron.
const SC = { WOOD: 0x5e3e29, LINE: 0x2b1d14, SH: 0x3e2e24, TRIM: 0x8a6c50, CARVE: 0xa88a66, DARK: 0x1c140e, IRON: 0x2a2826 } as const;
// A small seeded random (shades of planks and shingles).
const scRand = (seed: number) => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
// Parts built facing +z about the origin, turned to face ry and moved to (x, y, z).
function scAt(parts: G[], x: number, y: number, z: number, ry = 0): G[] {
  const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));
  return parts.map((g) => g.applyMatrix4(m));
}
const scGeo = (p: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g; };

// A dragon's head on a long neck curling up and out from a gable's apex at
// (x, y, z), toward s (±z): the neck tapering, a crest of spikes down its
// back, the head with its gaping jaws, a curled tongue, pale eyes.
function dragon(x: number, y: number, z: number, s: number, l: number, c: number): G[] {
  const p = (u: number, v: number) => V(x, y + v * l, z + s * u * l);
  const neck = [p(0, 0), p(0.22, 0.12), p(0.38, 0.34), p(0.45, 0.58), p(0.52, 0.78), p(0.7, 0.9)];
  const out: G[] = [];
  for (let i = 0; i < neck.length - 1; i++) out.push(rod(neck[i]!, neck[i + 1]!, l * (0.075 - i * 0.008), c, 5, l * (0.075 - (i + 1) * 0.008)));
  for (let i = 1; i < neck.length - 1; i++) { const q = neck[i]!; out.push(cone(l * 0.03, l * 0.11, 3, c, { x, y: q.y + l * 0.02, z: q.z - s * l * 0.05, rx: -s * 0.7 })); }
  const hy = y + 0.9 * l, hz = z + s * 0.78 * l;
  out.push(ball(l * 0.085, c, { x, y: hy, z: hz, sz: 1.5, sy: 0.9 }));
  out.push(cone(l * 0.06, l * 0.3, 5, c, { x, y: hy + l * 0.015, z: hz + s * l * 0.05, rx: s * (Math.PI / 2 - 0.2) }));
  out.push(cone(l * 0.045, l * 0.24, 5, c, { x, y: hy - l * 0.04, z: hz + s * l * 0.04, rx: s * (Math.PI / 2 + 0.45) }));
  out.push(rod(V(x, hy - l * 0.02, hz + s * l * 0.12), V(x, hy + l * 0.07, hz + s * l * 0.33), l * 0.012, 0x8a3a28, 3));
  for (const e of [-1, 1]) {
    out.push(ball(l * 0.022, SC.CARVE, { x: x + e * l * 0.06, y: hy + l * 0.035, z: hz + s * l * 0.03 }));
    out.push(cone(l * 0.025, l * 0.14, 3, c, { x: x + e * l * 0.04, y: hy + l * 0.05, z: hz - s * l * 0.06, rx: -s * 0.9 }));
  }
  return out;
}

// Shingles: each face (eaves a0, a1; top b0, b1, equal for a triangle)
// covered in rows of blunt-pointed tongues of rowH, about tw wide, every
// other row staggered, their shades varying; the roof itself darker
// between them, outlining each.
type SCFace = readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
function shingled(faces: readonly SCFace[], rowH: number, tw: number, c: number, seed = 1): G[] {
  const r = scRand(seed), base: number[] = [], tiles: number[][] = [[], [], []];
  const push = (arr: number[], ...ps: THREE.Vector3[]) => { for (const q of ps) arr.push(q.x, q.y, q.z); };
  for (const [a0, a1, b0, b1] of faces) {
    push(base, a0, a1, b1);
    if (!b0.equals(b1)) push(base, a0, b1, b0);
    const n = a1.clone().sub(a0).cross(b0.clone().add(b1).multiplyScalar(0.5).sub(a0)).normalize();
    if (n.y < 0) n.negate();
    n.multiplyScalar(0.00012);
    const at = (u: number, v: number) => a0.clone().lerp(a1, u).lerp(b0.clone().lerp(b1, u), v).add(n);
    const rows = Math.max(1, Math.round(a0.clone().add(a1).distanceTo(b0.clone().add(b1)) / 2 / rowH));
    for (let k = 0; k < rows; k++) {
      const v0 = k / rows, v1 = (k + 0.96) / rows, rr = 0.5 * (v1 - v0);
      const m = Math.max(1, Math.round(at(0, v1).distanceTo(at(1, v1)) / tw)), st = k % 2 ? 0.5 : 0, g = 0.08 / m;
      for (let i = st ? -1 : 0; i < m; i++) {
        const u0 = (i + st) / m, u1 = u0 + 1 / m, L = Math.max(0, u0 + g), R = Math.min(1, u1 - g);
        if (R - L < 0.25 / m) continue;
        const um = (L + R) / 2;
        const pts: (readonly [number, number])[] = u0 < 0 || u1 > 1 ? [[L, v1], [L, v0], [R, v0], [R, v1]]
          : [[L, v1], [L, v0 + rr], [um, v0], [R, v0 + rr], [R, v1]];
        const t = tiles[Math.floor(r() * 3)]!, w = pts.map(([u, v]) => at(u, v));
        for (let j = 1; j < w.length - 1; j++) push(t, w[0]!, w[j]!, w[j + 1]!);
      }
    }
  }
  return [P(scGeo(base), shade(c, 0.6)), ...tiles.filter((t) => t.length).map((t, i) => P(scGeo(t), shade(c, [0.9, 1.04, 1.18][i]!)))];
}
// A skirt roof (lean-to all round): from its eaves w0 × d0 at y0 up to w1 × d1 at y1.
function scSkirt(w0: number, d0: number, y0: number, w1: number, d1: number, y1: number, rowH: number, tw: number, seed: number): G[] {
  const c = (sx: number, sz: number, w: number, d: number, y: number) => V(sx * w / 2, y, sz * d / 2);
  const f = (p: [number, number], q: [number, number]): SCFace => [c(...p, w0, d0, y0), c(...q, w0, d0, y0), c(...p, w1, d1, y1), c(...q, w1, d1, y1)];
  return shingled([f([-1, 1], [1, 1]), f([1, -1], [-1, -1]), f([1, 1], [1, -1]), f([-1, -1], [-1, 1])], rowH, tw, SC.SH, seed);
}
// A pyramid (or cone of n sides) of shingles, r its base's corner radius, h tall.
function scSpire(r: number, h: number, n: number, rowH: number, tw: number, seed: number, a0 = Math.PI / 4, arc = Math.PI * 2): G[] {
  const faces: SCFace[] = [], top = V(0, h, 0), m = Math.round(n * arc / (Math.PI * 2));
  for (let i = 0; i < m; i++) {
    const a = a0 + (i / n) * Math.PI * 2, b = a0 + ((i + 1) / n) * Math.PI * 2;
    faces.push([V(Math.sin(a) * r, 0, Math.cos(a) * r), V(Math.sin(b) * r, 0, Math.cos(b) * r), top, top]);
  }
  return shingled(faces, rowH, tw, SC.SH, seed);
}

// Staves: the planks over a box's four faces (w × d about (cx, cz)), from y
// to y + h, each its own shade, the dark wall between them its joints.
function staves(cx: number, cz: number, w: number, d: number, y: number, h: number, c: number, seed = 1): G[] {
  const out: G[] = [], r = scRand(seed);
  for (const [ry, len, o] of [[0, w, d / 2], [Math.PI, w, d / 2], [Math.PI / 2, d, w / 2], [-Math.PI / 2, d, w / 2]] as const) {
    const nx = Math.sin(ry), nz = Math.cos(ry), n = Math.max(1, Math.round(len / 0.0019));
    out.push(...rowOf(n, len, (x, z) => [pane(len / n - 0.00028, h, shade(c, 0.88 + r() * 0.26), x, y, z, ry)], cx + nx * (o + 0.00015), cz + nz * (o + 0.00015), ry));
  }
  return out;
}
// A stave wall: the dark core, its planks, the weathered sill and wall
// plate, round corner staves.
function scWalls(w: number, d: number, y0: number, y1: number, p0: number, seed: number, posts = true): G[] {
  const out: G[] = [...box(w, y1 - y0, d, SC.LINE, { y: y0 }, SC.WOOD)];
  out.push(...staves(0, 0, w, d, p0, y1 - 0.0011 - p0, SC.WOOD, seed));
  out.push(...box(w + 0.0007, 0.0012, d + 0.0007, SC.TRIM, { y: y1 - 0.001 }, SC.TRIM));
  if (posts) for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cyl(0.0008, 0.0008, y1 - y0 - 0.001, 6, shade(SC.WOOD, 1.1), { x: sx * w / 2, y: y0, z: sz * d / 2 }));
  return out;
}
// A flat board in the plane z (local), from (u0, v0) to (u1, v1), 2r wide.
const scBar = (u0: number, v0: number, u1: number, v1: number, z: number, r: number, c: number) => {
  const l = Math.hypot(u1 - u0, v1 - v0), nu = (-(v1 - v0) / l) * r, nv = ((u1 - u0) / l) * r;
  return P(scGeo([u0 - nu, v0 - nv, z, u1 - nu, v1 - nv, z, u1 + nu, v1 + nv, z, u0 - nu, v0 - nv, z, u1 + nu, v1 + nv, z, u0 + nu, v0 + nv, z]), c);
};
// A row of St Andrew's crosses (a band of saltires between two rails) along
// a wall len long, from y0 to y1, standing z proud (local, facing +z).
function scSaltires(len: number, y0: number, y1: number, z: number): G[] {
  const n = Math.max(1, Math.round(len / 0.0036)), b = len / n, out: G[] = [];
  out.push(...box(len, 0.0005, 0.0004, SC.TRIM, { y: y0, z }), ...box(len, 0.0005, 0.0004, SC.TRIM, { y: y1 - 0.0005, z }));
  for (let i = 0; i < n; i++) {
    const u = -len / 2 + i * b, q = 0.00025;
    out.push(scBar(u + q, y0 + 0.0005, u + b - q, y1 - 0.0005, z, 0.00022, SC.TRIM), scBar(u + b - q, y0 + 0.0005, u + q, y1 - 0.0005, z, 0.00022, SC.TRIM));
  }
  return out;
}
// A little round window: a weathered ring, the dark opening (local, facing +z).
const scOculus = (r: number, y: number, z: number): G[] => [
  P(new THREE.RingGeometry(r, r * 1.45, 10), SC.TRIM, { y, z }), P(new THREE.CircleGeometry(r, 10), SC.DARK, { y, z: z + 0.0001 }),
];
// A cross on a gable's apex (local, facing +z).
const scCross = (y: number, z: number, s: number, c: number = SC.TRIM): G[] => [
  ...box(s * 0.13, s, s * 0.13, c, { y, z }), ...box(s * 0.62, s * 0.13, s * 0.13, c, { y: y + s * 0.6, z }),
];
// A steep shingled gable roof, its ridge along z: the walls a wide (half)
// and d deep, their tops at y; the roof h over them, overhanging ov at the
// eaves and ovz at the ends; the boarded gable ends with their St Andrew's
// crosses, king post and round window; weathered barge boards crossed at
// the apex (left plain where a dragon or a cross takes it).
function scGable(a: number, d: number, y: number, h: number, ov: number, ovz: number, rowH: number, tw: number, seed: number, ends: readonly (1 | -1)[] = [1, -1], crossed = true): G[] {
  const k = h / a, E = a + ov, ye = y - ov * k, Y = y + h, Z = d / 2 + ovz;
  const out = shingled([
    [V(E, ye, Z), V(E, ye, -Z), V(0, Y, Z), V(0, Y, -Z)],
    [V(-E, ye, -Z), V(-E, ye, Z), V(0, Y, -Z), V(0, Y, Z)],
  ], rowH, tw, SC.SH, seed);
  out.push(rod(V(0, Y + 0.0002, -Z), V(0, Y + 0.0002, Z), 0.0004, SC.TRIM, 4));
  for (const s of ends) {
    const z = s * d / 2;
    out.push(P(scGeo([-a, y, z, a, y, z, 0, Y, z]), SC.WOOD));
    const f = (p: G[]) => (s > 0 ? p : scAt(p, 0, 0, 0, Math.PI));
    // Its boards (vertical joints), tie beam, king post and saltire.
    const nb = Math.max(2, Math.round((2 * a) / 0.0022));
    for (let i = 1; i < nb; i++) { const u = -a + (i * 2 * a) / nb, t = h * (1 - Math.abs(u) / a) - 0.0003; if (t > 0.001) out.push(...f([pane(0.00022, t, SC.LINE, u, y, 0.0001 + d / 2)])); }
    const b = y + 0.0005, q = a * 0.45;
    out.push(...f([
      scBar(-a * 0.96, b, a * 0.96, b, d / 2 + 0.0003, 0.0003, SC.TRIM),
      scBar(0, b, 0, y + h * 0.92, d / 2 + 0.0003, 0.00026, SC.TRIM),
      scBar(-q, b, q, b + h * 0.5, d / 2 + 0.0004, 0.00026, SC.TRIM),
      scBar(q, b, -q, b + h * 0.5, d / 2 + 0.0004, 0.00026, SC.TRIM),
      ...scOculus(Math.min(0.0011, a * 0.1), y + h * 0.68, d / 2 + 0.0004),
    ]));
    // The barge boards along the roof's edge.
    const zb = s * (Z + 0.0002), lift = 0.00035;
    for (const e of [-1, 1]) {
      const p0 = V(e * E, ye + lift, zb), p1 = V(0, Y + lift, zb), dir = p1.clone().sub(p0).normalize();
      out.push(rod(p0, crossed ? p1.clone().addScaledVector(dir, 0.0022) : p1, 0.00042, SC.TRIM, 4));
    }
  }
  return out;
}

// The gallery's arcade along one side (local, facing +z, len long, its top
// at yT): a boarded parapet, little round arches on posts with their
// capitals, the weathered sill and top rail; openings left out where skip.
function scArcade(len: number, yT: number, seed: number, skip: (u: number) => boolean = () => false): G[] {
  const n = Math.max(1, Math.round(len / 0.0034)), p = len / n, hw = p * 0.33, yp = 0.0044, ys = yT - 0.0034, D = 0.0008;
  const v2 = (u: number, y: number) => new THREE.Vector2(u, y);
  const shape = new THREE.Shape([v2(-len / 2, 0.0012), v2(len / 2, 0.0012), v2(len / 2, yT - 0.0006), v2(-len / 2, yT - 0.0006)]);
  const out: G[] = [], r = scRand(seed);
  for (let i = 0; i < n; i++) {
    const u = -len / 2 + (i + 0.5) * p;
    if (skip(u)) continue;
    shape.holes.push(new THREE.Path([v2(u - hw, yp), v2(u + hw, yp), ...arcPts(hw, ys, 4, 0, Math.PI).map(([x, y]) => v2(u + x, y))]));
    // The post right of it with its capital (between two openings or one); the parapet's boards.
    const x = u + p / 2;
    if (i < n - 1 && !(skip(u) && skip(u + p))) {
      out.push(cyl(0.0003, 0.0003, ys - yp, 4, shade(SC.WOOD, 1.12), { x, y: yp, z: D / 2 + 0.0003 }));
      out.push(pane(0.0012, 0.0005, SC.TRIM, x, ys - 0.0002, D / 2 + 0.0007));
    }
    for (const t of [-0.25, 0.25]) out.push(pane(0.0009, yp - 0.0016, shade(SC.WOOD, 0.85 + r() * 0.3), u + t * p, 0.0014, D / 2 + 0.0001));
  }
  out.push(P(new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -D / 2), SC.WOOD));
  out.push(...box(len + 0.0002, 0.0014, D + 0.0008, SC.TRIM, { y: 0 }, SC.TRIM));
  out.push(...box(len + 0.0004, 0.0004, D + 0.0006, SC.TRIM, { y: yp - 0.00045 }, SC.TRIM));
  out.push(...box(len + 0.0002, 0.0012, D + 0.0008, SC.TRIM, { y: yT - 0.001 }, SC.TRIM));
  return out;
}

// The west portal (local, facing +z, on the porch's face): its broad
// weathered frame; the plank door with its iron straps and ring.
function scPortal(): G[] {
  const out: G[] = [], z = 0.0002, yb = 0.0004, fw = 0.0088, fh = 0.0082, dw = 0.0044, dh = 0.0066;
  out.push(...archPane(fw, fh, SC.TRIM, 0, yb, z));
  out.push(...archPane(dw, dh, shade(SC.WOOD, 0.75), 0, yb + 0.0002, z + 0.0002));
  for (const u of [-0.0011, 0, 0.0011]) out.push(pane(0.00018, dh, SC.LINE, u, yb + 0.0002, z + 0.0003));
  for (const y of [0.0022, 0.0056]) out.push(scBar(-0.002, y, 0.0014, y, z + 0.00045, 0.00017, SC.IRON));
  out.push(P(new THREE.TorusGeometry(0.00035, 0.0001, 3, 6), SC.IRON, { x: 0.0012, y: 0.0045, z: z + 0.00045 }));
  return out;
}

// A small gable on a skirt roof (local, facing +z): its boarded front at
// the wall's plane, its shingled roof running back into the roof behind,
// a round window and a cross on its apex.
function scDormer(w: number, depth: number, y: number, h: number, rh: number, seed: number): G[] {
  const out: G[] = [...box(w, h, depth, SC.LINE, { y, z: -depth / 2 }, SC.WOOD)];
  out.push(...staves(0, -depth / 2, w, depth, y + 0.0005, h - 0.001, SC.WOOD, seed));
  out.push(...scAt(scGable(w / 2, depth, y + h, rh, 0.0012, 0.0012, 0.0016, 0.0016, seed, [1]), 0, 0, -depth / 2));
  out.push(...scCross(y + h + rh + 0.0002, 0.0012, 0.0032));
  return out;
}

// The stave church at Borgund: dark tarred timber, compact and tall. Round
// its foot the open gallery (the svalgang) of little round arches on posts
// under its own shingled lean-to, the porch before the carved west portal;
// the aisles' stave walls and their skirt roof with its small crossed
// gables; the tall nave with its round windows under a band of St Andrew's
// crosses, its steep roof of scalloped shingles, its gable ends boarded and
// crossed, dragons' heads curling up from them; on the ridge the turret
// with its shingled skirt, its belfry crowned by four little gables, its
// shingled spire. Behind,
// the chancel and the round apse with its little tower and conical cap.
function staveChurch(): G[] {
  const out: G[] = [];
  const NW = 0.03, ND = 0.032, AW = 0.046, AD = 0.048, GW = 0.06, GD = 0.062, CW = 0.024;
  const yG = 0.011, yA = 0.03, yN = 0.056, hN = 0.027;
  const zC0 = -AD / 2 + 0.001, zC1 = -0.041, hK = 0.026;

  // The aisles' walls (in the gallery's shade below its roof).
  out.push(...scWalls(AW, AD, 0, yA, 0.016, 3, false));
  for (const [ry, len, o] of [[0, AW, AD / 2], [Math.PI, AW, AD / 2], [Math.PI / 2, AD, AW / 2], [-Math.PI / 2, AD, AW / 2]] as const)
    out.push(pane(len, yG + 0.006, SC.DARK, Math.sin(ry) * (o + 0.0003), 0, Math.cos(ry) * (o + 0.0003), ry));
  // The gallery: the arcade on every side (the porch's opening in front,
  // the chancel's at the back), corner posts, its lean-to roof.
  out.push(...scAt(scArcade(GW, yG, 11, (u) => Math.abs(u) < 0.0095), 0, 0, GD / 2));
  for (const s of [-1, 1]) {
    out.push(...scAt(scArcade(GD, yG, 12 + s), s * GW / 2, 0, 0, s * Math.PI / 2));
    const l = GW / 2 - CW / 2 + 0.0005;
    out.push(...scAt(scArcade(l, yG, 15 + s), s * (GW / 2 - l / 2), 0, -GD / 2, Math.PI));
    for (const t of [-1, 1]) out.push(...box(0.0018, yG + 0.0004, 0.0018, SC.TRIM, { x: s * GW / 2, z: t * GD / 2 }, SC.TRIM));
  }
  out.push(...scAt(scSkirt(GW + 0.006, GD + 0.006, yG - 0.0012, AW, AD, yG + 0.0073, 0.0031, 0.003, 21), 0, 0, 0));

  // The porch before the gallery: its walls, the carved portal, its
  // gable with its saltire and cross.
  const pz0 = GD / 2 - 0.004, pz1 = GD / 2 + 0.006, pw = 0.015, ph = 0.0135;
  out.push(...scAt(scWalls(pw, pz1 - pz0, 0, ph, 0.0012, 31), 0, 0, (pz0 + pz1) / 2));
  out.push(...scAt(scPortal(), 0, 0, pz1 + 0.0003));
  out.push(...scAt(scGable(pw / 2, pz1 - pz0, ph, 0.009, 0.0016, 0.0016, 0.0018, 0.0018, 32, [1]), 0, 0, (pz0 + pz1) / 2));
  out.push(...scCross(ph + 0.0092, pz1 + 0.0018, 0.0036));

  // The aisles' wall plate and skirt roof; its small crossed gables front and sides.
  out.push(...scSkirt(AW + 0.006, AD + 0.006, yA - 0.0015, NW, ND, yA + 0.0095, 0.0027, 0.0026, 41));
  out.push(...scAt(scDormer(0.013, (AD - ND) / 2 + 0.002, yA - 0.002, 0.0085, 0.0068, 51), 0, 0, AD / 2 + 0.0008));
  for (const s of [-1, 1]) out.push(...scAt(scDormer(0.013, (AW - NW) / 2 + 0.002, yA - 0.002, 0.0085, 0.0068, 52 + s), s * (AW / 2 + 0.0008), 0, 0, s * Math.PI / 2));

  // The nave: its walls, round windows under the band of saltires, the
  // steep roof and its dragons.
  out.push(...scWalls(NW, ND, yA - 0.001, yN, yA + 0.008, 61));
  for (const [ry, len, o] of [[0, NW, ND / 2], [Math.PI, NW, ND / 2], [Math.PI / 2, ND, NW / 2], [-Math.PI / 2, ND, NW / 2]] as const) {
    const parts = [...scSaltires(len, yN - 0.0062, yN - 0.0011, 0.0004)];
    for (const u of len > 0.031 ? [-0.009, 0, 0.009] : [-0.0075, 0.0075]) parts.push(...scAt(scOculus(0.0011, yN - 0.0088, 0.0004), u, 0, 0));
    out.push(...scAt(parts, Math.sin(ry) * o, 0, Math.cos(ry) * o, ry));
  }
  out.push(...scGable(NW / 2, ND, yN, hN, 0.0028, 0.0032, 0.0027, 0.0025, 71, [1, -1], false));
  for (const s of [-1, 1]) out.push(...dragon(0, yN + hN - 0.0004, s * (ND / 2 + 0.0034), s, 0.012, SC.SH));

  // The turret on the ridge: its lower stage and skirt; the belfry, its
  // arched openings and its crown of four little crossed gables; the spire.
  const ty = 0.069, t1 = 0.088, t2 = t1 + 0.0125;
  out.push(...scWalls(0.012, 0.012, ty, t1, 0.0705, 81));
  out.push(...scAt(scSkirt(0.02, 0.02, t1 - 0.0008, 0.0095, 0.0095, t1 + 0.0045, 0.0018, 0.0017, 82), 0, 0, 0));
  out.push(...scWalls(0.0095, 0.0095, t1 + 0.002, t2, t1 + 0.004, 83));
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const face: G[] = [];
    for (const u of [-0.0021, 0.0021]) face.push(...archPane(0.0026, 0.0034, SC.TRIM, u, t1 + 0.0052, 0.0003), ...archPane(0.0018, 0.003, SC.DARK, u, t1 + 0.0055, 0.0004));
    face.push(...scAt(scGable(0.0034, 0.0036, t2 - 0.0012, 0.0045, 0.0008, 0.0008, 0.0014, 0.0014, 84, [1]), 0, 0, -0.0017));
    face.push(...scCross(t2 + 0.0035, 0.0011, 0.0024));
    out.push(...scAt(face, Math.sin(a) * 0.00475, 0, Math.cos(a) * 0.00475, a));
  }
  out.push(...scAt(scSpire(0.0062, 0.028, 4, 0.0017, 0.0015, 86), 0, t2 + 0.002, 0));
  const tp = t2 + 0.03;
  out.push(rod(V(0, tp - 0.001, 0), V(0, tp + 0.006, 0), 0.00022, SC.IRON, 4), ball(0.0005, SC.TRIM, { y: tp + 0.0012 }));
  out.push(...scCross(tp + 0.003, 0, 0.0035, SC.IRON));

  // The chancel behind: its walls and saltires, its steep roof and cross;
  // the round apse, its skirt, its little round tower and conical cap.
  const kz = (zC0 + zC1) / 2, kd = zC0 - zC1;
  out.push(...scAt(scWalls(CW, kd, 0, hK, 0.016, 91), 0, 0, kz));
  for (const s of [-1, 1]) out.push(...scAt(scSaltires(kd - 0.006, hK - 0.0055, hK - 0.001, 0.0004), s * CW / 2, 0, kz, s * Math.PI / 2));
  out.push(...scAt(scGable(CW / 2, kd, hK, 0.014, 0.0022, 0.0024, 0.0022, 0.002, 92, [-1]), 0, 0, kz));
  out.push(...scAt(scCross(hK + 0.0142, 0.0026, 0.0045), 0, 0, zC1, Math.PI));
  const ar = 0.009, aH = 0.019;
  out.push(halfDrum(ar, aH, SC.LINE, 0, 0, zC1, -1, 14));
  for (let i = 0; i < 13; i++) {
    const a = Math.PI / 2 + ((i + 0.5) / 13) * Math.PI, r0 = ar + 0.00015;
    out.push(pane(0.0019, aH - 0.0012, shade(SC.WOOD, 0.9 + ((i * 7) % 5) * 0.06), Math.sin(a) * r0, 0, zC1 + Math.cos(a) * r0, a));
  }
  out.push(halfDrum(ar + 0.0004, 0.0012, SC.TRIM, 0, aH - 0.001, zC1, -1, 14));
  out.push(...scAt(scSpire(ar + 0.0022, 0.012, 14, 0.0022, 0.0022, 93, Math.PI / 2, Math.PI), 0, aH - 0.0015, zC1));
  const tr = 0.0036, tz = zC1 - 0.0035, tb = aH + 0.0035, tt = tb + 0.0085;
  out.push(cyl(tr, tr, tt - tb + 0.004, 10, SC.LINE, { y: tb - 0.004, z: tz }));
  for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * Math.PI * 2; out.push(pane(0.002, tt - tb - 0.0008, shade(SC.WOOD, 0.9 + ((i * 3) % 4) * 0.07), Math.sin(a) * (tr * 0.96 + 0.00015), tb - 0.0005, tz + Math.cos(a) * (tr * 0.96 + 0.00015), a)); }
  for (const a of [Math.PI, Math.PI / 2, -Math.PI / 2]) out.push(...scAt(scOculus(0.0006, tt - 0.0035, 0.0002), Math.sin(a) * tr * 0.96, 0, tz + Math.cos(a) * tr * 0.96, a));
  out.push(drumC(tr + 0.0005, tr + 0.0005, 0.001, 10, SC.TRIM, { y: tt - 0.0004, z: tz }));
  out.push(...scAt(scSpire(tr + 0.0016, 0.013, 10, 0.0019, 0.0017, 94, 0), 0, tt + 0.0004, tz));
  out.push(rod(V(0, tt + 0.013, tz), V(0, tt + 0.0165, tz), 0.0002, SC.IRON, 4));
  out.push(...scAt(scCross(tt + 0.0155, 0, 0.0028, SC.IRON), 0, 0, tz));
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
