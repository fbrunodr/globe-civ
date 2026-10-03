import * as THREE from 'three';
import { mulberry32, makePerlin, type Noise3, type Rng } from './rng.ts';
import type { Globe } from './goldberg.ts';
import type { MapSizeKey } from './rules.ts';
import { featureAllowed, type BiomeKey, type ReliefKey, type FeatureKey } from './terrain.ts';
import { RIVER_DEFAULTS, borderBetween, generateRivers, type River } from './rivers.ts';
import {
  MAP_LIMITS, FORBIDDEN_NEIGHBORS, ball, bfs, components, latDeg, isNavigable, isWorldOcean, isWaterKey, shelfLinkedGroups,
  type MapLimits, type Range,
} from './mapRules.ts';

export interface MapData {
  biome: BiomeKey[];
  relief: ReliefKey[];
  feature: (FeatureKey | null)[];
  // Normalized elevation: <0 below sea level (depth), 0..1 above.
  elevation: Float32Array;
  temperature: Float32Array; // mean annual °C at the tile's altitude
  rainfall: Float32Array;    // mm / year
  flow: Float32Array;        // rain drained through the tile (tile-level drainage)
  rivers: River[];           // along tile edges, source to mouth (see rivers.ts)
  riverTile: Uint8Array;     // 1 = the tile borders a river
  cornerElevation: Float32Array;
}

// Share of all tiles that is land (G4 allows 35–40%).
const LAND_SHARE = 0.375;
// Highest land in the world ≈ this many km; used for the lapse rate.
const PEAK_KM = 5;
const LAPSE_PER_KM = 6.5;
// Annual mean temperatures below which the sea freezes / land is buried in ice.
const SEA_ICE_TEMP = -9;
const ICE_SHEET_TEMP = -13;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const quantile = (arr: ArrayLike<number>, q: number): number => {
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
};

// Piecewise-linear lookup over sorted [x, y] pairs.
const piecewise = (pts: readonly (readonly [number, number])[], x: number): number => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (x <= x1) {
      const [x0, y0] = pts[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
};

const randInt = (rand: Rng, rg: Range) => rg.min + Math.floor(rand() * (rg.max - rg.min + 1));

function shuffle<T>(rand: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

// Sea-level mean annual temperature by |latitude| in degrees.
const SEA_LEVEL_TEMP: readonly (readonly [number, number])[] = [
  [0, 27], [15, 25.5], [30, 20], [45, 12.5], [60, 3], [70, -5], [78, -14], [84, -20], [90, -28],
];

// Rainfall by |latitude| from the three-cell circulation: wet rising air at the
// equator and ~60°, dry sinking air at ~30° and the poles.
const LAT_RAIN: readonly (readonly [number, number])[] = [
  [0, 3000], [8, 2500], [15, 1500], [22, 650], [28, 330], [35, 700], [45, 1150], [55, 1200], [65, 700], [75, 320], [90, 120],
];

const ridged = (n: Noise3, p: THREE.Vector3, freq: number, octaves: number): number => {
  let sum = 0, amp = 0.5, f = freq, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const v = 1 - Math.abs(n.noise(p.x * f + 11.3, p.y * f - 7.1, p.z * f + 3.7) * 1.6);
    sum += amp * v * v;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
};

// Generates one map, or null when this seed cannot satisfy a guarantee by
// construction (the caller then retries with a derived seed).
export function generateMap(globe: Globe, seed: number, size: MapSizeKey): MapData | null {
  const limits = MAP_LIMITS[size];
  const rand = mulberry32(seed);
  const shapeNoise = makePerlin(rand), ridgeNoise = makePerlin(rand), detailNoise = makePerlin(rand);
  const rainNoise = makePerlin(rand), tempNoise = makePerlin(rand);
  const o = [rand() * 50, rand() * 50, rand() * 50] as const;
  const { tiles } = globe;
  const N = tiles.length;
  const latArr = Float32Array.from(tiles, (t) => latDeg(globe, t.id));
  const lat = (t: number) => latArr[t];

  // ---------- 1. land: continents, an optional polar landmass, islands ----------
  const coastNoiseGen = makePerlin(rand), shelfNoise = makePerlin(rand);
  const land = buildLand(globe, limits, rand, (t) => {
    // Domain-warped noise: warping the lookup position bends features into
    // curling, irregular shapes instead of round cells.
    const c = tiles[t].center;
    const wx = detailNoise.fbm(c.x * 1.6 + 3.1, c.y * 1.6, c.z * 1.6, 2);
    const wy = detailNoise.fbm(c.x * 1.6, c.y * 1.6 + 7.7, c.z * 1.6, 2);
    const wz = detailNoise.fbm(c.x * 1.6, c.y * 1.6, c.z * 1.6 + 1.9, 2);
    return 0.5 + shapeNoise.fbm((c.x + 0.7 * wx) * 2.6 + o[0], (c.y + 0.7 * wy) * 2.6 + o[1], (c.z + 0.7 * wz) * 2.6 + o[2], 4);
  }, (t) => {
    const c = tiles[t].center;
    return 0.5 + coastNoiseGen.fbm(c.x * 6 + o[2], c.y * 6 + o[0], c.z * 6 + o[1], 3) * 1.4;
  });
  if (!land) return null;
  const isLand = (t: number) => land[t] === 1;

  // ---------- 2. elevation ----------
  const coastDist = bfs(globe, tiles.filter((t) => !isLand(t.id)).map((t) => t.id));
  const landDist = bfs(globe, tiles.filter((t) => isLand(t.id)).map((t) => t.id));
  const raw = new Float64Array(N);
  for (let t = 0; t < N; t++) {
    if (!isLand(t)) continue;
    const c = tiles[t].center;
    const inland = 1 - Math.exp(-coastDist[t] / 3);
    const detail = 0.5 + detailNoise.fbm(c.x * 4 + o[1], c.y * 4 + o[2], c.z * 4 + o[0], 3);
    const ridge = ridged(ridgeNoise, c, 2.0, 3);
    raw[t] = 0.45 * inland + 0.3 * detail + 0.7 * Math.pow(ridge, 3) * smoothstep(0.15, 0.6, inland);
  }
  let maxRaw = 0;
  for (let t = 0; t < N; t++) if (isLand(t)) maxRaw = Math.max(maxRaw, raw[t]);
  const elevation = new Float32Array(N);
  for (let t = 0; t < N; t++) elevation[t] = isLand(t) ? raw[t] / maxRaw : -Math.min(1, landDist[t] / 6);

  const landElev = [...elevation].filter((e) => e >= 0);
  const mountainLevel = quantile(landElev, 0.93);
  const hillLevel = quantile(landElev, 0.78);
  const lowland = quantile(landElev, 0.2);   // coastal plains and deltas
  const midland = quantile(landElev, 0.6);

  // ---------- 3. climate ----------
  const seaLevelTemp = new Float32Array(N);
  const temperature = new Float32Array(N);
  for (let t = 0; t < N; t++) {
    const c = tiles[t].center;
    const wobble = 2.5 * tempNoise.fbm(c.x * 2.5, c.y * 2.5, c.z * 2.5, 3);
    seaLevelTemp[t] = piecewise(SEA_LEVEL_TEMP, lat(t)) + wobble;
    temperature[t] = seaLevelTemp[t] - LAPSE_PER_KM * (isLand(t) ? elevation[t] * PEAK_KM : 0);
  }

  const Y = new THREE.Vector3(0, 1, 0);
  const upwind = (t: number): THREE.Vector3 => {
    const east = new THREE.Vector3().crossVectors(Y, tiles[t].center);
    if (east.lengthSq() < 1e-9) return east;
    east.normalize();
    // Trade winds and polar easterlies arrive from the east; westerlies from the west.
    return lat(t) < 30 || lat(t) > 62 ? east : east.negate();
  };
  const rainfall = new Float32Array(N);
  const maritime = new Uint8Array(N);
  for (let t = 0; t < N; t++) {
    const c = tiles[t].center;
    let rain = piecewise(LAT_RAIN, lat(t));
    if (isLand(t)) {
      // Continentality: interiors are drier (0.25 rad ≈ 1,600 km).
      rain *= 0.45 + 0.55 * Math.exp(-(coastDist[t] * globe.avgEdgeAngle) / 0.3);
      // Rain shadow: walk upwind; mountains crossed before reaching the sea dry the air.
      const dir = upwind(t);
      let cur = t, shadow = 1, windward = false;
      if (dir.lengthSq() > 0) {
        for (let step = 0; step < 6; step++) {
          // The most upwind neighbor maximizes (nb - cur)·dir, i.e. nb·dir.
          let best = -1, bestDot = -Infinity;
          for (const nb of tiles[cur].neighbors) {
            const d = tiles[nb].center.dot(dir);
            if (d > bestDot) { bestDot = d; best = nb; }
          }
          cur = best;
          if (!isLand(cur)) { windward = step < 2; if (step < 3) maritime[t] = 1; break; }
          if (elevation[cur] >= mountainLevel && elevation[t] < mountainLevel) shadow *= 0.5;
          else if (elevation[cur] >= hillLevel && elevation[t] < hillLevel) shadow *= 0.85;
        }
      }
      rain *= shadow;
      if (windward && elevation[t] >= hillLevel) rain *= 1.35; // orographic lift
    }
    rain *= 0.75 + 0.5 * (0.5 + rainNoise.fbm(c.x * 3 + o[2], c.y * 3 + o[0], c.z * 3 + o[1], 3));
    rainfall[t] = Math.max(20, rain);
  }

  // Drainage: every land tile drains to its lowest lower neighbor.
  const down = new Int32Array(N).fill(-1);
  for (let t = 0; t < N; t++) {
    if (!isLand(t)) continue;
    let best = -1, bestE = elevation[t];
    for (const nb of tiles[t].neighbors) if (elevation[nb] < bestE) { bestE = elevation[nb]; best = nb; }
    down[t] = best;
  }
  const flow = new Float32Array(N);
  const byHeight = [...Array(N).keys()].filter(isLand).sort((a, b) => elevation[b] - elevation[a]);
  for (const t of byHeight) {
    flow[t] += rainfall[t];
    if (down[t] >= 0 && isLand(down[t])) flow[down[t]] += flow[t];
  }

  // ---------- 4. relief and biomes ----------
  const relief = new Array<ReliefKey>(N).fill('flat');
  for (let t = 0; t < N; t++) {
    if (!isLand(t)) continue;
    if (elevation[t] >= mountainLevel) relief[t] = 'mountains';
    else if (elevation[t] >= hillLevel) relief[t] = 'hills';
  }
  // A lone peak is just a high hill: mountains only come in ranges (R2).
  for (let t = 0; t < N; t++) {
    if (relief[t] === 'mountains' && !tiles[t].neighbors.some((nb) => relief[nb] === 'mountains')) relief[t] = 'hills';
  }
  // Flat land takes the climate at sea level; hills and mountains are colder,
  // but only up to hill altitude so ranges keep their region's biome (peaks
  // get glaciers instead).
  const biomeTemp = (t: number) =>
    seaLevelTemp[t] - (relief[t] === 'flat' ? 0 : LAPSE_PER_KM * Math.min(elevation[t], hillLevel) * PEAK_KM);
  const biome = new Array<BiomeKey>(N);
  for (let t = 0; t < N; t++) {
    biome[t] = isLand(t)
      ? landBiome(biomeTemp(t), rainfall[t], lat(t), maritime[t] === 1)
      : seaLevelTemp[t] < SEA_ICE_TEMP ? 'seaIce' : 'ocean';
  }
  const feature = new Array<FeatureKey | null>(N).fill(null);
  const toLand = (t: number) => { relief[t] = 'flat'; biome[t] = landBiome(biomeTemp(t), rainfall[t], lat(t), maritime[t] === 1); };
  const toWater = (t: number, b: BiomeKey) => { biome[t] = b; relief[t] = 'flat'; feature[t] = null; };

  // ---------- 5. lakes ----------
  // Small water bodies cut off from the world ocean become lakes.
  const water = components(globe, (t) => !isLand(t));
  for (const comp of water.slice(1)) for (const t of comp) toWater(t, 'lake');
  const touchesOcean = (t: number) => tiles[t].neighbors.some((nb) => isWorldOcean(biome[nb]));
  const touchesLake = (t: number) => tiles[t].neighbors.some((nb) => biome[nb] === 'lake');
  const lakeSite = (t: number) => !isWaterKey(biome[t]) && relief[t] === 'flat' &&
    biome[t] !== 'iceSheet' && !touchesOcean(t) && !touchesLake(t);
  // Basins that collect a lot of water.
  const basinFlow = quantile(byHeight.map((t) => flow[t]), 0.8);
  for (const t of byHeight) {
    if (down[t] === -1 && flow[t] >= basinFlow && lakeSite(t) && rand() < 0.8) toWater(t, 'lake');
  }
  // Bring the lake count into range: add lakes where the most water flows,
  // or fill in the smallest lakes.
  let lakes = components(globe, (t) => biome[t] === 'lake');
  if (lakes.length < limits.lakes.min) {
    const sites = byHeight.filter(lakeSite).sort((a, b) => flow[b] - flow[a]);
    for (const t of sites) {
      if (lakes.length >= limits.lakes.min) break;
      if (!lakeSite(t)) continue;
      toWater(t, 'lake');
      lakes.push([t]);
    }
  }
  lakes = components(globe, (t) => biome[t] === 'lake');
  for (const lake of lakes.slice(limits.lakes.max)) for (const t of lake) toLand(t);
  for (const lake of components(globe, (t) => biome[t] === 'lake')) {
    if (lake.length > limits.lakeMaxTiles) for (const t of lake.slice(limits.lakeMaxTiles)) toLand(t);
  }

  // ---------- 6. one connected open sea (G2) ----------
  if (!connectSeas(globe, biome, relief, feature, limits, lat)) return null;

  // Coasts: open water touching land is shallow; here and there the shelf
  // reaches a second tile out. Open water beyond is deep.
  const isLandBiome = (b: BiomeKey) => !isWaterKey(b);
  for (let t = 0; t < N; t++) {
    if (isNavigable(biome[t])) {
      biome[t] = tiles[t].neighbors.some((nb) => isLandBiome(biome[nb])) ? 'shallowSea' : 'ocean';
    }
  }
  const shelf = (t: number) => { const c = tiles[t].center; return 0.5 + shelfNoise.fbm(c.x * 5 + o[0], c.y * 5 + o[2], c.z * 5 + o[1], 3); };
  // The outer shelf only forms where no other landmass is within 6 tiles, so
  // shelves never eat into the deep ocean between landmasses (G8).
  const massOf = new Int32Array(N).fill(-1);
  components(globe, (t) => isLandBiome(biome[t])).forEach((m, i) => { for (const t of m) massOf[t] = i; });
  const outerShelf = tiles.map((t) => t.id).filter((t) => {
    if (biome[t] !== 'ocean' || shelf(t) <= 0.52 || !tiles[t].neighbors.some((nb) => biome[nb] === 'shallowSea')) return false;
    const masses = new Set<number>();
    for (const x of ball(globe, t, 6).tiles) if (massOf[x] >= 0) masses.add(massOf[x]);
    return masses.size <= 1;
  });
  for (const t of outerShelf) biome[t] = 'shallowSea';
  // G7: early boats follow shallow water, so no continent may be reachable
  // from another without crossing deep ocean. Outer shelf linking two
  // continents is dropped back to deep ocean.
  for (const group of shelfLinkedGroups(globe, { biome }, limits)) {
    for (const t of group) {
      if (biome[t] === 'shallowSea' && !tiles[t].neighbors.some((nb) => isLandBiome(biome[nb]))) biome[t] = 'ocean';
    }
  }
  if (shelfLinkedGroups(globe, { biome }, limits).length) return null;

  // ---------- 7. climate repairs ----------
  repairNeighbors(globe, biome);
  ensureBiomes(globe, biome, relief, feature, limits, biomeTemp, rainfall, lat, rand);
  repairNeighbors(globe, biome);

  // ---------- 8. rivers ----------
  // Lower the water threshold step by step until the map has its required
  // rivers and long rivers (V1, V5).
  const longEnough = (r: River) => !r.tributary && r.corners.length - 1 >= limits.longRiverEdges;
  let network = generateRivers(globe, biome, elevation, rainfall);
  for (const q of [0.92, 0.91, 0.9, 0.88, 0.86, 0.84]) {
    const mains = network.rivers.filter((r) => !r.tributary).length;
    if (mains >= limits.rivers.min && network.rivers.filter(longEnough).length >= limits.longRivers) break;
    network = generateRivers(globe, biome, elevation, rainfall, { ...RIVER_DEFAULTS, flowQuantile: q });
  }
  const { rivers, cornerElevation } = network;
  const riverTile = new Uint8Array(N);
  const riverFlowAt = new Float32Array(N);
  for (const r of rivers) {
    for (let i = 0; i + 1 < r.corners.length; i++) {
      const pair = borderBetween(globe, r.corners[i], r.corners[i + 1]);
      if (!pair) continue;
      for (const t of pair) { riverTile[t] = 1; riverFlowAt[t] = Math.max(riverFlowAt[t], r.flow[i]); }
    }
  }
  const riverFlows = [...riverFlowAt].filter((f) => f > 0).sort((a, b) => a - b);
  const bigRiver = riverFlows[Math.floor(riverFlows.length * 0.4)] ?? Infinity;

  // ---------- 9. features ----------
  const touchesSea = (t: number) => tiles[t].neighbors.some((nb) => isNavigable(biome[nb]));
  const touchesWater = (t: number) => tiles[t].neighbors.some((nb) => isWaterKey(biome[nb]));
  const allowed = (f: FeatureKey, t: number) =>
    feature[t] === null && featureAllowed(f, { biome: biome[t], relief: relief[t], feature: null }, touchesSea(t), touchesWater(t));

  // Glaciers: the coldest peaks below the threshold, at most half of all mountains (F5).
  const mountains = tiles.map((t) => t.id).filter((t) => relief[t] === 'mountains');
  const glacierCap = Math.floor(limits.glacierMaxMountainShare * mountains.length);
  mountains.filter((t) => temperature[t] < limits.glacierMaxTemp && allowed('glacier', t))
    .sort((a, b) => temperature[a] - temperature[b]).slice(0, glacierCap)
    .forEach((t) => { feature[t] = 'glacier'; });

  // Volcanoes: an exact count, far apart, favoring coastal ranges (F1).
  const volcanoSites = shuffle(rand, mountains.filter((t) => allowed('volcano', t)))
    .sort((a, b) => (coastDist[a] <= 3 ? 0 : 1) - (coastDist[b] <= 3 ? 0 : 1));
  if (!pickSpaced(globe, volcanoSites, randInt(rand, limits.volcanoes), limits.volcanoSpacing, (t) => { feature[t] = 'volcano'; })) return null;

  // Floodplains and riverside wetlands follow the bigger rivers; coastal
  // marshes and swamps form in wet lowlands by the water.
  const FORESTED: ReadonlySet<BiomeKey> = new Set(['temperateForest', 'temperateRainforest', 'monsoonForest', 'jungle']);
  for (let t = 0; t < N; t++) {
    if (!isLandBiome(biome[t]) || relief[t] !== 'flat' || feature[t]) continue;
    const r = rand();
    const wetland = (): FeatureKey | null =>
      FORESTED.has(biome[t]) && seaLevelTemp[t] > 10 && allowed('swamp', t) ? 'swamp' : allowed('marsh', t) ? 'marsh' : null;
    if (allowed('mangrove', t) && rainfall[t] > 1100 && r < 0.45) feature[t] = 'mangrove';
    else if (riverTile[t] && riverFlowAt[t] >= bigRiver && temperature[t] > 2 && elevation[t] < midland && r < 0.7) {
      feature[t] = rainfall[t] > 1400 && FORESTED.has(biome[t]) ? wetland() : allowed('floodplain', t) ? 'floodplain' : null;
    } else if (elevation[t] < lowland && temperature[t] > 0 && rainfall[t] > 700 && touchesWater(t) && r < 0.3) {
      feature[t] = wetland();
    }
  }

  // Oases: an exact count in deserts, spread out (F4).
  const oasisSites = shuffle(rand, tiles.map((t) => t.id).filter((t) => allowed('oasis', t)));
  if (!pickSpaced(globe, oasisSites, randInt(rand, limits.oases), limits.oasisSpacing, (t) => { feature[t] = 'oasis'; })) return null;

  // Reef systems in warm shallows, kelp forests in cool ones (F2, F3).
  const shallowFree = (t: number) => biome[t] === 'shallowSea' && feature[t] === null;
  if (!growClusters(globe, rand, (t) => shallowFree(t) && seaLevelTemp[t] > 21, randInt(rand, limits.reefSystems), limits.clusterTiles, (t) => { feature[t] = 'reef'; })) return null;
  if (!growClusters(globe, rand, (t) => shallowFree(t) && seaLevelTemp[t] > 4 && seaLevelTemp[t] < 16, randInt(rand, limits.kelpSystems), limits.clusterTiles, (t) => { feature[t] = 'kelp'; })) return null;

  return { biome, relief, feature, elevation, temperature, rainfall, flow, rivers, riverTile, cornerElevation };
}

// ---------- land ----------

// Any two landmasses keep at least this many tiles between them (4 water
// tiles), so their shallow shelves can always be kept apart (G7).
const LANDMASS_GAP = 4;
// Continents keep even more room: shallow coast + 4 deep tiles + shallow coast (G8).
const CONTINENT_GAP = 6;

// Returns 1 for land, 0 for water. Continents grow from separate seeds,
// cheapest-first through a high-contrast noise cost field (which makes
// peninsulas and bays rather than blobs), each stretched along its own axis.
// A coastline pass then cuts bays and adds capes. Islands go in open ocean.
function buildLand(globe: Globe, limits: MapLimits, rand: Rng, roughness: (t: number) => number,
  coastNoise: (t: number) => number): Uint8Array | null {
  const { tiles } = globe;
  const N = tiles.length;
  const landTarget = Math.round(N * LAND_SHARE);
  const minContinent = Math.ceil(limits.continentMinTileShare * N * 1.2);
  const owner = new Int16Array(N).fill(-1);
  const lats = Float32Array.from(tiles, (t) => latDeg(globe, t.id));
  // exp() turns gentle noise into sharp contrast: cheap valleys the land
  // races along, expensive ridges it wraps around.
  const cost = Float32Array.from(tiles, (t) => Math.exp(3.4 * (roughness(t.id) - 0.5)));
  const coast = Float32Array.from(tiles, (t) => coastNoise(t.id));

  // How many continents, and how big each one is.
  // Uniform over the allowed continent counts, weighted away from the extremes.
  const counts0 = Array.from({ length: limits.continents.max - limits.continents.min + 1 }, (_, i) => limits.continents.min + i);
  const weighted = counts0.flatMap((k) => (k === limits.continents.min || k === limits.continents.max ? [k] : [k, k]));
  const K = weighted[Math.floor(rand() * weighted.length)];
  const polar = rand() < 0.5;
  const islandBudget = Math.round(landTarget * 0.04);
  const polarBudget = polar ? Math.round(landTarget * 0.035) : 0;
  const continentBudget = landTarget - islandBudget - polarBudget;
  let shares = Array.from({ length: K }, () => 0.6 + rand());
  const total = shares.reduce((a, b) => a + b, 0);
  shares = shares.map((s) => s / total);
  const cap = Math.floor(limits.largestContinentMaxLandShare * 0.85 * landTarget);
  const targets = shares.map((s) => Math.min(cap, Math.max(minContinent, Math.round(s * continentBudget))));

  // Continent centers: away from the poles and from each other.
  const centers: number[] = [];
  const minSep = K <= 3 ? 1.0 : K === 4 ? 0.85 : 0.75;
  for (let tries = 0; tries < 2000 && centers.length < K; tries++) {
    const t = Math.floor(rand() * N);
    if (lats[t] > 50) continue;
    if (centers.some((c) => tiles[c].center.angleTo(tiles[t].center) < minSep)) continue;
    centers.push(t);
  }
  if (centers.length < K) return null;

  // Each continent stretches along a random great circle through its center:
  // growth costs more the farther a tile is from that line.
  const stretchNormal = centers.map((c) => {
    const n = tiles[c].center;
    const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const a = new THREE.Vector3().crossVectors(n, helper).normalize();
    const b = new THREE.Vector3().crossVectors(n, a);
    const ang = rand() * Math.PI;
    const axis = a.multiplyScalar(Math.cos(ang)).add(b.multiplyScalar(Math.sin(ang)));
    return new THREE.Vector3().crossVectors(n, axis).normalize();
  });
  const stretch = centers.map(() => (rand() < 0.3 ? 0 : 1 + 4 * rand()));

  const counts: number[] = new Array<number>(K + 1).fill(0);
  const POLAR = K;
  // A tile may join landmass `id` only if no other landmass is within the gap.
  // `zone[x]` records which landmass has land within the gap of x (-1 none,
  // -2 several), so the check is one lookup instead of a neighborhood scan.
  // `contZone` does the same for continents only, over the wider continent gap.
  const zone = new Int16Array(N).fill(-1);
  const contZone = new Int16Array(N).fill(-1);
  const mark = (arr: Int16Array, t: number, id: number, radius: number) => {
    for (const x of ball(globe, t, radius).tiles) arr[x] = arr[x] === -1 || arr[x] === id ? id : -2;
  };
  const markZone = (t: number, id: number) => {
    mark(zone, t, id, LANDMASS_GAP);
    if (id < K) mark(contZone, t, id, CONTINENT_GAP);
  };
  // Zones are never rebuilt when land is removed (bays, scraps): a stale
  // entry only keeps *other* landmasses farther away, which is always safe.
  const freeFor = (t: number, id: number) => owner[t] === -1 && (zone[t] === -1 || zone[t] === id) &&
    (id >= K || contZone[t] === -1 || contZone[t] === id);
  const landCount = () => counts.reduce((a, b) => a + b, 0);

  const grow = (seeds: readonly number[], ids: readonly number[], caps: ReadonlyMap<number, number>, stopAt: number) => {
    const heap = new MinHeap();
    const best = new Float64Array(N).fill(Infinity);
    seeds.forEach((s, i) => { heap.push(0, s, ids[i]); best[s] = 0; });
    let landNow = landCount();
    while (heap.size && landNow < stopAt) {
      const [c0, t, id] = heap.pop();
      if (owner[t] === -1) {
        if (counts[id] >= (caps.get(id) ?? 0) || !freeFor(t, id)) continue;
        owner[t] = id;
        markZone(t, id);
        counts[id]++;
        landNow++;
      } else if (owner[t] !== id) continue;
      for (const nb of tiles[t].neighbors) {
        if (owner[nb] !== -1) continue;
        const la = lats[nb];
        let step = 0.25 + cost[nb] + (la > 60 ? (la - 60) * 0.3 : 0);
        if (id < K && stretch[id] > 0) {
          const off = Math.asin(Math.min(1, Math.abs(tiles[nb].center.dot(stretchNormal[id])))) / 0.3;
          step *= 1 + stretch[id] * off * off;
        }
        if (c0 + step < best[nb]) { best[nb] = c0 + step; heap.push(c0 + step, nb, id); }
      }
    }
  };

  const ids = centers.map((_, i) => i);
  grow(centers, ids, new Map(ids.map((i) => [i, targets[i]])), continentBudget);

  // Coastline pass: cut bays where the coast noise is high, add capes where it is low.
  for (let pass = 0; pass < 2; pass++) {
    const coastal = tiles.filter((t) => owner[t.id] >= 0 && owner[t.id] < K && t.neighbors.some((nb) => owner[nb] === -1)).map((t) => t.id);
    for (const t of coastal) if (coast[t] > 0.7) { counts[owner[t]]--; owner[t] = -1; }
    const shore = tiles.filter((t) => owner[t.id] === -1 && t.neighbors.some((nb) => owner[nb] >= 0 && owner[nb] < K)).map((t) => t.id);
    for (const t of shore) {
      if (coast[t] >= 0.25) continue;
      const id = owner[tiles[t].neighbors.find((nb) => owner[nb] >= 0 && owner[nb] < K)!];
      if (freeFor(t, id)) { owner[t] = id; markZone(t, id); counts[id]++; }
    }
  }
  // Bays can cut off scraps; keep each continent as its largest connected piece.
  for (const id of ids) {
    const parts = components(globe, (t) => owner[t] === id);
    for (const scrap of parts.slice(1)) for (const t of scrap) { owner[t] = -1; counts[id]--; }
  }
  if (ids.some((i) => counts[i] < minContinent)) return null;

  if (polar) {
    const ys = tiles.map((t) => t.center.y);
    const p = rand() < 0.5 ? ys.indexOf(Math.max(...ys)) : ys.indexOf(Math.min(...ys));
    grow([p], [POLAR], new Map([[POLAR, polarBudget]]), landCount() + polarBudget);
  }

  // Islands: small blobs in open ocean, clear of every other landmass.
  const islandCount = Math.max(limits.islands.min + 2, Math.round(N / 450)) + Math.floor(rand() * 4);
  const islandSize = Math.max(2, Math.round((islandBudget / islandCount) * 2));
  let placed = 0;
  for (let tries = 0; tries < 800 && placed < islandCount; tries++) {
    const s = Math.floor(rand() * N);
    if (lats[s] > 65 || owner[s] !== -1) continue;
    if (zone[s] !== -1) continue;
    const id = counts.length;
    counts.push(0);
    grow([s], [id], new Map([[id, 1 + Math.floor(rand() * islandSize)]]), Infinity);
    placed++;
  }

  // Top up to the land target by letting continents grow past their share,
  // within the dominance cap (G3).
  if (landCount() < landTarget) {
    const seeds: number[] = [], seedIds: number[] = [];
    for (let t = 0; t < N; t++) if (owner[t] >= 0 && owner[t] < K) { seeds.push(t); seedIds.push(owner[t]); }
    grow(seeds, seedIds, new Map(ids.map((i) => [i, cap])), landTarget);
  }

  const out = new Uint8Array(N);
  for (let t = 0; t < N; t++) out[t] = owner[t] === -1 ? 0 : 1;
  return out;
}

// ---------- seas ----------

// Makes all open water (ocean + shallow sea) one connected body. Small pockets
// cut off by polar ice freeze over; others get a channel cut to the main sea.
function connectSeas(globe: Globe, biome: BiomeKey[], relief: ReliefKey[], feature: (FeatureKey | null)[],
  limits: MapLimits, lat: (t: number) => number): boolean {
  for (let pass = 0; pass < 6; pass++) {
    const seas = components(globe, (t) => isNavigable(biome[t]));
    if (seas.length <= 1) return true;
    const main = new Set(seas[0]);
    for (const pocket of seas.slice(1)) {
      const meanLat = pocket.reduce((a, t) => a + lat(t), 0) / pocket.length;
      if (meanLat > 60 && pocket.length <= limits.lakeMaxTiles * 3) {
        for (const t of pocket) { biome[t] = 'seaIce'; relief[t] = 'flat'; feature[t] = null; }
        continue;
      }
      // Shortest path through land or ice (never lakes, never the polar cap) to the main sea.
      const inPocket = new Set(pocket);
      const prev = new Int32Array(globe.tiles.length).fill(-2);
      for (const t of pocket) prev[t] = -1;
      let frontier = [...pocket];
      let hit = -1;
      while (frontier.length && hit < 0) {
        const next: number[] = [];
        for (const f of frontier) {
          for (const nb of globe.tiles[f].neighbors) {
            if (prev[nb] !== -2 || biome[nb] === 'lake' || lat(nb) > 78) continue;
            prev[nb] = f;
            if (main.has(nb)) { hit = nb; break; }
            if (!isNavigable(biome[nb])) next.push(nb);
          }
          if (hit >= 0) break;
        }
        frontier = next;
      }
      if (hit < 0) return false;
      for (let t = prev[hit]; t >= 0 && !inPocket.has(t); t = prev[t]) {
        biome[t] = 'ocean'; relief[t] = 'flat'; feature[t] = null;
      }
    }
  }
  return components(globe, (t) => isNavigable(biome[t])).length <= 1;
}

// ---------- climate repairs ----------

// Warm biomes touching forbidden cold ones (C5) become a transition biome.
const TRANSITION: Partial<Record<BiomeKey, BiomeKey>> = { hotDesert: 'coldDesert', jungle: 'monsoonForest' };

function repairNeighbors(globe: Globe, biome: BiomeKey[]): void {
  for (const [warm, colds] of FORBIDDEN_NEIGHBORS) {
    for (let t = 0; t < biome.length; t++) {
      if (biome[t] === warm && globe.tiles[t].neighbors.some((nb) => colds.includes(biome[nb]))) {
        biome[t] = TRANSITION[warm] ?? biome[t];
      }
    }
  }
}

// Typical climate of each land biome: [°C, mm rain, min |lat|, max |lat|].
// Used to plant a rare biome where the climate fits best when a map would
// otherwise lack it (C6).
const BIOME_CLIMATE: Partial<Record<BiomeKey, readonly [number, number, number, number]>> = {
  iceSheet: [-16, 150, 55, 90],
  tundra: [-6, 300, 50, 90],
  taiga: [0, 500, 45, 75],
  coldDesert: [8, 180, 25, 55],
  steppe: [12, 400, 25, 55],
  prairie: [12, 750, 25, 55],
  temperateForest: [12, 1400, 25, 60],
  temperateRainforest: [11, 2300, 35, 60],
  mediterranean: [16, 600, 28, 45],
  hotDesert: [24, 200, 10, 34],
  savanna: [25, 900, 0, 30],
  monsoonForest: [25, 1700, 0, 30],
  jungle: [26, 2600, 0, 20],
};

function ensureBiomes(globe: Globe, biome: BiomeKey[], relief: ReliefKey[], feature: (FeatureKey | null)[],
  limits: MapLimits, temp: (t: number) => number, rain: Float32Array, lat: (t: number) => number, rand: Rng): void {
  const landBiomes = Object.keys(BIOME_CLIMATE) as BiomeKey[];
  const missing = landBiomes.filter((b) => !biome.includes(b));
  const present = landBiomes.length - missing.length;
  for (const b of shuffle(rand, missing).slice(0, Math.max(0, limits.biomesPresentMin - present))) {
    const [T, P, lo, hi] = BIOME_CLIMATE[b]!;
    let best = -1, bestD = Infinity;
    for (let t = 0; t < biome.length; t++) {
      if (isWaterKey(biome[t]) || feature[t] || lat(t) < lo || lat(t) > hi) continue;
      if (relief[t] !== 'flat' && !(b === 'iceSheet' && relief[t] === 'hills')) continue;
      const d = Math.abs(temp(t) - T) / 5 + Math.abs(Math.log(rain[t] / P));
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best < 0) continue;
    const from = biome[best];
    const patch = [best, ...globe.tiles[best].neighbors.filter((nb) => biome[nb] === from && relief[nb] === 'flat' && !feature[nb]).slice(0, 2)];
    for (const t of patch) biome[t] = b;
  }
}

// ---------- feature placement helpers ----------

// Takes `count` sites in order, skipping any closer than `spacing` tiles to
// one already taken. False if fewer than `count` fit.
function pickSpaced(globe: Globe, sites: readonly number[], count: number, spacing: number, mark: (t: number) => void): boolean {
  const blocked = new Uint8Array(globe.tiles.length);
  let taken = 0;
  for (const s of sites) {
    if (taken >= count) break;
    if (blocked[s]) continue;
    mark(s);
    taken++;
    for (const t of ball(globe, s, spacing - 1).tiles) blocked[t] = 1;
  }
  return taken >= count;
}

// Grows exactly `count` connected clusters with sizes in `size` that never
// touch each other. False if the map has no room for them.
function growClusters(globe: Globe, rand: Rng, eligible: (t: number) => boolean, count: number,
  size: Range, mark: (t: number) => void): boolean {
  const { tiles } = globe;
  const halo = new Uint8Array(tiles.length); // in or next to a cluster
  const cand = shuffle(rand, tiles.map((t) => t.id).filter(eligible));
  const minSeedAngle = globe.avgEdgeAngle * 8;
  const seeds: number[] = [];
  for (const s of cand) {
    if (seeds.length >= count) break;
    if (halo[s] || seeds.some((o) => tiles[o].center.angleTo(tiles[s].center) < minSeedAngle)) continue;
    const target = randInt(rand, size);
    const cluster = [s];
    const inCluster = new Set([s]);
    for (let i = 0; i < cluster.length && cluster.length < target; i++) {
      for (const nb of shuffle(rand, [...tiles[cluster[i]].neighbors])) {
        if (cluster.length >= target) break;
        if (!inCluster.has(nb) && !halo[nb] && eligible(nb)) { inCluster.add(nb); cluster.push(nb); }
      }
    }
    if (cluster.length < size.min) continue;
    seeds.push(s);
    for (const t of cluster) { halo[t] = 1; mark(t); }
    for (const t of cluster) for (const nb of tiles[t].neighbors) halo[nb] = 1;
  }
  return seeds.length === count;
}

// Whittaker-style biome lookup from temperature (°C) and rainfall (mm/yr).
function landBiome(T: number, P: number, lat: number, maritime: boolean): BiomeKey {
  if (T < ICE_SHEET_TEMP) return 'iceSheet';
  if (T < -3) return 'tundra';
  if (T < 4) return P < 200 ? 'coldDesert' : P < 350 ? 'tundra' : 'taiga';
  if (T < 20) {
    if (P < 250) return T >= 15 ? 'hotDesert' : 'coldDesert';
    // Wet winters, dry summers: west coasts around 30–45° latitude.
    if (maritime && lat > 28 && lat < 46 && T > 10 && P < 1000) return 'mediterranean';
    if (P < 550) return 'steppe';
    if (P < 900) return 'prairie';
    if (P < 2000) return 'temperateForest';
    return 'temperateRainforest';
  }
  if (P < 450) return 'hotDesert';
  if (P < 1300) return 'savanna';
  if (P < 2000) return 'monsoonForest';
  return 'jungle';
}

class MinHeap {
  private keys: number[] = [];
  private tilesQ: number[] = [];
  private idsQ: number[] = [];

  get size(): number { return this.keys.length; }

  push(key: number, tile: number, id: number): void {
    this.keys.push(key); this.tilesQ.push(tile); this.idsQ.push(id);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): [number, number, number] {
    const top: [number, number, number] = [this.keys[0], this.tilesQ[0], this.idsQ[0]];
    const k = this.keys.pop()!, tl = this.tilesQ.pop()!, id = this.idsQ.pop()!;
    if (this.keys.length) {
      this.keys[0] = k; this.tilesQ[0] = tl; this.idsQ[0] = id;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.tilesQ[a], this.tilesQ[b]] = [this.tilesQ[b], this.tilesQ[a]];
    [this.idsQ[a], this.idsQ[b]] = [this.idsQ[b], this.idsQ[a]];
  }
}
