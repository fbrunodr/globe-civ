import * as THREE from 'three';
import type { ArchCiv } from './architecture.ts';
import { unitDef, domainOf, type UnitKey } from './rules.ts';
import { returnFire, type AttackStyle, type Projectile } from './unitClasses.ts';
import { UNIT_LOOK, figuresFor, formationSlots, unitModel, variantOf, rides, headOffset, hairModel, transportModel, wearsHelmet, womenShare, isMachine, colsOf, GEAR, HAIR_BY, HAIR_STYLES, STRIKE, GUARD, DRAW, whirls, bowman } from './unitModels.ts';
import { mulberry32 } from './rng.ts';
import { HIP } from './people.ts';
import { pairUp, type P2 } from './duel.ts';
import { orderSlots, reforms, type Order } from './formation.ts';
import { AFTER, SINK, WRECK, armOf, deathBend, deathLegs, deathTurn, dropOf, flingOf, legsOf, machinePose, nextBlow, poseOf, poseTurn, rearShift, sunk, type Cue } from './unitAnim.ts';

// The units on the globe, as figurines (unitModels.ts): a fighting unit is a
// formation of up to a dozen figures (FORMATION), one fewer for every 8 HP
// it has lost; the others a small party. Each stands on its tile's dry
// ground: the formation is placed where every figure is out of the water
// (another spot or facing on the tile, or closer ranks). A unit that moves
// marches to its new tile, legs swinging, turned the way it goes. A soft
// shadow lies under each figure (they cast none into the sun's shadow map,
// which would then be redrawn whenever one moved). Above each unit flies
// its flag (made by the caller), which alone shows from far away.
// In a fight (fight()) the attacker plays its attack's style (its class
// against the defender's: unitClasses.ts): a melee unit walks in, cavalry
// gallops in, riflemen fire and then go in with the bayonet, each figure
// at a figure of the defender's, to strike it at its weapon's reach
// (duel.ts); archers loose volleys of arrows, engines lob stones, guns fire
// bursts or shells (Volleys), armour rolls in firing. The units attacked
// shoot back (archers, guns) and strike whoever comes at them. The figures
// the fight costs (one for every 8 HP lost) fall as it goes on; a unit
// killed in a fight is shown until the fight is over.

// A figure's height, in tile steps (the distance between tile centers):
// big enough that a formation fills much of its tile.
const FIGURE = 0.16;
// How loose a formation stands on the globe (its spacing, times), and how
// close it may close up to keep its feet dry.
const LOOSE = [1.4, 1.15, 0.9, 0.65] as const;
// How long a march takes (seconds per tile step, and at least).
const MARCH = 0.9, MARCH_MIN = 0.5;
// A figure finding its place in its formation (reforming): how fast it
// walks there, and how much faster the further it has to go (figure
// heights a second, and per figure height away); how fast it turns
// (radians a second: a man, a machine).
const SHUFFLE = 1.4, SHUFFLE_FAR = 0.9, TURN = 7, TURN_MACHINE = 2.2;
// Running faster than this (figure heights a second), a figure kicks up dust.
const DUSTY = 3;
// A figure's legs by how fast it goes over the ground (figure heights a
// second): how hard they swing (none standing), how quick their beat
// (radians a second): longer and quicker strides as it speeds up.
const walkOf = (speed: number): number => (speed < 0.35 ? 0 : Math.min(1.4, 0.5 + 0.13 * speed));
const cadenceOf = (speed: number): number => 8 + 1.2 * Math.min(speed, 7);
// The flag's height over the ground (figure heights).
const FLAG_LIFT = 1.7;
// A figure stands on dry ground: the water there no deeper than this (world units).
const DRY = 0.00005;
// The figures are drawn while at least this many pixels tall.
const MIN_PX = 3;
// A fight: how long (seconds; a melee longer, durOf), and how far a melee
// unit charges (a share of the way to the enemy's tile).
export const FIGHT = 3;
const CHARGE = 0.42;
// Ships that fight with guns along their sides (a broadside), turning beam-on to the enemy.
const BROADSIDE: ReadonlySet<UnitKey> = new Set<UnitKey>(['galleass', 'frigate', 'privateer', 'shipOfTheLine', 'ironclad', 'cruiser', 'battleship']);
// A carrier's deck above the water (figure heights: unitModels.ts).
const CARRIER_DECK = 0.48;

// How a fight plays out, over its FIGHT seconds (shares of it): how far the
// unit goes in (a share of CHARGE: 0 stays put), when it sets out and has
// arrived, when it falls back; when its arms strike (or, aiming, `aim`:
// weapons raised the whole time); its shots (Volleys); `fly`: how high it
// climbs on the way (figure heights: aircraft); `close`: its figures go
// each at one of the enemy's, all the way (duel.ts); `dur`: how long the
// fight lasts (seconds; FIGHT if not given).
export interface Play { readonly dur?: number; readonly fly?: number; readonly close?: boolean; readonly charge: number; readonly go: readonly [number, number]; readonly back: number; readonly strike: readonly [number, number]; readonly aim: boolean; readonly shots: readonly { readonly t: number; readonly kind: Projectile }[] }
const still = (shots: Play['shots']): Play => ({ charge: 0, go: [0, 0], back: 1, strike: [0, 0], aim: true, shots });
export const PLAYS: Record<AttackStyle, Play> = {
  // (A melee: a short run in, then a long while at it, as Civ V plays it, before falling back.)
  melee: { dur: 4.6, close: true, charge: 1, go: [0.04, 0.2], back: 0.84, strike: [0.18, 0.84], aim: false, shots: [] },
  charge: { dur: 4.4, close: true, charge: 1.25, go: [0.03, 0.15], back: 0.84, strike: [0.13, 0.84], aim: false, shots: [] },
  volley: still([{ t: 1 / 3, kind: 'arrow' }, { t: 2 / 3, kind: 'arrow' }]),
  lob: still([{ t: 0.3, kind: 'stone' }]),
  shell: still([{ t: 0.28, kind: 'shell' }, { t: 0.6, kind: 'shell' }]),
  fire: still([{ t: 0.25, kind: 'bullet' }, { t: 0.45, kind: 'bullet' }, { t: 0.65, kind: 'bullet' }]),
  roll: { charge: 0.6, go: [0, 0.55], back: 0.8, strike: [0, 0], aim: false, shots: [{ t: 0.25, kind: 'shell' }, { t: 0.6, kind: 'bullet' }] },
  // (Out all the way to the target, high, and back: the shots fall from there.)
  sortie: { fly: 3, charge: 1 / CHARGE, go: [0, 0.4], back: 0.6, strike: [0, 0], aim: false, shots: [{ t: 0.42, kind: 'shell' }, { t: 0.5, kind: 'bullet' }] },
};
// How long a fight against `attack` lasts (seconds: both sides).
export const durOf = (attack: Play): number => attack.dur ?? FIGHT;
// Where a play is at `t` (a share of the fight): how far out (0..1, of its
// charge), whether it is moving (legs) and striking (arms), whether it has
// turned to fall back.
export function playAt(p: Play, t: number): { out: number; moving: boolean; strike: number; back: boolean } {
  const [g0, g1] = p.go;
  const out = t < g0 ? 0 : t < g1 ? smooth((t - g0) / (g1 - g0)) : t < p.back ? 1 : 1 - smooth((t - p.back) / (1 - p.back));
  const moving = p.charge > 0 && ((t >= g0 && t < g1) || t > p.back);
  const strike = p.aim ? Math.min(1, t * 4) * (t < 0.85 ? 1 : (1 - t) / 0.15) : t > p.strike[0] && t < p.strike[1] ? 1 : 0;
  return { out, moving, strike, back: p.charge > 0 && t > p.back };
}
// How far out a melee's figure is, `t` into the fight, having set out
// `delay` late (a share): out as its play goes, then home again a little
// late too (but home as the fight ends: each runs back at its own pace).
export function figureOut(p: Play, t: number, delay: number): { out: number; back: boolean } {
  const turn = p.back + delay * 0.4;
  if (t < turn) return { out: playAt(p, Math.max(0, t - delay)).out, back: false };
  return { out: 1 - smooth(Math.min(1, (t - turn) / (1 - turn))), back: true };
}
// How far a path bows to one side, `out` along it.
export const bow = (curve: number, out: number): number => curve * Math.sin(Math.PI * out);
// A defender standing its ground (it strikes whoever comes at it).
const DEFEND: Play = { charge: 0, go: [0, 0], back: 1, strike: [0.2, 0.8], aim: false, shots: [] };
export const playOf = (style: AttackStyle | null): Play => (style ? PLAYS[style] : DEFEND);
// A defender against `attack`: come at, it strikes back from when the
// attackers arrive until they fall back (firing once at them as they come,
// if it has time); shot at, it never fires back: it takes cover (unitAnim.ts).
export function defendPlay(attack: Play, type: UnitKey): Play {
  if (!attack.close) return { ...DEFEND, strike: [0, 0] };
  const met = attack.go[1], kind = returnFire(type);
  return { charge: 0, go: [0, 0], back: 1, strike: [met - 0.04, attack.back], aim: false, shots: kind && met > 0.2 ? [{ t: met - 0.18, kind }] : [] };
}
// When a figure struck down in a fight against `attack` falls (a share of
// the fight; `r` 0..1 spreads them out): in a melee while the two sides
// are at it; shot at, as the shots come down.
export function fallShare(attack: Play, side: 'attacker' | 'defender', r: number): number {
  if (attack.close) return attack.go[1] + 0.05 + r * (attack.back - attack.go[1] - 0.12);
  return Math.min(0.95, side === 'defender' ? (attack.shots[0]?.t ?? 0.3) + 0.15 + r * 0.4 : 0.55 + r * 0.3);
}
// Whether a unit's figures fight body and soul (people and horses: a
// machine, a ship or an aircraft is taken away at the end of the fight).
export const falls = (type: UnitKey): boolean => !isMachine(type) && domainOf(unitDef(type)) === 'land';


// How many figures a unit shows (unitModels.ts): its formation thinned as
// it is hurt, its party, or (embarked) its boat.
const figuresOf = (u: ShownUnit): number => {
  const look = UNIT_LOOK[u.type];
  return u.embarked ? 1 : look.party === 'formation' ? figuresFor(u.hp, look.count) : look.count;
};

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0] as const;
// (The shader's aPose, then the aim and how far aimed (aAnim.w, aSkinTone.w), the guard and draw (aMore.xy): bend, twist, crouch, elbow; aim, aimed; guard, draw.)
type Bends = readonly [number, number, number, number, number, number, number, number];

export interface ShownUnit {
  readonly id: number;
  readonly type: UnitKey;
  readonly civ: ArchCiv;
  readonly color: string;
  readonly tile: number;
  readonly hp: number;
  readonly suffrage: boolean; // its civ has women's suffrage (half its figures women)
  readonly embarked?: boolean; // a land unit on the water (shown as its boat)
  readonly fortified?: boolean; // dug in: ranks closed up, crouched behind shields, weapons levelled
}
export interface UnitViewEnv {
  readonly center: (t: number) => THREE.Vector3;               // a tile's center (unit vector)
  readonly ground: (dir: THREE.Vector3) => { ground: number; water: number }; // heights above radius 1
  readonly step: number;                                        // tile step (radians)
}

// A figure: its slot in the formation, its looks, where it stands now
// (and its up). In a melee: where it stood, where it goes (`goal`), whom
// it faces (`foe`), which way it faces now (null: its unit's way), how
// late it sets out (a share of the fight); when it falls (seconds; never:
// Infinity).
// Its place in each order (formation.ts) is its slot's (`slot`, an index
// into the order's places), jittered (`jx`, `jz`); where that is now
// (`at`, a unit vector) and how far off it the figure still is (`off`:
// it walks there); which way it faces now (`head`, a tangent: it turns
// that way at its pace), how fast it is going (figure heights a second)
// and where its legs are in their beat (`gait`, radians). `fresh`: not yet
// stood anywhere.
interface Figure {
  jx: number; jz: number; slot: number; at: THREE.Vector3; off: THREE.Vector3; still: boolean; head: THREE.Vector3; last: THREE.Vector3; speed: number; gait: number; fresh: boolean; // (still: stood at its place, nothing to redo)
  variant: number; female: boolean; skin: THREE.Color; hair: number; hairColor: THREE.Color; phase: number; pos: THREE.Vector3; up: THREE.Vector3;
  home: THREE.Vector3 | null; goal: THREE.Vector3 | null; foe: THREE.Vector3 | null; face: THREE.Vector3 | null; delay: number; curve: number; fall: number;
  beat: number | null; // where it is in its round of blows (null: its phase says)
  shot: number; smoke: number; dust: number; // when it last fired (its recoil); when it next smokes (a burning wreck), kicks up dust (running)
  // In a melee: the enemy figure it is at (its foe struck down, it turns to
  // another); where it stands to strike it now (`reach`: walking towards
  // `goal`), and how far from its foe that is (world units).
  foeFig: Figure | null; reach: THREE.Vector3 | null; gap: number;
  held: boolean; // its place set by the fight (stepped up to a foe), not by its formation
}
// (`enemy`: the figures of the unit it is at grips with, in a melee.)
interface Fight { at: THREE.Vector3; home: THREE.Vector3; t0: number; play: Play; fired: number; attack: Play; side: 'attacker' | 'defender'; won: boolean; enemy: Figure[] }
// A figure struck down, lying where it fell (then sinking away).
// (A machine's: a wreck burning, on land or at sea.)
interface Corpse { wreck: Wreck | null; smoke: number; key: string; hair: number; hairColor: THREE.Color; skin: THREE.Color; phase: number; color: THREE.Color; pos: THREE.Vector3; up: THREE.Vector3; face: THREE.Vector3; fall: number; beat: number; horse: boolean; lift: readonly [number, number] }
const unfought = () => ({ home: null, goal: null, foe: null, face: null, delay: 0, curve: 0, fall: Infinity, beat: null, shot: -Infinity, smoke: 0, dust: 0, foeFig: null, reach: null, gap: 0, held: false });
// What a machine struck down leaves: a wreck on land, or a ship going down
// (aircraft and figures leave none).
type Wreck = 'land' | 'sea';
const wreckOf = (u: ShownUnit): Wreck | null => {
  if (u.embarked) return 'sea';
  const dom = domainOf(unitDef(u.type));
  return dom === 'sea' ? 'sea' : dom === 'land' && isMachine(u.type) ? 'land' : null;
};
// The outcome of a fight, if known: the defending unit, the HP each side is left with.
export interface FightResult { readonly defender: number; readonly attackerHp: number; readonly defenderHp: number }
interface Shown {
  unit: ShownUnit;
  dir: THREE.Vector3;          // where it stands (unit vector)
  forward: THREE.Vector3;      // the way it faces (tangent)
  figures: Figure[];
  spread: number;              // ranks closed up to fit (1: full spacing)
  order: Order;                // how its figures stand (formation.ts)
  laid: { fwd: THREE.Vector3; spread: number; n: number; order: Order } | null; // the formation as last laid out
  alt: number;                 // how high it flies now (figure heights: aircraft on a sortie)
  march: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number } | null;
  route: number[];             // tiles it steps through on its way, still to march (game.ts onStep), the last its new tile
  // A fight: the enemy's spot, how it plays (PLAYS), the shots fired so
  // far; the attack being made, its side, whether its side wins. Over: the
  // same, a while longer (its figures cheer or stand easy: unitAnim.ts).
  fight: Fight | null;
  after: Fight | null;
  gone: boolean;               // no longer in the game (shown until its fight is over)
  flag: THREE.Sprite;
  k: number;                   // its place among the units on its tile (0: the middle)
  seen: boolean;
}

const UNIT_VERTEX_DECL = /* glsl */ `
  attribute vec4 aLimb;     // (side, pivot, amplitude; flags: unitModels.ts RIG)
  attribute vec4 aRig;      // a lower piece's middle joint (knee, elbow) at y, z; a weapon's grip at y, z
  attribute float aRest;    // how far forward of upright a weapon points as made (radians)
  attribute vec4 aAnim;     // per figure: its legs' beat (radians), its legs, its striking arm (unitAnim.ts legsOf, armOf); how its weapon points (radians from upright, forward)
  attribute vec4 aSkinTone; // per figure: its skin; how far its weapon is aimed (0: as it is made and carried)
  attribute vec4 aPose;     // per figure: its body above the hips bent forward, turned; its crouch; its striking elbow bent (radians)
  attribute vec4 aMore;     // per figure: its shield raised, its bowstring drawn, how burnt (0..1); (spare)
  uniform float uTime;
  // (A point or direction turned with the body above the hips.)
  vec3 bodyBend(vec3 p, float c1, float s1, float c2, float s2) {
    p = vec3(c1 * p.x + s1 * p.z, p.y, -s1 * p.x + c1 * p.z);
    return vec3(p.x, c2 * p.y - s2 * p.z, s2 * p.y + c2 * p.z);
  }`;
// The limb's turn now (radians, about the x axis through its pivot):
// marching, swinging to and fro; striking, thrust forward again and again.
// Its lower piece bends first about its middle joint: a knee as the leg
// swings forward on the march (and both as the figure crouches, the
// thighs forward), the striking arm's elbow as its pose says, a free
// arm's a little on the march.
const UNIT_LIMB = /* glsl */ `
  float beat = aAnim.x; // (its legs' beat: the caller keeps it going)
  bool isLeg = aLimb.z > 0.0 && abs(aLimb.x) < 1.5 && aLimb.y < ${(HIP + 0.01).toFixed(2)};
  bool isStrike = aLimb.x > ${(STRIKE - 0.5).toFixed(1)} && aLimb.x < ${(GUARD - 0.5).toFixed(1)};
  bool isGuard = aLimb.x > ${(GUARD - 0.5).toFixed(1)} && aLimb.x < ${(DRAW - 0.5).toFixed(1)};
  bool isDraw = aLimb.x > ${(DRAW - 0.5).toFixed(1)};
  float marching = aAnim.y > 1.5 ? 0.0 : aAnim.y;
  float rigFlags = aLimb.w;
  float isTeam = mod(rigFlags, 2.0), isSkin = mod(floor(rigFlags / 2.0), 2.0), isLower = mod(floor(rigFlags / 4.0), 2.0), isGrip = mod(floor(rigFlags / 8.0), 2.0);
  // (A rotor or a propeller turning about its hub while the machine moves.)
  // (A wheel rolling more slowly.)
  float spinY = mod(floor(rigFlags / 16.0), 2.0), spinZ = mod(floor(rigFlags / 32.0), 2.0), spinX = mod(floor(rigFlags / 64.0), 2.0);
  float spinA = (aAnim.y > 0.05 && aAnim.y < 1.5) ? uTime * (spinX > 0.5 ? 9.0 : 31.0) : 0.0, spinC = cos(spinA), spinS = sin(spinA);
  float jointA = isLeg ? 2.0 * aPose.z + marching * 0.95 * max(0.0, -cos(beat) * aLimb.x)
               : isStrike ? -aPose.w : isDraw ? -2.3 * aMore.y : -0.35 * marching;
  jointA *= aLimb.z > 0.0 ? isLower : 0.0; // (a limb that never moves keeps its forearm as it is: what it holds stays in hand)
  float jointC = cos(jointA), jointS = sin(jointA);
  // (A weapon turned in the hand to point as aimed, however the arm is.)
  float hit = aAnim.z > 1.5 ? aAnim.z - 3.0 : aAnim.z * (0.6 + 0.4 * sin(uTime * 13.0 + aAnim.x)); // (past 1.5: a stance's arm, exactly)
  float limbA = aLimb.z <= 0.0 ? 0.0 : isGuard ? -aMore.x * aLimb.z : isDraw ? -aMore.y * aLimb.z : isStrike ? -hit * aLimb.z
                                     : (aAnim.y > 1.5 ? aAnim.y - 3.0 : sin(beat) * aAnim.y) * aLimb.x * aLimb.z // (past 1.5: a stance's stride, exactly)
                                       - (isLeg ? aPose.z : 0.0);
  float limbC = cos(limbA), limbS = sin(limbA);
  float gripA = isGrip > 0.5 ? aSkinTone.w * (aAnim.w - aRest - limbA - jointA) : 0.0, gripC = cos(gripA), gripS = sin(gripA);
  // (Above the hips, not a leg: the body, its arms, head and hair.)
  bool upper = position.y > ${(HIP - 0.02).toFixed(2)} && !isLeg;
  float twC = cos(upper ? aPose.y : 0.0), twS = sin(upper ? aPose.y : 0.0), bnC = cos(upper ? aPose.x : 0.0), bnS = sin(upper ? aPose.x : 0.0);`;
const UNIT_NORMAL = /* glsl */ `
  ${UNIT_LIMB}
  if (spinY > 0.5) objectNormal.xz = vec2(spinC * objectNormal.x - spinS * objectNormal.z, spinS * objectNormal.x + spinC * objectNormal.z);
  if (spinZ > 0.5) objectNormal.xy = vec2(spinC * objectNormal.x - spinS * objectNormal.y, spinS * objectNormal.x + spinC * objectNormal.y);
  if (spinX > 0.5) objectNormal.yz = vec2(spinC * objectNormal.y - spinS * objectNormal.z, spinS * objectNormal.y + spinC * objectNormal.z);
  objectNormal.yz = vec2(gripC * objectNormal.y - gripS * objectNormal.z, gripS * objectNormal.y + gripC * objectNormal.z);
  objectNormal.yz = vec2(jointC * objectNormal.y - jointS * objectNormal.z, jointS * objectNormal.y + jointC * objectNormal.z);
  objectNormal.yz = vec2(limbC * objectNormal.y - limbS * objectNormal.z, limbS * objectNormal.y + limbC * objectNormal.z);
  objectNormal = bodyBend(objectNormal, twC, twS, bnC, bnS);`;
const UNIT_VERTEX = /* glsl */ `
  {
    vec2 sp = spinY > 0.5 ? transformed.xz - aRig.zw : spinX > 0.5 ? transformed.yz - aRig.zw : transformed.xy - aRig.zw;
    sp = vec2(spinC * sp.x - spinS * sp.y, spinS * sp.x + spinC * sp.y) + aRig.zw;
    if (spinY > 0.5) transformed.xz = sp; else if (spinZ > 0.5) transformed.xy = sp; else if (spinX > 0.5) transformed.yz = sp;
    vec2 gyz = transformed.yz - aRig.zw;
    if (isGrip > 0.5) transformed.yz = aRig.zw + vec2(gripC * gyz.x - gripS * gyz.y, gripS * gyz.x + gripC * gyz.y);
    vec2 jyz = transformed.yz - aRig.xy;
    if (isLower > 0.5) transformed.yz = aRig.xy + vec2(jointC * jyz.x - jointS * jyz.y, jointS * jyz.x + jointC * jyz.y);
    vec2 yz = transformed.yz - vec2(aLimb.y, 0.0);
    transformed.yz = vec2(aLimb.y, 0.0) + vec2(limbC * yz.x - limbS * yz.y, limbS * yz.x + limbC * yz.y);
    transformed = bodyBend(transformed - vec3(0.0, ${HIP.toFixed(2)}, 0.0), twC, twS, bnC, bnS) + vec3(0.0, ${HIP.toFixed(2)}, 0.0);
    transformed.y += abs(sin(beat)) * 0.03 * (aAnim.y > 1.5 ? 0.0 : aAnim.y);
  }`;

// The figures' material: the props' look (smooth-shaded, painted), the
// owner's colour on the team parts (the instance colour), each figure's
// skin, and the limbs swinging on the march (`time`: seconds).
export function makeUnitMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${UNIT_VERTEX_DECL}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${UNIT_NORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${UNIT_VERTEX}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vec2 isTeamV = vec2(mod(aLimb.w, 2.0), mod(floor(aLimb.w / 2.0), 2.0)); // (team, skin: the flags)
          vColor.rgb = mix(mix(color.rgb, aSkinTone.rgb, isTeamV.y), color.rgb * instanceColor.rgb, isTeamV.x);
          vColor.rgb *= 1.0 - 0.78 * aMore.z; // (burnt: a wreck)
        #endif`);
  };
  mat.customProgramCacheKey = () => 'unit-figure';
  return mat;
}
// A model's geometry made ready for `cap` instances (their gait and skin).
export function prepareUnitGeometry(geo: THREE.BufferGeometry, cap: number): THREE.BufferGeometry {
  geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
  geo.setAttribute('aSkinTone', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
  geo.setAttribute('aPose', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
  geo.setAttribute('aMore', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
  return geo;
}

export class UnitView {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly material: THREE.MeshStandardMaterial;
  private readonly shadowGeo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);
  private readonly shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private shadows: THREE.InstancedMesh;
  private readonly shown = new Map<number, Shown>();
  private corpses: Corpse[] = [];
  private readonly volleys: Volleys;
  readonly size: number; // a figure's height, world units
  private now = 0; // the time of the frame drawn last (seconds)

  constructor(private readonly env: UnitViewEnv, private readonly makeFlag: (u: ShownUnit) => THREE.Sprite) {
    this.size = FIGURE * env.step;
    this.material = makeUnitMaterial(this.time);
    this.shadows = this.makeShadows(256);
    this.volleys = new Volleys(this.size);
    this.group.add(this.shadows, this.volleys.lines);
  }

  // The units to show now (those in sight). A unit on a new tile marches
  // there (after its fight, if it is fighting); one gone is taken away (once
  // its fight is over).
  sync(units: readonly ShownUnit[], now: number): void {
    for (const s of this.shown.values()) s.seen = false;
    // (Units sharing a tile stand apart: the first in the middle.)
    const onTile = new Map<number, number>();
    for (const u of units) {
      const k = onTile.get(u.tile) ?? 0;
      onTile.set(u.tile, k + 1);
      let s = this.shown.get(u.id);
      if (!s || s.unit.type !== u.type || s.unit.civ !== u.civ || s.unit.suffrage !== u.suffrage) {
        if (s) this.drop(s);
        s = this.add(u, k);
      } else if (s.unit.tile !== u.tile) {
        // (Embarking or landing: its figures become its boat, or come back out.)
        const swap = (s.unit.embarked ?? false) !== (u.embarked ?? false);
        s.unit = u;
        if (swap) this.dress(s, false);
        s.k = k;
        // (Along the tiles it stepped through, if they lead here; else straight.)
        if (s.route[s.route.length - 1] !== u.tile) s.route = [u.tile];
        // (Already marching: it goes on along the route as it gets there.)
        if (s.fight) this.marchOn(s, s.fight.home.clone(), s.fight.t0 + durOf(s.fight.attack));
        else if (!s.march) this.marchOn(s, s.dir.clone(), now);
      } else {
        const hurt = s.unit.hp !== u.hp, dug = (s.unit.fortified ?? false) !== (u.fortified ?? false);
        s.unit = u;
        if (hurt || s.k !== k) { s.k = k; if (!s.march && !s.fight) this.settle(s, k); }
        else if (dug && !s.march && !s.fight) this.layout(s);
      }
      // (Its flag anew: it shows the unit's health and whether it is selected.)
      this.group.remove(s.flag);
      s.flag.material.dispose();
      s.flag = this.makeFlag(u);
      this.group.add(s.flag);
      s.seen = true;
    }
    for (const s of [...this.shown.values()]) {
      if (s.seen) continue;
      if (s.fight) { s.gone = true; s.flag.visible = false; } else this.drop(s);
    }
  }

  // A unit steps from one tile to the next (game.ts onStep): it will march
  // through it on its way (sync, as its new tile shows).
  step(id: number, from: number, to: number): void {
    const s = this.shown.get(id);
    if (!s) return;
    // (A step not on from where its route ends (or it stands) starts the route anew.)
    if ((s.route[s.route.length - 1] ?? s.unit.tile) !== from) s.route = [];
    s.route.push(to);
  }
  // On to the next tile of its route from `from` (a spot), from `t0`: the
  // middle of a tile on the way, its own spot on its last.
  private marchOn(s: Shown, from: THREE.Vector3, t0: number): void {
    const t = s.route.shift()!;
    const to = s.route.length ? this.env.center(t).clone() : this.spot(s.unit, s.k, s.forward).dir;
    s.march = { from, to, t0, dur: Math.max(MARCH_MIN, (MARCH * from.angleTo(to)) / this.env.step) };
  }

  // Turns a unit shown to face a tile (and stands it there anew).
  turnTo(id: number, tile: number): void {
    const s = this.shown.get(id);
    if (!s || s.fight) return;
    this.face(s, this.env.center(tile).clone().sub(s.dir));
    for (const f of s.figures) f.fresh = true;
    this.settle(s, s.k);
  }

  // A fight: the attacker charges at the tile (or, ranged, looses arrows at
  // it); every unit shown there strikes back where it stands. (Call before
  // the sync that follows it: the fallen are still shown.)
  fight(attacker: number, tile: number, style: AttackStyle, now: number, result?: FightResult): void {
    const a = this.shown.get(attacker), play = PLAYS[style];
    const defenders = [...this.shown.values()].filter((s) => s.unit.tile === tile && s !== a && !s.gone); // (not one already gone, shown till its fight is over)
    const main = (result && this.shown.get(result.defender)) || defenders[0];
    const at = main?.dir.clone() ?? this.env.center(tile).clone();
    // (The defenders turned to the attacker first: the attackers' figures go where theirs then stand.)
    // (Who wins: the attacker if the defender is destroyed and it is not; the defenders if it is.)
    const aWins = result !== undefined && result.defenderHp <= 0 && result.attackerHp > 0, dWins = result !== undefined && result.attackerHp <= 0;
    for (const d of defenders) {
      this.startFight(d, a?.dir.clone() ?? at, defendPlay(play, d.unit.type), now, play, 'defender', dWins);
      if (a) { this.faceFoe(d, a.dir.clone().sub(d.dir)); this.layout(d); }
    }
    if (a) this.startFight(a, at, play, now, play, 'attacker', aWins);
    if (a && main) { a.fight!.enemy = main.figures; main.fight!.enemy = a.figures; }
    const melee = a !== undefined && main !== undefined && play.close === true && !a.unit.embarked && !main.unit.embarked;
    if (melee) this.pairUp(a, main);
    if (result && a) this.doom(a, result.attackerHp, play, 'attacker', now);
    if (result && main) this.doom(main, result.defenderHp, play, 'defender', now);
    if (melee) { this.struck(a, main); this.struck(main, a); }
  }

  private startFight(s: Shown, at: THREE.Vector3, play: Play, now: number, attack: Play, side: 'attacker' | 'defender', won: boolean): void {
    const home = s.fight?.home ?? s.dir.clone();
    s.fight = { at, home, t0: now, play, fired: 0, attack, side, won, enemy: [] };
    s.after = null;
    s.march = null;
    for (const f of s.figures) Object.assign(f, unfought());
  }

  // A melee: each of the attacker's figures paired with one of the
  // defender's (duel.ts, on the plane where the attacker stands), to go at.
  private pairUp(a: Shown, d: Shown): void {
    const c = a.dir, fwd = d.dir.clone().sub(c), size = this.size;
    fwd.addScaledVector(c, -fwd.dot(c)).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, c).normalize();
    const flat = (v: THREE.Vector3): P2 => { const w = v.clone().sub(c); return { x: w.dot(right) / size, z: w.dot(fwd) / size }; };
    // (The defenders where they are going to stand, turned to the attacker.)
    const duels = pairUp(a.figures.map((f) => flat(f.up)), d.figures.map((f) => flat(f.at)), a.unit.type, d.unit.type, mulberry32(a.unit.id * 31 + d.unit.id));
    duels.forEach((duel, i) => {
      const f = a.figures[i]!, foe = d.figures[duel.foe]!;
      f.home = f.up.clone();
      f.goal = c.clone().addScaledVector(right, duel.to.x * size).addScaledVector(fwd, duel.to.z * size).normalize();
      f.foe = foe.at.clone();
      f.foeFig = foe;
      f.reach = f.goal.clone();
      f.gap = f.goal.distanceTo(foe.at);
      f.delay = duel.delay;
      f.curve = duel.curve;
      if (!foe.foeFig) foe.foeFig = f;
      if (!foe.foe) { foe.foe = f.goal.clone(); foe.beat = f.phase / (Math.PI * 2) + 0.5; }
    });
  }

  // In a melee, each of a unit's figures doomed to fall falls as the blow
  // of the enemy figure at grips with it lands (if that one is still on
  // its feet then): its own foe, or for a defender whoever came at it.
  private struck(s: Shown, enemy: Shown): void {
    const f = s.fight!, e = enemy.fight!, dur = durOf(f.attack);
    for (const g of s.figures) {
      if (!Number.isFinite(g.fall)) continue;
      const k = f.side === 'attacker' ? g.foeFig : enemy.figures.find((h) => h.foeFig === g) ?? null;
      if (!k) continue;
      const from = e.t0 + (e.side === 'attacker' ? e.play.go[1] + k.delay : e.play.strike[0]) * dur, until = e.t0 + (e.side === 'attacker' ? e.play.back : e.play.strike[1]) * dur;
      const land = nextBlow(Math.max(g.fall - 0.25, from + 0.3), from, k.beat ?? k.phase / (Math.PI * 2));
      if (land < k.fall && land < until) g.fall = land;
    }
  }

  // The figures a fight costs a unit, left with `hp` (all, if none), fall
  // as it goes on (the last of the formation: those it loses).
  private doom(s: Shown, hp: number, attack: Play, side: 'attacker' | 'defender', now: number): void {
    const look = UNIT_LOOK[s.unit.type], rand = mulberry32(s.unit.id * 13 + Math.floor(now * 10));
    const keep = hp <= 0 ? 0 : look.party === 'formation' && !s.unit.embarked ? figuresFor(hp, look.count) : s.figures.length;
    // (Shot at, a figure falls as the shot aimed at it lands (fighting());
    // failing that, as the fight ends.)
    s.figures.forEach((f, i) => { if (i >= keep) f.fall = now + (attack.close ? fallShare(attack, side, rand()) : 0.97) * durOf(attack); });
  }

  // Every frame: marching and fighting units move on, and every figure is
  // drawn where it stands. `pxPerUnit`: screen pixels per world unit at
  // distance 1 (figures too small to see are not drawn).
  update(now: number, camera: THREE.Camera, pxPerUnit: number): void {
    const dt = Math.max(0, Math.min(0.1, now - this.now));
    this.time.value = now;
    this.now = now;
    const drawn: Shown[] = [], need = new Map<string, number>();
    let figures = 0;
    for (const s of [...this.shown.values()]) {
      if (s.fight) this.fighting(s, now, dt);
      else if (s.march && now >= s.march.t0) {
        const t = Math.min(1, (now - s.march.t0) / s.march.dur);
        s.dir.copy(s.march.from).lerp(s.march.to, t).normalize();
        this.face(s, s.march.to.clone().sub(s.march.from));
        if (t >= 1) {
          if (s.route.length) this.marchOn(s, s.march.to.clone(), s.march.t0 + s.march.dur);
          else { s.march = null; this.settle(s, s.k); }
        } else this.layout(s);
      }
      if (!this.shown.has(s.unit.id)) continue;
      this.stride(s, now, dt);
      const ground = this.env.ground(s.dir);
      s.flag.position.copy(s.dir).multiplyScalar(1 + Math.max(ground.ground, ground.water) + FLAG_LIFT * this.size);
      if ((this.size * pxPerUnit) / camera.position.distanceTo(s.flag.position) < MIN_PX) continue;
      drawn.push(s);
      for (const f of s.figures) {
        const key = this.key(s, f);
        need.set(key, (need.get(key) ?? 0) + 1);
        if (f.hair >= 0) need.set(`hair|${f.hair}`, (need.get(`hair|${f.hair}`) ?? 0) + 1);
      }
      figures += s.figures.length;
    }
    // (The dead, until they have sunk away.)
    this.corpses = this.corpses.filter((c) => this.gone(c, now) < 1);
    for (const c of this.corpses) {
      need.set(c.key, (need.get(c.key) ?? 0) + 1);
      if (c.hair >= 0) need.set(`hair|${c.hair}`, (need.get(`hair|${c.hair}`) ?? 0) + 1);
    }
    for (const [key, n] of need) this.mesh(key, n);
    if (this.shadows.instanceMatrix.count < figures) this.growShadows(figures);
    const counts = new Map<string, number>();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), basis = new THREE.Matrix4(), scale = new THREE.Vector3();
    const x = new THREE.Vector3(), z = new THREE.Vector3(), color = new THREE.Color(), head = new THREE.Vector3();
    let shadowN = 0;
    const tip = new THREE.Quaternion(), turned = new THREE.Quaternion(), lift3 = new THREE.Vector3(), stepped = new THREE.Vector3();
    const put = (key: string, pos: THREE.Vector3, c: THREE.Color, f: { gait: number; skin: THREE.Color }, walk: number, strike: number, body: Bends, char = 0) => {
      const mesh = this.meshes.get(key)!, i = counts.get(key) ?? 0;
      counts.set(key, i + 1);
      mesh.setMatrixAt(i, m.compose(pos, turned, scale.setScalar(this.size)));
      mesh.setColorAt(i, c);
      (mesh.geometry.getAttribute('aAnim') as THREE.InstancedBufferAttribute).setXYZW(i, f.gait, walk, strike, body[4]);
      (mesh.geometry.getAttribute('aSkinTone') as THREE.InstancedBufferAttribute).setXYZW(i, f.skin.r, f.skin.g, f.skin.b, body[5]);
      (mesh.geometry.getAttribute('aPose') as THREE.InstancedBufferAttribute).setXYZW(i, body[0], body[1], body[2], body[3]);
      (mesh.geometry.getAttribute('aMore') as THREE.InstancedBufferAttribute).setXYZ(i, body[6], body[7], char);
    };
    for (const s of drawn) {
      const { strike } = this.pose(s, now), wreck = wreckOf(s.unit);
      color.set(s.unit.color);
      for (const f of s.figures) {
        const [lift, back] = headOffset(s.unit.type, f.variant), walk = walkOf(f.speed);
        // (Model axes: x = up × forward, y up, z forward; struck down, tipped over.)
        x.crossVectors(f.up, f.head).normalize();
        z.crossVectors(x, f.up).normalize();
        q.setFromRotationMatrix(basis.makeBasis(x, f.up, z));
        // (People and horses posed as they act (unitAnim.ts); struck down,
        // falling. A rider's body doesn't bend: he sits his horse.)
        const body = falls(s.unit.type) && !s.unit.embarked, horse = rides(s.unit.type, f.variant), beat = f.beat ?? f.phase / (Math.PI * 2);
        let at = f.pos, legs = walk, arm = strike, bends: Bends = FLAT, char = 0;
        turned.copy(q);
        if (body && now > f.fall) {
          turned.multiply(deathTurn(tip, now - f.fall, beat, horse));
          const fold = deathBend(now - f.fall, beat);
          legs = deathLegs(now - f.fall, horse); arm = 3 + fold.arm; bends = horse ? FLAT : [fold.bend, 0, fold.crouch, 0.6, fold.aim, 1, 0.4, 0];
          if (!horse) at = stepped.copy(f.pos).addScaledVector(f.up, -dropOf(fold.crouch) * this.size);
        } else if (body) {
          const p = poseOf(this.cue(s, f, now), now, f.phase, beat, walk, horse, whirls(s.unit.type), s.unit.fortified === true && !s.march, bowman(s.unit.type));
          turned.multiply(poseTurn(tip, p));
          // (Crouched, lower: the legs fold under it.)
          const [ry, rz] = rearShift(p);
          at = stepped.copy(f.pos).addScaledVector(z, (p.lunge + rz) * this.size).addScaledVector(f.up, (p.rise + ry - dropOf(p.crouch)) * this.size);
          // (Walking to its place while it acts: its legs walk.)
          legs = p.walk === 0 && walk > 0.3 ? walk : legsOf(p); arm = armOf(p); bends = horse ? [0, 0, 0, p.elbow, p.aim, p.aimed, p.guard, p.draw] : [p.bend, p.twist, p.crouch, p.elbow, p.aim, p.aimed, p.guard, p.draw];
        } else if (wreck) {
          // (A machine: its recoil, the swell or the ground under it; struck, a burning wreck.)
          const mp = machinePose(wreck === 'sea', now - f.shot, now, f.phase, f.speed, now > f.fall ? now - f.fall : -1);
          turned.multiply(tip.setFromEuler(new THREE.Euler(mp.pitch, 0, mp.roll, 'YXZ')));
          at = stepped.copy(f.pos).addScaledVector(z, -mp.back * this.size).addScaledVector(f.up, -mp.drop * this.size);
          char = mp.char;
          arm = flingOf(now - f.shot); // (an engine's throwing arm, if it has one)
          if (now > f.fall) f.smoke = this.volleys.burn(at, now, f.smoke, wreck === 'sea', f.phase);
        }
        put(this.key(s, f), at, color, f, legs, arm, bends, char);
        if (f.hair >= 0) put(`hair|${f.hair}`, head.copy(at).add(lift3.set(0, lift * this.size, back * this.size).applyQuaternion(turned)), f.hairColor, f, legs, 0, bends);
        // Its shadow: a soft disc on the ground under it (longer under a horse).
        // (On the ground under it, however high it flies: smaller the higher.)
        const high = 1 / (1 + 0.5 * s.alt);
        m.compose(f.pos.clone().addScaledVector(f.up, (0.002 - s.alt) * this.size), q, scale.set(this.size * high * (isMachine(s.unit.type) ? 0.8 : 0.42), 1, this.size * high * (isMachine(s.unit.type) ? 1.4 : rides(s.unit.type, f.variant) ? 0.95 : 0.42)));
        this.shadows.setMatrixAt(shadowN++, m);
      }
    }
    for (const c of this.corpses) {
      const since = now - c.fall, fold = deathBend(since, c.beat);
      x.crossVectors(c.up, c.face).normalize();
      z.crossVectors(x, c.up).normalize();
      q.setFromRotationMatrix(basis.makeBasis(x, c.up, z));
      turned.copy(q).multiply(deathTurn(tip, since, c.beat, c.horse));
      if (c.wreck) {
        // (A wreck: burning, then sunk away.)
        const mp = machinePose(c.wreck === 'sea', -1, now, c.phase, 0, since);
        q.multiply(tip.setFromEuler(new THREE.Euler(mp.pitch, 0, mp.roll, 'YXZ')));
        turned.copy(q);
        const at = stepped.copy(c.pos).addScaledVector(c.up, -(mp.drop + 0.6 * this.gone(c, now)) * this.size);
        put(c.key, at, c.color, { gait: 0, skin: c.skin }, 0, 0, FLAT, 1);
        if (this.gone(c, now) < 0.5) c.smoke = this.volleys.burn(at, now, c.smoke, c.wreck === 'sea', c.phase);
        continue;
      }
      const at = stepped.copy(c.pos).addScaledVector(c.up, -0.5 * this.size * sunk(since)), bends: Bends = c.horse ? FLAT : [fold.bend, 0, fold.crouch, 0.6, fold.aim, 1, 0.4, 0];
      const g = { gait: c.phase, skin: c.skin };
      put(c.key, at, c.color, g, deathLegs(since, c.horse), 3 + fold.arm, bends);
      if (c.hair >= 0) put(`hair|${c.hair}`, head.copy(at).add(lift3.set(0, c.lift[0] * this.size, c.lift[1] * this.size).applyQuaternion(turned)), c.hairColor, g, 3, 0, bends);
    }
    for (const [key, mesh] of this.meshes) {
      mesh.count = counts.get(key) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.getAttribute('aAnim').needsUpdate = true;
      mesh.geometry.getAttribute('aSkinTone').needsUpdate = true;
      mesh.geometry.getAttribute('aPose').needsUpdate = true;
      mesh.geometry.getAttribute('aMore').needsUpdate = true;
    }
    this.shadows.count = shadowN;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.volleys.update(now);
  }

  // A fight going on, as its play says: out, striking, back home; its
  // shots loosed on time. Over, the fallen leave.
  private fighting(s: Shown, now: number, dt: number): void {
    const f = s.fight!, t = (now - f.t0) / durOf(f.attack);
    if (t >= 1) {
      s.fight = null;
      s.after = f;
      s.alt = 0;
      // (The fallen stay where they lie.)
      const wreck = wreckOf(s.unit);
      if ((falls(s.unit.type) && !s.unit.embarked) || wreck) {
        for (const g of s.figures) {
          if (g.fall > now) continue;
          const [lift, back] = headOffset(s.unit.type, g.variant);
          this.corpses.push({ wreck: falls(s.unit.type) && !s.unit.embarked ? null : wreck, smoke: g.smoke, key: this.key(s, g), hair: g.hair, hairColor: g.hairColor, skin: g.skin, phase: g.phase, color: new THREE.Color(s.unit.color), pos: g.pos.clone(), up: g.up.clone(),
            face: g.head.clone(), fall: g.fall, beat: g.beat ?? g.phase / (Math.PI * 2), horse: rides(s.unit.type, g.variant), lift: [lift, back] });
        }
      }
      for (const g of s.figures) Object.assign(g, unfought());
      if (s.gone) { this.drop(s); return; }
      s.dir.copy(f.home);
      s.laid = null; // (each walks back to its place from wherever the fight left it)
      if (!s.march) this.settle(s, s.k);
      return;
    }
    const p = f.play, { out, back } = playAt(p, t);
    s.alt = (p.fly ?? 0) * out;
    this.retarget(s, now);
    if (f.side === 'defender' && f.attack.close && t > f.play.strike[0] + 0.03 && t < f.play.strike[1]) this.join(s, now);
    if (s.figures.some((g) => g.goal)) this.duel(s, t, dt);
    else {
      s.dir.copy(f.home).lerp(f.at, CHARGE * p.charge * out).normalize();
      if (back) this.face(s, f.home.clone().sub(f.at)); else this.faceFoe(s, f.at.clone().sub(f.home));
      this.layout(s);
      // (Each turned to whoever comes at it.)
      for (const g of s.figures) g.face = g.foeFig ? this.tangent(g.up, g.foeFig.up.clone().sub(g.up)) : g.foe ? this.tangent(g.up, g.foe.clone().sub(g.up)) : null;
    }
    const shot = p.shots[f.fired];
    if (shot && t > shot.t) {
      f.fired++;
      // (Shooting, not coming on: the enemy's figures doomed to fall by this
      // shot (theirs shared out among the shots) are each aimed at, and
      // fall as it lands.)
      const marks = !f.attack.close ? f.enemy.filter((g) => Number.isFinite(g.fall)).sort((x, y) => x.fall - y.fall) : [];
      const n = p.shots.length, mine = marks.filter((_, k) => Math.floor((k * n) / marks.length) === f.fired - 1);
      const shooters = s.figures.map((_, i) => i).filter((i) => s.figures[i]!.fall > now);
      const aims: (THREE.Vector3 | null)[] = s.figures.map(() => null);
      mine.forEach((g, k) => { const i = shooters[k % Math.max(1, shooters.length)]; if (i !== undefined) aims[i] = g.pos.clone().addScaledVector(g.up, 0.45 * this.size); });
      const { fire, land } = this.volleys.loose(s.figures.map((g) => g.pos.clone().addScaledVector(g.up, 0.75 * this.size)), f.at, this.env.step * 0.12, now, f.fired * 7 + s.unit.id, shot.kind, aims);
      s.figures.forEach((g, i) => { if (g.fall > now) g.shot = fire[i] ?? now; });
      mine.forEach((g, k) => { const i = shooters[k % Math.max(1, shooters.length)]; const t = i === undefined ? undefined : land[i]; if (t !== undefined) g.fall = t; });
    }
  }

  // A melee's attacking figures, `t` into the fight: each out to its goal
  // (or as far as it got before it fell), facing it, then its foe, then
  // turned about to go home.
  // (Turned to a new foe, it walks over to it.)
  private duel(s: Shown, t: number, dt: number): void {
    const p = s.fight!.play, afloat = this.afloat(s.unit), d = new THREE.Vector3(), side = new THREE.Vector3(), now = this.now;
    for (const f of s.figures) {
      if (!f.goal || !f.home) continue;
      const reach = f.reach ?? f.goal;
      if (now < f.fall) {
        d.copy(f.goal).sub(reach);
        const len = d.length(), step = SHUFFLE * this.size * dt;
        if (len > step) reach.addScaledVector(d, step / len); else reach.copy(f.goal);
      }
      const { out, back } = figureOut(p, Math.min(t, (f.fall - s.fight!.t0) / durOf(s.fight!.attack)), f.delay);
      side.crossVectors(f.goal.clone().sub(f.home), f.home).normalize();
      this.place(s, f, d.copy(f.home).lerp(reach, out).addScaledVector(side, bow(f.curve, out) * this.size).normalize(), afloat);
      f.off.copy(f.up).sub(f.at); // (from here it walks to its place once the fight is over)
      const foe = f.foeFig?.up ?? f.foe ?? f.goal;
      f.face = this.tangent(f.up, back ? f.home.clone().sub(reach) : out < 0.98 ? f.goal.clone().sub(f.home) : foe.clone().sub(f.up));
    }
  }
  // In a melee, a defender's figure no one has come at (a rear rank) steps
  // up to the nearest attacker within a few paces and joins in, standing at
  // striking distance from it: the fight becomes one press, as in Civ V.
  private join(s: Shown, now: number): void {
    const enemy = s.fight!.enemy;
    for (const f of s.figures) {
      if (f.foeFig || now > f.fall) continue;
      let best: Figure | null = null, bd = (3 * this.size) ** 2;
      for (const g of enemy) {
        if (g.fall <= now || !g.goal) continue;
        const dd = f.up.distanceToSquared(g.up);
        if (dd < bd) { bd = dd; best = g; }
      }
      if (!best) continue;
      f.foeFig = best;
      f.beat = (best.beat ?? best.phase / (Math.PI * 2)) + 0.5;
      // (To arm's length of it, a little to one side of whoever is already at it.)
      const away = f.up.clone().sub(best.up), reach = 0.75 * this.size;
      away.addScaledVector(best.up, -away.dot(best.up));
      if (away.length() > reach) {
        f.at.copy(best.up).addScaledVector(away.normalize(), reach).normalize();
        f.off.copy(f.up).sub(f.at);
        f.still = false;
        f.held = true;
      }
    }
  }
  // In a melee, a figure whose foe is struck down (and has had a moment to
  // fall) turns to another: an attacker to the nearest enemy still on his
  // feet, going to stand at striking distance from it (whose own foe, if
  // down, it becomes); a defender to whoever else has come at it. With no
  // one left, it stands ready (its cue: unengaged).
  private retarget(s: Shown, now: number): void {
    const enemy = s.fight!.enemy;
    if (!enemy.length) return;
    for (const f of s.figures) {
      const foe = f.foeFig;
      if (!foe || now > f.fall || foe.fall + 0.35 > now) continue;
      let best: Figure | null = null, bd = (5 * this.size) ** 2;
      for (const g of enemy) {
        if (g.fall <= now || (!f.goal && g.foeFig !== f)) continue;
        const dd = f.up.distanceToSquared(g.up);
        if (dd < bd) { bd = dd; best = g; }
      }
      if (!best) continue;
      f.foeFig = best;
      f.beat = (best.beat ?? best.phase / (Math.PI * 2)) + 0.5;
      if (f.goal) {
        const away = f.up.clone().sub(best.up);
        away.addScaledVector(best.up, -away.dot(best.up));
        if (away.lengthSq() < 1e-14) continue;
        f.goal = best.up.clone().addScaledVector(away.normalize(), f.gap).normalize();
        if (!best.foeFig || best.foeFig.fall + 0.35 <= now) best.foeFig = f;
      }
    }
  }
  // A figure's cue in its fight now (unitAnim.ts), or null if it isn't in
  // one (or the fight is long over, or it has marched off).
  private cue(s: Shown, f: Figure, now: number): Cue | null {
    const c = s.fight ?? s.after;
    if (!c) return null;
    const sec = now - c.t0;
    const dur = durOf(c.attack);
    if (!s.fight && (sec > dur + AFTER || (s.march && now >= s.march.t0))) { s.after = null; return null; }
    // (Its foe struck down and no other to turn to: it stands ready.)
    const engaged = f.foeFig ? f.foeFig.fall + 0.35 > now : f.goal !== null || f.foe !== null;
    const rear = s.order === 'line' && (orderSlots(s.unit.type, s.figures.length, 'line')[f.slot]?.[1] ?? 0) < 0;
    return { rear, sec, dur, play: c.play, attack: c.attack, side: c.side, engaged, delay: f.delay, fall: f.fall - c.t0, won: c.won };
  }
  // How far a corpse has sunk away (0..1): the dead after a while, wrecks
  // when they have burnt out.
  private gone(c: Corpse, now: number): number {
    const since = now - c.fall;
    return c.wreck ? Math.max(0, Math.min(1, (since - WRECK) / (2 * SINK))) : sunk(since);
  }
  // `v` made tangent at `at` (unit length), or null if it has no length there.
  private tangent(at: THREE.Vector3, v: THREE.Vector3): THREE.Vector3 | null {
    v.addScaledVector(at, -v.dot(at));
    return v.lengthSq() > 1e-14 ? v.normalize() : null;
  }

  // How a unit moves now: marching (legs), striking (arms).
  private pose(s: Shown, now: number): { walk: number; strike: number } {
    if (s.fight) {
      const { moving, strike } = playAt(s.fight.play, (now - s.fight.t0) / durOf(s.fight.attack));
      return { walk: moving ? (s.fight.play.charge > 1 ? 1.4 : 1) : 0, strike };
    }
    return { walk: s.march && now >= s.march.t0 ? 1 : 0, strike: 0 };
  }

  // Turned to fight an enemy that way: a ship with guns along its sides
  // turns its side to it (whichever is the nearer turn), the others face it.
  private faceFoe(s: Shown, toward: THREE.Vector3): void {
    if (BROADSIDE.has(s.unit.type) && !s.unit.embarked) {
      const beam = toward.clone().cross(s.dir);
      this.face(s, beam.dot(s.forward) >= 0 ? beam : beam.negate());
    } else this.face(s, toward);
  }
  // Turned along `heading` (made tangent at the unit's spot).
  private face(s: Shown, heading: THREE.Vector3): void {
    heading.addScaledVector(s.dir, -heading.dot(s.dir));
    if (heading.lengthSq() > 1e-14) s.forward.copy(heading.normalize());
  }

  private key(s: Shown, f: Figure): string { return s.unit.embarked ? `transport|${s.unit.civ}|0|0` : `${s.unit.type}|${s.unit.civ}|${f.variant}|${f.female ? 1 : 0}`; }

  dispose(): void {
    for (const s of this.shown.values()) s.flag.material.dispose();
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.material.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.volleys.dispose();
  }

  // ---- placing ----

  private add(u: ShownUnit, k: number): Shown {
    const rand = mulberry32(u.id * 7919 + 1);
    const a = rand() * Math.PI * 2, c = this.env.center(u.tile);
    const east = new THREE.Vector3(0, 1, 0).cross(c);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const north = c.clone().cross(east);
    const s: Shown = {
      unit: u, dir: c.clone(), forward: east.multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a)).normalize(),
      figures: [], spread: LOOSE[0], order: 'block', laid: null, alt: 0, march: null, route: [], fight: null, after: null, gone: false, flag: this.makeFlag(u), k, seen: true,
    };
    this.group.add(s.flag);
    this.shown.set(u.id, s);
    this.settle(s, k);
    return s;
  }

  private drop(s: Shown): void {
    this.group.remove(s.flag);
    s.flag.material.dispose();
    this.shown.delete(s.unit.id);
  }

  // Stands a unit on its tile: where and facing which way every figure is
  // on dry ground, the ranks closed up if need be.
  private settle(s: Shown, k: number): void {
    const { dir, forward, spread } = this.spot(s.unit, k, s.forward);
    s.dir.copy(dir);
    s.forward.copy(forward);
    s.spread = spread;
    this.dress(s);
    this.layout(s);
  }

  // The figures of a unit, in ranks (the front rank full first; a hurt
  // formation loses men from the back), each with its own skin, hair, gait
  // and (for horses) coat.
  // (Dressed anew, as its strength changes, the figures it keeps go on
  // from where they stand, as they were moving.)
  private dress(s: Shown, keep = true): void {
    const u = s.unit, rand = mulberry32(u.id * 104729 + 3), old = keep ? s.figures : [];
    const motion = (i: number, phase: number) => {
      const o = old[i];
      return o ? { at: o.at, off: o.off, still: false, head: o.head, last: o.last, speed: o.speed, gait: o.gait, fresh: o.fresh, pos: o.pos, up: o.up }
        : { at: new THREE.Vector3(), off: new THREE.Vector3(), still: false, head: s.forward.clone(), last: new THREE.Vector3(), speed: 0, gait: phase, fresh: true, pos: new THREE.Vector3(), up: new THREE.Vector3() };
    };
    // (Embarked: its one boat.)
    if (u.embarked) { s.figures = [{ jx: 0, jz: 0, slot: 0, variant: 0, female: false, skin: new THREE.Color(), hair: -1, hairColor: new THREE.Color(), phase: 0, ...motion(0, 0), ...unfought() }]; return; }
    // (The slots jittered apart from the looks: a figure keeps its looks as the formation thins.)
    const exact = orderSlots(u.type, figuresOf(u), 'block');
    s.figures = formationSlots(u.type, u.hp, mulberry32(u.id * 7 + 5)).map(([x, z], i) => {
      const variant = variantOf(u.type, i, rand), looks = figureLooks(u.type, u.civ, womenShare(u.type, u.suffrage), rand), phase = rand() * Math.PI * 2;
      return { jx: x - exact[i]![0], jz: z - exact[i]![1], slot: i, variant, ...looks, phase, ...motion(i, phase), ...unfought() };
    });
  }

  // Where each figure stands now: around the unit's spot, on the ground
  // (ships and boats on the water; aircraft up as high as they fly).
  // Its order as it is doing now (formation.ts); laid out anew (turned,
  // reordered, closed up, thinned), each figure goes to the place nearest
  // it and walks there from where it stands (fresh ones are stood there).
  private layout(s: Shown): void {
    const right = new THREE.Vector3().crossVectors(s.forward, s.dir).normalize();
    // (Fortified, at rest: its ranks closed up.)
    const order = this.orderOf(s), places = s.unit.embarked ? [[0, 0] as const] : orderSlots(s.unit.type, s.figures.length, order);
    const spread = s.spread * (s.unit.fortified && order === 'block' && !s.fight ? 0.78 : 1);
    const dirs = s.figures.map((f, i) => this.figureDir(s.dir, s.forward, right, (places[i]![0] + f.jx) * spread, (places[i]![1] + f.jz) * spread));
    const l = s.laid, anew = !l || l.order !== order || l.spread !== spread || l.n !== s.figures.length || l.fwd.dot(s.forward) < 0.9999;
    s.order = order;
    s.laid = { fwd: s.forward.clone(), spread, n: s.figures.length, order };
    if (anew) {
      if (s.figures.some((f) => f.fresh)) s.figures.forEach((f, i) => { f.slot = i; });
      else {
        // (Nearest first: each figure to the free place nearest it.)
        const pairs: [number, number, number][] = [];
        s.figures.forEach((f, i) => dirs.forEach((d, j) => pairs.push([f.up.distanceToSquared(d), i, j])));
        pairs.sort((a, b) => a[0] - b[0]);
        const took = new Set<number>(), given = new Set<number>();
        for (const [, i, j] of pairs) if (!took.has(i) && !given.has(j)) { took.add(i); given.add(j); s.figures[i]!.slot = j; }
      }
    }
    const afloat = this.afloat(s.unit);
    for (const f of s.figures) {
      if (f.held) continue;
      f.at.copy(dirs[f.slot]!);
      f.still = false;
      if (f.fresh) { f.fresh = false; f.off.set(0, 0, 0); f.head.copy(s.forward); this.place(s, f, f.at, afloat); f.last.copy(f.pos); }
      else if (anew) f.off.copy(f.up).sub(f.at);
    }
  }
  // How a unit's figures stand now: in a column on the march, in a line
  // shooting where they stand, else in their ranks.
  private orderOf(s: Shown): Order {
    if (!reforms(s.unit.type) || s.unit.embarked) return 'block';
    if (s.march && this.now >= s.march.t0) return 'column';
    const p = s.fight?.play;
    return p && !p.close && p.charge === 0 && p.shots.length ? 'line' : 'block';
  }
  // Every frame: each figure (but those running at a foe, or struck down)
  // walks on towards its place; then how fast each is going sets its legs'
  // beat, and it turns towards where it goes (going fast enough) or else
  // the way it faces.
  private stride(s: Shown, now: number, dt: number): void {
    const afloat = this.afloat(s.unit), d = new THREE.Vector3(), want = new THREE.Vector3(), rate = (isMachine(s.unit.type) ? TURN_MACHINE : TURN) * dt;
    for (const f of s.figures) {
      const running = s.fight !== null && f.goal !== null, down = now > f.fall;
      // (One stood at its place, its place unmoved, needn't be stood there again: the ground isn't sampled for it.)
      if (!running && !down && !f.still) {
        const len = f.off.length();
        if (len > 1e-9) {
          const step = (SHUFFLE + (SHUFFLE_FAR * len) / this.size) * this.size * dt;
          f.off.multiplyScalar(Math.max(0, len - step) / len);
        } else f.still = true;
        this.place(s, f, d.copy(f.at).add(f.off).normalize(), afloat);
      }
      if (dt <= 0) continue;
      d.copy(f.pos).sub(f.last);
      const inst = d.length() / this.size / dt;
      f.speed += (inst - f.speed) * Math.min(1, dt * 12);
      f.last.copy(f.pos);
      f.gait = (f.gait + dt * cadenceOf(f.speed)) % (Math.PI * 2);
      if (down) continue;
      // (Running on dry ground: dust kicked up behind it, more under a horse.)
      if (f.speed > DUSTY && !afloat && now >= f.dust && s.alt === 0) {
        const horse = rides(s.unit.type, f.variant) || isMachine(s.unit.type);
        this.volleys.dust(f.pos.clone().addScaledVector(d.normalize(), -0.3 * this.size), now, horse ? 1.6 : 1);
        f.dust = now + (horse ? 0.07 : 0.13) * (0.7 + 0.6 * Math.random());
      }
      // (Turned at its pace, on the ground where it stands.)
      want.copy(f.speed > 0.8 && inst > 0.4 ? d : f.face ?? s.forward);
      // (At ease, each stands its own way, a little off its file's line.)
      if (!s.fight && !s.march && !s.unit.fortified && f.speed < 0.3) want.applyAxisAngle(f.up, 0.35 * (frac(f.phase * 1.7) - 0.5));
      want.addScaledVector(f.up, -want.dot(f.up));
      f.head.addScaledVector(f.up, -f.head.dot(f.up)).normalize();
      if (want.lengthSq() < 1e-14) continue;
      want.normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, f.head.dot(want))));
      if (ang <= rate) { f.head.copy(want); continue; }
      const sign = Math.sign(new THREE.Vector3().crossVectors(f.head, want).dot(f.up)) || 1;
      f.head.applyAxisAngle(f.up, sign * rate).normalize();
    }
  }
  // A figure stood at `d` (a unit vector).
  private place(s: Shown, f: Figure, d: THREE.Vector3, afloat: boolean): void {
    const h = this.env.ground(d);
    f.up.copy(d);
    // (Aircraft at sea stand on their carrier's deck.)
    const deck = afloat && domainOf(unitDef(s.unit.type)) === 'air' ? CARRIER_DECK * this.size : 0;
    f.pos.copy(d).multiplyScalar(1 + (afloat ? Math.max(h.ground, h.water) : Math.max(h.ground, h.water - 0.0004)) + deck + s.alt * this.size);
  }
  // Afloat: ships, boats, and aircraft on a carrier (their tile water).
  private afloat(u: ShownUnit): boolean {
    const dom = domainOf(unitDef(u.type));
    if (dom === 'air') { const h = this.env.ground(this.env.center(u.tile)); return h.water > h.ground; }
    return u.embarked === true || dom === 'sea';
  }

  private figureDir(c: THREE.Vector3, forward: THREE.Vector3, right: THREE.Vector3, x: number, z: number): THREE.Vector3 {
    return c.clone().addScaledVector(right, -x * this.size).addScaledVector(forward, z * this.size).normalize();
  }

  // A spot on a unit's tile where all its figures stand dry (ships: all
  // afloat): the middle
  // first (the k-th unit on a tile a little off it), facing its way or
  // turned, then spots further out; failing that, closer ranks; failing
  // that, the spot with the most figures dry.
  private spot(u: ShownUnit, k: number, facing: THREE.Vector3): { dir: THREE.Vector3; forward: THREE.Vector3; spread: number } {
    const c = this.env.center(u.tile), look = UNIT_LOOK[u.type], afloat = this.afloat(u);
    const n = figuresOf(u);
    const cols = colsOf(u.type, look.count), rows = Math.ceil(n / cols);
    const east = new THREE.Vector3(0, 1, 0).cross(c);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const north = c.clone().cross(east);
    const tangent = (a: number) => east.clone().multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a));
    const face = facing.clone().addScaledVector(c, -facing.dot(c)).normalize();
    const faceA = Math.atan2(face.dot(north), face.dot(east));
    const centres: THREE.Vector3[] = [];
    const ring = (r: number, m: number, a0: number) => { for (let i = 0; i < m; i++) centres.push(c.clone().addScaledVector(tangent(a0 + (i / m) * Math.PI * 2), r * this.env.step).normalize()); };
    if (k === 0) centres.push(c.clone());
    ring(0.14 + 0.06 * Math.min(k, 2), 6, k * 0.7);
    ring(0.26, 8, 0.3);
    let best = { dir: c.clone(), forward: face, spread: LOOSE[0] as number }, bestDry = -1;
    for (const spread of LOOSE) {
      for (const at of centres) {
        for (const turn of [0, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI]) {
          const a = faceA + turn;
          const fwd = tangent(a).addScaledVector(at, -tangent(a).dot(at)).normalize();
          const right = new THREE.Vector3().crossVectors(fwd, at).normalize();
          let dry = 0;
          for (let i = 0; i < n; i++) {
            const r = Math.floor(i / cols), col = i % cols;
            const x = (col - (cols - 1) / 2) * look.spacing[0] * spread, z = ((rows - 1) / 2 - r) * look.spacing[1] * spread;
            const h = this.env.ground(this.figureDir(at, fwd, right, x, z));
            if ((h.water - h.ground <= DRY) !== afloat) dry++; // (afloat: in the water)
          }
          if (dry > bestDry) { bestDry = dry; best = { dir: at.clone(), forward: fwd, spread }; }
          if (dry === n) return best;
        }
      }
    }
    return best;
  }

  // ---- drawing ----

  // The instanced mesh of a model (type|civ|variant, or hair|style), room
  // for `need` figures.
  private mesh(key: string, need: number): THREE.InstancedMesh {
    let mesh = this.meshes.get(key);
    if (mesh && mesh.instanceMatrix.count >= need) return mesh;
    const cap = Math.max(64, need, mesh ? mesh.instanceMatrix.count * 2 : 0);
    const [a, b, c, d] = key.split('|') as [string, string, string | undefined, string | undefined];
    const geo = mesh ? mesh.geometry : a === 'hair' ? hairModel(HAIR_STYLES[Number(b)]!) : a === 'transport' ? transportModel() : unitModel(a as UnitKey, b as ArchCiv, Number(c), d === '1');
    prepareUnitGeometry(geo, cap);
    const next = new THREE.InstancedMesh(geo, this.material, cap);
    next.setColorAt(0, new THREE.Color());
    next.receiveShadow = true;
    next.frustumCulled = false;
    next.userData['stat'] = 'units';
    if (mesh) { this.group.remove(mesh); mesh.dispose(); }
    this.meshes.set(key, next);
    this.group.add(next);
    mesh = next;
    return mesh;
  }

  private makeShadows(cap: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, cap);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.userData['stat'] = 'units';
    return mesh;
  }

  private growShadows(need: number): void {
    const next = this.makeShadows(Math.max(need, this.shadows.instanceMatrix.count * 2));
    this.group.remove(this.shadows);
    this.shadows.dispose();
    this.shadows = next;
    this.group.add(next);
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const frac = (x: number) => x - Math.floor(x);

// A figure's own looks, drawn from its civ's: a woman (with odds `women`)
// or a man, skin tone, hair style (by sex; fewer under a helmet: a beard,
// long hair, or none showing) and hair colour.
export function figureLooks(type: UnitKey, civ: ArchCiv, women: number, rand: () => number): { female: boolean; skin: THREE.Color; hair: number; hairColor: THREE.Color } {
  const g = GEAR[civ], pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const female = rand() < women, helmet = wearsHelmet(type, civ), styles = HAIR_BY[female ? 'woman' : 'man'];
  const style = pick(helmet ? styles.helmet : styles.bare);
  // (Machines: no one shows.)
  const none = isMachine(type) || (style === 'bald' && helmet);
  return { female: female && !isMachine(type), skin: new THREE.Color(pick(g.skin)), hair: none ? -1 : HAIR_STYLES.indexOf(style), hairColor: new THREE.Color(pick(g.hair)) };
}

// Arrows in flight: each volley a dozen, from the archers to around the
// target, arcing high; drawn as short dark strokes. Positions in world
// units; up: the local vertical at each arrow (the direction from the
// globe's center, or a fixed up given as `flatUp`).
// What flies, by kind: how high it arcs (a share of the distance), how
// long it takes (seconds, and up to so much longer), how long a streak it
// draws (figure heights), its colour.
const FLIGHT: Record<Projectile, { arc: number; dur: number; jitter: number; len: number; color: number }> = {
  arrow: { arc: 0.3, dur: 0.55, jitter: 0.15, len: 0.35, color: 0x2a2018 },
  stone: { arc: 0.6, dur: 1.0, jitter: 0.2, len: 0.14, color: 0x5a554c },
  shell: { arc: 0.1, dur: 0.35, jitter: 0.1, len: 0.2, color: 0x16161a },
  bullet: { arc: 0.01, dur: 0.14, jitter: 0.06, len: 0.55, color: 0xf2d27a },
};
// Smoke and fire (Volleys): soft round puffs, each growing, rising and
// fading over its life. A gun fired: a flash at the muzzle and a puff of
// white smoke left hanging; a shell landing: a burst of fire and a cloud
// of dark smoke; a stone: a burst of dust.
interface Puff { at: THREE.Vector3; t0: number; life: number; size0: number; size1: number; alpha: number; color: number; rise: number }
const PUFF_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec4 aTint;
  uniform float uHalfHeight;
  varying vec4 vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * length(modelMatrix[0].xyz) * projectionMatrix[1][1] * uHalfHeight / -mv.z; // (sizes as the model is scaled)
    vTint = aTint;
  }`;
const PUFF_FRAGMENT = /* glsl */ `
  varying vec4 vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    // (Lumpy: brighter towards the top, softer at the edge.)
    float lump = 0.85 + 0.15 * sin(c.x * 17.0 + c.y * 11.0) * sin(c.y * 13.0 - c.x * 7.0);
    gl_FragColor = vec4(vTint.rgb * (1.05 - 0.25 * c.y) , vTint.a * smoothstep(1.0, 0.35, d) * lump);
  }`;

export class Volleys {
  readonly lines: THREE.LineSegments;
  private readonly arrows: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; kind: Projectile }[] = [];
  private readonly puffs: Puff[] = [];
  private readonly smoke: THREE.Points;
  private static readonly PUFFS = 1024;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private static readonly CAP = 512;

  constructor(private readonly size: number, private readonly flatUp: THREE.Vector3 | null = null) {
    this.pos = new Float32Array(Volleys.CAP * 6);
    this.col = new Float32Array(Volleys.CAP * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.lines.frustumCulled = false;
    this.lines.userData['stat'] = 'units';
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Volleys.PUFFS * 3), 3));
    pg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(Volleys.PUFFS), 1));
    pg.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(Volleys.PUFFS * 4), 4));
    const half = { value: 400 };
    this.smoke = new THREE.Points(pg, new THREE.ShaderMaterial({ vertexShader: PUFF_VERTEX, fragmentShader: PUFF_FRAGMENT, uniforms: { uHalfHeight: half }, transparent: true, depthWrite: false }));
    this.smoke.frustumCulled = false;
    this.smoke.onBeforeRender = (renderer) => { half.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2; };
    this.lines.add(this.smoke);
  }

  // Smoke or fire at `at` from `t0` (seconds) for `life`, growing from
  // size0 to size1 (figure heights), rising `rise` figure heights a second.
  private puff(at: THREE.Vector3, t0: number, life: number, size0: number, size1: number, alpha: number, color: number, rise: number): void {
    if (this.puffs.length < Volleys.PUFFS) this.puffs.push({ at: at.clone(), t0, life, size0, size1, alpha, color, rise });
  }

  // A volley from each of `from` at the spot `at` (scattered `spread` round it).
  // (Some may be aimed, each at its own mark: `aims`, by shooter. Returns
  // when each shot goes off, and when it lands.)
  loose(from: readonly THREE.Vector3[], at: THREE.Vector3, spread: number, now: number, seed: number, kind: Projectile = 'arrow', aims: readonly (THREE.Vector3 | null)[] = []): { fire: number[]; land: number[] } {
    const rand = mulberry32(seed * 9973 + 5), k = FLIGHT[kind];
    const up = this.flatUp ?? at.clone().normalize();
    const e = new THREE.Vector3(1, 0, 0).cross(up);
    if (e.lengthSq() < 1e-8) e.set(0, 0, 1);
    e.normalize();
    const n = up.clone().cross(e);
    const ground = this.flatUp ? at : at.clone().multiplyScalar(from[0] ? from[0].length() / at.length() : 1);
    const fire: number[] = [], land: number[] = [];
    for (const [i, f] of from.entries()) {
      if (this.arrows.length >= Volleys.CAP) break;
      const aim = aims[i];
      const scattered = ground.clone().addScaledVector(e, (rand() - 0.5) * 2 * spread).addScaledVector(n, (rand() - 0.5) * 2 * spread);
      const to = aim ? aim.clone() : scattered;
      const t0 = now + rand() * 0.15, dur = k.dur + rand() * k.jitter;
      fire.push(t0);
      land.push(t0 + dur);
      this.arrows.push({ from: f.clone(), to, t0, dur, kind });
      // (A gun: its flash and smoke at the muzzle, a little way towards the mark.)
      if (kind === 'bullet' || kind === 'shell') {
        const muzzle = f.clone().lerp(to, (0.35 * this.size) / Math.max(1e-6, f.distanceTo(to)));
        this.puff(muzzle, t0, 0.12, kind === 'shell' ? 0.7 : 0.4, kind === 'shell' ? 0.9 : 0.5, 1, 0xffc860, 0);
        this.puff(muzzle, t0 + 0.03, kind === 'shell' ? 2.6 : 1.8, kind === 'shell' ? 0.5 : 0.25, kind === 'shell' ? 1.8 : 1.0, 0.55, 0xe8e6e0, 0.25);
      }
      // (Where a shell or a stone lands: fire and smoke, or dust.)
      // (Raised off the ground by half their size: a puff is drawn at its middle's depth, and the ground before it would hide its lower half.)
      const lifted = (h: number) => to.clone().addScaledVector(this.flatUp ?? to.clone().normalize(), h * this.size);
      if (kind === 'shell') {
        this.puff(lifted(0.7), t0 + dur, 0.3, 0.8, 1.6, 1, 0xff9a30, 0.4);
        this.puff(lifted(1.0), t0 + dur + 0.05, 2.8, 0.6, 2.4, 0.65, 0x3a3632, 0.5);
      } else if (kind === 'stone') this.puff(lifted(0.6), t0 + dur, 1.6, 0.4, 1.5, 0.55, 0xb09a78, 0.3);
    }
    return { fire, land };
  }

  // Dust kicked up at `at` (a runner's feet), `big` times a man's.
  dust(at: THREE.Vector3, now: number, big: number): void {
    const up = (this.flatUp ?? at).clone().normalize();
    this.puff(at.clone().addScaledVector(up, 0.25 * big * this.size), now, 0.9, 0.2 * big, 0.65 * big, 0.32, 0xb8a888, 0.35);
  }

  // A wreck burning at `at`: flames licking up and a column of black smoke
  // (a ship's paler, steam and smoke), a puff every so often; returns when
  // the next is due (pass it back as `next`).
  burn(at: THREE.Vector3, now: number, next: number, sea: boolean, seed: number): number {
    if (now < next) return next;
    const up = (this.flatUp ?? at).clone().normalize(), r = frac(Math.sin(now * 91.7 + seed * 13.1) * 43758.5);
    const side = new THREE.Vector3(1, 0, 0).cross(up).normalize().multiplyScalar((r - 0.5) * 0.4 * this.size);
    const base = at.clone().addScaledVector(up, 0.45 * this.size).add(side);
    if (r < 0.6) this.puff(base, now, 0.45, 0.35, 0.6, 0.9, r < 0.3 ? 0xff7a20 : 0xffb040, 0.8);
    this.puff(base.addScaledVector(up, 0.2 * this.size), now, 3.2, 0.35, 1.8, sea ? 0.45 : 0.6, sea ? 0x6a6662 : 0x262422, 0.55);
    return now + 0.16 + 0.1 * r;
  }

  update(now: number): void {
    let n = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) if (now > this.arrows[i]!.t0 + this.arrows[i]!.dur) this.arrows.splice(i, 1);
    const p = new THREE.Vector3(), q = new THREE.Vector3(), up = new THREE.Vector3(), c = new THREE.Color();
    for (const a of this.arrows) {
      const t = (now - a.t0) / a.dur;
      if (t < 0) continue;
      const k = FLIGHT[a.kind];
      const at = (u: number, out: THREE.Vector3) => {
        out.copy(a.from).lerp(a.to, u);
        up.copy(this.flatUp ?? out).normalize();
        return out.addScaledVector(up, 4 * u * (1 - u) * k.arc * a.from.distanceTo(a.to));
      };
      at(t, p);
      at(Math.min(1, t + 0.06), q);
      const d = q.sub(p).normalize().multiplyScalar(k.len * this.size);
      this.pos.set([p.x, p.y, p.z, p.x + d.x, p.y + d.y, p.z + d.z], n * 6);
      c.setHex(k.color);
      this.col.set([c.r, c.g, c.b, c.r, c.g, c.b], n * 6);
      n++;
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.lines.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    // The smoke: each puff grown, risen and faded as far as its life has gone.
    for (let i = this.puffs.length - 1; i >= 0; i--) if (now > this.puffs[i]!.t0 + this.puffs[i]!.life) this.puffs.splice(i, 1);
    const g = this.smoke.geometry, pp = g.getAttribute('position') as THREE.BufferAttribute, ps = g.getAttribute('aSize') as THREE.BufferAttribute, pt = g.getAttribute('aTint') as THREE.BufferAttribute;
    let m = 0;
    for (const f of this.puffs) {
      const u = (now - f.t0) / f.life;
      if (u < 0) continue;
      up.copy(this.flatUp ?? f.at).normalize();
      p.copy(f.at).addScaledVector(up, f.rise * (now - f.t0) * this.size);
      pp.setXYZ(m, p.x, p.y, p.z);
      ps.setX(m, (f.size0 + (f.size1 - f.size0) * Math.sqrt(u)) * this.size);
      c.setHex(f.color);
      pt.setXYZW(m, c.r, c.g, c.b, f.alpha * (1 - u) * Math.min(1, u * 12 + 0.3));
      m++;
    }
    g.setDrawRange(0, m);
    pp.needsUpdate = ps.needsUpdate = pt.needsUpdate = true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    this.smoke.geometry.dispose();
    (this.smoke.material as THREE.Material).dispose();
  }
}
