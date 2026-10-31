// What each resource looks like on its tile (resources.ts): a few small
// models standing on it, in tile steps at true size like the countryside's
// (models.ts), the parts marked LEAF taking each instance's colour (a
// horse's coat, an ore's tint). RESOURCE_LOOKS says which models a
// resource shows and how many; render.ts lays them out on the tile.

import * as THREE from 'three';
import { cone, cyl, part, tf, type Tf } from '../propCatalog.ts';
import type { ResourceKey } from '../resources.ts';

export const LEAF = 0x010203;
const DARK = 0x2a2622, TIMBER = 0x7a5f45, TRUNK = 0x6a5038, STRAW = 0xd2b46a, DEEP = 0x3a6128, WHITE = 0xece6da;
const P = (g: THREE.BufferGeometry, c: number, o: Tf = {}) => part(g, c, tf(o));
const box = (w: number, h: number, d: number, c: number, o: Tf = {}) => P(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, o);
const rock = (r: number, c: number, o: Tf = {}) => P(new THREE.DodecahedronGeometry(r, 0).translate(0, r * 0.55, 0), c, { sy: 0.7, ...o });
const blob = (r: number, c: number, o: Tf = {}) => P(new THREE.IcosahedronGeometry(r, 0).translate(0, r, 0), c, o);
const disc = (r: number, h: number, c: number, o: Tf = {}) => P(new THREE.CylinderGeometry(r, r, h, 9).translate(0, h / 2, 0), c, o);
const legs = (w: number, d: number, h: number, t: number, c: number, x0 = 0) =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(t, h, t, c, { x: x0 + a! * w, z: b! * d }));

// ---- animals ----
function horse(): THREE.BufferGeometry[] {
  return [
    box(0.0064, 0.0026, 0.0022, LEAF, { y: 0.0034 }), ...legs(0.0025, 0.0007, 0.0034, 0.0006, LEAF),
    box(0.0015, 0.0036, 0.0014, LEAF, { x: 0.0031, y: 0.0042, rz: -0.55 }), box(0.0028, 0.0012, 0.0012, LEAF, { x: 0.0052, y: 0.0068, rz: -0.25 }),
    box(0.0008, 0.0032, 0.0004, DARK, { x: 0.0028, y: 0.0048, rz: -0.55 }), box(0.0006, 0.0028, 0.0006, DARK, { x: -0.0034, y: 0.0024, rz: 0.3 }),
    ...[[-1], [1]].map(([a]) => box(0.0004, 0.0008, 0.0003, LEAF, { x: 0.0048, y: 0.0078, z: a! * 0.0004 })),
  ];
}
function deer(): THREE.BufferGeometry[] {
  const tan = 0x9a6e44;
  return [
    box(0.0052, 0.0022, 0.0018, tan, { y: 0.003 }), ...legs(0.002, 0.0006, 0.003, 0.0005, tan),
    box(0.0012, 0.0028, 0.0011, tan, { x: 0.0026, y: 0.0036, rz: -0.35 }), box(0.002, 0.001, 0.001, tan, { x: 0.0037, y: 0.0062 }),
    box(0.0012, 0.0012, 0.0004, WHITE, { x: -0.0027, y: 0.0034 }),
    ...[-1, 1].flatMap((a) => [cyl(0.00015, 0.0001, 0.0028, 3, 0xcdb998, { x: 0.0034, y: 0.007, z: a * 0.0004, rx: a * 0.35 }), cyl(0.0001, 0.00008, 0.0012, 3, 0xcdb998, { x: 0.0034, y: 0.0085, z: a * 0.0009, rz: -0.8 })]),
  ];
}
function elephant(): THREE.BufferGeometry[] {
  const grey = 0x8c8680;
  return [
    box(0.011, 0.0062, 0.0066, grey, { y: 0.0052 }), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => cyl(0.0014, 0.0013, 0.0054, 6, grey, { x: a! * 0.0038, z: b! * 0.002 })),
    box(0.0042, 0.0046, 0.0044, grey, { x: 0.0066, y: 0.0068 }),
    ...[-1, 1].map((a) => box(0.0012, 0.0052, 0.0044, 0x7a746e, { x: 0.0058, y: 0.0062, z: a * 0.0034, ry: a * 0.4 })),
    cyl(0.0011, 0.0005, 0.0068, 6, grey, { x: 0.0092, y: 0.0012, rz: 0.12 }),
    ...[-1, 1].map((a) => cone(0.0005, 0.0042, 5, 0xf2ecdc, { x: 0.0084, y: 0.0066, z: a * 0.0013, rz: -2.1 })),
    box(0.0008, 0.0034, 0.0005, 0x6a645e, { x: -0.0058, y: 0.0042, rz: 0.2 }),
  ];
}

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
function incenseTree(): THREE.BufferGeometry[] {
  return [cyl(0.0006, 0.0004, 0.0048, 5, 0x8a7a64, { rz: 0.25 }), cyl(0.0004, 0.0003, 0.0034, 5, 0x8a7a64, { x: -0.0012, y: 0.0044, rz: -0.5 }), cyl(0.0004, 0.0003, 0.003, 5, 0x8a7a64, { x: -0.0012, y: 0.0044, rz: 0.6 }),
    blob(0.0026, 0x7a8a5a, { x: -0.0028, y: 0.0062, sy: 0.45 }), blob(0.0022, 0x6f8250, { x: 0.0018, y: 0.0062, sy: 0.45 })];
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
function derrick(): THREE.BufferGeometry[] {
  const h = 0.022, out: THREE.BufferGeometry[] = [box(0.008, 0.0008, 0.008, TIMBER)];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lean = Math.atan(0.0028 / h);
    out.push(cyl(0.0003, 0.00025, h / Math.cos(lean), 4, TIMBER, { x: a! * 0.003, z: b! * 0.003, rx: -b! * lean, rz: a! * lean }));
  }
  for (const y of [0.006, 0.012, 0.017]) { const w = 0.006 * (1 - y / h * 0.85); out.push(...[-1, 1].map((s) => box(w, 0.0003, 0.0003, TIMBER, { y, z: s * w / 2 })), ...[-1, 1].map((s) => box(0.0003, 0.0003, w, TIMBER, { y, x: s * w / 2 }))); }
  out.push(box(0.0018, 0.0016, 0.0018, 0x4a4744, { y: h }), box(0.004, 0.003, 0.003, 0x6a5a48, { x: 0.006, z: 0.002 }));
  return out;
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
  'horse', 'deer', 'elephant', 'stook', 'maize', 'banana', 'paddy', 'vines', 'cottonRow', 'teaRow', 'bushes', 'incenseTree', 'mulberry', 'amberStump',
  'ore', 'goldOre', 'crystals', 'crust', 'coalCart', 'derrick', 'oilPool', 'spiceMats', 'dyeVats', 'furRack', 'boat', 'raft', 'saltPans',
] as const;
export type ResourceModel = (typeof RESOURCE_MODEL_KEYS)[number];
export const RESOURCE_MODELS: Record<ResourceModel, () => THREE.BufferGeometry[]> = {
  horse, deer, elephant, stook, maize, banana, paddy, vines, cottonRow, teaRow, bushes, incenseTree, mulberry, amberStump,
  ore, goldOre, crystals, crust, coalCart, derrick, oilPool, spiceMats, dyeVats, furRack, boat, raft, saltPans,
};

// What a resource shows: models (from these or the countryside's), how
// many of each, and their colours (for the LEAF parts), picked in turn.
type Shown = ResourceModel | 'cow' | 'sheep' | 'block' | 'heap' | 'adit';
export interface ResourceLook { readonly parts: readonly { readonly model: Shown; readonly n: number; readonly colors?: readonly number[] }[]; readonly water?: true }
const L = (...parts: ResourceLook['parts']): ResourceLook => ({ parts });
export const RESOURCE_LOOKS: Record<ResourceKey, ResourceLook> = {
  wheat: L({ model: 'stook', n: 6 }),
  rice: L({ model: 'paddy', n: 2 }),
  maize: L({ model: 'maize', n: 4 }),
  bananas: L({ model: 'banana', n: 4 }),
  cattle: L({ model: 'cow', n: 4, colors: [0x6a4a32, 0x2a2622, 0xe8e2d6, 0x8a5a3a] }),
  sheep: L({ model: 'sheep', n: 6, colors: [0xece6da, 0xdcd4c4, 0xece6da, 0x4a4440] }),
  deer: L({ model: 'deer', n: 3 }),
  fish: { parts: [{ model: 'boat', n: 1 }], water: true },
  stone: L({ model: 'block', n: 4, colors: [0xc8c0b0, 0xb8b0a0] }),
  copper: L({ model: 'ore', n: 3, colors: [0x5fa080, 0x4a8a6a] }, { model: 'adit', n: 1 }),
  wine: L({ model: 'vines', n: 2 }),
  incense: L({ model: 'incenseTree', n: 4 }),
  silk: L({ model: 'mulberry', n: 3 }),
  spices: L({ model: 'spiceMats', n: 1 }, { model: 'bushes', n: 2 }),
  furs: L({ model: 'furRack', n: 1 }),
  ivory: L({ model: 'elephant', n: 2 }),
  dyes: L({ model: 'dyeVats', n: 1 }),
  gold: L({ model: 'goldOre', n: 3 }, { model: 'adit', n: 1 }),
  gems: L({ model: 'crystals', n: 3, colors: [0x9a5ad0, 0x3ab0b0, 0xd04a7a] }),
  pearls: { parts: [{ model: 'raft', n: 2 }], water: true },
  salt: L({ model: 'saltPans', n: 1 }),
  cotton: L({ model: 'cottonRow', n: 3 }),
  tea: L({ model: 'teaRow', n: 3 }),
  amber: L({ model: 'amberStump', n: 3 }),
  horses: L({ model: 'horse', n: 4, colors: [0x7a4a2a, 0x3a2a20, 0xb08a5a, 0xe2dccf] }),
  iron: L({ model: 'ore', n: 3, colors: [0x8a4a32, 0x7a3f2a] }, { model: 'adit', n: 1 }),
  niter: L({ model: 'crust', n: 3 }),
  coal: L({ model: 'heap', n: 1, colors: [0x262422] }, { model: 'coalCart', n: 1 }),
  oil: L({ model: 'derrick', n: 1 }, { model: 'oilPool', n: 2 }),
};

// How a resource's models stand in its patch: each spot the best of a few
// random tries, away from those taken (positions in tile steps from the
// patch's middle, x and y along its frame; s: the model's scale, a little
// larger than life so it reads beside the flora).
export const RESOURCE_PATCH = 0.17, RESOURCE_SCALE = 6.5;
export interface ResourceSpot { readonly model: Shown; readonly color: number | undefined; readonly x: number; readonly y: number; readonly yaw: number; readonly s: number }
export function resourceLayout(r: ResourceKey, rand: () => number): ResourceSpot[] {
  const models = RESOURCE_LOOKS[r].parts.flatMap((pt) => Array.from({ length: pt.n }, (_, i) => ({ model: pt.model, color: pt.colors?.[i % pt.colors.length] })));
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
    return { ...m, x: best[0], y: best[1], yaw: rand() * Math.PI * 2, s: RESOURCE_SCALE * (0.9 + 0.2 * rand()) };
  });
}
