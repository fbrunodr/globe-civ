// Can a civ that plays for one victory get it? One civ deciding by the
// strongest level with some genes overridden (a warmonger, a zealot),
// the others by the strongest level as bred. If a civ that goes all in for
// a victory cannot come near it, the rules are in its way.
//   npx tsx scripts/specialist.ts --genes '{"warAfter":10,"warChance":0.3}' [--games 6] [--size small]

import { Game } from '../src/game.ts';
import type { MapSizeKey } from '../src/rules.ts';
import { LEVELS, policy } from '../src/aiPolicy.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1]! : d; };
const GAMES = Number(arg('games', '6')), size = arg('size', 'small') as MapSizeKey;
const best = LEVELS[LEVELS.length - 1]!;
const special = policy({ ...best.policy, ...(JSON.parse(arg('genes', '{}')) as Record<string, number>) });
const out: string[] = [];
let wins = 0;
for (let k = 0; k < GAMES; k++) {
  const g = new Game({ size, seed: 7000 + k, policies: Array.from({ length: 12 }, () => best.policy) });
  for (const p of g.players) p.isHuman = false;
  const me = k % g.players.length;
  g.aiPolicies[me] = special;
  let capPeak = 0, faithPeak = 0;
  while (!g.winner && g.turn <= g.turnLimit + 1) {
    g.endTurn();
    if (g.turn % 5 === 0) { capPeak = Math.max(capPeak, g.capitalsHeld(me)); faithPeak = Math.max(faithPeak, g.faithShare(me)); }
  }
  const w = g.winner, rank = [...g.players].sort((a, b) => g.score(b.id) - g.score(a.id)).findIndex((p) => p.id === me) + 1;
  if (w?.player === me) wins++;
  out.push(`game ${k}: ${w ? `${w.player === me ? 'IT WON' : 'another won'} by ${w.how} at turn ${g.turn}` : 'no winner'} · it: ${g.players[me]!.alive ? `${g.cities.filter((c) => c.owner === me).length} cities, rank ${rank} of ${g.players.length}` : 'wiped out'}, capitals at most ${capPeak} of ${g.players.length}, faith at most ${Math.round(100 * faithPeak)}%, ${g.players[me]!.techs.size} techs`);
}
console.log(out.join('\n') + `\nwon ${wins} of ${GAMES}`);
