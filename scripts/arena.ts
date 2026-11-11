// The arena: whole games between computer civs, each deciding by its own
// policy (src/aiPolicy.ts), played without a screen; what each made of its
// game is its score. scripts/train.ts breeds policies on it; run alone, it
// pits the game's levels against each other:
//   npx tsx scripts/arena.ts [--games 24] [--turns 200] [--size small]
// (As a worker thread, arena-worker.mjs: it plays the matches it is sent.)

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/game.ts';
import { unitDef, type MapSizeKey } from '../src/rules.ts';
import { LEVELS, type AiPolicy } from '../src/aiPolicy.ts';

export interface Match { readonly seed: number; readonly size: MapSizeKey; readonly turns: number; readonly policies: readonly AiPolicy[] }
export interface Result { readonly scores: number[]; readonly stats: Stats[] }
export interface Stats { cities: number; pop: number; techs: number; army: number; alive: boolean; wars: number; won: string | null; turns: number }

// A game played out: every seat a computer civ with its policy, to the
// game's end (someone wins: game.ts checkVictory) or `turns`. Each civ's
// score is the game's own (game.ts score); the winner's, if the game was
// won, is doubled: a policy is bred to win, the score only says how well
// the others did.
export function playMatch(m: Match): Result {
  const g = new Game({ size: m.size, seed: m.seed, policies: m.policies, turnLimit: m.turns });
  for (const p of g.players) p.isHuman = false;
  for (let t = 0; t <= m.turns && !g.winner; t++) g.endTurn();
  const wars = g.events.filter((e) => e.kind === 'war').length;
  return {
    scores: g.players.map((p) => g.score(p.id) * (g.winner?.player === p.id ? 2 : 1)),
    stats: g.players.map((p) => ({ cities: g.cities.filter((c) => c.owner === p.id).length, pop: g.cities.reduce((s, c) => s + (c.owner === p.id ? c.pop : 0), 0), techs: p.techs.size,
      army: g.units.filter((u) => u.owner === p.id && !unitDef(u.type).civilian).length, alive: p.alive, wars, won: g.winner?.player === p.id ? g.winner.how : null, turns: g.turn })),
  };
}
// How many civs a map of a size seats.
export const seats = (size: MapSizeKey): number => new Game({ size, seed: 1 }).players.length;

// Matches played on worker threads, as many at once as there are cores to spare.
export async function playAll(matches: readonly Match[], workers = Math.max(1, availableParallelism() - 2)): Promise<Result[]> {
  const out: Result[] = new Array<Result>(matches.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(workers, matches.length) }, () => new Promise<void>((done, fail) => {
    const w = new Worker(fileURLToPath(new URL('./arena-worker.mjs', import.meta.url)));
    const send = () => { if (next < matches.length) { const i = next++; w.postMessage({ i, match: matches[i] }); } else { void w.terminate(); done(); } };
    w.on('message', (r: { i: number; result: Result }) => { out[r.i] = r.result; send(); });
    w.on('error', fail);
    send();
  })));
  return out;
}

// Each policy's standing over some matches: its score against the table's
// mean (1: an average game), averaged over the games it played.
export function standings(results: readonly Result[], who: (m: number, seat: number) => number, n: number): { mean: number; games: number }[] {
  const sum = new Array<number>(n).fill(0), games = new Array<number>(n).fill(0);
  results.forEach((r, m) => {
    const mean = r.scores.reduce((a, b) => a + b, 0) / r.scores.length || 1;
    r.scores.forEach((s, seat) => { const k = who(m, seat); sum[k]! += s / mean; games[k]!++; });
  });
  return sum.map((s, k) => ({ mean: games[k] ? s / games[k]! : 0, games: games[k]! }));
}

// A ladder: policies seated in turn at every seat of the same maps (the
// rest of each table shifted round), so no one's luck with a start counts.
export function ladderMatches(policies: readonly AiPolicy[], size: MapSizeKey, turns: number, games: number, seed0: number): { matches: Match[]; who: (m: number, seat: number) => number } {
  const n = seats(size), matches: Match[] = [], order: number[][] = [];
  for (let k = 0; k < games; k++) {
    const table = Array.from({ length: n }, (_, seat) => (seat + k) % policies.length);
    order.push(table);
    matches.push({ seed: seed0 + Math.floor(k / policies.length), size, turns, policies: table.map((i) => policies[i]!) });
  }
  return { matches, who: (m, seat) => order[m]![seat]! };
}

if (!isMainThread) {
  parentPort!.on('message', (job: { i: number; match: Match }) => parentPort!.postMessage({ i: job.i, result: playMatch(job.match) }));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1]! : d; };
  const size = arg('size', 'small') as MapSizeKey, turns = Number(arg('turns', '200')), games = Number(arg('games', '24'));
  const { matches, who } = ladderMatches(LEVELS.map((l) => l.policy), size, turns, games, 1000);
  const t0 = Date.now();
  const results = await playAll(matches);
  const st = standings(results, who, LEVELS.length);
  console.log(`${games} games of ${turns} turns on ${size} maps in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  LEVELS.forEach((l, i) => console.log(`${l.name.padEnd(12)} generation ${String(l.generation).padStart(3)}   standing ${st[i]!.mean.toFixed(3)}   (${st[i]!.games} seats)`));
  const all = results.flatMap((r) => r.stats);
  const avg = (f: (s: Stats) => number) => (all.reduce((a, s) => a + f(s), 0) / all.length).toFixed(1);
  const how = new Map<string, number>();
  for (const r of results) { const w = r.stats.find((x) => x.won)?.won ?? 'none'; how.set(w, (how.get(w) ?? 0) + 1); }
  console.log(`games won by: ${[...how].map(([k, n]) => `${k} ${n}`).join(', ')}; a game lasts ${avg((x) => x.turns)} turns`);
  console.log(`a civ at the end: ${avg((s) => s.cities)} cities, ${avg((s) => s.pop)} citizens, ${avg((s) => s.techs)} techs, ${avg((s) => s.army)} units; ${avg((s) => (s.alive ? 0 : 100))}% wiped out; ${avg((s) => s.wars)} wars a game`);
}
