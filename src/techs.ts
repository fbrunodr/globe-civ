import type { BuildingKey, EraIndex, WonderKey, ImprovementKey } from './cities.ts';
import type { UnitKey } from './rules.ts';
import { onImprovement, perSpecialist, prodPct, yieldPct, pct, count, type Effect } from './effects.ts';

// The technology tree, after Civ VI's (a deep web, strictly: each tech
// needs one or more before it): each costs science, belongs to an era (a
// civ's era is the latest it has a tech of: game.ts) and unlocks units,
// buildings and wonders to build, reveals strategic resources (resources.ts
// reveal) and improves the land (effects.ts improvement: what used to come
// with each era). Everyone researches the same tree; only the pace
// differs. Costs are flat (not scaled by a civ's size: a wide civ pays its
// cities' upkeep instead, economy.ts).

export const TECH_KEYS = [
  // Ancient
  'pottery', 'animalHusbandry', 'mining', 'sailing', 'astrology', 'irrigation', 'writing', 'archery', 'masonry', 'bronzeWorking',
  'theWheel', 'horsebackRiding', 'fishing', 'mysticism',
  // Classical
  'celestialNavigation', 'currency', 'ironWorking', 'construction', 'mathematics', 'engineering', 'drama', 'literature', 'plough',
  'trade', 'philosophy', 'shipbuilding', 'calendar',
  // Medieval
  'education', 'apprenticeship', 'machinery', 'militaryTactics', 'stirrups', 'fortification', 'metalCasting', 'forestry', 'drainage',
  'domes', 'compass', 'craftGuilds', 'paper',
  // Renaissance
  'printingPress', 'gunpowder', 'astronomy', 'banking', 'metallurgy', 'navigation', 'physics', 'chemistry', 'accounting',
  'architecture', 'cropRotation', 'magnetism', 'patronage',
  // Industrial
  'scientificTheory', 'rifling', 'industrialization', 'sanitation', 'militaryScience', 'ballistics', 'steamPower', 'railroad',
  'economics', 'fertilizer', 'archaeology', 'pedagogy', 'biology', 'dynamite',
  // Modern
  'electricity', 'refining', 'combustion', 'replaceableParts', 'radio', 'motorizedWarfare', 'electronics', 'steel', 'massProduction',
  'refrigeration', 'medicine', 'atomicTheory', 'telecommunications', 'flight',
] as const;
export type TechKey = typeof TECH_KEYS[number];

export interface TechDef {
  readonly name: string;
  readonly era: EraIndex;
  readonly cost: number;
  readonly needs: readonly TechKey[];
  readonly units?: readonly UnitKey[];
  readonly buildings?: readonly BuildingKey[];
  readonly wonders?: readonly WonderKey[];
  readonly effects?: readonly Effect[];
}

// All costs are scaled by this (the game's pace: tune here).
export const TECH_COST_SCALE = 2.5;
// And by era (a civ's science grows faster than the costs above: the first
// techs come in a few turns, the last in many).
const ERA_COST: Record<EraIndex, number> = { 0: 0.45, 1: 0.8, 2: 1.2, 3: 2.1, 4: 3.3, 5: 4.6 };
const t = (name: string, era: EraIndex, cost: number, needs: readonly TechKey[], unlocks: Omit<TechDef, 'name' | 'era' | 'cost' | 'needs'> = {}): TechDef => ({ name, era, cost: Math.round(cost * TECH_COST_SCALE * ERA_COST[era]), needs, ...unlocks });

export const TECHS: Record<TechKey, TechDef> = {
  // ---- Ancient ----
  pottery:         t('Pottery', 0, 25, [], { buildings: ['granary'] }),
  animalHusbandry: t('Animal Husbandry', 0, 25, [], { effects: [onImprovement('pasture', { food: 1 })] }), // (reveals Horses)
  mining:          t('Mining', 0, 25, [], { effects: [onImprovement('quarry', { prod: 1 })] }),
  sailing:         t('Sailing', 0, 30, [], { units: ['galley'], buildings: ['lighthouse'], wonders: ['greatLighthouse'] }),
  astrology:       t('Astrology', 0, 30, [], { buildings: ['shrine'], wonders: ['stonehenge'] }),
  irrigation:      t('Irrigation', 0, 35, ['pottery'], { wonders: ['hangingGardens'], effects: [onImprovement('wetland', { food: 1 })] }),
  writing:         t('Writing', 0, 35, ['pottery'], { buildings: ['library'] }),
  archery:         t('Archery', 0, 35, ['animalHusbandry'], { units: ['archer'] }),
  masonry:         t('Masonry', 0, 35, ['mining'], { buildings: ['walls'], wonders: ['pyramids'] }),
  bronzeWorking:   t('Bronze Working', 0, 40, ['mining'], { units: ['spearman'], buildings: ['barracks'] }), // (reveals Iron)
  theWheel:        t('The Wheel', 0, 40, ['mining'], { units: ['chariotArcher'], buildings: ['waterMill'] }),
  horsebackRiding: t('Horseback Riding', 0, 45, ['animalHusbandry', 'archery'], { units: ['horseman'], buildings: ['stable'] }),
  fishing:         t('Fishing', 0, 35, ['sailing'], { effects: [onImprovement('boats', { gold: 1 })] }),
  mysticism:       t('Mysticism', 0, 40, ['astrology'], { buildings: ['temple'] }),
  // ---- Classical ----
  celestialNavigation: t('Celestial Navigation', 1, 40, ['sailing', 'astrology'], { buildings: ['shipyard'], wonders: ['colossus'] }),
  currency:        t('Currency', 1, 35, ['writing'], { buildings: ['market'] }),
  ironWorking:     t('Iron Working', 1, 40, ['bronzeWorking'], { units: ['swordsman'] }),
  construction:    t('Construction', 1, 40, ['masonry', 'theWheel'], { units: ['compositeBowman'], buildings: ['workshop'], wonders: ['colosseum'] }),
  mathematics:     t('Mathematics', 1, 40, ['currency'], { units: ['catapult'], buildings: ['countingHouse'] }),
  engineering:     t('Engineering', 1, 45, ['theWheel', 'irrigation'], { buildings: ['aqueduct'], wonders: ['machuPicchu'] }),
  drama:           t('Drama', 1, 35, ['writing', 'mysticism'], { buildings: ['amphitheater'] }),
  literature:      t('Literature', 1, 45, ['drama'], { buildings: ['odeon'], wonders: ['greatLibrary'] }),
  plough:          t('The Plough', 1, 40, ['irrigation', 'theWheel'], { effects: [onImprovement('farm', { food: 1 })] }),
  trade:           t('Trade', 1, 40, ['currency', 'horsebackRiding'], { buildings: ['caravanserai'] }),
  philosophy:      t('Philosophy', 1, 45, ['writing', 'mysticism'], { effects: [yieldPct('science', 5)] }),
  shipbuilding:    t('Shipbuilding', 1, 40, ['celestialNavigation', 'fishing'], { units: ['trireme'], buildings: ['harbor'] }), // (land units embark: game.ts)
  calendar:        t('Calendar', 1, 35, ['astrology', 'irrigation'], { effects: [onImprovement('plantation', { gold: 1 })] }),
  // ---- Medieval ----
  education:       t('Education', 2, 55, ['mathematics', 'philosophy'], { buildings: ['academy'] }),
  apprenticeship:  t('Apprenticeship', 2, 50, ['currency', 'construction'], { buildings: ['smithy'] }),
  machinery:       t('Machinery', 2, 55, ['ironWorking', 'engineering'], { units: ['crossbowman'] }),
  militaryTactics: t('Military Tactics', 2, 55, ['mathematics', 'ironWorking'], { units: ['pikeman'] }),
  stirrups:        t('Stirrups', 2, 55, ['horsebackRiding', 'ironWorking'], { units: ['knight'] }),
  fortification:   t('Fortification', 2, 50, ['construction', 'masonry'], { units: ['trebuchet'], effects: [pct('cityStrength', 25)] }),
  metalCasting:    t('Metal Casting', 2, 50, ['bronzeWorking', 'apprenticeship'], { units: ['longswordsman'], effects: [onImprovement('mine', { prod: 1 }), onImprovement('quarry', { prod: 1 })] }),
  forestry:        t('Forestry', 2, 45, ['construction', 'animalHusbandry'], { effects: [onImprovement('camp', { gold: 1 })] }),
  drainage:        t('Drainage', 2, 45, ['engineering'], { effects: [onImprovement('wetland', { food: 1 })] }),
  domes:           t('Domes', 2, 55, ['engineering', 'mathematics'], { wonders: ['hagiaSophia'] }),
  compass:         t('Compass', 2, 50, ['shipbuilding', 'mathematics'], { units: ['galleass'], effects: [onImprovement('boats', { food: 1 })] }),
  craftGuilds:     t('Craft Guilds', 2, 55, ['apprenticeship', 'trade'], { buildings: ['guildHall'] }),
  paper:           t('Paper', 2, 50, ['literature', 'currency'], { effects: [perSpecialist('scientist', { science: 1 })] }),
  // ---- Renaissance ----
  printingPress:   t('Printing Press', 3, 85, ['education', 'paper'], { buildings: ['university'] }),
  gunpowder:       t('Gunpowder', 3, 85, ['machinery', 'militaryTactics'], { units: ['musketman'], effects: [onImprovement('camp', { gold: 1 })] }), // (reveals Niter)
  astronomy:       t('Astronomy', 3, 85, ['education', 'compass'], { buildings: ['observatory'], wonders: ['tajMahal'] }),
  banking:         t('Banking', 3, 85, ['craftGuilds', 'printingPress'], { buildings: ['bank'], effects: [onImprovement('plantation', { gold: 1 })] }),
  metallurgy:      t('Metallurgy', 3, 90, ['gunpowder', 'metalCasting'], { units: ['lancer'] }),
  navigation:      t('Navigation', 3, 80, ['compass', 'astronomy'], { units: ['caravel'], effects: [onImprovement('boats', { gold: 1 })] }),
  physics:         t('Physics', 3, 85, ['astronomy', 'printingPress'], { effects: [yieldPct('science', 5)] }),
  chemistry:       t('Chemistry', 3, 85, ['education', 'metalCasting'], { units: ['cannon'], effects: [onImprovement('mine', { prod: 1 })] }),
  accounting:      t('Accounting', 3, 75, ['banking'], { effects: [perSpecialist('merchant', { gold: 1 })] }),
  architecture:    t('Architecture', 3, 80, ['domes', 'printingPress'], { effects: [prodPct('building', 10)] }),
  cropRotation:    t('Crop Rotation', 3, 75, ['plough', 'education'], { effects: [onImprovement('farm', { food: 1 }), onImprovement('pasture', { food: 1 })] }),
  magnetism:       t('Magnetism', 3, 80, ['navigation', 'physics'], { units: ['frigate'], effects: [onImprovement('boats', { prod: 1 })] }),
  patronage:       t('Patronage', 3, 75, ['architecture', 'banking'], { effects: [perSpecialist('artist', { culture: 1 })] }),
  // ---- Industrial ----
  scientificTheory: t('Scientific Theory', 4, 135, ['physics', 'chemistry'], { effects: [yieldPct('science', 10)] }),
  rifling:         t('Rifling', 4, 135, ['metallurgy', 'chemistry'], { units: ['rifleman'] }),
  industrialization: t('Industrialization', 4, 140, ['banking', 'metallurgy'], { units: ['gatlingGun'], buildings: ['factory'], wonders: ['eiffelTower'] }), // (reveals Coal)
  sanitation:      t('Sanitation', 4, 140, ['scientificTheory'], { buildings: ['hospital'] }),
  militaryScience: t('Military Science', 4, 140, ['rifling', 'stirrups'], { units: ['cavalry'] }),
  ballistics:      t('Ballistics', 4, 145, ['rifling', 'industrialization'], { units: ['machineGun'] }),
  steamPower:      t('Steam Power', 4, 140, ['industrialization', 'physics'], { units: ['ironclad'], effects: [onImprovement('mine', { prod: 1 })] }),
  railroad:        t('Railroad', 4, 145, ['steamPower'], { buildings: ['railwayStation'], effects: [onImprovement('camp', { prod: 1 })] }),
  economics:       t('Economics', 4, 135, ['industrialization', 'accounting'], { buildings: ['stockExchange'] }),
  fertilizer:      t('Fertilizer', 4, 130, ['cropRotation', 'chemistry'], { effects: [onImprovement('farm', { food: 1 }), onImprovement('plantation', { gold: 1 })] }),
  archaeology:     t('Archaeology', 4, 125, ['patronage', 'scientificTheory'], { buildings: ['museum'] }),
  pedagogy:        t('Pedagogy', 4, 125, ['scientificTheory', 'printingPress'], { buildings: ['publicSchool'] }),
  biology:         t('Biology', 4, 135, ['scientificTheory'], { effects: [pct('growth', -10)] }),
  dynamite:        t('Dynamite', 4, 130, ['chemistry', 'steamPower'], { units: ['artillery'], effects: [onImprovement('quarry', { prod: 1 }), pct('vsCities', 15)] }),
  // ---- Modern ----
  electricity:     t('Electricity', 5, 200, ['scientificTheory', 'steamPower'], { effects: [yieldPct('science', 5), yieldPct('prod', 5)] }),
  refining:        t('Refining', 5, 195, ['industrialization', 'chemistry'], {}), // (reveals Oil)
  combustion:      t('Combustion', 5, 210, ['refining', 'steamPower'], { units: ['landship', 'destroyer'], effects: [onImprovement('well', { prod: 1 })] }),
  replaceableParts: t('Replaceable Parts', 5, 215, ['electricity', 'militaryScience'], { units: ['infantry', 'antiTank'] }),
  radio:           t('Radio', 5, 205, ['electricity'], { buildings: ['broadcastTower'] }),
  motorizedWarfare: t('Motorized Warfare', 5, 235, ['combustion', 'replaceableParts'], { units: ['tank'] }),
  electronics:     t('Electronics', 5, 215, ['electricity', 'refining'], { buildings: ['powerPlant'], effects: [onImprovement('well', { prod: 1 })] }),
  steel:           t('Steel', 5, 205, ['railroad', 'ballistics'], { units: ['battleship'], wonders: ['empireState'], effects: [prodPct('building', 10)] }),
  massProduction:  t('Mass Production', 5, 220, ['replaceableParts', 'steel'], { effects: [prodPct('all', 10)] }),
  refrigeration:   t('Refrigeration', 5, 205, ['electricity', 'sanitation'], { effects: [onImprovement('farm', { food: 1 }), onImprovement('wetland', { food: 1 }), onImprovement('pasture', { food: 1 })] }),
  medicine:        t('Medicine', 5, 210, ['biology', 'refrigeration'], { effects: [count('heal', 10), pct('growth', -10)] }),
  atomicTheory:    t('Atomic Theory', 5, 225, ['electricity', 'chemistry'], { buildings: ['researchLab'] }),
  telecommunications: t('Telecommunications', 5, 225, ['radio', 'electronics'], { effects: [yieldPct('cohesion', 10), yieldPct('culture', 10)] }),
  flight:          t('Flight', 5, 230, ['combustion', 'radio'], { units: ['fighter', 'bomber'] }),
};
export const techDef = (k: TechKey): TechDef => TECHS[k];
export const isTechKey = (s: string): s is TechKey => (TECH_KEYS as readonly string[]).includes(s);

// The techs to research, in an order that works, to reach `goal` (it last),
// skipping those already known.
export function techPath(goal: TechKey, known: ReadonlySet<TechKey>): TechKey[] {
  const out: TechKey[] = [];
  const visit = (k: TechKey) => {
    if (known.has(k) || out.includes(k)) return;
    for (const n of techDef(k).needs) visit(n);
    out.push(k);
  };
  visit(goal);
  return out;
}

// ---- what improves the land ----
// The techs that improve an improvement (an `improvement` effect), in the
// tree's order (by era): each adds to its yield and takes its look a stage
// on (its farms tidier, its mines deeper: rural/stages.ts), so a civ sees
// its land worked better as it learns.
const stageTechs = new Map<ImprovementKey, TechKey[]>();
for (const k of TECH_KEYS) for (const e of TECHS[k].effects ?? []) {
  if (e.k !== 'improvement') continue;
  const l = stageTechs.get(e.imp) ?? [];
  if (!l.includes(k)) l.push(k);
  stageTechs.set(e.imp, l);
}
for (const l of stageTechs.values()) l.sort((a, b) => TECHS[a].era - TECHS[b].era);
export const STAGE_TECHS = (imp: ImprovementKey): readonly TechKey[] => stageTechs.get(imp) ?? [];
// How many of them a civ knows: its improvement's stage (0: none yet).
export const improvementStage = (techs: ReadonlySet<TechKey>, imp: ImprovementKey): number => STAGE_TECHS(imp).filter((k) => techs.has(k)).length;
