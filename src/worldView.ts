// World view (/world_view): a world from a size and a seed, fully revealed
// (in sight, or explored only), with no units, cities or turns. For looking
// at terrain generation and terrain painting.

import './style.css';
import { Game } from './game.ts';
import { GlobeRenderer, type DebugView } from './render.ts';
import { mountSettings } from './settingsMenu.ts';
import { MAP_SCRIPTS, MAP_SIZES, isMapScript, tileCount, type MapScriptKey, type MapSizeKey, type UnitKey, unitDef } from './rules.ts';
import { terrainName } from './terrain.ts';
import { floraLabel } from './flora.ts';

const isMapSize = (s: string): s is MapSizeKey => s in MAP_SIZES;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const params = new URLSearchParams(location.search);
const pSize = params.get('size') ?? '';
const size: MapSizeKey = isMapSize(pSize) ? pSize : 'medium';
const pMap = params.get('map') ?? '';
const script: MapScriptKey = isMapScript(pMap) ? pMap : 'continents';
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e6);

// Controls: a new size or seed reloads the page with them in the URL, so a
// world can be shared or bookmarked.
const sizeEl = $<HTMLSelectElement>('size'), mapEl = $<HTMLSelectElement>('map'), seedEl = $<HTMLInputElement>('seed');
mapEl.innerHTML = (Object.keys(MAP_SCRIPTS) as MapScriptKey[])
  .map((k) => `<option value="${k}"${k === script ? ' selected' : ''}>${MAP_SCRIPTS[k].name}</option>`).join('');
sizeEl.innerHTML = (Object.keys(MAP_SIZES) as MapSizeKey[])
  .map((k) => `<option value="${k}"${k === size ? ' selected' : ''}>${MAP_SIZES[k].name} (${tileCount(MAP_SIZES[k].n).toLocaleString()} tiles)</option>`).join('');
seedEl.value = String(seed);
const generate = (s: number) => {
  const url = new URL(location.href);
  url.searchParams.set('size', sizeEl.value);
  url.searchParams.set('map', mapEl.value);
  url.searchParams.set('seed', String(s));
  location.href = url.toString();
};
$('generate').addEventListener('click', () => generate(Number(seedEl.value) || 1));
$('random').addEventListener('click', () => generate(Math.floor(Math.random() * 1e6)));
seedEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(Number(seedEl.value) || 1); });

// The world: everything explored and in sight, nothing on it.
const game = new Game({ size, seed, script });
game.units.length = 0;
game.cities.length = 0;
game.explored.fill(1);
game.visible.fill(1);
const view = new GlobeRenderer($<HTMLCanvasElement>('c'), game);
view.syncWorld(null);
$('hint').textContent = `${MAP_SIZES[size].name} · ${MAP_SCRIPTS[script].name} · seed ${seed}`;
if (import.meta.env.DEV) Object.assign(window, { __globe: { game, view } });

// Hover: what the tile is.
const info = $('tileinfo');
view.onTileHover = (t) => {
  view.syncOverlay(null, t, null);
  if (t < 0) { info.classList.add('hidden'); return; }
  const variant = floraLabel(game.map, game.flora, t);
  info.innerHTML = `<b>${esc(terrainName(game.terrainAt(t)))}</b>${variant ? ` <small>${esc(variant)}</small>` : ''}<br><small>tile ${t}${game.map.riverTile[t] ? ' · river' : ''}</small>`;
  info.classList.remove('hidden');
};

// Debug views (render.ts): normal, height map with contours, water by source.
const VIEWS: DebugView[] = ['normal', 'height', 'water'];
const setView = (m: DebugView) => {
  view.setView(m);
  document.querySelectorAll<HTMLButtonElement>('#views [data-view]').forEach((b) => b.classList.toggle('active', b.dataset['view'] === m));
};
document.querySelectorAll<HTMLButtonElement>('#views [data-view]').forEach((b) => b.addEventListener('click', () => { setView(b.dataset['view'] as DebugView); b.blur(); }));
// Clouds on or off, to see the whole surface.
const cloudsBtn = $('clouds');
const toggleClouds = () => { view.setClouds(!view.clouds); cloudsBtn.classList.toggle('active', view.clouds); cloudsBtn.blur(); };
cloudsBtn.addEventListener('click', toggleClouds);
// The settings menu (shadows, tone mapping).
mountSettings(view);
// In sight (as if every tile were seen by a unit) or explored only (how the
// map looks out of sight).
const sightBtn = $('sight');
const toggleSight = () => {
  const on = !game.visible[0];
  game.visible.fill(on ? 1 : 0);
  view.syncWorld(null);
  sightBtn.classList.toggle('active', on);
  sightBtn.blur();
};
sightBtn.addEventListener('click', toggleSight);
// Units to look at (dev): U drops one of each kind for a few civs round
// where the camera looks, on dry land; M marches every unit a tile; B sets
// them fighting their neighbours.
const UNIT_SAMPLE: UnitKey[] = ['warrior', 'spearman', 'archer', 'horseman', 'swordsman', 'pikeman', 'crossbowman', 'knight', 'scout', 'settler', 'commander'];
const dropUnits = () => {
  const at = view.looking;
  let start = 0;
  game.tiles.forEach((t, i) => { if (t.center.dot(at) > game.tiles[start]!.center.dot(at)) start = i; });
  const seen = new Set<number>(), queue = [start], land: number[] = [];
  while (queue.length && land.length < 2 * UNIT_SAMPLE.length) {
    const t = queue.shift()!;
    if (seen.has(t)) continue;
    seen.add(t);
    if (!game.isWater(t) && !game.units.some((u) => u.tile === t)) land.push(t);
    queue.push(...game.tiles[t]!.neighbors);
  }
  land.forEach((t, i) => game.createUnit(UNIT_SAMPLE[i % UNIT_SAMPLE.length]!, (i + Math.floor(i / UNIT_SAMPLE.length)) % game.players.length, t));
  view.syncWorld(null);
};
const marchUnits = () => {
  for (const u of game.units) {
    const free = game.tiles[u.tile]!.neighbors.filter((n) => !game.isWater(n) && !game.units.some((v) => v.tile === n));
    if (free.length) u.tile = free[Math.floor(Math.random() * free.length)]!;
  }
  view.syncWorld(null);
};
// B: every fighting unit fights a unit next to it (a show: nobody is hurt).
const battle = () => {
  for (const u of game.units) {
    if (unitDef(u.type).atk <= 0) continue;
    const foe = game.tiles[u.tile]!.neighbors.find((n) => game.units.some((v) => v.tile === n && v.owner !== u.owner));
    if (foe !== undefined) view.showBattle(u.id, foe, unitDef(u.type).ranged === true);
  }
};
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === 'u' || e.key === 'U') dropUnits();
  else if (e.key === 'b' || e.key === 'B') battle();
  else if (e.key === 'm' || e.key === 'M') marchUnits();
  else if (e.key === 'j' || e.key === 'J') setView(VIEWS[(VIEWS.indexOf(view.view) + 1) % VIEWS.length]!);
  else if (e.key === 'k' || e.key === 'K') toggleClouds();
  else if (e.key === 'f' || e.key === 'F') toggleSight();
  else if (e.key === 'Enter') generate(Number(seedEl.value) || 1);
});
