// Latitude and longitude on the globe. Longitude: the point (1, 0, 0) is
// at 0°, east is -z (the direction mapgen.ts's winds call east), north is +y.

import * as THREE from 'three';
import type { Globe } from './goldberg.ts';

export const latLon = (p: THREE.Vector3): [number, number] => [
  (Math.asin(Math.max(-1, Math.min(1, p.y))) * 180) / Math.PI,
  (Math.atan2(-p.z, p.x) * 180) / Math.PI,
];
export const fromLatLon = (lat: number, lon: number): THREE.Vector3 => {
  const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b));
};

// The tile whose center is nearest the point: walking from `from` toward
// it (tiles are convex, so the walk ends at the nearest), or searching all.
export function nearestTile(globe: Globe, p: THREE.Vector3, from = -1): number {
  if (from < 0) {
    let best = 0, bestD = -Infinity;
    for (const t of globe.tiles) { const d = t.center.dot(p); if (d > bestD) { bestD = d; best = t.id; } }
    return best;
  }
  let cur = from, d = globe.tiles[cur]!.center.dot(p);
  for (;;) {
    let next = -1;
    for (const nb of globe.tiles[cur]!.neighbors) { const e = globe.tiles[nb]!.center.dot(p); if (e > d) { d = e; next = nb; } }
    if (next < 0) return cur;
    cur = next;
  }
}
export const tileAt = (globe: Globe, lat: number, lon: number, from = -1): number => nearestTile(globe, fromLatLon(lat, lon), from);
