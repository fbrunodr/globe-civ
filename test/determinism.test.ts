import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { generateWorld } from '../src/world.ts';
import { MAP_SIZES, type MapSizeKey } from '../src/rules.ts';

function fingerprint(size: MapSizeKey, seed: number): string {
  const w = generateWorld(size, seed);
  const h = createHash('sha256');
  h.update(JSON.stringify([w.map.biome, w.map.relief, w.map.feature, w.starts, w.attempts]));
  for (const arr of [w.map.elevation, w.map.temperature, w.map.rainfall, w.map.flow]) h.update(new Uint8Array(arr.buffer));
  return h.digest('hex');
}

describe('I1: same seed, same map', () => {
  for (const size of Object.keys(MAP_SIZES) as MapSizeKey[]) {
    it(`${size}: 25 seeds generate identically twice`, () => {
      for (let i = 1; i <= 25; i++) {
        const seed = i * 7919;
        expect(fingerprint(size, seed)).toBe(fingerprint(size, seed));
      }
    });
  }
});
