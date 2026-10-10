import * as THREE from 'three';
import type { BiomeKey, ReliefKey, FeatureKey } from './terrain.ts';
import type { MapData } from './mapgen.ts';

// How terrain looks. Each layer has a Record keyed by its full key union, so
// adding a biome, relief or feature without a look is a compile error.

// Procedural surface detail painted by the terrain shader (all 0..1).
export interface Detail {
  grain: number;  // fine speckle + medium patchiness
  patch: number;  // blotches of patchColor (water pools, coral, kelp)
  strata: number; // horizontal rock bands
  dunes: number;  // wind ripples
  bump: number;   // strength of the bumpy normal (kills the "plastic" look)
}

export interface BiomeLook {
  color: number;
  rock: number; // bare rock showing on this biome's slopes (sandstone, granite...)
  detail: Detail;
  wet: number;  // 1 = water surface
}

const d = (grain: number, patch: number, strata: number, dunes: number, bump: number): Detail => ({ grain, patch, strata, dunes, bump });

export const BIOME_LOOK: Record<BiomeKey, BiomeLook> = {
  // Water tiles: the color is the bed's, seen through the water surface.
  ocean:               { color: 0x56605a, rock: 0x7d8a8c, detail: d(0.5, 0, 0, 0, 0.3), wet: 1 },
  shallowSea:          { color: 0x8d8466, rock: 0x8a9690, detail: d(0.6, 0, 0, 0.6, 0.4), wet: 1 },
  lake:                { color: 0x77735a, rock: 0x8a9690, detail: d(0.6, 0, 0, 0, 0.4), wet: 1 },
  seaIce:              { color: 0xd8e9f1, rock: 0xb9c9d1, detail: d(0.5, 0, 0, 0, 0.5), wet: 0.2 },
  iceSheet:            { color: 0xf3f7fa, rock: 0xa9b8c2, detail: d(0.35, 0, 0, 0.2, 0.5), wet: 0 },
  tundra:              { color: 0x8b8f74, rock: 0x8e8d86, detail: d(0.9, 0, 0, 0, 0.6), wet: 0 },
  taiga:               { color: 0x435c3c, rock: 0x7d7c73, detail: d(0.7, 0, 0, 0, 0.6), wet: 0 },
  coldDesert:          { color: 0xbcb093, rock: 0xa6977b, detail: d(1, 0, 0.15, 0, 0.9), wet: 0 },
  steppe:              { color: 0xa39e74, rock: 0x9f8f76, detail: d(0.8, 0, 0, 0, 0.5), wet: 0 },
  prairie:             { color: 0x718a47, rock: 0x958b7a, detail: d(0.7, 0, 0, 0, 0.5), wet: 0 },
  temperateForest:     { color: 0x55723c, rock: 0x8b8170, detail: d(0.7, 0, 0, 0, 0.6), wet: 0 },
  temperateRainforest: { color: 0x41603a, rock: 0x75746a, detail: d(0.7, 0, 0, 0, 0.6), wet: 0 },
  mediterranean:       { color: 0x969166, rock: 0xb59a72, detail: d(0.9, 0, 0, 0, 0.6), wet: 0 },
  hotDesert:           { color: 0xd9c5a0, rock: 0xc68d5c, detail: d(0.5, 0, 0, 1, 0.7), wet: 0 },
  savanna:             { color: 0xa99b69, rock: 0xb3845a, detail: d(0.85, 0, 0, 0, 0.5), wet: 0 },
  monsoonForest:       { color: 0x6c803f, rock: 0x9b7f62, detail: d(0.7, 0, 0, 0, 0.6), wet: 0 },
  jungle:              { color: 0x3e6c36, rock: 0x87735e, detail: d(0.6, 0, 0, 0, 0.6), wet: 0 },
};

export interface ReliefLook {
  height: number;   // plateau height above sea level (globe radius = 1)
  plateau: number;  // 0 = peaked like a cone, ~0.5 = flat top with soft edges
  roughness: number; // amplitude of noise displacement in the geometry
  rock: number;     // how strongly bare rock shows where the ground is steep
  stone: number;    // share of the biome's rock color mixed into the whole tile
  strata: number;
  bump: number;
}

export const RELIEF_LOOK: Record<ReliefKey, ReliefLook> = {
  flat:      { height: 0.007, plateau: 0.55, roughness: 0.0016, rock: 0.35, stone: 0,    strata: 0,    bump: 0 },
  hills:     { height: 0.015, plateau: 0.12, roughness: 0.004,  rock: 0.6,  stone: 0.12, strata: 0.15, bump: 0.3 },
  mountains: { height: 0.029, plateau: 0,    roughness: 0.02,   rock: 0.6,  stone: 0,    strata: 0.5,  bump: 0.6 },
};

export interface FeatureLook {
  color: number | null; // painted over the biome color
  rock: number | null;  // replaces the biome's rock color
  colorMix: number;
  patch: number;
  patchColor: number;
  heightDelta: number;  // added to the plateau height
  plateau: number | null;
  strata: number;
  wet: number;
}

export const FEATURE_LOOK: Record<FeatureKey, FeatureLook> = {
  // Wetland water is real (pools in the height field, see POOL_LOOK); the
  // patches are tussocks, mud and moss between the pools.
  marsh:      { color: 0x71895a, rock: null, colorMix: 0.55, patch: 0.5,  patchColor: 0x6d8d45, heightDelta: -0.0005, plateau: null, strata: 0, wet: 0.25 },
  swamp:      { color: 0x526b48, rock: null, colorMix: 0.5,  patch: 0.5,  patchColor: 0x4d5f3a, heightDelta: -0.0005, plateau: null, strata: 0, wet: 0.2 },
  mangrove:   { color: 0x48694f, rock: null, colorMix: 0.4,  patch: 0.5,  patchColor: 0x6b6247, heightDelta: -0.001, plateau: null, strata: 0, wet: 0.25 },
  bog:        { color: 0x7d7552, rock: null, colorMix: 0.55, patch: 0.55, patchColor: 0x6e6038, heightDelta: -0.0005, plateau: null, strata: 0, wet: 0.15 },
  floodplain: { color: 0x7d9750, rock: null, colorMix: 0.55, patch: 0.25, patchColor: 0x5d8a3a, heightDelta: -0.002, plateau: 0.7, strata: 0, wet: 0 },
  oasis:      { color: 0x71874a, rock: null, colorMix: 0.45, patch: 0.3,  patchColor: 0x6f8f3e, heightDelta: 0,      plateau: null, strata: 0, wet: 0 },
  volcano:    { color: 0x4a423c, rock: 0x3d3632, colorMix: 0.7,  patch: 0,    patchColor: 0x000000, heightDelta: 0.008,  plateau: null, strata: 0.3, wet: 0 },
  // Glaciers keep the mountain's colors; the renderer caps only the peak with ice.
  glacier:    { color: null,     rock: null, colorMix: 0,    patch: 0,    patchColor: 0x000000, heightDelta: 0.0026, plateau: null, strata: 0, wet: 0 },
  reef:       { color: 0x3fbcc0, rock: null, colorMix: 0.55, patch: 0.45, patchColor: 0xb59a8a, heightDelta: 0,      plateau: null, strata: 0, wet: 0 },
  kelp:       { color: 0x24646f, rock: null, colorMix: 0.45, patch: 0.5,  patchColor: 0x3f8a6a, heightDelta: 0,      plateau: null, strata: 0, wet: 0 },
};

// Open water and sea ice sit at sea level regardless of relief (sea ice a
// little above it).
export const SEA_LEVEL = 0;
const WATER_HEIGHT: Partial<Record<BiomeKey, number>> = { ocean: SEA_LEVEL, shallowSea: SEA_LEVEL, lake: SEA_LEVEL, seaIce: SEA_LEVEL + 0.003 };

// ---------- water ----------

// How a body of water looks: its color where deep (shallows are lighter and
// clearer, see the water shader) and how murky it is (1 = clear sea; higher
// = the bed fades out sooner and the color stays darker).
export interface WaterTint { deep: number; murk: number }

export const SEA_TINT: Record<'ocean' | 'shallowSea' | 'lake', WaterTint> = {
  ocean:      { deep: 0x123a6c, murk: 1 },
  shallowSea: { deep: 0x154573, murk: 1 },
  lake:       { deep: 0x124f5c, murk: 1.3 },
};
export const RIVER_TINT: WaterTint = { deep: 0x15505e, murk: 2.2 };

// Bed level of water tiles below sea level (relief.ts / surface.ts). Land
// tiles count as a shallow bed where the coast blends into the sea.
const BED: Record<'ocean' | 'shallowSea' | 'lake', number> = { ocean: -0.007, shallowSea: -0.0026, lake: -0.0034 };
const SHORE_BED = -0.0015;

// Wetlands and oases hold water of their own: pools in the ground at a level
// just under the tile's ground (sea level on the coast).
export interface PoolLook {
  tint: WaterTint;
  // Share of the ground under water: the pool pattern (noise, -0.6..0.6) is
  // flooded above this threshold. Oases have one pond in the middle instead.
  threshold: number;
  pond: boolean;
}

export const POOL_LOOK: Partial<Record<FeatureKey, PoolLook>> = {
  marsh:    { tint: { deep: 0x1d4a44, murk: 2.6 }, threshold: 0.02, pond: false },
  swamp:    { tint: { deep: 0x1e2e1a, murk: 4 },   threshold: 0.1,  pond: false },
  mangrove: { tint: { deep: 0x1f4840, murk: 2.4 }, threshold: -0.04, pond: false },
  bog:      { tint: { deep: 0x1f160b, murk: 7 },   threshold: 0.14, pond: false },
  oasis:    { tint: { deep: 0x0f5a6a, murk: 1.4 }, threshold: 0,    pond: true },
};

// Props (trees, shrubs, rocks...) are chosen per tile by flora.ts and
// placed by vegetation.ts.

export const SNOW = new THREE.Color(0xf4f7fa);

// ---------- per-tile resolved look ----------

export interface TileLook {
  color: THREE.Color;
  rockColor: THREE.Color;
  rock: number;      // 0..1, how strongly rockColor shows on steep ground
  patchColor: THREE.Color;
  height: number;
  plateau: number;
  roughness: number;
  wet: number;
  detail: Detail;
  beach: number;     // 1 = this tile's shore can be sandy (water tiles defer to the land side)
  water: boolean;    // open water (ocean, shallow sea, lake): the ground is a bed under the sea surface
  bed: number;       // bed level under water (land tiles: the shallow bed off their shore)
  tint: WaterTint | null; // open water's look
  pool: PoolLook | null;  // wetland pools / oasis pond
}

// Biomes whose coasts get sandy beaches; cold, forested-to-the-water and
// wetland coasts stay as they are.
const SANDY: ReadonlySet<BiomeKey> = new Set(['prairie', 'steppe', 'savanna', 'mediterranean', 'hotDesert', 'coldDesert', 'monsoonForest', 'jungle', 'temperateForest']);

const isOpenWater = (b: BiomeKey): b is 'ocean' | 'shallowSea' | 'lake' => b === 'ocean' || b === 'shallowSea' || b === 'lake';

export function tileLook(map: MapData, t: number): TileLook {
  const biome = map.biome[t], relief = map.relief[t], feature = map.feature[t];
  const B = BIOME_LOOK[biome];
  const R = RELIEF_LOOK[relief];
  const F = feature ? FEATURE_LOOK[feature] : null;
  const e = map.elevation[t];
  const water = WATER_HEIGHT[biome];

  const color = new THREE.Color(B.color);
  const rockColor = new THREE.Color(F?.rock ?? B.rock);
  if (water === undefined) color.lerp(rockColor, R.stone);
  if (F?.color != null) color.lerp(new THREE.Color(F.color), F.colorMix);

  let height: number, plateau: number, roughness: number;
  if (water !== undefined) {
    height = water;
    plateau = 0.6;
    roughness = biome === 'seaIce' ? 0.0016 : 0; // open water is flat
  } else {
    height = R.height;
    if (relief === 'mountains') height += 0.02 * Math.max(0, e - 0.6);
    if (relief === 'hills') height += 0.005 * e;
    if (biome === 'iceSheet') height += 0.004;
    plateau = R.plateau;
    roughness = R.roughness;
  }
  if (F) {
    height += F.heightDelta;
    if (F.plateau !== null) plateau = F.plateau;
  }

  const detail: Detail = {
    grain: B.detail.grain,
    patch: F?.patch ?? B.detail.patch,
    strata: Math.max(B.detail.strata, water === undefined ? R.strata : 0, F?.strata ?? 0),
    dunes: relief === 'flat' && !F ? B.detail.dunes : B.detail.dunes * 0.3,
    bump: Math.min(1, B.detail.bump + (water === undefined ? R.bump : 0)),
  };

  return {
    color,
    rockColor,
    rock: water === undefined ? R.rock : 0,
    patchColor: new THREE.Color(F?.patchColor ?? 0),
    height, plateau, roughness,
    wet: Math.max(B.wet, F?.wet ?? 0),
    detail,
    beach: water !== undefined ? 1 : SANDY.has(biome) && relief === 'flat' && (!feature || feature === 'floodplain' || feature === 'oasis') ? 1 : 0,
    water: isOpenWater(biome),
    bed: !isOpenWater(biome) ? SHORE_BED
      : biome === 'ocean' ? BED.ocean * (1 + Math.min(1.2, -e * 2))
      : feature === 'reef' ? -0.0013 : feature === 'kelp' ? -0.0021 : BED[biome],
    tint: isOpenWater(biome) ? SEA_TINT[biome] : null,
    pool: feature ? POOL_LOOK[feature] ?? null : null,
  };
}
