// Finds a worst case map for performance runs: of many seeds, the one with
// the most land that can be settled and farmed (not water, mountains, ice,
// a glacier or a volcano), on every CPU core.
//   npx tsx scripts/stressSeed.ts [--size large] [--seeds 10000]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateWorld } from '../src/world.ts';
import { BIOMES } from '../src/terrain.ts';
import type { MapSizeKey } from '../src/rules.ts';

interface Job { size: MapSizeKey; seeds: number[] }
const usable = (size: MapSizeKey, seed: number): number => {
  const { map } = generateWorld(size, seed);
  let n = 0;
  for (let t = 0; t < map.biome.length; t++) {
    const f = map.feature[t];
    if (BIOMES[map.biome[t]!].water || map.relief[t] === 'mountains' || map.biome[t] === 'iceSheet' || f === 'glacier' || f === 'volcano') continue;
    n++;
  }
  return n;
};

if (isMainThread) {
  const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1]! : d; };
  const size = arg('--size', 'large') as MapSizeKey, total = Number(arg('--seeds', '10000'));
  const workers = availableParallelism();
  const seeds = Array.from({ length: total }, (_, i) => i + 1);
  const results = await Promise.all(Array.from({ length: workers }, (_, w) => new Promise<[number, number][]>((res, rej) => {
    const wk = new Worker(fileURLToPath(new URL('./stressSeed-worker.mjs', import.meta.url)), { workerData: { size, seeds: seeds.filter((_, i) => i % workers === w) } satisfies Job });
    wk.on('message', res); wk.on('error', rej);
  })));
  const all = results.flat().sort((a, b) => b[1] - a[1]);
  const mean = all.reduce((a, [, n]) => a + n, 0) / all.length;
  console.log(`${size}: ${all.length} seeds, mean ${mean.toFixed(0)} usable tiles; best:`, all.slice(0, 5).map(([s, n]) => `${s} (${n})`).join(', '));
} else {
  const { size, seeds } = workerData as Job;
  parentPort!.postMessage(seeds.map((s) => [s, usable(size, s)] as [number, number]));
}
