// Guarantees of the props and their variants (propCatalog.ts, floraData.ts,
// flora.ts), from the "Props & Biome Variants" design doc.

import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world.ts';
import { buildFlora, REGION_MAX, REGION_MIN, SPLIT } from '../src/flora.ts';
import { BIOME_FLORA, FEATURE_FLORA, realmAllows, type Variant } from '../src/floraData.ts';
import { CATALOG_KINDS, buildCatalogGeometry, triangles } from '../src/propCatalog.ts';
import { components, isWaterKey } from '../src/mapRules.ts';
import type { MapSizeKey } from '../src/rules.ts';

const allSets = [...Object.values(BIOME_FLORA), ...Object.values(FEATURE_FLORA)];
const allVariants: Variant[] = allSets.flatMap((s) => [...s.variants]);

describe('prop catalog', () => {
  it('V4: every prop stays within 40 triangles', () => {
    const over = CATALOG_KINDS.map((k) => [k, triangles(buildCatalogGeometry(k))] as const).filter(([, t]) => t > 40);
    expect(over).toEqual([]);
  });

  it('V4: every variant mix sums to 100%', () => {
    const bad = allVariants.filter((v) => v.mix.length > 0)
      .map((v) => [v.name, v.mix.reduce((a, [, s]) => a + s, 0)] as const).filter(([, s]) => s !== 100);
    expect(bad).toEqual([]);
  });

  it('every prop is used by some variant', () => {
    const used = new Set(allVariants.flatMap((v) => v.mix.map(([k]) => k)));
    expect(CATALOG_KINDS.filter((k) => !used.has(k))).toEqual([]);
  });
});

const MAPS: [MapSizeKey, number][] = [
  ...Array.from({ length: 30 }, (_, i): [MapSizeKey, number] => ['small', i + 1]),
  ...Array.from({ length: 4 }, (_, i): [MapSizeKey, number] => ['medium', i + 1]),
];

describe('flora', () => {
  const seen = new Set<Variant>();
  const problems = { realm: [] as string[], region: [] as string[], landmass: [] as string[], hills: [] as string[], feature: [] as string[] };
  for (const [size, seed] of MAPS) {
    const { globe, map } = generateWorld(size, seed);
    const f = buildFlora(globe, map, seed);
    const N = globe.tiles.length;
    const at = `${size} ${seed}`;
    const regions = new Map<number, number[]>();
    for (let t = 0; t < N; t++) {
      const b = map.biome[t];
      const vs = BIOME_FLORA[b].variants, v = vs[f.variant[t]];
      seen.add(v);
      const ft = map.feature[t];
      if (ft) {
        const fv = FEATURE_FLORA[ft].variants[f.featureVariant[t]];
        seen.add(fv);
        if (fv.biomes && !fv.biomes.includes(b)) problems.feature.push(`${at}: tile ${t} ${fv.name} over ${b}`);
      }
      if (isWaterKey(b)) continue;
      if (v.hills && map.relief[t] !== 'hills') problems.hills.push(`${at}: tile ${t} ${v.name} off hills`);
      // V1: the variant fits the tile's realm, unless the realm has none for this biome.
      const realmHasOne = vs.some((x) => !x.hills && realmAllows(x, f.realm[t]));
      if (!v.hills && realmHasOne && !realmAllows(v, f.realm[t])) problems.realm.push(`${at}: tile ${t} ${v.name} in ${f.realm[t]}`);
      const l = regions.get(f.region[t]) ?? [];
      l.push(t);
      regions.set(f.region[t], l);
    }
    // V2: regions are connected, REGION_MIN..REGION_MAX tiles unless their whole patch is smaller.
    for (const [id, ts] of regions) {
      const set = new Set(ts);
      if (components(globe, (t) => set.has(t)).length !== 1) problems.region.push(`${at}: region ${id} is not connected`);
      const b = map.biome[ts[0]];
      if (ts.some((t) => map.biome[t] !== b)) problems.region.push(`${at}: region ${id} mixes biomes`);
      const r = f.realm[ts[0]];
      if (ts.some((t) => f.realm[t] !== r)) problems.region.push(`${at}: region ${id} mixes realms`);
      const patch = components(globe, (t) => map.biome[t] === b && f.realm[t] === r).find((p) => p.includes(ts[0]))!;
      if (patch.length > REGION_MAX && (ts.length < REGION_MIN || ts.length > REGION_MAX)) problems.region.push(`${at}: region ${id} has ${ts.length} tiles`);
    }
    // Realms: every land tile has one; a landmass has one realm, two if over SPLIT tiles.
    for (const m of components(globe, (t) => !isWaterKey(map.biome[t]))) {
      const rs = new Set(m.map((t) => f.realm[t]));
      if (rs.has(null) || rs.size > (m.length > SPLIT ? 2 : 1)) problems.landmass.push(`${at}: landmass of ${m.length} has realms ${[...rs]}`);
    }
  }

  it('V1: each tile shows a variant of its biome allowed in its realm', () => {
    expect(problems.realm).toEqual([]);
    expect(problems.hills).toEqual([]);
    expect(problems.feature).toEqual([]);
  });
  it('V2: regions are connected and sized 12-30 tiles', () => expect(problems.region).toEqual([]));
  it('realms: one per landmass, two on the largest', () => expect(problems.landmass).toEqual([]));
  it('V3: every variant appears on some map', () => {
    expect(allVariants.filter((v) => v.mix.length > 0 && !seen.has(v)).map((v) => v.name)).toEqual([]);
  });
  it('is a pure function of the map and the seed', () => {
    const { globe, map } = generateWorld('small', 3);
    expect(buildFlora(globe, map, 3)).toEqual(buildFlora(globe, map, 3));
  });
});
