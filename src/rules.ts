// Units, buildings, civilizations and map sizes. Terrain rules live in terrain.ts.

export interface UnitDef {
  name: string;
  icon: string;
  atk: number;
  def: number;
  mv: number;
  cost: number;
  civilian?: boolean;
  sight?: number;
  desc?: string;
}

export interface BuildingDef {
  name: string;
  cost: number;
  desc: string;
}

export const UNITS = {
  settler:  { name: 'Settler',  icon: 'S', atk: 0, def: 1, mv: 1, cost: 30, civilian: true, desc: 'Founds a city. Costs 1 population.' },
  scout:    { name: 'Scout',    icon: 'R', atk: 0, def: 1, mv: 2, cost: 10, sight: 3, desc: 'Fast explorer. Cannot attack.' },
  warrior:  { name: 'Warrior',  icon: 'W', atk: 1, def: 1, mv: 1, cost: 10 },
  spearman: { name: 'Spearman', icon: 'P', atk: 1, def: 2, mv: 1, cost: 20, desc: 'Good defender.' },
  archer:   { name: 'Archer',   icon: 'A', atk: 3, def: 2, mv: 1, cost: 25 },
  horseman: { name: 'Horseman', icon: 'H', atk: 2, def: 1, mv: 2, cost: 20 },
} satisfies Record<string, UnitDef>;
export type UnitKey = keyof typeof UNITS;
export const unitDef = (k: UnitKey): UnitDef => UNITS[k];

export const BUILDINGS = {
  walls:   { name: 'Walls',   cost: 30, desc: '+100% defense for units in the city.' },
  granary: { name: 'Granary', cost: 40, desc: 'Keeps half the food when the city grows.' },
} satisfies Record<string, BuildingDef>;
export type BuildingKey = keyof typeof BUILDINGS;

export type BuildKey = UnitKey | BuildingKey;
export const isUnitKey = (k: BuildKey): k is UnitKey => k in UNITS;
export const buildDef = (k: BuildKey): UnitDef | BuildingDef => (isUnitKey(k) ? UNITS[k] : BUILDINGS[k]);

export interface CivDef {
  name: string;
  color: string;
  cities: string[];
}

export const CIVS: CivDef[] = [
  { name: 'Atlantis', color: '#3d8bfd', cities: ['Poseidonis', 'Atlas', 'Gadeira', 'Ampheres', 'Evaemon', 'Mneseus', 'Autochthon', 'Elasippus', 'Mestor', 'Azaes', 'Diaprepes'] },
  { name: 'Rome', color: '#e03131', cities: ['Rome', 'Antium', 'Cumae', 'Neapolis', 'Ravenna', 'Arretium', 'Mediolanum', 'Arpinum', 'Circei', 'Setia'] },
  { name: 'Egypt', color: '#f5c518', cities: ['Thebes', 'Memphis', 'Heliopolis', 'Elephantine', 'Alexandria', 'Pi-Ramesses', 'Giza', 'Byblos', 'Akhetaten', 'Abydos'] },
  { name: 'Babylon', color: '#a259ff', cities: ['Babylon', 'Ur', 'Nineveh', 'Uruk', 'Nippur', 'Lagash', 'Eridu', 'Kish', 'Larsa', 'Sippar'] },
  { name: 'China', color: '#ff5fb7', cities: ['Beijing', 'Xian', 'Luoyang', 'Nanjing', 'Kaifeng', 'Chengdu', 'Hangzhou', 'Anyang', 'Wuhan', 'Guangzhou'] },
  { name: 'Aztecs', color: '#ff8a1f', cities: ['Tenochtitlan', 'Texcoco', 'Tlacopan', 'Tlatelolco', 'Xochimilco', 'Chalco', 'Coyoacan', 'Tula', 'Cholula', 'Azcapotzalco'] },
  { name: 'Persia', color: '#22d3ee', cities: ['Persepolis', 'Pasargadae', 'Susa', 'Ecbatana', 'Tarsus', 'Gordium', 'Bactra', 'Sardis', 'Rhagae', 'Nisa'] },
  { name: 'Greece', color: '#f1f3f5', cities: ['Athens', 'Sparta', 'Corinth', 'Argos', 'Knossos', 'Mycenae', 'Pharsalos', 'Ephesus', 'Delphi', 'Rhodes'] },
  { name: 'Mongols', color: '#8d5a3b', cities: ['Karakorum', 'Beshbalik', 'Turfan', 'Hsia', 'Old Sarai', 'Almarikh', 'Kashgar', 'Khotan', 'Kara Khoto', 'Uliastai'] },
  { name: 'India', color: '#00e676', cities: ['Delhi', 'Pataliputra', 'Varanasi', 'Agra', 'Calcutta', 'Lahore', 'Bombay', 'Vijayanagara', 'Madras', 'Ujjain'] },
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

export const growthCost = (pop: number): number => 8 + 6 * pop;
export const territoryRadius = (pop: number): number => (pop >= 6 ? 3 : pop >= 3 ? 2 : 1);
