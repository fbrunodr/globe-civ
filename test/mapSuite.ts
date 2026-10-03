import { describe, it, expect, beforeAll } from 'vitest';
import { CHECK_IDS, percentile, quickSeeds, regressionSeeds, runSeeds, type RunReport } from './harness.ts';
import { CHECKS } from '../src/mapChecks.ts';
import type { MapSizeKey } from '../src/rules.ts';

// Quick tier: MAP_SEEDS maps per size (default 1,000) plus every seed that
// ever failed a deep run.
const SEEDS = Number(process.env['MAP_SEEDS'] ?? 1000);

export function mapGuaranteeSuite(size: MapSizeKey, salt: number): void {
  describe(`map guarantees · ${size}`, () => {
    let run: RunReport;
    beforeAll(() => {
      run = runSeeds(size, [...quickSeeds(SEEDS, salt), ...regressionSeeds(size)]);
    });

    it.each(CHECK_IDS.map((id) => ({ id, title: CHECKS[id].title })))('$id $title', ({ id }) => {
      expect(run.failuresBy(id)).toEqual([]);
    });

    it('needs a retry on fewer than 5% of seeds', () => {
      const retried = run.reports.filter((r) => r.attempts > 1).length;
      expect(retried / run.reports.length).toBeLessThan(0.05);
    });

    it('I3: generates in under 100 ms (99th percentile)', () => {
      expect(percentile(run.reports.map((r) => r.ms), 0.99)).toBeLessThan(100);
    });
  });
}
