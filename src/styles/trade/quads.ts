// Shops and works (houses.ts: a style's variants 3 and 4 are its two
// shops, 5 its works): brick, haussmann, polykatoikia, modernisme, bauhaus,
// shikumen, zakkyo, panel, deco, indoSaracenic, brickExpressionist,
// stalinist. The four-floor streets of the Modern era (about 1880 to now):
// each drawn after the shops and works its city kept, in the materials and
// colours of its homes (styles/quads.ts, houses.ts FIRST_STYLES).

import * as THREE from 'three';
import { cone, cyl, type Tf } from '../../propCatalog.ts';
import {
  E, P, BAND, FRAME, arch, bands, box, chamfered, chimney, smokeFrom, disc, dome, drum, gable, hip, onFace, palm, patch, pick, place, prism, ring, shrub, spire, storeys, strips, tree, windows, yard,
  type Body, type Build, type Face, type G, type Trade,
} from '../../houseKit.ts';
import { awning, barrels, cart, counter, crates, doubleDoor, hangingSign, lantern, roundStack, sacks, sawtooth, signBoard, stack, valance } from '../../tradeKit.ts';

// ---------- shared bits ----------
const GLASS = 0x2e3a44, TYRE = 0x222222;
// A shop window on a face: its frame, the glass, the glazing bars between n panes.
function shopWindow(b: Body, face: Face, along: number, y: number, w: number, h: number, frame: number, glass: number, n: number, out = FRAME): G[] {
  const res: G[] = [onFace(b, face, along, y - 0.0004, w + 0.0008, h + 0.0008, frame, out), onFace(b, face, along, y, w, h, glass, out + E)];
  for (let i = 1; i < n; i++) res.push(onFace(b, face, along - w / 2 + (i * w) / n, y, 0.0003, h, frame, out + E * 2));
  return res;
}
// A point in a frame turned by ry about (x, z): lx across, lz forward.
const turn = (o: { x: number; z: number; ry: number }, lx: number, lz: number) => ({
  x: o.x + lx * Math.cos(o.ry) + lz * Math.sin(o.ry), z: o.z - lx * Math.sin(o.ry) + lz * Math.cos(o.ry),
});
// A lorry, `len` long, facing +z turned by ry: a cab, its windscreen, a
// load bed (a box van when `van`), four wheels.
function lorry(len: number, body: number, cab: number, o: { x: number; z: number; ry: number }, van = false, load?: number): G[] {
  const w = len * 0.4, r = len * 0.12, at = (lx: number, lz: number) => turn(o, lx, lz), ry = o.ry, out: G[] = [];
  out.push(...box(w * 0.94, r * 0.7, len * 0.95, 0x2a2a2a, { ...at(0, 0), y: r * 0.5, ry }));
  out.push(...box(w, len * 0.26, len * 0.26, cab, { ...at(0, len * 0.34), y: r * 1.2, ry }));
  out.push(onFace({ ...at(0, len * 0.34), w, d: len * 0.26, y: 0, h: 0 } as Body, 'front', 0, r * 1.2 + len * 0.13, w * 0.86, len * 0.1, GLASS));
  if (van) out.push(...box(w * 1.04, len * 0.36, len * 0.64, body, { ...at(0, -len * 0.16), y: r * 1.2, ry }));
  else {
    out.push(...box(w * 1.04, r * 0.5, len * 0.64, body, { ...at(0, -len * 0.16), y: r * 1.2, ry }));
    if (load !== undefined) out.push(...box(w * 0.8, len * 0.16, len * 0.5, load, { ...at(0, -len * 0.17), y: r * 1.7, ry }));
  }
  for (const [lx, lz] of [[-1, 0.3], [1, 0.3], [-1, -0.3], [1, -0.3]] as const) out.push(cyl(r, r, w * 0.2, 6, TYRE, { ...at(lx * w * 0.42 + w * 0.1, lz * len), y: r, rz: Math.PI / 2, ry }));
  return out;
}
// A café table and its chairs: a round top on a post, two chairs (boxes) to either side.
function tableSet(x: number, z: number, top: number, chair: number, s = 1): G[] {
  return [
    cyl(0.0001 * s, 0.0001 * s, 0.0026 * s, 3, 0x3a3a3a, { x, z }), ...drum(0.0011 * s, 0.0011 * s, 0.0002 * s, 6, top, { x, y: 0.0026 * s, z }),
    ...box(0.0009 * s, 0.0018 * s, 0.0009 * s, chair, { x: x - 0.0017 * s, z }), ...box(0.0009 * s, 0.0018 * s, 0.0009 * s, chair, { x: x + 0.0017 * s, z }),
  ];
}
// A pediment: a gable's end standing up out of a front, its slopes coping.
const pediment = (w: number, h: number, wall: number, coping: number, o: Tf) => gable(w, 0.0024, h, coping, o, true, wall);
// A solid lofted from one outline (x, z points) at y up h to another of as many points (a mansard over any plan), closed on top.
function loft(lo: readonly (readonly [number, number])[], hi: readonly (readonly [number, number])[], y: number, h: number, c: number, top = c): G[] {
  const p: number[] = [];
  for (let i = 0; i < lo.length; i++) {
    const a = lo[i]!, b = lo[(i + 1) % lo.length]!, A = hi[i]!, B = hi[(i + 1) % hi.length]!;
    p.push(a[0], y, a[1], b[0], y, b[1], B[0], y + h, B[1], a[0], y, a[1], B[0], y + h, B[1], A[0], y + h, A[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const cap = new THREE.ShapeGeometry(new THREE.Shape(hi.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2).translate(0, y + h, 0);
  return [P(g, c), P(cap, top)];
}
// A quad standing on a line from (x0, z0) to (x1, z1) (a cut corner's face), `out` off it along its normal (-dz, dx): the outside when the line runs left to right as the front's does, `along` from its middle.
function onLine(x0: number, z0: number, x1: number, z1: number, along: number, y: number, w: number, h: number, c: number, out = E): G {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  const g = new THREE.PlaneGeometry(w, h).translate(0, y + h / 2, 0).rotateY(Math.atan2(-uz, ux));
  return P(g, c, { x: (x0 + x1) / 2 + ux * along - uz * out, z: (z0 + z1) / 2 + uz * along + ux * out });
}

// ---------- Industrial brick (English, Vikings) ----------
// Red brick and slate of the mill towns and the Victorian city: stone
// string courses, white sash windows, chimney pots.
const BR_BRICK = [0x9a5a44, 0x8a4e3c, 0x7a5040], BR_SLATE = [0x50555e, 0x4a4e56, 0x5a5654], BR_STONE = 0xd8d0c0, BR_SASH = 0xe8e2d4;
// The corner pub (a public house of the 1890s): three storeys under a
// front gable, its ground floor faced in glazed faience (bottle green,
// oxblood or navy), big etched-glass windows between the pilasters, a gilt
// fascia, lamps on brackets, the painted sign swinging over the pavement;
// a bay window over the door, the cellar flap open and the barrels by it.
const pub: Build = (l) => {
  const brick = pick(l, BR_BRICK), slate = pick(l, BR_SLATE), faience = pick(l, [0x2f5a44, 0x6a2a2a, 0x2a3a5a]), s = storeys(l, 0.1), out: G[] = [];
  const b = { ...place(l, 0.84, 0.66, 0.0062), h: s.base + s.storey * 3 + 0.002 }, gs = s.base + s.storey * 1.05, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x9a948a, 0xa8a094, b.w * 0.9));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
  const fb: Body = { ...b, w: b.w + 0.0008, d: b.d + 0.0008 };
  out.push(...box(fb.w, gs, fb.d, faience, { x: b.x, z: b.z }), ...box(b.w + 0.0014, 0.0007, b.d + 0.0014, BR_STONE, { x: b.x, y: gs, z: b.z }));
  // The fascia, gilt letters on black, front and sides.
  out.push(...signBoard(fb, 'front', 0, gs - 0.0034, fb.w * 0.92, 0.0026, 0x1c1c1c, 0xd8b04a));
  for (const f of ['left', 'right'] as Face[]) out.push(...signBoard(fb, f, 0, gs - 0.0034, fb.d * 0.8, 0.0026, 0x1c1c1c, 0xd8b04a));
  // Etched windows either side of the door; a pair down each side.
  const ww = b.w * 0.3, wh = gs - 0.0072;
  for (const k of [-1, 1]) out.push(...shopWindow(fb, 'front', k * b.w * 0.27, 0.0026, ww, wh, 0x3a2418, 0x8a8468, 3));
  for (const f of ['left', 'right'] as Face[]) for (const k of [-0.22, 0.22]) out.push(...shopWindow(fb, f, k * b.d, 0.0026, b.d * 0.3, wh, 0x3a2418, 0x8a8468, 2));
  out.push(...doubleDoor(fb, 'front', 0, 0.0042, gs - 0.0052, 0x3a2418, 0x2a1a10, E * 2));
  // The floors over the bar: sashes in stone, a bay window over the door.
  for (const f of ['front', 'left', 'right', 'back'] as Face[]) out.push(...windows(b, f, { ...s, floors: 2, base: gs + 0.0006 - s.base, w: 0.0028, h: s.storey * 0.5, spacing: 0.0085, sill: s.storey * 0.2, color: 0x2a3038, frame: BR_SASH }));
  const bay: Body = { x: b.x, z: front + 0.0017, w: 0.0105, d: 0.0034, y: gs + 0.0015, h: s.storey * 0.75 };
  out.push(...box(bay.w, bay.h, bay.d, brick, { x: bay.x, y: bay.y, z: bay.z }, 0x3a3a3a));
  out.push(onFace(bay, 'front', 0, bay.y + bay.h * 0.18, bay.w * 0.8, bay.h * 0.62, 0x2a3038, E * 2), onFace(bay, 'front', 0, bay.y, bay.w, 0.0009, BR_STONE, E));
  // A gable to the street, coped in stone; chimney stacks up the sides.
  out.push(...box(b.w + 0.0016, 0.0013, b.d + 0.0016, BR_STONE, { x: b.x, y: b.h - 0.0012, z: b.z }));
  out.push(...gable(b.w + 0.002, b.d + 0.003, b.w * 0.45, slate, { x: b.x, y: b.h, z: b.z }, true, brick));
  out.push(disc({ ...b, d: b.d + 0.003 }, 'front', 0, b.h + b.w * 0.17, 0.0018, BR_STONE, E * 2));
  for (const sx of [-1, 1]) out.push(...stack(0.0028, b.w * 0.42, brick, 0x6a4a3a, { x: b.x + sx * (b.w / 2 - 0.002), y: b.h, z: b.z - b.d * 0.2 }), cyl(0.0005, 0.0005, 0.0016, 4, 0xa86a4a, { x: b.x + sx * (b.w / 2 - 0.002), y: b.h + b.w * 0.42 + 0.0009, z: b.z - b.d * 0.2 }));
  // The lamps, the sign on its bracket, the cellar flap and the barrels.
  for (const k of [-1, 1]) out.push(...lantern(0.0009, 0xf2d27a, { x: b.x + k * b.w * 0.44, y: gs - 0.0016, z: front + 0.0024 }), ...box(0.0003, 0.0003, 0.0022, 0x1c1c1c, { x: b.x + k * b.w * 0.44, y: gs - 0.0004, z: front + 0.0012 }));
  out.push(...hangingSign(0.0042, 0.005, 0xc8a040, 0x1c1c1c, { x: b.x - b.w / 2 + 0.0012, y: gs + s.storey * 0.62, z: front + 0.0004 }));
  out.push(patch(0.006, 0.003, 0x3a3836, b.x + b.w * 0.3, front + 0.0028, 0.0008));
  out.push(...barrels(3, 0.0011, 0x7a5232, { x: b.x + b.w / 2 + 0.0002, z: front + 0.004 }));
  return out;
};
// The Co-operative store (a town's Co-op, about 1900): two tall storeys of
// plate glass between brick piers, striped awnings out over the pavement,
// the society's name on a stone band, a pediment with a clock over the
// middle, goods out front on trestles and a handcart for deliveries.
const coop: Build = (l) => {
  const brick = pick(l, BR_BRICK), s = storeys(l, 0.1), out: G[] = [];
  const b = { ...place(l, 0.94, 0.62, Math.max(0.0085, l.ld * 0.16)), h: s.base + s.storey * 2.2 }, front = b.z + b.d / 2, gs = s.base + s.storey * 1.15;
  out.push(...yard(l, b, 0x9a948a, 0xa8a094, b.w * 0.96));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }, 0x5a5650));
  // Three bays: a shop window each (the middle one the doors), a showroom window over each.
  const bw = b.w / 3;
  for (const k of [-1, 0, 1]) {
    const a = k * bw;
    out.push(...shopWindow(b, 'front', a, 0.0016, bw * 0.8, gs - 0.0068, 0x2f4a3a, 0x3a4a54, k === 0 ? 2 : 3));
    if (k === 0) out.push(onFace(b, 'front', a, 0.0016, bw * 0.4, gs - 0.0074, 0x1c2228, FRAME + E * 3));
    out.push(...shopWindow(b, 'front', a, gs + 0.0035, bw * 0.7, s.storey * 0.62, BR_SASH, 0x2a3038, 3));
    out.push(...awning(bw * 0.86, 0.0068, [0x2f6a44, 0xeee6d2], { x: b.x + a, y: gs - 0.0042, z: front + 0.0004, tilt: 0.38, stripes: 6 }));
    out.push(valance(bw * 0.86, 0.0068, 0.0009, 0x2f6a44, { x: b.x + a, y: gs - 0.0042, z: front + 0.0004, tilt: 0.38 }));
  }
  // The name band and the stone dressings.
  out.push(...box(b.w + 0.0012, 0.0008, b.d + 0.0012, BR_STONE, { x: b.x, y: gs - 0.0006, z: b.z }));
  out.push(...signBoard(b, 'front', 0, gs - 0.0038, b.w * 0.9, 0.0026, BR_STONE, 0x2a2a2a));
  out.push(...windows(b, 'left', { ...s, floors: 2, w: 0.0028, h: s.storey * 0.5, spacing: 0.0085, sill: s.storey * 0.25, color: 0x2a3038, frame: BR_SASH }));
  out.push(...windows(b, 'right', { ...s, floors: 2, w: 0.0028, h: s.storey * 0.5, spacing: 0.0085, sill: s.storey * 0.25, color: 0x2a3038, frame: BR_SASH }));
  // The parapet, the pediment with its clock, stone balls on the ends.
  out.push(ring(b.w + 0.0012, 0.0026, b.d + 0.0012, BR_STONE, { x: b.x, y: b.h - 0.0008, z: b.z }));
  const pz = front - 0.0009, pb: Body = { x: b.x, z: pz, w: b.w * 0.36, d: 0.0024, y: b.h, h: 0.004 };
  out.push(...box(pb.w, pb.h, pb.d, brick, { x: b.x, y: b.h, z: pz }, BR_STONE));
  out.push(...pediment(b.w * 0.4, 0.0062, brick, BR_STONE, { x: b.x, y: b.h + 0.004, z: pz }));
  out.push(disc(pb, 'front', 0, b.h + 0.0042, 0.0021, 0xf2eee4, E * 2), disc(pb, 'front', 0, b.h + 0.0042, 0.0025, 0x2a2a2a, E));
  for (const sx of [-1, 1]) out.push(P(new THREE.SphereGeometry(0.0011, 6, 3), BR_STONE, { x: b.x + sx * (b.w / 2), y: b.h + 0.0029, z: front }));
  // Goods out front: crates of apples and greens on trestles, sacks, the handcart.
  for (const k of [-1, 1]) {
    out.push(...crates(3, 0.0022, 0x8a6a4a, { x: b.x + k * bw, z: front + 0.0035 }));
    for (let i = 0; i < 3; i++) out.push(...box(0.0018, 0.0004, 0.0018, [0xb83a2a, 0x5a8a3a, 0xd8a83a][(i + k + 1) % 3]!, { x: b.x + k * bw + (i - 1) * 0.0023, y: 0.0017, z: front + 0.0035 + (i - 1) * 0.0001 }));
  }
  out.push(...sacks(3, 0.0011, 0xd8c8a0, { x: b.x + bw * 0.5, z: front + 0.0026 }));
  out.push(...cart(0.0062, 0x2f6a44, 0x2a2a2a, { x: b.x - b.w / 2 + 0.003, z: front + 0.0045, ry: 0.2 }));
  return out;
};
// A cotton mill: the mill block of five floors behind, close-ranked
// windows, a stair tower with the water tank in its top; before it the
// weaving shed under its sawtooth north lights; the engine house and the
// tall octagonal chimney with the mill's name in white brick; bales in the
// yard and a cart at the loading door.
const mill: Build = (l) => {
  const brick = pick(l, BR_BRICK), slate = pick(l, BR_SLATE), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a8478));
  const W = 2 * l.lw * 0.9, md = Math.min(0.016, l.ld * 0.62), mh = l.H * 1.02, mz = -l.ld + 0.003 + md / 2;
  const mw = W - 0.0165, mb: Body = { x: W / 2 - 0.007 - mw / 2, z: mz, w: mw, d: md, y: 0, h: mh };
  out.push(...box(mb.w, mh, mb.d, brick, { x: mb.x, z: mz }));
  const ms = { floors: 5, base: 0.0012, storey: (mh - 0.002) / 5 };
  for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(mb, f, { ...ms, w: 0.0026, h: ms.storey * 0.5, spacing: Math.max(0.006, mb.w / 9), sill: ms.storey * 0.25, color: 0x2a3038, frame: BR_STONE }));
  out.push(...box(mb.w + 0.0012, 0.0013, mb.d + 0.0012, BR_STONE, { x: mb.x, y: mh - 0.0012, z: mz }));
  out.push(hip(mb.w + 0.002, mb.d + 0.002, mb.d * 0.32, slate, { x: mb.x, y: mh, z: mz }));
  // The stair tower at the end, its tank room, a pyramid cap.
  const tx = mb.x + mb.w / 2 + 0.0035, th = mh + 0.009;
  out.push(...box(0.007, th, 0.007, brick, { x: tx, z: mz + md / 2 - 0.0035 }), ...box(0.0078, 0.0013, 0.0078, BR_STONE, { x: tx, y: th - 0.0012, z: mz + md / 2 - 0.0035 }));
  out.push(spire(0.0078, 0.005, 0x4a6a6a, { x: tx, y: th, z: mz + md / 2 - 0.0035 }));
  const tb: Body = { x: tx, z: mz + md / 2 - 0.0035, w: 0.007, d: 0.007, y: 0, h: th };
  for (let i = 0; i < 4; i++) out.push(onFace(tb, 'front', 0, 0.006 + i * 0.013, 0.0018, 0.005, 0x2a3038));
  // The weaving shed before it, its north lights turned to the street.
  const sd = Math.max(0.012, l.ld * 2 - md - 0.016), sz = mz + md / 2 + sd / 2 + 0.0004, sh = 0.009;
  const sb: Body = { x: 0, z: sz, w: W, d: sd, y: 0, h: sh };
  out.push(...box(W, sh, sd, brick, { x: 0, z: sz }, 0x5a5650));
  out.push(...sawtooth(W, sd, Math.max(2, Math.round(sd / 0.0075)), 0.0045, slate, 0x8aa0b0, { x: 0, y: sh, z: sz, ry: Math.PI }));
  for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(sb, f, { floors: 1, base: 0, storey: sh, w: 0.0032, h: sh * 0.45, spacing: 0.0075, sill: sh * 0.3, color: 0x2a3038, frame: BR_STONE }));
  out.push(...doubleDoor(sb, 'front', W * 0.3, 0.006, sh * 0.72, 0x3a4a3a, BR_STONE, E * 3));
  // The engine house and the chimney at the shed's far corner.
  const cx = -W / 2 + 0.0042, cz = mz;
  out.push(...roundStack(0.0032, l.H * 1.55, brick, BR_STONE, { x: cx, z: cz }));
  out.push(cyl(0.0027, 0.0026, 0.007, 8, 0xe8e2d4, { x: cx, y: l.H * 0.95, z: cz }));
  out.push(...box(0.0074, 0.0028, 0.0074, BR_STONE, { x: cx, z: cz }));
  // Bales of cotton by the loading door, a cart at it.
  out.push(...sacks(5, 0.0013, 0xeeeae0, { x: W * 0.05, z: sz + sd / 2 + 0.0028 }));
  out.push(...cart(0.0068, 0x6a5038, 0x3a3028, { x: W * 0.32, z: sz + sd / 2 + 0.0052, ry: Math.PI / 2 }));
  return out;
};

// ---------- Haussmann (Paris) ----------
// Cream limestone, a rusticated ground floor, wrought-iron balconies on the
// second and top floors, zinc mansards with dormers.
const HA_STONE = [0xe6dcc8, 0xddd2bc, 0xe8e0cc], HA_ZINC = [0x6a7480, 0x5e6874, 0x707880], HA_RUST = 0xd2c6ae, HA_IRON = 0x2a2a2a, HA_GOLD = 0xc9a24a;
// A grand magasin (the department stores of the 1890s boulevards): its
// first two floors one arcade of iron-framed glass, the name in gilt along
// the frieze, a glass marquise over the doors; on the corner a rotunda
// under a zinc dome and its gilt lantern, flags on the mansard.
const grandMagasin: Build = (l) => {
  const stone = pick(l, HA_STONE), zinc = pick(l, HA_ZINC), iron = 0x3e4a44, s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.9, 0.74, 0.0055), front = b.z + b.d / 2, g2 = s.base + s.storey * 2;
  out.push(...yard(l, b, 0xb0a894, 0xc0b8a8, b.w * 0.6));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }));
  const fb: Body = { ...b, w: b.w + 0.0008, d: b.d + 0.0008 };
  out.push(...box(fb.w, g2, fb.d, HA_RUST, { x: b.x, z: b.z }));
  // The arcade: tall arched bays of glass, a transom at the first floor.
  for (const f of ['front', 'left', 'right'] as Face[]) {
    const fw = f === 'front' ? fb.w : fb.d, n = Math.min(f === 'front' ? 6 : 4, Math.max(2, Math.round(fw / 0.0115))), bw = fw / n;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * bw, aw = bw * 0.74, ah = g2 - 0.0016 - aw / 2 - 0.0012;
      out.push(...arch(fb, f, a, 0.0012, aw + 0.0008, ah, iron, false, FRAME), ...arch(fb, f, a, 0.0016, aw - 0.0004, ah - 0.0004, 0x51636a, false, E));
      out.push(onFace(fb, f, a, s.base + s.storey * 0.92, aw - 0.0004, 0.0007, iron, E * 2), onFace(fb, f, a, 0.0016, 0.0003, ah, iron, E * 2));
    }
  }
  // The marquise over the doors.
  out.push(...box(b.w * 0.5, 0.0005, 0.005, 0x9ab0b8, { x: b.x, y: s.base + s.storey * 0.82, z: front + 0.0029 }, 0x9ab0b8));
  out.push(...box(b.w * 0.5 + 0.0004, 0.0009, 0.0003, iron, { x: b.x, y: s.base + s.storey * 0.82 - 0.0002, z: front + 0.0054 }));
  // The floors over: windows, iron balconies at the third floor and the top.
  for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: 2, base: g2, w: 0.0028, h: s.storey * 0.58, spacing: Math.max(0.0085, b.w / 8), sill: s.storey * 0.18, color: 0x34383e }));
  for (const y of [g2, g2 + s.storey]) out.push(...box(b.w * 0.94, 0.0022, 0.0022, HA_IRON, { x: b.x, y, z: front + 0.0011 }));
  // The frieze and its gilt name, the cornice.
  out.push(...signBoard(b, 'front', 0, b.h - 0.0044, b.w * 0.62, 0.0028, 0x2e3a34, HA_GOLD, BAND));
  out.push(...box(b.w + 0.0016, 0.0013, b.d + 0.0016, stone, { x: b.x, y: b.h - 0.0012, z: b.z }));
  const mh = Math.max(0.006, s.storey * 0.9);
  out.push(...frustum4(b.w, b.d, b.w * 0.82, b.d * 0.7, mh, zinc, { x: b.x, y: b.h + 0.0001, z: b.z }));
  // Round dormers (oeils-de-boeuf) in the mansard.
  for (const a of [-0.3, 0]) {
    const db: Body = { x: b.x + a * b.w, z: front - 0.0034, w: 0.0036, d: 0.003, y: b.h, h: 0 };
    out.push(...box(db.w, mh * 0.55, db.d, stone, { x: db.x, y: b.h + mh * 0.12, z: db.z }), ...gable(0.0044, 0.0034, 0.0014, zinc, { x: db.x, y: b.h + mh * 0.67, z: db.z }, true, stone));
    out.push(disc(db, 'front', 0, b.h + mh * 0.4, 0.0011, 0x34383e));
  }
  // The rotunda on the corner, its dome and lantern.
  const r = Math.min(0.0072, b.w * 0.17), rx = b.x + b.w / 2 - r * 0.55, rz = front - r * 0.55, rh = b.h + mh + 0.002;
  out.push(cyl(r, r, rh, 10, stone, { x: rx, z: rz }));
  for (const y of [s.base + s.storey * 0.25, g2 + s.storey * 0.2, g2 + s.storey * 1.2, b.h + 0.0012]) out.push(cyl(r + 0.00012, r + 0.00012, s.storey * 0.5, 10, 0x51636a, { x: rx, y, z: rz }));
  out.push(cyl(r + 0.0006, r + 0.0006, 0.0013, 10, stone, { x: rx, y: rh - 0.0013, z: rz }), dome(r + 0.0004, zinc, { x: rx, y: rh, z: rz, sy: 1.5 }, 10));
  out.push(cyl(0.0011, 0.0011, 0.0026, 6, HA_GOLD, { x: rx, y: rh + r * 1.3, z: rz }), cone(0.0013, 0.004, 6, HA_GOLD, { x: rx, y: rh + r * 1.3 + 0.0026, z: rz }));
  // Flags on the mansard.
  for (const [k, c] of [[-0.32, 0x2a4a9a], [0.05, 0xb0352b]] as const) {
    const x = b.x + k * b.w;
    out.push(cyl(0.0001, 0.0001, 0.009, 3, 0xd8d8d8, { x, y: b.h + mh, z: b.z }), P(new THREE.PlaneGeometry(0.0045, 0.003), c, { x: x + 0.00225, y: b.h + mh + 0.0072, z: b.z }));
  }
  return out;
};
// A mansard over a box: a frustum, its top closed in the same zinc.
const frustum4 = (w0: number, d0: number, w1: number, d1: number, h: number, c: number, o: { x: number; y: number; z: number }): G[] =>
  loft([[o.x - w0 / 2, o.z + d0 / 2], [o.x + w0 / 2, o.z + d0 / 2], [o.x + w0 / 2, o.z - d0 / 2], [o.x - w0 / 2, o.z - d0 / 2]], [[o.x - w1 / 2, o.z + d1 / 2], [o.x + w1 / 2, o.z + d1 / 2], [o.x + w1 / 2, o.z - d1 / 2], [o.x - w1 / 2, o.z - d1 / 2]], o.y, h, c);
// The corner café-brasserie: the building's corner cut off (the pan
// coupé), the café's dark red woodwork and glass round the ground floor,
// its red awnings out over a terrace of marble tables and cane chairs, the
// name on the awnings' skirt; a Morris column with its posters on the
// pavement, the flats over it and the zinc mansard over all.
const brasserie: Build = (l) => {
  const stone = pick(l, HA_STONE), zinc = pick(l, HA_ZINC), wood = pick(l, [0x5a1e22, 0x1f3a30, 0x5a1e22]), red = pick(l, [0xa8282a, 0x2f5a44, 0xa8282a]), s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.8, 0.66, 0.0115), front = b.z + b.d / 2, gs = s.base + s.storey;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8b0a0));
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = front, k = Math.min(b.w, b.d) * 0.3;
  const plan = (g: number): [number, number][] => [[x0 - g, z1 + g], [x1 - k + g * 0.41, z1 + g], [x1 + g, z1 - k + g * 0.41], [x1 + g, z0 - g], [x0 - g, z0 - g]];
  out.push(...prism(plan(0), b.h, stone, {}, 0x8a8680), ...prism(plan(0.0005), gs + 0.0002, wood, { y: -0.0002 }, wood));
  // The café's glass on the front, the side and the cut corner (its door there).
  const cb: Body = { ...b, w: b.w + 0.001, d: b.d + 0.001 }, fw = b.w - k, sw = b.d - k, gh = gs - 0.0058;
  out.push(...shopWindow(cb, 'front', -k / 2, 0.0012, fw * 0.86, gh, shade2(wood, 1.3), 0x3a4048, Math.max(2, Math.round(fw / 0.006))));
  out.push(...shopWindow(cb, 'right', k / 2, 0.0012, sw * 0.86, gh, shade2(wood, 1.3), 0x3a4048, Math.max(2, Math.round(sw / 0.006))));
  const cx0 = x1 - k + 0.0002, cz0 = z1 + 0.0005, cx1 = x1 + 0.0005, cz1 = z1 - k + 0.0002;
  out.push(onLine(cx0, cz0, cx1, cz1, 0, 0, 0.0045, gs * 0.72, 0x2a2420, E * 2), onLine(cx0, cz0, cx1, cz1, 0, gs - 0.0044, k * 1.2, 0.0028, 0x1c1c1c, E * 2));
  // The awnings, red with a skirt, front, side and corner.
  const ay = gs - 0.0018, ad = 0.0085, tilt = 0.32;
  out.push(...awning(fw * 0.94, ad, [red], { x: x0 + fw / 2 - 0.0004, y: ay, z: z1 + 0.0006, tilt }), valance(fw * 0.94, ad, 0.0014, shade2(red, 0.8), { x: x0 + fw / 2 - 0.0004, y: ay, z: z1 + 0.0006, tilt }));
  out.push(...awning(sw * 0.94, ad, [red], { x: x1 + 0.0006, y: ay, z: z0 + sw / 2 - 0.0004, tilt, ry: Math.PI / 2 }), valance(sw * 0.94, ad, 0.0014, shade2(red, 0.8), { x: x1 + 0.0006, y: ay, z: z0 + sw / 2 - 0.0004, tilt, ry: Math.PI / 2 }));
  // The terrace: tables along the front and round the corner.
  const nt = Math.min(4, Math.max(2, Math.floor(fw / 0.0068)));
  for (let i = 0; i < nt; i++) out.push(...tableSet(x0 + 0.0035 + i * (fw - 0.004) / nt, z1 + 0.005, 0xe8e4dc, 0xa8803a, 1.35));
  for (let i = 0; i < Math.min(2, Math.max(1, Math.floor(sw / 0.0075))); i++) out.push(...tableSet(x1 + 0.005, z0 + 0.0035 + i * 0.0075, 0xe8e4dc, 0xa8803a, 1.35));
  // The flats over: windows, the balconies, the cornice; the mansard.
  for (const f of ['front', 'right'] as Face[]) {
    const fb2: Body = f === 'front' ? { ...b, x: b.x - k / 2, w: fw } : { ...b, z: b.z - k / 2, d: sw };
    out.push(...windows(fb2, f, { ...s, floors: 3, base: gs, w: 0.0028, h: s.storey * 0.6, spacing: 0.0085, sill: s.storey * 0.18, color: 0x34383e }));
  }
  out.push(...windows(b, 'left', { ...s, floors: 3, base: gs, w: 0.0028, h: s.storey * 0.6, spacing: 0.0085, sill: s.storey * 0.18, color: 0x34383e }));
  for (let f = 1; f < 4; f++) out.push(onLine(x1 - k, z1, x1, z1 - k, 0, s.base + f * s.storey + s.storey * 0.18, 0.0028, s.storey * 0.6, 0x34383e, E));
  for (const y of [gs + s.storey, gs + s.storey * 2]) out.push(...prism([[x0, z1 + 0.0022], [x1 - k + 0.0009, z1 + 0.0022], [x1 + 0.0022, z1 - k + 0.0009], [x1 + 0.0022, z0 + 0.002], [x1, z0 + 0.002], [x1, z1 - k], [x1 - k, z1], [x0, z1]], 0.0022, HA_IRON, { y }));
  out.push(...prism(plan(0.0008), 0.0013, stone, { y: b.h - 0.0012 }));
  const mh = Math.max(0.006, s.storey * 0.9), t = 0.0028;
  out.push(...loft(plan(0), [[x0 + t, z1 - t], [x1 - k - t * 0.4 + 0.0002, z1 - t], [x1 - t, z1 - k + t * 0.4 - 0.0002], [x1 - t, z0 + t], [x0 + t, z0 + t]], b.h + 0.0001, mh, zinc));
  for (const sx of [-0.3, 0.1]) out.push(...chimney(0.003, mh * 1.2, 0.0022, 0xa86a4a, { x: b.x + sx * b.w, y: b.h, z: b.z - b.d * 0.25 }));
  // The Morris column at the lot's front corner.
  const mx = x0 + 0.0028, mz = Math.min(l.ld - 0.0028, z1 + 0.009);
  out.push(cyl(0.0021, 0.0021, 0.0115, 8, 0x2f4a3a, { x: mx, z: mz }), cyl(0.00222, 0.00222, 0.007, 8, 0xe8d8b0, { x: mx, y: 0.0026, z: mz }));
  out.push(cyl(0.0025, 0.0025, 0.0008, 8, 0x2f4a3a, { x: mx, y: 0.0115, z: mz }), dome(0.0021, 0x2f4a3a, { x: mx, y: 0.0123, z: mz, sy: 0.9 }, 8));
  return out;
};
const shade2 = (c: number, k: number): number => {
  const f = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (f(16) << 16) | (f(8) << 8) | f(0);
};
// A printing works (an imprimerie of the 1900s, in a courtyard off the
// street): its hall of brick and iron, the gable to the street holding one
// great half-round window, a glazed lantern along the ridge, a short brick
// chimney for the boiler; a stone office building at the gate, rolls of
// paper in the yard and the van that takes the papers out.
const imprimerie: Build = (l) => {
  const stone = pick(l, HA_STONE), zinc = pick(l, HA_ZINC), brick = pick(l, [0xa8604a, 0x9a5a44, 0xb06a50]), yellow = 0xd8b886, iron = 0x3e4a44, out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb0a894), patch(2 * l.lw * 0.9, l.ld * 0.9, 0xa49c8a, 0, l.ld * 0.45, 0.0005));
  // The hall at the back, gable on.
  const hw = 2 * l.lw * 0.62, hd = 2 * l.ld * 0.7, hh = l.H * 0.46, hb: Body = { x: -l.lw * 0.3 + 0.0005, z: -l.ld + 0.003 + hd / 2, w: hw, d: hd, y: 0, h: hh };
  out.push(...box(hw, hh, hd, brick, { x: hb.x, z: hb.z }), ...bands(hb, [hh * 0.33, hh * 0.66], 0.0012, yellow));
  const rh = hw * 0.36;
  out.push(...gable(hw + 0.0016, hd + 0.0016, rh, zinc, { x: hb.x, y: hh, z: hb.z }, true, brick));
  // The lantern along the ridge.
  out.push(...box(0.0034, 0.0026, hd * 0.86, 0x9ab0b8, { x: hb.x, y: hh + rh - 0.0009, z: hb.z }, zinc), ...gable(0.0048, hd * 0.86 + 0.0006, 0.0014, zinc, { x: hb.x, y: hh + rh + 0.0017, z: hb.z }, true));
  // The great window: a half round of iron and glass in the gable, a door below, windows down the side.
  const gr = hw * 0.36, gy = hh - gr * 0.25, gz = hb.z + hd / 2 + 0.0008 + E;
  out.push(P(new THREE.CircleGeometry(gr + 0.0006, 8, 0, Math.PI).translate(0, gy, 0), iron, { x: hb.x, z: gz }), P(new THREE.CircleGeometry(gr, 8, 0, Math.PI).translate(0, gy, 0), 0x6a8494, { x: hb.x, z: gz + E }));
  for (const a of [-0.5, 0, 0.5]) out.push(P(new THREE.PlaneGeometry(0.0003, gr).rotateZ(a).translate(-Math.sin(a) * gr / 2, gy + Math.cos(a) * gr / 2, 0), iron, { x: hb.x, z: gz + E * 2 }));
  out.push(onFace(hb, 'front', 0, gy - 0.0018, hw * 0.86, 0.0014, yellow, FRAME));
  for (const a of [-0.3, 0.3]) out.push(...shopWindow(hb, 'front', a * hw, 0.003, hw * 0.2, gy - 0.0068, iron, 0x51636a, 2));
  out.push(...doubleDoor(hb, 'front', 0, hw * 0.24, gy - 0.0036, 0x4a3a2a, iron, E * 2));
  for (const f of ['left', 'right'] as Face[]) out.push(...strips(hb, f, 0, hh, 0.0012, 0.0075, yellow, BAND), ...windows(hb, f, { floors: 1, base: 0, storey: hh, w: 0.0036, h: hh * 0.55, spacing: 0.0075, sill: hh * 0.25, color: 0x51636a, frame: iron }));
  // The chimney behind the hall.
  out.push(...stack(0.0042, l.H * 0.95, brick, 0x4a3a30, { x: hb.x + hw / 2 - 0.004, z: hb.z - hd / 2 + 0.0035 }));
  // The office at the gate: two floors of stone and a zinc mansard, beside the hall.
  const ow = 2 * l.lw * 0.3, od = Math.min(0.016, l.ld * 0.7), ob: Body = { x: l.lw * 0.98 - ow / 2 - 0.0015, z: l.ld - 0.003 - od / 2, w: ow, d: od, y: 0, h: l.H * 0.42 };
  out.push(...box(ow, ob.h, od, stone, { x: ob.x, z: ob.z }), ...box(ow + 0.0008, 0.008, od + 0.0008, HA_RUST, { x: ob.x, z: ob.z }));
  out.push(...windows(ob, 'front', { floors: 2, base: 0.0012, storey: ob.h / 2, w: 0.0028, h: ob.h * 0.28, spacing: 0.0075, sill: 0.002, color: 0x34383e }));
  out.push(...windows(ob, 'left', { floors: 2, base: 0.0012, storey: ob.h / 2, w: 0.0028, h: ob.h * 0.28, spacing: 0.0075, sill: 0.002, color: 0x34383e }));
  out.push(...box(ow + 0.0014, 0.0011, od + 0.0014, stone, { x: ob.x, y: ob.h - 0.001, z: ob.z }), ...frustum4(ow, od, ow * 0.7, od * 0.5, 0.0055, zinc, { x: ob.x, y: ob.h + 0.0001, z: ob.z }));
  out.push(...signBoard(ob, 'front', 0, ob.h - 0.0042, ow * 0.86, 0.0024, 0x2e3a34, HA_GOLD));
  // Rolls of paper by the door, the van.
  for (let i = 0; i < 4; i++) out.push(...drum(0.0016, 0.0016, 0.0034, 7, 0xf2eee4, { x: hb.x - hw * 0.3 + (i % 2) * 0.0036, y: 0, z: hb.z + hd / 2 + 0.0035 + Math.floor(i / 2) * 0.0036 }, 0xd8d0c0));
  out.push(...lorry(0.012, 0x2f4a6a, 0x2f4a6a, { x: hb.x + hw * 0.18, z: hb.z + hd / 2 + 0.0078, ry: Math.PI / 2 + 0.15 }, true));
  return out;
};

// ---------- Polykatoikia (Athens) ----------
// White concrete flats on pilotis, a balcony on every floor with its rail,
// striped awnings, solar heaters on the roofs.
const PO_CONCRETE = [0xf0eee8, 0xe8e4da, 0xf2ece0], PO_AWNING = [0x3f7fb5, 0x4f8a5a, 0xd9a441], PO_RAIL = 0xc8d4d8, BOUGAINVILLEA = 0xc8327a;
// A summer cinema (the open-air therinó of every Athens neighbourhood):
// a walled garden under the sky, the whitewashed walls topped with
// bougainvillea, the big white screen at its back, rows of canvas chairs;
// at the gate the ticket booth with its posters and lit name, the
// projection box over it, a canteen at the side under a pergola.
const therino: Build = (l) => {
  const lime = pick(l, PO_CONCRETE), chair = pick(l, [0x3f7fb5, 0xb0352b, 0x4f8a5a]), out: G[] = [];
  const W = 2 * l.lw * 0.94, D = 2 * l.ld * 0.94, wh = 0.0105;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8b4ac), patch(W, D, 0xc8b89a, 0, 0, 0.0005)); // the gravel floor
  // The walls round, a gap at the gate; bougainvillea along their tops.
  for (const sx of [-1, 1]) out.push(...box(0.0012, wh, D, lime, { x: sx * (W / 2 - 0.0006), z: 0 }));
  out.push(...box(W, wh, 0.0012, lime, { x: 0, z: -D / 2 + 0.0006 }));
  const gate = 0.012, side = (W - gate) / 2;
  for (const sx of [-1, 1]) out.push(...box(side, wh, 0.0012, lime, { x: sx * (gate / 2 + side / 2), z: D / 2 - 0.0006 }));
  for (const [x, z, sx, sz] of [[-W / 2 + 0.0006, 0, 1.2, D * 0.9], [W / 2 - 0.0006, 0, 1.2, D * 0.9]] as const) out.push(...box(0.0024 * sx, 0.002, sz, BOUGAINVILLEA, { x, y: wh - 0.0004, z }, 0xd8489a));
  // The screen at the back on its frame, facing the rows.
  const sw = W * 0.72, sh = Math.min(0.02, sw * 0.5), sy = 0.007, sz = -D / 2 + 0.003;
  const scr: Body = { x: 0, z: sz, w: sw, d: 0.0012, y: sy, h: sh };
  out.push(...box(sw + 0.0016, sh + 0.0016, 0.0012, 0x3a3a3a, { x: 0, y: sy - 0.0008, z: sz }), onFace(scr, 'front', 0, sy, sw, sh, 0xf6f4ee));
  for (const sx of [-1, 1]) out.push(...box(0.0012, sy, 0.0012, 0x3a3a3a, { x: sx * sw * 0.4, z: sz }));
  // The rows of chairs.
  const rows = Math.max(3, Math.floor((D * 0.5) / 0.0052)), rw = W * 0.7;
  for (let i = 0; i < rows; i++) {
    const z = sz + D * 0.28 + i * 0.0052;
    out.push(...box(rw, 0.0014, 0.0016, chair, { x: 0, z }), ...box(rw, 0.0018, 0.0004, chair, { x: 0, y: 0.0014, z: z + 0.0006 }));
  }
  // The booth at the gate: posters on its front, the name lit over it, the projection box on top.
  const bz = D / 2 - 0.0042, bb: Body = { x: -gate / 2 - 0.004, z: bz, w: 0.007, d: 0.0072, y: 0, h: 0.0115 };
  out.push(...box(bb.w, bb.h, bb.d, lime, { x: bb.x, z: bz }, 0x9a968e));
  out.push(onFace(bb, 'front', -0.0012, 0.0032, 0.0028, 0.0042, 0xd8a83a), onFace(bb, 'front', 0.0018, 0.0032, 0.0024, 0.0042, 0x3f7fb5), onFace(bb, 'right', 0, 0.002, 0.0034, 0.004, 0x2a2a2a));
  out.push(...box(0.0045, 0.0042, 0.0045, lime, { x: bb.x, y: bb.h, z: bz - 0.001 }, 0x9a968e), onFace({ ...bb, z: bz - 0.001, d: 0.0045 }, 'back', 0, bb.h + 0.0018, 0.0014, 0.001, 0x1c1c1c));
  out.push(...signBoard({ x: 0, z: D / 2, w: W, d: 0, y: 0, h: 0 }, 'front', 0, wh - 0.0004, gate + 0.004, 0.0034, 0x2a3a5a, 0xf2e6a0));
  out.push(...box(gate + 0.004, 0.0006, 0.0012, lime, { x: 0, y: wh + 0.003, z: D / 2 - 0.0006 }));
  // The canteen under its pergola against the side wall, a pot or two.
  const cx = W / 2 - 0.0062, cz = sz + D * 0.2;
  out.push(...counter(0.0024, 0.006, 0.0038, 0xf2ece0, 0x8a6a4a, { x: cx + 0.0022, z: cz }));
  for (const [x, z] of [[cx - 0.0018, cz - 0.0035], [cx + 0.0034, cz - 0.0035], [cx - 0.0018, cz + 0.0035], [cx + 0.0034, cz + 0.0035]] as const) out.push(cyl(0.0002, 0.0002, 0.008, 3, 0x6a5038, { x, z }));
  out.push(...box(0.0064, 0.0004, 0.0082, 0x5e8a44, { x: cx + 0.0008, y: 0.008, z: cz }, 0x6a9a48));
  out.push(shrub(-W / 2 + 0.003, D / 2 - 0.004, 0.0022, 0x4f8a3a), shrub(gate / 2 + 0.0035, D / 2 - 0.0035, 0.002, 0x4f8a3a));
  out.push(...tree(-W / 2 + 0.0045, -D / 2 + 0.0045, 1.1, 0x4f7a34));
  return out;
};
// The corner kafeneío and its períptero: a low block of two floors on
// pilotis, the café's glass doors folded back, tables out under the
// awnings, a balcony over; a lettered sign on a steel lattice on the roof;
// and on the pavement corner the kiosk, its roof out wide over walls hung
// with papers and magazines, a fridge of drinks beside it.
const kafeneio: Build = (l) => {
  const concrete = pick(l, PO_CONCRETE), aw = pick(l, PO_AWNING), s = storeys(l, 0.04), out: G[] = [];
  const b = { ...place(l, 0.84, 0.6, 0.012), h: s.base + s.storey * 2.1 }, front = b.z + b.d / 2, g0 = s.base + s.storey;
  out.push(...yard(l, b, 0xb8b4ac, 0xc8c4bc, b.w));
  out.push(...box(b.w, b.h, b.d, concrete, { x: b.x, z: b.z }, 0x9a968e));
  // The café: glass right across, a dark band for its name, tables before it.
  out.push(...shopWindow(b, 'front', 0, 0.0008, b.w * 0.9, g0 * 0.72, 0x8a8a84, 0x3a4a54, Math.max(3, Math.round(b.w / 0.007))));
  out.push(onFace(b, 'front', 0, g0 * 0.78, b.w * 0.9, 0.0028, 0x2a3a5a, E));
  for (const k of [-0.3, 0, 0.3]) out.push(onFace(b, 'front', k * b.w, g0 * 0.78 + 0.0009, 0.0052, 0.001, 0xf2f0e8, E * 2));
  const nt = Math.min(4, Math.max(2, Math.floor(b.w / 0.009)));
  for (let i = 0; i < nt; i++) out.push(...tableSet(b.x - b.w / 2 + (i + 0.5) * (b.w / nt), front + 0.0052, 0xf2f2ee, 0x3a6a9a, 1.3));
  out.push(...awning(b.w * 0.94, 0.0085, [aw, 0xf4f1ea], { x: b.x, y: g0 - 0.0004, z: front + 0.0004, tilt: 0.25, stripes: 8 }));
  // The floor over: a balcony slab and its rail, glass doors, an awning down.
  const y1 = g0 + 0.0002;
  out.push(...box(b.w + 0.002, 0.0008, 0.0042, concrete, { x: b.x, y: y1, z: front + 0.0021 }), onFace({ ...b, d: b.d + 0.0082 }, 'front', 0, y1 + 0.0008, b.w + 0.002, 0.0018, PO_RAIL));
  out.push(onFace(b, 'front', 0, y1 + s.storey * 0.08, b.w * 0.86, s.storey * 0.66, GLASS));
  out.push(P(new THREE.PlaneGeometry(b.w * 0.5, 0.0052).rotateX(-0.35), aw, { x: b.x - b.w * 0.2, y: y1 + s.storey * 0.62, z: front + 0.0024 }));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: 2, w: 0.0026, h: s.storey * 0.4, spacing: 0.011, sill: s.storey * 0.3, color: GLASS }));
  // The rooftop sign: a lattice of steel, the letters on it.
  const rw = b.w * 0.8, ry = b.h, rh = 0.008, rz = b.z + b.d * 0.15;
  for (const k of [-0.45, 0, 0.45]) out.push(...box(0.0004, rh, 0.0004, 0x5a5a5a, { x: b.x + k * rw, y: ry, z: rz }));
  out.push(...box(rw, 0.0004, 0.0004, 0x5a5a5a, { x: b.x, y: ry + rh * 0.45, z: rz }));
  const sb: Body = { x: b.x, z: rz, w: rw, d: 0.0004, y: ry, h: rh };
  for (let i = 0; i < 6; i++) out.push(onFace(sb, 'front', -rw * 0.42 + i * rw * 0.168, ry + rh * 0.28, rw * 0.12, rh * 0.62, [0xd83b2e, 0xf2c230, 0x3f7fb5][i % 3]!, E));
  out.push(...box(0.0042, 0.0016, 0.0018, 0xd8d8d8, { x: b.x - b.w * 0.3, y: b.h, z: b.z - b.d * 0.3 }));
  // The períptero at the corner of the pavement.
  const kx = b.x + b.w / 2 - 0.0042, kz = Math.min(l.ld - 0.0045, front + 0.0105), kb: Body = { x: kx, z: kz, w: 0.0052, d: 0.0052, y: 0, h: 0.0078 };
  out.push(...box(kb.w, kb.h, kb.d, 0x3a6a5a, { x: kx, z: kz }));
  for (const f of ['front', 'left', 'right'] as Face[]) {
    out.push(onFace(kb, f, 0, 0.0018, 0.0046, 0.0048, 0xe8e0d0, E));
    for (let i = 0; i < 6; i++) out.push(onFace(kb, f, -0.0016 + (i % 3) * 0.0016, 0.0024 + Math.floor(i / 3) * 0.0022, 0.0012, 0.0017, [0xd83b2e, 0x3f7fb5, 0xf2c230, 0x5ac95a, 0xe36aa6, 0xf2f0e8][(i + (f === 'front' ? 0 : 2)) % 6]!, E * 2));
  }
  out.push(...box(0.0088, 0.0005, 0.0088, 0x3a6a5a, { x: kx, y: kb.h, z: kz }, 0xe8e4da), ...box(0.0072, 0.0012, 0.0002, 0xd83b2e, { x: kx, y: kb.h + 0.0005, z: kz + 0.0043 }));
  out.push(...box(0.0024, 0.0058, 0.0022, 0xf2f2ee, { x: kx - 0.0046, z: kz + 0.0004 }, 0xd83b2e));
  return out;
};
// A marble works (the yards that cut Pentelic marble for every stair and
// sill in the city): an open steel shed over the gang saw, a gantry crane
// across the yard, the raw blocks under it, cut slabs leaning on their
// A-frames, a little office with its sign, a lorry loaded with a block.
const marmarades: Build = (l) => {
  const concrete = pick(l, PO_CONCRETE), steel = 0x5a6a74, marble = 0xeeece6, out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8c4bc), patch(2 * l.lw * 0.9, 2 * l.ld * 0.9, 0xd8d6d0, 0, 0, 0.0005)); // the dust
  // The shed at the back: posts and a low steel roof, the saw under it.
  const sw = 2 * l.lw * 0.86, sd = 2 * l.ld * 0.36, sh = 0.014, sz = -l.ld + 0.003 + sd / 2;
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1]] as const) out.push(...box(0.0007, sh, 0.0007, steel, { x: x * (sw / 2 - 0.0004), z: sz + z * (sd / 2 - 0.0004) }));
  out.push(...box(sw, 0.003, sd, 0x8a9aa4, { x: 0, y: sh, z: sz }, 0x8a9aa4), ...gable(sw + 0.002, sd + 0.002, 0.0035, 0x9aa8b0, { x: 0, y: sh + 0.003, z: sz }));
  out.push(onFace({ x: 0, z: sz, w: sw, d: 0, y: 0, h: 0 }, 'front', 0, sh + 0.0006, sw * 0.5, 0.0018, 0x2a5a8a, -sd / 2 + E * 4 + sd));
  out.push(...box(sw * 0.4, 0.005, sd * 0.4, 0x4a5a64, { x: -sw * 0.18, z: sz }), ...box(sw * 0.36, 0.004, sd * 0.3, marble, { x: -sw * 0.18, y: 0.005, z: sz }));
  out.push(...box(0.0012, 0.0067, sd * 0.5, 0xe8b81a, { x: -sw * 0.36, y: 0.003, z: sz }), ...box(0.0012, 0.0067, sd * 0.5, 0xe8b81a, { x: 0, y: 0.003, z: sz }));
  // The gantry crane across the yard on its legs, its hoist over a block.
  const gz = sz + sd / 2 + l.ld * 0.36, gw = sw * 0.9, gh = 0.019;
  for (const sx of [-1, 1]) out.push(...box(0.0009, gh, 0.0009, 0xe8b81a, { x: sx * gw / 2, z: gz - 0.003 }), ...box(0.0009, gh, 0.0009, 0xe8b81a, { x: sx * gw / 2, z: gz + 0.003 }), ...box(0.0012, 0.001, 0.0072, 0xe8b81a, { x: sx * gw / 2, y: gh, z: gz }));
  out.push(...box(gw + 0.0012, 0.0016, 0.0014, 0xe8b81a, { x: 0, y: gh + 0.001, z: gz }), ...box(0.0024, 0.0018, 0.0022, 0x3a3a3a, { x: gw * 0.15, y: gh - 0.0008, z: gz }));
  out.push(cyl(0.0001, 0.0001, gh - 0.0068, 3, 0x2a2a2a, { x: gw * 0.15, y: 0.0068, z: gz }));
  out.push(...box(0.008, 0.0062, 0.0055, marble, { x: gw * 0.15, z: gz }), ...box(0.0062, 0.0048, 0.0058, 0xd8d4cc, { x: -gw * 0.25, z: gz + 0.001, ry: 0.2 }));
  // Slabs leaning on A-frames.
  for (const [k, c] of [[-1, marble], [1, 0xc8c4c0]] as const) {
    const x = k * sw * 0.36, z = gz + 0.0075;
    out.push(...box(0.0006, 0.0055, 0.0068, 0x6a5a4a, { x, z }));
    for (let i = 0; i < 3; i++) out.push(...box(0.0003, 0.0058, 0.0064, c, { x: x + (0.0007 + i * 0.0004) * (i % 2 ? 1 : -1), z, rz: (i % 2 ? -1 : 1) * 0.16 }));
  }
  // The office at the gate with its sign.
  const ob: Body = { x: -sw / 2 + 0.0045, z: l.ld - 0.0045, w: 0.0075, d: 0.0065, y: 0, h: 0.0095 };
  out.push(...box(ob.w, ob.h, ob.d, concrete, { x: ob.x, z: ob.z }, 0x9a968e), onFace(ob, 'front', 0.001, 0.0032, 0.0032, 0.0036, GLASS), onFace(ob, 'right', 0, 0.0035, 0.003, 0.0032, GLASS));
  out.push(...signBoard(ob, 'front', 0, ob.h + 0.0004, 0.0085, 0.0026, 0x2a5a8a, 0xf2f0e8, 0.0012));
  out.push(...lorry(0.0135, 0x2a5a8a, 0xd8d4c8, { x: sw * 0.22, z: l.ld - 0.0055, ry: -Math.PI / 2 }, false, marble));
  return out;
};

// ---------- Modernisme (Barcelona) ----------
// Warm sandstone, chamfered corners on the Eixample grid, broken-tile
// mosaic (trencadís) in turquoise, ochre, green and red, bone-white
// balconies.
const MO_STONE = [0xe9d9b8, 0xdcc8a4, 0xe8d0c0], MO_TILES = [0x2a9db0, 0xd9a441, 0x4f8a5a, 0xb0352b], MO_BONE = 0xd9d3c4, MO_IRON = 0x2f4a40, MO_BRICK = 0xb0603e;
// A mercat (the district market halls of the 1880s): a hall of iron and
// glass behind a stone front, its gable one great fan window, the name
// over the door; the roof in bands of glazed tile in the city's colours, a
// lantern along its ridge, little mosaic-capped turrets at the corners;
// stalls out front under awnings, crates of fruit.
const mercat: Build = (l) => {
  const stone = pick(l, MO_STONE), out: G[] = [];
  const b = { ...place(l, 0.9, 0.78, 0.0095), h: l.H * 0.36 }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xc8bca4, 0xd8ccb4, b.w * 0.9));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }));
  // The sides: iron bays of glass between stone piers.
  for (const f of ['left', 'right'] as Face[]) {
    const n = Math.max(2, Math.round(b.d / 0.008));
    for (let i = 0; i < n; i++) out.push(...shopWindow(b, f, (i - (n - 1) / 2) * (b.d / n), b.h * 0.22, (b.d / n) * 0.62, b.h * 0.62, MO_IRON, 0x5a7a80, 2));
  }
  // The roof: a gable along the hall in bands of tile, a glazed lantern on its ridge.
  const rh = b.w * 0.42, nb = 6;
  for (let i = 0; i < nb; i++) out.push(...gable(b.w + 0.002, (b.d + 0.002) / nb, rh, MO_TILES[(i + l.v) % 4]!, { x: b.x, y: b.h, z: b.z - (b.d + 0.002) / 2 + ((i + 0.5) * (b.d + 0.002)) / nb }, false, stone));
  out.push(...box(0.004, 0.003, b.d * 0.8, 0x7a9aa4, { x: b.x, y: b.h + rh - 0.0012, z: b.z }, MO_IRON), ...gable(0.0056, b.d * 0.8 + 0.0008, 0.0016, MO_IRON, { x: b.x, y: b.h + rh + 0.0018, z: b.z }));
  // The front: a stone gable standing over the roof, its fan window, the arch of the door, the name.
  const fh = b.h + rh + 0.004, fz = front + 0.0012, fb: Body = { x: b.x, z: fz, w: b.w + 0.003, d: 0.0024, y: 0, h: b.h };
  out.push(...box(fb.w, b.h, fb.d, stone, { x: b.x, z: fz }), ...gable(fb.w, fb.d, fh - b.h, shade2(stone, 0.92), { x: b.x, y: b.h, z: fz }, true, stone));
  const fr = b.w * 0.34, fy = b.h - fr * 0.1;
  out.push(P(new THREE.CircleGeometry(fr + 0.0007, 9, 0, Math.PI).translate(0, fy, 0), MO_IRON, { x: b.x, z: fz + 0.0012 + FRAME }), P(new THREE.CircleGeometry(fr, 9, 0, Math.PI).translate(0, fy, 0), 0x6a9aa4, { x: b.x, z: fz + 0.0012 + E }));
  for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) out.push(P(new THREE.PlaneGeometry(0.0003, fr).translate(0, fr / 2, 0).rotateZ(a).translate(0, fy, 0), MO_IRON, { x: b.x, z: fz + 0.0012 + E * 2 }));
  out.push(onFace(fb, 'front', 0, fy - 0.0012, fb.w * 0.92, 0.0012, MO_TILES[(l.v + 1) % 4]!, BAND));
  out.push(...arch(fb, 'front', 0, 0, 0.0095, b.h * 0.5, MO_IRON, false, FRAME), ...arch(fb, 'front', 0, 0, 0.0082, b.h * 0.48, 0x3a3028, false, E));
  for (const k of [-1, 1]) out.push(...arch(fb, 'front', k * b.w * 0.32, b.h * 0.18, 0.005, b.h * 0.42, 0x5a7a80, false, E));
  out.push(...signBoard(fb, 'front', 0, fy + fr + 0.0012, b.w * 0.36, 0.0026, MO_BONE, MO_IRON, E));
  // The corner turrets, capped in mosaic.
  for (const sx of [-1, 1]) {
    const o = { x: b.x + sx * (fb.w / 2 - 0.0012), z: fz };
    out.push(cyl(0.0016, 0.0016, b.h + 0.006, 6, stone, o), cone(0.0021, 0.006, 6, MO_TILES[(l.v + 2 + (sx > 0 ? 1 : 0)) % 4]!, { ...o, y: b.h + 0.006 }));
  }
  // Stalls out front: fruit under striped awnings.
  for (const k of [-1, 1]) {
    const x = b.x + k * b.w * 0.3, z = front + 0.0062;
    out.push(...counter(b.w * 0.24, 0.0035, 0.003, 0x8a6a4a, 0x7a5a3a, { x, z }));
    for (let i = 0; i < 3; i++) out.push(...box(b.w * 0.07, 0.0006, 0.0028, [0xd88a2a, 0xb83a2a, 0x7aa83a][(i + (k > 0 ? 1 : 0)) % 3]!, { x: x + (i - 1) * b.w * 0.075, y: 0.003, z }));
    out.push(...awning(b.w * 0.26, 0.0055, [0xe8e0c8, MO_TILES[(l.v + (k > 0 ? 3 : 0)) % 4]!], { x, y: 0.0085, z: z - 0.0034, tilt: 0.3, stripes: 5 }));
    for (const px of [-1, 1]) out.push(cyl(0.0001, 0.0001, 0.007, 3, 0x5a4a3a, { x: x + px * b.w * 0.12, z: z + 0.0012 }));
  }
  return out;
};
// A modernista pastry shop and café on the chamfered corner of an
// Eixample block: the corner a glazed tribune of three floors rising to a
// mosaic-domed turret; below it the shop's whiplash front in dark green
// and gold, its name in gilt; a cream awning and tables on the wide
// corner pavement; arched windows and bone balconies over.
const pastisseria: Build = (l) => {
  const stone = pick(l, MO_STONE), tile = MO_TILES[(l.v + 1) % 4]!, green = 0x2f5a44, gold = 0xc9a24a, s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.84, 0.72, 0.0085), front = b.z + b.d / 2, gs = s.base + s.storey;
  out.push(...yard(l, b, 0xc8bca4, 0xd8ccb4, b.w));
  const cut = 0.3, k = Math.min(b.w, b.d) * cut, x1 = b.x + b.w / 2;
  out.push(...chamfered(b.w, b.h, b.d, cut, stone, { x: b.x, z: b.z }, 0xc8b8a0));
  out.push(...chamfered(b.w + 0.0008, gs + 0.0002, b.d + 0.0008, cut, green, { x: b.x, y: -0.0002, z: b.z }, green));
  const fw = b.w - 2 * k, gb: Body = { ...b, w: b.w + 0.0008, d: b.d + 0.0008 };
  // The shop front: glass in green frames, gilt name over, on both straight faces.
  out.push(...shopWindow(gb, 'front', 0, 0.0014, fw * 0.9, gs - 0.0062, gold, 0x3a4a48, 3));
  out.push(...signBoard(gb, 'front', 0, gs - 0.004, fw * 0.9, 0.0026, green, gold, E * 3));
  out.push(...shopWindow(gb, 'right', 0, 0.0014, (b.d - 2 * k) * 0.8, gs - 0.0062, gold, 0x3a4a48, 2));
  // The corner: the door; over it the tribune of glass on bone ribs; the turret.
  const c0 = [x1 - k, front] as const, c1 = [x1, front - k] as const, cl = Math.hypot(k, k);
  out.push(onLine(c0[0] + 0.0003, c0[1] + 0.0004, c1[0] + 0.0004, c1[1] + 0.0003, 0, 0, 0.0045, gs * 0.7, 0x2a2420, E * 2));
  const tx = (c0[0] + c1[0]) / 2 + 0.0012, tz = (c0[1] + c1[1]) / 2 + 0.0012, tr = cl * 0.42, th = b.h - gs;
  out.push(cyl(tr, tr, th, 8, MO_BONE, { x: tx, y: gs, z: tz, ry: Math.PI / 8 }));
  for (let f = 0; f < 3; f++) out.push(cyl(tr + 0.0002, tr + 0.0002, s.storey * 0.55, 8, 0x4a6a74, { x: tx, y: gs + f * s.storey + s.storey * 0.2, z: tz, ry: Math.PI / 8 }));
  out.push(cyl(tr + 0.0004, tr + 0.0004, 0.0042, 8, stone, { x: tx, y: b.h, z: tz, ry: Math.PI / 8 }));
  out.push(P(new THREE.SphereGeometry(tr + 0.0005, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), tile, { x: tx, y: b.h + 0.0042, z: tz, sy: 1.7 }), cone(0.0007, 0.0045, 4, gold, { x: tx, y: b.h + 0.0042 + (tr + 0.0005) * 1.6, z: tz }));
  // The floors over: arched windows and bone balconies on the front, plain ones on the side.
  const n = Math.max(1, Math.floor(fw / 0.0105));
  for (let fl = 1; fl < l.floors; fl++) for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * (fw / n), y = s.base + fl * s.storey + s.storey * 0.22;
    out.push(...arch(b, 'front', a, y, 0.003, s.storey * 0.42, GLASS), ...box(0.0048, 0.001, 0.0024, MO_BONE, { x: b.x + a, y: y - 0.0008, z: front + 0.0012 }));
  }
  out.push(...windows({ ...b, d: b.d - 2 * k }, 'right', { ...s, floors: 3, base: gs, w: 0.0028, h: s.storey * 0.42, spacing: 0.011, sill: s.storey * 0.25, color: GLASS }));
  out.push(...windows({ ...b, d: b.d - 2 * k }, 'left', { ...s, w: 0.0028, h: s.storey * 0.42, spacing: 0.011, sill: s.storey * 0.25, color: GLASS }));
  // A rippled parapet in mosaic along the front.
  const nh = Math.max(2, Math.floor(fw / 0.009)), hw = fw / nh;
  for (let i = 0; i < nh; i++) out.push(P(new THREE.CylinderGeometry(hw / 2, hw / 2, 0.0016, 6, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.9, 1), MO_TILES[(i + l.v) % 4]!, { x: b.x - fw / 2 + hw * (i + 0.5), y: b.h, z: front - 0.0012 }));
  for (const x of [-b.w * 0.28, 0]) out.push(cyl(0.0009, 0.0011, 0.004, 5, stone, { x: b.x + x, y: b.h, z: b.z - b.d * 0.25 }), P(new THREE.SphereGeometry(0.0016, 5, 3), MO_TILES[(l.v + 2) % 4]!, { x: b.x + x, y: b.h + 0.0045, z: b.z - b.d * 0.25 }));
  // The awning and the tables at the corner.
  out.push(...awning(fw * 0.9, 0.0075, [0xeee4c8], { x: b.x, y: gs - 0.0012, z: front + 0.0006, tilt: 0.3 }), valance(fw * 0.9, 0.0075, 0.0012, green, { x: b.x, y: gs - 0.0012, z: front + 0.0006, tilt: 0.3 }));
  for (const [x, z] of [[x1 - k * 0.1, front + 0.0042], [x1 + 0.0036, front - k * 0.6], [b.x - fw * 0.25, front + 0.0055]] as const) out.push(...tableSet(x, z, 0xeeeae2, 0x3a3028, 1.3));
  return out;
};
// A textile factory of the modernista industrialists (Casaramona, the
// colònies): a long hall of red brick under rows of Catalan vaults, its
// walls crenellated, two towers (one the water tank under a mosaic
// spire), the round chimney on its decorated base, the iron gate.
const fabrica: Build = (l) => {
  const stone = pick(l, MO_STONE), brick = pick(l, [MO_BRICK, 0xa8583a, 0xb86a48]), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8bca4));
  const hw = 2 * l.lw * 0.9, hd = 2 * l.ld * 0.62, hh = 0.013, hb: Body = { x: 0, z: -l.ld + 0.003 + hd / 2, w: hw, d: hd, y: 0, h: hh };
  out.push(...box(hw, hh, hd, brick, { x: 0, z: hb.z }, 0xc8a080));
  // The vaults: shallow half drums along the hall, side by side.
  const nv = Math.max(3, Math.round(hw / 0.0115)), vw = hw / nv;
  for (let i = 0; i < nv; i++) {
    const x = -hw / 2 + vw * (i + 0.5);
    out.push(P(new THREE.CylinderGeometry(vw / 2, vw / 2, hd - 0.0006, 5, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0xb87050, { x, y: hh, z: hb.z }));
    out.push(P(new THREE.CircleGeometry(vw / 2, 5, 0, Math.PI).scale(1, 0.55, 1), 0xb87050, { x, y: hh, z: hb.z + hd / 2 - 0.0003 }));
  }
  out.push(ring(hw + 0.0004, 0.0014, hd + 0.0004, stone, { x: 0, y: hh - 0.0004, z: hb.z }), ...merlonsLocal({ ...hb, w: hw + 0.0004, d: hd + 0.0004 }, hh + 0.001, 0.0014, 0.009, stone, ['front']));
  // Tall arched windows down the front, stone dressings.
  const nw = Math.min(6, Math.max(3, Math.floor(hw / 0.0075)));
  for (let i = 0; i < nw; i++) out.push(...arch(hb, 'front', (i - (nw - 1) / 2) * (hw / nw), 0.0022, 0.0034, hh * 0.5, stone, false, FRAME), ...arch(hb, 'front', (i - (nw - 1) / 2) * (hw / nw), 0.0026, 0.0024, hh * 0.47, 0x4a5a5a, false, E));
  out.push(...windows(hb, 'left', { floors: 1, base: 0, storey: hh, w: 0.003, h: hh * 0.5, spacing: 0.012, sill: hh * 0.22, color: 0x4a5a5a, frame: stone }));
  out.push(...windows(hb, 'right', { floors: 1, base: 0, storey: hh, w: 0.003, h: hh * 0.5, spacing: 0.012, sill: hh * 0.22, color: 0x4a5a5a, frame: stone }));
  // The water tower at one end: square, banded, under a spire of mosaic.
  const tw = 0.0075, tx = -hw / 2 + tw / 2 + 0.0006, tz = hb.z + hd / 2 - tw / 2 + 0.0012, th = l.H * 0.62;
  const tb: Body = { x: tx, z: tz, w: tw, d: tw, y: 0, h: th };
  out.push(...box(tw, th, tw, brick, { x: tx, z: tz }), ...box(tw + 0.0012, 0.0016, tw + 0.0012, stone, { x: tx, y: th - 0.0062, z: tz }), ...box(tw + 0.0012, 0.0013, tw + 0.0012, stone, { x: tx, y: th - 0.0012, z: tz }));
  for (const f of ['front', 'right'] as Face[]) out.push(...arch(tb, f, 0, th - 0.0052, 0.0028, 0.0026, 0x2a2a2a), ...arch(tb, f, 0, hh + 0.004, 0.0018, 0.005, 0x4a5a5a));
  out.push(spire(tw + 0.0012, 0.011, MO_TILES[(l.v + 0) % 4]!, { x: tx, y: th, z: tz }), cone(0.0004, 0.004, 4, 0xc9a24a, { x: tx, y: th + 0.0105, z: tz }));
  // The second, lower tower at the other end with its merlons.
  const ux = hw / 2 - 0.0034, uh = l.H * 0.38, ub: Body = { x: ux, z: tz, w: 0.0062, d: 0.0062, y: 0, h: uh };
  out.push(...box(ub.w, uh, ub.d, brick, { x: ux, z: tz }, 0xc8a080), ...merlonsLocal(ub, uh, 0.0012, 0.0024, stone), ...arch(ub, 'front', 0, uh - 0.008, 0.0022, 0.004, 0x4a5a5a));
  // The chimney behind, on its square base.
  const cx = hw * 0.2, cz = hb.z - hd / 2 - 0.0002;
  out.push(...box(0.0064, 0.009, 0.0064, stone, { x: cx, z: cz }), ...roundStack(0.0028, l.H * 1.2, brick, stone, { x: cx, y: 0.009, z: cz }));
  out.push(cyl(0.0031, 0.0029, 0.0014, 8, MO_TILES[(l.v + 3) % 4]!, { x: cx, y: 0.009 + l.H * 0.6, z: cz }));
  // The gate's iron railing along the street, bales and a lorry.
  out.push(...box(2 * l.lw * 0.5, 0.004, 0.0004, MO_IRON, { x: l.lw * 0.42, z: l.ld * 0.94 }));
  for (const sx of [-1, 1]) out.push(...box(0.0018, 0.0058, 0.0018, stone, { x: sx * 0.0058 - l.lw * 0.15, z: l.ld * 0.94 }));
  out.push(...sacks(5, 0.0013, 0xe8e2d4, { x: hw * 0.25, z: hb.z + hd / 2 + 0.003 }));
  out.push(...lorry(0.012, 0x7a3a2a, 0x2f5a44, { x: -hw * 0.18, z: hb.z + hd / 2 + 0.0085, ry: Math.PI / 2 }, false, 0xe8e2d4));
  return out;
};
// Merlons along the top edges of a body, the faces' corners kept (the kit's own, here for a works' parapet).
function merlonsLocal(b: Body, y: number, size: number, step: number, c: number, faces: readonly Face[] = ['front', 'back', 'left', 'right']): G[] {
  const out: G[] = [];
  for (const f of faces) {
    const fw = f === 'front' || f === 'back' ? b.w : b.d, n = Math.max(2, Math.floor(fw / step));
    for (let i = 0; i < n; i++) {
      const a = -fw / 2 + (i + 0.5) * (fw / n);
      const [x, z] = f === 'front' ? [a, b.d / 2 - size / 2] : f === 'back' ? [-a, -b.d / 2 + size / 2] : f === 'right' ? [b.w / 2 - size / 2, -a] : [-b.w / 2 + size / 2, a];
      out.push(...box(size, size, size * 0.9, c, { x: b.x + x, y, z: b.z + z }));
    }
  }
  return out;
}

// ---------- White City (Tel Aviv) ----------
// White render, ribbon windows, round corner balconies, pilotis, roof
// pergolas, ficus and citrus in the gardens.
const BA_WHITE = [0xf6f5f0, 0xf2efe6, 0xeef0ec], BA_BLUE = 0x2f6a9a, BA_ORANGE = 0xe8862a;
// A cinema of the 1930s (Tel Aviv's Esther, Mugrabi, Ophir): the blank
// white box of the hall behind; before it the lobby, its front swept round
// in curves, ribbon windows over a deep concrete canopy, posters in their
// frames below; the name down a tall fin at the corner.
const kolnoa: Build = (l) => {
  const white = pick(l, BA_WHITE), name = pick(l, [BA_BLUE, 0xb0352b, BA_BLUE]), out: G[] = [];
  const b = place(l, 0.9, 0.86, 0.0075), front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xc8c4b8, 0xd8d4c8, b.w * 0.8));
  // The hall: a blank block behind, a few vents.
  const hd = b.d * 0.58, hb: Body = { x: b.x, z: b.z - b.d / 2 + hd / 2, w: b.w * 0.94, d: hd, y: 0, h: l.H * 0.66 };
  out.push(...box(hb.w, hb.h, hd, white, { x: hb.x, z: hb.z }, 0xd8d8d0));
  for (const f of ['left', 'right'] as Face[]) for (const k of [-0.3, 0, 0.3]) out.push(onFace(hb, f, k * hd, hb.h * 0.82, 0.0022, 0.0012, 0x8a9090));
  // The lobby: a front with its corners swept round.
  const ld = b.d - hd + 0.002, lz = front - ld / 2, lh = l.H * 0.5, r = Math.min(0.0065, ld * 0.4), mid: Body = { x: b.x, z: lz, w: b.w - 2 * r, d: ld, y: 0, h: lh };
  out.push(...box(mid.w, lh, ld, white, { x: b.x, z: lz }, 0xd8d8d0));
  for (const sx of [-1, 1]) out.push(...drum(r, r, lh, 10, white, { x: b.x + sx * (b.w / 2 - r), z: front - r }, 0xd8d8d0), ...box(r, lh, ld - r, white, { x: b.x + sx * (b.w / 2 - r / 2), z: lz - r / 2 }, 0xd8d8d0));
  // Ribbon windows round it, the canopy, the doors and posters.
  for (const y of [lh * 0.5, lh * 0.74]) {
    out.push(onFace(mid, 'front', 0, y, mid.w, lh * 0.12, GLASS));
    for (const sx of [-1, 1]) out.push(cyl(r + 0.00015, r + 0.00015, lh * 0.12, 10, GLASS, { x: b.x + sx * (b.w / 2 - r), y, z: front - r }));
  }
  const cy = lh * 0.34;
  out.push(...box(b.w * 0.86, 0.0009, 0.0065, white, { x: b.x, y: cy, z: front + 0.003 }, 0xe8e8e0), ...box(b.w * 0.86, 0.0016, 0.0003, name, { x: b.x, y: cy - 0.0003, z: front + 0.0064 }));
  out.push(...shopWindow(mid, 'front', 0, 0.0008, mid.w * 0.5, cy - 0.0016, 0x8a8a84, 0x3a4a54, 4));
  for (const sx of [-1, 1]) for (const j of [0, 1]) out.push(onFace(mid, 'front', sx * (mid.w * 0.25 + 0.0019 + j * 0.0031), 0.0022, 0.0026, 0.0042, [0xd8a83a, 0xb0352b, 0x3f7fb5, 0x4f8a5a][j + (sx > 0 ? 2 : 0)]!, E * 2));
  // The fin with the name down it, letter by letter.
  const fx = b.x - b.w / 2 + r * 0.9, fh = lh + 0.012, fz = front - r * 0.3;
  out.push(...box(0.0014, fh, 0.0082, white, { x: fx, y: 0.006, z: fz + 0.001 }, 0xe8e8e0));
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.0052, 0.0034), name, { x: fx + sx * (0.0007 + E), y: 0.006 + fh - 0.0035 - i * 0.0046, z: fz + 0.001, ry: Math.PI / 2 }));
  out.push(...signBoard(mid, 'front', mid.w * 0.08, cy + 0.0012, mid.w * 0.66, 0.0036, 0xf2f0e8, name, E * 2));
  out.push(ring(mid.w + 0.0004, 0.0012, ld + 0.0004, white, { x: b.x, y: lh, z: lz }));
  return out;
};
// A corner shop row and its boulevard kiosk (the kiosks of Rothschild
// and Ben Gurion boulevards, a soda and a newspaper under the ficus): two
// floors in white, shops below a long concrete canopy, rolled canvas over
// the balconies above; on the lot's corner the round kiosk under its flat
// disc of a roof, stools at its counter, tables under the trees.
const kiosk: Build = (l) => {
  const white = pick(l, BA_WHITE), canvas = pick(l, [0x3a7a9a, 0xd9a441, 0x4f8a5a]), s = storeys(l, 0.04), out: G[] = [];
  const b = { ...place(l, 0.8, 0.58, 0.0135), h: s.base + s.storey * 2.05 }, front = b.z + b.d / 2, g0 = s.base + s.storey;
  out.push(...yard(l, b, 0x8aa060, 0xd8d4c8, b.w));
  out.push(patch(b.w + 0.002, l.ld - front, 0xd8d4c8, b.x, front + (l.ld - front) / 2, 0.0006));
  out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }, 0xd8d8d0));
  // The shops: three glass fronts, a canopy along them.
  const n = Math.max(2, Math.round(b.w / 0.011));
  for (let i = 0; i < n; i++) out.push(...shopWindow(b, 'front', (i - (n - 1) / 2) * (b.w / n), 0.0008, (b.w / n) * 0.78, g0 * 0.66, 0x8a8a84, 0x3a4a54, 2));
  out.push(...box(b.w + 0.0016, 0.0008, 0.0058, white, { x: b.x, y: g0 * 0.78, z: front + 0.0029 }, 0xe8e8e0), ...box(b.w + 0.0019, 0.0012, 0.0003, canvas, { x: b.x, y: g0 * 0.78 - 0.0002, z: front + 0.0059 }));
  // The floor over: a balcony along, its solid parapet, the canvas rolled down, ribbon windows at the sides.
  out.push(...box(b.w + 0.0006, 0.0028, 0.0032, white, { x: b.x, y: g0, z: front + 0.0016 }, 0xd8d8d0));
  out.push(onFace(b, 'front', 0, g0 + s.storey * 0.25, b.w * 0.9, s.storey * 0.5, GLASS));
  for (const k of [-0.25, 0.25]) out.push(...awning(b.w * 0.44, 0.0058, [canvas, 0xf4f1ea], { x: b.x + k * b.w, y: g0 + s.storey * 0.82, z: front + 0.0004, tilt: 0.75, stripes: 6 }));
  for (const f of ['left', 'right'] as Face[]) out.push(onFace(b, f, 0, g0 + s.storey * 0.35, b.d * 0.7, s.storey * 0.3, GLASS));
  out.push(ring(b.w + 0.0004, 0.0012, b.d + 0.0004, white, { x: b.x, y: b.h, z: b.z }));
  // The kiosk, round, a disc of a roof and its fascia, a counter round it, stools.
  const kx = b.x + b.w / 2 - 0.004, kz = Math.min(l.ld - 0.005, front + 0.0105), kr = 0.0028;
  out.push(...drum(kr, kr, 0.0064, 8, 0x5a8aa8, { x: kx, z: kz }, 0x5a8aa8), cyl(kr + 0.00012, kr + 0.00012, 0.0024, 8, 0xe8e0c8, { x: kx, y: 0.0028, z: kz }));
  out.push(...drum(kr + 0.0024, kr + 0.0024, 0.0007, 10, white, { x: kx, y: 0.0064, z: kz }, canvas), cyl(kr + 0.0025, kr + 0.0025, 0.0004, 10, canvas, { x: kx, y: 0.0064, z: kz }));
  out.push(cyl(kr + 0.0006, kr + 0.0006, 0.0004, 8, 0x8a6a4a, { x: kx, y: 0.0026, z: kz }));
  for (const a of [0.6, 1.6, 2.6]) out.push(cyl(0.0004, 0.0004, 0.0018, 4, 0x3a3a3a, { x: kx + Math.cos(a) * (kr + 0.0016), z: kz + Math.sin(a) * (kr + 0.0016) }));
  out.push(...tableSet(b.x - b.w * 0.2, front + 0.0085, 0xf2f2ee, 0x3a6a9a, 1.3));
  out.push(...tree(b.x - b.w / 2 + 0.002, Math.min(l.ld - 0.004, front + 0.008), 1.15, 0x3f6a34));
  return out;
};
// A citrus packing house (the Jaffa orange's, 1930s): a long white shed
// with its ribbon of clerestory windows, the loading dock under a
// cantilevered slab, wooden crates of oranges stacked on it and loaded on
// the lorry; the round water tower on its legs, as every settlement and
// works built one.
const packingHouse: Build = (l) => {
  const white = pick(l, BA_WHITE), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8c0a8));
  const hw = 2 * l.lw * 0.66, hd = 2 * l.ld * 0.58, hh = 0.0145, hb: Body = { x: l.lw - 0.003 - hw / 2, z: -l.ld + 0.003 + hd / 2, w: hw, d: hd, y: 0, h: hh };
  out.push(...box(hw, hh, hd, white, { x: hb.x, z: hb.z }, 0xd8d8d0));
  out.push(...gable(hw + 0.0012, hd + 0.0012, 0.0035, 0xb8b4a8, { x: hb.x, y: hh, z: hb.z }, true, white));
  for (const f of ['left', 'right'] as Face[]) out.push(onFace(hb, f, 0, hh * 0.68, hd * 0.86, hh * 0.18, GLASS));
  out.push(onFace(hb, 'front', 0, hh * 0.68, hw * 0.8, hh * 0.16, GLASS));
  // The dock: a raised platform along the front, its canopy, doors behind.
  const dz = hb.z + hd / 2 + 0.0028;
  out.push(...box(hw * 0.92, 0.0028, 0.0056, 0xc8c4b8, { x: hb.x, z: dz }, 0xd8d4c8), ...box(hw * 0.98, 0.0007, 0.0075, white, { x: hb.x, y: hh * 0.6, z: hb.z + hd / 2 + 0.0037 }, 0xe8e8e0));
  for (const k of [-0.25, 0.25]) out.push(onFace(hb, 'front', k * hw, 0.0028, hw * 0.2, hh * 0.4, 0x5a4a3a));
  // Crates of oranges on the dock and by it.
  const crate = (x: number, y: number, z: number): G[] => [...box(0.0026, 0.0018, 0.0018, 0xb89060, { x, y, z }, BA_ORANGE)];
  for (let i = 0; i < 5; i++) out.push(...crate(hb.x - hw * 0.35 + i * 0.0032, 0.0028 + (i % 2) * 0.0018, dz - 0.0006));
  for (let i = 0; i < 4; i++) out.push(...crate(hb.x + hw * 0.2 + (i % 2) * 0.003, 0.0028 + Math.floor(i / 2) * 0.0018, dz));
  // The lorry backed to the dock, loaded.
  out.push(...lorry(0.0125, 0x4f7a9a, 0xd8d4c8, { x: hb.x + hw * 0.05, z: dz + 0.0068, ry: Math.PI / 2 }, false, BA_ORANGE));
  // The water tower: a drum on four legs, a ribbon window round its tank.
  const tx = -l.lw + 0.0065, tz = -l.ld * 0.15, th = l.H * 0.62, tr = 0.0048;
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0009, th, 0.0009, white, { x: tx + x * tr * 0.55, z: tz + z * tr * 0.55 }));
  out.push(...drum(0.0014, 0.0014, th, 6, white, { x: tx, z: tz }));
  out.push(...drum(tr, tr, 0.0085, 10, white, { x: tx, y: th, z: tz }, 0xd8d8d0), cyl(tr + 0.00015, tr + 0.00015, 0.0012, 10, GLASS, { x: tx, y: th + 0.0055, z: tz }));
  out.push(...drum(tr + 0.0007, tr + 0.0007, 0.0006, 10, white, { x: tx, y: th + 0.0085, z: tz }, 0xe8e8e0));
  // Orange trees along the street.
  for (const x of [-l.lw * 0.6, -l.lw * 0.2]) out.push(...tree(x, l.ld - 0.004, 0.75, 0x3f6a34), P(new THREE.OctahedronGeometry(0.0006, 0), BA_ORANGE, { x: x + 0.0018, y: 0.0062, z: l.ld - 0.0025 }));
  return out;
};

// ---------- Shikumen (Shanghai) ----------
// Grey brick laced with red brick bands, stone-framed gates with carved
// pediments, black lacquered doors, grey tile roofs between stepped
// party walls.
const SH_BRICK = [0x8d8f8c, 0x858882, 0x96938c], SH_RED = 0xa6463a, SH_STONE = 0xd9d1c0, SH_TILE = 0x3f3a36, SH_WOOD = 0x5a3424;
// A pair of hanging shop signs: long boards down beside a door, lettered in gold.
const longSign = (x: number, y: number, z: number, h: number, board: number, ink: number): G[] => {
  const out: G[] = [...box(0.0016, h, 0.0003, board, { x, y, z })];
  for (let i = 0; i < 4; i++) out.push(...box(0.001, h * 0.13, 0.0002, ink, { x, y: y + h * (0.12 + i * 0.21), z: z + 0.00025 }));
  return out;
};
// The lane-mouth shops: where a lilong meets the street, a row of shops
// (a tea merchant, a tailor, a noodle stall) either side of the lane's own
// gateway: a tall stone arch with its carved pediment and the lane's name.
// The shops' fronts are folding boards stood open, long signs hung beside
// them, cloth awnings over; the shopkeepers live over, laundry out on
// bamboo poles.
const laneShops: Build = (l) => {
  const brick = pick(l, SH_BRICK), s = storeys(l, 0.08), out: G[] = [];
  const b = { ...place(l, 0.96, 0.62, 0.006), h: s.base + s.storey * 2.1 }, front = b.z + b.d / 2, gs = s.base + s.storey;
  out.push(...yard(l, b, 0x9a948a, 0xa8a298, 0.009));
  // The row, split by the lane's passage in the middle.
  const gw = 0.0105, sw = (b.w - gw) / 2;
  for (const sx of [-1, 1]) {
    const x = b.x + sx * (gw / 2 + sw / 2), rb: Body = { x, z: b.z, w: sw, d: b.d, y: 0, h: b.h };
    out.push(...box(sw, b.h, b.d, brick, { x, z: b.z }), ...bands(rb, [gs], 0.0012, SH_RED));
    out.push(...gable(sw + 0.002, b.d + 0.003, b.d * 0.24, SH_TILE, { x, y: b.h, z: b.z }, false, brick));
    // A shop front or two: the boards open, dark within, a counter, the awning.
    const n = Math.max(1, Math.round(sw / 0.011)), bw = sw / n;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * bw, c = [0xb0352b, 0x2a5a8a, 0x3a6a3a, 0xd8a83a][(i + (sx > 0 ? 1 : 0) + l.v) % 4]!;
      out.push(onFace(rb, 'front', a, 0.0008, bw * 0.84, gs * 0.72, 0x2a2018, E), onFace(rb, 'front', a, 0.0008, bw * 0.84, gs * 0.18, SH_WOOD, E * 2));
      for (const k of [-1, 1]) out.push(onFace(rb, 'front', a + k * bw * 0.36, 0.0008, bw * 0.1, gs * 0.72, 0x7a5232, E * 3));
      out.push(...awning(bw * 0.86, 0.0055, [c], { x: x + a, y: gs * 0.84, z: front + 0.0003, tilt: 0.35 }));
      out.push(...longSign(x + a - sx * bw * 0.46, gs * 0.12, front + 0.0012, gs * 0.6, i % 2 ? 0x1c1c1c : SH_RED, 0xd8b04a));
    }
    out.push(...windows(rb, 'front', { ...s, floors: 1, base: gs, w: 0.0028, h: s.storey * 0.42, spacing: 0.0075, sill: s.storey * 0.25, color: GLASS, frame: SH_STONE }));
    out.push(...windows(rb, sx > 0 ? 'right' : 'left', { ...s, floors: 2, w: 0.0026, h: s.storey * 0.4, spacing: 0.0085, sill: s.storey * 0.3, color: GLASS }));
    // Laundry on a bamboo pole out of an upper window.
    const ly = gs + s.storey * 0.75;
    out.push(cyl(0.0001, 0.0001, sw * 0.8, 3, 0xc8b878, { x: x + sw * 0.4, y: ly, z: front + 0.0028, rz: Math.PI / 2 }));
    for (let i = 0; i < 3; i++) out.push(P(new THREE.PlaneGeometry(0.0022, 0.0034), [0xe8e4dc, 0x6a8ab0, 0xc85a5a][(i + l.v) % 3]!, { x: x - sw * 0.25 + i * sw * 0.25, y: ly - 0.0018, z: front + 0.0028 }));
  }
  // The lane's gate: stone piers and arch standing up over the row, the pediment, the name, a black iron gate.
  const gb: Body = { x: b.x, z: front - 0.0009, w: gw + 0.002, d: 0.0024, y: 0, h: b.h + 0.004 };
  out.push(...box(gb.w, gb.h, gb.d, SH_STONE, { x: b.x, z: gb.z }, SH_STONE));
  out.push(...arch(gb, 'front', 0, 0, gw * 0.62, gs * 0.95, 0x2a2622));
  out.push(...pediment(gb.w + 0.0012, 0.005, SH_STONE, SH_TILE, { x: b.x, y: gb.h, z: gb.z }));
  out.push(onFace(gb, 'front', 0, gs + 0.0035, gw * 0.62, 0.0036, SH_RED, E), onFace(gb, 'front', 0, gs + 0.0042, gw * 0.4, 0.0022, 0xd8b04a, E * 2));
  out.push(...strips({ ...gb, w: gw * 0.62 }, 'front', 0, gs * 0.6, 0.0003, 0.0012, 0x1c1c1c, E * 2));
  return out;
};
// A pawnshop (dangpu): a fortress of a building, its high street wall
// whitewashed and blind save for one narrow door, the one great character
// for pawn painted on it in black; within, the counter higher than a
// man; tile roof between stepped party walls, red lanterns at the door.
const dangpu: Build = (l) => {
  const brick = pick(l, SH_BRICK), lime = 0xece8de, ink = 0x1a1a1a, s = storeys(l, 0.08), out: G[] = [];
  const b = { ...place(l, 0.86, 0.66, 0.006), h: s.base + s.storey * 2.6 }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x9a948a, 0xa8a298, 0.006));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
  // The street wall: a skin of lime over the front, a grey plinth, a coping of tile.
  const wb: Body = { x: b.x, z: b.z + 0.0004, w: b.w + 0.0006, d: b.d + 0.0002, y: 0, h: b.h };
  out.push(onFace(wb, 'front', 0, 0.0035, wb.w, b.h - 0.0035, lime, BAND), onFace(wb, 'front', 0, 0, wb.w, 0.0035, 0x6a6a68, BAND));
  out.push(...box(b.w + 0.0024, 0.0012, 0.004, SH_TILE, { x: b.x, y: b.h, z: front }));
  // The character, in strokes: three short ones over a frame of three bars and its right side.
  const cw = Math.min(b.w * 0.62, b.h * 0.5), cy = b.h * 0.3, st = cw * 0.11, at = (a: number, y: number, w: number, h: number, ang = 0) => {
    const g = new THREE.PlaneGeometry(w, h).rotateZ(ang).translate(a, y, 0);
    return P(g, ink, { x: b.x, z: front + 0.0004 + E });
  };
  out.push(at(0, cy + cw * 0.92, st, cw * 0.32), at(-cw * 0.3, cy + cw * 0.92, st, cw * 0.28, 0.5), at(cw * 0.3, cy + cw * 0.92, st, cw * 0.28, -0.5));
  for (const y of [0.66, 0.36, 0.04]) out.push(at(0, cy + cw * y, cw * 0.86, st));
  out.push(at(cw * 0.38, cy + cw * 0.35, st, cw * 0.73));
  // A ring round the character, as painted on such walls: a thin frame.
  for (const [a, y, w, h] of [[0, cy + cw * 1.15, cw * 1.2, 0.0005], [0, cy - cw * 0.12, cw * 1.2, 0.0005], [-cw * 0.6, cy + cw * 0.51, 0.0005, cw * 1.27], [cw * 0.6, cy + cw * 0.51, 0.0005, cw * 1.27]] as const) out.push(at(a, y, w, h));
  // The narrow door, its stone frame, the lanterns either side.
  const dx = -b.w * 0.36;
  out.push(onFace(wb, 'front', dx, 0, 0.0058, 0.0115, SH_STONE, E), onFace(wb, 'front', dx, 0, 0.004, 0.0105, 0x1d1d1d, E * 2));
  for (const k of [-1, 1]) out.push(...lantern(0.0011, 0xd8322a, { x: b.x + dx + k * 0.0042, y: 0.0098, z: front + 0.0018 }));
  out.push(...longSign(b.x + dx + 0.0054, 0.003, front + 0.0012, 0.009, SH_RED, 0xd8b04a));
  // Small barred windows high on the sides, the roof and its stepped walls.
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: 1, base: b.h - s.storey * 0.9, w: 0.0022, h: 0.0028, spacing: 0.0085, sill: 0, color: 0x2a2622 }));
  const rh = Math.min(b.w, b.d) * 0.26;
  out.push(...gable(b.w + 0.002, b.d + 0.003, rh, SH_TILE, { x: b.x, y: b.h, z: b.z }, false, brick));
  for (const sx of [-1, 1]) {
    const x = b.x + sx * (b.w / 2 - 0.0006);
    out.push(...box(0.0012, rh + 0.003, b.d * 0.4, brick, { x, y: b.h, z: b.z }, 0x2e2a28), ...box(0.0012, rh * 0.6 + 0.0015, b.d * 0.84, brick, { x, y: b.h, z: b.z }, 0x2e2a28));
  }
  return out;
};
// A soy sauce brewery (a jiangyuan): the courtyard filled with rows of
// great glazed jars where the soy ferments in the sun, each under its
// pointed bamboo hat against the rain; behind, the brewing hall of grey
// brick and tile with its chimney, the cooking shed; a handcart of jars.
const jiangyuan: Build = (l) => {
  const brick = pick(l, SH_BRICK), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a948a), patch(2 * l.lw * 0.92, l.ld * 1.1, 0xb0aa9e, 0, l.ld * 0.36, 0.0005));
  // The hall at the back.
  const hw = 2 * l.lw * 0.92, hd = Math.min(0.016, l.ld * 0.7), hh = 0.0145, hb: Body = { x: 0, z: -l.ld + 0.003 + hd / 2, w: hw, d: hd, y: 0, h: hh };
  out.push(...box(hw, hh, hd, brick, { x: 0, z: hb.z }), ...bands(hb, [hh * 0.62], 0.0012, SH_RED));
  out.push(...gable(hw + 0.002, hd + 0.003, hd * 0.3, SH_TILE, { x: 0, y: hh, z: hb.z }, false, brick));
  out.push(...windows(hb, 'front', { floors: 1, base: 0, storey: hh, w: 0.003, h: hh * 0.25, spacing: 0.0075, sill: hh * 0.68, color: 0x2a2622, frame: SH_STONE }));
  out.push(...doubleDoor(hb, 'front', -hw * 0.2, 0.0062, hh * 0.52, 0x1d1d1d, SH_STONE));
  out.push(...signBoard(hb, 'front', hw * 0.15, hh * 0.3, hw * 0.3, 0.0028, 0x1c1c1c, 0xd8b04a));
  out.push(...stack(0.0034, l.H * 0.62, brick, 0x2e2a28, { x: hw * 0.36, z: hb.z - hd * 0.1 }));
  // The jars in their rows, hats on.
  const zf = hb.z + hd / 2 + 0.0042, rows = Math.max(2, Math.min(4, Math.floor((l.ld - 0.002 - zf + l.ld) / 0.0056))), cols = Math.max(3, Math.min(6, Math.floor((hw - 0.004) / 0.0058)));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (r === rows - 1 && c === cols - 1) continue;
    const x = -hw / 2 + 0.004 + c * ((hw - 0.008) / (cols - 1)), z = zf + r * 0.0056;
    out.push(cyl(0.0021, 0.0017, 0.0032, 6, 0x4a2c1c, { x, z }), cone(0.0026, 0.0026, 6, 0xc8a868, { x, y: 0.0032, z }));
  }
  out.push(...cart(0.0062, 0x7a5a3a, 0x3a3028, { x: hw / 2 - 0.004, z: zf + (rows - 1) * 0.0056 + 0.0004, ry: Math.PI / 2 }));
  return out;
};

// ---------- Signboard buildings (Tokyo) ----------
// Narrow buildings in tile, render and steel, shoulder to shoulder, hung
// with vertical signs in red, yellow, cyan, pink and green; air
// conditioners on the walls, tanks on the roofs.
const ZA_FRONTS = [0xc9cfd4, 0xe2d8c4, 0xa9b4bd, 0xd9d4cc, 0xb8bcc0], ZA_SIGNS = [0xd83b2e, 0xf2c230, 0x2fa6c9, 0xe36aa6, 0x5ac95a];
// A vertical sign: a box out from a wall edge-on to the street, a panel of letters down each face.
function vSign(x: number, y: number, z: number, h: number, board: number, ink: number, n = 4): G[] {
  const out: G[] = [...box(0.0012, h, 0.0034, board, { x, y, z })];
  for (let i = 0; i < n; i++) for (const sx of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.0022, (h / n) * 0.62), ink, { x: x + sx * (0.0006 + E), y: y + h - (i + 0.5) * (h / n), z, ry: Math.PI / 2 }));
  return out;
}
// A pachinko parlour: a wide hall of two tall floors, its whole front a
// screen of red and gold, rows of bulbs, the glass doors; the name up a
// sign tower on the roof; the wreaths of paper flowers on easels that
// mark a grand opening, bicycles parked along the kerb.
const pachinko: Build = (l) => {
  const front0 = pick(l, ZA_FRONTS), red = pick(l, [0xf0a020, 0x2fa6c9, 0x8a4ad0]), gold = 0xf8e070, out: G[] = [];
  const b = { ...place(l, 0.96, 0.82, 0.0075), h: l.H * 0.5 }, front = b.z + b.d / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a9690));
  out.push(...box(b.w, b.h, b.d, front0, { x: b.x, z: b.z }, shade2(front0, 0.8)));
  // The screen: a panel standing proud of the front, higher than the roof, gold bands, bulbs.
  const sb: Body = { x: b.x, z: front + 0.0008, w: b.w + 0.0006, d: 0.0016, y: 0, h: b.h + 0.005 };
  out.push(...box(sb.w, sb.h - 0.0075, sb.d, red, { x: b.x, y: 0.0075, z: sb.z }, red));
  for (const y of [0.0095, sb.h - 0.004]) out.push(onFace(sb, 'front', 0, y, sb.w * 0.96, 0.0016, gold, E));
  const nb = Math.max(4, Math.floor(b.w / 0.0042));
  for (let i = 0; i < nb; i++) for (const y of [0.0128, sb.h - 0.0062]) out.push(disc(sb, 'front', -sb.w * 0.45 + i * (sb.w * 0.9) / (nb - 1), y, 0.0005, 0xfff4c0, E * 2));
  out.push(...signBoard(sb, 'front', 0, sb.h * 0.42, sb.w * 0.8, sb.h * 0.28, gold, 0xd83b2e, E));
  // The doors: glass under a canopy.
  out.push(...shopWindow(b, 'front', 0, 0.0004, b.w * 0.56, 0.0062, 0xb8b8b8, 0x3a4a54, 4, E * 2 + 0.0016), ...box(b.w * 0.7, 0.0006, 0.0038, 0xe8e8e8, { x: b.x, y: 0.0068, z: front + 0.0035 }));
  // The tower on the roof with the name down it, lit.
  const tx = b.x + b.w * 0.32, th = 0.022;
  out.push(...box(0.003, th, 0.0048, 0xe8e8e8, { x: tx, y: b.h, z: b.z + b.d * 0.3 }));
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) out.push(P(new THREE.PlaneGeometry(0.0038, 0.0042), ZA_SIGNS[(i + l.v) % 5]!, { x: tx + sx * (0.0015 + E), y: b.h + th - 0.0032 - i * 0.0052, z: b.z + b.d * 0.3, ry: Math.PI / 2 }));
  out.push(...box(0.003, 0.0018, 0.0028, 0xe0e0e0, { x: b.x - b.w * 0.3, y: b.h, z: b.z - b.d * 0.2 }), ...box(0.003, 0.0018, 0.0028, 0xe0e0e0, { x: b.x - b.w * 0.1, y: b.h, z: b.z - b.d * 0.2 }));
  // Opening wreaths on their easels, bicycles.
  for (const k of [-0.42, 0.42]) {
    const x = b.x + k * b.w, z = front + 0.0045;
    out.push(cyl(0.0001, 0.0001, 0.006, 3, 0x3a3a3a, { x, z }), P(new THREE.CircleGeometry(0.0022, 8), ZA_SIGNS[(k > 0 ? 3 : 1)]!, { x, y: 0.0068, z: z + 0.0002 }), P(new THREE.CircleGeometry(0.0012, 6), 0xf6f4ee, { x, y: 0.0068, z: z + 0.0002 + E }));
  }
  for (let i = 0; i < 4; i++) out.push(...box(0.0003, 0.0018, 0.003, [0x3a6a9a, 0xb0352b, 0x8a8a8a, 0x3a3a3a][i]!, { x: b.x - b.w * 0.2 + i * 0.0018, y: 0.0002, z: Math.min(l.ld - 0.002, front + 0.0062) }));
  return out;
};
// An izakaya and its bar building: on one side a low timber house of two
// floors, a tiled eave over its sliding door, the indigo noren hung in it,
// red paper lanterns, beer crates stacked by the wall; on the other a
// slender zakkyo of five floors, a snack bar on each, its signs stacked
// all the way up; a row of vending machines glowing at the kerb.
const izakaya: Build = (l) => {
  const timber = 0x4a3426, front0 = pick(l, ZA_FRONTS), s = storeys(l, 0.05), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a9690));
  const W = 2 * l.lw * 0.96, d = 2 * l.ld * 0.7, z = l.ld - 0.0055 - d / 2, front = z + d / 2;
  // The izakaya.
  const iw = W * 0.58, ix = -W / 2 + iw / 2, ih = s.base + s.storey * 1.8, ib: Body = { x: ix, z, w: iw, d, y: 0, h: ih };
  out.push(...box(iw, ih, d, timber, { x: ix, z }));
  out.push(...strips(ib, 'front', s.storey * 0.9, ih - s.storey * 0.9, 0.0005, 0.0026, 0x6a4a34, E));
  out.push(onFace(ib, 'front', 0, 0.0004, iw * 0.7, s.storey * 0.7, 0xe8dcc0, E), ...strips({ ...ib, w: iw * 0.7 }, 'front', 0.0004, s.storey * 0.7, 0.0003, 0.0022, timber, E * 2));
  out.push(onFace(ib, 'front', -iw * 0.15, s.storey * 0.4, 0.0056, s.storey * 0.32, 0x2a3a6a, E * 3));
  out.push(...leanEave(iw + 0.001, 0.0048, s.storey * 0.92, 0x3a3a3e, { x: ix, z: front }));
  out.push(...gable(iw + 0.0016, d + 0.002, d * 0.18, 0x3a3a3e, { x: ix, y: ih, z }, false, timber));
  out.push(onFace(ib, 'front', 0, s.storey * 1.15, iw * 0.6, s.storey * 0.4, 0xe8dcc0, BAND));
  for (const k of [-0.42, 0.18]) out.push(...lantern(0.0013, 0xd83b2e, { x: ix + k * iw, y: s.storey * 0.62, z: front + 0.0022 }));
  out.push(...crates(4, 0.0022, 0xd8a83a, { x: ix + iw * 0.36, z: front + 0.0022 }));
  // The bar building: tall and thin, glass bands, a sign box per floor stacked up its edge.
  const bw = W - iw - 0.0004, bx = W / 2 - bw / 2, bh = l.H * 1.08, bb: Body = { x: bx, z, w: bw, d, y: 0, h: bh };
  out.push(...box(bw, bh, d, front0, { x: bx, z }, shade2(front0, 0.8)));
  const fl = 5, fh = bh / fl;
  for (let f = 1; f < fl; f++) out.push(onFace(bb, 'front', bw * 0.12, f * fh + fh * 0.25, bw * 0.6, fh * 0.45, GLASS));
  out.push(onFace(bb, 'front', bw * 0.12, 0, bw * 0.5, fh * 0.75, 0x3a4a54));
  for (let f = 0; f < fl; f++) out.push(...box(0.0014, fh * 0.8, 0.004, ZA_SIGNS[(f + l.v) % 5]!, { x: bx - bw / 2 + 0.0012, y: f * fh + fh * 0.1, z: front + 0.002 }, 0xf6f4ee));
  for (let f = 0; f < fl; f++) for (const sx of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.0026, fh * 0.42), 0xf6f4ee, { x: bx - bw / 2 + 0.0012 + sx * (0.0007 + E), y: f * fh + fh * 0.5, z: front + 0.002, ry: Math.PI / 2 }));
  for (const f of [1, 3]) out.push(...box(0.0028, 0.0018, 0.0016, 0xe0e0e0, { x: bx + bw * 0.3, y: f * fh + fh * 0.1, z: front + 0.0008 }));
  out.push(...drum(0.0018, 0.0018, 0.003, 6, 0x8a9aa8, { x: bx, y: bh, z: z - d * 0.2 }));
  // The vending machines at the kerb.
  for (let i = 0; i < 3; i++) {
    const vx = ix - iw / 2 + 0.002 + i * 0.0026, vb: Body = { x: vx, z: front + 0.0028, w: 0.0024, d: 0.0018, y: 0, h: 0.0055 };
    out.push(...box(vb.w, vb.h, vb.d, [0xf2f2ee, 0xd83b2e, 0x2f6aa6][i]!, { x: vx, z: vb.z }), onFace(vb, 'front', 0, 0.0028, 0.0018, 0.0022, 0xf8f0d0), onFace(vb, 'front', 0, 0.0008, 0.0016, 0.0008, 0x2a2a2a));
  }
  return out;
};
// A pent eave: a short tiled roof along a front, sloping out (on brackets).
function leanEave(w: number, d: number, y: number, c: number, o: { x: number; z: number }): G[] {
  const g = new THREE.BufferGeometry(), x = w / 2;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-x, d * 0.5, 0, -x, 0, d, x, 0, d, -x, d * 0.5, 0, x, 0, d, x, d * 0.5, 0], 3));
  return [P(g, c, { x: o.x, y, z: o.z })];
}
// A machi kōba (the small family works of Ōta and Higashi-Ōsaka): two
// floors of corrugated steel, a sawtooth roof over the shop floor, the
// shutter rolled up on the lathes inside; a rack of bar stock, gas
// bottles, the office up an outside stair, the name down a sign; the
// little white kei truck.
const machiKoba: Build = (l) => {
  const steel = pick(l, [0x8a9aa4, 0x9aa49a, 0xa8a4a0]), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a9690));
  const b = { ...place(l, 0.86, 0.8, 0.008), h: l.H * 0.3 }, front = b.z + b.d / 2;
  out.push(...box(b.w, b.h, b.d, steel, { x: b.x, z: b.z }, shade2(steel, 0.8)), ...strips(b, 'left', 0, b.h, 0.0003, 0.0012, shade2(steel, 0.88)), ...strips(b, 'right', 0, b.h, 0.0003, 0.0012, shade2(steel, 0.88)));
  out.push(...sawtooth(b.w - 0.0115, b.d, Math.max(2, Math.round(b.d / 0.008)), 0.0045, 0x7a8890, 0x9ab4c4, { x: b.x - 0.00575, y: b.h, z: b.z, ry: Math.PI }));
  // The shutter rolled up: the shop floor dark, the lathes' shapes in it, the roll over.
  const sw = b.w * 0.55, sx = b.x - b.w * 0.15;
  out.push(onFace(b, 'front', sx - b.x, 0, sw, b.h * 0.72, 0x2a2a2e, E), onFace(b, 'front', sx - b.x, b.h * 0.72, sw, 0.0012, 0x6a7a84, E));
  for (const k of [-0.25, 0.2]) out.push(...box(0.0045, 0.0034, 0.0022, 0x4a7a6a, { x: sx + k * sw, z: front - 0.003 }));
  // The office on the floor above at one end, its stair, its window, the sign.
  const ob: Body = { x: b.x + b.w / 2 - 0.00575, z: b.z - b.d * 0.04, w: 0.0115, d: b.d * 0.92, y: b.h, h: 0.009 };
  out.push(...box(ob.w, ob.h, ob.d, 0xd8d4cc, { x: ob.x, y: b.h, z: ob.z }, 0x8a8680), onFace(ob, 'front', 0, b.h + 0.0025, ob.w * 0.7, 0.004, GLASS));
  for (let i = 0; i < 5; i++) out.push(...box(0.0024, 0.0003, 0.0012, 0x5a5a5a, { x: b.x + b.w / 2 - 0.006 - i * 0.0018, y: (i + 1) * b.h / 5, z: front + 0.0008 }));
  out.push(...vSign(b.x + b.w / 2 - 0.0008, 0.004, front + 0.0018, b.h * 0.8, 0xf2f2ee, 0x2a5a9a, 4));
  // Bar stock on a rack, gas bottles, the kei truck.
  out.push(...box(0.0007, 0.004, 0.0007, 0x3a3a3a, { x: b.x - b.w / 2 + 0.002, z: front + 0.003 }), ...box(0.0007, 0.004, 0.0007, 0x3a3a3a, { x: b.x - b.w / 2 + 0.0085, z: front + 0.003 }));
  for (let i = 0; i < 4; i++) out.push(cyl(0.0003, 0.0003, 0.008, 4, 0x8a8a8a, { x: b.x - b.w / 2 + 0.0092, y: 0.0016 + i * 0.0007, z: front + 0.0032, rz: Math.PI / 2 }));
  for (const k of [0, 0.0014]) out.push(cyl(0.0006, 0.0006, 0.004, 5, 0x3a6a4a, { x: sx + sw * 0.5 + 0.002 + k, z: front + 0.0012 }));
  out.push(...lorry(0.0095, 0xf2f2ee, 0xf2f2ee, { x: b.x + b.w * 0.05, z: Math.min(l.ld - 0.0032, front + 0.0058), ry: Math.PI / 2 }, false));
  return out;
};

// ---------- Painted panel blocks (Ulaanbaatar) ----------
// Prefab concrete panels, a painted panel under every window in orange,
// blue, yellow and green; gers in the yards.
const PA_PANEL = [0xe5e1d8, 0xdcd6cc, 0xe8e4dc], PA_COLS = [0xe07a3c, 0x4f8ac9, 0xe3c13a, 0x62a35a], PA_BLUE = 0x2f5a9a;
// An endless knot (ölzii) panel in a square: a frame and its interlaced bars, in one colour on another.
function knot(b: Body, face: Face, along: number, y: number, s: number, ground: number, line: number, out = E): G[] {
  const res: G[] = [onFace(b, face, along, y, s, s, ground, out)];
  for (const k of [-0.25, 0.25]) res.push(onFace(b, face, along + k * s, y + s * 0.12, s * 0.09, s * 0.76, line, out + E), onFace(b, face, along, y + s * (0.5 + k) - s * 0.045, s * 0.76, s * 0.09, line, out + E));
  return res;
}
// A univermag (the state department store of the 1960s, Ikh Delgüür): two
// floors of concrete, the ground floor all glass under a deep canopy, the
// floor above a long band of mosaic panels, the endless knot among them;
// the store's name in big letters on a frame along the roof.
const univermag: Build = (l) => {
  const panel = pick(l, PA_PANEL), s = storeys(l, 0.04), out: G[] = [];
  const b = { ...place(l, 0.94, 0.72, 0.009), h: s.base + s.storey * 2.3 }, front = b.z + b.d / 2, g0 = s.base + s.storey * 1.1;
  out.push(...yard(l, b, 0xb8b4a8, 0xc8c4b8, b.w * 0.9));
  out.push(...box(b.w, b.h, b.d, panel, { x: b.x, z: b.z }, 0x8a8680));
  out.push(...shopWindow(b, 'front', 0, 0.0006, b.w * 0.92, g0 * 0.78, 0x6a6a6a, 0x3a4a5a, Math.max(4, Math.round(b.w / 0.006))));
  for (const f of ['left', 'right'] as Face[]) out.push(...shopWindow(b, f, 0, 0.0006, b.d * 0.7, g0 * 0.78, 0x6a6a6a, 0x3a4a5a, 3));
  out.push(...box(b.w + 0.0024, 0.0009, 0.0072, panel, { x: b.x, y: g0 * 0.82, z: front + 0.0024 }, 0xb8b4a8), ...box(b.w + 0.0026, 0.0014, 0.0003, PA_BLUE, { x: b.x, y: g0 * 0.82 - 0.0003, z: front + 0.006 }));
  // The mosaic band: panels in the four colours, a knot in the middle.
  const n = Math.max(4, Math.floor(b.w / 0.0058)), pw = b.w / n, py = g0 + 0.0015, ph = b.h - py - 0.0025;
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * pw;
    if (Math.abs(a) < pw * 0.6) out.push(...knot(b, 'front', a, py + (ph - pw * 0.9) / 2, pw * 0.9, 0xf2ece0, PA_BLUE));
    else out.push(onFace(b, 'front', a, py, pw * 0.86, ph, PA_COLS[(i + l.v) % 4]!));
  }
  for (const f of ['left', 'right'] as Face[]) out.push(onFace(b, f, 0, py + ph * 0.3, b.d * 0.8, ph * 0.4, GLASS));
  // The name on the roof: big letters on a steel frame.
  const rw = b.w * 0.7, rz = front - 0.003, rb: Body = { x: b.x, z: rz, w: rw, d: 0.0004, y: b.h, h: 0.006 };
  for (const k of [-0.45, 0.45]) out.push(...box(0.0004, 0.006, 0.0004, 0x5a5a5a, { x: b.x + k * rw, y: b.h, z: rz }));
  const nl = 7;
  for (let i = 0; i < nl; i++) out.push(onFace(rb, 'front', -rw / 2 + (i + 0.5) * (rw / nl), b.h + 0.0012, (rw / nl) * 0.7, 0.0042, i === 3 ? 0xe3c13a : 0xd8322a, E));
  out.push(...box(rw, 0.0004, 0.0004, 0x5a5a5a, { x: b.x, y: b.h + 0.0008, z: rz - 0.0004 }));
  return out;
};
// A guanz (a roadside canteen of buuz and suutei tsai) built as a great
// ger: a round drum of white felt-coloured walls, the roof a low cone in
// its band of ornament, the orange-painted door with its frame, the stove
// pipe through the crown; a hitching rail before it; beside it a shipping
// container fitted out as a little shop, its sign over the hatch.
const guanz: Build = (l) => {
  const felt = 0xefe7d6, door = 0xe07a3c, out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8b4a8), patch(2 * l.lw * 0.9, 2 * l.ld * 0.9, 0xa8a070, 0, 0, 0.0005));
  const r = Math.min(l.lw * 0.7, l.ld * 0.62), gx = -l.lw + 0.004 + r, gz = Math.min(0, -l.ld + 0.004 + r + 0.006), wh = r * 0.62;
  out.push(...drum(r, r, wh, 12, felt, { x: gx, z: gz }));
  // The bands round the wall: the ornament under the eaves, a rope.
  out.push(cyl(r + 0.0002, r + 0.0002, 0.0018, 12, PA_BLUE, { x: gx, y: wh - 0.0026, z: gz }), cyl(r + 0.0003, r + 0.0003, 0.0006, 12, 0xe3c13a, { x: gx, y: wh - 0.0021, z: gz }));
  out.push(cyl(r + 0.0002, r + 0.0002, 0.0005, 12, 0x8a6a4a, { x: gx, y: wh * 0.45, z: gz }));
  out.push(cone(r * 1.06, r * 0.46, 12, 0xe9e0cc, { x: gx, y: wh, z: gz }), cyl(r * 1.061, r * 1.03, r * 0.06, 12, PA_BLUE, { x: gx, y: wh, z: gz }));
  out.push(cyl(r * 0.2, r * 0.2, 0.0012, 8, door, { x: gx, y: wh + r * 0.37, z: gz }), cyl(0.0005, 0.0005, 0.007, 5, 0x4a4a4a, { x: gx + r * 0.25, y: wh + r * 0.2, z: gz }));
  smokeFrom(gx + r * 0.25, wh + r * 0.2 + 0.007, gz); // the stove pipe
  // The door and its painted frame, facing the street; small windows round.
  const dz = gz + r, db: Body = { x: gx, z: dz, w: 0, d: 0, y: 0, h: 0 };
  out.push(...box(0.0068, Math.min(wh * 0.85, 0.0098), 0.0022, door, { x: gx, z: dz - 0.0004 }, door), onFace({ ...db, d: 0.0036, z: dz - 0.0004 }, 'front', 0, 0.0004, 0.0042, Math.min(wh * 0.75, 0.0084), 0xb04a28, E));
  out.push(...knot({ ...db, d: 0.0036, z: dz - 0.0004 }, 'front', 0, Math.min(wh * 0.75, 0.0084) * 0.45, 0.0028, 0xe3c13a, 0xb04a28, E * 2));
  for (const a of [-0.9, 0.9, 2.2, -2.2]) out.push(P(new THREE.PlaneGeometry(0.0028, 0.0024), GLASS, { x: gx + Math.sin(a) * (r + E), y: wh * 0.55, z: gz + Math.cos(a) * (r + E), ry: a }));
  out.push(...signBoard({ ...db, d: 0.0036, z: dz - 0.0004 }, 'front', 0, Math.min(wh * 0.85, 0.0098) + 0.0004, 0.012, 0.0028, PA_BLUE, 0xf2ece0, E));
  // The hitching rail.
  const hz = Math.min(l.ld - 0.0025, dz + 0.007);
  for (const k of [-1, 1]) out.push(cyl(0.00025, 0.00025, 0.0034, 4, 0x6a5038, { x: gx + k * 0.006, z: hz }));
  out.push(cyl(0.0002, 0.0002, 0.012, 4, 0x6a5038, { x: gx + 0.006, y: 0.0032, z: hz, rz: Math.PI / 2 }));
  // The container shop.
  const cw = 0.0055, cd = 0.014, cx = l.lw - 0.003 - cw / 2, cz = Math.max(gz, -l.ld + 0.004 + cd / 2), cb: Body = { x: cx, z: cz, w: cw, d: cd, y: 0, h: 0.0062 };
  out.push(...box(cw, cb.h, cd, 0x3a7aa8, { x: cx, z: cz }, 0x6a8aa0), ...strips(cb, 'left', 0, cb.h, 0.0003, 0.0011, 0x2f6a94), ...strips(cb, 'right', 0, cb.h, 0.0003, 0.0011, 0x2f6a94));
  out.push(onFace(cb, 'left', -cd * 0.1, 0.0022, cd * 0.4, 0.0026, 0xf2ece0, E * 2), ...signBoard(cb, 'left', -cd * 0.1, 0.0052, cd * 0.6, 0.0016, 0xe3c13a, 0xd8322a, E * 3));
  out.push(...crates(2, 0.0018, 0x62a35a, { x: cx - cw / 2 - 0.002, z: cz + cd * 0.36 }));
  // A UAZ van, the country's workhorse, come in from the steppe.
  out.push(...lorry(0.0085, 0x6a7a5a, 0x6a7a5a, { x: cx - 0.0005, z: Math.min(l.ld - 0.0052, cz + cd / 2 + 0.0062), ry: Math.PI / 2 + 0.2 }, true));
  return out;
};
// A heating plant (the city's thermal stations, the heat sent out in
// pipes above the ground): the tall boiler house with its strip of
// windows, the chimney banded red and white, a heap of coal and the
// conveyor gallery up to the bunkers; the insulated mains along the
// street, lifted over the gate in a bend.
const tets: Build = (l) => {
  const panel = pick(l, PA_PANEL), silver = 0xc8ccd0, out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xa8a49a));
  const bw = 2 * l.lw * 0.56, bd = 2 * l.ld * 0.56, bh = l.H * 0.78, bb: Body = { x: l.lw - 0.003 - bw / 2, z: -l.ld + 0.003 + bd / 2, w: bw, d: bd, y: 0, h: bh };
  out.push(...box(bw, bh, bd, panel, { x: bb.x, z: bb.z }, 0x8a8680));
  for (const f of ['front', 'left'] as Face[]) {
    out.push(...strips(bb, f, bh * 0.2, bh * 0.72, 0.0012, 0.006, PA_COLS[(l.v + 1) % 4]!, E));
    out.push(onFace(bb, f, 0, bh * 0.2, (f === 'front' ? bw : bd) * 0.96, bh * 0.72, 0x3a4a5a, BAND));
  }
  out.push(...doubleDoor(bb, 'front', bw * 0.25, 0.007, 0.009, 0x5a6a5a, 0x3a3a3a, E * 2));
  // The bunker house on top, the chimney behind.
  out.push(...box(bw * 0.5, 0.008, bd * 0.6, panel, { x: bb.x - bw * 0.2, y: bh, z: bb.z }, 0x8a8680));
  const cx = bb.x + bw * 0.28, cz = bb.z - bd * 0.2, ch = l.H * 1.35, cr = 0.0034;
  smokeFrom(cx, bh + ch, cz);
  for (let i = 0; i < 6; i++) out.push(cyl(cr - i * 0.00022, cr - (i + 1) * 0.00022, ch / 6, 8, i % 2 ? 0xf2f0ea : 0xc8322a, { x: cx, y: bh + (i * ch) / 6 - bh * (i === 0 ? 1 : 0) * 0, z: cz }));
  // The coal heap and the conveyor up to the bunkers.
  const hx = -l.lw + 0.0075, hz = -l.ld * 0.25;
  out.push(cone(0.0062, 0.006, 7, 0x2a2826, { x: hx, z: hz }));
  const gx0 = hx + 0.003, gx1 = bb.x - bw * 0.2 - bw * 0.25, len = Math.hypot(gx1 - gx0, bh + 0.004), ang = Math.atan2(bh + 0.004, gx1 - gx0);
  out.push(...box(len, 0.0028, 0.0034, 0x9aa0a4, { x: (gx0 + gx1) / 2, y: (bh + 0.004) / 2 - 0.0014, z: hz, rz: ang }));
  for (const k of [0.33, 0.66]) out.push(...box(0.0008, (bh + 0.004) * k, 0.0008, 0x5a5a5a, { x: gx0 + (gx1 - gx0) * k, z: hz }));
  // The mains along the front, over the gate.
  const pz = l.ld - 0.003, py = 0.003, gate = 0.011, gx = -l.lw * 0.25;
  for (const [x0, x1] of [[-l.lw * 0.96, gx - gate / 2], [gx + gate / 2, l.lw * 0.96]] as const) {
    out.push(cyl(0.0011, 0.0011, x1 - x0, 6, silver, { x: x1, y: py, z: pz, rz: Math.PI / 2 }));
    for (let x = x0 + 0.004; x < x1 - 0.002; x += 0.009) out.push(...box(0.0006, py - 0.0006, 0.0018, 0x6a6a6a, { x, z: pz }));
  }
  for (const sx of [-1, 1]) out.push(cyl(0.0011, 0.0011, 0.012, 6, silver, { x: gx + sx * gate / 2, y: py - 0.0011, z: pz }));
  out.push(cyl(0.0011, 0.0011, gate, 6, silver, { x: gx + gate / 2, y: py + 0.012 - 0.0011, z: pz, rz: Math.PI / 2 }));
  return out;
};

// ---------- Asmara Deco ----------
// Pastel stucco (sand, sage, rose), rounded corners, speed lines and
// portholes in a darker trim, flag fins; palms along the avenues.
const DE_STUCCO = [0xecd2a8, 0xd9e2c8, 0xf0d0c8], DE_TRIM = [0x7fb8a4, 0xc8805a, 0x6a8ac0];
// A bar of the 1930s (Asmara's Bar Zilli): its front built like a wireless
// set of the day, a rounded top over three bands of speed lines, the
// round windows its knobs; a canopy on its fins, the name in chrome; an
// espresso machine's steam behind the glass, tables out under the palms.
const barZilli: Build = (l) => {
  const stucco = pick(l, DE_STUCCO), trim = pick(l, [0x7fb8a4, 0xe8a878, 0x6a8ac0]), s = storeys(l, 0.06), out: G[] = [];
  const b = { ...place(l, 0.82, 0.66, 0.0105), h: s.base + s.storey * 1.9 }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xc8bca4, 0xd8ccb4, b.w));
  out.push(...box(b.w, b.h, b.d, stucco, { x: b.x, z: b.z }, 0xb8a888));
  // The radio: a cabinet standing proud of the front, rounded over the top.
  const rw = b.w * 0.72, rh = b.h * 0.86, rb: Body = { x: b.x, z: front + 0.0012, w: rw, d: 0.0024, y: 0, h: rh };
  out.push(...box(rw, rh, 0.0024, trim, { x: b.x, z: rb.z }, trim));
  out.push(P(new THREE.CylinderGeometry(rw / 2, rw / 2, 0.0024, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).scale(1, 0.45, 1), trim, { x: b.x, y: rh, z: rb.z }));
  // Its face: the glass of the bar below, speed lines over, the three knobs, the dial.
  out.push(...shopWindow(rb, 'front', 0, 0.0008, rw * 0.84, rh * 0.42, 0xd8d8d0, 0x3a4a54, 3, E));
  for (let i = 0; i < 4; i++) out.push(onFace(rb, 'front', 0, rh * 0.52 + i * 0.0016, rw * 0.84, 0.0006, stucco, E));
  for (const k of [-0.3, 0, 0.3]) out.push(disc(rb, 'front', k * rw, rh * 0.86, 0.0016, 0xd8d8d0, E), disc(rb, 'front', k * rw, rh * 0.86, 0.0011, GLASS, E * 2));
  out.push(P(new THREE.CircleGeometry(rw * 0.3, 8, 0, Math.PI).translate(0, rh + 0.0006, 0).scale(1, 0.55, 1), 0xf4ecd8, { x: b.x, y: rh * 0.45, z: rb.z + 0.0012 + E }));
  // The canopy on its fins, the name on it.
  out.push(...box(b.w * 0.94, 0.0008, 0.0062, stucco, { x: b.x, y: rh * 0.47, z: front + 0.0033 }, 0xe8e0d0));
  out.push(...signBoard({ ...b, d: b.d + 0.0128 }, 'front', 0, rh * 0.47 - 0.0012, b.w * 0.6, 0.0018, 0xd8d8d0, trim, E));
  for (const sx of [-1, 1]) out.push(...box(0.0009, b.h + 0.004, 0.0034, trim, { x: b.x + sx * (rw / 2 + 0.0012), z: front + 0.0018 }, trim));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: 2, w: 0.0028, h: s.storey * 0.36, spacing: 0.011, sill: s.storey * 0.32, color: GLASS }));
  out.push(...bands(b, [b.h - 0.0026], 0.0008, trim, ['left', 'right', 'back']));
  // Tables out front, palms at the corners.
  for (const k of [-0.32, 0.32]) out.push(...tableSet(b.x + k * b.w, front + 0.0078, 0xeeeae2, trim, 1.3));
  out.push(...palm(b.x - b.w / 2 - 0.0005, Math.min(l.ld - 0.003, front + 0.0085), 1.05), ...palm(b.x + b.w / 2 + 0.0005, Math.min(l.ld - 0.003, front + 0.0085), 0.95));
  return out;
};
// The Cinema Impero (Asmara, 1937): a tall front over the hall, its name
// down a pylon in the middle, and either side columns of round lights
// (forty-five on the real one); a marquee, the poster cases, the doors.
const impero: Build = (l) => {
  const stucco = pick(l, DE_STUCCO), face = 0xd49c7c, out: G[] = [];
  const b = { ...place(l, 0.9, 0.84, 0.0078), h: l.H * 0.62 }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xc8bca4, 0xd8ccb4, b.w * 0.8));
  out.push(...box(b.w * 0.94, b.h * 0.86, b.d, stucco, { x: b.x, z: b.z }, 0xb8a888));
  for (const f of ['left', 'right'] as Face[]) out.push(...strips({ ...b, w: b.w * 0.94 }, f, 0.004, b.h * 0.7, 0.0012, 0.0065, shade2(stucco, 0.9)));
  // The front: a slab standing up over the hall, in its rust red.
  const fb: Body = { x: b.x, z: front - 0.0012, w: b.w, d: 0.0034, y: 0, h: b.h };
  out.push(...box(fb.w, fb.h, fb.d, face, { x: b.x, z: fb.z }, face));
  // The pylon with the name, letters stacked.
  const pw = 0.0055, pb: Body = { x: b.x, z: front + 0.0012, w: pw, d: 0.0024, y: 0, h: b.h + 0.006 };
  out.push(...box(pw, pb.h - 0.008, pb.d, stucco, { x: b.x, y: 0.008, z: pb.z }, stucco));
  for (let i = 0; i < 6; i++) out.push(onFace(pb, 'front', 0, pb.h - 0.0052 - i * ((pb.h - 0.016) / 6), pw * 0.66, (pb.h - 0.016) / 6 * 0.7, 0x2a2a2a, E));
  // The lights: columns of round lamps either side.
  for (const sx of [-1, 1]) for (const k of [0.22, 0.36]) for (let i = 0; i < 5; i++) out.push(disc(fb, 'front', sx * k * b.w, 0.015 + i * (b.h - 0.02) / 5, 0.0011, 0xfff2c8, E));
  // The marquee, the poster cases, the doors.
  out.push(...box(b.w * 0.78, 0.0024, 0.0072, stucco, { x: b.x, y: 0.0072, z: front + 0.0036 }, 0xe8e0d0), onFace({ ...b, d: b.d + 0.0144 }, 'front', 0, 0.0074, b.w * 0.76, 0.002, 0xf4ecd8, E));
  out.push(...shopWindow(fb, 'front', 0, 0.0004, b.w * 0.4, 0.0062, 0x3a2a24, 0x5a3a2a, 3, E));
  for (const sx of [-1, 1]) out.push(onFace(fb, 'front', sx * b.w * 0.36, 0.0012, 0.0036, 0.0052, [0xd8a83a, 0x3f7fb5][sx > 0 ? 1 : 0]!, E), onFace(fb, 'front', sx * b.w * 0.36, 0.0008, 0.0044, 0.006, 0xd8d8d0, BAND));
  out.push(...palm(b.x - b.w / 2 + 0.001, l.ld - 0.0042, 0.9));
  return out;
};
// The Fiat Tagliero filling station (Asmara, 1938, the "aeroplane"): a
// tower in the middle, its fin carrying the name, the office under it in
// glass; two concrete wings, each fifteen metres out without a prop,
// over the pumps; the workshop behind; a car at the pumps.
const tagliero: Build = (l) => {
  const stucco = pick(l, DE_STUCCO), trim = pick(l, DE_TRIM), white = 0xf2eee4, out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8bca4), patch(2 * l.lw * 0.94, l.ld * 1.1, 0x8a8680, 0, l.ld * 0.4, 0.0005));
  // The workshop behind, a long shed in stucco with its doors.
  const ww = 2 * l.lw * 0.9, wd = Math.min(0.014, l.ld * 0.6), wb: Body = { x: 0, z: -l.ld + 0.003 + wd / 2, w: ww, d: wd, y: 0, h: 0.011 };
  out.push(...box(ww, wb.h, wd, stucco, { x: 0, z: wb.z }, 0xb8a888), ...bands(wb, [wb.h - 0.0022], 0.0008, trim));
  for (const k of [-0.3, 0, 0.3]) out.push(onFace(wb, 'front', k * ww, 0, ww * 0.22, wb.h * 0.62, 0x4a4a48));
  // The office: a glass drum under the tower.
  const tz = l.ld * 0.12, tr = Math.min(0.0055, l.ld * 0.28);
  out.push(...drum(tr, tr, 0.0085, 10, stucco, { x: 0, z: tz }), cyl(tr + 0.00015, tr + 0.00015, 0.005, 10, 0x4a6a7a, { x: 0, y: 0.002, z: tz }));
  // The tower and its fin.
  const th = l.H * 0.42, tw = 0.0062;
  out.push(...box(tw, th, tw * 0.8, white, { x: 0, z: tz }, white), ...box(0.0012, th + 0.008, tw * 1.6, trim, { x: 0, y: 0.004, z: tz }, trim));
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) out.push(P(new THREE.PlaneGeometry(tw * 1.1, 0.0028), white, { x: sx * (0.0006 + E), y: th + 0.002 - i * 0.004, z: tz, ry: Math.PI / 2 }));
  // The wings: long tapering slabs out either side, a rim along their edges.
  const wy = th * 0.62, span = l.lw * 0.96 - tw / 2;
  for (const sx of [-1, 1]) {
    const x0 = sx * tw / 2, x1 = sx * (tw / 2 + span), d0 = tw * 2.2, d1 = tw * 0.9;
    out.push(...loft([[x0, tz + d0 / 2], [x1, tz + d1 / 2], [x1, tz - d1 / 2], [x0, tz - d0 / 2]], [[x0, tz + d0 / 2], [x1, tz + d1 / 2], [x1, tz - d1 / 2], [x0, tz - d0 / 2]], wy, 0.0012, white, white));
    out.push(...loft([[x0, tz + d0 / 2 + 0.0002], [x1, tz + d1 / 2 + 0.0002], [x1, tz + d1 / 2 - 0.0004], [x0, tz + d0 / 2 - 0.0004]], [[x0, tz + d0 / 2 + 0.0002], [x1, tz + d1 / 2 + 0.0002], [x1, tz + d1 / 2 - 0.0004], [x0, tz + d0 / 2 - 0.0004]], wy - 0.0004, 0.0004, trim, trim));
    // The pumps under the wing.
    for (const k of [0.4, 0.75]) {
      const px = sx * (tw / 2 + span * k);
      out.push(...box(0.0016, 0.0058, 0.0012, [0xd8322a, 0xe3c13a][k > 0.5 ? 1 : 0]!, { x: px, z: tz }, 0xf2eee4), P(new THREE.SphereGeometry(0.0008, 6, 3), 0xf4ecd8, { x: px, y: 0.0066, z: tz }));
    }
  }
  // A car at the pumps.
  out.push(...lorry(0.0095, 0x2a4a6a, 0x2a4a6a, { x: -span * 0.55, z: tz + 0.0055, ry: Math.PI / 2 }, true));
  out.push(...palm(l.lw * 0.8, l.ld - 0.0035, 0.95));
  return out;
};

// ---------- Indo-Saracenic (Mumbai) ----------
// Ochre stone (and the grey Kurla basalt), blue-grey bands, pointed
// arches, domes and turrets; Mangalore tiles on the lower roofs, teak
// balconies, palms.
const IN_STONE = [0xc9a66b, 0xbf9a60, 0xd2b07a], IN_BLUE = 0x7d8c9a, IN_GOLD = 0xc9a24a, IN_TEAK = 0x6a4428, IN_MANGALORE = 0xb5603f, IN_BASALT = 0x6e6a64;
// An Irani café (the Parsi and Irani cafés of Bombay's street corners,
// 1900s on): two floors under a hipped roof of Mangalore tiles, the
// ground floor open in tall arches on both streets, bentwood chairs and
// marble-topped tables within and spilling out, glass jars of biscuits on
// the counter, the café's name in red on a cream board, a clock; the
// family's rooms over it behind a teak verandah.
const iraniCafe: Build = (l) => {
  const stone = pick(l, IN_STONE), green = 0x3a6a4a, s = storeys(l, 0.08), out: G[] = [];
  const b = { ...place(l, 0.86, 0.64, 0.0105), h: s.base + s.storey * 2 }, front = b.z + b.d / 2, gs = s.base + s.storey;
  out.push(...yard(l, b, 0xc0b090, 0xd0c0a0, b.w));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }), ...bands(b, [gs], 0.0012, IN_BLUE));
  // The arches, open, the café dark within; on the side too.
  for (const f of ['front', 'right'] as Face[]) {
    const fw = f === 'front' ? b.w : b.d, n = Math.max(2, Math.round(fw / 0.0095)), aw = fw / n;
    for (let i = 0; i < n; i++) out.push(...arch(b, f, (i - (n - 1) / 2) * aw, 0, aw * 0.72, gs * 0.6, 0x2a2220));
    out.push(...signBoard(b, f, 0, gs - 0.0032, fw * 0.8, 0.0024, 0xf2e8d0, 0xb0352b, E));
  }
  out.push(disc(b, 'front', b.w * 0.4, gs - 0.0021, 0.0014, 0xf4f1ea, E * 3));
  // The counter with its jars just inside, tables in and out.
  out.push(...counter(b.w * 0.3, 0.0022, 0.0032, IN_TEAK, 0xe8e4dc, { x: b.x - b.w * 0.2, z: front - 0.0018 }));
  for (let i = 0; i < 3; i++) out.push(...drum(0.0005, 0.0005, 0.0012, 5, 0xd8e4e8, { x: b.x - b.w * 0.3 + i * 0.0018, y: 0.0032, z: front - 0.0018 }, 0xc0503a));
  for (const k of [-0.25, 0.2]) out.push(...tableSet(b.x + k * b.w, front + 0.0042, 0xeeeae2, 0x3a2418, 1.3));
  out.push(...tableSet(b.x + b.w / 2 + 0.0042, b.z, 0xeeeae2, 0x3a2418, 1.3));
  // The verandah upstairs: a teak rail and posts, a pent of tiles, shuttered windows behind.
  out.push(...windows(b, 'front', { ...s, floors: 1, base: gs, w: 0.003, h: s.storey * 0.5, spacing: 0.0085, sill: s.storey * 0.2, color: 0x2a2622, shutter: green }));
  out.push(...windows(b, 'right', { ...s, floors: 1, base: gs, w: 0.003, h: s.storey * 0.5, spacing: 0.0085, sill: s.storey * 0.2, color: 0x2a2622, shutter: green }));
  out.push(...box(b.w * 0.96, 0.0006, 0.0034, IN_TEAK, { x: b.x, y: gs + 0.0002, z: front + 0.0017 }), onFace({ ...b, d: b.d + 0.0066 }, 'front', 0, gs + 0.0008, b.w * 0.96, 0.0024, IN_TEAK, E));
  out.push(...strips({ ...b, w: b.w * 0.96, d: b.d + 0.0066 }, 'front', gs + 0.0008, 0.0024, 0.0003, 0.0018, 0xd8c8a0, E * 2));
  out.push(hip(b.w + 0.005, b.d + 0.005, Math.min(b.w, b.d) * 0.3, IN_MANGALORE, { x: b.x, y: b.h, z: b.z }));
  out.push(...palm(b.x - b.w / 2 - 0.0006, Math.min(l.ld - 0.0035, front + 0.0062), 1));
  return out;
};
// A bazaar block (Bhendi Bazaar, Abdul Rehman Street): three floors of
// stone and timber, a shop in every bay under a sloping tin awning, each
// its own painted board, sacks of chillies, turmeric and rice out front;
// projecting teak balconies over, washing, black water tanks and a painted
// billboard on the roof.
const bazaar: Build = (l) => {
  const stone = pick(l, IN_STONE), s = storeys(l, 0.08), boards = [0xe3c13a, 0x2a7a5a, 0xd85a2a, 0x2a5a9a, 0xe36aa6], out: G[] = [];
  const b = { ...place(l, 0.94, 0.66, 0.0095), h: s.base + s.storey * 3 }, front = b.z + b.d / 2, gs = s.base + s.storey;
  out.push(...yard(l, b, 0xc0b090, 0xd0c0a0, b.w));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, 0x8a8478), ...bands(b, [gs, gs + s.storey], 0.0012, IN_BLUE));
  // The shops, bay by bay.
  const n = Math.max(2, Math.round(b.w / 0.0085)), bw = b.w / n;
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * bw, c = boards[(i + l.v) % boards.length]!;
    out.push(onFace(b, 'front', a, 0.0006, bw * 0.82, gs * 0.6, 0x2a2018), ...signBoard(b, 'front', a, gs * 0.63, bw * 0.9, 0.0036, c, i % 2 ? 0xf4f1ea : 0x2a2a2a, E * 2));
    // Cloth and goods hung from the awning's edge.
    for (const k of [-0.3, 0.3]) out.push(P(new THREE.PlaneGeometry(bw * 0.18, 0.0042), [0xd83b6a, 0xe3c13a, 0x3a8a6a, 0xd85a2a, 0x6a4ab0][(i * 2 + (k > 0 ? 1 : 0) + l.v) % 5]!, { x: b.x + a + k * bw, y: gs * 0.95 - 0.0021 - 0.0004, z: front + 0.0058 }));
    out.push(...sacks(2, 0.0009, [0xc83a2a, 0xe0b030, 0xeeeae0, 0xd87a2a][(i + l.v) % 4]!, { x: b.x + a, z: front + 0.0018 }));
  }
  out.push(...leanEave(b.w, 0.0062, gs * 0.95, 0x8a9096, { x: b.x, z: front }));
  // The balconies: a teak box out on each upper floor, its rail, a pent over.
  for (let f = 1; f < 3; f++) {
    const y = s.base + f * s.storey;
    out.push(...windows(b, 'front', { ...s, floors: 1, base: y - s.base, w: 0.003, h: s.storey * 0.48, spacing: 0.0085, sill: s.storey * 0.18, color: 0x2a2622 }));
    for (const k of [-0.28, 0.28]) {
      const bb: Body = { x: b.x + k * b.w, z: front + 0.0018, w: b.w * 0.32, d: 0.0036, y, h: s.storey * 0.36 };
      out.push(...box(bb.w, 0.0006, bb.d, IN_TEAK, { x: bb.x, y, z: bb.z }), ...strips(bb, 'front', y + 0.0006, s.storey * 0.24, 0.0004, 0.0016, IN_TEAK, 0));
      out.push(...box(bb.w, 0.0005, 0.0003, IN_TEAK, { x: bb.x, y: y + s.storey * 0.3, z: bb.z + bb.d / 2 - 0.00015 }));
    }
  }
  out.push(P(new THREE.PlaneGeometry(0.0032, 0.0032), 0xd85a2a, { x: b.x + b.w * 0.05, y: gs + s.storey * 0.5, z: front + 0.0037 }));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: 3, w: 0.0026, h: s.storey * 0.42, spacing: 0.0095, sill: s.storey * 0.25, color: 0x2a2622 }));
  // The roof: a parapet, black tanks, the billboard.
  out.push(ring(b.w + 0.0004, 0.0016, b.d + 0.0004, stone, { x: b.x, y: b.h, z: b.z }));
  for (const k of [-0.3, -0.1]) out.push(...drum(0.0016, 0.0016, 0.0034, 7, 0x1e1e1e, { x: b.x + k * b.w, y: b.h, z: b.z - b.d * 0.2 }));
  const bbz = b.z + b.d * 0.05, bbb: Body = { x: b.x + b.w * 0.2, z: bbz, w: b.w * 0.5, d: 0.0004, y: b.h + 0.004, h: 0.008 };
  for (const k of [-0.4, 0.4]) out.push(...box(0.0005, 0.004, 0.0005, 0x4a4a4a, { x: bbb.x + k * bbb.w, y: b.h, z: bbz }));
  out.push(...box(bbb.w, bbb.h, 0.0004, 0x3a3a3a, { x: bbb.x, y: bbb.y, z: bbz }), onFace(bbb, 'front', 0, bbb.y + 0.0004, bbb.w * 0.94, bbb.h - 0.0008, 0xe8b830, E), onFace(bbb, 'front', -bbb.w * 0.2, bbb.y + 0.0014, bbb.w * 0.4, bbb.h * 0.6, 0x2a6a9a, E * 2), onFace(bbb, 'front', bbb.w * 0.25, bbb.y + 0.0024, bbb.w * 0.36, bbb.h * 0.25, 0x2a2a2a, E * 2));
  return out;
};
// A cotton mill of Girangaon (the mill lands of central Bombay, 1860s to
// the 1980s): the spinning block in grey basalt dressed in ochre, its
// tall arched windows; the weaving sheds under sawtooth roofs; the round
// chimney; at the street the gatehouse with its pointed arch and clock;
// bales of cotton in the yard, a handcart to take them.
const girni: Build = (l) => {
  const stone = pick(l, IN_STONE), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xa8a090));
  const mw = 2 * l.lw * 0.58, md = Math.min(0.015, l.ld * 0.6), mh = l.H * 0.66, mb: Body = { x: -l.lw + 0.003 + mw / 2, z: -l.ld + 0.003 + md / 2, w: mw, d: md, y: 0, h: mh };
  out.push(...box(mw, mh, md, IN_BASALT, { x: mb.x, z: mb.z }), ...bands(mb, [mh * 0.33, mh * 0.66], 0.001, stone));
  const ms = { floors: 3, base: 0.001, storey: mh / 3 };
  for (const f of ['front', 'left'] as Face[]) {
    const fw = f === 'front' ? mw : md, n = Math.max(2, Math.floor(fw / 0.0065));
    for (let fl = 0; fl < 3; fl++) for (let i = 0; i < n; i++) out.push(...arch(mb, f, (i - (n - 1) / 2) * (fw / n), ms.base + fl * ms.storey + ms.storey * 0.2, 0.0026, ms.storey * 0.46, 0x2a2e32, true));
  }
  out.push(...box(mw + 0.0012, 0.0013, md + 0.0012, stone, { x: mb.x, y: mh - 0.0012, z: mb.z }), hip(mw + 0.002, md + 0.002, md * 0.3, IN_MANGALORE, { x: mb.x, y: mh, z: mb.z }));
  // The weaving shed beside it.
  const sw = 2 * l.lw * 0.98 - mw - 0.0065, sd = 2 * l.ld * 0.6, sb: Body = { x: l.lw - 0.003 - sw / 2, z: -l.ld + 0.003 + sd / 2, w: sw, d: sd, y: 0, h: 0.009 };
  out.push(...box(sw, sb.h, sd, IN_BASALT, { x: sb.x, z: sb.z }), ...sawtooth(sw, sd, Math.max(2, Math.round(sd / 0.0075)), 0.004, 0x8a8478, 0x9ab0b8, { x: sb.x, y: sb.h, z: sb.z, ry: Math.PI }));
  out.push(...windows(sb, 'front', { floors: 1, base: 0, storey: sb.h, w: 0.0028, h: sb.h * 0.45, spacing: 0.0065, sill: sb.h * 0.3, color: 0x2a2e32, frame: stone }));
  // The chimney.
  out.push(...box(0.0068, 0.006, 0.0068, stone, { x: mb.x + mw / 2 + 0.0034, z: mb.z }), ...roundStack(0.0028, l.H * 1.3, 0x8a5a44, stone, { x: mb.x + mw / 2 + 0.0034, y: 0.006, z: mb.z }));
  // The gatehouse at the street: a pointed arch through it, a clock over, a little dome.
  const gw = 0.0115, gb: Body = { x: -l.lw * 0.25, z: l.ld - 0.0045, w: gw, d: 0.0055, y: 0, h: 0.016 };
  out.push(...box(gw, gb.h, gb.d, stone, { x: gb.x, z: gb.z }), ...arch(gb, 'front', 0, 0, 0.0052, 0.0072, 0x2a2420, true), ...arch(gb, 'back', 0, 0, 0.0052, 0.0072, 0x2a2420, true));
  out.push(disc(gb, 'front', 0, 0.0128, 0.0018, 0xf4f1ea), dome(0.0024, IN_BLUE, { x: gb.x, y: gb.h, z: gb.z }, 6), cone(0.0004, 0.002, 4, IN_GOLD, { x: gb.x, y: gb.h + 0.0023, z: gb.z }));
  out.push(...box(l.lw * 0.96 - gb.x - gw / 2, 0.005, 0.0008, stone, { x: (gb.x + gw / 2 + l.lw * 0.96) / 2, z: l.ld - 0.0045 }), ...box(gb.x - gw / 2 + l.lw * 0.96, 0.005, 0.0008, stone, { x: (gb.x - gw / 2 - l.lw * 0.96) / 2, z: l.ld - 0.0045 }));
  // Bales and the handcart.
  out.push(...crates(5, 0.0026, 0xe8e2d4, { x: l.lw * 0.35, z: sb.z + sd / 2 + 0.0045 }));
  out.push(...cart(0.0068, 0x7a5a3a, 0x3a3028, { x: l.lw * 0.05, z: sb.z + sd / 2 + 0.0055, ry: 0.4 }));
  return out;
};

// ---------- Brick Expressionism (Hamburg) ----------
// Dark clinker brick, close-set piers in a lighter brick, pointed and
// zigzag crowns, green copper; the harbour and its canals.
const BE_CLINKER = [0x5b3428, 0x4e2c22, 0x664032], BE_ROOF = 0x3e2a24, BE_COPPER = 0x5f9a86, BE_GOLD = 0xc9a24a, BE_GREEN = 0x2f5a44;
// The fish auction hall (Altona's of 1896, by the Elbe): a brick
// basilica of iron and glass, its high nave gable-end to the street with
// one great round-arched window, the aisles lower either side, a clock
// tower capped in copper; outside, the Sunday fish market's stalls under
// striped awnings, boxes of fish on ice.
const fischhalle: Build = (l) => {
  const brick = pick(l, BE_CLINKER), pier = shade2(brick, 1.45), out: G[] = [];
  const b = { ...place(l, 0.9, 0.76, 0.0095), h: l.H * 0.32 }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x9a948a, 0xa8a298, b.w * 0.9));
  // The aisles, low; the nave over them; its glass roof.
  const nw = b.w * 0.5, nh = l.H * 0.5;
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }, BE_ROOF));
  for (const sx of [-1, 1]) out.push(...leanRoof(b.w / 2 - nw / 2, b.d, b.h + 0.0035, b.h, BE_ROOF, { x: b.x + sx * (nw / 2 + (b.w / 2 - nw / 2) / 2), z: b.z, flip: sx < 0 }));
  const nb: Body = { x: b.x, z: b.z, w: nw, d: b.d, y: 0, h: nh };
  out.push(...box(nw, nh, b.d, brick, { x: b.x, z: b.z }));
  out.push(...gable(nw + 0.0014, b.d + 0.0014, nw * 0.4, 0x8aa4ac, { x: b.x, y: nh, z: b.z }, true, brick));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(nb, f, { floors: 1, base: b.h + 0.004, storey: nh - b.h - 0.004, w: 0.0032, h: (nh - b.h) * 0.45, spacing: 0.0065, sill: 0.0008, color: 0x5a7480 }));
  // The front: the great arched window, the doors, piers up the corners, the aisles' arched windows.
  out.push(...arch(nb, 'front', 0, nh * 0.36, nw * 0.62, nh * 0.36, pier, false, FRAME), ...arch(nb, 'front', 0, nh * 0.36 + 0.0005, nw * 0.56, nh * 0.36 - 0.0005, 0x5a7480, false, E));
  out.push(...strips({ ...nb, w: nw * 0.56 }, 'front', nh * 0.36, nh * 0.36 + nw * 0.28, 0.0003, 0.0028, pier, E * 2));
  out.push(...doubleDoor(nb, 'front', 0, nw * 0.4, nh * 0.28, BE_GREEN, pier, E));
  out.push(...strips(nb, 'front', 0, nh, 0.0014, nw - 0.0014, pier, E * 0.5));
  for (const sx of [-1, 1]) out.push(...arch(b, 'front', sx * (nw / 2 + (b.w / 2 - nw / 2) / 2), 0.0028, (b.w / 2 - nw / 2) * 0.5, b.h * 0.42, 0x5a7480));
  // The clock tower at one corner.
  const tx = b.x + b.w / 2 - 0.0032, tz = front - 0.0032, th = l.H * 0.66, tb: Body = { x: tx, z: tz, w: 0.0064, d: 0.0064, y: 0, h: th };
  out.push(...box(tb.w, th, tb.d, brick, { x: tx, z: tz }), disc(tb, 'front', 0, th - 0.0042, 0.0019, 0xf2eee4), disc(tb, 'right', 0, th - 0.0042, 0.0019, 0xf2eee4));
  out.push(dome(0.0042, BE_COPPER, { x: tx, y: th, z: tz, sy: 1.3 }, 8), cone(0.0005, 0.004, 4, BE_GOLD, { x: tx, y: th + 0.0052, z: tz }));
  // The market stalls: awnings, boxes of fish.
  for (const k of [-0.28, 0.22]) {
    const x = b.x + k * b.w, z = front + 0.0058;
    out.push(...stallCloth(b.w * 0.26, 0.0058, 0.0074, [0x2a5a9a, 0xf2eee4], { x, z }));
    out.push(...counter(b.w * 0.22, 0.0034, 0.003, 0x6a6a6a, 0xd8dce0, { x, z }));
    for (let i = 0; i < 3; i++) out.push(...box(0.0018, 0.0003, 0.0022, 0xb8c4cc, { x: x + (i - 1) * 0.0024, y: 0.003, z }));
  }
  return out;
};
// A roof sloping from `hi` on one side to `lo` on the other, over w × d (an aisle's), its high side at -x (+x when `flip`).
function leanRoof(w: number, d: number, hi: number, lo: number, c: number, o: { x: number; z: number; flip: boolean }): G[] {
  const x = w / 2, z = d / 2, a = o.flip ? lo : hi, bb = o.flip ? hi : lo, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-x, a, z, x, bb, z, x, bb, -z, -x, a, z, x, bb, -z, -x, a, -z], 3));
  return [P(g, c, { x: o.x, z: o.z })];
}
// A market stall's striped cloth roof on four poles.
function stallCloth(w: number, d: number, h: number, colors: readonly number[], o: { x: number; z: number }): G[] {
  const out: G[] = [];
  for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.0001, 0.0001, h, 3, 0x4a4a4a, { x: o.x + a * (w / 2 - 0.0002), z: o.z + c * (d / 2 - 0.0002) }));
  out.push(...awning(w, d * 1.02, colors, { x: o.x, y: h, z: o.z - d / 2, tilt: 0.2, stripes: 6 }));
  return out;
}
// A department store of the 1920s (a Kaufhaus by the Mönckebergstraße):
// four floors of dark clinker ruled by close piers that rise into a crown
// of brick points, each tipped in gold; the ground floor all display
// windows under a deep canopy, the store's name in tall letters on it,
// flags on the roof.
const kaufhaus: Build = (l) => {
  const brick = pick(l, BE_CLINKER), pier = shade2(brick, 1.45), s = storeys(l, 0.06), out: G[] = [];
  const b = place(l, 0.92, 0.74, 0.0065), front = b.z + b.d / 2, gs = s.base + s.storey;
  out.push(...yard(l, b, 0x9a948a, 0xa8a298, b.w * 0.9));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }, BE_ROOF));
  // Display windows, the canopy, its letters.
  out.push(...shopWindow(b, 'front', 0, 0.0008, b.w * 0.92, gs * 0.62, 0x2a2a2a, 0x5a6a74, Math.max(3, Math.round(b.w / 0.0075))));
  for (const f of ['left', 'right'] as Face[]) out.push(...shopWindow(b, f, 0, 0.0008, b.d * 0.7, gs * 0.62, 0x2a2a2a, 0x5a6a74, 3));
  out.push(...box(b.w + 0.0016, 0.0016, 0.0072, 0x2a2a2a, { x: b.x, y: gs * 0.7, z: front + 0.0036 }, 0x3a3a3a));
  const cb: Body = { x: b.x, z: front + 0.0036, w: b.w, d: 0.0072, y: 0, h: 0 };
  for (let i = 0; i < 6; i++) out.push(onFace(cb, 'front', -b.w * 0.3 + i * b.w * 0.12, gs * 0.7 + 0.0016, b.w * 0.08, 0.0034, BE_GOLD, 0.0001));
  // The piers up the floors over, glass between them; on the sides too.
  const ub: Body = { ...b, y: gs, h: b.h - gs };
  for (const f of ['front', 'left', 'right'] as Face[]) {
    out.push(onFace(ub, f, 0, gs + 0.002, (f === 'front' ? b.w : b.d) * 0.96, b.h - gs - 0.0045, 0x3a4048, BAND));
    out.push(...strips(ub, f, gs + 0.0015, b.h - gs - 0.0015, 0.0012, 0.0034, pier, E));
    for (let fl = 1; fl < 4; fl++) out.push(onFace(ub, f, 0, s.base + fl * s.storey, (f === 'front' ? b.w : b.d) * 0.96, 0.0012, brick, E * 0.6));
  }
  // The crown: brick points along the top, gold tips.
  const n = Math.max(4, Math.floor(b.w / 0.0042)), pw = b.w / n;
  for (let i = 0; i < n; i++) {
    const x = b.x - b.w / 2 + (i + 0.5) * pw;
    out.push(P(new THREE.ConeGeometry(pw * 0.62, 0.0068, 4, 1, true).translate(0, 0.0034, 0), pier, { x, y: b.h, z: front - pw * 0.4, ry: Math.PI / 4 }), P(new THREE.OctahedronGeometry(0.0006, 0), BE_GOLD, { x, y: b.h + 0.0068, z: front - pw * 0.4 }));
  }
  out.push(ring(b.w, 0.0024, b.d, brick, { x: b.x, y: b.h, z: b.z }));
  for (const k of [-0.25, 0.25]) out.push(cyl(0.0001, 0.0001, 0.011, 3, 0xd8d8d8, { x: b.x + k * b.w, y: b.h, z: b.z - b.d * 0.2 }), P(new THREE.PlaneGeometry(0.0048, 0.003), k < 0 ? 0xc8322a : 0xf2eee4, { x: b.x + k * b.w + 0.0024, y: b.h + 0.0092, z: b.z - b.d * 0.2 }));
  return out;
};
// A Speicherstadt warehouse (Hamburg's free port, 1885 on): six floors of
// red brick straight up out of the canal, its gables stepped and pinnacled,
// a column of loading doors in green from the water to the hoist in the
// gable, a copper turret on the corner; a barge moored below with its
// load of sacks and crates.
const speicher: Build = (l) => {
  const brick = pick(l, [0x8a3e2c, 0x7e3a2a, 0x94442e]), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a948a));
  // The canal along the front, its quay edge.
  const cw = Math.min(0.016, l.ld * 0.62), cz = l.ld - cw / 2 - 0.0005;
  out.push(patch(2 * l.lw * 0.98, cw, 0x3a5a6a, 0, cz, 0.0006), ...box(2 * l.lw * 0.98, 0.0012, 0.0008, 0x8a8478, { x: 0, z: cz - cw / 2 + 0.0005 }));
  // The warehouse, straight out of the water's edge.
  const wd = 2 * l.ld - cw - 0.004, wb: Body = { x: 0, z: cz - cw / 2 - wd / 2, w: 2 * l.lw * 0.9, d: wd, y: 0, h: l.H * 1.1 };
  out.push(...box(wb.w, wb.h, wb.d, brick, { x: 0, z: wb.z }), ...bands(wb, [wb.h * 0.17, wb.h * 0.5, wb.h * 0.83], 0.0009, 0xc8a878));
  const ws = { floors: 6, base: 0.0012, storey: (wb.h - 0.002) / 6 };
  // The loading bays: a column of green doors, the windows either side.
  const bays = Math.max(1, Math.round(wb.w / 0.022));
  for (let i = 0; i < bays; i++) {
    const a = (i - (bays - 1) / 2) * (wb.w / bays);
    for (let f = 0; f < 6; f++) out.push(onFace(wb, 'front', a, ws.base + f * ws.storey + ws.storey * 0.12, 0.0034, ws.storey * 0.7, BE_GREEN));
    for (const k of [-1, 1]) for (let f = 0; f < 6; f++) out.push(onFace(wb, 'front', a + k * 0.0058, ws.base + f * ws.storey + ws.storey * 0.25, 0.0022, ws.storey * 0.48, 0x2a2e32));
    // The gable over the bay, stepped, the hoist beam out of it.
    const gx = a, gw = Math.min(0.016, wb.w / bays * 0.9);
    out.push(...box(gw, 0.005, 0.0024, brick, { x: gx, y: wb.h, z: wb.z + wd / 2 - 0.0012 }), ...box(gw * 0.66, 0.004, 0.0024, brick, { x: gx, y: wb.h + 0.005, z: wb.z + wd / 2 - 0.0012 }), ...box(gw * 0.3, 0.0035, 0.0024, brick, { x: gx, y: wb.h + 0.009, z: wb.z + wd / 2 - 0.0012 }));
    for (const k of [-0.5, 0.5]) out.push(cone(0.0006, 0.0034, 4, BE_COPPER, { x: gx + k * gw, y: wb.h + 0.005, z: wb.z + wd / 2 - 0.0012 }));
    out.push(...box(0.0006, 0.0006, 0.0042, 0x3a3a3a, { x: gx, y: wb.h + 0.0055, z: wb.z + wd / 2 + 0.002 }), cyl(0.00006, 0.00006, wb.h * 0.25, 3, 0x2a2a2a, { x: gx, y: wb.h + 0.0055 - wb.h * 0.25, z: wb.z + wd / 2 + 0.0038 }));
  }
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(wb, f, { ...ws, w: 0.0022, h: ws.storey * 0.48, spacing: 0.0075, sill: ws.storey * 0.25, color: 0x2a2e32 }));
  out.push(...gable(wb.w + 0.0016, wd + 0.0016, wd * 0.36, 0x5a6066, { x: 0, y: wb.h, z: wb.z }, false, brick));
  // The corner turret.
  const tx = wb.w / 2 - 0.0026, tz = wb.z + wd / 2 - 0.0026;
  out.push(cyl(0.003, 0.003, 0.0085, 8, brick, { x: tx, y: wb.h, z: tz }), cone(0.0036, 0.0085, 8, BE_COPPER, { x: tx, y: wb.h + 0.0085, z: tz }));
  // The barge at the quay.
  const bz = cz + 0.0005, bl = 2 * l.lw * 0.62;
  out.push(...prism([[-bl / 2, bz + 0.0028], [bl / 2 - 0.003, bz + 0.0028], [bl / 2, bz], [bl / 2 - 0.003, bz - 0.0028], [-bl / 2, bz - 0.0028]], 0.0018, 0x2a2a2a, { y: 0.0002 }, 0x5a4a3a));
  out.push(...sacks(4, 0.0011, 0xd8c8a0, { x: -bl * 0.2, y: 0.002, z: bz }), ...crates(3, 0.0022, 0x8a6a4a, { x: bl * 0.15, y: 0.002, z: bz }));
  return out;
};

// ---------- Stalinist (Moscow) ----------
// Sandstone-coloured render over granite bases, pilasters, gilt spires and
// red stars.
const ST_STONE = [0xd8c7a5, 0xcbb894, 0xe0d2b4], ST_BASE = 0xa89676, ST_GRANITE = 0x6a4a44, ST_GOLD = 0xd2a53a, ST_RED = 0xb0352b;
// A five-pointed star standing on edge (facing +z).
function star(r: number, c: number, o: Tf): G {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return P(new THREE.ShapeGeometry(s), c, o);
}
// A gastronom (Moscow's food halls of the 1950s, under the new blocks of
// Tverskaya and the Garden Ring): the block's two lower floors one arcade
// of display windows in red granite, the word for it in gilt along the
// cornice of the base and in red letters on a frame on the roof; a yellow
// kvass tank on its trailer at the kerb.
const gastronom: Build = (l) => {
  const stone = pick(l, ST_STONE), s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.92, 0.7, 0.0085), front = b.z + b.d / 2, g2 = s.base + s.storey * 2;
  out.push(...yard(l, b, 0xb8b0a0, 0xc8c0b0, b.w * 0.8));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }), ...box(b.w + 0.0008, g2, b.d + 0.0008, ST_GRANITE, { x: b.x, z: b.z }));
  const gb: Body = { ...b, w: b.w + 0.0008, d: b.d + 0.0008 };
  // The arcade: tall arched windows of two floors, lit within.
  for (const f of ['front', 'left', 'right'] as Face[]) {
    const fw = f === 'front' ? gb.w : gb.d, n = Math.min(5, Math.max(2, Math.round(fw / 0.0105))), bw = fw / n;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * bw, aw = bw * 0.7;
      out.push(...arch(gb, f, a, 0.0016, aw, g2 - 0.0062 - aw / 2, 0xe8d8a8, false, E), onFace(gb, f, a, s.base + s.storey * 0.95, aw, 0.0008, ST_GRANITE, E * 2));
    }
  }
  out.push(...signBoard(gb, 'front', 0, g2 - 0.0036, gb.w * 0.84, 0.0026, 0x2a2a2a, ST_GOLD, E));
  out.push(...box(b.w + 0.0016, 0.0013, b.d + 0.0016, ST_BASE, { x: b.x, y: g2, z: b.z }));
  // The floors over: windows between pilasters, the cornice.
  for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: 2, base: g2, w: 0.0026, h: s.storey * 0.5, spacing: 0.0085, sill: s.storey * 0.25, color: GLASS }));
  out.push(...strips({ ...b, h: b.h - g2 }, 'front', g2 + 0.0013, b.h - g2 - 0.0026, 0.0012, 0.0085, shade2(stone, 1.08), E * 2));
  out.push(...box(b.w + 0.002, 0.0014, b.d + 0.002, stone, { x: b.x, y: b.h - 0.0013, z: b.z }));
  // The letters on the roof.
  const rw = b.w * 0.86, rz = front - 0.003, rb: Body = { x: b.x, z: rz, w: rw, d: 0.0004, y: b.h, h: 0.006 };
  for (const k of [-0.45, 0, 0.45]) out.push(...box(0.0004, 0.0062, 0.0004, 0x4a4a4a, { x: b.x + k * rw, y: b.h, z: rz }));
  const nl = 9;
  for (let i = 0; i < nl; i++) out.push(onFace(rb, 'front', -rw / 2 + (i + 0.5) * (rw / nl), b.h + 0.0016, (rw / nl) * 0.72, 0.0042, ST_RED, E));
  // The kvass tank on its trailer.
  const kx = b.x + b.w * 0.25, kz = Math.min(l.ld - 0.0028, front + 0.0052);
  out.push(cyl(0.0019, 0.0019, 0.0082, 8, 0xe8c030, { x: kx + 0.0041, y: 0.0031, z: kz, rz: Math.PI / 2 }), P(new THREE.CircleGeometry(0.0019, 8), 0xe8c030, { x: kx + 0.0041, y: 0.0031, z: kz, ry: Math.PI / 2 }), P(new THREE.CircleGeometry(0.0019, 8), 0xe8c030, { x: kx - 0.0041, y: 0.0031, z: kz, ry: -Math.PI / 2 }));
  out.push(cyl(0.0009, 0.0009, 0.0006, 6, TYRE, { x: kx + 0.0006, y: 0.0009, z: kz + 0.0012, rx: Math.PI / 2 }), cyl(0.0009, 0.0009, 0.0006, 6, TYRE, { x: kx + 0.0006, y: 0.0009, z: kz - 0.0018, rx: Math.PI / 2 }));
  out.push(onFace({ x: kx, z: kz, w: 0.008, d: 0.0038, y: 0, h: 0 }, 'front', 0, 0.0026, 0.004, 0.001, ST_RED, 0.0002));
  return out;
};
// A kinoteatr (the district cinemas of the 1950s): a temple of the
// people's art, a low hall fronted by a portico of eight columns under a
// pediment with the red star in it, the name across the frieze, poster
// stands before it; a Soyuzpechat newspaper kiosk beside, blue and glazed.
const kinoteatr: Build = (l) => {
  const stone = pick(l, ST_STONE), out: G[] = [];
  const b = { ...place(l, 0.84, 0.66, 0.0125), h: l.H * 0.4 }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xb8b0a0, 0xc8c0b0, b.w * 0.9));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, 0x8a8478), ...box(b.w + 0.0008, 0.0035, b.d + 0.0008, ST_BASE, { x: b.x, z: b.z }));
  for (const f of ['left', 'right'] as Face[]) out.push(...strips(b, f, 0.0035, b.h - 0.006, 0.0014, 0.0068, shade2(stone, 1.08), E));
  // The portico: a platform, eight columns, the entablature, the pediment.
  const pd = 0.0068, pz = front + pd / 2, ph = b.h - 0.0006;
  out.push(...box(b.w + 0.002, 0.0014, pd + 0.002, ST_BASE, { x: b.x, z: pz }, 0xc8bca0));
  const nc = 8;
  for (let i = 0; i < nc; i++) out.push(cyl(0.00075, 0.00065, ph - 0.0014 - 0.0024, 6, 0xf0e8d8, { x: b.x - b.w / 2 + 0.0012 + i * ((b.w - 0.0024) / (nc - 1)), y: 0.0014, z: front + pd - 0.0012 }));
  const eb: Body = { x: b.x, z: pz, w: b.w + 0.0012, d: pd, y: 0, h: 0 };
  out.push(...box(eb.w, 0.003, pd, stone, { x: b.x, y: ph - 0.0024, z: pz }), ...signBoard(eb, 'front', 0, ph - 0.0019, b.w * 0.6, 0.0019, stone, ST_GOLD, E));
  out.push(...gable(eb.w + 0.0008, pd + 0.0008, b.w * 0.16, 0x8a8478, { x: b.x, y: ph + 0.0006, z: pz }, true, stone));
  out.push(star(b.w * 0.06, ST_RED, { x: b.x, y: ph + 0.0006 + b.w * 0.065, z: pz + (pd + 0.0008) / 2 + E }));
  // The doors behind the columns, the poster stands.
  for (const k of [-0.25, 0, 0.25]) out.push(onFace(b, 'front', k * b.w, 0.0014, 0.0034, 0.0078, 0x4a3226));
  for (const k of [-0.42, 0.42]) {
    const x = b.x + k * b.w, z = Math.min(l.ld - 0.0022, front + pd + 0.0042);
    out.push(...box(0.0036, 0.0058, 0.0005, 0x5a5a5a, { x, z }), onFace({ x, z, w: 0.0036, d: 0.0005, y: 0, h: 0 }, 'front', 0, 0.0018, 0.003, 0.0036, k < 0 ? 0xd8a83a : 0x3f7fb5, E));
  }
  // The newspaper kiosk.
  const kx = b.x + b.w / 2 + 0.0038, kz = Math.min(l.ld - 0.004, front + 0.004), kb: Body = { x: kx, z: kz, w: 0.0052, d: 0.0048, y: 0, h: 0.0068 };
  if (kx + 0.0035 < l.lw * 1.02) {
    out.push(...box(kb.w, kb.h, kb.d, 0x3a6aa8, { x: kx, z: kz }, 0x3a6aa8), onFace(kb, 'front', 0, 0.0024, kb.w * 0.86, 0.003, 0xc8d8e0), ...box(kb.w + 0.0012, 0.0006, kb.d + 0.0012, 0x2a4a7a, { x: kx, y: kb.h, z: kz }));
  }
  return out;
};
// A works of the five-year plans: the gate between two pylons crowned with
// red stars, the slogan on a red banner over it; behind, the assembly hall
// of red brick with its long clerestory, the boiler house chimney; a ZIS
// lorry out of the gate.
const zavod: Build = (l) => {
  const stone = pick(l, ST_STONE), brick = pick(l, [0x9a5040, 0x8a4a3a, 0xa05844]), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xa8a49a));
  const hw = 2 * l.lw * 0.9, hd = 2 * l.ld * 0.62, hh = l.H * 0.36, hb: Body = { x: 0, z: -l.ld + 0.003 + hd / 2, w: hw, d: hd, y: 0, h: hh };
  out.push(...box(hw, hh, hd, brick, { x: 0, z: hb.z }));
  const nw = Math.min(7, Math.max(3, Math.floor(hw / 0.0068)));
  for (let i = 0; i < nw; i++) out.push(onFace(hb, 'front', (i - (nw - 1) / 2) * (hw / nw), 0.003, (hw / nw) * 0.6, hh * 0.6, 0x4a5a64));
  out.push(...bands(hb, [hh - 0.0024], 0.0014, stone, ['front', 'left', 'right']));
  out.push(...gable(hw + 0.0014, hd + 0.0014, hd * 0.2, 0x6a6a6a, { x: 0, y: hh, z: hb.z }, false, brick));
  out.push(...box(hw * 0.92, 0.0035, hd * 0.24, 0x8aa4ac, { x: 0, y: hh + hd * 0.2 - 0.0016, z: hb.z }, 0x6a6a6a));
  // The slogan along the hall.
  out.push(onFace(hb, 'front', 0, hh * 0.72, hw * 0.7, 0.0026, ST_RED, E * 2), ...strips({ ...hb, w: hw * 0.6 }, 'front', hh * 0.72 + 0.0008, 0.001, 0.0008, 0.0024, 0xf2eee4, E * 3));
  // The chimney.
  out.push(...roundStack(0.0028, l.H * 1.25, 0x9a5040, stone, { x: -hw / 2 + 0.004, z: hb.z - hd / 2 + 0.004 }));
  // The gate: two pylons with stars, the banner over, walls along the street.
  const gz = l.ld - 0.0035, gw = 0.013;
  for (const sx of [-1, 1]) {
    const px = sx * (gw / 2 + 0.0018);
    out.push(...box(0.0036, 0.0165, 0.0036, stone, { x: px, z: gz }, ST_BASE), star(0.0026, ST_RED, { x: px, y: 0.0195, z: gz + 0.0002 }), star(0.0026, ST_RED, { x: px, y: 0.0195, z: gz - 0.0002, ry: Math.PI }));
    out.push(...box(l.lw * 0.96 - gw / 2 - 0.0036, 0.0055, 0.001, stone, { x: sx * (gw / 2 + 0.0036 + (l.lw * 0.96 - gw / 2 - 0.0036) / 2), z: gz }));
  }
  const bnb: Body = { x: 0, z: gz, w: gw + 0.0036, d: 0.0006, y: 0, h: 0 };
  out.push(...box(bnb.w, 0.0034, 0.0006, ST_RED, { x: 0, y: 0.0118, z: gz }, ST_RED), ...strips({ ...bnb, w: gw * 0.8 }, 'front', 0.0128, 0.0014, 0.0007, 0.0021, 0xf2eee4, E));
  out.push(...lorry(0.0125, 0x4a5a3a, 0x4a5a3a, { x: 0.001, z: gz - 0.0095, ry: 0 }, false, 0x7a6a50));
  return out;
};

export const QUADS_TRADE = {
  brick: { shops: [pub, coop], works: mill },
  haussmann: { shops: [grandMagasin, brasserie], works: imprimerie },
  polykatoikia: { shops: [therino, kafeneio], works: marmarades },
  modernisme: { shops: [mercat, pastisseria], works: fabrica },
  bauhaus: { shops: [kolnoa, kiosk], works: packingHouse },
  shikumen: { shops: [laneShops, dangpu], works: jiangyuan },
  zakkyo: { shops: [pachinko, izakaya], works: machiKoba },
  panel: { shops: [univermag, guanz], works: tets },
  deco: { shops: [barZilli, impero], works: tagliero },
  indoSaracenic: { shops: [iraniCafe, bazaar], works: girni },
  brickExpressionist: { shops: [fischhalle, kaufhaus], works: speicher },
  stalinist: { shops: [gastronom, kinoteatr], works: zavod },
} satisfies Record<string, Trade>;
