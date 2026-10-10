// City rules (design doc "Cities: Feel & Play").
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
// Buildings sit in slots: two per urban tile and two on the center. Two
// buildings of one family on a tile make a quarter (Campus, Market, ...),
// which adds its yield, and each family building gains from what surrounds
// its tile (adjacency). Civic buildings fit any land slot and never form a
// quarter; walls stand around the center and take no slot.
//
// Pure rules only: the state lives in Game (typed arrays per tile), the look
// in render.ts.

import { BIOMES, FEATURES, RIVER_GOLD, terrainYield, type TileTerrain, type Yields } from './terrain.ts';

// ---------- city output: the terrain's yields plus science, culture, faith ----------

export const OUTPUT_KEYS = ['food', 'prod', 'gold', 'science', 'culture', 'faith'] as const;
export type OutputKey = (typeof OUTPUT_KEYS)[number];
export type Output = Readonly<Record<OutputKey, number>>;
export const out = (o: Partial<Output> = {}): Output =>
  ({ food: 0, prod: 0, gold: 0, science: 0, culture: 0, faith: 0, ...o });
export const ZERO: Output = out();
export const addOut = (a: Output, b: Output): Output =>
  ({ food: a.food + b.food, prod: a.prod + b.prod, gold: a.gold + b.gold, science: a.science + b.science, culture: a.culture + b.culture, faith: a.faith + b.faith });
export const scaleOut = (a: Output, k: number): Output =>
  ({ food: a.food * k, prod: a.prod * k, gold: a.gold * k, science: a.science * k, culture: a.culture * k, faith: a.faith * k });
export const fromYields = (y: Yields): Output => out({ food: y.food, prod: y.prod, gold: y.gold });

// ---------- tile uses ----------

export const USE = { wild: 0, rural: 1, urban: 2, center: 3 } as const;
export type TileUse = (typeof USE)[keyof typeof USE];

// ---------- rural improvements ----------

export interface ImprovementDef {
  readonly name: string;
  readonly bonus: Output; // added to the terrain's yields
}

export const IMPROVEMENTS = {
  farm:    { name: 'Farm',            bonus: out({ food: 2 }) },
  mine:    { name: 'Mine',            bonus: out({ prod: 1 }) },
  camp:    { name: 'Camp',            bonus: out({ food: 1 }) },
  quarry:  { name: 'Quarry',          bonus: out({ prod: 1 }) },
  wetland: { name: 'Wetland harvest', bonus: out({ food: 1 }) },
  boats:   { name: 'Fishing boats',   bonus: out({ food: 1 }) },
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
export const SLOTS = 2;           // building slots per urban tile (and on the center)

// An urban tile's own yield (workshops and trade), a specialist's outside a
// quarter (a craftsman or merchant), and the center's.
export const URBAN_YIELD = out({ prod: 2, gold: 1 });
export const SPECIALIST_YIELD = out({ prod: 1, gold: 2 });
export const CENTER_BONUS = out({ food: 2, prod: 1, gold: 1, science: 1, culture: 1 });
export const CENTER_MIN = out({ food: 3, prod: 2, gold: 1 });
export const FOOD_PER_CITIZEN = 2;

const withRiver = (base: Output, river: boolean): Output => (river ? addOut(base, out({ gold: RIVER_GOLD })) : base);

export function centerYield(t: TileTerrain, river: boolean): Output {
  const b = addOut(fromYields(terrainYield(t)), CENTER_BONUS);
  return withRiver({ ...b, food: Math.max(CENTER_MIN.food, b.food), prod: Math.max(CENTER_MIN.prod, b.prod), gold: Math.max(CENTER_MIN.gold, b.gold) }, river);
}

export function ruralYield(t: TileTerrain, river: boolean): Output {
  const k = improvementFor(t);
  const base = fromYields(terrainYield(t));
  return withRiver(k ? addOut(base, IMPROVEMENTS[k].bonus) : base, river);
}

export const urbanYield = (river: boolean): Output => withRiver(URBAN_YIELD, river);

// ---------- building families (quarters) ----------

export type FamilyKey = 'campus' | 'market' | 'forge' | 'harbor' | 'temple' | 'theater' | 'garrison';

// What a neighboring tile can give a family building's tile: terrain, a
// rural improvement, the center (with or without walls), or another quarter.
export type AdjacencySource = 'mountain' | 'river' | 'forest' | 'mine' | 'quarry' | 'boats' | 'center' | 'walls' | 'wonder' | FamilyKey;

export interface FamilyDef {
  readonly name: string;
  readonly unit: Output;          // one point of the family's yield (adjacency, quarter bonus)
  readonly adjacency: readonly AdjacencySource[];
  readonly water: boolean;        // its buildings stand on water urban tiles (harbors)
}

export const FAMILIES: Record<FamilyKey, FamilyDef> = {
  campus:   { name: 'Campus',   unit: out({ science: 1 }), adjacency: ['mountain', 'campus'], water: false },
  market:   { name: 'Market',   unit: out({ gold: 1 }), adjacency: ['river', 'harbor', 'market'], water: false },
  forge:    { name: 'Forge',    unit: out({ prod: 1 }), adjacency: ['mine', 'quarry', 'forge'], water: false },
  harbor:   { name: 'Harbor',   unit: out({ food: 1, gold: 1 }), adjacency: ['boats', 'market'], water: true },
  temple:   { name: 'Temple',   unit: out({ faith: 1 }), adjacency: ['mountain', 'forest'], water: false },
  theater:  { name: 'Theater',  unit: out({ culture: 1 }), adjacency: ['wonder', 'theater'], water: false },
  garrison: { name: 'Garrison', unit: out({ prod: 1 }), adjacency: ['center', 'walls'], water: false },
};
export const FAMILY_KEYS = Object.keys(FAMILIES) as FamilyKey[];

export const QUARTER_BONUS = 2;    // units of the family's yield for a full quarter
export const ADJACENCY_CAP = 4;    // most adjacency points a tile's family gets
export const QUARTER_SPECIALIST = 2; // units per specialist living in a quarter

// ---------- buildings ----------

export type BuildingRole = FamilyKey | 'civic' | 'walls';

export interface BuildingDef {
  readonly name: string;
  readonly cost: number;
  readonly role: BuildingRole;
  readonly yields: Output;
  readonly desc: string;
  readonly river?: true; // its tile must be beside a river
}

export const BUILDINGS = {
  library:       { name: 'Library',        cost: 45, role: 'campus', yields: out({ science: 2 }), desc: 'Campus. +2 science; +1 per neighboring mountain or Campus.' },
  academy:       { name: 'Academy',        cost: 70, role: 'campus', yields: out({ science: 3 }), desc: 'Campus. +3 science. With a Library: a Campus quarter (+2).' },
  market:        { name: 'Market',         cost: 45, role: 'market', yields: out({ gold: 2 }), desc: 'Market. +2 gold; +1 beside a river, Harbor or Market.' },
  countingHouse: { name: 'Counting house', cost: 70, role: 'market', yields: out({ gold: 3 }), desc: 'Market. +3 gold. With a Market: a Market quarter (+2).' },
  workshop:      { name: 'Workshop',       cost: 45, role: 'forge', yields: out({ prod: 2 }), desc: 'Forge. +2 production; +1 per neighboring mine, quarry or Forge.' },
  smithy:        { name: 'Smithy',         cost: 70, role: 'forge', yields: out({ prod: 3 }), desc: 'Forge. +3 production. With a Workshop: a Forge quarter (+2).' },
  lighthouse:    { name: 'Lighthouse',     cost: 45, role: 'harbor', yields: out({ food: 1, gold: 1 }), desc: 'Harbor (on water). +1 food, +1 gold; more beside fishing boats or a Market.' },
  shipyard:      { name: 'Shipyard',       cost: 70, role: 'harbor', yields: out({ food: 1, prod: 1, gold: 1 }), desc: 'Harbor (on water). With a Lighthouse: a Harbor quarter.' },
  shrine:        { name: 'Shrine',         cost: 35, role: 'temple', yields: out({ faith: 2 }), desc: 'Temple. +2 faith; +1 per neighboring mountain or forest.' },
  temple:        { name: 'Temple',         cost: 60, role: 'temple', yields: out({ faith: 3 }), desc: 'Temple. +3 faith. With a Shrine: a Temple quarter (+2).' },
  amphitheater:  { name: 'Amphitheater',   cost: 50, role: 'theater', yields: out({ culture: 2 }), desc: 'Theater. +2 culture; +1 per neighboring wonder or Theater.' },
  odeon:         { name: 'Odeon',          cost: 70, role: 'theater', yields: out({ culture: 3 }), desc: 'Theater. +3 culture. With an Amphitheater: a Theater quarter (+2).' },
  barracks:      { name: 'Barracks',       cost: 40, role: 'garrison', yields: ZERO, desc: 'Garrison. +25% defense for units in the city.' },
  stable:        { name: 'Stable',         cost: 55, role: 'garrison', yields: ZERO, desc: 'Garrison. +25% defense. With Barracks: a Garrison quarter.' },
  granary:       { name: 'Granary',        cost: 40, role: 'civic', yields: out({ food: 1 }), desc: 'Civic. +1 food; keeps half the food when the city grows.' },
  monument:      { name: 'Monument',       cost: 30, role: 'civic', yields: out({ culture: 2 }), desc: 'Civic. +2 culture.' },
  waterMill:     { name: 'Water mill',     cost: 50, role: 'civic', yields: out({ food: 1, prod: 1 }), river: true, desc: 'Civic, beside a river. +1 food, +1 production.' },
  aqueduct:      { name: 'Aqueduct',       cost: 70, role: 'civic', yields: out({ food: 2 }), desc: 'Civic. +2 food.' },
  walls:         { name: 'Walls',          cost: 30, role: 'walls', yields: ZERO, desc: '+100% defense for units in the city. Stand around the center; no slot.' },
} satisfies Record<string, BuildingDef>;
export type BuildingKey = keyof typeof BUILDINGS;
export const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];
export const buildingDef = (k: BuildingKey): BuildingDef => BUILDINGS[k];
export const familyOf = (k: BuildingKey): FamilyKey | null => {
  const r = BUILDINGS[k].role;
  return r === 'civic' || r === 'walls' ? null : r;
};
// Buildings stored in a tile slot: 0 = empty, else index + 1 in BUILDING_KEYS.
export const slotCode = (k: BuildingKey): number => BUILDING_KEYS.indexOf(k) + 1;
export const slotKey = (code: number): BuildingKey | null => (code > 0 ? BUILDING_KEYS[code - 1] ?? null : null);

// Whether building k may stand on a tile of this kind (water: a harbor tile).
export function buildingFits(k: BuildingKey, water: boolean, river: boolean): boolean {
  const d: BuildingDef = BUILDINGS[k];
  if (d.role === 'walls') return false;
  if (d.river && !river) return false;
  const harbor = d.role !== 'civic' && FAMILIES[d.role].water;
  return harbor === water;
}

// What a tile's buildings yield: each building's own yield, a quarter's
// bonus, and each family's adjacency (`adjacency[f]`: points from what
// surrounds the tile).
export function slotsYield(keys: readonly (BuildingKey | null)[], adjacency: (f: FamilyKey) => number): Output {
  let sum = ZERO;
  const families = new Map<FamilyKey, number>();
  for (const k of keys) {
    if (!k) continue;
    sum = addOut(sum, BUILDINGS[k].yields);
    const f = familyOf(k);
    if (f) families.set(f, (families.get(f) ?? 0) + 1);
  }
  for (const [f, n] of families) {
    const pts = Math.min(ADJACENCY_CAP, adjacency(f)) + (n >= SLOTS ? QUARTER_BONUS : 0);
    sum = addOut(sum, scaleOut(FAMILIES[f].unit, pts));
  }
  return sum;
}

// The quarter a tile's two slots form, if both hold the same family.
export function quarterOf(keys: readonly (BuildingKey | null)[]): FamilyKey | null {
  const fs = keys.map((k) => (k ? familyOf(k) : null));
  return fs.length >= SLOTS && fs[0] && fs.every((f) => f === fs[0]) ? fs[0] : null;
}

// What a specialist living in a tile yields: its quarter's kind, else generic.
export const specialistYield = (quarter: FamilyKey | null): Output =>
  quarter ? scaleOut(FAMILIES[quarter].unit, QUARTER_SPECIALIST) : SPECIALIST_YIELD;

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
  readonly weights: Output;
}

export const FOCUSES = {
  balanced:   { name: 'Balanced',   weights: out({ food: 2.5, prod: 2, gold: 1, science: 1.5, culture: 1.2, faith: 1 }) },
  food:       { name: 'Food',       weights: out({ food: 4, prod: 1.5, gold: 0.5, science: 0.8, culture: 0.6, faith: 0.5 }) },
  production: { name: 'Production', weights: out({ food: 1.5, prod: 4, gold: 0.5, science: 0.8, culture: 0.6, faith: 0.5 }) },
  gold:       { name: 'Gold',       weights: out({ food: 1.5, prod: 1.5, gold: 4, science: 0.8, culture: 0.6, faith: 0.5 }) },
  science:    { name: 'Science',    weights: out({ food: 1.5, prod: 1.5, gold: 0.8, science: 4, culture: 0.6, faith: 0.5 }) },
  culture:    { name: 'Culture',    weights: out({ food: 1.5, prod: 1.5, gold: 0.8, science: 0.8, culture: 4, faith: 0.8 }) },
  faith:      { name: 'Faith',      weights: out({ food: 1.5, prod: 1.5, gold: 0.8, science: 0.6, culture: 0.8, faith: 4 }) },
} satisfies Record<string, FocusDef>;
export type FocusKey = keyof typeof FOCUSES;
export const isFocusKey = (s: string): s is FocusKey => s in FOCUSES;

export const weigh = (focus: FocusKey, o: Output): number => {
  const w = FOCUSES[focus].weights;
  return OUTPUT_KEYS.reduce((s, k) => s + o[k] * w[k], 0);
};

// Townsfolk (urban tiles and specialists) the governor keeps: about a third
// of the citizens, so a size-10 city has 3 urban tiles.
export const townsfolkWanted = (pop: number): number => Math.floor(pop / 3);
const TOWN_PULL = 8;

// How much the governor likes an option, given its yields, the city's food
// surplus after it, the surplus it wants (enough to grow in about
// GROWTH_TURNS) and whether it is short of townsfolk. Every focus guards
// growth: a citizen who would leave the city short of food is worth much
// less, and food beyond what the city wants is worth little.
export const GROWTH_TURNS = 8;
export function governorScore(focus: FocusKey, kind: GrowthKind, gain: Output, surplusAfter: number, wantSurplus: number, shortOfTown: boolean): number {
  const w = FOCUSES[focus].weights;
  const starving = surplusAfter < 1 ? 3 * (1 - surplusAfter) : 0;
  const town = shortOfTown && kind !== 'rural' ? TOWN_PULL : 0;
  const foodW = surplusAfter - gain.food >= wantSurplus ? 0.3 * w.food : w.food;
  return weigh(focus, gain) - gain.food * w.food + gain.food * foodW - starving + town;
}
