// Town drawings sheet (dev tool, /city_designs.html), laid out flat with
// the game's models at the game's scale (a tile step is 1 here):
//   Borders  every pair of border types (src/town/borders.ts) as a grid:
//            cell (row A, column B) is the strip drawn for A meeting B,
//            between two tiles that show only the streets reaching it; the
//            last two columns are the outskirts and the waterfront.
//   Middles  every middle on its own, with its outskirts round it.
//   Towns    sample towns on a patch of hexes, stamped exactly as the game
//            does (the same middles, turns and strips; cityStamp.ts).

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { DENSITIES, HALF_WIDTH, RC, corner, type Density, type LotKind, type Pt, type Sides } from './town/geometry.ts';
import { BORDER_TYPES, middleStubs, shapeOfType, stubClass, type BorderType, type Far } from './town/borders.ts';
import { MIDDLES, middlesFor, stripFor, type Middle } from './town/index.ts';
import { stamp, stripToFan, bestTurn, type FanPt, type StampTile, type Stamp } from './cityStamp.ts';
import { BUILDINGS_CATALOG, ROOFS, buildBuildingGeometry, type BuildingKind } from './buildingCatalog.ts';
import { makePropMaterial, instanceGeometry } from './propMaterial.ts';
import { mulberry32 } from './rng.ts';

// Models: render.ts draws them at 1.5 × PROP_SIZE (0.276) of a tile edge of
// 0.07, and towns at HOUSE_SCALE 1.5 over that.
const MODEL = (1.5 * 0.276) / 0.07;
const HOUSE = 1.5 * MODEL;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const labels = new CSS2DRenderer({ element: $<HTMLDivElement>('labels') });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.4));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.position.set(-30, 60, 20);
scene.add(sun);
const buildingMat = makePropMaterial(0.32);
const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
let world = new THREE.Group();
scene.add(world);

// ---------- flat tiles ----------

interface FlatTile { id: number; k: Sides; cx: number; cz: number }
const tiles = new Map<number, FlatTile>();
// Canonical y runs to -z, so the plane seen from above keeps the drawings' turn.
const canon = (f: FlatTile, p: Pt) => new THREE.Vector3(f.cx + p.x, 0, f.cz - p.y);
const flatCorner = (f: FlatTile, j: number) => canon(f, corner(f.k, j));
const toPlane = (p: FanPt) => {
  const f = tiles.get(p.t)!;
  const A = corner(f.k, p.i), B = corner(f.k, p.i + 1);
  return canon(f, { x: A.x * p.wa + B.x * p.wb, y: A.y * p.wa + B.y * p.wb });
};

// ---------- drawing ----------

const STREET_RGB = new THREE.Color(0x9a8a70), PLAZA_RGB = new THREE.Color(0xa9a194), WALL_RGB = new THREE.Color(0xa49c8c);
const GROUND = new THREE.Color(0x7d9a55), RIM = new THREE.Color(0x76924f), OUTSIDE = new THREE.Color(0x6f8a4b), WATER = new THREE.Color(0x5b88a8);
let pos: number[] = [], col: number[] = [];
const tri = (c: THREE.Color, ...ps: THREE.Vector3[]) => { for (const p of ps) { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); } };

function ground(f: FlatTile): void {
  const c = canon(f, { x: 0, y: 0 });
  for (let j = 0; j < f.k; j++) {
    const a = flatCorner(f, j), b = flatCorner(f, j + 1);
    const ai = c.clone().lerp(a, RC), bi = c.clone().lerp(b, RC);
    tri(GROUND, c, ai, bi); tri(RIM, ai, a, b); tri(RIM, ai, b, bi);
  }
}
function ribbon(pts: THREE.Vector3[], hw: number, y: number, color: THREE.Color): void {
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = pts[k]!, q = pts[k + 1]!, d = q.clone().sub(p);
    if (d.lengthSq() < 1e-12) continue;
    const n = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(hw);
    const a0 = p.clone().add(n).setY(y), a1 = p.clone().sub(n).setY(y), b0 = q.clone().add(n).setY(y), b1 = q.clone().sub(n).setY(y);
    tri(color, a0, b0, b1); tri(color, a0, b1, a1);
    for (let s = 0; s < 6; s++) {
      const t0 = (s / 6) * Math.PI * 2, t1 = ((s + 1) / 6) * Math.PI * 2;
      tri(color, q.clone().setY(y), q.clone().add(new THREE.Vector3(Math.cos(t0) * hw, y, Math.sin(t0) * hw)), q.clone().add(new THREE.Vector3(Math.cos(t1) * hw, y, Math.sin(t1) * hw)));
    }
  }
}

const instances = new Map<string, { kind: BuildingKind; roof: number; mats: THREE.Matrix4[]; cols: THREE.Color[] }>();
const ROOF_PICK = [...ROOFS.terracotta, ...ROOFS.slate];
function addModel(kind: BuildingKind, at: THREE.Vector3, face: THREE.Vector3 | null, size: number, roof: number, tallY = 1, shade = 1): void {
  const key = `${kind}|${roof}`;
  let e = instances.get(key);
  if (!e) { e = { kind, roof, mats: [], cols: [] }; instances.set(key, e); }
  const f = face ? face.clone().sub(at) : new THREE.Vector3(1, 0, 0);
  const yaw = Math.atan2(-f.z, f.x) + Math.PI / 2;
  e.mats.push(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(size, size * tallY, size)));
  e.cols.push(new THREE.Color(shade, shade, shade));
}
const radiusCache = new Map<BuildingKind, number>();
function modelRadius(kind: BuildingKind): number {
  let r = radiusCache.get(kind);
  if (r === undefined) {
    const g = buildBuildingGeometry(kind); g.computeBoundingBox();
    const b = g.boundingBox!;
    r = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
    radiusCache.set(kind, r);
  }
  return r;
}

// What fills a building spot on the sheet: sample buildings.
const SAMPLE: readonly BuildingKind[] = ['library', 'market', 'temple', 'workshop', 'amphitheater', 'granary', 'barracks', 'odeon'];
const HOME: Record<'house' | 'row' | 'block' | 'tower', (r: number) => BuildingKind> = {
  house: (r) => (r < 0.6 ? 'cottage' : r < 0.85 ? 'cornerHouse' : 'longhouse'),
  row: (r) => (r < 0.75 ? 'townhouse' : 'cornerHouse'),
  block: () => 'apartment',
  tower: (r) => (r < 0.45 ? 'officeTower' : 'skyscraper'),
};
const FURNITURE: Record<Exclude<LotKind, 'house' | 'row' | 'block' | 'tower'>, BuildingKind> = { tree: 'gardenTree', well: 'well', fountain: 'fountain', stall: 'stall', shed: 'shed' };

let showBuildings = true;
function drawStamp(st: Stamp, walls = false): void {
  for (const q of st.squares) {
    if (!q.paved) continue;
    const pts = q.pts.map(toPlane), m = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
    pts.forEach((p, k) => tri(PLAZA_RGB, m.clone().setY(0.0015), p.clone().setY(0.0015), pts[(k + 1) % pts.length]!.clone().setY(0.0015)));
  }
  for (const s of st.streets) ribbon(s.pts.map(toPlane), HALF_WIDTH[s.cls], 0.002, STREET_RGB);
  const used = new Set<string>();
  if (showBuildings) {
    st.spots.forEach((sp, n) => {
      used.add(`${sp.tile}:${sp.k}`);
      const kind = SAMPLE[(sp.tile * 3 + n) % SAMPLE.length]!;
      addModel(kind, toPlane(sp.at), toPlane(sp.face), HOUSE * Math.min(1, (1.15 * sp.r) / (modelRadius(kind) * HOUSE)), BUILDINGS_CATALOG[kind].leaf);
    });
  }
  for (const h of st.halls) addModel('hall', toPlane(h.at), toPlane(h.face), HOUSE * Math.min(1, (1.15 * h.r) / (modelRadius('hall') * HOUSE)), 0x5f5650);
  for (const w of st.wonders) addModel('colosseum', toPlane(w.at), toPlane(w.face), HOUSE, BUILDINGS_CATALOG.colosseum.leaf);
  for (const l of st.lots) {
    if (l.spot !== undefined && used.has(`${l.tile}:${l.spot}`)) continue;
    const rand = mulberry32(l.seed);
    const at = toPlane(l.at), face = toPlane(l.face);
    if (l.kind === 'tree' || l.kind === 'well' || l.kind === 'fountain' || l.kind === 'stall' || l.kind === 'shed') {
      const kind = FURNITURE[l.kind];
      addModel(kind, at, l.kind === 'tree' ? null : face, HOUSE * (l.kind === 'tree' ? 0.8 + 0.4 * rand() : 1), BUILDINGS_CATALOG[kind].leaf);
      continue;
    }
    const kind = HOME[l.kind](rand());
    const tall = l.kind === 'tower' || l.kind === 'block';
    const roof = tall ? BUILDINGS_CATALOG[kind].leaf : ROOF_PICK[Math.floor(rand() * ROOF_PICK.length)]!;
    addModel(kind, at, face, HOUSE * (kind === 'longhouse' ? 0.72 : 1) * (tall ? 1 : 0.92 + 0.12 * rand()), roof, tall ? 0.45 + 0.45 * rand() : 1, 0.9 + 0.15 * rand());
  }
  if (walls) {
    for (const w of st.walls) {
      const pts = w.pts.map(toPlane);
      ribbon(pts, 0.007, 0.012, WALL_RGB);
      pts.forEach((p, n) => { if (n === 0 || n === pts.length - 1 || w.pts[n]!.wb === 0) addModel('wallTower', p, null, HOUSE, BUILDINGS_CATALOG.wallTower.leaf); });
    }
  }
}
function label(text: string, x: number, z: number): void {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(x, 0.05, z);
  world.add(o);
}
const emptyStamp = (): Stamp => ({ lots: [], spots: [], halls: [], wonders: [], streets: [], squares: [], walls: [], missing: [] });

// ---------- views ----------

type View = 'borders' | 'middles' | 'towns';
let view: View = 'borders';
let townDensity: Density | 'mixed' = 'medium';
let townSeed = 1;
let walls = false;
let densityFilter: Density | 'all' = 'all';
const landAll = (k: number) => Array.from({ length: k }, () => ({ tile: -1, back: 0, kind: 'land' as const }));

// Borders: A on the left, B on the right (A's side 0 faces B's side 3);
// only the strip's two trapezoids and the stubs of the streets reaching it.
function bordersView(): { w: number; h: number } {
  const types = BORDER_TYPES.filter((t) => densityFilter === 'all' || t.startsWith(densityFilter));
  const cols: Far[] = [...types, 'land', 'water'];
  const W = 1.25, H = 0.85;
  let id = 0;
  types.forEach((a, r) => {
    label(a, -0.25, (r + 0.5) * H);
    cols.forEach((b, c) => {
      if (r === 0) label(b, (c + 0.5) * W, -0.1);
      const x = (c + 0.5) * W, z = (r + 0.5) * H;
      const A: FlatTile = { id: id++, k: 6, cx: x - 0.5, cz: z }, B: FlatTile = { id: id++, k: 6, cx: x + 0.5, cz: z };
      tiles.set(A.id, A); tiles.set(B.id, B);
      const open = b !== 'land' && b !== 'water';
      for (const [f, side] of [[A, 0], [B, 3]] as const) {
        const ct = canon(f, { x: 0, y: 0 }), c0 = flatCorner(f, side), c1 = flatCorner(f, side + 1);
        const color = f === A || open ? RIM : b === 'water' ? WATER : OUTSIDE;
        tri(color, ct.clone().lerp(c0, RC), c0, c1); tri(color, ct.clone().lerp(c0, RC), c1, ct.clone().lerp(c1, RC));
      }
      const stubs = (f: FlatTile, side: number, t: BorderType) => {
        const cls = stubClass(t);
        if (cls) for (const p of middleStubs(6, side, shapeOfType(t))) ribbon([canon(f, p), canon(f, { x: p.x * 0.75, y: p.y * 0.75 })], HALF_WIDTH[cls], 0.002, STREET_RGB);
      };
      stubs(A, 0, a);
      if (open) stubs(B, 3, b);
      const s = stripFor(a, b);
      if (!s) return;
      const bInfo = open ? { tile: B.id, back: 3 } : null;
      const place = (p: Pt, side: -1 | 1) => stripToFan(A.id, 0, bInfo, p, side);
      const sideOf = (p: Pt): -1 | 1 => (p.y <= 0 || !bInfo ? -1 : 1);
      const st = emptyStamp();
      s.lots.forEach((l, n) => st.lots.push({
        tile: A.id, at: place(l, sideOf(l)), face: place({ x: l.x + 0.01 * Math.cos(l.yaw), y: l.y + 0.01 * Math.sin(l.yaw) }, sideOf(l)), kind: l.kind, seed: n * 7 + c * 131 + r,
      }));
      for (const q of s.squares) st.squares.push({ tile: A.id, pts: q.pts.map((p) => place(p, sideOf(q.pts[0]!))), paved: q.paved });
      for (const street of s.streets) st.streets.push({ tile: A.id, pts: street.pts.map((p) => place(p, sideOf(p))), cls: street.cls });
      drawStamp(st);
    });
  });
  return { w: cols.length * W, h: types.length * H };
}

function middlesView(): { w: number; h: number } {
  const list = MIDDLES.filter((m) => densityFilter === 'all' || m.density === densityFilter);
  const per = 6, W = 1.5;
  list.forEach((m, n) => {
    const x = (n % per + 0.5) * W, z = (Math.floor(n / per) + 0.5) * W;
    const f: FlatTile = { id: n, k: m.sides, cx: x, cz: z };
    tiles.set(f.id, f);
    ground(f);
    drawStamp(stamp([{ tile: f.id, sides: m.sides, middle: m, rot: 0, walled: m.role === 'center' && walls, across: landAll(m.sides) }]), walls);
    label(`${m.name} · ${m.borders.join(', ')}`, x, z + 0.62);
  });
  return { w: per * W, h: Math.ceil(list.length / per) * W };
}

// A patch of hexes round a center, stamped as the game would: four in five
// built up, middles picked at random, each turned by the game's rule.
function townsView(): { w: number; h: number } {
  const rings = 2, axial: [number, number][] = [];
  for (let q = -rings; q <= rings; q++) for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) axial.push([q, r]);
  axial.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) + Math.abs(a[0] + a[1]) - (Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[0] + b[1])));
  const index = new Map(axial.map(([q, r], i) => [`${q},${r}`, i]));
  // Side j faces 60j°: steps in axial coordinates, and on the plane.
  const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const rand = mulberry32(townSeed * 7919);
  const C = rings + 1;
  axial.forEach(([q, r], i) => { const f: FlatTile = { id: i, k: 6, cx: C + q + r * 0.5, cz: C - r * Math.sqrt(3) / 2 }; tiles.set(i, f); ground(f); });
  const built = axial.map((_, i) => i === 0 || rand() < 0.8);
  const stamps: StampTile[] = [];
  axial.forEach(([q, r], i) => {
    if (!built[i]) return;
    const across = DIRS.map(([dq, dr], j) => {
      const n = index.get(`${q + dq},${r + dr}`);
      return n !== undefined && built[n] ? { tile: n, back: (j + 3) % 6, kind: 'town' as const } : { tile: -1, back: 0, kind: 'land' as const };
    });
    const d: Density = townDensity === 'mixed' ? (i === 0 ? 'medium' : DENSITIES[Math.min(2, Math.floor(rand() * 2.6))]!) : townDensity;
    const options: Middle[] = middlesFor(6, i === 0 ? 'center' : 'block', d);
    const middle = options[Math.floor(rand() * options.length)]!;
    stamps.push({ tile: i, sides: 6, middle, rot: bestTurn(middle, 6, across, Math.floor(rand() * 1e6)), walled: i === 0 && walls, across });
  });
  const st = stamp(stamps);
  drawStamp(st, walls);
  if (st.missing.length) console.warn('strips not drawn yet:', st.missing);
  return { w: 2 * C, h: 2 * C };
}

let framed = false;
function build(): void {
  scene.remove(world);
  world.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); if (o instanceof CSS2DObject) o.element.remove(); });
  world = new THREE.Group();
  scene.add(world);
  instances.clear();
  tiles.clear();
  pos = []; col = [];
  const size = view === 'borders' ? bordersView() : view === 'middles' ? middlesView() : townsView();
  const y = -0.002;
  tri(OUTSIDE, new THREE.Vector3(-1, y, -1), new THREE.Vector3(size.w + 1, y, -1), new THREE.Vector3(size.w + 1, y, size.h + 1));
  tri(OUTSIDE, new THREE.Vector3(-1, y, -1), new THREE.Vector3(size.w + 1, y, size.h + 1), new THREE.Vector3(-1, y, size.h + 1));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  world.add(new THREE.Mesh(geo, flatMat));
  let count = 0;
  for (const e of instances.values()) {
    const model = buildBuildingGeometry(e.kind, { leaf: e.roof });
    const mesh = new THREE.InstancedMesh(instanceGeometry(model, e.mats.length), buildingMat, e.mats.length);
    const leaf = mesh.geometry.getAttribute('leafTint') as THREE.InstancedBufferAttribute;
    const lc = new THREE.Color(e.roof);
    e.mats.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, e.cols[i]!); leaf.setXYZ(i, lc.r, lc.g, lc.b); });
    world.add(mesh);
    count += e.mats.length;
  }
  $('info').textContent = view === 'borders' ? `${BORDER_TYPES.length} border types · ${count.toLocaleString()} models`
    : view === 'middles' ? `${MIDDLES.length} middles · ${count.toLocaleString()} models` : `seed ${townSeed} · ${count.toLocaleString()} models`;
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
$<HTMLSelectElement>('density').addEventListener('change', (e) => { densityFilter = (e.target as HTMLSelectElement).value as Density | 'all'; framed = false; build(); });
$<HTMLSelectElement>('townDensity').addEventListener('change', (e) => { townDensity = (e.target as HTMLSelectElement).value as Density | 'mixed'; build(); });
$<HTMLInputElement>('buildings').addEventListener('change', (e) => { showBuildings = (e.target as HTMLInputElement).checked; build(); });
$<HTMLInputElement>('walls').addEventListener('change', (e) => { walls = (e.target as HTMLInputElement).checked; build(); });
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
  labels.setSize(innerWidth, innerHeight);
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
  document.body.classList.toggle('far', camera.position.distanceTo(controls.target) > 16);
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
if (import.meta.env.DEV) {
  Object.assign(window, { __sheet: {
    camera, controls, keyboard,
    show: (v: View, seed?: number) => { view = v; if (seed !== undefined) townSeed = seed; framed = false; build(); },
    look: (x: number, z: number, d = 1.5) => { controls.target.set(x, 0, z); camera.position.set(x, d, z + d * 0.6); },
  } });
}
