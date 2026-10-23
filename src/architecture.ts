// Which buildings a town has: by its civ, and how tall they are. Each
// civ has one style for each height (houses.ts: one parametric model per
// style, built to each lot's footprint and height): its singles, doubles,
// triples, quads and towers (singles and doubles share a style for every
// civ so far). What stands on a tile follows its density (techs unlock
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
  'mediterranean', // stucco and stone, low terracotta roofs, porches (Rome, Greece, Spain)
  'nile',          // mudbrick, flat roofs with parapets and awnings, walled yards (taller: Sahel tower houses)
  'eastAsian',     // timber posts, white walls, curved tiled roofs with upturned eaves (taller: shophouses)
  'northern',      // timber and wattle, steep thatch, longhouses
  'yurt',          // felt yurts in fenced camps
  'mesoamerican',  // plastered stone on stepped platforms, flat roofs
  'african',       // round thatched huts in a fenced compound
  'southAsian',    // brick and stone, flat roofs, small domed pavilions (taller: havelis)
  // triples
  'renaissance',   // palazzi: stucco, arcades, tiled hip roofs
  'gothic',        // half-timbered townhouses, steep roofs gable to the street, dormers
  'islamic',       // whitewashed cubes, domes, arches, flat roofs
  // quads
  'brick',         // brick tenements, chimneys
  'haussmann',     // limestone, balconies, mansard roofs
  // towers
  'modern',        // concrete and glass
] as const;
export type Style = (typeof STYLES)[number];
export const STYLE_NAME: Record<Style, string> = {
  mediterranean: 'Mediterranean', nile: 'Nile & Mesopotamia', eastAsian: 'East Asian', northern: 'Northern timber', yurt: 'Yurt camp',
  mesoamerican: 'Mesoamerican', african: 'Round huts', southAsian: 'South Asian', renaissance: 'Renaissance', gothic: 'Gothic',
  islamic: 'Islamic', brick: 'Industrial brick', haussmann: 'Haussmann', modern: 'Modern',
};

// Each civ's style per height: singles, doubles, triples, quads, towers
// (singles and doubles in the same style, so far).
type Row = readonly [Style, Style, Style, Style, Style];
const S = (houses: Style, triples: Style, quads: Style): Row => [houses, houses, triples, quads, 'modern'];
const TABLE: Record<ArchCiv, Row> = {
  Romans: S('mediterranean', 'renaissance', 'haussmann'),
  Greeks: S('mediterranean', 'renaissance', 'haussmann'),
  Spanish: S('mediterranean', 'renaissance', 'haussmann'),
  Aztecs: S('mesoamerican', 'renaissance', 'haussmann'),
  Egyptians: S('nile', 'islamic', 'haussmann'),
  Babylonians: S('nile', 'islamic', 'haussmann'),
  Persians: S('nile', 'islamic', 'haussmann'),
  Hebrews: S('nile', 'islamic', 'haussmann'),
  Chinese: S('eastAsian', 'eastAsian', 'eastAsian'),
  Japanese: S('eastAsian', 'eastAsian', 'eastAsian'),
  Mongols: S('yurt', 'eastAsian', 'brick'),
  Ethiopians: S('african', 'nile', 'brick'),
  Indians: S('southAsian', 'southAsian', 'haussmann'),
  English: S('northern', 'gothic', 'brick'),
  French: S('northern', 'gothic', 'haussmann'),
  Germans: S('northern', 'gothic', 'brick'),
  Vikings: S('northern', 'gothic', 'brick'),
  Russians: S('northern', 'gothic', 'brick'),
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

// The game's civs (rules.ts CIVS) by name; Atlantis looks Greek for now.
const GAME_CIV: Record<string, ArchCiv> = {
  Atlantis: 'Greeks', Rome: 'Romans', Egypt: 'Egyptians', Babylon: 'Babylonians', China: 'Chinese', Aztecs: 'Aztecs',
  Persia: 'Persians', Greece: 'Greeks', Mongols: 'Mongols', India: 'Indians',
};
export const archCivOf = (gameCiv: string): ArchCiv => GAME_CIV[gameCiv] ?? ((ARCH_CIVS as readonly string[]).includes(gameCiv) ? gameCiv as ArchCiv : 'Greeks');
// The game's eras (cities.ts ERAS: Ancient, Classical, Medieval; then the
// Renaissance, the Industrial era and the Modern one, to come). For now the
// Medieval era already builds triples (dense towns), as the Renaissance will.
export const archEraOf = (gameEra: number): ArchEra =>
  (gameEra <= 0 ? 'ancient' : gameEra === 1 ? 'classical' : gameEra <= 3 ? 'renaissance' : gameEra === 4 ? 'industrial' : 'modern');
