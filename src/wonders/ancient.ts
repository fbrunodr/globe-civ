// The Ancient era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units, the front +z. Those standing beside their city (the
// Pyramids, Stonehenge, the Great Lighthouse) keep their own proportions;
// those in it rise over the town (wonderModels.ts MIN_HEIGHT).

import * as THREE from 'three';
import { chamfered, frustum, ring } from '../houseKit.ts';
import {
  P, annulus, archPane, ball, box, bush, column, cone, disc, drumC, figure, flat, pane,
  peristyle, rnd, shade, steppedPyramid, steps, templeRoof, H, islet, type G, type Models,
} from './kit.ts';
import type { GroundTree, WonderGrounds } from '../wonderModels.ts';

const WATER = 0x5f8fa3, GRASS = 0x86a058, LEAF = 0x557a36;
const MARBLE = 0xe6e0d2, BRONZE = 0x9a7a4a;

// ---------- Giza ----------

// The Great Pyramid alone on the plateau, whole as built: its courses of
// stone rising to a gilded capstone (on the desert itself: no base).
export function pyramids(): G[] {
  const out: G[] = [];
  const LIME = 0xcfb07a, base = 0.12;
  out.push(...steppedPyramid(base, 0.64 * base, 28, LIME, { smooth: 0.07, casing: 0xe2b448 }));
  return out;
}

// ---------- the Pharos ----------

// On its islet: the walled precinct with its corner towers, the square
// first stage with rows of windows and tritons blowing conchs at its
// corners, the octagonal second, the round lantern of columns with its fire,
// Zeus the Saviour on top; a ramp of arches up to the door.
export function greatLighthouse(islet: () => G[]): G[] {
  const L = 0xe4d8ba, D = 0x3f3a35, out: G[] = [...islet()];
  // The precinct: a low wall with merlons, round towers at its corners.
  out.push(...box(0.104, 0.008, 0.104, shade(L, 0.92), { y: 0.004 }, shade(L, 0.86)));
  for (let i = 0; i < 12; i++) for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t = -0.046 + (i * 0.092) / 11;
    out.push(...box(0.003, 0.003, 0.003, shade(L, 0.9), { x: fx ? fx * 0.0505 : t, y: 0.012, z: fz ? fz * 0.0505 : t }));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    out.push(drumC(0.0075, 0.007, 0.018, 10, shade(L, 0.95), { x: x * 0.05, y: 0.004, z: z * 0.05 }));
    out.push(cone(0.0078, 0.006, 10, 0xa8604a, { x: x * 0.05, y: 0.022, z: z * 0.05 }));
  }
  // The first stage: a square tower, windows in rows, a cornice; tritons at its corners.
  const y0 = 0.012, h1 = 0.086, w1 = 0.046;
  out.push(...box(w1 + 0.006, 0.004, w1 + 0.006, shade(L, 0.95), { y: y0 }));
  out.push(...box(w1, h1, w1, L, { y: y0 + 0.004 }));
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry), o = w1 / 2 + 0.0003;
    for (let row = 0; row < 6; row++) for (const s of [-1, 0, 1]) {
      if (ry === 0 && row === 0 && s === 0) continue; // (the door)
      out.push(pane(0.0032, 0.0055, D, nx * o + tx * s * 0.013, y0 + 0.016 + row * 0.0125, nz * o + tz * s * 0.013, ry));
    }
    // Pilasters at the corners.
    for (const s of [-1, 1]) out.push(...box(0.003, h1 - 0.0003, 0.003, shade(L, 1.04), { x: nx * (w1 / 2) + tx * s * (w1 / 2), y: y0 + 0.004, z: nz * (w1 / 2) + tz * s * (w1 / 2) }));
  }
  out.push(...archPane(0.007, 0.007, D, 0, y0 + 0.016, w1 / 2 + 0.0003)); // the door
  // String courses between the rows of windows.
  for (const yb of [0.036, 0.061, 0.086]) out.push(...box(w1 + 0.0016, 0.0014, w1 + 0.0016, shade(L, 0.94), { y: y0 + yb }));
  const y1 = y0 + 0.004 + h1;
  out.push(...box(w1 + 0.006, 0.0035, w1 + 0.006, shade(L, 0.96), { y: y1 }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...figure(x * 0.022, z * 0.022, 0.012, BRONZE, { y: y1 + 0.0035, ry: Math.atan2(x, z), skin: BRONZE, arm: 1 }));
  // The second stage, octagonal, with its windows and cornice.
  const y2 = y1 + 0.0035, h2 = 0.04;
  out.push(...chamfered(0.034, h2, 0.034, 0.29, shade(L, 1.02), { y: y2 }));
  for (let k = 0; k < 8; k++) {
    const ry = (k * Math.PI) / 4, o = 0.0175;
    for (let row = 0; row < 3; row++) out.push(pane(0.0028, 0.005, D, Math.sin(ry) * o, y2 + 0.006 + row * 0.012, Math.cos(ry) * o, ry));
  }
  out.push(...chamfered(0.039, 0.003, 0.039, 0.29, shade(L, 0.95), { y: y2 + h2 }));
  // The lantern: a ring of columns round the fire, a cone roof, the god on top.
  const y3 = y2 + h2 + 0.003;
  out.push(drumC(0.0125, 0.012, 0.004, 14, L, { y: y3 }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    out.push(drumC(0.0013, 0.0011, 0.014, 6, L, { x: Math.cos(a) * 0.0098, y: y3 + 0.004, z: Math.sin(a) * 0.0098 }));
  }
  out.push(ball(0.0055, 0xf0a040, { y: y3 + 0.009 }, 1), ball(0.0034, 0xffe08a, { y: y3 + 0.0105 }, 1));
  out.push(drumC(0.013, 0.013, 0.0025, 14, shade(L, 0.95), { y: y3 + 0.018 }));
  out.push(cone(0.0125, 0.009, 14, BRONZE, { y: y3 + 0.0205 }));
  out.push(...figure(0, 0, 0.016, BRONZE, { y: y3 + 0.0285, skin: BRONZE, arm: 1 }));
  // The ramp of arches from the precinct's front up to the door.
  const rz0 = 0.05, rz1 = w1 / 2 + 0.002, ry0 = 0.012, ry1 = y0 + 0.016;
  const ramp = Math.hypot(rz0 - rz1, ry1 - ry0);
  out.push(P(new THREE.BoxGeometry(0.008, 0.003, ramp), shade(L, 0.93), { y: (ry0 + ry1) / 2 - 0.0015, z: (rz0 + rz1) / 2, rx: Math.atan2(ry1 - ry0, rz0 - rz1) }));
  out.push(...box(0.007, ry1 - ry0, 0.006, shade(L, 0.9), { y: ry0, z: rz1 + 0.003 }));
  for (let i = 0; i < 3; i++) out.push(...[-1, 1].flatMap((s) => archPane(0.0035, 0.002 + i * 0.002, D, s * 0.0043, ry0, rz1 + 0.009 + i * 0.008, s * Math.PI / 2)));
  return out;
}

// ---------- Salisbury Plain ----------

// The circle whole as built: thirty sarsens under a ring of lintels, the
// horseshoe of five trilithons rising to the tallest at the back, the
// bluestone circle and horseshoe, the altar stone; the bank and its chalk
// ditch round it, open to the avenue and the Heel Stone; the station
// stones. (On the bare ground, no
// platform: wonderModels.ts ON_BARE_GROUND.)
export function stonehenge(): G[] {
  const r = rnd(11), out: G[] = [];
  const SARSEN = 0xa09a8c, BLUE = 0x7f8a94, CHALK = 0xe6e2d6;
  const stone = (c: number) => shade(c, 0.88 + r() * 0.2);
  out.push(disc(0.06, shade(GRASS, 1.06), 0, 0, 0.0003, 28));
  out.push(annulus(0.064, 0.0685, CHALK, 0, 0, 0.0004, 40));
  // The bank, open toward the avenue (+z).
  const gap = 0.5;
  out.push(P(new THREE.TorusGeometry(0.0715, 0.003, 4, 40, Math.PI * 2 - gap).rotateX(Math.PI / 2).rotateY(1.5 * Math.PI - gap / 2), shade(GRASS, 0.92), { y: 0.0003, sy: 0.5 }));
  for (const s of [-1, 1]) out.push(...box(0.0025, 0.0012, 0.012, shade(GRASS, 0.92), { x: s * 0.011, z: 0.072 }));
  // The sarsen circle and its lintels (three lintels fallen, one upright down).
  const R = 0.046, n = 30;
  const fallen = new Set([7, 8, 19, 20]);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, ry = -a + Math.PI / 2;
    if (i === 20) { out.push(...box(0.0062, 0.0048, 0.021, stone(SARSEN), { x: Math.cos(a) * (R + 0.012), y: 0, z: Math.sin(a) * (R + 0.012), ry: ry + 0.3 })); continue; }
    out.push(...frustum(0.0064, 0.005, 0.0056, 0.0044, 0.021, stone(SARSEN), { x: Math.cos(a) * R, z: Math.sin(a) * R, ry }, stone(SARSEN)));
    const b = a + Math.PI / n;
    if (!fallen.has(i)) out.push(...box(0.0098, 0.0028, 0.0042, stone(SARSEN), { x: Math.cos(b) * R, y: 0.021, z: Math.sin(b) * R, ry: -b + Math.PI / 2 }).map((g) => g.translate(0, (i % 3) * 0.00012, 0)));
  }
  out.push(...box(0.0095, 0.0028, 0.0042, stone(SARSEN), { x: Math.cos(0.9) * (R + 0.008), y: 0, z: Math.sin(0.9) * (R + 0.008), ry: 0.4 }));
  // The bluestone circle.
  for (let i = 0; i < 40; i++) {
    const a = ((i + 0.3 * r()) / 40) * Math.PI * 2;
    out.push(...frustum(0.003, 0.0024, 0.0024, 0.0018, 0.008 + r() * 0.004, stone(BLUE), { x: Math.cos(a) * 0.037, z: Math.sin(a) * 0.037, ry: -a + r() * 0.4 }));
  }
  // The trilithons: a horseshoe open to the avenue, the back one tallest.
  const tri = [[-1.25, 0.024], [-0.62, 0.027], [0, 0.032], [0.62, 0.027], [1.25, 0.024]] as const;
  for (const [f, h] of tri) {
    const a = -Math.PI / 2 + f * 1.05, x = Math.cos(a) * 0.026, z = Math.sin(a) * 0.024, ry = -a + Math.PI / 2;
    const tx = Math.cos(ry), tz = -Math.sin(ry);
    for (const s of [-1, 1]) out.push(...frustum(0.0068, 0.0052, 0.0058, 0.0046, h, stone(SARSEN), { x: x + tx * s * 0.0046, z: z + tz * s * 0.0046, ry }, stone(SARSEN)));
    out.push(...box(0.0172, 0.0034, 0.0052, stone(SARSEN), { x, y: h, z, ry }));
  }
  // The bluestone horseshoe inside, the altar stone at its heart.
  for (let i = 0; i < 15; i++) {
    const a = Math.PI / 2 + Math.PI * (0.2 + (1.6 * i) / 14);
    out.push(...box(0.0024, 0.009 + (Math.abs(i - 7) < 3 ? 0.003 : 0), 0.002, stone(BLUE), { x: Math.cos(a) * 0.016, z: Math.sin(a) * 0.0145, ry: -a }));
  }
  out.push(...box(0.012, 0.0016, 0.0035, 0x8a7a6a, { z: -0.004 }));
  // The Heel Stone in the avenue, the Slaughter Stone lying at the entrance, the station stones.
  out.push(...frustum(0.008, 0.007, 0.005, 0.004, 0.016, stone(SARSEN), { x: 0.004, z: 0.0735, ry: 0.4 }, stone(SARSEN)));
  out.push(...box(0.0056, 0.002, 0.012, stone(SARSEN), { x: 0.002, z: 0.061, ry: 0.2 }));
  for (const [x, z] of [[-0.03, -0.05], [0.032, -0.048], [-0.031, 0.049], [0.03, 0.05]] as const) out.push(...box(0.0035, 0.004, 0.0028, stone(SARSEN), { x, z }));
  return out;
}

// ---------- Babylon ----------

// A mountain of gardens: five terraces of brick on vaulted arcades,
// planted with palms, cypresses, fruit trees and flowers, vines hanging over
// every edge; a stair up the front; water running down the front in
// cascades, terrace by terrace; a
// pavilion on the top; at the foot, a band of blue glazed brick with
// golden lions and dragons.
// Its terraces' tiers (widths, each TIER tall, the stack set back GARDEN_DZ),
// and the spots along each ledge where its plants stand: a tree (a palm,
// a cypress, a round-headed tree) or flowering bushes (pick 3).
const TIERS = [0.146, 0.118, 0.092, 0.068, 0.046], TIER = 0.022, GARDEN_DZ = -0.002;
function gardenSpots(i: number): { x: number; z: number; y: number; pick: number; k: number }[] {
  const w = TIERS[i]!, d = w * 0.94, next = TIERS[i + 1];
  if (next === undefined) return [];
  const yl = (i + 1) * TIER, mid = (w + next) / 4, midD = (d + next * 0.94) / 4;
  const spots: [number, number][] = [];
  const nAlong = Math.max(3, Math.round(w / 0.016));
  for (let k = 0; k < nAlong; k++) {
    const t = -w / 2 + 0.006 + (k * (w - 0.012)) / (nAlong - 1);
    if (Math.abs(t) > 0.01) spots.push([t, midD]);
    spots.push([t, -midD]);
  }
  for (let k = 1; k < nAlong - 1; k++) { const t = -d / 2 + 0.006 + (k * (d - 0.012)) / (nAlong - 1); spots.push([mid, t], [-mid, t]); }
  return spots.map(([x, z], k) => ({ x, z: z + GARDEN_DZ, y: yl, pick: (k + i) % 4, k }));
}
// Its trees, the flora's own (wonderModels.ts WonderGrounds), standing on
// its terraces: palms, cypresses and round-headed trees along the ledges,
// two palms by the pavilion on the top.
export function hangingGardensGrounds(): WonderGrounds {
  const r = rnd(6), trees: GroundTree[] = [];
  for (let i = 0; i < TIERS.length; i++) for (const sp of gardenSpots(i)) {
    if (sp.pick === 0) trees.push({ x: sp.x, z: sp.z, y: sp.y, kind: 'palm', height: 0.018 + r() * 0.006 });
    else if (sp.pick === 1) trees.push({ x: sp.x, z: sp.z, y: sp.y, kind: 'cypress', height: 0.016 + r() * 0.005 });
    else if (sp.pick === 2) trees.push({ x: sp.x, z: sp.z, y: sp.y, kind: 'beechMaple', height: 0.011 + r() * 0.002 });
  }
  const yt = TIERS.length * TIER;
  trees.push({ x: 0.016, z: GARDEN_DZ + 0.012, y: yt, kind: 'palm', height: 0.022 }, { x: -0.016, z: GARDEN_DZ + 0.01, y: yt, kind: 'palm', height: 0.019 });
  return { trees };
}
export function hangingGardens(H: number): G[] {
  const r = rnd(5), out: G[] = [];
  const BRICK = 0xc49c66, DARK = 0x3d3026, SOIL = 0x6f8a3c, GLAZE = 0x2f5e9e, GOLD = 0xe2b84a;
  out.push(flat(2 * H, 2 * H, 0xc8b48c, 0, 0, 0.0003));
  const tiers = TIERS, th = TIER, dz = GARDEN_DZ, CASCADE = 0.034;
  const flowers = [0xd77aa0, 0xe8c84a, 0xf0ece0, 0x9a6ac0, 0xe0703a];
  tiers.forEach((w, i) => {
    const d = w * 0.94, y = i * th;
    out.push(...box(w, th, d, shade(BRICK, 1 - i * 0.015), { y, z: dz }, SOIL));
    out.push(ring(w, 0.0028, d, shade(BRICK, 1.08), { y: y + th, z: dz }));
    // The arcades on the front and sides (the front's middle left for the stair).
    const arcY = y + (i === 0 ? 0.0095 : 0.004), aw = 0.0055, ah = 0.0085;
    for (const [face, len] of [[0, w], [1, d], [3, d]] as const) {
      const ry = face === 0 ? 0 : face === 1 ? Math.PI / 2 : -Math.PI / 2;
      const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
      const o = (face === 0 ? d : w) / 2 + 0.0003, n = Math.floor(len / 0.0095);
      for (let k = 0; k < n; k++) {
        const t = -len / 2 + (k + 0.5) * (len / n);
        if (face === 0 && (Math.abs(t) < 0.009 || Math.abs(t - CASCADE) < 0.005)) continue;
        out.push(...archPane(aw, ah - aw / 2, DARK, nx * o + tx * t, arcY, dz + nz * o + tz * t, ry));
      }
      // Vines hanging from the edge above, of every length.
      const m = Math.floor(len / 0.0032);
      for (let k = 0; k < m; k++) {
        const t = -len / 2 + (k + 0.5) * (len / m);
        if (face === 0 && (Math.abs(t) < 0.008 || Math.abs(t - CASCADE) < 0.004)) continue;
        if (r() < 0.3) continue;
        const l = 0.004 + r() * r() * 0.014, ov = o + 0.0006 + r() * 0.0004;
        out.push(...box(0.0016 + r() * 0.001, l, 0.0009, shade(LEAF, 0.8 + r() * 0.35), { x: nx * ov + tx * t, y: y + th + 0.0028 - l, z: dz + nz * ov + tz * t, ry }));
        if (r() < 0.25) out.push(ball(0.0011, flowers[Math.floor(r() * flowers.length)]!, { x: nx * (ov + 0.0006) + tx * t, y: y + th - l * 0.6, z: dz + nz * (ov + 0.0006) + tz * t }));
      }
    }
    // The ledge between this terrace and the next: flowers along it, among
    // its trees (the flora's own: hangingGardensGrounds).
    for (const sp of gardenSpots(i)) if (sp.pick === 3) {
      const k = sp.k;
      out.push(bush(sp.x, sp.z, 0.0026, flowers[k % flowers.length]!, sp.y), bush(sp.x + 0.003, sp.z + 0.002, 0.002, shade(LEAF, 1.1), sp.y));
    }
  });
  // The stair up the front, flight by flight (the first from the ground),
  // each of its steps a block.
  const flight = (z0: number, z1: number, y: number, hw: number) => {
    const n = 7, run = (z0 - z1) / n, rise = th / n;
    // (Each block runs back into the wall behind, so none shares its face.)
    for (let s = 0; s < n; s++) { const zf = z0 - s * run, zb = z1 - 0.0006; out.push(...box(hw * 2, rise * (s + 1) - 0.00015, zf - zb, shade(BRICK, 1.1), { y, z: (zf + zb) / 2 }, shade(BRICK, s % 2 ? 1.12 : 1.18))); }
  };
  flight(dz + tiers[0]! * 0.47 + 0.011, dz + tiers[0]! * 0.47, 0, 0.007);
  for (let i = 0; i < tiers.length - 1; i++) flight(dz + tiers[i]! * 0.47 - 0.0004, dz + tiers[i + 1]! * 0.47, (i + 1) * th, 0.006);
  // The pavilion on the top, its parapet stepped, a dome of reeds.
  const yt = tiers.length * th;
  out.push(...box(0.028, 0.012, 0.022, shade(BRICK, 1.08), { y: yt, z: dz - 0.004 }));
  for (let k = 0; k < 7; k++) out.push(...box(0.0028, 0.003, 0.0028, shade(BRICK, 1.02), { x: -0.0125 + k * 0.0042, y: yt + 0.012, z: dz - 0.004 + 0.0096 }));
  out.push(...archPane(0.006, 0.006, DARK, 0, yt, dz - 0.004 + 0.0113));
  out.push(P(new THREE.SphereGeometry(0.008, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xb89a5e, { y: yt + 0.012, z: dz - 0.006 }));
  // The water: lifted (by hidden screws) to a pool on the highest terrace
  // but one, running down the front from it in cascades, terrace by terrace.
  for (let i = 0; i < tiers.length - 1; i++) {
    const d = tiers[i]! * 0.94, y = i * th;
    out.push(pane(0.004, th, 0x7fb4cc, CASCADE, y, dz + d / 2 + 0.0009));
    out.push(pane(0.0018, th, 0xd8eef4, CASCADE + 0.0004, y, dz + d / 2 + 0.0011));
    if (i > 0) out.push(flat(0.007, 0.006, WATER, CASCADE, dz + d / 2 + 0.0035, y + 0.0004));
  }
  { const n = tiers.length - 1, d = tiers[n - 1]! * 0.94; out.push(flat(0.007, 0.006, WATER, CASCADE, dz + d / 2 - 0.0035, n * th + 0.0004)); }
  // At the foot, the band of blue glaze, golden beasts striding along it.
  const w0 = tiers[0]!, d0 = w0 * 0.94;
  for (const [ry, len, o] of [[0, w0, d0 / 2], [Math.PI / 2, d0, w0 / 2], [-Math.PI / 2, d0, w0 / 2], [Math.PI, w0, d0 / 2]] as const) {
    const nx = Math.sin(ry), nz = Math.cos(ry), tx2 = Math.cos(ry), tz2 = -Math.sin(ry);
    out.push(pane(len, 0.0065, GLAZE, nx * (o + 0.0002), 0.0015, dz + nz * (o + 0.0002), ry));
    for (let k = 0; k < Math.floor(len / 0.009); k++) {
      const t = -len / 2 + 0.0045 + k * 0.009;
      if (ry === 0 && Math.abs(t) < 0.008) continue;
      out.push(pane(0.0042, 0.0028, GOLD, nx * (o + 0.0004) + tx2 * t, 0.0033, dz + nz * (o + 0.0004) + tz2 * t, ry));
    }
  }
  return out;
}

// ---------- Ephesus ----------

// The great temple of Artemis on its walled precinct: a stepped platform,
// a double forest of Ionic columns (the outer ones with their carved lower
// drums), the cella within; the entablature with its painted frieze, the
// tiled roof with its pediments and acroteria.
export function templeOfArtemis(): G[] {
  const out: G[] = [], C = MARBLE, PAINT = 0x3d5f8f, TILE = 0xb5603e, CARVED = 0xd8c8a8;
  // The precinct: a paved terrace.
  out.push(...box(0.11, 0.012, 0.152, shade(C, 0.86), {}, 0xcfc4ae));
  for (let i = 0; i < 18; i++) out.push(flat(0.11, 0.0003, shade(0xcfc4ae, 0.93), 0, -0.0755 + i * 0.0088, 0.01205));
  const st = steps(0.088, 0.126, 4, 0.0035, 0.002, shade(C, 0.95), { y: 0.012, z: -0.008 }, shade(C, 1.02));
  out.push(...st.parts);
  const y = st.y, zc = -0.008, colH = 0.064, r = 0.0034;
  const hw = st.w / 2 - 0.0045, hd = st.d / 2 - 0.0045;
  // The outer colonnade (carved drums), the inner one, the cella within.
  out.push(...peristyle(0, zc, hw, hd, 8, 12, (x, z) => column(x, y, z, r, colH, C, 'ionic', CARVED)));
  const sx = (2 * hw) / 7, sz = (2 * hd) / 11;
  out.push(...peristyle(0, zc, hw - sx, hd - sz, 6, 10, (x, z) => column(x, y, z, r * 0.95, colH, C, 'ionic')));
  out.push(...box(0.03, colH, 0.07, shade(C, 0.96), { y, z: zc - 0.004 }));
  out.push(pane(0.009, 0.03, 0x3a2e24, 0, y, zc - 0.004 + 0.0353));
  // Her statue before the doorway, gilded.
  out.push(...figure(0, zc + 0.036, 0.022, 0xd2a64a, { y, skin: 0x8a6a4a }));
  // The entablature and the roof.
  const roof = templeRoof(0, zc, st.w, st.d, y + colH, C, PAINT, TILE, 0x4a6c9a);
  out.push(...roof.parts);
  // The frieze's figures: a procession in white on the blue.
  const fy = y + colH + st.w * 0.045 + 0.0007, fo = st.w * 0.002 + 0.0003;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 30; k++) out.push(pane(0.0012, 0.0024, 0xf0ebe0, s * (st.w / 2 + fo), fy, zc - st.d / 2 + 0.003 + k * ((st.d - 0.006) / 29), s * Math.PI / 2));
    for (let k = 0; k < 18; k++) out.push(pane(0.0012, 0.0024, 0xf0ebe0, -st.w / 2 + 0.003 + k * ((st.w - 0.006) / 17), fy, zc + s * (st.d / 2 + fo), s > 0 ? 0 : Math.PI));
  }
  return out;
}
export const ANCIENT: Models<'pyramids' | 'greatLighthouse' | 'stonehenge' | 'hangingGardens' | 'templeOfArtemis'> = {
  pyramids,
  greatLighthouse: () => greatLighthouse(islet),
  stonehenge,
  hangingGardens: () => hangingGardens(H),
  templeOfArtemis,
};
