// Deep map check: generates many maps with fresh random seeds on every CPU
// core and verifies every guarantee. Failing seeds are added to
// test/regressions.json so the quick tier (npm test) re-checks them forever.
//
//   npm run mapcheck -- --maps 100000            (per map size)
//   npm run mapcheck -- --maps 20000 --sizes large --workers 4

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateWorld, MAX_ATTEMPTS } from '../src/world.ts';
import { CHECKS, CHECK_IDS, type CheckId } from '../src/mapChecks.ts';
import { MAP_SIZES, type MapSizeKey } from '../src/rules.ts';

interface Job { size: MapSizeKey; seeds: number[] }
interface Failure { size: MapSizeKey; seed: number; ids: CheckId[]; first: string }
interface Result {
  done: number;
  failures: Failure[];
  attempts: number[]; // histogram: index = attempts used
  times: number[];    // sampled ms per map
}

const SAMPLE_EVERY = 10;

function work(job: Job, progress: (n: number) => void): Result {
  const res: Result = { done: 0, failures: [], attempts: new Array<number>(MAX_ATTEMPTS + 1).fill(0), times: [] };
  for (const seed of job.seeds) {
    const t0 = performance.now();
    const w = generateWorld(job.size, seed);
    const ms = performance.now() - t0;
    res.done++;
    res.attempts[w.attempts]++;
    if (res.done % SAMPLE_EVERY === 0) res.times.push(ms);
    if (w.violations.length) {
      res.failures.push({ size: job.size, seed, ids: w.violations.map((v) => v.id), first: w.violations[0].message });
    }
    if (res.done % 200 === 0) progress(200);
  }
  progress(res.done % 200);
  return res;
}

if (!isMainThread) {
  const res = work(workerData as Job, (n) => parentPort!.postMessage({ progress: n }));
  parentPort!.postMessage({ result: res });
} else {
  const args = process.argv.slice(2);
  const arg = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
  const maps = Number(arg('maps', '10000'));
  const sizes = arg('sizes', Object.keys(MAP_SIZES).join(',')).split(',') as MapSizeKey[];
  const workers = Number(arg('workers', String(Math.max(1, availableParallelism() - 1))));

  for (const size of sizes) {
    if (!(size in MAP_SIZES)) throw new Error(`Unknown size ${size}`);
    const seeds = Array.from({ length: maps }, () => randomInt(0, 2 ** 32 - 1));
    const chunks: number[][] = Array.from({ length: workers }, () => []);
    seeds.forEach((s, i) => chunks[i % workers].push(s));
    const t0 = Date.now();
    let done = 0;
    const results = await Promise.all(chunks.map((chunk) => new Promise<Result>((resolve, reject) => {
      const w = new Worker(fileURLToPath(new URL('./mapcheck-worker.mjs', import.meta.url)), { workerData: { size, seeds: chunk } });
      w.on('message', (m: { progress?: number; result?: Result }) => {
        if (m.progress) {
          done += m.progress;
          process.stdout.write(`\r${size}: ${done.toLocaleString()} / ${maps.toLocaleString()} maps`);
        }
        if (m.result) resolve(m.result);
      });
      w.on('error', reject);
    })));
    const secs = (Date.now() - t0) / 1000;

    const failures = results.flatMap((r) => r.failures);
    const attempts = results.reduce((acc, r) => acc.map((v, i) => v + r.attempts[i]), new Array<number>(MAX_ATTEMPTS + 1).fill(0));
    const times = results.flatMap((r) => r.times).sort((a, b) => a - b);
    const p = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))]?.toFixed(1);
    const retried = maps - attempts[1];

    console.log(`\n\n=== ${size}: ${maps.toLocaleString()} maps in ${secs.toFixed(0)} s on ${workers} workers ===`);
    console.log(`time per world: p50 ${p(0.5)} ms · p99 ${p(0.99)} ms · max ${p(1)} ms`);
    console.log(`retries: ${retried} seeds (${((100 * retried) / maps).toFixed(2)}%) needed more than one attempt`);
    for (const id of CHECK_IDS) {
      const f = failures.filter((x) => x.ids.includes(id));
      console.log(`  ${id.padEnd(3)} ${CHECKS[id].title.padEnd(40)} ${f.length === 0 ? 'ok' : `FAILED on ${f.length} maps, e.g. seed ${f[0].seed}`}`);
    }
    if (failures.length === 0) {
      console.log(`All ${maps.toLocaleString()} maps passed: 95% confident the failure rate is below ${((300 / maps)).toPrecision(2)}%.`);
    } else {
      const path = fileURLToPath(new URL('../test/regressions.json', import.meta.url));
      const saved = JSON.parse(readFileSync(path, 'utf8')) as { size: string; seed: number }[];
      for (const f of failures) if (!saved.some((s) => s.size === f.size && s.seed === f.seed)) saved.push({ size: f.size, seed: f.seed });
      writeFileSync(path, JSON.stringify(saved, null, 2) + '\n');
      console.log(`${failures.length} failing seeds saved to test/regressions.json`);
      process.exitCode = 1;
    }
  }
}
