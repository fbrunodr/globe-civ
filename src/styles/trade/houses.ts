// Shops and works (houses.ts: a style's variants 3 and 4 are shops, 5 its
// works): cycladic, andalusian, mesopotamian, windcatcher, levantine,
// machiya, izba, longhouse, fachwerk, slate. Each drawn after the trades
// its people kept, in its home's own materials (styles/houses.ts).

import * as THREE from 'three';
import { cone, cyl, seg, type Tf } from '../../propCatalog.ts';
import { wallHeight } from '../../town/geometry.ts';
import {
  E, BAND, FACE_TURN, P, arch, bands, birch, box, chimney, disc, dome, drum, fence, frustum, gable, hip, merlons, palm, shade, onFace, patch, pick, place, ring, shrub, steps, storeys, strips, tilted, tree, windows, yard, faceWidth,
  SEEN, type Body, type Build, type Face, type G, type Lot, type Trade, smokeFrom,
} from '../../houseKit.ts';
import { anvil, awning, barrels, cart, crates, doubleDoor, hangingSign, lantern, leanTo, logs, sacks, signBoard, stall } from '../../tradeKit.ts';

// ---------- local helpers ----------

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// A triangle (a sail, a gable's infill) from three points, in the lot's frame or o's.
function tri(a: readonly number[], b: readonly number[], c: readonly number[], col: number, o: Tf = {}): G {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  return P(g, col, o);
}
// A barrel vault: a half cylinder r across, len long along z (or x: `alongX`), its springing at o.y, closed at both ends.
function vault(r: number, len: number, c: number, o: Tf = {}, alongX = false, end = c): G[] {
  const ry = (o.ry ?? 0) + (alongX ? Math.PI / 2 : 0);
  const shell = new THREE.CylinderGeometry(r, r, len, 8, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  const cap = (s: number) => new THREE.CircleGeometry(r, 8, 0, Math.PI).translate(0, 0, s * len / 2);
  return [P(shell, c, { ...o, ry }), P(cap(1), end, { ...o, ry }), P(cap(-1), end, { ...o, ry })];
}
// A pot (a jug, a jar) cheaply: a six-sided belly narrowing to a neck, r across, its foot at o.
const pot = (r: number, c: number, o: Tf = {}): G[] => [
  cyl(r * 0.6, r, r * 1.1, 5, c, o), cyl(r, r * 0.4, r * 1.3, 5, c, { ...o, y: (o.y ?? 0) + r * 1.1 }),
];
// A cup or bowl: one short flared ring.
const cup = (r: number, c: number, o: Tf = {}) => cyl(r * 0.6, r, r * 0.9, 5, c, o);
// A row of pots along x, `step` apart, centred on o.
const pots = (n: number, r: number, step: number, cs: readonly number[], o: Tf = {}): G[] =>
  Array.from({ length: n }, (_, i) => pot(r * (i % 3 === 1 ? 0.8 : 1), cs[i % cs.length]!, { ...o, x: (o.x ?? 0) + (i - (n - 1) / 2) * step })).flat();
// A face-local shape (x along the face from its middle, y up, in its plane) set on a face of a body, `out` proud of it.
function onFaceShape(b: Body, face: Face, g: THREE.BufferGeometry, c: number, out = E): G {
  g.rotateY(FACE_TURN[face]);
  const [dx, dz] = face === 'front' ? [0, b.d / 2 + out] : face === 'back' ? [0, -b.d / 2 - out] : face === 'right' ? [b.w / 2 + out, 0] : [-b.w / 2 - out, 0];
  return P(g, c, { x: b.x + dx, z: b.z + dz });
}
// A horseshoe arch (the Moors'): its round head closing in below its widest, r the head's radius, the jambs h high.
function horseshoe(b: Body, face: Face, along: number, y: number, r: number, h: number, c: number, out = E): G[] {
  const k = 0.42, jw = 2 * r * Math.cos(k), yc = y + h + r * Math.sin(k);
  return [
    onFaceShape(b, face, new THREE.PlaneGeometry(jw, h).translate(along, y + h / 2, 0), c, out),
    onFaceShape(b, face, new THREE.CircleGeometry(r, 9, -k, Math.PI + 2 * k).translate(along, yc, 0), c, out),
  ];
}
// A cask on its side, its axis along z (its head to the street), on y = o.y.
const cask = (r: number, len: number, c: number, head: number, o: Tf = {}): G[] => [
  cyl(r * 0.9, r, len / 2, 6, c, { ...o, y: (o.y ?? 0) + r, rx: Math.PI / 2 }), cyl(r, r * 0.9, len / 2, 6, c, { ...o, y: (o.y ?? 0) + r, z: (o.z ?? 0) + len / 2, rx: Math.PI / 2 }),
  P(new THREE.CircleGeometry(r * 0.9, 6), head, { ...o, y: (o.y ?? 0) + r, z: (o.z ?? 0) + len + 0.00005 }),
];
// Hangings to dry along a pole (skeins, cloths, fish): two posts, the pole between them along x, `cloths` down from it, each `drop` long.
function rack(w: number, h: number, drop: number, cloths: readonly number[], pole: number, o: { x: number; z: number }): G[] {
  const out: G[] = [cyl(0.00025, 0.00025, h, 4, pole, { x: o.x - w / 2, z: o.z }), cyl(0.00025, 0.00025, h, 4, pole, { x: o.x + w / 2, z: o.z })];
  out.push(cyl(0.0002, 0.0002, w, 4, pole, { x: o.x + w / 2, y: h, z: o.z, rz: Math.PI / 2 }));
  const n = cloths.length, cw = (w * 0.88) / n;
  for (let i = 0; i < n; i++) out.push(P(new THREE.PlaneGeometry(cw * 0.78, drop), cloths[i]!, { x: o.x - w * 0.44 + cw * (i + 0.5), y: h - drop / 2 - 0.0002, z: o.z }));
  return out;
}
// The spandrels over a round arch R across (a 2R × R rectangle less the arch's half disc), in a face's plane, the springing at y = 0.
function spandrels(R: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(R, 0); sh.lineTo(R, R); sh.lineTo(-R, R); sh.lineTo(-R, 0); sh.absarc(0, 0, R, Math.PI, 0, true);
  return new THREE.ShapeGeometry(sh, 4);
}
// Smoke over a kiln or a forge: where it rises from (render.ts draws it, moving).
const puff = (_r: number, o: Tf = {}): G[] => { smokeFrom(o.x ?? 0, o.y ?? 0, o.z ?? 0); return []; };
// A leafy clump (vine, a crown), squashed.
const leaves = (r: number, c: number, o: Tf = {}) => P(new THREE.OctahedronGeometry(r, 0), c, o);

// ---------- Greeks (cycladic) ----------
// Whitewashed rubble cubes, blue woodwork, flat roofs behind a parapet;
// the island's taverns under a vine, its potters' vaulted rooms, its
// windmills on the ridge over the harbour.
const CY_WHITE = [0xf6f4ee, 0xf2efe6, 0xf8f6f0], CY_BLUE = [0x2f6fb5, 0x3a86c4, 0x2a5f9a];
const CY_DARK = 0x2a2622, CY_WOOD = 0x6a5038, CY_CLAY = 0xb8653c, CY_VINE = 0x5c8a3a;
// A kapileio: the island's wine shop and tavern, wine from the cask and
// a plate of olives, its blue doors open onto a terrace under a vine
// trellis (klimataria) on whitewashed piers, tables and blue rush chairs
// under it, casks by the door, a little blue-domed chimney on the roof.
const kapileio: Build = (l) => {
  const white = pick(l, CY_WHITE), blue = pick(l, CY_BLUE), s = storeys(l, 0.1);
  const b = place(l, 0.62, 0.46, l.ld * 0.58), out: G[] = [];
  out.push(...yard(l, b, 0xe6e1d4, 0xf2efe6));
  out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }), ring(b.w, 0.0014, b.d, white, { x: b.x, y: b.h, z: b.z }));
  // The terrace: flagstones outlined in white, out to the street.
  const front = b.z + b.d / 2, td = Math.min(l.ld - front - 0.0015, 0.016), tz = front + td / 2;
  out.push(patch(b.w + 0.004, td, 0xc9c3b4, b.x, tz, 0.0006));
  // The doors: two leaves folded back, dark within; windows with blue shutters.
  const dh = Math.min(0.0092, s.storey * 0.74);
  out.push(onFace(b, 'front', -b.w * 0.18, 0, 0.0062, dh, CY_DARK));
  for (const k of [-1, 1]) out.push(onFace(b, 'front', -b.w * 0.18 + k * 0.0042, 0, 0.0021, dh, blue, E * 2));
  out.push(onFace(b, 'front', b.w * 0.25, s.storey * 0.32, 0.0032, s.storey * 0.36, CY_DARK));
  for (const k of [-1, 1]) out.push(onFace(b, 'front', b.w * 0.25 + k * 0.0026, s.storey * 0.32, 0.0018, s.storey * 0.36, blue, E * 2));
  if (l.floors > 1) out.push(...windows(b, 'front', { ...s, floors: 1, base: s.base + s.storey, w: 0.0026, h: s.storey * 0.36, spacing: 0.011, sill: s.storey * 0.32, color: blue }));
  for (const f of ['left', 'right', 'back'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0024, h: s.storey * 0.34, spacing: 0.013, sill: s.storey * 0.34, color: blue }));
  // Its name painted over the door.
  out.push(onFace(b, 'front', -b.w * 0.18, dh + 0.0012, 0.0085, 0.0018, blue, E * 2), onFace(b, 'front', -b.w * 0.18, dh + 0.0017, 0.0062, 0.0007, white, E * 3));
  // The trellis: whitewashed piers at the street, beams back to the wall, the vine over them.
  const ph = Math.min(0.0105, s.base + s.storey * 0.82), pw = 0.0017, px = b.w / 2 - pw / 2 + 0.0011, pz = front + td - 0.0012;
  for (const k of [-1, 1]) out.push(...box(pw, ph, pw, white, { x: b.x + k * px, z: pz }));
  out.push(...box(b.w + 0.0044, 0.0008, 0.0009, CY_WOOD, { x: b.x, y: ph, z: pz }));
  for (const k of [-0.5, -0.17, 0.17, 0.5]) out.push(...box(0.0006, 0.0006, td + 0.0004, CY_WOOD, { x: b.x + k * b.w, y: ph + 0.0008, z: tz }));
  out.push(patch(b.w + 0.002, td * 0.92, 0x4f7a32, b.x, tz, ph + 0.00157));
  const nv = Math.max(3, Math.round(b.w / 0.0075));
  for (let i = 0; i < nv; i++) for (const r of [-1, 1]) {
    const x = b.x + (i - (nv - 1) / 2 + r * 0.25) * (b.w / nv);
    out.push(leaves(0.0036, (i + r) % 2 ? CY_VINE : 0x6e9a44, { x, y: ph + 0.0017, z: tz + r * td * 0.24, sy: 0.38, ry: i * 0.7 + r }));
  }
  for (const k of [-1, 1]) out.push(cyl(0.00035, 0.0003, ph, 4, 0x5a4a30, { x: b.x + k * px, z: pz + 0.0013 })); // the vine's stems up the piers
  for (const k of [-0.3, 0.1, 0.36]) out.push(leaves(0.0006, 0x5a2a5a, { x: b.x + k * b.w, y: ph + 0.0002, z: tz + k * 0.004, sy: 1.6 })); // bunches hanging through
  // Tables and blue chairs on the terrace.
  for (const k of [-0.28, 0.24]) {
    const x = b.x + k * b.w, z = tz - 0.0006;
    out.push(...drum(0.0014, 0.0014, 0.0034, 6, 0xd8d2c4, { x, z }, 0xe8e4da));
    for (const c of [-1, 1]) out.push(...box(0.0013, 0.0021, 0.0013, blue, { x: x + c * 0.0026, z: z + 0.0003 }));
  }
  // Casks by the door, a jar of oil.
  out.push(...barrels(2, 0.0013, 0x7a5a3a, { x: b.x - b.w / 2 + 0.0026, z: front + 0.0018 }));
  // A chimney on the roof, as the islands build them: a little white stack under a blue cap.
  const cx = b.x + b.w * 0.3, cz = b.z - b.d * 0.2;
  out.push(...chimney(0.0028, 0.004, 0.0028, white, { x: cx, y: b.h, z: cz }), ...box(0.0036, 0.0006, 0.0036, blue, { x: cx, y: b.h + 0.004, z: cz }));
  out.push(shrub(-l.lw * 0.76, -l.ld * 0.7, 0.0032, 0xc2398a), shrub(l.lw * 0.74, -l.ld * 0.72, 0.0028, 0x4f7a32));
  return out;
};
// A potter's shop: the island potters sold their wares from a vaulted
// room (kamara), its round end to the street: water jugs, pithoi and
// cooking pots out on whitewashed steps either side of the door, painted
// plates hung on the wall, a big storage jar or two at the corner.
const kamara: Build = (l) => {
  const white = pick(l, CY_WHITE), blue = pick(l, CY_BLUE), s = storeys(l, 0.1);
  const b0 = place(l, 0.66, 0.6, l.ld * 0.34), wh = l.floors > 1 ? l.H * 0.78 : l.H * 0.6, r = b0.w / 2;
  const b: Body = { ...b0, h: wh }, out: G[] = [];
  out.push(...yard(l, b, 0xe6e1d4, 0xf2efe6));
  out.push(...box(b.w, wh, b.d, white, { x: b.x, z: b.z }));
  out.push(...vault(r, b.d, white, { x: b.x, y: wh, z: b.z, sy: 0.55 }));
  // The door: blue, under a round arch; plates in a row over it; a lunette window high in the vault's end.
  const dh = Math.min(0.0085, s.storey * 0.66);
  out.push(...arch(b, 'front', 0, 0, 0.0056, dh - 0.0028, blue));
  out.push(...arch(b, 'front', 0, 0.0004, 0.0042, dh - 0.0034, CY_DARK, false, E * 2));
  const pc = [0x2f6fb5, 0xd8a43a, 0xb8653c, 0x3a86c4, 0xd8a43a];
  const np = Math.max(3, Math.min(5, Math.floor(b.w / 0.006)));
  for (let i = 0; i < np; i++) out.push(disc(b, 'front', (i - (np - 1) / 2) * 0.0046, dh + 0.0024, 0.0013, pc[i % pc.length]!));
  out.push(onFace({ ...b, d: b.d }, 'front', 0, wh + r * 0.12, 0.0028, Math.min(0.0026, r * 0.28), blue)); // a little window up in the vault's end
  if (l.floors > 1) for (const k of [-1, 1]) out.push(onFace(b, 'front', k * b.w * 0.3, s.base + s.storey * 1.2, 0.0026, s.storey * 0.34, blue));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: 1, w: 0.0024, h: s.storey * 0.32, spacing: 0.014, sill: s.storey * 0.36, color: blue }));
  // Whitewashed steps either side of the door, ware on them: jugs, pots, a row of little cups.
  const front = b.z + b.d / 2, sw = b.w * 0.34;
  for (const k of [-1, 1]) {
    const x = b.x + k * (b.w / 2 - sw / 2);
    out.push(...box(sw, 0.0016, 0.0042, white, { x, z: front + 0.0021 }, 0xe8e4da), ...box(sw, 0.0032, 0.0021, white, { x, z: front + 0.00105 }, 0xe8e4da));
    const np2 = Math.max(2, Math.min(4, Math.floor(sw / 0.0032)));
    out.push(...pots(np2, 0.0011, sw / np2, k > 0 ? [CY_CLAY, 0xc98a5a] : [0xc98a5a, 0xd8b48a], { x, y: 0.0016, z: front + 0.0031 }));
    for (let i = 0; i < np2; i++) out.push(cup(0.0008, [0xd8b48a, CY_CLAY, 0x2f6fb5][(i + (k > 0 ? 0 : 1)) % 3]!, { x: x + (i - (np2 - 1) / 2) * (sw / np2) + 0.0004, y: 0.0032, z: front + 0.0011 }));
  }
  // Pithoi, the great storage jars, at the corner, and a stack of roof tiles' worth of pots by the side.
  for (const [dx, dz] of [[0, 0], [0.0042, 0.0012]]) {
    const x = Math.min(b.x + b.w / 2 + 0.0034, l.lw * 0.9 - 0.0063) + dx, z = front - 0.004 + dz;
    out.push(P(new THREE.SphereGeometry(0.0021, 7, 4), CY_CLAY, { x, y: 0.0024, z, sy: 1.25 }), cyl(0.0011, 0.0013, 0.0011, 6, CY_CLAY, { x, y: 0.0047, z }));
  }
  out.push(shrub(-l.lw * 0.74, l.ld * 0.74, 0.003, 0xc2398a), shrub(-l.lw * 0.62, -l.ld * 0.72, 0.0026, 0x4f7a32));
  return out;
};
// A windmill (anemomylos): the islands ground their grain in round
// whitewashed towers in a row on the windward ridge, under a conical cap
// of boards turned into the wind, the wheel of spars with triangular
// canvas sails bent to them, a pole forward from the hub to stay them;
// the miller's house and store a low cube beside it, sacks at its door.
const anemomylos: Build = (l) => {
  const white = pick(l, CY_WHITE), blue = pick(l, CY_BLUE), out: G[] = [];
  const rt = Math.min(0.0078, l.lw * 0.36), th = l.H * (l.floors > 1 ? 1.05 : 1.3) + 0.004, R = Math.min(0.0165, l.lw * 0.8);
  const tx = Math.max(-l.lw + R + 0.0008, -l.lw * 0.22), tz = Math.min(0, l.ld - rt - 0.012) - l.ld * 0.08;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xd8d0bc));
  out.push(patch(rt * 2 + 0.006, rt * 2 + 0.006, 0xc8c0aa, tx, tz, 0.0005, Math.PI / 4)); // the threshing floor round its foot
  // The tower: stone, whitewashed, a little tapered; its door and window blue.
  const t: Body = { x: tx, z: tz, w: rt * 2, d: rt * 2, y: 0, h: th };
  out.push(cyl(rt, rt * 0.92, th, 10, white, { x: tx, z: tz }));
  out.push(onFace({ ...t, d: rt * 2 * 0.985 }, 'front', 0, 0, 0.0042, Math.min(0.0085, th * 0.3), blue));
  out.push(onFace({ ...t, d: rt * 2 * 0.95 }, 'front', rt * 0.15, th * 0.58, 0.0022, 0.0028, blue));
  out.push(onFace({ ...t, w: rt * 2 * 0.96 }, 'left', 0, th * 0.4, 0.0022, 0.0028, blue));
  // The cap: a cone of tarred boards, a little eave.
  const cap = 0x6a4e36;
  out.push(cyl(rt * 1.06, rt * 1.06, 0.0009, 10, cap, { x: tx, y: th, z: tz }), cone(rt * 1.04, rt * 1.15, 10, cap, { x: tx, y: th + 0.0009, z: tz }));
  // The sails: eight spars round the hub, a triangle of canvas on each, the stay pole forward.
  const hy = th - rt * 0.05, hz = tz + rt + 0.0016, n = 8, sail = 0xf1ece0, spar = 0x5a4430;
  out.push(cyl(0.0007, 0.0007, 0.0034, 6, spar, { x: tx, y: hy, z: hz - 0.0026, rx: Math.PI / 2 }));
  out.push(cyl(0.0002, 0.0002, 0.0072, 4, spar, { x: tx, y: hy, z: hz, rx: Math.PI / 2 }));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2, ca = Math.cos(a), sa = Math.sin(a), b2 = a + 0.42;
    out.push(seg(V3(tx, hy, hz + 0.0003), V3(tx + ca * R, hy + sa * R, hz + 0.0003), 0.00022, 0.00016, 3, spar));
    out.push(tri([tx + ca * R * 0.3, hy + sa * R * 0.3, hz + 0.0006], [tx + ca * R * 0.98, hy + sa * R * 0.98, hz + 0.0006], [tx + Math.cos(b2) * R * 0.72, hy + Math.sin(b2) * R * 0.72, hz + 0.0012], sail));
  }
  // The miller's house: a low white cube, its roof a terrace, its door blue; sacks of grain and flour at it.
  const mw = Math.min(l.lw * 0.62, 0.016), mx = l.lw * 0.98 - mw / 2 - 0.0012, mz = l.ld * 0.36;
  const m: Body = { x: mx, z: mz, w: mw, d: Math.min(l.ld * 0.6, 0.016), y: 0, h: wallHeight(1) * 0.62 };
  out.push(...box(m.w, m.h, m.d, white, { x: m.x, z: m.z }), ring(m.w, 0.0012, m.d, white, { x: m.x, y: m.h, z: m.z }));
  out.push(onFace(m, 'front', -m.w * 0.18, 0, 0.0038, Math.min(0.0078, m.h * 0.7), blue), onFace(m, 'front', m.w * 0.24, m.h * 0.42, 0.0022, 0.0026, blue));
  out.push(...sacks(5, 0.0012, 0xe2d8c0, { x: mx + m.w * 0.16, z: mz + m.d / 2 + 0.0024 }));
  out.push(shrub(-l.lw * 0.8, l.ld * 0.78, 0.0026, 0x8a9a5a), shrub(l.lw * 0.8, -l.ld * 0.78, 0.0024, 0x8a9a5a));
  return out;
};

// ---------- Spanish (andalusian) ----------
// Whitewash on an ochre or almagra socle, Roman tile roofs, iron rejas
// and flowerpots; the old towns' wine taverns, the silk lanes of the
// alcaicería, the potters' and tile-makers' yards of Triana.
const AN_WHITE = [0xf6f3ec, 0xf0ebe0, 0xf8f5ee], AN_ROOF = [0xb85a35, 0xa8502e, 0xc06a42];
const AN_DOOR = 0x6b4a2e, AN_IRON = 0x161412, AN_DARK = 0x2e2824, AN_ALMAGRA = 0x9a3a28, AN_OAK = 0x4a3020;
// A taberna: a wine tavern, its socle painted almagra red, its great
// door open under a little tiled hood (tejaroz), the "ramo" (a bush of
// green hung over the door that told the street new wine was in), black
// oak butts of wine stacked in a pyramid by the door, a bench and a table
// with a jug at the window grille.
const taberna: Build = (l) => {
  const white = pick(l, AN_WHITE), roof = pick(l, AN_ROOF), s = storeys(l, 0.15);
  const b = place(l, 0.84, 0.5, l.ld * 0.26), out: G[] = [];
  out.push(...yard(l, b, 0xd8c8a8, 0xc8b490, 0.007));
  out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }), ...box(b.w + 0.0008, 0.0034, b.d + 0.0008, AN_ALMAGRA, { x: b.x, z: b.z }));
  out.push(...gable(b.w + 0.003, b.d + 0.004, Math.min(b.w, b.d) * 0.3, roof, { x: b.x, y: b.h, z: b.z }, false, white));
  // The door, wide and arched, its leaves folded back; the ramo hung over it; the tejaroz.
  const dx = -b.w * 0.02, dh = Math.min(0.0098, s.storey * 0.76), front = b.z + b.d / 2;
  out.push(...arch(b, 'front', dx, 0, 0.0068, dh - 0.0034, AN_DOOR, false, E * 3));
  out.push(...arch(b, 'front', dx, 0.0003, 0.0054, dh - 0.0038, AN_DARK, false, E * 4));
  out.push(...gable(0.011, 0.0034, 0.0014, roof, { x: b.x + dx, y: dh + 0.0012, z: front + 0.0017 }));
  for (const k of [-1, 1]) out.push(...box(0.0005, 0.0012, 0.0028, AN_OAK, { x: b.x + dx + k * 0.0044, y: dh, z: front + 0.0014 }));
  out.push(leaves(0.0016, 0x4f7a32, { x: b.x + dx + 0.0052, y: dh - 0.0016, z: front + 0.0012, sy: 1.3 }), cyl(0.00015, 0.00015, 0.0018, 3, AN_IRON, { x: b.x + dx + 0.0052, y: dh - 0.0004, z: front + 0.0012 }));
  // A sign in ochre over it all, its lettering dark.
  out.push(onFace(b, 'front', b.w * 0.3, s.storey * 0.72, 0.012, 0.0022, 0xd8a73a, E * 2));
  for (let i = 0; i < 6; i++) out.push(onFace(b, 'front', b.w * 0.3 - 0.0045 + i * 0.0018, s.storey * 0.72 + 0.0006, 0.001, 0.001, AN_DARK, E * 3));
  // The window under its grille, a bench and a table outside it, a jug on the table.
  const wx = b.w * 0.3;
  out.push(onFace(b, 'front', wx, s.storey * 0.3, 0.0062, s.storey * 0.34, AN_DARK, E * 2));
  for (let i = 0; i < 5; i++) out.push(onFace(b, 'front', wx - 0.0026 + i * 0.0013, s.storey * 0.3, 0.0003, s.storey * 0.34, AN_IRON, E * 3));
  out.push(...box(0.0098, 0.0016, 0.0016, AN_OAK, { x: b.x + wx, z: front + 0.0012 }));
  out.push(...drum(0.0013, 0.0013, 0.0028, 6, AN_OAK, { x: b.x + wx - 0.0072, z: front + 0.0032 }, 0x7a5a3a), ...pot(0.0005, 0xc98a5a, { x: b.x + wx - 0.0072, y: 0.0028, z: front + 0.0032 }));
  if (l.floors > 1) {
    // The tavern-keeper's balcony over the door: an iron rail on a stone slab, geraniums along it.
    const by = s.base + s.storey, bx = b.x + dx;
    out.push(onFace(b, 'front', dx, by + 0.0008, 0.0058, s.storey * 0.56, AN_DARK), onFace(b, 'front', dx, by + 0.0008, 0.0012, s.storey * 0.56, 0x6b4a2e, E * 2));
    out.push(...box(0.013, 0.0005, 0.0034, 0xd8d0c0, { x: bx, y: by, z: front + 0.0017 }), ...box(0.0124, 0.0026, 0.0003, AN_IRON, { x: bx, y: by + 0.0005, z: front + 0.0031 }));
    for (const k of [-1, 0, 1]) out.push(...box(0.001, 0.001, 0.001, 0xb4532c, { x: bx + k * 0.0042, y: by + 0.0031, z: front + 0.0031 }), leaves(0.0009, k ? 0xd43b3b : 0x4f8a3a, { x: bx + k * 0.0042, y: by + 0.0047, z: front + 0.0031 }));
    for (const k of [-1, 1]) out.push(onFace(b, 'front', dx + k * b.w * 0.33, by + s.storey * 0.3, 0.003, s.storey * 0.45, 0x3a3430), onFace(b, 'front', dx + k * b.w * 0.33, by + s.storey * 0.3 - 0.0004, 0.004, s.storey * 0.45 + 0.0008, AN_IRON, E * 0.6));
  }
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0028, h: s.storey * 0.4, spacing: 0.012, sill: s.storey * 0.32, color: 0x3a3430, frame: AN_IRON }));
  // The butts: black oak casks of wine on their sides, three, two, one, their heads chalked.
  const cx = b.x - b.w / 2 + 0.0046, r = 0.0016, cz = front + 0.0008;
  for (const [row, n] of [[0, 3], [1, 2], [2, 1]] as const) for (let i = 0; i < n; i++)
    out.push(...cask(r, 0.0062, 0x3a2a20, 0x5a4232, { x: cx + (i - (n - 1) / 2) * r * 2.05, y: row * r * 1.72, z: cz }));
  out.push(...box(0.003, 0.0006, 0.0068, AN_OAK, { x: cx + r * 3.2, z: cz + 0.0031 })); // a chock board
  return out;
};
// A silk merchant's shop in the alcaicería: a Mudéjar front of horseshoe
// arches in red brick and white stone voussoirs, open on bolts of
// Granada silk on the counters; a striped canvas toldo stretched out over
// the lane on poles; a tiled parapet over a flat roof.
const alcaiceria: Build = (l) => {
  const white = pick(l, AN_WHITE), roof = pick(l, AN_ROOF), s = storeys(l, 0.15);
  const b = place(l, 0.86, 0.56, l.ld * 0.3), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xd8c8a8, 0xc8b490, 0.007));
  out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }), ...box(b.w + 0.0008, 0.0024, b.d + 0.0008, 0x3a6aa0, { x: b.x, z: b.z }));
  // The parapet and its tiled coping, the eaves of a low roof behind it.
  out.push(ring(b.w, 0.0022, b.d, white, { x: b.x, y: b.h, z: b.z }), ...box(b.w + 0.001, 0.0007, 0.0022, roof, { x: b.x, y: b.h + 0.0022, z: front - 0.0009 }));
  out.push(hip(b.w - 0.0006, b.d - 0.0006, Math.min(b.w, b.d) * 0.14, roof, { x: b.x, y: b.h + 0.0004, z: b.z }));
  // The arches: as many bays as fit, each a horseshoe in red brick, white voussoirs round it, open and dark.
  const n = Math.max(2, Math.min(4, Math.floor(b.w / 0.0105))), bw = b.w / n, r = Math.min(bw * 0.36, 0.0042), jh = Math.min(s.storey * 0.42, 0.0062);
  const silk = [0xb02a3a, 0x2a5a9a, 0xd8a83a, 0x2a7a5a, 0x7a2a7a, 0xe8dcc0];
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5), yc = 0.0008 + jh + r * Math.sin(0.42);
    out.push(...horseshoe(b, 'front', a, 0.0008, r * 1.32, jh - 0.0004, AN_ALMAGRA, E * 2));
    for (let k = 0; k < 7; k++) {
      const t = -0.3 + (k / 6) * (Math.PI + 0.6);
      out.push(onFaceShape(b, 'front', new THREE.PlaneGeometry(r * 0.22, r * 0.36).translate(0, r * 1.14, 0).rotateZ(t - Math.PI / 2).translate(a, yc, 0), 0xf2e8d0, E * 3));
    }
    out.push(...horseshoe(b, 'front', a, 0.0008, r, jh, AN_DARK, E * 4));
    // The counter in it, bolts of silk laid across, a length hung down the jamb.
    const x = b.x + a;
    out.push(...box(bw * 0.7, 0.0026, 0.0024, AN_OAK, { x, z: front + 0.0012 }));
    for (let k = 0; k < 3; k++) out.push(cyl(0.00055, 0.00055, 0.0022, 5, silk[(i * 2 + k) % silk.length]!, { x: x - bw * 0.22 + k * bw * 0.22, y: 0.0031, z: front + 0.0001, rx: Math.PI / 2 }));
    out.push(onFace(b, 'front', a + r * 1.05, 0.0012, r * 0.42, jh * 0.95, silk[(i + 3) % silk.length]!, E * 5));
  }
  if (l.floors > 1) out.push(...windows(b, 'front', { ...s, floors: 1, base: s.base + s.storey, w: 0.003, h: s.storey * 0.45, spacing: 0.011, sill: s.storey * 0.3, color: 0x3a3430, frame: AN_IRON }));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0028, h: s.storey * 0.4, spacing: 0.012, sill: s.storey * 0.32, color: 0x3a3430, frame: AN_IRON }));
  // The toldo: canvas in cream and ochre stripes out over the lane, on poles at the street.
  const ty = s.base + s.storey * 0.9, td = Math.min(0.012, l.ld - front - 0.001);
  out.push(...awning(b.w * 0.96, td, [0xf0e6cc, 0xc8963a], { x: b.x, y: ty, z: front + 0.0006, tilt: 0.22, stripes: 9 }));
  for (const k of [-1, 1]) out.push(cyl(0.00022, 0.00022, ty - Math.sin(0.22) * td, 4, AN_OAK, { x: b.x + k * b.w * 0.46, z: front + 0.0006 + Math.cos(0.22) * td - 0.0002 }));
  // Flowerpots on the wall's corner, a pot of basil by the door.
  out.push(...pot(0.0011, 0xb4532c, { x: b.x + b.w / 2 + 0.0018, z: front - 0.002 }), leaves(0.0013, 0x4f8a3a, { x: b.x + b.w / 2 + 0.0018, y: 0.0034, z: front - 0.002 }));
  return out;
};
// An alfar: a potters' and tile-makers' yard (Triana, across the river
// from Seville): the workshop under its tiles; the Moorish kiln, a square
// brick tower with its firing mouth below and the vaulted chamber above;
// fresh tiles laid out in the sun to dry in rows, glazed ones in blue,
// white and ochre; cántaros (water jugs) and a great tinaja stacked for sale.
const alfar: Build = (l) => {
  const white = pick(l, AN_WHITE), roof = pick(l, AN_ROOF), out: G[] = [];
  const b0 = place(l, 0.5, 0.42, l.ld * 1.06), b = { ...b0, x: -l.lw * 0.97 + b0.w / 2, h: wallHeight(1) * (l.floors > 1 ? 1.2 : 0.9) };
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8b08a), patch(2 * l.lw * 0.9, l.ld * 0.9, 0xb89a72, 0, l.ld * 0.5, 0.0005));
  out.push(...box(b.w, b.h, b.d, white, { x: b.x, z: b.z }), ...box(b.w + 0.0008, 0.0026, b.d + 0.0008, 0xd8a73a, { x: b.x, z: b.z }));
  out.push(...gable(b.w + 0.003, b.d + 0.004, Math.min(b.w, b.d) * 0.32, roof, { x: b.x, y: b.h, z: b.z }, false, white));
  out.push(...doubleDoor(b, 'front', -b.w * 0.18, 0.0068, Math.min(0.009, b.h * 0.6), AN_DOOR, AN_OAK));
  for (const k of [0.14, 0.34]) out.push(onFace(b, 'front', b.w * k, b.h * 0.45, 0.0028, 0.0034, AN_DARK), onFace(b, 'front', b.w * k, b.h * 0.45, 0.0034, 0.0006, AN_IRON, E * 2));
  // A panel of azulejos over the door, the workshop's own: a blue border, a white field, an ochre flower.
  const py = Math.min(0.009, b.h * 0.6) + 0.0014, pa = -b.w * 0.18;
  out.push(onFace(b, 'front', pa, py, 0.0058, 0.0042, 0x2a5aa0, E * 2), onFace(b, 'front', pa, py + 0.0007, 0.0044, 0.0028, 0xf2ecdc, E * 3), disc(b, 'front', pa, py + 0.0021, 0.001, 0xd8a43a, E * 4));
  // The kiln: a brick tower beside the workshop, the arched firing mouth, its chamber vaulted, the smoke vents.
  const brick = 0xb0704a, kw = Math.min(0.013, l.lw * 0.52), kh = wallHeight(1) * 1.05, kx = l.lw * 0.98 - kw / 2 - 0.0016, kz = b.z + b.d / 2 - kw * 0.2;
  const k: Body = { x: kx, z: kz, w: kw, d: kw, y: 0, h: kh };
  out.push(...frustum(kw + 0.0016, kw + 0.0016, kw, kw, kh, brick, { x: kx, z: kz }, 0x9a5e3e));
  out.push(...vault(kw / 2, kw, brick, { x: kx, y: kh, z: kz, sy: 0.6 }, true));
  out.push(...arch({ ...k, d: kw + 0.0008 }, 'front', 0, 0, kw * 0.36, kh * 0.18, 0x1e1a16));
  out.push(onFace({ ...k, d: kw + 0.0008 }, 'front', 0, kh * 0.18 + kw * 0.18 + 0.001, kw * 0.7, 0.0006, 0x8a5034, E));
  for (const t of [-0.25, 0.25]) out.push(...box(0.0016, 0.0018, 0.0016, brick, { x: kx + t * kw, y: kh + kw * 0.28, z: kz }, 0x2a2420));
  for (const [i, r] of [[0, 0.0017]] as const) out.push(...puff(r, { x: kx - kw * 0.25 + i * 0.0016, y: kh + kw * 0.45 + 0.0016 + i * 0.0034, z: kz - i * 0.001 }));
  out.push(...logs(6, 0.0062, 0.0007, 0x7a5a3a, { x: kx - kw * 0.1, z: kz + kw / 2 + 0.0036 })); // firewood (olive prunings) for the mouth
  // Tiles drying in rows in the yard, glazed ones and raw.
  const rows = Math.max(2, Math.min(4, Math.floor((l.ld - b.z - b.d / 2) / 0.0062))), cols = Math.max(3, Math.min(6, Math.floor(l.lw / 0.0056)));
  const tile = [0xc8845a, 0xd08e62, 0x2a5aa0, 0xf2ecdc, 0xd8a43a];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    out.push(patch(0.0028, 0.0028, tile[(r * 3 + c * 2) % tile.length]!, -l.lw * 0.86 + 0.002 + c * 0.0042, b.z + b.d / 2 + 0.005 + r * 0.0046, 0.0009 + ((r + c) % 2) * 0.00007));
  // Cántaros for sale in a row at the street, a tinaja at the corner.
  const nc = Math.max(3, Math.min(6, Math.floor(l.lw / 0.004)));
  out.push(...pots(nc, 0.0012, 0.003, [0xd09060, 0xc07a4a, 0xe0b080], { x: l.lw * 0.9 - (nc - 1) * 0.0015 - 0.0012, z: l.ld * 0.88 }));
  out.push(P(new THREE.SphereGeometry(0.0032, 7, 4), 0xc07a4a, { x: b.x + b.w / 2 + 0.0034, y: 0.0036, z: b.z - b.d * 0.2, sy: 1.25 }), cyl(0.0016, 0.0019, 0.0012, 7, 0xc07a4a, { x: b.x + b.w / 2 + 0.0034, y: 0.0071, z: b.z - b.d * 0.2 }));
  if (l.floors > 1) out.push(onFace(b, 'front', -b.w * 0.18, b.h * 0.76, 0.004, 0.003, AN_DOOR)); // the loft's hatch
  return out;
};

// ---------- Babylonians (mesopotamian) ----------
// Sun-dried mudbrick, stepped crenellations, a band of blue glazed brick;
// reed mats and palm trunks for shade. The ale-wife's beer house, the
// wool merchants whose cloth Babylon sold up and down the rivers, the
// brick-makers who built the city out of its own mud.
const ME_MUD = [0xc8a06a, 0xd2ad78, 0xbf9862], ME_GLAZE = [0x2c5aa0, 0x2a6ab0, 0x24508c];
const ME_GOLD = 0xe0b84a, ME_DARK = 0x2e2620, ME_REED = 0xc8b078, ME_PALM = 0x7a6448, ME_CLAY = 0xb8865a;
// A reed-mat sunshade on palm-trunk posts: a flat mat w × d at height h, its front edge at o.z + d/2.
function reedShade(w: number, d: number, h: number, o: { x: number; z: number }): G[] {
  const out: G[] = [patch(w, d, ME_REED, o.x, o.z, h + 0.00011)];
  const n = Math.max(3, Math.min(9, Math.floor(w / 0.0034)));
  for (let i = 0; i <= n; i++) out.push(...box(0.0005, 0.00035, d + 0.0006, 0xa89058, { x: o.x - w / 2 + (i * w) / n, y: h, z: o.z })); // the bundles' ribs
  for (const k of [-1, 1]) out.push(...box(w + 0.001, 0.0007, 0.0008, ME_PALM, { x: o.x, y: h - 0.0007, z: o.z + k * (d / 2 - 0.0004) }));
  for (const k of [-1, 1]) out.push(cyl(0.0005, 0.00045, h - 0.0007, 5, ME_PALM, { x: o.x + k * (w / 2 - 0.0005), z: o.z + d / 2 - 0.0004 }));
  return out;
}
// A bīt sābîti: the ale-wife's beer house, where Babylon drank its barley
// beer through long reed straws from great jars. A mudbrick house, its
// front shaded by a reed mat on palm trunks; jars of beer sunk in a brick
// bench under it, straws in them; the mash pots by the door; the gate
// framed in glazed brick as the houses' are.
const sabitu: Build = (l) => {
  const mud = pick(l, ME_MUD), glaze = pick(l, ME_GLAZE), s = storeys(l, 0.1);
  const b = place(l, 0.74, 0.5, l.ld * 0.5), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xcdb48a, 0xb8a07a, 0.007));
  out.push(...box(b.w, b.h, b.d, mud, { x: b.x, z: b.z }));
  const by = b.h * 0.62, bh = Math.min(0.0026, b.h * 0.12);
  out.push(ring(b.w + 0.0008, bh, b.d + 0.0008, glaze, { x: b.x, y: by, z: b.z }));
  out.push(...merlons(b, b.h, 0.0016, 0.0062, mud, SEEN));
  // The door, framed in glaze; a wide window hatch beside it where the beer is handed out.
  const dh = Math.min(0.0092, s.storey * 0.68);
  out.push(onFace(b, 'front', -b.w * 0.22, 0, 0.0068, dh + 0.0012, glaze), onFace(b, 'front', -b.w * 0.22, 0, 0.005, dh, ME_DARK, E * 2));
  out.push(onFace(b, 'front', b.w * 0.2, s.storey * 0.3, b.w * 0.34, s.storey * 0.3, ME_DARK));
  out.push(...box(b.w * 0.36, 0.0006, 0.002, 0xb09060, { x: b.x + b.w * 0.2, y: s.storey * 0.3 - 0.0006, z: front + 0.001 })); // its sill
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.2, spacing: 0.012, sill: s.storey * 0.62, color: ME_DARK }));
  // The shade over the front.
  const td = Math.min(0.0125, l.ld - front - 0.0012), ty = Math.min(0.0105, s.base + s.storey * 0.78);
  out.push(...reedShade(b.w + 0.002, td, ty, { x: b.x, z: front + td / 2 }));
  // The brick bench, three jars of beer set in it, two drinkers' straws in each.
  const jz = front + td * 0.55, jw = b.w * 0.62;
  out.push(...box(jw, 0.0016, 0.0034, 0xb89466, { x: b.x + b.w * 0.08, z: jz }));
  for (const k of [-1, 0, 1]) {
    const x = b.x + b.w * 0.08 + k * jw * 0.34;
    out.push(...pot(0.0016, ME_CLAY, { x, y: 0.0012, z: jz }));
    for (const t of [-1, 1]) out.push(seg(V3(x, 0.0042, jz), V3(x + t * 0.003, 0.0068, jz + 0.0012), 0.00012, 0.00012, 3, 0xd8c890));
  }
  // The mash pots and a stack of barley sacks by the door.
  out.push(...pots(2, 0.0013, 0.003, [0x9a6a44, ME_CLAY], { x: b.x - b.w * 0.42, z: front + 0.0024 }));
  out.push(...sacks(3, 0.0012, 0xd8c8a0, { x: b.x - b.w / 2 - 0.0036 + Math.max(0, 0.0045 - (l.lw - b.w / 2)), z: b.z }));
  out.push(...palm(l.lw * 0.7, -l.ld * 0.72, 0.9));
  return out;
};
// A wool merchant's house: Babylon's dyed woollens went out by boat and
// caravan. Lengths of cloth in madder red, woad blue and saffron hang down
// the front from poles out over the parapet to show the stock; bales of
// fleece at the door; a counting room up a stair on the roof.
const tamkaru: Build = (l) => {
  const mud = pick(l, ME_MUD), glaze = pick(l, ME_GLAZE), s = storeys(l, 0.1);
  const b = place(l, 0.8, 0.56, l.ld * 0.24), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xcdb48a, 0xb8a07a, 0.007));
  out.push(...box(b.w, b.h, b.d, mud, { x: b.x, z: b.z }));
  out.push(...merlons(b, b.h, 0.0016, 0.0062, mud, SEEN));
  // Pilasters and recesses: the temple-like niched front a rich house showed the street.
  for (const k of [-0.5, -0.17, 0.17, 0.5]) out.push(onFace(b, 'front', k * b.w * 0.92, 0, 0.0022, b.h, shade(mud, 1.06), E * 0.4));
  const dh = Math.min(0.0092, s.storey * 0.68);
  out.push(onFace(b, 'front', 0, 0, 0.0074, dh + 0.0014, glaze, E * 1.6), onFace(b, 'front', 0, 0, 0.0052, dh, ME_DARK, E * 2.6));
  out.push(disc(b, 'front', 0, dh + 0.0024, 0.0008, ME_GOLD, E * 1.6));
  // The cloths: hung from poles out over the parapet, down the front either side of the door.
  const cloth = [0xa8302a, 0x2a4a8a, 0xd8a03a, 0x6a2a5a, 0xe8dcc0, 0x2a6a4a], n = Math.max(2, Math.min(5, Math.floor(b.w * 0.36 / 0.0042)));
  const ch = b.h * 0.62;
  for (const k of [-1, 1]) for (let i = 0; i < n; i++) {
    const a = k * (0.006 + i * 0.0044), c = cloth[(i * 2 + (k > 0 ? 1 : 0)) % cloth.length]!;
    out.push(...box(0.0003, 0.0003, 0.0048, ME_PALM, { x: b.x + a, y: b.h - 0.0012, z: front + 0.0016 }));
    out.push(P(new THREE.PlaneGeometry(0.0034, ch), c, { x: b.x + a, y: b.h - 0.0013 - ch / 2, z: front + 0.0028 + i * 0.00031, rx: -0.06 }));
  }
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.2, spacing: 0.012, sill: s.storey * 0.62, color: ME_DARK }));
  // The roof room and its stair up the side.
  const rw = b.w * 0.36, rd = b.d * 0.4;
  out.push(...box(rw, 0.0062, rd, mud, { x: b.x - b.w * 0.26, y: b.h, z: b.z - b.d * 0.24 }), ring(rw + 0.0008, 0.0012, rd + 0.0008, glaze, { x: b.x - b.w * 0.26, y: b.h + 0.0042, z: b.z - b.d * 0.24 }));
  // Bales of fleece, corded, at the door; a donkey's load of them on a cart beyond.
  out.push(...sacks(5, 0.0015, 0xeee6d2, { x: b.x + b.w * 0.36, z: front + 0.0034 }));
  out.push(...sacks(3, 0.0013, 0xd8cdb0, { x: b.x - b.w * 0.38, z: front + 0.0026 }));
  out.push(...palm(-l.lw * 0.74, -l.ld * 0.74, 0.85));
  return out;
};
// A brickyard: Babylon was built of its own mud. Clay and chopped straw
// trodden in a pit, the bricks moulded and laid out in rows to dry in the
// sun; the best fired in a round kiln (an updraft kiln, its dome over the
// fire), and some glazed blue for the gates and the palaces; a reed shed
// over the moulding bench, a hut for the tools.
const brickyard: Build = (l) => {
  const mud = pick(l, ME_MUD), glaze = pick(l, ME_GLAZE), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8ac7c));
  // The kiln at the back: a squat drum of brick, its dome, the stoke hole to the street, smoke.
  const kr = Math.min(0.0085, l.lw * 0.36), kx = -l.lw + kr + 0.003, kz = -l.ld + kr + 0.003, kh = wallHeight(1) * 0.7;
  out.push(cyl(kr * 1.05, kr, kh, 10, 0xa8784a, { x: kx, z: kz }), dome(kr, 0x9a6a40, { x: kx, y: kh, z: kz, sy: 0.75 }));
  out.push(...arch({ x: kx, z: kz, w: kr * 2, d: kr * 2.02, y: 0, h: kh }, 'front', 0, 0, kr * 0.55, kh * 0.32, 0x1e1a16));
  out.push(cyl(kr * 0.22, kr * 0.2, kr * 0.5, 6, 0x8a5a38, { x: kx, y: kh + kr * 0.62, z: kz }));
  for (const [i, r] of [[0, 0.002]] as const) out.push(...puff(r, { x: kx + i * 0.0018, y: kh + kr * 1.25 + i * 0.0036, z: kz + i * 0.0008 }));
  out.push(...logs(5, 0.0058, 0.0007, 0x7a6448, { x: kx + kr + 0.0042, z: kz + kr * 0.6, ry: Math.PI / 2 })); // brushwood and palm fronds for the fire
  // The tool hut on the right, mudbrick, merlons.
  const hw = Math.min(0.014, l.lw * 0.6), h: Body = { x: l.lw * 0.97 - hw / 2, z: -l.ld * 0.5, w: hw, d: Math.min(0.013, l.ld * 0.7), y: 0, h: wallHeight(1) * 0.7 };
  out.push(...box(h.w, h.h, h.d, mud, { x: h.x, z: h.z }), ...merlons(h, h.h, 0.0014, 0.005, mud));
  out.push(onFace(h, 'front', 0, 0, 0.0054, Math.min(0.0085, h.h * 0.62), glaze), onFace(h, 'front', 0, 0, 0.0038, Math.min(0.0078, h.h * 0.58), ME_DARK, E * 2));
  // The reed shed over the moulding bench, the clay pit beside it.
  const sz = l.ld * 0.05, sx = h.x - 0.0004;
  out.push(...reedShade(Math.min(0.016, l.lw * 0.7), 0.0105, 0.0085, { x: sx, z: h.z + h.d / 2 + 0.0058 }));
  out.push(...box(0.008, 0.0028, 0.003, 0x8a6a48, { x: sx, z: h.z + h.d / 2 + 0.0054 }));
  out.push(patch(0.012, 0.009, 0x7a6448, -l.lw * 0.15, sz - 0.002, 0.0006), patch(0.009, 0.006, 0x8a7050, -l.lw * 0.15, sz - 0.002, 0.0009));
  // The bricks drying in rows over the yard toward the street.
  const rows = Math.max(2, Math.min(4, Math.floor((l.ld * 0.8) / 0.0045))), cols = Math.max(4, Math.min(8, Math.floor((l.lw * 1.2) / 0.0034)));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if ((r + c) % 5 === 4) continue;
    out.push(...box(0.0022, 0.0007, 0.0016, r === 0 ? shade(mud, 0.9) : mud, { x: -l.lw * 0.85 + 0.0012 + c * 0.0034 * Math.max(1, (l.lw * 1.6) / (cols * 0.0034)), z: l.ld * 0.88 - r * 0.0042 }));
  }
  // Fired bricks stacked, and glazed blue ones, by the kiln.
  out.push(...box(0.0052, 0.0034, 0.0036, 0xa8603a, { x: kx + kr + 0.0035, z: kz - kr * 0.5 }), ...box(0.0044, 0.0026, 0.0032, glaze, { x: kx + kr + 0.0094, z: kz - kr * 0.4 }));
  out.push(...palm(l.lw * 0.2, -l.ld * 0.82, 0.8));
  return out;
};

// ---------- Persians (windcatcher) ----------
// Adobe and mud plaster under low domes, the badgir (windcatcher) over
// the roofs, pointed arches; turquoise tile where a trade could pay for
// it. The bazaar's vaulted shops, its carpets and its spices; the dyers
// who coloured the wool the carpets were knotted from.
const PE_ADOBE = [0xd8bb8c, 0xcfb084, 0xdcc39a], PE_TOWER = [0xccab7a, 0xc4a272, 0xd0b286];
const PE_DARK = 0x2e2620, PE_TILE = 0x2a9aa0, PE_LAPIS = 0x2a4a9a, PE_WOOD = 0x5a4232;
// A carpet, w × h, hung on a rail or laid flat: a field, its border and a medallion (on a face-like plane at o, turned by o).
function carpet(w: number, h: number, field: number, border: number, o: Tf): G[] {
  return [
    P(new THREE.PlaneGeometry(w, h), border, o),
    P(new THREE.PlaneGeometry(w * 0.78, h * 0.84).translate(0, 0, 0.00009), field, o),
    P(new THREE.CircleGeometry(Math.min(w, h) * 0.22, 4).translate(0, 0, 0.00018), border, o),
  ];
}
// A badgir: a windcatcher's square tower on a roof, slotted at its top on all four sides.
function badgir(x: number, z: number, y: number, tw: number, th: number, c: number, cap: number): G[] {
  const t: Body = { x, z, w: tw, d: tw, y, h: th }, out: G[] = [...box(tw, th, tw, c, { x, y, z }), ...box(tw + 0.0012, 0.0012, tw + 0.0012, cap, { x, y: y + th, z })];
  for (const f of ['front', 'back', 'left', 'right'] as Face[]) for (const k of [-1, 0, 1]) out.push(onFace(t, f, k * tw * 0.3, y + th - 0.0062, tw * 0.17, 0.0052, PE_DARK));
  return out;
}
// A carpet dealer's shops in the bazaar: a row of vaulted bays (hojreh),
// each under its own low dome, its pointed arch open to the lane and
// framed in turquoise tile; carpets thrown over a rail along the front
// and over the parapet, more folded in a pile on the platform, one spread
// out on the ground for a buyer to walk on.
const hojreh: Build = (l) => {
  const adobe = pick(l, PE_ADOBE), s = storeys(l, 0.1);
  const b = place(l, 0.9, 0.52, l.ld * 0.34), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xd2bc94, 0xc4aa80, 0.007));
  out.push(...frustum(b.w + 0.0012, b.d + 0.0012, b.w, b.d, b.h, adobe, { x: b.x, z: b.z }, adobe));
  const fb: Body = { ...b, w: b.w + 0.0012, d: b.d + 0.0012 }; // (its faces' details clear of the battered wall's foot)
  // The bays: their domes on the roof, their arches in the front.
  const n = Math.max(2, Math.min(4, Math.round(b.w / 0.0135))), bw = b.w / n, gh = l.floors > 1 ? s.base + s.storey : b.h;
  const ah = Math.min(gh * 0.5, 0.0085), aw = bw * 0.62;
  const rugs = [[0xa82a2a, 0x2a2a5a], [0x2a3a7a, 0xd8c8a0], [0x8a2a3a, 0xe0b04a], [0xb04a2a, 0x2a4a3a]] as const;
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + bw * (i + 0.5);
    out.push(dome(Math.min(bw, b.d) * 0.36, shade(adobe, 1.04), { x: b.x + a, y: b.h, z: b.z, sy: 0.55 }));
    out.push(...arch(fb, 'front', a, 0.0006, aw + 0.0014, ah, PE_TILE, true, E));
    out.push(...arch(fb, 'front', a, 0.0006, aw, ah - 0.0004, PE_DARK, true, E * 2));
    // The rail across the arch, a carpet over it.
    const [f, bd] = rugs[i % rugs.length]!;
    out.push(...carpet(aw * 0.84, ah * 0.75, f, bd, { x: b.x + a, y: ah * 0.62, z: front + 0.0016 }));
    out.push(cyl(0.00018, 0.00018, aw, 4, PE_WOOD, { x: b.x + a - aw / 2, y: ah * 1.0, z: front + 0.0016, rz: -Math.PI / 2 }));
  }
  // The platform along the front, folded carpets piled on it.
  out.push(...box(b.w, 0.0012, 0.0036, shade(adobe, 0.9), { x: b.x, z: front + 0.0018 }));
  for (let i = 0; i < 4; i++) out.push(...box(0.0058, 0.0007, 0.0028, rugs[i % rugs.length]![i % 2]!, { x: b.x + b.w * 0.33, y: 0.0012 + i * 0.0007, z: front + 0.0019, ry: i * 0.08 }));
  // A carpet spread on the ground before it, as for a buyer.
  const [f0, b0] = rugs[(l.v + 1) % rugs.length]!;
  out.push(...carpet(Math.min(0.016, b.w * 0.42), Math.min(0.009, l.ld - front - 0.003), f0, b0, { x: b.x - b.w * 0.18, y: 0.0007, z: front + 0.0045 + Math.min(0.009, l.ld - front - 0.003) / 2, rx: -Math.PI / 2 }));
  if (l.floors > 1) for (let i = 0; i < n; i++) out.push(...arch(fb, 'front', -b.w / 2 + bw * (i + 0.5), gh + s.storey * 0.25, 0.0024, s.storey * 0.3, PE_DARK, true));
  // Carpets thrown over the parapet to air.
  for (let i = 0; i < 2; i++) out.push(...carpet(bw * 0.5, 0.0052, rugs[(i + 2) % rugs.length]![0], rugs[(i + 2) % rugs.length]![1], { x: b.x - b.w / 2 + bw * (i * (n - 1) + 0.5), y: b.h - 0.0026, z: front + 0.00045 }));
  return out;
};
// An attari: a spice and herb seller's shop under a tall pointed iwan
// framed in turquoise and lapis tile; a canvas awning out over the lane;
// trays on the step heaped with saffron, turmeric, sumac, dried roses,
// cumin and black lime; sacks rolled down; the windcatcher of the house
// behind it over the roof.
const attari: Build = (l) => {
  const adobe = pick(l, PE_ADOBE), tower = pick(l, PE_TOWER), s = storeys(l, 0.1);
  const b = place(l, 0.66, 0.54, l.ld * 0.3), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xd2bc94, 0xc4aa80, 0.007));
  out.push(...frustum(b.w + 0.0012, b.d + 0.0012, b.w, b.d, b.h, adobe, { x: b.x, z: b.z }, adobe));
  const fb: Body = { ...b, w: b.w + 0.0012, d: b.d + 0.0012 }; // (its faces' details clear of the battered wall's foot)
  // The iwan's frame: a rectangle of lapis, the arch in turquoise within it, the opening dark.
  const ih = Math.min(b.h * 0.6, 0.016), iw = Math.min(b.w * 0.58, 0.016);
  out.push(onFace(fb, 'front', 0, 0, iw + 0.0026, ih + iw * 0.36 + 0.0016, PE_LAPIS, E));
  out.push(...arch(fb, 'front', 0, 0, iw, ih, PE_TILE, true, E * 2));
  out.push(...arch(fb, 'front', 0, 0, iw - 0.0018, ih - 0.0008, PE_DARK, true, E * 3));
  for (const k of [-1, 1]) out.push(onFace(fb, 'front', k * (iw / 2 + 0.0004), ih * 0.4, 0.0011, ih * 0.5, 0x6a8a3a, E * 4)); // bunches of dried herbs hung in the arch
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(fb, f, { ...s, w: 0.0022, h: s.storey * 0.25, spacing: 0.013, sill: s.storey * 0.55, color: PE_DARK }));
  out.push(dome(Math.min(b.w, b.d) * 0.24, adobe, { x: b.x - b.w * 0.18, y: b.h, z: b.z - b.d * 0.12, sy: 0.6 }));
  const tw = Math.max(0.0055, Math.min(b.w, b.d) * 0.22);
  out.push(...badgir(b.x + b.w / 2 - tw / 2 - 0.001, b.z - b.d / 2 + tw / 2 + 0.001, 0, tw, b.h + 0.012 + l.floors * 0.002, tower, adobe));
  // The awning: white canvas on two poles.
  const ty = Math.min(ih + 0.002, s.base + s.storey * 0.85), td = Math.min(0.0068, l.ld - front - 0.001);
  out.push(...awning(b.w * 0.9, td, [0xeee6d4], { x: b.x, y: ty, z: front + 0.0005, tilt: 0.38 }));
  for (const k of [-1, 1]) out.push(cyl(0.0002, 0.0002, ty - Math.sin(0.38) * td, 4, PE_WOOD, { x: b.x + k * b.w * 0.43, z: front + 0.0005 + Math.cos(0.38) * td - 0.0002 }));
  // The step and its trays of spice, each heaped in a cone.
  const spice = [0xc8401a, 0xe0b020, 0x7a1a2a, 0xc87a8a, 0x8a6a3a, 0x3a2a20, 0x6a8a3a];
  const nt = Math.max(3, Math.min(6, Math.floor(b.w / 0.0042))), tz = front + 0.0028;
  out.push(...box(b.w * 0.86, 0.0018, 0.0048, shade(adobe, 0.86), { x: b.x, z: tz }));
  for (let i = 0; i < nt; i++) {
    const x = b.x + (i - (nt - 1) / 2) * (b.w * 0.86 / nt);
    out.push(cyl(0.0016, 0.0016, 0.0004, 7, 0xb08a4a, { x, y: 0.0018, z: tz }), cone(0.0014, 0.0016, 6, spice[(i + l.v) % spice.length]!, { x, y: 0.0022, z: tz }));
  }
  // Sacks with their mouths rolled down, at the side.
  for (let i = 0; i < 3; i++) {
    const x = b.x - b.w / 2 - 0.0026 + Math.max(0, 0.0045 - (l.lw - b.w / 2 + b.x)), z = front - 0.0012 - i * 0.0032;
    out.push(cyl(0.0012, 0.0013, 0.0024, 6, 0xd8c8a0, { x, z }), cyl(0.001, 0.001, 0.00005, 6, spice[(i * 2 + 1) % spice.length]!, { x, y: 0.0024, z }));
  }
  return out;
};
// A rangrazkhaneh: a dyers' works. Vats sunk in the yard, indigo, madder
// and pomegranate-rind yellow; a copper cauldron over its fire; skeins of
// wool hung on poles to dry in the sun; the dyers' domed workshop and its
// windcatcher behind; a wall round it all.
const rangraz: Build = (l) => {
  const adobe = pick(l, PE_ADOBE), tower = pick(l, PE_TOWER), out: G[] = [];
  const b0 = place(l, 0.58, 0.4, l.ld * 1.06), b = { ...b0, h: wallHeight(1) * (l.floors > 1 ? 1.1 : 0.85) };
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xd2bc94));
  out.push(...frustum(b.w + 0.0012, b.d + 0.0012, b.w, b.d, b.h, adobe, { x: b.x, z: b.z }, adobe));
  const fb: Body = { ...b, w: b.w + 0.0012, d: b.d + 0.0012 }; // (its faces' details clear of the battered wall's foot)
  const r = Math.min(b.w, b.d) * 0.3;
  out.push(dome(r, adobe, { x: b.x - b.w * 0.18, y: b.h, z: b.z, sy: 0.7 }), dome(r * 0.7, adobe, { x: b.x + b.w * 0.24, y: b.h, z: b.z + b.d * 0.08, sy: 0.7 }));
  const tw = Math.max(0.0055, Math.min(b.w, b.d) * 0.24);
  out.push(...badgir(b.x + b.w / 2 - tw / 2 - 0.001, b.z - b.d / 2 + tw / 2 + 0.001, 0, tw, b.h + 0.012, tower, adobe));
  out.push(...arch(fb, 'front', -b.w * 0.18, 0, 0.0056, Math.min(0.0068, b.h * 0.42), PE_DARK, true));
  out.push(...arch(fb, 'front', b.w * 0.22, b.h * 0.3, 0.0026, b.h * 0.22, PE_DARK, true));
  // The vats: round, sunk in a brick-edged platform, each a colour.
  const vats = [0x1e2a6a, 0x8a1a1a, 0xc8a020, 0x2a5a8a], nv = Math.max(2, Math.min(4, Math.floor(l.lw * 1.3 / 0.0068)));
  const vz = b.z + b.d / 2 + 0.0068, vw = nv * 0.0068;
  out.push(...box(vw + 0.002, 0.0014, 0.0078, 0xb89a72, { x: -l.lw * 0.3, z: vz }));
  for (let i = 0; i < nv; i++) out.push(drum(0.0028, 0.0028, 0.0003, 8, 0xa88a62, { x: -l.lw * 0.3 + (i - (nv - 1) / 2) * 0.0068, y: 0.0014, z: vz }, vats[i % vats.length]!)[1]!);
  // The cauldron on its fire-pit, at the side.
  const cx = l.lw * 0.62, cz = vz;
  out.push(cyl(0.0026, 0.0028, 0.0018, 7, 0x8a7a68, { x: cx, z: cz }), cyl(0.0024, 0.0019, 0.0022, 7, 0xa86a3a, { x: cx, y: 0.0018, z: cz }), ...puff(0.0018, { x: cx, y: 0.0062, z: cz }));
  // Skeins drying on poles, across the front of the yard.
  const wool = [0x1e2a6a, 0x8a1a1a, 0xd8a020, 0x2a6a8a, 0xa82a4a, 0x3a3a7a];
  const rw = Math.min(l.lw * 1.6, 0.04), rz = l.ld * 0.84;
  out.push(...rack(rw, 0.0072, 0.0046, wool.slice(0, Math.max(3, Math.min(6, Math.floor(rw / 0.0055)))), PE_WOOD, { x: 0, z: rz }));
  if (l.ld > 0.03) out.push(...rack(rw * 0.8, 0.0068, 0.0042, wool.slice(2).concat(wool.slice(0, 2)).slice(0, Math.max(3, Math.min(6, Math.floor(rw * 0.8 / 0.0055)))), PE_WOOD, { x: l.lw * 0.1, z: rz - 0.0085 }));
  // The yard wall at the sides and back.
  const wd = 2 * l.ld * 0.96, wwid = 2 * l.lw * 0.96;
  out.push(...box(0.0009, 0.004, wd, adobe, { x: -wwid / 2 }), ...box(0.0009, 0.004, wd, adobe, { x: wwid / 2 }), ...box(wwid, 0.004, 0.0009, adobe, { z: -wd / 2 }));
  return out;
};

// ---------- Hebrews (levantine) ----------
// Pale limestone in courses, flat roofs to sleep on, arched windows;
// taller, an Ottoman-era stone house under red tiles. The souk's vaulted
// shops, the glass of Hebron and Sidon, the olive presses of the hills.
const LV_STONE = [0xe7dab8, 0xddd0ac, 0xeee2c4], LV_COURSE = 0xd2c4a0, LV_GLASS = 0x3a3530, LV_DOOR = 0x5a4632, LV_TILE = 0xb5583a, LV_DARK = 0x2a2420;
// A stone shop's walls and everything above its ground floor: the coursing,
// the upper floors' arched windows, the roof (flat with its railing and
// water tank; or, three floors and more, a hipped roof of red tiles).
function lvBody(l: Lot, b: Body, stone: number, out: G[]): { gs: number; s: ReturnType<typeof storeys> } {
  const s = storeys(l, 0.1), gs = s.base + s.storey;
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, LV_COURSE));
  out.push(...bands(b, steps(0.0035, b.h, 0.0035), 0.0003, LV_COURSE, SEEN));
  for (let f = 1; f < l.floors; f++) {
    const y = s.base + f * s.storey + s.storey * 0.24, h = s.storey * 0.4;
    for (const k of [-1, 0, 1]) out.push(...arch(b, 'front', k * 0.0042, y, 0.003, k ? h * 0.85 : h, LV_GLASS, false, E * 2));
    if (b.w > 0.03) for (const sx of [-1, 1]) out.push(...arch(b, 'front', sx * b.w * 0.36, y, 0.0028, h * 0.85, LV_GLASS, false, E * 2));
  }
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0024, h: s.storey * 0.36, spacing: 0.012, sill: s.storey * 0.32, color: LV_GLASS }));
  if (l.floors > 2) out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.28, LV_TILE, { x: b.x, y: b.h, z: b.z }));
  else {
    out.push(ring(b.w - 0.0004, 0.0022, b.d - 0.0004, 0x5a5048, { x: b.x, y: b.h, z: b.z }));
    out.push(...drum(0.0018, 0.0018, 0.0028, 7, 0x3a3a3a, { x: b.x + b.w * 0.3, y: b.h, z: b.z - b.d * 0.28 }));
  }
  return { gs, s };
}
// A grocer's in the souk: a vaulted stone shop open to the lane under a
// deep round arch, its iron shutter rolled up; out front a tiered stand of
// fruit in crates (oranges, pomegranates, lemons, figs), tubs of olives,
// sacks of lentils and chickpeas; a sheet of canvas stretched over it all
// on a light frame.
const souk: Build = (l) => {
  const stone = pick(l, LV_STONE), out: G[] = [];
  const b = place(l, 0.8, 0.56, l.ld * 0.32), front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xd8cdb0, 0xccc0a0, 0.007));
  const { gs } = lvBody(l, b, stone, out);
  const aw = Math.min(b.w * 0.62, 0.02), ah = Math.min(gs * 0.5, 0.0075);
  out.push(...arch(b, 'front', 0, 0, aw + 0.0016, ah, 0xc8b890, false, E));
  out.push(...arch(b, 'front', 0, 0, aw, ah - 0.0006, LV_DARK, false, E * 2));
  out.push(onFace(b, 'front', 0, ah + aw * 0.42, aw * 0.9, 0.0008, 0x4a4440, E * 3)); // the shutter rolled up under the arch
  // Shelves of tins and jars at the back of the shop (seen through the arch).
  for (const y of [ah * 0.35, ah * 0.7]) out.push(onFace(b, 'front', 0, y, aw * 0.8, 0.0006, 0x8a6a48, E * 3));
  // The stand: three steps of crates, each a fruit.
  const fruit = [0xe8801a, 0xa82a2a, 0xe8d040, 0x5a3a5a, 0x7a9a3a, 0xe8801a], sw = Math.min(aw * 1.1, 0.02), sz = front + 0.0042;
  const nc = Math.max(3, Math.min(6, Math.floor(sw / 0.0034)));
  for (let t = 0; t < 3; t++) {
    const y = t * 0.0013, z = sz - t * 0.0017;
    out.push(...box(sw, 0.0013, 0.0019, 0x8a6a48, { x: b.x, y, z }));
    for (let i = 0; i < nc; i++) out.push(patch(sw / nc - 0.0005, 0.0015, fruit[(i + t * 2) % fruit.length]!, b.x + (i - (nc - 1) / 2) * (sw / nc), z, y + 0.00135));
  }
  // Olives in tubs and sacks of pulses at the sides.
  for (const [k, c] of [[-1, 0x4a5a2a], [1, 0x2a2a1e]] as const) out.push(cyl(0.0014, 0.0015, 0.0022, 7, 0x7a5a3a, { x: b.x + k * (sw / 2 + 0.0024), z: sz }), patch(0.0024, 0.0024, c, b.x + k * (sw / 2 + 0.0024), sz, 0.0021, Math.PI / 4));
  out.push(...sacks(3, 0.0012, 0xd8c8a0, { x: b.x - b.w * 0.42, z: front + 0.0076 }));
  // The canvas over the stand, on its light frame.
  const cy = Math.min(gs * 0.9, 0.0115), cd = Math.min(0.011, l.ld - front - 0.0014);
  out.push(patch(sw + 0.006, cd, 0xe2d4b0, b.x, front + cd / 2, cy));
  for (const k of [-1, 1]) out.push(cyl(0.0002, 0.0002, cy, 4, 0x5a4a3a, { x: b.x + k * (sw / 2 + 0.0026), z: front + cd - 0.0004 }));
  out.push(...tree(l.lw * 0.66, -l.ld * 0.7, 0.9, 0x7d8b4f));
  return out;
};
// A glass and lamp seller (the glass of Hebron and Sidon, blue and green):
// a stone arcade of round arches before the shop, oil lamps hung in it,
// shelves of bottles, cups and beads glinting in the shop window; the
// pieces too big for the shelf (great jars of blue glass) out on the step.
const zakhuchit: Build = (l) => {
  const stone = pick(l, LV_STONE), out: G[] = [];
  const b = place(l, 0.82, 0.48, l.ld * 0.44), front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xd8cdb0, 0xccc0a0, 0.007));
  const { gs } = lvBody(l, b, stone, out);
  // The shop front: a door and a wide window full of glass on shelves.
  out.push(onFace(b, 'front', -b.w * 0.3, 0, 0.0052, Math.min(0.0088, gs * 0.6), LV_DOOR, E));
  const ww = b.w * 0.42, wh = gs * 0.32, wy = gs * 0.18, wx = b.w * 0.14;
  out.push(onFace(b, 'front', wx, wy, ww, wh, LV_DARK, E));
  const gl = [0x2a6ac8, 0x3aa0a0, 0x2a4aa8, 0x6ac0c8, 0x2a8a6a];
  for (const [r, y] of [[0, wy + 0.0004], [1, wy + wh * 0.5]] as const) {
    out.push(onFace(b, 'front', wx, y, ww * 0.94, 0.0004, 0x8a6a48, E * 2));
    const n = Math.max(4, Math.floor(ww / 0.0016));
    for (let i = 0; i < n; i++) out.push(onFace(b, 'front', wx - ww * 0.44 + i * (ww * 0.88 / (n - 1)), y + 0.0004, 0.0008, 0.0012 + ((i + r) % 3) * 0.0004, gl[(i + r * 2) % gl.length]!, E * 2));
  }
  // The arcade: piers, round arches, a flat stone roof over it.
  const ad = Math.min(0.0082, l.ld - front - 0.0012), az = front + ad / 2, ah = Math.min(gs * 0.95, 0.0125), n = Math.max(2, Math.min(4, Math.round(b.w / 0.012)));
  const pw = 0.0018, span = (b.w - pw) / n;
  for (let i = 0; i <= n; i++) out.push(...box(pw, ah * 0.62, pw, stone, { x: b.x - b.w / 2 + pw / 2 + i * span, z: front + ad - pw / 2 }));
  out.push(...box(b.w, ah - ah * 0.62, 0.0016, stone, { x: b.x, y: ah * 0.62, z: front + ad - 0.0008 }, LV_COURSE));
  out.push(...box(b.w + 0.001, 0.0008, ad + 0.0002, LV_COURSE, { x: b.x, y: ah, z: az }));
  for (let i = 0; i < n; i++) {
    const a = -b.w / 2 + pw + (i + 0.5) * span - pw / 2;
    out.push(P(spandrels((span - pw) / 2).translate(a, ah * 0.62, 0), stone, { x: b.x, z: front + ad + 0.00001 }));
    // A lamp hung in each arch: a brass bowl on a chain.
    out.push(cyl(0.0001, 0.0001, 0.0026, 3, 0x6a5a3a, { x: b.x + a, y: ah * 0.62 - 0.0026, z: az }), cyl(0.0005, 0.0009, 0.0007, 6, 0xc8a04a, { x: b.x + a, y: ah * 0.62 - 0.0033, z: az }));
  }
  // Great jars of blue glass on the step, by the door.
  for (const [i, c] of [[0, 0x2a5ab8], [1, 0x3a9a9a]] as const) out.push(...pot(0.0012 - i * 0.0002, c, { x: b.x - b.w * 0.44 + i * 0.0028, z: front + 0.0018 }));
  out.push(...tree(-l.lw * 0.66, -l.ld * 0.7, 0.9, 0x7d8b4f));
  return out;
};
// A bet bad: an olive press of the hills. In a stone house, the beam
// press: a great beam anchored in a niche of the wall, pulling down on the
// baskets of crushed olives, stone weights hung from its far end; in the
// yard the crushing basin, a round stone tub with an upright millstone a
// donkey rolled round it; baskets of olives, jars of new oil.
const betBad: Build = (l) => {
  const stone = pick(l, LV_STONE), out: G[] = [];
  const b = { ...place(l, 0.62, 0.4, l.ld * 1.06), h: wallHeight(1) * (l.floors > 1 ? 1.15 : 0.9) };
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xd8cdb0));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, LV_COURSE), ...bands(b, steps(0.0035, b.h, 0.0035), 0.0003, LV_COURSE, SEEN));
  out.push(ring(b.w - 0.0004, 0.0016, b.d - 0.0004, stone, { x: b.x, y: b.h, z: b.z }));
  out.push(...arch(b, 'front', -b.w * 0.24, 0, 0.0056, Math.min(0.0068, b.h * 0.45), LV_DARK));
  // The beam out through an opening in the front wall, over the press bed, its weights hung at the far end.
  const bxx = b.x + b.w * 0.22, by = b.h * 0.6, bz0 = b.z + b.d / 2, blen = Math.min(0.024, l.ld * 0.95 - bz0 - 0.003);
  out.push(onFace(b, 'front', b.w * 0.22, by - 0.0026, 0.0046, 0.0054, LV_DARK));
  out.push(seg(V3(bxx, by + 0.0008, bz0 - 0.002), V3(bxx, by - 0.0024, bz0 + blen), 0.0013, 0.001, 5, 0x5a4232));
  for (const k of [0.66, 0.92]) {
    const z = bz0 + blen * k, y = by + 0.0008 - 0.0032 * ((blen * k + 0.002) / (blen + 0.002));
    out.push(cyl(0.00014, 0.00014, y - 0.0042, 3, 0x6a5a3a, { x: bxx, y: 0.0042, z }), ...drum(0.0026, 0.0024, 0.0032, 7, 0xb8ac90, { x: bxx, y: 0.001, z }));
  }
  // The baskets of pulp stacked under the beam on the stone bed (the press table), a channel to the oil vat.
  const pz = bz0 + blen * 0.25;
  out.push(cyl(0.0034, 0.0036, 0.0012, 8, 0xc8bc9c, { x: bxx, z: pz }));
  for (let i = 0; i < 3; i++) out.push(cyl(0.0024, 0.0024, 0.0007, 7, i % 2 ? 0x8a6a3a : 0x9a7a48, { x: bxx, y: 0.0012 + i * 0.0007, z: pz }));
  out.push(...drum(0.0018, 0.0018, 0.0009, 7, 0xb0a488, { x: bxx - 0.0056, z: pz }, 0x6a6a2a));
  // The crushing basin and its upright stone, in the yard.
  const cx = -l.lw * 0.42, cz = l.ld * 0.45, cr = Math.min(0.0062, l.lw * 0.3);
  out.push(...drum(cr, cr, 0.0022, 10, 0xc8bc9c, { x: cx, z: cz }, 0x4a5a2a));
  out.push(cyl(0.0024, 0.0024, 0.0012, 8, 0xb0a488, { x: cx + 0.0008, y: 0.0046, z: cz, rx: Math.PI / 2 }));
  out.push(cyl(0.0004, 0.0004, cr * 2, 4, 0x5a4232, { x: cx + cr, y: 0.0046, z: cz, rz: Math.PI / 2 }));
  // Baskets of olives, jars of oil.
  for (let i = 0; i < 3; i++) out.push(...drum(0.0013, 0.0016, 0.0016, 6, 0xa88a5a, { x: -l.lw * 0.75 + i * 0.0034, z: l.ld * 0.84 }, [0x3a4a2a, 0x2a2a20, 0x5a6a2a][i]!));
  out.push(...pots(3, 0.0014, 0.0032, [0xc89a6a, 0xb8865a], { x: l.lw * 0.62, z: -l.ld * 0.3 }));
  out.push(...tree(l.lw * 0.7, l.ld * 0.72, 1, 0x8a9a5a), ...tree(l.lw * 0.7, -l.ld * 0.75, 0.9, 0x8a9a5a));
  return out;
};

// ---------- Japanese (machiya) ----------
// Dark timber, lattice fronts, grey tiled eaves, white plaster above;
// the town's sake shops under their cedar balls, the roadside teahouses
// with red benches, the potters' climbing kilns up the hillside.
const MA_WOOD = [0x5b3a24, 0x4e3220, 0x664530], MA_TILE = [0x3c4148, 0x44484e, 0x363a40];
const MA_PLASTER = 0xede6d6, MA_LATTICE = 0x9a6a42, MA_DARK = 0x221c18, MA_INDIGO = 0x2d4a7a;
// A machiya's body: the timber ground floor, white plaster above on a
// two-floor street with its mushiko slits, a pent roof between them, the
// tiled gable roof and its ridge. Returns the ground floor's height.
function maBody(l: Lot, b: Body, wood: number, tile: number, out: G[]): number {
  const s = storeys(l, 0.08), g0 = l.floors > 1 ? s.base + s.storey : b.h;
  out.push(...box(b.w, g0, b.d, wood, { x: b.x, z: b.z }));
  if (l.floors > 1) {
    const up: Body = { ...b, y: g0, h: b.h - g0 };
    out.push(...box(b.w, up.h, b.d, MA_PLASTER, { x: b.x, y: g0, z: b.z }));
    for (const k of [-1, 0, 1]) out.push(onFace(up, 'front', k * b.w * 0.3, g0 + up.h * 0.35, b.w * 0.18, up.h * 0.32, wood));
    out.push(...frustum(b.w + 0.003, b.d + 0.006, b.w, b.d, 0.0018, tile, { x: b.x, y: g0 - 0.0005, z: b.z }));
  }
  const rh = Math.min(b.w, b.d) * 0.26;
  out.push(...gable(b.w + 0.004, b.d + 0.005, rh, tile, { x: b.x, y: b.h, z: b.z }, false, l.floors > 1 ? MA_PLASTER : wood));
  out.push(...box(b.w + 0.0036, 0.0012, 0.0016, shade(tile, 0.8), { x: b.x, y: b.h + rh - 0.0006, z: b.z }));
  return g0;
}
// A sakaya: a sake brewer's shop. Over the door hangs the sugidama, the
// ball of cedar sprigs that went up green when the new sake was pressed
// and browned as it aged; a long indigo noren with the house's white
// crest; the front opened up, the shop floor dark within; straw-wrapped
// casks (komodaru) stacked by the door; a standing signboard.
const sakaya: Build = (l) => {
  const wood = pick(l, MA_WOOD), tile = pick(l, MA_TILE);
  const b = place(l, 0.86, 0.6, Math.max(l.ld * 0.18, 0.0074)), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xb8b0a0, 0xa8a090, 0.008));
  const g0 = maBody(l, b, wood, tile, out);
  // The open front: dark within, the shop's raised floor's edge, the noren across the door.
  const ow = b.w * 0.86, oh = Math.min(g0 * 0.8, 0.0112);
  out.push(onFace(b, 'front', 0, 0, ow, oh, MA_DARK));
  out.push(onFace(b, 'front', 0, 0.0016, ow, 0.0008, MA_LATTICE, E * 2));
  out.push(...strips({ ...b, w: b.w * 0.34 }, 'front', 0.0024, oh - 0.0024, 0.0005, 0.0016, MA_LATTICE, E * 2).map((g) => g.translate(b.w * 0.26, 0, 0)));
  const nw = Math.min(b.w * 0.44, 0.0145), nh = oh * 0.52, nx = -b.w * 0.16;
  for (let i = 0; i < 3; i++) out.push(onFace(b, 'front', nx - nw / 3 + (i * nw) / 3, oh - nh, nw / 3 - 0.0002, nh, MA_INDIGO, E * 3));
  out.push(disc(b, 'front', nx, oh - nh * 0.45, 0.0013, 0xf2ece0, E * 4), disc(b, 'front', nx, oh - nh * 0.45, 0.0007, MA_INDIGO, E * 5));
  // The sugidama under the eave, on its cord.
  const sy = Math.min(g0, oh + 0.004) - 0.0002, sr = 0.0026;
  out.push(cyl(0.0001, 0.0001, 0.0016, 3, 0x2a2420, { x: b.x + nx + nw / 2 + 0.003, y: sy - 0.0016, z: front + 0.0034 }));
  out.push(P(new THREE.IcosahedronGeometry(sr, 1), l.v % 2 ? 0x4f6a2a : 0x7a5a2a, { x: b.x + nx + nw / 2 + 0.003, y: sy - 0.0016 - sr, z: front + 0.0034 }));
  // The casks: straw-wrapped, cream, a red and black label, in a pyramid on their sides by the door.
  const cx = b.x + b.w * 0.27, r = 0.0016;
  for (const [row, n] of [[0, 3], [1, 2], [2, 1]] as const) for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * r * 2.05, y = row * r * 1.72;
    out.push(...cask(r, 0.0044, 0xe8dcc0, (i + row) % 2 ? 0xa82a2a : 0x2a2a2a, { x, y, z: front + 0.0006 }));
  }
  // The signboard, standing at the street on its foot.
  out.push(...box(0.0024, 0.0118, 0.0006, 0x8a6a48, { x: b.x - b.w * 0.42, z: front + 0.0042 }), ...box(0.0034, 0.0008, 0.0024, 0x4a3426, { x: b.x - b.w * 0.42, z: front + 0.0042 }));
  for (let i = 0; i < 4; i++) out.push(...box(0.0012, 0.0012, 0.00005, MA_DARK, { x: b.x - b.w * 0.42, y: 0.0028 + i * 0.0021, z: front + 0.00453 }));
  out.push(patch(2 * l.lw * 0.9, l.ld * 0.4, 0xd8d4c8, 0, -l.ld * 0.76, 0.0005), ...tree(l.lw * 0.55, -l.ld * 0.8, 0.8, 0x4f6e38));
  return out;
};
// A chamise: a teahouse on the road, where travellers sat out on benches
// spread with red felt under a great red parasol, a reed screen (yoshizu)
// shading them, paper lanterns at the eaves, tea and dumplings brought
// out from the kettle on its brazier inside the open front.
const chamise: Build = (l) => {
  const wood = pick(l, MA_WOOD), tile = pick(l, MA_TILE);
  const b = place(l, 0.74, 0.5, Math.max(l.ld * 0.5, 0.0195)), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xc8bca0, 0xb8ae94, 0.008));
  out.push(patch(2 * l.lw * 0.9, l.ld - front, 0xc8b898, 0, front + (l.ld - front) / 2, 0.0004));
  const g0 = maBody(l, b, wood, tile, out);
  // The open front under a deep eave on posts.
  const oh = Math.min(g0 * 0.78, 0.0105);
  out.push(onFace(b, 'front', 0, 0, b.w * 0.82, oh, MA_DARK));
  out.push(...leanTo(b.w + 0.002, 0.0062, Math.min(g0, oh + 0.0034), oh, tile, wood, { x: b.x, z: front }));
  // The kettle on its brazier just inside.
  out.push(cyl(0.0012, 0.0012, 0.0024, 6, 0x6a5a4a, { x: b.x + b.w * 0.28, z: front - 0.0001 }), cyl(0.0011, 0.0007, 0.0013, 6, 0x2a2a2a, { x: b.x + b.w * 0.28, y: 0.0024, z: front - 0.0001 }));
  // Lanterns at the eave: red and white paper.
  for (const k of [-0.36, 0.36]) out.push(...lantern(0.0011, k < 0 ? 0xc83a2a : 0xf2e8d0, { x: b.x + k * b.w, y: oh - 0.0006, z: front + 0.0052 }));
  // The reed screen leaned against the side, shading the bench.
  out.push(P(new THREE.PlaneGeometry(0.0085, 0.0085), 0xb8a070, { x: b.x - b.w / 2 + 0.0014, y: 0.0041, z: front + 0.0078, ry: Math.PI / 2, rz: 0.12 }));
  // The benches under the parasol, out on the forecourt, red felt over them; two cups and a plate of dango.
  const pz = Math.min(front + Math.min(0.0118, (l.ld - front) * 0.6), l.ld * 1.05 - 0.0107), px = b.x + b.w * 0.04;
  for (const [dx, dz, ry] of [[-0.0056, 0, 0], [0.0052, -0.0016, Math.PI / 2]] as const) {
    out.push(...box(0.0076, 0.0024, 0.0028, 0x6a4a30, { x: px + dx, z: pz + dz, ry }, 0xc8282a));
    out.push(...box(0.0068, 0.0002, 0.0026, 0xc8282a, { x: px + dx, y: 0.0024, z: pz + dz, ry }));
  }
  out.push(cyl(0.0004, 0.0003, 0.0005, 5, 0x3a4a3a, { x: px - 0.0068, y: 0.0026, z: pz }), cyl(0.0004, 0.0003, 0.0005, 5, 0x3a4a3a, { x: px - 0.0046, y: 0.0026, z: pz }));
  // The nodate-gasa: a great red parasol on its pole, ribs under it.
  out.push(cyl(0.0002, 0.0002, 0.0135, 4, 0x5a3a24, { x: px - 0.0004, z: pz + 0.0022 }));
  out.push(cone(0.0085, 0.0032, 10, 0xc8282a, { x: px - 0.0004, y: 0.0112, z: pz + 0.0022 }), cone(0.0078, 0.0026, 10, 0x8a3a2a, { x: px - 0.0004, y: 0.0110, z: pz + 0.0022 }));
  out.push(patch(2 * l.lw * 0.9, l.ld * 0.4, 0xd8d4c8, 0, -l.ld * 0.76, 0.0005), ...tree(-l.lw * 0.6, -l.ld * 0.78, 0.8, 0xb0402a));
  return out;
};
// A potter's works with its noborigama: the climbing kiln, a chain of
// arched chambers stepping up the slope one behind another, fired from
// the firebox at the foot and then chamber by chamber, the chimney at
// the top; stacks of split pine to feed it; the workshop under its tiles,
// pots drying on boards in the sun before the firing.
const noborigama: Build = (l) => {
  const wood = pick(l, MA_WOOD), tile = pick(l, MA_TILE), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8ae98));
  // The kiln: its chambers up the lot from the street toward the back, each higher.
  const clay = 0xb08a6a, n = Math.max(3, Math.min(5, Math.floor((l.ld * 1.5) / 0.0085))), cw = Math.min(0.012, l.lw * 0.6), cl = Math.min(0.0085, (l.ld * 1.5) / n);
  const kx = -l.lw + cw / 2 + 0.003, z0 = l.ld * 0.72 - cl;
  out.push(...box(cw * 0.7, 0.0026, 0.0042, 0x8a6a50, { x: kx, z: z0 + cl / 2 + 0.002 })); // the firebox
  out.push(onFace({ x: kx, z: z0 + cl / 2 + 0.002, w: cw * 0.7, d: 0.0042, y: 0, h: 0.0026 }, 'front', 0, 0.0004, cw * 0.4, 0.0016, 0x1e1a16));
  for (let i = 0; i < n; i++) {
    const z = z0 - i * cl * 0.98, y = i * 0.0016;
    if (y > 0) out.push(...box(cw, y, cl, 0x9a8a72, { x: kx, z }));
    out.push(...vault(cw / 2, cl * 0.94, clay, { x: kx, y, z, sy: 0.75 }));
    out.push(disc({ x: kx, z, w: cw, d: cl * 0.94, y, h: 0 }, 'right', 0, y + cw * 0.14, 0.0007, 0x1e1a16, E)); // a stoking port
  }
  const top = z0 - n * cl * 0.98 + cl * 0.2, ty = n * 0.0016;
  out.push(...box(0.0034, ty + 0.012, 0.0034, 0x8a6a50, { x: kx, z: top }, 0x2a2420));
  out.push(...puff(0.0022, { x: kx + 0.001, y: ty + 0.0145, z: top }));
  // Split pine stacked high beside it.
  out.push(...box(0.003, 0.0058, Math.min(0.016, l.ld * 0.8), 0xc8a070, { x: kx + cw / 2 + 0.0034, z: z0 - cl }, 0xa88050));
  // The workshop on the right: wood below, tiles over; boards of pots drying before it.
  const ww = Math.min(l.lw * 0.9, 0.024), wd = Math.min(l.ld * 0.7, 0.022), b: Body = { x: l.lw * 0.96 - ww / 2, z: -l.ld * 0.92 + wd / 2, w: ww, d: wd, y: 0, h: wallHeight(1) * 0.8 };
  out.push(...box(b.w, b.h, b.d, wood, { x: b.x, z: b.z }));
  out.push(onFace(b, 'front', 0, 0, b.w * 0.6, b.h * 0.72, MA_DARK), ...strips({ ...b, w: b.w * 0.6 }, 'front', 0, b.h * 0.72, 0.0005, 0.0024, MA_LATTICE, E * 2));
  out.push(...gable(b.w + 0.004, b.d + 0.004, Math.min(b.w, b.d) * 0.3, tile, { x: b.x, y: b.h, z: b.z }, false, wood));
  for (let r = 0; r < 2; r++) {
    const z = b.z + b.d / 2 + 0.0048 + r * 0.0056;
    out.push(...box(b.w * 0.8, 0.0018, 0.0026, 0x8a6a48, { x: b.x, z }));
    const np = Math.max(3, Math.min(6, Math.floor(b.w * 0.8 / 0.003)));
    for (let i = 0; i < np; i++) out.push(cup(0.0009, i % 2 ? 0xc8b8a0 : 0x9a7a5a, { x: b.x - b.w * 0.36 + i * (b.w * 0.72 / (np - 1)), y: 0.0018, z }));
  }
  return out;
};

// ---------- Russians (izba) ----------
// Logs crossed at the corners, steep board roofs, windows in carved and
// painted frames; the trading rows' lavki with their shutters let down
// for a counter, the bakers under their golden kalach, the village smithy.
const IZ_LOG = [0x9b7653, 0x8a6848, 0xa8835e], IZ_ROOF = [0x6e6a62, 0x7a7468, 0x5f5b54], IZ_PAINT = [0x2f6fb5, 0x3a8a5a, 0x2f6fb5];
const IZ_WHITE = 0xf1efe6, IZ_GLASS = 0x2a3038, IZ_DARK = 0x231c16;
// Log walls: the body, its courses, the log ends crossing at the corners.
function logWalls(b: Body, log: number, out: G[], faces: readonly Face[] = SEEN): void {
  out.push(...box(b.w, b.h, b.d, log, { x: b.x, y: b.y, z: b.z }));
  out.push(...bands(b, steps(b.y + 0.0022, b.y + b.h, 0.0022), 0.0004, shade(log, 0.72), faces));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0018, b.h - 0.0002, 0.0018, shade(log, 0.72), { x: b.x + x * b.w / 2, y: b.y, z: b.z + z * b.d / 2 }));
}
// A window in a carved white frame (nalichnik) with a little peaked head, painted shutters folded open.
function nalichnik(b: Body, face: Face, along: number, y: number, w: number, h: number, paint: number, out: G[]): void {
  out.push(onFace(b, face, along, y - 0.0006, w + 0.0012, h + 0.0012, IZ_WHITE, E * 2), onFace(b, face, along, y, w, h, IZ_GLASS, E * 3));
  out.push(onFaceShape(b, face, new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([along - w / 2 - 0.0012, y + h + 0.0006, 0, along + w / 2 + 0.0012, y + h + 0.0006, 0, along, y + h + 0.0024, 0], 3)), IZ_WHITE, E * 2));
  for (const k of [-1, 1]) out.push(onFace(b, face, along + k * (w / 2 + 0.0006 + w * 0.26), y, w * 0.5, h, paint, E * 3));
}
// A lavka in the trading rows: a log shop, its gable to the street, the
// whole front a hatch whose upper shutter is propped up for a canopy and
// whose lower one is let down for a counter; on it pots of honey, cakes
// of wax, bast boxes; sable and squirrel pelts hung in bunches; the
// merchant's painted signboard under the gable.
const lavka: Build = (l) => {
  const log = pick(l, IZ_LOG), roof = pick(l, IZ_ROOF), paint = pick(l, IZ_PAINT), s = storeys(l, 0.12);
  const b = place(l, 0.62, 0.58, Math.max(l.ld * 0.22, 0.0072)), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x8a9a62, 0x9a8a6a, 0.007));
  logWalls(b, log, out);
  const rh = Math.min(b.w, b.d) * 0.62;
  out.push(...gable(b.w + 0.004, b.d + 0.004, rh, roof, { x: b.x, y: b.h, z: b.z }, true, log));
  // The signboard under the gable: blue, a gold border, its lettering white.
  out.push(...signBoard({ ...b, d: b.d + 0.0042 }, 'front', 0, b.h + rh * 0.06, b.w * 0.56, 0.0034, paint, IZ_WHITE, E * 2));
  // The hatch: dark within; the upper shutter propped out as a canopy, the lower let down on chains as a counter.
  const hy = s.storey * 0.3, hh = s.storey * 0.46, hw = b.w * 0.72;
  out.push(onFace(b, 'front', 0, hy, hw, hh, IZ_DARK, E * 2));
  const shutter = shade(log, 0.85);
  const L = hh * 0.7, al = 1.0, hz = front + 0.0006;
  out.push(P(new THREE.PlaneGeometry(hw, L).rotateY(Math.PI), paint, { x: b.x, y: hy + hh + (L / 2) * Math.sin(al), z: hz + (L / 2) * Math.cos(al), rx: Math.PI / 2 - al }));
  out.push(P(new THREE.PlaneGeometry(hw * 0.5, L * 0.5).rotateZ(Math.PI / 4).scale(0.7, 1, 1).rotateY(Math.PI), IZ_WHITE, { x: b.x, y: hy + hh + (L / 2) * Math.sin(al) - 0.0001, z: hz + (L / 2) * Math.cos(al) + 0.00012, rx: Math.PI / 2 - al }));
  for (const k of [-1, 1]) out.push(seg(V3(b.x + k * hw * 0.46, hy + 0.0004, hz + 0.0002), V3(b.x + k * hw * 0.46, hy + hh + L * Math.sin(al), hz + L * Math.cos(al)), 0.00018, 0.00018, 3, IZ_DARK));
  out.push(...box(hw, 0.0005, 0.0034, shutter, { x: b.x, y: hy - 0.0005, z: front + 0.0017 }));
  // Goods on the counter: honey pots, wax, bast boxes.
  const n = Math.max(3, Math.min(6, Math.floor(hw / 0.0032)));
  for (let i = 0; i < n; i++) {
    const x = b.x - hw * 0.42 + i * (hw * 0.84 / (n - 1));
    if (i % 3 === 0) out.push(...pot(0.0008, 0x8a5a3a, { x, y: hy, z: front + 0.0018 }));
    else if (i % 3 === 1) out.push(...box(0.0018, 0.0009, 0.0016, 0xe8c860, { x, y: hy, z: front + 0.0018 }));
    else out.push(cyl(0.0009, 0.0009, 0.0012, 6, 0xc8a878, { x, y: hy, z: front + 0.0018 }));
  }
  // Pelts hung at either side of the hatch, from pegs.
  for (const k of [-1, 1]) for (let i = 0; i < 2; i++) out.push(onFace(b, 'front', k * (hw / 2 + 0.0012 + i * 0.0012), hy + hh * 0.1, 0.001, hh * 0.8, i ? 0x4a3020 : 0x8a6a4a, E * (3 + i)));
  for (const f of ['left', 'right'] as Face[]) if (l.floors > 1 || b.d > 0.02) nalichnik(b, f, 0, s.storey * 0.32 + s.base, 0.0026, s.storey * 0.32, paint, out);
  if (l.floors > 1) for (const k of [-1, 1]) nalichnik(b, 'front', k * b.w * 0.25, s.base + s.storey * 1.3, 0.0028, s.storey * 0.34, paint, out);
  // The plank walk before the row, and a sledge by the side.
  out.push(...box(b.w + 0.006, 0.0006, 0.004, 0x7a6a50, { x: b.x, z: front + 0.0042 }));
  out.push(...fence(l, 0.0035, 0x8a8070, 0.012), ...birch(-l.lw * 0.7, -l.ld * 0.7, 1));
  return out;
};
// A kalachnaya: a baker's of kalachi, the padlock-shaped white loaves; a
// gilded kalach hung out on an iron bracket for its sign, as Russian bakers
// did; its eaves to the street, a covered porch on carved posts, the
// great stove's whitewashed chimney through the roof, loaves on trays in
// the windows, baskets of bread on the bench.
const kalachnaya: Build = (l) => {
  const log = pick(l, IZ_LOG), roof = pick(l, IZ_ROOF), paint = pick(l, IZ_PAINT), s = storeys(l, 0.12);
  const b = place(l, 0.84, 0.46, l.ld * 0.36), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x8a9a62, 0x9a8a6a, 0.007));
  logWalls(b, log, out);
  const rh = Math.min(b.w, b.d) * 0.55;
  out.push(...gable(b.w + 0.004, b.d + 0.005, rh, roof, { x: b.x, y: b.h, z: b.z }, false, log));
  // Carved bargeboards: white along the eaves' ends.
  for (const k of [-1, 1]) out.push(...box(0.0005, 0.0012, b.d + 0.005, IZ_WHITE, { x: b.x + k * (b.w / 2 + 0.0021), y: b.h - 0.0004, z: b.z }));
  // The stove's chimney, whitewashed brick.
  out.push(...chimney(0.0034, rh + 0.004, 0.0034, 0xe8e2d6, { x: b.x - b.w * 0.18, y: b.h, z: b.z - b.d * 0.08 }, 0x4a4440));
  // Windows with loaves on trays inside; the door.
  const wy = s.storey * 0.32;
  for (const k of [-0.34, 0.3]) {
    nalichnik(b, 'front', k * b.w, wy, 0.0036, s.storey * 0.34, paint, out);
    out.push(onFace(b, 'front', k * b.w, wy, 0.0032, 0.0012, 0xe0b878, E * 4));
  }
  out.push(onFace(b, 'front', -b.w * 0.02, 0, 0.0044, Math.min(0.0085, s.storey * 0.7), 0x5a4030, E * 2));
  if (l.floors > 1) for (const k of [-0.3, 0, 0.3]) nalichnik(b, 'front', k * b.w, s.base + s.storey * 1.3, 0.0028, s.storey * 0.34, paint, out);
  // The porch over the door: a little roof on two carved posts.
  const pd = 0.0054, py = Math.min(0.0102, s.storey * 0.82);
  out.push(...gable(0.0086, pd + 0.001, 0.0026, roof, { x: b.x - b.w * 0.02, y: py, z: front + pd / 2 }, true, IZ_WHITE));
  for (const k of [-1, 1]) out.push(...box(0.0007, py, 0.0007, IZ_WHITE, { x: b.x - b.w * 0.02 + k * 0.0036, z: front + pd - 0.0004 }));
  // The sign: a gilded kalach on its bracket.
  const kx = b.x + b.w * 0.06 + 0.0052, ky = py + 0.0004, kz = front + 0.0034;
  out.push(...box(0.0003, 0.0003, 0.0038, IZ_DARK, { x: kx, y: ky + 0.002, z: front + 0.0019 }));
  out.push(P(new THREE.TorusGeometry(0.0016, 0.0006, 4, 8), 0xd8a030, { x: kx, y: ky, z: kz, ry: Math.PI / 2 }));
  // The bench with baskets of bread.
  out.push(...box(0.008, 0.0016, 0.0018, 0x7a5a3a, { x: b.x + b.w * 0.3, z: front + 0.0014 }));
  for (const k of [-1, 1]) out.push(cyl(0.0012, 0.0014, 0.0011, 6, 0xb08a50, { x: b.x + b.w * 0.3 + k * 0.0022, y: 0.0016, z: front + 0.0014 }), cyl(0.0011, 0.0011, 0.00005, 6, 0xe8c890, { x: b.x + b.w * 0.3 + k * 0.0022, y: 0.0025, z: front + 0.0014 }));
  out.push(...fence(l, 0.0035, 0x8a8070, 0.012), ...birch(l.lw * 0.7, -l.ld * 0.7, 1));
  return out;
};
// A kuznitsa: the smithy, kept apart at the village's edge for fear of
// fire. A small log forge, its roof carried out on posts over the working
// floor; the hearth's coals glowing, the bellows, the anvil on its stump;
// the frame (stanok) a horse was tied in to be shod; cart wheels waiting
// to be tyred; a heap of charcoal.
const kuznitsa: Build = (l) => {
  const log = pick(l, IZ_LOG), roof = pick(l, IZ_ROOF), out: G[] = [];
  const b0 = place(l, 0.6, 0.38, l.ld * 1.04), b = { ...b0, h: wallHeight(1) * (l.floors > 1 ? 0.95 : 0.78) }, front = b.z + b.d / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a8a62), patch(2 * l.lw * 0.8, l.ld * 0.9, 0x6a6052, 0, front + l.ld * 0.3, 0.0005));
  logWalls(b, log, out);
  // The roof: steep, carried out forward over the working floor on posts.
  const ext = Math.min(0.012, l.ld * 0.5), rd = b.d + ext, rz = b.z + ext / 2, rh = Math.min(b.w, rd) * 0.42;
  out.push(...gable(b.w + 0.004, rd + 0.004, rh, roof, { x: b.x, y: b.h, z: rz }, true, log));
  for (const k of [-1, 1]) out.push(...box(0.0012, b.h, 0.0012, shade(log, 0.8), { x: b.x + k * (b.w / 2 - 0.0006), z: front + ext - 0.0006 }));
  // The forge: the hearth of stone and clay inside the open front, coals glowing; its hood and chimney up through the roof.
  const hx = b.x - b.w * 0.2;
  out.push(onFace(b, 'front', 0, 0, b.w * 0.7, b.h * 0.82, IZ_DARK, E * 2));
  out.push(...box(0.0074, 0.0034, 0.0052, 0x8a7a6a, { x: hx, z: front - 0.0026 + 0.0003 }), patch(0.0046, 0.0028, 0xff7a1a, hx, front - 0.0024, 0.00345));
  out.push(...chimney(0.0028, rh + b.h - 0.0034 + 0.003, 0.0028, 0x8a7a6a, { x: hx, y: 0.0034, z: front - 0.004 }, 0x3a3430));
  // The bellows beside it, leather and wood.
  out.push(P(new THREE.ConeGeometry(0.0024, 0.006, 4).rotateZ(Math.PI / 2), 0x5a3a24, { x: hx + 0.0062, y: 0.0032, z: front - 0.0022, sy: 0.5 }));
  // The anvil on its stump, out on the floor; a quench tub.
  out.push(...anvil(0.0026, { x: b.x + b.w * 0.08, z: front + ext * 0.45 }), cyl(0.0014, 0.0014, 0.0018, 7, 0x6a5038, { x: b.x - b.w * 0.36, z: front + ext * 0.55 }));
  // The shoeing frame: four posts, two rails, out in the yard.
  const fx = b.x + b.w * 0.18, fz = front + ext + Math.min(0.009, (l.ld - front - ext) * 0.5);
  for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0008, 0.0068, 0.0008, 0x6a5038, { x: fx + a * 0.0058, z: fz + c * 0.0022 }));
  for (const c of [-1, 1]) out.push(...box(0.0124, 0.0006, 0.0006, 0x6a5038, { x: fx, y: 0.0052, z: fz + c * 0.0022 }));
  // Wheels leaned on the wall, a heap of charcoal.
  for (const k of [0, 1]) out.push(P(new THREE.TorusGeometry(0.0034, 0.00035, 3, 10), 0x5a4232, { x: b.x + b.w / 2 + 0.0008 + k * 0.0009, y: 0.0034, z: b.z - b.d * 0.15 + k * 0.004, ry: Math.PI / 2, rz: 0.15 }));
  out.push(cone(0.0042, 0.0034, 6, 0x2a2826, { x: -l.lw * 0.66, z: front + ext + 0.006 }));
  out.push(...birch(l.lw * 0.72, l.ld * 0.76, 0.9), ...birch(-l.lw * 0.74, -l.ld * 0.78, 1));
  return out;
};

// ---------- Vikings (longhouse) ----------
// Plank and stave walls under thick turf roofs, crossed bargeboards
// curling into dragon heads; the market booths of Hedeby and Birka with
// their furs and amber, the stockfish racks of the north, the boat sheds
// where the ships were built.
const LO_WOOD = [0x7b5a3c, 0x6e5034, 0x86643f], LO_TURF = [0x6f8f3e, 0x7a9a48, 0x66853a], LO_DARK = 0x2a2018, LO_TAR = 0x3d2b1e;
// A turf-roofed timber building, its ridge along x: low plank walls, the turf roof, its ridge, dragon heads at the gables.
function turfHall(b: Body, wood: number, turf: number, rh: number, out: G[], heads = true): void {
  out.push(...box(b.w, b.h, b.d, wood, { x: b.x, z: b.z }));
  out.push(...strips(b, 'front', 0, b.h, 0.0004, 0.003, shade(wood, 0.72)));
  const ry = b.h + rh;
  out.push(...gable(b.w + 0.006, b.d + 0.006, rh, turf, { x: b.x, y: b.h, z: b.z }, false, wood));
  out.push(...box(b.w + 0.004, 0.0016, 0.003, shade(turf, 0.85), { x: b.x, y: ry - 0.001, z: b.z }));
  if (heads) for (const e of [-1, 1]) out.push(cone(0.0009, 0.0045, 4, LO_TAR, { x: b.x + e * (b.w / 2 + 0.003), y: ry - 0.0012, z: b.z, rz: -e * 0.7 }));
}
// A ship's hull: a half-shell long along x (len × beam, depth deep), stem and stern posts curling up, on y = o.y.
function hull(len: number, beam: number, depth: number, c: number, o: { x: number; y?: number; z: number; ry?: number }): G[] {
  const y = (o.y ?? 0) + depth, ry = o.ry ?? 0, cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (lx: number, ly: number) => V3(o.x + lx * cs, y + ly, o.z - lx * sn);
  const out: G[] = [P(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), c, { x: o.x, y, z: o.z, sx: len / 2, sy: depth, sz: beam / 2, ry })];
  for (const e of [-1, 1]) {
    const p0 = at(e * len * 0.46, -depth * 0.3), p1 = at(e * len * 0.53, depth * 0.6), p2 = at(e * len * 0.5, depth * 1.3);
    out.push(seg(p0, p1, 0.0005, 0.00045, 4, c), seg(p1, p2, 0.00045, 0.0003, 4, c));
  }
  return out;
}
// A market booth at a trading town (Hedeby, Birka, Kaupang): a little
// plank house open along its front under the turf eave, on posts; furs
// on a rail before it, ermine, fox, wolf and squirrel; amber beads and
// walrus ivory laid out on a trestle; a merchant's folding scale.
const kaupang: Build = (l) => {
  const wood = pick(l, LO_WOOD), turf = pick(l, LO_TURF);
  const b0 = place(l, 0.72, 0.34, Math.max(l.ld * 0.62, 0.016)), b = { ...b0, h: b0.h * (l.floors > 1 ? 0.48 : 0.6) }, out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x7d9a55, 0x8a7a5a, 0.008));
  out.push(patch(2 * l.lw * 0.9, l.ld - front, 0x9a8a6a, 0, front + (l.ld - front) / 2, 0.0004)); // the trodden market ground
  const rh = Math.min(b.w, b.d) * 0.5 + (l.floors > 1 ? 0.005 : 0);
  turfHall(b, wood, turf, rh, out);
  // The open front, dark within, its shutter boards stacked aside.
  out.push(onFace(b, 'front', -b.w * 0.08, 0, b.w * 0.62, b.h * 0.8, LO_DARK, E * 2));
  for (let i = 0; i < 3; i++) out.push(onFace(b, 'front', b.w * 0.27 + i * 0.0007, 0, 0.0006, b.h * 0.76, i % 2 ? shade(wood, 0.8) : wood, E * 3));
  // The trestle out front: amber in a heap of beads, walrus ivory, a little scale.
  const tz = front + 0.0034, tx = b.x - b.w * 0.12;
  out.push(...box(b.w * 0.46, 0.0028, 0.0026, shade(wood, 0.9), { x: tx, z: tz }));
  for (let i = 0; i < 6; i++) out.push(leaves(0.00055, i % 2 ? 0xe09020 : 0xc87018, { x: tx - b.w * 0.16 + i * 0.0013, y: 0.0031, z: tz + (i % 2) * 0.0005 - 0.0002 }));
  out.push(...box(0.0034, 0.0006, 0.0008, 0xeee6d2, { x: tx + b.w * 0.08, y: 0.0028, z: tz }));
  out.push(cyl(0.0001, 0.0001, 0.0024, 3, 0xb08a40, { x: tx + b.w * 0.16, y: 0.0028, z: tz }), ...box(0.0026, 0.0002, 0.0002, 0xb08a40, { x: tx + b.w * 0.16, y: 0.0052, z: tz }));
  // The furs on a rail by the street: ermine, fox, wolf, squirrel, bear.
  const fz = Math.min(l.ld - 0.003, tz + 0.0075), fx = b.x + b.w * 0.18, furs = [0xf0ece0, 0xb05a24, 0x8a8a84, 0x6a4a30, 0x4a3426];
  const fw = Math.min(0.016, b.w * 0.7), nf = Math.max(3, Math.min(5, Math.floor(fw / 0.0029)));
  out.push(...box(0.0004, 0.0074, 0.0004, LO_TAR, { x: fx - fw / 2, z: fz }), ...box(0.0004, 0.0074, 0.0004, LO_TAR, { x: fx + fw / 2, z: fz }), ...box(fw + 0.0006, 0.0004, 0.0004, LO_TAR, { x: fx, y: 0.0072, z: fz }));
  for (let i = 0; i < nf; i++) out.push(P(new THREE.PlaneGeometry(0.0023, 0.0052 - (i % 2) * 0.001).translate(0, -0.0026, 0), furs[(i + l.v) % furs.length]!, { x: fx - fw / 2 + (i + 0.5) * (fw / nf), y: 0.007, z: fz + 0.0003 }));
  out.push(...barrels(2, 0.0012, 0x6a5038, { x: b.x + b.w / 2 - 0.002, z: front + 0.0022 }));
  out.push(...fence(l, 0.003, 0x7a6248, 0.012));
  return out;
};
// A stockfish trader's: the cod of the north hung in pairs on tall racks
// (hjell) to dry hard in the wind, the trade that fed the ships; a tarred
// plank storehouse under its turf, barrels of salt herring and train oil
// at its door.
const hjell: Build = (l) => {
  const wood = pick(l, LO_WOOD), turf = pick(l, LO_TURF);
  const b0 = place(l, 0.5, 0.44, l.ld * 1.04), b = { ...b0, x: -l.lw * 0.96 + b0.w / 2 + 0.0045, h: b0.h * (l.floors > 1 ? 0.55 : 0.68) }, out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a9a62), patch(2 * l.lw * 0.9, l.ld * 1.0, 0x9a8a6a, 0, l.ld * 0.45, 0.0005));
  const rh = Math.min(b.w, b.d) * 0.55 + (l.floors > 1 ? 0.006 : 0);
  turfHall(b, LO_TAR, turf, rh, out);
  out.push(...doubleDoor(b, 'front', 0, 0.0064, Math.min(0.0085, b.h * 0.85), wood, LO_DARK));
  out.push(...barrels(3, 0.0013, 0x6a5038, { x: b.x + b.w / 2 + 0.0038, z: b.z + b.d / 2 - 0.002 }));
  // The racks: A-frames of poles, rails across, cod hung in pairs over them.
  const rw = Math.min(2 * l.lw * 0.86, 0.04), rh2 = l.floors > 1 ? 0.0135 : 0.0115, fish = 0xa8a090;
  const nRows = l.ld > 0.03 ? 2 : 1;
  for (let r = 0; r < nRows; r++) {
    const z = l.ld * 0.62 - r * 0.012, x0 = l.lw * 0.98 - rw / 2 - 0.0005;
    const n = Math.max(2, Math.min(4, Math.floor(rw / 0.011)));
    for (let i = 0; i <= n; i++) {
      const x = x0 - rw / 2 + (i * rw) / n;
      for (const k of [-1, 1]) out.push(seg(V3(x, 0, z + k * 0.0028), V3(x, rh2, z), 0.00025, 0.0002, 3, 0x6a5a48));
    }
    for (const yy of [rh2 - 0.0002, rh2 * 0.6]) out.push(cyl(0.0002, 0.0002, rw, 3, 0x6a5a48, { x: x0 + rw / 2, y: yy, z, rz: Math.PI / 2 }));
    // The fish: pale grey-gold pairs hanging both sides of the top rail.
    const nf = Math.max(6, Math.min(14, Math.floor(rw / 0.0028)));
    for (let i = 0; i < nf; i++) {
      const x = x0 - rw / 2 + 0.0015 + (i * (rw - 0.003)) / (nf - 1);
      for (const k of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.0011, 0.0042), i % 3 ? fish : 0xc0b090, { x, y: rh2 - 0.0023, z: z + k * 0.0004, rx: k * 0.25 }));
    }
  }
  out.push(...fence(l, 0.003, 0x7a6248, 0.009));
  return out;
};
// A naust and shipyard: the boat shed, long and low, stone and turf walls
// under a turf roof, its gable open to the water; beside it a ship on
// the stocks, her clinker strakes up, her stem curling high; oak logs
// for the strakes and a steaming fire to bend them; tar boiling.
const naust: Build = (l) => {
  const wood = pick(l, LO_WOOD), turf = pick(l, LO_TURF), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a9a62), patch(2 * l.lw * 0.92, 2 * l.ld * 0.9, 0x9a8a6a, 0, 0, 0.0005));
  // The shed along the left of the lot, its ridge along z, its open gable to the street.
  const sw = Math.min(0.016, l.lw * 0.66), sd = Math.min(2 * l.ld * 0.84, 0.05), sx = -l.lw * 0.96 + sw / 2, sz = l.ld * 0.92 - sd / 2;
  const s: Body = { x: sx, z: sz, w: sw, d: sd, y: 0, h: 0.0045 };
  out.push(...box(sw, s.h, sd, 0x8a8478, { x: sx, z: sz }));
  const rh = sw * 0.62;
  out.push(...gable(sw + 0.005, sd + 0.002, rh, turf, { x: sx, y: s.h, z: sz }, true, wood));
  out.push(onFace({ ...s, d: sd + 0.002 }, 'front', 0, 0, sw * 0.7, s.h + rh * 0.55, LO_DARK, E * 2));
  // A boat's stern inside, glimpsed.
  out.push(...hull(Math.min(0.02, sd * 0.6), sw * 0.42, 0.0022, shade(wood, 0.8), { x: sx, z: sz + sd * 0.12, ry: Math.PI / 2 }));
  // The ship on the stocks: beside the shed, her keel along z, props under her.
  const hx = Math.min(l.lw * 0.32, l.lw - 0.006), hl = Math.min(2 * l.ld * 0.82, 0.05), hb = Math.min(0.0085, l.lw * 0.42);
  for (const k of [-0.3, 0, 0.3]) out.push(...box(hb * 0.9, 0.0012, 0.0012, 0x6a5a48, { x: hx, z: k * hl }));
  out.push(...hull(hl, hb, 0.0034, 0x8a6a44, { x: hx, y: 0.0012, z: 0, ry: Math.PI / 2 }));
  for (const k of [-1, 1]) for (const t of [-0.25, 0.1]) out.push(seg(V3(hx + k * hb * 0.75, 0, t * hl), V3(hx + k * hb * 0.42, 0.0034, t * hl), 0.0002, 0.0002, 3, 0x6a5a48)); // props
  // Oak logs waiting, the tar pot on its fire.
  out.push(...logs(4, 0.014, 0.0009, 0x7a5a38, { x: hx, z: -l.ld * 0.82 }));
  out.push(cyl(0.0013, 0.0011, 0.0018, 6, 0x2a2420, { x: l.lw * 0.86, z: l.ld * 0.82 }), ...puff(0.0014, { x: l.lw * 0.86, y: 0.0034, z: l.ld * 0.82 }));
  return out;
};

// ---------- Germans (fachwerk) ----------
// Oak frames with limewashed infill, jettied upper floors, steep red
// roofs gable to the street. The town's inn under its iron sign, the
// merchant's house over its arcade with the hoist in its gable, the
// tanners' tall houses with their open drying lofts by the stream.
const FW_INFILL = [0xf1ece0, 0xeee2c8, 0xe8dcc0], FW_OAK = [0x4a3426, 0x3e2c20, 0x5a3a28], FW_ROOF = [0xa8452f, 0x9a3e2c, 0xb45236];
const FW_GLASS = 0x2e2a28, FW_IRON = 0x1e1c1a;
// A storey of half-timbering: the infill box, posts, sill and head rails, a brace at each end of each seen face.
function fwStorey(p: Body, infill: number, oak: number, out: G[], faces: readonly Face[] = SEEN): void {
  out.push(...box(p.w, p.h, p.d, infill, { x: p.x, y: p.y, z: p.z }));
  for (const f of faces) {
    const fw = faceWidth(p, f);
    out.push(...strips(p, f, p.y, p.h, 0.0009, 0.0075, oak));
    out.push(onFace(p, f, 0, p.y, fw, 0.0009, oak, BAND), onFace(p, f, 0, p.y + p.h - 0.0009, fw, 0.0009, oak, BAND));
    for (const sx of [-1, 1]) out.push(tilted(p, f, sx * (fw / 2 - 0.0028), p.y + p.h / 2, 0.0008, p.h * 0.8, sx * 0.55, oak, E * 2));
  }
}
// The steep roof, gable to the street, its gable's king post and collar.
function fwRoof(top: Body, roof: number, infill: number, oak: number, out: G[]): number {
  const rh = Math.min(top.w * 0.85, 0.03), y = top.y + top.h;
  out.push(...gable(top.w + 0.004, top.d + 0.004, rh, roof, { x: top.x, y, z: top.z }, true, infill));
  out.push(onFace(top, 'front', 0, y, 0.0009, rh * 0.8, oak, 0.0021), onFace(top, 'front', 0, y + rh * 0.3, top.w * 0.55, 0.0009, oak, 0.0021));
  return rh;
}
// A Gasthaus: the inn. Its iron sign hung out on a scrolled bracket (an
// Ausleger), a gilded bunch of grapes on it; a bay window (Erker) out
// over the street on the upper floor; the cellar's arched door with the
// barrel-ramp before it; a long table and benches under a linden tree.
const gasthaus: Build = (l) => {
  const infill = pick(l, FW_INFILL), oak = pick(l, FW_OAK), roof = pick(l, FW_ROOF), s = storeys(l, 0.1);
  const b = place(l, 0.7, 0.56, l.ld * 0.3), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x7d9a55, 0x9a9488, 0.008));
  const g0 = l.floors > 1 ? s.base + s.storey : b.h, parts: Body[] = [{ ...b, h: g0 }];
  if (l.floors > 1) parts.push({ ...b, w: b.w + 0.002, d: b.d + 0.002, y: g0, h: b.h - g0 });
  for (const p of parts) fwStorey(p, infill, oak, out);
  const top = parts[parts.length - 1]!;
  fwRoof(top, roof, infill, oak, out);
  // The door and windows of the parlour; the cellar door low at the side, its ramp.
  out.push(...arch(b, 'front', -b.w * 0.24, 0, 0.0048, Math.min(0.0068, s.storey * 0.55), 0x6b3a24, false, E * 3));
  for (const k of [0.04, 0.3]) out.push(onFace(b, 'front', k * b.w, s.base + s.storey * 0.3, 0.0034, s.storey * 0.36, FW_GLASS, E * 3), onFace(b, 'front', k * b.w, s.base + s.storey * 0.3 + s.storey * 0.17, 0.0034, 0.0004, oak, E * 4));
  out.push(...arch(b, 'left', b.d * 0.18, 0, 0.0052, 0.0028, 0x3a2a20, false, E * 3));
  out.push(...box(0.0036, 0.0008, 0.0056, 0x8a8478, { x: b.x - b.w / 2 - 0.0018, z: b.z + b.d * 0.18 }));
  if (l.floors > 1) {
    // The Erker: a boxed bay on the upper floor's front, its own little hipped roof.
    const ew = Math.min(0.012, top.w * 0.4), ex = b.x + b.w * 0.18, ey = g0 + 0.0012, eh = top.h * 0.62;
    const er: Body = { x: ex, z: front + 0.001 + 0.0018, w: ew, d: 0.0036, y: ey, h: eh };
    out.push(...box(ew, eh, 0.0036, infill, { x: ex, y: ey, z: er.z }), ...box(ew + 0.0004, 0.0012, 0.004, oak, { x: ex, y: ey - 0.0012, z: er.z }));
    out.push(onFace(er, 'front', 0, ey + eh * 0.3, ew * 0.8, eh * 0.45, FW_GLASS), onFace(er, 'front', 0, ey + eh * 0.52, ew * 0.8, 0.0004, oak, E * 2));
    out.push(hip(ew + 0.0012, 0.0048, 0.0024, roof, { x: ex, y: ey + eh, z: er.z }));
    out.push(...windows(top, 'front', { ...s, floors: 1, base: g0, w: 0.0026, h: s.storey * 0.36, spacing: 0.011, sill: s.storey * 0.3, color: FW_GLASS }).filter((_, i) => i === 0));
  }
  for (const f of ['left', 'right'] as Face[]) out.push(...windows({ ...top, y: 0 }, f, { ...s, w: 0.0026, h: s.storey * 0.36, spacing: 0.012, sill: s.storey * 0.32, color: FW_GLASS }));
  // The sign: an iron bracket out from the corner post, a gilded bunch of grapes in a ring hung from it.
  const sx = b.x - b.w * 0.42, sy = Math.min(g0 - 0.001, 0.0118);
  out.push(...box(0.0003, 0.0003, 0.0072, FW_IRON, { x: sx, y: sy, z: front + 0.0036 }), seg(V3(sx, sy - 0.003, front + 0.0002), V3(sx, sy, front + 0.004), 0.00015, 0.00015, 3, FW_IRON));
  out.push(P(new THREE.TorusGeometry(0.0021, 0.00025, 3, 10), FW_IRON, { x: sx, y: sy - 0.0026, z: front + 0.0058, ry: Math.PI / 2 }));
  out.push(P(new THREE.ConeGeometry(0.0012, 0.0024, 5).rotateX(Math.PI), 0xd8a830, { x: sx, y: sy - 0.0026, z: front + 0.0058 }));
  // The table and benches out front, a linden over them; barrels by the wall.
  const tz = Math.min(front + 0.0075, l.ld - 0.0035), tx = b.x + b.w * 0.16;
  out.push(...box(0.011, 0.0028, 0.0026, 0x7a5a3a, { x: tx, z: tz }, 0x8a6a48));
  for (const k of [-1, 1]) out.push(...box(0.011, 0.0016, 0.0011, 0x6a4a30, { x: tx, z: tz + k * 0.0024 }));
  out.push(...barrels(2, 0.0013, 0x7a5a3a, { x: b.x + b.w / 2 - 0.0016, z: front + 0.0016 }));
  out.push(...tree(-l.lw * 0.7, l.ld * 0.66, 1.05, 0x5a7a3a), ...tree(l.lw * 0.62, -l.ld * 0.7, 0.85, 0x4f6e38));
  return out;
};
// A Kaufmannshaus: a merchant's house. Its ground floor an open arcade
// (a Laube) of oak posts and braces, cloth and wares under it out of the
// rain; the upper floor jettied over it; in the gable the hoist beam, a
// rope and a sack going up to the lofts where the stock was kept.
const kaufhaus: Build = (l) => {
  const infill = pick(l, FW_INFILL), oak = pick(l, FW_OAK), roof = pick(l, FW_ROOF), s = storeys(l, 0.1);
  const b = place(l, 0.74, 0.6, Math.max(l.ld * 0.16, 0.0066)), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x7d9a55, 0x9a9488, 0.008));
  // The arcade: a ground storey set back under the jettied floor above, posts at the front edge.
  const g0 = l.floors > 1 ? s.base + s.storey : b.h * 0.56, ad = 0.0062;
  const inner: Body = { ...b, d: b.d - ad, z: b.z - ad / 2, h: g0 };
  out.push(...box(inner.w, g0, inner.d, shade(infill, 0.92), { x: inner.x, z: inner.z }));
  out.push(...doubleDoor(inner, 'front', -b.w * 0.2, 0.0056, Math.min(0.0078, g0 * 0.7), 0x6b3a24, oak));
  out.push(onFace(inner, 'front', b.w * 0.22, g0 * 0.3, 0.0068, g0 * 0.36, FW_GLASS, E * 2));
  const n = Math.max(2, Math.min(4, Math.round(b.w / 0.012)));
  for (let i = 0; i <= n; i++) {
    const x = b.x - b.w / 2 + 0.0006 + (i * (b.w - 0.0012)) / n;
    out.push(...box(0.0012, g0, 0.0012, oak, { x, z: front - 0.0006 }));
    for (const k of [-1, 1]) if ((i > 0 || k > 0) && (i < n || k < 0)) out.push(seg(V3(x + k * 0.0004, g0 * 0.72, front - 0.0006), V3(x + k * 0.0032, g0 - 0.0002, front - 0.0006), 0.0003, 0.0003, 3, oak));
  }
  out.push(...box(b.w, 0.0012, 0.0014, oak, { x: b.x, y: g0 - 0.0012, z: front - 0.0007 })); // the bressummer
  // Wares under the arcade: bolts of cloth on a table, a chest, a stack of crates.
  out.push(...box(0.0074, 0.0026, 0.0026, 0x6a4a30, { x: b.x + b.w * 0.22, z: front - ad * 0.45 }));
  [0x8a2a2a, 0x2a3a6a, 0x3a5a2a, 0xd8c8a0].forEach((c, i) => out.push(cyl(0.0006, 0.0006, 0.0022, 5, c, { x: b.x + b.w * 0.22 - 0.0025 + i * 0.0017, y: 0.0032, z: front - ad * 0.45 - 0.0011, rx: Math.PI / 2 })));
  out.push(...crates(4, 0.0022, 0x8a6a44, { x: b.x - b.w * 0.36, z: front - ad * 0.4 }));
  // The upper floors, jettied out to the arcade's front.
  const up: Body = { ...b, w: b.w + 0.002, d: b.d + 0.002, y: g0, h: b.h - g0 };
  fwStorey(up, infill, oak, out);
  out.push(...windows({ ...up, y: 0 }, 'front', { ...s, floors: Math.max(1, l.floors - 1), base: g0 - (l.floors > 1 ? s.base + s.storey : 0) + (l.floors > 1 ? s.storey : 0), w: 0.0026, h: s.storey * 0.36, spacing: 0.0095, sill: s.storey * (l.floors > 1 ? 0.3 : 0.12), color: FW_GLASS }));
  const rh = fwRoof(up, roof, infill, oak, out);
  // The hoist: a beam out of the gable under the ridge, its rope, a sack on its way up; the loading door under it.
  const hy = b.h + rh * 0.62, hz = front + 0.001;
  out.push(onFace(up, 'front', 0, b.h + rh * 0.12, 0.0036, rh * 0.36, 0x6b3a24, 0.0024));
  out.push(...box(0.0009, 0.0009, 0.0062, oak, { x: b.x, y: hy, z: hz + 0.0026 }));
  out.push(cyl(0.0001, 0.0001, hy - g0 * 0.6, 3, 0xc8b890, { x: b.x, y: g0 * 0.6, z: hz + 0.0052 }), P(new THREE.OctahedronGeometry(0.0016, 0), 0xd8c8a0, { x: b.x, y: g0 * 0.6 - 0.0012, z: hz + 0.0052, sy: 1.2 }));
  out.push(...tree(l.lw * 0.62, -l.ld * 0.7, 0.85, 0x4f6e38));
  return out;
};
// A Gerberhaus: a tanners' works by the stream. The house tall and narrow,
// its upper storeys and the roof's gable opened in slatted galleries where
// the hides hung to dry in the draught; below, tanning pits and vats in
// the yard, hides stretched on frames, a heap of oak bark for the tannin,
// the stream along the back.
const gerberhaus: Build = (l) => {
  const infill = pick(l, FW_INFILL), oak = pick(l, FW_OAK), roof = pick(l, FW_ROOF), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x7d9a55), patch(2 * l.lw * 0.98, Math.min(0.008, l.ld * 0.3), 0x4a7a9a, 0, -l.ld * 0.98 + Math.min(0.008, l.ld * 0.3) / 2, 0.0006));
  const b0 = place(l, 0.5, 0.46, l.ld * 0.98), b = { ...b0, x: -l.lw * 0.94 + b0.w / 2, z: Math.min(b0.z, -l.ld * 0.98 + Math.min(0.008, l.ld * 0.3) + 0.002 + b0.d / 2), h: wallHeight(l.floors > 1 ? 2 : 1) * 1.15 };
  const front = b.z + b.d / 2, g0 = wallHeight(1) * 0.62;
  out.push(patch(2 * l.lw * 0.9, l.ld * 0.98 - front + l.ld * 0.0, 0x9a8a6a, 0, (front + l.ld * 0.98) / 2, 0.0005));
  fwStorey({ ...b, h: g0 }, infill, oak, out);
  out.push(...doubleDoor({ ...b, h: g0 }, 'front', 0, 0.0058, Math.min(0.0078, g0 * 0.82), 0x6b3a24, oak, E * 3));
  // The drying lofts: a dark open storey behind horizontal slats, jettied, under the roof.
  const up: Body = { ...b, w: b.w + 0.002, d: b.d + 0.002, y: g0, h: b.h - g0 };
  out.push(...box(up.w, up.h, up.d, 0x2a2420, { x: up.x, y: up.y, z: up.z }));
  for (const f of SEEN) {
    const fw = faceWidth(up, f);
    for (let y = up.y + 0.0012; y < up.y + up.h - 0.0006; y += 0.0016) out.push(onFace(up, f, 0, y, fw, 0.0007, 0x8a6a48, E));
    out.push(...strips(up, f, up.y, up.h, 0.0011, 0.0075, oak, E * 2));
  }
  // Hides hung inside, glimpsed between the slats.
  for (let i = 0; i < 3; i++) out.push(onFace(up, 'front', -up.w * 0.3 + i * up.w * 0.3, up.y + up.h * 0.25, up.w * 0.18, up.h * 0.5, 0xb89070, E * 0.5));
  const rh = Math.min(up.w * 0.9, 0.032);
  out.push(...gable(up.w + 0.004, up.d + 0.004, rh, roof, { x: up.x, y: b.h, z: up.z }, true, 0x2a2420));
  for (let y = b.h + 0.0012; y < b.h + rh * 0.7; y += 0.0016) {
    const w = (up.w + 0.004) * (1 - (y - b.h) / rh) - 0.002;
    out.push(onFace({ ...up, d: up.d + 0.004 }, 'front', 0, y, w, 0.0007, 0x8a6a48, E));
  }
  // The yard: vats (oak tubs, the liquor dark), hides on stretching frames, the bark heap.
  const vx = l.lw * 0.4, vz = front + 0.004;
  for (const [dx, dz] of [[-0.0034, 0], [0.0034, 0], [0, 0.0062]] as const) out.push(...drum(0.0026, 0.0028, 0.0024, 8, 0x6a5038, { x: vx + dx, z: vz + dz }, 0x3a2a1e));
  for (let i = 0; i < 2; i++) {
    const fx = -l.lw * 0.5 + i * 0.008, fz = Math.min(l.ld * 0.8, front + 0.012);
    out.push(...box(0.0068, 0.0004, 0.0004, oak, { x: fx, y: 0.0068, z: fz }), ...box(0.0004, 0.0068, 0.0004, oak, { x: fx - 0.0032, z: fz }), ...box(0.0004, 0.0068, 0.0004, oak, { x: fx + 0.0032, z: fz }));
    out.push(P(new THREE.CircleGeometry(0.0028, 6), i ? 0xc8a07a : 0xb08868, { x: fx, y: 0.004, z: fz + 0.0003, sy: 1.15 }));
  }
  out.push(cone(0.0042, 0.003, 6, 0x6a4a30, { x: l.lw * 0.62, z: -l.ld * 0.3 }));
  return out;
};

// ---------- French (slate) ----------
// Breton granite under steep slate roofs, painted shutters, chimneys on
// the gables. The linen merchants of Locronan, the market under the great
// roof of the halles, the paludiers' salt pans on the coast.
const SL_GRANITE = [0xa9a59c, 0x9e9a90, 0xb4afa4], SL_SLATE = [0x4f5a66, 0x47515c, 0x58626e], SL_SHUTTER = [0x4f78a8, 0x3a6a5a, 0x8a3a3a];
const SL_GLASS = 0x2a3038, SL_FREESTONE = 0xc8c2b6, SL_OAK = 0x5a4232;
// A linen merchant's house (Locronan, Quintin): the trade in sailcloth
// and fine linen built these granite fronts. Two great round arches on the
// ground floor in dressed stone, the shop window and the door; bolts of
// linen, white and unbleached, on a trestle; a sign with a weaver's
// shuttle; a dormer over the street; chimneys on both gables.
const toilier: Build = (l) => {
  const granite = pick(l, SL_GRANITE), slate = pick(l, SL_SLATE), shutter = pick(l, SL_SHUTTER), s = storeys(l, 0.12);
  const b = place(l, 0.78, 0.5, l.ld * 0.3), out: G[] = [], front = b.z + b.d / 2;
  out.push(...yard(l, b, 0x7d9a55, 0xb0a890, 0.008));
  out.push(...box(b.w, b.h, b.d, granite, { x: b.x, z: b.z }));
  for (const [x, z] of [[-1, 1], [1, 1]] as const) out.push(...box(0.0018, b.h - 0.0002, 0.0018, SL_FREESTONE, { x: b.x + x * b.w / 2, z: b.z + z * b.d / 2 }));
  // The arches: dressed stone round each, dark within; the shop window's sill board with linen on it.
  const r = Math.min(0.0042, b.w * 0.14), ah = Math.min(s.storey * 0.4, 0.0062);
  for (const [k, dark] of [[-0.24, 0x6b4a2e], [0.2, SL_GLASS]] as const) {
    out.push(...arch(b, 'front', k * b.w, 0, r * 2 + 0.0016, ah, SL_FREESTONE, false, E));
    out.push(...arch(b, 'front', k * b.w, 0, r * 2, ah - 0.0004, dark, false, E * 2));
  }
  out.push(...arch(b, 'front', -0.24 * b.w, 0, r * 1.2, ah - 0.0012, shutter, false, E * 3)); // the door, painted
  // The upper windows with shutters; a dormer.
  if (l.floors > 1) out.push(...windows(b, 'front', { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.003, h: s.storey * 0.45, spacing: 0.01, sill: s.storey * 0.3, color: SL_GLASS, frame: 0xd8d2c4, shutter }));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0026, h: s.storey * 0.4, spacing: 0.013, sill: s.storey * 0.32, color: SL_GLASS }));
  const rh = Math.min(b.w, b.d) * 0.78;
  out.push(...gable(b.w + 0.003, b.d + 0.004, rh, slate, { x: b.x, y: b.h, z: b.z }, false, granite));
  for (const sx of [-1, 1]) out.push(...chimney(0.0042, rh + 0.004, 0.003, granite, { x: b.x + sx * (b.w / 2 - 0.0016), y: b.h, z: b.z }));
  const zd = b.z + b.d * 0.28, yd = b.h + rh * (1 - 0.56) - 0.0008, db: Body = { x: b.x, z: zd - 0.0018, w: 0.0052, d: 0.0036, y: yd, h: 0.0046 };
  out.push(...box(db.w, db.h, db.d, granite, { x: db.x, y: yd, z: db.z }), onFace(db, 'front', 0, yd + 0.0008, 0.0028, 0.003, SL_GLASS));
  out.push(...gable(0.0064, 0.0046, 0.0026, slate, { x: db.x, y: yd + db.h, z: db.z }, true, granite));
  // The trestle of linen before the window: bolts laid across, white, ecru, blue-striped ticking.
  const tx = b.x + 0.2 * b.w, tz = front + 0.0026;
  out.push(...box(0.0094, 0.0026, 0.0026, SL_OAK, { x: tx, z: tz }));
  [0xf2eee4, 0xd8cdb0, 0xe8e2d2, 0x8aa0c0, 0xf2eee4].forEach((c, i) => out.push(cyl(0.0006, 0.0006, 0.0024, 5, c, { x: tx - 0.0034 + i * 0.0017, y: 0.0032, z: tz - 0.0012, rx: Math.PI / 2 })));
  out.push(...box(0.008, 0.0013, 0.0022, 0xe8e2d2, { x: tx, y: 0.0026, z: tz - 0.0001 + 0.00003 }));
  // The sign: a board with a shuttle painted on it, on an iron bracket.
  const sy = Math.min(s.storey * 0.82, 0.0122);
  out.push(...hangingSign(0.0036, 0.0026, shutter, 0x1e1c1a, { x: b.x - b.w * 0.44, y: sy, z: front }));
  out.push(...fence(l, 0.003, granite, 0.012), ...tree(-l.lw * 0.64, -l.ld * 0.7, 0.9, 0x5e7a44));
  return out;
};
// Les halles: the market hall, a vast slate roof brought down nearly to
// the ground on oak posts set on granite blocks, open all round, as in
// Questembert or Le Faouët; under it the stalls of the market day: fish
// laid on wet slabs, baskets of apples and artichokes, butter and eggs,
// a stack of crates and baskets at the end.
const halles: Build = (l) => {
  const slate = pick(l, SL_SLATE), granite = pick(l, SL_GRANITE), out: G[] = [];
  const b = place(l, 0.9, 0.56, Math.max(l.ld * 0.46, 0.0145)), h = wallHeight(1) * (l.floors > 1 ? 0.48 : 0.38);
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x9a9488), patch(b.w + 0.004, b.d + 0.004, 0x8a847a, b.x, b.z, 0.0005));
  // The posts on their granite blocks, in rows.
  const nx = Math.max(3, Math.min(5, Math.round(b.w / 0.012) + 1)), nz = Math.max(2, Math.min(3, Math.round(b.d / 0.013) + 1));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
    const x = b.x - b.w / 2 + (i * b.w) / (nx - 1), z = b.z - b.d / 2 + (j * b.d) / (nz - 1);
    out.push(...box(0.0018, 0.0012, 0.0018, granite, { x, z }), ...box(0.0011, h - 0.0012, 0.0011, SL_OAK, { x, y: 0.0012, z }));
  }
  for (const k of [-1, 1]) out.push(...box(b.w + 0.0014, 0.0011, 0.0012, SL_OAK, { x: b.x, y: h - 0.0011, z: b.z + k * b.d / 2 }));
  // The roof: a great hip of slate, steep, its eaves low.
  const rh = Math.min(b.w, b.d) * 0.62;
  out.push(hip(b.w + 0.009, b.d + 0.009, rh, slate, { x: b.x, y: h, z: b.z }));
  out.push(...box(0.0024, 0.0026, 0.0024, slate, { x: b.x, y: h + rh - 0.0012, z: b.z }), cone(0.0003, 0.004, 4, 0x3a3a3a, { x: b.x, y: h + rh + 0.0014, z: b.z })); // a little lantern and its finial
  // The stalls under it: the fishmonger's slab of fish, the fruit and vegetable baskets.
  const sz = b.z + b.d * 0.22;
  out.push(...box(b.w * 0.36, 0.0026, 0.0034, 0x6a6a6a, { x: b.x - b.w * 0.22, z: sz }, 0x8a9aa0));
  for (let i = 0; i < 5; i++) out.push(P(new THREE.PlaneGeometry(0.0006, 0.0024), 0xc0c8cc, { x: b.x - b.w * 0.22 - b.w * 0.14 + i * b.w * 0.07, y: 0.00265, z: sz, rx: -Math.PI / 2, rz: 0.3 * (i % 2 ? 1 : -1) }));
  const veg = [0xb8302a, 0x5a7a3a, 0xe8d8a0, 0xd88a2a, 0x7a9a4a];
  for (let i = 0; i < 4; i++) out.push(...drum(0.0014, 0.0016, 0.0014, 6, 0x9a7a4a, { x: b.x + b.w * 0.1 + i * 0.0036, z: sz }, veg[(i + l.v) % veg.length]!));
  out.push(...crates(4, 0.0022, 0x8a6a44, { x: b.x + b.w * 0.24, z: b.z - b.d * 0.24 }));
  out.push(...box(0.0074, 0.0024, 0.0026, SL_OAK, { x: b.x - b.w * 0.2, z: b.z - b.d * 0.2 }, 0xf0e8d0)); // butter and eggs
  // The market spilling out before it: stalls under canvas, red and white, a cart of apples.
  const front = b.z + b.d / 2 + 0.0045, sd = Math.min(0.0072, l.ld - front - 0.0012), z = front + sd / 2;
  const canvas = [0xc83a2a, 0xeee6d4, 0x4f78a8];
  for (const [k, i] of [[-0.26, 0], [0.12, 1]] as const) {
    const x = b.x + k * b.w;
    out.push(...stall(Math.min(0.011, b.w * 0.3), sd, 0.0072, canvas[(i + l.v) % canvas.length]!, SL_OAK, { x, z }));
    out.push(...box(Math.min(0.0092, b.w * 0.26), 0.0026, sd * 0.6, SL_OAK, { x, z }));
    for (let j = 0; j < 3; j++) out.push(...drum(0.0011, 0.0013, 0.0011, 6, 0x9a7a4a, { x: x - 0.003 + j * 0.003, y: 0.0026, z }, veg[(j + i * 2) % veg.length]!));
  }
  out.push(...cart(0.0068, 0x7a5a3a, 0x4a3828, { x: b.x + b.w * 0.4, z, ry: Math.PI / 2 }));
  return out;
};
// A salt works of the Guérande marshes: the paludier's pans (oeillets),
// shallow clay basins in a grid fed from the sea, a crust of salt on
// them; the white salt raked up in cones (mulons) on the banks to drain;
// the salt barn (salorge), granite under slate; a barrow and the long rake.
const salorge: Build = (l) => {
  const granite = pick(l, SL_GRANITE), slate = pick(l, SL_SLATE), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0x8a9a6a));
  // The barn at the back, long and low.
  const bw = Math.min(2 * l.lw * 0.7, 0.03), bd = Math.min(l.ld * 0.62, 0.016), b: Body = { x: -l.lw * 0.94 + bw / 2, z: -l.ld * 0.94 + bd / 2, w: bw, d: bd, y: 0, h: wallHeight(1) * 0.55 };
  out.push(...box(b.w, b.h, b.d, granite, { x: b.x, z: b.z }));
  out.push(...doubleDoor(b, 'front', b.w * 0.18, 0.0056, b.h * 0.8, 0x4f78a8, SL_OAK));
  out.push(...gable(b.w + 0.003, b.d + 0.004, b.d * 0.5, slate, { x: b.x, y: b.h, z: b.z }, false, granite));
  // The pans: a grid of grey-blue basins with clay banks between, the brine a little darker in the newest.
  const top = b.z + b.d / 2 + 0.003, pd = l.ld * 0.96 - top, cols = Math.max(2, Math.min(4, Math.floor(2 * l.lw * 0.9 / 0.011))), rows = Math.max(2, Math.min(4, Math.floor(pd / 0.01)));
  const cw = (2 * l.lw * 0.9) / cols, rd = pd / rows;
  out.push(patch(2 * l.lw * 0.92, pd, 0x9a8a72, 0, top + pd / 2, 0.0005));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = -l.lw * 0.9 + (i + 0.5) * cw, z = top + (j + 0.5) * rd;
    out.push(patch(cw - 0.0016, rd - 0.0016, (i + j) % 3 ? 0x9ab0b8 : 0x7a98a8, x, z, 0.0008));
    if ((i + 2 * j) % 3 === 0) out.push(patch(cw * 0.5, rd * 0.4, 0xeef0ec, x, z, 0.0009)); // the crust forming
  }
  // The mulons: cones of salt on the banks.
  for (let i = 0; i < Math.min(3, cols); i++) out.push(cone(0.0024, 0.0034, 7, 0xf4f4ee, { x: -l.lw * 0.9 + (i + 1) * cw - 0.0002, y: 0.0005, z: top + rd - 0.0001 }));
  // A barrow by the barn, the rake leaned on it.
  out.push(...box(0.0034, 0.0014, 0.0024, SL_OAK, { x: b.x + b.w / 2 + 0.004, y: 0.0012, z: b.z + 0.002 }), cyl(0.0008, 0.0008, 0.0004, 6, SL_OAK, { x: b.x + b.w / 2 + 0.0058, y: 0.0008, z: b.z + 0.002, rx: Math.PI / 2 }));
  out.push(seg(V3(b.x + b.w / 2 + 0.0002, 0, b.z - b.d * 0.2), V3(b.x + b.w / 2 + 0.0002, 0.009, b.z - b.d * 0.4), 0.00015, 0.00015, 3, SL_OAK));
  out.push(...box(0.0034, 0.0016, 0.0024, 0xf4f4ee, { x: b.x + b.w / 2 + 0.004, y: 0.0026, z: b.z + 0.002 }));
  return out;
};

export const HOUSES_TRADE = {
  cycladic: { shops: [kapileio, kamara], works: anemomylos },
  andalusian: { shops: [taberna, alcaiceria], works: alfar },
  mesopotamian: { shops: [sabitu, tamkaru], works: brickyard },
  windcatcher: { shops: [hojreh, attari], works: rangraz },
  levantine: { shops: [souk, zakhuchit], works: betBad },
  machiya: { shops: [sakaya, chamise], works: noborigama },
  izba: { shops: [lavka, kalachnaya], works: kuznitsa },
  longhouse: { shops: [kaupang, hjell], works: naust },
  fachwerk: { shops: [gasthaus, kaufhaus], works: gerberhaus },
  slate: { shops: [toilier, halles], works: salorge },
} satisfies Record<string, Trade>;
