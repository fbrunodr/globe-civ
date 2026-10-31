import type { EraIndex } from './cities.ts';
import type { ReligionKey } from './religion.ts';
import {
  capital, prodPct, yieldPct, pct, count, moves, onImprovement, onResource, perSpecialist, perLuxury, type Effect,
} from './effects.ts';

// Identity: who a people are, built like a character in a role-playing
// game, for good. Culture (cities.ts) earns identity points; each trait
// adopted costs more than the last (traitCost), whatever the civ's size,
// and a civ adopts MAX_TRAITS at most. Traits belong to ten paths in five
// opposed pairs, each pair a slider (like a political compass's axes):
//   Martial ⟷ Concord        Devotion ⟷ Reason     Open Market ⟷ National Industry
//   Frontier ⟷ Heartland     Maritime ⟷ Pastoral
// Each path climbs through PAIR_SLOTS slots, one per step: an opening trait
// (Ancient), two Classical ones, a Medieval one, a Renaissance fork (one of
// two: the other closes), an Industrial one and a Modern capstone. The two
// paths of a pair share their slots: each trait taken on one side closes
// the other side's last open slot, so a civ may go all the way down one
// path, or part of the way down both (say four and three), never more
// than PAIR_SLOTS in all. A trait needs one of the tier below in its path,
// and the civ to have reached its era (techs.ts).
// Devotion also has the faiths: the first civ in the world to adopt one
// founds its religion (religion.ts; Meditation founds Hinduism), and a
// civ adopts one at most, while it is still unfounded. Nothing here can be
// undone: that is what sets civs apart (techs are the same for everyone;
// governments and policies change at will: politics.ts).

export const PATH_KEYS = ['martial', 'concord', 'devotion', 'reason', 'openMarket', 'nationalIndustry', 'frontier', 'heartland', 'maritime', 'pastoral'] as const;
export type PathKey = typeof PATH_KEYS[number];
export interface PathDef {
  readonly name: string;
  readonly epithet: string;   // what a civ strong in it is called
  readonly opposite: PathKey;
  readonly desc: string;
}
export const PATHS: Record<PathKey, PathDef> = {
  martial:   { name: 'Martial',   epithet: 'Warlike',     opposite: 'concord',   desc: 'Armies: their making, their strength, their reach.' },
  concord:   { name: 'Concord',   epithet: 'Peaceable',   opposite: 'martial',   desc: 'Peace at home: growth, defense, cohesion.' },
  devotion:  { name: 'Devotion',  epithet: 'Devout',      opposite: 'reason',    desc: 'Faith: founding a religion and spreading it.' },
  reason:    { name: 'Reason',    epithet: 'Rational',    opposite: 'devotion',  desc: 'Inquiry: science and secular institutions.' },
  openMarket:       { name: 'Open Market',       epithet: 'Mercantile',  opposite: 'nationalIndustry', desc: 'Trade: gold, markets and purchases.' },
  nationalIndustry: { name: 'National Industry', epithet: 'Industrious', opposite: 'openMarket',       desc: 'Making: production, buildings and wonders.' },
  frontier:  { name: 'Frontier',  epithet: 'Expansive',   opposite: 'heartland', desc: 'Wide: settling, borders and cheap provinces.' },
  heartland: { name: 'Heartland', epithet: 'Urbane',      opposite: 'frontier',  desc: 'Tall: a great capital and dense cities.' },
  maritime:  { name: 'Maritime',  epithet: 'Seafaring',   opposite: 'pastoral',  desc: 'The sea: fishing grounds and sea trade.' },
  pastoral:  { name: 'Pastoral',  epithet: 'Pastoral',    opposite: 'maritime',  desc: 'The land: farms, herds and horsemen.' },
};

export type Tier = 0 | 1 | 2 | 3 | 4 | 5;
export const TIER_ERA: Record<Tier, EraIndex> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

export interface TraitDef {
  readonly name: string;
  readonly path: PathKey;
  readonly tier: Tier;
  readonly era: EraIndex;
  readonly effects: readonly Effect[];
  readonly religion?: ReligionKey;   // a faith: the first to adopt it founds this religion
}
const tr = (name: string, path: PathKey, tier: Tier, ...effects: Effect[]): TraitDef => ({ name, path, tier, era: TIER_ERA[tier], effects });
const faith = (name: string, era: EraIndex, religion: ReligionKey): TraitDef => ({ name, path: 'devotion', tier: 1, era, effects: [pct('pressure', 25)], religion });

export const TRAITS = {
  // ---- Martial ----
  warriorEthos:     tr('Warrior Ethos', 'martial', 0, prodPct('military', 15)),
  battleHardened:   tr('Battle-Hardened', 'martial', 1, pct('combat', 10)),
  spoilsOfWar:      tr('Spoils of War', 'martial', 1, pct('vsCities', 20)),
  garrisonState:    tr('Garrison State', 'martial', 2, count('freeUnits', 3), pct('homeDefense', 10)),
  shockTroops:      tr('Shock Troops', 'martial', 3, prodPct('melee', 30), pct('combat', 5)),
  grandBatteries:   tr('Grand Batteries', 'martial', 3, prodPct('siege', 40), pct('vsCities', 15)),
  militaryIndustry: tr('Military Industry', 'martial', 4, prodPct('military', 25), count('heal', 10)),
  supremeCommand:   tr('Supreme Command', 'martial', 5, pct('combat', 15), moves(1)),
  // ---- Concord ----
  hearth:           tr('Hearth and Home', 'concord', 0, pct('growth', -10)),
  goodNeighbors:    tr('Good Neighbors', 'concord', 1, pct('homeDefense', 25)),
  commonPurpose:    tr('Common Purpose', 'concord', 1, yieldPct('culture', 10), yieldPct('cohesion', 10)),
  sanctuary:        tr('Sanctuary', 'concord', 2, pct('upkeep', -15), pct('cityStrength', 25)),
  pacifism:         tr('Pacifism', 'concord', 3, pct('buildingUpkeep', -25), yieldPct('culture', 10)),
  citizenMilitia:   tr('Citizen Militia', 'concord', 3, count('freeUnits', 4), pct('homeDefense', 20)),
  commonwealth:     tr('Commonwealth', 'concord', 4, pct('growth', -15), yieldPct('cohesion', 15)),
  perpetualPeace:   tr('Perpetual Peace', 'concord', 5, yieldPct('science', 10), yieldPct('culture', 10), yieldPct('cohesion', 10)),
  // ---- Devotion ----
  spirituality:     tr('Spirituality', 'devotion', 0, yieldPct('faith', 20), capital({ faith: 1 })),
  meditation:       faith('Meditation', 0, 'hinduism'),
  covenant:         faith('Covenant', 0, 'judaism'),
  contemplation:    faith('Contemplation', 1, 'buddhism'),
  harmony:          faith('Harmony', 1, 'taoism'),
  ethics:           faith('Ethics', 1, 'confucianism'),
  theology:         faith('Theology', 2, 'christianity'),
  revelation:       faith('Revelation', 2, 'islam'),
  pilgrims:         tr('Pilgrims', 'devotion', 1, pct('pressure', 30), count('tithe', 1)),
  templeBuilders:   tr('Temple Builders', 'devotion', 1, capital({ faith: 2 }), yieldPct('faith', 10)),
  holyLand:         tr('Holy Land', 'devotion', 2, capital({ faith: 3, culture: 2 })),
  zealotry:         tr('Zealotry', 'devotion', 3, pct('vsCities', 15), pct('combat', 5)),
  mysticOrders:     tr('Mystic Orders', 'devotion', 3, yieldPct('faith', 25), yieldPct('culture', 10)),
  missionaries:     tr('Missionaries', 'devotion', 4, pct('pressure', 50), count('tithe', 1)),
  divineMandate:    tr('Divine Mandate', 'devotion', 5, yieldPct('cohesion', 20), yieldPct('faith', 20)),
  // ---- Reason ----
  inquiry:          tr('Inquiry', 'reason', 0, yieldPct('science', 8)),
  naturalHistory:   tr('Natural History', 'reason', 1, perSpecialist('scientist', { science: 1 })),
  logic:            tr('Logic', 'reason', 1, yieldPct('science', 5), yieldPct('cohesion', 5)),
  learnedSocieties: tr('Learned Societies', 'reason', 2, yieldPct('science', 8), yieldPct('culture', 5)),
  empiricism:       tr('Empiricism', 'reason', 3, yieldPct('science', 12)),
  appliedScience:   tr('Applied Science', 'reason', 3, yieldPct('prod', 10), yieldPct('science', 5)),
  secularism:       tr('Secularism', 'reason', 4, yieldPct('cohesion', 15), pct('buildingUpkeep', -15)),
  progressivism:    tr('Progressivism', 'reason', 5, yieldPct('science', 15)),
  // ---- Open Market ----
  marketDays:       tr('Market Days', 'openMarket', 0, yieldPct('gold', 10)),
  caravanRoutes:    tr('Caravan Routes', 'openMarket', 1, perLuxury({ gold: 1 })),
  moneyChangers:    tr('Money Changers', 'openMarket', 1, pct('buyCost', -15)),
  merchantGuilds:   tr('Merchant Guilds', 'openMarket', 2, perSpecialist('merchant', { gold: 2 })),
  bankingHouses:    tr('Banking Houses', 'openMarket', 3, yieldPct('gold', 15)),
  freePorts:        tr('Free Ports', 'openMarket', 3, pct('tilePrice', -40), pct('buyCost', -15)),
  commercialEmpire: tr('Commercial Empire', 'openMarket', 4, pct('upkeep', -20), yieldPct('gold', 10)),
  globalTrade:      tr('Global Trade', 'openMarket', 5, yieldPct('gold', 20), yieldPct('science', 5)),
  // ---- National Industry ----
  artisans:         tr('Artisans', 'nationalIndustry', 0, yieldPct('prod', 10)),
  stonemasons:      tr('Stonemasons', 'nationalIndustry', 1, onImprovement('quarry', { prod: 1 }), prodPct('wonder', 15)),
  smiths:           tr('Smiths', 'nationalIndustry', 1, onImprovement('mine', { prod: 1 })),
  masterBuilders:   tr('Master Builders', 'nationalIndustry', 2, prodPct('building', 20)),
  monumentBuilders: tr('Monument Builders', 'nationalIndustry', 3, prodPct('wonder', 30), yieldPct('culture', 5)),
  workshopsOfTheWorld: tr('Workshops of the World', 'nationalIndustry', 3, perSpecialist('engineer', { prod: 2 })),
  heavyIndustry:    tr('Heavy Industry', 'nationalIndustry', 4, yieldPct('prod', 15), pct('buildingUpkeep', -15)),
  industrialMight:  tr('Industrial Might', 'nationalIndustry', 5, yieldPct('prod', 20), prodPct('military', 15)),
  // ---- Frontier ----
  pioneers:         tr('Pioneers', 'frontier', 0, prodPct('settler', 30)),
  homesteading:     tr('Homesteading', 'frontier', 1, pct('tilePrice', -30), pct('border', 30)),
  outriders:        tr('Outriders', 'frontier', 1, moves(1, true)),
  provincialGovernors: tr('Provincial Governors', 'frontier', 2, pct('upkeep', -25)),
  manifestDestiny:  tr('Manifest Destiny', 'frontier', 3, pct('border', 50), prodPct('settler', 30)),
  colonialAdministration: tr('Colonial Administration', 'frontier', 3, pct('upkeep', -20), yieldPct('cohesion', 10)),
  vastLands:        tr('Vast Lands', 'frontier', 4, onResource('strategic', { prod: 1 }), onResource('bonus', { food: 1 })),
  continentalPower: tr('Continental Power', 'frontier', 5, yieldPct('food', 10), yieldPct('prod', 10), yieldPct('gold', 10)),
  // ---- Heartland ----
  seatOfPower:      tr('Seat of Power', 'heartland', 0, capital({ prod: 2, culture: 1, cohesion: 1 })),
  royalCourt:       tr('Royal Court', 'heartland', 1, capital({ gold: 3, culture: 2 })),
  densePlanning:    tr('Dense Planning', 'heartland', 1, pct('growth', -10)),
  greatCity:        tr('Great City', 'heartland', 2, capital({ science: 3, prod: 2, cohesion: 2 })),
  tallSpires:       tr('Tall Spires', 'heartland', 3, pct('buildingUpkeep', -20), prodPct('building', 10)),
  artisanQuarter:   tr('Artisan Quarter', 'heartland', 3, perSpecialist('artist', { culture: 2 }), perSpecialist('merchant', { gold: 1 })),
  urbanCore:        tr('Urban Core', 'heartland', 4, pct('growth', -15), yieldPct('food', 10)),
  worldCity:        tr('World City', 'heartland', 5, capital({ prod: 4, gold: 4, science: 4, culture: 4, cohesion: 4 })),
  // ---- Maritime ----
  seafarers:        tr('Seafarers', 'maritime', 0, onImprovement('boats', { food: 1 })),
  harborTowns:      tr('Harbor Towns', 'maritime', 1, onImprovement('boats', { gold: 1 })),
  seaLanes:         tr('Sea Lanes', 'maritime', 1, yieldPct('gold', 10)),
  shipwrights:      tr('Shipwrights', 'maritime', 2, onImprovement('boats', { prod: 1 })),
  thalassocracy:    tr('Thalassocracy', 'maritime', 3, yieldPct('gold', 15), yieldPct('cohesion', 5)),
  deepSeaFishing:   tr('Deep-Sea Fishing', 'maritime', 3, onImprovement('boats', { food: 1 }), pct('growth', -5)),
  maritimeTrade:    tr('Maritime Trade', 'maritime', 4, perLuxury({ gold: 2 })),
  mastersOfTheSea:  tr('Masters of the Sea', 'maritime', 5, onImprovement('boats', { gold: 1, culture: 1 })),
  // ---- Pastoral ----
  herders:          tr('Herders', 'pastoral', 0, onResource('bonus', { food: 1 })),
  horseBreeders:    tr('Horse Breeders', 'pastoral', 1, prodPct('mounted', 40)),
  farmers:          tr('Farmers', 'pastoral', 1, onImprovement('farm', { food: 1 })),
  horseLords:       tr('Horse Lords', 'pastoral', 2, moves(1, true), pct('combat', 5)),
  granaryOfTheWorld: tr('Granary of the World', 'pastoral', 3, onImprovement('farm', { food: 1 }), pct('growth', -5)),
  cavalryTradition: tr('Cavalry Tradition', 'pastoral', 3, prodPct('mounted', 30), pct('combat', 10)),
  ranching:         tr('Ranching', 'pastoral', 4, onImprovement('camp', { prod: 1 }), onImprovement('wetland', { food: 1 })),
  breadbasket:      tr('Breadbasket', 'pastoral', 5, yieldPct('food', 15), yieldPct('prod', 10)),
} satisfies Record<string, TraitDef>;
export type TraitKey = keyof typeof TRAITS;
export const TRAIT_KEYS = Object.keys(TRAITS) as TraitKey[];
export const traitDef = (k: TraitKey): TraitDef => TRAITS[k];
export const isTraitKey = (s: string): s is TraitKey => s in TRAITS;
export const isFaith = (k: TraitKey): boolean => traitDef(k).religion !== undefined;
export const FAITH_KEYS = TRAIT_KEYS.filter(isFaith);
export const traitOfReligion = (r: ReligionKey): TraitKey => FAITH_KEYS.find((k) => traitDef(k).religion === r)!;
// The traits of a path (faiths apart), by tier.
export const pathTraits = (p: PathKey): TraitKey[] => TRAIT_KEYS.filter((k) => traitDef(k).path === p && !isFaith(k)).sort((a, b) => traitDef(a).tier - traitDef(b).tier);

// The identity points the next trait costs: more for each already adopted.
export const traitCost = (adopted: number): number => Math.round(30 + 20 * adopted + 5 * adopted * adopted);
// The most traits a civ adopts (faiths included), and the slots a pair of paths shares.
export const MAX_TRAITS = 25;
export const PAIR_SLOTS = 7;
// A trait's slot in its path (0..6: the two Classical traits one after
// the other, the Renaissance fork's two in the same slot).
export function traitSlot(k: TraitKey): number {
  const t = traitDef(k).tier;
  if (t === 1) return pathTraits(traitDef(k).path).filter((x) => traitDef(x).tier === 1).indexOf(k) + 1;
  return t === 0 ? 0 : t === 2 ? 3 : t === 3 ? 4 : t === 4 ? 5 : 6;
}
// The slots of path p still open: its pair's, less those its opposite took.
export function openSlots(p: PathKey, have: ReadonlySet<TraitKey>): number {
  return PAIR_SLOTS - pathLevels(have)[PATHS[p].opposite];
}

// Why a civ (its traits, its era, the religions already founded) could not
// adopt trait k now, or null if it could (points aside).
export type TraitBlock = 'adopted' | 'full' | 'closed' | 'squeezes' | 'era' | 'needs' | 'fork' | 'faithTaken' | 'oneFaith';
export function traitBlock(k: TraitKey, have: ReadonlySet<TraitKey>, era: EraIndex, founded: ReadonlySet<ReligionKey>): TraitBlock | null {
  const d = traitDef(k);
  if (have.has(k)) return 'adopted';
  if (have.size >= MAX_TRAITS) return 'full';
  if (!d.religion) {
    // (The slider: its slot must be open, and taking it must not close a
    // slot the other side already holds.)
    const opp = PATHS[d.path].opposite, own = pathLevels(have)[d.path];
    if (traitSlot(k) >= openSlots(d.path, have)) return 'closed';
    if ([...have].some((x) => !isFaith(x) && traitDef(x).path === opp && traitSlot(x) >= PAIR_SLOTS - (own + 1))) return 'squeezes';
  }
  if (d.era > era) return 'era';
  if (d.religion) {
    if (!have.has('spirituality')) return 'needs';
    if (FAITH_KEYS.some((f) => have.has(f))) return 'oneFaith';
    if (founded.has(d.religion)) return 'faithTaken';
    return null;
  }
  if (d.tier > 0 && !pathTraits(d.path).some((x) => traitDef(x).tier === d.tier - 1 && have.has(x))) return 'needs';
  // (The Renaissance fork: one of the two.)
  if (d.tier === 3 && pathTraits(d.path).some((x) => x !== k && traitDef(x).tier === 3 && have.has(x))) return 'fork';
  return null;
}
export const BLOCK_TEXT: Record<TraitBlock, string> = {
  adopted: 'Adopted', full: `Your people have all the traits they can (${MAX_TRAITS})`, closed: 'Closed: the opposite path took this slot',
  squeezes: 'Taking it would close a trait you hold on the opposite path', era: 'A later era', needs: 'Needs a trait before it',
  fork: 'The other trait of this fork was chosen', faithTaken: 'Already founded by another civilization', oneFaith: 'You follow another faith',
};

// How far a civ has gone down each path (traits adopted, faiths apart).
export function pathLevels(have: ReadonlySet<TraitKey>): Record<PathKey, number> {
  const out = Object.fromEntries(PATH_KEYS.map((p) => [p, 0])) as Record<PathKey, number>;
  for (const k of have) if (!isFaith(k)) out[traitDef(k).path]++;
  return out;
}
// What a civ is called for its identity: its strongest paths' epithets
// ("Devout, Warlike"), or null with none yet.
export function epithet(have: ReadonlySet<TraitKey>): string | null {
  const lv = pathLevels(have);
  const top = PATH_KEYS.filter((p) => lv[p] > 0).sort((a, b) => lv[b] - lv[a] || PATH_KEYS.indexOf(a) - PATH_KEYS.indexOf(b)).slice(0, 2);
  return top.length ? top.map((p) => PATHS[p].epithet).join(', ') : null;
}
