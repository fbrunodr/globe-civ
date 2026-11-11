// Debt (economy.ts, game.ts settleAccounts): what a civ cannot pay of its
// upkeep, it loses in proportion; no floor to expand under.

import { describe, it, expect } from 'vitest';
import { Game, HUMAN } from '../src/game.ts';
import { arrearsOf, ARREARS_MAX } from '../src/economy.ts';

describe('E1: debt always costs', () => {
  it('the share unpaid is the share lost, up to the most', () => {
    expect(arrearsOf(0, 50)).toBe(0);
    expect(arrearsOf(20, 50)).toBeCloseTo(0.4);
    expect(arrearsOf(500, 50)).toBe(ARREARS_MAX);
  });
  it('a civ in arrears makes less production, science and culture, not less food or gold; a unit it cannot pay deserts', () => {
    const g = new Game({ size: 'small', seed: 5 });
    for (const p of g.players) p.isHuman = true;
    const p = g.players[HUMAN]!;
    const c = g.foundCity(g.units.find((u) => u.owner === HUMAN && u.type === 'settler')!)!;
    const before = g.cityYields(c);
    // (An army far past what it can keep, and nothing in the treasury.)
    for (let i = 0; i < 12; i++) g.createUnit('musketman', HUMAN, c.tile);
    const army = g.units.filter((u) => u.owner === HUMAN).length;
    p.gold = 0;
    g.endTurn(); g.over = null;
    expect(p.arrears).toBeGreaterThan(0);
    expect(g.units.filter((u) => u.owner === HUMAN).length).toBe(army - 1);
    const after = g.cityYields(c);
    expect(after.prod).toBeLessThan(before.prod);
    expect(after.science).toBeLessThan(before.science);
    expect(after.food).toBe(before.food);
    expect(after.gold).toBe(before.gold);
    // (Paid again: nothing lost.)
    for (const u of g.units.filter((x) => x.owner === HUMAN && x.type === 'musketman')) g.removeUnit(u);
    p.gold = 500;
    g.endTurn(); g.over = null;
    expect(p.arrears).toBe(0);
    expect(g.cityYields(c).prod).toBe(before.prod);
  });
});
