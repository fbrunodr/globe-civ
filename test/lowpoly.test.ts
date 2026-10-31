import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { creature, horseParts, type Species } from '../src/creatures.ts';
import { workerModel, type Worker } from '../src/rural/kit.ts';
import { hairShapes } from '../src/people.ts';
import { unitModel, rides, isMachine, unitVariants, wearsHelmet, HAIR_BY } from '../src/unitModels.ts';
import { LOWPOLY_BUDGET, triangles } from '../src/lowpoly.ts';
import { UNITS, type UnitKey } from '../src/rules.ts';
const UNIT_TYPES = Object.keys(UNITS) as UnitKey[];

// People and animals are low-poly (lowpoly.ts): about LOWPOLY_BUDGET
// triangles each, a few over where it buys a better look; a figure with
// all it carries (hair, hat, tools, weapons, shield) a little more.
const SLACK = 12, GEAR = 30;
const SPECIES: Species[] = ['horse', 'cow', 'pied', 'ox', 'sheep', 'mouflon', 'deer', 'stag', 'elephant', 'fox'];
const WORKERS: Worker[] = ['farmer', 'reaper', 'herder', 'hunter', 'gunHunter', 'picker', 'miner', 'woodcutter'];
const tris = (g: THREE.BufferGeometry) => triangles([g]);

describe('L1: people and animals within the low-poly budget', () => {
  it('each animal', () => {
    for (const sp of SPECIES) {
      const n = triangles(creature(sp));
      console.log(`${sp}: ${n}`);
      expect(n, sp).toBeLessThanOrEqual(LOWPOLY_BUDGET + SLACK);
    }
  });
  it('each countryside worker, with hair, hat and tools', () => {
    for (const w of WORKERS) for (const v of [0, 1]) {
      const n = triangles(workerModel(w, v));
      console.log(`${w}/${v}: ${n}`);
      expect(n, w).toBeLessThanOrEqual(LOWPOLY_BUDGET + GEAR);
    }
  });
  it('each unit figure with its hair and gear (a rider and his horse each)', () => {
    // (The fullest hair a figure may wear: bareheaded, or under a helmet.)
    const hairOf = (helmet: boolean) => Math.max(...[...HAIR_BY.man[helmet ? 'helmet' : 'bare'], ...HAIR_BY.woman[helmet ? 'helmet' : 'bare']].map((s) => triangles(hairShapes(s))));
    const horse = triangles([...horseParts().body, ...Object.values(horseParts().legs)]);
    for (const type of UNIT_TYPES) {
      if (isMachine(type)) continue;
      for (let v = 0; v < unitVariants(type); v++) {
        // (A rider's count holds his horse's tack and cloth.)
        const n = tris(unitModel(type, 'Romans', v)) + hairOf(wearsHelmet(type, 'Romans')) - (rides(type, v) ? horse : 0);
        console.log(`${type}/${v}: ${n}${rides(type, v) ? ` + horse ${horse}` : ''}`);
        expect(n, type).toBeLessThanOrEqual(LOWPOLY_BUDGET + GEAR + (rides(type, v) ? 30 : 0));
      }
    }
  });
});
