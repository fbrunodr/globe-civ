// Sieges (scripts/siege.ts): what it takes to beat a garrison, which heals
// every turn it holds. An open city adds nothing to its garrison, walls
// half as much again: two of a kind take an open city from one of the
// same two times in three; behind walls it is about even, and three take it.

import { describe, it, expect } from 'vitest';
import { siege } from '../scripts/siege.ts';
import { GARRISON_HEAL } from '../src/game.ts';

const run = (n: number, walls: boolean) => siege({ attacker: 'spearman', n, garrison: 'spearman', walls, heal: GARRISON_HEAL }, 3000).won;

describe('SG1: what a garrison holds against', () => {
  it('two take an open city from one, more often than not', () => expect(run(2, false)).toBeGreaterThan(0.55));
  it('one alone does not', () => expect(run(1, false)).toBeLessThan(0.3));
  it('walls make it harder for two (about even), and three take it', () => {
    expect(run(2, true)).toBeLessThan(run(2, false) - 0.1);
    expect(run(2, true)).toBeGreaterThan(0.3);
    expect(run(3, true)).toBeGreaterThan(0.6);
  });
});
