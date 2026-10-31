import { floraLabel } from './flora.ts';
import { unitDef, buildDef, isUnitKey, isWonder, BUILDINGS, WONDERS, type BuildKey } from './rules.ts';
import { terrainName } from './terrain.ts';
import { HUMAN, BUILDABLE, PILLAGE_GOLD, COMMANDER_CAPACITY, type Game, type City, type Unit } from './game.ts';
import type { Selection } from './render.ts';
import { techDef } from './techs.ts';
import { politicsDef } from './politics.ts';
import { RELIGIONS } from './religion.ts';
import { resourceDef, LUXURY_CAPITAL } from './resources.ts';
import { BORDER_AT, BORDER_MAX } from './cities.ts';
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
  | { type: 'rally' }
  | { type: 'upgrade' }
  | { type: 'deploy' }
  | { type: 'pillage' }
  | { type: 'raze' }
  | { type: 'build'; key: BuildKey | null }
  | { type: 'placeKind'; kind: GrowthKind }
  | { type: 'specialist'; specialist: SpecialistKind }
  | { type: 'governorPlace' }
  | { type: 'focus'; focus: FocusKey }
  | { type: 'buyMode' }
  | { type: 'buy'; currency: 'gold' | 'faith' }
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
    case 'found': case 'fortify': case 'wake': case 'skip': case 'disband': case 'endTurn': case 'governorPlace': case 'pillage': case 'raze': case 'buyMode': case 'rally': case 'deploy': case 'upgrade':
      return { type };
    case 'buy': {
      const c = el.dataset['currency'];
      return c === 'gold' || c === 'faith' ? { type, currency: c } : null;
    }
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
// Each yield: its class (a colour key, style.css) and name.
const ICONS: Record<keyof Output, [string, string]> = {
  food: ['food', 'Food'], prod: ['prod', 'Production'], gold: ['gold', 'Gold'], science: ['sci', 'Science'], culture: ['cul', 'Culture'], faith: ['fai', 'Faith'], cohesion: ['coh', 'Cohesion'],
};
// Food, production and gold always; the rest when nonzero.
export const outStr = (o: Output, sign = false) => (Object.keys(ICONS) as (keyof Output)[])
  .filter((k) => k === 'food' || k === 'prod' || k === 'gold' || o[k] !== 0)
  .map((k) => `<span class="y ${ICONS[k][0]}" title="${ICONS[k][1]}">${sign ? signed(o[k]) : o[k]}</span>`).join('');
const yieldStr = (food: number, prod: number, gold: number) =>
  `<span class="y food" title="Food">${food}</span><span class="y prod" title="Production">${prod}</span><span class="y gold" title="Gold">${gold}</span>`;

const KIND_NAME: Record<GrowthKind, string> = { rural: 'Rural', specialist: 'Specialist' };
export const specialistName = (k: SpecialistKind): string => SPECIALISTS[k].name;
export const optionName = (o: GrowthOption): string =>
  o.kind === 'rural' ? IMPROVEMENTS[o.improvement].name : specialistName(o.specialist);

export class UI {
  private readonly game: Game;
  private readonly el = {
    civ: $('civ'), turn: $('turn'), empire: $('empire'), hint: $('hint'),
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
    this.el.turn.textContent = `Turn ${g.turn} · ${ERAS[me.era].name}`;
    this.el.empire.innerHTML = this.empireHtml();
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

  // The civ's accounts (last turn's, net of upkeep) and its three
  // advances, each opening its sheet: research and politics with their
  // progress (asking for a choice when none is made), identity with the
  // points toward its next trait.
  private empireHtml(): string {
    const g = this.game, p = g.players[HUMAN]!, l = p.ledger;
    const net = l.income.gold + l.tithes - l.cityUpkeep - l.unitUpkeep;
    const stat = (label: string, cls: string, value: string, delta: string) =>
      `<div class="stat"><span class="label">${label}</span><b class="y ${cls}">${value}<span class="delta">${delta}</span></b></div>`;
    const track = (sheet: string, label: string, cls: string, name: string | null, progress: number, cost: number, rate: number, prompt = 'Choose…') => {
      if (!name) return `<div class="track prompt" data-sheet="${sheet}"><div class="row"><span class="label">${label}</span></div><b>${prompt}</b></div>`;
      const turns = g.turnsTo(cost, progress, rate);
      return `<div class="track" data-sheet="${sheet}"><div class="row"><span class="label">${label}</span><small>${Number.isFinite(turns) ? `${turns} turns` : '—'}</small></div>
        <b>${esc(name)}</b><div class="bar ${cls}"><i style="width:${Math.min(100, (100 * progress) / cost).toFixed(1)}%"></i></div></div>`;
    };
    const tech = p.research ? techDef(p.research) : null, pol = p.studying ? politicsDef(p.studying) : null;
    const next = g.nextTraitCost(p), ready = p.identityPoints >= next;
    return [
      stat('Gold', 'gold', String(p.gold), ` ${signed(Math.round(net))}`),
      stat('Science', 'sci', signed(l.income.science), ''),
      stat('Cohesion', 'coh', signed(l.income.cohesion), ''),
      stat('Culture', 'cul', signed(l.income.culture), ''),
      stat('Faith', 'fai', String(p.faith), ` ${signed(l.income.faith)}`),
      '<span class="sep"></span>',
      track('research', 'Research', 'sci', tech?.name ?? null, p.research ? (p.techProgress[p.research] ?? 0) : 0, tech?.cost ?? 1, l.income.science),
      track('politics', 'Politics', 'coh', pol?.name ?? null, p.studying ? (p.politicsProgress[p.studying] ?? 0) : 0, pol?.cost ?? 1, l.income.cohesion),
      ready ? track('identity', 'Identity', 'cul', null, 0, 1, 0, 'Adopt a trait…')
        : track('identity', 'Identity', 'cul', `Next trait · ${Math.floor(p.identityPoints)}/${next}`, p.identityPoints, next, l.income.culture),
    ].join('');
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
      if (u.type === 'commander') {
        const can = g.rallyable(u).length, army = g.armyOf(u).length;
        buttons.push(`<button data-act="rally" ${can ? '' : `disabled title="${army >= COMMANDER_CAPACITY ? 'The army is full' : 'No units of yours on its tile or the tiles next to it'}"`}>Rally ${can ? `${can} ` : ''}<kbd>R</kbd></button>`);
        if (army) buttons.push(`<button data-act="deploy">Deploy <kbd>U</kbd></button>`);
      }
      if (!T.civilian) {
        buttons.push(u.fortified ? `<button data-act="wake">Wake</button>` : `<button data-act="fortify">Fortify <kbd>F</kbd></button>`);
        const to = g.upgradeTarget(u);
        if (to) buttons.push(`<button data-act="upgrade" ${g.canUpgrade(u) ? '' : `disabled title="In your own territory, with moves left and ${g.upgradeCost(u, to)} gold"`}>Upgrade to ${esc(unitDef(to).name)} <small>${g.upgradeCost(u, to)} gold</small></button>`);
        if (g.canPillage(u)) buttons.push(`<button data-act="pillage" title="Burn this enemy tile: it yields nothing until repaired; you take ${PILLAGE_GOLD} gold">Pillage <kbd>P</kbd></button>`);
      }
      buttons.push(`<button data-act="skip">Skip <kbd>Space</kbd></button>`, `<button data-act="disband" class="danger">Disband</button>`);
    }
    const status = u.fortified ? 'Fortified' : u.goal != null ? 'Moving…' : '';
    const armyUnits = u.type === 'commander' ? g.armyOf(u) : [];
    const army = u.type === 'commander'
      ? `<div class="desc">Army ${armyUnits.length}/${COMMANDER_CAPACITY}${armyUnits.length ? `: ${armyUnits.map((v) => `${esc(unitDef(v.type).name)} <small>${v.hp} HP</small>`).join(', ')}` : ' · rally units from its tile and the tiles next to it'}</div>`
      : '';
    return `<h3>${esc(T.name)} <small>${esc(g.players[u.owner].name)}</small></h3>
      <div class="stats">Attack ${T.atk} · Defense ${T.def} · Moves ${u.moves}/${g.maxMoves(u.type, u.owner)} · HP ${u.hp}</div>
      ${T.desc ? `<div class="desc">${esc(T.desc)}</div>` : ''}
      ${status ? `<div class="desc">${status}</div>` : ''}
      ${army}
      ${mine ? '<div class="desc">Right-click a tile to move or attack.</div>' : ''}
      <div class="buttons">${buttons.join('')}</div>`;
  }

  private cityHtml(c: City, placing: Placing): string {
    const g = this.game;
    const y = g.cityYields(c);
    const mine = c.owner === HUMAN;
    const cost = g.growthCostOf(c, c.pop + c.growth);
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
      const label = isUnitKey(k) ? `${d.name} <small>${unitDef(k).atk}/${unitDef(k).def}</small>` : isWonder(k) ? `${d.name}` : `${d.name}${buildingTag(k)}`;
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
    // Its accounts: what it costs in upkeep, its religion; buying what it builds.
    const p = g.players[c.owner]!, capital = p.capital === c.id;
    const ledger = `<div class="ledger"><span>Upkeep</span><b>${capital ? 'none (capital)' : `${g.upkeepOf(c).toFixed(1)} gold/turn${c.buildings.has('courthouse') ? ' · courthouse' : ''}`}</b>
      <span>Religion</span><b>${c.religion ? esc(RELIGIONS[c.religion].name) : 'none'}</b>
      <span>Borders</span><b>${c.ring} tiles out${c.ring < BORDER_MAX ? ` · ${c.ring + 1} at ${BORDER_AT[c.ring + 1]} culture (${Math.floor(c.culture)})` : ''}</b></div>`;
    const buyGold = mine ? g.buyCost(c, 'gold') : null, buyFaith = mine ? g.buyCost(c, 'faith') : null;
    const buy = buyGold !== null || buyFaith !== null ? `<div class="buttons">${buyGold !== null ? `<button data-act="buy" data-currency="gold" ${p.gold >= buyGold ? '' : 'disabled'}>Buy <small>${buyGold} gold</small></button>` : ''}${buyFaith !== null ? `<button data-act="buy" data-currency="faith" ${p.faith >= buyFaith ? '' : 'disabled'}>Buy <small>${buyFaith} faith</small></button>` : ''}</div>` : '';
    const raze = mine && g.canRaze(c) ? `<div class="buttons"><button data-act="raze" class="danger" title="Burn the city down, a citizen a turn; ruins remain">Raze ${esc(c.name)}</button></div>` : '';
    return `<h3>${esc(c.name)} <small>size ${c.pop} · ${esc(g.players[c.owner].name)}</small></h3>
      <div class="stats">${outStr(y)}</div>
      ${defense}
      ${ledger}
      <div class="desc">${makeup}</div>
      <div class="desc">Food ${c.food}/${cost} (${y.surplus >= 0 ? '+' : ''}${y.surplus}) — ${grow}</div>
      ${place}
      ${mine && placing !== 'buy' && g.buyableTiles(c).length ? `<div class="buttons"><button data-act="buyMode" title="A city grows into the ring beyond its first by buying it">Buy tiles <small>${g.tilePrice(c)} gold</small></button></div>` : ''}
      ${focus}
      ${this.buildingsHtml(c)}
      <div class="desc">Producing: <b>${current}</b></div>
      ${buy}
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
    if (ws.length) rows.push(`<div class="qrow"><b>Wonders</b> ${ws.map((w) => WONDERS[w].name).join(' · ')}</div>`);
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
    const res = g.resourceFor(t, HUMAN);
    if (res) { const d = resourceDef(res); lines.push(`<b>${esc(d.name)}</b> <small>${d.kind}</small> ${outStr(d.yields, true)}${d.kind === 'luxury' ? ` <small>· owned: ${outStr(LUXURY_CAPITAL, true)} in the capital</small>` : d.kind === 'strategic' ? ' <small>· owned: needed for some units and buildings</small>' : ''}`); }
    if (tc && !g.tilesWithin(tc.tile, 2).includes(t)) lines.push('<small>Beyond its citizens\' reach: held for its resources, not worked</small>');
    for (const w of g.wondersAt(t)) lines.push(`<b>${esc(WONDERS[w].name)}</b> <small>${esc(WONDERS[w].desc)}</small>`);
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
      const blocker = g.isForeignBlocked(t, u.owner) ? (g.cityByTile.get(t)?.owner ?? g.unitsAt(t).find((v) => v.owner !== u.owner)?.owner) : undefined;
      if (blocker !== undefined) lines.push(`<span class="bad">At peace with the ${esc(g.players[blocker]!.name)}: declare war (Diplomacy) to attack</span>`);
      else if (!path) lines.push('<span class="bad">Unreachable</span>');
      else if (g.isEnemyOccupied(t, u.owner)) {
        const pv = g.combatPreview(u, t);
        const city = g.cityByTile.get(t);
        lines.push(pv
          ? `<span class="warn">Attack: ${pv.atk.toFixed(1)} against ${pv.def.toFixed(1)} (${unitDef(pv.defender.type).name})</span>`
          : city && city.hp > 0
            ? `<span class="warn">Siege: ${g.unitStrength(u, 'atk', t).toFixed(1)} against the city's ${g.cityStrength(city).toFixed(1)} · HP ${city.hp}/${g.cityMaxHp(city)}</span>`
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
