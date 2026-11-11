// The units' balance, era by era: for the land units a civ has at hand in
// each era (those the era unlocks and those of the era before), how a duel
// in the open goes between each two (`clash`: they close from out of
// reach, shooters firing as soon as they can, the rest charging in), and
// what each does to a city's walls for its cost.
//   npx tsx scripts/balance.ts [era]
// The rules these numbers are held to are test/balance.test.ts's.

import { UNITS, unitDef, domainOf, type UnitKey } from '../src/rules.ts';
import { TECH_KEYS, techDef } from '../src/techs.ts';
import { POLITICS_KEYS, politicsDef } from '../src/politics.ts';
import { UNIT_CLASS, canShoot, canAssault, isShooter } from '../src/unitClasses.ts';
import { combatStrength, matchup, fightRounds, SIEGE_VS_UNITS, SIEGE_VS_CITY, VOLLEY_ROUNDS, MELEE_ROUNDS } from '../src/game.ts';
import { mulberry32 } from '../src/rng.ts';
import { ERAS } from '../src/cities.ts';

// The era each unit comes in (what unlocks it; from the start: 0).
export const UNIT_ERA = new Map<UnitKey, number>((Object.keys(UNITS) as UnitKey[]).map((k) => [k, 0]));
for (const k of TECH_KEYS) for (const u of techDef(k).units ?? []) UNIT_ERA.set(u, techDef(k).era);
for (const k of POLITICS_KEYS) for (const u of politicsDef(k).units ?? []) UNIT_ERA.set(u, politicsDef(k).era);

export const fights = (k: UnitKey): boolean => domainOf(unitDef(k)) === 'land' && !unitDef(k).civilian && (canShoot(k) || canAssault(k)) && UNIT_CLASS[k] !== 'leader';
export const landUnits = (era: number): UnitKey[] => (Object.keys(UNITS) as UnitKey[]).filter((k) => fights(k) && UNIT_ERA.get(k) === era);

// A duel in the open, x against y, from out of reach: the chance x wins
// (a draw counts half), over `n` duels, each side moving first in half.
export function clash(x: UnitKey, y: UnitKey, n = 2000, seed = 7): number {
  const rng = mulberry32(seed);
  const X = unitDef(x), Y = unitDef(y);
  const reach = (k: UnitKey) => (isShooter(k) && canShoot(k) ? unitDef(k).reach ?? 1 : 0);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const hp = [100, 100], who: [UnitKey, UnitKey] = [x, y];
    let dist = Math.max(reach(x), reach(y), X.mv, Y.mv) + 1, turn = i % 2;
    for (let step = 0; step < 80 && hp[0]! > 0 && hp[1]! > 0; step++, turn = 1 - turn) {
      const me = who[turn]!, foe = who[1 - turn]!, T = unitDef(me), r = reach(me);
      if (r > 0) {
        if (dist > r) { dist = Math.max(r, dist - T.mv); continue; }
        const A = combatStrength(me, 'ranged', hp[turn]!, 0) * matchup(me, foe, 'atk'), D = combatStrength(foe, 'guard', hp[1 - turn]!, 0) * matchup(foe, me, 'def');
        hp[1 - turn] = fightRounds(hp[turn]!, hp[1 - turn]!, A, D, 'ranged', rng).defender;
      } else if (dist <= T.mv) {
        const A = combatStrength(me, 'melee', hp[turn]!, 0) * matchup(me, foe, 'atk'), D = combatStrength(foe, 'melee', hp[1 - turn]!, 0) * matchup(foe, me, 'def');
        const out = fightRounds(hp[turn]!, hp[1 - turn]!, A, D, 'melee', rng);
        hp[turn] = out.attacker; hp[1 - turn] = out.defender;
        dist = 1;
      } else dist = Math.max(1, dist - T.mv);
    }
    wins += hp[0]! > 0 && hp[1]! <= 0 ? 1 : hp[0]! > 0 && hp[1]! > 0 ? 0.5 : 0;
  }
  return wins / n;
}

// What a unit takes off a city's garrison in an attack (of its 100 HP):
// three exchanges against a garrison of strength `city`; an engine twice
// as strong as its attack says (game.ts SIEGE_VS_CITY over SIEGE_VS_UNITS).
export function wallDamage(k: UnitKey, city: number): number {
  const T = unitDef(k), s = (isShooter(k) ? T.rangedAtk ?? 0 : T.melee) * (T.siege ? SIEGE_VS_UNITS * SIEGE_VS_CITY : 1);
  return (isShooter(k) ? VOLLEY_ROUNDS : MELEE_ROUNDS) * 24.5 * (s / (s + city));
}
// A garrison's strength in an era: the era's foot, fortified behind walls (three times its strength).
const FOOT = [1.5, 2.5, 4, 7, 10.5, 16, 23.5] as const;
export const cityOf = (era: number): number => 3 * FOOT[Math.min(era, FOOT.length - 1)]!;

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2] === undefined ? null : Number(process.argv[2]);
  for (let era = 0; era < ERAS.length; era++) {
    if (only !== null && only !== era) continue;
    const units = [...(era > 0 ? landUnits(era - 1) : []), ...landUnits(era)];
    console.log(`\n== ${ERAS[era]!.name} ==  (row beats column, %; then a walled garrison: damage an attack, and per 100 production)`);
    const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
    console.log(pad('', 34) + units.map((u) => pad(u, 6)).join(' '));
    for (const a of units) {
      const T = unitDef(a);
      const stats = `${T.melee}/${T.rangedAtk ?? '-'}${T.reach ? `r${T.reach}` : ''}/${T.rangedDef} m${T.mv} $${T.cost}${T.needs ? ` ${T.needs}` : ''}`;
      const w = wallDamage(a, cityOf(era));
      console.log(pad(`${UNIT_ERA.get(a) === era ? '' : '·'}${a}`, 14) + pad(stats, 20) + units.map((d) => (a === d ? '   -  ' : pad(String(Math.round(100 * clash(a, d, 600))).padStart(4), 6))).join(' ')
        + `   walls ${w.toFixed(0).padStart(3)} ${((100 * w) / T.cost).toFixed(0).padStart(4)}`);
    }
  }
}
