import type { Globe } from './goldberg.ts';
import { globeFor } from './globes.ts';
export { globeFor };
import { generateMap, type MapData } from './mapgen.ts';
import { placeStarts } from './starts.ts';
import { checkWorld, type Violation } from './mapChecks.ts';
import { MAP_LIMITS } from './mapRules.ts';
import { MAP_SIZES, type MapScriptKey, type MapSizeKey } from './rules.ts';
import { mulberry32 } from './rng.ts';

export interface World {
  globe: Globe;
  map: MapData;
  starts: number[];
  size: MapSizeKey;
  script: MapScriptKey;
  seed: number;
  attempts: number;          // 1 = the seed worked first time
  violations: Violation[];   // empty unless every attempt failed (a painted map: the guarantees its painting breaks)
}

// Most guarantees hold by construction. If one cannot (for example, a seed
// whose continents leave no room for fair starts), we retry with a seed
// derived deterministically from the original, so a seed always maps to the
// same world.
export const MAX_ATTEMPTS = 20;

export const attemptSeed = (seed: number, attempt: number): number =>
  attempt === 0 ? seed : (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + attempt * 0x27d4eb2f) >>> 0;

export function generateWorld(size: MapSizeKey, seed: number, script: MapScriptKey = 'continents'): World {
  const globe = globeFor(size);
  const limits = MAP_LIMITS[size];
  const civs = MAP_SIZES[size].players;
  let last: World | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const s = attemptSeed(seed, attempt);
    const map = generateMap(globe, s, size, script);
    if (!map) continue;
    const starts = placeStarts(globe, map, limits, civs, mulberry32(s ^ 0x5bd1e995)) ?? [];
    const violations = checkWorld({ globe, map, starts, limits, civs });
    last = { globe, map, starts, size, script, seed, attempts: attempt + 1, violations };
    // (A painted map keeps what it was painted: its guarantees are advice.)
    if (violations.length === 0 || script !== 'continents') return last;
  }
  if (last) return { ...last, attempts: MAX_ATTEMPTS };
  throw new Error(`No map could be generated for seed ${seed} (${size})`);
}
