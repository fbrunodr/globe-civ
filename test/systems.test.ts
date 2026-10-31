import { describe, it, expect } from 'vitest';
import { Game, HUMAN, MIN_WAR } from '../src/game.ts';
import { TECH_KEYS, techDef, techPath } from '../src/techs.ts';
import { POLITICS_KEYS, politicsDef, GOVERNMENT_KEYS, POLICY_KEYS } from '../src/politics.ts';
import { TRAIT_KEYS, FAITH_KEYS, PATH_KEYS, PATHS, MAX_TRAITS, traitDef, traitCost, pathTraits, pathLevels } from '../src/identity.ts';
import { RELIGION_KEYS } from '../src/religion.ts';
import { RESOURCES, LUXURY_KEYS, type ResourceKey } from '../src/resources.ts';
import { cityUpkeep } from '../src/economy.ts';
import { BORDER_AT, CITY_REACH, USE } from '../src/cities.ts';
import { UNITS, BUILDINGS, WONDERS, type BuildKey } from '../src/rules.ts';

// The game's systems: research, politics (governments and policies),
// identity (traits, faiths), religion, resources, borders, upkeep,
// diplomacy and the record.

const fresh = () => {
  const g = new Game({ size: 'small', seed: 5 });
  for (const p of g.players) p.isHuman = true;
  return g;
};
const settle = (g: Game, owner: number) => g.foundCity(g.units.find((u) => u.owner === owner && u.type === 'settler')!)!;

describe('S1: the trees hold together', () => {
  it('every tech and politics item needs only earlier ones, of its era or before, without cycles', () => {
    for (const k of TECH_KEYS) for (const n of techDef(k).needs) expect(techDef(n).era, `${k} needs ${n}`).toBeLessThanOrEqual(techDef(k).era);
    for (const k of POLITICS_KEYS) for (const n of politicsDef(k).needs) expect(politicsDef(n).era, `${k} needs ${n}`).toBeLessThanOrEqual(politicsDef(k).era);
    for (const k of TECH_KEYS) expect(techPath(k, new Set()).at(-1)).toBe(k);
  });
  it('there are about 80 techs, 80 policies and 80 traits', () => {
    expect(TECH_KEYS.length).toBeGreaterThanOrEqual(75);
    expect(POLICY_KEYS.length).toBeGreaterThanOrEqual(75);
    expect(TRAIT_KEYS.length).toBeGreaterThanOrEqual(80);
  });
  it('everything buildable is unlocked by exactly one tech or politics item, or from the start', () => {
    const start = new Set<BuildKey>(['warrior', 'scout', 'settler', 'monument']);
    const count = new Map<string, number>();
    const add = (ks: readonly string[] | undefined) => { for (const k of ks ?? []) count.set(k, (count.get(k) ?? 0) + 1); };
    for (const k of TECH_KEYS) { const d = techDef(k); add(d.units); add(d.buildings); add(d.wonders); }
    for (const k of POLITICS_KEYS) { const d = politicsDef(k); add(d.units); add(d.buildings); add(d.wonders); }
    for (const k of [...Object.keys(UNITS), ...Object.keys(BUILDINGS), ...Object.keys(WONDERS)]) {
      expect(count.get(k) ?? 0, k).toBe(start.has(k as BuildKey) ? 0 : 1);
    }
  });
  it('every government but the first and every policy are unlocked by politics, once', () => {
    for (const gv of GOVERNMENT_KEYS.filter((x) => x !== 'chiefdom')) expect(POLITICS_KEYS.filter((c) => politicsDef(c).governments?.includes(gv)).length, gv).toBe(1);
    for (const pk of POLICY_KEYS) expect(POLITICS_KEYS.filter((c) => politicsDef(c).policies?.includes(pk)).length, pk).toBe(1);
  });
  it('each path has its eight traits (two Classical, a Renaissance fork); each religion its faith; Meditation founds Hinduism', () => {
    for (const p of PATH_KEYS) {
      expect(pathTraits(p).map((k) => traitDef(k).tier), p).toEqual([0, 1, 1, 2, 3, 3, 4, 5]);
      expect(PATHS[PATHS[p].opposite].opposite).toBe(p);
    }
    expect(traitDef('meditation').religion).toBe('hinduism');
    expect(new Set(FAITH_KEYS.map((k) => traitDef(k).religion)).size).toBe(RELIGION_KEYS.length);
  });
});

describe('S2: research, politics and identity', () => {
  it('a goal is reached through what it needs; finishing unlocks what it promises; science carries over', () => {
    const g = fresh(), p = g.players[HUMAN]!;
    const c = settle(g, HUMAN);
    g.setResearch(p, 'writing');
    expect(p.research).toBe('pottery');
    expect(p.researchQueue).toEqual(['writing']);
    expect(g.canBuild(c, 'library')).toBe(false);
    (g as unknown as { addScience: (p: unknown, n: number) => void }).addScience(p, techDef('pottery').cost + techDef('writing').cost + 7);
    expect(p.techs.has('pottery') && p.techs.has('writing')).toBe(true);
    expect(g.canBuild(c, 'library')).toBe(true);
    expect(p.research).toBeNull();
    expect(p.scienceBank).toBe(7);
  });
  it('cohesion pays for politics, which unlocks governments and policies', () => {
    const g = fresh(), p = g.players[HUMAN]!;
    settle(g, HUMAN);
    g.setPolitics(p, 'politicalPhilosophy');
    (g as unknown as { addCohesion: (p: unknown, n: number) => void }).addCohesion(p, 10_000);
    expect(p.politics.has('politicalPhilosophy')).toBe(true);
    expect(g.governmentsOf(p)).toContain('oligarchy');
    expect(g.setGovernment(p, 'oligarchy')).toBe(true);
    expect(g.setPolicy(p, 'military', 0, 'urbanPlanning')).toBe(false);
    expect(g.setPolicy(p, 'economic', 0, 'urbanPlanning')).toBe(true);
    expect(g.setPolicy(p, 'wildcard', 0, 'discipline')).toBe(true);
    expect(g.effectsOf(p).filter((e) => e.k === 'combat').length).toBe(2); // (Oligarchy, Discipline)
  });
  it('a trait costs more than the last; a pair of paths shares seven slots; the fork is one of two; eras gate', () => {
    for (let n = 1; n < 40; n++) expect(traitCost(n)).toBeGreaterThan(traitCost(n - 1));
    const g = fresh(), p = g.players[HUMAN]!;
    settle(g, HUMAN);
    p.identityPoints = 1e9;
    expect(g.adoptTrait(p, 'warriorEthos')).toBe(true);
    expect(g.canAdopt(p, 'hearth')).toBe(true);           // (both sides of the slider)
    expect(g.canAdopt(p, 'battleHardened')).toBe(false);  // (Classical: not yet)
    p.era = 5;
    for (const k of ['battleHardened', 'spoilsOfWar', 'garrisonState'] as const) expect(g.adoptTrait(p, k)).toBe(true);
    expect(g.canAdopt(p, 'grandBatteries')).toBe(true);
    expect(g.adoptTrait(p, 'shockTroops')).toBe(true);
    expect(g.canAdopt(p, 'grandBatteries')).toBe(false);  // (the fork's other)
    // Five Martial: Concord keeps its first two slots only.
    expect(g.adoptTrait(p, 'hearth')).toBe(true);
    expect(g.adoptTrait(p, 'goodNeighbors')).toBe(true);
    expect(g.canAdopt(p, 'commonPurpose')).toBe(false);   // (closed by Martial)
    expect(g.canAdopt(p, 'militaryIndustry')).toBe(false); // (would close Good Neighbors)
    expect(g.effectsOf(p).some((e) => e.k === 'freeUnits')).toBe(true);
  });
  it('a civ adopts 25 traits at most', () => {
    const g = fresh(), p = g.players[HUMAN]!;
    settle(g, HUMAN);
    p.identityPoints = 1e12;
    p.era = 5;
    for (let i = 0; i < 60; i++) { const k = TRAIT_KEYS.find((x) => g.canAdopt(p, x)); if (!k) break; g.adoptTrait(p, k); }
    expect(p.identity.size).toBe(MAX_TRAITS);
    for (const pk of PATH_KEYS) expect(pathLevels(p.identity)[pk] + pathLevels(p.identity)[PATHS[pk].opposite]).toBeLessThanOrEqual(7);
  });
  it('the first to adopt a faith founds its religion; a civ adopts one faith; a founded one is taken', () => {
    const g = fresh();
    const [a, b] = [g.players[0]!, g.players[1]!];
    for (const p of [a, b]) { settle(g, p.id); p.identityPoints = 1e6; g.adoptTrait(p, 'spirituality'); }
    expect(g.adoptTrait(a, 'meditation')).toBe(true);
    expect(g.religions.get('hinduism')?.founder).toBe(a.id);
    expect(g.canAdopt(a, 'covenant')).toBe(false);
    expect(g.canAdopt(b, 'meditation')).toBe(false);
    expect(g.adoptTrait(b, 'covenant')).toBe(true);
    expect(g.religions.get('judaism')?.founder).toBe(b.id);
    expect(g.canAdopt(a, 'inquiry')).toBe(true);          // (Reason: the other side of the slider)
  });
});

describe('S3: resources are scarce and fair', () => {
  it('every start has food and a luxury close by, and Horses and Iron within reach of a second city', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = new Game({ size: 'small', seed });
      for (const s of g.world.starts) {
        const near = (r: number) => g.tilesWithin(s, r).map((t) => g.resources[t]).filter((x): x is ResourceKey => x !== null);
        expect(near(2).filter((r) => RESOURCES[r].kind === 'bonus').length, `seed ${seed} start ${s}: bonus`).toBeGreaterThanOrEqual(1);
        expect(near(3).some((r) => LUXURY_KEYS.includes(r)), `seed ${seed} start ${s}: luxury`).toBe(true);
        expect(near(6).includes('horses'), `seed ${seed} start ${s}: horses`).toBe(true);
        expect(near(6).includes('iron'), `seed ${seed} start ${s}: iron`).toBe(true);
      }
    }
  });
  it('about one land tile in twelve holds a resource (Civ IV-like scarcity)', () => {
    for (const seed of [2, 9]) {
      const g = new Game({ size: 'medium', seed });
      let land = 0, have = 0;
      for (let t = 0; t < g.N; t++) {
        if (g.isWater(t) || g.biome[t] === 'iceSheet') continue;
        land++;
        if (g.resources[t]) have++;
      }
      expect(have / land, `seed ${seed}`).toBeGreaterThan(0.05);
      expect(have / land, `seed ${seed}`).toBeLessThan(0.11);
    }
  });
  it('a strategic resource is hidden until its tech reveals it', () => {
    const g = fresh(), p = g.players[HUMAN]!;
    const t = g.resources.findIndex((r) => r === 'iron');
    expect(t).toBeGreaterThanOrEqual(0);
    expect(g.resourceFor(t, HUMAN)).toBeNull();
    p.techs.add('bronzeWorking');
    expect(g.resourceFor(t, HUMAN)).toBe('iron');
    const w = g.resources.findIndex((r) => r === 'wheat' || r === 'fish');
    expect(g.resourceFor(w, HUMAN)).not.toBeNull();
  });
});

describe('S4: borders and upkeep', () => {
  it('borders grow with a city\'s culture past the tiles its citizens work; a rival cannot settle inside them', () => {
    const g = fresh();
    const c = settle(g, HUMAN);
    const at = (r: number) => g.tilesWithin(c.tile, r).filter((t) => g.tileCity[t] === c.id).length;
    expect(at(3)).toBe(at(1));
    c.culture = BORDER_AT[3];
    for (let i = 0; i < 2; i++) { g.endTurn(); g.over = null; }
    expect(c.ring).toBeGreaterThanOrEqual(3);
    const far = g.tilesWithin(c.tile, 3).filter((t) => !g.tilesWithin(c.tile, 2).includes(t) && g.tileCity[t] === c.id);
    expect(far.length).toBeGreaterThan(0);
    const land = far.find((t) => !g.isWater(t) && g.relief[t] !== 'mountains' && !g.isPentagon(t));
    if (land !== undefined) expect(g.canFoundCity(land, 1)).toBe(false);
    // (Citizens only work within reach.)
    for (const o of g.growthOptions(c)) if (o.kind === 'rural') expect(g.tilesWithin(c.tile, CITY_REACH)).toContain(o.tile);
    for (let t = 0; t < g.N; t++) if (g.use[t] === USE.rural && g.tileCity[t] === c.id) expect(g.tilesWithin(c.tile, CITY_REACH)).toContain(t);
  });
  it('a city with far more culture takes a rival\'s border tiles, never those next to its city', () => {
    const g = fresh();
    const c = settle(g, HUMAN);
    const site = g.tilesWithin(c.tile, 4).find((t) => g.approxDist(t, c.tile) > 3.5 && g.canFoundCity(t, 1) && g.tilesWithin(t, 1).every((x) => g.tileCity[x] === -1));
    if (site === undefined) return;
    const r = g.foundCity(g.createUnit('settler', 1, site))!;
    r.culture = BORDER_AT[3];
    g.endTurn(); g.over = null;
    expect(r.ring).toBe(3);
    c.culture = 40 * BORDER_AT[4];
    for (let i = 0; i < 2; i++) { g.endTurn(); g.over = null; }
    const flipped = g.events.filter((e) => e.kind === 'tileFlipped');
    expect(flipped.length).toBeGreaterThan(0);
    for (const t of g.tilesWithin(r.tile, 1)) expect(g.tileCity[t] === r.id || g.tileCity[t] === -1 || g.tileCity[t] === c.id && g.approxDist(t, r.tile) >= 1.5).toBe(true);
    expect(g.tileCity[r.tile]).toBe(r.id);
  });
  it('each city costs more than the last, a far one more than a near one; a courthouse halves it', () => {
    const total = (n: number) => Array.from({ length: n - 1 }, () => cityUpkeep(5, n - 1, false, 0)).reduce((a, b) => a + b, 0);
    expect(total(4) - total(3)).toBeGreaterThan(total(3) - total(2));
    expect(cityUpkeep(9, 3, false, 0)).toBeGreaterThan(cityUpkeep(3, 3, false, 0));
    expect(cityUpkeep(6, 3, true, 0)).toBeCloseTo(cityUpkeep(6, 3, false, 0) / 2);
  });
  it('techs improve the land: a worked farm yields more after The Plough', () => {
    const g = fresh(), p = g.players[HUMAN]!;
    const c = settle(g, HUMAN);
    const farm = g.tilesWithin(c.tile, 1).find((t) => g.tileCity[t] === c.id && t !== c.tile && g.optionYield({ kind: 'rural', tile: t, improvement: 'farm' }, HUMAN) && !g.isWater(t) && g.relief[t] === 'flat' && !g.feature[t] && ['prairie', 'steppe', 'mediterranean', 'savanna'].includes(g.biome[t]!));
    if (farm === undefined) return;
    const before = g.workedYield(farm, HUMAN).food;
    p.techs.add('plough');
    expect(g.workedYield(farm, HUMAN).food).toBe(before + 1);
  });
});

describe('S5: diplomacy', () => {
  it('all start at peace; units at peace block the way; attacking declares war; peace waits MIN_WAR turns', () => {
    const g = fresh();
    expect(g.atWar(0, 1)).toBe(false);
    const open = (x: number) => !g.isWater(x) && g.relief[x] !== 'mountains' && !g.cityByTile.has(x) && !g.units.some((u) => u.tile === x);
    const t = g.tiles.findIndex((tile) => open(tile.id) && tile.neighbors.filter(open).length >= 3);
    const a = g.createUnit('warrior', 0, t);
    const nb = g.tiles[t]!.neighbors.find(open)!;
    g.createUnit('warrior', 1, nb);
    expect(g.isForeignBlocked(nb, 0)).toBe(true);
    expect(g.findPath(a, nb)).toBeNull();
    g.attack(a, nb);
    expect(g.atWar(0, 1)).toBe(true);
    expect(g.canMakePeace(0, 1)).toBe(false);
    g.turn += MIN_WAR;
    expect(g.makePeace(0, 1)).toBe(true);
    expect(g.atWar(0, 1)).toBe(false);
  });
});

describe('S6: the record', () => {
  it('every player\'s actions and each turn\'s accounts are recorded', () => {
    const g = new Game({ size: 'small', seed: 7 });
    g.players[0]!.isHuman = false;
    for (let i = 0; i < 40; i++) { g.over = null; g.endTurn(); }
    const kinds = new Set(g.events.map((e) => e.kind));
    for (const k of ['start', 'turn', 'summary', 'research', 'politics', 'trait', 'cityFounded', 'unitCreated', 'move'] as const) expect(kinds.has(k), k).toBe(true);
    expect(new Set(g.events.filter((e) => e.kind === 'summary').map((e) => e.player)).size).toBe(g.players.length);
  });
});
