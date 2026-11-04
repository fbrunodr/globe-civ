// Where a resource's models stand on its tile (render.ts draws them): its
// layout (resourceModels.ts) drawn only on the tile's painted land, in the
// water for a sea resource, dry and off the beach for the rest (as farms
// are), and a walking beast's or person's whole walk on it too.

import * as THREE from 'three';
import type { Game } from '../game.ts';
import type { ResourceKey } from '../resources.ts';
import { BEACH, DRY, tileFrame, type CitySpot, type DirSampler } from '../cityProps.ts';
import { resourceLayout, type ResourceLook, type ResourceSpot } from './resourceModels.ts';
import { roamOf } from './models.ts';

export interface PlacedResource extends ResourceSpot {
  readonly dir: THREE.Vector3; // where it stands (unit direction)
  readonly spot: CitySpot;     // the ground there
  readonly k: number;          // the tile's step (radians): the model's scale is k · s
}

// How many points round a walker's loop are checked.
const WALK_CHECKS = 6;

export function placeResource(g: Game, t: number, r: ResourceKey, look: ResourceLook, rand: () => number, sampleDir: DirSampler): PlacedResource[] {
  const tile = g.tiles[t]!, { e1, k } = tileFrame(g, t);
  // (A land resource over its whole tile; a sea one in a patch toward a corner, under its badge.)
  const mid = look.water || look.corner ? tile.center.clone().lerp(g.globe.triCenters[tile.corners[2 % tile.corners.length]!]!, 0.4).normalize() : tile.center.clone();
  const u = e1.clone().addScaledVector(mid, -e1.dot(mid)).normalize(), w = mid.clone().cross(u);
  const at = (x: number, y: number) => mid.clone().addScaledVector(u, x * k).addScaledVector(w, y * k).normalize();
  const fits = (s: CitySpot) => s.owner === t && (look.water ? s.water - s.ground > 0.0003 : s.water - s.ground <= DRY && (s.coast ?? 9) >= BEACH);
  const inside = (x: number, y: number, m: { model: string; s: number }) => {
    if (!fits(sampleDir(at(x, y)))) return false;
    // (A walker's loop lies within twice its walk of where it stands, tile steps: rural/models.ts roamOf.)
    const reach = 2 * roamOf(m.model) * m.s;
    for (let j = 0; reach > 0 && j < WALK_CHECKS; j++) {
      const a = (j / WALK_CHECKS) * Math.PI * 2;
      if (!fits(sampleDir(at(x + reach * Math.cos(a), y + reach * Math.sin(a))))) return false;
    }
    return true;
  };
  return resourceLayout(r, rand, look, inside).map((m) => {
    const dir = at(m.x, m.y);
    return { ...m, dir, spot: sampleDir(dir), k };
  });
}
