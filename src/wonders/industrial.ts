// The Industrial era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z. Those in a city keep their own
// proportions; the Statue of Liberty stands on its island in the sea beside
// its city (origin at the water line), Neuschwanstein on its crag on hills
// beside it.

import * as THREE from 'three';
import { frustum, gable, prism, ring, spire } from '../houseKit.ts';
import {
  P, V, H, archPane, ball, box, column, cone, cyl, disc, drumC, flat, islet, pane, rnd, rod, shade, statue, steps,
  type G, type Models,
} from './kit.ts';
import { LIBERTY } from './statues.ts';

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

// Not to the real proportions: remade stout to fill its square lot, every
// storey as tall as a town storey. The palace, two tall storeys of
// Perpendicular Gothic: stepped buttresses between its bays rising through
// the pierced parapet to pinnacles, a tall mullioned and transomed window
// in each bay over a blind panel, string courses; the steep lead roof with
// its dormers, iron cresting and flèches; the octagonal Central Tower on
// its ridge, a tall window in each face, pinnacles round its parapet, its
// stone spire with lucarnes. The Victoria Tower at the west end, square,
// its octagonal corner turrets banded at each storey and capped with
// spirelets, the Sovereign's Entrance in a deep porch, the bare flagpole
// with its gilded finial. At the east end the clock tower: three panelled storeys, the
// corbelled clock stage with its four gilded dials under gablets and
// pinnacles, the iron roof, the belfry's arches, the iron spire with its
// two tiers of lucarnes, lantern, orb and cross (about 6 cells tall).
const BB_GLASS = 0x363c45, BB_LEAD = 0x56625e, BB_IRON = 0x4c5a56;
const FOUR = [0, Math.PI / 2, Math.PI, -Math.PI / 2] as const;
// A pointed window or panel: w wide, its sides h tall, its point pk above
// them; its bottom middle at x, y, z, facing ry.
function lancet(w: number, h: number, pk: number, c: number, x: number, y: number, z: number, ry: number): G[] {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, h, 0, w / 2, h, 0, 0, h + pk, 0], 3));
  return [pane(w, h, c, x, y, z, ry), P(tri, c, { x, y, z, ry })];
}
// Perpendicular panelling on a face: its middle at (cx, cz), `o` out from
// it, facing ry, len wide, storeys between the heights ys, nb bays. Shafts
// between the bays (unless `noShafts`), a string course at each storey's
// foot but the first; in each bay and storey a tall pointed window in its
// moulded surround, a mullion and a transom, a blind panel under it (the
// storeys in `blind` all blind tracery; bays `skip` left bare).
function perpFace(cx: number, cz: number, o: number, ry: number, len: number, ys: readonly number[], nb: number, S: number,
  opt: { blind?: readonly number[]; skip?: (storey: number, bay: number) => boolean; noShafts?: boolean; win?: number } = {}): G[] {
  const { nx, nz, tx, tz } = frame(ry), out: G[] = [], bw = len / nb, y0 = ys[0]!, y1 = ys[ys.length - 1]!;
  const at = (t: number, off: number) => ({ x: cx + nx * (o + off) + tx * t, z: cz + nz * (o + off) + tz * t });
  if (!opt.noShafts) for (let k = 1; k < nb; k++) out.push(...box(0.0015, y1 - y0 + 0.0004, 0.0016, shade(S, 1.06), { ...at(-len / 2 + k * bw, 0.0006), y: y0, ry }));
  for (let i = 1; i < ys.length - 1; i++) out.push(...box(len, 0.0012, 0.0012, shade(S, 0.88), { ...at(0, 0.0005), y: ys[i]! - 0.0006, ry }));
  for (let i = 0; i < ys.length - 1; i++) {
    const sh = ys[i + 1]! - ys[i]!, w = bw * (opt.win ?? 0.56), yw = ys[i]! + sh * 0.2, h = sh * 0.52, pk = w * 0.6;
    const blind = opt.blind?.includes(i) ?? false, glass = blind ? shade(S, 0.84) : BB_GLASS;
    for (let b = 0; b < nb; b++) {
      if (opt.skip?.(i, b)) continue;
      const t = -len / 2 + (b + 0.5) * bw, a1 = at(t, 0.0003), a2 = at(t, 0.0005), a3 = at(t, 0.0007);
      out.push(...lancet(w + 0.0018, h + 0.0009, pk + 0.0011, shade(S, 1.08), a1.x, yw - 0.0009, a1.z, ry));
      out.push(...lancet(w, h, pk, glass, a2.x, yw, a2.z, ry));
      out.push(pane(0.00045, h + pk * 0.75, shade(S, 1.1), a3.x, yw, a3.z, ry), pane(w, 0.00045, shade(S, 1.1), a3.x, yw + h * 0.55, a3.z, ry));
      out.push(pane(w + 0.0018, sh * 0.2 - 0.0026, shade(S, 0.92), a1.x, ys[i]! + 0.0012, a1.z, ry));
    }
  }
  return out;
}
// An octagonal shaft (a turret, a pinnacle's stem) of apothem a, from y up h, its flat faces square to the axes.
const oct = (a: number, h: number, c: number, x: number, y: number, z: number) => cyl(a / Math.cos(Math.PI / 8), a / Math.cos(Math.PI / 8), h, 8, c, { x, y, z, ry: Math.PI / 8 });
// An octagonal spirelet of apothem a, h tall, on y.
const octCone = (a: number, h: number, c: number, x: number, y: number, z: number) => cone(a / Math.cos(Math.PI / 8), h, 8, c, { x, y, z, ry: Math.PI / 8 });
// A dormer facing ry: its cheeks and front, a little gable roof, its window.
function dormer(x: number, y: number, z: number, ry: number, S: number): G[] {
  const { nx, nz } = frame(ry);
  return [
    ...box(0.0046, 0.0062, 0.005, S, { x, y, z, ry }),
    ...gable(0.0056, 0.006, 0.0042, BB_LEAD, { x, y: y + 0.0062, z, ry: ry + Math.PI / 2 }, false, S),
    ...lancet(0.0022, 0.0026, 0.0012, BB_GLASS, x + nx * 0.00255, y + 0.0018, z + nz * 0.00255, ry),
  ];
}

function bigBen(): G[] {
  const out: G[] = [], S = 0xcdb98e, S2 = shade(S, 0.9), TRIM = shade(S, 1.07);
  // ----- the palace: two storeys, buttressed, the pierced parapet, the lead roof -----
  const x0 = -0.03, x1 = 0.038, z0 = -0.05, z1 = 0.024, pcx = (x0 + x1) / 2, pcz = (z0 + z1) / 2, pw = x1 - x0, pd = z1 - z0;
  const ys = [0.007, 0.041, 0.075] as const, ph = ys[2];
  out.push(...box(pw + 0.003, ys[0], pd + 0.003, S2, { x: pcx, z: pcz }));
  out.push(...box(pw, ph, pd, S, { x: pcx, z: pcz }));
  out.push(P(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(pw + 0.0024, 0.0055, pd + 0.0024), S, { x: pcx, y: ph, z: pcz }));
  out.push(...box(pw + 0.0034, 0.0012, pd + 0.0034, TRIM, { x: pcx, y: ph + 0.0055, z: pcz }));
  for (const [ry, len, o, nb] of [[0, pw, pd / 2, 6], [Math.PI, pw, pd / 2, 6], [Math.PI / 2, pd, pw / 2, 6]] as const) {
    const { nx, nz, tx, tz } = frame(ry), L = len - 0.002, bw = L / nb;
    const at = (t: number, off: number) => ({ x: pcx + nx * (o + off) + tx * t, z: pcz + nz * (o + off) + tz * t });
    out.push(...perpFace(pcx, pcz, o, ry, L, ys, nb, S, { noShafts: true }));
    // Buttresses: two stages (a weathering between), a pinnacle each over the parapet.
    for (let k = 0; k <= nb; k++) {
      const t = -L / 2 + k * bw;
      out.push(...box(0.0028, ys[1], 0.0034, shade(S, 1.04), { ...at(t, 0.0013), ry }));
      out.push(...box(0.0024, ph + 0.0058 - ys[1], 0.0024, shade(S, 1.04), { ...at(t, 0.0008), y: ys[1], ry }));
      out.push(spire(0.003, 0.011, shade(S, 1.06), { ...at(t, 0.0008), y: ph + 0.0058 }));
    }
    // The parapet's openwork: quatrefoils in a row between the buttresses.
    for (let b = 0; b < nb; b++) for (const f of [-0.3, 0, 0.3]) {
      const p = at(-L / 2 + (b + 0.5 + f) * bw, 0.0013);
      out.push(pane(0.0019, 0.0024, shade(S, 0.62), p.x, ph + 0.0016, p.z, ry));
    }
  }
  // The entrance pavilion in the middle of the front: a portal in three
  // orders, a great window over it, its gable with a niche, octagonal
  // turrets at its corners.
  {
    const ex = pcx, ew = 0.017, ed = 0.008, ez = z1 + ed / 2 - 0.001, eh = ph + 0.008, zf = z1 + ed - 0.001;
    out.push(...box(ew, eh, ed, S, { x: ex, z: ez }));
    out.push(...gable(ew, ed + 0.006, 0.013, BB_LEAD, { x: ex, y: eh, z: ez - 0.003 }, true, S));
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-ew / 2 - 0.0006, 0, 0, ew / 2 + 0.0006, 0, 0, 0, 0.0142, 0], 3));
    out.push(P(tri, TRIM, { x: ex, y: eh - 0.0004, z: zf + 0.0003 }));
    out.push(...lancet(0.0026, 0.0045, 0.0016, shade(S, 0.7), ex, eh + 0.002, zf + 0.0006, 0));
    out.push(...lancet(0.0128, 0.017, 0.0068, TRIM, ex, ys[0], zf + 0.0003, 0));
    out.push(...lancet(0.0098, 0.0162, 0.0052, shade(S, 0.9), ex, ys[0], zf + 0.0006, 0));
    out.push(...lancet(0.007, 0.0152, 0.0038, 0x2a2622, ex, ys[0], zf + 0.0009, 0));
    out.push(...lancet(0.0108, 0.021, 0.0062, TRIM, ex, ys[1] + 0.003, zf + 0.0003, 0));
    out.push(...lancet(0.0086, 0.0204, 0.005, BB_GLASS, ex, ys[1] + 0.0033, zf + 0.0006, 0));
    for (const t of [-0.0022, 0.0022]) out.push(pane(0.0004, 0.024, TRIM, ex + t, ys[1] + 0.0033, zf + 0.0008, 0));
    for (const y of [ys[1] + 0.012, ys[1] + 0.019]) out.push(pane(0.0086, 0.0004, TRIM, ex, y, zf + 0.0008, 0));
    out.push(...box(ew + 0.0006, 0.0012, ed + 0.0006, shade(S, 0.88), { x: ex, y: ys[1] - 0.0006, z: ez }));
    for (const s of [-1, 1]) {
      const tx = ex + s * ew / 2, tz = zf - 0.0004;
      out.push(oct(0.0026, eh + 0.012, shade(S, 1.04), tx, 0, tz), oct(0.0032, 0.0016, TRIM, tx, eh + 0.012, tz), octCone(0.003, 0.016, shade(S, 1.04), tx, eh + 0.0136, tz));
      for (const y of [ys[1], ph]) out.push(oct(0.0031, 0.0012, S2, tx, y - 0.0006, tz));
      out.push(rod(V(tx, eh + 0.029, tz), V(tx, eh + 0.033, tz), 0.0003, GOLD, 3));
    }
  }
  // The bit of the west end clear of the Victoria Tower.
  out.push(...perpFace(x0, 0.0105, 0, -Math.PI / 2, 0.025, ys, 2, S, { noShafts: true }), ...box(0.0034, ph + 0.0058, 0.0024, shade(S, 1.04), { x: x0 - 0.0008, z: 0.0105 }));
  // The roof: steep lead, dormers on both slopes, the iron cresting, three flèches.
  const rh = 0.03, rd = pd - 0.002;
  out.push(...gable(pw - 0.002, rd, rh, BB_LEAD, { x: pcx, y: ph, z: pcz }, false, S));
  for (const s of [1, -1]) for (const x of [-0.019, -0.009, 0.017, 0.028]) {
    const u = rd / 2 - 0.009, y = ph + rh * (1 - (u + 0.001) / (rd / 2)) - 0.0012;
    out.push(...dormer(x, y, pcz + s * (u - 0.0015), s > 0 ? 0 : Math.PI, S));
  }
  out.push(rod(V(x0 + 0.002, ph + rh + 0.0004, pcz), V(x1 - 0.002, ph + rh + 0.0004, pcz), 0.0005, BB_IRON, 4));
  for (let k = 0; k < 13; k++) out.push(spire(0.0008, 0.003, BB_IRON, { x: x0 + 0.004 + k * 0.005, y: ph + rh + 0.0006, z: pcz }));
  for (const x of [-0.02, 0.028]) out.push(oct(0.0018, 0.005, BB_LEAD, x, ph + rh - 0.001, pcz), octCone(0.0022, 0.014, BB_LEAD, x, ph + rh + 0.004, pcz), rod(V(x, ph + rh + 0.017, pcz), V(x, ph + rh + 0.021, pcz), 0.0003, GOLD, 3));

  // ----- the Central Tower: an octagonal lantern on the ridge, its stone spire -----
  const lx = 0.004, lz = pcz, la = 0.0125, ly0 = ph + 0.012, ly1 = ph + 0.052, lr = la / Math.cos(Math.PI / 8);
  out.push(drumC(lr, lr, ly1 - ly0, 8, S, { x: lx, y: ly0, z: lz, ry: Math.PI / 8 }));
  out.push(cyl(lr + 0.0008, lr + 0.0008, 0.0012, 8, S2, { x: lx, y: ly0 + 0.0095, z: lz, ry: Math.PI / 8 }));
  for (let k = 0; k < 8; k++) {
    const ry = (k * Math.PI) / 4, { nx, nz } = frame(ry), fx = lx + nx * la, fz = lz + nz * la;
    out.push(...lancet(0.0066, 0.016, 0.004, TRIM, fx + nx * 0.0003, ph + 0.0262, fz + nz * 0.0003, ry));
    out.push(...lancet(0.0048, 0.0154, 0.003, BB_GLASS, fx + nx * 0.0005, ph + 0.0268, fz + nz * 0.0005, ry));
    out.push(pane(0.0004, 0.0175, TRIM, fx + nx * 0.0007, ph + 0.0268, fz + nz * 0.0007, ry), pane(0.0048, 0.0004, TRIM, fx + nx * 0.0007, ph + 0.036, fz + nz * 0.0007, ry));
    // A buttress-shaft up each angle, a pinnacle on it over the parapet.
    const va = ry + Math.PI / 8, vx = lx + Math.sin(va) * (lr + 0.0004), vz = lz + Math.cos(va) * (lr + 0.0004);
    out.push(...box(0.0018, ly1 - ly0 + 0.004, 0.0018, shade(S, 1.05), { x: vx, y: ly0, z: vz, ry: va }));
    out.push(spire(0.0024, 0.01, shade(S, 1.06), { x: vx, y: ly1 + 0.004, z: vz }));
  }
  out.push(cyl(lr + 0.0006, lr + 0.0006, 0.004, 8, TRIM, { x: lx, y: ly1, z: lz, ry: Math.PI / 8 }));
  for (let k = 0; k < 8; k++) {
    const ry = (k * Math.PI) / 4, { nx, nz } = frame(ry);
    out.push(pane(0.003, 0.002, shade(S, 0.62), lx + nx * (la + 0.0007), ly1 + 0.001, lz + nz * (la + 0.0007), ry));
  }
  out.push(octCone(la - 0.001, 0.05, shade(S, 0.97), lx, ly1, lz));
  for (const ry of FOUR) {
    const { nx, nz } = frame(ry), d = la - 0.0033;
    out.push(...box(0.0034, 0.006, 0.004, shade(S, 0.97), { x: lx + nx * d, y: ly1 + 0.004, z: lz + nz * d, ry }));
    out.push(...gable(0.0042, 0.0046, 0.004, shade(S, 0.97), { x: lx + nx * d, y: ly1 + 0.01, z: lz + nz * d, ry: ry + Math.PI / 2 }));
    out.push(...lancet(0.0016, 0.0026, 0.001, BB_GLASS, lx + nx * (d + 0.0021), ly1 + 0.0055, lz + nz * (d + 0.0021), ry));
  }
  out.push(ball(0.0012, GOLD, { x: lx, y: ly1 + 0.05, z: lz }), rod(V(lx, ly1 + 0.049, lz), V(lx, ly1 + 0.058, lz), 0.0004, GOLD, 3));

  // ----- the Victoria Tower -----
  const vx = -0.049, vz = -0.022, vw = 0.042, vys = [0.007, 0.052, 0.09, 0.128, 0.165] as const, vh = vys[4], ta = 0.005;
  out.push(...box(vw + 0.004, vys[0], vw + 0.004, S2, { x: vx, z: vz }));
  out.push(...box(vw, vh, vw, S, { x: vx, z: vz }));
  for (const ry of FOUR) {
    const { nx, nz, tx, tz } = frame(ry), o = vw / 2, L = vw - 2 * ta + 0.002, front = ry === 0;
    out.push(...perpFace(vx, vz, o, ry, L, vys, 3, S, { blind: [0], skip: (i) => front && i === 0 }));
    // The pierced parapet, pinnacles on its shafts.
    const pc = { x: vx + nx * (o + 0.0007), z: vz + nz * (o + 0.0007) };
    out.push(...box(L, 0.008, 0.0016, S, { ...pc, y: vh, ry }), ...box(L + 0.0006, 0.0012, 0.0024, TRIM, { ...pc, y: vh + 0.008, ry }));
    for (const f of [-1 / 3, 0, 1 / 3]) out.push(pane(0.006, 0.0042, shade(S, 0.6), pc.x + nx * 0.0009 + tx * f * L, vh + 0.0018, pc.z + nz * 0.0009 + tz * f * L, ry));
    for (const f of [-1 / 6, 1 / 6]) out.push(spire(0.0028, 0.013, shade(S, 1.06), { x: pc.x + tx * f * L, y: vh + 0.0092, z: pc.z + tz * f * L }));
  }
  // The Sovereign's Entrance: a deep porch, the arch in three orders, the royal arms, niches either side.
  {
    const zf = vz + vw / 2 + 0.004;
    out.push(...box(0.03, 0.048, 0.008, shade(S, 1.02), { x: vx, z: vz + vw / 2 }));
    out.push(...lancet(0.022, 0.024, 0.011, TRIM, vx, vys[0], zf + 0.0003, 0));
    out.push(...lancet(0.0175, 0.0225, 0.0088, shade(S, 0.9), vx, vys[0], zf + 0.0006, 0));
    out.push(...lancet(0.013, 0.021, 0.0066, 0x2a2622, vx, vys[0], zf + 0.0009, 0));
    out.push(pane(0.005, 0.0033, GOLD, vx, 0.0425, zf + 0.0003, 0), pane(0.03, 0.0012, TRIM, vx, 0.048 - 0.0018, zf + 0.0003, 0));
    for (const s of [-1, 1]) out.push(...lancet(0.0028, 0.011, 0.0018, shade(S, 0.78), vx + s * 0.0128, 0.016, zf + 0.0003, 0));
  }
  // The corner turrets: octagons banded at each storey, open stages over the parapet, spirelets.
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const x = vx + sx * vw / 2, z = vz + sz * vw / 2, top = vh + 0.019;
    out.push(oct(ta, top, shade(S, 1.03), x, 0, z));
    for (const y of [vys[1], vys[2], vys[3], vh]) out.push(oct(ta + 0.0006, 0.0014, S2, x, y - 0.0007, z));
    for (const ry of [sx > 0 ? Math.PI / 2 : -Math.PI / 2, sz > 0 ? 0 : Math.PI]) {
      const { nx, nz } = frame(ry);
      out.push(...lancet(0.0026, 0.007, 0.0016, BB_GLASS, x + nx * (ta + 0.0002), vh + 0.0085, z + nz * (ta + 0.0002), ry));
    }
    out.push(oct(ta + 0.0007, 0.0018, TRIM, x, top, z), octCone(ta + 0.0004, 0.022, shade(S, 1.04), x, top + 0.0018, z));
    out.push(rod(V(x, top + 0.022, z), V(x, top + 0.027, z), 0.00035, GOLD, 3));
  }
  // The flagpole, bare, its gilded finial.
  out.push(rod(V(vx, vh, vz), V(vx, vh + 0.05, vz), 0.0005, 0xe8e8e8, 4), ball(0.001, GOLD, { x: vx, y: vh + 0.0505, z: vz }));

  // ----- the clock tower -----
  out.push(...clockTower(0.052, 0.018, S));
  // (All a little forward, to sit in the middle of the lot.)
  for (const g of out) g.translate(0, 0, 0.007);
  return [pad(), ...out];
}
function clockTower(x: number, z: number, S: number): G[] {
  const out: G[] = [], w = 0.032, S2 = shade(S, 0.9), TRIM = shade(S, 1.07), ys = [0.008, 0.045, 0.082, 0.118] as const, ca = 0.00225;
  // The shaft: a plinth, clasping angle shafts, three panelled storeys.
  out.push(...box(w + 0.005, ys[0], w + 0.005, S2, { x, z }));
  out.push(...box(w, ys[3], w, S, { x, z }));
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) out.push(...box(2 * ca, ys[3] + 0.0005, 2 * ca, shade(S, 1.05), { x: x + sx * w / 2, z: z + sz * w / 2 }));
  for (const ry of FOUR) out.push(...perpFace(x, z, w / 2, ry, w - 2 * ca + 0.002, ys, 2, S, { win: 0.6 }));
  // The clock stage, corbelled out: a gilded dial on each face over its inscription, a gablet over it, pinnacles at the corners.
  const wc = w + 0.005, yc = ys[3] + 0.004, hc = 0.044, cy = yc + 0.0235, R = 0.0135;
  out.push(...frustum(w + 0.0012, w + 0.0012, wc, wc, 0.004, S2, { x, y: ys[3], z }));
  out.push(...box(wc, hc, wc, shade(S, 1.03), { x, y: yc, z }));
  out.push(...box(wc + 0.0014, 0.0014, wc + 0.0014, S2, { x, y: yc + hc - 0.001, z }));
  for (const ry of FOUR) {
    const { nx, nz, tx, tz } = frame(ry), o = wc / 2, cx = x + nx * o, cz = z + nz * o;
    const L = (d: number) => ({ x: cx + nx * d, z: cz + nz * d });
    out.push(pane(0.032, 0.032, GOLD, L(0.0003).x, cy - 0.016, L(0.0003).z, ry));
    out.push(P(new THREE.CircleGeometry(R, 24), 0xf2ead2, { ...L(0.0005), y: cy, ry }));
    out.push(P(new THREE.RingGeometry(R - 0.0001, R + 0.0013, 24), 0x2a2620, { ...L(0.0006), y: cy, ry }));
    out.push(P(new THREE.RingGeometry(R * 0.42, R * 0.48, 12), shade(GOLD, 0.8), { ...L(0.0006), y: cy, ry }));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, rr = R * 0.83;
      out.push(P(new THREE.PlaneGeometry(0.0008, 0.0026), 0x2a2620, { x: cx + nx * 0.0007 + tx * Math.sin(a) * rr, y: cy + Math.cos(a) * rr, z: cz + nz * 0.0007 + tz * Math.sin(a) * rr, ry, rz: -a }));
    }
    const hand = (a: number, l: number, r: number) => rod(V(cx + nx * 0.001, cy, cz + nz * 0.001), V(cx + nx * 0.001 + tx * Math.sin(a) * l, cy + Math.cos(a) * l, cz + nz * 0.001 + tz * Math.sin(a) * l), r, 0x1a1816, 3);
    out.push(hand(2.1, 0.0075, 0.0005), hand(0, 0.0112, 0.00035));
    // Its inscription, gold letters on a dark band under the dial; the gablet with its finial over it.
    out.push(pane(0.03, 0.0026, 0x2a2f3a, L(0.0003).x, yc + 0.0018, L(0.0003).z, ry));
    for (let k = 0; k < 9; k++) out.push(pane(0.0018, 0.0012, GOLD, L(0.0005).x + tx * (k - 4) * 0.0032, yc + 0.0025, L(0.0005).z + tz * (k - 4) * 0.0032, ry));
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.016, 0, 0, 0.016, 0, 0, 0, 0.0095, 0], 3));
    out.push(P(tri, TRIM, { ...L(0.0002), y: yc + hc, ry }));
    out.push(...lancet(0.0042, 0.0022, 0.0026, shade(S, 0.8), L(0.0004).x, yc + hc + 0.0012, L(0.0004).z, ry));
    out.push(spire(0.0018, 0.006, GOLD, { ...L(0.0002), y: yc + hc + 0.0092 }));
  }
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const px = x + sx * wc / 2, pz = z + sz * wc / 2;
    out.push(oct(0.0026, hc + 0.007, shade(S, 1.05), px, yc, pz), octCone(0.0031, 0.014, shade(S, 1.05), px, yc + hc + 0.007, pz));
  }
  // The iron roof, then the belfry: three arches a side, the gallery, pinnacles.
  const wb = 0.027, yb = yc + hc + 0.003, hb = 0.022;
  out.push(...frustum(wc + 0.0008, wc + 0.0008, wb, wb, 0.006, BB_IRON, { x, y: yc + hc, z }));
  out.push(...box(wb, hb, wb, S, { x, y: yb, z }));
  for (const ry of FOUR) {
    const { nx, nz, tx, tz } = frame(ry), o = wb / 2;
    for (const t of [-0.0076, 0, 0.0076]) {
      const p = { x: x + nx * o + tx * t, z: z + nz * o + tz * t };
      out.push(...lancet(0.0062, 0.0115, 0.0034, TRIM, p.x + nx * 0.0003, yb + 0.0035, p.z + nz * 0.0003, ry));
      out.push(...lancet(0.0048, 0.0112, 0.0026, 0x24221f, p.x + nx * 0.0005, yb + 0.0038, p.z + nz * 0.0005, ry));
    }
    out.push(...box(wb + 0.0024, 0.0012, 0.0012, S2, { x: x + nx * (o + 0.0004), y: yb + 0.0024, z: z + nz * (o + 0.0004), ry }));
  }
  out.push(...box(wb + 0.004, 0.0018, wb + 0.004, TRIM, { x, y: yb + hb, z }));
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) out.push(spire(0.003, 0.01, shade(S, 1.05), { x: x + sx * (wb / 2 + 0.0006), y: yb + hb + 0.0018, z: z + sz * (wb / 2 + 0.0006) }));
  // The iron spire: two tiers of lucarnes, the lantern, the slender cap, orb and cross.
  const ys0 = yb + hb + 0.0018, sh = 0.036, sw0 = wb + 0.001, sw1 = 0.0072;
  out.push(...frustum(sw0, sw0, sw1, sw1, sh, BB_IRON, { x, y: ys0, z }));
  for (const ry of FOUR) {
    const { nx, nz } = frame(ry);
    for (const [f, s] of [[0.13, 1], [0.55, 0.62]] as const) {
      const hw = (sw0 + (sw1 - sw0) * f) / 2, d = hw - 0.0018 * s, y = ys0 + f * sh;
      out.push(...box(0.0052 * s, 0.0068 * s, 0.0048 * s, BB_IRON, { x: x + nx * d, y, z: z + nz * d, ry }));
      out.push(...gable(0.0062 * s, 0.0056 * s, 0.0042 * s, BB_IRON, { x: x + nx * d, y: y + 0.0068 * s, z: z + nz * d, ry: ry + Math.PI / 2 }));
      out.push(...lancet(0.0024 * s, 0.003 * s, 0.0014 * s, GOLD, x + nx * (d + 0.0024 * s + 0.0001), y + 0.0014 * s, z + nz * (d + 0.0024 * s + 0.0001), ry));
    }
  }
  const yl = ys0 + sh;
  out.push(...box(sw1 - 0.0008, 0.0068, sw1 - 0.0008, BB_IRON, { x, y: yl, z }));
  for (const ry of FOUR) { const { nx, nz } = frame(ry); out.push(pane(0.0036, 0.0046, GOLD, x + nx * (sw1 / 2 - 0.0002), yl + 0.0011, z + nz * (sw1 / 2 - 0.0002), ry)); }
  out.push(spire(sw1, 0.014, BB_IRON, { x, y: yl + 0.0068, z }));
  out.push(ball(0.0013, GOLD, { x, y: yl + 0.0215, z }), rod(V(x, yl + 0.02, z), V(x, yl + 0.029, z), 0.0004, GOLD, 4), rod(V(x - 0.0022, yl + 0.0262, z), V(x + 0.0022, yl + 0.0262, z), 0.00035, GOLD, 3));
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
  out.push(statue(LIBERTY, 0.145, CU, { y: y0 + ph + 0.009 }));
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

// In sandstone on its two steps: twelve Doric columns in two rows making
// five passages, the widest in the middle, the passages' sides walled
// (framed relief panels on the walls); the entablature, its triglyphs and
// metopes carved with centaurs and riders, guttae under the taenia, the
// mutuled cornice; the attic with its long relief panel front and back,
// smaller panels over the outer passages and at the ends; the stepped
// pedestal and on it the Quadriga in verdigris copper: four horses abreast,
// prancing, the chariot, Victoria with her wings spread, her staff raised
// with its wreath, iron cross and eagle. Either side, joined by low walls,
// the small guardhouses, each with a Doric portico of four columns front and
// back under its own triglyph frieze (about 2.6 cells tall).
const BG_STONE = 0xdac7a2, BG_CU = 0x6f9e88;
// A triangle a, b, c (one face).
function tri3(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, col: number): G {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3));
  return P(g, col);
}
// A Doric frieze's carving along a face: triglyphs (with their grooves and
// guttae) at the tangents ts, metopes with a relief between them. The face's
// middle at (cx, cz), o out from it, facing ry; the frieze from y, fh tall.
function doricFrieze(cx: number, cz: number, o: number, ry: number, ts: readonly number[], y: number, fh: number, S: number, s = 1): G[] {
  const { nx, nz, tx, tz } = frame(ry), out: G[] = [], tw = 0.0026 * s;
  const at = (t: number, off: number) => ({ x: cx + nx * (o + off) + tx * t, z: cz + nz * (o + off) + tz * t });
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    out.push(...box(tw, fh - 0.0002, 0.0008, shade(S, 0.92), { ...at(t, 0.0002), y, ry }));
    for (const g of [-tw / 6, tw / 6]) { const p = at(t + g, 0.00065); out.push(pane(0.00042 * s, fh - 0.0012 * s, shade(S, 0.7), p.x, y + 0.0004 * s, p.z, ry)); }
    const r = at(t, 0.0005);
    out.push(pane(tw, 0.0005 * s, shade(S, 0.86), r.x, y - 0.0012 * s, r.z, ry));
    if (i === ts.length - 1) break;
    // The metope: a smooth slab, a rider or a centaur on it.
    const m = (t + ts[i + 1]!) / 2, mw = ts[i + 1]! - t - tw - 0.0004, a = at(m, 0.0001), b = at(m, 0.0003), d = i % 2 ? -1 : 1;
    out.push(pane(mw, fh - 0.0012 * s, shade(S, 1.05), a.x, y + 0.0005 * s, a.z, ry));
    out.push(pane(mw * 0.62, fh * 0.17, shade(S, 0.86), b.x, y + fh * 0.28, b.z, ry));
    const c = at(m + d * mw * 0.16, 0.0003);
    out.push(pane(mw * 0.18, fh * 0.32, shade(S, 0.86), c.x, y + fh * 0.42, c.z, ry));
    for (const f of [-0.22, 0.22]) { const l = at(m + f * mw, 0.0003); out.push(pane(mw * 0.08, fh * 0.26, shade(S, 0.86), l.x, y + fh * 0.12, l.z, ry)); }
  }
  return out;
}
// Triglyph positions over the columns at xs and `k` between each pair (k
// from the gap), plus one at each end at ±end.
function triglyphsAt(xs: readonly number[], pitch: number, end?: number): number[] {
  const out: number[] = end === undefined ? [] : [-end];
  for (let i = 0; i < xs.length; i++) {
    out.push(xs[i]!);
    if (i < xs.length - 1) { const g = xs[i + 1]! - xs[i]!, n = Math.max(1, Math.round(g / pitch)); for (let k = 1; k < n; k++) out.push(xs[i]! + (g * k) / n); }
  }
  if (end !== undefined) out.push(end);
  return out;
}
// A framed relief panel on a face: the frame, the sunk field, n figures in a procession.
function reliefPanel(x: number, y: number, z: number, ry: number, w: number, h: number, n: number, S: number): G[] {
  const { nx, nz, tx, tz } = frame(ry), out: G[] = [
    pane(w, h, shade(S, 1.05), x + nx * 0.0002, y, z + nz * 0.0002, ry),
    pane(w - 0.0012, h - 0.0012, shade(S, 0.9), x + nx * 0.0004, y + 0.0006, z + nz * 0.0004, ry),
  ];
  for (let k = 0; k < n; k++) {
    const t = -w / 2 + 0.0012 + ((k + 0.5) * (w - 0.0024)) / n, fx = x + nx * 0.0006 + tx * t, fz = z + nz * 0.0006 + tz * t;
    if (k % 3 === 1) out.push(pane(((w - 0.0024) / n) * 0.7, (h - 0.0012) * 0.3, shade(S, 1.08), fx + tx * ((w - 0.0024) / n) * 0.3, y + 0.0006 + h * 0.18, fz + tz * ((w - 0.0024) / n) * 0.3, ry));
    out.push(pane(((w - 0.0024) / n) * 0.3, (h - 0.0012) * 0.78, shade(S, 1.08), fx, y + 0.0009, fz, ry));
  }
  return out;
}

function brandenburgGate(): G[] {
  const out: G[] = [], S = BG_STONE, S2 = shade(S, 0.9), LT = shade(S, 1.05), CU = BG_CU;
  // ----- the gate: its steps, twelve columns, the walled passages -----
  const st = steps(0.104, 0.036, 2, 0.0022, 0.0016, S2, {}, S), y0 = st.y;
  const xs = [-0.044, -0.0278, -0.011, 0.011, 0.0278, 0.044], zf = 0.0108, cr = 0.0024, ch = 0.039, ye = y0 + ch;
  for (const x of xs) {
    for (const z of [-zf, zf]) out.push(...column(x, y0, z, cr, ch, S, 'doric'));
    const wh = ch - 0.0048;
    out.push(...box(0.0042, wh, 2 * zf - 0.002, shade(S, 0.97), { x, y: y0 }));
    out.push(...box(0.0048, 0.0012, 2 * zf - 0.0036, LT, { x, y: y0 + wh - 0.0022 }));
    out.push(...box(0.0048, 0.0016, 2 * zf - 0.0036, S2, { x, y: y0 }));
    for (const s of [-1, 1]) out.push(...reliefPanel(x + s * 0.0021, y0 + 0.008, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0.0128, 0.016, 4, S));
  }
  // ----- the entablature -----
  const ew = 0.1, ed = 0.03;
  out.push(...box(ew, 0.0046, ed, S, { y: ye }));
  out.push(...box(ew + 0.0006, 0.0007, ed + 0.0006, LT, { y: ye + 0.0042 }));
  const fy = ye + 0.0049, fh = 0.0056, fw = ew - 0.0006, fd = ed - 0.0006;
  out.push(...box(fw, fh, fd, S, { y: fy }));
  const tf = triglyphsAt(xs, 0.0054, fw / 2 - 0.0016), ts = triglyphsAt([-zf, zf], 0.0054, fd / 2 - 0.0016);
  for (const ry of [0, Math.PI]) out.push(...doricFrieze(0, 0, fd / 2, ry, tf, fy, fh, S));
  for (const ry of [Math.PI / 2, -Math.PI / 2]) out.push(...doricFrieze(0, 0, fw / 2, ry, ts, fy, fh, S));
  out.push(...box(ew + 0.003, 0.0012, ed + 0.003, S2, { y: fy + fh }));
  out.push(...box(ew + 0.005, 0.0024, ed + 0.005, LT, { y: fy + fh + 0.0012 }, S));
  // ----- the attic: its reliefs, the stepped pedestal -----
  const ya = fy + fh + 0.0036, aw = ew - 0.004, ad = ed - 0.004, ah = 0.0095;
  out.push(...box(ew - 0.002, 0.0014, ed - 0.002, S2, { y: ya }));
  out.push(...box(aw, ah, ad, S, { y: ya + 0.0014 }));
  for (const s of [1, -1]) {
    const ry = s > 0 ? 0 : Math.PI, z = s * ad / 2;
    out.push(...reliefPanel(0, ya + 0.0028, z, ry, 0.05, 0.0068, 15, S));
    for (const x of [-0.036, 0.036]) out.push(...reliefPanel(x, ya + 0.0034, z, ry, 0.016, 0.0056, 4, S));
    out.push(...reliefPanel(s * aw / 2, ya + 0.0034, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0.016, 0.0056, 4, S));
  }
  const yac = ya + 0.0014 + ah;
  out.push(...box(aw + 0.0012, 0.0016, ad + 0.0012, LT, { y: yac }));
  out.push(...box(0.042, 0.0045, 0.02, S, { y: yac + 0.0016 }));
  for (const s of [1, -1]) out.push(...reliefPanel(0, yac + 0.0024, s * 0.01, s > 0 ? 0 : Math.PI, 0.03, 0.0028, 9, S));
  out.push(...box(0.044, 0.001, 0.022, LT, { y: yac + 0.0061 }));
  out.push(...box(0.032, 0.0022, 0.016, S2, { y: yac + 0.0071 }, S));
  const yq = yac + 0.0093;

  // ----- the Quadriga -----
  for (const [x, rear] of [[-0.0114, true], [-0.0038, false], [0.0038, false], [0.0114, true]] as const) out.push(...horse(x, 0.0022, yq, 0.011, CU, rear ? (x < 0 ? -1 : 1) : 0));
  const CU2 = shade(CU, 0.85), zc = -0.0058;
  // The chariot: its body, shell-fronted, two wheels, the pole.
  out.push(...box(0.0086, 0.0042, 0.0042, CU2, { y: yq + 0.0016, z: zc }));
  out.push(P(new THREE.CylinderGeometry(0.0043, 0.0043, 0.0042, 8, 1, true, -Math.PI / 2, Math.PI).rotateY(0).translate(0, 0.0021, 0), CU, { y: yq + 0.0016, z: zc + 0.0021, sz: 0.5 }));
  for (const s of [-1, 1]) out.push(P(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0006, 10).rotateZ(Math.PI / 2), CU2, { x: s * 0.0048, y: yq + 0.0026, z: zc }));
  out.push(rod(V(0, yq + 0.0028, zc + 0.002), V(0, yq + 0.0062, 0.0035), 0.0003, CU2, 4));
  // Victoria: her robe, her body and head, wings spread, the staff raised in her right hand.
  const vy = yq + 0.0042, vz2 = zc - 0.0002;
  out.push(cyl(0.0021, 0.001, 0.0088, 8, CU, { y: vy, z: vz2 }));
  out.push(drumC(0.001, 0.0008, 0.0034, 6, CU, { y: vy + 0.0088, z: vz2 }));
  out.push(ball(0.00085, CU, { y: vy + 0.0129, z: vz2 }, 1));
  for (const s of [-1, 1]) {
    const sh = V(s * 0.0008, vy + 0.011, vz2 - 0.0006);
    out.push(tri3(sh, V(s * 0.0036, vy + 0.0168, vz2 - 0.0026), V(s * 0.0022, vy + 0.0078, vz2 - 0.002), shade(CU, 1.06)));
    out.push(tri3(sh, V(s * 0.0024, vy + 0.0154, vz2 - 0.003), V(s * 0.0036, vy + 0.0168, vz2 - 0.0026), shade(CU, 0.95)));
  }
  out.push(rod(V(0.0009, vy + 0.0115, vz2), V(0.0022, vy + 0.0168, vz2 + 0.0004), 0.00035, CU, 4));
  out.push(rod(V(-0.0009, vy + 0.0112, vz2), V(-0.0016, vy + 0.0072, vz2 + 0.0026), 0.00035, CU, 4));
  out.push(rod(V(-0.0016, vy + 0.0072, vz2 + 0.0026), V(-0.0038, yq + 0.0085, 0.006), 0.00012, CU2, 3), rod(V(-0.0016, vy + 0.0072, vz2 + 0.0026), V(0.0038, yq + 0.0085, 0.006), 0.00012, CU2, 3));
  const sx = 0.0024, sTop = vy + 0.0215;
  out.push(rod(V(sx, vy + 0.0005, vz2 + 0.0004), V(sx, sTop, vz2 + 0.0004), 0.00025, CU2, 4));
  out.push(P(new THREE.TorusGeometry(0.0022, 0.00042, 4, 12), shade(CU, 1.08), { x: sx, y: sTop + 0.0022, z: vz2 + 0.0004 }));
  out.push(...box(0.0024, 0.0006, 0.0004, 0x3a3f3c, { x: sx, y: sTop + 0.0019, z: vz2 + 0.0004 }), ...box(0.0006, 0.0024, 0.0004, 0x3a3f3c, { x: sx, y: sTop + 0.001, z: vz2 + 0.0004 }));
  out.push(ball(0.0007, CU, { x: sx, y: sTop + 0.0052, z: vz2 + 0.0004 }));
  for (const s of [-1, 1]) out.push(tri3(V(sx, sTop + 0.0052, vz2 + 0.0004), V(sx + s * 0.0028, sTop + 0.0068, vz2 + 0.0002), V(sx + s * 0.0016, sTop + 0.0042, vz2 + 0.0004), CU));

  // ----- the guardhouses either side, the walls joining them -----
  for (const s of [-1, 1]) {
    const gx = s * 0.063, gs = steps(0.02, 0.054, 2, 0.0016, 0.0012, S2, { x: gx }, S), gy = gs.y, gh = 0.025, gd = 0.05, gw = 0.0172;
    out.push(...box(0.008, 0.021, 0.008, shade(S, 0.97), { x: s * 0.0495 }), ...box(0.0088, 0.0014, 0.0088, LT, { x: s * 0.0495, y: 0.021 }));
    out.push(...box(0.0145, gh, 0.032, S, { x: gx, y: gy }));
    // Its blind windows and door, to the side and to the gate.
    for (const t of [-0.008, 0.008]) out.push(...reliefPanel(gx + s * 0.00725, gy + 0.008, t, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0.0056, 0.009, 1, S));
    out.push(pane(0.0062, 0.013, 0x4a3d30, gx + s * 0.0075, gy, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2), pane(0.0076, 0.0012, LT, gx + s * 0.0076, gy + 0.013, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2));
    const cxs = [-0.0063, -0.0021, 0.0021, 0.0063].map((d) => gx + d);
    for (const zz of [-0.022, 0.022]) {
      for (const x of cxs) out.push(...column(x, gy, zz, 0.00125, gh, S, 'doric'));
      out.push(pane(0.0055, 0.012, 0x4a3d30, gx, gy, zz > 0 ? 0.0161 : -0.0161, zz > 0 ? 0 : Math.PI));
    }
    const ge = gy + gh;
    out.push(...box(gw, 0.0026, gd, S, { x: gx, y: ge }));
    out.push(...box(gw + 0.0004, 0.0005, gd + 0.0004, LT, { x: gx, y: ge + 0.0023 }));
    const gfy = ge + 0.0028, gfh = 0.0034;
    out.push(...box(gw - 0.0004, gfh, gd - 0.0004, S, { x: gx, y: gfy }));
    for (const ry of [0, Math.PI]) out.push(...doricFrieze(gx, 0, (gd - 0.0004) / 2, ry, triglyphsAt(cxs.map((x) => (x - gx) * (ry === 0 ? 1 : -1)).sort((a, b) => a - b), 0.004, (gw - 0.0004) / 2 - 0.0011), gfy, gfh, S, 0.7));
    for (const ry of [Math.PI / 2, -Math.PI / 2]) out.push(...doricFrieze(gx, 0, (gw - 0.0004) / 2, ry, triglyphsAt([-0.022, 0.022], 0.0042, (gd - 0.0004) / 2 - 0.0011), gfy, gfh, S, 0.7));
    out.push(...box(gw + 0.0024, 0.0016, gd + 0.0024, LT, { x: gx, y: gfy + gfh }, S));
    out.push(...box(gw - 0.002, 0.0035, gd - 0.006, S, { x: gx, y: gfy + gfh + 0.0016 }), ...box(gw - 0.0012, 0.0008, gd - 0.0052, LT, { x: gx, y: gfy + gfh + 0.0051 }));
  }
  return [pad(), ...st.parts, ...out];
}
// A horse, l long, facing +z, its hooves at y: its body, neck and head,
// ears, tail and legs; `rear` lifts a foreleg (that side: -1 or 1, 0 none).
function horse(x: number, z: number, y: number, l: number, c: number, rear = 0): G[] {
  const c2 = shade(c, 0.9), p = (dx: number, dy: number, dz: number) => V(x + dx * l, y + dy * l, z + dz * l);
  const out: G[] = [
    P(new THREE.SphereGeometry(1, 8, 5), c, { x, y: y + l * 0.62, z, sx: l * 0.16, sy: l * 0.19, sz: l * 0.42 }),
    rod(p(0, 0.66, 0.26), p(0, 0.98, 0.44), l * 0.11, c, 5, l * 0.07),
    rod(p(0, 1.0, 0.42), p(0, 0.84, 0.66), l * 0.075, c, 5, l * 0.045),
    rod(p(0, 0.98, 0.3), p(0, 0.72, 0.18), l * 0.025, c2, 3),
    rod(p(0, 0.64, -0.4), p(0, 0.3, -0.5), l * 0.05, c2, 4, l * 0.03),
  ];
  for (const s of [-1, 1]) out.push(cone(l * 0.025, l * 0.09, 3, c2, { x: x + s * l * 0.035, y: y + l * 1.03, z: z + l * 0.43 }));
  for (const s of [-1, 1]) {
    out.push(rod(p(s * 0.08, 0.55, -0.28), p(s * 0.08, 0.26, -0.36), l * 0.05, c2, 4, l * 0.035), rod(p(s * 0.08, 0.26, -0.36), p(s * 0.08, 0, -0.3), l * 0.032, c2, 4));
    if (s === rear) out.push(rod(p(s * 0.08, 0.55, 0.3), p(s * 0.08, 0.38, 0.48), l * 0.045, c2, 4, l * 0.035), rod(p(s * 0.08, 0.38, 0.48), p(s * 0.08, 0.28, 0.4), l * 0.032, c2, 4));
    else out.push(rod(p(s * 0.08, 0.55, 0.3), p(s * 0.08, 0, 0.33), l * 0.045, c2, 4, l * 0.032));
  }
  return out;
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
