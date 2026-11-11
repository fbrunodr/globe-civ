import { describe, it, expect } from 'vitest';
import { Game, PILLAGE_GOLD, PILLAGE_REPAIR, REPAIR_TURNS, type City } from '../src/game.ts';
import { USE } from '../src/cities.ts';

// War guarantees (design doc "Cities: Feel & Play", war and life).

// A city of player 0 with no defenders, and a free land tile next to it.
// Every player is flagged human so no AI moves during the test.
function setup(): { g: Game; city: City; nb: number } {
  const g = new Game({ size: 'small', seed: 5 });
  for (const p of g.players) p.isHuman = true;
  const settler = g.units.find((u) => u.owner === 0 && u.type === 'settler')!;
  const city = g.foundCity(settler)!;
  for (const u of [...g.units]) g.removeUnit(u);
  const nb = g.tiles[city.tile].neighbors.find((n) => !g.isWater(n) && g.relief[n] !== 'mountains')!;
  // Player 1 stays in the game (a settler far away keeps it alive).
  const far = g.tiles.findIndex((t) => !g.isWater(t.id) && g.approxDist(t.id, city.tile) > 10);
  g.createUnit('settler', 1, far);
  return { g, city, nb };
}

// A turn, ignoring the game's end (every player is flagged human here).
function turn(g: Game): void {
  g.over = null;
  g.endTurn();
}

describe('WR1: a city is its garrison\'s to hold', () => {
  it('with no one in it, the first enemy to walk in takes it; fire alone never does', () => {
    const { g, city, nb } = setup();
    g.declareWar(1, 0);
    const a = g.createUnit('archer', 1, nb);
    g.attack(a, city.tile, 'ranged');
    expect(city.owner).toBe(0); // (nothing to shoot at, and fire never moves in)
    const h = g.createUnit('warrior', 1, nb);
    g.attack(h, city.tile);
    expect(city.owner).toBe(1);
    expect(h.tile).toBe(city.tile);
  });

  it('a garrison must be beaten first; walls make it twice as strong again', () => {
    const { g, city, nb } = setup();
    g.declareWar(1, 0);
    const guard = g.createUnit('spearman', 0, city.tile);
    expect(g.cityStrength(city)).toBeGreaterThan(0);
    const open = g.unitStrength(guard, 'melee', 'def', city.tile);
    city.buildings.add('walls');
    expect(g.unitStrength(guard, 'melee', 'def', city.tile)).toBeGreaterThan(1.5 * open);
    // (An attacker that does not kill it does not get in.)
    const w = g.createUnit('warrior', 1, nb);
    g.attack(w, city.tile);
    if (!guard.dead) expect(city.owner).toBe(0);
    // (The garrison gone, the next one in takes it.)
    if (!guard.dead) g.removeUnit(guard);
    const h = g.createUnit('horseman', 1, nb);
    g.attack(h, city.tile);
    expect(city.owner).toBe(1);
  });

  it('an engine is twice as strong as its attack says against a garrison, half against a unit in the field', () => {
    const { g, city, nb } = setup();
    g.declareWar(1, 0);
    g.createUnit('spearman', 0, city.tile);
    const far = g.tiles[nb]!.neighbors.find((n) => n !== city.tile && !g.isWater(n))!;
    const field = g.createUnit('spearman', 0, far);
    void field;
    const c = g.createUnit('catapult', 1, nb);
    const atCity = g.combatPreview(c, city.tile, 'ranged')!, inField = g.combatPreview(c, far, 'ranged')!;
    expect(atCity.atk).toBeCloseTo(4 * inField.atk);
  });
});

describe('WR2: pillage and repair', () => {
  it('a pillaged tile loses its improvement\'s yield until repaired; the raider takes gold', () => {
    const { g, city } = setup();
    city.growth = 1;
    g.autoPlace(city);
    let farm = g.cityTiles(city, USE.rural)[0];
    if (farm === undefined) {
      // Make sure there is one: develop the first free land tile with an improvement.
      city.growth = 1;
      const o = g.growthOptions(city).find((x) => x.kind === 'rural')!;
      g.placeGrowth(city, o);
      farm = o.tile;
    }
    g.build(farm, g.improvementAt(farm)!);
    const before = g.tileOutput(farm);
    expect(before.food + before.prod + before.gold).toBeGreaterThan(0);
    const raider = g.createUnit('warrior', 1, farm);
    g.declareWar(1, 0); // (pillaging is an act of war)
    const gold = g.players[1]!.gold;
    expect(g.pillage(raider)).toBe(true);
    expect(g.players[1]!.gold).toBe(gold + PILLAGE_GOLD);
    // (Its land still yields, worked: only what the improvement added is lost.)
    const burnt = g.tileOutput(farm);
    expect(burnt.food + burnt.prod + burnt.gold).toBeLessThan(before.food + before.prod + before.gold);
    // No repair while the raider stands there. (A store of food: the burnt
    // farm must not starve the city, which would leave the tile wild.)
    city.food = 200;
    turn(g);
    expect(g.pillaged[farm]).toBe(PILLAGE_REPAIR);
    g.removeUnit(raider);
    // (Nor by itself once it is gone: a worker mends it.)
    for (let i = 0; i < PILLAGE_REPAIR; i++) turn(g);
    expect(g.pillaged[farm]).toBe(PILLAGE_REPAIR);
    const w = g.createUnit('worker', 0, farm);
    expect(g.improve(w, farm)).toBe(true);
    for (let i = 0; i < REPAIR_TURNS; i++) turn(g);
    expect(g.pillaged[farm]).toBe(0);
  });
});

describe('WR3: razing leaves ruins', () => {
  it('a captured city burns down, its built-up tiles become ruins, its land wild', () => {
    const { g, city, nb } = setup();
    city.hp = 0;
    const h = g.createUnit('horseman', 1, nb);
    g.attack(h, city.tile);
    expect(city.owner).toBe(1);
    expect(g.canRaze(city)).toBe(true);
    expect(g.raze(city)).toBe(true);
    const center = city.tile;
    for (let i = 0; i < 20 && g.cities.includes(city); i++) turn(g);
    expect(g.cities.includes(city)).toBe(false);
    expect(g.ruins[center]).toBe(1);
    expect(g.use[center]).toBe(USE.wild);
    expect(g.tileCity[center]).toBe(-1);
  });
});
