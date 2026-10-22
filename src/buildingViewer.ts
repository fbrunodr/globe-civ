// Building styles (dev tool, /buildings.html): every lot model of every
// architectural style (houses.ts), laid out on a sheet:
//   All styles  a row per style: small, medium and large lots at their heights
//   By style    one style: footprints across, heights down, and which (civ, era) pairs use it
//   By civ      what a civ builds at each height (the era that brings the height noted)
// Lots are at the game's scale (tile steps), on a plain ground.

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { ARCH_CIVS, STYLES, STYLE_NAME, eraOfFloors, pairsOf, styleFloors, styleOf, type ArchCiv, type Style } from './architecture.ts';
import { FLOORS, FLOOR_NAME, FOOTPRINTS, FOOTPRINT_CELLS, type Floors, type Footprint } from './town/geometry.ts';
import { HOUSE_VARIANTS, houseKind } from './houses.ts';
import { FlatPainter, disposeGroup } from './flatTown.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const labels = new CSS2DRenderer({ element: $<HTMLDivElement>('labels') });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
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
const size = (fp: Footprint) => FOOTPRINT_CELLS[fp].map((c) => c * 0.0225) as [number, number];

function label(text: string, x: number, z: number, cls = ''): void {
  const el = document.createElement('div');
  el.className = `lbl ${cls}`;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(x, 0.002, z);
  world.add(o);
}
// One cell: the lot (or its variants side by side) at x, z (its front toward +z, the viewer).
function cell(s: Style, fp: Footprint, floors: Floors, x: number, z: number): number {
  const [w] = size(fp), vs = variant === 'all' ? Array.from({ length: HOUSE_VARIANTS }, (_, i) => i) : [variant];
  vs.forEach((v, i) => paint.model(houseKind(s, fp, floors, v), new THREE.Vector3(x + i * (w + 0.01), 0, z), 0, new THREE.Vector3(1, 1, 1), 0xffffff));
  return vs.length * (w + 0.01) - 0.01;
}
// A table of lots: footprints across, heights down; heights not built marked.
function table(styleAt: (f: Floors) => Style, heights: readonly Floors[], allowed: (f: Floors) => boolean, x0: number, z0: number, rowName: (f: Floors) => string = (f) => FLOOR_NAME[f]): { w: number; d: number } {
  const colW = FOOTPRINTS.map((fp) => (variant === 'all' ? HOUSE_VARIANTS : 1) * (size(fp)[0] + 0.01) + GAP);
  const rowD = heights.map(() => Math.max(...FOOTPRINTS.map((fp) => size(fp)[1])) + GAP * 1.6);
  let x = x0;
  FOOTPRINTS.forEach((fp, i) => { label(`${FOOTPRINT_CELLS[fp][0]}×${FOOTPRINT_CELLS[fp][1]}`, x + colW[i]! / 2 - GAP / 2, z0 - 0.04, 'head'); x += colW[i]!; });
  let z = z0;
  heights.forEach((f, r) => {
    label(rowName(f), x0 - 0.09, z + rowD[r]! / 2, allowed(f) ? 'head' : 'head off');
    let cx = x0;
    FOOTPRINTS.forEach((fp, i) => {
      if (allowed(f)) cell(styleAt(f), fp, f, cx + size(fp)[0] / 2, z + size(fp)[1] / 2);
      else if (i === 2) label('not in this era', cx + colW[i]! / 2, z + rowD[r]! / 2, 'off');
      cx += colW[i]!;
    });
    z += rowD[r]!;
  });
  return { w: x - x0, d: z - z0 };
}

function build(): { w: number; d: number } {
  scene.remove(world);
  disposeGroup(world);
  world.traverse((o) => { if (o instanceof CSS2DObject) o.element.remove(); });
  world = new THREE.Group();
  scene.add(world);
  let dims = { w: 1, d: 1 };
  let pairs = '';
  if (mode === 'overview') {
    // A row per style: a 2×2, a 3×3 and a 4×4 lot at each height it has.
    let z = 0, w = 0;
    for (const s of STYLES) {
      label(STYLE_NAME[s], -0.08, z + 0.05, 'head');
      let x = 0;
      for (const f of styleFloors(s)) for (const fp of ['b22', 'b33', 'b44'] as Footprint[]) {
        const used = cell(s, fp, f, x + size(fp)[0] / 2, z + size(fp)[1] / 2);
        x += used + GAP;
      }
      w = Math.max(w, x);
      z += 0.13;
    }
    dims = { w, d: z };
    pairs = 'Every style at its heights: a 2×2, a 3×3 and a 4×4 lot each.';
  } else if (mode === 'style') {
    const hs = styleFloors(style);
    dims = table(() => style, hs, () => true, 0, 0);
    const by = new Map<string, Set<ArchCiv>>();
    for (const p of pairsOf(style)) { const k = `${FLOOR_NAME[p.floors]}s`; by.set(k, (by.get(k) ?? new Set()).add(p.civ)); }
    pairs = `<b>${STYLE_NAME[style]}</b> is built by: ${[...by].map(([k, cs]) => `<br>${k}: ${[...cs].join(', ')}`).join('')}`;
  } else {
    // (Each height in the civ's style for it, in every era that builds it.)
    dims = table((f) => styleOf(civ, f), FLOORS, () => true, 0, 0, (f) => `${FLOOR_NAME[f]} · ${eraOfFloors(f)}`);
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

// Keyboard: W A S D move, Q E rotate, Z X zoom.
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
  const zoom = (keys.has('x') ? 1 : 0) - (keys.has('z') ? 1 : 0);
  if (zoom) { const off = camera.position.clone().sub(controls.target).multiplyScalar(Math.exp(zoom * 1.5 * dt)); camera.position.copy(controls.target).add(off); }
}

const resize = () => { renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize);
resize();
rebuild(true);
renderer.setAnimationLoop(() => { keyboard(); controls.update(); renderer.render(scene, camera); labels.render(scene, camera); });
if (import.meta.env.DEV) Object.assign(window, { __viewer: { camera, controls, set: (m: Mode, s?: Style) => { mode = m; if (s) style = s; document.body.dataset['mode'] = m; rebuild(true); } } });
