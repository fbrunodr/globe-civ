// Design sheet (dev tool, /city_designs.html): every hand-drawn town tile
// (cityDesigns.ts) and every connection between two of them, laid out flat
// as a grid. The first row and column show each drawing on its own (its
// edges as a town's outskirts); cell (row A, column B) shows A and B side
// by side with the strip that joins them in the middle. What is drawn here
// is exactly what the game stamps (cityStamp.ts), only on a plane, with the
// same models at the same scale (a tile step is 1 here).

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  BLOCKS, PENT_BLOCK, CENTER, WONDER_SQUARE, DENSITIES, HALF_WIDTH, RC, INR, corner,
  type Design, type Sides, type LotKind,
} from './cityDesigns.ts';
import { stamp, type FanPt, type StampTile, type Stamp } from './cityStamp.ts';
import { BUILDINGS_CATALOG, ROOFS, buildBuildingGeometry, type BuildingKind } from './buildingCatalog.ts';
import { makePropMaterial, instanceGeometry } from './propMaterial.ts';
import { mulberry32 } from './rng.ts';

// Models: render.ts draws them at 1.5 × PROP_SIZE (0.276) of a tile edge of
// 0.07, and towns at HOUSE_SCALE 1.5 over that.
const MODEL = (1.5 * 0.276) / 0.07;
const HOUSE = 1.5 * MODEL;
const CELL_W = 2.6, CELL_H = 1.5;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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

interface FlatTile { id: number; k: Sides; cx: number; cz: number; rot: number } // rot: the polygon's turn on the plane
const flatCorner = (f: FlatTile, j: number) => {
  const c = corner(f.k, j), cs = Math.cos(f.rot), sn = Math.sin(f.rot);
  // Canonical y runs to -z, so the plane seen from above keeps the drawing's turn.
  return { x: f.cx + c.x * cs - c.y * sn, z: f.cz - (c.x * sn + c.y * cs) };
};
const toPlane = (tiles: Map<number, FlatTile>, p: FanPt) => {
  const f = tiles.get(p.t)!;
  const A = flatCorner(f, p.i), B = flatCorner(f, p.i + 1);
  return new THREE.Vector3(f.cx + (A.x - f.cx) * p.wa + (B.x - f.cx) * p.wb, 0, f.cz + (A.z - f.cz) * p.wa + (B.z - f.cz) * p.wb);
};

// Two tiles side by side (A's side 0 facing B), or one on its own.
function pairTiles(a: Design, b: Design | null, x: number, z: number, id: number): { flat: FlatTile[]; stamps: StampTile[] } {
  const fa: FlatTile = { id, k: a.sides, cx: x - (b ? INR[a.sides] : 0), cz: z, rot: 0 };
  const flat = [fa];
  const landAll = (k: number) => Array.from({ length: k }, () => ({ tile: -1, back: 0, kind: 'land' as const }));
  const sa: StampTile = { tile: id, sides: a.sides, design: a, rot: 0, walled: false, across: landAll(a.sides) };
  const stamps = [sa];
  if (b) {
    // B's side 0 faces A: turned half a turn.
    const fb: FlatTile = { id: id + 1, k: b.sides, cx: x + INR[b.sides], cz: z, rot: Math.PI };
    flat.push(fb);
    sa.across[0] = { tile: id + 1, back: 0, kind: 'town' };
    const sb: StampTile = { tile: id + 1, sides: b.sides, design: b, rot: 0, walled: false, across: landAll(b.sides) };
    sb.across[0] = { tile: id, back: 0, kind: 'town' };
    stamps.push(sb);
  }
  return { flat, stamps };
}

// ---------- drawing ----------

const STREET_RGB = new THREE.Color(0x9a8a70), PLAZA_RGB = new THREE.Color(0xa9a194);
const GROUND = new THREE.Color(0x7d9a55), RIM = new THREE.Color(0x76924f), OUTSIDE = new THREE.Color(0x6f8a4b);

interface Batch { pos: number[]; col: number[] }
const tri = (b: Batch, c: THREE.Color, ...ps: THREE.Vector3[]) => { for (const p of ps) { b.pos.push(p.x, p.y, p.z); b.col.push(c.r, c.g, c.b); } };

function groundOf(f: FlatTile, b: Batch): void {
  const c = new THREE.Vector3(f.cx, 0, f.cz);
  for (let j = 0; j < f.k; j++) {
    const A = flatCorner(f, j), B = flatCorner(f, j + 1);
    const a = new THREE.Vector3(A.x, 0, A.z), bb = new THREE.Vector3(B.x, 0, B.z);
    const ai = c.clone().lerp(a, RC), bi = c.clone().lerp(bb, RC);
    tri(b, GROUND, c, ai, bi);
    tri(b, RIM, ai, a, bb); tri(b, RIM, ai, bb, bi);
  }
}

function ribbon(pts: THREE.Vector3[], hw: number, y: number, color: THREE.Color, b: Batch): void {
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = pts[k]!, q = pts[k + 1]!;
    const d = q.clone().sub(p);
    if (d.lengthSq() < 1e-12) continue;
    const n = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(hw);
    const a0 = p.clone().add(n).setY(y), a1 = p.clone().sub(n).setY(y), b0 = q.clone().add(n).setY(y), b1 = q.clone().sub(n).setY(y);
    tri(b, color, a0, b0, b1); tri(b, color, a0, b1, a1);
    // Round joints.
    for (let s = 0; s < 6; s++) {
      const t0 = (s / 6) * Math.PI * 2, t1 = ((s + 1) / 6) * Math.PI * 2;
      tri(b, color, q.clone().setY(y), q.clone().add(new THREE.Vector3(Math.cos(t0) * hw, y, Math.sin(t0) * hw)), q.clone().add(new THREE.Vector3(Math.cos(t1) * hw, y, Math.sin(t1) * hw)));
    }
  }
}

// Instances by (model, roof).
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

// What fills a building spot on the sheet: a sample building per density.
const SAMPLE: readonly BuildingKind[] = ['library', 'market', 'temple', 'workshop', 'amphitheater', 'granary', 'barracks', 'odeon'];
const HOME: Record<Exclude<LotKind, 'tree' | 'well' | 'fountain' | 'stall'>, (r: number) => BuildingKind> = {
  house: (r) => (r < 0.6 ? 'cottage' : r < 0.85 ? 'cornerHouse' : 'longhouse'),
  row: (r) => (r < 0.75 ? 'townhouse' : 'cornerHouse'),
  block: () => 'apartment',
  tower: (r) => (r < 0.45 ? 'officeTower' : 'skyscraper'),
};
const DECOR = { tree: 'gardenTree', well: 'well', fountain: 'fountain', stall: 'stall' } as const;

function drawStamp(st: Stamp, tiles: Map<number, FlatTile>, flat: Batch, showBuildings: boolean, wonderKind: BuildingKind): void {
  const P = (p: FanPt) => toPlane(tiles, p);
  for (const q of st.squares) {
    if (!q.paved) continue;
    const pts = q.pts.map(P), m = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
    pts.forEach((p, k) => tri(flat, PLAZA_RGB, m.clone().setY(0.0015), p.clone().setY(0.0015), pts[(k + 1) % pts.length]!.clone().setY(0.0015)));
  }
  for (const s of st.streets) ribbon(s.pts.map(P), HALF_WIDTH[s.cls], 0.002, STREET_RGB, flat);
  const used = new Set<string>();
  if (showBuildings) {
    st.spots.forEach((sp, n) => {
      used.add(`${sp.tile}:${sp.k}`);
      const kind = SAMPLE[(sp.tile * 3 + n) % SAMPLE.length]!;
      const fit = Math.min(1, (1.15 * sp.r) / (modelRadius(kind) * HOUSE));
      addModel(kind, P(sp.at), P(sp.face), HOUSE * fit, BUILDINGS_CATALOG[kind].leaf);
    });
  }
  for (const h of st.halls) addModel('hall', P(h.at), P(h.face), HOUSE * Math.min(1, (1.15 * h.r) / (modelRadius('hall') * HOUSE)), 0x5f5650);
  for (const m of st.middles) addModel(wonderKind, P(m.at), P(m.face), HOUSE, BUILDINGS_CATALOG[wonderKind].leaf);
  for (const l of st.lots) {
    if (l.spot !== undefined && used.has(`${l.tile}:${l.spot}`)) continue;
    const rand = mulberry32(l.seed);
    const at = P(l.at), face = P(l.face);
    if (l.kind === 'tree' || l.kind === 'well' || l.kind === 'fountain' || l.kind === 'stall') {
      const kind = DECOR[l.kind];
      addModel(kind, at, l.kind === 'tree' ? null : face, HOUSE * (l.kind === 'tree' ? 0.8 + 0.4 * rand() : 1), BUILDINGS_CATALOG[kind].leaf);
      continue;
    }
    const kind = HOME[l.kind](rand());
    const tall = l.kind === 'tower' || l.kind === 'block';
    const roof = tall ? BUILDINGS_CATALOG[kind].leaf : ROOF_PICK[Math.floor(rand() * ROOF_PICK.length)]!;
    addModel(kind, at, face, HOUSE * (kind === 'longhouse' ? 0.72 : 1) * (tall ? 1 : 0.92 + 0.12 * rand()), roof, tall ? 0.45 + 0.45 * rand() : 1, 0.9 + 0.15 * rand());
  }
}

// ---------- the sheet ----------

type Group = 'blocks' | 'pent' | 'center' | 'wonder';
const GROUPS: { key: Group; name: string; of: () => Design[] }[] = [
  { key: 'blocks', name: 'Hex blocks', of: () => DENSITIES.flatMap((d) => [...BLOCKS[d]]) },
  { key: 'pent', name: 'Pentagons', of: () => DENSITIES.map((d) => PENT_BLOCK[d]) },
  { key: 'center', name: 'Centers', of: () => DENSITIES.flatMap((d) => [CENTER[6][d], CENTER[5][d]]) },
  { key: 'wonder', name: 'Wonder squares', of: () => DENSITIES.flatMap((d) => [WONDER_SQUARE[6][d], WONDER_SQUARE[5][d]]) },
];
const shown = new Set<Group>(['blocks', 'pent']);
let densityFilter: string = 'all';
let showBuildings = true;

function designs(): Design[] {
  return GROUPS.filter((g) => shown.has(g.key)).flatMap((g) => g.of()).filter((d) => densityFilter === 'all' || d.density === densityFilter);
}

function build(): void {
  scene.remove(world);
  world.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); if (o instanceof CSS2DObject) o.element.remove(); });
  world = new THREE.Group();
  scene.add(world);
  instances.clear();
  const list = designs();
  const flat: Batch = { pos: [], col: [] };
  const tiles = new Map<number, FlatTile>();
  let id = 0;
  const cell = (r: number, c: number, a: Design, b: Design | null) => {
    const x = (c + 0.5) * CELL_W, z = (r + 0.5) * CELL_H;
    const { flat: fl, stamps } = pairTiles(a, b, x, z, id);
    id += 2;
    for (const f of fl) { tiles.set(f.id, f); groundOf(f, flat); }
    drawStamp(stamp(stamps), tiles, flat, showBuildings, 'colosseum');
  };
  list.forEach((d, i) => {
    cell(i + 1, 0, d, null);
    cell(0, i + 1, d, null);
    label(d.name, (i + 1.5) * CELL_W, 0.08 * CELL_H, 'col');
    label(d.name, 0.5 * CELL_W, (i + 1.5) * CELL_H + 0.62, 'row');
  });
  list.forEach((a, i) => list.forEach((b, j) => cell(i + 1, j + 1, a, b)));
  // A ground plane under it all.
  const W = (list.length + 1) * CELL_W, H = (list.length + 1) * CELL_H;
  tri(flat, OUTSIDE, new THREE.Vector3(0, -0.002, 0), new THREE.Vector3(W, -0.002, 0), new THREE.Vector3(W, -0.002, H));
  tri(flat, OUTSIDE, new THREE.Vector3(0, -0.002, 0), new THREE.Vector3(W, -0.002, H), new THREE.Vector3(0, -0.002, H));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(flat.pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(flat.col, 3));
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
  $('info').textContent = `${list.length} drawings · ${list.length * list.length} connections · ${count.toLocaleString()} models`;
  if (!framed) fit(list.length);
}

function label(text: string, x: number, z: number, cls: string): void {
  const el = document.createElement('div');
  el.className = `lbl ${cls}`;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(x, 0.05, z);
  world.add(o);
}

let framed = false;
function fit(n: number): void {
  framed = true;
  const W = (n + 1) * CELL_W, H = (n + 1) * CELL_H;
  controls.target.set(W / 2, 0, H / 2);
  camera.position.set(W / 2, Math.max(W, H) * 0.95, H / 2 + Math.max(W, H) * 0.35);
}
// Zoom on one cell (row, column).
function closeUp(r: number, c: number): void {
  const x = (c + 0.5) * CELL_W, z = (r + 0.5) * CELL_H;
  controls.target.set(x, 0, z);
  camera.position.set(x - 0.4, 1.1, z + 1.3);
}

// ---------- controls ----------

$('groups').innerHTML = GROUPS.map((g) => `<label><input type="checkbox" data-group="${g.key}"${shown.has(g.key) ? ' checked' : ''}> ${g.name}</label>`).join('');
$('groups').addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  const k = el.dataset['group'] as Group;
  if (el.checked) shown.add(k); else shown.delete(k);
  framed = false; build();
});
$<HTMLSelectElement>('density').addEventListener('change', (e) => { densityFilter = (e.target as HTMLSelectElement).value; framed = false; build(); });
$<HTMLInputElement>('buildings').addEventListener('change', (e) => { showBuildings = (e.target as HTMLInputElement).checked; build(); });
$('fit').addEventListener('click', () => fit(designs().length));
const raycaster = new THREE.Raycaster();
canvas.addEventListener('dblclick', (e) => {
  raycaster.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
  closeUp(Math.floor(p.z / CELL_H), Math.floor(p.x / CELL_W));
});

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
build();
renderer.setAnimationLoop(() => {
  keyboard();
  controls.update();
  // Labels only when close enough to read them.
  const far = camera.position.distanceTo(controls.target);
  document.body.classList.toggle('far', far > 40);
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
if (import.meta.env.DEV) Object.assign(window, { __sheet: { closeUp, fit, camera, controls, keyboard } });
