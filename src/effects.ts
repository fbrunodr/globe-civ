import { OUTPUT_KEYS, out, ZERO, addOut, type Output, type OutputKey, type ImprovementKey, type SpecialistKind } from './cities.ts';

// What techs, governments, policies, identity traits, religions and
// luxuries do to a civ, in one vocabulary, so they add up the same way
// wherever they come from. Lean on purpose: percentages, the capital, and
// per worked tile or specialist; never "per city", so that no empire's size
// is favoured by itself (wide pays upkeep, economy.ts; tall grows into its
// buildings and specialists).
//   yield          +pct% of a yield in every city
//   capital        flat yields in the capital
//   prod           +pct% production toward a kind of item
//   combat         +pct% strength, attacking and defending
//   homeDefense    +pct% strength defending in the civ's own territory
//   vsCities       +pct% strength attacking cities
//   cityStrength   +pct% to its cities' own strength (their strikes and walls)
//   upkeep         +pct% (negative: less) on cities' upkeep
//   buildingUpkeep +pct% on buildings' upkeep
//   freeUnits      units kept without upkeep
//   moves          +n moves for land units (only mounted ones, if `mounted`)
//   heal           extra HP a unit recovers each turn it rests
//   tilePrice      +pct% on buying tiles
//   buyCost        +pct% on buying items with gold
//   growth         +pct% on the food a city needs to grow (negative: less)
//   border         +pct% culture toward a city's borders
//   wealth         +pct points of production turned to gold with nothing to build
//   improvement    flat yields on every worked tile with an improvement
//   resource       flat yields on every worked tile with a resource of a kind
//   specialist     flat yields for every specialist of a kind
//   luxury         flat yields in the capital for each kind of luxury owned
//   follower       flat yields in each city following a religion (religion.ts)
//   pressure       +pct% to the religious pressure of its cities
//   tithe          +n gold to a religion's founder per city following it
export type ProdTarget = 'military' | 'melee' | 'ranged' | 'mounted' | 'siege' | 'settler' | 'building' | 'wonder' | 'all';
export type ResourceKindTarget = 'bonus' | 'luxury' | 'strategic';
export type Effect =
  | { readonly k: 'yield'; readonly y: OutputKey; readonly pct: number }
  | { readonly k: 'capital'; readonly o: Output }
  | { readonly k: 'prod'; readonly target: ProdTarget; readonly pct: number }
  | { readonly k: 'combat'; readonly pct: number }
  | { readonly k: 'homeDefense'; readonly pct: number }
  | { readonly k: 'vsCities'; readonly pct: number }
  | { readonly k: 'cityStrength'; readonly pct: number }
  | { readonly k: 'upkeep'; readonly pct: number }
  | { readonly k: 'buildingUpkeep'; readonly pct: number }
  | { readonly k: 'freeUnits'; readonly n: number }
  | { readonly k: 'moves'; readonly n: number; readonly mounted?: true }
  | { readonly k: 'heal'; readonly n: number }
  | { readonly k: 'tilePrice'; readonly pct: number }
  | { readonly k: 'buyCost'; readonly pct: number }
  | { readonly k: 'growth'; readonly pct: number }
  | { readonly k: 'border'; readonly pct: number }
  | { readonly k: 'wealth'; readonly pct: number }
  | { readonly k: 'improvement'; readonly imp: ImprovementKey; readonly o: Output }
  | { readonly k: 'resource'; readonly kind: ResourceKindTarget; readonly o: Output }
  | { readonly k: 'specialist'; readonly kind: SpecialistKind; readonly o: Output }
  | { readonly k: 'luxury'; readonly o: Output }
  | { readonly k: 'follower'; readonly o: Output }
  | { readonly k: 'pressure'; readonly pct: number }
  | { readonly k: 'tithe'; readonly n: number };

type Pct = 'combat' | 'homeDefense' | 'vsCities' | 'cityStrength' | 'upkeep' | 'buildingUpkeep' | 'tilePrice' | 'buyCost' | 'growth' | 'border' | 'wealth' | 'pressure';
type Count = 'freeUnits' | 'heal' | 'tithe';

// Builders, for the tables.
export const yieldPct = (y: OutputKey, pct: number): Effect => ({ k: 'yield', y, pct });
export const capital = (o: Partial<Output>): Effect => ({ k: 'capital', o: out(o) });
export const prodPct = (target: ProdTarget, pct: number): Effect => ({ k: 'prod', target, pct });
export const pct = (k: Pct, n: number): Effect => ({ k, pct: n }) as Effect;
export const count = (k: Count, n: number): Effect => ({ k, n }) as Effect;
export const onImprovement = (imp: ImprovementKey, o: Partial<Output>): Effect => ({ k: 'improvement', imp, o: out(o) });
export const onResource = (kind: ResourceKindTarget, o: Partial<Output>): Effect => ({ k: 'resource', kind, o: out(o) });
export const perSpecialist = (kind: SpecialistKind, o: Partial<Output>): Effect => ({ k: 'specialist', kind, o: out(o) });
export const perLuxury = (o: Partial<Output>): Effect => ({ k: 'luxury', o: out(o) });
export const moves = (n: number, mounted = false): Effect => (mounted ? { k: 'moves', n, mounted: true } : { k: 'moves', n });

// The sum of a kind of effect (a percentage, or a count).
export function total(effects: readonly Effect[], k: Pct | Count): number {
  let n = 0;
  for (const e of effects) {
    if (e.k !== k) continue;
    n += 'pct' in e ? e.pct : 'n' in e ? e.n : 0;
  }
  return n;
}
// The percentage added to a yield in every city.
export function yieldBonus(effects: readonly Effect[], y: OutputKey): number {
  let n = 0;
  for (const e of effects) if (e.k === 'yield' && e.y === y) n += e.pct;
  return n;
}
// The percentage added to production toward an item of these kinds.
export function prodBonus(effects: readonly Effect[], kinds: readonly ProdTarget[]): number {
  let n = 0;
  for (const e of effects) if (e.k === 'prod' && (e.target === 'all' || kinds.includes(e.target))) n += e.pct;
  return n;
}
// Extra moves for a land unit.
export function movesBonus(effects: readonly Effect[], mounted: boolean): number {
  let n = 0;
  for (const e of effects) if (e.k === 'moves' && (!e.mounted || mounted)) n += e.n;
  return n;
}
// Flat yields of a kind, summed.
export function flat(effects: readonly Effect[], k: 'capital' | 'follower' | 'luxury'): Output {
  let sum = ZERO;
  for (const e of effects) if (e.k === k) sum = addOut(sum, e.o);
  return sum;
}
// Flat yields on a worked tile with this improvement (null: none) and resource kind (null: none).
export function tileBonus(effects: readonly Effect[], imp: ImprovementKey | null, res: ResourceKindTarget | null): Output {
  let sum = ZERO;
  for (const e of effects) {
    if ((e.k === 'improvement' && e.imp === imp) || (e.k === 'resource' && e.kind === res)) sum = addOut(sum, e.o);
  }
  return sum;
}
// Flat yields per specialist of a kind.
export function specialistBonus(effects: readonly Effect[], kind: SpecialistKind): Output {
  let sum = ZERO;
  for (const e of effects) if (e.k === 'specialist' && e.kind === kind) sum = addOut(sum, e.o);
  return sum;
}

// A short description of an effect, for the panels.
export const YIELD_NAME: Record<OutputKey, string> = { food: 'food', prod: 'production', gold: 'gold', science: 'science', culture: 'culture', faith: 'faith', cohesion: 'cohesion' };
const TARGET_NAME: Record<ProdTarget, string> = { military: 'military units', melee: 'melee units', ranged: 'ranged units', mounted: 'mounted units', siege: 'siege units', settler: 'Settlers', building: 'buildings', wonder: 'wonders', all: 'everything' };
const IMPROVEMENT_NAME: Record<ImprovementKey, string> = { farm: 'Farm', mine: 'Mine', camp: 'Camp', quarry: 'Quarry', wetland: 'Wetland harvest', boats: 'Fishing boats' };
const SPECIALIST_NAME: Record<SpecialistKind, string> = { scientist: 'Scientist', merchant: 'Merchant', engineer: 'Engineer', artist: 'Artist' };
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const flats = (o: Output) => OUTPUT_KEYS.filter((y) => o[y]).map((y) => `${sign(o[y])} ${YIELD_NAME[y]}`).join(', ');
export function describe(e: Effect): string {
  switch (e.k) {
    case 'yield': return `${sign(e.pct)}% ${YIELD_NAME[e.y]}`;
    case 'capital': return `${flats(e.o)} in the capital`;
    case 'prod': return `${sign(e.pct)}% production toward ${TARGET_NAME[e.target]}`;
    case 'combat': return `${sign(e.pct)}% combat strength`;
    case 'homeDefense': return `${sign(e.pct)}% strength defending in your territory`;
    case 'vsCities': return `${sign(e.pct)}% strength attacking cities`;
    case 'cityStrength': return `${sign(e.pct)}% city defense`;
    case 'upkeep': return `${sign(e.pct)}% city upkeep`;
    case 'buildingUpkeep': return `${sign(e.pct)}% building upkeep`;
    case 'freeUnits': return `${sign(e.n)} units without upkeep`;
    case 'moves': return `${sign(e.n)} move${e.n === 1 ? '' : 's'} for ${e.mounted ? 'mounted' : 'land'} units`;
    case 'heal': return `${sign(e.n)} HP healed per turn`;
    case 'tilePrice': return `${sign(e.pct)}% tile purchase cost`;
    case 'buyCost': return `${sign(e.pct)}% gold purchase cost`;
    case 'growth': return `${sign(e.pct)}% food needed to grow`;
    case 'border': return `${sign(e.pct)}% border growth`;
    case 'wealth': return `${sign(e.pct)}% more gold from idle production`;
    case 'improvement': return `${flats(e.o)} on each worked ${IMPROVEMENT_NAME[e.imp]}`;
    case 'resource': return `${flats(e.o)} on each worked ${e.kind} resource`;
    case 'specialist': return `${flats(e.o)} per ${SPECIALIST_NAME[e.kind]}`;
    case 'luxury': return `${flats(e.o)} in the capital per luxury owned`;
    case 'follower': return `${flats(e.o)} in each city following it`;
    case 'pressure': return `${sign(e.pct)}% religious pressure`;
    case 'tithe': return `${sign(e.n)} gold per city following your religion`;
  }
}
export const describeAll = (fx: readonly Effect[]): string => fx.map(describe).join('; ');
