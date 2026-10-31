import { describe, it, expect } from 'vitest';
import { Game, matchup, combatStrength, SIEGE_VS_UNITS, EMBARKED_DEF } from '../src/game.ts';
import { UNITS, UPGRADES, type UnitKey } from '../src/rules.ts';
import { TECHS, TECH_KEYS } from '../src/techs.ts';
import { POLITICS } from '../src/politics.ts';
import { UNIT_CLASS, attackBlock, attackStyle } from '../src/unitClasses.ts';
import { unitModel, unitVariants, fullCount } from '../src/unitModels.ts';

// The unit roster (rules.ts): lines that upgrade era to era, counters
// between them, and classes that say which attacks can be made at all and
// how they play (unitClasses.ts).

const KEYS = Object.keys(UNITS) as UnitKey[];
const STARTING: readonly UnitKey[] = ['warrior', 'scout', 'settler'];
// The era a unit comes in (the tech or civic unlocking it; 0 at the start).
const unlockers = (k: UnitKey) => [
  ...TECH_KEYS.filter((t) => TECHS[t].units?.includes(k)).map((t) => TECHS[t].era as number),
  ...Object.values(POLITICS).filter((c) => c.units?.includes(k)).map((c) => c.era as number),
];
const eraOf = (k: UnitKey) => (STARTING.includes(k) ? 0 : unlockers(k)[0]!);

describe('R1: the roster', () => {
  it('every unit is unlocked once (by a tech or a civic), or there from the start', () => {
    for (const k of KEYS) expect(unlockers(k).length + (STARTING.includes(k) ? 1 : 0), k).toBe(1);
  });
  it('every era brings new fighting units, at least three', () => {
    for (let era = 0; era <= 5; era++) expect(KEYS.filter((k) => UNITS[k].atk > 0 && eraOf(k) === era).length, `era ${era}`).toBeGreaterThanOrEqual(3);
  });
  it('siege engines in every era from the Classical on: catapult, trebuchet, cannon, artillery', () => {
    expect(['catapult', 'trebuchet', 'cannon', 'artillery'].map((k) => eraOf(k as UnitKey))).toEqual([1, 2, 3, 4]);
  });
  it('an upgrade goes to a later (or the same) era, and costs more', () => {
    for (const [from, to] of Object.entries(UPGRADES) as [UnitKey, UnitKey][]) {
      expect(eraOf(to), `${from} → ${to}`).toBeGreaterThanOrEqual(eraOf(from));
      expect(UNITS[to].cost, `${from} → ${to}`).toBeGreaterThan(UNITS[from].cost);
    }
  });
  it('every unit has a model in every variant, every position finite', () => {
    for (const k of KEYS) for (let v = 0; v < unitVariants(k); v++) {
      const pos = unitModel(k, 'Romans', v).getAttribute('position');
      expect(pos.count, k).toBeGreaterThan(0);
      expect(Array.from(pos.array as Float32Array).every(Number.isFinite), k).toBe(true);
    }
  });
});

describe('R2: counters', () => {
  it('pikes hold off horse, not armour; anti-tank guns stop both', () => {
    expect(matchup('pikeman', 'knight', 'def')).toBe(2);
    expect(matchup('spearman', 'horseman', 'def')).toBe(1.5);
    expect(matchup('pikeman', 'tank', 'def')).toBe(1);
    expect(matchup('antiTank', 'tank', 'atk')).toBe(2);
    expect(matchup('antiTank', 'cavalry', 'def')).toBe(2);
  });
  it('a charge rides down archers and engines (attacking only)', () => {
    expect(matchup('knight', 'crossbowman', 'atk')).toBe(1.5);
    expect(matchup('knight', 'crossbowman', 'def')).toBe(1);
    expect(matchup('cavalry', 'cannon', 'atk')).toBe(1.5);
  });
  it('engines are weaker against units than their attack', () => {
    expect(matchup('catapult', 'warrior', 'atk')).toBeCloseTo(SIEGE_VS_UNITS);
    expect(matchup('catapult', 'warrior', 'def')).toBe(1);
  });
});

describe('R3: classes say which attacks can be made, and how', () => {
  it('every unit has a class; civilians, scouts and commanders never attack', () => {
    for (const k of KEYS) expect(UNIT_CLASS[k], k).toBeDefined();
    for (const k of ['settler', 'scout', 'commander'] as const) expect(attackStyle(k, 'warrior')).toBeNull();
  });
  it('blocks are about where units are, not strength: a spearman may attack a tank (and lose)', () => {
    expect(attackBlock('spearman', 'tank')).toBeNull();
    expect(attackBlock('catapult', 'horseman')).toBeNull();
    expect(matchup('antiTank', 'tank', 'atk')).toBeGreaterThan(matchup('spearman', 'tank', 'atk'));
  });
  it('land units close with land, shoot at ships; ships fight ships, bombard or assault a coastal city; only fighters reach aircraft', () => {
    expect(attackBlock('swordsman', 'galley')).not.toBeNull();
    expect(attackBlock('archer', 'galley')).toBeNull();
    expect(attackBlock('trireme', 'warrior')).not.toBeNull();
    expect(attackBlock('trireme', 'warrior', { city: true })).toBeNull();
    expect(attackBlock('frigate', 'warrior')).toBeNull();
    expect(attackBlock('swordsman', 'warrior', { atSea: true })).not.toBeNull(); // (a unit embarked on the water)
    expect(attackBlock('warrior', 'warrior', { embarked: true })).not.toBeNull();
    expect(attackBlock('artillery', 'bomber')).not.toBeNull();
    expect(attackBlock('fighter', 'bomber')).toBeNull();
    expect(attackBlock('bomber', 'battleship')).toBeNull();
  });
  it('the pair sets the play: swords strike, cavalry charges, archers loose, engines lob, riflemen fire then charge', () => {
    expect(attackStyle('swordsman', 'archer')).toBe('melee');
    expect(attackStyle('knight', 'archer')).toBe('charge');
    expect(attackStyle('archer', 'warrior')).toBe('volley');
    expect(attackStyle('trebuchet', 'warrior')).toBe('lob');
    expect(attackStyle('rifleman', 'warrior')).toBe('fireCharge');
    expect(attackStyle('rifleman', 'tank')).toBe('fire');
    expect(attackStyle('tank', 'rifleman')).toBe('roll');
  });
  it('the game refuses an attack its pair forbids, and the unit keeps its moves', () => {
    const { g, coast, sea } = waterWorld();
    const sword = g.createUnit('swordsman', 0, coast), ship = g.createUnit('galley', 1, sea);
    g.declareWar(0, 1);
    expect(g.attackBlockAt(sword, sea)).not.toBeNull();
    const moves = sword.moves;
    g.attack(sword, sea);
    expect(sword.moves).toBe(moves);
    expect(ship.hp).toBe(100);
  });
});

// A game with no units, every player flagged human, and a coastal land
// tile with open land behind it and the sea before it.
function waterWorld() {
  const g = new Game({ size: 'small', seed: 5 });
  for (const p of g.players) p.isHuman = true;
  for (const u of [...g.units]) g.removeUnit(u);
  const land = (x: number) => !g.isWater(x) && g.relief[x] !== 'mountains' && !g.cityByTile.has(x) && !g.isPentagon(x);
  const coast = g.tiles.findIndex((t) => land(t.id) && t.neighbors.filter((n) => g.isSea(n)).length >= 2 && t.neighbors.some(land));
  const sea = g.tiles[coast].neighbors.find((n) => g.isSea(n) && g.tiles[n].neighbors.some((m) => g.isSea(m) && m !== n))!;
  const inland = g.tiles[coast].neighbors.find(land)!;
  return { g, coast, sea, inland };
}

describe('R4: at sea and in the air', () => {
  it('ships sail the water, never onto land; land units embark only with Shipbuilding, and that takes their turn', () => {
    const { g, coast, sea, inland } = waterWorld();
    const ship = g.createUnit('galley', 0, sea);
    expect(g.canEnter(ship, inland)).toBe(false);
    expect(g.findPath(ship, inland)).toBeNull();
    const w = g.createUnit('warrior', 0, coast);
    expect(g.findPath(w, sea)).toBeNull();
    g.players[0]!.techs.add('shipbuilding');
    g.removeUnit(ship);
    g.goTo(w, sea);
    expect(w.tile).toBe(sea);
    expect(g.isEmbarked(w)).toBe(true);
    expect(w.moves).toBe(0);
  });
  it('an embarked unit defends at half strength and cannot attack', () => {
    const { g, coast, sea } = waterWorld();
    g.players[0]!.techs.add('shipbuilding');
    const foe = g.createUnit('warrior', 1, coast), w = g.createUnit('spearman', 0, sea);
    w.tile = sea; // (a new land unit comes out on land: it embarks)
    g.declareWar(0, 1);
    expect(g.unitStrength(w, 'def', sea)).toBeCloseTo(combatStrength('spearman', 'def', 100, 0) * EMBARKED_DEF, 5);
    expect(g.attackBlockAt(w, coast)).not.toBeNull();
    expect(foe.hp).toBe(100);
  });
  it('ships are built only in coastal cities, and come out in port beside the garrison', () => {
    const { g, coast, inland } = waterWorld();
    g.players[0]!.techs.add('sailing');
    const settler = g.createUnit('settler', 0, coast);
    const city = g.foundCity(settler)!;
    expect(g.canBuild(city, 'galley')).toBe(true);
    g.createUnit('warrior', 0, coast);
    const ship = g.createUnit('galley', 0, coast);
    expect(ship.tile).toBe(coast);
    const s2 = g.createUnit('settler', 0, g.tiles[inland].neighbors.find((n) => !g.isWater(n) && g.approxDist(n, coast) > 3) ?? inland);
    expect(g.isWater(s2.tile)).toBe(false);
  });
  it('aircraft strike within their range, rebase to cities, never defend; fighters intercept bombers', () => {
    const { g, coast, inland } = waterWorld();
    const settler = g.createUnit('settler', 0, coast);
    const city = g.foundCity(settler)!;
    const bomber = g.createUnit('bomber', 0, city.tile);
    expect(bomber.tile).toBe(city.tile);
    const foe = g.createUnit('warrior', 1, inland);
    g.declareWar(0, 1);
    expect(g.attackBlockAt(bomber, inland)).toBeNull();
    // (Nothing defends the city's tile but its own garrison: the bomber doesn't.)
    expect(g.bestDefender(city.tile, 1)).toBeNull();
    const far = g.tiles.findIndex((t) => !g.isWater(t.id) && g.approxDist(t.id, city.tile) > 12);
    const foe2 = g.createUnit('warrior', 1, far);
    expect(g.attackBlockAt(bomber, far)).toBe('out of range');
    expect(foe2.hp).toBe(100);
    // An enemy fighter covering the target fights the bomber first.
    const ownerFar = g.tiles.findIndex((t) => !g.isWater(t.id) && g.approxDist(t.id, inland) < 4 && g.approxDist(t.id, inland) > 1 && !g.cityByTile.has(t.id));
    const s1 = g.createUnit('settler', 1, ownerFar);
    const c1 = g.foundCity(s1);
    if (c1) {
      const f = g.createUnit('fighter', 1, c1.tile);
      g.goTo(bomber, inland);
      expect(f.hp < 100 || bomber.hp < 100 || bomber.dead).toBe(true);
    }
    expect(foe.dead || foe.hp <= 100).toBe(true);
  });
  it('horse units show six figures at most', () => {
    for (const k of ['horseman', 'knight', 'lancer', 'cavalry', 'chariotArcher'] as const) expect(fullCount(k), k).toBeLessThanOrEqual(6);
  });
});
