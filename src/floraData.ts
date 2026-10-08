// What grows where: each biome and feature has 1-4 variants, each a mix of
// props (catalog kinds) with shares in % (summing to 100, tested) and a
// density in props per flat tile. Variants are picked per region of a biome
// (see flora.ts), limited by the landmass's flora realm and leaning toward
// the region's climate within the biome. From the "Props & Biome Variants"
// design doc.
//
// Placement modifiers (hills, mountains, river banks, coasts, lake shores,
// forest edges) live in vegetation.ts; their mixes are here.

import type { CatalogKind } from './propCatalog.ts';
import type { BiomeKey, FeatureKey } from './terrain.ts';

export const REALMS = ['northern', 'austral', 'oldWorld', 'newWorld'] as const;
export type Realm = typeof REALMS[number];
export const REALM_NAMES: Record<Realm, string> = { northern: 'Northern', austral: 'Austral', oldWorld: 'Old World', newWorld: 'New World' };

// A retint of the prop's leaf color: one color, or several picked per instance.
export type Tint = number | readonly number[];
// kind, share (%), leaf tint, size multiplier (stunted trees).
export type Entry = readonly [kind: CatalogKind, share: number, leaf?: Tint | undefined, size?: number | undefined];

export interface Variant {
  name: string;
  realms: readonly Realm[] | 'any';
  // Preferred place within the biome's climate on this map, -1..1 (colder /
  // drier .. warmer / wetter). Biome variants only.
  warm?: number;
  wet?: number;
  hills?: true;                   // used on (all) hill tiles of the biome, nowhere else
  maxLat?: number;                // degrees from the equator (hills variants)
  biomes?: readonly BiomeKey[];   // features: only over these biomes
  maxTemp?: number;               // °C
  density: number;
  mix: readonly Entry[];
}
export interface FloraSet { variants: readonly Variant[] }

const MOSS = 0x6a9a3a;
const LAUREL = 0x3f6a35;
const AUTUMN = [0xd2602a, 0xe0a030, 0xb8382a, 0xc8b040] as const;
const DRY = [0x9a9a40, 0xb08a3a, 0x8a9a45] as const;
const FUEGIAN = [0xa8452f, 0xc0603a, 0x8a6a3a] as const;
const GOLDEN = 0xd0b060, GREEN_GRASS = 0x8ab04a, SPINIFEX = 0xc8a050, PLUME = 0xe8e0c8, TUSSOCK = 0xa8a060;
const FEATHER = 0xb8c088, LICHEN = 0xc0c8a0, DWARF_WILLOW = 0x7a9a5a, CUSHION = 0x8a9a5a, TWISTED = 0x7a8a40;
const STUNTED = 0.6;

const N: readonly Realm[] = ['northern'], A: readonly Realm[] = ['austral'], O: readonly Realm[] = ['oldWorld'], W: readonly Realm[] = ['newWorld'];
type Extra = Partial<Pick<Variant, 'warm' | 'wet' | 'hills' | 'maxLat' | 'biomes' | 'maxTemp'>>;
const v = (name: string, realms: Variant['realms'], density: number, mix: readonly Entry[], extra: Extra = {}): Variant =>
  ({ name, realms, density, mix, ...extra });
const none = (name: string): FloraSet => ({ variants: [v(name, 'any', 0, [])] });

export const BIOME_FLORA: Record<BiomeKey, FloraSet> = {
  ocean: { variants: [
    v('Cold ocean', 'any', 0.3, [['iceFloe', 100]], { maxTemp: -1 }),
    v('Open ocean', 'any', 0, []),
  ] },
  shallowSea: none('Shallow sea'),
  lake: { variants: [v('Lake', 'any', 14, [['lilyPads', 100]])] },
  seaIce: { variants: [v('Sea ice', 'any', 4, [['iceFloe', 100]])] },
  iceSheet: { variants: [v('Ice sheet', 'any', 3, [['iceSerac', 70], ['boulder', 20], ['tor', 10]])] },
  tundra: { variants: [
    v('Shrub tundra', 'any', 30, [['spruce', 3, undefined, STUNTED], ['shrub', 30, DWARF_WILLOW], ['heather', 10], ['grassTuft', 20], ['moss', 27], ['boulder', 10]], { warm: 0.4 }),
    v('Fell field', 'any', 20, [['heather', 5], ['grassTuft', 15], ['moss', 45, LICHEN], ['boulder', 30], ['tor', 5]], { warm: -0.6, wet: -0.3 }),
    v('Wet tundra', N, 30, [['shrub', 8, DWARF_WILLOW], ['grassTuft', 25], ['cottonGrass', 30], ['moss', 32], ['boulder', 5]], { wet: 0.6 }),
    v('Subantarctic', A, 30, [['tallGrass', 50, TUSSOCK], ['moss', 30], ['boulder', 15], ['tor', 5]]),
  ] },
  taiga: { variants: [
    v('Dark taiga', 'any', 60, [['spruce', 50], ['fir', 20], ['birch', 4], ['berryBush', 4], ['moss', 12], ['snag', 4], ['fallenLog', 4], ['boulder', 2]], { wet: 0.4 }),
    v('Light taiga', N, 40, [['larch', 40], ['pine', 20], ['birch', 6], ['shrub', 8], ['moss', 14, LICHEN], ['snag', 4], ['fallenLog', 3], ['boulder', 5]], { warm: -0.6, wet: -0.5 }),
    v('Birch fringe', N, 50, [['spruce', 25], ['pine', 5], ['birch', 35], ['berryBush', 8], ['shrub', 7], ['grassTuft', 10], ['moss', 2], ['fallenLog', 5], ['boulder', 3]], { warm: 0.7 }),
    v('Fuegian', A, 50, [['southernBeech', 55, FUEGIAN], ['shrub', 10], ['moss', 15], ['snag', 6], ['fallenLog', 6], ['boulder', 8]]),
  ] },
  coldDesert: { variants: [
    v('Sagebrush basin', 'any', 20, [['juniper', 8], ['sagebrush', 55], ['grassTuft', 22, FEATHER], ['boulder', 15]], { wet: 0.3 }),
    v('Gobi', N, 10, [['saxaul', 25], ['dryBush', 20], ['grassTuft', 20, FEATHER], ['boulder', 30], ['rockSpire', 5]], { wet: -0.6 }),
    v('Joshua', W, 15, [['joshuaTree', 20], ['sagebrush', 25], ['dryBush', 20], ['grassTuft', 15, FEATHER], ['boulder', 20]]),
    v('Patagonian', A, 20, [['dryBush', 30, CUSHION], ['grassTuft', 55, TUSSOCK], ['boulder', 15]]),
  ] },
  steppe: { variants: [
    v('Feather grass', 'any', 35, [['shrub', 5], ['grassTuft', 72, FEATHER], ['flowers', 15], ['boulder', 8]]),
    v('Shrub steppe', N, 30, [['juniper', 5], ['sagebrush', 40], ['grassTuft', 45, FEATHER], ['boulder', 10]], { wet: -0.6 }),
    v('Forest-steppe', N, 40, [['birch', 12], ['pine', 6], ['shrub', 8], ['grassTuft', 55], ['flowers', 15], ['boulder', 4]], { wet: 0.7 }),
  ] },
  prairie: { variants: [
    v('Tallgrass', 'any', 45, [['oak', 3], ['shrub', 7], ['tallGrass', 65, GREEN_GRASS], ['flowers', 22], ['boulder', 3]], { wet: 0.3 }),
    v('Meadow', N, 50, [['beechMaple', 3], ['shrub', 10], ['grassTuft', 50], ['flowers', 33], ['boulder', 4]], { warm: -0.4 }),
    v('Oak parkland', N, 45, [['oak', 15], ['shrub', 12], ['grassTuft', 50], ['flowers', 18], ['boulder', 5]], { wet: 0.6 }),
    v('Pampas', A, 45, [['shrub', 5], ['tallGrass', 30, PLUME], ['grassTuft', 55], ['flowers', 7], ['boulder', 3]]),
  ] },
  temperateForest: { variants: [
    v('Oak-beech', N, 60, [['oak', 30], ['beechMaple', 28], ['birch', 5], ['shrub', 10], ['berryBush', 2], ['fernClump', 12], ['flowers', 5], ['fallenLog', 5], ['boulder', 3]], { warm: 0.4 }),
    v('Maple-birch', N, 60, [['beechMaple', 35, AUTUMN], ['birch', 18], ['pine', 10], ['spruce', 5], ['shrub', 8], ['berryBush', 3], ['fernClump', 10], ['fallenLog', 6], ['boulder', 5]], { warm: -0.5 }),
    v('Mixed pine', 'any', 60, [['oak', 5], ['beechMaple', 20], ['birch', 10], ['pine', 25], ['spruce', 12], ['shrub', 8], ['berryBush', 2], ['fernClump', 10], ['fallenLog', 5], ['boulder', 3]], { wet: -0.3 }),
    v('Eucalypt', A, 45, [['eucalyptus', 45], ['treeFern', 8], ['shrub', 15], ['grassTuft', 20], ['fallenLog', 7], ['boulder', 5]]),
  ] },
  temperateRainforest: { variants: [
    v('Cascadian', N, 75, [['giantCedar', 15], ['fir', 20], ['spruce', 15], ['beechMaple', 10, MOSS], ['fernClump', 22], ['moss', 8], ['fallenLog', 6], ['snag', 2], ['boulder', 2]], { warm: -0.3 }),
    v('Colchic', N, 65, [['fir', 5], ['beechMaple', 45, MOSS], ['shrub', 15, LAUREL], ['fernClump', 20], ['moss', 5], ['fallenLog', 6], ['snag', 2], ['boulder', 2]], { warm: 0.7 }),
    v('Valdivian', A, 70, [['southernBeech', 35], ['araucaria', 10], ['treeFern', 10], ['bamboo', 15], ['fernClump', 18], ['moss', 4], ['fallenLog', 5], ['snag', 1], ['boulder', 2]], { warm: -0.3 }),
    // Wet tropical hills are cool enough to count as temperate rainforest:
    // montane cloud forest.
    v('Cloud forest', 'any', 65, [['treeFern', 25], ['beechMaple', 35, MOSS], ['bamboo', 10], ['fernClump', 20], ['moss', 10]], { hills: true, maxLat: 28 }),
    v('Tasman', A, 70, [['southernBeech', 25], ['kauri', 12], ['treeFern', 25], ['fernClump', 20], ['moss', 10], ['fallenLog', 5], ['snag', 1], ['boulder', 2]], { warm: 0.5 }),
  ] },
  mediterranean: { variants: [
    v('Maquis', 'any', 45, [['olive', 15], ['cypress', 8], ['juniper', 5], ['shrub', 45, LAUREL], ['flowers', 7], ['grassTuft', 8], ['boulder', 10], ['tor', 2]], { wet: -0.3 }),
    v('Pine-oak woodland', N, 45, [['olive', 25], ['stonePine', 25], ['shrub', 25], ['flowers', 5], ['grassTuft', 12], ['boulder', 8]], { wet: 0.5 }),
    v('Chaparral', W, 40, [['oak', 8], ['juniper', 6], ['shrub', 50], ['flowers', 12], ['grassTuft', 14], ['boulder', 10]]),
    v('Fynbos', O, 40, [['shrub', 35], ['heather', 25], ['flowers', 22], ['grassTuft', 8], ['boulder', 7], ['tor', 3]]),
  ] },
  hotDesert: { variants: [
    v('Erg', 'any', 3, [['dryBush', 80], ['grassTuft', 20, SPINIFEX]], { wet: -0.6 }),
    v('Hamada', 'any', 8, [['dryBush', 30], ['boulder', 45], ['rockSpire', 15], ['tor', 10]], { wet: 0.2 }),
    v('Sonoran', W, 12, [['saguaro', 25], ['pricklyPear', 25], ['dryBush', 30], ['boulder', 15], ['rockSpire', 5]], { wet: 0.5 }),
    v('Succulent', O, 10, [['dragonTree', 8], ['euphorbia', 20], ['dryBush', 42], ['boulder', 20], ['tor', 10]], { wet: 0.5 }),
  ] },
  savanna: { variants: [
    v('Acacia', 'any', 40, [['acacia', 22], ['shrub', 10], ['tallGrass', 58, GOLDEN], ['termiteMound', 6], ['boulder', 3], ['tor', 1]], { wet: -0.3 }),
    v('Miombo', O, 45, [['acacia', 4], ['baobab', 6], ['beechMaple', 30, DRY], ['shrub', 12], ['tallGrass', 43, GOLDEN], ['termiteMound', 3], ['boulder', 2]], { wet: 0.5 }),
    v('Cerrado', W, 40, [['beechMaple', 12, DRY], ['fanPalm', 8], ['shrub', 30, TWISTED], ['tallGrass', 40, GOLDEN], ['termiteMound', 8], ['boulder', 2]]),
    v('Outback', A, 35, [['eucalyptus', 15], ['shrub', 15], ['tallGrass', 55, SPINIFEX], ['termiteMound', 10], ['boulder', 3], ['tor', 2]]),
  ] },
  monsoonForest: { variants: [
    v('Teak-sal', 'any', 60, [['beechMaple', 50, DRY], ['bamboo', 12], ['banana', 5], ['palm', 5], ['shrub', 13], ['tallGrass', 8], ['termiteMound', 2], ['fallenLog', 5]], { wet: -0.2 }),
    v('Bamboo forest', O, 70, [['beechMaple', 20, DRY], ['bamboo', 45], ['banana', 12], ['shrub', 8], ['fernClump', 10], ['fallenLog', 5]], { wet: 0.6 }),
    v('Thorn forest', W, 40, [['beechMaple', 20, DRY], ['acacia', 15], ['pricklyPear', 15], ['shrub', 30], ['tallGrass', 12], ['termiteMound', 3], ['boulder', 5]], { wet: -0.6 }),
  ] },
  jungle: { variants: [
    v('Lowland', 'any', 85, [['jungleTree', 40], ['kapok', 6], ['palm', 10], ['banana', 14], ['shrub', 7], ['fernClump', 18], ['fallenLog', 5]]),
    v('Várzea', W, 80, [['jungleTree', 30], ['kapok', 4], ['palm', 6], ['fanPalm', 25], ['banana', 10], ['fernClump', 18], ['fallenLog', 7]], { wet: 0.5 }),
    v('Dipterocarp', O, 80, [['jungleTree', 35], ['kapok', 15], ['palm', 8], ['banana', 8], ['bamboo', 6], ['shrub', 5], ['fernClump', 18], ['fallenLog', 5]]),
  ] },
};

// Feature variants: the first one whose biomes and realms match is used.
export const FEATURE_FLORA: Record<FeatureKey, FloraSet> = {
  marsh: { variants: [
    v('Tropical marsh', 'any', 45, [['papyrus', 45], ['reeds', 25], ['lilyPads', 15], ['tallGrass', 15, GREEN_GRASS]], { biomes: ['jungle', 'monsoonForest', 'savanna'] }),
    v('Temperate marsh', 'any', 45, [['reeds', 40], ['cattail', 25], ['grassTuft', 20], ['lilyPads', 10], ['willow', 5]]),
  ] },
  swamp: { variants: [
    v('Swamp forest', 'any', 55, [['jungleTree', 30], ['fanPalm', 20], ['reeds', 15], ['lilyPads', 15], ['fernClump', 15], ['fallenLog', 5]], { biomes: ['jungle'] }),
    v('Cypress swamp', 'any', 50, [['baldCypress', 40], ['reeds', 15], ['lilyPads', 15], ['fernClump', 10], ['stump', 10], ['snag', 5], ['fallenLog', 5]]),
  ] },
  mangrove: { variants: [v('Mangrove', 'any', 50, [['mangrove', 75], ['reeds', 10], ['coconutPalm', 8], ['stump', 7]])] },
  bog: { variants: [
    v('Palsa bog', 'any', 25, [['moss', 40], ['cottonGrass', 30], ['spruce', 10, undefined, STUNTED], ['snag', 10], ['boulder', 10]], { biomes: ['tundra', 'taiga'] }),
    v('Raised bog', 'any', 35, [['moss', 30], ['heather', 25], ['cottonGrass', 20], ['pine', 12, undefined, STUNTED], ['snag', 8], ['stump', 5]]),
  ] },
  floodplain: { variants: [
    v('Gallery floodplain', 'any', 30, [['tallGrass', 35, GOLDEN], ['reeds', 25], ['palm', 20], ['shrub', 15], ['poplar', 5]],
      { biomes: ['hotDesert', 'coldDesert', 'steppe', 'savanna', 'mediterranean'] }),
    v('Green floodplain', 'any', 30, [['tallGrass', 35, GREEN_GRASS], ['willow', 15], ['reeds', 15], ['flowers', 15], ['poplar', 10], ['cattail', 10]]),
  ] },
  oasis: { variants: [
    v('Fan palm oasis', W, 30, [['fanPalm', 50], ['shrub', 20], ['reeds', 15], ['pricklyPear', 15]]),
    v('Date palm oasis', 'any', 30, [['palm', 60], ['shrub', 15], ['reeds', 15], ['tallGrass', 10, GREEN_GRASS]]),
  ] },
  // Mountain features: the mix of the slopes between the tree line and the
  // bare upper part (vegetation.ts).
  volcano: { variants: [v('Volcano', 'any', 6, [['boulder', 35], ['rockSpire', 40], ['snag', 25]])] },
  glacier: { variants: [v('Glacier', 'any', 5, [['iceSerac', 60], ['scree', 40]])] },
  reef: { variants: [v('Coral reef', 'any', 30, [['coralHeads', 55], ['branchingCoral', 45]])] },
  kelp: { variants: [v('Kelp forest', 'any', 40, [['kelp', 100]])] },
};

// ---- placement modifiers' mixes ----
export const MOUNTAIN_SLOPES: Variant = v('Mountain slopes', 'any', 10, [['spruce', 30, undefined, STUNTED], ['boulder', 35], ['scree', 35]]);
// River banks, by the climate of the biome they cross.
export type BankClimate = 'temperate' | 'dry' | 'tropical' | 'cold';
export const BANK_CLIMATE: Record<BiomeKey, BankClimate> = {
  ocean: 'temperate', shallowSea: 'temperate', lake: 'temperate', seaIce: 'cold', iceSheet: 'cold',
  tundra: 'cold', taiga: 'cold', coldDesert: 'dry', steppe: 'dry', prairie: 'temperate',
  temperateForest: 'temperate', temperateRainforest: 'temperate', mediterranean: 'dry',
  hotDesert: 'dry', savanna: 'dry', monsoonForest: 'tropical', jungle: 'tropical',
};
export const RIVER_BANKS: Record<BankClimate, readonly Entry[]> = {
  temperate: [['willow', 40], ['poplar', 20], ['reeds', 25], ['cattail', 15]],
  dry: [['palm', 30], ['poplar', 10], ['reeds', 30], ['shrub', 10], ['tallGrass', 20, GREEN_GRASS]],
  tropical: [['palm', 25], ['banana', 25], ['reeds', 25], ['fernClump', 25]],
  cold: [['willow', 15, DWARF_WILLOW, STUNTED], ['shrub', 40, DWARF_WILLOW], ['reeds', 20], ['cottonGrass', 25]],
};
// Sea coasts: coconut palms leaning out to sea on warm coasts; wind-bent
// pines leaning inland and driftwood elsewhere.
export const WARM_COASTS: ReadonlySet<BiomeKey> = new Set(['jungle', 'monsoonForest', 'savanna', 'hotDesert']);
export const COASTS: Record<'warm' | 'cool', readonly Entry[]> = {
  warm: [['coconutPalm', 70], ['shrub', 30]],
  cool: [['pine', 45], ['shrub', 30], ['fallenLog', 25]],
};
export const LAKE_SHORES: Record<'warm' | 'cool', readonly Entry[]> = {
  warm: [['papyrus', 50], ['reeds', 50]],
  cool: [['reeds', 50], ['cattail', 50]],
};
// Forest edges facing open land: fewer canopy trees, more shrubs.
export const FOREST_FRINGE: readonly Entry[] = [['shrub', 15], ['berryBush', 5]];
export const HILL_ROCKS: readonly Entry[] = [['boulder', 3], ['tor', 2]];

export function realmAllows(v: Variant, realm: Realm | null): boolean {
  return v.realms === 'any' || (realm !== null && v.realms.includes(realm));
}
export const realmsLabel = (v: Variant): string =>
  v.realms === 'any' ? 'any realm' : v.realms.map((r) => REALM_NAMES[r]).join(', ');
