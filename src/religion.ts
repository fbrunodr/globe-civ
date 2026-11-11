import { out } from './cities.ts';
import type { Effect } from './effects.ts';

// Religions. Each is founded by the first civ in the world to adopt its
// faith, an identity trait of the Devotion path (identity.ts): Meditation
// founds Hinduism, and so on; a civ adopts one faith at most, so the rest
// stay open to others. The founder's
// capital becomes its holy city; from there it spreads to nearby cities,
// whoever owns them (game.ts spreadReligions), by pressure: every city
// that follows a religion presses it on the cities within PRESSURE_REACH
// tiles (the holy city, and Shrines and Temples, harder), and a city takes
// up the religion pressed on it hardest once that is strong enough.
//   founder   for the civ that founded it (tithes: gold from its followers)
//   follower  for each city following it, whoever owns it

export interface ReligionDef {
  readonly name: string;
  readonly color: string;
  readonly follower: readonly Effect[];
  readonly founder: string; // what the founder gets, described (game.ts applies it)
}

const follower = (o: Parameters<typeof out>[0]): Effect => ({ k: 'follower', o: out(o) });

export const RELIGIONS = {
  hinduism:     { name: 'Hinduism',     color: '#d9480f', follower: [follower({ food: 1, faith: 1 })], founder: '+1 gold per city following it, worldwide' },
  judaism:      { name: 'Judaism',      color: '#1c7ed6', follower: [follower({ science: 1, faith: 1 })], founder: '+1 gold per city following it, worldwide' },
  buddhism:     { name: 'Buddhism',     color: '#f59f00', follower: [follower({ culture: 1, faith: 1 })], founder: '+1 gold per city following it, worldwide' },
  taoism:       { name: 'Taoism',       color: '#495057', follower: [follower({ food: 1, culture: 1 })], founder: '+1 gold per city following it, worldwide' },
  confucianism: { name: 'Confucianism', color: '#2b8a3e', follower: [follower({ science: 1, culture: 1 })], founder: '+1 gold per city following it, worldwide' },
  christianity: { name: 'Christianity', color: '#7048e8', follower: [follower({ prod: 1, faith: 1 })], founder: '+1 gold per city following it, worldwide' },
  islam:        { name: 'Islam',        color: '#0b7285', follower: [follower({ gold: 1, science: 1 })], founder: '+1 gold per city following it, worldwide' },
} satisfies Record<string, ReligionDef>;
export type ReligionKey = keyof typeof RELIGIONS;
export const RELIGION_KEYS = Object.keys(RELIGIONS) as ReligionKey[];
export const religionDef = (k: ReligionKey): ReligionDef => RELIGIONS[k];

// Faith binds and divides (game.ts faiths, cityYields). A civ's faith is
// the religion it founded, or else the one more than half of its cities
// follow; a civ with neither is outside all of this.
//   pilgrims  while a civ is at peace with every other civ of its faith
//             (and knows one at least), each of its cities following it
//             earns PILGRIM_GOLD: a war among the faithful ends it for both
//   strife    while it is at war with a civ of its own faith, its cities
//             of that faith make FAITH_STRIFE less cohesion
//   creeds    a city that follows another religion than its civ's faith
//             makes FAITH_STRIFE less cohesion: a rival's holy city
//             pressing on its border costs it, and its own Shrines and
//             Temples, or taking that holy city, are the cure
// So peace within a faith pays, rival faiths have a standing quarrel, and
// the faithless are left alone: by what each gains and loses, not by any
// liking written into the computer's civs.
export const PILGRIM_GOLD = 1;
export const FAITH_STRIFE = 0.25;

// Spreading.
export const PRESSURE_REACH = 6;        // tiles
export const HOLY_PRESSURE = 6;         // from the holy city
export const CITY_PRESSURE = 2;         // from every other city following it
export const BUILDING_PRESSURE = 1;     // more from a city with a Shrine, and a Temple
export const CONVERT_AT = 4;            // pressure a city needs to take a religion up
export const TITHE = 1;                 // gold to the founder per city following it
