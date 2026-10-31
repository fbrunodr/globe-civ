// People: the figures of the units (unitModels.ts) and of the countryside
// (farmers, herders, hunters, fishers: rural/models.ts), one builder for
// both. Low-poly, in the PS1's way (lowpoly.ts): a body of real
// proportions (about seven and a half heads tall) in a few hard-edged
// blocks: a torso, box limbs, wedge shoes, a five-sided head (its front
// edge the nose); dressed in a tunic (its skirt to the knee, to the ankle
// for a woman out of the army), sleeves short or long, trousers or bare
// legs, a belt. A figure with its hair is well under LOWPOLY_BUDGET
// triangles, leaving room for what it carries.
//
// A figure is 1 tall (its crown), standing on y = 0, facing +z. Each part
// says what it is, for the units' shader: skin (each figure's own tone),
// team (the owner's colour: the tunic), plain; and how it moves (limb:
// side, pivot height, amplitude; unitModels.ts). The countryside paints
// skin and cloth itself (ruralPerson).

import * as THREE from 'three';
import { hull, limb, spike, gem, plate, R, type V3 } from './lowpoly.ts';
import type { Paint } from './creatures.ts';

export const HIP = 0.5, SHOULDER = 0.8, HEAD_Y = 0.93;
export const SKIN_PAINT = 0xffffff, CLOTH_PAINT = 0xa4a4a4;
const TRIM = 0x6e6e6e; // (the cloth's darker hem: the owner's colour, deeper)
const SHOE = 0x3a2a1e;

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
const v3 = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];
// (The head's and hair's rings: five points, one forward.)
const FIVE = { turn: Math.PI / 2 } as const;

// The head's widest ring and its crown (a flat top), five-sided as it.
const HEAD_BROW = R([0, HEAD_Y + 0.005, 0.002], 0.064, 0.07), HEAD_CROWN = R([0, HEAD_Y + 0.06, -0.006], 0.044, 0.05);
// A shell over the head (helmets, hats, turbans: unitModels.ts): its
// rings the head's own, scaled out, so that it holds the head at every
// height. `levels`: (height over HEAD_Y, how far out: 1 the head's own
// size there, 0 a point), below the crown sized on the brow, above it on
// the crown.
export function headShell(levels: readonly (readonly [number, number])[], paint: Paint, caps: readonly [boolean, boolean] = [false, false]): THREE.BufferGeometry {
  const rings = levels.map(([dy, k]) => {
    const base = dy < 0.035 ? HEAD_BROW : HEAD_CROWN;
    return R([0, HEAD_Y + dy, base.c[2]], base.a * k, base.b * k);
  });
  return hull(rings, 5, paint, { ...FIVE, caps });
}

// Where an arm's hand comes to (side: +1 the figure's left, at +x... the
// figure faces +z, so its right hand is at -x: side -1).
export function handAt(side: 1 | -1, pose: ArmPose, female = false): THREE.Vector3 {
  const sh = new THREE.Vector3(side * (female ? 0.115 : 0.128), SHOULDER - 0.01, 0);
  const u = norm(pose.upper), f = norm(pose.fore);
  u.x *= side; f.x *= side;
  return sh.addScaledVector(u, UPPER).addScaledVector(f, FORE + 0.03);
}

// A figure's body and dress. `armL`, `armR`: the poses (the figure's left
// arm is at +x); `swing`: the march's swing for legs and the arms left
// free (null: still, as in the countryside).
export function person(d: Dress, armL: ArmPose = HANG, armR: ArmPose = HANG, swing: { legs: (side: number) => readonly [number, number, number]; arms: (side: number) => readonly [number, number, number] | undefined } | null = null): Part[] {
  const f = d.female === true, skirt = d.skirt ?? 'knee', bare = d.legs === undefined || d.legs === 'bare';
  const legPaint: Paint = bare ? SKIN_PAINT : (d.legs as number), legTag: PartTag = bare ? 'skin' : 'plain';
  const out: Part[] = [];
  const add = (geo: THREE.BufferGeometry, tag: PartTag, limb?: readonly [number, number, number]) => out.push(limb ? { geo, tag, limb } : { geo, tag });
  // Legs: thigh, knee, shin, as one box; the shoe a wedge.
  for (const side of [1, -1] as const) {
    const x = side * (f ? 0.056 : 0.062), lm = swing?.legs(side);
    // (Under a skirt to the ankle only the shoes show.)
    if (skirt !== 'ankle') add(limb([[x, HIP + 0.03, 0], [x * 0.97, 0.27, 0.012], [x * 0.95, 0.03, -0.004]], [f ? 0.056 : 0.054, 0.038, 0.027], legPaint, 4, { caps: [false, false] }), legTag, lm);
    add(shoe(x * 0.95, 0, d.shoes ?? SHOE), 'plain', lm);
  }
  // The torso (the tunic's body: pointed at the sides, flat before and
  // behind), its skirt and belt.
  const T = f ? [[0.098, 0.066], [0.074, 0.054], [0.104, 0.072], [0.046, 0.038]] : [[0.085, 0.062], [0.08, 0.058], [0.118, 0.068], [0.05, 0.04]];
  // (Under a skirt, from the waist: the hips hidden.)
  const from = skirt === 'none' ? 0 : 1;
  add(hull([0.46, 0.6, 0.76, 0.855].slice(from).map((y, i) => R([0, y, 0], T[i + from]![0]!, T[i + from]![1]!)), 6, CLOTH_PAINT, { caps: [false, true] }), 'team');
  const [wa, wb] = T[1]!;
  if (skirt !== 'none') {
    const hem = skirt === 'ankle' ? 0.07 : f ? 0.27 : 0.3, flare = skirt === 'ankle' ? 1.5 : 1.3;
    const rings = [R([0, 0.63, 0], wa! + 0.012, wb! + 0.012), ...(skirt === 'ankle' ? [R([0, 0.36, 0.004], (wa! + 0.03) * 1.2, (wb! + 0.03) * 1.2)] : []), R([0, hem, 0.006], (wa! + 0.03) * flare, (wb! + 0.034) * flare)];
    add(hull(rings, 6, (p) => (p.y < hem + 0.01 ? TRIM : CLOTH_PAINT), { caps: [false, false] }), 'team');
  }
  if (d.belt !== undefined) add(hull([R([0, 0.64, 0], wa! + 0.018, wb! + 0.018), R([0, 0.61, 0], wa! + 0.018, wb! + 0.018)], 6, d.belt, { caps: [false, false] }), 'plain');
  // The head: chin, cheekbones, crown; its front edge the nose.
  add(hull([R([0, HEAD_Y - 0.068, 0.012], 0.036, 0.042), HEAD_BROW, HEAD_CROWN], 5, SKIN_PAINT, FIVE), 'skin');
  // Arms: sleeve (cloth) to the elbow, the forearm sleeved or bare, the hand.
  for (const side of [1, -1] as const) {
    const pose = side === 1 ? armL : armR, lm = swing?.arms(side);
    const sh = new THREE.Vector3(side * (f ? 0.115 : 0.128), SHOULDER - 0.01, 0);
    const u = norm(pose.upper), fo = norm(pose.fore);
    u.x *= side; fo.x *= side;
    const el = sh.clone().addScaledVector(u, UPPER), wr = el.clone().addScaledVector(fo, FORE);
    const long = d.sleeves === 'long', X: V3 = [1, 0, 0];
    add(limb([v3(sh.clone().addScaledVector(u, -0.02)), v3(el.clone().addScaledVector(u, 0.012))], [0.036, 0.028], CLOTH_PAINT, 4, { caps: [false, false], side: X }), 'team', lm);
    add(limb([v3(el), v3(wr)], [0.027, 0.02], long ? CLOTH_PAINT : SKIN_PAINT, 4, { caps: [false, false], side: X }), long ? 'team' : 'skin', lm);
    add(hull([R(v3(wr), 0.021, 0.015), R(v3(wr.clone().addScaledVector(fo, 0.065)), 0, 0)], 4, SKIN_PAINT, { side: X, caps: [false, false] }), 'skin', lm);
  }
  return out;
}
// A shoe: a wedge, flat below, its heel at z = z0 - 0.04, toe forward.
function shoe(x: number, z0: number, color: number): THREE.BufferGeometry {
  return hull([R([x, 0.013, z0 - 0.04], 0.026, 0.028), R([x, 0.008, z0 + 0.08], 0.016, 0.024)], 3, color, { side: [1, 0, 0], turn: Math.PI / 3 });
}

// A seated rider's body, its hips at `seat` high astride a horse: thighs
// forward and apart, shins down along the flanks; the torso, head and arms
// as a standing figure's, raised (unitModels.ts).
export function riderBody(d: Dress, seat: number, armL: ArmPose, armR: ArmPose): Part[] {
  const lift = seat - HIP;
  const top = person({ ...d, skirt: 'none' }, armL, armR).filter((p) => !isLeg(p));
  const out: Part[] = top.map((p) => ({ ...p, geo: p.geo.translate(0, lift, 0) }));
  const bare = d.legs === undefined || d.legs === 'bare';
  const legPaint: Paint = bare ? SKIN_PAINT : (d.legs as number), legTag: PartTag = bare ? 'skin' : 'plain';
  for (const side of [1, -1] as const) {
    out.push({ geo: limb([[side * 0.07, seat + 0.02, 0], [side * 0.15, seat - 0.02, 0.1], [side * 0.165, seat - 0.31, 0.05]], [0.05, 0.036, 0.025], legPaint, 4, { caps: [false, false] }), tag: legTag });
    out.push({ geo: shoe(side * 0.165, 0.05, d.shoes ?? SHOE).translate(0, seat - 0.345, 0), tag: 'plain' });
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
// (Under a helmet only what shows below it: helmBeard, helmLong, bald.)
export const HAIR_STYLE_KEYS = ['short', 'long', 'bun', 'tail', 'beard', 'bald', 'helmBeard', 'helmLong'] as const;
export type HairStyleKey = typeof HAIR_STYLE_KEYS[number];
// (Tipped back about the head: the hair's edge high on the brow, low on the nape.)
const tipBack = (g: THREE.BufferGeometry, a = 0.35) =>
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, HEAD_Y, 0).multiply(new THREE.Matrix4().makeRotationX(-a)).multiply(new THREE.Matrix4().makeTranslation(0, -HEAD_Y, 0)));
// (A cap's lower edge sheared: high on the brow, low on the nape.)
function hairline(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < HEAD_Y + 0.01) pos.setY(i, pos.getY(i) + Math.max(-0.05, Math.min(0.035, pos.getZ(i) * 0.55)));
  g.computeVertexNormals();
  return g;
}
export function hairShapes(style: HairStyleKey): THREE.BufferGeometry[] {
  const W = 0xffffff;
  // A cap over the crown, down to the brow in front and the nape behind: a
  // shell over the head's own rings (so the head never shows through it),
  // its edge raised in front and lowered behind.
  const cap = () => hairline(headShell([[0.0, 1.1], [0.066, 1.2], [0.088, 0]], W));
  const beard = () => hull([R([0, HEAD_Y - 0.03, 0.014], 0.056, 0.06), R([0, HEAD_Y - 0.092, 0.042], 0, 0)], 5, W, { ...FIVE, caps: [false, false] });
  const long = () => hull([R([0, HEAD_Y - 0.005, -0.045], 0.064, 0.03), R([0, HEAD_Y - 0.13, -0.062], 0.06, 0.018)], 4, W);
  switch (style) {
    case 'short': return [cap()];
    case 'helmBeard': return [beard()];
    case 'helmLong': return [long()];
    case 'long': return [cap(), long()];
    case 'bun': return [cap(), gem([0, HEAD_Y + 0.045, -0.07], [0.032, 0.032, 0.032], W, 4)];
    case 'tail': return [cap(), spike([[0, HEAD_Y + 0.0, -0.07], [0, HEAD_Y - 0.07, -0.092], [0, HEAD_Y - 0.15, -0.086]], 0.024, W)];
    // (A beard on the jaw and chin, below the mouth.)
    case 'beard': return [cap(), beard()];
    // (A fringe round the back and sides, above the ears; the face clear.)
    case 'bald': return [tipBack(hull([R([0, HEAD_Y - 0.025, -0.002], 0.07, 0.076), R([0, HEAD_Y + 0.02, -0.003], 0.067, 0.073)], 5, W, { ...FIVE, caps: [false, false], skip: (j) => j === 0 || j === 4 }), 0.2)];
  }
}
// A broad straw hat (the fields' sun hat), a felt one, or a hood.
export function hatShapes(kind: 'straw' | 'felt' | 'hood', color: number): THREE.BufferGeometry[] {
  const y = HEAD_Y + 0.035;
  switch (kind) {
    case 'straw': return [hull([R([0, y + 0.015, 0], 0.17), R([0, y + 0.05, 0], 0, 0)], 6, color), hull([R([0, y + 0.03, 0], 0.065), R([0, y + 0.1, 0], 0, 0)], 6, color, { caps: [false, false] })];
    case 'felt': return [plate([0, 1, 2, 3, 4, 5].map((i) => [Math.cos(i * Math.PI / 3) * 0.11, Math.sin(i * Math.PI / 3) * 0.11] as const), color).rotateX(-Math.PI / 2).translate(0, y, 0), hull([R([0, y - 0.005, 0], 0.062), R([0, y + 0.06, 0], 0.054)], 6, color, { caps: [false, true] })];
    case 'hood': return [tipBack(hull([R([0, HEAD_Y - 0.05, -0.006], 0.086, 0.09), R([0, HEAD_Y + 0.04, -0.008], 0.074, 0.08), R([0, HEAD_Y + 0.095, -0.01], 0, 0)], 5, color, { ...FIVE, caps: [false, false] }), 0.45)];
  }
}
