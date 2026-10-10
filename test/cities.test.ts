import { describe, it, expect, beforeAll } from 'vitest';
import { Game, type City } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { BIOMES, FEATURE_RULES, RELIEFS, featureAllowed, type BiomeKey, type FeatureKey, type ReliefKey, type TileTerrain } from '../src/terrain.ts';
import { USE, MAX_SPECIALISTS, SLOTS, improvementFor, urbanAllowed, buildingFits, quarterOf, slotKey, BUILDINGS, type BuildingKey } from '../src/cities.ts';
import type { MapSizeKey } from '../src/rules.ts';

// City guarantees (design doc "Cities: Feel & Play"). Like the map rules,
// they state intent: loosen them when the design changes.

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
  it('urban tiles never stand on mountains, ice or deep ocean', () => {
    expect(allTerrains().filter((t) => urbanAllowed(t) && wildOnly(t))).toEqual([]);
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
    if (g.specialists[t] && u !== USE.urban) out.push(`C4 tile ${t}: specialists outside an urban tile`);
    if (g.specialists[t] > MAX_SPECIALISTS) out.push(`C4 tile ${t}: ${g.specialists[t]} specialists`);
    if (u === USE.wild) continue;
    const city = g.cityById.get(g.tileCity[t]);
    if (!city) { out.push(`C3 tile ${t}: developed but owned by no city`); continue; }
    const terrain = g.terrainAt(t);
    if (u === USE.center) { centers.set(city.id, (centers.get(city.id) ?? 0) + 1); if (city.tile !== t) out.push(`C3 tile ${t}: a center that is not ${city.name}'s`); }
    if (u === USE.rural && !improvementFor(terrain)) out.push(`C3 tile ${t}: rural on wild-only terrain`);
    if (u === USE.urban && !urbanAllowed(terrain)) out.push(`C3 tile ${t}: urban where it may not stand`);
  }
  // Buildings: slots only on urban tiles and centers, fitting the tile, once per city.
  const placed = new Map<number, BuildingKey[]>();
  for (let t = 0; t < g.N; t++) {
    for (let k = 0; k < SLOTS; k++) {
      const b = slotKey(g.slots[t * SLOTS + k]!);
      if (!b) continue;
      const u = g.use[t];
      if (u !== USE.urban && u !== USE.center) { out.push(`Q3 tile ${t}: ${b} on a ${u === USE.rural ? 'rural' : 'wild'} tile`); continue; }
      if (!buildingFits(b, g.isWater(t), g.map.riverTile[t] === 1)) out.push(`Q3 tile ${t}: ${b} does not fit (water ${g.isWater(t)})`);
      const id = g.tileCity[t];
      placed.set(id, [...(placed.get(id) ?? []), b]);
    }
  }
  for (const c of g.cities) {
    const bs = placed.get(c.id) ?? [];
    if (new Set(bs).size !== bs.length) out.push(`Q2 ${c.name}: a building twice (${bs.join(', ')})`);
    const inSet = [...c.buildings].filter((b) => BUILDINGS[b].role !== 'walls').sort();
    if (inSet.join() !== [...bs].sort().join()) out.push(`Q2 ${c.name}: buildings ${inSet.join(', ')} but slots hold ${bs.join(', ')}`);
  }
  for (const c of g.cities) {
    if (centers.get(c.id) !== 1) out.push(`C3 ${c.name}: ${centers.get(c.id) ?? 0} centers`);
    const counted = population(g, c);
    if (counted !== c.pop) out.push(`C2 ${c.name}: pop ${c.pop} but ${counted} citizens on its tiles`);
    const loose = unjoinedUrban(g, c);
    if (loose.length) out.push(`C5 ${c.name}: urban tiles ${loose.join(', ')} do not join the center`);
  }
  return out;
}

// Center + urban + rural + specialists.
function population(g: Game, c: City): number {
  let n = 0;
  for (let t = 0; t < g.N; t++) {
    if (g.tileCity[t] !== c.id || g.use[t] === USE.wild) continue;
    n += 1 + g.specialists[t];
  }
  return n;
}

// Urban tiles not reachable from the center through urban tiles.
function unjoinedUrban(g: Game, c: City): number[] {
  const seen = new Set([c.tile]);
  const stack = [c.tile];
  while (stack.length) {
    const t = stack.pop()!;
    for (const n of g.tiles[t].neighbors) {
      if (!seen.has(n) && g.tileCity[n] === c.id && g.use[n] === USE.urban) { seen.add(n); stack.push(n); }
    }
  }
  const out: number[] = [];
  for (let t = 0; t < g.N; t++) if (g.tileCity[t] === c.id && g.use[t] === USE.urban && !seen.has(t)) out.push(t);
  return out;
}

const SEEDS = [11, 222, 3333, 44444];
const TURNS = 150;

describe('cities in simulated games', () => {
  let sims: Sim[];
  beforeAll(() => { sims = SEEDS.map((s) => simulate('small', s, TURNS)); });

  it('C2-C5: population matches citizens, tiles are owned and legal, the core is in one piece', () => {
    expect(sims.flatMap((s) => s.violations)).toEqual([]);
  });

  it('C6: a city grows every 5 to 12 turns (median)', () => {
    const gaps = sims.flatMap((s) => s.growthGaps).sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)]!;
    console.log(`growth gaps: n=${gaps.length} median=${median} p10=${gaps[Math.floor(gaps.length * 0.1)]} p90=${gaps[Math.floor(gaps.length * 0.9)]}`);
    const sizes = sims.flatMap((s) => s.game.cities.map((c) => c.pop)).sort((a, b) => a - b);
    const uses = sims.flatMap((s) => [...s.game.use]).reduce((m, u) => { m[u] = (m[u] ?? 0) + 1; return m; }, {} as Record<number, number>);
    const spec = sims.reduce((n, s) => n + s.game.specialists.reduce((a, b) => a + b, 0), 0);
    console.log(`sizes at turn ${TURNS}: ${sizes.join(' ')} | rural ${uses[USE.rural]} urban ${uses[USE.urban]} specialists ${spec}`);
    expect(median).toBeGreaterThanOrEqual(5);
    expect(median).toBeLessThanOrEqual(12);
  });

  it('Q1: a quarter needs two buildings of one family', () => {
    expect(quarterOf(['library', 'academy'])).toBe('campus');
    expect(quarterOf(['library', 'market'])).toBe(null);
    expect(quarterOf(['library', null])).toBe(null);
    expect(quarterOf(['granary', 'monument'])).toBe(null);
  });

  it('Q4: cities build, and some form quarters', () => {
    let buildings = 0, quarters = 0;
    for (const { game: g } of sims) {
      for (let t = 0; t < g.N; t++) {
        const keys = Array.from({ length: SLOTS }, (_, k) => slotKey(g.slots[t * SLOTS + k]!));
        buildings += keys.filter((k) => k !== null).length;
        if (quarterOf(keys)) quarters++;
      }
    }
    console.log(`buildings ${buildings}, quarters ${quarters}`);
    expect(buildings).toBeGreaterThan(50);
    expect(quarters).toBeGreaterThan(3);
  });

  it('C7: a big city (size 10+) has a built-up core: at least a quarter of its citizens urban', () => {
    const thin = sims.flatMap((s) => s.game.cities
      .filter((c) => c.pop >= 10 && s.game.cityTiles(c, USE.urban).length < Math.floor(c.pop / 4))
      .map((c) => `${c.name} size ${c.pop}: ${s.game.cityTiles(c, USE.urban).length} urban`));
    expect(thin).toEqual([]);
  });
});
