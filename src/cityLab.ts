// City Lab (/city_lab.html): look at cities without playing a game. A world
// with ready-made cities of every size, era and terrain (sandbox.ts
// presets), and a builder: found a city on any tile, grow it, set its era
// and focus, place buildings and wonders by hand or by its governor, raise
// walls, damage it, burn its fields, raze it.

import './style.css';
import { Game, type City } from './game.ts';
import { GlobeRenderer, type DebugView, type TileMark } from './render.ts';
import { MAP_SIZES, tileCount, type MapSizeKey } from './rules.ts';
import { terrainName } from './terrain.ts';
import {
  USE, SLOTS, BUILDINGS, BUILDING_KEYS, WONDERS, WONDER_KEYS, FOCUSES, ERAS, FAMILIES, IMPROVEMENTS,
  quarterOf, familyOf, improvementFor, type BuildingKey, type WonderKey, type GrowthKind, type EraIndex, type FamilyKey, type FocusKey, type Output,
} from './cities.ts';
import { buildPresets, foundCity, grow, shrink, setEra, addBuilding, addWonder } from './sandbox.ts';

const isMapSize = (s: string): s is MapSizeKey => s in MAP_SIZES;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- the world ----------

const params = new URLSearchParams(location.search);
const pSize = params.get('size') ?? '';
const size: MapSizeKey = isMapSize(pSize) ? pSize : 'medium';
const seed = Number(params.get('seed')) || 7;

const sizeEl = $<HTMLSelectElement>('size'), seedEl = $<HTMLInputElement>('seed');
sizeEl.innerHTML = (Object.keys(MAP_SIZES) as MapSizeKey[])
  .map((k) => `<option value="${k}"${k === size ? ' selected' : ''}>${MAP_SIZES[k].name} (${tileCount(MAP_SIZES[k].n).toLocaleString()} tiles)</option>`).join('');
seedEl.value = String(seed);
const rebuild = () => {
  const url = new URL(location.href);
  url.searchParams.set('size', sizeEl.value);
  url.searchParams.set('seed', String(Number(seedEl.value) || 1));
  location.href = url.toString();
};
$('rebuild').addEventListener('click', rebuild);
seedEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') rebuild(); });

const game = new Game({ size, seed });
game.units.length = 0;
game.explored.fill(1);
game.visible.fill(1);
const built = buildPresets(game);
const view = new GlobeRenderer($<HTMLCanvasElement>('c'), game);
view.setClouds(false);
if (import.meta.env.DEV) Object.assign(window, { __globe: { game, view } });

// ---------- state ----------

type Mode =
  | { kind: 'grow'; growth: GrowthKind }
  | { kind: 'building'; key: BuildingKey }
  | { kind: 'wonder'; key: WonderKey }
  | { kind: 'pillage' }
  | { kind: 'demolish' }
  | null;

let selTile = -1;
let city: City | null = null;
let mode: Mode = null;
let hover = -1;
let lens = false;
let founder = 0;

const FAMILY_COLOR: Record<FamilyKey, number> = {
  campus: 0x5c9ded, market: 0xf2c94c, forge: 0xe07b39, harbor: 0x2bb5b5, temple: 0xf4f1de, theater: 0xb07cd8, garrison: 0xc0392b,
};
const MODE_COLOR = { grow: 0x8ce99a, building: 0x9cc8ff, wonder: 0xf5d76e, pillage: 0xff8a5c, demolish: 0xff6b6b } as const;

// Tiles a mode can act on.
function modeTiles(): number[] {
  if (!city || !mode) return [];
  const c = city;
  switch (mode.kind) {
    case 'grow': { const k = mode.growth; return game.growthOptions(c).filter((o) => o.kind === k).map((o) => o.tile); }
    case 'building': return game.buildingSpots(c, mode.key);
    case 'wonder': return game.wonderSpots(c, mode.key);
    case 'pillage': return game.cityTiles(c, USE.rural);
    case 'demolish': return [c.tile, ...game.cityTiles(c, USE.urban)].filter((t) => game.slotKeys(t).some((k) => k !== null));
  }
}

function marks(): TileMark[] {
  const out: TileMark[] = [];
  if (lens) {
    for (const c of game.cities) {
      for (const t of [c.tile, ...game.cityTiles(c, USE.urban)]) {
        const keys = game.slotKeys(t);
        const q = quarterOf(keys);
        const f = q ?? keys.map((k) => (k ? familyOf(k) : null)).find((x) => x !== null) ?? null;
        if (f) out.push({ tile: t, color: FAMILY_COLOR[f], opacity: q ? 0.9 : 0.45 });
      }
    }
  }
  if (mode) for (const t of modeTiles()) out.push({ tile: t, color: MODE_COLOR[mode.kind], opacity: t === hover ? 0.95 : 0.5 });
  return out;
}

function refresh(): void {
  // Founding a city recomputes what is in sight; the lab sees everything.
  game.explored.fill(1);
  game.visible.fill(1);
  view.syncWorld(null);
  overlay();
  renderPresets();
  renderBuilder();
  renderTile();
  $('hint').textContent = `${game.cities.length} cities · ${game.wondersBuilt.size} wonders · seed ${seed}`;
}

function overlay(): void {
  const sel = city ? { kind: 'city' as const, city } : selTile >= 0 ? { kind: 'tile' as const, tile: selTile } : null;
  view.syncOverlay(sel, hover, null, marks());
}

// ---------- panels ----------

function renderPresets(): void {
  $('presets').innerHTML = `<h3>Ready-made cities</h3>` + built.map((b, i) => {
    const active = city !== null && b.city === city;
    return `<button class="preset${active ? ' active' : ''}" data-preset="${i}"><b>${esc(b.preset.name)}</b><small>${esc(b.preset.desc)}</small></button>`;
  }).join('');
}

const yieldsStr = (o: Output) => [`🌾${o.food}`, `⚒${o.prod}`, `●${o.gold}`, o.science ? `⚗${o.science}` : '', o.culture ? `♪${o.culture}` : '', o.faith ? `✦${o.faith}` : ''].filter(Boolean).join(' ');
const btn = (attrs: string, label: string, opts: { active?: boolean; disabled?: boolean; title?: string } = {}) =>
  `<button ${attrs} class="${opts.active ? 'active' : ''}" ${opts.disabled ? 'disabled' : ''} title="${esc(opts.title ?? '')}">${label}</button>`;

function renderBuilder(): void {
  const box = $('builder');
  if (!city) {
    if (selTile < 0) { box.innerHTML = '<h3>Builder</h3><div class="desc">Click a tile to found a city there, or click a city to change it. Pick a ready-made city above to fly to it.</div>'; return; }
    const ok = game.canFoundCity(selTile, founder);
    const civs = game.players.map((p, i) => `<option value="${i}"${i === founder ? ' selected' : ''}>${esc(p.name)} (${ERAS[p.era].name})</option>`).join('');
    box.innerHTML = `<h3>Builder</h3>
      <div class="desc">${esc(terrainName(game.terrainAt(selTile)))}</div>
      <div class="row"><span>Civ</span><select id="founder">${civs}</select></div>
      <div class="row">${btn('data-lab="found"', 'Found a city here', { disabled: !ok, title: ok ? '' : 'Too close to a city, or terrain no city can stand on' })}</div>`;
    return;
  }
  const c = city, p = game.players[c.owner]!;
  const y = game.cityYields(c);
  const urban = game.cityTiles(c, USE.urban);
  const spec = urban.reduce((n, t) => n + game.specialists[t]!, 0);
  let modeHtml = '';
  if (mode) {
    const what = mode.kind === 'grow' ? `Click a tile for a ${mode.growth} citizen` : mode.kind === 'building' ? `Click a tile for the ${BUILDINGS[mode.key].name}`
      : mode.kind === 'wonder' ? `Click a tile for the ${WONDERS[mode.key].name}` : mode.kind === 'pillage' ? 'Click rural tiles to burn or mend them' : 'Click a built tile to clear its slots';
    const gov = mode.kind === 'grow' || mode.kind === 'building' || mode.kind === 'wonder';
    modeHtml = `<div class="mode">${what} <div class="row">${gov ? btn('data-lab="governor"', "Governor's pick") : ''}${btn('data-lab="cancel"', 'Done <kbd>Esc</kbd>')}</div></div>`;
  }
  const eras = ERAS.map((e, i) => btn(`data-lab="era" data-v="${i}"`, e.name, { active: p.era === i })).join('');
  const focuses = (Object.keys(FOCUSES) as FocusKey[]).map((k) => btn(`data-lab="focus" data-v="${k}"`, FOCUSES[k].name, { active: c.focus === k })).join('');
  const kinds = (['rural', 'urban', 'specialist'] as const).map((k) => btn(`data-lab="place" data-v="${k}"`, k, { active: mode?.kind === 'grow' && mode.growth === k, disabled: !game.growthOptions(c).some((o) => o.kind === k) })).join('');
  const blds = BUILDING_KEYS.filter((k) => k !== 'walls').map((k) => {
    const has = c.buildings.has(k);
    const can = game.buildingSpots(c, k).length > 0 || BUILDINGS[k].role === 'harbor';
    const f = familyOf(k);
    return btn(`data-lab="building" data-v="${k}"`, BUILDINGS[k].name, { active: has || (mode?.kind === 'building' && mode.key === k), disabled: !has && !can, title: `${f ? FAMILIES[f].name : 'Civic'} · ${has ? 'click to remove' : BUILDINGS[k].desc}` });
  }).join('');
  const wonders = WONDER_KEYS.map((k) => {
    const here = game.wondersBuilt.has(k) && game.tileCity[game.wondersBuilt.get(k)!] === c.id;
    const elsewhere = game.wondersBuilt.has(k) && !here;
    return btn(`data-lab="wonder" data-v="${k}"`, WONDERS[k].name, { active: here, disabled: elsewhere || (!here && !game.wonderSpots(c, k).length), title: elsewhere ? 'Built elsewhere (once in the world)' : WONDERS[k].desc });
  }).join('');
  const maxHp = game.cityMaxHp(c);
  box.innerHTML = `<h3>${esc(c.name)} <small>size ${c.pop} · ${esc(p.name)} · ${ERAS[p.era].name}</small></h3>
    <div class="desc">${yieldsStr(y)} · ${urban.length} urban · ${game.cityTiles(c, USE.rural).length} rural${spec ? ` · ${spec} specialists` : ''}</div>
    ${modeHtml}
    <div class="row"><span>Citizens</span>${btn('data-lab="pop" data-v="-1"', '−1', { disabled: c.pop <= 1 })}${btn('data-lab="pop" data-v="1"', '+1')}${btn('data-lab="pop" data-v="5"', '+5')}</div>
    <div class="row"><span>Place</span>${kinds}</div>
    <div class="row"><span>Era</span>${eras}</div>
    <div class="row"><span>Focus</span>${focuses}</div>
    <hr><div class="row"><span>Buildings</span>${blds}</div>
    <div class="row"><span>Walls</span>${btn('data-lab="walls"', c.buildings.has('walls') ? 'Walls up' : 'No walls', { active: c.buildings.has('walls') })}</div>
    <div class="row"><span>Wonders</span>${wonders}</div>
    <hr><div class="row"><span>HP</span><input type="range" id="hp" min="0" max="${maxHp}" value="${c.hp}"> <small>${c.hp}/${maxHp}</small></div>
    <div class="row"><span>Tools</span>${btn('data-lab="pillage"', 'Burn fields', { active: mode?.kind === 'pillage' })}${btn('data-lab="demolish"', 'Demolish', { active: mode?.kind === 'demolish' })}${btn('data-lab="raze"', 'Raze to ruins')}</div>`;
}

function renderTile(): void {
  const box = $('tileinfo');
  const t = hover;
  if (t < 0) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const lines = [`<b>${esc(terrainName(game.terrainAt(t)))}</b> <small>tile ${t}${game.map.riverTile[t] ? ' · river' : ''}</small>`];
  const c = game.cityById.get(game.tileCity[t]!);
  if (c) {
    const u = game.use[t];
    const k = improvementFor(game.terrainAt(t));
    const keys = game.slotKeys(t);
    const q = quarterOf(keys);
    const w = game.wonderOn(t);
    const what = w ? `★ ${WONDERS[w].name}` : u === USE.center ? 'City center' : u === USE.urban ? (q ? `${FAMILIES[q].name} quarter` : 'Urban')
      : u === USE.rural && k ? `${IMPROVEMENTS[k].name}${game.pillaged[t] ? ' (burnt)' : ''}` : 'Wild';
    lines.push(`${what} of ${esc(c.name)} ${u !== USE.wild ? `<small>${yieldsStr(game.tileOutput(t))}</small>` : ''}`);
    const names = keys.filter((x): x is BuildingKey => x !== null).map((x) => BUILDINGS[x].name);
    if (names.length) lines.push(`<small>${names.join(', ')}</small>`);
  } else if (game.ruins[t]) lines.push('Ruins');
  if (mode && city && modeTiles().includes(t)) {
    if (mode.kind === 'building') lines.push(`<span class="warn">${BUILDINGS[mode.key].name} here: ${yieldsStr(game.buildingGain(city, mode.key, t))}</span>`);
    else if (mode.kind === 'grow') { const o = game.growthOptions(city).find((x) => x.tile === t && x.kind === (mode as { growth: GrowthKind }).growth); if (o) lines.push(`<span class="warn">${o.kind} here: ${yieldsStr(game.optionYield(o))}</span>`); }
    else lines.push('<span class="warn">Click to apply</span>');
  }
  box.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
}

// ---------- actions ----------

function select(t: number): void {
  selTile = t;
  city = game.cityById.get(game.tileCity[t]!) ?? null;
  mode = null;
}

function apply(t: number): boolean {
  if (!city || !mode || !modeTiles().includes(t)) return false;
  const c = city;
  switch (mode.kind) {
    case 'grow': {
      const k = mode.growth;
      const o = game.growthOptions(c).find((x) => x.tile === t && x.kind === k);
      if (o) { c.growth = 1; game.placeGrowth(c, o); }
      if (!game.growthOptions(c).some((x) => x.kind === k)) mode = null;
      break;
    }
    case 'building': addBuilding(game, c, mode.key, t); mode = null; break;
    case 'wonder': addWonder(game, c, mode.key, t); mode = null; break;
    case 'pillage': game.pillaged[t] = game.pillaged[t] ? 0 : 3; game.useVersion++; break;
    case 'demolish': for (let k = 0; k < SLOTS; k++) game.demolish(t, k); break;
  }
  return true;
}

function governorPick(): void {
  if (!city || !mode) return;
  const c = city;
  if (mode.kind === 'grow') grow(game, c, 1);
  else if (mode.kind === 'building') addBuilding(game, c, mode.key);
  else if (mode.kind === 'wonder') addWonder(game, c, mode.key);
  mode = null;
}

// Removes building k from the city.
function removeBuilding(c: City, k: BuildingKey): void {
  for (const t of [c.tile, ...game.cityTiles(c, USE.urban)]) {
    game.slotKeys(t).forEach((x, slot) => { if (x === k) game.demolish(t, slot); });
  }
}

document.body.addEventListener('click', (e) => {
  const el = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-lab],[data-preset]') : null;
  if (!el) return;
  if (el.dataset['preset'] !== undefined) {
    const b = built[Number(el.dataset['preset'])]!;
    select(b.tile);
    view.lookAt(b.tile, 1.2);
    refresh();
    return;
  }
  const v = el.dataset['v'] ?? '';
  const c = city;
  switch (el.dataset['lab']) {
    case 'found': {
      const nc = selTile >= 0 ? foundCity(game, selTile, founder) : null;
      if (nc) { city = nc; game.useVersion++; }
      break;
    }
    case 'pop': if (c) { const n = Number(v); if (n > 0) grow(game, c, n); else shrink(game, c, -n); } break;
    case 'place': if (c) mode = mode?.kind === 'grow' && mode.growth === v ? null : { kind: 'grow', growth: v as GrowthKind }; break;
    case 'era': if (c) setEra(game, c.owner, Number(v) as EraIndex); break;
    case 'focus': if (c) c.focus = v as FocusKey; break;
    case 'building': {
      if (!c) break;
      const k = v as BuildingKey;
      if (c.buildings.has(k)) removeBuilding(c, k);
      else if (game.buildingSpots(c, k).length) mode = { kind: 'building', key: k };
      else addBuilding(game, c, k); // a harbor building: develops the water first
      break;
    }
    case 'walls': if (c) { if (c.buildings.has('walls')) c.buildings.delete('walls'); else c.buildings.add('walls'); c.hp = Math.min(c.hp, game.cityMaxHp(c)); game.useVersion++; } break;
    case 'wonder': if (c) mode = { kind: 'wonder', key: v as WonderKey }; break;
    case 'pillage': mode = mode?.kind === 'pillage' ? null : { kind: 'pillage' }; break;
    case 'demolish': mode = mode?.kind === 'demolish' ? null : { kind: 'demolish' }; break;
    case 'raze': if (c) { game.destroyCity(c); city = null; mode = null; } break;
    case 'governor': governorPick(); break;
    case 'cancel': mode = null; break;
    default: return;
  }
  (el as HTMLButtonElement).blur?.();
  refresh();
});
document.body.addEventListener('input', (e) => {
  if (!(e.target instanceof HTMLInputElement) || e.target.id !== 'hp' || !city) return;
  city.hp = Number(e.target.value);
  view.syncWorld(null);
  const small = e.target.parentElement?.querySelector('small');
  if (small) small.textContent = `${city.hp}/${game.cityMaxHp(city)}`;
});
document.body.addEventListener('change', (e) => {
  if (e.target instanceof HTMLSelectElement && e.target.id === 'founder') { founder = Number(e.target.value); renderBuilder(); }
});

view.onTileClick = (t, button) => {
  if (button !== 0) return;
  if (!apply(t)) select(t);
  refresh();
};
view.onTileHover = (t) => { hover = t; overlay(); renderTile(); };

// Debug views, clouds, quarters lens.
const VIEWS: DebugView[] = ['normal', 'height', 'water'];
const setView = (m: DebugView) => {
  view.setView(m);
  document.querySelectorAll<HTMLButtonElement>('#views [data-view]').forEach((b) => b.classList.toggle('active', b.dataset['view'] === m));
};
document.querySelectorAll<HTMLButtonElement>('#views [data-view]').forEach((b) => b.addEventListener('click', () => { setView(b.dataset['view'] as DebugView); b.blur(); }));
const toggleClouds = () => { view.setClouds(!view.clouds); $('clouds').classList.toggle('active', view.clouds); };
const toggleLens = () => { lens = !lens; $('lens').classList.toggle('active', lens); overlay(); };
$('clouds').addEventListener('click', (e) => { toggleClouds(); (e.currentTarget as HTMLElement).blur(); });
$('lens').addEventListener('click', (e) => { toggleLens(); (e.currentTarget as HTMLElement).blur(); });
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === 'j' || e.key === 'J') setView(VIEWS[(VIEWS.indexOf(view.view) + 1) % VIEWS.length]!);
  else if (e.key === 'k' || e.key === 'K') toggleClouds();
  else if (e.key === 'l' || e.key === 'L') toggleLens();
  else if (e.key === 'Escape') { if (mode) mode = null; else { city = null; selTile = -1; } refresh(); }
});

// Start at the first ready-made city.
const first = built.find((b) => b.city) ?? built[0];
if (first) { select(first.tile); view.lookAt(first.tile, 1.25); }
refresh();
