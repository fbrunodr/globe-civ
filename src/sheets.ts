import { HUMAN, DEAL_TURNS, type Game, type Player, type DealSide, type Deal } from './game.ts';
import { TECH_KEYS, techDef, techPath, type TechKey, type TechDef } from './techs.ts';
import {
  POLITICS_KEYS, politicsDef, politicsPath, GOVERNMENT_KEYS, governmentDef, policyDef, fits, SLOT_KINDS, POLICY_KINDS, POLICY_KEYS,
  type PoliticsKey, type PoliticsDef, type GovernmentKey, type PolicyKey, type PolicySlot, type PolicyKind,
} from './politics.ts';
import {
  PATHS, FAITH_KEYS, PAIR_SLOTS, MAX_TRAITS, openSlots, traitDef, pathTraits, traitBlock, pathLevels, epithet, traitOfReligion, BLOCK_TEXT, isTraitKey,
  type PathKey, type TraitKey,
} from './identity.ts';
import { RELIGION_KEYS, religionDef } from './religion.ts';
import { RESOURCE_KEYS, resourceDef, empireBonus, type ResourceKey } from './resources.ts';
import { describe as describeEffect, describeAll, flat } from './effects.ts';
import { ERAS, BUILDINGS, WONDERS, type EraIndex } from './cities.ts';
import { UNITS } from './rules.ts';
import { power, aiAcceptsDeal, resourceWorth } from './ai.ts';
import { outStr, bonusStr } from './ui.ts';

// The empire's sheets: full-screen pages over the map, opened from the top
// bar (data-sheet: the research, politics and identity tracks, and the
// buttons) and closed with Esc.
//   research    the tech tree: click a tech to research it (and what it needs first)
//   politics    the politics tree, likewise (governments and policies)
//   identity    the civ's identity: its paths and traits (identity.ts), to adopt
//   government  three tabs: the government in place and its policies, the
//               policy cards to slot, and the governments to adopt
//   religion    the world's religions and the civ's cities' faith
//   diplomacy   the civs met: at war or peace, declare war, offer or accept peace;
//               trade (resources, gold a turn): offers, deals in force, a proposal
//   log         the game's record of events (gameLog.ts), to download
// They change the game directly and then call `changed` (main.ts redraws).

export type SheetKind = 'research' | 'politics' | 'identity' | 'government' | 'religion' | 'diplomacy' | 'log';
const SHEETS: readonly SheetKind[] = ['research', 'politics', 'identity', 'government', 'religion', 'diplomacy', 'log'];
const isSheet = (s: string): s is SheetKind => (SHEETS as readonly string[]).includes(s);
type GovTab = 'mine' | 'policies' | 'governments';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const KIND_NAME: Record<PolicySlot, string> = { military: 'Military', economic: 'Economic', social: 'Social', wildcard: 'Wildcard' };
const TIER_NAME = ['', 'I', 'II', 'III'] as const;

export class Sheets {
  private open: SheetKind | null = null;
  private readonly el: HTMLElement;
  private govTab: GovTab = 'mine';
  private filter: PolicyKind | 'all' = 'all';
  private target: { slot: PolicySlot; i: number } | null = null;   // the slot a policy card will go to
  private notice = '';
  // The trade being drawn up: with whom, what each side gives.
  private draft: { civ: number; give: ResourceKey | null; get: ResourceKey | null; pay: number; paid: number } | null = null;

  constructor(private readonly game: Game, private readonly changed: () => void, private readonly downloadLog: () => void) {
    this.el = document.getElementById('sheet')!;
    document.body.addEventListener('click', (e) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      const btn = t?.closest<HTMLElement>('[data-sheet]');
      if (btn) { const k = btn.dataset['sheet'] ?? ''; if (isSheet(k)) this.toggle(k); return; }
      if (!t || !this.el.contains(t)) return;
      const act = t.closest<HTMLElement>('[data-do]');
      if (act) this.act(act);
    });
  }

  get isOpen(): boolean { return this.open !== null; }
  private get me(): Player { return this.game.players[HUMAN]!; }

  toggle(k: SheetKind): void { this.open = this.open === k ? null : k; this.notice = ''; this.render(); }
  close(): void { this.open = null; this.render(); }

  render(): void {
    document.querySelectorAll<HTMLElement>('#sheets [data-sheet]').forEach((b) => {
      b.classList.toggle('active', b.dataset['sheet'] === this.open);
      const k = b.dataset['sheet'];
      const pending = (k === 'diplomacy' && ([...this.game.peaceOffers].some((o) => o.endsWith(`>${HUMAN}`)) || this.game.dealOffers.length > 0))
        || (k === 'government' && this.freeSlots() > 0);
      b.querySelector('.dot')?.remove();
      if (pending) b.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
    });
    document.querySelectorAll<HTMLElement>('#empire [data-sheet]').forEach((b) => b.classList.toggle('active', b.dataset['sheet'] === this.open));
    if (!this.open) { this.el.classList.add('hidden'); this.el.innerHTML = ''; return; }
    this.el.classList.remove('hidden');
    const scroll = this.el.querySelector('.body')?.scrollLeft ?? 0, top = this.el.scrollTop;
    const [title, sub, body] = this.page(this.open);
    this.el.innerHTML = `<div class="head"><h2>${title}</h2><span class="sub">${sub}</span><button class="close" data-do="close">Close <kbd>Esc</kbd></button></div><div class="body">${body}</div>`;
    const b = this.el.querySelector('.body');
    if (b) b.scrollLeft = scroll;
    this.el.scrollTop = top;
    if (this.open === 'research' || this.open === 'politics') requestAnimationFrame(() => this.drawLinks());
  }

  // The empty policy slots the civ could fill.
  private freeSlots(): number {
    const p = this.me, have = new Set(SLOT_KINDS.flatMap((s) => p.policies[s]));
    const spare = this.game.policiesOf(p).filter((k) => !have.has(k));
    return SLOT_KINDS.reduce((n, s) => n + p.policies[s].filter((x) => x === null).length * (spare.some((k) => fits(k, s)) ? 1 : 0), 0);
  }

  private act(el: HTMLElement): void {
    const g = this.game, p = this.me, d = el.dataset;
    this.notice = '';
    switch (d['do']) {
      case 'close': this.close(); return;
      case 'tech': g.setResearch(p, d['key'] as TechKey); break;
      case 'politics': g.setPolitics(p, d['key'] as PoliticsKey); break;
      case 'trait': { const k = d['key'] ?? ''; if (isTraitKey(k) && !g.adoptTrait(p, k)) this.notice = 'Not enough identity points yet.'; break; }
      case 'gov': g.setGovernment(p, d['key'] as GovernmentKey); break;
      case 'govTab': this.govTab = d['tab'] as GovTab; this.target = null; break;
      case 'filter': this.filter = d['kind'] as PolicyKind | 'all'; break;
      case 'slot': {
        // A filled slot: take its policy out. An empty one: the next card goes there.
        const slot = d['slot'] as PolicySlot, i = Number(d['i']);
        if (p.policies[slot][i]) { g.setPolicy(p, slot, i, null); this.target = null; }
        else { this.target = { slot, i }; this.govTab = 'policies'; this.filter = slot === 'wildcard' ? 'all' : slot; }
        break;
      }
      case 'card': {
        const k = d['key'] as PolicyKey;
        const at = SLOT_KINDS.find((s) => p.policies[s].includes(k));
        if (at) g.setPolicy(p, at, p.policies[at].indexOf(k), null);
        else if (this.target && fits(k, this.target.slot)) { g.setPolicy(p, this.target.slot, this.target.i, k); this.target = null; }
        else if (!g.slotPolicy(p, k)) this.notice = `No free ${policyDef(k).kind} or wildcard slot: take a policy out first, or change government.`;
        break;
      }
      case 'clearPolicies': for (const s of SLOT_KINDS) p.policies[s].forEach((_, i) => g.setPolicy(p, s, i, null)); break;
      case 'war': g.declareWar(HUMAN, Number(d['civ'])); break;
      case 'peace': g.offerPeace(HUMAN, Number(d['civ'])); break;
      case 'accept': { const from = Number(d['civ']); if (g.peaceOffers.has(`${from}>${HUMAN}`)) g.makePeace(from, HUMAN); break; }
      case 'tradeWith': this.draft = { civ: Number(d['civ']), give: null, get: null, pay: 0, paid: 0 }; break;
      case 'tradePick': {
        if (!this.draft) return;
        const k = (d['key'] ?? '') as ResourceKey, side = d['side'] === 'give' ? 'give' : 'get';
        this.draft[side] = this.draft[side] === k ? null : k;
        break;
      }
      case 'tradeGold': {
        if (!this.draft) return;
        const side = d['side'] === 'pay' ? 'pay' : 'paid';
        this.draft[side] = Math.max(0, this.draft[side] + Number(d['n']));
        break;
      }
      case 'tradeCancel': this.draft = null; break;
      case 'tradePropose': {
        if (!this.draft) return;
        const sides = this.draftSides(this.draft);
        const who = g.players[this.draft.civ]!.name;
        if (g.proposeDeal(sides)) { this.draft = null; this.notice = `The ${who} signed.`; }
        else this.notice = g.dealBlock(sides) ?? `The ${who} decline: offer them more.`;
        break;
      }
      case 'dealAnswer': g.answerDeal(Number(d['i']), d['yes'] === '1'); break;
      case 'download': this.downloadLog(); return;
      default: return;
    }
    this.changed();
  }

  // ---- pages ----

  private page(k: SheetKind): [string, string, string] {
    const p = this.me;
    switch (k) {
      case 'research': return ['Research', this.trackSub('tech'), this.treeHtml('tech')];
      case 'politics': return ['Politics', this.trackSub('politics'), this.treeHtml('politics')];
      case 'identity': return ['Identity', `${Math.floor(p.identityPoints)} identity points · next trait ${this.game.nextTraitCost(p)} · ${p.ledger.income.culture} culture a turn`, this.identityHtml()];
      case 'government': return ['Government', governmentDef(p.government).name, this.governmentHtml()];
      case 'religion': return ['Religion', `${this.game.religions.size} of ${RELIGION_KEYS.length} founded`, this.religionHtml()];
      case 'diplomacy': return ['Diplomacy', 'Relations with the civilizations you have met', this.diplomacyHtml()];
      case 'log': return ['Log', `${this.game.events.length.toLocaleString()} events recorded`, this.logHtml()];
    }
  }

  private trackSub(k: 'tech' | 'politics'): string {
    const p = this.me, rate = k === 'tech' ? p.ledger.income.science : p.ledger.income.cohesion;
    const on = k === 'tech' ? (p.research ? techDef(p.research).name : null) : (p.studying ? politicsDef(p.studying).name : null);
    return `${on ? `On ${esc(on)}` : 'Nothing chosen'} · ${rate} ${k === 'tech' ? 'science' : 'cohesion'} a turn · click any item to work toward it`;
  }

  // What a tech or politics item unlocks, as short labels.
  private unlocksOf(kind: 'tech' | 'politics', k: string): string[] {
    const d: TechDef | PoliticsDef = kind === 'tech' ? techDef(k as TechKey) : politicsDef(k as PoliticsKey);
    return [
      ...(d.units ?? []).map((u) => UNITS[u].name),
      ...(d.buildings ?? []).map((b) => BUILDINGS[b].name),
      ...(d.wonders ?? []).map((w) => WONDERS[w].name),
      ...('governments' in d ? (d.governments ?? []).map((x) => `${governmentDef(x).name} (government)`) : []),
      ...('policies' in d ? (d.policies ?? []).map((x) => policyDef(x).name) : []),
      ...(kind === 'tech' ? RESOURCE_KEYS.filter((r) => resourceDef(r).reveal === k).map((r) => `Reveals ${resourceDef(r).name}`) : []),
      ...('effects' in d ? (d.effects ?? []).map(describeEffect) : []),
    ];
  }

  // A tree: columns by depth (each item one column after the deepest it
  // needs), the era named over each column it begins; connectors drawn
  // after layout (drawLinks).
  private treeHtml(kind: 'tech' | 'politics'): string {
    const p = this.me;
    const keys: readonly string[] = kind === 'tech' ? TECH_KEYS : POLITICS_KEYS;
    const def = (k: string): TechDef | PoliticsDef => (kind === 'tech' ? techDef(k as TechKey) : politicsDef(k as PoliticsKey));
    const depth = new Map<string, number>();
    const depthOf = (k: string): number => {
      const known = depth.get(k);
      if (known !== undefined) return known;
      const needs: readonly string[] = def(k).needs;
      const d = needs.length ? 1 + Math.max(...needs.map((n) => depthOf(n))) : 0;
      depth.set(k, d);
      return d;
    };
    // (Each era begins after the last column of the eras before it.)
    const col = new Map<string, number>();
    let start = 0;
    for (let e = 0; e <= 5; e++) {
      const ks = keys.filter((k) => def(k).era === e);
      if (!ks.length) continue;
      const base = Math.min(...ks.map(depthOf));
      for (const k of ks) col.set(k, Math.max(start, start + depthOf(k) - base));
      start = Math.max(...ks.map((k) => col.get(k)!)) + 1;
    }
    const cols: string[][] = [];
    for (const k of keys) (cols[col.get(k)!] ??= []).push(k);
    const known = kind === 'tech' ? p.techs as ReadonlySet<string> : p.politics as ReadonlySet<string>;
    const current = kind === 'tech' ? p.research : p.studying;
    const queue = new Set<string>(kind === 'tech' ? p.researchQueue : p.politicsQueue);
    const progress = (k: string) => (kind === 'tech' ? p.techProgress[k as TechKey] : p.politicsProgress[k as PoliticsKey]) ?? 0;
    const rate = kind === 'tech' ? p.ledger.income.science : p.ledger.income.cohesion;
    let lastEra = -1;
    const node = (k: string): string => {
      const d = def(k), done = known.has(k);
      const ready = (d.needs as readonly string[]).every((n) => known.has(n));
      const cls = done ? 'done' : k === current ? 'current' : queue.has(k) ? 'queued' : ready ? '' : 'locked';
      const unlocks = this.unlocksOf(kind, k);
      const pathCost = done ? 0 : (kind === 'tech' ? techPath(k as TechKey, p.techs) : politicsPath(k as PoliticsKey, p.politics) as string[])
        .reduce((s, x) => s + def(x).cost - progress(x), 0);
      const turns = done ? '' : rate > 0 ? `${Math.max(1, Math.ceil(pathCost / rate))} t` : '—';
      const bar = !done && progress(k) > 0 ? `<div class="bar ${kind === 'tech' ? 'sci' : 'coh'}"><i style="width:${(100 * progress(k) / d.cost).toFixed(1)}%"></i></div>` : '';
      return `<div class="node ${cls}" data-node="${k}" ${done ? '' : `data-do="${kind}" data-key="${k}"`} title="${d.cost} ${kind === 'tech' ? 'science' : 'cohesion'}">
        <div class="name">${esc(d.name)} <small>${turns}</small></div>
        ${unlocks.length ? `<div class="unlocks">${unlocks.map((u) => `<span>${esc(u)}</span>`).join('')}</div>` : ''}${bar}</div>`;
    };
    const html = cols.map((ks) => {
      const era = Math.min(...ks.map((k) => def(k).era)) as EraIndex;
      const label = era !== lastEra ? ERAS[era].name : '';
      lastEra = era;
      return `<div class="col"><div class="era">${label}</div>${ks.sort((a, b) => def(a).era - def(b).era).map(node).join('')}</div>`;
    }).join('');
    return `<div class="tree" data-tree="${kind}"><svg class="links"></svg>${html}</div>`;
  }

  // Connectors from each item to those it needs, as smooth curves.
  private drawLinks(): void {
    const tree = this.el.querySelector<HTMLElement>('.tree');
    const svg = tree?.querySelector('svg');
    if (!tree || !svg) return;
    const kind = tree.dataset['tree'];
    const box = tree.getBoundingClientRect();
    const at = (k: string) => tree.querySelector<HTMLElement>(`[data-node="${k}"]`)?.getBoundingClientRect();
    const known = kind === 'tech' ? this.me.techs as ReadonlySet<string> : this.me.politics as ReadonlySet<string>;
    const keys: readonly string[] = kind === 'tech' ? TECH_KEYS : POLITICS_KEYS;
    let paths = '';
    for (const k of keys) {
      const to = at(k);
      if (!to) continue;
      const needs: readonly string[] = kind === 'tech' ? techDef(k as TechKey).needs : politicsDef(k as PoliticsKey).needs;
      for (const n of needs) {
        const from = at(n);
        if (!from) continue;
        const x1 = from.right - box.left, y1 = from.top + from.height / 2 - box.top, x2 = to.left - box.left, y2 = to.top + to.height / 2 - box.top;
        const mx = (x1 + x2) / 2;
        paths += `<path class="${known.has(n) ? 'done' : ''}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
      }
    }
    svg.setAttribute('width', String(tree.scrollWidth));
    svg.setAttribute('height', String(tree.scrollHeight));
    svg.innerHTML = paths;
  }

  // ---- identity ----

  private identityHtml(): string {
    const g = this.game, p = this.me, have = p.identity, founded = g.founded();
    const lv = pathLevels(have), afford = p.identityPoints >= g.nextTraitCost(p);
    const name = epithet(have);
    // A pair as a slider: the left path's traits fill its slots from the
    // left, the right one's from the right; the rest are open to either.
    const slider = (a: PathKey): string => {
      const b = PATHS[a].opposite;
      const cells = Array.from({ length: PAIR_SLOTS }, (_, i) => `<i class="${i < lv[a] ? 'a' : i >= PAIR_SLOTS - lv[b] ? 'b' : ''}"></i>`).join('');
      return `<div class="slider"><span>${PATHS[a].name} <b>${lv[a]}</b></span><div class="cells">${cells}</div><span><b>${lv[b]}</b> ${PATHS[b].name}</span></div>`;
    };
    const PAIRS = ['martial', 'devotion', 'openMarket', 'frontier', 'maritime'] as const;
    const profile = PAIRS.map(slider).join('');
    const traitNode = (k: TraitKey): string => {
      const d = traitDef(k), block = traitBlock(k, have, p.era, founded);
      const cls = have.has(k) ? 'adopted' : block ? `blocked ${block}` : afford ? 'open' : 'wait';
      const why = block && block !== 'adopted' ? BLOCK_TEXT[block] : !afford && !have.has(k) ? `Needs ${g.nextTraitCost(p)} identity points` : '';
      const rel = d.religion ? `<div class="tag ${founded.has(d.religion) && !have.has(k) ? 'taken' : ''}">Founds ${religionDef(d.religion).name}</div>` : '';
      return `<div class="trait ${cls}" ${!block && afford ? `data-do="trait" data-key="${k}"` : ''} title="${esc(why)}">
        <div class="name">${esc(d.name)}<small>${ERAS[d.era].name}</small></div><div class="fx">${esc(describeAll(d.effects))}</div>${rel}</div>`;
    };
    const column = (k: PathKey): string => {
      const ts = pathTraits(k);
      const tiers = [0, 1, 2, 3, 4, 5].map((tier) => {
        const row = ts.filter((x) => traitDef(x).tier === tier);
        return `<div class="tier ${tier === 3 ? 'fork' : ''}">${row.map(traitNode).join(tier === 3 ? '<span class="or">or</span>' : '')}</div>`;
      }).join('');
      const faiths = k === 'devotion'
        ? `<div class="faiths"><div class="label">Faiths <small>· adopt one; the first to adopt one founds it</small></div>${FAITH_KEYS.map(traitNode).join('')}</div>` : '';
      return `<div class="path"><div class="phead"><b>${PATHS[k].name}</b><small>${esc(PATHS[k].desc)}</small><small>${openSlots(k, have) - lv[k]} of ${PAIR_SLOTS} slots open</small></div>${tiers}${faiths}</div>`;
    };
    const pairs = PAIRS.map((k) =>
      `<div class="pair"><div class="pslider">${slider(k)}</div>${column(k)}<div class="vs">⟷</div>${column(PATHS[k].opposite)}</div>`).join('');
    return `<p class="note">Identity is who your people are, and it is for good. Culture earns identity points; each trait costs more than the last, and your people take ${MAX_TRAITS} at most. Paths come in opposed pairs, each a slider of ${PAIR_SLOTS} slots shared by both sides: every trait taken on one side closes the last open slot of the other, so you may go all the way down one path, or part of the way down both. A trait needs one of the tier above it in its path and the era it belongs to; the Renaissance tier is a fork: one of its two traits closes the other.</p>
      <div class="profile"><div class="who"><span class="label">Your people</span><b>${name ? `${esc(name)} ${esc(p.name)}` : `${esc(p.name)} <small>· no traits yet</small>`}</b><small>${have.size} of ${MAX_TRAITS} traits · ${Math.floor(p.identityPoints)} points · next ${g.nextTraitCost(p)}</small></div><div class="levels">${profile}</div></div>
      ${this.notice ? `<p class="notice">${esc(this.notice)}</p>` : ''}
      <div class="pairs">${pairs}</div>`;
  }

  // ---- government ----

  private governmentHtml(): string {
    const tab = (k: GovTab, label: string) => `<button class="${this.govTab === k ? 'active' : ''}" data-do="govTab" data-tab="${k}">${label}</button>`;
    const body = this.govTab === 'mine' ? this.myGovernmentHtml() : this.govTab === 'policies' ? this.policiesHtml() : this.governmentsHtml();
    return `<div class="tabs">${tab('mine', 'My government')}${tab('policies', 'Policies')}${tab('governments', 'Governments')}</div>
      ${this.notice ? `<p class="notice">${esc(this.notice)}</p>` : ''}${body}`;
  }

  private policyCard(k: PolicyKey, extra = ''): string {
    const d = policyDef(k);
    return `<div class="pcard ${d.kind} ${extra}" data-do="card" data-key="${k}"><div class="kind">${KIND_NAME[d.kind]}</div><b>${esc(d.name)}</b><div class="fx">${esc(describeAll(d.effects))}</div></div>`;
  }
  // The government's slots, row by kind: a card in each filled one (click:
  // out), an empty one to pick (click: its cards).
  private slotsHtml(compact: boolean): string {
    const p = this.me;
    return SLOT_KINDS.map((s) => {
      const n = p.policies[s].length;
      const cells = n ? p.policies[s].map((k, i) => {
        const picked = this.target?.slot === s && this.target.i === i;
        return k ? `<div class="cell" data-do="slot" data-slot="${s}" data-i="${i}" title="Click to take it out">${this.policyCard(k, 'slotted')}</div>`
          : `<div class="cell empty ${picked ? 'picked' : ''}" data-do="slot" data-slot="${s}" data-i="${i}">${picked ? 'Pick a card →' : 'Empty slot'}</div>`;
      }).join('') : `<div class="none">No ${KIND_NAME[s].toLowerCase()} slots in this government</div>`;
      return `<div class="srow ${s} ${compact ? 'compact' : ''}"><div class="slabel"><span class="label">${KIND_NAME[s]}</span><small>${n}</small></div><div class="cells">${cells}</div></div>`;
    }).join('');
  }
  private govCard(k: GovernmentKey, current: boolean, open: boolean): string {
    const d = governmentDef(k);
    const pips = SLOT_KINDS.flatMap((s) => Array.from({ length: d.slots[s] }, () => `<i class="${s}" title="${KIND_NAME[s]}"></i>`)).join('');
    const from = POLITICS_KEYS.find((c) => (politicsDef(c).governments ?? []).includes(k));
    const action = current ? '<span class="pill">Current</span>' : open ? `<button data-do="gov" data-key="${k}">Adopt</button>` : `<small>Needs ${from ? esc(politicsDef(from).name) : '—'}</small>`;
    return `<div class="govcard ${current ? 'current' : ''} ${open ? '' : 'locked'}"><div class="ghead"><b>${esc(d.name)}</b>${d.tier ? `<small>Tier ${TIER_NAME[d.tier]}</small>` : ''}</div>
      <div class="pips">${pips || '<small>no slots</small>'}</div><div class="fx">${d.effects.length ? esc(describeAll(d.effects)) : 'No bonus'}</div><div class="gfoot">${action}</div></div>`;
  }
  private myGovernmentHtml(): string {
    const p = this.me;
    return `<div class="govmine"><div class="left">${this.govCard(p.government, true, true)}
      <p class="note">Governments and policies can be changed at any time, for free: policies that no longer fit are taken out. Click an empty slot to choose its card; click a card to take it out.</p></div>
      <div class="right">${this.slotsHtml(false)}</div></div>`;
  }
  private policiesHtml(): string {
    const g = this.game, p = this.me;
    const have = new Set(g.policiesOf(p)), used = new Set(SLOT_KINDS.flatMap((s) => p.policies[s]));
    const chips = (['all', ...POLICY_KINDS] as const).map((k) => `<button class="${this.filter === k ? 'active' : ''}" data-do="filter" data-kind="${k}">${k === 'all' ? 'All' : KIND_NAME[k]} <small>${POLICY_KEYS.filter((x) => have.has(x) && (k === 'all' || policyDef(x).kind === k)).length}</small></button>`).join('');
    const cards = POLICY_KEYS.filter((k) => have.has(k) && (this.filter === 'all' || policyDef(k).kind === this.filter))
      .map((k) => this.policyCard(k, `${used.has(k) ? 'inuse' : ''} ${this.target && !fits(k, this.target.slot) ? 'nofit' : ''}`)).join('');
    const locked = POLICY_KEYS.length - have.size;
    return `<div class="govpolicies"><div class="left">${this.slotsHtml(true)}<div class="buttons"><button data-do="clearPolicies">Clear all</button></div></div>
      <div class="right"><div class="chips">${chips}</div>
        <div class="cards">${cards || '<p class="note">No policies of this kind yet: politics unlock them.</p>'}</div>
        <p class="note">${locked} more policies to unlock through politics. Click a card to put it in a free slot of its kind (or a wildcard); click it again to take it out.</p></div></div>`;
  }
  private governmentsHtml(): string {
    const p = this.me, have = this.game.governmentsOf(p);
    const cols = ([0, 1, 2, 3] as const).map((tier) => {
      const ks = GOVERNMENT_KEYS.filter((k) => governmentDef(k).tier === tier);
      return `<div class="gcol"><div class="era">${tier ? `Tier ${TIER_NAME[tier]}` : 'First'}</div>${ks.map((k) => this.govCard(k, p.government === k, have.includes(k))).join('')}</div>`;
    }).join('');
    return `<div class="gcols">${cols}</div>`;
  }

  private religionHtml(): string {
    const g = this.game, p = this.me;
    const rows = RELIGION_KEYS.map((r) => {
      const d = religionDef(r), f = g.religions.get(r);
      const holy = f?.holyCity != null ? g.cityById.get(f.holyCity) : undefined;
      const followers = g.cities.filter((c) => c.religion === r).length;
      return `<tr><td><span class="swatch" style="background:${d.color}"></span> ${d.name}</td><td>${esc(traitDef(traitOfReligion(r)).name)}</td>
        <td>${f ? esc(g.players[f.founder]!.name) : '<small>not yet founded</small>'}</td><td>${holy ? esc(holy.name) : '—'}</td>
        <td class="num">${followers}</td><td>${outStr(flat(d.follower, 'follower'), true)}</td></tr>`;
    }).join('');
    const mine = g.cities.filter((c) => c.owner === p.id);
    const cities = mine.length ? mine.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.religion ? religionDef(c.religion).name : '<small>none</small>'}</td></tr>`).join('') : '';
    return `<p class="note">A religion is founded by the first civilization to adopt its faith, a trait of the Devotion path of identity (Meditation founds Hinduism); a civilization adopts one faith at most. It spreads from its holy city to the cities around it, whoever owns them; Shrines and Temples press it harder. Each city following a religion gets its bonus; the founder takes 1 gold a turn from every city following it.</p>
      <table class="grid"><tr><th>Religion</th><th>Faith (identity)</th><th>Founder</th><th>Holy city</th><th>Cities</th><th>Bonus per city</th></tr>${rows}</table>
      ${cities ? `<h3>Your cities</h3><table class="grid"><tr><th>City</th><th>Follows</th></tr>${cities}</table>` : ''}`;
  }

  private diplomacyHtml(): string {
    const g = this.game, mine = power(g, HUMAN);
    const others = g.players.filter((o) => o.id !== HUMAN && o.alive && g.met[HUMAN]![o.id]);
    if (!others.length) return '<p class="note">You have not met another civilization yet. Civilizations meet when their units or cities come within sight of each other.</p>';
    const rows = others.map((o) => {
      const r = g.relations[HUMAN]![o.id]!, war = r.war;
      const theirs = power(g, o.id), ratio = mine > 0 ? theirs / mine : Infinity;
      const strength = ratio > 1.4 ? 'Much stronger' : ratio > 1.1 ? 'Stronger' : ratio > 0.9 ? 'Even' : ratio > 0.6 ? 'Weaker' : 'Much weaker';
      const offered = g.peaceOffers.has(`${o.id}>${HUMAN}`);
      const wait = war ? Math.max(0, r.since + 8 - g.turn) : 0;
      const action = !war ? `<button class="danger" data-do="war" data-civ="${o.id}">Declare war</button>`
        : offered ? `<button class="primary" data-do="accept" data-civ="${o.id}">Accept peace</button>`
        : g.canMakePeace(HUMAN, o.id) ? `<button data-do="peace" data-civ="${o.id}">Offer peace</button>` : `<small>Peace possible in ${wait} turns</small>`;
      const cities = g.cities.filter((c) => c.owner === o.id).length;
      const known = epithet(o.identity);
      const trade = g.canTrade(HUMAN, o.id) ? `<button data-do="tradeWith" data-civ="${o.id}" class="${this.draft?.civ === o.id ? 'active' : ''}">Trade</button>` : '';
      return `<tr><td><span class="swatch" style="background:${o.color}"></span> ${esc(o.name)}${known ? ` <small>${esc(known)}</small>` : ''}</td><td><span class="pill ${war ? 'war' : 'peace'}">${war ? `War since turn ${r.since}` : 'Peace'}</span></td>
        <td>${esc(governmentDef(o.government).name)}</td><td class="num">${cities}</td><td>${strength}</td><td>${trade}</td><td>${action}</td></tr>`;
    }).join('');
    return `<p class="note">Everyone starts at peace. At peace, units cannot enter each other's tiles; attacking a civilization declares war. A war lasts at least 8 turns before peace can be made. An AI accepts peace when the war is going badly for it, or has lasted long.</p>
      <table class="grid"><tr><th>Civilization</th><th>Relation</th><th>Government</th><th>Cities</th><th>Military vs yours</th><th></th><th></th></tr>${rows}</table>
      ${this.tradeHtml()}`;
  }

  // ---- trade ----

  private draftSides(d: NonNullable<Sheets['draft']>): [DealSide, DealSide] {
    return [{ civ: HUMAN, resource: d.give, gold: d.pay }, { civ: d.civ, resource: d.get, gold: d.paid }];
  }
  private dealText(d: Deal): string {
    const side = (s: DealSide) => [s.resource ? resourceDef(s.resource).name : '', s.gold ? `${s.gold} gold a turn` : ''].filter(Boolean).join(' + ') || 'nothing';
    const mine = d.sides.find((s) => s.civ === HUMAN)!, theirs = d.sides.find((s) => s.civ !== HUMAN)!;
    return `<td><span class="swatch" style="background:${this.game.players[theirs.civ]!.color}"></span> ${esc(this.game.players[theirs.civ]!.name)}</td><td>${side(mine)}</td><td>${side(theirs)}</td>`;
  }
  // What a resource does for whoever takes it.
  private goodsNote(k: ResourceKey, to: Player): string {
    const d = resourceDef(k);
    return d.kind === 'luxury' ? bonusStr(empireBonus(k, to.era)) : `<small>${d.kind}${resourceWorth(this.game, to, k) > 2 ? ' · needed' : ''}</small>`;
  }

  private tradeHtml(): string {
    const g = this.game, p = this.me;
    const luxuries = g.luxuriesOf(HUMAN), imported = new Set(g.imports(HUMAN)), spare = g.spareResources(HUMAN);
    const lux = luxuries.length
      ? luxuries.map((k) => `<tr><td>${esc(resourceDef(k).name)}</td><td>${imported.has(k) && !g.ownedResources(HUMAN).has(k) ? 'Traded in' : 'Your land'}</td><td>${bonusStr(empireBonus(k, p.era))}</td><td class="num">${spare.get(k) ?? 0}</td></tr>`).join('')
      : '<tr><td colspan="4"><small>None yet: settle near luxuries, or trade for them.</small></td></tr>';
    const offers = g.dealOffers.map((d, i) => `<tr>${this.dealText(d)}<td><small>${DEAL_TURNS} turns</small></td><td><button class="primary" data-do="dealAnswer" data-i="${i}" data-yes="1">Accept</button> <button data-do="dealAnswer" data-i="${i}" data-yes="0">Decline</button></td></tr>`).join('');
    const mine = g.deals.filter((d) => d.sides.some((s) => s.civ === HUMAN));
    const deals = mine.map((d) => `<tr>${this.dealText(d)}<td class="num">${d.until - g.turn}</td></tr>`).join('');
    const strategics = [...spare].filter(([k]) => resourceDef(k).kind !== 'luxury');
    return `<h3>Trade</h3>${!this.draft && this.notice ? `<p class="notice">${esc(this.notice)}</p>` : ''}
      <p class="note">The first copy of each luxury gives your whole civilization its bonus every turn, mostly cohesion, and it grows with the era. More copies add nothing, so you can trade them: a spare copy (you always keep one) for another civilization's goods or for gold a turn, for ${DEAL_TURNS} turns. A strategic resource you trade for lets you build what needs it. A war, losing the spare tile, or a payer running out of gold ends a deal.</p>
      ${offers ? `<h3>Offers to you</h3><table class="grid"><tr><th>From</th><th>You give</th><th>You get</th><th>Term</th><th></th></tr>${offers}</table>` : ''}
      ${this.draftHtml()}
      <h3>Your luxuries</h3><table class="grid"><tr><th>Luxury</th><th>From</th><th>Bonus to your civilization</th><th>Spare copies</th></tr>${lux}</table>
      ${strategics.length ? `<p class="note">Spare strategic copies: ${strategics.map(([k, n]) => `${esc(resourceDef(k).name)} ×${n}`).join(', ')}.</p>` : ''}
      ${deals ? `<h3>Deals in force</h3><table class="grid"><tr><th>With</th><th>You give</th><th>You get</th><th>Turns left</th></tr>${deals}</table>` : ''}`;
  }

  private draftHtml(): string {
    const g = this.game, d = this.draft;
    if (!d || !g.canTrade(HUMAN, d.civ)) return '';
    const o = g.players[d.civ]!;
    const chips = (keys: ResourceKey[], side: 'give' | 'get', to: Player) => keys.length
      ? keys.map((k) => `<button class="tchip ${d[side] === k ? 'picked' : ''}" data-do="tradePick" data-side="${side}" data-key="${k}"><b>${esc(resourceDef(k).name)}</b> ${this.goodsNote(k, to)}</button>`).join('')
      : '<small class="none">No spare goods the other side lacks.</small>';
    const gold = (side: 'pay' | 'paid') => `<div class="tgold"><span>Gold a turn</span>${[-5, -1].map((n) => `<button data-do="tradeGold" data-side="${side}" data-n="${n}">${n}</button>`).join('')}<b>${d[side]}</b>${[1, 5].map((n) => `<button data-do="tradeGold" data-side="${side}" data-n="${n}">+${n}</button>`).join('')}</div>`;
    const sides = this.draftSides(d), block = g.dealBlock(sides);
    const verdict = block ?? (aiAcceptsDeal(g, o, sides) ? `The ${esc(o.name)} would accept.` : `The ${esc(o.name)} want more.`);
    return `<h3>Trade with the ${esc(o.name)}</h3>
      <div class="tradebox">
        <div class="tside"><span class="label">You give</span><div class="tchips">${chips(g.tradeable(HUMAN, o.id), 'give', o)}</div>${gold('pay')}</div>
        <div class="tside"><span class="label">The ${esc(o.name)} give</span><div class="tchips">${chips(g.tradeable(o.id, HUMAN), 'get', this.me)}</div>${gold('paid')}</div>
      </div>
      <div class="tfoot"><span class="${block ? 'bad' : ''}">${verdict}</span>${this.notice ? ` <b>${esc(this.notice)}</b>` : ''}<span class="grow"></span><button data-do="tradeCancel">Cancel</button> <button class="primary" data-do="tradePropose" ${block ? 'disabled' : ''}>Propose for ${DEAL_TURNS} turns</button></div>`;
  }

  private logHtml(): string {
    const g = this.game;
    const mine = g.events.filter((e) => e.player === HUMAN && e.kind !== 'move' && e.kind !== 'summary').slice(-40).reverse();
    const rows = mine.map((e) => `<tr><td class="num">${e.turn}</td><td>${e.kind}</td><td><small>${esc(JSON.stringify(e.data))}</small></td></tr>`).join('');
    return `<p class="note">Every action of every player, human and computer, is recorded each turn (moves, research, politics, identity, policies, battles, cities, diplomacy, and a summary of each civilization's accounts). In development the record is also written to <b>logs/</b> in the project folder as the game goes.</p>
      <div class="buttons"><button data-do="download">Download the full log (JSON lines)</button></div>
      <h3>Your recent actions</h3><table class="grid"><tr><th>Turn</th><th>Kind</th><th>Details</th></tr>${rows}</table>`;
  }
}
