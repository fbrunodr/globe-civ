import { describe, it, expect } from 'vitest';
import { Game, COMMANDER_CAPACITY, slotOf, type Unit } from '../src/game.ts';

// One unit per tile, and commanders' armies (game.ts).

// A game with no units, every player flagged human (no AI moves), and a
// patch of open land: a tile with six land neighbours, each with six too.
function setup(): { g: Game; t: number } {
  const g = new Game({ size: 'small', seed: 5 });
  for (const p of g.players) p.isHuman = true;
  for (const u of [...g.units]) g.removeUnit(u);
  const open = (x: number) => !g.isWater(x) && g.relief[x] !== 'mountains' && !g.cityByTile.has(x);
  const t = g.tiles.findIndex((tile) => open(tile.id) && tile.neighbors.every((n) => open(n) && g.tiles[n].neighbors.every(open)));
  return { g, t };
}
const standing = (g: Game, t: number, owner: number) => g.unitsAt(t).filter((u) => u.owner === owner);

describe('U1: one unit per tile', () => {
  it('a new unit on a taken tile is put on the nearest free one', () => {
    const { g, t } = setup();
    const a = g.createUnit('warrior', 0, t), b = g.createUnit('spearman', 0, t);
    expect(a.tile).toBe(t);
    expect(b.tile).not.toBe(t);
    expect(g.tiles[t].neighbors).toContain(b.tile);
  });
  it('a civilian shares a tile with a military unit, not with another civilian', () => {
    const { g, t } = setup();
    g.createUnit('warrior', 0, t);
    const s = g.createUnit('settler', 0, t), s2 = g.createUnit('settler', 0, t);
    expect(s.tile).toBe(t);
    expect(s2.tile).not.toBe(t);
  });
  it('no player ever has two units of a slot on a tile, whatever is made where', () => {
    const { g, t } = setup();
    for (let i = 0; i < 12; i++) g.createUnit(i % 3 ? 'warrior' : 'settler', 0, t);
    const seen = new Set<string>();
    for (const u of g.units) {
      const k = `${u.tile}|${slotOf(u.type)}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  });
  it('a unit cannot be sent onto a tile its side holds, but swaps with a unit next to it', () => {
    const { g, t } = setup();
    const a = g.createUnit('warrior', 0, t), nb = g.tiles[t].neighbors[0]!;
    const b = g.createUnit('archer', 0, nb);
    const far = g.tiles[nb].neighbors.find((x) => x !== t && !g.tiles[t].neighbors.includes(x))!;
    const c = g.createUnit('spearman', 0, far);
    expect(g.findPath(a, far)).toBeNull(); // (held by c, two tiles away)
    g.goTo(a, nb);
    expect(a.tile).toBe(nb);
    expect(b.tile).toBe(t);
    expect(c.tile).toBe(far);
  });
  it('paths go round tiles the side holds', () => {
    const { g, t } = setup();
    const a = g.createUnit('warrior', 0, t);
    for (const n of g.tiles[t].neighbors.slice(0, 3)) g.createUnit('spearman', 0, n);
    const goal = g.tilesWithin(t, 2).find((x) => g.approxDist(x, t) > 1.5 && !g.unitsAt(x).length && !g.isWater(x))!;
    const path = g.findPath(a, goal);
    expect(path).not.toBeNull();
    for (const x of path!.slice(0, -1)) expect(standing(g, x, 0).length).toBe(0);
  });
});

describe('U2: commanders', () => {
  function army(): { g: Game; t: number; c: Unit; units: Unit[] } {
    const { g, t } = setup();
    const c = g.createUnit('commander', 0, t);
    const units = g.tiles[t].neighbors.slice(0, 5).map((n, i) => g.createUnit((['warrior', 'spearman', 'archer', 'horseman', 'warrior'] as const)[i]!, 0, n));
    return { g, t, c, units };
  }
  it('rallies the units next to it, up to its capacity; they leave the map', () => {
    const { g, c, units } = army();
    expect(g.rally(c)).toBe(COMMANDER_CAPACITY);
    expect(g.armyOf(c).length).toBe(COMMANDER_CAPACITY);
    for (const u of g.armyOf(c)) { expect(u.tile).toBe(c.tile); expect(g.unitsAt(c.tile)).not.toContain(u); }
    expect(units.filter((u) => u.packedIn === null).length).toBe(units.length - COMMANDER_CAPACITY);
  });
  it('takes the civilian slot: a fighting unit shares its tile, a settler does not; it deploys there too', () => {
    const { g, t } = setup();
    const c = g.createUnit('commander', 0, t), w = g.createUnit('warrior', 0, t), s = g.createUnit('settler', 0, t);
    expect(w.tile).toBe(t);
    expect(s.tile).not.toBe(t);
    expect(g.rally(c)).toBe(1);
    expect(g.deploy(c)).toBe(1);
    expect(w.tile).toBe(t);
  });
  it('rallies neither enemies, nor other commanders, nor units further away', () => {
    const { g, t } = setup();
    const c = g.createUnit('commander', 0, t), [n0, n1, n2] = g.tiles[t].neighbors as [number, number, number];
    g.createUnit('warrior', 1, n0);
    g.createUnit('commander', 0, n1);
    g.createUnit('warrior', 0, g.tiles[n2].neighbors.find((x) => x !== t && !g.tiles[t].neighbors.includes(x))!);
    expect(g.rally(c)).toBe(0);
  });
  it('its army marches with it, then deploys on and round its tile', () => {
    const { g, c } = army();
    g.rally(c);
    const goal = g.tilesWithin(c.tile, 2).find((x) => g.approxDist(x, c.tile) > 1.5 && !g.isWater(x) && !g.unitsAt(x).length && g.relief[x] === 'flat')!;
    c.moves = 4;
    g.goTo(c, goal);
    for (const u of g.armyOf(c)) expect(u.tile).toBe(c.tile);
    const n = g.deploy(c);
    expect(n).toBeGreaterThan(0);
    // (One on the commander's own tile, the rest round it.)
    for (const u of g.units.filter((u) => u.owner === 0 && u.type !== 'commander' && u.packedIn === null && g.approxDist(u.tile, c.tile) < 1.5)) {
      expect([c.tile, ...g.tiles[c.tile].neighbors]).toContain(u.tile);
    }
    expect(g.unitsAt(c.tile).some((u) => u.type !== 'commander')).toBe(true);
  });
  it('its army defends it; if it falls, its army is lost with it', () => {
    const { g, c } = army();
    g.rally(c);
    const d = g.bestDefender(c.tile, 1);
    expect(d).not.toBeNull();
    expect(d!.type).not.toBe('commander'); // (a spearman defends better)
    const packed = g.armyOf(c);
    g.removeUnit(c);
    for (const u of packed) expect(u.dead).toBe(true);
  });
});
