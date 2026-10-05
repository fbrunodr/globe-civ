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
  ocean:               { color: 0x2a6c9c, rock: 0x7d8a8c, detail: d(0.15, 0, 0, 0, 0), wet: 1 },
  shallowSea:          { color: 0x52b4c9, rock: 0x8a9690, detail: d(0.15, 0, 0, 0, 0), wet: 1 },
  lake:                { color: 0x4aa9c6, rock: 0x8a9690, detail: d(0.15, 0, 0, 0, 0), wet: 1 },
  seaIce:              { color: 0xd8e9f1, rock: 0xb9c9d1, detail: d(0.5, 0, 0, 0, 0.5), wet: 0.2 },
  iceSheet:            { color: 0xf3f7fa, rock: 0xa9b8c2, detail: d(0.35, 0, 0, 0.2, 0.5), wet: 0 },
  tundra:              { color: 0xa6ad87, rock: 0x8e8d86, detail: d(0.9, 0, 0, 0, 0.6), wet: 0 },
  taiga:               { color: 0x5d7d4f, rock: 0x7d7c73, detail: d(0.7, 0, 0, 0, 0.6), wet: 0 },
  coldDesert:          { color: 0xcbbb92, rock: 0xa6977b, detail: d(1, 0, 0.15, 0, 0.9), wet: 0 },
  steppe:              { color: 0xccc171, rock: 0x9f8f76, detail: d(0.8, 0, 0, 0, 0.5), wet: 0 },
  prairie:             { color: 0x8ec25b, rock: 0x958b7a, detail: d(0.7, 0, 0, 0, 0.5), wet: 0 },
  temperateForest:     { color: 0x6ea548, rock: 0x8b8170, detail: d(0.7, 0, 0, 0, 0.6), wet: 0 },
  temperateRainforest: { color: 0x4f8b4b, rock: 0x75746a, detail: d(0.7, 0, 0, 0, 0.6), wet: 0 },
  mediterranean:       { color: 0xbcb266, rock: 0xb59a72, detail: d(0.9, 0, 0, 0, 0.6), wet: 0 },
  hotDesert:           { color: 0xefd59d, rock: 0xc68d5c, detail: d(0.5, 0, 0, 1, 0.7), wet: 0 },
  savanna:             { color: 0xdbba63, rock: 0xb3845a, detail: d(0.85, 0, 0, 0, 0.5), wet: 0 },
  monsoonForest:       { color: 0x88aa46, rock: 0x9b7f62, detail: d(0.7, 0, 0, 0, 0.6), wet: 0 },
  jungle:              { color: 0x4e9642, rock: 0x87735e, detail: d(0.6, 0, 0, 0, 0.6), wet: 0 },
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
  hills:     { height: 0.019, plateau: 0.12, roughness: 0.004,  rock: 0.6,  stone: 0.12, strata: 0.15, bump: 0.3 },
  mountains: { height: 0.04,  plateau: 0,    roughness: 0.02,   rock: 0.6,  stone: 0.15, strata: 0.5,  bump: 0.6 },
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
  marsh:      { color: 0x86a862, rock: null, colorMix: 0.55, patch: 0.75, patchColor: 0x5a9aa4, heightDelta: -0.003, plateau: null, strata: 0, wet: 0.25 },
  swamp:      { color: 0x5f8250, rock: null, colorMix: 0.5,  patch: 0.6,  patchColor: 0x4a7a6a, heightDelta: -0.003, plateau: null, strata: 0, wet: 0.2 },
  mangrove:   { color: 0x4f8460, rock: null, colorMix: 0.4,  patch: 0.7,  patchColor: 0x2f7a82, heightDelta: -0.004, plateau: null, strata: 0, wet: 0.25 },
  bog:        { color: 0x8f8456, rock: null, colorMix: 0.55, patch: 0.55, patchColor: 0x55574a, heightDelta: -0.003, plateau: null, strata: 0, wet: 0.15 },
  floodplain: { color: 0x96bd52, rock: null, colorMix: 0.55, patch: 0.25, patchColor: 0x5d8a3a, heightDelta: -0.002, plateau: 0.7, strata: 0, wet: 0 },
  oasis:      { color: 0x8aa04e, rock: null, colorMix: 0.45, patch: 0.4,  patchColor: 0x2f86a8, heightDelta: 0,      plateau: null, strata: 0, wet: 0 },
  volcano:    { color: 0x4a423c, rock: 0x3d3632, colorMix: 0.7,  patch: 0,    patchColor: 0x000000, heightDelta: 0.012,  plateau: null, strata: 0.3, wet: 0 },
  // Glaciers keep the mountain's colors; the renderer caps only the peak with ice.
  glacier:    { color: null,     rock: null, colorMix: 0,    patch: 0,    patchColor: 0x000000, heightDelta: 0.004,  plateau: null, strata: 0, wet: 0 },
  reef:       { color: 0x3fbcc0, rock: null, colorMix: 0.55, patch: 0.45, patchColor: 0xb59a8a, heightDelta: 0,      plateau: null, strata: 0, wet: 0 },
  kelp:       { color: 0x24646f, rock: null, colorMix: 0.45, patch: 0.5,  patchColor: 0x3f8a6a, heightDelta: 0,      plateau: null, strata: 0, wet: 0 },
};

// Water surfaces sit at sea level regardless of relief.
const WATER_HEIGHT: Partial<Record<BiomeKey, number>> = { ocean: -0.004, shallowSea: 0, lake: 0, seaIce: 0.003 };

// ---------- props (instanced 3D decorations) ----------

export type PropKind = 'conifer' | 'tallConifer' | 'broadleaf' | 'jungleTree' | 'acacia' | 'shrub' | 'palm' | 'reeds' | 'mangroveTree';

export interface PropSpec {
  kind: PropKind;
  count: number;  // per flat tile; hills get ~2/3
  spread: number; // 0..1, how close to the tile edge props may go
}

const p = (kind: PropKind, count: number, spread = 0.82): PropSpec => ({ kind, count, spread });

export const BIOME_PROPS: Record<BiomeKey, PropSpec[]> = {
  ocean: [], shallowSea: [], lake: [], seaIce: [], iceSheet: [],
  tundra: [p('shrub', 3, 0.75)],
  taiga: [p('conifer', 11)],
  coldDesert: [p('shrub', 3, 0.75)],
  steppe: [p('shrub', 3, 0.75)],
  prairie: [p('broadleaf', 2, 0.7), p('shrub', 2, 0.7)],
  temperateForest: [p('broadleaf', 10)],
  temperateRainforest: [p('tallConifer', 13)],
  mediterranean: [p('shrub', 8), p('broadleaf', 2, 0.7)],
  hotDesert: [],
  savanna: [p('acacia', 4, 0.78), p('shrub', 3, 0.75)],
  monsoonForest: [p('broadleaf', 9), p('palm', 1, 0.6)],
  jungle: [p('jungleTree', 14), p('palm', 2, 0.7)],
};

// null = keep the biome's props.
export const FEATURE_PROPS: Record<FeatureKey, PropSpec[] | null> = {
  marsh: [p('reeds', 9)],
  swamp: [p('broadleaf', 6), p('reeds', 4)],
  mangrove: [p('mangroveTree', 10)],
  bog: [p('shrub', 4, 0.75), p('conifer', 1, 0.6)],
  floodplain: [p('reeds', 2, 0.6), p('broadleaf', 1, 0.6)],
  oasis: [p('palm', 6, 0.45)],
  volcano: [],
  glacier: [],
  reef: [],
  kelp: [],
};

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
  props: PropSpec[];
  propScale: number; // hills: fewer props
  beach: number;     // 1 = this tile's shore can be sandy (water tiles defer to the land side)
  shallow: number;   // 1 = clear shallow water with caustics (land counts as shallow so coasts blend)
}

// Biomes whose coasts get sandy beaches; cold, forested-to-the-water and
// wetland coasts stay as they are.
const SANDY: ReadonlySet<BiomeKey> = new Set(['prairie', 'steppe', 'savanna', 'mediterranean', 'hotDesert', 'coldDesert', 'monsoonForest', 'jungle', 'temperateForest']);

export function tileLook(map: MapData, t: number): TileLook {
  const biome = map.biome[t], relief = map.relief[t], feature = map.feature[t];
  const B = BIOME_LOOK[biome];
  const R = RELIEF_LOOK[relief];
  const F = feature ? FEATURE_LOOK[feature] : null;
  const e = map.elevation[t];
  const water = WATER_HEIGHT[biome];

  const color = new THREE.Color(B.color);
  if (biome === 'ocean') color.lerp(new THREE.Color(0x1a4a78), Math.min(1, -e * 1.6)); // darker with depth
  const rockColor = new THREE.Color(F?.rock ?? B.rock);
  if (water === undefined) color.lerp(rockColor, R.stone);
  if (F?.color != null) color.lerp(new THREE.Color(F.color), F.colorMix);
  // Tiny per-tile jitter so large regions are not perfectly uniform.
  const j = Math.sin(t * 12.9898) * 43758.5453;
  color.multiplyScalar(0.96 + 0.08 * (j - Math.floor(j)));

  let height: number, plateau: number, roughness: number;
  if (water !== undefined) {
    height = water - (biome === 'ocean' ? 0.006 * Math.min(1, -e * 2) : 0);
    plateau = 0.6;
    roughness = biome === 'seaIce' ? 0.0016 : 0.0003;
  } else {
    height = R.height;
    if (relief === 'mountains') height += 0.03 * Math.max(0, e - 0.6);
    if (relief === 'hills') height += 0.008 * e;
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

  const props = relief === 'mountains' ? [] : (feature ? FEATURE_PROPS[feature] : null) ?? BIOME_PROPS[biome];
  return {
    color,
    rockColor,
    rock: water === undefined ? R.rock : 0,
    patchColor: new THREE.Color(F?.patchColor ?? 0),
    height, plateau, roughness,
    wet: Math.max(B.wet, F?.wet ?? 0),
    detail,
    props,
    propScale: relief === 'hills' ? 0.65 : 1,
    beach: water !== undefined ? 1 : SANDY.has(biome) && relief === 'flat' && (!feature || feature === 'floodplain' || feature === 'oasis') ? 1 : 0,
    shallow: biome === 'ocean' || biome === 'seaIce' ? 0 : 1,
  };
}
