// The units' balance: every kind has its use in its era. A duel in the open
// (scripts/balance.ts clash: from out of reach, shooters firing as soon as
// they can, the rest charging in) is held to the wheel the roster is built
// on: horse rides down shooters, spears and pikes hold off horse, foot
// holds its own against shooters that have no screen (never crushed by
// them, as in games where nothing but archers is worth building), engines
// are for walls and lose to anything in the field, a unit that needs a
// strategic resource is better than the one that does not, and each unit
// beats the one it upgrades from.

import { describe, it, expect } from 'vitest';
import { clash, wallDamage, cityOf, fights } from '../scripts/balance.ts';
import { UPGRADES, type UnitKey } from '../src/rules.ts';

interface Era { foot: UnitKey; pike?: UnitKey; horse?: UnitKey; shot?: UnitKey; engine?: UnitKey }
const ERAS: Era[] = [
  { foot: 'spearman', pike: 'spearman', horse: 'horseman', shot: 'archer' },
  { foot: 'swordsman', pike: 'spearman', horse: 'horseman', shot: 'compositeBowman', engine: 'catapult' },
  { foot: 'manAtArms', pike: 'pikeman', horse: 'knight', shot: 'crossbowman', engine: 'trebuchet' },
  { foot: 'musketman', horse: 'lancer', shot: 'fieldCannon', engine: 'cannon' },
  { foot: 'rifleman', horse: 'cavalry', shot: 'machineGun', engine: 'artillery' },
  { foot: 'infantry', pike: 'antiTank', horse: 'tank' },
];
const N = 1500;

describe('balance: every unit has its use in its era', () => {
  ERAS.forEach((e, era) => {
    it(`era ${era}: the wheel of ${Object.values(e).join(', ')}`, () => {
      if (e.horse && e.shot) expect(clash(e.horse, e.shot, N), 'horse rides down shooters').toBeGreaterThan(0.6);
      if (e.pike && e.horse) expect(clash(e.pike, e.horse, N), 'pikes hold off horse').toBeGreaterThan(0.5);
      if (e.shot) {
        const p = clash(e.shot, e.foot, N);
        expect(p, 'shooters do not crush foot').toBeLessThan(0.75);
        expect(p, 'shooters are worth building').toBeGreaterThan(0.3);
      }
      if (e.engine) {
        expect(clash(e.engine, e.foot, N), 'engines lose in the field').toBeLessThan(0.4);
        expect(wallDamage(e.engine, cityOf(era)), 'engines are for walls').toBeGreaterThan(1.6 * wallDamage(e.foot, cityOf(era)));
      }
    });
  });
  it('a unit beats the one it upgrades from', () => {
    const bad = (Object.entries(UPGRADES) as [UnitKey, UnitKey][]).filter(([a, b]) => fights(a) && fights(b) && clash(b, a, 800) < 0.6).map(([a, b]) => `${b} over ${a}`);
    expect(bad).toEqual([]);
  });
  it('iron buys the better sword', () => {
    expect(clash('longswordsman', 'manAtArms', N)).toBeGreaterThan(0.58);
  });
});
