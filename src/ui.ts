import { floraLabel } from './flora.ts';
import { unitDef, buildDef, isUnitKey, isWonder, BUILDINGS, WONDERS, type BuildKey } from './rules.ts';
import { terrainName } from './terrain.ts';
import { HUMAN, BUILDABLE, PILLAGE_GOLD, COMMANDER_CAPACITY, UNITS_PER_SOURCE, VICTORIES, FORT_TURNS, FORT_DEFENSE, type Game, type City, type Unit } from './game.ts';
import type { Selection } from './render.ts';
import { canAssault, canShoot, type AttackMode } from './unitClasses.ts';
import { techDef } from './techs.ts';
import { politicsDef } from './politics.ts';
import { RELIGIONS, FAITH_SAME, FAITH_RIVAL, DEVOUT_TURNS } from './religion.ts';
import { resourceDef, empireBonus } from './resources.ts';
import { BORDER_AT, BORDER_MAX, OUTPUT_KEYS } from './cities.ts';
import { icon, unitIcon, resourceIcon, YIELD_ICON, type IconKey } from './icons.ts';
import { inkOn } from './mapIcons.ts';
import { cityUpkeep, inflation } from './economy.ts';
import { total } from './effects.ts';
import { RESOURCE_KEYS } from './resources.ts';
import {
  USE, FOCUSES, IMPROVEMENTS, ERAS, SPECIALISTS, SPECIALIST_KINDS, isFocusKey, specialistYield,
  type FocusKey, type GrowthKind, type GrowthOption, type Output, type BuildingKey, type SpecialistKind, type WonderKey,
} from './cities.ts';

export type Action =
  | { type: 'found' }
  | { type: 'improve' }
  | { type: 'road' }
  | { type: 'fort' }
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
  | { type: 'unspecialist'; specialist: SpecialistKind }
  | { type: 'governorPlace' }
  | { type: 'focus'; focus: FocusKey }
  | { type: 'buyMode' }
  | { type: 'convert' }
  | { type: 'buy'; currency: 'gold' | 'faith' }
  | { type: 'endTurn' }
  | { type: 'next' };

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
    case 'found': case 'improve': case 'road': case 'fort': case 'fortify': case 'wake': case 'skip': case 'disband': case 'endTurn': case 'next': case 'governorPlace': case 'pillage': case 'raze': case 'buyMode': case 'convert': case 'rally': case 'deploy': case 'upgrade':
      return { type };
    case 'buy': {
      const c = el.dataset['currency'];
      return c === 'gold' || c === 'faith' ? { type, currency: c } : null;
    }
    case 'placeKind': {
      const kind = el.dataset['kind'];
      return kind === 'rural' || kind === 'specialist' ? { type, kind } : null;
    }
    case 'specialist': case 'unspecialist': {
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
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// A tooltip (data-tip): a title, and what it means under it.
export const tip = (title: string, sub = ''): string => `data-tip="${esc(`<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`)}"`;
// Each yield: its class (a colour key, game.css) and name.
const YIELDS: Record<keyof Output, [string, string]> = {
  food: ['food', 'Food'], prod: ['prod', 'Production'], gold: ['gold', 'Gold'], science: ['sci', 'Science'], culture: ['cul', 'Culture'], faith: ['fai', 'Faith'], cohesion: ['coh', 'Cohesion'],
};
const yieldChip = (k: keyof Output, text: string) => `<span class="y ${YIELDS[k][0]}" ${tip(YIELDS[k][1])}>${icon(YIELD_ICON[k])}${text}</span>`;
// Food, production and gold always; the rest when nonzero.
export const outStr = (o: Output, sign = false) => OUTPUT_KEYS
  .filter((k) => k === 'food' || k === 'prod' || k === 'gold' || o[k] !== 0)
  .map((k) => yieldChip(k, sign ? signed(o[k]) : String(o[k]))).join('');
// A bonus: only what it adds.
export const bonusStr = (o: Output) => OUTPUT_KEYS.filter((k) => o[k] !== 0).map((k) => yieldChip(k, signed(o[k]))).join('');
const yieldStr = (food: number, prod: number, gold: number) => yieldChip('food', String(food)) + yieldChip('prod', String(prod)) + yieldChip('gold', String(gold));

const KIND_NAME: Record<GrowthKind, string> = { rural: 'Rural', specialist: 'Specialist' };
export const specialistName = (k: SpecialistKind): string => SPECIALISTS[k].name;
export const optionName = (o: GrowthOption): string =>
  o.kind === 'rural' ? (o.improvement ? IMPROVEMENTS[o.improvement].name : 'Unimproved land') : specialistName(o.specialist);

// What the big button asks for next (main.ts decides): the turn's end once nothing is left.
export interface NextStep { readonly label: string; readonly sub: string; readonly ready: boolean }

// A news item's pictogram and tone, from what it says.
function noticeLook(text: string): [IconKey, string] {
  if (/war|defeated|captured|destroyed|razed|siege|pillaged|struck|drove off|fallen|starving|nuclear|anti-aircraft|intercepted|empty/i.test(text)) return ['sword', 'war'];
  if (/^Researched|era\.$/.test(text)) return ['science', 'sci'];
  if (/known for|dopted|follows|borders|culture|founded [A-Z][a-z]+(ism|ity|am)\b/.test(text)) return ['culture', 'cul'];
  if (/grew/.test(text)) return ['person', 'good'];
  if (/[Ff]ounded/.test(text)) return ['flag', 'good'];
  if (/completed|built|drained/.test(text)) return ['hammer', 'good'];
  if (/[Tt]rade|peace|Met /.test(text)) return ['diplomacy', ''];
  return ['bell', ''];
}

const SHEET_BUTTONS: readonly [string, IconKey, string][] = [['government', 'government', 'Government'], ['religion', 'religion', 'Religion'], ['diplomacy', 'diplomacy', 'Diplomacy'], ['log', 'log', 'Log']];

export class UI {
  private readonly game: Game;
  private readonly el = {
    hud: $('hud'), civ: $('civ'), turn: $('turn'), yields: $('yields'), trackers: $('trackers'), notices: $('notices'), next: $('next'),
    selection: $('selection'), cityside: $('cityside'), tile: $('tileinfo'), overlay: $('overlay'), tip: $('tip'),
  };
  // News: what was said since the player's turn began, less what they dismissed.
  private noticesFrom = 0;
  private readonly dismissed = new Set<number>();
  // The tile's tooltip follows the pointer, a moment after it settles on a tile.
  private pointer = { x: 0, y: 0, over: false };
  private tileShown = -1;
  private tileTimer = 0;
  // (What was last drawn in each box: redrawn only when it changed, so a button under the pointer is not replaced mid-click.)
  private readonly drawn = new Map<HTMLElement, string>();

  constructor(game: Game, onAction: (a: Action) => void) {
    this.game = game;
    $('sheets').innerHTML = SHEET_BUTTONS.map(([k, ic, name]) => `<button data-sheet="${k}">${icon(ic)}<span>${name}</span></button>`).join('');
    $('menuBtn').innerHTML = icon('menu');
    document.body.addEventListener('click', (e) => {
      const from = e.target instanceof Element ? e.target : null;
      const note = from?.closest<HTMLElement>('[data-notice]');
      if (note) { for (const i of (note.dataset['notice'] ?? '').split(',')) this.dismissed.add(Number(i)); this.renderNotices(); return; }
      const target = from?.closest<HTMLElement>('[data-act]');
      if (!target || target.classList.contains('off')) return;
      const action = parseAction(target);
      if (action) { this.hideTip(); onAction(action); }
    });
    // Tooltips: anything with data-tip, shown under it (over it near the screen's foot).
    document.body.addEventListener('mouseover', (e) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tip]') : null;
      if (!el) { this.hideTip(); return; }
      const box = this.el.tip;
      box.innerHTML = el.dataset['tip'] ?? '';
      box.classList.remove('hidden');
      const r = el.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
      const below = r.bottom + 8 + h < innerHeight - 4;
      box.style.left = `${Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2))}px`;
      box.style.top = `${below ? r.bottom + 8 : r.top - h - 8}px`;
    });
    document.body.addEventListener('mousedown', () => this.hideTip());
    const canvas = $('c');
    addEventListener('pointermove', (e) => { this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.over = e.target === canvas; this.placeTile(); });
    canvas.addEventListener('pointerleave', () => { this.pointer.over = false; this.placeTile(); });
    canvas.addEventListener('pointerdown', () => { this.tileShown = -2; this.placeTile(); });
  }

  private hideTip(): void { this.el.tip.classList.add('hidden'); }
  private set(box: HTMLElement, html: string): void {
    if (this.drawn.get(box) === html) return;
    this.drawn.set(box, html);
    box.innerHTML = html;
  }

  // The player's turn begins: the news starts afresh.
  newTurn(): void { this.noticesFrom = this.game.messages.length; this.dismissed.clear(); }

  render(sel: Selection, hover: number, next: NextStep, placing: Placing = null): void {
    const g = this.game;
    const me = g.players[HUMAN];
    this.set(this.el.civ, `<span class="swatch" style="background:${me.color}"></span>${esc(me.name)}`);
    this.set(this.el.turn, `<b>Turn ${g.turn}<small> / ${g.turnLimit}</small></b><small>${ERAS[me.era].name} era · ${g.score(HUMAN)} points</small>`);
    this.set(this.el.yields, this.empireHtml());
    this.set(this.el.trackers, this.trackersHtml());
    this.el.next.className = next.ready ? 'ready' : '';
    this.set(this.el.next, `${esc(next.label)}<small>${next.sub}</small>`);
    this.renderNotices();
    this.renderSelection(sel, placing);
    this.renderTile(sel, hover, placing);

    if (g.over) {
      this.el.overlay.classList.remove('hidden');
      const w = g.winner, who = w ? g.players[w.player]!.name : '';
      const told = !w ? 'Your civilization has fallen.'
        : w.how === 'conquest' ? (g.over === 'victory' ? 'You are the last civilization standing.' : `The ${esc(who)} are the last civilization standing.`)
        : w.how === 'science' ? (g.over === 'victory' ? 'Your people know all there is to know.' : `The ${esc(who)} were the first to know every technology.`)
        : w.how === 'religion' ? (g.over === 'victory' ? 'Two thirds of the world\'s people follow your faith.' : `Two thirds of the world's people follow the faith of the ${esc(who)}.`)
        : g.over === 'victory' ? `Time is up, and yours is the greatest civilization: ${g.score(HUMAN)} points.` : `Time is up. The ${esc(who)} stand first with ${g.score(w.player)} points; you have ${g.score(HUMAN)}.`;
      this.set(this.el.overlay, `<div class="card"><h1>${g.over === 'victory' ? 'Victory' : 'Defeat'}</h1>
        <p>${w ? `<b>${VICTORIES[w.how].name}.</b> ` : ''}${told} (Turn ${g.turn})</p>
        <button id="go" class="primary" onclick="location.reload()">New game</button></div>`);
    }
  }

  private renderNotices(): void {
    const g = this.game;
    // (The same news several times over: once, with how often.)
    const items: { text: string; ids: number[] }[] = [];
    g.messages.forEach((m, i) => {
      if (i < this.noticesFrom || this.dismissed.has(i)) return;
      const same = items.find((x) => x.text === m.text);
      if (same) same.ids.push(i); else items.push({ text: m.text, ids: [i] });
    });
    this.set(this.el.notices, items.slice(-7).map(({ text, ids }) => {
      const [ic, cls] = noticeLook(text);
      return `<div class="notice ${cls}" data-notice="${ids.join(',')}" ${tip('Dismiss')}><span class="chip">${icon(ic)}</span><span>${esc(text)}${ids.length > 1 ? ` <small>×${ids.length}</small>` : ''}</span></div>`;
    }).join(''));
  }

  // The civ's accounts (last turn's, net of upkeep), each with what makes it
  // up; then its strategic resources and its luxuries.
  private empireHtml(): string {
    const g = this.game, p = g.players[HUMAN]!, l = p.ledger;
    const net = Math.round(l.income.gold + l.tithes + l.trade - l.cityUpkeep - l.unitUpkeep);
    const stat = (cls: string, ic: IconKey, value: string, delta: string, title: string, sub: string, neg = false) =>
      `<div class="stat ${cls} ${neg ? 'neg' : ''}" ${tip(title, sub)}>${icon(ic)}<b>${value}</b>${delta ? `<small>${delta}</small>` : ''}</div>`;
    const lines = [`Cities ${signed(Math.round(l.income.gold))}`, l.tithes ? `Tithes ${signed(Math.round(l.tithes))}` : '', l.trade ? `Trade ${signed(Math.round(l.trade))}` : '',
      l.cityUpkeep ? `City upkeep −${l.cityUpkeep.toFixed(1)}` : '', l.unitUpkeep ? `Unit upkeep −${l.unitUpkeep.toFixed(1)}` : ''].filter(Boolean).join(' · ');
    const owned = g.ownedResources(HUMAN);
    const strategic = RESOURCE_KEYS.filter((k) => resourceDef(k).kind === 'strategic' && (owned.has(k) || g.resourceSources(HUMAN, k) > 0));
    const lux = g.luxuriesOf(HUMAN);
    return [
      stat('gold', 'gold', String(p.gold), `${signed(net)}`, 'Gold', `In the treasury; ${signed(net)} a turn. ${lines}${p.arrears > 0 ? `<br><span class="bad">In arrears: your cities make ${Math.round(100 * p.arrears)}% less production, science and culture</span>` : '. What you cannot pay, your cities lose in proportion'}`, net < 0 || p.arrears > 0),
      stat('sci', 'science', signed(l.income.science), '', 'Science', 'A turn, toward what you research'),
      stat('coh', 'cohesion', signed(l.income.cohesion), '', 'Cohesion', 'A turn, toward your politics'),
      stat('cul', 'culture', signed(l.income.culture), '', 'Culture', 'A turn, toward your identity\'s next trait'),
      stat('fai', 'faith', String(p.faith), signed(l.income.faith), 'Faith', `In hand; ${signed(l.income.faith)} a turn. Buys what a city builds`),
      strategic.length || lux.length ? '<span class="sep"></span>' : '',
      ...strategic.map((k) => { const cap = UNITS_PER_SOURCE * g.resourceSources(HUMAN, k), used = g.resourceUsed(HUMAN, k);
        return `<span class="res" ${tip(resourceDef(k).name, `${plural(g.resourceSources(HUMAN, k), 'source')}: each arms ${UNITS_PER_SOURCE} units that need it. ${used} of ${cap} in use`)}>${icon(resourceIcon(k))}${used}/${cap}</span>`; }),
      lux.length ? `<span class="res" ${tip(plural(lux.length, 'luxury', 'luxuries'), lux.map((k) => resourceDef(k).name).join(', '))}>${icon('gem')}${lux.length}</span>` : '',
    ].join('');
  }

  // Its three advances, each opening its sheet: research and politics with
  // their progress (asking for a choice when none is made), identity with
  // the points toward its next trait.
  private trackersHtml(): string {
    const g = this.game, p = g.players[HUMAN]!, l = p.ledger;
    const track = (sheet: string, label: string, cls: string, ic: IconKey, name: string | null, progress: number, cost: number, rate: number, prompt: string) => {
      if (!name) return `<div class="tracker ${cls} prompt" data-sheet="${sheet}"><div class="ring">${icon(ic)}</div><div class="what"><span class="label">${label}</span><b>${prompt}</b></div></div>`;
      const turns = g.turnsTo(cost, progress, rate);
      return `<div class="tracker ${cls}" data-sheet="${sheet}"><div class="ring" style="--p:${Math.min(100, (100 * progress) / cost).toFixed(1)}">${icon(ic)}</div>
        <div class="what"><span class="label">${label}</span><b>${esc(name)}</b><small>${Number.isFinite(turns) ? plural(turns, 'turn') : 'no progress'} · ${Math.floor(progress)}/${cost}</small></div></div>`;
    };
    const tech = p.research ? techDef(p.research) : null, pol = p.studying ? politicsDef(p.studying) : null;
    const next = g.nextTraitCost(p), ready = p.identityPoints >= next;
    return [
      track('research', 'Research', 'sci', 'science', tech?.name ?? null, p.research ? (p.techProgress[p.research] ?? 0) : 0, tech?.cost ?? 1, l.income.science, 'Choose research'),
      track('politics', 'Politics', 'coh', 'politics', pol?.name ?? null, p.studying ? (p.politicsProgress[p.studying] ?? 0) : 0, pol?.cost ?? 1, l.income.cohesion, 'Choose politics'),
      track('identity', 'Identity', 'cul', 'identity', ready ? null : 'Next trait', p.identityPoints, next, l.income.culture, 'Adopt a trait'),
    ].join('');
  }

  private renderSelection(sel: Selection, placing: Placing): void {
    const box = this.el.selection, side = this.el.cityside;
    const city = sel?.kind === 'city' ? this.cityHtml(sel.city, placing) : null;
    side.classList.toggle('hidden', !city?.[1]);
    this.el.hud.classList.toggle('citymode', !!city?.[1]);
    if (city?.[1]) {
      const scroll = side.querySelector('.plist')?.scrollTop ?? 0;
      this.set(side, city[1]);
      const list = side.querySelector('.plist');
      if (list) list.scrollTop = scroll;
    }
    if (!sel || sel.kind === 'tile') { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    this.set(box, sel.kind === 'unit' ? this.unitHtml(sel.unit) : city![0]);
  }

  private unitHtml(u: Unit): string {
    const g = this.game;
    const T = unitDef(u.type);
    const mine = u.owner === HUMAN, owner = g.players[u.owner]!;
    // An order: a round button, its pictogram, its key; greyed with the reason when it cannot be given.
    const order = (act: string, ic: IconKey, title: string, sub: string, key = '', why: string | null = null, cls = '') =>
      `<button class="abtn ${cls} ${why ? 'off' : ''}" data-act="${act}" ${tip(title, why ?? sub)} ${why ? 'aria-disabled="true"' : ''}>${icon(ic)}${key ? `<kbd>${key}</kbd>` : ''}</button>`;
    const orders: string[] = [];
    if (mine) {
      if (u.type === 'settler') {
        // (Its bill, before it exists: what a city here would cost a turn now.)
        const me = g.players[u.owner]!, cap = me.capital === null ? undefined : g.cityById.get(me.capital), mine = g.cities.filter((c) => c.owner === u.owner).length;
        const bill = cap ? cityUpkeep(Math.round(g.approxDist(u.tile, cap.tile)), mine, false, total(g.effectsOf(me), 'upkeep')) * inflation(g.turn) : 0;
        orders.push(order('found', 'flag', 'Found a city', cap ? `Here. It would cost ${bill.toFixed(1)} gold a turn in upkeep now (its distance from the capital, and your ${plural(mine, 'city', 'cities')}), more as it grows` : 'Here: your capital, which costs no upkeep',
          'B', g.canFoundCity(u.tile, u.owner) ? null : 'Too close to another city, or no ground for one'));
      }
      if (T.improves) {
        // (On its own tile; fishing boats on the water beside it.)
        const t = g.improveTarget(u) ?? u.tile, k = g.improvementAt(t, u.owner), why = g.improveBlock(u, t);
        const mend = k !== null && g.builtAt(t) === k && g.pillaged[t]! > 0;
        orders.push(order('improve', 'hammer', k ? `${mend ? 'Repair the' : 'Build a'} ${IMPROVEMENTS[k].name.toLowerCase()}` : 'Improve the land',
          k ? `${plural(g.improveTurns(t, u.owner), 'turn')}${mend ? ' · free' : ` · one of the ${plural(u.charges, 'improvement')} it can still build`}` : '', 'I', why));
        orders.push(order('fort', 'fort', 'Build a fort', `${plural(FORT_TURNS, 'turn')} · one of the ${plural(u.charges, 'improvement')} it can still build. A unit in it defends ${Math.round(100 * FORT_DEFENSE)}% stronger, as behind a city's walls. It stands in the tile's improvement's place: the tile has one or the other`, 'O', g.fortBlock(u)));
        orders.push(order('road', 'road', 'Lay a road', `${plural(g.roadTurns(u.tile), 'turn')} · free. Units move twice as far along roads; a city joined to the capital by road trades with it`, 'L', g.roadBlock(u)));
      }
      if (u.type === 'commander') {
        const can = g.rallyable(u).length, army = g.armyOf(u).length;
        orders.push(order('rally', 'star', `Rally${can ? ` ${plural(can, 'unit')}` : ''}`, 'Take the units on its tile and beside it into its army', 'R', can ? null : army >= COMMANDER_CAPACITY ? 'The army is full' : 'No units of yours on its tile or the tiles next to it'));
        if (army) orders.push(order('deploy', 'out', 'Deploy', 'Its army steps out onto the tiles around it', 'U'));
      }
      if (!T.civilian) {
        orders.push(u.fortified ? order('wake', 'bell', 'Wake', 'Stand ready for orders again') : order('fortify', 'shield', 'Fortify', 'Hold this tile: stronger in defence, until woken', 'F'));
        const to = g.upgradeTarget(u);
        if (to) orders.push(order('upgrade', 'up', `Upgrade to ${unitDef(to).name}`, `${g.upgradeCost(u, to)} gold`, '', g.canUpgrade(u) ? null : `In your own territory, with moves left and ${g.upgradeCost(u, to)} gold`));
        if (g.canPillage(u)) orders.push(order('pillage', 'fire', 'Pillage', `Burn this enemy tile: it yields nothing until repaired; you take ${PILLAGE_GOLD} gold`, 'P'));
      }
      orders.push(order('skip', 'skip', 'Skip this turn', 'It will ask again next turn', '␣'), order('disband', 'close', 'Disband', 'The unit is gone for good', '', null, 'danger'));
    }
    const status = u.work !== null ? (u.job === 'road' ? `Laying a road: ${plural(g.roadTurns(u.work), 'turn')} left` : u.job === 'fort' ? `Building a fort: ${plural(g.fortLeft[u.work] || FORT_TURNS, 'turn')} left`
      : `${u.job === 'repair' ? 'Repairing' : 'Building'} ${(() => { const k = g.improvementAt(u.work, u.owner); return k ? `a ${IMPROVEMENTS[k].name.toLowerCase()}` : ''; })()}: ${plural(g.improveTurns(u.work, u.owner), 'turn')} left`)
      : u.fortified ? 'Fortified' : u.goal != null ? 'On its way' : '';
    const armyUnits = u.type === 'commander' ? g.armyOf(u) : [];
    const army = u.type === 'commander'
      ? `<div class="desc"><b>Army ${armyUnits.length}/${COMMANDER_CAPACITY}</b>${armyUnits.length ? ` ${armyUnits.map((v) => `<span class="tag">${icon(unitIcon(v.type))}${esc(unitDef(v.type).name)} <small>${v.hp}</small></span>`).join(' ')}` : ' · rally units from its tile and the tiles next to it'}</div>`
      : '';
    const stat = (ic: IconKey, value: string, title: string, sub = '') => `<span class="chipstat" ${tip(title, sub)}>${icon(ic)}${value}</span>`;
    const stats = [
      stat('moves', `${u.moves}/${g.maxMoves(u.type, u.owner)}`, 'Moves', 'Left this turn, of its most'),
      T.improves ? stat('hammer', String(u.charges), 'Improvements', 'It can still build this many; roads and repairs are free, as often as wanted') : '',
      T.civilian ? '' : stat('sword', String(T.melee), 'Melee strength', 'Closing in, and defending against it'),
      T.rangedAtk ? stat('arrow', `${T.rangedAtk}${(T.reach ?? 1) > 1 ? ` <small>reach ${T.reach}</small>` : ''}`, 'Ranged strength', 'Firing from a distance, unanswered') : '',
      T.civilian ? '' : stat('shield', String(T.rangedDef), 'Defence under fire', 'Against arrows, shot and shell'),
      u.faith && !T.civilian ? stat('faith', RELIGIONS[u.faith].name, 'Its faith', `Its city's when it was raised. Attacking a unit of the same faith it is ${Math.round(100 * FAITH_SAME)}% weaker; one of another faith, ${Math.round(100 * FAITH_RIVAL)}% stronger`) : '',
    ].join('');
    return `<div class="unitcard" style="--civ:${owner.color};--on:${inkOn(owner.color)}">
      <div class="portrait ${T.civilian ? 'civilian' : ''}">${icon(unitIcon(u.type))}</div>
      <div class="uhead"><div class="row"><h3>${esc(T.name)}</h3><small>${esc(owner.name)}</small></div>
        <div class="meter ${u.hp > 60 ? '' : u.hp > 30 ? 'mid' : 'low'}"><i style="width:${Math.max(0, u.hp)}%"></i></div><small>${u.hp} / 100 health</small></div>
      <div class="ustats">${stats}</div>
      ${status ? `<div class="status">${status}</div>` : ''}
      ${T.desc ? `<div class="desc">${esc(T.desc)}</div>` : ''}
      ${army}
      ${mine ? `<div class="desc">Right-click a tile to move or attack${canShoot(u.type) && canAssault(u.type) ? ' (it shoots; Shift + right-click closes in instead)' : ''}.</div>` : ''}
      ${orders.length ? `<div class="actions">${orders.join('')}</div>` : ''}</div>`;
  }

  // A city: its accounts (the selection's panel) and, its owner's, what it
  // builds (the panel on the right).
  private cityHtml(c: City, placing: Placing): [string, string] {
    const g = this.game;
    const y = g.cityYields(c);
    const mine = c.owner === HUMAN, p = g.players[c.owner]!, capital = p.capital === c.id;
    const cost = g.growthCostOf(c, c.pop + c.growth);
    const grow = c.growth > 0 ? 'a citizen waits to be placed'
      : y.surplus > 0 ? `grows in ${plural(Math.ceil((cost - c.food) / y.surplus), 'turn')}` : y.surplus < 0 ? '<span class="bad">starving</span>' : 'not growing';
    const specialists = g.specialistCount(c);
    const rural = g.cityTiles(c, USE.rural).length;
    let place = '';
    const pickW = wonderPicked(placing);
    if (mine && placing === 'buy') {
      place = `<div class="place"><b>Buy a tile</b> <small>${g.tilePrice(c)} gold each (you have ${p.gold}) · click a highlighted tile · <kbd>Esc</kbd> stops</small></div>`;
    } else if (mine && pickW) {
      place = `<div class="place"><b>Where will the ${esc(WONDERS[pickW].name)} stand?</b> <small>${esc(WONDERS[pickW].desc)} Click a highlighted tile · <kbd>Esc</kbd> cancels</small></div>`;
    } else if (mine && c.growth > 0) {
      const opts = g.growthOptions(c);
      const free = opts.filter((o) => o.kind === 'rural').length;
      const specs = opts.flatMap((o) => (o.kind === 'specialist' ? [o.specialist] : []));
      const buttons = [`<button data-act="placeKind" data-kind="rural" class="${placing === 'rural' ? 'active' : ''}" ${free ? '' : 'disabled'}>${KIND_NAME.rural} <small>${free}</small></button>`,
        ...specs.map((k) => `<button data-act="specialist" data-specialist="${k}">${specialistName(k)} ${outStr(specialistYield(k), true)}</button>`)].join('');
      place = `<div class="place"><b>Place a citizen</b> <small>on a highlighted tile, or as a specialist · <kbd>Esc</kbd> leaves it to the governor</small>
        <div class="buttons">${buttons}<button data-act="governorPlace">Governor</button></div></div>`;
    }
    const FOCUS_ICON: Record<FocusKey, IconKey | null> = { balanced: null, food: 'food', production: 'prod', gold: 'gold', science: 'science', culture: 'culture', faith: 'faith' };
    const focus = mine
      ? `<div class="sect"><span class="label">Governor's focus</span><div class="focus">${(Object.keys(FOCUSES) as FocusKey[]).map((k) =>
          `<button data-act="focus" data-focus="${k}" class="${c.focus === k ? 'active' : ''}">${FOCUS_ICON[k] ? icon(FOCUS_ICON[k]) : ''}${FOCUSES[k].name}</button>`).join('')}</div></div>`
      : '';
    // What holds it: its garrison (a city does not defend itself).
    const holder = g.bestDefender(c.tile, -1, 'melee');
    const garrison = `<div class="mrow">${icon('shield', holder ? '' : 'bad')}<div class="txt"><b>Garrison</b><span>${holder
      ? `${esc(unitDef(holder.type).name)} · strength ${g.cityStrength(c).toFixed(1)}${g.walled(c) ? ' behind walls' : ''}`
      : '<span class="bad">none: any enemy can walk in</span>'}</span></div><div class="meter ${holder && holder.hp > 60 ? '' : holder && holder.hp > 30 ? 'mid' : 'low'}"><i style="width:${holder ? holder.hp : 0}%"></i></div></div>`;
    const meter = (ic: IconKey, cls: string, name: string, text: string, f: number) =>
      `<div class="mrow">${icon(ic, cls)}<div class="txt"><b>${name}</b><span>${text}</span></div><div class="meter ${cls}"><i style="width:${(100 * Math.min(1, Math.max(0, f))).toFixed(1)}%"></i></div></div>`;
    const facts = `<div class="facts">
      <span>Citizens</span><b>${rural} on the land${specialists ? ` · ${plural(specialists, 'specialist')}` : ''}${mine && rural ? '<br><small>the gold tiles: click one to move its citizen</small>' : ''}</b>
      <span>Upkeep</span><b>${capital ? 'none (capital)' : `${g.upkeepOf(c).toFixed(1)} gold a turn${c.buildings.has('courthouse') ? ' · courthouse' : ''}`}</b>
      <span>Religion</span><b>${c.religion ? esc(RELIGIONS[c.religion].name) : 'none'}</b>
      <span>Borders</span><b>${c.ring} tiles out${c.ring < BORDER_MAX ? ` · next at ${BORDER_AT[c.ring + 1]} culture (${Math.floor(c.culture)})` : ''}</b></div>`;
    const more: string[] = [];
    if (mine && placing !== 'buy' && g.buyableTiles(c).length) more.push(`<button data-act="buyMode" ${tip('Buy tiles', 'A city grows into the ring beyond its first by buying it')}>${icon('grid')} Buy tiles <small>${g.tilePrice(c)} gold</small></button>`);
    // (Faith converts a city, anyone's, in reach of your holy city.)
    const mineFaith = [...g.religions].find(([, f]) => f.founder === HUMAN);
    if (mineFaith && c.religion !== mineFaith[0]) {
      const why = g.convertBlock(HUMAN, c);
      more.push(`<button data-act="convert" class="${why ? 'off' : ''}" ${tip(`Convert ${esc(c.name)} to ${RELIGIONS[mineFaith[0]].name}`, why ?? `It keeps to it for ${DEVOUT_TURNS} turns whatever presses on it; the units it raises carry it`)}>${icon('faith')} Convert <small>${g.convertCost(c)} faith</small></button>`);
    }
    if (mine && g.canRaze(c)) more.push(`<button data-act="raze" class="danger" ${tip(`Raze ${esc(c.name)}`, 'Burn the city down, a citizen a turn; ruins remain')}>${icon('fire')} Raze</button>`);
    const left = `<div class="cityhead" style="--civ:${p.color};--on:${inkOn(p.color)}"><div class="pop" ${tip('Citizens')}>${c.pop}</div>
        <div class="who"><h3>${capital ? icon('star') : ''}${esc(c.name)}</h3><small>${esc(p.name)}${capital ? ' · capital' : ''}${c.razing ? ' · <span class="bad">being razed</span>' : ''}</small></div></div>
      <div class="ybar">${OUTPUT_KEYS.map((k) => yieldChip(k, String(y[k]))).join('')}</div>
      ${meter('food', 'food', 'Growth', `${c.food}/${cost} · ${signed(y.surplus)} · ${grow}`, c.food / Math.max(1, cost))}
      ${garrison}
      ${place}
      ${focus}
      <div class="sect">${facts}</div>
      ${this.buildingsHtml(c)}
      ${more.length ? `<div class="buttons">${more.join('')}</div>` : ''}`;
    if (!mine) return [left, ''];

    // What it builds, and what it could.
    const turnsFor = (k: BuildKey) => Math.max(1, Math.ceil((buildDef(k).cost - (c.building === k ? c.prod : 0)) / Math.max(1, y.prod)));
    let now = 'Wealth', sub = 'production becomes gold', frac = 0;
    if (c.building) {
      const item = buildDef(c.building);
      now = item.name;
      sub = `${plural(turnsFor(c.building), 'turn')} · ${Math.min(c.prod, item.cost)}/${item.cost}`;
      frac = c.prod / item.cost;
      if (c.building === 'settler' && c.pop < 2) sub += ' · <span class="warn">needs size 2</span>';
      if (isWonder(c.building) && c.wonderTile !== c.tile) sub += ' · on the marked tile';
    }
    const units = BUILDABLE.filter((k) => isUnitKey(k) && g.canBuild(c, k));
    const blds = BUILDABLE.filter((k) => !isUnitKey(k) && !isWonder(k) && g.canBuild(c, k));
    const wonders = BUILDABLE.filter((k) => isWonder(k) && g.canBuild(c, k));
    const row = (k: BuildKey) => {
      const d = buildDef(k);
      let ic: IconKey = 'building', note: string, cls = '';
      if (isUnitKey(k)) {
        const U = unitDef(k);
        ic = unitIcon(k);
        note = U.civilian ? (U.desc ?? '') : `${icon('sword')} ${U.melee}${U.rangedAtk ? ` · ${icon('arrow')} ${U.rangedAtk}` : ''} · ${icon('shield')} ${U.rangedDef} · ${icon('moves')} ${U.mv}`;
      } else if (isWonder(k)) { ic = 'star'; cls = 'wonder'; note = bonusStr(WONDERS[k].yields) || esc(d.desc ?? ''); }
      else note = `${bonusStr(BUILDINGS[k].yields)}${buildingTag(k)}` || esc(d.desc ?? '');
      return `<button class="prow ${cls} ${c.building === k ? 'active' : ''}" data-act="build" data-key="${k}" ${tip(esc(d.name), `${esc(d.desc ?? '')}${d.desc ? ' · ' : ''}${d.cost} production`)}>
        <span class="pic">${icon(ic)}</span><span class="pn"><b>${esc(d.name)}</b><small>${note}</small></span><span class="pt">${turnsFor(k)} t</span></button>`;
    };
    const buyGold = g.buyCost(c, 'gold'), buyFaith = g.buyCost(c, 'faith');
    const buy = buyGold !== null || buyFaith !== null ? `<div class="buttons">${buyGold !== null ? `<button data-act="buy" data-currency="gold" ${p.gold >= buyGold ? '' : 'disabled'}>${icon('gold')} Buy <small>${buyGold} gold</small></button>` : ''}${buyFaith !== null ? `<button data-act="buy" data-currency="faith" ${p.faith >= buyFaith ? '' : 'disabled'} ${c.building && isUnitKey(c.building) ? tip('Raise it with faith', 'It will carry your faith, whatever this city follows') : ''}>${icon('faith')} Buy <small>${buyFaith} faith</small></button>` : ''}</div>` : '';
    const right = `<div class="phead"><h4>${esc(c.name)} is building</h4><div class="now"><b>${esc(now)}</b><small>${sub}</small></div>
        <div class="meter prod"><i style="width:${(100 * Math.min(1, frac)).toFixed(1)}%"></i></div>${buy}</div>
      <div class="plist">
        ${units.length ? `<h5>Units</h5>${units.map(row).join('')}` : ''}
        ${blds.length ? `<h5>Buildings</h5>${blds.map(row).join('')}` : ''}
        ${wonders.length ? `<h5>Wonders · one in the world</h5>${wonders.map(row).join('')}` : ''}
        <h5>Other</h5><button class="prow ${c.building ? '' : 'active'}" data-act="build" data-key="" ${tip('Wealth', 'The city builds nothing: its production becomes gold')}>
          <span class="pic">${icon('gold')}</span><span class="pn"><b>Wealth</b><small>production becomes gold</small></span><span class="pt"></span></button>
      </div>`;
    return [left, right];
  }

  // The city's buildings, specialists and wonders.
  private buildingsHtml(c: City): string {
    const g = this.game;
    const tags: string[] = [];
    for (const w of g.cityWonders(c)) tags.push(`<span class="tag wonder" ${tip(esc(WONDERS[w].name), esc(WONDERS[w].desc))}>${icon('star')}${esc(WONDERS[w].name)}</span>`);
    for (const b of c.buildings) tags.push(`<span class="tag" ${tip(esc(BUILDINGS[b].name), esc(BUILDINGS[b].desc))}>${esc(BUILDINGS[b].name)}</span>`);
    // (A specialist: a click takes one off its work, to be placed again.)
    for (const k of SPECIALIST_KINDS) if (c.specialists[k] > 0) tags.push(c.owner === HUMAN
      ? `<button class="tag" data-act="unspecialist" data-specialist="${k}" ${tip(`Take a ${specialistName(k).toLowerCase()} off its work`, 'To place the citizen elsewhere')}>${icon('person')}${c.specialists[k]} ${specialistName(k).toLowerCase()}${c.specialists[k] > 1 ? 's' : ''} ${icon('close')}</button>`
      : `<span class="tag">${icon('person')}${c.specialists[k]} ${specialistName(k).toLowerCase()}${c.specialists[k] > 1 ? 's' : ''}</span>`);
    return tags.length ? `<div class="sect"><span class="label">In the city</span><div class="tags">${tags.join('')}</div></div>` : '';
  }

  // The tile's tooltip, by the pointer: at once while a unit is selected or
  // something is being placed (the path, the fight, the yields matter
  // then), otherwise once the pointer has rested on the tile a moment.
  private placeTile(): void {
    const box = this.el.tile;
    const show = this.pointer.over && this.tileShown >= 0 && this.drawn.get(box) !== '';
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const w = box.offsetWidth, h = box.offsetHeight;
    const x = this.pointer.x + 22 + w > innerWidth - 8 ? this.pointer.x - 16 - w : this.pointer.x + 22;
    const y = Math.min(innerHeight - h - 8, this.pointer.y + 22);
    box.style.left = `${Math.max(8, x)}px`;
    box.style.top = `${Math.max(52, y)}px`;
  }

  private renderTile(sel: Selection, t: number, placing: Placing): void {
    const box = this.el.tile;
    const g = this.game;
    if (t < 0 || !g.explored[t]) { this.set(box, ''); clearTimeout(this.tileTimer); this.tileShown = -1; this.placeTile(); return; }
    const urgent = (sel?.kind === 'unit' && sel.unit.owner === HUMAN) || placing !== null;
    if (t !== this.tileShown) {
      clearTimeout(this.tileTimer);
      if (urgent) this.tileShown = t;
      else { this.tileShown = -1; this.tileTimer = window.setTimeout(() => { this.tileShown = t; this.placeTile(); }, 380); }
    }
    const y = g.tileYield(t);
    const name = terrainName(g.terrainAt(t));
    const owner = g.ownerOf(t);
    const variant = floraLabel(g.map, g.flora, t);
    const lines = [`<div class="tname"><span>${name}${variant ? ` <small>${esc(variant)}</small>` : ''}</span><span>${yieldStr(y.food, y.prod, y.gold)}</span></div>`];
    const tc = g.cityById.get(g.tileCity[t]);
    if (tc) {
      const u = g.use[t];
      const k = g.improvementAt(t), b = g.builtAt(t);
      const o = g.tileOutput(t);
      // (Improved or not, worked or not, and what a worker would build there.)
      const land = b ? `${IMPROVEMENTS[b].name}${g.pillaged[t] ? ' (pillaged)' : ''}`
        : `Unimproved${k ? ` <small>(${IMPROVEMENTS[k].name.toLowerCase()}${g.underway[t] >= 0 ? `: being built, ${g.improveTurns(t)} turns left` : ' if improved'})</small>` : ''}`;
      const what = u === USE.center ? esc(tc.name) : `${land}${u === USE.rural ? ' · worked' : ''} of ${esc(tc.name)}`;
      lines.push(`${what}${u === USE.wild && !g.wondersAt(t).length ? '' : ` ${outStr(o)}`}`);
    }
    const res = g.resourceFor(t, HUMAN);
    if (res) { const d = resourceDef(res); lines.push(`${icon(resourceIcon(res))} <b>${esc(d.name)}</b> <small>${d.kind}</small> ${outStr(d.yields, true)}${d.kind === 'luxury' ? `<br><small>Its first copy: ${bonusStr(empireBonus(res, g.players[HUMAN]!.era))} to your whole civilization</small>` : d.kind === 'strategic' ? '<br><small>Owned: needed for some units and buildings</small>' : ''}`); }
    if (tc && !g.tilesWithin(tc.tile, 2).includes(t)) lines.push('<small>Beyond its citizens\' reach: held for its resources, not worked</small>');
    for (const w of g.wondersAt(t)) lines.push(`${icon('star')} <b>${esc(WONDERS[w].name)}</b> <small>${esc(WONDERS[w].desc)}</small>`);
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
      lines.push(`Move cost ${g.moveCost(t)}${def ? ` · Defence +${Math.round(def * 100)}%` : ''}`);
    }
    if (g.fort[t]) lines.push(`${icon('fort')} <b>Fort</b> <small>a unit in it defends ${Math.round(100 * FORT_DEFENSE)}% stronger</small>`);
    if (g.road[t]) lines.push(`${icon('road')} Road`);
    if (owner >= 0) lines.push(`<span class="swatch" style="background:${g.players[owner].color}"></span>Territory of the ${esc(g.players[owner].name)}`);
    if (g.visible[t]) {
      const units = g.unitsAt(t);
      if (units.length) lines.push(units.map((u) => `${icon(unitIcon(u.type))} ${esc(g.players[u.owner].name)} ${unitDef(u.type).name} <small>${u.hp} hp</small>`).join('<br>'));
    }
    if (sel?.kind === 'unit' && sel.unit.owner === HUMAN && t !== sel.unit.tile) {
      const u = sel.unit;
      const path = g.findPath(u, t);
      const blocker = g.isForeignBlocked(t, u.owner) ? (g.cityByTile.get(t)?.owner ?? g.unitsAt(t).find((v) => v.owner !== u.owner)?.owner) : undefined;
      if (blocker !== undefined) lines.push(`<span class="bad">At peace with the ${esc(g.players[blocker]!.name)}: declare war (Diplomacy) to attack</span>`);
      else if (!path && !(g.isEnemyOccupied(t, u.owner) && modeOf(g, u, t) === 'ranged' && g.fireReach(u).has(t))) lines.push('<span class="bad">Unreachable</span>');
      else if (g.isEnemyOccupied(t, u.owner) && g.attackBlockAt(u, t, modeOf(g, u, t)) !== null) {
        const mode = modeOf(g, u, t), d = g.bestDefender(t, u.owner, mode);
        lines.push(`<span class="bad">${unitDef(u.type).name} ${g.attackBlockAt(u, t, mode)}${d ? ` (${unitDef(d.type).name})` : ''}</span>`);
      } else if (g.isEnemyOccupied(t, u.owner)) {
        const mode = modeOf(g, u, t), pv = g.combatPreview(u, t, mode);
        const city = g.cityByTile.get(t), how = mode === 'ranged' ? 'Fire' : 'Assault';
        const other = canShoot(u.type) && canAssault(u.type) ? ` <small>(Shift: ${mode === 'ranged' ? 'close in' : 'shoot'})</small>` : '';
        lines.push(pv
          ? `<span class="warn">${icon(mode === 'ranged' ? 'arrow' : 'sword')} ${how}: ${pv.atk.toFixed(1)} against ${pv.def.toFixed(1)} (${unitDef(pv.defender.type).name})${mode === 'ranged' ? (g.fireReach(u).has(t) ? ', unanswered' : ' — out of reach: it moves closer first') : ''}</span>${other}`
          : city ? '<span class="warn">No garrison: walk in and it is yours</span>' : '<span class="warn">Undefended — capture!</span>');
      } else if (path) lines.push(`${icon('moves')} ${plural(g.pathTurns(u, path), 'turn')} away`);
    }
    this.set(box, lines.map((l) => `<div>${l}</div>`).join(''));
    this.placeTile();
  }
}

// The player's attack orders: Shift held (main.ts) turns a unit's attack
// from its usual way (fire, if it can shoot) to the other.
export const attackInput = { swap: false };
// How `u` would attack `t` now, Shift held or not.
export function modeOf(g: Game, u: Unit, t: number): AttackMode {
  const usual = g.attackModeFor(u, t);
  if (!attackInput.swap) return usual;
  const other: AttackMode = usual === 'ranged' ? 'melee' : 'ranged';
  return (other === 'melee' ? canAssault(u.type) : canShoot(u.type)) ? other : usual;
}

// A building's specialist slots, as a small tag in the build list.
function buildingTag(k: BuildingKey): string {
  const s = BUILDINGS[k].specialists;
  return s ? ` <small>${s.slots} ${SPECIALISTS[s.kind].name.toLowerCase()}${s.slots > 1 ? 's' : ''}</small>` : '';
}
