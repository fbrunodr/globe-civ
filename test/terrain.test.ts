import { describe, it, expect } from 'vitest';
import { buildGoldberg } from '../src/goldberg.ts';
import { BIOMES, FEATURES, FEATURE_RULES, RELIEFS, terrainYield, type BiomeKey, type FeatureKey } from '../src/terrain.ts';

describe('Goldberg polyhedron', () => {
  for (const n of [1, 2, 5, 17, 24]) {
    it(`n=${n}: 10n²+2 tiles, exactly 12 pentagons, symmetric neighbors`, () => {
      const g = buildGoldberg(n);
      expect(g.tiles.length).toBe(10 * n * n + 2);
      expect(g.tiles.filter((t) => t.corners.length === 5).length).toBe(12);
      expect(g.tiles.every((t) => t.corners.length === 5 || t.corners.length === 6)).toBe(true);
      for (const t of g.tiles) for (const nb of t.neighbors) expect(g.tiles[nb].neighbors).toContain(t.id);
    });
  }
});

describe('terrain rules', () => {
  it('water features only allow water biomes, land features only land', () => {
    for (const f of Object.keys(FEATURES) as FeatureKey[]) {
      for (const b of FEATURE_RULES[f].biomes) expect(BIOMES[b].water).toBe(FEATURES[f].onWater);
    }
  });

  it('no terrain combination yields negative values', () => {
    for (const b of Object.keys(BIOMES) as BiomeKey[]) {
      for (const r of Object.keys(RELIEFS) as (keyof typeof RELIEFS)[]) {
        for (const f of [null, ...Object.keys(FEATURES)] as (FeatureKey | null)[]) {
          const y = terrainYield({ biome: b, relief: r, feature: f });
          expect(Math.min(y.food, y.prod, y.gold)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
