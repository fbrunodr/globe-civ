import { describe, it, expect } from 'vitest';
import { Game } from '../src/game.ts';

// Ranged attacks: how far a unit shoots (rules.ts reach), its shots paying
// for the tiles they cross (hills and woods 2, mountains blocking), one
// more from hills; and fire is never answered.

// An empty small world (every player flagged human: no AI moves), and a
// way to set a tile's ground.
function world(): Game {
  const g = new Game({ size: 'small', seed: 7 });
  for (const p of g.players) p.isHuman = true;
  for (const u of [...g.units]) g.removeUnit(u);
  return g;
}
// (A unit stood exactly there: createUnit finds it a free tile near.)
const put = (g: Game, type: Parameters<Game['createUnit']>[0], owner: number, t: number) => { const u = g.createUnit(type, owner, t); u.tile = t; return u; };
const flatten = (g: Game, ts: readonly number[]) => { for (const t of ts) { g.relief[t] = 'flat'; g.feature[t] = null; g.biome[t] = 'prairie'; } };
// Three land tiles in a row a, b, c (b next to a, c next to b, not to a), and the land round them.
function line(g: Game): [number, number, number] {
  for (const tile of g.tiles) {
    const a = tile.id;
    if (g.isWater(a)) continue;
    for (const b of tile.neighbors) for (const c of g.tiles[b]!.neighbors) {
      if (c === a || g.tiles[a]!.neighbors.includes(c)) continue;
      const all = [a, b, c, ...tile.neighbors, ...g.tiles[b]!.neighbors, ...g.tiles[c]!.neighbors];
      if (all.some((t) => g.isWater(t))) continue;
      flatten(g, all);
      return [a, b, c];
    }
  }
  throw new Error('no line of land');
}

describe('RG: reach', () => {
  it('an archer (reach 2) shoots two tiles over open ground, a slinger (reach 1) only next to it', () => {
    const g = world(), [a, , c] = line(g);
    expect(g.fireReach(put(g, 'archer', 0, a)).has(c)).toBe(true);
    const s = put(g, 'slinger', 0, a);
    expect(g.fireReach(s).has(c)).toBe(false);
    expect(g.fireReach(s).has(g.tiles[a]!.neighbors[0]!)).toBe(true);
  });
  it('woods or hills in between eat its reach; mountains block it', () => {
    for (const ground of ['forest', 'hills', 'mountains'] as const) {
      const g = world(), [a, b, c] = line(g);
      if (ground === 'forest') g.biome[b] = 'temperateForest'; else g.relief[b] = ground;
      // (Only b in the way: the other ways round to c through open tiles cost as much as through b.)
      const archer = put(g, 'archer', 0, a);
      const through = [...g.tiles[a]!.neighbors].filter((n) => g.tiles[c]!.neighbors.includes(n));
      for (const t of through) if (ground === 'forest') g.biome[t] = 'temperateForest'; else g.relief[t] = ground;
      expect(g.fireReach(archer).has(c), ground).toBe(false);
      // (The tile next to it is in reach whatever it is.)
      expect(g.fireReach(archer).has(b), ground).toBe(true);
    }
  });
  it('from hills it reaches one tile further', () => {
    const g = world(), [a, , c] = line(g);
    const s = put(g, 'slinger', 0, a);
    expect(g.fireReach(s).has(c)).toBe(false);
    g.relief[a] = 'hills';
    expect(g.fireReach(s).has(c)).toBe(true);
  });
  it('it shoots from where it stands at an enemy within reach, unanswered, and stays put', () => {
    const g = world(), [a, , c] = line(g);
    const archer = put(g, 'archer', 0, a), foe = g.createUnit('warrior', 1, c);
    archer.tile = a; foe.tile = c;
    g.declareWar(0, 1);
    g.goTo(archer, c);
    expect(archer.tile).toBe(a);
    expect(archer.hp).toBe(100);
    expect(archer.moves).toBe(0);
    expect(foe.hp).toBeLessThanOrEqual(100);
  });
  it('closing in is a fight both ways, and the attacker moves in if it wins', () => {
    const g = world(), [a, b] = line(g);
    const rifle = put(g, 'rifleman', 0, a), foe = put(g, 'warrior', 1, b);
    g.declareWar(0, 1);
    g.attack(rifle, b, 'melee');
    expect(foe.dead).toBe(true);
    expect(rifle.tile).toBe(b);
  });
});
