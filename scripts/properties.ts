// How the game is played at its best: whole games between computer civs
// all deciding by the strongest level (src/aiLevels.json), measured against
// the properties we want the best play to have. The rules are ours to
// change: when the best play is not the game we mean, the rules are wrong,
// not the players. Run after every breeding (scripts/train.ts):
//   npx tsx scripts/properties.ts [--games 10] [--size small] [--level <index of LEVELS>]

import { Game } from '../src/game.ts';
import { unitDef, type MapSizeKey } from '../src/rules.ts';
import { LEVELS } from '../src/aiPolicy.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1]! : d; };
const GAMES = Number(arg('games', '10')), size = arg('size', 'small') as MapSizeKey, level = LEVELS[Number(arg('level', String(LEVELS.length - 1)))]!;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : NaN);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => `${Math.round(100 * x)}%`;

const won = new Map<string, number>();
const length: number[] = [], winnerCities: number[] = [], allCities: number[] = [], firstWar: number[] = [], wars: number[] = [], captured: number[] = [], eliminated: number[] = [];
const wonders: number[] = [], buildings: number[] = [], founders: number[] = [], capitals: number[] = [], faithTop: number[] = [], techTop: number[] = [];
let crippled = 0, winnersWithFaith = 0, arrears = 0, civTurns = 0, needRes = 0, army = 0;
const warBy = { same: 0, rival: 0, none: 0 }, exposure = { same: 0, rival: 0, none: 0 };
const t0 = Date.now();

for (let k = 0; k < GAMES; k++) {
  const g = new Game({ size, seed: 5000 + k, policies: Array.from({ length: 12 }, () => level.policy) });
  for (const p of g.players) p.isHuman = false;
  const peak = g.players.map(() => 0);
  while (!g.winner && g.turn <= g.turnLimit + 1) {
    g.endTurn();
    g.players.forEach((p, i) => { peak[i] = Math.max(peak[i]!, g.cities.filter((c) => c.owner === p.id).length); });
    if (g.turn % 10) continue;
    for (const p of g.players) {
      if (!p.alive) continue;
      civTurns++;
      if (p.arrears > 0) arrears++;
      for (const u of g.units) if (u.owner === p.id && !unitDef(u.type).civilian) { army++; if (unitDef(u.type).needs) needRes++; }
      for (const o of g.players) {
        if (o.id <= p.id || !o.alive || !g.met[p.id]![o.id] || g.atWar(p.id, o.id)) continue;
        // (Neighbours only: civs fight those in reach, and a faith spreads to those near, so the chance to compare with is that of a pair within reach.)
        if (!g.cities.some((a) => a.owner === p.id && g.cities.some((b) => b.owner === o.id && g.approxDist(a.tile, b.tile) <= 14))) continue;
        const a = g.faithOf(p.id), b = g.faithOf(o.id);
        exposure[!a || !b ? 'none' : a === b ? 'same' : 'rival']++;
      }
    }
  }
  const w = g.winner;
  capitals.push(Math.max(...g.players.map((p) => g.capitalsHeld(p.id))) / g.players.length);
  faithTop.push(Math.max(...g.players.map((p) => g.faithShare(p.id))));
  techTop.push(Math.max(...g.players.map((p) => p.techs.size)));
  won.set(w?.how ?? 'none', (won.get(w?.how ?? 'none') ?? 0) + 1);
  length.push(g.turn);
  const cities = (id: number) => g.cities.filter((c) => c.owner === id).length;
  if (w) { winnerCities.push(cities(w.player)); if ([...g.religions.values()].some((f) => f.founder === w.player)) winnersWithFaith++; }
  for (const p of g.players) if (p.alive) allCities.push(cities(p.id));
  const warEvents = g.events.filter((e) => e.kind === 'war');
  wars.push(warEvents.length);
  if (warEvents.length) firstWar.push(warEvents[0]!.turn);
  for (const e of warEvents) warBy[(e.data['faiths'] as 'same' | 'rival' | 'none') ?? 'none']++;
  captured.push(g.events.filter((e) => e.kind === 'cityCaptured').length);
  eliminated.push(g.players.filter((p) => !p.alive).length);
  if (g.players.some((p, i) => peak[i]! >= 3 && cities(p.id) <= (2 * peak[i]!) / 3)) crippled++;
  for (const p of g.players) {
    if (!p.alive) continue;
    wonders.push([...g.wondersBuilt.values()].filter((t) => t >= 0 && g.ownerOf(t) === p.id).length);
    const cs = g.cities.filter((c) => c.owner === p.id);
    if (cs.length) buildings.push(cs.reduce((s, c) => s + c.buildings.size, 0) / cs.length);
  }
  founders.push(new Set([...g.religions.values()].map((f) => f.founder)).size / g.players.length);
}

const share = (o: { same: number; rival: number; none: number }, k: 'same' | 'rival' | 'none') => o[k] / Math.max(1, o.same + o.rival + o.none);
const lean = (k: 'same' | 'rival' | 'none') => (share(exposure, k) > 0 ? (share(warBy, k) / share(exposure, k)).toFixed(2) : '–');
const rows: [string, string, string][] = [
  ['How games are won', [...won].map(([h, n]) => `${h} ${n}`).join(', ') + `; ${mean(length).toFixed(0)} turns on average`, 'every way of winning shows up'],
  ['How near each victory comes', `the leader in each, at the game's end: ${pct(mean(capitals))} of the first capitals (conquest: two thirds), ${pct(mean(faithTop))} of the world's people in its faith (religion: 67%), ${mean(techTop).toFixed(0)} of 95 techs (science: the last)`, 'each within reach in some games'],
  ['Compact and wide can both win', `winners hold ${Math.min(...winnerCities)}–${Math.max(...winnerCities)} cities (median ${median(winnerCities)}); all civs ${Math.min(...allCities)}–${Math.max(...allCities)} (median ${median(allCities)})`, 'winners spread over a wide range'],
  ['Expanding past what can be paid loses', `${pct(arrears / Math.max(1, civTurns))} of a civ's turns in arrears`, 'rare: the best play pays its way'],
  ['Wars are frequent, from the first eras', `${mean(wars).toFixed(1)} wars a game; the first at turn ${median(firstWar)} (median)`, 'several a game; the first before turn 60'],
  ['Wars decide things', `${mean(captured).toFixed(1)} cities taken a game; ${mean(eliminated).toFixed(1)} civs wiped out; a civ lost a third of its cities in ${pct(crippled / GAMES)} of games`, 'cities change hands in every game'],
  ['Faith binds and divides', `wars against chance: same faith ×${lean('same')}, rival faiths ×${lean('rival')}, a faithless side ×${lean('none')} (${warBy.same}/${warBy.rival}/${warBy.none} wars)`, 'same well under 1, rival over 1, faithless about 1'],
  ['Religion helps, is not required', `${pct(mean(founders))} of civs found one; ${winnersWithFaith} of ${winnerCities.length} winners had`, 'winners with and without'],
  ['Strong play builds wonders and buildings', `${mean(wonders).toFixed(1)} wonders a civ; ${mean(buildings).toFixed(1)} buildings a city`, 'more than none of each'],
  ['Strategic resources shape armies', `${pct(needRes / Math.max(1, army))} of units need one`, 'a fifth or more'],
];
console.log(`\nThe game as ${level.name} plays it against itself: ${GAMES} games on ${size} maps (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
for (const [what, now, want] of rows) console.log(`${what}\n    now:    ${now}\n    wanted: ${want}\n`);
