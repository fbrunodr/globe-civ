import './style.css';
import { Game, HUMAN, type City, type Unit } from './game.ts';
import { mountSettings } from './settingsMenu.ts';
import { GlobeRenderer, type DebugView, type Selection, type TileMark } from './render.ts';
import { UI, assertNever, wonderPicked, type Action, type Placing } from './ui.ts';
import { Sheets } from './sheets.ts';
import { gameLogId } from './gameLog.ts';
import { MAP_SCRIPTS, MAP_SIZES, isMapScript, tileCount, unitDef, isWonder, type MapScriptKey, type MapSizeKey } from './rules.ts';

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
  menu.innerHTML = `<div class="card">
    <h1>Globe Civ</h1>
    <p>A civilization game on a Goldberg polyhedron: 12 pentagons, the rest hexagons.</p>
    <div class="sizes">${sizes}</div>
    <div class="scripts">Map ${scripts}</div>
    <label>Seed <input id="seed" value="${params.get('seed') ?? Math.floor(Math.random() * 1e6)}"></label>
    <button id="go" class="primary">Start game</button>
    <p class="tools"><small>Tools: <a href="/gallery.html">Gallery</a> · <a href="/buildings.html">Buildings</a> · <a href="/units.html">Units</a> · <a href="/wonders.html">Wonders</a> · <a href="/city_lab.html">City lab</a> · <a href="/city_samples.html">City samples</a> · <a href="/world_view.html">World view</a> · <a href="/map_editor.html">Map editor</a></small></p>
  </div>`;
  let size: MapSizeKey = 'small', script: MapScriptKey = 'continents';
  const pSize = params.get('size'), pMap = params.get('map');
  if (pSize && isMapSize(pSize)) size = pSize;
  if (pMap && isMapScript(pMap)) script = pMap;
  const mark = () => {
    menu.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.classList.toggle('active', b.dataset['size'] === size));
    menu.querySelectorAll<HTMLElement>('[data-script]').forEach((b) => b.classList.toggle('active', b.dataset['script'] === script));
  };
  mark();
  menu.querySelectorAll<HTMLElement>('[data-script]').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset['script'] ?? '';
    if (isMapScript(s)) { script = s; mark(); }
  }));
  menu.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset['size'] ?? '';
    if (isMapSize(s)) { size = s; mark(); }
  }));
  document.getElementById('go')!.addEventListener('click', () => {
    const seed = Number((document.getElementById('seed') as HTMLInputElement).value) || 1;
    menu.remove();
    startGame(size, seed, script);
  });
}

function startGame(sizeKey: MapSizeKey, seed: number, script: MapScriptKey): void {
  const game = new Game({ size: sizeKey, seed, script });
  const view = new GlobeRenderer(document.getElementById('c') as HTMLCanvasElement, game);
  const ui = new UI(game, act);
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
  // The settings menu (shadows, tone mapping).
  mountSettings(view);
  // Dev-only handle for profiling from the browser console or test scripts.
  if (import.meta.env.DEV) Object.assign(window, { __globe: { game, view } });

  // Debug views (render.ts): height map with contours, or water by source with steps in red.
  const viewPanel = document.createElement('div');
  viewPanel.className = 'panel';
  viewPanel.id = 'views';
  viewPanel.innerHTML = `View <button data-view="normal" class="active">Normal</button><button data-view="height">Height</button><button data-view="water">Water</button> <kbd>J</kbd>`;
  const VIEWS: DebugView[] = ['normal', 'height', 'water'];
  const setView = (m: DebugView) => {
    view.setView(m);
    viewPanel.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset['view'] === m));
  };
  viewPanel.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => { setView(b.dataset['view'] as DebugView); b.blur(); }));
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'j' && e.key !== 'J')) return;
    setView(VIEWS[(VIEWS.indexOf(view.view) + 1) % VIEWS.length]!);
  });
  document.getElementById('fps')!.after(viewPanel);
  document.getElementById('hud')!.classList.remove('hidden');

  let sel: Selection = null;
  let hover = -1;
  // Placement: while the selected city has a citizen to place, the map
  // shows where it can go.
  let placing: Placing = null;
  const placingCity = (): City | null =>
    (sel?.kind === 'city' && sel.city.owner === HUMAN && (sel.city.growth > 0 || wonderPicked(placing) || placing === 'buy') ? sel.city : null);
  const PLACE_COLOR: Record<'rural' | 'wonder' | 'buy', number> = { rural: 0x8ce99a, wonder: 0xf5d76e, buy: 0xd4a72c };
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
  const needsOrders = (u: Unit) => u.owner === HUMAN && u.packedIn === null && u.moves > 0 && !u.fortified && !u.skipped && u.goal == null;

  function hint(): string {
    if (game.over) return '';
    const waiting = game.units.filter(needsOrders).length;
    const idle = game.cities.filter((c) => c.owner === HUMAN && !c.building).length;
    const growing = game.cities.filter((c) => c.owner === HUMAN && c.growth > 0).map((c) => c.name);
    const parts: string[] = [];
    if (growing.length) parts.push(`${growing.join(', ')}: place a citizen`);
    if (waiting) parts.push(`${waiting} unit${waiting > 1 ? 's' : ''} need orders`);
    if (idle) parts.push(`${idle} cit${idle > 1 ? 'ies' : 'y'} producing gold`);
    return parts.join(' · ') || 'Press Enter to end turn';
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
    ui.render(sel, hover, hint(), placing);
    sheets.render();
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
      case 'endTurn': {
        game.endTurn();
        flushLog();
        sel = null;
        // A city that grew asks for its citizen first.
        const grown = game.cities.find((c) => c.owner === HUMAN && c.growth > 0);
        if (grown) { selectCity(grown); view.focusOn(grown.tile); } else selectNextUnit();
        break;
      }
      default:
        assertNever(a);
    }
    refresh();
  }

  function onHover(t: number): void {
    hover = t;
    view.syncOverlay(sel, hover, previewPath(), marks());
    ui.render(sel, hover, hint(), placing);
  }

  function onClick(t: number, button: number): void {
    if (game.over) return;
    if (button === 2) {
      if (sel?.kind === 'unit' && sel.unit.owner === HUMAN && t !== sel.unit.tile) {
        const u = sel.unit;
        game.goTo(u, t);
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

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const keyActions: Record<string, Action> = {
      Enter: { type: 'endTurn' }, ' ': { type: 'skip' }, f: { type: 'fortify' }, b: { type: 'found' }, p: { type: 'pillage' },
      r: { type: 'rally' }, u: { type: 'deploy' },
    };
    const a = keyActions[e.key];
    if (a) { e.preventDefault(); act(a); return; }
    if (e.key === 'n' || e.key === 'Tab') { e.preventDefault(); selectNextUnit(); refresh(); }
    else if (e.key === 'Escape') {
      // Close a sheet first; then cancel picking a wonder's tile (or buying tiles); otherwise deselect.
      if (sheets.isOpen) sheets.close();
      else if ((wonderPicked(placing) || placing === 'buy') && sel?.kind === 'city') placing = defaultPlacing(sel.city);
      else { sel = null; placing = null; }
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

showStartScreen();
