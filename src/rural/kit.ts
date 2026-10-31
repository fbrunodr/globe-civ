// The countryside's working kit: the people who work the land (farmers,
// herders, hunters, pickers, miners, woodcutters), the animals (creatures.ts),
// and what each improvement shows as its owner's techs take it on
// (rural/stages.ts): a first farm's hoes, the plough team, haycarts,
// windpumps and silos, tractors and combines; fences of wattle, rails and
// wire; hunters' tents and lodges and sawmills; adits, headframes,
// smelters; treadwheel and steam cranes; canoes, sailing boats, trawlers;
// derricks, pumpjacks and tanks. Then the plants of the plantations, and
// what each resource looks like in the wild (wild grain, rock with its
// vein, a vine over a bush, a school of fish).
//
// Built in metres, facing +x (people and animals: their faces), standing
// on y = 0, scaled to tile steps at the end (CREATURE_SCALE); smooth-shaded
// where round (propMaterial.ts `smooth`). Leaf parts (COAT) take each
// instance's colour: a tunic, a coat, a tractor's paint, an ore's tint.

import * as THREE from 'three';
import { tf, type Tf } from '../propCatalog.ts';
import { finish, tube, ellipsoid, horn, fleece, loft, smooth, S, creature, COAT, coat, CREATURE_SCALE, type Paint, type Species } from '../creatures.ts';
import { person, hatShapes, hairShapes, handAt, HANG, HOLD, WORK, RAISE, SKIN_PAINT, CLOTH_PAINT, type ArmPose, type Dress, type Part } from '../people.ts';

type G = THREE.BufferGeometry;
type V3 = readonly [number, number, number];
const P = (g: G, c: Paint, o: Tf = {}): G => finish(g.applyMatrix4(tf(o)), c);
const box = (w: number, h: number, d: number, c: Paint, o: Tf = {}) => P(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, o);
const cyl = (r0: number, r1: number, h: number, n: number, c: Paint, o: Tf = {}) => P(new THREE.CylinderGeometry(r1, r0, h, n).translate(0, h / 2, 0), c, o);
const cone = (r: number, h: number, n: number, c: Paint, o: Tf = {}) => P(new THREE.ConeGeometry(r, h, n).translate(0, h / 2, 0), c, o);
const beam = (a: V3, b: V3, r: number, c: Paint, n = 6) => tube([a, b], [r, r], c, n, 1);
const wheel = (r: number, w: number, c: Paint, o: Tf = {}, spokes = 0, hub = 0x3a3028) => {
  const out = [P(new THREE.TorusGeometry(r - w * 0.3, w * 0.35, 6, 18), c, o)];
  for (let i = 0; i < spokes; i++) out.push(P(new THREE.BoxGeometry(w * 0.3, r * 1.8, w * 0.3), c, { ...o, rz: (o.rz ?? 0) + (i / spokes) * Math.PI }));
  if (spokes) out.push(P(new THREE.CylinderGeometry(w * 0.6, w * 0.6, w * 1.2, 8).rotateX(Math.PI / 2), hub, o));
  return out;
};
const tyre = (r: number, w: number, o: Tf, rim: Paint) => [P(new THREE.TorusGeometry(r - w * 0.35, w * 0.45, 8, 20), 0x1e1c1a, o), P(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 0.8, 14).rotateX(Math.PI / 2), rim, o)];

const TIMBER = 0x7a5f45, DARK_WOOD = 0x5a4632, IRON = 0x4a4a4e, STEEL = 0x8a8e92, STRAW = 0xd2b46a, HAY = 0xc8a85a, STONE = 0xa8a090, CANVAS = 0xd8ccb0;
const SKINS = [0xd8a982, 0xc48c64, 0xe8bf9f, 0x9c6a46, 0xb07a52] as const;

// ---- people ----
// A worker: its body (people.ts) at 1.72 m, its cloth the instance's colour
// (leaf), its skin one of a few tones (by variant), trousers and hat.
function worker(dress: Dress, armL: ArmPose, armR: ArmPose, skin: number, extra: (hL: THREE.Vector3, hR: THREE.Vector3) => G[], hat?: 'straw' | 'felt' | 'hood', hair: 'short' | 'long' | 'bun' | 'beard' = 'short'): G[] {
  const parts: Part[] = person(dress, armL, armR);
  const sk = new THREE.Color(skin), w = new THREE.Color(SKIN_PAINT), cl = new THREE.Color(CLOTH_PAINT);
  const out = parts.map((p) => {
    const col = p.geo.getAttribute('color') as THREE.BufferAttribute, mask = p.geo.getAttribute('leafMask') as THREE.BufferAttribute;
    for (let i = 0; i < col.count; i++) {
      const r = col.getX(i), g = col.getY(i);
      if (p.tag === 'skin' && Math.abs(r - w.r) < 1e-3 && Math.abs(g - w.g) < 1e-3) col.setXYZ(i, sk.r, sk.g, sk.b);
      else if (p.tag === 'team') { const sh = r / cl.r; col.setXYZ(i, sh, sh, sh); mask.setX(i, 1); }
    }
    return p.geo;
  });
  out.push(...hairShapes(hair).map((g) => recolor(g, 0x3a2a1e)));
  if (hat) out.push(...hatShapes(hat, hat === 'straw' ? 0xd8bc78 : hat === 'felt' ? 0x4a3a2a : 0x6a5a48));
  out.push(...extra(handAt(1, armL, dress.female), handAt(-1, armR, dress.female)));
  // (People face +z; the kit faces +x. 1 tall: 1.72 m.)
  const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeScale(1.72, 1.72, 1.72));
  return out.map((g) => g.applyMatrix4(m));
}
const recolor = (g: G, c: number): G => { const col = g.getAttribute('color') as THREE.BufferAttribute, k = new THREE.Color(c); for (let i = 0; i < col.count; i++) col.setXYZ(i, k.r, k.g, k.b); return g; };
const vv = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];
const TROUSERS = 0x5a4a38;
// (Tools, in figure units: a figure is 1 tall.)
const hoe = (hR: THREE.Vector3, hL: THREE.Vector3) => { const a = hL.clone().add(new THREE.Vector3(0, 0.35, -0.1)), b = hR.clone().add(hR.clone().sub(a).normalize().multiplyScalar(0.25)); return [beam(vv(a), vv(b), 0.012, TIMBER), box(0.09, 0.05, 0.012, IRON, { x: b.x, y: b.y - 0.03, z: b.z })]; };
const staffIn = (h: THREE.Vector3) => [beam([h.x, 0.02, h.z], [h.x, h.y + 0.55, h.z], 0.012, TIMBER), ...[0, 1].map((i) => beam([h.x, h.y + 0.55, h.z], [h.x + 0.05 * (i ? 1 : -1) * 0, h.y + 0.62, h.z + 0.06], 0.011, TIMBER))];
const bowIn = (h: THREE.Vector3) => [tube([[h.x, h.y + 0.36, h.z - 0.05], [h.x, h.y, h.z + 0.04], [h.x, h.y - 0.36, h.z - 0.05]], [0.007, 0.011, 0.007], TIMBER, 5, 3), beam([h.x, h.y + 0.36, h.z - 0.05], [h.x, h.y - 0.36, h.z - 0.05], 0.002, 0xd8d0c0, 3)];
const quiver = () => [cyl(0.034, 0.03, 0.3, 8, 0x6a4a30, { x: 0.05, y: 0.5, z: -0.09, rz: -0.3 }), ...[0, 1, 2].map((i) => beam([-0.03 + i * 0.012, 0.77, -0.09], [-0.05 + i * 0.012, 0.83, -0.095], 0.005, 0xe0d8c8, 3))];
const gunIn = (hR: THREE.Vector3, hL: THREE.Vector3) => { const muzzle = hL.clone().add(new THREE.Vector3(0, 0.34, 0.06)); return [beam(vv(hR.clone().add(new THREE.Vector3(0, -0.08, -0.03))), vv(hL), 0.018, DARK_WOOD), beam(vv(hL), vv(muzzle), 0.01, IRON)]; };
const basket = () => [cyl(0.08, 0.1, 0.16, 10, 0xb08a52, { y: 0.56, z: -0.12 }), cyl(0.098, 0.098, 0.012, 10, 0x8a6a3a, { y: 0.72, z: -0.12 })];
const pickOnShoulder = () => [beam([0.1, 0.5, -0.12], [0.16, 0.95, 0.12], 0.012, TIMBER), tube([[0.12, 0.98, 0.04], [0.16, 0.95, 0.12], [0.2, 0.9, 0.2]], [0.01, 0.016, 0.008], IRON, 5, 2)];
const axeUp = (hR: THREE.Vector3) => [beam(vv(hR.clone().add(new THREE.Vector3(0, -0.06, 0))), vv(hR.clone().add(new THREE.Vector3(0, 0.34, 0.1))), 0.012, TIMBER), box(0.016, 0.07, 0.08, IRON, { x: hR.x, y: hR.y + 0.3, z: hR.z + 0.14 })];
const scythe = (hR: THREE.Vector3, hL: THREE.Vector3) => { const top = hL.clone().add(new THREE.Vector3(0.02, 0.2, -0.05)), low = hR.clone().add(new THREE.Vector3(0, -0.4, 0.2)); return [beam(vv(top), vv(low), 0.011, TIMBER), tube([vv(low), [low.x - 0.15, low.y + 0.02, low.z + 0.08], [low.x - 0.32, low.y + 0.06, low.z + 0.05]], [0.012, 0.01, 0.003], STEEL, 4, 2, 0.3)]; };

export type Worker = 'farmer' | 'reaper' | 'herder' | 'hunter' | 'gunHunter' | 'picker' | 'miner' | 'woodcutter';
export function workerModel(kind: Worker, variant: number): G[] {
  const skin = SKINS[variant % SKINS.length]!, female = variant % 3 === 1;
  const dress: Dress = { female, skirt: female ? 'ankle' : 'knee', legs: female || variant % 2 === 0 ? 'bare' : TROUSERS, sleeves: 'long', belt: 0x4a3424, shoes: 0x3a2a1e };
  switch (kind) {
    case 'farmer': return worker(dress, WORK, WORK, skin, (hL, hR) => hoe(hR, hL), 'straw', female ? 'bun' : 'short');
    case 'reaper': return worker(dress, WORK, WORK, skin, (hL, hR) => scythe(hR, hL), 'straw', female ? 'bun' : 'beard');
    case 'herder': return worker(dress, HANG, HOLD, skin, (_hL, hR) => staffIn(hR), variant % 2 ? 'felt' : 'hood', female ? 'long' : 'beard');
    case 'hunter': return worker({ ...dress, skirt: 'knee', female: false, legs: TROUSERS }, RAISE, HANG, skin, (hL) => [...bowIn(hL), ...quiver()], undefined, 'beard');
    case 'gunHunter': return worker({ ...dress, skirt: 'none', female: false, legs: TROUSERS }, HOLD, HOLD, skin, (hL, hR) => gunIn(hR, hL), 'felt', 'beard');
    case 'picker': return worker(dress, WORK, WORK, skin, () => basket(), 'straw', female ? 'bun' : 'short');
    case 'miner': return worker({ ...dress, skirt: 'none', female: false, legs: TROUSERS }, HANG, HANG, skin, () => pickOnShoulder(), 'felt', 'beard');
    case 'woodcutter': return worker({ ...dress, skirt: 'none', female: false, legs: TROUSERS }, HANG, RAISE, skin, (_hL, hR) => axeUp(hR), undefined, 'beard');
  }
}

// ---- the farm, by stage ----
// A wooden plough (an ard: beam, share, handles) and the yoke.
function plough(): G[] {
  return [beam([-0.9, 0.12, 0], [0.9, 0.55, 0], 0.035, TIMBER), beam([-0.9, 0.12, 0], [-1.2, 0.0, 0], 0.03, IRON),
    beam([-0.9, 0.12, 0], [-1.35, 0.85, 0.15], 0.025, TIMBER), beam([-0.9, 0.12, 0], [-1.35, 0.85, -0.15], 0.025, TIMBER), beam([-1.3, 0.75, 0.13], [-1.3, 0.75, -0.13], 0.02, TIMBER)];
}
// The plough team: two oxen yoked, the plough, the ploughman behind.
function ploughTeam(): G[] {
  const ox = (z: number) => creature('ox').map((g) => g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, z)));
  return [...ox(0.42), ...ox(-0.42), beam([0.95, 1.18, 0.62], [0.95, 1.18, -0.62], 0.05, TIMBER), beam([0.95, 1.1, 0], [-0.6, 0.55, 0], 0.04, TIMBER),
    ...plough().map((g) => g.applyMatrix4(new THREE.Matrix4().makeTranslation(-1.4, 0, 0))),
    ...workerModel('herder', 0).map((g) => g.applyMatrix4(new THREE.Matrix4().makeTranslation(-3.0, 0, 0)))];
}
// A two-wheeled cart, piled with hay or a load, its horse in the shafts.
function haycart(): G[] {
  const out: G[] = [box(2.2, 0.08, 1.3, TIMBER, { y: 0.75 }), ...[-0.66, 0.66].map((z) => box(2.2, 0.35, 0.05, DARK_WOOD, { y: 0.8, z })),
    ...[-0.72, 0.72].flatMap((z) => wheel(0.6, 0.12, DARK_WOOD, { y: 0.6, z }, 8)), beam([1.1, 0.75, 0.45], [3.0, 0.95, 0.45], 0.04, TIMBER), beam([1.1, 0.75, -0.45], [3.0, 0.95, -0.45], 0.04, TIMBER),
    fleece([0, 1.3, 0], [1.15, 0.55, 0.7], HAY, 0.06, 2)];
  out.push(...creature('horse').map((g) => recolor2(g, 0x7a4a2a).applyMatrix4(new THREE.Matrix4().makeTranslation(2.6, 0, 0))));
  return out;
}
// (A creature's coat painted, its leaf mask cleared: its colour set in a composite.)
const recolor2 = (g: G, c: number): G => {
  const col = g.getAttribute('color') as THREE.BufferAttribute, mask = g.getAttribute('leafMask') as THREE.BufferAttribute, k = new THREE.Color(c);
  for (let i = 0; i < col.count; i++) if (mask.getX(i) > 0.5) { col.setXYZ(i, k.r * col.getX(i), k.g * col.getY(i), k.b * col.getZ(i)); mask.setX(i, 0); }
  return g;
};
// A windpump: a lattice tower of steel, its fan wheel and tail vane on top.
function windpump(): G[] {
  const h = 9, out: G[] = [];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(beam([a * 1.0, 0, b * 1.0], [a * 0.2, h, b * 0.2], 0.05, STEEL, 5));
  for (let y = 1.5; y < h; y += 1.8) { const r = 1.0 - (0.8 * y) / h; for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) out.push(beam([a * r, y, b * r], [c * r, y, d * r], 0.03, STEEL, 4)); }
  out.push(box(0.5, 0.5, 0.5, IRON, { y: h }), beam([0, h + 0.25, 0], [-2.4, h + 0.25, 0], 0.05, STEEL), box(1.4, 1.0, 0.04, STEEL, { x: -2.6, y: h - 0.2 }));
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; out.push(box(0.04, 1.3, 0.28, STEEL, { x: 0.4, y: h + 0.25 + Math.cos(a) * 0.85, z: Math.sin(a) * 0.85, rx: -a, ry: 0.3 })); }
  out.push(...wheel(1.5, 0.08, STEEL, { x: 0.4, y: h + 0.25, ry: Math.PI / 2 }), beam([0, 0, 0], [0, h, 0], 0.025, IRON));
  return out;
}
// A silo: a tall round store, its domed roof (stone in the industrial age, sheet steel later: `steel`).
function silo(steel: boolean): G[] {
  const r = steel ? 2.4 : 2.0, h = steel ? 9 : 10, c = steel ? 0xb8bcc0 : 0xa86a4a;
  const out = [cyl(r, r, h, 16, c), P(new THREE.SphereGeometry(r * 1.02, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel ? 0xc8ccd0 : 0x6a6a6a, { y: h })];
  for (let y = 1.5; y < h; y += steel ? 0.6 : 1.5) out.push(P(new THREE.TorusGeometry(r + 0.02, steel ? 0.03 : 0.06, 4, 20).rotateX(Math.PI / 2), steel ? 0x9a9ea2 : 0x8a5a3a, { y }));
  if (steel) out.push(beam([r, 0, 0], [r, h + 1.6, 0], 0.08, STEEL), beam([r, h + 1.6, 0], [0, h + 2.2, 0], 0.08, STEEL));
  else out.push(box(0.8, h * 0.9, 0.3, 0x8a5a3a, { x: 0, z: r }));
  return out;
}
// A tractor: its bonnet and engine, the great rear wheels, the cab; paint (leaf).
function tractor(): G[] {
  return [box(2.0, 0.9, 1.0, COAT, { x: 0.6, y: 0.75 }), box(1.1, 1.1, 1.2, COAT, { x: -0.5, y: 0.9 }), box(1.1, 1.0, 1.25, 0x2a3034, { x: -0.5, y: 2.0, sx: 0.95 }),
    box(1.2, 0.08, 1.35, COAT, { x: -0.5, y: 3.0 }), ...[[0.5, 0.6], [-0.5, 0.6], [0.5, -0.6], [-0.5, -0.6]].map(([x, z]) => box(0.06, 1.0, 0.06, IRON, { x: -0.5 + x! * 1.0, y: 2.0, z: z! * 1.05 })),
    cyl(0.07, 0.06, 1.0, 8, IRON, { x: 1.2, y: 1.5 }), box(0.1, 0.5, 0.8, 0x2a2a2a, { x: 1.62, y: 0.85 }),
    ...[-0.85, 0.85].flatMap((z) => tyre(0.85, 0.5, { x: -0.6, y: 0.85, z }, 0xd8b030)), ...[-0.6, 0.6].flatMap((z) => tyre(0.48, 0.3, { x: 1.2, y: 0.48, z }, 0xd8b030))];
}
// A combine harvester: the body and grain tank, the reel and header in front, the cab, the auger.
function combine(): G[] {
  return [box(4.5, 2.6, 2.6, COAT, { y: 1.0 }), box(2.2, 1.2, 2.4, COAT, { x: -0.8, y: 3.6 }), box(1.5, 1.4, 1.4, 0x2a3034, { x: 1.4, y: 3.6 }), box(1.6, 0.1, 1.5, COAT, { x: 1.4, y: 5.0 }),
    box(1.6, 0.9, 6.0, 0x6a6e70, { x: 3.0, y: 0.5 }), P(new THREE.CylinderGeometry(0.55, 0.55, 5.6, 12, 1, true).rotateX(Math.PI / 2), 0xd8b030, { x: 3.4, y: 1.4 }),
    ...Array.from({ length: 6 }, (_, i) => beam([3.4 + 0.55 * Math.cos(i), 1.4 + 0.55 * Math.sin(i), -2.8], [3.4 + 0.55 * Math.cos(i), 1.4 + 0.55 * Math.sin(i), 2.8], 0.03, 0xd8b030, 4)),
    beam([-1.5, 3.8, 1.2], [-1.0, 4.2, 4.0], 0.18, COAT, 8), cyl(0.08, 0.07, 1.4, 8, IRON, { x: -1.8, y: 4.2 }),
    ...[-1.2, 1.2].flatMap((z) => tyre(1.0, 0.6, { x: 0.8, y: 1.0, z }, 0xd8b030)), ...[-1.2, 1.2].flatMap((z) => tyre(0.6, 0.4, { x: -1.6, y: 0.6, z }, 0xd8b030))];
}
// A run of fence along x, a unit long (instances stretch it): `wattle`
// (woven hurdles), `rail` (posts and two rails), `wire` (posts and wire).
function fence(kind: 'wattle' | 'rail' | 'wire'): G[] {
  if (kind === 'wattle') return [...[-0.5, 0, 0.5].map((x) => beam([x, 0, 0], [x, 1.05, 0], 0.035, DARK_WOOD, 5)), ...[0.25, 0.5, 0.75].map((y) => P(new THREE.BoxGeometry(1.0, 0.22, 0.06), 0x8a7048, { y }))];
  if (kind === 'rail') return [...[-0.5, 0, 0.5].map((x) => box(0.09, 1.2, 0.09, DARK_WOOD, { x })), ...[0.5, 0.95].map((y) => box(1.0, 0.09, 0.05, TIMBER, { y }))];
  return [...[-0.5, 0, 0.5].map((x) => box(0.07, 1.2, 0.07, 0x6a5a48, { x })), ...[0.4, 0.75, 1.05].map((y) => beam([-0.5, y, 0], [0.5, y, 0], 0.008, 0x9a9ea2, 3))];
}
// A water trough, and an open shelter (posts and a roof) for the herd.
function trough(): G[] { return [box(2.4, 0.5, 0.6, DARK_WOOD), box(2.3, 0.04, 0.5, 0x5a7a8a, { y: 0.44 })]; }
function shelter(): G[] {
  const out: G[] = [...[[-2.2, -1.4], [2.2, -1.4], [-2.2, 1.4], [2.2, 1.4]].map(([x, z]) => box(0.18, 2.4, 0.18, DARK_WOOD, { x: x!, z: z! }))];
  out.push(box(5.0, 0.12, 3.4, 0x7a6a50, { y: 2.4, rx: 0.12 }), box(5.0, 1.2, 0.08, 0x6a5440, { y: 0.0, z: -1.4 }));
  return out;
}
// Haystacks of the fields: a stook (sheaves leant together) and a rick.
function stooks(): G[] {
  return [0, 1, 2, 3, 4, 5].map((k) => cone(0.28, 1.25, 7, k % 2 ? STRAW : 0xc4a55c, { x: Math.cos(k * 1.05) * 0.16, z: Math.sin(k * 1.05) * 0.16, rx: Math.sin(k * 1.05) * 0.22, rz: -Math.cos(k * 1.05) * 0.22 })).concat([cone(0.2, 0.4, 7, 0xb08f4a, { y: 1.1 })]);
}
function rick(): G[] { return [cyl(1.6, 1.7, 2.2, 14, HAY), P(new THREE.SphereGeometry(1.62, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), 0xb8984a, { y: 2.2 })]; }
// Round bales (the machine age) on stubble.
function bales(): G[] { return [[0, 0], [1.9, 0.6], [0.6, 1.9]].map(([x, z]) => P(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14).rotateX(Math.PI / 2), 0xc8a85a, { x: x!, y: 0.75, z: z! })); }

// ---- the forest, by stage ----
// A hunters' tent of hides on poles, and a frame of hides drying.
function tent(): G[] {
  const out = [cone(1.5, 3.0, 9, 0xa89070)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; out.push(beam([Math.cos(a) * 0.25, 2.6, Math.sin(a) * 0.25], [-Math.cos(a) * 0.15, 3.6, -Math.sin(a) * 0.15], 0.03, TIMBER, 4)); }
  out.push(box(0.6, 1.2, 0.02, 0x3a2a1e, { x: 1.3, rz: -0.45 }));
  return out;
}
function hideRack(): G[] {
  return [beam([-1.2, 0, 0], [-1.2, 1.9, 0], 0.05, TIMBER), beam([1.2, 0, 0], [1.2, 1.9, 0], 0.05, TIMBER), beam([-1.3, 1.8, 0], [1.3, 1.8, 0], 0.04, TIMBER),
    ...[0x6a4a30, 0x8a6a48, 0x4a3a2a, 0x9a8468].map((c, k) => P(new THREE.CircleGeometry(0.45, 7).scale(0.9, 1.3, 1), c, { x: -0.9 + k * 0.6, y: 1.15 }))];
}
// A campfire: a ring of stones, crossed logs, the flames, a spit over it.
function campfire(): G[] {
  const out: G[] = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; out.push(fleece([Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55], [0.14, 0.11, 0.13], 0x6a665e, 0.2, 1)); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; out.push(beam([Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45], [-Math.cos(a) * 0.45, 0.2, -Math.sin(a) * 0.45], 0.06, 0x4a3424, 5)); }
  out.push(cone(0.3, 0.7, 7, 0xe8762a, { y: 0.1 }), cone(0.16, 0.5, 6, 0xf8c84a, { y: 0.15 }), beam([-0.7, 0, 0], [-0.7, 0.9, 0], 0.03, TIMBER, 4), beam([0.7, 0, 0], [0.7, 0.9, 0], 0.03, TIMBER, 4), beam([-0.75, 0.88, 0], [0.75, 0.88, 0], 0.025, TIMBER, 4));
  return out;
}
// A log cabin (the hunters' lodge, the trading post), logs stacked round it.
function lodge(): G[] {
  const out: G[] = [], W = 5, D = 3.6;
  for (let i = 0; i < 9; i++) {
    const y = 0.15 + i * 0.28;
    out.push(P(new THREE.CylinderGeometry(0.15, 0.15, W + 0.4, 7).rotateZ(Math.PI / 2), i % 2 ? TIMBER : DARK_WOOD, { y, z: D / 2 }), P(new THREE.CylinderGeometry(0.15, 0.15, W + 0.4, 7).rotateZ(Math.PI / 2), i % 2 ? TIMBER : DARK_WOOD, { y, z: -D / 2 }));
    out.push(P(new THREE.CylinderGeometry(0.15, 0.15, D + 0.4, 7).rotateX(Math.PI / 2), i % 2 ? DARK_WOOD : TIMBER, { y: y + 0.14, x: W / 2 }), P(new THREE.CylinderGeometry(0.15, 0.15, D + 0.4, 7).rotateX(Math.PI / 2), i % 2 ? DARK_WOOD : TIMBER, { y: y + 0.14, x: -W / 2 }));
  }
  const h = 0.15 + 9 * 0.28;
  for (const s of [1, -1]) out.push(box(W + 0.8, 0.12, D / 2 + 0.7, 0x5a4a38, { y: h + 0.75, z: s * (D / 4 + 0.2), rx: s * 0.6 }));
  out.push(box(0.9, 1.7, 0.06, 0x3a2a1e, { y: 0.1, z: D / 2 + 0.16 }), box(0.6, 3.6, 0.6, STONE, { x: -W / 2 - 0.2 }));
  return out;
}
// A steam sawmill: a long shed, its boiler house chimney, logs and planks.
function sawmill(): G[] {
  return [box(8, 3.2, 4, 0x8a6a48), ...[1, -1].map((s) => box(8.6, 0.12, 2.6, 0x4a4a4e, { y: 3.9, z: s * 1.05, rx: s * 0.55 })), box(2.6, 3.0, 2.6, 0x9a5a40, { x: -5 }), cyl(0.45, 0.35, 8, 10, 0x6a4a3a, { x: -5.3, y: 3 }),
    ...Array.from({ length: 6 }, (_, i) => P(new THREE.CylinderGeometry(0.3, 0.3, 6, 8).rotateZ(Math.PI / 2), i % 2 ? TIMBER : DARK_WOOD, { x: 2, y: 0.3 + Math.floor(i / 3) * 0.55, z: 4 + (i % 3) * 0.6 })),
    ...[0, 1, 2].map((i) => box(4, 0.12, 1.4, 0xc8a878, { x: -1, y: 0.06 + i * 0.13, z: -4 }))];
}

// ---- the mine and the quarry, by stage ----
// An adit cut into the slope: its timber portal, the dark mouth, the spoil.
function adit(): G[] {
  return [box(0.35, 2.6, 0.35, TIMBER, { x: 0.2, z: -1.3 }), box(0.35, 2.6, 0.35, TIMBER, { x: 0.2, z: 1.3 }), box(0.45, 0.4, 3.2, TIMBER, { x: 0.2, y: 2.5 }), box(0.1, 2.4, 2.3, 0x14110e, { x: 0.05 }),
    box(3.0, 1.6, 4.0, 0x6a6258, { x: -1.4, y: 0, rz: 0.15 }), ...[-0.5, 0.5].map((z) => beam([0.4, 0.05, z], [5, 0.05, z], 0.04, IRON, 4)), box(1.2, 0.8, 0.9, 0x5a4a3a, { x: 2.8, y: 0.25 })];
}
// A timber headframe over a shaft, its wheel and the winding drum.
function headframe(): G[] {
  const out: G[] = [box(3.2, 0.2, 3.2, DARK_WOOD)];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(beam([a * 1.4, 0, b * 1.4], [a * 0.4, 6, b * 0.5], 0.13, TIMBER, 5));
  out.push(beam([-3.8, 0, 0], [-0.3, 5.8, 0], 0.13, TIMBER, 5), ...wheel(1.1, 0.14, DARK_WOOD, { y: 6.3, ry: Math.PI / 2 }, 6), box(1.6, 1.2, 1.4, 0x6a5440, { x: -4.6, y: 0 }));
  return out;
}
// A steam headframe of steel, its engine house of brick with the chimney.
function steamHeadframe(): G[] {
  const out: G[] = [box(4, 0.3, 4, 0x6a6a6a)];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(beam([a * 1.6, 0, b * 1.6], [a * 0.5, 11, b * 0.6], 0.16, 0x5a5e62, 5));
  for (let y = 2; y < 11; y += 2.2) out.push(box(3.2 - y * 0.2, 0.12, 0.12, 0x5a5e62, { y, z: 1.6 - y * 0.1 }), box(3.2 - y * 0.2, 0.12, 0.12, 0x5a5e62, { y, z: -1.6 + y * 0.1 }));
  out.push(...wheel(1.6, 0.2, 0x3a3e42, { y: 11.5, ry: Math.PI / 2 }, 8), beam([-7, 0, 0], [-0.4, 11, 0], 0.2, 0x5a5e62, 5));
  out.push(box(6, 5, 5, 0x9a4a32, { x: -9 }), box(6.6, 0.3, 5.6, 0x4a4a4e, { x: -9, y: 5 }), cyl(0.7, 0.55, 14, 12, 0x8a3a2a, { x: -11, z: 1.6 }));
  return out;
}
// A smelting furnace: its stone stack, the bellows house, ore and charcoal heaps.
function smelter(): G[] {
  return [cyl(1.8, 1.0, 5, 10, 0x8a7a68), cyl(1.0, 0.8, 1.2, 10, 0x6a5a48, { y: 5 }), box(3, 2.4, 2.6, 0x7a6a50, { x: -3 }), box(3.4, 0.12, 3, 0x5a4a3a, { x: -3, y: 2.6, rz: 0.25 }),
    box(0.8, 0.8, 0.2, 0xd86a2a, { x: 1.7, y: 0.4 }), cone(1.6, 1.4, 9, 0x2a2622, { x: 3.4, z: 2 }), cone(1.4, 1.2, 9, COAT, { x: 3.0, z: -2.2 })];
}
// A heap of the ore (leaf: its colour), a cart of it on rails.
function oreHeap(): G[] { return [fleece([0, 0.5, 0], [1.6, 0.9, 1.3], COAT, 0.18, 2), fleece([1.6, 0.3, 0.7], [0.8, 0.5, 0.7], coat(0.85), 0.2, 1)]; }
function oreCart(): G[] {
  return [...[-0.45, 0.45].map((z) => beam([-3, 0.05, z], [3, 0.05, z], 0.04, IRON, 4)), ...[-2, -1, 0, 1, 2].map((x) => box(0.2, 0.08, 1.3, DARK_WOOD, { x })),
    box(1.6, 0.9, 1.0, 0x5a4a3a, { y: 0.35 }), fleece([0, 1.25, 0], [0.7, 0.2, 0.42], COAT, 0.2, 1), ...[-0.5, 0.5].flatMap((x) => [-0.5, 0.5].map((z) => P(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10).rotateX(Math.PI / 2), IRON, { x, y: 0.25, z })))];
}
// A treadwheel crane (the quarry's: men walk the wheel), and a steam crane.
function treadCrane(): G[] {
  const out: G[] = [box(3, 0.3, 3, DARK_WOOD), beam([0, 0.3, 0], [0, 6, 0], 0.2, TIMBER), beam([0, 5.5, 0], [4.5, 7.5, 0], 0.16, TIMBER), beam([0, 0.3, 1.4], [0, 5.5, 0], 0.12, TIMBER), beam([0, 0.3, -1.4], [0, 5.5, 0], 0.12, TIMBER)];
  out.push(...wheel(1.7, 0.18, TIMBER, { x: -1.2, y: 1.9, ry: Math.PI / 2 }, 10), beam([4.5, 7.5, 0], [4.5, 2.5, 0], 0.02, 0x8a7a5a, 3), box(1.2, 0.8, 0.8, STONE, { x: 4.5, y: 1.7 }));
  return out;
}
function steamCrane(): G[] {
  const out: G[] = [box(3.4, 1.0, 3.4, 0x4a4a4e), box(2.4, 2.2, 2.4, 0x6a5440, { y: 1.0 }), cyl(0.25, 0.22, 2, 8, IRON, { y: 3.2, x: -0.6 })];
  for (const z of [-0.4, 0.4]) out.push(beam([0.8, 2, z], [8, 8, z * 0.3], 0.12, 0x5a5e62, 5));
  for (let i = 1; i < 6; i++) out.push(beam([0.8 + i * 1.2, 2 + i * 1.0, 0.36 - i * 0.04], [0.8 + i * 1.2, 2 + i * 1.0, -0.36 + i * 0.04], 0.05, 0x5a5e62, 4));
  out.push(beam([8, 8, 0], [8, 2, 0], 0.02, 0x2a2a2a, 3), box(1.6, 1.0, 1.0, STONE, { x: 8, y: 1.0 }));
  return out;
}

// ---- the water, by stage ----
// A dugout canoe with its fisher; a small boat with a net; a sailing boat;
// a steam trawler. (On the water's surface, y = 0.)
function canoe(): G[] {
  return [loft(smooth([S(-2.4, 0.15, 0.05, 0.05), S(-2.0, 0.2, 0.22, 0.28), S(0, 0.22, 0.28, 0.4), S(2.0, 0.2, 0.22, 0.28), S(2.4, 0.18, 0.05, 0.05)], 3), 10, DARK_WOOD), box(4.0, 0.02, 0.6, 0x3a2a1e, { y: 0.45 }),
    ...workerModel('herder', 2).slice(0, 14).map((g) => g.applyMatrix4(new THREE.Matrix4().makeTranslation(-0.6, -0.3, 0))), beam([0.2, 0.9, 0.2], [1.4, -0.1, 0.9], 0.03, TIMBER, 4)];
}
function sailboat(): G[] {
  const hull = loft(smooth([S(-3.5, 0.5, 0.2, 0.2), S(-3, 0.45, 0.55, 0.8), S(0, 0.4, 0.75, 1.2), S(3, 0.5, 0.6, 0.8), S(4.0, 0.8, 0.1, 0.1)], 3), 12, DARK_WOOD);
  return [hull, box(6.2, 0.1, 1.8, TIMBER, { y: 1.0 }), cyl(0.1, 0.08, 7.5, 6, TIMBER, { x: 0.4, y: 1.0 }), beam([0.4, 2.0, 0], [-3.0, 2.2, 0], 0.07, TIMBER),
    P(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.4, 8.2, 0, 0.4, 2.1, 0, -3.0, 2.3, 0], 3)), CANVAS),
    P(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.4, 7.6, 0, 3.9, 1.2, 0, 0.4, 2.1, 0], 3)), 0xc8bca0),
    fleece([-2, 1.25, 0.6], [0.8, 0.25, 0.4], 0x8a7a5a, 0.3, 1)];
}
function trawler(): G[] {
  const hull = loft(smooth([S(-6, 1.4, 0.6, 0.8), S(-5.5, 1.2, 1.4, 2.0), S(0, 1.0, 1.6, 2.4), S(5, 1.3, 1.4, 1.6), S(6.6, 2.0, 0.2, 0.2)], 3), 12, (p) => (p.y < 0.6 ? 0x8a3a2a : 0x2a3a4a));
  return [hull, box(11, 0.12, 4.2, 0x8a7a68, { y: 2.3 }), box(3.4, 2.6, 2.8, 0xe8e4dc, { x: -1, y: 2.4 }), box(3.8, 0.15, 3.2, 0x4a4a4e, { x: -1, y: 5.0 }), cyl(0.5, 0.45, 3.2, 12, 0x2a2a2a, { x: -2.5, y: 4.4 }),
    cyl(0.12, 0.1, 6, 6, 0x5a5e62, { x: 3, y: 2.4 }), beam([3, 7.5, 0], [-5.5, 2.6, 0], 0.03, 0x3a3a3a, 3), beam([3, 6.5, 0], [6, 2.4, 0], 0.08, 0x5a5e62, 4)];
}

// ---- oil, by stage ----
function derrick(): G[] {
  const h = 12, out: G[] = [box(4, 0.4, 4, TIMBER)];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(beam([a * 1.7, 0.4, b * 1.7], [a * 0.35, h, b * 0.35], 0.12, TIMBER, 4));
  for (let y = 2.2; y < h; y += 2.2) { const r = 1.7 - (1.35 * y) / h; out.push(...[[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].map(([a, b, c, d]) => beam([a! * r, y, b! * r], [c! * r, y, d! * r], 0.07, TIMBER, 4))); }
  out.push(box(1, 0.8, 1, IRON, { y: h }), box(3.4, 2.4, 2.4, 0x6a5a48, { x: 4.2 }), cyl(0.3, 0.25, 4, 8, IRON, { x: 5, y: 2.4 }), P(new THREE.CylinderGeometry(2.6, 2.6, 0.05, 16), 0x141312, { x: -4, y: 0.03, sz: 0.6 }));
  return out;
}
// A pumpjack: the base, the samson post, the walking beam with its horse's
// head over the well, the crank and counterweights; paint (leaf).
function pumpjack(): G[] {
  return [box(7, 0.5, 2, 0x6a6a6a), ...[-0.7, 0.7].map((z) => beam([-1.2, 0.5, z], [0, 4.2, z * 0.2], 0.14, COAT, 5)), ...[-0.7, 0.7].map((z) => beam([1.2, 0.5, z], [0, 4.2, z * 0.2], 0.14, COAT, 5)),
    box(6.8, 0.5, 0.5, COAT, { x: 0.3, y: 4.2 }), P(new THREE.CylinderGeometry(1.3, 1.3, 0.6, 14, 1, false, -0.6, 1.6).rotateX(Math.PI / 2), COAT, { x: 3.7, y: 3.6 }),
    beam([3.9, 2.4, 0], [3.9, 0.5, 0], 0.04, 0x3a3a3a, 4), cyl(0.3, 0.3, 0.8, 8, IRON, { x: 3.9 }),
    ...[-0.75, 0.75].map((z) => box(1.8, 1.2, 0.3, 0x3a3a3a, { x: -2.6, y: 1.6, z })), box(1.6, 1.6, 1.0, 0x5a5e62, { x: -2.6, y: 0.5 })];
}
function oilTank(): G[] { return [cyl(3.2, 3.2, 4.5, 20, 0xdcdcd8), P(new THREE.SphereGeometry(3.25, 20, 4, 0, Math.PI * 2, 0, 0.4), 0xc8c8c4, { y: 4.5 - 0.15 }), ...[1.5, 3].map((y) => P(new THREE.TorusGeometry(3.22, 0.04, 4, 24).rotateX(Math.PI / 2), 0xb8b8b4, { y })), beam([3.2, 0, 0], [3.2, 4.8, 0.6], 0.05, STEEL, 4)]; }

// ---- plantations: what grows in their rows ----
const LEAVES = 0x4f7a30;
// (A leafy mass: a lumpy crown.)
const crown = (c: V3, r: V3, paint: Paint, lump = 0.22) => fleece(c, r, paint, lump, 2);
// (Points written as plain arrays.)
const v = (a: readonly number[]): V3 => [a[0]!, a[1]!, a[2]!];
// A stretch of vineyard row along x (they meet end to end into a hedge):
// its stakes and wire, the trained vines in leaf, grapes hanging under.
function vine(): G[] {
  return [...[-1.2, 0, 1.2].map((x) => beam([x, 0, 0], [x, 1.45, 0], 0.035, TIMBER, 5)), beam([-1.25, 1.2, 0], [1.25, 1.2, 0], 0.01, 0x9a9a9a, 3), beam([-1.25, 0.75, 0], [1.25, 0.75, 0], 0.01, 0x9a9a9a, 3),
    ...[-0.6, 0.6].map((x) => tube([[x, 0, 0.04], [x + 0.05, 0.4, 0.05], [x, 0.75, 0.04]], [0.05, 0.04, 0.035], 0x5a4632, 5, 2)),
    crown([0, 1.05, 0], [1.35, 0.42, 0.3], LEAVES, 0.18), crown([0, 1.42, 0], [1.2, 0.16, 0.22], 0x5a8a3a, 0.2),
    ...[[-0.95, 0.74, 0.22], [-0.35, 0.72, -0.23], [0.25, 0.75, 0.22], [0.85, 0.73, -0.22], [0.55, 0.72, 0.24], [-0.7, 0.75, -0.22]].map((c) => fleece(v(c), [0.06, 0.12, 0.06], 0x4a2a5a, 0.25, 1))];
}
// A stretch of tea hedge along x, clipped flat on top (the plucking table).
function teaBush(): G[] { return [...[-0.6, 0.6].map((x) => cyl(0.05, 0.04, 0.4, 5, 0x5a4632, { x })), crown([0, 0.6, 0], [1.25, 0.4, 0.55], 0x3f6a2a, 0.1), crown([0, 0.92, 0], [1.15, 0.1, 0.48], 0x5a8a3a, 0.14)]; }
function cottonBush(): G[] {
  const out = [cyl(0.03, 0.025, 0.5, 5, 0x6a5a3a), crown([0, 0.75, 0], [0.42, 0.45, 0.42], 0x5a7a3a, 0.3)];
  for (let i = 0; i < 9; i++) { const a = i * 2.4, y = 0.55 + (i % 3) * 0.2; out.push(ellipsoid([Math.cos(a) * 0.38, y, Math.sin(a) * 0.38], [0.09, 0.08, 0.09], 0xf6f2ea, 6)); }
  return out;
}
function bananaPlant(): G[] {
  const out = [tube([[0, 0, 0], [0.04, 1.4, 0], [0.02, 2.6, 0]], [0.18, 0.14, 0.11], 0x7a7a3a, 8, 2)];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, d: V3 = [Math.cos(a), 0, Math.sin(a)];
    out.push(tube([[0, 2.5, 0], [d[0] * 0.8, 3.0, d[2] * 0.8], [d[0] * 1.6, 2.7, d[2] * 1.6], [d[0] * 2.1, 2.1, d[2] * 2.1]], [0.03, 0.32, 0.3, 0.05], k % 2 ? 0x5e9a3a : 0x4f8a30, 4, 2, 0.12));
  }
  out.push(ellipsoid([0.22, 1.9, 0], [0.18, 0.35, 0.18], 0x9ab83a, 8), cone(0.1, 0.3, 6, 0x7a2a3a, { x: 0.28, y: 1.35, rz: Math.PI }));
  return out;
}
function mulberryBush(): G[] { return [tube([[0, 0, 0], [0.05, 0.7, 0], [0.0, 1.0, 0]], [0.1, 0.08, 0.08], 0x6a5038, 6, 2), ...[0, 2.1, 4.2].map((a) => tube([[0, 1.0, 0], [Math.cos(a) * 0.35, 1.5, Math.sin(a) * 0.35], [Math.cos(a) * 0.45, 1.9, Math.sin(a) * 0.45]], [0.05, 0.03, 0.02], 0x6a5038, 5, 2)), crown([0, 1.8, 0], [0.9, 0.55, 0.9], 0x557a3a)]; }
function pepperPole(): G[] {
  return [beam([0, 0, 0], [0, 2.8, 0], 0.06, TIMBER, 5), crown([0, 1.5, 0], [0.4, 1.3, 0.4], 0x3a6a2a, 0.3), ...[[0.32, 1.2, 0.1], [-0.3, 1.7, 0.15], [0.1, 2.1, -0.32], [-0.2, 0.9, -0.3]].map((c) => ellipsoid(v(c), [0.06, 0.12, 0.06], 0xc0402a, 6))];
}
function incenseTree(): G[] {
  return [tube([[0, 0, 0], [0.2, 0.8, 0], [0.0, 1.4, 0.1]], [0.16, 0.12, 0.1], 0x8a7a64, 6, 2), tube([[0.0, 1.3, 0.1], [-0.5, 1.9, 0.1], [-0.8, 2.2, 0.2]], [0.08, 0.06, 0.04], 0x8a7a64, 5, 2), tube([[0.0, 1.3, 0.1], [0.5, 2.0, -0.1], [0.7, 2.2, -0.2]], [0.08, 0.06, 0.04], 0x8a7a64, 5, 2),
    crown([-0.8, 2.3, 0.2], [0.6, 0.3, 0.6], 0x7a8a5a), crown([0.7, 2.35, -0.2], [0.55, 0.28, 0.55], 0x6f8250)];
}
function indigoBush(): G[] { return [cyl(0.03, 0.02, 0.4, 5, 0x5a4a32), crown([0, 0.6, 0], [0.45, 0.42, 0.45], 0x3a5a4a, 0.3), ...[0, 1.3, 2.6, 3.9, 5.2].map((a) => ellipsoid([Math.cos(a) * 0.36, 0.9, Math.sin(a) * 0.36], [0.05, 0.1, 0.05], 0x6a4a9a, 5))]; }

// ---- the resources in the wild ----
function wildGrain(): G[] {
  const out: G[] = [];
  for (let i = 0; i < 14; i++) { const a = i * 2.39, r = 0.12 + (i % 4) * 0.08, x = Math.cos(a) * r, z = Math.sin(a) * r, lean = 0.15 + (i % 3) * 0.08; out.push(tube([[x, 0, z], [x + Math.cos(a) * lean * 0.5, 0.6, z + Math.sin(a) * lean * 0.5], [x + Math.cos(a) * lean, 1.05, z + Math.sin(a) * lean]], [0.012, 0.01, 0.008], 0xb8a050, 4, 2), ellipsoid([x + Math.cos(a) * lean, 1.12, z + Math.sin(a) * lean], [0.025, 0.08, 0.025], 0xd8b850, 5)); }
  return out;
}
function wildRice(): G[] {
  const out: G[] = [];
  for (let i = 0; i < 16; i++) { const a = i * 2.39, r = 0.1 + (i % 5) * 0.07, x = Math.cos(a) * r, z = Math.sin(a) * r; out.push(tube([[x, 0, z], [x * 1.4, 0.7, z * 1.4], [x * 2.0, 1.15, z * 2.0]], [0.014, 0.012, 0.006], 0x7aa040, 4, 2), tube([[x * 2.0, 1.15, z * 2.0], [x * 2.3, 1.05, z * 2.3], [x * 2.4, 0.9, z * 2.4]], [0.012, 0.016, 0.006], 0xc8b060, 4, 2)); }
  return out;
}
function teosinte(): G[] {
  const out: G[] = [];
  for (let i = 0; i < 6; i++) { const a = i * 1.05, x = Math.cos(a) * 0.25, z = Math.sin(a) * 0.25; out.push(tube([[x, 0, z], [x * 1.2, 0.9, z * 1.2], [x * 1.5, 1.7, z * 1.5]], [0.03, 0.025, 0.015], 0x6f8f3a, 5, 2), tube([[x * 1.1, 0.7, z * 1.1], [x * 2.6, 1.0, z * 2.6], [x * 3.2, 0.85, z * 3.2]], [0.01, 0.05, 0.01], 0x5f8a34, 4, 2, 0.15), ellipsoid([x * 1.55, 1.78, z * 1.55], [0.03, 0.1, 0.03], 0xc8a040, 5)); }
  return out;
}
// Rock breaking out of the ground, a vein of its ore (leaf) through it.
function outcrop(): G[] {
  const rock = (c: V3, r: V3) => fleece(c, r, (p) => (Math.abs(Math.sin(p.x * 3.1 + p.y * 4.7 + p.z * 2.3)) < 0.18 ? COAT : p.y > c[1] + r[1] * 0.5 ? 0x8a8478 : 0x7a7468), 0.22, 2);
  return [rock([0, 0.7, 0], [1.5, 1.1, 1.2]), rock([1.6, 0.4, 0.8], [0.8, 0.6, 0.7]), rock([-1.2, 0.3, -0.9], [0.7, 0.45, 0.6])];
}
// Weathered boulders (stone, not yet cut).
function boulders(): G[] { return [[0, 0, 1.3, 1.0], [1.8, 0.6, 0.9, 0.7], [-1.0, 1.4, 0.7, 0.55], [0.6, -1.5, 0.6, 0.5]].map(([x, z, r, h]) => fleece([x!, h! * 0.6, z!], [r!, h!, r! * 0.85], (p) => (p.y > h! * 0.9 ? 0xb8b2a4 : 0xa49e90), 0.15, 2)); }
// A wild vine climbing over a bush, its grapes hanging.
function wildVine(): G[] { return [crown([0, 0.9, 0], [1.1, 0.9, 1.0], 0x4a6a2a, 0.3), crown([0.3, 1.5, 0.2], [0.7, 0.5, 0.6], 0x5a7a34, 0.3), ...[[0.9, 1.0, 0.4], [-0.8, 0.8, 0.5], [0.4, 0.7, -0.9], [-0.3, 1.3, 0.85]].map((c) => fleece(v(c), [0.08, 0.14, 0.08], 0x4a2a5a, 0.25, 1))]; }
// A school of fish breaking the surface, ripples round them.
function fishSchool(): G[] {
  const out: G[] = [];
  for (let i = 0; i < 6; i++) { const a = i * 1.1, x = Math.cos(a) * (0.6 + i * 0.2), z = Math.sin(a) * (0.6 + i * 0.2), up = 0.15 + (i % 3) * 0.12; out.push(loft(smooth([S(x - 0.25, up - 0.04, 0.01, 0.01), S(x - 0.18, up, 0.05, 0.03), S(x + 0.05, up + 0.04, 0.07, 0.035), S(x + 0.2, up + 0.02, 0.04, 0.025), S(x + 0.26, up, 0.01, 0.01)].map((s) => ({ ...s, z })), 2), 6, 0x9ab0b8)); }
  for (const r of [0.8, 1.5, 2.1]) out.push(P(new THREE.TorusGeometry(r, 0.025, 3, 28).rotateX(Math.PI / 2), 0xd8e8ec, { y: 0.01 }));
  return out;
}
// An oyster bed: shells on the reef rocks, at the surface.
function oysters(): G[] {
  const out: G[] = [fleece([0, -0.1, 0], [1.6, 0.35, 1.3], 0x6a6a5a, 0.25, 2)];
  for (let i = 0; i < 10; i++) { const a = i * 2.39, r = 0.3 + (i % 4) * 0.3; out.push(ellipsoid([Math.cos(a) * r, 0.18, Math.sin(a) * r], [0.16, 0.05, 0.12], 0xd8d0c4, 7, [0, a, 0.2])); }
  return out;
}
// A pine with resin weeping from its wounds, amber at its foot.
function resinPine(): G[] {
  return [cyl(0.35, 0.3, 1.6, 9, 0x6a4a30), P(new THREE.CircleGeometry(0.3, 9).rotateX(-Math.PI / 2), 0xc49a68, { y: 1.61 }),
    ...[[0.36, 0.9, 0.1], [-0.2, 0.7, 0.3], [0.1, 1.2, -0.34]].map((c) => ellipsoid(v(c), [0.06, 0.14, 0.05], 0xe0902a, 6)), ...[[0.8, 0.1, 0.3], [-0.6, 0.1, 0.6], [0.2, 0.1, -0.8]].map((c) => P(new THREE.OctahedronGeometry(0.16, 0).translate(c[0]!, c[1]!, c[2]!), 0xe8922a))];
}
// A worked resource's own touches: a wine press and casks; cocoon trays; tusks; bales of cotton; baskets of leaf; a salt heap.
function winePress(): G[] { return [cyl(0.9, 0.95, 0.7, 12, DARK_WOOD), beam([-0.8, 0.7, 0], [-0.8, 2.4, 0], 0.08, TIMBER), beam([0.8, 0.7, 0], [0.8, 2.4, 0], 0.08, TIMBER), box(2.0, 0.3, 0.3, TIMBER, { y: 2.3 }), cyl(0.08, 0.08, 1.4, 6, IRON, { y: 0.9 }), ...[[1.8, 0.6], [2.4, -0.4], [1.6, -1.0]].map(([x, z]) => P(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12).rotateZ(Math.PI / 2), 0x7a5a3a, { x: x!, y: 0.42, z: z! }))]; }
function cocoonTrays(): G[] { return [...[0.5, 1.0, 1.5].map((y) => box(2.0, 0.06, 1.0, 0xb08a52, { y })), ...[[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]].map(([x, z]) => box(0.06, 1.6, 0.06, TIMBER, { x: x! * 0.95, z: z! * 0.45 })), ...Array.from({ length: 18 }, (_, i) => ellipsoid([-0.8 + (i % 6) * 0.32, 0.56 + Math.floor(i / 6) * 0.5, (i % 2 ? 0.2 : -0.2)], [0.06, 0.04, 0.04], 0xf4f0e6, 5))]; }
function tuskPile(): G[] { return Array.from({ length: 6 }, (_, i) => horn([[0, 0.12 + (i % 3) * 0.16, -0.6 + i * 0.24], [0.8, 0.2 + (i % 3) * 0.16, -0.6 + i * 0.24], [1.4, 0.45 + (i % 3) * 0.16, -0.5 + i * 0.24]], 0.1, 0xf0e8d4, 7)); }
function cottonBales(): G[] { return [[0, 0], [1.3, 0.2], [0.6, 1.1], [0.6, 0.5]].map(([x, z], i) => box(1.1, 0.8, 0.8, 0xe8e2d4, { x: x!, y: i === 3 ? 0.8 : 0, z: z! })); }
function teaBaskets(): G[] { return [[0, 0], [0.7, 0.3], [0.2, 0.8]].flatMap(([x, z]) => [cyl(0.25, 0.32, 0.45, 10, 0xb08a52, { x: x!, z: z! }), crown([x!, 0.48, z!], [0.27, 0.08, 0.27], 0x4a7a32, 0.2)]); }
function saltHeaps(): G[] { return [cone(1.0, 0.9, 12, 0xf2eee6), cone(0.8, 0.7, 12, 0xeae6de, { x: 1.6, z: 0.6 }), ...[0, 1].flatMap((i) => [box(2.4, 0.05, 1.6, 0xd8e0e0, { x: -2.2, z: (i - 0.5) * 1.8 }), box(2.6, 0.18, 0.12, 0x9a8a6a, { x: -2.2, z: (i - 0.5) * 1.8 + 0.85 })])]; }

// ---- the registry ----
export const KIT = {
  // animals
  horse: () => creature('horse'), cow: () => creature('cow'), pied: () => creature('pied'), ox: () => creature('ox'), sheep: () => creature('sheep'), mouflon: () => creature('mouflon'),
  deer: () => creature('deer'), stag: () => creature('stag'), elephant: () => creature('elephant'), fox: () => creature('fox'),
  // people (two variants each: skins, builds)
  farmer: () => workerModel('farmer', 0), farmerB: () => workerModel('farmer', 1), reaper: () => workerModel('reaper', 2), herder: () => workerModel('herder', 3), herderB: () => workerModel('herder', 4),
  hunter: () => workerModel('hunter', 0), gunHunter: () => workerModel('gunHunter', 2), picker: () => workerModel('picker', 1), pickerB: () => workerModel('picker', 3), miner: () => workerModel('miner', 0), woodcutter: () => workerModel('woodcutter', 3),
  // the farm
  plough: () => plough(), ploughTeam, haycart, windpump, stoneSilo: () => silo(false), steelSilo: () => silo(true), tractor, combine,
  wattle: () => fence('wattle'), rails: () => fence('rail'), wire: () => fence('wire'), trough, shelter, stooks, rick, bales,
  // the forest
  tent, hideRack, lodge, sawmill, campfire,
  // mine and quarry
  adit, headframe, steamHeadframe, smelter, oreHeap, oreCart, treadCrane, steamCrane,
  // water and oil
  canoe, sailboat, trawler, derrick, pumpjack, oilTank,
  // plantations
  vine, teaBush, cottonBush, bananaPlant, mulberryBush, pepperPole, incenseTree, indigoBush,
  // the wild
  wildGrain, wildRice, teosinte, outcrop, boulders, wildVine, fishSchool, oysters, resinPine,
  // worked touches
  winePress, cocoonTrays, tuskPile, cottonBales, teaBaskets, saltHeaps,
} satisfies Record<string, () => G[]>;
export type KitModel = keyof typeof KIT;
export const KIT_MODELS = Object.keys(KIT) as KitModel[];
// Animals and people are figures (drawn larger than life: FIGURE_BOOST).
export const FIGURES: ReadonlySet<KitModel> = new Set<KitModel>(['horse', 'cow', 'pied', 'ox', 'sheep', 'mouflon', 'deer', 'stag', 'elephant', 'fox', 'farmer', 'farmerB', 'reaper', 'herder', 'herderB', 'hunter', 'gunHunter', 'picker', 'pickerB', 'miner', 'woodcutter', 'ploughTeam', 'haycart']);
export const SPECIES_OF: Partial<Record<KitModel, Species>> = { horse: 'horse', cow: 'cow', pied: 'pied', ox: 'ox', sheep: 'sheep', mouflon: 'mouflon', deer: 'deer', stag: 'stag', elephant: 'elephant', fox: 'fox' };
// How much larger than life a kit model is drawn (so it reads from the
// board beside the crops, themselves drawn about four times true): people
// and animals most, then machines and small things, plants, and the large
// works (windpumps, silos, headframes, lodges) least.
export const FIGURE_BOOST = 6.5, SMALL_BOOST = 4, PLANT_BOOST = 3, KIT_BOOST = 3.2, WILD_BOOST = 5;
const SMALL: ReadonlySet<KitModel> = new Set<KitModel>(['plough', 'tractor', 'combine', 'wattle', 'rails', 'wire', 'trough', 'stooks', 'rick', 'bales', 'hideRack', 'oreHeap', 'oreCart', 'winePress', 'cocoonTrays', 'tuskPile', 'cottonBales', 'teaBaskets', 'saltHeaps', 'canoe']);
const PLANTS: ReadonlySet<KitModel> = new Set<KitModel>(['vine', 'teaBush', 'cottonBush', 'bananaPlant', 'mulberryBush', 'pepperPole', 'incenseTree', 'indigoBush', 'wildGrain', 'wildRice', 'teosinte', 'wildVine', 'resinPine']);
// (The wild's rock, shells and fish: drawn as large as the resources' props were.)
const WILD: ReadonlySet<KitModel> = new Set<KitModel>(['outcrop', 'boulders', 'oysters', 'fishSchool', 'resinPine', 'campfire']);
export const kitBoost = (k: KitModel): number => (FIGURES.has(k) ? FIGURE_BOOST : WILD.has(k) ? WILD_BOOST : SMALL.has(k) ? SMALL_BOOST : PLANTS.has(k) ? PLANT_BOOST : KIT_BOOST);
export const FENCE_BOOST = SMALL_BOOST;
// A kit model in tile steps.
export function kitModel(k: KitModel): G[] {
  const m = new THREE.Matrix4().makeScale(CREATURE_SCALE, CREATURE_SCALE, CREATURE_SCALE);
  return KIT[k]().map((g) => g.applyMatrix4(m));
}
