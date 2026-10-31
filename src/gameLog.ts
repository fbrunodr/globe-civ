// The game's record of everything every player does, human and computer,
// turn by turn, for studying games afterwards (balance, the AI). Each event
// is one line of data: the turn, who, what, and its details. The game keeps
// them in memory (Game.events); in development main.ts sends each turn's to
// the dev server, which appends them to logs/<game>.jsonl (vite.config.ts),
// and the page can download them all.

export type GameEventKind =
  | 'start' | 'turn' | 'summary'
  | 'research' | 'researched' | 'politics' | 'politicsDone' | 'trait' | 'government' | 'policies'
  | 'religionFounded' | 'converted'
  | 'cityFounded' | 'cityGrew' | 'cityCaptured' | 'cityDestroyed' | 'tileBought' | 'tileFlipped'
  | 'build' | 'built' | 'bought'
  | 'unitCreated' | 'move' | 'attack' | 'unitLost' | 'rally' | 'deploy' | 'pillage' | 'raze' | 'upgrade'
  | 'war' | 'peace' | 'peaceOffered' | 'shortfall';

export interface GameEvent {
  readonly turn: number;
  readonly player: number;   // -1: the world
  readonly kind: GameEventKind;
  readonly data: Readonly<Record<string, unknown>>;
}

// A game's id for its log: its map and seed, and when it started.
export const gameLogId = (size: string, seed: number): string =>
  `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${size}_${seed}`;
