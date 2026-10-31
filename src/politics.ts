import type { BuildingKey, EraIndex, WonderKey } from './cities.ts';
import type { UnitKey } from './rules.ts';
import { capital, prodPct, yieldPct, pct, count, moves, onImprovement, perSpecialist, perLuxury, type Effect } from './effects.ts';

// Politics: how a society governs itself. A tree like the techs' (a deep
// web), paid for with cohesion (cities.ts): each item needs those before it
// and unlocks governments, policies (cards a government has slots for),
// some buildings, wonders and units; Women's Suffrage also makes half of
// the civ's units women (unitModels.ts). Unlike identity (identity.ts),
// nothing here is for good: governments and policies can be changed at any
// time, for free.

// ---------- policies ----------

// A policy fills a slot of its kind; a wildcard slot takes any.
export type PolicySlot = 'military' | 'economic' | 'social' | 'wildcard';
export const POLICY_KINDS = ['military', 'economic', 'social'] as const;
export type PolicyKind = typeof POLICY_KINDS[number];

export interface PolicyDef {
  readonly name: string;
  readonly kind: PolicyKind;
  readonly effects: readonly Effect[];
}
const mil = (name: string, ...effects: Effect[]): PolicyDef => ({ name, kind: 'military', effects });
const eco = (name: string, ...effects: Effect[]): PolicyDef => ({ name, kind: 'economic', effects });
const soc = (name: string, ...effects: Effect[]): PolicyDef => ({ name, kind: 'social', effects });

export const POLICIES = {
  // ---- military ----
  discipline:        mil('Discipline', pct('combat', 10)),
  warriorCode:       mil('Warrior Code', prodPct('military', 25)),
  levy:              mil('Levy', count('freeUnits', 2)),
  palisades:         mil('Palisades', pct('cityStrength', 25)),
  maneuver:          mil('Maneuver', prodPct('mounted', 50)),
  phalanx:           mil('Phalanx', pct('homeDefense', 20)),
  legion:            mil('Legion', prodPct('melee', 40)),
  siegecraft:        mil('Siegecraft', pct('vsCities', 25)),
  archeryRanges:     mil('Archery Ranges', prodPct('ranged', 40)),
  veterancy:         mil('Veterancy', count('heal', 10)),
  feudalLevy:        mil('Feudal Levy', count('freeUnits', 3), prodPct('military', 10)),
  chivalry:          mil('Chivalry', prodPct('mounted', 30), pct('combat', 5)),
  castellans:        mil('Castellans', pct('cityStrength', 40), pct('homeDefense', 15)),
  professionalArmy:  mil('Professional Army', pct('combat', 10), prodPct('military', 15)),
  condottieri:       mil('Condottieri', pct('buyCost', -25)),
  holyWar:           mil('Holy War', pct('vsCities', 20), pct('combat', 5)),
  standingArmy:      mil('Standing Army', count('freeUnits', 4)),
  drillManuals:      mil('Drill Manuals', pct('combat', 15)),
  siegeTrains:       mil('Siege Trains', prodPct('siege', 50), pct('vsCities', 15)),
  traceItalienne:    mil('Trace Italienne', pct('cityStrength', 50)),
  grandeArmee:       mil('Grande Armée', prodPct('military', 40)),
  conscription:      mil('Conscription', count('freeUnits', 6), prodPct('military', 15)),
  generalStaff:      mil('General Staff', pct('combat', 15), count('heal', 10)),
  totalWar:          mil('Total War', pct('combat', 20), prodPct('military', 20), yieldPct('gold', -10)),
  railMobilization:  mil('Rail Mobilization', moves(1)),
  blitzkrieg:        mil('Blitzkrieg', moves(1, true), pct('combat', 10)),
  militaryResearch:  mil('Military Research', yieldPct('science', 5), prodPct('military', 25)),
  defenseInDepth:    mil('Defense in Depth', pct('homeDefense', 40), pct('cityStrength', 40)),
  warEconomy:        mil('War Economy', prodPct('military', 50), yieldPct('culture', -10)),
  // ---- economic ----
  urbanPlanning:     eco('Urban Planning', yieldPct('prod', 10)),
  landSurveyors:     eco('Land Surveyors', pct('tilePrice', -30)),
  colonization:      eco('Colonization', prodPct('settler', 50)),
  sacredKingship:    eco('Sacred Kingship', capital({ gold: 2, faith: 2 })),
  tribute:           eco('Tribute', capital({ gold: 3 })),
  caravansaries:     eco('Caravansaries', yieldPct('gold', 15)),
  corvee:            eco('Corvée', prodPct('wonder', 25)),
  stateGranaries:    eco('State Granaries', pct('growth', -15)),
  coinage:           eco('Coinage', yieldPct('gold', 10), pct('buyCost', -10)),
  monumentalWorks:   eco('Monumental Works', prodPct('building', 20)),
  naturalPhilosophy: eco('Natural Philosophy', yieldPct('science', 10)),
  serfdom:           eco('Serfdom', yieldPct('food', 10)),
  townCharters:      eco('Town Charters', yieldPct('gold', 10), yieldPct('prod', 5)),
  bureaucracy:       eco('Bureaucracy', pct('upkeep', -25)),
  guildSystem:       eco('Guild System', perSpecialist('engineer', { prod: 1 }), yieldPct('prod', 5)),
  manorialism:       eco('Manorialism', onImprovement('mine', { prod: 1 })),
  mercantilism:      eco('Mercantilism', yieldPct('gold', 20)),
  colonialOffices:   eco('Colonial Offices', pct('upkeep', -30)),
  jointStock:        eco('Joint-Stock Companies', pct('buildingUpkeep', -30), yieldPct('gold', 5)),
  rationalism:       eco('Rationalism', yieldPct('science', 15)),
  enclosure:         eco('Enclosure', onImprovement('farm', { food: 1 })),
  luxuryTrade:       eco('Luxury Trade', perLuxury({ gold: 2 })),
  freeMarket:        eco('Free Market', yieldPct('gold', 25)),
  laissezFaire:      eco('Laissez-faire', pct('buyCost', -20), yieldPct('gold', 10)),
  publicWorks:       eco('Public Works', prodPct('building', 30)),
  scientificManagement: eco('Scientific Management', yieldPct('prod', 15)),
  fiveYearPlan:      eco('Five-Year Plan', yieldPct('prod', 20), yieldPct('gold', -10)),
  economicPlanning:  eco('Economic Planning', pct('upkeep', -35), pct('buildingUpkeep', -20)),
  researchGrants:    eco('Research Grants', yieldPct('science', 20)),
  consumerism:       eco('Consumerism', yieldPct('gold', 20), yieldPct('culture', 5)),
  // ---- social ----
  oralTradition:     soc('Oral Tradition', yieldPct('culture', 15)),
  ancestorWorship:   soc('Ancestor Worship', yieldPct('faith', 20)),
  councilOfElders:   soc('Council of Elders', yieldPct('cohesion', 15)),
  inspiration:       soc('Inspiration', yieldPct('science', 10)),
  literaryTradition: soc('Literary Tradition', yieldPct('culture', 15), perSpecialist('artist', { culture: 1 })),
  scripture:         soc('Scripture', yieldPct('faith', 25), pct('pressure', 25)),
  civicPride:        soc('Civic Pride', capital({ culture: 3, cohesion: 2 })),
  citizenship:       soc('Citizenship', yieldPct('cohesion', 15), pct('growth', -5)),
  aesthetics:        soc('Aesthetics', yieldPct('culture', 10), yieldPct('faith', 10)),
  frontierSettlement: soc('Frontier Settlement', pct('border', 50)),
  monasticism:       soc('Monasticism', yieldPct('faith', 15), yieldPct('science', 5)),
  pilgrimage:        soc('Pilgrimage', pct('pressure', 50), count('tithe', 1)),
  meritocracy:       soc('Meritocracy', yieldPct('cohesion', 20)),
  courtlyCulture:    soc('Courtly Culture', yieldPct('culture', 15)),
  almshouses:        soc('Almshouses', pct('growth', -15)),
  scholasticism:     soc('Scholasticism', perSpecialist('scientist', { science: 2 })),
  humanism:          soc('Humanism', yieldPct('culture', 15), yieldPct('science', 5)),
  freePress:         soc('Free Press', yieldPct('cohesion', 15), yieldPct('culture', 10)),
  academiesOfArt:    soc('Academies of Art', perSpecialist('artist', { culture: 2 })),
  enlightenment:     soc('Enlightenment', yieldPct('science', 10), yieldPct('cohesion', 10)),
  religiousTolerance: soc('Religious Tolerance', yieldPct('faith', 10), yieldPct('cohesion', 10)),
  nationalism:       soc('Nationalism', yieldPct('cohesion', 25), pct('homeDefense', 10)),
  publicEducation:   soc('Public Education', yieldPct('science', 15)),
  grandOpera:        soc('Grand Opera', yieldPct('culture', 25)),
  urbanHygiene:      soc('Urban Hygiene', pct('growth', -20)),
  propaganda:        soc('Propaganda', yieldPct('cohesion', 20), yieldPct('culture', 10)),
  equalRights:       soc('Equal Rights', yieldPct('science', 10), yieldPct('culture', 10), yieldPct('prod', 5)),
  socialWelfare:     soc('Social Welfare', pct('growth', -15), yieldPct('cohesion', 15)),
  massCulture:       soc('Mass Culture', yieldPct('culture', 30)),
  civilRights:       soc('Civil Rights', yieldPct('cohesion', 30)),
} satisfies Record<string, PolicyDef>;
export type PolicyKey = keyof typeof POLICIES;
export const POLICY_KEYS = Object.keys(POLICIES) as PolicyKey[];
export const policyDef = (k: PolicyKey): PolicyDef => POLICIES[k];
export const fits = (k: PolicyKey, slot: PolicySlot): boolean => slot === 'wildcard' || policyDef(k).kind === slot;

// ---------- governments ----------

// Slots of each kind and the government's own bonus. Switching is free;
// the slots keep whichever policies still fit.
export interface GovernmentDef {
  readonly name: string;
  readonly tier: 0 | 1 | 2 | 3;
  readonly slots: Readonly<Record<PolicySlot, number>>;
  readonly effects: readonly Effect[];
}
const gov = (name: string, tier: GovernmentDef['tier'], [military, economic, social, wildcard]: readonly [number, number, number, number], ...effects: Effect[]): GovernmentDef =>
  ({ name, tier, slots: { military, economic, social, wildcard }, effects });

export const GOVERNMENTS = {
  chiefdom:          gov('Chiefdom', 0, [1, 1, 0, 0]),
  autocracy:         gov('Autocracy', 1, [2, 1, 0, 1], capital({ food: 1, prod: 1, gold: 1, science: 1, culture: 1, faith: 1, cohesion: 1 }), prodPct('wonder', 15)),
  oligarchy:         gov('Oligarchy', 1, [1, 1, 1, 1], pct('combat', 10)),
  classicalRepublic: gov('Classical Republic', 1, [0, 2, 1, 1], yieldPct('culture', 10), yieldPct('cohesion', 10)),
  monarchy:          gov('Monarchy', 2, [3, 1, 1, 1], prodPct('military', 25), pct('homeDefense', 25)),
  theocracy:         gov('Theocracy', 2, [2, 1, 2, 1], yieldPct('faith', 20), pct('pressure', 25)),
  merchantRepublic:  gov('Merchant Republic', 2, [1, 2, 2, 1], yieldPct('gold', 15), pct('upkeep', -15)),
  absoluteMonarchy:  gov('Absolute Monarchy', 2, [3, 2, 1, 1], pct('cityStrength', 25), prodPct('wonder', 15), capital({ cohesion: 3 })),
  constitutionalMonarchy: gov('Constitutional Monarchy', 2, [2, 2, 2, 1], yieldPct('gold', 10), yieldPct('cohesion', 10), pct('homeDefense', 15)),
  democracy:         gov('Democracy', 3, [1, 3, 2, 2], yieldPct('gold', 15), yieldPct('science', 10), pct('upkeep', -25)),
  communism:         gov('Communism', 3, [2, 3, 2, 1], yieldPct('prod', 20), pct('upkeep', -15)),
  fascism:           gov('Fascism', 3, [4, 2, 1, 1], pct('combat', 20), prodPct('military', 30)),
  technocracy:       gov('Technocracy', 3, [1, 2, 3, 2], yieldPct('science', 20), prodPct('building', 15)),
} satisfies Record<string, GovernmentDef>;
export type GovernmentKey = keyof typeof GOVERNMENTS;
export const GOVERNMENT_KEYS = Object.keys(GOVERNMENTS) as GovernmentKey[];
export const governmentDef = (k: GovernmentKey): GovernmentDef => GOVERNMENTS[k];
export const SLOT_KINDS: readonly PolicySlot[] = ['military', 'economic', 'social', 'wildcard'];

// ---------- the politics tree ----------

export const POLITICS_KEYS = [
  // Ancient
  'codeOfLaws', 'tribalCouncil', 'craftsmanship', 'earlyEmpire', 'ancestralRites', 'militaryTradition', 'kingship', 'foreignTrade',
  // Classical
  'politicalPhilosophy', 'citizenship', 'gamesRecreation', 'militaryTraining', 'standingLegions', 'recordedHistory', 'monetaryPolicy', 'colonialCharters',
  // Medieval
  'feudalism', 'civilService', 'divineRight', 'canonLaw', 'guilds', 'knighthood', 'mercenaries', 'manorialSystem', 'scholasticLearning',
  // Renaissance
  'humanism', 'mercantilism', 'diplomaticService', 'absolutism', 'colonialism', 'constitutionalism', 'militaryReform', 'theEnlightenment',
  // Industrial
  'nationalism', 'civilEngineering', 'urbanization', 'womensSuffrage', 'representativeGovernment', 'scorchedEarth', 'agrarianReform',
  // Modern
  'ideology', 'massMedia', 'mobilization', 'socialWelfare', 'globalization', 'civilRights', 'defenseDoctrine',
] as const;
export type PoliticsKey = typeof POLITICS_KEYS[number];

export interface PoliticsDef {
  readonly name: string;
  readonly era: EraIndex;
  readonly cost: number;
  readonly needs: readonly PoliticsKey[];
  readonly policies?: readonly PolicyKey[];
  readonly governments?: readonly GovernmentKey[];
  readonly buildings?: readonly BuildingKey[];
  readonly wonders?: readonly WonderKey[];
  readonly units?: readonly UnitKey[];
}
// All costs are scaled by this (the game's pace: tune here).
export const POLITICS_COST_SCALE = 2.5;
// And by era (a civ's cohesion grows faster than the costs above).
const ERA_COST: Record<EraIndex, number> = { 0: 0.5, 1: 0.8, 2: 1.1, 3: 1.6, 4: 2.1, 5: 2.7 };
const c = (name: string, era: EraIndex, cost: number, needs: readonly PoliticsKey[], unlocks: Omit<PoliticsDef, 'name' | 'era' | 'cost' | 'needs'> = {}): PoliticsDef =>
  ({ name, era, cost: Math.round(cost * POLITICS_COST_SCALE * ERA_COST[era]), needs, ...unlocks });

export const POLITICS: Record<PoliticsKey, PoliticsDef> = {
  // ---- Ancient ----
  codeOfLaws:        c('Code of Laws', 0, 20, [], { policies: ['discipline', 'urbanPlanning'] }),
  tribalCouncil:     c('Tribal Council', 0, 30, ['codeOfLaws'], { policies: ['councilOfElders', 'oralTradition'] }),
  craftsmanship:     c('Craftsmanship', 0, 30, ['codeOfLaws'], { policies: ['warriorCode', 'landSurveyors'] }),
  earlyEmpire:       c('Early Empire', 0, 40, ['codeOfLaws'], { policies: ['colonization', 'tribute'], buildings: ['courthouse'] }),
  ancestralRites:    c('Ancestral Rites', 0, 35, ['tribalCouncil'], { policies: ['ancestorWorship', 'inspiration'] }),
  militaryTradition: c('Military Tradition', 0, 40, ['craftsmanship'], { policies: ['levy', 'palisades'], units: ['commander'] }),
  kingship:          c('Kingship', 0, 45, ['ancestralRites', 'earlyEmpire'], { policies: ['sacredKingship'] }),
  foreignTrade:      c('Foreign Trade', 0, 40, ['earlyEmpire'], { policies: ['caravansaries'] }),
  // ---- Classical ----
  politicalPhilosophy: c('Political Philosophy', 1, 65, ['tribalCouncil', 'earlyEmpire'], { governments: ['autocracy', 'oligarchy', 'classicalRepublic'], buildings: ['forum'] }),
  citizenship:       c('Citizenship', 1, 70, ['politicalPhilosophy'], { policies: ['citizenship', 'civicPride'] }),
  gamesRecreation:   c('Games and Recreation', 1, 65, ['craftsmanship', 'kingship'], { policies: ['corvee', 'aesthetics'] }),
  militaryTraining:  c('Military Training', 1, 70, ['militaryTradition'], { policies: ['phalanx', 'veterancy', 'maneuver'] }),
  standingLegions:   c('Standing Legions', 1, 75, ['militaryTraining', 'earlyEmpire'], { policies: ['legion', 'siegecraft', 'archeryRanges'] }),
  recordedHistory:   c('Recorded History', 1, 75, ['politicalPhilosophy', 'ancestralRites'], { policies: ['literaryTradition', 'naturalPhilosophy', 'scripture'] }),
  monetaryPolicy:    c('Monetary Policy', 1, 70, ['foreignTrade'], { policies: ['coinage', 'monumentalWorks'] }),
  colonialCharters:  c('Colonial Charters', 1, 70, ['earlyEmpire', 'foreignTrade'], { policies: ['frontierSettlement', 'stateGranaries'] }),
  // ---- Medieval ----
  feudalism:         c('Feudalism', 2, 95, ['militaryTraining'], { policies: ['serfdom', 'feudalLevy'] }),
  civilService:      c('Civil Service', 2, 100, ['recordedHistory', 'citizenship'], { policies: ['bureaucracy', 'meritocracy'], wonders: ['angkorWat'] }),
  divineRight:       c('Divine Right', 2, 105, ['politicalPhilosophy', 'feudalism'], { governments: ['monarchy'], policies: ['castellans'], wonders: ['notreDame'] }),
  canonLaw:          c('Canon Law', 2, 100, ['recordedHistory', 'kingship'], { governments: ['theocracy'], policies: ['monasticism', 'pilgrimage', 'holyWar'] }),
  guilds:            c('Guilds', 2, 105, ['civilService', 'monetaryPolicy'], { governments: ['merchantRepublic'], policies: ['townCharters', 'guildSystem'] }),
  knighthood:        c('Knighthood', 2, 100, ['feudalism'], { policies: ['chivalry'] }),
  mercenaries:       c('Mercenaries', 2, 105, ['feudalism', 'monetaryPolicy'], { policies: ['condottieri', 'professionalArmy'] }),
  manorialSystem:    c('Manorial System', 2, 95, ['feudalism', 'colonialCharters'], { policies: ['manorialism', 'almshouses'] }),
  scholasticLearning: c('Scholastic Learning', 2, 105, ['canonLaw'], { policies: ['scholasticism', 'courtlyCulture'] }),
  // ---- Renaissance ----
  humanism:          c('Humanism', 3, 120, ['scholasticLearning', 'guilds'], { policies: ['humanism', 'academiesOfArt'] }),
  mercantilism:      c('Mercantilism', 3, 125, ['guilds'], { policies: ['mercantilism', 'luxuryTrade'] }),
  diplomaticService: c('Diplomatic Service', 3, 120, ['civilService', 'divineRight'], { policies: ['rationalism'], buildings: ['chancery'] }),
  absolutism:        c('Absolutism', 3, 130, ['divineRight', 'mercenaries'], { governments: ['absoluteMonarchy'], policies: ['standingArmy', 'traceItalienne'] }),
  colonialism:       c('Colonialism', 3, 125, ['mercantilism'], { policies: ['colonialOffices', 'jointStock'] }),
  constitutionalism: c('Constitutionalism', 3, 135, ['humanism', 'diplomaticService'], { governments: ['constitutionalMonarchy'], policies: ['freePress', 'religiousTolerance'] }),
  militaryReform:    c('Military Reform', 3, 130, ['absolutism', 'knighthood'], { policies: ['drillManuals', 'siegeTrains', 'grandeArmee'] }),
  theEnlightenment:  c('The Enlightenment', 3, 140, ['constitutionalism'], { policies: ['enlightenment'] }),
  // ---- Industrial ----
  nationalism:       c('Nationalism', 4, 200, ['theEnlightenment', 'militaryReform'], { policies: ['nationalism', 'conscription'], wonders: ['statueOfLiberty'] }),
  civilEngineering:  c('Civil Engineering', 4, 195, ['colonialism'], { policies: ['publicWorks', 'scientificManagement'] }),
  urbanization:      c('Urbanization', 4, 210, ['civilEngineering', 'theEnlightenment'], { policies: ['urbanHygiene', 'grandOpera'], wonders: ['bigBen'] }),
  womensSuffrage:    c("Women's Suffrage", 4, 205, ['theEnlightenment'], { policies: ['publicEducation'] }),
  representativeGovernment: c('Representative Government', 4, 215, ['constitutionalism', 'urbanization'], { governments: ['democracy'], policies: ['freeMarket', 'laissezFaire'] }),
  scorchedEarth:     c('Scorched Earth', 4, 210, ['nationalism'], { policies: ['totalWar', 'generalStaff'] }),
  agrarianReform:    c('Agrarian Reform', 4, 190, ['manorialSystem', 'theEnlightenment'], { policies: ['enclosure'] }),
  // ---- Modern ----
  ideology:          c('Ideology', 5, 270, ['nationalism', 'representativeGovernment'], { governments: ['communism', 'fascism', 'technocracy'], buildings: ['ministry'] }),
  massMedia:         c('Mass Media', 5, 285, ['urbanization'], { policies: ['propaganda', 'massCulture'], wonders: ['cristoRedentor'] }),
  mobilization:      c('Mobilization', 5, 290, ['scorchedEarth', 'ideology'], { policies: ['railMobilization', 'blitzkrieg', 'warEconomy', 'militaryResearch'] }),
  socialWelfare:     c('Social Welfare', 5, 300, ['ideology', 'womensSuffrage'], { policies: ['socialWelfare', 'fiveYearPlan', 'economicPlanning'] }),
  globalization:     c('Globalization', 5, 320, ['massMedia', 'socialWelfare'], { policies: ['consumerism', 'researchGrants'] }),
  civilRights:       c('Civil Rights', 5, 300, ['womensSuffrage', 'massMedia'], { policies: ['civilRights', 'equalRights'] }),
  defenseDoctrine:   c('Defense Doctrine', 5, 290, ['mobilization'], { policies: ['defenseInDepth'] }),
};
export const politicsDef = (k: PoliticsKey): PoliticsDef => POLITICS[k];
export const isPoliticsKey = (s: string): s is PoliticsKey => (POLITICS_KEYS as readonly string[]).includes(s);

export function politicsPath(goal: PoliticsKey, known: ReadonlySet<PoliticsKey>): PoliticsKey[] {
  const out: PoliticsKey[] = [];
  const visit = (k: PoliticsKey) => {
    if (known.has(k) || out.includes(k)) return;
    for (const n of politicsDef(k).needs) visit(n);
    out.push(k);
  };
  visit(goal);
  return out;
}
