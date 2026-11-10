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
import { terracottaGrounds } from './wonders/classicalA.ts';
import { hangingGardensGrounds } from './wonders/ancient.ts';
import type { CatalogKind } from './propCatalog.ts';
import { INDUSTRIAL } from './wonders/industrial.ts';
import { MODERN } from './wonders/modern.ts';
import { INFORMATION } from './wonders/information.ts';

export { SITE_HALF } from './wonders/kit.ts';
// What stands on a site: a wonder, or the scaffolding of one being built.
export type SiteModel = Exclude<WonderKey, 'machuPicchu'> | 'scaffold';
// (A wonder drawn in pieces: `wonder|<model>#<piece>` each, wonderPieces.)
export type WonderModelKind = `wonder|${SiteModel}` | `wonder|${SiteModel}#${number}`;
export const wonderModelKind = (m: SiteModel): `wonder|${SiteModel}` => `wonder|${m}`;
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
  pyramids: 2 * CITY_HALF, fastTelescope: 1.8 * CITY_HALF, terracottaArmy: 1.6 * CITY_HALF,
  neuschwanstein: 1.6 * CITY_HALF, petra: 1.5 * CITY_HALF, stonehenge: 1.95 * CITY_HALF, cristoRedentor: 1.35 * CITY_HALF, launchComplex39: 1.4 * CITY_HALF,
};
const SEA_SCALE: Partial<Record<SiteModel, number>> = { greatLighthouse: 1, colossus: 0.9, statueOfLiberty: 1 };
// Wonders that stand beside a city on the bare ground, with no base: sunk
// into a slope at its lowest corner rather than raised on a foundation
// (cityProps.ts standLot).
export const ON_BARE_GROUND: ReadonlySet<string> = new Set(Object.keys(LAND_HALF));
// Wonders beside a city that stand on the highest point of their tile (on
// its summit, not near its middle).
export const ON_SUMMIT: ReadonlySet<SiteModel> = new Set<SiteModel>(['cristoRedentor']);
export const landHalf = (m: SiteModel): number => LAND_HALF[m] ?? 2 * CITY_HALF;
export const seaScale = (m: SiteModel): number => SEA_SCALE[m] ?? 0.9;

// A wonder's grounds: what its model leaves to the game's own systems, in
// the model's frame (x, z; its front +z; cityProps.ts lays them out with
// it). Shapes are rectangles or, if round, the ellipse in them (x, z
// their middle, hw, hd their half sizes):
// - sinks: depressions in the ground (a pit, a basin). The ground's
//   surface is cut away over them (the terrain shader's holes, render.ts)
//   and each is drawn in its place: its sides from the ground's edge down
//   to its floor, `depth` under the ground; if it holds water, the game's
//   water `water` under it. Level (an excavation: its floor flat along the
//   lie of the land, under its rim's lowest point) or, if it `follow`s the
//   ground, as deep all round (a basin, its water lying as the old sheets
//   on the ground did: the ground is rougher than a garden's ornaments are
//   deep, so a level basin would show high sides). `outline`
//   runs round it (counter-clockwise seen from above, x right, z down the
//   screen: any order works); `cut` is the shapes whose union it is.
// - paint: what lies flat on the ground (gravel, lawn, bare earth), draped
//   over it as the town's squares are: a higher `layer` over a lower.
// - trees: the flora's own models, `height` tall (model units), `y` over
//   the wonder's base (a terrace's top) or, without it, on the ground.
// - pieces: a wonder drawn in pieces, each standing on the ground where
//   it is (its middle the middle of its parts' box), or on its sink's
//   floor; not one rigid slab. Each piece's parts are built in the
//   wonder's frame, their ground y = 0 (a sunk piece's: its sink's floor).
// The ground under them is part of the wonder's footprint (groundsBox).
export interface GroundShape { readonly x: number; readonly z: number; readonly hw: number; readonly hd: number; readonly round?: boolean }
export interface Sink {
  readonly outline: readonly (readonly [number, number])[];
  readonly cut: readonly GroundShape[];
  readonly depth: number;
  readonly water?: number;
  readonly follow?: boolean;
  readonly side: number; // colours
  readonly floor: number;
}
export interface GroundPaint extends GroundShape { readonly color: number; readonly layer: number }
export interface GroundTree { readonly x: number; readonly z: number; readonly kind: CatalogKind; readonly height: number; readonly y?: number }
export interface WonderPiece { readonly parts: () => G[]; readonly sink?: number }
export interface WonderGrounds {
  readonly sinks?: readonly Sink[];
  readonly paint?: readonly GroundPaint[];
  readonly trees?: readonly GroundTree[];
  readonly pieces?: readonly WonderPiece[];
}
// (Made when first asked: the era files import this one's types.)
let groundsOf: Partial<Record<SiteModel, WonderGrounds>> | null = null;
export const wonderGrounds = (m: SiteModel): WonderGrounds | null => {
  groundsOf ??= { terracottaArmy: terracottaGrounds(), hangingGardens: hangingGardensGrounds() };
  return groundsOf[m] ?? null;
};
// How far its grounds reach from its middle along x and z (model units).
export function groundsBox(m: SiteModel): readonly [number, number] {
  const gr = wonderGrounds(m);
  if (!gr) return [0, 0];
  let hx = 0, hz = 0;
  for (const s of gr.sinks ?? []) for (const [x, z] of s.outline) { hx = Math.max(hx, Math.abs(x)); hz = Math.max(hz, Math.abs(z)); }
  for (const p of gr.paint ?? []) { hx = Math.max(hx, Math.abs(p.x) + p.hw); hz = Math.max(hz, Math.abs(p.z) + p.hd); }
  for (const t of gr.trees ?? []) { hx = Math.max(hx, Math.abs(t.x)); hz = Math.max(hz, Math.abs(t.z)); }
  return [hx, hz];
}
// A wonder in pieces: each piece's model kind, and where it stands in the
// wonder's frame (the middle of its parts' box, x and z) and how far it
// reaches from there (hw, hd).
export interface PieceAt { readonly kind: WonderModelKind; readonly x: number; readonly z: number; readonly hw: number; readonly hd: number; readonly sink?: number }
const pieceCache = new Map<SiteModel, readonly PieceAt[]>();
export function wonderPieces(m: SiteModel): readonly PieceAt[] {
  let out = pieceCache.get(m);
  if (!out) {
    out = (wonderGrounds(m)?.pieces ?? []).map((p, i) => {
      const kind = `wonder|${m}#${i}` as WonderModelKind, b = pieceBox(m, i);
      return { kind, x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, hw: (b.max.x - b.min.x) / 2, hd: (b.max.z - b.min.z) / 2, ...(p.sink === undefined ? {} : { sink: p.sink }) };
    });
    pieceCache.set(m, out);
  }
  return out;
}
function pieceParts(m: SiteModel, i: number): G {
  const parts = wonderGrounds(m)!.pieces![i]!.parts().map((p) => (p.index ? p.toNonIndexed() : p));
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}
const boxes = new Map<string, THREE.Box3>();
function pieceBox(m: SiteModel, i: number): THREE.Box3 {
  let b = boxes.get(`${m}#${i}`);
  if (!b) { const g = pieceParts(m, i); g.computeBoundingBox(); b = g.boundingBox!.clone(); g.dispose(); boxes.set(`${m}#${i}`, b); }
  return b;
}
const MODELS: Record<SiteModel, () => G[]> = { ...ANCIENT, ...CLASSICAL, ...MEDIEVAL, ...RENAISSANCE, ...INDUSTRIAL, ...MODERN, ...INFORMATION, scaffold };

const cache = new Map<WonderModelKind, G>();
export function wonderGeometry(kind: WonderModelKind): G {
  let g = cache.get(kind);
  if (!g) {
    const [m, piece] = kind.slice('wonder|'.length).split('#') as [SiteModel, string | undefined];
    const parts = (piece !== undefined ? [pieceOrigin(m, Number(piece))] : MODELS[m]()).map((p) => (p.index ? p.toNonIndexed() : p));
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
// A piece's model about where it stands (wonderPieces).
function pieceOrigin(m: SiteModel, i: number): G {
  const b = pieceBox(m, i);
  return pieceParts(m, i).translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
}
// The site model a wonder kind draws (a piece's: its wonder's).
export const siteModelOf = (k: WonderModelKind): SiteModel => k.slice('wonder|'.length).split('#')[0] as SiteModel;
