// How a computer civ uses its army, in the layers the Civilization games'
// own AIs are built in (Civ V's, whose source is public, and the Community
// Patch that grew out of it):
//
//   danger      what each tile risks next turn: the strength of the enemy
//               units (and cities) that could strike it (CvDangerPlots)
//   operations  an army with a purpose over many turns (CvAIOperation): a
//               city to take; its units are recruited, gather at a muster
//               point by the civ's nearest city, march together, and only
//               then assault. A war the civ starts is planned the same
//               way: the army gathers first, war is declared when it is
//               ready (the sneak attack)
//   tactics     each turn, where enemies are close (CvTacticalAI), in the
//               order that wins fights: a fallen city is entered first;
//               then every shooter fires (free, and what it leaves hurt
//               the blades can finish), at what it can kill, else at what
//               it hurts most; then the blades close in where the fight is
//               worth it (the chance of winning it to the end, and what
//               each side would lose); a unit badly hurt falls back to heal
//   formation   under all of it, where each unit stands (the Community
//               Patch's first and second line): the blades between the
//               enemy and the shooters, the shooters and engines behind
//               them, out of the reach of enemy blades where they can be,
//               still within their own reach of the target. On the march
//               the blades lead and the shooters follow a ring behind; a
//               shooter an enemy blade could reach, with no blade of its
//               own beside it, steps back before it would fire
//   homeland    the rest (CvHomelandAI): a garrison in every city, units
//               hurt rest until fit (on their own land: nothing heals off it), the others stand by the cities nearest
//               a rival (or one under threat), fortified, not wandering
//
// The numbers these turn on are the civ's policy (aiPolicy.ts), so they
// are bred with the rest.

import { unitDef, domainOf } from './rules.ts';
import { canAttackType, canShoot, canAssault, isShooter } from './unitClasses.ts';
import { VOLLEY_ROUNDS, MELEE_ROUNDS, type Game, type Player, type Unit, type City } from './game.ts';
import type { AiPolicy } from './aiPolicy.ts';

// An army on its way to take a city.
interface Operation {
  target: number;          // the city to take (its id)
  vs: number;              // whose it is
  muster: number;          // where the army gathers (a tile: the civ's city nearest the target)
  units: Set<number>;      // the army (unit ids)
  state: 'gather' | 'march' | 'assault';
  since: number;           // the turn it began, and the turn its state began
  stateSince: number;
  strength: number;        // the army's when it set out
}
interface State { op: Operation | null; plan: { vs: number; turn: number } | null; lastOp: number }
const states = new WeakMap<Game, State[]>();
function stateOf(g: Game, id: number): State {
  let all = states.get(g);
  if (!all) states.set(g, all = []);
  return all[id] ??= { op: null, plan: null, lastOp: -100 };
}
// A war the civ means to start (ai.ts aiDiplomacy): its army gathers first.
export function planWar(g: Game, p: Player, vs: number): void { const s = stateOf(g, p.id); if (!s.plan && !s.op) s.plan = { vs, turn: g.turn }; }
export const planning = (g: Game, p: Player): boolean => stateOf(g, p.id).plan !== null;
// Whether its army is out to take a city (it wants engines then).
export const onCampaign = (g: Game, p: Player): boolean => stateOf(g, p.id).op !== null || stateOf(g, p.id).plan !== null;

const landFighter = (u: Unit): boolean => !u.dead && u.packedIn === null && !unitDef(u.type).civilian && u.type !== 'commander' && domainOf(unitDef(u.type)) === 'land';
// A unit's fighting strength, as hurt.
export const strength = (u: Unit): number => { const T = unitDef(u.type); return Math.max(T.melee, T.rangedAtk ?? 0) * (0.5 + u.hp / 200); };
const shoots = (u: Unit): boolean => canShoot(u.type) && isShooter(u.type);

const HIT = 24.5; // an exchange's damage, on average (game.ts fightRounds)

// The army's part of a civ's turn (ai.ts aiTurn).
export function militaryPhase(g: Game, p: Player, P: AiPolicy, cities: readonly City[]): void {
  const S = stateOf(g, p.id);
  const mine = g.units.filter((u) => u.owner === p.id && landFighter(u));
  const foes = g.players.filter((o) => o.alive && g.atWar(p.id, o.id)).map((o) => o.id);
  const foeUnits = g.units.filter((u) => foes.includes(u.owner) && landFighter(u));
  const dist = (a: number, b: number) => g.approxDist(a, b);

  // ---- danger: what could strike each tile next turn ----
  const danger = new Map<number, number>();
  for (const e of foeUnits) {
    const T = unitDef(e.type), reach = T.mv + (shoots(e) ? T.reach ?? 1 : 0);
    for (const t of g.tilesWithin(e.tile, reach)) danger.set(t, (danger.get(t) ?? 0) + strength(e));
  }
  // (And what enemy blades alone could reach: where a shooter must not stand uncovered.)
  const charge = new Map<number, number>();
  for (const e of foeUnits) {
    if (shoots(e) || !canAssault(e.type)) continue;
    for (const t of g.tilesWithin(e.tile, unitDef(e.type).mv)) charge.set(t, (charge.get(t) ?? 0) + strength(e));
  }
  const blade = (u: Unit): boolean => !u.dead && canAssault(u.type) && !shoots(u);
  // The nearest enemy to a tile (a unit, else a city it is out to take): what a formation faces.
  const facing = (t: number): number | null => {
    let best: number | null = null, bestD = 7;
    for (const e of foeUnits) { const d = dist(e.tile, t); if (d < bestD) { best = e.tile; bestD = d; } }
    const c = S.op ? g.cityById.get(S.op.target) : undefined;
    if (best === null && c && dist(c.tile, t) < 9) best = c.tile;
    return best;
  };
  // Whether a tile is covered: one of its own blades stands by it, nearer the enemy than it is.
  const covered = (t: number, but: Unit | null = null): boolean => {
    const f = facing(t);
    if (f === null) return true;
    return mine.some((b) => b !== but && blade(b) && dist(b.tile, t) <= 1.5 && dist(b.tile, f) < dist(t, f));
  };
  const near = (list: readonly Unit[], t: number, r: number) => list.reduce((s, u) => s + (dist(u.tile, t) <= r ? strength(u) : 0), 0);

  // A free tile for u by `at` (within r), the nearest to it; `at` itself if it can stand there.
  const stand = (u: Unit, at: number, r: number, keep: (t: number) => boolean = () => true): number | null => {
    let best: number | null = null, bestS = Infinity;
    const front = blade(u) ? facing(u.tile) : null;
    for (const [t, d] of g.tilesWithinMap(at, r)) {
      if (g.isWater(t) || !keep(t) || (t !== u.tile && !g.canStand(u, t)) || g.isForeignBlocked(t, u.owner)) continue;
      // (A shooter keeps out of enemy blades' reach, and behind its own.)
      // (A blade stands toward the enemy.)
      const s = d * 3 + dist(u.tile, t) + 0.05 * (danger.get(t) ?? 0) + (front !== null ? 0.6 * dist(t, front) : 0) + (shoots(u) ? 1.5 * Math.min(4, charge.get(t) ?? 0) + (covered(t, u) ? 0 : 1.5) : 0);
      if (s < bestS) { best = t; bestS = s; }
    }
    return best;
  };
  const go = (u: Unit, t: number | null): void => { if (t !== null && t !== u.tile && u.moves > 0) g.goTo(u, t); };
  const done = new Set<number>();
  const rest = (u: Unit): void => { u.fortified = true; done.add(u.id); };

  // ---- garrisons: a unit in every city (a shooter still fires from the walls) ----
  const garrison = new Map<number, Unit>();
  const free = new Set(mine);
  for (const c of cities) {
    // (The one that holds it best at close quarters: a city is its garrison's to keep.)
    const here = mine.filter((u) => u.tile === c.tile && free.has(u)).sort((a, b) => g.unitStrength(b, 'melee', 'def', c.tile) - g.unitStrength(a, 'melee', 'def', c.tile))[0];
    if (here) { garrison.set(c.id, here); free.delete(here); }
  }
  for (const c of cities) {
    if (garrison.has(c.id)) continue;
    const u = [...free].filter((x) => canAttackType(x.type)).sort((a, b) => dist(a.tile, c.tile) - Number(blade(a)) - dist(b.tile, c.tile) + Number(blade(b)))[0];
    if (!u || dist(u.tile, c.tile) > 10) continue;
    garrison.set(c.id, u);
    free.delete(u);
    go(u, c.tile);
    done.add(u.id);
  }

  // ---- the operation: whether one stands, begins or ends ----
  let op = S.op;
  const target = op ? g.cityById.get(op.target) : undefined;
  if (op) {
    op.units = new Set(mine.filter((u) => op!.units.has(u.id)).map((u) => u.id));
    const army = mine.filter((u) => op!.units.has(u.id));
    const lost = !target || target.owner === p.id || !g.players[target.owner]!.alive || (op.state !== 'gather' && !g.atWar(p.id, target.owner));
    const broken = army.reduce((s, u) => s + strength(u), 0) < 0.4 * op.strength || army.length < 2 || g.turn - op.since > 70;
    if (lost || broken) { S.op = op = null; S.plan = null; S.lastOp = g.turn; }
  }
  // (A plan against a civ no longer there, or already at war: dropped; the war itself calls for the army.)
  if (S.plan && (!g.players[S.plan.vs]!.alive || g.turn - S.plan.turn > 25)) S.plan = null;
  const wantVs = S.plan ? [S.plan.vs] : foes;
  if (!op && wantVs.length && cities.length && g.turn - S.lastOp >= 4) {
    // The army: every fighter not a garrison nor by a city under threat.
    const threatened = cities.filter((c) => near(foeUnits, c.tile, 3) > 0);
    const army = [...free].filter((u) => canAttackType(u.type) && !threatened.some((c) => dist(u.tile, c.tile) <= 3));
    if (army.length >= P.offensiveSpare) {
      // The city to take: near, weak, worth having.
      let best: City | null = null, bestS = -Infinity, from = cities[0]!;
      for (const c of g.cities) {
        if (!wantVs.includes(c.owner) || !g.known[p.id]![c.tile]) continue;
        const home = cities.reduce((a, b) => (dist(b.tile, c.tile) < dist(a.tile, c.tile) ? b : a));
        const d = dist(home.tile, c.tile);
        if (d > 16) continue;
        const s = -d - 1.5 * g.cityStrength(c) / (1 + 0.5 * g.players[c.owner]!.era) + (g.cityStrength(c) === 0 ? 4 : 0) + (g.players.some((x) => x.firstCapital === c.id) ? P.capitalLust : 0) - 0.02 * near(g.units.filter((u) => u.owner === c.owner && landFighter(u)), c.tile, 3) + 0.3 * c.pop;
        if (s > bestS) { best = c; bestS = s; from = home; }
      }
      if (best) {
        S.op = op = { target: best.id, vs: best.owner, muster: from.tile, units: new Set(army.map((u) => u.id)), state: 'gather', since: g.turn, stateSince: g.turn,
          strength: army.reduce((s, u) => s + strength(u), 0) };
      }
    }
  }
  if (op) {
    const army = mine.filter((u) => op!.units.has(u.id)), city = g.cityById.get(op.target)!;
    // (Fighters raised since join it while it gathers.)
    if (op.state === 'gather') for (const u of free) if (canAttackType(u.type) && !op.units.has(u.id) && dist(u.tile, op.muster) <= 8) { op.units.add(u.id); army.push(u); }
    const within = (t: number, r: number) => army.filter((u) => dist(u.tile, t) <= r).length / Math.max(1, army.length);
    if (op.state === 'gather' && (within(op.muster, 3) >= P.musterShare || g.turn - op.stateSince > 10)) {
      // (Gathered: now the war, if it is not on yet.)
      if (!g.atWar(p.id, op.vs)) g.declareWar(p.id, op.vs);
      S.plan = null;
      op.state = 'march'; op.stateSince = g.turn;
    } else if (op.state === 'march' && (within(city.tile, 5) >= P.musterShare || g.turn - op.stateSince > 9)) { op.state = 'assault'; op.stateSince = g.turn; }
    for (const u of army) free.delete(u);
  }

  // ---- tactics: where enemies are close ----
  const live = () => mine.filter((u) => !u.dead && u.moves > 0);
  // 1. A fallen city with no one in it is entered (again once the shooters have fired: 2b).
  const enter = (): void => {
    for (const u of live()) {
      if (!canAssault(u.type) || shoots(u)) continue;
      // (An enemy city within three tiles that no one holds: it goes for it, and takes it if it gets there.)
      for (const c of g.cities) {
        if (!foes.includes(c.owner) || dist(c.tile, u.tile) > 3.5 || g.bestDefender(c.tile, p.id) || !g.known[p.id]![c.tile]) continue;
        g.goTo(u, c.tile, 'melee');
        done.add(u.id);
        break;
      }
    }
  };
  enter();
  // 2. Every shooter fires: at what it can kill, else where it hurts most; an engine at the walls.
  for (const u of live()) {
    if (!canShoot(u.type) || u.dead) continue;
    // (A shooter enemy blades could reach, no blade of its own before it,
    // not a garrison: it steps back to a tile that is safe or covered, if
    // there is one; with moves left after, it still fires.)
    if (shoots(u) && (charge.get(u.tile) ?? 0) > 0 && !covered(u.tile, u) && !g.cityByTile.has(u.tile)) {
      let to: number | null = null, toS = Infinity;
      for (const t of g.tiles[u.tile]!.neighbors) {
        if (g.isWater(t) || !g.canStand(u, t) || g.isForeignBlocked(t, u.owner) || g.isEnemyOccupied(t, p.id)) continue;
        const c = charge.get(t) ?? 0;
        if (c > 0 && !covered(t, u)) continue;
        const sc = c + 0.1 * (danger.get(t) ?? 0) + (g.cityByTile.get(t)?.owner === p.id ? -5 : 0);
        if (sc < toS) { to = t; toS = sc; }
      }
      if (to !== null) { g.goTo(u, to); if (u.dead || u.moves <= 0) { done.add(u.id); continue; } }
    }
    let best: number | null = null, bestS = 0;
    for (const t of g.fireReach(u)) {
      if (!g.isEnemyOccupied(t, p.id) || g.attackBlockAt(u, t, 'ranged') !== null) continue;
      const pv = g.combatPreview(u, t, 'ranged'), c = g.cityByTile.get(t);
      let s: number;
      if (pv) {
        const dmg = VOLLEY_ROUNDS * HIT * pv.atk / (pv.atk + pv.def);
        s = dmg / 100 + (dmg >= pv.defender.hp ? 1.5 : 0) + 0.02 * strength(pv.defender) + (pv.defender.hp < 50 ? 0.3 : 0);
        // (An engine at a garrison: what it is for.)
        if (c && unitDef(u.type).siege) s += 1;
        if (c && op && c.id === op.target) s += 0.3;
      } else continue;
      if (s > bestS) { best = t; bestS = s; }
    }
    if (best !== null && (shoots(u) || bestS > 0.9)) { g.attack(u, best, 'ranged'); done.add(u.id); }
  }
  enter();
  // 3. The blades close in where the fight is worth it.
  for (const u of live()) {
    if (done.has(u.id) || !canAssault(u.type) || shoots(u) || u.hp < P.retreatHp) continue;
    const mv = Math.min(2, Math.ceil(u.moves));
    const assault = op !== null && op.units.has(u.id) && op.state === 'assault';
    let best: number | null = null, bestS = 0;
    for (const [t, d] of g.tilesWithinMap(u.tile, mv)) {
      if (d === 0 || !g.isEnemyOccupied(t, p.id) || g.isWater(t) || g.attackBlockAt(u, t, 'melee') !== null) continue;
      if (d > 1) { const path = g.findPath(u, t); if (!path || g.pathTurns(u, path) > 1) continue; }
      const pv = g.combatPreview(u, t, 'melee'), c = g.cityByTile.get(t);
      let s = 0;
      if (pv) {
        // (A clash is a few exchanges now, not a fight to the end: what
        // counts is the odds of an exchange, and how many of its own can
        // strike the same target this turn: together they wear down what
        // none would go at alone, a garrison above all.)
        const odds = pv.atk / (pv.atk + pv.def);
        const others = mine.filter((x) => x !== u && !x.dead && x.moves > 0 && (shoots(x) ? g.fireReach(x).has(t) : canAssault(x.type) && dist(x.tile, t) <= 1.5)).length;
        const need = P.attackOdds + (assault ? P.assaultOdds : 0) - P.gangUp * Math.min(4, others);
        // (Or the kill: a target that one more clash would likely finish.)
        const finish = pv.defender.hp <= MELEE_ROUNDS * HIT * odds;
        if (u.hp >= 45 && (odds >= need || finish)) s = odds + (finish ? 1 : 0) + (c ? 0.3 : 0);
      } else if (c) s = 5; // (a city with no one in it: taken)
      if (s > bestS) { best = t; bestS = s; }
    }
    if (best !== null) { g.goTo(u, best, 'melee'); done.add(u.id); }
  }
  // 4. A unit badly hurt and in danger falls back toward its nearest city.
  for (const u of live()) {
    // (Or hurt and off its civ's land, where nothing heals.)
    if (done.has(u.id) || u.hp >= P.retreatHp || (!(danger.get(u.tile) ?? 0) && g.ownerOf(u.tile) === p.id) || [...garrison.values()].includes(u)) continue;
    const home = cities.length ? cities.reduce((a, b) => (dist(b.tile, u.tile) < dist(a.tile, u.tile) ? b : a)) : null;
    if (home) { go(u, stand(u, home.tile, 2)); done.add(u.id); }
  }

  // ---- the operation's units: gather, march, take their places ----
  if (op) {
    const city = g.cityById.get(op.target)!;
    // (The blades move first and take the nearer ground; the shooters form up behind them.)
    const army = live().filter((u) => !done.has(u.id) && op!.units.has(u.id)).sort((a, b) => Number(shoots(a)) - Number(shoots(b)));
    const hasBlades = mine.some((u) => op!.units.has(u.id) && blade(u));
    for (const u of army) {
      done.add(u.id);
      if (u.hp < 50 && !(danger.get(u.tile) ?? 0) && op.state !== 'assault' && g.ownerOf(u.tile) === p.id) { u.fortified = true; continue; }
      if (op.state === 'gather') { if (dist(u.tile, op.muster) > 2) go(u, stand(u, op.muster, 2, (t) => t !== op!.muster)); else u.fortified = true; continue; }
      const d = dist(u.tile, city.tile);
      if (op.state === 'march') {
        // On the march: the blades to three tiles from the city, the shooters a ring further back.
        const ring = shoots(u) && hasBlades ? 4 : 3;
        if (d > ring + 0.5) go(u, stand(u, city.tile, ring + 1, (t) => dist(t, city.tile) >= ring));
        continue;
      }
      if (shoots(u)) {
        // The assault: a shooter or an engine to where it reaches the city,
        // by the least dangerous such tile, a blade before it if it can.
        if (g.fireReach(u).has(city.tile)) continue;
        const reach = unitDef(u.type).reach ?? 1;
        const spot = stand(u, city.tile, reach, (t) => t !== city.tile);
        if (spot !== null) go(u, spot); else g.goTo(u, city.tile);
      } else if (!g.bestDefender(city.tile, p.id)) g.goTo(u, city.tile, 'melee'); // (no one holds it: straight in)
      // The blades: up against the city, between it and their shooters, in reach to strike its garrison together (3.).
      else if (d > 1.5) go(u, stand(u, city.tile, 1, (t) => t !== city.tile));
    }
  }

  // ---- homeland: the rest ----
  // (Each city's exposure: how near a rival's city, an enemy's nearer still; a city under threat first.)
  const rivals = g.cities.filter((c) => c.owner !== p.id);
  const exposure = new Map(cities.map((c) => {
    const d = rivals.reduce((m, r) => Math.min(m, dist(c.tile, r.tile) * (foes.includes(r.owner) ? 0.5 : 1)), 40);
    return [c.id, 1 / (1 + d) + (near(foeUnits, c.tile, 4) > 0 ? 1 : 0)];
  }));
  const posted = new Map<number, number>();
  for (const u of live()) {
    if (done.has(u.id)) continue;
    if ([...garrison.values()].includes(u)) { rest(u); continue; }
    // Burn enemy fields underfoot.
    if (g.canPillage(u) && g.rng() < P.pillageRate) { g.pillage(u); continue; }
    // Hurt and out of danger: it rests.
    if (u.hp < 70 && !(danger.get(u.tile) ?? 0) && g.ownerOf(u.tile) === p.id) { rest(u); continue; }
    if (!canAttackType(u.type)) { scout(g, u, cities); continue; }
    let post: City | null = null, bestS = -Infinity;
    for (const c of cities) {
      const s = exposure.get(c.id)! / (1 + (posted.get(c.id) ?? 0)) - 0.004 * dist(u.tile, c.tile);
      if (s > bestS) { post = c; bestS = s; }
    }
    if (!post) { wander(g, u, cities); continue; }
    posted.set(post.id, (posted.get(post.id) ?? 0) + 1);
    if (dist(u.tile, post.tile) <= 2 && u.tile !== post.tile) rest(u);
    else go(u, stand(u, post.tile, 2, (t) => t !== post!.tile));
  }
}

// A scout goes for the unknown: the nearest land it could stand on from
// which something its civ has not explored would be seen; with none left
// within reach, it roams.
function scout(g: Game, u: Unit, cities: readonly City[]): void {
  const known = g.known[u.owner]!;
  let best: number | null = null, bestS = -Infinity;
  for (const [t, d] of g.tilesWithinMap(u.tile, 14)) {
    if (d === 0 || g.isWater(t) || !known[t] || g.isForeignBlocked(t, u.owner) || !g.canStand(u, t)) continue;
    let dark = 0;
    for (const x of g.tilesWithin(t, 2)) if (!known[x]) dark++;
    if (!dark) continue;
    const s = dark - 1.2 * d;
    if (s > bestS) { best = t; bestS = s; }
  }
  if (best !== null) { g.goTo(u, best); return; }
  // (Nothing near: the nearest edge of what it knows, wherever that is.)
  let far: number | null = null, farD = Infinity;
  for (let t = 0; t < g.N; t++) {
    if (!known[t] || g.isWater(t)) continue;
    const d = g.approxDist(u.tile, t);
    if (d < farD && d > 2 && g.tiles[t]!.neighbors.some((x) => !known[x] && !g.isWater(x))) { far = t; farD = d; }
  }
  if (far !== null && g.findPath(u, far)) g.goTo(u, far); else wander(g, u, cities);
}

// A unit with nothing to do roams round the empire.
function wander(g: Game, u: Unit, cities: readonly City[]): void {
  const opts = g.tilesWithin(u.tile, 3).filter((t) => !g.isWater(t) && !g.isEnemyOccupied(t, u.owner));
  const home = cities[0];
  const near = home ? opts.filter((t) => g.approxDist(t, home.tile) < 12) : opts;
  const pick = (near.length ? near : opts)[Math.floor(g.rng() * (near.length || opts.length))];
  if (pick != null) g.goTo(u, pick);
}

// (For the arena's reports and the tests: a civ's operation now.)
export function operationOf(g: Game, id: number): { target: number; state: string; units: number; since: number } | null {
  const op = stateOf(g, id).op;
  return op ? { target: op.target, state: op.state, units: op.units.size, since: op.since } : null;
}
