// Sieges (scripts/siege.ts): what it takes to beat a garrison, which heals
// every turn it holds (as in Civ V). An open city adds nothing to its
// garrison, walls double it: two of a kind take an open city from one of
// the same more often than not; walls hold against two and fall to three.

import { describe, it, expect } from 'vitest';
import { siege } from '../scripts/siege.ts';
import { GARRISON_HEAL } from '../src/game.ts';

const run = (n: number, walls: boolean) => siege({ attacker: 'spearman', n, garrison: 'spearman', walls, heal: GARRISON_HEAL }, 3000).won;

describe('SG1: what a garrison holds against', () => {
  it('two take an open city from one, more often than not', () => expect(run(2, false)).toBeGreaterThan(0.52));
  it('one alone does not', () => expect(run(1, false)).toBeLessThan(0.25));
  it('walls hold against two, and fall to three more often than not', () => {
    expect(run(2, true)).toBeLessThan(0.4);
    expect(run(3, true)).toBeGreaterThan(0.52);
  });
});
