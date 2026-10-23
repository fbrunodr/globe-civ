// Quads (four floors, high density) in the civs' own styles
// (architecture.ts): the lot models of houses.ts, one per style, built to
// the lot's footprint, in three variants. (The Stalinist style also builds
// the Russian towers.)

import * as THREE from 'three';
import { cone, cyl } from '../propCatalog.ts';
import {
  E, P, arch, bands, box, chamfered, disc, dome, drum, faceWidth, gable, onFace, palm, patch, pick, place, prism, ring, shade, shrub,
  storeys, strips, tree, windows, yard, ALL, type Body, type Build, type Face, type G, type Lot,
} from '../houseKit.ts';

const GLASS = 0x2e3a44;
const floorLines = (l: Lot, s: { base: number; storey: number }) => Array.from({ length: l.floors - 1 }, (_, f) => s.base + (f + 1) * s.storey);
const bays = (w: number, n: number) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * (w / n));

export const QUAD_STYLES = {
  // Greeks: concrete flats on stilts, a balcony slab on every floor, striped awnings, water heaters on the roof.
  polykatoikia(l) {
    const concrete = pick(l, [0xf0eee8, 0xe8e4da, 0xf2ece0]), awning = pick(l, [0x3f7fb5, 0x4f8a5a, 0xd9a441]);
    const b = place(l, 0.86, 0.68, l.ld * 0.12), s = storeys(l, 0.04), out: G[] = [];
    out.push(...yard(l, b, 0xb8b4ac, 0xc8c4bc));
    // The ground floor set back behind its columns (pilotis).
    const g0 = s.base + s.storey;
    out.push(...box(b.w * 0.84, g0, b.d * 0.84, 0xc9c4b8, { x: b.x, z: b.z }));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0016, g0, 0.0016, concrete, { x: b.x + x * (b.w / 2 - 0.0008), z: b.z + z * (b.d / 2 - 0.0008) }));
    const up: Body = { ...b, y: g0, h: b.h - g0 };
    out.push(...box(b.w, up.h, b.d, concrete, { x: b.x, y: g0, z: b.z }));
    // Each floor: a balcony slab front and back, glass doors, a rail, awnings over it.
    const n = Math.max(2, Math.floor(b.w / 0.013));
    for (let f = 1; f < l.floors; f++) {
      const y = s.base + f * s.storey;
      for (const side of [1, -1]) {
        const z = b.z + side * (b.d / 2 + 0.002), face: Face = side > 0 ? 'front' : 'back';
        out.push(...box(b.w + 0.002, 0.0008, 0.004, concrete, { x: b.x, y, z }), onFace(up, face, 0, y + s.storey * 0.08, b.w * 0.86, s.storey * 0.66, GLASS));
        out.push(onFace({ ...b, d: b.d + 0.0078 }, face, 0, y + 0.0008, b.w + 0.002, 0.0018, 0xc8d4d8));
      }
      bays(b.w, n).forEach((a, i) => out.push(P(new THREE.PlaneGeometry((b.w / n) * 0.86, 0.0042).rotateX(-0.65), (i + f) % 2 ? awning : 0xf4f1ea, { x: b.x + a, y: y + s.storey * 0.82, z: b.z + b.d / 2 + 0.0025 })));
      out.push(shrub(b.x + b.w / 2 - 0.0015, b.z + b.d / 2 + 0.002, 0.0012, 0x4f8a3a));
    }
    for (const f of ['left', 'right'] as const) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: g0, w: 0.0026, h: s.storey * 0.4, spacing: 0.011, sill: s.storey * 0.3, color: GLASS }));
    // Solar water heaters and an antenna on the roof.
    for (const x of [-b.w * 0.25, b.w * 0.2]) out.push(...box(0.0042, 0.0016, 0.0018, 0xd8d8d8, { x: b.x + x, y: b.h, z: b.z - b.d * 0.15 }), P(new THREE.PlaneGeometry(0.0042, 0.0042).rotateX(-1.0), 0x2a3a5a, { x: b.x + x, y: b.h + 0.0018, z: b.z - b.d * 0.15 + 0.003 }));
    out.push(cyl(0.0002, 0.0002, 0.006, 3, 0x6a6a6a, { x: b.x + b.w * 0.35, y: b.h, z: b.z + b.d * 0.2 }));
    return out;
  },

  // Spanish: Barcelona's chamfered corners, a rippled roof in broken coloured tile, bone balconies.
  modernisme(l) {
    const stone = pick(l, [0xe9d9b8, 0xdcc8a4, 0xe8d0c0]), tiles = [0x2a9db0, 0xd9a441, 0x4f8a5a, 0xb0352b], bone = 0xd9d3c4;
    const b = place(l, 0.86, 0.76, l.ld * 0.05), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xc8bca4, 0xd8ccb4));
    const cut = 0.18, k = Math.min(b.w, b.d) * cut;
    out.push(...chamfered(b.w, b.h, b.d, cut, stone, { x: b.x, z: b.z }, 0xc8b8a0));
    // Arched windows across the straight part of each face; bone balconies under those at the front.
    for (const f of ['front', 'back'] as const) {
      const fw = faceWidth(b, f) - 2 * k, n = Math.max(1, Math.floor(fw / 0.0105));
      for (let fl = 0; fl < l.floors; fl++) for (const a of bays(fw, n)) {
        if (fl === 0 && f === 'front' && Math.abs(a) < fw / n / 2) continue;
        const y = s.base + fl * s.storey + s.storey * 0.22;
        out.push(...arch(b, f, a, y, 0.003, s.storey * 0.42, GLASS));
        if (f === 'front' && fl > 0) out.push(...box(0.0048, 0.001, 0.0024, bone, { x: b.x + a, y: y - 0.0008, z: b.z + b.d / 2 + 0.0012 }));
      }
    }
    for (const f of ['left', 'right'] as const) out.push(...windows({ ...b, d: b.d - 2 * k }, f, { ...s, w: 0.0028, h: s.storey * 0.42, spacing: 0.011, sill: s.storey * 0.25, color: GLASS }));
    out.push(...arch(b, 'front', 0, 0, 0.0062, s.base + s.storey * 0.62, 0x5a4632));
    // The rolling roof: tiled humps along the front.
    const nh = Math.max(2, Math.floor((b.w - 2 * k) / 0.014)), hw = (b.w - 2 * k) / nh;
    for (let i = 0; i < nh; i++) {
      const g = new THREE.CylinderGeometry(hw / 2, hw / 2, b.d * 0.5, 6, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.7, 1);
      out.push(P(g, tiles[(i + l.v) % tiles.length]!, { x: b.x - (b.w - 2 * k) / 2 + hw * (i + 0.5), y: b.h, z: b.z + b.d * 0.18 }));
    }
    // Mushroom chimneys in mosaic.
    for (const x of [-b.w * 0.25, b.w * 0.22]) out.push(cyl(0.0009, 0.0011, 0.004, 5, stone, { x: b.x + x, y: b.h, z: b.z - b.d * 0.25 }), P(new THREE.SphereGeometry(0.0016, 5, 3), tiles[(l.v + 1) % 4]!, { x: b.x + x, y: b.h + 0.0045, z: b.z - b.d * 0.25 }));
    return out;
  },

  // Hebrews: Tel Aviv's White City: white render, ribbon windows, round corner balconies, pilotis, a roof pergola.
  bauhaus(l) {
    const white = pick(l, [0xf6f5f0, 0xf2efe6, 0xeef0ec]);
    const b = place(l, 0.78, 0.62, l.ld * 0.16), s = storeys(l, 0.04), out: G[] = [];
    out.push(...yard(l, b, 0x8aa060, 0xd8d4c8));
    // Lifted on pilotis: a recessed lobby under the block.
    const g0 = s.base + s.storey;
    out.push(...box(b.w * 0.55, g0, b.d * 0.6, 0xcfd3d3, { x: b.x - b.w * 0.12, z: b.z }));
    for (const x of [-0.42, 0, 0.42]) for (const z of [-0.4, 0.4]) out.push(cyl(0.0008, 0.0008, g0, 6, white, { x: b.x + x * b.w, z: b.z + z * b.d }));
    const up: Body = { ...b, y: g0, h: b.h - g0 };
    out.push(...box(b.w, up.h, b.d, white, { x: b.x, y: g0, z: b.z }));
    // Ribbon windows, and balconies wrapping the front right corner.
    const r = Math.min(0.0065, b.d * 0.25);
    for (let f = 1; f < l.floors; f++) {
      const y = s.base + f * s.storey;
      for (const face of ALL) out.push(onFace(up, face, face === 'front' ? -b.w * 0.12 : 0, y + s.storey * 0.38, faceWidth(b, face) * (face === 'front' ? 0.62 : 0.72), s.storey * 0.3, GLASS));
      out.push(P(new THREE.CylinderGeometry(r, r, 0.0026, 10).translate(0, 0.0013, 0), white, { x: b.x + b.w / 2 - r * 0.4, y, z: b.z + b.d / 2 - r * 0.4 }));
    }
    // A pergola over the roof terrace.
    const px = b.x - b.w * 0.15, pz = b.z - b.d * 0.1;
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.0003, 0.0003, 0.004, 3, white, { x: px + x * b.w * 0.18, y: b.h, z: pz + z * b.d * 0.18 }));
    for (const z of [-1, 0, 1]) out.push(...box(b.w * 0.4, 0.0005, 0.0006, white, { x: px, y: b.h + 0.004, z: pz + z * b.d * 0.17 }));
    out.push(...tree(-l.lw * 0.7, l.ld * 0.74, 0.9, 0x4f7a34), ...tree(l.lw * 0.72, -l.ld * 0.8, 0.9, 0x5e8a44));
    return out;
  },

  // Chinese: Shanghai lane houses: grey brick with red bands, stone-framed gates, stepped party walls.
  shikumen(l) {
    const brick = pick(l, [0x8d8f8c, 0x858882, 0x96938c]), red = 0xa6463a, stone = 0xd9d1c0, tile = 0x3f3a36;
    const b = place(l, 0.92, 0.72, l.ld * 0.1), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0x9a948a, 0xa8a298));
    out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }), ...bands(b, floorLines(l, s), 0.0012, red));
    for (const f of ALL) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.0028, h: s.storey * 0.42, spacing: 0.0085, sill: s.storey * 0.28, color: GLASS, frame: f === 'front' ? stone : undefined }));
    // A gate per house: a stone frame, an arched pediment, a black door.
    const n = Math.max(2, Math.round(b.w / 0.016)), hw = b.w / n;
    for (const a of bays(b.w, n)) out.push(...arch(b, 'front', a, 0, 0.0074, 0.0105, stone), onFace(b, 'front', a, 0, 0.005, 0.0092, 0x1d1d1d, E * 2));
    const rh = Math.min(b.w, b.d) * 0.26;
    out.push(...gable(b.w + 0.002, b.d + 0.003, rh, tile, { x: b.x, y: b.h, z: b.z }, false, brick));
    // Stepped party walls (horse-head walls) at the row's ends and every other house.
    for (let k = 0; k <= n; k += k === n - 1 || n < 3 ? 1 : 2) {
      const x = Math.max(-b.w / 2 + 0.0006, Math.min(b.w / 2 - 0.0006, -b.w / 2 + k * hw));
      out.push(...box(0.0012, rh + 0.0015, b.d * 0.4, brick, { x: b.x + x, y: b.h, z: b.z }, 0x2e2a28), ...box(0.0012, rh * 0.55, b.d * 0.8, brick, { x: b.x + x, y: b.h, z: b.z }, 0x2e2a28));
    }
    return out;
  },

  // Japanese: narrow buildings shoulder to shoulder, hung with vertical signs, air-conditioners outside.
  zakkyo(l) {
    const fronts = [0xc9cfd4, 0xe2d8c4, 0xa9b4bd, 0xd9d4cc, 0xb8bcc0], signs = [0xd83b2e, 0xf2c230, 0x2fa6c9, 0xe36aa6, 0x5ac95a];
    const out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a9690)];
    const n = Math.max(2, Math.min(4, Math.round((2 * l.lw) / 0.016))), w = (2 * l.lw * 0.96) / n, d = 2 * l.ld * 0.82, z = l.ld - 0.002 - d / 2;
    const s = storeys(l, 0.05);
    for (let i = 0; i < n; i++) {
      const h = l.H * (0.82 + 0.28 * (((i * 7 + l.v * 3) % 5) / 4)), x = -l.lw * 0.96 + w * (i + 0.5);
      const b: Body = { x, z, w: w - 0.0005, d, y: 0, h }, col = fronts[(i + l.v) % fronts.length]!;
      out.push(...box(b.w, h, d, col, { x, z }, shade(col, 0.8)));
      // A glass band per floor, a shop front below.
      const fl = Math.max(2, Math.round(h / s.storey));
      for (let f = 1; f < fl; f++) out.push(onFace(b, 'front', 0, f * (h / fl) + (h / fl) * 0.25, b.w * 0.8, (h / fl) * 0.45, GLASS));
      out.push(onFace(b, 'front', 0, 0, b.w * 0.86, (h / fl) * 0.8, 0xe8e0c8));
      // A vertical sign at its edge, an air-conditioner, a tank or a billboard on the roof.
      const sx = (i % 2 ? 1 : -1) * (b.w / 2 - 0.001);
      out.push(...box(0.0012, h * 0.5, 0.0032, signs[(i + l.v) % signs.length]!, { x: x + sx, y: h * 0.32, z: z + d / 2 + 0.0016 }));
      out.push(...box(0.0028, 0.0018, 0.0016, 0xe0e0e0, { x: x - sx * 0.4, y: h * 0.55, z: z + d / 2 + 0.0008 }));
      if ((i + l.v) % 2) out.push(...drum(0.0018, 0.0018, 0.003, 6, 0x8a9aa8, { x, y: h, z: z - d * 0.2 }));
      else out.push(...box(b.w * 0.7, 0.005, 0.0004, signs[(i + 2) % signs.length]!, { x, y: h + 0.0015, z: z + d * 0.3 }), ...box(0.0004, 0.0015, 0.0004, 0x4a4a4a, { x, y: h, z: z + d * 0.3 }));
    }
    return out;
  },

  // Mongols: a prefab panel block, a painted panel under every window, a ger in the yard.
  panel(l) {
    const panel = pick(l, [0xe5e1d8, 0xdcd6cc, 0xe8e4dc]), cols = [0xe07a3c, 0x4f8ac9, 0xe3c13a, 0x62a35a];
    const b = place(l, 0.88, 0.56, l.ld * 0.2), s = storeys(l, 0.04), out: G[] = [];
    out.push(...yard(l, b, 0xa8a070, 0xb8b4a8));
    out.push(...box(b.w, b.h, b.d, panel, { x: b.x, z: b.z }, 0x8a8680));
    const n = Math.max(2, Math.floor(b.w / 0.0085));
    for (const face of ['front', 'back'] as Face[]) for (let f = 0; f < l.floors; f++) for (const [i, a] of bays(b.w, n).entries()) {
      const y = s.base + f * s.storey;
      out.push(onFace(b, face, a, y + s.storey * 0.4, 0.0034, s.storey * 0.4, GLASS), onFace(b, face, a, y + s.storey * 0.12, (b.w / n) * 0.86, s.storey * 0.22, cols[(i + f + l.v) % cols.length]!));
    }
    for (const f of ['left', 'right'] as const) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.4, spacing: 0.011, sill: s.storey * 0.4, color: GLASS }));
    out.push(...box(b.w * 0.18, 0.004, b.d * 0.4, panel, { x: b.x + b.w * 0.2, y: b.h, z: b.z }));
    // A ger behind the block.
    const gx = -l.lw * 0.5, gz = -l.ld * 0.72, r = Math.min(0.0045, l.ld * 0.2);
    out.push(cyl(r, r, r * 0.9, 9, 0xefe7d6, { x: gx, z: gz }), cone(r * 1.04, r * 0.55, 9, 0xe9e0cc, { x: gx, y: r * 0.9, z: gz }));
    return out;
  },

  // Ethiopians: Asmara Art Deco: pastel stucco, rounded corners, speed lines, portholes, a flag fin.
  deco(l) {
    const stucco = pick(l, [0xecd2a8, 0xd9e2c8, 0xf0d0c8]), trim = pick(l, [0x7fb8a4, 0xc8805a, 0x6a8ac0]);
    const b = place(l, 0.84, 0.62, l.ld * 0.22), s = storeys(l, 0.06), out: G[] = [];
    out.push(...yard(l, b, 0xc8bca4, 0xd8ccb4));
    // The body with its front corners rounded.
    const r = Math.min(b.d * 0.3, 0.008), front = b.z + b.d / 2, mid: Body = { ...b, w: b.w - 2 * r };
    out.push(...box(mid.w, b.h, b.d, stucco, { x: b.x, z: b.z }));
    for (const sx of [-1, 1]) {
      const x = b.x + sx * (b.w / 2 - r);
      out.push(...drum(r, r, b.h, 10, stucco, { x, z: front - r }), ...box(r, b.h, b.d - r, stucco, { x: b.x + sx * (b.w / 2 - r / 2), z: b.z - r / 2 }));
      for (const y of floorLines(l, s)) out.push(cyl(r + 0.0003, r + 0.0003, 0.0006, 10, trim, { x, y, z: front - r }));
    }
    // Ribbon windows and speed lines across the front; portholes on the top floor.
    for (let f = 1; f < l.floors - 1; f++) {
      const y = s.base + f * s.storey;
      out.push(onFace(mid, 'front', 0, y + s.storey * 0.32, mid.w * 0.82, s.storey * 0.36, GLASS), onFace(mid, 'front', 0, y + s.storey * 0.82, mid.w, 0.0005, trim));
    }
    const ty = s.base + (l.floors - 1) * s.storey + s.storey * 0.5;
    for (const a of bays(mid.w * 0.8, Math.max(2, Math.floor(mid.w / 0.008)))) out.push(disc(mid, 'front', a, ty, 0.0014, GLASS));
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows({ ...b, d: b.d - r }, f, { ...s, w: 0.0028, h: s.storey * 0.36, spacing: 0.011, sill: s.storey * 0.32, color: GLASS }));
    // A fin over the entrance carrying a flagpole; a canopy over the door.
    const fh = b.h * 0.5 + 0.01;
    out.push(...box(0.0018, fh, 0.005, trim, { x: b.x, y: b.h - fh + 0.01, z: front + 0.0025 }), cyl(0.0002, 0.0002, 0.006, 3, 0x8a8a8a, { x: b.x, y: b.h + 0.01, z: front + 0.0025 }));
    out.push(...box(0.012, 0.0008, 0.005, trim, { x: b.x, y: s.base + s.storey * 0.78, z: front + 0.0025 }), onFace(mid, 'front', 0, 0, 0.006, s.base + s.storey * 0.75, 0x3a2a24, E * 2));
    out.push(...palm(-l.lw * 0.72, l.ld * 0.8, 1), ...palm(l.lw * 0.72, l.ld * 0.8, 1));
    return out;
  },

  // Indians: Mumbai's ochre stone, blue-grey bands, pointed arches, a domed clock tower, corner turrets.
  indoSaracenic(l) {
    const stone = pick(l, [0xc9a66b, 0xbf9a60, 0xd2b07a]), blue = 0x7d8c9a, gold = 0xc9a24a;
    const b = place(l, 0.88, 0.68, l.ld * 0.08), s = storeys(l, 0.08), out: G[] = [];
    out.push(...yard(l, b, 0xc0b090, 0xd0c0a0));
    out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }), ...bands(b, floorLines(l, s), 0.0012, blue));
    out.push(ring(b.w, 0.0016, b.d, stone, { x: b.x, y: b.h, z: b.z }));
    // Pointed arches across the front; plain windows elsewhere.
    const n = Math.max(2, Math.floor(b.w / 0.011));
    for (let f = 0; f < l.floors; f++) for (const a of bays(b.w, n)) {
      if (f === 0 && Math.abs(a) < b.w / n) continue;
      out.push(...arch(b, 'front', a, s.base + f * s.storey + s.storey * 0.22, 0.0028, s.storey * 0.4, GLASS, true));
    }
    for (const f of ['left', 'right', 'back'] as const) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.42, spacing: 0.011, sill: s.storey * 0.25, color: GLASS }));
    out.push(...arch(b, 'front', 0, 0, 0.0062, s.base + s.storey * 0.62, 0x3a2a24, true));
    // The clock tower over the entrance, its dome and finial.
    const front = b.z + b.d / 2, tw = 0.011, th = b.h + 0.016, tb: Body = { x: b.x, z: front - tw / 2 + 0.002, w: tw, d: tw, y: 0, h: th };
    out.push(...box(tw, th, tw, stone, { x: tb.x, z: tb.z }), disc(tb, 'front', 0, th - 0.0045, 0.0028, 0xf4f1ea), dome(tw * 0.62, blue, { x: tb.x, y: th, z: tb.z, sy: 1.2 }), cone(0.0005, 0.003, 4, gold, { x: tb.x, y: th + tw * 0.74, z: tb.z }));
    // Turrets on the front corners.
    for (const sx of [-1, 1]) {
      const o = { x: b.x + sx * (b.w / 2 - 0.0018), z: front - 0.0018 };
      out.push(cyl(0.0022, 0.0022, b.h + 0.004, 6, stone, o), dome(0.0024, blue, { ...o, y: b.h + 0.004 }, 6));
    }
    out.push(...palm(-l.lw * 0.76, -l.ld * 0.86, 0.9));
    return out;
  },

  // Germans: Hamburg's dark clinker brick, close piers, a ship's-prow corner, stepped-back top floors.
  brickExpressionist(l) {
    const clinker = pick(l, [0x5b3428, 0x4e2c22, 0x664032]), pier = shade(clinker, 1.45), roof = 0x3e2a24;
    const b = place(l, 0.9, 0.72, l.ld * 0.06), s = storeys(l, 0.06), out: G[] = [];
    out.push(...yard(l, b, 0x9a948a, 0xa8a298));
    // The plan: a block narrowing at its left end to a prow; two setbacks at the top.
    const outline = (inset: number): [number, number][] => {
      const x0 = b.x - b.w / 2 + inset, x1 = b.x + b.w / 2 - inset * 0.5, z0 = b.z - b.d / 2 + inset * 0.5, z1 = b.z + b.d / 2 - inset, p = b.d * 0.55;
      return [[x0 + p, z1], [x1, z1], [x1, z0], [x0 + p, z0], [x0, (z0 + z1) / 2]];
    };
    const h1 = b.h * 0.76, h2 = b.h * 0.89;
    out.push(...prism(outline(0), h1, clinker, {}, roof), ...prism(outline(0.003), h2 - h1, clinker, { y: h1 }, roof), ...prism(outline(0.006), b.h - h2, clinker, { y: h2 }, roof));
    // Piers up the straight front, the windows between them.
    const p = b.d * 0.55, fb: Body = { x: b.x + p / 2, z: b.z, w: b.w - p, d: b.d, y: 0, h: h1 };
    for (let f = 0; f < Math.round(l.floors * 0.76 + 0.3); f++) out.push(onFace(fb, 'front', 0, s.base + f * s.storey + s.storey * 0.25, fb.w, s.storey * 0.45, GLASS));
    out.push(...strips(fb, 'front', 0, h1, 0.0011, 0.0035, pier, E * 2));
    out.push(...windows(fb, 'back', { ...s, w: 0.0024, h: s.storey * 0.45, spacing: 0.0075, sill: s.storey * 0.25, color: GLASS }));
    out.push(onFace(fb, 'front', fb.w * 0.2, 0, 0.0055, s.base + s.storey * 0.7, 0x2a1a14, E * 3));
    return out;
  },

  // Russians: quads: a grand neoclassical block with spired corner turrets; towers: a wedding cake with a spire and a star.
  stalinist(l) {
    const stone = pick(l, [0xd8c7a5, 0xcbb894, 0xe0d2b4]), base = 0xa89676, gold = 0xd2a53a, red = 0xb0352b, out: G[] = [];
    if (l.floors >= 12) {
      const b = place(l, 0.8, 0.8, l.ld * 0.1);
      out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8b0a0));
      out.push(...box(b.w * 1.06, 0.008, b.d * 1.06, base, { x: b.x, z: b.z }));
      const tiers = [[1, 0.26], [0.76, 0.3], [0.54, 0.2], [0.32, 0.12]] as const;
      let y = 0;
      tiers.forEach(([k, share], i) => {
        const t: Body = { x: b.x, z: b.z, w: b.w * k, d: b.d * k, y, h: b.h * share };
        out.push(...box(t.w, t.h, t.d, stone, { x: t.x, y, z: t.z }), ...box(t.w + 0.0016, 0.0012, t.d + 0.0016, stone, { x: t.x, y: y + t.h - 0.0012, z: t.z }));
        // Windows in columns between pilasters.
        for (const f of ALL) {
          const narrow = f === 'front' || f === 'back' ? { ...t, w: t.w * 0.86 } : { ...t, d: t.d * 0.86 };
          out.push(onFace(t, f, 0, y + 0.002, faceWidth(narrow, f), t.h - 0.005, GLASS), ...strips(narrow, f, y + 0.002, t.h - 0.005, 0.0016, 0.0048, stone, E * 2));
        }
        if (i < 3) for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cone(0.0016, 0.007, 4, stone, { x: t.x + x * t.w / 2, y: y + t.h, z: t.z + z * t.d / 2 }));
        y += t.h;
      });
      out.push(cone(0.0028, 0.03, 8, gold, { x: b.x, y, z: b.z }), P(new THREE.OctahedronGeometry(0.0018, 0), red, { x: b.x, y: y + 0.031, z: b.z }));
      return out;
    }
    const b = place(l, 0.9, 0.7, l.ld * 0.06), s = storeys(l, 0.08), front = b.z + b.d / 2;
    out.push(...yard(l, b, 0xb8b0a0, 0xc8c0b0));
    out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }), ...box(b.w + 0.0008, s.base + s.storey, b.d + 0.0008, base, { x: b.x, z: b.z }));
    out.push(...box(b.w + 0.002, 0.0014, b.d + 0.002, stone, { x: b.x, y: b.h - 0.0014, z: b.z }));
    for (const f of ALL) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.5, spacing: 0.0085, sill: s.storey * 0.25, color: GLASS, door: true }));
    out.push(...strips({ ...b, h: b.h - s.base - s.storey }, 'front', s.base + s.storey, b.h - s.base - s.storey - 0.0014, 0.0012, 0.0085, shade(stone, 1.08), E * 2));
    out.push(onFace(b, 'front', 0, 0, 0.007, s.base + s.storey * 0.8, 0x3a2a24, E * 3));
    // A raised middle with a little spire; spired turrets on the front corners.
    out.push(...box(b.w * 0.3, 0.006, b.d * 0.5, stone, { x: b.x, y: b.h, z: b.z }), cone(0.0012, 0.012, 4, gold, { x: b.x, y: b.h + 0.006, z: b.z }));
    for (const sx of [-1, 1]) {
      const o = { x: b.x + sx * (b.w / 2 - 0.0026), z: front - 0.0026 };
      out.push(...box(0.0052, 0.005, 0.0052, stone, { ...o, y: b.h }), cone(0.0034, 0.008, 4, gold, { ...o, y: b.h + 0.005, ry: Math.PI / 4 }));
    }
    return out;
  },
} satisfies Record<string, Build>;

