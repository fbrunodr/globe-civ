// Guarantees of the town's architecture (architecture.ts, houses.ts): what
// each density holds, every civ has a style for every height, every slot a
// town can need has a model, and densities unlock in order.

import { describe, it, expect } from 'vitest';
import { ARCH_CIVS, ARCH_ERAS, DENSITY_ERA, SLOTS, STYLES, eraOfFloors, unlocked, pairsOf, styleFloors, styleOf } from '../src/architecture.ts';
import { DENSITIES, DENSITY_TALLEST, FLOORS, FOOTPRINTS, FOOTPRINT_CELLS, CELL } from '../src/town/geometry.ts';
import { HOUSE_VARIANTS, houseGeometry, houseKind } from '../src/houses.ts';
import { triangles } from '../src/propCatalog.ts';

describe('AR1: what each density holds', () => {
  it('low and medium hold up to doubles, dense triples, high quads, metropolitan skyscrapers; each density holds every height of the ones before', () => {
    expect(DENSITY_TALLEST).toEqual({ low: 2, medium: 2, dense: 3, high: 4, metropolitan: 12 });
    DENSITIES.forEach((d, i) => { if (i) expect(DENSITY_TALLEST[d]).toBeGreaterThanOrEqual(DENSITY_TALLEST[DENSITIES[i - 1]!]); });
  });
  it('the era each height is named for comes in order', () => {
    for (let i = 1; i < FLOORS.length; i++) expect(ARCH_ERAS.indexOf(eraOfFloors(FLOORS[i]!))).toBeGreaterThan(ARCH_ERAS.indexOf(eraOfFloors(FLOORS[i - 1]!)));
  });
});

describe('AR4: densities unlock with their heights', () => {
  it('low in the ancient era, medium in the classical, dense in the renaissance, high in the industrial, metropolitan in the modern; each era has every density before', () => {
    expect(DENSITY_ERA).toEqual({ low: 'ancient', medium: 'classical', dense: 'renaissance', high: 'industrial', metropolitan: 'modern' });
    for (const e of ARCH_ERAS) expect(DENSITIES.filter((d) => unlocked(e, d)).length).toBe(ARCH_ERAS.indexOf(e) + 1);
  });
});

describe('AR2: every slot has a model', () => {
  it(`all ${SLOTS.length} (civ, footprint, height) slots: a style that builds that height`, () => {
    const bad = SLOTS.filter((s) => !styleFloors(styleOf(s.civ, s.floors)).includes(s.floors)).map((s) => `${s.civ} ${s.fp} ${s.floors}`);
    expect(bad).toEqual([]);
  });
  it('every style serves some civ and every civ has a style for every height', () => {
    for (const st of STYLES) expect(pairsOf(st).length, st).toBeGreaterThan(0);
    for (const c of ARCH_CIVS) for (const f of FLOORS) expect(STYLES).toContain(styleOf(c, f));
  });
  it('each model builds, stays on its lot, stands up, and keeps within 700 triangles', () => {
    const bad: string[] = [];
    for (const st of STYLES) for (const f of styleFloors(st)) for (const fp of FOOTPRINTS) for (let v = 0; v < HOUSE_VARIANTS; v++) {
      const k = houseKind(st, fp, f, v), g = houseGeometry(k);
      g.computeBoundingBox();
      const b = g.boundingBox!, [cw, cd] = FOOTPRINT_CELLS[fp], lw = (cw * CELL) / 2, ld = (cd * CELL) / 2;
      // (Eaves may overhang the lot's edge a little.)
      if (b.max.x > lw * 1.08 || -b.min.x > lw * 1.08 || b.max.z > ld * 1.08 || -b.min.z > ld * 1.08) bad.push(`${k}: off its lot`);
      // (Shrubs and trees may sit a little into the ground.)
      if (b.max.y < 0.004 || b.min.y < -0.002) bad.push(`${k}: height ${b.min.y.toFixed(4)}..${b.max.y.toFixed(4)}`);
      if (triangles(g) > 700) bad.push(`${k}: ${triangles(g)} triangles`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
