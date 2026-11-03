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
import type { ShrubModel } from './models.ts';

export const LEAF = 0x010203;
const TIMBER = 0x7a5f45;
const P = (g: THREE.BufferGeometry, c: number, o: Tf = {}) => part(g, c, tf(o));
const box = (w: number, h: number, d: number, c: number, o: Tf = {}) => P(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, o);
const rock = (r: number, c: number, o: Tf = {}) => P(new THREE.DodecahedronGeometry(r, 0).translate(0, r * 0.55, 0), c, { sy: 0.7, ...o });
const disc = (r: number, h: number, c: number, o: Tf = {}) => P(new THREE.CylinderGeometry(r, r, h, 9).translate(0, h / 2, 0), c, o);
// ---- plants ----
// (A stump's cut face: a slice of its own trunk, so its sides line up.)
function amberStump(): THREE.BufferGeometry[] {
  return [cyl(0.0026, 0.0022, 0.0034, 7, 0x6a4a30), P(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0002, 7), 0xc49a68, { y: 0.0034 }),
    ...[[0.0034, 0.001], [-0.003, 0.0022], [0.0008, -0.0036]].map(([x, z]) => P(new THREE.OctahedronGeometry(0.0011, 0).translate(0, 0.0007, 0), 0xe0902a, { x, z }))];
}

// ---- minerals ----
function crystals(): THREE.BufferGeometry[] {
  return [rock(0.0032, 0x6e6a62), ...[[0, 0, 0], [0.0016, 0.6, 0.4], [-0.0014, -0.5, 0.2], [0.0006, 0.2, -0.6], [-0.0008, -0.3, -0.5]].map(([x, rz, rx]) =>
    cone(0.0008, 0.005, 6, LEAF, { x, y: 0.0024, rz, rx }))];
}
function crust(): THREE.BufferGeometry[] {
  return [P(new THREE.CylinderGeometry(0.0062, 0.007, 0.0004, 8), 0xe6e0d0, { y: 0.0002, sz: 0.7 }),
    ...[[0.002, 0.001], [-0.0026, -0.0008], [0.0004, -0.0026], [-0.0006, 0.0024]].map(([x, z]) => rock(0.0011, 0xf2eee4, { x, y: 0.0003, z }))];
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
export const RESOURCE_MODEL_KEYS = ['amberStump', 'crystals', 'crust', 'oilPool', 'spiceMats', 'dyeVats'] as const;
export type ResourceModel = (typeof RESOURCE_MODEL_KEYS)[number];
export const RESOURCE_MODELS: Record<ResourceModel, () => THREE.BufferGeometry[]> = { amberStump, crystals, crust, oilPool, spiceMats, dyeVats };

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
const ORE = { copper: [0x3a9a7a, 0x4aa88a], iron: [0x9a4a2a, 0x8a3f24], gold: [0xe8c040, 0xd8b030], gems: [0x9a5ad0, 0x3ab0b0, 0xd04a7a], coal: [0x0e0d0c, 0x161412] } as const;
export const RESOURCE_WILD: Record<ResourceKey, ResourceLook> = {
  wheat: L({ model: 'grainPatch', n: 12, colors: [0xc8a446, 0xbf9c40, 0xd0ac52] }),
  rice: L({ model: 'wildRice', n: 7 }),
  maize: L({ model: 'tallPatch', n: 10, colors: [0x6f9238, 0x7a9a40, 0x668a34] }),
  // (Bananas: no model of their own; a third of the tile's trees are banana plants, render.ts.)
  bananas: L(),
  cattle: L({ model: 'ox', n: 3, colors: [0x2a2018, 0x3a2a1e, 0x5a3a24] }),
  sheep: L({ model: 'mouflon', n: 4, colors: [0x8a5a34, 0x7a4a2a, 0x9a6a40, 0x8a5a34] }),
  deer: L({ model: 'stag', n: 1, colors: [0x8a5a34] }, { model: 'deer', n: 3, colors: [0x9a6a40, 0x8a5e38] }),
  fish: W({ model: 'fishSchool', n: 2 }),
  stone: L({ model: 'boulders', n: 2 }),
  copper: L({ model: 'outcrop', n: 2, colors: ORE.copper }),
  wine: L({ model: 'wildVine', n: 3, colors: [0x4a6a2a, 0x557434] }),
  incense: L({ model: 'incenseTree', n: 3, colors: [0x7a8a5a, 0x6f8250] }),
  silk: L({ model: 'mulberryBush', n: 3, colors: [0x557a3a, 0x4e7034] }),
  spices: L({ model: 'spiceShrub', n: 5, colors: [0x3f6a2c, 0x4a7432] }),
  furs: L({ model: 'fox', n: 3, colors: [0xc8642a, 0xb85a24, 0xd0703a] }),
  ivory: L({ model: 'elephant', n: 2, colors: [0x8c8680, 0x7e7872] }),
  dyes: L({ model: 'indigoBush', n: 4, colors: [0x3a5a4a, 0x42624e] }),
  gold: L({ model: 'outcrop', n: 2, colors: ORE.gold }),
  gems: L({ model: 'crystals', n: 4, colors: ORE.gems }),
  pearls: W({ model: 'oysters', n: 2 }),
  salt: L({ model: 'crust', n: 4 }),
  cotton: L({ model: 'cottonBush', n: 5, colors: [0x5a7a3a, 0x52703a] }),
  tea: L({ model: 'teaShrub', n: 6, colors: [0x3f6a2a, 0x4a7a32, 0x456e2c] }),
  amber: L({ model: 'resinPine', n: 2 }),
  horses: L({ model: 'horse', n: 4, colors: [0xb08a5a, 0x7a4a2a, 0xa08868, 0x5a3a24] }),
  iron: L({ model: 'oreRock', n: 2, colors: ORE.iron }),
  niter: L({ model: 'crust', n: 3 }),
  coal: L({ model: 'oreRock', n: 2, colors: ORE.coal }),
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
export const RESOURCE_PATCH = 0.17, RESOURCE_SCALE = 6.5, PATCH_SIZE = 0.075;
// (The leaf-card plants, true size in metres: drawn this much larger than life.)
const SHRUB_BOOST: Partial<Record<ShrubModel, number>> = { teaShrub: 9, spiceShrub: 9, cottonBush: 7, indigoBush: 7, wildVine: 5, mulberryBush: 4.5, incenseTree: 4.5 };
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
    // (The kit's models are true to size: drawn a little larger than life,
    // kitBoost; a stand of grain a unit across, PATCH_SIZE; a shrub as a
    // plantation's plants were.)
    const s0 = m.model in KIT ? kitBoost(m.model as KitModel) : m.model === 'grainPatch' || m.model === 'tallPatch' ? PATCH_SIZE : SHRUB_BOOST[m.model as ShrubModel] ?? RESOURCE_SCALE;
    return { ...m, x: best[0], y: best[1], yaw: rand() * Math.PI * 2, s: s0 * (0.9 + 0.2 * rand()) };
  });
}
