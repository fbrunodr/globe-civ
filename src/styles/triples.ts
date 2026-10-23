// Triples (three floors, dense tiles) in the civs' own styles
// (architecture.ts): the lot models of houses.ts, one per style, built to
// the lot's footprint, in three variants. (The tulou's ring is here; on
// narrow lots houses.ts builds a shophouse in its place.)

import * as THREE from 'three';
import { cone, cyl } from '../propCatalog.ts';
import {
  E, P, arch, bands, box, dome, faceWidth, fence, flatTree, frustum, gable, hip, merlons, onFace, onion, palm, patch, pick, place,
  ring, shade, spire, storeys, strips, tilted, tree, windows, yard, cypress, birch, ALL, SEEN, type Body, type Build, type G, type Lot,
} from '../houseKit.ts';

const DOOR = 0x3a2a20;
// The heights of a body's floor lines (between floors).
const floorLines = (l: Lot, s: { base: number; storey: number }) => Array.from({ length: l.floors - 1 }, (_, f) => s.base + (f + 1) * s.storey);
// Positions of n bays along a width, at their middles.
const bays = (w: number, n: number) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * (w / n));

export const TRIPLE_STYLES = {
  // Romans: brick flats over shops behind wide arches, a timber balcony, a low tiled roof.
  insula(l) {
    const brick = pick(l, [0xb5653e, 0xa85a38, 0xc07048]), roof = pick(l, [0x9c4a2c, 0xa65232, 0x8f4428]), wood = 0x6e4228, plaster = 0xe0c8a0;
    const b = place(l, 0.88, 0.7, l.ld * 0.16), s = storeys(l, 0.05), out: G[] = [];
    out.push(...yard(l, b, 0xb8ae98, 0xc8bca4));
    out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
    // Shops (tabernae): arched openings with wooden counters.
    const n = Math.max(2, Math.floor(b.w / 0.011)), sh = s.base + s.storey * 0.62;
    for (const a of bays(b.w, n)) out.push(...arch(b, 'front', a, 0, (b.w / n) * 0.62, sh, 0x4a2e20), onFace(b, 'front', a, 0, (b.w / n) * 0.62, s.storey * 0.24, wood, E * 2));
    // A timber balcony along the first floor.
    const y1 = s.base + s.storey, front = b.z + b.d / 2;
    out.push(...box(b.w * 0.96, 0.0008, 0.004, wood, { x: b.x, y: y1, z: front + 0.002 }));
    out.push(onFace({ ...b, d: b.d + 0.008 }, 'front', 0, y1 + 0.0008, b.w * 0.96, 0.0022, wood));
    for (const f of ALL) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: y1, w: 0.0026, h: s.storey * 0.38, spacing: 0.0085, sill: s.storey * 0.32, color: 0x2a2020, frame: plaster }));
    out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.2, roof, { x: b.x, y: b.h, z: b.z }));
    return out;
  },

  // Greeks: an ochre townhouse, marble pilasters, a pediment, French windows on little balconies.
  neoclassical(l) {
    const wall = pick(l, [0xecd3a0, 0xe8bfa8, 0xd8dcc0]), marble = 0xf6f1e4, iron = 0x2a2a2a, shut = pick(l, [0x3c5a7a, 0x5a6a3a, 0x3c5a7a]);
    const b = place(l, 0.8, 0.62, l.ld * 0.1), s = storeys(l, 0.1), out: G[] = [];
    out.push(...yard(l, b, 0xd0c8b4, 0xe0d8c4));
    out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }), ...box(b.w + 0.0016, s.base, b.d + 0.0016, marble, { x: b.x, z: b.z }));
    const front = b.z + b.d / 2;
    for (const sx of [-1, 1]) out.push(...box(0.0024, b.h - 0.0002, 0.0012, marble, { x: b.x + sx * (b.w / 2 - 0.0009), z: front }));
    out.push(...box(b.w + 0.002, 0.0012, b.d + 0.002, marble, { x: b.x, y: b.h - 0.001, z: b.z }));
    // Tall windows in marble frames, each upper one on its own iron balcony.
    const n = Math.max(2, Math.floor(b.w / 0.0095));
    for (let f = 0; f < l.floors; f++) for (const a of bays(b.w, n)) {
      const y = s.base + f * s.storey + s.storey * 0.18;
      if (f === 0 && Math.abs(a) < b.w / n / 2) continue;
      out.push(onFace(b, 'front', a, y - 0.0005, 0.0038, s.storey * 0.62 + 0.0008, marble), onFace(b, 'front', a, y, 0.0028, s.storey * 0.62, shut, E * 2));
      if (f > 0) out.push(...box(0.0046, 0.0006, 0.0022, iron, { x: b.x + a, y, z: front + 0.0011 }), ...box(0.0046, 0.0018, 0.0003, iron, { x: b.x + a, y, z: front + 0.0022 }));
    }
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.5, spacing: 0.011, sill: s.storey * 0.25, color: 0x3a3a3a }));
    out.push(onFace(b, 'front', 0, 0, 0.0062, Math.min(0.012, s.storey * 0.8), marble), onFace(b, 'front', 0, 0, 0.0046, Math.min(0.011, s.storey * 0.74), shut, E * 2));
    // A pediment to the street, acroteria on it.
    const rh = b.w * 0.2;
    out.push(...gable(b.w + 0.003, b.d + 0.003, rh, 0xd47a4e, { x: b.x, y: b.h, z: b.z }, true, marble));
    out.push(...box(0.0014, 0.002, 0.0008, marble, { x: b.x, y: b.h + rh, z: front + 0.0012 }));
    for (const sx of [-1, 1]) out.push(...box(0.0012, 0.0016, 0.0008, marble, { x: b.x + sx * (b.w / 2), y: b.h, z: front + 0.0012 }));
    out.push(...tree(l.lw * 0.66, -l.ld * 0.82, 0.8, 0x6a7a44));
    return out;
  },

  // Aztecs: red tezontle stone framed in grey cantera, iron balconies, pinnacles on the parapet.
  colonial(l) {
    const stone = pick(l, [0x8e3b2e, 0x9a4433, 0xd99a3a]), cantera = 0xcbc3b3, iron = 0x1d1d1d;
    const b = place(l, 0.88, 0.72, l.ld * 0.05), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xb8ae98, 0xc8bca4));
    out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, 0xc8b8a0), ...box(b.w + 0.0008, s.base, b.d + 0.0008, cantera, { x: b.x, z: b.z }));
    out.push(...bands(b, floorLines(l, s), 0.0007, cantera));
    out.push(...box(b.w + 0.0014, 0.0012, b.d + 0.0014, cantera, { x: b.x, y: b.h - 0.001, z: b.z }, 0xc8b8a0));
    // The parapet, pinnacles along its front.
    out.push(ring(b.w, 0.0024, b.d, stone, { x: b.x, y: b.h, z: b.z }));
    const front = b.z + b.d / 2, np = Math.max(3, Math.floor(b.w / 0.009) + 1);
    for (let i = 0; i < np; i++) out.push(cone(0.0008, 0.003, 4, cantera, { x: b.x - b.w / 2 + (i * b.w) / (np - 1), y: b.h + 0.0024, z: front - 0.0004 }));
    // Windows in cantera frames; iron balconies on the upper ones at the front.
    const n = Math.max(2, Math.floor(b.w / 0.01));
    for (let f = 1; f < l.floors; f++) for (const a of bays(b.w, n)) {
      const y = s.base + f * s.storey + s.storey * 0.18;
      out.push(onFace(b, 'front', a, y - 0.0006, 0.0042, s.storey * 0.6 + 0.0012, cantera), onFace(b, 'front', a, y, 0.003, s.storey * 0.6, 0x3a2a24, E * 2));
      out.push(...box(0.005, 0.0006, 0.0022, iron, { x: b.x + a, y, z: front + 0.0011 }), ...box(0.005, 0.0018, 0.0003, iron, { x: b.x + a, y, z: front + 0.0022 }));
    }
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows(b, f, { ...s, w: 0.0028, h: s.storey * 0.45, spacing: 0.011, sill: s.storey * 0.3, color: 0x3a2a24, frame: cantera }));
    // A big doorway into the courtyard, framed in cantera.
    const dh = s.base + s.storey * 0.62;
    out.push(...arch(b, 'front', 0, 0, 0.0085, dh, cantera), ...arch(b, 'front', 0, 0, 0.0062, dh * 0.95, 0x5b3a24, false, E * 2));
    out.push(patch(b.w * 0.36, b.d * 0.36, 0x9a8a70, b.x, b.z, b.h + 0.0004));
    out.push(...tree(-l.lw * 0.6, -l.ld * 0.84, 0.9, 0x8a6ac0));
    return out;
  },

  // Egyptians: striped ablaq stone, wooden mashrabiya bays, crenellations, a small ribbed dome.
  mamluk(l) {
    const stone = pick(l, [0xe7d6b4, 0xdcc8a0, 0xeadcc0]), red = 0xb05a3c, wood = pick(l, [0x7a4e2c, 0x6a4426, 0x845634]), lattice = 0xa8784a;
    const b = place(l, 0.86, 0.68, l.ld * 0.14), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xc8b898, 0xd8c8a8));
    out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, 0xd8c8a6));
    // Ablaq: red and cream courses on the ground floor.
    out.push(...bands(b, [0.002, 0.005, 0.008, 0.011].filter((y) => y < s.base + s.storey - 0.002), 0.0015, red, SEEN));
    // Mashrabiya: screened wooden bays out from the upper floors.
    const two = b.w > 0.05, front = b.z + b.d / 2, bw = Math.min(0.013, b.w * 0.34), bh = s.storey * (l.floors - 1) * 0.78, by = s.base + s.storey * 1.12;
    for (const x of two ? [-b.w * 0.25, b.w * 0.25] : [b.w * 0.15]) {
      const bay: Body = { x: b.x + x, z: front + 0.00175, w: bw, d: 0.0035, y: by, h: bh };
      out.push(...box(bw, bh, 0.0035, wood, { x: bay.x, y: by, z: bay.z }), onFace(bay, 'front', 0, by + 0.0008, bw - 0.0014, bh - 0.0016, lattice));
      out.push(...frustum(bw * 0.6, 0.001, bw, 0.0035, 0.0018, wood, { x: bay.x, y: by - 0.0018, z: bay.z }));
    }
    out.push(...arch(b, 'front', two ? 0 : -b.w * 0.28, 0, 0.0055, s.base + s.storey * 0.55, DOOR, true));
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.32, spacing: 0.012, sill: s.storey * 0.4, color: 0x3a2a24 }));
    out.push(...merlons(b, b.h, 0.0016, 0.006, stone, SEEN));
    const r = Math.min(b.w, b.d) * 0.14, dx = b.x + b.w * 0.28, dz = b.z - b.d * 0.24;
    out.push(cyl(r, r, 0.0025, 8, stone, { x: dx, y: b.h, z: dz }), dome(r, 0xd9c7a3, { x: dx, y: b.h + 0.0025, z: dz, sy: 1.15 }));
    out.push(...palm(-l.lw * 0.7, -l.ld * 0.84, 0.9));
    return out;
  },

  // Persians: a turquoise-tiled iwan portal, a dome behind it, slim minarets.
  safavid(l) {
    const sand = pick(l, [0xd8c39b, 0xcfb88e, 0xe0cca6]), cobalt = 0x1f4e8c, turq = pick(l, [0x2a9db0, 0x2a8fb0, 0x30a8a0]);
    const b = place(l, 0.84, 0.64, l.ld * 0.16), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xc8b490, 0xd8c4a0));
    out.push(...box(b.w, b.h, b.d, sand, { x: b.x, z: b.z }));
    out.push(ring(b.w + 0.0006, 0.002, b.d + 0.0006, turq, { x: b.x, y: b.h - 0.003, z: b.z }), ring(b.w, 0.0014, b.d, sand, { x: b.x, y: b.h, z: b.z }));
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows(b, f, { ...s, w: 0.0024, h: s.storey * 0.36, spacing: 0.011, sill: s.storey * 0.35, color: 0x2a2a2a, frame: cobalt }));
    // The iwan: a tall portal standing above the roof, a pointed arch deep in it.
    const pw = Math.min(b.w * 0.42, 0.02), ph = b.h + 0.006, front = b.z + b.d / 2;
    const pb: Body = { x: b.x, z: front + 0.001, w: pw, d: 0.004, y: 0, h: ph };
    out.push(...box(pw, ph, 0.004, cobalt, { x: pb.x, z: pb.z }), ...arch(pb, 'front', 0, 0, pw * 0.6, ph * 0.6, turq, true), onFace(pb, 'front', 0, 0, pw * 0.3, ph * 0.3, 0x2a2a2a, E * 3));
    for (const sx of [-1, 1]) for (let f = 1; f < l.floors; f++) out.push(...arch(b, 'front', sx * (pw / 2 + (b.w / 2 - pw / 2) / 2), s.base + f * s.storey + s.storey * 0.25, 0.0026, s.storey * 0.35, 0x2a2a2a, true));
    if (b.w > 0.04) for (const sx of [-1, 1]) {
      const x = b.x + sx * (pw / 2 + 0.0014);
      out.push(cyl(0.0011, 0.0009, ph + 0.008, 6, turq, { x, z: pb.z }), dome(0.0013, turq, { x, y: ph + 0.008, z: pb.z }));
    }
    // The dome on a drum behind the portal.
    const r = Math.min(b.w, b.d) * 0.2, dz = b.z - b.d * 0.1;
    out.push(cyl(r, r, 0.004, 10, cobalt, { x: b.x, y: b.h, z: dz }), dome(r * 1.04, turq, { x: b.x, y: b.h + 0.004, z: dz, sy: 1.25 }, 10));
    out.push(...cypress(-l.lw * 0.75, -l.ld * 0.84, 1), ...cypress(l.lw * 0.75, -l.ld * 0.84, 1));
    return out;
  },

  // Chinese: a Hakka earthen ring, one gate, small windows high up, a tiled roof round it, a hall inside.
  tulouRing(l) {
    const earth = pick(l, [0xc9a575, 0xbf9a6a, 0xd2b080]), tile = 0x3f3a36, R = Math.min(l.lw, l.ld) * 0.88, T = R * 0.3, h = l.H * 0.62, out: G[] = [];
    out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb0a890));
    out.push(cyl(R, R, h, 16, earth), cyl(R * 1.006, R * 1.006, h * 0.2, 16, 0xa39a8a));
    out.push(P(new THREE.CylinderGeometry(R - T, R - T, h, 16, 1, true).translate(0, h / 2, 0).scale(-1, 1, 1), shade(earth, 0.92)));
    // The roof round the ring: an outer slope to the eave, an inner one to the courtyard.
    out.push(cyl(R + 0.003, R - T / 2, 0.0055, 16, tile, { y: h }));
    out.push(P(new THREE.CylinderGeometry(R - T / 2, R - T - 0.002, 0.005, 16, 1, true).translate(0, 0.0025, 0).scale(-1, 1, 1), tile, { y: h }));
    // Small windows in the upper floors, all round.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      for (const y of [h * 0.62, h * 0.82]) out.push(P(new THREE.PlaneGeometry(0.0014, 0.002), 0x2e2620, { x: Math.sin(a) * (R + E * 2), y, z: Math.cos(a) * (R + E * 2), ry: a }));
    }
    // The gate, framed in stone.
    out.push(P(new THREE.PlaneGeometry(0.006, 0.008), 0xb8b0a0, { y: 0.004, z: R + E * 2 }), P(new THREE.PlaneGeometry(0.0042, 0.0068), DOOR, { y: 0.0034, z: R + E * 4 }));
    // The courtyard: the ancestral hall in the middle, a well.
    const hw = (R - T) * 0.7, hd = (R - T) * 0.5;
    out.push(patch(2 * (R - T) * 0.95, 2 * (R - T) * 0.95, 0xa89a80, 0, 0, 0.0004));
    out.push(...box(hw, h * 0.28, hd, 0xd8cfba, { z: -hd * 0.3 }), hip(hw * 1.15, hd * 1.2, hd * 0.4, tile, { y: h * 0.28, z: -hd * 0.3 }));
    out.push(cyl(0.0014, 0.0014, 0.0012, 6, 0x8a8478, { z: (R - T) * 0.55 }));
    return out;
  },

  // Japanese: a white plaster storehouse, namako walls, small iron-shuttered windows, a heavy roof.
  kura(l) {
    const plaster = pick(l, [0xf3f1ea, 0xeeebe2, 0xf0ece0]), tile = 0x33373d, namako = 0x4a4f55;
    const b = place(l, 0.72, 0.6, l.ld * 0.14), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xc8c4b8, 0xb8b4a8));
    out.push(...box(b.w, b.h, b.d, plaster, { x: b.x, z: b.z }));
    // Namako: dark tiles set in a white diagonal grid, round the lower walls.
    const nh = Math.min(b.h * 0.3, 0.014), nb: Body = { ...b, w: b.w + 0.0006, d: b.d + 0.0006 };
    out.push(ring(nb.w, nh, nb.d, plaster, { x: b.x, z: b.z }));
    for (const f of SEEN) {
      const fw = faceWidth(nb, f), n = Math.max(2, Math.floor(fw / 0.0045)), rows = Math.max(1, Math.floor(nh / 0.0045));
      for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) out.push(tilted(nb, f, -fw / 2 + (i + 0.5) * (fw / n), (r + 0.5) * (nh / rows), 0.0026, 0.0026, Math.PI / 4, namako, E * 2));
    }
    for (const f of ALL) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.0024, h: s.storey * 0.32, spacing: 0.016, sill: s.storey * 0.35, color: 0x2b2f33, frame: tile }));
    // A heavy door under a small eave.
    const front = b.z + b.d / 2;
    out.push(onFace(b, 'front', 0, 0, 0.0058, 0.009, 0x2b2f33, E * 4), ...box(0.0095, 0.0008, 0.003, tile, { x: b.x, y: 0.0102, z: front + 0.0015 }));
    // The roof: heavy tile, a thick ridge, end ornaments (onigawara).
    const rh = Math.min(b.w, b.d) * 0.32;
    out.push(...gable(b.w + 0.005, b.d + 0.006, rh, tile, { x: b.x, y: b.h, z: b.z }, false, plaster));
    out.push(...box(b.w + 0.0046, 0.0018, 0.0022, tile, { x: b.x, y: b.h + rh - 0.0008, z: b.z }));
    for (const sx of [-1, 1]) out.push(...box(0.0018, 0.003, 0.0026, tile, { x: b.x + sx * (b.w / 2 + 0.0025), y: b.h + rh - 0.0008, z: b.z }));
    out.push(...flatTree(-l.lw * 0.62, -l.ld * 0.78, 1, 0x3f5a35));
    return out;
  },

  // Mongols: white battered walls, a red band, a green-tiled Chinese roof, white stupas.
  monastic(l) {
    const white = pick(l, [0xf2efe6, 0xece6d8, 0xf4f0e8]), red = 0x8c2f2a, green = pick(l, [0x3d6b4e, 0x356049, 0x4a7a52]), gold = 0xd2a53a;
    const b = place(l, 0.6, 0.52, l.ld * 0.26), s = storeys(l, 0.1), out: G[] = [];
    out.push(...yard(l, b, 0xc8bea8, 0xd8ccb4));
    out.push(...frustum(b.w + 0.004, b.d + 0.004, b.w, b.d, b.h, white, { x: b.x, z: b.z }, white));
    out.push(ring(b.w + 0.0005, b.h * 0.12, b.d + 0.0005, red, { x: b.x, y: b.h * 0.88, z: b.z }));
    out.push(...windows({ ...b, w: b.w + 0.002, d: b.d + 0.002 }, 'front', { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.003, h: s.storey * 0.36, spacing: 0.01, sill: s.storey * 0.3, color: 0x2a2420, frame: 0x161412 }));
    out.push(onFace({ ...b, d: b.d + 0.004 }, 'front', 0, 0, 0.0055, Math.min(0.01, s.storey * 0.75), red));
    // A hipped roof in green tile with flared eaves, a gilded finial.
    const rh = Math.min(b.w, b.d) * 0.26;
    out.push(...frustum(b.w * 1.26, b.d * 1.32, b.w * 0.96, b.d * 0.96, 0.002, green, { x: b.x, y: b.h, z: b.z }));
    out.push(hip(b.w * 0.96, b.d * 0.96, rh, green, { x: b.x, y: b.h + 0.002, z: b.z }));
    out.push(cone(0.0008, 0.004, 6, gold, { x: b.x, y: b.h + 0.002 + rh - 0.0005, z: b.z }));
    // White stupas at the front corners of the enclosure.
    for (const sx of [-1, 1]) {
      const o = { x: sx * l.lw * 0.72, z: l.ld * 0.7 };
      out.push(...box(0.005, 0.002, 0.005, white, o), ...box(0.0038, 0.0016, 0.0038, white, { ...o, y: 0.002 }), dome(0.0022, white, { ...o, y: 0.0036 }), cone(0.0007, 0.004, 6, gold, { ...o, y: 0.0056 }));
    }
    out.push(...fence(l, 0.004, white, 0.01));
    return out;
  },

  // Ethiopians: a Gondar castle: rough stone, crenellations, round domed corner towers.
  gondarine(l) {
    const stone = pick(l, [0x8a7154, 0x7f684d, 0x947a5c]), dark = 0x2e2620;
    const b = place(l, 0.7, 0.6, l.ld * 0.16), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xb8a070, 0xa89060));
    out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }), ...merlons(b, b.h, 0.0018, 0.0065, stone, SEEN));
    const rT = Math.max(0.0035, Math.min(b.w, b.d) * 0.16), th = b.h + 0.006;
    const corners: readonly (readonly [number, number])[] = b.w > 0.045 ? [[-1, 1], [1, 1], [-1, -1], [1, -1]] : [[-1, 1], [1, 1]];
    for (const [x, z] of corners) {
      const o = { x: b.x + x * b.w / 2, z: b.z + z * b.d / 2 };
      out.push(cyl(rT, rT, th, 7, stone, o), dome(rT * 1.05, stone, { ...o, y: th, sy: 1.1 }, 7));
    }
    for (let f = 1; f < l.floors; f++) for (const a of bays(b.w - 2 * rT, Math.max(2, Math.floor((b.w - 2 * rT) / 0.008)))) out.push(...arch(b, 'front', a, s.base + f * s.storey + s.storey * 0.25, 0.0026, s.storey * 0.35, dark));
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows(b, f, { ...s, w: 0.0024, h: s.storey * 0.32, spacing: 0.012, sill: s.storey * 0.35, color: dark }));
    out.push(...arch(b, 'front', 0, 0, 0.006, s.base + s.storey * 0.6, dark));
    out.push(...fence(l, 0.003, stone, 0.01), ...flatTree(-l.lw * 0.66, -l.ld * 0.76, 1, 0x6a8a3a));
    return out;
  },

  // Indians: pink sandstone outlined in white, jharokha balconies, chhatris on the roof.
  haveli(l) {
    const pink = pick(l, [0xe2967a, 0xd88a70, 0xe8a488]), white = 0xf6eadf, screen = 0xb45a44, bay = shade(pink, 1.06);
    const b = place(l, 0.86, 0.68, l.ld * 0.14), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xd0b890, 0xc0a888));
    out.push(...box(b.w, b.h, b.d, pink, { x: b.x, z: b.z }));
    out.push(...bands(b, floorLines(l, s), 0.0007, white), ...box(b.w + 0.0014, 0.0012, b.d + 0.0014, white, { x: b.x, y: b.h - 0.001, z: b.z }, shade(pink, 0.85)));
    out.push(ring(b.w, 0.002, b.d, pink, { x: b.x, y: b.h, z: b.z }));
    // Jharokhas: balconies with stone screens and domed hoods, on the upper floors.
    const front = b.z + b.d / 2, n = b.w > 0.05 ? 3 : 2, jw = 0.0065, jd = 0.0028;
    for (let f = 1; f < l.floors; f++) for (const a of bays(b.w, n)) {
      const jh = s.storey * 0.6, y = s.base + f * s.storey + s.storey * 0.15, jb: Body = { x: b.x + a, z: front + jd / 2, w: jw, d: jd, y, h: jh };
      out.push(...box(jw, jh, jd, bay, { x: jb.x, y, z: jb.z }), onFace(jb, 'front', 0, y + jh * 0.12, jw * 0.8, jh * 0.7, screen), dome(jw * 0.55, bay, { x: jb.x, y: y + jh, z: jb.z, sz: 0.6 }, 6));
    }
    // Chhatris: domed kiosks on the front corners of the roof.
    for (const sx of [-1, 1]) {
      const cx = b.x + sx * (b.w / 2 - 0.004), cz = front - 0.004, py = b.h + 0.002;
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.0003, 0.0003, 0.004, 3, white, { x: cx + x * 0.0022, y: py, z: cz + z * 0.0022 }));
      out.push(...box(0.0058, 0.0006, 0.0058, white, { x: cx, y: py + 0.004, z: cz }), dome(0.0027, white, { x: cx, y: py + 0.0046, z: cz }, 6));
    }
    out.push(...arch(b, 'front', 0, 0, 0.0055, s.base + s.storey * 0.55, 0x7b3f24));
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows(b, f, { ...s, w: 0.0024, h: s.storey * 0.36, spacing: 0.012, sill: s.storey * 0.32, color: 0x3a2a24, frame: white }));
    return out;
  },

  // English: a brick terrace, sash windows, doors under fanlights, a parapet, chimney stacks.
  georgian(l) {
    const brick = pick(l, [0x9c4f36, 0x8a4a34, 0xa85c40]), white = 0xf1ece2, door = pick(l, [0x1d2a24, 0x1a1a2a, 0x5a1a1a]), slate = 0x5c6168;
    const b = place(l, 0.94, 0.68, l.ld * 0.14), s = storeys(l, 0.1), out: G[] = [];
    out.push(...yard(l, b, 0x7d9a55, 0xa8a094));
    out.push(patch(2 * l.lw * 0.94, l.ld * 0.24, 0xa8a094, 0, l.ld * 0.86, 0.0004));
    out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
    out.push(...box(b.w + 0.0016, 0.001, b.d + 0.0016, white, { x: b.x, y: b.h - 0.0008, z: b.z }), ring(b.w, 0.0026, b.d, brick, { x: b.x, y: b.h, z: b.z }));
    out.push(hip(b.w * 0.9, b.d * 0.9, Math.min(b.w, b.d) * 0.2, slate, { x: b.x, y: b.h, z: b.z }));
    // Sash windows on the upper floors, front and back (the sides are party walls).
    for (const f of ['front', 'back'] as const) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.0028, h: s.storey * 0.55, spacing: 0.0078, sill: s.storey * 0.22, color: 0x2a3038, frame: white }));
    // A house per bay: a door under a fanlight, a window beside it, a chimney stack on the party wall.
    const nH = Math.max(1, Math.round(b.w / 0.016)), hw = b.w / nH;
    for (let k = 0; k < nH; k++) {
      const a = -b.w / 2 + (k + 0.5) * hw;
      out.push(...arch(b, 'front', a - hw * 0.22, s.base, 0.0042, 0.0082, white), onFace(b, 'front', a - hw * 0.22, s.base, 0.0034, 0.0075, door, E * 2));
      out.push(onFace(b, 'front', a + hw * 0.2, s.base + s.storey * 0.25, 0.0036, s.storey * 0.5, white), onFace(b, 'front', a + hw * 0.2, s.base + s.storey * 0.28, 0.0028, s.storey * 0.44, 0x2a3038, E * 2));
    }
    for (let k = 0; k <= nH; k++) {
      const x = Math.max(-b.w / 2 + 0.0015, Math.min(b.w / 2 - 0.0015, -b.w / 2 + k * hw));
      out.push(...box(0.003, 0.005, 0.006, brick, { x: b.x + x, y: b.h, z: b.z }), cyl(0.0005, 0.0005, 0.0016, 4, 0xc4703f, { x: b.x + x, y: b.h + 0.005, z: b.z - 0.0012 }), cyl(0.0005, 0.0005, 0.0016, 4, 0xc4703f, { x: b.x + x, y: b.h + 0.005, z: b.z + 0.0012 }));
    }
    out.push(...box(b.w, 0.0025, 0.0004, 0x1a1a1a, { x: b.x, z: b.z + b.d / 2 + 0.004 }));
    out.push(...tree(l.lw * 0.5, -l.ld * 0.84, 0.8, 0x4f6e38));
    return out;
  },

  // French: pink brick and white stone, an arcade on the street, a steep slate roof, tall dormers.
  vosges(l) {
    const brick = pick(l, [0xc46b52, 0xb8604a, 0xcc7a5e]), stone = 0xefe9dc, slate = 0x3f4954;
    const b = place(l, 0.88, 0.68, l.ld * 0.06), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xc0b8a8, 0xd0c8b8));
    out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
    const g0 = s.base + s.storey, ab: Body = { ...b, w: b.w + 0.0008, d: b.d + 0.0008, h: g0 };
    out.push(...box(ab.w, g0, ab.d, stone, { x: b.x, z: b.z }));
    const n = Math.max(2, Math.floor(b.w / 0.011)), bay = b.w / n;
    for (const a of bays(b.w, n)) out.push(...arch(ab, 'front', a, 0, bay * 0.62, g0 * 0.62, 0x3a3530));
    // White stone chains between the bays; window surrounds.
    for (let k = 0; k <= n; k++) out.push(onFace(b, 'front', -b.w / 2 + k * bay, g0, k === 0 || k === n ? 0.0024 : 0.0016, b.h - g0, stone));
    for (let f = 1; f < l.floors; f++) for (const a of bays(b.w, n)) {
      const y = s.base + f * s.storey + s.storey * 0.2;
      out.push(onFace(b, 'front', a, y - 0.0006, 0.0042, s.storey * 0.6 + 0.0012, stone), onFace(b, 'front', a, y, 0.003, s.storey * 0.6, 0x2a3038, E * 2));
    }
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: g0, w: 0.0028, h: s.storey * 0.5, spacing: 0.011, sill: s.storey * 0.25, color: 0x2a3038, frame: stone }));
    // The steep slate roof, tall dormers, brick chimneys.
    const rh = Math.min(b.w, b.d) * 0.55;
    out.push(hip(b.w + 0.002, b.d + 0.002, rh, slate, { x: b.x, y: b.h, z: b.z }));
    const zd = b.z + b.d * 0.3, yd = b.h + rh * 0.4 - 0.001;
    for (const a of bays(b.w * 0.8, Math.max(1, n - 1))) {
      const db: Body = { x: b.x + a, z: zd - 0.0018, w: 0.004, d: 0.0036, y: yd, h: 0.0055 };
      out.push(...box(db.w, db.h, db.d, stone, { x: db.x, y: yd, z: db.z }), onFace(db, 'front', 0, yd + 0.001, 0.0024, 0.0036, 0x2a3038));
      out.push(...gable(0.005, 0.0046, 0.0026, slate, { x: db.x, y: yd + db.h, z: db.z }, true, stone));
    }
    for (const sx of [-1, 1]) out.push(...box(0.0035, rh + 0.006, 0.0025, brick, { x: b.x + sx * b.w * 0.32, y: b.h, z: b.z - b.d * 0.12 }));
    return out;
  },

  // Vikings: a row of painted timber wharf houses, gable to the street, loading hatches.
  bryggen(l) {
    const colors = [0xa5352c, 0xd9a441, 0xefe8da, 0x8e2f28, 0xc96a3a], roof = pick(l, [0x5a4a3e, 0x4a4a4e, 0x6a4a3a]);
    const b = place(l, 0.92, 0.7, l.ld * 0.2), s = storeys(l, 0.08), out: G[] = [];
    out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a6e50));
    const n = Math.max(2, Math.min(5, Math.round(b.w / 0.016))), uw = b.w / n;
    for (let i = 0; i < n; i++) {
      const col = colors[(i + l.v * 2) % colors.length]!, h = b.h * (0.92 + 0.08 * ((i + l.v) % 2));
      const u: Body = { x: b.x - b.w / 2 + uw * (i + 0.5), z: b.z, w: uw - 0.0004, d: b.d, y: 0, h };
      out.push(...box(u.w, h, u.d, col, { x: u.x, z: u.z }), ...strips(u, 'front', 0, h, 0.0004, 0.003, shade(col, 0.8)));
      const rh = uw * 0.9;
      out.push(...gable(u.w + 0.0016, u.d + 0.003, rh, roof, { x: u.x, y: h, z: u.z }, true, col));
      out.push(onFace(u, 'front', 0, h + rh * 0.12, uw * 0.3, rh * 0.4, 0x3b2a20, 0.0017), ...box(0.0008, 0.0008, 0.003, 0x3b2a20, { x: u.x, y: h + rh * 0.6, z: u.z + u.d / 2 + 0.003 }));
      out.push(...windows(u, 'front', { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.0024, h: s.storey * 0.4, spacing: 0.006, sill: s.storey * 0.3, color: 0x2a2420 }));
      out.push(onFace(u, 'front', 0, 0, 0.004, Math.min(0.009, s.storey * 0.75), 0x3b2a20, E * 2));
    }
    return out;
  },

  // Russians: a tall tented roof on a raised tower, kokoshnik arches, a gilded onion dome, carved trim.
  terem(l) {
    const wall = pick(l, [0xc9a679, 0xe6dcc8, 0xd2b48a]), green = pick(l, [0x3f7d5a, 0x3a6a8a, 0x4a7a4a]), red = 0xb0352b, white = 0xf2ede1, gold = 0xd2a53a;
    const b = place(l, 0.78, 0.56, l.ld * 0.34), s = storeys(l, 0.1), out: G[] = [];
    out.push(...yard(l, b, 0x7d9a55, 0xa89a80));
    out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }), ...bands(b, floorLines(l, s), 0.0008, white));
    for (const f of ALL) out.push(...windows(b, f, { ...s, w: 0.0028, h: s.storey * 0.4, spacing: 0.01, sill: s.storey * 0.3, color: 0x2a3038, frame: red, shutter: f === 'front' ? white : undefined, door: true }));
    // Low hipped roofs; over the middle a raised block under a tall tented roof.
    const m = Math.min(b.w, b.d), rh = m * 0.25;
    out.push(hip(b.w + 0.003, b.d + 0.003, rh, green, { x: b.x, y: b.h, z: b.z }));
    const tw = m * 0.5, ty = b.h + rh * 0.6, tt = ty + s.storey * 0.6, tb: Body = { x: b.x, z: b.z, w: tw, d: tw, y: ty, h: tt - ty };
    out.push(...box(tw, tt - ty, tw, wall, { x: b.x, y: ty, z: b.z }));
    for (const a of [-tw * 0.25, tw * 0.25]) out.push(...arch(tb, 'front', a, tt - 0.0012, tw * 0.42, 0.0006, white));
    out.push(spire(tw * 1.05, tw * 1.8, green, { x: b.x, y: tt, z: b.z }), ...onion(0.0016, gold, { x: b.x, y: tt + tw * 1.8 - 0.0008, z: b.z }));
    // A porch (kryltso) under its own little tent.
    const front = b.z + b.d / 2, pb: Body = { x: b.x, z: front + 0.003, w: 0.008, d: 0.006, y: 0, h: s.storey * 0.8 };
    out.push(...box(pb.w, pb.h, pb.d, wall, { x: pb.x, z: pb.z }), spire(0.0092, 0.006, green, { x: pb.x, y: pb.h, z: pb.z }), onFace(pb, 'front', 0, 0, 0.0042, pb.h * 0.8, red));
    out.push(...birch(-l.lw * 0.7, -l.ld * 0.78, 1), ...birch(l.lw * 0.72, -l.ld * 0.7, 0.85));
    return out;
  },
} satisfies Record<string, Build>;
