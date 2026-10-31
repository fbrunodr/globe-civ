// What each resource looks like on its tile (resources.ts): a few small
// models standing on it, in tile steps at true size like the countryside's
// (models.ts), the parts marked LEAF taking each instance's colour (a
// horse's coat, an ore's tint). RESOURCE_LOOKS says which models a
// resource shows and how many; render.ts lays them out on the tile.

import * as THREE from 'three';
import { cone, cyl, part, tf, type Tf } from '../propCatalog.ts';
import type { ResourceKey } from '../resources.ts';
import type { RuralModel } from './models.ts';
import { KIT, kitBoost, type KitModel } from './kit.ts';

export const LEAF = 0x010203;
const TIMBER = 0x7a5f45, TRUNK = 0x6a5038, STRAW = 0xd2b46a, DEEP = 0x3a6128, WHITE = 0xece6da;
const P = (g: THREE.BufferGeometry, c: number, o: Tf = {}) => part(g, c, tf(o));
const box = (w: number, h: number, d: number, c: number, o: Tf = {}) => P(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, o);
const rock = (r: number, c: number, o: Tf = {}) => P(new THREE.DodecahedronGeometry(r, 0).translate(0, r * 0.55, 0), c, { sy: 0.7, ...o });
const blob = (r: number, c: number, o: Tf = {}) => P(new THREE.IcosahedronGeometry(r, 0).translate(0, r, 0), c, o);
const disc = (r: number, h: number, c: number, o: Tf = {}) => P(new THREE.CylinderGeometry(r, r, h, 9).translate(0, h / 2, 0), c, o);
const legs = (w: number, d: number, h: number, t: number, c: number, x0 = 0) =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(t, h, t, c, { x: x0 + a! * w, z: b! * d }));

// ---- animals ----

// ---- crops and plants ----
function stook(): THREE.BufferGeometry[] {
  return [0, 1, 2, 3].map((k) => cone(0.0016, 0.0062, 6, k % 2 ? STRAW : 0xc4a55c, { x: Math.cos(k * 1.57) * 0.0008, z: Math.sin(k * 1.57) * 0.0008, rx: Math.sin(k * 1.57) * 0.25, rz: -Math.cos(k * 1.57) * 0.25 }))
    .concat([cone(0.0012, 0.002, 6, 0xb08f4a, { y: 0.0056 })]);
}
function maize(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[0, 0], [0.003, 0.0012], [-0.0025, 0.0018], [0.0012, -0.0028], [-0.002, -0.0016]]) {
    out.push(cyl(0.00035, 0.00025, 0.0105, 4, 0x6f8f3a, { x, z }));
    for (const [y, a] of [[0.003, 0], [0.0052, 2.1], [0.0074, 4.2]]) out.push(box(0.0042, 0.0002, 0.0009, 0x5f8a34, { x: x! + Math.cos(a!) * 0.0018, y, z: z! + Math.sin(a!) * 0.0018, ry: -a!, rz: -0.35 }));
    out.push(box(0.0007, 0.0024, 0.0007, 0xe0b840, { x: x! + 0.0005, y: 0.0056, z }));
  }
  return out;
}
function banana(): THREE.BufferGeometry[] {
  const out = [cyl(0.0008, 0.0006, 0.0085, 6, 0x7a7a3a)];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    out.push(box(0.0075, 0.0002, 0.0026, k % 2 ? 0x5e9a3a : 0x4f8a30, { x: Math.cos(a) * 0.0034, y: 0.0078, z: Math.sin(a) * 0.0034, ry: -a, rz: -0.45 }));
  }
  out.push(box(0.0016, 0.0026, 0.0016, 0xe2c84a, { x: 0.0012, y: 0.0042 }));
  return out;
}
function paddy(): THREE.BufferGeometry[] {
  const out = [box(0.026, 0.0003, 0.018, 0x6f95a0), ...[[0, 0.0094, 0.0274, 0.0014], [0, -0.0094, 0.0274, 0.0014], [0.0137, 0, 0.0014, 0.0188], [-0.0137, 0, 0.0014, 0.0188]].map(([x, z, w, d]) => box(w!, 0.0012, d!, 0x7a6a44, { x, z }))];
  for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) out.push(cone(0.0006, 0.0024, 4, (i + j) % 2 ? 0x7aa83e : 0x6a9a36, { x: i * 0.0034, z: j * 0.0032 }));
  return out;
}
const row = (n: number, gap: number, make: (x: number, k: number) => THREE.BufferGeometry[]) => Array.from({ length: n }, (_, k) => make((k - (n - 1) / 2) * gap, k)).flat();
function vines(): THREE.BufferGeometry[] {
  return [-0.0035, 0.0035].flatMap((z) => [
    ...[-0.011, 0, 0.011].map((x) => box(0.0005, 0.0062, 0.0005, TIMBER, { x, z })),
    box(0.024, 0.0036, 0.0022, 0x58803a, { y: 0.0022, z }),
    ...row(7, 0.0032, (x) => [box(0.0012, 0.0014, 0.0012, 0x5a2a5a, { x, y: 0.0016, z: z + 0.0012 })]),
  ]);
}
function bushRow(leafy: number, dot: number, n = 5): THREE.BufferGeometry[] {
  return row(n, 0.0046, (x, k) => [blob(0.0019, leafy, { x, z: (k % 2) * 0.0008, sy: 0.8 }), ...[0, 2.1, 4.2].map((a) => box(0.0009, 0.0009, 0.0009, dot, { x: x + Math.cos(a + k) * 0.0014, y: 0.0026, z: Math.sin(a + k) * 0.0014 }))]);
}
function teaRow(): THREE.BufferGeometry[] {
  return [box(0.026, 0.0012, 0.006, 0x7a6a48), ...row(6, 0.0042, (x) => [disc(0.0019, 0.0026, DEEP, { x, y: 0.0012 }), blob(0.0018, 0x4a7a32, { x, y: 0.002, sy: 0.55 })])];
}
function tree(trunk: number, crown: number, h: number, r: number): THREE.BufferGeometry[] {
  return [cyl(r * 0.18, r * 0.14, h, 5, trunk), blob(r, crown, { y: h * 0.75, sy: 0.75 })];
}
function mulberry(): THREE.BufferGeometry[] {
  return [...tree(TRUNK, 0x557a3a, 0.0062, 0.0036),
    box(0.006, 0.0004, 0.0036, TIMBER, { x: 0.0062, y: 0.0028 }), ...legs(0.0026, 0.0014, 0.0028, 0.0004, TIMBER, 0.0062),
    ...row(4, 0.0012, (x) => [box(0.0007, 0.0006, 0.0007, WHITE, { x: 0.0062 + x, y: 0.0032 })])];
}
function amberStump(): THREE.BufferGeometry[] {
  return [cyl(0.0026, 0.0022, 0.0034, 7, 0x6a4a30), P(new THREE.CircleGeometry(0.0022, 7).rotateX(-Math.PI / 2), 0xc49a68, { y: 0.0035 }),
    ...[[0.0034, 0.001], [-0.003, 0.0022], [0.0008, -0.0036]].map(([x, z]) => P(new THREE.OctahedronGeometry(0.0011, 0).translate(0, 0.0007, 0), 0xe0902a, { x, z }))];
}

// ---- minerals ----
function ore(): THREE.BufferGeometry[] {
  return [rock(0.0042, 0x7d776c), rock(0.0024, LEAF, { x: 0.0034, z: 0.0018 }), rock(0.0018, LEAF, { x: -0.003, z: 0.0026 }), rock(0.0014, LEAF, { x: 0.0012, y: 0.0028, z: -0.001 })];
}
function goldOre(): THREE.BufferGeometry[] {
  return [rock(0.004, 0x8a8478), rock(0.0026, 0x9a9488, { x: 0.004, z: -0.002 }),
    ...[[0.0012, 0.0036, 0.0008], [-0.0016, 0.003, -0.0012], [0.0042, 0.0022, -0.0008], [0.0004, 0.0024, 0.0024]].map(([x, y, z]) => P(new THREE.OctahedronGeometry(0.0008, 0), 0xe8c040, { x, y, z }))];
}
function crystals(): THREE.BufferGeometry[] {
  return [rock(0.0032, 0x6e6a62), ...[[0, 0, 0], [0.0016, 0.6, 0.4], [-0.0014, -0.5, 0.2], [0.0006, 0.2, -0.6], [-0.0008, -0.3, -0.5]].map(([x, rz, rx]) =>
    cone(0.0008, 0.005, 6, LEAF, { x, y: 0.0024, rz, rx }))];
}
function crust(): THREE.BufferGeometry[] {
  return [P(new THREE.CylinderGeometry(0.0062, 0.007, 0.0004, 8), 0xe6e0d0, { y: 0.0002, sz: 0.7 }),
    ...[[0.002, 0.001], [-0.0026, -0.0008], [0.0004, -0.0026], [-0.0006, 0.0024]].map(([x, z]) => rock(0.0011, 0xf2eee4, { x, y: 0.0003, z }))];
}
function coalCart(): THREE.BufferGeometry[] {
  return [...[-0.0012, 0.0012].map((z) => box(0.022, 0.0003, 0.0004, 0x4a4744, { z })),
    box(0.0046, 0.0026, 0.003, 0x5a4a3a, { y: 0.0012 }), box(0.0042, 0.0012, 0.0026, 0x1e1c1a, { y: 0.0034 }),
    ...[-1, 1].flatMap((a) => [-1, 1].map((b) => P(new THREE.CylinderGeometry(0.0007, 0.0007, 0.0004, 8).rotateX(Math.PI / 2), 0x2a2826, { x: a * 0.0016, y: 0.0007, z: b * 0.0016 })))];
}
function oilPool(): THREE.BufferGeometry[] {
  return [P(new THREE.CylinderGeometry(0.0062, 0.0062, 0.0003, 9), 0x141312, { y: 0.00015, sz: 0.65 }), P(new THREE.CylinderGeometry(0.0024, 0.0024, 0.0004, 7), 0x1c1a18, { x: 0.006, y: 0.0002, z: 0.003 })];
}

// ---- crafts ----
function spiceMats(): THREE.BufferGeometry[] {
  return [0xb4542a, 0xd88a2a, 0xd8b03a, 0x8a3a24].flatMap((c, k) => [box(0.0062, 0.0002, 0.0048, 0xc8b484, { x: (k % 2) * 0.0072 - 0.0036, z: Math.floor(k / 2) * 0.0058 - 0.0029 }),
    cone(0.0018, 0.0014, 7, c, { x: (k % 2) * 0.0072 - 0.0036, y: 0.0002, z: Math.floor(k / 2) * 0.0058 - 0.0029 })]);
}
function dyeVats(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  [0x2a3a8a, 0xa02a3a, 0xd8a028].forEach((c, k) => { const x = (k - 1) * 0.0056; out.push(cyl(0.0022, 0.0022, 0.0028, 8, 0x7a5a3a, { x }), disc(0.0019, 0.0002, c, { x, y: 0.0026 })); });
  out.push(...[-0.009, 0.009].map((x) => box(0.0004, 0.0074, 0.0004, TIMBER, { x, z: 0.0052 })), box(0.018, 0.0003, 0.0003, TIMBER, { y: 0.0072, z: 0.0052 }));
  [0x2a3a8a, 0xa02a3a, 0xd8a028, 0x5a2a6a].forEach((c, k) => out.push(box(0.0028, 0.0042, 0.0002, c, { x: (k - 1.5) * 0.0038, y: 0.003, z: 0.0052 })));
  return out;
}
function furRack(): THREE.BufferGeometry[] {
  return [...[-0.006, 0.006].map((x) => box(0.0005, 0.0072, 0.0005, TIMBER, { x })), box(0.0136, 0.0004, 0.0004, TIMBER, { y: 0.0068 }),
    ...[0x6a4a30, 0x8a6a48, 0x4a3a2a, 0x9a8468].map((c, k) => box(0.0024, 0.0044, 0.0002, c, { x: (k - 1.5) * 0.003, y: 0.0024 })),
    cone(0.0048, 0.0078, 7, 0xa89070, { x: 0.004, z: -0.0076 }), ...[0.6, 2.4, 4.2].map((a) => cyl(0.00015, 0.00015, 0.0026, 3, TIMBER, { x: 0.004 + Math.cos(a) * 0.0003, y: 0.0074, z: -0.0076 + Math.sin(a) * 0.0003, rz: Math.cos(a) * 0.4, rx: -Math.sin(a) * 0.4 }))];
}
function boat(): THREE.BufferGeometry[] {
  return [box(0.0082, 0.0014, 0.0028, 0x6a4a30), box(0.0074, 0.0004, 0.0022, 0x8a6a48, { y: 0.0012 }), P(new THREE.ConeGeometry(0.0014, 0.0024, 4).rotateZ(-Math.PI / 2), 0x6a4a30, { x: 0.0052, y: 0.0008, sx: 1, sz: 1 }),
    box(0.0012, 0.0024, 0.0012, 0x8a4a3a, { x: -0.0012, y: 0.0014 }), box(0.001, 0.001, 0.001, 0xd2a888, { x: -0.0012, y: 0.0038 }),
    ...Array.from({ length: 8 }, (_, k) => box(0.0007, 0.0006, 0.0007, 0xe8d8a0, { x: 0.006 + Math.cos(k * 0.785) * 0.006, z: 0.004 + Math.sin(k * 0.785) * 0.006 }))];
}
function raft(): THREE.BufferGeometry[] {
  return [...row(6, 0.0012, (x) => [P(new THREE.CylinderGeometry(0.00055, 0.00055, 0.009, 5).rotateX(Math.PI / 2), 0xb8a070, { x, y: 0.0005 })]),
    ...[-0.002, 0.002].map((z) => cyl(0.0012, 0.001, 0.0016, 7, 0xa88a58, { y: 0.001, z })), box(0.0024, 0.0008, 0.0016, WHITE, { x: 0.002, y: 0.001 })];
}
function saltPans(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) out.push(box(0.0086, 0.0003, 0.0068, j ? 0xf0ece4 : 0xd8e0e0, { x: (i - 0.5) * 0.0098, z: (j - 0.5) * 0.008 }));
  out.push(box(0.02, 0.0009, 0.0009, 0x9a8a6a), box(0.0009, 0.0009, 0.0168, 0x9a8a6a), cone(0.0026, 0.0034, 8, WHITE, { x: 0.0124, z: 0.002 }), cone(0.002, 0.0026, 8, WHITE, { x: 0.0118, z: -0.0042 }));
  return out;
}
function cottonRow(): THREE.BufferGeometry[] { return bushRow(0x5a7a3a, 0xf6f2ea); }
function bushes(): THREE.BufferGeometry[] { return bushRow(0x4f7a30, 0xc0402a, 3); }

export const RESOURCE_MODEL_KEYS = [
  'stook', 'maize', 'banana', 'paddy', 'vines', 'cottonRow', 'teaRow', 'bushes', 'mulberry', 'amberStump',
  'ore', 'goldOre', 'crystals', 'crust', 'coalCart', 'oilPool', 'spiceMats', 'dyeVats', 'furRack', 'boat', 'raft', 'saltPans',
] as const;
export type ResourceModel = (typeof RESOURCE_MODEL_KEYS)[number];
export const RESOURCE_MODELS: Record<ResourceModel, () => THREE.BufferGeometry[]> = {
  stook, maize, banana, paddy, vines, cottonRow, teaRow, bushes, mulberry, amberStump,
  ore, goldOre, crystals, crust, coalCart, oilPool, spiceMats, dyeVats, furRack, boat, raft, saltPans,
};

// What a resource shows near its badge: in the wild (its tile not worked
// for it), the resource as nature has it: wild grain, aurochs and wild
// horses, mouflon, foxes, elephants, rock with its vein, a vine over a
// bush, a school of fish; worked, its own touches beside its improvement's
// look (the farm, the pasture, the mine: rural/stages.ts): a wine press, a
// heap of its ore, tusks, bales. Models (these, the countryside's, the
// kit's), how many, their colours (for the leaf parts), picked in turn.
type Shown = RuralModel;
export interface ResourceLook { readonly parts: readonly { readonly model: Shown; readonly n: number; readonly colors?: readonly number[] }[]; readonly water?: true }
const L = (...parts: ResourceLook['parts']): ResourceLook => ({ parts });
const W = (...parts: ResourceLook['parts']): ResourceLook => ({ parts, water: true });
const ORE = { copper: [0x3a9a7a, 0x4aa88a], iron: [0x9a4a2a, 0x8a3f24], gold: [0xe8c040, 0xd8b030], gems: [0x9a5ad0, 0x3ab0b0, 0xd04a7a], coal: [0x1e1c1a, 0x2a2826] } as const;
export const RESOURCE_WILD: Record<ResourceKey, ResourceLook> = {
  wheat: L({ model: 'wildGrain', n: 8 }),
  rice: L({ model: 'wildRice', n: 7 }),
  maize: L({ model: 'teosinte', n: 5 }),
  bananas: L({ model: 'bananaPlant', n: 3 }),
  cattle: L({ model: 'ox', n: 3, colors: [0x2a2018, 0x3a2a1e, 0x5a3a24] }),
  sheep: L({ model: 'mouflon', n: 4, colors: [0x8a5a34, 0x7a4a2a, 0x9a6a40, 0x8a5a34] }),
  deer: L({ model: 'stag', n: 1, colors: [0x8a5a34] }, { model: 'deer', n: 3, colors: [0x9a6a40, 0x8a5e38] }),
  fish: W({ model: 'fishSchool', n: 2 }),
  stone: L({ model: 'boulders', n: 2 }),
  copper: L({ model: 'outcrop', n: 2, colors: ORE.copper }),
  wine: L({ model: 'wildVine', n: 3 }),
  incense: L({ model: 'incenseTree', n: 3 }),
  silk: L({ model: 'mulberryBush', n: 3 }),
  spices: L({ model: 'pepperPole', n: 2 }, { model: 'bushes', n: 2 }),
  furs: L({ model: 'fox', n: 3, colors: [0xc8642a, 0xb85a24, 0xd0703a] }),
  ivory: L({ model: 'elephant', n: 2, colors: [0x8c8680, 0x7e7872] }),
  dyes: L({ model: 'indigoBush', n: 4 }),
  gold: L({ model: 'outcrop', n: 2, colors: ORE.gold }),
  gems: L({ model: 'outcrop', n: 1, colors: [0x9a5ad0] }, { model: 'crystals', n: 3, colors: ORE.gems }),
  pearls: W({ model: 'oysters', n: 2 }),
  salt: L({ model: 'crust', n: 4 }),
  cotton: L({ model: 'cottonBush', n: 5 }),
  tea: L({ model: 'teaBush', n: 5 }),
  amber: L({ model: 'resinPine', n: 2 }),
  horses: L({ model: 'horse', n: 4, colors: [0xb08a5a, 0x7a4a2a, 0xa08868, 0x5a3a24] }),
  iron: L({ model: 'outcrop', n: 2, colors: ORE.iron }),
  niter: L({ model: 'crust', n: 3 }),
  coal: L({ model: 'outcrop', n: 2, colors: ORE.coal }),
  oil: L({ model: 'oilPool', n: 2 }),
};
export const RESOURCE_WORKED: Partial<Record<ResourceKey, ResourceLook>> = {
  copper: L({ model: 'oreHeap', n: 1, colors: [ORE.copper[0]] }),
  iron: L({ model: 'oreHeap', n: 1, colors: [ORE.iron[0]] }),
  gold: L({ model: 'oreHeap', n: 1, colors: [0xb8a060] }),
  gems: L({ model: 'crystals', n: 2, colors: ORE.gems }),
  coal: L({ model: 'oreHeap', n: 1, colors: [ORE.coal[0]] }),
  niter: L({ model: 'oreHeap', n: 1, colors: [0xe8e2d0] }),
  salt: L({ model: 'saltHeaps', n: 1 }),
  wine: L({ model: 'winePress', n: 1 }),
  silk: L({ model: 'cocoonTrays', n: 1 }),
  spices: L({ model: 'spiceMats', n: 1 }),
  dyes: L({ model: 'dyeVats', n: 1 }),
  furs: L({ model: 'hideRack', n: 1 }),
  ivory: L({ model: 'tuskPile', n: 1 }),
  cotton: L({ model: 'cottonBales', n: 1 }),
  tea: L({ model: 'teaBaskets', n: 1 }),
  amber: L({ model: 'amberStump', n: 2 }),
};
// (The gallery's name for the wild look, kept for its callers.)
export const RESOURCE_LOOKS = RESOURCE_WILD;

// How a resource's models stand in its patch: each spot the best of a few
// random tries, away from those taken (positions in tile steps from the
// patch's middle, x and y along its frame; s: the model's scale, a little
// larger than life so it reads beside the flora).
export const RESOURCE_PATCH = 0.17, RESOURCE_SCALE = 6.5;
export interface ResourceSpot { readonly model: Shown; readonly color: number | undefined; readonly x: number; readonly y: number; readonly yaw: number; readonly s: number }
export function resourceLayout(r: ResourceKey, rand: () => number, look: ResourceLook = RESOURCE_WILD[r]): ResourceSpot[] {
  const models = look.parts.flatMap((pt) => Array.from({ length: pt.n }, (_, i) => ({ model: pt.model, color: pt.colors?.[i % pt.colors.length] })));
  const taken: [number, number][] = [];
  return models.map((m) => {
    let best: [number, number] = [0, 0], bestD = -1;
    for (let c = 0; c < 10; c++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * RESOURCE_PATCH;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      const d = taken.reduce((m2, [px, py]) => Math.min(m2, (px - x) ** 2 + (py - y) ** 2), Infinity);
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    taken.push(best);
    // (The kit's models are true to size: drawn a little larger than life, kitBoost.)
    return { ...m, x: best[0], y: best[1], yaw: rand() * Math.PI * 2, s: (m.model in KIT ? kitBoost(m.model as KitModel) : RESOURCE_SCALE) * (0.9 + 0.2 * rand()) };
  });
}
