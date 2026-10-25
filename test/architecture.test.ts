// Guarantees of the town's architecture (architecture.ts, houses.ts): what
// each density holds, every civ has a style for every height, every slot a
// town can need has a model, densities unlock in order, and no model has
// faces that flicker.

import { describe, it, expect } from 'vitest';
import { ARCH_CIVS, ARCH_ERAS, DENSITY_ERA, SLOTS, STYLES, eraOfFloors, unlocked, pairsOf, styleFloors, styleOf } from '../src/architecture.ts';
import { DENSITIES, DENSITY_TALLEST, FLOORS, FOOTPRINTS, FOOTPRINT_CELLS, CELL } from '../src/town/geometry.ts';
import { HOUSE_VARIANTS, houseGeometry, houseKind } from '../src/houses.ts';
import { triangles, part, CATALOG_KINDS, buildCatalogGeometry } from '../src/propCatalog.ts';
import { BUILDING_KINDS, buildBuildingGeometry } from '../src/buildingCatalog.ts';
import { coplanarClashes } from '../src/coplanar.ts';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

describe('AR5: no faces fight for the same pixels', () => {
  it('the check finds two overlapping squares in one plane, in different colors, and nothing in one color or a hair apart', () => {
    const sq = (c: number, z = 0, x = 0) => part(new THREE.PlaneGeometry(0.01, 0.01), c, new THREE.Matrix4().makeTranslation(x, 0, z));
    expect(coplanarClashes(mergeGeometries([sq(0xff0000), sq(0x00ff00, 0, 0.005)])!).length).toBeGreaterThan(0);
    expect(coplanarClashes(mergeGeometries([sq(0xff0000), sq(0xff0000, 0, 0.005)])!)).toHaveLength(0);
    expect(coplanarClashes(mergeGeometries([sq(0xff0000), sq(0x00ff00, 0.0001, 0.005)])!)).toHaveLength(0);
    expect(coplanarClashes(mergeGeometries([sq(0xff0000), sq(0x00ff00, 0, 0.01)])!)).toHaveLength(0); // only touching
  });
  it('no lot model, building or prop has overlapping coplanar faces in different colors (they flicker)', () => {
    const bad: string[] = [];
    for (const st of STYLES) for (const f of styleFloors(st)) for (const fp of FOOTPRINTS) for (let v = 0; v < HOUSE_VARIANTS; v++) {
      const k = houseKind(st, fp, f, v), c = coplanarClashes(houseGeometry(k), 1);
      if (c.length) bad.push(`${k}: ${c[0]!.colorA} on ${c[0]!.colorB} in plane ${c[0]!.plane}`);
    }
    for (const k of BUILDING_KINDS) { const c = coplanarClashes(buildBuildingGeometry(k), 1); if (c.length) bad.push(`${k}: ${c[0]!.colorA} on ${c[0]!.colorB}`); }
    for (const k of CATALOG_KINDS) { const c = coplanarClashes(buildCatalogGeometry(k), 1); if (c.length) bad.push(`${k}: ${c[0]!.colorA} on ${c[0]!.colorB}`); }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});

// (Was AR6: city halls. A painted city has none.)

describe('AR7: wonders on their site', () => {
  it('every wonder (and the scaffolding) builds within its 7×7 site, stands up, keeps within 2000 triangles, and has no faces fighting', async () => {
    const { SITE_HALF, SITE_MODELS, wonderGeometry, wonderModelKind } = await import('../src/wonderModels.ts');
    const bad: string[] = [];
    for (const m of SITE_MODELS) {
      const k = wonderModelKind(m), g = wonderGeometry(k);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      if (Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z) > SITE_HALF + 1e-6) bad.push(`${k}: off its site (${Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z).toFixed(4)} > ${SITE_HALF})`);
      if (b.max.y < 0.02 || b.min.y < -0.002) bad.push(`${k}: height ${b.min.y.toFixed(4)}..${b.max.y.toFixed(4)}`);
      if (triangles(g) > 2000) bad.push(`${k}: ${triangles(g)} triangles`);
      const c = coplanarClashes(g, 1);
      if (c.length) bad.push(`${k}: ${c[0]!.colorA} on ${c[0]!.colorB} in plane ${c[0]!.plane} at ${c[0]!.at.map((v) => v.toFixed(4))}`);
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });
});
