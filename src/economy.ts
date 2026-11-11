// A civ's upkeep, after Civ IV's maintenance: the price of being wide.
// Every city but the capital costs gold each turn:
//   distance   UPKEEP_PER_TILE for each tile it lies from the capital
//   count      UPKEEP_PER_CITY for each other city the civ has
// so each new city costs more than the last, and far ones more than near
// ones; and more as it grows (UPKEEP_PER_POP of it for each citizen). A
// Courthouse halves a city's upkeep, and some policies and governments cut
// it (effects.ts upkeep). All upkeep inflates as the game goes on
// (inflation: Civ IV's), so gold stays scarce in later eras. Buildings cost gold to keep too
// (the bigger, the more), in every city, the capital's included. Fighting units cost gold too
// beyond the free ones (a few, plus one per city). A treasury that would go
// below zero stays at zero, and what could not be paid is lost in
// proportion (arrearsOf): the share of the turn's upkeep left unpaid is the
// share of production, science and culture every city loses the next turn
// (up to ARREARS_MAX), and a unit deserts. So a city more than the civ can
// pay for always costs it something: there is no floor to expand under.
// Costs are fractional; the treasury keeps the fractions.

export const UPKEEP_PER_TILE = 0.25;
export const UPKEEP_PER_CITY = 0.5;
export const UPKEEP_PER_POP = 0.05;    // a share of the above per citizen
// All upkeep is multiplied by this: +1% every INFLATION_TURNS turns.
export const INFLATION_TURNS = 2.5;
export const inflation = (turn: number): number => 1 + turn / (100 * INFLATION_TURNS);
export const COURTHOUSE_CUT = 0.5;
export const FREE_UNITS = 2;           // and one per city
export const UNIT_UPKEEP_PER = 100;    // a unit's upkeep: a gold a turn per this much of its cost (as a building's)
export const ARREARS_MAX = 0.8;
// The share of its upkeep a civ could not pay: `short` gold of `bills`.
export const arrearsOf = (short: number, bills: number): number => Math.min(ARREARS_MAX, short / Math.max(1, bills));
// Production with nothing to build becomes gold at this rate.
export const WEALTH_RATE = 1 / 3;

// One city's upkeep: `dist` tiles from the capital, `others` other cities
// in the civ, `courthouse` whether it has one, `pct` the civ's upkeep
// bonus (negative: less).
export function cityUpkeep(dist: number, others: number, courthouse: boolean, pct: number, pop = 1): number {
  const base = (UPKEEP_PER_TILE * dist + UPKEEP_PER_CITY * others) * (1 + UPKEEP_PER_POP * (pop - 1));
  return Math.max(0, base * (courthouse ? COURTHOUSE_CUT : 1) * (1 + pct / 100));
}

// A building's upkeep: gold a turn, one per BUILDING_UPKEEP_PER production
// it cost, whole (the early, cheap ones cost nothing; a Factory 2).
export const BUILDING_UPKEEP_PER = 100;
export const buildingUpkeep = (cost: number): number => Math.floor(cost / BUILDING_UPKEEP_PER);

// Upkeep for fighting units: each by its cost (a tank is dearer to keep
// than a warrior), less the share of them that is free: FREE_UNITS + one
// per city (+ free from effects) of however many there are.
export const unitUpkeep = (costs: readonly number[], cities: number, extraFree: number): number => {
  const n = costs.length, free = FREE_UNITS + cities + extraFree;
  return n <= free ? 0 : (costs.reduce((a, b) => a + b, 0) / UNIT_UPKEEP_PER) * ((n - free) / n);
};
