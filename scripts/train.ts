// Breeds the computer civs' policies (src/aiPolicy.ts) by playing them
// against each other (scripts/arena.ts), and writes the game's levels of
// difficulty from what it finds (src/aiLevels.json):
//   npx tsx scripts/train.ts [--gens 40] [--pop 18] [--rounds 4] [--turns 220] [--size small] [--seed 1]
//
// A population of policies; each generation every policy plays `rounds`
// whole games, seated at random among the others on fresh maps. A policy's
// worth is its score against its table's mean, averaged over all the games
// it has played since it was born (so one lucky start does not make a
// champion). The best third live on; the rest are replaced by their
// children (two survivors crossed, or one, then varied; less and less as
// the generations go). The first population is the policy written by hand
// (BASE) and wide variations of it.
//
// The levels: the worst policy of the first generation, BASE, and the
// champions a third, two thirds and all the way along; these five then
// play a ladder of their own (every one at every seat of the same maps),
// and are named in the order they finish. A level is a way of deciding,
// measured: nothing is given to it or taken from the player.

import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { BASE, GENE_KEYS, mutate, cross, type AiPolicy } from '../src/aiPolicy.ts';
import { mulberry32 } from '../src/rng.ts';
import type { MapSizeKey } from '../src/rules.ts';
import { playAll, seats, standings, ladderMatches, type Match } from './arena.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1]! : d; };
const GENS = Number(arg('gens', '40')), ROUNDS = Number(arg('rounds', '4')), TURNS = Number(arg('turns', '220'));
const size = arg('size', 'small') as MapSizeKey, SEED = Number(arg('seed', '1'));
const N = seats(size), POP = Math.max(N, Math.round(Number(arg('pop', '18')) / N) * N);
const LEVEL_NAMES = ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor'];
const rng = mulberry32(SEED * 7919);

interface Member { policy: AiPolicy; sum: number; games: number; born: number }
const fresh = (policy: AiPolicy, born: number): Member => ({ policy, sum: 0, games: 0, born });
const mean = (m: Member) => (m.games ? m.sum / m.games : 0);

mkdirSync('logs', { recursive: true });
const log = `logs/train-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
let pop: Member[] = [fresh(BASE, 0), ...Array.from({ length: POP - 1 }, () => fresh(mutate(BASE, rng, 0.8, 0.25), 0))];
const champions: { gen: number; policy: AiPolicy; mean: number }[] = [];
let worstFirst: AiPolicy = BASE;
const t0 = Date.now();

for (let gen = 0; gen < GENS; gen++) {
  // Every policy at `ROUNDS` tables, seated by a shuffle each round.
  const matches: Match[] = [], who: number[][] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const order = pop.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
    for (let t = 0; t < POP / N; t++) {
      const table = order.slice(t * N, (t + 1) * N);
      who.push(table);
      matches.push({ seed: SEED * 100000 + gen * 100 + r * 10 + t, size, turns: TURNS, policies: table.map((i) => pop[i]!.policy) });
    }
  }
  const results = await playAll(matches);
  const st = standings(results, (m, seat) => who[m]![seat]!, POP);
  pop.forEach((m, i) => { m.sum += st[i]!.mean * st[i]!.games; m.games += st[i]!.games; });
  pop.sort((a, b) => mean(b) - mean(a));
  if (gen === 0) worstFirst = pop[pop.length - 1]!.policy;
  // (The champion: the best of those that have proved it over two generations, if any.)
  const champ = pop.find((m) => m.games >= 2 * ROUNDS) ?? pop[0]!;
  champions.push({ gen, policy: champ.policy, mean: mean(champ) });
  appendFileSync(log, JSON.stringify({ gen, champion: champ.policy, mean: +mean(champ).toFixed(3), games: champ.games, born: champ.born, top: pop.slice(0, 3).map((m) => +mean(m).toFixed(3)) }) + '\n');
  console.log(`gen ${String(gen).padStart(3)}  champion ${mean(champ).toFixed(3)} over ${champ.games} games (born ${champ.born})  ·  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // The best third live on; the rest are their children.
  const keep = pop.slice(0, Math.ceil(POP / 3));
  const spread = 0.2 - 0.12 * (gen / Math.max(1, GENS - 1));
  const pick = () => keep[Math.floor(rng() * keep.length)]!.policy;
  pop = [...keep, ...Array.from({ length: POP - keep.length }, () => fresh(mutate(rng() < 0.5 ? cross(pick(), pick(), rng) : pick(), rng, 0.3, spread), gen + 1))];
}

// The levels, from along the road; then their own ladder, to name them in the order they finish.
const at = (f: number) => champions[Math.min(champions.length - 1, Math.round(f * (champions.length - 1)))]!;
const cands = [{ generation: 0, policy: worstFirst }, { generation: 0, policy: BASE }, ...[1 / 3, 2 / 3, 1].map((f) => ({ generation: at(f).gen + 1, policy: at(f).policy }))];
const ladder = ladderMatches(cands.map((c) => c.policy), size, TURNS, 20 * cands.length, SEED * 100000 + 99000);
const st = standings(await playAll(ladder.matches), ladder.who, cands.length);
const ranked = cands.map((c, i) => ({ ...c, standing: +st[i]!.mean.toFixed(3) })).sort((a, b) => a.standing - b.standing);
const round = (p: AiPolicy) => Object.fromEntries(GENE_KEYS.map((k) => [k, +p[k].toFixed(3)]));
const levels = ranked.map((c, i) => ({ name: LEVEL_NAMES[i]!, generation: c.generation, standing: c.standing, genes: round(c.policy) }));
writeFileSync('src/aiLevels.json', '[\n' + levels.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n]\n');
console.log('\nlevels (their ladder: score against the table\'s mean):');
for (const l of levels) console.log(`  ${l.name.padEnd(10)} generation ${String(l.generation).padStart(3)}   ${l.standing.toFixed(3)}`);
console.log(`\nwritten to src/aiLevels.json · the run's record: ${log} · ${((Date.now() - t0) / 60000).toFixed(1)} minutes`);
