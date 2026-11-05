// Shops and works (houses.ts: a style's variants 3 and 4 are shops, 5 its
// works): insula, neoclassical, renaissance, colonial, mamluk, islamic,
// safavid, tulou, kura. Three-floor streets, roughly 1500 to 1900: each
// drawn after the trades its people kept then, in the materials and
// palette of the style's home (styles/triples.ts, houses.ts FIRST_STYLES).

import * as THREE from 'three';
import { cone, cyl, type Tf } from '../../propCatalog.ts';
import { wallHeight } from '../../town/geometry.ts';
import {
  E, BAND, FRAME, P, arch, bands, box, chimney, dome, smokeFrom, frustum, gable, hip, merlons, onFace, palm, patch, pick, place, ring, storeys, tilted, windows, yard, shade,
  type Body, type Build, type Face, type G, type Trade,
} from '../../houseKit.ts';
import { anvil, awning, cart, counter, crates, doubleDoor, hangingSign, kiln, leanTo, logs, sacks, signBoard, stack, stall, valance } from '../../tradeKit.ts';

// ---------- shared bits ----------

// Positions of n bays along a width, at their middles.
const bays = (w: number, n: number) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * (w / n));
// The top of the ground floor (a shop's storey) on a street of l.floors.
const groundTop = (s: { base: number; storey: number }) => s.base + s.storey;
// An amphora or a tall jar, cheap: a cone up to its shoulder, a taper to its mouth.
const amphora = (r: number, h: number, c: number, o: Tf = {}): G[] => [
  cyl(r * 0.15, r, h * 0.62, 5, c, o), cyl(r, r * 0.3, h * 0.38, 5, c, { ...o, y: (o.y ?? 0) + h * 0.62 }),
];

// Things hung to dry on a frame, along x (turned by o.ry): two posts, a
// rail, the hangings down from it. (tradeKit's dryingRack, its rail
// centred: there it runs from the middle out to one post.)
function rack(w: number, h: number, hung: readonly number[], post: number, o: Tf = {}): G[] {
  const ry = o.ry ?? 0, c = Math.cos(ry), sn = Math.sin(ry), at = (lx: number) => ({ x: (o.x ?? 0) + lx * c, z: (o.z ?? 0) - lx * sn });
  const out: G[] = [cyl(0.00025, 0.00025, h, 4, post, { ...at(-w / 2), y: o.y ?? 0 }), cyl(0.00025, 0.00025, h, 4, post, { ...at(w / 2), y: o.y ?? 0 })];
  out.push(cyl(0.0002, 0.0002, w, 4, post, { ...at(w / 2), y: (o.y ?? 0) + h, rz: Math.PI / 2, ry }));
  const n = hung.length, cw = (w * 0.86) / n;
  for (let i = 0; i < n; i++) out.push(P(new THREE.PlaneGeometry(cw * 0.9, h * 0.74).translate(-w * 0.43 + cw * (i + 0.5), h * 0.62, 0), hung[i]!, { ...o, ry }));
  return out;
}

// A broad shade tree (a plane, a mulberry, an orange), its crown in a few lumps.
function shadeTree(x: number, z: number, s: number, crown: number, trunk = 0x8a7a62): G[] {
  const out: G[] = [cyl(0.0009 * s, 0.0007 * s, 0.009 * s, 5, trunk, { x, z })];
  for (const [dx, dy, dz, r, k] of [[0, 0.0125, 0, 0.0048, 1], [-0.0034, 0.0098, 0.0018, 0.0042, 0.86], [0.0034, 0.0102, -0.0012, 0.0044, 0.93], [0.0004, 0.0094, -0.0034, 0.0038, 0.8], [0.0012, 0.0096, 0.0032, 0.0036, 1.08]] as const)
    out.push(P(new THREE.OctahedronGeometry(r * s, 0), shade(crown, k), { x: x + dx * s, y: dy * s, z: z + dz * s, ry: dx * 300, rx: dz * 200 }));
  return out;
}

// ---------- Roman (insula) ----------
// The brick insulae of Ostia: bare brick, tiled roofs, the tabernae of the
// ground floor under brick arches, timber balconies; the shops and works
// in the same brick (styles/triples.ts insula).
const IN_BRICK = [0xb5653e, 0xa85a38, 0xc07048], IN_ROOF = [0x9c4a2c, 0xa65232, 0x8f4428];
const IN_WOOD = 0x6e4c2a, IN_PLASTER = 0xe0c8a0, IN_TRAV = 0xd8cdb4, IN_DARK = 0x2e211a, IN_RED = 0x9a3a2a;
// A wine shop (taberna vinaria) behind a brick portico, as along Ostia's
// streets: square piers carrying arches out over the pavement, a terrace on
// top with a parapet; the shop's arched doors behind, amphorae leant in a
// rack and heaped by the piers, dolia sunk by the door; a sign hung off the
// end pier; the flats over it.
const vinaria: Build = (l) => {
  const brick = pick(l, IN_BRICK), roof = pick(l, IN_ROOF), s = storeys(l, 0.05), out: G[] = [];
  const pd = 0.0085, b = place(l, 0.9, 0.6, pd + 0.0035), front = b.z + b.d / 2, g1 = groundTop(s);
  out.push(...yard(l, b, 0xb8ae98, 0xc8bca4));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
  out.push(patch(b.w, pd, 0xa89c86, b.x, front + pd / 2, 0.0007)); // the portico's paving
  // The shops' arched doors under the portico.
  const n = Math.max(2, Math.round(b.w / 0.014)), bw = b.w / n;
  for (const a of bays(b.w, n)) out.push(...arch(b, 'front', a, 0, bw * 0.6, g1 * 0.55, IN_DARK), onFace(b, 'front', a, 0, bw * 0.6, g1 * 0.18, IN_WOOD, E * 2));
  // The portico: piers, the arches' brick over them, the terrace on top.
  const ph = g1 - 0.0068, pz = front + pd - 0.0011;
  for (let i = 0; i <= n; i++) out.push(...box(0.0022, ph, 0.0022, brick, { x: b.x - b.w / 2 + 0.0011 + i * ((b.w - 0.0022) / n), z: pz }));
  const beam: Body = { x: b.x, z: pz, w: b.w, d: 0.0022, y: ph, h: g1 - ph };
  out.push(...box(beam.w, beam.h, beam.d, brick, { x: beam.x, y: ph, z: beam.z }));
  for (const a of bays(b.w - 0.0022, n)) {
    // (Each arch's opening a half disc in shadow under the brick.)
    const r = Math.min(0.0054, (b.w - 0.0022) / n / 2 - 0.0011);
    out.push(...arch(beam, 'front', a, ph - 0.0001, r * 2, 0.0001, shade(brick, 0.42), false, E).slice(1));
  }
  out.push(onFace(beam, 'front', 0, g1 - 0.0011, b.w, 0.0007, IN_TRAV, E)); // the travertine cornice
  out.push(...box(b.w + 0.0004, 0.0007, pd - 0.0004, IN_TRAV, { x: b.x, y: g1, z: front + pd / 2 + 0.0002 }, 0xb09a80));
  out.push(...box(b.w - 0.0006, 0.0024, 0.0006, brick, { x: b.x, y: g1 + 0.0007, z: front + pd - 0.0005 }, IN_TRAV));
  // Potted vines and a bay tree on the terrace.
  for (const k of [-0.36, 0.1, 0.38]) out.push(cyl(0.0007, 0.0009, 0.0012, 5, 0xa8583a, { x: b.x + k * b.w, y: g1 + 0.0007, z: front + pd * 0.45 }), dome(0.0013, 0x5e7a3a, { x: b.x + k * b.w, y: g1 + 0.0017, z: front + pd * 0.45, sy: 1.3 }, 5));
  // The wine: amphorae leant in a rack along the shop's front, more heaped at the end pier, two dolia.
  for (let i = 0; i < 6; i++) out.push(...amphora(0.0006, 0.0034, i % 2 ? 0xb5653f : 0xc0784a, { x: b.x - b.w * 0.42 + i * 0.0016, z: front + 0.0012, rx: -0.25 }));
  out.push(...box(0.0105, 0.0004, 0.0006, IN_WOOD, { x: b.x - b.w * 0.42 + 0.004, y: 0.0024, z: front + 0.0004 }));
  for (const [x, z] of [[0, 0], [0.0013, 0.0004], [0.0006, -0.0011]] as const) out.push(...amphora(0.0006, 0.0034, 0xb86a42, { x: b.x + b.w * 0.4 + x, z: front + pd - 0.004 + z, rz: 0.4 }));
  for (const k of [0.12, 0.26]) out.push(cyl(0.0016, 0.0013, 0.0018, 7, 0xa85a3a, { x: b.x + k * b.w, z: front + pd * 0.45 }), cyl(0.0007, 0.0007, 0.00005, 6, 0x3a2418, { x: b.x + k * b.w, y: 0.0018, z: front + pd * 0.45 }));
  out.push(...hangingSign(0.0032, 0.0026, 0xe8d8b8, 0x2a2622, { x: b.x + b.w / 2 - 0.0011, y: ph - 0.0006, z: front + pd }));
  out.push(...signBoard(beam, 'front', -b.w * 0.18, g1 - 0.0034, b.w * 0.3, 0.0016, IN_RED, 0xefe6d6, E * 3));
  // The flats over it: windows framed in plaster, a hipped roof.
  for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: g1, w: 0.0026, h: s.storey * 0.38, spacing: 0.0095, sill: s.storey * 0.36, color: 0x2a2020, frame: IN_PLASTER }));
  out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.2, roof, { x: b.x, y: b.h, z: b.z }));
  return out;
};
// A caupona: an inn and eating house with a garden, after Ostia's Caupona
// del Pavone. The house to one side, its ground floor rendered and painted
// ochre and red, a marble counter in its wide door, a painted sign; beside
// it, behind a low wall, the garden: a vine trained over a pergola, masonry
// dining couches round a table under it, a well; a balcony above.
const caupona: Build = (l) => {
  const brick = pick(l, IN_BRICK), roof = pick(l, IN_ROOF), s = storeys(l, 0.05), out: G[] = [];
  const b0 = place(l, 0.56, 0.66, l.ld * 0.12), b = { ...b0, x: -l.lw + 0.006 + b0.w / 2 }, front = b.z + b.d / 2, g1 = groundTop(s);
  out.push(...yard(l, b, 0xb8ae98, 0xc8bca4));
  out.push(...box(b.w, b.h, b.d, brick, { x: b.x, z: b.z }));
  // The ground floor rendered in ochre, a red dado.
  const gb: Body = { ...b, w: b.w + 0.0008, d: b.d + 0.0008, h: g1 };
  out.push(...box(gb.w, g1, gb.d, 0xd8a85a, { x: b.x, z: b.z }));
  for (const f of ['front', 'right'] as Face[]) out.push(onFace(gb, f, 0, 0, f === 'front' ? gb.w : gb.d, 0.0036, IN_RED, BAND));
  // The wide door, a counter in it, the sign over it, a lamp.
  out.push(onFace(gb, 'front', -b.w * 0.08, 0, b.w * 0.5, g1 * 0.66, IN_DARK, E));
  out.push(...counter(b.w * 0.42, 0.0026, 0.0046, 0xe0dccf, 0xeeeae0, { x: b.x - b.w * 0.08, z: front + 0.0018 }));
  out.push(...signBoard(gb, 'front', -b.w * 0.08, g1 * 0.72, b.w * 0.56, 0.0024, 0xefe2c0, IN_RED));
  out.push(onFace(gb, 'front', b.w * 0.36, g1 * 0.3, 0.0026, 0.0034, 0x3a3028, E));
  // A balcony on beams along the first floor.
  out.push(...box(b.w * 0.94, 0.0006, 0.0036, IN_WOOD, { x: b.x, y: g1 + 0.0004, z: front + 0.0022 }));
  out.push(...box(b.w * 0.94, 0.0022, 0.0004, IN_WOOD, { x: b.x, y: g1 + 0.001, z: front + 0.0038 }));
  for (const f of ['front', 'left', 'right', 'back'] as Face[]) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: g1, w: 0.0026, h: s.storey * 0.4, spacing: 0.009, sill: s.storey * 0.32, color: 0x2a2020, frame: IN_PLASTER, ...(f === 'front' ? { shutter: 0x6a7a4a } : {}) }));
  out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.22, roof, { x: b.x, y: b.h, z: b.z }));
  // The garden: a low brick wall to the street, coped, a gate in it.
  const gx0 = b.x + b.w / 2 + 0.0012, gx1 = l.lw * 0.93, gw = gx1 - gx0, gx = (gx0 + gx1) / 2, gz0 = b.z - b.d * 0.3, gz1 = l.ld * 0.92, gz = (gz0 + gz1) / 2, gd = gz1 - gz0;
  out.push(patch(gw, gd, 0x8a9a5a, gx, gz, 0.0006));
  out.push(...box(gw * 0.55, 0.0036, 0.0008, brick, { x: gx1 - gw * 0.275, z: gz1 }, IN_TRAV), ...box(0.0008, 0.0036, gd, brick, { x: gx1, z: gz }, IN_TRAV));
  // The pergola: posts, two beams, the vine's leaves over them in clumps.
  const pw = gw * 0.82, pdp = gd * 0.62, ph = 0.0092, pz = gz - gd * 0.08;
  for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(cyl(0.0003, 0.0003, ph, 4, IN_WOOD, { x: gx + i * pw / 2, z: pz + j * pdp / 2 }));
  for (const j of [-1, 1]) out.push(...box(pw + 0.0012, 0.0005, 0.0005, IN_WOOD, { x: gx, y: ph, z: pz + j * pdp / 2 }));
  const vines = [0x5e7a3a, 0x6b8a40, 0x51703a];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) out.push(...box(pw * 0.235, 0.0007, pdp * 0.44, vines[(i + j) % 3]!, { x: gx - pw * 0.375 + i * pw * 0.25, y: ph + 0.0005 + ((i + j) % 2) * 0.00031, z: pz - pdp * 0.25 + j * pdp * 0.5 }));
  for (const k of [-0.3, 0.05, 0.32]) out.push(P3(0x5a2a4a, gx + k * pw, ph - 0.0006, pz + 0.0007 * (k > 0 ? 1 : -1))); // grapes
  // The couches round the table, and the well.
  const cw = Math.min(pw * 0.7, 0.012), cd = Math.min(pdp * 0.7, 0.012);
  out.push(...box(cw, 0.0018, 0.0026, IN_PLASTER, { x: gx, z: pz - cd / 2 + 0.0013 }));
  for (const i of [-1, 1]) out.push(...box(0.0026, 0.0018, cd - 0.0026, IN_PLASTER, { x: gx + i * (cw / 2 - 0.0013), z: pz + 0.0013 }));
  out.push(cyl(0.0016, 0.0016, 0.0024, 7, 0xe8e2d4, { x: gx, z: pz + 0.0006 }));
  out.push(cyl(0.0012, 0.0012, 0.0022, 6, IN_TRAV, { x: gx1 - 0.0028, z: gz0 + 0.003 }));
  return out;
};
// A cluster of grapes (a squat octahedron).
const P3 = (c: number, x: number, y: number, z: number): G => cone(0.0006, 0.0012, 4, c, { x, y: y - 0.0012, z, rx: Math.PI });
// A figlina: a brick and tile works, the trade that built Rome (its bricks
// stamped with the yard's name). An updraft kiln of burnt brick, its two
// firing mouths in a stoking pit, its load of tiles under sherds on top; a
// drying shed of tiles and bricks laid out unfired; the clay pit; the
// works' house and moulding shop at the back; firewood; a cart of tiles.
const figlina: Build = (l) => {
  const brick = pick(l, IN_BRICK), roof = pick(l, IN_ROOF), out: G[] = [];
  const hh = wallHeight(1) * 1.5, b: Body = { ...place(l, 0.62, 0.34, l.ld * 1.0), h: hh };
  b.z = -l.ld + 0.007 + b.d / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb49a7c));
  out.push(patch(2 * l.lw * 0.6, l.ld * 0.5, 0xc4ac8c, -l.lw * 0.2, l.ld * 0.45, 0.0005)); // trodden clay
  // The house and moulding shop: open below, a loft over it.
  out.push(...box(b.w, hh, b.d, brick, { x: b.x, z: b.z }));
  out.push(onFace(b, 'front', -b.w * 0.15, 0, b.w * 0.5, hh * 0.42, IN_DARK, E));
  for (const k of [-0.3, 0.1]) out.push(onFace(b, 'front', -b.w * 0.15 + k * b.w, 0, 0.0016, hh * 0.42, brick, E * 2)); // (piers in the opening)
  out.push(onFace(b, 'front', b.w * 0.3, 0, 0.0045, hh * 0.38, IN_WOOD, E));
  for (const k of [-0.3, 0, 0.3]) out.push(onFace(b, 'front', k * b.w, hh * 0.62, 0.0026, hh * 0.18, 0x2a2020, E));
  out.push(...gable(b.w + 0.004, b.d + 0.004, b.d * 0.32, roof, { x: b.x, y: hh, z: b.z }, false, brick));
  // The kiln: burnt brick, firing mouths to the street, a stoking pit before them.
  const kx = l.lw * 0.42, kz = l.ld * 0.2, kw = Math.min(0.016, l.lw * 0.66), kd = 0.013, kh = 0.0088, kb: Body = { x: kx, z: kz, w: kw, d: kd, y: 0, h: kh };
  out.push(...box(kw, kh, kd, 0x8a4a34, { x: kx, z: kz }, 0x7a4430));
  out.push(patch(kw * 0.9, 0.004, 0x3a2e28, kx, kz + kd / 2 + 0.002, 0.0006));
  for (const k of [-0.22, 0.22]) out.push(...arch(kb, 'front', k * kw, 0, kw * 0.22, kh * 0.25, 0x1e1a16, false, E));
  out.push(...box(kw - 0.0016, 0.0012, kd - 0.0016, 0xb86a48, { x: kx, y: kh, z: kz }, 0x9a7a6a)); // the load under sherds
  for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as const) out.push(patch(0.0012, 0.0012, 0x2a1e1a, kx + i * kw * 0.25, kz + j * kd * 0.25, kh + 0.00125));
  smokeFrom(kx, kh + 0.0012, kz); // (up through the load, an updraft kiln)
  out.push(...logs(6, 0.0075, 0.0006, 0x7a5a3a, { x: kx - kw / 2 - 0.0035, z: kz - 0.002, ry: Math.PI / 2 }));
  // The drying shed: a tiled roof on posts, unfired tiles and bricks in stacks under it.
  const sx = -l.lw * 0.42, sz = l.ld * 0.1, sw = Math.min(0.016, l.lw * 0.8), sd = 0.012;
  out.push(...stall(sw, sd, 0.0078, roof, IN_WOOD, { x: sx, z: sz }));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) out.push(...box(0.0034, 0.0014 + ((i + j) % 2) * 0.0008, 0.0026, j ? 0xc8a582 : 0xd2b090, { x: sx - sw * 0.3 + i * sw * 0.3, z: sz - sd * 0.22 + j * sd * 0.44 }));
  // Amphorae and a dolium of the yard's own make, set out to dry before firing.
  for (let i = 0; i < 5; i++) out.push(...amphora(0.0007, 0.0036, i % 2 ? 0xc8a582 : 0xbf9a78, { x: -l.lw * 0.1 + i * 0.0019, z: -l.ld * 0.05 + (i % 2) * 0.0012 }));
  out.push(cyl(0.0022, 0.0018, 0.0034, 7, 0xc8a582, { x: l.lw * 0.05, z: l.ld * 0.45 }));
  // The clay pit, wet, its brick rim; finished bricks stacked to go; a cart of tiles.
  out.push(...box(0.0085, 0.0008, 0.0065, brick, { x: -l.lw * 0.45, z: l.ld * 0.72 }, 0x6a5444));
  out.push(...box(0.0045, 0.002, 0.0035, brick, { x: l.lw * 0.05, z: l.ld * 0.7 }), ...box(0.0045, 0.0028, 0.0035, shade(brick, 0.9), { x: l.lw * 0.05 + 0.0047, z: l.ld * 0.7 + 0.0003 }));
  out.push(...cart(0.0072, 0x7a5a3a, 0x4a3828, { x: l.lw * 0.62, z: l.ld * 0.78, ry: Math.PI }), ...box(0.0062, 0.0012, 0.0034, 0xb5653f, { x: l.lw * 0.62, y: 0.0028, z: l.ld * 0.78 }));
  return out;
};

// ---------- Greek (neoclassical) ----------
// Athens after 1834, rebuilt by Bavarian and Greek architects: ochre and
// pink stucco, marble pilasters, cornices and balconies, French windows on
// iron balconies, tiled roofs, acroteria (styles/triples.ts neoclassical).
const GR_WALL = [0xecd3a0, 0xe8bfa8, 0xd8dcc0], GR_SHUT = [0x3c5a7a, 0x5a6a3a, 0x3c5a7a];
const GR_MARBLE = 0xf6f1e4, GR_IRON = 0x2a2a2a, GR_ROOF = 0xd47a4e, GR_GLASS = 0x34404a;
// Tall French windows framed in marble across a front, floor by floor, each on its iron balcony (from `from`).
function grWindows(b: Body, l: { floors: number }, s: { base: number; storey: number }, from: number, shut: number, n: number, out: G[]): void {
  const front = b.z + b.d / 2;
  for (let f = from; f < l.floors; f++) for (const a of bays(b.w, n)) {
    const y = s.base + f * s.storey + s.storey * 0.18;
    out.push(onFace(b, 'front', a, y - 0.0005, 0.0038, s.storey * 0.62 + 0.0008, GR_MARBLE), onFace(b, 'front', a, y, 0.0028, s.storey * 0.62, shut, E * 2));
    out.push(...box(0.0046, 0.0005, 0.0022, GR_IRON, { x: b.x + a, y, z: front + 0.0011 }), onFace({ ...b, d: b.d + 0.0044 }, 'front', a, y + 0.0005, 0.0046, 0.0014, GR_IRON, 0));
  }
}
// A kafeneion: the coffee house of the neighbourhood, where the men sat
// over coffee and backgammon. A lower house of two floors, its whole ground
// floor in glazed doors under fanlights, a painted fascia, a cloth awning;
// little marble tables and rush chairs out on the pavement in the shade of
// a plane tree; a balustrade round its flat roof, urns on it.
const kafeneion: Build = (l) => {
  const wall = pick(l, GR_WALL), shut = pick(l, GR_SHUT), out: G[] = [];
  const s = storeys(l, 0.1), h = s.base + s.storey * 2, b: Body = { ...place(l, 0.78, 0.56, l.ld * 0.36), h }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xd0c8b4, 0xe0d8c4));
  out.push(patch(2 * l.lw * 0.92, l.ld - front - 0.0012, 0xc4baa2, 0, (front + l.ld) / 2, 0.0006)); // the pavement it spills onto
  out.push(...box(b.w, h, b.d, wall, { x: b.x, z: b.z }), ...box(b.w + 0.0016, s.base, b.d + 0.0016, GR_MARBLE, { x: b.x, z: b.z }));
  for (const sx of [-1, 1]) out.push(...box(0.0024, h - 0.0002, 0.0012, GR_MARBLE, { x: b.x + sx * (b.w / 2 - 0.0009), z: front }));
  // The glazed doors, fanlights over them, the fascia over all.
  const n = Math.max(3, Math.min(6, Math.floor(b.w / 0.0085)));
  for (const a of bays(b.w - 0.005, n)) {
    out.push(onFace(b, 'front', a, s.base, 0.0044, s.storey * 0.66, GR_MARBLE, FRAME));
    out.push(onFace(b, 'front', a, s.base + 0.0004, 0.0034, s.storey * 0.5, GR_GLASS, E), onFace(b, 'front', a, s.base + s.storey * 0.53, 0.0034, s.storey * 0.1, 0xd8c890, E));
  }
  out.push(...signBoard(b, 'front', 0, s.base + s.storey * 0.7, b.w - 0.0056, 0.0026, 0x2f4a3a, 0xd8b04a));
  // The awning over the doors, cream and green.
  out.push(...awning(b.w - 0.006, 0.0075, [0x3f6a4a, 0xeee6d2], { x: b.x, y: s.base + s.storey * 0.69, z: front + 0.0003, tilt: 0.32, stripes: 7 }));
  out.push(valance(b.w - 0.006, 0.0075, 0.0009, 0x3f6a4a, { x: b.x, y: s.base + s.storey * 0.69, z: front + 0.0003, tilt: 0.32 }));
  // The upper floor: French windows on balconies; the cornice, a balustrade round the roof, urns.
  grWindows(b, l, s, 1, shut, Math.max(2, Math.min(6, Math.floor(b.w / 0.0105))), out);
  out.push(...box(b.w + 0.002, 0.0012, b.d + 0.002, GR_MARBLE, { x: b.x, y: h - 0.001, z: b.z }, 0xb8b0a0));
  out.push(ringBox(b.w, 0.0026, b.d, GR_MARBLE, b.x, h + 0.0002, b.z), hip(b.w - 0.0012, b.d - 0.0012, Math.min(b.w, b.d) * 0.16, GR_ROOF, { x: b.x, y: h + 0.0002, z: b.z }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(...urn(GR_MARBLE, b.x + sx * (b.w / 2 - 0.0008), h + 0.0028, b.z + sz * (b.d / 2 - 0.0008)));
  // Tables and chairs out front, and the plane tree.
  const tz = front + (l.ld - front) * 0.55;
  for (const [i, k] of [-0.36, -0.08, 0.2].entries()) {
    const x = b.x + k * 2 * l.lw * 0.82, z = tz + (i % 2) * 0.0016;
    out.push(cyl(0.0003, 0.0003, 0.0026, 4, GR_IRON, { x, z }), cyl(0.0013, 0.0013, 0.0003, 7, GR_MARBLE, { x, y: 0.0026, z }));
    for (const c of [-1, 1]) out.push(...box(0.0012, 0.0016, 0.0012, 0x6a4a30, { x: x + c * 0.0021, z }, 0xc8a860));
  }
  out.push(...shadeTree(l.lw * 0.66, l.ld * 0.72, 0.95, 0x5f7a3c, 0x9a907a));
  return out;
};
// An urn (a balustrade's finial): a little cup on a stem.
const urn = (c: number, x: number, y: number, z: number): G[] => [cyl(0.0003, 0.0006, 0.0008, 5, c, { x, y, z }), cyl(0.0007, 0.0004, 0.0008, 5, c, { x, y: y + 0.0008, z })];
// A ring of walls (a parapet, a balustrade) w × d, h high, its foot at y.
const ringBox = (w: number, h: number, d: number, c: number, x: number, y: number, z: number): G => ring(w, h, d, c, { x, y, z });
// A draper's emporium in a stoa: the new commercial blocks of Ermou and
// Aiolou streets. Its ground floor behind a colonnade of marble Doric
// columns carrying a plain entablature, shops between them, bolts of cloth
// out on tables and a sign hung from the entablature; over it one long iron
// balcony on the first floor, French windows, a cornice and a tiled roof
// with antefixes along its eaves.
const stoa: Build = (l) => {
  const wall = pick(l, [0xecd3a0, 0xe8bfa8, 0xd8b890]), shut = pick(l, [0x5a6a3a, 0x3c5a7a, 0x6a3a2a]), s = storeys(l, 0.1), out: G[] = [];
  const pd = 0.0068, b = place(l, 0.92, 0.6, pd + 0.003), front = b.z + b.d / 2, g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xd0c8b4, 0xe0d8c4));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }), ...box(b.w + 0.0016, s.base, b.d + 0.0016, GR_MARBLE, { x: b.x, z: b.z }));
  out.push(patch(b.w, pd, 0xe2dccc, b.x, front + pd / 2, 0.0007), ...box(b.w + 0.0006, 0.0006, pd + 0.0006, GR_MARBLE, { x: b.x, z: front + pd / 2 - 0.0003 }, 0xe8e2d4)); // the stylobate
  // The shop fronts behind: glazed, each its own door.
  const n = Math.max(3, Math.min(5, Math.round(b.w / 0.0115)));
  for (const a of bays(b.w, n)) out.push(onFace(b, 'front', a, s.base, b.w / n * 0.7, s.storey * 0.7, GR_GLASS, E), onFace(b, 'front', a + b.w / n * 0.18, s.base, b.w / n * 0.24, s.storey * 0.62, 0x5a3e28, E * 2));
  // The colonnade and its entablature.
  const cz = front + pd - 0.0014, ch = g1 - 0.0034;
  for (let i = 0; i <= n; i++) {
    const x = b.x - b.w / 2 + 0.0012 + i * ((b.w - 0.0024) / n);
    out.push(cyl(0.001, 0.0008, ch - 0.0006, 6, GR_MARBLE, { x, y: 0.0006, z: cz }), cyl(0.0016, 0.0016, 0.0005, 4, GR_MARBLE, { x, y: ch - 0.0005, z: cz, ry: Math.PI / 4 }));
  }
  const ent: Body = { x: b.x, z: front + pd / 2, w: b.w, d: pd, y: ch, h: g1 - ch };
  out.push(...box(ent.w, ent.h, ent.d, GR_MARBLE, { x: ent.x, y: ch, z: ent.z }, 0xc8bca8));
  for (const a of bays(b.w, n * 2)) out.push(onFace(ent, 'front', a, ch + ent.h * 0.45, 0.0008, ent.h * 0.4, 0xd8d0c0, E)); // triglyphs
  // Cloth on trestles between the columns, a sign hung off the entablature.
  const cloth = [0x8a2a2a, 0x2a4a7a, 0xd8b04a, 0x4a6a3a, 0xe8e0d0];
  for (const [i, a] of bays(b.w, n).entries()) if (i % 2 === 0) {
    out.push(...counter(b.w / n * 0.5, 0.0022, 0.0032, 0x5a3e28, 0x7a5a3a, { x: b.x + a, z: front + 0.0024 }));
    for (let k = 0; k < 3; k++) out.push(cyl(0.0005, 0.0005, b.w / n * 0.42, 5, cloth[(i + k) % 5]!, { x: b.x + a, y: 0.0037 + (k === 1 ? 0.0007 : 0), z: front + 0.0016 + k * 0.0007 - (k === 1 ? 0.0007 : 0), rz: Math.PI / 2 }));
  }
  out.push(...hangingSign(0.003, 0.0024, 0x2f3a5a, 0x2a2622, { x: b.x - b.w / 2 + 0.0012 + (b.w - 0.0024) / n * 0.5 + 0.00037, y: ch, z: front + 0.0004 }));
  out.push(...signBoard(ent, 'front', 0, ch + ent.h * 0.05, b.w * 0.4, ent.h * 0.36, 0x2f3a5a, 0xd8b04a, E * 2));
  // The long balcony over the colonnade (its roof), French windows behind it.
  out.push(...box(b.w * 0.94, 0.0024, 0.0003, GR_IRON, { x: b.x, y: g1, z: front + pd - 0.0006 }));
  grWindows(b, l, s, 1, shut, Math.max(2, Math.min(6, Math.floor(b.w / 0.0105))), out);
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: g1, w: 0.0026, h: s.storey * 0.5, spacing: 0.013, sill: s.storey * 0.25, color: 0x3a3a3a }));
  out.push(...box(b.w + 0.002, 0.0012, b.d + 0.002, GR_MARBLE, { x: b.x, y: b.h - 0.001, z: b.z }, 0xb8b0a0));
  out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.22, GR_ROOF, { x: b.x, y: b.h, z: b.z }));
  for (const a of bays(b.w, Math.max(4, Math.round(b.w / 0.006)))) out.push(cone(0.0006, 0.0014, 3, GR_MARBLE, { x: b.x + a, y: b.h + 0.0002, z: front + 0.0018 })); // antefixes
  return out;
};
// A tobacco warehouse and works (kapnapothiki): Greek leaf, the great export
// of the late 1800s, sorted, cured and baled in tall plain stuccoed blocks
// with rows and rows of windows for air, marble quoins, a hipped tiled roof;
// in the yard the leaf strung on lines to dry on frames, bales stacked for
// the port, the engine house of the cutting machines and its round brick
// chimney.
const kapnapothiki: Build = (l) => {
  const wall = pick(l, [0xe0cfa8, 0xd8c39a, 0xe6d8b8]), shut = pick(l, GR_SHUT), out: G[] = [];
  const s = storeys(l, 0.1), b = place(l, 0.82, 0.48, l.ld * 0.98), front = b.z + b.d / 2;
  b.z = -l.ld + 0.007 + b.d / 2;
  const fz = b.z + b.d / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8bea6));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }), ...box(b.w + 0.0016, s.base + 0.002, b.d + 0.0016, 0xb8b0a0, { x: b.x, z: b.z }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(...box(0.0022, b.h - 0.0004, 0.0022, GR_MARBLE, { x: b.x + sx * (b.w / 2 - 0.0008), z: b.z + sz * (b.d / 2 - 0.0008) }));
  // Row on row of small shuttered windows, all round, for the air the leaf needs.
  for (const f of ['front', 'left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.36, spacing: Math.max(0.0066, b.w / 8), sill: s.storey * 0.36, color: 0x3a3a3a, frame: GR_MARBLE, ...(f === 'front' ? { shutter: shut } : {}) }));
  out.push(...doubleDoor({ ...b, z: fz - b.d / 2 }, 'front', 0, 0.0064, s.storey * 0.7, 0x5a3e28, GR_MARBLE, E * 3));
  out.push(onFace(b, 'front', 0, s.base + s.storey * 0.8, 0.012, 0.0024, GR_MARBLE, E * 3), onFace(b, 'front', 0, s.base + s.storey * 0.85, 0.009, 0.0012, 0x5a5048, E * 4)); // the firm's plaque
  out.push(...box(b.w + 0.002, 0.0012, b.d + 0.002, GR_MARBLE, { x: b.x, y: b.h - 0.001, z: b.z }, 0xb8b0a0));
  out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.26, GR_ROOF, { x: b.x, y: b.h, z: b.z }));
  // The engine house and its chimney.
  const ex = l.lw * 0.62, ez = fz + 0.0065;
  out.push(...box(0.0105, 0.0085, 0.0095, wall, { x: ex, z: ez }), hip(0.0115, 0.0105, 0.0032, GR_ROOF, { x: ex, y: 0.0085, z: ez }));
  out.push(onFace({ x: ex, z: ez, w: 0.0105, d: 0.0095, y: 0, h: 0.0085 }, 'front', 0, 0, 0.0036, 0.0058, 0x5a3e28, E));
  out.push(cyl(0.0024, 0.0024, 0.003, 8, 0xa85c40, { x: ex - 0.0072, z: ez - 0.002 }), cyl(0.0018, 0.0011, b.h * 1.25, 8, 0xa85c40, { x: ex - 0.0072, y: 0.003, z: ez - 0.002 }), cyl(0.0013, 0.0013, 0.0012, 8, 0x5a3e28, { x: ex - 0.0072, y: 0.003 + b.h * 1.2, z: ez - 0.002 }));
  smokeFrom(ex - 0.0072, 0.003 + b.h * 1.25, ez - 0.002);
  // The leaf on its frames, drying; bales; a cart loaded for the port.
  const leaf = [0xb8923a, 0x9a7430, 0xc8a24a, 0x8a6a2a];
  for (const k of [0, 1]) out.push(...rack(Math.min(0.018, l.lw * 0.9), 0.0068, leaf, 0x6a4a30, { x: -l.lw * 0.38, z: fz + 0.006 + k * 0.006 }));
  out.push(...crates(5, 0.0026, 0xc8b48a, { x: l.lw * 0.2, z: l.ld * 0.72 }));
  out.push(...cart(0.0075, 0x6a4a30, 0x3a2a20, { x: -l.lw * 0.45, z: l.ld * 0.78, ry: 0.15 }), ...box(0.0052, 0.0016, 0.0032, 0xc8b48a, { x: -l.lw * 0.45, y: 0.0028, z: l.ld * 0.78, ry: 0.15 }));
  void front;
  return out;
};

// ---------- Spanish (renaissance) ----------
// The palacios and plazas of Golden Age Spain (Salamanca, Valladolid,
// Madrid): ochre and sandy stucco over a rusticated stone base, stone
// string courses and cornices, tiled hipped roofs, shuttered windows framed
// in stone (houses.ts FIRST_STYLES renaissance).
const ES_WALL = [0xe0b88a, 0xd8a070, 0xe8d0a0], ES_ROOF = [0xb0603c, 0xa45a38, 0xbc7048], ES_SHUT = [0x4a6a4a, 0x6a5a3a, 0x4a5a6a];
const ES_STONE = 0xe2d8c4, ES_GRANITE = 0xb8b2a6, ES_IRON = 0x262422, ES_DARK = 0x3a3028;
// A draper's (pañero) under the soportales of a plaza mayor: the upper
// floors carried out over the pavement on granite columns and round
// arches, the shops in the shade behind; bolts of cloth on the counters, a
// sign hung in the arch; over it one long wrought-iron balcony on the
// first floor where the town watched its bullfights and processions, and
// the house's coat of arms.
const soportales: Build = (l) => {
  const wall = pick(l, ES_WALL), roof = pick(l, ES_ROOF), shut = pick(l, ES_SHUT), s = storeys(l), out: G[] = [];
  const pd = 0.0075, b = place(l, 0.94, 0.66, 0.0035), front = b.z + b.d / 2, g1 = s.base + s.storey;
  const back: Body = { ...b, d: b.d - pd, z: b.z - pd / 2, h: g1 }, up: Body = { ...b, y: g1, h: b.h - g1 };
  out.push(...yard(l, b, 0xbcae94, 0xc8bca4));
  out.push(...box(back.w, g1, back.d, ES_STONE, { x: b.x, z: back.z }));
  out.push(...box(b.w, up.h, b.d, wall, { x: b.x, y: g1, z: b.z }));
  out.push(patch(b.w, pd, 0x9a9488, b.x, front - pd / 2, 0.0007)); // the arcade's flags
  // The arcade: granite columns, the arches' stone over them.
  const n = Math.max(2, Math.min(6, Math.round(b.w / 0.0115))), ah = g1 - 0.0016, cz = front - 0.001;
  for (let i = 0; i <= n; i++) out.push(cyl(0.0009, 0.0009, ah - 0.0042, 6, ES_GRANITE, { x: b.x - b.w / 2 + 0.0011 + i * ((b.w - 0.0022) / n), z: cz }));
  const spand: Body = { x: b.x, z: front - 0.0012, w: b.w, d: 0.0024, y: ah - 0.0042, h: g1 - ah + 0.0042 };
  out.push(...box(spand.w, spand.h, spand.d, ES_STONE, { x: b.x, y: spand.y, z: spand.z }));
  for (const a of bays(b.w - 0.0022, n)) out.push(...arch(spand, 'front', a, spand.y - 0.0001, Math.min(0.0084, (b.w - 0.0022) / n - 0.0014), 0.0001, 0x5a4e40, false, E).slice(1));
  out.push(...box(b.w + 0.001, 0.0007, b.d + 0.001, ES_STONE, { x: b.x, y: g1, z: b.z })); // string course
  // The shops behind: doors, cloth on counters, a sign.
  const cloth = [0x7a2a2a, 0x2a3a6a, 0x3a2a22, 0xd8c8a0, 0x5a6a3a];
  for (const [i, a] of bays(b.w, n).entries()) {
    out.push(onFace(back, 'front', a, 0, b.w / n * 0.56, g1 * 0.62, ES_DARK, E));
    if (i % 2 === 0) {
      out.push(...counter(b.w / n * 0.5, 0.0018, 0.0034, 0x5a3e28, 0x6a4a30, { x: b.x + a, z: back.z + back.d / 2 + 0.0016 }));
      for (let k = 0; k < 3; k++) out.push(...box(b.w / n * 0.13, 0.0008, 0.0014, cloth[(i + k) % 5]!, { x: b.x + a - b.w / n * 0.16 + k * b.w / n * 0.16, y: 0.0034, z: back.z + back.d / 2 + 0.0016 }));
    }
  }
  out.push(...hangingSign(0.0028, 0.0022, 0xe8d8b8, ES_IRON, { x: b.x + bays(b.w - 0.0022, n)[0]! + 0.00037, y: ah - 0.0042, z: front - pd + 0.0002 }));
  // The long balcony over the arcade, French windows on it; windows above; the arms in stone.
  out.push(...box(b.w * 0.96, 0.0006, 0.0028, ES_IRON, { x: b.x, y: g1 + 0.0004, z: front + 0.0014 }), onFace({ ...b, d: b.d + 0.0054 }, 'front', 0, g1 + 0.001, b.w * 0.96, 0.0018, ES_IRON, 0));
  const nw = Math.max(2, Math.min(6, Math.floor(b.w / 0.0105)));
  for (let f = 1; f < l.floors; f++) for (const a of bays(b.w, nw)) {
    const y = s.base + f * s.storey + s.storey * (f === 1 ? 0.12 : 0.25), wh = s.storey * (f === 1 ? 0.66 : 0.48);
    out.push(onFace(up, 'front', a, y - 0.0005, 0.0038, wh + 0.001, ES_STONE, FRAME), onFace(up, 'front', a, y, 0.0028, wh, 0x3a3028, E));
    for (const sd of [-1, 1]) out.push(onFace(up, 'front', a + sd * 0.0023, y, 0.0013, wh, shut, E));
  }
  for (const f of ['left', 'right', 'back'] as Face[]) out.push(...windows(up, f, { ...s, floors: l.floors - 1, base: 0, w: 0.003, h: s.storey * 0.5, spacing: 0.0125, sill: s.storey * 0.25, color: 0x3a3028, frame: ES_STONE }));
  out.push(onFace(up, 'front', 0, b.h - 0.0052, 0.0034, 0.004, ES_STONE, E * 2), onFace(up, 'front', 0, b.h - 0.0046, 0.0022, 0.0026, 0x8a6a3a, E * 3)); // the arms
  out.push(...box(b.w + 0.002, 0.001, b.d + 0.002, ES_STONE, { x: b.x, y: b.h - 0.0008, z: b.z }));
  out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.2, roof, { x: b.x, y: b.h, z: b.z }));
  return out;
};
// A bodega: a tavern with its own wine store, the kind Cervantes drank
// in. A lower, broad house of two floors, its gable to the street; a great
// stone doorway (portada) with a green bush (the ramo) hung over it, the
// old sign of new wine; a canvas toldo on poles over benches and a table;
// casks stacked by the door; in its walled yard the tinajas, the huge clay
// jars the wine of La Mancha was kept in; a wooden gallery on the upper floor.
const bodega: Build = (l) => {
  const wall = pick(l, [0xe8d0a0, 0xe0b88a, 0xd8a070]), roof = pick(l, ES_ROOF), s = storeys(l), out: G[] = [];
  const h = s.base + s.storey * 2.1, b: Body = { ...place(l, 0.84, 0.48, l.ld * 0.3), h }, front = b.z + b.d / 2, g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xbcae94, 0xc8bca4));
  out.push(...box(b.w, h, b.d, wall, { x: b.x, z: b.z }), ...box(b.w + 0.0012, s.base + 0.0024, b.d + 0.0012, ES_STONE, { x: b.x, z: b.z }));
  // The portada: an arch of stone voussoirs, a dark door, the ramo hung over it.
  const dx = -b.w * 0.18;
  out.push(...arch(b, 'front', dx, 0, 0.0078, g1 * 0.5, ES_STONE, false, E), ...arch(b, 'front', dx, 0, 0.0056, g1 * 0.46, 0x4a3222, false, E * 2));
  out.push(cyl(0.0002, 0.0002, 0.0024, 4, ES_IRON, { x: b.x + dx, y: g1 * 0.84, z: front, rx: Math.PI / 2 }), P(new THREE.OctahedronGeometry(0.002, 0), 0x4a6a2a, { x: b.x + dx, y: g1 * 0.84 - 0.0016, z: front + 0.0026, sy: 1.3 }));
  out.push(onFace(b, 'front', b.w * 0.24, g1 * 0.3, 0.0036, 0.0036, 0x3a3028, E), onFace(b, 'front', b.w * 0.24, g1 * 0.3, 0.0036, 0.0036, ES_IRON, E * 2)); // a grilled window
  // The gallery: a wooden balcony along the upper floor under the eaves.
  out.push(...box(b.w * 0.9, 0.0006, 0.003, 0x5a3e24, { x: b.x, y: g1 + 0.0006, z: front + 0.0015 }), onFace({ ...b, d: b.d + 0.0058 }, 'front', 0, g1 + 0.0012, b.w * 0.9, 0.002, 0x6a4a2e, 0));
  for (const a of bays(b.w * 0.86, 4)) out.push(cyl(0.0002, 0.0002, h - g1 - 0.0006, 4, 0x5a3e24, { x: b.x + a, y: g1 + 0.0006, z: front + 0.0028 }));
  out.push(...windows(b, 'front', { ...s, floors: 1, base: g1, w: 0.0028, h: s.storey * 0.56, spacing: 0.0095, sill: s.storey * 0.1, color: 0x3a3028, shutter: 0x5a3e24 }));
  out.push(...gable(b.w + 0.004, b.d + 0.004, b.w * 0.24, roof, { x: b.x, y: h, z: b.z }, true, wall));
  // The toldo over a bench and table; casks by the door.
  const tz = front + (l.ld - front) * 0.5, tw = Math.min(0.016, b.w * 0.5);
  out.push(...stall(tw, (l.ld - front) * 0.7, 0.0078, 0xeae2cc, 0x6a4a30, { x: b.x + b.w * 0.2, z: tz }));
  out.push(...box(tw * 0.6, 0.0026, 0.0026, 0x6a4a30, { x: b.x + b.w * 0.2, z: tz }), ...box(tw * 0.6, 0.0012, 0.0012, 0x7a5a3a, { x: b.x + b.w * 0.2, z: tz - 0.0026 }));
  for (const [i, [x, y, z]] of ([[0, 0, 0], [0.0028, 0, 0.0002], [0.0056, 0, -0.0001], [0.0014, 0.0024, 0.0001], [0.0042, 0.0024, 0]] as const).entries())
    out.push(cyl(0.0013, 0.0013, 0.0032, 7, i > 2 ? 0x7a5530 : 0x6a4a2a, { x: b.x - b.w / 2 + 0.0034 + x, y: y + 0.0013, z: front + 0.0024 + z, rx: Math.PI / 2 }), cyl(0.00134, 0.00134, 0.0004, 7, 0x3a3430, { x: b.x - b.w / 2 + 0.0034 + x, y: y + 0.0013, z: front + 0.0038 + z, rx: Math.PI / 2 }));
  // The yard behind its wall: the tinajas.
  const yz = b.z - b.d / 2 - (b.z - b.d / 2 + l.ld) / 2;
  for (const [i, k] of [-0.5, -0.1, 0.3].entries()) out.push(cyl(0.0014, 0.0026, 0.0034, 7, 0xb87048, { x: k * l.lw * 1.3, z: yz + (i % 2) * 0.002 }), cyl(0.0026, 0.0012, 0.0028, 7, 0xb87048, { x: k * l.lw * 1.3, y: 0.0034, z: yz + (i % 2) * 0.002 }));
  return out;
};
// An espadería: a Toledo sword forge, its steel famous across Europe. A
// stone hall with a tiled roof and a tall square stack from the forges; on
// the mill race beside it a water wheel driving the tilt hammer within; in
// the yard anvils, the quenching trough, a heap of charcoal and the iron
// bars come up from the mines.
const espaderia: Build = (l) => {
  const roof = pick(l, ES_ROOF), stone = 0xc8bca4, out: G[] = [];
  const hh = wallHeight(1) * 1.4, b: Body = { ...place(l, 0.6, 0.42, 0), h: hh };
  b.z = -l.ld + 0.007 + b.d / 2;
  b.x = l.lw - 0.007 - b.w / 2;
  const fz = b.z + b.d / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xa89c88));
  out.push(patch(2 * l.lw * 0.7, l.ld * 0.7, 0x6a6058, -l.lw * 0.15, l.ld * 0.25, 0.0005)); // the yard black with scale and coal dust
  out.push(...box(b.w, hh, b.d, stone, { x: b.x, z: b.z }), ...box(b.w + 0.0012, 0.0026, b.d + 0.0012, ES_GRANITE, { x: b.x, z: b.z }));
  out.push(...arch(b, 'front', -b.w * 0.12, 0, 0.0074, hh * 0.42, ES_STONE, false, E), ...arch(b, 'front', -b.w * 0.12, 0, 0.0056, hh * 0.4, 0x2a2018, false, E * 2));
  out.push(onFace(b, 'front', -b.w * 0.12, hh * 0.25, 0.003, 0.0016, 0xd8642a, E * 3)); // the forge's glow within
  for (const k of [0.22, 0.38]) out.push(onFace(b, 'front', k * b.w, hh * 0.6, 0.0026, 0.0034, ES_DARK, E));
  out.push(...gable(b.w + 0.004, b.d + 0.004, b.d * 0.34, roof, { x: b.x, y: hh, z: b.z }, false, stone));
  out.push(...chimney(0.0042, hh * 1.55, 0.0042, stone, { x: b.x + b.w * 0.3, z: b.z - b.d * 0.12 }, 0x2a2420), ...box(0.0052, 0.0012, 0.0052, ES_GRANITE, { x: b.x + b.w * 0.3, y: hh * 1.55, z: b.z - b.d * 0.12 }, 0x1e1a16));
  // The mill race along the hall's side, the wheel in it.
  const rx = b.x - b.w / 2 - 0.0028, rw = 0.0034;
  out.push(...box(rw + 0.0012, 0.0012, 2 * l.ld * 0.96, ES_GRANITE, { x: rx, z: 0 }, 0x3a6a8a));
  out.push(P(new THREE.CylinderGeometry(0.0048, 0.0048, 0.0012, 10), 0x6a4a30, { x: rx, y: 0.0044, z: b.z + 0.0004, rz: Math.PI / 2 }));
  out.push(cyl(0.0006, 0.0006, 0.0048, 5, 0x3a3028, { x: rx + 0.0034, y: 0.0044, z: b.z + 0.0004, rz: Math.PI / 2 }));
  for (let i = 0; i < 4; i++) out.push(P(new THREE.BoxGeometry(0.0018, 0.0005, 0.0104), 0x4a3220, { x: rx, y: 0.0044, z: b.z + 0.0004, rx: (i * Math.PI) / 4 })); // the paddles
  // The yard: anvils, the trough, charcoal, bars, finished blades in a rack.
  out.push(...anvil(0.0022, { x: b.x - b.w * 0.25, z: fz + 0.006 }), ...anvil(0.0022, { x: b.x + b.w * 0.15, z: fz + 0.0075, ry: 0.4 }));
  out.push(...box(0.006, 0.0018, 0.0024, ES_GRANITE, { x: l.lw * 0.12, z: l.ld * 0.75 }, 0x2a4a5a));
  out.push(cone(0.004, 0.0038, 7, 0x24201e, { x: -l.lw * 0.25, z: l.ld * 0.68 }));
  out.push(...logs(6, 0.008, 0.00045, 0x4a4a4e, { x: l.lw * 0.6, z: fz + 0.0055 }));
  out.push(...rack(0.0068, 0.0062, [0xc8ccd0, 0xb8bcc4, 0xc8ccd0, 0xb8bcc4], 0x5a3e24, { x: l.lw * 0.62, z: l.ld * 0.78 }));
  return out;
};

// ---------- Mexican (colonial) ----------
// Viceregal Mexico City and Puebla: blood-red tezontle (volcanic stone)
// framed in grey cantera, iron balconies, flat roofs behind parapets with
// stone pinnacles (styles/triples.ts colonial).
const MX_STONE = [0x8e3b2e, 0x9a4433, 0xd99a3a], MX_CANTERA = 0xcbc3b3, MX_IRON = 0x1d1d1d, MX_WOOD = 0x5b3e24;
// The parapet round a flat roof, pinnacles along its front.
function mxParapet(b: Body, c: number, out: G[]): void {
  out.push(ring(b.w, 0.0024, b.d, c, { x: b.x, y: b.h, z: b.z }));
  const np = Math.max(3, Math.min(8, Math.floor(b.w / 0.009) + 1));
  for (let i = 0; i < np; i++) out.push(cone(0.0008, 0.003, 4, MX_CANTERA, { x: b.x - b.w / 2 + (i * b.w) / (np - 1), y: b.h + 0.0024, z: b.z + b.d / 2 - 0.0004 }));
}
// The portales: a merchants' arcade (the Portal de Mercaderes on the
// Zócalo). A tezontle house whose ground floor stands back behind round
// arches on square cantera piers; under them the cajones, little wooden
// stalls under petate mats, selling hats, sweets, toys and fruit; iron
// balconies above, the parapet and its pinnacles.
const portales: Build = (l) => {
  const stone = pick(l, MX_STONE), s = storeys(l, 0.08), out: G[] = [];
  const pd = 0.0078, b = place(l, 0.94, 0.68, 0.0035), front = b.z + b.d / 2, g1 = s.base + s.storey;
  const back: Body = { ...b, d: b.d - pd, z: b.z - pd / 2, h: g1 }, up: Body = { ...b, y: g1, h: b.h - g1 };
  out.push(...yard(l, b, 0xb8ae98, 0xc8bca4));
  out.push(...box(back.w, g1, back.d, stone, { x: b.x, z: back.z }), ...box(b.w, up.h, b.d, stone, { x: b.x, y: g1, z: b.z }, 0xc8b8a0));
  out.push(patch(b.w, pd, 0x9a9080, b.x, front - pd / 2, 0.0007));
  // The arcade: square cantera piers, the arches.
  const n = Math.max(2, Math.min(5, Math.round(b.w / 0.013))), ah = g1 - 0.0014;
  for (let i = 0; i <= n; i++) out.push(...box(0.0022, ah - 0.004, 0.0022, MX_CANTERA, { x: b.x - b.w / 2 + 0.0011 + i * ((b.w - 0.0022) / n), z: front - 0.0011 }));
  const spand: Body = { x: b.x, z: front - 0.0011, w: b.w, d: 0.0022, y: ah - 0.004, h: g1 - ah + 0.004 };
  out.push(...box(spand.w, spand.h, spand.d, stone, { x: b.x, y: spand.y, z: spand.z }));
  for (const a of bays(b.w - 0.0022, n)) {
    const aw = Math.min(0.008, (b.w - 0.0022) / n - 0.0022);
    out.push(...arch(spand, 'front', a, spand.y - 0.0001, aw + 0.0012, 0.0001, MX_CANTERA, false, E).slice(1), ...arch(spand, 'front', a, spand.y - 0.0001, aw, 0.0001, 0x4a3428, false, E * 2).slice(1));
  }
  out.push(onFace(spand, 'front', 0, g1 - 0.0007, b.w, 0.0007, MX_CANTERA, E));
  // The shops behind the arcade, and the cajones before them.
  const goods = [[0xd8b860, 0xc8a050], [0xe0607a, 0xf0c040], [0x6aa040, 0xe08a30], [0x3a7ab0, 0xe8d8a0]];
  for (const [i, a] of bays(b.w, n).entries()) {
    out.push(arch(back, 'front', a, 0, b.w / n * 0.5, g1 * 0.5, 0x3a2a22, false, E)[0]!);
    const g = goods[i % 4]!, x = b.x + a, z = back.z + back.d / 2 + 0.0024;
    out.push(...box(b.w / n * 0.56, 0.003, 0.0024, MX_WOOD, { x, z }, 0x7a5a3a));
    out.push(...stall(b.w / n * 0.62, 0.0034, 0.0062, 0xc8a868, MX_WOOD, { x, z }));
    for (let k = 0; k < 3; k++) out.push(cone(0.0008, 0.0011, 3, g[k % 2]!, { x: x - b.w / n * 0.16 + k * b.w / n * 0.16, y: 0.003, z }));
  }
  // Iron balconies on the upper floors, windows in cantera frames.
  const nw = Math.max(2, Math.min(5, Math.floor(b.w / 0.0115)));
  for (let f = 1; f < l.floors; f++) for (const a of bays(b.w, nw)) {
    const y = s.base + f * s.storey + s.storey * 0.18;
    out.push(onFace(up, 'front', a, y - 0.0006, 0.0042, s.storey * 0.6 + 0.0012, MX_CANTERA, FRAME), onFace(up, 'front', a, y, 0.003, s.storey * 0.6, 0x3a2a24, E));
    out.push(...box(0.005, 0.0005, 0.0022, MX_IRON, { x: b.x + a, y, z: front + 0.0011 }), onFace({ ...b, d: b.d + 0.0044 }, 'front', a, y + 0.0005, 0.005, 0.0014, MX_IRON, 0));
  }
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(up, f, { ...s, floors: l.floors - 1, base: 0, w: 0.0028, h: s.storey * 0.45, spacing: 0.014, sill: s.storey * 0.3, color: 0x3a2a24, frame: MX_CANTERA }));
  out.push(...box(b.w + 0.0014, 0.0012, b.d + 0.0014, MX_CANTERA, { x: b.x, y: b.h - 0.001, z: b.z }, 0xc8b8a0));
  mxParapet(b, stone, out);
  return out;
};
// A pulquería: the taverns of pulque, the fermented sap of the maguey,
// the drink of old Mexico. A low house with its front painted bright and
// a mural of its name and a landscape, half-doors swinging in a wide
// doorway, strings of papel picado across the front, barrels of pulque
// carried in from the haciendas, magueys in pots by the door; a flat roof
// behind a painted parapet.
const pulqueria: Build = (l) => {
  const paint = pick(l, [0xf4bcc6, 0x86c4d4, 0xf2cc6a]), trim = pick(l, [0x2a7a6a, 0xd84a3a, 0x7a3a8a]), s = storeys(l, 0.08), out: G[] = [];
  const h = s.base + s.storey * 1.25, b: Body = { ...place(l, Math.min(0.86, 0.054 / (2 * l.lw)), Math.min(0.56, 0.04 / (2 * l.ld)), l.ld * 0.26), h }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xb8ae98, 0xc8bca4));
  out.push(...box(b.w, h, b.d, paint, { x: b.x, z: b.z }, 0xc8b8a0), ...box(b.w + 0.0008, 0.0026, b.d + 0.0008, trim, { x: b.x, z: b.z }));
  out.push(ring(b.w, 0.0034, b.d, paint, { x: b.x, y: h, z: b.z }), ring(b.w + 0.0008, 0.0006, b.d + 0.0008, trim, { x: b.x, y: h + 0.0034, z: b.z }));
  // The doorway, its swinging half-doors; the mural; the name over it.
  const dx = -b.w * 0.2, dh = Math.min(0.0115, h * 0.62);
  out.push(onFace(b, 'front', dx, 0, 0.0076, dh + 0.0008, trim, E), onFace(b, 'front', dx, 0, 0.0062, dh, 0x2a1e1a, E * 2));
  for (const k of [-1, 1]) out.push(onFace(b, 'front', dx + k * 0.0016, dh * 0.25, 0.0029, dh * 0.4, 0x8a602a, E * 3));
  const mw = b.w * 0.42, mx = b.w * 0.22;
  out.push(onFace(b, 'front', mx, 0.0034, mw, h * 0.5, 0xf2e8d0, E));
  out.push(onFace(b, 'front', mx, 0.0034, mw, h * 0.16, 0x6a9a4a, E * 2), onFace(b, 'front', mx - mw * 0.2, 0.0034 + h * 0.16, mw * 0.3, h * 0.2, 0x8a8aa8, E * 2), onFace(b, 'front', mx + mw * 0.25, 0.0034 + h * 0.3, 0.0016, 0.0016, 0xf0b030, E * 2)); // fields, a volcano, the sun
  out.push(...signBoard(b, 'front', 0, h * 0.72, b.w * 0.8, h * 0.18, trim, 0xf2e8d0, E));
  // Papel picado: strings of little paper flags across the front.
  const colors = [0xe0405a, 0xf0c030, 0x3aa0d0, 0x60b040, 0xe07ac0, 0xf08030];
  for (const [r, y] of [[0, h + 0.0018], [1, h - 0.0012]] as const) {
    const n = Math.max(5, Math.min(9, Math.floor(b.w / 0.004)));
    for (let i = 0; i < n; i++) out.push(onFace({ ...b, d: b.d + 0.0052 + r * 0.0018 }, 'front', -b.w * 0.45 + (i + 0.5) * (b.w * 0.9 / n), y - Math.sin((i + 0.5) / n * Math.PI) * 0.0012, b.w * 0.9 / n * 0.7, 0.0014, colors[(i + r * 2) % 6]!, 0));
    out.push(...box(b.w * 0.92, 0.0001, 0.0001, 0x3a3028, { x: b.x, y: y + 0.0014, z: front + 0.0026 + r * 0.0009 }));
  }
  out.push(cyl(0.0002, 0.0002, h + 0.0034, 4, MX_WOOD, { x: b.x - b.w * 0.46, z: front + 0.0026 }), cyl(0.0002, 0.0002, h + 0.0034, 4, MX_WOOD, { x: b.x + b.w * 0.46, z: front + 0.0035 }));
  // Barrels by the door, magueys in pots.
  for (const [i, [x, z]] of ([[0, 0], [0.0026, 0.0004], [0.0013, 0.0024]] as const).entries()) out.push(cyl(0.0011, 0.0011, 0.0028, 7, i === 2 ? 0x7a5530 : 0x6a4a2a, { x: b.x + dx - 0.0068 + x, z: front + 0.0022 + z }), cyl(0.00118, 0.00118, 0.0004, 7, 0x3a3430, { x: b.x + dx - 0.0068 + x, y: 0.0019, z: front + 0.0022 + z }));
  for (const k of [0.08, 0.38]) out.push(...maguey(b.x + k * b.w, front + 0.0026));
  return out;
};
// A maguey (an agave) in a clay pot: stiff leaves splayed from the middle.
const maguey = (x: number, z: number): G[] => {
  const out: G[] = [cyl(0.0011, 0.0013, 0.0016, 6, 0xb86a40, { x, z })];
  for (let i = 0; i < 5; i++) out.push(cone(0.0004, 0.0042, 3, i % 2 ? 0x6a8a6a : 0x7a9a78, { x, y: 0.0014, z, rx: 0.6 * Math.cos((i * 2 * Math.PI) / 5), rz: 0.6 * Math.sin((i * 2 * Math.PI) / 5) }));
  return out;
};
// A talavera pottery (alfarería) of Puebla: tin-glazed ware in cobalt blue
// on white, the tiles that face Puebla's churches and houses. The workshop
// in red brick set with panels of its own blue and white tiles, after
// Puebla's brick-and-tile fronts; in the yard two kilns with their flues,
// shelves of pots set out to dry, finished jars in blue and white, the
// clay soaking in its pit.
const talavera: Build = (l) => {
  const brick = 0xa8553a, out: G[] = [], blue = 0x2a4a9a, white = 0xeeeae0;
  const hh = wallHeight(1) * 1.5, b: Body = { ...place(l, 0.64, 0.4, 0), h: hh };
  b.z = -l.ld + 0.007 + b.d / 2;
  b.x = -l.lw + 0.007 + b.w / 2;
  const fz = b.z + b.d / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc0a888));
  out.push(...box(b.w, hh, b.d, brick, { x: b.x, z: b.z }, 0xc8b8a0), ...box(b.w + 0.0008, 0.002, b.d + 0.0008, MX_CANTERA, { x: b.x, z: b.z }));
  // Tile panels between the openings; the door and windows framed in cantera.
  const n = Math.max(2, Math.min(4, Math.round(b.w / 0.011)));
  for (const [i, a] of bays(b.w, n).entries()) {
    if (i === 0) out.push(onFace(b, 'front', a, 0, 0.0068, hh * 0.5, MX_CANTERA, E), onFace(b, 'front', a, 0, 0.0052, hh * 0.46, MX_WOOD, E * 2));
    else out.push(onFace(b, 'front', a, hh * 0.22, 0.004, hh * 0.3, MX_CANTERA, E), onFace(b, 'front', a, hh * 0.24, 0.003, hh * 0.26, 0x3a2a24, E * 2));
    // (A tile panel: white ground, a blue border and a blue lozenge in it.)
    const pw = Math.min(0.0075, b.w / n * 0.7), py = hh * 0.6, ph = hh * 0.26;
    out.push(onFace(b, 'front', a, py, pw, ph, blue, E), onFace(b, 'front', a, py + 0.0005, pw - 0.001, ph - 0.001, white, E * 2), tilted(b, 'front', a, py + ph / 2, ph * 0.45, ph * 0.45, Math.PI / 4, blue, E * 3));
  }
  out.push(...bands(b, [hh * 0.53], 0.0008, blue, ['front', 'left', 'right']));
  out.push(...box(b.w + 0.0014, 0.0012, b.d + 0.0014, MX_CANTERA, { x: b.x, y: hh - 0.001, z: b.z }, 0xc8b8a0));
  mxParapet(b, brick, out);
  for (let i = 0; i < 5; i++) out.push(...amphora(0.0009, 0.0026, 0xc89a78, { x: b.x - b.w * 0.3 + i * 0.0026, y: hh, z: b.z - b.d * 0.15 + (i % 2) * 0.003 })); // pots drying on the roof
  // The kilns: round, domed, their mouths to the yard, a flue each.
  const kr = Math.min(0.0055, l.lw * 0.24);
  out.push(...kiln(kr, 0.012, 0xb86a48, { x: l.lw * 0.55, z: b.z + 0.002 }), ...kiln(kr * 0.8, 0.0095, 0xa85c40, { x: l.lw * 0.55, z: fz + kr + 0.004 }));
  out.push(...logs(6, 0.007, 0.0005, 0x7a5a3a, { x: l.lw * 0.1, z: fz + 0.004 }));
  // Shelves of drying pots; finished jars.
  const sx = -l.lw * 0.35, sz = l.ld * 0.55;
  for (const y of [0.0012, 0.0034]) out.push(...box(0.012, 0.0004, 0.0026, MX_WOOD, { x: sx, y, z: sz }));
  for (const sd of [-1, 1]) out.push(...box(0.0005, 0.0042, 0.0026, MX_WOOD, { x: sx + sd * 0.0058, z: sz }));
  for (let i = 0; i < 4; i++) for (const y of [0.0016, 0.0038]) out.push(cyl(0.0007, 0.0004, 0.0014, 5, 0xc89a78, { x: sx - 0.0045 + i * 0.003, y, z: sz }));
  for (let i = 0; i < 4; i++) out.push(...amphora(0.0012, 0.0036, i % 2 ? white : blue, { x: l.lw * 0.1 + (i % 2) * 0.0026, z: l.ld * 0.72 + Math.floor(i / 2) * 0.0026 }));
  out.push(...box(0.0075, 0.0007, 0.0055, MX_CANTERA, { x: -l.lw * 0.35, z: l.ld * 0.84 - 0.0028 }, 0x8a6a4a));
  return out;
};

// ---------- Egyptian (mamluk) ----------
// Old Cairo, Mamluk and Ottoman: limestone in striped ablaq courses of red
// and cream, wooden mashrabiya screens out over the street, crenellated
// parapets, a small ribbed dome (styles/triples.ts mamluk).
const EG_STONE = [0xe7d6b4, 0xdcc8a0, 0xeadcc0], EG_WOOD = [0x7a5530, 0x6e4c2a, 0x86603a]; // (the home's wood, a shade yellower: the shader tells timber from brick by it)
const EG_RED = 0xb05a3c, EG_LATTICE = 0xa8784a, EG_DARK = 0x3a2a24;
// A mashrabiya: a screened wooden box out from a wall at (x, y), its lattice front, a corbelled foot.
function mashrabiya(b: Body, along: number, y: number, w: number, h: number, wood: number, out: G[], dep = 0.0032): void {
  const z = b.z + b.d / 2 + dep / 2, bay: Body = { x: b.x + along, z, w, d: dep, y, h };
  out.push(...box(w, h, dep, wood, { x: bay.x, y, z }), onFace(bay, 'front', 0, y + 0.0007, w - 0.0012, h - 0.0014, EG_LATTICE, E));
  out.push(...frustum(w * 0.6, dep * 0.4, w, dep, 0.0016, wood, { x: bay.x, y: y - 0.0016, z: z }));
}
// A wakala: a merchants' khan (after the Wikala of al-Ghuri), its street
// front a row of small shops (hawanit), each a deep opening with a stone
// bench (mastaba) before it where the spice-seller sat by his heaps of
// cumin, henna, saffron and dried roses; a tall portal of striped stone
// into the court; over the shops the lodgings (rab'), a long row of
// mashrabiyas; a crenellated parapet.
const wakala: Build = (l) => {
  const stone = pick(l, EG_STONE), wood = pick(l, EG_WOOD), s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.94, 0.66, l.ld * 0.14), front = b.z + b.d / 2, g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xc8b898, 0xd8c8a8));
  out.push(...box(b.w, b.h, b.d, stone, { x: b.x, z: b.z }, 0xd8c8a6));
  out.push(...bands(b, [0.002, 0.0052, 0.0084, 0.0116, 0.0148].filter((y) => y < g1 - 0.0015), 0.0016, EG_RED, ['front', 'left', 'right']));
  // The portal: a tall recess in ablaq, a dark pointed arch at its foot.
  const pw = 0.0084, pdx = -b.w * 0.5 + pw / 2 + 0.003;
  out.push(onFace(b, 'front', pdx, 0, pw, b.h * 0.72, stone, E * 2));
  for (let i = 0; i < 6; i++) out.push(onFace(b, 'front', pdx, b.h * 0.4 + i * 0.0026, pw, 0.0013, i % 2 ? EG_RED : 0x2a2a2a, E * 3));
  out.push(...arch(b, 'front', pdx, 0, pw * 0.58, b.h * 0.36, EG_DARK, true, E * 4));
  // The shops: each a dark opening, its shutter boards, its bench and the goods heaped on it.
  const sw = b.w - pw - 0.006, n = Math.max(2, Math.min(4, Math.round(sw / 0.0095))), x0 = pdx + pw / 2 + 0.0015 + sw / 2;
  const heaps = [0xb8402a, 0xd89a2a, 0x6a7a3a, 0x8a3a5a, 0xd8c060];
  for (const [i, a] of bays(sw, n).entries()) {
    const x = x0 + a, ow = sw / n * 0.72;
    out.push(onFace(b, 'front', x, 0.0014, ow, g1 * 0.58, EG_DARK, E * 2), onFace(b, 'front', x, g1 * 0.58 + 0.0014, ow + 0.0008, 0.0012, wood, E * 3));
    out.push(...box(ow + 0.001, 0.0016, 0.0026, stone, { x: b.x + x, z: front + 0.0013 }, 0xc8b490));
    for (let k = 0; k < 2; k++) out.push(cone(0.0009, 0.0013, 4, heaps[(i * 2 + k) % 5]!, { x: b.x + x - ow * 0.22 + k * ow * 0.44, y: 0.0016, z: front + 0.0013 }));
    out.push(...stall(ow + 0.0012, 0.0036, g1 * 0.66, 0xc8b088, wood, { x: b.x + x, z: front + 0.0021 }).slice(-1)); // a mat shade over it
  }
  // The rab' over the shops: its mashrabiyas, one a bay.
  for (let f = 1; f < l.floors; f++) for (const a of bays(sw, n)) mashrabiya(b, x0 + a, s.base + f * s.storey + s.storey * 0.16, Math.min(0.0068, sw / n * 0.7), s.storey * 0.66, wood, out);
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, w: 0.0022, h: s.storey * 0.32, spacing: 0.012, sill: s.storey * 0.4, color: EG_DARK }));
  out.push(...merlons(b, b.h, 0.0016, 0.006, stone, ['front', 'left', 'right']));
  out.push(...lamp(b.x + pdx, g1 * 0.9, front + 0.0024));
  // The khan's court seen from above: an open well in the roof, its galleries in shadow.
  out.push(ring(b.w * 0.5, 0.0012, b.d * 0.42, stone, { x: b.x + b.w * 0.06, y: b.h, z: b.z - b.d * 0.08 }), patch(b.w * 0.5, b.d * 0.42, 0x8a7a62, b.x + b.w * 0.06, b.z - b.d * 0.08, b.h + 0.0003));
  return out;
};
// A hanging brass lantern on its chain.
const lamp = (x: number, y: number, z: number): G[] => [cyl(0.00012, 0.00012, 0.0018, 3, 0x2a2420, { x, y: y - 0.0018, z }), cone(0.0007, 0.0006, 6, 0xc89a3a, { x, y: y - 0.0018, z, rx: Math.PI }), cone(0.0007, 0.0012, 6, 0xd8aa4a, { x, y: y - 0.0018, z })];
// A qahwa: a Cairo coffee house. A lower house whose upper floor juts out
// over the street on corbels, faced all over in mashrabiya; below, the
// coffee room open to the street, stone benches along its front spread
// with rugs, a canopy of reed mats on poles out over more benches; brass
// lanterns, the copper coffee pots on the brazier, a palm beside.
const qahwa: Build = (l) => {
  const stone = pick(l, EG_STONE), wood = pick(l, EG_WOOD), s = storeys(l, 0.08), out: G[] = [];
  const g1 = s.base + s.storey, h = g1 + s.storey * 0.95, b: Body = { ...place(l, 0.74, 0.56, l.ld * 0.34), h: g1 }, front = b.z + b.d / 2;
  b.x = -l.lw + 0.007 + b.w / 2;
  out.push(...yard(l, b, 0xc8b898, 0xd8c8a8));
  out.push(...box(b.w, g1, b.d, stone, { x: b.x, z: b.z }));
  out.push(...bands(b, [0.002, 0.0052, 0.0084], 0.0016, EG_RED, ['left', 'right']));
  // The coffee room open behind two stone piers; its benches with rugs.
  out.push(onFace(b, 'front', 0, 0, b.w * 0.84, g1 * 0.74, EG_DARK, E));
  for (const k of [-0.42, 0, 0.42]) out.push(onFace(b, 'front', k * b.w, 0, 0.0018, g1 * 0.74, stone, E * 2));
  out.push(onFace(b, 'front', 0, g1 * 0.16, b.w * 0.8, 0.0007, 0xc89a3a, E * 3)); // (the copper pots on their shelf, in the dark)
  // The jutting upper floor: wooden, corbelled out, screened, under a flat roof.
  const jd = 0.0045, up: Body = { x: b.x, z: b.z + jd / 2, w: b.w + 0.0012, d: b.d + jd, y: g1, h: h - g1 };
  out.push(...box(up.w, up.h, up.d, wood, { x: up.x, y: g1, z: up.z }, 0xd8c8a6));
  out.push(...frustum(b.w, 0.0012, up.w, jd + 0.0004, 0.0024, wood, { x: b.x, y: g1 - 0.0024, z: front + jd / 2 - 0.0002 }));
  const nl = Math.max(2, Math.min(4, Math.round(b.w / 0.009)));
  for (const a of bays(up.w, nl)) out.push(onFace(up, 'front', a, g1 + up.h * 0.14, up.w / nl * 0.78, up.h * 0.66, EG_LATTICE, E));
  for (const f of ['left', 'right'] as Face[]) out.push(onFace(up, f, 0, g1 + up.h * 0.18, up.d * 0.6, up.h * 0.6, EG_LATTICE, E));
  out.push(ring(up.w, 0.0016, up.d, stone, { x: up.x, y: h, z: up.z }));
  // A malqaf on the roof: the wind catcher, its open mouth to the north wind.
  const mb: Body = { x: up.x + up.w * 0.22, z: up.z - up.d * 0.2, w: 0.006, d: 0.004, y: h, h: 0.0068 };
  out.push(...box(mb.w, mb.h, mb.d, wood, { x: mb.x, y: h, z: mb.z }), onFace(mb, 'back', 0, h + 0.0012, 0.0046, 0.0046, EG_DARK, E), hip(0.0066, 0.0046, 0.0016, wood, { x: mb.x, y: h + mb.h, z: mb.z }));
  // The canopy of mats out over the street benches; benches, rugs, a brazier and its pots.
  const cz = front + jd + (l.ld - front - jd) * 0.5, cd = (l.ld - front - jd) * 0.85, cw = b.w + 0.002;
  out.push(...stall(cw, cd, g1 * 0.72, 0xc8b088, wood, { x: b.x, z: cz }));
  const rugs = [0x8a2a2a, 0x2a4a6a, 0xa8602a];
  for (const [i, z] of [cz - cd * 0.3, cz + cd * 0.25].entries()) {
    out.push(...box(cw * 0.7, 0.0018, 0.0022, stone, { x: b.x, z }, 0xc8b490));
    out.push(...box(cw * (0.66 - i * 0.05), 0.0002 + i * 0.00007, 0.0022, rugs[i % 3]!, { x: b.x, y: 0.0018, z }));
  }
  out.push(cyl(0.0009, 0.0011, 0.0016, 6, 0x4a3a30, { x: b.x + b.w * 0.36, z: cz }), ...amphora(0.0005, 0.0018, 0xc87a3a, { x: b.x + b.w * 0.36, y: 0.0016, z: cz }));
  out.push(...lamp(b.x - b.w * 0.2, g1 * 0.7, cz), ...lamp(b.x + b.w * 0.2, g1 * 0.7, cz));
  // A palm in the yard beside.
  const px = Math.min(b.x + b.w / 2 + 0.006, l.lw * 0.75);
  out.push(cyl(0.0006, 0.0004, 0.014, 4, 0x7a6448, { x: px, z: b.z, rz: 0.06 }), P(new THREE.OctahedronGeometry(0.0055, 0), 0x5e8a44, { x: px + 0.0008, y: 0.0145, z: b.z, sy: 0.3 }));
  return out;
};
// A masbagha: a dyeworks (the dyers' quarter by Bab Zuwayla). A walled yard
// in striped stone, a gate in it; within, the boiling house under its dome
// and chimney, rows of vats of indigo, madder and saffron let into the
// floor, and lines of new-dyed cloth hung high on poles to dry in the sun;
// bales of undyed cotton waiting; a work hall along the back.
const masbagha: Build = (l) => {
  const stone = pick(l, EG_STONE), wood = pick(l, EG_WOOD), out: G[] = [];
  const hh = wallHeight(1) * 1.3, b: Body = { ...place(l, 0.86, 0.3, 0), h: hh };
  b.z = -l.ld + 0.007 + b.d / 2;
  const fz = b.z + b.d / 2, W = 2 * l.lw * 0.94, D = 2 * l.ld * 0.94;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc8b898));
  out.push(patch(W - 0.002, D - b.d - 0.006, 0xb8a888, 0, (fz + D / 2) / 2, 0.0005)); // the beaten yard
  // The hall along the back, merlons; the dome of the boiling house on it, its chimney.
  out.push(...box(b.w, hh, b.d, stone, { x: b.x, z: b.z }), ...bands(b, [0.002, 0.0052], 0.0016, EG_RED, ['front', 'left', 'right']));
  for (const a of bays(b.w, 3)) out.push(...arch(b, 'front', a, 0, 0.0046, hh * 0.5, EG_DARK, true, E));
  out.push(...merlons(b, hh, 0.0016, 0.006, stone, ['front', 'left', 'right']));
  const dx = b.x - b.w * 0.25, dr = Math.min(b.d * 0.36, 0.0058);
  out.push(cyl(dr, dr, 0.0024, 8, stone, { x: dx, y: hh, z: b.z }), dome(dr, 0xd9c7a3, { x: dx, y: hh + 0.0024, z: b.z, sy: 1.15 }));
  out.push(...stack(0.0026, hh * 0.9, 0x9a7a5a, 0x3a2a24, { x: b.x + b.w * 0.3, y: hh, z: b.z }));
  // The yard wall in ablaq, its gate to the street.
  const wh = 0.0062, gw = 0.0072;
  out.push(...box(0.0012, wh, D - b.d, stone, { x: -W / 2, z: (fz + D / 2) / 2 }), ...box(0.0012, wh, D - b.d, stone, { x: W / 2, z: (fz + D / 2) / 2 }));
  for (const sd of [-1, 1]) {
    const len = (W - gw) / 2, wb: Body = { x: sd * (gw + len) / 2, z: D / 2, w: len, d: 0.0012, y: 0, h: wh };
    out.push(...box(len, wh, 0.0012, stone, { x: wb.x, z: wb.z }), onFace(wb, 'front', 0, 0.0022, len, 0.0016, EG_RED, BAND));
  }
  out.push(...box(gw + 0.0024, 0.0016, 0.0016, EG_RED, { x: 0, y: wh + 0.0012, z: D / 2 }), ...box(0.0012, wh + 0.0012, 0.0016, stone, { x: -gw / 2 - 0.0006, z: D / 2 }), ...box(0.0012, wh + 0.0012, 0.0016, stone, { x: gw / 2 + 0.0006, z: D / 2 }));
  // The vats: indigo, madder, saffron, in rows.
  const vats = [0x1e2a5a, 0x8a2020, 0xd8a020, 0x1e2a5a, 0x2a3a6a, 0x8a2020];
  const vz = fz + (D / 2 - fz) * 0.3;
  for (let i = 0; i < 6; i++) {
    const x = -W * 0.3 + (i % 3) * W * 0.16, z = vz + Math.floor(i / 3) * 0.0042;
    out.push(cyl(0.0016, 0.0016, 0.0016, 7, 0x9a8a72, { x, z }), patch(0.0024, 0.0024, vats[i]!, x, z, 0.00161, 0.4));
  }
  // The cloth drying high on its poles.
  const cloth = [0x2a3a8a, 0xb02a2a, 0xe0b030, 0x3a5aa0, 0xc85a2a];
  out.push(...rack(Math.min(0.02, W * 0.4), 0.0125, cloth, wood, { x: W * 0.2, z: vz }));
  out.push(...rack(Math.min(0.02, W * 0.4), 0.0125, cloth.slice().reverse(), wood, { x: W * 0.2, z: vz + 0.006 }));
  out.push(...sacks(5, 0.0013, 0xe8e0d0, { x: -W * 0.28, z: D / 2 - 0.006 }));
  return out;
};

// ---------- Mesopotamian (islamic) ----------
// Ottoman Baghdad, Mosul and Basra: whitewashed walls and yellow brick,
// houses turned in on their courtyards, wooden oriels (shanasheel) out
// over the lanes, crenellated parapets, domes (houses.ts FIRST_STYLES islamic).
const IQ_WALL = [0xefe9dc, 0xe6dccb, 0xdcd0bc], IQ_DOME = [0xe8e2d4, 0x4a8a8a, 0xc8b8a0], IQ_WOOD = 0x6a4a30, IQ_DARK = 0x3a2a24;
const IQ_BRICK = 0xd2b47e, IQ_TURQ = 0x3a8aa0;
// A qaysariyya: a covered bazaar (after the Qaysariyya of the Khan Mirjan
// quarter), a hall of yellow brick vaults under a row of small domes, each
// with an oculus to light the lane within; a tall pointed portal to the
// street, shops in pointed niches either side with their cloth and carpets
// out on the step; merlons along the front.
const qaysariyya: Build = (l) => {
  const wall = pick(l, IQ_WALL), out: G[] = [];
  const s = storeys(l), h = s.base + s.storey * 1.55, b: Body = { ...place(l, 0.92, 0.74, l.ld * 0.12), h }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xd8ccb4, 0xc8bca4));
  out.push(...box(b.w, h, b.d, IQ_BRICK, { x: b.x, z: b.z }, 0xd8c8a8));
  out.push(onFace(b, 'front', 0, h - 0.0024, b.w, 0.0012, wall, BAND));
  // The portal: a tall frame standing proud, a pointed arch deep within it.
  const pw = Math.min(0.012, b.w * 0.34), pb: Body = { x: b.x, z: front + 0.0012, w: pw, d: 0.0024, y: 0, h: h + 0.004 };
  out.push(...box(pw, pb.h, 0.0024, wall, { x: b.x, z: pb.z }));
  out.push(...arch(pb, 'front', 0, 0, pw * 0.62, h * 0.48, IQ_TURQ, true, E), ...arch(pb, 'front', 0, 0, pw * 0.46, h * 0.44, IQ_DARK, true, E * 2));
  out.push(onFace(pb, 'front', 0, h * 0.86, pw * 0.8, 0.0018, IQ_TURQ, E)); // its tiled inscription band
  // The shops either side: pointed niches, their wares on the step.
  const side = (b.w - pw) / 2, n = Math.max(1, Math.min(3, Math.floor(side / 0.0085))), wares = [0x8a2a2a, 0x2a4a7a, 0xb8862a, 0x4a6a3a, 0xe8e0d0, 0x6a2a5a];
  for (const sd of [-1, 1]) for (const [i, a] of bays(side, n).entries()) {
    const x = sd * (pw / 2 + side / 2) + a, nw = Math.min(0.0058, side / n * 0.7);
    out.push(...arch(b, 'front', x, 0, nw, h * 0.42, IQ_DARK, true, E));
    out.push(...box(nw * 0.9, 0.0008, 0.0022, IQ_WOOD, { x: b.x + x, z: front + 0.0011 }));
    out.push(onFace(b, 'front', x, 0.0008, nw * 0.7, h * 0.36, wares[(i + (sd + 1) * 2) % 6]!, E * 2)); // a carpet hung in the door
    out.push(cyl(0.0006, 0.0006, nw * 0.7, 5, wares[(i + 3) % 6]!, { x: b.x + x + nw * 0.35, y: 0.0014, z: front + 0.0011, rz: Math.PI / 2 }));
  }
  // The roof: domes in a row (two rows when deep), each with a lantern, merlons along the front.
  const rows = b.d > 0.045 ? 2 : 1, nd = Math.max(2, Math.min(4 - rows + 1, Math.round(b.w / 0.016))), r = Math.min(b.w / nd, b.d / rows) * 0.36;
  for (let j = 0; j < rows; j++) for (const a of bays(b.w, nd)) {
    const z = b.z + (rows === 2 ? (j - 0.5) * b.d * 0.5 : 0);
    out.push(dome(r, IQ_BRICK, { x: b.x + a, y: h, z, sy: 0.75 }, 7), cyl(r * 0.22, r * 0.22, 0.0012, 5, wall, { x: b.x + a, y: h + r * 0.72, z }), cyl(r * 0.26, r * 0.26, 0.0002, 5, IQ_DARK, { x: b.x + a, y: h + r * 0.72 + 0.0012, z }));
  }
  out.push(...merlons({ ...b, w: b.w, d: b.d }, h, 0.0016, 0.0055, wall, ['front']));
  return out;
};
// A coppersmith's (Suq al-Safafir, the coppersmiths' market of Baghdad,
// loud with hammering): the workshop open to the street under a wide
// pointed arch, the forge glowing at its back; finished pots, cauldrons
// and trays stacked out front and hung up the wall; over it the master's
// rooms in a shanasheel, a wooden oriel all along the front, its frames
// painted turquoise; a wind catcher (badgir) on the roof to cool the house.
const safafir: Build = (l) => {
  const wall = pick(l, IQ_WALL), out: G[] = [];
  const s = storeys(l), b = place(l, 0.8, 0.62, l.ld * 0.22), front = b.z + b.d / 2, g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xd8ccb4, 0xc8bca4));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }), ...box(b.w + 0.0008, g1, b.d + 0.0008, IQ_BRICK, { x: b.x, z: b.z }));
  const gb: Body = { ...b, w: b.w + 0.0008, d: b.d + 0.0008 };
  // The workshop's arch, the forge glowing within.
  out.push(...arch(gb, 'front', -b.w * 0.08, 0, b.w * 0.62, g1 * 0.5, 0x2a1e18, true, E));
  out.push(onFace(gb, 'front', -b.w * 0.08, 0.001, 0.003, 0.0022, 0xe0702a, E * 2));
  // Copper: cauldrons and pots stacked out front, trays hung on the wall.
  const cu = [0xc87a3a, 0xb8692e, 0xd88a48];
  for (let i = 0; i < 5; i++) {
    const x = b.x - b.w * 0.4 + (i > 2 ? (i - 3) * 0.0034 + 0.0017 : i * 0.0034), y = i > 2 ? 0.0028 : 0, z = front + 0.0032 + (i > 2 ? 0 : (i % 2) * 0.0006);
    out.push(cyl(0.0015, 0.0017, 0.0028, 7, cu[i % 3]!, { x, y, z }), cyl(0.0015, 0.0015, 0.00005, 7, 0x4a2a1a, { x, y: y + 0.0028, z }));
  }
  for (const [i, k] of [0.3, 0.42].entries()) out.push(P(new THREE.CircleGeometry(0.0022 - i * 0.0004, 8), cu[i]!, { x: b.x + k * b.w, y: g1 * 0.55, z: front + 0.0004 + E * (2 + i) }));
  out.push(cyl(0.0016, 0.0012, 0.0024, 8, cu[2]!, { x: b.x + b.w * 0.36, z: front + 0.0028 }));
  // The shanasheel: a wooden oriel along the first floor, turquoise frames, coloured glass.
  const od = 0.0034, oh = s.storey * 0.82, oy = g1 + s.storey * 0.08, ob: Body = { x: b.x, z: front + od / 2, w: b.w * 0.86, d: od, y: oy, h: oh };
  out.push(...box(ob.w, oh, od, IQ_WOOD, { x: b.x, y: oy, z: ob.z }), ...frustum(ob.w * 0.9, od * 0.3, ob.w, od, 0.002, IQ_WOOD, { x: b.x, y: oy - 0.002, z: ob.z }));
  const nb = Math.max(3, Math.min(6, Math.round(ob.w / 0.006)));
  for (const a of bays(ob.w, nb)) out.push(onFace(ob, 'front', a, oy + oh * 0.12, ob.w / nb * 0.8, oh * 0.7, IQ_TURQ, E), onFace(ob, 'front', a, oy + oh * 0.18, ob.w / nb * 0.56, oh * 0.5, 0xb89a5a, E * 2));
  for (const f of ['left', 'right'] as Face[]) out.push(onFace(ob, f, 0, oy + oh * 0.15, od * 0.6, oh * 0.6, IQ_TURQ, E));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: g1, w: 0.0022, h: s.storey * 0.35, spacing: 0.013, sill: s.storey * 0.4, color: IQ_DARK }));
  out.push(...windows(b, 'front', { ...s, floors: 1, base: g1 + s.storey, w: 0.0026, h: s.storey * 0.36, spacing: 0.009, sill: s.storey * 0.35, color: IQ_DARK, frame: IQ_TURQ }));
  // The parapet, merlons, the wind catcher.
  out.push(ring(b.w, 0.0018, b.d, wall, { x: b.x, y: b.h, z: b.z }));
  const m = Math.max(2, Math.floor(b.w / 0.006));
  for (let i = 0; i < m; i++) out.push(...box(0.0018, 0.0016, 0.0012, wall, { x: b.x - b.w / 2 + (i + 0.5) * (b.w / m), y: b.h + 0.0018, z: front - 0.0006 }));
  const wx = b.x + b.w * 0.28, wz = b.z - b.d * 0.22, wb: Body = { x: wx, z: wz, w: 0.0052, d: 0.0052, y: b.h, h: 0.0094 };
  out.push(...box(wb.w, wb.h, wb.d, wall, { x: wx, y: b.h, z: wz }));
  for (const f of ['front', 'left'] as Face[]) out.push(onFace(wb, f, 0, b.h + 0.0046, 0.0032, 0.0036, IQ_DARK, E));
  return out;
};
// A water mill under a noria, as on the Euphrates at Hit and Haditha: the
// great wooden wheel turned by the canal lifts the water in pots on its
// rim and spills it into a trough on an aqueduct of pointed arches, which
// carries it to the mill house; there it turns the stones that grind the
// grain. The mill house whitewashed, a dome over the stones; grain sacks
// and a cart at its door.
const naura: Build = (l) => {
  const wall = pick(l, IQ_WALL), dome_ = pick(l, IQ_DOME), out: G[] = [];
  const hh = wallHeight(1) * 1.3, b: Body = { ...place(l, 0.5, 0.42, 0), h: hh };
  b.x = l.lw - 0.007 - b.w / 2;
  b.z = -l.ld + 0.007 + b.d / 2;
  const fz = b.z + b.d / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xd0c4a8));
  // The canal down the lot's side, between its brick banks.
  const cx = -l.lw * 0.72, cw = Math.min(0.009, l.lw * 0.4);
  out.push(patch(cw, 2 * l.ld * 0.98, 0x4a7a8a, cx, 0, 0.0006));
  for (const sd of [-1, 1]) out.push(...box(0.0012, 0.0012, 2 * l.ld * 0.98, IQ_BRICK, { x: cx + sd * (cw / 2 + 0.0006), z: 0 }));
  // The mill house and its dome.
  out.push(...box(b.w, hh, b.d, wall, { x: b.x, z: b.z }));
  out.push(...arch(b, 'front', -b.w * 0.15, 0, 0.0058, hh * 0.55, IQ_DARK, true, E), onFace(b, 'front', b.w * 0.25, hh * 0.55, 0.0024, 0.003, IQ_DARK, E));
  out.push(ring(b.w, 0.0016, b.d, wall, { x: b.x, y: hh, z: b.z }));
  const dr = Math.min(b.w, b.d) * 0.32;
  out.push(cyl(dr, dr, 0.002, 8, wall, { x: b.x, y: hh, z: b.z }), dome(dr, dome_, { x: b.x, y: hh + 0.002, z: b.z, sy: 1.1 }));
  // The noria: a great closed wheel on its axle between two stone piers, pots round its rim.
  const R = Math.min(0.011, l.ld * 0.42), wz = b.z + b.d * 0.1, ay = R + 0.0006;
  out.push(P(new THREE.CylinderGeometry(R, R, 0.0012, 14, 1, false), 0x6a4a30, { x: cx, y: ay, z: wz, rz: Math.PI / 2 }));
  out.push(P(new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.00125, 14, 1, false), 0x7a5a3a, { x: cx, y: ay, z: wz, rz: Math.PI / 2 }));
  for (let i = 0; i < 3; i++) out.push(P(new THREE.BoxGeometry(0.0013, 0.0004, R * 1.9), 0x4a3220, { x: cx, y: ay, z: wz, rx: (i * Math.PI) / 3 }));
  for (const sd of [-1, 1]) out.push(...box(0.0016, ay + 0.0006, 0.0022, IQ_BRICK, { x: cx + sd * 0.0024, z: wz }));
  out.push(cyl(0.0005, 0.0005, 0.0064, 5, 0x3a3028, { x: cx + 0.0032, y: ay, z: wz, rz: Math.PI / 2 }));
  // The aqueduct from the wheel's top to the mill: a wall on pointed arches, the trough along it.
  const ax0 = cx + 0.0026, ax1 = b.x - b.w / 2, aw = ax1 - ax0, ah = R * 2 + 0.0004, aq: Body = { x: (ax0 + ax1) / 2, z: wz, w: aw, d: 0.0022, y: 0, h: ah };
  out.push(...box(aw, ah, 0.0022, IQ_BRICK, { x: aq.x, z: wz }, 0x4a7a8a));
  const na = Math.max(1, Math.floor(aw / 0.006));
  for (const a of bays(aw, na)) for (const f of ['front', 'back'] as Face[]) out.push(...arch(aq, f, a, 0, Math.min(0.0036, aw / na * 0.62), ah * 0.5, 0x6a5a48, true, E));
  // Sacks of grain and of flour; a cart at the door.
  out.push(...sacks(5, 0.0013, 0xe8dcc0, { x: b.x - b.w * 0.2, z: fz + 0.0034 }));
  out.push(...cart(0.0072, IQ_WOOD, 0x3a2a20, { x: b.x + b.w * 0.05, z: l.ld * 0.72, ry: Math.PI * 0.95 }));
  out.push(...palm(-l.lw * 0.25, l.ld * 0.7, 1.1), ...palm(l.lw * 0.75, l.ld * 0.25, 0.9));
  return out;
};

// ---------- Persian (safavid) ----------
// Safavid Isfahan: sand-coloured brick, portals faced in cobalt and
// turquoise tile, domes, slim minarets, cypresses (styles/triples.ts safavid).
const IR_SAND = [0xd8c39b, 0xcfb88e, 0xe0cca6], IR_TURQ = [0x2a9db0, 0x2a8fb0, 0x30a8a0], IR_COBALT = 0x1f4e8c, IR_DARK = 0x2a2a2a;
const IR_WOOD = 0x6a4a2e, IR_CARPET = [0x8a1e22, 0x9a2a2a, 0x1e2a5a, 0x7a3a1e, 0x2a4a3a];
// A chaykhaneh: a teahouse, its talar (a deep porch under a flat wooden
// roof on tall slender columns, after the Chehel Sotun's) open to the
// street; under it takhts, the low wooden daybeds spread with carpets and
// bolsters where tea was drunk from the samovar and the qalyan smoked; a
// tiled pool before it; the house behind with its tile frieze; cypresses.
const chaykhaneh: Build = (l) => {
  const sand = pick(l, IR_SAND), turq = pick(l, IR_TURQ), s = storeys(l, 0.08), out: G[] = [];
  const g1 = s.base + s.storey, h = s.base + s.storey * 2, td = 0.0095;
  const b: Body = { ...place(l, 0.84, 0.5, td + 0.0055), h }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xc8b490, 0xd8c4a0));
  out.push(...box(b.w, h, b.d, sand, { x: b.x, z: b.z }));
  out.push(ring(b.w + 0.0006, 0.002, b.d + 0.0006, turq, { x: b.x, y: h - 0.003, z: b.z }), ring(b.w, 0.0014, b.d, sand, { x: b.x, y: h, z: b.z }));
  // The room behind the talar: arched doors, a frieze.
  for (const a of bays(b.w, 3)) out.push(...arch(b, 'front', a, 0, 0.0046, g1 * 0.62, IR_DARK, true, E));
  for (const a of bays(b.w, 3)) out.push(...arch(b, 'front', a, g1 + s.storey * 0.25, 0.0026, s.storey * 0.35, IR_DARK, true, E));
  // The talar: tall wooden columns, a flat roof of beams, its painted ceiling.
  const tw = b.w + 0.002, tz = front + td / 2, th = g1 + s.storey * 0.35, nc = Math.max(3, Math.min(5, Math.round(tw / 0.011) + 1));
  for (let i = 0; i < nc; i++) for (const zk of [0.4]) out.push(cyl(0.00045, 0.0004, th, 6, 0x8a6a46, { x: b.x - tw / 2 + 0.0008 + (i * (tw - 0.0016)) / (nc - 1), z: tz + zk * td }));
  out.push(...box(tw, 0.0014, td, IR_WOOD, { x: b.x, y: th, z: tz }, 0x9a8a6a));
  out.push(onFace({ x: b.x, z: tz, w: tw, d: td, y: th, h: 0.0014 }, 'front', 0, th, tw, 0.0014, turq, BAND));
  out.push(patch(tw - 0.001, td - 0.0006, 0xb8a888, b.x, tz, 0.0007));
  // Takhts with carpets and bolsters; the samovar and a qalyan.
  for (const [i, k] of [-0.3, 0.12].entries()) {
    const x = b.x + k * b.w, z = tz + 0.0004 * i;
    out.push(...box(0.0074, 0.0016, 0.0048, IR_WOOD, { x, z }, IR_WOOD), ...box(0.0068, 0.0002, 0.0042, IR_CARPET[i]!, { x, y: 0.0016, z }));
    out.push(cyl(0.00045, 0.00045, 0.006, 5, IR_CARPET[i + 2]!, { x, y: 0.0022, z: z - 0.0018, rz: Math.PI / 2 }));
  }
  const sx = b.x + b.w * 0.38, sz = tz;
  out.push(cyl(0.0007, 0.0009, 0.0024, 6, 0xc8a040, { x: sx, z: sz }), cone(0.0008, 0.0008, 6, 0xd8b050, { x: sx, y: 0.0024, z: sz }), cyl(0.0003, 0.0003, 0.0007, 4, 0xd8b050, { x: sx, y: 0.0032, z: sz }));
  // The pool before it, in turquoise tile; cypresses.
  const pz = front + td + (l.ld - front - td) * 0.5, pw = Math.min(0.012, b.w * 0.4);
  out.push(...box(pw, 0.0008, 0.0042, turq, { x: b.x, z: pz }, 0x3a7aa0));
  out.push(...cypressT(b.x - b.w / 2 - 0.0005 + 0.0016, pz, 1), ...cypressT(b.x + b.w / 2 - 0.0016, pz, 1));
  return out;
};
// A cypress (Persian gardens'): a dark tall cone.
const cypressT = (x: number, z: number, s: number): G[] => [cyl(0.0004 * s, 0.0003 * s, 0.0016 * s, 3, 0x5a4030, { x, z }), cone(0.0016 * s, 0.012 * s, 5, 0x3f5a35, { x, y: 0.0012 * s, z })];
// A carpet merchant's in the Qeysarieh bazaar: a front of two storeys of
// pointed arches like a caravanserai's, a tiled portal at its middle; the
// carpets of Kashan, Isfahan and the tribes hung over the upper gallery's
// rails and heaped by the doors; a wind catcher (badgir) over the store to
// keep the wool cool; a little dome with its lantern over the bazaar lane.
const farshForush: Build = (l) => {
  const sand = pick(l, IR_SAND), turq = pick(l, IR_TURQ), s = storeys(l, 0.08), out: G[] = [];
  const b = place(l, 0.92, 0.62, l.ld * 0.16), front = b.z + b.d / 2, g1 = s.base + s.storey, h = g1 + s.storey * 1.05;
  const bb: Body = { ...b, h };
  out.push(...yard(l, b, 0xc8b490, 0xd8c4a0));
  out.push(...box(b.w, h, b.d, sand, { x: b.x, z: b.z }));
  out.push(ring(b.w, 0.0016, b.d, sand, { x: b.x, y: h, z: b.z }));
  // The portal, tiled: cobalt frame, a turquoise arch.
  const pw = 0.0094, pb: Body = { x: b.x, z: front + 0.001, w: pw, d: 0.002, y: 0, h: h + 0.003 };
  out.push(...box(pw, pb.h, 0.002, IR_COBALT, { x: b.x, z: pb.z }), ...arch(pb, 'front', 0, 0, pw * 0.66, h * 0.52, turq, true, E), ...arch(pb, 'front', 0, 0, pw * 0.4, h * 0.36, IR_DARK, true, E * 2));
  // Two storeys of arches either side: shops below, the gallery above with carpets on its rails.
  const side = (b.w - pw) / 2, n = Math.max(1, Math.min(3, Math.floor(side / 0.0075)));
  let c = 0;
  for (const sd of [-1, 1]) for (const a of bays(side, n)) {
    const x = sd * (pw / 2 + side / 2) + a, aw = Math.min(0.0052, side / n * 0.72);
    out.push(...arch(bb, 'front', x, 0, aw, g1 * 0.5, IR_DARK, true, E));
    out.push(...arch(bb, 'front', x, g1 + 0.0006, aw, s.storey * 0.5, 0x4a3a2a, true, E));
    out.push(onFace(bb, 'front', x, g1 - 0.0008 + 0.0006, aw * 0.94, s.storey * 0.4, IR_CARPET[c % 5]!, E * 2)); // a carpet over the rail
    out.push(onFace(bb, 'front', x, g1 + 0.0004 + 0.0006, aw * 0.6, s.storey * 0.12, shade(IR_CARPET[c % 5]!, 1.5), E * 3));
    c++;
  }
  out.push(onFace(bb, 'front', 0, g1 - 0.0006, b.w, 0.0007, turq, BAND)); // the gallery's tiled band
  // Carpets heaped and rolled at the doors.
  for (let i = 0; i < 3; i++) out.push(...box(0.0052, 0.0005, 0.0034, IR_CARPET[(i + 1) % 5]!, { x: b.x - b.w * 0.32, y: i * 0.0005, z: front + 0.0024, ry: i * 0.12 }));
  for (let i = 0; i < 3; i++) out.push(cyl(0.0005, 0.0005, 0.0048, 5, IR_CARPET[(i + 2) % 5]!, { x: b.x + b.w * 0.3 + (i === 2 ? 0.0005 : 0), y: 0.0005 + (i === 2 ? 0.0009 : 0), z: front + 0.0018 + i * 0.001 - (i === 2 ? 0.0015 : 0), rz: Math.PI / 2 }));
  // The wind catcher and the bazaar's lantern dome.
  const wx = b.x - b.w * 0.3, wz = b.z - b.d * 0.15, wb: Body = { x: wx, z: wz, w: 0.0056, d: 0.0038, y: h, h: 0.012 };
  out.push(...box(wb.w, wb.h, wb.d, sand, { x: wx, y: h, z: wz }));
  for (const f of ['front', 'back'] as Face[]) for (const a of [-0.0014, 0, 0.0014]) out.push(onFace(wb, f, a, h + 0.0062, 0.0008, 0.0046, IR_DARK, E));
  const dr = Math.min(b.w, b.d) * 0.16, dx = b.x + b.w * 0.22, dz = b.z - b.d * 0.1;
  out.push(cyl(dr, dr, 0.0024, 8, sand, { x: dx, y: h, z: dz }), dome(dr, turq, { x: dx, y: h + 0.0024, z: dz, sy: 1.1 }), cyl(dr * 0.25, dr * 0.25, 0.0014, 5, sand, { x: dx, y: h + 0.0024 + dr * 1.05, z: dz }));
  return out;
};
// A yakhchal: an ice house, the works that made ice in the desert. Water
// let in from the qanat on winter nights froze in long shallow pools in
// the shadow of a tall east-west wall; the ice was cut, carried into the
// great stepped dome of mud brick and kept, through the summer, in its
// deep pit. The dome, the shade wall, the pools, the channel, the
// keeper's lodge.
const yakhchal: Build = (l) => {
  const mud = pick(l, [0xc8a878, 0xbf9f70, 0xd0b080]), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xd0bc94));
  // The dome: stepped, a cone of mud brick on a drum, a vent at its top.
  const R = Math.min(Math.min(l.lw, l.ld) * 0.62, 0.02), cx = l.lw - 0.006 - R, cz = -l.ld + 0.006 + R, H = R * 2.1;
  out.push(cyl(R, R * 0.96, R * 0.35, 12, mud, { x: cx, z: cz }));
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const r0 = R * 0.96 * (1 - i / steps), r1 = R * 0.96 * (1 - (i + 1) / steps) + R * 0.08;
    out.push(cyl(r0, Math.max(r1, R * 0.12), (H - R * 0.35) / steps, 12, shade(mud, 1 - i * 0.02), { x: cx, y: R * 0.35 + (i * (H - R * 0.35)) / steps, z: cz }));
  }
  out.push(cyl(R * 0.1, R * 0.1, R * 0.12, 6, shade(mud, 0.9), { x: cx, y: H, z: cz }));
  const dz = cz + R * 0.96;
  out.push(...arch({ x: cx, z: dz - 0.0004, w: 0, d: 0.0008, y: 0, h: 0 }, 'front', 0, 0, 0.0036, 0.004, IR_DARK, true, E));
  // The shade wall, tall, along x, with buttresses; the pools in its shadow (on its north, here behind it).
  const wz = cz + R + 0.0055, ww = 2 * l.lw * 0.94, wh = H * 0.62;
  out.push(...box(ww, wh, 0.0022, mud, { x: 0, z: wz }));
  for (const a of bays(ww, 5)) out.push(...box(0.0018, wh * 0.7, 0.0018, shade(mud, 0.95), { x: a, z: wz + 0.002 }));
  const pz = wz + 0.0011 + (l.ld - wz) * 0.5, pd = (l.ld - wz) * 0.62;
  for (const [i, a] of bays(ww * 0.9, 2).entries()) {
    out.push(...box(ww * 0.42, 0.0008, pd, shade(mud, 0.9), { x: a, z: pz }, i ? 0xdde8ee : 0xc8dce6));
  }
  // The channel from the qanat to the pools; the ice blocks; the keeper's lodge.
  out.push(patch(0.0016, 2 * l.ld * 0.98, 0x5a8a9a, -l.lw * 0.88, 0, 0.0006));
  for (let i = 0; i < 4; i++) out.push(...box(0.0024, 0.0016, 0.0024, 0xe8f0f4, { x: -l.lw * 0.2 + (i % 2) * 0.0028, y: Math.floor(i / 2) * 0.0016, z: wz - 0.0035 - (i % 2) * 0.0004 }));
  const lx = -l.lw + 0.0065 + 0.005, lz = -l.ld + 0.0065 + 0.004, lb: Body = { x: lx, z: lz, w: 0.01, d: 0.008, y: 0, h: 0.0075 };
  out.push(...box(lb.w, lb.h, lb.d, mud, { x: lx, z: lz }), dome(0.0038, mud, { x: lx, y: lb.h, z: lz, sy: 0.7 }, 7), onFace(lb, 'front', 0, 0, 0.0026, 0.0046, IR_DARK, E));
  return out;
};

// ---------- Chinese (tulou) ----------
// Ming and Qing Fujian and Guangdong: the Hakka's rammed-earth rings, and
// on the narrow lots their shophouses (houses.ts eastAsian): earth and
// lime-plastered walls, dark grey tile, timber shop fronts and galleries,
// a thin eave at every floor (styles/triples.ts tulouRing).
const CN_EARTH = [0xc9a575, 0xbf9a6a, 0xd2b080], CN_WALL = [0xebe6da, 0xe2dccc, 0xd9cfba], CN_TILE = 0x3f3a36, CN_ROOF = [0x4f5862, 0x5a5e66, 0x4a5a52];
const CN_WOOD = 0x5a3e28, CN_RED = 0xa8302a, CN_DARK = 0x2a2420;
// A jiulou: a wine house of three floors, as in the Qingming scroll and the
// market towns of the south: timber all the way up, an open front on the
// street, galleries with red railings round the upper floors, an eave of
// grey tile at every floor, red lanterns along them; its long wine banner
// on a pole over the street; jars of rice wine sealed in red paper by the door.
const jiulou: Build = (l) => {
  const wall = pick(l, CN_WALL), tile = pick(l, CN_ROOF), s = storeys(l, 0.06), out: G[] = [];
  const b = place(l, 0.8, 0.62, Math.max(l.ld * 0.16, 0.0105)), front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xb0a890, 0xb0a890));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }));
  // The open ground floor, its shutter boards stacked aside; the timber frame up the front.
  out.push(onFace(b, 'front', 0, 0, b.w * 0.86, s.base + s.storey * 0.78, CN_DARK, E));
  for (let i = 0; i < 4; i++) out.push(onFace(b, 'front', -b.w * 0.4 + i * 0.0007, 0, 0.0006, s.storey * 0.72, i % 2 ? 0x7a5a3a : 0x6a4c30, E * 2));
  for (const sd of [-1, 1]) out.push(...box(0.0012, b.h - 0.0004, 0.0012, CN_WOOD, { x: b.x + sd * (b.w / 2 - 0.0005), z: front - 0.0004 }));
  // The upper floors: lattice windows behind galleries with red railings; eaves at every floor.
  const gd = 0.0026, colors = [0xd8402a, 0xe05030];
  for (let f = 1; f < l.floors; f++) {
    const y = s.base + f * s.storey;
    out.push(...box(b.w + 0.0004, 0.0005, gd, CN_WOOD, { x: b.x, y, z: front + gd / 2 }));
    out.push(onFace({ ...b, d: b.d + gd * 2 }, 'front', 0, y + 0.0005, b.w, 0.0022, CN_RED, 0));
    out.push(...windows(b, 'front', { ...s, floors: 1, base: y, w: b.w / 3 * 0.8, h: s.storey * 0.5, spacing: b.w / 3, sill: s.storey * 0.2, color: 0xa88a5a, frame: CN_WOOD }).filter((_, i) => i < 6));
  }
  for (let f = 1; f <= l.floors; f++) out.push(...frustum(b.w + 0.0075, b.d + 0.006, b.w, b.d, 0.0018, tile, { x: b.x, y: s.base + f * s.storey - 0.0018 + (f < l.floors ? 0.0046 : 0), z: b.z + (f < l.floors ? 0.0012 : 0) }));
  for (const f of ['left', 'right'] as Face[]) out.push(...windows(b, f, { ...s, floors: l.floors - 1, base: s.base + s.storey, w: 0.0026, h: s.storey * 0.36, spacing: 0.011, sill: s.storey * 0.3, color: 0x8a6a48, frame: CN_WOOD }));
  out.push(hip(b.w + 0.003, b.d + 0.003, Math.min(b.w, b.d) * 0.24, tile, { x: b.x, y: b.h, z: b.z }));
  // Lanterns along the eaves.
  for (let f = 1; f < l.floors; f++) for (const a of [-0.36, 0.36]) out.push(...lanternR(b.x + a * b.w, s.base + f * s.storey + 0.002, front + 0.0042, colors[f % 2]!));
  // The wine banner on its pole; the wine jars.
  const px = b.x + b.w / 2 + 0.0022, pz = front + 0.0035, ph = b.h * 0.86;
  out.push(cyl(0.0003, 0.00025, ph, 4, CN_WOOD, { x: px, z: pz }), cyl(0.00015, 0.00015, 0.0062, 3, CN_WOOD, { x: px, y: ph - 0.0006, z: pz, rx: Math.PI / 2 }));
  const ban: Body = { x: px, z: pz + 0.0034, w: 0, d: 0, y: 0, h: 0 };
  out.push(onFace(ban, 'right', 0, ph - 0.0006 - 0.016, 0.0044, 0.016, 0x2a4a8a, 0), onFace(ban, 'right', 0, ph - 0.0006 - 0.0148, 0.0034, 0.0136, 0xf0ead8, 0.00005), onFace(ban, 'right', 0, ph - 0.0006 - 0.0098, 0.0022, 0.0024, CN_DARK, 0.0001), onFace(ban, 'left', 0, ph - 0.0006 - 0.016, 0.0044, 0.016, 0x2a4a8a, 0));
  for (let i = 0; i < 4; i++) {
    const x = b.x - b.w * 0.3 + (i % 2) * 0.0028, z = front + 0.0024 + Math.floor(i / 2) * 0.0026;
    out.push(P(new THREE.SphereGeometry(0.0013, 6, 4), 0x5a3a24, { x, y: 0.0013, z, sy: 1.15 }), cyl(0.0006, 0.0006, 0.0006, 5, CN_RED, { x, y: 0.0026, z }));
  }
  return out;
};
// A red paper lantern on its cord.
const lanternR = (x: number, y: number, z: number, c: number): G[] => [cyl(0.0001, 0.0001, 0.0012, 3, CN_DARK, { x, y: y - 0.0012, z }), P(new THREE.SphereGeometry(0.0009, 6, 3), c, { x, y: y - 0.0021, z, sy: 1.25 })];
// A dangpu: a pawnshop, the bank of the poor, built like a strongroom. A
// tall white-limed block with almost no windows, its gable walls stepped up
// as horse-head fire walls (matouqiang), each step capped in black tile;
// the great character dang (pawn) painted big on its white flank; a stone
// door frame under a little tiled hood, a tall counter within the door,
// an iron-bound shutter; its signboard over the door.
const dangpu: Build = (l) => {
  const wall = 0xf0ece2, tile = pick(l, CN_ROOF), s = storeys(l, 0.06), out: G[] = [];
  const b = place(l, 0.74, 0.66, l.ld * 0.12), front = b.z + b.d / 2, rh = b.d * 0.22;
  out.push(...yard(l, b, 0xb0a890, 0xb0a890));
  out.push(...box(b.w, b.h, b.d, wall, { x: b.x, z: b.z }), ...box(b.w + 0.0008, 0.0032, b.d + 0.0008, 0x8a8a84, { x: b.x, z: b.z }));
  out.push(...gable(b.w - 0.0004, b.d + 0.003, rh, tile, { x: b.x, y: b.h, z: b.z }, false, wall));
  // The horse-head walls: three steps up each gable end to the ridge, black-tiled caps.
  for (const sd of [-1, 1]) for (const k of [0, 1, 2]) {
    const zc = b.d / 2 - (k * b.d) / 6 - b.d / 12, hgt = b.h + rh * (0.35 + k * 0.42), x = b.x + sd * (b.w / 2 - 0.0008);
    for (const zs of [1, -1]) {
      if (k === 2 && zs === -1) continue;
      const z = b.z + zs * (k === 2 ? 0 : zc), dd = k === 2 ? b.d / 3 : b.d / 6;
      out.push(...box(0.0016, hgt, dd, wall, { x, z }), ...box(0.0026, 0.0007, dd + 0.0012, tile, { x, y: hgt, z }), cone(0.0007, 0.0012, 4, tile, { x, y: hgt + 0.0007, z: z + zs * (dd / 2 + 0.0003), ry: Math.PI / 4 }));
    }
  }
  // Dang on the flank: a black square of strokes on the white.
  const cb: Body = { ...b, w: b.w + 0.0032 };
  for (const f of ['left', 'right'] as Face[]) {
    const cy = b.h * 0.42, cs = Math.min(b.d * 0.5, b.h * 0.42);
    out.push(onFace(cb, f, 0, cy, cs, cs, CN_DARK, E), onFace(cb, f, 0, cy + cs * 0.12, cs * 0.76, cs * 0.76, wall, E * 2));
    out.push(onFace(cb, f, 0, cy + cs * 0.3, cs * 0.6, cs * 0.08, CN_DARK, E * 3), onFace(cb, f, 0, cy + cs * 0.52, cs * 0.6, cs * 0.08, CN_DARK, E * 3), onFace(cb, f, 0, cy + cs * 0.3, cs * 0.08, cs * 0.5, CN_DARK, E * 3.5), onFace(cb, f, cs * 0.22, cy + cs * 0.68, cs * 0.08, cs * 0.18, CN_DARK, E * 3), onFace(cb, f, -cs * 0.22, cy + cs * 0.68, cs * 0.08, cs * 0.18, CN_DARK, E * 3));
  }
  // The door: a stone frame, the counter's dark within, a hood of tile, the signboard; two small high windows.
  const dh = Math.min(0.012, s.storey * 0.8);
  out.push(onFace(b, 'front', 0, 0, 0.0074, dh + 0.0008, 0xb8b4a8, E), onFace(b, 'front', 0, 0, 0.0058, dh, CN_DARK, E * 2), onFace(b, 'front', 0, dh * 0.45, 0.0058, 0.0008, CN_WOOD, E * 3));
  out.push(...box(0.0105, 0.0006, 0.0034, tile, { x: b.x, y: dh + 0.0026, z: front + 0.0017 }), hip(0.0105, 0.0034, 0.0012, tile, { x: b.x, y: dh + 0.0032, z: front + 0.0017 }));
  out.push(...signBoard(b, 'front', 0, dh + 0.0044, 0.009, 0.0024, CN_DARK, 0xd8b04a));
  for (const a of [-b.w * 0.3, b.w * 0.3]) out.push(onFace(b, 'front', a, b.h * 0.7, 0.0018, 0.0018, CN_DARK, E));
  return out;
};
// A dragon kiln (longyao), as at Dehua and Jingdezhen: a long tunnel kiln
// built up a slope (here up its stepped earth bank), fired from a mouth at
// its foot and through stoke holes all along its sides, its flue at the
// top; a long roof on posts over it. Round it the potters' shed and wheel,
// boards of bowls drying, stacks of saggars, bundles of pine to fire it,
// blue-and-white jars ready to go.
const longyao: Build = (l) => {
  const earth = pick(l, CN_EARTH), wall = pick(l, CN_WALL), out: G[] = [];
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xb8a888));
  // The bank, in three steps, rising to the back; the kiln up it.
  const kx = l.lw * 0.35, len = 2 * l.ld * 0.82, kw = 0.0075, z0 = l.ld * 0.82, z1 = z0 - len, rise = 0.0072, r = 0.0032;
  for (let i = 0; i < 3; i++) out.push(...box(kw + 0.0034, rise * (i + 1) / 3, len * (3 - i) / 3, earth, { x: kx, z: z1 + len * (3 - i) / 6 }));
  const ang = Math.atan2(rise, len), mid = rise / 2 + 0.0004;
  out.push(P(new THREE.CylinderGeometry(r, r, len * 1.0, 9, 1, true, -Math.PI / 2, Math.PI), 0x9a5a3a, { x: kx, y: mid + 0.0012, z: (z0 + z1) / 2, rx: Math.PI / 2 - ang }));
  out.push(P(new THREE.CircleGeometry(r, 5, 0, Math.PI), 0x8a4a30, { x: kx, y: 0.0012 + 0.0004, z: z0 + 0.00002 }), P(new THREE.CircleGeometry(r * 0.5, 4, 0, Math.PI), 0x1e1a16, { x: kx, y: 0.0012 + 0.0004, z: z0 + E }));
  for (let i = 1; i < 6; i++) for (const sd of [-1, 1]) {
    const t = i / 6, z = z0 - t * len, y = 0.0012 + 0.0004 + t * rise + r * 0.45;
    out.push(P(new THREE.PlaneGeometry(0.0009, 0.0009), 0x2a1e18, { x: kx + sd * (r * 0.9 + E * 4), y, z, ry: sd * Math.PI / 2 }));
  }
  out.push(...stack(0.0034, 0.0075, 0x9a5a3a, 0x2a2420, { x: kx, y: rise, z: z1 + 0.002 }));
  // The long roof over it on posts, stepping up with the bank.
  for (let i = 0; i < 3; i++) {
    const zc = z0 - (i + 0.5) * len / 3, y = 0.0105 + (i + 1) * rise / 3;
    out.push(...gable(kw + 0.006, len / 3 + 0.0016, 0.0034, CN_TILE, { x: kx, y, z: zc }, true, CN_TILE));
    for (const sd of [-1, 1]) out.push(cyl(0.00025, 0.00025, y - rise * i / 3, 4, CN_WOOD, { x: kx + sd * (kw / 2 + 0.0024), y: rise * i / 3, z: zc }));
  }
  // The potters' shed: plastered, a tile roof, open front with the wheel.
  const sw = Math.min(0.016, l.lw * 0.8), sd_ = 0.011, sx = -l.lw + 0.007 + sw / 2, sz = -l.ld + 0.007 + sd_ / 2, sb: Body = { x: sx, z: sz, w: sw, d: sd_, y: 0, h: 0.0095 };
  out.push(...box(sw, sb.h, sd_, wall, { x: sx, z: sz }), ...gable(sw + 0.003, sd_ + 0.003, 0.004, CN_TILE, { x: sx, y: sb.h, z: sz }, false, wall));
  out.push(onFace(sb, 'front', 0, 0, sw * 0.7, sb.h * 0.7, CN_DARK, E), cyl(0.0012, 0.0012, 0.0016, 7, 0x8a6a4a, { x: sx, z: sz + sd_ / 2 + 0.0016 }));
  // Boards of bowls drying, saggars, pine bundles, finished jars.
  for (const [i, z] of [l.ld * 0.05, l.ld * 0.35].entries()) {
    const bx = -l.lw * 0.35;
    out.push(...box(0.012, 0.0024, 0.0016, CN_WOOD, { x: bx, z }, 0x8a6a4a));
    for (let k = 0; k < 4; k++) out.push(cyl(0.0006, 0.0004, 0.0006, 6, i ? 0xf0ece0 : 0xd8d0c0, { x: bx - 0.0045 + k * 0.003, y: 0.0024, z }));
  }
  for (let i = 0; i < 3; i++) out.push(cyl(0.0014, 0.0014, 0.0012 * (3 - (i % 2)), 7, 0xa89a88, { x: -l.lw * 0.6 + i * 0.0031, z: l.ld * 0.72 }));
  out.push(...logs(6, 0.007, 0.0006, 0x8a7a5a, { x: -l.lw * 0.05, z: -l.ld * 0.3, ry: Math.PI / 2 }));
  for (let i = 0; i < 3; i++) out.push(...amphora(0.0012, 0.0034, i % 2 ? 0x2a4a9a : 0xeeeae0, { x: -l.lw * 0.1 + i * 0.0027, z: l.ld * 0.78 }));
  return out;
};

// ---------- Japanese (kura) ----------
// Edo and Meiji merchant towns (Kawagoe, Kurashiki, Nada): fireproof
// storehouses of thick plaster, white or lacquered black, namako tiles
// round their feet, heavy tiled roofs with thick ridges and onigawara at
// their ends (styles/triples.ts kura).
const JP_PLASTER = [0xf3f1ea, 0xeeebe2, 0xf0ece0], JP_TILE = 0x33373d, JP_NAMAKO = 0x4a4f55;
const JP_BLACK = 0x2c2c30, JP_WOOD = 0x6a4c30, JP_INDIGO = 0x22305a, JP_DARK = 0x2b2f33;
// A heavy kura roof: a gable, its thick ridge, the onigawara at its ends.
function kuraRoof(b: Body, rh: number, end: number, out: G[], ridgeH = 0.0018): void {
  out.push(...gable(b.w + 0.005, b.d + 0.006, rh, JP_TILE, { x: b.x, y: b.y + b.h, z: b.z }, false, end));
  out.push(...box(b.w + 0.0046, ridgeH, 0.0022, JP_TILE, { x: b.x, y: b.y + b.h + rh - 0.0008, z: b.z }));
  for (const sx of [-1, 1]) out.push(...box(0.0018, ridgeH + 0.0014, 0.0028, JP_TILE, { x: b.x + sx * (b.w / 2 + 0.0025), y: b.y + b.h + rh - 0.0008, z: b.z }));
}
// A misegura: a shop-storehouse of the kura-zukuri merchants of Kawagoe,
// built after the great fire of 1893 to stand the next: two storeys of
// thick plaster lacquered black, a massive roof with a ridge a hand high and
// great onigawara; the shop opened across its whole front under a deep
// tiled eave, indigo noren hung in it with the house's white crest; the
// thick fire doors folded back at the upper window; the shop's
// signboard over the eave; namako round the sides.
const misegura: Build = (l) => {
  const s = storeys(l, 0.08), out: G[] = [];
  const h = s.base + s.storey * 2.1, b: Body = { ...place(l, 0.84, 0.6, Math.max(l.ld * 0.2, 0.0085)), h }, front = b.z + b.d / 2, g1 = s.base + s.storey;
  out.push(...yard(l, b, 0xc8c4b8, 0xb8b4a8));
  out.push(...box(b.w, h, b.d, JP_BLACK, { x: b.x, z: b.z }));
  // Namako round the sides.
  const nh = Math.min(0.009, h * 0.3);
  for (const f of ['left', 'right'] as Face[]) {
    out.push(onFace(b, f, 0, 0, b.d, nh, 0xf0ece0, BAND));
    const n = Math.max(2, Math.floor(b.d / 0.0045));
    for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) out.push(tilted(b, f, -b.d / 2 + (i + 0.5) * (b.d / n), (r + 0.5) * (nh / 2), 0.0024, 0.0024, Math.PI / 4, JP_NAMAKO, E));
  }
  // The shop front: open, dark, lattice at its ends, the noren across it.
  out.push(onFace(b, 'front', 0, 0, b.w * 0.9, g1 * 0.82, 0x3a2a20, E));
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) out.push(onFace(b, 'front', sd * (b.w * 0.39 - i * 0.0009), 0, 0.0004, g1 * 0.8, JP_WOOD, E * 2));
  const nn = Math.max(3, Math.min(6, Math.round(b.w / 0.0075)));
  for (const a of bays(b.w * 0.6, nn)) out.push(onFace(b, 'front', a, g1 * 0.45, b.w * 0.6 / nn - 0.0003, g1 * 0.36, JP_INDIGO, E * 2), onFace(b, 'front', a, g1 * 0.6, 0.0018, 0.0018, 0xf0ece0, E * 3));
  // The deep eave over the shop, its tiles; the signboard over it.
  out.push(...box(b.w + 0.003, 0.0006, 0.0066, JP_TILE, { x: b.x, y: g1 * 0.86, z: front + 0.0033 }));
  out.push(...leanTo(b.w + 0.003, 0.0068, g1 * 0.86 + 0.0034, g1 * 0.86 + 0.0006, JP_TILE, JP_WOOD, { x: b.x, z: front }));
  out.push(...signBoard(b, 'front', 0, g1 + s.storey * 0.12, b.w * 0.5, 0.0034, 0x8a6a40, JP_DARK, E));
  // The upper window, its fire doors thick and folded back, white within.
  const wy = g1 + s.storey * 0.4, ww = 0.0046, wh = s.storey * 0.42;
  out.push(onFace(b, 'front', 0, wy, ww, wh, 0x3a3a3a, E), onFace(b, 'front', 0, wy - 0.0006, ww + 0.0016, 0.0006, JP_BLACK, E * 2));
  for (const sd of [-1, 1]) out.push(...box(0.0024, wh, 0.0012, JP_BLACK, { x: b.x + sd * (ww / 2 + 0.0014), y: wy, z: front + 0.0006 }, JP_BLACK), onFace({ x: b.x + sd * (ww / 2 + 0.0014), z: front + 0.0006, w: 0.0024, d: 0.0012, y: wy, h: wh }, 'front', 0, wy + 0.0004, 0.0016, wh - 0.0008, 0xf0ece0, E));
  // The roof: heavy, its ridge doubled, the onigawara great.
  kuraRoof(b, Math.min(b.w, b.d) * 0.34, JP_BLACK, out, 0.0032);
  for (const sx of [-1, 1]) out.push(...box(0.0024, 0.0062, 0.0032, JP_TILE, { x: b.x + sx * (b.w / 2 + 0.0026), y: h + Math.min(b.w, b.d) * 0.34 - 0.0008, z: b.z }));
  return out;
};
// A gofuku-ya: a kimono draper's, like Mitsui's Echigoya in Edo. A broad
// timber merchant house of two storeys and a half, its ground floor in
// lattice (koshi) behind long indigo noren with the house's crest; a low
// upper floor of plaster with slatted mushiko windows; udatsu (little
// fire walls) roofed at either end; a big signboard standing on the roof
// over the street; bolts of silk and cotton shown on a bench.
const gofukuya: Build = (l) => {
  const plaster = pick(l, JP_PLASTER), s = storeys(l, 0.08), out: G[] = [];
  const g1 = s.base + s.storey, h = g1 + s.storey * 0.75, b: Body = { ...place(l, 0.92, 0.6, Math.max(l.ld * 0.16, 0.0095)), h }, front = b.z + b.d / 2;
  out.push(...yard(l, b, 0xc8c4b8, 0xb8b4a8));
  out.push(...box(b.w, h, b.d, plaster, { x: b.x, z: b.z }), ...box(b.w + 0.0006, g1, b.d + 0.0006, JP_WOOD, { x: b.x, z: b.z }));
  const gb: Body = { ...b, w: b.w + 0.0006, d: b.d + 0.0006 };
  // The koshi lattice across the front, the noren long over the door.
  out.push(onFace(gb, 'front', 0, 0, b.w * 0.94, g1 * 0.86, 0xa8865a, E));
  const nl = Math.max(8, Math.min(20, Math.round(b.w / 0.002)));
  for (let i = 0; i < nl; i++) out.push(onFace(gb, 'front', -b.w * 0.47 + (i + 0.5) * (b.w * 0.94 / nl), 0, 0.0004, g1 * 0.86, 0x5a3e24, E * 2));
  const nw = b.w * 0.5;
  for (const a of bays(nw, 4)) out.push(onFace(gb, 'front', b.w * 0.12 + a, g1 * 0.2, nw / 4 - 0.0003, g1 * 0.62, JP_INDIGO, E * 3), onFace(gb, 'front', b.w * 0.12 + a, g1 * 0.62, 0.0022, 0.0022, 0xf0ece0, E * 4));
  // A pent eave over the ground floor.
  out.push(...leanTo(b.w + 0.003, 0.0045, g1 + 0.0026, g1 - 0.0004, JP_TILE, JP_WOOD, { x: b.x, z: front }));
  // The low upper floor: mushiko windows, slatted.
  for (const a of bays(b.w, 3)) {
    out.push(onFace(b, 'front', a, g1 + s.storey * 0.24, 0.0072, s.storey * 0.32, JP_DARK, E));
    for (let i = 0; i < 6; i++) out.push(onFace(b, 'front', a - 0.0031 + i * 0.00124, g1 + s.storey * 0.24, 0.0005, s.storey * 0.32, plaster, E * 2));
  }
  // The roof, the udatsu at its ends, the signboard standing on it.
  const rh = b.d * 0.22;
  out.push(...gable(b.w + 0.004, b.d + 0.006, rh, JP_TILE, { x: b.x, y: h, z: b.z }, false, plaster));
  for (const sd of [-1, 1]) out.push(...box(0.0016, s.storey * 0.6, b.d * 0.5, plaster, { x: b.x + sd * (b.w / 2 + 0.0004), y: g1 + 0.002, z: front - b.d * 0.25 - 0.0002 }), ...box(0.0026, 0.0008, b.d * 0.5 + 0.0012, JP_TILE, { x: b.x + sd * (b.w / 2 + 0.0004), y: g1 + 0.002 + s.storey * 0.6, z: front - b.d * 0.25 - 0.0002 }));
  const kw = Math.min(b.w * 0.5, 0.024), ky = h + rh * 0.5, kb: Body = { x: b.x, z: b.z + b.d * 0.12, w: kw, d: 0.0008, y: ky, h: 0.0068 };
  out.push(...box(kw, 0.0068, 0.0008, 0x8a6a40, { x: kb.x, y: ky, z: kb.z }), ...box(kw + 0.0012, 0.0008, 0.0024, JP_TILE, { x: kb.x, y: ky + 0.0068, z: kb.z }));
  for (let i = 0; i < 4; i++) out.push(onFace(kb, 'front', -kw * 0.36 + i * kw * 0.24, ky + 0.0016, kw * 0.14, 0.0038, JP_DARK, E));
  for (const sd of [-1, 1]) out.push(cyl(0.0003, 0.0003, rh * 0.6, 4, JP_WOOD, { x: kb.x + sd * kw * 0.4, y: h + rh * 0.2, z: kb.z - 0.0006 }));
  // Bolts on a bench out front.
  const bz = front + 0.006;
  out.push(...box(b.w * 0.36, 0.0022, 0.0022, JP_WOOD, { x: b.x - b.w * 0.24, z: bz }));
  [0x8a2a3a, 0xe0d0b0, 0x2a4a7a, 0x6a7a3a, 0xc85a3a].forEach((c, i) => out.push(...box(0.0018, 0.0007, 0.0016, c, { x: b.x - b.w * 0.24 - b.w * 0.14 + i * b.w * 0.07, y: 0.0022, z: bz })));
  return out;
};
// A sakagura: a sake brewery, as at Nada and Fushimi. Long white storehouses
// boarded below in charred cedar, heavy tiled roofs; a sugidama (a ball of
// cedar sprigs) hung at the gate, green when the new sake is pressed; the
// brick chimney of the Meiji rice steamer; straw-wrapped casks (komodaru)
// stacked to ship; the great wooden vats turned out to dry; straw bales of
// rice; the well whose water made the sake.
const sakagura: Build = (l) => {
  const plaster = pick(l, JP_PLASTER), out: G[] = [];
  const hh = wallHeight(1) * 1.45, b: Body = { ...place(l, 0.86, 0.36, 0), h: hh };
  b.z = -l.ld + 0.007 + b.d / 2;
  const fz = b.z + b.d / 2;
  out.push(patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, 0xc0bcb0));
  // The long brewhouse: white above, charred boards below, a door with the sugidama over it.
  out.push(...box(b.w, hh, b.d, plaster, { x: b.x, z: b.z }));
  for (const f of ['front', 'left', 'right'] as Face[]) out.push(onFace(b, f, 0, 0, (f === 'front' ? b.w : b.d), hh * 0.45, 0x2e2a28, BAND));
  for (const f of ['front'] as Face[]) for (let i = 0; i < Math.floor(b.w / 0.0016); i++) out.push(onFace(b, f, -b.w / 2 + 0.0008 + i * 0.0016, 0, 0.00025, hh * 0.45, 0x1e1a18, E * 0.6));
  out.push(onFace(b, 'front', -b.w * 0.22, 0, 0.0062, hh * 0.52, 0x4a3a2a, E));
  for (const a of [0.08, 0.32]) out.push(onFace(b, 'front', a * b.w, hh * 0.64, 0.0028, 0.0022, JP_DARK, E));
  out.push(cyl(0.0001, 0.0001, 0.0012, 3, JP_DARK, { x: b.x - b.w * 0.22, y: hh * 0.6 - 0.0012, z: fz + 0.0024 }), P(new THREE.SphereGeometry(0.0018, 7, 4), 0x5a7a3a, { x: b.x - b.w * 0.22, y: hh * 0.6 - 0.0028, z: fz + 0.0024 }));
  kuraRoof(b, b.d * 0.3, plaster, out);
  // A lower kura beside, its gable to the yard.
  const k: Body = { x: l.lw - 0.007 - 0.0065, z: fz + 0.0085, w: 0.013, d: 0.011, y: 0, h: 0.0095 };
  if (2 * l.ld > 0.06) {
    out.push(...box(k.w, k.h, k.d, plaster, { x: k.x, z: k.z }), onFace(k, 'front', 0, 0, k.w, 0.0034, JP_NAMAKO, BAND), onFace(k, 'front', 0, 0, 0.0036, 0.0056, JP_DARK, E));
    out.push(...gable(k.w + 0.003, k.d + 0.003, 0.0042, JP_TILE, { x: k.x, y: k.h, z: k.z }, true, plaster));
  }
  // The chimney: brick, tall, tapering.
  out.push(...box(0.0048, 0.003, 0.0048, 0x8a4a34, { x: b.x + b.w * 0.36, z: b.z - b.d / 2 - 0.0032 }), cyl(0.0021, 0.0013, hh * 1.9, 4, 0x9a4e36, { x: b.x + b.w * 0.36, y: 0.003, z: b.z - b.d / 2 - 0.0032, ry: Math.PI / 4 }));
  smokeFrom(b.x + b.w * 0.36, 0.003 + hh * 1.9, b.z - b.d / 2 - 0.0032);
  // Casks stacked in a pyramid; vats upside down; rice bales; the well.
  const cx = -l.lw * 0.4, cz = l.ld * 0.62;
  for (const [x, y] of [[-1, 0], [0, 0], [1, 0], [-0.5, 1], [0.5, 1], [0, 2]] as const) out.push(cyl(0.0012, 0.0012, 0.0026, 7, 0xd8c890, { x: cx + x * 0.0026, y: 0.0012 + y * 0.0022, z: cz, rx: Math.PI / 2 }), P(new THREE.CircleGeometry(0.0011, 7), 0xb8302a, { x: cx + x * 0.0026, y: 0.0012 + y * 0.0022, z: cz + 0.00132 }));
  for (const [i, x] of [0.15, 0.45].entries()) out.push(cyl(0.0034 - i * 0.0004, 0.003 - i * 0.0004, 0.0044, 9, 0x9a7a52, { x: x * l.lw, z: l.ld * 0.45 + i * 0.002 }, ), P(new THREE.CircleGeometry(0.003 - i * 0.0004, 9).rotateX(-Math.PI / 2), 0x8a6a46, { x: x * l.lw, y: 0.0044, z: l.ld * 0.45 + i * 0.002 }));
  for (let i = 0; i < 4; i++) out.push(cyl(0.0011, 0.0011, 0.0028, 6, 0xd0c088, { x: -l.lw * 0.1 + (i % 2) * 0.003, y: 0.0011 + Math.floor(i / 2) * 0.002, z: fz + 0.004, rz: Math.PI / 2 }));
  out.push(cyl(0.0017, 0.0017, 0.0018, 8, 0x8a8a84, { x: l.lw * 0.6, z: l.ld * 0.82 }), ...box(0.0042, 0.0004, 0.0004, JP_WOOD, { x: l.lw * 0.6, y: 0.0042, z: l.ld * 0.82 }));
  for (const sd of [-1, 1]) out.push(cyl(0.0002, 0.0002, 0.0042, 4, JP_WOOD, { x: l.lw * 0.6 + sd * 0.002, z: l.ld * 0.82 }));
  return out;
};

export const TRIPLES1_TRADE = {
  insula: { shops: [vinaria, caupona], works: figlina },
  neoclassical: { shops: [kafeneion, stoa], works: kapnapothiki },
  renaissance: { shops: [soportales, bodega], works: espaderia },
  colonial: { shops: [portales, pulqueria], works: talavera },
  mamluk: { shops: [wakala, qahwa], works: masbagha },
  islamic: { shops: [qaysariyya, safafir], works: naura },
  safavid: { shops: [chaykhaneh, farshForush], works: yakhchal },
  tulou: { shops: [jiulou, dangpu], works: longyao },
  kura: { shops: [misegura, gofukuya], works: sakagura },
} satisfies Record<string, Trade>;
