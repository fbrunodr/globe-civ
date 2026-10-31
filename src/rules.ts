// Units, civilizations and map sizes. Terrain rules live in terrain.ts,
// city rules and buildings in cities.ts.

import { BUILDINGS, WONDERS, type BuildingDef, type BuildingKey, type WonderDef, type WonderKey } from './cities.ts';
import type { ArchCiv } from './architecture.ts';
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
}

export const UNITS = {
  settler:  { name: 'Settler',  icon: 'S', atk: 0, def: 1, mv: 1, cost: 30, civilian: true, desc: 'Founds a city. Costs 1 population.' },
  scout:    { name: 'Scout',    icon: 'R', atk: 0, def: 1, mv: 2, cost: 10, sight: 3, desc: 'Fast explorer. Cannot attack.' },
  warrior:  { name: 'Warrior',  icon: 'W', atk: 1, def: 1, mv: 1, cost: 10 },
  spearman: { name: 'Spearman', icon: 'P', atk: 1, def: 2, mv: 1, cost: 20, desc: 'Good defender.' },
  archer:   { name: 'Archer',   icon: 'A', atk: 3, def: 2, mv: 1, cost: 25, ranged: true, desc: 'Ranged: attacks without moving in, taking half the damage back. Cannot take cities.' },
  horseman: { name: 'Horseman', icon: 'H', atk: 2, def: 1, mv: 2, cost: 20 },
  commander: { name: 'Commander', icon: 'C', atk: 0, def: 2, mv: 2, cost: 40, desc: 'Leads an army: rallies up to 4 units from its tile and the tiles next to it, which then march with it as one; deploys them again there. A fighting unit may share its tile. Its army defends it; if it falls, its army is lost.' },
} satisfies Record<string, UnitDef>;
export type UnitKey = keyof typeof UNITS;
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

export const growthCost = (pop: number): number => Math.floor(15 + 8 * (pop - 1) + Math.pow(pop - 1, 1.5));
