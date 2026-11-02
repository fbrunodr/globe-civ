// World view (/world_view): a world from a size and a seed, fully revealed
// (in sight, or explored only), with no units, cities or turns. For looking
// at terrain generation and terrain painting.

import { attackStyle, canAttackType, canAssault, canShoot } from './unitClasses.ts';
import './style.css';
import './topbar.ts';
import { Game } from './game.ts';
import { GlobeRenderer, type DebugView } from './render.ts';
import { mountSettings } from './settingsMenu.ts';
import { MAP_SCRIPTS, MAP_SIZES, isMapScript, tileCount, type MapScriptKey, type MapSizeKey, type UnitKey } from './rules.ts';
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
// where the camera looks (Y: modern ones), on dry land; M marches every unit a tile; B sets
// them fighting their neighbours; N stages a melee where the camera looks
// (a foe set beside a fighting unit, both hurt in it), R likewise a volley.
const UNIT_SAMPLE: UnitKey[] = ['warrior', 'spearman', 'archer', 'horseman', 'swordsman', 'pikeman', 'crossbowman', 'knight', 'scout', 'settler', 'commander'];
const MODERN_SAMPLE: UnitKey[] = ['musketman', 'rifleman', 'infantry', 'cavalry', 'cannon', 'artillery', 'tank', 'modernArmor', 'machineGun', 'gatlingGun', 'fieldCannon'];
const dropUnits = (sample = UNIT_SAMPLE) => {
  const at = view.looking;
  let start = 0;
  game.tiles.forEach((t, i) => { if (t.center.dot(at) > game.tiles[start]!.center.dot(at)) start = i; });
  const seen = new Set<number>(), queue = [start], land: number[] = [];
  while (queue.length && land.length < 2 * sample.length) {
    const t = queue.shift()!;
    if (seen.has(t)) continue;
    seen.add(t);
    if (!game.isWater(t) && !game.units.some((u) => u.tile === t)) land.push(t);
    queue.push(...game.tiles[t]!.neighbors);
  }
  land.forEach((t, i) => game.createUnit(sample[i % sample.length]!, (i + Math.floor(i / sample.length)) % game.players.length, t));
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
    if (!canAttackType(u.type)) continue;
    const foe = game.tiles[u.tile]!.neighbors.find((n) => game.units.some((v) => v.tile === n && v.owner !== u.owner));
    const d = foe === undefined ? undefined : game.units.find((v) => v.tile === foe && v.owner !== u.owner);
    const style = d ? attackStyle(u.type, d.type) : null;
    if (foe !== undefined && style) view.showBattle(u.id, foe, style);
  }
};
// N (R): the melee (ranged) unit nearest the camera's look attacks a foe set down beside it (made up: it loses 40 HP, the foe 80; shooting, none and 30).
const stage = (ranged = false) => {
  const at = view.looking, near = (u: { tile: number }) => -game.tiles[u.tile]!.center.dot(at);
  const a = game.units.filter((u) => (ranged ? canShoot(u.type) : canAssault(u.type))).sort((x, y) => near(x) - near(y))[0];
  if (!a) return;
  const d = game.units.filter((u) => u.owner !== a.owner && canAttackType(u.type)).sort((x, y) => near(x) - near(y))[0];
  const spot = game.tiles[a.tile]!.neighbors.find((n) => !game.isWater(n) && !game.units.some((v) => v.tile === n && v !== d));
  const style = d ? attackStyle(a.type, d.type, ranged ? 'ranged' : 'melee') : null;
  if (!d || spot === undefined || !style) return;
  d.tile = spot;
  view.syncWorld(null);
  setTimeout(() => {
    const lost = ranged ? [0, 30] : [40, 80];
    view.showBattle(a.id, d.tile, style, { defender: d.id, attackerHp: a.hp - lost[0]!, defenderHp: d.hp - lost[1]! });
    a.hp -= lost[0]!; d.hp -= lost[1]!;
    view.syncWorld(null);
  }, 600);
};
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === 'u' || e.key === 'U') dropUnits();
  else if (e.key === 'y' || e.key === 'Y') dropUnits(MODERN_SAMPLE);
  else if (e.key === 'b' || e.key === 'B') battle();
  else if (e.key === 'm' || e.key === 'M') marchUnits();
  else if (e.key === 'n' || e.key === 'N') stage();
  else if (e.key === 'r' || e.key === 'R') stage(true);
  else if (e.key === 'j' || e.key === 'J') setView(VIEWS[(VIEWS.indexOf(view.view) + 1) % VIEWS.length]!);
  else if (e.key === 'k' || e.key === 'K') toggleClouds();
  else if (e.key === 'f' || e.key === 'F') toggleSight();
  else if (e.key === 'Enter') generate(Number(seedEl.value) || 1);
});
