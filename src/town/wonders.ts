// Wonder tiles come in groups by the shape of what stands there: each
// group has its own drawings (a role per group, like the block and the
// center), with a footprint fixed for the group that every wonder of it
// fits. The drawing only places and turns it. Wonders on special ground
// (Machu Picchu on a mountain top) have no group: they need no drawing.

import type { WonderKey } from '../cities.ts';
import type { Spot } from './geometry.ts';

export const WONDER_GROUPS = ['monument', 'arena', 'hall', 'tower'] as const;
export type WonderGroup = (typeof WONDER_GROUPS)[number];
export type WonderRole = `wonder-${WonderGroup}`;
export const WONDER_ROLES: readonly WonderRole[] = WONDER_GROUPS.map((g) => `wonder-${g}` as const);
export const isWonderRole = (r: string): r is WonderRole => r.startsWith('wonder-');
export const groupOf = (r: WonderRole): WonderGroup => r.slice('wonder-'.length) as WonderGroup;

export const WONDER_GROUP_NAME: Record<WonderGroup, string> = {
  monument: 'monument (large square)', arena: 'arena (round)', hall: 'hall (long)', tower: 'tower (small)',
};

// Footprints (tile steps; the tile's inradius is 0.5): round (r), or a
// rectangle hw across its front and hd deep.
type Footprint = { readonly r: number } | { readonly hw: number; readonly hd: number };
export const WONDER_FOOTPRINT: Record<WonderGroup, Footprint> = {
  monument: { hw: 0.18, hd: 0.18 },  // the largest: a pyramid, terraces, a stepped temple, a palace and its courts
  arena: { r: 0.15 },                // an amphitheatre, a stone circle, a domed rotunda
  hall: { hw: 0.16, hd: 0.09 },      // a library, a temple front, a cathedral
  tower: { r: 0.07 },                // a lighthouse, a statue, a clock tower
};

// The wonder's spot of a group, at (x, y) facing yaw.
export function wonderSpot(g: WonderGroup, x: number, y: number, yaw: number): Spot {
  const f = WONDER_FOOTPRINT[g];
  return 'r' in f ? { x, y, yaw, r: f.r } : { x, y, yaw, r: Math.hypot(f.hw, f.hd), hw: f.hw, hd: f.hd };
}

// The game's wonders by group (null: no drawing, on special ground).
export const WONDER_GROUP: Record<WonderKey, WonderGroup | null> = {
  pyramids: 'monument', hangingGardens: 'monument',
  colosseum: 'arena', stonehenge: 'arena',
  greatLibrary: 'hall',
  greatLighthouse: 'tower',
  machuPicchu: null,
};
