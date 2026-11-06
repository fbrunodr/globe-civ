// What a worked tile shows at each stage of its improvement (its owner's
// techs that improve it: techs.ts improvementStage), so the land is seen
// worked better as the civ learns: a first farm's patches hoed by hand,
// the ox plough, haycarts and ricks, windpumps and silos, tractors and
// combines; open herding, then wattle, rail and wire fences; hunters with
// bows in hide tents, then a lodge, then muskets, then a steam sawmill; an
// adit, a timber headframe, a smelter, a steam headframe; canoes, sailing
// boats, a trawler; a derrick, pumpjacks, tanks. Pure data (rural/layout.ts
// places it on the farm's layout, farmPainter.ts).
//
// Stage 0 is an improvement held by a civ that couldn't have made it (a
// worker needs its first tech: taken with a city): one look for all of
// them, gone to ruin: a shack, a broken cart, the fields gone to weed, a
// few beasts loose, no one working.
//
// A resource's tile is worked its own way (resources.ts
// RESOURCE_IMPROVEMENT): a pasture holds that resource's animals, a
// plantation that resource's plants, a hunting camp its hunters.

import type { ImprovementKey } from '../cities.ts';
import type { ResourceKey } from '../resources.ts';
import type { RuralDensity } from '../farmPainter.ts';
import type { KitModel } from './kit.ts';
import type { Pt } from '../town/geometry.ts';

// Where a thing stands on the farm: by the homestead, in its yards, out in
// its fields (anywhere it works, off the yards and the homestead).
export type Where = 'home' | 'yard' | 'field';
export interface Placed { readonly model: KitModel; readonly n: number; readonly where: Where; readonly colors?: readonly number[] }
export interface StageLook {
  readonly density: RuralDensity;          // how many yards, a barn
  readonly fence?: 'wattle' | 'rails' | 'wire'; // a pasture's (pastureFences)
  readonly herd?: { readonly models: readonly KitModel[]; readonly colors: readonly number[] }; // a pasture's animals (herdSize of them)
  readonly plants?: PlantTufts & { readonly rows: boolean }; // a plantation's (tufts, in rows from its second stage)
  readonly worn?: true;                     // stage 0 (no house, its fields weedy and thin)
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
// A plantation's plants by its resource: tufts (rural/models.ts plant)
// standing straighter than a crop's, its colours, how tall (tile steps).
export interface PlantTufts { readonly colors: readonly number[]; readonly height: number }
const PLANTS: Partial<Record<ResourceKey, PlantTufts>> = {
  wine: { colors: [0x5a7a34, 0x4e6e2e, 0x5a6a3a], height: 0.017 },
  tea: { colors: [0x3f6a2a, 0x4a7a32], height: 0.012 },
  cotton: { colors: [0xb4b89c, 0x9aa680, 0xc8c8b4], height: 0.015 },
  bananas: { colors: [0x6fa83a, 0x5e9a32, 0x78b040], height: 0.032 },
  silk: { colors: [0x557a3a, 0x4e7034], height: 0.026 },
  spices: { colors: [0x3a6a2a, 0x5a6a2a, 0x6a5a2a], height: 0.02 },
  incense: { colors: [0x7a8a5a, 0x6f8250], height: 0.026 },
  dyes: { colors: [0x3a5a4a, 0x4a4a7a], height: 0.015 },
};
const PLANTS_DEFAULT = PLANTS.wine!;
// The ruin's things.
const WORN: readonly Placed[] = [at('shack', 1, 'home'), at('brokenCart', 1, 'yard')];
const HUNTED: ReadonlySet<ResourceKey> = new Set<ResourceKey>(['deer', 'furs', 'ivory', 'amber']);

export function stageLook(imp: ImprovementKey, stage: number, res: ResourceKey | null): StageLook {
  const w = (model: KitModel, n: number, where: Where = 'field') => at(model, n, where, CLOTHES);
  if (stage === 0 && imp !== 'boats' && imp !== 'well') {
    const base = { density: 'low', adits: imp === 'mine' ? 1 : 0, worn: true, things: WORN } as const;
    return imp === 'pasture' ? { ...base, herd: HERDS[res ?? 'cattle'] ?? HERDS.cattle! }
      : imp === 'plantation' ? { ...base, plants: { ...(PLANTS[res ?? 'wine'] ?? PLANTS_DEFAULT), rows: false } } : base;
  }
  switch (imp) {
    case 'farm': switch (Math.min(stage, 4)) {
      case 0: return { density: 'low', adits: 0, things: [w('farmer', 2), w('farmerB', 1), at('stooks', 2, 'yard')] };
      case 1: return { density: 'low', adits: 0, things: [w('farmer', 2), w('farmerB', 1), at('stooks', 3, 'yard')] };
      case 2: return { density: 'medium', adits: 0, things: [at('ploughTeam', 1, 'field', [0x8a6a4a, 0x6a4a32]), at('haycart', 1, 'home'), w('reaper', 1), at('rick', 1, 'yard'), at('stooks', 2, 'yard')] };
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
      const tufts = PLANTS[res ?? 'wine'] ?? PLANTS_DEFAULT;
      return stage === 1 ? { density: 'low', adits: 0, plants: { ...tufts, rows: false }, things: [w('picker', 2), w('pickerB', 1)] }
        : stage === 2 ? { density: 'medium', adits: 0, plants: { ...tufts, rows: true }, things: [w('picker', 2), w('pickerB', 2), at('shelter', 1, 'home'), at('haycart', 1, 'home')] }
        : { density: 'high', adits: 0, plants: { ...tufts, rows: true }, things: [w('picker', 1), w('pickerB', 1), at('shelter', 1, 'home'), at('tractor', 1, 'field', MACHINE)] };
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
    case 'mine': return stage === 1 ? { density: 'low', adits: 1, things: [w('miner', 3, 'yard'), at('oreHeap', 1, 'yard', [0x8a7e6c])] }
      : stage === 2 ? { density: 'medium', adits: 1, things: [at('headframe', 1, 'home'), at('smelter', 1, 'home'), at('oreCart', 1, 'yard'), w('miner', 2, 'yard')] }
      : { density: 'high', adits: 0, things: [at('steamHeadframe', 1, 'home'), at('smelter', 1, 'home'), at('oreCart', 2, 'yard'), w('miner', 1, 'yard')] };
    case 'quarry': return stage <= 1 ? { density: stage ? 'medium' : 'low', adits: 0, things: [w('miner', 2, 'yard')] }
      : stage === 2 ? { density: 'medium', adits: 0, things: [at('treadCrane', 1, 'yard'), w('miner', 2, 'yard')] }
      : { density: 'high', adits: 0, things: [at('steamCrane', 1, 'yard'), at('oreCart', 1, 'yard'), w('miner', 1, 'yard')] };
    case 'boats': case 'well': return { density: 'low', adits: 0, things: [] };
  }
}

// A pasture's fences (once it has them): round it (`ring`: its six
// corners, closed, inside its hex and its painted land: rural/layout.ts).
// Lines of points, tile steps.
export function pastureFences(stage: number, ring: readonly Pt[]): Pt[][] {
  return stage === 0 ? [] : [[...ring]];
}
// How many animals a pasture grazes, by stage (more as it is managed better).
export const herdSize = (stage: number): number => [4, 10, 12, 14][Math.min(stage, 3)]!;

// The stage the ground's plots are painted at (terrainMaterial.ts): a
// pasture's meadows are large from the first fences (no plough strips).
export const plotStage = (imp: ImprovementKey | null, stage: number): number => (imp === 'pasture' ? [0, 3, 3, 4][Math.min(stage, 3)]! : stage);

// Boats on a fishing tile and the oil well's works (one tile, no farm):
// what stands there by stage (cityProps.ts rural()).
export function waterLook(imp: 'boats' | 'well', stage: number, offshore = false): readonly Placed[] {
  // (Offshore: a platform; two once the field is fully worked.)
  if (imp === 'well' && offshore) return stage <= 2 ? [at('oilRig', 1, 'home')] : [at('oilRig', 2, 'home')];
  if (imp === 'well') return stage === 0 ? [at('derrick', 1, 'home')] : stage === 1 ? [at('derrick', 1, 'home'), at('pumpjack', 1, 'home', MACHINE)] : [at('pumpjack', 2, 'home', MACHINE), at('oilTank', 2, 'home')];
  return stage === 0 ? [at('canoe', 2, 'home', CLOTHES)] : stage === 1 ? [at('canoe', 1, 'home', CLOTHES), at('sailboat', 1, 'home')]
    : stage <= 3 ? [at('sailboat', 2, 'home')] : [at('trawler', 1, 'home'), at('sailboat', 1, 'home')];
}
