// Four of the Renaissance era's wonders (renaissance.ts): the Taj Mahal,
// St Basil's Cathedral, Himeji Castle and the Forbidden City, each the
// monument alone on a plain pad filling its 7 × 7 site (in a city 1 cell
// is about 0.039 site units), in site units (kit.ts), the front +z.

import * as THREE from 'three';
import { chamfered, frustum, gable, ring } from '../houseKit.ts';
import { H, P, V, ball, box, cone, cyl, drumC, flat, pane, rod, shade, type G } from './kit.ts';

// ---------- shared pieces ----------

// A solid of revolution: a profile of (radius, height) points about the y axis.
const lathe = (pts: readonly (readonly [number, number])[], n: number, c: number, o: { x?: number; y?: number; z?: number } = {}) =>
  P(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n), c, o);
// A pointed (Islamic or Gothic) arch, w wide, its sides h high, facing ry,
// its bottom middle at x, y, z (each curve in seg pieces).
function pointed(w: number, h: number, c: number, x: number, y: number, z: number, ry = 0, seg = 4): G {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h);
  s.quadraticCurveTo(-w / 2, h + w * 0.5, 0, h + w * 0.72);
  s.quadraticCurveTo(w / 2, h + w * 0.5, w / 2, h);
  s.lineTo(w / 2, 0);
  return P(new THREE.ShapeGeometry(s, seg), c, { x, y, z, ry });
}
// A point on a face: `d` out from (cx, cz) toward ry, `t` along the face.
const onFace = (cx: number, cz: number, d: number, ry: number, t: number): [number, number] =>
  [cx + Math.sin(ry) * d + Math.cos(ry) * t, cz + Math.cos(ry) * d - Math.sin(ry) * t];
// Parts built small, drawn up: wider by s, taller by sy (the site's
// pad is added after, at its own size).
const stretch = (parts: G[], s: number, sy: number): G[] => parts.map((g) => g.scale(s, sy, s));
// A box from a to b on the ground plane (a wall's run), w thick, h high, at y.
function run(ax: number, az: number, bx: number, bz: number, w: number, h: number, c: number, y: number, top = c): G[] {
  const l = Math.hypot(bx - ax, bz - az);
  return box(w, h, l, c, { x: (ax + bx) / 2, y, z: (az + bz) / 2, ry: Math.atan2(bx - ax, bz - az) }, top);
}

// ---------- Agra ----------

// The Taj's marbles and inlays: white marble, its shadowed tops, a niche's
// back wall and half dome, the pale-grey and dark pietra dura lines, an
// opening's dark, a jali's (pierced screen's) grey, the finials' gilding.
const TAJ = { WM: 0xf3eee4, WM2: 0xe2dccd, BACK: 0xd8d0c1, SOFT: 0xe9e2d4, GREY: 0xb3aca2, INLAY: 0x3f3833, DOOR: 0x3a332c, JALI: 0x8c8579, GOLD: 0xd9b04a } as const;

// The white tomb on its plinth (the monument alone, on a plain pad). The
// plinth's sides are a blind arcade of real niches under a cornice, inlaid
// borders on its top. The tomb is a square with cut corners, its walls
// (nicheWall) deep enough for the niches to be real recesses: on each face
// the great iwan in its pishtaq, the frame standing proud and rising over
// the roof, its pointed arch with a moulded rim, the dark calligraphy band
// round it, inlaid rosettes in the spandrels, the half dome inside over a
// door and a jali window, a cornice and cresting on top, slim guldastas
// (pinnacles) either side; beside it narrow niches two high, and on the cut
// corners deeper niches two high, each in its pale inlaid frame (alfiz); a
// cornice and crested parapet round the roof, a guldasta at every corner.
// On the roof the drum on its base course, its blind arcade, the onion dome,
// its lotus crown and the tall gilded finial with the crescent; four
// chhatris round it. The four minarets at the plinth's corners, three
// balconies each, ringed in dark inlay, a chhatri on top, each leaning
// slightly outward. (Built small, then drawn up to fill its site and stand
// about five cells tall, a little more up than across, so the dome keeps
// the real one's proportions: stretch.)
export function tajMahal(): G[] {
  const out: G[] = [];
  const { WM, WM2, GREY, INLAY, GOLD } = TAJ;
  const FACES = [0, 1, 2, 3].map((f) => (f * Math.PI) / 2);
  // The plinth: a core, its four arcaded walls, base course and cornice; an
  // inlaid border on its top.
  const ph = 0.0055, pw = 0.066, pT = 0.001, ptop = ph + 0.0001;
  out.push(...box(pw - 2 * pT, ph, pw - 2 * pT, TAJ.BACK, {}, WM2));
  out.push(...box(pw + 0.0008, 0.0006, pw + 0.0008, WM2));
  out.push(...box(pw + 0.0008, 0.0005, pw + 0.0008, WM, { y: ph - 0.0004 }, WM2));
  const bays = Array.from({ length: 7 }, (_, i) => ({ t: -pw / 2 + 0.005 + (i * (pw - 0.01)) / 6, y: 0.0011, w: 0.0028, h: 0.0012, backed: false, door: false, frame: false }));
  for (const ry of FACES) out.push(...nicheWall(pw, ph - 0.0004, pT, bays, 0, 0, pw / 2, ry, 0, 0, 2));
  for (const hs of [0.0262, 0.0302]) for (const s of [-1, 1]) {
    out.push(flat(2 * hs + 0.0004, 0.0004, GREY, 0, s * hs, ptop + 0.00005), flat(0.0004, 2 * hs - 0.0004, GREY, s * hs, 0, ptop + 0.00005));
  }

  // The tomb: a core under its roof terrace, its eight walls round it (the
  // pishtaqs standing proud), a base course and cornice round them.
  // (Everything on it a hair above its top, so their undersides keep off it.)
  const by = ptop + 0.00003, bh = 0.026, bw = 0.046, a = bw / 2, k = bw * 0.2, dd = (2 * a - k) / Math.SQRT2, kw = k * Math.SQRT2;
  out.push(...chamfered(bw - 0.008, bh + 0.0001, bw - 0.008, 0.1805, WM, { y: by }, WM2));
  out.push(...chamfered(bw + 0.0006, 0.0012, bw + 0.0006, 0.2012, WM2, { y: by - 0.000015 }));
  out.push(...chamfered(bw + 0.0008, 0.0005, bw + 0.0008, 0.2016, WM, { y: by + bh - 0.0012 }, WM2));
  const PW = 0.019, PH = 0.0305, dp = a + 0.0008, iw = 0.0115, ih = 0.0135, iy = 0.0015;
  for (const ry of FACES) {
    const on = (d: number, t: number) => onFace(0, 0, d, ry, t);
    // The pishtaq and its iwan.
    out.push(...nicheWall(PW, PH, 0.003, [{ t: 0, y: iy, w: iw, h: ih, dome: true, frame: false }], 0, 0, dp, ry, 0, by, 3, false));
    {
      // The arch's moulded rim.
      const s = archPath(new THREE.Shape(), iw + 0.0008, ih, 0, iy);
      s.holes.push(archPath(new THREE.Path(), iw, ih, 0, iy));
      const [x, z] = on(dp + 0.00005, 0);
      out.push(P(new THREE.ShapeGeometry(s, 3), GREY, { x, y: by, z, ry }));
    }
    // The calligraphy band, dark on a pale border, round the arch.
    const bt = 0.0076, btop = 0.0255;
    for (const [c, lw, dz] of [[GREY, 0.0013, 0.00005], [INLAY, 0.0007, 0.0001]] as const) {
      for (const s of [-1, 1]) { const [x, z] = on(dp + dz, s * bt); out.push(pane(lw, btop + lw / 2 - iy, c, x, by + iy, z, ry)); }
      const [x, z] = on(dp + dz, 0); out.push(pane(2 * bt + lw, lw, c, x, by + btop - lw / 2, z, ry));
    }
    // Inlaid rosettes in the spandrels, a pale border round the frame.
    for (const s of [-1, 1]) {
      const [x, z] = on(dp + 0.00005, s * 0.005);
      out.push(P(new THREE.CircleGeometry(0.0008, 6), GREY, { x, y: by + 0.0218, z, ry }));
      const [x3, z3] = on(dp + 0.00005, s * (PW / 2 - 0.0006));
      out.push(pane(0.0003, PH - 0.0026, GREY, x3, by + 0.0013, z3, ry));
    }
    { const [x, z] = on(dp + 0.00005, 0); out.push(pane(PW - 0.0009, 0.0003, GREY, x, by + PH - 0.0013, z, ry)); }
    // Its cornice and cresting.
    { const [x, z] = on(dp - 0.0015, 0); out.push(...box(PW + 0.0006, 0.0005, 0.0036, WM, { x, y: by + PH - 0.0008, z, ry })); }
    { const [x, z] = on(dp - 0.0004, 0); out.push(merlons(PW - 0.0015, 9, 0.0007, 0.0008, WM, x, by + PH - 0.0003, z, ry)); }
    // Its guldastas.
    for (const s of [-1, 1]) { const [x, z] = on(dp - 0.0004, s * (PW / 2 + 0.0004)); out.push(...guldasta(x, z, by, 0.0345, 0.0007)); }
    // Beside it, narrow niches two high; a string course between.
    for (const s of [-1, 1]) {
      const sw = a - k - PW / 2, t = s * (PW / 2 + sw / 2);
      out.push(...nicheWall(sw, bh, 0.0022, [{ t: 0, y: 0.0015, w: 0.0026, h: 0.0068, dome: true }, { t: 0, y: 0.0135, w: 0.0026, h: 0.0068, dome: true }], 0, 0, a, ry, t, by, 2));
      out.push(...crest(sw, a, ry, t, by + bh));
      const [x, z] = on(a + 0.00005, t); out.push(pane(sw, 0.0003, GREY, x, by + 0.013, z, ry));
    }
    // The cut corner: deeper niches two high.
    const rd = ry + Math.PI / 4;
    out.push(...nicheWall(kw, bh, 0.0025, [{ t: 0, y: 0.0015, w: 0.0058, h: 0.0062, dome: true }, { t: 0, y: 0.0135, w: 0.0058, h: 0.0062, dome: true }], 0, 0, dd, rd, 0, by, 2));
    out.push(...crest(kw, dd, rd, 0, by + bh));
    { const [x, z] = onFace(0, 0, dd + 0.00005, rd, 0); out.push(pane(kw, 0.0003, GREY, x, by + 0.013, z, rd)); }
    // Guldastas at the block's corners.
    for (const s of [-1, 1]) { const [x, z] = on(a, s * (a - k)); out.push(...guldasta(x, z, by, bh + 0.005, 0.0009)); }
  }

  // The drum on its base course, its blind arcade under a cornice.
  const dy = by + bh;
  out.push(lathe([[0.0137, 0], [0.0137, 0.0013], [0.0128, 0.0013]], 20, WM2, { y: dy }), cyl(0.0128, 0.0128, 0.0068, 20, WM, { y: dy + 0.0013 }), lathe([[0.0128, 0], [0.0135, 0.0002], [0.0133, 0.0006], [0.0128, 0.0006]], 20, WM, { y: dy + 0.0079 }));
  for (let i = 0; i < 12; i++) {
    const ry = (i / 12) * Math.PI * 2;
    const [x1, z1] = onFace(0, 0, 0.01302, ry, 0), [x2, z2] = onFace(0, 0, 0.01309, ry, 0);
    out.push(pointed(0.0027, 0.0034, TAJ.BACK, x1, dy + 0.0017, z1, ry, 2), pointed(0.0011, 0.0022, TAJ.DOOR, x2, dy + 0.0019, z2, ry, 1));
  }
  // The onion dome (as tall as it is wide, on its drum), its lotus crown,
  // the gilded finial and its crescent.
  const top = dy + 0.0085, DH = 0.0275, ky = DH / 0.0213, ft = top + DH - 0.0008;
  out.push(lathe(([[0.0128, 0], [0.0155, 0.0033], [0.0166, 0.007], [0.0158, 0.0105], [0.0128, 0.0143], [0.0083, 0.0174], [0.0039, 0.0196], [0.0014, 0.0207], [0, 0.0213]] as const).map(([r, h]) => [r, h * ky] as const), 20, WM, { y: top }));
  out.push(lathe([[0, 0], [0.0032, 0.0004], [0.0024, 0.0012], [0.001, 0.0016]], 8, WM2, { y: ft }));
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2;
    out.push(P(new THREE.OctahedronGeometry(0.0009), WM2, { x: Math.sin(t) * 0.0027, y: ft - 0.0002, z: Math.cos(t) * 0.0027, ry: t, sx: 0.55, sy: 0.35, sz: 1.15 }));
  }
  out.push(lathe([[0.0005, 0], [0.0011, 0.0008], [0.0004, 0.0015], [0.0009, 0.0023], [0.0003, 0.0029], [0.0005, 0.0035], [0.0002, 0.004]], 6, GOLD, { y: ft + 0.0004 }));
  out.push(cyl(0.00024, 0.0002, 0.0041, 4, GOLD, { y: ft + 0.0043 }), cone(0.00016, 0.003, 4, GOLD, { y: ft + 0.0084 }));
  for (const [yy, rr] of [[0.0063, 0.0005], [0.0077, 0.00035]] as const) out.push(ball(rr, GOLD, { y: ft + yy }));
  out.push(P(new THREE.TorusGeometry(0.0013, 0.00024, 3, 6, Math.PI * 1.4).rotateZ(0.8 * Math.PI), GOLD, { y: ft + 0.0097 }));
  // The four chhatris round the dome.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...chhatri(sx * 0.0165, sz * 0.0165, dy + 0.0002, 0.0045, WM, WM2, GOLD));
  // The minarets, each leaning a little outward.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (pw / 2 - 0.0035), z = sz * (pw / 2 - 0.0035), y = by;
    const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationAxis(V(sz, 0, -sx).normalize(), 0.035)).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
    out.push(...minaret(x, z, y).map((g) => g.applyMatrix4(m)));
  }
  return [flat(2 * H, 2 * H, 0xd8d0c0, 0, 0, 0.0003), ...stretch(out, 2.18, 2.4)];
}
// A pointed arch's outline (as pointed()), w wide, its sides h high, its
// bottom middle at (x, y), traced into p.
function archPath<T extends THREE.Path>(p: T, w: number, h: number, x: number, y: number): T {
  p.moveTo(x - w / 2, y);
  p.lineTo(x - w / 2, y + h);
  p.quadraticCurveTo(x - w / 2, y + h + w * 0.5, x, y + h + w * 0.72);
  p.quadraticCurveTo(x + w / 2, y + h + w * 0.5, x + w / 2, y + h);
  p.lineTo(x + w / 2, y);
  return p;
}
// A niche: t along its wall, its bottom y up it, w wide, its sides h high;
// a half dome over it or not, its pale inlaid frame (alfiz) or not, a back
// wall of its own or not (the wall behind it shows: the plinth's).
interface Niche { readonly t: number; readonly y: number; readonly w: number; readonly h: number; readonly dome?: boolean; readonly frame?: boolean; readonly backed?: boolean; readonly door?: boolean }
// (A geometry without its hidden faces: those all at z = zb, its back
// against the core, and those all on y = 0, its foot.)
function trimHidden(g: THREE.BufferGeometry, zb: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g, p = src.getAttribute('position'), keep: number[] = [];
  for (let i = 0; i < p.count; i += 3) {
    let back = true, foot = true;
    for (let k = 0; k < 3; k++) { if (Math.abs(p.getZ(i + k) - zb) > 1e-7) back = false; if (Math.abs(p.getY(i + k)) > 1e-7) foot = false; }
    if (!back && !foot) for (let k = 0; k < 3; k++) keep.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return out;
}
// A piece of the Taj's wall facing ry, its outer face d out from (cx, cz)
// and t along, standing on y: w wide, h high, T deep, pierced by its niches.
// Each niche's sides are the wall's own depth; at its back a wall with a
// door (framed in grey) and, if there is room, a jali window over it; a half
// dome over the big ones (the space between its rim and the pointed arch
// filled in); its alfiz on the wall's face.
function nicheWall(w: number, h: number, T: number, niches: readonly Niche[], cx: number, cz: number, d: number, ry: number, t: number, y: number, seg = 3, trim = true): G[] {
  const out: G[] = [];
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
  for (const n of niches) s.holes.push(archPath(new THREE.Path(), n.w, n.h, n.t, n.y));
  const at = (dz: number, tt: number) => onFace(cx, cz, d + dz, ry, t + tt);
  { const [x, z] = at(0, 0); const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: seg }).translate(0, 0, -T); out.push(P(trim ? trimHidden(g, -T) : g, TAJ.WM, { x, y, z, ry })); }
  for (const n of niches) {
    const yb = y + n.y, back = -T + 0.00006, big = n.w > 0.007;
    if (n.backed !== false) { const [x, z] = at(back, n.t); out.push(pointed(n.w, n.h, TAJ.BACK, x, yb, z, ry, seg)); }
    // The door, the jali over it.
    const dw = n.w * 0.42, dh = n.h * 0.3, js = dh + dw * 0.72 + n.h * 0.05, jw = n.w * 0.34, jh = n.h * 0.12;
    if (n.door !== false) for (const [c, ww, hh, dz] of [[TAJ.GREY, dw + 0.0005, dh + 0.00025, 0.00006], [TAJ.DOOR, dw, dh, 0.00012]] as const) {
      if (c === TAJ.GREY && !big) continue;
      const [x, z] = at(back + dz, n.t); out.push(pointed(ww, hh, c, x, yb, z, ry, big ? 2 : 1));
    }
    if (big && js + jh + jw * 0.72 + 0.0003 < n.h) {
      { const [x, z] = at(back + 0.00006, n.t); out.push(pointed(jw + 0.0004, jh + 0.0004, TAJ.GREY, x, yb + js - 0.0002, z, ry, 2)); }
      { const [x, z] = at(back + 0.00012, n.t); out.push(pointed(jw, jh, TAJ.JALI, x, yb + js, z, ry, 2)); }
    }
    if (n.dome) {
      const r = n.w / 2, [x, z] = at(-0.00015, n.t);
      out.push(P(new THREE.SphereGeometry(r, r > 0.004 ? 8 : r > 0.002 ? 6 : 4, r > 0.004 ? 3 : 2, Math.PI, Math.PI, 0, Math.PI / 2), TAJ.SOFT, { x, y: yb + n.h, z, ry, sz: Math.min(1, (T - 0.0002) / r) }));
      const ty = new THREE.Shape();
      // (The fill's lower edge a little inside the dome's rim: no sliver shows.)
      ty.moveTo(-r, n.h);
      ty.quadraticCurveTo(-r, n.h + n.w * 0.5, 0, n.h + n.w * 0.72);
      ty.quadraticCurveTo(r, n.h + n.w * 0.5, r, n.h);
      ty.absarc(0, n.h, r * 0.96, 0, Math.PI, false);
      out.push(P(new THREE.ShapeGeometry(ty, big ? seg : 2), TAJ.BACK, { x, y: yb, z, ry }));
    }
    if (n.frame !== false) {
      const fw = n.w + 0.0011, fh = n.h + n.w * 0.72 + 0.0006, lw = 0.0003;
      for (const sd of [-1, 1]) { const [x, z] = at(0.00005, n.t + sd * (fw / 2)); out.push(pane(lw, fh, TAJ.GREY, x, yb, z, ry)); }
      const [x, z] = at(0.00005, n.t); out.push(pane(fw + lw, lw, TAJ.GREY, x, yb + fh - lw, z, ry));
    }
  }
  return out;
}
// A crested parapet w long along a wall's top at y (its face d out toward
// ry, t along).
function crest(w: number, d: number, ry: number, t: number, y: number): G[] {
  const out: G[] = [];
  const [x, z] = onFace(0, 0, d - 0.00035, ry, t);
  out.push(...box(w, 0.0009, 0.0007, TAJ.WM, { x, y, z, ry }));
  out.push(merlons(w, Math.max(2, Math.round(w / 0.0024)), 0.0005, 0.0005, TAJ.WM, x, y + 0.0009, z, ry));
  return out;
}
// A row of n merlons along a parapet's top (each a quad standing on its
// middle line), w long, each mw wide and mh high, facing ry.
function merlons(w: number, n: number, mw: number, mh: number, c: number, x: number, y: number, z: number, ry: number): G {
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const m = -w / 2 + ((i + 0.5) * w) / n, a = m - mw / 2, b = m + mw / 2;
    p.push(a, 0, 0, b, 0, 0, b, mh, 0, a, 0, 0, b, mh, 0, a, mh, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return P(g, c, { x, y, z, ry });
}
// A guldasta: a slim six-sided pinnacle h high, r thick, capped by a
// little kiosk and its pointed bud with a gilded spike.
function guldasta(x: number, z: number, y: number, h: number, r: number): G[] {
  // (Open shells: each one's ends hidden in the next.)
  const out: G[] = [cyl(r, r * 0.85, h, 6, TAJ.WM, { x, y, z })];
  out.push(cyl(r * 1.35, r * 1.35, r * 0.45, 6, TAJ.WM2, { x, y: y + h, z }));
  out.push(cone(r * 1.3, r * 1.9, 6, TAJ.WM, { x, y: y + h + r * 0.45, z }));
  out.push(cone(r * 0.14, r * 1.3, 3, TAJ.GOLD, { x, y: y + h + r * 2.25, z }));
  return out;
}
// A minaret standing on (x, y, z): its octagonal base, three tapering
// stages, each ringed with dark inlay, a balcony on corbels over each,
// a chhatri on top.
function minaret(x: number, z: number, y: number): G[] {
  const out: G[] = [lathe([[0.0038, 0], [0.0035, 0.0024], [0.0029, 0.0024]], 8, TAJ.WM2, { x, y, z })];
  let yy = y + 0.0024;
  for (const [r0, r1, h] of [[0.0029, 0.0027, 0.0128], [0.0026, 0.0024, 0.0108], [0.0023, 0.0021, 0.0088]] as const) {
    out.push(cyl(r0, r1, h, 8, TAJ.WM, { x, y: yy, z }));
    { const rf = (r0 + r1) / 2 + 0.00006; out.push(cyl(rf, rf, 0.00028, 8, TAJ.INLAY, { x, y: yy + h * 0.5, z })); }
    yy += h;
    // The balcony: its corbelled underside and parapet.
    out.push(lathe([[r1, 0], [r1 + 0.0016, 0.0009], [r1 + 0.0016, 0.0019]], 8, TAJ.WM2, { x, y: yy - 0.0002, z }));
  }
  out.push(...chhatri(x, z, yy + 0.0007, 0.0032, TAJ.WM, TAJ.WM2, TAJ.GOLD, 6));
  return out;
}
// A chhatri (a domed kiosk), r wide, standing on y: its platform, n slim
// columns under pointed arches, the sloping eave (chhajja), a drum, the
// dome, its lotus and gilded finial.
function chhatri(x: number, z: number, y: number, r: number, c: number, c2: number, gold: number, n = 8): G[] {
  const out: G[] = [drumC(r * 1.05, r * 1.05, r * 0.25, n, c2, { x, y, z })];
  const cr = r * 0.8, ap = cr * Math.cos(Math.PI / n), aw = 2 * cr * Math.sin(Math.PI / n);
  for (let i = 0; i < n; i++) {
    const q = ((i + 0.5) / n) * Math.PI * 2;
    out.push(cyl(r * 0.085, r * 0.075, r * 0.95, 3, c, { x: x + Math.sin(q) * cr, y: y + r * 0.25, z: z + Math.cos(q) * cr }));
    // The arch between two columns: the wall over its pointed opening.
    const ry = (i / n) * Math.PI * 2, ah = r * 0.42, s = new THREE.Shape();
    s.moveTo(-aw / 2, 0); s.lineTo(-aw / 2, ah); s.lineTo(aw / 2, ah); s.lineTo(aw / 2, 0);
    s.quadraticCurveTo(aw / 2, ah * 0.55, 0, ah * 0.8);
    s.quadraticCurveTo(-aw / 2, ah * 0.55, -aw / 2, 0);
    const [ax, az] = onFace(x, z, ap, ry, 0);
    out.push(P(new THREE.ShapeGeometry(s, n === 8 ? 2 : 1), c, { x: ax, y: y + r * 0.78, z: az, ry }));
  }
  out.push(drumC(r * 1.32, r * 0.95, r * 0.14, n, c2, { x, y: y + r * 1.2, z }));
  out.push(cyl(r * 0.86, r * 0.86, r * 0.4, n, c, { x, y: y + r * 1.34, z }));
  out.push(lathe([[r * 0.86, 0], [r * 0.98, r * 0.4], [r * 0.6, r * 1.0], [0, r * 1.22]], n, c, { x, y: y + r * 1.74, z }));
  out.push(lathe([[r * 0.3, 0], [r * 0.08, r * 0.2]], n, c2, { x, y: y + r * 2.9, z }));
  out.push(cone(r * 0.06, r * 0.7, 3, gold, { x, y: y + r * 2.95, z }));
  return out;
}
// ---------- Moscow ----------

// The cathedral alone (on a plain pad): nine chapels on their raised
// gallery, the tall central one under its tented spire, four great
// octagonal chapels on the axes and four lesser ones between, each with
// its tiers of kokoshnik gables, its drum and its onion dome, striped,
// twisted, scaled and checked in its own colours, a gilded cross on each;
// the arcaded gallery round them in red brick and white stone, a town
// storey high. (Drawn up to fill its site and stand about five and a half
// cells tall: stretch.)
export function stBasils(): G[] {
  const out: G[] = [];
  const BRICK = 0xa8452f, TRIM = 0xefe9dd, DARK = 0x3a2a24, GOLD = 0xd8b048;
  const cz = 0, gy = 0.0205;
  // The gallery: an octagon a storey high on its basement, its white
  // cornice, the terrace on top: small basement windows under a white
  // band, the open arcade over it.
  out.push(...chamfered(0.104, gy, 0.1, 0.28, BRICK, { z: cz }, shade(BRICK, 0.82)));
  out.push(...chamfered(0.1052, 0.0012, 0.1012, 0.28, TRIM, { y: gy - 0.0014, z: cz }));
  out.push(...chamfered(0.1052, 0.0009, 0.1012, 0.28, TRIM, { y: 0.0072, z: cz }));
  out.push(...chamfered(0.1046, 0.0012, 0.1006, 0.28, shade(BRICK, 0.8), { y: 0.0001, z: cz }));
  for (let f = 0; f < 8; f++) {
    const ry = (f * Math.PI) / 4, axis = f % 2 === 0, d = axis ? (f % 4 === 0 ? 0.05 : 0.052) : 0.0517 * 0.98;
    const len = axis ? 0.042 : 0.04, n = 5;
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * (len / n), [x, z] = onFace(0, cz, d + 0.0003, ry, t);
      out.push(...archTop(0.0044, 0.0062, TRIM, x, 0.0094, z, ry), ...archTop(0.0032, 0.0058, DARK, ...sh(x, z, ry, 0.0002, 0.0096), ry));
      out.push(...archTop(0.0024, 0.0018, TRIM, x, 0.0026, z, ry), ...archTop(0.0014, 0.0015, DARK, ...sh(x, z, ry, 0.0002, 0.0028), ry));
    }
  }
  // The chapels.
  const schemes: [number[], number, boolean][] = [
    [[0x3d8a4a, 0xf0e8d0], 0.9, false], [[0xc8402e, 0xf0d86a], -0.9, false], [[0x2f6aa8, 0xf0ece0], 0.6, true], [[0x4a9a5a, 0xe2b040], -1.1, false],
    [[0xd84a3a, 0x3a9a5a], 0.7, true], [[0xd8b048, 0xc89a38], 0.5, false], [[0x3a8a9a, 0xe8c04a], -0.8, false], [[0xc84a3a, 0xf0ece0], 1.0, false],
  ];
  // Great chapels on the axes, lesser between; the front one first.
  const axes = [[0, 0.032], [0.032, 0], [0, -0.032], [-0.032, 0]] as const;
  axes.forEach(([x, z], i) => out.push(...chapel(x, cz + z, gy - 0.0003, 0.02, 0.029, 0.0055, 0.011, 0.0092, 0.0175, schemes[i]!, BRICK, TRIM, DARK, GOLD)));
  const diag = [[0.0235, 0.0235], [0.0235, -0.0235], [-0.0235, -0.0235], [-0.0235, 0.0235]] as const;
  diag.forEach(([x, z], i) => out.push(...chapel(x, cz + z, gy - 0.0003, 0.0132, 0.023, 0.0039, 0.008, 0.0064, 0.012, schemes[4 + i]!, BRICK, TRIM, DARK, GOLD)));
  // The central chapel: its octagon, tiers of gables, the tented spire and its little dome.
  const cw = 0.026, ch = 0.044;
  out.push(...chamfered(cw, ch + 0.0003, cw, 0.29, BRICK, { y: gy - 0.0003, z: cz }));
  for (const yy of [0.013, 0.028, ch - 0.0012]) out.push(...chamfered(cw + 0.001, 0.0011, cw + 0.001, 0.29, TRIM, { y: gy + yy, z: cz }));
  for (let f = 0; f < 8; f++) {
    const ry = (f * Math.PI) / 4, [x, z] = onFace(0, cz, cw / 2 + 0.0003, ry, 0);
    out.push(...archTop(0.0032, 0.0075, TRIM, x, gy + 0.0165, z, ry), ...archTop(0.0019, 0.0065, DARK, ...sh(x, z, ry, 0.0002, gy + 0.0172), ry));
    for (const t of [-0.0035, 0.0035]) { const [x2, z2] = onFace(0, cz, cw / 2 + 0.0003, ry, t); out.push(...archTop(0.0022, 0.0038, TRIM, x2, gy + 0.0315, z2, ry)); }
  }
  let y = gy + ch;
  out.push(...kokoshniks(0, cz, y, cw, 8, TRIM, BRICK), ...kokoshniks(0, cz, y + 0.0032, cw * 0.82, 8, TRIM, BRICK, Math.PI / 8));
  out.push(...frustum(cw * 0.98, cw * 0.98, cw * 0.62, cw * 0.62, 0.0065, BRICK, { y, z: cz }));
  y += 0.0065;
  out.push(...chamfered(cw * 0.62, 0.0035, cw * 0.62, 0.29, TRIM, { y, z: cz }));
  y += 0.0035;
  const tent = 0.034;
  out.push(P(new THREE.ConeGeometry(cw * 0.33, tent, 8, 1, true).translate(0, tent / 2, 0).rotateY(Math.PI / 8), 0xe8dfcc, { y, z: cz }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + Math.PI / 8, rr = cw * 0.33 / Math.cos(Math.PI / 8) * Math.cos(Math.PI / 8);
    out.push(rod(V(Math.cos(a) * rr, y, cz + Math.sin(a) * rr), V(0, y + tent, cz), 0.00045, 0x3d7a4a, 3));
  }
  for (let i = 0; i < 24; i++) {
    const f = 0.12 + (i % 6) * 0.13, a = Math.floor(i / 6) * (Math.PI / 2) + (i % 2) * Math.PI / 4 + Math.PI / 8 + Math.PI / 8;
    const rr = cw * 0.33 * (1 - f) * 0.93 + 0.0003;
    out.push(ball(0.0006, 0xd8b048, { x: Math.cos(a) * rr, y: y + tent * f, z: cz + Math.sin(a) * rr }));
  }
  y += tent;
  out.push(drumC(0.0022, 0.0022, 0.004, 8, BRICK, { y: y - 0.002, z: cz }));
  out.push(...striped(0.0042, 0.008, [GOLD, shade(GOLD, 0.85)], 10, 0.6, false, 0, y + 0.002, cz));
  out.push(...cross(0, y + 0.01, cz, 0.006, GOLD));
  return [flat(2 * H, 2 * H, 0xa8a296, 0, 0, 0.0003), ...stretch(out, 1.38, 1.79)];
}
// (A spot nudged out from a face, for what lies on what lies on it.)
const shift = (x: number, z: number, ry: number, d: number): [number, number] => [x + Math.sin(ry) * d, z + Math.cos(ry) * d];
const sh = (x: number, z: number, ry: number, d: number, y: number): [number, number, number] => [x + Math.sin(ry) * d, y, z + Math.cos(ry) * d];
// A round-topped panel (a window, a gable's field) w wide, its sides h
// high, on a face turned ry, its bottom at y.
function archTop(w: number, h: number, c: number, x: number, y: number, z: number, ry: number): G[] {
  return [
    P(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), c, { x, y, z, ry }),
    P(new THREE.CircleGeometry(w / 2, 6, 0, Math.PI).translate(0, h, 0), c, { x, y, z, ry }),
  ];
}
// A ring of kokoshniks (the round gables of Russian churches) round an
// octagon w across, standing on y.
function kokoshniks(x: number, z: number, y: number, w: number, n: number, c: number, inner: number, turn = 0): G[] {
  const out: G[] = [];
  for (let i = 0; i < n; i++) {
    const ry = turn + (i * Math.PI * 2) / n, side = w * 0.42, [fx, fz] = onFace(x, z, w / 2 + 0.0004, ry, 0);
    out.push(P(new THREE.CircleGeometry(side / 2, 6, 0, Math.PI).scale(1, 1.25, 1), c, { x: fx, y, z: fz, ry }));
    const [ix, iz] = shift(fx, fz, ry, 0.0002);
    out.push(P(new THREE.CircleGeometry(side * 0.34, 6, 0, Math.PI).scale(1, 1.25, 1), inner, { x: ix, y: y + 0.0003, z: iz, ry }));
  }
  return out;
}
// An onion dome r wide and h high, its base at y: n stripes in turn of
// `cols`, twisted round by `twist` turns' worth (radians) from base to
// tip; checked (alternating ring by ring too) when `check`.
function striped(r: number, h: number, cols: readonly number[], n: number, twist: number, check: boolean, x: number, y: number, z: number): G[] {
  const prof = [[0.58, 0], [0.84, 0.1], [0.99, 0.24], [1.0, 0.34], [0.9, 0.5], [0.68, 0.66], [0.43, 0.8], [0.21, 0.91], [0.08, 0.97], [0, 1]] as const;
  const by = new Map<number, number[]>();
  const pt = (s: number, j: number) => {
    const [pr, py] = prof[j]!, a = (s / n) * Math.PI * 2 + twist * py;
    return [x + Math.cos(a) * pr * r, y + py * h, z + Math.sin(a) * pr * r];
  };
  for (let s = 0; s < n; s++) for (let j = 0; j < prof.length - 1; j++) {
    const stripe = s, c = cols[(check ? stripe + j : stripe) % cols.length]!;
    const a0 = pt(s, j), a1 = pt(s + 1, j), b0 = pt(s, j + 1), b1 = pt(s + 1, j + 1);
    const arr = by.get(c) ?? [];
    arr.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
    by.set(c, arr);
  }
  return [...by].map(([c, arr]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return P(g, c);
  });
}
// A gilded Orthodox cross on a short stem, h tall, its foot at y.
function cross(x: number, y: number, z: number, h: number, c: number): G[] {
  return [
    rod(V(x, y, z), V(x, y + h, z), h * 0.05, c, 4),
    rod(V(x - h * 0.25, y + h * 0.72, z), V(x + h * 0.25, y + h * 0.72, z), h * 0.04, c, 4),
    rod(V(x - h * 0.14, y + h * 0.86, z), V(x + h * 0.14, y + h * 0.86, z), h * 0.035, c, 4),
    rod(V(x - h * 0.17, y + h * 0.45, z - h * 0.05), V(x + h * 0.17, y + h * 0.36, z + h * 0.05), h * 0.035, c, 4),
  ];
}
// A chapel: its octagon w across and h high on y, white bands and
// windows, kokoshniks, a drum and an onion dome in its scheme, a cross.
function chapel(x: number, z: number, y: number, w: number, h: number, dr: number, dh: number, or: number, oh: number, scheme: [number[], number, boolean], brick: number, trim: number, dark: number, gold: number): G[] {
  const out: G[] = [...chamfered(w, h, w, 0.29, brick, { x, y, z })];
  for (const yy of [h * 0.4, h - 0.0013]) out.push(...chamfered(w + 0.0009, 0.001, w + 0.0009, 0.29, trim, { x, y: y + yy, z }));
  for (let f = 0; f < 8; f++) {
    const ry = (f * Math.PI) / 4, [fx, fz] = onFace(x, z, w / 2 + 0.0003, ry, 0);
    out.push(...archTop(w * 0.16, h * 0.22, trim, fx, y + h * 0.52, fz, ry), ...archTop(w * 0.09, h * 0.18, dark, ...sh(fx, fz, ry, 0.0002, y + h * 0.54), ry));
    if (f % 2 === 0) out.push(...archTop(w * 0.13, h * 0.17, trim, fx, y + h * 0.1, fz, ry));
  }
  let yy = y + h;
  out.push(...kokoshniks(x, z, yy, w, 8, trim, brick, Math.PI / 8));
  out.push(...frustum(w * 0.98, w * 0.98, dr * 2.3, dr * 2.3, h * 0.2, brick, { x, y: yy, z }));
  yy += h * 0.2;
  out.push(...kokoshniks(x, z, yy - 0.0002, dr * 2.3, 8, trim, brick));
  out.push(drumC(dr, dr, dh, 12, brick, { x, y: yy, z }));
  for (const f of [0.15, 0.85]) out.push(cyl(dr + 0.0002, dr + 0.0002, 0.0007, 12, trim, { x, y: yy + dh * f, z }));
  for (let i = 0; i < 8; i++) {
    const ry = (i / 8) * Math.PI * 2, [fx, fz] = onFace(x, z, dr + 0.0003, ry, 0);
    out.push(...archTop(dr * 0.32, dh * 0.38, dark, fx, yy + dh * 0.28, fz, ry));
  }
  yy += dh;
  out.push(drumC(dr * 0.7, dr * 0.7, or * 0.18, 10, scheme[0][1]!, { x, y: yy, z }));
  out.push(...striped(or, oh, scheme[0], 16, scheme[1], scheme[2], x, yy + or * 0.15, z));
  out.push(...cross(x, yy + or * 0.15 + oh * 0.97, z, oh * 0.45, gold));
  return out;
}
// ---------- Himeji ----------

// Himeji's colours: white plaster, its eaves, the grey tiles and their dark
// edges, the white mortar, the stone, the gravel, windows and their frames, gilding.
const HJ = { WHITE: 0xf3f1ea, EAVE: 0xe0ddd4, ROOF: 0x5a646e, EDGE: 0x454c54, RIDGE: 0xd6d6d0, STONE: 0xa8a090, GRAVEL: 0xd9d2c2, WIN: 0x2e2e30, FRAME: 0x9a9890, GOLD: 0xd9b04a } as const;

// The White Heron (the castle alone, on a plain pad): its terrace of
// battered stone, the white walls round it under their little tiled roofs,
// pierced by loopholes, its gate and corner turrets; the great keep of five
// roofs on its own tall base of stone with its curved batter (white plaster,
// grey tiles on sagging slopes whose corners turn up, white plastered eaves,
// the hips mortared white), its triangular gables (chidori-hafu) and curved
// ones (kara-hafu) with gilded ornaments, golden fish on the ridge; its
// three lesser keeps round a court, joined to it by two-storey corridors.
// (Drawn up to fill its site and stand about five cells tall: stretch.)
export function himejiCastle(): G[] {
  const out: G[] = [];
  // The terrace of battered stone, gravel on top.
  const tw = 0.1, td = 0.086, th = 0.012;
  out.push(...battered(0, 0, 0, tw - 0.006, td - 0.006, th, 0.003, 4, HJ.STONE, HJ.GRAVEL));
  const top = th, iw = tw - 0.006, id = td - 0.006, X = iw / 2 - 0.002, Z = id / 2 - 0.002;
  // Its walls, the gate in the front one, the corner turrets.
  out.push(...dobei(-X, Z, -0.0085, Z, top), ...dobei(0.0085, Z, X, Z, top), ...dobei(-X, -Z, -X, Z, top), ...dobei(X, -Z, X, Z, top), ...dobei(-X, -Z, X, -Z, top));
  out.push(...gate(0, Z, top));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...turret(sx * (X - 0.0035), sz * (Z - 0.0032), top, sx * sz > 0 ? 0 : Math.PI / 2));
  // The great keep: five storeys, a roof over each, the gables on them.
  out.push(...keep(0.014, 0.008, top, [[0.034, 0.028, 0.009], [0.03, 0.024, 0.0075], [0.026, 0.021, 0.0072], [0.022, 0.018, 0.0066], [0.017, 0.014, 0.0072]], [
    { front: 'pair', side: 'one' }, { front: 'big', side: 'none' }, { front: 'kara', side: 'pair' }, { front: 'pair', side: 'kara' },
  ], true));
  // The lesser keeps, the corridors joining them to it and each other.
  out.push(...keep(-0.026, 0.012, top, [[0.02, 0.017, 0.0075], [0.016, 0.014, 0.0066], [0.012, 0.011, 0.0066]], [{ front: 'one', side: 'one' }, { front: 'kara', side: 'none' }], false));
  out.push(...keep(-0.026, -0.022, top, [[0.018, 0.016, 0.0072], [0.014, 0.012, 0.0064], [0.011, 0.01, 0.0062]], [{ front: 'one', side: 'none' }, { front: 'none', side: 'one' }], false));
  out.push(...keep(0.016, -0.028, top, [[0.018, 0.016, 0.0072], [0.014, 0.012, 0.0064], [0.011, 0.01, 0.0062]], [{ front: 'big', side: 'none' }, { front: 'one', side: 'none' }], false));
  out.push(...corridor(-0.026, 0.003, -0.026, -0.013, top), ...corridor(-0.017, -0.024, 0.007, -0.027, top));
  out.push(...corridor(0.016, -0.019, 0.016, -0.006, top), ...corridor(-0.016, 0.012, -0.003, 0.012, top));
  return [flat(2 * H, 2 * H, 0xcfc8b8, 0, 0, 0.0003), ...stretch(out, 1.44, 2.1)];
}
// A base of stone w × d at its top, h high, its faces' curved batter
// (musha-gaeshi: flaring out at the foot, upright at the top) B wide; in n
// courses of alternating shade, its top in `top`.
function battered(x: number, z: number, y: number, w: number, d: number, h: number, B: number, n: number, c: number, top: number): G[] {
  const out: G[] = [], at = (t: number) => 2 * B * (1 - t) ** 2;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    out.push(...frustum(w + at(t0), d + at(t0), w + at(t1), d + at(t1), h / n, shade(c, k % 2 ? 0.95 : 1.03), { x, y: y + (h * k) / n, z }, k === n - 1 ? top : undefined));
  }
  return out;
}
// A rib (a roof's ridge, a barge board): a three-sided rod from a to b, open-ended.
function rib(a: THREE.Vector3, b: THREE.Vector3, r: number, c: number): G {
  const l = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, l, 3, 1, true).translate(0, l / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())));
  return P(g.translate(a.x, a.y, a.z), c);
}
// A Japanese hipped roof from its eaves w × d at y up to w1 × d1 (a ridge
// when d1 is small), h high, turned ry, in Himeji's tiles: its hips (and
// ridge) mortared white when `hips`, its eaves plastered white (swoop).
const hRoof = (x: number, z: number, y: number, w: number, d: number, w1: number, d1: number, h: number, ry = 0, hips = true): G[] =>
  swoop(x, z, y, w, d, w1, d1, h, { tile: HJ.ROOF, edge: HJ.EDGE, eave: HJ.EAVE, ridge: hips ? HJ.RIDGE : undefined }, ry);
// An East Asian hipped roof from its eaves w × d at y up to w1 × d1 (a
// ridge when w1 or d1 is small, a point when both are), h high, turned ry:
// its slopes sagging (flat at the eaves, steep above), the eaves' corners
// turned up by `lift` of h; the tiles' edge and the eaves' underside; its
// hips (and ridge) in `ridge`, if given, and on each hip's foot a file of
// `beasts` little roof figures; the rows of tiles down its front and back
// slopes `rows` apart, if given (in the tiles' edge).
interface RoofCols { readonly tile: number; readonly edge: number; readonly eave: number; readonly ridge?: number | undefined }
function swoop(x: number, z: number, y: number, w: number, d: number, w1: number, d1: number, h: number, col: RoofCols, ry = 0, lift0 = 0.22, beasts = 0, rows = 0): G[] {
  const T = [0, 0.3, 0.65, 1], lift = h * lift0, edge = h * 0.1;
  const ring = (k: number, dy = 0): THREE.Vector3[] => {
    const t = T[k]!, a = w / 2 + (w1 / 2 - w / 2) * t, b = d / 2 + (d1 / 2 - d / 2) * t, yy = h * t ** 1.5 + dy;
    const C = [[-a, b], [a, b], [a, -b], [-a, -b]] as const, pts: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const p = C[i]!, q = C[(i + 1) % 4]!;
      for (let j = 0; j < 3; j++) {
        const up = j === 0 ? (k === 0 ? lift : k === 1 ? lift * 0.3 : 0) : 0, s = j / 3;
        pts.push(V(p[0] + (q[0] - p[0]) * s, yy + up, p[1] + (q[1] - p[1]) * s));
      }
    }
    return pts;
  };
  const quads = (A: THREE.Vector3[], B: THREE.Vector3[], arr: number[]) => {
    for (let i = 0; i < A.length; i++) {
      const a0 = A[i]!, a1 = A[(i + 1) % A.length]!, b0 = B[i]!, b1 = B[(i + 1) % B.length]!;
      arr.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
    }
  };
  const rings = [0, 1, 2, 3].map((k) => ring(k)), low = ring(0, -edge);
  const slope: number[] = [], rim: number[] = [], soffit: number[] = [];
  for (let k = 0; k < 3; k++) quads(rings[k]!, rings[k + 1]!, slope);
  quads(low, rings[0]!, rim);
  for (let i = 0; i < 12; i++) { const a = low[i]!, b = low[(i + 1) % 12]!; soffit.push(0, -edge, 0, b.x, b.y, b.z, a.x, a.y, a.z); }
  const mk = (arr: number[], c: number) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return P(g, c, { x, y, z, ry }); };
  const out: G[] = [mk(slope, col.tile), mk(rim, col.edge), mk(soffit, col.eave)];
  if (rows > 0) {
    // (Each row a strip lying a hair over the slope, eaves to ridge, at one x.)
    const tiles: number[] = [], hw = rows * 0.13, a3 = w1 / 2 - rows * 0.5, n = Math.floor((2 * a3) / rows) + 1;
    const on = (k: number, ids: readonly number[], xx: number) => {
      const pl = ids.map((i) => rings[k]![i]!);
      for (let j = 0; j < pl.length - 1; j++) {
        const p = pl[j]!, q = pl[j + 1]!, lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
        if (xx >= lo - 1e-9 && xx <= hi + 1e-9) { const f = hi - lo < 1e-9 ? 0 : (xx - p.x) / (q.x - p.x); return [p.y + (q.y - p.y) * f + 0.0002, p.z] as const; }
      }
      return [pl[0]!.y + 0.0002, pl[0]!.z] as const;
    };
    for (const ids of [[0, 1, 2, 3], [6, 7, 8, 9]] as const) for (let i = 0; i < n; i++) {
      const xx = n === 1 ? 0 : -a3 + (i * 2 * a3) / (n - 1);
      for (let k = 0; k < 3; k++) {
        const [y0, z0] = on(k, ids, xx), [y1, z1] = on(k + 1, ids, xx);
        tiles.push(xx - hw, y0, z0, xx + hw, y0, z0, xx + hw, y1, z1, xx - hw, y0, z0, xx + hw, y1, z1, xx - hw, y1, z1);
      }
    }
    out.push(mk(tiles, col.edge));
  }
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(1, 1, 1));
  const at = (k: number, i: number) => rings[k]![i]!.clone().applyMatrix4(m);
  if (col.ridge !== undefined) {
    const r = Math.max(0.00022, Math.min(0.0005, h * 0.06));
    for (const i of [0, 3, 6, 9]) out.push(rib(at(0, i), at(1, i), r, col.ridge), rib(at(1, i), at(3, i), r, col.ridge));
    if (d1 < d * 0.25 && w1 > d1 * 2) out.push(rib(at(3, 0), at(3, 3), r * 1.5, col.ridge));
    else if (w1 < w * 0.25 && d1 > w1 * 2) out.push(rib(at(3, 0), at(3, 9), r * 1.5, col.ridge));
  }
  // (The figures: an immortal leading, beasts behind, up the hip's foot.)
  for (const i of [0, 3, 6, 9]) for (let b = 0; b < beasts; b++) {
    const p = at(0, i).lerp(at(1, i), 0.18 + (0.7 * b) / Math.max(1, beasts));
    out.push(cone(h * 0.07, h * (b === 0 ? 0.2 : 0.15), 3, col.ridge ?? col.edge, { x: p.x, y: p.y, z: p.z }));
  }
  return out;
}
// A chidori-hafu (a triangular gable standing out of a roof's slope), w
// wide and h high, its white face's foot at (x, y, z) facing ry: its tiled
// slopes, dark barge boards, a gilded gegyo under the apex.
function chidori(x: number, z: number, y: number, w: number, h: number, ry: number): G[] {
  const dep = w * 0.9, sx = Math.sin(ry), cz = Math.cos(ry);
  const at = (u: number, v: number, f: number) => V(x + cz * u + sx * f, y + v, z - sx * u + cz * f);
  return [
    ...gable(w, dep, h, HJ.ROOF, { x: x - sx * (dep / 2), y, z: z - cz * (dep / 2), ry }, true, HJ.WHITE),
    rib(at(-w / 2, 0, 0.0002), at(0, h, 0.0002), w * 0.035, HJ.EDGE), rib(at(w / 2, 0, 0.0002), at(0, h, 0.0002), w * 0.035, HJ.EDGE),
    P(new THREE.OctahedronGeometry(w * 0.07), HJ.GOLD, { ...xyz(at(0, h * 0.7, 0.0003)), sz: 0.4, ry }),
  ];
}
const xyz = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
// A kara-hafu (a curved, bow-shaped gable), w wide, its foot at (x, y, z)
// facing ry: the tiled bow, its dark edge, the white face under it, a
// gilded ornament.
function karaHafu(x: number, z: number, y: number, w: number, ry: number): G[] {
  const H0 = w * 0.55, len = w * 0.75, n = 8, edge = w * 0.08;
  const prof = Array.from({ length: n + 1 }, (_, i) => {
    const u = -1 + (2 * i) / n;
    return [u * w / 2, H0 * (Math.cos((u * Math.PI) / 2) ** 1.6 * 0.85 + 0.15 * Math.max(0, Math.abs(u) - 0.7) / 0.3 * 0.9)] as const;
  });
  const tiles: number[] = [], rim: number[] = [];
  for (let i = 0; i < n; i++) {
    const [u0, v0] = prof[i]!, [u1, v1] = prof[i + 1]!;
    tiles.push(u0, v0, 0, u1, v1, 0, u1, v1, -len, u0, v0, 0, u1, v1, -len, u0, v0, -len);
    rim.push(u0, v0 - edge, 0.0001, u1, v1 - edge, 0.0001, u1, v1, 0.0001, u0, v0 - edge, 0.0001, u1, v1, 0.0001, u0, v0, 0.0001);
  }
  const face = new THREE.Shape();
  face.moveTo(-w * 0.42, 0);
  for (const [u, v] of prof) if (Math.abs(u) <= w * 0.42) face.lineTo(u, v - edge);
  face.lineTo(w * 0.42, 0);
  const mk = (arr: number[], c: number) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return P(g, c, { x, y, z, ry }); };
  return [
    mk(tiles, HJ.ROOF), mk(rim, HJ.EDGE),
    P(new THREE.ShapeGeometry(face), HJ.WHITE, { x, y, z, ry }),
    P(new THREE.OctahedronGeometry(w * 0.06), HJ.GOLD, { x: x + Math.sin(ry) * 0.0003, y: y + H0 * 0.62, z: z + Math.cos(ry) * 0.0003, sz: 0.4, ry }),
  ];
}
// A white storey w × d, h high, its windows (n a side, framed or not) round it.
function storey(x: number, z: number, y: number, w: number, d: number, h: number, framed: boolean, ry = 0): G[] {
  const out: G[] = [ring(w, h, d, HJ.WHITE, { x, y, z, ry })];
  for (const [fr, len, o] of [[0, w, d / 2], [Math.PI, w, d / 2], [Math.PI / 2, d, w / 2], [-Math.PI / 2, d, w / 2]] as const) {
    const f = ry + fr, n = Math.max(1, Math.floor(len / 0.0042));
    for (let k = 0; k < n; k++) {
      const t = -len / 2 + (k + 0.5) * (len / n), [fx, fz] = onFace(x, z, o + 0.0002, f, t);
      if (framed) { const [gx, gz] = onFace(x, z, o + 0.0001, f, t); out.push(pane(0.0021, 0.0022, HJ.FRAME, gx, y + h * 0.42 - 0.0003, gz, f)); }
      out.push(pane(0.0015, 0.0016, HJ.WIN, fx, y + h * 0.42, fz, f));
    }
  }
  return out;
}
// The gables on one roof: on its front and back and on its sides, none, one,
// a pair, a big one or a kara-hafu.
type Gables = 'none' | 'one' | 'pair' | 'big' | 'kara';
function gables(x: number, z: number, y: number, w: number, d: number, rh: number, front: Gables, side: Gables): G[] {
  const out: G[] = [];
  for (const [kind, len, o, f] of [[front, w, d / 2, 0], [front, w, d / 2, Math.PI], [side, d, w / 2, Math.PI / 2], [side, d, w / 2, -Math.PI / 2]] as const) {
    const put = (t: number, gw: number, gh: number, yy: number) => { const [fx, fz] = onFace(x, z, o, f, t); out.push(...chidori(fx, fz, yy, gw, gh, f)); };
    if (kind === 'one') put(0, 0.0075, 0.0042, y + rh * 0.12);
    else if (kind === 'pair') for (const t of [-1, 1]) put(t * len * 0.24, 0.0062, 0.0036, y + rh * 0.15);
    else if (kind === 'big') put(0, Math.min(0.012, len * 0.5), 0.0058, y + rh * 0.05);
    else if (kind === 'kara') { const [fx, fz] = onFace(x, z, o + 0.0006, f, 0); out.push(...karaHafu(fx, fz, y + rh * 0.08, 0.0095, f)); }
  }
  return out;
}
// A keep: its stone base, then storeys (w, d, h) each under its roof with
// its gables, the top under a hip-and-gable roof (irimoya), its gable ends
// white with a gilded ornament, golden fish (shachihoko) at the ridge's ends.
function keep(x: number, z: number, y: number, storeys: readonly (readonly [number, number, number])[], roofs: readonly { front: Gables; side: Gables }[], main: boolean): G[] {
  const out: G[] = [];
  const [w0, d0] = storeys[0]!;
  const sb = 0.006 + w0 * 0.25;
  out.push(...battered(x, z, y, w0 + 0.001, d0 + 0.001, sb, 0.0025, main ? 5 : 3, HJ.STONE, shade(HJ.STONE, 1.1)));
  let yy = y + sb;
  storeys.forEach(([w, d, h], i) => {
    const next = storeys[i + 1];
    out.push(...storey(x, z, yy, w, d, h, main));
    yy += h;
    const ov = 0.0038;
    if (next) {
      const rh = 0.0042, g = roofs[i] ?? { front: 'none', side: 'none' };
      out.push(...hRoof(x, z, yy, w + ov * 2, d + ov * 2, next[0], next[1], rh));
      out.push(...gables(x, z, yy, w + ov * 0.6, d + ov * 0.6, rh, g.front, g.side));
      yy += rh;
    } else {
      // The top: a hipped skirt, the gabled roof over it, its ridge and fish.
      out.push(...hRoof(x, z, yy, w + ov * 2, d + ov * 2, w * 0.92, d * 0.64, 0.0035, 0, false));
      const gy = yy + 0.0035, gh = 0.0062;
      out.push(...gable(w * 0.95, d * 0.66, gh, HJ.ROOF, { x, y: gy, z }, false, HJ.WHITE));
      for (const s of [-1, 1]) {
        out.push(rib(V(x + s * w * 0.475, gy + 0.0002, z + d * 0.33), V(x + s * w * 0.475, gy + gh + 0.0002, z), 0.0003, HJ.EDGE), rib(V(x + s * w * 0.475, gy + 0.0002, z - d * 0.33), V(x + s * w * 0.475, gy + gh + 0.0002, z), 0.0003, HJ.EDGE));
        out.push(P(new THREE.OctahedronGeometry(0.0007), HJ.GOLD, { x: x + s * (w * 0.475 + 0.0002), y: gy + gh * 0.7, z, sx: 0.4 }));
      }
      out.push(rib(V(x - w * 0.48, gy + gh, z), V(x + w * 0.48, gy + gh, z), 0.0005, HJ.RIDGE));
      for (const s of [-1, 1]) {
        out.push(P(new THREE.OctahedronGeometry(0.0009), HJ.GOLD, { x: x + s * w * 0.47, y: gy + gh + 0.0009, z, sx: 1.4, sz: 0.5 }));
        out.push(cone(0.0005, 0.0018, 4, HJ.GOLD, { x: x + s * w * 0.47, y: gy + gh + 0.0012, z, rz: s * 0.6 }));
      }
    }
  });
  return out;
}
// A stretch of the castle's wall (dobei) from (x0, z0) to (x1, z1) on y:
// white, under its little tiled roof, loopholes (square and triangular) on
// its outer face.
function dobei(x0: number, z0: number, x1: number, z1: number, y: number): G[] {
  const l = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), x = (x0 + x1) / 2, z = (z0 + z1) / 2, wh = 0.0036;
  const out: G[] = [...run(x0, z0, x1, z1, 0.0012, wh, HJ.WHITE, y), ...gable(0.0026, l + 0.0008, 0.0011, HJ.ROOF, { x, y: y + wh, z, ry }, true, HJ.EDGE)];
  // (Its outer face: the side away from the castle's middle.)
  const nx = Math.cos(ry), nz = -Math.sin(ry), s = nx * x + nz * z > 0 ? 1 : -1, n = Math.floor(l / 0.0045);
  for (let i = 0; i < n; i++) {
    const t = -l / 2 + (i + 0.5) * (l / n), px = x + Math.sin(ry) * t + s * nx * 0.00062, pz = z + Math.cos(ry) * t + s * nz * 0.00062, f = ry + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (i % 2) out.push(pane(0.0006, 0.0006, HJ.WIN, px, y + 0.0018, pz, f));
    else out.push(P(new THREE.CircleGeometry(0.00045, 3).rotateZ(Math.PI / 2), HJ.WIN, { x: px, y: y + 0.0021, z: pz, ry: f }));
  }
  return out;
}
// The front gate: stone piers either side of the dark gateway, the white
// gatehouse over it under its roof, a gable to the front.
function gate(x: number, z: number, y: number): G[] {
  const w = 0.017, d = 0.0065, ph = 0.0036;
  const out: G[] = [];
  for (const s of [-1, 1]) out.push(...battered(x + s * (w / 2 - 0.0022), z, y, 0.0036, d - 0.001, ph, 0.0004, 1, HJ.STONE, HJ.STONE));
  out.push(pane(w - 0.0088, ph, HJ.WIN, x, y, z + d / 2 - 0.0012));
  out.push(...box(w, 0.0048, d, HJ.WHITE, { x, y: y + ph, z }));
  out.push(pane(w - 0.0088, 0.0006, 0x6a4a34, x, y + ph - 0.0006, z + d / 2 - 0.00115));
  for (const t of [-0.0045, 0, 0.0045]) out.push(pane(0.0015, 0.0012, HJ.WIN, x + t, y + ph + 0.0018, z + d / 2 + 0.0001));
  out.push(...hRoof(x, z, y + ph + 0.0048, w + 0.006, d + 0.006, w * 0.6, 0.0006, 0.0048));
  out.push(...chidori(x, z + d / 2 + 0.0018, y + ph + 0.0052, 0.007, 0.0036, 0));
  return out;
}
// A corner turret (sumi-yagura): two white storeys, the upper smaller, each
// under its roof, a gable on the lower; turned ry.
function turret(x: number, z: number, y: number, ry: number): G[] {
  const w = 0.009, d = 0.0075;
  return [
    ...storey(x, z, y, w, d, 0.0055, false, ry),
    ...hRoof(x, z, y + 0.0055, w + 0.005, d + 0.005, w * 0.7, d * 0.6, 0.0032, ry, false),
    ...storey(x, z, y + 0.0087, w * 0.7, d * 0.6, 0.0042, false, ry),
    ...hRoof(x, z, y + 0.0129, w * 0.7 + 0.004, d * 0.6 + 0.004, w * 0.4, 0.0006, 0.0042, ry),
    ...chidori(...onFace(x, z, d / 2 + 0.0018, ry, 0), y + 0.0058, 0.0055, 0.003, ry),
  ];
}
// A corridor between keeps (watari-yagura): on its own stone base, two
// white storeys (windows on both) under a hipped roof.
function corridor(x0: number, z0: number, x1: number, z1: number, y: number): G[] {
  const l = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  return [
    ...frustum(0.0115, l, 0.0085, l, 0.004, HJ.STONE, { x, y, z, ry }, shade(HJ.STONE, 1.1)),
    ...storey(x, z, y + 0.004, 0.0075, l, 0.0075, false, ry),
    ...hRoof(x, z, y + 0.0115, 0.0115, l + 0.003, 0.0006, l - 0.004, 0.004, ry),
  ];
}

// ---------- Beijing ----------

// The palace's vermilion, its imperial yellow tiles (their edge, the
// darker ridges), the eaves' painted underside (blue-green), the white
// marble, the paving, the doors' dark red and their gilded transoms.
const FC = { RED: 0xac2e22, RED2: 0x86231a, YELLOW: 0xe0a400, YEDGE: 0x985000, YRIDGE: 0xc08000, PAINT: 0x2f6a66, MARBLE: 0xece8de, PAVE: 0xc8c0b0, WAY: 0xdcd6ca, DOOR: 0x6a2018, TRANSOM: 0xb88a30, GREY: 0x8a8680, GOLD: 0xd9b04a } as const;
const FC_ROOF: RoofCols = { tile: FC.YELLOW, edge: FC.YEDGE, eave: FC.PAINT, ridge: FC.YRIDGE };

// The heart of the palace (on a plain pad): its court paved, the imperial
// way up its middle, walled in red under yellow-tiled caps, a corner tower
// at each corner (crossed gables over its eaves), long galleries down its
// sides, the Gate of Supreme Harmony in the front wall on its own marble
// base; within, on the triple terrace of white marble (balustrades round
// every tier, spouts at the corners, stairs either side of the carved
// ramp), the Hall of Supreme Harmony: red columns before its lattice doors
// with their gilded transoms, the painted bracket band, double eaves of
// yellow tile swept up at the corners, roof figures on every hip, the
// dragons (chiwen) at the ridge's ends; behind it the square Hall of Central
// Harmony under its gilded knob and the Hall of Preserving Harmony under
// its hip-and-gable roofs. (Built small, then drawn up to fill its site and
// stand about three cells tall: stretch.)
export function forbiddenCity(): G[] {
  const out: G[] = [];
  // The court: paved, the imperial way, its walls and corner towers.
  const W = 0.0295;
  out.push(flat(2 * W, 2 * W, FC.PAVE, 0, 0, 0.0006), flat(0.0045, 2 * W - 0.004, FC.WAY, 0, 0, 0.00075));
  for (const [x0, z0, x1, z1] of [[-W, -W, W, -W], [-W, -W, -W, W], [W, -W, W, W], [-W, W, -0.0125, W], [0.0125, W, W, W]] as const) out.push(...redWall(x0, z0, x1, z1));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...cornerTower(sx * (W - 0.0042), sz * (W - 0.0042), 0.0065));
  // The galleries down the court's sides.
  for (const s of [-1, 1]) out.push(...hall(s * (W - 0.0038), -0.002, 0, 0.04, 0.0042, 0.004, { upper: 'none', beasts: 0, ry: -s * Math.PI / 2, open: false }));
  // The gate in the front wall, on its marble base.
  out.push(...terrace(0, W - 0.0025, 0, 0.027, 0.0105, 0.0024, false));
  out.push(...hall(0, W - 0.0025, 0.0024, 0.022, 0.0068, 0.0046, { upper: 'gable', beasts: 3, rows: 0.0013 }));
  // The triple terrace of white marble, its stairs and carved ramp.
  const tz = -0.004, tiers = [[0.048, 0.044], [0.044, 0.04], [0.04, 0.036]] as const, step = 0.0022;
  let ty = 0;
  for (const [w, d] of tiers) { out.push(...terrace(0, tz, ty, w, d, step)); ty += step; }
  {
    const z0 = tz + tiers[0][1] / 2, run = 0.0085, a = Math.atan2(ty, run);
    // (Its slope from the court up to the top tier's edge.)
    out.push(P(new THREE.PlaneGeometry(0.0034, Math.hypot(ty, run)).rotateX(-Math.PI / 2 + a), shade(FC.MARBLE, 0.86), { y: ty / 2 + 0.00005, z: z0 + run / 2 - 0.0002 }));
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.004, Math.hypot(ty, run)).rotateX(-Math.PI / 2 + a);
      out.push(P(g, shade(FC.MARBLE, 0.96), { x: s * 0.0039, y: ty / 2, z: z0 + run / 2 - 0.0002 }));
      for (let k = 1; k < 6; k++) out.push(...box(0.004, 0.0003, 0.0004, shade(FC.MARBLE, 1.02), { x: s * 0.0039, y: ty * (k / 6) - 0.0003, z: z0 + run * (1 - k / 6) - 0.0002 }));
      out.push(rod(V(s * 0.0019, 0, z0 + run - 0.0002), V(s * 0.0019, ty + 0.0011, z0 - 0.0002), 0.00028, FC.MARBLE, 4));
      out.push(rod(V(s * 0.0059, 0, z0 + run - 0.0002), V(s * 0.0059, ty + 0.0011, z0 - 0.0002), 0.00028, FC.MARBLE, 4));
    }
  }
  // The three halls on it.
  out.push(...box(0.04, 0.0006, 0.0135, shade(FC.MARBLE, 1.02), { y: ty, z: tz + 0.0068 }));
  out.push(...hall(0, tz + 0.0068, ty + 0.0006, 0.035, 0.0115, 0.0105, { upper: 'hip', beasts: 5, rows: 0.0013 }));
  out.push(...pavilion(0, tz - 0.004, ty, 0.0095));
  out.push(...hall(0, tz - 0.0125, ty, 0.029, 0.0078, 0.0072, { upper: 'gable', beasts: 3, rows: 0.0013 }));
  return [flat(2 * H, 2 * H, 0xb8b0a2, 0, 0, 0.0003), ...stretch(out, 2.4, 3.9)];
}
// A tier of white marble w × d at y, h high: its body, its moulded lip, the
// balustrade round its edge (a rail on posts), a dragon-head spout at each
// corner (if `spouts`).
function terrace(x: number, z: number, y: number, w: number, d: number, h: number, spouts = true): G[] {
  const out: G[] = [...box(w, h, d, FC.MARBLE, { x, y, z }, shade(FC.MARBLE, 0.97)), ring(w + 0.0005, 0.0004, d + 0.0005, shade(FC.MARBLE, 0.92), { x, y: y + h - 0.0006, z })];
  const e = 0.0003, bw = w - 2 * e, bd = d - 2 * e, top = y + h;
  out.push(ring(bw, 0.0003, bd, shade(FC.MARBLE, 1.03), { x, y: top + 0.0008, z }));
  for (const [len, o, f] of [[bw, bd / 2, 0], [bw, bd / 2, Math.PI], [bd, bw / 2, Math.PI / 2], [bd, bw / 2, -Math.PI / 2]] as const) {
    const [px, pz] = onFace(x, z, o - 0.00006, f, 0);
    out.push(merlons(len, Math.max(2, Math.round(len / 0.0022)), 0.00035, 0.0014, FC.MARBLE, px, top, pz, f));
  }
  if (spouts) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    out.push(rod(V(x + sx * w / 2, top - 0.0008, z + sz * d / 2), V(x + sx * (w / 2 + 0.0012), top - 0.0008, z + sz * (d / 2 + 0.0012)), 0.0003, FC.GREY, 3));
  }
  return out;
}
// A hall w × d on y, its columns h high (the eaves' height): a red body set
// back behind its red columns, lattice doors with gilded transoms across its
// front and back, the painted bracket band under the eaves; the lower roof
// (yellow, swept), and over it, if any, the upper storey's short red wall
// and band under the upper roof: a hip (wudian) with its ridge and dragons,
// or hip-and-gable (xieshan), red gable ends; `beasts` figures on each hip.
// Turned ry; `open` false: a gallery's plain back wall.
function hall(x: number, z: number, y: number, w: number, d: number, h: number, o: { upper: 'none' | 'hip' | 'gable'; beasts: number; ry?: number; open?: boolean; rows?: number }): G[] {
  const ry = o.ry ?? 0, out: G[] = [];
  const P2 = (a: number, b: number): [number, number] => [x + Math.cos(ry) * a + Math.sin(ry) * b, z - Math.sin(ry) * a + Math.cos(ry) * b];
  const inset = Math.min(0.0016, d * 0.14), bw = w - 2 * inset, bd = d - 2 * inset;
  out.push(...box(bw, h, bd, FC.RED, { x, y, z, ry }));
  // The columns along its front and back (and down its ends on a big hall).
  const n = Math.max(3, Math.round(w / 0.0032)), cr = Math.min(0.00042, w * 0.012);
  for (let i = 0; i <= n; i++) {
    const t = -w / 2 + cr + (i * (w - 2 * cr)) / n;
    for (const s of o.open === false ? [1] : [-1, 1]) { const [cx, cz] = P2(t, s * (d / 2 - cr)); out.push(cyl(cr, cr, h, 5, FC.RED, { x: cx, y, z: cz })); }
    // The doors between: a dark-red leaf under a gilded transom.
    if (i < n) for (const s of o.open === false ? [1] : [-1, 1]) {
      const bt = -w / 2 + cr + ((i + 0.5) * (w - 2 * cr)) / n, bwid = ((w - 2 * cr) / n) * 0.78;
      if (Math.abs(bt) > bw / 2 - bwid / 2) continue;
      const [dx, dz] = P2(bt, s * (bd / 2 + 0.0001)), f = ry + (s > 0 ? 0 : Math.PI);
      out.push(pane(bwid, h * 0.62, FC.DOOR, dx, y, dz, f), pane(bwid, h * 0.16, FC.TRANSOM, dx, y + h * 0.64, dz, f));
    }
  }
  // The painted band (the brackets) under the eaves, round the columns' heads.
  out.push(ring(w - cr, h * 0.16, d - cr, FC.PAINT, { x, y: y + h * 0.84, z, ry }));
  out.push(ring(w - cr + 0.0004, h * 0.04, d - cr + 0.0004, FC.GOLD, { x, y: y + h * 0.82, z, ry }));
  const ey = y + h, ov = Math.min(0.0034, d * 0.32);
  if (o.upper === 'none') {
    out.push(...swoop(x, z, ey, w + ov * 2, d + ov * 2, w * 0.82, 0.0004, d * 0.42, FC_ROOF, ry, 0.3, o.beasts));
    return out;
  }
  // The lower eaves, the upper storey, the upper roof.
  const lh = d * 0.2;
  out.push(...swoop(x, z, ey, w + ov * 2, d + ov * 2, bw - 0.0006, bd - 0.0006, lh, FC_ROOF, ry, 0.3, o.beasts, o.rows ?? 0));
  const uy = ey + lh - 0.0003, uh = h * 0.42;
  out.push(...box(bw - 0.0008, uh, bd - 0.0008, FC.RED, { x, y: uy, z, ry }));
  out.push(ring(bw - 0.0006, uh * 0.32, bd - 0.0006, FC.PAINT, { x, y: uy + uh * 0.68, z, ry }));
  const ry2 = uy + uh, uw = bw + ov * 1.5, ud = bd + ov * 1.5;
  if (o.upper === 'hip') {
    const rh = d * 0.5, rl = w * 0.58;
    out.push(...swoop(x, z, ry2, uw, ud, rl, 0.0004, rh, FC_ROOF, ry, 0.3, o.beasts, o.rows ?? 0));
    // The dragons at the ridge's ends.
    for (const s of [-1, 1]) {
      const [cx, cz] = P2(s * rl / 2, 0);
      out.push(...box(0.0009, 0.0024, 0.0006, FC.YRIDGE, { x: cx, y: ry2 + rh - 0.0002, z: cz, ry }));
      out.push(cone(0.0005, 0.0016, 3, FC.YEDGE, { x: cx, y: ry2 + rh + 0.0016, z: cz, rz: -s * 0.9 }));
    }
  } else {
    // Hip-and-gable: a hipped skirt, a gable over it, its ends red, a ridge.
    const sh0 = d * 0.2, gh = d * 0.34;
    out.push(...swoop(x, z, ry2, uw, ud, bw * 0.92, bd * 0.5, sh0, FC_ROOF, ry, 0.3, o.beasts, o.rows ?? 0));
    out.push(...gable(bw * 0.94, bd * 0.56, gh, FC.YELLOW, { x, y: ry2 + sh0, z, ry }, false, FC.RED));
    const [ax, az] = P2(-bw * 0.47, 0), [bx, bz] = P2(bw * 0.47, 0);
    out.push(rib(V(ax, ry2 + sh0 + gh, az), V(bx, ry2 + sh0 + gh, bz), 0.0004, FC.YRIDGE));
    for (const [cx, cz] of [[ax, az], [bx, bz]] as const) out.push(cone(0.0005, 0.0015, 3, FC.YEDGE, { x: cx, y: ry2 + sh0 + gh, z: cz }));
  }
  return out;
}
// A wall of the court from (x0, z0) to (x1, z1): red on a grey footing,
// under a tiled cap (yellow, its ends dark). (The cap runs on past the
// wall's ends, so their ends never share a face.)
function redWall(x0: number, z0: number, x1: number, z1: number): G[] {
  const l = Math.hypot(x1 - x0, z1 - z0), ex = ((x1 - x0) / l) * 0.0007, ez = ((z1 - z0) / l) * 0.0007, ry = Math.atan2(x1 - x0, z1 - z0);
  return [
    ...run(x0, z0, x1, z1, 0.0024, 0.0008, FC.GREY, 0),
    ...run(x0, z0, x1, z1, 0.002, 0.0058, FC.RED, 0.0008, FC.RED2),
    ...run(x0 - ex, z0 - ez, x1 + ex, z1 + ez, 0.0026, 0.0004, FC.PAINT, 0.0066),
    ...gable(0.0034, l + 0.0016, 0.0012, FC.YELLOW, { x: (x0 + x1) / 2, y: 0.007, z: (z0 + z1) / 2, ry }, true, FC.YEDGE),
  ];
}
// The Hall of Central Harmony: a square pavilion w across, red columns
// round it, a single swept pyramid roof, its gilded knob.
function pavilion(x: number, z: number, y: number, w: number): G[] {
  const h = w * 0.55, out: G[] = [...box(w + 0.0012, 0.0005, w + 0.0012, shade(FC.MARBLE, 1.02), { x, y, z }), ...box(w - 0.0024, h, w - 0.0024, FC.RED, { x, y: y + 0.0005, z })];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (i > 0 && i < 3 && j > 0 && j < 3) continue;
    out.push(cyl(0.00038, 0.00038, h, 5, FC.RED, { x: x - w / 2 + 0.0005 + (i * (w - 0.001)) / 3, y: y + 0.0005, z: z - w / 2 + 0.0005 + (j * (w - 0.001)) / 3 }));
  }
  for (const f of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const [dx, dz] = onFace(x, z, (w - 0.0024) / 2 + 0.0001, f, 0);
    out.push(pane(w * 0.42, h * 0.62, FC.DOOR, dx, y + 0.0005, dz, f), pane(w * 0.42, h * 0.15, FC.TRANSOM, dx, y + 0.0005 + h * 0.64, dz, f));
  }
  out.push(ring(w - 0.0006, h * 0.16, w - 0.0006, FC.PAINT, { x, y: y + 0.0005 + h * 0.84, z }));
  const ey = y + 0.0005 + h, rh = w * 0.55;
  out.push(...swoop(x, z, ey, w + 0.005, w + 0.005, 0.0004, 0.0004, rh, FC_ROOF, 0, 0.3, 3));
  out.push(drumC(0.0006, 0.0004, 0.0006, 6, FC.GOLD, { x, y: ey + rh - 0.0002, z }), ball(0.0008, FC.GOLD, { x, y: ey + rh + 0.0011, z }));
  return out;
}
// A corner tower: a red pavilion on the wall's corner, its swept eaves, the
// crossed gables over them (red ends), their ridges, its gilded knob.
function cornerTower(x: number, z: number, y: number): G[] {
  const w = 0.0068, out: G[] = [...box(w, 0.0042, w, FC.RED, { x, y, z })];
  for (const f of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) { const [dx, dz] = onFace(x, z, w / 2 + 0.0001, f, 0); out.push(pane(w * 0.5, 0.0024, FC.DOOR, dx, y + 0.0005, dz, f)); }
  out.push(ring(w + 0.0002, 0.0007, w + 0.0002, FC.PAINT, { x, y: y + 0.0035, z }));
  out.push(...swoop(x, z, y + 0.0042, w + 0.0036, w + 0.0036, w * 0.8, w * 0.8, 0.0014, FC_ROOF, 0, 0.35, 0));
  // The crossed gables over the eaves, their ridges, the knob where they meet.
  for (const r of [0, Math.PI / 2]) {
    out.push(...gable(w * 0.98, w * 0.62, 0.0026, FC.YELLOW, { x, y: y + 0.0054, z, ry: r }, false, FC.RED));
    out.push(rib(V(x - Math.cos(r) * w * 0.49, y + 0.008, z + Math.sin(r) * w * 0.49), V(x + Math.cos(r) * w * 0.49, y + 0.008, z - Math.sin(r) * w * 0.49), 0.0003, FC.YRIDGE));
  }
  out.push(ball(0.0006, FC.GOLD, { x, y: y + 0.0084, z }));
  return out;
}
