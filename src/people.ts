// People: the figures of the units (unitModels.ts) and of the countryside
// (farmers, herders, hunters, fishers: rural/models.ts), one builder for
// both. A body of real proportions (about seven and a half heads tall):
// a lofted torso, legs with knees and shoes, arms with elbows and hands,
// a head with its jaw, nose, ears and eyes; dressed in a tunic (its skirt
// to the knee, to the ankle for a woman out of the army), sleeves short or
// long, trousers or bare legs, a belt. Smooth-shaded.
//
// A figure is 1 tall (its crown), standing on y = 0, facing +z. Each part
// says what it is, for the units' shader: skin (each figure's own tone),
// team (the owner's colour: the tunic), plain; and how it moves (limb:
// side, pivot height, amplitude; unitModels.ts). The countryside paints
// skin and cloth itself (ruralPerson).

import * as THREE from 'three';
import { loft, smooth, S, tube, ellipsoid, finish, type Paint } from './creatures.ts';

export const HIP = 0.5, SHOULDER = 0.8, HEAD_Y = 0.93, HEAD_R = 0.066;
export const SKIN_PAINT = 0xffffff, CLOTH_PAINT = 0xa4a4a4;
const TRIM = 0x6e6e6e; // (the cloth's darker band: the owner's colour, deeper)
const SHOE = 0x3a2a1e, EYE = 0x1a1410, BROW = 0x5a3a28, LIP = 0xc89080;

export type PartTag = 'skin' | 'team' | 'plain';
export interface Part { readonly geo: THREE.BufferGeometry; readonly tag: PartTag; readonly limb?: readonly [number, number, number] }

// How a figure is dressed.
export interface Dress {
  readonly female?: boolean;
  readonly skirt?: 'knee' | 'ankle' | 'none'; // the tunic's skirt (none: a short jerkin, trousers below)
  readonly legs?: 'bare' | number;           // bare, or trousers of that colour
  readonly sleeves?: 'short' | 'long';
  readonly belt?: number;
  readonly shoes?: number;
}
// How its arms are held: each arm's upper and lower directions (unit
// vectors, from the shoulder and the elbow; x out to its side).
export interface ArmPose { readonly upper: readonly [number, number, number]; readonly fore: readonly [number, number, number] }
export const HANG: ArmPose = { upper: [0.14, -1, 0.02], fore: [0.06, -1, 0.14] };
export const HOLD: ArmPose = { upper: [0.1, -1, 0.3], fore: [0.05, -0.15, 1] };      // forearm forward (a spear upright, reins)
export const RAISE: ArmPose = { upper: [0.2, -0.2, 0.6], fore: [0.1, 0.5, 1] };      // reaching forward and up (a bow held out)
export const SHIELD: ArmPose = { upper: [0.25, -1, 0.25], fore: [0.1, -0.1, 1] };    // the shield forearm across the front
export const WORK: ArmPose = { upper: [0.15, -0.8, 0.55], fore: [0.0, -0.6, 1] };    // down and forward (a hoe, a scythe)

const norm = (v: readonly [number, number, number]) => new THREE.Vector3(...v).normalize();
const UPPER = 0.17, FORE = 0.155;

// Where an arm's hand comes to (side: +1 the figure's left, at +x... the
// figure faces +z, so its right hand is at -x: side -1).
export function handAt(side: 1 | -1, pose: ArmPose, female = false): THREE.Vector3 {
  const sh = new THREE.Vector3(side * (female ? 0.118 : 0.132), SHOULDER - 0.01, 0);
  const u = norm(pose.upper), f = norm(pose.fore);
  u.x *= side; f.x *= side;
  return sh.addScaledVector(u, UPPER).addScaledVector(f, FORE + 0.035);
}

// A figure's body and dress. `armL`, `armR`: the poses (the figure's left
// arm is at +x); `limbs`: the march's swing for legs and the arms left
// free (null: still, as in the countryside).
export function person(d: Dress, armL: ArmPose = HANG, armR: ArmPose = HANG, swing: { legs: (side: number) => readonly [number, number, number]; arms: (side: number) => readonly [number, number, number] | undefined } | null = null): Part[] {
  const f = d.female === true, skirt = d.skirt ?? 'knee', legPaint: Paint = d.legs === undefined || d.legs === 'bare' ? SKIN_PAINT : d.legs;
  const legTag: PartTag = d.legs === undefined || d.legs === 'bare' ? 'skin' : 'plain';
  const out: Part[] = [];
  const add = (geo: THREE.BufferGeometry, tag: PartTag, limb?: readonly [number, number, number]) => out.push(limb ? { geo, tag, limb } : { geo, tag });
  // Legs: thigh, knee, calf, ankle; the shoe.
  for (const side of [1, -1] as const) {
    const x = side * (f ? 0.058 : 0.062), lm = swing?.legs(side);
    add(tube([[x, HIP + 0.02, 0], [x, 0.38, 0.005], [x * 0.97, 0.27, 0.008], [x * 0.96, 0.18, -0.004], [x * 0.95, 0.06, -0.006], [x * 0.95, 0.035, -0.008]], [f ? 0.056 : 0.054, 0.045, 0.032, 0.036, 0.022, 0.022], legPaint, 8, 2), legTag, lm);
    add(tube([[x * 0.95, 0.035, -0.035], [x * 0.95, 0.032, 0.0], [x * 0.96, 0.024, 0.05], [x * 0.96, 0.018, 0.075]], [0.024, 0.03, 0.028, 0.016], d.shoes ?? SHOE, 7, 2, 1.25, new THREE.Vector3(1, 0, 0)), 'plain', lm);
  }
  // The torso (the tunic's body) and its skirt.
  const W = f ? [0.082, 0.1, 0.066, 0.09, 0.098, 0.094] : [0.078, 0.094, 0.076, 0.1, 0.114, 0.108];
  const D = f ? [0.058, 0.066, 0.05, 0.07, 0.06, 0.054] : [0.058, 0.064, 0.054, 0.068, 0.064, 0.056];
  add(loft(smooth([S(0, 0.46, 0.03, 0.03), S(0, 0.48, W[0]!, D[0]!), S(0, 0.53, W[1]!, D[1]!), S(0, 0.62, W[2]!, D[2]!), S(0, 0.7, W[3]!, D[3]!), S(0, 0.77, W[4]!, D[4]!), S(0, 0.815, W[5]!, D[5]!), S(0, 0.845, 0.04, 0.034)], 3), 14, (p) => (p.y > 0.825 ? TRIM : CLOTH_PAINT), new THREE.Vector3(0, 0, 1)), 'team');
  if (skirt !== 'none') {
    const hem = skirt === 'ankle' ? 0.07 : f ? 0.25 : 0.3, flare = skirt === 'ankle' ? 1.5 : 1.25;
    // (A darker band at its hem.)
    add(loft(smooth([{ x: 0, y: 0.63, z: 0, a: W[2]! + 0.006, b: D[2]! + 0.006 }, { x: 0, y: 0.52, z: 0, a: W[1]! + 0.012, b: D[1]! + 0.014 }, { x: 0, y: (0.52 + hem) / 2, z: 0, a: (W[1]! + 0.02) * (1 + (flare - 1) * 0.5), b: (D[1]! + 0.03) * (1 + (flare - 1) * 0.5) }, { x: 0, y: hem, z: 0.005, a: (W[1]! + 0.024) * flare, b: (D[1]! + 0.036) * flare }], 4), 14, (p) => (p.y < hem + 0.03 ? TRIM : CLOTH_PAINT), new THREE.Vector3(0, 0, 1)), 'team');
  }
  if (d.belt !== undefined) add(finish(new THREE.TorusGeometry(1, 0.11, 5, 16).rotateX(Math.PI / 2).scale(W[2]! + 0.008, 0.06, D[2]! + 0.008).translate(0, 0.615, 0), d.belt), 'plain');
  // Neck and head: skull, jaw, nose, ears, eyes and brows, lips.
  add(tube([[0, 0.83, -0.004], [0, 0.875, 0.002]], [0.03, 0.028], SKIN_PAINT, 8, 2), 'skin');
  add(ellipsoid([0, HEAD_Y + 0.006, -0.004], [HEAD_R * 0.86, HEAD_R * 1.04, HEAD_R], SKIN_PAINT, 12), 'skin');
  add(ellipsoid([0, HEAD_Y - 0.032, 0.014], [HEAD_R * 0.66, HEAD_R * 0.6, HEAD_R * 0.72], SKIN_PAINT, 10), 'skin');
  add(tube([[0, HEAD_Y + 0.004, 0.05], [0, HEAD_Y - 0.014, 0.066], [0, HEAD_Y - 0.02, 0.07]], [0.009, 0.012, 0.008], SKIN_PAINT, 6, 2), 'skin');
  for (const side of [1, -1] as const) {
    add(ellipsoid([side * HEAD_R * 0.86, HEAD_Y - 0.002, -0.006], [0.01, 0.018, 0.012], SKIN_PAINT, 6), 'skin');
    add(ellipsoid([side * 0.021, HEAD_Y + 0.006, HEAD_R * 0.86], [0.009, 0.006, 0.004], EYE, 6), 'plain');
    add(ellipsoid([side * 0.022, HEAD_Y + 0.018, HEAD_R * 0.86], [0.013, 0.003, 0.004], f ? 0x6a4a36 : BROW, 5, [0, 0, side * -0.15]), 'plain');
  }
  add(ellipsoid([0, HEAD_Y - 0.036, HEAD_R * 0.83], [0.013, 0.004, 0.004], LIP, 6), 'plain');
  // Arms: sleeve (cloth) to the elbow or the wrist, the rest skin, the hand.
  for (const side of [1, -1] as const) {
    const pose = side === 1 ? armL : armR, lm = swing?.arms(side);
    const sh = new THREE.Vector3(side * (f ? 0.118 : 0.132), SHOULDER - 0.01, 0);
    const u = norm(pose.upper), fo = norm(pose.fore);
    u.x *= side; fo.x *= side;
    const el = sh.clone().addScaledVector(u, UPPER), wr = el.clone().addScaledVector(fo, FORE), hd = wr.clone().addScaledVector(fo, 0.035);
    const v = (p: THREE.Vector3) => [p.x, p.y, p.z] as const;
    const long = d.sleeves === 'long';
    add(tube([v(sh.clone().addScaledVector(u, -0.02)), v(sh.clone().addScaledVector(u, UPPER * 0.5)), v(el)], [0.036, 0.03, 0.026], CLOTH_PAINT, 8, 2), 'team', lm);
    add(tube([v(el), v(el.clone().addScaledVector(fo, FORE * 0.5)), v(wr)], [0.025, 0.024, 0.018], long ? CLOTH_PAINT : SKIN_PAINT, 8, 2), long ? 'team' : 'skin', lm);
    add(ellipsoid([hd.x, hd.y, hd.z], [0.017, 0.022, 0.013], SKIN_PAINT, 7), 'skin', lm);
  }
  return out;
}

// A seated rider's body, its hips at `seat` high astride a horse: thighs
// forward and apart, shins down along the flanks; the torso, head and arms
// as a standing figure's, raised (unitModels.ts).
export function riderBody(d: Dress, seat: number, armL: ArmPose, armR: ArmPose): Part[] {
  const lift = seat - HIP;
  const top = person({ ...d, skirt: 'none' }, armL, armR).filter((p) => !isLeg(p));
  const out: Part[] = top.map((p) => ({ ...p, geo: p.geo.translate(0, lift, 0) }));
  const legPaint: Paint = d.legs === undefined || d.legs === 'bare' ? SKIN_PAINT : d.legs, legTag: PartTag = d.legs === undefined || d.legs === 'bare' ? 'skin' : 'plain';
  for (const side of [1, -1] as const) {
    const x = side * 0.07;
    out.push({ geo: tube([[x, seat + 0.02, 0], [side * 0.15, seat - 0.02, 0.1], [side * 0.17, seat - 0.13, 0.12], [side * 0.165, seat - 0.27, 0.06], [side * 0.16, seat - 0.33, 0.05]], [0.052, 0.04, 0.032, 0.026, 0.022], legPaint, 8, 2), tag: legTag });
    out.push({ geo: tube([[side * 0.16, seat - 0.345, 0.02], [side * 0.16, seat - 0.35, 0.09]], [0.026, 0.02], d.shoes ?? SHOE, 6, 2, 1.2, new THREE.Vector3(1, 0, 0)), tag: 'plain' });
  }
  return out;
}
// (A standing figure's legs and shoes: what lies below its hips.)
function isLeg(p: Part): boolean {
  const pos = p.geo.getAttribute('position');
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  return top < HIP + 0.04;
}

// ---- the countryside's people ----
// A figure for the countryside: its skin and cloth painted (no team, no
// skin tone per instance), merged parts ready for rural/models.ts.
export function ruralPerson(parts: readonly Part[], skin: number, cloth: number): THREE.BufferGeometry[] {
  const sk = new THREE.Color(skin), cl = new THREE.Color(cloth), w = new THREE.Color(SKIN_PAINT), g = new THREE.Color(CLOTH_PAINT);
  return parts.map((p) => {
    if (p.tag === 'plain') return p.geo;
    const col = p.geo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < col.count; i++) {
      const isSkin = p.tag === 'skin' && Math.abs(col.getX(i) - w.r) < 1e-3 && Math.abs(col.getY(i) - w.g) < 1e-3;
      const isCloth = p.tag === 'team' || (Math.abs(col.getX(i) - g.r) < 1e-3 && Math.abs(col.getY(i) - g.g) < 1e-3);
      if (isSkin) col.setXYZ(i, sk.r, sk.g, sk.b);
      else if (isCloth) col.setXYZ(i, cl.r * col.getX(i) / g.r, cl.g * col.getY(i) / g.g, cl.b * col.getZ(i) / g.b);
    }
    return p.geo;
  });
}

// ---- hair and hats ----
// Hair: a style's shapes on a head standing at HEAD_Y, white (the caller
// colours it).
export const HAIR_STYLE_KEYS = ['short', 'long', 'bun', 'tail', 'beard', 'bald'] as const;
export type HairStyleKey = typeof HAIR_STYLE_KEYS[number];
export function hairShapes(style: HairStyleKey): THREE.BufferGeometry[] {
  const W = 0xffffff, R = HEAD_R;
  // A cap over the crown, down to the brow in front and the nape behind.
  const cap = () => finish(new THREE.SphereGeometry(R * 1.07, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.9, 1.05, 1.02).rotateX(-0.32).translate(0, HEAD_Y + 0.008, -0.01), W);
  // (A beard on the jaw and chin, below the mouth; a moustache over it.)
  const beard = () => [ellipsoid([0, HEAD_Y - 0.052, 0.016], [R * 0.6, R * 0.42, R * 0.62], W, 10), tube([[-0.024, HEAD_Y - 0.036, R * 0.8], [0, HEAD_Y - 0.03, R * 0.9], [0.024, HEAD_Y - 0.036, R * 0.8]], [0.005, 0.007, 0.005], W, 5, 2)];
  switch (style) {
    case 'short': return [cap()];
    case 'long': return [cap(), ellipsoid([0, HEAD_Y - 0.06, -0.045], [R * 0.95, R * 1.5, R * 0.45], W, 10)];
    case 'bun': return [cap(), ellipsoid([0, HEAD_Y + 0.04, -0.06], [0.03, 0.03, 0.03], W, 8)];
    case 'tail': return [cap(), tube([[0, HEAD_Y + 0.01, -0.06], [0, HEAD_Y - 0.06, -0.085], [0, HEAD_Y - 0.15, -0.08]], [0.022, 0.018, 0.008], W, 6, 2)];
    case 'beard': return [cap(), ...beard()];
    // (A fringe round the back and sides, above the ears; the face clear.)
    case 'bald': return [finish(new THREE.SphereGeometry(R * 1.05, 14, 3, Math.PI * 5 / 6, Math.PI * 4 / 3, Math.PI * 0.38, Math.PI * 0.16).translate(0, HEAD_Y + 0.004, -0.004), W)];
  }
}
// A broad straw hat (the fields' sun hat) or a felt one.
export function hatShapes(kind: 'straw' | 'felt' | 'hood', color: number): THREE.BufferGeometry[] {
  const y = HEAD_Y + 0.035;
  switch (kind) {
    case 'straw': return [finish(new THREE.ConeGeometry(0.17, 0.07, 14, 1, true).translate(0, y + 0.03, 0), color), finish(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 12).translate(0, y + 0.04, 0), color)];
    case 'felt': return [finish(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 14).translate(0, y, 0), color), finish(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 12).translate(0, y + 0.032, 0), color)];
    case 'hood': return [finish(new THREE.SphereGeometry(HEAD_R * 1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.1, 1.05).rotateX(-0.45).translate(0, HEAD_Y, -0.012), color)];
  }
}
