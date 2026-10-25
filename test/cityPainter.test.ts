// Guarantees of the city painter (src/cityPainter.ts) over many cities:
// buildings never touch, all joined to the first, every wonder placed in
// the safe zone, skyscrapers toward the middle, roads exactly in the
// gaps between joined buildings and never under one.

import { describe, it, expect } from 'vitest';
import { paintCity, gapBetween, joined, MAX_WONDERS, UNIT, type Painting, type PaintInput } from '../src/cityPainter.ts';
import { rhoOf, SAFE_RHO, type Pt } from '../src/town/geometry.ts';

// Cities of every size: wonders 0..10, a growing count of buildings; on open
// land, and with water (a river across one side, a lake) where nothing stands.
const river = (p: Pt) => Math.abs(p.x * 0.8 + p.y * 0.6 - 0.36) > 0.03;
const lake = (p: Pt) => Math.hypot(p.x + 0.25, p.y - 0.2) > 0.12;
const CASES: PaintInput[] = [];
for (let seed = 1; seed <= 24; seed++) {
  const wonders = seed % (MAX_WONDERS + 1), pop = 1 + ((seed * 7) % 22);
  const total = Math.round(4 + 3 * pop), skyscrapers = Math.floor(pop / 4);
  for (const free of [() => true, river, lake]) CASES.push({ wonders, skyscrapers, buildings: total - skyscrapers, seed, free });
}
const paint = CASES.map((c) => ({ c, p: paintCity(c) }));

const units = (pt: Pt, p: Painting) => {
  const d = { x: pt.x - p.origin.x, y: pt.y - p.origin.y };
  return { x: (d.x * p.u.x + d.y * p.u.y) / UNIT, y: (d.x * p.v.x + d.y * p.v.y) / UNIT };
};
// The road squares (units), from the painting's rectangles.
const roadSquares = (p: Painting) => {
  const out = new Set<string>();
  for (const r of p.roads) {
    const a = units(r[0]!, p), c = units(r[2]!, p);
    for (let y = Math.round(Math.min(a.y, c.y)); y < Math.round(Math.max(a.y, c.y)); y++)
      for (let x = Math.round(Math.min(a.x, c.x)); x < Math.round(Math.max(a.x, c.x)); x++) {
        const k = `${x},${y}`;
        if (out.has(k)) throw new Error('a road square painted twice');
        out.add(k);
      }
  }
  return out;
};

describe('CP1: buildings', () => {
  it('no two buildings touch, not even at a corner (at least 1 unit apart)', () => {
    const bad: string[] = [];
    for (const { c, p } of paint) {
      const b = p.buildings;
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        const dx = Math.max(b[j]!.x0 - b[i]!.x1, b[i]!.x0 - b[j]!.x1), dy = Math.max(b[j]!.y0 - b[i]!.y1, b[i]!.y0 - b[j]!.y1);
        if (Math.max(dx, dy) < 1) bad.push(`seed ${c.seed}: ${i} and ${j}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('every building is joined, through others, to the first', () => {
    const bad: string[] = [];
    for (const { c, p } of paint) {
      const b = p.buildings, seen = new Set([0]), todo = [0];
      while (todo.length) {
        const i = todo.pop()!;
        b.forEach((q, j) => { if (!seen.has(j) && joined(b[i]!.x0, b[i]!.y0, b[i]!.x1, b[i]!.y1, q.x0, q.y0, q.x1, q.y1)) { seen.add(j); todo.push(j); } });
      }
      if (b.length && seen.size !== b.length) bad.push(`seed ${c.seed}: ${seen.size}/${b.length} joined`);
    }
    expect(bad).toEqual([]);
  });
  it('every wonder is placed, first, wholly inside the safe zone', () => {
    const bad: string[] = [];
    for (const { c, p } of paint) {
      const ws = p.buildings.filter((b) => b.kind === 'wonder');
      if (ws.length !== Math.min(MAX_WONDERS, c.wonders)) bad.push(`seed ${c.seed}: ${ws.length}/${c.wonders} wonders`);
      if (p.buildings.slice(0, ws.length).some((b) => b.kind !== 'wonder')) bad.push(`seed ${c.seed}: a wonder after another building`);
      for (const w of ws) {
        const corners = [[w.x0, w.y0], [w.x1, w.y0], [w.x0, w.y1], [w.x1, w.y1]].map(([x, y]) => ({ x: p.origin.x + (x! * p.u.x + y! * p.v.x) * UNIT, y: p.origin.y + (x! * p.u.y + y! * p.v.y) * UNIT }));
        if (corners.some((q) => rhoOf(6, q) > SAFE_RHO + 1e-9)) bad.push(`seed ${c.seed}: a wonder past the safe zone`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('skyscrapers stand nearer the middle than the other buildings, on average', () => {
    const bad: string[] = [];
    for (const { c, p } of paint) {
      const mean = (k: string) => { const xs = p.buildings.filter((b) => b.kind === k).map((b) => Math.hypot(b.at.x, b.at.y)); return xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN; };
      const l = mean('skyscraper'), b = mean('building');
      if (l > b) bad.push(`seed ${c.seed}: skyscrapers ${l.toFixed(3)} vs ${b.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });
  it('nothing stands on water; a city on open land gets every building asked for', () => {
    for (const { c, p } of paint) {
      for (const b of p.buildings) expect(c.free(b.at), `seed ${c.seed}`).toBe(true);
      if (c.free === CASES[0]!.free) expect(p.buildings.length).toBe(Math.min(MAX_WONDERS, c.wonders) + c.skyscrapers + c.buildings);
    }
  });
});

describe('CP3: water cutting the tile', () => {
  it('where water cuts the tile in two, the whole city stands in the larger part', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      // A river across the tile, off the middle: the larger part holds the middle.
      const off = 0.04 + 0.01 * (seed % 5), a = seed * 0.7, d = { x: Math.cos(a), y: Math.sin(a) };
      const side = (p: Pt) => p.x * d.x + p.y * d.y - off;
      const p = paintCity({ wonders: seed % 4, skyscrapers: 2, buildings: 30, seed, free: (q) => Math.abs(side(q)) > 0.025 });
      const wrong = p.buildings.filter((b) => side(b.at) > 0);
      if (wrong.length) bad.push(`seed ${seed}: ${wrong.length} across the river`);
    }
    expect(bad).toEqual([]);
  });
});

describe('CP2: roads', () => {
  it('each joined pair has its road: the gap between them, end to end', () => {
    const bad: string[] = [];
    for (const { c, p } of paint) {
      const sq = roadSquares(p), b = p.buildings;
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        const g = gapBetween(b[i]!.x0, b[i]!.y0, b[i]!.x1, b[i]!.y1, b[j]!.x0, b[j]!.y0, b[j]!.x1, b[j]!.y1);
        if (!g) continue;
        for (let y = g[1]; y < g[3]; y++) for (let x = g[0]; x < g[2]; x++) if (!sq.has(`${x},${y}`)) { bad.push(`seed ${c.seed}: ${i}-${j} at ${x},${y}`); break; }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('no road lies under a building, and each square is painted once', () => {
    const bad: string[] = [];
    for (const { c, p } of paint) {
      const sq = roadSquares(p);
      for (const b of p.buildings) for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (sq.has(`${x},${y}`)) { bad.push(`seed ${c.seed}`); break; }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('the same city paints the same way', () => {
    const a = paintCity(CASES[5]!), b = paintCity(CASES[5]!);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
