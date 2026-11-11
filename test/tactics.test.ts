// The fronts (src/aiTactics.ts): staged sieges, played by the computer's
// army against a garrison that only holds.
import { describe, it, expect } from 'vitest';
import { Game, type City } from '../src/game.ts';
import { militaryPhase } from '../src/aiMilitary.ts';
import { BASE } from '../src/aiPolicy.ts';
import { isShooter, canShoot } from '../src/unitClasses.ts';
import type { UnitKey } from '../src/rules.ts';

// A city of civ 1 six tiles from civ 0's, garrisoned; civ 0's army four tiles from it. Played `turns` turns.
function siege(garrison: UnitKey, army: UnitKey[], turns: number, each?: (g: Game, city: City) => void): { taken: boolean; turn: number; lost: number } {
  const g = new Game({ size: 'small', seed: 5 });
  for (const p of g.players) p.isHuman = true;
  const home = g.foundCity(g.units.find((u) => u.owner === 0 && u.type === 'settler')!)!;
  const land = (t: number) => !g.isWater(t) && g.relief[t] !== 'mountains';
  const spot = [...g.tilesWithinMap(home.tile, 7)].filter(([t, d]) => d === 6 && land(t) && g.tiles[t]!.neighbors.filter(land).length >= 5)[0]![0];
  const city = g.foundCity(g.createUnit('settler', 1, spot))!;
  g.declareWar(0, 1);
  (g.known[0] as unknown as Uint8Array).fill(1);
  g.createUnit('warrior', 0, home.tile);
  g.createUnit(garrison, 1, spot).fortified = true;
  const mid = [...g.tilesWithinMap(spot, 4)].filter(([t, d]) => d === 4 && land(t)).map(([t]) => t).sort((a, b) => g.approxDist(a, home.tile) - g.approxDist(b, home.tile));
  const units = army.map((k, i) => g.createUnit(k, 0, mid[i]!));
  let turn = 1;
  for (; turn <= turns && city.owner === 1; turn++) {
    militaryPhase(g, g.players[0]!, BASE, g.cities.filter((c) => c.owner === 0));
    each?.(g, city);
    g.endTurn(); g.over = null;
  }
  return { taken: city.owner === 0, turn, lost: units.filter((u) => u.dead).length };
}

describe('T1: a front fought together', () => {
  it('blades that can bring a garrison down strike it in the same turn, and take the city', () => {
    const r = siege('warrior', ['warrior', 'warrior', 'warrior', 'warrior'], 14);
    expect(r.taken).toBe(true);
  });
  it('with shooters, the blades hold beside the city while it is worn down; no shooter ends its turn next to it', () => {
    const r = siege('spearman', ['warrior', 'warrior', 'warrior', 'archer', 'archer'], 16, (g, city) => {
      for (const u of g.units) if (u.owner === 0 && canShoot(u.type) && isShooter(u.type)) expect(g.tiles[city.tile]!.neighbors.includes(u.tile)).toBe(false);
    });
    expect(r.taken).toBe(true);
    expect(r.lost).toBe(0);
  });
});
