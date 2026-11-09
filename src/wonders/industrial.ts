// The Industrial era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z. Those in a city keep their own
// proportions; the Statue of Liberty stands on its island in the sea beside
// its city (origin at the water line), Neuschwanstein on its crag on hills
// beside it.

import * as THREE from 'three';
import { chamfered, frustum, gable, prism, ring, spire } from '../houseKit.ts';
import {
  P, V, H, archPane, ball, box, column, cone, cyl, disc, drumC, figure, flat, islet, pane, rnd, rod, shade, steps,
  type G, type Models,
} from './kit.ts';

const GRASS = 0x7f9a52, PAVE = 0xc9c0ae, GOLD = 0xd9b04a;

// ---------- helpers ----------

// The plain pad a wonder in a city stands on, the whole site (so the city
// fits every wonder at one scale: a city cell about 0.039 site units).
const pad = (c = PAVE) => flat(2 * H, 2 * H, c, 0, 0, 0.0003);

// A face's frame: facing ry, its outward normal and its tangent (left to right seen from outside).
const frame = (ry: number) => ({ nx: Math.sin(ry), nz: Math.cos(ry), tx: Math.cos(ry), tz: -Math.sin(ry) });
// Panes on a face: the face's middle at (cx, cz), `o` out from it, at tangents ts and heights ys.
function panes(cx: number, cz: number, o: number, ry: number, ts: readonly number[], ys: readonly number[], w: number, h: number, c: number, arched = false): G[] {
  const { nx, nz, tx, tz } = frame(ry), out: G[] = [];
  for (const t of ts) for (const y of ys) {
    const x = cx + nx * o + tx * t, z = cz + nz * o + tz * t;
    out.push(...(arched ? archPane(w, h - w / 2, c, x, y, z, ry) : [pane(w, h, c, x, y, z, ry)]));
  }
  return out;
}
const spread = (n: number, span: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -span / 2 + (i * span) / (n - 1)));
// A little round turret: its drum, a ring of corbels, a pointed roof and a finial.
function turret(x: number, z: number, y: number, r: number, h: number, wall: number, roof: number, roofH = r * 3.2): G[] {
  return [
    drumC(r, r, h, 10, wall, { x, y, z }),
    drumC(r * 0.85, r * 1.12, r * 0.6, 10, shade(wall, 0.95), { x, y: y + h - r * 0.6 + 0.0002, z }),
    cone(r * 1.2, roofH, 10, roof, { x, y: y + h, z }),
    rod(V(x, y + h + roofH * 0.95, z), V(x, y + h + roofH + r * 0.9, z), r * 0.08, GOLD, 3),
  ];
}
// Crenellations along a line from a to b at height y.
function merlonsAlong(ax: number, az: number, bx: number, bz: number, y: number, s: number, c: number): G[] {
  const l = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.floor(l / (s * 2))), ry = Math.atan2(bx - ax, bz - az) + Math.PI / 2, out: G[] = [];
  for (let i = 0; i < n; i++) { const f = (i + 0.5) / n; out.push(...box(s, s, s * 0.8, c, { x: ax + (bx - ax) * f, y, z: az + (bz - az) * f, ry })); }
  return out;
}
// A conifer: a trunk and three stacked cones.
function fir(x: number, z: number, h: number, y = 0, c = 0x3f5a3a): G[] {
  return [
    rod(V(x, y, z), V(x, y + h * 0.2, z), h * 0.03, 0x5a4030, 3),
    cone(h * 0.24, h * 0.45, 7, c, { x, y: y + h * 0.15, z }),
    cone(h * 0.19, h * 0.4, 7, shade(c, 1.06), { x, y: y + h * 0.38, z }),
    cone(h * 0.13, h * 0.32, 7, shade(c, 1.1), { x, y: y + h * 0.62, z }),
  ];
}

// A thin open bar from a to b (a girder of a lattice), three-sided.
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, c: number): G {
  const l = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, l, 3, 1, true).translate(0, l / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())));
  return P(g.translate(a.x, a.y, a.z), c);
}

// ---------- Paris: the Eiffel Tower ----------

// Four lattice legs on their stone piers, each a box of girders braced with
// crosses, curving in under the great arches to the first floor, meeting at
// the second; the tapering shaft to the top floor, its lantern and mast.
// Drawn in metres to the real tower's outline (125 m across its feet, 330 m
// to the mast's tip), then scaled so its feet reach the site's corners:
// about 10 cells tall on its pad.
function eiffelTower(): G[] {
  const out: G[] = [], I = 0x6b5645, LIGHT = shade(I, 1.35), GLASS = 0xb9c6c4, STONE = 0xb8ae98, K = H / 63.5;
  // The tower's outline: half its width at each height (metres).
  const prof = [[0, 62.5], [20, 52], [40, 43], [57.6, 36.5], [80, 28.5], [115.7, 20.5], [150, 15.2], [190, 11], [230, 8.2], [276, 6.2], [282, 6]] as const;
  const W = (y: number) => {
    for (let i = 1; i < prof.length; i++) if (y <= prof[i]![0]) { const [y0, w0] = prof[i - 1]!, [y1, w1] = prof[i]!; return w0 + ((w1 - w0) * (y - y0)) / (y1 - y0); }
    return prof[prof.length - 1]![1];
  };
  const f1 = 57.6, f2 = 115.7, f3 = 276;
  // A leg's width: 26 m at its foot, 17 at the first floor, its inner edge meeting the others' at the second.
  const L = (y: number) => (y <= f1 ? 26 - (9 * y) / f1 : 17 + ((W(f2) - 17) * (y - f1)) / (f2 - f1));
  // A box of girders between levels ys, corners at each level from corners(y): chords, crosses, struts.
  const lattice = (ys: readonly number[], corners: (y: number) => THREE.Vector3[], chord: number) => {
    for (let j = 0; j < ys.length; j++) {
      const a = corners(ys[j]!);
      for (let k = 0; k < 4; k++) out.push(bar(a[k]!, a[(k + 1) % 4]!, chord * 0.55, I));
      if (j === ys.length - 1) break;
      const b = corners(ys[j + 1]!);
      for (let k = 0; k < 4; k++) {
        out.push(bar(a[k]!, b[k]!, chord, I));
        out.push(bar(a[k]!, b[(k + 1) % 4]!, chord * 0.4, I), bar(a[(k + 1) % 4]!, b[k]!, chord * 0.4, I));
      }
    }
  };
  // The legs: each a box of girders in panels about as tall as it is wide, on its masonry pier.
  const legYs = [1.5, 6, 12.5, 19.5, 27, 35, 43.5, 51, f1, 64, 71, 78.5, 86.5, 95, 105, f2];
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    lattice(legYs, (y) => { const o = W(y), i = Math.max(0, o - L(y)); return [V(sx * o, y, sz * o), V(sx * i, y, sz * o), V(sx * i, y, sz * i), V(sx * o, y, sz * i)]; }, 0.95);
    const m = W(0) - L(0) / 2;
    out.push(...box(28, 3.2, 28, STONE, { x: sx * m, z: sz * m }, shade(STONE, 0.92)));
    out.push(...box(30, 0.8, 30, shade(STONE, 0.9), { x: sx * m, z: sz * m }));
  }
  const shaftYs = Array.from({ length: 23 }, (_, i) => f2 + (i * (f3 - f2)) / 22);
  lattice(shaftYs, (y) => { const o = W(y); return [V(o, y, o), V(-o, y, o), V(-o, y, -o), V(o, y, -o)]; }, 0.75);
  // The great arches between the legs, one on each side: from the legs' inner edges up under the first floor.
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2, c = Math.cos(ry), s = Math.sin(ry);
    const R = W(6) - L(6) + 0.6;
    const at = (t: number, lift: number) => { const x = Math.cos(t) * (R - lift * 0.2), y = 6 + lift + Math.sin(t) * (43 - lift * 1.3), z = W(y) + 0.25; return V(x * c + z * s, y, -x * s + z * c); };
    const n = 18;
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI, t1 = ((i + 1) / n) * Math.PI;
      out.push(bar(at(t0, 0), at(t1, 0), 0.8, I), bar(at(t0, 2.6), at(t1, 2.6), 0.55, I));
      out.push(bar(at(t0, 0), at(t1, 2.6), 0.3, I), bar(at(t1, 0), at(t1, 2.6), 0.3, I));
    }
  }
  // A floor's skirt round the tower at y (h deep, half-width w): its girder band, a frieze of light arches, the railing.
  const skirt = (y: number, h: number, w: number, arches: number) => {
    out.push(ring(2 * w, h, 2 * w, I, { y: y - h }));
    for (let f = 0; f < 4; f++) {
      const ry = (f * Math.PI) / 2, { nx, nz, tx, tz } = frame(ry);
      for (let k = 0; k < arches; k++) {
        const t = -w + ((k + 0.5) * 2 * w) / arches, aw = ((2 * w) / arches) * 0.72;
        out.push(...archPane(aw, h * 0.62 - aw / 2, LIGHT, nx * (w + 0.12) + tx * t, y - h * 0.82, nz * (w + 0.12) + tz * t, ry));
      }
    }
    out.push(ring(2 * w, 1.3, 2 * w, shade(I, 0.8), { y }));
  };
  // The first floor: its deck round an open middle, its glazed pavilions between the legs.
  const w1 = W(f1) + 1.2, hole = W(f1) - L(f1) - 1;
  skirt(f1, 7, w1, 15);
  for (const s of [-1, 1]) {
    out.push(...box(2 * w1, 0.8, w1 - hole, I, { y: f1 - 0.8, z: (s * (w1 + hole)) / 2 }, shade(I, 0.85)));
    out.push(...box(w1 - hole, 0.8, 2 * hole, I, { x: (s * (w1 + hole)) / 2, y: f1 - 0.8 }, shade(I, 0.85)));
  }
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2, { nx, nz } = frame(ry), d = (w1 + hole) / 2;
    out.push(...box(24, 5, 6, GLASS, { x: nx * d, y: f1, z: nz * d, ry }, shade(I, 0.75)));
    for (let k = 0; k < 9; k++) out.push(pane(0.35, 5, I, nx * (d + 3.08) + Math.cos(ry) * (-11 + k * 2.75), f1, nz * (d + 3.08) - Math.sin(ry) * (-11 + k * 2.75), ry));
  }
  // The second floor: a solid deck round the shaft, a smaller skirt, a pavilion.
  const w2 = W(f2) + 1;
  skirt(f2, 4.5, w2, 9);
  out.push(...box(2 * w2, 0.8, 2 * w2, I, { y: f2 - 0.8 }, shade(I, 0.85)));
  out.push(...box(2 * W(f2 + 4) - 2, 4, 2 * W(f2 + 4) - 2, GLASS, { y: f2 }, shade(I, 0.75)));
  // A gallery half way up the shaft.
  const fm = 196, wm = W(fm) + 0.8;
  out.push(ring(2 * wm, 2, 2 * wm, I, { y: fm - 2 }), ring(2 * wm, 1, 2 * wm, shade(I, 0.8), { y: fm }));
  // The top: the glazed gallery, the open deck, the four ribs up to the lantern, the mast.
  const w3 = 8.5;
  out.push(...box(2 * w3, 1, 2 * w3, I, { y: f3 - 1 }, shade(I, 0.85)));
  out.push(...box(2 * w3 - 1.5, 5, 2 * w3 - 1.5, GLASS, { y: f3 }, shade(I, 0.85)));
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2, { nx, nz, tx, tz } = frame(ry);
    for (let k = 0; k < 7; k++) { const t = -w3 + 0.75 + (k * (2 * w3 - 1.5)) / 6; out.push(pane(0.3, 5, I, nx * (w3 - 0.7) + tx * t, f3, nz * (w3 - 0.7) + tz * t, ry)); }
  }
  out.push(ring(2 * w3, 1.2, 2 * w3, shade(I, 0.8), { y: f3 + 5 }));
  for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) out.push(rod(V(x * 6, f3 + 5, z * 6), V(x * 2.6, f3 + 17, z * 2.6), 0.6, I, 4));
  out.push(...box(7, 1.2, 7, I, { y: f3 + 16.5 }));
  out.push(drumC(2.6, 2.4, 5, 10, I, { y: f3 + 17.7 }), drumC(2, 1.6, 2.5, 10, shade(I, 0.9), { y: f3 + 22.75 }));
  out.push(ball(1.6, 0xf6d880, { y: f3 + 26.5 }, 1));
  out.push(rod(V(0, f3 + 25, 0), V(0, 312, 0), 0.75, 0x9a9a9a, 6, 0.6));
  for (let k = 0; k < 5; k++) out.push(rod(V(0, 312 + k * 3.6, 0), V(0, 313.8 + k * 3.6, 0), 0.55, 0xc23a2a, 6), rod(V(0, 313.8 + k * 3.6, 0), V(0, 315.6 + k * 3.6, 0), 0.55, 0xeeeeee, 6));
  for (const g of out) g.scale(K, K, K);
  return [pad(), ...out];
}

// ---------- London: Big Ben and the Palace of Westminster ----------

// The palace: its long Gothic front of buttresses crowned with pinnacles,
// tall windows in rows, the steep slate roof with its flèches; the
// Victoria Tower at one end, the octagonal Central Tower; at the other end
// the clock tower, panelled from foot to belfry, its four gilded clock faces
// under their gables, the belfry's arches, the iron spire with its lucarnes
// and cross (about 7 cells tall on its pad).
function bigBen(): G[] {
  const out: G[] = [], S = 0xcdb98e, SL = 0x56625e;
  // The palace: a long range, buttresses, three rows of windows, a parapet, the roof.
  const x0 = -0.04, x1 = 0.046, pz = -0.012, pd = 0.064, ph = 0.064, pw = x1 - x0, pcx = (x0 + x1) / 2;
  out.push(...box(pw, ph, pd, S, { x: pcx, z: pz }));
  for (const [ry, len, o, cx, cz] of [[0, pw, pd / 2, pcx, pz], [Math.PI, pw, pd / 2, pcx, pz], [Math.PI / 2, pd, pw / 2, pcx, pz]] as const) {
    const { nx, nz, tx, tz } = frame(ry), n = Math.round(len / 0.0058);
    for (let k = 0; k <= n; k++) {
      const t = -len / 2 + (k * len) / n, x = cx + nx * (o + 0.0004) + tx * t, z = cz + nz * (o + 0.0004) + tz * t;
      out.push(...box(0.0016, ph + 0.004, 0.0015, shade(S, 1.05), { x, z, ry }));
      out.push(spire(0.0016, 0.0065, shade(S, 1.05), { x, y: ph + 0.004, z }));
    }
    const ts = Array.from({ length: n }, (_, k) => -len / 2 + ((k + 0.5) * len) / n);
    out.push(...panes(cx, cz, o + 0.0003, ry, ts, [0.007, 0.027, 0.047], 0.0026, 0.012, 0x3a3e44, true));
    for (const yb of [0.0225, 0.0425]) out.push(...box(len - 0.0006, 0.0014, 0.0008, shade(S, 0.9), { x: cx + nx * (o + 0.0002), y: yb, z: cz + nz * (o + 0.0002), ry }));
  }
  out.push(...merlonsAlong(x0, pz + pd / 2 - 0.0006, x1, pz + pd / 2 - 0.0006, ph, 0.0014, shade(S, 1.03)));
  out.push(...gable(pw - 0.004, pd - 0.008, 0.022, SL, { x: pcx, y: ph, z: pz }, false, shade(S, 0.95)));
  for (let k = 0; k < 5; k++) out.push(spire(0.0028, 0.01, SL, { x: x0 + 0.012 + k * 0.016, y: ph + 0.02, z: pz }), ...box(0.0022, 0.006, 0.0022, shade(S, 0.85), { x: x0 + 0.02 + k * 0.016, y: ph + 0.008, z: pz + 0.014 }));
  // The Central Tower: an octagonal lantern and its spire, pinnacles round it.
  const cxT = 0.0;
  out.push(...chamfered(0.021, 0.06, 0.021, 0.29, shade(S, 1.02), { x: cxT, y: ph, z: pz }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, rr = 0.0108;
    out.push(spire(0.002, 0.009, shade(S, 1.04), { x: cxT + Math.cos(a) * rr, y: ph + 0.06, z: pz + Math.sin(a) * rr }));
    const ry = (k * Math.PI) / 4;
    out.push(...archPane(0.0028, 0.016, 0x3a3e44, cxT + Math.sin(ry) * 0.0109, ph + 0.024, pz + Math.cos(ry) * 0.0109, ry));
  }
  out.push(cone(0.0105, 0.04, 8, SL, { x: cxT, y: ph + 0.06, z: pz }), rod(V(cxT, ph + 0.099, pz), V(cxT, ph + 0.107, pz), 0.0004, GOLD, 3));
  // The Victoria Tower: square, its corner turrets, the royal entrance, a flag (drawn, then raised by a third).
  const vx = -0.056, vz = -0.022, vw = 0.026, vh = 0.138, vic: G[] = [];
  vic.push(...box(vw, vh, vw, S, { x: vx, z: vz }));
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    vic.push(...panes(vx, vz, vw / 2 + 0.0003, ry, [-0.0055, 0, 0.0055], [0.04, 0.058, 0.076, 0.094, 0.112], 0.0022, 0.011, 0x3a3e44, true));
    for (const yb of [0.035, 0.1235]) { const { nx, nz } = frame(ry); vic.push(...box(vw + 0.001, 0.0016, 0.0008, shade(S, 0.9), { x: vx + nx * (vw / 2 + 0.0002), y: yb, z: vz + nz * (vw / 2 + 0.0002), ry })); }
  }
  vic.push(...archPane(0.012, 0.022, 0x2c2a28, vx, 0, vz + vw / 2 + 0.0003));
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    vic.push(...chamfered(0.0058, vh + 0.008, 0.0058, 0.29, shade(S, 1.04), { x: vx + sx * vw / 2, z: vz + sz * vw / 2 }));
    vic.push(spire(0.0055, 0.014, shade(S, 1.04), { x: vx + sx * vw / 2, y: vh + 0.008, z: vz + sz * vw / 2 }));
  }
  vic.push(...merlonsAlong(vx - vw / 2, vz + vw / 2, vx + vw / 2, vz + vw / 2, vh, 0.0016, S), ...merlonsAlong(vx - vw / 2, vz - vw / 2, vx + vw / 2, vz - vw / 2, vh, 0.0016, S));
  vic.push(rod(V(vx, vh, vz), V(vx, vh + 0.028, vz), 0.0004, 0xe0e0e0, 3), pane(0.011, 0.0065, 0xb23a3a, vx, vh + 0.02, vz + 0.0058, Math.PI / 2));
  vic.push(pane(0.011, 0.0018, 0xf0f0f0, vx + 0.0002, vh + 0.0224, vz + 0.0058, Math.PI / 2), pane(0.0024, 0.0065, 0xf0f0f0, vx + 0.0002, vh + 0.02, vz + 0.0058, Math.PI / 2));
  out.push(...about(vic, vx, vz, 1.3));
  // The clock tower, raised by two fifths.
  out.push(...about(clockTower(0.0585, 0.006, S), 0.0585, 0.006, 1.42));
  return [pad(), ...out];
}
// Parts scaled by k about a point on the ground (x, z).
function about(parts: G[], x: number, z: number, k: number): G[] {
  const m = new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-x, 0, -z));
  for (const g of parts) g.applyMatrix4(m);
  return parts;
}
function clockTower(x: number, z: number, S: number): G[] {
  const out: G[] = [], w = 0.021, h1 = 0.1, IRON = 0x4c5a56;
  out.push(...box(w + 0.003, 0.006, w + 0.003, shade(S, 0.92), { x, z }));
  out.push(...box(w, h1, w, S, { x, z }));
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { nx, nz, tx, tz } = frame(ry), o = w / 2;
    // Panels: slender shafts up the faces, narrow lancets between them.
    for (const t of [-0.0072, -0.0024, 0.0024, 0.0072]) out.push(...box(0.0011, h1 - 0.008, 0.0011, shade(S, 1.06), { x: x + nx * (o + 0.0003) + tx * t, y: 0.006, z: z + nz * (o + 0.0003) + tz * t, ry }));
    out.push(...panes(x, z, o + 0.0003, ry, [-0.0048, 0, 0.0048], [0.014, 0.027, 0.04, 0.053, 0.066, 0.079], 0.0017, 0.0075, 0x3a3e44, true));
    for (const yb of [0.0085, 0.0215, 0.0345, 0.0475, 0.0605, 0.0735, 0.0865]) out.push(...box(w + 0.001, 0.0009, 0.0007, shade(S, 0.9), { x: x + nx * (o + 0.0002), y: yb, z: z + nz * (o + 0.0002), ry }));
  }
  // The clock stage: wider, a face on each side under a gable, pinnacles at the corners.
  const yc = h1, wc = w + 0.003, hc = 0.024;
  out.push(...box(wc, hc, wc, shade(S, 1.03), { x, y: yc, z }));
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { nx, nz, tx, tz } = frame(ry), o = wc / 2;
    const cx = x + nx * (o + 0.0003), cz = z + nz * (o + 0.0003), cy = yc + 0.012;
    out.push(P(new THREE.PlaneGeometry(0.019, 0.019), GOLD, { x: cx, y: cy, z: cz, ry }));
    out.push(P(new THREE.CircleGeometry(0.0084, 24), 0xf4ecd4, { x: cx + nx * 0.0002, y: cy, z: cz + nz * 0.0002, ry }));
    out.push(P(new THREE.RingGeometry(0.0084, 0.0094, 24), 0x2a2620, { x: cx + nx * 0.0003, y: cy, z: cz + nz * 0.0003, ry }));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      out.push(P(new THREE.PlaneGeometry(0.0007, 0.0016), 0x2a2620, { x: cx + nx * 0.0004 + tx * Math.sin(a) * 0.0072, y: cy + Math.cos(a) * 0.0072, z: cz + nz * 0.0004 + tz * Math.sin(a) * 0.0072, ry, rz: -a * (ry === 0 || ry === Math.PI ? 1 : 1) }));
    }
    const hand = (a: number, l: number) => rod(V(cx + nx * 0.0006, cy, cz + nz * 0.0006), V(cx + nx * 0.0006 + tx * Math.sin(a) * l, cy + Math.cos(a) * l, cz + nz * 0.0006 + tz * Math.sin(a) * l), 0.00035, 0x1a1816, 3);
    out.push(hand(2.1, 0.0045), hand(0, 0.0068));
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.011, 0, 0, 0.011, 0, 0, 0, 0.007, 0], 3));
    out.push(P(tri, shade(S, 1.08), { x: x + nx * (o + 0.0002), y: yc + hc, z: z + nz * (o + 0.0002), ry }));
    out.push(spire(0.0014, 0.004, GOLD, { x: x + nx * (o + 0.0002), y: yc + hc + 0.007, z: z + nz * (o + 0.0002) }));
  }
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) out.push(...chamfered(0.0034, hc + 0.004, 0.0034, 0.29, shade(S, 1.05), { x: x + sx * wc / 2, y: yc, z: z + sz * wc / 2 }), spire(0.0034, 0.011, shade(S, 1.05), { x: x + sx * wc / 2, y: yc + hc + 0.004, z: z + sz * wc / 2 }));
  // A low iron roof over the clock stage, then the belfry: arches on each side, a gallery.
  out.push(...frustum(wc + 0.0008, wc + 0.0008, w - 0.001, w - 0.001, 0.004, IRON, { x, y: yc + hc, z }));
  const yb = yc + hc + 0.004, wb = w - 0.001, hb = 0.016;
  out.push(...box(wb, hb, wb, S, { x, y: yb, z }));
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) out.push(...panes(x, z, wb / 2 + 0.0003, ry, [-0.0055, 0, 0.0055], [yb + 0.003], 0.0034, 0.011, 0x2c2a26, true));
  out.push(...box(wb + 0.003, 0.0016, wb + 0.003, shade(S, 0.95), { x, y: yb + hb }));
  // The iron spire: lucarnes on its faces, a lantern, the cross.
  const ys = yb + hb + 0.0016;
  out.push(spire(wb + 0.001, 0.034, IRON, { x, y: ys, z }));
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { nx, nz } = frame(ry);
    out.push(...box(0.0044, 0.006, 0.003, IRON, { x: x + nx * 0.0068, y: ys + 0.004, z: z + nz * 0.0068, ry }, IRON));
    out.push(...gable(0.0048, 0.0034, 0.0032, IRON, { x: x + nx * 0.0068, y: ys + 0.01, z: z + nz * 0.0068, ry }, true));
    out.push(pane(0.0022, 0.0035, GOLD, x + nx * 0.0084, ys + 0.005, z + nz * 0.0084, ry));
  }
  out.push(...box(0.004, 0.006, 0.004, GOLD, { x, y: ys + 0.024, z }));
  out.push(rod(V(x, ys + 0.03, z), V(x, ys + 0.046, z), 0.0005, GOLD, 4), rod(V(x - 0.0022, ys + 0.042, z), V(x + 0.0022, ys + 0.042, z), 0.0004, GOLD, 3));
  return out;
}

// ---------- New York: the Statue of Liberty ----------

// On Liberty Island: the eleven-pointed star of Fort Wood, the granite pedestal with its loggias, balconies and cornice, and
// the copper lady, robed in deep folds, torch raised high in her right
// hand, the tablet of the law in her left, her crown of seven rays. (On the sea beside a coastal city: its origin at the
// water line, its islet as the Pharos's.)
function statueOfLiberty(): G[] {
  const out: G[] = [...islet()], GR = 0xbab3a6, CU = 0x78ae97;
  out.push(disc(0.064, GRASS, 0, 0, 0.0063, 24));
  // Fort Wood: an eleven-pointed star of granite walls.
  const star: [number, number][] = [];
  for (let k = 0; k < 22; k++) { const a = (k / 22) * Math.PI * 2 + Math.PI / 2, rr = k % 2 ? 0.034 : 0.047; star.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  out.push(...prism(star.reverse(), 0.011, shade(GR, 0.92), { y: 0.005 }, shade(GR, 1.02)));
  // The pedestal: its steps, the shaft with loggias on each face, cornice, balcony.
  const st = steps(0.036, 0.036, 3, 0.0028, 0.002, shade(GR, 0.97), { y: 0.016 });
  out.push(...st.parts);
  const y0 = st.y, ph = 0.038;
  out.push(...frustum(0.03, 0.03, 0.026, 0.026, ph, GR, { y: y0 }, shade(GR, 1.03)));
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { nx, nz, tx, tz } = frame(ry), o = 0.0137;
    out.push(pane(0.012, 0.012, 0x4a4844, nx * (o + 0.0004), y0 + 0.016, nz * (o + 0.0004), ry));
    for (const t of [-0.0068, -0.0045, 0.0045, 0.0068]) out.push(cyl(0.0008, 0.0007, 0.012, 6, shade(GR, 1.06), { x: nx * (o + 0.001) + tx * t, y: y0 + 0.016, z: nz * (o + 0.001) + tz * t }));
    out.push(...box(0.02, 0.0014, 0.002, shade(GR, 1.05), { x: nx * (o + 0.001), y: y0 + 0.028, z: nz * (o + 0.001), ry }));
    out.push(...panes(0, 0, o + 0.0012, ry, [-0.004, 0, 0.004], [y0 + 0.004], 0.002, 0.006, 0x4a4844));
  }
  out.push(...box(0.031, 0.003, 0.031, shade(GR, 1.05), { y: y0 + ph }));
  out.push(...box(0.024, 0.006, 0.024, GR, { y: y0 + ph + 0.003 }));
  out.push(ring(0.027, 0.0018, 0.027, shade(GR, 0.9), { y: y0 + ph + 0.009 }));
  // The statue, standing on the pedestal's top.
  out.push(...liberty(y0 + ph + 0.009, CU));
  return out;
}
// The copper lady, her feet at y, facing +z, 0.13 tall to her torch's flame.
function liberty(y: number, CU: number): G[] {
  const out: G[] = [];
  // The robe: a long tapering cylinder pressed into deep folds.
  const robe = new THREE.CylinderGeometry(0.0085, 0.0125, 0.062, 24, 6, true);
  const p = robe.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), yy = p.getY(i), a = Math.atan2(z, x), k = 1 + 0.085 * Math.sin(a * 7 + yy * 60) + 0.04 * Math.sin(a * 13);
    p.setXYZ(i, x * k, yy, z * k * 0.9);
  }
  robe.computeVertexNormals();
  out.push(P(robe.translate(0, 0.031, 0), CU, { y }));
  // The torso and the toga thrown over the left shoulder.
  out.push(P(new THREE.CylinderGeometry(0.0075, 0.0088, 0.022, 12, 1, true).translate(0, 0.011, 0), shade(CU, 1.04), { y: y + 0.061, sz: 0.85 }));
  out.push(ball(0.0062, shade(CU, 0.95), { x: -0.0035, y: y + 0.078, z: 0.001, sx: 1.2, sz: 0.9 }, 1));
  out.push(P(new THREE.CylinderGeometry(0.004, 0.0105, 0.04, 10, 1, true).translate(0, 0.02, 0), shade(CU, 0.92), { x: -0.003, y: y + 0.04, z: 0.004, rz: -0.12, rx: 0.1, sz: 0.5 }));
  // Neck, head, the crown and its seven rays.
  out.push(cyl(0.0026, 0.0024, 0.005, 8, CU, { y: y + 0.083 }));
  out.push(ball(0.0045, shade(CU, 1.06), { y: y + 0.0915, sy: 1.12 }, 1));
  out.push(drumC(0.0047, 0.0049, 0.0022, 12, shade(CU, 0.95), { y: y + 0.0935 }));
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + ((k - 3) / 3) * 1.45, d = V(Math.cos(a), 0.55, Math.sin(a)).normalize();
    const b = V(Math.cos(a) * 0.0046, y + 0.0948, Math.sin(a) * 0.0046);
    out.push(rod(b, b.clone().addScaledVector(d, 0.0072), 0.0007, shade(CU, 1.1), 3, 0.0001));
  }
  // The right arm raised, the torch: its handle, the gilded cup and flame.
  const sh = V(0.0072, y + 0.08, 0.0005), el = V(0.0102, y + 0.1, 0.0015), hd = V(0.0112, y + 0.118, 0.0025);
  out.push(rod(sh, el, 0.0024, CU, 7, 0.002), rod(el, hd, 0.002, CU, 7, 0.0018), ball(0.0019, CU, { x: hd.x, y: hd.y, z: hd.z }));
  out.push(rod(hd, V(hd.x + 0.0006, hd.y + 0.009, hd.z), 0.0013, shade(CU, 1.05), 7, 0.0016));
  out.push(P(new THREE.CylinderGeometry(0.0038, 0.0018, 0.0035, 12, 1, false).translate(0, 0.00175, 0), GOLD, { x: hd.x + 0.0006, y: hd.y + 0.009, z: hd.z }));
  out.push(P(new THREE.OctahedronGeometry(0.0034, 1), 0xf3c24a, { x: hd.x + 0.0006, y: hd.y + 0.016, z: hd.z, sy: 1.6 }));
  // The left arm bent, holding the tablet against her side.
  const ls = V(-0.0072, y + 0.079, 0.0005), le = V(-0.0102, y + 0.066, 0.0035), lh = V(-0.0078, y + 0.07, 0.0085);
  out.push(rod(ls, le, 0.0022, CU, 7, 0.0019), rod(le, lh, 0.0019, CU, 7, 0.0016));
  out.push(...box(0.0034, 0.016, 0.0095, shade(CU, 1.08), { x: -0.0102, y: y + 0.058, z: 0.0055, rz: -0.18 }));
  // Her feet showing under the hem, a broken chain.
  out.push(ball(0.0024, CU, { x: 0.004, y: y + 0.001, z: 0.009, sz: 1.6, sy: 0.6 }));
  return out;
}

// ---------- Barcelona: the Sagrada Família ----------

// A Gaudí bell tower: a slender paraboloid of stone, louvred openings
// winding up it, a mosaic pinnacle of bright knots and a cross at its tip.
function gaudiSpire(x: number, z: number, y0: number, h: number, r: number, c: number, seed: number, crown = true): G[] {
  const out: G[] = [], rr = rnd(seed), pts: THREE.Vector2[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector2(r * Math.pow(1 - t * 0.94, 0.62), t * h)); }
  out.push(P(new THREE.LatheGeometry(pts, 10), c, { x, y: y0, z }));
  // The openings, winding up.
  const m = Math.floor(h / 0.0045);
  for (let k = 1; k < m - 2; k++) {
    const t = k / m, a = k * 1.15 + rr() * 0.3, rad = r * Math.pow(1 - t * 0.94, 0.62) + 0.0002, yy = y0 + t * h;
    out.push(pane(rad * 0.55, 0.0026, 0x3a302a, x + Math.sin(a) * rad, yy, z + Math.cos(a) * rad, a));
  }
  if (crown) {
    const top = y0 + h * 0.94;
    out.push(ball(r * 0.42, 0xe8e2d4, { x, y: top, z }, 1));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; out.push(ball(r * 0.18, [0xc23a2a, 0xe8c84a, 0xf0ece4][k % 3]!, { x: x + Math.cos(a) * r * 0.36, y: top + r * 0.1, z: z + Math.sin(a) * r * 0.36 })); }
    out.push(ball(r * 0.22, 0xc23a2a, { x, y: top + r * 0.5, z }), rod(V(x, top + r * 0.6, z), V(x, top + r * 1.35, z), r * 0.06, 0xe8c84a, 3));
  }
  return out;
}
// The basilica on its cross plan: the nave and aisles with their windows
// of coloured glass and roofs of little lanterns; the Nativity façade to
// one side, rich and dripping, its four towers and the green cypress with
// its doves; the Passion façade to the other, stark under its leaning bone
// columns; the Glory façade at the front still rising in scaffolding,
// cranes over it; the towers of the Evangelists round the great tower of
// Jesus with its cross, Mary's tower and its star over the apse (about 10
// cells tall on its pad).
function sagradaFamilia(): G[] {
  const out: G[] = [], ST = 0xc2a988, NAT = 0xa18a6c, PAS = 0xd6c6a8, r = rnd(53);
  const glass = [0x3a6ab0, 0x3a9a6a, 0xd8803a, 0xc23a4a, 0xe8c84a];
  // The nave (along z) and aisles, the transept (along x).
  const nz0 = -0.044, nz1 = 0.04, nw = 0.026, aw = 0.046, nh = 0.05, ah = 0.03, tz = -0.004, tw = 0.03, tx = 0.05;
  out.push(...box(aw, ah, nz1 - nz0 - 0.002, ST, { z: (nz0 + nz1) / 2 }, shade(ST, 0.9)));
  out.push(...box(nw, nh, nz1 - nz0, shade(ST, 1.03), { z: (nz0 + nz1) / 2 }, shade(ST, 0.92)));
  out.push(...box(2 * tx, nh, tw, shade(ST, 1.01), { z: tz }, shade(ST, 0.92)));
  // Windows: tall, of coloured glass, along the clerestory and the aisles.
  for (const s of [-1, 1]) {
    const ry = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let k = 0; k < 7; k++) {
      const zz = nz0 + 0.006 + k * 0.0118;
      if (Math.abs(zz - tz) < tw / 2 + 0.002) continue;
      out.push(...archPane(0.0042, 0.016, glass[k % glass.length]!, s * (nw / 2 + 0.0003), ah + 0.003, zz, ry));
      out.push(...archPane(0.0046, 0.018, glass[(k + 2) % glass.length]!, s * (aw / 2 + 0.0003), 0.006, zz, ry));
    }
    for (const zz of [tz - 0.008, tz, tz + 0.008]) out.push(...archPane(0.0045, 0.024, glass[(Math.round(zz * 1000) + 5) % 5]!, s * (tx - 0.012), 0.012, zz, ry).map((g) => g.translate(s * 0.0003, 0, 0)));
  }
  // Roofs: the nave's steep ridge, rows of lanterns along it and over the aisles.
  out.push(...gable(nw + 0.002, nz1 - nz0, 0.014, shade(ST, 0.88), { y: nh, z: (nz0 + nz1) / 2 }, true, shade(ST, 0.95)));
  out.push(...gable(2 * tx, tw + 0.002, 0.014, shade(ST, 0.88), { y: nh, z: tz }, false, shade(ST, 0.95)));
  for (let k = 0; k < 9; k++) {
    const zz = nz0 + 0.004 + k * 0.0098;
    for (const s of [-1, 1]) out.push(cone(0.0028, 0.012, 6, shade(ST, 1.05), { x: s * (aw / 2 - 0.004), y: ah, z: zz }), ball(0.0012, glass[k % 5]!, { x: s * (aw / 2 - 0.004), y: ah + 0.0125, z: zz }));
  }
  // The apse: a half round at the back, a crown of pinnacles.
  out.push(P(new THREE.CylinderGeometry(nw / 2 + 0.008, nw / 2 + 0.008, 0.042, 14, 1, true, Math.PI / 2, Math.PI).translate(0, 0.021, 0), ST, { z: nz0 }));
  for (let k = 0; k <= 6; k++) { const a = Math.PI + (k / 6) * Math.PI, rr = nw / 2 + 0.008; out.push(...gaudiSpire(Math.cos(a) * rr, nz0 + Math.sin(a) * rr, 0.042, 0.022, 0.0028, ST, 200 + k, false), ball(0.0016, glass[k % 5]!, { x: Math.cos(a) * rr, y: 0.0635, z: nz0 + Math.sin(a) * rr })); }
  // The Nativity façade (+x): three portals, its dripping stone, the cypress with doves; four towers.
  const fx = tx + 0.003;
  out.push(...box(0.008, 0.04, tw + 0.008, NAT, { x: fx, z: tz }));
  for (const [zz, w] of [[tz - 0.0095, 0.006], [tz, 0.008], [tz + 0.0095, 0.006]] as const) out.push(...archPane(w, 0.018, 0x2e2622, fx + 0.0043, 0, zz, Math.PI / 2));
  const drips: THREE.Vector3[] = [];
  for (let k = 0; k < 60 && drips.length < 40; k++) {
    const p = V(fx + 0.004 + r() * 0.0015, 0.02 + r() * 0.022, tz + (r() - 0.5) * 0.034);
    if (drips.some((q) => q.distanceTo(p) < 0.0034)) continue;
    drips.push(p);
    out.push(P(new THREE.IcosahedronGeometry(0.0012 + r() * 0.0016, 0).rotateY(r() * 6).rotateX(r() * 6), shade(NAT, 0.85 + r() * 0.3), { x: p.x, y: p.y, z: p.z, sy: 1.6 }));
  }
  out.push(cone(0.0045, 0.018, 8, 0x3f6a3a, { x: fx + 0.003, y: 0.04, z: tz }));
  for (let k = 0; k < 5; k++) out.push(ball(0.0007, 0xf4f0e8, { x: fx + 0.004 + r() * 0.002, y: 0.044 + r() * 0.012, z: tz + (r() - 0.5) * 0.006 }));
  // The Passion façade (−x): a canopy on six leaning bone columns, a stark frieze; four towers.
  const px = -tx - 0.003;
  out.push(...box(0.008, 0.04, tw + 0.008, PAS, { x: px, z: tz }));
  out.push(...box(0.012, 0.004, tw + 0.006, shade(PAS, 0.94), { x: px - 0.008, y: 0.028, z: tz }));
  for (let k = 0; k < 6; k++) { const zz = tz - 0.014 + k * 0.0056; out.push(rod(V(px - 0.012, 0, zz + (k % 2 ? 0.0015 : -0.0015)), V(px - 0.009, 0.028, zz), 0.0013, shade(PAS, 1.04), 6, 0.0018)); }
  for (const [zz, w] of [[tz - 0.0085, 0.006], [tz + 0.0085, 0.006]] as const) out.push(...archPane(w, 0.016, 0x2e2622, px - 0.0043, 0, zz, -Math.PI / 2));
  for (let k = 0; k < 6; k++) out.push(...box(0.0007, 0.005, 0.004, shade(PAS, 0.85), { x: px - 0.0044, y: 0.034, z: tz - 0.012 + k * 0.0048 }));
  // The façades' towers: four on each, the inner pair taller.
  for (const [cx, sign, c] of [[fx, 1, NAT], [px, -1, PAS]] as const) {
    for (const [o, hh] of [[-0.0135, 0.15], [-0.0045, 0.162], [0.0045, 0.162], [0.0135, 0.15]] as const) out.push(...gaudiSpire(cx + sign * 0.001, tz + o, 0.04, hh - 0.04, 0.0042, c, Math.round((cx + o) * 9999)));
  }
  // The Glory façade (+z): its towers' stumps in scaffolding, the portico going up.
  const gz = nz1 + 0.004;
  out.push(...box(nw + 0.012, 0.03, 0.008, shade(ST, 1.06), { z: gz }));
  for (const t of [-0.009, -0.003, 0.003, 0.009]) out.push(...archPane(0.0045, 0.014, 0x2e2622, t, 0, gz + 0.0043));
  for (const o of [-0.0135, -0.0045, 0.0045, 0.0135]) {
    out.push(...gaudiSpire(o, gz, 0.03, 0.09, 0.0042, shade(ST, 1.08), 300 + Math.round(o * 1e4), false).slice(0, 1).map((g) => { g.computeBoundingBox(); return g; }));
  }
  out.push(...box(nw + 0.016, 0.0005, 0.012, 0x7a6a50, { y: 0.06, z: gz }));
  for (const x of [-0.019, -0.009, 0.0, 0.009, 0.019]) for (const zz of [gz - 0.006, gz + 0.006]) out.push(rod(V(x, 0, zz), V(x, 0.072, zz), 0.0003, 0x6a5a48, 3));
  for (const y of [0.024, 0.048, 0.072]) for (const zz of [gz - 0.006, gz + 0.006]) out.push(rod(V(-0.019, y, zz), V(0.019, y, zz), 0.00025, 0x6a5a48, 3));
  // The Evangelists' towers round the tower of Jesus; Mary's over the apse.
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const x = sx * 0.0165, zz = tz + sz * 0.0165;
    out.push(...gaudiSpire(x, zz, nh, 0.135, 0.0058, shade(ST, 1.04), 400 + sx * 7 + sz * 3, false));
    out.push(ball(0.003, [0xe8c84a, 0xc23a2a, 0xf0ece4, 0x3a6ab0][(sx + 1 + (sz + 1) / 2) % 4]!, { x, y: nh + 0.133, z: zz }, 1));
  }
  out.push(...gaudiSpire(0, nz0 + 0.004, nh, 0.148, 0.0068, shade(ST, 1.04), 501, false));
  out.push(P(new THREE.OctahedronGeometry(0.0045, 0), 0xf0ece4, { y: nh + 0.15, z: nz0 + 0.004 }), P(new THREE.OctahedronGeometry(0.0045, 0), 0xe8c84a, { y: nh + 0.15, z: nz0 + 0.004, ry: Math.PI / 4, rx: Math.PI / 4 }));
  out.push(...gaudiSpire(0, tz, nh, 0.205, 0.009, shade(ST, 1.06), 777, false));
  const ct = nh + 0.205;
  out.push(...box(0.0024, 0.016, 0.0024, 0xf4f0e8, { y: ct - 0.004, z: tz }), ...box(0.012, 0.0024, 0.0024, 0xf4f0e8, { y: ct + 0.006, z: tz }), ...box(0.0024, 0.0024, 0.012, 0xf4f0e8, { y: ct + 0.006, z: tz }));
  // (Raised to about 10 cells tall on its pad, a little wider.)
  for (const g of out) g.scale(1.08, 1.46, 1.08);
  // Two tower cranes over the building site.
  return [pad(), ...out, ...crane(0.042, 0.064, 0.3, 2.498, 0xe0b030, 0.07), ...crane(-0.058, -0.058, 0.26, -0.927, 0xc84a32, 0.06)];
}
// A tower crane: a lattice mast, the cab, the jib turned to ry and its counter-jib, a hook on its cable.
function crane(x: number, z: number, h: number, ry: number, c: number, jib: number): G[] {
  const out: G[] = [], m = 0.0018;
  const cs = [V(x - m, 0, z - m), V(x + m, 0, z - m), V(x + m, 0, z + m), V(x - m, 0, z + m)];
  for (const p of cs) out.push(rod(p, V(p.x, h, p.z), 0.00035, c, 3));
  const n = Math.round(h / 0.008);
  for (let i = 0; i < n; i++) {
    const y0 = (i * h) / n, y1 = ((i + 1) * h) / n;
    for (let k = 0; k < 4; k++) { const a = cs[k]!, b = cs[(k + 1) % 4]!; out.push(rod(V(a.x, y0, a.z), V(b.x, y1, b.z), 0.0002, c, 3)); }
  }
  const dx = Math.cos(ry), dz = -Math.sin(ry);
  out.push(...box(0.004, 0.004, 0.004, shade(c, 0.9), { x, y: h, z, ry }));
  out.push(rod(V(x, h + 0.003, z), V(x + dx * jib, h + 0.003, z + dz * jib), 0.0011, c, 3), rod(V(x, h + 0.003, z), V(x - dx * jib * 0.3, h + 0.003, z - dz * jib * 0.3), 0.0011, c, 3));
  out.push(rod(V(x, h + 0.003, z), V(x, h + 0.012, z), 0.0006, c, 3), rod(V(x, h + 0.012, z), V(x + dx * jib, h + 0.0035, z + dz * jib), 0.0002, 0x3a3a3a, 3), rod(V(x, h + 0.012, z), V(x - dx * jib * 0.3, h + 0.0035, z - dz * jib * 0.3), 0.0002, 0x3a3a3a, 3));
  out.push(...box(0.004, 0.004, 0.004, 0x8a8a84, { x: x - dx * jib * 0.27, y: h, z: z - dz * jib * 0.27 }));
  const hx = x + dx * jib * 0.6, hz = z + dz * jib * 0.6;
  out.push(rod(V(hx, h + 0.002, hz), V(hx, h * 0.55, hz), 0.00015, 0x2a2a2a, 3), ...box(0.004, 0.003, 0.003, 0xb8a88e, { x: hx, y: h * 0.55 - 0.003, z: hz }));
  return out;
}

// ---------- Berlin: the Brandenburg Gate ----------

// Twelve Doric columns in two rows making five passages, the widest in the
// middle; the entablature with its triglyphs, the stepped attic with its
// reliefs, the Quadriga in copper on top.
function brandenburgGate(): G[] {
  const out: G[] = [], S = 0xddd2bc, CU = 0x6f9e88;
  // The gate: twelve columns, walls between the pairs, the entablature, the attic.
  const xs = [-0.042, -0.0265, -0.0105, 0.0105, 0.0265, 0.042], zf = 0.0095, ch = 0.034, cr = 0.0021, y0 = 0.004;
  out.push(...steps(0.108, 0.034, 2, 0.002, 0.0015, shade(S, 0.92), {}).parts);
  for (const x of xs) {
    for (const z of [-zf, zf]) out.push(...column(x, y0, z, cr, ch, S, 'doric'));
    out.push(...box(0.0034, ch - 0.0006, 2 * zf - 0.004, shade(S, 0.95), { x, y: y0 }));
  }
  const ye = y0 + ch, ew = 0.098, ed = 0.03;
  out.push(...box(ew, 0.004, ed, S, { y: ye }));
  out.push(...box(ew + 0.001, 0.0045, ed + 0.001, shade(S, 1.02), { y: ye + 0.004 }));
  for (const s of [-1, 1]) for (let k = 0; k < 26; k++) out.push(pane(0.0016, 0.0045, shade(S, 0.82), -ew / 2 + 0.0019 + k * ((ew - 0.0038) / 25), ye + 0.004, s * (ed / 2 + 0.0008), s > 0 ? 0 : Math.PI));
  out.push(...box(ew + 0.005, 0.0022, ed + 0.005, shade(S, 1.04), { y: ye + 0.0085 }, shade(S, 0.95)));
  const ya = ye + 0.0107;
  out.push(...box(ew - 0.004, 0.006, ed - 0.004, S, { y: ya }));
  out.push(...box(0.05, 0.004, ed - 0.006, shade(S, 1.02), { y: ya + 0.006 }));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) out.push(pane(0.012, 0.0036, shade(S, 0.88), -0.04 + k * 0.02, ya + 0.0012, s * ((ed - 0.004) / 2 + 0.0003), s > 0 ? 0 : Math.PI));
    out.push(pane(0.044, 0.0026, shade(S, 0.86), 0, ya + 0.0068, s * ((ed - 0.006) / 2 + 0.0003), s > 0 ? 0 : Math.PI));
  }
  // The Quadriga: four horses abreast, the chariot, Victoria with her staff and its wreath.
  const yq = ya + 0.01;
  out.push(...box(0.02, 0.0025, 0.01, shade(S, 0.95), { y: yq }));
  for (const x of [-0.0066, -0.0022, 0.0022, 0.0066]) out.push(...horse(x, 0.002, yq + 0.0025, 0.0062, CU));
  out.push(...box(0.008, 0.004, 0.005, shade(CU, 0.9), { y: yq + 0.0025, z: -0.003 }));
  out.push(drumC(0.0014, 0.0014, 0.0006, 8, shade(CU, 0.85), { x: -0.0042, y: yq + 0.0025, z: -0.003 }));
  out.push(...figure(0, -0.003, 0.011, CU, { y: yq + 0.006, skin: CU, arm: 1 }));
  out.push(rod(V(0.0018, yq + 0.012, -0.003), V(0.0022, yq + 0.024, -0.0025), 0.0003, shade(CU, 0.9), 3), P(new THREE.TorusGeometry(0.0018, 0.0004, 4, 10), shade(CU, 1.1), { x: 0.0022, y: yq + 0.025, z: -0.0025 }));
  // (About 2.5 cells tall on its pad.)
  for (const g of out) g.scale(1.13, 1.13, 1.13);
  return [pad(), ...out];
}
// A horse, l long, facing +z, its hooves at y.
function horse(x: number, z: number, y: number, l: number, c: number): G[] {
  return [
    ball(l * 0.24, c, { x, y: y + l * 0.55, z, sz: 1.9, sx: 0.8 }),
    rod(V(x, y + l * 0.62, z + l * 0.32), V(x, y + l * 0.98, z + l * 0.5), l * 0.09, c, 4),
    ball(l * 0.1, c, { x, y: y + l * 0.98, z: z + l * 0.58, sz: 1.6 }),
    ...[[-0.06, 0.28], [0.06, 0.28], [-0.06, -0.28], [0.06, -0.28]].map(([dx, dz]) => rod(V(x + dx! * l, y, z + dz! * l + (dz! > 0 ? l * 0.1 : 0)), V(x + dx! * l, y + l * 0.5, z + dz! * l), l * 0.045, shade(c, 0.9), 3)),
  ];
}

// ---------- Bavaria: Neuschwanstein ----------

// The castle on its crag above the gorge: the red-brick gatehouse with its
// white corner turrets, the square tower and knights' house round the
// courtyard, the tall white Palas at the back with its gables, rows of
// arched windows and balconies, the slender stair tower and the north tower
// with their blue-grey cones, turrets at every corner; a few firs at the
// crag's foot. (Beside its city on hills.)
function neuschwanstein(): G[] {
  const out: G[] = [], WH = 0xeee8dc, ROOF = 0x56657a, BRICK = 0xb06a52, ROCK = 0x8a8478, r = rnd(71);
  // The crag: a mass of rock rising to the castle's terrace.
  const y0 = 0.026;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, d = 0.036 + r() * 0.012;
    const R = 0.012 + r() * 0.006, sy = 0.5 + r() * 0.3;
    out.push(P(new THREE.DodecahedronGeometry(R, 0), shade(ROCK, 0.85 + r() * 0.25), { x: Math.cos(a) * d * 0.75, y: R * sy, z: Math.sin(a) * d - 0.004, sy, ry: r() * 6 }));
  }
  out.push(...frustum(0.074, 0.13, 0.06, 0.118, y0, ROCK, { z: -0.004 }, shade(ROCK, 0.95)));
  // Its faces broken into crags and ledges, boulders at its foot.
  for (const [ry, half0, half1, len] of [[0, 0.065, 0.059, 0.066], [Math.PI, 0.065, 0.059, 0.066], [Math.PI / 2, 0.037, 0.03, 0.12], [-Math.PI / 2, 0.037, 0.03, 0.12]] as const) {
    const { nx, nz, tx, tz } = frame(ry), n = Math.round(len / 0.011);
    for (const y of [0.006, 0.015, 0.022]) for (let k = 0; k < n; k++) {
      const t = -len / 2 + ((k + 0.3 + r() * 0.4) * len) / n, o = half0 + ((half1 - half0) * y) / y0, R = 0.0055 + r() * 0.004;
      out.push(P(new THREE.DodecahedronGeometry(R, 0).rotateY(r() * 6).rotateX(r() * 6), shade(ROCK, 0.8 + r() * 0.35), { x: nx * (o + R * 0.15) + tx * t, y, z: -0.004 + nz * (o + R * 0.15) + tz * t, sy: 0.8 }));
    }
  }
  // A few firs clinging to the crag's foot.
  const firs: [number, number][] = [];
  for (let k = 0; k < 30 && firs.length < 12; k++) {
    const a = r() * Math.PI * 2, d = 0.05 + r() * 0.012, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) > H - 0.004 || Math.abs(z) > H - 0.004 || firs.some(([u, v]) => Math.hypot(u - x, v - z) < 0.007)) continue;
    firs.push([x, z]);
    out.push(...fir(x, z, 0.014 + r() * 0.01, 0, shade(0x3d5a38, 0.85 + r() * 0.3)));
  }
  // The curtain walls round the terrace, with merlons.
  const tw = 0.058, td = 0.114, tzc = -0.004;
  out.push(ring(tw, 0.006, td, shade(WH, 0.93), { y: y0, z: tzc }));
  out.push(...merlonsAlong(-tw / 2, tzc + td / 2, tw / 2, tzc + td / 2, y0 + 0.006, 0.0016, shade(WH, 0.93)));
  for (const s of [-1, 1]) out.push(...merlonsAlong(s * tw / 2, tzc - td / 2, s * tw / 2, tzc + td / 2, y0 + 0.006, 0.0016, shade(WH, 0.93)));
  // The gatehouse at the front: red brick, white corner turrets, the gate.
  const gz = 0.042;
  out.push(...box(0.04, 0.026, 0.012, BRICK, { y: y0, z: gz }));
  out.push(...archPane(0.007, 0.011, 0x2a2420, 0, y0, gz + 0.0063));
  out.push(...panes(0, gz, 0.0063, 0, [-0.012, -0.006, 0.006, 0.012], [y0 + 0.012, y0 + 0.019], 0.0022, 0.004, 0x2c2a2a, true));
  out.push(...merlonsAlong(-0.02, gz + 0.0055, 0.02, gz + 0.0055, y0 + 0.026, 0.0018, shade(BRICK, 1.05)));
  out.push(...gable(0.03, 0.01, 0.008, ROOF, { y: y0 + 0.026, z: gz - 0.001 }, false, BRICK));
  for (const s of [-1, 1]) out.push(...turret(s * 0.021, gz + 0.006, y0, 0.0042, 0.034, WH, ROOF));
  // The square tower and the knights' house about the courtyard.
  out.push(...box(0.014, 0.05, 0.014, WH, { x: -0.017, y: y0, z: 0.016 }));
  out.push(...merlonsAlong(-0.024, 0.023, -0.010, 0.023, y0 + 0.05, 0.0017, WH), ...merlonsAlong(-0.024, 0.009, -0.024, 0.023, y0 + 0.05, 0.0017, WH));
  out.push(...panes(-0.017, 0.016, 0.0073, 0, [-0.003, 0.003], [y0 + 0.012, y0 + 0.024, y0 + 0.036], 0.0018, 0.005, 0x2c2a2a, true));
  out.push(...panes(-0.017, 0.016, 0.0073, Math.PI / 2, [0], [y0 + 0.018, y0 + 0.032], 0.0018, 0.005, 0x2c2a2a, true));
  out.push(...box(0.02, 0.026, 0.03, WH, { x: 0.016, y: y0, z: 0.014 }));
  out.push(...gable(0.022, 0.032, 0.012, ROOF, { x: 0.016, y: y0 + 0.026, z: 0.014 }, true, WH));
  out.push(...panes(0.016, 0.014, 0.0103, -Math.PI / 2, [-0.01, -0.0035, 0.0035, 0.01], [y0 + 0.006, y0 + 0.016], 0.002, 0.005, 0x2c2a2a, true));
  // The Palas: tall, its gables front and back, windows in rows, balconies.
  const px = 0.0, pzc = -0.036, pw = 0.05, pd = 0.024, ph = 0.06;
  out.push(...box(pw, ph, pd, WH, { x: px, y: y0, z: pzc }));
  for (const ry of [0, Math.PI]) {
    out.push(...panes(px, pzc, pd / 2 + 0.0003, ry, spread(7, pw - 0.008), [y0 + 0.008, y0 + 0.02, y0 + 0.032], 0.0024, 0.0065, 0x2c2a2a, true));
    out.push(...panes(px, pzc, pd / 2 + 0.0003, ry, spread(9, pw - 0.008), [y0 + 0.044], 0.0018, 0.008, 0x2c2a2a, true));
    const { nz } = frame(ry);
    for (const yb of [y0 + 0.017, y0 + 0.041]) out.push(...box(pw - 0.0006, 0.0012, 0.0012, shade(WH, 0.9), { x: px, y: yb, z: pzc + nz * (pd / 2 + 0.0004) }));
    out.push(...box(0.016, 0.0014, 0.004, shade(WH, 0.9), { x: px, y: y0 + 0.03, z: pzc + nz * (pd / 2 + 0.002) }));
  }
  out.push(...gable(pw + 0.002, pd + 0.002, 0.022, ROOF, { x: px, y: y0 + ph, z: pzc }, false, WH));
  // The great gable facing the courtyard, the dormers, the chapel's crossing.
  out.push(...box(0.016, 0.022, 0.006, WH, { x: 0, y: y0 + ph - 0.006, z: pzc + pd / 2 + 0.002 }));
  out.push(...gable(0.016, 0.006, 0.012, ROOF, { x: 0, y: y0 + ph + 0.016, z: pzc + pd / 2 + 0.002 }, true, WH));
  out.push(...panes(0, pzc + pd / 2 + 0.002, 0.0033, 0, [-0.004, 0, 0.004], [y0 + ph + 0.002], 0.0018, 0.008, 0x2c2a2a, true));
  for (const t of [-0.017, 0.017]) out.push(...box(0.005, 0.005, 0.004, WH, { x: t, y: y0 + ph + 0.004, z: pzc + pd / 2 - 0.002 }), ...gable(0.006, 0.005, 0.004, ROOF, { x: t, y: y0 + ph + 0.009, z: pzc + pd / 2 - 0.002 }, true, WH));
  out.push(...turret(0, pzc - pd / 2 - 0.002, y0 + ph + 0.012, 0.0022, 0.008, WH, ROOF));
  // Turrets at the Palas's corners.
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) out.push(...turret(px + sx * (pw / 2 + 0.0008), pzc + sz * (pd / 2 + 0.0008), y0 + ph - 0.016, 0.0026, 0.022, WH, ROOF));
  // The stair tower: tall and round, its cone, turrets round its top.
  const sx0 = -0.02, sz0 = pzc + pd / 2 + 0.004;
  out.push(...turret(sx0, sz0, y0, 0.0062, 0.09, WH, ROOF, 0.026));
  for (let k = 0; k < 5; k++) out.push(pane(0.0016, 0.006, 0x2c2a2a, sx0 + Math.sin(k * 0.6 - 1.2) * 0.0064, y0 + 0.02 + k * 0.014, sz0 + Math.cos(k * 0.6 - 1.2) * 0.0064, k * 0.6 - 1.2));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5; out.push(...turret(sx0 + Math.cos(a) * 0.0068, sz0 + Math.sin(a) * 0.0068, y0 + 0.078, 0.0018, 0.008, WH, ROOF)); }
  // The north tower at the back corner, the bower along the side.
  out.push(...turret(0.026, pzc - 0.012, y0, 0.0055, 0.074, WH, ROOF, 0.022));
  out.push(...box(0.014, 0.04, 0.026, WH, { x: -0.0205, y: y0, z: -0.008 }));
  out.push(...gable(0.016, 0.028, 0.01, ROOF, { x: -0.0205, y: y0 + 0.04, z: -0.008 }, true, WH));
  out.push(...panes(-0.0205, -0.008, 0.0073, -Math.PI / 2, [-0.008, 0, 0.008], [y0 + 0.012, y0 + 0.026], 0.002, 0.006, 0x2c2a2a, true));
  return out;
}

export const INDUSTRIAL: Models<'eiffelTower' | 'neuschwanstein' | 'bigBen' | 'statueOfLiberty' | 'sagradaFamilia' | 'brandenburgGate'> = {
  eiffelTower,
  neuschwanstein,
  bigBen,
  statueOfLiberty,
  sagradaFamilia,
  brandenburgGate,
};
