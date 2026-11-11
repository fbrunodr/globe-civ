// Sieges (scripts/siege.ts): what it takes to beat a garrison. A unit
// attacked does not heal that turn, so an assault kept up wears it down:
// two of a kind take an open city from one of the same more often than
// not; walls ask for a third.

import { describe, it, expect } from 'vitest';
import { siege } from '../scripts/siege.ts';
import { GARRISON_HEAL, BESIEGED_HEAL } from '../src/game.ts';

const run = (n: number, walls: boolean) => siege({ attacker: 'spearman', n, garrison: 'spearman', walls, heal: GARRISON_HEAL, healBesieged: BESIEGED_HEAL }, 3000).won;

describe('SG1: a garrison can be worn down', () => {
  it('two take an open city from one, more often than not', () => expect(run(2, false)).toBeGreaterThan(0.5));
  it('one alone does not', () => expect(run(1, false)).toBeLessThan(0.25));
  it('walls hold against two, and fall to three more often than not', () => {
    expect(run(2, true)).toBeLessThan(0.45);
    expect(run(3, true)).toBeGreaterThan(0.5);
  });
});
