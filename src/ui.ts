import { floraLabel } from './flora.ts';
import { unitDef, buildDef, isUnitKey, isWonder, growthCost, BUILDINGS, WONDERS, type BuildKey } from './rules.ts';
import { terrainName } from './terrain.ts';
import { HUMAN, BUILDABLE, PILLAGE_GOLD, type Game, type City, type Unit, type AdjacencyHit } from './game.ts';
import type { Selection } from './render.ts';
import {
  USE, FOCUSES, FAMILIES, IMPROVEMENTS, ERAS, improvementFor, isFocusKey, quarterOf, familyOf,
  type FocusKey, type GrowthKind, type GrowthOption, type Output, type BuildingKey, type AdjacencySource, type WonderKey,
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
  | { type: 'governorPlace' }
  | { type: 'focus'; focus: FocusKey }
  | { type: 'endTurn' };

// What the map shows for the selected city: where a citizen (of a kind) or
// a completed building can go.
// `{ wonder }`: picking the tile of a wonder to start.
export type Placing = GrowthKind | 'building' | { readonly wonder: WonderKey } | null;
export const wonderPicked = (p: Placing): WonderKey | null => (p !== null && typeof p === 'object' ? p.wonder : null);

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

const isBuildKey = (s: string): s is BuildKey => (BUILDABLE as string[]).includes(s);

// Buttons carry their action as data attributes; parse them back into a typed Action.
function parseAction(el: HTMLElement): Action | null {
  const type = el.dataset['act'];
  switch (type) {
    case 'found': case 'fortify': case 'wake': case 'skip': case 'disband': case 'endTurn': case 'governorPlace': case 'pillage': case 'raze':
      return { type };
    case 'placeKind': {
      const kind = el.dataset['kind'];
      return kind === 'rural' || kind === 'urban' || kind === 'specialist' ? { type, kind } : null;
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

const KIND_NAME: Record<GrowthKind, string> = { rural: 'Rural', urban: 'Urban', specialist: 'Specialist' };
export const optionName = (o: GrowthOption): string =>
  o.kind === 'rural' ? IMPROVEMENTS[o.improvement].name
    : o.kind === 'urban' ? (o.over ? `Urban (replaces the ${IMPROVEMENTS[o.over].name.toLowerCase()}; +1 specialist)` : 'Urban')
    : 'Specialist';

const SOURCE_NAME: Record<AdjacencySource, string> = {
  mountain: 'mountain', river: 'river', forest: 'forest', mine: 'mine', quarry: 'quarry', boats: 'fishing boats',
  center: 'city center', walls: 'walls', wonder: 'wonder',
  campus: 'Campus', market: 'Market', forge: 'Forge', harbor: 'Harbor', temple: 'Temple', theater: 'Theater', garrison: 'Garrison',
};
// "+2 mountain, +1 Campus"
export const hitsStr = (hits: readonly AdjacencyHit[]): string => {
  const n = new Map<AdjacencySource, number>();
  for (const h of hits) n.set(h.source, (n.get(h.source) ?? 0) + 1);
  return [...n].map(([s, k]) => `+${k} ${SOURCE_NAME[s]}`).join(', ');
};

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
    const urban = g.cityTiles(c, USE.urban);
    const specialists = urban.reduce((n, t) => n + g.specialists[t], 0);
    const rural = g.cityTiles(c, USE.rural).length;
    const makeup = `Center · ${urban.length} urban · ${rural} rural${specialists ? ` · ${specialists} specialist${specialists > 1 ? 's' : ''}` : ''}`;
    let place = '';
    const pickW = wonderPicked(placing);
    if (mine && pickW) {
      place = `<div class="place"><b>Where will the ${esc(WONDERS[pickW].name)} stand?</b> <small>${esc(WONDERS[pickW].desc)} Click a highlighted tile · <kbd>Esc</kbd> cancels</small></div>`;
    } else if (mine && c.pendingBuilding) {
      place = `<div class="place"><b>Place the ${esc(BUILDINGS[c.pendingBuilding].name)}</b> <small>click a highlighted tile (the bright one is the governor's pick) · <kbd>Esc</kbd> leaves it to the governor</small>
        <div class="buttons"><button data-act="governorPlace">Governor</button></div></div>`;
    } else if (mine && c.growth > 0) {
      const opts = g.growthOptions(c);
      const kinds = (['rural', 'urban', 'specialist'] as const).map((k) => {
        const n = opts.filter((o) => o.kind === k).length;
        return `<button data-act="placeKind" data-kind="${k}" class="${placing === k ? 'active' : ''}" ${n ? '' : 'disabled'}>${KIND_NAME[k]} <small>${n}</small></button>`;
      }).join('');
      place = `<div class="place"><b>Place a citizen</b> <small>click a highlighted tile · <kbd>Esc</kbd> leaves it to the governor</small>
        <div class="buttons">${kinds}<button data-act="governorPlace">Governor</button></div></div>`;
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
      if (g.waitingForSlot(c)) current = `${item.name} — finished, waiting for a free slot`;
      if (isWonder(c.building)) current += ' — on the marked tile';
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
         ${blds.length ? `<div class="desc">Buildings <small>(placed on a tile when finished)</small></div><div class="build">${blds.map(button).join('')}</div>` : ''}
         ${wonders.length ? `<div class="desc">Wonders <small>(pick their tile first; one in the world)</small></div><div class="build">${wonders.map(button).join('')}</div>` : ''}`
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
      ${focus}
      ${this.quartersHtml(c)}
      <div class="desc">Producing: <b>${current}</b></div>
      ${options}
      ${raze}`;
  }

  // The city's built tiles: each tile's buildings, its quarter and yield.
  private quartersHtml(c: City): string {
    const g = this.game;
    const rows: string[] = [];
    for (const t of [c.tile, ...g.cityTiles(c, USE.urban)]) {
      const keys = g.slotKeys(t);
      if (keys.every((k) => k === null) && t !== c.tile) continue;
      const q = quarterOf(keys);
      const names = keys.map((k) => (k ? BUILDINGS[k].name : '<small>free slot</small>')).join(' · ');
      const where = t === c.tile ? 'Center' : q ? `${FAMILIES[q].name} quarter` : g.isWater(t) ? 'Harbor tile' : 'Urban tile';
      rows.push(`<div class="qrow"><b>${where}</b> ${names}</div>`);
    }
    if (c.buildings.has('walls')) rows.push('<div class="qrow"><b>Walls</b> around the center</div>');
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
      const keys = g.slotKeys(t);
      const q = quarterOf(keys);
      const what = u === USE.center ? 'City center' : u === USE.urban ? `${q ? `${FAMILIES[q].name} quarter` : 'Urban'}${g.specialists[t] ? ` · ${g.specialists[t]} specialist${g.specialists[t] > 1 ? 's' : ''}` : ''}`
        : u === USE.rural && k ? IMPROVEMENTS[k].name : `Wild${k ? ` <small>(${IMPROVEMENTS[k].name.toLowerCase()} if developed)</small>` : ''}`;
      lines.push(`${what} of ${esc(tc.name)}${u === USE.wild ? '' : ` ${outStr(o)}`}`);
      const built = keys.filter((x): x is BuildingKey => x !== null);
      if (built.length) {
        lines.push(built.map((b) => BUILDINGS[b].name).join(', '));
        const fams = [...new Set(built.map(familyOf).filter((f) => f !== null))];
        for (const f of fams) {
          const hits = g.adjacencyHits(t, f);
          if (hits.length) lines.push(`<small>${FAMILIES[f].name} adjacency: ${hitsStr(hits)}</small>`);
        }
      }
    }
    const w = g.wonderOn(t);
    if (w) lines.push(`<b>★ ${esc(WONDERS[w].name)}</b> <small>${esc(WONDERS[w].desc)}</small>`);
    const site = g.cities.find((c) => c.wonderTile === t);
    if (site && site.building && isWonder(site.building)) lines.push(`<small>${esc(WONDERS[site.building].name)} under construction</small>`);
    const pickW = wonderPicked(placing);
    if (sel?.kind === 'city' && pickW && g.wonderSpots(sel.city, pickW).includes(t)) {
      lines.push(`<span class="warn">Click: build the ${esc(WONDERS[pickW].name)} here</span> ${outStr(WONDERS[pickW].yields, true)}`);
    } else if (sel?.kind === 'city' && placing === 'building' && sel.city.pendingBuilding) {
      const k = sel.city.pendingBuilding;
      if (g.buildingSpots(sel.city, k).includes(t)) {
        const f = familyOf(k);
        const hits = f ? g.adjacencyHits(t, f) : [];
        const conv = g.use[t] === USE.rural ? ` <small>(replaces the ${IMPROVEMENTS[improvementFor(g.terrainAt(t))!].name.toLowerCase()})</small>` : '';
        lines.push(`<span class="warn">Click: ${BUILDINGS[k].name} here${conv}</span> ${outStr(g.buildingGain(sel.city, k, t), true)}`);
        if (hits.length) lines.push(`<small>${hitsStr(hits)}</small>`);
      }
    } else if (placing && typeof placing === 'string' && sel?.kind === 'city') {
      const opts = g.growthOptions(sel.city).filter((o) => o.tile === t);
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

// A building's family, as a small tag in the build list.
function buildingTag(k: BuildingKey): string {
  const f = familyOf(k);
  return f ? ` <small>${FAMILIES[f].name}</small>` : BUILDINGS[k].role === 'civic' ? ' <small>civic</small>' : '';
}
