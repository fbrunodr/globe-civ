// Classical wonders (classical.ts): Petra, the Colossus, the Mausoleum,
// the Statue of Zeus and the Temple of Solomon, each on its 7 × 7 site, in
// site units (kit.ts), the front +z.

import * as THREE from 'three';
import { prism } from '../houseKit.ts';
import {
  P, V, archPane, ball, box, column, cone, cyl, drumC, figure, flat, islet, pane, peristyle, rnd, rod,
  shade, statue, steps, H, type G,
} from './kit.ts';
import { COLOSSUS, ZEUS } from './statues.ts';

const MARBLE = 0xe6e0d2, GOLD = 0xd8b040, BRONZE = 0xa8783e;

// A wonder in a city stands on a plain pad over its whole site (which fixes
// the city's fit: a city cell is then about 0.039 site units), the monument
// on it scaled by k to its height.
const PAD = 0.003;
function onPad(parts: G[], k: number): G[] {
  const m = new THREE.Matrix4().makeTranslation(0, PAD, 0).multiply(new THREE.Matrix4().makeScale(k, k, k));
  for (const g of parts) g.applyMatrix4(m);
  return [...box(2 * H, PAD, 2 * H, 0xcfc6b2, {}, 0xd6cdb9), ...parts];
}

// ---------- animals and figures of their own ----------

// A horse, l long, facing ry (+x at ry 0), its legs mid-stride.
function horse(x: number, z: number, l: number, ry: number, c: number, y = 0): G[] {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (f: number, h: number, w = 0) => V(x + cs * f * l - sn * w * l, y + h * l, z - sn * f * l - cs * w * l);
  const out: G[] = [
    ball(l * 0.28, c, { ...xyz(at(0, 0.62)), sx: 1.75, sy: 0.85, sz: 0.85, ry }, 1),
    rod(at(0.38, 0.7), at(0.58, 1.02), l * 0.1, c, 6, l * 0.07),
    ball(l * 0.11, c, { ...xyz(at(0.66, 1.0)), sx: 1.7, sy: 0.9, sz: 0.8, ry }),
    rod(at(0.5, 1.08), at(0.36, 0.78), l * 0.035, shade(c, 0.7), 4), // the mane
    rod(at(-0.46, 0.68), at(-0.58, 0.3), l * 0.04, shade(c, 0.75), 4), // the tail
  ];
  for (const [f, w, sw] of [[-0.32, -0.12, 0.1], [-0.32, 0.12, -0.05], [0.3, -0.12, -0.08], [0.3, 0.12, 0.12]] as const) {
    out.push(rod(at(f + sw, 0, w), at(f, 0.5, w), l * 0.035, shade(c, 0.9), 4, l * 0.05));
  }
  return out;
}
const xyz = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
// An ox, l long, facing ry: body, head lowered, horns, legs.
function ox(x: number, z: number, l: number, ry: number, c: number, y = 0): G[] {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (f: number, h: number, w = 0) => V(x + cs * f * l - sn * w * l, y + h * l, z - sn * f * l - cs * w * l);
  const out: G[] = [
    ball(l * 0.3, c, { ...xyz(at(0, 0.62)), sx: 1.55, sy: 0.95, sz: 1.0, ry }, 1),
    ball(l * 0.15, c, { ...xyz(at(0.56, 0.6)), sx: 1.3, ry }),
  ];
  for (const w of [-1, 1]) out.push(rod(at(0.58, 0.7, w * 0.08), at(0.55, 0.9, w * 0.24), l * 0.03, shade(c, 1.2), 3, l * 0.01));
  for (const [f, w] of [[-0.3, -0.13], [-0.3, 0.13], [0.3, -0.13], [0.3, 0.13]] as const) out.push(rod(at(f, 0, w), at(f, 0.42, w), l * 0.06, shade(c, 0.9), 4));
  return out;
}
// A lion lying couched, l long, facing ry: its body, mane, head, paws forward.
function lion(x: number, z: number, l: number, ry: number, c: number, y = 0): G[] {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (f: number, h: number, w = 0) => V(x + cs * f * l - sn * w * l, y + h * l, z - sn * f * l - cs * w * l);
  return [
    ball(l * 0.28, c, { ...xyz(at(-0.1, 0.26)), sx: 1.7, sy: 0.75, sz: 0.85, ry }, 1),
    ball(l * 0.22, shade(c, 0.9), { ...xyz(at(0.28, 0.42)), sx: 0.9, ry }, 1),
    ball(l * 0.13, c, { ...xyz(at(0.42, 0.44)), sx: 1.2, ry }),
    ...[-1, 1].map((w) => rod(at(0.3, 0.06, w * 0.12), at(0.62, 0.05, w * 0.12), l * 0.05, c, 4)),
    rod(at(-0.5, 0.2), at(-0.7, 0.05, 0.15), l * 0.025, c, 3),
  ];
}

// ---------- Rhodes ----------

// Helios, the sun god, in polished bronze, on his islet at the harbour's
// mouth: the mole round it, the white marble pedestal on its steps (a
// moulded base, the panelled die with a sun in bronze relief over the
// dedication, a deep cornice), and on it the god in contrapposto, his
// weight on his right leg, the torch raised in his right hand, the radiant
// crown on his curls, his cloak over his left shoulder and arm, falling in
// folds to his feet. Front +z (the game turns him to face out to sea).
export function colossus(): G[] {
  const out: G[] = [...islet()], r = rnd(17);
  const STONE = 0xd8cfbc, M = MARBLE;
  // The mole: a curve of dressed stone round the islet's front.
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / 13), R = 0.058;
    out.push(...box(0.0145, 0.006, 0.012, shade(STONE, 0.9 + r() * 0.08), { x: Math.cos(a) * R, y: 0.003, z: Math.sin(a) * R, ry: -a + Math.PI / 2 }, shade(STONE, 0.97)));
  }
  // The pedestal: three steps, a plinth, a torus and a cavetto up to the die.
  const st = steps(0.056, 0.056, 3, 0.0035, 0.003, shade(M, 0.92), { y: 0.004 }, shade(M, 0.97));
  out.push(...st.parts);
  let y = st.y;
  out.push(...box(0.041, 0.0022, 0.041, shade(M, 0.95), { y })); y += 0.0022;
  out.push(...box(0.038, 0.0016, 0.038, shade(M, 1.04), { y })); y += 0.0016;
  out.push(...sqFrustum(0.038, 0.033, 0.0018, M, y)); y += 0.0018;
  // The die: corner pilasters, a sunk panel on each face; on the front the sun and the dedication.
  const dw = 0.032, dh = 0.026;
  out.push(...box(dw, dh, dw, M, { y }));
  for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) out.push(...box(0.0032, dh - 0.0003, 0.0032, shade(M, 1.04), { x: x * (dw / 2 - 0.0012), y, z: z * (dw / 2 - 0.0012) }));
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2, nx = Math.sin(ry), nz = Math.cos(ry);
    const at = (o: number) => ({ x: nx * (dw / 2 + o), z: nz * (dw / 2 + o) });
    out.push(pane(0.0235, 0.0205, shade(M, 0.93), at(0.0002).x, y + 0.0028, at(0.0002).z, ry));
    out.push(pane(0.0205, 0.0175, shade(M, 1.02), at(0.0004).x, y + 0.0043, at(0.0004).z, ry));
  }
  {
    const zf = dw / 2 + 0.0006, ys = y + 0.0175;
    out.push(P(new THREE.CircleGeometry(0.0032, 14), BRONZE, { y: ys, z: zf }));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      out.push(P(new THREE.PlaneGeometry(0.0007, 0.0028).translate(0, 0.0047, 0), BRONZE, { y: ys, z: zf, rz: a }));
    }
    out.push(pane(0.015, 0.0055, BRONZE, 0, y + 0.0065, zf));
    for (let k = 0; k < 3; k++) out.push(pane(0.011 - k * 0.002, 0.0005, shade(BRONZE, 1.35), 0, y + 0.0076 + k * 0.0013, zf + 0.0002));
  }
  y += dh;
  // The cornice: a cavetto out, the corona, a cyma back in; the god's bronze plinth.
  out.push(...sqFrustum(dw, 0.039, 0.0028, M, y)); y += 0.0028;
  out.push(...box(0.039, 0.0022, 0.039, shade(M, 1.04), { y })); y += 0.0022;
  out.push(...sqFrustum(0.039, 0.034, 0.0012, shade(M, 0.96), y, shade(M, 0.96))); y += 0.0012;
  out.push(...box(0.026, 0.0016, 0.021, shade(0xb88a4e, 0.72), { y, z: 0.001 })); y += 0.0016;
  // The god himself.
  out.push(statue(COLOSSUS, 0.14, 0xa87238, { y }));
  return out;
}
// A square frustum (a moulding) from w0 across at y to w1 at y + h; its top in `top`, if given.
function sqFrustum(w0: number, w1: number, h: number, c: number, y: number, top?: number): G[] {
  const out = [P(new THREE.CylinderGeometry(w1 * Math.SQRT1_2, w0 * Math.SQRT1_2, h, 4, 1, true).rotateY(Math.PI / 4).translate(0, h / 2, 0), c, { y })];
  if (top !== undefined) out.push(P(new THREE.PlaneGeometry(w1, w1).rotateX(-Math.PI / 2), top, { y: y + h }));
  return out;
}

// ---------- Halicarnassus ----------

// The tomb of Mausolus in its walled court: a stepped base, the tall
// podium ringed with its painted friezes, statues at its foot and lions on
// its ledge; the Ionic colonnade round the tomb chamber; the stepped
// pyramid of a roof, and on top the king and queen in their four-horse
// chariot; a gateway to the court.
export function mausoleum(): G[] {
  const out: G[] = [], C = MARBLE, BLUE = 0x3d5f8f, RED = 0xa8473a;
  // The base and the podium.
  const st = steps(0.098, 0.114, 2, 0.003, 0.0025, shade(C, 0.94));
  out.push(...st.parts);
  const pw = 0.088, pd = 0.104, ph = 0.046, y1 = st.y;
  out.push(...box(pw, ph, pd, shade(C, 0.97), { y: y1 }));
  // Its friezes: the battle of Greeks and Amazons (above), centaurs (below), in white on blue and red.
  const frieze = (y: number, h: number, ground: number, n: number) => {
    for (const [ry, len, o] of [[0, pw, pd / 2], [Math.PI, pw, pd / 2], [Math.PI / 2, pd, pw / 2], [-Math.PI / 2, pd, pw / 2]] as const) {
      const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
      out.push(pane(len, h, ground, nx * (o + 0.0002), y, nz * (o + 0.0002), ry));
      const m = Math.round((len / pw) * n);
      for (let k = 0; k < m; k++) {
        const t = -len / 2 + (k + 0.5) * (len / m);
        out.push(pane(0.0014, h * 0.7, 0xf0ebe0, nx * (o + 0.0004) + tx * t, y + h * 0.15, nz * (o + 0.0004) + tz * t, ry));
      }
    }
  };
  frieze(y1 + ph - 0.0075, 0.006, BLUE, 26);
  frieze(y1 + 0.012, 0.004, RED, 20);
  const y2 = y1 + ph;
  out.push(...box(pw + 0.005, 0.003, pd + 0.005, shade(C, 0.93), { y: y2 }));
  // Lions on its ledge looking out.
  const ly = y2 + 0.003, cw = 0.076, cd = 0.092;
  for (let k = 0; k < 4; k++) {
    const x = -0.03 + k * 0.02;
    out.push(...lion(x, pd / 2 - 0.002, 0.0062, -Math.PI / 2, 0xe8e0d0, ly), ...lion(x, -pd / 2 + 0.002, 0.0062, Math.PI / 2, 0xe8e0d0, ly));
  }
  for (let k = 0; k < 5; k++) {
    const z = -0.04 + k * 0.02;
    out.push(...lion(pw / 2 - 0.002, z, 0.0062, 0, 0xe8e0d0, ly), ...lion(-pw / 2 + 0.002, z, 0.0062, Math.PI, 0xe8e0d0, ly));
  }
  // The colonnade round the chamber, statues between the columns.
  const colH = 0.034, hw = cw / 2 - 0.003, hd = cd / 2 - 0.003;
  out.push(...box(cw - 0.012, colH, cd - 0.012, shade(C, 0.95), { y: ly }));
  out.push(...peristyle(0, 0, hw, hd, 9, 11, (x, z) => column(x, ly, z, 0.0026, colH, C, 'ionic')));
  for (let k = 0; k < 8; k++) out.push(...figure(-hw + (k + 0.5) * ((2 * hw) / 8), hd - 0.004, 0.012, 0xe2d6c0, { y: ly, skin: 0xe2d6c0 }));
  // The entablature.
  const ye = ly + colH;
  out.push(...box(cw, 0.003, cd, shade(C, 0.97), { y: ye }));
  out.push(...box(cw + 0.001, 0.0035, cd + 0.001, BLUE, { y: ye + 0.003 }));
  out.push(...box(cw + 0.005, 0.0025, cd + 0.005, C, { y: ye + 0.0065 }, shade(C, 0.92)));
  // The stepped pyramid: twenty-four steps.
  let y = ye + 0.009;
  const n = 24, sh = 0.00118;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), w = 0.074 - f * 0.05, d = 0.09 - f * 0.05;
    out.push(...box(w, sh, d, shade(C, i % 2 ? 0.95 : 0.99), { y }, shade(C, 1.02)));
    y += sh;
  }
  // The quadriga: a plinth, four horses, the chariot, the king and queen.
  out.push(...box(0.02, 0.004, 0.03, shade(C, 0.96), { y }));
  const yq = y + 0.004;
  for (const [x, z] of [[-0.0066, 0.006], [-0.0022, 0.0064], [0.0022, 0.0064], [0.0066, 0.006]] as const) out.push(...horse(x, z, 0.012, -Math.PI / 2, 0xe8e2d4, yq));
  out.push(...box(0.01, 0.006, 0.007, shade(C, 0.92), { y: yq + 0.002, z: -0.006 }));
  for (const s of [-1, 1]) out.push(P(new THREE.TorusGeometry(0.0035, 0.0006, 4, 12).rotateY(Math.PI / 2), shade(C, 0.85), { x: s * 0.0055, y: yq + 0.0035, z: -0.007 }));
  out.push(...figure(-0.002, -0.006, 0.013, 0xe8e0cc, { y: yq + 0.004, skin: 0xe2d6c0, arm: 0.6 }), ...figure(0.0025, -0.007, 0.012, 0xe2d6c0, { y: yq + 0.004, skin: 0xe2d6c0 }));
  return onPad(out, 1.19);
}

// ---------- Olympia ----------

// Zeus enthroned in gold and ivory, brought out into the open: the temple's
// Doric colonnade standing roofless round him on its platform, its frieze
// of triglyphs and painted metopes; the god on his ebony and gold throne,
// Victory in his right hand, his sceptre and eagle in his left, an olive
// wreath on his head; the pool of oil before him; olive trees and pilgrims.
export function statueOfZeus(): G[] {
  const out: G[] = [], C = 0xe2d8c4;
  const st = steps(0.1, 0.13, 3, 0.004, 0.0025, shade(C, 0.95), { z: -0.004 }, shade(C, 1.02));
  out.push(...st.parts);
  const y = st.y, zc = -0.004, colH = 0.052, hw = st.w / 2 - 0.0042, hd = st.d / 2 - 0.0042;
  out.push(...peristyle(0, zc, hw, hd, 6, 8, (x, z) => column(x, y, z, 0.0036, colH, C, 'doric')));
  // The entablature, a ring with no roof: architrave, frieze, cornice.
  const ye = y + colH, beams = (h: number, c: number, yy: number, grow: number) => {
    const t = 0.0085 + grow;
    out.push(...box(2 * hw + t, h, t, c, { y: yy, z: zc + hd }), ...box(2 * hw + t, h, t, c, { y: yy, z: zc - hd }));
    out.push(...box(t, h, 2 * hd - t + 0.0002, c, { x: hw, y: yy, z: zc }), ...box(t, h, 2 * hd - t + 0.0002, c, { x: -hw, y: yy, z: zc }));
  };
  beams(0.004, C, ye, 0);
  beams(0.0048, shade(C, 0.97), ye + 0.004, 0.0004);
  beams(0.0022, shade(C, 1.02), ye + 0.0088, 0.0026);
  // Triglyphs (dark blue) and metopes (painted red) along the frieze's outer faces.
  const fy = ye + 0.004, fo = 0.0085 / 2 + 0.0002 + 0.0002;
  for (const [s, ry] of [[1, 0], [-1, Math.PI]] as const) {
    const m = 14;
    for (let k = 0; k <= m; k++) {
      const x = -hw - 0.004 + (k * (2 * hw + 0.008)) / m;
      out.push(pane(0.0016, 0.0048, 0x2f4a78, x, fy, zc + s * (hd + fo), ry));
      if (k < m) out.push(pane(0.0026, 0.0034, 0xb0503a, x + (2 * hw + 0.008) / m / 2, fy + 0.0007, zc + s * (hd + fo), ry));
    }
  }
  for (const [s, ry] of [[1, Math.PI / 2], [-1, -Math.PI / 2]] as const) {
    const m = 18;
    for (let k = 0; k <= m; k++) {
      const z = zc - hd - 0.004 + (k * (2 * hd + 0.008)) / m;
      out.push(pane(0.0016, 0.0048, 0x2f4a78, s * (hw + fo), fy, z, ry));
      if (k < m) out.push(pane(0.0026, 0.0034, 0xb0503a, s * (hw + fo), fy + 0.0007, z + (2 * hd + 0.008) / m / 2, ry));
    }
  }
  // Gilded acroteria at the corners, a Victory over the front.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(P(new THREE.ConeGeometry(0.0025, 0.006, 4).translate(0, 0.003, 0), GOLD, { x: sx * hw, y: ye + 0.011, z: zc + sz * hd }));
  out.push(...figure(0, zc + hd, 0.01, GOLD, { y: ye + 0.011, skin: GOLD, arm: 1 }));
  // The pool of olive oil before the god, its white rim.
  out.push(flat(0.022, 0.024, 0xf2ece0, 0, zc + 0.014, y + 0.0002), flat(0.018, 0.02, 0xa89a5a, 0, zc + 0.014, y + 0.0004));
  // The god on his throne (its base and footstool carved with him).
  const zt = zc - 0.026;
  out.push(statue(ZEUS, 0.085, 0xd8c08a, { y, z: zt }));
  return onPad(out, 1.04);
}

// ---------- Jerusalem ----------

// The First Temple after the Book of Kings, not to its measure but to its
// character, filling its square: a terrace of hewn stone climbed by a broad
// stair, its court walled in three courses of stone and one of cedar beams,
// a gate in front. On a podium the house of white stone, its side chambers
// stepping in by storey, narrow lattice windows high in the walls above
// them, a cedar roof crested in gold; before it the tall porch, its great
// cedar doors overlaid with gold and carved with palms and cherubim under a
// winged sun, its registers of lattice windows between gilded bands, a
// gorge cornice crested in gold. Before the porch the bronze pillars Jachin
// and Boaz, their lily capitals hung with chains and pomegranates; in the
// court the bronze altar with its horns and fire, the bronze Sea on its
// twelve oxen, the ten lavers on their wheeled stands.
export function templeOfSolomon(): G[] {
  const out: G[] = [], S = 0xe8dcc0, CEDAR = 0x8a5a3a, DARK = 0x2e2620, PAVE = 0xe0d4b8;
  const T = 0.01, front = 0.05;
  // The terrace and its stair, the court's paving.
  out.push(...box(2 * H, T, H + front, shade(S, 0.84), { z: (front - H) / 2 }, PAVE));
  for (let i = 0; i < 4; i++) {
    const d = H - front - i * 0.006;
    out.push(...box(2 * H, (i + 1) * 0.002, d, shade(S, 0.84), { z: front + d / 2 }, shade(PAVE, 0.97)));
  }
  for (let i = 0; i < 6; i++) out.push(flat(2 * H - 0.012, 0.0003, shade(PAVE, 0.92), 0, front - 0.006 - i * 0.0062, T + 0.00005));
  // The court's walls: three courses of stone and one of cedar; the gate's towers and lintel.
  const wall = (x: number, z: number, w: number, d: number, top = 0.026) => {
    for (let k = 0; k < 3; k++) out.push(...box(w, 0.0075, d, shade(S, 0.9 + k * 0.03), { x, y: T + k * 0.0075, z }));
    out.push(...box(w + 0.0006, top - 0.0225, d + 0.0006, CEDAR, { x, y: T + 0.0225, z }, shade(CEDAR, 1.1)));
  };
  const wi = H - 0.0025;
  wall(-wi, (front - 0.0025 - H) / 2 + 0.00125, 0.005, H + front - 0.0025);
  wall(wi, (front - 0.0025 - H) / 2 + 0.00125, 0.005, H + front - 0.0025);
  wall(0, -wi, 2 * H - 0.01, 0.005);
  for (const s of [-1, 1]) wall(s * (0.034 + (wi - 0.0025 - 0.034) / 2), front - 0.0025, wi - 0.0025 - 0.034, 0.005);
  for (const s of [-1, 1]) {
    out.push(...box(0.012, 0.05, 0.009, shade(S, 0.95), { x: s * 0.028, y: T, z: front - 0.0025 }, shade(S, 0.9)));
    out.push(...tsGorge(0.012, 0.009, 0.016, 0.013, 0.004, shade(S, 1.03), T + 0.05, front - 0.0025, s * 0.028));
    out.push(...box(0.0164, 0.002, 0.0134, GOLD, { x: s * 0.028, y: T + 0.054, z: front - 0.0025 }, CEDAR));
    out.push(...tsMerlon(s * 0.028, T + 0.056, front - 0.0025, 0.007, GOLD));
  }
  // The podium the house stands on, its steps up to the porch.
  const zb = -0.068, zp0 = -0.014, zp1 = 0.008, P0 = 0.006, Y0 = T + P0;
  out.push(...box(0.094, P0, zp1 + 0.004 - zb + 0.003, shade(S, 0.9), { z: (zp1 + 0.004 + zb - 0.003) / 2 }, shade(PAVE, 1.02)));
  out.push(...steps(0.03, 0.012, 3, P0 / 3, 0.0018, shade(S, 0.92), { y: T, z: zp1 + 0.004 + 0.006 }, shade(PAVE, 1.02)).parts);
  // The side chambers: two storeys round the house, the upper stepping in, a cedar ledge, small windows.
  const hw = 0.052, SH = 0.03;
  for (let k = 0; k < 2; k++) {
    // (Their fronts run on into the porch.)
    const w = 0.084 - k * 0.006, zbk = zb + k * 0.003, d = zp0 + 0.003 - zbk, y = Y0 + k * SH;
    out.push(...box(w, SH, d, shade(S, 0.97 - k * 0.012), { y, z: zbk + d / 2 }, shade(CEDAR, 0.95)));
    out.push(...box(w + 0.002, 0.0025, d + 0.0005, CEDAR, { y: y + SH - 0.002, z: zbk + d / 2 - 0.001 }, shade(CEDAR, 1.1)));
    for (const s of [-1, 1]) for (let j = 0; j < 7; j++) out.push(pane(0.0028, 0.0085, DARK, s * (w / 2 + 0.0002), y + 0.009, zbk + 0.004 + (j * (d - 0.008)) / 6, (s * Math.PI) / 2));
    for (let j = 0; j < 7; j++) out.push(pane(0.0028, 0.0085, DARK, -w / 2 + 0.006 + (j * (w - 0.012)) / 6, y + 0.009, zbk - 0.0002, Math.PI));
  }
  // The house rising above them: its narrow lattice windows, the cedar roof, the gilded cresting.
  const hh = 0.125, hd = zp0 - (zb + 0.007);
  out.push(...box(hw, hh, hd + 0.002, S, { y: Y0, z: zp0 - hd / 2 + 0.001 }, shade(CEDAR, 0.9)));
  for (const s of [-1, 1]) for (let j = 0; j < 6; j++) {
    const z = zp0 - hd + 0.005 + (j * (hd - 0.01)) / 5;
    out.push(pane(0.0026, 0.03, DARK, s * (hw / 2 + 0.0002), Y0 + 0.07, z, (s * Math.PI) / 2));
    for (const t of [-0.0007, 0.0007]) out.push(pane(0.0004, 0.03, 0xc8a050, s * (hw / 2 + 0.0004), Y0 + 0.07, z + t, (s * Math.PI) / 2));
    out.push(...box(0.0034, 0.0016, 0.0044, shade(S, 1.04), { x: s * (hw / 2 + 0.0004), y: Y0 + 0.1, z }));
  }
  for (let j = 0; j < 3; j++) out.push(pane(0.0026, 0.03, DARK, -0.014 + j * 0.014, Y0 + 0.07, zp0 - hd - 0.0002, Math.PI));
  out.push(...box(hw + 0.003, 0.0035, hd + 0.003, CEDAR, { y: Y0 + hh, z: zp0 - hd / 2 }, shade(CEDAR, 1.08)));
  for (const s of [-1, 1]) for (let j = 0; j < 9; j++) out.push(...tsMerlon(s * (hw / 2 - 0.0005), Y0 + hh + 0.0035, zp0 - hd + 0.002 + (j * (hd - 0.004)) / 8, 0.004, GOLD));
  for (let j = 0; j < 7; j++) out.push(...tsMerlon(-hw / 2 + 0.003 + (j * (hw - 0.006)) / 6, Y0 + hh + 0.0035, zp0 - hd + 0.0005, 0.004, GOLD));
  // The porch: a tall front, corner pilasters with their volute capitals.
  const pw = 0.074, PH = 0.182, pd = zp1 - zp0, zpc = (zp0 + zp1) / 2, zf = zp1;
  out.push(...box(pw + 0.004, 0.005, pd + 0.004, shade(S, 0.93), { y: Y0, z: zpc }));
  out.push(...box(pw, PH, pd, shade(S, 1.02), { y: Y0 + 0.005, z: zpc }));
  for (const s of [-1, 1]) {
    const x = s * (pw / 2 - 0.0033), yc = Y0 + PH - 0.012;
    out.push(...box(0.007, PH - 0.0175, 0.004, shade(S, 1.05), { x, y: Y0 + 0.005, z: zf + 0.0015 }));
    out.push(...box(0.0085, 0.002, 0.0055, shade(S, 0.95), { x, y: yc - 0.002, z: zf + 0.0015 }));
    for (const t of [-1, 1]) out.push(cyl(0.0022, 0.0022, 0.0062, 8, shade(S, 0.95), { x: x + t * 0.0024, y: yc + 0.002, z: zf + 0.0045, rx: Math.PI / 2 }));
    out.push(...box(0.0095, 0.0018, 0.0058, shade(S, 1.05), { x, y: yc + 0.0042, z: zf + 0.0015 }));
  }
  // Its registers: gilded bands; three tall lattice windows; a row of slits; a frieze of golden flowers.
  for (const yb of [0.088, 0.13, 0.16]) out.push(...box(pw + 0.0012, 0.0024, pd + 0.0012, GOLD, { y: Y0 + yb, z: zpc }));
  for (const s of [-1, 1]) {
    out.push(...archPane(0.006, 0.026, DARK, s * (pw / 2 + 0.0002), Y0 + 0.096, zpc, (s * Math.PI) / 2));
    for (const t of [-0.0035, 0.0035]) out.push(pane(0.0022, 0.019, DARK, s * (pw / 2 + 0.0002), Y0 + 0.137, zpc + t, (s * Math.PI) / 2));
  }
  for (let j = 0; j < 5; j++) out.push(pane(0.0024, 0.019, DARK, -0.016 + j * 0.008, Y0 + 0.137, zp0 - 0.0002, Math.PI));
  for (const x of [-0.019, 0, 0.019]) {
    out.push(...archPane(0.009, 0.026, DARK, x, Y0 + 0.096, zf + 0.0002));
    for (let k = 0; k < 4; k++) out.push(pane(0.0005, 0.0285, 0xc8a050, x - 0.0033 + k * 0.0022, Y0 + 0.096, zf + 0.0004));
    for (let k = 0; k < 4; k++) out.push(pane(0.009, 0.0005, 0xc8a050, x, Y0 + 0.101 + k * 0.006, zf + 0.0004));
  }
  for (let j = 0; j < 7; j++) out.push(pane(0.0024, 0.019, DARK, -0.024 + j * 0.008, Y0 + 0.137, zf + 0.0002));
  for (let j = 0; j < 9; j++) out.push(P(new THREE.CircleGeometry(0.0019, 8), GOLD, { x: -0.026 + j * 0.0065, y: Y0 + 0.172, z: zf + 0.0003 }));
  // The doorway: a deep stepped frame, the cedar doors overlaid with gold, palms and cherubim, the winged sun.
  const dw = 0.028, dh = 0.062, yd = Y0 + 0.005;
  out.push(...box(dw + 0.014, dh + 0.008, 0.003, shade(S, 0.95), { y: yd, z: zf + 0.0015 }, shade(S, 0.92)));
  out.push(pane(dw + 0.008, dh + 0.004, shade(S, 0.86), 0, yd, zf + 0.0032));
  out.push(pane(dw, dh, CEDAR, 0, yd, zf + 0.0034));
  for (const s of [-1, 1]) {
    const xl = (s * dw) / 4;
    out.push(pane(dw / 2 - 0.003, dh - 0.006, GOLD, xl, yd + 0.003, zf + 0.0036));
    out.push(pane(0.0006, dh - 0.03, shade(GOLD, 0.7), xl, yd + 0.006, zf + 0.0038));
    for (let k = 0; k < 4; k++) for (const t of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.0005, 0.0045).translate(0, 0.00225, 0), shade(GOLD, 0.7), { x: xl, y: yd + 0.014 + k * 0.004, z: zf + 0.0038, rz: t * 0.75 }));
    out.push(P(new THREE.CircleGeometry(0.0022, 8), shade(GOLD, 0.75), { x: xl, y: yd + dh - 0.012, z: zf + 0.0038 }));
    for (const t of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.004, 0.0012), shade(GOLD, 0.75), { x: xl + t * 0.0028, y: yd + dh - 0.0105, z: zf + 0.0038, rz: t * 0.4 }));
  }
  out.push(pane(0.0005, dh, shade(CEDAR, 0.6), 0, yd, zf + 0.004));
  out.push(P(new THREE.CircleGeometry(0.0035, 12), GOLD, { y: yd + dh + 0.008, z: zf + 0.0002 }));
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) out.push(P(new THREE.PlaneGeometry(0.012 - k * 0.002, 0.0012), GOLD, { x: s * (0.0095 - k * 0.0008), y: yd + dh + 0.0085 + k * 0.0016, z: zf + 0.0002, rz: s * 0.12 }));
  // The gorge cornice and the golden cresting.
  const yt = Y0 + 0.005 + PH;
  out.push(...tsGorge(pw, pd, pw + 0.008, pd + 0.008, 0.007, shade(S, 1.04), yt, zpc));
  out.push(...box(pw + 0.009, 0.0025, pd + 0.009, GOLD, { y: yt + 0.007, z: zpc }, shade(S, 0.95)));
  for (let j = 0; j < 11; j++) out.push(...tsMerlon(-pw / 2 + 0.002 + (j * (pw - 0.004)) / 10, yt + 0.0095, zp1 + 0.002, 0.0055, GOLD));
  for (const s of [-1, 1]) for (let j = 1; j < 4; j++) out.push(...tsMerlon(s * (pw / 2 + 0.002), yt + 0.0095, zp1 + 0.002 - (j * (pd + 0.004)) / 3, 0.0055, GOLD));
  // Jachin and Boaz: bronze shafts on stone bases; capitals of lily work hung with chains and pomegranates.
  for (const s of [-1, 1]) {
    const x = s * 0.024, z = 0.019, yb = T;
    out.push(...box(0.014, 0.004, 0.014, shade(S, 0.9), { x, y: yb, z }, shade(S, 0.95)));
    out.push(drumC(0.0065, 0.0058, 0.004, 14, shade(BRONZE, 0.85), { x, y: yb + 0.004, z }));
    out.push(cyl(0.0052, 0.0048, 0.07, 14, BRONZE, { x, y: yb + 0.008, z }));
    const yc = yb + 0.078;
    out.push(cyl(0.0048, 0.0078, 0.009, 14, shade(BRONZE, 1.08), { x, y: yc, z }));
    out.push(P(new THREE.TorusGeometry(0.0072, 0.0009, 4, 16).rotateX(Math.PI / 2), shade(BRONZE, 0.85), { x, y: yc + 0.0035, z }));
    out.push(P(new THREE.TorusGeometry(0.0079, 0.0009, 4, 16).rotateX(Math.PI / 2), shade(BRONZE, 0.85), { x, y: yc + 0.0085, z }));
    for (let row = 0; row < 2; row++) for (let k = 0; k < 14; k++) {
      const a = ((k + row * 0.5) / 14) * Math.PI * 2, rr = row ? 0.0083 : 0.0076;
      out.push(ball(0.0011, 0x9a4a32, { x: x + Math.cos(a) * rr, y: yc + 0.0018 + row * 0.005, z: z + Math.sin(a) * rr }));
    }
    out.push(ball(0.0082, shade(BRONZE, 1.12), { x, y: yc + 0.012, z, sy: 0.55 }, 1));
    // (The lily: petals curling out round a bud.)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      out.push(P(new THREE.SphereGeometry(1, 6, 4).scale(0.0026, 0.0055, 0.0011).translate(0, 0.0045, 0).rotateX(0.75).rotateY(Math.PI / 2 - a), shade(BRONZE, 1.2), { x: x + Math.cos(a) * 0.0042, y: yc + 0.0135, z: z + Math.sin(a) * 0.0042 }));
    }
    out.push(ball(0.0034, shade(BRONZE, 1.25), { x, y: yc + 0.0175, z, sy: 1.4 }, 1));
  }
  // The bronze altar: its ledge, horns at its corners, a ramp, its fire and smoke.
  const xa = -0.041, za = 0.031;
  out.push(...box(0.022, 0.012, 0.022, shade(BRONZE, 0.9), { x: xa, y: T, z: za }, 0x5a4030));
  out.push(...box(0.025, 0.0016, 0.025, BRONZE, { x: xa, y: T + 0.006, z: za }, shade(BRONZE, 1.05)));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(cone(0.0017, 0.005, 4, BRONZE, { x: xa + x * 0.0095, y: T + 0.012, z: za + z * 0.0095 }));
  out.push(P(new THREE.BoxGeometry(0.008, 0.002, 0.024), shade(S, 0.92), { x: xa + 0.017, y: T + 0.0058, z: za, rz: 0.52 }));
  out.push(ball(0.0045, 0xf0a040, { x: xa, y: T + 0.0145, z: za }, 1), ball(0.003, 0xffe08a, { x: xa, y: T + 0.0175, z: za }));
  for (let k = 0; k < 3; k++) out.push(ball(0.0022 + k * 0.0006, shade(0xe2ded8, 1 - k * 0.03), { x: xa + k * 0.0014, y: T + 0.02 + k * 0.0045, z: za - k * 0.001 }, 1));
  // The bronze Sea on its twelve oxen, three looking each way.
  const sx = 0.041, sz = 0.031, yo = T;
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2;
    for (const t of [-1, 0, 1]) {
      const cx = sx + Math.cos(a) * 0.0072 - Math.sin(a) * t * 0.005, cz = sz - Math.sin(a) * 0.0072 - Math.cos(a) * t * 0.005;
      out.push(...ox(cx, cz, 0.0074, a, BRONZE, yo));
    }
  }
  const yS = yo + 0.0066, R = 0.0135;
  out.push(P(new THREE.CylinderGeometry(R, 0.0095, 0.0075, 20, 1, true).translate(0, 0.00375, 0), shade(BRONZE, 1.05), { x: sx, y: yS, z: sz }));
  out.push(P(new THREE.CircleGeometry(0.0095, 20).rotateX(-Math.PI / 2), shade(BRONZE, 0.9), { x: sx, y: yS + 0.0001, z: sz }));
  out.push(P(new THREE.TorusGeometry(R, 0.0009, 4, 20).rotateX(Math.PI / 2), shade(BRONZE, 1.15), { x: sx, y: yS + 0.0075, z: sz }));
  for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; out.push(ball(0.0007, shade(BRONZE, 1.2), { x: sx + Math.cos(a) * R * 0.86, y: yS + 0.0045, z: sz + Math.sin(a) * R * 0.86 })); }
  out.push(P(new THREE.CircleGeometry(R - 0.0007, 20).rotateX(-Math.PI / 2), 0x6f9aa8, { x: sx, y: yS + 0.0065, z: sz }));
  // The ten lavers on their wheeled stands, five along each side of the house.
  for (const s of [-1, 1]) for (let j = 0; j < 5; j++) out.push(...tsLaver(s * 0.057, -0.058 + j * 0.0105, T));
  return out;
}
// A stepped merlon (as on Phoenician walls), s wide, standing at x, y, z.
function tsMerlon(x: number, y: number, z: number, s: number, c: number): G[] {
  return [...box(s * 0.7, s * 0.55, s * 0.7, c, { x, y, z }), ...box(s * 0.36, s * 0.45, s * 0.36, c, { x, y: y + s * 0.55, z })];
}
// An Egyptian gorge cornice: from w0 × d0 at y flaring to w1 × d1 at y + h (no top), centred on x, z.
function tsGorge(w0: number, d0: number, w1: number, d1: number, h: number, c: number, y: number, z: number, x = 0): G[] {
  const a = [w0 / 2, d0 / 2], b = [w1 / 2, d1 / 2], p: number[] = [];
  const q = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number) => p.push(x0, 0, z0, x1, 0, z1, x2, h, z2, x0, 0, z0, x2, h, z2, x3, h, z3);
  q(-a[0]!, a[1]!, a[0]!, a[1]!, b[0]!, b[1]!, -b[0]!, b[1]!);
  q(a[0]!, -a[1]!, -a[0]!, -a[1]!, -b[0]!, -b[1]!, b[0]!, -b[1]!);
  q(a[0]!, a[1]!, a[0]!, -a[1]!, b[0]!, -b[1]!, b[0]!, b[1]!);
  q(-a[0]!, -a[1]!, -a[0]!, a[1]!, -b[0]!, b[1]!, -b[0]!, -b[1]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return [P(g, c, { x, y, z })];
}
// A laver on its wheeled bronze stand: the panelled stand, four wheels, the basin.
function tsLaver(x: number, z: number, y: number): G[] {
  const out: G[] = [...box(0.0062, 0.005, 0.0062, shade(BRONZE, 0.9), { x, y: y + 0.0014, z }, shade(BRONZE, 0.8))];
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(cyl(0.0014, 0.0014, 0.0008, 8, shade(BRONZE, 0.7), { x: x + u * 0.0035, y: y + 0.0014, z: z + v * 0.0022, rz: Math.PI / 2 }));
  out.push(cyl(0.0024, 0.0042, 0.0028, 12, shade(BRONZE, 1.1), { x, y: y + 0.0064, z }));
  out.push(P(new THREE.CircleGeometry(0.004, 12).rotateX(-Math.PI / 2), 0x6f9aa8, { x, y: y + 0.0088, z }));
  return out;
}

// ---------- Petra ----------

// A rock wall of sandstone strata: the outline (x, z, counter-clockwise
// from above) raised in layers of 0.005 (every wall's at the same heights,
// a hair apart, so no two share a plane), each set in a little and
// shaken, in the rose, ochre and cream bands of Petra's cliffs.
const STRATA = [0xc8806a, 0xd0907a, 0xbf7462, 0xd89e80, 0xb86c5e, 0xcc8a6c, 0xdca68a];
function crag(pts: readonly (readonly [number, number])[], h: number, seed: number): G[] {
  const r = rnd(seed), out: G[] = [], lh = 0.005, n = Math.max(3, Math.round(h / lh));
  // (Its outline cut into short stretches, each point eroding at its own pace.)
  const ring: [number, number][] = [];
  pts.forEach(([x, z], j) => {
    const [x1, z1] = pts[(j + 1) % pts.length]!, m = Math.max(1, Math.round(Math.hypot(x1 - x, z1 - z) / 0.015));
    for (let k = 0; k < m; k++) ring.push([x + ((x1 - x) * k) / m, z + ((z1 - z) * k) / m]);
  });
  const phase = ring.map(() => r() * 6.28), pace = ring.map(() => 0.5 + r() * 0.8);
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const layer = ring.map(([x, z], j) => {
      const inset = Math.min(0.85, Math.pow(f, 1.6) * 0.6 * pace[j]! + Math.max(0, Math.sin(i * 0.55 + phase[j]!)) * 0.06);
      return [x + (cx - x) * inset + (r() - 0.5) * 0.0012, z + (cz - z) * inset + (r() - 0.5) * 0.0012] as const;
    });
    const c = STRATA[Math.floor((i * 1.7 + seed * 3) % STRATA.length)]!;
    out.push(...prism(layer, lh, shade(c, 0.96 + r() * 0.06), { y: i * lh + seed * 0.00007 }, shade(c, 1.04)));
  }
  return out;
}

// Al-Khazneh, the Treasury, carved out of a rose sandstone cliff: its two
// storeys of columns, the pediment over the doorway, the round kiosk
// between broken pediments above; the canyon round its plaza and the Siq,
// the narrow winding gorge that leads in; camels resting, a Bedouin's
// stall, visitors, oleanders.
export function petra(): G[] {
  const out: G[] = [], F = 0xe6a88a, DK = 0x6a3a30;
  // The cliffs: behind the facade (taller than it), its flanks, the canyon's sides, the front walls cut by the Siq.
  const fz = -0.032;
  out.push(...crag([[-0.03, fz - 0.002], [0.03, fz - 0.002], [0.034, -0.074], [-0.034, -0.074]], 0.108, 3));
  out.push(...crag([[-0.074, -0.074], [-0.034, -0.074], [-0.026, fz + 0.004], [-0.03, 0.0], [-0.074, 0.0]], 0.096, 5));
  out.push(...crag([[0.034, -0.074], [0.074, -0.074], [0.074, 0.0], [0.03, 0.0], [0.026, fz + 0.004]], 0.092, 7));
  out.push(...crag([[-0.074, 0.0], [-0.044, 0.0], [-0.05, 0.034], [-0.074, 0.036]], 0.07, 9));
  out.push(...crag([[0.044, 0.0], [0.074, 0.0], [0.074, 0.036], [0.052, 0.034]], 0.064, 11));
  // The front walls and the Siq winding between them.
  out.push(...crag([[-0.074, 0.036], [-0.05, 0.034], [-0.012, 0.042], [-0.004, 0.054], [-0.012, 0.074], [-0.074, 0.074]], 0.038, 13));
  out.push(...crag([[0.052, 0.034], [0.074, 0.036], [0.074, 0.074], [0.004, 0.074], [0.009, 0.056], [0.002, 0.044]], 0.034, 15));
  // The Treasury: lower storey.
  const yb = 0.0003;
  out.push(...steps(0.052, 0.008, 2, 0.002, 0.001, shade(F, 0.92), { y: yb, z: fz + 0.004 }).parts);
  const y0 = yb + 0.004, zc = fz + 0.008;
  out.push(...box(0.0514, 0.036, 0.006, shade(F, 0.95), { y: y0, z: fz + 0.003 }));
  out.push(pane(0.009, 0.018, DK, 0, y0, fz + 0.0062));
  for (const s of [-1, 1]) out.push(pane(0.006, 0.014, shade(DK, 1.3), s * 0.02, y0 + 0.002, fz + 0.0062));
  for (const x of [-0.022, -0.0125, -0.0045, 0.0045, 0.0125, 0.022]) out.push(...column(x, y0, zc, 0.0021, 0.03, F, 'ionic'));
  out.push(...box(0.052, 0.0035, 0.009, shade(F, 1.02), { y: y0 + 0.03, z: fz + 0.005 }));
  out.push(...box(0.053, 0.0025, 0.0095, shade(F, 0.95), { y: y0 + 0.0335, z: fz + 0.005 }));
  // The pediment over the middle four columns.
  const yp = y0 + 0.036;
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.019, 0, 0, 0.019, 0, 0, 0, 0.009, 0], 3));
  out.push(P(tri, shade(F, 1.04), { y: yp, z: zc + 0.0015 }));
  for (const s of [-1, 1]) out.push(rod(V(s * 0.0195, yp, zc + 0.0018), V(0, yp + 0.0092, zc + 0.0018), 0.0009, shade(F, 0.98), 4));
  out.push(P(new THREE.BoxGeometry(0.038, 0.0005, 0.004), shade(F, 0.9), { y: yp + 0.0002, z: zc }));
  // Upper storey: an attic, two pavilions with their broken pediments, the round kiosk with its urn.
  const y1 = y0 + 0.046;
  out.push(...box(0.052, 0.004, 0.005, shade(F, 0.96), { y: y0 + 0.042, z: fz + 0.0025 }));
  out.push(...box(0.05, 0.026, 0.004, shade(F, 0.93), { y: y1, z: fz + 0.002 }));
  for (const s of [-1, 1]) {
    const px = s * 0.019;
    out.push(...box(0.012, 0.024, 0.004, shade(F, 0.98), { x: px, y: y1, z: fz + 0.006 }));
    out.push(pane(0.004, 0.012, shade(DK, 1.2), px, y1 + 0.004, fz + 0.0082));
    for (const t of [-1, 1]) out.push(...column(px + t * 0.0045, y1, fz + 0.009, 0.0015, 0.022, F, 'ionic'));
    out.push(...box(0.014, 0.0025, 0.0058, F, { x: px, y: y1 + 0.022, z: fz + 0.0072 }));
    // (The half pediment, sloping up toward the kiosk... and broken off.)
    const half = new THREE.BufferGeometry(), sgn = -s;
    half.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, sgn * 0.007, 0, 0, 0, 0.004, 0].map((v, i) => (i % 3 === 0 ? v : v)), 3));
    out.push(P(half, shade(F, 1.04), { x: px - sgn * 0.007, y: y1 + 0.0245, z: fz + 0.0102 }));
  }
  const kz = fz + 0.007;
  out.push(drumC(0.0082, 0.0082, 0.022, 14, shade(F, 0.97), { y: y1, z: kz }));
  for (let k = 0; k < 7; k++) { const a = Math.PI * (k / 6); out.push(...column(Math.cos(a) * 0.009, y1, kz + Math.sin(a) * 0.009, 0.0013, 0.0216, F, 'ionic')); }
  out.push(drumC(0.0098, 0.0098, 0.002, 14, F, { y: y1 + 0.022, z: kz }));
  out.push(cone(0.0095, 0.009, 14, shade(F, 1.03), { y: y1 + 0.024, z: kz }));
  out.push(ball(0.0024, shade(F, 1.06), { y: y1 + 0.034, z: kz, sy: 1.3 }), cone(0.0012, 0.004, 6, shade(F, 1.06), { y: y1 + 0.036, z: kz }));
  // Carved figures in the intercolumns (weathered): dark shapes on the rose.
  for (const x of [-0.0172, 0.0172]) out.push(pane(0.003, 0.008, shade(F, 0.78), x, y0 + 0.016, fz + 0.0064));
  // Royal tombs cut in the canyon's right wall: doorways under stepped crowns.
  for (const [x, z] of [[0.04, 0.008], [0.042, 0.02]] as const) {
    out.push(...box(0.003, 0.016, 0.009, shade(F, 0.9), { x, y: 0.0003, z }));
    out.push(pane(0.004, 0.007, DK, x - 0.0016, 0.001, z, -Math.PI / 2));
    out.push(...box(0.0034, 0.002, 0.007, shade(F, 0.95), { x, y: 0.0163, z }), ...box(0.0036, 0.002, 0.004, shade(F, 0.95), { x, y: 0.0183, z }));
  }
  return out;
}
