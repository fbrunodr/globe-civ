import { unitDef, buildDef, type BuildKey } from './rules.ts';
import { BUILDING_KEYS, weigh, type BuildingKey } from './cities.ts';
import type { Game, Player, Unit, City } from './game.ts';

// Deliberately simple AI: expand with settlers, keep a garrison in every
// city, attack adjacent targets when the odds are good and, once it has a
// few spare units, march on the nearest enemy city.
export function aiTurn(g: Game, p: Player): void {
  const cities = g.cities.filter((c) => c.owner === p.id);
  const units = g.units.filter((u) => u.owner === p.id);
  const settlers = units.filter((u) => u.type === 'settler').length;
  const isMilitary = (u: Unit) => !unitDef(u.type).civilian;
  const garrisoned = (c: City) => units.some((u) => u.tile === c.tile && isMilitary(u));
  const spare = units.filter((u) => isMilitary(u) && unitDef(u.type).atk > 0 && !g.cityByTile.has(u.tile)).length;
  const military = units.filter(isMilitary).length;
  p.offensive = g.turn > 25 && spare >= 3;

  for (const c of cities) {
    if (!c.building) c.building = chooseBuild(g, c, cities.length + settlers, garrisoned(c), military >= 2 + 2 * cities.length);
  }

  for (const u of units) {
    if (u.dead) continue;
    if (u.type === 'settler') settlerTurn(g, u);
    else militaryTurn(g, u, p, cities, garrisoned);
  }
}

function chooseBuild(g: Game, city: City, expansion: number, garrisoned: boolean, armyFull: boolean): BuildKey | null {
  const r = g.rng();
  if (!garrisoned) return g.turn < 30 ? 'warrior' : 'spearman';
  if (expansion < 6 && city.pop >= 2 && r < 0.6) return 'settler';
  if (!city.buildings.has('walls') && g.turn > 40 && r < 0.15 && g.canBuild(city, 'walls')) return 'walls';
  if (city.pop >= 2 && (r < 0.5 || armyFull)) {
    const b = bestBuilding(g, city);
    if (b) return b;
  }
  if (armyFull) return null; // bank the production as gold
  const pool: BuildKey[] = g.turn < 20 ? ['warrior', 'warrior', 'scout'] : ['archer', 'horseman', 'spearman', 'archer'];
  return pool[Math.floor(g.rng() * pool.length)];
}

// The building worth most for the city's focus per point of cost, at the
// governor's best spot (one of the top three, so cities differ).
function bestBuilding(g: Game, city: City): BuildingKey | null {
  const scored: { k: BuildingKey; s: number }[] = [];
  for (const k of BUILDING_KEYS) {
    if (k === 'walls' || !g.canBuild(city, k)) continue;
    const t = g.governorBuildingSpot(city, k);
    if (t === null) continue;
    const gain = weigh(city.focus, g.buildingGain(city, k, t));
    const defense = k === 'barracks' || k === 'stable' ? 3 : 0;
    if (gain + defense <= 0) continue; // e.g. it would cost a farm worth more
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

function militaryTurn(g: Game, u: Unit, p: Player, cities: City[], garrisoned: (c: City) => boolean): void {
  const T = unitDef(u.type);

  // Stay as the garrison if this city has no other defender.
  const here = g.cityByTile.get(u.tile);
  if (here && here.owner === u.owner) {
    const defenders = g.units.filter((x) => x.tile === u.tile && x.owner === u.owner && !unitDef(x.type).civilian);
    if (defenders[0] === u) { u.fortified = true; return; }
  }

  // Rush back to an undefended city nearby.
  const empty = cities.find((c) => !garrisoned(c) && g.approxDist(c.tile, u.tile) < 6);
  if (empty) { g.goTo(u, empty.tile); return; }

  if (T.atk > 0) {
    for (const nb of g.tiles[u.tile].neighbors) {
      if (!g.isEnemyOccupied(nb, u.owner) || g.isWater(nb)) continue;
      const pv = g.combatPreview(u, nb);
      if (!pv || pv.atk / (pv.atk + pv.def) > 0.55) { g.attack(u, nb); return; }
    }

    if (p.offensive) {
      let target: City | null = null, best = 18;
      for (const c of g.cities) {
        if (c.owner === u.owner) continue;
        const d = g.approxDist(c.tile, u.tile);
        if (d < best) { best = d; target = c; }
      }
      if (target) { g.goTo(u, target.tile); return; }
    }
  }

  // Otherwise wander around the empire.
  const opts = g.tilesWithin(u.tile, 3).filter((t) => !g.isWater(t) && !g.isEnemyOccupied(t, u.owner));
  const home = cities[0];
  const near = home ? opts.filter((t) => g.approxDist(t, home.tile) < 9) : opts;
  const pick = (near.length ? near : opts)[Math.floor(g.rng() * (near.length || opts.length))];
  if (pick != null) g.goTo(u, pick);
}
