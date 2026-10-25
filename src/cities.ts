// City rules (design doc "Cities: Feel & Play"), Civ V style: a city is
// its center tile, which holds all of its buildings and wonders (painted
// there: cityPainter.ts), and the land around it. Every tile it owns is in
// one of three uses:
//   center  the city
//   rural   an improvement the terrain decides (farm, mine, camp, ...)
//   wild    owned but untouched; yields nothing
// One citizen, one tile: a city's population is its center plus its rural
// tiles plus its specialists. Each new citizen is a growth placement the
// player (or the city's governor) makes: a rural tile, or a specialist in
// one of the city's buildings (each building has room for one, of its
// family). There are no workers.
//
// A city's buildings form a list (one of each). Two buildings of one family
// make a quarter (Campus, Market, ...), which adds its yield. Some need the
// city by a river (the Water mill) or on the coast (Harbor buildings).
// Each wonder is built once in the world, in a city whose center meets its
// site's need; Machu Picchu stands on a mountain next to the city instead.
//
// A city starts with the tiles around its center and buys the ring beyond
// with gold (game.ts buyTile); it never reaches farther.
//
// Pure rules only: the state lives in Game, the look in render.ts.

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

export const USE = { wild: 0, rural: 1, center: 2 } as const;
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

export const QUARTER = 2;         // buildings of one family that make a quarter

// ---------- territory ----------

export const CITY_REACH = 2;      // the farthest a city's tiles are from its center
export const START_REACH = 1;     // what a new city owns
// What buying a tile costs: more for each the city has bought already.
export const tileCost = (bought: number): number => 25 + 15 * bought;

// A specialist's yield in a civic building (a craftsman or merchant), and the center's.
export const SPECIALIST_YIELD = out({ prod: 2, gold: 2 });
export const CENTER_BONUS = out({ food: 2, prod: 1, gold: 1, science: 1, culture: 1 });
export const CENTER_MIN = out({ food: 3, prod: 2, gold: 1 });
export const FOOD_PER_CITIZEN = 2;

const withRiver = (base: Output, river: boolean): Output => (river ? addOut(base, out({ gold: RIVER_GOLD })) : base);

export function centerYield(t: TileTerrain, river: boolean): Output {
  const b = addOut(fromYields(terrainYield(t)), CENTER_BONUS);
  return withRiver({ ...b, food: Math.max(CENTER_MIN.food, b.food), prod: Math.max(CENTER_MIN.prod, b.prod), gold: Math.max(CENTER_MIN.gold, b.gold) }, river);
}

export function ruralYield(t: TileTerrain, river: boolean, era: EraIndex = 0): Output {
  const k = improvementFor(t);
  const base = fromYields(terrainYield(t));
  return withRiver(k ? addOut(addOut(base, IMPROVEMENTS[k].bonus), eraBonus(k, era)) : base, river);
}

// ---------- building families (quarters) ----------

export type FamilyKey = 'campus' | 'market' | 'forge' | 'harbor' | 'temple' | 'theater' | 'garrison';

export interface FamilyDef {
  readonly name: string;
  readonly unit: Output;          // one point of the family's yield (quarter bonus, specialists)
  readonly coast: boolean;        // its buildings need the city on the coast (harbors)
}

export const FAMILIES: Record<FamilyKey, FamilyDef> = {
  campus:   { name: 'Campus',   unit: out({ science: 1 }), coast: false },
  market:   { name: 'Market',   unit: out({ gold: 1 }), coast: false },
  forge:    { name: 'Forge',    unit: out({ prod: 1 }), coast: false },
  harbor:   { name: 'Harbor',   unit: out({ food: 1, gold: 1 }), coast: true },
  temple:   { name: 'Temple',   unit: out({ faith: 1 }), coast: false },
  theater:  { name: 'Theater',  unit: out({ culture: 1 }), coast: false },
  garrison: { name: 'Garrison', unit: out({ prod: 1 }), coast: false },
};
export const FAMILY_KEYS = Object.keys(FAMILIES) as FamilyKey[];

export const QUARTER_BONUS = 2;      // units of the family's yield for a quarter
export const FAMILY_SPECIALIST = 3;  // units per specialist in one of the family's buildings

// ---------- buildings ----------

export type BuildingRole = FamilyKey | 'civic' | 'walls';

export interface BuildingDef {
  readonly name: string;
  readonly cost: number;
  readonly role: BuildingRole;
  readonly yields: Output;
  readonly desc: string;
  readonly river?: true; // the city must be by a river
}

export const BUILDINGS = {
  library:       { name: 'Library',        cost: 45, role: 'campus', yields: out({ science: 2 }), desc: 'Campus. +2 science.' },
  academy:       { name: 'Academy',        cost: 70, role: 'campus', yields: out({ science: 3 }), desc: 'Campus. +3 science. With a Library: a Campus quarter (+2).' },
  market:        { name: 'Market',         cost: 45, role: 'market', yields: out({ gold: 2 }), desc: 'Market. +2 gold.' },
  countingHouse: { name: 'Counting house', cost: 70, role: 'market', yields: out({ gold: 3 }), desc: 'Market. +3 gold. With a Market: a Market quarter (+2).' },
  workshop:      { name: 'Workshop',       cost: 45, role: 'forge', yields: out({ prod: 2 }), desc: 'Forge. +2 production.' },
  smithy:        { name: 'Smithy',         cost: 70, role: 'forge', yields: out({ prod: 3 }), desc: 'Forge. +3 production. With a Workshop: a Forge quarter (+2).' },
  lighthouse:    { name: 'Lighthouse',     cost: 45, role: 'harbor', yields: out({ food: 1, gold: 1 }), desc: 'Harbor (coastal city). +1 food, +1 gold.' },
  shipyard:      { name: 'Shipyard',       cost: 70, role: 'harbor', yields: out({ food: 1, prod: 1, gold: 1 }), desc: 'Harbor (coastal city). With a Lighthouse: a Harbor quarter.' },
  shrine:        { name: 'Shrine',         cost: 35, role: 'temple', yields: out({ faith: 2 }), desc: 'Temple. +2 faith.' },
  temple:        { name: 'Temple',         cost: 60, role: 'temple', yields: out({ faith: 3 }), desc: 'Temple. +3 faith. With a Shrine: a Temple quarter (+2).' },
  amphitheater:  { name: 'Amphitheater',   cost: 50, role: 'theater', yields: out({ culture: 2 }), desc: 'Theater. +2 culture.' },
  odeon:         { name: 'Odeon',          cost: 70, role: 'theater', yields: out({ culture: 3 }), desc: 'Theater. +3 culture. With an Amphitheater: a Theater quarter (+2).' },
  barracks:      { name: 'Barracks',       cost: 40, role: 'garrison', yields: ZERO, desc: 'Garrison. +25% defense for units in the city.' },
  stable:        { name: 'Stable',         cost: 55, role: 'garrison', yields: ZERO, desc: 'Garrison. +25% defense. With Barracks: a Garrison quarter.' },
  granary:       { name: 'Granary',        cost: 40, role: 'civic', yields: out({ food: 1 }), desc: 'Civic. +1 food; keeps half the food when the city grows.' },
  monument:      { name: 'Monument',       cost: 30, role: 'civic', yields: out({ culture: 2 }), desc: 'Civic. +2 culture.' },
  waterMill:     { name: 'Water mill',     cost: 50, role: 'civic', yields: out({ food: 1, prod: 1 }), river: true, desc: 'Civic, in a city by a river. +1 food, +1 production.' },
  aqueduct:      { name: 'Aqueduct',       cost: 70, role: 'civic', yields: out({ food: 2 }), desc: 'Civic. +2 food.' },
  walls:         { name: 'Walls',          cost: 30, role: 'walls', yields: ZERO, desc: '+100% defense for units in the city.' },
} satisfies Record<string, BuildingDef>;
export type BuildingKey = keyof typeof BUILDINGS;
export const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];
export const buildingDef = (k: BuildingKey): BuildingDef => BUILDINGS[k];
export const familyOf = (k: BuildingKey): FamilyKey | null => {
  const r = BUILDINGS[k].role;
  return r === 'civic' || r === 'walls' ? null : r;
};
// Whether building k may stand in a city (by a river, on the coast).
export function buildingAllowed(k: BuildingKey, river: boolean, coast: boolean): boolean {
  const d: BuildingDef = BUILDINGS[k];
  if (d.river && !river) return false;
  return d.role === 'civic' || d.role === 'walls' || !FAMILIES[d.role].coast || coast;
}

// What a city's buildings yield: each building's own yield and each
// quarter's bonus.
export function buildingsYield(keys: Iterable<BuildingKey>): Output {
  let sum = ZERO;
  const families = new Map<FamilyKey, number>();
  for (const k of keys) {
    sum = addOut(sum, BUILDINGS[k].yields);
    const f = familyOf(k);
    if (f) families.set(f, (families.get(f) ?? 0) + 1);
  }
  for (const [f, n] of families) if (n >= QUARTER) sum = addOut(sum, scaleOut(FAMILIES[f].unit, QUARTER_BONUS));
  return sum;
}

// The quarters a city's buildings form: families with QUARTER of them.
export function quartersOf(keys: Iterable<BuildingKey>): FamilyKey[] {
  const n = new Map<FamilyKey, number>();
  for (const k of keys) { const f = familyOf(k); if (f) n.set(f, (n.get(f) ?? 0) + 1); }
  return [...n].filter(([, c]) => c >= QUARTER).map(([f]) => f);
}

// ---------- specialists ----------

// A specialist works in one of the city's buildings: one per building, of
// its family ('civic': a civic building's craftsman or merchant).
export type SpecialistKind = FamilyKey | 'civic';
export const SPECIALIST_KINDS: readonly SpecialistKind[] = ['campus', 'market', 'forge', 'harbor', 'temple', 'theater', 'garrison', 'civic'];
export const specialistKindOf = (k: BuildingKey): SpecialistKind | null => (BUILDINGS[k].role === 'walls' ? null : familyOf(k) ?? 'civic');
export const specialistYield = (k: SpecialistKind): Output => (k === 'civic' ? SPECIALIST_YIELD : scaleOut(FAMILIES[k].unit, FAMILY_SPECIALIST));

// ---------- wonders ----------

// What a wonder needs of its city's center (game.ts siteOk). mountainTop:
// the wonder stands on a mountain next to the city (the tile stays wild: no
// citizen lives there).
export type WonderSite = 'desertOrFloodplain' | 'coast' | 'river' | 'mountainTop' | 'hills' | 'flat' | 'any';

export interface WonderDef {
  readonly name: string;
  readonly cost: number;
  readonly site: WonderSite;
  readonly yields: Output; // to its city
  readonly desc: string;
}

// Each is built once in the world, in its city (Machu Picchu: on a
// mountain top next to it, the tile staying wild).
export const WONDERS = {
  pyramids:        { name: 'Pyramids',         cost: 180, site: 'desertOrFloodplain', yields: out({ prod: 4, culture: 2 }), desc: 'On or by desert or floodplain. +4 production, +2 culture.' },
  greatLighthouse: { name: 'Great Lighthouse', cost: 160, site: 'coast', yields: out({ food: 2, gold: 3, culture: 1 }), desc: 'A coastal city. +2 food, +3 gold, +1 culture.' },
  hangingGardens:  { name: 'Hanging Gardens',  cost: 180, site: 'river', yields: out({ food: 4, culture: 2 }), desc: 'A city by a river. +4 food, +2 culture.' },
  machuPicchu:     { name: 'Machu Picchu',     cost: 200, site: 'mountainTop', yields: out({ gold: 4, faith: 2, culture: 2 }), desc: 'On top of a mountain next to the city. +4 gold, +2 faith, +2 culture.' },
  greatLibrary:    { name: 'Great Library',    cost: 200, site: 'any', yields: out({ science: 5, culture: 2 }), desc: '+5 science, +2 culture.' },
  stonehenge:      { name: 'Stonehenge',       cost: 140, site: 'flat', yields: out({ faith: 4, culture: 1 }), desc: 'A city on flat open land. +4 faith, +1 culture.' },
  colosseum:       { name: 'Colosseum',        cost: 180, site: 'any', yields: out({ culture: 5, gold: 1 }), desc: '+5 culture, +1 gold.' },
} satisfies Record<string, WonderDef>;
export type WonderKey = keyof typeof WONDERS;
export const WONDER_KEYS = Object.keys(WONDERS) as WonderKey[];
export const isWonderKey = (s: string): s is WonderKey => s in WONDERS;

// ---------- eras ----------

// Eras advance with a civ's accumulated science (a stand-in until the
// science system arrives). An era upgrades every improvement of a kind at
// once and restyles the civ's towns; nothing is rebuilt.
export interface EraDef {
  readonly name: string;
  readonly science: number;            // science needed to enter it
  readonly upgrades: Partial<Record<ImprovementKey, Output>>; // added to every improvement of the kind (cumulative)
}

export const ERAS = [
  { name: 'Ancient',   science: 0,    upgrades: {} },
  { name: 'Classical', science: 400,  upgrades: { farm: out({ food: 1 }), boats: out({ gold: 1 }) } },
  { name: 'Medieval',  science: 1400, upgrades: { mine: out({ prod: 1 }), quarry: out({ prod: 1 }), camp: out({ gold: 1 }), wetland: out({ food: 1 }) } },
] as const satisfies readonly EraDef[];
export type EraIndex = 0 | 1 | 2;
export const eraOf = (science: number): EraIndex => (science >= ERAS[2].science ? 2 : science >= ERAS[1].science ? 1 : 0);

// What eras up to `era` add to an improvement.
export function eraBonus(k: ImprovementKey, era: EraIndex): Output {
  let sum = ZERO;
  for (let e = 1; e <= era; e++) {
    const u: Partial<Record<ImprovementKey, Output>> = ERAS[e]!.upgrades;
    const b = u[k];
    if (b) sum = addOut(sum, b);
  }
  return sum;
}

// ---------- growth placements ----------

export type GrowthOption =
  | { readonly kind: 'rural'; readonly tile: number; readonly improvement: ImprovementKey }
  | { readonly kind: 'specialist'; readonly specialist: SpecialistKind };
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

// Specialists the governor keeps: about a third of the citizens.
export const specialistsWanted = (pop: number): number => Math.floor(pop / 3);
const TOWN_PULL = 10;

// How much the governor likes an option, given its yields, the city's food
// surplus after it, the surplus it wants (enough to grow in about
// GROWTH_TURNS) and whether it is short of specialists. Every focus guards
// growth: a citizen who would leave the city short of food is worth much
// less, and food beyond what the city wants is worth little.
export const GROWTH_TURNS = 8;
export function governorScore(focus: FocusKey, kind: GrowthKind, gain: Output, surplusAfter: number, wantSurplus: number, shortOfSpecialists: boolean): number {
  const w = FOCUSES[focus].weights;
  const starving = surplusAfter < 1 ? 3 * (1 - surplusAfter) : 0;
  const town = shortOfSpecialists && kind === 'specialist' ? TOWN_PULL : 0;
  const foodW = surplusAfter - gain.food >= wantSurplus ? 0.3 * w.food : w.food;
  return weigh(focus, gain) - gain.food * w.food + gain.food * foodW - starving + town;
}
