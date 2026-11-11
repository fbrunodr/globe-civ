// The computer civs (ai.ts, aiMilitary.ts), playing whole games by the
// policy written by hand (aiPolicy.ts BASE: the bred levels change, this
// does not): they grow, keep their cities garrisoned, improve their
// resources, lay roads, go to war as an army and take cities; and the same
// seed plays the same game.

import { describe, it, expect } from 'vitest';
import { Game } from '../src/game.ts';
import { BASE, GENES, GENE_KEYS, mutate, policy } from '../src/aiPolicy.ts';
import { unitDef, domainOf } from '../src/rules.ts';
import { mulberry32 } from '../src/rng.ts';

const play = (seed: number, turns: number): Game => {
  const g = new Game({ size: 'small', seed, policies: Array.from({ length: 12 }, () => BASE) });
  for (const p of g.players) p.isHuman = false;
  for (let t = 0; t < turns; t++) { g.endTurn(); g.over = null; }
  return g;
};
const digest = (g: Game) => g.players.map((p) => `${g.cities.filter((c) => c.owner === p.id).length}/${p.techs.size}/${p.gold}/${g.units.filter((u) => u.owner === p.id).length}`).join(' ');

describe('AI1: a game between computer civs', () => {
  const g = play(12, 200);
  it('every civ grows: cities, citizens, techs', () => {
    for (const p of g.players) {
      const cities = g.cities.filter((c) => c.owner === p.id);
      expect(cities.length, p.name).toBeGreaterThanOrEqual(3);
      expect(p.techs.size, p.name).toBeGreaterThan(20);
    }
  });
  it('cities are garrisoned (nine in ten at least)', () => {
    const held = g.cities.filter((c) => g.units.some((u) => u.tile === c.tile && u.owner === c.owner && !unitDef(u.type).civilian && domainOf(unitDef(u.type)) === 'land'));
    expect(held.length / g.cities.length).toBeGreaterThan(0.9);
  });
  it('no army runs away with the treasury: units stay within what the cities can keep', () => {
    for (const p of g.players) expect(g.units.filter((u) => u.owner === p.id).length, p.name).toBeLessThan(12 + 6 * g.cities.filter((c) => c.owner === p.id).length);
  });
  it('workers improve resources and lay roads', () => {
    expect(g.road.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
    const civs = g.players.filter((p) => g.luxuriesOf(p.id).length > 0 || g.resourceCopies(p.id).size > 0);
    expect(civs.length).toBeGreaterThanOrEqual(g.players.length - 1);
  });
  it('wars are fought as armies, and cities fall', () => {
    // (Over a few games: a war in most, a city taken in one at least.)
    const games = [g, play(15, 200), play(14, 200)];
    expect(games.filter((x) => x.events.some((e) => e.kind === 'war')).length).toBeGreaterThanOrEqual(2);
    expect(games.reduce((n, x) => n + x.events.filter((e) => e.kind === 'cityCaptured').length, 0)).toBeGreaterThan(0);
  });
  it('the same seed plays the same game', () => {
    expect(digest(play(5, 80))).toBe(digest(play(5, 80)));
  });
});

describe('AI2: policies', () => {
  it('BASE lies within every gene\'s bounds, and a varied policy stays there', () => {
    const rng = mulberry32(3);
    let p = BASE;
    for (let i = 0; i < 50; i++) p = mutate(p, rng, 1, 0.5);
    for (const k of GENE_KEYS) {
      expect(BASE[k], k).toBeGreaterThanOrEqual(GENES[k][0]);
      expect(BASE[k], k).toBeLessThanOrEqual(GENES[k][1]);
      expect(p[k], k).toBeGreaterThanOrEqual(GENES[k][0]);
      expect(p[k], k).toBeLessThanOrEqual(GENES[k][1]);
    }
  });
  it('a file\'s loose numbers make a whole policy (what is missing: BASE; a gene no longer known: dropped)', () => {
    const p = policy({ cityTarget: 99, gone: 3 });
    expect(p.cityTarget).toBe(GENES.cityTarget[1]);
    expect(p.warRatio).toBe(BASE.warRatio);
    expect(Object.keys(p).sort()).toEqual([...GENE_KEYS].sort());
  });
});
