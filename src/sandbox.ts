// Building cities by hand, for the City Lab (city_lab.html): found a city
// anywhere, grow it, set its era, put buildings and wonders on it, damage
// it. Everything goes through the game's own rules (growth options,
// building spots, wonder sites), so a lab city is a city the game could make.

import type { Game, City } from './game.ts';
import { ERAS, BUILDINGS, type BuildingKey, type WonderKey, type FocusKey, type EraIndex } from './cities.ts';

export function foundCity(g: Game, tile: number, owner: number): City | null {
  const settler = g.createUnit('settler', owner, tile);
  const c = g.foundCity(settler);
  if (!c) g.removeUnit(settler);
  return c;
}

// Adds n citizens, placed by the governor (by the city's focus).
export function grow(g: Game, c: City, n: number): number {
  let added = 0;
  for (let i = 0; i < n; i++) {
    c.growth = 1;
    g.autoPlace(c);
    if (c.growth > 0) { c.growth = 0; break; } // nowhere to go
    added++;
  }
  return added;
}

export function shrink(g: Game, c: City, n: number): void {
  for (let i = 0; i < n && c.pop > 1; i++) g.removeCitizen(c);
}

export function setEra(g: Game, owner: number, era: EraIndex): void {
  const p = g.players[owner]!;
  p.era = era;
  p.science = Math.max(p.science, ERAS[era].science);
  g.useVersion++;
}

// Puts building k at tile t, or where the governor would. Harbor buildings
// need water by the core: a fishing-boats tile is developed first if needed.
export function addBuilding(g: Game, c: City, k: BuildingKey, t?: number): boolean {
  if (c.buildings.has(k)) return false;
  if (BUILDINGS[k].role === 'walls') { c.buildings.add(k); g.useVersion++; return true; }
  if (!g.buildingSpots(c, k).length && BUILDINGS[k].role === 'harbor') developWaterByCore(g, c);
  c.pendingBuilding = k;
  const ok = t === undefined ? (g.autoPlaceBuilding(c), c.buildings.has(k)) : g.placeBuilding(c, k, t);
  c.pendingBuilding = null;
  return ok;
}

function developWaterByCore(g: Game, c: City): void {
  const o = g.growthOptions(c).find((x) => x.kind === 'rural' && x.improvement === 'boats' && g.tiles[x.tile].neighbors.includes(c.tile));
  if (!o) return;
  c.growth = 1;
  g.placeGrowth(c, o);
}

// Builds wonder k at tile t, or at the governor's site (growing the city a
// little if no tile fits yet).
export function addWonder(g: Game, c: City, k: WonderKey, t?: number): boolean {
  if (g.wondersBuilt.has(k)) return false;
  let spot = t ?? g.governorWonderSpot(c, k);
  for (let i = 0; spot === null && i < 4; i++) { grow(g, c, 1); spot = g.governorWonderSpot(c, k); }
  return spot !== null && g.placeWonder(c, k, spot);
}

// ---------- presets ----------

export interface Preset {
  readonly name: string;
  readonly desc: string;
  readonly era: EraIndex;
  readonly pop: number;
  readonly focus: FocusKey;
  readonly buildings: readonly BuildingKey[];
  readonly wonders: readonly WonderKey[];
  readonly site: (g: Game, t: number) => boolean;
  readonly hp?: number;        // share of max HP (a siege)
  readonly pillage?: number;   // rural tiles burnt
  readonly razed?: boolean;    // built, then razed to ruins
}

const flatOpen = (g: Game, t: number) => g.relief[t] === 'flat' && g.feature[t] === null && ['prairie', 'savanna', 'steppe', 'mediterranean'].includes(g.biome[t]);
const coast = (g: Game, t: number) => g.tiles[t].neighbors.some((n) => g.biome[n] === 'shallowSea');
const river = (g: Game, t: number) => g.map.riverTile[t] === 1;

export const PRESETS: readonly Preset[] = [
  { name: 'Hamlet', desc: 'Size 2, Ancient: a few huts and fields.', era: 0, pop: 2, focus: 'food', buildings: [], wonders: [], site: flatOpen },
  { name: 'Village', desc: 'Size 4, Ancient: a monument and a granary.', era: 0, pop: 4, focus: 'balanced', buildings: ['monument', 'granary'], wonders: [], site: flatOpen },
  { name: 'Market town', desc: 'Size 8, Classical, on a river: a Market quarter.', era: 1, pop: 8, focus: 'gold', buildings: ['market', 'countingHouse', 'granary', 'shrine'], wonders: [], site: (g, t) => river(g, t) && g.relief[t] === 'flat' },
  { name: 'Harbor town', desc: 'Size 9, Classical, on the coast: a Harbor quarter on the water.', era: 1, pop: 9, focus: 'food', buildings: ['lighthouse', 'shipyard', 'market'], wonders: [], site: (g, t) => coast(g, t) && g.relief[t] === 'flat' },
  { name: 'Walled city', desc: 'Size 14, Medieval: walls, Campus, Forge and Temple quarters.', era: 2, pop: 14, focus: 'production', buildings: ['walls', 'library', 'academy', 'workshop', 'smithy', 'shrine', 'temple', 'granary'], wonders: [], site: flatOpen },
  { name: 'Capital', desc: 'Size 20, Medieval: walls, every quarter, two wonders.', era: 2, pop: 20, focus: 'balanced', buildings: ['walls', 'library', 'academy', 'market', 'countingHouse', 'workshop', 'smithy', 'amphitheater', 'odeon', 'barracks', 'stable', 'granary', 'monument', 'aqueduct'], wonders: ['greatLibrary', 'colosseum'], site: (g, t) => flatOpen(g, t) },
  { name: 'Desert city', desc: 'Size 10, Classical: the Pyramids on desert or floodplain.', era: 1, pop: 10, focus: 'production', buildings: ['market', 'workshop', 'shrine'], wonders: ['pyramids'], site: (g, t) => g.relief[t] === 'flat' && g.tilesWithin(t, 1).some((x) => g.biome[x] === 'hotDesert' || g.feature[x] === 'floodplain') },
  { name: 'Mountain refuge', desc: 'Size 8, Medieval: Machu Picchu among the peaks.', era: 2, pop: 8, focus: 'faith', buildings: ['shrine', 'temple', 'workshop'], wonders: ['machuPicchu'], site: (g, t) => g.tilesWithin(t, 1).some((x) => g.relief[x] === 'mountains') },
  { name: 'Garden city', desc: 'Size 11, Classical, on a river: the Hanging Gardens, Stonehenge.', era: 1, pop: 11, focus: 'culture', buildings: ['amphitheater', 'odeon', 'monument', 'waterMill'], wonders: ['hangingGardens', 'stonehenge'], site: (g, t) => river(g, t) && flatOpen(g, t) },
  { name: 'Lighthouse port', desc: 'Size 10, Medieval: the Great Lighthouse.', era: 2, pop: 10, focus: 'gold', buildings: ['walls', 'lighthouse', 'shipyard', 'market', 'countingHouse'], wonders: ['greatLighthouse'], site: coast },
  { name: 'Besieged city', desc: 'Size 10, Medieval: walls breached, fields burning.', era: 2, pop: 10, focus: 'production', buildings: ['walls', 'barracks', 'stable', 'workshop'], wonders: [], site: flatOpen, hp: 0.25, pillage: 3 },
  { name: 'Ruins', desc: 'A razed town: broken walls where houses stood.', era: 1, pop: 7, focus: 'balanced', buildings: ['market', 'shrine'], wonders: [], site: flatOpen, razed: true },
];

// Owners by era, so cities of one era share a civ (eras are per civ).
const ERA_OWNERS: Record<EraIndex, readonly number[]> = { 0: [0, 3], 1: [1, 4, 7], 2: [2, 5, 6] };

export interface BuiltPreset {
  preset: Preset;
  tile: number;       // its center (still there for ruins)
  city: City | null;  // null once razed
}

// Builds every preset on the world, far apart, on sites that fit.
export function buildPresets(g: Game, presets: readonly Preset[] = PRESETS): BuiltPreset[] {
  const used: number[] = [];
  const turn: Record<EraIndex, number> = { 0: 0, 1: 0, 2: 0 };
  const order = g.tiles.map((t) => t.id).sort((a, b) => ((a * 2654435761) >>> 0) - ((b * 2654435761) >>> 0));
  const out: BuiltPreset[] = [];
  for (const p of presets) {
    const pool = ERA_OWNERS[p.era].filter((o) => o < g.players.length);
    const owner = pool[turn[p.era]++ % pool.length] ?? 0;
    setEra(g, owner, p.era);
    let best = -1, bestScore = -Infinity;
    for (const t of order) {
      if (!p.site(g, t) || !g.canFoundCity(t, owner) || used.some((u) => g.approxDist(u, t) < 8)) continue;
      const s = g.siteScore(t);
      if (s > bestScore) { best = t; bestScore = s; }
    }
    if (best < 0) continue;
    const c = foundCity(g, best, owner);
    if (!c) continue;
    used.push(best);
    c.focus = p.focus;
    grow(g, c, p.pop - 1);
    for (const w of p.wonders) addWonder(g, c, w);
    for (const b of p.buildings) addBuilding(g, c, b);
    if (p.hp !== undefined) c.hp = Math.round(g.cityMaxHp(c) * p.hp);
    if (p.pillage) for (const t of g.cityTiles(c, 1).slice(0, p.pillage)) g.pillaged[t] = 3;
    if (p.razed) { g.destroyCity(c); out.push({ preset: p, tile: best, city: null }); continue; }
    g.useVersion++;
    out.push({ preset: p, tile: best, city: c });
  }
  return out;
}

