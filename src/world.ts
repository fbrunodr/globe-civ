import { buildGoldberg, type Globe } from './goldberg.ts';
import { generateMap, type MapData } from './mapgen.ts';
import { placeStarts } from './starts.ts';
import { checkWorld, type Violation } from './mapChecks.ts';
import { MAP_LIMITS } from './mapRules.ts';
import { MAP_SIZES, type MapSizeKey } from './rules.ts';
import { mulberry32 } from './rng.ts';

export interface World {
  globe: Globe;
  map: MapData;
  starts: number[];
  size: MapSizeKey;
  seed: number;
  attempts: number;          // 1 = the seed worked first time
  violations: Violation[];   // empty unless every attempt failed
}

// Most guarantees hold by construction. If one cannot (for example, a seed
// whose continents leave no room for fair starts), we retry with a seed
// derived deterministically from the original, so a seed always maps to the
// same world.
export const MAX_ATTEMPTS = 20;

const globes = new Map<number, Globe>();
export function globeFor(size: MapSizeKey): Globe {
  const n = MAP_SIZES[size].n;
  let g = globes.get(n);
  if (!g) { g = buildGoldberg(n); globes.set(n, g); }
  return g;
}

export const attemptSeed = (seed: number, attempt: number): number =>
  attempt === 0 ? seed : (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + attempt * 0x27d4eb2f) >>> 0;

export function generateWorld(size: MapSizeKey, seed: number): World {
  const globe = globeFor(size);
  const limits = MAP_LIMITS[size];
  const civs = MAP_SIZES[size].players;
  let last: World | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const s = attemptSeed(seed, attempt);
    const map = generateMap(globe, s, size);
    if (!map) continue;
    const starts = placeStarts(globe, map, limits, civs, mulberry32(s ^ 0x5bd1e995)) ?? [];
    const violations = checkWorld({ globe, map, starts, limits, civs });
    last = { globe, map, starts, size, seed, attempts: attempt + 1, violations };
    if (violations.length === 0) return last;
  }
  if (last) return { ...last, attempts: MAX_ATTEMPTS };
  throw new Error(`No map could be generated for seed ${seed} (${size})`);
}
