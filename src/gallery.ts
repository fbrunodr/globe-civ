import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CATALOG, CATALOG_KINDS, buildCatalogGeometry, triangles, type CatalogKind } from './propCatalog.ts';
import { BUILDINGS_CATALOG, BUILDING_KINDS, buildBuildingGeometry } from './buildingCatalog.ts';
import { BIOME_FLORA, FEATURE_FLORA, realmsLabel, type Tint, type Variant } from './floraData.ts';
import { BIOME_LOOK, FEATURE_LOOK } from './look.ts';
import type { BiomeKey, FeatureKey } from './terrain.ts';
import { biomeDef, featureDef } from './terrain.ts';
import { makePerlin, mulberry32, type Rng } from './rng.ts';

// Prop gallery (dev tool, /gallery.html): every prop, and every variant of
// each terrain (floraData.ts) as one tile-sized hex patch: the plain mix,
// without the game's placement modifiers (hills, rivers, coasts...). Sizes
// match the game: a tile edge of 0.07 at the reference scale, props at
// render.ts's scale, the walk-mode eye height for the ground camera.
// Everything is ×100 here.

const SC = 100;
const R = 0.07 * SC;          // hex circumradius = tile edge
const PROP = 0.414 * SC;     // render.ts: 1.5 × PROP_SIZE
const EYE = 0.0011 * SC;      // walk.ts eye height
const SPACING = 2.25 * R;
const BUDGET = 40;

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const labels = new CSS2DRenderer({ element: document.querySelector<HTMLDivElement>('#labels')! });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
scene.fog = new THREE.Fog(0x9fc3e6, 150, 420);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.01;

scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.3));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);

const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide });
const world = new THREE.Group();
scene.add(world);

// ---------- geometry ----------
const geoCache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};
const catalogGeo = (kind: CatalogKind, leaf?: number) =>
  cached(`${kind}|${leaf ?? ''}`, () => buildCatalogGeometry(kind, leaf === undefined ? undefined : { leaf }));

// The terrains shown: every biome and feature with props.
interface TerrainSet { name: string; ground: number; water?: number; variants: readonly Variant[] }
const WATER_DEPTH: Partial<Record<BiomeKey | FeatureKey, number>> = { reef: 0.0013, kelp: 0.0021, lake: 0.0006, ocean: 0.004 };
const sets: [string, TerrainSet][] = [
  ...(Object.keys(BIOME_FLORA) as BiomeKey[]).map((k): [string, TerrainSet] => [k, { name: biomeDef(k).name, ground: BIOME_LOOK[k].color, variants: BIOME_FLORA[k].variants }]),
  ...(Object.keys(FEATURE_FLORA) as FeatureKey[]).map((k): [string, TerrainSet] => [k, { name: featureDef(k).name, ground: FEATURE_LOOK[k].color ?? 0x8a8a70, variants: FEATURE_FLORA[k].variants }]),
].filter(([, t]) => t.variants.some((v) => v.mix.length > 0))
  .map(([k, t]): [string, TerrainSet] => [k, WATER_DEPTH[k as BiomeKey] !== undefined ? { ...t, water: WATER_DEPTH[k as BiomeKey]! } : t]);
const TERRAINS = new Map(sets);
type TerrainSetKey = string;

// ---------- placement ----------
const SQ3 = Math.sqrt(3) / 2;
const inHex = (x: number, z: number, r: number) => Math.abs(z) <= r * SQ3 && SQ3 * Math.abs(x) + Math.abs(z) / 2 <= r * SQ3;

// Even spacing (best-candidate sampling), as the game's jittered lattice.
function spots(n: number, rand: Rng, r: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] = [0, 0], bestD = -1;
    for (let c = 0; c < 12; c++) {
      let x = 0, z = 0;
      do { x = (rand() * 2 - 1) * r; z = (rand() * 2 - 1) * r; } while (!inHex(x, z, r));
      let d = Infinity;
      for (const p of pts) d = Math.min(d, (p[0] - x) ** 2 + (p[1] - z) ** 2);
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    pts.push(best);
  }
  return pts;
}

interface Placed { key: string; geo: THREE.BufferGeometry; m: THREE.Matrix4; c: THREE.Color }
interface Options { jitter: boolean; groves: boolean; seed: number }

const pickTint = (t: Tint | undefined, rand: Rng): number | undefined =>
  t === undefined ? undefined : typeof t === 'number' ? t : t[Math.floor(rand() * t.length)] ?? undefined;

function instance(x: number, z: number, rand: Rng, jitter: boolean): { m: THREE.Matrix4; c: THREE.Color } {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
  const size = 0.8 + 0.45 * rand(), tall = 0.9 + 0.3 * rand();
  const shade = 0.82 + 0.36 * rand();
  const c = new THREE.Color(shade, shade, shade);
  if (jitter) {
    const a = rand() * Math.PI * 2, lean = rand() * (6 * Math.PI / 180);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), lean));
    c.setRGB(shade * (1 + (rand() - 0.5) * 0.12), shade * (1 + (rand() - 0.5) * 0.12), shade * (1 + (rand() - 0.5) * 0.12));
  }
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(size, size * tall, size).multiplyScalar(PROP));
  return { m, c };
}

function placeVariant(v: Variant, o: Options): Placed[] {
  const rand = mulberry32(o.seed);
  const noise = makePerlin(mulberry32(o.seed ^ 0x9e37));
  const out: Placed[] = [];
  for (const [x, z] of spots(v.density, rand, R * 0.95)) {
    // Groves: low-frequency noise per species biases which one wins here.
    const w = v.mix.map(([, share], j) => share * (o.groves ? Math.exp(3 * noise.fbm(x / R * 1.3 + j * 31.7, j * 7.1, z / R * 1.3 + j * 17.3, 2)) : 1));
    let r = rand() * w.reduce((a, b) => a + b, 0), j = 0;
    while (j < w.length - 1 && (r -= w[j]) > 0) j++;
    const [kind, , tint, size = 1] = v.mix[j];
    const leaf = pickTint(tint, rand);
    const inst = instance(x, z, rand, o.jitter);
    inst.m.scale(new THREE.Vector3(size, size, size));
    out.push({ key: `${kind}|${leaf ?? ''}`, geo: catalogGeo(kind, leaf), ...inst });
  }
  return out;
}

function addInstances(items: Placed[], at: THREE.Vector3, parent: THREE.Object3D): number {
  const groups = new Map<string, Placed[]>();
  for (const p of items) { const l = groups.get(p.key) ?? []; l.push(p); groups.set(p.key, l); }
  let tris = 0;
  const off = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z);
  for (const list of groups.values()) {
    const mesh = new THREE.InstancedMesh(list[0].geo, propMat, list.length);
    list.forEach((p, i) => { mesh.setMatrixAt(i, off.clone().multiply(p.m)); mesh.setColorAt(i, p.c); });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    tris += triangles(list[0].geo) * list.length;
  }
  return tris;
}

// ---------- scene pieces ----------
function hex(color: number, at: THREE.Vector3, r = R): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 6).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.position.copy(at);
  m.receiveShadow = true;
  return m;
}
function waterSheet(at: THREE.Vector3, depth: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(R, 6).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1f6f8a, roughness: 0.15, transparent: true, opacity: 0.45, depthWrite: false }));
  m.position.copy(at).setY(at.y + depth * SC);
  m.renderOrder = 1;
  return m;
}
function label(html: string, at: THREE.Vector3, onClick?: () => void): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'lbl';
  div.innerHTML = html;
  if (onClick) div.addEventListener('click', onClick);
  const o = new CSS2DObject(div);
  o.position.copy(at);
  world.add(o);
  return div;
}

function clearWorld(): void {
  world.traverse((o) => { if (o instanceof CSS2DObject) o.element.remove(); });
  world.clear();
}

// ---------- state and views ----------
type View = 'terrains' | 'catalog';
type Cam = 'map' | 'close' | 'ground';
const terrainKeys = [...TERRAINS.keys()];
const hashParts = location.hash.slice(1).split('/');
const state = {
  view: (hashParts[0] === 'catalog' ? 'catalog' : 'terrains') as View,
  terrain: (terrainKeys.includes(hashParts[1] as TerrainSetKey) ? hashParts[1] : 'temperateRainforest') as TerrainSetKey,
  focus: 0,
  seed: 1,
};
let patches: { center: THREE.Vector3; label: HTMLDivElement; mix: string }[] = [];

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const select = $<HTMLSelectElement>('#terrain');
for (const k of terrainKeys) select.add(new Option(TERRAINS.get(k)!.name, k));
const jitterBox = $<HTMLInputElement>('#jitter'), grovesBox = $<HTMLInputElement>('#groves');
const info = $<HTMLSpanElement>('#info'), mixPanel = $<HTMLDivElement>('#mix');

const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
function mixHtml(name: string, v: Variant): string {
  const rows = v.mix.map(([k, share, tint]) => {
    const sw = tint === undefined ? '' : (typeof tint === 'number' ? [tint] : tint).map((c) => `<span class="sw" style="background:${hexColor(c)}"></span>`).join('');
    return `<b>${CATALOG[k].name}</b> ${share}%${sw ? ' ' + sw : ''}`;
  });
  return `<h4>${name}</h4><div class="row">${rows.join(' · ')}</div>`;
}

function buildTerrains(): void {
  const set = TERRAINS.get(state.terrain)!;
  const o: Options = { jitter: jitterBox.checked, groves: grovesBox.checked, seed: state.seed };
  const entries: { title: string; sub: string; items: Placed[]; mix: string }[] = set.variants.filter((v) => v.mix.length > 0).map((v, i) => ({
    title: v.name, sub: `${realmsLabel(v)}${v.hills ? ', on hills' : ''} · ${v.density} props`,
    items: placeVariant(v, { ...o, seed: o.seed * 977 + i }), mix: mixHtml(v.name, v),
  }));
  state.focus = Math.min(state.focus, entries.length - 1);
  patches = entries.map((e, i) => {
    const center = new THREE.Vector3(i * SPACING, 0, 0);
    world.add(hex(set.ground, center));
    world.add(hex(0x4a4436, center.clone().setY(-0.06), R * 1.06));
    if (set.water !== undefined) world.add(waterSheet(center, set.water));
    const tris = addInstances(e.items, center, world);
    const div = label(`<b>${e.title}</b><small>${e.sub} · ${Math.round(tris).toLocaleString()} tris</small>`,
      center.clone().add(new THREE.Vector3(0, 0, R * 0.95)), () => { state.focus = i; refreshFocus(); setCam('close'); });
    return { center, label: div, mix: e.mix };
  });
  refreshFocus();
  info.textContent = `${set.name}: tile edge ${R / SC}, props at game scale. Click a label to focus · ← → terrain · WASD move · Q/E rotate · Z/X zoom`;
}

function buildCatalog(): void {
  const cols = 8, gap = 10, rowGap = 13;
  const LAYER_SCALE = { Canopy: 4, Understory: 6, Ground: 10, Accent: 6 } as const;
  patches = [];
  CATALOG_KINDS.forEach((kind, i) => {
    const center = new THREE.Vector3((i % cols) * gap, 0, Math.floor(i / cols) * rowGap);
    const e = CATALOG[kind];
    const scale = LAYER_SCALE[e.layer];
    world.add(hex(0xb9b39a, center, 3.2));
    const geo = catalogGeo(kind);
    const mesh = new THREE.Mesh(geo, propMat);
    mesh.position.copy(center);
    mesh.scale.setScalar(PROP * scale);
    mesh.rotation.y = 0.6;
    mesh.castShadow = true;
    world.add(mesh);
    const tris = triangles(geo);
    const div = label(`<b>${e.name}</b><small>${e.layer} ×${scale} · <span class="${tris > BUDGET ? 'over' : ''}">${tris} tris</span></small>`,
      center.clone().add(new THREE.Vector3(0, 0, 4.4)), () => { state.focus = i; refreshFocus(); setCam('close'); });
    patches.push({ center, label: div, mix: '' });
  });
  // City buildings (buildingCatalog.ts) after the flora.
  BUILDING_KINDS.forEach((kind, j) => {
    const i = CATALOG_KINDS.length + j;
    const center = new THREE.Vector3((i % cols) * gap, 0, Math.floor(i / cols) * rowGap);
    const e = BUILDINGS_CATALOG[kind];
    const scale = 6;
    world.add(hex(0xb9b39a, center, 3.2));
    const geo = cached(`b|${kind}`, () => buildBuildingGeometry(kind));
    const mesh = new THREE.Mesh(geo, propMat);
    mesh.position.copy(center);
    mesh.scale.setScalar(PROP * scale);
    mesh.rotation.y = 0.6;
    mesh.castShadow = true;
    world.add(mesh);
    const tris = triangles(geo);
    const div = label(`<b>${e.name}</b><small>Building ×${scale} · ${tris} tris</small>`,
      center.clone().add(new THREE.Vector3(0, 0, 4.4)), () => { state.focus = i; refreshFocus(); setCam('close'); });
    patches.push({ center, label: div, mix: '' });
  });
  info.textContent = `${CATALOG_KINDS.length} props and ${BUILDING_KINDS.length} buildings, enlarged (×N in each label) to be visible. Budget ${BUDGET} triangles · WASD move · Q/E rotate · Z/X zoom`;
}

function refreshFocus(): void {
  patches.forEach((p, i) => p.label.classList.toggle('focus', i === state.focus));
  mixPanel.innerHTML = patches[state.focus]?.mix ?? '';
}

function rebuild(resetCam: boolean): void {
  clearWorld();
  if (state.view === 'terrains') buildTerrains(); else buildCatalog();
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.classList.toggle('active', b.dataset['view'] === state.view);
  select.value = state.terrain;
  select.disabled = state.view !== 'terrains';
  history.replaceState(null, '', `#${state.view}${state.view === 'terrains' ? '/' + state.terrain : ''}`);
  // Sun and shadows over everything shown.
  const box = new THREE.Box3();
  for (const p of patches) box.expandByPoint(p.center);
  const mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const ext = Math.max(size.x, size.z) / 2 + 10;
  sun.position.copy(mid).add(new THREE.Vector3(ext * 0.6, ext * 1.4, ext * 0.9));
  sun.target.position.copy(mid);
  Object.assign(sun.shadow.camera, { left: -ext * 1.3, right: ext * 1.3, top: ext * 1.3, bottom: -ext * 1.3, near: 1, far: ext * 5 });
  sun.shadow.camera.updateProjectionMatrix();
  if (resetCam) setCam('map');
}

const rowGapOf = () => 13;
function setCam(c: Cam): void {
  const box = new THREE.Box3();
  for (const p of patches) box.expandByPoint(p.center);
  const mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const f = patches[state.focus]?.center ?? mid;
  if (c === 'map') {
    if (state.view === 'catalog') {
      // Start on the top rows, seen at a low angle; pan (right-drag) to see the rest.
      const top = new THREE.Vector3(mid.x, 0, box.min.z + rowGapOf() * 1.2);
      camera.position.copy(top).add(new THREE.Vector3(0, 22, 42));
      controls.target.copy(top);
    } else {
      const d = size.x * 0.8 + 16;
      camera.position.copy(mid).add(new THREE.Vector3(0, d * 0.6, d * 0.75));
      controls.target.copy(mid);
    }
  } else if (c === 'close') {
    const d = state.view === 'catalog' ? 7 : R * 1.6;
    camera.position.copy(f).add(new THREE.Vector3(0, d * 0.55, d));
    controls.target.copy(f).setY(state.view === 'catalog' ? 1.5 : 0.3);
  } else {
    camera.position.copy(f).add(new THREE.Vector3(0, state.view === 'catalog' ? 0.6 : EYE, state.view === 'catalog' ? 5 : R * 0.8));
    controls.target.copy(f).setY(state.view === 'catalog' ? 1.2 : EYE * 1.6);
  }
  controls.update();
}

// ---------- UI ----------
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]'))
  b.addEventListener('click', () => { state.view = b.dataset['view'] as View; state.focus = 0; rebuild(true); });
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-cam]'))
  b.addEventListener('click', () => setCam(b.dataset['cam'] as Cam));
select.addEventListener('change', () => { state.terrain = select.value as TerrainSetKey; rebuild(true); });
jitterBox.addEventListener('change', () => rebuild(false));
grovesBox.addEventListener('change', () => rebuild(false));
$('#reroll').addEventListener('click', () => { state.seed++; rebuild(false); });
addEventListener('keydown', (e) => {
  if (state.view !== 'terrains' || e.target instanceof HTMLSelectElement) return;
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  const i = (terrainKeys.indexOf(state.terrain) + step + terrainKeys.length) % terrainKeys.length;
  state.terrain = terrainKeys[i];
  rebuild(true);
});

// Keyboard camera, as in the game: W A S D move over the ground (Shift =
// faster), Q / E rotate around the view's center, Z / X zoom in / out.
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'z', 'x', 'shift']);
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (MOVE_KEYS.has(k)) { keys.add(k); e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function keyboardCamera(dt: number): void {
  if (keys.size === 0) return;
  const key = (k: string) => (keys.has(k) ? 1 : 0);
  const offset = camera.position.clone().sub(controls.target);
  const rot = key('q') - key('e');
  if (rot !== 0) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * 1.6 * dt);
  const zoom = key('x') - key('z');
  if (zoom !== 0) offset.multiplyScalar(Math.exp(zoom * 1.6 * dt));
  // Movement scales with the distance, so it feels the same at every zoom.
  const fwd = key('w') - key('s'), side = key('d') - key('a');
  if (fwd !== 0 || side !== 0) {
    const forward = offset.clone().setY(0).negate();
    if (forward.lengthSq() < 1e-9) forward.set(0, 0, -1);
    forward.normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0));
    const step = offset.length() * 0.9 * dt * (keys.has('shift') ? 2.5 : 1) / Math.hypot(fwd, side);
    controls.target.addScaledVector(forward, fwd * step).addScaledVector(right, side * step);
  }
  camera.position.copy(controls.target).add(offset);
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  labels.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
rebuild(true);
const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  keyboardCamera(Math.min(0.1, timer.getDelta()));
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
