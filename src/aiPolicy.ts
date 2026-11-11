// How a computer civ decides: its policy. The decisions themselves are
// ai.ts's (what a city builds, where settlers go, when to go to war, what
// to research); a policy is the numbers those decisions turn on (its
// genes): how many cities to want, how large an army, how sure of a fight
// before closing in, what a tech's unlocks are worth... One civ differs
// from another only by its policy (and its bent, ai.ts: warlike or builder,
// which leans the same numbers one way or the other).
//
// Policies are not written by hand: they are bred (scripts/train.ts).
// Policies play whole games against each other (scripts/arena.ts), those
// that do best are kept and varied, and so on, generation after
// generation. The game's levels of difficulty are champions from along
// that road (aiLevels.json): the first generations for the easy levels,
// the last for the hardest. Every level plays by the same rules as the
// player: no level is given anything, or spared anything.

import levels from './aiLevels.json';

// Each gene: the least and the most it may be, and what it was before any breeding.
export const GENES = {
  cityTarget: [2, 16, 6],          // cities (and settlers on their way) it wants before it stops settling
  settleReach: [4, 12, 7],         // how far a settler looks for a site (tiles)
  settleDist: [0, 4, 1.5],         // what each tile of the way takes off a site's worth
  siteResource: [0, 6, 0],         // what each resource within two tiles adds to a site's worth (one it lacks: twice)
  workerPop: [1.5, 6, 3],          // citizens to a worker
  workerResource: [0, 10, 4],      // what a resource adds to a tile's worth to a worker
  armyBase: [0, 6, 2],             // the army it wants: this many units...
  armyPerCity: [0.5, 5, 2],        // ...and this many more a city
  armyWar: [1, 3, 1],              // times this while at war,
  armyThreat: [1, 3, 1],           // and times this while a civ it has met is hostile toward it (as it reads them: ai.ts attitude)
  rangedShare: [0, 0.7, 0.35],     // of its land army, the share of shooters,
  mountedShare: [0, 0.5, 0.15],    // of horse and armour,
  siegeShare: [0, 0.3, 0.12],      // of engines (a third of it while no city is to be taken);
  navyShare: [0, 0.25, 0.08],      // of what it builds for war, the share of ships,
  airShare: [0, 0.25, 0.07],       // and of aircraft
  // What a city builds: each kind's pull (times how much it is needed: ai.ts chooseBuild); the strongest wins.
  wSettle: [0, 2, 1],              // settlers, while it wants more cities
  wWorker: [0, 2, 1.2],            // workers, while land waits to be improved
  wArmy: [0, 2, 1],                // units, while the army is short of what it wants
  wBuild: [0, 2, 0.8],             // buildings
  wWonder: [0, 1.5, 0.4],          // a wonder, in a grown city at peace
  wWalls: [0, 1.5, 0.4],           // walls
  scoutRate: [0, 0.6, 0.2],        // a scout's pull, while it has none out and land near the city is unknown:
  scoutUnknown: [0.05, 0.8, 0.25], // more than this share of the land within ten tiles
  attackOdds: [0.4, 0.9, 0.6],     // the chance of winning a fight to the end it wants before closing in
  assaultOdds: [-0.25, 0.15, -0.05], // added to it for an army assaulting its city
  retreatHp: [10, 60, 35],         // a unit hurt below this falls back
  musterShare: [0.4, 1, 0.7],      // the share of an army that must have gathered before it moves on
  offensiveSpare: [1, 10, 3],      // units out of garrison before it marches on a city
  warAfter: [10, 150, 45],         // no war before this turn
  warChance: [0, 0.3, 0.05],       // the chance a turn it declares one, with a target
  warRatio: [0.8, 3, 1.25],        // how much stronger than its target it must be
  peaceRatio: [0.3, 1.2, 0.8],     // it sues for peace once weaker than this of its enemy
  truceRespect: [0, 1, 0.5],       // how much a truce still running holds it back (1: it never breaks one)
  warTech: [-1.5, 1.5, 0],         // how its lead in techs over a civ moves it to war on it (a power of the ratio; below 0: it goes for the more learned),
  warProd: [-1.5, 1.5, 0],         // and its lead in production
  warHostile: [-1, 2, 0],          // how much a civ's hostility toward it draws it to strike first (below 0: it keeps clear)
  techUnits: [0, 3, 1.2],          // what a tech's (or politics') units are worth to it,
  techBuildings: [0, 3, 1.15],     // its buildings,
  techWonders: [0, 3, 0.75],       // its wonders,
  techReveal: [0, 4, 0],           // a strategic resource it reveals,
  techEffects: [0, 3, 0],          // each of its other effects (better farms, mines...)
  techImprove: [0, 4, 1.5],        // each resource it holds that the tech would let it improve
  techCheap: [0.4, 1.6, 1],        // how much a tech's cost counts against it (1: worth per cost; less: the dear ones sooner)
  policyMilitary: [0, 4, 2],       // what a military policy card is worth,
  policyEconomic: [0, 4, 2.5],     // an economic one,
  policySocial: [0, 4, 1.5],       // a social one
  goldReserve: [30, 600, 120],     // gold it keeps before buying
  buyShare: [0.1, 1, 0.33],        // the most of its gold one purchase may take
  upgradeReserve: [0, 300, 60],    // gold it keeps over an upgrade's price
  pillageRate: [0, 1, 0.6],        // how readily a unit on enemy fields burns them
} as const satisfies Record<string, readonly [number, number, number]>;
export type Gene = keyof typeof GENES;
export const GENE_KEYS = Object.keys(GENES) as Gene[];
export type AiPolicy = Readonly<Record<Gene, number>>;

export const BASE: AiPolicy = Object.fromEntries(GENE_KEYS.map((k) => [k, GENES[k][2]])) as Record<Gene, number>;
const clamp = (k: Gene, v: number): number => Math.min(GENES[k][1], Math.max(GENES[k][0], v));
// A policy from loose numbers (a file's): what is missing as BASE, all within bounds.
export const policy = (genes: Partial<Record<string, number>>): AiPolicy =>
  Object.fromEntries(GENE_KEYS.map((k) => [k, clamp(k, genes[k] ?? BASE[k])])) as Record<Gene, number>;

// A policy varied: each gene, with chance `rate`, moved by a bell of `spread` of its range.
export function mutate(p: AiPolicy, rng: () => number, rate = 0.3, spread = 0.15): AiPolicy {
  const bell = () => (rng() + rng() + rng() + rng() - 2) / 0.58; // about a unit normal
  return Object.fromEntries(GENE_KEYS.map((k) => [k, rng() < rate ? clamp(k, p[k] + bell() * spread * (GENES[k][1] - GENES[k][0])) : p[k]])) as Record<Gene, number>;
}
// Two policies crossed: each gene from one or the other.
export const cross = (a: AiPolicy, b: AiPolicy, rng: () => number): AiPolicy =>
  Object.fromEntries(GENE_KEYS.map((k) => [k, rng() < 0.5 ? a[k] : b[k]])) as Record<Gene, number>;

// The levels of difficulty, easiest first: champions from along the
// breeding (aiLevels.json, written by scripts/train.ts).
export interface AiLevel { readonly name: string; readonly generation: number; readonly policy: AiPolicy }
export const LEVELS: readonly AiLevel[] = (levels as { name: string; generation: number; genes: Record<string, number> }[])
  .map((l) => ({ name: l.name, generation: l.generation, policy: policy(l.genes) }));
export const DEFAULT_LEVEL = Math.min(2, LEVELS.length - 1);
// The best policy there is: what a computer civ takes the player to decide
// by when it reads the player's attitude toward it (it cannot ask; it
// assumes the player plays as well as anything it knows).
export const BEST = (): AiPolicy => LEVELS[LEVELS.length - 1]!.policy;
