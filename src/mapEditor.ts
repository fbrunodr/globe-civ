// Map editor (/map_editor.html): paint a map's land, lakes, relief and
// biomes tile by tile, one painting per map size (mapPaint.ts). Saves to
// src/maps/<map>.json through the dev server (vite.config.ts); world view
// and the game read it from there.

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Globe } from './goldberg.ts';
import { globeFor } from './globes.ts';
import { latLon } from './geo.ts';
import { ball, components } from './mapRules.ts';
import {
  FLAT, HILLS, LAKE, LAND, MOUNTAINS, PAINTABLE_BIOMES, PAINTED, SEA, load, paintingFor, resample, store,
  type PaintFile, type PaintedScript, type Painting,
} from './mapPaint.ts';
import { MAP_SCRIPTS, MAP_SIZES, tileCount, type MapSizeKey } from './rules.ts';
import { terrainName } from './terrain.ts';
import type { BiomeKey } from './terrain.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const SIZES = Object.keys(MAP_SIZES) as MapSizeKey[];
const MAPS = Object.keys(PAINTED) as PaintedScript[];
const isSize = (s: string): s is MapSizeKey => s in MAP_SIZES;
const isMap = (s: string): s is PaintedScript => s in PAINTED;
const map: PaintedScript = isMap(params.get('map') ?? '') ? params.get('map') as PaintedScript : MAPS[0]!;
let size: MapSizeKey = isSize(params.get('size') ?? '') ? params.get('size') as MapSizeKey : 'medium';

// ---------- the paintings ----------

// Every size's painting, as stored or (for a size never painted) resampled
// from the largest painted one; `saved` holds the sizes the file has.
const file: PaintFile = { ...PAINTED[map] };
const paintings = new Map<MapSizeKey, Painting>();
const dirty = new Set<MapSizeKey>();
const painting = (s: MapSizeKey): Painting => {
  let p = paintings.get(s);
  if (!p) { p = paintingFor(file, s); paintings.set(s, p); }
  return p;
};

// ---------- colours ----------

const BIOME_COLOR: Record<(typeof PAINTABLE_BIOMES)[number], string> = {
  iceSheet: '#f4f7fa', tundra: '#9aa58f', taiga: '#2f5d43', coldDesert: '#b9ad8a', steppe: '#c2c27a', prairie: '#9cc061',
  temperateForest: '#3f8a3a', temperateRainforest: '#22704a', mediterranean: '#a6a85a', hotDesert: '#e3cf91',
  savanna: '#c9b45a', monsoonForest: '#5f9a2f', jungle: '#1f7a2a',
};
const SEA_COLOR = new THREE.Color('#1d3f73'), LAKE_COLOR = new THREE.Color('#5aa0d8'), LAND_COLOR = new THREE.Color('#87a86a');
const HILL_TINT = new THREE.Color('#7a6648'), MOUNTAIN_TINT = new THREE.Color('#5d5955'), PEAK = new THREE.Color('#e9e6e1');
function tileColor(p: Painting, t: number, out: THREE.Color): THREE.Color {
  if (p.terrain[t] === SEA) return out.copy(SEA_COLOR);
  if (p.terrain[t] === LAKE) return out.copy(LAKE_COLOR);
  const b = p.biome[t];
  out.copy(b ? new THREE.Color(BIOME_COLOR[b as keyof typeof BIOME_COLOR]) : LAND_COLOR);
  if (p.relief[t] === HILLS) out.lerp(HILL_TINT, 0.35);
  if (p.relief[t] === MOUNTAINS) out.lerp(MOUNTAIN_TINT, 0.7);
  return out;
}

// ---------- the scene ----------

const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#05070c');
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
camera.position.set(0, 0.6, 3.4);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.minDistance = 1.15;
controls.maxDistance = 6;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.addEventListener('change', () => { controls.rotateSpeed = 0.25 * (camera.position.length() - 1); });
controls.rotateSpeed = 0.25 * (camera.position.length() - 1);

// The reference image, under the tiles.
const refMat = new THREE.MeshBasicMaterial({ color: '#0c1220' });
const refGeo = new THREE.SphereGeometry(0.996, 128, 64);
{
  const pos = refGeo.getAttribute('position'), uv = refGeo.getAttribute('uv') as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const [la, lo] = latLon(v.fromBufferAttribute(pos, i).normalize());
    // (The seam keeps its row's u: either side of 180° is the same.)
    uv.setXY(i, (lo + 180) / 360, (la + 90) / 180);
  }
}
scene.add(new THREE.Mesh(refGeo, refMat));

const tileMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 });
const edgeMat = new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22 });
let tiles: THREE.Mesh | null = null, edges: THREE.LineSegments | null = null;
let faceTile = new Int32Array(0), tileVerts: [number, number][] = [];

// One fan of triangles per tile, its own vertices so it takes one colour.
function build(globe: Globe): void {
  if (tiles) { scene.remove(tiles, edges!); tiles.geometry.dispose(); edges!.geometry.dispose(); }
  const pos: number[] = [], line: number[] = [], faces: number[] = [];
  tileVerts = [];
  for (const t of globe.tiles) {
    const start = pos.length / 3, cs = t.corners.map((c) => globe.triCenters[c]!);
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i]!, b = cs[(i + 1) % cs.length]!;
      pos.push(t.center.x, t.center.y, t.center.z, a.x, a.y, a.z, b.x, b.y, b.z);
      faces.push(t.id);
      line.push(a.x * 1.0005, a.y * 1.0005, a.z * 1.0005, b.x * 1.0005, b.y * 1.0005, b.z * 1.0005);
    }
    tileVerts.push([start, pos.length / 3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
  tiles = new THREE.Mesh(g, tileMat);
  edges = new THREE.LineSegments(lg, edgeMat);
  faceTile = Int32Array.from(faces);
  scene.add(tiles, edges);
}
const col = new THREE.Color();
function recolor(list?: Iterable<number>): void {
  if (!tiles) return;
  const p = painting(size), attr = tiles.geometry.getAttribute('color') as THREE.BufferAttribute;
  for (const t of list ?? globeFor(size).tiles.map((x) => x.id)) {
    tileColor(p, t, col);
    const [a, b] = tileVerts[t]!;
    // (Mountains: a pale peak at the center.)
    for (let v = a; v < b; v++) {
      const c = p.terrain[t] === LAND && p.relief[t] === MOUNTAINS && (v - a) % 3 === 0 ? PEAK : col;
      attr.setXYZ(v, c.r, c.g, c.b);
    }
  }
  attr.needsUpdate = true;
}

// ---------- tools ----------

type Tool = { kind: 'terrain'; v: number } | { kind: 'relief'; v: number } | { kind: 'biome'; v: BiomeKey | null };
let tool: Tool = { kind: 'terrain', v: LAND };
const toolButtons: [HTMLButtonElement, Tool][] = [];
function addTool(row: string, label: string, color: string, t: Tool): void {
  const b = document.createElement('button');
  b.innerHTML = `<i style="background:${color}"></i>${label}`;
  b.addEventListener('click', () => { tool = t; markTool(); b.blur(); });
  $(row).append(b);
  toolButtons.push([b, t]);
}
const sameTool = (a: Tool, b: Tool) => a.kind === b.kind && a.v === b.v;
const markTool = () => { for (const [b, t] of toolButtons) b.classList.toggle('on', sameTool(t, tool)); };
addTool('terrainTools', 'Sea', `#${SEA_COLOR.getHexString()}`, { kind: 'terrain', v: SEA });
addTool('terrainTools', 'Land', `#${LAND_COLOR.getHexString()}`, { kind: 'terrain', v: LAND });
addTool('terrainTools', 'Lake', `#${LAKE_COLOR.getHexString()}`, { kind: 'terrain', v: LAKE });
addTool('reliefTools', 'Flat', `#${LAND_COLOR.getHexString()}`, { kind: 'relief', v: FLAT });
addTool('reliefTools', 'Hills', `#${LAND_COLOR.clone().lerp(HILL_TINT, 0.35).getHexString()}`, { kind: 'relief', v: HILLS });
addTool('reliefTools', 'Mountains', `#${LAND_COLOR.clone().lerp(MOUNTAIN_TINT, 0.7).getHexString()}`, { kind: 'relief', v: MOUNTAINS });
addTool('biomeTools', 'Auto (climate)', `#${LAND_COLOR.getHexString()}`, { kind: 'biome', v: null });
for (const b of PAINTABLE_BIOMES) addTool('biomeTools', terrainName({ biome: b, relief: 'flat', feature: null }), BIOME_COLOR[b], { kind: 'biome', v: b });
markTool();

function apply(p: Painting, t: number): void {
  switch (tool.kind) {
    case 'terrain':
      p.terrain[t] = tool.v;
      if (tool.v !== LAND) { p.relief[t] = FLAT; p.biome[t] = null; }
      break;
    case 'relief': p.terrain[t] = LAND; p.relief[t] = tool.v; break;
    case 'biome': p.terrain[t] = LAND; p.biome[t] = tool.v; break;
  }
}

// ---------- undo ----------

interface Snapshot { size: MapSizeKey; terrain: Uint8Array; relief: Uint8Array; biome: (BiomeKey | null)[] }
const snap = (s: MapSizeKey): Snapshot => { const p = painting(s); return { size: s, terrain: p.terrain.slice(), relief: p.relief.slice(), biome: p.biome.slice() }; };
const undos: Snapshot[] = [], redos: Snapshot[] = [];
function restore(from: Snapshot[], to: Snapshot[]): void {
  const s = from.pop();
  if (!s) return;
  to.push(snap(s.size));
  const p = painting(s.size);
  p.terrain.set(s.terrain); p.relief.set(s.relief); s.biome.forEach((b, i) => { p.biome[i] = b; });
  dirty.add(s.size);
  if (s.size !== size) switchSize(s.size); else { recolor(); changed(); }
}
const record = () => { undos.push(snap(size)); if (undos.length > 200) undos.shift(); redos.length = 0; };

// ---------- painting with the mouse ----------

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function tileUnder(e: PointerEvent | MouseEvent): number {
  if (!tiles) return -1;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(tiles, false)[0];
  return hit?.faceIndex != null ? faceTile[hit.faceIndex]! : -1;
}
let brush = 1, stroking = false, last = -1;
// Paints the brush at t, and along the way from the last tile painted (the
// pointer skips tiles when it moves fast).
function paintAt(t: number): void {
  if (t < 0) return;
  const globe = globeFor(size), p = painting(size), touched = new Set<number>();
  const at = (x: number) => { for (const y of ball(globe, x, brush - 1).tiles) touched.add(y); };
  for (let cur = last; cur >= 0 && cur !== t;) {
    const goal = globe.tiles[t]!.center;
    let next = cur, best = globe.tiles[cur]!.center.dot(goal);
    for (const nb of globe.tiles[cur]!.neighbors) { const d = globe.tiles[nb]!.center.dot(goal); if (d > best) { best = d; next = nb; } }
    if (next === cur) break;
    cur = next;
    at(cur);
  }
  at(t);
  last = t;
  for (const x of touched) apply(p, x);
  recolor(touched);
}
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const t = tileUnder(e);
  if (t < 0) return;
  if (e.altKey) { pick(t); return; }
  record();
  stroking = true;
  last = -1;
  canvas.setPointerCapture(e.pointerId);
  paintAt(t);
});
canvas.addEventListener('pointermove', (e) => {
  const t = tileUnder(e);
  if (stroking) paintAt(t);
  hover(t);
});
const endStroke = () => { if (!stroking) return; stroking = false; dirty.add(size); changed(); };
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Alt+click: the tile's paint becomes the tool (biome, else relief, else terrain).
function pick(t: number): void {
  const p = painting(size);
  tool = p.terrain[t] !== LAND ? { kind: 'terrain', v: p.terrain[t]! }
    : p.biome[t] ? { kind: 'biome', v: p.biome[t]! }
    : p.relief[t] ? { kind: 'relief', v: p.relief[t]! } : { kind: 'terrain', v: LAND };
  markTool();
}

function hover(t: number): void {
  const el = $('hover');
  if (t < 0) { el.classList.add('hidden'); return; }
  const p = painting(size), [la, lo] = latLon(globeFor(size).tiles[t]!.center);
  const what = p.terrain[t] === SEA ? 'Sea' : p.terrain[t] === LAKE ? 'Lake'
    : `${['Flat', 'Hills', 'Mountains'][p.relief[t]!]} · ${p.biome[t] ? terrainName({ biome: p.biome[t]!, relief: 'flat', feature: null }) : 'biome by climate'}`;
  el.innerHTML = `${what}<br><small>tile ${t} · ${Math.abs(la).toFixed(1)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(1)}°${lo >= 0 ? 'E' : 'W'}</small>`;
  el.classList.remove('hidden');
}

// ---------- stats and warnings ----------

function changed(): void {
  const p = painting(size), globe = globeFor(size), N = globe.tiles.length;
  let land = 0, hills = 0, mountains = 0, lone = 0;
  for (let t = 0; t < N; t++) {
    if (p.terrain[t] !== LAND) continue;
    land++;
    if (p.relief[t] === HILLS) hills++;
    if (p.relief[t] === MOUNTAINS) {
      mountains++;
      if (!globe.tiles[t]!.neighbors.some((nb) => p.terrain[nb] === LAND && p.relief[nb] === MOUNTAINS)) lone++;
    }
  }
  const lakes = components(globe, (t) => p.terrain[t] === LAKE).length;
  const seas = components(globe, (t) => p.terrain[t] === SEA);
  const pct = (a: number, b: number) => `${b ? ((100 * a) / b).toFixed(1) : '0'}%`;
  const warn = (s: string) => `<div class="warn">⚠ ${s}</div>`;
  $('stats').innerHTML = `<b>${MAP_SCRIPTS[map].name} · ${MAP_SIZES[size].name}</b> <small>${tileCount(MAP_SIZES[size].n).toLocaleString()} tiles${file[size] ? '' : ' · not painted yet (resampled)'}</small>
    <div>Land ${pct(land, N)} of tiles <small>(random maps 35–40%)</small></div>
    <div>Hills ${pct(hills, land)} · mountains ${pct(mountains, land)} of land <small>(12–18%, 5–9%)</small></div>
    <div>Lakes ${lakes}</div>
    ${seas.length > 1 ? warn(`${seas.length - 1} sea${seas.length > 2 ? 's' : ''} cut off from the ocean: a channel will be cut to ${seas.length > 2 ? 'them' : 'it'} (or paint them as lakes)`) : ''}
    ${lone ? warn(`${lone} lone mountain${lone > 1 ? 's' : ''} (ranges read better)`) : ''}`;
  $('save').classList.toggle('dirty', dirty.size > 0);
  $('saveInfo').textContent = dirty.size ? `unsaved: ${[...dirty].map((s) => MAP_SIZES[s].name).join(', ')}` : '';
}

// ---------- sizes, saving ----------

function switchSize(s: MapSizeKey): void {
  size = s;
  $<HTMLSelectElement>('size').value = s;
  const url = new URL(location.href);
  url.searchParams.set('size', s);
  history.replaceState(null, '', url);
  $<HTMLAnchorElement>('preview').href = `/world_view.html?size=${s}&map=${map}&seed=1`;
  build(globeFor(s));
  recolor();
  changed();
}

async function save(): Promise<void> {
  const out: PaintFile = {};
  for (const s of SIZES) {
    if (dirty.has(s)) out[s] = store(painting(s));
    else if (file[s]) out[s] = file[s];
  }
  const res = await fetch(`/__map/save?name=${map}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(out) });
  if (!res.ok) { $('saveInfo').textContent = `save failed: ${await res.text()}`; return; }
  Object.assign(file, out);
  dirty.clear();
  changed();
  $('saveInfo').textContent = `saved · src/maps/${map}.json`;
}

$<HTMLSelectElement>('map').innerHTML = MAPS.map((m) => `<option value="${m}"${m === map ? ' selected' : ''}>${MAP_SCRIPTS[m].name}</option>`).join('');
$<HTMLSelectElement>('map').addEventListener('change', (e) => {
  const url = new URL(location.href);
  url.searchParams.set('map', (e.target as HTMLSelectElement).value);
  location.href = url.toString();
});
$<HTMLSelectElement>('size').innerHTML = SIZES.map((s) => `<option value="${s}">${MAP_SIZES[s].name} (${tileCount(MAP_SIZES[s].n).toLocaleString()} tiles)</option>`).join('');
$<HTMLSelectElement>('size').addEventListener('change', (e) => { switchSize((e.target as HTMLSelectElement).value as MapSizeKey); (e.target as HTMLElement).blur(); });
$<HTMLSelectElement>('copyFrom').innerHTML = SIZES.map((s) => `<option value="${s}">${MAP_SIZES[s].name}</option>`).join('');
$('copy').addEventListener('click', () => {
  const from = $<HTMLSelectElement>('copyFrom').value as MapSizeKey;
  if (from === size) return;
  record();
  const q = resample(painting(from), globeFor(from), globeFor(size)), p = painting(size);
  p.terrain.set(q.terrain); p.relief.set(q.relief); q.biome.forEach((b, i) => { p.biome[i] = b; });
  dirty.add(size); recolor(); changed();
});
$('clear').addEventListener('click', () => {
  record();
  const p = painting(size);
  p.terrain.fill(SEA); p.relief.fill(FLAT); p.biome.fill(null);
  dirty.add(size); recolor(); changed();
});
$('save').addEventListener('click', () => { void save(); });
const brushEl = $<HTMLInputElement>('brush');
const setBrush = (b: number) => { brush = Math.max(1, Math.min(6, b)); brushEl.value = String(brush); $('brushV').textContent = String(brush); };
brushEl.addEventListener('input', () => setBrush(Number(brushEl.value)));
$<HTMLInputElement>('opacity').addEventListener('input', (e) => {
  tileMat.opacity = Number((e.target as HTMLInputElement).value) / 100;
  tileMat.depthWrite = tileMat.opacity > 0.99;
});
$<HTMLInputElement>('refFile').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  new THREE.TextureLoader().load(URL.createObjectURL(f), (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    refMat.map = tex; refMat.color.set('#ffffff'); refMat.needsUpdate = true;
    if (tileMat.opacity > 0.99) { tileMat.opacity = 0.5; tileMat.depthWrite = false; $<HTMLInputElement>('opacity').value = '50'; }
  });
});
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) restore(redos, undos); else restore(undos, redos); }
  else if (!mod && 'wasd'.includes(e.key.toLowerCase())) held.add(e.key.toLowerCase());
  else if (e.key === '[') setBrush(brush - 1);
  else if (e.key === ']') setBrush(brush + 1);
});
addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());
addEventListener('beforeunload', (e) => { if (dirty.size) e.preventDefault(); });

// The saved paintings are what the world view shows (load() checks each against its globe).
for (const s of SIZES) if (file[s]) load(file[s]!, globeFor(s).tiles.length);

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
switchSize(size);
// WASD: turn the globe (W shows what lies north, A west), slower up close.
const held = new Set<string>(), orbit = new THREE.Spherical(), clock = new THREE.Clock();
function turn(dt: number): void {
  if (!held.size) return;
  const step = 0.6 * dt * (camera.position.length() - 1);
  orbit.setFromVector3(camera.position);
  if (held.has('w')) orbit.phi -= step;
  if (held.has('s')) orbit.phi += step;
  if (held.has('a')) orbit.theta -= step;
  if (held.has('d')) orbit.theta += step;
  orbit.makeSafe();
  camera.position.setFromSpherical(orbit);
}
renderer.setAnimationLoop(() => { turn(Math.min(0.05, clock.getDelta())); controls.update(); renderer.render(scene, camera); });
if (import.meta.env.DEV) Object.assign(window, { __editor: { paintings, globeFor } });
