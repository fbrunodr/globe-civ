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
import { modelGeometry, placedGeometry } from './buildingCatalog.ts';
import { CATALOG } from './propCatalog.ts';
import { SITE_MODELS, groundsBox, landHalf, seaScale, wonderGrounds, wonderModelKind, type GroundShape, type SiteModel } from './wonderModels.ts';
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
// A wonder's grounds (wonderModels.ts wonderGrounds), as the game lays
// them: its sinks dug into the floor (FLOOR_Y; the floor cut round them:
// `holes`), their sides and floors, their water (flat, the game's water's
// colour); what it lays on the floor (each layer a hair over the one
// under it, cut round the sinks); its trees, the flora's own models, on
// the floor or up on the model.
const WATER = new THREE.Color(0x2f6a78), FLOOR_Y = -0.002;
const holes: THREE.Vector2[][] = [];
function grounds(m: SiteModel, x0: number, s: number): void {
  const gr = wonderGrounds(m);
  if (!gr) return;
  const P = (x: number, z: number, y = 0) => new THREE.Vector3(x0 + x * s, y, z * s);
  const inShape = (c: GroundShape, x: number, z: number) => {
    const u = (x - c.x) / c.hw, v = (z - c.z) / c.hd;
    return c.round ? u * u + v * v < 1 : Math.abs(u) < 1 && Math.abs(v) < 1;
  };
  for (const sk of gr.sinks ?? []) {
    const n = sk.outline.length, fy = -sk.depth * s, side = new THREE.Color(sk.side);
    holes.push(sk.outline.map(([x, z]) => new THREE.Vector2(x0 + x * s, z * s)));
    sk.outline.forEach(([x, z], i) => {
      const [x1, z1] = sk.outline[(i + 1) % n]!;
      paint.tri(side, P(x, z, FLOOR_Y), P(x1, z1, FLOOR_Y), P(x1, z1, fy));
      paint.tri(side, P(x, z, FLOOR_Y), P(x1, z1, fy), P(x, z, fy));
    });
    const tris = THREE.ShapeUtils.triangulateShape(sk.outline.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [a, b, c] of tris) {
      const at = (k: number, y: number) => P(sk.outline[k]![0], sk.outline[k]![1], y);
      paint.tri(new THREE.Color(sk.floor), at(a, fy), at(b, fy), at(c, fy));
      if (sk.water !== undefined) paint.tri(WATER, at(a, -sk.water * s), at(b, -sk.water * s), at(c, -sk.water * s));
    }
  }
  // (In cells CELL_W across, those over a sink left out.)
  const CELL_W = 0.0008, cuts = (gr.sinks ?? []).flatMap((sk) => sk.cut);
  for (const p of gr.paint ?? []) {
    const c = new THREE.Color(p.color), y = FLOOR_Y + 0.00015 * (p.layer + 1);
    const nx = Math.max(1, Math.round((2 * p.hw) / CELL_W)), nz = Math.max(1, Math.round((2 * p.hd) / CELL_W));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const xa = p.x - p.hw + (2 * p.hw * i) / nx, xb = p.x - p.hw + (2 * p.hw * (i + 1)) / nx, za = p.z - p.hd + (2 * p.hd * j) / nz, zb = p.z - p.hd + (2 * p.hd * (j + 1)) / nz;
      const mx = (xa + xb) / 2, mz = (za + zb) / 2;
      if ((p.round && !inShape(p, mx, mz)) || cuts.some((k) => inShape(k, mx, mz))) continue;
      paint.tri(c, P(xa, za, y), P(xb, za, y), P(xb, zb, y));
      paint.tri(c, P(xa, za, y), P(xb, zb, y), P(xa, zb, y));
    }
  }
  const tall = new Map<string, number>();
  for (const [i, t] of (gr.trees ?? []).entries()) {
    let h = tall.get(t.kind);
    if (h === undefined) { const geo = placedGeometry(t.kind); geo.computeBoundingBox(); h = geo.boundingBox!.max.y; geo.dispose(); tall.set(t.kind, h); }
    const k = (t.height * s) / h;
    paint.model(t.kind, P(t.x, t.z, (t.y ?? 0) * s), i * 2.4, new THREE.Vector3(k, k, k), CATALOG[t.kind].leaf);
  }
}
let x = 0.05;
const at = new Map<string, { x: number; h: number; r: number }>();
const house = houseKind(styleOf('Romans', 3), 'b22', 3, 0);
for (const { m, era, by } of models) {
  const kind = wonderModelKind(m), g = modelGeometry(kind);
  g.computeBoundingBox();
  const b = g.boundingBox!, hw = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z, ...groundsBox(m));
  // (Its size in the game: in a city, fitted to its rectangle; beside it,
  // its own size on land or on the sea: wonderModels.ts landHalf, seaScale.)
  const where = WONDERS[m].beside;
  const s = where === 'land' ? landHalf(m) / hw : where === 'sea' ? seaScale(m) : (0.95 * RECT) / (2 * hw);
  const half = hw * s;
  x += half;
  paint.model(kind, new THREE.Vector3(x, 0, 0), 0, new THREE.Vector3(s, s, s), 0xffffff);
  grounds(m, x, s);
  paint.model(house, new THREE.Vector3(x + half + 0.03, 0, 0.02), 0, new THREE.Vector3(HOUSE_SCALE, HOUSE_SCALE, HOUSE_SCALE), 0xb5523a);
  at.set(m, { x, h: b.max.y * s, r: half });
  label(WONDERS[m].name, x + 0.015, half + 0.04, true);
  const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  label(`${ERAS[era].name} · ${by} · ${(b.max.y * s / CITY_CELL).toFixed(1)} cells tall · ${Math.round(tris).toLocaleString('en')} triangles`, x + 0.015, half + 0.058);
  x += half + 0.09;
}
// (The floor, cut round the sinks.)
{
  const x0 = -0.15, z0 = -0.35, x1 = x + 0.05, z1 = 0.45, c = new THREE.Color(0x6f8a4b);
  const rim = [new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)];
  const all = [...rim, ...holes.flat()];
  for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(rim, holes)) paint.tri(c, ...[a!, b!, d!].map((k) => new THREE.Vector3(all[k]!.x, FLOOR_Y, all[k]!.y)));
}
paint.flush(world);

controls.target.set(x / 2, 0, 0);
camera.position.set(x / 2, 0.35, 0.55);

// (Scripts: frame one wonder, from an azimuth and elevation in degrees, at
// a distance in rectangles.)
(window as unknown as { __wonders: unknown }).__wonders = {
  camera, controls,
  // (ty: how high up the wonder to aim, as a fraction of its height.)
  focus(m: string, az = 30, el = 30, dist = 1.6, ty = 0.4): boolean {
    const w = at.get(m);
    if (!w) return false;
    const r = dist * Math.max(RECT / 2, w.r) * 2, a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    controls.target.set(w.x, w.h * ty, 0);
    camera.position.set(w.x + r * Math.sin(a) * Math.cos(e), w.h * ty + r * Math.sin(e), r * Math.cos(a) * Math.cos(e));
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
