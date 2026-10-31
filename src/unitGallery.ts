// Units (dev tool, /units.html): the unit figurines (unitModels.ts) as the
// game shows them (unitView.ts), on a plain ground.
//   All units  every type (across) dressed by every civ (down). HP thins the
//              fighting formations as in the game (one figure per 8 HP or
//              part of it); Women's suffrage makes half of every unit women
//              (else about half the civilians, a tenth of the soldiers);
//              March sets them marching on the spot; Attack has
//              them fight, over and over (melee units charge forward and
//              strike, archers loose volleys forward).
//   Battle     an attacker and a defender of your choosing, facing each
//              other: Fight resolves an attack by the game's own rules
//              (game.ts combatStrength, fightRounds), plays it out, and
//              leaves each side with the HP it has left (the fallen leave
//              the field). Fight again to go on; Heal both to start over.

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARCH_CIVS, type ArchCiv } from './architecture.ts';
import { CIVS, UNITS, type UnitKey } from './rules.ts';
import { FORTIFY_BONUS, combatStrength, fightRounds } from './game.ts';
import { HAIR_STYLES, RIDER_HEAD, formationSlots, hairModel, rides, unitModel, variantOf, womenShare } from './unitModels.ts';
import { Volleys, figureLooks, makeUnitMaterial, prepareUnitGeometry } from './unitView.ts';
import { WorldLabel, disposeLabels } from './worldLabel.ts';
import { mulberry32 } from './rng.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 500);
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

const TYPES = Object.keys(UNITS) as UnitKey[];
const FIGHTERS = TYPES.filter((t) => UNITS[t].atk > 0);
const isRanged = (t: UnitKey): boolean => 'ranged' in UNITS[t] && UNITS[t].ranged === true;
const DEFENDERS = TYPES.filter((t) => !('civilian' in UNITS[t] && UNITS[t].civilian));
const CELL_W = 4.2, CELL_D = 4.4; // a cell of the sheet (figure heights)
const BATTLE_GAP = 7;             // between the two sides of a battle
// A fight, as in the game (unitView.ts): FIGHT seconds (then a pause, looping
// on the sheet), and how far a melee unit charges (a share of the way to
// the enemy; on the sheet it charges SHEET_CHARGE figure heights).
const FIGHT = 1.8, CYCLE = 2.6, CHARGE_SHARE = 0.42, SHEET_CHARGE = 1.6;
// The ground a defender can stand on (game: terrain.ts defence bonuses).
const GROUNDS = [
  { name: 'Open ground', bonus: 0 }, { name: 'Forest (+25%)', bonus: 0.25 }, { name: 'Hills (+50%)', bonus: 0.5 },
  { name: 'Forested hills (+75%)', bonus: 0.75 }, { name: 'Mountains (+100%)', bonus: 1 }, { name: 'Marsh (−15%)', bonus: -0.15 },
] as const;

const time = { value: 0 };
const material = makeUnitMaterial(time);
const volleys = new Volleys(1, new THREE.Vector3(0, 1, 0));
scene.add(volleys.lines);
let world = new THREE.Group();
scene.add(world);
const colorOf = (civ: ArchCiv) => CIVS.find((c) => c.name === civ)?.color ?? '#cccccc';

// A unit on the field: what it is, where it stands and which way it faces
// (+1: its front toward +z), and whom it fights (the spot it charges or
// shoots at; null: it doesn't fight).
interface Cell { type: UnitKey; civ: ArchCiv; hp: number; x: number; z: number; facing: 1 | -1; target: THREE.Vector3 | null; charges: boolean; seed: number }
// Every figure drawn: its mesh and slot, its cell and place in it.
interface Placed { mesh: THREE.InstancedMesh; i: number; cell: Cell; fx: number; fz: number; lift: number; phase: number; hair: boolean }
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
let fight: { t0: number; loop: boolean; outcome: { attacker: number; defender: number } | null } | null = null;
// The battle's sides.
const battle = { aCiv: 'Romans' as ArchCiv, aType: 'spearman' as UnitKey, aHp: 100, dCiv: 'Egyptians' as ArchCiv, dType: 'archer' as UnitKey, dHp: 100, ground: 0, fortified: false };

function label(text: string, x: number, z: number, bold = false): void {
  const o = new WorldLabel([{ text, bold }], 0.45);
  o.position.set(x, 0.25, z);
  o.rotation.x = -Math.PI / 2.6;
  world.add(o);
}

// ---- the field ----

function sheetCells(): Cell[] {
  const civs = civFilter === 'all' ? [...ARCH_CIVS] : [civFilter];
  return civs.flatMap((civ, row) => TYPES.map((type, col): Cell => ({
    type, civ, hp: sheetHp, x: col * CELL_W, z: row * CELL_D, facing: 1,
    target: FIGHTERS.includes(type) ? new THREE.Vector3(col * CELL_W, 0, row * CELL_D + (isRanged(type) ? 7 : SHEET_CHARGE / CHARGE_SHARE)) : null,
    charges: !isRanged(type), seed: row * 31 + col + 1,
  })));
}

function battleCells(): Cell[] {
  const a = new THREE.Vector3(0, 0, BATTLE_GAP), d = new THREE.Vector3(0, 0, 0);
  const out: Cell[] = [];
  if (battle.aHp > 0) out.push({ type: battle.aType, civ: battle.aCiv, hp: battle.aHp, x: a.x, z: a.z, facing: -1, target: d, charges: !isRanged(battle.aType), seed: 11 });
  // (A defending archer shoots back; any other defender strikes where it stands.)
  if (battle.dHp > 0) out.push({ type: battle.dType, civ: battle.dCiv, hp: battle.dHp, x: d.x, z: d.z, facing: 1, target: FIGHTERS.includes(battle.dType) ? a : null, charges: false, seed: 23 });
  return out;
}

function build(): { w: number; d: number } {
  disposeLabels(world);
  world.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.geometry.dispose(); });
  scene.remove(world);
  world = new THREE.Group();
  scene.add(world);
  cells = mode === 'sheet' ? sheetCells() : battleCells();
  // Each model's figures (and each hair style's): its colour and skin.
  type Fig = { cell: Cell; fx: number; fz: number; lift: number; color: THREE.Color; skin: THREE.Color; phase: number; hair: boolean };
  const figs = new Map<string, Fig[]>();
  const push = (key: string, f: Fig) => { const list = figs.get(key) ?? []; list.push(f); figs.set(key, list); };
  for (const cell of cells) {
    const rand = mulberry32(cell.seed);
    for (const [i, [fx, fz]] of formationSlots(cell.type, cell.hp, rand).entries()) {
      const variant = variantOf(cell.type, i, rand), looks = figureLooks(cell.type, cell.civ, womenShare(cell.type, suffrage), rand), phase = rand() * Math.PI * 2;
      const f: Fig = { cell, fx, fz, lift: 0, color: new THREE.Color(colorOf(cell.civ)), skin: looks.skin, phase, hair: false };
      push(`${cell.type}|${cell.civ}|${variant}|${looks.female ? 1 : 0}`, f);
      if (looks.hair >= 0) push(`hair|${looks.hair}`, { ...f, lift: rides(cell.type, variant) ? RIDER_HEAD : 0, color: looks.hairColor, hair: true });
    }
  }
  placed = [];
  for (const [key, list] of figs) {
    const [a, b, c, d] = key.split('|') as [string, string, string | undefined, string | undefined];
    const geo = prepareUnitGeometry(a === 'hair' ? hairModel(HAIR_STYLES[Number(b)]!) : unitModel(a as UnitKey, b as ArchCiv, Number(c), d === '1'), list.length);
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    const tone = geo.getAttribute('aSkinTone') as THREE.InstancedBufferAttribute;
    list.forEach((f, i) => {
      mesh.setColorAt(i, f.color);
      tone.setXYZ(i, f.skin.r, f.skin.g, f.skin.b);
      placed.push({ mesh, i, cell: f.cell, fx: f.fx, fz: f.fz, lift: f.lift, phase: f.phase, hair: f.hair });
    });
    mesh.castShadow = mesh.receiveShadow = true;
    world.add(mesh);
  }
  let w = 0, d = BATTLE_GAP;
  if (mode === 'sheet') {
    cells.filter((c) => c.x === 0).forEach((c) => label(c.civ, -2.6, c.z, true));
    TYPES.forEach((type, col) => label(UNITS[type].name, col * CELL_W, -2.4, true));
    w = (TYPES.length - 1) * CELL_W;
    d = (cells.length / TYPES.length - 1) * CELL_D;
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w + 14, d + 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a9a5a, roughness: 1 }));
  ground.position.set(w / 2, 0, d / 2);
  ground.receiveShadow = true;
  world.add(ground);
  // The sun's shadows over the whole field.
  const half = Math.max(w, d) / 2 + 7;
  sun.position.set(w / 2 - 20, 40, d / 2 + 25);
  sun.target.position.set(w / 2, 0, d / 2);
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  pose(performance.now() / 1000);
  return { w, d };
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

// Every figure posed for now: standing, marching on the spot, or in the
// fight (melee charging at the enemy and falling back, striking; archers
// with their bows raised, loosing a volley at a third and at two thirds).
let loosed = 0;
function pose(now: number): void {
  let t = 2;
  if (fight) {
    t = fight.loop ? ((now - fight.t0) % CYCLE) / FIGHT : (now - fight.t0) / FIGHT;
    if (!fight.loop && t >= 1) { endFight(); return; }
  }
  const fighting = t < 1, out = !fighting ? 0 : t < 0.3 ? smooth(t / 0.3) : t < 0.75 ? 1 : 1 - smooth((t - 0.75) / 0.25);
  const m = new THREE.Matrix4(), turn = new THREE.Matrix4(), offset = new THREE.Vector3();
  for (const p of placed) {
    const c = p.cell, fights = fighting && c.target !== null;
    const ranged = isRanged(c.type), charging = fights && c.charges;
    offset.set(0, 0, 0);
    if (charging) offset.set(c.target!.x - c.x, 0, c.target!.z - c.z).multiplyScalar(CHARGE_SHARE * out);
    // (Facing its front; turned about to fall back.)
    const back = charging && t > 0.75;
    m.makeTranslation(c.x + offset.x - p.fx * c.facing, 0, c.z + offset.z + p.fz * c.facing);
    m.multiply(turn.makeRotationY((c.facing === 1 ? 0 : Math.PI) + (back ? Math.PI : 0)));
    if (p.lift) m.multiply(turn.makeTranslation(0, p.lift, 0));
    p.mesh.setMatrixAt(p.i, m);
    const walk = (marching && mode === 'sheet') || (charging && (t < 0.3 || t > 0.75)) ? 1 : 0;
    const strike = !fights ? 0 : ranged ? Math.min(1, t * 4) * (t < 0.85 ? 1 : (1 - t) / 0.15) : t > 0.2 && t < 0.8 ? 1 : 0;
    (p.mesh.geometry.getAttribute('aAnim') as THREE.InstancedBufferAttribute).setXYZ(p.i, p.phase, walk, strike);
  }
  for (const mesh of new Set(placed.map((p) => p.mesh))) { mesh.instanceMatrix.needsUpdate = true; mesh.geometry.getAttribute('aAnim').needsUpdate = true; }
  // The archers' volleys.
  const volley = fighting ? Math.floor(t * 3) : 0;
  if (volley > loosed && volley <= 2) {
    for (const c of cells) {
      if (!isRanged(c.type) || !c.target) continue;
      const from = placed.filter((p) => p.cell === c && !p.hair).map((p) => new THREE.Vector3(c.x - p.fx * c.facing, 0.75, c.z + p.fz * c.facing));
      volleys.loose(from, c.target, 1.2, now, c.seed * 3 + volley);
    }
  }
  loosed = fighting ? volley : 0;
  volleys.update(now);
}
const smooth = (x: number) => x * x * (3 - 2 * x);

// ---- the battle ----

const unitName = (civ: ArchCiv, type: UnitKey) => `${civ} ${UNITS[type].name.toLowerCase()}`;
function strengths(): { A: number; D: number; bonus: number } {
  const bonus = GROUNDS[battle.ground]!.bonus + (battle.fortified ? FORTIFY_BONUS : 0);
  // (As the game: pikemen fight mounted units at double strength.)
  const mounted = (t: UnitKey) => t === 'horseman' || t === 'knight';
  return {
    A: combatStrength(battle.aType, 'atk', battle.aHp, 0) * (battle.aType === 'pikeman' && mounted(battle.dType) ? 2 : 1),
    D: combatStrength(battle.dType, 'def', battle.dHp, bonus) * (battle.dType === 'pikeman' && mounted(battle.aType) ? 2 : 1),
    bonus,
  };
}
function showBattle(): void {
  $('aHp').textContent = `${Math.max(0, battle.aHp)} HP`;
  $('dHp').textContent = `${Math.max(0, battle.dHp)} HP`;
  const { A, D, bonus } = strengths();
  const alive = battle.aHp > 0 && battle.dHp > 0;
  $('odds').innerHTML = alive
    ? `Strength <b>${A.toFixed(2)}</b> against <b>${D.toFixed(2)}</b>${bonus ? ` (defence ${bonus > 0 ? '+' : ''}${Math.round(bonus * 100)}%)` : ''} · each exchange won <b>${Math.round((100 * A) / (A + D))}%</b> of the time${isRanged(battle.aType) ? ' · a volley: three exchanges at most, half the damage back' : ''}`
    : 'One side has fallen: Heal both to fight again.';
  $<HTMLButtonElement>('fight').disabled = !alive || fight !== null;
}
function startFight(): void {
  if (mode !== 'battle' || fight || battle.aHp <= 0 || battle.dHp <= 0) return;
  const { A, D } = strengths();
  const outcome = fightRounds(battle.aHp, battle.dHp, A, D, isRanged(battle.aType), Math.random);
  fight = { t0: performance.now() / 1000, loop: false, outcome };
  $('result').textContent = 'Fighting…';
  showBattle();
}
// The fight over: each side keeps the HP it has left; the fallen leave.
function endFight(): void {
  const o = fight?.outcome;
  fight = null;
  if (!o) return;
  const a = unitName(battle.aCiv, battle.aType), d = unitName(battle.dCiv, battle.dType);
  const lost = (before: number, after: number) => `${before} → ${Math.max(0, after)} HP`;
  const line = o.attacker <= 0 ? `<b class="loss">The ${a} is destroyed</b> by the ${d}.`
    : o.defender <= 0 ? `<b class="win">The ${a} destroys the ${d}.</b>`
    : `Neither falls${isRanged(battle.aType) ? ' (the volley is spent)' : ''}.`;
  $('result').innerHTML = `${line}<br>${a}: ${lost(battle.aHp, o.attacker)} · ${d}: ${lost(battle.dHp, o.defender)}`;
  battle.aHp = o.attacker;
  battle.dHp = o.defender;
  build();
  showBattle();
}

// ---- controls ----

function setMode(m: Mode): void {
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
const setMarching = (on: boolean) => { marching = on; $('march').classList.toggle('active', on); };
const setAttacking = (on: boolean) => { fight = on ? { t0: performance.now() / 1000, loop: true, outcome: null } : null; $('attack').classList.toggle('active', on); };
$('march').addEventListener('click', (e) => { setMarching(!marching); (e.currentTarget as HTMLElement).blur(); });
$('attack').addEventListener('click', (e) => { setAttacking(!fight); (e.currentTarget as HTMLElement).blur(); });

// (Changing either side brings both back whole.)
const reset = () => { fight = null; battle.aHp = battle.dHp = 100; $('result').textContent = ''; build(); showBattle(); };
options<ArchCiv>('aCiv', ARCH_CIVS, (v) => v, battle.aCiv, (v) => { battle.aCiv = v; reset(); });
options<UnitKey>('aType', FIGHTERS, (v) => UNITS[v].name, battle.aType, (v) => { battle.aType = v; reset(); });
options<ArchCiv>('dCiv', ARCH_CIVS, (v) => v, battle.dCiv, (v) => { battle.dCiv = v; reset(); });
options<UnitKey>('dType', DEFENDERS, (v) => UNITS[v].name, battle.dType, (v) => { battle.dType = v; reset(); });
options<string>('ground', GROUNDS.map((_, i) => String(i)), (v) => GROUNDS[Number(v)]!.name, '0', (v) => { battle.ground = Number(v); showBattle(); });
$<HTMLInputElement>('fort').addEventListener('change', (e) => { battle.fortified = (e.target as HTMLInputElement).checked; showBattle(); });
$('fight').addEventListener('click', (e) => { startFight(); (e.currentTarget as HTMLElement).blur(); });
$('heal').addEventListener('click', (e) => { reset(); (e.currentTarget as HTMLElement).blur(); });

// Keyboard: W A S D move, Q E rotate, T G tilt, Z X zoom (as the other
// sheets); M march, B attack (all units); Space fight (a battle).
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if (mode === 'sheet' && (e.key === 'm' || e.key === 'M')) setMarching(!marching);
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
if (import.meta.env.DEV) Object.assign(window, { __units: { volleys, battle, setMode, startFight, camera, controls } });
renderer.setAnimationLoop(() => { time.value = performance.now() / 1000; pose(time.value); keyboard(); controls.update(); renderer.render(scene, camera); });
