import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, seg, tf, V, type Tf } from './propCatalog.ts';
import { person, riderBody, handAt, hairShapes, headShell, HAIR_STYLE_KEYS, HIP, SHOULDER, HEAD_Y, HANG, HOLD, RAISE, SHIELD, type ArmPose, type Dress, type Part, type HairStyleKey } from './people.ts';
import { horseParts } from './creatures.ts';
import { hull, plate, R } from './lowpoly.ts';
import type { ArchCiv } from './architecture.ts';
import type { UnitKey } from './rules.ts';

// Unit figurines: painted miniatures, as the props and houses are, one model
// per unit type and civ. A model is one figure (a soldier, a rider on his
// horse, a settler) about 1 tall, standing on y = 0 and facing +z; the unit
// view (unitView.ts) shows it a dozen times over in formation.
//
// Besides its colours (a `color` attribute, as the props), each vertex says:
//   aTeam  1 on what is painted in the owner's colour (tunic, shield face,
//          plume, horse cloth): the instance colour, shaded by `color`;
//   aSkin  1 on skin: each figure's own skin tone (an instance attribute);
//   aLimb  how it moves: (side, pivot height, amplitude), turning about the
//          pivot. A side of +1 or -1 swings that way round on the march
//          (left and right legs, a horse's diagonal pairs, arms against the
//          legs); STRIKE thrusts forward in a fight (the weapon arm and its
//          weapon, the bow raised); 0 never moves.
// Hair is drawn apart (hairModel): each figure gets its own style and colour.
//
// Each civ dresses its soldiers its own way (GEAR): the shape of their
// shields and helmets, their legs bare or trousered.

export type Shield = 'round' | 'big round' | 'scutum' | 'kite' | 'oval' | 'pavise' | 'small';
export type Helmet = 'crest' | 'cone' | 'kettle' | 'hat' | 'feather' | 'turban' | 'cap' | 'none';
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

type Tag = { team?: boolean; skin?: boolean; limb?: readonly [number, number, number] };
function tag(g: THREE.BufferGeometry, t: Tag = {}): THREE.BufferGeometry {
  if (g.getAttribute('leafMask')) g.deleteAttribute('leafMask');
  const n = g.getAttribute('position').count;
  const team = new Float32Array(n).fill(t.team ? 1 : 0), skin = new Float32Array(n).fill(t.skin ? 1 : 0), limb = new Float32Array(n * 3);
  if (t.limb) for (let i = 0; i < n; i++) limb.set(t.limb, i * 3);
  g.setAttribute('aTeam', new THREE.BufferAttribute(team, 1));
  g.setAttribute('aSkin', new THREE.BufferAttribute(skin, 1));
  g.setAttribute('aLimb', new THREE.BufferAttribute(limb, 3));
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

type Hold = 'spear' | 'pike' | 'club' | 'sword' | 'bow' | 'crossbow' | 'musket' | 'rifle' | 'staff' | 'banner' | 'none';

// A body (people.ts) tagged for the units' shader.
const tagged = (parts: readonly Part[]): THREE.BufferGeometry[] => parts.map((p) => tag(p.geo, { team: p.tag === 'team', skin: p.tag === 'skin', ...(p.limb ? { limb: p.limb } : {}) }));
const v3 = (p: THREE.Vector3) => V(p.x, p.y, p.z);

// A figure on foot (people.ts), dressed for its civ and armed. `hold`:
// what the right hand carries (it then stops swinging); `shield`: on the
// left arm, or none; `pack`: a bundle on the back. `female`: a woman's
// build (a civilian's skirt to the ankles). `modern`: a modern soldier
// (trousers, a steel helmet whatever the civ wore).
// (The figure faces +z: its right hand is at -x.)
function figure(gear0: Gear, hold: Hold, shield: boolean, opts: { helmet?: boolean; pack?: boolean; quiver?: boolean; female?: boolean; civilian?: boolean; modern?: boolean } = {}): THREE.BufferGeometry[] {
  const gear: Gear = opts.modern ? { ...gear0, legs: 0x4a4e44, helmet: 'kettle' } : gear0;
  const f = opts.female === true;
  const dress: Dress = {
    female: f, skirt: opts.modern ? 'none' : opts.civilian && f ? 'ankle' : 'knee', legs: gear.legs,
    sleeves: gear.legs === 'bare' && !opts.modern ? 'short' : 'long',
  };
  // The arms: the right one carries the weapon, the left the shield (or the bow).
  const armR: ArmPose = hold === 'none' ? HANG : hold === 'bow' ? HANG : hold === 'club' || hold === 'sword' ? HOLD : HOLD;
  const armL: ArmPose = shield ? SHIELD : hold === 'bow' ? RAISE : hold === 'crossbow' || hold === 'musket' || hold === 'rifle' ? HOLD : HANG;
  const strike = hold === 'spear' || hold === 'pike' ? HIT(SHOULDER, 1.1) : hold === 'club' || hold === 'sword' ? HIT(SHOULDER, 1.5)
    : hold === 'crossbow' || hold === 'musket' || hold === 'rifle' ? HIT(SHOULDER, 0.9) : null;
  const bowUp = HIT(SHOULDER, 1.3); // (an archer raises his bow to loose)
  const freeL = !shield && hold !== 'bow' && hold !== 'crossbow' && hold !== 'musket' && hold !== 'rifle';
  const out = tagged(person(dress, armL, armR, {
    legs: (side) => LEG(side),
    arms: (side) => (side === -1 ? (hold === 'none' ? ARM(-1) : strike ?? undefined) : freeL ? ARM(1) : hold === 'bow' ? bowUp : undefined),
  }));
  const hR = handAt(-1, armR, f), hL = handAt(1, armL, f);
  const w: Tag = strike ? { limb: strike } : {};
  const up = (d: number) => v3(hR).add(V(0, d, 0));
  if (hold === 'spear') out.push(rod(up(-0.42), up(0.86), 0.012, 0.011, 5, WOOD, w), point(0.11, 0.026, 3, METAL, { x: hR.x, y: hR.y + 0.86, z: hR.z }, w));
  if (hold === 'pike') out.push(rod(up(-0.4), up(1.25), 0.012, 0.011, 5, WOOD, w), point(0.13, 0.024, 3, METAL, { x: hR.x, y: hR.y + 1.25, z: hR.z }, w));
  if (hold === 'club') out.push(rod(v3(hR).add(V(0, -0.04, -0.02)), v3(hR).add(V(-0.02, 0.3, 0.08)), 0.012, 0.028, 6, WOOD, w));
  if (hold === 'sword') out.push(rod(v3(hR).add(V(-0.04, 0.04, 0.01)), v3(hR).add(V(0.04, 0.04, 0.01)), 0.008, 0.008, 4, METAL, w), rod(v3(hR).add(V(0, 0.04, 0.01)), v3(hR).add(V(0, 0.4, 0.1)), 0.016, 0.005, 4, METAL, w));
  if (hold === 'staff') out.push(rod(up(-0.42), up(0.6), 0.013, 0.011, 5, WOOD));
  // (A long gun held across the body, its muzzle up; a rifle's with a bayonet.)
  if (hold === 'musket' || hold === 'rifle') {
    const butt = v3(hR).add(V(0, -0.08, -0.03)), muzzle = v3(hL).add(V(0, 0.36, 0.06));
    out.push(rod(butt, v3(hL), 0.02, 0.016, 5, WOOD, w), rod(v3(hL), muzzle, 0.011, 0.011, 5, METAL, w));
    if (hold === 'rifle') out.push(rod(muzzle, muzzle.clone().add(muzzle.clone().sub(v3(hL)).normalize().multiplyScalar(0.14)), 0.006, 0.0015, 4, METAL, w));
  }
  if (hold === 'crossbow') {
    const stock0 = v3(hR).add(V(0, 0.02, -0.06)), tip = v3(hL).add(V(0, 0.04, 0.16));
    out.push(rod(stock0, tip, 0.02, 0.016, 5, WOOD, w), rod(tip.clone().add(V(-0.17, 0, -0.03)), tip.clone().add(V(0.17, 0, -0.03)), 0.01, 0.01, 4, WOOD, w));
  }
  if (hold === 'banner') {
    // A tall pole with the owner's banner hanging from a crossbar, a finial on top.
    out.push(rod(up(-0.42), up(1.22), 0.016, 0.014, 5, WOOD), rod(up(1.1).add(V(0, 0, -0.22)), up(1.1).add(V(0, 0, 0.22)), 0.01, 0.01, 4, WOOD),
      lp(plate([[0, 0.21], [0.44, 0.21], [0.44, -0.21], [0, -0.21]], PAINT), { x: hR.x, y: hR.y + 0.88, z: hR.z - 0.22, ry: -Math.PI / 2 }, { team: true }), ball(0.03, 0xd8b440, { x: hR.x, y: hR.y + 1.24, z: hR.z }));
  }
  if (hold === 'bow') {
    // A bow in the left hand: two limbs bent forward from the grip, and the string.
    const g = v3(hL);
    out.push(rod(g, g.clone().add(V(0, 0.36, -0.06)), 0.011, 0.007, 4, WOOD, { limb: bowUp }), rod(g, g.clone().add(V(0, -0.36, -0.06)), 0.011, 0.007, 4, WOOD, { limb: bowUp }),
      rod(g.clone().add(V(0, 0.36, -0.06)), g.clone().add(V(0, -0.36, -0.06)), 0.003, 0.003, 3, 0xd8d0c0, { limb: bowUp }));
  }
  if (opts.quiver) out.push(lp(hull([R([0, 0, 0], 0.032), R([0, 0.3, 0], 0.036)], 4, LEATHER, { caps: [true, false] }), { x: 0.06, y: 0.5, z: -0.09, rz: -0.35 }),
    ...[0].map((dx) => rod(V(0.06 + dx - 0.1, 0.78, -0.09), V(0.06 + dx - 0.12, 0.84, -0.095), 0.006, 0.006, 3, 0xd8d0c0)));
  if (opts.pack) out.push(box(0.2, 0.22, 0.1, 0x9a8462, { y: 0.62, z: -0.11 }), rod(V(-0.11, 0.77, -0.1), V(0.11, 0.77, -0.1), 0.022, 0.022, 4, 0x6a5440));
  if (shield) out.push(...shieldOf(gear.shield, hL));
  if (opts.helmet) out.push(...helmetOf(gear.helmet));
  return out;
}

// The shield on the left forearm, its face painted (team), standing
// forward: a flat polygon (both faces drawn) and its boss.
function shieldOf(s: Shield, hand: THREE.Vector3): THREE.BufferGeometry[] {
  const at: Tf = { x: hand.x - 0.02, y: hand.y + 0.02, z: hand.z + 0.035 };
  const boss = point(0.025, 0.026, 3, METAL, { ...at, z: (at.z ?? 0) + 0.004, rx: Math.PI / 2 });
  const ngon = (r: number, sy = 1, n = 8) => lp(plate(Array.from({ length: n }, (_, i) => [Math.cos((i + 0.5) * 2 * Math.PI / n) * r, Math.sin((i + 0.5) * 2 * Math.PI / n) * r * sy] as const), PAINT), at, { team: true });
  switch (s) {
    case 'round': return [ngon(0.16), boss];
    case 'big round': return [ngon(0.2), boss];
    case 'small': return [ngon(0.11), boss];
    case 'oval': return [ngon(0.12, 1.6), boss];
    case 'scutum': return [shape(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 3, 1, true, -0.62, 1.24).rotateY(Math.PI), PAINT, { ...at, z: (at.z ?? 0) + 0.18, y: (at.y ?? 0) - 0.02 }, { team: true }), boss];
    case 'pavise': return [box(0.26, 0.46, 0.025, PAINT, { ...at, y: (at.y ?? 0) - 0.03 }, { team: true })];
    case 'kite': return [lp(plate([[-0.12, 0.14], [0.12, 0.14], [0.11, -0.03], [0, -0.29], [-0.11, -0.03]], PAINT), at, { team: true }), boss];
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
    case 'none': return [];
  }
}

// A rider on his horse (creatures.ts; the horse's legs swing in diagonal
// pairs). `officer`: a commander's (a cape and a plume in the owner's
// colour, no lance); `heavy`: a knight's (the horse in a long cloth, a
// helmet whatever the civ wears); `saber`: a cavalryman's (a sabre for
// the lance).
export const HORSE_SCALE = 0.58;
const SEAT = 1.47 * HORSE_SCALE + 0.02;
function rider(gear: Gear, coat: number, female: boolean, officer = false, heavy = false, saber = false): THREE.BufferGeometry[] {
  const h = horseParts();
  // (Turned to face +z, scaled, its coat painted: the creature's leaf parts take `coat`.)
  const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeScale(HORSE_SCALE, HORSE_SCALE, HORSE_SCALE));
  const paint = (g: THREE.BufferGeometry) => { coatIt(g, coat); return g.applyMatrix4(m); };
  const LEG_TOP = 1.05 * HORSE_SCALE, HORSE_LEG = (side: number) => [side, LEG_TOP, 0.4] as const;
  const out: THREE.BufferGeometry[] = [
    ...h.body.map((g) => tag(paint(g))),
    tag(paint(h.legs.fl), { limb: HORSE_LEG(1) }), tag(paint(h.legs.fr), { limb: HORSE_LEG(-1) }),
    tag(paint(h.legs.hl), { limb: HORSE_LEG(-1) }), tag(paint(h.legs.hr), { limb: HORSE_LEG(1) }),
    // The saddle cloth, in the owner's colour, and the saddle on it.
    ...(heavy ? [] : [shape(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 4, 1, true, -1.2, 2.4).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), CLOTH, { y: SEAT - 0.17, z: 0.02 }, { team: true })]),
    box(0.16, 0.05, 0.22, LEATHER, { y: SEAT - 0.03, z: 0.02 }),
  ];
  const dress: Dress = { female, legs: gear.legs, sleeves: 'long' };
  const lance = !officer && !saber;
  const armR: ArmPose = HOLD, armL: ArmPose = HOLD;
  out.push(...tagged(riderBody(dress, SEAT, armL, armR)));
  const hR = handAt(-1, armR, female).add(V(0, SEAT - HIP, 0));
  if (officer) out.push(lp(plate([[-0.12, 0.2], [0.12, 0.2], [0.14, -0.2], [-0.14, -0.2]], CLOTH), { y: SEAT + 0.12, z: -0.11, rx: 0.12 }, { team: true }), box(0.024, 0.11, 0.15, PAINT, { y: SEAT - HIP + HEAD_Y + 0.12 + (gear.helmet === 'none' ? -0.03 : 0.04) }, { team: true }));
  else if (saber) out.push(rod(hR, hR.clone().add(V(0, 0.42, 0.18)), 0.014, 0.005, 4, METAL, { limb: HIT(SEAT + 0.3, 0.9) }));
  if (lance) out.push(rod(hR.clone().add(V(0, -0.15, -0.35)), hR.clone().add(V(0, 0.55, 0.75)), 0.011, 0.009, 5, WOOD, { limb: HIT(SEAT + 0.3, 0.6) }), point(0.1, 0.02, 3, METAL, { x: hR.x, y: hR.y + 0.55, z: hR.z + 0.75, rx: 1.0 }));
  out.push(...helmetOf(heavy && (gear.helmet === 'none' || gear.helmet === 'cap' || gear.helmet === 'turban' || gear.helmet === 'feather' || gear.helmet === 'hat') ? 'kettle' : gear.helmet).map((g) => g.translate(0, RIDER_HEAD, 0)));
  if (heavy) out.push(tag(caparison(), { team: true }));
  return out;
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
export const isMachine = (type: UnitKey): boolean => type === 'cannon' || type === 'artillery' || type === 'tank';

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
export const wearsHelmet = (type: UnitKey, civ: ArchCiv): boolean =>
  type === 'knight' || type === 'infantry' || ((type === 'spearman' || type === 'horseman' || type === 'commander' || type === 'swordsman' || type === 'pikeman'
    || type === 'crossbowman' || type === 'musketman' || type === 'rifleman' || type === 'cavalry') && GEAR[civ].helmet !== 'none');

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
  horseman: { party: 'formation', count: FULL_FORMATION, spacing: [0.6, 1.05] },
  scout:    { party: 'group', count: 2, spacing: [0.5, 0.5] },
  commander: { party: 'group', count: 2, spacing: [0.75, 0.5] },
  swordsman:   { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  pikeman:     { party: 'formation', count: FULL_FORMATION, spacing: [0.5, 0.55] },
  crossbowman: { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  knight:      { party: 'formation', count: FULL_FORMATION, spacing: [0.62, 1.1] },
  settler:  { party: 'group', count: 4, spacing: [0.55, 0.55] },
  musketman: { party: 'formation', count: FULL_FORMATION, spacing: [0.52, 0.58] },
  rifleman:  { party: 'formation', count: FULL_FORMATION, spacing: [0.52, 0.58] },
  infantry:  { party: 'formation', count: FULL_FORMATION, spacing: [0.6, 0.62] },
  cavalry:   { party: 'formation', count: FULL_FORMATION, spacing: [0.6, 1.05] },
  cannon:    { party: 'formation', count: 4, cols: 2, spacing: [0.95, 1.3] },
  artillery: { party: 'formation', count: 4, cols: 2, spacing: [1.0, 1.5] },
  tank:      { party: 'formation', count: 4, cols: 2, spacing: [1.1, 1.9] },
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
      case 'horseman': return rider(gear, HORSE[variant % HORSE.length]!, female);
      case 'scout': return figure(gear, 'staff', false, { helmet: false, pack: true, female, civilian: true });
      case 'settler': return figure(gear, variant % 2 ? 'staff' : 'none', false, { pack: variant % 2 === 0, female, civilian: true });
      // (Its two figures: the commander mounted, and the standard-bearer.)
      case 'swordsman': return figure(gear, 'sword', true, { helmet: true, female });
      case 'pikeman': return figure(gear, 'pike', false, { helmet: true, female });
      case 'crossbowman': return figure(gear, 'crossbow', false, { helmet: true, quiver: true, female });
      case 'knight': return rider(gear, HORSE[variant % HORSE.length]!, female, false, true);
      case 'musketman': return figure(gear, 'musket', false, { helmet: true, female });
      case 'rifleman': return figure(gear, 'rifle', false, { helmet: true, female });
      case 'infantry': return figure(gear, 'rifle', false, { helmet: true, female, modern: true, pack: true });
      case 'cavalry': return rider(gear, HORSE[variant % HORSE.length]!, female, false, false, true);
      case 'cannon': return cannon(false);
      case 'artillery': return cannon(true);
      case 'tank': return tank();
      case 'commander': return variant === 0 ? rider(gear, HORSE[0], female, true) : figure(gear, 'banner', false, { helmet: true, female });
    }
  })();
  // (Every part tagged, none with a leaf mask: their attributes must match.)
  const g = mergeGeometries(parts.map((p) => (p.getAttribute('aTeam') && !p.getAttribute('leafMask') ? p : tag(p))), false);
  if (!g) throw new Error(`unitModel: ${type} parts don't merge`);
  return g;
}
// How many variants of a type's model there are (instances pick among them).
export const unitVariants = (type: UnitKey): number => (type === 'horseman' || type === 'knight' || type === 'cavalry' ? HORSE.length : type === 'settler' || type === 'commander' ? 2 : 1);
// The model variant of a unit's i-th figure (a commander's are set: first
// the commander, then the standard-bearer; others drawn).
export const variantOf = (type: UnitKey, i: number, rand: () => number): number =>
  type === 'commander' ? i % 2 : Math.floor(rand() * unitVariants(type));
// Whether a figure rides (its head higher, its shadow longer).
export const rides = (type: UnitKey, variant: number): boolean => type === 'horseman' || type === 'knight' || type === 'cavalry' || (type === 'commander' && variant === 0);
