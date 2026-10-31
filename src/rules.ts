// Units, civilizations and map sizes. Terrain rules live in terrain.ts,
// city rules and buildings in cities.ts.

import { BUILDINGS, WONDERS, type BuildingDef, type BuildingKey, type WonderDef, type WonderKey } from './cities.ts';
import type { ArchCiv } from './architecture.ts';
import type { StrategicKey } from './resources.ts';
export { BUILDINGS, WONDERS, type BuildingKey, type WonderKey };

export interface UnitDef {
  name: string;
  icon: string;
  atk: number;
  def: number;
  mv: number;
  cost: number;
  civilian?: boolean;
  ranged?: boolean; // attacks without moving in (and can never take a city)
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
// In the air: fighters (which also intercept bombers) and bombers.
export const UNITS = {
  settler:  { name: 'Settler',  icon: 'S', atk: 0, def: 1, mv: 1, cost: 30, civilian: true, desc: 'Founds a city. Costs 1 population.' },
  scout:    { name: 'Scout',    icon: 'R', atk: 0, def: 1, mv: 2, cost: 10, sight: 3, desc: 'Fast explorer. Cannot attack.' },
  // ---- Ancient ----
  warrior:  { name: 'Warrior',  icon: 'W', atk: 1, def: 1, mv: 1, cost: 10 },
  spearman: { name: 'Spearman', icon: 'P', atk: 1, def: 2, mv: 1, cost: 20, vsMounted: 0.5, desc: 'Good defender; +50% against mounted units.' },
  archer:   { name: 'Archer',   icon: 'A', atk: 3, def: 2, mv: 1, cost: 25, ranged: true, desc: 'Ranged: attacks without moving in, taking half the damage back. Cannot take cities.' },
  horseman: { name: 'Horseman', icon: 'H', atk: 2, def: 1, mv: 2, cost: 25, needs: 'horses', mounted: true, vsRanged: 0.5, desc: 'Fast; +50% attacking ranged and siege units. Needs Horses.' },
  chariotArcher: { name: 'Chariot Archer', icon: 'A', atk: 3, def: 1, mv: 2, cost: 30, ranged: true, mounted: true, needs: 'horses', desc: 'Fast ranged: shoots without moving in. Cannot take cities. Needs Horses.' },
  // ---- Classical ----
  swordsman: { name: 'Swordsman', icon: 'W', atk: 3, def: 2, mv: 1, cost: 35, needs: 'iron', desc: 'Strong infantry. Needs Iron.' },
  compositeBowman: { name: 'Composite Bowman', icon: 'A', atk: 4, def: 3, mv: 1, cost: 40, ranged: true, desc: 'Ranged: attacks without moving in, taking half the damage back. Cannot take cities.' },
  catapult: { name: 'Catapult', icon: 'G', atk: 5, def: 1, mv: 1, cost: 35, ranged: true, siege: true, desc: 'Ranged siege: twice as strong against a city, weaker against units. Cannot take cities.' },
  // ---- Medieval ----
  longswordsman: { name: 'Longswordsman', icon: 'W', atk: 5, def: 3, mv: 1, cost: 60, needs: 'iron', desc: 'Heavy infantry. Needs Iron.' },
  pikeman: { name: 'Pikeman', icon: 'P', atk: 2, def: 4, mv: 1, cost: 45, vsMounted: 1, desc: 'Holds the line; +100% against mounted units.' },
  crossbowman: { name: 'Crossbowman', icon: 'A', atk: 5, def: 3, mv: 1, cost: 50, ranged: true, desc: 'Ranged: attacks without moving in, taking half the damage back. Cannot take cities.' },
  knight: { name: 'Knight', icon: 'K', atk: 5, def: 3, mv: 2, cost: 60, needs: 'horses', mounted: true, vsRanged: 0.5, desc: 'Heavy cavalry; +50% attacking ranged and siege units. Needs Horses.' },
  trebuchet: { name: 'Trebuchet', icon: 'G', atk: 7, def: 2, mv: 1, cost: 60, ranged: true, siege: true, desc: 'Ranged siege: twice as strong against a city, weaker against units. Cannot take cities.' },
  // ---- Renaissance ----
  musketman: { name: 'Musketman', icon: 'M', atk: 7, def: 7, mv: 1, cost: 80, desc: 'Gunpowder infantry.' },
  lancer: { name: 'Lancer', icon: 'K', atk: 8, def: 4, mv: 2, cost: 85, needs: 'horses', mounted: true, vsMounted: 0.5, vsRanged: 0.5, desc: 'Shock cavalry; +50% against mounted units and attacking ranged and siege units. Needs Horses.' },
  cannon: { name: 'Cannon', icon: 'G', atk: 9, def: 3, mv: 1, cost: 90, ranged: true, siege: true, needs: 'niter', desc: 'Ranged siege: twice as strong against a city, weaker against units. Cannot take cities. Needs Niter.' },
  // ---- Industrial ----
  rifleman: { name: 'Rifleman', icon: 'R', atk: 10, def: 11, mv: 1, cost: 120, desc: 'Line infantry.' },
  gatlingGun: { name: 'Gatling Gun', icon: 'A', atk: 9, def: 10, mv: 1, cost: 110, ranged: true, desc: 'Ranged and a stout defender. Cannot take cities.' },
  cavalry: { name: 'Cavalry', icon: 'K', atk: 12, def: 7, mv: 3, cost: 130, needs: 'horses', mounted: true, vsRanged: 0.5, desc: 'Fast; +50% attacking ranged and siege units. Needs Horses.' },
  artillery: { name: 'Artillery', icon: 'G', atk: 15, def: 5, mv: 1, cost: 160, ranged: true, siege: true, needs: 'niter', desc: 'Ranged siege: twice as strong against a city, weaker against units. Cannot take cities. Needs Niter.' },
  machineGun: { name: 'Machine Gun', icon: 'A', atk: 13, def: 14, mv: 1, cost: 150, ranged: true, desc: 'Ranged and a stout defender. Cannot take cities.' },
  // ---- Modern ----
  infantry: { name: 'Infantry', icon: 'I', atk: 15, def: 17, mv: 2, cost: 180, desc: 'Modern infantry.' },
  antiTank: { name: 'Anti-Tank Gun', icon: 'P', atk: 12, def: 14, mv: 2, cost: 150, ranged: true, vsMounted: 1, vsArmor: 1, desc: 'Ranged; +100% against armour and mounted units. Cannot take cities.' },
  landship: { name: 'Landship', icon: 'T', atk: 16, def: 11, mv: 2, cost: 190, needs: 'oil', mounted: true, armored: true, vsRanged: 0.5, desc: 'Early armour; +50% attacking ranged and siege units. Needs Oil.' },
  tank: { name: 'Tank', icon: 'T', atk: 20, def: 14, mv: 3, cost: 220, needs: 'oil', mounted: true, armored: true, vsRanged: 0.5, desc: 'Armour; +50% attacking ranged and siege units. Needs Oil.' },
  // ---- at sea ----
  galley: { name: 'Galley', icon: 'N', atk: 2, def: 2, mv: 3, cost: 30, domain: 'sea', desc: 'An oared warship: rams and boards ships at sea. Sails the water and its own coastal cities.' },
  trireme: { name: 'Trireme', icon: 'N', atk: 4, def: 3, mv: 3, cost: 45, domain: 'sea', desc: 'A ramming warship.' },
  galleass: { name: 'Galleass', icon: 'N', atk: 6, def: 4, mv: 3, cost: 60, domain: 'sea', ranged: true, desc: 'Ranged: its guns bombard ships and the coast.' },
  caravel: { name: 'Caravel', icon: 'N', atk: 7, def: 6, mv: 4, cost: 80, domain: 'sea', sight: 3, desc: 'A fast ocean-going ship; sees far.' },
  frigate: { name: 'Frigate', icon: 'N', atk: 10, def: 7, mv: 4, cost: 100, domain: 'sea', ranged: true, needs: 'iron', desc: 'Ranged: broadsides against ships and the coast. Needs Iron.' },
  ironclad: { name: 'Ironclad', icon: 'N', atk: 14, def: 12, mv: 4, cost: 140, domain: 'sea', needs: 'coal', desc: 'A steam warship in armour. Needs Coal.' },
  destroyer: { name: 'Destroyer', icon: 'N', atk: 18, def: 15, mv: 5, cost: 190, domain: 'sea', needs: 'oil', desc: 'A fast steel warship. Needs Oil.' },
  battleship: { name: 'Battleship', icon: 'N', atk: 22, def: 18, mv: 4, cost: 240, domain: 'sea', ranged: true, needs: 'oil', desc: 'Ranged: great guns against ships and the coast. Needs Oil.' },
  // ---- in the air ----
  fighter: { name: 'Fighter', icon: 'F', atk: 12, def: 10, mv: 1, cost: 180, domain: 'air', ranged: true, range: 5, needs: 'oil', desc: 'Strikes from its city out to 5 tiles; intercepts enemy bombers striking near it. Only fighters can reach aircraft. Needs Oil.' },
  bomber: { name: 'Bomber', icon: 'B', atk: 22, def: 6, mv: 1, cost: 220, domain: 'air', ranged: true, siege: true, range: 7, needs: 'oil', desc: 'Strikes from its city out to 7 tiles; twice as strong against a city. Needs Oil.' },
  commander: { name: 'Commander', icon: 'C', atk: 0, def: 2, mv: 2, cost: 40, desc: 'Leads an army: rallies up to 4 units from its tile and the tiles next to it, which then march with it as one; deploys them again there. A fighting unit may share its tile. Its army defends it; if it falls, its army is lost.' },
} satisfies Record<string, UnitDef>;
export type UnitKey = keyof typeof UNITS;
// What each unit can be upgraded to (game.ts upgrade), once unlocked.
export const UPGRADES: Partial<Record<UnitKey, UnitKey>> = {
  warrior: 'swordsman', swordsman: 'longswordsman', longswordsman: 'musketman', musketman: 'rifleman', rifleman: 'infantry',
  spearman: 'pikeman', pikeman: 'musketman',
  archer: 'compositeBowman', compositeBowman: 'crossbowman', crossbowman: 'gatlingGun', gatlingGun: 'machineGun',
  horseman: 'knight', chariotArcher: 'knight', knight: 'lancer', lancer: 'cavalry', cavalry: 'landship', landship: 'tank',
  catapult: 'trebuchet', trebuchet: 'cannon', cannon: 'artillery',
  galley: 'trireme', trireme: 'caravel', caravel: 'ironclad', ironclad: 'destroyer',
  galleass: 'frigate', frigate: 'battleship',
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
