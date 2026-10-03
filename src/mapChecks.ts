// One pure check per map guarantee (see the "Map Guarantees" review). Each
// returns null when the map passes, or a short description of the violation.
// I1 (determinism) and I3 (speed) are not properties of a single map; the test
// harness checks those.

import type { Globe } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import { BIOMES, FEATURES, RELIEFS, featureAllowed, type BiomeKey, type FeatureKey } from './terrain.ts';
import {
  DESERT_BIOMES, FOREST_BIOMES, FORBIDDEN_NEIGHBORS, TROPICAL_BIOMES, TROPICAL_FEATURES, ball, components, geography,
  hasWaterNear, inRange, isNavigable, isWaterKey, isWorldOcean, latDeg, roomToGrow, shelfLinkedGroups, startQuality,
  type MapLimits, type Range,
} from './mapRules.ts';

export interface WorldView {
  globe: Globe;
  map: MapData;
  starts: readonly number[];
  limits: MapLimits;
  civs: number;
}

export type CheckId =
  | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7'
  | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7'
  | 'R1' | 'R2'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7'
  | 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
  | 'I2';

// A guarantee is written in exactly one place: here. `rule` builds its
// description from the live limits, so the text can never disagree with
// the numbers the generator and the check use.
export interface Guarantee {
  title: string;
  rule: (limits: MapLimits) => string;
  check: (w: WorldView) => string | null;
}

const fmtRange = (rg: Range) => (rg.max === Infinity ? `≥ ${rg.min}` : `${rg.min}–${rg.max}`);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const expectRange = (what: string, x: number, rg: Range, show: (v: number) => string = String) =>
  inRange(x, rg) ? null : `${what} ${show(x)} not in ${rg.max === Infinity ? '≥ ' + show(rg.min) : show(rg.min) + '–' + show(rg.max)}`;

const tilesWhere = (w: WorldView, pred: (t: number) => boolean) => {
  const out: number[] = [];
  for (let t = 0; t < w.globe.tiles.length; t++) if (pred(t)) out.push(t);
  return out;
};
const isLand = (w: WorldView, t: number) => !isWaterKey(w.map.biome[t]);
const landCount = (w: WorldView) => tilesWhere(w, (t) => isLand(w, t)).length;
const featureTiles = (w: WorldView, f: FeatureKey) => tilesWhere(w, (t) => w.map.feature[t] === f);

// Closest pair among `ts`, in tiles, if any pair is closer than `limit`.
function tooClose(w: WorldView, ts: readonly number[], limit: number): number | null {
  const set = new Set(ts);
  for (const t of ts) {
    const b = ball(w.globe, t, limit - 1);
    for (let i = 1; i < b.tiles.length; i++) if (set.has(b.tiles[i])) return b.dist[i];
  }
  return null;
}

function clusterCheck(w: WorldView, f: FeatureKey, systems: Range, isWarmEnough: (t: number) => boolean): string | null {
  const ts = featureTiles(w, f);
  const bad = ts.find((t) => w.map.biome[t] !== 'shallowSea' || !isWarmEnough(t));
  if (bad !== undefined) return `${f} at tile ${bad} outside its water (${w.map.biome[bad]})`;
  const clusters = components(w.globe, (t) => w.map.feature[t] === f);
  const msg = expectRange(`${f} systems`, clusters.length, systems);
  if (msg) return msg;
  const odd = clusters.find((c) => !inRange(c.length, w.limits.clusterTiles));
  return odd ? `${f} system of ${odd.length} tiles, expected ${fmtRange(w.limits.clusterTiles)}` : null;
}

export const CHECKS: Record<CheckId, Guarantee> = {
  // ----- geography -----
  G1: {
    title: 'Between 2 and 5 continents',
    rule: (l) => `${fmtRange(l.continents)} continents: landmasses covering ≥ ${pct(l.continentMinTileShare)} of all tiles and under ${pct(l.continentMaxIceShare)} ice sheet`,
    check: (w) => expectRange('continents', geography(w.globe, w.map, w.limits).continents.length, w.limits.continents),
  },
  G2: {
    title: 'One connected open sea',
    rule: () => 'All open water (deep ocean and shallow sea; sea ice does not connect) is one region, and every continent touches it',
    check: (w) => {
      const seas = components(w.globe, (t) => isNavigable(w.map.biome[t]));
      if (seas.length !== 1) return `${seas.length} separate open seas`;
      const sea = new Set(seas[0]);
      const geo = geography(w.globe, w.map, w.limits);
      const cut = geo.continents.findIndex((c) => !c.some((t) => w.globe.tiles[t].neighbors.some((nb) => sea.has(nb))));
      return cut >= 0 ? `continent ${cut} does not touch the open sea` : null;
    },
  },
  G3: {
    title: 'No single continent dominates',
    rule: (l) => `The largest continent holds at most ${pct(l.largestContinentMaxLandShare)} of all land`,
    check: (w) => {
      const geo = geography(w.globe, w.map, w.limits);
      const share = (geo.continents[0]?.length ?? 0) / geo.landTiles;
      return share <= w.limits.largestContinentMaxLandShare ? null : `largest continent holds ${pct(share)} of land`;
    },
  },
  G4: {
    title: 'Land share of the globe',
    rule: (l) => `Land covers ${pct(l.landShare.min)}–${pct(l.landShare.max)} of all tiles`,
    check: (w) => expectRange('land share', landCount(w) / w.globe.tiles.length, w.limits.landShare, pct),
  },
  G5: {
    title: 'Islands exist',
    rule: (l) => `At least ${l.islands.min} islands (landmasses below continent size)`,
    check: (w) => expectRange('islands', geography(w.globe, w.map, w.limits).islands.length, w.limits.islands),
  },
  G6: {
    title: 'Lakes exist but stay lakes',
    rule: (l) => `${fmtRange(l.lakes)} lakes, each at most ${l.lakeMaxTiles} tiles, none touching the world ocean`,
    check: (w) => {
      const lakes = components(w.globe, (t) => w.map.biome[t] === 'lake');
      const msg = expectRange('lakes', lakes.length, w.limits.lakes);
      if (msg) return msg;
      const big = lakes.find((l) => l.length > w.limits.lakeMaxTiles);
      if (big) return `lake of ${big.length} tiles (max ${w.limits.lakeMaxTiles})`;
      const touching = tilesWhere(w, (t) => w.map.biome[t] === 'lake' && w.globe.tiles[t].neighbors.some((nb) => isWorldOcean(w.map.biome[nb])));
      return touching.length ? `lake tile ${touching[0]} touches the world ocean` : null;
    },
  },
  G7: {
    title: 'Continents are separated by deep ocean',
    rule: () => 'No path over land and shallow sea (where early boats can go) connects two continents',
    check: (w) => {
      const linked = shelfLinkedGroups(w.globe, w.map, w.limits);
      return linked.length ? `continents linked by shallow water (${linked.length} group${linked.length > 1 ? 's' : ''})` : null;
    },
  },
  // ----- climate -----
  C1: {
    title: 'Solid polar caps',
    rule: (l) => `At least ${pct(l.polarIceMinShareAbove78)} of tiles above 78° latitude are ice`,
    check: (w) => {
      const polar = tilesWhere(w, (t) => latDeg(w.globe, t) >= 78);
      const ice = polar.filter((t) => w.map.biome[t] === 'iceSheet' || w.map.biome[t] === 'seaIce').length;
      const share = ice / polar.length;
      return share >= w.limits.polarIceMinShareAbove78 ? null : `only ${pct(share)} of tiles above 78° are ice`;
    },
  },
  C2: {
    title: 'Polar ice stays modest',
    rule: (l) => `Ice covers ${pct(l.iceGlobeShare.min)}–${pct(l.iceGlobeShare.max)} of the globe and at most ${pct(l.iceMaxShare60to68)} of the 60–68° band`,
    check: (w) => {
      const isIce = (t: number) => w.map.biome[t] === 'iceSheet' || w.map.biome[t] === 'seaIce';
      const msg = expectRange('ice share of globe', tilesWhere(w, isIce).length / w.globe.tiles.length, w.limits.iceGlobeShare, pct);
      if (msg) return msg;
      const band = tilesWhere(w, (t) => latDeg(w.globe, t) >= 60 && latDeg(w.globe, t) < 68);
      const share = band.filter(isIce).length / band.length;
      return share <= w.limits.iceMaxShare60to68 ? null : `ice covers ${pct(share)} of the 60–68° band`;
    },
  },
  C3: {
    title: 'No tropics near the poles',
    rule: (l) => `No jungle, monsoon forest, savanna, mangrove or reef poleward of ${l.tropicsMaxLat}°`,
    check: (w) => {
      const t = tilesWhere(w, (x) => latDeg(w.globe, x) > w.limits.tropicsMaxLat &&
        (TROPICAL_BIOMES.has(w.map.biome[x]) || TROPICAL_FEATURES.has(w.map.feature[x] as FeatureKey)))[0];
      return t === undefined ? null : `tropical ${w.map.feature[t] ?? w.map.biome[t]} at ${latDeg(w.globe, t).toFixed(0)}°`;
    },
  },
  C4: {
    title: 'No ice near the equator',
    rule: (l) => `No ice sheet or sea ice equatorward of ${l.iceMinLat}°; no lowland tundra equatorward of ${l.lowlandTundraMinLat}°`,
    check: (w) => {
      const ice = tilesWhere(w, (t) => latDeg(w.globe, t) < w.limits.iceMinLat && (w.map.biome[t] === 'iceSheet' || w.map.biome[t] === 'seaIce'))[0];
      if (ice !== undefined) return `${w.map.biome[ice]} at ${latDeg(w.globe, ice).toFixed(0)}°`;
      const tundra = tilesWhere(w, (t) => latDeg(w.globe, t) < w.limits.lowlandTundraMinLat && w.map.biome[t] === 'tundra' && w.map.relief[t] === 'flat')[0];
      return tundra === undefined ? null : `lowland tundra at ${latDeg(w.globe, tundra).toFixed(0)}°`;
    },
  },
  C5: {
    title: 'Neighbors make climatic sense',
    rule: () => FORBIDDEN_NEIGHBORS.map(([warm, colds]) => `${warm} never touches ${colds.join(', ')}`).join('; '),
    check: (w) => {
      for (const [warm, colds] of FORBIDDEN_NEIGHBORS) {
        const t = tilesWhere(w, (x) => w.map.biome[x] === warm && w.globe.tiles[x].neighbors.some((nb) => colds.includes(w.map.biome[nb])))[0];
        if (t !== undefined) return `${warm} at tile ${t} touches ${colds.join('/')}`;
      }
      return null;
    },
  },
  C6: {
    title: 'Every biome shows up',
    rule: (l) => `At least ${l.biomesPresentMin} of the 13 land biomes are present`,
    check: (w) => {
      const landBiomes = (Object.keys(BIOMES) as BiomeKey[]).filter((b) => !BIOMES[b].water);
      const present = landBiomes.filter((b) => w.map.biome.includes(b));
      return present.length >= w.limits.biomesPresentMin ? null
        : `only ${present.length} land biomes (missing ${landBiomes.filter((b) => !present.includes(b)).join(', ')})`;
    },
  },
  C7: {
    title: 'Sane biome proportions',
    rule: (l) => `Forests ${pct(l.forestLandShare.min)}–${pct(l.forestLandShare.max)} of land, deserts ${pct(l.desertLandShare.min)}–${pct(l.desertLandShare.max)}, ice sheet at most ${pct(l.iceSheetLandShareMax)}`,
    check: (w) => {
      const land = landCount(w);
      const share = (set: ReadonlySet<BiomeKey>) => tilesWhere(w, (t) => set.has(w.map.biome[t])).length / land;
      return expectRange('forest share of land', share(FOREST_BIOMES), w.limits.forestLandShare, pct)
        ?? expectRange('desert share of land', share(DESERT_BIOMES), w.limits.desertLandShare, pct)
        ?? (share(new Set<BiomeKey>(['iceSheet'])) <= w.limits.iceSheetLandShareMax ? null : `ice sheet covers ${pct(share(new Set<BiomeKey>(['iceSheet'])))} of land`);
    },
  },
  // ----- relief -----
  R1: {
    title: 'Mountain and hill shares',
    rule: (l) => `Mountains ${pct(l.mountainLandShare.min)}–${pct(l.mountainLandShare.max)} of land, hills ${pct(l.hillLandShare.min)}–${pct(l.hillLandShare.max)}`,
    check: (w) => {
      const land = landCount(w);
      const share = (r: string) => tilesWhere(w, (t) => w.map.relief[t] === r).length / land;
      return expectRange('mountain share of land', share('mountains'), w.limits.mountainLandShare, pct)
        ?? expectRange('hill share of land', share('hills'), w.limits.hillLandShare, pct);
    },
  },
  R2: {
    title: 'Mountains form ranges',
    rule: (l) => `At least ${pct(l.mountainNeighborMinShare)} of mountains touch another; the longest range has ${l.longestRangeMin}+ tiles`,
    check: (w) => {
      const mtn = tilesWhere(w, (t) => w.map.relief[t] === 'mountains');
      const linked = mtn.filter((t) => w.globe.tiles[t].neighbors.some((nb) => w.map.relief[nb] === 'mountains')).length;
      if (linked / mtn.length < w.limits.mountainNeighborMinShare) return `only ${pct(linked / mtn.length)} of mountains touch another`;
      const longest = components(w.globe, (t) => w.map.relief[t] === 'mountains')[0]?.length ?? 0;
      return longest >= w.limits.longestRangeMin ? null : `longest range has ${longest} tiles`;
    },
  },
  // ----- features -----
  F1: {
    title: 'Volcanoes are few and far apart',
    rule: (l) => `${fmtRange(l.volcanoes)} volcanoes, on mountains, every pair at least ${l.volcanoSpacing} tiles apart`,
    check: (w) => {
      const v = featureTiles(w, 'volcano');
      const msg = expectRange('volcanoes', v.length, w.limits.volcanoes);
      if (msg) return msg;
      const close = tooClose(w, v, w.limits.volcanoSpacing);
      return close === null ? null : `two volcanoes ${close} tiles apart (min ${w.limits.volcanoSpacing})`;
    },
  },
  F2: {
    title: 'Reefs come in a few systems',
    rule: (l) => `${fmtRange(l.reefSystems)} separate reef systems of ${fmtRange(l.clusterTiles)} tiles, only in warm shallow sea`,
    check: (w) => clusterCheck(w, 'reef', w.limits.reefSystems, (t) => latDeg(w.globe, t) <= w.limits.tropicsMaxLat),
  },
  F3: {
    title: 'Kelp follows the reef rules',
    rule: (l) => `${fmtRange(l.kelpSystems)} separate kelp systems of ${fmtRange(l.clusterTiles)} tiles, only in cool shallow sea`,
    check: (w) => clusterCheck(w, 'kelp', w.limits.kelpSystems, (t) => latDeg(w.globe, t) > 25),
  },
  F4: {
    title: 'Oases are rare and spread out',
    rule: (l) => `${fmtRange(l.oases)} oases on flat desert away from water, at least ${l.oasisSpacing} tiles apart`,
    check: (w) => {
      const o = featureTiles(w, 'oasis');
      const msg = expectRange('oases', o.length, w.limits.oases);
      if (msg) return msg;
      const close = tooClose(w, o, w.limits.oasisSpacing);
      return close === null ? null : `two oases ${close} tiles apart (min ${w.limits.oasisSpacing})`;
    },
  },
  F5: {
    title: 'Glaciers only on cold peaks',
    rule: (l) => `Glaciers only on mountains below ${l.glacierMaxTemp} °C, at most ${pct(l.glacierMaxMountainShare)} of all mountains`,
    check: (w) => {
      const g = featureTiles(w, 'glacier');
      const warm = g.find((t) => w.map.temperature[t] >= w.limits.glacierMaxTemp);
      if (warm !== undefined) return `glacier at ${w.map.temperature[warm].toFixed(1)} °C`;
      const mtn = tilesWhere(w, (t) => w.map.relief[t] === 'mountains').length;
      return g.length <= w.limits.glacierMaxMountainShare * mtn ? null : `${g.length} of ${mtn} mountains are glaciers`;
    },
  },
  F6: {
    title: 'Features stay on allowed terrain',
    rule: () => 'Every feature matches its FEATURE_RULES entry in terrain.ts',
    check: (w) => {
      for (let t = 0; t < w.globe.tiles.length; t++) {
        const f = w.map.feature[t];
        if (!f) continue;
        const nbs = w.globe.tiles[t].neighbors;
        const terrain = { biome: w.map.biome[t], relief: w.map.relief[t], feature: f };
        if (!featureAllowed(f, terrain, nbs.some((nb) => isNavigable(w.map.biome[nb])), nbs.some((nb) => isWaterKey(w.map.biome[nb])))) {
          return `${f} not allowed on ${w.map.relief[t]} ${w.map.biome[t]} (tile ${t})`;
        }
      }
      return null;
    },
  },
  F7: {
    title: 'Wetland counts in range',
    rule: (l) => `Marsh ${fmtRange(l.marsh)}, swamp ${fmtRange(l.swamp)}, floodplain ${fmtRange(l.floodplain)} tiles (provisional until rivers)`,
    check: (w) => expectRange('marsh tiles', featureTiles(w, 'marsh').length, w.limits.marsh)
      ?? expectRange('swamp tiles', featureTiles(w, 'swamp').length, w.limits.swamp)
      ?? expectRange('floodplain tiles', featureTiles(w, 'floodplain').length, w.limits.floodplain),
  },
  // ----- starts -----
  S1: {
    title: 'Every civ starts on a continent',
    rule: () => 'One start per civ, each on a continent (never an island)',
    check: (w) => {
      if (w.starts.length !== w.civs) return `${w.starts.length} starts for ${w.civs} civs`;
      const geo = geography(w.globe, w.map, w.limits);
      const onContinent = new Set(geo.continents.flat());
      const off = w.starts.find((s) => !onContinent.has(s));
      return off === undefined ? null : `start at tile ${off} is not on a continent`;
    },
  },
  S2: {
    title: 'Starts are well spread',
    rule: (l) => `Any two starts are at least ${l.startSpacing} tiles apart`,
    check: (w) => {
      const close = tooClose(w, w.starts, w.limits.startSpacing);
      return close === null ? null : `two starts ${close} tiles apart (min ${w.limits.startSpacing})`;
    },
  },
  S3: {
    title: 'Starts are equally good',
    rule: (l) => `Yield score of the 19 tiles around each start: best ÷ worst at most ${l.startQualityMaxRatio}`,
    check: (w) => {
      const q = w.starts.map((s) => startQuality(w.globe, w.map, s));
      const ratio = Math.max(...q) / Math.min(...q);
      return ratio <= w.limits.startQualityMaxRatio ? null : `start quality ratio ${ratio.toFixed(2)}`;
    },
  },
  S4: {
    title: 'Room to grow',
    rule: (l) => `At least ${l.startRoomSites} more city sites within ${l.startRoomRadius} tiles of each start, reachable over land`,
    check: (w) => {
      const s = w.starts.find((t) => roomToGrow(w.globe, w.map, t, w.limits.startRoomRadius) < w.limits.startRoomSites);
      return s === undefined ? null : `start at tile ${s} has room for fewer than ${w.limits.startRoomSites} cities`;
    },
  },
  S5: {
    title: 'Water nearby',
    rule: (l) => `Coast or lake within ${l.startWaterRadius} tiles of every start`,
    check: (w) => {
      const s = w.starts.find((t) => !hasWaterNear(w.globe, w.map, t, w.limits.startWaterRadius));
      return s === undefined ? null : `start at tile ${s} has no water within ${w.limits.startWaterRadius} tiles`;
    },
  },
  // ----- integrity -----
  I2: {
    title: 'Consistent tile data',
    rule: () => 'Water is flat with no land features; shallow sea is within 2 tiles of land; deep ocean never touches land',
    check: (w) => {
      const N = w.globe.tiles.length;
      const m = w.map;
      if (m.biome.length !== N || m.relief.length !== N || m.feature.length !== N || m.elevation.length !== N) return 'array length mismatch';
      for (let t = 0; t < N; t++) {
        if (!(m.biome[t] in BIOMES)) return `bad biome at ${t}`;
        if (!(m.relief[t] in RELIEFS)) return `bad relief at ${t}`;
        const f = m.feature[t];
        if (f !== null && !(f in FEATURES)) return `bad feature at ${t}`;
        const water = isWaterKey(m.biome[t]);
        if (water && m.relief[t] !== 'flat') return `water tile ${t} has relief ${m.relief[t]}`;
        if (water && f !== null && !FEATURES[f].onWater) return `water tile ${t} has land feature ${f}`;
        if (!water && f !== null && FEATURES[f].onWater) return `land tile ${t} has water feature ${f}`;
        const nbs = w.globe.tiles[t].neighbors;
        if (m.biome[t] === 'shallowSea' && !ball(w.globe, t, 2).tiles.some((x) => !isWaterKey(m.biome[x]))) return `shallow sea ${t} is more than 2 tiles from land`;
        if (m.biome[t] === 'ocean' && nbs.some((nb) => !isWaterKey(m.biome[nb]))) return `deep ocean ${t} touches land`;
      }
      return null;
    },
  },
};

export const CHECK_IDS = Object.keys(CHECKS) as CheckId[];

export interface Violation {
  id: CheckId;
  message: string;
}

export function checkWorld(w: WorldView, only: readonly CheckId[] = CHECK_IDS): Violation[] {
  const out: Violation[] = [];
  for (const id of only) {
    const message = CHECKS[id].check(w);
    if (message !== null) out.push({ id, message });
  }
  return out;
}
