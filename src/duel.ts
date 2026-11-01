import * as THREE from 'three';
import { UNIT_CLASS, type UnitClass } from './unitClasses.ts';
import { unitModel } from './unitModels.ts';
import type { UnitKey } from './rules.ts';

// Melee, figure to figure (as Civ V plays it): the attacking formation
// breaks up, each of its figures running at a figure of the defender's
// (the nearest ranks first, matched left to right; when the attackers are
// more, two or three crowd round one) and stopping at its weapon's reach,
// a spear's tip at the horse, a sword at arm's length. The defender's
// figures turn to face whoever comes at them.

// A place on the plane both formations stand on (figure heights).
export interface P2 { readonly x: number; readonly z: number }
// An attacking figure's fight: whom it goes at (an index into the
// defender's figures), where it stops, how much later than the others it
// sets out (a share of the fight), how far its path bows to one side
// (figure heights: they don't run in step, in straight lines).
export interface Duel { readonly foe: number; readonly to: P2; readonly delay: number; readonly curve: number }

// How far a weapon reaches past the figure's front (figure heights): held
// upright, it comes down as the figure strikes.
const WEAPON: Partial<Record<UnitClass, number>> = { antiCav: 0.55, gunline: 0.3, melee: 0.15 };
const boxes = new Map<UnitKey, THREE.Box3>();
const box = (t: UnitKey): THREE.Box3 => {
  let b = boxes.get(t);
  if (!b) { b = new THREE.Box3().setFromBufferAttribute(unitModel(t, 'Romans').getAttribute('position') as THREE.BufferAttribute); boxes.set(t, b); }
  return b;
};
// How far in front of itself a figure strikes; how far out from its middle
// a figure can be struck (half its width and length, between them).
export const reachOf = (t: UnitKey): number => box(t).max.z + (WEAPON[UNIT_CLASS[t]] ?? 0.05);
export const bulkOf = (t: UnitKey): number => { const b = box(t); return (b.max.x - b.min.x + b.max.z - b.min.z) / 4; };

// Each attacker's duel, its figures at `att` and the defender's at `def`
// (`a` attacking `d`: their reach and bulk).
export function pairUp(att: readonly P2[], def: readonly P2[], a: UnitKey, d: UnitKey, rand: () => number): Duel[] {
  if (!att.length || !def.length) return [];
  const mid = (ps: readonly P2[]) => ps.reduce((m, p) => ({ x: m.x + p.x / ps.length, z: m.z + p.z / ps.length }), { x: 0, z: 0 });
  const ma = mid(att), md = mid(def), len = Math.hypot(md.x - ma.x, md.z - ma.z) || 1;
  const u = { x: (md.x - ma.x) / len, z: (md.z - ma.z) / len }, v = { x: -u.z, z: u.x }; // (toward the defender; across)
  const along = (p: P2) => p.x * u.x + p.z * u.z, across = (p: P2) => p.x * v.x + p.z * v.z;
  // (The defender's figures that can be got at, nobody of theirs before
  // them (the back ranks wait their turn), the nearest first, as many as
  // there are attackers; then both sides left to right.)
  const wide = 1.2 * Math.max(bulkOf(d), bulkOf(a));
  const open = (i: number) => !def.some((q, j) => j !== i && along(q) < along(def[i]!) - 0.3 && Math.abs(across(q) - across(def[i]!)) < wide);
  const targets = def.map((_, i) => i).filter(open).sort((i, j) => along(def[i]!) - along(def[j]!)).slice(0, att.length).sort((i, j) => across(def[i]!) - across(def[j]!));
  const order = att.map((_, i) => i).sort((i, j) => across(att[i]!) - across(att[j]!));
  const foeOf = new Map(order.map((ai, k) => [ai, targets[Math.floor((k * targets.length) / order.length)]!]));
  const crowd = new Map<number, number[]>();
  for (const ai of order) crowd.set(foeOf.get(ai)!, [...(crowd.get(foeOf.get(ai)!) ?? []), ai]);
  const dist = reachOf(a) + bulkOf(d);
  const to = att.map((_, ai) => {
    const foe = foeOf.get(ai)!, group = crowd.get(foe)!, k = group.indexOf(ai);
    // (From the attackers' side; two or three spread round it.)
    const ang = (k - (group.length - 1) / 2) * 0.75, c = Math.cos(ang), s = Math.sin(ang);
    return { x: def[foe]!.x + (-u.x * c - v.x * s) * dist, z: def[foe]!.z + (-u.z * c - v.z * s) * dist };
  });
  // (Nobody stands inside another figure: a figure going at the second
  // rank comes round the first; attackers keep apart. Each stays at reach
  // from its own foe.)
  // (Against the length of the others, a horse's or a ship's: they may stand any way round.)
  const room = Math.max(box(d).max.z, -box(d).min.z) + bulkOf(a), apart = 2 * bulkOf(a);
  for (let pass = 0; pass < 8; pass++) {
    to.forEach((p, ai) => {
      const push = (q: P2, min: number) => {
        const dx = p.x - q.x, dz = p.z - q.z, r = Math.hypot(dx, dz);
        if (r < min && r > 1e-6) { p.x += (dx / r) * (min - r); p.z += (dz / r) * (min - r); }
      };
      def.forEach((q, j) => { if (j !== foeOf.get(ai)) push(q, room); });
      to.forEach((q, j) => { if (j !== ai) push(q, apart); });
      const f = def[foeOf.get(ai)!]!, r = Math.hypot(p.x - f.x, p.z - f.z) || 1;
      p.x = f.x + ((p.x - f.x) / r) * dist; p.z = f.z + ((p.z - f.z) / r) * dist;
    });
  }
  // (They don't set out as one: the formation breaks up, streaming at the enemy.)
  return att.map((_, ai) => ({ foe: foeOf.get(ai)!, to: to[ai]!, delay: rand() * 0.13, curve: (rand() - 0.5) * 1.1 }));
}
