import { describe, it, expect } from 'vitest';
import { Game, PILLAGE_GOLD, PILLAGE_REPAIR, type City } from '../src/game.ts';
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

describe('WR1: a city falls only when its walls are down and a melee unit enters', () => {
  it('archers wear it down but never take it', () => {
    const { g, city, nb } = setup();
    for (let i = 0; i < 20; i++) {
      const a = g.createUnit('archer', 1, nb);
      g.attack(a, city.tile);
      if (!a.dead) g.removeUnit(a);
    }
    expect(city.owner).toBe(0);
    expect(city.hp).toBe(0);
  });

  it('a melee unit takes it at 0 HP, not before', () => {
    const { g, city, nb } = setup();
    let captured = false;
    for (let i = 0; i < 30 && !captured; i++) {
      const hpBefore = city.hp;
      const h = g.createUnit('horseman', 1, nb);
      g.attack(h, city.tile);
      captured = city.owner === 1;
      // Taking it needs the walls down before the attack, and the attacker moves in.
      if (captured) {
        expect(hpBefore).toBe(0);
        expect(h.tile).toBe(city.tile);
      } else if (!h.dead) { expect(h.tile).toBe(nb); g.removeUnit(h); }
    }
    expect(captured).toBe(true);
  });
});

describe('WR2: pillage and repair', () => {
  it('a pillaged rural tile yields nothing until repaired; the raider takes gold', () => {
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
    const before = g.tileOutput(farm);
    expect(before.food + before.prod + before.gold).toBeGreaterThan(0);
    const raider = g.createUnit('warrior', 1, farm);
    const gold = g.players[1]!.gold;
    expect(g.pillage(raider)).toBe(true);
    expect(g.players[1]!.gold).toBe(gold + PILLAGE_GOLD);
    const burnt = g.tileOutput(farm);
    expect(burnt.food + burnt.prod + burnt.gold).toBe(0);
    // No repair while the raider stands there.
    turn(g);
    expect(g.pillaged[farm]).toBe(PILLAGE_REPAIR);
    g.removeUnit(raider);
    for (let i = 0; i < PILLAGE_REPAIR; i++) turn(g);
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
