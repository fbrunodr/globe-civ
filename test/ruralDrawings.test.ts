// Guarantees of the rural drawings (src/rural): every draft of every class,
// work and density is sound, has its homestead, and its fields fill out
// as the density grows.

import { describe, it, expect } from 'vitest';
import { CLASSES } from '../src/town/edges.ts';
import { RURAL_DENSITIES, WORKS, ruralDrawing } from '../src/rural/index.ts';
import { ruralProblems } from '../src/rural/checks.ts';
import { isBuilding } from '../src/town/geometry.ts';
import { areaLook, rowsIn } from '../src/rural/look.ts';

describe('RD1: every rural draft is sound', () => {
  for (const work of WORKS) for (const density of RURAL_DENSITIES) {
    it(`${work} ${density}: tracks from every stub as one network, areas and lots clear of tracks, each other and the spot`, () => {
      const bad: string[] = [];
      for (const k of CLASSES) for (const p of ruralProblems(ruralDrawing(k, work, density))) bad.push(`${k}: ${p.text}`);
      expect(bad.slice(0, 10)).toEqual([]);
    });
  }
});

describe('RD2: homesteads and their land', () => {
  it('a homestead has a house, a hamlet three, an estate five', () => {
    const want = { low: 1, medium: 3, high: 5 } as const;
    const bad: string[] = [];
    for (const work of WORKS) for (const density of RURAL_DENSITIES) for (const k of CLASSES) {
      const n = ruralDrawing(k, work, density).lots.filter((l) => isBuilding(l.kind)).length;
      if (n < want[density]) bad.push(`${k} ${work} ${density}: ${n} houses`);
    }
    expect(bad).toEqual([]);
  });
  it('fields fill out with density, and every field has crop rows', () => {
    for (const k of CLASSES) {
      // (Their area, not their number: some fields are larger than others.)
      const area = (poly: readonly { x: number; y: number }[]) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]!; return a + p.x * q.y - q.x * p.y; }, 0)) / 2;
      const [lo, mid, hi] = RURAL_DENSITIES.map((d) => ruralDrawing(k, 'cultivation', d).areas.reduce((a, poly) => a + area(poly), 0));
      expect(mid!, k).toBeGreaterThan(lo!);
      expect(hi!, k).toBeGreaterThan(mid!);
      for (const a of ruralDrawing(k, 'cultivation', 'high').areas) {
        const look = areaLook('farm', 'prairie', null, 12, 0, 1);
        if (look.fill.t === 'rows') expect(rowsIn(a, look.fill.spacing).length, k).toBeGreaterThan(0);
      }
    }
  });
});
