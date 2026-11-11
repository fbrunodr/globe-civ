// How assaults on a garrisoned city go, by simulation: `n` attackers of a
// kind against one garrison of a kind, fortified in a city (with or without
// walls), each attacker attacking once a turn, the garrison healing as the
// rules say (or as a rule being tried would have it). The share of sieges
// the attackers win (the garrison dead before they all are, within 30
// turns), and how long those take.
//   npx tsx scripts/siege.ts
// The game's own rule is held to this in test/siege.test.ts.

import { combatStrength, matchup, fightRounds, FORTIFY_BONUS, GARRISON_HEAL, BESIEGED_HEAL } from '../src/game.ts';
import { unitDef, type UnitKey } from '../src/rules.ts';
import { mulberry32 } from '../src/rng.ts';

export interface Siege { attacker: UnitKey; n: number; garrison: UnitKey; walls: boolean; heal: number; healBesieged: number }
export function siege(s: Siege, games = 4000, seed = 3): { won: number; turns: number } {
  const rng = mulberry32(seed);
  let won = 0, turns = 0;
  const bonus = 0.5 + (s.walls ? 1 : 0) + FORTIFY_BONUS;
  for (let g = 0; g < games; g++) {
    const hp = Array.from({ length: s.n }, () => 100);
    let d = 100, t = 0;
    for (t = 1; t <= 30 && d > 0 && hp.some((h) => h > 0); t++) {
      let attacked = false;
      for (let i = 0; i < s.n && d > 0; i++) {
        if (hp[i]! <= 0) continue;
        const A = combatStrength(s.attacker, 'melee', hp[i]!, 0) * matchup(s.attacker, s.garrison, 'atk');
        const D = combatStrength(s.garrison, 'melee', d, bonus) * matchup(s.garrison, s.attacker, 'def');
        const out = fightRounds(hp[i]!, d, A, D, 'melee', rng);
        hp[i] = out.attacker; d = out.defender;
        attacked = true;
      }
      if (d > 0) d = Math.min(100, d + (attacked ? s.healBesieged : s.heal));
    }
    if (d <= 0) { won++; turns += t - 1; }
  }
  return { won: won / games, turns: won ? turns / won : NaN };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const foot: UnitKey[] = ['warrior', 'spearman', 'swordsman', 'manAtArms', 'musketman', 'rifleman', 'infantry'];
  const rules: [string, number, number][] = [['heals 25 a turn, besieged or not (as it was)', 25, 25], ['heals 10 while besieged', 25, 10], ['no healing while besieged', 25, 0], [`the game's rule (${BESIEGED_HEAL} while besieged)`, GARRISON_HEAL, BESIEGED_HEAL]];
  for (const [name, heal, healBesieged] of rules) {
    console.log(`\n${name}: attackers' share of sieges won (and turns), same kind against same kind`);
    console.log('                 2 vs open city   3 vs open city   2 vs walls   3 vs walls   4 vs walls');
    for (const k of foot) {
      const cell = (n: number, walls: boolean) => { const r = siege({ attacker: k, n, garrison: k, walls, heal, healBesieged }, 2000); return `${Math.round(100 * r.won).toString().padStart(4)}% ${Number.isNaN(r.turns) ? '  – ' : r.turns.toFixed(1).padStart(4)}t`; };
      console.log(`${unitDef(k).name.padEnd(16)} ${cell(2, false).padEnd(16)} ${cell(3, false).padEnd(16)} ${cell(2, true).padEnd(12)} ${cell(3, true).padEnd(12)} ${cell(4, true)}`);
    }
  }
}
