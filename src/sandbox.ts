// Building cities by hand, for the City Lab (city_lab.html): found a city
// anywhere, grow it, set its era, put buildings and wonders on it, damage
// it. Everything goes through the game's own rules (growth options, what a
// city may build, wonder sites), so a lab city is a city the game could make.

import type { Game, City } from './game.ts';
import { ERAS, USE, WONDERS, type BuildingKey, type WonderKey, type FocusKey, type EraIndex } from './cities.ts';

export function foundCity(g: Game, tile: number, owner: number): City | null {
  const settler = g.createUnit('settler', owner, tile);
  const c = g.foundCity(settler);
  if (!c) g.removeUnit(settler);
  return c;
}

// Adds n citizens, placed by the governor (by the city's focus). Out of
// room, it buys the governor's tile of the ring beyond (the lab pays).
export function grow(g: Game, c: City, n: number): number {
  let added = 0;
  for (let i = 0; i < n; i++) {
    while (!g.growthOptions(c).length) {
      const t = g.governorTileToBuy(c);
      if (t === null) return added; // nowhere to go
      g.players[c.owner]!.gold += g.tilePrice(c);
      g.buyTile(c, t);
    }
    c.growth = 1;
    g.autoPlace(c);
    if (c.growth > 0) { c.growth = 0; break; }
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

// Adds building k, if the city may have it.
export function addBuilding(g: Game, c: City, k: BuildingKey): boolean {
  if (!g.canBuild(c, k)) return false;
  g.addBuilding(c, k);
  return true;
}

// Builds wonder k (Machu Picchu: on tile t, or the governor's mountain,
// bought for it if the city has none yet; the lab pays).
export function addWonder(g: Game, c: City, k: WonderKey, t?: number): boolean {
  if (g.wondersBuilt.has(k)) return false;
  if (WONDERS[k].site === 'mountainTop' && !g.wonderSpots(c, k).length) {
    const m = g.buyableTiles(c).find((x) => g.tiles[c.tile].neighbors.includes(x) && g.relief[x] === 'mountains' && g.feature[x] !== 'volcano');
    if (m !== undefined) { g.players[c.owner]!.gold += g.tilePrice(c); g.buyTile(c, m); }
  }
  const spot = t ?? g.governorWonderSpot(c, k);
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
const wetland = (g: Game, t: number) => g.feature[t] === 'marsh' || g.feature[t] === 'swamp' || g.feature[t] === 'mangrove' || g.feature[t] === 'bog';

export const PRESETS: readonly Preset[] = [
  { name: 'Hamlet', desc: 'Size 2, Ancient: a few huts and fields.', era: 0, pop: 2, focus: 'food', buildings: [], wonders: [], site: flatOpen },
  { name: 'Village', desc: 'Size 4, Ancient: a monument and a granary.', era: 0, pop: 4, focus: 'balanced', buildings: ['monument', 'granary'], wonders: [], site: flatOpen },
  { name: 'Market town', desc: 'Size 8, Classical, on a river: a Market and a Counting house.', era: 1, pop: 8, focus: 'gold', buildings: ['market', 'countingHouse', 'granary', 'shrine'], wonders: [], site: (g, t) => river(g, t) && g.relief[t] === 'flat' },
  { name: 'Harbor town', desc: 'Size 9, Classical, on the coast: a Lighthouse and a Shipyard.', era: 1, pop: 9, focus: 'food', buildings: ['lighthouse', 'shipyard', 'market'], wonders: [], site: (g, t) => coast(g, t) && g.relief[t] === 'flat' },
  { name: 'Walled city', desc: 'Size 14, Medieval: walls, an Academy, a Smithy and a Temple.', era: 2, pop: 14, focus: 'production', buildings: ['walls', 'library', 'academy', 'workshop', 'smithy', 'shrine', 'temple', 'granary'], wonders: [], site: flatOpen },
  { name: 'Capital', desc: 'Size 20, Medieval: walls, most buildings, two wonders.', era: 2, pop: 20, focus: 'balanced', buildings: ['walls', 'library', 'academy', 'market', 'countingHouse', 'workshop', 'smithy', 'amphitheater', 'odeon', 'barracks', 'stable', 'granary', 'monument', 'aqueduct'], wonders: ['greatLibrary', 'colosseum'], site: (g, t) => flatOpen(g, t) },
  { name: 'Desert city', desc: 'Size 10, Classical: the Pyramids on the desert beside it.', era: 1, pop: 10, focus: 'production', buildings: ['market', 'workshop', 'shrine'], wonders: ['pyramids'], site: (g, t) => g.relief[t] === 'flat' && g.tiles[t].neighbors.some((x) => (g.biome[x] === 'hotDesert' || g.feature[x] === 'floodplain') && g.relief[x] === 'flat' && !g.isPentagon(x)) },
  { name: 'Mountain refuge', desc: 'Size 8, Medieval: Machu Picchu among the peaks.', era: 2, pop: 8, focus: 'faith', buildings: ['shrine', 'temple', 'workshop'], wonders: ['machuPicchu'], site: (g, t) => g.tilesWithin(t, 1).some((x) => g.relief[x] === 'mountains') },
  { name: 'Garden city', desc: 'Size 11, Classical, on a river: the Hanging Gardens; Stonehenge beside it.', era: 1, pop: 11, focus: 'culture', buildings: ['amphitheater', 'odeon', 'monument', 'waterMill'], wonders: ['hangingGardens', 'stonehenge'], site: (g, t) => river(g, t) && flatOpen(g, t) },
  { name: 'Lighthouse port', desc: 'Size 10, Medieval: the Great Lighthouse on the sea beside it.', era: 2, pop: 10, focus: 'gold', buildings: ['walls', 'lighthouse', 'shipyard', 'market', 'countingHouse'], wonders: ['greatLighthouse'], site: coast },
  { name: 'Besieged city', desc: 'Size 10, Medieval: walls breached, fields burning.', era: 2, pop: 10, focus: 'production', buildings: ['walls', 'barracks', 'stable', 'workshop'], wonders: [], site: flatOpen, hp: 0.25, pillage: 3 },
  { name: 'Metropolis', desc: 'Size 18, Medieval: a Counting house, an Academy, a Smithy and an Odeon.', era: 2, pop: 18, focus: 'gold', buildings: ['market', 'countingHouse', 'library', 'academy', 'workshop', 'smithy', 'amphitheater', 'odeon'], wonders: [], site: flatOpen },
  { name: 'Wetland town', desc: 'Size 8 among marshes, swamps or mangroves.', era: 1, pop: 8, focus: 'food', buildings: ['market', 'granary'], wonders: [], site: (g, t) => g.feature[t] === null && g.relief[t] === 'flat' && g.tiles[t].neighbors.filter((n) => wetland(g, n)).length >= 3 },
  { name: 'Hill town', desc: 'Size 9, Medieval, on hills: walls.', era: 2, pop: 9, focus: 'production', buildings: ['walls', 'workshop', 'shrine', 'monument'], wonders: [], site: (g, t) => g.relief[t] === 'hills' && g.tiles[t].neighbors.filter((n) => g.relief[n] === 'hills').length >= 3 },
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
    // (Buildings first: specialists work in them.)
    for (const b of p.buildings) addBuilding(g, c, b);
    grow(g, c, p.pop - c.pop);
    for (const w of p.wonders) addWonder(g, c, w);
    if (p.hp !== undefined) c.hp = Math.round(g.cityMaxHp(c) * p.hp);
    if (p.pillage) for (const t of g.cityTiles(c, USE.rural).slice(0, p.pillage)) g.pillaged[t] = 3;
    if (p.razed) { g.destroyCity(c); out.push({ preset: p, tile: best, city: null }); continue; }
    g.useVersion++;
    out.push({ preset: p, tile: best, city: c });
  }
  return out;
}

