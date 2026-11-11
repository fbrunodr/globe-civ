import { describe, it, expect } from 'vitest';
import { WORKER_CHARGES, REPAIR_TURNS, ROAD_MOVE, FORT_TURNS, FORT_DEFENSE, FIELD_HEAL, Game, HUMAN } from '../src/game.ts';
import { IMPROVEMENTS, IMPROVE_TURNS, USE } from '../src/cities.ts';

// Workers (Civ V's): they improve the land, a few turns on the tile, once
// their civ knows the improvement's first tech; a worked tile yields its
// terrain, and its improvement's on top once one is built.

const fresh = () => {
  const g = new Game({ size: 'small', seed: 5 });
  for (const p of g.players) p.isHuman = true;
  const c = g.foundCity(g.units.find((u) => u.owner === HUMAN && u.type === 'settler')!)!;
  // (A tile of its own to farm: flat open land, no resource.)
  const farm = g.tilesWithin(c.tile, 1).find((t) => t !== c.tile && g.tileCity[t] === c.id && !g.resources[t] && g.improvementAt(t) === 'farm');
  for (const u of g.units.filter((x) => x.tile === farm)) g.removeUnit(u);
  return { g, c, farm };
};
const turn = (g: Game) => { g.endTurn(); g.over = null; };

describe('K1: workers improve the land', () => {
  it('can\'t build an improvement before its civ knows its first tech', () => {
    const { g, farm } = fresh();
    if (farm === undefined) return;
    const w = g.createUnit('worker', HUMAN, farm);
    expect(g.improveBlock(w, farm)).toBe('Needs Pottery.');
    expect(g.improve(w)).toBe(false);
    g.players[HUMAN]!.techs.add('pottery');
    expect(g.improveBlock(w, farm)).toBeNull();
    // (Not on another civ's land, nor a soldier's work.)
    expect(g.improveBlock(g.createUnit('warrior', HUMAN, farm), farm)).not.toBeNull();
  });

  it('a worked tile yields its terrain; improved, its improvement\'s yield on top', () => {
    const { g, c, farm } = fresh();
    if (farm === undefined) return;
    c.growth = 1;
    expect(g.placeGrowth(c, { kind: 'rural', tile: farm, improvement: null })).toBe(true);
    const bare = g.tileOutput(farm);
    expect(bare.food + bare.prod + bare.gold).toBeGreaterThan(0);
    g.build(farm, 'farm');
    expect(g.tileOutput(farm).food).toBe(bare.food + IMPROVEMENTS.farm.bonus.food);
    // (Its techs add theirs: Pottery a food.)
    g.players[HUMAN]!.techs.add('pottery');
    expect(g.tileOutput(farm).food).toBe(bare.food + IMPROVEMENTS.farm.bonus.food + 1);
  });

  it('a worker on the tile builds it in its turns; walking off keeps the work done', () => {
    const { g, farm } = fresh();
    if (farm === undefined) return;
    g.players[HUMAN]!.techs.add('pottery');
    const w = g.createUnit('worker', HUMAN, farm);
    expect(g.improve(w)).toBe(true);
    expect(g.improveTurns(farm)).toBe(IMPROVE_TURNS.farm);
    turn(g);
    turn(g);
    expect(g.improveTurns(farm)).toBe(IMPROVE_TURNS.farm - 2);
    // (Away a turn: no progress, none lost.)
    w.work = null;
    turn(g);
    expect(g.improveTurns(farm)).toBe(IMPROVE_TURNS.farm - 2);
    expect(g.improve(w)).toBe(true);
    for (let i = 0; i < IMPROVE_TURNS.farm - 3; i++) turn(g);
    expect(g.builtAt(farm)).toBeNull();
    turn(g);
    expect(g.builtAt(farm)).toBe('farm');
    expect(w.work).toBeNull();
    expect(g.use[farm]).toBe(USE.wild); // (improved, not worked: a citizen works it)
  });
  it('a worker builds WORKER_CHARGES improvements; repairs and roads cost none', () => {
    const { g, farm } = fresh();
    if (farm === undefined) return;
    g.players[HUMAN]!.techs.add('pottery');
    const w = g.createUnit('worker', HUMAN, farm);
    expect(w.charges).toBe(WORKER_CHARGES);
    expect(g.improve(w)).toBe(true);
    for (let i = 0; i < IMPROVE_TURNS.farm; i++) turn(g);
    expect(g.builtAt(farm)).toBe('farm');
    expect(w.charges).toBe(WORKER_CHARGES - 1);
    // (Pillaged: it stays so until a worker mends it, at no charge, even with none left.)
    g.pillaged[farm] = 3;
    w.charges = 0;
    for (let i = 0; i < 5; i++) turn(g);
    expect(g.pillaged[farm]).toBe(3);
    w.moves = 1;
    expect(g.improve(w)).toBe(true);
    expect(w.job).toBe('repair');
    for (let i = 0; i < REPAIR_TURNS; i++) turn(g);
    expect(g.pillaged[farm]).toBe(0);
    expect(w.charges).toBe(0);
    // (And a road, as often as wanted; a step along roads costs ROAD_MOVE.)
    w.moves = 1;
    expect(g.buildRoad(w)).toBe(true);
    for (let i = g.roadTurns(farm); i > 0; i--) turn(g);
    expect(g.road[farm]).toBe(1);
    expect(g.roadBlock(w)).not.toBeNull();
    const next = g.tiles[farm]!.neighbors.find((n) => !g.isWater(n) && g.relief[n] !== 'mountains')!;
    g.road[next] = 1;
    expect(g.stepCost(w, farm, next)).toBe(ROAD_MOVE);
  });

  it('a fort: a charge, in the improvement\'s place; a unit in it defends stronger; healing only at home', () => {
    const { g, farm } = fresh();
    if (farm === undefined) return;
    g.players[HUMAN]!.techs.add('pottery');
    g.build(farm, 'farm');
    const w = g.createUnit('worker', HUMAN, farm);
    const open = g.defenseBonus(farm);
    expect(g.buildFort(w)).toBe(true);
    for (let i = 0; i < FORT_TURNS; i++) turn(g);
    expect(g.fort[farm]).toBe(1);
    expect(g.builtAt(farm)).toBeNull();
    expect(w.charges).toBe(WORKER_CHARGES - 1);
    expect(g.defenseBonus(farm)).toBeCloseTo(open + FORT_DEFENSE);
    expect(g.growthOptions(g.cities[0]!).some((o) => o.kind === 'rural' && o.tile === farm)).toBe(false);
    // (Hurt, a unit mends on its civ's land, not off it.)
    const s = g.createUnit('warrior', HUMAN, farm);
    s.hp = 50;
    turn(g);
    expect(s.hp).toBe(50 + FIELD_HEAL);
    const off = g.tiles.findIndex((t) => !g.isWater(t.id) && g.relief[t.id] !== 'mountains' && g.ownerOf(t.id) < 0 && !g.unitsAt(t.id).length);
    s.tile = off; s.hp = 50;
    turn(g);
    expect(s.hp).toBe(50);
  });
  it('a luxury counts for its civ only once its improvement is built', () => {
    const { g, c, farm } = fresh();
    if (farm === undefined) return;
    for (let t = 0; t < g.N; t++) if (g.tileCity[t] === c.id) g.resources[t] = null;
    g.resources[farm] = 'silk';
    g.players[HUMAN]!.techs.add('calendar');
    expect(g.improvementAt(farm)).toBe('plantation');
    expect(g.luxuriesOf(HUMAN)).toEqual([]);
    g.build(farm, 'plantation');
    expect(g.luxuriesOf(HUMAN)).toEqual(['silk']);
    // (Pillaged, it is cut off until repaired.)
    g.pillaged[farm] = 3;
    expect(g.luxuriesOf(HUMAN)).toEqual([]);
  });
});
