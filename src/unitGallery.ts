// Units (dev tool, /units.html): the unit figurines (unitModels.ts) as the
// game shows them (unitView.ts), on a plain ground.
//   All units  every type (across) dressed by every civ (down). HP thins the
//              fighting formations as in the game (one figure per 8 HP or
//              part of it); Women's suffrage makes half of every unit women
//              (else about half the civilians, a tenth of the soldiers);
//              March sets them marching on the spot; Attack has
//              them fight, over and over (melee units charge forward and
//              strike, archers loose volleys forward).
//   Heroic     the figures in heroic proportions (people.ts HEROIC), or as
//              of old: to compare.
//   Slow       everything at a quarter of its speed (to watch a blow).
//   Battle     an attacker and a defender of your choosing, facing each
//              other: Fight resolves an attack by the game's own rules
//              (game.ts combatStrength, fightRounds), and the game's own
//              unit view (unitView.ts, on a patch of globe as flat as the
//              field) plays it out, leaving each side with the HP it has
//              left. Fight again to go on; Heal both to start over.

import './style.css';
import './topbar.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARCH_CIVS, type ArchCiv } from './architecture.ts';
import { CIVS, UNITS, domainOf, type UnitKey } from './rules.ts';
import { TECHS, TECH_KEYS } from './techs.ts';
import { POLITICS } from './politics.ts';
import { FORTIFY_BONUS, combatStrength, fightRounds, matchup, statOf } from './game.ts';
import { HEROIC } from './people.ts';
import { HAIR_STYLES, UNIT_LOOK, colsOf, formationSlots, hairModel, headOffset, isMachine, rides, unitModel, variantOf, whirls, bowman, cuts, thrusts, draws, bayonets, womenShare } from './unitModels.ts';
import { FIGHT, PLAYS, UnitView, Volleys, durOf, defendPlay, falls, figureLooks, makeUnitMaterial, playAt, playOf, prepareUnitGeometry, type Play, type ShownUnit } from './unitView.ts';
import type { P2 } from './duel.ts';
import { AFTER, armOf, dropOf, flingOf, legsOf, poseOf, poseTurn, rearShift, type Cue } from './unitAnim.ts';
import { UNIT_CLASS, attackBlock, attackStyle, canAssault, canAttackType, canShoot, defaultMode, siegeStyle, type AttackMode } from './unitClasses.ts';
import { WorldLabel, disposeLabels } from './worldLabel.ts';
import { triangles } from './lowpoly.ts';
import { mulberry32 } from './rng.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
const camera = new THREE.PerspectiveCamera(35, 1, 0.4, 500); // (near not too close: depth precision across the whole sheet)
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
// The game's light (render.ts LIGHT): a warm sun, a cool sky fill.
scene.add(new THREE.HemisphereLight(0xd9e9fc, 0x6a5a40, 1.05));
const sun = new THREE.DirectionalLight(0xffedd3, 1.85);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// By domain (land, then sea, then air, so the ships share one basin), then
// by the era a unit comes in (the tech or civic unlocking it), then by cost.
const DOMAIN_ORDER = { land: 0, sea: 1, air: 2 } as const;
const unlockEra = (k: UnitKey): number => {
  const e = Math.min(...TECH_KEYS.filter((t) => TECHS[t].units?.includes(k)).map((t) => TECHS[t].era as number), ...Object.values(POLITICS).filter((c) => c.units?.includes(k)).map((c) => c.era as number));
  return Number.isFinite(e) ? e : 0; // (none: there from the start)
};
const TYPES = (Object.keys(UNITS) as UnitKey[]).sort((a, b) => DOMAIN_ORDER[domainOf(UNITS[a])] - DOMAIN_ORDER[domainOf(UNITS[b])] || unlockEra(a) - unlockEra(b) || UNITS[a].cost - UNITS[b].cost);
const FIGHTERS = TYPES.filter(canAttackType);
const DEFENDERS = TYPES.filter((t) => !('civilian' in UNITS[t] && UNITS[t].civilian));
const CELL_W = 4.2, CELL_D = 4.4; // a cell of the sheet (figure heights), at least
// Each column of the sheet as wide as its unit's formation needs (aircraft
// and ships are wide), and where its middle is.
const COL_W = TYPES.map((type) => {
  const look = UNIT_LOOK[type], cols = colsOf(type, look.count), box = new THREE.Box3().setFromBufferAttribute(unitModel(type, 'Romans').getAttribute('position') as THREE.BufferAttribute);
  return Math.max(CELL_W, (cols - 1) * look.spacing[0] + (box.max.x - box.min.x) + 1.2);
});
const COL_X = COL_W.reduce<number[]>((xs, w, i) => [...xs, i === 0 ? 0 : xs[i - 1]! + (COL_W[i - 1]! + w) / 2], []);
const SEA_DEPTH = 0.45; // the ships' basin below the field (figure heights)
const BATTLE_GAP = 1 / 0.16;      // between the two sides of a battle: a tile step (unitView.ts FIGURE)
// A fight, as in the game (unitView.ts): as long as its attack lasts (durOf;
// then a pause of PAUSE seconds, looping on the sheet), and how far a melee unit charges (a share of the way to
// the enemy; on the sheet it charges SHEET_CHARGE figure heights; in a
// battle each of its figures goes at one of the enemy's: duel.ts).
const PAUSE = 0.8, CHARGE_SHARE = 0.42, SHEET_CHARGE = 1.6;
// The ground a defender can stand on (game: terrain.ts defence bonuses).
const GROUNDS = [
  { name: 'Open ground', bonus: 0 }, { name: 'Forest (+25%)', bonus: 0.25 }, { name: 'Hills (+50%)', bonus: 0.5 },
  { name: 'Forested hills (+75%)', bonus: 0.75 }, { name: 'Mountains (+100%)', bonus: 1 }, { name: 'Marsh (−15%)', bonus: -0.15 },
] as const;

const time = { value: 0 };
// The page's clock (seconds): real time, or slowed (Slow: `rate`).
let rate = 1, clockAt = performance.now() / 1000, clockReal = clockAt;
const pageNow = (): number => {
  const real = performance.now() / 1000;
  clockAt += (real - clockReal) * rate;
  clockReal = real;
  return clockAt;
};
const material = makeUnitMaterial(time);
// (A textured model's own material: its texture, unitView.ts makeUnitMaterial.)
const texturedMats = new Map<string, THREE.MeshStandardMaterial>();
const materialOf = (geo: THREE.BufferGeometry): THREE.MeshStandardMaterial => {
  const t = geo.userData['texture'] as string | undefined;
  if (!t) return material;
  let m = texturedMats.get(t);
  if (!m) texturedMats.set(t, m = makeUnitMaterial(time, t));
  return m;
};
const volleys = new Volleys(1, new THREE.Vector3(0, 1, 0));
scene.add(volleys.lines);
let world = new THREE.Group();
scene.add(world);
const colorOf = (civ: ArchCiv) => CIVS.find((c) => c.name === civ)?.color ?? '#cccccc';

// A unit on the field: what it is, where it stands and which way it faces
// (+1: its front toward +z), and whom it fights (the spot it charges or
// shoots at; null: it doesn't fight).
// (`attack`: the attack being made, `side` its part in it.)
interface Cell { type: UnitKey; civ: ArchCiv; hp: number; x: number; z: number; half: number; facing: 1 | -1; target: THREE.Vector3 | null; play: Play | null; attack: Play | null; side: 'attacker' | 'defender'; fired: number; seed: number }
// A figure on the sheet (shared by its body and its hair): its place in
// the formation, whether it rides, where it is in its round of blows
// (`beat`: unitAnim.ts).
interface Soul { idx: number; rides: boolean; beat: number }
// Every figure drawn: its mesh and slot, its cell and place in it.
interface Placed { mesh: THREE.InstancedMesh; i: number; cell: Cell; fx: number; fz: number; lift: readonly [number, number]; phase: number; hair: boolean; soul: Soul }
let cells: Cell[] = [];
let placed: Placed[] = [];

type Mode = 'sheet' | 'battle';
let mode: Mode = 'sheet';
// The sheet's settings.
let civFilter: ArchCiv | 'all' = 'all';
let sheetHp = 100;
let marching = false;
// Women's suffrage (a civic): half of every unit women.
let suffrage = false;
// The fight going on: when it began, whether it loops (the sheet), and (a
// battle) what it comes to.
let fight: { t0: number; loop: boolean; outcome: { attacker: number; defender: number } | null; dur: number } | null = null;
// The battle's sides.
// (`how`: the attack made: by fire, or closing in; the attacker's usual way if it can't make the other.)
const battle = { aCiv: 'Romans' as ArchCiv, aType: 'spearman' as UnitKey, aHp: 100, dCiv: 'Egyptians' as ArchCiv, dType: 'archer' as UnitKey, dHp: 100, ground: 0, fortified: false, how: 'ranged' as AttackMode };
const howOf = (): AttackMode => ((battle.how === 'ranged' ? canShoot(battle.aType) : canAssault(battle.aType)) ? battle.how : defaultMode(battle.aType));

function label(text: string, x: number, z: number, bold = false, sub?: string): void {
  const o = new WorldLabel(sub ? [{ text, bold }, { text: sub, small: true }] : [{ text, bold }], sub ? 0.8 : 0.45);
  o.position.set(x, 0.25, z);
  o.rotation.x = -Math.PI / 2.6;
  world.add(o);
}

// ---- the field ----

function sheetCells(): Cell[] {
  const civs = civFilter === 'all' ? [...ARCH_CIVS] : [civFilter];
  return civs.flatMap((civ, row) => TYPES.map((type, col): Cell => ({
    type, civ, hp: sheetHp, x: COL_X[col]!, z: row * CELL_D, half: COL_W[col]! / 2, facing: 1,
    target: FIGHTERS.includes(type) ? new THREE.Vector3(COL_X[col]!, 0, row * CELL_D + (PLAYS[siegeStyle(type) ?? 'melee'].charge === 0 ? 7 : SHEET_CHARGE / CHARGE_SHARE)) : null,
    play: FIGHTERS.includes(type) ? playOf(siegeStyle(type)) : null, attack: FIGHTERS.includes(type) ? playOf(siegeStyle(type)) : null, side: 'attacker', fired: 0, seed: row * 31 + col + 1,
  })));
}

function battleCells(): Cell[] {
  const a = new THREE.Vector3(0, 0, BATTLE_GAP), d = new THREE.Vector3(0, 0, 0);
  const out: Cell[] = [];
  // (A pair that can't fight (unitClasses.ts) stands still.)
  const style = attackStyle(battle.aType, battle.dType);
  if (battle.aHp > 0) out.push({ type: battle.aType, civ: battle.aCiv, hp: battle.aHp, x: a.x, z: a.z, half: 3, facing: -1, target: style ? d : null, play: style ? PLAYS[style] : null, attack: style ? PLAYS[style] : null, side: 'attacker', fired: 0, seed: 11 });
  // (A defending archer shoots back; any other defender strikes where it stands.)
  if (battle.dHp > 0) out.push({ type: battle.dType, civ: battle.dCiv, hp: battle.dHp, x: d.x, z: d.z, half: 3, facing: 1, target: style ? a : null, play: style ? defendPlay(PLAYS[style], battle.dType) : null, attack: style ? PLAYS[style] : null, side: 'defender', fired: 0, seed: 23 });
  return out;
}

function build(): { w: number; d: number } {
  disposeLabels(world);
  world.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.geometry.dispose(); });
  scene.remove(world);
  world = new THREE.Group();
  scene.add(world);
  cells = mode === 'sheet' ? sheetCells() : battleCells();
  // (A battle: the game's unit view stands its units; the sheet's figures are drawn here.)
  battleView?.dispose();
  battleView = mode === 'battle' ? makeBattleView() : null;
  if (battleView) world.add(battleView.group);
  // Each model's figures (and each hair style's): its colour and skin.
  type Fig = { cell: Cell; fx: number; fz: number; lift: readonly [number, number]; color: THREE.Color; skin: THREE.Color; phase: number; hair: boolean; soul: Soul };
  const figs = new Map<string, Fig[]>();
  const push = (key: string, f: Fig) => { const list = figs.get(key) ?? []; list.push(f); figs.set(key, list); };
  for (const cell of mode === 'sheet' ? cells : []) {
    const rand = mulberry32(cell.seed);
    for (const [i, [fx, fz]] of formationSlots(cell.type, cell.hp, rand).entries()) {
      const variant = variantOf(cell.type, i, rand), looks = figureLooks(cell.type, cell.civ, womenShare(cell.type, suffrage), rand), phase = rand() * Math.PI * 2;
      const soul: Soul = { idx: i, rides: rides(cell.type, variant), beat: phase / (Math.PI * 2) };
      const f: Fig = { cell, fx, fz, lift: [0, 0], color: new THREE.Color(colorOf(cell.civ)), skin: looks.skin, phase, hair: false, soul };
      push(`${cell.type}|${cell.civ}|${variant}|${looks.female ? 1 : 0}`, f);
      if (looks.hair >= 0) push(`hair|${looks.hair}`, { ...f, lift: headOffset(cell.type, variant), color: looks.hairColor, hair: true });
    }
  }
  placed = [];
  // (Triangles: each model's, and the field's in all; per type, a figure's
  // most with its hair.)
  let drawn = 0;
  const perFigure = new Map<UnitKey, number>(), hairTris = new Map<string, number>();
  for (const [key, list] of figs) {
    const [a, b, c, d] = key.split('|') as [string, string, string | undefined, string | undefined];
    const geo = prepareUnitGeometry(a === 'hair' ? hairModel(HAIR_STYLES[Number(b)]!) : unitModel(a as UnitKey, b as ArchCiv, Number(c), d === '1'), list.length);
    const n = triangles([geo]);
    drawn += n * list.length;
    if (a === 'hair') hairTris.set(b, n);
    else perFigure.set(a as UnitKey, Math.max(perFigure.get(a as UnitKey) ?? 0, n));
    const mesh = new THREE.InstancedMesh(geo, materialOf(geo), list.length);
    const tone = geo.getAttribute('aSkinTone') as THREE.InstancedBufferAttribute;
    list.forEach((f, i) => {
      mesh.setColorAt(i, f.color);
      tone.setXYZ(i, f.skin.r, f.skin.g, f.skin.b);
      placed.push({ mesh, i, cell: f.cell, fx: f.fx, fz: f.fz, lift: f.lift, phase: f.phase, hair: f.hair, soul: f.soul });
    });
    mesh.castShadow = mesh.receiveShadow = true;
    world.add(mesh);
  }
  $('tris').textContent = mode === 'sheet' ? `${placed.filter((p) => !p.hair).length} figures · ${drawn.toLocaleString()} triangles` : '';
  let w = 0, d = BATTLE_GAP;
  if (mode === 'sheet') {
    cells.filter((c) => c.x === 0).forEach((c) => label(c.civ, -2.6, c.z, true));
    const hairMost = Math.max(0, ...hairTris.values());
    TYPES.forEach((type, col) => { const n = perFigure.get(type); label(UNITS[type].name, COL_X[col]!, -2.4, true, n === undefined ? undefined : `${n + (isMachine(type) ? 0 : hairMost)} tris / figure`); });
    w = COL_X[COL_X.length - 1]!;
    d = (cells.length / TYPES.length - 1) * CELL_D;
  }
  // The field, and the ships' water: a basin sunk into it (the sea bed
  // SEA_DEPTH down, earth banks round it), the water level with the field.
  const sea = cells.filter((c) => domainOf(UNITS[c.type]) === 'sea');
  const hz = mode === 'sheet' ? CELL_D / 2 : 4.5;
  const basin = sea.length ? { x0: Math.min(...sea.map((c) => c.x - c.half)), x1: Math.max(...sea.map((c) => c.x + c.half)), z0: Math.min(...sea.map((c) => c.z)) - hz, z1: Math.max(...sea.map((c) => c.z)) + hz } : null;
  // (The field's outline in the plane's own coordinates: x, and -z.)
  const field = new THREE.Shape([new THREE.Vector2(-7, 7), new THREE.Vector2(w + 7, 7), new THREE.Vector2(w + 7, -d - 7), new THREE.Vector2(-7, -d - 7)]);
  if (basin) field.holes.push(new THREE.Path([new THREE.Vector2(basin.x0, -basin.z0), new THREE.Vector2(basin.x0, -basin.z1), new THREE.Vector2(basin.x1, -basin.z1), new THREE.Vector2(basin.x1, -basin.z0)]));
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(field).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a9a5a, roughness: 1 }));
  ground.receiveShadow = true;
  world.add(ground);
  if (basin) {
    const { x0, x1, z0, z1 } = basin, W = x1 - x0, D = z1 - z0, mid = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a7e5e, roughness: 1 }));
    bed.position.set(mid.x, -SEA_DEPTH, mid.z);
    bed.receiveShadow = true;
    const bank = new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 1, side: THREE.DoubleSide });
    const wall = (len: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, SEA_DEPTH), bank); m.position.set(x, -SEA_DEPTH / 2, z); m.rotation.y = ry; world.add(m); };
    wall(W, mid.x, z0, 0); wall(W, mid.x, z1, 0); wall(D, x0, mid.z, Math.PI / 2); wall(D, x1, mid.z, Math.PI / 2);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f6688, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.72, depthWrite: false }));
    water.position.set(mid.x, 0, mid.z);
    world.add(bed, water);
  }
  // The sun's shadows over the whole field.
  const half = Math.max(w, d) / 2 + 7;
  sun.position.set(w / 2 - 20, 40, d / 2 + 25);
  sun.target.position.set(w / 2, 0, d / 2);
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  pose(pageNow());
  return { w, d };
}

// Where a figure stands on the field (out of the fight).
const homeOf = (p: Placed): P2 => ({ x: p.cell.x - p.fx * p.cell.facing, z: p.cell.z + p.fz * p.cell.facing });
// The battle, played by the game's unit view (unitView.ts) on a patch of
// globe: the defender's tile at the pole, the attacker's BATTLE_STEP
// away towards +z; the view scaled and lowered so that a figure is one
// unit tall and the ground at the pole is the field (the patch so small
// that it is flat to a hair).
const BATTLE_STEP = 0.002;
let battleView: UnitView | null = null;
const battleCentre = (t: number) => new THREE.Vector3(0, Math.cos(t * BATTLE_STEP), Math.sin(t * BATTLE_STEP));
// (The units as they stand, or with the HP a fight leaves them.)
const battleUnits = (aHp = battle.aHp, dHp = battle.dHp): ShownUnit[] => [
  ...(aHp > 0 ? [{ id: 1, type: battle.aType, civ: battle.aCiv, color: colorOf(battle.aCiv), tile: 1, hp: aHp, suffrage }] : []),
  ...(dHp > 0 ? [{ id: 2, type: battle.dType, civ: battle.dCiv, color: colorOf(battle.dCiv), tile: 0, hp: dHp, suffrage }] : []),
];
function makeBattleView(): UnitView {
  const view = new UnitView({ center: battleCentre, ground: () => ({ ground: 0, water: -1 }), step: BATTLE_STEP }, () => new THREE.Sprite(new THREE.SpriteMaterial({ visible: false })));
  view.group.scale.setScalar(1 / view.size);
  view.group.position.set(0, -1 / view.size, 0);
  const now = pageNow();
  view.sync(battleUnits(), now);
  view.turnTo(1, 0);
  view.turnTo(2, 1);
  return view;
}

function frame(d: { w: number; d: number }): void {
  if (mode === 'battle') {
    controls.target.set(0, 0, BATTLE_GAP / 2);
    camera.position.set(10, 6.5, BATTLE_GAP / 2 + 2);
    return;
  }
  const m = Math.max(d.w, Math.min(d.d, 30));
  controls.target.set(d.w / 2, 0, Math.min(d.d / 2, 12));
  camera.position.set(d.w / 2, m * 0.7, Math.min(d.d / 2, 12) + m * 0.9);
}

// ---- posing ----

// Every figure on the sheet posed for now: standing, marching on the
// spot, or attacking over and over as its play says (unitView.ts PLAYS:
// charging forward and falling back, striking; shooters aiming, loosing
// their arrows, stones, shells or bullets).
function pose(now: number): void {
  // (Each cell's fight as long as its attack: seconds into it, a share of it.)
  const clock = (c: Cell) => {
    const dur = c.attack ? durOf(c.attack) : FIGHT, sec = !fight ? Infinity : (now - fight.t0) % (dur + PAUSE);
    return { dur, sec, t: sec / dur, fighting: sec < dur };
  };
  const m = new THREE.Matrix4(), turn = new THREE.Matrix4(), offset = new THREE.Vector3(), tip = new THREE.Quaternion();
  for (const p of placed) {
    const c = p.cell, s = p.soul, { dur, sec, t, fighting } = clock(c), play = fighting && c.target !== null ? c.play : null;
    const st = play ? playAt(play, t) : null, home = homeOf(p);
    let x = home.x, z = home.z;
    if (play && st) {
      offset.set(c.target!.x - c.x, 0, c.target!.z - c.z).multiplyScalar(CHARGE_SHARE * play.charge * st.out);
      x += offset.x; z += offset.z;
    }
    m.makeTranslation(x, (play?.fly ?? 0) * (st?.out ?? 0), z);
    m.multiply(turn.makeRotationY((c.facing === 1 ? 0 : Math.PI) + (st?.back ? Math.PI : 0)));
    // (People and horses posed as they act (unitAnim.ts).)
    const moving = marching || st?.moving ? (play && play.charge > 1 ? 1.4 : 1) : 0;
    // (An engine's throwing arm flung as it looses its shot (unitAnim.ts flingOf); cocked until then.)
    let legs = moving, arm = flingOf(play?.shots[0] ? sec - play.shots[0].t * dur : -1), bends: readonly [number, number, number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (falls(c.type)) {
      const cue: Cue | null = fight && c.play && c.attack ? { sec, dur, play: c.play, attack: c.attack, side: c.side, engaged: c.attack.close === true, delay: 0, fall: Infinity, won: false, cut: cuts(c.type), thrust: thrusts(c.type), bow: draws(c.type), bayonet: bayonets(c.type) } : null;
      const pz = poseOf(cue, now, p.phase, s.beat, moving, s.rides, whirls(c.type), false, bowman(c.type));
      // (Crouched, lower: the legs fold under it.)
      const [ry, rz] = rearShift(pz);
      m.multiply(turn.makeTranslation(0, pz.rise + ry - (s.rides ? 0 : dropOf(pz.crouch)), pz.lunge + rz)).multiply(turn.makeRotationFromQuaternion(poseTurn(tip, pz)));
      legs = legsOf(pz); arm = armOf(pz); bends = s.rides ? [0, 0, 0, pz.elbow, pz.aim, pz.aimed, pz.guard, pz.draw, pz.out] : [pz.bend, pz.twist, pz.crouch, pz.elbow, pz.aim, pz.aimed, pz.guard, pz.draw, pz.out];
    }
    if (p.lift[0] || p.lift[1]) m.multiply(turn.makeTranslation(0, p.lift[0], p.lift[1]));
    p.mesh.setMatrixAt(p.i, m);
    (p.mesh.geometry.getAttribute('aAnim') as THREE.InstancedBufferAttribute).setXYZW(p.i, (p.phase + now * 9) % (Math.PI * 2), legs, arm, bends[4]); // (the legs' beat: unitView.ts)
    (p.mesh.geometry.getAttribute('aSkinTone') as THREE.InstancedBufferAttribute).setW(p.i, bends[5]);
    (p.mesh.geometry.getAttribute('aPose') as THREE.InstancedBufferAttribute).setXYZW(p.i, bends[0], bends[1], bends[2], bends[3]);
    (p.mesh.geometry.getAttribute('aMore') as THREE.InstancedBufferAttribute).setXYZW(p.i, bends[6], bends[7], 0, bends[8]);
  }
  for (const mesh of new Set(placed.map((p) => p.mesh))) { mesh.instanceMatrix.needsUpdate = true; mesh.geometry.getAttribute('aAnim').needsUpdate = true; mesh.geometry.getAttribute('aPose').needsUpdate = true; mesh.geometry.getAttribute('aMore').needsUpdate = true; mesh.geometry.getAttribute('aSkinTone').needsUpdate = true; }
  // The shots, each on time (from where the unit stands now).
  for (const c of cells) {
    const { t, fighting } = clock(c);
    if (!fighting) { c.fired = 0; continue; }
    if (!c.play || !c.target) continue;
    if (t < (c.play.shots[0]?.t ?? 1) && c.fired > 0) c.fired = 0; // (the loop began again)
    const shot = c.play.shots[c.fired];
    if (!shot || t <= shot.t) continue;
    c.fired++;
    const out = playAt(c.play, t).out * c.play.charge * CHARGE_SHARE;
    const up = 0.75 + (c.play.fly ?? 0) * playAt(c.play, t).out;
    const from = placed.filter((p) => p.cell === c && !p.hair).map((p) => new THREE.Vector3(c.x - p.fx * c.facing + (c.target!.x - c.x) * out, up, c.z + p.fz * c.facing + (c.target!.z - c.z) * out));
    volleys.loose(from, c.target, 1.2, now, c.seed * 3 + c.fired, shot.kind);
  }
  volleys.update(now);
}

// ---- the battle ----

const unitName = (civ: ArchCiv, type: UnitKey) => `${civ} ${UNITS[type].name.toLowerCase()}`;
function strengths(): { A: number; D: number; bonus: number } {
  const bonus = GROUNDS[battle.ground]!.bonus + (battle.fortified ? FORTIFY_BONUS : 0), how = howOf();
  // (As the game: pikemen fight mounted units at double strength.)
  return {
    A: combatStrength(battle.aType, statOf(how, 'atk'), battle.aHp, 0) * matchup(battle.aType, battle.dType, 'atk'),
    D: combatStrength(battle.dType, statOf(how, 'def'), battle.dHp, bonus) * matchup(battle.dType, battle.aType, 'def'),
    bonus,
  };
}
function showBattle(): void {
  $('aHp').textContent = `${Math.max(0, battle.aHp)} HP`;
  $('dHp').textContent = `${Math.max(0, battle.dHp)} HP`;
  const { A, D, bonus } = strengths();
  const alive = battle.aHp > 0 && battle.dHp > 0, how = howOf(), block = attackBlock(battle.aType, battle.dType, undefined, how);
  $<HTMLSelectElement>('how').value = how;
  $('odds').innerHTML = block ? `<b class="loss">The ${UNITS[battle.aType].name.toLowerCase()} ${block}</b> (${UNITS[battle.dType].name.toLowerCase()}).` : alive
    ? `Strength <b>${A.toFixed(2)}</b> against <b>${D.toFixed(2)}</b>${bonus ? ` (defence ${bonus > 0 ? '+' : ''}${Math.round(bonus * 100)}%)` : ''} · each exchange won <b>${Math.round((100 * A) / (A + D))}%</b> of the time${how === 'ranged' ? ' · fire: three exchanges at most, unanswered' : ' · at close quarters, to the end'}`
    : 'One side has fallen: Heal both to fight again.';
  $<HTMLButtonElement>('fight').disabled = !alive || fight !== null || block !== null;
}
function startFight(): void {
  const how = howOf();
  if (mode !== 'battle' || fight || !battleView || battle.aHp <= 0 || battle.dHp <= 0 || attackBlock(battle.aType, battle.dType, undefined, how)) return;
  const { A, D } = strengths();
  const outcome = fightRounds(battle.aHp, battle.dHp, A, D, how, Math.random), style = attackStyle(battle.aType, battle.dType, how)!, now = pageNow();
  fight = { t0: now, loop: false, outcome, dur: durOf(PLAYS[style]) };
  // (As the game: the fight first, then the units as they come out of it.)
  battleView.fight(1, 0, style, now, { defender: 2, attackerHp: outcome.attacker, defenderHp: outcome.defender });
  battleView.sync(battleUnits(outcome.attacker, outcome.defender), now);
  $('result').textContent = 'Fighting…';
  showBattle();
}
// The fight over (and lingered on: the dead lie there, the winners cheer):
// what it came to.
function endFight(): void {
  const o = fight?.outcome;
  fight = null;
  if (!o) return;
  const a = unitName(battle.aCiv, battle.aType), d = unitName(battle.dCiv, battle.dType);
  const lost = (before: number, after: number) => `${before} → ${Math.max(0, after)} HP`;
  const line = o.attacker <= 0 ? `<b class="loss">The ${a} is destroyed</b> by the ${d}.`
    : o.defender <= 0 ? `<b class="win">The ${a} destroys the ${d}.</b>`
    : `Neither falls${howOf() === 'ranged' ? ' (the volley is spent)' : ''}.`;
  $('result').innerHTML = `${line}<br>${a}: ${lost(battle.aHp, o.attacker)} · ${d}: ${lost(battle.dHp, o.defender)}`;
  battle.aHp = o.attacker;
  battle.dHp = o.defender;
  showBattle();
}

// ---- controls ----

function setMode(m: Mode): void {
  if (m === 'sheet') stopMovie();
  mode = m;
  fight = null;
  document.body.dataset['mode'] = m;
  document.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset['mode'] === m));
  $('attack').classList.remove('active');
  frame(build());
  showBattle();
}
document.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset['mode'] as Mode); b.blur(); }));

function options<T extends string>(id: string, values: readonly T[], name: (v: T) => string, value: T, set: (v: T) => void): void {
  const el = $<HTMLSelectElement>(id);
  el.innerHTML = values.map((v) => `<option value="${v}">${name(v)}</option>`).join('');
  el.value = value;
  el.addEventListener('change', () => { set(el.value as T); el.blur(); });
}
options<ArchCiv | 'all'>('civSel', ['all', ...ARCH_CIVS], (v) => (v === 'all' ? 'All' : v), 'all', (v) => { civFilter = v; frame(build()); });
$<HTMLInputElement>('suffrage').addEventListener('change', (e) => { suffrage = (e.target as HTMLInputElement).checked; build(); (e.target as HTMLElement).blur(); });
$('hp').addEventListener('input', (e) => { sheetHp = Number((e.target as HTMLInputElement).value); $('hpV').textContent = String(sheetHp); build(); });
// (The figures remade, heroic or not; the camera kept.)
const setHeroic = (on: boolean) => { HEROIC.on = on; $<HTMLInputElement>('heroic').checked = on; build(); showBattle(); };
$<HTMLInputElement>('heroic').addEventListener('change', (e) => { setHeroic((e.currentTarget as HTMLInputElement).checked); (e.currentTarget as HTMLElement).blur(); });
const setSlow = (on: boolean) => { pageNow(); rate = on ? 0.25 : 1; $('slow').classList.toggle('active', on); };
$('slow').addEventListener('click', (e) => { setSlow(rate === 1); (e.currentTarget as HTMLElement).blur(); });
const setMarching = (on: boolean) => { marching = on; $('march').classList.toggle('active', on); };
const setAttacking = (on: boolean) => { fight = on ? { t0: pageNow(), loop: true, outcome: null, dur: FIGHT } : null; $('attack').classList.toggle('active', on); };
$('march').addEventListener('click', (e) => { setMarching(!marching); (e.currentTarget as HTMLElement).blur(); });
$('attack').addEventListener('click', (e) => { setAttacking(!fight); (e.currentTarget as HTMLElement).blur(); });

// (Changing either side brings both back whole.)
const reset = () => { fight = null; battle.aHp = battle.dHp = 100; $('result').textContent = ''; build(); showBattle(); };

// ---- the movies ----
// Every attacker against every defender, both ways of attacking, one fight
// after another, each shown to its end (what can't be fought is said, and
// why, for as long as a fight lasts). By class: only one type for each way
// of being animated (its class, its weapon's way, mounted or a machine, its
// element), the first in the roster; or every type.
const animKey = (k: UnitKey): string => `${UNIT_CLASS[k]}|${whirls(k)}|${bowman(k)}|${rides(k, 0)}|${isMachine(k)}|${domainOf(UNITS[k])}`;
const firstOfKind = (ks: readonly UnitKey[]): UnitKey[] => ks.filter((k, i) => ks.findIndex((j) => animKey(j) === animKey(k)) === i);
type Take = { a: UnitKey; d: UnitKey; how: AttackMode };
let movie: { name: string; takes: Take[]; i: number; until: number } | null = null;
function playMovie(name: string, attackers: readonly UnitKey[], defenders: readonly UnitKey[]): void {
  const takes = attackers.flatMap((a) => defenders.flatMap((d) => (['ranged', 'melee'] as const).map((how) => ({ a, d, how }))));
  movie = { name, takes, i: -1, until: 0 };
  $('movieStop').classList.remove('hidden');
  nextTake();
}
function stopMovie(): void {
  movie = null;
  $('movieStop').classList.add('hidden');
  $('movie').textContent = '';
}
// The next take: its sides set and whole; fought, or (if it can't be) said why.
function nextTake(): void {
  if (!movie) return;
  if (++movie.i >= movie.takes.length) { stopMovie(); return; }
  const { a, d, how } = movie.takes[movie.i]!, now = pageNow();
  Object.assign(battle, { aType: a, dType: d, how });
  $<HTMLSelectElement>('aType').value = a;
  $<HTMLSelectElement>('dType').value = d;
  reset();
  const block = attackBlock(a, d, undefined, how);
  const way = how === 'ranged' ? 'by fire' : 'at close quarters';
  $('movie').innerHTML = `${movie.name} · ${movie.i + 1} of ${movie.takes.length}<br>${UNITS[a].name} attacks ${UNITS[d].name} ${way}${block ? `: <b class="loss">it can't (${UNITS[a].name.toLowerCase()} ${block})</b>` : ''}`;
  if (block) { $('odds').innerHTML = `<b class="loss">The ${UNITS[a].name.toLowerCase()} ${block}</b> (${way}).`; movie.until = now + FIGHT; return; }
  startFight();
  movie.until = Infinity; // (until the fight is over: movieTick)
}
// Every frame: on to the next take once this one is over (a moment after its fight ends).
function movieTick(now: number): void {
  if (!movie) return;
  if (movie.until === Infinity && !fight) movie.until = now + 0.6;
  if (now >= movie.until) nextTake();
}
$('movieClasses').addEventListener('click', (e) => { setMode('battle'); playMovie('Every class', firstOfKind(FIGHTERS), firstOfKind(DEFENDERS)); (e.currentTarget as HTMLElement).blur(); });
$('movieUnits').addEventListener('click', (e) => { setMode('battle'); playMovie('Every unit', FIGHTERS, DEFENDERS); (e.currentTarget as HTMLElement).blur(); });
$('movieStop').addEventListener('click', (e) => { stopMovie(); (e.currentTarget as HTMLElement).blur(); });
options<ArchCiv>('aCiv', ARCH_CIVS, (v) => v, battle.aCiv, (v) => { battle.aCiv = v; reset(); });
options<UnitKey>('aType', FIGHTERS, (v) => UNITS[v].name, battle.aType, (v) => { battle.aType = v; reset(); });
options<ArchCiv>('dCiv', ARCH_CIVS, (v) => v, battle.dCiv, (v) => { battle.dCiv = v; reset(); });
options<UnitKey>('dType', DEFENDERS, (v) => UNITS[v].name, battle.dType, (v) => { battle.dType = v; reset(); });
options<string>('ground', GROUNDS.map((_, i) => String(i)), (v) => GROUNDS[Number(v)]!.name, '0', (v) => { battle.ground = Number(v); showBattle(); });
options<AttackMode>('how', ['ranged', 'melee'], (v) => (v === 'ranged' ? 'Attack by fire' : 'Attack at close quarters'), battle.how, (v) => { battle.how = v; showBattle(); });
$<HTMLInputElement>('fort').addEventListener('change', (e) => { battle.fortified = (e.target as HTMLInputElement).checked; showBattle(); });
$('fight').addEventListener('click', (e) => { startFight(); (e.currentTarget as HTMLElement).blur(); });
$('heal').addEventListener('click', (e) => { reset(); (e.currentTarget as HTMLElement).blur(); });

// Keyboard: W A S D move, Q E rotate, T G tilt, Z X zoom (as the other
// sheets); M march, B attack (all units); L slow; H heroic; Space fight (a battle).
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if (e.key === 'l' || e.key === 'L') setSlow(rate === 1);
  else if (e.key === 'h' || e.key === 'H') setHeroic(!HEROIC.on);
  else if (mode === 'sheet' && (e.key === 'm' || e.key === 'M')) setMarching(!marching);
  else if (mode === 'sheet' && (e.key === 'b' || e.key === 'B')) setAttacking(!fight);
  else if (mode === 'battle' && e.key === ' ') { e.preventDefault(); startFight(); }
  else keys.add(e.key.toLowerCase());
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let lastT = performance.now();
function keyboard(): void {
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (!keys.size) return;
  const dist = camera.position.distanceTo(controls.target);
  const fwd = controls.target.clone().sub(camera.position).setY(0).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x), move = new THREE.Vector3();
  if (keys.has('w')) move.add(fwd);
  if (keys.has('s')) move.sub(fwd);
  if (keys.has('d')) move.add(right);
  if (keys.has('a')) move.sub(right);
  if (move.lengthSq()) { move.normalize().multiplyScalar(dist * 0.9 * dt); camera.position.add(move); controls.target.add(move); }
  const turn = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
  if (turn) { const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * 1.2 * dt); camera.position.copy(controls.target).add(off); }
  const tilt = (keys.has('t') ? 1 : 0) - (keys.has('g') ? 1 : 0);
  if (tilt) {
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    s.phi = Math.min(controls.maxPolarAngle, Math.max(0.05, s.phi + tilt * 0.9 * dt));
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
  }
  const zoom = (keys.has('x') ? 1 : 0) - (keys.has('z') ? 1 : 0);
  if (zoom) { const off = camera.position.clone().sub(controls.target).multiplyScalar(Math.exp(zoom * 1.5 * dt)); camera.position.copy(controls.target).add(off); }
}

const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize);
resize();
frame(build());
showBattle();
if (import.meta.env.DEV) Object.assign(window, { __units: { setRate: (r: number) => { pageNow(); rate = r; }, volleys, battle, setMode, startFight, camera, controls, view: () => battleView } });
renderer.setAnimationLoop(() => {
  const now = pageNow();
  time.value = now;
  if (fight && !fight.loop && now - fight.t0 >= fight.dur + AFTER) endFight();
  movieTick(now);
  if (battleView) battleView.update(now, camera, Infinity); else pose(now);
  keyboard();
  controls.update();
  renderer.render(scene, camera);
});
