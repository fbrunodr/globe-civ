// The town drawings, assembled (sketch + stored lots), and how a tile picks
// its middle and an edge its strip.

import { MIDDLE_SKETCHES } from './middles.ts';
import { STRIP_SKETCHES } from './strips.ts';
import { finishMiddle, finishStrip, mirrored, type Middle, type Role, type Strip } from './drawings.ts';
import { BORDER_TYPES, borderType, stripKey, typeIndex, type BorderType, type Far } from './borders.ts';
import type { Density, Sides } from './geometry.ts';

export const MIDDLES: readonly Middle[] = MIDDLE_SKETCHES.map(finishMiddle);
export const STRIPS: readonly Strip[] = STRIP_SKETCHES.map(finishStrip);
const byKey = new Map(STRIPS.map((s) => [stripKey(s.a, s.b), s]));

// The middles a tile may get: by shape, role and density.
export function middlesFor(k: Sides, role: Role, d: Density): Middle[] {
  return MIDDLES.filter((m) => m.sides === k && m.role === role && m.density === d);
}
export const middleBorderType = (m: Middle, j: number): BorderType => borderType(m.density, m.borders[j]!);

// The strip for a's side meeting b (another type, open land or water); a
// strip drawn the other way round is mirrored. Null if not drawn yet.
export function stripFor(a: BorderType, b: Far): Strip | null {
  if (b === 'land' || b === 'water' || typeIndex(a) <= typeIndex(b)) return byKey.get(stripKey(a, b)) ?? null;
  const s = byKey.get(stripKey(b, a));
  return s ? mirrored(s) : null;
}

// Every strip that must exist: each unordered pair of types, and each type's outskirts and waterfront.
export const WANTED_STRIPS: readonly { a: BorderType; b: Far }[] = BORDER_TYPES.flatMap((a, i) => [
  ...BORDER_TYPES.slice(i).map((b) => ({ a, b: b as Far })),
  { a, b: 'land' as const }, { a, b: 'water' as const },
]);

export type { Middle, Strip, Role };
