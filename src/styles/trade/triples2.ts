// Shops and works (houses.ts: a style's variants 3 and 4 are shops, 5 its
// works): monastic, gondarine, haveli, georgian, vosges, gothic, bryggen,
// terem. Three-floor streets, the Renaissance to the Industrial age: each
// drawn after the trades its people kept then, in the style's own
// materials (styles/triples.ts, houses.ts gothic).

import * as THREE from 'three';
import { cone, cyl, type Tf } from '../../propCatalog.ts';
import { wallHeight } from '../../town/geometry.ts';
import {
  E, BAND, FACE_TURN, P, arch, bands, birch, box, chamfered, dome, drum, fence, flatTree, frustum, gable, hip, merlons, onFace, patch, pick, place, prism, ring, shade, spire, storeys, strips, tilted, windows, yard,
  type Body, type Build, type Face, type G, type Trade,
} from '../../houseKit.ts';
import { anvil, awning, barrels, cart, counter, crates, dryingRack, hangingSign, kiln, lantern, logs, roundStack, sacks, signBoard, stack, stall, valance } from '../../tradeKit.ts';

// ---------- local parts ----------

const frontOf = (b: Body) => b.z + b.d / 2;
// Where a face's details stand: out from the body's middle along the face's normal.
const faceAt = (b: Body, face: Face, out: number): [number, number] =>
  face === 'front' ? [0, b.d / 2 + out] : face === 'back' ? [0, -b.d / 2 - out] : face === 'right' ? [b.w / 2 + out, 0] : [-b.w / 2 - out, 0];
// Any outline (x along the face from its middle, y up from the ground) laid on a face.
function onFaceShape(b: Body, face: Face, pts: readonly (readonly [number, number])[], c: number, out = E): G {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))).rotateY(FACE_TURN[face]);
  const [dx, dz] = faceAt(b, face, out);
  return P(g, c, { x: b.x + dx, z: b.z + dz });
}
// A trapezoid on a face (narrower at its top: a Tibetan window's surround).
const trapezoid = (b: Body, face: Face, along: number, y: number, wBot: number, wTop: number, h: number, c: number, out = E) =>
  onFaceShape(b, face, [[along - wBot / 2, y], [along + wBot / 2, y], [along + wTop / 2, y + h], [along - wTop / 2, y + h]], c, out);
// A standing quad, its foot at o.y, facing +z (turned by o.ry).
const pane = (w: number, h: number, c: number, o: Tf = {}) => P(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), c, o);
// A body of revolution: (radius, height) points from the foot up.
const lathe = (pts: readonly (readonly [number, number])[], n: number, c: number, o: Tf = {}) =>
  P(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n), c, o);
// Small cloths along a line from a to b (prayer flags, bunting), hanging below it.
function flags(a: readonly [number, number, number], b: readonly [number, number, number], n: number, colors: readonly number[], size: number): G[] {
  const out: G[] = [], ry = Math.atan2(b[2] - a[2], b[0] - a[0]), fw = Math.min(size * 0.8, (Math.hypot(b[0] - a[0], b[2] - a[2]) / n) * 0.8);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, sag = Math.sin(t * Math.PI) * size * 0.8;
    out.push(pane(fw, size, colors[i % colors.length]!, { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t - sag - size, z: a[2] + (b[2] - a[2]) * t, ry: -ry }));
  }
  return out;
}
// A rod lying along x, its middle at o.
const rodX = (r: number, len: number, n: number, c: number, o: Tf = {}) => cyl(r, r, len, n, c, { ...o, x: (o.x ?? 0) + len / 2, rz: Math.PI / 2 });
// Pots, cheaply: a squat body and a neck.
function pots(n: number, r: number, c: number, o: { x: number; y?: number; z: number }): G[] {
  const out: G[] = [];
  for (let i = 0; i < n; i++) {
    const x = o.x + (i % 4 - 1.5) * r * 2.3, z = o.z + Math.floor(i / 4) * r * 2.3, y = o.y ?? 0;
    out.push(P(new THREE.OctahedronGeometry(r, 0), c, { x, y: y + r * 0.85, z, sy: 0.85, ry: i * 0.4 }), cyl(r * 0.3, r * 0.4, r * 0.8, 4, c, { x, y: y + r * 1.4, z }));
  }
  return out;
}
// A battered (tapering) body's face as it stands at height y: the body widened to where the wall is there.
const batterAt = (b: Body, batter: number, y: number): Body => {
  const t = (batter / 2) * (1 - y / b.h);
  return { ...b, w: b.w + 2 * t, d: b.d + 2 * t };
};

// ---------- Mongols (monastic) ----------
// The monastery towns of the steppe (Urga, Erdene Zuu's town): white
// battered walls, a red band under green tiled roofs, gilded finials; by
// them the Chinese traders' quarter (the maimaicheng) and the felt makers.
const MO_WHITE = [0xf2efe6, 0xece6d8, 0xf4f0e8], MO_GREEN = [0x3d6b4e, 0x356049, 0x4a7a52];
const MO_RED = 0x8c2f2a, MO_GOLD = 0xd2a53a, MO_MAROON = 0x5a2420, MO_DARK = 0x2a2420;
// A Chinese tea merchant's shop in the trading town: a timber front of red
// posts and lattice under a green-tiled pent roof, the counter open in
// its middle, a gabled tile roof with a raised ridge and its curled ends;
// bricks of pressed tea (the steppe's money) stacked by the door, bales of
// wool and furs taken in trade, a black signboard lettered in gold.
const teaHouse: Build = (l) => {
  const white = pick(l, MO_WHITE), green = pick(l, MO_GREEN), s = storeys(l, 0.1), out: G[] = [];
  const b = { ...place(l, 0.86, 0.5, l.ld * 0.34), h: s.base + s.storey * 2 }, f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xc8bea8, 0xd8ccb4, 0.012));
  out.push(...box(b.w + 0.003, 0.0014, b.d + 0.0076, 0x9a948a, { x: b.x, z: b.z + 0.0023 })); // the stone platform
  out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }));
  // The ground floor's timber front: lattice panels between red posts, the open counter in the middle.
  const n = b.w > 0.05 ? 5 : 3, bw = b.w / n;
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5), mid = i === (n - 1) / 2;
    out.push(onFace(b, 'front', a, 0.0014, bw * 0.86, g1 * 0.84, mid ? MO_DARK : 0x7a2a22, E));
    if (!mid) for (const k of [-0.25, 0, 0.25]) out.push(onFace(b, 'front', a + k * bw, 0.003, 0.00035, g1 * 0.66, 0xc89a48, E * 2));
    if (!mid) out.push(onFace(b, 'front', a, 0.003 + g1 * 0.33, bw * 0.7, 0.00035, 0xc89a48, E * 2));
  }
  out.push(...counter(bw * 0.9, 0.002, 0.0042, 0x6a2a20, 0x8a5a38, { x: b.x, z: f + 0.0016 }));
  // The upper floor: lattice windows in red frames, a red band under the eaves.
  out.push(...windows(b, 'front', { ...s, floors: 1, base: g1, w: 0.0042, h: s.storey * 0.42, spacing: 0.0095, sill: s.storey * 0.3, color: 0x7a2a22, frame: MO_RED }));
  out.push(ring(b.w + 0.0005, s.storey * 0.12, b.d + 0.0005, MO_RED, { x: b.x, y: b.h - s.storey * 0.12, z: b.z }));
  // The pent roof over the front on red posts.
  const py = g1 + 0.0004, pd = 0.0058;
  out.push(...frustum(b.w + 0.003, pd, b.w + 0.002, 0.0006, 0.0022, green, { x: b.x, y: py - 0.0012, z: f + pd / 2 - 0.0003 }));
  for (let i = 0; i <= n; i++) out.push(cyl(0.00042, 0.00042, py - 0.0024, 6, MO_RED, { x: b.x - b.w / 2 + bw * i + (i === 0 ? 0.0006 : i === n ? -0.0006 : 0), y: 0.0014, z: f + pd - 0.0012 }));
  out.push(...signBoard(b, 'front', 0, g1 - 0.0036, bw * 0.95, 0.0022, 0x1e1a18, MO_GOLD, E * 3));
  for (const k of [-1, 1]) out.push(...lantern(0.0011, 0xd8382a, { x: b.x + k * bw * 0.9, y: g1 - 0.0034, z: f + pd - 0.0026 }));
  // The roof: gabled along the street, a raised ridge, its ends curled up.
  const rh = b.d * 0.36, rw = b.w + 0.004;
  out.push(...gable(rw, b.d + 0.006, rh, green, { x: b.x, y: b.h, z: b.z }, false, white));
  out.push(...box(rw - 0.0007, 0.0014, 0.0016, shade(green, 0.8), { x: b.x, y: b.h + rh - 0.0005, z: b.z }));
  for (const sx of [-1, 1]) out.push(cone(0.0009, 0.0034, 4, shade(green, 0.8), { x: b.x + sx * (rw / 2 - 0.0004), y: b.h + rh + 0.0005, z: b.z, rz: -sx * 0.5 }));
  // A tall black signboard on a stand by the door, gold-lettered.
  const sx = b.x + b.w / 2 - 0.002, sz = f + 0.0085;
  out.push(...box(0.0028, 0.012, 0.0005, 0x1e1a18, { x: sx, y: 0.0012, z: sz }), ...box(0.0005, 0.0012, 0.0016, 0x4a3020, { x: sx, z: sz }));
  for (let i = 0; i < 4; i++) out.push(pane(0.0012, 0.0013, MO_GOLD, { x: sx, y: 0.0035 + i * 0.0022, z: sz + 0.0005 }));
  // Bricks of tea stacked, wool bales, a bundle of furs.
  const gz = l.ld - 0.006;
  out.push(...crates(6, 0.0022, 0x4a3326, { x: b.x - b.w * 0.3, z: gz }));
  out.push(...sacks(4, 0.0016, 0xe2dac4, { x: b.x - b.w * 0.05, z: gz + 0.0006 }));
  out.push(...box(0.004, 0.0018, 0.0026, 0x6a4a30, { x: b.x + b.w * 0.18, z: gz - 0.0004, ry: 0.3 }));
  return out;
};
// A shop of temple goods by the monastery gate, built Tibetan-fashion: a
// flat roof over battered white walls, the dark red band (the penbe frieze)
// along its top, black trapezoid surrounds to its windows under pleated
// curtains, the Dharma wheel and its two deer gilded on the roof, victory
// banners at the corners. Butter lamps and incense on a table, ceremonial
// scarves (khadag) hung out, prayer wheels turning along its side, a pole
// of prayer flags strung to its roof.
const templeGoods: Build = (l) => {
  const white = pick(l, MO_WHITE), s = storeys(l, 0.1), out: G[] = [], bat = 0.004;
  const b = { ...place(l, 0.62, 0.52, l.ld * 0.36), h: s.base + s.storey * 2 + 0.004 }, f = frontOf(b);
  const top: Body = { ...b, w: b.w - bat, d: b.d - bat };
  out.push(...yard(l, b, 0xc8bea8, 0xd8ccb4, 0.008));
  out.push(...frustum(b.w, b.d, top.w, top.d, b.h, white, { x: b.x, z: b.z }, 0x8a7a68));
  // The penbe frieze, a white coping over it.
  const fh = 0.0045;
  out.push(...frustum(top.w + bat * (fh / b.h) + 0.0004, top.d + bat * (fh / b.h) + 0.0004, top.w + 0.0004, top.d + 0.0004, fh, MO_MAROON, { x: b.x, y: b.h - fh, z: b.z }));
  out.push(...box(top.w + 0.0016, 0.0008, top.d + 0.0016, white, { x: b.x, y: b.h, z: b.z }, 0x8a7a68));
  for (const a of [-0.3, -0.1, 0.1, 0.3]) out.push(onFace(batterAt(b, bat, b.h - fh / 2), 'front', a * top.w, b.h - fh * 0.75, 0.0012, 0.0012, MO_GOLD, E * 3));
  // Windows: black trapezoids, a red frame, the curtain's pleats over each.
  const upY = s.base + s.storey + s.storey * 0.2, wh = s.storey * 0.42;
  for (const a of top.w > 0.03 ? [-0.3, 0, 0.3] : [-0.25, 0.25]) {
    const wb = batterAt(b, bat, upY + wh / 2);
    out.push(trapezoid(wb, 'front', a * top.w, upY - 0.0008, 0.0064, 0.0046, wh + 0.0016, 0x161412, E));
    out.push(onFace(wb, 'front', a * top.w, upY, 0.003, wh, 0x8a3a28, E * 2), onFace(wb, 'front', a * top.w, upY + 0.0006, 0.002, wh - 0.0012, MO_DARK, E * 3));
    out.push(onFace(wb, 'front', a * top.w, upY + wh + 0.0008, 0.0052, 0.0011, 0xf4f0e8, E * 2), onFace(wb, 'front', a * top.w, upY + wh + 0.0008, 0.0052, 0.0004, 0x3a5aa0, E * 3));
  }
  for (const face of ['left', 'right'] as Face[]) {
    const wb = batterAt(b, bat, upY + wh / 2);
    out.push(trapezoid(wb, face, 0, upY - 0.0008, 0.0056, 0.004, wh + 0.0016, 0x161412, E), onFace(wb, face, 0, upY, 0.0026, wh, MO_DARK, E * 2));
  }
  // The door under a black yak-hair curtain with a white knot on it, the shop window beside it.
  const gy = 0.0012, gb = batterAt(b, bat, 0.006);
  out.push(trapezoid(gb, 'front', -top.w * 0.22, 0, 0.0074, 0.0058, s.storey * 0.78, 0x161412, E));
  out.push(onFace(gb, 'front', -top.w * 0.22, 0, 0.0044, s.storey * 0.7, 0x2a2622, E * 2), onFace(gb, 'front', -top.w * 0.22, s.storey * 0.35, 0.0016, 0.0016, 0xf4f0e8, E * 3));
  out.push(trapezoid(gb, 'front', top.w * 0.2, gy + 0.0018, 0.0094, 0.0078, s.storey * 0.5, 0x161412, E), onFace(gb, 'front', top.w * 0.2, gy + 0.0026, 0.0068, s.storey * 0.4, 0x8a3a28, E * 2));
  // The table of butter lamps and incense before the window.
  const tz = f + 0.0034;
  out.push(...counter(0.0086, 0.0026, 0.0036, 0x6a2a20, 0x8a5a38, { x: b.x + top.w * 0.2, z: tz }));
  for (let i = 0; i < 5; i++) out.push(cyl(0.00038, 0.0003, 0.0007, 5, MO_GOLD, { x: b.x + top.w * 0.2 - 0.0032 + i * 0.0016, y: 0.0036, z: tz + (i % 2 ? 0.0005 : -0.0005) }));
  // The roof: the Dharma wheel between its deer, victory banners at the corners.
  const ry = b.h + 0.0008, rz = b.z + top.d / 2 - 0.0016;
  out.push(cyl(0.0027, 0.0027, 0.0005, 8, MO_GOLD, { x: b.x, y: ry + 0.0035, z: rz, rx: Math.PI / 2 }), cyl(0.0012, 0.0012, 0.0006, 8, MO_RED, { x: b.x, y: ry + 0.0035, z: rz + 0.00015, rx: Math.PI / 2 }), ...box(0.0012, 0.0009, 0.001, MO_GOLD, { x: b.x, y: ry, z: rz }));
  for (const k of [-1, 1]) out.push(...box(0.0016, 0.0015, 0.0032, MO_GOLD, { x: b.x + k * 0.0042, y: ry, z: rz - 0.0004, ry: k * 0.5 }), ...box(0.0008, 0.0014, 0.0009, MO_GOLD, { x: b.x + k * 0.0036, y: ry + 0.0015, z: rz + 0.0006 }));
  // The stair head to the roof, at the back: white, its own red band, a black door.
  const st: Body = { x: b.x - top.w * 0.22, z: b.z - top.d * 0.25, w: 0.0074, d: 0.0064, y: ry, h: 0.0062 };
  out.push(...box(st.w, st.h, st.d, white, { x: st.x, y: ry, z: st.z }, 0x8a7a68), ring(st.w + 0.0004, 0.0016, st.d + 0.0004, MO_MAROON, { x: st.x, y: ry + st.h - 0.0016, z: st.z }));
  out.push(onFace(st, 'front', 0, ry, 0.0026, 0.0038, 0x161412, E));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const o = { x: b.x + x * (top.w / 2 - 0.0012), z: b.z + z * (top.d / 2 - 0.0012) };
    out.push(cyl(0.0008, 0.0008, 0.0034, 6, 0x1e1a18, { ...o, y: ry }), dome(0.0008, MO_GOLD, { ...o, y: ry + 0.0034, sy: 1.6 }, 6));
  }
  // Prayer wheels in a red row along the side under a little green roof.
  const side = b.x + b.w / 2 + 0.0018;
  for (let i = 0; i < 4; i++) out.push(cyl(0.0008, 0.0008, 0.0026, 6, i % 2 ? MO_RED : 0xa83a2a, { x: side, y: 0.0016, z: b.z + b.d * 0.3 - i * 0.0024 }), cyl(0.00092, 0.00092, 0.0005, 6, MO_GOLD, { x: side, y: 0.0024, z: b.z + b.d * 0.3 - i * 0.0024 }));
  out.push(...box(0.0034, 0.0003, 0.011, pick(l, MO_GREEN), { x: side + 0.0002, y: 0.0062, z: b.z + b.d * 0.3 - 0.0036 }));
  for (const z of [b.z + b.d * 0.3 + 0.0012, b.z + b.d * 0.3 - 0.0084]) out.push(cyl(0.00022, 0.00022, 0.0062, 4, MO_RED, { x: side + 0.0014, z }));
  // A pole of prayer flags in the yard's corner, strung to the roof.
  const pole: [number, number, number] = [b.x - l.lw * 0.8, 0.026, l.ld * 0.82];
  out.push(cyl(0.0003, 0.0003, pole[1], 4, 0x6a4a30, { x: pole[0], z: pole[2] }), cone(0.0006, 0.0018, 4, MO_GOLD, { x: pole[0], y: pole[1], z: pole[2] }));
  const fc = [0x3a5ab0, 0xf4f0e8, 0xc83a2a, 0x3a8a4a, 0xe8c040];
  out.push(...flags(pole, [b.x - top.w / 2 + 0.001, b.h + 0.0008, b.z + top.d / 2 - 0.001], 9, fc, 0.0019));
  out.push(...flags([pole[0], pole[1] - 0.004, pole[2]], [b.x + top.w / 2 - 0.001, b.h + 0.0008, b.z + top.d / 2 - 0.001], 10, fc, 0.0019));
  // The sang: a whitewashed incense burner, juniper smoke over it.
  const ix = b.x + l.lw * 0.1, iz = l.ld * 0.84;
  out.push(...box(0.0034, 0.0022, 0.0034, white, { x: ix, z: iz }), ...frustum(0.0028, 0.0028, 0.0016, 0.0016, 0.0026, white, { x: ix, y: 0.0022, z: iz }), cone(0.0007, 0.0016, 5, MO_GOLD, { x: ix, y: 0.0048, z: iz }));
  out.push(P(new THREE.OctahedronGeometry(0.0016, 0), 0xc8c4bc, { x: ix + 0.0006, y: 0.0078, z: iz, sy: 1.4 }));
  // Khadag scarves, blue and white, hung out on a rail.
  out.push(...dryingRack(0.009, 0.006, [0x6a9ad8, 0xf4f0e8, 0x6a9ad8, 0xf4f0e8], 0x6a4a30, { x: b.x + l.lw * 0.62, z: l.ld * 0.78 }));
  return out;
};
// A felt works: the felt for the gers was made by beating wet wool, rolling
// it in a hide and dragging the roll behind a horse. A long whitewashed
// shed under a green roof at the back of a walled yard, its stovepipe over
// the cauldron where the water is heated; in the yard a ger of its own
// felt, the new felts hung on frames, rolls of it, heaps of fleece.
const feltWorks: Build = (l) => {
  const white = pick(l, MO_WHITE), green = pick(l, MO_GREEN), out: G[] = [];
  const b = { ...place(l, 0.86, 0.36, l.ld * 1.4), h: wallHeight(1) * 1.15 }, f = frontOf(b);
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8bea8), patch(2 * l.lw * 0.86, l.ld * 0.9, 0xa89c84, 0, l.ld * 0.15, 0.0005));
  out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }));
  out.push(ring(b.w + 0.0005, b.h * 0.14, b.d + 0.0005, MO_RED, { x: b.x, y: b.h * 0.86, z: b.z }));
  for (const k of [-0.3, 0.3]) out.push(...arch(b, 'front', k * b.w, 0, 0.0066, b.h * 0.5, 0x3a2a22, false, E));
  for (const k of [-0.05, 0.12]) out.push(onFace(b, 'front', k * b.w, b.h * 0.42, 0.0034, 0.0028, MO_DARK, E));
  out.push(...frustum(b.w + 0.006, b.d + 0.007, b.w + 0.001, b.d + 0.001, 0.0016, green, { x: b.x, y: b.h, z: b.z }));
  out.push(...gable(b.w + 0.001, b.d + 0.001, b.d * 0.3, green, { x: b.x, y: b.h + 0.0016, z: b.z }, false, white));
  out.push(cyl(0.0009, 0.0009, b.d * 0.3 + 0.008, 6, 0x2a2826, { x: b.x + b.w * 0.36, y: b.h, z: b.z - b.d * 0.15 }));
  // The ger: a white felt drum, its roof of felt over the poles, the orange door to the south.
  const gx = -l.lw * 0.56, gz = l.ld * 0.48, gr = Math.min(0.0085, l.lw * 0.36);
  out.push(cyl(gr, gr, 0.0052, 9, 0xf0ece0, { x: gx, z: gz }), cone(gr * 1.06, 0.0042, 9, 0xe2dccc, { x: gx, y: 0.0052, z: gz }));
  out.push(ring(gr * 2 * 0.72, 0.0006, gr * 2 * 0.72, 0x6a4a30, { x: gx, y: 0.0026, z: gz, ry: Math.PI / 4 }));
  out.push(cyl(gr * 0.22, gr * 0.22, 0.0006, 6, MO_GOLD, { x: gx, y: 0.0092, z: gz }));
  out.push(pane(0.0026, 0.0038, 0xd8742a, { x: gx, z: gz + gr + E * 2 }));
  // Felts drying on frames, rolls of new felt, heaps of fleece.
  out.push(...dryingRack(l.lw * 0.8, 0.0085, [0xeee6d2, 0xd8ccb0, 0xb8a888], 0x6a4a30, { x: l.lw * 0.42, z: l.ld * 0.26 }));
  out.push(...dryingRack(l.lw * 0.8, 0.0085, [0xd8ccb0, 0xeee6d2, 0x8a7a68], 0x6a4a30, { x: l.lw * 0.42, z: l.ld * 0.5 }));
  for (const [i, c] of [0xe8e0cc, 0xd0c4a8, 0xe8e0cc].entries()) out.push(rodX(0.0014, 0.009, 7, c, { x: l.lw * 0.38, y: 0.0014 + (i === 2 ? 0.0024 : 0), z: l.ld * 0.78 + (i === 2 ? 0.0014 : i * 0.0029 - 0.0001) }));
  out.push(...sacks(5, 0.0018, 0xe6e0d0, { x: -l.lw * 0.2, z: l.ld * 0.82 }), ...sacks(3, 0.0016, 0x8a7a68, { x: l.lw * 0.78, z: -l.ld * 0.05 }));
  // The cauldron on its hearth stones by the shed.
  const cx = b.x - b.w / 2 + 0.004, cz = f + 0.0045;
  out.push(cyl(0.0026, 0.0028, 0.0012, 7, 0x6a6460, { x: cx, z: cz }), cyl(0.0022, 0.0018, 0.0024, 7, 0x1e1e20, { x: cx, y: 0.0012, z: cz }), ...drum(0.0018, 0.0018, 0.0001, 7, 0xd8d0c0, { x: cx, y: 0.0034, z: cz }));
  out.push(...fence(l, 0.004, white, 0.012));
  return out;
};

// ---------- Ethiopians (gondarine) ----------
// Gondar, the royal city of the 17th and 18th centuries: castles of rough
// brown basalt laid in lime, red tuff round their arches, flat roofs behind
// crenellations, round domed towers at the corners. Its trade was in the
// hands of the Muslim merchants of Addis Alem; its crafts (weaving,
// smithing, pottery) the Beta Israel's.
const GO_STONE = [0x8a7154, 0x7f684d, 0x947a5c], GO_TUFF = 0xa85c3c, GO_DARK = 0x2e2620, GO_LIME = 0xd8ccb0, GO_THATCH = 0xa88a50;
// A Muslim merchant's house in Addis Alem: two storeys of castle stone, an
// arcade of tuff-dressed arches open on the street, arched windows over it,
// crenellations and a small domed tower on its corner. In the arcade and
// before it the caravan trade: amole (bars of rock salt, the country's
// small money) stacked crosswise, sacks of coffee, jars of honey, on mats.
const saltMerchant: Build = (l) => {
  const stone = pick(l, GO_STONE), s = storeys(l, 0.08), out: G[] = [];
  const b = { ...place(l, 0.8, 0.56, l.ld * 0.3), h: s.base + s.storey * 2 }, f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xb8a070, 0xa89060, 0.012));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, 0x9a8a6a));
  out.push(...box(b.w + 0.0012, 0.0008, b.d + 0.0012, GO_LIME, { x: b.x, y: g1 - 0.0004, z: b.z }));
  // The arcade: tuff arches, dark within.
  const n = b.w > 0.05 ? 4 : 3, bw = b.w / n;
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5);
    out.push(...arch(b, 'front', a, 0, bw * 0.74, g1 * 0.5, GO_TUFF, false, E), ...arch(b, 'front', a, 0, bw * 0.56, g1 * 0.47, GO_DARK, false, E * 2));
    // The upper floor's windows: round-headed, tuff-framed, shuttered in wood.
    out.push(...arch(b, 'front', a, g1 + s.storey * 0.22, 0.0036, s.storey * 0.34, GO_TUFF, false, E), ...arch(b, 'front', a, g1 + s.storey * 0.24, 0.0024, s.storey * 0.3, 0x4a3426, false, E * 2));
  }
  for (const face of ['left', 'right'] as Face[]) out.push(...arch(b, face, 0, g1 + s.storey * 0.24, 0.0024, s.storey * 0.3, GO_DARK, false, E));
  out.push(...merlons(b, b.h, 0.0018, 0.0075, stone, ['front', 'left', 'right']));
  // A timber balcony on beams across the upper floor's middle.
  const bx = b.x + (n % 2 ? 0 : bw / 2), by = g1 + s.storey * 0.2, blw = bw * 1.3;
  for (const k of [-0.4, 0, 0.4]) out.push(...box(0.0006, 0.0006, 0.0034, 0x4a3426, { x: bx + k * blw, y: by - 0.0006, z: f + 0.0015 }));
  out.push(...box(blw, 0.0005, 0.0032, 0x5a3e2a, { x: bx, y: by, z: f + 0.0016 }), ...box(blw, 0.0018, 0.0003, 0x5a3e2a, { x: bx, y: by + 0.0005, z: f + 0.0031 }));
  // The corner tower, its dome.
  const rT = 0.0042, th = b.h + 0.007, to = { x: b.x - b.w / 2 + 0.0008, z: f - 0.0008 };
  out.push(cyl(rT, rT, th, 8, stone, to), cyl(rT + 0.0003, rT + 0.0003, 0.0009, 8, GO_LIME, { ...to, y: th - 0.0016 }), dome(rT * 1.06, stone, { ...to, y: th, sy: 1.15 }, 8));
  out.push(cone(0.0005, 0.0024, 4, GO_LIME, { ...to, y: th + rT * 1.2 }));
  for (const y of [g1 * 0.5, g1 + s.storey * 0.4]) out.push(pane(0.0012, 0.0026, GO_DARK, { x: to.x + Math.sin(-Math.PI / 4) * (rT * 0.93 + E * 2), y, z: to.z + Math.cos(-Math.PI / 4) * (rT * 0.93 + E * 2), ry: -Math.PI / 4 + Math.PI / 8 }));
  // Mats before the arcade; amole bars stacked crosswise on them, coffee, honey.
  const mz = f + 0.005;
  out.push(patch(b.w * 0.8, 0.007, 0xc8a868, b.x + b.w * 0.06, mz, 0.0007));
  for (const [k, x] of [[0, b.x - b.w * 0.12], [1, b.x + b.w * 0.06]] as const) for (let r = 0; r < 2 + k; r++) for (let j = 0; j < 2; j++) {
    const across = r % 2 === 1, o = (j - 0.5) * 0.0013;
    out.push(...box(across ? 0.0032 : 0.0009, 0.0007, across ? 0.0009 : 0.0032, 0xeeeae0, { x: x + (across ? 0 : o), y: 0.0007 + r * 0.0007, z: mz + (across ? o : 0) }));
  }
  out.push(...sacks(5, 0.0016, 0x7a6a48, { x: b.x + b.w * 0.3, z: mz }));
  out.push(...pots(3, 0.001, 0x8a4a2a, { x: b.x - b.w * 0.36, z: mz - 0.0012 }));
  out.push(...flatTree(l.lw * 0.7, -l.ld * 0.78, 1, 0x6a8a3a));
  return out;
};
// A weaver's house and shop: the round house of the Gondar town (a stone
// drum under a tall cone of thatch, a clay pot on its tip), the pit loom
// under a thatched shade beside it, its warp stretched out to a stake; the
// shemma (white cotton cloth with a woven coloured border, the tibeb) hung
// out on lines and folded on a mat for sale.
const shemmaShop: Build = (l) => {
  const stone = pick(l, GO_STONE), out: G[] = [];
  const R = Math.min(l.lw, l.ld) * 0.5, h = wallHeight(1) * 1.3, cx = -l.lw * 0.22, cz = -l.ld * 0.12, turn = Math.PI / 10, rc = R * Math.cos(turn);
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8a070), patch(0.005, l.ld - cz - rc, 0xa89060, cx, (l.ld + cz + rc) / 2, 0.0005));
  out.push(cyl(R, R, h, 10, stone, { x: cx, z: cz, ry: turn }), cyl(R + 0.0003, R + 0.0003, 0.001, 10, GO_LIME, { x: cx, y: h * 0.5, z: cz, ry: turn }));
  // The door, windows round the drum.
  out.push(pane(0.0046, 0.009, GO_TUFF, { x: cx, z: cz + rc + E }), pane(0.0032, 0.0082, 0x4a3426, { x: cx, z: cz + rc + E * 2 }));
  for (const a of [-2, 2, 4, -4].map((k) => (k * Math.PI) / 5)) for (const y of [h * 0.22, h * 0.68]) {
    if (y < h * 0.5 && Math.abs(a) > 2) continue;
    out.push(pane(0.0022, 0.003, GO_DARK, { x: cx + Math.sin(a) * (rc + E), y, z: cz + Math.cos(a) * (rc + E), ry: a }));
  }
  // The thatch: a tall cone, a ring tied round it, the pot on its tip.
  const tr = R * 1.32, thH = R * 1.5;
  out.push(cone(tr, thH, 10, GO_THATCH, { x: cx, y: h, z: cz, ry: turn }), cone(tr * 0.42, thH * 0.42 + 0.0004, 10, shade(GO_THATCH, 0.85), { x: cx, y: h + thH * 0.58 - 0.0004, z: cz, ry: turn }));
  out.push(P(new THREE.SphereGeometry(0.0013, 6, 4), 0x3a2a22, { x: cx, y: h + thH + 0.0008, z: cz }), cone(0.0004, 0.0024, 4, 0x3a2a22, { x: cx, y: h + thH + 0.0016, z: cz }));
  // The loom under its shade, the warp out in front, its stake.
  const lx = l.lw * 0.55, lz = -l.ld * 0.2;
  out.push(...stall(0.011, 0.009, 0.0072, GO_THATCH, 0x5a4030, { x: lx, z: lz }));
  out.push(patch(0.004, 0.003, 0x3a3028, lx, lz - 0.001, 0.0006));
  for (const k of [-1, 1]) out.push(cyl(0.0002, 0.0002, 0.005, 4, 0x5a4030, { x: lx + k * 0.0026, z: lz + 0.0016 }));
  out.push(rodX(0.0002, 0.0056, 4, 0x5a4030, { x: lx, y: 0.005, z: lz + 0.0016 }));
  const wl = l.ld * 0.95, wa = Math.atan2(0.0024, wl);
  out.push(P(new THREE.PlaneGeometry(0.0034, wl).rotateX(-Math.PI / 2 + wa), 0xf4f0e6, { x: lx, y: 0.0016, z: lz + 0.0016 + wl / 2 }));
  out.push(cyl(0.0003, 0.0003, 0.0012, 4, 0x5a4030, { x: lx, z: lz + 0.0016 + wl }));
  // Shemma on lines, each with its border; more folded on a mat.
  const tib = [0xc83a2a, 0x2a6a3a, 0xd8a83a, 0x3a4a9a];
  for (const [r, z] of [[0, l.ld * 0.5], [1, l.ld * 0.78]] as const) {
    const x0 = -l.lw * 0.86, x1 = l.lw * 0.1, n = 3;
    for (const x of [x0, x1]) out.push(cyl(0.00022, 0.00022, 0.0078, 4, 0x5a4030, { x, z }));
    out.push(rodX(0.00016, x1 - x0, 4, 0x5a4030, { x: (x0 + x1) / 2, y: 0.0078, z }));
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / n, cw = ((x1 - x0) / n) * 0.82;
      out.push(pane(cw, 0.0058, 0xf4f0e6, { x, y: 0.0019, z }), pane(cw, 0.0008, tib[(i + r * 2) % tib.length]!, { x, y: 0.0025, z: z + 0.00015 }));
    }
  }
  const fx = l.lw * 0.55, fz = l.ld * 0.62;
  out.push(patch(0.0094, 0.0066, 0xc8a868, fx, fz, 0.0006));
  for (let i = 0; i < 4; i++) out.push(...box(0.0034, 0.0006, 0.0024, 0xf4f0e6, { x: fx - 0.0022 + (i % 2) * 0.0044, y: 0.0006 + Math.floor(i / 2) * 0.0006, z: fz }, 0xf4f0e6), onFace({ x: fx - 0.0022 + (i % 2) * 0.0044, z: fz, w: 0.0034, d: 0.0024, y: 0, h: 0 }, 'front', 0, 0.0007 + Math.floor(i / 2) * 0.0006, 0.0034, 0.00025, tib[i]!, E));
  out.push(...fence(l, 0.003, stone, 0.01), ...flatTree(l.lw * 0.66, -l.ld * 0.78, 1, 0x6a8a3a));
  return out;
};
// A smithy and pottery of the Beta Israel, who were the city's smiths and
// potters: a stone forge-house crenellated like the castles it served, its
// forge glowing in its arch, a stack, a little domed tower on its corner;
// goat-skin bellows and an anvil at its door. Beside it the potters' shade,
// rows of black clay pots (the coffee pot, the jebena, among them) and a
// firing heap smoking in the open.
const forgeAndPots: Build = (l) => {
  const stone = pick(l, GO_STONE), out: G[] = [];
  const b = { ...place(l, 0.6, 0.4, l.ld * 1.4), h: wallHeight(1) * 1.3 }, f = frontOf(b);
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb09868), patch(2 * l.lw * 0.9, l.ld * 1.1, 0xa08a62, 0, l.ld * 0.3, 0.0005));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, 0x9a8a6a), ...merlons(b, b.h, 0.0018, 0.0075, stone, ['front', 'left', 'right']));
  out.push(...arch(b, 'front', -b.w * 0.18, 0, 0.0078, b.h * 0.42, GO_TUFF, false, E), ...arch(b, 'front', -b.w * 0.18, 0, 0.006, b.h * 0.4, 0x1e1a16, false, E * 2));
  out.push(onFace(b, 'front', -b.w * 0.18, 0.0008, 0.0036, 0.0024, 0xe8742a, E * 3));
  out.push(...arch(b, 'front', b.w * 0.24, b.h * 0.42, 0.0026, 0.0034, GO_DARK, false, E));
  out.push(...stack(0.0034, b.h + 0.009, stone, GO_DARK, { x: b.x - b.w * 0.18, z: b.z - b.d * 0.15 }));
  const rT = 0.0034, to = { x: b.x + b.w / 2 - 0.0006, z: f - 0.0006 };
  out.push(cyl(rT, rT, b.h + 0.005, 8, stone, to), dome(rT * 1.06, stone, { ...to, y: b.h + 0.005, sy: 1.15 }, 8));
  // The bellows and the anvil at the door; firewood.
  const dz = f + 0.0042;
  out.push(...sacks(2, 0.0013, 0x5a3e2a, { x: b.x - b.w * 0.18 - 0.0044, z: dz }), ...anvil(0.0022, { x: b.x - b.w * 0.18 + 0.004, z: dz }));
  out.push(...logs(4, 0.008, 0.0007, 0x6a4a30, { x: b.x + b.w * 0.12, z: dz + 0.002 }));
  // The potters' shade and their pots, the firing heap.
  const px = l.lw * 0.45, pz = l.ld * 0.52;
  out.push(...stall(l.lw * 0.8, 0.011, 0.0068, GO_THATCH, 0x5a4030, { x: px, z: pz }));
  out.push(...pots(6, 0.0011, 0x2a2420, { x: px, z: pz - 0.003 }));
  out.push(...pots(4, 0.0013, 0x8a4a2a, { x: -l.lw * 0.15, z: l.ld * 0.84 }));
  const hx = -l.lw * 0.55, hz = l.ld * 0.5;
  out.push(patch(0.012, 0.012, 0x4a4440, hx, hz, 0.0007), dome(0.0042, 0x5a5048, { x: hx, z: hz, sy: 0.55 }, 8));
  out.push(...pots(3, 0.0011, 0x1e1a18, { x: hx + 0.0012, y: 0.0016, z: hz - 0.0012 }));
  out.push(P(new THREE.OctahedronGeometry(0.0026, 0), 0xb8b4ac, { x: hx + 0.001, y: 0.0068, z: hz, sy: 1.5 }));
  out.push(...fence(l, 0.003, stone, 0.01));
  return out;
};

// ---------- Indians (haveli) ----------
// Jaipur, laid out in 1727 with its bazaars built to one design: pink-washed
// sandstone outlined in white, a raised plinth along the street with the
// shops on it under a continuous chhajja (the stone eave on brackets),
// jharokhas over them, chhatris on the roofs.
const HA_PINK = [0xe2967a, 0xd88a70, 0xe8a488], HA_WHITE = 0xf6eadf, HA_SCREEN = 0xb45a44, HA_DARK = 0x3a2420;
const SARI = [0xc8203a, 0xe8b020, 0xd84a8a, 0x2a8a5a, 0xe86a20, 0x3a4aa8];
// A chhajja: a stone eave sloping out from a wall over w, d out, at y (its brackets under it).
function chhajja(b: Body, w: number, d: number, y: number, c: number, along = 0): G[] {
  const z = frontOf(b), out: G[] = [...box(w, 0.0005, d, c, { x: b.x + along, y, z: z + d / 2 - 0.0002, rx: 0.32 })];
  for (let i = 0; i <= Math.round(w / 0.006); i++) out.push(...box(0.0005, 0.0016, 0.0016, c, { x: b.x + along - w / 2 + 0.0006 + i * ((w - 0.0012) / Math.round(w / 0.006)), y: y - 0.0018, z: z + 0.0008 }));
  return out;
}
// A cloth merchant of Johari Bazaar: shops along the raised plinth behind
// cusped arches, white mattresses within where the merchant sits; bolts of
// silk and the tie-dyed bandhani hung from the chhajja, folded cloth piled
// at the edge; two floors of jharokhas over them, a pavilion on the roof.
const clothBazaar: Build = (l) => {
  const pink = pick(l, HA_PINK), bay = shade(pink, 1.06), s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.94, 0.62, l.ld * 0.28), f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xd0b890, 0xc0a888, 0.012));
  out.push(...box(b.w, b.h, b.d, pink, { x: b.x, z: b.z }));
  // The plinth out in front, steps up to it.
  const pd = 0.0052, ph = 0.0026;
  out.push(...box(b.w + 0.0004, ph, pd + 0.0006, shade(pink, 0.9), { x: b.x, z: f + pd / 2 - 0.0003 }, 0xd8c0a8));
  out.push(...box(0.0048, ph * 0.5, 0.0018, shade(pink, 0.9), { x: b.x, z: f + pd + 0.0009 }, 0xd8c0a8));
  // The shops: cusped arches outlined in white, dark within, a white mattress on each floor.
  const n = Math.max(3, Math.min(4, Math.round(b.w / 0.016))), bw = b.w / n;
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5), ow = Math.min(bw * 0.78, 0.0095), oh = g1 * 0.66 - ph;
    out.push(...arch(b, 'front', a, ph, ow + 0.0012, oh, HA_WHITE, true, E), ...arch(b, 'front', a, ph, ow, oh - 0.0004, HA_DARK, true, E * 2));
    out.push(...box(ow * 0.8, 0.0006, 0.0028, 0xf4f0e8, { x: b.x + a, y: ph, z: f + 0.0016 }));
    // Bolts hung from the eave, cloth piled at the plinth's edge.
    for (let k = 0; k < 3; k++) out.push(pane(0.0011, 0.0056, SARI[(i * 3 + k + l.v) % SARI.length]!, { x: b.x + a - ow * 0.38 + k * 0.0013, y: g1 * 0.6 - 0.0048, z: f + 0.0036 + k * 0.0001 }));
    out.push(...box(0.0024, 0.0014, 0.0016, SARI[(i + 2) % SARI.length]!, { x: b.x + a + ow * 0.25, y: ph, z: f + pd - 0.0012 }));
  }
  out.push(...chhajja(b, b.w + 0.0012, 0.0062, g1 * 0.72, HA_WHITE));
  // The upper floors: white floor lines, jharokhas with screens and domed hoods.
  for (const y of [g1, g1 + s.storey]) out.push(...box(b.w + 0.0006, 0.0007, b.d + 0.0006, HA_WHITE, { x: b.x, y, z: b.z }));
  for (let fl = 1; fl < l.floors; fl++) for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5), y = s.base + fl * s.storey + s.storey * 0.16, jw = Math.min(0.0062, bw * 0.6), jd = 0.0026, jh = s.storey * 0.56;
    if ((i + fl) % 2 === 0) {
      const jb: Body = { x: b.x + a, z: f + jd / 2, w: jw, d: jd, y, h: jh };
      out.push(...box(jw, jh, jd, bay, { x: jb.x, y, z: jb.z }), onFace(jb, 'front', 0, y + jh * 0.12, jw * 0.8, jh * 0.7, HA_SCREEN), dome(jw * 0.55, bay, { x: jb.x, y: y + jh, z: jb.z, sz: 0.6 }, 6));
    } else out.push(...arch(b, 'front', a, y, 0.0036, jh * 0.7, HA_WHITE, true, E), ...arch(b, 'front', a, y + 0.0004, 0.0026, jh * 0.62, HA_SCREEN, true, E * 2));
  }
  for (const face of ['left', 'right'] as Face[]) out.push(...windows(b, face, { ...s, w: 0.0024, h: s.storey * 0.36, spacing: 0.016, sill: s.storey * 0.32, color: HA_DARK, frame: HA_WHITE }));
  // The roof: a white coping, a parapet; a pavilion (baradari) on the roof, its white columns, a curved roof.
  out.push(...box(b.w + 0.0014, 0.0012, b.d + 0.0014, HA_WHITE, { x: b.x, y: b.h - 0.001, z: b.z }, shade(pink, 0.85)));
  out.push(ring(b.w, 0.002, b.d, pink, { x: b.x, y: b.h, z: b.z }));
  const pw = Math.min(0.016, b.w * 0.45), pdp = 0.008, py = b.h + 0.0002, pzc = b.z - b.d * 0.1;
  for (let i = 0; i < 4; i++) for (const zz of [-1, 1]) out.push(cyl(0.00032, 0.00032, 0.0046, 4, HA_WHITE, { x: b.x - pw / 2 + 0.0005 + i * ((pw - 0.001) / 3), y: py, z: pzc + zz * (pdp / 2 - 0.0005) }));
  out.push(...box(pw + 0.0008, 0.0008, pdp + 0.0008, HA_WHITE, { x: b.x, y: py + 0.0046, z: pzc }));
  out.push(...gable(pw + 0.0006, pdp + 0.0006, 0.0028, HA_WHITE, { x: b.x, y: py + 0.0054, z: pzc }, false, HA_WHITE));
  return out;
};
// A spice seller's: a narrow house, its one wide shop arch under a striped
// cloth awning on bamboo poles, the spices heaped in baskets before it in
// their colours (chilli, turmeric, coriander, cumin, pepper, fenugreek),
// sacks behind; a great jharokha over the door through two floors, a white
// floral border round its front, one chhatri on its roof.
const spiceShop: Build = (l) => {
  const pink = pick(l, [0xe8a488, 0xe2967a, 0xd88a70]), bay = shade(pink, 1.06), s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.62, 0.6, l.ld * 0.36), f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xd0b890, 0xc0a888, 0.01));
  out.push(...box(b.w, b.h, b.d, pink, { x: b.x, z: b.z }));
  // The white border: up the corners, along the top, a frieze of small rosettes.
  for (const k of [-1, 1]) out.push(onFace(b, 'front', k * (b.w / 2 - 0.0007), 0, 0.0014, b.h, HA_WHITE, BAND));
  out.push(onFace(b, 'front', 0, b.h - 0.0022, b.w, 0.0014, HA_WHITE, BAND));
  for (let i = 0; i < 7; i++) out.push(onFace(b, 'front', -b.w * 0.4 + i * b.w * 0.133, b.h - 0.0042, 0.0008, 0.0008, 0x3a8a6a, E));
  // The shop arch, the awning over it on its poles.
  const ow = b.w * 0.66, oh = g1 * 0.58;
  out.push(...arch(b, 'front', 0, 0, ow + 0.0014, oh, HA_WHITE, true, E), ...arch(b, 'front', 0, 0, ow, oh - 0.0004, HA_DARK, true, E * 2));
  const aw = ow + 0.008, ad = Math.min(0.0105, l.ld * 1.05 - f - 0.0006), ay = g1 * 0.86, tilt = 0.28;
  out.push(...awning(aw, ad, [0xd8402a, 0xf4ead8], { x: b.x, y: ay, z: f + 0.0002, tilt, stripes: 9 }), valance(aw, ad, 0.0012, 0xd8402a, { x: b.x, y: ay, z: f + 0.0002, tilt }));
  for (const k of [-1, 1]) out.push(cyl(0.0003, 0.0003, ay - Math.sin(tilt) * ad, 4, 0xb8a070, { x: b.x + k * (aw / 2 - 0.0003), z: f + 0.0002 + Math.cos(tilt) * ad - 0.0003 }));
  // The baskets of spice on a low stand, two rows; sacks of them behind.
  const spice = [0xb82a1a, 0xe0a818, 0x7a8a3a, 0x8a5a2a, 0x2a2420, 0xc8781a];
  const sz = f + 0.0052;
  out.push(...box(ow * 0.96, 0.0012, 0.0066, 0x6a4a30, { x: b.x, z: sz }));
  for (let i = 0; i < 6; i++) {
    const x = b.x - ow * 0.36 + (i % 3) * ow * 0.36, z = sz + (i < 3 ? 0.0017 : -0.0017), y = 0.0012 + (i < 3 ? 0 : 0.0007);
    out.push(cyl(0.0014, 0.0012, 0.0009, 7, 0xc8a868, { x, y, z }), cone(0.0013, 0.0016, 7, spice[(i + l.v) % spice.length]!, { x, y: y + 0.0009, z }));
  }
  out.push(...sacks(3, 0.0014, 0xd8c8a0, { x: b.x + b.w / 2 + 0.0034, z: f + 0.003 }));
  // The great jharokha over the door: two floors high, three screened bays, a hood with three domes.
  const jw = Math.min(b.w * 0.7, 0.02), jd = 0.0034, jy = g1 + s.storey * 0.12, jh = s.storey * 1.6;
  const jb: Body = { x: b.x, z: f + jd / 2, w: jw, d: jd, y: jy, h: jh };
  out.push(...box(jw, jh, jd, bay, { x: b.x, y: jy, z: jb.z }), ...frustum(jw * 0.5, jd * 0.4, jw, jd, 0.002, bay, { x: b.x, y: jy - 0.002, z: f + jd * 0.5 - 0.0001 }));
  for (const k of [-1, 0, 1]) {
    out.push(...arch(jb, 'front', k * jw * 0.31, jy + 0.0008, jw * 0.22, jh * 0.32, HA_SCREEN, true, E), ...arch(jb, 'front', k * jw * 0.31, jy + jh * 0.5, jw * 0.22, jh * 0.3, HA_SCREEN, true, E));
    out.push(dome(jw * 0.17, HA_WHITE, { x: b.x + k * jw * 0.31, y: jy + jh, z: jb.z }, 6));
  }
  out.push(onFace(jb, 'front', 0, jy + jh * 0.46, jw, 0.0006, HA_WHITE, E * 2));
  for (const face of ['left', 'right'] as Face[]) out.push(...windows(b, face, { ...s, w: 0.0024, h: s.storey * 0.36, spacing: 0.011, sill: s.storey * 0.32, color: HA_DARK, frame: HA_WHITE }));
  // The roof: its coping and parapet, the chhatri in the middle of the front.
  out.push(...box(b.w + 0.0014, 0.0012, b.d + 0.0014, HA_WHITE, { x: b.x, y: b.h - 0.001, z: b.z }, shade(pink, 0.85)), ring(b.w, 0.002, b.d, pink, { x: b.x, y: b.h, z: b.z }));
  const cz = f - 0.0046, py = b.h + 0.0002;
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.00035, 0.00035, 0.0052, 4, HA_WHITE, { x: b.x + x * 0.0028, y: py, z: cz + z * 0.0028 }));
  out.push(...box(0.0072, 0.0007, 0.0072, HA_WHITE, { x: b.x, y: py + 0.0052, z: cz }), dome(0.0034, HA_WHITE, { x: b.x, y: py + 0.0059, z: cz, sy: 1.1 }, 8), cone(0.0004, 0.0018, 4, 0xd2a53a, { x: b.x, y: py + 0.0059 + 0.0036, z: cz }));
  return out;
};
// A block-printing and dye works, after Sanganer's by Jaipur: a low workshop
// with an arcade onto its yard, the long padded tables where the printers
// stamp the cloth with carved blocks; vats sunk in the ground (indigo,
// madder, turmeric yellow), lengths of printed cloth hung high on bamboo
// frames and laid out on the sand to bleach in the sun.
const blockPrinters: Build = (l) => {
  const pink = pick(l, HA_PINK), out: G[] = [];
  const b = { ...place(l, 0.86, 0.34, l.ld * 1.5), h: wallHeight(1) * 1.05 }, f = frontOf(b);
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xd8c098), patch(2 * l.lw * 0.92, l.ld * 1.05, 0xe2cca4, 0, l.ld * 0.36, 0.0005));
  out.push(...box(b.w, b.h, b.d, pink, { x: b.x, z: b.z }));
  const n = Math.max(3, Math.round(b.w / 0.009)), bw = b.w / n;
  for (let i = 0; i < n; i++) out.push(...arch(b, 'front', -b.w / 2 + bw * (i + 0.5), 0, bw * 0.66, b.h * 0.5, HA_WHITE, true, E), ...arch(b, 'front', -b.w / 2 + bw * (i + 0.5), 0, bw * 0.54, b.h * 0.48, HA_DARK, true, E * 2));
  out.push(...box(b.w + 0.0014, 0.0012, b.d + 0.0014, HA_WHITE, { x: b.x, y: b.h - 0.001, z: b.z }, shade(pink, 0.85)), ring(b.w, 0.0022, b.d, pink, { x: b.x, y: b.h, z: b.z }));
  out.push(...chhajja(b, b.w + 0.001, 0.004, b.h * 0.8, HA_WHITE));
  // The printing tables under the arcade's eave, cloth on them, the blocks.
  const tz = f + 0.0058;
  for (const k of [-1, 1]) {
    const tx = b.x + k * b.w * 0.24;
    out.push(...counter(b.w * 0.36, 0.0034, 0.003, 0x6a4a30, 0xeee6d4, { x: tx, z: tz }));
    for (let j = 0; j < 4; j++) out.push(pane(0.0012, 0.0012, j % 2 ? 0xb83a2a : 0x2a3a6a, { x: tx - b.w * 0.12 + j * b.w * 0.08, y: 0.0031, z: tz, rx: -Math.PI / 2 }));
  }
  // The vats.
  const vz = l.ld * 0.22;
  for (const [i, c] of [0x1e2a5a, 0x9a2a2a, 0xd8a020].entries()) {
    const vx = -l.lw * 0.66 + i * 0.0058;
    out.push(cyl(0.0024, 0.0024, 0.0012, 8, 0xb8a080, { x: vx, z: vz }), ...drum(0.002, 0.002, 0.0011, 8, c, { x: vx, z: vz }, c));
  }
  // Cloth on bamboo frames, and laid on the sand.
  out.push(...dryingRack(l.lw * 0.9, 0.0105, [0xc8203a, 0x2a3a7a, 0xe8b020, 0xf2e6d0, 0xd84a8a], 0xb8a070, { x: l.lw * 0.42, z: l.ld * 0.3 }));
  out.push(...dryingRack(l.lw * 0.9, 0.0105, [0x2a6a5a, 0xf2e6d0, 0xc84a2a, 0x3a4aa8], 0xb8a070, { x: l.lw * 0.42, z: l.ld * 0.5 }));
  const lay = [0xf2e6d0, 0xc8203a, 0x2a3a7a, 0xe8b020];
  for (let i = 0; i < 4; i++) {
    const x = -l.lw * 0.86 + i * l.lw * 0.42, c = lay[(i + l.v) % lay.length]!;
    out.push(patch(0.0046, l.ld * 0.5, c, x + 0.0023, l.ld * 0.68, 0.0007 + i * 0.00005));
    out.push(patch(0.003, l.ld * 0.46, shade(c, 0.8), x + 0.0023, l.ld * 0.68, 0.0009 + i * 0.00005));
  }
  return out;
};

// ---------- English (georgian) ----------
// The Georgian street: brick terraces with sash windows, white stone
// trim, parapets hiding slate roofs, chimney stacks on the party walls.
const GE_BRICK = [0x9c4f36, 0x8a4a34, 0xa85c40], GE_WHITE = 0xf1ece2, GE_SLATE = 0x5c6168, GE_GLASS = 0x34404a, GE_GOLD = 0xd2a53a;
// A bow window: half an octagon out from a wall (its middle at x, the wall at z), w wide, d out,
// a panelled riser under glass, glazing bars at its corners and across, a cornice over it.
function bowWindow(x: number, z: number, w: number, d: number, y0: number, h: number, paint: number): G[] {
  const k = 0.42, back = (s: number) => 0.0002 + (s - 1) * 0.02, pts = (s: number): [number, number][] => [[-w / 2 * s, back(s)], [w / 2 * s, back(s)], [w / 2 * s, -d * k * s], [w * 0.26 * s, -d * s], [-w * 0.26 * s, -d * s], [-w / 2 * s, -d * k * s]];
  const outline = pts(1).map(([px, pz]) => [px, -pz] as [number, number]).reverse(), o = { x, z };
  const riser = 0.0026, out: G[] = [...prism(outline, riser, paint, { ...o, y: y0 }), ...prism(outline, h - riser, GE_GLASS, { ...o, y: y0 + riser }, paint)];
  out.push(...prism(pts(1.12).map(([px, pz]) => [px, -pz] as [number, number]).reverse(), 0.0011, paint, { ...o, y: y0 + h }, shade(paint, 0.8)));
  for (const [px, pz] of outline) out.push(...box(0.00034, h - riser - 0.0002, 0.00034, GE_WHITE, { x: x + px, y: y0 + riser, z: z + pz }));
  out.push(...prism(pts(1.012).map(([px, pz]) => [px, -pz] as [number, number]).reverse(), 0.00032, GE_WHITE, { ...o, y: y0 + riser + (h - riser) * 0.5 }));
  return out;
}
// The terrace's upper floors as the houses have them: sash windows in white, a cornice and
// parapet, chimney stacks with their pots on the party walls.
function terraceTop(b: Body, l: Parameters<Build>[0], brick: number, s: ReturnType<typeof storeys>, stacks: readonly number[]): G[] {
  const out: G[] = [];
  out.push(...box(b.w + 0.0016, 0.001, b.d + 0.0016, GE_WHITE, { x: b.x, y: b.h - 0.0008, z: b.z }), ring(b.w, 0.0026, b.d, brick, { x: b.x, y: b.h, z: b.z }));
  out.push(hip(b.w * 0.9, b.d * 0.9, Math.min(b.w, b.d) * 0.2, GE_SLATE, { x: b.x, y: b.h, z: b.z }));
  for (const f of ['front', 'back'] as const) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.0028, h: s.storey * 0.55, spacing: 0.0078, sill: s.storey * 0.22, color: 0x2a3038, frame: GE_WHITE }));
  for (const x of stacks) out.push(...box(0.003, 0.005, 0.006, brick, { x: b.x + x, y: b.h, z: b.z }), cyl(0.0005, 0.0005, 0.0016, 4, 0xc4703f, { x: b.x + x, y: b.h + 0.005, z: b.z - 0.0012 }), cyl(0.0005, 0.0005, 0.0016, 4, 0xc4703f, { x: b.x + x, y: b.h + 0.005, z: b.z + 0.0012 }));
  return out;
}
// A draper's shop in the terrace, its front of the 1780s: painted timber
// over the ground floor, two bow windows of small panes either side of a
// door under a fanlight, slim pilasters, the name in gilt on a long fascia
// under a cornice; the family over the shop.
const bowShop: Build = (l) => {
  const brick = pick(l, GE_BRICK), paint = pick(l, [0x1f3a2c, 0x2a2a3a, 0x5a1e1e]), s = storeys(l, 0.1), out: G[] = [];
  const b = place(l, 0.94, 0.66, l.ld * 0.16), f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0x7d9a55, 0xa8a094));
  out.push(patch(2 * l.lw * 0.94, l.ld - f + b.d * 0.02, 0xa8a094, 0, (l.ld + f) / 2, 0.0004));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
  // The shopfront: painted frame across the ground floor, the fascia, the cornice over it.
  const sw = b.w - 0.002, fy = g1 - 0.0036;
  out.push(onFace(b, 'front', 0, 0, sw, g1 - 0.0004, paint, BAND));
  out.push(...signBoard(b, 'front', 0, fy, sw * 0.86, 0.0024, 0x161616, GE_GOLD, E));
  out.push(...box(sw + 0.0008, 0.0008, 0.0016, paint, { x: b.x, y: fy + 0.0026, z: f + 0.0007 }));
  for (const k of [-0.5, 0.5]) out.push(...box(0.0012, fy, 0.0008, shade(paint, 1.3), { x: b.x + k * (sw - 0.0012), z: f + 0.0003 }));
  // The two bows, the door between them under its fanlight.
  const bw = Math.min(0.0145, b.w * 0.34), bh = fy - 0.0024;
  for (const k of [-1, 1]) out.push(...bowWindow(b.x + k * (b.w * 0.25 + 0.0006), f, bw, 0.0034, 0.0006, bh, paint));
  out.push(...arch(b, 'front', 0, 0, 0.0048, 0.0084, GE_WHITE, false, E), onFace(b, 'front', 0, 0, 0.0036, 0.0078, paint, E * 2), onFace(b, 'front', 0, 0.0082, 0.0032, 0.0012, GE_GLASS, E * 2));
  out.push(...terraceTop(b, l, brick, s, [-b.w / 2 + 0.0015, b.w / 2 - 0.0015]));
  return out;
};
// A coaching inn: stuccoed white over brick, three storeys round a carriage
// arch through to its yard and stables, bay windows of the parlours either
// side, its name painted along the front; the sign hung from a gallows post
// out at the kerb, a lamp over the arch, barrels of ale by the cellar flap,
// a horse trough.
const coachingInn: Build = (l) => {
  const stucco = pick(l, [0xeee6d4, 0xe8dcc0, 0xf2ece0]), s = storeys(l, 0.1), out: G[] = [];
  const b = place(l, 0.96, 0.68, l.ld * 0.24), f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0x9a948a, 0xa8a094, 0.009));
  out.push(...box(b.w, b.h, b.d, stucco, { x: b.x, z: b.z }));
  out.push(...box(b.w + 0.0008, 0.0024, b.d + 0.0008, 0x8a8478, { x: b.x, z: b.z }));
  for (let fl = 1; fl < l.floors; fl++) out.push(...box(b.w + 0.0008, 0.0006, b.d + 0.0008, shade(stucco, 0.92), { x: b.x, y: s.base + fl * s.storey, z: b.z }));
  // The carriage arch, its lamp; the name along the front.
  const aw = 0.0082, ah = g1 * 0.62;
  out.push(...arch(b, 'front', 0, 0, aw + 0.0012, ah, shade(stucco, 0.86), false, E), ...arch(b, 'front', 0, 0, aw, ah, 0x22201e, false, E * 2));
  out.push(patch(aw, 0.004, 0x8a8478, b.x, f + 0.002, 0.0006));
  out.push(...box(0.0012, 0.0016, 0.0012, 0x1a1a1a, { x: b.x, y: ah + aw / 2 + 0.0012, z: f + 0.0012 }), P(new THREE.OctahedronGeometry(0.0007, 0), 0xf0d080, { x: b.x, y: ah + aw / 2 + 0.002, z: f + 0.0012 }));
  out.push(...signBoard(b, 'front', 0, g1 + 0.0004, b.w * 0.7, 0.0026, 0x161616, GE_GOLD, E));
  // The parlours' bay windows: canted, sashed, on either side.
  for (const k of [-1, 1]) {
    const x = b.x + k * b.w * 0.3, w = Math.min(0.012, b.w * 0.24), d = 0.003;
    out.push(...prism([[-w / 2, 0.0002], [-w * 0.3, d], [w * 0.3, d], [w / 2, 0.0002]].map(([px, pz]) => [px!, pz!] as [number, number]).reverse().map(([px, pz]) => [px, -pz] as [number, number]).reverse(), g1 * 0.7, stucco, { x, z: f, y: 0 }, GE_SLATE));
    out.push(...box(w * 0.5, g1 * 0.4, 0.0002, GE_GLASS, { x, y: g1 * 0.2, z: f + d + 0.0002 }), ...box(0.0003, g1 * 0.4 + 0.0003, 0.0003, GE_WHITE, { x, y: g1 * 0.2 - 0.00015, z: f + d + 0.0004 }));
  }
  // Sash windows above, quoins; the hipped roof, its dormers and tall stacks.
  for (const f2 of ['front', 'left', 'right'] as const) out.push(...windows(b, f2, { ...s, floors: l.floors - 1, base: g1, w: 0.0028, h: s.storey * 0.52, spacing: 0.0085, sill: s.storey * 0.22, color: 0x2a3038, frame: GE_WHITE }));
  const rh = Math.min(b.w, b.d) * 0.32;
  out.push(hip(b.w + 0.003, b.d + 0.003, rh, GE_SLATE, { x: b.x, y: b.h, z: b.z }));
  for (const k of [-0.25, 0.25]) {
    const db: Body = { x: b.x + k * b.w, z: b.z + b.d * 0.3, w: 0.0042, d: 0.004, y: b.h + rh * 0.2, h: 0.0042 };
    out.push(...box(db.w, db.h, db.d, GE_WHITE, { x: db.x, y: db.y, z: db.z }), onFace(db, 'front', 0, db.y + 0.0008, 0.0026, 0.0028, GE_GLASS), ...gable(0.005, 0.0048, 0.0018, GE_SLATE, { x: db.x, y: db.y + db.h, z: db.z }, true, GE_WHITE));
  }
  for (const k of [-1, 1]) out.push(...box(0.0034, rh + 0.006, 0.006, pick(l, GE_BRICK), { x: b.x + k * (b.w / 2 - 0.0028), y: b.h, z: b.z }));
  // The sign on its gallows post at the kerb; barrels; the trough.
  const gx = b.x + b.w / 2 - 0.0022, gz = l.ld - 0.003, gh = 0.0175;
  out.push(cyl(0.0004, 0.0004, gh, 5, 0x2a2a2a, { x: gx, z: gz }), ...box(0.0074, 0.0004, 0.0004, 0x2a2a2a, { x: gx - 0.0035, y: gh - 0.0006, z: gz }));
  out.push(...box(0.0052, 0.0062, 0.00035, 0x2a3a5a, { x: gx - 0.004, y: gh - 0.0072, z: gz }), pane(0.0036, 0.0046, GE_GOLD, { x: gx - 0.004, y: gh - 0.0064, z: gz + 0.0004 }), pane(0.0036, 0.0046, GE_GOLD, { x: gx - 0.004, y: gh - 0.0064, z: gz - 0.0004, ry: Math.PI }));
  out.push(...barrels(3, 0.0011, 0x7a5a3a, { x: b.x - b.w * 0.16, z: f + 0.0022 }));
  out.push(...box(0.007, 0.0018, 0.0024, 0x8a8478, { x: b.x - b.w * 0.36, z: l.ld - 0.0034 }, 0x4a5a6a));
  return out;
};
// A potbank, as the Staffordshire potteries built them: a brick workshop
// range round its yard, two bottle ovens rising out of it (a kiln within
// each, the brick hovel round it drawing the smoke up its neck, iron
// bands to hold it), stacks of the fireclay saggars the ware was fired
// in, a heap of coal, crates of ware packed in straw, a cart.
const potbank: Build = (l) => {
  const brick = pick(l, GE_BRICK), out: G[] = [];
  const b = { ...place(l, 0.94, 0.3, l.ld * 1.5), h: wallHeight(2) * 0.95 };
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a8478), patch(2 * l.lw * 0.9, l.ld * 1.2, 0x7a746a, 0, l.ld * 0.3, 0.0005));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
  out.push(...windows(b, 'front', { floors: 2, storey: b.h / 2, base: 0, w: 0.0026, h: b.h * 0.2, spacing: 0.006, sill: b.h * 0.14, color: 0x2a3038, frame: GE_WHITE }));
  out.push(onFace(b, 'front', b.w * 0.3, 0, 0.0052, b.h * 0.42, 0x3a2a22, E * 2), onFace(b, 'front', -b.w * 0.3, b.h * 0.5 + 0.0016, 0.004, b.h * 0.28, 0x3a2a22, E * 2));
  out.push(...gable(b.w + 0.003, b.d + 0.003, b.d * 0.4, GE_SLATE, { x: b.x, y: b.h, z: b.z }, false, brick));
  // The bottle ovens.
  const oven = (x: number, z: number, k: number) => {
    const pts: [number, number][] = [[0.0068 * k, 0], [0.0074 * k, 0.005], [0.007 * k, 0.012 * k], [0.0042 * k, 0.022 * k], [0.0027 * k, 0.029 * k], [0.003 * k, 0.0302 * k]];
    out.push(lathe(pts, 10, brick, { x, z }));
    for (const y of [0.004, 0.0085]) out.push(cyl(0.0075 * k, 0.0075 * k, 0.0005, 10, 0x2a2624, { x, y: y * k, z }));
    out.push(pane(0.003, 0.0052, 0x1e1a18, { x, z: z + 0.0072 * k + 0.0002 }));
  };
  oven(-l.lw * 0.48, l.ld * 0.1, 1);
  if (l.lw > 0.03 || l.ld > 0.03) oven(l.lw * 0.5, -l.ld * 0.05, 0.88);
  // Saggar stacks, coal, crates of ware, the cart.
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3 + (i % 2); j++) out.push(cyl(0.0011, 0.0011, 0.0009, 6, j % 2 ? 0xd8c8a8 : 0xc8b494, { x: l.lw * 0.12 + i * 0.0025, y: j * 0.0009, z: l.ld * 0.62 }));
  out.push(P(new THREE.OctahedronGeometry(0.0034, 0), 0x1e1e20, { x: -l.lw * 0.75, y: 0.0012, z: l.ld * 0.72, sy: 0.4 }));
  out.push(...crates(5, 0.0022, 0xc8a870, { x: l.lw * 0.58, z: l.ld * 0.82 }));
  out.push(...cart(0.0075, 0x6a5a48, 0x3a3028, { x: -l.lw * 0.1, z: l.ld * 0.84, ry: 0.15 }));
  return out;
};

// ---------- French (vosges) ----------
// The brick-and-stone of Henri IV's Paris (the Place Royale, now des
// Vosges): pink brick chained with white stone, steep slate roofs and
// tall dormers, arcades on the square.
const VO_BRICK = [0xc46b52, 0xb8604a, 0xcc7a5e], VO_STONE = 0xefe9dc, VO_SLATE = 0x3f4954, VO_GLASS = 0x2a3038, VO_GOLD = 0xd2a53a;
// The upper floors as the square's houses have them: stone chains, windows in stone
// surrounds; the steep slate roof, its dormers, the brick stacks.
function placeRoyaleTop(b: Body, l: Parameters<Build>[0], brick: number, s: ReturnType<typeof storeys>, g0: number): G[] {
  const out: G[] = [], n = Math.max(2, Math.floor(b.w / 0.011)), bay = b.w / n;
  for (let k = 0; k <= n; k++) out.push(onFace(b, 'front', -b.w / 2 + k * bay, g0, k === 0 || k === n ? 0.0024 : 0.0016, b.h - g0, VO_STONE));
  for (let f = 1; f < l.floors; f++) for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bay * (i + 0.5), y = s.base + f * s.storey + s.storey * 0.2;
    out.push(onFace(b, 'front', a, y - 0.0006, 0.0042, s.storey * 0.6 + 0.0012, VO_STONE), onFace(b, 'front', a, y, 0.003, s.storey * 0.6, VO_GLASS, E * 2));
  }
  for (const f of ['left', 'right'] as const) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: g0, w: 0.0028, h: s.storey * 0.5, spacing: 0.014, sill: s.storey * 0.25, color: VO_GLASS, frame: VO_STONE }));
  const rh = Math.min(b.w, b.d) * 0.55;
  out.push(hip(b.w + 0.002, b.d + 0.002, rh, VO_SLATE, { x: b.x, y: b.h, z: b.z }));
  const zd = b.z + b.d * 0.3, yd = b.h + rh * 0.4 - 0.001;
  const nd = Math.max(1, Math.min(4, n - 1));
  for (let i = 0; i < nd; i++) {
    const db: Body = { x: b.x - b.w * 0.4 + (b.w * 0.8 * (i + 0.5)) / nd, z: zd - 0.0018, w: 0.004, d: 0.0036, y: yd, h: 0.0055 };
    out.push(...box(db.w, db.h, db.d, VO_STONE, { x: db.x, y: yd, z: db.z }), onFace(db, 'front', 0, yd + 0.001, 0.0024, 0.0036, VO_GLASS));
    out.push(...gable(0.005, 0.0046, 0.0026, VO_SLATE, { x: db.x, y: yd + db.h, z: db.z }, true, VO_STONE));
  }
  for (const sx of [-1, 1]) out.push(...box(0.0035, rh + 0.006, 0.0025, brick, { x: b.x + sx * b.w * 0.32, y: b.h, z: b.z - b.d * 0.12 }));
  return out;
}
// A café on the square, after the Procope (1686) and those that followed
// it: its ground floor all glazed doors in a carved and painted wooden
// front, the name in gilt over them, a long awning out over a terrace of
// little round tables and chairs, orange trees in their white Versailles
// boxes at its ends; the brick-and-stone house over it.
const cafe: Build = (l) => {
  const brick = pick(l, VO_BRICK), paint = pick(l, [0x5a1e22, 0x1e3a34, 0x2a3048]), s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.88, 0.62, l.ld * 0.36), f = frontOf(b), g0 = s.base + s.storey;
  out.push(...yard(l, b, 0xc0b8a8, 0xd0c8b8, 0.01));
  out.push(patch(2 * l.lw * 0.94, l.ld - f, 0xc8c0b0, 0, (l.ld + f) / 2, 0.0004));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
  out.push(...box(b.w + 0.0008, g0, b.d + 0.0008, VO_STONE, { x: b.x, z: b.z }));
  // The wooden front: glazed doors between carved posts, the fascia lettered in gilt.
  const fw = b.w - 0.0016, n = Math.max(3, Math.min(7, Math.round(fw / 0.0075))), dw = fw / n, fh = g0 * 0.78;
  const ab: Body = { ...b, w: b.w + 0.0008, d: b.d + 0.0008 };
  out.push(onFace(ab, 'front', 0, 0, fw, fh, paint, E));
  for (let i = 0; i < n; i++) out.push(onFace(ab, 'front', -fw / 2 + dw * (i + 0.5), 0.0012, dw * 0.66, fh * 0.66, VO_GLASS, E * 2), onFace(ab, 'front', -fw / 2 + dw * (i + 0.5), 0.0012 + fh * 0.36, dw * 0.66, 0.0003, VO_GOLD, E * 3));
  out.push(...signBoard(ab, 'front', 0, fh * 0.76, Math.min(fw * 0.8, 0.03), fh * 0.16, 0x161616, VO_GOLD, E * 2));
  // The awning, its valance, its iron arms; the terrace under it.
  const aw = b.w, ad = Math.min(0.0115, l.ld - f - 0.002), ay = g0 * 0.9, tilt = 0.3;
  const stripes = [0xb8302a, 0xf2ece0];
  out.push(...awning(aw, ad, stripes, { x: b.x, y: ay, z: f + 0.0005, tilt, stripes: 11 }), valance(aw, ad, 0.0013, 0xb8302a, { x: b.x, y: ay, z: f + 0.0005, tilt }));
  const tn = Math.max(2, Math.min(3, Math.round(b.w / 0.011)));
  for (let i = 0; i < tn; i++) for (const r of [0, 1]) {
    const tx = b.x - b.w / 2 + (b.w * (i + 0.5 + r * 0.35 - 0.17)) / tn, tz = f + 0.0036 + r * 0.0042;
    out.push(cyl(0.00022, 0.00022, 0.0028, 3, 0x2a2a2a, { x: tx, z: tz }), ...drum(0.0013, 0.0013, 0.0003, 6, 0xe8e2d4, { x: tx, y: 0.0028, z: tz }));
    for (const k of [-1, 1]) out.push(...box(0.0011, 0.0016, 0.0011, 0x6a4a2a, { x: tx + k * 0.0021, z: tz }), pane(0.0011, 0.0016, 0x6a4a2a, { x: tx + k * 0.0021, y: 0.0016, z: tz - 0.00045 }));
  }
  // Orange trees in Versailles boxes at the terrace's ends.
  for (const k of [-1, 1]) {
    const ox = b.x + k * (b.w / 2 + 0.0024), oz = f + 0.0034;
    out.push(...box(0.0028, 0.003, 0.0028, 0xf2ece0, { x: ox, z: oz }, 0x5a4a3a), cyl(0.0003, 0.0003, 0.003, 4, 0x5a4030, { x: ox, y: 0.003, z: oz }), P(new THREE.IcosahedronGeometry(0.0022, 0), 0x3f6a35, { x: ox, y: 0.0072, z: oz }));
  }
  out.push(...placeRoyaleTop(b, l, brick, s, g0));
  return out;
};
// A market hall (a halle) as the towns of France built them from the 1500s:
// a great steep roof on rows of oak posts on stone bases, open all round,
// its eaves low enough to touch, a lantern on its ridge to let the light
// and air in; under it the stalls, baskets and crates of the market.
const halle: Build = (l) => {
  const out: G[] = [], oak = 0x5a4030, tile = pick(l, [0x9a5a3e, 0x8a4a34, 0x3f4954]);
  const b = { ...place(l, 0.92, 0.7, l.ld * 0.3), h: 0.0125 }, f = frontOf(b);
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8b0a0), patch(b.w + 0.002, b.d + 0.002, 0xa8a090, b.x, b.z, 0.0006));
  // The posts on their bases, in rows; the plates over them.
  const nx = Math.max(3, Math.round(b.w / 0.015)), nz = Math.max(2, Math.round(b.d / 0.015));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const edge = i === 0 || i === nx || j === 0 || j === nz;
    if (!edge) continue;
    const x = b.x - b.w / 2 + (b.w * i) / nx, z = b.z - b.d / 2 + (b.d * j) / nz;
    out.push(...box(0.0009, b.h, 0.0009, oak, { x, z }));
  }
  out.push(ring(b.w + 0.0011, 0.0012, b.d + 0.0011, shade(oak, 0.85), { x: b.x, y: b.h - 0.0012, z: b.z }));
  // The roof, steep, its eaves well out; the lantern on the ridge.
  const rh = Math.min(b.w, b.d) * 0.62, rw = b.w + 0.008, rd = b.d + 0.008;
  out.push(hip(rw, rd, rh, tile, { x: b.x, y: b.h, z: b.z }));
  out.push(P(new THREE.PlaneGeometry(rw, rd).rotateX(Math.PI / 2), shade(oak, 0.6), { x: b.x, y: b.h + 0.00002, z: b.z }));
  const lw = Math.min(0.011, b.w * 0.24), ly = b.h + rh * 0.7;
  out.push(...box(lw, 0.006, lw * 0.8, oak, { x: b.x, y: ly, z: b.z }), ...box(lw * 0.7, 0.0028, lw * 0.82, 0x1e1a18, { x: b.x, y: ly + 0.0016, z: b.z }), spire(lw * 1.3, 0.008, tile, { x: b.x, y: ly + 0.006, z: b.z }));
  out.push(cone(0.0003, 0.003, 4, VO_GOLD, { x: b.x, y: ly + 0.0136, z: b.z }));
  // The stalls under it: trestles of produce, baskets, crates; a market woman's cart.
  const prod = [0xb8302a, 0x6a9a3a, 0xe0882a, 0xd8c060, 0x8a3a6a];
  for (let i = 0; i < Math.min(nx, 3); i++) for (const zz of [0.12]) {
    const x = b.x + (i - (Math.min(nx, 3) - 1) / 2) * (b.w / Math.min(nx, 3)), z = b.z + zz * b.d;
    out.push(...counter(Math.min(0.012, b.w / nx * 0.62), 0.0034, 0.003, 0x7a5a3a, 0x8a6a48, { x, z }));
    for (const k of [-1, 0, 1]) out.push(P(new THREE.OctahedronGeometry(0.0009, 0), prod[(i * 2 + k + 1) % prod.length]!, { x: x + k * 0.0016, y: 0.0033, z, sy: 0.6 }));
  }
  // Stalls spilling out before it under their canvas, heaped with produce; crates, sacks, a cart.
  const oz = Math.min(f + 0.0072, l.ld * 1.05 - 0.0042);
  for (const [k, c] of [[-0.3, 0xe8e0cc], [0.12, 0x6a8a9a]] as const) {
    const x = b.x + k * b.w;
    out.push(...stall(0.0094, 0.0062, 0.0062, c, oak, { x, z: oz }), ...counter(0.0084, 0.0046, 0.003, 0x7a5a3a, 0x8a6a48, { x, z: oz }));
    for (let i = 0; i < 4; i++) out.push(P(new THREE.OctahedronGeometry(0.0011, 0), prod[(i + (k > 0 ? 2 : 0)) % prod.length]!, { x: x - 0.003 + i * 0.002, y: 0.0033, z: oz + (i % 2 ? 0.001 : -0.0008), sy: 0.6 }));
  }
  out.push(...crates(5, 0.002, 0xb89a6a, { x: b.x + b.w * 0.4, z: oz }), ...sacks(3, 0.0014, 0xd8c8a0, { x: b.x - b.w * 0.05, z: l.ld - 0.0022 }));
  out.push(...cart(0.0068, 0x7a5a3a, 0x3a3028, { x: b.x + b.w * 0.3, z: l.ld - 0.0034, ry: 0.1 }));
  return out;
};
// A royal faïence manufactory, of the kind Colbert's France chartered
// (Rouen, Nevers, Sèvres): its workshops in a brick-and-stone wing with a
// pedimented middle and the clock over its gate, a slate roof with
// dormers; in the yard the round kiln and its tall brick chimney, the
// cordwood that fired it, crates of ware packed in straw for the road.
const faiencerie: Build = (l) => {
  const brick = pick(l, VO_BRICK), out: G[] = [];
  const b = { ...place(l, 0.94, 0.34, l.ld * 1.5), h: wallHeight(2) }, f = frontOf(b), s = { floors: 2, storey: b.h / 2, base: 0 };
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc0b8a8), patch(2 * l.lw * 0.9, l.ld * 1.15, 0xb0a898, 0, l.ld * 0.32, 0.0005));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }), ...box(b.w + 0.0008, 0.0026, b.d + 0.0008, VO_STONE, { x: b.x, z: b.z }));
  out.push(...box(b.w + 0.0008, 0.0008, b.d + 0.0008, VO_STONE, { x: b.x, y: b.h / 2, z: b.z }));
  out.push(...windows(b, 'front', { ...s, w: 0.0028, h: s.storey * 0.5, spacing: 0.0085, sill: s.storey * 0.24, color: VO_GLASS, frame: VO_STONE }));
  // The middle pavilion: stone, its gate, the clock in its pediment.
  const pw = Math.min(0.016, b.w * 0.36), pb: Body = { x: b.x, z: f + 0.0012, w: pw, d: 0.0024, y: 0, h: b.h + 0.002 };
  out.push(...box(pw, pb.h, 0.0024, VO_STONE, { x: pb.x, z: pb.z }), ...arch(pb, 'front', 0, 0, pw * 0.42, b.h * 0.34, 0x3a2a22, false, E));
  out.push(...windows(pb, 'front', { floors: 1, storey: s.storey, base: s.storey, w: 0.003, h: s.storey * 0.5, spacing: 0.006, sill: s.storey * 0.24, color: VO_GLASS }));
  out.push(...gable(pw + 0.001, 0.0034, 0.0052, VO_SLATE, { x: b.x, y: pb.h, z: pb.z }, false, VO_STONE));
  out.push(cyl(0.0019, 0.0019, 0.0002, 8, 0xf6f2ea, { x: b.x, y: pb.h + 0.0021, z: pb.z + 0.0017, rx: Math.PI / 2 }), ...box(0.0002, 0.0012, 0.0002, 0x161616, { x: b.x, y: pb.h + 0.0016, z: pb.z + 0.0019 }));
  const rh = b.d * 0.5;
  out.push(hip(b.w + 0.002, b.d + 0.002, rh, VO_SLATE, { x: b.x, y: b.h, z: b.z }));
  for (const k of [-0.3, 0.3]) {
    const db: Body = { x: b.x + k * b.w, z: b.z + b.d * 0.18, w: 0.004, d: 0.0036, y: b.h + rh * 0.25, h: 0.0042 };
    out.push(...box(db.w, db.h, db.d, VO_STONE, { x: db.x, y: db.y, z: db.z }), onFace(db, 'front', 0, db.y + 0.0008, 0.0024, 0.0028, VO_GLASS), ...gable(0.005, 0.0046, 0.0022, VO_SLATE, { x: db.x, y: db.y + db.h, z: db.z }, true, VO_STONE));
  }
  // The kiln, its chimney; cordwood; crates of ware.
  const kx = -l.lw * 0.5, kz = l.ld * 0.3;
  out.push(...kiln(0.0062, 0.011, brick, { x: kx, z: kz }), ...roundStack(0.0022, 0.036, brick, VO_STONE, { x: kx - 0.0068, z: kz - 0.0042 }));
  out.push(...logs(9, 0.009, 0.0007, 0x7a5a3a, { x: l.lw * 0.4, z: l.ld * 0.3 }), ...logs(6, 0.009, 0.0007, 0x6a4a30, { x: l.lw * 0.4, z: l.ld * 0.48 }));
  out.push(...crates(6, 0.0024, 0xc8a870, { x: l.lw * 0.1, z: l.ld * 0.8 }), ...cart(0.008, 0x6a5a48, 0x3a3028, { x: -l.lw * 0.55, z: l.ld * 0.8, ry: -0.2 }));
  return out;
};

// ---------- Germans (gothic) ----------
// The old German town (Rothenburg, Goslar, Quedlinburg): a stone ground
// floor, half-timbered floors jettied out over it, steep roofs gable to the
// street, dormers, the guilds' signs hung out over the lanes.
const GT_PLASTER = [0xe8dcc0, 0xe0d0b0, 0xd8c8a0], GT_TIMBER = 0x4a3828, GT_ROOF = [0x4a4e58, 0x8a4e38, 0x5a4a44], GT_STONE = 0xb8ae9a, GT_GLASS = 0x2e2a28, GT_GOLD = 0xd2a53a;
// Half-timbering on a body's faces: posts, a rail at mid height, braces in the end bays (a 'Mann').
function fachwerk(up: Body, faces: readonly Face[]): G[] {
  const out: G[] = [];
  for (const f of faces) {
    const fw = f === 'front' || f === 'back' ? up.w : up.d, n = Math.max(2, Math.min(6, Math.round(fw / 0.008))), bw = fw / n, hh = up.h / 2;
    for (let i = 0; i <= n; i++) out.push(onFace(up, f, -fw / 2 + i * bw + (i === 0 ? 0.0004 : i === n ? -0.0004 : 0), up.y, 0.0008, up.h, GT_TIMBER, BAND));
    out.push(onFace(up, f, 0, up.y + hh - 0.0004, fw, 0.0008, GT_TIMBER, BAND), onFace(up, f, 0, up.y + up.h - 0.0008, fw, 0.0008, GT_TIMBER, BAND));
    for (const [i, s] of [[0, 1], [n - 1, -1]] as const) for (const fl of [0, 1]) {
      const a = -fw / 2 + (i + 0.5) * bw, len = Math.hypot(bw, hh), ang = s * Math.atan2(hh, bw) * (fl ? -1 : 1);
      out.push(tilted(up, f, a, up.y + hh * (fl + 0.5), 0.0007, len * 0.92, Math.PI / 2 - ang, GT_TIMBER, BAND));
    }
  }
  return out;
}
// An apothecary (an Apotheke) of the 1500s: its arched stone portal and
// shop window in the ground floor, two jettied half-timbered floors over
// it, a corner oriel (the Erker) on them with its own spire, the steep
// gable to the street; the sign of its house hung out on a wrought-iron
// bracket (a gilt lion), herbs in pots on the sill.
const apotheke: Build = (l) => {
  const plaster = pick(l, [0xc8d4b0, 0xd0d8bc, 0xbcccb0]), roof = pick(l, GT_ROOF), s = storeys(l), out: G[] = [];
  const b = place(l, 0.78, 0.6, l.ld * 0.32), f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0x7d9a55, 0x9a9488, 0.008), patch(2 * l.lw * 0.94, l.ld - f, 0xa49c90, 0, (l.ld + f) / 2, 0.0004));
  out.push(...box(b.w, g1, b.d, GT_STONE, { x: b.x, z: b.z }));
  const up: Body = { ...b, w: b.w + 0.002, d: b.d + 0.002, y: g1, h: b.h - g1 };
  out.push(...box(up.w, up.h, up.d, plaster, { x: b.x, y: g1, z: b.z }), ...fachwerk(up, ['front', 'left', 'right']));
  // The portal and the shop window, bottles and jars glinting in it.
  out.push(...arch(b, 'front', -b.w * 0.24, 0, 0.0062, g1 * 0.5, shade(GT_STONE, 0.82), false, E), ...arch(b, 'front', -b.w * 0.24, 0, 0.0046, g1 * 0.46, 0x3a2a20, false, E * 2));
  const ww = b.w * 0.4;
  out.push(onFace(b, 'front', b.w * 0.18, g1 * 0.24, ww + 0.0014, g1 * 0.5, shade(GT_STONE, 0.82), E), onFace(b, 'front', b.w * 0.18, g1 * 0.27, ww, g1 * 0.44, GT_GLASS, E * 2));
  for (let i = 0; i < 6; i++) out.push(onFace(b, 'front', b.w * 0.18 - ww * 0.38 + i * ww * 0.15, g1 * 0.3, 0.0008, 0.0016 + (i % 3) * 0.0004, [0x3a7a5a, 0xc8a050, 0x8a3a3a][i % 3]!, E * 3));
  out.push(...box(ww + 0.0016, 0.0005, 0.0016, shade(GT_STONE, 0.8), { x: b.x + b.w * 0.18, y: g1 * 0.24, z: f + 0.0008 }));
  for (let i = 0; i < 3; i++) out.push(cyl(0.0005, 0.0004, 0.0008, 5, 0xa85a3a, { x: b.x + b.w * 0.18 - ww * 0.3 + i * ww * 0.3, y: g1 * 0.24 + 0.0005, z: f + 0.0009 }), P(new THREE.OctahedronGeometry(0.0007, 0), 0x4a7a3a, { x: b.x + b.w * 0.18 - ww * 0.3 + i * ww * 0.3, y: g1 * 0.24 + 0.0016, z: f + 0.0009 }));
  // Windows on the timbered floors (the oriel's corner left clear).
  for (const face of ['front', 'left', 'right'] as Face[]) out.push(...windows({ ...up, y: 0 }, face, { ...s, floors: l.floors - 1, base: g1, w: 0.0026, h: s.storey * 0.4, spacing: 0.0095, sill: s.storey * 0.3, color: GT_GLASS }).filter((_, i) => face !== 'front' || i % 3 !== 0));
  // The oriel: a canted bay out from the corner on a corbel, its spire.
  const ox = b.x + up.w / 2 - 0.0034, oz = f + 0.001 + 0.0022, ow = 0.0066, oh = up.h * 0.82, oy = g1 + s.storey * 0.12;
  out.push(...chamfered(ow, oh, ow, 0.3, plaster, { x: ox, y: oy, z: oz }));
  out.push(...frustum(ow * 0.3, ow * 0.3, ow, ow, 0.003, GT_STONE, { x: ox, y: oy - 0.003, z: oz }));
  for (let fl = 0; fl < l.floors - 1; fl++) {
    const y = oy + fl * (oh / (l.floors - 1)) + s.storey * 0.25;
    out.push(pane(0.0024, s.storey * 0.4, GT_GLASS, { x: ox, y, z: oz + ow / 2 + E }), pane(0.0016, s.storey * 0.36, GT_GLASS, { x: ox + ow / 2 + E, y, z: oz, ry: Math.PI / 2 }));
    out.push(pane(ow, 0.0007, GT_TIMBER, { x: ox, y: y - 0.0012, z: oz + ow / 2 + E * 0.5 }));
  }
  out.push(spire(ow * 1.15, 0.012, roof, { x: ox, y: oy + oh, z: oz, ry: Math.PI / 8 }), cone(0.0003, 0.002, 4, GT_GOLD, { x: ox, y: oy + oh + 0.0115, z: oz }));
  // The steep roof, gable to the street, a hoist hatch high in it; the chimney.
  const rh = Math.min(up.w * 0.8, 0.034);
  out.push(...gable(up.w + 0.003, up.d + 0.003, rh, roof, { x: b.x, y: b.h, z: b.z }, true, plaster));
  const gb: Body = { ...up, d: up.d + 0.003 };
  out.push(onFace(gb, 'front', 0, b.h + rh * 0.2, up.w * 0.6, 0.0008, GT_TIMBER, E), onFace(gb, 'front', 0, b.h + rh * 0.3, 0.0034, 0.0042, GT_GLASS, E));
  out.push(...box(0.0032, rh * 0.45, 0.0032, 0x8a5a44, { x: b.x - b.w * 0.2, y: b.h + rh * 0.5, z: b.z - b.d * 0.2 }));
  // The sign: a gilt lion on a board out from the wall on its bracket.
  out.push(...hangingSign(0.0042, 0.0042, 0xe8dcc0, 0x1a1a1a, { x: b.x - b.w / 2 + 0.0012, y: g1 + 0.0002, z: f + 0.0001 }));
  out.push(pane(0.0026, 0.0028, GT_GOLD, { x: b.x - b.w / 2 + 0.0012 + 0.0003, y: g1 - 0.0036, z: f + 0.0031, ry: Math.PI / 2 }), pane(0.0026, 0.0028, GT_GOLD, { x: b.x - b.w / 2 + 0.0012 - 0.0003, y: g1 - 0.0036, z: f + 0.0031, ry: -Math.PI / 2 }));
  return out;
};
// A baker's (a Bäckerei), its eaves to the street: the ground floor's
// shutters folded down on their brackets into counters by day (the
// Klappladen), the upper leaves propped up over them as a roof; loaves and
// pretzels on them; over the timbered floor a cross-gable (Zwerchhaus) with
// the hoist beam for the flour sacks; the guild's gilt pretzel hung out.
const baeckerei: Build = (l) => {
  const plaster = pick(l, [0xe8c088, 0xe0b080, 0xe8c890]), roof = pick(l, GT_ROOF), s = storeys(l), out: G[] = [];
  const b = place(l, 0.92, 0.58, l.ld * 0.3), f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0x7d9a55, 0x9a9488, 0.007), patch(2 * l.lw * 0.94, l.ld - f, 0xa49c90, 0, (l.ld + f) / 2, 0.0004));
  out.push(...box(b.w, g1, b.d, GT_STONE, { x: b.x, z: b.z }));
  const up: Body = { ...b, w: b.w + 0.002, d: b.d + 0.002, y: g1, h: b.h - g1 };
  out.push(...box(up.w, up.h, up.d, plaster, { x: b.x, y: g1, z: b.z }), ...fachwerk(up, ['front', 'left', 'right']));
  // The shop openings, their shutters down as counters and up as roofs, the bread on them.
  const n = b.w > 0.06 ? 4 : 3, bw = b.w / n, oy = g1 * 0.24, oh = g1 * 0.44, wood = 0x6a4a2a;
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5), ow = bw * 0.64;
    if (i === n - 1) { out.push(...arch(b, 'front', a, 0, 0.0046, g1 * 0.5, 0x3a2a20, false, E)); continue; }
    out.push(onFace(b, 'front', a, oy, ow + 0.0012, oh + 0.0012, shade(GT_STONE, 0.82), E), onFace(b, 'front', a, oy + 0.0006, ow, oh, 0x2a2220, E * 2));
    out.push(...box(ow, 0.0005, 0.0034, wood, { x: b.x + a, y: oy, z: f + 0.0017 }));
    for (const k of [-0.4, 0.4]) out.push(...box(0.0004, oy - 0.0004, 0.0004, wood, { x: b.x + a + k * ow, z: f + 0.0014 }));
    out.push(...box(ow, 0.0005, 0.0038, wood, { x: b.x + a, y: oy + oh + 0.0012, z: f + 0.0016, rx: 0.5 }));
    for (let j = 0; j < 4; j++) out.push(P(new THREE.OctahedronGeometry(0.00085, 0), j % 2 ? 0xb87838 : 0xc88a48, { x: b.x + a - ow * 0.36 + j * ow * 0.24, y: oy + 0.0009, z: f + 0.0018 + (j % 2) * 0.0008, sy: 0.6, sz: j % 2 ? 1.6 : 1 }));
  }
  for (const face of ['front', 'left', 'right'] as Face[]) out.push(...windows({ ...up, y: 0 }, face, { ...s, floors: l.floors - 1, base: g1, w: 0.0026, h: s.storey * 0.4, spacing: 0.0095, sill: s.storey * 0.3, color: GT_GLASS }));
  // The roof along the street, the cross-gable out of it, its hoist and hatch.
  const rh = Math.min(up.d * 0.85, 0.03);
  out.push(...gable(up.w + 0.003, up.d + 0.004, rh, roof, { x: b.x, y: b.h, z: b.z }, false, plaster));
  const zw = Math.min(0.016, up.w * 0.4), zh = rh * 0.62, zd = up.d * 0.5;
  const zb: Body = { x: b.x, z: b.z + up.d / 2 - zd / 2, w: zw, d: zd, y: b.h, h: zh * 0.45 };
  out.push(...box(zw, zb.h, zd, plaster, { x: zb.x, y: b.h, z: zb.z }), ...fachwerk(zb, ['front']));
  out.push(...gable(zw + 0.002, zd + 0.003, zh * 0.62, roof, { x: zb.x, y: b.h + zb.h, z: zb.z + 0.0005 }, true, plaster));
  out.push(onFace(zb, 'front', 0, b.h + 0.0008, 0.0036, zb.h * 0.8, 0x2a2220, E));
  out.push(...box(0.0008, 0.0008, 0.0062, GT_TIMBER, { x: zb.x, y: b.h + zb.h + zh * 0.28, z: zb.z + zd / 2 + 0.0026 }), cyl(0.00012, 0.00012, 0.006, 3, 0x2a2a2a, { x: zb.x, y: b.h + zb.h + zh * 0.28 - 0.006, z: zb.z + zd / 2 + 0.0054 }));
  out.push(...sacks(1, 0.0011, 0xe8e0cc, { x: zb.x + 0.0018, y: b.h + zb.h + zh * 0.28 - 0.0076, z: zb.z + zd / 2 + 0.0054 }));
  out.push(...box(0.0032, rh * 0.4, 0.0032, 0x8a5a44, { x: b.x + b.w * 0.3, y: b.h + rh * 0.55, z: b.z - b.d * 0.15 }));
  // The guild's pretzel, gilt, on its bracket at the corner.
  const px = b.x + b.w / 2 - 0.0008, py = g1 + 0.0004;
  out.push(...box(0.0003, 0.0003, 0.0058, 0x1a1a1a, { x: px, y: py, z: f + 0.0029 }));
  const pretzel = (dx: number) => P(new THREE.TorusGeometry(0.0011, 0.00032, 4, 7), GT_GOLD, { x: px, y: py - 0.0018, z: f + 0.0042 + dx, ry: Math.PI / 2 });
  out.push(pretzel(-0.0007), pretzel(0.0007), P(new THREE.TorusGeometry(0.0016, 0.00032, 4, 8), GT_GOLD, { x: px, y: py - 0.0026, z: f + 0.0042, ry: Math.PI / 2 }));
  return out;
};
// A brewery (a Brauhaus): the brewhouse in stone and timber under a long
// steep roof pricked with little vent dormers, the malt kiln (the Darre)
// at its end, a squat tower whose roof ends in a louvred hood to let the
// kiln's smoke out; the brewer's star hung over the door (the sign that
// fresh beer is on), barrels stacked in the yard, a dray, firewood.
const brauhaus: Build = (l) => {
  const plaster = pick(l, GT_PLASTER), roof = pick(l, GT_ROOF), out: G[] = [];
  const span = 2 * l.lw - 0.014, kw = Math.min(0.016, span * 0.36);
  const b = { ...place(l, 0.68, 0.42, l.ld * 1.4), h: wallHeight(2) * 1.05 }, f = frontOf(b), g1 = b.h * 0.48;
  b.w = span - kw - 0.0004; b.x = -l.lw + 0.007 + b.w / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a9488), patch(2 * l.lw * 0.9, l.ld * 1.1, 0x8a847a, 0, l.ld * 0.3, 0.0005));
  out.push(...box(b.w, g1, b.d, GT_STONE, { x: b.x, z: b.z }));
  const up: Body = { ...b, w: b.w + 0.0016, d: b.d + 0.0016, y: g1, h: b.h - g1 };
  out.push(...box(up.w, up.h, up.d, plaster, { x: b.x, y: g1, z: b.z }), ...fachwerk(up, ['front', 'left']));
  out.push(...arch(b, 'front', -b.w * 0.15, 0, 0.0072, g1 * 0.55, 0x3a2a20, false, E));
  for (const k of [0.18, 0.36]) out.push(onFace(b, 'front', k * b.w, g1 * 0.4, 0.0026, g1 * 0.32, GT_GLASS, E));
  out.push(...windows({ ...up, y: 0 }, 'front', { floors: 1, storey: up.h, base: g1, w: 0.0026, h: up.h * 0.36, spacing: 0.009, sill: up.h * 0.3, color: GT_GLASS }));
  const rh = Math.min(up.d * 0.9, 0.026);
  out.push(...gable(up.w + 0.003, up.d + 0.004, rh, roof, { x: b.x, y: b.h, z: b.z }, false, plaster));
  for (const k of [-0.3, 0, 0.3]) out.push(...box(0.0026, 0.0014, 0.0034, roof, { x: b.x + k * b.w, y: b.h + rh * 0.4, z: b.z + up.d * 0.15 }), onFace({ x: b.x + k * b.w, z: b.z + up.d * 0.15, w: 0.0026, d: 0.0034, y: 0, h: 0 }, 'front', 0, b.h + rh * 0.4 + 0.0002, 0.0018, 0.0009, 0x1e1a18, E));
  // The malt kiln: a stone tower beside it, a hipped roof, the louvred hood on top.
  const kx = b.x + b.w / 2 + kw / 2 + 0.0004, kz = b.z, kh = b.h + 0.004;
  const kb: Body = { x: kx, z: kz, w: kw, d: kw, y: 0, h: kh };
  out.push(...box(kw, kh, kw, GT_STONE, { x: kx, z: kz }), onFace(kb, 'front', 0, kh * 0.55, 0.0024, 0.003, GT_GLASS, E), onFace(kb, 'front', 0, 0, 0.004, 0.007, 0x3a2a20, E));
  out.push(hip(kw + 0.003, kw + 0.003, kw * 0.55, roof, { x: kx, y: kh, z: kz }));
  out.push(...box(0.0036, 0.0028, 0.0036, GT_TIMBER, { x: kx, y: kh + kw * 0.42, z: kz }), ...box(0.0026, 0.0016, 0.0039, 0x1e1a18, { x: kx, y: kh + kw * 0.42 + 0.0006, z: kz }), spire(0.0054, 0.0036, roof, { x: kx, y: kh + kw * 0.42 + 0.0028, z: kz }));
  // The brewer's star over the door.
  const sx = b.x - b.w * 0.15, sy = g1 * 0.55 + 0.0072;
  out.push(...box(0.0003, 0.0003, 0.0046, 0x1a1a1a, { x: sx + 0.0048, y: sy + 0.0028, z: f + 0.0023 }));
  for (const r of [0, Math.PI]) out.push(P(new THREE.CircleGeometry(0.0018, 3, r + Math.PI / 2), GT_GOLD, { x: sx + 0.0048, y: sy + 0.0004, z: f + 0.0042, ry: Math.PI / 2 }));
  // Barrels, the dray, firewood.
  const yz = l.ld * 0.45;
  out.push(...barrels(4, 0.0014, 0x7a5a3a, { x: -l.lw * 0.45, z: yz }), ...barrels(3, 0.0014, 0x6a4a2a, { x: -l.lw * 0.45, z: yz + 0.0034 }));
  out.push(rodX(0.0014, 0.0034, 6, 0x7a5a3a, { x: -l.lw * 0.45, y: 0.0034 + 0.0014, z: yz + 0.0017 }));
  out.push(...cart(0.009, 0x6a5a48, 0x3a3028, { x: l.lw * 0.3, z: l.ld * 0.62, ry: 0.2 }), ...barrels(2, 0.0012, 0x7a5a3a, { x: l.lw * 0.3, y: 0.0034, z: l.ld * 0.62 }));
  out.push(...logs(6, 0.009, 0.0008, 0x6a4a30, { x: l.lw * 0.5, z: l.ld * 0.15 }));
  return out;
};

// ---------- Vikings (bryggen) ----------
// The Hanseatic wharf at Bergen (Bryggen): tall timber merchant houses,
// gable to the harbour, painted red, ochre and white in vertical boards,
// their loading hatches stacked up the gable under a hoist beam; the
// stockfish trade of the north, and the boats and ropes that served it.
const BR_ROOF = [0x5a4a3e, 0x4a4a4e, 0x6a4a3a], BR_DARK = 0x3b2a20, BR_DECK = 0x7a5e44, BR_TAR = 0x2a2420;
const FISH = 0x9a9282;
// A hjell: the A-framed rack the cod hung on in pairs to dry into stockfish (w long along x).
function hjell(w: number, h: number, o: { x: number; z: number }): G[] {
  const out: G[] = [], n = Math.max(2, Math.round(w / 0.006));
  for (let i = 0; i <= n; i++) for (const k of [-1, 1]) out.push(...box(0.0003, h * 1.05, 0.0003, 0x6a5440, { x: o.x - w / 2 + (i * w) / n, z: o.z + k * h * 0.18, rx: -k * 0.32 }));
  out.push(rodX(0.0002, w, 4, 0x6a5440, { x: o.x, y: h, z: o.z }));
  for (const k of [-1, 1]) out.push(rodX(0.00018, w, 4, 0x6a5440, { x: o.x, y: h * 0.62, z: o.z + k * h * 0.12 }));
  for (let i = 0; i < Math.round(w / 0.0012); i++) for (const k of [-1, 1]) out.push(pane(0.00075, h * 0.36, FISH, { x: o.x - w / 2 + 0.0008 + i * 0.0012, y: (k > 0 ? h * 0.6 : h * 0.62) - h * 0.36, z: o.z + k * (h * 0.12 + 0.0002) }));
  return out;
}
// A stockfish merchant's house on the wharf: tall, gable to the harbour,
// its boards painted, the loading doors stacked up its front under the
// hoist beam with its wheel, a gallery (the svalgang) along its side; the
// ground floor its warehouse, open on the wharf with bundles of stockfish
// stacked in it; the drying racks of cod and the barrels of train oil
// out on the planking.
const stockfishHouse: Build = (l) => {
  const col = pick(l, [0x9a5040, 0xd9a441, 0xefe8da]), roof = pick(l, BR_ROOF), s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.54, 0.56, l.ld * 0.5), f = frontOf(b);
  b.x = 0.003;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a6e50), patch(2 * l.lw * 0.94, l.ld - f + 0.002, BR_DECK, 0, (l.ld + f) / 2 - 0.001, 0.0005));
  out.push(...box(b.w, b.h, b.d, col, { x: b.x, z: b.z }), ...strips(b, 'front', 0, b.h, 0.0004, 0.003, shade(col, 0.8)), ...strips(b, 'right', 0, b.h, 0.0004, 0.003, shade(col, 0.8)));
  const rh = b.w * 0.85;
  out.push(...gable(b.w + 0.002, b.d + 0.003, rh, roof, { x: b.x, y: b.h, z: b.z }, true, col));
  // The stacked loading doors, their frames, the hoist beam and wheel.
  for (let fl = 0; fl < l.floors; fl++) {
    const y = fl === 0 ? 0 : s.base + fl * s.storey + s.storey * 0.12, h = fl === 0 ? s.storey * 0.8 : s.storey * 0.62;
    out.push(onFace(b, 'front', 0, y, 0.0062, h + 0.0006, 0xefe8da, E), onFace(b, 'front', 0, y, 0.0052, h, BR_DARK, E * 2));
  }
  out.push(onFace({ ...b, d: b.d + 0.003 }, 'front', 0, b.h + rh * 0.1, 0.0044, rh * 0.36, BR_DARK, E), ...box(0.0009, 0.0009, 0.0062, BR_DARK, { x: b.x, y: b.h + rh * 0.55, z: f + 0.0031 }));
  out.push(cyl(0.0018, 0.0018, 0.0006, 8, 0x6a5440, { x: b.x + 0.0008, y: b.h + rh * 0.45, z: f + 0.0012, rz: Math.PI / 2 }), cyl(0.00012, 0.00012, rh * 0.5, 3, BR_TAR, { x: b.x, y: b.h + rh * 0.05, z: f + 0.0058 }));
  for (const fl of [1, 2]) for (const k of [-1, 1]) if (fl < l.floors) out.push(onFace(b, 'front', k * b.w * 0.34, s.base + fl * s.storey + s.storey * 0.3, 0.0022, s.storey * 0.36, 0x2a2420, E));
  // The gallery along its side: a walkway on posts at each floor, a rail.
  const gx = b.x - b.w / 2 - 0.0018;
  for (let fl = 1; fl < l.floors; fl++) {
    const y = s.base + fl * s.storey;
    out.push(...box(0.0034, 0.0005, b.d * 0.9, BR_DECK, { x: gx, y, z: b.z }), ...box(0.0003, 0.0018, b.d * 0.9, shade(col, 0.85), { x: gx - 0.0016, y: y + 0.0005, z: b.z }));
  }
  for (const k of [-0.42, 0, 0.42]) out.push(cyl(0.0003, 0.0003, s.base + (l.floors - 1) * s.storey + 0.002, 4, BR_DARK, { x: gx - 0.0014, z: b.z + k * b.d }));
  out.push(...box(0.0042, 0.0007, b.d + 0.0022, roof, { x: gx + 0.0004, y: b.h - 0.0008, z: b.z, rz: 0.35 }));
  // In the warehouse door, stockfish in bundles; the racks and the oil barrels out on the wharf.
  for (let i = 0; i < 4; i++) out.push(...box(0.0022, 0.0012, 0.0016, FISH, { x: b.x - 0.0012 + (i % 2) * 0.0024, y: Math.floor(i / 2) * 0.0012, z: f + 0.0012 }, 0xa8a090));
  out.push(...hjell(Math.min(0.022, l.lw * 1.2), 0.0078, { x: 0, z: (f + l.ld) / 2 + 0.0008 }));
  out.push(...barrels(3, 0.0012, 0x6a4a2a, { x: b.x + b.w * 0.36, z: f + 0.0016 }), ...barrels(2, 0.0012, 0x5a3e24, { x: -l.lw * 0.72, z: b.z }));
  return out;
};
// A ship-chandler's: a low house of tarred logs under a roof of turf (as
// the older wharf houses had), its front hatches open on a counter; outside
// all a ship needs: coils of rope, nets hung on a rack to sell or mend,
// barrels of tar, oars stood up against the wall, a ship's lantern hung out.
const chandler: Build = (l) => {
  const out: G[] = [], log = pick(l, [0x5a3e2a, 0x4e3626, 0x634430]), red = pick(l, [0xa5352c, 0xd9a441, 0x8e2f28]);
  const b = { ...place(l, 0.84, 0.54, l.ld * 0.34), h: wallHeight(2) * 0.9 }, f = frontOf(b);
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a6e50), patch(2 * l.lw * 0.94, l.ld - f + 0.002, BR_DECK, 0, (l.ld + f) / 2 - 0.001, 0.0005));
  // A stone footing, the log walls on it, the logs' lines and their corner notches.
  out.push(...box(b.w + 0.0014, 0.0016, b.d + 0.0014, 0x8a8478, { x: b.x, z: b.z }), ...box(b.w, b.h, b.d, log, { x: b.x, z: b.z }));
  out.push(...bands(b, Array.from({ length: Math.floor(b.h / 0.0022) }, (_, i) => 0.0016 + i * 0.0022), 0.0003, shade(log, 0.7)));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) out.push(...box(0.0018, b.h - 0.0003, 0.0018, shade(log, 1.15), { x: b.x + x * (b.w / 2 - 0.00031), z: b.z + z * (b.d / 2 - 0.00031) }));
  // The counter hatches, painted, their flaps propped; the door; a loft hatch.
  const n = b.w > 0.04 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? b.w * 0.18 : (i === 0 ? -0.26 : 0.22) * b.w, hw = 0.0084;
    out.push(onFace(b, 'front', a, b.h * 0.22, hw + 0.0008, b.h * 0.32, red, E), onFace(b, 'front', a, b.h * 0.24, hw, b.h * 0.28, 0x22201c, E * 2));
    out.push(...counter(hw, 0.0028, b.h * 0.22, red, shade(red, 1.15), { x: b.x + a, z: f + 0.0015 }));
    out.push(...box(hw, 0.0004, 0.0036, red, { x: b.x + a, y: b.h * 0.56, z: f + 0.0016, rx: 0.6 }));
    for (let j = 0; j < 3; j++) out.push(cyl(0.0009, 0.0009, 0.0005, 6, 0xb8a070, { x: b.x + a - hw * 0.3 + j * hw * 0.3, y: b.h * 0.22, z: f + 0.0015 }));
  }
  out.push(onFace(b, 'front', n === 1 ? -b.w * 0.24 : b.w * 0.02, 0.0016, 0.0042, b.h * 0.62, red, E), onFace(b, 'front', n === 1 ? -b.w * 0.24 : b.w * 0.02, 0.0016, 0.0032, b.h * 0.58, BR_DARK, E * 2));
  // The turf roof: boards under the sod, the sod's green, its ridge and the barge boards.
  const rh = b.d * 0.36, rw = b.w + 0.003, rd = b.d + 0.004;
  out.push(...gable(rw, rd, rh, 0x5a7a3a, { x: b.x, y: b.h, z: b.z }, false, log));
  out.push(...gable(rw + 0.0004, rd + 0.0004, rh + 0.0004, 0x6a8a44, { x: b.x, y: b.h + 0.0006, z: b.z }, false, log));
  for (let i = 0; i < 5; i++) out.push(P(new THREE.OctahedronGeometry(0.0009, 0), i % 2 ? 0xa8c060 : 0x7a9a48, { x: b.x - rw * 0.4 + i * rw * 0.2, y: b.h + rh * (i % 2 ? 0.5 : 0.7) + 0.001, z: b.z + (i % 2 ? rd * 0.15 : -rd * 0.08), sy: 0.6 }));
  out.push(...box(rw + 0.0012, 0.0007, 0.0012, BR_DARK, { x: b.x, y: b.h + rh + 0.0006, z: b.z }));
  out.push(cyl(0.0012, 0.0012, 0.004, 6, 0x6a6460, { x: b.x + b.w * 0.3, y: b.h + rh * 0.4, z: b.z - b.d * 0.2 }));
  // Rope coils, the net rack, tar barrels, oars, the lantern.
  const gz = l.ld - 0.0046;
  for (let i = 0; i < 4; i++) out.push(cyl(0.0016, 0.0016, 0.0008, 7, i % 2 ? 0xb89a68 : 0xa08458, { x: b.x - b.w * 0.36 + (i % 2) * 0.0036, y: Math.floor(i / 2) * 0.0008, z: gz }), cyl(0.0006, 0.0006, 0.00082, 6, 0x2a2420, { x: b.x - b.w * 0.36 + (i % 2) * 0.0036, y: Math.floor(i / 2) * 0.0008 + 0.00001, z: gz }));
  out.push(...dryingRack(0.012, 0.0075, [0x4a4a42, 0x5a5448, 0x4a4a42], 0x6a5440, { x: b.x + b.w * 0.24, z: gz }));
  out.push(...barrels(3, 0.0012, BR_TAR, { x: b.x + b.w / 2 + 0.0034, z: f + 0.004 }));
  for (let i = 0; i < 4; i++) out.push(...box(0.0005, 0.0115, 0.0003, 0xc8a878, { x: b.x - b.w / 2 + 0.003 + i * 0.0012, z: f + 0.0009, rx: -0.1 }));
  out.push(...box(0.0003, 0.0003, 0.0034, 0x1a1a1a, { x: b.x + b.w * 0.45, y: b.h * 0.86, z: f + 0.0017 }), ...lantern(0.0008, 0xe8c060, { x: b.x + b.w * 0.45, y: b.h * 0.86 - 0.0018, z: f + 0.0032 }));
  return out;
};
// A boatyard on the shore: the boathouse (the naust), long and low, its
// gable open to the water and a boat's prow in it; a clinker-built boat of
// the Norse pattern on the stocks outside, its ribs in and its strakes
// going on; planks stacked to season, the tar kettle over its fire.
const boatyard: Build = (l) => {
  const roof = pick(l, BR_ROOF), wood = pick(l, [0x8e2f28, 0x6a5440, 0xa5352c]), out: G[] = [];
  const b = { ...place(l, 0.4, 0.72, l.ld * 0.4), h: wallHeight(1) * 0.9 }, f = frontOf(b);
  b.x = l.lw - 0.007 - b.w / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a6e50), patch(2 * l.lw * 0.6, l.ld * 1.4, 0x9a8466, -l.lw * 0.3, l.ld * 0.15, 0.0005));
  // The naust: its boarded walls, the open gable, the roof; a boat's prow inside.
  out.push(...box(b.w, b.h, b.d, wood, { x: b.x, z: b.z }, 0x3a2a20), ...strips(b, 'left', 0, b.h, 0.0004, 0.003, shade(wood, 0.8)), ...strips(b, 'right', 0, b.h, 0.0004, 0.003, shade(wood, 0.8)));
  out.push(onFace(b, 'front', 0, 0, b.w * 0.74, b.h * 0.92, 0x1e1a16, E));
  const rh = b.w * 0.6;
  out.push(...gable(b.w + 0.0024, b.d + 0.003, rh, roof, { x: b.x, y: b.h, z: b.z }, true, wood));
  out.push(onFace({ ...b, d: b.d + 0.003 }, 'front', 0, b.h, b.w * 0.5, rh * 0.42, 0x1e1a16, E));
  out.push(...box(0.0006, 0.007, 0.0016, BR_DECK, { x: b.x, y: 0.0012, z: f - 0.0006, rx: 0.4 }));
  // The boat on its stocks: the hull, its ribs, the stem and stern posts rising.
  const hx = -l.lw * 0.42, hz = l.ld * 0.0, len = Math.min(l.ld * 1.3, 0.042), r = len * 0.14, hy = r * 0.95 + 0.0012;
  for (const k of [-0.3, 0, 0.3]) out.push(...box(r * 2.4, 0.0012, 0.0012, BR_DECK, { x: hx, z: hz + k * len }));
  out.push(P(new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0x4a3424, { x: hx, y: hy, z: hz, sz: len / (2 * r), sy: 0.95 }));
  out.push(P(new THREE.SphereGeometry(r * 0.94, 8, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(-1, 1, 1), 0xb8925a, { x: hx, y: hy + 0.0001, z: hz, sz: len / (2 * r), sy: 0.95 }));
  for (let i = 0; i < 5; i++) out.push(...box(r * 2 * Math.cos(((i - 2) / 3) * 1.2), 0.0004, 0.0004, 0x5a4030, { x: hx, y: hy - 0.0002, z: hz + (i - 2) * len * 0.15 }));
  for (const k of [-1, 1]) out.push(...box(0.0005, 0.0068, 0.0009, 0x8a6a48, { x: hx, y: hy - r * 0.6, z: hz + k * (len / 2 - 0.0008), rx: k * 0.45 }));
  out.push(P(new THREE.PlaneGeometry(len * 0.62, r * 0.5), 0x9a7a52, { x: hx - r * 0.98, y: hy - r * 0.3, z: hz, ry: -Math.PI / 2 }));
  // Planks seasoning, the tar kettle on its fire, a heap of shavings.
  out.push(...logs(6, l.lw * 0.6, 0.0007, 0xb89868, { x: -l.lw * 0.42, z: -l.ld * 0.84 }));
  const tx = b.x, tz = (f + l.ld) / 2;
  out.push(cyl(0.002, 0.0022, 0.0006, 6, 0x5a5650, { x: tx, z: tz }), cyl(0.0017, 0.0014, 0.0022, 7, BR_TAR, { x: tx, y: 0.0012, z: tz }), P(new THREE.OctahedronGeometry(0.0008, 0), 0xe8742a, { x: tx, y: 0.0006, z: tz, sy: 0.8 }));
  for (const k of [-1, 1]) out.push(cyl(0.0002, 0.0002, 0.0042, 3, BR_DARK, { x: tx + k * 0.0022, z: tz }));
  out.push(rodX(0.00015, 0.0046, 3, BR_DARK, { x: tx, y: 0.0042, z: tz }));
  out.push(...barrels(2, 0.0012, BR_TAR, { x: b.x + 0.005, z: tz + 0.001 }));
  return out;
};

// ---------- Russians (terem) ----------
// Muscovy's towns of the 1600s and after: plastered houses with white
// trim and red-framed windows, green roofs, tents and kokoshniks (the
// rounded gables in rows), gilded onions; behind them the old log houses
// with their carved boards, and the trades of the gostiny dvor.
const TE_WALL = [0xc9a679, 0xe6dcc8, 0xd2b48a], TE_GREEN = [0x3f7d5a, 0x3a6a8a, 0x4a7a4a], TE_RED = 0xb0352b, TE_WHITE = 0xf2ede1, TE_GOLD = 0xd2a53a, TE_GLASS = 0x2a3038;
// A kokoshnik: a rounded gable, pointed at its top (an ogee), w wide, its foot at y on a face.
const kokoshnik = (b: Body, face: Face, along: number, y: number, w: number, c: number, out = E): G => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 6; i++) { const a = Math.PI - (i / 6) * Math.PI; pts.push([along + Math.cos(a) * w / 2, y + Math.sin(a) * w * 0.45]); }
  pts.splice(4, 0, [along, y + w * 0.62]);
  return onFaceShape(b, face, pts, c, out);
};
// A bay of a gostiny dvor (the merchants' trading court): an arcade of two
// storeys round a market, each arch a shop with its painted signboard (the
// vyveska, its wares pictured for those who could not read) and its goods
// set out; a cornice of kokoshniks, a low green roof, a gilt weathervane.
const gostinyDvor: Build = (l) => {
  const wall = pick(l, TE_WALL), green = pick(l, TE_GREEN), s = storeys(l, 0.1), out: G[] = [];
  const b = { ...place(l, 0.96, 0.6, l.ld * 0.22), h: s.base + s.storey * 2 }, f = frontOf(b), g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xa89a80, 0xb8aa90, 0.01));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }), ...box(b.w + 0.0008, 0.0007, b.d + 0.0008, TE_WHITE, { x: b.x, y: g1 - 0.0004, z: b.z }));
  // The arcade: arches on both floors, white piers between, the shops dark within.
  const n = Math.max(3, Math.min(6, Math.round(b.w / 0.0105))), bw = b.w / n;
  const signs = [0x3a6a3a, 0x2a4a8a, 0xa83a2a, 0xd8a83a, 0x5a3a7a, 0x2a6a6a];
  const wares = [0xa83a2a, 0x3a5a9a, 0xd8b048, 0xe8e0cc, 0x6a8a3a, 0xb87838];
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5), aw = bw * 0.62;
    out.push(onFace(b, 'front', -b.w / 2 + bw * i + (i === 0 ? 0.0008 : 0), 0, 0.0016, b.h, TE_WHITE, BAND));
    out.push(...arch(b, 'front', a, 0, aw, g1 * 0.5, 0x2a2420, false, E));
    out.push(...arch(b, 'front', a, g1 + s.storey * 0.12, aw, s.storey * 0.4, TE_GLASS, false, E));
    // The signboard over each arch, its picture, the wares on a bench before it.
    out.push(onFace(b, 'front', a, g1 * 0.5 + aw / 2 + 0.0006, aw * 1.05, 0.0024, signs[(i + l.v) % signs.length]!, E * 2), onFace(b, 'front', a, g1 * 0.5 + aw / 2 + 0.0011, 0.0016, 0.0014, TE_GOLD, E * 3));
    out.push(...box(aw * 0.9, 0.0018, 0.0022, 0x6a4a2a, { x: b.x + a, z: f + 0.0012 }), ...box(aw * 0.5, 0.0012, 0.0012, wares[(i * 2 + l.v) % wares.length]!, { x: b.x + a - aw * 0.12, y: 0.0018, z: f + 0.0012 }));
  }
  out.push(onFace(b, 'front', b.w / 2 - 0.0008, 0, 0.0016, b.h, TE_WHITE, BAND));
  for (const face of ['left', 'right'] as Face[]) out.push(...windows(b, face, { ...s, floors: 2, w: 0.0026, h: s.storey * 0.4, spacing: 0.011, sill: s.storey * 0.3, color: TE_GLASS, frame: TE_RED }));
  // The cornice of kokoshniks, red-edged, over the arcade; the green roof behind them.
  out.push(...box(b.w + 0.0012, 0.0009, b.d + 0.0012, TE_WHITE, { x: b.x, y: b.h - 0.0011, z: b.z }));
  const kb: Body = { ...b, d: b.d + 0.0012 };
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5);
    out.push(kokoshnik(kb, 'front', a, b.h - 0.0002, bw * 0.92, TE_RED, E), kokoshnik(kb, 'front', a, b.h - 0.0002, bw * 0.76, wall, E * 2));
  }
  out.push(...box(b.w - 0.0006, bw * 0.35, 0.0008, wall, { x: b.x, y: b.h, z: f + 0.0002 }));
  const rh = Math.min(b.w, b.d) * 0.22;
  out.push(hip(b.w + 0.002, b.d + 0.002, rh, green, { x: b.x, y: b.h, z: b.z }));
  out.push(cyl(0.0002, 0.0002, 0.006, 3, 0x2a2a2a, { x: b.x, y: b.h + rh - 0.0004, z: b.z }), pane(0.0026, 0.0014, TE_GOLD, { x: b.x + 0.0013, y: b.h + rh + 0.0036, z: b.z, ry: 0.4 }));
  return out;
};
// A baker's in an old log house (a kalachnaya): the logs on a high
// basement, a steep plank roof gable to the street with its carved white
// barge boards (the prichelina) and the carved towel hung from the apex,
// windows in carved white frames, a porch on posts up to the door; the
// great gilt kalach (the padlock-shaped loaf, the bakers' sign) hung out,
// trays of bread on a bench by the steps.
const kalachnaya: Build = (l) => {
  const log = pick(l, [0x7a5236, 0x6a4a30, 0x84603e]), plank = 0x6e6a60, s = storeys(l, 0.1), out: G[] = [];
  const b = { ...place(l, 0.62, 0.6, l.ld * 0.36), h: s.base + s.storey * 2 + 0.002 }, f = frontOf(b);
  out.push(...yard(l, b, 0x7d9a55, 0xa89a80, 0.008));
  const base = s.base + s.storey * 0.55;
  out.push(...box(b.w + 0.0008, base, b.d + 0.0008, 0x9a948a, { x: b.x, z: b.z }), ...box(b.w, b.h, b.d, log, { x: b.x, z: b.z }));
  out.push(...bands({ ...b, w: b.w + 0.0001, d: b.d + 0.0001 }, Array.from({ length: Math.floor((b.h - base) / 0.0021) }, (_, i) => base + 0.001 + i * 0.0021), 0.0003, shade(log, 0.7), ['front', 'left', 'right']));
  for (const [x, z] of [[-1, 1], [1, 1]] as const) out.push(...box(0.0019, b.h - base - 0.0003, 0.0019, shade(log, 1.12), { x: b.x + x * (b.w / 2 - 0.00031), y: base, z: b.z + z * (b.d / 2 - 0.00031) }));
  // Windows in carved white frames, a small peaked board over each.
  const wy = base + s.storey * 0.25, wh = s.storey * 0.42;
  for (const a of [-0.26, 0.08].map((k) => k * b.w)) {
    out.push(onFace(b, 'front', a, wy - 0.0008, 0.0044, wh + 0.0016, TE_WHITE, E), onFace(b, 'front', a, wy, 0.0028, wh, TE_GLASS, E * 2));
    out.push(onFaceShape(b, 'front', [[a - 0.0028, wy + wh + 0.0008], [a + 0.0028, wy + wh + 0.0008], [a, wy + wh + 0.0034]], TE_WHITE, E));
    out.push(onFace(b, 'front', a, wy - 0.0016, 0.0052, 0.0008, TE_RED, E * 2));
  }
  for (const face of ['left', 'right'] as Face[]) out.push(...windows(b, face, { floors: 1, storey: s.storey, base, w: 0.0028, h: wh, spacing: 0.011, sill: s.storey * 0.25, color: TE_GLASS, frame: TE_WHITE }));
  // The steep gable, its white barge boards, the towel; a gable window.
  const rh = b.w * 0.62, rw = b.w + 0.0036, rd = b.d + 0.004;
  out.push(...gable(rw, rd, rh, plank, { x: b.x, y: b.h, z: b.z }, true, log));
  const gb: Body = { ...b, d: rd };
  const ang = Math.atan2(rh, rw / 2), len = Math.hypot(rh, rw / 2);
  for (const k of [-1, 1]) out.push(tilted(gb, 'front', k * rw / 4, b.h + rh / 2 - 0.0003, len, 0.0011, -k * ang, TE_WHITE, E));
  out.push(onFace(gb, 'front', 0, b.h + rh - 0.0052, 0.0012, 0.005, TE_WHITE, E * 2), onFace(gb, 'front', 0, b.h + rh - 0.0048, 0.0012, 0.0004, TE_RED, E * 3));
  out.push(onFace(gb, 'front', 0, b.h + rh * 0.18, 0.0026, 0.0034, TE_GLASS, E));
  // The porch: steps up to the door on the right, a little roof on posts.
  const px = b.x + b.w * 0.36, pz = f + 0.003;
  out.push(onFace(b, 'front', b.w * 0.36, base, 0.0036, s.storey * 0.62, 0x3a2a20, E));
  for (let i = 0; i < 3; i++) out.push(...box(0.0042, base * (i + 1) / 3, 0.0018, 0x8a6a48, { x: px, z: pz + 0.0024 - i * 0.0016 }));
  out.push(...box(0.0058, 0.0004, 0.0062, 0x8a6a48, { x: px, y: base, z: f + 0.0026 }));
  for (const k of [-1, 1]) out.push(cyl(0.0003, 0.0003, base + s.storey * 0.7, 5, TE_WHITE, { x: px + k * 0.0025, z: f + 0.0054 }));
  out.push(...gable(0.0072, 0.0074, 0.0034, plank, { x: px, y: base + s.storey * 0.7, z: f + 0.003 }, true, TE_WHITE));
  // The kalach: a gilt ring with its handle, hung out on its bracket.
  const kx = b.x - b.w / 2 + 0.001, ky = base + s.storey * 0.95;
  out.push(...box(0.0003, 0.0003, 0.0056, 0x1a1a1a, { x: kx, y: ky, z: f + 0.0028 }));
  out.push(P(new THREE.TorusGeometry(0.0019, 0.0007, 4, 8), TE_GOLD, { x: kx, y: ky - 0.0028, z: f + 0.0046, ry: Math.PI / 2 }), P(new THREE.TorusGeometry(0.0012, 0.0003, 3, 6, Math.PI), TE_GOLD, { x: kx, y: ky - 0.0012, z: f + 0.0046, ry: Math.PI / 2 }));
  // Bread on trays on a bench by the steps.
  out.push(...counter(0.0076, 0.0026, 0.0028, 0x6a4a2a, 0x8a6a48, { x: b.x - b.w * 0.12, z: f + 0.0034 }));
  for (let i = 0; i < 4; i++) out.push(P(new THREE.OctahedronGeometry(0.0009, 0), i % 2 ? 0xc88a48 : 0xa86a30, { x: b.x - b.w * 0.12 - 0.0027 + i * 0.0018, y: 0.0034, z: f + 0.0034, sy: 0.6 }));
  out.push(...birch(-l.lw * 0.7, -l.ld * 0.78, 1));
  return out;
};
// A bell foundry, the craft Muscovy was proudest of: a brick casting shed
// in the Russian manner (red brick, white trim, a tall stack over the
// furnace); in the yard the casting pit with a bell's clay mould standing
// in it, and new bells hung on a timber frame to be tried, the charcoal
// heaped by the furnace door, a cart for the copper and tin.
const bellFoundry: Build = (l) => {
  const brick = pick(l, [0xa85a40, 0x9a5038, 0xb0634a]), green = pick(l, TE_GREEN), out: G[] = [];
  const b = { ...place(l, 0.9, 0.36, l.ld * 1.5), h: wallHeight(2) * 0.9 }, f = frontOf(b);
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a9080), patch(2 * l.lw * 0.9, l.ld * 1.15, 0x7a7266, 0, l.ld * 0.3, 0.0005));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }), ...box(b.w + 0.0008, 0.0009, b.d + 0.0008, TE_WHITE, { x: b.x, y: b.h - 0.0011, z: b.z }));
  const n = Math.max(2, Math.round(b.w / 0.011));
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + (b.w * (i + 0.5)) / n;
    if (i === 0) { out.push(...arch(b, 'front', a, 0, 0.0074, b.h * 0.42, TE_WHITE, false, E), ...arch(b, 'front', a, 0, 0.006, b.h * 0.4, 0x1e1a16, false, E * 2), onFace(b, 'front', a, 0.0006, 0.0036, 0.0022, 0xe8742a, E * 3)); continue; }
    out.push(...arch(b, 'front', a, b.h * 0.35, 0.0036, b.h * 0.3, TE_WHITE, false, E), ...arch(b, 'front', a, b.h * 0.35 + 0.0005, 0.0026, b.h * 0.28, TE_GLASS, false, E * 2));
  }
  const rh = b.d * 0.36;
  out.push(...gable(b.w + 0.003, b.d + 0.003, rh, green, { x: b.x, y: b.h, z: b.z }, false, brick));
  out.push(...stack(0.0042, b.h + rh + 0.012, brick, TE_WHITE, { x: b.x - b.w / 2 + (b.w * 0.5) / n, z: b.z - b.d * 0.2 }));
  // The casting pit, the mould in it.
  const mx = l.lw * 0.42, mz = l.ld * 0.15;
  out.push(patch(0.012, 0.012, 0x3a3430, mx, mz, 0.0007), ring(0.012, 0.0012, 0.012, 0x8a8478, { x: mx, z: mz }));
  out.push(lathe([[0.0042, 0], [0.0036, 0.0018], [0.0026, 0.0054], [0.0012, 0.0066], [0.0002, 0.0068]], 8, 0x8a6a4a, { x: mx, y: 0.0002, z: mz }));
  // The frame of new bells.
  const bx = -l.lw * 0.42, bz = l.ld * 0.3, fw = Math.min(0.02, l.lw * 0.9), fh = 0.011;
  for (const k of [-1, 1]) out.push(...box(0.0009, fh, 0.0009, 0x5a4030, { x: bx + k * fw / 2, z: bz }));
  out.push(...box(fw + 0.0014, 0.0009, 0.0011, 0x5a4030, { x: bx, y: fh, z: bz }));
  const bell = (x: number, r: number) => {
    const k = r / 0.0028;
    out.push(cyl(0.00012, 0.00012, 0.0016, 3, 0x2a2a2a, { x, y: fh - 0.0016, z: bz }));
    out.push(lathe([[0.0028 * k, 0], [0.0025 * k, 0.0005 * k], [0.0018 * k, 0.0022 * k], [0.0016 * k, 0.0035 * k], [0.0009 * k, 0.0041 * k], [0.0001, 0.0042 * k]], 8, 0xb88a40, { x, y: fh - 0.0016 - 0.0042 * k, z: bz }));
  };
  bell(bx - fw * 0.28, 0.0026); bell(bx + fw * 0.05, 0.0034); bell(bx + fw * 0.34, 0.0019);
  // Charcoal, the cart.
  out.push(P(new THREE.OctahedronGeometry(0.0034, 0), 0x1e1e20, { x: b.x - b.w * 0.2, y: 0.0011, z: f + 0.0052, sy: 0.4 }));
  out.push(...cart(0.0078, 0x6a5a48, 0x3a3028, { x: l.lw * 0.3, z: l.ld * 0.78, ry: 0.15 }), ...birch(-l.lw * 0.78, l.ld * 0.82, 0.9));
  return out;
};

export const TRIPLES2_TRADE = {
  monastic: { shops: [teaHouse, templeGoods], works: feltWorks },
  gondarine: { shops: [saltMerchant, shemmaShop], works: forgeAndPots },
  haveli: { shops: [clothBazaar, spiceShop], works: blockPrinters },
  georgian: { shops: [bowShop, coachingInn], works: potbank },
  vosges: { shops: [cafe, halle], works: faiencerie },
  gothic: { shops: [apotheke, baeckerei], works: brauhaus },
  bryggen: { shops: [stockfishHouse, chandler], works: boatyard },
  terem: { shops: [gostinyDvor, kalachnaya], works: bellFoundry },
} satisfies Record<string, Trade>;
