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
// a slot one of the city's buildings has (a Library's scientist, a
// Market's merchant, ...). There are no workers.
//
// Buildings, as in Civ V: one of each per city, each with its own yields,
// percentage bonuses to the city's output, specialist slots, the building
// it needs first (an Academy needs a Library) and where the city must be
// (by a river, on the coast). Each wonder is built once in the world, by
// a city meeting its need; it stands in the city, or beside it on a tile
// the player picks: Machu Picchu on a mountain, the Great Lighthouse on the
// sea, the Pyramids and Stonehenge on flat land.
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

// A peat bog is not farmed as it is: worked, it is drained (game.ts), and
// is then its land (tundra, taiga, forest, prairie) with that land's
// improvement and yields. A worked bog is planned for as drained.
export const drained = (t: TileTerrain): TileTerrain => (t.feature === 'bog' ? { ...t, feature: null } : t);

// The improvement a tile gets when it is developed, or null where the tile
// stays wild (mountains, ice, deep ocean). A total function of the terrain:
// the player picks the tile, never the improvement.
export function improvementFor(t: TileTerrain): ImprovementKey | null {
  if (t.feature === 'bog') return improvementFor(drained(t));
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
  marsh: 'wetland', swamp: 'wetland', mangrove: 'wetland', bog: null, // (bogs: drained first, improvementFor)
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

// ---------- territory ----------

export const CITY_REACH = 2;      // the farthest a city's tiles are from its center
export const START_REACH = 1;     // what a new city owns
// What buying a tile costs: more for each the city has bought already.
export const tileCost = (bought: number): number => 25 + 15 * bought;

// The center's yield.
export const CENTER_BONUS = out({ food: 2, prod: 1, gold: 1, science: 1, culture: 1 });
export const CENTER_MIN = out({ food: 3, prod: 2, gold: 1 });
export const FOOD_PER_CITIZEN = 2;

const withRiver = (base: Output, river: boolean): Output => (river ? addOut(base, out({ gold: RIVER_GOLD })) : base);

export function centerYield(t: TileTerrain, river: boolean): Output {
  const b = addOut(fromYields(terrainYield(t)), CENTER_BONUS);
  return withRiver({ ...b, food: Math.max(CENTER_MIN.food, b.food), prod: Math.max(CENTER_MIN.prod, b.prod), gold: Math.max(CENTER_MIN.gold, b.gold) }, river);
}

export function ruralYield(t0: TileTerrain, river: boolean, era: EraIndex = 0): Output {
  const t = drained(t0), k = improvementFor(t);
  const base = fromYields(terrainYield(t));
  return withRiver(k ? addOut(addOut(base, IMPROVEMENTS[k].bonus), eraBonus(k, era)) : base, river);
}

// ---------- specialists ----------

// Civ V's specialists, each in a slot of one of the city's buildings.
export const SPECIALISTS = {
  scientist: { name: 'Scientist', yields: out({ science: 3 }) },
  merchant:  { name: 'Merchant',  yields: out({ gold: 3 }) },
  engineer:  { name: 'Engineer',  yields: out({ prod: 2 }) },
  artist:    { name: 'Artist',    yields: out({ culture: 3 }) },
} satisfies Record<string, { name: string; yields: Output }>;
export type SpecialistKind = keyof typeof SPECIALISTS;
export const SPECIALIST_KINDS = Object.keys(SPECIALISTS) as SpecialistKind[];
export const specialistYield = (k: SpecialistKind): Output => SPECIALISTS[k].yields;

// ---------- buildings ----------

export const BUILDING_KEYS = [
  'monument', 'granary', 'shrine', 'temple', 'library', 'academy', 'market', 'countingHouse', 'workshop', 'smithy',
  'lighthouse', 'shipyard', 'amphitheater', 'odeon', 'waterMill', 'aqueduct', 'barracks', 'stable', 'walls',
] as const;
export type BuildingKey = (typeof BUILDING_KEYS)[number];

export interface BuildingDef {
  readonly name: string;
  readonly cost: number;
  readonly yields: Output;                                        // its own
  readonly perCitizens?: { readonly per: number; readonly yields: Output };  // per this many citizens
  readonly perImprovement?: { readonly improvement: ImprovementKey; readonly yields: Output }; // per worked tile of the kind
  readonly percent?: Partial<Output>;                             // added to the city's output (food excepted), in %
  readonly specialists?: { readonly kind: SpecialistKind; readonly slots: number };
  readonly requires?: BuildingKey;                                // in the city first
  readonly needs?: 'river' | 'coast';                             // where the city must be
  readonly lostOnCapture?: true;
  readonly desc: string;
}

// (The numbers are placeholders, after Civ V's.)
export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  monument:      { name: 'Monument',       cost: 30, yields: out({ culture: 2 }), desc: '+2 culture.' },
  granary:       { name: 'Granary',        cost: 40, yields: out({ food: 2 }), desc: '+2 food.' },
  shrine:        { name: 'Shrine',         cost: 35, yields: out({ faith: 1 }), lostOnCapture: true, desc: '+1 faith.' },
  temple:        { name: 'Temple',         cost: 60, yields: out({ faith: 2 }), requires: 'shrine', lostOnCapture: true, desc: '+2 faith. Needs a Shrine.' },
  library:       { name: 'Library',        cost: 45, yields: ZERO, perCitizens: { per: 2, yields: out({ science: 1 }) }, specialists: { kind: 'scientist', slots: 1 }, desc: '+1 science per 2 citizens. 1 scientist slot.' },
  academy:       { name: 'Academy',        cost: 80, yields: out({ science: 2 }), percent: { science: 33 }, specialists: { kind: 'scientist', slots: 2 }, requires: 'library', desc: '+2 science, +33% science. 2 scientist slots. Needs a Library.' },
  market:        { name: 'Market',         cost: 45, yields: out({ gold: 2 }), percent: { gold: 25 }, specialists: { kind: 'merchant', slots: 1 }, desc: '+2 gold, +25% gold. 1 merchant slot.' },
  countingHouse: { name: 'Counting house', cost: 80, yields: out({ gold: 2 }), percent: { gold: 25 }, specialists: { kind: 'merchant', slots: 1 }, requires: 'market', desc: '+2 gold, +25% gold. 1 merchant slot. Needs a Market.' },
  workshop:      { name: 'Workshop',       cost: 50, yields: out({ prod: 2 }), percent: { prod: 10 }, specialists: { kind: 'engineer', slots: 1 }, desc: '+2 production, +10% production. 1 engineer slot.' },
  smithy:        { name: 'Smithy',         cost: 80, yields: out({ prod: 2 }), percent: { prod: 15 }, specialists: { kind: 'engineer', slots: 1 }, requires: 'workshop', desc: '+2 production, +15% production. 1 engineer slot. Needs a Workshop.' },
  lighthouse:    { name: 'Lighthouse',     cost: 45, yields: ZERO, perImprovement: { improvement: 'boats', yields: out({ food: 1 }) }, needs: 'coast', desc: '+1 food on each fishing ground worked. A coastal city.' },
  shipyard:      { name: 'Shipyard',       cost: 70, yields: ZERO, perImprovement: { improvement: 'boats', yields: out({ prod: 1 }) }, needs: 'coast', requires: 'lighthouse', desc: '+1 production on each fishing ground worked. Needs a Lighthouse.' },
  amphitheater:  { name: 'Amphitheater',   cost: 50, yields: out({ culture: 2 }), specialists: { kind: 'artist', slots: 1 }, desc: '+2 culture. 1 artist slot.' },
  odeon:         { name: 'Odeon',          cost: 80, yields: out({ culture: 3 }), specialists: { kind: 'artist', slots: 1 }, requires: 'amphitheater', desc: '+3 culture. 1 artist slot. Needs an Amphitheater.' },
  waterMill:     { name: 'Water mill',     cost: 50, yields: out({ food: 2, prod: 1 }), needs: 'river', desc: '+2 food, +1 production. A city by a river.' },
  aqueduct:      { name: 'Aqueduct',       cost: 70, yields: ZERO, desc: 'Keeps 40% of the food when the city grows.' },
  barracks:      { name: 'Barracks',       cost: 40, yields: ZERO, lostOnCapture: true, desc: '+25% defense for units in the city.' },
  stable:        { name: 'Stable',         cost: 55, yields: ZERO, requires: 'barracks', lostOnCapture: true, desc: '+25% defense for units in the city. Needs Barracks.' },
  walls:         { name: 'Walls',          cost: 30, yields: ZERO, desc: '+100% defense for units in the city.' },
};
const def = (k: BuildingKey): BuildingDef => BUILDINGS[k];
// The share of its food a city with an Aqueduct keeps when it grows.
export const AQUEDUCT_KEEP = 0.4;

// Whether a city may build k now: not yet built, what it needs first
// there, by a river or on the coast if it must be.
export function buildingAllowed(k: BuildingKey, has: ReadonlySet<BuildingKey>, river: boolean, coast: boolean): boolean {
  const d = def(k);
  if (has.has(k) || (d.requires && !has.has(d.requires))) return false;
  return d.needs === 'river' ? river : d.needs === 'coast' ? coast : true;
}

// What a city of `pop` citizens, working `worked` tiles of each
// improvement, gets from its buildings before percentages: their own
// yields, per citizens, per worked tile.
export function buildingsYield(keys: Iterable<BuildingKey>, pop: number, worked: (k: ImprovementKey) => number): Output {
  let sum = ZERO;
  for (const k of keys) {
    const d = def(k);
    sum = addOut(sum, d.yields);
    if (d.perCitizens) sum = addOut(sum, scaleOut(d.perCitizens.yields, Math.floor(pop / d.perCitizens.per)));
    if (d.perImprovement) sum = addOut(sum, scaleOut(d.perImprovement.yields, worked(d.perImprovement.improvement)));
  }
  return sum;
}

// The city's output with its buildings' percentages (food excepted), whole.
export function withPercents(o: Output, keys: Iterable<BuildingKey>): Output {
  const pct: Record<OutputKey, number> = { food: 0, prod: 0, gold: 0, science: 0, culture: 0, faith: 0 };
  for (const k of keys) for (const [y, p] of Object.entries(def(k).percent ?? {}) as [OutputKey, number][]) pct[y] += p;
  return out({ food: o.food, ...Object.fromEntries((OUTPUT_KEYS.filter((y) => y !== 'food')).map((y) => [y, Math.floor((o[y] * (100 + pct[y])) / 100)])) });
}

// The specialist slots a city's buildings have, of a kind.
export function specialistSlots(keys: Iterable<BuildingKey>, kind: SpecialistKind): number {
  let n = 0;
  for (const k of keys) { const s = def(k).specialists; if (s?.kind === kind) n += s.slots; }
  return n;
}

// ---------- wonders ----------

// What a wonder needs (game.ts siteOk): of its city's center, or of the
// tile beside it where it stands.
export type WonderSite = 'desertOrFloodplain' | 'coast' | 'river' | 'mountainTop' | 'hills' | 'flat' | 'any';

export interface WonderDef {
  readonly name: string;
  readonly cost: number;
  readonly site: WonderSite;
  readonly yields: Output; // to its city
  // Where it stands beside its city (on a tile next to it, the player's
  // pick): a mountain (the tile stays wild: no citizen lives there), the sea
  // or flat land (fishing and farming go on round it). Else in the city.
  readonly beside?: 'mountain' | 'sea' | 'land';
  readonly desc: string;
}

// Each is built once in the world, by one city.
export const WONDERS = {
  pyramids:        { name: 'Pyramids',         cost: 180, site: 'desertOrFloodplain', beside: 'land', yields: out({ prod: 4, culture: 2 }), desc: 'On flat desert or floodplain beside the city. +4 production, +2 culture.' },
  greatLighthouse: { name: 'Great Lighthouse', cost: 160, site: 'coast', beside: 'sea', yields: out({ food: 2, gold: 3, culture: 1 }), desc: 'On the sea beside a coastal city. +2 food, +3 gold, +1 culture.' },
  hangingGardens:  { name: 'Hanging Gardens',  cost: 180, site: 'river', yields: out({ food: 4, culture: 2 }), desc: 'A city by a river. +4 food, +2 culture.' },
  machuPicchu:     { name: 'Machu Picchu',     cost: 200, site: 'mountainTop', beside: 'mountain', yields: out({ gold: 4, faith: 2, culture: 2 }), desc: 'On top of a mountain next to the city. +4 gold, +2 faith, +2 culture.' },
  greatLibrary:    { name: 'Great Library',    cost: 200, site: 'any', yields: out({ science: 5, culture: 2 }), desc: '+5 science, +2 culture.' },
  stonehenge:      { name: 'Stonehenge',       cost: 140, site: 'flat', beside: 'land', yields: out({ faith: 4, culture: 1 }), desc: 'On flat open land beside the city. +4 faith, +1 culture.' },
  colosseum:       { name: 'Colosseum',        cost: 180, site: 'any', yields: out({ culture: 5, gold: 1 }), desc: '+5 culture, +1 gold.' },
} satisfies Record<string, WonderDef>;
export type WonderKey = keyof typeof WONDERS;
export const WONDER_KEYS = Object.keys(WONDERS) as WonderKey[];
export const isWonderKey = (s: string): s is WonderKey => s in WONDERS;
export const wonderBeside = (k: WonderKey): WonderDef['beside'] => (WONDERS[k] as WonderDef).beside;

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
const TOWN_PULL = 14;

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
