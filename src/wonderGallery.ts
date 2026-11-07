// Wonders (dev tool, /wonders.html): every wonder at the size a city draws
// it (cityDress.ts: fitted to the painter's 16 × 16 rectangle), in a row by
// era, each beside a three-storey house (the height every wonder must
// clear: wonderModels.ts MIN_HEIGHT), its name, era and what unlocks it.
// (Machu Picchu stands on a mountain top: the gallery's catalog has it.)

import './style.css';
import './topbar.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlatPainter } from './flatPainter.ts';
import { WorldLabel } from './worldLabel.ts';
import { modelGeometry } from './buildingCatalog.ts';
import { SITE_MODELS, landHalf, seaScale, wonderModelKind, type SiteModel } from './wonderModels.ts';
import { WONDERS, ERAS, type WonderKey, type EraIndex } from './cities.ts';
import { TECH_KEYS, techDef } from './techs.ts';
import { POLITICS_KEYS, politicsDef } from './politics.ts';
import { houseKind } from './houses.ts';
import { styleOf } from './architecture.ts';
import { UNIT, CITY_CELL } from './cityPainter.ts';
import { CELL } from './town/geometry.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
scene.add(new THREE.HemisphereLight(0xd9e9fc, 0x6a5a40, 1.4));
const sun = new THREE.DirectionalLight(0xffedd3, 2.1);
sun.position.set(-30, 60, 40);
scene.add(sun);
const world = new THREE.Group();
scene.add(world);
const paint = new FlatPainter();

// Where a wonder is unlocked, and so its era.
function unlock(w: WonderKey): { era: EraIndex; by: string } {
  for (const k of TECH_KEYS) if (techDef(k).wonders?.includes(w)) return { era: techDef(k).era, by: techDef(k).name };
  for (const k of POLITICS_KEYS) if (politicsDef(k).wonders?.includes(w)) return { era: politicsDef(k).era, by: politicsDef(k).name };
  return { era: 0, by: '—' };
}
function label(text: string, x: number, z: number, bold = false): void {
  const o = new WorldLabel([{ text, bold }], 0.012);
  o.position.set(x, 0.007, z);
  world.add(o);
}

// The size a city draws a wonder: fitted to a 16 × 16 rectangle, a hair inside (cityDress.ts).
const RECT = 16 * UNIT;
const HOUSE_SCALE = CITY_CELL / CELL;
const models = SITE_MODELS.filter((m): m is Exclude<SiteModel, 'scaffold'> => m !== 'scaffold')
  .map((m) => ({ m, ...unlock(m) }))
  .sort((a, b) => a.era - b.era);
let x = 0.05;
const at = new Map<string, { x: number; h: number; r: number }>();
const house = houseKind(styleOf('Romans', 3), 'b22', 3, 0);
for (const { m, era, by } of models) {
  const kind = wonderModelKind(m), g = modelGeometry(kind);
  g.computeBoundingBox();
  const b = g.boundingBox!, hw = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
  // (Its size in the game: in a city, fitted to its rectangle; beside it,
  // its own size on land or on the sea: wonderModels.ts landHalf, seaScale.)
  const where = WONDERS[m].beside;
  const s = where === 'land' ? landHalf(m) / hw : where === 'sea' ? seaScale(m) : (0.95 * RECT) / (2 * hw);
  const half = hw * s;
  x += half;
  paint.model(kind, new THREE.Vector3(x, 0, 0), 0, new THREE.Vector3(s, s, s), 0xffffff);
  paint.model(house, new THREE.Vector3(x + half + 0.03, 0, 0.02), 0, new THREE.Vector3(HOUSE_SCALE, HOUSE_SCALE, HOUSE_SCALE), 0xb5523a);
  at.set(m, { x, h: b.max.y * s, r: half });
  label(WONDERS[m].name, x + 0.015, half + 0.04, true);
  label(`${ERAS[era].name} · ${by} · ${(b.max.y * s / CITY_CELL).toFixed(1)} cells tall`, x + 0.015, half + 0.058);
  x += half + 0.09;
}
paint.floor(-0.15, -0.35, x + 0.05, 0.45);
paint.flush(world);

controls.target.set(x / 2, 0, 0);
camera.position.set(x / 2, 0.35, 0.55);

// (Scripts: frame one wonder, from an azimuth and elevation in degrees, at
// a distance in rectangles.)
(window as unknown as { __wonders: unknown }).__wonders = {
  camera, controls,
  focus(m: string, az = 30, el = 30, dist = 1.6): boolean {
    const w = at.get(m);
    if (!w) return false;
    const r = dist * Math.max(RECT / 2, w.r) * 2, a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    controls.target.set(w.x, w.h * 0.4, 0);
    camera.position.set(w.x + r * Math.sin(a) * Math.cos(e), w.h * 0.4 + r * Math.sin(e), r * Math.cos(a) * Math.cos(e));
    controls.update();
    return true;
  },
};

const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
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
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    sph.phi = Math.min(controls.maxPolarAngle, Math.max(0.05, sph.phi + tilt * 0.9 * dt));
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
  }
  const zoom = (keys.has('x') ? 1 : 0) - (keys.has('z') ? 1 : 0);
  if (zoom) { const off = camera.position.clone().sub(controls.target).multiplyScalar(Math.exp(zoom * 1.5 * dt)); camera.position.copy(controls.target).add(off); }
}
const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => { keyboard(); controls.update(); renderer.render(scene, camera); });
