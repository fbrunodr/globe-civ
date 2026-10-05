import './style.css';
import { Game, HUMAN, type Unit } from './game.ts';
import { GlobeRenderer, type Selection } from './render.ts';
import { UI, assertNever, type Action } from './ui.ts';
import { MAP_SIZES, tileCount, unitDef, type MapSizeKey } from './rules.ts';

const isMapSize = (s: string): s is MapSizeKey => s in MAP_SIZES;

function showStartScreen(): void {
  const menu = document.getElementById('start')!;
  const params = new URLSearchParams(location.search);
  const sizes = (Object.keys(MAP_SIZES) as MapSizeKey[]).map((k) => {
    const s = MAP_SIZES[k];
    return `<button data-size="${k}" class="${k === 'small' ? 'active' : ''}">
      <b>${s.name}</b><span>${tileCount(s.n).toLocaleString()} tiles · ${s.players} civs</span><small>≈ ${s.civEquivalent}</small></button>`;
  }).join('');
  menu.innerHTML = `<div class="card">
    <h1>Globe Civ</h1>
    <p>A civilization game on a Goldberg polyhedron: 12 pentagons, the rest hexagons.</p>
    <div class="sizes">${sizes}</div>
    <label>Seed <input id="seed" value="${params.get('seed') ?? Math.floor(Math.random() * 1e6)}"></label>
    <button id="go" class="primary">Start game</button>
  </div>`;
  let size: MapSizeKey = 'small';
  const pSize = params.get('size');
  if (pSize && isMapSize(pSize)) size = pSize;
  const mark = () => menu.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.classList.toggle('active', b.dataset['size'] === size));
  mark();
  menu.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset['size'] ?? '';
    if (isMapSize(s)) { size = s; mark(); }
  }));
  document.getElementById('go')!.addEventListener('click', () => {
    const seed = Number((document.getElementById('seed') as HTMLInputElement).value) || 1;
    menu.remove();
    startGame(size, seed);
  });
}

function startGame(sizeKey: MapSizeKey, seed: number): void {
  const game = new Game({ size: sizeKey, seed });
  const view = new GlobeRenderer(document.getElementById('c') as HTMLCanvasElement, game);
  const ui = new UI(game, act);
  view.onTileHover = onHover;
  view.onTileClick = onClick;
  // Dev-only handle for profiling from the browser console or test scripts.
  if (import.meta.env.DEV) Object.assign(window, { __globe: { game, view } });
  document.getElementById('hud')!.classList.remove('hidden');

  let sel: Selection = null;
  let hover = -1;

  const needsOrders = (u: Unit) => u.owner === HUMAN && u.moves > 0 && !u.fortified && !u.skipped && u.goal == null;

  function hint(): string {
    if (game.over) return '';
    const waiting = game.units.filter(needsOrders).length;
    const idle = game.cities.filter((c) => c.owner === HUMAN && !c.building).length;
    const parts: string[] = [];
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
    view.syncWorld(sel);
    view.syncOverlay(sel, hover, previewPath());
    ui.render(sel, hover, hint());
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
      case 'disband':
        if (unit) { game.removeUnit(unit); game.updateVisibility(); selectNextUnit(); }
        break;
      case 'build':
        if (sel?.kind === 'city' && sel.city.owner === HUMAN) sel.city.building = a.key;
        break;
      case 'endTurn':
        game.endTurn();
        sel = null;
        selectNextUnit();
        break;
      default:
        assertNever(a);
    }
    refresh();
  }

  function onHover(t: number): void {
    hover = t;
    view.syncOverlay(sel, hover, previewPath());
    ui.render(sel, hover, hint());
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
      // Clicking cycles through own units on the tile, then the city.
      const options: Selection[] = game.unitsAt(t).filter((u) => u.owner === HUMAN).map((unit) => ({ kind: 'unit', unit }));
      const city = game.cityByTile.get(t);
      if (city && game.explored[t]) options.push({ kind: 'city', city });
      const idx = options.findIndex((o) =>
        (o?.kind === 'unit' && sel?.kind === 'unit' && o.unit === sel.unit) ||
        (o?.kind === 'city' && sel?.kind === 'city' && o.city === sel.city));
      sel = options.length ? options[(idx + 1) % options.length] : { kind: 'tile', tile: t };
    }
    refresh();
  }

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const keyActions: Record<string, Action> = {
      Enter: { type: 'endTurn' }, ' ': { type: 'skip' }, f: { type: 'fortify' }, b: { type: 'found' },
    };
    const a = keyActions[e.key];
    if (a) { e.preventDefault(); act(a); return; }
    if (e.key === 'n' || e.key === 'Tab') { e.preventDefault(); selectNextUnit(); refresh(); }
    else if (e.key === 'Escape') { sel = null; refresh(); }
    else if (e.key === 'c' && sel && sel.kind !== 'tile') { view.focusOn(sel.kind === 'unit' ? sel.unit.tile : sel.city.tile); }
  });

  // Debug: ?reveal shows the whole map; ?look=<key>[+<key>...] flies to the
  // first tile matching every key (biome, relief or feature), e.g. hotDesert+hills.
  const debug = new URLSearchParams(location.search);
  if (debug.has('reveal')) game.explored.fill(1);
  const lookFor = debug.get('look');

  game.log(`Welcome! ${game.players.length - 1} rival civilizations share this world of ${game.N.toLocaleString()} tiles.`);
  selectNextUnit();
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
