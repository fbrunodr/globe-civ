import { out } from './cities.ts';
import type { Effect } from './effects.ts';

// Religions. Each is founded by the first civ in the world to adopt its
// faith, an identity trait of the Devotion path (identity.ts): Meditation
// founds Hinduism, and so on; a civ adopts one faith at most, so the rest
// stay open to others. The founder's
// capital becomes its holy city; from there it spreads to nearby cities,
// whoever owns them (game.ts spreadReligions), by pressure (and further by missionaries: below): every city
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

// A civ's religion (game.ts faithOf): the one it founded; else the one
// more than half of its people follow; else none. Anyone who has met it
// knows it (the Diplomacy sheet).
//
// Faith in war (game.ts faithEdge), by the two civs' religions:
//   the same       the attacker FAITH_SAME weaker (a bad conscience)
//   another        FAITH_RIVAL stronger (zeal)
//   either none    nothing
// And a war on a civ of its own religion troubles its people: its cities
// that follow it make less cohesion while it lasts, the more such wars it
// is in at once (HOLY_STRIFE: one, two, three and over). A price, not a
// ban. So a faith spread to one's neighbours is a shield, an army of
// another creed fights the harder, and the faithless are left out of it.
export const FAITH_SAME = 0.25;
export const FAITH_RIVAL = 0.2;
export const HOLY_STRIFE = [0, 0.25, 0.4, 0.5] as const;

// What faith buys (game.ts): a Shrine or a Temple; for a civ with a
// religion, a fighting unit; and, for the founder of a religion, a
// missionary (MISSIONARY_FAITH, raised in a city of its own that follows
// it). A missionary goes where it is sent, over land and sea, and
// preaches in a city it stands in or beside: the city takes up the
// religion (CONVERT_PER_POP faith a citizen), and keeps to it for
// DEVOUT_TURNS whatever presses on it or is preached to it; the
// missionary is spent. Not in another religion's holy city.
export const MISSIONARY_FAITH = 30, CONVERT_PER_POP = 15;
export const DEVOUT_TURNS = 15;
// A religion presses on the cities near those that follow it (spreadReligions); missionaries carry it further.
export const PRESSURE_REACH = 4;        // tiles
export const HOLY_PRESSURE = 6;         // from the holy city
export const CITY_PRESSURE = 2;         // from every other city following it
export const BUILDING_PRESSURE = 1;     // more from a city with a Shrine, and a Temple
export const CONVERT_AT = 4;            // pressure a city needs to take a religion up
export const TITHE = 1;                 // gold to the founder per city following it
