// Which buildings a town has: by its civ, and how tall they are. Each
// civ has one style for each height (houses.ts: one parametric model per
// style, built to each lot's footprint and height): its singles, doubles,
// triples, quads and towers (singles and doubles share a style). Every
// civ's row is its own. What stands on a tile follows its density (techs unlock
// denser tiles; a density holds buildings up to a height: town/geometry.ts
// DENSITY_TALLEST); nothing built before changes its look, so a civ keeps
// its identity. A style serves many civs. Pure data: no geometry here.

import type { Density, Floors, Footprint } from './town/geometry.ts';
import { DENSITIES, FLOORS, FOOTPRINTS } from './town/geometry.ts';

// The civs: Civilization I's (the Hebrews and the Ethiopians in place of the Americans and the
// Zulus), and the Spanish, the Persians and the Vikings of Civilization II.
export const ARCH_CIVS = [
  'Romans', 'Egyptians', 'Chinese', 'Mongols', 'Ethiopians', 'Aztecs', 'Greeks', 'English', 'Spanish', 'French',
  'Germans', 'Persians', 'Indians', 'Japanese', 'Babylonians', 'Russians', 'Hebrews', 'Vikings',
] as const;
export type ArchCiv = (typeof ARCH_CIVS)[number];

// Eras, as a reference only: about when each height (and the density that
// holds it) is unlocked. They name the styles' place in history; the
// buildings themselves follow density.
export const ARCH_ERAS = ['ancient', 'classical', 'renaissance', 'industrial', 'modern'] as const;
export type ArchEra = (typeof ARCH_ERAS)[number];
// The era a height belongs to (a label).
export const eraOfFloors = (floors: Floors): ArchEra =>
  floors >= 12 ? 'modern' : floors >= 4 ? 'industrial' : floors >= 3 ? 'renaissance' : floors >= 2 ? 'classical' : 'ancient';
// The era that unlocks a density (until there is a tech tree), and the densest an era has.
export const DENSITY_ERA: Record<Density, ArchEra> = { low: 'ancient', medium: 'classical', dense: 'renaissance', high: 'industrial', metropolitan: 'modern' };
export const unlocked = (era: ArchEra, d: Density): boolean => ARCH_ERAS.indexOf(DENSITY_ERA[d]) <= ARCH_ERAS.indexOf(era);
export const densestOf = (era: ArchEra): Density => DENSITIES.filter((d) => unlocked(era, d)).pop()!;

// ---------- styles ----------

export const STYLES = [
  // houses (singles and doubles)
  'mediterranean', // stucco and stone, low terracotta roofs, porches (Romans)
  'cycladic',      // stacked whitewashed cubes, blue doors and domes (Greeks)
  'andalusian',    // white walls, iron window grilles, a patio behind a gate (Spanish)
  'nile',          // mudbrick, flat roofs with parapets and awnings, walled yards (Egyptians)
  'mesopotamian',  // mudbrick with stepped crenellations and a blue glazed band (Babylonians)
  'windcatcher',   // adobe, low domes, badgir windcatcher towers (Persians)
  'levantine',     // Jerusalem limestone, flat roofs, arched triple windows (taller: red tile roofs) (Hebrews)
  'eastAsian',     // timber posts, white walls, curved tiled roofs with upturned eaves (taller: shophouses) (Chinese)
  'machiya',       // narrow wooden townhouses, lattice fronts, tiled eaves (Japanese)
  'yurt',          // felt yurts in fenced camps (Mongols)
  'mesoamerican',  // plastered stone on stepped platforms, flat roofs (Aztecs)
  'african',       // round thatched huts in a fenced compound (Ethiopians)
  'southAsian',    // brick and stone, flat roofs, small domed pavilions (Indians)
  'northern',      // timber and wattle, steep thatch (English)
  'slate',         // granite, steep slate roofs, dormers, gable chimneys (French)
  'fachwerk',      // half-timbering, steep red roofs gable to the street (Germans)
  'longhouse',     // timber halls under turf roofs, dragon-headed gables (Vikings)
  'izba',          // log cabins, steep board roofs, carved painted window frames (Russians)
  // triples
  'insula',        // Roman brick flats over shops, a timber balcony (Romans)
  'neoclassical',  // Athenian townhouses, pediments and pilasters (Greeks)
  'renaissance',   // palazzi: stucco, arcades, tiled hip roofs (Spanish)
  'colonial',      // red tezontle stone framed in grey cantera, iron balconies (Aztecs)
  'mamluk',        // striped ablaq stone, wooden mashrabiya oriels, a small dome (Egyptians)
  'islamic',       // whitewashed cubes, domes, arches, flat roofs (Babylonians)
  'safavid',       // a turquoise-tiled iwan portal, a dome, minarets (Persians)
  'tulou',         // Hakka earthen rings (shophouses on the narrow lots) (Chinese)
  'kura',          // white plaster storehouses, namako walls, heavy roofs (Japanese)
  'monastic',      // white battered walls, green tiled roofs, stupas (Mongols)
  'gondarine',     // Gondar castles: rough stone, round domed corner towers (Ethiopians)
  'haveli',        // pink sandstone, jharokha balconies, chhatris (Indians)
  'georgian',      // brick terraces, sash windows, parapets, chimney stacks (English)
  'vosges',        // pink brick and white stone, arcades, steep slate roofs (French)
  'gothic',        // half-timbered townhouses, steep roofs gable to the street, dormers (Germans)
  'bryggen',       // painted timber wharf houses gable to the street (Vikings)
  'terem',         // tented roofs, kokoshniks, an onion dome, carved trim (Russians)
  // quads
  'brick',         // brick tenements, chimneys (English, Vikings)
  'haussmann',     // limestone, balconies, mansard roofs (Romans, Aztecs, Egyptians, Babylonians, Persians, French)
  'polykatoikia',  // Athens concrete flats, balconies and awnings, on stilts (Greeks)
  'modernisme',    // Barcelona: chamfered corners, a rippled mosaic roof, bone balconies (Spanish)
  'bauhaus',       // Tel Aviv's White City: ribbon windows, round corner balconies (Hebrews)
  'shikumen',      // Shanghai lane houses: grey brick, stone-framed gates (Chinese)
  'zakkyo',        // narrow Tokyo buildings hung with vertical signs (Japanese)
  'panel',         // prefab blocks with painted panels, a ger in the yard (Mongols)
  'deco',          // Asmara Art Deco: rounded corners, speed lines, a flag fin (Ethiopians)
  'indoSaracenic', // Mumbai: ochre stone, pointed arches, a domed clock tower (Indians)
  'brickExpressionist', // Hamburg: dark clinker brick, piers, a ship's-prow corner (Germans)
  'stalinist',     // neoclassical blocks with spired turrets; wedding-cake towers (Russians)
  // towers
  'modern',        // concrete and glass
  'screen',        // a glass tower behind a mashrabiya sunscreen
  'verticalForest',// twin towers planted with trees on every balcony
  'highTech',      // London: a glass shard, a diamond-gridded bullet
  'miesian',       // a dark bronze slab on a plaza
  'briseSoleil',   // tropical modernism: concrete sun-breaker fins, primary colours
  'mural',         // a windowless block wrapped in a mosaic mural
  'timber',        // a mass-timber tower with an open frame on top
  'pagoda',        // stacked, outward-flaring tiers and a gold spire
  'capsule',       // concrete cores with capsules plugged on
] as const;
export type Style = (typeof STYLES)[number];
export const STYLE_NAME: Record<Style, string> = {
  mediterranean: 'Mediterranean', cycladic: 'Cycladic', andalusian: 'Andalusian', nile: 'Nile', mesopotamian: 'Babylonian mudbrick',
  windcatcher: 'Yazdi windcatcher', levantine: 'Jerusalem stone', eastAsian: 'East Asian', machiya: 'Machiya', yurt: 'Yurt camp',
  mesoamerican: 'Mesoamerican', african: 'Round huts', southAsian: 'South Asian', northern: 'Northern timber', slate: 'Breton stone & slate',
  fachwerk: 'Fachwerk', longhouse: 'Turf longhouse', izba: 'Izba',
  insula: 'Insula', neoclassical: 'Athenian neoclassical', renaissance: 'Renaissance', colonial: 'Tezontle colonial', mamluk: 'Mamluk Cairo',
  islamic: 'Islamic', safavid: 'Safavid tile', tulou: 'Tulou', kura: 'Kura storehouse', monastic: 'Steppe monastery', gondarine: 'Gondarine',
  haveli: 'Jaipur haveli', georgian: 'Georgian terrace', vosges: 'Brick & stone royal', gothic: 'Gothic', bryggen: 'Hanseatic wharf', terem: 'Terem',
  brick: 'Industrial brick', haussmann: 'Haussmann', polykatoikia: 'Polykatoikia', modernisme: 'Modernisme', bauhaus: 'White City',
  shikumen: 'Shikumen', zakkyo: 'Signboard buildings', panel: 'Painted panel blocks', deco: 'Asmara Deco', indoSaracenic: 'Indo-Saracenic',
  brickExpressionist: 'Brick Expressionism', stalinist: 'Stalinist',
  modern: 'Modern', screen: 'Mashrabiya tower', verticalForest: 'Vertical forest', highTech: 'High-tech glass', miesian: 'Bronze slab',
  briseSoleil: 'Brise-soleil', mural: 'Mosaic tower', timber: 'Timber tower', pagoda: 'Pagoda tower', capsule: 'Capsule tower',
};

// Each civ's style per height: singles, doubles, triples, quads, towers
// (singles and doubles in the same style).
type Row = readonly [Style, Style, Style, Style, Style];
const S = (houses: Style, triples: Style, quads: Style, towers: Style): Row => [houses, houses, triples, quads, towers];
const TABLE: Record<ArchCiv, Row> = {
  Romans: S('mediterranean', 'insula', 'haussmann', 'verticalForest'),
  Greeks: S('cycladic', 'neoclassical', 'polykatoikia', 'modern'),
  Spanish: S('andalusian', 'renaissance', 'modernisme', 'modern'),
  Aztecs: S('mesoamerican', 'colonial', 'haussmann', 'mural'),
  Egyptians: S('nile', 'mamluk', 'haussmann', 'screen'),
  Babylonians: S('mesopotamian', 'islamic', 'haussmann', 'screen'),
  Persians: S('windcatcher', 'safavid', 'haussmann', 'screen'),
  Hebrews: S('levantine', 'levantine', 'bauhaus', 'modern'),
  Chinese: S('eastAsian', 'tulou', 'shikumen', 'pagoda'),
  Japanese: S('machiya', 'kura', 'zakkyo', 'capsule'),
  Mongols: S('yurt', 'monastic', 'panel', 'modern'),
  Ethiopians: S('african', 'gondarine', 'deco', 'briseSoleil'),
  Indians: S('southAsian', 'haveli', 'indoSaracenic', 'briseSoleil'),
  English: S('northern', 'georgian', 'brick', 'highTech'),
  French: S('slate', 'vosges', 'haussmann', 'modern'),
  Germans: S('fachwerk', 'gothic', 'brickExpressionist', 'miesian'),
  Vikings: S('longhouse', 'bryggen', 'brick', 'timber'),
  Russians: S('izba', 'terem', 'stalinist', 'stalinist'),
};
// The style of a civ's buildings of a height (whatever the era: an era only decides which heights there are).
export const styleOf = (civ: ArchCiv, floors: Floors): Style => TABLE[civ][ARCH_ERAS.indexOf(eraOfFloors(floors))]!;
// The (civ, height) pairs a style serves.
export const pairsOf = (style: Style): { civ: ArchCiv; floors: Floors }[] =>
  ARCH_CIVS.flatMap((civ) => FLOORS.filter((f) => styleOf(civ, f) === style).map((floors) => ({ civ, floors })));
// The heights a style must have models for.
export const styleFloors = (style: Style): Floors[] => FLOORS.filter((f) => pairsOf(style).some((p) => p.floors === f));

// Every slot a town can need: (civ, footprint, height).
export const SLOTS = ARCH_CIVS.flatMap((civ) => FOOTPRINTS.flatMap((fp: Footprint) => FLOORS.map((floors) => ({ civ, fp, floors }))));

// ---------- the game's civs and eras ----------

// The game's eras (cities.ts ERAS: Ancient, Classical, Medieval; then the
// Renaissance, the Industrial era and the Modern one, to come). For now the
// Medieval era already builds triples (dense towns), as the Renaissance will.
export const archEraOf = (gameEra: number): ArchEra =>
  (gameEra <= 0 ? 'ancient' : gameEra === 1 ? 'classical' : gameEra <= 3 ? 'renaissance' : gameEra === 4 ? 'industrial' : 'modern');
