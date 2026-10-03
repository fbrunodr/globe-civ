import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import type { Rng } from './rng.ts';
import {
  GOOD_START_BIOMES, ball, geography, hasWaterNear, roomToGrow, startQuality, type MapLimits,
} from './mapRules.ts';

// Picks one start tile per civilization, or null if this map cannot give
// everyone a fair start. Satisfies by construction:
//   S1 on a continent, S2 spacing, S3 quality within a ratio, S4 room to grow, S5 water nearby.
export function placeStarts(globe: Globe, map: MapData, limits: MapLimits, count: number, rand: Rng): number[] | null {
  const geo = geography(globe, map, limits);
  const onContinent = new Uint8Array(globe.tiles.length);
  for (const c of geo.continents) for (const t of c) onContinent[t] = 1;

  const candidates: { t: number; q: number }[] = [];
  for (let t = 0; t < globe.tiles.length; t++) {
    if (!onContinent[t] || !GOOD_START_BIOMES.has(map.biome[t]) || map.relief[t] !== 'flat') continue;
    const f = map.feature[t];
    if (f !== null && f !== 'floodplain') continue;
    if (!hasWaterNear(globe, map, t, limits.startWaterRadius)) continue;
    candidates.push({ t, q: startQuality(globe, map, t) });
  }
  if (candidates.length < count) return null;
  candidates.sort((a, b) => b.q - a.q);
  const viable = candidates;
  // Room to grow is the most expensive test, so it runs lazily on tiles about to be picked.
  const roomCache = new Map<number, boolean>();
  const hasRoom = (t: number) => {
    let ok = roomCache.get(t);
    if (ok === undefined) { ok = roomToGrow(globe, map, t, limits.startRoomRadius) >= limits.startRoomSites; roomCache.set(t, ok); }
    return ok;
  };

  // Try quality bands from the best downward: all starts must lie within
  // [low, low × ratio]. Inside a band, pick starts farthest-first.
  const ratio = limits.startQualityMaxRatio * 0.98;
  const STEPS = 16;
  for (let k = 1; k <= STEPS; k++) {
    const low = viable[Math.min(viable.length - 1, Math.floor((k / STEPS) * viable.length * 0.9))].q;
    const band = viable.filter((c) => c.q >= low && c.q <= low * ratio);
    if (band.length < count) continue;
    const picked = spacedPick(globe, band.map((c) => c.t), count, limits.startSpacing, rand, hasRoom);
    if (picked) return picked;
  }
  return null;
}

// Random-order greedy picking: take a site unless it is within `spacing` of
// one already taken. Guarantees the spacing; retries a few orders.
function spacedPick(globe: Globe, sites: readonly number[], count: number, spacing: number, rand: Rng,
  ok: (t: number) => boolean): number[] | null {
  for (let attempt = 0; attempt < 6; attempt++) {
    const order = [...sites];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const blocked = new Set<number>();
    const chosen: number[] = [];
    for (const t of order) {
      if (blocked.has(t) || !ok(t)) continue;
      chosen.push(t);
      if (chosen.length === count) return chosen;
      for (const x of ball(globe, t, spacing - 1).tiles) blocked.add(x);
    }
  }
  return null;
}
