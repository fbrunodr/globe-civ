// How a computer civ fights where enemies are close: after the tactical AI
// of Civ V's Community Patch (Vox Populi: CvTacticalAI.cpp, whose source is
// public), the standard for one-unit-per-tile fighting. Its ideas, built
// anew for this game's rules:
//
//   fronts     the enemies within reach are taken a front at a time: a
//              focus (the city its army is out to take, else the enemy
//              nearest its units), the enemies round it, and up to a
//              dozen of its own units close enough to matter
//   posture    at each front the two sides are weighed (all told, blades
//              alone, shooters alone) on the ground it is fought on, and a
//              posture taken: on enemy land to strike a city about to fall,
//              to steamroll when dominant, to wear the enemy down from
//              range when only its shooters lead (attrition), to go for
//              kills when even (flanks), to withdraw when outmatched; at
//              home to counterattack, or to hold (hedgehog) when
//              outmatched. A posture is how much of its own blood an
//              attack may cost
//   the turn   then the whole turn of those units is searched together,
//              not unit by unit: each unit gets one assignment (a tile to
//              end on, and an attack from it or none), the best of all
//              units' options is taken first, and the few best lines are
//              followed side by side to the end (a beam; its width is the
//              civ's policy, so a stronger level sees more). A unit may
//              swap places with the one next to it: a fresh blade goes in
//              as a hurt one comes out, which is what lets an army larger
//              than its front fight with all of it
//   a tile     is scored by the unit's line: a blade next to the enemy, a
//              shooter at the end of its reach, a hurt unit anywhere safe;
//              less what could strike it there next turn against the
//              health it would have left (a shooter never ends where it
//              could be killed, no unit among three enemies); more beside
//              one of its own, on defensible ground, in a fort
//   an attack  by what it does less what it costs (the cost weighed by the
//              posture), more for a kill, for finishing what is already
//              hurt (so fire concentrates), most for the blow that takes a
//              city; a blade does not strike when it would be left too
//              hurt to stand what comes back, unless it kills
//
// What is searched is the expected outcome of each clash; the real ones
// are rolled as the plan is carried out, and a unit whose target is gone
// by its turn is left free for what comes after.

import { unitDef } from './rules.ts';
import { canAssault, canShoot, isShooter, type AttackMode } from './unitClasses.ts';
import { VOLLEY_ROUNDS, MELEE_ROUNDS, HIT_MIN, HIT_MAX, FORTIFY_BONUS, GARRISON_HEAL, FIELD_HEAL, matchup, slotOf, type Game, type Player, type Unit, type City } from './game.ts';
import type { AiPolicy } from './aiPolicy.ts';

export type Posture = 'withdraw' | 'hedgehog' | 'attrition' | 'flanks' | 'counterattack' | 'steamroll' | 'strike';
// How much an attack may cost, by posture: low, middling, high.
const LEVEL: Record<Posture, 0 | 1 | 2> = { withdraw: 0, hedgehog: 0, attrition: 0, flanks: 1, counterattack: 1, steamroll: 2, strike: 2 };
// What its own losses weigh against the hurt done, and the health below which a blade does not strike a losing blow.
const LOSS = [1.4, 0.9, 0.45] as const, HP_LIMIT = [70, 40, 20] as const;
const MAX_UNITS = 12, MAX_ENEMIES = 20, REGION = 5, NEAR = 3.6, FRONTS = 4, CHOICES = 3;
// What a kill is worth, in the health of a unit (of 100): health mends, a unit lost does not.
const KILL = 50;
// A blade's tile by its distance to the nearest enemy (0: an enemy's own tile, taken).
const BLADE_LINE = [6, 12, 6, 1, -1, -1] as const;

export interface Front {
  g: Game; p: Player; P: AiPolicy;
  mine: readonly Unit[];             // its land fighters
  foes: readonly number[];           // the civs it is at war with
  foeUnits: readonly Unit[];         // their land fighters
  garrison: ReadonlySet<Unit>;       // its units that hold its cities: they do not leave them
  done: Set<number>;                 // units whose turn is spent (added to)
  target: City | null;               // the city its army is out to take, if it is at it
  held: ReadonlySet<Unit>;           // its army's units while it still gathers or marches: they keep with it, and fight only what comes at them
  retreat: (u: Unit) => void;        // a unit falls back toward home
  trace?: (line: string) => void;    // (for looking at what it decided)
  abandon: () => void;               // its army gives up the city it was out to take (worn, nothing there it can bring down): home to mend
}

interface Mine { u: Unit; fixed: boolean; shooter: boolean; ranged: boolean; melee: boolean; hurt: boolean; reach: Map<number, number>; fireBase: number }
interface Enemy { tile: number; d: Unit | null; city: City | undefined; hp: number }
interface Assign { i: number; to: number; mode: AttackMode | null; e: number; swap: number; score: number; dealt: number; taken: number; kill: boolean }
interface Node { tile: number[]; hp: number[]; left: number[]; set: boolean[]; stuck: boolean[]; ehp: number[]; occ: Map<number, number>; score: number; plan: Assign[] }

const hit = (): number => (HIT_MIN + HIT_MAX) / 2;
const hpf = (hp: number): number => 0.5 + hp / 200;
const strength = (u: Unit, hp = u.hp): number => { const T = unitDef(u.type); return Math.max(T.melee, T.rangedAtk ?? 0) * hpf(hp); };

// The fronts of a civ's turn, fought one after another. Returns the postures taken (for the tests and reports).
export function fightFronts(f: Front): Posture[] {
  const { g, p } = f, out: Posture[] = [];
  const used = new Set<number>();
  for (let k = 0; k < FRONTS; k++) {
    const avail = f.mine.filter((u) => !u.dead && u.moves > 0 && !f.done.has(u.id));
    if (!avail.length) break;
    // The enemies' tiles (and their cities no one holds), each once.
    const spots = new Set<number>();
    for (const e of f.foeUnits) if (!e.dead) spots.add(e.tile);
    for (const c of g.cities) if (f.foes.includes(c.owner) && g.known[p.id]![c.tile]) spots.add(c.tile);
    let focus: number | null = null, best = NEAR + 1;
    for (const t of spots) {
      if (used.has(t)) continue;
      let d = Infinity;
      for (const u of avail) d = Math.min(d, g.approxDist(u.tile, t));
      if (f.target && t === f.target.tile) d -= 2;
      if (d < best) { best = d; focus = t; }
    }
    if (focus === null) break;
    for (const t of spots) if (g.approxDist(t, focus) <= 4.5) used.add(t);
    const posture = engage(f, focus);
    if (posture) out.push(posture);
  }
  return out;
}

// One front: the enemies round `focus`, the units of its own near them, a posture, and the turn searched and played.
function engage(f: Front, focus: number): Posture | null {
  const { g, p, P } = f;
  const region = g.tilesWithinMap(focus, REGION);
  // ---- the enemies ----
  const enemies: Enemy[] = [];
  const seen = new Set<number>();
  const add = (t: number): void => {
    if (seen.has(t) || !region.has(t) || region.get(t)! > 4) return;
    seen.add(t);
    const d = g.bestDefender(t, p.id), city = g.cityByTile.get(t);
    if (d && f.foes.includes(d.owner)) enemies.push({ tile: t, d, city, hp: d.hp });
    else if (!d && city && f.foes.includes(city.owner)) enemies.push({ tile: t, d: null, city, hp: 0 });
  };
  add(focus);
  for (const e of f.foeUnits) if (!e.dead) add(e.tile);
  for (const c of g.cities) if (f.foes.includes(c.owner) && g.known[p.id]![c.tile]) add(c.tile);
  if (!enemies.length) return null;
  enemies.sort((a, b) => region.get(a.tile)! - region.get(b.tile)!);
  enemies.length = Math.min(enemies.length, MAX_ENEMIES);
  // ---- its own ----
  const nearest = (t: number): number => enemies.reduce((m, e) => Math.min(m, g.approxDist(t, e.tile)), Infinity);
  const picked = f.mine.filter((u) => !u.dead && u.moves > 0 && !f.done.has(u.id) && region.has(u.tile) && (canAssault(u.type) || canShoot(u.type)))
    // (Near enough to matter: the army at its target all of it that is by; one still on its way only what is come upon.)
    .map((u) => ({ u, d: nearest(u.tile) })).filter((x) => x.d <= (f.held.has(x.u) ? 2.2 : f.target && region.has(f.target.tile) ? REGION : NEAR + (isShooter(x.u.type) ? (unitDef(x.u.type).reach ?? 1) - 1 : 0)))
    .sort((a, b) => a.d - b.d).slice(0, MAX_UNITS);
  if (!picked.length) return null;
  const blade = (u: Unit): boolean => canAssault(u.type) && !(canShoot(u.type) && isShooter(u.type));
  const units: Mine[] = picked.map(({ u }) => ({ u, fixed: f.garrison.has(u), shooter: canShoot(u.type) && isShooter(u.type), ranged: canShoot(u.type), melee: canAssault(u.type) && !(canShoot(u.type) && isShooter(u.type)),
    hurt: u.hp < P.retreatHp, reach: new Map(), fireBase: unitDef(u.type).reach ?? 1 }));
  const N = units.length, E = enemies.length;

  const us = units.map((m) => m.u), them = enemies.flatMap((e) => (e.d ? [e.d] : []));

  // ---- the ground ----
  const mset = new Set(us);
  const blocked = new Set<number>();
  for (const v of g.units) if (v.owner === p.id && v.packedIn === null && !mset.has(v) && slotOf(v.type) === 'military') blocked.add(v.tile);
  const probe = us[0]!;
  for (const t of region.keys()) if (g.isWater(t) || !g.canEnter(probe, t) || g.isForeignBlocked(t, p.id)) blocked.add(t);
  const etile = new Map(enemies.map((e, i) => [e.tile, i]));
  // (Where each unit can get to this turn, and the moves it would have left there.)
  for (const m of units) {
    m.u.fortified = m.fixed ? m.u.fortified : false;
    m.reach.set(m.u.tile, m.u.moves);
    if (m.fixed) continue;
    const open = [m.u.tile];
    while (open.length) {
      open.sort((a, b) => m.reach.get(a)! - m.reach.get(b)!);
      const t = open.pop()!, left = m.reach.get(t)!;
      if (left <= 0) continue;
      for (const nb of g.tiles[t]!.neighbors) {
        if (!region.has(nb) || blocked.has(nb) || etile.has(nb)) continue;
        const k = Math.max(0, left - g.stepCost(m.u, t, nb));
        if (k > (m.reach.get(nb) ?? -1)) { m.reach.set(nb, k); open.push(nb); }
      }
    }
  }
  const fires = new Map<number, Set<number>>();
  const fire = (m: Mine, t: number): Set<number> => {
    const key = t * 8 + m.fireBase;
    let s = fires.get(key);
    if (!s) fires.set(key, s = g.fireReachFrom(m.u.type, t));
    return s;
  };
  // (Strengths as they stand now; in the search each side's falls with its health.)
  const clash = new Map<number, { atk: number; def: number } | null>();
  const strengths = (i: number, e: number, mode: AttackMode): { atk: number; def: number } | null => {
    const key = (i * 32 + e) * 2 + Number(mode === 'ranged');
    let c = clash.get(key);
    if (c === undefined) {
      const u = units[i]!.u, block = g.attackBlockAt(u, enemies[e]!.tile, mode);
      const pv = block === null || block === 'out of reach' ? g.combatPreview(u, enemies[e]!.tile, mode) : null;
      clash.set(key, c = pv ? { atk: pv.atk / hpf(u.hp), def: pv.def / hpf(pv.defender.hp) } : null);
    }
    return c;
  };
  const threat = new Map<number, number>();
  const threatOf = (e: number, i: number): number => {
    const key = e * 32 + i;
    let a = threat.get(key);
    if (a === undefined) {
      const d = enemies[e]!.d!, mode: AttackMode = canShoot(d.type) && isShooter(d.type) ? 'ranged' : 'melee';
      threat.set(key, a = (g.unitStrength(d, mode, 'atk', units[i]!.u.tile) * matchup(d.type, units[i]!.u.type, 'atk')) / hpf(d.hp));
    }
    return a;
  };
  const guards = new Map<number, number>();
  const guard = (i: number, t: number, mode: AttackMode): number => {
    const key = (t * 32 + i) * 2 + Number(mode === 'ranged');
    let s = guards.get(key);
    if (s === undefined) { const u = units[i]!.u; guards.set(key, s = g.unitStrength(u, mode, 'def', t) / hpf(u.hp)); }
    return s;
  };
  // (The distance from each tile to the nearest enemy still standing.)
  const fields = new Map<number, Map<number, number>>();
  const field = (ehp: readonly number[]): Map<number, number> => {
    let mask = 0;
    for (let e = 0; e < E; e++) if (ehp[e]! > 0 || !enemies[e]!.d) mask |= 1 << e;
    let fd = fields.get(mask);
    if (!fd) {
      fd = new Map();
      let frontier: number[] = [];
      for (let e = 0; e < E; e++) if (mask & (1 << e)) { fd.set(enemies[e]!.tile, 0); frontier.push(enemies[e]!.tile); }
      for (let d = 1; d <= 5 && frontier.length; d++) {
        const next: number[] = [];
        for (const t of frontier) for (const nb of g.tiles[t]!.neighbors) if (!fd.has(nb)) { fd.set(nb, d); next.push(nb); }
        frontier = next;
      }
      fields.set(mask, fd);
    }
    return fd;
  };
  // Whether an enemy can be brought down by pressing it: what the units
  // that could strike it in a turn would do to it together, less what it
  // heals, kills it within three turns. Then every blow at it is part of
  // a kill, and worth its share of one (the Community Patch presses a
  // city so, when its attackers would outlast it).
  const press: number[] = enemies.map((en, e) => {
    if (!en.d) return 0;
    let dmg = 0;
    for (let i = 0; i < N; i++) {
      // (Those that can strike it this very turn: a blade with a tile beside it in reach and a move left there.)
      const m = units[i]!, far = g.approxDist(m.u.tile, en.tile), T = unitDef(m.u.type);
      const beside = (): boolean => g.tiles[en.tile]!.neighbors.some((t) => (m.reach.get(t) ?? 0) > 0 || (t === m.u.tile && m.u.moves > 0));
      const mode: AttackMode | null = m.ranged && far <= m.fireBase + T.mv - 0.5 ? 'ranged' : m.melee && !m.hurt && !m.fixed && far <= T.mv + 1.5 && beside() ? 'melee' : null;
      const st = mode ? strengths(i, e, mode) : null;
      if (!st || !mode) continue;
      dmg += (mode === 'ranged' ? VOLLEY_ROUNDS : MELEE_ROUNDS) * hit() * ((st.atk * hpf(m.u.hp)) / (st.atk * hpf(m.u.hp) + st.def * hpf(en.hp)));
    }
    const mends = en.city ? GARRISON_HEAL : g.ownerOf(en.tile) === en.d.owner ? FIELD_HEAL : 0;
    return dmg - mends > 0 && en.hp / (dmg - mends) <= 3 ? KILL + (en.city && units.some((m) => m.melee) ? 100 + 5 * en.city.pop : 0) : 0;
  });
  // ---- the posture ----
  const sum = (xs: readonly Unit[], keep: (u: Unit) => boolean) => xs.reduce((s, u) => s + (keep(u) ? strength(u) : 0), 0);
  // (Its own side: every fighter of its by the front, its move spent or not: they are there.)
  const by = f.mine.filter((u) => !u.dead && (canAssault(u.type) || canShoot(u.type)) && g.approxDist(u.tile, focus) <= REGION + 1);
  const mineAll = sum(by, () => true), theirAll = sum(them, () => true);
  const mineBlades = sum(by, blade), theirBlades = sum(them, blade), mineShots = mineAll - mineBlades, theirShots = theirAll - theirBlades;
  const owner = g.ownerOf(focus), land = owner === p.id ? 'home' : f.foes.includes(owner) ? 'enemy' : 'open';
  // (Dominant: stronger by the policy's margin, and by more away from home, where there may be more than is seen.)
  const dom = (a: number, b: number, extra = 0): 1 | 0 | -1 => (b <= 0 ? (a > 0 ? 1 : 0) : a / b > 1 + P.dominance + extra ? 1 : b / Math.max(1e-6, a) > 1 + P.dominance ? -1 : 0);
  const all = dom(mineAll, theirAll, land === 'enemy' ? 0.3 : 0), shots = dom(mineShots, theirShots);
  const exposed = theirBlades > 3 * mineBlades && mineShots > 3 * mineBlades;
  const focusE = enemies.find((e) => e.tile === focus);
  const falling = focusE?.city !== undefined && (!focusE.d || focusE.d.hp < 45) && units.some((m) => m.melee);
  let posture: Posture;
  // (Away from home, with nothing there it could bring down and its blades worn: it pulls back to mend, and comes again.)
  const bladesOut = units.filter((m) => m.melee && !m.fixed), worn = bladesOut.length > 0 && bladesOut.reduce((x, m) => x + m.u.hp, 0) / bladesOut.length < 70;
  const stuck = land !== 'home' && theirAll > 0 && worn && !press.some((x) => x > 0);
  if (stuck && !falling) posture = 'withdraw';
  else if (land === 'enemy') posture = falling ? 'strike' : all < 0 || exposed ? 'withdraw' : all > 0 ? 'steamroll' : theirBlades > mineBlades ? (shots > 0 ? 'attrition' : 'flanks') : shots > 0 ? 'steamroll' : 'flanks';
  else if (land === 'open') posture = all < 0 ? (shots > 0 ? (theirBlades > mineBlades ? 'attrition' : 'flanks') : 'withdraw') : shots > 0 ? 'attrition' : 'flanks';
  else posture = all < 0 ? 'hedgehog' : 'counterattack';
  if (posture === 'withdraw') {
    // (The shooters and the slow first, the blades last, as they cover them.)
    f.trace?.(`withdraw at ${focus}: ${stuck ? 'worn, nothing to bring down' : exposed ? 'shooters before blades' : 'outmatched'} · ${N} units ${mineAll.toFixed(1)} (blades ${mineBlades.toFixed(1)}) against ${E} with ${theirAll.toFixed(1)} (blades ${theirBlades.toFixed(1)}) on ${land} land`);
    if (stuck && f.target && g.approxDist(f.target.tile, focus) <= 4.5) f.abandon();
    for (const m of [...units].sort((a, b) => Number(b.shooter) - Number(a.shooter))) if (!m.fixed) f.retreat(m.u);
    return posture;
  }
  const level = LEVEL[posture], lossW = LOSS[level] * (1.4 - P.aggression), hpLimit = HP_LIMIT[level] * (1.4 - P.aggression);
  const bias = Math.sqrt(Math.min(2, Math.max(0.5, mineAll / Math.max(1e-6, theirAll))));
  // (What could strike back counts for less the more the posture is out to take ground.)
  const cautionW = (0.5 + 2 * P.caution) * [1, 0.7, 0.4][level]!;

  const heal = (t: number): number => (g.cityByTile.get(t)?.owner === p.id ? GARRISON_HEAL : g.ownerOf(t) === p.id ? FIELD_HEAL : 0);

  // ---- an option's worth: a tile to end on, an attack from it or none ----
  const rate = (n: Node, i: number, to: number, left: number, mode: AttackMode | null, e: number, swap: number): Assign | null => {
    const m = units[i]!, u = m.u;
    let hp = n.hp[i]!, dealt = 0, taken = 0, kill = false, bonus = 0, end = to, ehpAfter = e >= 0 ? n.ehp[e]! : 0;
    if (mode && e >= 0) {
      const en = enemies[e]!;
      if (!en.d) { kill = true; end = en.tile; bonus += 150; } // (a city no one holds: walked into)
      else {
        const s = strengths(i, e, mode);
        if (!s) return null;
        const A = s.atk * hpf(hp), D = s.def * hpf(n.ehp[e]!), odds = A / (A + D), rounds = mode === 'ranged' ? VOLLEY_ROUNDS : MELEE_ROUNDS;
        const raw = rounds * hit() * odds;
        dealt = Math.min(n.ehp[e]!, raw);
        taken = mode === 'melee' ? Math.min(hp, rounds * hit() * (1 - odds)) : 0;
        kill = raw >= n.ehp[e]! * 1.1;
        ehpAfter = n.ehp[e]! - dealt;
        hp -= taken;
        if (mode === 'melee') {
          // (A blade does not strike a blow that leaves it too hurt for what comes back, unless it kills.)
          if (!kill && hp < hpLimit && dealt * bias / lossW < taken) return null;
          if (hp < 3) return null;
          if (kill) end = en.tile;
        }
        bonus += Math.min(Math.max(30 - ehpAfter, 0), dealt) + (kill ? KILL : 0) + (kill && en.city && mode === 'melee' ? 100 + 5 * en.city.pop : 0);
        if (!kill && level > 0) bonus += press[e]! * (dealt / Math.max(1, en.hp));
      }
    }
    // The tile it ends on: its line.
    const ehp2 = kill && e >= 0 ? n.ehp.map((x, k) => (k === e ? 0 : x)) : n.ehp;
    const fd = field(ehp2), d = Math.min(5, fd.get(end) ?? 5);
    const own = g.cityByTile.get(end)?.owner === p.id;
    let line: number;
    if (own || m.hurt) line = 12;
    else if (m.shooter) line = d <= 0 ? 6 : d === 1 ? (m.fireBase === 1 ? 12 : 2) : d <= m.fireBase ? (d === m.fireBase ? 12 : 9) : d === m.fireBase + 1 ? 6 : d === m.fireBase + 2 ? 1 : -1;
    else line = kill ? Math.max(6, BLADE_LINE[d]!) : BLADE_LINE[d]!;
    // What could strike it there next turn, against the health it would have.
    let danger = 0, adjacent = 0;
    const stays = !mode && to === u.tile;
    for (let k = 0; k < E; k++) {
      const en = enemies[k]!;
      if (!en.d || ehp2[k]! <= 0 || (k === e && kill)) continue;
      const hpE = k === e ? ehpAfter : ehp2[k]!;
      const T = unitDef(en.d.type), far = g.approxDist(en.tile, end);
      if (far < 1.5) adjacent++;
      const shot = canShoot(en.d.type) && isShooter(en.d.type);
      if (far > (shot ? (T.reach ?? 1) + T.mv - 1 : T.mv) + 0.5) continue;
      const A = threatOf(k, i) * hpf(hpE), D = guard(i, end, shot ? 'ranged' : 'melee') * hpf(hp) * (stays ? 1 + FORTIFY_BONUS / 1.3 : 1);
      danger += (shot ? VOLLEY_ROUNDS : MELEE_ROUNDS) * hit() * (A / (A + D));
    }
    const strong = g.fort[end] === 1 || own;
    if (adjacent >= 3 && !strong && !(adjacent === 3 && level === 2)) return null;
    if (danger > 0 && !strong) {
      if (m.shooter && danger >= hp) return null;
      if (hp * hp < (kill ? 23 : 42) * danger && level < 2) return null;
    }
    let friends = 0;
    for (const nb of g.tiles[end]!.neighbors) { const j = n.occ.get(nb); if (j !== undefined && j !== i && j !== swap) friends++; }
    let score = line * 10;
    if (danger > 0) {
      let scaled = (100 * danger) / Math.max(1, hp);
      if (scaled > 225) scaled = 15 * Math.sqrt(scaled);
      score -= cautionW * scaled * (friends ? 1 : 2);
    }
    if (friends) score += 7 + friends;
    score += 20 * g.defenseBonus(end) + (strong && d < 3 ? 67 : 0);
    if (stays && n.left[i]! >= g.maxMoves(u.type, u.owner) && u.hp < 100) score += Math.min(100 - u.hp, heal(to));
    score += dealt - taken * lossW + bonus;
    void left;
    return { i, to, mode, e, swap, score, dealt, taken, kill };
  };

  // Every option of one unit at a node; the best few.
  const options = (n: Node, i: number): Assign[] => {
    const m = units[i]!, out: Assign[] = [];
    const cur = n.tile[i]!;
    const tiles: [number, number, number][] = []; // tile, moves left there, the unit swapped with (-1: none)
    if (m.fixed || n.stuck[i]) tiles.push([cur, n.left[i]!, -1]);
    else for (const [t, left] of m.reach) {
      const j = n.occ.get(t);
      if (t === cur || j === undefined) tiles.push([t, t === cur ? n.left[i]! : left, -1]);
      else if (j !== i && !n.set[j]! && !units[j]!.fixed && n.left[j]! > 0 && g.tiles[cur]!.neighbors.includes(t)) tiles.push([t, Math.max(0, n.left[i]! - g.stepCost(m.u, cur, t)), j]);
    }
    for (const [t, left, swap] of tiles) {
      const stay = rate(n, i, t, left, null, -1, swap);
      if (stay) out.push(stay);
      if (left <= 0 && t !== cur) continue;
      if (n.left[i]! <= 0) continue;
      if (m.ranged) {
        const fr = fire(m, t);
        for (let e = 0; e < E; e++) {
          if (!enemies[e]!.d || n.ehp[e]! <= 0 || !fr.has(enemies[e]!.tile)) continue;
          const a = rate(n, i, t, left, 'ranged', e, swap);
          if (a) out.push(a);
        }
      }
      if (m.melee && !m.hurt && !m.fixed) {
        for (const nb of g.tiles[t]!.neighbors) {
          const e = etile.get(nb);
          if (e === undefined || (enemies[e]!.d && n.ehp[e]! <= 0) || n.occ.has(nb)) continue;
          const a = rate(n, i, t, left, 'melee', e, swap);
          if (a) out.push(a);
        }
      }
    }
    // (With nothing allowed, it stays where it is, whatever that is worth.)
    if (!out.length) out.push({ i, to: cur, mode: null, e: -1, swap: -1, score: -500, dealt: 0, taken: 0, kill: false });
    return out.sort((a, b) => b.score - a.score).slice(0, CHOICES);
  };
  const apply = (n: Node, a: Assign): Node => {
    const c: Node = { tile: [...n.tile], hp: [...n.hp], left: [...n.left], set: [...n.set], stuck: [...n.stuck], ehp: [...n.ehp], occ: new Map(n.occ), score: n.score + a.score, plan: [...n.plan, a] };
    const from = c.tile[a.i]!;
    c.occ.delete(from);
    if (a.swap >= 0) { c.tile[a.swap] = from; c.occ.set(from, a.swap); c.left[a.swap] = Math.max(0, c.left[a.swap]! - g.stepCost(units[a.swap]!.u, a.to, from)); c.stuck[a.swap] = true; }
    let end = a.to;
    if (a.mode && a.e >= 0) {
      c.ehp[a.e] = Math.max(0, c.ehp[a.e]! - a.dealt);
      c.hp[a.i] = c.hp[a.i]! - a.taken;
      if (a.kill) { c.ehp[a.e] = 0; if (a.mode === 'melee') end = enemies[a.e]!.tile; }
    }
    c.tile[a.i] = end;
    c.occ.set(end, a.i);
    c.set[a.i] = true;
    c.left[a.i] = 0;
    return c;
  };

  // ---- the search: the best few lines, a unit's assignment at a time ----
  const root: Node = { tile: us.map((u) => u.tile), hp: us.map((u) => u.hp), left: us.map((u) => u.moves), set: us.map(() => false), stuck: us.map(() => false), ehp: enemies.map((e) => e.hp),
    occ: new Map(us.map((u, i) => [u.tile, i])), score: 0, plan: [] };
  const width = Math.max(1, Math.round(P.simWidth));
  let beam: Node[] = [root];
  for (let depth = 0; depth < N; depth++) {
    const next: Node[] = [];
    for (const n of beam) {
      const all: Assign[] = [];
      for (let i = 0; i < N; i++) if (!n.set[i]) all.push(...options(n, i));
      all.sort((a, b) => b.score - a.score);
      // (The best option of all, and the best of other units after it: a different unit first is a different line.)
      const firsts: Assign[] = [];
      for (const a of all) { if (!firsts.some((x) => x.i === a.i)) firsts.push(a); if (firsts.length >= width) break; }
      for (const a of firsts) next.push(apply(n, a));
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, width);
  }
  const bestLine = beam[0];
  if (!bestLine) return posture;

  // ---- the plan carried out ----
  f.trace?.(`${posture} at ${focus}: ` + bestLine.plan.map((a) => `${units[a.i]!.u.type.slice(0, 4)}${Math.round(units[a.i]!.u.hp)} ${a.to === units[a.i]!.u.tile ? 'stays' : a.swap >= 0 ? 'swaps' : 'moves'}${a.mode ? ` ${a.mode}→${a.e}` : ''} (${Math.round(a.score)})`).join(' · ') + ` | press ${press.map((x) => Math.round(x)).join(',')}`);
  for (const a of bestLine.plan) {
    const u = units[a.i]!.u;
    if (u.dead) continue;
    if (a.to !== u.tile && u.moves > 0) g.goTo(u, a.to);
    if (u.dead) continue;
    if (a.mode && a.e >= 0) {
      const t = enemies[a.e]!.tile;
      // (Its target gone, or out of its reach after all: it is left free for what comes after.)
      if (!g.isEnemyOccupied(t, p.id) || u.moves <= 0) continue;
      if (a.mode === 'ranged') { if (g.attackBlockAt(u, t, 'ranged') !== null) continue; g.attack(u, t, 'ranged'); }
      else { if (!g.tiles[u.tile]!.neighbors.includes(t) || (g.bestDefender(t, p.id) && g.attackBlockAt(u, t, 'melee') !== null)) continue; g.goTo(u, t, 'melee'); }
    } else if (u.moves >= g.maxMoves(u.type, u.owner)) u.fortified = true; // (it held its ground: dug in)
    f.done.add(u.id);
  }
  return posture;
}
