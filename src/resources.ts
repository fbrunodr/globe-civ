import { out, OUTPUT_KEYS, type Output, type ImprovementKey } from './cities.ts';
import { BIOMES, type BiomeKey, type FeatureKey, type ReliefKey } from './terrain.ts';
import type { Globe } from './goldberg.ts';
import { mulberry32 } from './rng.ts';
import type { TechKey } from './techs.ts';

// Resources, after Civ IV's: with lean terrain (terrain.ts), they are what
// makes a city site good.
//   bonus      more food or production on the tile
//   luxury     gold and culture or faith on the tile; and the first copy
//              of each kind a civ has (its own, or bought in a trade) gives
//              the whole civ its `empire` bonus every turn: cohesion above
//              all (a people content with its goods holds together), some
//              culture, faith, science or gold. Growing with the era
//              (LUXURY_ERA_SCALE), not with the copies: the spares are for
//              trade (game.ts: deals)
//   strategic  a little production on the tile, and needed to build some
//              units and buildings (rules.ts, cities.ts): Horses, Iron,
//              Niter, Coal, Oil. Each is hidden until a tech reveals it
//              (`reveal`): before then a civ neither sees it nor gets anything
//              from it.
// A resource's yield counts once its tile is worked (or is a city's center);
// a strategic or luxury one is the civ's while it owns the tile (borders
// reach farther than citizens work: cities.ts).
//
// Scarce on purpose, as in Civ IV: about one land tile in twelve has one,
// so a good site is worth fighting or racing for. Placement
// (placeResources) is a pure function of the map and the seed, spread so no
// part of the world is favoured but the barren (deserts, tundra, ice have
// little): bonus resources scattered by land type, luxuries and strategics
// in small clusters; then every start is given food and a luxury close by,
// and Horses or Iron (one of the two) within reach of a second city (FAIR).
// The later strategics are never promised.

export type ResourceKind = 'bonus' | 'luxury' | 'strategic';
export interface ResourceDef {
  readonly name: string;
  readonly kind: ResourceKind;
  readonly abbr: string;    // its badge on the map
  readonly yields: Output;
  readonly biomes: readonly BiomeKey[];
  readonly reliefs: readonly ReliefKey[];
  readonly features?: readonly FeatureKey[]; // also on these features (any biome)
  readonly reveal?: TechKey;                  // hidden until its owner knows this
  readonly empire?: Output;                   // a luxury's: to the whole civ, for its first copy
  readonly temp?: readonly [number, number];  // only where the mean annual temperature (°C) is in this range
}
const r = (name: string, kind: ResourceKind, abbr: string, yields: Parameters<typeof out>[0], biomes: readonly BiomeKey[], reliefs: readonly ReliefKey[] = ['flat'], features?: readonly FeatureKey[], reveal?: TechKey): ResourceDef =>
  ({ name, kind, abbr, yields: out(yields), biomes, reliefs, ...(features ? { features } : {}), ...(reveal ? { reveal } : {}) });
// (A sea resource's waters: `temp`, °C.)
const sea = (d: ResourceDef, temp: readonly [number, number]): ResourceDef => ({ ...d, temp });
const lux = (name: string, abbr: string, yields: Parameters<typeof out>[0], empire: Parameters<typeof out>[0], biomes: readonly BiomeKey[], reliefs: readonly ReliefKey[] = ['flat'], features?: readonly FeatureKey[]): ResourceDef =>
  ({ ...r(name, 'luxury', abbr, yields, biomes, reliefs, features), empire: out(empire) });

const WARM_FOREST: BiomeKey[] = ['jungle', 'monsoonForest'];
const COOL_FOREST: BiomeKey[] = ['taiga', 'temperateForest', 'temperateRainforest'];
const OPEN: BiomeKey[] = ['prairie', 'steppe', 'savanna', 'mediterranean'];
// The seas (mean annual °C): cool below SEA_COOL (salmon), warm above it
// (tuna, pearls, coral); whales keep out of the warmest, above SEA_WARM.
const SEA_COOL = 20, SEA_WARM = 23;

export const RESOURCES = {
  // ---- bonus ----
  wheat:   r('Wheat', 'bonus', 'Wh', { food: 2 }, ['prairie', 'steppe', 'mediterranean'], ['flat'], ['floodplain']),
  // (Rice only in wet ground: grown in paddies, its wetland flooded.)
  rice:    r('Rice', 'bonus', 'Ri', { food: 2 }, [], ['flat'], ['marsh', 'swamp']),
  maize:   r('Maize', 'bonus', 'Mz', { food: 2 }, ['savanna', 'temperateForest', 'prairie'], ['flat']),
  bananas: r('Bananas', 'bonus', 'Ba', { food: 2 }, WARM_FOREST, ['flat', 'hills']),
  cattle:  r('Cattle', 'bonus', 'Ca', { food: 1, prod: 1 }, OPEN, ['flat']),
  sheep:   r('Sheep', 'bonus', 'Sh', { food: 1, prod: 1 }, ['steppe', 'prairie', 'tundra', 'mediterranean', 'coldDesert'], ['hills']),
  deer:    r('Deer', 'bonus', 'De', { food: 1, prod: 1 }, [...COOL_FOREST, 'tundra'], ['flat', 'hills']),
  stone:   r('Stone', 'bonus', 'St', { prod: 2 }, ['hotDesert', 'coldDesert', 'steppe', 'tundra', 'mediterranean', 'prairie'], ['hills']),
  // (The sea's: a catch by its waters, salmon in the cold, tuna in the
  // warm, trout in lakes; crabs anywhere along the coast; whales, for their
  // meat, oil and bone, in all but the warmest seas.)
  salmon:  sea(r('Salmon', 'bonus', 'Sm', { food: 2 }, ['shallowSea'], ['flat'], ['kelp']), [-Infinity, SEA_COOL]),
  tuna:    sea(r('Tuna', 'bonus', 'Tu', { food: 1, gold: 1 }, ['shallowSea'], ['flat'], ['reef']), [SEA_COOL, Infinity]),
  trout:   r('Trout', 'bonus', 'Tr', { food: 2 }, ['lake']),
  crabs:   r('Crabs', 'bonus', 'Cb', { food: 1, gold: 1 }, ['shallowSea'], ['flat'], ['reef', 'kelp']),
  whales:  sea(r('Whales', 'bonus', 'Wl', { food: 1, prod: 1 }, ['shallowSea'], ['flat'], ['kelp']), [-Infinity, SEA_WARM]),
  copper:  r('Copper', 'bonus', 'Cu', { prod: 1, gold: 1 }, ['savanna', 'steppe', 'hotDesert', 'temperateForest', 'jungle'], ['hills']),
  // ---- luxury ----
  wine:    lux('Wine', 'Wn', { gold: 1, culture: 1 }, { cohesion: 1, culture: 1 }, ['mediterranean', 'temperateForest', 'prairie'], ['hills', 'flat']),
  incense: lux('Incense', 'In', { gold: 1, faith: 1 }, { cohesion: 1, faith: 1 }, ['hotDesert', 'mediterranean', 'savanna'], ['flat'], ['oasis']),
  silk:    lux('Silk', 'Si', { gold: 2 }, { cohesion: 2 }, ['temperateForest', 'monsoonForest', 'temperateRainforest'], ['flat']),
  spices:  lux('Spices', 'Sp', { food: 1, gold: 1 }, { cohesion: 2 }, WARM_FOREST, ['flat', 'hills']),
  furs:    lux('Furs', 'Fu', { prod: 1, gold: 1 }, { cohesion: 2 }, ['taiga', 'tundra'], ['flat', 'hills']),
  ivory:   lux('Ivory', 'Iv', { prod: 1, gold: 1 }, { cohesion: 1, culture: 1 }, ['savanna', 'jungle'], ['flat']),
  dyes:    lux('Dyes', 'Dy', { gold: 1, culture: 1 }, { cohesion: 1, culture: 1 }, ['jungle', 'temperateRainforest', 'monsoonForest'], ['flat']),
  gold:    lux('Gold ore', 'Au', { gold: 3 }, { cohesion: 1, gold: 2 }, ['hotDesert', 'coldDesert', 'steppe', 'tundra', 'savanna', 'temperateForest', 'taiga', 'mediterranean'], ['hills']),
  gems:    lux('Gems', 'Ge', { gold: 2, culture: 1 }, { cohesion: 1, culture: 1 }, ['jungle', 'monsoonForest', 'savanna', 'tundra'], ['hills']),
  pearls:  sea(lux('Pearls', 'Pe', { gold: 2 }, { cohesion: 1, culture: 1 }, ['shallowSea'], ['flat'], ['reef']), [SEA_COOL, Infinity]),
  coral:   sea(lux('Coral', 'Cr', { gold: 1, culture: 1 }, { cohesion: 1, culture: 1 }, [], ['flat'], ['reef']), [SEA_COOL, Infinity]),
  salt:    lux('Salt', 'Sa', { food: 1, gold: 1 }, { cohesion: 2 }, ['hotDesert', 'coldDesert', 'steppe'], ['flat']),
  cotton:  lux('Cotton', 'Ct', { gold: 2 }, { cohesion: 2 }, ['savanna', 'mediterranean', 'prairie'], ['flat'], ['floodplain']),
  tea:     lux('Tea', 'Te', { gold: 1, science: 1 }, { cohesion: 1, science: 1 }, ['monsoonForest', 'temperateRainforest'], ['hills', 'flat']),
  amber:   lux('Amber', 'Am', { gold: 1, culture: 1 }, { cohesion: 1, culture: 1 }, ['taiga', 'temperateForest'], ['flat']),
  // ---- strategic ----
  horses:  r('Horses', 'strategic', 'Ho', { food: 1, prod: 1 }, OPEN, ['flat'], undefined, 'animalHusbandry'),
  iron:    r('Iron', 'strategic', 'Fe', { prod: 2 }, [...OPEN, ...COOL_FOREST, ...WARM_FOREST, 'tundra', 'hotDesert', 'coldDesert'], ['hills'], undefined, 'bronzeWorking'),
  niter:   r('Niter', 'strategic', 'Ni', { prod: 1, food: 1 }, ['hotDesert', 'coldDesert', 'steppe', 'savanna', 'prairie', 'mediterranean'], ['flat', 'hills'], undefined, 'gunpowder'),
  coal:    r('Coal', 'strategic', 'Co', { prod: 2 }, [...COOL_FOREST, 'steppe', 'prairie', 'tundra', 'mediterranean', 'savanna'], ['hills'], undefined, 'industrialization'),
  // (And offshore, under a shallow sea: a platform's well.)
  oil:     r('Oil', 'strategic', 'Oi', { prod: 1, gold: 1 }, ['hotDesert', 'coldDesert', 'tundra', 'steppe', 'taiga', 'jungle', 'savanna', 'shallowSea'], ['flat'], ['marsh', 'swamp'], 'refining'),
} satisfies Record<string, ResourceDef>;
export type ResourceKey = keyof typeof RESOURCES;
export const RESOURCE_KEYS = Object.keys(RESOURCES) as ResourceKey[];
export const resourceDef = (k: ResourceKey): ResourceDef => RESOURCES[k];
// How each resource is worked: its tile's improvement, whatever the land
// (cities.ts improvementFor) once its owner knows of it. Grain is farmed,
// rice grown in paddies, animals pastured or hunted, ores and gems mined,
// tree and bush crops planted, the sea's catch, pearls and coral taken by
// boat; oil drawn by a well (offshore, a platform's).
export const RESOURCE_IMPROVEMENT: Record<ResourceKey, ImprovementKey> = {
  wheat: 'farm', rice: 'wetland', maize: 'farm', bananas: 'plantation', cattle: 'pasture', sheep: 'pasture', deer: 'camp',
  salmon: 'boats', tuna: 'boats', trout: 'boats', crabs: 'boats', whales: 'boats', coral: 'boats',
  stone: 'quarry', copper: 'mine',
  wine: 'plantation', incense: 'plantation', silk: 'plantation', spices: 'plantation', furs: 'camp', ivory: 'camp', dyes: 'plantation',
  gold: 'mine', gems: 'mine', pearls: 'boats', salt: 'mine', cotton: 'plantation', tea: 'plantation', amber: 'camp',
  horses: 'pasture', iron: 'mine', niter: 'mine', coal: 'mine', oil: 'well',
};
export const LUXURY_KEYS = RESOURCE_KEYS.filter((k) => RESOURCES[k].kind === 'luxury');
export type StrategicKey = 'horses' | 'iron' | 'niter' | 'coal' | 'oil';
// A luxury's empire bonus, by its civ's era (so it keeps mattering).
export const LUXURY_ERA_SCALE = [1, 1.5, 2, 3, 4, 5, 6] as const;
export const empireBonus = (k: ResourceKey, era: number): Output => {
  const e = RESOURCES[k].empire ?? out(), f = LUXURY_ERA_SCALE[Math.min(era, LUXURY_ERA_SCALE.length - 1)]!;
  return out(Object.fromEntries(OUTPUT_KEYS.map((y) => [y, Math.floor(e[y] * f)])));
};

// Density: the chance a fitting tile holds a bonus resource; a cluster of
// each luxury and strategic per FIT_PER_CLUSTER of the tiles it fits.
// (Measured on generated maps, test S3: about 8% of land tiles hold one.)
const BONUS_CHANCE = 0.035;
const FIT_PER_CLUSTER = { luxury: 700, strategic: 420 } as const;
const CLUSTER = [1, 3] as const; // tiles a cluster has
// What fits at sea counts this much against land for a kind found on both
// (oil): the shallow seas are wide, and would otherwise take most of it.
const SEA_FIT = 0.6;
// What every start gets within reach (tiles): a bonus resource (food, its
// first city's), a luxury, and Horses or Iron (a second city's): one of
// the two, turn about by start. The other, like every later strategic, is
// to be found, traded for or taken, as in Civ IV: what a civ can field
// follows from the land it holds.
const FAIR = { bonus: { count: 1, reach: 2 }, luxury: { count: 1, reach: 3 }, strategic: { count: 1, reach: 6 } } as const;

export interface ResourceMap {
  readonly at: (ResourceKey | null)[];
}
interface TerrainView {
  readonly biome: readonly BiomeKey[];
  readonly relief: readonly ReliefKey[];
  readonly feature: readonly (FeatureKey | null)[];
  readonly temperature?: ArrayLike<number>; // mean annual °C (mapgen.ts): a sea resource's waters
}

export const fitsResource = (k: ResourceKey, m: TerrainView, t: number): boolean => {
  const d = RESOURCES[k] as ResourceDef, f = m.feature[t];
  if (f === 'volcano' || f === 'glacier' || f === 'bog') return false;
  if (d.temp && m.temperature) { const c = m.temperature[t]!; if (c < d.temp[0] || c >= d.temp[1]) return false; }
  if (f && d.features?.includes(f)) return true;
  if (f && f !== 'reef' && f !== 'kelp') return false;
  return d.biomes.includes(m.biome[t]!) && d.reliefs.includes(m.relief[t]!);
};

export function placeResources(globe: Globe, m: TerrainView, starts: readonly number[], seed: number): ResourceMap {
  const N = globe.tiles.length, rand = mulberry32(seed ^ 0x5e5011);
  const at: (ResourceKey | null)[] = new Array(N).fill(null);
  const startSet = new Set(starts);
  const free = (t: number) => at[t] === null && !startSet.has(t);
  // Clusters of each luxury and strategic: a seed tile and fitting tiles round it.
  for (const k of RESOURCE_KEYS) {
    const kind = RESOURCES[k].kind;
    if (kind === 'bonus') continue;
    const fit: number[] = [];
    for (let t = 0; t < N; t++) if (fitsResource(k, m, t)) fit.push(t);
    const sea = fit.filter((t) => BIOMES[m.biome[t]!].water).length, mixed = sea > 0 && sea < fit.length;
    const weight = mixed ? fit.length - sea + SEA_FIT * sea : fit.length;
    const clusters = Math.max(1, Math.round(weight / FIT_PER_CLUSTER[kind]));
    // (A seed drawn at sea, for a kind also on land, kept only SEA_FIT of the time.)
    const draw = () => { let s = fit[Math.floor(rand() * fit.length)]!; while (mixed && BIOMES[m.biome[s]!].water && rand() >= SEA_FIT) s = fit[Math.floor(rand() * fit.length)]!; return s; };
    for (let i = 0; i < clusters && fit.length; i++) {
      const s = draw();
      const want = CLUSTER[0] + Math.floor(rand() * (CLUSTER[1] - CLUSTER[0] + 1));
      const queue = [s], seen = new Set([s]);
      let placed = 0;
      while (queue.length && placed < want) {
        const t = queue.shift()!;
        if (free(t) && fitsResource(k, m, t)) { at[t] = k; placed++; }
        for (const n of globe.tiles[t]!.neighbors) if (!seen.has(n) && rand() < 0.7) { seen.add(n); queue.push(n); }
      }
    }
  }
  // Bonus resources, scattered: each fitting free tile, by chance.
  const bonus = RESOURCE_KEYS.filter((k) => RESOURCES[k].kind === 'bonus');
  for (let t = 0; t < N; t++) {
    if (!free(t) || rand() >= BONUS_CHANCE) continue;
    const kinds = bonus.filter((k) => fitsResource(k, m, t));
    if (kinds.length) at[t] = kinds[Math.floor(rand() * kinds.length)]!;
  }
  // Every start gets what it lacks within reach: a fitting free tile, the
  // nearest rings first.
  const ring = (s: number, reach: number) => {
    const dist = new Map<number, number>([[s, 0]]);
    let frontier = [s];
    for (let d = 1; d <= reach; d++) {
      const next: number[] = [];
      for (const f of frontier) for (const n of globe.tiles[f]!.neighbors) if (!dist.has(n)) { dist.set(n, d); next.push(n); }
      frontier = next;
    }
    return [...dist.keys()].filter((t) => t !== s);
  };
  for (const s of starts) {
    const give = (kinds: readonly ResourceKey[], reach: number, count: number) => {
      const near = ring(s, reach);
      let have = near.filter((t) => at[t] !== null && kinds.includes(at[t]!)).length;
      const order = [...near].sort(() => rand() - 0.5);
      for (const t of order) {
        if (have >= count) break;
        if (!free(t)) continue;
        const ks = kinds.filter((k) => fitsResource(k, m, t));
        if (!ks.length) continue;
        at[t] = ks[Math.floor(rand() * ks.length)]!;
        have++;
      }
    };
    give(bonus, FAIR.bonus.reach, FAIR.bonus.count);
    give(LUXURY_KEYS, FAIR.luxury.reach, FAIR.luxury.count);
    // (Horses or Iron, not both: the other is a neighbour's, to trade for or to take.)
    give([(starts.indexOf(s) + seed) % 2 === 0 ? 'horses' : 'iron'], FAIR.strategic.reach, FAIR.strategic.count);
  }
  return { at };
}
