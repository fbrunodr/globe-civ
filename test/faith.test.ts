// Faith in war (religion.ts, game.ts faithEdge), civ against civ: the same
// religion, the attacker weaker and its people troubled; another,
// stronger; either with none, nothing. Missionaries. And the victories.

import { describe, it, expect } from 'vitest';
import { Game, HUMAN, VICTORIES } from '../src/game.ts';
import { FAITH_SAME, FAITH_RIVAL, HOLY_STRIFE, MISSIONARY_FAITH, CONVERT_PER_POP, DEVOUT_TURNS } from '../src/religion.ts';
import { FINAL_TECH } from '../src/techs.ts';
import { TRUCE_TURNS } from '../src/game.ts';

const two = () => {
  const g = new Game({ size: 'small', seed: 5 });
  for (const p of g.players) p.isHuman = true;
  const a = g.foundCity(g.units.find((u) => u.owner === 0 && u.type === 'settler')!)!;
  const b = g.foundCity(g.units.find((u) => u.owner === 1 && u.type === 'settler')!)!;
  g.met[0]![1] = g.met[1]![0] = 1;
  return { g, a, b };
};

describe('F1: faith in war, civ against civ', () => {
  it('a civ\'s religion: the one it founded, else the one most of its people follow', () => {
    const { g, a, b } = two();
    expect(g.faithOf(0)).toBeNull();
    b.religion = 'judaism'; g.faithVersion++;
    expect(g.faithOf(1)).toBe('judaism');
    g.religions.set('hinduism', { founder: 0, holyCity: a.id, turn: 1 }); g.faithVersion++;
    expect(g.faithOf(0)).toBe('hinduism');
  });
  it('attacking a civ of the same religion: weaker; of another: stronger; either with none: nothing; whatever the city or the unit', () => {
    const { g, a, b } = two();
    g.declareWar(0, 1);
    const nb = g.tiles[b.tile]!.neighbors.find((n) => !g.isWater(n) && g.relief[n] !== 'mountains')!;
    const w = g.createUnit('warrior', 0, a.tile);
    w.tile = nb;
    g.createUnit('warrior', 1, b.tile);
    const plain = g.combatPreview(w, b.tile, 'melee')!.atk;
    expect(g.faithEdge(0, 1)).toBe(1);
    a.religion = 'hinduism'; b.religion = 'hinduism'; g.faithVersion++;
    expect(g.faithEdge(0, 1)).toBeCloseTo(1 - FAITH_SAME);
    expect(g.combatPreview(w, b.tile, 'melee')!.atk).toBeCloseTo(plain * (1 - FAITH_SAME));
    b.religion = 'judaism'; g.faithVersion++;
    expect(g.combatPreview(w, b.tile, 'melee')!.atk).toBeCloseTo(plain * (1 + FAITH_RIVAL));
    b.religion = null; g.faithVersion++;
    expect(g.combatPreview(w, b.tile, 'melee')!.atk).toBeCloseTo(plain);
  });
  it('a war on a civ of its own religion costs cohesion in its cities that follow it, more with each such war', () => {
    const { g, a, b } = two();
    const c = g.foundCity(g.units.find((u) => u.owner === 2 && u.type === 'settler')!)!;
    g.met[0]![2] = g.met[2]![0] = 1;
    a.religion = b.religion = c.religion = 'hinduism'; g.faithVersion++;
    a.buildings.add('monument');
    const calm = g.cityYields(a).cohesion;
    expect(calm).toBeGreaterThan(0);
    g.declareWar(0, 1);
    expect(g.holyWars(0)).toBe(1);
    const one = g.cityYields(a).cohesion;
    expect(one).toBeLessThan(calm);
    g.declareWar(0, 2);
    expect(g.holyWars(0)).toBe(2);
    expect(g.cityYields(a).cohesion).toBeLessThanOrEqual(one);
    expect(HOLY_STRIFE).toEqual([0, 0.25, 0.4, 0.5]);
    // (A city of its that follows another religion is not troubled.)
    a.religion = null; g.faithVersion++;
    expect(g.faithOf(0)).toBeNull();
    expect(g.cityYields(a).cohesion).toBe(calm);
  });
});

describe('F2: missionaries', () => {
  it('the founder raises one with faith, in a city of its own that follows its religion; it preaches beside a city and is spent', () => {
    const { g, a, b } = two();
    const p = g.players[0]!;
    expect(g.missionaryBlock(0, a)).not.toBeNull(); // (no religion founded)
    g.religions.set('hinduism', { founder: 0, holyCity: a.id, turn: 1 });
    a.religion = 'hinduism'; g.faithVersion++;
    p.faith = MISSIONARY_FAITH - 1;
    expect(g.trainMissionary(0, a)).toBeNull();
    p.faith = 1000;
    const m = g.trainMissionary(0, a)!;
    expect(m.type).toBe('missionary');
    expect(p.faith).toBe(1000 - MISSIONARY_FAITH);
    expect(g.canBuild(a, 'missionary')).toBe(false); // (never built)
    // (Far from the city: it cannot preach there.)
    expect(g.preach(m, b)).toBe(false);
    m.tile = g.tiles[b.tile]!.neighbors.find((n) => !g.isWater(n) && g.relief[n] !== 'mountains')!;
    expect(g.preachTarget(m)).toBe(b);
    const before = p.faith;
    expect(g.preach(m, b)).toBe(true);
    expect(b.religion).toBe('hinduism');
    expect(b.devout).toBe(g.turn + DEVOUT_TURNS);
    expect(p.faith).toBe(before - CONVERT_PER_POP * b.pop);
    expect(m.dead).toBe(true);
    // (Lately converted: another missionary's word does not take.)
    g.religions.set('judaism', { founder: 1, holyCity: null, turn: 1 });
    g.players[1]!.faith = 1000;
    const rival = g.createUnit('missionary', 1, b.tile);
    expect(g.preachBlock(rival, b)).not.toBeNull();
  });
});

describe('V1: the game is won', () => {
  it('four ways, each said in a line', () => expect(Object.keys(VICTORIES).sort()).toEqual(['conquest', 'religion', 'science', 'time']));
  it('by science: the first to discover the last technology', () => {
    const { g } = two();
    g.players[1]!.techs.add(FINAL_TECH);
    g.endTurn();
    expect(g.winner).toEqual({ player: 1, how: 'science' });
    expect(g.over).toBe('defeat');
  });
  it('by conquest: two thirds of the civs\' first capitals in one hand', () => {
    const { g, b } = two();
    const need = g.capitalsToWin;
    expect(need).toBe(Math.ceil((2 * g.players.length) / 3));
    expect(g.capitalsHeld(0)).toBe(1);
    // (The other civs' first capitals: cities handed to it one by one.)
    const caps = [b];
    for (const p of g.players.slice(2)) { const s = g.units.find((u) => u.owner === p.id && u.type === 'settler'); const c = s && g.foundCity(s); if (c) caps.push(c); }
    for (let i = 0; i < need - 2; i++) caps[i]!.owner = 0;
    g.endTurn();
    expect(g.winner).toBeNull();
    caps[need - 2]!.owner = 0;
    g.endTurn();
    expect(g.winner).toEqual({ player: 0, how: 'conquest' });
  });
  it('on time: the best score when the last turn ends', () => {
    const g = new Game({ size: 'small', seed: 5, turnLimit: 3 });
    for (const p of g.players) p.isHuman = false;
    for (let t = 0; t < 5 && !g.winner; t++) g.endTurn();
    expect(g.winner?.how).toBe('time');
    expect(g.score(g.winner!.player)).toBe(Math.max(...g.players.map((p) => g.score(p.id))));
  });
  it('a truce can be broken, at a price: less cohesion for as long as it had to run', () => {
    const { g } = two();
    g.declareWar(0, 1);
    for (let t = 0; t < 9; t++) g.endTurn();
    expect(g.makePeace(0, 1)).toBe(true);
    expect(g.truceLeft(0, 1)).toBe(TRUCE_TURNS);
    g.declareWar(0, 1);
    expect(g.atWar(0, 1)).toBe(true);
    expect(g.players[0]!.dishonor).toBe(TRUCE_TURNS);
    expect(g.players[1]!.dishonor).toBe(0);
  });
  it('by religion: a faith most of the world\'s cities follow', () => {
    const { g, a, b } = two();
    g.religions.set('hinduism', { founder: HUMAN, holyCity: a.id, turn: 1 });
    a.religion = b.religion = 'hinduism';
    g.endTurn();
    expect(g.winner).toEqual({ player: HUMAN, how: 'religion' });
    expect(g.over).toBe('victory');
  });
});
