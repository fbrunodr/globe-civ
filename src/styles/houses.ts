// Houses (singles and doubles) in the civs' own styles (architecture.ts):
// the lot models of houses.ts, one per style, built to the lot's footprint
// and height, in three variants.

import * as THREE from 'three';
import { cone, cyl } from '../propCatalog.ts';
import { FOOTPRINT_CELLS } from '../town/geometry.ts';
import {
  E, P, arch, bands, birch, box, disc, dome, drum, fence, frustum, gable, hip, merlons, shade, onFace, palm, patch, pick, place, ring,
  shrub, steps, storeys, faceWidth, strips, tilted, tree, windows, yard, SEEN, type Body, type Build, type Face, type G,
} from '../houseKit.ts';

const DOOR = 0x3a2a20;

export const HOUSE_STYLES = {
  // Greeks: whitewashed cubes, blue doors and shutters, a blue dome, bougainvillea.
  cycladic(l) {
    const white = pick(l, [0xf6f4ee, 0xf2efe6, 0xf8f6f0]), blue = pick(l, [0x2f6fb5, 0x3a86c4, 0x2a5f9a]);
    const b = place(l, 0.56, 0.5, l.ld * 0.3), out: G[] = [];
    out.push(...yard(l, b, 0xe6e1d4, 0xf2efe6));
    out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }), ring(b.w, 0.0014, b.d, white, { x: b.x, y: b.h, z: b.z }));
    // A lower cube beside it, its roof a terrace.
    const aw = l.lw * 0.38, a: Body = { x: b.x + b.w / 2 + aw / 2, z: b.z + b.d * 0.15, w: aw, d: b.d * 0.7, y: 0, h: b.h * (l.floors > 1 ? 0.5 : 0.7) };
    out.push(...box(a.w, a.h, a.d, white, { x: a.x, z: a.z }), ring(a.w, 0.0012, a.d, white, { x: a.x, y: a.h, z: a.z }));
    const s = storeys(l, 0.1);
    for (const f of ['front', 'left', 'back'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.36, spacing: 0.012, sill: s.storey * 0.32, color: blue, door: true }));
    out.push(onFace(b, 'front', 0, 0, 0.0048, Math.min(0.009, s.storey * 0.72), blue), onFace(a, 'front', 0, 0, 0.004, Math.min(0.008, a.h * 0.7), blue));
    // A chapel's blue dome on a drum.
    if (l.v !== 1 || b.w > 0.04) {
      const r = Math.min(b.w, b.d) * 0.2, x = b.x - b.w * 0.2, z = b.z - b.d * 0.15;
      out.push(cyl(r, r, 0.002, 8, white, { x, y: b.h, z }), dome(r * 1.04, blue, { x, y: b.h + 0.002, z }), cyl(0.0002, 0.0002, 0.0025, 3, white, { x, y: b.h + 0.002 + r, z }));
    }
    out.push(shrub(-l.lw * 0.72, l.ld * 0.72, 0.0034, 0xc2398a), shrub(-l.lw * 0.6, l.ld * 0.8, 0.0024, 0xd14a9a), ...fence(l, 0.0022, white, 0.008));
    return out;
  },

  // Spanish: white walls on an ochre socle, iron grilles and flowerpots, a patio behind a gate.
  andalusian(l) {
    const white = pick(l, [0xf6f3ec, 0xf0ebe0, 0xf8f5ee]), roof = pick(l, [0xb85a35, 0xa8502e, 0xc06a42]), socle = pick(l, [0xd8a73a, 0xc8963a, 0x3a6aa0]);
    // The house at the back of the lot; a tiled patio before it, walled to the street.
    const b = place(l, 0.8, 0.46, l.ld * 0.46), out: G[] = [];
    out.push(...yard(l, b, 0xd8c8a8, 0xc8b490));
    out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }), ...box(b.w + 0.0008, 0.003, b.d + 0.0008, socle, { x: b.x, z: b.z }));
    out.push(...gable(b.w + 0.003, b.d + 0.004, Math.min(b.w, b.d) * 0.3, roof, { x: b.x, y: b.h, z: b.z }, false, white));
    const s = storeys(l, 0.15);
    // Windows behind black iron grilles (rejas).
    for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.003, h: s.storey * 0.45, spacing: 0.011, sill: s.storey * 0.3, color: 0x3a3430, frame: 0x161412, door: true }));
    out.push(onFace(b, 'front', 0, 0, 0.005, Math.min(0.009, s.storey * 0.72), 0x6b4a2e));
    // Flowerpots hung along the front.
    const n = Math.max(2, Math.floor(b.w / 0.008)), py = Math.min(b.h - 0.003, s.base + s.storey * 0.85), front = b.z + b.d / 2;
    for (let i = 0; i < n; i++) {
      const x = b.x + (i - (n - 1) / 2) * (b.w / n) + b.w / n / 2;
      out.push(...box(0.0011, 0.0011, 0.0011, 0xb4532c, { x, y: py, z: front + 0.0006 }), P(new THREE.OctahedronGeometry(0.0009, 0), i % 2 ? 0xd43b3b : 0x4f8a3a, { x, y: py + 0.0016, z: front + 0.0006 }));
    }
    // The patio: a terracotta floor, a fountain, an orange tree; a gate in the street wall.
    const pd = l.ld - front, pz = front + pd / 2;
    out.push(patch(2 * l.lw * 0.9, pd * 0.9, 0xc89070, 0, pz, 0.0004));
    out.push(...drum(0.0026, 0.0026, 0.0012, 8, 0xd8d0c0, { x: -l.lw * 0.25, z: pz }, 0x5a9ac0), ...tree(l.lw * 0.5, pz, 0.8, 0x3f6e30));
    out.push(...fence(l, 0.0055, white, 0.009), ...box(0.009, 0.005, 0.0006, 0x6b4a2e, { z: l.ld * 0.96 }));
    return out;
  },

  // Babylonians: mudbrick with stepped crenellations and a band of blue glazed brick.
  mesopotamian(l) {
    const mud = pick(l, [0xc8a06a, 0xd2ad78, 0xbf9862]), glaze = pick(l, [0x2c5aa0, 0x2a6ab0, 0x24508c]), gold = 0xe0b84a;
    const b = place(l, 0.7, 0.62, l.ld * 0.16), out: G[] = [];
    out.push(...yard(l, b, 0xcdb48a, 0xb8a07a));
    out.push(...box(b.w, b.h, b.d, mud, { x: b.x, z: b.z }));
    // The glazed band, yellow rosettes on it along the front.
    const by = b.h * 0.6, bh = Math.min(0.003, b.h * 0.14);
    out.push(ring(b.w + 0.0008, bh, b.d + 0.0008, glaze, { x: b.x, y: by, z: b.z }));
    const n = Math.max(2, Math.min(6, Math.floor(b.w / 0.006)));
    for (let i = 0; i < n; i++) out.push(disc(b, 'front', (i - (n - 1) / 2) * (b.w / n), by + bh / 2, 0.0007, gold, 0.0007));
    out.push(...merlons(b, b.h, 0.0016, 0.0055, mud));
    if (l.floors > 1) out.push(...box(b.w * 0.4, 0.006, b.d * 0.45, mud, { x: b.x + b.w * 0.26, y: b.h, z: b.z - b.d * 0.22 }));
    const s = storeys(l, 0.1);
    for (const f of SEEN) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.2, spacing: 0.012, sill: s.storey * 0.62, color: 0x2e2620, door: true }));
    // A gate framed in glaze.
    const dh = Math.min(0.0095, s.storey * 0.7);
    out.push(onFace(b, 'front', 0, 0, 0.0072, dh + 0.0012, glaze), onFace(b, 'front', 0, 0, 0.005, dh, DOOR, E * 2));
    out.push(...fence(l, 0.0042, mud, 0.009), ...palm(-l.lw * 0.68, -l.ld * 0.7, 1));
    return out;
  },

  // Persians: adobe under low mud domes, a tall windcatcher, a pool in the yard.
  windcatcher(l) {
    const adobe = pick(l, [0xd8bb8c, 0xcfb084, 0xdcc39a]), tower = pick(l, [0xccab7a, 0xc4a272, 0xd0b286]);
    const b = place(l, 0.64, 0.56, l.ld * 0.22), out: G[] = [];
    out.push(...yard(l, b, 0xd2bc94, 0xc4aa80));
    out.push(...frustum(b.w + 0.0016, b.d + 0.0016, b.w, b.d, b.h, adobe, { x: b.x, z: b.z }, adobe));
    const r = Math.min(b.w, b.d) * 0.22;
    out.push(dome(r, adobe, { x: b.x - b.w * 0.2, y: b.h, z: b.z + b.d * 0.1, sy: 0.65 }));
    if (b.w > 0.035) out.push(dome(r * 0.75, adobe, { x: b.x + b.w * 0.12, y: b.h, z: b.z + b.d * 0.18, sy: 0.65 }));
    // The windcatcher (badgir): a square tower at the back corner, slotted near its top.
    const tw = Math.max(0.0055, Math.min(b.w, b.d) * 0.22), th = b.h + 0.011 + l.floors * 0.002;
    const t: Body = { x: b.x + b.w / 2 - tw / 2 - 0.001, z: b.z - b.d / 2 + tw / 2 + 0.001, w: tw, d: tw, y: 0, h: th };
    out.push(...box(tw, th, tw, tower, { x: t.x, z: t.z }), ...box(tw + 0.0012, 0.0012, tw + 0.0012, adobe, { x: t.x, y: th, z: t.z }));
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) for (const k of [-1, 0, 1]) out.push(onFace(t, f, k * tw * 0.3, th - 0.0068, tw * 0.17, 0.0058, 0x2e2620));
    const s = storeys(l, 0.1);
    for (const f of SEEN) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.25, spacing: 0.013, sill: s.storey * 0.55, color: 0x2e2620, door: true }));
    out.push(...arch(b, 'front', 0, 0, 0.0045, Math.min(0.0068, s.storey * 0.5), DOOR, true));
    // A pool and a pomegranate in the walled yard.
    out.push(patch(l.lw * 0.55, l.ld * 0.14, 0x4a8ab0, -l.lw * 0.42, l.ld * 0.84, 0.0007), ...tree(l.lw * 0.62, l.ld * 0.8, 0.7, 0x5a7a3a));
    out.push(...fence(l, 0.0045, adobe, 0.009));
    return out;
  },

  // Hebrews: pale limestone, flat roofs to sleep on, arched triple windows;
  // taller (triples): an Ottoman-era stone house under a red tile roof.
  levantine(l) {
    const stone = pick(l, [0xe7dab8, 0xddd0ac, 0xeee2c4]), course = 0xd2c4a0, glass = 0x3a3530;
    const out: G[] = [];
    if (l.floors > 2) {
      const b = place(l, 0.82, 0.68, l.ld * 0.08), s = storeys(l, 0.08);
      out.push(...yard(l, b, 0xd8cdb0, 0xccc0a0));
      out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }));
      out.push(...bands(b, Array.from({ length: l.floors - 1 }, (_, f) => s.base + (f + 1) * s.storey), 0.0008, course));
      // Each upper floor: a triple arched window over the middle (the hall), single ones at the sides.
      for (let f = 1; f < l.floors; f++) {
        const y = s.base + f * s.storey + s.storey * 0.22, h = s.storey * 0.42;
        for (const k of [-1, 0, 1]) out.push(...arch(b, 'front', k * 0.0042, y, 0.0032, k ? h * 0.85 : h, glass));
        for (const sx of [-1, 1]) out.push(...arch(b, 'front', sx * b.w * 0.36, y, 0.0028, h * 0.85, glass));
      }
      out.push(...box(0.016, 0.0007, 0.003, 0x3a3530, { x: b.x, y: s.base + s.storey * 2, z: b.z + b.d / 2 + 0.0015 })); // an iron balcony
      for (const f of ['left', 'right', 'back'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.4, spacing: 0.011, sill: s.storey * 0.3, color: glass }));
      out.push(...arch(b, 'front', 0, 0, 0.0055, Math.min(0.009, s.storey * 0.62), 0x5a4632));
      out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.28, 0xb5583a, { x: b.x, y: b.h, z: b.z }));
      out.push(...tree(l.lw * 0.6, -l.ld * 0.82, 0.9, 0x7d8b4f));
      return out;
    }
    const b = place(l, 0.66, 0.56, l.ld * 0.2), s = storeys(l, 0.1);
    out.push(...yard(l, b, 0xd8cdb0, 0xccc0a0));
    out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, course));
    out.push(...bands(b, steps(0.0035, b.h, 0.0035), 0.0003, course, SEEN));
    // The roof to sleep on in summer: an iron railing, a water tank, a room on the larger houses.
    out.push(ring(b.w - 0.0004, 0.0022, b.d - 0.0004, 0x5a5048, { x: b.x, y: b.h, z: b.z }));
    out.push(...drum(0.0018, 0.0018, 0.0028, 7, 0x3a3a3a, { x: b.x + b.w * 0.3, y: b.h, z: b.z - b.d * 0.28 }));
    if (l.floors > 1) out.push(...box(b.w * 0.36, 0.006, b.d * 0.4, stone, { x: b.x - b.w * 0.24, y: b.h, z: b.z - b.d * 0.22 }, course));
    const wy = s.base + (l.floors - 1) * s.storey + s.storey * 0.25, wh = s.storey * 0.42;
    for (const k of [-1, 0, 1]) out.push(...arch(b, 'front', b.w * 0.12 + k * 0.004, wy, 0.003, k ? wh * 0.85 : wh, glass));
    for (const f of ['left', 'right', 'back'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0024, h: s.storey * 0.36, spacing: 0.012, sill: s.storey * 0.32, color: glass }));
    out.push(...arch(b, 'front', -b.w * 0.3, 0, 0.0045, Math.min(0.0075, s.storey * 0.55), 0x5a4632));
    out.push(...fence(l, 0.003, stone, 0.008), ...tree(l.lw * 0.66, -l.ld * 0.66, 1, 0x7d8b4f), ...tree(-l.lw * 0.7, l.ld * 0.72, 0.7, 0x7d8b4f));
    return out;
  },

  // Japanese: a narrow wooden townhouse, a lattice front, tiled eaves, a garden behind.
  machiya(l) {
    const wood = pick(l, [0x5b3a24, 0x4e3220, 0x664530]), tile = pick(l, [0x3c4148, 0x44484e, 0x363a40]), plaster = 0xede6d6;
    const b = place(l, 0.86, 0.64, l.ld * 0.12), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xb8b0a0, 0xa8a090));
    const g0 = l.floors > 1 ? s.base + s.storey : b.h, lo: Body = { ...b, h: g0 };
    out.push(...box(b.w, g0, b.d, wood, { x: b.x, z: b.z }));
    // The lattice (koshi) over the shop front, a noren at the door.
    out.push(...strips(lo, 'front', 0.0005, g0 * 0.8, 0.0006, 0.0018, 0x9a6a42));
    out.push(onFace(lo, 'front', b.w * 0.26, g0 * 0.42, 0.0062, g0 * 0.4, 0x2d4a7a, E * 2));
    if (l.floors > 1) {
      const up: Body = { ...b, y: g0, h: b.h - g0 };
      out.push(...box(b.w, up.h, b.d, plaster, { x: b.x, y: g0, z: b.z }));
      for (const k of [-1, 0, 1]) out.push(onFace(up, 'front', k * b.w * 0.3, g0 + up.h * 0.35, b.w * 0.18, up.h * 0.32, wood));
      out.push(...frustum(b.w + 0.003, b.d + 0.006, b.w, b.d, 0.0018, tile, { x: b.x, y: g0 - 0.0005, z: b.z }));
    }
    const rh = Math.min(b.w, b.d) * 0.26;
    out.push(...gable(b.w + 0.004, b.d + 0.005, rh, tile, { x: b.x, y: b.h, z: b.z }, false, l.floors > 1 ? plaster : wood));
    out.push(...box(b.w + 0.004, 0.0012, 0.0016, shadeTile(tile), { x: b.x, y: b.h + rh - 0.0006, z: b.z }));
    // The garden behind: raked gravel, a stone lantern, a maple.
    out.push(patch(2 * l.lw * 0.9, l.ld * 0.5, 0xd8d4c8, 0, -l.ld * 0.72, 0.0005));
    out.push(...box(0.0012, 0.003, 0.0012, 0x9a9488, { x: -l.lw * 0.6, z: -l.ld * 0.7 }), ...box(0.0028, 0.0008, 0.0028, 0x8a847a, { x: -l.lw * 0.6, y: 0.003, z: -l.ld * 0.7 }));
    out.push(...tree(l.lw * 0.55, -l.ld * 0.78, 0.8, pick(l, [0xb0402a, 0x4f6e38, 0xc0603a])));
    return out;
  },

  // Russians: a log cabin under a steep board roof, carved and painted window frames, a birch.
  izba(l) {
    const log = pick(l, [0x9b7653, 0x8a6848, 0xa8835e]), roof = pick(l, [0x6e6a62, 0x7a7468, 0x5f5b54]), paint = pick(l, [0x2f6fb5, 0x3a8a5a, 0x2f6fb5]), white = 0xf1efe6;
    const b = place(l, 0.6, 0.56, l.ld * 0.24), s = storeys(l, 0.12), out: G[] = [];
    out.push(...yard(l, b, 0x7d9a55, 0x9a8a6a));
    out.push(...box(b.w, b.h, b.d, log, { x: b.x, z: b.z }));
    // Log courses, the log ends crossing at the corners.
    out.push(...bands(b, steps(0.0022, b.h, 0.0022), 0.0004, shadeWood(log), SEEN));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0018, b.h, 0.0018, shadeWood(log), { x: b.x + x * b.w / 2, z: b.z + z * b.d / 2 }));
    // A steep board roof, its gable to the street, a small window in the gable.
    const rh = Math.min(b.w, b.d) * 0.62;
    out.push(...gable(b.w + 0.004, b.d + 0.004, rh, roof, { x: b.x, y: b.h, z: b.z }, true, log));
    out.push(onFace(b, 'front', 0, b.h + rh * 0.22, 0.0028, 0.003, white, 0.0022), onFace(b, 'front', 0, b.h + rh * 0.22 + 0.0005, 0.0018, 0.002, 0x2a3038, 0.0024));
    // Windows in white carved frames (nalichniki) with painted shutters.
    out.push(...windows(b, 'front', { ...s, w: 0.003, h: s.storey * 0.36, spacing: 0.009, sill: s.storey * 0.32, color: 0x2a3038, frame: white, shutter: paint }));
    for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.32, spacing: 0.012, sill: s.storey * 0.34, color: 0x2a3038, frame: white }));
    out.push(onFace(b, 'right', b.d * 0.25, 0, 0.0042, Math.min(0.0085, s.storey * 0.7), 0x5a4030));
    out.push(...fence(l, 0.0035, 0x8a8070, 0.008), ...birch(-l.lw * 0.66, -l.ld * 0.66, 1), ...birch(-l.lw * 0.76, -l.ld * 0.4, 0.8));
    out.push(...box(0.008, 0.003, 0.003, 0x8a6a48, { x: l.lw * 0.58, z: -l.ld * 0.74 }));
    return out;
  },

  // Vikings: a timber hall under a turf roof, dragon heads on the gables, a boat drawn up.
  longhouse(l) {
    const wood = pick(l, [0x7b5a3c, 0x6e5034, 0x86643f]), turf = pick(l, [0x6f8f3e, 0x7a9a48, 0x66853a]);
    const [cw, cd] = FOOTPRINT_CELLS[l.fp], alongZ = cd > cw;
    const b = place(l, alongZ ? 0.5 : 0.8, alongZ ? 0.72 : 0.5, l.ld * (alongZ ? 0.12 : 0.24)), out: G[] = [];
    out.push(...yard(l, b, 0x7d9a55, 0x8a7a5a));
    // Low plank walls, a high roof.
    const wh = b.h * 0.5;
    out.push(...box(b.w, wh, b.d, wood, { x: b.x, z: b.z }));
    out.push(...strips({ ...b, h: wh }, 'front', 0, wh, 0.0004, 0.003, shadeWood(wood)));
    const rh = Math.min(b.w, b.d) * 0.55 + (l.floors > 1 ? 0.006 : 0), ry = wh + rh;
    out.push(...gable(b.w + 0.006, b.d + 0.006, rh, turf, { x: b.x, y: wh, z: b.z }, alongZ, wood));
    out.push(...(alongZ ? box(0.003, 0.0016, b.d + 0.004, shadeTurf(turf), { x: b.x, y: ry - 0.001, z: b.z }) : box(b.w + 0.004, 0.0016, 0.003, shadeTurf(turf), { x: b.x, y: ry - 0.001, z: b.z })));
    // Dragon heads: the crossed bargeboards curl up at both gable ends.
    for (const e of [-1, 1]) {
      const [x, z] = alongZ ? [b.x, b.z + e * (b.d / 2 + 0.003)] : [b.x + e * (b.w / 2 + 0.003), b.z];
      out.push(cone(0.0009, 0.0045, 4, 0x3d2b1e, alongZ ? { x, y: ry - 0.0012, z, rx: e * 0.7 } : { x, y: ry - 0.0012, z, rz: -e * 0.7 }));
    }
    out.push(...box(0.0024, 0.0028, 0.0024, wood, { x: b.x + (alongZ ? 0 : b.w * 0.2), y: ry - 0.0012, z: b.z + (alongZ ? -b.d * 0.2 : 0) })); // the smoke hole's hood
    out.push(onFace(b, 'front', 0, 0, 0.0045, Math.min(wh * 0.85, 0.008), DOOR));
    // A boat drawn up in the yard; a wattle fence.
    const boat = frustum(0.0024, 0.0095, 0.0048, 0.013, 0.0022, 0x4e3a28, alongZ ? { x: -l.lw * 0.72, z: -l.ld * 0.2 } : { x: l.lw * 0.45, z: l.ld * 0.78, ry: Math.PI / 2 });
    out.push(...boat, ...fence(l, 0.003, 0x7a6248, 0.007));
    return out;
  },

  // Germans: half-timbering, a jettied upper floor, a steep red roof gable to the street.
  fachwerk(l) {
    const infill = pick(l, [0xf1ece0, 0xeee2c8, 0xe8dcc0]), oak = pick(l, [0x4a3426, 0x3e2c20, 0x5a3a28]), roof = pick(l, [0xa8452f, 0x9a3e2c, 0xb45236]);
    const b = place(l, 0.66, 0.62, l.ld * 0.14), s = storeys(l, 0.1), out: G[] = [];
    out.push(...yard(l, b, 0x7d9a55, 0x9a9488));
    const g0 = l.floors > 1 ? s.base + s.storey : b.h;
    const parts: Body[] = [{ ...b, h: g0 }];
    if (l.floors > 1) parts.push({ ...b, w: b.w + 0.002, d: b.d + 0.002, y: g0, h: b.h - g0 });
    for (const p of parts) {
      out.push(...box(p.w, p.h, p.d, infill, { x: p.x, y: p.y, z: p.z }));
      // The frame: posts, a sill and a head rail, braces at the corners.
      for (const f of SEEN) {
        const fw = faceWidth(p, f);
        out.push(...strips(p, f, p.y, p.h, 0.0009, 0.0075, oak));
        out.push(onFace(p, f, 0, p.y, fw, 0.0009, oak), onFace(p, f, 0, p.y + p.h - 0.0009, fw, 0.0009, oak));
        for (const sx of [-1, 1]) out.push(tilted(p, f, sx * (fw / 2 - 0.0028), p.y + p.h / 2, 0.0008, p.h * 0.8, sx * 0.55, oak, E * 2));
      }
    }
    for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(...windows({ ...b, w: b.w + 0.002, d: b.d + 0.002 }, f, { ...s, w: 0.0026, h: s.storey * 0.38, spacing: 0.0095, sill: s.storey * 0.32, color: 0x2e2a28, door: true }));
    out.push(onFace(b, 'front', 0, 0, 0.005, Math.min(0.0085, s.storey * 0.72), 0x6b3a24, E * 3));
    const top = parts[parts.length - 1]!, rh = Math.min(top.w * 0.85, 0.03);
    out.push(...gable(top.w + 0.004, top.d + 0.004, rh, roof, { x: b.x, y: b.h, z: b.z }, true, infill));
    out.push(onFace(top, 'front', 0, b.h, 0.0009, rh * 0.8, oak, 0.0021), onFace(top, 'front', 0, b.h + rh * 0.3, top.w * 0.55, 0.0009, oak, 0.0021));
    out.push(...box(0.003, rh * 0.5, 0.003, 0x8a5a44, { x: b.x - b.w * 0.2, y: b.h + rh * 0.45, z: b.z - b.d * 0.2 }));
    out.push(...box(2 * l.lw * 0.9, 0.003, 0.003, 0x4f6e38, { z: -l.ld * 0.88 }), ...tree(l.lw * 0.62, -l.ld * 0.7, 0.85, 0x4f6e38));
    return out;
  },

  // French: granite under a steep slate roof, dormers, chimneys on both gables, blue shutters.
  slate(l) {
    const granite = pick(l, [0xa9a59c, 0x9e9a90, 0xb4afa4]), slate = pick(l, [0x4f5a66, 0x47515c, 0x58626e]), shutter = pick(l, [0x4f78a8, 0x3a6a5a, 0x8a3a3a]);
    const b = place(l, 0.72, 0.5, l.ld * 0.3), s = storeys(l, 0.12), out: G[] = [];
    out.push(...yard(l, b, 0x7d9a55, 0xb0a890));
    out.push(...box(b.w, b.h, b.d, granite, { x: b.x, z: b.z }));
    for (const [x, z] of [[-1, 1], [1, 1]] as const) out.push(...box(0.0018, b.h, 0.0018, 0xc8c2b6, { x: b.x + x * b.w / 2, z: b.z + z * b.d / 2 })); // quoins
    out.push(...windows(b, 'front', { ...s, w: 0.003, h: s.storey * 0.45, spacing: 0.01, sill: s.storey * 0.3, color: 0x2a3038, frame: 0xd8d2c4, shutter, door: true }));
    for (const f of ['back', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.4, spacing: 0.013, sill: s.storey * 0.32, color: 0x2a3038 }));
    out.push(onFace(b, 'front', 0, 0, 0.005, Math.min(0.009, s.storey * 0.72), shutter));
    const rh = Math.min(b.w, b.d) * 0.78;
    out.push(...gable(b.w + 0.003, b.d + 0.004, rh, slate, { x: b.x, y: b.h, z: b.z }, false, granite));
    // Chimneys on both gable walls, above the ridge.
    for (const sx of [-1, 1]) out.push(...box(0.0042, rh + 0.004, 0.003, granite, { x: b.x + sx * (b.w / 2 - 0.0016), y: b.h, z: b.z }));
    // Dormers out on the front slope.
    const nd = b.w > 0.035 ? 2 : 1, zd = b.z + b.d * 0.28, yd = b.h + rh * (1 - 0.56) - 0.0008;
    for (let i = 0; i < nd; i++) {
      const x = b.x + (nd === 1 ? 0 : (i ? 1 : -1) * b.w * 0.22), db: Body = { x, z: zd - 0.0018, w: 0.0042, d: 0.0036, y: yd, h: 0.0042 };
      out.push(...box(db.w, db.h, db.d, 0xe9e4d8, { x, y: yd, z: db.z }), onFace(db, 'front', 0, yd + 0.0008, 0.0024, 0.0026, 0x2a3038));
      out.push(...gable(0.0054, 0.0046, 0.0024, slate, { x, y: yd + db.h, z: db.z }, true, 0xe9e4d8));
    }
    out.push(...fence(l, 0.003, granite, 0.008), ...tree(-l.lw * 0.64, -l.ld * 0.7, 0.9, 0x5e7a44), shrub(l.lw * 0.72, l.ld * 0.74, 0.0024, 0x4f6e38));
    return out;
  },
} satisfies Record<string, Build>;

// ---------- helpers ----------

const shadeWood = (c: number) => shade(c, 0.72);
const shadeTurf = (c: number) => shade(c, 0.85);
const shadeTile = (c: number) => shade(c, 0.8);
