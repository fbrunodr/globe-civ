import { floraLabel } from './flora.ts';
import { unitDef, buildDef, isUnitKey, growthCost, BUILDINGS, type BuildKey } from './rules.ts';
import { terrainName } from './terrain.ts';
import { HUMAN, BUILDABLE, type Game, type City, type Unit } from './game.ts';
import type { Selection } from './render.ts';

export type Action =
  | { type: 'found' }
  | { type: 'fortify' }
  | { type: 'wake' }
  | { type: 'skip' }
  | { type: 'disband' }
  | { type: 'build'; key: BuildKey | null }
  | { type: 'endTurn' };

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

const isBuildKey = (s: string): s is BuildKey => (BUILDABLE as string[]).includes(s);

// Buttons carry their action as data attributes; parse them back into a typed Action.
function parseAction(el: HTMLElement): Action | null {
  const type = el.dataset['act'];
  switch (type) {
    case 'found': case 'fortify': case 'wake': case 'skip': case 'disband': case 'endTurn':
      return { type };
    case 'build': {
      const key = el.dataset['key'] ?? '';
      if (key === '') return { type, key: null };
      return isBuildKey(key) ? { type, key } : null;
    }
    default:
      return null;
  }
}

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const yieldStr = (food: number, prod: number, gold: number) =>
  `<span class="y food">🌾 ${food}</span><span class="y prod">⚒ ${prod}</span><span class="y gold">● ${gold}</span>`;

export class UI {
  private readonly game: Game;
  private readonly el = {
    civ: $('civ'), turn: $('turn'), gold: $('gold'), hint: $('hint'),
    log: $('log'), selection: $('selection'), tile: $('tileinfo'), overlay: $('overlay'),
  };

  constructor(game: Game, onAction: (a: Action) => void) {
    this.game = game;
    document.body.addEventListener('click', (e) => {
      const target = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-act]') : null;
      const action = target && parseAction(target);
      if (action) onAction(action);
    });
  }

  render(sel: Selection, hover: number, hint: string): void {
    const g = this.game;
    const me = g.players[HUMAN];
    this.el.civ.innerHTML = `<span class="swatch" style="background:${me.color}"></span>${esc(me.name)}`;
    this.el.turn.textContent = `Turn ${g.turn}`;
    this.el.gold.textContent = `● ${me.gold} gold`;
    this.el.hint.textContent = hint;
    this.el.log.innerHTML = g.messages.slice(-7).map((m) => `<div><b>T${m.turn}</b> ${esc(m.text)}</div>`).join('');
    this.renderSelection(sel);
    this.renderTile(sel, hover);

    if (g.over) {
      this.el.overlay.classList.remove('hidden');
      this.el.overlay.innerHTML = `<div class="card"><h1>${g.over === 'victory' ? 'Victory!' : 'Defeat'}</h1>
        <p>${g.over === 'victory' ? 'You have conquered the world.' : 'Your civilization has fallen.'} (Turn ${g.turn})</p>
        <button onclick="location.reload()">New game</button></div>`;
    }
  }

  private renderSelection(sel: Selection): void {
    const box = this.el.selection;
    if (!sel || sel.kind === 'tile') { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = sel.kind === 'unit' ? this.unitHtml(sel.unit) : this.cityHtml(sel.city);
  }

  private unitHtml(u: Unit): string {
    const g = this.game;
    const T = unitDef(u.type);
    const mine = u.owner === HUMAN;
    const buttons: string[] = [];
    if (mine) {
      if (u.type === 'settler') {
        const ok = g.canFoundCity(u.tile, u.owner);
        buttons.push(`<button data-act="found" ${ok ? '' : 'disabled title="Too close to another city, or invalid terrain"'}>Found city <kbd>B</kbd></button>`);
      }
      if (!T.civilian) {
        buttons.push(u.fortified ? `<button data-act="wake">Wake</button>` : `<button data-act="fortify">Fortify <kbd>F</kbd></button>`);
      }
      buttons.push(`<button data-act="skip">Skip <kbd>Space</kbd></button>`, `<button data-act="disband" class="danger">Disband</button>`);
    }
    const status = u.fortified ? 'Fortified' : u.goal != null ? 'Moving…' : '';
    return `<h3>${esc(T.name)} <small>${esc(g.players[u.owner].name)}</small></h3>
      <div class="stats">⚔ ${T.atk} · 🛡 ${T.def} · Moves ${u.moves}/${T.mv} · HP ${u.hp}</div>
      ${T.desc ? `<div class="desc">${esc(T.desc)}</div>` : ''}
      ${status ? `<div class="desc">${status}</div>` : ''}
      ${mine ? '<div class="desc">Right-click a tile to move or attack.</div>' : ''}
      <div class="buttons">${buttons.join('')}</div>`;
  }

  private cityHtml(c: City): string {
    const g = this.game;
    const y = g.cityYields(c);
    const mine = c.owner === HUMAN;
    const cost = growthCost(c.pop);
    const grow = y.surplus > 0 ? `grows in ${Math.ceil((cost - c.food) / y.surplus)} turns` : y.surplus < 0 ? 'starving!' : 'stagnant';
    const turnsFor = (k: BuildKey) => Math.max(1, Math.ceil((buildDef(k).cost - (c.building === k ? c.prod : 0)) / Math.max(1, y.prod)));
    let current = 'Nothing — production becomes gold';
    if (c.building) {
      const item = buildDef(c.building);
      current = `${item.name} ${Math.min(c.prod, item.cost)}/${item.cost} (${turnsFor(c.building)} turns)`;
      if (c.building === 'settler' && c.pop < 2) current += ' — needs size 2';
    }
    const options = mine
      ? BUILDABLE.filter((k) => g.canBuild(c, k)).map((k) => {
          const d = buildDef(k);
          const label = isUnitKey(k) ? `${d.name} <small>⚔${unitDef(k).atk} 🛡${unitDef(k).def}</small>` : d.name;
          return `<button data-act="build" data-key="${k}" class="${c.building === k ? 'active' : ''}" title="${esc(d.desc ?? '')}">
            ${label}<span class="turns">${turnsFor(k)}t</span></button>`;
        }).join('') + `<button data-act="build" data-key="" class="${c.building ? '' : 'active'}">Wealth<span class="turns">→ gold</span></button>`
      : '';
    const built = [...c.buildings].map((b) => BUILDINGS[b].name).join(', ') || 'none';
    return `<h3>${esc(c.name)} <small>size ${c.pop} · ${esc(g.players[c.owner].name)}</small></h3>
      <div class="stats">${yieldStr(y.food, y.prod, y.gold)}</div>
      <div class="desc">Food ${c.food}/${cost} (${y.surplus >= 0 ? '+' : ''}${y.surplus}) — ${grow}</div>
      <div class="desc">Building: <b>${current}</b></div>
      <div class="desc">Buildings: ${built}</div>
      ${mine ? `<div class="build">${options}</div>` : ''}`;
  }

  private renderTile(sel: Selection, t: number): void {
    const box = this.el.tile;
    const g = this.game;
    if (t < 0 || !g.explored[t]) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const y = g.tileYield(t);
    const name = terrainName(g.terrainAt(t));
    const owner = g.ownerOf(t);
    const variant = floraLabel(g.map, g.flora, t);
    const lines = [`<b>${name}</b>${variant ? ` <small>${esc(variant)}</small>` : ''} ${yieldStr(y.food, y.prod, y.gold)}`];
    if (!g.isWater(t)) {
      const def = g.defenseBonus(t);
      lines.push(`Move cost ${g.moveCost(t)}${def ? ` · Defense +${Math.round(def * 100)}%` : ''}`);
    }
    if (owner >= 0) lines.push(`Territory of ${esc(g.players[owner].name)}`);
    const city = g.cityByTile.get(t);
    if (city) lines.push(`City: ${esc(city.name)} (size ${city.pop})`);
    if (g.visible[t]) {
      const units = g.unitsAt(t);
      if (units.length) lines.push(units.map((u) => `${esc(g.players[u.owner].name)} ${unitDef(u.type).name} (${u.hp}hp)`).join(', '));
    }
    if (sel?.kind === 'unit' && sel.unit.owner === HUMAN && t !== sel.unit.tile) {
      const u = sel.unit;
      const path = g.findPath(u, t);
      if (!path) lines.push('<span class="bad">Unreachable</span>');
      else if (g.isEnemyOccupied(t, u.owner)) {
        const pv = g.combatPreview(u, t);
        lines.push(pv
          ? `<span class="warn">Attack: ⚔ ${pv.atk.toFixed(1)} vs 🛡 ${pv.def.toFixed(1)} (${unitDef(pv.defender.type).name})</span>`
          : '<span class="warn">Undefended — capture!</span>');
      } else lines.push(`Path: ${g.pathTurns(u, path)} turn(s)`);
    }
    box.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  }
}
