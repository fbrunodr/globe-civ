import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WorldLabel, clickableLabels, disposeLabels, type LabelLine } from './worldLabel.ts';
import { makePropMaterial, instanceGeometry } from './propMaterial.ts';
import { ruralGeometry, ruralModelKind, isSmoothRural, type RuralModel } from './rural/models.ts';
import { resourceLayout, RESOURCE_WILD, RESOURCE_WORKED } from './rural/resourceModels.ts';
import { RESOURCES, RESOURCE_KEYS, RESOURCE_IMPROVEMENT, type ResourceKey } from './resources.ts';
import { TECHS, TECH_KEYS, STAGE_TECHS } from './techs.ts';
import { IMPROVEMENTS, type ImprovementKey } from './cities.ts';
import { stageLook, waterLook, plotStage, pastureFences, herdSize } from './rural/stages.ts';
import { kitBoost, FIGURES, SPECIES_OF, KIT_BOOST, FENCE_BOOST, PLANT_BOOST, type KitModel } from './rural/kit.ts';
import { CREATURE_SCALE } from './creatures.ts';
import { paintFarm, WORK_OF } from './farmPainter.ts';
import { plotAt, cropIndex, CROP_PALETTE, CROP_HEIGHT, CROP_STAND_SATURATION, PLOT_SIZES, PLANT_ROW_W } from './rural/plots.ts';
import { cropRegion, scatterIn, type CropRegion } from './rural/look.ts';
import { SAFE_RHO, rhoOf, pointInPoly, LOT_SIZE, type Pt } from './town/geometry.ts';
import { placedGeometry } from './buildingCatalog.ts';
import { houseKind } from './houses.ts';
import { styleOf } from './architecture.ts';
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
// The game's material for the countryside's models (and the resources');
// the smooth one for the kit's people, animals and plants.
const ruralMat = makePropMaterial(0.32, 0.8);
const smoothMat = makePropMaterial(0.25, 0.85, undefined, undefined, true);
const matOf = (m: RuralModel) => (isSmoothRural(ruralModelKind(m)) ? smoothMat : ruralMat);
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
    return { key: `r|${m.model}`, geo, m: mm, c: new THREE.Color(1, 1, 1), leaf: new THREE.Color(m.color ?? 0xffffff), mat: matOf(m.model) };
  });
}

// ---------- worked land ----------
// A worked tile as the game shows it at a stage (cityProps.ts, simplified
// to a flat patch): the ground painted with its plots (rural/plots.ts, as
// the terrain shader paints them), the farm's homestead and yards
// (farmPainter.ts), its crops or plants in rows, its herd behind fences,
// and the stage's people, machines and works (rural/stages.ts). Positions
// in tile steps (the hex's own frame), the patch's x and z.
const CROP_ROW = 0.014, CROP_STEP = 0.01, CROP_WIDTH = 0.013;
function kitItem(m: KitModel | RuralModel, p: Pt, yaw: number, s: number, leaf: number, sc?: THREE.Vector3): Placed {
  const geo = cached(`r|${m}`, () => ruralGeometry(ruralModelKind(m as RuralModel)));
  const mm = new THREE.Matrix4().compose(new THREE.Vector3(p.x * STEP, 0, p.y * STEP), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), sc ?? new THREE.Vector3().setScalar(s * STEP));
  return { key: `r|${m}`, geo, m: mm, c: new THREE.Color(1, 1, 1), leaf: new THREE.Color(leaf), mat: matOf(m as RuralModel) };
}
// The ground's texture: the hex's plots at the stage, the crop's colours.
function farmGround(imp: ImprovementKey, region: CropRegion, stage: number, salt: number, base: number): THREE.CanvasTexture {
  const N = 512, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(N, N), half = 0.62;
  const pal = CROP_PALETTE[region].map((h) => new THREE.Color(h)), bg = new THREE.Color(base), ps = plotStage(imp, stage);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N - 0.5) * 2 * half, y = (j / N - 0.5) * 2 * half;
    let c = bg.clone();
    const rho = rhoOf(6, { x, y });
    const ragged = ps === 0 ? 0.05 * Math.sin(x * 23 + y * 17) * Math.sin(y * 29 - x * 11) : 0;
    if (rho < SAFE_RHO + ragged) {
      const pl = plotAt(x, y, salt, ps), k = cropIndex(pl.h, ps);
      c = pal[k]!.clone().multiplyScalar(0.94 + 0.12 * ((pl.h * 7.3) % 1));
      if (imp === 'plantation' && ((pl.f[0] * PLOT_SIZES[ps]![0] / PLANT_ROW_W) % 1) < 0.45) c.lerp(new THREE.Color(0.36, 0.29, 0.2), 0.7);
      const bw = ps === 0 ? 0 : ps === 1 ? 0.003 : ps === 4 ? 0.0015 : 0.004;
      if (bw && pl.edge < bw) c.lerp(ps === 1 ? new THREE.Color(0.32, 0.4, 0.2) : new THREE.Color(0.2, 0.25, 0.15), 0.7);
      if (ps === 0) c.lerp(bg, 0.3 * Math.max(0, Math.sin(x * 61 + y * 37) * Math.sin(y * 53 - x * 41)));
      if (imp === 'pasture' && stage === 0) c.lerp(bg, 0.45);
    }
    const o = (j * N + i) * 4;
    img.data[o] = Math.round(Math.min(1, c.r) ** (1 / 2.2) * 255); img.data[o + 1] = Math.round(Math.min(1, c.g) ** (1 / 2.2) * 255); img.data[o + 2] = Math.round(Math.min(1, c.b) ** (1 / 2.2) * 255); img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function groundHex(tex: THREE.Texture, at: THREE.Vector3): THREE.Mesh {
  const g = new THREE.CircleGeometry(R, 6).rotateX(-Math.PI / 2);
  // (uv from the patch's x and z: the texture spans ±0.62 tile steps.)
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / STEP / 1.24 + 0.5, 1 - (pos.getZ(i) / STEP / 1.24 + 0.5));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.position.copy(at);
  m.receiveShadow = true;
  return m;
}
function workedItems(imp: ImprovementKey, stage: number, res: ResourceKey | null, region: CropRegion, seed: number): Placed[] {
  const out: Placed[] = [], rand = mulberry32(seed);
  if (imp === 'boats' || imp === 'well') {
    const at: Pt[] = [];
    for (const th of waterLook(imp, stage)) for (let n = 0; n < th.n; n++) {
      let p: Pt = { x: 0, y: 0 };
      for (let k = 0; k < 20; k++) { p = { x: (rand() - 0.5) * 0.6, y: (rand() - 0.5) * 0.6 }; if (at.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 0.16)) break; }
      at.push(p);
      out.push(kitItem(th.model, p, rand() * 6.28, kitBoost(th.model), th.colors ? th.colors[n % th.colors.length]! : 0xffffff));
    }
    return out;
  }
  const look = stageLook(imp, stage, res), work = WORK_OF[imp];
  const farm = work ? paintFarm({ work, axis: 0, density: look.density, seed, free: () => true }) : null;
  if (!farm) return out;
  const taken: { p: Pt; r: number }[] = [];
  // The homestead.
  const camped = imp === 'camp' && stage === 0;
  if (!camped) {
    const hk = houseKind(styleOf('Romans', 1), 'b22', 1, seed % 3), [lw, ld] = LOT_SIZE.b22;
    void lw; void ld;
    const geo = cached(`h|${hk}`, () => placedGeometry(hk));
    out.push({ key: `h|${hk}`, geo, m: new THREE.Matrix4().compose(new THREE.Vector3(farm.home.x * STEP, 0, farm.home.y * STEP), new THREE.Quaternion(), new THREE.Vector3().setScalar(STEP)), c: new THREE.Color(1, 1, 1), leaf: new THREE.Color(0xa8553a), mat: ruralMat });
  }
  // Yards: the harvest; a pasture's herd over the whole tile, inside its fences.
  for (const poly of farm.yards) if (!look.herd && (imp === 'farm' || imp === 'wetland')) scatterIn(poly, 1.6, seed + 9, 0.012).forEach((p) => out.push(kitItem('haystack', p, rand() * 6.28, 1, 0xc9a85a)));
  if (look.herd) {
    if (look.fence) for (const line of pastureFences(stage, 0)) line.slice(0, -1).forEach((a, i) => {
      const b = line[i + 1]!, len = Math.hypot(b.x - a.x, b.y - a.y), unit = CREATURE_SCALE * FENCE_BOOST, n = Math.max(1, Math.round(len / (unit * 3)));
      for (let k = 0; k < n; k++) {
        const p = { x: a.x + ((k + 0.5) / n) * (b.x - a.x), y: a.y + ((k + 0.5) / n) * (b.y - a.y) };
        out.push(kitItem(look.fence!, p, -Math.atan2(b.y - a.y, b.x - a.x), 0, 0xffffff, new THREE.Vector3((len / n) * STEP / CREATURE_SCALE, FENCE_BOOST * STEP, FENCE_BOOST * STEP)));
      }
    });
    for (let n = 0, tries = 0; n < herdSize(stage) && tries < 200; tries++) {
      const p = { x: (rand() - 0.5) * 1.1, y: (rand() - 0.5) * 1.1 };
      if (rhoOf(6, p) > SAFE_RHO - 0.09 || Math.hypot(p.x - farm.home.x, p.y - farm.home.y) < 0.1) continue;
      const m = look.herd.models[n % look.herd.models.length]!;
      out.push(kitItem(m, p, rand() * 6.28, kitBoost(m) * (0.85 + 0.25 * rand()), look.herd.colors[Math.floor(rand() * look.herd.colors.length)]!));
      n++;
    }
  }
  // Crops (tufts on their plots) or plants (in rows, or clumps).
  const off = (p: Pt) => rhoOf(6, p) > SAFE_RHO - 0.03 || Math.hypot(p.x - farm.home.x, p.y - farm.home.y) < 0.06 || farm.yards.some((poly) => pointInPoly(p, poly));
  const ps = plotStage(imp, stage);
  if (imp === 'farm' || (imp === 'wetland' && region === 'paddy')) {
    const tint = CROP_PALETTE[region].map((h) => { const c = new THREE.Color(h), l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; return new THREE.Color(l + (c.r - l) * CROP_STAND_SATURATION, l + (c.g - l) * CROP_STAND_SATURATION, l + (c.b - l) * CROP_STAND_SATURATION); });
    const geo = cached('r|crop', () => ruralGeometry(ruralModelKind('crop')));
    for (let x = -0.45; x <= 0.45; x += CROP_ROW) for (let y = -0.45; y <= 0.45; y += CROP_STEP) {
      const p = { x: x + (rand() - 0.5) * CROP_ROW * 0.3, y: y + (rand() - 0.5) * CROP_STEP * 0.8 };
      const pl = plotAt(p.x, p.y, seed, ps), k = cropIndex(pl.h, ps), h = CROP_HEIGHT[k];
      if (h === 0 || pl.edge < 0.007 || off(p) || (ps === 0 && rand() < 0.35)) continue;
      out.push({ key: 'r|crop', geo, m: new THREE.Matrix4().compose(new THREE.Vector3(p.x * STEP, 0, p.y * STEP), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI), new THREE.Vector3(CROP_WIDTH * STEP, h * STEP * (0.9 + 0.2 * rand()), CROP_WIDTH * STEP)), c: new THREE.Color(1, 1, 1), leaf: tint[k]!.clone().multiplyScalar(0.9 + 0.2 * rand()), mat: propMat });
    }
  }
  if (look.plants) {
    const hedge = look.plants.model === 'vine' || look.plants.model === 'teaBush', step = look.plants.model === 'bananaPlant' || look.plants.model === 'mulberryBush' || look.plants.model === 'incenseTree' ? 0.05 : hedge ? 0.022 : 0.028;
    const spots: Pt[] = [];
    if (look.plants.rows) {
      const sx = PLOT_SIZES[ps]![0];
      for (let y = -0.45; y <= 0.45; y += step) {
        let last = '';
        for (let x = -0.45; x <= 0.45; x += 0.001) {
          const pl = plotAt(x, y, seed, ps), row = (pl.f[0] * sx) / PLANT_ROW_W, id = `${pl.h}|${Math.floor(row)}`;
          if (Math.floor(row) % 2 || row % 1 < 0.72 || id === last) continue;
          last = id;
          if (pl.edge >= 0.01 && cropIndex(pl.h, ps) !== 3) spots.push({ x, y });
        }
      }
    }
    else for (let n = 0; n < 9; n++) { const c = { x: (rand() - 0.5) * 0.8, y: (rand() - 0.5) * 0.8 }; for (let k = 0; k < 5; k++) spots.push({ x: c.x + (rand() - 0.5) * 0.12, y: c.y + (rand() - 0.5) * 0.12 }); }
    for (const p of spots) if (!off(p)) out.push(kitItem(look.plants.model, p, look.plants.rows ? -Math.PI / 2 + (rand() - 0.5) * 0.08 : rand() * 6.28, PLANT_BOOST * 0.9 * (0.85 + 0.3 * rand()), 0xffffff));
  }
  // The stage's things.
  const homeSpots = [[0.07, 0.03], [-0.06, 0.06], [0.06, -0.07], [-0.08, -0.05], [0.11, 0.08]] as const;
  let slot = 0;
  for (const th of look.things) for (let n = 0; n < th.n; n++) {
    const m = th.model, rad = 0.025 * kitBoost(m) * (FIGURES.has(m) ? 0.4 : 1);
    for (let tries = 0; tries < 40; tries++) {
      let p: Pt;
      if (th.where === 'home') { const [a, b] = homeSpots[(slot + tries) % homeSpots.length]!; const f = 1 + Math.floor(tries / 5) * 0.4; p = { x: farm.home.x + a * f, y: farm.home.y + b * f }; }
      else if (th.where === 'yard' && farm.yards.length) { const poly = farm.yards[Math.floor(rand() * farm.yards.length)]!, xs = poly.map((q) => q.x), ys = poly.map((q) => q.y); p = { x: Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + rand() * (Math.max(...ys) - Math.min(...ys)) }; }
      else p = { x: (rand() - 0.5) * 0.9, y: (rand() - 0.5) * 0.9 };
      if (rhoOf(6, p) > SAFE_RHO - 0.03 || taken.some((q) => Math.hypot(p.x - q.p.x, p.y - q.p.y) < q.r + rad)) continue;
      if (th.where === 'field' && (Math.hypot(p.x - farm.home.x, p.y - farm.home.y) < 0.08 || farm.yards.some((poly) => pointInPoly(p, poly)))) continue;
      if ((m === 'ploughTeam' || m === 'tractor' || m === 'combine') && tries < 35 && cropIndex(plotAt(p.x, p.y, seed, ps).h, ps) !== (m === 'combine' ? 0 : 3)) continue;
      out.push(kitItem(m, p, th.where === 'field' && (!FIGURES.has(m) || m === 'ploughTeam') ? 0 : rand() * 6.28, kitBoost(m) * (0.9 + 0.2 * rand()), th.colors ? th.colors[Math.floor(rand() * th.colors.length)]! : 0xffffff));
      taken.push({ p, r: rad });
      if (th.where === 'home') slot++;
      break;
    }
  }
  if (imp === 'mine' && look.adits) out.push(kitItem('adit', { x: -0.25, y: 0.2 }, 0.6, KIT_BOOST, 0xffffff));
  return out;
}
// The stage's name: the techs that brought it.
const stageText = (imp: ImprovementKey, stage: number): string => stage === 0 ? 'before its techs' : STAGE_TECHS(imp).slice(0, stage).map((k) => TECHS[k].name).join(', ');
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
const ROW = 2.5 * R;
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
  // The resources: a row each, on its land (that land's first variant,
  // thinned): wild first, then worked at each stage of its improvement.
  row++;
  const head = new WorldLabel([{ text: 'Resources, wild and worked', bold: true }], LABEL * 2);
  head.position.set(-SPACING * 0.9, head.scale.y / 2 + 0.1, row * ROW);
  world.add(head);
  rowStart.set('resources', patches.length);
  row++;
  const floraOf = (_r: ResourceKey | null, land: TerrainSetKey | null, seed: number, clearR: number) => {
    const set = land ? TERRAINS.get(land)! : null, v = set?.variants.find((x) => x.mix.length > 0);
    return v ? placeVariant({ ...v, density: Math.round(v.density * 0.5) }, { ...o, seed }).filter((p) => { const at = new THREE.Vector3().setFromMatrixPosition(p.m); return Math.hypot(at.x, at.z) > clearR * STEP; }) : [];
  };
  const rowsOf: { r: ResourceKey | null; imp: ImprovementKey; land: TerrainSetKey | null; name: string }[] = [
    ...RESOURCE_KEYS.map((r) => ({ r, imp: RESOURCE_IMPROVEMENT[r], land: landOf(r), name: RESOURCES[r].name })),
    { r: null, imp: 'farm', land: 'temperateForest', name: 'A farm (no resource)' },
    { r: null, imp: 'camp', land: 'taiga', name: 'A logging camp' },
  ];
  rowsOf.forEach(({ r, imp, land, name }, ri) => {
    const set = land ? TERRAINS.get(land) ?? null : null, z = row * ROW;
    const title = new WorldLabel([{ text: name, bold: true }], LABEL * 1.3);
    title.position.set(-SPACING * 0.9, title.scale.y / 2 + 0.1, z);
    world.add(title);
    const water = (imp === 'boats' || (r && RESOURCE_WILD[r].water)) ? (set?.water ?? 0.0012) : undefined;
    let col = 0;
    if (r) {
      const d = RESOURCES[r];
      // (What lives on the water stands on its surface.)
      const afloat = (items: Placed[]) => (water === undefined ? items : items.map((it) => ({ ...it, m: new THREE.Matrix4().makeTranslation(0, water * SC, 0).multiply(it.m) })));
      patch(new THREE.Vector3(0, 0, z), set?.ground ?? 0x8a8a70, water, [...floraOf(r, land, o.seed * 131 + ri, 0.2), ...afloat(resourceItems(r, o.seed * 7 + ri))],
        `${d.name}: wild`, `${d.kind} · ${yieldText(r)}${revealedBy(r)}`, `<h4>${d.name}</h4><div class="row">${d.kind} resource on ${set?.name ?? 'its land'} · ${yieldText(r)}${revealedBy(r)} · worked as ${IMPROVEMENTS[imp].name}</div>`);
      col = 1;
    }
    const stages = STAGE_TECHS(imp).length;
    for (let st = 0; st <= stages; st++, col++) {
      const center = new THREE.Vector3(col * SPACING, 0, z), seed = o.seed * 977 + ri * 31 + st;
      const region = cropRegion(imp, (land ?? 'prairie') as BiomeKey, null, 15, r);
      const farmed = imp === 'farm' || imp === 'wetland' || imp === 'pasture' || imp === 'plantation';
      const lift = (items: Placed[]) => (water === undefined ? items : items.map((it) => ({ ...it, m: new THREE.Matrix4().makeTranslation(0, water * SC, 0).multiply(it.m) })));
      const items = [...(farmed ? [] : floraOf(r, land, seed, imp === 'camp' ? 0.12 : 0.3)), ...lift(workedItems(imp, st, r, region, seed))];
      if (r && RESOURCE_WORKED[r]) items.push(...resourceLayout(r, mulberry32(seed), RESOURCE_WORKED[r]).map((m) => kitItem(m.model, { x: m.x + 0.25, y: m.y - 0.2 }, m.yaw, m.s, m.color ?? 0xffffff)));
      if (farmed) { world.add(groundHex(farmGround(imp, region, st, seed, set?.ground ?? 0x6a7a40), center)); world.add(rim(center)); }
      const i = patches.length;
      const tris = addInstances(items, center, world);
      if (!farmed) { world.add(hex(imp === 'mine' ? 0x5a5248 : imp === 'quarry' ? 0xb8b0a0 : set?.ground ?? 0x8a8a70, center)); world.add(rim(center)); if (water !== undefined) world.add(waterSheet(center, water)); }
      const div = label(`${IMPROVEMENTS[imp].name} · stage ${st}`, `${stageText(imp, st)} · ${Math.round(tris).toLocaleString()} tris`, center.clone().add(new THREE.Vector3(0, 0, R * 0.95)), () => { state.focus = i; refreshFocus(); setCam('close'); });
      patches.push({ center, label: div, mix: `<h4>${name}: ${IMPROVEMENTS[imp].name}, stage ${st}</h4><div class="row">${stageText(imp, st)}</div>` });
    }
    row++;
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
  // The countryside's animals and people (rural/kit.ts), smooth-shaded, at
  // one scale (a person 3 units tall), so their sizes compare true.
  const figures = [...FIGURES].filter((k) => k !== 'ploughTeam' && k !== 'haycart');
  const FIG_SCALE = 3 / (1.72 * CREATURE_SCALE);
  figures.forEach((kind, j) => {
    const i = CATALOG_KINDS.length + BUILDING_KINDS.length + j;
    const center = new THREE.Vector3((i % cols) * gap, 0, Math.floor(i / cols) * rowGap);
    world.add(hex(0xb9b39a, center, 3.2));
    const geo = cached(`r|${kind}`, () => ruralGeometry(ruralModelKind(kind)));
    const mesh = new THREE.InstancedMesh(instanceGeometry(geo, 1), smoothMat, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6), new THREE.Vector3().setScalar(FIG_SCALE)));
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    // (Their coats and clothes: a typical colour, as an instance takes in the game.)
    const coat = new THREE.Color(SPECIES_OF[kind] ? ({ horse: 0x7a4a2a, cow: 0x6a4a32, pied: 0x2a2622, ox: 0x5a4a3a, sheep: 0xece6da, mouflon: 0x8a5a34, deer: 0x9a6a40, stag: 0x8a5a34, elephant: 0x8c8680, fox: 0xc8642a } as const)[SPECIES_OF[kind]!] : 0x8a6a48);
    (mesh.geometry.getAttribute('leafTint') as THREE.InstancedBufferAttribute).setXYZ(0, coat.r, coat.g, coat.b);
    mesh.castShadow = true;
    world.add(mesh);
    const tris = triangles(geo);
    const div = label(kind[0]!.toUpperCase() + kind.slice(1), `${SPECIES_OF[kind] ? 'Animal' : 'Person'} · ${tris} tris`,
      center.clone().add(new THREE.Vector3(0, 0, 4.4)), () => { state.focus = i; refreshFocus(); setCam('close'); });
    patches.push({ center, label: div, mix: '' });
  });
  info.textContent = `${CATALOG_KINDS.length} props, ${BUILDING_KINDS.length} buildings and ${figures.length} animals and people, enlarged (×N in each label) to be visible. Budget ${BUDGET} triangles · drag move · right-drag or Shift+drag rotate & tilt · WASD move · Q/E rotate · T/G tilt · Z/X zoom`;
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
if (import.meta.env.DEV) Object.assign(window, { __gallery: { focus: (i: number) => { state.focus = i; refreshFocus(); setCam('close'); }, rows: () => Object.fromEntries(rowStart), names: () => patches.map((p) => p.mix.replace(/<[^>]+>/g, ' ').trim()) } });
