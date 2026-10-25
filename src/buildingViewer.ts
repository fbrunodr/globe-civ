// Building styles (dev tool, /buildings.html): the buildings a painted city
// is made of (cityPainter.ts, dressed by cityDress.ts), in every
// architectural style (houses.ts), laid out on a sheet:
//   All styles  a row per style: its buildings at each height it has
//   By style    one style: the painter's sizes across, heights down, and the civs that use it
//   By civ      what a civ builds at each height (the era that first builds it noted)
// Sizes are the painter's rectangles (8 × 8, 8 × 10, 10 × 10 units; a
// skyscraper 12 × 12 or 10 × 12), each house fitted as the game fits it, at
// the lot models' scale (tile steps), on a plain ground.

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARCH_CIVS, STYLES, STYLE_NAME, pairsOf, styleFloors, styleOf, type ArchCiv, type Style } from './architecture.ts';
import { CELL, FLOORS, FLOOR_NAME, type Floors } from './town/geometry.ts';
import { HOUSE_VARIANTS, houseKind } from './houses.ts';
import { SIZES, UNITS_PER_CELL } from './cityPainter.ts';
import { DRESS_ERA_NAME, firstEra, fitHouse } from './cityDress.ts';
import { FlatPainter, disposeGroup } from './flatPainter.ts';
import { WorldLabel, disposeLabels } from './worldLabel.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
// The mouse as in the world view: drag moves over the ground, right-drag (or
// Shift+drag) rotates and tilts, the wheel zooms.
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.4));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.position.set(-30, 60, 40);
scene.add(sun);
let world = new THREE.Group();
scene.add(world);
const paint = new FlatPainter();

type Mode = 'overview' | 'style' | 'civ';
let mode: Mode = 'overview';
let style: Style = 'mediterranean';
let civ: ArchCiv = 'Romans';
let variant: number | 'all' = 0;

const GAP = 0.03; // between lots (tile steps)
// The painter's rectangles for a height (front × depth, units; one way round each).
const sizesFor = (f: Floors): readonly (readonly [number, number])[] => (f === 12 ? SIZES.skyscraper : SIZES.building).filter(([a, b]) => a <= b);
const COLS = Math.max(sizesFor(1).length, sizesFor(12).length);
// A rectangle's size on the sheet (tile steps, at the lot models' scale).
const size = ([front, depth]: readonly [number, number]) => [(front / UNITS_PER_CELL) * CELL, (depth / UNITS_PER_CELL) * CELL] as const;

// A label standing on the ground (a sign in the scene, LABEL tall).
const LABEL = 0.01;
function label(text: string, x: number, z: number, cls = ''): void {
  const o = new WorldLabel([{ text, bold: cls.includes('head'), ...(cls.includes('off') ? { color: '#f2b0a8' } : {}) }], LABEL);
  o.position.set(x, LABEL / 2 + 0.001, z);
  world.add(o);
}
// One building: a painted rectangle's house (or its variants side by side)
// at x, z, fitted as the game fits it (its front toward +z, the viewer).
function cell(s: Style, rect: readonly [number, number], floors: Floors, x: number, z: number): number {
  const [w] = size(rect), { fp, sx, sz } = fitHouse(rect[0], rect[1]);
  const vs = variant === 'all' ? Array.from({ length: HOUSE_VARIANTS }, (_, i) => i) : [variant];
  vs.forEach((v, i) => paint.model(houseKind(s, fp, floors, v), new THREE.Vector3(x + i * (w + 0.01), 0, z), 0, new THREE.Vector3(sx, 1, sz), 0xffffff));
  return vs.length * (w + 0.01) - 0.01;
}
// A table: the painter's sizes across, heights down.
function table(styleAt: (f: Floors) => Style, heights: readonly Floors[], x0: number, z0: number, rowName: (f: Floors) => string = (f) => FLOOR_NAME[f]): { w: number; d: number } {
  const colW = Array.from({ length: COLS }, (_, i) => Math.max(...heights.map((f) => { const r = sizesFor(f)[i]; return r ? (variant === 'all' ? HOUSE_VARIANTS : 1) * (size(r)[0] + 0.01) : 0; })) + GAP);
  const rowD = heights.map((f) => Math.max(...sizesFor(f).map((r) => size(r)[1])) + GAP * 1.6);
  let z = z0;
  heights.forEach((f, r) => {
    label(rowName(f), x0 - 0.12, z + rowD[r]! / 2, 'head');
    let cx = x0;
    sizesFor(f).forEach((rect, i) => {
      label(`${rect[0]}×${rect[1]}`, cx + size(rect)[0] / 2, z - 0.012);
      cell(styleAt(f), rect, f, cx + size(rect)[0] / 2, z + size(rect)[1] / 2);
      cx += colW[i]!;
    });
    z += rowD[r]!;
  });
  return { w: colW.reduce((a, c) => a + c, 0), d: z - z0 };
}

function build(): { w: number; d: number } {
  scene.remove(world);
  disposeGroup(world);
  disposeLabels(world);
  world = new THREE.Group();
  scene.add(world);
  let dims = { w: 1, d: 1 };
  let pairs = '';
  if (mode === 'overview') {
    // A row per style: its buildings, each size the painter draws, at each height it has.
    let z = 0, w = 0;
    for (const s of STYLES) {
      label(STYLE_NAME[s], -0.08, z + 0.05, 'head');
      let x = 0;
      for (const f of styleFloors(s)) for (const rect of sizesFor(f)) {
        const used = cell(s, rect, f, x + size(rect)[0] / 2, z + size(rect)[1] / 2);
        x += used + GAP;
      }
      w = Math.max(w, x);
      z += 0.13;
    }
    dims = { w, d: z };
    pairs = "Every style at its heights, in each of the painter's sizes (8×8, 8×10, 10×10 units; skyscrapers 12×12, 10×12).";
  } else if (mode === 'style') {
    const hs = styleFloors(style);
    dims = table(() => style, hs, 0, 0);
    const by = new Map<string, Set<ArchCiv>>();
    for (const p of pairsOf(style)) { const k = `${FLOOR_NAME[p.floors]}s`; by.set(k, (by.get(k) ?? new Set()).add(p.civ)); }
    pairs = `<b>${STYLE_NAME[style]}</b> is built by: ${[...by].map(([k, cs]) => `<br>${k}: ${[...cs].join(', ')}`).join('')}`;
  } else {
    // (Each height in the civ's style for it, and the era that first builds it.)
    dims = table((f) => styleOf(civ, f), FLOORS, 0, 0, (f) => `${FLOOR_NAME[f]} · from ${DRESS_ERA_NAME[firstEra(f)]}${f === 12 ? ', size 10' : ''}`);
    pairs = `<b>${civ}</b>: ${FLOORS.map((f) => `${FLOOR_NAME[f]}: <b>${STYLE_NAME[styleOf(civ, f)]}</b>`).join(' · ')}`;
  }
  $('pairs').innerHTML = pairs;
  paint.floor(-0.2, -0.12, dims.w + 0.1, dims.d + 0.08);
  paint.flush(world);
  return dims;
}

function frame(d: { w: number; d: number }): void {
  const m = Math.max(d.w, d.d);
  controls.target.set(d.w / 2, 0, d.d / 2);
  camera.position.set(d.w / 2, m * 0.75, d.d / 2 + m * 0.75);
}
function rebuild(reframe = false): void { const d = build(); if (reframe) frame(d); }

$<HTMLSelectElement>('style').innerHTML = STYLES.map((s) => `<option value="${s}">${STYLE_NAME[s]}</option>`).join('');
$<HTMLSelectElement>('civSel').innerHTML = ARCH_CIVS.map((c) => `<option>${c}</option>`).join('');
document.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset['mode'] as Mode;
  document.body.dataset['mode'] = mode;
  document.querySelectorAll('button[data-mode]').forEach((x) => x.classList.toggle('active', x === b));
  rebuild(true);
  b.blur();
}));
$('style').addEventListener('change', (e) => { style = (e.target as HTMLSelectElement).value as Style; rebuild(true); });
$('civSel').addEventListener('change', (e) => { civ = (e.target as HTMLSelectElement).value as ArchCiv; rebuild(); });
$('variant').addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; variant = v === 'all' ? 'all' : Number(v); rebuild(true); });

// Keyboard: W A S D move, Q E rotate, T G tilt (toward the horizon / back down, as in the world view), Z X zoom.
const keys = new Set<string>();
addEventListener('keydown', (e) => { if (!(e.target instanceof HTMLSelectElement)) keys.add(e.key.toLowerCase()); });
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
  // (The offset from the target first: the camera then moves to target + offset.)
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
rebuild(true);
renderer.setAnimationLoop(() => { keyboard(); controls.update(); renderer.render(scene, camera); });
if (import.meta.env.DEV) Object.assign(window, { __viewer: { camera, controls, set: (m: Mode, s?: Style) => { mode = m; if (s) style = s; document.body.dataset['mode'] = m; rebuild(true); } } });
