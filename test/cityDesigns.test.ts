// Guarantees of the hand-drawn town tiles (src/town), how they are laid
// onto the globe (cityStamp.ts) and the ground cities reshape
// (terraform.ts).

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MIDDLES, STRIPS, WANTED_STRIPS, middlesFor, stripFor } from '../src/town/index.ts';
import { BORDER_TYPES, STUB_CLASS, middleStubs, stripStubs, shapeOfType, stubClass } from '../src/town/borders.ts';
import { storedLots } from '../src/town/drawings.ts';
import { DENSITIES, HALF_WIDTH, INR, RC, STRIP_DEPTH, distToLine, inStrip, layoutProblems, pointInPoly, reaches, rhoOf, type Pt } from '../src/town/geometry.ts';
import { stamp, coreToFan, stripToFan, drawingSide, type FanPt } from '../src/cityStamp.ts';
import { builtMask, cityGround } from '../src/terraform.ts';
import { CityProps, tileDensity, allowedDensity, type CitySpot } from '../src/cityProps.ts';
import { Game } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { USE } from '../src/cities.ts';
import { locate } from '../src/terrainMesh.ts';
import type { Globe } from '../src/goldberg.ts';

const endsAt = (pts: readonly Pt[], p: Pt) => [pts[0]!, pts[pts.length - 1]!].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6);

describe('DS1: the catalogue', () => {
  it('three border types per density', () => expect(BORDER_TYPES.length).toBe(9));
  it('five hex middles and one pentagon middle per density, a center and a wonder square per density and shape', () => {
    for (const d of DENSITIES) {
      expect(middlesFor(6, 'block', d).length, d).toBe(5);
      expect(middlesFor(5, 'block', d).length, d).toBe(1);
      for (const k of [5, 6] as const) {
        expect(middlesFor(k, 'center', d).length).toBeGreaterThanOrEqual(1);
        expect(middlesFor(k, 'wonder', d).length).toBeGreaterThanOrEqual(1);
      }
    }
    expect(new Set(MIDDLES.map((m) => m.id)).size).toBe(MIDDLES.length);
  });
  it('low middles have one building spot, medium and high two; centers two and the hall; wonder squares the wonder', () => {
    for (const m of MIDDLES) {
      const want = m.role === 'wonder' ? 0 : m.role === 'center' ? 2 : m.density === 'low' ? 1 : 2;
      expect(m.spots.length, m.id).toBe(want);
      expect(m.hall !== null, m.id).toBe(m.role === 'center');
      expect(m.wonder !== null, m.id).toBe(m.role === 'wonder');
    }
  });
  it('a strip for every pair of border types, and every type toward open land and water', () => {
    const missing = WANTED_STRIPS.filter(({ a, b }) => !stripFor(a, b)).map(({ a, b }) => `${a}|${b}`);
    expect(missing).toEqual([]);
    for (const a of BORDER_TYPES) for (const b of BORDER_TYPES) expect(stripFor(a, b), `${a}|${b}`).not.toBeNull();
  });
  it('every drawing has its houses stored (lots.json), drawn by hand, not generated', () => {
    expect([...MIDDLES, ...STRIPS].filter((d) => storedLots(d.id) === null).map((d) => d.id)).toEqual([]);
  });
  it('middles are not all alike: no middle is open on all sides the same way', () => {
    for (const m of MIDDLES.filter((x) => x.role === 'block')) expect(new Set(m.borders).size, m.id).toBeGreaterThan(1);
  });
});

describe('DS2: every middle is sound', () => {
  for (const m of MIDDLES) {
    it(`${m.id}: streets start at its border stubs at the border's width and form one network; lots clear of everything`, () => {
      m.borders.forEach((s, j) => {
        if (s === 'closed') return;
        for (const p of middleStubs(m.sides, j, s)) {
          const hit = m.streets.find((st) => endsAt(st.pts, p));
          expect(hit, `side ${j}`).toBeDefined();
          expect(hit!.cls, `side ${j}`).toBe(STUB_CLASS[m.density][s]);
        }
      });
      expect(reaches(m.streets, [])).toBe(true);
      for (const st of m.streets) for (const p of st.pts) expect(rhoOf(m.sides, p)).toBeLessThanOrEqual(RC + 1e-9);
      expect(layoutProblems((p) => rhoOf(m.sides, p) <= RC - 0.012 / INR[m.sides], m.streets, m.lots, m.spots, m.squares)).toEqual([]);
      for (const sp of [...m.spots, ...(m.hall ? [m.hall] : [])]) {
        for (const st of m.streets) expect(distToLine(sp, st.pts)).toBeGreaterThanOrEqual(sp.r + HALF_WIDTH[st.cls]);
      }
      for (const sp of m.spots) for (const q of m.squares) if (q.paved) expect(pointInPoly(sp, q.pts)).toBe(false);
    });
  }
});

describe('DS3: every strip is sound', () => {
  for (const s of STRIPS) {
    it(`${s.id}: streets start at both sides' stubs at their widths; lots inside the strip, clear of everything`, () => {
      const one = s.b === 'land' || s.b === 'water';
      for (const p of stripStubs(shapeOfType(s.a), -1)) expect(s.streets.find((st) => endsAt(st.pts, p))?.cls).toBe(stubClass(s.a));
      if (!one) for (const p of stripStubs(shapeOfType(s.b as typeof s.a), 1)) expect(s.streets.find((st) => endsAt(st.pts, p))?.cls).toBe(stubClass(s.b as typeof s.a));
      for (const st of s.streets) for (const p of st.pts) expect(inStrip(p, -1e-9)).toBe(true);
      expect(layoutProblems((p) => inStrip(p, 0.004, one) && Math.abs(p.y) <= STRIP_DEPTH - 0.022, s.streets, s.lots, [], s.squares)).toEqual([]);
    });
  }
  it('a strip used the other way round is mirrored: each side still meets its own stubs', () => {
    for (const a of BORDER_TYPES) for (const b of BORDER_TYPES) {
      const s = stripFor(a, b)!;
      for (const p of stripStubs(shapeOfType(a), -1)) expect(s.streets.some((st) => endsAt(st.pts, p)), `${a}|${b}`).toBe(true);
      for (const p of stripStubs(shapeOfType(b), 1)) expect(s.streets.some((st) => endsAt(st.pts, p)), `${a}|${b}`).toBe(true);
    }
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

  it("a strip point on an edge is the same point from either tile; a middle's stubs are where its strips' streets start", () => {
    let worst = 0;
    for (const c of cities) {
      const tiles = cp.stampTiles([c.tile, ...g.cityTiles(c, USE.urban)], null);
      for (const s of tiles) {
        for (let i = 0; i < s.sides; i++) {
          const x = s.across[i]!;
          const nb = tiles.find((o) => o.tile === x.tile);
          const shape = s.middle.borders[drawingSide(s, i)]!;
          middleStubs(s.sides, drawingSide(s, i), shape).forEach((p, n) => {
            // The stub as the middle has it, and as the strip has it (side A, stubs in order along the edge).
            const viaCore = dirOf(g.globe, coreToFan(s, p));
            const viaStrip = dirOf(g.globe, stripToFan(s.tile, i, null, stripStubs(shape, -1)[n]!, -1));
            worst = Math.max(worst, viaCore.angleTo(viaStrip) / D);
          });
          if (!nb) continue;
          for (const ex of [-0.2, -0.05, 0.1, 0.25]) {
            const b = { tile: nb.tile, back: x.back };
            const fromA = dirOf(g.globe, stripToFan(s.tile, i, b, { x: ex, y: 0 }, -1));
            const fromB = dirOf(g.globe, stripToFan(s.tile, i, b, { x: ex, y: 0 }, 1));
            worst = Math.max(worst, fromA.angleTo(fromB) / D);
          }
        }
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('no strip is missing, and lots from different drawings never stand on each other', () => {
    const bad: string[] = [];
    for (const c of cities) {
      const st = stamp(cp.stampTiles([c.tile, ...g.cityTiles(c, USE.urban)], c.buildings.has('walls') ? c.tile : null));
      expect(st.missing).toEqual([]);
      const pts = st.lots.map((l) => ({ d: dirOf(g.globe, l.at), l }));
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          // Footprints are at least 0.008 tile steps from their middle to their side (wells).
          if (pts[a]!.d.angleTo(pts[b]!.d) / D < 0.012) bad.push(`city ${c.name}: lots ${a} (${pts[a]!.l.kind}) and ${b} (${pts[b]!.l.kind})`);
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
