// Faith in war (religion.ts, game.ts faithEdge): a unit carries its city's
// religion; attacking the same faith it is weaker, another stronger; one
// with none is left out of it. And the victories.

import { describe, it, expect } from 'vitest';
import { Game, HUMAN, VICTORIES } from '../src/game.ts';
import { FAITH_SAME, FAITH_RIVAL } from '../src/religion.ts';
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

describe('F1: faith in war', () => {
  it('a unit carries the religion its city followed when it was raised, and keeps it', () => {
    const { g, a } = two();
    expect(g.createUnit('warrior', 0, a.tile).faith).toBeNull();
    a.religion = 'hinduism';
    const w = g.createUnit('warrior', 0, a.tile);
    expect(w.faith).toBe('hinduism');
    a.religion = 'judaism';
    expect(w.faith).toBe('hinduism');
  });
  it('attacking the same faith: weaker; another: stronger; either with none: nothing', () => {
    const { g } = two();
    const of = (faith: 'hinduism' | 'judaism' | null) => ({ faith });
    expect(g.faithEdge(of('hinduism'), of('hinduism'))).toBeCloseTo(1 - FAITH_SAME);
    expect(g.faithEdge(of('hinduism'), of('judaism'))).toBeCloseTo(1 + FAITH_RIVAL);
    expect(g.faithEdge(of(null), of('judaism'))).toBe(1);
    expect(g.faithEdge(of('hinduism'), of(null))).toBe(1);
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
