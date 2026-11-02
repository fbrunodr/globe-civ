import { describe, it, expect } from 'vitest';
import { cutAngles, nextBlow, poseOf, type Cue } from '../src/unitAnim.ts';
import type { Play } from '../src/unitView.ts';

// How a figure moves (unitAnim.ts): its cuts with a sword or a club, its thrusts with a spear.

// A melee (unitView.ts PLAYS.melee), and a figure cutting in it, engaged with its foe.
const MELEE: Play = { dur: 7, close: true, charge: 1, go: [0.04, 0.26], back: 0.8, strike: [0.18, 0.8], aim: false, shots: [] };
const cue = (sec: number, side: 'attacker' | 'defender', thrust = false): Cue => ({ sec, dur: 7, play: MELEE, attack: MELEE, side, engaged: true, delay: 0, fall: Infinity, won: false, cut: !thrust, thrust });

describe('A1: a cut with a sword or a club', () => {
  for (const side of ['attacker', 'defender'] as const) {
    it(`${side}: the elbow bends only one way and the blade goes with the forearm, never against it`, () => {
      for (let sec = 0; sec < 7; sec += 0.01) for (const beat of [0, 0.3, 0.71]) {
        const p = poseOf(cue(sec, side), 100 + sec, 1.3, beat, 0, false);
        if (p.aimed < 0.999) continue;
        const a = cutAngles(p);
        // (The elbow: straight at most, bent no further than a forearm folds.)
        expect(a.fore - a.upper).toBeGreaterThan(-0.08);
        expect(a.fore - a.upper).toBeLessThan(2.5);
        // (The wrist: the blade from in line with the forearm to cocked back square to it, no further.)
        expect(a.blade - a.fore).toBeGreaterThan(-0.2);
        expect(a.blade - a.fore).toBeLessThan(1.7);
      }
    });
  }
  it('lands with the arm straight out and the blade in line with it', () => {
    const met = MELEE.go[1] * 7;
    for (const beat of [0, 0.3, 0.71]) {
      const t = nextBlow(met + 1.5, met, beat), p = poseOf(cue(t, 'attacker'), 100 + t, 1.3, beat, 0, false), a = cutAngles(p);
      expect(Math.abs(a.fore - a.upper)).toBeLessThan(0.15);
      expect(Math.abs(a.blade - a.fore)).toBeLessThan(0.45);
      // (Out in front, about shoulder high.)
      expect(Math.abs(a.upper - Math.PI / 2)).toBeLessThan(0.4);
    }
  });
  it('winds up with the blade back behind the shoulders, the hand up by the head', () => {
    const met = MELEE.go[1] * 7;
    for (const beat of [0, 0.3, 0.71]) {
      // (Just before the cut begins: wound up, 0.14 of a round before it lands.)
      const t = nextBlow(met + 1.5, met, beat) - 0.16, a = cutAngles(poseOf(cue(t, 'attacker'), 100 + t, 1.3, beat, 0, false));
      expect(a.blade).toBeGreaterThan(Math.PI * 1.15); // (past upright, back)
      expect(a.upper).toBeGreaterThan(1.7);           // (the elbow up)
    }
  });
});

describe('A2: a thrust with a spear', () => {
  for (const side of ['attacker', 'defender'] as const) {
    it(`${side}: the elbow bends only one way, the spear held at the hip or overhand, never flailing`, () => {
      for (let sec = 0; sec < 7; sec += 0.01) for (const beat of [0, 0.3, 0.71, 0.9]) {
        const p = poseOf(cue(sec, side, true), 100 + sec, 1.3, beat, 0, false);
        if (p.aimed < 0.999) continue;
        const a = cutAngles(p);
        expect(a.fore - a.upper).toBeGreaterThan(-0.08);
        expect(a.fore - a.upper).toBeLessThan(2.5);
        // (Levelled at the foe, or a little up or down, as it points in the
        // world (the body's bend tips it forward): never upright or trailing.)
        expect(a.blade - p.bend).toBeGreaterThan(1.0);
        expect(a.blade - p.bend).toBeLessThan(2.2); // (tipped up a little as a blow knocks it back)
      }
    });
  }
  it('lands with the arm straight out', () => {
    const met = MELEE.go[1] * 7;
    for (const beat of [0, 0.3, 0.71, 0.9]) {
      const t = nextBlow(met + 1.5, met, beat), a = cutAngles(poseOf(cue(t, 'attacker', true), 100 + t, 1.3, beat, 0, false));
      expect(Math.abs(a.fore - a.upper)).toBeLessThan(0.15);
      expect(a.upper).toBeGreaterThan(1.1);
    }
  });
});

describe('A3: an archer shooting a volley', () => {
  // (Two arrows, a third of the way through the fight and two thirds: unitView.ts PLAYS.volley.)
  const VOLLEY: Play = { charge: 0, go: [0, 0], back: 1, strike: [0, 0], aim: true, shots: [{ t: 1 / 3, kind: 'arrow' }, { t: 2 / 3, kind: 'arrow' }] };
  const at = (sec: number) => poseOf({ sec, dur: 4.2, play: VOLLEY, attack: VOLLEY, side: 'attacker', engaged: false, delay: 0, fall: Infinity, won: false, bow: true }, 100 + sec, 1.3, 0, 0, false);
  it('is drawn to the cheek and held on the mark as each arrow is loosed', () => {
    for (const t of [1.4, 2.8]) {
      const p = at(t - 0.01);
      expect(p.draw).toBeCloseTo(1, 2);
      // (The arrow level or a little up: from upright, forward.)
      expect(p.aim).toBeGreaterThan(1.2);
      expect(p.aim).toBeLessThan(1.6);
    }
  });
  it('lets the bow down between shots, the arrow at the ground', () => {
    const p = at(2.1);
    expect(p.draw).toBeLessThan(0.1);
    expect(p.aim).toBeGreaterThan(2);
  });
});

describe('A4: a bayonet', () => {
  it('is held levelled at the foe through every lunge, never pointed at the ground or the sky', () => {
    for (const side of ['attacker', 'defender'] as const) for (let sec = 0; sec < 7; sec += 0.01) for (const beat of [0, 0.3, 0.71]) {
      const p = poseOf({ sec, dur: 7, play: MELEE, attack: MELEE, side, engaged: true, delay: 0, fall: Infinity, won: false, bayonet: true }, 100 + sec, 1.3, beat, 0, false);
      if (p.aimed < 0.999) continue;
      // (The gun's aim, from upright forward, as it points in the world: the body's bend tips it forward.)
      expect(p.aim + p.bend).toBeGreaterThan(0.9);
      expect(p.aim + p.bend).toBeLessThan(2.1);
    }
  });
});
