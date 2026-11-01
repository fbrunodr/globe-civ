import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, seg, tf, V, type Tf } from './propCatalog.ts';
import { person, riderBody, handAt, elbowAt, hairShapes, headShell, HAIR_STYLE_KEYS, HIP, SHOULDER, HEAD_Y, HANG, HOLD, RAISE, SHIELD, GRIP2, type ArmPose, type Dress, type Part, type HairStyleKey } from './people.ts';
import { horseParts } from './creatures.ts';
import { hull, plate, R } from './lowpoly.ts';
import type { ArchCiv } from './architecture.ts';
import type { UnitKey } from './rules.ts';

// Unit figurines: painted miniatures, as the props and houses are, one model
// per unit type and civ. A model is one figure (a soldier, a rider on his
// horse, a settler) about 1 tall, standing on y = 0 and facing +z; the unit
// view (unitView.ts) shows it a dozen times over in formation.
//
// Besides its colours (a `color` attribute, as the props), each vertex says
// (packed: the GPU takes only so many attributes):
//   aLimb  how it moves: (side, pivot height, amplitude), turning about the
//          pivot. A side of +1 or -1 swings that way round on the march
//          (left and right legs, a horse's diagonal pairs, arms against the
//          legs); STRIKE thrusts forward in a fight (the weapon arm and its
//          weapon, the bow raised); 0 never moves. Its w: flags (RIG), 1 on
//          what is painted in the owner's colour (tunic, shield face, plume,
//          horse cloth: the instance colour, shaded by `color`), 2 on skin
//          (each figure's own skin tone), 4 on a limb's lower piece (shin,
//          forearm: bent at its middle joint), 8 on a weapon in hand
//          (turned at the grip to point as the figure aims);
//   aRig   the middle joint's y, z; the grip's y, z;
//   aRest  how far forward of upright the weapon points as made (radians).
// Hair is drawn apart (hairModel): each figure gets its own style and colour.
//
// Each civ dresses its soldiers its own way (GEAR): the shape of their
// shields and helmets, their legs bare or trousered.

export type Shield = 'round' | 'big round' | 'scutum' | 'kite' | 'oval' | 'pavise' | 'small';
export type Helmet = 'crest' | 'cone' | 'kettle' | 'hat' | 'feather' | 'turban' | 'cap' | 'beret' | 'none';
export interface Gear {
  shield: Shield;
  helmet: Helmet;
  legs: 'bare' | number; // bare (skin) or trousers of that colour
  skin: readonly number[]; // the tones the figures are drawn from
  hair: readonly number[]; // the hair colours, likewise (repeated: drawn more often)
}

const DARK = [0x1e1814, 0x2a1e16, 0x3a2a1e, 0x2a1e16] as const;
const BROWN = [0x2a1e16, 0x4a3422, 0x5e4430, 0x3a2a1e] as const;
const FAIR = [0xd8b868, 0xc9a050, 0xb8904a, 0x9a5a2e, 0x6e4c30, 0x4a3422, 0x5e4430] as const;
const NORSE = [0xe0c478, 0xd8b868, 0xc9a050, 0xb8904a, 0xa0502a, 0x8a6a48, 0x6e4c30] as const;
const TONES = {
  north: [0xf1d0b5, 0xe8bf9f, 0xdcb08c],
  south: [0xd8a982, 0xc99670, 0xb98460],
  west: [0xc48c64, 0xb07a52, 0x9c6a46],
  africa: [0x8a5a3a, 0x7a4c30, 0x6a4028],
  east: [0xe9c9a2, 0xdcb890, 0xd0a87e],
  america: [0xb9825a, 0xa87250, 0x966446],
} as const;

export const GEAR: Record<ArchCiv, Gear> = {
  Romans:      { shield: 'scutum',    helmet: 'crest',   legs: 'bare',   skin: TONES.south, hair: BROWN },
  Greeks:      { shield: 'big round', helmet: 'crest',   legs: 'bare',   skin: TONES.south, hair: BROWN },
  Egyptians:   { shield: 'oval',      helmet: 'cap',     legs: 'bare',   skin: TONES.west, hair: DARK },
  Babylonians: { shield: 'round',     helmet: 'cone',    legs: 'bare',   skin: TONES.west, hair: DARK },
  Persians:    { shield: 'pavise',    helmet: 'turban',  legs: 0x5a4a3a, skin: TONES.west, hair: DARK },
  Hebrews:     { shield: 'round',     helmet: 'cap',     legs: 'bare',   skin: TONES.west, hair: BROWN },
  Ethiopians:  { shield: 'round',     helmet: 'none',    legs: 'bare',   skin: TONES.africa, hair: DARK },
  Indians:     { shield: 'round',     helmet: 'turban',  legs: 0xe8e0cc, skin: TONES.west, hair: DARK },
  Chinese:     { shield: 'pavise',    helmet: 'hat',     legs: 0x3a3a40, skin: TONES.east, hair: DARK },
  Japanese:    { shield: 'small',     helmet: 'hat',     legs: 0x2e3440, skin: TONES.east, hair: DARK },
  Mongols:     { shield: 'small',     helmet: 'cone',    legs: 0x5a4632, skin: TONES.east, hair: DARK },
  Aztecs:      { shield: 'round',     helmet: 'feather', legs: 'bare',   skin: TONES.america, hair: DARK },
  English:     { shield: 'kite',      helmet: 'cone',    legs: 0x6a5a48, skin: TONES.north, hair: FAIR },
  French:      { shield: 'kite',      helmet: 'kettle',  legs: 0x4a4a52, skin: TONES.north, hair: FAIR },
  Germans:     { shield: 'oval',      helmet: 'cap',     legs: 0x5a4a38, skin: TONES.north, hair: FAIR },
  Spanish:     { shield: 'round',     helmet: 'kettle',  legs: 0x4a3a30, skin: TONES.south, hair: BROWN },
  Russians:    { shield: 'kite',      helmet: 'cone',    legs: 0x4a4038, skin: TONES.north, hair: FAIR },
  Vikings:     { shield: 'big round', helmet: 'cone',    legs: 0x6a5a48, skin: TONES.north, hair: NORSE },
};

// The shades the team colour is drawn in (multiplied by the owner's colour):
// cloth a touch darker than the paint on shields and plumes.
const CLOTH = 0xa4a4a4, PAINT = 0xffffff;
const METAL = 0x9a9ca2, WOOD = 0x7a5a3a, LEATHER = 0x6a4a30;
const HORSE = [0x6a4a32, 0x8a6a4a, 0x4a3a2e, 0xb8a888] as const;

// (`joint`: a limb's lower piece, bent at its middle joint at y, z;
// `grip`: a weapon held at y, z, pointing so far forward of upright as it
// is made (radians), turned there to point as the figure aims.)
type Tag = { team?: boolean; skin?: boolean; limb?: readonly [number, number, number]; joint?: readonly [number, number]; grip?: readonly [number, number, number] };
export const RIG = { team: 1, skin: 2, joint: 4, grip: 8 } as const;
function tag(g: THREE.BufferGeometry, t: Tag = {}): THREE.BufferGeometry {
  if (g.getAttribute('leafMask')) g.deleteAttribute('leafMask');
  const n = g.getAttribute('position').count;
  const flags = (t.team ? RIG.team : 0) + (t.skin ? RIG.skin : 0) + (t.joint ? RIG.joint : 0) + (t.grip ? RIG.grip : 0);
  const limb = new Float32Array(n * 4), rig = new Float32Array(n * 4), rest = new Float32Array(n).fill(t.grip?.[2] ?? 0);
  const [s, pivot, amp] = t.limb ?? [0, 0, 0], [jy, jz] = t.joint ?? [0, 0], [gy, gz] = t.grip ?? [0, 0];
  for (let i = 0; i < n; i++) { limb.set([s, pivot, amp, flags], i * 4); rig.set([jy, jz, gy, gz], i * 4); }
  g.setAttribute('aLimb', new THREE.BufferAttribute(limb, 4));
  g.setAttribute('aRig', new THREE.BufferAttribute(rig, 4));
  g.setAttribute('aRest', new THREE.BufferAttribute(rest, 1));
  return g;
}
const shape = (geo: THREE.BufferGeometry, color: number, o: Tf, t?: Tag) => tag(part(geo, color, tf(o)), t);
const ball = (r: number, color: number, o: Tf, t?: Tag) => shape(new THREE.OctahedronGeometry(r, 0), color, o, t);
const box = (w: number, h: number, d: number, color: number, o: Tf, t?: Tag) => shape(new THREE.BoxGeometry(w, h, d), color, o, t);
// (Low-poly: a rod is three-sided whatever `n` asks; a thick one four.)
const rod = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, n: number, color: number, t?: Tag) => tag(seg(a, b, r0, r1, Math.min(n, r0 > 0.015 ? 4 : 3), color), t);
// A low-poly piece (lowpoly.ts) tagged.
const lp = (g: THREE.BufferGeometry, o: Tf = {}, t?: Tag) => { g.deleteAttribute('leafMask'); return tag(g.applyMatrix4(tf(o)), t); };
const point = (h: number, r: number, n: number, color: number, o: Tf, t?: Tag) => lp(hull([R([0, 0, 0], r), R([0, h, 0], 0, 0)], n, color, { side: [0, 0, 1] }), o, t);

// The march: legs swing from the hip, arms against them from the shoulder.
const LEG = (side: number) => [side, HIP, 0.45] as const;
const ARM = (side: number) => [-side, SHOULDER, 0.35] as const;
// In a fight: the weapon arm thrusts (and its weapon with it) about the shoulder.
export const STRIKE = 2;
const HIT = (pivot: number, amp: number) => [STRIKE, pivot, amp] as const;
// In a fight: the shield arm raises its shield to ward off a blow (or arrows) about the shoulder.
export const GUARD = 3;
const GUARD_ARM = [GUARD, SHOULDER, 1.25] as const;
// An archer's string hand drawing back to the cheek (raised from the shoulder, bent at the elbow).
export const DRAW = 4;
const DRAW_ARM = [DRAW, SHOULDER, 1.45] as const;
// Whether a unit's weapon is whirled before it is loosed (a sling).
export const whirls = (type: UnitKey): boolean => type === 'slinger';

type Hold = 'spear' | 'pike' | 'club' | 'sword' | 'longsword' | 'bow' | 'recurve' | 'sling' | 'crossbow' | 'musket' | 'rifle' | 'mg' | 'staff' | 'banner' | 'none';

// How far forward of upright each weapon is made to point (radians): a
// spear upright, a sword a little forward, a crossbow or a machine gun level.
const REST_PITCH: Record<Hold, number> = {
  spear: 0, pike: 0, club: 0.23, sword: 0.25, longsword: 0.31, bow: 0, recurve: 0, sling: Math.PI, crossbow: 1.4, musket: 0.4, rifle: 0.4, mg: 1.35, staff: 0, banner: 0, none: 0,
};
// A body (people.ts) tagged for the units' shader.
const tagged = (parts: readonly Part[]): THREE.BufferGeometry[] => parts.map((p) => tag(p.geo, { team: p.tag === 'team', skin: p.tag === 'skin', ...(p.limb ? { limb: p.limb } : {}), ...(p.joint ? { joint: p.joint } : {}) }));
const v3 = (p: THREE.Vector3) => V(p.x, p.y, p.z);

// A figure on foot (people.ts), dressed for its civ and armed. `hold`:
// what the right hand carries (it then stops swinging); `shield`: on the
// left arm, or none; `pack`: a bundle on the back. `female`: a woman's
// build (a civilian's skirt to the ankles). `modern`: a modern soldier
// (trousers, a steel helmet whatever the civ wore).
// (The figure faces +z: its right hand is at -x.)
// `still`: standing (in a chariot), its legs never swinging; `helmetAs`,
// `shieldAs`: the unit's own headgear or shield whatever its civ's.
// A point `k` along a gun (or crossbow) held in both hands (model units:
// back of the grip negative): one straight line through the right hand's
// grip, a little towards the left hand, pointing as it is carried
// (REST_PITCH). Straight in the plane the grip turns in (y, z), so it
// points true however it is aimed.
const gunAt = (hold: Hold, hR: { x: number; y: number; z: number }, hL: { x: number }) => {
  const d = V(0, Math.cos(REST_PITCH[hold]), Math.sin(REST_PITCH[hold])), g = V(hR.x * 0.65 + hL.x * 0.35, hR.y, hR.z);
  return (k: number) => g.clone().addScaledVector(d, k);
};
function figure(gear0: Gear, hold: Hold, shield: boolean, opts: { helmet?: boolean; pack?: boolean; quiver?: boolean; female?: boolean; civilian?: boolean; modern?: boolean; still?: boolean; helmetAs?: Helmet; shieldAs?: Shield } = {}): THREE.BufferGeometry[] {
  const gear1: Gear = opts.modern ? { ...gear0, legs: 0x4a4e44, helmet: 'kettle' } : gear0;
  const gear: Gear = { ...gear1, helmet: opts.helmetAs ?? gear1.helmet, shield: opts.shieldAs ?? gear1.shield };
  const f = opts.female === true;
  const dress: Dress = {
    female: f, skirt: opts.modern ? 'none' : opts.civilian && f ? 'ankle' : 'knee', legs: gear.legs,
    sleeves: gear.legs === 'bare' && !opts.modern ? 'short' : 'long',
  };
  // The arms: the right one carries the weapon, the left the shield (or the bow).
  const bow = hold === 'bow' || hold === 'recurve', twoHands = hold === 'crossbow' || hold === 'musket' || hold === 'rifle' || hold === 'mg' || hold === 'longsword';
  // (A sling hangs from the lowered hand until it is whirled; a two-handed sword's grip in both hands.)
  const armR: ArmPose = hold === 'none' || bow || hold === 'sling' ? HANG : hold === 'longsword' ? GRIP2 : HOLD;
  const armL: ArmPose = shield ? SHIELD : bow ? RAISE : hold === 'longsword' ? GRIP2 : twoHands ? HOLD : HANG;
  const strike = hold === 'sling' ? HIT(SHOULDER, 1.4) : hold === 'spear' || hold === 'pike' ? HIT(SHOULDER, 1.5) : hold === 'club' || hold === 'sword' || hold === 'longsword' ? HIT(SHOULDER, 1.5)
    : hold === 'mg' ? HIT(SHOULDER, 0.4) : twoHands ? HIT(SHOULDER, 0.9) : null;
  const bowUp = HIT(SHOULDER, 0.4); // (an archer raises his bow to loose: from where he holds it forward)
  const freeL = !shield && !bow && !twoHands;
  const out = tagged(person(dress, armL, armR, {
    legs: (side) => (opts.still ? [0, HIP, 0] as const : LEG(side)),
    arms: (side) => (side === -1 ? (hold === 'none' ? ARM(-1) : bow ? DRAW_ARM : strike ?? undefined) : shield ? GUARD_ARM : freeL ? ARM(1) : bow ? bowUp : hold === 'longsword' || hold === 'mg' ? strike ?? undefined : undefined),
  }));
  const hR = handAt(-1, armR, f), hL = handAt(1, armL, f), eR = elbowAt(-1, armR, f), eL = elbowAt(1, armL, f);
  // (What the right hand holds goes with its forearm: bent at the elbow.)
  const w: Tag = strike ? { limb: strike, joint: [eR.y, eR.z], grip: [hR.y, hR.z, REST_PITCH[hold]] } : {};
  // (A bow points where its arrow would fly: square to its limbs, level as it is made.)
  const bowTag: Tag = { limb: bowUp, joint: [eL.y, eL.z], grip: [hL.y, hL.z, Math.PI / 2] };
  const up = (d: number) => v3(hR).add(V(0, d, 0));
  if (hold === 'spear') out.push(rod(up(-0.42), up(0.86), 0.012, 0.011, 5, WOOD, w), point(0.11, 0.026, 3, METAL, { x: hR.x, y: hR.y + 0.86, z: hR.z }, w));
  if (hold === 'pike') out.push(rod(up(-0.4), up(1.25), 0.012, 0.011, 5, WOOD, w), point(0.13, 0.024, 3, METAL, { x: hR.x, y: hR.y + 1.25, z: hR.z }, w));
  if (hold === 'club') out.push(rod(v3(hR).add(V(0, -0.04, -0.02)), v3(hR).add(V(-0.02, 0.3, 0.08)), 0.012, 0.028, 6, WOOD, w));
  if (hold === 'sword') out.push(rod(v3(hR).add(V(-0.04, 0.04, 0.01)), v3(hR).add(V(0.04, 0.04, 0.01)), 0.008, 0.008, 4, METAL, w), rod(v3(hR).add(V(0, 0.04, 0.01)), v3(hR).add(V(0, 0.4, 0.1)), 0.016, 0.005, 4, METAL, w));
  // (A two-handed sword, its grip between both hands, the long blade up and forward.)
  if (hold === 'longsword') {
    const g = v3(hR).add(v3(hL)).multiplyScalar(0.5);
    out.push(rod(g.clone().add(V(-0.06, 0.05, 0.01)), g.clone().add(V(0.06, 0.05, 0.01)), 0.01, 0.01, 4, METAL, w), rod(g.clone().add(V(0, -0.04, 0)), g.clone().add(V(0, 0.05, 0.01)), 0.013, 0.013, 4, LEATHER, w),
      rod(g.clone().add(V(0, 0.05, 0.01)), g.clone().add(V(0, 0.62, 0.2)), 0.018, 0.004, 4, METAL, w));
  }
  // (A machine gun at the hip: its body, barrel and drum.)
  // (Like every gun, straight in the plane its grip turns in: gunAt.)
  if (hold === 'mg') {
    const at = gunAt(hold, hR, hL), mid = at(0.05);
    out.push(rod(at(-0.1), at(0.18), 0.032, 0.03, 4, GUNMETAL, w), rod(at(0.18), at(0.48), 0.012, 0.012, 3, GUNMETAL, w),
      box(0.05, 0.08, 0.08, GUNMETAL, { x: mid.x, y: mid.y - 0.06, z: mid.z }, w));
  }
  // (A sling hanging from the hand: its cords and the stone's pouch.)
  if (hold === 'sling') out.push(rod(v3(hR), v3(hR).add(V(0.01, -0.21, 0.02)), 0.004, 0.004, 3, 0xb8a888, w), ball(0.025, 0x8a7a62, { x: hR.x + 0.01, y: hR.y - 0.23, z: hR.z + 0.02 }, w));
  if (hold === 'staff') out.push(rod(up(-0.42), up(0.6), 0.013, 0.011, 5, WOOD));
  // (A long gun, one straight piece, carried muzzle up and a little
  // forward (REST_PITCH) in front of the body, between the hands: the
  // stock gripped by the right hand, the barrel on up; a rifle's with a
  // bayonet. Straight in the plane it turns in, so it points true however
  // it is aimed.)
  if (hold === 'musket' || hold === 'rifle') {
    const at = gunAt(hold, hR, hL);
    out.push(rod(at(-0.2), at(0.1), 0.022, 0.017, 5, WOOD, w), rod(at(0.1), at(0.52), 0.011, 0.011, 5, METAL, w));
    if (hold === 'rifle') out.push(rod(at(0.52), at(0.66), 0.006, 0.0015, 4, METAL, w));
  }
  if (hold === 'crossbow') {
    const at = gunAt(hold, hR, hL), tip = at(0.24);
    out.push(rod(at(-0.08), tip, 0.02, 0.016, 5, WOOD, w), rod(tip.clone().add(V(-0.17, 0, 0)), tip.clone().add(V(0.17, 0, 0)), 0.01, 0.01, 4, WOOD, w));
  }
  if (hold === 'banner') {
    // A tall pole with the owner's banner hanging from a crossbar, a finial on top.
    out.push(rod(up(-0.42), up(1.22), 0.016, 0.014, 5, WOOD), rod(up(1.1).add(V(0, 0, -0.22)), up(1.1).add(V(0, 0, 0.22)), 0.01, 0.01, 4, WOOD),
      lp(plate([[0, 0.21], [0.44, 0.21], [0.44, -0.21], [0, -0.21]], PAINT), { x: hR.x, y: hR.y + 0.88, z: hR.z - 0.22, ry: -Math.PI / 2 }, { team: true }), ball(0.03, 0xd8b440, { x: hR.x, y: hR.y + 1.24, z: hR.z }));
  }
  if (hold === 'bow') {
    // A bow in the left hand: two limbs bent forward from the grip, and the string.
    const g = v3(hL);
    out.push(rod(g, g.clone().add(V(0, 0.36, -0.06)), 0.011, 0.007, 4, WOOD, bowTag), rod(g, g.clone().add(V(0, -0.36, -0.06)), 0.011, 0.007, 4, WOOD, bowTag),
      rod(g.clone().add(V(0, 0.36, -0.06)), g.clone().add(V(0, -0.36, -0.06)), 0.003, 0.003, 3, 0xd8d0c0, bowTag));
  }
  if (hold === 'recurve') {
    // A short composite bow: the limbs out from the grip, their tips curled forward, and the string.
    const g = v3(hL), tip = (s: number) => g.clone().add(V(0, 0.28 * s, 0.03));
    out.push(...[1, -1].flatMap((s) => [rod(g, g.clone().add(V(0, 0.15 * s, -0.05)), 0.011, 0.009, 4, 0x5a3a22, bowTag), rod(g.clone().add(V(0, 0.15 * s, -0.05)), tip(s), 0.009, 0.005, 3, 0x5a3a22, bowTag)]),
      rod(tip(1), tip(-1), 0.003, 0.003, 3, 0xd8d0c0, bowTag));
  }
  if (opts.quiver) out.push(lp(hull([R([0, 0, 0], 0.032), R([0, 0.3, 0], 0.036)], 4, LEATHER, { caps: [true, false] }), { x: 0.06, y: 0.5, z: -0.09, rz: -0.35 }),
    ...[0].map((dx) => rod(V(0.06 + dx - 0.1, 0.78, -0.09), V(0.06 + dx - 0.12, 0.84, -0.095), 0.006, 0.006, 3, 0xd8d0c0)));
  if (opts.pack) out.push(box(0.2, 0.22, 0.1, 0x9a8462, { y: 0.62, z: -0.11 }), rod(V(-0.11, 0.77, -0.1), V(0.11, 0.77, -0.1), 0.022, 0.022, 4, 0x6a5440));
  // (The shield goes with its forearm.)
  if (shield) out.push(...shieldOf(gear.shield, hL, { limb: GUARD_ARM, joint: [eL.y, eL.z] }));
  if (opts.helmet) out.push(...helmetOf(gear.helmet));
  return out;
}

// The shield on the left forearm, its face painted (team), standing
// forward: a flat polygon (both faces drawn) and its boss.
// (`t`: how it moves, with the arm.)
function shieldOf(s: Shield, hand: THREE.Vector3, t: Tag = {}): THREE.BufferGeometry[] {
  const at: Tf = { x: hand.x - 0.02, y: hand.y + 0.02, z: hand.z + 0.035 }, face: Tag = { ...t, team: true };
  const boss = point(0.025, 0.026, 3, METAL, { ...at, z: (at.z ?? 0) + 0.004, rx: Math.PI / 2 }, t);
  const ngon = (r: number, sy = 1, n = 8) => lp(plate(Array.from({ length: n }, (_, i) => [Math.cos((i + 0.5) * 2 * Math.PI / n) * r, Math.sin((i + 0.5) * 2 * Math.PI / n) * r * sy] as const), PAINT), at, face);
  switch (s) {
    case 'round': return [ngon(0.16), boss];
    case 'big round': return [ngon(0.2), boss];
    case 'small': return [ngon(0.11), boss];
    case 'oval': return [ngon(0.12, 1.6), boss];
    case 'scutum': return [shape(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 3, 1, true, -0.62, 1.24).rotateY(Math.PI), PAINT, { ...at, z: (at.z ?? 0) + 0.18, y: (at.y ?? 0) - 0.02 }, face), boss];
    case 'pavise': return [box(0.26, 0.46, 0.025, PAINT, { ...at, y: (at.y ?? 0) - 0.03 }, face)];
    case 'kite': return [lp(plate([[-0.12, 0.14], [0.12, 0.14], [0.11, -0.03], [0, -0.29], [-0.11, -0.03]], PAINT), at, face), boss];
  }
}

// Helmets and headgear, on a head at HEAD_Y: shells over the head's own
// five-sided rings (people.ts headShell), so the head never shows through.
function helmetOf(h: Helmet): THREE.BufferGeometry[] {
  const Y = HEAD_Y;
  const shell = (levels: readonly (readonly [number, number])[], color: number, t?: Tag) => lp(headShell(levels, color), {}, t);
  // (A dome: the rim at the brow, round over the crown to a low point.)
  const DOME = [[-0.004, 1.16], [0.07, 1.3], [0.098, 0]] as const;
  const brim = (r: number, color: number, dy = 0) => lp(plate(Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * r, Math.sin(i * Math.PI / 3) * r] as const), color), { y: Y + dy, rx: -Math.PI / 2 });
  switch (h) {
    case 'crest': return [shell(DOME, METAL), lp(plate([[-0.085, 0], [0.085, 0], [0.07, 0.075], [-0.07, 0.075]], PAINT), { y: Y + 0.085, ry: Math.PI / 2 }, { team: true })];
    case 'cone': return [shell([[-0.004, 1.16], [0.07, 1.25], [0.17, 0]], METAL), lp(plate([[-0.006, 0], [0.006, 0], [0.006, -0.05], [-0.006, -0.05]], METAL), { y: Y + 0.005, z: 0.084 })];
    case 'kettle': return [shell(DOME, METAL), brim(0.135, METAL, 0.002)];
    case 'hat': return [shell([[0.0, 1.18], [0.07, 1.3], [0.12, 0]], 0xb8a070), brim(0.17, 0xb8a070, 0.006)];
    case 'feather': return [shell([[0.0, 1.14], [0.045, 1.14]], PAINT, { team: true }),
      ...[-0.05, -0.025, 0, 0.025, 0.05].map((x) => lp(plate([[-0.01, 0], [0.01, 0], [0, 0.16]], x === 0 ? 0xd8b440 : 0x3a8a6a), { x, y: Y + 0.04, z: -0.05, rz: -x * 3 }))];
    case 'turban': return [shell([[-0.004, 1.2], [0.03, 1.32], [0.075, 1.38], [0.105, 0]], 0xece6d6)];
    case 'cap': return [shell([[-0.004, 1.14], [0.07, 1.22], [0.09, 0]], 0xe6dcc4)];
    case 'beret': return [shell([[0.02, 1.16], [0.065, 1.3], [0.085, 0]], PAINT, { team: true })];
    case 'none': return [];
  }
}

// A rider on his horse (creatures.ts; the horse's legs swing in diagonal
// pairs), by style: a horseman's (a short spear and a small shield), a
// knight's (a couched lance, the horse in a long cloth, a helmet whatever
// the civ wears), a lancer's (a long lance with a pennant in the owner's
// colour, a plumed helmet), a cavalryman's (a sabre), a commander's (a cape
// and a plume in the owner's colour, no weapon).
export const HORSE_SCALE = 0.58;
const SEAT = 1.47 * HORSE_SCALE + 0.02;
type RiderStyle = 'horseman' | 'knight' | 'lancer' | 'cavalry' | 'officer';
const HEAVY_HELMET = (h: Helmet): Helmet => (h === 'none' || h === 'cap' || h === 'turban' || h === 'feather' || h === 'hat' ? 'kettle' : h);
// The horse (creatures.ts), turned to face +z, scaled, its coat painted
// (the creature's leaf parts), its legs swinging; `cloth`: the saddle cloth.
function mount(coat: number, cloth: boolean): THREE.BufferGeometry[] {
  const h = horseParts();
  const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeScale(HORSE_SCALE, HORSE_SCALE, HORSE_SCALE));
  const paint = (g: THREE.BufferGeometry) => { coatIt(g, coat); return g.applyMatrix4(m); };
  const LEG_TOP = 1.05 * HORSE_SCALE, HORSE_LEG = (side: number) => [side, LEG_TOP, 0.4] as const;
  return [
    ...h.body.map((g) => tag(paint(g))),
    tag(paint(h.legs.fl), { limb: HORSE_LEG(1) }), tag(paint(h.legs.fr), { limb: HORSE_LEG(-1) }),
    tag(paint(h.legs.hl), { limb: HORSE_LEG(-1) }), tag(paint(h.legs.hr), { limb: HORSE_LEG(1) }),
    ...(cloth ? [shape(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 4, 1, true, -1.2, 2.4).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), CLOTH, { y: SEAT - 0.17, z: 0.02 }, { team: true })] : []),
  ];
}
function rider(gear: Gear, coat: number, female: boolean, style: RiderStyle): THREE.BufferGeometry[] {
  const heavy = style === 'knight';
  const out: THREE.BufferGeometry[] = [...mount(coat, !heavy), box(0.16, 0.05, 0.22, LEATHER, { y: SEAT - 0.03, z: 0.02 })];
  const dress: Dress = { female, legs: gear.legs, sleeves: 'long' };
  const armR: ArmPose = HOLD, armL: ArmPose = HOLD;
  // (The weapon arm strikes with its weapon: the same swing, bent at the same elbow.)
  const amp = style === 'cavalry' ? 0.9 : style === 'horseman' ? 0.8 : 0.6, strike = HIT(SEAT + 0.3, amp);
  out.push(...tagged(riderBody(dress, SEAT, armL, armR, style === 'officer' ? undefined : strike)));
  const hR = handAt(-1, armR, female).add(V(0, SEAT - HIP, 0)), hL = handAt(1, armL, female).add(V(0, SEAT - HIP, 0)), eR = elbowAt(-1, armR, female).add(V(0, SEAT - HIP, 0));
  const w: Tag = { limb: strike, joint: [eR.y, eR.z] };
  const plume = (dy: number) => box(0.024, 0.11, 0.15, PAINT, { y: SEAT - HIP + HEAD_Y + 0.12 + dy }, { team: true });
  const lance = (len: number) => {
    const tip = hR.clone().add(V(0, 0.55, 0.75).multiplyScalar(len));
    return [rod(hR.clone().add(V(0, -0.15, -0.35)), tip, 0.011, 0.009, 5, WOOD, w), point(0.1, 0.02, 3, METAL, { x: tip.x, y: tip.y, z: tip.z, rx: 1.0 }, w)];
  };
  switch (style) {
    case 'officer': out.push(lp(plate([[-0.12, 0.2], [0.12, 0.2], [0.14, -0.2], [-0.14, -0.2]], CLOTH), { y: SEAT + 0.12, z: -0.11, rx: 0.12 }, { team: true }), plume(gear.helmet === 'none' ? -0.03 : 0.04)); break;
    case 'cavalry': out.push(rod(hR, hR.clone().add(V(0, 0.42, 0.18)), 0.014, 0.005, 4, METAL, w)); break;
    case 'knight': out.push(...lance(1), tag(caparison(), { team: true })); break;
    case 'lancer': {
      // (The pennant just below the lance's head.)
      out.push(...lance(1.25));
      const at = hR.clone().add(V(0, 0.55, 0.75).multiplyScalar(1.12));
      out.push(lp(plate([[0, 0], [0, -0.08], [-0.16, -0.04]], PAINT), { x: at.x, y: at.y, z: at.z, ry: Math.PI / 2 }, { ...w, team: true }),
        lp(plate([[-0.05, 0], [0.06, 0], [0.03, 0.06], [-0.07, 0.05]], PAINT), { y: RIDER_HEAD + HEAD_Y + 0.085, ry: Math.PI / 2 }, { team: true }));
      break;
    }
    case 'horseman':
      // (A short spear held high, a small shield on the rein arm.)
      out.push(rod(hR.clone().add(V(0, -0.2, -0.1)), hR.clone().add(V(0, 0.5, 0.2)), 0.011, 0.01, 4, WOOD, w), point(0.08, 0.02, 3, METAL, { x: hR.x, y: hR.y + 0.5, z: hR.z + 0.2, rx: 0.4 }, w),
        ...shieldOf('small', hL));
      break;
  }
  const helmet = heavy || style === 'lancer' ? HEAVY_HELMET(gear.helmet) : gear.helmet;
  out.push(...helmetOf(helmet).map((g) => g.translate(0, RIDER_HEAD, 0)));
  return out;
}
// A horse archer: a rider (no lance) with a short bow raised, a quiver.
function horseArcher(gear: Gear, coat: number, female: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [...mount(coat, true), box(0.16, 0.05, 0.22, LEATHER, { y: SEAT - 0.03, z: 0.02 })];
  const armR: ArmPose = HOLD, armL: ArmPose = RAISE;
  const raise = HIT(SEAT + 0.3, 0.8), eL = elbowAt(1, armL, female).add(V(0, SEAT - HIP, 0));
  out.push(...tagged(riderBody({ female, legs: gear.legs, sleeves: 'long' }, SEAT, armL, armR, undefined, raise)));
  const g = handAt(1, armL, female).add(V(0, SEAT - HIP, 0)), up: Tag = { limb: raise, joint: [eL.y, eL.z] };
  out.push(rod(g, g.clone().add(V(0, 0.26, -0.05)), 0.01, 0.007, 3, 0x5a3a22, up), rod(g, g.clone().add(V(0, -0.26, -0.05)), 0.01, 0.007, 3, 0x5a3a22, up), rod(g.clone().add(V(0, 0.26, -0.05)), g.clone().add(V(0, -0.26, -0.05)), 0.003, 0.003, 3, 0xd8d0c0, up),
    lp(hull([R([0, 0, 0], 0.03), R([0, 0.26, 0], 0.034)], 4, LEATHER, { caps: [true, false] }), { x: 0.12, y: SEAT - 0.1, z: -0.12, rz: -0.3 }));
  out.push(...helmetOf(gear.helmet).map((h) => h.translate(0, RIDER_HEAD, 0)));
  return out;
}
// A chariot archer: the horse in the shafts, the two-wheeled car behind it
// (its front painted in the owner's colour), the archer standing in it, his
// bow raised (still: a figure stood back from its pivots can't swing).
const CAR_Z = -0.86, CAR_FLOOR = 0.3;
function chariot(gear: Gear, coat: number, female: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [...mount(coat, false),
    lp(plate([[-0.23, -0.18], [0.23, -0.18], [0.23, 0.18], [-0.23, 0.18]], WOOD), { y: CAR_FLOOR, z: CAR_Z, rx: -Math.PI / 2 }), lp(plate([[-0.23, 0], [0.23, 0], [0.2, 0.26], [-0.2, 0.26]], PAINT), { y: CAR_FLOOR, z: CAR_Z + 0.18 }, { team: true }),
    ...[1, -1].flatMap((s) => [lp(plate([[-0.18, 0], [0.18, 0], [0.18, 0.18], [-0.18, 0.18]], WOOD), { x: s * 0.22, y: CAR_FLOOR, z: CAR_Z, ry: Math.PI / 2 }),
      lp(plate(Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * 0.27, Math.sin(i * Math.PI / 3) * 0.27] as const), 0x5a4028), { x: s * 0.28, y: 0.27, z: CAR_Z, ry: Math.PI / 2 }),
      rod(V(s * 0.16, CAR_FLOOR + 0.1, CAR_Z + 0.18), V(s * 0.17, 0.62, 0.25), 0.014, 0.014, 3, WOOD)]),
  ];
  const archer = figure(gear, 'bow', false, { female, still: true, quiver: true });
  // (Still in the car: nothing swings; its flags kept.)
  for (const g of archer) { const a = (g.getAttribute('aLimb') as THREE.BufferAttribute).array; for (let i = 0; i < a.length; i += 4) a.fill(0, i, i + 3); g.translate(0, CAR_FLOOR, CAR_Z); }
  return [...out, ...archer];
}
// The knight's horse in its caparison: a cloth laid over its back,
// following its body (a little out from it), hanging down its flanks to
// the knees, open below; a darker band at its hem.
function caparison(): THREE.BufferGeometry {
  const S = HORSE_SCALE, keys = [[-0.8, 1.15, 0.3, 0.25], [-0.5, 1.15, 0.36, 0.29], [0.2, 1.1, 0.39, 0.3], [0.62, 1.15, 0.32, 0.24]] as const;
  const A = 6, pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color(CLOTH), hem = new THREE.Color(0x707070);
  keys.forEach(([x, y, a, b]) => {
    for (let j = 0; j <= A; j++) {
      const th = -1.95 + (3.9 * j) / A, drop = Math.max(0, Math.abs(th) - 1.3) * 0.5;
      // (Facing +z: the horse's length along z, its sides along x.)
      pos.push(Math.sin(th) * b * 1.12 * S, (y + Math.cos(th) * a * 1.12 - drop) * S, x * S);
      const k = Math.abs(th) > 1.5 ? hem : c;
      col.push(k.r, k.g, k.b);
    }
  });
  for (let i = 0; i < keys.length - 1; i++) for (let j = 0; j < A; j++) { const p = i * (A + 1) + j, q = p + A + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}
// (A creature's coat, its leaf-marked vertices, painted a colour.)
function coatIt(g: THREE.BufferGeometry, coat: number): void {
  const mask = g.getAttribute('leafMask'), col = g.getAttribute('color') as THREE.BufferAttribute, c = new THREE.Color(coat);
  if (!mask) return;
  for (let i = 0; i < col.count; i++) if (mask.getX(i) > 0.5) col.setXYZ(i, c.r * col.getX(i), c.g * col.getY(i), c.b * col.getZ(i));
  g.deleteAttribute('leafMask');
}

// ---- machines ----
// Guns and tanks: no one walks, no skin or hair; a little of the owner's
// colour on the carriage or hull. About a figure's height, longer.
const IRON = 0x4a4d52, GUNMETAL = 0x2e3034, OLIVE = 0x5d6248;
function cannon(heavy: boolean): THREE.BufferGeometry[] {
  const wheel = (x: number) => shape(new THREE.CylinderGeometry(heavy ? 0.24 : 0.28, heavy ? 0.24 : 0.28, 0.06, 10, 1, false), heavy ? GUNMETAL : WOOD, { x, y: heavy ? 0.24 : 0.28, rz: Math.PI / 2 });
  return [
    wheel(0.22), wheel(-0.22),
    box(0.3, 0.14, 0.7, PAINT, { y: 0.32, z: -0.18, rx: -0.25 }, { team: true }),
    shape(new THREE.CylinderGeometry(heavy ? 0.07 : 0.09, heavy ? 0.09 : 0.12, heavy ? 1.1 : 0.85, 8, 1, false), heavy ? OLIVE : IRON, { y: 0.5, z: 0.25, rx: Math.PI / 2 - (heavy ? 0.35 : 0.2) }),
    ...(heavy ? [box(0.62, 0.36, 0.03, OLIVE, { y: 0.55, z: 0.02 })] : []),
  ];
}
function tank(): THREE.BufferGeometry[] {
  return [
    box(0.2, 0.3, 1.5, GUNMETAL, { x: 0.36, y: 0.16 }), box(0.2, 0.3, 1.5, GUNMETAL, { x: -0.36, y: 0.16 }),
    box(0.62, 0.28, 1.36, PAINT, { y: 0.4 }, { team: true }),
    box(0.46, 0.22, 0.56, OLIVE, { y: 0.65, z: -0.08 }),
    shape(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 6, 1, false), GUNMETAL, { y: 0.66, z: 0.55, rx: Math.PI / 2 }),
  ];
}
// A catapult (a mangonel): a wheeled frame, the throwing arm cocked back
// from its torsion bundle (painted: the owner's colour), a crossbar to stop
// it; the arm swings in a fight.
function catapult(): THREE.BufferGeometry[] {
  const arm: Tag = { limb: HIT(0.24, 1.3) };
  return [
    ...[1, -1].flatMap((s) => [box(0.06, 0.07, 1.0, WOOD, { x: s * 0.22, y: 0.2 }), shape(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 6), WOOD, { x: s * 0.27, y: 0.14, z: 0.35, rz: Math.PI / 2 }),
      shape(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 6), WOOD, { x: s * 0.27, y: 0.14, z: -0.35, rz: Math.PI / 2 }), rod(V(s * 0.22, 0.22, 0.22), V(s * 0.22, 0.62, 0.18), 0.022, 0.02, 4, WOOD)]),
    box(0.5, 0.06, 0.06, WOOD, { y: 0.2, z: 0.42 }), box(0.5, 0.06, 0.06, WOOD, { y: 0.2, z: -0.42 }),
    rod(V(-0.25, 0.62, 0.18), V(0.25, 0.62, 0.18), 0.03, 0.03, 4, WOOD),
    box(0.36, 0.1, 0.1, PAINT, { y: 0.19 }, { team: true }),
    rod(V(0, 0.24, 0), V(0, 0.36, -0.62), 0.026, 0.02, 4, WOOD, arm), box(0.12, 0.05, 0.12, WOOD, { y: 0.36, z: -0.62 }, arm),
  ];
}
// A counterweight trebuchet: a long base, A-frames to the axle, the long
// arm cocked low behind, its counterweight box (painted) up in front; the
// arm swings over in a fight.
function trebuchet(): THREE.BufferGeometry[] {
  const arm: Tag = { limb: HIT(1.0, 1.5) };
  return [
    ...[1, -1].flatMap((s) => [box(0.07, 0.08, 1.3, WOOD, { x: s * 0.3 }), rod(V(s * 0.3, 0.08, 0.5), V(s * 0.3, 1.0, 0), 0.03, 0.025, 4, WOOD), rod(V(s * 0.3, 0.08, -0.5), V(s * 0.3, 1.0, 0), 0.03, 0.025, 4, WOOD)]),
    box(0.7, 0.07, 0.07, WOOD, { y: 0.04, z: 0.6 }), box(0.7, 0.07, 0.07, WOOD, { y: 0.04, z: -0.6 }),
    rod(V(-0.34, 1.0, 0), V(0.34, 1.0, 0), 0.025, 0.025, 4, IRON),
    rod(V(0, 1.28, 0.3), V(0, 0.3, -0.98), 0.03, 0.018, 4, WOOD, arm),
    box(0.3, 0.26, 0.26, PAINT, { y: 1.02, z: 0.36 }, { team: true, ...arm }),
  ];
}
// A Gatling gun on its carriage: two wheels, the trail behind (painted),
// the barrels' cluster and the breech with its hopper.
function gatling(): THREE.BufferGeometry[] {
  return [
    ...[1, -1].map((s) => shape(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 8), WOOD, { x: s * 0.25, y: 0.26, rz: Math.PI / 2 })),
    rod(V(-0.25, 0.26, 0), V(0.25, 0.26, 0), 0.025, 0.025, 4, IRON),
    box(0.14, 0.08, 0.7, PAINT, { y: 0.18, z: -0.33, rx: 0.32 }, { team: true }),
    box(0.17, 0.17, 0.2, IRON, { y: 0.42, z: -0.08 }), box(0.08, 0.12, 0.08, 0xb8964a, { y: 0.54, z: -0.08 }),
    shape(new THREE.CylinderGeometry(0.065, 0.07, 0.6, 6), GUNMETAL, { y: 0.42, z: 0.3, rx: Math.PI / 2 }),
  ];
}
// An anti-tank gun: low, on two tyred wheels, its shield plate (a band of
// the owner's colour along the top), a long thin barrel, split trails.
function antiTank(): THREE.BufferGeometry[] {
  return [
    ...[1, -1].flatMap((s) => [shape(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 8), 0x1e1e1e, { x: s * 0.27, y: 0.17, rz: Math.PI / 2 }), rod(V(s * 0.08, 0.24, -0.05), V(s * 0.34, 0.03, -0.75), 0.03, 0.025, 4, OLIVE)]),
    box(0.62, 0.32, 0.025, OLIVE, { y: 0.24, z: 0.14, rx: -0.15 }), box(0.62, 0.05, 0.03, PAINT, { y: 0.55, z: 0.1, rx: -0.15 }, { team: true }),
    box(0.16, 0.14, 0.3, OLIVE, { y: 0.3, z: 0.02 }),
    shape(new THREE.CylinderGeometry(0.025, 0.032, 0.95, 6), GUNMETAL, { y: 0.37, z: 0.6, rx: Math.PI / 2 }),
  ];
}
// A landship (the first tanks): tall rhomboid sides (painted: the tracks
// run round them, dark along the bottom), the hull and cab between them, a
// gun in a sponson on each flank.
function landship(): THREE.BufferGeometry[] {
  const side = new THREE.Shape([[-0.85, 0.3], [-0.62, 0.0], [0.6, 0.0], [0.9, 0.34], [0.62, 0.64], [-0.62, 0.64]].map(([z, y]) => new THREE.Vector2(z, y)));
  // (The great rhomboid track frames in the hull's olive, a band of the owner's colour along each.)
  const track = (x: number) => shape(new THREE.ExtrudeGeometry(side, { depth: 0.18, bevelEnabled: false }).rotateY(-Math.PI / 2), OLIVE, { x: x + (x > 0 ? 0.18 : 0) });
  return [
    track(0.2), track(-0.2),
    ...[1, -1].map((s) => box(0.012, 0.08, 0.9, PAINT, { x: s * 0.381, y: 0.46, z: 0 }, { team: true })),
    ...[1, -1].map((s) => box(0.2, 0.1, 1.24, GUNMETAL, { x: s * 0.29, z: -0.02 })),
    box(0.42, 0.4, 1.0, OLIVE, { y: 0.14 }),
    box(0.24, 0.14, 0.3, OLIVE, { y: 0.54, z: 0.1 }),
    ...[1, -1].flatMap((s) => [box(0.12, 0.18, 0.3, OLIVE, { x: s * 0.44, y: 0.3, z: 0.05 }), shape(new THREE.CylinderGeometry(0.022, 0.025, 0.36, 5), GUNMETAL, { x: s * 0.47, y: 0.39, z: 0.3, rx: Math.PI / 2 })]),
  ];
}
// ---- later machines ----
// A field cannon: the cannon, smaller and lighter.
const fieldCannon = () => cannon(false).map((g) => g.applyMatrix4(new THREE.Matrix4().makeScale(0.78, 0.78, 0.78)));
// Wheels down a vehicle's sides (low six-sided drums, dark).
const wheels = (xs: readonly number[], zs: readonly number[], r: number) => xs.flatMap((x) => zs.map((z) => shape(new THREE.CylinderGeometry(r, r, 0.08, 6), 0x1e1e1e, { x, y: r, z, rz: Math.PI / 2 })));
// Modern armour: a low hull (painted), a flat turret, a long gun.
function modernArmor(): THREE.BufferGeometry[] {
  return [box(0.2, 0.22, 1.5, GUNMETAL, { x: 0.36, y: 0.11 }), box(0.2, 0.22, 1.5, GUNMETAL, { x: -0.36, y: 0.11 }),
    box(0.66, 0.22, 1.2, PAINT, { y: 0.34, z: -0.05 }, { team: true }),
    box(0.5, 0.16, 0.6, OLIVE, { y: 0.53, z: -0.12 }), shape(new THREE.CylinderGeometry(0.03, 0.035, 1.0, 6), GUNMETAL, { y: 0.55, z: 0.65, rx: Math.PI / 2 })];
}
// An armoured carrier (mechanized infantry): a boxy hull on wheels, its sides painted, a small turret.
function apc(): THREE.BufferGeometry[] {
  return [...wheels([0.33, -0.33], [-0.45, 0, 0.45], 0.14), box(0.62, 0.36, 1.3, PAINT, { y: 0.32 }, { team: true }), box(0.6, 0.04, 0.3, OLIVE, { y: 0.48, z: 0.58, rx: 0.6 }),
    box(0.22, 0.12, 0.24, OLIVE, { y: 0.56, z: -0.1 }), rod(V(0, 0.58, 0), V(0, 0.58, 0.4), 0.015, 0.015, 3, GUNMETAL)];
}
// Rocket artillery: a tracked chassis (painted) under a box of rockets tilted to the sky.
function rocketArtillery(): THREE.BufferGeometry[] {
  return [box(0.18, 0.2, 1.3, GUNMETAL, { x: 0.3, y: 0.1 }), box(0.18, 0.2, 1.3, GUNMETAL, { x: -0.3, y: 0.1 }), box(0.56, 0.2, 1.2, PAINT, { y: 0.3 }, { team: true }),
    box(0.4, 0.2, 0.3, OLIVE, { y: 0.48, z: 0.4 }), box(0.46, 0.26, 0.8, OLIVE, { y: 0.62, z: -0.2, rx: -0.45 }),
    ...[-0.12, 0, 0.12].map((x) => box(0.06, 0.06, 0.02, 0x1a1a1a, { x, y: 0.82, z: 0.17, rx: -0.45 }))];
}
// A mobile SAM: a truck, its cab painted, two missiles on rails raised on the bed.
function mobileSAM(): THREE.BufferGeometry[] {
  const missile = (x: number) => lp(hull([R([x, 0, -0.35], 0.04), R([x, 0, 0.3], 0.04), R([x, 0, 0.42], 0, 0)], 4, 0xe8e6e0, { side: [1, 0, 0] }), { y: 0.72, z: -0.15, rx: -0.6 });
  return [...wheels([0.28, -0.28], [-0.45, 0.45], 0.13), box(0.56, 0.08, 1.3, OLIVE, { y: 0.26 }), box(0.56, 0.3, 0.36, PAINT, { y: 0.45, z: 0.45 }, { team: true }),
    box(0.3, 0.12, 0.5, OLIVE, { y: 0.38, z: -0.2 }), missile(0.1), missile(-0.1)];
}

// ---- ships ----
// Ships sit on the water (y = 0 the waterline), bow to +z: a low-poly hull
// (boxy sections tapering to the bow, a flat transom), masts and sails (a
// sail or a band in the owner's colour), oars, guns, funnels and turrets.
const HULL_WOOD = 0x6a4a30, DECK = 0x9a7a52, SAIL = 0xe8e0cc, STEEL_GREY = 0x7a8088, DARK_HULL = 0x2a2c30;
// A hull `len` long, `beam` wide, `h` from keel to deck (`draught` of it under water).
function shipHull(len: number, beam: number, h: number, color: number, deck: number, draught = 0.35): THREE.BufferGeometry[] {
  const y = h / 2 - h * draught, Z = len / 2;
  const sec = (z: number, k: number, lift = 0) => R([0, y + lift, z], (h / 2) * k, (beam / 2) * k);
  return [
    lp(hull([sec(-Z, 0.85, 0.04), sec(-Z * 0.4, 1), sec(Z * 0.35, 1), sec(Z * 0.8, 0.6, 0.06), R([0, y + h * 0.35, Z], 0, 0)], 4, color, { side: [1, 0, 0], caps: [true, false] })),
    box(beam * 0.86, 0.03, len * 0.7, deck, { y: y + h / 2 + 0.01, z: -len * 0.05 }),
  ];
}
// A mast at z, its square sail (`team`: painted) and yard.
const mast = (z: number, h: number, w: number, deckY: number, team = true, color = SAIL) => [
  rod(V(0, deckY, z), V(0, deckY + h, z), 0.025, 0.018, 4, WOOD),
  lp(plate([[-w / 2, 0], [w / 2, 0], [w / 2 * 0.9, h * 0.55], [-w / 2 * 0.9, h * 0.55]], team ? PAINT : color), { y: deckY + h * 0.35, z: z + 0.04 }, team ? { team: true } : undefined),
];
// Oars along both sides, `n` a side.
const oars = (n: number, len: number, beam: number, y: number) => [1, -1].flatMap((s) => Array.from({ length: n }, (_, i) => {
  const z = (i / (n - 1) - 0.5) * len * 0.55;
  return rod(V(s * beam * 0.45, y, z), V(s * (beam * 0.45 + 0.45), -0.02, z - 0.08), 0.008, 0.008, 3, WOOD);
}));
const gun = (x: number, y: number, z: number, len: number, ry = 0) => shape(new THREE.CylinderGeometry(0.03, 0.035, len, 5), GUNMETAL, { x, y, z, rx: Math.PI / 2, ry });
const turret = (z: number, y: number, k = 1) => [box(0.28 * k, 0.12 * k, 0.3 * k, STEEL_GREY, { y, z }), rod(V(-0.05 * k, y + 0.06 * k, z + 0.1), V(-0.05 * k, y + 0.06 * k, z + 0.5 * k), 0.02, 0.02, 3, GUNMETAL), rod(V(0.05 * k, y + 0.06 * k, z + 0.1), V(0.05 * k, y + 0.06 * k, z + 0.5 * k), 0.02, 0.02, 3, GUNMETAL)];
function ship(type: UnitKey): THREE.BufferGeometry[] {
  switch (type) {
    case 'galley': return [...shipHull(2.0, 0.5, 0.32, HULL_WOOD, DECK), ...mast(0.05, 0.9, 0.7, 0.18), ...oars(4, 2.0, 0.5, 0.12), point(0.25, 0.05, 3, METAL, { y: 0.02, z: 1.05, rx: Math.PI / 2 })];
    case 'trireme': return [...shipHull(2.7, 0.55, 0.36, HULL_WOOD, DECK), ...mast(0.1, 1.0, 0.8, 0.2), ...oars(5, 2.7, 0.55, 0.14), point(0.32, 0.06, 3, METAL, { y: 0.02, z: 1.4, rx: Math.PI / 2 })];
    case 'cog': return [...shipHull(2.2, 0.8, 0.6, HULL_WOOD, DECK, 0.3), box(0.7, 0.24, 0.45, HULL_WOOD, { y: 0.5, z: -0.8 }), box(0.6, 0.2, 0.35, HULL_WOOD, { y: 0.48, z: 0.85 }), ...mast(0, 1.3, 0.95, 0.38)];
    case 'caravel': return [...shipHull(2.3, 0.7, 0.55, HULL_WOOD, DECK, 0.3), box(0.6, 0.22, 0.5, HULL_WOOD, { y: 0.48, z: -0.85 }), ...mast(0.35, 1.3, 0.85, 0.4), ...mast(-0.45, 1.0, 0.6, 0.4, false)];
    case 'galleass': return [...shipHull(2.8, 0.8, 0.5, HULL_WOOD, DECK, 0.3), box(0.7, 0.2, 0.5, HULL_WOOD, { y: 0.45, z: -1.0 }), ...mast(0.4, 1.2, 0.8, 0.36), ...mast(-0.5, 1.0, 0.65, 0.36, false), ...oars(4, 2.8, 0.8, 0.18), gun(0.12, 0.36, 1.3, 0.3), gun(-0.12, 0.36, 1.3, 0.3)];
    case 'frigate': return [...shipHull(3.0, 0.8, 0.6, 0x3a2a20, DECK, 0.3), box(0.86, 0.06, 2.0, 0xd8b440, { y: 0.27 }),
      ...[1, -1].flatMap((s) => [-0.6, 0, 0.6].map((z) => gun(s * 0.42, 0.27, z, 0.16, s * Math.PI / 2))), ...mast(0.8, 1.5, 0.8, 0.42, false), ...mast(0, 1.8, 1.0, 0.42), ...mast(-0.8, 1.4, 0.75, 0.42, false)];
    case 'ironclad': return [...shipHull(2.6, 0.75, 0.38, DARK_HULL, 0x4a4a4e, 0.45), box(0.6, 0.22, 1.0, DARK_HULL, { y: 0.29 }), box(0.65, 0.05, 1.05, PAINT, { y: 0.4 }, { team: true }),
      shape(new THREE.CylinderGeometry(0.09, 0.1, 0.45, 6), 0x1a1a1a, { y: 0.62, z: 0.05 }), gun(0, 0.3, 0.62, 0.3)];
    case 'destroyer': return [...shipHull(3.2, 0.6, 0.42, STEEL_GREY, 0x5a6066, 0.4), box(0.36, 0.3, 0.6, STEEL_GREY, { y: 0.36, z: 0.35 }),
      ...[-0.1, -0.5].flatMap((z) => [shape(new THREE.CylinderGeometry(0.07, 0.08, 0.36, 6), STEEL_GREY, { y: 0.48, z }), box(0.18, 0.06, 0.18, PAINT, { y: 0.69, z }, { team: true })]), ...turret(1.0, 0.3, 0.8), ...turret(-1.1, 0.3, 0.8)];
    case 'privateer': return [...shipHull(2.4, 0.66, 0.5, 0x2e241c, DECK, 0.3), box(0.55, 0.2, 0.45, 0x2e241c, { y: 0.45, z: -0.85 }), ...mast(0.3, 1.3, 0.85, 0.36, false, 0x2a2a2a), ...mast(-0.45, 1.05, 0.65, 0.36, false, 0x2a2a2a),
      lp(plate([[0, 0], [0.22, -0.06], [0, -0.12]], PAINT), { y: 1.66, z: 0.33, ry: -Math.PI / 2 }, { team: true })];
    case 'shipOfTheLine': return [...shipHull(3.3, 0.95, 0.75, 0x3a2a20, DECK, 0.28), box(1.0, 0.06, 2.4, 0xd8b440, { y: 0.32 }), box(1.0, 0.06, 2.4, 0xd8b440, { y: 0.5 }),
      ...[1, -1].flatMap((s) => [-0.8, -0.2, 0.4, 1.0].map((z) => gun(s * 0.5, 0.41, z, 0.16, s * Math.PI / 2))), box(0.8, 0.25, 0.6, 0x3a2a20, { y: 0.7, z: -1.2 }),
      ...mast(0.95, 1.6, 0.9, 0.56, false), ...mast(0.05, 2.0, 1.1, 0.56), ...mast(-0.85, 1.5, 0.8, 0.56, false)];
    case 'missileCruiser': return [...shipHull(3.4, 0.75, 0.5, 0x8a9096, 0x5a6066, 0.4), box(0.42, 0.42, 0.9, 0x8a9096, { y: 0.45, z: 0.1 }), box(0.43, 0.06, 0.91, PAINT, { y: 0.69, z: 0.1 }, { team: true }),
      rod(V(0, 0.68, -0.1), V(0, 1.15, -0.1), 0.02, 0.015, 3, GUNMETAL), box(0.4, 0.06, 0.5, 0x4a4e52, { y: 0.31, z: 1.0 }), box(0.4, 0.06, 0.5, 0x4a4e52, { y: 0.31, z: -1.0 }), gun(0, 0.36, 1.45, 0.3)];
    case 'nuclearSubmarine': return ship('submarine').map((g) => g.applyMatrix4(new THREE.Matrix4().makeScale(1.15, 1.2, 1.35)));
    case 'cruiser': return [...shipHull(3.3, 0.75, 0.5, STEEL_GREY, 0x5a6066, 0.4), box(0.42, 0.34, 0.8, STEEL_GREY, { y: 0.4, z: 0.15 }),
      ...[-0.35, -0.75].flatMap((z) => [shape(new THREE.CylinderGeometry(0.08, 0.09, 0.4, 6), 0x3a3c40, { y: 0.55, z }), box(0.2, 0.06, 0.2, PAINT, { y: 0.77, z }, { team: true })]), ...turret(1.05, 0.36, 0.9), ...turret(-1.15, 0.36, 0.9)];
    case 'submarine': return [lp(hull([R([0, 0.04, -1.4], 0, 0), R([0, 0.04, -0.9], 0.12, 0.16), R([0, 0.05, 0.6], 0.15, 0.2), R([0, 0.05, 1.2], 0.1, 0.12), R([0, 0.04, 1.45], 0, 0)], 6, DARK_HULL, { side: [1, 0, 0] })),
      box(0.16, 0.26, 0.42, DARK_HULL, { y: 0.15, z: 0.25 }), box(0.19, 0.05, 0.45, PAINT, { y: 0.37, z: 0.25 }, { team: true }), rod(V(0, 0.4, 0.3), V(0, 0.58, 0.3), 0.012, 0.012, 3, GUNMETAL)];
    // (The flight deck on a hangar sitting on the hull, not floating over it.)
    case 'carrier': return [...shipHull(3.6, 1.0, 0.6, STEEL_GREY, 0x55595e, 0.4), box(0.92, 0.09, 3.1, STEEL_GREY, { y: 0.395 }), box(1.15, 0.04, 3.4, 0x4a4e52, { y: 0.455 }), box(1.1, 0.02, 0.08, PAINT, { y: 0.48, z: 1.0 }, { team: true }),
      box(0.22, 0.45, 0.6, STEEL_GREY, { x: 0.42, y: 0.68, z: -0.2 }), shape(new THREE.CylinderGeometry(0.07, 0.08, 0.3, 6), STEEL_GREY, { x: 0.42, y: 1.04, z: -0.35 })];
    case 'battleship': return [...shipHull(3.8, 0.95, 0.55, STEEL_GREY, 0x5a6066, 0.4), box(0.5, 0.5, 0.9, STEEL_GREY, { y: 0.45 }), box(0.25, 0.35, 0.3, STEEL_GREY, { y: 0.85, z: 0.1 }),
      shape(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 6), STEEL_GREY, { y: 0.85, z: -0.35 }), box(0.54, 0.06, 0.94, PAINT, { y: 0.72 }, { team: true }), ...turret(1.1, 0.4), ...turret(0.7, 0.55), ...turret(-1.2, 0.4)];
    default: return [];
  }
}
// The boat a land unit crosses the water in (embarked): a hull and a
// canvas cover over the deck in the owner's colour.
function transport(): THREE.BufferGeometry[] {
  return [...shipHull(1.7, 0.6, 0.36, HULL_WOOD, DECK), lp(hull([R([0, 0.22, -0.5], 0.001, 0.26), R([0, 0.4, -0.15], 0.14, 0.26), R([0, 0.4, 0.3], 0.14, 0.26), R([0, 0.22, 0.6], 0.001, 0.26)], 4, PAINT, { side: [1, 0, 0], caps: [false, false] }), {}, { team: true })];
}
export function transportModel(): THREE.BufferGeometry {
  const g = mergeGeometries(transport().map((p) => (p.getAttribute('aLimb') && !p.getAttribute('leafMask') ? p : tag(p))), false);
  if (!g) throw new Error('transportModel: parts don\'t merge');
  return g;
}

// ---- aircraft ----
// Parked on their city's ground (they fly when they strike: unitView.ts),
// nose to +z: a fuselage, wings (the upper one in the owner's colour), the
// tail, a propeller's disc.
const AIR_Y = 0.3;
function aircraft(type: UnitKey): THREE.BufferGeometry[] {
  const body = (len: number, r: number, color: number) => lp(hull([R([0, AIR_Y, -len / 2], 0.02, 0.02), R([0, AIR_Y, -len * 0.1], r, r), R([0, AIR_Y, len * 0.35], r, r), R([0, AIR_Y, len / 2], r * 0.7, r * 0.7)], 4, color, { side: [1, 0, 0] }));
  const wing = (span: number, chord: number, y: number, z: number, color: number, team: boolean) => lp(plate([[-span / 2, -chord / 2], [span / 2, -chord / 2], [span / 2 * 0.95, chord / 2], [-span / 2 * 0.95, chord / 2]], color), { y, z, rx: -Math.PI / 2 }, team ? { team: true } : undefined);
  const tail = (len: number, color: number) => [wing(0.5, 0.18, AIR_Y, -len / 2 + 0.08, color, false), lp(plate([[0, 0], [0.2, 0], [0.05, 0.22]], color), { y: AIR_Y, z: -len / 2 + 0.02, ry: -Math.PI / 2 })];
  const prop = (x: number, z: number) => lp(plate([[-0.02, -0.18], [0.02, -0.18], [0.02, 0.18], [-0.02, 0.18]], 0x2a2420), { x, y: AIR_Y, z });
  const gear = [1, -1].map((s) => rod(V(s * 0.1, AIR_Y - 0.05, 0.15), V(s * 0.14, 0.04, 0.18), 0.012, 0.012, 3, GUNMETAL));
  if (type === 'airship') return [lp(hull([R([0, AIR_Y + 0.75, -1.5], 0, 0), R([0, AIR_Y + 0.75, -1.0], 0.34, 0.34), R([0, AIR_Y + 0.75, 0.5], 0.42, 0.42), R([0, AIR_Y + 0.75, 1.25], 0.26, 0.26), R([0, AIR_Y + 0.75, 1.55], 0, 0)], 6, PAINT, { side: [1, 0, 0] }), {}, { team: true }), box(0.2, 0.14, 0.5, 0x5a4a38, { y: AIR_Y + 0.2, z: 0.1 }),
    ...[1, -1].map((s) => rod(V(s * 0.08, AIR_Y + 0.27, 0.1), V(s * 0.2, AIR_Y + 0.45, 0.1), 0.008, 0.008, 3, GUNMETAL)), lp(plate([[0, 0], [0.5, 0], [0.15, 0.4]], 0xd8d0c0), { y: AIR_Y + 0.75, z: -1.3, ry: -Math.PI / 2 })];
  if (type === 'jetFighter') return [body(1.3, 0.08, 0x8a9096), lp(plate([[-0.75, -0.25], [0.75, -0.25], [0.08, 0.35], [-0.08, 0.35]], PAINT), { y: AIR_Y, z: -0.1, rx: Math.PI / 2 }, { team: true }),
    ...tail(1.3, 0x8a9096), ...gear];
  if (type === 'heavyBomber') return [body(2.3, 0.15, 0x7a7e76), wing(3.4, 0.5, AIR_Y + 0.03, 0.15, PAINT, true), ...[0.55, 1.1, -0.55, -1.1].flatMap((x) => [lp(hull([R([x, AIR_Y - 0.02, -0.15], 0.055, 0.055), R([x, AIR_Y - 0.02, 0.42], 0.065, 0.065)], 4, 0x4a4e48, { side: [1, 0, 0] })), prop(x, 0.44)]),
    ...tail(2.3, 0x7a7e76), ...gear];
  if (type === 'helicopter') return [lp(hull([R([0, 0.32, -0.25], 0.16, 0.14), R([0, 0.32, 0.25], 0.17, 0.15), R([0, 0.28, 0.45], 0, 0)], 4, OLIVE, { side: [1, 0, 0] })), rod(V(0, 0.36, -0.25), V(0, 0.4, -1.0), 0.04, 0.025, 4, OLIVE),
    box(0.34, 0.03, 0.06, PAINT, { y: 0.16, z: 0 }, { team: true }), ...[1, -1].map((s) => rod(V(s * 0.16, 0.16, -0.2), V(s * 0.16, 0.16, 0.3), 0.012, 0.012, 3, GUNMETAL)),
    rod(V(0, 0.5, 0), V(0, 0.58, 0), 0.02, 0.02, 3, GUNMETAL), ...[0.5, -1.07].map((a) => lp(plate([[-0.9, -0.04], [0.9, -0.04], [0.9, 0.04], [-0.9, 0.04]], 0x1a1a1a).rotateX(-Math.PI / 2).rotateY(a), { y: 0.59 })),
    lp(plate([[0, 0], [0.18, 0], [0.04, 0.2]], OLIVE), { y: 0.4, z: -1.0, ry: -Math.PI / 2 })];
  if (type === 'stealthFighter') return [body(1.3, 0.08, 0x3a3e44), lp(plate([[-0.7, -0.3], [0.7, -0.3], [0.1, 0.4], [-0.1, 0.4]], 0x3a3e44), { y: AIR_Y, z: -0.1, rx: Math.PI / 2 }),
    box(0.3, 0.012, 0.06, PAINT, { y: AIR_Y + 0.01, z: 0.1 }, { team: true }), ...[1, -1].map((s) => lp(plate([[0, 0], [0.25, 0], [0.05, 0.22]], 0x3a3e44), { x: s * 0.12, y: AIR_Y, z: -0.6, ry: -Math.PI / 2, rz: s * 0.4 })), ...gear];
  if (type === 'stealthBomber') return [lp(plate([[0, 0.8], [1.6, -0.3], [1.1, -0.45], [0.55, -0.2], [0, -0.45], [-0.55, -0.2], [-1.1, -0.45], [-1.6, -0.3]], 0x2e3036), { y: AIR_Y, rx: Math.PI / 2 }),
    lp(hull([R([0, AIR_Y, -0.4], 0.02, 0.12), R([0, AIR_Y + 0.05, 0.2], 0.08, 0.2), R([0, AIR_Y, 0.75], 0, 0)], 4, 0x2e3036, { side: [1, 0, 0] })), box(0.5, 0.012, 0.05, PAINT, { y: AIR_Y + 0.02, z: 0.3 }, { team: true }), ...gear];
  if (type === 'drone') return [body(0.8, 0.05, 0xb8bcc0), wing(1.6, 0.14, AIR_Y + 0.02, 0.05, 0xb8bcc0, false), ...[1, -1].map((s) => box(0.08, 0.01, 0.15, PAINT, { x: s * 0.76, y: AIR_Y + 0.03, z: 0.05 }, { team: true })),
    ...[1, -1].map((s) => lp(plate([[0, 0], [0.18, 0], [0.04, 0.14]], 0xb8bcc0), { x: s * 0.05, y: AIR_Y, z: -0.38, ry: -Math.PI / 2, rz: s * 0.7 })), prop(0, -0.42), ...gear];
  if (type === 'guidedMissile') return [box(0.3, 0.12, 0.8, OLIVE, { y: 0.06 }), box(0.25, 0.04, 0.9, PAINT, { y: 0.14 }, { team: true }), lp(hull([R([0, 0, -0.5], 0.05), R([0, 0, 0.35], 0.05), R([0, 0, 0.55], 0, 0)], 4, 0xe8e6e0, { side: [1, 0, 0] }), { y: 0.35, rx: -0.35 }),
    ...[1, -1].map((s) => lp(plate([[0, 0], [0.12, 0], [0, 0.12]], 0xc04030), { x: s * 0.04, y: 0.2, z: -0.42, rx: -0.35, ry: s > 0 ? 0 : Math.PI }))];
  // (The bomb on its cradle, fat, finned, a band of the owner's colour; the missile upright on its pad.)
  if (type === 'atomicBomb') return [box(0.5, 0.1, 0.9, OLIVE, { y: 0.05 }), ...[1, -1].map((s) => box(0.04, 0.2, 0.7, OLIVE, { x: s * 0.18, y: 0.18 })),
    lp(hull([R([0, 0, -0.55], 0.06), R([0, 0, -0.3], 0.2), R([0, 0, 0.25], 0.22), R([0, 0, 0.45], 0, 0)], 6, 0x6a7066, { side: [1, 0, 0] }), { y: 0.36 }),
    box(0.46, 0.04, 0.06, PAINT, { y: 0.36, z: 0.05 }, { team: true }), ...[0, Math.PI / 2].map((r) => box(0.36, 0.02, 0.14, 0x4a4e48, { y: 0.36, z: -0.55, rz: r }))];
  if (type === 'nuclearMissile') return [box(0.7, 0.08, 0.7, 0x7a7c78, { y: 0.04 }), ...[0, 1, 2, 3].map((i) => rod(V(Math.cos(i * Math.PI / 2) * 0.28, 0.08, Math.sin(i * Math.PI / 2) * 0.28), V(Math.cos(i * Math.PI / 2) * 0.1, 0.9, Math.sin(i * Math.PI / 2) * 0.1), 0.015, 0.012, 3, GUNMETAL)),
    lp(hull([R([0, 0.12, 0], 0.11), R([0, 1.5, 0], 0.11), R([0, 1.85, 0], 0, 0)], 6, 0xecebe6, { side: [0, 0, 1] })), lp(hull([R([0, 1.0, 0], 0.115), R([0, 1.14, 0], 0.115)], 6, PAINT, { side: [0, 0, 1], caps: [false, false] }), {}, { team: true }),
    ...[0, Math.PI / 2].map((r) => box(0.36, 0.2, 0.02, 0xc04030, { y: 0.24, ry: r }))];
  if (type === 'attackHelicopter') return [...aircraft('helicopter'), ...[1, -1].flatMap((s) => [box(0.3, 0.02, 0.1, OLIVE, { x: s * 0.25, y: 0.3, z: 0.05 }), shape(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5), GUNMETAL, { x: s * 0.36, y: 0.27, z: 0.08, rx: Math.PI / 2 })])];
  if (type === 'fighter') return [body(1.0, 0.09, OLIVE), wing(1.4, 0.3, AIR_Y + 0.22, 0.12, PAINT, true), wing(1.3, 0.28, AIR_Y - 0.06, 0.12, OLIVE, false),
    ...[1, -1].map((s) => rod(V(s * 0.5, AIR_Y - 0.06, 0.12), V(s * 0.5, AIR_Y + 0.22, 0.12), 0.01, 0.01, 3, WOOD)), ...tail(1.0, OLIVE), prop(0, 0.51), ...gear];
  return [body(1.8, 0.13, 0x6a6e66), wing(2.6, 0.45, AIR_Y + 0.02, 0.15, PAINT, true), ...[1, -1].flatMap((s) => [lp(hull([R([s * 0.55, AIR_Y - 0.02, -0.2], 0.06, 0.06), R([s * 0.55, AIR_Y - 0.02, 0.4], 0.07, 0.07)], 4, 0x4a4e48, { side: [1, 0, 0] })), prop(s * 0.55, 0.42)]),
    ...tail(1.8, 0x6a6e66), ...gear];
}

// An anti-aircraft gun: twin barrels raised to the sky on a cross-footed
// mount (a band of the owner's colour), its shield.
function antiAircraft(): THREE.BufferGeometry[] {
  return [
    ...[0, Math.PI / 2].map((r) => box(1.0, 0.06, 0.1, OLIVE, { y: 0.03, ry: r })), shape(new THREE.CylinderGeometry(0.14, 0.18, 0.24, 6), OLIVE, { y: 0.12 }),
    box(0.3, 0.2, 0.26, OLIVE, { y: 0.32 }), box(0.34, 0.05, 0.3, PAINT, { y: 0.44 }, { team: true }),
    ...[1, -1].map((s) => rod(V(s * 0.06, 0.38, 0.05), V(s * 0.06, 0.95, 0.55), 0.022, 0.018, 4, GUNMETAL)),
    box(0.4, 0.22, 0.02, OLIVE, { y: 0.42, z: 0.2, rx: -0.4 }),
  ];
}

const MACHINES: ReadonlySet<UnitKey> = new Set<UnitKey>(['catapult', 'trebuchet', 'cannon', 'gatlingGun', 'artillery', 'antiTank', 'landship', 'tank', 'antiAircraft',
  'fieldCannon', 'modernArmor', 'mechanizedInfantry', 'rocketArtillery', 'mobileSAM', 'privateer', 'shipOfTheLine', 'missileCruiser', 'nuclearSubmarine',
  'stealthFighter', 'stealthBomber', 'attackHelicopter', 'drone', 'guidedMissile', 'atomicBomb', 'nuclearMissile',
  'galley', 'trireme', 'galleass', 'cog', 'caravel', 'frigate', 'ironclad', 'cruiser', 'destroyer', 'battleship', 'submarine', 'carrier',
  'airship', 'fighter', 'jetFighter', 'bomber', 'heavyBomber', 'helicopter']);
export const isMachine = (type: UnitKey): boolean => MACHINES.has(type);

// ---- hair ----
// Hair, drawn apart from the figures (an instanced mesh per style, shared by
// every unit and civ), each figure with its own style and colour (the
// instance colour: hair is all team-tagged white). Modelled on a head on
// foot (a rider's sits RIDER_HEAD higher).
export const RIDER_HEAD = SEAT - HIP;
export const HAIR_STYLES = HAIR_STYLE_KEYS;
export type HairStyle = HairStyleKey;
// The styles each wears, drawn from (repeated: more often), bareheaded and
// under a helmet (only what shows below it: 'bald' there shows none).
export const HAIR_BY: Record<'man' | 'woman', { bare: readonly HairStyle[]; helmet: readonly HairStyle[] }> = {
  man: { bare: ['short', 'short', 'short', 'beard', 'beard', 'bald', 'long', 'tail'], helmet: ['bald', 'bald', 'helmBeard', 'helmLong'] },
  woman: { bare: ['long', 'long', 'bun', 'bun', 'tail', 'tail', 'short'], helmet: ['helmLong', 'helmLong', 'bald'] },
};
export function hairModel(style: HairStyle): THREE.BufferGeometry {
  const g = mergeGeometries(hairShapes(style).map((p) => tag(p, { team: true })), false);
  if (!g) throw new Error(`hairModel: ${style} parts don't merge`);
  return g;
}
// Whether a type's figures wear helmets (their hair then mostly hidden).
// (Always: knights, lancers and modern soldiers; others as their civ goes.)
const HELMETED: ReadonlySet<UnitKey> = new Set<UnitKey>(['horseArcher', 'spearman', 'horseman', 'commander', 'swordsman', 'compositeBowman', 'longswordsman', 'pikeman', 'crossbowman', 'musketman', 'rifleman', 'cavalry']);
export const wearsHelmet = (type: UnitKey, civ: ArchCiv): boolean =>
  type === 'knight' || type === 'lancer' || type === 'infantry' || type === 'machineGun' || type === 'manAtArms' || type === 'explorer' || type === 'greatWarInfantry' || type === 'marine' || type === 'specialForces' || type === 'paratrooper' || (HELMETED.has(type) && GEAR[civ].helmet !== 'none');

// ---- who serves ----
// The share of women among a unit's figures: about half of the civilians
// (settlers, scouts), one soldier in ten; half of everyone once their
// civ has women's suffrage (a civic).
export const WOMEN = { civilian: 0.5, soldier: 0.1, suffrage: 0.5 } as const;
export const womenShare = (type: UnitKey, suffrage: boolean): number =>
  suffrage ? WOMEN.suffrage : UNIT_LOOK[type].party === 'group' ? WOMEN.civilian : WOMEN.soldier;

// What a unit shows, and how many: a formation of up to FORMATION figures
// for fighting units (fewer as it is hurt), a small party for the others.
export const FORMATION = { cols: 4, rows: 3 } as const;
export const FULL_FORMATION = FORMATION.cols * FORMATION.rows;
// Fighting units' figures shown at `hp` (of 100), of `full` at full
// strength: soldiers one per 8 HP or part of it (at most a dozen), machines
// one per a share of it.
export const figuresFor = (hp: number, full = FULL_FORMATION): number =>
  Math.max(1, Math.min(full, full === FULL_FORMATION ? Math.ceil(hp / 8) : Math.ceil((hp * full) / 100)));

// Horsed units show fewer figures (a horse and rider are twice a figure on foot).
export const HORSE_COUNT = 6;
export interface UnitLook {
  readonly party: 'formation' | 'group'; // a fighting formation, or a small party
  readonly count: number;                // figures at full strength
  readonly spacing: readonly [number, number]; // between figures, across and front to back (model units)
  readonly cols?: number;                // a formation's ranks are this wide (default FORMATION.cols)
}
export const UNIT_LOOK: Record<UnitKey, UnitLook> = {
  warrior:  { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  spearman: { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  archer:   { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  horseman: { party: 'formation', count: HORSE_COUNT, cols: 3, spacing: [0.6, 1.05] },
  scout:    { party: 'group', count: 2, spacing: [0.5, 0.5] },
  commander: { party: 'group', count: 2, spacing: [0.75, 0.5] },
  swordsman:   { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  pikeman:     { party: 'formation', count: FULL_FORMATION, spacing: [0.5, 0.55] },
  crossbowman: { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  knight: { party: 'formation', count: HORSE_COUNT, cols: 3, spacing: [0.62, 1.1] },
  settler:  { party: 'group', count: 4, spacing: [0.55, 0.55] },
  musketman: { party: 'formation', count: FULL_FORMATION, spacing: [0.52, 0.58] },
  rifleman:  { party: 'formation', count: FULL_FORMATION, spacing: [0.52, 0.58] },
  infantry:  { party: 'formation', count: FULL_FORMATION, spacing: [0.6, 0.62] },
  cavalry: { party: 'formation', count: HORSE_COUNT, cols: 3, spacing: [0.6, 1.05] },
  cannon:    { party: 'formation', count: 4, cols: 2, spacing: [0.95, 1.3] },
  artillery: { party: 'formation', count: 4, cols: 2, spacing: [1.0, 1.5] },
  tank:      { party: 'formation', count: 4, cols: 2, spacing: [1.1, 1.9] },
  chariotArcher:   { party: 'formation', count: 6, cols: 3, spacing: [0.8, 2.0] },
  compositeBowman: { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  catapult:        { party: 'formation', count: 4, cols: 2, spacing: [1.05, 1.5] },
  longswordsman:   { party: 'formation', count: FULL_FORMATION, spacing: [0.58, 0.62] },
  trebuchet:       { party: 'formation', count: 2, cols: 2, spacing: [1.5, 1.6] },
  lancer:          { party: 'formation', count: HORSE_COUNT, cols: 3, spacing: [0.6, 1.05] },
  gatlingGun:      { party: 'formation', count: 4, cols: 2, spacing: [0.9, 1.2] },
  machineGun:      { party: 'formation', count: FULL_FORMATION, spacing: [0.6, 0.62] },
  antiTank:        { party: 'formation', count: 4, cols: 2, spacing: [1.0, 1.4] },
  landship:        { party: 'formation', count: 4, cols: 2, spacing: [1.2, 2.0] },
  galley:     { party: 'formation', count: 3, cols: 3, spacing: [1.1, 3.0] },
  trireme:    { party: 'formation', count: 3, cols: 3, spacing: [1.2, 3.2] },
  galleass:   { party: 'formation', count: 2, cols: 2, spacing: [1.6, 3.2] },
  caravel:    { party: 'formation', count: 2, cols: 2, spacing: [1.4, 3.0] },
  frigate:    { party: 'formation', count: 2, cols: 2, spacing: [1.6, 3.4] },
  ironclad:   { party: 'formation', count: 2, cols: 2, spacing: [1.4, 3.0] },
  destroyer:  { party: 'formation', count: 2, cols: 2, spacing: [1.3, 3.6] },
  battleship: { party: 'formation', count: 2, cols: 2, spacing: [1.7, 4.2] },
  fighter:    { party: 'formation', count: 3, cols: 3, spacing: [2.0, 1.4] },
  bomber:     { party: 'formation', count: 2, cols: 2, spacing: [3.3, 2.2] },
  cog:        { party: 'formation', count: 2, cols: 2, spacing: [1.4, 3.0] },
  cruiser:    { party: 'formation', count: 2, cols: 2, spacing: [1.5, 3.8] },
  submarine:  { party: 'formation', count: 3, cols: 3, spacing: [1.0, 3.4] },
  carrier:    { party: 'formation', count: 1, cols: 1, spacing: [1.5, 4.5] },
  airship:    { party: 'formation', count: 2, cols: 2, spacing: [1.5, 3.6] },
  heavyBomber: { party: 'formation', count: 2, cols: 2, spacing: [4.1, 2.8] },
  jetFighter: { party: 'formation', count: 3, cols: 3, spacing: [2.0, 1.8] },
  helicopter: { party: 'formation', count: 3, cols: 3, spacing: [2.4, 2.4] },
  antiAircraft: { party: 'formation', count: 4, cols: 2, spacing: [1.1, 1.2] },
  slinger:          { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  horseArcher:      { party: 'formation', count: HORSE_COUNT, cols: 3, spacing: [0.6, 1.05] },
  manAtArms:        { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  explorer:         { party: 'group', count: 2, spacing: [0.5, 0.5] },
  fieldCannon:      { party: 'formation', count: 4, cols: 2, spacing: [0.85, 1.2] },
  greatWarInfantry: { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  marine:           { party: 'formation', count: FULL_FORMATION, spacing: [0.6, 0.62] },
  mechanizedInfantry: { party: 'formation', count: 4, cols: 2, spacing: [1.0, 1.7] },
  specialForces:    { party: 'formation', count: 8, cols: 4, spacing: [0.6, 0.62] },
  paratrooper:      { party: 'formation', count: FULL_FORMATION, spacing: [0.6, 0.62] },
  modernArmor:      { party: 'formation', count: 4, cols: 2, spacing: [1.1, 1.9] },
  rocketArtillery:  { party: 'formation', count: 4, cols: 2, spacing: [1.0, 1.6] },
  mobileSAM:        { party: 'formation', count: 4, cols: 2, spacing: [1.0, 1.6] },
  privateer:        { party: 'formation', count: 2, cols: 2, spacing: [1.4, 3.0] },
  shipOfTheLine:    { party: 'formation', count: 2, cols: 2, spacing: [1.7, 3.6] },
  missileCruiser:   { party: 'formation', count: 2, cols: 2, spacing: [1.5, 3.8] },
  nuclearSubmarine: { party: 'formation', count: 2, cols: 2, spacing: [1.2, 4.0] },
  stealthFighter:   { party: 'formation', count: 3, cols: 3, spacing: [2.0, 1.8] },
  stealthBomber:    { party: 'formation', count: 2, cols: 2, spacing: [3.9, 2.0] },
  attackHelicopter: { party: 'formation', count: 3, cols: 3, spacing: [2.4, 2.4] },
  drone:            { party: 'formation', count: 3, cols: 3, spacing: [2.1, 1.3] },
  guidedMissile:    { party: 'formation', count: 2, cols: 2, spacing: [0.8, 1.4] },
  atomicBomb:       { party: 'formation', count: 1, cols: 1, spacing: [1, 1] },
  nuclearMissile:   { party: 'formation', count: 1, cols: 1, spacing: [1, 1] },
};
// A unit's figures at full strength, and its formation's width.
export const fullCount = (type: UnitKey): number => UNIT_LOOK[type].count;
export const colsOf = (type: UnitKey, n: number): number => {
  const look = UNIT_LOOK[type];
  return look.party === 'formation' ? look.cols ?? FORMATION.cols : Math.ceil(Math.sqrt(n));
};

// Where a unit's figures stand (model units: x across, z forward, around
// its middle), so many as it shows at `hp`: in ranks, the front one full
// first (a hurt formation loses men from the back); a party loosely.
// `rand` jitters them (none: exact ranks).
export function formationSlots(type: UnitKey, hp: number, rand?: () => number): [number, number][] {
  const look = UNIT_LOOK[type];
  const n = look.party === 'formation' ? figuresFor(hp, look.count) : look.count;
  const cols = colsOf(type, look.count);
  const rows = Math.ceil(look.count / cols);
  const jitter = look.party === 'group' ? 0.35 : 0.08, j = () => (rand ? (rand() - 0.5) * jitter : 0);
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = r === Math.floor((n - 1) / cols) ? n - r * cols : cols;
    return [(c - (inRow - 1) / 2 + j()) * look.spacing[0], ((rows - 1) / 2 - r + j()) * look.spacing[1]];
  });
}

// One figure of a unit type, dressed for a civ (each instance draws its own
// horse coat from a few: the variant).
export function unitModel(type: UnitKey, civ: ArchCiv, variant = 0, female = false): THREE.BufferGeometry {
  const gear = GEAR[civ];
  const parts = (() => {
    switch (type) {
      case 'warrior': return figure(gear, 'club', true, { helmet: false, female });
      case 'spearman': return figure(gear, 'spear', true, { helmet: true, female });
      case 'archer': return figure(gear, 'bow', false, { helmet: false, quiver: true, female });
      case 'horseman': return rider(gear, HORSE[variant % HORSE.length]!, female, 'horseman');
      case 'chariotArcher': return chariot(gear, HORSE[variant % HORSE.length]!, female);
      case 'compositeBowman': return figure(gear, 'recurve', false, { helmet: true, quiver: true, female });
      case 'catapult': return catapult();
      case 'longswordsman': return figure(gear, 'longsword', false, { helmet: true, female });
      case 'trebuchet': return trebuchet();
      case 'lancer': return rider(gear, HORSE[variant % HORSE.length]!, female, 'lancer');
      case 'gatlingGun': return gatling();
      case 'machineGun': return figure(gear, 'mg', false, { helmet: true, female, modern: true });
      case 'antiTank': return antiTank();
      case 'landship': return landship();
      case 'galley': case 'trireme': case 'galleass': case 'cog': case 'caravel': case 'frigate': case 'ironclad': case 'cruiser': case 'destroyer': case 'battleship':
      case 'submarine': case 'carrier': return ship(type);
      case 'fighter': case 'jetFighter': case 'bomber': case 'heavyBomber': case 'airship': case 'helicopter': return aircraft(type);
      case 'antiAircraft': return antiAircraft();
      case 'slinger': return figure(gear, 'sling', false, { helmet: false, female });
      case 'horseArcher': return horseArcher(gear, HORSE[variant % HORSE.length]!, female);
      case 'manAtArms': return figure(gear, 'sword', true, { helmet: true, helmetAs: HEAVY_HELMET(gear.helmet), shieldAs: 'kite', female });
      case 'explorer': return figure(gear, 'staff', false, { helmet: true, helmetAs: 'hat', pack: true, female, civilian: true });
      case 'fieldCannon': return fieldCannon();
      case 'greatWarInfantry': return figure(gear, 'rifle', false, { helmet: true, female, modern: true });
      case 'marine': return figure(gear, 'rifle', false, { helmet: true, helmetAs: 'cap', female, modern: true, pack: true });
      case 'mechanizedInfantry': return apc();
      case 'specialForces': return figure(gear, 'mg', false, { helmet: true, helmetAs: 'beret', female, modern: true });
      case 'paratrooper': return figure(gear, 'rifle', false, { helmet: true, helmetAs: 'kettle', female, modern: true, pack: true, quiver: false });
      case 'modernArmor': return modernArmor();
      case 'rocketArtillery': return rocketArtillery();
      case 'mobileSAM': return mobileSAM();
      case 'privateer': case 'shipOfTheLine': case 'missileCruiser': case 'nuclearSubmarine': return ship(type);
      case 'stealthFighter': case 'stealthBomber': case 'attackHelicopter': case 'drone': case 'guidedMissile': case 'atomicBomb': case 'nuclearMissile': return aircraft(type);
      case 'scout': return figure(gear, 'staff', false, { helmet: false, pack: true, female, civilian: true });
      case 'settler': return figure(gear, variant % 2 ? 'staff' : 'none', false, { pack: variant % 2 === 0, female, civilian: true });
      // (Its two figures: the commander mounted, and the standard-bearer.)
      case 'swordsman': return figure(gear, 'sword', true, { helmet: true, female });
      case 'pikeman': return figure(gear, 'pike', false, { helmet: true, female });
      case 'crossbowman': return figure(gear, 'crossbow', false, { helmet: true, quiver: true, female });
      case 'knight': return rider(gear, HORSE[variant % HORSE.length]!, female, 'knight');
      case 'musketman': return figure(gear, 'musket', false, { helmet: true, female });
      case 'rifleman': return figure(gear, 'rifle', false, { helmet: true, female });
      case 'infantry': return figure(gear, 'rifle', false, { helmet: true, female, modern: true, pack: true });
      case 'cavalry': return rider(gear, HORSE[variant % HORSE.length]!, female, 'cavalry');
      case 'cannon': return cannon(false);
      case 'artillery': return cannon(true);
      case 'tank': return tank();
      case 'commander': return variant === 0 ? rider(gear, HORSE[0], female, 'officer') : figure(gear, 'banner', false, { helmet: true, female });
    }
  })();
  // (Every part tagged, none with a leaf mask: their attributes must match.)
  const g = mergeGeometries(parts.map((p) => (p.getAttribute('aLimb') && !p.getAttribute('leafMask') ? p : tag(p))), false);
  if (!g) throw new Error(`unitModel: ${type} parts don't merge`);
  return g;
}
// How many variants of a type's model there are (instances pick among them).
const HORSED: ReadonlySet<UnitKey> = new Set<UnitKey>(['horseman', 'chariotArcher', 'horseArcher', 'knight', 'lancer', 'cavalry']);
export const unitVariants = (type: UnitKey): number => (HORSED.has(type) ? HORSE.length : type === 'settler' || type === 'commander' ? 2 : 1);
// The model variant of a unit's i-th figure (a commander's are set: first
// the commander, then the standard-bearer; others drawn).
export const variantOf = (type: UnitKey, i: number, rand: () => number): number =>
  type === 'commander' ? i % 2 : Math.floor(rand() * unitVariants(type));
// Whether a figure is horsed (its shadow longer), and where its head is
// (hair: over a figure on foot's, up and forward or back in model units):
// a rider's up in the saddle, a chariot archer's back in the car.
export const rides = (type: UnitKey, variant: number): boolean => HORSED.has(type) || (type === 'commander' && variant === 0);
export const headOffset = (type: UnitKey, variant: number): readonly [number, number] =>
  type === 'chariotArcher' ? [CAR_FLOOR, CAR_Z] : rides(type, variant) ? [RIDER_HEAD, 0] : [0, 0];
