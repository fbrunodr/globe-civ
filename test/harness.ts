import { generateWorld, type World } from '../src/world.ts';
import { CHECK_IDS, type CheckId } from '../src/mapChecks.ts';
import type { MapSizeKey } from '../src/rules.ts';
import regressions from './regressions.json' with { type: 'json' };

export interface SeedReport {
  seed: number;
  attempts: number;
  ms: number;
  violations: World['violations'];
}

export interface RunReport {
  size: MapSizeKey;
  reports: SeedReport[];
  failuresBy(id: CheckId): string[];
}

// Fixed, well-spread seeds so the quick tier is reproducible; the deep run
// (scripts/mapcheck.ts) uses fresh random seeds every time.
export function quickSeeds(count: number, salt: number): number[] {
  return Array.from({ length: count }, (_, i) => (Math.imul(i + 1, 2654435761) ^ salt) >>> 0);
}

export function regressionSeeds(size: MapSizeKey): number[] {
  return (regressions as { size: string; seed: number }[]).filter((r) => r.size === size).map((r) => r.seed);
}

export function runSeeds(size: MapSizeKey, seeds: readonly number[]): RunReport {
  // Warm up (globe construction, JIT) so timings measure steady-state generation.
  for (let i = 0; i < 5; i++) generateWorld(size, 0xdead + i);
  const reports = seeds.map((seed) => {
    const t0 = performance.now();
    const w = generateWorld(size, seed);
    return { seed, attempts: w.attempts, ms: performance.now() - t0, violations: w.violations };
  });
  return {
    size,
    reports,
    failuresBy: (id) => reports.flatMap((r) => r.violations.filter((v) => v.id === id).map((v) => `seed ${r.seed}: ${v.message}`)),
  };
}

export const percentile = (xs: readonly number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

export { CHECK_IDS };
