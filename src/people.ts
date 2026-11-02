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
import { hull, limb, spike, gem, plate, R, type Ring, type V3 } from './lowpoly.ts';
import type { Paint } from './creatures.ts';

export const HIP = 0.5, SHOULDER = 0.8, HEAD_Y = 0.93;
export const SKIN_PAINT = 0xffffff, CLOTH_PAINT = 0xa4a4a4;
const TRIM = 0x6e6e6e; // (the cloth's darker hem: the owner's colour, deeper)
const SHOE = 0x3a2a1e;

export type PartTag = 'skin' | 'team' | 'plain';
// (`joint`: a limb's lower piece (shin and shoe, forearm and hand), bent
// about its middle joint (knee, elbow) at y, z before the limb swings.)
// (`skirt`: a garment below the waist that follows the legs: each side of
// it its own leg's swing, less towards the middle and the waist (the
// units' tagging spreads `limb` over it so).)
export interface Part { readonly geo: THREE.BufferGeometry; readonly tag: PartTag; readonly limb?: readonly [number, number, number]; readonly joint?: readonly [number, number]; readonly skirt?: number }
// The knee's height and depth (the legs bend there).
export const KNEE = [0.27, 0.012] as const;

// How a figure is dressed.
export interface Dress {
  readonly female?: boolean;
  readonly skirt?: 'knee' | 'ankle' | 'none'; // the tunic's skirt (none: a short jerkin, trousers below)
  readonly legs?: 'bare' | number;           // bare, or trousers of that colour
  readonly sleeves?: 'short' | 'long';
  readonly belt?: number;
  readonly shoes?: number;
  readonly fine?: boolean; // the units' figure: about three times the faces (finePerson)
}
// How its arms are held: each arm's upper and lower directions (unit
// vectors, from the shoulder and the elbow; x out to its side).
export interface ArmPose { readonly upper: readonly [number, number, number]; readonly fore: readonly [number, number, number] }
export const HANG: ArmPose = { upper: [0.14, -1, 0.02], fore: [0.06, -1, 0.14] };
export const HOLD: ArmPose = { upper: [0.1, -1, 0.3], fore: [0.05, -0.15, 1] };      // forearm forward (a spear upright, reins)
export const RAISE: ArmPose = { upper: [0.2, -0.2, 0.6], fore: [0.1, 0.5, 1] };      // reaching forward and up (a bow held out)
export const SHIELD: ArmPose = { upper: [0.25, -1, 0.25], fore: [0.1, -0.1, 1] };    // the shield forearm across the front
export const GRIP2: ArmPose = { upper: [0.04, -1, 0.35], fore: [-0.5, -0.05, 1] }; // the forearm in across the body: both hands on one grip
export const WORK: ArmPose = { upper: [0.15, -0.8, 0.55], fore: [0.0, -0.6, 1] };    // down and forward (a hoe, a scythe)

const norm = (v: readonly [number, number, number]) => new THREE.Vector3(...v).normalize();
const UPPER = 0.17, FORE = 0.155;
// Both hands on a long gun carried muzzle up before the body: the right
// low on the stock, the left higher up on the barrel, both near the
// middle; their upper arms alike (so that, swung and bent together, the
// gun stays in both hands).
const GUN_UPPER = [0.1, -1, 0.3] as const;
const reachTo = (target: readonly [number, number, number]): ArmPose => {
  const u = norm(GUN_UPPER), el = new THREE.Vector3(-0.128, SHOULDER - 0.01, 0).addScaledVector(new THREE.Vector3(-u.x, u.y, u.z), UPPER);
  const d = new THREE.Vector3(...target).sub(el);
  return { upper: GUN_UPPER, fore: [-d.x, d.y, d.z] };
};
export const GUN_R: ArmPose = reachTo([-0.035, 0.565, 0.175]);
export const GUN_L: ArmPose = reachTo([-0.03, 0.665, 0.215]); // (a pose mirrors to the left arm: its hand at x +0.03)
const v3 = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];
// (The head's and hair's rings: five points, one forward.)
const FIVE = { turn: Math.PI / 2 } as const;

// The head's widest ring and its crown (a flat top), five-sided as it.
const HEAD_BROW = R([0, HEAD_Y + 0.005, 0.002], 0.064, 0.07), HEAD_CROWN = R([0, HEAD_Y + 0.06, -0.006], 0.044, 0.05);
const HEAD_CHIN = R([0, HEAD_Y - 0.068, 0.012], 0.036, 0.042);
// The heads' rings, chin to crown: the plain one's (five-sided, person()) and the finer one's (eight-sided, finePerson()).
export const PLAIN_HEAD: readonly Ring[] = [HEAD_CHIN, HEAD_BROW, HEAD_CROWN];
export const FINE_HEAD: readonly Ring[] = [[0.874, 0.047, 0.05, 0.017], [0.889, 0.056, 0.059, 0.011], [0.912, 0.059, 0.064, 0.006], [0.938, 0.063, 0.069, 0.002], [0.964, 0.054, 0.062, -0.004], [0.99, 0.038, 0.046, -0.008]]
  .map(([y, a, b, z]) => R([0, y!, z!], a!, b!));
// (The jawline: the finer head's two lowest rings tilted, low at the chin, up
// under the ears behind: from the chin up and back to the jaw's angle, its
// underside a plane down to the neck.)
// (And narrowing to the chin in front, the jaw's angles wide behind.)
const JAW_TILT = [0.013, 0.006], JAW_TAPER = [0.3, 0.12];
const jawline = (i: number, v: THREE.Vector3, c: THREE.Vector3) => {
  const t = JAW_TILT[i];
  if (!t) return;
  const front = (v.z - c.z) / FINE_HEAD[i]!.b;
  v.y -= t * front;
  v.x *= 1 - JAW_TAPER[i]! * Math.max(0, front);
};
// A shell over the head (helmets, hats, turbans: unitModels.ts): its
// rings the head's own, scaled out, so that it holds the head at every
// height. `levels`: (height over HEAD_Y, how far out: 1 the head's own
// size there, 0 a point), below the crown sized on the brow, above it on
// the crown.
// (Eight-sided, corner to corner with the finer head's rings and round
// either head: a level's size the larger of the two heads' there; below
// the crown sized on the brow at least (so a rim stands clear of the
// face), above it on the crown.)
// (`sides`: 5, as the plain head's, for the countryside's people, who have only it: fewer faces.)
export function headShell(levels: readonly (readonly [number, number])[], paint: Paint, caps: readonly [boolean, boolean] = [false, false], sides: 5 | 8 = 8): THREE.BufferGeometry {
  const rings = levels.map(([dy, k]) => {
    const y = HEAD_Y + dy, r = dy < 0.035 ? headAt(Math.max(y, HEAD_BROW.c[1])) : HEAD_CROWN;
    return R([0, y, r.c[2]], r.a * k, r.b * k);
  });
  const g = hull(rings, sides, paint, { ...(sides === 8 ? { turn: Math.PI / 8 } : FIVE), caps });
  g.userData['shell'] = true; // (it holds the head: test/fit.test.ts)
  return g;
}
// The head's outline at a height: the larger of the plain head's and the
// finer head's there (half extents; its middle's z).
function headAt(y: number): Ring {
  const at = (rings: readonly Ring[]): Ring => {
    if (y <= rings[0]!.c[1]) return rings[0]!;
    for (let i = 1; i < rings.length; i++) {
      const a = rings[i - 1]!, b = rings[i]!;
      if (y <= b.c[1]) { const t = (y - a.c[1]) / (b.c[1] - a.c[1]); return R([0, y, a.c[2] + (b.c[2] - a.c[2]) * t], a.a + (b.a - a.a) * t, a.b + (b.b - a.b) * t); }
    }
    return rings[rings.length - 1]!;
  };
  const p = at(PLAIN_HEAD), f = at(FINE_HEAD);
  return R([0, y, Math.max(p.c[2], f.c[2])], Math.max(p.a, f.a), Math.max(p.b, f.b));
}

// Where an arm's elbow comes to (side as handAt's).
export function elbowAt(side: 1 | -1, pose: ArmPose, female = false): THREE.Vector3 {
  const u = norm(pose.upper);
  u.x *= side;
  return new THREE.Vector3(side * (female ? 0.115 : 0.128), SHOULDER - 0.01, 0).addScaledVector(u, UPPER);
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
  if (d.fine) return finePerson(d, armL, armR, swing);
  const f = d.female === true, skirt = d.skirt ?? 'knee', bare = d.legs === undefined || d.legs === 'bare';
  const legPaint: Paint = bare ? SKIN_PAINT : (d.legs as number), legTag: PartTag = bare ? 'skin' : 'plain';
  const out: Part[] = [];
  const add = (geo: THREE.BufferGeometry, tag: PartTag, limb?: readonly [number, number, number], joint?: readonly [number, number], skirt?: number) => out.push({ geo, tag, ...(limb ? { limb } : {}), ...(joint ? { joint } : {}), ...(skirt !== undefined ? { skirt } : {}) });
  // Legs: thigh and shin, boxes meeting at the knee (the shin bends
  // there); the shoe a wedge.
  for (const side of [1, -1] as const) {
    // (Under a skirt the thighs are slimmer, inside it as it swings: only the shins show.)
    const x = side * (f ? 0.056 : 0.062), lm = swing?.legs(side), r = skirt === 'none' ? (f ? 0.056 : 0.054) : 0.04;
    // (Under a skirt to the ankle only the shoes show.)
    if (skirt !== 'ankle') {
      add(limb([[x, HIP + 0.03, 0], [x * 0.97, KNEE[0], KNEE[1]]], [r, 0.038], legPaint, 4, { caps: [false, false] }), legTag, lm);
      add(limb([[x * 0.97, KNEE[0], KNEE[1]], [x * 0.95, 0.03, -0.004]], [0.038, 0.027], legPaint, 4, { caps: [false, false] }), legTag, lm, KNEE);
    }
    add(shoe(x * 0.95, 0, d.shoes ?? SHOE), 'plain', lm, KNEE);
  }
  // The torso (the tunic's body: pointed at the sides, flat before and
  // behind), its skirt and belt.
  const T = f ? [[0.098, 0.066], [0.074, 0.054], [0.104, 0.072], [0.046, 0.038]] : [[0.085, 0.062], [0.08, 0.058], [0.118, 0.068], [0.05, 0.04]];
  // (Under a skirt, from the waist: the hips hidden.)
  const from = skirt === 'none' ? 0 : 1;
  add(hull([0.46, 0.6, 0.76, 0.855].slice(from).map((y, i) => R([0, y, 0], T[i + from]![0]!, T[i + from]![1]!)), 6, CLOTH_PAINT, { caps: [false, true] }), 'team');
  const [wa, wb] = T[1]!;
  if (skirt !== 'none') {
    // (An A-line, out past the tops of the thighs at the hips; its sides swing with the legs.)
    const hem = skirt === 'ankle' ? 0.07 : f ? 0.27 : 0.3, flare = skirt === 'ankle' ? 1.5 : 1.5;
    const rings = [R([0, 0.63, 0], wa! + 0.02, wb! + 0.016), ...(skirt === 'ankle' ? [R([0, 0.36, 0.004], (wa! + 0.03) * 1.2, (wb! + 0.03) * 1.2)] : []), R([0, hem, 0.006], (wa! + 0.03) * flare, (wb! + 0.034) * flare)];
    add(hull(rings, 6, (p) => (p.y < hem + 0.01 ? TRIM : CLOTH_PAINT), { caps: [false, false] }), 'team', swing?.legs(1), undefined, hem);
  }
  if (d.belt !== undefined) add(hull([R([0, 0.64, 0], wa! + 0.018, wb! + 0.018), R([0, 0.61, 0], wa! + 0.018, wb! + 0.018)], 6, d.belt, { caps: [false, false] }), 'plain');
  // The head: chin, cheekbones, crown; its front edge the nose.
  add(hull([HEAD_CHIN, HEAD_BROW, HEAD_CROWN], 5, SKIN_PAINT, FIVE), 'skin');
  // Arms: sleeve (cloth) to the elbow, the forearm sleeved or bare, the hand.
  for (const side of [1, -1] as const) {
    const pose = side === 1 ? armL : armR, lm = swing?.arms(side);
    const sh = new THREE.Vector3(side * (f ? 0.115 : 0.128), SHOULDER - 0.01, 0);
    const u = norm(pose.upper), fo = norm(pose.fore);
    u.x *= side; fo.x *= side;
    const el = sh.clone().addScaledVector(u, UPPER), wr = el.clone().addScaledVector(fo, FORE);
    const long = d.sleeves === 'long', X: V3 = [1, 0, 0];
    add(limb([v3(sh.clone().addScaledVector(u, -0.02)), v3(el.clone().addScaledVector(u, 0.012))], [0.036, 0.028], CLOTH_PAINT, 4, { caps: [false, false], side: X }), 'team', lm);
    const elbow = [el.y, el.z] as const;
    add(limb([v3(el), v3(wr)], [0.027, 0.02], long ? CLOTH_PAINT : SKIN_PAINT, 4, { caps: [false, false], side: X }), long ? 'team' : 'skin', lm, elbow);
    add(hull([R(v3(wr), 0.021, 0.015), R(v3(wr.clone().addScaledVector(fo, 0.065)), 0, 0)], 4, SKIN_PAINT, { side: X, caps: [false, false] }), 'skin', lm, elbow);
  }
  return out;
}

// ---- the units' figure, in finer detail ----
// The same body (the same joints: hips, knees, shoulders, elbows, hands
// where person() has them, so what it holds and how it moves are the
// same), in about three times the faces: a torso shaped at the chest,
// waist and hips; a neck; a head with jaw, cheekbones, brow and crown, a
// nose and eyes; each arm and leg one surface from shoulder to wrist and
// hip to ankle, swelling at the biceps and calf and bending smoothly at the
// elbow and knee (its corners there turned part of the way: `aBlend`,
// unitModels.ts tag); hands with a thumb; shoes with heel and toe.
type Swing = { legs: (side: number) => readonly [number, number, number]; arms: (side: number) => readonly [number, number, number] | undefined } | null;
const EIGHT = { turn: Math.PI / 8 } as const, FLAT8 = 1 / Math.cos(Math.PI / 8), SIX = 1 / Math.cos(Math.PI / 6); // (8 or 6 points a ring, flat in front)
const EYE = 0x1e1814;
// A limb's corners, how far each is past its joint: 0 above it, 1 below,
// between them across the joint (`a`: the upper piece's way, `b`: the lower's).
function blendAt(g: THREE.BufferGeometry, joint: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, span = 0.022): THREE.BufferGeometry {
  const pos = g.getAttribute('position'), w = new Float32Array(pos.count * 2), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(joint);
    w[i * 2] = 1;
    w[i * 2 + 1] = Math.max(0, Math.min(1, 0.5 + (p.dot(b) - p.dot(a)) / (2 * span)));
  }
  g.setAttribute('aBlend', new THREE.BufferAttribute(w, 2));
  return g;
}
// A geometry's triangles parted by what each is (by its middle).
function split<K extends string>(g: THREE.BufferGeometry, kind: (mid: THREE.Vector3) => K): Map<K, THREE.BufferGeometry> {
  const out = new Map<K, number[]>(), pos = g.getAttribute('position'), mid = new THREE.Vector3(), v = new THREE.Vector3();
  for (let t = 0; t + 2 < pos.count; t += 3) {
    mid.set(0, 0, 0);
    for (let k = 0; k < 3; k++) mid.add(v.fromBufferAttribute(pos, t + k));
    const key = kind(mid.divideScalar(3));
    let l = out.get(key);
    if (!l) out.set(key, l = []);
    l.push(t, t + 1, t + 2);
  }
  const res = new Map<K, THREE.BufferGeometry>();
  for (const [key, idx] of out) {
    const piece = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const a = attr as THREE.BufferAttribute, arr = new Float32Array(idx.length * a.itemSize);
      idx.forEach((i, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.getComponent(i, c); });
      piece.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    }
    res.set(key, piece);
  }
  return res;
}
// (Paints a geometry one colour.)
const painted = (g: THREE.BufferGeometry, c: number) => {
  const col = g.getAttribute('color') as THREE.BufferAttribute, k = new THREE.Color(c);
  for (let i = 0; i < col.count; i++) col.setXYZ(i, k.r, k.g, k.b);
  return g;
};

function finePerson(d: Dress, armL: ArmPose, armR: ArmPose, swing: Swing): Part[] {
  const f = d.female === true, skirt = d.skirt ?? 'knee', bare = d.legs === undefined || d.legs === 'bare';
  const legPaint = bare ? SKIN_PAINT : (d.legs as number), legTag: PartTag = bare ? 'skin' : 'plain';
  const out: Part[] = [];
  const add = (geo: THREE.BufferGeometry, tag: PartTag, limb?: readonly [number, number, number], joint?: readonly [number, number], skirtTo?: number) =>
    out.push({ geo, tag, ...(limb ? { limb } : {}), ...(joint ? { joint } : {}), ...(skirtTo !== undefined ? { skirt: skirtTo } : {}) });
  // Legs: hip to ankle in one, the thigh full, the knee, the calf, the
  // ankle slim; bending at the knee. (Under a skirt, the thighs slimmer.)
  for (const side of [1, -1] as const) {
    const x = side * (f ? 0.056 : 0.062), lm = swing?.legs(side);
    const hip = new THREE.Vector3(x, HIP + 0.03, 0), knee = new THREE.Vector3(x * 0.97, KNEE[0], KNEE[1]), ankle = new THREE.Vector3(x * 0.95, 0.05, -0.004);
    const top = skirt === 'none' ? (f ? 0.058 : 0.057) : 0.042;
    if (skirt !== 'ankle') {
      const along = (a: THREE.Vector3, b: THREE.Vector3, t: number, dz = 0): V3 => { const p = a.clone().lerp(b, t); return [p.x, p.y, p.z + dz]; };
      const leg = hull([R(along(hip, knee, 0), top, top), R(along(hip, knee, 0.85), 0.04, 0.041), R(v3(knee), 0.037, 0.039),
        R(along(knee, ankle, 0.3, -0.01), 0.042, 0.045), R(along(knee, ankle, 0.65, -0.004), 0.031, 0.033), R(along(knee, ankle, 1), 0.025, 0.026)].map((r) => ({ ...r, a: r.a * SIX, b: r.b * SIX })),
      6, legPaint, { turn: Math.PI / 6, caps: [false, false], side: [1, 0, 0] });
      add(blendAt(leg, knee, hip.clone().sub(knee).normalize(), ankle.clone().sub(knee).normalize()), legTag, lm, KNEE);
    }
    add(fineShoe(x * 0.95, 0, d.shoes ?? SHOE), 'plain', lm, KNEE);
  }
  // The torso: hips, waist, chest, shoulders, the base of the neck.
  const T = f ? [[0.104, 0.07, 0], [0.076, 0.056, 0], [0.103, 0.074, 0.007], [0.108, 0.058, 0], [0.05, 0.042, 0]]
    : [[0.094, 0.064, 0], [0.084, 0.06, 0], [0.114, 0.072, 0.007], [0.126, 0.062, 0], [0.055, 0.045, 0]];
  const TY = [0.46, 0.58, 0.72, 0.815, 0.857];
  // (Under a skirt too, from the hips: so no gap opens between them as the skirt swings.)
  const from = 0;
  add(hull(TY.slice(from).map((y, i) => R([0, y, T[i + from]![2]!], T[i + from]![0]! * FLAT8, T[i + from]![1]! * FLAT8)), 8, CLOTH_PAINT, { ...EIGHT, caps: [false, true] }), 'team');
  const [wa, wb] = T[1]!;
  if (skirt !== 'none') {
    // (An A-line, out past the tops of the thighs at the hips; its sides swing with the legs.)
    const hem = skirt === 'ankle' ? 0.07 : f ? 0.27 : 0.3;
    const rings = [R([0, 0.63, 0], (wa! + 0.02) * FLAT8, (wb! + 0.016) * FLAT8), R([0, (0.63 + hem) / 2, 0.003], (wa! + 0.03) * 1.25 * FLAT8, (wb! + 0.032) * 1.25 * FLAT8),
      R([0, hem, 0.006], (wa! + 0.031) * 1.52 * FLAT8, (wb! + 0.035) * 1.52 * FLAT8)];
    add(hull(rings, 8, (p) => (p.y < hem + 0.01 ? TRIM : CLOTH_PAINT), { ...EIGHT, caps: [false, false] }), 'team', swing?.legs(1), undefined, hem);
  }
  if (d.belt !== undefined) add(hull([R([0, 0.645, 0], (wa! + 0.019) * FLAT8, (wb! + 0.019) * FLAT8), R([0, 0.612, 0], (wa! + 0.019) * FLAT8, (wb! + 0.019) * FLAT8)], 8, d.belt, { ...EIGHT, caps: [false, false] }), 'plain');
  // The neck and head: under the jaw, the chin, the cheekbones, the brow,
  // the forehead, the crown; a nose; the eyes.
  add(hull([R([0, 0.85, -0.004], 0.034, 0.036), R([0, 0.9, 0.002], 0.032, 0.034)], 6, SKIN_PAINT, { caps: [false, false] }), 'skin');
  // (Its corners where helmets' and hair's are, inside them: headShell.)
  add(hull(FINE_HEAD, 8, SKIN_PAINT, { ...EIGHT, caps: [true, true], push: jawline }), 'skin');
  add(spike([[0, 0.928, 0.064], [0, 0.912, 0.074], [0, 0.904, 0.082]], 0.013, SKIN_PAINT, 3), 'skin');
  for (const s of [1, -1]) add(plate([[-0.009, 0], [0.009, 0], [0.007, 0.006], [-0.007, 0.006]], EYE).translate(s * 0.024, 0.927, 0.07), 'plain');
  // Arms: one surface, shoulder to wrist (the deltoid, the biceps, the
  // elbow, the forearm), the sleeve to the elbow or the wrist; a hand,
  // its thumb.
  for (const side of [1, -1] as const) {
    const pose = side === 1 ? armL : armR, lm = swing?.arms(side);
    const sh = new THREE.Vector3(side * (f ? 0.115 : 0.128), SHOULDER - 0.01, 0);
    const u = norm(pose.upper), fo = norm(pose.fore);
    u.x *= side; fo.x *= side;
    const el = sh.clone().addScaledVector(u, UPPER), wr = el.clone().addScaledVector(fo, FORE);
    const at = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];
    const arm = hull([R(at(sh.clone().addScaledVector(u, -0.025)), 0.04, 0.042), R(at(sh.clone().addScaledVector(u, 0.07)), 0.039, 0.041),
      R(at(el), 0.028, 0.029), R(at(el.clone().addScaledVector(fo, 0.055)), 0.029, 0.031), R(at(wr), 0.02, 0.022)], 6, CLOTH_PAINT, { caps: [false, false], side: [1, 0, 0] });
    blendAt(arm, el, u.clone().negate(), fo, 0.018);
    // (The sleeve: the upper arm in cloth; the forearm in cloth too if long, else bare.)
    const long = d.sleeves === 'long', cut = split(arm, (m) => (long || m.clone().sub(el).dot(fo) < 0.004 ? 'sleeve' : 'bare'));
    const elbow = [el.y, el.z] as const;
    for (const [k, g] of cut) add(k === 'sleeve' ? g : painted(g, SKIN_PAINT), k === 'sleeve' ? 'team' : 'skin', lm, elbow);
    // (The hand: the palm, flat, the fingers together; the thumb up along the grip.)
    const across = new THREE.Vector3(1, 0, 0).addScaledVector(fo, -fo.x).normalize(), thumb = wr.clone().addScaledVector(fo, 0.02);
    add(hull([R(at(wr), 0.021, 0.014), R(at(wr.clone().addScaledVector(fo, 0.045)), 0.023, 0.012), R(at(wr.clone().addScaledVector(fo, 0.078)), 0.012, 0.008)], 4, SKIN_PAINT, { side: [1, 0, 0], caps: [false, true] }), 'skin', lm, elbow);
    add(spike([at(thumb), at(thumb.clone().addScaledVector(across, -side * 0.012).add(new THREE.Vector3(0, 0.012, 0.022)))], 0.009, SKIN_PAINT, 3), 'skin', lm, elbow);
  }
  return out;
}
// A shoe: the heel, the instep, the ball of the foot, the toe.
function fineShoe(x: number, z0: number, color: number): THREE.BufferGeometry {
  return hull([R([x, 0.03, z0 - 0.045], 0.027, 0.026), R([x, 0.042, z0 + 0.005], 0.031, 0.031), R([x, 0.024, z0 + 0.065], 0.026, 0.029), R([x, 0.012, z0 + 0.1], 0.008, 0.016)], 4, color, { side: [1, 0, 0], turn: Math.PI / 4 });
}

// A shoe: a wedge, flat below, its heel at z = z0 - 0.04, toe forward.
function shoe(x: number, z0: number, color: number): THREE.BufferGeometry {
  return hull([R([x, 0.013, z0 - 0.04], 0.026, 0.028), R([x, 0.008, z0 + 0.08], 0.016, 0.024)], 3, color, { side: [1, 0, 0], turn: Math.PI / 3 });
}

// A seated rider's body, its hips at `seat` high astride a horse: thighs
// forward and apart, shins down along the flanks; the torso, head and arms
// as a standing figure's, raised (unitModels.ts).
// (`strikeR`, `strikeL`: how each arm moves (unitModels.ts), with what it holds.)
export function riderBody(d: Dress, seat: number, armL: ArmPose, armR: ArmPose, strikeR?: readonly [number, number, number], strikeL?: readonly [number, number, number]): Part[] {
  const lift = seat - HIP;
  const top = person({ ...d, skirt: 'none' }, armL, armR, { legs: () => [0, HIP, 0] as const, arms: (side) => (side === -1 ? strikeR : strikeL) }).filter((p) => !isLeg(p));
  const out: Part[] = top.map((p) => ({ ...p, geo: p.geo.translate(0, lift, 0), ...(p.joint ? { joint: [p.joint[0] + lift, p.joint[1]] as const } : {}) }));
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
  // (Lowered at the nape, it stands a little further out: the head is broader there than at its rim.)
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) >= HEAD_Y + 0.01) continue;
    const dy = Math.max(-0.05, Math.min(0.035, pos.getZ(i) * 0.55)), out = dy < 0 ? 1 - dy * 1.8 : 1;
    pos.setXYZ(i, pos.getX(i) * out, pos.getY(i) + dy, pos.getZ(i) * out);
  }
  g.computeVertexNormals();
  return g;
}
export function hairShapes(style: HairStyleKey, sides: 5 | 8 = 8): THREE.BufferGeometry[] {
  const W = 0xffffff;
  // A cap over the crown, down to the brow in front and the nape behind: a
  // shell over the head's own rings (so the head never shows through it),
  // its edge raised in front and lowered behind.
  const cap = () => hairline(headShell([[0.0, 1.1], [0.066, 1.2], [0.088, 0]], W, [false, false], sides));
  // (From the mouth's line down round the jaw, to its point under the chin.)
  const beard = () => hull([R([0, HEAD_Y - 0.042, 0.016], 0.058, 0.058), R([0, HEAD_Y - 0.092, 0.042], 0, 0)], 5, W, { ...FIVE, caps: [false, false] });
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
