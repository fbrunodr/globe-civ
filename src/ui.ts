import { floraLabel } from './flora.ts';
import { unitDef, buildDef, isUnitKey, isWonder, growthCost, BUILDINGS, WONDERS, type BuildKey } from './rules.ts';
import { terrainName } from './terrain.ts';
import { HUMAN, BUILDABLE, PILLAGE_GOLD, type Game, type City, type Unit } from './game.ts';
import type { Selection } from './render.ts';
import {
  USE, FOCUSES, IMPROVEMENTS, ERAS, SPECIALISTS, SPECIALIST_KINDS, improvementFor, isFocusKey, specialistYield,
  type FocusKey, type GrowthKind, type GrowthOption, type Output, type BuildingKey, type SpecialistKind, type WonderKey,
} from './cities.ts';

export type Action =
  | { type: 'found' }
  | { type: 'fortify' }
  | { type: 'wake' }
  | { type: 'skip' }
  | { type: 'disband' }
  | { type: 'pillage' }
  | { type: 'raze' }
  | { type: 'build'; key: BuildKey | null }
  | { type: 'placeKind'; kind: GrowthKind }
  | { type: 'specialist'; specialist: SpecialistKind }
  | { type: 'governorPlace' }
  | { type: 'focus'; focus: FocusKey }
  | { type: 'buyMode' }
  | { type: 'endTurn' };

// What the map shows for the selected city: where a citizen can go
// ('rural'; a specialist is placed from the panel), or the tiles it could
// buy ('buy'). `{ wonder }`: picking the mountain of a wonder to start.
export type Placing = GrowthKind | 'buy' | { readonly wonder: WonderKey } | null;
export const wonderPicked = (p: Placing): WonderKey | null => (p !== null && typeof p === 'object' ? p.wonder : null);

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

const isBuildKey = (s: string): s is BuildKey => (BUILDABLE as string[]).includes(s);

// Buttons carry their action as data attributes; parse them back into a typed Action.
function parseAction(el: HTMLElement): Action | null {
  const type = el.dataset['act'];
  switch (type) {
    case 'found': case 'fortify': case 'wake': case 'skip': case 'disband': case 'endTurn': case 'governorPlace': case 'pillage': case 'raze': case 'buyMode':
      return { type };
    case 'placeKind': {
      const kind = el.dataset['kind'];
      return kind === 'rural' || kind === 'specialist' ? { type, kind } : null;
    }
    case 'specialist': {
      const k = el.dataset['specialist'] ?? '';
      return (SPECIALIST_KINDS as readonly string[]).includes(k) ? { type, specialist: k as SpecialistKind } : null;
    }
    case 'focus': {
      const focus = el.dataset['focus'] ?? '';
      return isFocusKey(focus) ? { type, focus } : null;
    }
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
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const ICONS: Record<keyof Output, [string, string]> = {
  food: ['food', '🌾'], prod: ['prod', '⚒'], gold: ['gold', '●'], science: ['sci', '⚗'], culture: ['cul', '♪'], faith: ['fai', '✦'],
};
// Food, production and gold always; science, culture and faith when nonzero.
const outStr = (o: Output, sign = false) => (Object.keys(ICONS) as (keyof Output)[])
  .filter((k) => k === 'food' || k === 'prod' || k === 'gold' || o[k] !== 0)
  .map((k) => `<span class="y ${ICONS[k][0]}">${ICONS[k][1]} ${sign ? signed(o[k]) : o[k]}</span>`).join('');
const yieldStr = (food: number, prod: number, gold: number) =>
  `<span class="y food">🌾 ${food}</span><span class="y prod">⚒ ${prod}</span><span class="y gold">● ${gold}</span>`;

const KIND_NAME: Record<GrowthKind, string> = { rural: 'Rural', specialist: 'Specialist' };
export const specialistName = (k: SpecialistKind): string => SPECIALISTS[k].name;
export const optionName = (o: GrowthOption): string =>
  o.kind === 'rural' ? IMPROVEMENTS[o.improvement].name : specialistName(o.specialist);

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

  render(sel: Selection, hover: number, hint: string, placing: Placing = null): void {
    const g = this.game;
    const me = g.players[HUMAN];
    this.el.civ.innerHTML = `<span class="swatch" style="background:${me.color}"></span>${esc(me.name)}`;
    this.el.turn.textContent = `Turn ${g.turn}`;
    const next = ERAS[me.era + 1];
    this.el.gold.innerHTML = `● ${me.gold} gold <span class="y sci" title="${next ? `${next.name} era at ${next.science} science` : 'Latest era'}">⚗ ${me.science}</span><span class="y cul">♪ ${me.culture}</span><span class="y fai">✦ ${me.faith}</span> <small>${ERAS[me.era].name} era</small>`;
    this.el.hint.textContent = hint;
    this.el.log.innerHTML = g.messages.slice(-7).map((m) => `<div><b>T${m.turn}</b> ${esc(m.text)}</div>`).join('');
    this.renderSelection(sel, placing);
    this.renderTile(sel, hover, placing);

    if (g.over) {
      this.el.overlay.classList.remove('hidden');
      this.el.overlay.innerHTML = `<div class="card"><h1>${g.over === 'victory' ? 'Victory!' : 'Defeat'}</h1>
        <p>${g.over === 'victory' ? 'You have conquered the world.' : 'Your civilization has fallen.'} (Turn ${g.turn})</p>
        <button onclick="location.reload()">New game</button></div>`;
    }
  }

  private renderSelection(sel: Selection, placing: Placing): void {
    const box = this.el.selection;
    if (!sel || sel.kind === 'tile') { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = sel.kind === 'unit' ? this.unitHtml(sel.unit) : this.cityHtml(sel.city, placing);
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
        if (g.canPillage(u)) buttons.push(`<button data-act="pillage" title="Burn this enemy tile: it yields nothing until repaired; you take ${PILLAGE_GOLD} gold">Pillage <kbd>P</kbd></button>`);
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

  private cityHtml(c: City, placing: Placing): string {
    const g = this.game;
    const y = g.cityYields(c);
    const mine = c.owner === HUMAN;
    const cost = growthCost(c.pop + c.growth);
    const grow = c.growth > 0 ? 'a citizen waits to be placed'
      : y.surplus > 0 ? `grows in ${Math.ceil((cost - c.food) / y.surplus)} turns` : y.surplus < 0 ? 'starving!' : 'stagnant';
    const specialists = g.specialistCount(c);
    const rural = g.cityTiles(c, USE.rural).length;
    const makeup = `Center · ${rural} rural${specialists ? ` · ${specialists} specialist${specialists > 1 ? 's' : ''}` : ''}`;
    let place = '';
    const pickW = wonderPicked(placing);
    if (mine && placing === 'buy') {
      place = `<div class="place"><b>Buy a tile</b> <small>${g.tilePrice(c)} gold each (you have ${g.players[c.owner]!.gold}) · click a highlighted tile · <kbd>Esc</kbd> stops</small></div>`;
    } else if (mine && pickW) {
      place = `<div class="place"><b>Where will the ${esc(WONDERS[pickW].name)} stand?</b> <small>${esc(WONDERS[pickW].desc)} Click a highlighted tile · <kbd>Esc</kbd> cancels</small></div>`;
    } else if (mine && c.growth > 0) {
      const opts = g.growthOptions(c);
      const rural = opts.filter((o) => o.kind === 'rural').length;
      const specs = opts.flatMap((o) => (o.kind === 'specialist' ? [o.specialist] : []));
      const buttons = [`<button data-act="placeKind" data-kind="rural" class="${placing === 'rural' ? 'active' : ''}" ${rural ? '' : 'disabled'}>${KIND_NAME.rural} <small>${rural}</small></button>`,
        ...specs.map((k) => `<button data-act="specialist" data-specialist="${k}">${specialistName(k)} ${outStr(specialistYield(k), true)}</button>`)].join('');
      place = `<div class="place"><b>Place a citizen</b> <small>a highlighted tile, or a specialist · <kbd>Esc</kbd> leaves it to the governor</small>
        <div class="buttons">${buttons}<button data-act="governorPlace">Governor</button></div></div>`;
    }
    const focus = mine
      ? `<div class="focus">Governor <span>${(Object.keys(FOCUSES) as FocusKey[]).map((k) =>
          `<button data-act="focus" data-focus="${k}" class="${c.focus === k ? 'active' : ''}">${FOCUSES[k].name}</button>`).join('')}</span></div>`
      : '';
    const turnsFor = (k: BuildKey) => Math.max(1, Math.ceil((buildDef(k).cost - (c.building === k ? c.prod : 0)) / Math.max(1, y.prod)));
    let current = 'Nothing — production becomes gold';
    if (c.building) {
      const item = buildDef(c.building);
      current = `${item.name} ${Math.min(c.prod, item.cost)}/${item.cost} (${turnsFor(c.building)} turns)`;
      if (c.building === 'settler' && c.pop < 2) current += ' — needs size 2';
      if (isWonder(c.building) && c.wonderTile !== c.tile) current += ' — on the marked tile';
    }
    const units = BUILDABLE.filter((k) => isUnitKey(k) && g.canBuild(c, k));
    const blds = BUILDABLE.filter((k) => !isUnitKey(k) && !isWonder(k) && g.canBuild(c, k));
    const wonders = BUILDABLE.filter((k) => isWonder(k) && g.canBuild(c, k));
    const button = (k: BuildKey) => {
      const d = buildDef(k);
      const label = isUnitKey(k) ? `${d.name} <small>⚔${unitDef(k).atk} 🛡${unitDef(k).def}</small>` : isWonder(k) ? `★ ${d.name}` : `${d.name}${buildingTag(k)}`;
      return `<button data-act="build" data-key="${k}" class="${c.building === k ? 'active' : ''}" title="${esc(d.desc ?? '')}">
        ${label}<span class="turns">${turnsFor(k)}t</span></button>`;
    };
    const options = mine
      ? `<div class="build">${units.map(button).join('')}<button data-act="build" data-key="" class="${c.building ? '' : 'active'}">Wealth<span class="turns">→ gold</span></button></div>
         ${blds.length ? `<div class="desc">Buildings</div><div class="build">${blds.map(button).join('')}</div>` : ''}
         ${wonders.length ? `<div class="desc">Wonders <small>(one in the world)</small></div><div class="build">${wonders.map(button).join('')}</div>` : ''}`
      : '';
    const maxHp = g.cityMaxHp(c);
    const defense = `<div class="desc">Defense ${g.cityStrength(c).toFixed(1)} · HP ${c.hp}/${maxHp}${c.hp < maxHp ? ' <span class="warn">(damaged)</span>' : ''}${c.razing ? ' · <span class="bad">being razed</span>' : ''}</div>`;
    const raze = mine && g.canRaze(c) ? `<div class="buttons"><button data-act="raze" class="danger" title="Burn the city down, a citizen a turn; ruins remain">Raze ${esc(c.name)}</button></div>` : '';
    return `<h3>${esc(c.name)} <small>size ${c.pop} · ${esc(g.players[c.owner].name)}</small></h3>
      <div class="stats">${outStr(y)}</div>
      ${defense}
      <div class="desc">${makeup}</div>
      <div class="desc">Food ${c.food}/${cost} (${y.surplus >= 0 ? '+' : ''}${y.surplus}) — ${grow}</div>
      ${place}
      ${mine && placing !== 'buy' && g.buyableTiles(c).length ? `<div class="buttons"><button data-act="buyMode" title="A city grows into the ring beyond its first by buying it">Buy tiles <small>${g.tilePrice(c)} gold</small></button></div>` : ''}
      ${focus}
      ${this.buildingsHtml(c)}
      <div class="desc">Producing: <b>${current}</b></div>
      ${options}
      ${raze}`;
  }

  // The city's buildings, specialists and wonders.
  private buildingsHtml(c: City): string {
    const g = this.game;
    const rows: string[] = [];
    const blds = [...c.buildings].filter((b) => b !== 'walls');
    if (blds.length) rows.push(`<div class="qrow"><b>Buildings</b> ${blds.map((b) => BUILDINGS[b].name).join(' · ')}</div>`);
    const specs = SPECIALIST_KINDS.filter((k) => c.specialists[k] > 0);
    if (specs.length) rows.push(`<div class="qrow"><b>Specialists</b> ${specs.map((k) => `${c.specialists[k]} ${specialistName(k).toLowerCase()}${c.specialists[k] > 1 ? 's' : ''}`).join(' · ')}</div>`);
    const ws = g.cityWonders(c);
    if (ws.length) rows.push(`<div class="qrow"><b>Wonders</b> ${ws.map((w) => `★ ${WONDERS[w].name}`).join(' · ')}</div>`);
    if (c.buildings.has('walls')) rows.push('<div class="qrow"><b>Walls</b> around the city</div>');
    return rows.length ? `<div class="quarters">${rows.join('')}</div>` : '';
  }

  private renderTile(sel: Selection, t: number, placing: Placing): void {
    const box = this.el.tile;
    const g = this.game;
    if (t < 0 || !g.explored[t]) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const y = g.tileYield(t);
    const name = terrainName(g.terrainAt(t));
    const owner = g.ownerOf(t);
    const variant = floraLabel(g.map, g.flora, t);
    const lines = [`<b>${name}</b>${variant ? ` <small>${esc(variant)}</small>` : ''} ${yieldStr(y.food, y.prod, y.gold)}`];
    const tc = g.cityById.get(g.tileCity[t]);
    if (tc) {
      const u = g.use[t];
      const k = improvementFor(g.terrainAt(t));
      const o = g.tileOutput(t);
      const what = u === USE.center ? esc(tc.name)
        : `${u === USE.rural && k ? IMPROVEMENTS[k].name : `Wild${k ? ` <small>(${IMPROVEMENTS[k].name.toLowerCase()} if developed)</small>` : ''}`} of ${esc(tc.name)}`;
      lines.push(`${what}${u === USE.wild && !g.wondersAt(t).length ? '' : ` ${outStr(o)}`}`);
    }
    for (const w of g.wondersAt(t)) lines.push(`<b>★ ${esc(WONDERS[w].name)}</b> <small>${esc(WONDERS[w].desc)}</small>`);
    const site = g.cities.find((c) => c.wonderTile === t);
    if (site && site.building && isWonder(site.building)) lines.push(`<small>${esc(WONDERS[site.building].name)} under construction</small>`);
    const pickW = wonderPicked(placing);
    if (sel?.kind === 'city' && pickW && g.wonderSpots(sel.city, pickW).includes(t)) {
      lines.push(`<span class="warn">Click: build the ${esc(WONDERS[pickW].name)} here</span> ${outStr(WONDERS[pickW].yields, true)}`);
    } else if (placing && typeof placing === 'string' && sel?.kind === 'city') {
      const opts = g.growthOptions(sel.city).filter((o) => o.kind === 'rural' && o.tile === t);
      for (const o of opts) lines.push(`<span class="${o.kind === placing ? 'warn' : ''}">${o.kind === placing ? 'Click: ' : ''}${optionName(o)} ${outStr(g.optionYield(o), true)}</span>`);
    }
    if (!g.isWater(t)) {
      const def = g.defenseBonus(t);
      lines.push(`Move cost ${g.moveCost(t)}${def ? ` · Defense +${Math.round(def * 100)}%` : ''}`);
    }
    if (owner >= 0) lines.push(`Territory of ${esc(g.players[owner].name)}`);
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
        const city = g.cityByTile.get(t);
        lines.push(pv
          ? `<span class="warn">Attack: ⚔ ${pv.atk.toFixed(1)} vs 🛡 ${pv.def.toFixed(1)} (${unitDef(pv.defender.type).name})</span>`
          : city && city.hp > 0
            ? `<span class="warn">Siege: ⚔ ${g.unitStrength(u, 'atk', t).toFixed(1)} vs city ${g.cityStrength(city).toFixed(1)} · HP ${city.hp}/${g.cityMaxHp(city)}</span>`
            : unitDef(u.type).ranged && city ? '<span class="bad">Ranged units cannot take a city</span>' : '<span class="warn">Undefended — capture!</span>');
      } else lines.push(`Path: ${g.pathTurns(u, path)} turn(s)`);
    }
    box.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  }
}

// A building's specialist slots, as a small tag in the build list.
function buildingTag(k: BuildingKey): string {
  const s = BUILDINGS[k].specialists;
  return s ? ` <small>${s.slots} ${SPECIALISTS[s.kind].name.toLowerCase()}${s.slots > 1 ? 's' : ''}</small>` : '';
}
