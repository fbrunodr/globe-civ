// Guarantees of the hand-drawn town tiles (cityDesigns.ts), how they are
// laid onto the globe (cityStamp.ts) and the ground cities reshape
// (terraform.ts).

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ALL_DESIGNS, BLOCKS, PENT_BLOCK, CENTER, WONDER_SQUARE, DENSITIES, DESIGN_ERRORS, VARIANTS,
  connection, connected, coreRegion, halfRegion, layoutProblems, port, stripDepth, rhoOf, RC,
  type Across, type Design, type Pt,
} from '../src/cityDesigns.ts';
import { stamp, coreToFan, stripToFan, type FanPt } from '../src/cityStamp.ts';
import { builtMask, cityGround } from '../src/terraform.ts';
import { CityProps, tileDensity, allowedDensity, type CitySpot } from '../src/cityProps.ts';
import { Game } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { USE } from '../src/cities.ts';
import { locate } from '../src/terrainMesh.ts';
import type { Globe } from '../src/goldberg.ts';

const homes = (d: Design) => d.lots.filter((l) => l.kind === 'house' || l.kind === 'row' || l.kind === 'block' || l.kind === 'tower').length;

describe('DS1: the catalogue', () => {
  it('every drawing draws as written (each spot found room)', () => expect(DESIGN_ERRORS).toEqual([]));
  it('five hex drawings and one pentagon drawing per density, a center and a wonder square per density and shape', () => {
    for (const d of DENSITIES) {
      expect(BLOCKS[d].length).toBe(VARIANTS);
      expect(BLOCKS[d].every((x) => x.sides === 6 && x.density === d && x.role === 'block')).toBe(true);
      expect(PENT_BLOCK[d].sides).toBe(5);
      for (const k of [5, 6] as const) {
        expect(CENTER[k][d].hall).not.toBeNull();
        expect(WONDER_SQUARE[k][d].middle).not.toBeNull();
      }
    }
    expect(new Set(ALL_DESIGNS.map((d) => d.id)).size).toBe(ALL_DESIGNS.length);
  });
  it('low density has one building spot; medium and high two (centers: two plus the hall; wonder squares none)', () => {
    for (const d of ALL_DESIGNS) {
      const want = d.role === 'wonder' ? 0 : d.role === 'center' ? 2 : d.density === 'low' ? 1 : 2;
      expect(d.spots.length, d.id).toBe(want);
    }
  });
  it('denser drawings hold more homes: low < medium on average', () => {
    const avg = (xs: readonly Design[]) => xs.reduce((a, d) => a + homes(d), 0) / xs.length;
    expect(avg(BLOCKS.medium)).toBeGreaterThan(avg(BLOCKS.low) * 1.5);
    for (const d of BLOCKS.low) expect(homes(d), d.id).toBeGreaterThanOrEqual(15);
    for (const d of BLOCKS.high) expect(homes(d), d.id).toBeGreaterThanOrEqual(15);
  });
});

describe('DS2: every drawing is sound', () => {
  for (const d of ALL_DESIGNS) {
    it(`${d.id}: lots inside the core, clear of streets, squares, spots and each other; streets reach every port`, () => {
      expect(layoutProblems(coreRegion(d.sides), d.streets, d.lots, d.spots, d.squares)).toEqual([]);
      const ports = Array.from({ length: d.sides }, (_, j) => port(d.sides, j));
      expect(connected(d.streets, ports)).toBe(true);
      // Only port streets touch the core's edge.
      for (const s of d.streets) for (const p of s.pts) expect(rhoOf(d.sides, p)).toBeLessThanOrEqual(RC + 1e-9);
    });
  }
});

describe('DS3: every connection is sound', () => {
  it('for every pair of drawings (and toward land and water, with and without walls): lots inside their half, clear of everything; the street joins both ports', () => {
    const bad: string[] = [];
    const fars: Across[] = [...ALL_DESIGNS, 'land', 'water'];
    for (const a of ALL_DESIGNS) {
      for (const b of fars) {
        for (const walls of [false, true]) {
          const s = connection(a, b, { wallA: walls, wallB: walls });
          const region = (p: Pt) => halfRegion(a.sides, -1)(p) || (typeof b !== 'string' && halfRegion(b.sides, 1)(p));
          const pr = layoutProblems(region, s.streets, s.lots, []);
          const reach = [{ x: 0, y: -stripDepth(a.sides) }, ...(typeof b !== 'string' ? [{ x: 0, y: stripDepth(b.sides) }] : [])];
          if (pr.length || !connected(s.streets, reach)) bad.push(`${a.id}|${typeof b === 'string' ? b : b.id}|${walls}: ${pr.slice(0, 2).join('; ')}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

// The globe direction of a fan point (as the terrain places it).
function dirOf(globe: Globe, p: FanPt): THREE.Vector3 {
  const tl = globe.tiles[p.t]!, k = tl.corners.length;
  const A = globe.triCenters[tl.corners[p.i]!]!, B = globe.triCenters[tl.corners[(p.i + 1) % k]!]!;
  const w0 = 1 - p.wa - p.wb;
  return new THREE.Vector3().addScaledVector(tl.center, w0).addScaledVector(A, p.wa).addScaledVector(B, p.wb).normalize();
}

function grownGame(): Game {
  const g = new Game({ size: 'small', seed: 222 });
  g.players[0]!.isHuman = false;
  for (let i = 0; i < 120; i++) { aiTurn(g, g.players[0]!); g.endTurn(); }
  return g;
}

describe('DS4: drawings meet on the globe', () => {
  const g = grownGame();
  const D = g.globe.avgEdgeAngle;
  const fake = (t: number, i: number, wa: number, wb: number): CitySpot => ({ dir: dirOf(g.globe, { t, i, wa, wb }), ground: 0.01, water: 0, slope: 0, urban: 1 });
  const cp = new CityProps(g, fake, (d) => ({ ...fake(locate(g.globe, d).t, 0, 0, 0), dir: d, t: locate(g.globe, d).t }), 1);
  const cities = g.cities.filter((c) => g.cityTiles(c, USE.urban).length > 0);
  it('the game has towns with urban tiles to test', () => expect(cities.length).toBeGreaterThan(0));

  it('a strip point on an edge is the same point seen from either tile; a core port is where its strip starts', () => {
    let worst = 0;
    for (const c of cities) {
      const tiles = cp.stampTiles([c.tile, ...g.cityTiles(c, USE.urban)], null);
      for (const s of tiles) {
        for (let i = 0; i < s.sides; i++) {
          const x = s.across[i]!;
          const nb = tiles.find((o) => o.tile === x.tile);
          // Port j of the drawing lies on tile side (j + rot) % k, where the strip starts.
          const j = (i - s.rot + s.sides) % s.sides;
          const viaCore = dirOf(g.globe, coreToFan(s, port(s.sides, j)));
          const viaStrip = dirOf(g.globe, stripToFan(s, i, null, { x: 0, y: -stripDepth(s.sides) }));
          worst = Math.max(worst, viaCore.angleTo(viaStrip) / D);
          if (!nb) continue;
          for (const ex of [-0.2, -0.05, 0.1, 0.25]) {
            const b = { tile: nb.tile, sides: nb.sides, back: x.back };
            const fromA = dirOf(g.globe, stripToFan(s, i, b, { x: ex, y: 0 }, -1));
            const fromB = dirOf(g.globe, stripToFan(s, i, b, { x: ex, y: 0 }, 1));
            worst = Math.max(worst, fromA.angleTo(fromB) / D);
          }
        }
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('lots from different drawings and strips never stand on each other', () => {
    const bad: string[] = [];
    for (const c of cities) {
      const tiles = cp.stampTiles([c.tile, ...g.cityTiles(c, USE.urban)], c.buildings.has('walls') ? c.tile : null);
      const st = stamp(tiles);
      const pts = st.lots.map((l) => ({ d: dirOf(g.globe, l.at), src: `${l.tile}`, l }));
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          // Footprints are at least 0.016 tile steps from their middle to their side.
          if (pts[a]!.d.angleTo(pts[b]!.d) / D < 0.016) bad.push(`city ${c.name}: lots ${a} (${pts[a]!.l.kind}) and ${b} (${pts[b]!.l.kind})`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe('DS5: densities', () => {
  const g = grownGame();
  it('a tile with two buildings is never low; hills are never high', () => {
    for (let t = 0; t < g.N; t++) {
      if (g.use[t] !== USE.urban && g.use[t] !== USE.center) continue;
      const two = g.slotKeys(t).filter((k) => k !== null).length >= 2;
      if (two) expect(allowedDensity(g, t, 'low')).not.toBe('low');
      if (g.relief[t] === 'hills') expect(allowedDensity(g, t, 'high')).not.toBe('high');
      expect(tileDensity(g, t)).not.toBe('high'); // towers only by hand, until later eras
    }
  });
});

describe('DS6: cities drain wetlands and soften hills on their own tiles only', async () => {
  const { generateWorld } = await import('../src/world.ts');
  const { buildPaintData, warpAt } = await import('../src/paint.ts');
  const { buildRelief } = await import('../src/relief.ts');
  const { tileLook } = await import('../src/look.ts');
  const { buildTerrainMesh } = await import('../src/terrainMesh.ts');
  const { buildSurface, meshLevels } = await import('../src/surface.ts');
  type S = ReturnType<typeof buildSurface>;
  const seed = 4;
  const { globe, map } = generateWorld('medium', seed);
  const looks = globe.tiles.map((t) => tileLook(map, t.id));
  const paint = buildPaintData(globe, map, seed);
  const relief = buildRelief(globe, map, looks, seed, paint.params.r0);
  const levels = meshLevels(globe, map, looks);
  let surface: S | null = null;
  const mesh = buildTerrainMesh(globe, {
    level: (t) => levels[t] as 1 | 2 | 4,
    surface: (topo) => (surface = buildSurface(globe, map, looks, paint, relief, seed, topo)).fields,
    warp: (dir, out) => { warpAt(paint.params, dir.x, dir.y, dir.z, out); },
    fanAttributes: [],
  }, 4);
  const sf = surface! as S;
  const { topo, fields } = mesh;
  // Built: every pool tile and every hill tile with a few of its neighbors.
  const wet = globe.tiles.filter((t) => looks[t.id]!.pool && !looks[t.id]!.water).map((t) => t.id);
  const hilly = globe.tiles.filter((t) => map.relief[t.id] === 'hills').map((t) => t.id).slice(0, 40);
  const built = new Set<number>();
  for (const t of [...wet, ...hilly]) { built.add(t); if (t % 2) for (const n of globe.tiles[t]!.neighbors.slice(0, 2)) if (!looks[n]!.water && map.relief[n] !== 'mountains') built.add(n); }
  const isBuilt = (t: number) => built.has(t);
  const orig = fields.height.slice();

  it('there are wetlands and hills to test', () => { expect(wet.length).toBeGreaterThan(5); expect(hilly.length).toBeGreaterThan(5); });
  for (const keep of [1, 0.6]) {
    const changes = cityGround(globe, topo, sf.layers, orig, fields.water, isBuilt, keep);
    it(`hills at ${keep}: nothing changes on a vertex touching a tile that is not built up`, () => {
      const bad: number[] = [];
      for (const v of changes.keys()) {
        for (let s = 0; s < 3; s++) { const o = topo.owners[v * 3 + s]!; if (o >= 0 && !built.has(o)) bad.push(v); }
        if (!built.has(topo.tile[v]!)) bad.push(v);
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });
    it(`hills at ${keep}: no pool water is left in the built-up middle of a tile`, () => {
      const mask = builtMask(globe, topo, isBuilt);
      let left = 0, pools = 0;
      for (let v = 0; v < topo.V; v++) {
        if (mask[v]! < 1 || Number.isNaN(sf.layers.poolLevel[v]!)) continue;
        pools++;
        const h = changes.get(v)?.height ?? orig[v]!;
        if (h <= fields.water[v]!) left++;
      }
      expect(pools).toBeGreaterThan(50);
      expect(left).toBe(0);
    });
    it(`hills at ${keep}: built ground that was dry stays above the water`, () => {
      let bad = 0;
      for (const [v, c] of changes) if (orig[v]! > fields.water[v]! && c.height <= fields.water[v]!) bad++;
      expect(bad).toBe(0);
    });
  }
  it('softening hills lowers them: at 0.6 the built hill tops are lower than as generated', () => {
    const changes = cityGround(globe, topo, sf.layers, orig, fields.water, isBuilt, 0.6);
    const mask = builtMask(globe, topo, isBuilt);
    let lowered = 0, n = 0;
    for (let v = 0; v < topo.V; v++) {
      if (mask[v]! < 1 || sf.layers.hill[v]! < 0.002) continue;
      n++;
      if ((changes.get(v)?.height ?? orig[v]!) < orig[v]! - 0.0005) lowered++;
    }
    expect(n).toBeGreaterThan(20);
    expect(lowered / n).toBeGreaterThan(0.9);
  });
});
