// How dense a built-up tile is (town/geometry.ts DENSITIES), and so how
// many buildings it has room for. Pure: from the game state.
//   - A density is there once the civ has unlocked it (architecture.ts:
//     medium with the classical era, dense with the renaissance, ...).
//   - A low tile has one building slot, medium and denser two (the city
//     hall is not a slot). A tile with two buildings is never low.
//   - Until the player upgrades tiles by hand, a tile grows dense on its
//     own: the center from size 6, a busy urban tile (a specialist, or next
//     to the center) from size 8, as far as the civ has unlocked.

import type { Game } from './game.ts';
import { USE, SLOTS } from './cities.ts';
import { archEraOf, densestOf, unlocked } from './architecture.ts';
import type { Density } from './town/geometry.ts';

// The densest a tile's owner can build.
const densest = (g: Game, t: number): Density => densestOf(archEraOf(g.eraAt(t)));
const cap = (g: Game, t: number, d: Density): Density => (unlocked(archEraOf(g.eraAt(t)), d) ? d : densest(g, t));

// A tile's density by the rules.
export function tileDensity(g: Game, t: number): Density {
  const city = g.cityById.get(g.tileCity[t]!);
  if (!city) return 'low';
  const built = g.slotKeys(t).filter((k) => k !== null).length;
  let d: Density = 'low';
  if (g.use[t] === USE.center) d = city.pop >= 6 ? 'medium' : 'low';
  else if (built >= 2) d = 'medium';
  else {
    const busy = g.specialists[t]! > 0 || g.tiles[t].neighbors.some((n) => g.use[n] === USE.center);
    d = busy && city.pop >= 8 ? 'medium' : 'low';
  }
  return cap(g, t, d);
}

// A density asked for (the City Lab sets them by hand), as the tile can
// have it: never low with two buildings, never metropolitan on hills.
export function allowedDensity(g: Game, t: number, d: Density): Density {
  if (d === 'low' && g.slotKeys(t).filter((k) => k !== null).length >= 2) d = 'medium';
  if (d === 'metropolitan' && g.relief[t] === 'hills') d = 'high';
  return d;
}

// How many building slots a tile has: one when low, all of them denser.
export const openSlots = (g: Game, t: number): number => (tileDensity(g, t) === 'low' ? 1 : SLOTS);

