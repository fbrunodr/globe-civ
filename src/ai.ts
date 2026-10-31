import { unitDef, buildDef, domainOf, UNITS, type BuildKey, type UnitKey, type UnitDef } from './rules.ts';
import { BUILDING_KEYS, BUILDINGS, WONDER_KEYS, weigh, addOut, OUTPUT_KEYS, type BuildingKey } from './cities.ts';
import { resourceDef, empireBonus, type ResourceKey } from './resources.ts';
import { flat } from './effects.ts';
import { buildingUpkeep } from './economy.ts';
import { TECH_KEYS, techDef, type TechKey } from './techs.ts';
import { POLITICS_KEYS, politicsDef, policyDef, SLOT_KINDS, fits, type PoliticsKey, type GovernmentKey, type PolicyKey } from './politics.ts';
import { TRAIT_KEYS, traitDef, PATH_KEYS, PATHS, type PathKey, type TraitKey } from './identity.ts';
import { mulberry32 } from './rng.ts';
import { MIN_WAR, type Game, type Player, type Unit, type City, type DealSide } from './game.ts';

// Deliberately simple AI: expand with settlers, keep a garrison in every
// city, attack adjacent enemies when the odds are good and, at war with a
// few spare units, march on the nearest enemy city. Each civ has a bent
// (warlike or builder: its id and the seed) that steers its research,
// politics, government and policies, and how readily it goes to war; and
// its own taste in identity paths (pathTaste), so no two are alike.
const warlike = (g: Game, p: Player): boolean => (g.seed + p.id * 7) % 3 === 0;

export function aiTurn(g: Game, p: Player): void {
  if (!p.research) { const t = aiPickTech(g, p); if (t) g.setResearch(p, t); }
  if (!p.studying) { const c = aiPickPolitics(g, p); if (c) g.setPolitics(p, c); }
  aiPickTraits(g, p);
  aiDiplomacy(g, p);
  aiTrade(g, p);
  const cities = g.cities.filter((c) => c.owner === p.id);
  const units = g.units.filter((u) => u.owner === p.id);
  const settlers = units.filter((u) => u.type === 'settler').length;
  const isMilitary = (u: Unit) => !unitDef(u.type).civilian;
  // (A garrison is a land unit: ships in port and aircraft don't hold a city.)
  const garrisoned = (c: City) => units.some((u) => u.tile === c.tile && isMilitary(u) && domainOf(unitDef(u.type)) === 'land');
  const spare = units.filter((u) => isMilitary(u) && unitDef(u.type).atk > 0 && !g.cityByTile.has(u.tile)).length;
  const military = units.filter(isMilitary).length;
  p.offensive = spare >= 3 && g.players.some((o) => g.atWar(p.id, o.id));

  for (const c of cities) {
    if (!c.building) c.building = chooseBuild(g, c, cities.length + settlers, garrisoned(c), military >= 2 + 2 * cities.length);
    // A full treasury buys: what a city builds, when it costs under a third
    // of the gold (half, when the treasury overflows).
    const cost = g.buyCost(c, 'gold');
    if (cost !== null && p.gold > 120 && cost < p.gold / (p.gold > 1000 ? 2 : 3)) g.buy(c, 'gold');
    // Running out of room to grow: buy the best tile of the ring beyond (while the gold lasts).
    while (g.growthOptions(c).filter((o) => o.kind !== 'specialist').length < 2) {
      const t = g.governorTileToBuy(c);
      if (t === null || !g.buyTile(c, t)) break;
    }
  }

  // Gold to spare modernizes the army: the weakest units first.
  for (const u of [...units].sort((a, b) => unitDef(a.type).cost - unitDef(b.type).cost)) {
    const to = g.upgradeTarget(u);
    if (to && p.gold > 2 * g.upgradeCost(u, to) + 60) g.upgrade(u);
  }

  for (const u of units) {
    if (u.dead) continue;
    if (u.type === 'settler') settlerTurn(g, u);
    else if (domainOf(unitDef(u.type)) === 'air') airTurn(g, u);
    else if (domainOf(unitDef(u.type)) === 'sea') seaTurn(g, u);
    else militaryTurn(g, u, p, cities, garrisoned);
  }
}

// The best unit a city can build now for a role: defending (its defense),
// attacking (its attack), from those it has unlocked (and the resources).
// (`siege`: the best siege engine, for an army that means to take cities;
// `sea`, `air`: the best ship, the best aircraft.)
function bestUnit(g: Game, city: City, role: 'def' | 'atk' | 'siege' | 'sea' | 'air'): UnitKey {
  let best: UnitKey = 'warrior', bestS = -1;
  const domain = role === 'sea' || role === 'air' ? role : 'land';
  for (const k of Object.keys(UNITS) as UnitKey[]) {
    const d: UnitDef = unitDef(k);
    if (d.civilian || k === 'commander' || k === 'scout' || !g.canBuild(city, k) || domainOf(d) !== domain) continue;
    if (domain === 'land' && (role === 'siege') !== (d.siege === true)) continue;
    const s = (role === 'def' ? d.def * 1.5 + d.atk : d.atk * 1.5 + d.def + (d.mv > 1 ? 1 : 0)) / Math.sqrt(d.cost);
    if (s > bestS) { best = k; bestS = s; }
  }
  return best;
}

function chooseBuild(g: Game, city: City, expansion: number, garrisoned: boolean, armyFull: boolean): BuildKey | null {
  const r = g.rng();
  if (!garrisoned) return bestUnit(g, city, 'def');
  if (expansion < 6 && city.pop >= 2 && r < 0.6) return 'settler';
  if (!city.buildings.has('walls') && g.turn > 40 && r < 0.15 && g.canBuild(city, 'walls')) return 'walls';
  // Now and then a grown city starts a wonder, at the governor's site.
  if (city.pop >= 5 && r > 0.96) {
    const options = WONDER_KEYS.filter((w) => g.canBuild(city, w) && !g.cities.some((c) => c.owner === city.owner && c.building === w));
    const w = options[Math.floor(g.rng() * options.length)];
    const t = w ? g.governorWonderSpot(city, w) : null;
    if (w && t !== null && g.startWonder(city, w, t)) return w;
  }
  if (city.pop >= 2 && (r < 0.5 || armyFull)) {
    const b = bestBuilding(g, city);
    if (b) return b;
  }
  if (armyFull) {
    // A wonder rather than idle production, when there is one to build.
    const options = WONDER_KEYS.filter((w) => g.canBuild(city, w) && !g.cities.some((c) => c.owner === city.owner && c.building === w));
    const w = options[Math.floor(g.rng() * options.length)];
    const t = w ? g.governorWonderSpot(city, w) : null;
    if (w && t !== null && g.startWonder(city, w, t)) return w;
    return null; // bank the production as gold
  }
  if (g.turn < 15 && r < 0.2) return 'scout';
  // (Now and then an engine for the walls, once there is one to build.)
  const siege = bestUnit(g, city, 'siege'), ship = bestUnit(g, city, 'sea'), plane = bestUnit(g, city, 'air');
  if (r < 0.12 && unitDef(siege).siege) return siege;
  // (A ship now and then from a port, an aircraft once there are any.)
  if (r >= 0.12 && r < 0.2 && domainOf(unitDef(ship)) === 'sea') return ship;
  if (r >= 0.2 && r < 0.27 && domainOf(unitDef(plane)) === 'air') return plane;
  return bestUnit(g, city, r < 0.65 ? 'atk' : 'def');
}

// The building worth most for the city's focus per point of cost (one of
// the top three, so cities differ).
function bestBuilding(g: Game, city: City): BuildingKey | null {
  const scored: { k: BuildingKey; s: number }[] = [];
  // (Short of gold: what pays, and the Courthouse where upkeep bites, first.)
  const p = g.players[city.owner]!, l = p.ledger;
  const broke = l.income.gold + l.tithes - l.cityUpkeep - l.unitUpkeep < 0 && p.gold < 100;
  for (const k of BUILDING_KEYS) {
    if (k === 'walls' || !g.canBuild(city, k)) continue;
    const yields = g.buildingGain(city, k);
    const upkeep = buildingUpkeep(buildDef(k).cost);
    const gain = weigh(city.focus, yields) - upkeep * (broke ? 4 : 1.5) + (broke ? 3 * yields.gold : 0)
      + (k === 'courthouse' ? g.upkeepOf(city) * (broke ? 4 : 2) : 0);
    const defense = k === 'barracks' || k === 'stable' ? 3 : 0;
    if (gain + defense <= 0) continue;
    scored.push({ k, s: (gain + defense) / buildDef(k).cost });
  }
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, 3);
  return top.length ? top[Math.floor(g.rng() * top.length)]!.k : null;
}

function settlerTurn(g: Game, u: Unit): void {
  if (g.turn <= 2 && g.canFoundCity(u.tile, u.owner)) { g.foundCity(u); return; }

  if (u.aiTarget == null || !g.canFoundCity(u.aiTarget, u.owner)) {
    const dist = g.tilesWithinMap(u.tile, 7);
    const cand: { t: number; s: number }[] = [];
    for (const [t, d] of dist) {
      if (g.canFoundCity(t, u.owner)) cand.push({ t, s: g.siteScore(t) - 1.5 * d });
    }
    cand.sort((a, b) => b.s - a.s);
    u.aiTarget = cand.slice(0, 6).find((c) => g.findPath(u, c.t))?.t ?? null;
  }
  if (u.aiTarget == null) {
    if (g.canFoundCity(u.tile, u.owner)) g.foundCity(u);
    return;
  }
  if (u.tile !== u.aiTarget) g.goTo(u, u.aiTarget);
  if (!u.dead && u.tile === u.aiTarget) g.foundCity(u);
}

// An aircraft strikes the best target in its range it is likely to win
// against; else it waits in its city.
function airTurn(g: Game, u: Unit): void {
  let best: number | null = null, bestOdds = 0.55;
  for (const t of g.tilesWithin(u.tile, unitDef(u.type).range ?? 1)) {
    if (!g.isEnemyOccupied(t, u.owner) || g.attackBlockAt(u, t) !== null) continue;
    const pv = g.combatPreview(u, t), odds = pv ? pv.atk / (pv.atk + pv.def) : 0.6;
    if (odds > bestOdds) { best = t; bestOdds = odds; }
  }
  if (best !== null) g.goTo(u, best);
}
// A ship goes for an enemy within a few tiles it can reach and likely beat;
// else it keeps to port (or where it is).
function seaTurn(g: Game, u: Unit): void {
  for (const t of g.tilesWithin(u.tile, 3)) {
    if (!g.isEnemyOccupied(t, u.owner) || g.attackBlockAt(u, t) !== null) continue;
    const pv = g.combatPreview(u, t);
    if (pv && pv.atk / (pv.atk + pv.def) < 0.55) continue;
    if (g.tiles[u.tile].neighbors.includes(t)) { g.attack(u, t); return; }
    const path = g.findPath(u, t);
    if (path && path.length <= 3) { g.goTo(u, t); return; }
  }
  u.fortified = true;
}

function militaryTurn(g: Game, u: Unit, p: Player, cities: City[], garrisoned: (c: City) => boolean): void {
  const T = unitDef(u.type);

  // Stay as the garrison if this city has no other defender.
  const here = g.cityByTile.get(u.tile);
  if (here && here.owner === u.owner) {
    const defenders = g.units.filter((x) => x.tile === u.tile && x.owner === u.owner && !unitDef(x.type).civilian && domainOf(unitDef(x.type)) === 'land');
    if (defenders[0] === u) { u.fortified = true; return; }
  }

  // Rush back to an undefended city nearby.
  const empty = cities.find((c) => !garrisoned(c) && g.approxDist(c.tile, u.tile) < 6);
  if (empty) { g.goTo(u, empty.tile); return; }

  if (T.atk > 0) {
    for (const nb of g.tiles[u.tile].neighbors) {
      // (isEnemyOccupied: civs at war with it only.)
      if (!g.isEnemyOccupied(nb, u.owner) || g.isWater(nb) || g.attackBlockAt(u, nb) !== null) continue;
      const pv = g.combatPreview(u, nb);
      if (!pv || pv.atk / (pv.atk + pv.def) > 0.55) { g.attack(u, nb); return; }
    }

    if (p.offensive) {
      let target: City | null = null, best = 18;
      for (const c of g.cities) {
        if (c.owner === u.owner || !g.atWar(u.owner, c.owner)) continue;
        const d = g.approxDist(c.tile, u.tile);
        if (d < best) { best = d; target = c; }
      }
      if (target) { g.goTo(u, target.tile); return; }
    }
  }

  // Burn enemy fields underfoot.
  if (g.canPillage(u) && g.rng() < 0.6) { g.pillage(u); return; }

  // Otherwise wander around the empire.
  const opts = g.tilesWithin(u.tile, 3).filter((t) => !g.isWater(t) && !g.isEnemyOccupied(t, u.owner));
  const home = cities[0];
  const near = home ? opts.filter((t) => g.approxDist(t, home.tile) < 9) : opts;
  const pick = (near.length ? near : opts)[Math.floor(g.rng() * (near.length || opts.length))];
  if (pick != null) g.goTo(u, pick);
}

// ---- research, civics, government ----

// What an unlock is worth to this civ: units more to the warlike, buildings
// and wonders more to builders.
function unlockValue(g: Game, p: Player, d: { units?: readonly UnitKey[]; buildings?: readonly BuildingKey[]; wonders?: readonly string[] }): number {
  const w = warlike(g, p);
  return (d.units?.length ?? 0) * (w ? 1.6 : 0.8) + (d.buildings?.length ?? 0) * (w ? 0.9 : 1.4) + (d.wonders?.length ?? 0) * (w ? 0.5 : 1.0);
}

// The tech to research next: one it can start now, by worth per cost, with chance.
export function aiPickTech(g: Game, p: Player): TechKey | null {
  let best: TechKey | null = null, bestS = -Infinity;
  for (const k of TECH_KEYS) {
    const d = techDef(k);
    if (p.techs.has(k) || !d.needs.every((n) => p.techs.has(n))) continue;
    const s = (1 + unlockValue(g, p, d)) / d.cost + 0.01 * g.rng();
    if (s > bestS) { best = k; bestS = s; }
  }
  return best;
}

// The politics next: a new government first, then policies.
export function aiPickPolitics(g: Game, p: Player): PoliticsKey | null {
  let best: PoliticsKey | null = null, bestS = -Infinity;
  for (const k of POLITICS_KEYS) {
    const d = politicsDef(k);
    if (p.politics.has(k) || !d.needs.every((n) => p.politics.has(n))) continue;
    const s = (1 + unlockValue(g, p, d) + 2 * (d.governments?.length ?? 0) + 0.6 * (d.policies?.length ?? 0)) / d.cost + 0.01 * g.rng();
    if (s > bestS) { best = k; bestS = s; }
  }
  return best;
}

// ---- identity ----

// How much a civ likes each path: a shuffle of its own (the seed and its
// id), the warlike leaning to the Martial and the builders to the rest.
const tasteCache = new Map<string, Record<PathKey, number>>();
export function pathTaste(g: Game, p: Player): Record<PathKey, number> {
  const key = `${g.seed}:${p.id}`;
  const hit = tasteCache.get(key);
  if (hit) return hit;
  const rand = mulberry32((g.seed * 31 + p.id * 977) ^ 0x1de);
  const w = warlike(g, p);
  const taste = Object.fromEntries(PATH_KEYS.map((k) => [k, rand() * 3
    + (w && (k === 'martial' || k === 'nationalIndustry' || k === 'pastoral') ? 1.5 : 0)
    + (!w && (k === 'concord' || k === 'reason' || k === 'openMarket' || k === 'heartland') ? 1 : 0)])) as Record<PathKey, number>;
  tasteCache.set(key, taste);
  return taste;
}
// Adopts every trait it can afford, best first: deeper in the paths it
// likes, an unfounded faith eagerly.
export function aiPickTraits(g: Game, p: Player): void {
  const taste = pathTaste(g, p);
  for (let guard = 0; guard < 6 && p.identityPoints >= g.nextTraitCost(p); guard++) {
    let best: TraitKey | null = null, bestS = -Infinity;
    for (const k of TRAIT_KEYS) {
      if (!g.canAdopt(p, k)) continue;
      const d = traitDef(k);
      // (Its own liking, less for a path whose opposite it likes better.)
      // (Faith draws them while a religion is still to be founded.)
      const faith = d.religion ? 2 : k === 'spirituality' && g.religions.size < 7 ? 1.5 : 0;
      const s = taste[d.path] - 0.5 * taste[PATHS[d.path].opposite] + 0.6 * d.tier + faith + 0.2 * g.rng();
      if (s > bestS) { best = k; bestS = s; }
    }
    if (!best || !g.adoptTrait(p, best)) return;
  }
}

// The government it likes best of those it has, and its policies: the best
// for its bent in each slot.
const GOV_ORDER: Record<'warlike' | 'builder', readonly GovernmentKey[]> = {
  warlike: ['fascism', 'communism', 'absoluteMonarchy', 'monarchy', 'oligarchy', 'autocracy', 'theocracy', 'merchantRepublic', 'constitutionalMonarchy', 'classicalRepublic', 'chiefdom'],
  builder: ['democracy', 'technocracy', 'communism', 'constitutionalMonarchy', 'merchantRepublic', 'theocracy', 'classicalRepublic', 'autocracy', 'monarchy', 'oligarchy', 'chiefdom'],
};
// (Later policies are stronger: they come later in the list.)
function policyScore(g: Game, p: Player, k: PolicyKey): number {
  const kind = policyDef(k).kind, w = warlike(g, p);
  return (kind === 'military' ? (w ? 3 : 1) : kind === 'economic' ? 2.5 : (w ? 1 : 2)) + (k === 'bureaucracy' ? 1 : 0)
    + 0.01 * POLITICS_KEYS.findIndex((c) => politicsDef(c).policies?.includes(k)) + 0.1 * ((k.length * 7 + p.id) % 5);
}
export function aiGovern(g: Game, p: Player): void {
  const have = g.governmentsOf(p);
  const want = GOV_ORDER[warlike(g, p) ? 'warlike' : 'builder'].find((k) => have.includes(k));
  if (want && want !== p.government) g.setGovernment(p, want);
  const options = g.policiesOf(p).sort((a, b) => policyScore(g, p, b) - policyScore(g, p, a));
  for (const slot of SLOT_KINDS) {
    p.policies[slot].forEach((_, i) => {
      const k = options.find((x) => fits(x, slot) && !SLOT_KINDS.some((s) => p.policies[s].includes(x)));
      if (k) g.setPolicy(p, slot, i, k);
    });
  }
}

// ---- diplomacy ----

// A civ's fighting strength: its fighting units' attack and defense, as hurt.
export function power(g: Game, owner: number): number {
  return g.units.reduce((s, u) => s + (u.owner === owner && !unitDef(u.type).civilian ? (unitDef(u.type).atk + unitDef(u.type).def) * (0.5 + u.hp / 200) : 0), 0);
}

// War when much stronger than a civ it has met nearby (warlike civs sooner);
// peace when the war goes badly or has lasted.
function aiDiplomacy(g: Game, p: Player): void {
  const mine = power(g, p.id);
  const wars = g.players.filter((o) => o.alive && g.atWar(p.id, o.id));
  for (const o of wars) {
    const long = g.turn - g.relations[p.id]![o.id]!.since;
    if (g.canMakePeace(p.id, o.id) && (mine < 0.8 * power(g, o.id) || (long > 30 && g.rng() < 0.15))) g.offerPeace(p.id, o.id);
  }
  if (wars.length || g.turn < (warlike(g, p) ? 30 : 60) || g.rng() > (warlike(g, p) ? 0.08 : 0.03)) return;
  const home = g.cities.find((c) => c.owner === p.id);
  if (!home) return;
  const targets = g.players.filter((o) => o.alive && o.id !== p.id && g.met[p.id]![o.id] && g.cities.some((c) => c.owner === o.id && g.approxDist(c.tile, home.tile) < 14));
  const weakest = targets.sort((a, b) => power(g, a.id) - power(g, b.id))[0];
  if (weakest && mine > 1.25 * power(g, weakest.id) + 2) g.declareWar(p.id, weakest.id);
}

// Whether it accepts peace offered by `from`: losing, even, or weary.
export function aiAcceptsPeace(g: Game, p: Player, from: number): boolean {
  if (g.turn - g.relations[p.id]![from]!.since < MIN_WAR) return false;
  return power(g, p.id) < 1.25 * power(g, from) || g.turn - g.relations[p.id]![from]!.since > 25;
}

// ---- trade ----

// What having resource r is worth to civ p a turn, in yield points: a
// luxury's empire bonus; a strategic more when something it can build needs
// it. Nothing if it has it already.
export function resourceWorth(g: Game, p: Player, r: ResourceKey): number {
  if (g.hasResource(p.id, r)) return 0;
  const d = resourceDef(r);
  if (d.kind === 'luxury') { const y = addOut(empireBonus(r, p.era), flat(g.effectsOf(p), 'luxury')); return OUTPUT_KEYS.reduce((s, k) => s + y[k], 0); }
  if (d.kind !== 'strategic') return 0;
  const needs = (k: BuildKey) => (k in UNITS ? unitDef(k as UnitKey).needs : k in BUILDINGS ? BUILDINGS[k as BuildingKey].resource : undefined);
  return [...g.unlocked(p)].some((k) => needs(k) === r) ? 6 : 2;
}
// What giving a spare copy away costs it: a little (it would rather keep
// its goods), more for a strategic to a civ stronger than itself.
const giveCost = (g: Game, p: Player, r: ResourceKey | null, to: number): number =>
  !r ? 0 : resourceDef(r).kind === 'strategic' && power(g, to) > power(g, p.id) ? 3 : 1;

// Whether it signs a deal: what it gets must beat what it gives by a point.
export function aiAcceptsDeal(g: Game, p: Player, sides: readonly [DealSide, DealSide]): boolean {
  const mine = sides.find((s) => s.civ === p.id), theirs = sides.find((s) => s.civ !== p.id);
  if (!mine || !theirs || g.dealBlock(sides) !== null) return false;
  const gain = (theirs.resource ? resourceWorth(g, p, theirs.resource) : 0) + theirs.gold;
  return gain - giveCost(g, p, mine.resource, theirs.civ) - mine.gold >= 1;
}

// Now and then, a trade with a civ it is at peace with: goods for goods,
// or its spares sold for gold a turn, or theirs bought. To the human, an
// offer to answer (one a turn at most).
function aiTrade(g: Game, p: Player): void {
  if (g.rng() > 0.3) return;
  for (const o of g.players.filter((x) => g.canTrade(p.id, x.id))) {
    if (o.isHuman && (g.rng() > 0.3 || g.dealOffers.length)) continue;
    const byWorth = (to: Player) => (a: ResourceKey, b: ResourceKey) => resourceWorth(g, to, b) - resourceWorth(g, to, a);
    const give = g.tradeable(p.id, o.id).sort(byWorth(o))[0] ?? null;
    const get = g.tradeable(o.id, p.id).sort(byWorth(p))[0] ?? null;
    const side = (civ: number, resource: ResourceKey | null, gold = 0): DealSide => ({ civ, resource, gold });
    const wantGet = get !== null && resourceWorth(g, p, get) >= 2;
    if (give && wantGet) g.proposeDeal([side(p.id, give), side(o.id, get)]);
    else if (give) g.proposeDeal([side(p.id, give), side(o.id, null, Math.max(1, resourceWorth(g, o, give) - 2))]);
    else if (wantGet) {
      const pay = Math.max(1, Math.floor(resourceWorth(g, p, get) / 2));
      if (pay <= g.goldRate(p.id) / 3) g.proposeDeal([side(p.id, null, pay), side(o.id, get)]);
    }
  }
}
