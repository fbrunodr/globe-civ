import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, seg, tf, V, type Tf } from './propCatalog.ts';
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
const METAL = 0x9a9ca2, WOOD = 0x7a5a3a, LEATHER = 0x6a4a30, SKIN = 0xffffff, HAIR = 0x3a2a20; // (HAIR: a horse's tail)
const HORSE = [0x6a4a32, 0x8a6a4a, 0x4a3a2e, 0xb8a888] as const;

type Tag = { team?: boolean; skin?: boolean; limb?: readonly [number, number, number] };
function tag(g: THREE.BufferGeometry, t: Tag = {}): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const team = new Float32Array(n).fill(t.team ? 1 : 0), skin = new Float32Array(n).fill(t.skin ? 1 : 0), limb = new Float32Array(n * 3);
  if (t.limb) for (let i = 0; i < n; i++) limb.set(t.limb, i * 3);
  g.setAttribute('aTeam', new THREE.BufferAttribute(team, 1));
  g.setAttribute('aSkin', new THREE.BufferAttribute(skin, 1));
  g.setAttribute('aLimb', new THREE.BufferAttribute(limb, 3));
  return g;
}
const shape = (geo: THREE.BufferGeometry, color: number, o: Tf, t?: Tag) => tag(part(geo, color, tf(o)), t);
const ball = (r: number, color: number, o: Tf, t?: Tag) => shape(new THREE.IcosahedronGeometry(r, 0), color, o, t);
const box = (w: number, h: number, d: number, color: number, o: Tf, t?: Tag) => shape(new THREE.BoxGeometry(w, h, d), color, o, t);
const rod = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, n: number, color: number, t?: Tag) => tag(seg(a, b, r0, r1, n, color), t);
const flat = (geo: THREE.BufferGeometry, color: number, o: Tf, t?: Tag) => shape(geo, color, o, t);

// The march: legs swing from the hip, arms against them from the shoulder.
const HIP = 0.44, SHOULDER = 0.72;
const LEG = (side: number) => [side, HIP, 0.45] as const;
const ARM = (side: number) => [-side, SHOULDER, 0.35] as const;
// In a fight: the weapon arm thrusts (and its weapon with it) about the shoulder.
export const STRIKE = 2;
const HIT = (pivot: number, amp: number) => [STRIKE, pivot, amp] as const;

type Hold = 'spear' | 'club' | 'bow' | 'staff' | 'banner' | 'none';

// A figure on foot. `hold`: what the right hand carries (it then stops
// swinging); `shield`: on the left arm, or none; `pack`: a bundle on the back.
// `female`: a woman's build (slimmer at the shoulders, her tunic longer;
// a civilian's to the ankles).
function figure(gear: Gear, hold: Hold, shield: boolean, opts: { helmet?: boolean; pack?: boolean; quiver?: boolean; female?: boolean; civilian?: boolean } = {}): THREE.BufferGeometry[] {
  const f = opts.female === true, shoulder = f ? 0.13 : 0.15, skirt = f ? (opts.civilian ? 0.34 : 0.26) : 0.2;
  const legColor = gear.legs === 'bare' ? SKIN : gear.legs;
  const legTag = (side: number): Tag => ({ skin: gear.legs === 'bare', limb: LEG(side) });
  const out: THREE.BufferGeometry[] = [
    // Legs (a tapered post each, the foot dark).
    shape(new THREE.CylinderGeometry(0.045, 0.055, HIP, 4, 1, true).translate(0, HIP / 2, 0), legColor, { x: 0.065 }, legTag(1)),
    shape(new THREE.CylinderGeometry(0.045, 0.055, HIP, 4, 1, true).translate(0, HIP / 2, 0), legColor, { x: -0.065 }, legTag(-1)),
    box(0.07, 0.04, 0.12, LEATHER, { x: 0.065, y: 0.02, z: 0.02 }, { limb: LEG(1) }),
    box(0.07, 0.04, 0.12, LEATHER, { x: -0.065, y: 0.02, z: 0.02 }, { limb: LEG(-1) }),
    // Tunic: a flared skirt (to the knees, longer on a woman) and the body above it.
    shape(new THREE.CylinderGeometry(f ? 0.1 : 0.115, f ? 0.17 : 0.16, skirt, 6, 1, true).translate(0, skirt / 2, 0), CLOTH, { y: 0.5 - skirt }, { team: true }),
    shape(new THREE.CylinderGeometry(f ? 0.105 : 0.13, f ? 0.1 : 0.115, 0.26, 6, 1, false).translate(0, 0.13, 0), CLOTH, { y: 0.48 }, { team: true }),
    // Head and hair.
    ball(0.085, SKIN, { y: 0.84 }, { skin: true }),
  ];
  // Arms: the left one carries the shield (or the bow), the right one the weapon.
  const swingL = !shield && hold !== 'bow', swingR = hold === 'none';
  const bowUp = HIT(SHOULDER, 1.3); // (an archer raises his bow to loose)
  out.push(rod(V(-shoulder, SHOULDER, 0), V(-shoulder - 0.03, 0.46, shield || hold === 'bow' ? 0.08 : 0.02), 0.035, 0.03, 3, CLOTH, { team: true, ...(swingL ? { limb: ARM(-1) } : hold === 'bow' ? { limb: bowUp } : {}) }));
  // (A spear dips forward in a fight, a club swings down hard.)
  const strike = hold === 'spear' ? HIT(SHOULDER, 1.1) : hold === 'club' ? HIT(SHOULDER, 1.5) : null;
  const armR = swingR ? { limb: ARM(1) } : strike ? { limb: strike } : {};
  out.push(rod(V(shoulder, SHOULDER, 0), V(shoulder + 0.03, 0.46, hold === 'none' ? 0.02 : 0.08), 0.035, 0.03, 3, CLOTH, { team: true, ...armR }));
  const w: Tag = strike ? { limb: strike } : {};
  if (hold === 'spear') out.push(rod(V(0.19, 0.12, 0.09), V(0.19, 1.32, 0.09), 0.014, 0.012, 3, WOOD, w), shape(new THREE.ConeGeometry(0.03, 0.12, 4, 1, true).translate(0, 0.06, 0), METAL, { x: 0.19, y: 1.32, z: 0.09 }, w));
  if (hold === 'club') out.push(rod(V(0.19, 0.42, 0.1), V(0.24, 0.8, 0.22), 0.022, 0.045, 4, WOOD, w));
  if (hold === 'staff') out.push(rod(V(0.19, 0.02, 0.1), V(0.19, 1.05, 0.1), 0.015, 0.013, 3, WOOD));
  if (hold === 'banner') {
    // A tall pole with the owner's banner hanging from a crossbar, a finial on top.
    out.push(rod(V(0.19, 0.05, 0.1), V(0.19, 1.75, 0.1), 0.018, 0.015, 4, WOOD), rod(V(0.19, 1.62, -0.12), V(0.19, 1.62, 0.32), 0.012, 0.012, 3, WOOD),
      box(0.02, 0.42, 0.44, PAINT, { x: 0.19, y: 1.4, z: 0.1 }, { team: true }), ball(0.035, 0xd8b440, { x: 0.19, y: 1.78, z: 0.1 }));
  }
  if (hold === 'bow') {
    // A bow in the left hand: two limbs bent forward from the grip, and the string.
    const grip = V(-0.19, 0.55, 0.12);
    out.push(rod(grip, V(-0.19, 0.95, 0.06), 0.012, 0.008, 3, WOOD, { limb: bowUp }), rod(grip, V(-0.19, 0.15, 0.06), 0.012, 0.008, 3, WOOD, { limb: bowUp }));
  }
  if (opts.quiver) out.push(shape(new THREE.CylinderGeometry(0.04, 0.035, 0.32, 4, 1, true).translate(0, 0.16, 0), LEATHER, { x: 0.08, y: 0.45, z: -0.13, rz: -0.3 }));
  if (opts.pack) out.push(box(0.22, 0.24, 0.12, 0x9a8462, { y: 0.56, z: -0.17 }), box(0.24, 0.06, 0.14, 0x7a6448, { y: 0.71, z: -0.17 }));
  if (shield) out.push(...shieldOf(gear.shield));
  if (opts.helmet) out.push(...helmetOf(gear.helmet));
  return out;
}

// The shield on the left arm, its face painted (team), standing forward.
function shieldOf(s: Shield): THREE.BufferGeometry[] {
  const at: Tf = { x: -0.2, y: 0.55, z: 0.13 };
  const face = (geo: THREE.BufferGeometry, o: Tf = {}) => flat(geo, PAINT, { ...at, ...o }, { team: true });
  const boss = ball(0.03, METAL, { ...at, z: 0.145 });
  switch (s) {
    case 'round': return [face(new THREE.CircleGeometry(0.16, 7)), boss];
    case 'big round': return [face(new THREE.CircleGeometry(0.2, 8)), boss];
    case 'small': return [face(new THREE.CircleGeometry(0.11, 6)), boss];
    case 'oval': return [face(new THREE.CircleGeometry(0.12, 8), { sy: 1.6 }), boss];
    case 'scutum': return [box(0.24, 0.42, 0.03, PAINT, { ...at, y: 0.52 }, { team: true }), boss];
    case 'pavise': return [box(0.26, 0.46, 0.03, PAINT, { ...at, y: 0.5 }, { team: true })];
    case 'kite': {
      const k = new THREE.Shape([new THREE.Vector2(-0.12, 0.14), new THREE.Vector2(0.12, 0.14), new THREE.Vector2(0.1, -0.04), new THREE.Vector2(0, -0.28), new THREE.Vector2(-0.1, -0.04)]);
      return [face(new THREE.ShapeGeometry(k))];
    }
  }
}

function helmetOf(h: Helmet): THREE.BufferGeometry[] {
  const dome = (color: number, o: Tf = {}) => shape(new THREE.SphereGeometry(0.095, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), color, { y: 0.85, ...o });
  switch (h) {
    case 'crest': return [dome(METAL), box(0.03, 0.08, 0.2, PAINT, { y: 0.97 }, { team: true })];
    case 'cone': return [shape(new THREE.ConeGeometry(0.098, 0.16, 6, 1, true).translate(0, 0.08, 0), METAL, { y: 0.85 })];
    case 'kettle': return [dome(METAL), shape(new THREE.CircleGeometry(0.16, 8), METAL, { y: 0.86, rx: -Math.PI / 2 })];
    case 'hat': return [shape(new THREE.ConeGeometry(0.19, 0.09, 8, 1, true).translate(0, 0.045, 0), 0xb8a070, { y: 0.88 })];
    case 'feather': return [box(0.2, 0.05, 0.2, PAINT, { y: 0.9 }, { team: true }), ...[-0.06, 0, 0.06].map((x) => box(0.025, 0.18, 0.01, 0x3a8a6a, { x, y: 1.0, z: -0.06, rz: x * 3 }))];
    case 'turban': return [ball(0.1, 0xece6d6, { y: 0.9, sy: 0.65 })];
    case 'cap': return [dome(0xe6dcc4, { sy: 0.8 })];
    case 'none': return [];
  }
}

// A rider on his horse (the horse's legs swing in diagonal pairs).
// `officer`: a commander's (a cape and a plume in the owner's colour, no lance).
function rider(gear: Gear, coat: number, female: boolean, officer = false): THREE.BufferGeometry[] {
  const LEG_TOP = 0.5, HORSE_LEG = (side: number) => [side, LEG_TOP, 0.4] as const;
  const leg = (x: number, z: number, side: number) => shape(new THREE.CylinderGeometry(0.035, 0.045, LEG_TOP, 4, 1, true).translate(0, LEG_TOP / 2, 0), coat, { x, z }, { limb: HORSE_LEG(side) });
  const out: THREE.BufferGeometry[] = [
    leg(0.08, 0.2, 1), leg(-0.08, 0.2, -1), leg(0.08, -0.22, -1), leg(-0.08, -0.22, 1),
    shape(new THREE.CylinderGeometry(0.13, 0.14, 0.6, 6, 1, false).translate(0, 0, 0), coat, { y: 0.64, rx: Math.PI / 2 }),
    rod(V(0, 0.7, 0.25), V(0, 0.98, 0.4), 0.075, 0.06, 4, coat),
    box(0.09, 0.09, 0.22, coat, { y: 1.0, z: 0.48, rx: 0.5 }),
    rod(V(0, 0.68, -0.3), V(0, 0.42, -0.42), 0.035, 0.015, 3, HAIR),
    // The cloth under the saddle, in the owner's colour.
    box(0.3, 0.16, 0.3, CLOTH, { y: 0.7 }, { team: true }),
  ];
  // The rider: legs astride, the body and head above the saddle, a spear.
  out.push(
    rod(V(0.1, 0.82, 0), V(0.16, 0.5, 0.06), 0.04, 0.035, 3, gear.legs === 'bare' ? SKIN : gear.legs, { skin: gear.legs === 'bare' }),
    rod(V(-0.1, 0.82, 0), V(-0.16, 0.5, 0.06), 0.04, 0.035, 3, gear.legs === 'bare' ? SKIN : gear.legs, { skin: gear.legs === 'bare' }),
    shape(new THREE.CylinderGeometry(female ? 0.1 : 0.12, female ? 0.1 : 0.11, 0.3, 6, 1, false).translate(0, 0.15, 0), CLOTH, { y: 0.8 }, { team: true }),
    ball(0.08, SKIN, { y: 1.18 }, { skin: true }),
    rod(V(0.13, 1.05, 0), V(0.18, 0.86, 0.12), 0.032, 0.028, 3, CLOTH, { team: true, limb: HIT(1.05, 0.6) }),
    rod(V(-0.13, 1.05, 0), V(-0.15, 0.88, 0.14), 0.032, 0.028, 3, CLOTH, { team: true }),
  );
  if (officer) out.push(box(0.26, 0.42, 0.03, CLOTH, { y: 0.86, z: -0.13, rx: 0.15 }, { team: true }), box(0.03, 0.12, 0.16, PAINT, { y: 1.33 + (gear.helmet === 'none' ? -0.05 : 0.05) }, { team: true }));
  else out.push(rod(V(0.19, 0.7, -0.2), V(0.19, 1.45, 0.55), 0.012, 0.01, 3, WOOD, { limb: HIT(1.05, 0.6) }));
  out.push(...helmetOf(gear.helmet).map((g) => g.translate(0, RIDER_HEAD, 0)));
  return out;
}

// ---- hair ----
// Hair, drawn apart from the figures (an instanced mesh per style, shared by
// every unit and civ), each figure with its own style and colour (the
// instance colour: hair is all team-tagged white). Modelled on a head on
// foot (a rider's sits RIDER_HEAD higher).
export const RIDER_HEAD = 0.33;
export const HAIR_STYLES = ['short', 'long', 'bun', 'tail', 'beard', 'bald'] as const;
export type HairStyle = typeof HAIR_STYLES[number];
// The styles each wears, drawn from (repeated: more often), bareheaded and
// under a helmet (only what shows below it: 'bald' there shows none).
export const HAIR_BY: Record<'man' | 'woman', { bare: readonly HairStyle[]; helmet: readonly HairStyle[] }> = {
  man: { bare: ['short', 'short', 'short', 'beard', 'beard', 'bald', 'long', 'tail'], helmet: ['bald', 'bald', 'beard', 'long'] },
  woman: { bare: ['long', 'long', 'bun', 'bun', 'tail', 'tail', 'short'], helmet: ['long', 'long', 'bald'] },
};
export function hairModel(style: HairStyle): THREE.BufferGeometry {
  const hair = (geo: THREE.BufferGeometry, o: Tf) => shape(geo, 0xffffff, o, { team: true });
  // A cap over the crown, down to the brow in front and the nape behind.
  const cap = () => hair(new THREE.SphereGeometry(0.092, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), { y: 0.845, z: -0.008, rx: -0.25 });
  const beard = () => hair(new THREE.ConeGeometry(0.06, 0.09, 5, 1, true).rotateX(Math.PI).translate(0, -0.045, 0), { y: 0.81, z: 0.05, sz: 0.6 });
  const parts = ((): THREE.BufferGeometry[] => {
    switch (style) {
      case 'short': return [cap()];
      case 'long': return [cap(), hair(new THREE.BoxGeometry(0.15, 0.2, 0.04), { y: 0.76, z: -0.07 })];
      case 'bun': return [cap(), hair(new THREE.IcosahedronGeometry(0.045, 0), { y: 0.93, z: -0.06 })];
      case 'tail': return [cap(), hair(new THREE.CylinderGeometry(0.025, 0.012, 0.2, 4, 1, true), { y: 0.74, z: -0.1, rx: 0.3 })];
      case 'beard': return [cap(), beard()];
      case 'bald': return [hair(new THREE.SphereGeometry(0.087, 7, 2, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.15), { y: 0.84 })];
    }
  })();
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error(`hairModel: ${style} parts don't merge`);
  return g;
}
// Whether a type's figures wear helmets (their hair then mostly hidden).
export const wearsHelmet = (type: UnitKey, civ: ArchCiv): boolean => (type === 'spearman' || type === 'horseman' || type === 'commander') && GEAR[civ].helmet !== 'none';

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
// Fighting units' figures shown at `hp` (of 100): one per 8 HP or part of it, at most a full formation.
export const figuresFor = (hp: number): number => Math.max(1, Math.min(FULL_FORMATION, Math.ceil(hp / 8)));

export interface UnitLook {
  readonly party: 'formation' | 'group'; // a fighting formation, or a small party
  readonly count: number;                // figures at full strength
  readonly spacing: readonly [number, number]; // between figures, across and front to back (model units)
}
export const UNIT_LOOK: Record<UnitKey, UnitLook> = {
  warrior:  { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  spearman: { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  archer:   { party: 'formation', count: FULL_FORMATION, spacing: [0.55, 0.6] },
  horseman: { party: 'formation', count: FULL_FORMATION, spacing: [0.6, 1.05] },
  scout:    { party: 'group', count: 2, spacing: [0.5, 0.5] },
  commander: { party: 'group', count: 2, spacing: [0.75, 0.5] },
  settler:  { party: 'group', count: 4, spacing: [0.55, 0.55] },
};

// Where a unit's figures stand (model units: x across, z forward, around
// its middle), so many as it shows at `hp`: in ranks, the front one full
// first (a hurt formation loses men from the back); a party loosely.
// `rand` jitters them (none: exact ranks).
export function formationSlots(type: UnitKey, hp: number, rand?: () => number): [number, number][] {
  const look = UNIT_LOOK[type];
  const n = look.party === 'formation' ? figuresFor(hp) : look.count;
  const cols = look.party === 'formation' ? FORMATION.cols : Math.ceil(Math.sqrt(look.count));
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
      case 'commander': return variant === 0 ? rider(gear, HORSE[0], female, true) : figure(gear, 'banner', false, { helmet: true, female });
    }
  })();
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error(`unitModel: ${type} parts don't merge`);
  return g;
}
// How many variants of a type's model there are (instances pick among them).
export const unitVariants = (type: UnitKey): number => (type === 'horseman' ? HORSE.length : type === 'settler' || type === 'commander' ? 2 : 1);
// The model variant of a unit's i-th figure (a commander's are set: first
// the commander, then the standard-bearer; others drawn).
export const variantOf = (type: UnitKey, i: number, rand: () => number): number =>
  type === 'commander' ? i % 2 : Math.floor(rand() * unitVariants(type));
// Whether a figure rides (its head higher, its shadow longer).
export const rides = (type: UnitKey, variant: number): boolean => type === 'horseman' || (type === 'commander' && variant === 0);
