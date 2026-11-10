// City rules (design doc "Cities: Feel & Play"), Civ V style: a city is
// its center tile, which holds all of its buildings and wonders (painted
// there: cityPainter.ts), and the land around it. Every tile it owns is in
// one of three uses:
//   center  the city
//   rural   worked by one of its citizens: its terrain's yields
//   wild    owned but not worked; yields nothing
// One citizen, one tile: a city's population is its center plus its rural
// tiles plus its specialists. Each new citizen is a growth placement the
// player (or the city's governor) makes: a tile, or a specialist in a slot
// one of the city's buildings has (a Library's scientist, a Market's
// merchant, ...). Workers (Civ V's) improve the land, worked or not: the
// improvement the terrain decides (farm, mine, camp, ...), once their civ
// knows its first tech (techs.ts STAGE_TECHS), a few turns on the tile
// (IMPROVE_TURNS); a worked tile adds its improvement's yield to its
// terrain's.
//
// Buildings, as in Civ V: one of each per city, each with its own yields,
// percentage bonuses to the city's output, specialist slots, the building
// it needs first (an Academy needs a Library) and where the city must be
// (by a river, on the coast). Each wonder is built once in the world, by
// a city meeting its need; it stands in the city, or beside it on a tile
// the player picks: Machu Picchu on a mountain, the Great Lighthouse on the
// sea, the Pyramids and Stonehenge on flat land.
//
// A city starts with the tiles around its center; its borders then grow
// ring by ring with the culture it makes (BORDER_AT), out to BORDER_MAX
// tiles, claiming tiles no one owns yet. Its citizens only ever work the
// tiles within CITY_REACH (Civ IV's "fat cross"): the land beyond is held
// for its resources and so that no rival can settle there. Tiles within
// reach may also be bought with gold (game.ts buyTile).
//
// Pure rules only: the state lives in Game, the look in render.ts.

import { BIOMES, FEATURES, RIVER_GOLD, terrainYield, type TileTerrain, type Yields } from './terrain.ts';

// ---------- city output: the terrain's yields plus science, culture, faith ----------

// Cohesion: a society holding together (its institutions, its shared
// life); it pays for politics (politics.ts), as science pays for techs and
// culture for identity (identity.ts) and borders.
export const OUTPUT_KEYS = ['food', 'prod', 'gold', 'science', 'culture', 'faith', 'cohesion'] as const;
export type OutputKey = (typeof OUTPUT_KEYS)[number];
export type Output = Readonly<Record<OutputKey, number>>;
export const out = (o: Partial<Output> = {}): Output =>
  ({ food: 0, prod: 0, gold: 0, science: 0, culture: 0, faith: 0, cohesion: 0, ...o });
export const ZERO: Output = out();
export const addOut = (a: Output, b: Output): Output =>
  ({ food: a.food + b.food, prod: a.prod + b.prod, gold: a.gold + b.gold, science: a.science + b.science, culture: a.culture + b.culture, faith: a.faith + b.faith, cohesion: a.cohesion + b.cohesion });
export const scaleOut = (a: Output, k: number): Output =>
  ({ food: a.food * k, prod: a.prod * k, gold: a.gold * k, science: a.science * k, culture: a.culture * k, faith: a.faith * k, cohesion: a.cohesion * k });
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
  farm:    { name: 'Farm',            bonus: out({ food: 1 }) },
  mine:    { name: 'Mine',            bonus: out({ prod: 2 }) },
  camp:    { name: 'Camp',            bonus: out({ food: 1 }) },
  quarry:  { name: 'Quarry',          bonus: out({ prod: 1 }) },
  wetland: { name: 'Wetland harvest', bonus: out({ food: 1 }) },
  boats:   { name: 'Fishing boats',   bonus: out({ food: 1 }) },
  // (Only on resources: resources.ts RESOURCE_IMPROVEMENT.)
  pasture: { name: 'Pasture',         bonus: out({ food: 1 }) },
  plantation: { name: 'Plantation',   bonus: out({ gold: 1 }) },
  well:    { name: 'Oil well',        bonus: out({ prod: 2 }) },
} satisfies Record<string, ImprovementDef>;
export type ImprovementKey = keyof typeof IMPROVEMENTS;
export const IMPROVEMENT_KEYS = Object.keys(IMPROVEMENTS) as ImprovementKey[];
// Turns a worker spends building each.
export const IMPROVE_TURNS: Record<ImprovementKey, number> = { farm: 5, pasture: 5, camp: 5, plantation: 6, quarry: 6, mine: 6, wetland: 6, boats: 4, well: 8 };

// A peat bog is not farmed as it is: worked, it is drained (game.ts), and
// is then its land (tundra, taiga, forest, prairie) with that land's
// improvement and yields. A worked bog is planned for as drained.
export const drained = (t: TileTerrain): TileTerrain => (t.feature === 'bog' ? { ...t, feature: null } : t);

// The improvement a tile gets when it is developed, or null where the tile
// stays wild (mountains, ice, deep ocean). A total function of the terrain
// and of the resource on it its owner knows of (`onResource`: that
// resource's improvement, resources.ts RESOURCE_IMPROVEMENT): the player
// picks the tile, never the improvement. Cattle are pastured, never farmed.
export function improvementFor(t: TileTerrain, onResource: ImprovementKey | null = null): ImprovementKey | null {
  if (onResource) return onResource;
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

export const CITY_REACH = 2;      // the farthest a city's worked tiles are from its center
export const START_REACH = 1;     // what a new city owns
// The city's culture so far (its own) that brings its borders out to each
// ring (index: the ring), and the farthest they go.
export const BORDER_AT = [0, 0, 12, 80, 500, 3000] as const;
export const BORDER_MAX = 5;
export function borderRing(culture: number): number {
  let r = START_REACH;
  while (r < BORDER_MAX && culture >= BORDER_AT[r + 1]!) r++;
  return r;
}
// What buying a tile costs: more for each the city has bought already.
export const tileCost = (bought: number): number => 25 + 15 * bought;

// The center's yield.
export const CENTER_BONUS = out({ food: 1, prod: 1, gold: 1, science: 1, culture: 1, cohesion: 1 });
// (At least one food spare at size 1: every city can grow, however poor its land.)
export const CENTER_MIN = out({ food: 3, prod: 1, gold: 1 });
export const FOOD_PER_CITIZEN = 2;

const withRiver = (base: Output, river: boolean): Output => (river ? addOut(base, out({ gold: RIVER_GOLD })) : base);

export function centerYield(t: TileTerrain, river: boolean): Output {
  const b = addOut(fromYields(terrainYield(t)), CENTER_BONUS);
  return withRiver({ ...b, food: Math.max(CENTER_MIN.food, b.food), prod: Math.max(CENTER_MIN.prod, b.prod), gold: Math.max(CENTER_MIN.gold, b.gold) }, river);
}

// A worked tile's yield: its terrain, and its improvement (`built`, if any)
// with what the owner's techs and traits add to it (`extra`, effects.ts tileBonus).
export function ruralYield(t: TileTerrain, river: boolean, built: ImprovementKey | null, extra: (k: ImprovementKey) => Output = () => ZERO): Output {
  const base = fromYields(terrainYield(t));
  return withRiver(built ? addOut(addOut(base, IMPROVEMENTS[built].bonus), extra(built)) : base, river);
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
  'lighthouse', 'shipyard', 'amphitheater', 'odeon', 'waterMill', 'aqueduct', 'barracks', 'stable', 'walls', 'courthouse',
  'university', 'bank', 'factory', 'hospital', 'stockExchange', 'researchLab', 'broadcastTower',
  'forum', 'caravanserai', 'harbor', 'guildHall', 'observatory', 'chancery', 'railwayStation', 'museum', 'publicSchool', 'powerPlant', 'ministry',
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
  readonly resource?: 'horses' | 'iron' | 'niter' | 'coal' | 'oil'; // a strategic resource its civ must own (resources.ts)
  readonly lostOnCapture?: true;
  readonly desc: string;
}

// (Lean numbers, after Civ IV's: flat yields small; what scales with the
// city's size or adds a percentage is what grows a tall city.)
export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  monument:      { name: 'Monument',       cost: 30, yields: out({ culture: 1, cohesion: 1 }), desc: '+1 culture, +1 cohesion.' },
  granary:       { name: 'Granary',        cost: 40, yields: out({ food: 1 }), desc: '+1 food.' },
  shrine:        { name: 'Shrine',         cost: 35, yields: out({ faith: 1 }), lostOnCapture: true, desc: '+1 faith.' },
  temple:        { name: 'Temple',         cost: 60, yields: out({ faith: 2 }), requires: 'shrine', lostOnCapture: true, desc: '+2 faith. Needs a Shrine.' },
  library:       { name: 'Library',        cost: 45, yields: ZERO, perCitizens: { per: 2, yields: out({ science: 1 }) }, specialists: { kind: 'scientist', slots: 1 }, desc: '+1 science per 2 citizens. 1 scientist slot.' },
  academy:       { name: 'Academy',        cost: 80, yields: out({ science: 1 }), percent: { science: 25 }, specialists: { kind: 'scientist', slots: 2 }, requires: 'library', desc: '+1 science, +25% science. 2 scientist slots. Needs a Library.' },
  market:        { name: 'Market',         cost: 45, yields: out({ gold: 1 }), percent: { gold: 20 }, specialists: { kind: 'merchant', slots: 1 }, desc: '+1 gold, +20% gold. 1 merchant slot.' },
  countingHouse: { name: 'Counting house', cost: 80, yields: out({ gold: 1 }), percent: { gold: 15 }, specialists: { kind: 'merchant', slots: 1 }, requires: 'market', desc: '+1 gold, +15% gold. 1 merchant slot. Needs a Market.' },
  workshop:      { name: 'Workshop',       cost: 50, yields: out({ prod: 1 }), percent: { prod: 10 }, specialists: { kind: 'engineer', slots: 1 }, desc: '+1 production, +10% production. 1 engineer slot.' },
  smithy:        { name: 'Smithy',         cost: 80, yields: out({ prod: 1 }), percent: { prod: 15 }, specialists: { kind: 'engineer', slots: 1 }, requires: 'workshop', desc: '+1 production, +15% production. 1 engineer slot. Needs a Workshop.' },
  lighthouse:    { name: 'Lighthouse',     cost: 45, yields: ZERO, perImprovement: { improvement: 'boats', yields: out({ food: 1 }) }, needs: 'coast', desc: '+1 food on each fishing ground worked. A coastal city.' },
  shipyard:      { name: 'Shipyard',       cost: 70, yields: ZERO, perImprovement: { improvement: 'boats', yields: out({ prod: 1 }) }, needs: 'coast', requires: 'lighthouse', desc: '+1 production on each fishing ground worked. Needs a Lighthouse.' },
  amphitheater:  { name: 'Amphitheater',   cost: 50, yields: out({ culture: 1 }), percent: { culture: 15 }, specialists: { kind: 'artist', slots: 1 }, desc: '+1 culture, +15% culture. 1 artist slot.' },
  odeon:         { name: 'Odeon',          cost: 80, yields: out({ culture: 2 }), percent: { culture: 15 }, specialists: { kind: 'artist', slots: 1 }, requires: 'amphitheater', desc: '+2 culture, +15% culture. 1 artist slot. Needs an Amphitheater.' },
  waterMill:     { name: 'Water mill',     cost: 50, yields: out({ food: 1, prod: 1 }), needs: 'river', desc: '+1 food, +1 production. A city by a river.' },
  aqueduct:      { name: 'Aqueduct',       cost: 70, yields: ZERO, desc: 'Keeps 40% of the food when the city grows.' },
  barracks:      { name: 'Barracks',       cost: 40, yields: ZERO, lostOnCapture: true, desc: '+25% defense for units in the city.' },
  stable:        { name: 'Stable',         cost: 55, yields: ZERO, requires: 'barracks', lostOnCapture: true, desc: '+25% defense for units in the city. Needs Barracks.' },
  walls:         { name: 'Walls',          cost: 30, yields: ZERO, desc: '+100% defense for units in the city.' },
  courthouse:    { name: 'Courthouse',     cost: 60, yields: out({ cohesion: 1 }), desc: '+1 cohesion. Halves the city\'s upkeep.' },
  university:    { name: 'University',     cost: 140, yields: out({ science: 2 }), percent: { science: 25 }, specialists: { kind: 'scientist', slots: 1 }, requires: 'academy', desc: '+2 science, +25% science. 1 scientist slot. Needs an Academy.' },
  bank:          { name: 'Bank',           cost: 140, yields: out({ gold: 2 }), percent: { gold: 15 }, specialists: { kind: 'merchant', slots: 1 }, requires: 'countingHouse', desc: '+2 gold, +15% gold. 1 merchant slot. Needs a Counting house.' },
  factory:       { name: 'Factory',        cost: 200, yields: out({ prod: 2 }), percent: { prod: 25 }, specialists: { kind: 'engineer', slots: 1 }, requires: 'smithy', resource: 'coal', desc: '+2 production, +25% production. 1 engineer slot. Needs a Smithy, and Coal.' },
  hospital:      { name: 'Hospital',       cost: 180, yields: out({ food: 3 }), requires: 'aqueduct', desc: '+3 food. Needs an Aqueduct.' },
  stockExchange: { name: 'Stock exchange', cost: 260, yields: out({ gold: 3 }), percent: { gold: 15 }, specialists: { kind: 'merchant', slots: 1 }, requires: 'bank', desc: '+3 gold, +15% gold. 1 merchant slot. Needs a Bank.' },
  researchLab:   { name: 'Research lab',   cost: 280, yields: out({ science: 3 }), percent: { science: 30 }, specialists: { kind: 'scientist', slots: 1 }, requires: 'university', desc: '+3 science, +30% science. 1 scientist slot. Needs a University.' },
  broadcastTower: { name: 'Broadcast tower', cost: 260, yields: out({ culture: 3, cohesion: 2 }), percent: { culture: 20 }, specialists: { kind: 'artist', slots: 1 }, requires: 'museum', desc: '+3 culture, +2 cohesion, +20% culture. 1 artist slot. Needs a Museum.' },
  forum:         { name: 'Forum',          cost: 55, yields: out({ cohesion: 2 }), percent: { cohesion: 15 }, desc: '+2 cohesion, +15% cohesion.' },
  caravanserai:  { name: 'Caravanserai',   cost: 55, yields: out({ gold: 2 }), desc: '+2 gold.' },
  harbor:        { name: 'Harbor',         cost: 80, yields: ZERO, perImprovement: { improvement: 'boats', yields: out({ gold: 1 }) }, needs: 'coast', requires: 'lighthouse', desc: '+1 gold on each fishing ground worked. Needs a Lighthouse.' },
  guildHall:     { name: 'Guild hall',     cost: 90, yields: out({ prod: 1, gold: 1 }), specialists: { kind: 'engineer', slots: 1 }, requires: 'workshop', desc: '+1 production, +1 gold. 1 engineer slot. Needs a Workshop.' },
  observatory:   { name: 'Observatory',    cost: 110, yields: out({ science: 2 }), percent: { science: 10 }, desc: '+2 science, +10% science.' },
  chancery:      { name: 'Chancery',       cost: 120, yields: out({ cohesion: 3 }), percent: { cohesion: 20 }, requires: 'forum', desc: '+3 cohesion, +20% cohesion. Needs a Forum.' },
  railwayStation: { name: 'Railway station', cost: 180, yields: out({ prod: 2, gold: 2 }), resource: 'coal', desc: '+2 production, +2 gold. Needs Coal.' },
  museum:        { name: 'Museum',         cost: 180, yields: out({ culture: 3 }), percent: { culture: 20 }, specialists: { kind: 'artist', slots: 1 }, requires: 'odeon', desc: '+3 culture, +20% culture. 1 artist slot. Needs an Odeon.' },
  publicSchool:  { name: 'Public school',  cost: 170, yields: out({ cohesion: 1 }), perCitizens: { per: 3, yields: out({ science: 1 }) }, requires: 'library', desc: '+1 cohesion, +1 science per 3 citizens. Needs a Library.' },
  powerPlant:    { name: 'Power plant',    cost: 260, yields: out({ prod: 3 }), percent: { prod: 20 }, requires: 'factory', resource: 'oil', desc: '+3 production, +20% production. Needs a Factory, and Oil.' },
  ministry:      { name: 'Ministry',       cost: 240, yields: out({ cohesion: 4 }), percent: { cohesion: 25 }, requires: 'chancery', desc: '+4 cohesion, +25% cohesion. Needs a Chancery.' },
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
  const pct: Record<OutputKey, number> = { food: 0, prod: 0, gold: 0, science: 0, culture: 0, faith: 0, cohesion: 0 };
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

// Its description: where it stands, then what it yields.
const OUTPUT_NAME: Record<OutputKey, string> = { food: 'food', prod: 'production', gold: 'gold', science: 'science', culture: 'culture', faith: 'faith', cohesion: 'cohesion' };
const WHERE: Record<WonderSite, string> = { desertOrFloodplain: 'desert or floodplain', coast: 'the coast', river: 'a river', mountainTop: 'a mountain', hills: 'hills', flat: 'flat open land', any: '' };
function wonderDesc(site: WonderSite, yields: Output, beside?: WonderDef['beside']): string {
  const where = beside === 'sea' ? 'On the sea beside a coastal city. '
    : beside === 'mountain' ? 'On top of a mountain next to the city. '
    : beside === 'land' ? `On ${site === 'desertOrFloodplain' ? 'flat desert or floodplain' : site === 'hills' ? 'hills' : 'flat open land'} beside the city. `
    : site === 'any' ? '' : site === 'river' ? 'A city by a river. ' : site === 'coast' ? 'A coastal city. ' : `A city on ${WHERE[site]}. `;
  return where + OUTPUT_KEYS.filter((k) => yields[k]).map((k) => `+${yields[k]} ${OUTPUT_NAME[k]}`).join(', ') + '.';
}
const w = (name: string, cost: number, site: WonderSite, yields: Partial<Output>, beside?: WonderDef['beside']): WonderDef => {
  const y = out(yields);
  return { name, cost, site, yields: y, ...(beside ? { beside } : {}), desc: wonderDesc(site, y, beside) };
};

// Each is built once in the world, by one city. Most stand in their city;
// those that stand outside towns in the real world take a tile beside it.
// (Unlocked by techs: techs.ts.)
export const WONDERS = {
  // Ancient
  pyramids:          w('Pyramids', 180, 'desertOrFloodplain', { prod: 4, culture: 2 }, 'land'),
  greatLighthouse:   w('Great Lighthouse', 160, 'coast', { food: 2, gold: 3, culture: 1 }, 'sea'),
  stonehenge:        w('Stonehenge', 140, 'flat', { faith: 4, culture: 1 }, 'land'),
  hangingGardens:    w('Hanging Gardens', 180, 'river', { food: 4, culture: 2 }),
  templeOfArtemis:   w('Temple of Artemis', 160, 'any', { food: 2, faith: 2, culture: 1 }),
  // Classical
  parthenon:         w('Parthenon', 220, 'any', { culture: 5, faith: 1 }),
  persepolis:        w('Persepolis', 220, 'any', { cohesion: 3, gold: 2, culture: 1 }),
  colosseum:         w('Colosseum', 180, 'any', { culture: 5, gold: 1 }),
  greatLibrary:      w('Great Library', 200, 'any', { science: 5, culture: 2 }),
  terracottaArmy:    w('Terracotta Army', 220, 'flat', { prod: 4, culture: 2 }, 'land'),
  petra:             w('Petra', 200, 'hills', { gold: 4, food: 1, culture: 1 }, 'land'),
  colossus:          w('Colossus', 220, 'coast', { gold: 4, culture: 1 }, 'sea'),
  mausoleum:         w('Mausoleum at Halicarnassus', 200, 'any', { culture: 3, gold: 2, cohesion: 1 }),
  statueOfZeus:      w('Statue of Zeus', 200, 'any', { faith: 3, culture: 3 }),
  templeOfSolomon:   w('Temple of Solomon', 220, 'any', { faith: 4, culture: 2, gold: 1 }),
  // Medieval
  hagiaSophia:       w('Hagia Sophia', 320, 'any', { faith: 5, culture: 3 }),
  machuPicchu:       w('Machu Picchu', 300, 'mountainTop', { gold: 4, faith: 2, culture: 2 }, 'mountain'),
  angkorWat:         w('Angkor Wat', 320, 'any', { food: 3, faith: 3, culture: 2 }),
  notreDame:         w('Notre-Dame', 340, 'river', { faith: 4, culture: 4 }),
  staveChurch:       w('Stave Church', 300, 'any', { faith: 4, prod: 2, culture: 1 }),
  chichenItza:       w('Chichén Itzá', 320, 'any', { faith: 3, culture: 3, science: 2 }),
  leaningTower:      w('Leaning Tower of Pisa', 300, 'any', { culture: 4, science: 2, gold: 1 }),
  // Renaissance
  tajMahal:          w('Taj Mahal', 460, 'river', { culture: 6, gold: 3 }),
  stBasils:          w('St Basil\u2019s Cathedral', 460, 'any', { faith: 5, culture: 4 }),
  himejiCastle:      w('Himeji Castle', 440, 'any', { culture: 5, prod: 3 }),
  forbiddenCity:     w('Forbidden City', 500, 'any', { cohesion: 4, gold: 3, culture: 3 }),
  florenceCathedral: w('Florence Cathedral', 440, 'any', { culture: 5, faith: 3, science: 1 }),
  temploMayor:       w('Templo Mayor', 440, 'any', { faith: 4, food: 3, culture: 2 }),
  stPeters:          w('St Peter\u2019s Basilica', 480, 'any', { faith: 6, culture: 3 }),
  // Industrial
  eiffelTower:       w('Eiffel Tower', 660, 'any', { culture: 8, gold: 2 }),
  neuschwanstein:    w('Neuschwanstein', 620, 'hills', { culture: 7, gold: 3 }, 'land'),
  bigBen:            w('Big Ben', 620, 'any', { gold: 8, culture: 2 }),
  statueOfLiberty:   w('Statue of Liberty', 640, 'coast', { culture: 6, prod: 3 }, 'sea'),
  sagradaFamilia:    w('Sagrada Fam\u00edlia', 660, 'any', { faith: 5, culture: 5 }),
  brandenburgGate:   w('Brandenburg Gate', 600, 'any', { cohesion: 4, culture: 4, prod: 1 }),
  // Modern
  cristoRedentor:    w('Cristo Redentor', 860, 'hills', { faith: 6, culture: 6 }),
  empireState:       w('Empire State Building', 900, 'any', { prod: 6, gold: 6, science: 3 }),
  sydneyOperaHouse:  w('Sydney Opera House', 880, 'coast', { culture: 10, gold: 3 }),
  tokyoTower:        w('Tokyo Tower', 860, 'any', { culture: 8, science: 4 }),
  maracana:          w('Maracan\u00e3', 860, 'any', { culture: 9, gold: 4 }),
  // Information
  burjKhalifa:       w('Burj Khalifa', 1150, 'any', { gold: 10, culture: 4 }),
  fastTelescope:     w('FAST Radio Telescope', 1100, 'hills', { science: 12 }, 'land'),
  cern:              w('CERN', 1200, 'any', { science: 12, culture: 2 }),
  launchComplex39:   w('Launch Complex 39', 1150, 'coast', { science: 10, culture: 4 }, 'land'),
} satisfies Record<string, WonderDef>;
export type WonderKey = keyof typeof WONDERS;
export const WONDER_KEYS = Object.keys(WONDERS) as WonderKey[];
export const isWonderKey = (s: string): s is WonderKey => s in WONDERS;
// The most wonders a city may have, in it and beside it alike.
export const MAX_CITY_WONDERS = 7;
export const wonderBeside = (k: WonderKey): WonderDef['beside'] => (WONDERS[k] as WonderDef).beside;

// ---------- eras ----------

// A civ's era is that of the latest tech it knows (game.ts); it restyles
// the civ's towns (cityProps.ts). What improvements yield more over time
// comes from techs and traits now (effects.ts improvement).
export interface EraDef {
  readonly name: string;
}

export const ERAS = [
  { name: 'Ancient' }, { name: 'Classical' }, { name: 'Medieval' }, { name: 'Renaissance' }, { name: 'Industrial' }, { name: 'Modern' }, { name: 'Information' },
] as const satisfies readonly EraDef[];
export type EraIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ---------- growth placements ----------

export type GrowthOption =
  | { readonly kind: 'rural'; readonly tile: number; readonly improvement: ImprovementKey | null } // (null: unimproved)
  | { readonly kind: 'specialist'; readonly specialist: SpecialistKind };
export type GrowthKind = GrowthOption['kind'];

// ---------- governor ----------

export interface FocusDef {
  readonly name: string;
  readonly weights: Output;
}

export const FOCUSES = {
  balanced:   { name: 'Balanced',   weights: out({ food: 2.5, prod: 2, gold: 1, science: 1.5, culture: 1.2, faith: 1, cohesion: 1.2 }) },
  food:       { name: 'Food',       weights: out({ food: 4, prod: 1.5, gold: 0.5, science: 0.8, culture: 0.6, faith: 0.5, cohesion: 0.6 }) },
  production: { name: 'Production', weights: out({ food: 1.5, prod: 4, gold: 0.5, science: 0.8, culture: 0.6, faith: 0.5, cohesion: 0.6 }) },
  gold:       { name: 'Gold',       weights: out({ food: 1.5, prod: 1.5, gold: 4, science: 0.8, culture: 0.6, faith: 0.5, cohesion: 0.6 }) },
  science:    { name: 'Science',    weights: out({ food: 1.5, prod: 1.5, gold: 0.8, science: 4, culture: 0.6, faith: 0.5, cohesion: 0.6 }) },
  culture:    { name: 'Culture',    weights: out({ food: 1.5, prod: 1.5, gold: 0.8, science: 0.8, culture: 4, faith: 0.8, cohesion: 0.8 }) },
  faith:      { name: 'Faith',      weights: out({ food: 1.5, prod: 1.5, gold: 0.8, science: 0.6, culture: 0.8, faith: 4, cohesion: 0.6 }) },
} satisfies Record<string, FocusDef>;
export type FocusKey = keyof typeof FOCUSES;
export const isFocusKey = (s: string): s is FocusKey => s in FOCUSES;

export const weigh = (focus: FocusKey, o: Output): number => {
  const w = FOCUSES[focus].weights;
  return OUTPUT_KEYS.reduce((s, k) => s + o[k] * w[k], 0);
};

// Specialists the governor keeps: about a third of the citizens.
export const specialistsWanted = (pop: number): number => Math.floor(pop / 3);
const TOWN_PULL = 22;

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
