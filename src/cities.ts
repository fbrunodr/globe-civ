// City rules (design doc "Cities: Feel & Play", phase 1: the core model).
//
// A city is a patch of the globe. Every tile it owns is in one of four uses:
//   center  the founding tile
//   urban   built up; must join the center through other urban tiles
//   rural   an improvement the terrain decides (farm, mine, camp, ...)
//   wild    owned but untouched; yields nothing
// One citizen, one tile: a city's population is its center plus its urban
// and rural tiles plus its specialists (who live in urban tiles, up to 2
// each). Each new citizen is a growth placement the player (or the city's
// governor) makes. There are no workers.
//
// Pure rules only: the state lives in Game (typed arrays per tile), the look
// in render.ts.

import { BIOMES, FEATURES, RIVER_GOLD, terrainYield, type TileTerrain, type Yields } from './terrain.ts';

const y = (food: number, prod: number, gold: number): Yields => ({ food, prod, gold });
export const addYields = (a: Yields, b: Yields): Yields => y(a.food + b.food, a.prod + b.prod, a.gold + b.gold);
export const ZERO: Yields = y(0, 0, 0);

// ---------- tile uses ----------

export const USE = { wild: 0, rural: 1, urban: 2, center: 3 } as const;
export type TileUse = (typeof USE)[keyof typeof USE];

// ---------- rural improvements ----------

export interface ImprovementDef {
  readonly name: string;
  readonly bonus: Yields; // added to the terrain's yields
}

export const IMPROVEMENTS = {
  farm:    { name: 'Farm',           bonus: y(2, 0, 0) },
  mine:    { name: 'Mine',           bonus: y(0, 1, 0) },
  camp:    { name: 'Camp',           bonus: y(1, 0, 0) },
  quarry:  { name: 'Quarry',         bonus: y(0, 1, 0) },
  wetland: { name: 'Wetland harvest', bonus: y(1, 0, 0) },
  boats:   { name: 'Fishing boats',  bonus: y(1, 0, 0) },
} satisfies Record<string, ImprovementDef>;
export type ImprovementKey = keyof typeof IMPROVEMENTS;

// The improvement a tile gets when it is developed, or null where the tile
// stays wild (mountains, ice, deep ocean). A total function of the terrain:
// the player picks the tile, never the improvement.
export function improvementFor(t: TileTerrain): ImprovementKey | null {
  if (BIOMES[t.biome].water) {
    if (t.biome === 'shallowSea' || t.biome === 'lake') return 'boats';
    return null; // deep ocean, sea ice
  }
  if (t.feature) return FEATURE_IMPROVEMENT[t.feature];
  if (t.relief === 'mountains') return null;
  if (t.relief === 'hills') return t.biome === 'iceSheet' ? null : 'mine';
  return BIOME_IMPROVEMENT[t.biome];
}

// Features decide first (they replace the land's yields too).
const FEATURE_IMPROVEMENT: Record<keyof typeof FEATURES, ImprovementKey | null> = {
  marsh: 'wetland', swamp: 'wetland', mangrove: 'wetland', bog: 'wetland',
  floodplain: 'farm', oasis: 'farm',
  volcano: null, glacier: null,
  reef: 'boats', kelp: 'boats',
};

// Flat land. Water biomes are handled before this table is read.
const BIOME_IMPROVEMENT: Record<keyof typeof BIOMES, ImprovementKey | null> = {
  ocean: null, shallowSea: 'boats', lake: 'boats', seaIce: null,
  iceSheet: null,
  tundra: 'quarry', coldDesert: 'quarry', hotDesert: 'quarry',
  taiga: 'camp', temperateForest: 'camp', temperateRainforest: 'camp', monsoonForest: 'camp', jungle: 'camp',
  steppe: 'farm', prairie: 'farm', mediterranean: 'farm', savanna: 'farm',
};

// ---------- urban tiles ----------

// An urban tile may stand on land a city could be founded on, or on coast or
// lake water (a harbor).
export function urbanAllowed(t: TileTerrain): boolean {
  if (BIOMES[t.biome].water) return t.biome === 'shallowSea' || t.biome === 'lake';
  if (t.relief === 'mountains' || t.biome === 'iceSheet') return false;
  return t.feature !== 'volcano' && t.feature !== 'glacier';
}

export const MAX_SPECIALISTS = 2; // per urban tile

// Placeholder yields until buildings and quarters arrive (phase 3): an urban
// tile is workshops and trade, a specialist is a craftsman or merchant.
export const URBAN_YIELD = y(0, 2, 1);
export const SPECIALIST_YIELD = y(0, 1, 2);
// The center: its terrain plus a fixed base, with a floor so any site can grow.
export const CENTER_BONUS = y(2, 1, 1);
export const CENTER_MIN = y(3, 2, 1);
export const FOOD_PER_CITIZEN = 2;

const withRiver = (base: Yields, river: boolean): Yields => (river ? addYields(base, y(0, 0, RIVER_GOLD)) : base);

export function centerYield(t: TileTerrain, river: boolean): Yields {
  const b = addYields(terrainYield(t), CENTER_BONUS);
  return withRiver(y(Math.max(CENTER_MIN.food, b.food), Math.max(CENTER_MIN.prod, b.prod), Math.max(CENTER_MIN.gold, b.gold)), river);
}

export function ruralYield(t: TileTerrain, river: boolean): Yields {
  const k = improvementFor(t);
  const base = terrainYield(t);
  return withRiver(k ? addYields(base, IMPROVEMENTS[k].bonus) : base, river);
}

export const urbanYield = (river: boolean): Yields => withRiver(URBAN_YIELD, river);

// ---------- growth placements ----------

export type GrowthOption =
  | { readonly kind: 'rural'; readonly tile: number; readonly improvement: ImprovementKey }
  // Over a farm (or any rural tile) touching the core: its farmers move into
  // town and the newcomer becomes the new urban tile's first specialist.
  | { readonly kind: 'urban'; readonly tile: number; readonly over: ImprovementKey | null }
  | { readonly kind: 'specialist'; readonly tile: number };
export type GrowthKind = GrowthOption['kind'];

// ---------- governor ----------

export interface FocusDef {
  readonly name: string;
  readonly weights: Yields;
}

export const FOCUSES = {
  balanced:   { name: 'Balanced',   weights: y(2.5, 2, 1) },
  food:       { name: 'Food',       weights: y(4, 1.5, 0.5) },
  production: { name: 'Production', weights: y(1.5, 4, 0.5) },
  gold:       { name: 'Gold',       weights: y(1.5, 1.5, 4) },
} satisfies Record<string, FocusDef>;
export type FocusKey = keyof typeof FOCUSES;
export const isFocusKey = (s: string): s is FocusKey => s in FOCUSES;

// Townsfolk (urban tiles and specialists) the governor keeps: about a third
// of the citizens, so a size-10 city has 3 urban tiles (a placeholder until
// buildings give urban tiles their own reasons, phase 3).
export const townsfolkWanted = (pop: number): number => Math.floor(pop / 3);
const TOWN_PULL = 8;

// How much the governor likes an option, given its yields, the city's food
// surplus after it, the surplus it wants (enough to grow in about
// GROWTH_TURNS) and whether it is short of townsfolk. Every focus guards
// growth: a citizen who would leave the city short of food is worth much
// less, and food beyond what the city wants is worth little.
export const GROWTH_TURNS = 8;
export function governorScore(focus: FocusKey, kind: GrowthKind, gain: Yields, surplusAfter: number, wantSurplus: number, shortOfTown: boolean): number {
  const w = FOCUSES[focus].weights;
  const starving = surplusAfter < 1 ? 3 * (1 - surplusAfter) : 0;
  const town = shortOfTown && kind !== 'rural' ? TOWN_PULL : 0;
  const food = surplusAfter - gain.food >= wantSurplus ? 0.3 * w.food : w.food;
  return gain.food * food + gain.prod * w.prod + gain.gold * w.gold - starving + town;
}
