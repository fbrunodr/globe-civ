// Roads between cities (design doc "Cities: Feel & Play", city look v1).
// Each city is joined to its nearest neighbor of the same civ, and to any
// city within NEAR tiles, by the cheapest land route: flat open ground is
// cheap, forests and hills cost more, mountains much more, water is never
// crossed except by a short bridge over a river (rivers run on tile edges, so
// they never block a route). Pure: the same cities always give the same roads.

import type { Game } from './game.ts';

export const NEAR = 5;        // tiles: cities this close are always joined
const MAX_ROUTE = 14;         // tiles: no road longer than this (as the crow flies)

export interface Road {
  a: number;      // city ids
  b: number;
  tiles: number[]; // from a's center to b's center
}

// Cost of stepping onto a tile (undefined: impassable).
function stepCost(g: Game, t: number): number | undefined {
  if (g.isWater(t)) return undefined;
  const r = g.relief[t];
  if (r === 'mountains') return 8;
  return g.moveCost(t) + (r === 'hills' ? 1 : 0);
}

export function planRoads(g: Game): Road[] {
  const cities = [...g.cities].sort((a, b) => a.id - b.id);
  const pairs = new Set<string>();
  const want: [number, number][] = [];
  const addPair = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    want.push(a < b ? [a, b] : [b, a]);
  };
  for (const c of cities) {
    let best = -1, bestD = Infinity;
    for (const o of cities) {
      if (o === c) continue;
      const d = g.approxDist(c.tile, o.tile);
      if (d > MAX_ROUTE) continue;
      if (d <= NEAR) addPair(c.id, o.id);
      if (o.owner === c.owner && d < bestD) { bestD = d; best = o.id; }
    }
    if (best >= 0) addPair(c.id, best);
  }
  const roads: Road[] = [];
  for (const [a, b] of want) {
    const ca = g.cityById.get(a)!, cb = g.cityById.get(b)!;
    const tiles = route(g, ca.tile, cb.tile);
    if (tiles) roads.push({ a, b, tiles });
  }
  return roads;
}

// Cheapest land route between two tiles (Dijkstra with a distance bound), or null.
function route(g: Game, from: number, to: number): number[] | null {
  const limit = g.approxDist(from, to) * 2 + 4;
  const dist = new Map<number, number>([[from, 0]]);
  const came = new Map<number, number>();
  const open: [number, number][] = [[0, from]];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]![0] < open[bi]![0]) bi = i;
    const [d, t] = open.splice(bi, 1)[0]!;
    if (t === to) break;
    if (d > (dist.get(t) ?? Infinity)) continue;
    for (const n of g.tiles[t].neighbors) {
      if (g.approxDist(n, from) > limit) continue;
      const c = n === to ? 1 : stepCost(g, n);
      if (c === undefined) continue;
      const nd = d + c;
      if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); came.set(n, t); open.push([nd, n]); }
    }
  }
  if (!came.has(to)) return null;
  const path = [to];
  for (let t = to; t !== from; ) { t = came.get(t)!; path.push(t); }
  return path.reverse();
}
