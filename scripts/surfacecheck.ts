// Deep water check: builds many worlds' surfaces (as the game does) with
// fresh random seeds on every CPU core and checks that water keeps to its
// tiles (src/waterChecks.ts: W7 land tiles' safe zones dry, W8 water tiles
// wet). A world takes seconds, so this is far fewer worlds than mapcheck.
// Failing seeds are added to test/surfaceRegressions.json so npm test
// re-checks them forever.
//
//   npm run surfacecheck                          (100 worlds per size)
//   npm run surfacecheck -- --worlds 300 --sizes medium --workers 8

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { waterProblems, waterWorld, type WaterProblem } from '../src/waterChecks.ts';
import { SAFE_RHO, HARBOR_RHO } from '../src/town/geometry.ts';
import { MAP_SIZES, type MapSizeKey } from '../src/rules.ts';

interface Job { size: MapSizeKey; seeds: number[] }
interface Failure { size: MapSizeKey; seed: number; problems: WaterProblem[] }
interface Result { done: number; failures: Failure[]; worst: { land: number; water: number }; checked: { land: number; water: number } }

function work(job: Job, progress: () => void): Result {
  const res: Result = { done: 0, failures: [], worst: { land: Infinity, water: Infinity }, checked: { land: 0, water: 0 } };
  for (const seed of job.seeds) {
    const r = waterProblems(waterWorld(job.size, seed));
    res.done++;
    res.worst.land = Math.min(res.worst.land, r.worst.land);
    res.worst.water = Math.min(res.worst.water, r.worst.water);
    res.checked.land += r.checked.land;
    res.checked.water += r.checked.water;
    if (r.problems.length) res.failures.push({ size: job.size, seed, problems: r.problems });
    progress();
  }
  return res;
}

if (!isMainThread) {
  const res = work(workerData as Job, () => parentPort!.postMessage({ progress: 1 }));
  parentPort!.postMessage({ result: res });
} else {
  const args = process.argv.slice(2);
  const arg = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1]! : def; };
  const worlds = Number(arg('worlds', '100'));
  const sizes = arg('sizes', Object.keys(MAP_SIZES).join(',')).split(',') as MapSizeKey[];
  const workers = Math.min(worlds, Number(arg('workers', String(Math.max(1, availableParallelism() - 1)))));

  for (const size of sizes) {
    if (!(size in MAP_SIZES)) throw new Error(`Unknown size ${size}`);
    const seeds = Array.from({ length: worlds }, () => randomInt(0, 2 ** 32 - 1));
    const chunks: number[][] = Array.from({ length: workers }, () => []);
    seeds.forEach((s, i) => chunks[i % workers]!.push(s));
    const t0 = Date.now();
    let done = 0;
    const results = await Promise.all(chunks.map((chunk) => new Promise<Result>((resolve, reject) => {
      const w = new Worker(fileURLToPath(new URL('./surfacecheck-worker.mjs', import.meta.url)), { workerData: { size, seeds: chunk } });
      w.on('message', (m: { progress?: number; result?: Result }) => {
        if (m.progress) process.stdout.write(`\r${size}: ${(done += m.progress)} / ${worlds} worlds`);
        if (m.result) resolve(m.result);
      });
      w.on('error', reject);
    })));
    const secs = (Date.now() - t0) / 1000;
    const failures = results.flatMap((r) => r.failures);
    const worstLand = Math.min(...results.map((r) => r.worst.land)), worstWater = Math.min(...results.map((r) => r.worst.water));
    const land = results.reduce((a, r) => a + r.checked.land, 0), water = results.reduce((a, r) => a + r.checked.water, 0);
    console.log(`\n\n=== ${size}: ${worlds} worlds in ${secs.toFixed(0)} s on ${workers} workers (${land.toLocaleString()} land and ${water.toLocaleString()} water tiles by the water) ===`);
    for (const [id, title, worst, rule] of [['W7', 'land tiles keep their safe zone dry', worstLand, SAFE_RHO], ['W8', 'water tiles keep their water', worstWater, HARBOR_RHO]] as const) {
      const f = failures.filter((x) => x.problems.some((p) => p.id === id));
      console.log(`  ${id} ${title.padEnd(38)} nearest ${worst.toFixed(3)} (rule ${rule})  ${f.length === 0 ? 'ok' : `FAILED on ${f.length} worlds, e.g. seed ${f[0]!.seed}: ${f[0]!.problems.find((p) => p.id === id)!.message}`}`);
    }
    if (failures.length) {
      const path = fileURLToPath(new URL('../test/surfaceRegressions.json', import.meta.url));
      const saved = JSON.parse(readFileSync(path, 'utf8')) as { size: string; seed: number }[];
      for (const f of failures) if (!saved.some((s) => s.size === f.size && s.seed === f.seed)) saved.push({ size: f.size, seed: f.seed });
      writeFileSync(path, JSON.stringify(saved, null, 2) + '\n');
      console.log(`${failures.length} failing seeds saved to test/surfaceRegressions.json`);
      process.exitCode = 1;
    } else console.log(`All ${worlds} worlds passed.`);
  }
}
