import { TECH_KEYS, techDef } from '../src/techs.ts';
import { describe, it, expect, beforeAll } from 'vitest';
import { Game, type City } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { BIOMES, FEATURE_RULES, RELIEFS, featureAllowed, type BiomeKey, type FeatureKey, type ReliefKey, type TileTerrain } from '../src/terrain.ts';
import {
  USE, IMPROVEMENTS, SPECIALIST_KINDS, BUILDINGS, improvementFor, buildingAllowed, specialistSlots,
  WONDERS, wonderBeside, type BuildingKey,
} from '../src/cities.ts';
import type { MapSizeKey } from '../src/rules.ts';

// City guarantees (design doc "Cities: Feel & Play"). Like the map rules,
// they state intent: loosen them when the design changes.
// (Cities are one tile now, Civ V style: no urban tiles. Gone with them:
// C1's "urban tiles never on mountains, ice or deep ocean", C5 "the core is
// in one piece", Q3 "buildings fit their tile's slot", and C7 "a big city
// has a built-up core", now about specialists. Buildings are Civ V's: no
// quarters, so Q1 and Q4 are about prerequisites now.)

// ---------- C1: every terrain has an improvement or is explicitly wild-only ----------

const BIOME_KEYS = Object.keys(BIOMES) as BiomeKey[];
const RELIEF_KEYS = Object.keys(RELIEFS) as ReliefKey[];
const FEATURE_KEYS = Object.keys(FEATURE_RULES) as FeatureKey[];
const NEIGHBORS: [boolean, boolean][] = [[true, true], [false, true], [false, false]]; // touches sea, touches water

// Every terrain the generator can make (features only where their rules allow).
function allTerrains(): TileTerrain[] {
  const out: TileTerrain[] = [];
  for (const biome of BIOME_KEYS) {
    const reliefs: ReliefKey[] = BIOMES[biome].water ? ['flat'] : RELIEF_KEYS;
    for (const relief of reliefs) {
      out.push({ biome, relief, feature: null });
      for (const feature of FEATURE_KEYS) {
        const t = { biome, relief, feature };
        if (NEIGHBORS.some(([sea, water]) => featureAllowed(feature, t, sea, water))) out.push(t);
      }
    }
  }
  return out;
}

// Terrain that stays wild on purpose.
const wildOnly = (t: TileTerrain): boolean =>
  t.biome === 'ocean' || t.biome === 'seaIce' || t.biome === 'iceSheet' || t.relief === 'mountains';

describe('C1: improvements follow the terrain', () => {
  it('every terrain gets an improvement unless it is wild-only (mountains, ice, deep ocean)', () => {
    const wrong = allTerrains().filter((t) => (improvementFor(t) === null) !== wildOnly(t));
    expect(wrong).toEqual([]);
  });
});

// ---------- C2-C6: simulated games ----------

interface Sim { game: Game; growthGaps: number[]; violations: string[] }

// Every civ, the human's included, played by the AI; cities placed by their governors.
function simulate(size: MapSizeKey, seed: number, turns: number): Sim {
  const game = new Game({ size, seed });
  game.players[0]!.isHuman = false;
  const violations: string[] = [];
  const lastGrowth = new Map<number, number>();
  const growthGaps: number[] = [];
  for (let turn = 0; turn < turns; turn++) {
    const before = new Map(game.cities.map((c) => [c.id, c.pop]));
    game.over = null; // keep watching after player 0 falls
    if (game.players[0]!.alive) aiTurn(game, game.players[0]!);
    game.endTurn();
    for (const c of game.cities) {
      if (c.pop > (before.get(c.id) ?? 1)) {
        growthGaps.push(game.turn - (lastGrowth.get(c.id) ?? c.founded));
        lastGrowth.set(c.id, game.turn);
      }
    }
    for (const v of checkCities(game)) violations.push(`seed ${seed} turn ${game.turn}: ${v}`);
    if (violations.length > 20) break;
  }
  return { game, growthGaps, violations };
}

function checkCities(g: Game): string[] {
  const out: string[] = [];
  const centers = new Map<number, number>();
  for (let t = 0; t < g.N; t++) {
    const u = g.use[t];
    if (g.drained[t] && g.feature[t] === 'bog') out.push(`C3 tile ${t}: drained but still a bog`);
    if (u === USE.wild) continue;
    const city = g.cityById.get(g.tileCity[t]);
    if (!city) { out.push(`C3 tile ${t}: developed but owned by no city`); continue; }
    if (u === USE.center) { centers.set(city.id, (centers.get(city.id) ?? 0) + 1); if (city.tile !== t) out.push(`C3 tile ${t}: a center that is not ${city.name}'s`); }
    if (u === USE.rural && !improvementFor(g.terrainAt(t))) out.push(`C3 tile ${t}: rural on wild-only terrain`);
    // (A bog is drained when worked: no worked tile is still a bog, and every drained one was worked.)
    if (u === USE.rural && g.feature[t] === 'bog') out.push(`C3 tile ${t}: a worked bog not drained`);
  }
  // Wonders: once in the world, in its city (on the center, meeting its
  // need), or beside it: Machu Picchu on a wild mountain, the Great
  // Lighthouse on the sea, the Pyramids and Stonehenge on flat land.
  for (const [w, t] of g.wondersBuilt) {
    if (t < 0) continue; // fallen with its city
    const site = WONDERS[w].site;
    const city = g.cityById.get(g.tileCity[t]);
    const beside = !!city && g.tiles[city.tile].neighbors.includes(t);
    const where = wonderBeside(w);
    const ok = where === 'mountain' ? beside && g.relief[t] === 'mountains' && g.use[t] === USE.wild
      : where === 'sea' ? beside && g.isSea(t)
      : where === 'land' ? beside && !g.isWater(t) && g.relief[t] === 'flat' && g.use[t] !== USE.center
      : g.use[t] === USE.center;
    if (!ok) out.push(`WN1 tile ${t}: ${w} not where it stands (${where ?? 'in the city'}, ${site})`);
  }
  for (const c of g.cities) {
    // Buildings: each one the city may have; specialists only in buildings of their kind, one each.
    for (const b of c.buildings) {
      const others = new Set(c.buildings);
      others.delete(b);
      if (!buildingAllowed(b, others, g.cityRiver(c), g.cityCoast(c))) out.push(`Q2 ${c.name}: ${b} without what it needs`);
    }
    for (const k of SPECIALIST_KINDS) {
      const room = specialistSlots(c.buildings, k);
      if (c.specialists[k] < 0 || c.specialists[k] > room) out.push(`C4 ${c.name}: ${c.specialists[k]} ${k} specialists, room for ${room}`);
    }
    if (centers.get(c.id) !== 1) out.push(`C3 ${c.name}: ${centers.get(c.id) ?? 0} centers`);
    const counted = population(g, c);
    if (counted !== c.pop) out.push(`C2 ${c.name}: pop ${c.pop} but ${counted} citizens`);
  }
  return out;
}

// Center + rural tiles + specialists.
function population(g: Game, c: City): number {
  return 1 + g.cityTiles(c, USE.rural).length + g.specialistCount(c);
}

const SEEDS = [11, 222, 3333, 44444];
const TURNS = 150;

describe('cities in simulated games', () => {
  let sims: Sim[];
  beforeAll(() => { sims = SEEDS.map((s) => simulate('small', s, TURNS)); });

  it('C2-C4: population matches citizens, tiles are owned and legal', () => {
    expect(sims.flatMap((s) => s.violations)).toEqual([]);
  });

  it('C6: a city grows every 5 to 12 turns (median)', () => {
    const gaps = sims.flatMap((s) => s.growthGaps).sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)]!;
    console.log(`growth gaps: n=${gaps.length} median=${median} p10=${gaps[Math.floor(gaps.length * 0.1)]} p90=${gaps[Math.floor(gaps.length * 0.9)]}`);
    const sizes = sims.flatMap((s) => s.game.cities.map((c) => c.pop)).sort((a, b) => a - b);
    const uses = sims.flatMap((s) => [...s.game.use]).reduce((m, u) => { m[u] = (m[u] ?? 0) + 1; return m; }, {} as Record<number, number>);
    const spec = sims.reduce((n, s) => n + s.game.cities.reduce((a, c) => a + s.game.specialistCount(c), 0), 0);
    const drained = sims.reduce((n, s) => n + s.game.drained.reduce((a, d) => a + d, 0), 0);
    console.log(`sizes at turn ${TURNS}: ${sizes.join(' ')} | rural ${uses[USE.rural]} specialists ${spec} | bogs drained ${drained}`);
    expect(median).toBeGreaterThanOrEqual(5);
    expect(median).toBeLessThanOrEqual(12);
  });

  it('Q1: a building needs what it requires, and where it must be', () => {
    const has = (...ks: BuildingKey[]) => new Set<BuildingKey>(ks);
    expect(buildingAllowed('academy', has(), false, false)).toBe(false);
    expect(buildingAllowed('academy', has('library'), false, false)).toBe(true);
    expect(buildingAllowed('library', has('library'), false, false)).toBe(false);
    expect(buildingAllowed('lighthouse', has(), false, false)).toBe(false);
    expect(buildingAllowed('lighthouse', has(), false, true)).toBe(true);
    expect(buildingAllowed('waterMill', has(), false, true)).toBe(false);
    expect(buildingAllowed('waterMill', has(), true, false)).toBe(true);
  });

  it('Q4: cities build, some of them the buildings that need another first', () => {
    let buildings = 0, quarters = 0;
    for (const { game: g } of sims) {
      for (const c of g.cities) {
        buildings += c.buildings.size;
        quarters += [...c.buildings].filter((b) => BUILDINGS[b].requires).length;
      }
    }
    console.log(`buildings ${buildings}, of them needing another ${quarters}`);
    expect(buildings).toBeGreaterThan(50);
    expect(quarters).toBeGreaterThan(3);
  });

  it('WN2: wonders get built', () => {
    const built = sims.reduce((n, s) => n + s.game.wondersBuilt.size, 0);
    console.log(`wonders built ${built}`);
    expect(built).toBeGreaterThan(2);
  });

  // (Tall cities grow through specialists, design doc.)
  // (As many as its buildings have room for, if fewer; two short are fine:
  // slots built since the city last grew, which with lean yields is a while.)
  it('C7: a big city (size 10+) has specialists: at least a quarter of its citizens', () => {
    const room = (c: City) => SPECIALIST_KINDS.reduce((n, k) => n + specialistSlots(c.buildings, k), 0);
    const thin = sims.flatMap((s) => s.game.cities
      .filter((c) => c.pop >= 10 && s.game.specialistCount(c) < Math.min(room(c), Math.floor(c.pop / 4)) - 2)
      .map((c) => `${c.name} size ${c.pop}: ${s.game.specialistCount(c)} specialists, ${room(c)} slots, surplus ${s.game.cityYields(c).surplus}`));
    expect(thin).toEqual([]);
  });
});

describe('ER1: techs only ever add to improvements', () => {
  it('no tech takes from an improvement', () => {
    const bad: string[] = [];
    for (const k of TECH_KEYS) for (const e of techDef(k).effects ?? []) {
      if (e.k === 'improvement' && (Object.values(e.o) as number[]).some((v) => v < 0)) bad.push(`${k} ${e.imp}`);
    }
    expect(bad).toEqual([]);
    expect(Object.keys(IMPROVEMENTS).length).toBeGreaterThan(0);
  });
});
