// Wonders, each built on a square of 7 × 7 cells (SITE_HALF) and never
// stretched: each fills the square with room to spare, its front +z. A
// painted city scales it to its rectangle (cityDress.ts). Scaffolding
// stands there while one is built. (Machu Picchu stands on a mountain top
// instead: buildingCatalog.ts.) The models themselves are in wonders/, one
// file per era, from a shared kit (wonders/kit.ts): wonders are the game's
// showpieces, drawn in far more detail than the town's buildings.
//
// Units are tile steps (the lot models' units, houseKit.ts); the origin is
// the middle of the site on the ground.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WonderKey } from './cities.ts';
import type { G } from './houseKit.ts';
import { scaffold } from './wonders/kit.ts';
import { UNIT } from './cityPainter.ts';
import { ANCIENT } from './wonders/ancient.ts';
import { CLASSICAL } from './wonders/classical.ts';
import { MEDIEVAL } from './wonders/medieval.ts';
import { RENAISSANCE } from './wonders/renaissance.ts';
import { versaillesGrounds } from './wonders/renaissanceB.ts';
import type { CatalogKind } from './propCatalog.ts';
import { INDUSTRIAL } from './wonders/industrial.ts';
import { MODERN } from './wonders/modern.ts';
import { INFORMATION } from './wonders/information.ts';

export { SITE_HALF } from './wonders/kit.ts';
// What stands on a site: a wonder, or the scaffolding of one being built.
export type SiteModel = Exclude<WonderKey, 'machuPicchu'> | 'scaffold';
export type WonderModelKind = `wonder|${SiteModel}`;
export const wonderModelKind = (m: SiteModel): WonderModelKind => `wonder|${m}`;
export const isWonderModelKind = (k: string): k is WonderModelKind => k.startsWith('wonder|');
// About how tall a wonder in a city should rise (site units) to stand out
// over the town, above a three-storey house's eaves: a guide for the
// models, not a rule (none is stretched to it).
export const MIN_HEIGHT = 0.14;

// How big a wonder beside its city is drawn: on land, half the square
// its building fills (tile steps), at most twice across what the biggest
// wonder fills in a city (CITY_HALF); on the sea, its model's scale (its
// islet 0.075 of it across, wonders/kit.ts), near a city's.
const CITY_HALF = 0.95 * 8 * UNIT; // (a city fits a site's pad to its rectangle, 16 units at most)
const LAND_HALF: Partial<Record<SiteModel, number>> = {
  pyramids: 2 * CITY_HALF, versailles: 2 * CITY_HALF, fastTelescope: 1.8 * CITY_HALF, terracottaArmy: 1.6 * CITY_HALF,
  neuschwanstein: 1.6 * CITY_HALF, petra: 1.5 * CITY_HALF, stonehenge: 1.3 * CITY_HALF,
};
const SEA_SCALE: Partial<Record<SiteModel, number>> = { greatLighthouse: 1, colossus: 0.9, statueOfLiberty: 1 };
// Wonders that stand beside a city on the bare ground, with no base: sunk
// into a slope at its lowest corner rather than raised on a foundation
// (cityProps.ts standLot).
export const ON_BARE_GROUND: ReadonlySet<string> = new Set(Object.keys(LAND_HALF));
export const landHalf = (m: SiteModel): number => LAND_HALF[m] ?? 2 * CITY_HALF;
export const seaScale = (m: SiteModel): number => SEA_SCALE[m] ?? 0.9;

// A wonder's grounds beside its city: what its model leaves to the game's
// own systems, in the model's frame (x, z; its front +z; cityProps.ts lays
// them out with it): its water, sheets of the game's water on the ground
// (render.ts), each a rectangle or, if round, the ellipse in it (x, z its
// middle, hw, hd its half sizes); its trees, the flora's own models,
// `height` tall (model units). Part of its footprint (groundsBox).
export interface WaterArea { readonly x: number; readonly z: number; readonly hw: number; readonly hd: number; readonly round?: boolean }
export interface GroundTree { readonly x: number; readonly z: number; readonly kind: CatalogKind; readonly height: number }
export interface WonderGrounds { readonly water: readonly WaterArea[]; readonly trees: readonly GroundTree[] }
const GROUNDS: Partial<Record<SiteModel, WonderGrounds>> = { versailles: versaillesGrounds() };
export const wonderGrounds = (m: SiteModel): WonderGrounds | null => GROUNDS[m] ?? null;
// How far its grounds reach from its middle along x and z (model units).
export function groundsBox(m: SiteModel): readonly [number, number] {
  const gr = GROUNDS[m];
  if (!gr) return [0, 0];
  let hx = 0, hz = 0;
  for (const w of gr.water) { hx = Math.max(hx, Math.abs(w.x) + w.hw); hz = Math.max(hz, Math.abs(w.z) + w.hd); }
  for (const t of gr.trees) { hx = Math.max(hx, Math.abs(t.x)); hz = Math.max(hz, Math.abs(t.z)); }
  return [hx, hz];
}

const MODELS: Record<SiteModel, () => G[]> = { ...ANCIENT, ...CLASSICAL, ...MEDIEVAL, ...RENAISSANCE, ...INDUSTRIAL, ...MODERN, ...INFORMATION, scaffold };

const cache = new Map<WonderModelKind, G>();
export function wonderGeometry(kind: WonderModelKind): G {
  let g = cache.get(kind);
  if (!g) {
    const m = kind.slice('wonder|'.length) as SiteModel;
    const parts = MODELS[m]().map((p) => (p.index ? p.toNonIndexed() : p));
    g = mergeGeometries(parts)!;
    if (!g) throw new Error(`wonder ${kind}`);
    for (const p of parts) p.dispose();
    g.setAttribute('leafMask', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
    g.computeVertexNormals();
    cache.set(kind, g);
  }
  return g;
}
export const SITE_MODELS = Object.keys(MODELS) as SiteModel[];
