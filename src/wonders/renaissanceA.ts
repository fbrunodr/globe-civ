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
// its bottom middle at x, y, z.
function pointed(w: number, h: number, c: number, x: number, y: number, z: number, ry = 0): G {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h);
  s.quadraticCurveTo(-w / 2, h + w * 0.5, 0, h + w * 0.72);
  s.quadraticCurveTo(w / 2, h + w * 0.5, w / 2, h);
  s.lineTo(w / 2, 0);
  return P(new THREE.ShapeGeometry(s, 4), c, { x, y, z, ry });
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

// The white tomb on its plinth (the monument alone, on a plain pad): an
// octagonal-cornered block, each face's great iwan framed in its pishtaq
// (a pointed arch in a band of black inlay), arches two high on the cut
// corners, pinnacles at every corner; the onion dome on its drum, its
// lotus crown and gilded finial; four domed kiosks round it; four minarets
// with their balconies at the plinth's corners. (Built small, then drawn
// up to fill its site and stand about six cells tall: stretch.)
export function tajMahal(): G[] {
  const out: G[] = [];
  const WM = 0xf3eee4, WM2 = 0xe2dccd, INLAY = 0x4a4038, RECESS = 0xc9c0ae, DOOR = 0x3a332c, GOLD = 0xd9b04a;
  const tz = 0;
  // The plinth, its blind arcade.
  const py = 0, ph = 0.0055, pw = 0.066;
  out.push(...box(pw, ph, pw, WM, { y: py, z: tz }, WM2));
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2;
    for (let k = 0; k < 9; k++) {
      const t = -pw / 2 + 0.004 + k * ((pw - 0.008) / 8);
      const [x, z] = onFace(0, tz, pw / 2 + 0.0002, ry, t);
      out.push(pointed(0.0034, 0.0018, RECESS, x, py + 0.0008, z, ry));
    }
  }
  // The tomb: its block with cut corners.
  const by = py + ph, bh = 0.026, bw = 0.046, a = bw / 2, k = bw * 0.2;
  out.push(...chamfered(bw, bh, bw, 0.2, WM, { y: by, z: tz }, WM2));
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2;
    // The pishtaq: a raised frame, rising above the roof, its iwan within.
    const [px, pz] = onFace(0, tz, a + 0.0006, ry, 0);
    out.push(...box(0.019, 0.03, 0.0016, WM, { x: px, y: by, z: pz, ry }, WM2));
    const o = a + 0.0014 + 0.0002;
    const [rx, rz] = onFace(0, tz, o, ry, 0);
    out.push(pointed(0.0115, 0.0135, RECESS, rx, by + 0.002, rz, ry));
    const [dx, dz] = onFace(0, tz, o + 0.0002, ry, 0);
    out.push(pointed(0.005, 0.006, DOOR, dx, by + 0.002, dz, ry));
    { const [lx, lz] = onFace(0, tz, o + 0.0001, ry, 0); out.push(pane(0.009, 0.0014, shade(RECESS, 0.9), lx, by + 0.0105, lz, ry)); }
    // The inlaid band round it.
    for (const t of [-0.0071, 0.0071]) { const [x, z] = onFace(0, tz, o, ry, t); out.push(pane(0.0009, 0.0225, INLAY, x, by + 0.0015, z, ry)); }
    { const [x, z] = onFace(0, tz, o, ry, 0); out.push(pane(0.0151, 0.0009, INLAY, x, by + 0.0244, z, ry)); }
    // Its pinnacles.
    for (const t of [-0.0098, 0.0098]) {
      const [x, z] = onFace(0, tz, a + 0.0006, ry, t);
      out.push(cyl(0.0008, 0.0007, 0.0355, 6, WM, { x, y: by, z }), ball(0.001, WM, { x, y: by + 0.0362, z }));
    }
    // The cut corners: arches two high.
    const rd = ry + Math.PI / 4, dd = (2 * a - k) / Math.SQRT2 + 0.0003;
    for (const yy of [by + 0.002, by + 0.0145]) {
      const [x, z] = onFace(0, tz, dd, rd, 0);
      out.push(pointed(0.0068, 0.0065, RECESS, x, yy, z, rd));
      const [x2, z2] = onFace(0, tz, dd + 0.0002, rd, 0);
      out.push(pointed(0.003, 0.0035, DOOR, x2, yy, z2, rd));
    }
    // Beside the pishtaq, narrow arches two high.
    for (const t of [-0.0118, 0.0118]) for (const yy of [by + 0.002, by + 0.0145]) {
      const [x, z] = onFace(0, tz, a + 0.0002, ry, t);
      out.push(pointed(0.0026, 0.0068, RECESS, x, yy, z, ry));
    }
  }
  // Pinnacles at the eight corners of the block.
  for (let i = 0; i < 8; i++) {
    const q = i < 4 ? i : i - 4, sx = q === 0 || q === 3 ? 1 : -1, sz = q < 2 ? 1 : -1;
    const [x, z] = i < 4 ? [sx * (a - k), sz * a] : [sx * a, sz * (a - k)];
    out.push(cyl(0.0009, 0.0008, bh + 0.005, 6, WM, { x, y: by, z: tz + z }), ball(0.0011, WM, { x, y: by + bh + 0.0056, z: tz + z }));
  }
  // The drum, its blind arches; the dome, its lotus crown and finial.
  const dy = by + bh;
  out.push(drumC(0.0128, 0.0128, 0.0085, 24, WM, { y: dy, z: tz }));
  for (let i = 0; i < 16; i++) {
    const ry = (i / 16) * Math.PI * 2, [x, z] = onFace(0, tz, 0.013, ry, 0);
    out.push(pointed(0.0028, 0.0035, RECESS, x, dy + 0.0015, z, ry));
  }
  const top = dy + 0.0085;
  out.push(lathe([[0.0128, 0], [0.0152, 0.003], [0.0165, 0.0065], [0.0163, 0.0095], [0.0149, 0.0125], [0.0123, 0.0152], [0.0089, 0.0175], [0.0053, 0.0193], [0.0024, 0.0205], [0.0009, 0.0211], [0, 0.0213]], 28, WM, { y: top, z: tz }));
  out.push(lathe([[0, 0], [0.0032, 0.0004], [0.0024, 0.0012], [0.001, 0.0016]], 12, WM2, { y: top + 0.0205, z: tz }));
  out.push(rod(V(0, top + 0.021, tz), V(0, top + 0.0295, tz), 0.00035, GOLD, 5));
  for (const [yy, rr] of [[0.0232, 0.0011], [0.0256, 0.0008]] as const) out.push(ball(rr, GOLD, { y: top + yy, z: tz }, 1));
  out.push(P(new THREE.TorusGeometry(0.0013, 0.00025, 4, 10, Math.PI * 1.4).rotateZ(-0.2 * Math.PI), GOLD, { y: top + 0.0302, z: tz }));
  // The four domed kiosks round the dome.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...chhatri(sx * 0.0165, tz + sz * 0.0165, dy, 0.0045, WM, WM2, GOLD));
  // The minarets.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (pw / 2 - 0.0035), z = tz + sz * (pw / 2 - 0.0035), y = py + ph;
    out.push(drumC(0.0036, 0.0034, 0.002, 8, WM, { x, y, z }));
    const seg = [[0.0029, 0.0027, 0.013], [0.0026, 0.0024, 0.011], [0.0023, 0.0021, 0.009]] as const;
    let yy = y + 0.002;
    for (const [r0, r1, h] of seg) {
      out.push(cyl(r0, r1, h, 10, WM, { x, y: yy, z }));
      for (const f of [0.3, 0.65]) out.push(cyl(r0 + 0.0001, r0 + 0.0001, 0.0003, 10, INLAY, { x, y: yy + h * f, z }));
      yy += h;
      out.push(drumC(r1 + 0.0016, r1 + 0.0018, 0.0007, 10, WM2, { x, y: yy, z }));
      out.push(cyl(r1 + 0.0016, r1 + 0.0016, 0.0011, 10, WM, { x, y: yy + 0.0007, z }));
    }
    out.push(...chhatri(x, z, yy + 0.0007, 0.0032, WM, WM2, GOLD));
  }
  return [flat(2 * H, 2 * H, 0xd8d0c0, 0, 0, 0.0003), ...stretch(out, 2.18, 3.5)];
}
// A domed kiosk on slender columns (a chhatri), r wide, standing on y.
function chhatri(x: number, z: number, y: number, r: number, c: number, c2: number, gold: number): G[] {
  const out: G[] = [drumC(r, r, r * 0.3, 8, c2, { x, y, z })];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; out.push(cyl(r * 0.1, r * 0.09, r * 1.0, 4, c, { x: x + Math.cos(a) * r * 0.78, y: y + r * 0.3, z: z + Math.sin(a) * r * 0.78 })); }
  out.push(drumC(r * 1.1, r * 1.05, r * 0.18, 10, c2, { x, y: y + r * 1.3, z }));
  out.push(lathe([[r * 0.95, 0], [r * 1.0, r * 0.35], [r * 0.82, r * 0.75], [r * 0.45, r * 1.05], [0, r * 1.2]], 12, c, { x, y: y + r * 1.48, z }));
  out.push(rod(V(x, y + r * 2.6, z), V(x, y + r * 3.2, z), r * 0.07, gold, 4));
  return out;
}
// ---------- Moscow ----------

// The cathedral alone (on a plain pad): nine chapels on their raised
// gallery, the tall central one under its tented spire, four great
// octagonal chapels on the axes and four lesser ones between, each with
// its tiers of kokoshnik gables, its drum and its onion dome, striped,
// twisted, scaled and checked in its own colours, a gilded cross on each;
// the arcaded gallery round them in red brick and white stone. (Drawn up
// to fill its site and stand about five cells tall: stretch.)
export function stBasils(): G[] {
  const out: G[] = [];
  const BRICK = 0xa8452f, TRIM = 0xefe9dd, DARK = 0x3a2a24, GOLD = 0xd8b048;
  const cz = 0, gy = 0.009;
  // The gallery: an octagon of arcades, its white cornice, the terrace on top.
  out.push(...chamfered(0.104, gy, 0.1, 0.28, BRICK, { z: cz }, shade(BRICK, 0.82)));
  out.push(...chamfered(0.1052, 0.001, 0.1012, 0.28, TRIM, { y: gy - 0.0012, z: cz }));
  out.push(...chamfered(0.1052, 0.0008, 0.1012, 0.28, TRIM, { y: 0.0012, z: cz }));
  for (let f = 0; f < 8; f++) {
    const ry = (f * Math.PI) / 4, axis = f % 2 === 0, d = axis ? (f % 4 === 0 ? 0.05 : 0.052) : 0.0517 * 0.98;
    const len = axis ? 0.042 : 0.04, n = 5;
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * (len / n), [x, z] = onFace(0, cz, d + 0.0003, ry, t);
      out.push(...archTop(0.0042, 0.0034, TRIM, x, 0.0022, z, ry), ...archTop(0.003, 0.003, DARK, ...sh(x, z, ry, 0.0002, 0.0024), ry));
    }
  }
  // The chapels.
  const schemes: [number[], number, boolean][] = [
    [[0x3d8a4a, 0xf0e8d0], 0.9, false], [[0xc8402e, 0xf0d86a], -0.9, false], [[0x2f6aa8, 0xf0ece0], 0.6, true], [[0x4a9a5a, 0xe2b040], -1.1, false],
    [[0xd84a3a, 0x3a9a5a], 0.7, true], [[0xd8b048, 0xc89a38], 0.5, false], [[0x3a8a9a, 0xe8c04a], -0.8, false], [[0xc84a3a, 0xf0ece0], 1.0, false],
  ];
  // Great chapels on the axes, lesser between; the front one first.
  const axes = [[0, 0.032], [0.032, 0], [0, -0.032], [-0.032, 0]] as const;
  axes.forEach(([x, z], i) => out.push(...chapel(x, cz + z, gy - 0.0003, 0.02, 0.026, 0.0055, 0.011, 0.0092, 0.0175, schemes[i]!, BRICK, TRIM, DARK, GOLD)));
  const diag = [[0.0235, 0.0235], [0.0235, -0.0235], [-0.0235, -0.0235], [-0.0235, 0.0235]] as const;
  diag.forEach(([x, z], i) => out.push(...chapel(x, cz + z, gy - 0.0003, 0.0132, 0.02, 0.0039, 0.008, 0.0064, 0.012, schemes[4 + i]!, BRICK, TRIM, DARK, GOLD)));
  // The central chapel: its octagon, tiers of gables, the tented spire and its little dome.
  const cw = 0.026, ch = 0.04;
  out.push(...chamfered(cw, ch + 0.0003, cw, 0.29, BRICK, { y: gy - 0.0003, z: cz }));
  for (const yy of [0.012, 0.026, ch - 0.0012]) out.push(...chamfered(cw + 0.001, 0.0011, cw + 0.001, 0.29, TRIM, { y: gy + yy, z: cz }));
  for (let f = 0; f < 8; f++) {
    const ry = (f * Math.PI) / 4, [x, z] = onFace(0, cz, cw / 2 + 0.0003, ry, 0);
    out.push(...archTop(0.0032, 0.007, TRIM, x, gy + 0.015, z, ry), ...archTop(0.0019, 0.006, DARK, ...sh(x, z, ry, 0.0002, gy + 0.0157), ry));
    for (const t of [-0.0035, 0.0035]) { const [x2, z2] = onFace(0, cz, cw / 2 + 0.0003, ry, t); out.push(...archTop(0.0022, 0.0035, TRIM, x2, gy + 0.029, z2, ry)); }
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
