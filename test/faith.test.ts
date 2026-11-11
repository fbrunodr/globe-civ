// Faith binds and divides (religion.ts, game.ts faiths): pilgrims' gold
// among the faithful at peace, less cohesion at war with them or under a
// foreign creed; a civ without a faith is left alone. And the victories.

import { describe, it, expect } from 'vitest';
import { Game, HUMAN, VICTORIES } from '../src/game.ts';
import { PILGRIM_GOLD } from '../src/religion.ts';
import { TECH_KEYS } from '../src/techs.ts';

const two = () => {
  const g = new Game({ size: 'small', seed: 5 });
  for (const p of g.players) p.isHuman = true;
  const a = g.foundCity(g.units.find((u) => u.owner === 0 && u.type === 'settler')!)!;
  const b = g.foundCity(g.units.find((u) => u.owner === 1 && u.type === 'settler')!)!;
  g.met[0]![1] = g.met[1]![0] = 1;
  return { g, a, b };
};

describe('F1: faith binds and divides', () => {
  it('no faith: nothing', () => {
    const { g } = two();
    expect(g.faithOf(0)).toBeNull();
    expect(g.faiths().bond[0]).toBe(false);
  });
  it('one faith at peace: pilgrims; at war: none, and less cohesion', () => {
    const { g, a, b } = two();
    g.religions.set('hinduism', { founder: 0, holyCity: a.id, turn: 1 });
    a.religion = b.religion = 'hinduism';
    expect(g.faithOf(0)).toBe('hinduism');
    expect(g.faithOf(1)).toBe('hinduism'); // (most of its cities)
    // (useVersion: the faiths are worked out anew, as after a turn.)
    const alone = (() => { b.religion = null; g.useVersion++; const y = g.cityYields(a); b.religion = 'hinduism'; g.useVersion++; return y; })();
    const peace = g.cityYields(a);
    expect(peace.gold).toBe(alone.gold + PILGRIM_GOLD);
    g.declareWar(0, 1);
    const war = g.cityYields(a);
    expect(war.gold).toBe(alone.gold);
    expect(war.cohesion).toBeLessThanOrEqual(peace.cohesion);
    expect(g.faiths().strife[0]).toBe(true);
  });
  it('a city under another creed than its civ\'s faith: the creeds quarrel', () => {
    const { g, a, b } = two();
    g.religions.set('hinduism', { founder: 0, holyCity: a.id, turn: 1 });
    g.religions.set('judaism', { founder: 1, holyCity: b.id, turn: 1 });
    a.religion = 'judaism';
    expect(g.faithOf(0)).toBe('hinduism');
    expect(g.faiths().bond[0]).toBe(false);
  });
});

describe('V1: the game is won', () => {
  it('four ways, each said in a line', () => expect(Object.keys(VICTORIES).sort()).toEqual(['conquest', 'religion', 'science', 'time']));
  it('by science: the first to know every technology', () => {
    const { g } = two();
    for (const k of TECH_KEYS) g.players[1]!.techs.add(k);
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
  it('by religion: a faith most of the world\'s cities follow', () => {
    const { g, a, b } = two();
    g.religions.set('hinduism', { founder: HUMAN, holyCity: a.id, turn: 1 });
    a.religion = b.religion = 'hinduism';
    g.endTurn();
    expect(g.winner).toEqual({ player: HUMAN, how: 'religion' });
    expect(g.over).toBe('victory');
  });
});
