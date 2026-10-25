// City samples (dev tool, /city_samples.html): a sheet of cities painted
// as the game paints them (cityPainter.ts, dressed by cityDress.ts), each
// with its own civ, era, size, wonders and walls, on a real tile: 200
// buildable hexes of the default world (medium, seed 7), with their own
// heights, water and colour from the game's terrain (as render.ts builds
// it). To look many over at once and find what looks wrong. Filters keep
// one civ, era, kind of ground or wonder count; "New samples" draws the
// next sheet.

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARCH_CIVS, type ArchCiv } from './architecture.ts';
import { SITE_MODELS, type SiteModel } from './wonderModels.ts';
import { corner, toFan, type Pt } from './town/geometry.ts';
import { Game } from './game.ts';
import { tileLook } from './look.ts';
import { buildPaintData, warpAt } from './paint.ts';
import { buildRelief } from './relief.ts';
import { buildSurface, meshLevels, type SurfaceLayers } from './surface.ts';
import { cityGround } from './terraform.ts';
import { buildTerrainMesh } from './terrainMesh.ts';
import { DRESS_ERA_NAME, dressCity, type DressEra } from './cityDress.ts';
import { MAX_WONDERS } from './cityPainter.ts';
import { FlatPainter, HOUSE, disposeGroup } from './flatTown.ts';
import { WorldLabel, disposeLabels } from './worldLabel.ts';
import { mulberry32, type Rng } from './rng.ts';

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
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.4));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.position.set(-30, 60, 40);
scene.add(sun);
let world = new THREE.Group();
scene.add(world);
const paint = new FlatPainter();

// ---------- the tiles ----------

// The default world and its terrain, as the game builds them (render.ts:
// SUBDIV subdivisions per tile fan).
const SUBDIV = 4;
const game = new Game({ size: 'medium', seed: 7 });
const looks = game.tiles.map((t) => tileLook(game.map, t.id));
const paintData = buildPaintData(game.globe, game.map, game.seed);
const relief = buildRelief(game.globe, game.map, looks, game.seed, paintData.params.r0);
const levels = meshLevels(game.globe, game.map, looks);
let layers: SurfaceLayers | null = null;
const mesh = buildTerrainMesh(game.globe, {
  level: (t) => levels[t] as 1 | 2 | 4,
  surface: (topo) => { const sf = buildSurface(game.globe, game.map, looks, paintData, relief, game.seed, topo); layers = sf.layers; return sf.fields; },
  warp: (dir, out) => { warpAt(paintData.params, dir.x, dir.y, dir.z, out); },
  fanAttributes: [],
}, SUBDIV);
const D = game.globe.avgEdgeAngle;
// What kind of ground a tile is: on a river, on the coast, hills, or flat.
const GROUNDS = ['flat', 'hills', 'river', 'coast'] as const;
type Ground = (typeof GROUNDS)[number];
const riverCorners = new Set(game.map.rivers.flatMap((r) => r.corners));
const groundOf = (t: number): Ground =>
  game.tiles[t]!.corners.some((c) => riverCorners.has(c)) ? 'river'
    : game.tiles[t]!.neighbors.some((n) => game.isWater(n)) ? 'coast'
      : game.map.relief[t] === 'hills' ? 'hills' : 'flat';
// 200 buildable hexes (land, not mountains or ice), in a fixed order.
const TILES: readonly number[] = (() => {
  const r = mulberry32(2026);
  const ok = game.tiles.map((t) => t.id).filter((t) => game.tiles[t]!.corners.length === 6 && !game.isWater(t) && game.map.relief[t] !== 'mountains' && game.map.biome[t] !== 'iceSheet');
  for (let i = ok.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ok[i], ok[j]] = [ok[j]!, ok[i]!]; }
  return ok.slice(0, 200);
})();
// Each tile a city stands on, as the game reshapes it (terraform.ts:
// wetlands drained).
{
  const built = new Set(TILES);
  mesh.reshape(cityGround(game.globe, mesh.topo, layers!, mesh.fields.height.slice(), mesh.fields.water, (t) => built.has(t), 1));
}
// A point of a tile (its canonical hex): its ground and water, tile steps above the tile's middle.
const levelAt = (t: number, p: Pt, base: number) => {
  const f = toFan(6, p), lv = mesh.at(t, f.j, f.wa, f.wb);
  return { ground: (lv.ground - base) / D, water: lv.water > lv.ground + 1e-7 ? (lv.water - base) / D : null };
};

// ---------- one sample ----------

interface Sample { civ: ArchCiv; era: DressEra; pop: number; wonders: SiteModel[]; walled: boolean; tile: number; seed: number }
const WATER = new THREE.Color(0x4f86a8);

function drawSample(s: Sample, cx: number, cz: number): void {
  const t = s.tile, base = mesh.at(t, 0, 0, 0).ground;
  const to3 = (p: Pt, y: number) => new THREE.Vector3(cx + p.x, y, cz - p.y);
  const level = (p: Pt) => levelAt(t, p, base);
  const ground = (p: Pt) => level(p).ground;
  const wet = (p: Pt) => level(p).water !== null;
  const colour = new THREE.Color(looks[t]!.color);
  // The tile: a fan of fine triangles at its ground, its water above.
  const K = 24;
  for (let j = 0; j < 6; j++) {
    const A = corner(6, j), B = corner(6, j + 1);
    const at = (a: number, b: number): Pt => ({ x: (A.x * a + B.x * b) / K, y: (A.y * a + B.y * b) / K });
    for (let a = 0; a < K; a++) for (let b = 0; a + b < K; b++) {
      const tris: [Pt, Pt, Pt][] = [[at(a, b), at(a + 1, b), at(a, b + 1)]];
      if (a + b + 1 < K) tris.push([at(a + 1, b), at(a + 1, b + 1), at(a, b + 1)]);
      for (const tri of tris) {
        const lv = tri.map(level);
        if (lv.every((l) => l.water !== null)) paint.tri(WATER, ...tri.map((p, k) => to3(p, lv[k]!.water!)));
        else paint.tri(colour, ...tri.map((p, k) => to3(p, lv[k]!.ground)));
      }
    }
  }
  // The city.
  const city = dressCity({ civ: s.civ, era: s.era, pop: s.pop, wonders: s.wonders, walled: s.walled, seed: s.seed, free: (p) => !wet(p) });
  const corners = (at: Pt, yaw: number, hw: number, hd: number): Pt[] => {
    const f = { x: Math.cos(yaw), y: Math.sin(yaw) }, side = { x: -f.y, y: f.x };
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => ({ x: at.x + side.x * a! * hw + f.x * b! * hd, y: at.y + side.y * a! * hw + f.y * b! * hd }));
  };
  for (const b of city.buildings) {
    if (wet(b.at)) continue;
    // Level with the highest ground under it, a foundation below (as in the game: cityProps.ts 'top').
    const cs = corners(b.at, b.yaw, b.hw * b.scale, b.hd * b.scale), hs = [...cs, b.at].map(ground);
    const top = Math.max(...hs), low = Math.min(...hs), yaw = b.yaw + Math.PI / 2;
    paint.model(b.model, to3(b.at, top), yaw, new THREE.Vector3(b.scale * b.sx, b.scale, b.scale * b.sz), 0xffffff, 0.92 + 0.12 * b.variant);
    if (top - low > 0.0005) paint.model('foundation', to3(b.at, low - 0.001), yaw, new THREE.Vector3((2 * b.hw * b.scale) / 0.01, (top - low + 0.001) / 0.01, (2 * b.hd * b.scale) / 0.01), 0x8d877c);
  }
  // Roads: on the ground, in small pieces so they follow it.
  const road = new THREE.Color(...city.roadRgb);
  for (const r of city.painting.roads) {
    const [p0, p1, , p3] = r as [Pt, Pt, Pt, Pt];
    const ex = { x: p1.x - p0.x, y: p1.y - p0.y }, ey = { x: p3.x - p0.x, y: p3.y - p0.y };
    const nx = Math.max(1, Math.ceil(Math.hypot(ex.x, ex.y) / 0.02)), ny = Math.max(1, Math.ceil(Math.hypot(ey.x, ey.y) / 0.02));
    const q = (i: number, j: number): THREE.Vector3 => { const p = { x: p0.x + (ex.x * i) / nx + (ey.x * j) / ny, y: p0.y + (ex.y * i) / nx + (ey.y * j) / ny }; return to3(p, ground(p) + 0.0012); };
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { paint.tri(road, q(i, j), q(i + 1, j), q(i + 1, j + 1)); paint.tri(road, q(i, j), q(i + 1, j + 1), q(i, j + 1)); }
  }
  // Walls.
  if (city.wall) {
    const pts = city.wall.map((p) => to3(p, ground(p)));
    pts.forEach((p, n) => {
      if (n % 2 === 0 && n < pts.length - 1) paint.model('wallTower', p, 0, new THREE.Vector3(HOUSE, HOUSE, HOUSE), 0x6a625a);
      const q = pts[n + 1];
      if (!q) return;
      const d = q.clone().sub(p), l = Math.hypot(d.x, d.z);
      paint.model('wallSegment', p.clone().add(q).multiplyScalar(0.5), Math.atan2(-d.z, d.x), new THREE.Vector3(l / 0.01, HOUSE, HOUSE), 0xa49c8c);
    });
  }
  // Its label.
  const lines = [`${s.civ} · ${DRESS_ERA_NAME[s.era]} · size ${s.pop}`, `tile ${t} · ${groundOf(t)}${s.walled ? ' · walled' : ''} · ${s.wonders.length ? `${s.wonders.length} wonder${s.wonders.length > 1 ? 's' : ''}` : 'no wonders'}`];
  const o = new WorldLabel(lines.map((text, i) => ({ text, bold: i === 0 })), 0.05);
  o.position.set(cx, 0.03, cz + 0.58);
  world.add(o);
}

// ---------- the sheet ----------

type Any<T> = T | 'any';
const filters: { civ: Any<ArchCiv>; era: Any<DressEra>; ground: Any<Ground>; wonders: Any<'none' | 'few' | 'many'>; walls: Any<'yes' | 'no'> } = { civ: 'any', era: 'any', ground: 'any', wonders: 'any', walls: 'any' };
let sheet = 1;
const COLS = 6, ROWS = 6, GAP = 1.25;
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
// The tiles a sheet takes, in order (the next sheet the next ones, round again).
let pool: number[] = [];
const fillPool = () => {
  const keep = TILES.filter((t) => filters.ground === 'any' || groundOf(t) === filters.ground);
  pool = Array.from({ length: sheet * COLS * ROWS }, (_, k) => keep[k % keep.length]!);
};
function sample(i: number): Sample {
  const r = mulberry32(sheet * 100003 + i * 7919);
  const era = filters.era === 'any' ? pick(r, [0, 1, 2, 3] as const) : filters.era;
  const nw = filters.wonders === 'none' ? 0 : filters.wonders === 'few' ? 1 + Math.floor(r() * 3) : filters.wonders === 'many' ? 4 + Math.floor(r() * (MAX_WONDERS - 3)) : (r() < 0.45 ? 0 : 1 + Math.floor(r() * r() * MAX_WONDERS));
  const kinds = SITE_MODELS.filter((m) => m !== 'scaffold'), start = Math.floor(r() * kinds.length);
  return {
    civ: filters.civ === 'any' ? pick(r, ARCH_CIVS) : filters.civ,
    era, pop: 1 + Math.floor(r() * 24),
    // (Each wonder once, as in the game; past the wonders there are, repeats.)
    wonders: Array.from({ length: nw }, (_, k) => (k === nw - 1 && r() < 0.2 ? 'scaffold' : kinds[(start + k) % kinds.length]!)),
    walled: filters.walls === 'any' ? r() < 0.35 : filters.walls === 'yes',
    tile: pool[(sheet - 1) * COLS * ROWS + i]!, seed: sheet * 1000 + i,
  };
}
function build(): void {
  fillPool();
  disposeLabels(world); disposeGroup(world); scene.remove(world);
  world = new THREE.Group(); scene.add(world);
  for (let i = 0; i < COLS * ROWS; i++) drawSample(sample(i), (i % COLS) * GAP, Math.floor(i / COLS) * GAP);
  paint.flush(world);
  $('count').textContent = `sheet ${sheet} · ${COLS * ROWS} cities`;
}
function frame(): void {
  const w = (COLS - 1) * GAP, d = (ROWS - 1) * GAP, m = Math.max(w, d);
  controls.target.set(w / 2, 0, d / 2);
  camera.position.set(w / 2, m * 0.8, d / 2 + m * 0.7);
}

// The filters: any, or one of each.
const options = <T extends string | number>(id: string, xs: readonly T[], name: (x: T) => string, set: (v: Any<T>) => void) => {
  const el = $<HTMLSelectElement>(id);
  el.innerHTML = `<option value="any">any</option>${xs.map((x) => `<option value="${x}">${name(x)}</option>`).join('')}`;
  el.addEventListener('change', () => { set(el.value === 'any' ? 'any' : (xs.find((x) => String(x) === el.value) as T)); build(); el.blur(); });
};
options('fCiv', ARCH_CIVS, (c) => c, (v) => { filters.civ = v; });
options('fEra', [0, 1, 2, 3] as const, (e) => (e === 3 ? 'Modern (preview)' : DRESS_ERA_NAME[e]!), (v) => { filters.era = v; });
options('fGround', GROUNDS, (g) => g, (v) => { filters.ground = v; });
options('fWonders', ['none', 'few', 'many'] as const, (w) => ({ none: 'none', few: '1–3', many: '4–10' })[w], (v) => { filters.wonders = v; });
options('fWalls', ['yes', 'no'] as const, (w) => w, (v) => { filters.walls = v; });
$('again').addEventListener('click', (e) => { sheet++; build(); (e.target as HTMLElement).blur(); });

// Keyboard: W A S D move, Q E rotate, T G tilt, Z X zoom (as the other dev pages).
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
  const turn = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
  if (turn) { const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * 1.2 * dt); camera.position.copy(controls.target).add(off); }
  const tilt = (keys.has('t') ? 1 : 0) - (keys.has('g') ? 1 : 0);
  if (tilt) {
    const sp = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    sp.phi = Math.min(controls.maxPolarAngle, Math.max(0.05, sp.phi + tilt * 0.9 * dt));
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp));
  }
  const zoom = (keys.has('x') ? 1 : 0) - (keys.has('z') ? 1 : 0);
  if (zoom) { const off = camera.position.clone().sub(controls.target).multiplyScalar(Math.exp(zoom * 1.5 * dt)); camera.position.copy(controls.target).add(off); }
}

const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize);
resize();
build();
frame();
renderer.setAnimationLoop(() => { keyboard(); controls.update(); renderer.render(scene, camera); });
