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
import { ANCIENT } from './wonders/ancient.ts';
import { CLASSICAL } from './wonders/classical.ts';
import { MEDIEVAL } from './wonders/medieval.ts';
import { RENAISSANCE } from './wonders/renaissance.ts';
import { INDUSTRIAL } from './wonders/industrial.ts';
import { MODERN } from './wonders/modern.ts';
import { INFORMATION } from './wonders/information.ts';

export { SITE_HALF } from './wonders/kit.ts';
// What stands on a site: a wonder, or the scaffolding of one being built.
export type SiteModel = Exclude<WonderKey, 'machuPicchu'> | 'scaffold';
export type WonderModelKind = `wonder|${SiteModel}`;
// Wonders that stand on the bare ground, sunk into a slope rather than
// raised on a foundation (cityProps.ts standLot).
export const ON_BARE_GROUND: ReadonlySet<string> = new Set<SiteModel>(['stonehenge']);
export const wonderModelKind = (m: SiteModel): WonderModelKind => `wonder|${m}`;
export const isWonderModelKind = (k: string): k is WonderModelKind => k.startsWith('wonder|');
// About how tall a wonder in a city should rise (site units) to stand out
// over the town, above a three-storey house's eaves: a guide for the
// models, not a rule (none is stretched to it).
export const MIN_HEIGHT = 0.14;

// How big a wonder beside its city is drawn, after its size in the world
// (the greatest kept to what fits on its tile, a tile being one step
// across its flats): on land, half the square it fills (tile steps; in a
// city a wonder fills a square about 0.06 across, 4 × 4 houses); on the
// sea, its model's scale (its islet 0.075 of it across, wonders/kit.ts).
const LAND_HALF: Partial<Record<SiteModel, number>> = {
  pyramids: 0.24, stonehenge: 0.14, terracottaArmy: 0.2, petra: 0.15, versailles: 0.22, neuschwanstein: 0.17, fastTelescope: 0.22,
};
const SEA_SCALE: Partial<Record<SiteModel, number>> = { greatLighthouse: 1.2, colossus: 0.8, statueOfLiberty: 1.1 };
export const landHalf = (m: SiteModel): number => LAND_HALF[m] ?? 0.12;
export const seaScale = (m: SiteModel): number => SEA_SCALE[m] ?? 0.9;

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
