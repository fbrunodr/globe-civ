import { buildGoldberg, type Globe } from './goldberg.ts';
import { MAP_SIZES, type MapSizeKey } from './rules.ts';

// One globe per map size, built once.
const globes = new Map<number, Globe>();
export function globeFor(size: MapSizeKey): Globe {
  const n = MAP_SIZES[size].n;
  let g = globes.get(n);
  if (!g) { g = buildGoldberg(n); globes.set(n, g); }
  return g;
}
