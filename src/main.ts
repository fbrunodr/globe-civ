import './game.css';
import { Game, HUMAN, type City, type Unit } from './game.ts';
import { loadSettings, saveSettings, RESOLUTION_NAME, isResolution } from './settingsMenu.ts';
import { Minimap } from './minimap.ts';
import { icon, type IconKey } from './icons.ts';
import { TECH_KEYS } from './techs.ts';
import { POLITICS_KEYS } from './politics.ts';
import { TRAIT_KEYS } from './identity.ts';
import { LEVELS, DEFAULT_LEVEL } from './aiPolicy.ts';
import { GlobeRenderer, RESOLUTIONS, type DebugView, type Selection, type TileMark } from './render.ts';
import { UI, assertNever, attackInput, modeOf, wonderPicked, tip, type Action, type Placing, type NextStep } from './ui.ts';
import { Sheets } from './sheets.ts';
import { gameLogId } from './gameLog.ts';
import { MAP_SCRIPTS, MAP_SIZES, isMapScript, tileCount, unitDef, domainOf, isWonder, type MapScriptKey, type MapSizeKey } from './rules.ts';
import { canShoot } from './unitClasses.ts';

const isMapSize = (s: string): s is MapSizeKey => s in MAP_SIZES;

function showStartScreen(): void {
  const menu = document.getElementById('start')!;
  const params = new URLSearchParams(location.search);
  const sizes = (Object.keys(MAP_SIZES) as MapSizeKey[]).map((k) => {
    const s = MAP_SIZES[k];
    return `<button data-size="${k}" class="${k === 'small' ? 'active' : ''}">
      <b>${s.name}</b><span>${tileCount(s.n).toLocaleString()} tiles · ${s.players} civs</span><small>≈ ${s.civEquivalent}</small></button>`;
  }).join('');
  const scripts = (Object.keys(MAP_SCRIPTS) as MapScriptKey[])
    .map((k) => `<button data-script="${k}">${MAP_SCRIPTS[k].name}</button>`).join('');
  menu.innerHTML = `<div><div class="title"><h1>Globe Civ</h1><p>An empire to stand the test of time, on a world that is round</p></div>
  <div class="card">
    <span class="label">World</span>
    <div class="sizes">${sizes}</div>
    <span class="label">Lands</span>
    <div class="scripts">${scripts}</div>
    <span class="label">Rivals <small>· how well they decide: no level is given, or spared, anything</small></span>
    <div class="scripts">${LEVELS.map((l, i) => `<button data-level="${i}">${l.name}</button>`).join('')}</div>
    <span class="label">Seed <small>· the same seed makes the same world</small></span>
    <div class="seedrow"><input id="seed" type="text" inputmode="numeric" value="${params.get('seed') ?? Math.floor(Math.random() * 1e6)}"><button id="dice">Another</button></div>
    <button id="go" class="primary">Begin</button>
    <p class="tools">Workshop: <a href="/gallery.html">Gallery</a> · <a href="/buildings.html">Buildings</a> · <a href="/units.html">Units</a> · <a href="/wonders.html">Wonders</a> · <a href="/city_lab.html">City lab</a> · <a href="/city_lab.html?stress">Stress test</a> · <a href="/city_samples.html">City samples</a> · <a href="/world_view.html">World view</a> · <a href="/map_editor.html">Map editor</a></p>
  </div></div>`;
  let size: MapSizeKey = 'small', script: MapScriptKey = 'continents', level = DEFAULT_LEVEL;
  const pLevel = Number(params.get('level') ?? NaN);
  if (Number.isInteger(pLevel) && pLevel >= 0 && pLevel < LEVELS.length) level = pLevel;
  const pSize = params.get('size'), pMap = params.get('map');
  if (pSize && isMapSize(pSize)) size = pSize;
  if (pMap && isMapScript(pMap)) script = pMap;
  const mark = () => {
    menu.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.classList.toggle('active', b.dataset['size'] === size));
    menu.querySelectorAll<HTMLElement>('[data-script]').forEach((b) => b.classList.toggle('active', b.dataset['script'] === script));
    menu.querySelectorAll<HTMLElement>('[data-level]').forEach((b) => b.classList.toggle('active', Number(b.dataset['level']) === level));
  };
  menu.querySelectorAll<HTMLElement>('[data-level]').forEach((b) => b.addEventListener('click', () => { level = Number(b.dataset['level']); mark(); }));
  mark();
  menu.querySelectorAll<HTMLElement>('[data-script]').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset['script'] ?? '';
    if (isMapScript(s)) { script = s; mark(); }
  }));
  menu.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset['size'] ?? '';
    if (isMapSize(s)) { size = s; mark(); }
  }));
  const seedBox = document.getElementById('seed') as HTMLInputElement;
  document.getElementById('dice')!.addEventListener('click', () => { seedBox.value = String(Math.floor(Math.random() * 1e6)); });
  document.getElementById('go')!.addEventListener('click', () => {
    const seed = Number(seedBox.value) || 1;
    // (The world takes a moment to make: said so first, then made.)
    menu.innerHTML = '<div class="loading">Shaping the world…</div>';
    setTimeout(() => { startGame(size, seed, script, level); menu.remove(); }, 40);
  });
}

function startGame(sizeKey: MapSizeKey, seed: number, script: MapScriptKey, level: number): void {
  const game = new Game({ size: sizeKey, seed, script, level });
  const view = new GlobeRenderer(document.getElementById('c') as HTMLCanvasElement, game);
  const ui = new UI(game, act);
  // (Dev: the game to look at from the console: select a unit, redraw.)
  if (import.meta.env.DEV) Object.assign(window, { __game: { game, view, refresh: () => refresh(), select: (u: Unit) => { sel = { kind: 'unit', unit: u }; refresh(); }, selectCity: (c: City) => { selectCity(c); refresh(); } } });
  // The record of the game (gameLog.ts): sent to the dev server each turn
  // (logs/<id>.jsonl), downloadable from the Log sheet.
  const logId = gameLogId(sizeKey, seed);
  let logged = 0;
  const flushLog = () => {
    if (!import.meta.env.DEV || logged >= game.events.length) return;
    const lines = game.events.slice(logged).map((e) => JSON.stringify(e)).join('\n') + '\n';
    logged = game.events.length;
    void fetch(`/__log?game=${encodeURIComponent(logId)}`, { method: 'POST', body: lines }).catch(() => { /* (no dev server: kept in memory) */ });
  };
  const downloadLog = () => {
    const blob = new Blob([game.events.map((e) => JSON.stringify(e)).join('\n') + '\n'], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${logId}.jsonl`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const sheets = new Sheets(game, () => refresh(), downloadLog);
  view.onTileHover = onHover;
  view.onTileClick = onClick;
  // Dev-only handle for profiling from the browser console or test scripts.
  if (import.meta.env.DEV) Object.assign(window, { __globe: { game, view } });
  const minimap = new Minimap(game, view, document.getElementById('minimap')!);

  // The lenses (over the minimap): the hex grid, the tiles' yields, the
  // resources' medallions, the strategic view (the land as a flat map).
  const lensBox = document.getElementById('lenses')!;
  const LENSES: readonly { key: string; icon: IconKey; name: string; sub: string; on: () => boolean; toggle: () => void }[] = [
    { key: 'grid', icon: 'grid', name: 'Hex grid', sub: 'H', on: () => view.gridOn, toggle: () => view.setGrid(!view.gridOn) },
    { key: 'yields', icon: 'food', name: 'Yields', sub: 'Y · what each tile gives, from close by', on: () => view.yieldsOn, toggle: () => view.setYields(!view.yieldsOn) },
    { key: 'resources', icon: 'gem', name: 'Resources', sub: 'Their medallions on the map, from close by', on: () => view.resourcesOn, toggle: () => view.setResourceIcons(!view.resourcesOn) },
    { key: 'strategic', icon: 'map', name: 'Strategic view', sub: 'M · the land as a flat map', on: () => view.view === 'strategic', toggle: () => setView(view.view === 'strategic' ? 'normal' : 'strategic') },
  ];
  const drawLenses = () => {
    const html = LENSES.map((l) => `<button data-lens="${l.key}" class="${l.on() ? 'active' : ''}" ${tip(l.name, l.sub)}>${icon(l.icon)}</button>`).join('');
    if (lensBox.dataset['html'] !== html) { lensBox.dataset['html'] = html; lensBox.innerHTML = html; }
  };
  lensBox.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-lens]');
    LENSES.find((l) => l.key === b?.dataset['lens'])?.toggle();
    drawLenses();
  });

  // Views of the land (render.ts): the game's, the strategic one, and the
  // debug ones (height map with contours, water by source, the painting's
  // tiles), from the menu or with J.
  const VIEWS: DebugView[] = ['normal', 'height', 'water', 'paint'];
  const VIEW_NAME: Record<DebugView, string> = { normal: 'The world', strategic: 'Strategic', height: 'Debug: heights', water: 'Debug: water', paint: 'Debug: painted tiles' };
  const setView = (m: DebugView) => { view.setView(m); drawLenses(); };
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'j') setView(VIEWS[(VIEWS.indexOf(view.view) + 1) % VIEWS.length]!);
    else if (k === 'm') setView(view.view === 'strategic' ? 'normal' : 'strategic');
    else if (k === 'y') view.setYields(!view.yieldsOn);
    // (H is the renderer's own: the buttons follow.)
    setTimeout(drawLenses);
  });

  // The menu (the top bar's button, or Esc with nothing selected): graphics
  // (remembered in this browser: settingsMenu.ts), the interface, the keys.
  const settings = loadSettings(view);
  view.setShadows(settings.shadows);
  view.setToneMapping(settings.toneMapping);
  view.setResolution(settings.resolution);
  const menuBox = document.getElementById('menu')!, fpsBox = document.getElementById('fps')!;
  const pref = (k: string): boolean => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
  const setPref = (k: string, on: boolean) => { try { localStorage.setItem(k, on ? '1' : '0'); } catch { /* (not remembered) */ } };
  fpsBox.classList.toggle('hidden', !pref('civ.fps'));
  const KEYS: readonly [string, string][] = [
    ['Drag', 'move across the globe'], ['Wheel', 'zoom (the view tilts as it nears the ground)'],
    ['Right-drag', 'turn and tilt'], ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', 'move'],
    ['<kbd>Q</kbd><kbd>E</kbd>', 'turn'], ['<kbd>T</kbd><kbd>G</kbd> · <kbd>Z</kbd><kbd>X</kbd>', 'tilt · zoom'],
    ['Click', 'select (again: the next thing on the tile)'], ['Right-click', 'move or attack (<kbd>Shift</kbd>: the other way of attacking)'],
    ['<kbd>Enter</kbd>', 'what needs doing next, then end the turn'], ['<kbd>Shift</kbd><kbd>Enter</kbd>', 'end the turn now'],
    ['<kbd>N</kbd> <kbd>Tab</kbd>', 'next unit'], ['<kbd>C</kbd>', 'centre on the selection'],
    ['<kbd>B</kbd>', 'found a city'], ['<kbd>I</kbd> <kbd>L</kbd>', 'a worker: improve the land · lay a road'],
    ['<kbd>F</kbd>', 'fortify'], ['<kbd>Space</kbd>', 'skip the unit\'s turn'],
    ['<kbd>P</kbd>', 'pillage'], ['<kbd>R</kbd> <kbd>U</kbd>', 'a commander: rally · deploy'],
    ['<kbd>H</kbd> <kbd>Y</kbd> <kbd>M</kbd>', 'hex grid · yields · strategic view'], ['<kbd>V</kbd>', 'walk on the ground'],
    ['<kbd>Esc</kbd>', 'close, cancel, deselect; then this menu'], ['<kbd>J</kbd>', 'debug views of the land'],
  ];
  const openMenu = (on: boolean) => {
    menuBox.classList.toggle('hidden', !on);
    if (!on) return;
    menuBox.innerHTML = `<div class="card"><h2>Globe Civ</h2>
      <span class="label">Graphics</span>
      <div class="opts">
        <label class="opt">Shadows <input type="checkbox" data-set="shadows" ${settings.shadows ? 'checked' : ''}></label>
        <label class="opt">Tone mapping <input type="checkbox" data-set="tone" ${settings.toneMapping ? 'checked' : ''}></label>
        <label class="opt">Resolution <select data-set="res">${RESOLUTIONS.map((r) => `<option value="${r}" ${r === settings.resolution ? 'selected' : ''}>${RESOLUTION_NAME[r]}</option>`).join('')}</select></label>
        <label class="opt">Clouds <input type="checkbox" data-set="clouds" ${view.clouds ? 'checked' : ''}></label>
      </div>
      <span class="label">Interface</span>
      <div class="opts">
        <label class="opt">Frame rate counter <input type="checkbox" data-set="fps" ${fpsBox.classList.contains('hidden') ? '' : 'checked'}></label>
        <label class="opt">View of the land <select data-set="view">${(Object.keys(VIEW_NAME) as DebugView[]).map((v) => `<option value="${v}" ${v === view.view ? 'selected' : ''}>${VIEW_NAME[v]}</option>`).join('')}</select></label>
      </div>
      <span class="label">Controls</span>
      <div class="keys">${KEYS.map(([k, what]) => `<span>${k}</span><span>${what}</span>`).join('')}</div>
      <div class="foot"><button data-menu="new" class="danger">Leave for a new game</button><button data-menu="close" class="primary">Back to the game</button></div></div>`;
  };
  document.getElementById('menuBtn')!.addEventListener('click', () => openMenu(menuBox.classList.contains('hidden')));
  menuBox.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === menuBox || t.dataset['menu'] === 'close') openMenu(false);
    else if (t.dataset['menu'] === 'new') location.reload();
  });
  menuBox.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement, on = t instanceof HTMLInputElement && t.checked;
    switch (t.dataset['set']) {
      case 'shadows': settings.shadows = on; view.setShadows(on); break;
      case 'tone': settings.toneMapping = on; view.setToneMapping(on); break;
      case 'res': { const r = Number(t.value); if (isResolution(r)) { settings.resolution = r; view.setResolution(r); } break; }
      case 'clouds': view.setClouds(on); break;
      case 'fps': fpsBox.classList.toggle('hidden', !on); setPref('civ.fps', on); break;
      case 'view': setView(t.value as DebugView); break;
    }
    saveSettings(settings);
  });
  document.getElementById('hud')!.classList.remove('hidden');

  let sel: Selection = null;
  let hover = -1;
  // Placement: while the selected city has a citizen to place, the map
  // shows where it can go.
  let placing: Placing = null;
  const placingCity = (): City | null =>
    (sel?.kind === 'city' && sel.city.owner === HUMAN && (sel.city.growth > 0 || wonderPicked(placing) || placing === 'buy') ? sel.city : null);
  const PLACE_COLOR: Record<'rural' | 'wonder' | 'buy', number> = { rural: 0x8ce99a, wonder: 0xf5d76e, buy: 0xd4a72c };
  const REACH_COLOR = 0xe8604a;
  const defaultPlacing = (c: City): Placing =>
    c.owner !== HUMAN ? null : c.growth > 0 ? game.governorPick(c)?.kind ?? null : null;

  // Select a city; if it has something to place, start placing it.
  function selectCity(c: City): void {
    sel = { kind: 'city', city: c };
    placing = defaultPlacing(c);
  }

  // Legal tiles for what is being placed (the governor's pick stands out).
  function marks(): TileMark[] {
    const out: TileMark[] = [];
    // The mountain of the wonder the selected city is building.
    if (sel?.kind === 'city' && sel.city.wonderTile !== null && sel.city.wonderTile !== sel.city.tile && sel.city.owner === HUMAN) out.push({ tile: sel.city.wonderTile, color: PLACE_COLOR.wonder, opacity: 0.6 });
    // The tiles the selected shooter can fire on from where it stands (its enemies there brighter).
    if (sel?.kind === 'unit' && sel.unit.owner === HUMAN && sel.unit.moves > 0 && canShoot(sel.unit.type) && domainOf(unitDef(sel.unit.type)) !== 'air') {
      for (const t of game.fireReach(sel.unit)) out.push({ tile: t, color: REACH_COLOR, opacity: game.isEnemyOccupied(t, HUMAN) ? 0.7 : 0.22 });
    }
    const c = placingCity();
    if (!c || !placing) return out;
    // The tiles it could buy (dimmer when it cannot pay).
    if (placing === 'buy') {
      const pay = game.players[c.owner]!.gold >= game.tilePrice(c);
      for (const t of game.buyableTiles(c)) out.push({ tile: t, color: PLACE_COLOR.buy, opacity: pay ? 0.7 : 0.3 });
      return out;
    }
    const w = wonderPicked(placing);
    if (w) {
      const pick = game.governorWonderSpot(c, w);
      for (const t of game.wonderSpots(c, w)) out.push({ tile: t, color: PLACE_COLOR.wonder, opacity: t === pick ? 0.95 : 0.5 });
      return out;
    }
    const pick = game.governorPick(c);
    for (const o of game.growthOptions(c)) {
      if (o.kind !== 'rural' || placing !== 'rural') continue;
      out.push({ tile: o.tile, color: PLACE_COLOR.rural, opacity: pick?.kind === 'rural' && pick.tile === o.tile ? 0.95 : 0.5 });
    }
    return out;
  }

  // (Units packed in an army march with their commander: no orders of their own.)
  const needsOrders = (u: Unit) => u.owner === HUMAN && u.packedIn === null && u.moves > 0 && !u.fortified && !u.skipped && u.goal == null && u.work === null;

  // Cities told to make wealth: not asked again what to build.
  const wealthy = new Set<number>();
  // What the turn still asks of the player, most pressing first (the big
  // button says it and goes to it); nothing left: the turn's end.
  function nextStep(): { step: NextStep; go: () => void } {
    const p = game.players[HUMAN]!, anyway = '<kbd>Shift</kbd><kbd>Enter</kbd> ends the turn anyway';
    const ask = (label: string, go: () => void) => ({ step: { label, sub: anyway, ready: false }, go });
    if (game.over) return { step: { label: 'Game over', sub: '', ready: true }, go: () => { /* (nothing left to do) */ } };
    if (!p.research && TECH_KEYS.some((k) => !p.techs.has(k))) return ask('Choose research', () => sheets.show('research'));
    if (!p.studying && POLITICS_KEYS.some((k) => !p.politics.has(k))) return ask('Choose politics', () => sheets.show('politics'));
    if (TRAIT_KEYS.some((k) => game.canAdopt(p, k))) return ask('Adopt a trait', () => sheets.show('identity'));
    const grown = game.cities.find((c) => c.owner === HUMAN && c.growth > 0);
    if (grown) return ask('Place a citizen', () => { selectCity(grown); view.focusOn(grown.tile); });
    const idle = game.cities.find((c) => c.owner === HUMAN && !c.building && !wealthy.has(c.id));
    if (idle) return ask('Choose production', () => { selectCity(idle); view.focusOn(idle.tile); });
    if (game.units.some(needsOrders)) return ask('A unit needs orders', () => selectNextUnit());
    return { step: { label: 'End turn', sub: 'Enter', ready: true }, go: () => endTurn() };
  }

  function endTurn(): void {
    ui.newTurn();
    game.endTurn();
    flushLog();
    sel = null;
    // A city that grew asks for its citizen first.
    const grown = game.cities.find((c) => c.owner === HUMAN && c.growth > 0);
    if (grown) { selectCity(grown); view.focusOn(grown.tile); } else selectNextUnit();
  }

  function previewPath(): number[] | null {
    if (sel?.kind !== 'unit' || sel.unit.owner !== HUMAN || hover < 0 || hover === sel.unit.tile) return null;
    const p = game.findPath(sel.unit, hover);
    return p ? [sel.unit.tile, ...p] : null;
  }

  function refresh(): void {
    if (sel?.kind === 'unit' && sel.unit.dead) sel = null;
    if (sel?.kind === 'city' && sel.city.owner !== HUMAN) sel = { kind: 'tile', tile: sel.city.tile };
    const pc = placingCity();
    if (!pc) placing = null;
    else if (wonderPicked(placing) || placing === 'buy') { /* picking a wonder's tile, or tiles to buy */ }
    else if (placing === null) placing = defaultPlacing(pc);
    view.syncWorld(sel);
    view.syncOverlay(sel, hover, previewPath(), marks());
    for (const c of game.cities) if (c.building) wealthy.delete(c.id);
    ui.render(sel, hover, nextStep().step, placing);
    sheets.render();
    minimap.redraw();
    drawLenses();
  }

  function selectNextUnit(): void {
    const list = game.units.filter(needsOrders);
    if (!list.length) { sel = null; return; }
    const cur = sel?.kind === 'unit' ? list.indexOf(sel.unit) : -1;
    const u = list[(cur + 1) % list.length];
    sel = { kind: 'unit', unit: u };
    view.focusOn(u.tile);
  }

  function afterUnitAction(u: Unit): void {
    if (u.dead || u.moves <= 0 || u.fortified || u.skipped) selectNextUnit();
  }

  function act(a: Action): void {
    if (game.over) return;
    const unit = sel?.kind === 'unit' && sel.unit.owner === HUMAN ? sel.unit : null;
    switch (a.type) {
      case 'found':
        if (unit) {
          const city = game.foundCity(unit);
          if (city) selectNextUnit();
        }
        break;
      case 'improve':
        if (unit && game.improve(unit)) afterUnitAction(unit);
        break;
      case 'road':
        if (unit && game.buildRoad(unit)) afterUnitAction(unit);
        break;
      case 'fortify':
        if (unit && !unitDef(unit.type).civilian) { unit.fortified = true; unit.goal = null; afterUnitAction(unit); }
        break;
      case 'wake':
        if (unit) unit.fortified = false;
        break;
      case 'skip':
        if (unit) { unit.skipped = true; afterUnitAction(unit); }
        break;
      case 'pillage':
        if (unit && game.pillage(unit)) afterUnitAction(unit);
        break;
      case 'raze':
        if (sel?.kind === 'city' && sel.city.owner === HUMAN) game.raze(sel.city);
        break;
      case 'upgrade':
        if (unit && game.upgrade(unit)) afterUnitAction(unit);
        break;
      case 'rally':
        if (unit && game.rally(unit) > 0) game.updateVisibility();
        break;
      case 'deploy':
        if (unit && game.deploy(unit) > 0) game.updateVisibility();
        break;
      case 'disband':
        if (unit) { game.removeUnit(unit); game.updateVisibility(); selectNextUnit(); }
        break;
      case 'build': {
        if (sel?.kind !== 'city' || sel.city.owner !== HUMAN) break;
        const c = sel.city;
        if (a.key !== null && isWonder(a.key)) {
          // A wonder starts once its tile is picked (right away if only one fits: the city).
          const spots = game.wonderSpots(c, a.key);
          if (c.building === a.key && c.wonderTile !== null) break;
          if (spots.length === 1) game.startWonder(c, a.key, spots[0]!);
          else if (spots.length > 1) placing = { wonder: a.key };
          break;
        }
        c.building = a.key;
        c.wonderTile = null;
        if (a.key === null) wealthy.add(c.id);
        break;
      }
      case 'placeKind':
        if (placingCity()?.growth) placing = a.kind;
        break;
      case 'specialist': {
        const c = placingCity();
        if (c?.growth) game.placeGrowth(c, { kind: 'specialist', specialist: a.specialist });
        if (c) placing = defaultPlacing(c);
        break;
      }
      case 'governorPlace': {
        const c = placingCity();
        if (c) game.autoPlace(c);
        if (c) placing = defaultPlacing(c);
        break;
      }
      case 'focus':
        if (sel?.kind === 'city' && sel.city.owner === HUMAN) sel.city.focus = a.focus;
        break;
      case 'buyMode':
        if (sel?.kind === 'city' && sel.city.owner === HUMAN) placing = 'buy';
        break;
      case 'buy':
        if (sel?.kind === 'city' && sel.city.owner === HUMAN) game.buy(sel.city, a.currency);
        break;
      case 'endTurn':
        endTurn();
        break;
      case 'next':
        nextStep().go();
        break;
      default:
        assertNever(a);
    }
    refresh();
  }

  function onHover(t: number): void {
    hover = t;
    view.syncOverlay(sel, hover, previewPath(), marks());
    ui.render(sel, hover, nextStep().step, placing);
  }

  function onClick(t: number, button: number): void {
    if (game.over) return;
    if (button === 2) {
      if (sel?.kind === 'unit' && sel.unit.owner === HUMAN && t !== sel.unit.tile) {
        // (Shift held: it attacks the other way, closing in instead of shooting.)
        const u = sel.unit;
        game.goTo(u, t, attackInput.swap && game.isEnemyOccupied(t, u.owner) ? modeOf(game, u, t) : null);
        afterUnitAction(u);
      }
    } else if (button === 0) {
      // Placing: a click on a highlighted tile places the citizen there.
      const c = placingCity();
      const w = wonderPicked(placing);
      if (c && placing === 'buy') {
        // (Buying goes on until Esc, or nothing more can be bought.)
        if (game.buyTile(c, t)) { if (!game.buyableTiles(c).length) placing = defaultPlacing(c); refresh(); return; }
      } else if (c && w) {
        if (game.startWonder(c, w, t)) { placing = defaultPlacing(c); refresh(); return; }
      } else {
        const o = c && placing === 'rural' ? game.growthOptions(c).find((x) => x.kind === 'rural' && x.tile === t) : undefined;
        if (c && o) {
          game.placeGrowth(c, o);
          placing = c.growth > 0 ? placing : null;
          refresh();
          return;
        }
      }
      // Clicking cycles through own units on the tile, then the city.
      const options: Selection[] = game.unitsAt(t).filter((u) => u.owner === HUMAN).map((unit) => ({ kind: 'unit', unit }));
      const city = game.cityByTile.get(t);
      if (city && game.explored[t]) options.push({ kind: 'city', city });
      const idx = options.findIndex((o) =>
        (o?.kind === 'unit' && sel?.kind === 'unit' && o.unit === sel.unit) ||
        (o?.kind === 'city' && sel?.kind === 'city' && o.city === sel.city));
      const next = options.length ? options[(idx + 1) % options.length] : { kind: 'tile' as const, tile: t };
      if (next?.kind === 'city') selectCity(next.city); else sel = next;
    }
    refresh();
  }

  // (Shift swaps a unit's attack: the hint shows which, as it changes.)
  const swap = (on: boolean) => { if (attackInput.swap !== on) { attackInput.swap = on; onHover(hover); } };
  addEventListener('keydown', (e) => { if (e.key === 'Shift') swap(true); });
  addEventListener('keyup', (e) => { if (e.key === 'Shift') swap(false); });
  addEventListener('blur', () => swap(false));
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const keyActions: Record<string, Action> = {
      ' ': { type: 'skip' }, f: { type: 'fortify' }, b: { type: 'found' }, i: { type: 'improve' }, p: { type: 'pillage' },
      r: { type: 'rally' }, u: { type: 'deploy' }, l: { type: 'road' },
    };
    if (e.key === 'Enter') { e.preventDefault(); if (!menuBox.classList.contains('hidden')) openMenu(false); else act({ type: e.shiftKey ? 'endTurn' : 'next' }); return; }
    if (!menuBox.classList.contains('hidden')) { if (e.key === 'Escape') openMenu(false); return; }
    const a = keyActions[e.key];
    if (a) { e.preventDefault(); act(a); return; }
    if (e.key === 'n' || e.key === 'Tab') { e.preventDefault(); selectNextUnit(); refresh(); }
    else if (e.key === 'Escape') {
      // Close a sheet first; then cancel picking a wonder's tile (or buying tiles); otherwise deselect.
      if (sheets.isOpen) sheets.close();
      else if ((wonderPicked(placing) || placing === 'buy') && sel?.kind === 'city') placing = defaultPlacing(sel.city);
      else if (sel) { sel = null; placing = null; }
      else openMenu(true);
      refresh();
    }
    else if (e.key === 'c' && sel && sel.kind !== 'tile') { view.focusOn(sel.kind === 'unit' ? sel.unit.tile : sel.city.tile); }
  });

  // Debug: ?reveal shows the whole map; ?look=<key>[+<key>...] flies to the
  // first tile matching every key (biome, relief or feature), e.g. hotDesert+hills.
  const debug = new URLSearchParams(location.search);
  if (debug.has('reveal')) game.explored.fill(1);
  // A game in progress is never left by accident: a two-finger swipe (the
  // browser's back gesture) is stopped by the page's overscroll rule
  // (style.css); leaving or reloading asks first (?noguard: not, for tests).
  if (!debug.has('noguard')) addEventListener('beforeunload', (e) => { if (!game.over) e.preventDefault(); });
  const lookFor = debug.get('look');

  game.log(`Welcome! ${game.players.length - 1} rival civilizations share this world of ${game.N.toLocaleString()} tiles.`);
  selectNextUnit();
  // Debug: ?turns=N lets the AI play the human's first N turns, governors
  // placing every citizen (to look at a grown empire).
  const autoTurns = Number(debug.get('turns') ?? 0);
  if (autoTurns > 0) {
    const me = game.players[HUMAN]!;
    me.isHuman = false; // the AI's rules for building and placing, for now
    for (const c of game.cities) if (c.owner === HUMAN) c.building = null;
    for (let i = 0; i < autoTurns && !game.over; i++) game.endTurn(); // endTurn runs the AI for every non-human player
    me.isHuman = true;
    const capital = game.cities.find((c) => c.owner === HUMAN);
    sel = null;
    if (capital) view.lookAt(capital.tile, Number(debug.get('dist') ?? 1.35));
  }
  refresh();
  if (lookFor) {
    const keys = lookFor.split(/[+ ]/);
    const t = game.tiles.findIndex((_, i) => keys.every((k) => game.biome[i] === k || game.relief[i] === k || game.feature[i] === k));
    if (t >= 0) {
      game.explored.fill(1);
      for (const x of game.tilesWithin(t, 3)) game.visible[x] = 1;
      refresh();
      view.lookAt(t, Number(debug.get('dist') ?? 1.12));
    }
  }
}

// (A button clicked keeps no focus: Enter and Space are the game's keys, not the last button's.)
document.addEventListener('click', (e) => { if (e.target instanceof Element) e.target.closest('button')?.blur(); });
showStartScreen();
