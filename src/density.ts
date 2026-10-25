// How dense a built-up tile is (town/geometry.ts DENSITIES), and so how
// many buildings it has room for. Pure: from the game state.
//   - A density is there once the civ has unlocked it (architecture.ts:
//     medium with the classical era, dense with the renaissance, ...).
//   - A tile has a building slot per building spot of its density (one
//     low, two medium or dense, three high or metropolitan: town/geometry.ts
//     SPOTS; the city hall is not a slot). So a tile with two buildings is
//     never low, and one with three at least high.
//   - Until the player upgrades tiles by hand, a tile grows dense on its
//     own: the center from size 6, a busy urban tile (a specialist, or next
//     to the center) from size 8, as far as the civ has unlocked.

import type { Game } from './game.ts';
import { USE } from './cities.ts';
import { archEraOf, densestOf, unlocked } from './architecture.ts';
import { DENSITIES, SPOTS, type Density } from './town/geometry.ts';

// The least dense a tile with this many buildings can be.
const roomFor = (built: number): Density => DENSITIES.find((d) => SPOTS[d] >= built) ?? 'metropolitan';
const denser = (a: Density, b: Density): Density => (DENSITIES.indexOf(a) >= DENSITIES.indexOf(b) ? a : b);

// The densest a tile's owner can build.
const densest = (g: Game, t: number): Density => densestOf(archEraOf(g.eraAt(t)));
const cap = (g: Game, t: number, d: Density): Density => (unlocked(archEraOf(g.eraAt(t)), d) ? d : densest(g, t));

// A tile's density by the rules.
function tileDensity(g: Game, t: number): Density {
  const city = g.cityById.get(g.tileCity[t]!);
  if (!city) return 'low';
  const built = g.slotKeys(t).filter((k) => k !== null).length;
  let d: Density = 'low';
  if (g.use[t] === USE.center) d = city.pop >= 6 ? 'medium' : 'low';
  else {
    const busy = g.specialists[t]! > 0 || g.tiles[t].neighbors.some((n) => g.use[n] === USE.center);
    d = busy && city.pop >= 8 ? 'medium' : 'low';
  }
  return cap(g, t, denser(d, roomFor(built)));
}

// How many building slots a tile has: one per building spot of its density.
export const openSlots = (g: Game, t: number): number => SPOTS[tileDensity(g, t)];

