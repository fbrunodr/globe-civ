// Units, civilizations and map sizes. Terrain rules live in terrain.ts,
// city rules and buildings in cities.ts.

import { BUILDINGS, WONDERS, type BuildingDef, type BuildingKey, type WonderDef, type WonderKey } from './cities.ts';
import type { ArchCiv } from './architecture.ts';
import type { StrategicKey } from './resources.ts';
export { BUILDINGS, WONDERS, type BuildingKey, type WonderKey };

export interface UnitDef {
  name: string;
  icon: string;
  // Its strengths: at close quarters, attacking or defending (`melee`: 0
  // for aircraft, which never close); shooting (`rangedAtk`: from the tile
  // next to its target, without moving in, its target never firing back;
  // none if it can't); and defending against fire (`rangedDef`: arrows,
  // shells, bombs). A unit that can shoot may still close in instead
  // (game.ts attack: an assault), and take a city so; one weak at close
  // quarters (bows, engines) does poorly at it.
  // How far it shoots (`reach`, tiles; 1 if not given): its shots pay for
  // the tiles they cross as movement does (game.ts fireReach: hills and
  // woods cost 2, mountains block), one more from hills.
  melee: number;
  rangedAtk?: number;
  reach?: number;
  rangedDef: number;
  mv: number;
  cost: number;
  civilian?: boolean;
  improves?: boolean; // a worker: builds its civ's improvements (game.ts improve)
  sight?: number;
  desc?: string;
  needs?: StrategicKey; // a strategic resource the civ must own (resources.ts)
  siege?: boolean;  // twice as strong against a city's walls, weaker against units (game.ts SIEGE_VS_UNITS)
  mounted?: boolean; // on horseback or wheels (anti-cavalry holds them off; some bonuses are theirs)
  armored?: boolean; // armour (mounted, but spears and pikes can't hold it: only anti-tank guns)
  // Counters (game.ts matchup): extra strength, a fraction, against
  vsMounted?: number; // horse and chariot (not armour), attacking or defending
  vsArmor?: number;   // armour, attacking or defending
  vsRanged?: number;  // archers, guns and siege engines, attacking them (a charge rides them down)
  vsShips?: number;   // ships, attacking or defending
  vsAir?: number;     // aircraft (anti-aircraft fire, fighters)
  carries?: number;   // aircraft it carries (a carrier: they base on it and go with it)
  aaRange?: number;   // anti-aircraft: enemy aircraft flying within this many tiles of it are fired on
  stealth?: boolean;  // an aircraft fighters can't intercept
  missile?: boolean;  // spent in its one strike (fighters can't catch it; anti-aircraft fire can)
  paradrop?: number;  // from its own city, dropped on any free land within this many tiles (its turn spent)
  amphibious?: boolean; // attacks from the water (embarked), straight onto the shore
  nuke?: number;      // a nuclear weapon: its blast reaches this many tiles round the target (game.ts detonate); spent
  domain?: Domain;    // where it goes (default land)
  range?: number;     // an aircraft's reach: tiles it strikes out to from its base (and rebases twice as far)
}
// Land units walk (and, once their civ has Shipbuilding, embark on the
// water: game.ts), ships sail the water and their civ's coastal cities,
// aircraft fly from cities.
export type Domain = 'land' | 'sea' | 'air';
export const domainOf = (d: UnitDef): Domain => d.domain ?? 'land';

// The units, in lines that upgrade era to era (UPGRADES), each with its
// counter: melee infantry; anti-cavalry (spears and pikes, then anti-tank
// guns) against horse; mounted (horse, then armour) fast and riding down
// archers and engines; ranged (bows, then crossbows and machine guns);
// siege engines against walls (catapult, trebuchet, cannon, artillery).
// At sea: ships that ram and board (galley, trireme, caravel, then ironclad
// and destroyer) and ships that bombard (galleass, frigate, battleship).
// In the air: fighters (which also intercept bombers), bombers, the
// helicopter; anti-aircraft guns guard the sky round them; a carrier takes
// aircraft to sea.
export const UNITS = {
  settler:  { name: 'Settler',  icon: 'S', melee: 1, rangedDef: 1, mv: 1, cost: 30, civilian: true, desc: 'Founds a city. Costs 1 population.' },
  worker:   { name: 'Worker',   icon: 'B', melee: 1, rangedDef: 1, mv: 2, cost: 20, civilian: true, improves: true, desc: 'Improves the land: farms, mines, pastures, camps and the rest, a few turns on the tile.' },
  scout:    { name: 'Scout',    icon: 'R', melee: 1, rangedDef: 1, mv: 2, cost: 10, sight: 3, desc: 'Fast explorer. Cannot attack.' },
  // ---- Ancient ----
  warrior:  { name: 'Warrior',  icon: 'W', melee: 1, rangedDef: 1, mv: 1, cost: 10 },
  spearman: { name: 'Spearman', icon: 'P', melee: 1.5, rangedDef: 2, mv: 1, cost: 20, vsMounted: 0.5, desc: 'Good defender; +50% against mounted units.' },
  slinger:  { name: 'Slinger',  icon: 'A', melee: 0.5, rangedAtk: 2, rangedDef: 1, mv: 1, cost: 15, desc: 'Ranged: slings stones from the next tile, unanswered. Weak at close quarters.' },
  archer:   { name: 'Archer',   icon: 'A', melee: 1, rangedAtk: 3, reach: 2, rangedDef: 2, mv: 1, cost: 25, desc: 'Ranged: shoots from the next tile, unanswered. Weak at close quarters.' },
  horseman: { name: 'Horseman', icon: 'H', melee: 1.5, rangedDef: 1, mv: 2, cost: 25, needs: 'horses', mounted: true, vsRanged: 0.5, desc: 'Fast; +50% attacking ranged and siege units. Needs Horses.' },
  chariotArcher: { name: 'Chariot Archer', icon: 'A', melee: 1, rangedAtk: 3, rangedDef: 1, mv: 2, cost: 30, mounted: true, needs: 'horses', desc: 'Fast ranged: shoots without moving in. Needs Horses.' },
  // ---- Classical ----
  horseArcher: { name: 'Horse Archer', icon: 'A', melee: 2.5, rangedAtk: 5, reach: 2, rangedDef: 3, mv: 2, cost: 45, mounted: true, needs: 'horses', desc: 'Fast ranged: shoots from the saddle without moving in. Needs Horses.' },
  swordsman: { name: 'Swordsman', icon: 'W', melee: 2.5, rangedDef: 2, mv: 1, cost: 35, needs: 'iron', desc: 'Strong infantry. Needs Iron.' },
  compositeBowman: { name: 'Composite Bowman', icon: 'A', melee: 1.5, rangedAtk: 4, reach: 2, rangedDef: 3, mv: 1, cost: 40, desc: 'Ranged: shoots from the next tile, unanswered. Weak at close quarters.' },
  catapult: { name: 'Catapult', icon: 'G', melee: 0.5, rangedAtk: 5, reach: 2, rangedDef: 1, mv: 1, cost: 35, siege: true, desc: 'Ranged siege: twice as strong against a city, weaker against units.' },
  // ---- Medieval ----
  manAtArms: { name: 'Man-at-Arms', icon: 'W', melee: 4, rangedDef: 4, mv: 1, cost: 50, desc: 'Armoured infantry with sword and shield.' },
  longswordsman: { name: 'Longswordsman', icon: 'W', melee: 4, rangedDef: 3, mv: 1, cost: 60, needs: 'iron', desc: 'Heavy infantry. Needs Iron.' },
  pikeman: { name: 'Pikeman', icon: 'P', melee: 3, rangedDef: 4, mv: 1, cost: 45, vsMounted: 1, desc: 'Holds the line; +100% against mounted units.' },
  crossbowman: { name: 'Crossbowman', icon: 'A', melee: 1.5, rangedAtk: 5, reach: 2, rangedDef: 3, mv: 1, cost: 50, desc: 'Ranged: shoots from the next tile, unanswered. Weak at close quarters.' },
  knight: { name: 'Knight', icon: 'K', melee: 4, rangedDef: 3, mv: 2, cost: 60, needs: 'horses', mounted: true, vsRanged: 0.5, desc: 'Heavy cavalry; +50% attacking ranged and siege units. Needs Horses.' },
  trebuchet: { name: 'Trebuchet', icon: 'G', melee: 1, rangedAtk: 7, reach: 2, rangedDef: 2, mv: 1, cost: 60, siege: true, desc: 'Ranged siege: twice as strong against a city, weaker against units.' },
  // ---- Renaissance ----
  explorer: { name: 'Explorer', icon: 'R', melee: 2, rangedDef: 2, mv: 3, cost: 30, sight: 3, desc: 'A fast explorer that sees far. Cannot attack.' },
  fieldCannon: { name: 'Field Cannon', icon: 'A', melee: 4, rangedAtk: 8, reach: 2, rangedDef: 6, mv: 1, cost: 85, desc: 'Ranged: a light gun against units.' },
  musketman: { name: 'Musketman', icon: 'M', melee: 7, rangedAtk: 5, rangedDef: 7, mv: 1, cost: 80, desc: 'Gunpowder infantry.' },
  lancer: { name: 'Lancer', icon: 'K', melee: 6, rangedDef: 4, mv: 2, cost: 85, needs: 'horses', mounted: true, vsMounted: 0.5, vsRanged: 0.5, desc: 'Shock cavalry; +50% against mounted units and attacking ranged and siege units. Needs Horses.' },
  cannon: { name: 'Cannon', icon: 'G', melee: 2, rangedAtk: 9, reach: 2, rangedDef: 3, mv: 1, cost: 90, siege: true, needs: 'niter', desc: 'Ranged siege: twice as strong against a city, weaker against units. Needs Niter.' },
  // ---- Industrial ----
  greatWarInfantry: { name: 'Great War Infantry', icon: 'I', melee: 13.5, rangedAtk: 9, rangedDef: 14, mv: 1, cost: 150, desc: 'Trench infantry.' },
  rifleman: { name: 'Rifleman', icon: 'R', melee: 10.5, rangedAtk: 7, rangedDef: 11, mv: 1, cost: 120, desc: 'Line infantry.' },
  gatlingGun: { name: 'Gatling Gun', icon: 'A', melee: 7, rangedAtk: 9, rangedDef: 10, mv: 1, cost: 110, desc: 'Ranged and a stout defender.' },
  cavalry: { name: 'Cavalry', icon: 'K', melee: 9.5, rangedDef: 7, mv: 3, cost: 130, needs: 'horses', mounted: true, vsRanged: 0.5, desc: 'Fast; +50% attacking ranged and siege units. Needs Horses.' },
  artillery: { name: 'Artillery', icon: 'G', melee: 3, rangedAtk: 15, reach: 3, rangedDef: 5, mv: 1, cost: 160, siege: true, needs: 'niter', desc: 'Ranged siege: twice as strong against a city, weaker against units. Needs Niter.' },
  machineGun: { name: 'Machine Gun', icon: 'A', melee: 10, rangedAtk: 13, reach: 2, rangedDef: 14, mv: 1, cost: 150, desc: 'Ranged and a stout defender.' },
  // ---- Modern ----
  marine: { name: 'Marine', icon: 'I', melee: 15.5, rangedAtk: 11, rangedDef: 15, mv: 2, cost: 200, amphibious: true, desc: 'Amphibious: attacks straight from the water onto the shore.' },
  infantry: { name: 'Infantry', icon: 'I', melee: 16, rangedAtk: 10.5, reach: 2, rangedDef: 17, mv: 2, cost: 180, desc: 'Modern infantry.' },
  antiTank: { name: 'Anti-Tank Gun', icon: 'P', melee: 10, rangedAtk: 12, reach: 2, rangedDef: 14, mv: 2, cost: 150, vsMounted: 1, vsArmor: 1, desc: 'Ranged; +100% against armour and mounted units.' },
  landship: { name: 'Landship', icon: 'T', melee: 13.5, rangedDef: 11, mv: 2, cost: 190, needs: 'oil', mounted: true, armored: true, vsRanged: 0.5, desc: 'Early armour; +50% attacking ranged and siege units. Needs Oil.' },
  tank: { name: 'Tank', icon: 'T', melee: 17, rangedDef: 14, mv: 3, cost: 220, needs: 'oil', mounted: true, armored: true, vsRanged: 0.5, desc: 'Armour; +50% attacking ranged and siege units. Needs Oil.' },
  // ---- at sea ----
  galley: { name: 'Galley', icon: 'N', melee: 2, rangedDef: 2, mv: 3, cost: 30, domain: 'sea', desc: 'An oared warship: rams and boards ships at sea. Sails the water and its own coastal cities.' },
  trireme: { name: 'Trireme', icon: 'N', melee: 3.5, rangedDef: 3, mv: 3, cost: 45, domain: 'sea', desc: 'A ramming warship.' },
  galleass: { name: 'Galleass', icon: 'N', melee: 4, rangedAtk: 6, reach: 2, rangedDef: 4, mv: 3, cost: 60, domain: 'sea', desc: 'Ranged: its guns bombard ships and the coast.' },
  cog: { name: 'Cog', icon: 'N', melee: 5, rangedDef: 5, mv: 3, cost: 60, domain: 'sea', desc: 'A sturdy sailing warship with fighting castles.' },
  caravel: { name: 'Caravel', icon: 'N', melee: 6.5, rangedDef: 6, mv: 4, cost: 80, domain: 'sea', sight: 3, desc: 'A fast ocean-going ship; sees far.' },
  frigate: { name: 'Frigate', icon: 'N', melee: 7, rangedAtk: 10, reach: 2, rangedDef: 7, mv: 4, cost: 100, domain: 'sea', needs: 'iron', desc: 'Ranged: broadsides against ships and the coast. Needs Iron.' },
  ironclad: { name: 'Ironclad', icon: 'N', melee: 13, rangedDef: 12, mv: 4, cost: 140, domain: 'sea', needs: 'coal', desc: 'A steam warship in armour. Needs Coal.' },
  destroyer: { name: 'Destroyer', icon: 'N', melee: 16.5, rangedDef: 15, mv: 5, cost: 190, domain: 'sea', needs: 'oil', desc: 'A fast steel warship. Needs Oil.' },
  privateer: { name: 'Privateer', icon: 'N', melee: 8, rangedDef: 7, mv: 5, cost: 90, domain: 'sea', desc: 'A fast raider: boards and takes ships.' },
  shipOfTheLine: { name: 'Ship of the Line', icon: 'N', melee: 11, rangedAtk: 13, reach: 2, rangedDef: 11, mv: 4, cost: 120, domain: 'sea', needs: 'iron', desc: 'Ranged: three decks of guns against ships and the coast. Needs Iron.' },
  cruiser: { name: 'Cruiser', icon: 'N', melee: 12, rangedAtk: 16, reach: 3, rangedDef: 12, mv: 5, cost: 160, domain: 'sea', needs: 'coal', desc: 'Ranged: steam and steel, its guns against ships and the coast. Needs Coal.' },
  submarine: { name: 'Submarine', icon: 'N', melee: 14, rangedDef: 8, mv: 4, cost: 170, domain: 'sea', vsShips: 0.5, desc: 'Attacks only ships, +50% against them.' },
  carrier: { name: 'Carrier', icon: 'N', melee: 14, rangedDef: 14, mv: 4, cost: 200, domain: 'sea', carries: 3, needs: 'oil', desc: 'Carries up to 3 aircraft: they base on it and go where it goes. Cannot attack. Needs Oil.' },
  battleship: { name: 'Battleship', icon: 'N', melee: 18, rangedAtk: 22, reach: 3, rangedDef: 18, mv: 4, cost: 240, domain: 'sea', needs: 'oil', desc: 'Ranged: great guns against ships and the coast. Needs Oil.' },
  // ---- in the air ----
  airship: { name: 'Airship', icon: 'B', melee: 0, rangedAtk: 10, rangedDef: 4, mv: 1, cost: 140, domain: 'air', siege: true, range: 5, desc: 'An early bomber: strikes from its city out to 5 tiles; twice as strong against a city.' },
  fighter: { name: 'Fighter', icon: 'F', melee: 0, rangedAtk: 12, rangedDef: 10, mv: 1, cost: 180, domain: 'air', range: 5, needs: 'oil', desc: 'Strikes from its city out to 5 tiles; intercepts enemy bombers striking near it. Only fighters can reach aircraft. Needs Oil.' },
  bomber: { name: 'Bomber', icon: 'B', melee: 0, rangedAtk: 22, rangedDef: 6, mv: 1, cost: 220, domain: 'air', siege: true, range: 7, needs: 'oil', desc: 'Strikes from its city out to 7 tiles; twice as strong against a city. Needs Oil.' },
  heavyBomber: { name: 'Heavy Bomber', icon: 'B', melee: 0, rangedAtk: 30, rangedDef: 8, mv: 1, cost: 280, domain: 'air', siege: true, range: 9, needs: 'oil', desc: 'Strikes from its city out to 9 tiles; twice as strong against a city. Needs Oil.' },
  jetFighter: { name: 'Jet Fighter', icon: 'F', melee: 0, rangedAtk: 20, rangedDef: 16, mv: 1, cost: 260, domain: 'air', range: 7, vsAir: 0.5, needs: 'oil', desc: 'Strikes out to 7 tiles; intercepts enemy aircraft striking near it, +50% against aircraft. Needs Oil.' },
  helicopter: { name: 'Helicopter', icon: 'F', melee: 0, rangedAtk: 18, rangedDef: 10, mv: 1, cost: 220, domain: 'air', range: 3, vsArmor: 0.5, needs: 'oil', desc: 'Strikes out to 3 tiles; +50% against armour. Needs Oil.' },
  antiAircraft: { name: 'Anti-Aircraft Gun', icon: 'P', melee: 8.5, rangedAtk: 6, reach: 2, rangedDef: 12, mv: 2, cost: 150, vsAir: 1, aaRange: 2, desc: 'Guards the sky: fires on enemy aircraft flying within 2 tiles of it (+100% against aircraft).' },
  // ---- Information ----
  mechanizedInfantry: { name: 'Mechanized Infantry', icon: 'I', melee: 23.5, rangedAtk: 15.5, reach: 2, rangedDef: 25, mv: 3, cost: 260, desc: 'Infantry in armoured carriers.' },
  specialForces: { name: 'Special Forces', icon: 'I', melee: 18, rangedAtk: 14, reach: 2, rangedDef: 16, mv: 3, cost: 240, sight: 3, desc: 'Fast elite infantry that sees far.' },
  paratrooper: { name: 'Paratrooper', icon: 'I', melee: 19, rangedAtk: 14, reach: 2, rangedDef: 18, mv: 2, cost: 260, paradrop: 6, desc: 'From its own city, drops on any free land within 6 tiles.' },
  modernArmor: { name: 'Modern Armour', icon: 'T', melee: 26, rangedDef: 22, mv: 4, cost: 320, needs: 'oil', mounted: true, armored: true, vsRanged: 0.5, desc: 'Armour; +50% attacking ranged and siege units. Needs Oil.' },
  rocketArtillery: { name: 'Rocket Artillery', icon: 'G', melee: 5, rangedAtk: 26, reach: 3, rangedDef: 8, mv: 2, cost: 280, siege: true, desc: 'Ranged siege: twice as strong against a city, weaker against units.' },
  mobileSAM: { name: 'Mobile SAM', icon: 'P', melee: 12.5, rangedAtk: 10, reach: 3, rangedDef: 18, mv: 3, cost: 240, vsAir: 1, aaRange: 3, desc: 'Guards the sky: fires on enemy aircraft flying within 3 tiles of it (+100% against aircraft).' },
  missileCruiser: { name: 'Missile Cruiser', icon: 'N', melee: 24, rangedAtk: 30, reach: 3, rangedDef: 24, mv: 5, cost: 320, domain: 'sea', needs: 'oil', desc: 'Ranged: missiles against ships and the coast. Needs Oil.' },
  nuclearSubmarine: { name: 'Nuclear Submarine', icon: 'N', melee: 20, rangedDef: 12, mv: 5, cost: 300, domain: 'sea', vsShips: 0.5, desc: 'Attacks only ships, +50% against them.' },
  stealthFighter: { name: 'Stealth Fighter', icon: 'F', melee: 0, rangedAtk: 28, rangedDef: 20, mv: 1, cost: 330, domain: 'air', range: 8, vsAir: 0.5, stealth: true, needs: 'oil', desc: 'Strikes out to 8 tiles; intercepts enemy aircraft (+50% against them); fighters can\'t intercept it. Needs Oil.' },
  stealthBomber: { name: 'Stealth Bomber', icon: 'B', melee: 0, rangedAtk: 36, rangedDef: 10, mv: 1, cost: 340, domain: 'air', siege: true, range: 10, stealth: true, needs: 'oil', desc: 'Strikes out to 10 tiles, twice as strong against a city; fighters can\'t intercept it. Needs Oil.' },
  attackHelicopter: { name: 'Attack Helicopter', icon: 'F', melee: 0, rangedAtk: 28, rangedDef: 14, mv: 1, cost: 300, domain: 'air', range: 4, vsArmor: 0.5, needs: 'oil', desc: 'Strikes out to 4 tiles; +50% against armour. Needs Oil.' },
  drone: { name: 'Drone', icon: 'F', melee: 0, rangedAtk: 18, rangedDef: 4, mv: 1, cost: 150, domain: 'air', range: 6, desc: 'A cheap unmanned aircraft: strikes out to 6 tiles.' },
  guidedMissile: { name: 'Guided Missile', icon: 'B', melee: 0, rangedAtk: 34, rangedDef: 1, mv: 1, cost: 120, domain: 'air', range: 8, missile: true, desc: 'Strikes once out to 8 tiles, and is spent. Fighters can\'t catch it; anti-aircraft fire can.' },
  atomicBomb: { name: 'Atomic Bomb', icon: 'B', melee: 0, rangedAtk: 40, rangedDef: 2, mv: 1, cost: 450, domain: 'air', range: 8, nuke: 1, desc: 'Flown out to 8 tiles and dropped: wrecks every unit on and round the target, halves a city, burns its land for years. Fighters and anti-aircraft fire can stop it. Spent.' },
  nuclearMissile: { name: 'Nuclear Missile', icon: 'B', melee: 0, rangedAtk: 60, rangedDef: 2, mv: 1, cost: 600, domain: 'air', range: 12, nuke: 2, missile: true, desc: 'Strikes out to 12 tiles: a blast two tiles round the target, wrecking units, halving cities and burning the land. Only anti-aircraft fire can stop it. Spent.' },
  commander: { name: 'Commander', icon: 'C', melee: 2, rangedDef: 2, mv: 2, cost: 40, desc: 'Leads an army: rallies up to 4 units from its tile and the tiles next to it, which then march with it as one; deploys them again there. A fighting unit may share its tile. Its army defends it; if it falls, its army is lost.' },
} satisfies Record<string, UnitDef>;
export type UnitKey = keyof typeof UNITS;
// What each unit can be upgraded to (game.ts upgrade), once unlocked.
export const UPGRADES: Partial<Record<UnitKey, UnitKey>> = {
  warrior: 'swordsman', swordsman: 'manAtArms', manAtArms: 'longswordsman', longswordsman: 'musketman', musketman: 'rifleman', rifleman: 'greatWarInfantry', greatWarInfantry: 'infantry', infantry: 'mechanizedInfantry',
  scout: 'explorer', explorer: 'specialForces', slinger: 'archer', antiAircraft: 'mobileSAM', marine: 'paratrooper',
  spearman: 'pikeman', pikeman: 'musketman',
  archer: 'compositeBowman', compositeBowman: 'crossbowman', crossbowman: 'fieldCannon', fieldCannon: 'gatlingGun', gatlingGun: 'machineGun',
  horseman: 'knight', chariotArcher: 'horseArcher', horseArcher: 'cavalry', knight: 'lancer', lancer: 'cavalry', cavalry: 'landship', landship: 'tank', tank: 'modernArmor',
  catapult: 'trebuchet', trebuchet: 'cannon', cannon: 'artillery', artillery: 'rocketArtillery',
  galley: 'trireme', trireme: 'cog', cog: 'caravel', caravel: 'privateer', privateer: 'ironclad', ironclad: 'destroyer',
  galleass: 'frigate', frigate: 'shipOfTheLine', shipOfTheLine: 'cruiser', cruiser: 'battleship', battleship: 'missileCruiser', submarine: 'nuclearSubmarine',
  atomicBomb: 'nuclearMissile', airship: 'bomber', bomber: 'heavyBomber', heavyBomber: 'stealthBomber', fighter: 'jetFighter', jetFighter: 'stealthFighter', helicopter: 'attackHelicopter',
};
export const unitDef = (k: UnitKey): UnitDef => UNITS[k];

export type BuildKey = UnitKey | BuildingKey | WonderKey;
export const isUnitKey = (k: BuildKey): k is UnitKey => k in UNITS;
export const isWonder = (k: BuildKey): k is WonderKey => k in WONDERS;
export const buildDef = (k: BuildKey): UnitDef | BuildingDef | WonderDef => (isUnitKey(k) ? UNITS[k] : isWonder(k) ? WONDERS[k] : BUILDINGS[k]);

export interface CivDef {
  name: ArchCiv;
  color: string;
  cities: string[];
}

// The civs (architecture.ts ARCH_CIVS, each with its own buildings), in the
// order a game takes them: the first is the human's, the rest rivals, as
// many as the map has starts.
export const CIVS: readonly CivDef[] = [
  { name: 'Romans', color: '#e03131', cities: ['Rome', 'Antium', 'Cumae', 'Neapolis', 'Ravenna', 'Arretium', 'Mediolanum', 'Arpinum', 'Circei', 'Setia'] },
  { name: 'Egyptians', color: '#f5c518', cities: ['Thebes', 'Memphis', 'Heliopolis', 'Elephantine', 'Alexandria', 'Pi-Ramesses', 'Giza', 'Byblos', 'Akhetaten', 'Abydos'] },
  { name: 'Babylonians', color: '#a259ff', cities: ['Babylon', 'Ur', 'Nineveh', 'Uruk', 'Nippur', 'Lagash', 'Eridu', 'Kish', 'Larsa', 'Sippar'] },
  { name: 'Chinese', color: '#ff5fb7', cities: ['Beijing', 'Xian', 'Luoyang', 'Nanjing', 'Kaifeng', 'Chengdu', 'Hangzhou', 'Anyang', 'Wuhan', 'Guangzhou'] },
  { name: 'Aztecs', color: '#ff8a1f', cities: ['Tenochtitlan', 'Texcoco', 'Tlacopan', 'Tlatelolco', 'Xochimilco', 'Chalco', 'Coyoacan', 'Tula', 'Cholula', 'Azcapotzalco'] },
  { name: 'Persians', color: '#22d3ee', cities: ['Persepolis', 'Pasargadae', 'Susa', 'Ecbatana', 'Tarsus', 'Gordium', 'Bactra', 'Sardis', 'Rhagae', 'Nisa'] },
  { name: 'Greeks', color: '#f1f3f5', cities: ['Athens', 'Sparta', 'Corinth', 'Argos', 'Knossos', 'Mycenae', 'Pharsalos', 'Ephesus', 'Delphi', 'Rhodes'] },
  { name: 'Mongols', color: '#8d5a3b', cities: ['Karakorum', 'Beshbalik', 'Turfan', 'Hsia', 'Old Sarai', 'Almarikh', 'Kashgar', 'Khotan', 'Kara Khoto', 'Uliastai'] },
  { name: 'Indians', color: '#00e676', cities: ['Delhi', 'Pataliputra', 'Varanasi', 'Agra', 'Calcutta', 'Lahore', 'Bombay', 'Vijayanagara', 'Madras', 'Ujjain'] },
  { name: 'English', color: '#c2255c', cities: ['London', 'York', 'Nottingham', 'Hastings', 'Canterbury', 'Coventry', 'Warwick', 'Dover', 'Bristol', 'Oxford'] },
  { name: 'Japanese', color: '#ffffff', cities: ['Kyoto', 'Osaka', 'Tokyo', 'Nara', 'Kamakura', 'Edo', 'Nagasaki', 'Sendai', 'Kanazawa', 'Hiroshima'] },
  { name: 'French', color: '#4263eb', cities: ['Paris', 'Orleans', 'Lyon', 'Tours', 'Chartres', 'Reims', 'Rouen', 'Bordeaux', 'Marseille', 'Avignon'] },
  { name: 'Germans', color: '#5c7cfa', cities: ['Berlin', 'Leipzig', 'Hamburg', 'Bremen', 'Frankfurt', 'Bonn', 'Nuremberg', 'Cologne', 'Munich', 'Dresden'] },
  { name: 'Russians', color: '#adb5bd', cities: ['Moscow', 'Novgorod', 'Kiev', 'Vladimir', 'Smolensk', 'Pskov', 'Tver', 'Kazan', 'Yaroslavl', 'Suzdal'] },
  { name: 'Spanish', color: '#ffd43b', cities: ['Madrid', 'Seville', 'Toledo', 'Cordoba', 'Barcelona', 'Valencia', 'Granada', 'Salamanca', 'Burgos', 'Zaragoza'] },
  { name: 'Vikings', color: '#1098ad', cities: ['Trondheim', 'Kaupang', 'Hedeby', 'Uppsala', 'Birka', 'Ribe', 'Roskilde', 'Bergen', 'Jorvik', 'Dublin'] },
  { name: 'Hebrews', color: '#74c0fc', cities: ['Jerusalem', 'Hebron', 'Shiloh', 'Bethel', 'Beersheba', 'Samaria', 'Jericho', 'Megiddo', 'Hazor', 'Gezer'] },
  { name: 'Ethiopians', color: '#2b8a3e', cities: ['Aksum', 'Adulis', 'Lalibela', 'Gondar', 'Yeha', 'Harar', 'Debre Berhan', 'Matara', 'Qohaito', 'Tigray'] },
];

// Tile counts chosen to match Civilization VI map sizes (a Goldberg globe of
// frequency n has 10n² + 2 tiles).
export interface MapSize {
  name: string;
  n: number;
  players: number; // including the human
  civEquivalent: string;
}

export const MAP_SIZES = {
  small:  { name: 'Small',  n: 18, players: 6,  civEquivalent: 'Civ VI Small (66×42 = 2,772 tiles)' },
  medium: { name: 'Medium', n: 21, players: 8,  civEquivalent: 'Civ VI Standard (84×54 = 4,536 tiles)' },
  large:  { name: 'Large',  n: 24, players: 10, civEquivalent: 'Civ VI Large (96×60 = 5,760 tiles)' },
} satisfies Record<string, MapSize>;
export type MapSizeKey = keyof typeof MAP_SIZES;
export const tileCount = (n: number): number => 10 * n * n + 2;

// Map scripts: where the land comes from (mapgen.ts). Continents are grown
// from the seed; the Earth is the real one (earth.ts).
export const MAP_SCRIPTS = {
  continents: { name: 'Continents' },
  earth: { name: 'Earth' },
} satisfies Record<string, { name: string }>;
export type MapScriptKey = keyof typeof MAP_SCRIPTS;
export const isMapScript = (s: string): s is MapScriptKey => s in MAP_SCRIPTS;

// Food for the next citizen (lighter than Civ V's: tiles are lean, terrain.ts).
export const growthCost = (pop: number): number => Math.floor(12 + 6 * (pop - 1) + Math.pow(pop - 1, 1.5));
