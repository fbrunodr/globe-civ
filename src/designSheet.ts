// Town drawings sheet (dev tool, /city_designs.html), laid out flat with
// the game's models at the game's scale (a tile step is 1 here):
//   Classes  every edge class (src/town/edges.ts: 13 hexes) on its own,
//            by role and density, its stubs marked on its rim.
//   Towns    sample towns on a patch of hexes, stamped exactly as the game
//            does (edge values, then each tile's class drawing turned into
//            place; cityStamp.ts).
// Drawings are edited in /town_editor.html.

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WorldLabel, disposeLabels } from './worldLabel.ts';
import { DENSITIES, type Density } from './town/geometry.ts';
import { CLASSES, parseKey, type EdgeValue } from './town/edges.ts';
import { edgeClass, type Role } from './town/skeleton.ts';
import { SITE_MODELS, type SiteModel } from './wonderModels.ts';
import { variantsOf } from './town/index.ts';
import { stamp, type StampTile } from './cityStamp.ts';
import { FlatPainter, disposeGroup, type FlatTile } from './flatTown.ts';
import { mulberry32 } from './rng.ts';
import { ARCH_CIVS, type ArchCiv } from './architecture.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
// The mouse as in the world view: drag moves over the ground, right-drag (or
// Shift+drag) rotates and tilts, the wheel zooms.
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.4));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.position.set(-30, 60, 20);
scene.add(sun);
let world = new THREE.Group();
scene.add(world);
const paint = new FlatPainter();

// A label standing on the ground by a tile (a sign in the scene, LABEL tall).
const LABEL = 0.12;
function label(text: string, x: number, z: number): void {
  const o = new WorldLabel([{ text }], LABEL);
  o.position.set(x, LABEL / 2 + 0.01, z);
  world.add(o);
}

// ---------- views ----------

type View = 'classes' | 'towns';
let view: View = 'classes';
let role: Role = 'block';
let classDensity: Density = 'medium';
let townDensity: Density | 'mixed' = 'medium';
let townSeed = 1;
let walls = false;
let showBuildings = true;

// A wonder to show on the n-th tile's site (one of each in turn).
const WONDERS_SHOWN = SITE_MODELS.filter((m) => m !== 'scaffold');
const sampleWonder = (n: number): SiteModel => WONDERS_SHOWN[n % WONDERS_SHOWN.length]!;

// Every class on its own, open land round it (hand-drawn ones marked ✎).
function classesView(): { w: number; h: number } {
  const per = 10, W = 1.3;
  CLASSES.forEach((key, n) => {
    const x = (n % per + 0.5) * W, z = (Math.floor(n / per) + 0.5) * W;
    const f: FlatTile = { id: n, cx: x, cz: z };
    paint.tiles.set(f.id, f);
    paint.ground(f);
    const c = parseKey(key);
    // (With the buildings shown: the hall on a walled center's site, a wonder on a block's.)
    paint.stamp(stamp([{ tile: f.id, colouring: c, edgeCls: c.map((v) => (v ? edgeClass(v, classDensity, classDensity) : null)), role, density: classDensity }]),
      { walls: role === 'walled', spots: showBuildings, sites: () => (!showBuildings ? null : role === 'walled' ? 'hall' : sampleWonder(n)) });
    paint.marks(f, c);
    const vs = variantsOf(key, role, classDensity).length;
    label(`${key}${vs ? ` ✎${vs}` : ''}`, x, z + 0.58);
  });
  return { w: per * W, h: Math.ceil(CLASSES.length / per) * W };
}

// A patch of hexes round a center, stamped as the game would: four in five
// built up, a street across every edge between built tiles, and a road or
// two coming in from open land.
function townsView(): { w: number; h: number } {
  const rings = 2, axial: [number, number][] = [];
  for (let q = -rings; q <= rings; q++) for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) axial.push([q, r]);
  axial.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) + Math.abs(a[0] + a[1]) - (Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[0] + b[1])));
  const index = new Map(axial.map(([q, r], i) => [`${q},${r}`, i]));
  // Side j faces 60j°: steps in axial coordinates.
  const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const rand = mulberry32(townSeed * 7919);
  const C = rings + 1;
  axial.forEach(([q, r], i) => { const f: FlatTile = { id: i, cx: C + q + r * 0.5, cz: C - r * Math.sqrt(3) / 2 }; paint.tiles.set(i, f); paint.ground(f); });
  const built = axial.map((_, i) => i === 0 || rand() < 0.8);
  const density = axial.map((_, i): Density => (townDensity === 'mixed' ? (i === 0 ? 'medium' : DENSITIES[Math.min(2, Math.floor(rand() * 2.6))]!) : townDensity));
  const stamps: StampTile[] = [];
  axial.forEach(([q, r], i) => {
    if (!built[i]) return;
    const nbs = DIRS.map(([dq, dr]) => index.get(`${q + dq},${r + dr}`));
    const colouring = nbs.map((n, j): EdgeValue => {
      if (n !== undefined && built[n]) return 1;
      // A road in from open land on about one outer side in eight.
      return (Math.imul(i * 31 + j * 7 + townSeed, 2246822519) >>> 0) % 8 === 0 ? 1 : 0;
    });
    const edgeCls = colouring.map((v, j) => (v ? edgeClass(v, density[i]!, nbs[j] !== undefined && built[nbs[j]!] ? density[nbs[j]!]! : density[i]!) : null));
    stamps.push({ tile: i, colouring, edgeCls, role: i === 0 && walls ? 'walled' : 'block', density: density[i]! });
  });
  // (The hall on the center's site; with the buildings shown, a wonder on every third other tile.)
  paint.stamp(stamp(stamps), { walls, spots: showBuildings, sites: (t) => (t === 0 ? 'hall' : showBuildings && t % 3 === 0 ? sampleWonder(t) : null) });
  return { w: 2 * C, h: 2 * C };
}

let framed = false;
function build(): void {
  scene.remove(world);
  disposeGroup(world);
  disposeLabels(world);
  world = new THREE.Group();
  scene.add(world);
  paint.tiles.clear();
  const size = view === 'classes' ? classesView() : townsView();
  paint.floor(-1, -1, size.w + 1, size.h + 1);
  const count = paint.flush(world);
  $('info').textContent = view === 'classes' ? `${CLASSES.length} classes · ${role} · ${classDensity} · ${count.toLocaleString()} models` : `seed ${townSeed} · ${count.toLocaleString()} models`;
  if (!framed) {
    framed = true;
    const m = Math.max(size.w, size.h);
    controls.target.set(size.w / 2, 0, size.h / 2);
    camera.position.set(size.w / 2, m * 0.9, size.h / 2 + m * 0.4);
  }
}

// ---------- controls ----------

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset['view'] as View;
  document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
  document.body.dataset['view'] = view;
  framed = false;
  build();
  b.blur();
}));
$<HTMLSelectElement>('density').addEventListener('change', (e) => { classDensity = (e.target as HTMLSelectElement).value as Density; build(); });
$<HTMLSelectElement>('role').addEventListener('change', (e) => { role = (e.target as HTMLSelectElement).value as Role; build(); });
$<HTMLSelectElement>('townDensity').addEventListener('change', (e) => { townDensity = (e.target as HTMLSelectElement).value as Density | 'mixed'; build(); });
$<HTMLInputElement>('buildings').addEventListener('change', (e) => { showBuildings = (e.target as HTMLInputElement).checked; build(); });
$<HTMLInputElement>('walls').addEventListener('change', (e) => { walls = (e.target as HTMLInputElement).checked; build(); });
// Whose houses (the drawings are the same for every civ).
$<HTMLSelectElement>('lookCiv').innerHTML = ARCH_CIVS.map((c) => `<option${c === paint.look.civ ? ' selected' : ''}>${c}</option>`).join('');
$('lookCiv').addEventListener('change', () => { paint.look = { civ: $<HTMLSelectElement>('lookCiv').value as ArchCiv }; build(); });
$('reroll').addEventListener('click', (e) => { townSeed++; build(); (e.currentTarget as HTMLElement).blur(); });
$('fit').addEventListener('click', () => { framed = false; build(); });

// Keyboard: W A S D move (speed grows with the distance), Q E rotate, Z X zoom.
const keys = new Set<string>();
addEventListener('keydown', (e) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) keys.add(e.key.toLowerCase()); });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let lastT = performance.now();
function keyboard(): void {
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (!keys.size) return;
  const dist = camera.position.distanceTo(controls.target);
  const fwd = controls.target.clone().sub(camera.position).setY(0);
  if (fwd.lengthSq() < 1e-9) fwd.set(0, 0, -1);
  fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const move = new THREE.Vector3();
  if (keys.has('w')) move.add(fwd);
  if (keys.has('s')) move.sub(fwd);
  if (keys.has('d')) move.add(right);
  if (keys.has('a')) move.sub(right);
  if (move.lengthSq()) {
    move.normalize().multiplyScalar(dist * 0.9 * dt);
    camera.position.add(move);
    controls.target.add(move);
  }
  const turn = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
  if (turn) {
    const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * 1.2 * dt);
    camera.position.copy(controls.target).add(off);
  }
  const zoom = (keys.has('x') ? 1 : 0) - (keys.has('z') ? 1 : 0);
  if (zoom) {
    const off = camera.position.clone().sub(controls.target).multiplyScalar(Math.exp(zoom * 1.5 * dt));
    camera.position.copy(controls.target).add(off);
  }
}

const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();
document.body.dataset['view'] = view;
build();
renderer.setAnimationLoop(() => {
  keyboard();
  controls.update();
  renderer.render(scene, camera);
});
if (import.meta.env.DEV) {
  Object.assign(window, { __sheet: {
    camera, controls, keyboard,
    show: (v: View, seed?: number) => { view = v; if (seed !== undefined) townSeed = seed; framed = false; build(); },
    look: (x: number, z: number, d = 1.5) => { controls.target.set(x, 0, z); camera.position.set(x, d, z + d * 0.6); },
  } });
}
