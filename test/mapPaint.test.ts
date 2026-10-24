import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world.ts';
import { globeFor } from '../src/globes.ts';
import { HILLS, LAKE, LAND, MOUNTAINS, PAINTED, decodeRuns, encodeRuns, load, paintingFor, resample, store } from '../src/mapPaint.ts';
import { isWaterKey } from '../src/mapRules.ts';
import { MAP_SIZES, type MapSizeKey } from '../src/rules.ts';

const SIZES = Object.keys(MAP_SIZES) as MapSizeKey[];

describe('P1: paintings store and load', () => {
  it('runs round-trip', () => {
    for (const s of ['', 'a', 'aaab', '..##..o', 'x'.repeat(1000) + 'y']) expect(decodeRuns(encodeRuns(s), s.length)).toBe(s);
  });
  it('a painting round-trips through its stored form', () => {
    const n = globeFor('small').tiles.length, p = paintingFor(PAINTED.earth, 'small');
    const q = load(store(p), n);
    expect(q.terrain).toEqual(p.terrain);
    expect(q.relief).toEqual(p.relief);
    expect(q.biome).toEqual(p.biome);
  });
  it('a painting of the wrong size is refused', () => {
    expect(() => decodeRuns('5a', 6)).toThrow();
  });
});

describe('P2: a painted map is what was painted', () => {
  for (const size of SIZES) {
    it(`${size}: lakes, relief and biomes as painted, first attempt`, () => {
      const w = generateWorld(size, 1, 'earth'), p = paintingFor(PAINTED.earth, size), m = w.map;
      expect(w.attempts).toBe(1);
      expect(w.starts.length).toBe(MAP_SIZES[size].players);
      for (let t = 0; t < w.globe.tiles.length; t++) {
        if (p.terrain[t] === LAKE) expect(m.biome[t], `tile ${t}`).toBe('lake');
        if (p.terrain[t] !== LAND || isWaterKey(m.biome[t]!)) continue; // (a channel may cut a cut-off sea through)
        expect(m.relief[t], `tile ${t}`).toBe(p.relief[t] === MOUNTAINS ? 'mountains' : p.relief[t] === HILLS ? 'hills' : 'flat');
        if (p.biome[t]) expect(m.biome[t], `tile ${t}`).toBe(p.biome[t]);
      }
    });
  }
});

describe('P3: a painting moves between sizes', () => {
  it('large to small keeps the land share within 2%', () => {
    const big = globeFor('large'), small = globeFor('small');
    const p = paintingFor(PAINTED.earth, 'large'), q = resample(p, big, small);
    const share = (t: Uint8Array) => t.filter((v) => v === LAND).length / t.length;
    expect(Math.abs(share(q.terrain) - share(p.terrain))).toBeLessThan(0.02);
  });
});
