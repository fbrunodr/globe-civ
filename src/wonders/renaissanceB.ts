// Four of the Renaissance era's wonders (renaissance.ts): Florence's
// cathedral, Versailles, the Templo Mayor and St Peter's, each on its 7 × 7
// site, in site units (kit.ts), the front +z.

import * as THREE from 'three';
import { gable } from '../houseKit.ts';
import type { GroundTree, WaterArea, WonderGrounds } from '../wonderModels.ts';
import {
  P, V, archPane, ball, box, cone, drumC, figure, flat, H, pane, rnd, rod, shade, type G,
} from './kit.ts';

const DARK = 0x3a332d, WATER = 0x5f8fa3, GOLD = 0xd9b24a;

// A lathed shell (a dome, a bowl): the profile's (radius, height) points
// turned round the vertical in n flat facets, a corner at phi.
function lathe(profile: readonly (readonly [number, number])[], n: number, c: number, o: { x?: number; y?: number; z?: number } = {}, phi = 0): G {
  return P(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), n, phi), c, o);
}
// Fits a building to the in-city pad: its footprint moved dz along z to
// the middle and scaled sH across; its heights raised by a two-slope map
// (a below y0, b above: the body stretched more than a dome, say), then by
// sH too. (The town is drawn taller than true, its wonders likewise.)
// Raises a group of parts by a piecewise map of height: from y = 0 each
// zone [until, slope] stretches what lies under `until` by `slope`.
function raise(parts: readonly G[], zones: readonly (readonly [number, number])[]): void {
  const map = (y: number) => {
    let at = 0, out = 0;
    for (const [until, k] of zones) { if (y <= until) return out + (y - at) * k; out += (until - at) * k; at = until; }
    return out;
  };
  for (const g of parts) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, map(p.getY(i)));
    p.needsUpdate = true;
  }
}
function fitTo(parts: G[], dz: number, sH: number, y0: number, a: number, b: number): G[] {
  for (const g of parts) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), yy = y < y0 ? y * a : y0 * a + (y - y0) * b;
      p.setXYZ(i, p.getX(i) * sH, yy * sH, (p.getZ(i) + dz) * sH);
    }
    p.needsUpdate = true;
  }
  return parts;
}
// A round window: a disc facing ry, its middle at x, y, z.
// (sy: squashed to stand round once its group is raised.)
const oculus = (r: number, c: number, x: number, y: number, z: number, ry: number, sy = 1) => P(new THREE.CircleGeometry(r, 10), c, { x, y, z, ry, sy });
const halo = (r0: number, r1: number, c: number, x: number, y: number, z: number, ry: number, sy = 1) => P(new THREE.RingGeometry(r0, r1, 12), c, { x, y, z, ry, sy });
// A triangle standing in a vertical plane facing ry (a gable, a pediment).
function tri(w: number, h: number, c: number, x: number, y: number, z: number, ry = 0): G {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0], 3));
  return P(g, c, { x, y, z, ry });
}
// A face of an octagon (its faces toward the axes): its outward normal and
// tangent, the apothem of an octagon of corner radius r.
const octFace = (k: number, r: number) => {
  const a = (k * Math.PI) / 4;
  return { nx: Math.sin(a), nz: Math.cos(a), tx: Math.cos(a), tz: -Math.sin(a), ry: a, ap: r * Math.cos(Math.PI / 8), w: 2 * r * Math.sin(Math.PI / 8) };
};

// ---------- Florence ----------

// Santa Maria del Fiore: Brunelleschi's dome, eight ribs of white marble
// on red tiles rising in a pointed curve to the lantern, on its drum with
// round windows; the three tribunes round the crossing with their half
// domes; the nave and aisles cased in white marble panelled in green and
// pink, Gothic windows below, round ones above; the facade with its three
// portals, rose window and gable; Giotto's bell tower at its corner.
// (Alone on its pad: the baptistery and the piazza left out.)
export function florenceCathedral(): G[] {
  const FA = 1.3, FD = 1.4; // how much the body and dome, and the drum, are raised (see the end)
  const MARBLE = 0xece6d8, GREEN = 0x4d6b56, PINK = 0xcc9c8c, TILE = 0xb85f3e, PAVE = 0xcdc3b0;
  const out: G[] = [];
  const zc = -0.024, R0 = 0.022, nave = 0.04;
  // Panels on a vertical face: pink fields, green strips framing them, green bands, at layered offsets.
  const panels = (cx: number, cz: number, nx: number, nz: number, tx: number, tz: number, ry: number, w: number, y0: number, h: number, step: number, bands: readonly number[]) => {
    const at = (t: number, o: number) => [cx + nx * o + tx * t, cz + nz * o + tz * t] as const;
    const n = Math.max(1, Math.round(w / step));
    for (let i = 0; i < n; i++) {
      const t = -w / 2 + (i + 0.5) * (w / n), [x, z] = at(t, 0.0002);
      out.push(pane((w / n) * 0.62, h * 0.5, PINK, x, y0 + h * 0.18, z, ry));
    }
    for (let i = 0; i <= n; i++) { const t = -w / 2 + (i * w) / n, [x, z] = at(t, 0.0004); out.push(pane(0.0008, h, GREEN, x, y0, z, ry)); }
    for (const b of bands) { const [x, z] = at(0, 0.0006); out.push(pane(w, 0.0008, GREEN, x, y0 + b * h, z, ry)); }
  };
  // The octagon round the crossing, panelled; its three tribunes.
  out.push(drumC(R0, R0, nave, 8, MARBLE, { z: zc, ry: Math.PI / 8 }));
  for (let k = 0; k < 8; k++) {
    if (k === 0) continue; // (the nave joins there)
    const f = octFace(k, R0);
    panels(f.nx * f.ap, zc + f.nz * f.ap, f.nx, f.nz, f.tx, f.tz, f.ry, f.w, 0, nave, 0.0056, [0.02, 0.42, 0.97]);
    out.push(oculus(0.0022, DARK, f.nx * (f.ap + 0.0008), nave * 0.74, zc + f.nz * (f.ap + 0.0008), f.ry, 1 / FA));
  }
  for (const k of [2, 4, 6]) {
    const f = octFace(k, R0), x = f.nx * (R0 + 0.004), z = zc + f.nz * (R0 + 0.004), rt = 0.011, ht = 0.028;
    out.push(drumC(rt, rt, ht, 8, MARBLE, { x, z, ry: Math.PI / 8 }));
    for (const j of [k - 1, k, k + 1]) {
      const g = octFace(j, rt);
      panels(x + g.nx * g.ap, z + g.nz * g.ap, g.nx, g.nz, g.tx, g.tz, g.ry, g.w, 0, ht, 0.005, [0.02, 0.5, 0.97]);
      out.push(...archPane(0.0018, 0.006, DARK, x + g.nx * (g.ap + 0.0008), 0.008, z + g.nz * (g.ap + 0.0008), g.ry));
    }
    out.push(lathe(([[rt * 1.02, 0], [rt * 0.95, 0.003], [rt * 0.75, 0.0065], [rt * 0.42, 0.0092], [0.0012, 0.0102]] as const).map(([a, b]) => [a, b / FA * 1.15] as const), 8, TILE, { x, y: ht, z }, Math.PI / 8));
    out.push(drumC(0.0016, 0.0012, 0.003 / FA, 8, MARBLE, { x, y: ht + 0.0098 / FA * 1.15, z }));
  }
  // The drum with its round windows, the gallery at the dome's foot.
  const iDrum = out.length;
  const Rd = 0.0192, yd = nave, hd = 0.014;
  out.push(drumC(Rd, Rd, hd, 8, MARBLE, { y: yd, z: zc, ry: Math.PI / 8 }));
  for (let k = 0; k < 8; k++) {
    const f = octFace(k, Rd), x = f.nx * (f.ap + 0.0004), z = zc + f.nz * (f.ap + 0.0004);
    out.push(halo(0.0034, 0.0042, GREEN, x, yd + hd * 0.5, z, f.ry, 1 / FD));
    out.push(oculus(0.0034, DARK, f.nx * (f.ap + 0.0003), yd + hd * 0.5, zc + f.nz * (f.ap + 0.0003), f.ry, 1 / FD));
    for (const s of [-1, 1]) out.push(pane(0.0009, hd, GREEN, x + f.tx * s * f.w * 0.46, yd, z + f.tz * s * f.w * 0.46, f.ry));
  }
  out.push(drumC(Rd * 1.06, Rd * 1.06, 0.0018, 8, shade(MARBLE, 0.95), { y: yd + hd, z: zc, ry: Math.PI / 8 }));
  // The dome: eight tiled sails rising in a pointed curve, white ribs on the corners.
  const Rm = Rd * 1.0, ym = yd + hd + 0.0018, hm = 0.028;
  const prof: [number, number][] = [[1, 0], [0.985, 0.14], [0.945, 0.3], [0.87, 0.47], [0.75, 0.63], [0.58, 0.78], [0.37, 0.9], [0.2, 0.97], [0.14, 1]];
  out.push(lathe(prof.map(([a, b]) => [a * Rm, b * hm] as const), 8, TILE, { y: ym, z: zc }, Math.PI / 8));
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4, sx = Math.sin(a), sz = Math.cos(a);
    for (let i = 0; i < prof.length - 1; i++) {
      const [a0, b0] = prof[i]!, [a1, b1] = prof[i + 1]!;
      out.push(rod(V(sx * a0 * Rm * 1.012, ym + b0 * hm, zc + sz * a0 * Rm * 1.012), V(sx * a1 * Rm * 1.012, ym + b1 * hm, zc + sz * a1 * Rm * 1.012), 0.0009, MARBLE, 4));
    }
  }
  // The lantern: an octagon with buttress scrolls, its cone, the golden ball and cross.
  const yl = ym + hm;
  out.push(drumC(0.0046, 0.0042, 0.0085, 8, MARBLE, { y: yl, z: zc, ry: Math.PI / 8 }));
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    out.push(rod(V(Math.sin(a) * 0.0075, yl, zc + Math.cos(a) * 0.0075), V(Math.sin(a) * 0.0046, yl + 0.007, zc + Math.cos(a) * 0.0046), 0.0008, MARBLE, 3));
    const f = octFace(k, 0.0044);
    out.push(...archPane(0.0011, 0.004, DARK, f.nx * (f.ap + 0.0003), yl + 0.0018, zc + f.nz * (f.ap + 0.0003), f.ry));
  }
  out.push(P(new THREE.ConeGeometry(0.0046, 0.0075, 8).translate(0, 0.00375, 0), MARBLE, { y: yl + 0.0085, z: zc, ry: Math.PI / 8 }));
  out.push(ball(0.0012, GOLD, { y: yl + 0.0165, z: zc }, 1), rod(V(0, yl + 0.017, zc), V(0, yl + 0.0205, zc), 0.0003, GOLD, 3));
  out.push(rod(V(-0.0012, yl + 0.0194, zc), V(0.0012, yl + 0.0194, zc), 0.00025, GOLD, 3));
  // The nave and its aisles, from the facade back to the octagon: four bays
  // (the true nave's length squeezed to fit a square site).
  const iNave = out.length;
  const zb = zc + R0 * Math.cos(Math.PI / 8) - 0.001, zf = zb + 0.027, L = zf - zb, zn = (zf + zb) / 2, aw = 0.032, nw = 0.017, ah = 0.026;
  out.push(...box(aw, ah, L, MARBLE, { z: zn }, shade(TILE, 0.85)));
  out.push(...box(nw, nave, L, MARBLE, { z: zn }));
  out.push(...gable(nw + 0.0015, L + 0.0012, 0.0075, TILE, { y: nave, z: zn }, true, MARBLE));
  for (const s of [-1, 1]) {
    const ry = s * Math.PI / 2;
    panels(s * aw / 2, zn, s, 0, 0, -s, ry, L, 0, ah, 0.0066, [0.02, 0.36, 0.97]);
    panels(s * nw / 2, zn, s, 0, 0, -s, ry, L, ah, nave - ah, 0.0066, [0.05, 0.95]);
    const n = Math.round(L / 0.0066);
    for (let i = 0; i < n; i++) {
      const z = zn - L / 2 + (i + 0.5) * (L / n);
      out.push(...archPane(0.0022, 0.008, DARK, s * (aw / 2 + 0.0008), 0.011, z, ry));
      out.push(oculus(0.0016, DARK, s * (nw / 2 + 0.0008), ah + (nave - ah) * 0.5, z, ry, 1 / FA));
    }
  }
  // The facade: panelled marble, three portals, the rose, the gable, statues in niches, pinnacles.
  const fw = 0.034, fh = 0.042, zF = zf + 0.003;
  out.push(...box(fw, fh, 0.003, MARBLE, { z: zf + 0.0015 }));
  out.push(tri(0.018, 0.011, MARBLE, 0, fh, zF - 0.0015), tri(0.018, 0.011, MARBLE, 0, fh, zF - 0.0015, Math.PI));
  out.push(rod(V(-0.009, fh, zF - 0.0015), V(0, fh + 0.011, zF - 0.0015), 0.0008, MARBLE, 4), rod(V(0.009, fh, zF - 0.0015), V(0, fh + 0.011, zF - 0.0015), 0.0008, MARBLE, 4));
  out.push(tri(0.012, 0.0072, PINK, 0, fh + 0.0012, zF + 0.0002));
  out.push(oculus(0.0022, GREEN, 0, fh + 0.0042, zF + 0.0004, 0, 1 / FA));
  panels(0, zF, 0, 1, 1, 0, 0, fw, 0, fh, 0.0068, [0.02, 0.3, 0.55, 0.98]);
  out.push(halo(0.0046, 0.0056, GREEN, 0, 0.031, zF + 0.0008, 0, 1 / FA), oculus(0.0046, 0x5a4a6a, 0, 0.031, zF + 0.0007, 0, 1 / FA));
  for (const [x, w, h] of [[0, 0.0072, 0.011], [-0.0115, 0.0045, 0.008], [0.0115, 0.0045, 0.008]] as const) {
    out.push(...archPane(w + 0.0014, h + 0.0012, MARBLE, x, 0.0005, zF + 0.0008));
    out.push(...archPane(w, h, DARK, x, 0.0005, zF + 0.001));
    out.push(P(new THREE.CircleGeometry(w / 2, 8, 0, Math.PI), GOLD, { x, y: 0.0005 + h, z: zF + 0.0012 }));
  }
  for (let i = 0; i < 9; i++) out.push(...figure(-0.0136 + i * 0.0034, zF + 0.0012, 0.0036, 0xf4f0e6, { y: 0.0175, skin: 0xf4f0e6 }));
  for (const x of [-0.0168, -0.0084, 0.0084, 0.0168]) out.push(P(new THREE.ConeGeometry(0.0011, 0.0055, 6).translate(0, 0.00275, 0), MARBLE, { x, y: fh, z: zF - 0.0008 }));
  const iTower = out.length;
  // Giotto's bell tower at the facade's right corner: banded storeys, the windows growing lighter as it rises, its cornice.
  const cx = 0.0225, cz = zf - 0.0055, cw = 0.0098, ch = 0.084;
  out.push(...box(cw, ch, cw, MARBLE, { x: cx, z: cz }, shade(MARBLE, 0.92)));
  const storeys = [0, 0.016, 0.03, 0.044, 0.058, 0.08] as const;
  for (let k = 0; k < 4; k++) {
    const f = octFace(k * 2, 1), ry = f.ry, o = cw / 2;
    const at = (t: number, off: number) => [cx + f.nx * (o + off) + f.tx * t, cz + f.nz * (o + off) + f.tz * t] as const;
    for (const s of [-1, 1]) { const [x, z] = at(s * (cw / 2 - 0.0006), 0.0004); out.push(pane(0.0012, ch, GREEN, x, 0, z, ry)); }
    for (const y of storeys) { const [x, z] = at(0, 0.0006); out.push(pane(cw, 0.0012, y === 0.016 ? PINK : GREEN, x, y, z, ry)); }
    { const [x, z] = at(0, 0.0002); out.push(pane(cw * 0.7, 0.008, PINK, x, 0.004, z, ry)); }
    for (const [y, n, w, hh] of [[0.033, 2, 0.0016, 0.008], [0.047, 2, 0.0016, 0.008], [0.061, 3, 0.0013, 0.016]] as const) {
      for (let i = 0; i < n; i++) { const [x, z] = at((i - (n - 1) / 2) * (w + 0.0012), 0.0008); out.push(...archPane(w, hh, DARK, x, y, z, ry)); }
    }
  }
  out.push(...box(cw + 0.0024, 0.0022, cw + 0.0024, MARBLE, { x: cx, y: ch, z: cz }, shade(MARBLE, 0.9)));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) out.push(...box(0.0009, 0.0012, 0.0009, MARBLE, { x: cx + (i - 1.5) * 0.0028, y: ch + 0.0022, z: cz + s * (cw / 2 + 0.0006) }));
  // Raised (the town is drawn taller than true): the body and the dome by
  // FA, the drum between them more, the bell tower to about three quarters
  // of the dome's height; then fitted to its pad.
  raise([...out.slice(0, iDrum), ...out.slice(iNave, iTower)], [[1, FA]]);
  raise(out.slice(iDrum, iNave), [[nave, FA], [ym, FD], [1, FA]]);
  raise(out.slice(iTower), [[1, 1.22]]);
  return [flat(2 * H, 2 * H, PAVE, 0, 0, 0.0003), ...fitTo(out, 0.0177, 1.68, 1, 1, 1)];
}

// ---------- St Peter's ----------

// Michelangelo's basilica: the dome on its drum of paired columns, ribbed
// in lead, its lantern; the two small domes beside it; the cross of nave,
// arms and apses under a balustrade; Maderno's facade of giant columns and
// statues; its steps. (Alone on its pad: Bernini's piazza left out; the
// nave drawn long enough to fill the square site front to back.)
export function stPeters(): G[] {
  const SA = 1.5; // how much the body is raised (see the end)
  const S = 1.5, DZ = 0.0275; // its fit to the pad: scaled S, moved DZ back to front
  const TRAV = 0xe6dcc6, LEAD = 0x8e979c, PAVE = 0xc9bea8, ROOF = 0x9a8f80, RIB = 0xd8d2c4;
  const out: G[] = [];
  const zF = 0.012, fw = 0.064, fh = 0.032, fy = 0.003;
  // The steps up to the facade.
  // (Each runs back into the facade a little further than the one under it.)
  for (let i = 0; i < 3; i++) { const zf = zF + 0.009 - i * 0.002, zb = zF - 0.0002 - i * 0.0004; out.push(...box(0.05 - i * 0.004, 0.001 * (i + 1), zf - zb, shade(TRAV, 1 - i * 0.02), { z: (zf + zb) / 2 })); }
  // The facade: giant columns and pilasters, its pediment, attic and statues, windows and the loggia, clocks at its ends.
  out.push(...box(fw, fh, 0.008, TRAV, { y: fy, z: zF - 0.004 }));
  out.push(...box(fw + 0.002, 0.0026, 0.0096, shade(TRAV, 0.95), { y: fy + fh, z: zF - 0.004 }));
  out.push(...box(fw, 0.0055, 0.008, TRAV, { y: fy + fh + 0.0026, z: zF - 0.004 }, ROOF));
  for (let i = 0; i < 13; i++) out.push(...figure(-0.024 + i * 0.004, zF - 0.001, 0.0048, 0xf0e8d6, { y: fy + fh + 0.0081, skin: 0xf0e8d6, ...(i === 6 ? { arm: 1 } : {}) }));
  for (let i = 0; i < 8; i++) {
    const x = [-0.026, -0.019, -0.0095, -0.004, 0.004, 0.0095, 0.019, 0.026][i]!;
    out.push(drumC(0.0021, 0.0018, fh - 0.003, 10, shade(TRAV, 1.04), { x, y: fy, z: zF + 0.0006 }));
    out.push(...box(0.005, 0.0028, 0.0034, shade(TRAV, 1.03), { x, y: fy + fh - 0.003, z: zF + 0.0006 }));
  }
  out.push(tri(0.02, 0.0055, TRAV, 0, fy + fh + 0.0026, zF + 0.0022), tri(0.016, 0.0038, shade(TRAV, 0.9), 0, fy + fh + 0.0034, zF + 0.0024));
  for (const [x, w] of [[-0.0142, 0.0055], [0.0142, 0.0055], [0, 0.0044], [-0.0225, 0.0035], [0.0225, 0.0035]] as const) {
    out.push(...archPane(w, 0.0085, DARK, x, fy + 0.001, zF + 0.0003));
    out.push(pane(w * 0.75, 0.0045, DARK, x, fy + 0.017, zF + 0.0003));
    out.push(pane(w * 0.6, 0.003, DARK, x, fy + 0.026, zF + 0.0003));
  }
  out.push(...archPane(0.006, 0.0068, 0x4a3a30, 0, fy + 0.0145, zF + 0.0004), ...box(0.008, 0.0008, 0.002, TRAV, { y: fy + 0.0142, z: zF + 0.001 }));
  for (const s of [-1, 1]) {
    out.push(...box(0.008, 0.009, 0.008, TRAV, { x: s * 0.03, y: fy + fh, z: zF - 0.004 }, ROOF));
    out.push(oculus(0.0024, 0xf2ead6, s * 0.03, fy + fh + 0.0045, zF + 0.0003, 0, 1 / SA), oculus(0.0017, 0x3a3a3a, s * 0.03, fy + fh + 0.0045, zF + 0.0005, 0, 1 / SA));
  }
  // The body: nave and arms under balustrades, three apses, pilasters and windows.
  const zc = -0.046, bh = 0.03;
  out.push(...box(0.034, bh, zF - 0.008 - zc, TRAV, { z: (zF - 0.008 + zc) / 2 }, ROOF));
  out.push(...gable(0.032, zF - 0.008 - zc, 0.006, LEAD, { y: bh, z: (zF - 0.008 + zc) / 2 }, true, TRAV));
  // (The nave's flanks: pilasters and two rows of windows, bay by bay.)
  {
    const z0 = zc + 0.016, z1 = zF - 0.008, n = Math.round((z1 - z0) / 0.0062);
    for (const s of [-1, 1]) for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      out.push(pane(0.0012, bh, shade(TRAV, 1.05), s * 0.0172, 0, z, s * Math.PI / 2));
      if (i < n) {
        const zm = z + (z1 - z0) / n / 2;
        out.push(pane(0.0024, 0.008, DARK, s * 0.0173, 0.008, zm, s * Math.PI / 2), pane(0.0018, 0.003, DARK, s * 0.0173, 0.021, zm, s * Math.PI / 2));
      }
    }
  }
  out.push(...box(0.07, bh, 0.032, TRAV, { z: zc }, ROOF));
  for (const [x, z] of [[-0.035, zc], [0.035, zc], [0, zc - 0.016]] as const) {
    const rr = 0.014;
    out.push(drumC(rr, rr, bh - 0.0002, 20, TRAV, { x, z }), P(new THREE.CircleGeometry(rr, 20).rotateX(-Math.PI / 2), ROOF, { x, y: bh + 0.00005, z }));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, nx = Math.sin(a), nz = Math.cos(a);
      if (x === 0 ? nz > 0.3 : x * nx < -0.3 * Math.abs(x)) continue;
      out.push(pane(0.0012, bh, shade(TRAV, 1.05), x + nx * (rr + 0.0002), 0, z + nz * (rr + 0.0002), a));
      if (i % 2) out.push(pane(0.0022, 0.007, DARK, x + nx * (rr + 0.0004), 0.009, z + nz * (rr + 0.0004), a), pane(0.0018, 0.003, DARK, x + nx * (rr + 0.0004), 0.021, z + nz * (rr + 0.0004), a));
    }
  }
  // Raised (the town is drawn taller than true) and fitted to its pad;
  // the domes are built after, at their drawn size, so keep true shape.
  raise(out, [[1, SA]]);
  fitTo(out, DZ, S, 1, 1, 1);
  // A Michelangelo dome, R its drum's radius, on the roof at (cx, y, cz):
  // a stepped base; the drum ringed by n buttresses, each fronted by a pair
  // of columns, windows between under pediments, triangular and segmental
  // in turn; the entablature, the attic with its pilasters; the lead shell
  // rising a little pointed, n white ribs (tiers of lucarnes between them
  // if `lucarnes`); the lantern of paired columns, its cupola, spike, golden
  // ball and cross.
  const cupola = (cx: number, cz: number, y: number, R: number, n: number, hd: number, hm: number, lucarnes: boolean) => {
    const N = 2 * n, e = 0.0002, ap = R * Math.cos(Math.PI / N);
    const at = (a: number, r: number) => [cx + Math.sin(a) * r, cz + Math.cos(a) * r] as const;
    let yy = y - 0.0003;
    out.push(drumC(R * 1.24, R * 1.24, R * 0.08, N, shade(TRAV, 0.92), { x: cx, y: yy, z: cz }));
    yy += R * 0.08 - e;
    out.push(drumC(R * 1.14, R * 1.14, R * 0.1, N, TRAV, { x: cx, y: yy, z: cz }));
    yy += R * 0.1 - e;
    // The drum.
    const yd = yy;
    out.push(drumC(R, R, hd, N, TRAV, { x: cx, y: yd, z: cz }));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = a + Math.PI / n;
      { const [x, z] = at(a, R * 1.08); out.push(...box(R * 0.17, hd * 0.9, R * 0.2, shade(TRAV, 0.93), { x, y: yd, z, ry: a })); }
      { const [x, z] = at(a, R * 1.14); out.push(...box(R * 0.24, hd * 0.08, R * 0.22, shade(TRAV, 0.97), { x, y: yd, z, ry: a })); }
      for (const s of [-1, 1]) {
        const [x0, z0] = at(a, R * 1.2), x = x0 + Math.cos(a) * s * R * 0.06, z = z0 - Math.sin(a) * s * R * 0.06;
        out.push(drumC(R * 0.045, R * 0.038, hd * 0.8 + e, 6, shade(TRAV, 1.08), { x, y: yd + hd * 0.08 - e, z }));
        out.push(...box(R * 0.1, hd * 0.045, R * 0.1, shade(TRAV, 1.04), { x, y: yd + hd * 0.84, z, ry: a }));
      }
      // The window between, its frame and its pediment.
      { const [x, z] = at(b, ap + 0.0001); out.push(pane(R * 0.19, hd * 0.5, shade(TRAV, 1.07), x, yd + hd * 0.17, z, b)); }
      { const [x, z] = at(b, ap + 0.0002); out.push(pane(R * 0.12, hd * 0.42, DARK, x, yd + hd * 0.2, z, b)); }
      const [px, pz] = at(b, ap + 0.0003);
      if (i % 2) out.push(tri(R * 0.24, hd * 0.08, shade(TRAV, 1.07), px, yd + hd * 0.69, pz, b));
      else out.push(P(new THREE.CircleGeometry(R * 0.12, 8, 0, Math.PI).scale(1, 0.6, 1), shade(TRAV, 1.07), { x: px, y: yd + hd * 0.69, z: pz, ry: b }));
    }
    out.push(drumC(R * 1.28, R * 1.28, hd * 0.12 + 0.0001, N, shade(TRAV, 0.96), { x: cx, y: yd + hd * 0.88, z: cz }));
    // The attic: pilasters over the buttresses, little windows between, its cornice.
    const ya = yd + hd - e, ha = R * 0.26;
    out.push(drumC(R * 1.02, R * 1.02, ha, N, TRAV, { x: cx, y: ya, z: cz }));
    const apA = R * 1.02 * Math.cos(Math.PI / N);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = a + Math.PI / n;
      { const [x, z] = at(a, apA + R * 0.02); out.push(...box(R * 0.13, ha * 0.9, R * 0.06, shade(TRAV, 1.04), { x, y: ya + e, z, ry: a })); }
      { const [x, z] = at(b, apA + 0.0002); out.push(pane(R * 0.09, ha * 0.36, DARK, x, ya + ha * 0.3, z, b)); }
    }
    out.push(drumC(R * 1.08, R * 1.08, R * 0.04, N, shade(TRAV, 0.95), { x: cx, y: ya + ha - e, z: cz }));
    // The shell, its ribs and lucarnes.
    const ym = ya + ha + R * 0.04 - 2 * e, Rm = R * 0.99;
    const prof: [number, number][] = [[1, 0], [0.99, 0.1], [0.96, 0.22], [0.9, 0.36], [0.8, 0.51], [0.67, 0.65], [0.5, 0.78], [0.35, 0.89], [0.25, 0.96], [0.21, 1]];
    out.push(lathe(prof.map(([a, b]) => [a * Rm, b * hm] as const), n * 3, LEAD, { x: cx, y: ym, z: cz }));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      for (let i = 0; i < prof.length - 1; i++) {
        const [a0, b0] = prof[i]!, [a1, b1] = prof[i + 1]!;
        out.push(rod(V(cx + sx * a0 * Rm * 1.01, ym + b0 * hm, cz + sz * a0 * Rm * 1.01), V(cx + sx * a1 * Rm * 1.01, ym + b1 * hm, cz + sz * a1 * Rm * 1.01), R * 0.035, RIB, 3));
      }
      if (!lucarnes) continue;
      const b = a + Math.PI / n;
      for (const [f, h, s] of [[0.955, 0.24, 1], [0.83, 0.47, 0.85], [0.64, 0.68, 0.7]] as const) {
        const r = f * Rm - R * 0.03, [x, z] = at(b, r), [wx, wz] = at(b, r + R * 0.04 * s + 0.0002);
        out.push(...box(R * 0.09 * s, R * 0.08 * s, R * 0.08 * s, RIB, { x, y: ym + h * hm, z, ry: b }));
        out.push(pane(R * 0.05 * s, R * 0.05 * s, DARK, wx, ym + h * hm + R * 0.012 * s, wz, b));
      }
    }
    // The lantern.
    const yl = ym + hm - R * 0.02, rl = R * 0.23, hl = R * 0.42;
    out.push(drumC(rl, rl, hl, 16, TRAV, { x: cx, y: yl, z: cz }));
    const nl = n >= 16 ? 8 : 4;
    for (let i = 0; i < nl; i++) {
      const a = (i / nl) * Math.PI * 2, b = a + Math.PI / 16;
      for (const s of [-1, 1]) {
        const [x0, z0] = at(a, rl + R * 0.035), x = x0 + Math.cos(a) * s * R * 0.03, z = z0 - Math.sin(a) * s * R * 0.03;
        out.push(drumC(R * 0.018, R * 0.016, hl * 0.86, 5, shade(TRAV, 1.05), { x, y: yl, z }));
      }
      const [x, z] = at(b, rl * Math.cos(Math.PI / 16) + 0.0002);
      out.push(...archPane(R * 0.06, hl * 0.42, DARK, x, yl + hl * 0.2, z, b));
    }
    out.push(drumC(rl * 1.3, rl * 1.3, R * 0.04, 16, shade(TRAV, 0.96), { x: cx, y: yl + hl * 0.86, z: cz }));
    const yc = yl + hl * 0.86 + R * 0.04 - e;
    out.push(drumC(rl, rl, R * 0.05, 16, TRAV, { x: cx, y: yc, z: cz }));
    out.push(lathe([[rl * 1.02, 0], [rl * 0.92, R * 0.06], [rl * 0.7, R * 0.12], [rl * 0.35, R * 0.16], [rl * 0.12, R * 0.175]], 16, LEAD, { x: cx, y: yc + R * 0.05 - e, z: cz }));
    const ys = yc + R * 0.05 + R * 0.17;
    out.push(P(new THREE.ConeGeometry(R * 0.04, R * 0.14, 6).translate(0, R * 0.07, 0), TRAV, { x: cx, y: ys, z: cz }));
    out.push(ball(R * 0.045, GOLD, { x: cx, y: ys + R * 0.16, z: cz }, 1));
    out.push(rod(V(cx, ys + R * 0.19, cz), V(cx, ys + R * 0.32, cz), R * 0.011, GOLD, 3), rod(V(cx - R * 0.04, ys + R * 0.27, cz), V(cx + R * 0.04, ys + R * 0.27, cz), R * 0.009, GOLD, 3));
  };
  const Zc = (zc + DZ) * S, Y0 = bh * SA * S;
  cupola(0, Zc, Y0, 0.0295, 16, 0.036, 0.045, true);
  // The two small domes over the side chapels, at the crossing's front corners.
  for (const s of [-1, 1]) cupola(s * 0.03 * S, (zc + 0.013 + DZ) * S, Y0, 0.0085, 8, 0.009, 0.012, false);
  return [flat(2 * H, 2 * H, PAVE, 0, 0, 0.0003), ...out];
}

// ---------- Tenochtitlan ----------

// A stair of blocks from (z0, y0) up to (z1, y1), w wide, each block running
// back to z1 (into the wall behind), balustrades either side.
function stair(out: G[], x: number, w: number, z0: number, z1: number, y0: number, y1: number, c: number, n: number, rail: number): void {
  const run = (z0 - z1) / n, rise = (y1 - y0) / n;
  for (let s = 0; s < n; s++) { const zf = z0 - s * run, zb = z1 - 0.0008; out.push(...box(w, rise * (s + 1) - 0.00012, zf - zb, c, { x, y: y0, z: (zf + zb) / 2 }, shade(c, s % 2 ? 1.03 : 1.08))); }
  for (const sd of [-1, 1]) out.push(rod(V(x + sd * (w / 2 + 0.0006), y0 + 0.0012, z0 + 0.0005), V(x + sd * (w / 2 + 0.0006), y1 + 0.0012, z1), 0.0009, rail, 4));
}
// The Great Temple of Tenochtitlan: its twin stairs and twin shrines, Tlaloc's in blue and white
// (rain), Huitzilopochtli's in red with its skulls (war), braziers burning
// before them, feathered serpents' heads at the stairs' feet; the serpent
// wall round its platform.
export function temploMayor(): G[] {
  const STUCCO = 0xe6d6b4, STONE = 0xb2a58c, RED = 0xb3392b, BLUE = 0x3b6db0, PLAZA = 0xcfc2a2;
  const out: G[] = [];
  // The temple's platform and the serpent wall round it.
  const pz = -0.0215, pw = 0.086;
  out.push(...box(pw, 0.004, pw, STONE, { z: pz }, PLAZA));
  const wallH = 0.0045, y0 = 0.004;
  for (const [x, z, w, d] of [[0, pz - pw / 2 + 0.0015, pw - 0.002, 0.002], [-pw / 2 + 0.0015, pz, 0.002, pw - 0.002], [pw / 2 - 0.0015, pz, 0.002, pw - 0.002], [-0.0255, pz + pw / 2 - 0.0015, 0.033, 0.002], [0.0255, pz + pw / 2 - 0.0015, 0.033, 0.002]] as const) {
    out.push(...box(w, wallH, d, STUCCO, { x, y: y0, z }));
    const n = Math.round(Math.max(w, d) / 0.004);
    for (let i = 0; i < n; i++) {
      const t = -0.5 + (i + 0.5) / n, cx = x + (w > d ? t * w : 0), cz = z + (w > d ? 0 : t * d);
      out.push(...box(0.0012, 0.0016, 0.0012, STUCCO, { x: cx, y: y0 + wallH, z: cz }));
      if (i % 2) out.push(ball(0.0011, 0x4a8a6a, { x: cx + (w > d ? 0 : Math.sign(x) * 0.0018), y: y0 + 0.0012, z: cz + (w > d ? Math.sign(z - pz) * 0.0018 : 0) }));
    }
  }
  // The Great Temple: four tiers, the twin stairs, the twin shrines.
  const tz = -0.03, tw = 0.07, td = 0.058, n = 4, th = 0.0105, yt = y0 + n * th;
  for (let i = 0; i < n; i++) {
    const k = i / n, wi = tw * (1 - k * 0.5), di = td * (1 - k * 0.5), wn = tw * (1 - (k + 1 / n) * 0.5), dn = td * (1 - (k + 1 / n) * 0.5), y = y0 + i * th;
    const talud = new THREE.BufferGeometry(), a = [wi / 2, di / 2], b = [wn / 2 + (wi - wn) * 0.12, dn / 2 + (di - dn) * 0.12], hh = th * 0.74;
    const q = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number) => [x0, 0, z0, x1, 0, z1, x2, hh, z2, x0, 0, z0, x2, hh, z2, x3, hh, z3];
    talud.setAttribute('position', new THREE.Float32BufferAttribute([
      ...q(-a[0]!, a[1]!, a[0]!, a[1]!, b[0]!, b[1]!, -b[0]!, b[1]!), ...q(a[0]!, -a[1]!, -a[0]!, -a[1]!, -b[0]!, -b[1]!, b[0]!, -b[1]!),
      ...q(a[0]!, a[1]!, a[0]!, -a[1]!, b[0]!, -b[1]!, b[0]!, b[1]!), ...q(-a[0]!, -a[1]!, -a[0]!, a[1]!, -b[0]!, b[1]!, -b[0]!, -b[1]!),
    ], 3));
    out.push(P(talud, shade(STUCCO, 0.96 - i * 0.01), { y, z: tz }));
    out.push(...box(b[0]! * 2 + 0.0006, th - hh, b[1]! * 2 + 0.0006, shade(STUCCO, 1.02), { y: y + hh, z: tz }, shade(STONE, 1.05)));
    // A painted band on each tablero: red on the right half, blue on the left.
    for (const s of [-1, 1]) {
      out.push(pane(b[0]! - 0.002, (th - hh) * 0.5, s > 0 ? RED : BLUE, s * (b[0]! / 2 + 0.001), y + hh + (th - hh) * 0.25, tz + b[1]! + 0.0006));
      out.push(pane(b[1]! * 2 - 0.002, (th - hh) * 0.5, s > 0 ? RED : BLUE, s * (b[0]! + 0.0006), y + hh + (th - hh) * 0.25, tz, s * Math.PI / 2));
    }
  }
  const dLast = td * (1 - 0.5 * (n - 1) / n), topD = td * 0.5 + 0.24 * (dLast - td * 0.5);
  for (const s of [-1, 1]) {
    const x = s * 0.0085;
    stair(out, x, 0.0118, tz + td / 2 + 0.012, tz + topD * 0.38, y0, yt, shade(STUCCO, 1.06), 16, s > 0 ? RED : BLUE);
    out.push(...[-1, 1].flatMap((t) => [
      ball(0.0017, 0x4a8a6a, { x: x + t * 0.0065, y: y0 + 0.0016, z: tz + td / 2 + 0.0135, sz: 1.3 }),
      ball(0.0008, RED, { x: x + t * 0.0065, y: y0 + 0.0012, z: tz + td / 2 + 0.0152 }),
    ]));
  }
  out.push(rod(V(0, y0 + 0.0014, tz + td / 2 + 0.0125), V(0, yt + 0.0014, tz + topD * 0.38), 0.0011, shade(STUCCO, 0.9), 4));
  // The shrines: Tlaloc's (left) striped blue and white with his eyes; Huitzilopochtli's (right) red with skulls; roof crests; braziers.
  const sz = tz - 0.004, sw = 0.0155, sd = 0.014, sh = 0.0145;
  for (const s of [-1, 1]) {
    const x = s * 0.0092, c = s > 0 ? RED : 0xf0ece0;
    out.push(...box(sw, sh, sd, c, { x, y: yt, z: sz }, shade(STONE, 0.95)));
    out.push(pane(0.0042, 0.0072, DARK, x, yt, sz + sd / 2 + 0.0003));
    if (s < 0) for (let i = 0; i < 6; i++) out.push(pane(0.0011, sh, BLUE, x - sw / 2 + 0.0012 + i * 0.0024, yt, sz + sd / 2 + 0.0002));
    else for (let i = 0; i < 6; i++) out.push(ball(0.0006, 0xf2ecdc, { x: x - sw / 2 + 0.0013 + i * 0.0024, y: yt + sh - 0.0018, z: sz + sd / 2 + 0.0004 }));
    // The roof: a tall crest of stepped merlons over a band.
    out.push(...box(sw + 0.001, 0.0028, sd + 0.001, s > 0 ? shade(RED, 0.85) : BLUE, { x, y: yt + sh, z: sz }, STUCCO));
    for (let i = 0; i < 5; i++) out.push(...box(0.0018, 0.005, 0.0012, s > 0 ? 0xf0ece0 : shade(BLUE, 1.1), { x: x - sw / 2 + 0.0019 + i * 0.0027, y: yt + sh + 0.0028, z: sz + sd / 2 - 0.0008 }));
    if (s < 0) for (let i = 0; i < 4; i++) out.push(P(new THREE.RingGeometry(0.0006, 0.0011, 10), 0xf0ece0, { x: x - 0.0045 + i * 0.003, y: yt + sh + 0.0014, z: sz + sd / 2 + 0.001 }));
    out.push(drumC(0.0016, 0.0019, 0.0035, 8, STONE, { x: x + 0.004, y: yt, z: sz + sd / 2 + 0.003 }), ball(0.0013, 0xf0a040, { x: x + 0.004, y: yt + 0.0042, z: sz + sd / 2 + 0.003 }));
  }
  // (On its pad, filling it: about 4 cells tall.)
  return [flat(2 * H, 2 * H, PLAZA, 0, 0, 0.0003), ...fitTo(out, 0.0215, 1.67, 0, 1.37, 1.37)];
}

// ---------- Versailles ----------

// The château on its rise and its gardens (beside the city, drawn large):
// toward the town, the courts narrowing to the marble court in brick and
// stone under slate roofs edged with gold, the gilded gate; toward the gardens, the long stone front with its arched windows,
// balustrade and urns; the chapel's high roof; the water parterre, Latona's
// fountain, the long green carpet between the groves, Apollo's fountain,
// the Grand Canal; the embroidered parterres and the
// orangery's trees in tubs; clipped yews. Its water and its trees are the
// game's own (versaillesGrounds): the model has only the basins' kerbs and
// the groves' hedges.
export function versailles(): G[] {
  const STONE = 0xe3d3b0, BRICK = 0xb06a50, SLATE = 0x5d6874, LAWN = 0x86a656, GRAVEL = 0xd9ccaa, BOX = 0x3f6a34, GROVE = 0x4f7a3a;
  const out: G[] = [];
  // Gravel: the terraces before the palace, the alleys, the town's parade ground.
  out.push(flat(0.142, 0.03, GRAVEL, 0, 0.012, 0.0005), flat(0.018, 0.075, GRAVEL, 0, -0.035, 0.00055), flat(0.07, 0.022, GRAVEL, 0, 0.063, 0.0005));
  // ---- the palace ----
  const zg = 0.027, ph = 0.0165; // the garden front's line, the palace's height
  const front = (x0: number, x1: number, z: number, h: number, ry: number, c: number, every = 0.0026) => {
    const n = Math.round((x1 - x0) / every), nz = Math.cos(ry), o = 0.0003;
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * ((x1 - x0) / n);
      out.push(pane(0.0012, h * 0.2, DARK, x, h * 0.08, z + nz * o, ry));
      out.push(...archPane(0.0013, h * 0.27, DARK, x, h * 0.4, z + nz * o, ry));
      out.push(pane(0.001, h * 0.1, DARK, x, h * 0.82, z + nz * o, ry));
    }
    out.push(pane(x1 - x0, 0.0006, shade(c, 0.9), (x0 + x1) / 2, h * 0.36, z + nz * 0.00045, ry), pane(x1 - x0, 0.0006, shade(c, 0.9), (x0 + x1) / 2, h * 0.76, z + nz * 0.00045, ry));
  };
  // The garden front: the central block, its avant-corps of columns, the two long wings set back.
  out.push(...box(0.058, ph, 0.02, STONE, { z: zg + 0.01 }, shade(STONE, 0.9)));
  front(-0.029, 0.029, zg, ph, Math.PI, STONE);
  front(-0.0085, 0.0085, zg + 0.02, ph, 0, STONE); // (toward the marble court)
  for (const x of [-0.016, -0.01, -0.004, 0.004, 0.01, 0.016]) out.push(drumC(0.0006, 0.0006, ph * 0.42, 6, shade(STONE, 1.06), { x, y: ph * 0.38, z: zg - 0.0008 }));
  for (const s of [-1, 1]) {
    out.push(...box(0.044, ph * 0.94, 0.014, STONE, { x: s * 0.051, z: zg + 0.0095 }, shade(STONE, 0.9)));
    front(s > 0 ? 0.029 : -0.073, s > 0 ? 0.073 : -0.029, zg + 0.0025, ph * 0.94, Math.PI, STONE);
    front(s > 0 ? 0.029 : -0.073, s > 0 ? 0.073 : -0.029, zg + 0.0165, ph * 0.94, 0, STONE);
  }
  // The balustrade and its urns and trophies along the flat roofs.
  for (const [x0, x1, y, z] of [[-0.029, 0.029, ph, zg + 0.0004], [-0.073, -0.029, ph * 0.94, zg + 0.0029], [0.029, 0.073, ph * 0.94, zg + 0.0029]] as const) {
    out.push(...box(x1 - x0, 0.0013, 0.0008, shade(STONE, 1.02), { x: (x0 + x1) / 2, y, z }));
    for (let x = x0 + 0.002; x < x1; x += 0.0045) out.push(ball(0.0006, shade(STONE, 1.05), { x, y: y + 0.0019, z, sy: 1.4 }));
  }
  // Toward the town: three courts narrowing to the marble court, in brick and stone, under slate with gilded ridges.
  const court = (x: number, z0: number, z1: number, w: number, h: number) => {
    const d = z1 - z0, zc = (z0 + z1) / 2;
    out.push(...box(w, h, d, BRICK, { x, z: zc }));
    out.push(...box(w + 0.0008, 0.0008, d + 0.0008, STONE, { x, y: h * 0.45, z: zc }));
    // A mansard: steep lower slopes, the gilded crest.
    const m = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.55, Math.SQRT1_2, 1, 4, 1, false).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w + 0.001, 0.0065, d + 0.001);
    out.push(P(m, SLATE, { x, y: h, z: zc }));
    out.push(rod(V(x, h + 0.0066, zc - d * 0.27), V(x, h + 0.0066, zc + d * 0.27), 0.0004, GOLD, 4));
    for (const s of [-1, 1]) for (let i = 0; i < Math.floor(d / 0.003); i++) out.push(...box(0.0007, 0.0012, 0.0009, STONE, { x: x + s * (w / 2 - 0.0012), y: h + 0.0016, z: z0 + 0.002 + i * 0.003 }));
    for (const s of [-1, 1]) {
      const n = Math.floor(d / 0.0026);
      for (let i = 0; i < n; i++) {
        const z = z0 + (i + 0.5) * (d / n);
        out.push(pane(0.0016, h * 0.3, DARK, x + s * (w / 2 + 0.0003), h * 0.1, z, s * Math.PI / 2), pane(0.0016, h * 0.32, DARK, x + s * (w / 2 + 0.0003), h * 0.52, z, s * Math.PI / 2));
        out.push(pane(0.0005, h, STONE, x + s * (w / 2 + 0.0002), 0, z0 + i * (d / n), s * Math.PI / 2));
      }
    }
  };
  for (const s of [-1, 1]) {
    court(s * 0.0125, 0.0471, 0.06, 0.008, ph);
    court(s * 0.0235, 0.049, 0.068, 0.009, ph * 0.96);
    court(s * 0.036, 0.053, 0.073, 0.009, ph * 0.82);
  }
  // The marble court: a chequer of black and white; the gilded gate.
  out.push(flat(0.017, 0.012, 0xeeeae2, 0, 0.0525, 0.0006));
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) out.push(flat(0.0028, 0.003, 0x2a2a2a, -0.007 + i * 0.0028, 0.048 + j * 0.003, 0.0007));
  for (let i = 0; i <= 16; i++) out.push(rod(V(-0.0185 + i * 0.0023, 0, 0.0635), V(-0.0185 + i * 0.0023, 0.0058 + (Math.abs(i - 8) < 2 ? 0.002 : 0), 0.0635), 0.00022, GOLD, 3));
  out.push(rod(V(-0.0185, 0.0048, 0.0635), V(0.0185, 0.0048, 0.0635), 0.0003, GOLD, 3), rod(V(-0.0185, 0.0018, 0.0635), V(0.0185, 0.0018, 0.0635), 0.0003, GOLD, 3));
  // The chapel: a tall nave under a steep roof edged with gold, its apse.
  out.push(...box(0.0085, 0.021, 0.014, STONE, { x: 0.033, z: 0.0445 }));
  out.push(...gable(0.0095, 0.015, 0.009, SLATE, { x: 0.033, y: 0.021, z: 0.0445 }, true, STONE));
  out.push(rod(V(0.033, 0.0302, 0.038), V(0.033, 0.0302, 0.051), 0.0005, GOLD, 4));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) out.push(...archPane(0.0016, 0.009, DARK, 0.033 + s * 0.0046, 0.009, 0.0395 + i * 0.0032, s * Math.PI / 2));
  // ---- the gardens ----
  // (The basins' kerbs stand KERB high, clear of the ground the model is
  // sunk into, round the game's water laid on it: VERSAILLES_WATER.)
  const KERB = 0.0026;
  // The water parterre: two great pools with their bronze figures.
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) out.push(...box(0.025, KERB, 0.00075, STONE, { x: s * 0.017, z: 0.017 + t * 0.0039 }, shade(STONE, 1.03)), ...box(0.00075, KERB, 0.0085, STONE, { x: s * 0.017 + t * 0.0121, z: 0.017 }, shade(STONE, 1.03)));
    for (let i = 0; i < 4; i++) out.push(ball(0.0006, 0x5a5040, { x: s * 0.017 - 0.009 + i * 0.006, y: KERB + 0.0005, z: 0.0132 }));
  }
  // Latona's fountain: three tiers of basins, water jets, the goddess on top.
  const lz = 0.003;
  out.push(lathe([[0.0106, 0], [0.0106, KERB], [0.0098, KERB], [0.0098, 0]], 32, STONE, { z: lz }));
  for (const [rr, y] of [[0.0068, 0.0012], [0.0046, 0.0026], [0.0026, 0.004]] as const) out.push(drumC(rr, rr * 0.95, 0.0014, 16, shade(STONE, 1.02), { y, z: lz }));
  out.push(...figure(0, lz, 0.0036, GOLD, { y: 0.0054, skin: GOLD }));
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; out.push(P(new THREE.ConeGeometry(0.0004, 0.004, 4, 1, true).translate(0, 0.002, 0), 0xeef6f8, { x: Math.sin(a) * 0.0082, y: 0.0012, z: lz + Math.cos(a) * 0.0082, rx: -Math.cos(a) * 0.5, rz: Math.sin(a) * 0.5 })); }
  // The green carpet between the groves, its alleys of clipped yews.
  out.push(flat(0.011, 0.04, LAWN, 0, -0.027, 0.0008));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) out.push(cone(0.0009, 0.0042, 6, BOX, { x: s * 0.0072, y: 0.0006, z: -0.009 - i * 0.0045 }));
    // The groves: blocks of trees, hedged, cut by diagonal alleys.
    for (let gx = 0; gx < 2; gx++) for (let gz = 0; gz < 2; gz++) {
      const cx = s * (0.0175 + gx * 0.019), cz = -0.017 - gz * 0.02, w = 0.016, d = 0.017;
      out.push(...box(w, 0.0022, d, shade(BOX, 0.95), { x: cx, z: cz }, shade(GROVE, 0.9)));
      out.push(drumC(0.0016, 0.0016, 0.0024, 10, STONE, { x: cx, z: cz }), P(new THREE.CircleGeometry(0.0013, 10).rotateX(-Math.PI / 2), WATER, { x: cx, y: 0.00245, z: cz }));
    }
  }
  // Apollo's fountain: an oval basin, the sun god's gilded chariot rising from it, its jets.
  const az = -0.05;
  out.push(P(new THREE.LatheGeometry([[1, 0], [1, KERB], [0.94, KERB], [0.94, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 36).scale(0.0125, 1, 0.0075), STONE, { z: az }));
  out.push(ball(0.0014, GOLD, { y: 0.0018, z: az, sx: 1.5 }), ...figure(0, az, 0.003, GOLD, { y: 0.0022, skin: GOLD, arm: 1 }));
  for (let i = 0; i < 4; i++) out.push(ball(0.0009, GOLD, { x: -0.003 + i * 0.002, y: 0.0016, z: az + 0.0028, sz: 1.6 }));
  for (const s of [-1, 1]) out.push(P(new THREE.ConeGeometry(0.0005, 0.006, 4, 1, true).translate(0, 0.003, 0), 0xeef6f8, { x: s * 0.007, y: 0.0012, z: az }));
  // The embroidered parterres before the wings, and the orangery's trees in tubs to the south.
  for (const s of [-1, 1]) {
    const cx = s * 0.052, cz = 0.006, w = 0.034, d = 0.032;
    out.push(flat(w, d, GRAVEL, cx, cz, 0.0006));
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const bx = cx + (i - 0.5) * (w / 2), bz = cz + (j - 0.5) * (d / 2), bw = w / 2 - 0.003, bd = d / 2 - 0.003;
      out.push(flat(bw, bd, LAWN, bx, bz, 0.0008));
      // Box scrolls: rings and lines of dark green on the lawn.
      out.push(P(new THREE.RingGeometry(0.0022, 0.0029, 14).rotateX(-Math.PI / 2), BOX, { x: bx, y: 0.00095, z: bz }));
      for (const t of [-1, 1]) out.push(flat(bw * 0.8, 0.0006, BOX, bx, bz + t * bd * 0.33, 0.00095), flat(0.0006, bd * 0.8, BOX, bx + t * bw * 0.33, bz, 0.00096));
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(cone(0.0008, 0.0034, 6, BOX, { x: bx + px * (bw / 2 - 0.0008), y: 0.0006, z: bz + pz * (bd / 2 - 0.0008) }));
    }
    if (s > 0) for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      const x = 0.038 + i * 0.0055, z = -0.016 - j * 0.0065;
      out.push(...box(0.0013, 0.0013, 0.0013, 0x6a4a30, { x, z }), ball(0.0016, 0x4f7a34, { x, y: 0.0028, z }), ball(0.0004, 0xe89030, { x: x + 0.001, y: 0.0032, z: z + 0.001 }));
    }
  }
  return out;
}

// Versailles's water, the game's own (wonderModels.ts WaterArea): the
// water parterre's two pools, Latona's and Apollo's basins, the Grand
// Canal's cross (its long arm in two pieces either side of the cross
// arm, so no two sheets overlap).
const VERSAILLES_WATER: readonly WaterArea[] = [
  { x: -0.017, z: 0.017, hw: 0.01175, hd: 0.0035 }, { x: 0.017, z: 0.017, hw: 0.01175, hd: 0.0035 },
  { x: 0, z: 0.003, hw: 0.0098, hd: 0.0098, round: true },
  { x: 0, z: -0.05, hw: 0.0117, hd: 0.0069, round: true },
  { x: 0, z: -0.068, hw: 0.07, hd: 0.00325 },
  { x: 0, z: -0.061, hw: 0.00425, hd: 0.00375 }, { x: 0, z: -0.073125, hw: 0.00425, hd: 0.001875 },
];
// Its grounds beside its city: that water, and its trees the flora's own:
// the groves' blocks (four each side of the green carpet, cut by diagonal
// alleys: no tree on a block's diagonals) and a row along each side of the
// canal's cross arm.
export function versaillesGrounds(): WonderGrounds {
  const r = rnd(55), trees: GroundTree[] = [];
  for (const s of [-1, 1]) for (let gx = 0; gx < 2; gx++) for (let gz = 0; gz < 2; gz++) {
    const cx = s * (0.0175 + gx * 0.019), cz = -0.017 - gz * 0.02, w = 0.016, d = 0.017;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (i === j || i === 3 - j) continue;
      trees.push({ x: cx - w / 2 + 0.002 + (i * (w - 0.004)) / 3, z: cz - d / 2 + 0.002 + (j * (d - 0.004)) / 3, kind: r() < 0.3 ? 'oak' : 'beechMaple', height: 0.0085 + 0.0015 * r() });
    }
  }
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) for (const z of [-0.0745, -0.0613]) trees.push({ x: s * (0.0065 + i * 0.0055), z, kind: 'beechMaple', height: 0.0055 });
  return { water: VERSAILLES_WATER, trees };
}
