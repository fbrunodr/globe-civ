import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WorldLabel, clickableLabels, disposeLabels, type LabelLine } from './worldLabel.ts';
import { makePropMaterial, instanceGeometry } from './propMaterial.ts';
import { ruralGeometry, ruralModelKind } from './rural/models.ts';
import { resourceLayout, RESOURCE_LOOKS } from './rural/resourceModels.ts';
import { RESOURCES, RESOURCE_KEYS, type ResourceKey } from './resources.ts';
import { TECHS, TECH_KEYS } from './techs.ts';
import { CATALOG, CATALOG_KINDS, buildCatalogGeometry, triangles, type CatalogKind } from './propCatalog.ts';
import { BUILDINGS_CATALOG, BUILDING_KINDS, buildBuildingGeometry } from './buildingCatalog.ts';
import { BIOME_FLORA, FEATURE_FLORA, realmsLabel, type Tint, type Variant } from './floraData.ts';
import { BIOME_LOOK, FEATURE_LOOK } from './look.ts';
import type { BiomeKey, FeatureKey } from './terrain.ts';
import { biomeDef, featureDef } from './terrain.ts';
import { makePerlin, mulberry32, type Rng } from './rng.ts';

// Prop gallery (dev tool, /gallery.html). Two views:
//   terrains  one board of every terrain at once: a row per biome and
//             feature (floraData.ts), each of its variants a tile-sized hex
//             patch (the plain mix, without the game's placement modifiers:
//             hills, rivers, coasts...); then every resource (resources.ts)
//             on its own land, as the game shows it (rural/resourceModels.ts)
//   catalog   every prop and building on its own, enlarged
// Sizes match the game: a tile edge of 0.07 at the reference scale, props
// at render.ts's scale, the walk-mode eye height for the ground camera.
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
scene.fog = new THREE.Fog(0x9fc3e6, 260, 900);
// (Near plane no closer than the walk eye needs: depth precision for the far rows.)
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1000);
const controls = new OrbitControls(camera, canvas);
clickableLabels(canvas, camera, () => world);
controls.enableDamping = true;
// The mouse as in the world view: drag moves over the ground, right-drag (or
// Shift+drag) rotates and tilts, the wheel zooms.
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = false;
controls.minDistance = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.01;

scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.3));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);

// The game's flora material (clump normals, leaf cards), at full saturation.
const propMat = makePropMaterial(0, 1, undefined, { time: { value: 0 } });
// The game's material for the countryside's models (and the resources').
const ruralMat = makePropMaterial(0.32, 0.8);
// A tile step (center to center) in scene units: resource models are sized in them.
const STEP = R * Math.sqrt(3);
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

// (leaf: the instance's leaf colour, per instance as in the game: render.ts.)
interface Placed { key: string; geo: THREE.BufferGeometry; m: THREE.Matrix4; c: THREE.Color; leaf: THREE.Color; mat?: THREE.Material }
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
    out.push({ key: kind, geo: catalogGeo(kind), leaf: new THREE.Color(leaf ?? CATALOG[kind].leaf), ...inst });
  }
  return out;
}

function addInstances(items: Placed[], at: THREE.Vector3, parent: THREE.Object3D): number {
  const groups = new Map<string, Placed[]>();
  for (const p of items) { const l = groups.get(p.key) ?? []; l.push(p); groups.set(p.key, l); }
  let tris = 0;
  const off = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z);
  for (const list of groups.values()) {
    const mesh = new THREE.InstancedMesh(instanceGeometry(list[0].geo, list.length), list[0].mat ?? propMat, list.length);
    const leaf = mesh.geometry.getAttribute('leafTint') as THREE.InstancedBufferAttribute;
    list.forEach((p, i) => { mesh.setMatrixAt(i, off.clone().multiply(p.m)); mesh.setColorAt(i, p.c); leaf.setXYZ(i, p.leaf.r, p.leaf.g, p.leaf.b); });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    tris += triangles(list[0].geo) * list.length;
  }
  return tris;
}

// ---------- scene pieces ----------
// The rim of a patch: a band round its hex (no surface under the hex's own:
// two faces a hair apart flicker from afar) and its sides down to RIM_DEPTH.
const RIM_DEPTH = 0.5;
function rim(at: THREE.Vector3, r = R): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4436, roughness: 1 });
  const band = new THREE.RingGeometry(r, r * 1.06, 6, 1).rotateX(-Math.PI / 2);
  const sides = new THREE.CylinderGeometry(r * 1.06, r * 1.06, RIM_DEPTH, 6, 1, true).rotateY(Math.PI / 2).translate(0, -RIM_DEPTH / 2, 0);
  const m = new THREE.Mesh(mergeGeometries([band.toNonIndexed(), sides.toNonIndexed()])!, mat);
  m.position.copy(at);
  m.receiveShadow = true;
  return m;
}
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
// A label standing on the ground (a sign in the scene; click it to focus).
const LABEL = 1;
function label(title: string, sub: string, at: THREE.Vector3, onClick: () => void, subColor?: string): WorldLabel {
  const lines: LabelLine[] = [{ text: title, bold: true }, { text: sub, small: true, ...(subColor ? { color: subColor } : {}) }];
  const o = new WorldLabel(lines, LABEL);
  o.onClick = onClick;
  o.position.copy(at).setY(at.y + o.scale.y / 2 + 0.1);
  world.add(o);
  return o;
}

function clearWorld(): void {
  disposeLabels(world);
  world.clear();
}

// ---------- state and views ----------
type View = 'terrains' | 'catalog';
type Cam = 'map' | 'close' | 'ground';
const terrainKeys = [...TERRAINS.keys()];
const hashParts = location.hash.slice(1).split('/');
const state = {
  view: (hashParts[0] === 'catalog' ? 'catalog' : 'terrains') as View,
  terrain: ([...terrainKeys, 'resources'].includes(hashParts[1] as TerrainSetKey) ? hashParts[1] : terrainKeys[0]) as TerrainSetKey,
  focus: 0,
  seed: 1,
};
let patches: { center: THREE.Vector3; label: WorldLabel; mix: string }[] = [];

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const select = $<HTMLSelectElement>('#terrain');
for (const k of terrainKeys) select.add(new Option(TERRAINS.get(k)!.name, k));
select.add(new Option('Resources', 'resources'));
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

// What a resource's models add to a patch (as resourceLayout lays them in the game).
function resourceItems(r: ResourceKey, seed: number): Placed[] {
  const rand = mulberry32(seed);
  return resourceLayout(r, rand).map((m) => {
    const geo = cached(`r|${m.model}`, () => ruralGeometry(ruralModelKind(m.model)));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw);
    const mm = new THREE.Matrix4().compose(new THREE.Vector3(m.x * STEP, 0, m.y * STEP), q, new THREE.Vector3().setScalar(m.s * STEP));
    return { key: `r|${m.model}`, geo, m: mm, c: new THREE.Color(1, 1, 1), leaf: new THREE.Color(m.color ?? 0xffffff), mat: ruralMat };
  });
}
// The land a resource stands on in the gallery: its first terrain with flora.
function landOf(r: ResourceKey): TerrainSetKey | null {
  const d = RESOURCES[r] as { biomes: readonly string[]; features?: readonly string[] };
  return [...(d.features ?? []), ...d.biomes].find((k) => TERRAINS.has(k)) ?? null;
}
const revealedBy = (r: ResourceKey): string => {
  const t = (RESOURCES[r] as { reveal?: string }).reveal;
  return t ? ` · revealed by ${TECHS[TECH_KEYS.find((k) => k === t)!].name}` : '';
};
const yieldText = (r: ResourceKey) => Object.entries(RESOURCES[r].yields).filter(([, v]) => v).map(([k, v]) => `+${v} ${k === 'prod' ? 'production' : k}`).join(', ');

// The whole board: a row per terrain, then the resources, eight a row.
const ROW = 2.5 * R, RES_COLS = 8;
let rowStart = new Map<TerrainSetKey, number>();
function buildTerrains(): void {
  const o: Options = { jitter: jitterBox.checked, groves: grovesBox.checked, seed: state.seed };
  patches = [];
  rowStart = new Map();
  const patch = (center: THREE.Vector3, ground: number, water: number | undefined, items: Placed[], title: string, sub: string, mix: string) => {
    world.add(hex(ground, center));
    world.add(rim(center));
    if (water !== undefined) world.add(waterSheet(center, water));
    const tris = addInstances(items, center, world);
    const i = patches.length;
    const div = label(title, `${sub} · ${Math.round(tris).toLocaleString()} tris`, center.clone().add(new THREE.Vector3(0, 0, R * 0.95)), () => { state.focus = i; refreshFocus(); setCam('close'); });
    patches.push({ center, label: div, mix });
  };
  let row = 0;
  for (const [key, set] of TERRAINS) {
    rowStart.set(key, patches.length);
    const z = row * ROW;
    const title = new WorldLabel([{ text: set.name, bold: true }], LABEL * 1.6);
    title.position.set(-SPACING * 0.9, title.scale.y / 2 + 0.1, z);
    world.add(title);
    set.variants.filter((v) => v.mix.length > 0).forEach((v, i) => {
      patch(new THREE.Vector3(i * SPACING, 0, z), set.ground, set.water, placeVariant(v, { ...o, seed: o.seed * 977 + row * 31 + i }),
        v.name, `${realmsLabel(v)}${v.hills ? ', on hills' : ''} · ${v.density} props`, mixHtml(`${set.name}: ${v.name}`, v));
    });
    row++;
  }
  // The resources, each on its land (that land's first variant, thinned).
  row++;
  const head = new WorldLabel([{ text: 'Resources', bold: true }], LABEL * 2);
  head.position.set(-SPACING * 0.9, head.scale.y / 2 + 0.1, row * ROW);
  world.add(head);
  rowStart.set('resources', patches.length);
  RESOURCE_KEYS.forEach((r, i) => {
    const land = landOf(r), set = land ? TERRAINS.get(land)! : null;
    const v = set?.variants.find((x) => x.mix.length > 0);
    const center = new THREE.Vector3((i % RES_COLS) * SPACING, 0, (row + Math.floor(i / RES_COLS)) * ROW);
    // (The flora kept clear of the resource's patch.)
    const flora = v ? placeVariant({ ...v, density: Math.round(v.density * 0.5) }, { ...o, seed: o.seed * 131 + i }).filter((p) => {
      const at = new THREE.Vector3().setFromMatrixPosition(p.m);
      return Math.hypot(at.x, at.z) > 0.2 * STEP;
    }) : [];
    const d = RESOURCES[r];
    patch(center, set?.ground ?? 0x8a8a70, RESOURCE_LOOKS[r].water ? (set?.water ?? 0.0012) : undefined, [...flora, ...resourceItems(r, o.seed * 7 + i)],
      d.name, `${d.kind} · ${yieldText(r)}${revealedBy(r)}`, `<h4>${d.name}</h4><div class="row">${d.kind} resource on ${set?.name ?? 'its land'} · ${yieldText(r)}${revealedBy(r)}</div>`);
  });
  state.focus = Math.min(state.focus, patches.length - 1);
  refreshFocus();
  info.textContent = `Every terrain and its variants, then every resource on its land: tile edge ${R / SC}, props at game scale. Pick a terrain to fly to it · ← → previous / next row · click a label to focus · drag move · right-drag rotate & tilt · WASD · Q/E · T/G · Z/X`;
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
    const div = label(e.name, `${e.layer} ×${scale} · ${tris} tris`,
      center.clone().add(new THREE.Vector3(0, 0, 4.4)), () => { state.focus = i; refreshFocus(); setCam('close'); }, tris > BUDGET ? '#ff8a80' : undefined);
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
    const div = label(e.name, `Building ×${scale} · ${tris} tris`,
      center.clone().add(new THREE.Vector3(0, 0, 4.4)), () => { state.focus = i; refreshFocus(); setCam('close'); });
    patches.push({ center, label: div, mix: '' });
  });
  info.textContent = `${CATALOG_KINDS.length} props and ${BUILDING_KINDS.length} buildings, enlarged (×N in each label) to be visible. Budget ${BUDGET} triangles · drag move · right-drag or Shift+drag rotate & tilt · WASD move · Q/E rotate · T/G tilt · Z/X zoom`;
}

function refreshFocus(): void {
  patches.forEach((p, i) => p.label.setStyle({ focus: i === state.focus }));
  mixPanel.innerHTML = patches[state.focus]?.mix ?? '';
}

function rebuild(resetCam: boolean): void {
  clearWorld();
  if (state.view === 'terrains') buildTerrains(); else buildCatalog();
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.classList.toggle('active', b.dataset['view'] === state.view);
  select.value = state.terrain;
  select.disabled = state.view !== 'terrains';
  if (resetCam && state.view === 'terrains') { state.focus = rowStart.get(state.terrain) ?? 0; refreshFocus(); }
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
  const mid = box.getCenter(new THREE.Vector3());
  const f = patches[state.focus]?.center ?? mid;
  if (c === 'map') {
    if (state.view === 'catalog') {
      // Start on the top rows, seen at a low angle; pan (right-drag) to see the rest.
      const top = new THREE.Vector3(mid.x, 0, box.min.z + rowGapOf() * 1.2);
      camera.position.copy(top).add(new THREE.Vector3(0, 22, 42));
      controls.target.copy(top);
    } else {
      // The focused row, end to end.
      const row = patches.filter((p) => Math.abs(p.center.z - f.z) < 1e-6);
      const x0 = Math.min(...row.map((p) => p.center.x)), x1 = Math.max(...row.map((p) => p.center.x));
      const at = new THREE.Vector3((x0 + x1) / 2, 0, f.z), d = (x1 - x0) * 0.7 + 22;
      camera.position.copy(at).add(new THREE.Vector3(0, d * 0.6, d * 0.75));
      controls.target.copy(at);
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
select.addEventListener('change', () => { state.terrain = select.value as TerrainSetKey; goToRow(); });
// Flies to the chosen row of the board (its first patch).
function goToRow(): void {
  if (state.view !== 'terrains') return;
  state.focus = rowStart.get(state.terrain) ?? 0;
  refreshFocus();
  select.value = state.terrain;
  history.replaceState(null, '', `#terrains/${state.terrain}`);
  setCam('close');
}
jitterBox.addEventListener('change', () => rebuild(false));
grovesBox.addEventListener('change', () => rebuild(false));
$('#reroll').addEventListener('click', () => { state.seed++; rebuild(false); });
addEventListener('keydown', (e) => {
  if (state.view !== 'terrains' || e.target instanceof HTMLSelectElement) return;
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  const rows = [...terrainKeys, 'resources'];
  const i = (rows.indexOf(state.terrain) + step + rows.length) % rows.length;
  state.terrain = rows[i]!;
  goToRow();
});

// Keyboard camera, as in the game: W A S D move over the ground (Shift =
// faster), Q / E rotate around the view's center, Z / X zoom in / out.
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 't', 'g', 'z', 'x', 'shift']);
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
  // T / G: tilt toward the horizon / back down (as in the world view).
  const tilt = key('t') - key('g');
  if (tilt !== 0) {
    const s = new THREE.Spherical().setFromVector3(offset);
    s.phi = Math.min(controls.maxPolarAngle, Math.max(0.05, s.phi + tilt * 0.9 * dt));
    offset.setFromSpherical(s);
  }
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
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
rebuild(true);
const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  // (On the board, the sun's shadows follow the view: the board is too large for one shadow map.)
  if (state.view === 'terrains') {
    const ext = 70, mid = controls.target;
    sun.position.copy(mid).add(new THREE.Vector3(ext * 0.6, ext * 1.4, ext * 0.9));
    sun.target.position.copy(mid);
    if (sun.shadow.camera.right !== ext * 1.3) {
      Object.assign(sun.shadow.camera, { left: -ext * 1.3, right: ext * 1.3, top: ext * 1.3, bottom: -ext * 1.3, near: 1, far: ext * 5 });
      sun.shadow.camera.updateProjectionMatrix();
    }
  }
  keyboardCamera(Math.min(0.1, timer.getDelta()));
  controls.update();
  renderer.render(scene, camera);
});
// Dev-only handle for test scripts: focus a patch and frame it.
if (import.meta.env.DEV) Object.assign(window, { __gallery: { focus: (i: number) => { state.focus = i; refreshFocus(); setCam('close'); }, rows: () => Object.fromEntries(rowStart) } });
