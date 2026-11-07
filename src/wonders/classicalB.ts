// Classical wonders (classical.ts): Petra, the Colossus, the Mausoleum,
// the Statue of Zeus and the Temple of Solomon, each on its 7 × 7 site, in
// site units (kit.ts), the front +z.

import * as THREE from 'three';
import { prism } from '../houseKit.ts';
import {
  P, V, archPane, ball, box, column, cone, cyl, drumC, figure, flat, islet, pane, peristyle, rnd, rod,
  shade, steps, H, type G,
} from './kit.ts';

const MARBLE = 0xe6e0d2, GOLD = 0xd8b040, IVORY = 0xeadcc0, BRONZE = 0xa8783e;

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

// Helios, the sun god, in polished bronze: standing on his white pedestal
// on the harbour's mole, a torch raised in his right hand, his cloak over
// his left arm, the rays of the sun round his head; the quay, ships coming
// in, people looking up.
export function colossus(): G[] {
  const out: G[] = [...islet()], r = rnd(17);
  const STONE = 0xd8cfbc;
  // The mole: a curve of dressed stone round the islet's front.
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / 13), R = 0.058;
    out.push(...box(0.0145, 0.006, 0.012, shade(STONE, 0.9 + r() * 0.08), { x: Math.cos(a) * R, y: 0.003, z: Math.sin(a) * R, ry: -a + Math.PI / 2 }, shade(STONE, 0.97)));
  }
  // The pedestal: steps, a tall white die with its bronze dedication, a cornice.
  const st = steps(0.05, 0.05, 3, 0.0035, 0.003, shade(MARBLE, 0.95), { y: 0.004 }, MARBLE);
  out.push(...st.parts);
  const y0 = st.y, dh = 0.036;
  out.push(...box(0.036, 0.003, 0.036, shade(MARBLE, 0.97), { y: y0 }));
  out.push(...box(0.031, dh, 0.031, MARBLE, { y: y0 + 0.003 }));
  out.push(pane(0.016, 0.008, BRONZE, 0, y0 + 0.016, 0.0158));
  for (const s of [-1, 1]) out.push(...box(0.0028, dh - 0.0003, 0.0028, shade(MARBLE, 1.04), { x: s * 0.0155, y: y0 + 0.003, z: 0.0155 }), ...box(0.0028, dh - 0.0003, 0.0028, shade(MARBLE, 1.04), { x: s * 0.0155, y: y0 + 0.003, z: -0.0155 }));
  const yt = y0 + 0.003 + dh;
  out.push(...box(0.037, 0.003, 0.037, shade(MARBLE, 0.95), { y: yt }));
  // The god himself.
  out.push(...helios(yt + 0.003, 0.125, 0xb88a4e));
  return out;
}
// A standing god, h tall, facing +z, feet at y0: modelled limb by limb.
function helios(y0: number, h: number, c: number): G[] {
  const D = shade(c, 0.8), L = shade(c, 1.12), out: G[] = [];
  const p = (x: number, y: number, z: number) => V(x * h, y0 + y * h, z * h);
  // (His weight on his right leg, the left knee bent and forward: contrapposto.)
  const legs = [
    { foot: [0.062, 0, 0.012], knee: [0.066, 0.28, 0.012], hip: [0.06, 0.505, 0] },
    { foot: [-0.09, 0.012, 0.075], knee: [-0.08, 0.27, 0.05], hip: [-0.06, 0.49, 0] },
  ] as const;
  for (const { foot, knee, hip } of legs) {
    out.push(P(new THREE.BoxGeometry(0.05 * h, 0.028 * h, 0.11 * h).translate(0, 0.014 * h, 0.02 * h), D, { x: foot[0] * h, y: y0 + foot[1] * h, z: foot[2] * h }));
    out.push(rod(p(foot[0], foot[1] + 0.02, foot[2]), p(knee[0], knee[1], knee[2]), 0.028 * h, c, 8, 0.04 * h));
    out.push(ball(0.04 * h, c, xyz(p(knee[0], knee[1], knee[2] + 0.004)), 1));
    out.push(rod(p(knee[0], knee[1], knee[2]), p(hip[0], hip[1], hip[2]), 0.042 * h, c, 8, 0.062 * h));
  }
  out.push(ball(0.085 * h, c, { ...xyz(p(0, 0.52, 0)), sx: 1.35, sy: 0.8, sz: 0.85 }, 1));
  out.push(ball(0.05 * h, c, { ...xyz(p(0.032, 0.49, -0.03)), sy: 0.9, sz: 0.75 }, 1), ball(0.05 * h, c, { ...xyz(p(-0.032, 0.48, -0.03)), sy: 0.9, sz: 0.75 }, 1));
  out.push(P(new THREE.CylinderGeometry(0.112 * h, 0.068 * h, 0.28 * h, 14).translate(0, 0.14 * h, 0), c, { y: y0 + 0.52 * h, sz: 0.62, rz: 0.05 }));
  out.push(ball(0.055 * h, L, { ...xyz(p(0, 0.62, 0.028)), sy: 1.35, sz: 0.5 }));
  for (const s of [-1, 1]) {
    out.push(ball(0.048 * h, L, { ...xyz(p(s * 0.045, 0.74, 0.036)), sy: 0.7, sz: 0.55 }));
    out.push(ball(0.046 * h, c, xyz(p(s * 0.11, 0.79, 0))));
  }
  out.push(rod(p(0, 0.79, 0), p(0, 0.87, 0.006), 0.034 * h, c, 6));
  out.push(ball(0.058 * h, c, { ...xyz(p(0, 0.91, 0.01)), sy: 1.12 }, 1));
  out.push(ball(0.06 * h, D, { ...xyz(p(0, 0.93, -0.006)), sy: 0.85 }, 1));
  out.push(ball(0.012 * h, L, { ...xyz(p(0, 0.905, 0.066)), sy: 1.4 }), ball(0.03 * h, D, { ...xyz(p(0, 0.87, 0.04)), sx: 1.2, sy: 0.9, sz: 0.7 }, 1)); // nose, beard
  // The sun's rays round his head.
  for (let i = 0; i < 9; i++) {
    const a = -1.25 + (2.5 * i) / 8, dir = V(Math.sin(a), Math.cos(a), -0.15).normalize();
    const c0 = p(0, 0.91, 0.0);
    out.push(rod(c0.clone().addScaledVector(dir, 0.05 * h), c0.clone().addScaledVector(dir, 0.13 * h), 0.012 * h, L, 4, 0.002 * h));
  }
  // The right arm raised with the torch.
  out.push(rod(p(0.11, 0.79, 0), p(0.17, 0.95, 0.03), 0.046 * h, c, 7, 0.038 * h), ball(0.034 * h, c, xyz(p(0.17, 0.95, 0.03))));
  out.push(rod(p(0.17, 0.95, 0.03), p(0.155, 1.1, 0.05), 0.033 * h, c, 6, 0.026 * h), ball(0.032 * h, c, xyz(p(0.155, 1.11, 0.05))));
  out.push(rod(p(0.155, 1.05, 0.05), p(0.155, 1.22, 0.05), 0.016 * h, D, 6, 0.024 * h));
  out.push(ball(0.035 * h, 0xf0a040, { ...xyz(p(0.155, 1.25, 0.05)), sy: 1.4 }, 1), ball(0.022 * h, 0xffe08a, { ...xyz(p(0.155, 1.27, 0.05)), sy: 1.4 }));
  // The left arm lowered, the cloak hanging over it.
  out.push(rod(p(-0.11, 0.79, 0), p(-0.15, 0.62, 0.03), 0.046 * h, c, 7, 0.038 * h), ball(0.034 * h, c, xyz(p(-0.15, 0.62, 0.03))));
  out.push(rod(p(-0.15, 0.62, 0.03), p(-0.13, 0.47, 0.08), 0.033 * h, c, 6, 0.026 * h), ball(0.03 * h, c, xyz(p(-0.13, 0.46, 0.085))));
  out.push(P(new THREE.BoxGeometry(0.045 * h, 0.34 * h, 0.012 * h).translate(0, -0.17 * h, 0), D, { ...xyz(p(-0.158, 0.64, 0.05)), rz: -0.06, rx: 0.12 }));
  out.push(P(new THREE.BoxGeometry(0.035 * h, 0.24 * h, 0.01 * h).translate(0, -0.12 * h, 0), shade(D, 1.08), { ...xyz(p(-0.128, 0.48, 0.095)), rz: 0.1 }));
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
  // The throne's base, carved with gold reliefs; the footstool.
  const zt = zc - 0.03;
  out.push(...box(0.04, 0.011, 0.034, 0x2a2420, { y, z: zt }, shade(0x2a2420, 1.2)));
  for (let k = 0; k < 7; k++) out.push(pane(0.0035, 0.007, GOLD, -0.0165 + k * 0.0055, y + 0.002, zt + 0.0172));
  const yb = y + 0.011;
  out.push(...zeus(yb, zt));
  return onPad(out, 1.04);
}
// The seated god on his throne, the throne's seat at yb (its base's top),
// its middle at zt, facing +z.
function zeus(yb: number, zt: number): G[] {
  const out: G[] = [], EB = 0x4a2e22, R = 0xe8c060;
  const seat = yb + 0.017;
  // The throne: gilded legs, an ebony seat and high back framed in gold, armrests on sphinxes.
  for (const [x, z] of [[-0.014, -0.01], [0.014, -0.01], [-0.014, 0.01], [0.014, 0.01]] as const) out.push(drumC(0.0016, 0.0013, 0.017, 6, GOLD, { x, y: yb, z: zt + z }));
  out.push(...box(0.032, 0.0035, 0.026, EB, { y: seat, z: zt }, shade(EB, 1.3)));
  out.push(...box(0.034, 0.056, 0.004, EB, { y: seat, z: zt - 0.012 }));
  out.push(pane(0.028, 0.048, shade(GOLD, 0.85), 0, seat + 0.004, zt - 0.0098));
  out.push(pane(0.024, 0.044, EB, 0, seat + 0.006, zt - 0.0096));
  for (const s of [-1, 1]) {
    out.push(ball(0.0026, GOLD, { x: s * 0.016, y: seat + 0.058, z: zt - 0.012 }));
    out.push(...box(0.004, 0.003, 0.024, GOLD, { x: s * 0.016, y: seat + 0.012, z: zt }));
    out.push(...box(0.0034, 0.012, 0.004, shade(GOLD, 0.9), { x: s * 0.016, y: seat, z: zt + 0.01 }));
    out.push(ball(0.0024, GOLD, { x: s * 0.016, y: seat + 0.014, z: zt + 0.012 }));
  }
  out.push(...box(0.026, 0.0045, 0.009, GOLD, { y: yb, z: zt + 0.02 }));
  // The god: gold robe over his legs and lap, ivory body, gold hair and beard.
  const hy = seat + 0.0045, hz = zt - 0.002;
  for (const s of [-1, 1]) {
    out.push(rod(V(s * 0.006, hy + 0.004, hz), V(s * 0.0068, hy + 0.004, zt + 0.018), 0.0062, GOLD, 7, 0.0056));
    out.push(rod(V(s * 0.0068, hy + 0.004, zt + 0.018), V(s * 0.007, yb + 0.0055, zt + 0.021), 0.0052, shade(GOLD, 0.95), 7, 0.0046));
    out.push(...box(0.004, 0.002, 0.007, IVORY, { x: s * 0.007, y: yb + 0.0045, z: zt + 0.022 }));
  }
  out.push(P(new THREE.BoxGeometry(0.02, 0.012, 0.004), shade(GOLD, 0.9), { y: hy - 0.0015, z: zt + 0.0205 })); // the robe falling between his knees
  out.push(...box(0.022, 0.006, 0.02, GOLD, { y: hy, z: zt + 0.006 }));
  out.push(P(new THREE.CylinderGeometry(0.0118, 0.0088, 0.03, 10).translate(0, 0.015, 0), IVORY, { y: hy + 0.005, z: hz, sz: 0.7 }));
  for (const s of [-1, 1]) {
    out.push(ball(0.0052, shade(IVORY, 1.04), { x: s * 0.0048, y: hy + 0.027, z: hz + 0.0055, sy: 0.75, sz: 0.6 }));
    out.push(ball(0.0055, IVORY, { x: s * 0.0125, y: hy + 0.031, z: hz }));
  }
  out.push(rod(V(-0.012, hy + 0.033, hz), V(0.009, hy + 0.006, hz + 0.004), 0.0042, GOLD, 6)); // the robe over his left shoulder
  out.push(rod(V(0, hy + 0.033, hz), V(0, hy + 0.039, hz + 0.001), 0.0036, IVORY, 6));
  out.push(ball(0.0062, IVORY, { y: hy + 0.0435, z: hz + 0.0012, sy: 1.1 }, 1));
  out.push(ball(0.0066, R, { y: hy + 0.0455, z: hz - 0.0012, sy: 0.85 }, 1));
  out.push(ball(0.0042, R, { y: hy + 0.0385, z: hz + 0.0048, sy: 1.3, sz: 0.8 }, 1));
  out.push(P(new THREE.TorusGeometry(0.0062, 0.0011, 4, 12).rotateX(Math.PI / 2), 0x7a9a4a, { y: hy + 0.047, z: hz }));
  // His right arm forward, Victory standing on his hand.
  out.push(rod(V(0.0125, hy + 0.031, hz), V(0.016, hy + 0.017, hz + 0.008), 0.0042, IVORY, 6, 0.0036), ball(0.0036, IVORY, { x: 0.016, y: hy + 0.017, z: hz + 0.008 }));
  out.push(rod(V(0.016, hy + 0.017, hz + 0.008), V(0.016, hy + 0.019, hz + 0.022), 0.0036, IVORY, 6, 0.003), ball(0.0032, IVORY, { x: 0.016, y: hy + 0.019, z: hz + 0.023 }));
  out.push(...figure(0.016, hz + 0.023, 0.011, GOLD, { y: hy + 0.021, skin: GOLD, arm: 1 }));
  for (const s of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.006, 0.0045).translate(s * 0.003, 0, 0), shade(GOLD, 1.08), { x: 0.016, y: hy + 0.0295, z: hz + 0.021, ry: s * 0.5, rz: s * 0.4 }));
  // His left arm raised on the sceptre, the eagle on its top.
  out.push(rod(V(-0.0125, hy + 0.031, hz), V(-0.02, hy + 0.04, hz + 0.004), 0.0042, IVORY, 6, 0.0036), ball(0.0036, IVORY, { x: -0.02, y: hy + 0.04, z: hz + 0.004 }));
  out.push(rod(V(-0.02, hy + 0.04, hz + 0.004), V(-0.021, hy + 0.05, hz + 0.008), 0.0036, IVORY, 6, 0.003), ball(0.0033, IVORY, { x: -0.021, y: hy + 0.051, z: hz + 0.008 }));
  out.push(rod(V(-0.021, yb + 0.004, hz + 0.008), V(-0.021, hy + 0.074, hz + 0.008), 0.0011, GOLD, 5));
  for (let k = 0; k < 6; k++) out.push(ball(0.0015, k % 2 ? 0x3d5f8f : 0xa8473a, { x: -0.021, y: yb + 0.012 + k * 0.012, z: hz + 0.008 }));
  out.push(ball(0.0026, GOLD, { x: -0.021, y: hy + 0.077, z: hz + 0.008, sy: 0.8, sx: 1.4 }));
  for (const s of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.0055, 0.0035).translate(s * 0.0028, 0.0015, 0), shade(GOLD, 0.92), { x: -0.021, y: hy + 0.078, z: hz + 0.008, rz: s * 0.5 }));
  return out;
}

// ---------- Jerusalem ----------

// The First Temple as the Book of Kings describes it, reconstructed: its
// walled court; the house of white stone with its side chambers in three
// storeys and narrow windows high up, a cedar roof; the tall porch with
// its gilded doors and carved palms and cherubim; before it the bronze
// pillars Jachin and Boaz with their lily capitals, chains and
// pomegranates; in the court the bronze altar with its fire, the bronze Sea
// on its twelve oxen, the ten lavers on their wheeled stands; priests and
// Levites, worshippers.
export function templeOfSolomon(): G[] {
  const out: G[] = [], S = 0xe8dcc0, CEDAR = 0x8a5a3a;
  out.push(...box(2 * H, 0.006, 2 * H, shade(S, 0.86), {}, 0xe0d4b8));
  for (let i = 0; i < 16; i++) out.push(flat(0.146, 0.00025, shade(0xe0d4b8, 0.95), 0, -0.07 + i * 0.0093, 0.00605));
  // The court's walls: three courses of hewn stone and one of cedar beams; a gate in front.
  const wall = (x: number, z: number, w: number, d: number) => {
    out.push(...box(w, 0.011, d, shade(S, 0.92), { x, y: 0.006, z }, shade(S, 0.96)));
    out.push(...box(w + 0.0004, 0.0025, d + 0.0004, CEDAR, { x, y: 0.017, z }));
  };
  wall(0, -0.0715, 0.146, 0.004); wall(-0.0715, 0, 0.004, 0.139); wall(0.0715, 0, 0.004, 0.139);
  wall(-0.044, 0.0715, 0.058, 0.004); wall(0.044, 0.0715, 0.058, 0.004);
  for (const s of [-1, 1]) out.push(...box(0.008, 0.026, 0.008, shade(S, 0.95), { x: s * 0.018, y: 0.006, z: 0.0715 }), ...box(0.009, 0.002, 0.009, CEDAR, { x: s * 0.018, y: 0.032, z: 0.0715 }));
  // The house: its side chambers stepping in by storey, their windows.
  const zh = -0.036, hd = 0.062;
  for (let k = 0; k < 3; k++) {
    const w = 0.05 - k * 0.002, d = hd + 0.007 - k * 0.001;
    out.push(...box(w, 0.0095, d, shade(S, 0.97 - k * 0.01), { y: 0.006 + k * 0.0095, z: zh - 0.004 }, CEDAR));
    for (const s of [-1, 1]) for (let j = 0; j < 9; j++) out.push(pane(0.002, 0.003, 0x3a2e24, s * (w / 2 + 0.0002), 0.009 + k * 0.0095, zh - 0.004 - d / 2 + 0.005 + j * ((d - 0.01) / 8), s * Math.PI / 2));
  }
  // The house proper rising above them, its narrow windows high, its cedar roof and gilded cresting.
  const hh = 0.07, hw = 0.032;
  out.push(...box(hw, hh, hd, S, { y: 0.006, z: zh }));
  for (const s of [-1, 1]) for (let j = 0; j < 8; j++) out.push(pane(0.0014, 0.009, 0x2e2620, s * (hw / 2 + 0.0002), 0.058, zh - hd / 2 + 0.006 + j * ((hd - 0.012) / 7), s * Math.PI / 2));
  out.push(...box(hw + 0.003, 0.003, hd + 0.003, CEDAR, { y: 0.006 + hh, z: zh }, shade(CEDAR, 1.1)));
  for (let j = 0; j < 14; j++) for (const s of [-1, 1]) out.push(...box(0.0018, 0.003, 0.0018, GOLD, { x: s * (hw / 2 + 0.0006), y: 0.079, z: zh - hd / 2 + 0.002 + j * ((hd - 0.004) / 13) }));
  // The porch: a tall front, gilded doors, carved palms and cherubim in gold.
  const zp = zh + hd / 2 + 0.0066, ph = 0.142, pw = 0.046;
  out.push(...box(pw, ph, 0.012, shade(S, 1.02), { y: 0.006, z: zp }));
  out.push(...box(pw + 0.003, 0.004, 0.015, CEDAR, { y: 0.006 + ph, z: zp }, shade(CEDAR, 1.1)));
  for (let j = 0; j < 11; j++) out.push(...box(0.0022, 0.0035, 0.0022, GOLD, { x: -pw / 2 + 0.002 + j * ((pw - 0.004) / 10), y: 0.006 + ph + 0.004, z: zp + 0.006 }));
  const zf = zp + 0.0062;
  out.push(pane(0.016, 0.03, 0x5a3a24, 0, 0.012, zf));
  out.push(pane(0.014, 0.028, GOLD, 0, 0.013, zf + 0.0002));
  out.push(pane(0.0006, 0.028, 0x8a6a2a, 0, 0.013, zf + 0.0004));
  out.push(...archPane(0.018, 0.014, shade(S, 0.9), 0, 0.05, zf));
  for (const s of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      out.push(pane(0.0007, 0.011, 0xc8a050, s * (0.012 + j * 0.0045), 0.016, zf));
      for (const t of [-1, 0, 1]) out.push(P(new THREE.PlaneGeometry(0.0007, 0.0034).translate(0, 0.0017, 0), 0xc8a050, { x: s * (0.012 + j * 0.0045), y: 0.027, z: zf, rz: t * 0.7 }));
    }
    out.push(pane(0.006, 0.01, GOLD, s * 0.0155, 0.056, zf));
  }
  // The porch's upper registers: lattice windows between gilded bands, cherubim in gold.
  for (const yb of [0.075, 0.103, 0.133]) out.push(...box(pw + 0.0012, 0.0018, 0.0124, GOLD, { y: yb, z: zp }));
  for (let row = 0; row < 2; row++) for (const x of [-0.013, 0, 0.013]) {
    const yw = 0.08 + row * 0.028;
    out.push(pane(0.006, 0.016, 0x3a2e24, x, yw, zf));
    for (let k = 0; k < 3; k++) out.push(pane(0.0005, 0.016, 0xc8a050, x - 0.002 + k * 0.002, yw, zf + 0.0002));
  }
  for (const s of [-1, 1]) out.push(...box(0.003, ph - 0.0004, 0.003, shade(S, 1.05), { x: s * (pw / 2 - 0.0012), y: 0.006, z: zf - 0.0012 }));
  // Steps up to the porch.
  out.push(...steps(0.03, 0.012, 3, 0.002, 0.0015, shade(S, 0.95), { y: 0.006, z: zp + 0.011 }).parts);
  // Jachin and Boaz.
  for (const s of [-1, 1]) {
    const x = s * 0.014, z = zp + 0.014;
    out.push(drumC(0.0042, 0.0036, 0.003, 10, shade(BRONZE, 0.85), { x, y: 0.006, z }));
    out.push(cyl(0.0029, 0.0027, 0.034, 10, BRONZE, { x, y: 0.009, z }));
    out.push(cyl(0.0027, 0.0046, 0.006, 10, shade(BRONZE, 1.08), { x, y: 0.043, z }));
    out.push(P(new THREE.TorusGeometry(0.0042, 0.0006, 4, 12).rotateX(Math.PI / 2), shade(BRONZE, 0.85), { x, y: 0.0455, z }));
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; out.push(ball(0.0008, 0x9a4a32, { x: x + Math.cos(a) * 0.0047, y: 0.0445, z: z + Math.sin(a) * 0.0047 })); }
    out.push(ball(0.0046, shade(BRONZE, 1.12), { x, y: 0.0505, z, sy: 0.7 }, 1));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; out.push(P(new THREE.ConeGeometry(0.0015, 0.004, 3).translate(0, 0.002, 0), shade(BRONZE, 1.2), { x: x + Math.cos(a) * 0.0028, y: 0.052, z: z + Math.sin(a) * 0.0028, rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6 })); }
  }
  // The bronze altar: horns at its corners, a ramp, its fire and smoke.
  const za = 0.034;
  out.push(...box(0.022, 0.011, 0.022, shade(BRONZE, 0.9), { y: 0.006, z: za }, 0x5a4030));
  out.push(...box(0.024, 0.0015, 0.024, BRONZE, { y: 0.0105, z: za }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(cone(0.0014, 0.004, 4, BRONZE, { x: x * 0.0098, y: 0.017, z: za + z * 0.0098 }));
  out.push(P(new THREE.BoxGeometry(0.008, 0.002, 0.02), shade(S, 0.92), { x: 0.02, y: 0.0115, z: za, rz: 0.48 }));
  out.push(ball(0.004, 0xf0a040, { y: 0.019, z: za }, 1), ball(0.0025, 0xffe08a, { y: 0.0215, z: za }));
  for (let k = 0; k < 3; k++) out.push(ball(0.0018 + k * 0.0005, shade(0xe2ded8, 1 - k * 0.03), { x: k * 0.0012, y: 0.023 + k * 0.004, z: za - k * 0.001 }, 1));
  // The bronze Sea on its twelve oxen, three looking each way.
  const sx = 0.036, sz = 0.03, yo = 0.006;
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2;
    for (const t of [-1, 0, 1]) {
      const cx = sx + Math.cos(a) * 0.006 - Math.sin(a) * t * 0.0042, cz = sz - Math.sin(a) * 0.006 - Math.cos(a) * t * 0.0042;
      out.push(...ox(cx, cz, 0.0062, a, BRONZE, yo));
    }
  }
  const yS = yo + 0.0055;
  out.push(P(new THREE.CylinderGeometry(0.0115, 0.008, 0.0065, 18, 1, true).translate(0, 0.00325, 0), shade(BRONZE, 1.05), { x: sx, y: yS, z: sz }));
  out.push(P(new THREE.CircleGeometry(0.008, 18).rotateX(-Math.PI / 2), shade(BRONZE, 0.9), { x: sx, y: yS + 0.0001, z: sz }));
  out.push(P(new THREE.TorusGeometry(0.0115, 0.0008, 4, 18).rotateX(Math.PI / 2), shade(BRONZE, 1.15), { x: sx, y: yS + 0.0065, z: sz }));
  out.push(P(new THREE.CircleGeometry(0.0108, 18).rotateX(-Math.PI / 2), 0x6f9aa8, { x: sx, y: yS + 0.0055, z: sz }));
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
  out.push(flat(2 * H, 2 * H, 0xd8b08a, 0, 0, 0.0003));
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
