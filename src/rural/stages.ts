// What a worked tile shows at each stage of its improvement (its owner's
// techs that improve it: techs.ts improvementStage), so the land is seen
// worked better as the civ learns: a first farm's patches hoed by hand,
// the ox plough, haycarts and ricks, windpumps and silos, tractors and
// combines; open herding, then wattle, rail and wire fences; hunters with
// bows in hide tents, then a lodge, then muskets, then a steam sawmill; an
// adit, a timber headframe, a smelter, a steam headframe; canoes, sailing
// boats, a trawler; a derrick, pumpjacks, tanks. Pure data (cityProps.ts
// places it on the farm's layout, farmPainter.ts).
//
// A resource's tile is worked its own way (resources.ts
// RESOURCE_IMPROVEMENT): a pasture holds that resource's animals, a
// plantation that resource's plants, a hunting camp its hunters.

import type { ImprovementKey } from '../cities.ts';
import type { ResourceKey } from '../resources.ts';
import type { RuralDensity } from '../farmPainter.ts';
import type { KitModel } from './kit.ts';
import { rhoOf, SAFE_RHO, type Pt } from '../town/geometry.ts';

// Where a thing stands on the farm: by the homestead, in its yards, out in
// its fields (anywhere it works, off the yards and the homestead).
export type Where = 'home' | 'yard' | 'field';
export interface Placed { readonly model: KitModel; readonly n: number; readonly where: Where; readonly colors?: readonly number[] }
export interface StageLook {
  readonly density: RuralDensity;          // how many yards, a barn
  readonly fence?: 'wattle' | 'rails' | 'wire'; // a pasture's (pastureFences)
  readonly herd?: { readonly models: readonly KitModel[]; readonly colors: readonly number[] }; // a pasture's animals (herdSize of them)
  readonly plants?: { readonly model: KitModel; readonly rows: boolean }; // a plantation's
  readonly adits: number;                   // a mine's adits into its slopes
  readonly things: readonly Placed[];
}

const at = (model: KitModel, n: number, where: Where, colors?: readonly number[]): Placed => (colors ? { model, n, where, colors } : { model, n, where });
const MACHINE = [0xb83a2a, 0x3a7a3a, 0x2a5a9a, 0xd8a02a] as const; // tractors' paint: red, green, blue, yellow
const CLOTHES = [0x8a6a48, 0x6a5a7a, 0x9a4a3a, 0x5a7a5a, 0xa8925a, 0x4a5a7a] as const;

// A pasture's animals by its resource.
const HERDS: Partial<Record<ResourceKey, { models: readonly KitModel[]; colors: readonly number[] }>> = {
  cattle: { models: ['cow', 'pied', 'cow', 'ox'], colors: [0x6a4a32, 0x2a2622, 0x8a5a3a, 0xb08a5a, 0x3a2a20] },
  sheep: { models: ['sheep'], colors: [0xece6da, 0xdcd4c4, 0xf2ece0, 0x4a4440] },
  horses: { models: ['horse'], colors: [0x7a4a2a, 0x3a2a20, 0xb08a5a, 0xe2dccf, 0x8a5a34, 0x5a3a24] },
};
// A plantation's plants by its resource.
const PLANTS: Partial<Record<ResourceKey, KitModel>> = {
  wine: 'vine', tea: 'teaBush', cotton: 'cottonBush', bananas: 'bananaPlant', silk: 'mulberryBush', spices: 'pepperPole', incense: 'incenseTree', dyes: 'indigoBush',
};
const HUNTED: ReadonlySet<ResourceKey> = new Set<ResourceKey>(['deer', 'furs', 'ivory', 'amber']);

export function stageLook(imp: ImprovementKey, stage: number, res: ResourceKey | null): StageLook {
  const w = (model: KitModel, n: number, where: Where = 'field') => at(model, n, where, CLOTHES);
  switch (imp) {
    case 'farm': switch (Math.min(stage, 4)) {
      case 0: return { density: 'low', adits: 0, things: [w('farmer', 2), w('farmerB', 1), at('stooks', 2, 'yard')] };
      case 1: return { density: 'low', adits: 0, things: [at('ploughTeam', 1, 'field', [0x8a6a4a, 0x6a4a32]), w('farmerB', 1), at('stooks', 3, 'yard')] };
      case 2: return { density: 'medium', adits: 0, things: [at('haycart', 1, 'home'), w('reaper', 2), at('rick', 1, 'yard'), at('stooks', 2, 'yard')] };
      case 3: return { density: 'medium', adits: 0, things: [at('windpump', 1, 'home'), at('stoneSilo', 1, 'home'), at('haycart', 1, 'field'), w('reaper', 1), at('rick', 2, 'yard')] };
      default: return { density: 'high', adits: 0, things: [at('steelSilo', 2, 'home'), at('tractor', 1, 'field', MACHINE), at('combine', 1, 'field', MACHINE), at('bales', 2, 'yard')] };
    }
    case 'wetland': return stage === 0 ? { density: 'low', adits: 0, things: [w('farmer', 2), w('farmerB', 2)] }
      : stage === 1 ? { density: 'medium', adits: 0, things: [w('farmer', 2), w('farmerB', 2), at('ox', 1, 'field', [0x3a3a38])] }
      : stage === 2 ? { density: 'medium', adits: 0, things: [w('farmer', 2), w('farmerB', 1), at('ox', 2, 'field', [0x3a3a38, 0x5a5048]), at('rick', 1, 'yard')] }
      : { density: 'high', adits: 0, things: [w('farmer', 1), w('farmerB', 1), at('windpump', 1, 'home'), at('tractor', 1, 'field', MACHINE)] };
    case 'pasture': {
      const herd = HERDS[res ?? 'cattle'] ?? HERDS.cattle!;
      return stage === 0 ? { density: 'low', adits: 0, herd, things: [w('herder', 1), w('herderB', 1)] }
        : stage === 1 ? { density: 'low', adits: 0, fence: 'wattle', herd, things: [w('herder', 1)] }
        : stage === 2 ? { density: 'medium', adits: 0, fence: 'rails', herd, things: [w('herderB', 1), at('shelter', 1, 'home'), at('rick', 1, 'home')] }
        : { density: 'high', adits: 0, fence: 'wire', herd, things: [at('windpump', 1, 'home'), at('trough', 2, 'yard'), at('shelter', 1, 'home'), w('herder', 1)] };
    }
    case 'plantation': {
      const model = PLANTS[res ?? 'wine'] ?? 'vine';
      return stage === 0 ? { density: 'low', adits: 0, plants: { model, rows: false }, things: [w('picker', 1), w('pickerB', 1)] }
        : stage === 1 ? { density: 'low', adits: 0, plants: { model, rows: true }, things: [w('picker', 2), w('pickerB', 1)] }
        : stage === 2 ? { density: 'medium', adits: 0, plants: { model, rows: true }, things: [w('picker', 2), w('pickerB', 2), at('shelter', 1, 'home'), at('haycart', 1, 'home')] }
        : { density: 'high', adits: 0, plants: { model, rows: true }, things: [w('picker', 1), w('pickerB', 1), at('shelter', 1, 'home'), at('tractor', 1, 'field', MACHINE)] };
    }
    case 'camp': {
      if (res && HUNTED.has(res)) return stage === 0 ? { density: 'low', adits: 0, things: [at('tent', 3, 'home'), at('campfire', 1, 'home'), at('hideRack', 2, 'yard'), w('hunter', 3)] }
        : stage === 1 ? { density: 'medium', adits: 0, things: [at('lodge', 1, 'home'), at('campfire', 1, 'home'), at('tent', 1, 'home'), at('hideRack', 3, 'yard'), w('hunter', 3)] }
        : stage === 2 ? { density: 'medium', adits: 0, things: [at('lodge', 1, 'home'), at('hideRack', 3, 'yard'), at('haycart', 1, 'home'), w('gunHunter', 3)] }
        : { density: 'high', adits: 0, things: [at('lodge', 2, 'home'), at('haycart', 1, 'home'), at('hideRack', 2, 'yard'), w('gunHunter', 3)] };
      return stage === 0 ? { density: 'low', adits: 0, things: [at('tent', 2, 'home'), at('campfire', 1, 'home'), w('woodcutter', 3)] }
        : stage === 1 ? { density: 'medium', adits: 0, things: [at('lodge', 1, 'home'), w('woodcutter', 3)] }
        : stage === 2 ? { density: 'medium', adits: 0, things: [at('lodge', 1, 'home'), at('haycart', 1, 'field'), w('woodcutter', 3)] }
        : { density: 'high', adits: 0, things: [at('sawmill', 1, 'home'), at('haycart', 1, 'field'), w('woodcutter', 2)] };
    }
    case 'mine': return stage === 0 ? { density: 'low', adits: 1, things: [w('miner', 3, 'yard'), at('oreHeap', 1, 'yard', [0x8a7e6c])] }
      : stage === 1 ? { density: 'medium', adits: 1, things: [at('headframe', 1, 'home'), at('oreCart', 1, 'yard'), w('miner', 2, 'yard')] }
      : stage === 2 ? { density: 'medium', adits: 1, things: [at('headframe', 1, 'home'), at('smelter', 1, 'home'), at('oreCart', 1, 'yard'), w('miner', 2, 'yard')] }
      : { density: 'high', adits: 0, things: [at('steamHeadframe', 1, 'home'), at('smelter', 1, 'home'), at('oreCart', 2, 'yard'), w('miner', 1, 'yard')] };
    case 'quarry': return stage <= 1 ? { density: stage ? 'medium' : 'low', adits: 0, things: [w('miner', 2, 'yard')] }
      : stage === 2 ? { density: 'medium', adits: 0, things: [at('treadCrane', 1, 'yard'), w('miner', 2, 'yard')] }
      : { density: 'high', adits: 0, things: [at('steamCrane', 1, 'yard'), at('oreCart', 1, 'yard'), w('miner', 1, 'yard')] };
    case 'boats': case 'well': return { density: 'low', adits: 0, things: [] };
  }
}

// A pasture's fences (once it has them): round the farm, inside its safe
// zone, and across it into paddocks (two from enclosure on, three with
// wire), along the farm's axis. Lines of points, tile steps.
export function pastureFences(stage: number, axis: number): Pt[][] {
  if (stage === 0) return [];
  const inr = 1 / rhoOf(6, { x: 1, y: 0 }), r = (SAFE_RHO - 0.06) * inr / Math.cos(Math.PI / 6);
  const ring = Array.from({ length: 7 }, (_, j) => ({ x: r * Math.cos(Math.PI / 6 + (j * Math.PI) / 3), y: r * Math.sin(Math.PI / 6 + (j * Math.PI) / 3) }));
  const u = { x: Math.cos(axis), y: Math.sin(axis) }, v = { x: -u.y, y: u.x }, half = (SAFE_RHO - 0.06) * inr;
  const across = (o: number): Pt[] => [{ x: o * u.x - half * v.x * 0.98, y: o * u.y - half * v.y * 0.98 }, { x: o * u.x + half * v.x * 0.98, y: o * u.y + half * v.y * 0.98 }];
  const cuts = stage === 1 ? [] : stage === 2 ? [0.2] : [-0.21, 0.21]; // (clear of the homestead, near the middle)
  // (A cross line, clipped to where the ring encloses it.)
  return [ring, ...cuts.map((o) => clip(across(o)))];
}
const clip = (l: Pt[]): Pt[] => {
  const [a, b] = l as [Pt, Pt], lim = SAFE_RHO - 0.07;
  let t0 = 0, t1 = 1;
  while (t0 < 0.5 && rhoOf(6, { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }) > lim) t0 += 0.01;
  while (t1 > 0.5 && rhoOf(6, { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 }) > lim) t1 -= 0.01;
  return [{ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }, { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 }];
};
// How many animals a pasture grazes, by stage (more as it is managed better).
export const herdSize = (stage: number): number => [8, 10, 12, 14][Math.min(stage, 3)]!;

// The stage the ground's plots are painted at (terrainMaterial.ts): a
// pasture's meadows are large from the first fences (no plough strips).
export const plotStage = (imp: ImprovementKey | null, stage: number): number => (imp === 'pasture' ? [0, 3, 3, 4][Math.min(stage, 3)]! : stage);

// Boats on a fishing tile and the oil well's works (one tile, no farm):
// what stands there by stage (cityProps.ts rural()).
export function waterLook(imp: 'boats' | 'well', stage: number): readonly Placed[] {
  if (imp === 'well') return stage === 0 ? [at('derrick', 1, 'home')] : stage === 1 ? [at('derrick', 1, 'home'), at('pumpjack', 1, 'home', MACHINE)] : [at('pumpjack', 2, 'home', MACHINE), at('oilTank', 2, 'home')];
  return stage === 0 ? [at('canoe', 2, 'home', CLOTHES)] : stage === 1 ? [at('canoe', 1, 'home', CLOTHES), at('sailboat', 1, 'home')]
    : stage <= 3 ? [at('sailboat', 2, 'home')] : [at('trawler', 1, 'home'), at('sailboat', 1, 'home')];
}
