// Shops and works (houses.ts: a style's variants 3 and 4 are its two
// shops, 5 its works): mediterranean, nile, eastAsian, northern, yurt,
// mesoamerican, african, southAsian. Each drawn after the trades its
// people kept, in the style's own materials (houses.ts FIRST_STYLES).

import * as THREE from 'three';
import { cone, cyl, type Tf } from '../../propCatalog.ts';
import { wallHeight } from '../../town/geometry.ts';
import { E, BAND, FRAME, P, arch, bands, box, disc, smokeFrom, faceWidth, flatTree, merlons, shade, strips, tilted, tree, dome, fence, frustum, gable, hip, onFace, palm, patch, pick, place, ring, shrub, storeys, windows, yard, type Body, type Build, type Face, type G, type Trade } from '../../houseKit.ts';
import { anvil, awning, barrels, cart, counter, doubleDoor, hangingSign, hourglassMill, jars, lantern, leanTo, logs, sacks, signBoard, stack, stall } from '../../tradeKit.ts';

// ---------- Roman (mediterranean) ----------
// Stucco over brick, terracotta roofs; the tabernae of a Roman street,
// open across their whole front by day and boarded up at night.
const RO_WALL = [0xe8dcc4, 0xddc9a6, 0xefe6d6], RO_ROOF = [0xb5653f, 0xa85a3a, 0xc07a50];
const RO_RED = 0x9a3a2a, RO_MARBLE = 0xd9d2c4, RO_TIMBER = 0x6a4e34, RO_DARK = 0x2a221c;
// A thermopolium: a street bar serving hot food and wine. Its whole front
// open behind an L-shaped marble counter, the dolia (storage jars) sunk
// in its top; a tiled pent roof on posts over it; the walls' lower band
// painted Pompeian red, a painted sign; amphorae stacked by the door, the
// owners' rooms over the shop (the pergula).
const thermopolium: Build = (l) => {
  const wall = pick(l, RO_WALL), roof = pick(l, RO_ROOF), s = storeys(l);
  const b = place(l, 0.72, 0.56, 0.0085), gs = l.floors > 1 ? s.base + s.storey : l.H * 0.8, out: G[] = [];
  out.push(...yard(l, b, 0xcab89a, 0xd8ccb0, 0.008));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
  // The dado: Pompeian red round the walls, a hand high.
  for (const f of ['left', 'right', 'back'] as Face[]) out.push(onFace(b, f, 0, 0, (f === 'back' ? b.w : b.d), 0.004, RO_RED, BAND));
  // The open front, dark within, the shelves of jars at its back.
  const ow = b.w * 0.82, oh = gs * 0.78;
  out.push(onFace(b, 'front', 0, 0, ow, oh, RO_DARK, E));
  for (const y of [oh * 0.45, oh * 0.7]) out.push(onFace(b, 'front', 0, y, ow * 0.9, 0.0004, 0x5a4232, E * 2));
  // The counter: along the front and back into the shop at one end, marble-faced, three dolia in its top.
  const cz = b.z + b.d / 2 + 0.0022;
  out.push(...counter(ow * 0.7, 0.0032, 0.0048, RO_MARBLE, 0xeee8dc, { x: b.x - ow * 0.12, z: cz }));
  out.push(...counter(0.0032, 0.004, 0.0048, RO_MARBLE, 0xeee8dc, { x: b.x - ow * 0.12 + ow * 0.35 - 0.0016, z: cz - 0.0034 }));
  for (const k of [-0.3, 0, 0.3]) out.push(cyl(0.0008, 0.0008, 0.0002, 6, 0x3a2418, { x: b.x - ow * 0.12 + k * ow * 0.7, y: 0.0048, z: cz }));
  out.push(onFace({ ...b, z: cz, d: 0.0032, x: b.x - ow * 0.12, w: ow * 0.7 }, 'front', 0, 0.0012, ow * 0.5, 0.0022, RO_RED, E));
  // The protectum: a tiled roof out over the counter, on two posts.
  out.push(...leanTo(b.w * 0.96, 0.0072, gs + 0.0012, gs - 0.0018, roof, RO_TIMBER, { x: b.x, z: b.z + b.d / 2 }));
  // A painted sign over it, and the pergula's windows (shuttered) above.
  out.push(...signBoard(b, 'front', 0, gs + 0.002, b.w * 0.55, 0.0028, RO_RED, 0xefe6d6));
  if (l.floors > 1) out.push(...windows(b, 'front', { ...s, floors: 1, base: gs + 0.0012, w: 0.0032, h: s.storey * 0.36, spacing: 0.012, sill: s.storey * 0.32, color: 0x3a3028, shutter: 0x5a7a5a }));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: l.floors, w: 0.0026, h: s.storey * 0.3, spacing: 0.014, sill: s.storey * 0.5, color: 0x3a3028 }));
  out.push(hip(b.w + 0.004, b.d + 0.004, Math.min(b.w, b.d) * 0.26, roof, { x: b.x, y: b.h, z: b.z }));
  // Amphorae in a heap by the door, and one more stood against the wall.
  out.push(...jars(3, 0.0011, 0xb5653f, { x: b.x + b.w * 0.36, z: b.z + b.d / 2 + 0.0042 }));
  return out;
};
// A cloth merchant's taberna (a pair of them under one roof): two wide
// bays, the night boards stacked aside, bolts of dyed wool and linen laid
// out on trestles; over the shops a timber balcony (maenianum) on beams,
// or a tiled pent roof on a single storey; a sign hung out on a bracket.
const taberna: Build = (l) => {
  const wall = pick(l, RO_WALL), roof = pick(l, RO_ROOF), s = storeys(l);
  const b = place(l, 0.88, 0.54, 0.0062), gs = l.floors > 1 ? s.base + s.storey : l.H * 0.82, out: G[] = [];
  out.push(...yard(l, b, 0xcab89a, 0xd8ccb0, 0.006));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
  out.push(...box(b.w + 0.0014, 0.0016, b.d + 0.0014, 0xcfc4ac, { x: b.x, z: b.z }));
  // Two bays between brick piers, each open, its boards stacked to one side.
  const bw = b.w * 0.38, bh = gs * 0.74;
  for (const k of [-1, 1]) {
    const along = k * b.w * 0.23;
    out.push(onFace(b, 'front', along, 0.0016, bw, bh, RO_DARK, E));
    for (let i = 0; i < 3; i++) out.push(onFace(b, 'front', along + k * (bw / 2 - 0.0012 - i * 0.0007), 0.0016, 0.0006, bh * 0.92, i % 2 ? 0x7a5a3a : 0x6a4c30, E * 2));
    // Trestles of cloth before it: bolts in madder red, woad blue, saffron, undyed.
    const tz = b.z + b.d / 2 + 0.0026;
    out.push(...counter(bw * 0.8, 0.0024, 0.0034, RO_TIMBER, 0x8a6a4a, { x: b.x + along, z: tz }));
    [0xa83a2a, 0x3a4a7a, 0xd8a83a, 0xe2dccc].forEach((c, i) => out.push(cyl(0.00055, 0.00055, 0.0021, 5, c, { x: b.x + along - bw * 0.3 + i * bw * 0.2, y: 0.0039, z: tz, rx: Math.PI / 2 })));
  }
  // The pier between the bays, a red stripe down it.
  out.push(onFace(b, 'front', 0, 0.0016, 0.0016, bh, RO_RED, E));
  if (l.floors > 1) {
    // The maenianum: a timber balcony out on beam ends, a rail along it.
    const by = gs + 0.0004, bz = b.z + b.d / 2 + 0.0024;
    for (const k of [-0.42, -0.14, 0.14, 0.42]) out.push(...box(0.0007, 0.0007, 0.0048, RO_TIMBER, { x: b.x + k * b.w, y: by - 0.0007, z: bz - 0.0002 }));
    out.push(...box(b.w * 0.96, 0.0005, 0.0046, 0x7a5a3a, { x: b.x, y: by, z: bz }));
    out.push(...box(b.w * 0.96, 0.0028, 0.0004, 0x7a5a3a, { x: b.x, y: by + 0.0005, z: bz + 0.0021 }));
    out.push(...windows(b, 'front', { ...s, floors: 1, base: gs + 0.001, w: 0.0036, h: s.storey * 0.48, spacing: 0.012, sill: s.storey * 0.1, color: 0x3a3028, shutter: 0x7a5a3a }));
  } else out.push(...leanTo(b.w * 0.94, 0.006, gs + 0.0016, gs - 0.0012, roof, RO_TIMBER, { x: b.x, z: b.z + b.d / 2 }));
  out.push(...hangingSign(0.003, 0.0024, 0xe8dcc0, 0x2a2622, { x: b.x + b.w / 2 - 0.0012, y: gs + 0.004, z: b.z + b.d / 2 }));
  out.push(...gable(b.w + 0.004, b.d + 0.004, b.d * 0.24, roof, { x: b.x, y: b.h, z: b.z }, false, wall));
  return out;
};
// A pistrinum: a bakery that ground its own flour. Its hall at the back of
// a paved yard, a wide arched door; beside it the domed brick bread oven
// and its flue; in the yard the hourglass lava millstones the donkeys
// turned, grain sacks, a cart in from the farms.
const pistrinum: Build = (l) => {
  const wall = pick(l, RO_WALL), roof = pick(l, RO_ROOF);
  // (One tall working storey whatever the street's height; a loft over it on a two-floor street.)
  const hh = wallHeight(1) * (l.floors > 1 ? 1.45 : 1.1);
  const b = { ...place(l, 0.6, 0.46, l.ld * 0.5), h: hh }, out: G[] = [];
  b.x = l.lw * 0.14; // (room for the oven beside it)
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xbfb4a0));
  out.push(patch(2 * l.lw * 0.86, l.ld * 0.78, 0xa8a090, 0, l.ld * 0.5, 0.0005)); // the paved yard
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
  out.push(onFace(b, 'front', 0, 0, b.w, 0.004, RO_RED, BAND));
  out.push(...arch(b, 'front', b.w * 0.2, 0, 0.0075, Math.min(0.009, hh * 0.55), RO_DARK, false, E * 2));
  for (const k of [-0.28, -0.05]) out.push(onFace(b, 'front', k * b.w, hh * 0.62, 0.0028, 0.0034, 0x3a3028, E * 2));
  if (l.floors > 1) out.push(onFace(b, 'front', b.w * 0.2, hh * 0.78, 0.0042, 0.003, 0x3a3028, E * 2)); // the loft's hatch over the door
  out.push(...gable(b.w + 0.004, b.d + 0.004, b.d * 0.3, roof, { x: b.x, y: b.h, z: b.z }, false, wall));
  // The oven: a brick dome on a square base against the hall's side, its mouth to the yard, its flue.
  const ox = b.x - b.w / 2 - 0.0062, oz = b.z + b.d * 0.12;
  out.push(...box(0.0118, 0.0045, 0.0118, 0xb9a27e, { x: ox, z: oz }));
  out.push(dome(0.0052, 0xa8583a, { x: ox, y: 0.0045, z: oz, sy: 0.85 }));
  out.push(onFace({ x: ox, z: oz, w: 0.0118, d: 0.0118, y: 0, h: 0.0045 }, 'front', 0, 0.0012, 0.0036, 0.0024, 0x1e1a16, E));
  out.push(...stack(0.0022, 0.014, 0xa8583a, 0x3a3028, { x: ox - 0.0034, z: oz - 0.0036 }));
  // The mill shed: an open tiled roof on posts over two lava mills, sacks of grain by them.
  const mz = l.ld * 0.5;
  out.push(...stall(l.lw * 1.1, l.ld * 0.5, 0.009, roof, RO_TIMBER, { x: l.lw * 0.3, z: mz }));
  for (const k of [-0.18, 0.2]) out.push(...hourglassMill(0.0022, 0.0075, 0x4a4644, { x: l.lw * 0.3 + k * l.lw * 2, z: mz }));
  out.push(...sacks(5, 0.0012, 0xd8c8a0, { x: -l.lw * 0.55, z: l.ld * 0.68 }));
  out.push(...cart(0.0075, 0x7a5a3a, 0x4a3828, { x: l.lw * 0.66, z: -l.ld * 0.68, ry: 0.3 }));
  return out;
};

// ---------- Egyptian (nile) ----------
// Mudbrick under a lime wash, walls battered (leaning in), flat roofs
// behind a parapet; reed mats and palm trunks for shade; linen, bread
// and beer. Market scenes in Old Kingdom tombs (Tepemankh, Niankhkhnum)
// show sellers squatting under shades by their baskets on the quay.
const NI_WALL = [0xc9a878, 0xd8bc8c, 0xbf9c6c], NI_MAT = [0xc8b07a, 0xa8925a], NI_PALM = 0x7a6448, NI_DARK = 0x2e2620;
const NI_BLUE = 0x3a6a8a, NI_RED = 0xa04a32, NI_GREEN = 0x4a7a5a, NI_LINEN = 0xf0ebdc;
// A basket (open, of palm-leaf wicker) heaped with its goods.
const basket = (r: number, goods: number, wicker: number, o: Tf): G[] => [
  cyl(r, r * 1.15, r * 0.9, 6, wicker, o),
  P(new THREE.CircleGeometry(r * 1.1, 6).rotateX(-Math.PI / 2), goods, { ...o, y: (o.y ?? 0) + r * 0.8 }),
];
// A pot or jar (a round body, a short neck), cheaper than the kit's jars, standing on o.
const pot = (r: number, c: number, o: Tf, neck = c): G[] => [
  P(new THREE.SphereGeometry(r, 6, 3), c, { ...o, y: (o.y ?? 0) + r * 1.1, sy: 1.1 }),
  cyl(r * 0.42, r * 0.5, r * 0.5, 5, neck, { ...o, y: (o.y ?? 0) + r * 2.05 }),
];
// A rod lying along x (or z), its middle at o (the kit's cyl stands up from its foot).
const rodX = (len: number, r: number, n: number, c: number, o: { x: number; y: number; z: number }) => cyl(r, r, len, n, c, { ...o, x: o.x + len / 2, rz: Math.PI / 2 });
const rodZ = (len: number, r: number, n: number, c: number, o: { x: number; y: number; z: number }) => cyl(r, r, len, n, c, { ...o, z: o.z - len / 2, rx: Math.PI / 2 });
// A rod from a to b (a pole, a rafter).
function rod(a: readonly [number, number, number], b: readonly [number, number, number], r: number, c: number, n = 3): G {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, n, 1, true).translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return P(g, c, { x: a[0], y: a[1], z: a[2] });
}
// A wedge of earth: w across x, `len` along z, rising from nothing at +z to `h` at -z.
function wedge(w: number, len: number, h: number, c: number, o: Tf): G {
  const x = w / 2, z = len / 2, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -x, 0, z, x, 0, z, x, h, -z, -x, 0, z, x, h, -z, -x, h, -z, // the slope
    -x, 0, z, -x, h, -z, -x, 0, -z, x, 0, z, x, 0, -z, x, h, -z, // the sides
    -x, 0, -z, -x, h, -z, x, h, -z, -x, 0, -z, x, h, -z, x, 0, -z, // the back
  ], 3));
  return P(g, c, o);
}
// A mat roof: a reed mat on palm-trunk posts, sloping down toward +z, in
// strips of its reeds' two tones (one colour: one sheet).
function matShade(w: number, d: number, h: number, mats: readonly number[], post: number, o: { x: number; z: number; y?: number }, cols = 2, tilt = 0.08): G[] {
  const n = mats.length > 1 ? Math.max(3, Math.round(w / 0.0024)) : 1, sw = w / n, out: G[] = [], y = o.y ?? 0;
  for (let i = 0; i < n; i++) out.push(P(new THREE.PlaneGeometry(sw, d).rotateX(-Math.PI / 2 + tilt), mats[i % mats.length]!, { x: o.x - w / 2 + sw * (i + 0.5), y: y + h, z: o.z }));
  for (let i = 0; i < cols; i++) for (const k of [-1, 1]) {
    const x = o.x + (cols === 1 ? 0 : (i / (cols - 1) - 0.5)) * (w - 0.002), z = o.z + k * (d / 2 - 0.001);
    out.push(cyl(0.0004, 0.00034, h - k * Math.sin(tilt) * (d / 2 - 0.001), 4, post, { x, y, z }));
  }
  return out;
}
// A greengrocer by the quay: the seller's house set back, a long reed mat
// on palm trunks before it, under it baskets heaped with onions, dates,
// figs, lettuce and leeks, and fish laid out in rows on a mat (the
// Nile's catch, sold fresh or split and dried).
const nileGrocer: Build = (l) => {
  const wall = pick(l, NI_WALL), out: G[] = [];
  const b = place(l, 0.66, 0.4, l.ld * 0.62);
  out.push(...yard(l, b, 0xcdb48a, 0xb8a07a));
  out.push(...frustum(b.w + 0.002, b.d + 0.002, b.w, b.d, b.h, wall, { x: b.x, z: b.z }, wall));
  out.push(ring(b.w, 0.0022, b.d, wall, { x: b.x, y: b.h, z: b.z }));
  out.push(onFace(b, 'front', -b.w * 0.22, 0, 0.005, Math.min(0.0085, b.h * 0.5), NI_DARK, E * 5));
  out.push(onFace(b, 'front', b.w * 0.2, b.h * 0.62, 0.006, 0.0018, NI_DARK, E * 5)); // a high slit window, the house's light
  // On the roof, onions and dates spread on mats to dry; a roof room on a taller street.
  out.push(patch(b.w * 0.36, b.d * 0.5, 0xd8c8a0, b.x - b.w * 0.2, b.z + b.d * 0.05, b.h + 0.0003), patch(b.w * 0.2, b.d * 0.36, 0x7a3a2a, b.x + b.w * 0.16, b.z + b.d * 0.12, b.h + 0.0003));
  if (l.floors > 1) out.push(...box(b.w * 0.4, b.h * 0.3, b.d * 0.4, wall, { x: b.x + b.w * 0.22, y: b.h, z: b.z - b.d * 0.26 }));
  // The shade: a striped reed mat out from the house front over half the forecourt.
  const front = b.z + b.d / 2, room = l.ld - front, sd = room * 0.55, sz = front + sd / 2 + 0.0003, sw = Math.min(2 * l.lw * 0.88, b.w * 1.12);
  out.push(patch(sw, room - 0.0015, 0xb69a6a, b.x, front + (room - 0.0015) / 2, 0.0006)); // the beaten earth before it
  out.push(...matShade(sw, sd, Math.min(0.0085, l.H * 0.42), NI_MAT, NI_PALM, { x: b.x, z: sz }, sw > 0.04 ? 3 : 2, 0.14));
  // Baskets in the sun before it: a row heaped with onions, dates, figs, lettuces, lentils, leeks; more in the shade.
  const goods = [0xece4cc, 0x6a2a22, 0x7a3a6a, 0x6a9a3a, 0xc8803a, 0x9ab858];
  const n = Math.max(3, Math.floor(sw / 0.0058));
  for (let i = 0; i < n; i++) {
    const x = b.x - sw / 2 + 0.002 + (i + 0.5) * ((sw - 0.004) / n);
    out.push(...basket(0.0019, goods[i % goods.length]!, 0xa88a52, { x, z: front + room * 0.72 }));
    if (i % 2 === 1) out.push(...basket(0.0014, goods[(i + 2) % goods.length]!, 0x9a7a48, { x, z: front + sd * 0.5 }));
  }
  // Melons in a heap and fish on a mat at the lot's side, toward the street.
  const hx = b.x + b.w / 2 + 0.003 < l.lw * 0.8 ? b.x + b.w / 2 + 0.0025 : b.x - sw * 0.3;
  for (let i = 0; i < 4; i++) out.push(P(new THREE.SphereGeometry(0.0011, 5, 3), i % 2 ? 0x8aa848 : 0x6a8a3a, { x: hx + (i % 3 - 1) * 0.0018, y: 0.001 + (i === 3 ? 0.0015 : 0), z: front + 0.0028, sy: 0.85 }));
  const mx = b.x - sw * 0.05, mz = l.ld - 0.0022;
  out.push(patch(0.008, 0.0028, 0xd8c890, mx, mz, 0.0008));
  for (let i = 0; i < 4; i++) out.push(P(new THREE.OctahedronGeometry(0.0007, 0), i % 2 ? 0x9aa0a0 : 0x7a8a8a, { x: mx - 0.0027 + i * 0.0018, y: 0.0009, z: mz, sx: 0.8, sz: 2.2, sy: 0.4 }));
  out.push(...jars(2, 0.0012, 0xa8583a, { x: b.x + b.w / 2 - 0.004, z: front + 0.0018 }));
  out.push(...palm(-l.lw * 0.7, -l.ld * 0.72, 0.9));
  return out;
};
// A linen merchant's house of some standing: a columned porch across its
// front (papyrus-bundle columns, their bell capitals painted green, a
// lintel under a cavetto cornice: the gorge every Egyptian roof ended in),
// sheets of fine linen hung from the porch beam to show, folded bolts
// on a bench, the door painted red within.
const nileLinen: Build = (l) => {
  const wall = pick(l, NI_WALL), out: G[] = [];
  const b = place(l, 0.74, 0.5, l.ld * 0.42);
  out.push(...yard(l, b, 0xcdb48a, 0xc8b48c, 0.008));
  out.push(...frustum(b.w + 0.0024, b.d + 0.0024, b.w, b.d, b.h, wall, { x: b.x, z: b.z }, wall));
  // The cornice: a torus roll (blue) and the gorge flaring out over it, painted in bands.
  out.push(...box(b.w + 0.0006, 0.0007, b.d + 0.0006, NI_BLUE, { x: b.x, y: b.h - 0.0007, z: b.z }, wall));
  out.push(...frustum(b.w + 0.0006, b.d + 0.0006, b.w + 0.003, b.d + 0.003, 0.0018, 0xe6d6b0, { x: b.x, y: b.h, z: b.z }));
  out.push(...frustum(b.w + 0.0031, b.d + 0.0031, b.w + 0.0035, b.d + 0.0035, 0.0005, NI_RED, { x: b.x, y: b.h + 0.0018, z: b.z }));
  if (l.floors > 1) {
    // A roof room at the back, its own small cornice, and a wind-catcher (malqaf) over it.
    const rw = b.w * 0.5, rd = b.d * 0.5, rx = b.x - b.w * 0.2, rz = b.z - b.d * 0.22, rh = b.h * 0.3;
    out.push(...box(rw, rh, rd, wall, { x: rx, y: b.h, z: rz }));
    out.push(...frustum(rw, rd, rw + 0.002, rd + 0.002, 0.0012, 0xe6d6b0, { x: rx, y: b.h + rh, z: rz }, wall));
    out.push(...box(0.004, 0.005, 0.003, wall, { x: rx + rw * 0.25, y: b.h + rh, z: rz - 0.0004 }, 0xb8a070));
  }
  // The porch: four columns on the street side, a lintel and its own cornice; its ceiling dark blue.
  const pd = 0.0075, pz = b.z + b.d / 2 + pd / 2, ph = Math.min(b.h * 0.72, 0.016), pw = b.w * 0.92;
  const cols = pw > 0.04 ? 4 : 3;
  for (let i = 0; i < cols; i++) {
    const x = b.x - pw / 2 + 0.0012 + i * ((pw - 0.0024) / (cols - 1)), z = pz + pd / 2 - 0.0012;
    out.push(cyl(0.0008, 0.0009, ph * 0.72, 6, 0xe8dcc0, { x, z }));
    out.push(cyl(0.0008, 0.0016, ph * 0.22, 6, NI_GREEN, { x, y: ph * 0.72, z }));
    out.push(...box(0.0024, ph * 0.06, 0.0024, 0xd8c8a0, { x, y: ph * 0.94, z }));
  }
  out.push(...box(pw + 0.002, 0.0016, pd + 0.0004, wall, { x: b.x, y: ph, z: pz }, NI_BLUE));
  out.push(...frustum(pw + 0.002, pd + 0.0004, pw + 0.004, pd + 0.0018, 0.0012, 0xe6d6b0, { x: b.x, y: ph + 0.0016, z: pz }, wall));
  // The painted lintel band and the doorway in the shade of the porch.
  const pb: Body = { x: b.x, z: pz, w: pw + 0.002, d: pd + 0.0004, y: ph, h: 0.0016 };
  for (let i = 0; i < 6; i++) out.push(onFace(pb, 'front', -pw * 0.42 + i * pw * 0.168, ph + 0.0004, pw * 0.08, 0.0008, [NI_BLUE, NI_RED, NI_GREEN][i % 3]!, E));
  out.push(onFace(b, 'front', 0, 0, 0.005, ph * 0.78, NI_RED, E * 4), onFace(b, 'front', 0, ph * 0.78, 0.0062, 0.0008, NI_BLUE, E * 4));
  for (const s of [-1, 1]) out.push(onFace(b, 'front', s * b.w * 0.3, ph * 0.5, 0.003, 0.0016, NI_DARK, E * 4));
  // Linen hung from the porch beam between the columns, and bolts on a bench at the porch's side.
  const lw = (pw - 0.0024) / (cols - 1);
  for (let i = 0; i < cols - 1; i++) {
    if (i === Math.floor((cols - 1) / 2) && cols % 2 === 0) continue;
    const x = b.x - pw / 2 + 0.0012 + (i + 0.5) * lw;
    out.push(P(new THREE.PlaneGeometry(lw * 0.7, ph * 0.5), i % 2 ? 0xe8dcc0 : NI_LINEN, { x, y: ph * 0.73, z: pz + pd / 2 - 0.0015 }));
    out.push(P(new THREE.PlaneGeometry(lw * 0.7, ph * 0.06), NI_BLUE, { x, y: ph * 0.51, z: pz + pd / 2 - 0.0015 + E }));
  }
  const bz = Math.min(pz + pd / 2 + 0.003, l.ld * 0.96 - 0.002);
  out.push(...counter(0.0075, 0.0028, 0.0026, 0x8a6a48, 0x7a5a3a, { x: b.x + b.w / 2 - 0.002, z: bz }));
  for (let i = 0; i < 3; i++) out.push(...box(0.0018, 0.0009, 0.0022, i === 1 ? 0xe8dcc0 : NI_LINEN, { x: b.x + b.w / 2 - 0.0042 + i * 0.0022, y: 0.0026, z: bz }));
  // On the roof, new linen bleaching in the sun: sheets laid out in rows.
  const rw = l.floors > 1 ? b.w * 0.4 : b.w * 0.8, rx = l.floors > 1 ? b.x + b.w * 0.26 : b.x;
  for (let i = 0; i < 3; i++) out.push(patch(rw, b.d * 0.16, i === 1 ? 0xe8e0cc : NI_LINEN, rx, b.z - b.d * 0.3 + i * b.d * 0.24, b.h + 0.0004));
  out.push(...fence(l, 0.004, wall, 0.012), ...palm(-l.lw * 0.68, -l.ld * 0.7, 1), ...palm(l.lw * 0.7, -l.ld * 0.62, 0.8));
  return out;
};
// A bakery and brewery (bread and beer were brewed from the same emmer
// and barley, side by side: the model from Meketre's tomb). A walled
// court before a roofed room; in it the round clay ovens, tall crocks of
// beer fermenting under clay stoppers, the women's saddle querns, sacks
// of grain; in the back corner the granary's beehive silos, a hatch high
// in each, a ladder up to it.
const nileBakery: Build = (l) => {
  const wall = pick(l, NI_WALL), out: G[] = [], fw = l.lw * 0.96, fd = l.ld * 0.96;
  // The hall against the court's back and left walls, lower than a house.
  const b0 = place(l, 0.6, 0.34, l.ld * 1.2), b = { ...b0, x: -fw + 0.0012 + b0.w / 2, z: -fd + 0.0012 + b0.d / 2, h: wallHeight(1) * (l.floors > 1 ? 0.85 : 0.6) };
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xcdb48a));
  out.push(patch(2 * fw - 0.002, 2 * fd - 0.002, 0xbaa074, 0, 0, 0.0005)); // the trodden court
  out.push(...fence(l, 0.0062, wall, 0.008));
  out.push(...frustum(b.w + 0.002, b.d + 0.002, b.w, b.d, b.h, wall, { x: b.x, z: b.z }, wall));
  out.push(ring(b.w, 0.002, b.d, wall, { x: b.x, y: b.h, z: b.z }));
  out.push(onFace(b, 'front', -b.w * 0.1, 0, 0.0055, Math.min(0.009, b.h * 0.62), NI_DARK, E * 5));
  for (const k of [0.17, 0.34]) out.push(onFace(b, 'front', k * b.w, b.h * 0.66, 0.0028, 0.0014, NI_DARK, E * 5));
  // A smoke-blackened vent on the roof, and dough set to rise under a reed shade.
  out.push(...stack(0.0024, 0.004, wall, 0x3a3028, { x: b.x - b.w * 0.32, y: b.h, z: b.z }));
  out.push(...matShade(b.w * 0.4, b.d * 0.6, 0.005, NI_MAT, NI_PALM, { x: b.x + b.w * 0.16, z: b.z, y: b.h }, 2));
  // The granary: beehive silos in a row down the right wall, plastered white, a hatch high in each and a ladder to it.
  const r = Math.min(0.0036, (fw - b.x - b.w / 2) * 0.36), sx = fw - r - 0.0012;
  const nSilo = Math.max(2, Math.min(3, Math.floor((fd * 1.25) / (2.3 * r))));
  for (let k = 0; k < nSilo; k++) {
    const sz = -fd + r + 0.0012 + k * 2.3 * r;
    out.push(cyl(r, r * 0.92, r * 1.7, 8, 0xe6dcc6, { x: sx, z: sz }));
    out.push(dome(r * 0.92, 0xe6dcc6, { x: sx, y: r * 1.7, z: sz, sy: 1.45 }, 6));
    out.push(onFace({ x: sx, z: sz, w: r * 1.84, d: r * 1.84, y: 0, h: r * 2 }, 'left', 0, r * 2.1, r * 0.6, r * 0.55, NI_DARK, E * 2));
    out.push(...box(0.0004, r * 2.3, 0.0016, 0x7a5a3a, { x: sx - r - 0.0009, z: sz, rz: -0.28 }));
  }
  // The court before the hall: a reed shade over the querns and the kneading trough.
  const cz = b.z + b.d / 2, room = fd - cz, qx = b.x + b.w * 0.1, qz = cz + room * 0.4;
  out.push(...matShade(Math.min(0.016, b.w * 0.62), room * 0.36, 0.0068, NI_MAT, NI_PALM, { x: qx, z: qz }, 2, 0.1));
  for (const k of [-1, 1]) out.push(...box(0.0032, 0.0011, 0.0015, 0x8a8278, { x: qx + k * 0.0036, z: qz + 0.0008, rx: -0.12 }));
  out.push(...box(0.005, 0.0014, 0.0018, 0x7a5a3a, { x: qx, z: qz - room * 0.08 }, 0xe0d0a8));
  out.push(...sacks(4, 0.0013, 0xd8c8a0, { x: qx + 0.0005, z: qz - room * 0.22 }));
  // The ovens near the gate: clay drums, smoke-dark mouths up top, bread moulds stacked to heat beside them.
  const ox = -fw + 0.0045, oz = fd - 0.0048;
  for (const [dx, dz] of [[0, 0], [0.006, 0.0006]] as const) {
    out.push(cyl(0.0024, 0.0019, 0.0055, 7, 0x9a6a48, { x: ox + dx, z: oz + dz }));
    out.push(P(new THREE.CircleGeometry(0.0019, 7).rotateX(-Math.PI / 2), 0x1e1a16, { x: ox + dx, y: 0.0055, z: oz + dz }));
  }
  smokeFrom(ox, 0.0055, oz); // (the first oven fired)
  for (let i = 0; i < 4; i++) out.push(cone(0.0006, 0.0016, 4, 0xb06a44, { x: ox + 0.0015 + i * 0.0013, z: oz - 0.0034, rz: Math.PI, y: 0.0016 }));
  // The beer: tall crocks along the front wall, stoppered with clay, fermenting.
  for (let i = 0; i < 4; i++) {
    const x = fw - 0.0022 - i * 0.0034, z = fd - 0.0022;
    out.push(cyl(0.0012, 0.0015, 0.0055, 6, 0xb8784e, { x, z }), cyl(0.0015, 0.0008, 0.0012, 6, 0xb8784e, { x, y: 0.0055, z }));
    out.push(dome(0.0009, 0x6a5a48, { x, y: 0.0067, z }, 5));
  }
  out.push(cyl(0.0011, 0.0009, 0.0024, 6, 0x7a5a3a, { x: fw - 0.0035, z: fd - 0.0068 })); // the mash tub
  return out;
};

// ---------- Chinese (eastAsian) ----------
// The street of a Song city as Zhang Zeduan painted it (Along the River
// During the Qingming Festival): timber posts and white walls on stone
// bases, grey tiled roofs with flared eaves; wine shops behind bamboo
// gateways with a flag at the gate, shops under flat mat awnings, signs
// stood out in the street.
const CN_ROOF = [0x4f5862, 0x5a5e66, 0x4a5a52], CN_WALL = [0xebe6da, 0xe2dccc, 0xd9cfba], CN_WOOD = [0x5a3a2a, 0x6a2e24, 0x4a3426];
const CN_STONE = 0x9a948a, CN_RED = 0xb03a2a, CN_BAMBOO = 0x9a8a50, CN_MAT = 0xb8a070, CN_JAR = 0x4a3428;
// A roof of grey tiles: flared eaves, a hipped (or gabled) top, a dark ridge.
function cnRoof(w: number, d: number, roof: number, wall: number, o: { x: number; y: number; z: number }, gabled = false): G[] {
  const rh = Math.min(w, d) * 0.3, out: G[] = [...frustum(w * 1.18, d * 1.24, w * 0.98, d * 0.98, rh * 0.22, roof, { x: o.x, y: o.y - 0.0004, z: o.z })];
  const y = o.y - 0.0004 + rh * 0.22;
  if (gabled) out.push(...gable(w * 1.06, d * 0.98, rh * 0.8, roof, { x: o.x, y, z: o.z }, false, wall));
  else out.push(hip(w * 0.98, d * 0.98, rh * 0.78, roof, { x: o.x, y, z: o.z }));
  const rl = gabled ? w * 1.06 - 0.0008 : Math.abs(w - d) * 0.5 + 0.004;
  out.push(...box(rl, 0.001, 0.0012, 0x34363a, { x: o.x, y: y + rh * 0.78 - 0.0005, z: o.z }));
  if (gabled) for (const k of [-1, 1]) out.push(...box(0.0014, 0.0022, 0.0014, 0x34363a, { x: o.x + k * (rl / 2 - 0.0009), y: y + rh * 0.78 - 0.0005, z: o.z })); // the ridge's raised ends
  return out;
}
// The body: a stone base, white walls, posts at the corners (and between, `bays`).
function cnBody(b: Body, wall: number, wood: number, bays = 1): G[] {
  const out: G[] = [...box(b.w + 0.003, 0.0016, b.d + 0.003, CN_STONE, { x: b.x, z: b.z }), ...box(b.w, b.h - 0.0016, b.d, wall, { x: b.x, y: 0.0016, z: b.z })];
  for (let i = 0; i <= bays; i++) for (const z of [-1, 1]) out.push(...box(0.0012, b.h - 0.0018, 0.0012, wood, { x: b.x - b.w / 2 + (i * b.w) / bays, y: 0.0016, z: b.z + z * b.d / 2 }));
  return out;
}
// A wine shop (jiudian). Before its door a bamboo gateway (the "festooned
// gate" of the great wine houses), its poles lashed into a peak and hung
// with red and green streamers; at the gate a tall pole flying the
// striped wine flag; inside, the counter and the great jars, more jars
// sealed with red cloth piled in the yard; red lanterns under the eaves,
// and over a taller street an upper room with a railed gallery for guests.
const cnWineShop: Build = (l) => {
  const roof = pick(l, CN_ROOF), wall = pick(l, CN_WALL), wood = pick(l, CN_WOOD), out: G[] = [];
  const b = place(l, 0.78, 0.5, l.ld * 0.34);
  out.push(...yard(l, b, 0xc8c0aa, 0xb0a890, 0.008));
  out.push(...cnBody(b, wall, wood, 3));
  const gs = l.floors > 1 ? b.h * 0.5 : b.h;
  // The open front: dark within, folding lattice boards stacked to each side, the counter across.
  out.push(onFace(b, 'front', 0, 0.0016, b.w * 0.6, gs * 0.72, 0x2a2420, E * 2));
  for (const k of [-1, 1]) for (let i = 0; i < 3; i++) out.push(onFace(b, 'front', k * (b.w * 0.3 - 0.0006 - i * 0.0011), 0.0016, 0.0009, gs * 0.7, i % 2 ? 0x8a6a48 : 0x7a5a3a, E * 3));
  for (const k of [-1, 1]) out.push(onFace(b, 'front', k * b.w * 0.4, gs * 0.35, b.w * 0.12, gs * 0.36, 0xb08a60, E * 2)); // lattice windows
  out.push(...counter(b.w * 0.44, 0.0028, 0.0042, wood, 0x8a6a48, { x: b.x - b.w * 0.06, z: b.z + b.d / 2 + 0.0018 }));
  for (const k of [-0.2, 0.08]) out.push(...pot(0.0013, CN_JAR, { x: b.x + k * b.w, z: b.z + b.d / 2 + 0.0018, y: 0.0042 }));
  if (l.floors > 1) {
    // The upper room's gallery: a floor out on beams, a red rail, the room's lattice behind.
    const gz = b.z + b.d / 2 + 0.002;
    out.push(...frustum(b.w * 1.12, b.d + 0.008, b.w, b.d + 0.001, 0.0016, roof, { x: b.x, y: gs - 0.0012, z: b.z }));
    out.push(...box(b.w * 0.94, 0.0005, 0.004, wood, { x: b.x, y: gs + 0.0006, z: gz }));
    out.push(...box(b.w * 0.94, 0.0024, 0.0004, CN_RED, { x: b.x, y: gs + 0.0011, z: gz + 0.0018 }, 0x8a2a20));
    out.push(onFace(b, 'front', 0, gs + 0.0018, b.w * 0.8, (b.h - gs) * 0.5, 0xb08a60, E * 2));
  }
  out.push(...cnRoof(b.w, b.d, roof, wall, { x: b.x, y: b.h, z: b.z }));
  // Red lanterns under the eaves.
  for (const k of [-0.42, 0.42]) out.push(...lantern(0.0011, CN_RED, { x: b.x + k * b.w, y: b.h - 0.0036, z: b.z + b.d / 2 + 0.0034 }));
  // The bamboo gateway before the door: two poles up past the eaves, crossbars, a peak, streamers.
  const gz = Math.min(b.z + b.d / 2 + 0.0068, l.ld - 0.002), gw = b.w * 0.5, gh = b.h + 0.003;
  for (const k of [-1, 1]) out.push(cyl(0.0003, 0.00026, gh, 4, CN_BAMBOO, { x: b.x + k * gw / 2, z: gz }));
  for (const y of [gh * 0.55, gh * 0.78]) out.push(rodX(gw, 0.00022, 4, CN_BAMBOO, { x: b.x, y, z: gz }));
  for (const k of [-1, 1]) out.push(cyl(0.00022, 0.00022, gw * 0.62, 4, CN_BAMBOO, { x: b.x + k * gw / 2, y: gh * 0.78, z: gz, rz: k * 0.95 }));
  for (let i = 0; i < 5; i++) out.push(P(new THREE.PlaneGeometry(gw * 0.14, gh * 0.2), [CN_RED, 0x3a7a4a, 0xd8b040][i % 3]!, { x: b.x - gw * 0.4 + i * gw * 0.2, y: gh * 0.68, z: gz + 0.0002 }));
  for (const k of [-1, 0, 1]) out.push(P(new THREE.PlaneGeometry(0.0018, 0.0028), k ? CN_RED : 0x3a7a4a, { x: b.x + k * gw * 0.32, y: gh * 0.78 + (1 - Math.abs(k)) * gw * 0.28 + 0.0016, z: gz + 0.0002 }));
  // The wine flag: a tall pole at the gate's side, a long blue-and-white striped banner down it.
  const fx = b.x + b.w / 2 - 0.0008, fz = Math.min(b.z + b.d / 2 + 0.0095, l.ld - 0.0012), fh = b.h + Math.min(b.w, b.d) * 0.3 + 0.008;
  out.push(cyl(0.00035, 0.0003, fh, 4, 0x6a5038, { x: fx, z: fz }));
  out.push(rodX(0.0075, 0.0002, 3, 0x6a5038, { x: fx - 0.0037, y: fh - 0.0004, z: fz }));
  for (let i = 0; i < 4; i++) out.push(P(new THREE.PlaneGeometry(0.0062, 0.0036), i % 2 ? 0xf0ece0 : 0x2e4a7a, { x: fx - 0.0037, y: fh - 0.0022 - i * 0.0036, z: fz, ry: 0.35 }));
  // The yard: jars sealed with red cloth, stacked by the side of the house.
  for (let i = 0; i < 6; i++) {
    const x = b.x - b.w * 0.3 + (i % 3) * 0.0028 + (i >= 3 ? 0.0014 : 0), z = b.z - b.d / 2 - 0.0026 - (i >= 3 ? 0.0026 : 0);
    if (z < -l.ld * 0.94 + 0.0012) continue;
    out.push(...pot(0.0012, CN_JAR, { x, z }, CN_RED));
  }
  out.push(...fence(l, 0.0026, 0xd9d2c0, 0.014).slice(4), shrub(-l.lw * 0.7, -l.ld * 0.76, 0.0028, 0x4f6e3a));
  return out;
};
// A silk merchant's shop: a long gabled front on the street (its ridge
// along it, the overhanging gables of the scroll's shops), a flat awning
// of bamboo matting out over the street on poles, under it a table of
// silks in bolts (crimson, jade, ochre, indigo), tall signboards stood
// in the street on either side, more bolts on the shelves within.
const cnSilkShop: Build = (l) => {
  const roof = pick(l, CN_ROOF), wall = pick(l, CN_WALL), wood = pick(l, CN_WOOD), out: G[] = [];
  const b = place(l, 0.86, 0.46, l.ld * 0.36);
  out.push(...yard(l, b, 0xc8c0aa, 0xb0a890, 0.006));
  out.push(...cnBody(b, wall, wood, 4));
  const gs = l.floors > 1 ? b.h * 0.52 : b.h * 0.86;
  // The front open its whole width between the posts, the shelves of bolts at the back.
  out.push(onFace(b, 'front', 0, 0.0016, b.w * 0.92, gs * 0.78, 0x3a2e26, E * 2));
  const silks = [0xb02a2a, 0x3a8a6a, 0xc89a3a, 0x2e4a7a, 0xd86a6a, 0xe8dcc0];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) out.push(onFace(b, 'front', -b.w * 0.42 + i * b.w * 0.12, 0.0016 + gs * (0.3 + r * 0.22), b.w * 0.09, gs * 0.12, silks[(i + r * 3) % silks.length]!, E * 3));
  if (l.floors > 1) {
    out.push(onFace(b, 'front', 0, gs + 0.0012, b.w, 0.0008, wood, BAND));
    out.push(...windows(b, 'front', { floors: 1, storey: b.h - gs, base: gs, w: 0.004, h: (b.h - gs) * 0.4, spacing: 0.01, sill: (b.h - gs) * 0.3, color: 0xb08a60, frame: wood }));
  }
  out.push(...cnRoof(b.w, b.d, roof, wall, { x: b.x, y: b.h, z: b.z }, true));
  // The mat awning: flat, a little tilted, on bamboo poles at the street's edge.
  const ad = Math.min(0.0095, l.ld - (b.z + b.d / 2) - 0.0015), ah = Math.min(gs, 0.014);
  const az = b.z + b.d / 2 + ad / 2;
  out.push(P(new THREE.PlaneGeometry(b.w * 0.9, ad).rotateX(-Math.PI / 2 + 0.12), CN_MAT, { x: b.x, y: ah - Math.sin(0.12) * ad / 2, z: az }));
  for (const k of [-0.43, 0, 0.43]) out.push(cyl(0.00026, 0.00026, ah - Math.sin(0.12) * ad, 4, CN_BAMBOO, { x: b.x + k * b.w, z: az + ad / 2 - 0.0004 }));
  // The table of silks: bolts lying across it, a stool for the merchant.
  out.push(...counter(b.w * 0.5, 0.0034, 0.0034, wood, 0x8a6a48, { x: b.x + b.w * 0.08, z: az + 0.0006 }));
  for (let i = 0; i < 6; i++) out.push(rodZ(0.0028, 0.0006, 5, silks[i]!, { x: b.x + b.w * 0.08 - b.w * 0.2 + i * b.w * 0.08, y: 0.0041, z: az + 0.0006 }));
  // Two tall signboards stood in the street, each on its little stand.
  const sz = l.ld - 0.0016;
  for (const k of [-1, 1]) {
    const x = b.x + k * (b.w * 0.5 - 0.0016);
    out.push(...box(0.0026, 0.0008, 0.0016, wood, { x, z: sz }));
    out.push(...box(0.0018, 0.011, 0.00035, 0xf0ece0, { x, y: 0.0008, z: sz }, wood));
    for (let i = 0; i < 4; i++) out.push(...box(0.001, 0.0011, 0.0004, 0x2a2622, { x, y: 0.0024 + i * 0.0022, z: sz + 0.00005 }));
  }
  out.push(...fence(l, 0.0026, 0xd9d2c0).slice(0, 6), shrub(l.lw * 0.7, -l.ld * 0.74, 0.003, 0x4f6e3a));
  return out;
};
// A dragon kiln (longyao), the climbing kiln of the south: a long vaulted
// tube of brick running up a slope, its firebox at the foot, stoke holes
// down its side, a shed roof over its length; beside it the potters'
// workshop, wares drying on boards (white bodies banded in cobalt, and
// celadon), pine firewood stacked.
const cnKiln: Build = (l) => {
  const roof = pick(l, CN_ROOF), wall = pick(l, CN_WALL), wood = pick(l, CN_WOOD), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8aa8a));
  // The workshop: on the left, along the street.
  const b0 = place(l, 0.46, 0.34, l.ld * 0.42), b = { ...b0, x: l.lw * 0.94 - 0.0016 - b0.w / 2, h: wallHeight(1) * (l.floors > 1 ? 0.9 : 0.72) };
  out.push(...cnBody(b, wall, wood, 2));
  out.push(...doubleDoor(b, 'front', 0, 0.006, b.h * 0.6, 0x6a4a34, wood));
  out.push(onFace(b, 'left', 0, b.h * 0.4, b.d * 0.5, b.h * 0.3, 0xb08a60, E * 2));
  out.push(...cnRoof(b.w, b.d, roof, wall, { x: b.x, y: b.h, z: b.z }, true));
  // The kiln: its length down the lot (front to back), rising toward the back.
  const len = 2 * l.ld * 0.78, r = Math.min(0.0042, l.lw * 0.2), kx = Math.max(-l.lw * 0.94 + r + 0.0034, b.x - b.w / 2 - 0.0065 - r), rise = 0.12;
  // (Laid on its earth ramp: the ground rising toward the back of the lot.)
  const tube = new THREE.CylinderGeometry(r, r, len, 8, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
  out.push(wedge(r * 2 + 0.003, len + 0.002, (len + 0.002) * Math.tan(rise), 0x9a8a6a, { x: kx, z: -0.001 }));
  out.push(P(tube, 0x9a5a3a, { x: kx, y: len / 2 * Math.tan(rise) + 0.0001, z: -0.001, rx: rise }));
  // The firebox at the foot (toward the street), its dark mouth; the flue at the head.
  const fz = len / 2 + 0.0008;
  out.push(...box(r * 2.2, r * 1.4, 0.0034, 0x8a5a3a, { x: kx, z: fz }));
  out.push(onFace({ x: kx, z: fz, w: r * 2.2, d: 0.0034, y: 0, h: r }, 'front', 0, 0.0002, r * 0.9, r * 0.8, 0x1e1a16));
  out.push(...stack(0.0034, len * Math.tan(rise) + r + 0.004, 0x8a5a3a, 0x3a3028, { x: kx, z: -len / 2 - 0.0008 }));
  // Stoke holes down the side facing the yard.
  for (let i = 1; i < 6; i++) {
    const z = len / 2 - i * len / 6, y = (len / 2 - z) * Math.tan(rise) + r * 0.45;
    out.push(P(new THREE.PlaneGeometry(0.0012, 0.0012).rotateY(Math.PI / 2), 0x1e1a16, { x: kx + r * 0.9 + 0.0001, y, z }));
  }
  // The shed over it: a long gabled roof on posts.
  // The shed over it, in steps up the slope: short gabled roofs on posts, open at the sides.
  const steps = 3, sl = len / steps;
  for (let i = 0; i < steps; i++) {
    const z = len / 2 - (i + 0.5) * sl, sh = (len / 2 - z + sl / 2) * Math.tan(rise) + r + 0.0028;
    out.push(...gable(r * 2 + 0.0055, sl + 0.0012, 0.003, roof, { x: kx, y: sh, z }, true, 0x8a5a3a));
    for (const k of [-1, 1]) out.push(cyl(0.00028, 0.00028, sh, 4, wood, { x: kx + k * (r + 0.0022), z: z + sl * 0.4 }));
  }
  // Pine faggots stacked down the stoking side.
  out.push(...logs(5, len * 0.4, 0.0006, 0xa88a5a, { x: kx + r + 0.0028, z: len * 0.12, ry: Math.PI / 2 }));
  // Wares drying on boards before the workshop; firewood stacked behind it.
  const wz = Math.min(b.z + b.d / 2 + 0.0055, l.ld * 0.94 - 0.0085), wxs = [b.x - b.w * 0.3, b.x + b.w * 0.15];
  for (const wx of wxs) {
    out.push(...box(b.w * 0.42, 0.0006, 0.0034, 0x8a6a48, { x: wx, y: 0.0018, z: wz }));
    for (const k of [-1, 1]) out.push(...box(0.0006, 0.0018, 0.003, 0x6a5038, { x: wx + k * b.w * 0.18, z: wz }));
    for (let i = 0; i < 4; i++) {
      const x = wx - b.w * 0.15 + i * b.w * 0.1, blue = (i + (wx > b.x ? 1 : 0)) % 2 === 0;
      out.push(cyl(0.0007, 0.0009, 0.0018, 6, blue ? 0xeeeee8 : 0x8ab89a, { x, y: 0.0024, z: wz }));
      if (blue) out.push(cyl(0.00092, 0.00092, 0.0004, 6, 0x2e4a8a, { x, y: 0.0031, z: wz }));
    }
  }
  out.push(...logs(6, Math.min(0.012, b.w * 0.7), 0.0008, 0x8a6a48, { x: b.x, z: b.z - b.d / 2 - 0.0042 }));
  for (let i = 0; i < 3; i++) out.push(...pot(0.0011, 0x8ab89a, { x: b.x - b.w * 0.2 + i * 0.003, z: Math.min(wz + 0.0052, l.ld * 0.94 - 0.0012) }));
  return out;
};

// ---------- English (northern) ----------
// A medieval English market street: timber frames filled with wattle and
// daub, steep thatch (or clay tiles in town), upper floors jettied out
// over the street; shops opened by letting down the lower shutter as a
// stall board and propping the upper one as a canopy; an alehouse known
// by the ale-stake with its bush over the door.
const EN_TIMBER = [0x6a4e34, 0x5e4430, 0x725638], EN_THATCH = [0x9a7a40, 0x8a6e3a, 0xa8884a], EN_DAUB = [0xddd0b0, 0xd4c4a0, 0xe2d6bc];
const EN_TILE = 0x9a5a3e, EN_STONE = 0x8e8a80, EN_DARK = 0x2a2420;
// A face's timber frame: posts `step` apart, a rail, braces from the corners.
function enFrame(b: Body, f: Face, y: number, h: number, wood: number, step = 0.0055, braces = true): G[] {
  const fw = faceWidth(b, f), out: G[] = [...strips(b, f, y, h, 0.0008, step, wood, BAND)];
  out.push(onFace(b, f, 0, y + h * 0.5, fw, 0.0007, wood, BAND), onFace(b, f, 0, y + h - 0.0008, fw, 0.0008, wood, BAND));
  if (braces) for (const k of [-1, 1]) out.push(tilted(b, f, k * (fw / 2 - h * 0.22), y + h * 0.27, 0.0007, h * 0.55, k * 0.6, wood, BAND));
  return out;
}
// An alehouse: a brewster's house, long on the street under its thatch,
// its frame and daub; the ale-stake out over the door, a bush of green
// leaves at its end (the sign the ale-taster came to); a trestle table
// and benches before it, casks by the wall, a brewhouse lean-to at the side,
// and over a taller street the upper floor jettied out on its joists.
const enAlehouse: Build = (l) => {
  const timber = pick(l, EN_TIMBER), thatch = pick(l, EN_THATCH), daub = pick(l, EN_DAUB), out: G[] = [];
  const b = place(l, 0.74, 0.48, l.ld * 0.36), s = storeys(l);
  out.push(...yard(l, b, 0x7d9a55, 0x9a8a6a, 0.007));
  const gs = l.floors > 1 ? s.base + s.storey : b.h;
  out.push(...box(b.w, gs, b.d, daub, { x: b.x, z: b.z }));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0013, gs - 0.0002, 0.0013, timber, { x: b.x + x * b.w / 2, z: b.z + z * b.d / 2 }));
  const gb: Body = { ...b, h: gs };
  out.push(...enFrame(gb, 'front', 0, gs, timber, 0.007, false), ...enFrame(gb, 'left', 0, gs, timber, 0.008), ...enFrame(gb, 'right', 0, gs, timber, 0.008));
  let top: Body = gb;
  if (l.floors > 1) {
    // The jetty: the upper floor out over the street on the joists' ends.
    const j = 0.0026, ub: Body = { x: b.x, z: b.z + j / 2, w: b.w + 0.001, d: b.d + j, y: gs, h: b.h - gs };
    out.push(...box(ub.w, ub.h, ub.d, daub, { x: ub.x, y: gs, z: ub.z }));
    out.push(...box(ub.w + 0.0004, 0.0009, ub.d + 0.0004, timber, { x: ub.x, y: gs - 0.0004, z: ub.z }));
    out.push(...enFrame(ub, 'front', gs, ub.h, timber, 0.0045), ...enFrame(ub, 'left', gs, ub.h, timber, 0.006, false));
    out.push(...windows(ub, 'front', { floors: 1, storey: ub.h, base: 0, w: 0.0034, h: ub.h * 0.36, spacing: 0.012, sill: ub.h * 0.3, color: EN_DARK, frame: 0x8a6a48 }));
    top = ub;
  }
  out.push(onFace(b, 'front', -b.w * 0.18, 0, 0.0052, Math.min(0.0095, gs * 0.72), 0x5a4030, E * 2));
  for (const k of [0.12, 0.34]) out.push(onFace(b, 'front', k * b.w, gs * 0.42, 0.0042, gs * 0.28, EN_DARK, E * 2), onFace(b, 'front', k * b.w, gs * 0.42 - 0.0005, 0.005, 0.0005, timber, E * 3));
  out.push(...gable(top.w + 0.009, top.d + 0.009, Math.min(top.w, top.d) * 0.62, thatch, { x: top.x, y: b.h - 0.0015, z: top.z }, false, timber));
  out.push(...box(top.w + 0.004, 0.0014, 0.0024, shade(thatch, 0.8), { x: top.x, y: b.h - 0.0015 + Math.min(top.w, top.d) * 0.62 - 0.0009, z: top.z })); // the ridge, bound
  out.push(...stack(0.003, b.h * 0.5, 0x8a7a6a, 0x4a4038, { x: b.x + b.w * 0.3, y: b.h * 0.7, z: b.z - b.d * 0.12 }));
  // The ale-stake: a pole out from over the door, a green bush at its end.
  const ay = gs - 0.0016, az = top.z + top.d / 2, sl = Math.min(0.012, l.ld - az - 0.0026), ax = b.x - b.w * 0.02;
  out.push(cyl(0.0004, 0.0003, sl, 4, 0x6a5038, { x: ax, y: ay, z: az, rx: Math.PI / 2 - 0.1 }));
  out.push(cyl(0.00015, 0.00015, 0.002, 3, 0x3a3028, { x: ax, y: ay - 0.0012 + sl * 0.1, z: az + sl - 0.0008 }));
  out.push(P(new THREE.IcosahedronGeometry(0.0034, 0), 0x4f7a34, { x: ax, y: ay - 0.0042 + sl * 0.1, z: az + sl - 0.0008, sy: 1.2 }));
  // Before the door: a trestle table and two benches; casks by the wall.
  const tz = b.z + b.d / 2 + Math.min(0.0068, (l.ld - b.z - b.d / 2) * 0.55), tx = b.x + b.w * 0.26;
  out.push(...counter(0.011, 0.0034, 0.0034, 0x6a5038, 0x8a6a48, { x: tx, z: tz }));
  for (const k of [-1, 1]) out.push(...box(0.011, 0.002, 0.001, 0x6a5038, { x: tx, z: tz + k * 0.0032 }, 0x8a6a48));
  // Casks by the wall, two on their sides and one atop them.
  const cx = b.x - b.w * 0.36, cz = b.z + b.d / 2 + 0.0019;
  for (const k of [-1, 1]) out.push(cyl(0.0014, 0.0014, 0.0034, 6, 0x7a5a3a, { x: cx + k * 0.0015, y: 0.0014, z: cz - 0.0017, rx: Math.PI / 2 }));
  out.push(cyl(0.0014, 0.0014, 0.0034, 6, 0x6a4c30, { x: cx, y: 0.0039, z: cz - 0.0017, rx: Math.PI / 2 }));
  // The brewhouse: a lean-to against the side, its own little smoke hole.
  const side = b.x - b.w / 2 - 0.0062 > -l.lw * 0.94 ? -1 : 1, lx = b.x + side * (b.w / 2 + 0.003);
  if (Math.abs(lx) + 0.003 < l.lw * 0.94) {
    out.push(...box(0.006, 0.0075, b.d * 0.6, daub, { x: lx, z: b.z - b.d * 0.1 }));
    out.push(...leanTo(b.d * 0.6 + 0.002, 0.0072, 0.011, 0.0068, thatch, timber, { x: b.x + side * b.w / 2, z: b.z - b.d * 0.1, ry: side * Math.PI / 2 }));
  }
  out.push(...fence(l, 0.0028, 0x7a6248, 0.012).slice(4), ...tree(l.lw * 0.7, -l.ld * 0.7, 1, 0x4f6e38));
  return out;
};
// A butcher's shop in the Shambles: a tall narrow house with its gable to
// the street under clay tiles, close-studded, the upper floor jettied out
// (on a low street a pent roof instead). Its window opened by day: the
// lower shutter let down as the stall board with the joints laid on it,
// the upper propped as a canopy; carcasses hung from hooks under the
// jetty; a chopping block by the door.
const enButcher: Build = (l) => {
  const timber = pick(l, EN_TIMBER), daub = pick(l, EN_DAUB), out: G[] = [];
  const b = place(l, 0.6, 0.62, l.ld * 0.3), s = storeys(l);
  out.push(...yard(l, b, 0x8a9a62, 0x9a8a6a, 0.006));
  out.push(patch(2 * l.lw * 0.9, l.ld - (b.z + b.d / 2), 0x9a907a, 0, (l.ld + b.z + b.d / 2) / 2, 0.0006)); // the paved street front
  out.push(...box(b.w + 0.002, 0.0014, b.d + 0.002, EN_STONE, { x: b.x, z: b.z })); // a stone sill wall
  const gs = l.floors > 1 ? s.base + s.storey : b.h;
  out.push(...box(b.w, gs - 0.0014, b.d, daub, { x: b.x, y: 0.0014, z: b.z }));
  const gb: Body = { ...b, h: gs };
  for (const f of ['left', 'right'] as Face[]) out.push(...enFrame(gb, f, 0.0014, gs - 0.0014, timber, 0.0035));
  out.push(...strips(gb, 'front', 0.0014, gs - 0.0014, 0.0008, 0.0028, timber, FRAME));
  // The shop window: dark within, the canopy shutter propped above it, the stall board let down below.
  const ww = b.w * 0.56, wx = b.x + b.w * 0.12, wy = gs * 0.32, wh = gs * 0.42, fz = b.z + b.d / 2;
  out.push(onFace(b, 'front', b.w * 0.12, wy, ww, wh, EN_DARK, E * 2));
  out.push(onFace(b, 'front', -b.w * 0.33, 0.0014, 0.0045, Math.min(0.0095, gs * 0.7), 0x5a4030, E * 2));
  out.push(P(new THREE.PlaneGeometry(ww + 0.001, 0.0045).rotateX(-Math.PI / 2 + 0.5), 0x7a5a3a, { x: wx, y: wy + wh - 0.001, z: fz + 0.0019 }));
  out.push(...box(ww + 0.001, 0.0005, 0.0042, 0x8a6a48, { x: wx, y: wy - 0.0004, z: fz + 0.0021 }));
  for (const k of [-1, 1]) out.push(...box(0.0005, wy - 0.0004, 0.0005, 0x5a4030, { x: wx + k * ww * 0.46, z: fz + 0.0038 }));
  for (let i = 0; i < 5; i++) out.push(...box(0.0018, 0.0007, 0.0014, i % 2 ? 0xb04a4a : 0xc86a6a, { x: wx - ww * 0.38 + i * ww * 0.19, y: wy + 0.0001, z: fz + 0.0022 + (i % 2) * 0.0008 }, i % 2 ? 0xe8d8c8 : 0xc86a6a));
  let top: Body = gb, hookY = gs - 0.0012, hookZ = fz + 0.0016;
  if (l.floors > 1) {
    const j = 0.003, ub: Body = { x: b.x, z: b.z + j / 2, w: b.w + 0.0008, d: b.d + j, y: gs, h: b.h - gs };
    out.push(...box(ub.w, ub.h, ub.d, daub, { x: ub.x, y: gs, z: ub.z }));
    out.push(...box(ub.w + 0.0004, 0.0009, ub.d + 0.0004, timber, { x: ub.x, y: gs - 0.0004, z: ub.z }));
    out.push(...strips(ub, 'front', gs, ub.h, 0.0008, 0.0028, timber, FRAME), ...enFrame(ub, 'left', gs, ub.h, timber, 0.0035, false), ...enFrame(ub, 'right', gs, ub.h, timber, 0.0035, false));
    out.push(onFace(ub, 'front', 0, gs + ub.h * 0.3, ub.w * 0.6, ub.h * 0.34, 0x8a8a7a, E * 2), onFace(ub, 'front', 0, gs + ub.h * 0.3 - 0.0006, ub.w * 0.66, 0.0006, timber, E * 3));
    top = ub; hookZ = ub.z + ub.d / 2 + 0.0004;
  } else {
    out.push(...leanTo(b.w + 0.002, 0.0048, gs + 0.0002, gs - 0.0026, EN_TILE, timber, { x: b.x, z: fz }));
    hookY = gs - 0.0032; hookZ = fz + 0.0036;
  }
  // The gable to the street: tiled, its end framed with a king post and a little window.
  const rh = top.w * 0.75;
  out.push(...gable(top.w + 0.004, top.d + 0.004, rh, EN_TILE, { x: top.x, y: b.h, z: top.z }, true, daub));
  const gz = top.z + top.d / 2 + 0.002;
  out.push(P(new THREE.PlaneGeometry(0.0008, rh * 0.9), timber, { x: top.x, y: b.h + rh * 0.45, z: gz + E }));
  out.push(P(new THREE.PlaneGeometry(top.w + 0.004, 0.0009), timber, { x: top.x, y: b.h + 0.00045, z: gz + E }));
  out.push(P(new THREE.PlaneGeometry(0.0026, 0.0026), EN_DARK, { x: top.x, y: b.h + rh * 0.38, z: gz + E * 2 }));
  // Carcasses on hooks along a rail under the jetty (or the pent roof).
  out.push(rodX(b.w * 0.8, 0.0002, 3, 0x3a3a3a, { x: b.x, y: hookY, z: hookZ }));
  for (let i = 0; i < 3; i++) {
    const x = b.x - b.w * 0.32 + i * b.w * 0.18;
    out.push(P(new THREE.OctahedronGeometry(0.0011, 0), i === 1 ? 0xa84a44 : 0xc0605a, { x, y: hookY - 0.0026, z: hookZ, sy: 2.1, sz: 0.7 }));
  }
  out.push(cyl(0.0016, 0.0016, 0.0028, 6, 0x8a6a48, { x: b.x - b.w * 0.33, z: Math.min(fz + 0.0058, l.ld - 0.002) })); // the block
  out.push(...barrels(1, 0.0012, 0x6a5038, { x: b.x + b.w / 2 + 0.0004, z: fz + 0.0058 }));
  out.push(...tree(-l.lw * 0.68, -l.ld * 0.72, 0.9, 0x4f6e38));
  return out;
};
// A smithy: a low forge of rubble stone under thatch, its great stone
// chimney at the gable; the hearth open toward an open-fronted shed on
// posts where the anvil stands on its block, the quenching trough beside
// it; outside, the travis (the frame horses were tied in to be shod),
// a cartwheel waiting for its iron tyre, a heap of charcoal, a cart.
const enSmithy: Build = (l) => {
  const timber = pick(l, EN_TIMBER), thatch = pick(l, EN_THATCH), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x7d9a55));
  out.push(patch(2 * l.lw * 0.86, l.ld * 1.2, 0x8a7e66, 0, l.ld * 0.36, 0.0005)); // the trodden yard
  const b0 = place(l, 0.52, 0.4, l.ld * 0.62), b = { ...b0, x: -l.lw * 0.94 + 0.0018 + b0.w / 2, h: wallHeight(1) * 0.62 };
  out.push(...box(b.w, b.h, b.d, EN_STONE, { x: b.x, z: b.z }));
  for (const f of ['front', 'left'] as Face[]) out.push(...bands(b, [b.h * 0.33, b.h * 0.66], 0.0004, 0x7a766e, [f]));
  out.push(...gable(b.w + 0.008, b.d + 0.008, Math.min(b.w, b.d) * 0.6, thatch, { x: b.x, y: b.h - 0.0012, z: b.z }, false, EN_STONE));
  // The chimney: a broad stone stack up the gable end, its hearth's glow in the open side.
  out.push(...stack(0.0055, b.h + Math.min(b.w, b.d) * 0.6 + 0.004, 0x8a8478, 0x4a4440, { x: b.x - b.w / 2 + 0.0026, z: b.z - b.d * 0.05 }));
  out.push(...doubleDoor(b, 'front', -b.w * 0.15, 0.0058, b.h * 0.62, 0x5a4030, timber));
  out.push(onFace(b, 'front', b.w * 0.24, b.h * 0.42, 0.0034, 0.0024, EN_DARK, E * 2));
  // The open shed against the forge's right: a thatched lean-to on posts, the hearth inside, the anvil, the trough.
  const sw = Math.min(0.016, l.lw * 0.94 - (b.x + b.w / 2) - 0.004), sx = b.x + b.w / 2 + sw / 2, sd = b.d * 0.9;
  out.push(...leanTo(sd, sw, b.h * 0.95, b.h * 0.62, thatch, timber, { x: b.x + b.w / 2, z: b.z, ry: Math.PI / 2 }));
  out.push(...leanTo(sd, sw, b.h * 0.95, b.h * 0.62, thatch, timber, { x: b.x + b.w / 2, z: b.z, ry: Math.PI / 2 }).slice(1).map((g) => g.translate(0, 0, -sd + 0.0008)));
  out.push(...box(0.0045, 0.0032, 0.004, 0x7a766e, { x: b.x + b.w / 2 + 0.0024, z: b.z - b.d * 0.22 }, 0x2a2622)); // the hearth
  out.push(P(new THREE.CircleGeometry(0.0012, 5).rotateX(-Math.PI / 2), 0xe0702a, { x: b.x + b.w / 2 + 0.0024, y: 0.00322, z: b.z - b.d * 0.22 }));
  out.push(...anvil(0.0022, { x: sx + 0.0008, z: b.z + b.d * 0.08 }));
  out.push(...box(0.0045, 0.0018, 0.0018, 0x5a4636, { x: sx + 0.001, z: b.z + b.d * 0.36 }, 0x3a4a5a)); // the trough
  // The travis: four stout posts, rails along them.
  const tx = Math.min(l.lw * 0.5, l.lw * 0.94 - 0.0062), tz = b.z + b.d / 2 + Math.min(0.0085, (l.ld - b.z - b.d / 2) * 0.55);
  for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0009, 0.0062, 0.0009, timber, { x: tx + a * 0.0025, z: tz + c * 0.0042 }));
  for (const a of [-1, 1]) out.push(...box(0.0006, 0.0007, 0.0094, timber, { x: tx + a * 0.0025, y: 0.0042, z: tz }));
  out.push(...box(0.0058, 0.0008, 0.0008, timber, { x: tx, y: 0.0056, z: tz - 0.0042 }));
  // A cartwheel against the forge wall, charcoal in a heap, a cart in for mending.
  const wz = b.z + b.d / 2 + 0.0004;
  out.push(cyl(0.0026, 0.0026, 0.0004, 8, 0x6a5038, { x: b.x + b.w * 0.3, y: 0.0025, z: wz + 0.0006, rx: Math.PI / 2 - 0.25 }));
  out.push(cone(0.0034, 0.0022, 6, 0x2a2826, { x: b.x - b.w * 0.2, z: Math.min(wz + 0.006, l.ld * 0.9 - 0.0035) }));
  // Behind, the winter's wood for the charcoal and a grindstone in its frame.
  out.push(...logs(6, 0.009, 0.0008, 0x7a5a3a, { x: l.lw * 0.4, z: -l.ld * 0.7 }));
  out.push(rodX(0.0008, 0.0022, 8, 0x9a948a, { x: tx, y: 0.0026, z: tz - 0.0085 + 0.0004 }), ...box(0.003, 0.0016, 0.0012, timber, { x: tx, z: tz - 0.0081 }));
  return out;
};

// ---------- Mongol (yurt) ----------
// A camp of gers: felt over a lattice, a painted door to the south, a
// crown ring at the top. The steppe's trades were its herds' (milk,
// felt, hides) and the caravans' (Karakorum's market, silk and carpets
// come up the roads); tents for shade and trade, carts, the tether line.
const MN_FELT = [0xebe2cc, 0xe0d4b8, 0xd8ccb0], MN_BAND = [0xa84a3a, 0x3a5a8a, 0x7a5a2a];
const MN_DOOR = 0xb8603a, MN_POLE = 0xb8503a, MN_WOOD = 0x6a5038, MN_GRASS = 0x8aa060;
// A ger: felt drum and cone, a band round it, the crown, the door facing +z (turned by ry).
function ger(x: number, z: number, r: number, h: number, felt: number, band: number, ry = 0): G[] {
  return [
    cyl(r, r, h, 9, felt, { x, z }), cyl(r * 1.01, r * 1.01, h * 0.12, 9, band, { x, y: h * 0.55, z }),
    cone(r * 1.04, r * 0.55, 9, felt, { x, y: h, z }), cyl(r * 0.18, r * 0.18, r * 0.12, 6, MN_WOOD, { x, y: h + r * 0.5, z }),
    P(new THREE.PlaneGeometry(r * 0.45, h * 0.75).translate(0, h * 0.375, r * 1.02 + E * 2), MN_DOOR, { x, z, ry }),
  ];
}
// A camel lying down (a caravan's): a body, its hump, the neck and head up.
function camel(c: number, o: { x: number; z: number; ry: number }): G[] {
  const s = Math.sin(o.ry), k = Math.cos(o.ry), at = (a: number) => ({ x: o.x + a * k, z: o.z - a * s });
  return [
    P(new THREE.OctahedronGeometry(0.0026, 0), c, { ...at(0), y: 0.0016, sx: 1.4, sy: 0.6, ry: o.ry }),
    P(new THREE.OctahedronGeometry(0.0013, 0), c, { ...at(-0.0003), y: 0.0028, sy: 1.1, ry: o.ry }),
    cyl(0.0004, 0.0003, 0.0034, 4, c, { ...at(0.0034), y: 0.0016, rz: -0.5, ry: o.ry }),
    P(new THREE.OctahedronGeometry(0.0007, 0), c, { ...at(0.0052), y: 0.0046, sx: 1.6, ry: o.ry }),
  ];
}
// A carpet laid on the grass: its field, a border round it.
const carpet = (w: number, d: number, field: number, border: number, x: number, z: number, y: number): G[] => [
  patch(w, d, border, x, z, y), patch(w - 0.0012, d - 0.0012, field, x, z, y + 0.0001),
];
// An airag seller: the herding family's ger, mare's milk fermenting in
// leather bags (khukhuur) hung on a stand by the door and churned in a
// tall tub; a blue cloth shade on poles before it where travellers sit
// on felt to drink from wooden bowls; curd (aaruul) set out to dry on a
// board; the tether line (zel) where the mares are milked.
const mnAirag: Build = (l) => {
  const felt = pick(l, MN_FELT), band = pick(l, MN_BAND), out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, MN_GRASS)];
  const two = l.floors > 1, r = Math.min(l.lw, l.ld) * (two ? 0.56 : 0.48), h = l.H * (two ? 0.5 : 0.7), gz = -l.ld * 0.28;
  out.push(...ger(-l.lw * 0.2, gz, r, h, felt, band));
  if (l.lw > 0.03 || two) out.push(...ger(l.lw * 0.6, -l.ld * 0.62, r * 0.5, h * 0.7, felt, band, -0.5));
  // The shade: a cloth in sky blue, its edge banded white, on four poles before the door.
  const sw = Math.min(2 * l.lw * 0.7, r * 2.2), sd = Math.min(l.ld - (gz + r) - 0.0025, 0.014), sz = gz + r + sd / 2 + 0.001, sx = -l.lw * 0.2, sh = Math.min(h * 0.8, 0.012);
  out.push(...stall(sw, sd, sh, 0x3a6aa8, MN_WOOD, { x: sx, z: sz }));
  out.push(patch(sw * 0.8, sd * 0.7, 0xc8b898, sx, sz, 0.0006), patch(sw * 0.8 - 0.0012, sd * 0.7 - 0.0012, 0xa83a2a, sx, sz, 0.0007)); // felt rug
  out.push(...counter(sw * 0.32, 0.0026, 0.0016, 0x8a5a3a, 0xa86a3a, { x: sx, z: sz }));
  for (const k of [-1, 0, 1]) out.push(cyl(0.0005, 0.0003, 0.0004, 5, 0xe8dcc0, { x: sx + k * sw * 0.1, y: 0.0016, z: sz }));
  // The khukhuur on its stand by the door; the churn.
  const kx = sx + r * 0.75;
  out.push(...box(0.0045, 0.0006, 0.0006, MN_WOOD, { x: kx, y: 0.0045, z: gz + r + 0.0016 }));
  for (const k of [-1, 1]) out.push(...box(0.0005, 0.0045, 0.0005, MN_WOOD, { x: kx + k * 0.0021, z: gz + r + 0.0016 }));
  for (const k of [-0.0011, 0.0011]) out.push(P(new THREE.OctahedronGeometry(0.0013, 0), 0x6a4026, { x: kx + k, y: 0.0028, z: gz + r + 0.0016, sy: 1.3 }));
  out.push(cyl(0.0011, 0.001, 0.0042, 6, 0x8a5a3a, { x: sx - r * 0.8, z: gz + r * 0.8 + 0.0012 }), cyl(0.00015, 0.00015, 0.0022, 3, MN_WOOD, { x: sx - r * 0.8, y: 0.0042, z: gz + r * 0.8 + 0.0012 }));
  // Aaruul drying on a board on trestles, beside the ger.
  const ax = -l.lw * 0.72, az = -l.ld * 0.7;
  out.push(...counter(0.006, 0.004, 0.0028, MN_WOOD, 0x9a7a52, { x: ax, z: az }));
  for (let i = 0; i < 6; i++) out.push(...box(0.0007, 0.0004, 0.0007, 0xf2ecd8, { x: ax - 0.002 + (i % 3) * 0.002, y: 0.0028, z: az - 0.0009 + Math.floor(i / 3) * 0.0018 }));
  // The zel: a tether line along the street side, staked at its ends, a foal or two tied to it.
  const zz = l.ld * 0.86, zw = 2 * l.lw * 0.7;
  out.push(rodX(zw, 0.00015, 3, 0x4a3828, { x: 0, y: 0.0014, z: zz }));
  for (const k of [-1, 1]) out.push(cyl(0.0003, 0.0003, 0.0022, 4, MN_WOOD, { x: k * zw / 2, z: zz }));
  // Mare's milk in pails by the line.
  for (const k of [-0.2, 0.1]) out.push(cyl(0.0007, 0.0008, 0.0014, 6, 0x9a6a3a, { x: k * zw, z: zz - 0.002 }));
  return out;
};
// A caravan merchant's tent at the edge of the market: a long white
// ridge tent (a maikhan) appliquéd in blue, its front flap propped up on
// two poles as an awning; carpets from the west laid out on the grass
// before it, bales of silk and bricks of tea stacked, a camel of the
// caravan lying by its load.
const mnTent: Build = (l) => {
  const felt = pick(l, MN_FELT), band = pick(l, MN_BAND), out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, MN_GRASS)];
  const two = l.floors > 1, tw = 2 * l.lw * 0.72, td = Math.min(2 * l.ld * 0.42, 0.024), th = l.H * (two ? 0.5 : 0.62), tz = -l.ld + 0.006 + td / 2 + (l.ld > 0.03 ? l.ld * 0.15 : 0);
  // The tent: low side walls of cloth and its ridge roof, the ends closed, a blue band and knots of appliqué.
  const wall = th * 0.35;
  out.push(...box(tw, wall, td, felt, { x: 0, z: tz }));
  out.push(...gable(tw + 0.002, td + 0.002, th - wall, felt, { x: 0, y: wall, z: tz }, false, felt));
  out.push(onFace({ x: 0, z: tz, w: tw, d: td, y: 0, h: wall }, 'front', 0, wall * 0.55, tw, wall * 0.22, 0x2e4a8a, BAND));
  for (const k of [-0.35, 0, 0.35]) out.push(P(new THREE.CircleGeometry(0.0016, 4).rotateX(-Math.PI / 2 + Math.atan2(th - wall, td / 2 + 0.001)), 0x2e4a8a, { x: k * tw, y: wall + (th - wall) * 0.5 + 0.0002, z: tz + (td / 2 + 0.001) * 0.5 + 0.0002 }));
  out.push(cyl(0.0003, 0.0003, th + 0.004, 4, MN_POLE, { x: -tw / 2 + 0.002, z: tz }), cyl(0.0003, 0.0003, th + 0.004, 4, MN_POLE, { x: tw / 2 - 0.002, z: tz }));
  out.push(cone(0.0006, 0.0018, 4, 0xd8b040, { x: -tw / 2 + 0.002, y: th + 0.004, z: tz }), cone(0.0006, 0.0018, 4, 0xd8b040, { x: tw / 2 - 0.002, y: th + 0.004, z: tz }));
  // The front: dark within, the flap propped out over two red poles.
  out.push(onFace({ x: 0, z: tz, w: tw, d: td, y: 0, h: wall }, 'front', 0, 0, tw * 0.5, wall * 0.9, 0x3a2e26, E * 2));
  const fd = Math.min(0.009, l.ld - (tz + td / 2) - 0.004);
  out.push(P(new THREE.PlaneGeometry(tw * 0.56, fd).rotateX(-Math.PI / 2 + 0.25), felt, { x: 0, y: wall + 0.0024 - Math.sin(0.25) * fd / 2, z: tz + td / 2 + fd / 2 }));
  for (const k of [-1, 1]) out.push(cyl(0.00028, 0.00028, wall + 0.0024 - Math.sin(0.25) * fd, 4, MN_POLE, { x: k * tw * 0.27, z: tz + td / 2 + fd - 0.0004 }));
  // Carpets in the sun before it, overlapping a little, each a hair above the last.
  const cz = tz + td / 2 + fd + Math.min(0.0055, (l.ld - tz - td / 2 - fd) * 0.5);
  out.push(...carpet(0.009, 0.0062, 0x9a2a2a, 0x2e3a6a, -tw * 0.22, cz, 0.0006));
  out.push(...carpet(0.0078, 0.0056, 0x2e3a6a, 0xc89a4a, tw * 0.12, cz + 0.0008, 0.0009));
  if (tw > 0.04) out.push(...carpet(0.0072, 0.005, 0x7a3a2a, 0xe0d0b0, tw * 0.38, cz - 0.0006, 0.0012));
  // Bales and tea bricks under the flap; a camel by the tent's side with its load.
  for (let i = 0; i < 3; i++) out.push(...box(0.0024, 0.0018, 0.0018, i % 2 ? 0xc8b088 : 0xa88a5a, { x: tw * 0.22 + (i % 2) * 0.0026, y: i === 2 ? 0.0018 : 0, z: tz + td / 2 + 0.002 + (i === 2 ? 0 : 0) }, 0xd8c8a0));
  out.push(...box(0.003, 0.0012, 0.002, 0x5a3a26, { x: -tw * 0.24, z: tz + td / 2 + 0.002 }));
  const cx = tw / 2 - 0.004, cmz = Math.min(l.ld * 0.88, cz + 0.0058);
  out.push(...camel(0xb8945a, { x: cx - 0.002, z: cmz, ry: Math.PI }));
  out.push(...box(0.0028, 0.0016, 0.0022, 0x8a3a2a, { x: cx - 0.0062, z: cmz + 0.0004 }, 0xa84a3a));
  // The merchant's own ger behind, on a larger lot.
  if (l.ld > 0.03) out.push(...ger(l.lw * 0.62, -l.ld * 0.82 + Math.min(l.lw, l.ld) * 0.14, Math.min(l.lw, l.ld) * 0.22, th * 0.75, felt, band, 0.3));
  return out;
};
// Felt makers and ger builders. Wool beaten and spread on a wetted hide,
// rolled up tight and dragged behind a horse until it felts; the new felts
// laid out on the grass to dry; the wheelwright's work of the camp too:
// a ger standing as a bare frame (the lattice wall, the red roof poles
// to the crown ring), more poles stacked, heaps of fleece.
const mnFelt: Build = (l) => {
  const felt = pick(l, MN_FELT), band = pick(l, MN_BAND), out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, MN_GRASS)];
  const two = l.floors > 1, r = Math.min(l.lw, l.ld) * (two ? 0.46 : 0.4), h = l.H * (two ? 0.4 : 0.55);
  // The frame: the lattice (khana) as crossed laths round the drum, roof poles (uni) to the crown (toono).
  const fx = -l.lw * 0.42, fz = -l.ld * 0.4, n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, seg = 2 * r * Math.sin(Math.PI / n);
    if (Math.abs(a) < 0.01) continue; // (the doorway, south)
    for (const t of [-0.75, 0.75]) out.push(P(new THREE.PlaneGeometry(0.0004, Math.hypot(seg, h)).rotateZ(t), 0xc89a5a, { x: fx + Math.sin(a) * r * Math.cos(Math.PI / n), z: fz + Math.cos(a) * r * Math.cos(Math.PI / n), y: h / 2, ry: a }));
  }
  for (const k of [-1, 1]) out.push(...box(0.0006, h * 0.8, 0.0006, MN_DOOR, { x: fx + k * r * 0.2, z: fz + r }));
  out.push(...box(r * 0.4 + 0.0006, 0.0006, 0.0006, MN_DOOR, { x: fx, y: h * 0.8, z: fz + r }));
  const cr = r * 0.2, ch = h + r * 0.5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, x0 = fx + Math.sin(a) * r, z0 = fz + Math.cos(a) * r, x1 = fx + Math.sin(a) * cr, z1 = fz + Math.cos(a) * cr;
    out.push(rod([x0, h, z0], [x1, ch, z1], 0.0002, MN_POLE));
  }
  out.push(cyl(cr, cr, 0.0009, 8, MN_POLE, { x: fx, y: ch - 0.0004, z: fz }));
  // A felt half-raised on the frame's back: the builders at work.
  out.push(P(new THREE.CylinderGeometry(r * 1.03, r * 1.03, h * 0.9, 9, 1, true, Math.PI * 0.7, Math.PI * 0.6), felt, { x: fx, y: h * 0.45, z: fz }));
  // The finished work's own ger; poles stacked by it.
  out.push(...ger(l.lw * 0.55, -l.ld * 0.55, r * 0.7, h * 0.9, felt, band, -0.4));
  out.push(...logs(6, 0.009, 0.00035, MN_POLE, { x: l.lw * 0.5, z: -l.ld * 0.55 + r * 0.7 + 0.0035 }));
  // New felts drying on the grass, each its own height (they overlap).
  const dz = l.ld * 0.42;
  [[0xf2ecdc, -0.5, 0], [0xd8d0bc, 0.05, 0.003], [0xe8e0cc, 0.5, -0.002], [0xb8b0a0, -0.15, 0.0075]].forEach(([c, k, dzz], i) => {
    if (Math.abs(k! * l.lw) + 0.006 < l.lw * 0.94) out.push(patch(0.011, 0.0075, c!, k! * l.lw, dz + dzz! - 0.002, 0.0006 + i * 0.0001, 0.2 * (i % 2 ? 1 : -1)));
  });
  // The felt roll in its hide, a rope from it to the horse's track; heaps of fleece by the frame.
  const rz = Math.min(l.ld * 0.84, dz + 0.009);
  out.push(rodX(0.008, 0.0015, 7, 0x8a6a48, { x: -l.lw * 0.25, y: 0.0015, z: rz }));
  out.push(rod([-l.lw * 0.25 + 0.004, 0.0015, rz], [l.lw * 0.8, 0.0003, rz - 0.002], 0.00012, 0x4a3828));
  for (let i = 0; i < 3; i++) out.push(P(new THREE.IcosahedronGeometry(0.0022, 0), i === 1 ? 0xc8c0b0 : 0xf0eadc, { x: fx + r + 0.003 + i * 0.0032, y: 0.0012, z: fz + r * 0.5 + (i % 2) * 0.0018, sy: 0.55 }));
  return out;
};

// ---------- Aztec (mesoamerican) ----------
// Tenochtitlan's houses: stone and adobe plastered white, on platforms,
// flat roofs, a painted band under the parapet; the great market at
// Tlatelolco (the tianguis) where each trade had its row, sellers under
// shades of thatch or mats; maize, chillies, cacao, cotton mantas, feathers.
const AZ_PLASTER = [0xe8e2d4, 0xe0d0b0, 0xd8c8a8], AZ_BAND = [0xa84a3a, 0x3a7a8a, 0xc08a3a];
const AZ_STONE = 0xb8ae98, AZ_THATCH = 0xb09a5a, AZ_WOOD = 0x6a5038, AZ_DARK = 0x2e2420, AZ_CLAY = 0xb8683a;
// A platform of two steps and the plastered house on it, its band and parapet; returns the house's body.
function azHouse(b: Body, plaster: number, band: number, step: number, out: G[]): Body {
  out.push(...box(b.w * 1.18, step, b.d * 1.18, AZ_STONE, { x: b.x, z: b.z }), ...box(b.w * 1.08, step, b.d * 1.08, AZ_STONE, { x: b.x, y: step, z: b.z }));
  const top: Body = { ...b, y: 2 * step, h: b.h - 2 * step };
  out.push(...box(top.w, top.h, top.d, plaster, { x: b.x, y: top.y, z: b.z }));
  out.push(...box(top.w + 0.0006, top.h * 0.14, top.d + 0.0006, band, { x: b.x, y: top.y + top.h * 0.86, z: b.z }, plaster));
  out.push(ring(top.w, 0.0016, top.d, plaster, { x: b.x, y: top.y + top.h, z: b.z }));
  return top;
}
// A maize cob, a pepper, a tomato: a heap of round goods in a flat basket.
const heap = (r: number, goods: number, o: { x: number; z: number; y?: number }): G[] => [
  cyl(r, r * 1.1, r * 0.5, 7, 0xa88a52, o),
  cone(r * 1.02, r * 0.75, 7, goods, { ...o, y: (o.y ?? 0) + r * 0.42 }),
];
// A nopal: paddles grown one on another (the cactus the cochineal feeds on).
function nopal(x: number, z: number, s: number): G[] {
  const pad = (dx: number, y: number, rz: number, ry: number) => P(new THREE.OctahedronGeometry(0.0019 * s, 0), 0x5a8a4a, { x: x + dx * s, y: y * s, z, rz, ry, sx: 0.8, sz: 0.28 });
  return [pad(0, 0.0016, 0, 0.3), pad(-0.0016, 0.0042, 0.5, 0.9), pad(0.0014, 0.0044, -0.45, -0.4), pad(-0.0024, 0.0068, 0.2, 0.2), pad(0.0022, 0.0066, -0.3, 1.2)];
}
// A cook's stand (the market's women sold hot food from their hearths):
// her house on its low platform, before it a thatched shade on posts over
// the three hearthstones (tenamaztli) and the round clay comal where the
// tortillas are turned, a metate for the maize, pots of beans and of
// chocolate; baskets of maize, chillies, tomatoes and squash on mats.
const azCook: Build = (l) => {
  const plaster = pick(l, AZ_PLASTER), band = pick(l, AZ_BAND), out: G[] = [];
  const b = place(l, 0.6, 0.42, l.ld * 0.62);
  out.push(...yard(l, b, 0xb8a888, 0xc8bca0));
  const top = azHouse(b, plaster, band, l.floors > 1 ? 0.004 : 0.0026, out);
  out.push(onFace(top, 'front', -b.w * 0.2, top.y, 0.0055, top.h * 0.6, AZ_DARK, E * 2));
  if (l.floors > 1) out.push(...box(top.w * 0.45, 0.006, top.d * 0.5, plaster, { x: b.x + b.w * 0.22, y: b.h, z: b.z - b.d * 0.18 }));
  // The shade: a pitched roof of thatch on four posts, out over the forecourt.
  const front = b.z + b.d * 0.59, room = l.ld - front, sw = Math.min(2 * l.lw * 0.8, b.w * 1.1), sd = room * 0.62, sz = front + sd / 2 + 0.0008;
  out.push(patch(sw, room * 0.85, 0xa8946a, b.x, front + room * 0.45, 0.0006));
  out.push(...stall(sw * 0.8, sd, Math.min(0.0085, l.H * 0.38), AZ_THATCH, AZ_WOOD, { x: b.x, z: sz }));
  // The hearth: three stones, the comal on them, its fire glowing beneath; the metate beside.
  const hx = b.x - sw * 0.18, hz = sz;
  for (let i = 0; i < 3; i++) out.push(...box(0.0009, 0.0011, 0.0009, 0x6a6460, { x: hx + Math.cos(i * 2.1) * 0.0012, z: hz + Math.sin(i * 2.1) * 0.0012 }));
  out.push(cyl(0.0022, 0.0022, 0.0003, 8, 0x3a2e28, { x: hx, y: 0.0011, z: hz }), P(new THREE.CircleGeometry(0.0007, 5).rotateX(-Math.PI / 2), 0xe0702a, { x: hx, y: 0.0002 + 0.0006, z: hz }));
  for (let i = 0; i < 2; i++) out.push(cyl(0.0007, 0.0007, 0.0001, 6, 0xe8d8a8, { x: hx + (i - 0.5) * 0.0011, y: 0.0014, z: hz }));
  out.push(...box(0.0034, 0.0012, 0.0018, 0x6a6460, { x: hx + 0.0045, z: hz + 0.0005, rx: -0.15 }), ...box(0.0022, 0.0004, 0.0005, 0x8a8480, { x: hx + 0.0045, y: 0.0013, z: hz + 0.0005 }));
  out.push(...pot(0.0012, AZ_CLAY, { x: hx - 0.0042, z: hz - 0.0016 }), ...pot(0.001, 0x8a4a2a, { x: hx - 0.0036, z: hz + 0.0018 }));
  // The goods in the sun along the street: maize, chillies, tomatoes, squash, beans; a mat under them.
  const goods = [0xe0b840, 0xb82a1a, 0xd8482a, 0x7a9a3a, 0x5a3a2a, 0xe8c050];
  const gz = Math.min(l.ld - 0.0028, sz + sd / 2 + 0.0028), n = Math.max(3, Math.floor(sw / 0.0058));
  out.push(patch(sw * 0.92, 0.0052, 0xc8b078, b.x, gz, 0.0008));
  for (let i = 0; i < n; i++) out.push(...heap(0.0019, goods[i % goods.length]!, { x: b.x - sw * 0.4 + (i + 0.5) * (sw * 0.8 / n), z: gz }));
  out.push(...pot(0.0015, AZ_CLAY, { x: b.x + sw * 0.32, z: hz - 0.001 }, 0x8a4a2a));
  for (let i = 0; i < 3; i++) out.push(patch(l.lw * 0.4, 0.0016, 0x7a9a3a, -l.lw * 0.5, -l.ld * 0.66 + i * 0.004, 0.0008));
  out.push(...tree(l.lw * 0.66, -l.ld * 0.62, 1, 0x5e8a44));
  return out;
};
// A merchant's house (the pochteca traded featherwork and cotton far and
// wide): raised higher on its platform, a portico of square painted
// pillars across its front under the flat roof, the roof's edge set with
// stepped merlons; cotton mantas hung between the pillars in their
// patterns, bundles of green quetzal and red macaw feathers, a featherwork
// shield set up to show, the stair to the street between painted balustrades.
const azMerchant: Build = (l) => {
  const plaster = pick(l, AZ_PLASTER), band = pick(l, AZ_BAND), out: G[] = [];
  const b = place(l, 0.76, 0.5, l.ld * 0.42);
  out.push(...yard(l, b, 0xb8a888, 0xc8bca0, 0.007));
  const step = l.floors > 1 ? 0.0048 : 0.0034;
  const top = azHouse(b, plaster, band, step, out);
  // Stepped merlons along the roof's edge, front and sides.
  out.push(...merlons({ ...top, y: 0 }, top.y + top.h + 0.0016, 0.0016, 0.0042, plaster, ['front', 'left', 'right']));
  // The portico: a slab out on four pillars before the front, its edge painted.
  const pd = 0.0068, pz = top.z + top.d / 2 + pd / 2, ph = top.h * (l.floors > 1 ? 0.55 : 0.82), py = top.y;
  out.push(...box(top.w + 0.001, 0.0016, pd + 0.0006, plaster, { x: b.x, y: py + ph, z: pz }));
  out.push(onFace({ x: b.x, z: pz, w: top.w + 0.001, d: pd + 0.0006, y: py + ph, h: 0.0016 }, 'front', 0, py + ph + 0.0003, top.w + 0.001, 0.001, band, E));
  const cols = top.w > 0.04 ? 5 : 4;
  for (let i = 0; i < cols; i++) {
    const x = b.x - top.w / 2 + 0.0012 + i * ((top.w - 0.0024) / (cols - 1));
    out.push(...box(0.0018, ph, 0.0018, plaster, { x, y: py, z: pz + pd / 2 - 0.0012 }));
    out.push(...box(0.0019, ph * 0.12, 0.0019, band, { x, y: py + ph * 0.6, z: pz + pd / 2 - 0.0012 }));
  }
  out.push(onFace(top, 'front', 0, py, 0.005, ph * 0.72, AZ_DARK, E * 2));
  // Mantas hung between the pillars: white cotton with bands of colour.
  const mantas: [number, number][] = [[0xc83a2a, 0xf0ece0], [0xe0b840, 0x2e4a7a], [0x3a8a9a, 0xf0ece0], [0xf0ece0, 0xa83a2a]];
  const cw = (top.w - 0.0024) / (cols - 1);
  for (let i = 0; i < cols - 1; i++) {
    if (i === Math.floor((cols - 1) / 2) && (cols - 1) % 2 === 1) continue;
    const x = b.x - top.w / 2 + 0.0012 + (i + 0.5) * cw, [m, s2] = mantas[i % mantas.length]!, mz = pz + pd / 2 - 0.0012;
    out.push(P(new THREE.PlaneGeometry(cw * 0.72, ph * 0.5), m, { x, y: py + ph * 0.72, z: mz }));
    for (const y of [0.56, 0.84]) out.push(P(new THREE.PlaneGeometry(cw * 0.72, ph * 0.06), s2, { x, y: py + ph * y, z: mz + E }));
  }
  // The stair down to the street between its balustrades.
  const sz = b.z + b.d * 0.59 + 0.002, rise = 2 * step;
  out.push(P(new THREE.PlaneGeometry(0.008, Math.hypot(rise, 0.006)).rotateX(-Math.PI / 2 + Math.atan2(rise, 0.006)), AZ_STONE, { x: b.x, y: rise / 2, z: sz + 0.002 }));
  for (const k of [-1, 1]) out.push(...box(0.0012, rise + 0.001, 0.006, plaster, { x: b.x + k * 0.0046, z: sz + 0.002 }, band));
  // Feathers in bundles and a featherwork shield on a stand, on a mat before the stair.
  const fz = Math.min(l.ld - 0.0035, sz + 0.0085), fx = b.x + top.w * 0.3;
  out.push(patch(0.009, 0.0045, 0xc8b078, fx, fz, 0.0008));
  for (let i = 0; i < 4; i++) out.push(cone(0.0006, 0.0034, 4, i % 2 ? 0x2a8a5a : 0xc83a2a, { x: fx - 0.003 + i * 0.002, y: 0.0008, z: fz, rz: (i - 1.5) * 0.12 }));
  out.push(cyl(0.0026, 0.0026, 0.0003, 8, 0x3a8aa8, { x: b.x - top.w * 0.3, y: 0.0034, z: fz, rx: Math.PI / 2 - 0.2 }), cyl(0.0012, 0.0012, 0.0001, 6, 0xd8b040, { x: b.x - top.w * 0.3, y: 0.0035, z: fz + 0.00035, rx: Math.PI / 2 - 0.2 }));
  out.push(...box(0.0005, 0.0024, 0.0005, AZ_WOOD, { x: b.x - top.w * 0.3, z: fz - 0.0006 }));
  out.push(...tree(-l.lw * 0.68, -l.ld * 0.66, 1, 0x5e8a44), shrub(l.lw * 0.72, -l.ld * 0.72, 0.0026, 0x6a8a4a));
  return out;
};
// Dyers and weavers: a walled garden of nopal where the cochineal is raised
// (the insects scraped off, dried, and ground to a crimson), dye pots on
// their fires, skeins and cloth dried on lines in cochineal red, indigo
// (xiuhquilitl) blue and yellow; a thatched shed where the women weave on
// backstrap looms tied to its posts; the house on its platform behind.
const azDyers: Build = (l) => {
  const plaster = pick(l, AZ_PLASTER), band = pick(l, AZ_BAND), out: G[] = [];
  const b0 = place(l, 0.56, 0.34, l.ld * 1.2), b = { ...b0, x: l.lw * 0.94 - 0.002 - b0.w * 0.59, h: wallHeight(1) * (l.floors > 1 ? 0.95 : 0.75) };
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8a888));
  azHouse(b, plaster, band, 0.0024, out);
  out.push(onFace({ ...b, y: 0.0048, h: b.h - 0.0048 }, 'front', 0, 0.0048, 0.005, (b.h - 0.0048) * 0.6, AZ_DARK, E * 2));
  out.push(...fence(l, 0.0034, plaster, 0.01));
  // The nopal garden: rows of cactus down the left of the lot.
  const nx = -l.lw * 0.66, rows = Math.max(2, Math.min(5, Math.floor((l.ld * 1.4) / 0.009)));
  out.push(patch(l.lw * 0.6, l.ld * 1.5, 0x9a8a62, nx + l.lw * 0.05, -l.ld * 0.15, 0.0005));
  for (let i = 0; i < rows; i++) {
    const z = -l.ld * 0.82 + 0.004 + i * 0.009;
    out.push(...nopal(nx, z, 1), ...(l.lw > 0.03 ? nopal(nx + 0.0075, z + 0.004, 0.85) : []));
  }
  // The dye pots over their fires, in front of the house.
  const pz = b.z + b.d * 0.59 + 0.0045;
  [[0xa81a2a, 0], [0x2e3a7a, 1], [0xd8a83a, 2]].forEach(([c, i]) => {
    const x = b.x - b.w * 0.35 + i! * 0.0048;
    out.push(cyl(0.0019, 0.0016, 0.0026, 7, AZ_CLAY, { x, z: pz }), P(new THREE.CircleGeometry(0.0017, 7).rotateX(-Math.PI / 2), c!, { x, y: 0.0023, z: pz }));
  });
  smokeFrom(b.x - b.w * 0.35 + 0.0048, 0.0026, pz); // (the middle pot's fire)
  // Lines of cloth across the yard, between posts.
  const lz = Math.min(l.ld * 0.62, pz + 0.008), lw = 2 * l.lw * 0.42, lx = l.lw * 0.2, lh = 0.0075;
  for (const k of [-1, 1]) out.push(cyl(0.0003, 0.0003, lh, 4, AZ_WOOD, { x: lx + k * lw / 2, z: lz }));
  out.push(rodX(lw, 0.00012, 3, 0x4a3828, { x: lx, y: lh, z: lz }));
  [0xa81a2a, 0xf0ece0, 0x2e3a7a, 0xd8a83a, 0xc84a5a].forEach((c, i) => out.push(P(new THREE.PlaneGeometry(lw / 6, lh * 0.6), c, { x: lx - lw * 0.4 + i * lw * 0.2, y: lh * 0.68, z: lz })));
  // The weaving shed by the street: thatch on posts, two looms tied off to its posts, a weaver's mat at each.
  const wz = Math.min(l.ld * 0.86 - 0.004, lz + 0.0085), ww = Math.min(0.016, lw);
  out.push(...stall(ww, 0.0075, 0.0065, AZ_THATCH, AZ_WOOD, { x: lx, z: wz }));
  for (const k of [-1, 1]) {
    const x = lx + k * ww * 0.25;
    out.push(P(new THREE.PlaneGeometry(0.0022, 0.0058).rotateX(-1.1), k < 0 ? 0xa81a2a : 0x2e3a7a, { x, y: 0.0022, z: wz }));
    out.push(patch(0.0024, 0.0018, 0xc8b078, x, wz + 0.0032, 0.0008));
  }
  return out;
};

// ---------- Ethiopian (african) ----------
// Round huts (tukul) of wattle and mud under cones of thatch, an ostrich
// egg on the peak; in the north the square stone hidmo of Tigray, its
// walls laced with timbers whose round ends ("monkey heads") stand out
// of the stone, as on Aksum's stelae. Markets (gebeya) under shades:
// coffee, berbere, teff, bars of salt (amole) that served as money.
const ET_MUD = [0xb88a5a, 0xa87a4e, 0xc49a6a], ET_THATCH = [0xa88a50, 0x9a7e48, 0xb09858];
const ET_GROUND = 0xb8a070, ET_WOOD = 0x5a4636, ET_DARK = 0x3a2a20, ET_BLACK = 0x2a2422, ET_GRASS = 0x6a9a3a;
// A tukul: its mud drum, its cone of thatch, the egg on its finial, the door toward +z.
function tukul(x: number, z: number, r: number, h: number, mud: number, thatch: number): G[] {
  return [
    cyl(r, r, h, 8, mud, { x, z }), cone(r * 1.3, r * 1.25, 8, thatch, { x, y: h * 0.92, z }),
    cyl(0.00025, 0.00025, r * 0.35, 3, ET_WOOD, { x, y: h * 0.92 + r * 1.2, z }), P(new THREE.SphereGeometry(r * 0.12, 5, 3), 0xf2efe6, { x, y: h * 0.92 + r * 1.55, z, sy: 1.3 }),
    onFace({ x, z, w: r * 2, d: r * 2, y: 0, h }, 'front', 0, 0, r * 0.5, h * 0.7, ET_DARK, E * 2),
  ];
}
// A jebena: the black clay coffee pot, round-bellied, its long neck and spout.
const jebena = (s: number, o: { x: number; z: number; y?: number }): G[] => [
  P(new THREE.SphereGeometry(0.0011 * s, 6, 3), ET_BLACK, { ...o, y: (o.y ?? 0) + 0.0011 * s }),
  cyl(0.00035 * s, 0.0003 * s, 0.0016 * s, 4, ET_BLACK, { ...o, y: (o.y ?? 0) + 0.0019 * s }),
];
// A mesob: the woven basket-table, waisted, its lid a cone, in bands of colour.
const mesob = (r: number, c: number, band: number, o: { x: number; z: number }): G[] => [
  cyl(r, r * 0.55, r * 1.1, 7, c, o), cyl(r * 0.55, r, r * 0.6, 7, band, { ...o, y: r * 1.1 }), cone(r * 1.02, r * 0.9, 7, c, { ...o, y: r * 1.7 }),
];
// A coffee house (buna bet): an open round shelter of thatch on posts
// (a das) where coffee is roasted, pounded and brewed three times in the
// jebena over a charcoal brazier; fresh grass strewn on the floor, low
// stools round a tray of small cups, a mesob, incense; the family's tukul
// behind it, the compound's fence of stakes open to the street.
const etCoffee: Build = (l) => {
  const mud = pick(l, ET_MUD), thatch = pick(l, ET_THATCH), out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, ET_GROUND)];
  const two = l.floors > 1, R = Math.min(l.lw, l.ld) * (two ? 0.5 : 0.44), h = l.H * (two ? 0.4 : 0.5);
  const cx = -l.lw * 0.08, cz = l.ld * 0.22;
  // The das: eight posts in a ring, a broad low cone of thatch, its finial.
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; out.push(cyl(0.0003, 0.0003, h, 4, ET_WOOD, { x: cx + Math.sin(a) * R * 0.92, z: cz + Math.cos(a) * R * 0.92 })); }
  out.push(cone(R * 1.18, R * 0.95, 10, thatch, { x: cx, y: h - 0.0004, z: cz }));
  out.push(cyl(0.00025, 0.00025, R * 0.3, 3, ET_WOOD, { x: cx, y: h + R * 0.9, z: cz }), P(new THREE.SphereGeometry(R * 0.08, 5, 3), 0xf2efe6, { x: cx, y: h + R * 1.2, z: cz, sy: 1.3 }));
  // The floor strewn with grass; the brazier, the jebena on it, the tray of cups, stools.
  out.push(P(new THREE.CircleGeometry(R * 0.85, 9).rotateX(-Math.PI / 2), ET_GRASS, { x: cx, y: 0.0006, z: cz }));
  out.push(cyl(0.0012, 0.0009, 0.0012, 6, 0x6a5a4a, { x: cx, z: cz - R * 0.25 }), P(new THREE.CircleGeometry(0.0009, 6).rotateX(-Math.PI / 2), 0xd8602a, { x: cx, y: 0.0012, z: cz - R * 0.25 }));
  out.push(...jebena(1, { x: cx, z: cz - R * 0.25, y: 0.0012 }), ...jebena(0.9, { x: cx + 0.0024, z: cz - R * 0.32 }));
  out.push(cyl(0.0017, 0.0017, 0.0005, 7, 0x8a6a48, { x: cx + R * 0.15, z: cz + R * 0.15 }));
  for (let i = 0; i < 5; i++) out.push(cyl(0.00022, 0.00018, 0.0004, 4, 0xf2efe6, { x: cx + R * 0.15 + Math.cos(i * 1.26) * 0.0009, y: 0.0005, z: cz + R * 0.15 + Math.sin(i * 1.26) * 0.0009 }));
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; out.push(cyl(0.0007, 0.0007, 0.0009, 5, 0x7a5a3a, { x: cx + Math.sin(a) * R * 0.55, z: cz + Math.cos(a) * R * 0.55 })); }
  out.push(...mesob(0.0016, 0xd8b878, 0xa83a2a, { x: cx - R * 0.45, z: cz + R * 0.1 }));
  // Coffee beans drying on a skin in the sun at the street side; the family's tukul behind; the fence.
  out.push(P(new THREE.CircleGeometry(0.0034, 7).rotateX(-Math.PI / 2), 0x9a7a5a, { x: l.lw * 0.6, y: 0.0007, z: l.ld * 0.62 }), P(new THREE.CircleGeometry(0.0026, 7).rotateX(-Math.PI / 2), 0x6a3a22, { x: l.lw * 0.6, y: 0.0008, z: l.ld * 0.62 }));
  out.push(...tukul(l.lw * 0.5, -l.ld * 0.55, Math.min(l.lw, l.ld) * 0.3, l.H * 0.5, mud, thatch));
  const F = Math.min(l.lw, l.ld) * 0.95;
  out.push(P(new THREE.CylinderGeometry(F, F, 0.0035, 14, 1, true, 0.45, Math.PI * 2 - 0.9).translate(0, 0.00175, 0), 0x7a5a3a));
  return out;
};
// A spice and salt merchant in a hidmo: a square house of dry stone, its
// walls laced with timbers, their round ends standing out in rows; a
// flat roof of earth on poles, its eaves' ends showing; before it, under
// a shade of poles and brush, baskets of berbere (red), mitmita, turmeric
// and fenugreek, sacks of teff, and the bars of rock salt (amole) from the
// Danakil, stacked like bricks.
const etSpice: Build = (l) => {
  const thatch = pick(l, ET_THATCH), out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, ET_GROUND)];
  const b = { ...place(l, 0.66, 0.48, l.ld * 0.46) }, stone = pick(l, [0x9a8a72, 0x8e806a, 0xa89878]);
  b.h = l.floors > 1 ? l.H * 0.8 : l.H * 0.62;
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, 0x8a7a5a));
  // The timber courses: dark bands round the walls, the "monkey heads" in rows on the front and sides.
  const ys = [b.h * 0.3, b.h * 0.66];
  out.push(...bands(b, ys, 0.0007, ET_WOOD, ['front', 'left', 'right']));
  for (const y of ys) for (const f of ['front', 'left', 'right'] as Face[]) {
    const fw = faceWidth(b, f), n = Math.max(3, Math.min(7, Math.floor(fw / 0.0045)));
    for (let i = 0; i < n; i++) {
      const a = -fw / 2 + (i + 0.5) * fw / n;
      if (f === 'front' && Math.abs(a) < 0.004) continue;
      out.push(disc(b, f, a, y + 0.00035, 0.00048, shade(ET_WOOD, 1.25), E * 2));
    }
  }
  // The flat roof: a lip of poles out past the walls, a low earth parapet.
  out.push(...box(b.w + 0.0024, 0.0008, b.d + 0.0024, ET_WOOD, { x: b.x, y: b.h, z: b.z }, 0x8a7a5a));
  out.push(ring(b.w, 0.0016, b.d, stone, { x: b.x, y: b.h + 0.0008, z: b.z }));
  // Red peppers spread to dry on the roof, for the berbere; a basket of them beside.
  out.push(patch(b.w * 0.5, b.d * 0.42, 0xa8281a, b.x - b.w * 0.15, b.z - b.d * 0.12, b.h + 0.0011), patch(b.w * 0.24, b.d * 0.3, 0xc89a3a, b.x + b.w * 0.27, b.z + b.d * 0.15, b.h + 0.0011));
  out.push(...doubleDoor(b, 'front', 0, 0.005, b.h * 0.24, 0x6a4a30, ET_WOOD, E));
  out.push(onFace(b, 'front', 0, b.h * 0.24 + 0.0012, 0.0062, b.h * 0.05, ET_WOOD, BAND)); // the lintel
  for (const k of [-1, 1]) out.push(onFace(b, 'front', k * b.w * 0.3, b.h * 0.42, 0.0026, 0.0026, ET_DARK, E));
  if (l.floors > 1) out.push(...windows(b, 'front', { floors: 1, storey: b.h * 0.34, base: b.h * 0.68, w: 0.0026, h: 0.003, spacing: 0.009, sill: 0.002, color: ET_DARK }));
  // The shade before it: brush on a frame of poles.
  const front = b.z + b.d / 2, room = l.ld - front, sd = Math.min(room * 0.42, 0.008), sz = front + sd / 2 + 0.0006, sw = b.w * 0.9;
  out.push(...stall(sw, sd, Math.min(0.0075, b.h * 0.65), thatch, ET_WOOD, { x: b.x, z: sz }));
  // Baskets of spice, wide and shallow, in two rows; teff sacks; the salt bars stacked.
  const spices = [0xb02a1a, 0xd85a1a, 0xd8a820, 0x8a6a2a, 0xc8401a, 0x6a7a3a];
  const n = Math.max(3, Math.min(7, Math.floor(sw / 0.0056)));
  for (let i = 0; i < n; i++) {
    const x = b.x - sw * 0.42 + (i + 0.5) * (sw * 0.84 / n);
    out.push(...heap(0.0019, spices[i % spices.length]!, { x, z: Math.min(l.ld - 0.0045, sz + sd / 2 + 0.0026) }));
    if (i % 2 === 0) out.push(...heap(0.0015, spices[(i + 3) % spices.length]!, { x: x + 0.0012, z: sz }));
  }
  const ax = b.x + b.w / 2 + 0.004 < l.lw * 0.92 ? b.x + b.w / 2 + 0.0034 : b.x + b.w * 0.46, az = Math.min(l.ld - 0.0016, sz + sd / 2 + 0.0058);
  for (let i = 0; i < 6; i++) out.push(...box(0.0028, 0.0007, 0.0009, i % 2 ? 0xece6da : 0xf6f2ea, { x: ax + (i % 2 ? 0.0003 : 0), y: Math.floor(i / 2) * 0.0007 + (i % 2) * 0.00001, z: az + (i % 2) * 0.0011 }));
  out.push(...sacks(4, 0.0013, 0xd8c8a0, { x: b.x - b.w * 0.5 - 0.002, z: front - 0.002 }));
  out.push(...flatTree(-l.lw * 0.66, -l.ld * 0.66, 1, 0x6a8a3a));
  return out;
};
// The potters' compound (the women potters of the highlands, firing in
// the open): a work hut, a shade over the wheel-less hand-building place
// with balls of clay; pots drying in rows; the firing heap smouldering
// (the pots buried in grass and dung, smoke-black); the finished ware set
// out, all black: jebenas, the wide flat mitad griddles for injera, tall
// water jars (insra).
const etPotters: Build = (l) => {
  const mud = pick(l, ET_MUD), thatch = pick(l, ET_THATCH), out: G[] = [patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, ET_GROUND)];
  const two = l.floors > 1, r = Math.min(l.lw, l.ld) * (two ? 0.34 : 0.3), h = l.H * (two ? 0.42 : 0.5);
  out.push(...tukul(-l.lw * 0.5, -l.ld * 0.5, r, h, mud, thatch));
  out.push(patch(2 * l.lw * 0.8, l.ld * 1.0, 0xa89068, l.lw * 0.05, l.ld * 0.3, 0.0005)); // the worked ground
  // The shade: a flat brush roof on posts, the clay and the half-made pots under it.
  const sx = l.lw * 0.42, sz = -l.ld * 0.42, sw = Math.min(0.016, l.lw * 0.9);
  out.push(...stall(sw, 0.011, 0.0068, thatch, ET_WOOD, { x: sx, z: sz }));
  out.push(cone(0.003, 0.0022, 6, 0x8a5a3a, { x: sx - sw * 0.25, z: sz })); // the clay heap
  for (let i = 0; i < 3; i++) out.push(...pot(0.0011, 0xa8704a, { x: sx + (i - 0.5) * 0.0028, z: sz + 0.002 }));
  // The firing heap: a low smoking mound, a few pots' rims showing through it.
  const fx = -l.lw * 0.42, fz = l.ld * 0.3;
  out.push(P(new THREE.SphereGeometry(0.0055, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0x4a4440, { x: fx, z: fz, sy: 0.55 }));
  for (let i = 0; i < 3; i++) out.push(cyl(0.0009, 0.0009, 0.0006, 6, 0x8a4a2a, { x: fx + Math.cos(i * 2.1) * 0.0026, y: 0.0024, z: fz + Math.sin(i * 2.1) * 0.0026 }));
  smokeFrom(fx, 0.003, fz);
  // The finished ware in rows toward the street: jebenas, mitad griddles leaning, water jars.
  const wz = Math.min(l.ld * 0.84, fz + 0.0085);
  for (let i = 0; i < 4; i++) out.push(...jebena(1.1, { x: -l.lw * 0.15 + i * 0.0032, z: wz }));
  for (let i = 0; i < 3; i++) out.push(P(new THREE.CircleGeometry(0.0028, 8), i % 2 ? 0x3a3230 : ET_BLACK, { x: l.lw * 0.36 + i * 0.0014, y: 0.0026, z: wz - 0.002 - i * 0.0004, rx: -0.35 }));
  for (let i = 0; i < 3; i++) out.push(...pot(0.0016, i === 1 ? 0x3a3230 : ET_BLACK, { x: l.lw * 0.28 + i * 0.0036, z: l.ld * 0.08 }));
  const F = Math.min(l.lw, l.ld) * 0.95;
  out.push(P(new THREE.CylinderGeometry(F, F, 0.0035, 14, 1, true, 0.45, Math.PI * 2 - 0.9).translate(0, 0.00175, 0), 0x7a5a3a));
  return out;
};

// ---------- Indian (southAsian) ----------
// The bazaar of an Indian city: brick and stone plastered and limewashed,
// flat roofs behind parapets, little domed chhatris; the shop a raised
// platform (the otla) open to the street, the merchant seated on it on
// his white bolster among his goods; deep stone eaves (chhajja) on
// brackets against sun and monsoon; cloth awnings on bamboo.
const IN_WALL = [0xd8a878, 0xe0b890, 0xeae0d0], IN_TRIM = [0xc8805a, 0xb86a4a, 0x8a6a4a];
const IN_DARK = 0x3a2a24, IN_WOOD = 0x6a4a30, IN_BRASS = 0xc8a040, IN_BAMBOO = 0x9a8a50;
// The house: plinth, walls, cornice, parapet (as the homes').
function inHouse(b: Body, wall: number, trim: number, out: G[]): void {
  out.push(...box(b.w + 0.002, 0.0016, b.d + 0.002, trim, { x: b.x, z: b.z }));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
  out.push(...box(b.w + 0.0014, 0.0008, b.d + 0.0014, trim, { x: b.x, y: b.h, z: b.z }, wall));
  out.push(ring(b.w, 0.0022, b.d, wall, { x: b.x, y: b.h + 0.0008, z: b.z }));
}
// A chhatri on the roof: four posts, a slab, a little dome.
function chhatri(x: number, z: number, y: number, s: number, trim: number, dome2: number): G[] {
  const out: G[] = [];
  for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.0003 * s, 0.0003 * s, 0.004 * s, 3, trim, { x: x + a * 0.0022 * s, y, z: z + c * 0.0022 * s }));
  out.push(...box(0.0058 * s, 0.0006 * s, 0.0058 * s, trim, { x, y: y + 0.004 * s, z }), dome(0.0026 * s, dome2, { x, y: y + 0.0046 * s, z }, 6));
  return out;
}
// A spice merchant's shop: the otla raised the height of a step across the
// whole front, three arches open behind it; the merchant's white bolster,
// brass trays heaped in cones of chilli, turmeric, coriander, cumin,
// saffron-coloured dal; sacks along the side; a striped cotton awning on
// bamboo poles out over the street.
const inSpice: Build = (l) => {
  const wall = pick(l, IN_WALL), trim = pick(l, IN_TRIM), out: G[] = [], s = storeys(l);
  const b = place(l, 0.78, 0.48, l.ld * 0.42);
  out.push(...yard(l, b, 0xd0b890, 0xc0a888));
  inHouse(b, wall, trim, out);
  const gs = l.floors > 1 ? s.base + s.storey : b.h * 0.92;
  // The otla: a platform before the front, its edge in the trim colour.
  const od = 0.0062, oh = 0.0024, oz = b.z + b.d / 2 + od / 2;
  out.push(...box(b.w * 0.92, oh, od, trim, { x: b.x, z: oz }, 0xc8b8a0));
  // Three arches open into the shop, dark within, their piers banded.
  for (const k of [-1, 0, 1]) out.push(...arch(b, 'front', k * b.w * 0.29, 0.0016, b.w * 0.22, gs * 0.48, IN_DARK, false, E * 2));
  out.push(onFace(b, 'front', 0, gs * 0.48 + b.w * 0.11 + 0.002, b.w * 0.94, 0.0009, trim, BAND));
  // The goods on the otla: trays of spice in cones; the bolster at one end.
  const spices = [0xb82a1a, 0xe0b020, 0x8a9a3a, 0x8a5a2a, 0xe0802a, 0xa8402a];
  const n = Math.max(3, Math.min(7, Math.floor(b.w * 0.8 / 0.0046)));
  for (let i = 0; i < n; i++) {
    const x = b.x - b.w * 0.36 + i * (b.w * 0.64 / (n - 1)), z = oz + od * 0.12;
    out.push(cyl(0.0019, 0.0019, 0.0003, 7, IN_BRASS, { x, y: oh, z }), cone(0.0016, 0.0024, 6, spices[i % spices.length]!, { x, y: oh + 0.0003, z }));
  }
  out.push(rodX(0.004, 0.0008, 6, 0xf2ece0, { x: b.x + b.w * 0.38, y: oh + 0.0008, z: oz - od * 0.28 }));
  out.push(patch(0.0055, 0.0034, 0xf2ece0, b.x + b.w * 0.38, oz, oh + 0.0001));
  // The awning: stripes of saffron and white on bamboo poles.
  const ad = Math.min(0.0085, l.ld - oz - od / 2 - 0.0005), ay = Math.min(gs, 0.0125);
  out.push(...awning(b.w * 0.9, ad + od / 2, [0xe0902a, 0xf2ece0], { x: b.x, y: ay, z: b.z + b.d / 2 + 0.0004, tilt: 0.3, stripes: 9 }));
  for (const k of [-1, 1]) out.push(cyl(0.00025, 0.00025, ay - Math.sin(0.3) * (ad + od / 2), 4, IN_BAMBOO, { x: b.x + k * b.w * 0.43, z: b.z + b.d / 2 + Math.cos(0.3) * (ad + od / 2) }));
  // Sacks of chillies and grain by the side; upstairs, the jharokha on a taller street.
  out.push(...sacks(4, 0.0013, 0xd8c8a0, { x: b.x - b.w / 2 - 0.0028, z: b.z + b.d / 2 - 0.002 }));
  if (l.floors > 1) {
    out.push(...box(0.009, s.storey * 0.42, 0.003, trim, { x: b.x, y: s.base + s.storey * 1.25, z: b.z + b.d / 2 + 0.0015 }, wall));
    out.push(onFace({ x: b.x, z: b.z + b.d / 2 + 0.0015, w: 0.009, d: 0.003, y: 0, h: 0 }, 'front', 0, s.base + s.storey * 1.32, 0.0066, s.storey * 0.26, IN_DARK, E));
    for (const k of [-1, 1]) out.push(...windows({ ...b, w: b.w * 0.5 }, 'front', { floors: 1, storey: s.storey, base: s.base + s.storey, w: 0.0028, h: s.storey * 0.4, spacing: 0.02, sill: s.storey * 0.3, color: IN_DARK, frame: trim }).map((g) => g.translate(k * b.w * 0.36, 0, 0)));
  }
  out.push(...chhatri(b.x - b.w / 2 + 0.004, b.z - b.d / 2 + 0.004, b.h + 0.0008, 1, trim, wall));
  out.push(...tree(l.lw * 0.7, -l.ld * 0.68, 1, 0x4f7a3a));
  return out;
};
// A cloth merchant's: a deep stone chhajja on carved brackets over the
// open front, saris and lengths of block-printed and tie-dyed cotton hung
// from a rod beneath it to catch the eye; bolts stacked on the otla; the
// doorway's frame painted indigo; more lengths drying on lines on the roof.
const inCloth: Build = (l) => {
  const wall = pick(l, IN_WALL), trim = pick(l, IN_TRIM), out: G[] = [], s = storeys(l);
  const b = place(l, 0.72, 0.52, l.ld * 0.36);
  out.push(...yard(l, b, 0xd0b890, 0xc0a888, 0.006));
  inHouse(b, wall, trim, out);
  const gs = l.floors > 1 ? s.base + s.storey : b.h * 0.88;
  const fz = b.z + b.d / 2;
  // The open front: dark within, framed in indigo; the otla before it.
  out.push(onFace(b, 'front', 0, 0.0016, b.w * 0.8, gs * 0.66, IN_DARK, E * 2));
  for (const k of [-1, 1]) out.push(onFace(b, 'front', k * b.w * 0.41, 0.0016, 0.0012, gs * 0.7, 0x2e3a7a, E * 3));
  out.push(...box(b.w * 0.86, 0.0022, 0.005, trim, { x: b.x, z: fz + 0.0025 }, 0xc8b8a0));
  // The chhajja: a sloping stone eave the width of the front, out on brackets.
  const cy = gs * 0.74, cd = 0.0062;
  out.push(P(new THREE.PlaneGeometry(b.w + 0.002, cd).rotateX(-Math.PI / 2 + 0.38), 0xd8c8a8, { x: b.x, y: cy + 0.0004, z: fz + cd / 2 * Math.cos(0.38) }));
  out.push(P(new THREE.PlaneGeometry(b.w + 0.002, 0.0007), shade(trim, 0.85), { x: b.x, y: cy + 0.00035 - Math.sin(0.38) * cd / 2 - 0.0003, z: fz + cd * Math.cos(0.38) + 0.00001 }));
  for (const k of [-0.46, -0.15, 0.15, 0.46]) out.push(P(new THREE.PlaneGeometry(0.0034, 0.003).rotateY(Math.PI / 2), trim, { x: b.x + k * b.w, y: cy - 0.0012, z: fz + 0.0017 }));
  // The cloth hung from a rod under the eave: a row of bright lengths, each banded.
  const cloths: [number, number][] = [[0xd8306a, 0xe0b020], [0xe0802a, 0x2e7a4a], [0x2e8a5a, 0xd8306a], [0x2e3a9a, 0xe0b020], [0xe0b020, 0xb82a1a], [0x8a2a6a, 0xf0e0c0]];
  const n = Math.max(3, Math.min(6, Math.floor(b.w / 0.0052))), cw = (b.w * 0.86) / n, hz = fz + 0.0034;
  out.push(rodX(b.w * 0.9, 0.00018, 3, IN_WOOD, { x: b.x, y: cy - 0.0016, z: hz }));
  for (let i = 0; i < n; i++) {
    const x = b.x - b.w * 0.43 + (i + 0.5) * cw, [c, bd] = cloths[i % cloths.length]!, h = gs * (0.42 + (i % 2) * 0.08);
    out.push(P(new THREE.PlaneGeometry(cw * 0.78, h), c, { x, y: cy - 0.0016 - h / 2, z: hz }));
    out.push(P(new THREE.PlaneGeometry(cw * 0.78, h * 0.12), bd, { x, y: cy - 0.0016 - h * 0.86, z: hz + E }));
  }
  // Bolts on the otla.
  for (let i = 0; i < 4; i++) out.push(...box(0.0024, 0.0009, 0.0016, cloths[(i + 2) % cloths.length]![0], { x: b.x + b.w * 0.3 + (i % 2) * 0.0026, y: 0.0022 + Math.floor(i / 2) * 0.0009, z: fz + 0.0021 - Math.floor(i / 2) * 0.00037 }));
  if (l.floors > 1) for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: 1, base: s.base + s.storey, w: 0.003, h: s.storey * 0.42, spacing: 0.011, sill: s.storey * 0.32, color: IN_DARK, frame: trim }));
  // On the roof, lengths of new cloth drying on lines, and a chhatri.
  const ry = b.h + 0.0008;
  for (let r = 0; r < 2; r++) {
    const z = b.z - b.d * 0.25 + r * b.d * 0.3, lw = b.w * 0.6;
    for (const k of [-1, 1]) out.push(cyl(0.0002, 0.0002, 0.0045, 3, IN_WOOD, { x: b.x - b.w * 0.1 + k * lw / 2, y: ry, z }));
    out.push(rodX(lw, 0.0001, 3, IN_WOOD, { x: b.x - b.w * 0.1, y: ry + 0.0045, z }));
    for (let i = 0; i < 3; i++) out.push(P(new THREE.PlaneGeometry(lw * 0.28, 0.0034), cloths[(i * 2 + r) % cloths.length]![0], { x: b.x - b.w * 0.1 - lw * 0.32 + i * lw * 0.32, y: ry + 0.0045 - 0.0017, z }));
  }
  out.push(...chhatri(b.x + b.w / 2 - 0.004, b.z - b.d / 2 + 0.004, ry, 0.9, trim, wall));
  out.push(...fence(l, 0.003, wall, 0.016).slice(0, 6), ...tree(-l.lw * 0.7, -l.ld * 0.66, 1, 0x4f7a3a));
  return out;
};
// A sugar works (khandsari: India first made sugar of the cane): the
// cane crushed in a wooden kolhu turned by bullocks on a long beam, the
// juice boiled down in a row of great shallow iron pans on a long earth
// furnace fed with the dried pressed cane (bagasse), its chimney at the
// end, under a thatched shed open at the sides; the cane stacked green,
// the bagasse heaped pale, the jaggery set in cakes and stored in jars
// in the brick godown.
const inSugar: Build = (l) => {
  const wall = pick(l, IN_WALL), trim = pick(l, IN_TRIM), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8b088));
  // The godown: a low brick store across the back, flat-roofed, its door to the yard.
  const b0 = place(l, 0.86, 0.26, l.ld * 1.2), b = { ...b0, h: wallHeight(1) * (l.floors > 1 ? 0.8 : 0.6) };
  inHouse(b, wall, trim, out);
  out.push(...doubleDoor(b, 'front', -b.w * 0.2, 0.0055, b.h * 0.6, IN_WOOD, trim));
  out.push(onFace(b, 'front', b.w * 0.25, b.h * 0.5, 0.003, 0.002, IN_DARK, E * 2));
  // The furnace: a long low earth bank across the yard, three pans set in it, the chimney at its end.
  const fz = b.z + b.d / 2 + Math.min(0.009, (l.ld - b.z - b.d / 2) * 0.38), fw = 2 * l.lw * 0.62, fx = -l.lw * 0.12, pr = Math.min(0.0034, fw / 7);
  out.push(...box(fw, 0.0022, pr * 2.4, 0x9a6a4a, { x: fx, z: fz }, 0x7a5a3a));
  for (let i = 0; i < 3; i++) {
    const x = fx - fw / 2 + pr * 1.3 + i * (fw - pr * 2.6) / 2;
    out.push(cyl(pr, pr * 0.8, 0.0006, 8, 0x3a3634, { x, y: 0.0022, z: fz }));
    out.push(P(new THREE.CircleGeometry(pr * 0.86, 8).rotateX(-Math.PI / 2), [0xc89a3a, 0xa8702a, 0x7a4a22][i]!, { x, y: 0.0026, z: fz }));
  }
  out.push(onFace({ x: fx, z: fz, w: fw, d: pr * 2.4, y: 0, h: 0.0022 }, 'front', -fw * 0.45, 0, 0.0018, 0.0014, 0x2a1a14, E));
  out.push(...stack(0.0028, 0.016, 0xa8583a, IN_DARK, { x: fx + fw / 2 + 0.0016, z: fz }));
  // The shed over it: thatch on bamboo posts, open all round.
  out.push(...stall(fw + 0.002, pr * 2.4 + 0.004, 0.0085, 0xb09a5a, IN_BAMBOO, { x: fx, z: fz }));
  // The kolhu: a stout drum with its beam, by the street; cane stacked by it; bagasse heaped.
  const kx = l.lw * 0.42, kz = Math.min(l.ld * 0.92 - 0.006, fz + pr * 1.2 + 0.0085);
  out.push(cyl(0.0014, 0.0012, 0.0034, 7, IN_WOOD, { x: kx, z: kz }), rod([kx, 0.0032, kz], [kx - 0.0095, 0.0018, kz + 0.0012], 0.00028, IN_WOOD, 4));
  out.push(P(new THREE.CircleGeometry(0.0082, 10).rotateX(-Math.PI / 2), 0xb09a74, { x: kx, y: 0.0005, z: kz })); // the bullocks' trodden ring
  out.push(...logs(6, 0.009, 0.0006, 0x7aa04a, { x: -l.lw * 0.42, z: kz }));
  out.push(cone(0.0042, 0.0026, 7, 0xe0d0a0, { x: -l.lw * 0.1, z: Math.min(l.ld * 0.86 - 0.0035, kz + 0.002) }));
  // Jaggery: cakes heaped on a mat by the godown door, and jars of it.
  out.push(patch(0.006, 0.004, 0xc8b078, b.x - b.w * 0.2, b.z + b.d / 2 + 0.003, 0.0008));
  for (let i = 0; i < 5; i++) out.push(cyl(0.0007, 0.0008, 0.0006, 5, 0x8a4a1a, { x: b.x - b.w * 0.2 - 0.0018 + (i % 3) * 0.0018, y: 0.0008 + (i >= 3 ? 0.0006 : 0), z: b.z + b.d / 2 + 0.003 + (i >= 3 ? 0 : (i % 2) * 0.0008) }));
  for (let i = 0; i < 3; i++) out.push(...pot(0.0012, 0xa8583a, { x: b.x + b.w * 0.05 + i * 0.0028, z: b.z + b.d / 2 + 0.0022 }));
  return out;
};

export const FIRST_TRADE = {
  mediterranean: { shops: [thermopolium, taberna], works: pistrinum },
  nile: { shops: [nileGrocer, nileLinen], works: nileBakery },
  eastAsian: { shops: [cnWineShop, cnSilkShop], works: cnKiln },
  northern: { shops: [enAlehouse, enButcher], works: enSmithy },
  yurt: { shops: [mnAirag, mnTent], works: mnFelt },
  mesoamerican: { shops: [azCook, azMerchant], works: azDyers },
  african: { shops: [etCoffee, etSpice], works: etPotters },
  southAsian: { shops: [inSpice, inCloth], works: inSugar },
} satisfies Record<string, Trade>;
