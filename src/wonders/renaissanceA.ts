// Four of the Renaissance era's wonders (renaissance.ts): the Taj Mahal,
// St Basil's Cathedral, Himeji Castle and the Forbidden City, each the
// monument alone on a plain pad filling its 7 × 7 site (in a city 1 cell
// is about 0.039 site units), in site units (kit.ts), the front +z.

import * as THREE from 'three';
import { chamfered, frustum, gable, ring } from '../houseKit.ts';
import { H, P, V, ball, box, cyl, drumC, flat, pane, rnd, rod, shade, steps, type G } from './kit.ts';

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
// balconies each, inlaid in dark lines, a chhatri on top, each leaning
// slightly outward. (Built small, then drawn up to fill its site and stand
// about six cells tall: stretch.)
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
  const bays = Array.from({ length: 9 }, (_, i) => ({ t: -pw / 2 + 0.0045 + (i * (pw - 0.009)) / 8, y: 0.0011, w: 0.0028, h: 0.0012, backed: false }));
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
    out.push(...nicheWall(PW, PH, 0.003, [{ t: 0, y: iy, w: iw, h: ih, dome: true, frame: false }], 0, 0, dp, ry, 0, by, 4));
    {
      // The arch's moulded rim.
      const s = archPath(new THREE.Shape(), iw + 0.0008, ih, 0, iy);
      s.holes.push(archPath(new THREE.Path(), iw, ih, 0, iy));
      const [x, z] = on(dp + 0.00005, 0);
      out.push(P(new THREE.ShapeGeometry(s, 4), GREY, { x, y: by, z, ry }));
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
      out.push(P(new THREE.CircleGeometry(0.0008, 8), GREY, { x, y: by + 0.0218, z, ry }));
      const [x3, z3] = on(dp + 0.00005, s * (PW / 2 - 0.0006));
      out.push(pane(0.0003, PH - 0.0026, GREY, x3, by + 0.0013, z3, ry));
    }
    { const [x, z] = on(dp + 0.00005, 0); out.push(pane(PW - 0.0009, 0.0003, GREY, x, by + PH - 0.0013, z, ry)); }
    // Its cornice and cresting.
    { const [x, z] = on(dp - 0.0015, 0); out.push(...box(PW + 0.0006, 0.0005, 0.0036, WM, { x, y: by + PH - 0.0008, z, ry })); }
    for (let i = 0; i < 9; i++) { const [x, z] = on(dp - 0.0004, -PW / 2 + 0.0011 + (i * (PW - 0.0022)) / 8); out.push(...box(0.0007, 0.0008, 0.0006, WM, { x, y: by + PH - 0.0003, z, ry })); }
    // Its guldastas.
    for (const s of [-1, 1]) { const [x, z] = on(dp - 0.0004, s * (PW / 2 + 0.0004)); out.push(...guldasta(x, z, by, 0.0345, 0.0007)); }
    // Beside it, narrow niches two high; a string course between.
    for (const s of [-1, 1]) {
      const sw = a - k - PW / 2, t = s * (PW / 2 + sw / 2);
      out.push(...nicheWall(sw, bh, 0.0022, [{ t: 0, y: 0.0015, w: 0.0026, h: 0.0068, dome: true }, { t: 0, y: 0.0135, w: 0.0026, h: 0.0068, dome: true }], 0, 0, a, ry, t, by));
      out.push(...crest(sw, a, ry, t, by + bh));
      const [x, z] = on(a + 0.00005, t); out.push(pane(sw, 0.0003, GREY, x, by + 0.013, z, ry));
    }
    // The cut corner: deeper niches two high.
    const rd = ry + Math.PI / 4;
    out.push(...nicheWall(kw, bh, 0.0025, [{ t: 0, y: 0.0015, w: 0.0058, h: 0.0062, dome: true }, { t: 0, y: 0.0135, w: 0.0058, h: 0.0062, dome: true }], 0, 0, dd, rd, 0, by));
    out.push(...crest(kw, dd, rd, 0, by + bh));
    { const [x, z] = onFace(0, 0, dd + 0.00005, rd, 0); out.push(pane(kw, 0.0003, GREY, x, by + 0.013, z, rd)); }
    // Guldastas at the block's corners.
    for (const s of [-1, 1]) { const [x, z] = on(a, s * (a - k)); out.push(...guldasta(x, z, by, bh + 0.005, 0.0009)); }
  }

  // The drum on its base course, its blind arcade under a cornice.
  const dy = by + bh;
  out.push(drumC(0.0137, 0.0137, 0.0013, 32, WM2, { y: dy }), cyl(0.0128, 0.0128, 0.0083, 32, WM, { y: dy + 0.0002 }), drumC(0.0135, 0.0133, 0.0006, 32, WM, { y: dy + 0.0079 }));
  for (let i = 0; i < 16; i++) {
    const ry = (i / 16) * Math.PI * 2;
    const [x0, z0] = onFace(0, 0, 0.01295, ry, 0), [x1, z1] = onFace(0, 0, 0.01302, ry, 0), [x2, z2] = onFace(0, 0, 0.01309, ry, 0);
    out.push(pointed(0.0033, 0.0036, GREY, x0, dy + 0.0015, z0, ry, 3), pointed(0.0027, 0.0034, TAJ.BACK, x1, dy + 0.0017, z1, ry, 3), pointed(0.0011, 0.0022, TAJ.DOOR, x2, dy + 0.0019, z2, ry, 2));
  }
  // The onion dome, its lotus crown, the gilded finial and its crescent.
  const top = dy + 0.0085;
  out.push(lathe([[0.0128, 0], [0.0152, 0.003], [0.0165, 0.0065], [0.0163, 0.0095], [0.0149, 0.0125], [0.0123, 0.0152], [0.0089, 0.0175], [0.0053, 0.0193], [0.0024, 0.0205], [0.0009, 0.0211], [0, 0.0213]], 32, WM, { y: top }));
  out.push(lathe([[0, 0], [0.0032, 0.0004], [0.0024, 0.0012], [0.001, 0.0016]], 16, WM2, { y: top + 0.0205 }));
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    out.push(P(new THREE.OctahedronGeometry(0.0009), WM2, { x: Math.sin(t) * 0.0027, y: top + 0.0203, z: Math.cos(t) * 0.0027, ry: t, sx: 0.55, sy: 0.35, sz: 1.15 }));
  }
  out.push(lathe([[0.0005, 0], [0.001, 0.0003], [0.0011, 0.0008], [0.0006, 0.0013], [0.0004, 0.0015], [0.0008, 0.0019], [0.0009, 0.0023], [0.0005, 0.0027], [0.0003, 0.0029], [0.0005, 0.0032], [0.0005, 0.0035], [0.0002, 0.0038], [0.0002, 0.004]], 10, GOLD, { y: top + 0.0209 }));
  out.push(rod(V(0, top + 0.0248, 0), V(0, top + 0.0289, 0), 0.00024, GOLD, 5), rod(V(0, top + 0.0289, 0), V(0, top + 0.0318, 0), 0.00016, GOLD, 4));
  for (const [yy, rr] of [[0.0268, 0.0005], [0.0282, 0.00035]] as const) out.push(ball(rr, GOLD, { y: top + yy }, 1));
  out.push(P(new THREE.TorusGeometry(0.0013, 0.00024, 4, 12, Math.PI * 1.4).rotateZ(0.8 * Math.PI), GOLD, { y: top + 0.0302 }));
  // The four chhatris round the dome.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...chhatri(sx * 0.0165, sz * 0.0165, dy + 0.0002, 0.0045, WM, WM2, GOLD));
  // The minarets, each leaning a little outward.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (pw / 2 - 0.0035), z = sz * (pw / 2 - 0.0035), y = by;
    const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationAxis(V(sz, 0, -sx).normalize(), 0.035)).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
    out.push(...minaret(x, z, y).map((g) => g.applyMatrix4(m)));
  }
  return [flat(2 * H, 2 * H, 0xd8d0c0, 0, 0, 0.0003), ...stretch(out, 2.18, 3.5)];
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
interface Niche { readonly t: number; readonly y: number; readonly w: number; readonly h: number; readonly dome?: boolean; readonly frame?: boolean; readonly backed?: boolean }
// A piece of the Taj's wall facing ry, its outer face d out from (cx, cz)
// and t along, standing on y: w wide, h high, T deep, pierced by its niches.
// Each niche's sides are the wall's own depth; at its back a wall with a
// door (framed in grey) and, if there is room, a jali window over it; a half
// dome over the big ones (the space between its rim and the pointed arch
// filled in); its alfiz on the wall's face.
function nicheWall(w: number, h: number, T: number, niches: readonly Niche[], cx: number, cz: number, d: number, ry: number, t: number, y: number, seg = 3): G[] {
  const out: G[] = [];
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
  for (const n of niches) s.holes.push(archPath(new THREE.Path(), n.w, n.h, n.t, n.y));
  const at = (dz: number, tt: number) => onFace(cx, cz, d + dz, ry, t + tt);
  { const [x, z] = at(0, 0); out.push(P(new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: seg }).translate(0, 0, -T), TAJ.WM, { x, y, z, ry })); }
  for (const n of niches) {
    const yb = y + n.y, back = -T + 0.00006;
    if (n.backed !== false) { const [x, z] = at(back, n.t); out.push(pointed(n.w, n.h, TAJ.BACK, x, yb, z, ry, seg)); }
    // The door, the jali over it.
    const dw = n.w * 0.42, dh = n.h * 0.3, js = dh + dw * 0.72 + n.h * 0.05, jw = n.w * 0.34, jh = n.h * 0.12;
    for (const [c, ww, hh, dz] of [[TAJ.GREY, dw + 0.0005, dh + 0.00025, 0.00006], [TAJ.DOOR, dw, dh, 0.00012]] as const) {
      if (c === TAJ.GREY && n.h < 0.002) continue;
      const [x, z] = at(back + dz, n.t); out.push(pointed(ww, hh, c, x, yb, z, ry, 2));
    }
    if (js + jh + jw * 0.72 + 0.0003 < n.h) {
      if (n.w > 0.004) { const [x, z] = at(back + 0.00006, n.t); out.push(pointed(jw + 0.0004, jh + 0.0004, TAJ.GREY, x, yb + js - 0.0002, z, ry, 2)); }
      { const [x, z] = at(back + 0.00012, n.t); out.push(pointed(jw, jh, TAJ.JALI, x, yb + js, z, ry, 2)); }
    }
    if (n.dome) {
      const r = n.w / 2, [x, z] = at(-0.00015, n.t);
      out.push(P(new THREE.SphereGeometry(r, r > 0.002 ? 8 : 5, r > 0.002 ? 3 : 2, Math.PI, Math.PI, 0, Math.PI / 2), TAJ.SOFT, { x, y: yb + n.h, z, ry, sz: Math.min(1, (T - 0.0002) / r) }));
      const ty = new THREE.Shape();
      // (The fill's lower edge a little inside the dome's rim: no sliver shows.)
      ty.moveTo(-r, n.h);
      ty.quadraticCurveTo(-r, n.h + n.w * 0.5, 0, n.h + n.w * 0.72);
      ty.quadraticCurveTo(r, n.h + n.w * 0.5, r, n.h);
      ty.absarc(0, n.h, r * 0.96, 0, Math.PI, false);
      out.push(P(new THREE.ShapeGeometry(ty, seg), TAJ.BACK, { x, y: yb, z, ry }));
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
  { const [x, z] = onFace(0, 0, d - 0.00035, ry, t); out.push(...box(w, 0.0009, 0.0007, TAJ.WM, { x, y, z, ry })); }
  const n = Math.max(2, Math.round(w / 0.0024));
  for (let i = 0; i < n; i++) {
    const [x, z] = onFace(0, 0, d - 0.00035, ry, t - w / 2 + ((i + 0.5) * w) / n);
    out.push(...box(0.0005, 0.0005, 0.0005, TAJ.WM, { x, y: y + 0.0009, z, ry }));
  }
  return out;
}
// A guldasta: a slim octagonal pinnacle h high, r thick, ringed in grey,
// capped by a little kiosk and lotus bud with a gilded spike.
function guldasta(x: number, z: number, y: number, h: number, r: number): G[] {
  const out: G[] = [cyl(r, r * 0.85, h, 6, TAJ.WM, { x, y, z })];
  for (const f of [0.4, 0.75]) out.push(cyl(r * 1.08, r * 1.08, r * 0.35, 6, TAJ.GREY, { x, y: y + h * f, z }));
  out.push(drumC(r * 1.35, r * 1.35, r * 0.45, 6, TAJ.WM2, { x, y: y + h, z }));
  out.push(lathe([[r * 1.15, 0], [r * 1.2, r * 0.7], [0, r * 1.9]], 6, TAJ.WM, { x, y: y + h + r * 0.45, z }));
  out.push(rod(V(x, y + h + r * 2.2, z), V(x, y + h + r * 3.4, z), r * 0.14, TAJ.GOLD, 4));
  return out;
}
// A minaret standing on (x, y, z): its octagonal base, three tapering
// stages inlaid with dark rings and lines, a balcony on corbels over each,
// a chhatri on top.
function minaret(x: number, z: number, y: number): G[] {
  const out: G[] = [drumC(0.0038, 0.0037, 0.0008, 8, TAJ.WM2, { x, y, z }), drumC(0.0035, 0.0033, 0.0016, 8, TAJ.WM, { x, y: y + 0.0008, z })];
  let yy = y + 0.0024;
  for (const [r0, r1, h] of [[0.0029, 0.0027, 0.0128], [0.0026, 0.0024, 0.0108], [0.0023, 0.0021, 0.0088]] as const) {
    out.push(cyl(r0, r1, h, 10, TAJ.WM, { x, y: yy, z }));
    for (const f of [0.5, 0.94]) {
      const rf = r0 + (r1 - r0) * f + 0.00006;
      out.push(cyl(rf, rf, 0.00028, 10, TAJ.INLAY, { x, y: yy + h * f, z }));
    }
    for (let i = 0; i < 4; i++) {
      const q = (i / 4) * Math.PI * 2 + Math.PI / 4, c = Math.cos(q), sn = Math.sin(q);
      const ra = r0 + 0.00003, rb = r1 + 0.00003;
      out.push(rod(V(x + c * ra, yy, z + sn * ra), V(x + c * rb, yy + h * 0.94, z + sn * rb), 0.00007, TAJ.INLAY, 3));
    }
    yy += h;
    // The balcony: its corbelled underside, floor and parapet, grey-edged.
    out.push(drumC(r1, r1 + 0.0016, 0.0009, 10, TAJ.WM2, { x, y: yy - 0.0002, z }));
    out.push(cyl(r1 + 0.0016, r1 + 0.0016, 0.001, 10, TAJ.WM, { x, y: yy + 0.0007, z }));
    out.push(cyl(r1 + 0.00166, r1 + 0.00166, 0.00018, 10, TAJ.GREY, { x, y: yy + 0.0013, z }));
  }
  out.push(...chhatri(x, z, yy + 0.0007, 0.0032, TAJ.WM, TAJ.WM2, TAJ.GOLD));
  return out;
}
// A chhatri (a domed kiosk), r wide, standing on y: its platform, eight
// slim columns under pointed arches, the sloping eave (chhajja), a drum
// ringed in grey, the dome, its lotus and gilded finial.
function chhatri(x: number, z: number, y: number, r: number, c: number, c2: number, gold: number): G[] {
  const out: G[] = [drumC(r * 1.05, r * 1.05, r * 0.25, 8, c2, { x, y, z })];
  const cr = r * 0.8, ap = cr * Math.cos(Math.PI / 8), aw = 2 * cr * Math.sin(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const q = ((i + 0.5) / 8) * Math.PI * 2;
    out.push(cyl(r * 0.085, r * 0.075, r * 0.95, 4, c, { x: x + Math.sin(q) * cr, y: y + r * 0.25, z: z + Math.cos(q) * cr }));
    // The arch between two columns: the wall over its pointed opening.
    const ry = (i / 8) * Math.PI * 2, ah = r * 0.42, s = new THREE.Shape();
    s.moveTo(-aw / 2, 0); s.lineTo(-aw / 2, ah); s.lineTo(aw / 2, ah); s.lineTo(aw / 2, 0);
    s.quadraticCurveTo(aw / 2, ah * 0.55, 0, ah * 0.8);
    s.quadraticCurveTo(-aw / 2, ah * 0.55, -aw / 2, 0);
    const [ax, az] = onFace(x, z, ap, ry, 0);
    out.push(P(new THREE.ShapeGeometry(s, 2), c, { x: ax, y: y + r * 0.78, z: az, ry }));
  }
  out.push(drumC(r * 0.92, r * 0.92, r * 0.1, 8, c, { x, y: y + r * 1.2, z }));
  out.push(drumC(r * 1.32, r * 0.95, r * 0.14, 8, c2, { x, y: y + r * 1.3, z }));
  out.push(cyl(r * 0.86, r * 0.86, r * 0.3, 8, c, { x, y: y + r * 1.44, z }));
  out.push(cyl(r * 0.875, r * 0.875, r * 0.06, 8, TAJ.GREY, { x, y: y + r * 1.6, z }));
  out.push(lathe([[r * 0.86, 0], [r * 0.98, r * 0.3], [r * 0.95, r * 0.6], [r * 0.7, r * 0.95], [r * 0.35, r * 1.15], [0, r * 1.22]], 8, c, { x, y: y + r * 1.74, z }));
  out.push(lathe([[0, 0], [r * 0.34, r * 0.04], [r * 0.24, r * 0.14], [r * 0.08, r * 0.2]], 6, c2, { x, y: y + r * 2.9, z }));
  out.push(rod(V(x, y + r * 3.0, z), V(x, y + r * 3.6, z), r * 0.06, gold, 4));
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

// The White Heron (the castle alone, on a plain pad): its terrace of
// battered stone; the great keep of five roofs on its own tall stone base
// (white plaster, grey tiled roofs with their triangular and curved
// gables, golden fish on the ridge) and its three lesser keeps joined to it
// by corridors round a court; the castle's white walls with tiled caps
// round the terrace, its gate and corner turrets. (Drawn up to fill its
// site and stand about five cells tall: stretch.)
export function himejiCastle(): G[] {
  const out: G[] = [];
  const WHITE = 0xf3f1ea, ROOF = 0x5a646e, STONE = 0xa8a090, GRAVEL = 0xd9d2c2;
  // The terrace of battered stone, gravel on top.
  const tw = 0.1, td = 0.086, th = 0.012;
  out.push(...frustum(tw, td, tw - 0.006, td - 0.006, th, STONE, {}, GRAVEL));
  for (let i = 0; i < 4; i++) out.push(...frustum(tw + 0.0002 - i * 0.0015, td + 0.0002 - i * 0.0015, tw - 0.0012 - i * 0.0015, td - 0.0012 - i * 0.0015, 0.0004, shade(STONE, 0.86), { y: (i + 0.5) * th / 4.4 }));
  const top = th, iw = tw - 0.006, id = td - 0.006;
  const edge = (x0: number, z0: number, x1: number, z1: number) => out.push(...wall(x0, z0, x1, z1, top, WHITE, ROOF));
  edge(-iw / 2 + 0.002, id / 2 - 0.002, -0.007, id / 2 - 0.002);
  edge(0.007, id / 2 - 0.002, iw / 2 - 0.002, id / 2 - 0.002);
  edge(-iw / 2 + 0.002, -id / 2 + 0.002, -iw / 2 + 0.002, id / 2 - 0.002);
  edge(iw / 2 - 0.002, -id / 2 + 0.002, iw / 2 - 0.002, id / 2 - 0.002);
  edge(-iw / 2 + 0.002, -id / 2 + 0.002, iw / 2 - 0.002, -id / 2 + 0.002);
  out.push(...yagura(0, id / 2 - 0.004, top, 0.012, 0.007, WHITE, ROOF, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...yagura(sx * (iw / 2 - 0.0055), sz * (id / 2 - 0.0052), top, 0.008, 0.007, WHITE, ROOF, 0));
  // The great keep and its three lesser keeps, the corridors joining them.
  out.push(...keep(0.014, 0.008, top, [[0.034, 0.028, 0.009], [0.03, 0.024, 0.0075], [0.026, 0.021, 0.0072], [0.022, 0.018, 0.0066], [0.017, 0.014, 0.0072]], WHITE, ROOF, STONE, 1));
  out.push(...keep(-0.026, 0.012, top, [[0.02, 0.017, 0.0075], [0.016, 0.014, 0.0066], [0.012, 0.011, 0.0066]], WHITE, ROOF, STONE, 2));
  out.push(...keep(-0.026, -0.022, top, [[0.018, 0.016, 0.0072], [0.014, 0.012, 0.0064], [0.011, 0.01, 0.0062]], WHITE, ROOF, STONE, 3));
  out.push(...keep(0.016, -0.028, top, [[0.018, 0.016, 0.0072], [0.014, 0.012, 0.0064], [0.011, 0.01, 0.0062]], WHITE, ROOF, STONE, 4));
  out.push(...corridor(-0.026, 0.003, -0.026, -0.013, top, WHITE, ROOF), ...corridor(-0.017, -0.024, 0.007, -0.027, top, WHITE, ROOF));
  out.push(...corridor(0.016, -0.019, 0.016, -0.006, top, WHITE, ROOF), ...corridor(-0.016, 0.012, -0.003, 0.012, top, WHITE, ROOF));
  return [flat(2 * H, 2 * H, 0xcfc8b8, 0, 0, 0.0003), ...stretch(out, 1.44, 2.1)];
}
// A white wall with a tiled cap from (x0, z0) to (x1, z1), on y.
function wall(x0: number, z0: number, x1: number, z1: number, y: number, white: number, roof: number): G[] {
  return [...run(x0, z0, x1, z1, 0.0012, 0.0036, white, y), ...run(x0, z0, x1, z1, 0.0024, 0.0008, roof, y + 0.0036)];
}
// A Japanese hipped roof: from eaves w × d at y up to w1 × d1, flaring at
// the eaves; a dark soffit under the eaves.
function jRoof(x: number, z: number, y: number, w: number, d: number, w1: number, d1: number, h: number, roof: number, ry = 0): G[] {
  const mw = w1 + (w - w1) * 0.38, md = d1 + (d - d1) * 0.38;
  return [
    ...frustum(w, d, mw, md, h * 0.28, shade(roof, 1.05), { x, y, z, ry }),
    ...frustum(mw, md, w1, d1, h * 0.72, roof, { x, y: y + h * 0.28, z, ry }),
    P(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), 0x3a3a3c, { x, y: y - 0.00005, z, ry }),
  ];
}
// A keep: its stone base, then storeys (w, d, h) each under its roof, with
// windows and gables; the top under a hip-and-gable roof with golden fish.
function keep(x: number, z: number, y: number, storeys: readonly (readonly [number, number, number])[], white: number, roof: number, stone: number, seed: number): G[] {
  const r = rnd(seed * 7), out: G[] = [];
  const [w0, d0] = storeys[0]!;
  const sb = 0.006 + w0 * 0.25;
  out.push(...frustum(w0 + 0.006, d0 + 0.006, w0 + 0.001, d0 + 0.001, sb, stone, { x, y, z }, shade(stone, 1.1)));
  let yy = y + sb;
  storeys.forEach(([w, d, h], i) => {
    const next = storeys[i + 1];
    out.push(ring(w, h, d, white, { x, y: yy, z }));
    // Windows, a row of dark slits under each storey's eaves, a dark band at the foot.
    for (const [ry, len, o] of [[0, w, d / 2], [Math.PI, w, d / 2], [Math.PI / 2, d, w / 2], [-Math.PI / 2, d, w / 2]] as const) {
      const n = Math.max(2, Math.floor(len / 0.004));
      for (let k = 0; k < n; k++) {
        const t = -len / 2 + (k + 0.5) * (len / n), [fx, fz] = onFace(x, z, o + 0.0002, ry, t);
        out.push(pane(0.0014, 0.0016, 0x2e2e30, fx, yy + h * 0.5, fz, ry));
      }
      const [bx, bz] = onFace(x, z, o + 0.0002, ry, 0);
      out.push(pane(len, h * 0.12, 0x8a8a86, bx, yy, bz, ry));
    }
    yy += h;
    if (next) {
      const ov = 0.0038, rh = 0.0042;
      out.push(...jRoof(x, z, yy, w + ov * 2, d + ov * 2, next[0], next[1], rh, roof));
      // Gables on the roof: triangular on the long sides here, curved there.
      const kind = (i + seed) % 3;
      for (const s of [-1, 1]) {
        const fz = z + s * (d / 2 + ov * 0.35);
        if (kind === 0) out.push(...gable(0.0085, 0.006, 0.0042, roof, { x, y: yy + rh * 0.12, z: fz, ry: s > 0 ? 0 : Math.PI }, true, white));
        else if (kind === 1) {
          for (const t of [-1, 1]) out.push(...gable(0.006, 0.005, 0.0034, roof, { x: x + t * w * 0.24, y: yy + rh * 0.15, z: fz, ry: s > 0 ? 0 : Math.PI }, true, white));
        } else out.push(...karaHafu(x, fz, yy + rh * 0.1, 0.008, s > 0 ? 0 : Math.PI, roof, white));
        if (r() < 0.5) {
          const fx = x + s * (w / 2 + ov * 0.35);
          out.push(...gable(0.006, 0.005, 0.0034, roof, { x: fx, y: yy + rh * 0.15, z, ry: s > 0 ? Math.PI / 2 : -Math.PI / 2 }, true, white));
        }
      }
      yy += rh;
    } else {
      // The top: a hipped lower skirt, a gabled roof over it, golden fish at the ridge's ends.
      const ov = 0.004;
      out.push(...jRoof(x, z, yy, w + ov * 2, d + ov * 2, w * 0.9, d * 0.62, 0.0035, roof));
      out.push(...gable(w * 0.95, d * 0.66, 0.0062, roof, { x, y: yy + 0.0035, z }, false, white));
      out.push(rod(V(x - w * 0.47, yy + 0.0097, z), V(x + w * 0.47, yy + 0.0097, z), 0.0005, shade(roof, 0.8), 4));
      for (const s of [-1, 1]) out.push(P(new THREE.ConeGeometry(0.0008, 0.0028, 4).translate(0, 0.0014, 0), 0xd9b04a, { x: x + s * w * 0.47, y: yy + 0.0097, z, rz: s * 0.5 }));
      yy += 0.0097;
    }
  });
  return out;
}
// A curved gable (kara-hafu): a half barrel roof over a white face, set on
// a roof's slope facing ry.
function karaHafu(x: number, z: number, y: number, w: number, ry: number, roof: number, white: number): G[] {
  // (A half barrel, its axis outward, its arch on top; a white face under its front end.)
  const len = 0.006, barrel = new THREE.CylinderGeometry(w / 2, w / 2, len, 10, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
  const [fx, fz] = [x + Math.sin(ry) * (len / 2 - 0.0002), z + Math.cos(ry) * (len / 2 - 0.0002)];
  return [
    P(barrel, roof, { x, y: y + 0.0012, z, ry, sy: 0.7 }),
    P(new THREE.CircleGeometry((w / 2) * 0.9, 10, 0, Math.PI).scale(1, 0.7, 1), white, { x: fx, y: y + 0.0012, z: fz, ry }),
    P(new THREE.PlaneGeometry(w * 0.9, 0.0012).translate(0, 0.0006, 0), white, { x: fx, y, z: fz, ry }),
  ];
}
// A turret: one white storey under a hipped roof, its gable to the front.
function yagura(x: number, z: number, y: number, w: number, d: number, white: number, roof: number, ry: number): G[] {
  return [
    ...box(w, 0.006, d, white, { x, y, z, ry }),
    ...jRoof(x, z, y + 0.006, w + 0.004, d + 0.004, w * 0.6, d * 0.25, 0.0045, roof, ry),
    ...gable(0.005, 0.004, 0.0028, roof, { x: x + Math.sin(ry) * (d / 2 + 0.0012), y: y + 0.0068, z: z + Math.cos(ry) * (d / 2 + 0.0012), ry }, true, white),
  ];
}
// A corridor between keeps: a long white storey under a gabled roof.
function corridor(x0: number, z0: number, x1: number, z1: number, y: number, white: number, roof: number): G[] {
  const l = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  return [
    ...frustum(0.011, l, 0.008, l, 0.004, 0xa8a090, { x, y, z, ry }, 0xb8b0a0),
    ...box(0.007, 0.0072, l, white, { x, y: y + 0.004, z, ry }),
    ...gable(0.0105, l + 0.002, 0.0038, roof, { x, y: y + 0.0112, z, ry }, true, white),
  ];
}

// ---------- Beijing ----------

// The heart of the palace (on a plain pad): its court walled in red under
// yellow caps, corner towers, the Gate of Supreme Harmony in the front
// wall; within, on the triple terrace of white marble with its balustrades
// and carved ramp, the Hall of Supreme Harmony (double eaves of yellow tile
// on red columns and walls), the Hall of Central Harmony and the Hall of
// Preserving Harmony behind it. (Built small, then drawn up to fill its
// site and stand about three cells tall: stretch.)
export function forbiddenCity(): G[] {
  const out: G[] = [];
  const RED = 0xa8332a, YELLOW = 0xf0c020, MARBLE = 0xece8de, PAVE = 0xc8c0b0;
  // The court: paved, walled, corner towers, the gate in the front wall.
  const W = 0.0295;
  out.push(flat(2 * W, 2 * W, PAVE, 0, 0, 0.0006));
  for (const [x0, z0, x1, z1] of [[-W, -W, W, -W], [-W, -W, -W, W], [W, -W, W, W], [-W, W, -0.0125, W], [0.0125, W, W, W]] as const) {
    // (The cap runs on past the wall's ends, so their ends never share a face.)
    const l = Math.hypot(x1 - x0, z1 - z0), ex = ((x1 - x0) / l) * 0.0007, ez = ((z1 - z0) / l) * 0.0007;
    out.push(...run(x0, z0, x1, z1, 0.002, 0.0065, RED, 0, shade(RED, 0.85)), ...run(x0 - ex, z0 - ez, x1 + ex, z1 + ez, 0.0028, 0.0008, YELLOW, 0.0065));
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...cornerTower(sx * (W - 0.0045), sz * (W - 0.0045), 0.0065, RED, YELLOW));
  out.push(...steps(0.026, 0.009, 2, 0.0012, 0.001, MARBLE, { z: W - 0.003 }).parts);
  out.push(...hall(0, W - 0.003, 0.0024, 0.022, 0.0065, RED, YELLOW, true));
  // The triple terrace of white marble, its balustrades and its carved ramp.
  const tz = -0.004, tiers = [[0.048, 0.044], [0.044, 0.04], [0.04, 0.036]] as const;
  let ty = 0;
  for (const [w, d] of tiers) {
    out.push(...box(w, 0.0022, d, MARBLE, { y: ty, z: tz }, shade(MARBLE, 0.97)));
    out.push(ring(w - 0.0006, 0.0011, d - 0.0006, shade(MARBLE, 1.02), { y: ty + 0.0022, z: tz }));
    for (let i = 0; i < Math.floor(w / 0.0028); i++) for (const s of [-1, 1]) out.push(...box(0.0005, 0.0016, 0.0005, MARBLE, { x: -w / 2 + 0.0003 + i * 0.0028, y: ty + 0.0022, z: tz + s * (d / 2 - 0.0003) }));
    ty += 0.0022;
  }
  out.push(P(new THREE.PlaneGeometry(0.006, 0.0085).rotateX(-Math.PI / 2 + Math.atan2(ty, 0.0085)), 0xb8b4a8, { y: ty / 2, z: tz + 0.022 + 0.0042 }));
  // The three halls on it.
  out.push(...hall(0, tz + 0.007, ty, 0.036, 0.012, RED, YELLOW, true, 0.011));
  out.push(...pavilion(0, tz - 0.004, ty, 0.009, RED, YELLOW));
  out.push(...hall(0, tz - 0.013, ty, 0.03, 0.008, RED, YELLOW, true));
  return [flat(2 * H, 2 * H, 0xb8b0a2, 0, 0, 0.0003), ...stretch(out, 2.4, 3.9)];
}
// A Chinese hall: its red columns and walls on a low base, under a hipped
// roof of yellow tiles (double eaves when `double`), its ridge beasts.
function hall(x: number, z: number, y: number, w: number, d: number, red: number, yellow: number, double: boolean, h = d * 0.75): G[] {
  const out: G[] = [];
  out.push(...box(w - 0.002, h, d - 0.002, red, { x, y, z }));
  // The colonnade along the front and back: red columns, lattice doors between.
  const n = Math.max(3, Math.round(w / 0.0034));
  for (let i = 0; i <= n; i++) {
    const t = -w / 2 + 0.0004 + (i * (w - 0.0008)) / n;
    for (const s of [-1, 1]) out.push(cyl(0.00045, 0.00045, h, 5, shade(red, 0.9), { x: x + t, y, z: z + s * (d / 2 - 0.0004) }));
    if (i < n) out.push(pane((w - 0.0008) / n * 0.7, h * 0.7, 0x7a3a28, x + t + (w - 0.0008) / n / 2, y + h * 0.05, z + d / 2 - 0.0009));
  }
  out.push(pane(w - 0.001, h * 0.16, 0x3d6a7a, x, y + h * 0.84, z + d / 2 + 0.0001));
  const ey = y + h, ov = 0.0028;
  if (double) {
    out.push(...curvedRoof(x, z, ey, w + ov * 2, d + ov * 2, w - 0.001, d - 0.001, 0.0028, yellow));
    out.push(...box(w - 0.004, h * 0.4, d - 0.004, red, { x, y: ey + 0.0028 - 0.0004, z }));
    out.push(pane(w - 0.005, h * 0.3, 0x3d6a7a, x, ey + 0.0028, z + (d - 0.004) / 2 + 0.0001));
    out.push(...curvedRoof(x, z, ey + 0.0028 - 0.0004 + h * 0.4, w + ov * 1.4, d + ov * 1.4, w * 0.62, 0.0012, d * 0.55, yellow));
    out.push(...beasts(x, z, ey + 0.0024 + h * 0.4 + d * 0.55, w * 0.62, yellow));
  } else {
    out.push(...curvedRoof(x, z, ey, w + ov * 2, d + ov * 2, w * 0.6, 0.0012, d * 0.5, yellow));
    out.push(...beasts(x, z, ey + d * 0.5, w * 0.6, yellow));
  }
  return out;
}
// A hipped roof whose slopes sag (two pitches: steep above, flat at the
// eaves), from eaves w × d at y up to w1 × d1, h high.
function curvedRoof(x: number, z: number, y: number, w: number, d: number, w1: number, d1: number, h: number, c: number): G[] {
  const mw = w1 + (w - w1) * 0.42, md = d1 + (d - d1) * 0.42;
  return [
    ...frustum(w, d, mw, md, h * 0.3, shade(c, 1.04), { x, y, z }),
    ...frustum(mw, md, w1, d1, h * 0.7, c, { x, y: y + h * 0.3, z }),
    P(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), 0x6a3a2a, { x, y: y - 0.00005, z }),
  ];
}
// The ridge and the beasts at its ends.
function beasts(x: number, z: number, y: number, w: number, c: number): G[] {
  return [
    ...box(w, 0.0008, 0.0012, shade(c, 0.85), { x, y: y - 0.0002, z }),
    ...[-1, 1].map((s) => P(new THREE.ConeGeometry(0.0007, 0.0024, 4).translate(0, 0.0012, 0), shade(c, 0.8), { x: x + s * w / 2, y: y + 0.0004, z, rz: -s * 0.35 })),
  ];
}
// A square pavilion under a pyramid roof (double eaves), its gilded knob.
function pavilion(x: number, z: number, y: number, w: number, red: number, yellow: number): G[] {
  const h = w * 0.55;
  return [
    ...box(w - 0.0016, h, w - 0.0016, red, { x, y, z }),
    pane(w * 0.4, h * 0.65, 0x7a3a28, x, y, z + (w - 0.0016) / 2 + 0.0001),
    ...curvedRoof(x, z, y + h, w + 0.004, w + 0.004, w * 0.55, w * 0.55, 0.002, yellow),
    ...box(w * 0.5, h * 0.35, w * 0.5, red, { x, y: y + h + 0.0016, z }),
    P(new THREE.ConeGeometry((w + 0.002) * Math.SQRT1_2, w * 0.45, 4, 1, true).rotateY(Math.PI / 4).translate(0, w * 0.225, 0), yellow, { x, y: y + h + 0.0016 + h * 0.35, z }),
    ball(0.0009, 0xd9b04a, { x, y: y + h + 0.0016 + h * 0.35 + w * 0.45, z }),
  ];
}
// A corner tower: a red pavilion on the wall, its roof of crossed gables.
function cornerTower(x: number, z: number, y: number, red: number, yellow: number): G[] {
  const w = 0.0065;
  return [
    ...box(w, 0.0042, w, red, { x, y, z }),
    ...curvedRoof(x, z, y + 0.0042, w + 0.003, w + 0.003, w * 0.7, w * 0.7, 0.0016, yellow),
    ...gable(w * 0.85, w * 0.45, 0.0022, yellow, { x, y: y + 0.0058, z }, false, shade(yellow, 0.85)),
    ...gable(w * 0.85, w * 0.45, 0.0022, yellow, { x, y: y + 0.0058, z }, true, shade(yellow, 0.85)),
    ball(0.0006, 0xd9b04a, { x, y: y + 0.0081, z }),
  ];
}
