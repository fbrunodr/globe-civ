// Terrain gameplay rules. A tile's terrain is three independent layers:
//   biome   - from climate (temperature × rainfall), or the kind of water
//   relief  - flat, hills or mountains, laid over any land biome
//   feature - optional local extra: wetlands, oasis, volcano, reef, ...
// How each layer looks lives in look.ts.

export interface Yields {
  readonly food: number;
  readonly prod: number;
  readonly gold: number;
}

const y = (food: number, prod: number, gold: number): Yields => ({ food, prod, gold });

export interface BiomeDef {
  readonly name: string;
  readonly yields: Yields;
  readonly water: boolean;
  readonly move: number;    // movement cost for land units (ignored on water)
  readonly defense: number; // fraction, e.g. 0.25 = +25%
}

export const BIOMES = {
  // water
  ocean:               { name: 'Deep ocean',           yields: y(1, 0, 0), water: true,  move: 1, defense: 0 },
  shallowSea:          { name: 'Shallow sea',          yields: y(2, 0, 1), water: true,  move: 1, defense: 0 },
  lake:                { name: 'Lake',                 yields: y(2, 0, 1), water: true,  move: 1, defense: 0 },
  seaIce:              { name: 'Sea ice',              yields: y(0, 0, 0), water: true,  move: 1, defense: 0 },
  // cold
  iceSheet:            { name: 'Ice sheet',            yields: y(0, 0, 0), water: false, move: 3, defense: 0 },
  tundra:              { name: 'Tundra',               yields: y(1, 0, 0), water: false, move: 1, defense: 0 },
  taiga:               { name: 'Boreal forest',        yields: y(1, 2, 0), water: false, move: 2, defense: 0.25 },
  // temperate
  coldDesert:          { name: 'Cold desert',          yields: y(0, 1, 0), water: false, move: 1, defense: 0 },
  steppe:              { name: 'Steppe',               yields: y(1, 1, 0), water: false, move: 1, defense: 0 },
  prairie:             { name: 'Prairie',              yields: y(2, 0, 0), water: false, move: 1, defense: 0 },
  temperateForest:     { name: 'Temperate forest',     yields: y(1, 2, 0), water: false, move: 2, defense: 0.25 },
  temperateRainforest: { name: 'Temperate rainforest', yields: y(1, 3, 0), water: false, move: 2, defense: 0.25 },
  mediterranean:       { name: 'Mediterranean scrub',  yields: y(1, 1, 1), water: false, move: 1, defense: 0 },
  // tropical
  hotDesert:           { name: 'Hot desert',           yields: y(0, 1, 0), water: false, move: 1, defense: 0 },
  savanna:             { name: 'Savanna',              yields: y(2, 1, 0), water: false, move: 1, defense: 0 },
  monsoonForest:       { name: 'Monsoon forest',       yields: y(1, 2, 0), water: false, move: 2, defense: 0.25 },
  jungle:              { name: 'Jungle',               yields: y(2, 0, 0), water: false, move: 2, defense: 0.25 },
} satisfies Record<string, BiomeDef>;
export type BiomeKey = keyof typeof BIOMES;
export const biomeDef = (k: BiomeKey): BiomeDef => BIOMES[k];

export interface ReliefDef {
  readonly name: string;
  readonly bonus: Yields;          // added to the biome's yields
  readonly override: Yields | null; // replaces them entirely
  readonly move: number;
  readonly defense: number;
}

export const RELIEFS = {
  flat:      { name: 'Flat',      bonus: y(0, 0, 0), override: null,       move: 1, defense: 0 },
  hills:     { name: 'Hills',     bonus: y(0, 1, 0), override: null,       move: 2, defense: 0.5 },
  mountains: { name: 'Mountains', bonus: y(0, 0, 0), override: y(0, 1, 0), move: 3, defense: 1.0 },
} satisfies Record<string, ReliefDef>;
export type ReliefKey = keyof typeof RELIEFS;
export const reliefDef = (k: ReliefKey): ReliefDef => RELIEFS[k];

export interface FeatureDef {
  readonly name: string;
  readonly yields: Yields; // replaces biome and relief yields
  readonly onWater: boolean;
  readonly move: number;
  readonly defense: number;
}

export const FEATURES = {
  marsh:      { name: 'Marsh',      yields: y(1, 0, 0), onWater: false, move: 3, defense: -0.15 },
  swamp:      { name: 'Swamp',      yields: y(1, 1, 0), onWater: false, move: 3, defense: 0.1 },
  mangrove:   { name: 'Mangroves',  yields: y(1, 1, 1), onWater: false, move: 3, defense: 0.25 },
  bog:        { name: 'Peat bog',   yields: y(0, 1, 0), onWater: false, move: 3, defense: 0 },
  floodplain: { name: 'Floodplain', yields: y(3, 0, 1), onWater: false, move: 1, defense: 0 },
  oasis:      { name: 'Oasis',      yields: y(3, 0, 1), onWater: false, move: 1, defense: 0 },
  volcano:    { name: 'Volcano',    yields: y(0, 2, 0), onWater: false, move: 3, defense: 0.5 },
  glacier:    { name: 'Glacier',    yields: y(0, 0, 0), onWater: false, move: 4, defense: 0.5 },
  reef:       { name: 'Coral reef', yields: y(2, 1, 1), onWater: true,  move: 1, defense: 0 },
  kelp:       { name: 'Kelp forest', yields: y(2, 1, 0), onWater: true, move: 1, defense: 0 },
} satisfies Record<string, FeatureDef>;
export type FeatureKey = keyof typeof FEATURES;
export const featureDef = (k: FeatureKey): FeatureDef => FEATURES[k];

export interface TileTerrain {
  readonly biome: BiomeKey;
  readonly relief: ReliefKey;
  readonly feature: FeatureKey | null;
}

// ---------- pure rules ----------

export const isWaterBiome = (b: BiomeKey): boolean => BIOMES[b].water;

export function terrainYield(t: TileTerrain): Yields {
  if (t.feature) return FEATURES[t.feature].yields;
  const r = RELIEFS[t.relief];
  if (r.override) return r.override;
  const b = BIOMES[t.biome].yields;
  return y(b.food + r.bonus.food, b.prod + r.bonus.prod, b.gold + r.bonus.gold);
}

// A tile beside a river gets fresh water and trade: +1 gold.
export const RIVER_GOLD = 1;

export function terrainMoveCost(t: TileTerrain): number {
  return Math.max(BIOMES[t.biome].move, RELIEFS[t.relief].move, t.feature ? FEATURES[t.feature].move : 1);
}

export function terrainDefense(t: TileTerrain): number {
  // Mountains have no vegetation cover, so the biome's bonus does not apply.
  const biome = t.relief === 'mountains' ? 0 : BIOMES[t.biome].defense;
  return biome + RELIEFS[t.relief].defense + (t.feature ? FEATURES[t.feature].defense : 0);
}

export function terrainName(t: TileTerrain): string {
  const b = BIOMES[t.biome];
  if (b.water) return t.feature ? `${FEATURES[t.feature].name} (${b.name})` : b.name;
  const base = t.relief === 'flat' ? b.name : `${b.name} ${RELIEFS[t.relief].name.toLowerCase()}`;
  return t.feature ? `${FEATURES[t.feature].name} · ${base}` : base;
}

// ---------- where features may appear (shared by the generator and tests) ----------

export interface FeatureRule {
  readonly biomes: readonly BiomeKey[];
  readonly reliefs: readonly ReliefKey[];
  readonly seaNeighbor?: 'required' | 'forbidden';   // shallow sea / ocean next to it
  readonly waterNeighbor?: 'forbidden';              // any water (incl. lakes) next to it
}

const ALL_LAND: readonly BiomeKey[] = (Object.keys(BIOMES) as BiomeKey[]).filter((b) => !BIOMES[b].water);
const LAND_NO_ICE = ALL_LAND.filter((b) => b !== 'iceSheet');

export const FEATURE_RULES: Record<FeatureKey, FeatureRule> = {
  marsh:      { biomes: LAND_NO_ICE.filter((b) => b !== 'hotDesert' && b !== 'coldDesert'), reliefs: ['flat'] },
  swamp:      { biomes: ['temperateForest', 'temperateRainforest', 'monsoonForest', 'jungle'], reliefs: ['flat'] },
  mangrove:   { biomes: ['jungle', 'monsoonForest', 'savanna'], reliefs: ['flat'], seaNeighbor: 'required' },
  // Peat builds up only where it is cool and wet enough that dead moss never rots.
  bog:        { biomes: ['tundra', 'taiga', 'temperateForest', 'temperateRainforest', 'prairie'], reliefs: ['flat'] },
  floodplain: { biomes: LAND_NO_ICE, reliefs: ['flat'] },
  oasis:      { biomes: ['hotDesert', 'coldDesert'], reliefs: ['flat'], waterNeighbor: 'forbidden' },
  volcano:    { biomes: ALL_LAND, reliefs: ['mountains'] },
  glacier:    { biomes: ALL_LAND, reliefs: ['mountains'] },
  reef:       { biomes: ['shallowSea'], reliefs: ['flat'] },
  kelp:       { biomes: ['shallowSea'], reliefs: ['flat'] },
};

// Whether `feature` may sit on this terrain, given what touches the tile.
export function featureAllowed(feature: FeatureKey, t: TileTerrain, touchesSea: boolean, touchesWater: boolean): boolean {
  const r = FEATURE_RULES[feature];
  if (!r.biomes.includes(t.biome) || !r.reliefs.includes(t.relief)) return false;
  if (r.seaNeighbor === 'required' && !touchesSea) return false;
  if (r.seaNeighbor === 'forbidden' && touchesSea) return false;
  if (r.waterNeighbor === 'forbidden' && touchesWater) return false;
  return true;
}
