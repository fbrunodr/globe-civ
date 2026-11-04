// Everything drawn on a tile stands on the tile's painted land (the
// painting's owner there as drawn, fine wiggle and all: paint.ts paintDelta), not its formal hex: the hexes
// are the rules' business. Ground and biomes are the painting itself;
// rivers run on its borders (paint.test.ts P9); here the props: resources
// (and their beasts' walks), cities and the countryside.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Game } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { USE } from '../src/cities.ts';
import { BIOMES } from '../src/terrain.ts';
import { buildPaintData, fanCoords, fanFrames, paintAt, paintDelta, softAt, FAN_COORDS } from '../src/paint.ts';
import { locate } from '../src/terrainMesh.ts';
import { CityProps, type CitySpot } from '../src/cityProps.ts';
import { waterRule } from '../src/buildingCatalog.ts';
import { RESOURCE_WILD } from '../src/rural/resourceModels.ts';
import { placeResource } from '../src/rural/resourcePlace.ts';
import { roamOf } from '../src/rural/models.ts';
import { mulberry32 } from '../src/rng.ts';

// A grown world (cities, worked land, resources), and the ground as the
// painting has it: its owner at every point (flat; under water where the
// owner is a water tile).
const g = new Game({ size: 'small', seed: 222 });
g.players[0]!.isHuman = false;
for (let i = 0; i < 120; i++) { aiTurn(g, g.players[0]!); g.endTurn(); }
const paint = buildPaintData(g.globe, g.map, g.seed);
const frames = fanFrames(g.globe);
const co = new Float32Array(FAN_COORDS);
const spotIn = (t: number, i: number, dir: THREE.Vector3): CitySpot => {
  const fanId = paint.fanStart[t]! + i, fan = paint.fans[fanId]!;
  fanCoords(frames[fanId]!, fan, paintDelta(paint.params, dir.x, dir.y, dir.z), dir.x, dir.y, dir.z, co);
  const w = paintAt(paint, fanId, co).w, soft = softAt(paint, fanId, co);
  let o = 0;
  for (let c = 1; c < 4; c++) if (w[c]! > w[o]!) o = c;
  const owner = fan.ids[o]!, wet = BIOMES[g.biome[owner]!].water;
  return { dir, ground: 0.01, water: wet ? 0.0105 : 0, slope: 0, urban: g.use[owner] === USE.center ? 1 : 0, owner, own: soft[o]! };
};
let hint = 0;
const ownerAt = (dir: THREE.Vector3) => { const l = locate(g.globe, dir, hint); hint = l.t; return { ...spotIn(l.t, l.i, dir), t: l.t }; };
const spotAt = (t: number, i: number, wa: number, wb: number) => {
  const tl = g.tiles[t]!, k = tl.corners.length;
  const A = g.globe.triCenters[tl.corners[i]!]!, B = g.globe.triCenters[tl.corners[(i + 1) % k]!]!;
  return spotIn(t, i, tl.center.clone().multiplyScalar(1 - wa - wb).addScaledVector(A, wa).addScaledVector(B, wb).normalize());
};

describe('painted tiles: props stand on their tile\'s painted land', () => {
  it('resources: every model, and every walker\'s whole walk', () => {
    const bad: string[] = [];
    let placed = 0, walkers = 0;
    for (let t = 0; t < g.N; t++) {
      const r = g.resources[t];
      if (!r) continue;
      for (const m of placeResource(g, t, r, RESOURCE_WILD[r], mulberry32(t + 1), ownerAt)) {
        placed++;
        if (ownerAt(m.dir).owner !== t) bad.push(`tile ${t} ${r}: ${m.model}`);
        const reach = 2 * roamOf(m.model) * m.s * m.k;
        if (reach > 0) {
          walkers++;
          // (Round its loop, between the checked points too.)
          const e = new THREE.Vector3(1, 0, 0).addScaledVector(m.dir, -m.dir.x).normalize(), f = m.dir.clone().cross(e);
          for (let j = 0; j < 16; j++) {
            const a = (j / 16) * Math.PI * 2, p = m.dir.clone().addScaledVector(e, reach * 0.9 * Math.cos(a)).addScaledVector(f, reach * 0.9 * Math.sin(a)).normalize();
            if (ownerAt(p).owner !== t) { bad.push(`tile ${t} ${r}: ${m.model}'s walk`); break; }
          }
        }
      }
    }
    expect(placed).toBeGreaterThan(200);
    expect(walkers).toBeGreaterThan(10);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('cities and the countryside: every building, yard and crop on its own tile\'s land', () => {
    const cp = new CityProps(g, spotAt, ownerAt, g.globe.avgEdgeAngle / 0.07);
    const bad = new Map<string, number>();
    let checked = 0;
    for (let t = 0; t < g.N; t++) {
      if (g.use[t] === USE.wild) continue;
      for (const b of cp.place(t)) {
        // (Boats sit on the water off their town: on the sea's land.)
        if (waterRule(b.kind) === 'float') continue;
        checked++;
        const pos = new THREE.Vector3().setFromMatrixPosition(b.matrix).normalize();
        if (ownerAt(pos).owner !== t) bad.set(b.kind, (bad.get(b.kind) ?? 0) + 1);
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(Object.fromEntries(bad)).toEqual({});
  });
});
