import { buildFlora, type Flora } from './flora.ts';
import type { ArchCiv } from './architecture.ts';
import type { Globe, Tile } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import { generateWorld, type World } from './world.ts';
import { tileYieldOf } from './mapRules.ts';
import { mulberry32, type Rng } from './rng.ts';
import {
  unitDef, buildDef, isUnitKey, isWonder, UNITS, BUILDINGS, CIVS, growthCost, UPGRADES,
  type UnitKey, type BuildingKey, type BuildKey, type MapSizeKey, type MapScriptKey,
} from './rules.ts';
import {
  isWaterBiome, terrainMoveCost, terrainDefense,
  type BiomeKey, type ReliefKey, type FeatureKey, type TileTerrain, type Yields,
} from './terrain.ts';
import { aiTurn, aiPickTech, aiPickPolitics, aiGovern, aiAcceptsPeace, aiAcceptsDeal, aiPickTraits } from './ai.ts';
import {
  USE, FOOD_PER_CITIZEN, ZERO, CITY_REACH, START_REACH, tileCost, GROWTH_TURNS, SPECIALIST_KINDS, AQUEDUCT_KEEP, BUILDINGS as CITY_BUILDINGS,
  addOut, scaleOut, centerYield, ruralYield, improvementFor, governorScore, specialistsWanted, borderRing,
  buildingsYield, withPercents, wonderBeside, specialistYield, specialistSlots, buildingAllowed, weigh, WONDERS, WONDER_KEYS, ERAS,
  type FocusKey, type GrowthOption, type TileUse, type Output, type SpecialistKind, type WonderKey, type WonderSite, type EraIndex, type ImprovementKey,
} from './cities.ts';
import { IMPROVEMENTS, out, OUTPUT_KEYS } from './cities.ts';
import { techDef, techPath, improvementStage, type TechKey } from './techs.ts';
import { politicsDef, politicsPath, GOVERNMENTS, governmentDef, policyDef, fits, SLOT_KINDS, type PoliticsKey, type GovernmentKey, type PolicyKey, type PolicySlot } from './politics.ts';
import { traitDef, traitBlock, traitCost, type TraitKey } from './identity.ts';
import { religionDef, PRESSURE_REACH, HOLY_PRESSURE, CITY_PRESSURE, BUILDING_PRESSURE, CONVERT_AT, TITHE, type ReligionKey } from './religion.ts';
import { placeResources, resourceDef, empireBonus, RESOURCE_IMPROVEMENT, type ResourceKey } from './resources.ts';
import { total, yieldBonus, prodBonus, flat, tileBonus, specialistBonus, movesBonus, type Effect, type ProdTarget } from './effects.ts';
import { cityUpkeep, unitUpkeep, buildingUpkeep, inflation, SHORTFALL_SCIENCE, WEALTH_RATE } from './economy.ts';
import type { GameEvent, GameEventKind } from './gameLog.ts';


export const HUMAN = 0;

export type Yield = Yields;

export interface CityYield extends Output {
  surplus: number;
}

export interface Player {
  id: number;
  name: ArchCiv;
  color: string;
  cityNames: string[];
  isHuman: boolean;
  alive: boolean;
  gold: number;
  science: number; // totals so far
  culture: number;
  cohesion: number;
  faith: number;
  era: EraIndex;
  citiesFounded: number;
  offensive: boolean; // AI only
  // Research and politics: what it knows, what it is on (and the goals
  // after it), progress toward each (kept if it switches away), and what it
  // made with nothing chosen (spent on the next one chosen).
  techs: Set<TechKey>;
  research: TechKey | null;
  researchQueue: TechKey[];
  techProgress: Partial<Record<TechKey, number>>;
  scienceBank: number;
  politics: Set<PoliticsKey>;
  studying: PoliticsKey | null;
  politicsQueue: PoliticsKey[];
  politicsProgress: Partial<Record<PoliticsKey, number>>;
  cohesionBank: number;
  // Identity (identity.ts): the traits it adopted, and the identity points
  // (culture) it has to spend.
  identity: Set<TraitKey>;
  identityPoints: number;
  government: GovernmentKey;
  policies: Record<PolicySlot, (PolicyKey | null)[]>;
  capital: number | null;    // the city with its palace (the first it founded, or the oldest left)
  goldFrac: number;          // the treasury's fraction of a gold (upkeep is fractional)
  ledger: Ledger;            // last turn's accounts, for the panels
}

// A civ's accounts for a turn.
export interface Ledger {
  readonly income: Output;       // what its cities made (gold before upkeep)
  readonly cityUpkeep: number;
  readonly unitUpkeep: number;
  readonly tithes: number;       // from cities following its religion
  readonly luxuries: Output;     // its luxuries' empire bonus (in income too)
  readonly trade: number;        // gold a turn from its deals (paid: negative)
}
const EMPTY_LEDGER: Ledger = { income: ZERO, cityUpkeep: 0, unitUpkeep: 0, tithes: 0, luxuries: ZERO, trade: 0 };

// Relations between two civs: at peace (the start), or at war since a turn.
export interface Relation { war: boolean; since: number }
// War, peace: a war lasts at least MIN_WAR turns before peace can be made.
export const MIN_WAR = 8;

// A trade between two civs at peace, for DEAL_TURNS: what each side gives,
// a resource (a spare copy: it keeps one for itself) and gold a turn, or
// either. The resource counts as the taker's while the deal holds (a
// luxury's empire bonus, a strategic's units and buildings) but yields
// nothing on a tile. A war between them, a spare copy lost, or a payer
// out of gold ends it.
export interface DealSide { readonly civ: number; readonly resource: ResourceKey | null; readonly gold: number }
export interface Deal { readonly sides: readonly [DealSide, DealSide]; readonly until: number }
export const DEAL_TURNS = 30;
// The capital's palace.
export const PALACE = { prod: 1, gold: 2, science: 2, culture: 2 } as const;
// A rival city takes a border tile when its culture presses this much harder.
export const CLASH_MARGIN = 1.5;
// The most a civ's effects take off the food to grow (%).
export const GROWTH_CUT_MAX = 40;
// Buying: gold per point of production left (faith for religious buildings).
export const GOLD_PER_PROD = 3;
export const FAITH_PER_PROD = 2;
const FAITH_BUYS: readonly BuildKey[] = ['shrine', 'temple'];
// What anyone can build from the start (the rest: techs.ts, politics.ts).
const STARTING: readonly BuildKey[] = ['warrior', 'scout', 'settler', 'monument'];

// ---- combat (shared with the Units page's battle sandbox) ----
// Fortified, a unit defends this much better.
export const FORTIFY_BONUS = 0.5;
// A unit's strength attacking, or defending with a bonus (a fraction:
// ground, city, fortified), weakened as it is hurt (half at no HP).
export function combatStrength(type: UnitKey, role: 'atk' | 'def', hp: number, bonus: number): number {
  const T = unitDef(type);
  return (role === 'atk' ? T.atk : T.def * (1 + bonus)) * (0.5 + 0.5 * hp / 100);
}
// A fight between strengths A and D: exchanges of 18-31 damage, each won by
// the attacker with odds A / (A + D), until one side has no HP left. A
// ranged attack is a volley: three exchanges at most, half the damage back.
// The HP each side is left with (at or below 0: destroyed).
export function fightRounds(hpA: number, hpD: number, A: number, D: number, ranged: boolean, rng: () => number): { attacker: number; defender: number } {
  for (let round = 0; hpA > 0 && hpD > 0 && (!ranged || round < 3); round++) {
    const dmg = 18 + Math.floor(rng() * 14);
    if (rng() < A / (A + D)) hpD -= dmg; else hpA -= ranged ? Math.round(dmg / 2) : dmg;
  }
  return { attacker: hpA, defender: hpD };
}

// ---- one unit per tile, and commanders ----
// A tile holds at most one military unit and one civilian of a player (a
// unit's slot). A commander leads an army: up to COMMANDER_CAPACITY military
// units rallied from its tile and the tiles next to it, carried with it
// (packed: off the map, on its tile) until it deploys them there again. It
// takes the civilian slot, so a fighting unit may stand with it.
export type Slot = 'military' | 'civilian';
export const slotOf = (type: UnitKey): Slot => (unitDef(type).civilian || type === 'commander' ? 'civilian' : 'military');
export const COMMANDER_CAPACITY = 4;

export interface Unit {
  id: number;
  type: UnitKey;
  owner: number;
  tile: number;
  packedIn: number | null;             // the commander carrying it (its tile is the commander's)
  moves: number;
  hp: number;
  fortified: boolean;
  skipped: boolean;
  goal: number | null;
  dead: boolean;
  aiTarget: number | null;
}

export interface City {
  id: number;
  name: string;
  owner: number;
  tile: number;
  pop: number;
  food: number;
  prod: number;
  building: BuildKey | null;
  buildings: Set<BuildingKey>;
  founded: number;
  focus: FocusKey;
  growth: number; // citizens born but not yet placed (the human places them)
  specialists: Record<SpecialistKind, number>; // in its buildings' slots, by kind
  wonderTile: number | null;           // where the wonder being built will stand (the center, or a mountain top)
  bought: number;                      // tiles bought (each costs more: cities.ts tileCost)
  hp: number;                          // the center's hit points (0: a melee unit can take it)
  founder: number;                     // the civ that founded it
  razing: boolean;                     // burning down, a citizen a turn
  religion: ReligionKey | null;        // the religion it follows
  culture: number;                     // culture it made so far (its borders grow with it)
  ring: number;                        // how far its borders reach (cities.ts borderRing)
}

// Sieges (design doc "Cities: Feel & Play", war): a city's center has hit
// points and strikes nearby enemies; it falls when its hit points are gone
// and a melee unit enters.
export const CITY_HP = 100;
export const WALLS_HP = 50;
export const CITY_REGEN = 15;        // hit points back per turn
export const PILLAGE_REPAIR = 3;     // turns to repair a pillaged tile once no enemy stands on it
export const PILLAGE_GOLD = 15;
// Where a fallen wonder was (its city razed): never to be rebuilt.
const FALLEN = -1;
// A government's slots, all empty.
const emptySlots = (g: GovernmentKey): Record<PolicySlot, (PolicyKey | null)[]> =>
  Object.fromEntries(SLOT_KINDS.map((s) => [s, new Array(GOVERNMENTS[g].slots[s]).fill(null)])) as Record<PolicySlot, (PolicyKey | null)[]>;
const noSpecialists = (): Record<SpecialistKind, number> =>
  Object.fromEntries(SPECIALIST_KINDS.map((k) => [k, 0])) as Record<SpecialistKind, number>;

export interface CombatPreview {
  atk: number;
  def: number;
  defender: Unit;
}

export interface Message {
  turn: number;
  text: string;
}

export interface GameOptions {
  size: MapSizeKey;
  seed: number;
  script?: MapScriptKey;
  // Every civ a player (the City Lab): those past the map's starts begin with no units.
  everyCiv?: boolean;
}

// Pure game state + rules. Knows nothing about rendering or the DOM.
export class Game {
  readonly seed: number;
  readonly globe: Globe;
  readonly tiles: Tile[];
  readonly N: number;
  readonly biome: BiomeKey[];
  readonly relief: ReliefKey[];
  readonly feature: (FeatureKey | null)[];
  readonly map: MapData;
  readonly flora: Flora; // which variant of its biome each tile shows (visual only)
  readonly world: World;
  readonly rng: Rng;

  turn = 1;
  private nextId = 1;
  units: Unit[] = [];
  // Told of every attack as it starts (the renderer shows the fight).
  onBattle: ((u: Unit, tile: number, ranged: boolean) => void) | null = null;
  cities: City[] = [];
  readonly cityById = new Map<number, City>();
  readonly cityByTile = new Map<number, City>();
  readonly tileCity: Int32Array; // territory: owning city id, or -1
  readonly use: Uint8Array;         // TileUse of each tile (cities.ts); wild unless a city developed it
  readonly pillaged: Uint8Array;    // turns of repair left on a pillaged rural tile (0 = fine)
  readonly ruins: Uint8Array;       // 1 where a razed city stood
  readonly drained: Uint8Array;     // 1 where a peat bog was drained to be worked (its feature is gone; its ground stays dry)
  readonly wondersBuilt = new Map<WonderKey, number>(); // wonder -> its tile (its city's center, or a mountain top; FALLEN)
  useVersion = 0;                   // bumped whenever a tile's use changes (for the renderer)
  readonly explored: Uint8Array;
  readonly visible: Uint8Array;
  readonly messages: Message[] = [];
  readonly players: Player[];
  over: 'victory' | 'defeat' | null = null;
  readonly resources: (ResourceKey | null)[];  // the resource on each tile (resources.ts)
  readonly religions = new Map<ReligionKey, { founder: number; holyCity: number | null; turn: number }>();
  readonly relations: Relation[][];             // [a][b], symmetric
  readonly met: Uint8Array[];                   // [a][b]: a has met b
  readonly peaceOffers = new Set<string>();     // "from>to": peace offered, not yet answered
  readonly deals: Deal[] = [];                  // trades in force
  readonly dealOffers: Deal[] = [];             // trades the computer offered the human, for this turn (sides[0]: the offerer)
  readonly events: GameEvent[] = [];            // everything every player did (gameLog.ts)

  constructor({ size, seed, script = 'continents', everyCiv = false }: GameOptions) {
    this.seed = seed;
    this.world = generateWorld(size, seed, script);
    this.globe = this.world.globe;
    this.tiles = this.globe.tiles;
    this.N = this.tiles.length;
    this.map = this.world.map;
    this.biome = this.map.biome;
    this.relief = this.map.relief;
    this.feature = this.map.feature;
    this.flora = buildFlora(this.globe, this.map, seed);
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.tileCity = new Int32Array(this.N).fill(-1);
    this.use = new Uint8Array(this.N);
    this.pillaged = new Uint8Array(this.N);
    this.ruins = new Uint8Array(this.N);
    this.drained = new Uint8Array(this.N);
    this.explored = new Uint8Array(this.N);
    this.visible = new Uint8Array(this.N);

    this.players = (everyCiv ? CIVS : CIVS.slice(0, this.world.starts.length)).map((civ, id) => ({
      id, name: civ.name, color: civ.color, cityNames: civ.cities,
      isHuman: id === HUMAN, alive: true, gold: 0, science: 0, culture: 0, cohesion: 0, faith: 0, era: 0, citiesFounded: 0, offensive: false,
      techs: new Set(), research: null, researchQueue: [], techProgress: {}, scienceBank: 0,
      politics: new Set(), studying: null, politicsQueue: [], politicsProgress: {}, cohesionBank: 0,
      identity: new Set(), identityPoints: 0,
      government: 'chiefdom', policies: emptySlots('chiefdom'), capital: null, goldFrac: 0, ledger: EMPTY_LEDGER,
    }));
    const n = this.players.length;
    this.relations = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ war: false, since: 0 })));
    this.met = Array.from({ length: n }, () => new Uint8Array(n));
    this.resources = placeResources(this.globe, this.map, this.world.starts, seed).at;

    this.placeUnits();
    this.updateVisibility();
    this.record('start', -1, { seed, size, script, players: this.players.map((p) => p.name) });
  }

  // ---------- the record ----------

  record(kind: GameEventKind, player: number, data: Record<string, unknown> = {}): void {
    this.events.push({ turn: this.turn, player, kind, data });
  }

  // ---------- queries ----------

  terrainAt(t: number): TileTerrain {
    return { biome: this.biome[t], relief: this.relief[t], feature: this.feature[t] };
  }

  isWater(t: number): boolean { return isWaterBiome(this.biome[t]); }

  tileYield(t: number): Yield { return tileYieldOf(this.map, t); }

  moveCost(t: number): number { return terrainMoveCost(this.terrainAt(t)); }

  defenseBonus(t: number): number { return terrainDefense(this.terrainAt(t)); }

  ownerOf(t: number): number {
    const c = this.tileCity[t];
    return c < 0 ? -1 : this.cityById.get(c)!.owner;
  }

  // The units standing on a tile (not those packed in an army there).
  unitsAt(t: number): Unit[] { return this.units.filter((u) => u.tile === t && u.packedIn === null); }

  // A commander's army: the units packed in it.
  armyOf(c: Unit): Unit[] { return this.units.filter((u) => u.packedIn === c.id); }

  // Whether a unit could stand on a tile: dry, and its slot there free of
  // its owner's other units (an enemy there is a fight, not a place).
  canStand(u: { type: UnitKey; owner: number; id?: number }, t: number): boolean {
    if (this.isWater(t)) return false;
    const slot = slotOf(u.type);
    return !this.units.some((v) => v.tile === t && v.packedIn === null && v.id !== u.id && v.owner === u.owner && slotOf(v.type) === slot);
  }

  // The nearest tile to t (t itself first) where a new unit of its type can
  // stand, free of enemies; null if none within a few rings.
  freeTileNear(type: UnitKey, owner: number, t: number): number | null {
    const near = [...this.tilesWithinMap(t, 3)].sort((a, b) => a[1] - b[1]);
    for (const [x] of near) if (this.canStand({ type, owner }, x) && !this.isEnemyOccupied(x, owner) && this.relief[x] !== 'mountains') return x;
    return null;
  }

  // A tile with a city or units of a civ at war with `owner` (moving there is a fight).
  isEnemyOccupied(t: number, owner: number): boolean {
    const city = this.cityByTile.get(t);
    if (city && city.owner !== owner && this.atWar(owner, city.owner)) return true;
    return this.units.some((u) => u.tile === t && u.packedIn === null && u.owner !== owner && this.atWar(owner, u.owner));
  }

  // A tile with a city or units of a civ `owner` is at peace with: no way through.
  isForeignBlocked(t: number, owner: number): boolean {
    const city = this.cityByTile.get(t);
    if (city && city.owner !== owner && !this.atWar(owner, city.owner)) return true;
    return this.units.some((u) => u.tile === t && u.packedIn === null && u.owner !== owner && !this.atWar(owner, u.owner));
  }

  canAttack(u: Unit): boolean { return unitDef(u.type).atk > 0; }

  // tile -> graph distance, for all tiles within r steps of t.
  tilesWithinMap(t: number, r: number): Map<number, number> {
    const dist = new Map<number, number>([[t, 0]]);
    let frontier = [t];
    for (let d = 1; d <= r; d++) {
      const next: number[] = [];
      for (const f of frontier) {
        for (const nb of this.tiles[f].neighbors) {
          if (!dist.has(nb)) { dist.set(nb, d); next.push(nb); }
        }
      }
      frontier = next;
    }
    return dist;
  }

  tilesWithin(t: number, r: number): number[] { return [...this.tilesWithinMap(t, r).keys()]; }

  // Approximate tile distance using the angle between tile centers.
  approxDist(a: number, b: number): number {
    return this.tiles[a].center.angleTo(this.tiles[b].center) / this.globe.avgEdgeAngle;
  }

  // Pentagons (12 on the globe) are never built up: no city. Farms are fine.
  isPentagon(t: number): boolean { return this.tiles[t].corners.length !== 6; }

  canFoundCity(t: number, owner: number): boolean {
    if (this.isPentagon(t)) return false;
    if (this.isWater(t) || this.relief[t] === 'mountains' || this.biome[t] === 'iceSheet') return false;
    const f = this.feature[t];
    if (f === 'volcano' || f === 'glacier') return false;
    const o = this.ownerOf(t);
    if (o !== -1 && o !== owner) return false;
    if (this.use[t] !== USE.wild) return false;
    return !this.tilesWithin(t, 2).some((x) => this.cityByTile.has(x));
  }

  siteScore(t: number): number {
    let s = 0;
    for (const x of this.tilesWithin(t, 2)) {
      if (this.ownerOf(x) !== -1) continue;
      const y = this.tileYield(x);
      s += (y.food * 1.5 + y.prod + y.gold * 0.5) * (this.isWater(x) ? 0.6 : 1);
    }
    return s;
  }

  // ---------- pathfinding ----------

  // A* over the tile graph. Returns the tiles to step through (excluding the
  // start), or null if unreachable. Enemy-occupied tiles are only allowed as
  // the final destination (that step becomes an attack). Tiles where the
  // unit's own side already has a unit of its slot are gone round (one
  // unit per tile), but for the goal next to it: that step is a swap.
  findPath(u: Unit, goal: number): number[] | null {
    if (goal === u.tile) return [];
    if (this.isWater(goal) || this.isForeignBlocked(goal, u.owner)) return null;
    if (this.isEnemyOccupied(goal, u.owner) && !this.canAttack(u)) return null;
    const swap = this.tiles[u.tile].neighbors.includes(goal) && this.swapPartner(u, goal) !== null;
    if (!swap && !this.canStand(u, goal) && !this.isEnemyOccupied(goal, u.owner)) return null;

    const tiles = this.tiles;
    const goalC = tiles[goal].center;
    const hScale = 1 / this.globe.maxEdgeAngle;
    const h = (t: number) => tiles[t].center.angleTo(goalC) * hScale;

    const g = new Map<number, number>([[u.tile, 0]]);
    const came = new Map<number, number>();
    const heap = new MinHeap();
    heap.push(h(u.tile), u.tile);
    const closed = new Set<number>();
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      for (const nb of tiles[cur].neighbors) {
        if (this.isWater(nb) || closed.has(nb)) continue;
        if (nb !== goal && (this.isEnemyOccupied(nb, u.owner) || !this.canStand(u, nb))) continue;
        if (this.isForeignBlocked(nb, u.owner)) continue;
        const ng = g.get(cur)! + this.moveCost(nb);
        if (ng < (g.get(nb) ?? Infinity)) {
          g.set(nb, ng);
          came.set(nb, cur);
          heap.push(ng + h(nb), nb);
        }
      }
    }
    if (!came.has(goal)) return null;
    const path: number[] = [];
    for (let t = goal; t !== u.tile; t = came.get(t)!) path.push(t);
    return path.reverse();
  }

  // Number of turns to walk a path, counting the current turn as 1.
  pathTurns(u: Unit, path: number[]): number {
    let moves = u.moves, turns = 1;
    for (const t of path) {
      if (moves <= 0) { turns++; moves = this.maxMoves(u.type, u.owner); }
      moves -= this.moveCost(t);
    }
    return turns;
  }

  // ---------- actions ----------

  // A new unit on `tile`, or (one unit per tile) the nearest free tile.
  createUnit(type: UnitKey, owner: number, tile: number): Unit {
    tile = this.freeTileNear(type, owner, tile) ?? tile;
    this.record('unitCreated', owner, { unit: type, tile });
    const u: Unit = { id: this.nextId++, type, owner, tile, packedIn: null, moves: this.maxMoves(type, owner), hp: 100,
      fortified: false, skipped: false, goal: null, dead: false, aiTarget: null };
    this.units.push(u);
    return u;
  }

  // A unit's moves a turn: its own, and what its civ's effects add (fighting units).
  maxMoves(type: UnitKey, owner: number): number {
    const d = unitDef(type);
    return d.mv + (d.civilian ? 0 : movesBonus(this.effectsOf(this.players[owner]!), d.mounted === true));
  }

  // A unit gone (with a commander, its army: lost with it).
  removeUnit(u: Unit): void {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    u.dead = true;
    if (u.type === 'commander') for (const v of this.armyOf(u)) this.removeUnit(v);
  }

  // ---- armies ----

  // The units a commander could rally now: its owner's military units on
  // its tile and the tiles next to it, while its army has room.
  rallyable(c: Unit): Unit[] {
    if (c.type !== 'commander') return [];
    const room = COMMANDER_CAPACITY - this.armyOf(c).length;
    const nbs = new Set([c.tile, ...this.tiles[c.tile].neighbors]);
    return this.units.filter((u) => u.owner === c.owner && u.packedIn === null && nbs.has(u.tile) && slotOf(u.type) === 'military' && u.type !== 'commander').slice(0, Math.max(0, room));
  }

  // The commander rallies every unit it can: each marches in (its turn
  // spent) and is carried from now on.
  rally(c: Unit): number {
    const units = this.rallyable(c);
    if (units.length) this.record('rally', c.owner, { commander: c.id, units: units.map((u) => u.type) });
    for (const u of units) {
      u.packedIn = c.id;
      u.tile = c.tile;
      u.moves = 0;
      u.fortified = false;
      u.goal = null;
    }
    return units.length;
  }

  // The commander deploys its army: one unit on its own tile, the others on
  // the free tiles round it (each spends its turn); those with no room stay
  // packed.
  deploy(c: Unit): number {
    this.record('deploy', c.owner, { commander: c.id });
    let n = 0;
    for (const u of this.armyOf(c)) {
      const t = [c.tile, ...this.tiles[c.tile].neighbors].find((x) => this.relief[x] !== 'mountains' && !this.isEnemyOccupied(x, c.owner) && this.canStand(u, x));
      if (t === undefined) break;
      u.packedIn = null;
      u.tile = t;
      u.moves = 0;
      n++;
    }
    return n;
  }

  // A unit of `u`'s side and slot on the tile next to it that could swap
  // places with it (both with moves left; neither packed).
  swapPartner(u: Unit, t: number): Unit | null {
    if (u.moves <= 0) return null;
    const slot = slotOf(u.type);
    return this.units.find((v) => v.tile === t && v.packedIn === null && v.owner === u.owner && v !== u && slotOf(v.type) === slot && v.moves > 0) ?? null;
  }

  // Moves a unit one tile (its army with it).
  private step(u: Unit, t: number): void {
    u.moves = Math.max(0, u.moves - this.moveCost(t));
    u.tile = t;
    for (const v of this.armyOf(u)) v.tile = t;
  }

  goTo(u: Unit, goal: number): void {
    this.record('move', u.owner, { unit: u.type, id: u.id, from: u.tile, to: goal });
    u.goal = goal;
    u.fortified = false;
    this.continueGoto(u);
  }

  continueGoto(u: Unit): void {
    while (!u.dead && u.moves > 0 && u.goal != null) {
      if (u.tile === u.goal) break;
      const path = this.findPath(u, u.goal);
      if (!path || !path.length) { u.goal = null; break; }
      const next = path[0];
      if (this.isEnemyOccupied(next, u.owner)) {
        if (next === u.goal && this.canAttack(u)) this.attack(u, next);
        u.goal = null;
        break;
      }
      // (Onto one of its own: they swap places.)
      const other = this.swapPartner(u, next);
      if (other) {
        const from = u.tile;
        this.step(u, next);
        this.step(other, from);
        other.goal = null;
        u.goal = null;
        break;
      }
      this.step(u, next);
    }
    if (u.tile === u.goal) u.goal = null;
    if (u.owner === HUMAN) this.updateVisibility();
  }

  unitStrength(u: Unit, role: 'atk' | 'def', tile: number): number {
    const fx = this.effectsOf(this.players[u.owner]!), combat = 1 + total(fx, 'combat') / 100;
    if (role === 'atk') return combatStrength(u.type, 'atk', u.hp, 0) * (combat + (this.cityByTile.has(tile) ? total(fx, 'vsCities') / 100 : 0));
    let bonus = this.defenseBonus(tile) + (this.ownerOf(tile) === u.owner ? total(fx, 'homeDefense') / 100 : 0);
    const city = this.cityByTile.get(tile);
    if (city) bonus += 0.5 + (city.buildings.has('walls') ? 1 : 0) + 0.25 * (Number(city.buildings.has('barracks')) + Number(city.buildings.has('stable')));
    if (u.fortified) bonus += FORTIFY_BONUS;
    return combatStrength(u.type, 'def', u.hp, bonus) * combat;
  }

  bestDefender(tile: number, attackerOwner: number): Unit | null {
    let best: Unit | null = null, bestS = -1;
    // (An army's units defend their commander, on its tile; the commander
    // itself only once none is left.)
    for (const d of this.units) {
      if (d.tile !== tile || d.owner === attackerOwner || unitDef(d.type).civilian) continue;
      const s = this.unitStrength(d, 'def', tile) + (d.type === 'commander' ? -1000 : 0);
      if (s > bestS) { best = d; bestS = s; }
    }
    return best;
  }

  // Strengths of a prospective fight, or null if nothing defends the tile.
  combatPreview(u: Unit, tile: number): CombatPreview | null {
    const d = this.bestDefender(tile, u.owner);
    if (!d) return null;
    return { atk: this.unitStrength(u, 'atk', tile), def: this.unitStrength(d, 'def', tile), defender: d };
  }

  attack(u: Unit, tile: number): void {
    u.moves = 0;
    u.fortified = false;
    const ranged = unitDef(u.type).ranged === true;
    // (Attacking a civ at peace is a declaration of war.)
    const target = this.cityByTile.get(tile)?.owner ?? this.units.find((v) => v.tile === tile && v.owner !== u.owner)?.owner;
    if (target !== undefined && target !== u.owner && !this.atWar(u.owner, target)) this.declareWar(u.owner, target);
    this.onBattle?.(u, tile, ranged);
    const d = this.bestDefender(tile, u.owner);
    if (d) {
      // (Pikemen fight mounted units at double strength.)
      const mounted = (x: Unit) => unitDef(x.type).mounted === true && x.type !== 'tank';
      const A = this.unitStrength(u, 'atk', tile) * (u.type === 'pikeman' && mounted(d) ? 2 : 1);
      const D = this.unitStrength(d, 'def', tile) * (d.type === 'pikeman' && mounted(u) ? 2 : 1);
      const before = { a: u.hp, d: d.hp };
      const after = fightRounds(u.hp, d.hp, A, D, ranged, this.rng);
      u.hp = after.attacker;
      d.hp = after.defender;
      this.record('attack', u.owner, { unit: u.type, defender: d.type, defenderOwner: d.owner, tile, A: +A.toFixed(2), D: +D.toFixed(2), hp: [before.a, Math.max(0, u.hp)], defenderHp: [before.d, Math.max(0, d.hp)] });
      if (u.hp <= 0) this.record('unitLost', u.owner, { unit: u.type, tile: u.tile, by: d.owner });
      if (d.hp <= 0) this.record('unitLost', d.owner, { unit: d.type, tile, by: u.owner });
      const an = this.players[u.owner].name, dn = this.players[d.owner].name;
      const involved = u.owner === HUMAN || d.owner === HUMAN;
      if (u.hp <= 0) {
        this.removeUnit(u);
        if (involved) this.log(`${dn} ${unitDef(d.type).name} defeated ${an} ${unitDef(u.type).name}.`);
        return;
      }
      if (d.hp > 0) return; // the volley did not finish it
      this.removeUnit(d);
      if (involved) this.log(`${an} ${unitDef(u.type).name} defeated ${dn} ${unitDef(d.type).name}.`);
      if (this.bestDefender(tile, u.owner)) return;
    }
    // No defenders left: a city still stands while it has hit points.
    const city = this.cityByTile.get(tile);
    if (city && city.owner !== u.owner && city.hp > 0) {
      // That attack went into the defender, or into the walls; entering takes another.
      if (!d) this.siege(u, city, ranged);
      return;
    }
    if (ranged) return; // ranged units never move in
    // Civilians are captured and the attacker moves in (its army with it).
    for (const v of this.unitsAt(tile)) {
      if (v.owner === u.owner) continue;
      if (v.owner === HUMAN || u.owner === HUMAN) this.log(`${this.players[v.owner].name} ${unitDef(v.type).name} was captured.`);
      this.removeUnit(v);
    }
    u.tile = tile;
    for (const v of this.armyOf(u)) v.tile = tile;
    if (city && city.owner !== u.owner) this.captureCity(city, u.owner);
  }

  cityMaxHp(c: City): number { return CITY_HP + (c.buildings.has('walls') ? WALLS_HP : 0); }

  // The center's strength, attacking and defending: its size, walls and garrison.
  // (Stronger in later eras: its owner's era adds half again for each, so
  // walls don't turn to paper before rifles and tanks.)
  cityStrength(c: City): number {
    const garrison = Number(c.buildings.has('barracks')) + Number(c.buildings.has('stable'));
    const p = this.players[c.owner]!;
    return (2.5 + 0.3 * c.pop + (c.buildings.has('walls') ? 3 : 0) + garrison) * (1 + 0.5 * p.era) * (1 + total(this.effectsOf(p), 'cityStrength') / 100);
  }

  // A unit attacks a city with no defenders: a few exchanges with its walls.
  private siege(u: Unit, city: City, ranged: boolean): void {
    const A = this.unitStrength(u, 'atk', city.tile) * (unitDef(u.type).siege ? 2 : 1), D = this.cityStrength(city);
    for (let round = 0; round < 3 && u.hp > 0 && city.hp > 0; round++) {
      const dmg = 18 + Math.floor(this.rng() * 14);
      if (this.rng() < A / (A + D)) city.hp = Math.max(0, city.hp - dmg);
      else u.hp -= ranged ? Math.round(dmg / 2) : dmg;
    }
    const involved = u.owner === HUMAN || city.owner === HUMAN;
    if (u.hp <= 0) {
      this.removeUnit(u);
      if (involved) this.log(`${city.name} drove off the ${this.players[u.owner].name} ${unitDef(u.type).name}.`);
    } else if (involved) {
      this.log(city.hp > 0 ? `${city.name} under siege: ${city.hp}/${this.cityMaxHp(city)} HP.` : `${city.name}'s defenses have fallen!`);
    }
  }

  // Each city strikes the weakest enemy unit near it (2 tiles with walls).
  private cityStrike(city: City): void {
    if (city.hp <= 0) return;
    const near = new Set(this.tilesWithin(city.tile, city.buildings.has('walls') ? 2 : 1));
    let target: Unit | null = null;
    for (const u of this.units) {
      if (u.owner === city.owner || unitDef(u.type).civilian || !near.has(u.tile) || u.packedIn !== null || !this.atWar(city.owner, u.owner)) continue;
      if (!target || u.hp < target.hp) target = u;
    }
    if (!target) return;
    const dmg = Math.min(35, Math.round(10 + (6 * this.cityStrength(city)) / Math.max(1, unitDef(target.type).def)));
    target.hp -= dmg;
    const involved = target.owner === HUMAN || city.owner === HUMAN;
    if (target.hp <= 0) {
      this.removeUnit(target);
      if (involved) this.log(`${city.name} destroyed the ${this.players[target.owner].name} ${unitDef(target.type).name}.`);
    } else if (involved) this.log(`${city.name} struck the ${this.players[target.owner].name} ${unitDef(target.type).name} (−${dmg} HP).`);
  }

  // ---------- pillage and raze ----------

  canPillage(u: Unit): boolean {
    if (unitDef(u.type).civilian || u.moves <= 0) return false;
    const t = u.tile, o = this.ownerOf(t);
    return o >= 0 && o !== u.owner && this.atWar(u.owner, o) && this.use[t] === USE.rural && this.pillaged[t] === 0;
  }

  // Burns an enemy rural tile: it yields nothing until repaired; the raider takes gold.
  pillage(u: Unit): boolean {
    if (!this.canPillage(u)) return false;
    const t = u.tile, victim = this.ownerOf(t);
    this.pillaged[t] = PILLAGE_REPAIR;
    this.players[u.owner]!.gold += PILLAGE_GOLD;
    u.moves = 0;
    u.fortified = false;
    this.useVersion++;
    if (u.owner === HUMAN || victim === HUMAN) {
      const city = this.cityById.get(this.tileCity[t]!);
      this.log(`${this.players[u.owner].name} pillaged ${city ? `${city.name}'s` : 'a'} ${(() => { const k = this.improvementAt(t); return k ? IMPROVEMENTS[k].name.toLowerCase() : 'land'; })()}.`);
    }
    return true;
  }

  canRaze(c: City): boolean { return c.founder !== c.owner && !c.razing; }

  // A captured city burns down, a citizen a turn, then leaves ruins.
  raze(c: City): boolean {
    if (!this.canRaze(c)) return false;
    c.razing = true;
    c.building = null;
    c.wonderTile = null;
    this.log(`${c.name} is being razed.`);
    return true;
  }

  destroyCity(c: City): void {
    // Its wonders fall with it (never to be rebuilt).
    for (const k of this.cityWonders(c)) this.wondersBuilt.set(k, FALLEN);
    for (let t = 0; t < this.N; t++) {
      if (this.tileCity[t] !== c.id) continue;
      if (this.use[t] === USE.center) this.ruins[t] = 1;
      if (this.use[t] !== USE.wild) this.setUse(t, USE.wild);
      this.pillaged[t] = 0;
      this.tileCity[t] = -1;
    }
    this.cities.splice(this.cities.indexOf(c), 1);
    this.cityById.delete(c.id);
    this.cityByTile.delete(c.tile);
    this.record('cityDestroyed', c.owner, { city: c.name, tile: c.tile });
    const owner = this.players[c.owner]!;
    if (owner.capital === c.id) owner.capital = this.cities.filter((x) => x.owner === owner.id).sort((a, b) => a.founded - b.founded)[0]?.id ?? null;
    for (const f of this.religions.values()) if (f.holyCity === c.id) f.holyCity = null;
    this.useVersion++;
    this.log(`${c.name} has been razed to the ground.`);
  }

  foundCity(u: Unit): City | null {
    if (u.type !== 'settler' || !this.canFoundCity(u.tile, u.owner)) return null;
    const p = this.players[u.owner];
    const name = p.cityNames[p.citiesFounded] ?? `${p.name} ${p.citiesFounded + 1}`;
    p.citiesFounded++;
    const city: City = { id: this.nextId++, name, owner: u.owner, tile: u.tile, pop: 1, food: 0, prod: 0,
      building: p.isHuman ? 'warrior' : null, buildings: new Set(), founded: this.turn, focus: 'balanced', growth: 0, specialists: noSpecialists(), wonderTile: null, bought: 0,
      hp: CITY_HP, founder: u.owner, razing: false, religion: null, culture: 0, ring: START_REACH };
    this.cities.push(city);
    this.cityById.set(city.id, city);
    this.cityByTile.set(city.tile, city);
    this.tileCity[city.tile] = city.id;
    this.setUse(city.tile, USE.center);
    this.claimTerritory(city);
    this.removeUnit(u);
    if (p.capital === null) {
      p.capital = city.id;
      // (A religion founded before it had a city: its holy city now.)
      for (const [r, f] of this.religions) if (f.founder === p.id && f.holyCity === null) { f.holyCity = city.id; city.religion = r; }
    }
    this.record('cityFounded', p.id, { city: name, tile: city.tile, capital: p.capital === city.id });
    if (p.isHuman) this.log(`Founded ${name}.`);
    else if (this.explored[city.tile]) this.log(`${p.name} founded ${name}.`);
    this.updateVisibility();
    return city;
  }

  // A city owns the tiles within its borders' ring that no one owns yet.
  private claimTerritory(city: City): void {
    let any = false;
    for (const t of this.tilesWithin(city.tile, city.ring)) {
      if (this.tileCity[t] === -1) { this.tileCity[t] = city.id; any = true; }
    }
    if (any) this.useVersion++;
  }
  // Border clashes (Civ IV's): a tile two or more steps from the city
  // holding it goes to a rival's city whose culture presses on it much
  // harder (influence: its culture over the square of one plus the
  // distance; CLASH_MARGIN times more). A citizen who worked it goes back to
  // its city, to be placed again; wonders' tiles never change hands.
  private contestBorders(): void {
    const influence = (c: City, d: number) => c.culture / ((1 + d) * (1 + d));
    for (const c of this.cities) {
      for (const [t, d] of this.tilesWithinMap(c.tile, c.ring)) {
        const o = this.cityById.get(this.tileCity[t]!);
        if (!o || o.owner === c.owner || d < 2 || this.wondersAt(t).length) continue;
        const od = Math.round(this.approxDist(t, o.tile));
        if (od < 2 || influence(c, d) <= CLASH_MARGIN * influence(o, od)) continue;
        const worked = this.use[t] === USE.rural;
        if (worked) this.setUse(t, USE.wild);
        this.tileCity[t] = c.id;
        // (Its citizen goes back to its city, to be placed elsewhere.)
        if (worked) {
          o.pop = Math.max(1, o.pop - 1);
          o.growth++;
          if (!this.players[o.owner]!.isHuman) this.autoPlace(o);
        }
        this.useVersion++;
        this.record('tileFlipped', c.owner, { tile: t, from: o.owner, city: c.name });
        if (o.owner === HUMAN) this.log(`${c.name}'s culture took a tile from ${o.name}.`);
        else if (c.owner === HUMAN) this.log(`${c.name}'s culture won a tile from ${o.name}.`);
      }
    }
  }

  // Its culture so far brings a city's borders out ring by ring (cities.ts).
  private growBorders(city: City): void {
    const ring = borderRing(city.culture);
    if (ring <= city.ring) return;
    city.ring = ring;
    this.claimTerritory(city);
    if (city.owner === HUMAN) this.log(`${city.name}'s borders expanded.`);
  }

  // ---------- buying tiles ----------

  // The tiles a city could buy: within its reach, owned by no one, touching
  // a tile of its own.
  buyableTiles(city: City): number[] {
    return this.tilesWithin(city.tile, CITY_REACH).filter((t) => this.tileCity[t] === -1
      && this.tiles[t].neighbors.some((n) => this.tileCity[n] === city.id));
  }
  tilePrice(city: City): number { return Math.round(tileCost(city.bought) * (1 + total(this.effectsOf(this.players[city.owner]!), 'tilePrice') / 100)); }
  canBuyTile(city: City, t: number): boolean {
    return this.players[city.owner]!.gold >= this.tilePrice(city) && this.buyableTiles(city).includes(t);
  }
  // The governor's pick of a tile to buy: what it would yield worked, for
  // the city's focus (ties to the lower tile).
  governorTileToBuy(city: City): number | null {
    let best: number | null = null, bestS = -Infinity;
    for (const t of this.buyableTiles(city)) {
      const k = this.improvementAt(t);
      const s = k ? weigh(city.focus, this.workedYield(t, city.owner)) : -1;
      if (s > bestS) { best = t; bestS = s; }
    }
    return best;
  }
  buyTile(city: City, t: number): boolean {
    if (!this.canBuyTile(city, t)) return false;
    this.players[city.owner]!.gold -= this.tilePrice(city);
    this.record('tileBought', city.owner, { city: city.name, tile: t, resource: this.resources[t] });
    this.tileCity[t] = city.id;
    city.bought++;
    this.useVersion++;
    return true;
  }

  private captureCity(city: City, newOwner: number): void {
    const old = this.players[city.owner];
    const p = this.players[newOwner];
    this.record('cityCaptured', newOwner, { city: city.name, from: city.owner, tile: city.tile });
    city.ring = Math.min(city.ring, borderRing(city.culture));
    if (old && old.capital === city.id) old.capital = this.cities.filter((c) => c.owner === old.id && c !== city).sort((a, b) => a.founded - b.founded)[0]?.id ?? null;
    if (p && p.capital === null) p.capital = city.id;
    city.owner = newOwner;
    city.hp = Math.round(this.cityMaxHp(city) * 0.4);
    city.razing = false;
    if (city.pop > 1) this.removeCitizen(city);
    city.growth = 0;
    city.wonderTile = null;
    // Temples and garrisons do not survive a conquest; the rest change hands.
    for (const b of [...city.buildings]) if (CITY_BUILDINGS[b].lostOnCapture) this.removeBuilding(city, b);
    this.useVersion++;
    city.food = 0;
    city.prod = 0;
    city.building = p.isHuman ? 'warrior' : null;
    if (newOwner === HUMAN || old.id === HUMAN || this.explored[city.tile]) {
      this.log(`${p.name} captured ${city.name} from ${old.name}!`);
    }
    this.checkElimination();
  }

  // ---------- cities ----------

  // Tiles of the city in a given use (the center excluded unless asked for).
  cityTiles(city: City, use: TileUse): number[] {
    return this.tilesWithin(city.tile, CITY_REACH).filter((t) => this.tileCity[t] === city.id && this.use[t] === use);
  }

  // ---------- buildings ----------

  // Whether the city stands by a river, or on the coast (beside the sea:
  // some buildings and wonders need it).
  cityRiver(city: City): boolean { return this.map.riverTile[city.tile] === 1; }
  cityCoast(city: City): boolean { return this.tiles[city.tile].neighbors.some((n) => this.isSea(n)); }
  isSea(t: number): boolean { return this.biome[t] === 'shallowSea' || this.biome[t] === 'ocean'; }

  // How many more specialists of a kind the city's buildings have slots for.
  specialistRoom(city: City, k: SpecialistKind): number {
    return specialistSlots(city.buildings, k) - city.specialists[k];
  }
  // The city's rural tiles worked with an improvement.
  private worked(city: City, k: ImprovementKey): number {
    return this.cityTiles(city, USE.rural).filter((t) => !this.pillaged[t] && this.improvementAt(t) === k).length;
  }
  specialistCount(city: City): number { return SPECIALIST_KINDS.reduce((n, k) => n + city.specialists[k], 0); }

  // What adding building k would change in the city's output.
  buildingGain(city: City, k: BuildingKey): Output {
    if (city.buildings.has(k)) return ZERO;
    const before = this.cityYields(city);
    city.buildings.add(k);
    const after = this.cityYields(city);
    city.buildings.delete(k);
    return addOut(after, scaleOut(before, -1));
  }

  addBuilding(city: City, k: BuildingKey): void {
    city.buildings.add(k);
    this.useVersion++;
  }
  // Removes building k (a conquest, the City Lab) and those that need it;
  // specialists left without a slot leave the city.
  removeBuilding(city: City, k: BuildingKey): void {
    if (!city.buildings.delete(k)) return;
    for (const b of [...city.buildings]) if (CITY_BUILDINGS[b].requires === k) this.removeBuilding(city, b);
    for (const s of SPECIALIST_KINDS) {
      const over = -this.specialistRoom(city, s);
      if (over > 0) { city.specialists[s] -= over; city.pop = Math.max(1, city.pop - over); }
    }
    this.useVersion++;
  }

  // ---------- wonders ----------

  // The wonders standing on tile t (a city's center: any number; a tile
  // beside it: one).
  wondersAt(t: number): WonderKey[] {
    const out: WonderKey[] = [];
    for (const [k, at] of this.wondersBuilt) if (at === t) out.push(k);
    return out;
  }
  wonderOn(t: number): WonderKey | null { return this.wondersAt(t)[0] ?? null; }
  // The wonders a city has (on its center, and beside it).
  cityWonders(city: City): WonderKey[] {
    const out: WonderKey[] = [];
    for (const [k, t] of this.wondersBuilt) if (t !== FALLEN && this.tileCity[t] === city.id) out.push(k);
    return out;
  }

  // What a wonder needs of the tile it stands on (coast: of its city's center).
  private siteOk(t: number, site: WonderSite): boolean {
    switch (site) {
      case 'desertOrFloodplain': return this.biome[t] === 'hotDesert' || this.biome[t] === 'coldDesert' || this.feature[t] === 'floodplain';
      case 'coast': return this.tiles[t].neighbors.some((n) => this.isSea(n));
      case 'river': return this.map.riverTile[t] === 1;
      case 'mountainTop': return this.relief[t] === 'mountains' && this.feature[t] !== 'volcano';
      case 'hills': return this.relief[t] === 'hills';
      case 'flat': return this.relief[t] === 'flat' && this.feature[t] === null;
      case 'any': return true;
    }
  }

  // Where wonder k could stand: in the city (its center), if the center
  // meets its need; beside it, on a tile of the city's next to it with no
  // wonder yet: a wild mountain, the sea (shallow first; a coastal city),
  // flat land (a hex, wild or worked) meeting its need.
  wonderSpots(city: City, k: WonderKey): number[] {
    const site = WONDERS[k].site, beside = wonderBeside(k);
    if (!beside) return this.siteOk(city.tile, site) ? [city.tile] : [];
    const ok = (t: number) => (beside === 'sea' ? this.isSea(t)
      : beside === 'mountain' ? this.use[t] === USE.wild && this.siteOk(t, 'mountainTop')
      : !this.isWater(t) && !this.isPentagon(t) && this.relief[t] === 'flat' && this.use[t] !== USE.center && this.siteOk(t, site));
    return this.tiles[city.tile].neighbors.filter((t) => this.tileCity[t] === city.id && !this.blockedFor(city, t) && !this.wondersAt(t).length && ok(t))
      .sort((a, b) => Number(this.biome[b] === 'shallowSea') - Number(this.biome[a] === 'shallowSea') || a - b);
  }

  // Starts wonder k on tile t (production goes on).
  startWonder(city: City, k: WonderKey, t: number): boolean {
    if (this.wondersBuilt.has(k) || !this.wonderSpots(city, k).includes(t)) return false;
    if (city.building !== k) city.building = k;
    city.wonderTile = t;
    this.useVersion++;
    return true;
  }

  governorWonderSpot(city: City, k: WonderKey): number | null {
    return this.wonderSpots(city, k)[0] ?? null;
  }

  // Builds wonder k on tile t at once (the City Lab; the game completes
  // wonders through production).
  placeWonder(city: City, k: WonderKey, t: number): boolean {
    if (this.wondersBuilt.has(k) || !this.wonderSpots(city, k).includes(t)) return false;
    this.completeWonder(city, k, t);
    return true;
  }

  private completeWonder(city: City, k: WonderKey, t: number): void {
    this.wondersBuilt.set(k, t);
    city.building = null;
    city.wonderTile = null;
    this.useVersion++;
    const p = this.players[city.owner]!;
    if (p.isHuman || this.explored[t]) this.log(`${p.name} completed the ${WONDERS[k].name} in ${city.name}!`);
    // Anyone else building it keeps their production for something else.
    for (const c of this.cities) {
      if (c.building !== k) continue;
      c.building = null;
      c.wonderTile = null;
      if (this.players[c.owner]!.isHuman) this.log(`${c.name} lost the race for the ${WONDERS[k].name}; its production is kept.`);
    }
  }

  // The era of the civ owning tile t.
  eraAt(t: number): EraIndex {
    const o = this.ownerOf(t);
    return o < 0 ? 0 : this.players[o]!.era;
  }

  // The resource on tile t as civ `owner` knows it: null if none, or if it
  // is a strategic one that civ has not revealed yet (resources.ts).
  resourceFor(t: number, owner: number): ResourceKey | null {
    const r = this.resources[t];
    if (!r) return null;
    const need = resourceDef(r).reveal;
    return !need || (owner >= 0 && this.players[owner]!.techs.has(need)) ? r : null;
  }

  // What tile t would yield worked by civ `owner`: its terrain and
  // improvement, its resource, and what the civ's effects add (effects.ts).
  workedYield(t: number, owner: number): Output {
    const res = this.resourceFor(t, owner), fx = owner >= 0 ? this.effectsOf(this.players[owner]!) : [];
    const kind = res ? resourceDef(res).kind : null;
    return addOut(ruralYield(this.terrainAt(t), this.map.riverTile[t] === 1, (k) => tileBonus(fx, k, kind), res ? RESOURCE_IMPROVEMENT[res] : null), res ? resourceDef(res).yields : ZERO);
  }
  // The improvement tile t gets worked (by `owner`: the resource it knows
  // of there decides it; cities.ts improvementFor).
  improvementAt(t: number, owner: number = this.ownerOf(t)): ImprovementKey | null {
    const res = this.resourceFor(t, owner);
    return improvementFor(this.terrainAt(t), res ? RESOURCE_IMPROVEMENT[res] : null);
  }
  // How far its owner's techs have taken tile t's improvement (techs.ts improvementStage).
  stageAt(t: number, owner: number = this.ownerOf(t)): number {
    const k = this.improvementAt(t, owner);
    return k && owner >= 0 ? improvementStage(this.players[owner]!.techs, k) : 0;
  }

  // What a developed tile adds to its city (wild tiles add nothing).
  tileOutput(t: number): Output {
    const terrain = this.terrainAt(t), river = this.map.riverTile[t] === 1;
    const u = this.use[t], owner = this.ownerOf(t);
    const wonders = this.wondersAt(t).reduce((o, w) => addOut(o, WONDERS[w].yields), ZERO);
    if (u === USE.rural) return addOut(this.pillaged[t] ? ZERO : this.workedYield(t, owner), wonders);
    if (u === USE.wild) return wonders; // a wonder beside the city
    // The center: the city, its buildings, wonders and specialists.
    const city = this.cityByTile.get(t);
    if (!city) return ZERO;
    const res = this.resourceFor(t, owner), resYield = res ? resourceDef(res).yields : ZERO;
    const fx = this.effectsOf(this.players[city.owner]!);
    const specialists = SPECIALIST_KINDS.reduce((o, k) => addOut(o, scaleOut(addOut(specialistYield(k), specialistBonus(fx, k)), city.specialists[k])), ZERO);
    return addOut(addOut(addOut(addOut(centerYield(terrain, river), resYield), buildingsYield(city.buildings, city.pop, (k) => this.worked(city, k))), wonders), specialists);
  }

  // A tile an enemy unit stands on yields nothing to its city.
  private blockedFor(city: City, t: number): boolean {
    return this.units.some((u) => u.tile === t && u.owner !== city.owner && this.atWar(city.owner, u.owner));
  }

  cityYields(city: City): CityYield {
    let sum: Output = ZERO;
    for (const t of this.tilesWithin(city.tile, CITY_REACH)) {
      if (this.tileCity[t] !== city.id || (this.use[t] === USE.wild && !this.wondersAt(t).length)) continue;
      if (t !== city.tile && this.blockedFor(city, t)) continue;
      sum = addOut(sum, this.tileOutput(t));
    }
    // (Buildings' percentages count everything the city makes.)
    sum = withPercents(sum, city.buildings);
    // Its civ's: the palace and the capital's bonuses, its religion's, and
    // the percentages of its government and policies.
    const p = this.players[city.owner]!, fx = this.effectsOf(p);
    if (p.capital === city.id) sum = addOut(addOut(sum, out(PALACE)), flat(fx, 'capital'));
    if (city.religion) sum = addOut(sum, flat(religionDef(city.religion).follower, 'follower'));
    sum = out(Object.fromEntries(OUTPUT_KEYS.map((y) => [y, Math.max(0, Math.floor(sum[y] * (100 + yieldBonus(fx, y)) / 100))])));
    return { ...sum, surplus: sum.food - FOOD_PER_CITIZEN * city.pop };
  }

  // Where the city's next citizen may go: a wild tile it owns with an
  // improvement (rural), or a specialist in one of its buildings with room.
  growthOptions(city: City): GrowthOption[] {
    const out: GrowthOption[] = [];
    for (const t of this.tilesWithin(city.tile, CITY_REACH)) {
      if (this.tileCity[t] !== city.id || this.blockedFor(city, t) || this.use[t] !== USE.wild) continue;
      const improvement = this.improvementAt(t, city.owner);
      if (improvement) out.push({ kind: 'rural', tile: t, improvement });
    }
    for (const k of SPECIALIST_KINDS) if (this.specialistRoom(city, k) > 0) out.push({ kind: 'specialist', specialist: k });
    return out;
  }

  // What an option adds to the city.
  optionYield(o: GrowthOption, owner: number = this.ownerOf(o.kind === 'rural' ? o.tile : -1)): Output {
    if (o.kind === 'specialist') return owner >= 0 ? addOut(specialistYield(o.specialist), specialistBonus(this.effectsOf(this.players[owner]!), o.specialist)) : specialistYield(o.specialist);
    return this.workedYield(o.tile, owner);
  }

  // The governor's pick for the city's focus (ties go to the lower tile, so
  // it is deterministic), or null if the city has nowhere to grow.
  governorPick(city: City): GrowthOption | null {
    const surplus = this.cityYields(city).surplus - FOOD_PER_CITIZEN;
    const short = this.specialistCount(city) < specialistsWanted(city.pop + 1);
    const want = this.growthCostOf(city, city.pop + 1) / GROWTH_TURNS;
    let best: GrowthOption | null = null, bestS = -Infinity;
    for (const o of this.growthOptions(city)) {
      const gain = this.optionYield(o, city.owner);
      const s = governorScore(city.focus, o.kind, gain, surplus + gain.food, want, short);
      if (s > bestS) { best = o; bestS = s; }
    }
    return best;
  }

  // Places one pending citizen. Returns false if the option is not legal now.
  placeGrowth(city: City, o: GrowthOption): boolean {
    if (city.growth <= 0) return false;
    const legal = this.growthOptions(city).some((x) => sameOption(x, o));
    if (!legal) return false;
    if (o.kind === 'specialist') city.specialists[o.specialist]++;
    else this.setUse(o.tile, USE.rural);
    city.growth--;
    city.pop++;
    return true;
  }

  // Lets the governor place every pending citizen of the city.
  autoPlace(city: City): void {
    while (city.growth > 0) {
      const o = this.governorPick(city);
      if (!o || !this.placeGrowth(city, o)) { city.growth = 0; break; }
    }
  }

  // The city loses a citizen (starvation, a settler, capture): its least
  // valuable specialist first, then its least valuable rural tile. The
  // center always stays.
  removeCitizen(city: City): void {
    if (city.pop <= 1) return;
    const kinds = SPECIALIST_KINDS.filter((k) => city.specialists[k] > 0);
    const rural = this.cityTiles(city, USE.rural);
    if (kinds.length) {
      const k = kinds.reduce((a, b) => (weigh('balanced', specialistYield(b)) < weigh('balanced', specialistYield(a)) ? b : a));
      city.specialists[k]--;
    } else if (rural.length) {
      const value = (t: number) => weigh('balanced', this.tileOutput(t));
      this.setUse(rural.reduce((a, b) => (value(b) < value(a) ? b : a)), USE.wild);
    } else return;
    city.pop--;
  }

  private setUse(t: number, u: TileUse): void {
    // A bog worked is drained, for good: it is its land from now on (cities.ts drained).
    if (u === USE.rural && this.feature[t] === 'bog') {
      this.feature[t] = null;
      this.drained[t] = 1;
      const city = this.cityById.get(this.tileCity[t]);
      if (city) this.log(`${city.name} drained a peat bog.`);
    }
    this.use[t] = u;
    this.useVersion++;
  }

  // Food for a city's next citizen (`pop`: its size after), with its civ's
  // effects (which never take off more than GROWTH_CUT_MAX).
  growthCostOf(city: City, pop: number): number {
    const pct = Math.max(-GROWTH_CUT_MAX, total(this.effectsOf(this.players[city.owner]!), 'growth'));
    return Math.max(1, Math.round(growthCost(pop) * (1 + pct / 100)));
  }

  // A building can be queued once per city, and only while it has a place to go.
  // (`anyResource`: as if the civ had every strategic resource; the City Lab.)
  canBuild(city: City, key: BuildKey, anyResource = false): boolean {
    const p = this.players[city.owner]!;
    if (!this.unlocked(p).has(key)) return false;
    if (isUnitKey(key)) { const need = unitDef(key).needs; return !need || anyResource || this.hasResource(p.id, need); }
    if (isWonder(key)) return !this.wondersBuilt.has(key) && (this.wonderSpots(city, key).length > 0 || city.wonderTile !== null && city.building === key);
    const need = CITY_BUILDINGS[key].resource;
    return (!need || anyResource || this.hasResource(p.id, need)) && buildingAllowed(key, city.buildings, this.cityRiver(city), this.cityCoast(city));
  }

  private processCity(city: City): void {
    const p = this.players[city.owner];
    if (city.razing) {
      if (city.pop > 1) this.removeCitizen(city);
      else this.destroyCity(city);
      return;
    }
    const y = this.cityYields(city);

    city.food += y.surplus;
    const cost = this.growthCostOf(city, city.pop + city.growth);
    if (city.food >= cost) {
      if (!this.growthOptions(city).length) {
        city.food = cost; // nowhere to put a new citizen: the city stagnates
      } else {
        city.growth++;
        city.food = city.buildings.has('aqueduct') ? Math.floor(cost * AQUEDUCT_KEEP) : 0;
        this.record('cityGrew', city.owner, { city: city.name, pop: city.pop + city.growth });
        if (p.isHuman) this.log(`${city.name} grew: place a citizen.`);
        else this.autoPlace(city);
      }
    } else if (city.food < 0) {
      city.food = 0;
      if (city.pop > 1) {
        this.removeCitizen(city);
        if (p.isHuman) this.log(`${city.name} is starving!`);
      }
    }

    const key = city.building;
    if (key) {
      const item = buildDef(key);
      city.prod += Math.round(y.prod * (1 + prodBonus(this.effectsOf(p), this.prodKinds(key)) / 100));
      if (city.prod >= item.cost) {
        if (key === 'settler' && city.pop < 2) {
          city.prod = item.cost; // wait until the city can spare a citizen
        } else {
          city.prod -= item.cost;
          if (isUnitKey(key)) {
            this.createUnit(key, city.owner, city.tile);
            this.record('built', city.owner, { city: city.name, item: key });
            if (key === 'settler') this.removeCitizen(city);
            if (!p.isHuman) city.building = null;
            if (p.isHuman) this.log(`${city.name} completed ${item.name}.`);
          } else if (isWonder(key)) {
            // On its tile, or another if that one was lost (a mountain top); else it waits.
            const spots = this.wonderSpots(city, key);
            const t = city.wonderTile !== null && spots.includes(city.wonderTile) ? city.wonderTile : this.governorWonderSpot(city, key);
            if (t === null || this.wondersBuilt.has(key)) city.prod += item.cost;
            else this.completeWonder(city, key, t);
          } else {
            this.addBuilding(city, key);
            this.record('built', city.owner, { city: city.name, item: key });
            city.building = null;
            if (p.isHuman) this.log(`${city.name} completed ${item.name}.`);
          }
        }
      }
    } else {
      // Nothing to build: production becomes gold.
      p.gold += Math.floor(y.prod * (WEALTH_RATE + total(this.effectsOf(p), 'wealth') / 100));
    }
    p.gold += y.gold;
    p.faith += y.faith;
    this.addScience(p, y.science);
    this.addCohesion(p, y.cohesion);
    this.addCulture(p, y.culture);
    city.culture += y.culture * (1 + total(this.effectsOf(p), 'border') / 100);
    this.growBorders(city);
    this.turnIncome[p.id] = addOut(this.turnIncome[p.id] ?? ZERO, y);
  }

  // What a city makes this turn, summed per civ (endTurn's accounts).
  private turnIncome: Output[] = [];
  private turnLuxuries: Output[] = [];

  // Its luxuries' empire bonus, to the civ as a whole (its culture to
  // identity, not to any city's borders).
  private addLuxuries(p: Player): void {
    if (!this.cities.some((c) => c.owner === p.id)) return;
    const y = this.luxuryYield(p);
    p.gold += y.gold;
    p.faith += y.faith;
    this.addScience(p, y.science);
    this.addCohesion(p, y.cohesion);
    this.addCulture(p, y.culture);
    this.turnLuxuries[p.id] = y;
    this.turnIncome[p.id] = addOut(this.turnIncome[p.id] ?? ZERO, y);
  }

  // ---------- what a civ can do ----------

  // Its techs', government's, policies' and identity's effects (effects.ts),
  // kept until any of those change.
  private readonly fxCache = new Map<number, { key: string; fx: Effect[] }>();
  effectsOf(p: Player): Effect[] {
    const key = `${p.techs.size}|${p.identity.size}|${p.government}|${SLOT_KINDS.map((s) => p.policies[s].join(',')).join(';')}`;
    const hit = this.fxCache.get(p.id);
    if (hit && hit.key === key) return hit.fx;
    const fx: Effect[] = [...governmentDef(p.government).effects];
    for (const slot of SLOT_KINDS) for (const k of p.policies[slot]) if (k) fx.push(...policyDef(k).effects);
    for (const k of p.techs) fx.push(...(techDef(k).effects ?? []));
    for (const k of p.identity) fx.push(...traitDef(k).effects);
    this.fxCache.set(p.id, { key, fx });
    return fx;
  }

  // What a civ can build: the starting items, and everything its techs and
  // politics unlock.
  unlocked(p: Player): Set<BuildKey> {
    const out = new Set<BuildKey>(STARTING);
    const add = (d: { units?: readonly UnitKey[]; buildings?: readonly BuildingKey[]; wonders?: readonly WonderKey[] }) => {
      for (const k of d.units ?? []) out.add(k);
      for (const k of d.buildings ?? []) out.add(k);
      for (const k of d.wonders ?? []) out.add(k);
    };
    for (const k of p.techs) add(techDef(k));
    for (const k of p.politics) add(politicsDef(k));
    return out;
  }
  governmentsOf(p: Player): GovernmentKey[] {
    return (Object.keys(GOVERNMENTS) as GovernmentKey[]).filter((g) => g === 'chiefdom' || [...p.politics].some((c) => (politicsDef(c).governments ?? []).includes(g)));
  }
  policiesOf(p: Player): PolicyKey[] {
    return [...p.politics].flatMap((c) => [...(politicsDef(c).policies ?? [])]);
  }

  // The kinds an item counts as, for production bonuses.
  private prodKinds(key: BuildKey): ProdTarget[] {
    if (isUnitKey(key)) {
      if (key === 'settler') return ['settler'];
      const d = unitDef(key);
      if (d.civilian || key === 'commander' || key === 'scout') return [];
      const out: ProdTarget[] = ['military', d.siege ? 'siege' : d.ranged ? 'ranged' : d.mounted ? 'mounted' : 'melee'];
      return out;
    }
    return isWonder(key) ? ['wonder'] : ['building'];
  }

  // ---------- resources ----------

  // The resources on tiles a civ owns, by kind (each counted once; a
  // strategic one once the civ has revealed it).
  ownedResources(owner: number): Set<ResourceKey> {
    const out = new Set<ResourceKey>();
    for (let t = 0; t < this.N; t++) {
      if (!this.resources[t] || this.ownerOf(t) !== owner || this.pillaged[t]) continue;
      const r = this.resourceFor(t, owner);
      if (r) out.add(r);
    }
    return out;
  }
  // How many tiles of each it owns (its copies).
  resourceCopies(owner: number): Map<ResourceKey, number> {
    const out = new Map<ResourceKey, number>();
    for (let t = 0; t < this.N; t++) {
      if (!this.resources[t] || this.ownerOf(t) !== owner || this.pillaged[t]) continue;
      const r = this.resourceFor(t, owner);
      if (r) out.set(r, (out.get(r) ?? 0) + 1);
    }
    return out;
  }
  // What it has: its own and what its deals bring it.
  availableResources(owner: number): Set<ResourceKey> {
    const out = this.ownedResources(owner);
    for (const r of this.imports(owner)) out.add(r);
    return out;
  }
  hasResource(owner: number, r: ResourceKey): boolean { return this.availableResources(owner).has(r); }
  luxuriesOf(owner: number): ResourceKey[] { return [...this.availableResources(owner)].filter((r) => resourceDef(r).kind === 'luxury'); }
  // The empire bonus of its luxuries (one copy of each kind counts), and its effects' per luxury.
  luxuryYield(p: Player): Output {
    const kinds = this.luxuriesOf(p.id), per = flat(this.effectsOf(p), 'luxury');
    return kinds.reduce((s, k) => addOut(addOut(s, empireBonus(k, p.era)), per), ZERO);
  }

  // ---------- trade ----------

  // What its deals bring it, and what it sends away (one entry a deal).
  imports(owner: number): ResourceKey[] {
    return this.deals.flatMap((d) => { const [a, b] = d.sides; const from = a.civ === owner ? b : b.civ === owner ? a : null; return from?.resource ? [from.resource] : []; });
  }
  exports(owner: number): ResourceKey[] {
    return this.deals.flatMap((d) => d.sides.filter((s) => s.civ === owner && s.resource).map((s) => s.resource!));
  }
  // The copies it could still trade away: past the one it keeps and those already sent.
  spareResources(owner: number): Map<ResourceKey, number> {
    const out = new Map<ResourceKey, number>(), sent = this.exports(owner);
    for (const [r, n] of this.resourceCopies(owner)) {
      const spare = n - 1 - sent.filter((x) => x === r).length;
      if (spare > 0) out.set(r, spare);
    }
    return out;
  }
  // Whether two civs may trade: met, at peace, both alive.
  canTrade(a: number, b: number): boolean {
    return a !== b && this.players[a]!.alive && this.players[b]!.alive && !!this.met[a]![b] && !this.atWar(a, b);
  }
  // What `from` could give `to`: a spare copy of something `to` has
  // revealed (a strategic) and lacks.
  tradeable(from: number, to: number): ResourceKey[] {
    const has = this.availableResources(to), techs = this.players[to]!.techs;
    return [...this.spareResources(from).keys()].filter((r) => !has.has(r) && (!resourceDef(r).reveal || techs.has(resourceDef(r).reveal!)));
  }
  // Why a deal can't be made now, or null.
  dealBlock(sides: readonly [DealSide, DealSide]): string | null {
    const [a, b] = sides;
    if (!this.canTrade(a.civ, b.civ)) return 'Only civilizations at peace can trade.';
    if (!a.resource && !b.resource && !a.gold && !b.gold) return 'Nothing is traded.';
    if (a.gold < 0 || b.gold < 0) return 'Gold is given, not taken.';
    for (const [s, o] of [[a, b], [b, a]] as const) {
      if (s.resource && !this.tradeable(s.civ, o.civ).includes(s.resource)) return `The ${this.players[s.civ]!.name} have no spare ${resourceDef(s.resource).name} the ${this.players[o.civ]!.name} could use.`;
      if (s.gold > this.players[s.civ]!.gold + this.goldRate(s.civ)) return `The ${this.players[s.civ]!.name} cannot pay ${s.gold} gold a turn.`;
    }
    return null;
  }
  // A civ's gold a turn, last turn, before its deals.
  goldRate(owner: number): number {
    const l = this.players[owner]!.ledger;
    return Math.max(0, Math.floor(l.income.gold + l.tithes - l.cityUpkeep - l.unitUpkeep));
  }
  // Proposes a deal (sides[0]: the proposer): a computer answers at once
  // (ai.ts), the human in the diplomacy panel. Whether it was signed (or offered).
  proposeDeal(sides: readonly [DealSide, DealSide]): boolean {
    if (this.dealBlock(sides) !== null) return false;
    const [from, to] = sides;
    const deal: Deal = { sides, until: this.turn + DEAL_TURNS };
    if (this.players[to.civ]!.isHuman) {
      if (this.dealOffers.some((d) => d.sides[0].civ === from.civ)) return false;
      this.dealOffers.push(deal);
      this.log(`The ${this.players[from.civ]!.name} offer a trade (Diplomacy).`);
      return true;
    }
    if (!aiAcceptsDeal(this, this.players[to.civ]!, sides)) return false;
    this.signDeal(deal);
    return true;
  }
  // The human answers an offer.
  answerDeal(i: number, yes: boolean): boolean {
    const d = this.dealOffers[i];
    if (!d) return false;
    this.dealOffers.splice(i, 1);
    if (!yes || this.dealBlock(d.sides) !== null) return false;
    this.signDeal({ ...d, until: this.turn + DEAL_TURNS });
    return true;
  }
  private signDeal(d: Deal): void {
    this.deals.push(d);
    const [a, b] = d.sides;
    this.record('trade', a.civ, { with: b.civ, gives: a.resource, gold: a.gold, gets: b.resource, theirGold: b.gold, until: d.until });
    if (a.civ === HUMAN || b.civ === HUMAN) this.log(`Trade with the ${this.players[a.civ === HUMAN ? b.civ : a.civ]!.name} signed, for ${DEAL_TURNS} turns.`);
  }
  private endDeal(d: Deal, why: string): void {
    const i = this.deals.indexOf(d);
    if (i < 0) return;
    this.deals.splice(i, 1);
    const [a, b] = d.sides;
    this.record('tradeEnded', a.civ, { with: b.civ, why });
    if (a.civ === HUMAN || b.civ === HUMAN) this.log(`Trade with the ${this.players[a.civ === HUMAN ? b.civ : a.civ]!.name} ended: ${why}.`);
  }
  // Each turn: deals that ran out, lost their goods or their peace end; the gold is paid.
  private settleDeals(): void {
    for (const d of [...this.deals]) {
      const [a, b] = d.sides;
      if (this.turn >= d.until) { this.endDeal(d, 'its term is over'); continue; }
      if (!this.canTrade(a.civ, b.civ)) { this.endDeal(d, 'no longer at peace'); continue; }
      const lost = d.sides.find((s) => s.resource && (this.resourceCopies(s.civ).get(s.resource) ?? 0) <= this.exports(s.civ).filter((x) => x === s.resource).length);
      if (lost) { this.endDeal(d, `the ${this.players[lost.civ]!.name} lost their spare ${resourceDef(lost.resource!).name}`); continue; }
      const broke = d.sides.find((s) => s.gold > this.players[s.civ]!.gold);
      if (broke) { this.endDeal(d, `the ${this.players[broke.civ]!.name} could not pay`); continue; }
      for (const [s, o] of [[a, b], [b, a]] as const) {
        this.players[s.civ]!.gold -= s.gold;
        this.players[o.civ]!.gold += s.gold;
      }
    }
  }
  // Its net gold a turn from deals.
  dealGold(owner: number): number {
    return this.deals.reduce((n, d) => n + d.sides.reduce((m, s) => m + (s.civ === owner ? -s.gold : d.sides.some((x) => x.civ === owner) ? s.gold : 0), 0), 0);
  }

  // ---------- research and politics ----------

  // Sets what a civ researches: the goal's path (the techs it needs first,
  // then it), the first of them now.
  setResearch(p: Player, goal: TechKey): void {
    const path = techPath(goal, p.techs);
    if (!path.length) return;
    p.research = path[0]!;
    p.researchQueue = path.slice(1);
    this.record('research', p.id, { tech: p.research, goal });
    if (p.scienceBank > 0) { const bank = p.scienceBank; p.scienceBank = 0; this.addScience(p, bank, false); }
  }
  setPolitics(p: Player, goal: PoliticsKey): void {
    const path = politicsPath(goal, p.politics);
    if (!path.length) return;
    p.studying = path[0]!;
    p.politicsQueue = path.slice(1);
    this.record('politics', p.id, { politics: p.studying, goal });
    if (p.cohesionBank > 0) { const bank = p.cohesionBank; p.cohesionBank = 0; this.addCohesion(p, bank, false); }
  }
  // Turns to finish a tech or politics at the civ's current rate.
  turnsTo(cost: number, progress: number, rate: number): number { return rate > 0 ? Math.max(1, Math.ceil((cost - progress) / rate)) : Infinity; }

  private addScience(p: Player, amount: number, tally = true): void {
    if (tally) p.science += amount;
    if (!p.research) { p.scienceBank += amount; return; }
    const k = p.research, got = (p.techProgress[k] ?? 0) + amount;
    if (got < techDef(k).cost) { p.techProgress[k] = got; return; }
    p.techs.add(k);
    delete p.techProgress[k];
    // (A tech that improves the land restyles it: rural/stages.)
    if ((techDef(k).effects ?? []).some((e) => e.k === 'improvement')) this.useVersion++;
    this.record('researched', p.id, { tech: k });
    if (p.isHuman) this.log(`Researched ${techDef(k).name}.`);
    const era = Math.max(...[...p.techs].map((t) => techDef(t).era)) as EraIndex;
    if (era > p.era) {
      p.era = era;
      this.useVersion++; // towns restyle
      if (p.isHuman) this.log(`${p.name} entered the ${ERAS[era].name} era.`);
    }
    const next = p.researchQueue.shift() ?? null;
    p.research = next;
    if (!next && !p.isHuman) { const pick = aiPickTech(this, p); if (pick) this.setResearch(p, pick); }
    this.addScience(p, got - techDef(k).cost, false);
  }
  private addCohesion(p: Player, amount: number, tally = true): void {
    if (tally) p.cohesion += amount;
    if (!p.studying) { p.cohesionBank += amount; return; }
    const k = p.studying, got = (p.politicsProgress[k] ?? 0) + amount;
    if (got < politicsDef(k).cost) { p.politicsProgress[k] = got; return; }
    p.politics.add(k);
    delete p.politicsProgress[k];
    this.record('politicsDone', p.id, { politics: k });
    if (p.isHuman) this.log(`Adopted ${politicsDef(k).name}.`);
    const next = p.politicsQueue.shift() ?? null;
    p.studying = next;
    if (!next && !p.isHuman) { const pick = aiPickPolitics(this, p); if (pick) this.setPolitics(p, pick); }
    if (!p.isHuman) aiGovern(this, p);
    this.addCohesion(p, got - politicsDef(k).cost, false);
  }
  // Culture is identity points to spend (identity.ts); the computer spends them at once.
  private addCulture(p: Player, amount: number): void {
    p.culture += amount;
    p.identityPoints += amount;
    if (!p.isHuman) aiPickTraits(this, p);
  }

  // ---------- identity ----------

  founded(): Set<ReligionKey> { return new Set(this.religions.keys()); }
  // The identity points the civ's next trait costs.
  nextTraitCost(p: Player): number { return traitCost(p.identity.size); }
  canAdopt(p: Player, k: TraitKey): boolean {
    return traitBlock(k, p.identity, p.era, this.founded()) === null && p.identityPoints >= this.nextTraitCost(p);
  }
  // Adopts trait k, for good; a faith still unfounded founds its religion.
  adoptTrait(p: Player, k: TraitKey): boolean {
    if (!this.canAdopt(p, k)) return false;
    p.identityPoints -= this.nextTraitCost(p);
    p.identity.add(k);
    this.record('trait', p.id, { trait: k });
    if (p.isHuman) this.log(`Your people are now known for ${traitDef(k).name}.`);
    const r = traitDef(k).religion;
    if (r && !this.religions.has(r)) this.foundReligion(p, r);
    return true;
  }

  // ---------- government ----------

  setGovernment(p: Player, g: GovernmentKey): boolean {
    if (!this.governmentsOf(p).includes(g) || p.government === g) return false;
    const old = p.policies;
    p.government = g;
    p.policies = emptySlots(g);
    // (The policies that still fit stay.)
    for (const slot of SLOT_KINDS) for (const k of old[slot]) if (k) this.slotPolicy(p, k);
    this.record('government', p.id, { government: g });
    if (p.isHuman) this.log(`${p.name} adopted ${governmentDef(g).name}.`);
    return true;
  }
  // Puts a policy in the first free slot it fits (its kind's before a wildcard).
  slotPolicy(p: Player, k: PolicyKey): boolean {
    if (!this.policiesOf(p).includes(k) || SLOT_KINDS.some((s) => p.policies[s].includes(k))) return false;
    for (const slot of [policyDef(k).kind, 'wildcard'] as PolicySlot[]) {
      const i = p.policies[slot].indexOf(null);
      if (i >= 0) { p.policies[slot][i] = k; this.record('policies', p.id, { policies: p.policies }); return true; }
    }
    return false;
  }
  setPolicy(p: Player, slot: PolicySlot, i: number, k: PolicyKey | null): boolean {
    if (i < 0 || i >= p.policies[slot].length) return false;
    if (k && (!this.policiesOf(p).includes(k) || !fits(k, slot))) return false;
    for (const s of SLOT_KINDS) p.policies[s] = p.policies[s].map((x) => (x === k ? null : x));
    p.policies[slot][i] = k;
    this.record('policies', p.id, { policies: p.policies });
    return true;
  }

  // ---------- religion ----------

  private foundReligion(p: Player, r: ReligionKey): void {
    const holy = p.capital;
    this.religions.set(r, { founder: p.id, holyCity: holy, turn: this.turn });
    if (holy !== null) this.cityById.get(holy)!.religion = r;
    this.record('religionFounded', p.id, { religion: r, holyCity: holy });
    this.log(`${p.name} founded ${religionDef(r).name}.`);
  }

  // Each city takes up the religion pressed on it hardest, once that beats
  // what it follows (holy cities keep theirs).
  private spreadReligions(): void {
    if (!this.religions.size) return;
    const holy = new Set([...this.religions.values()].map((f) => f.holyCity).filter((c): c is number => c !== null));
    const changes: [City, ReligionKey][] = [];
    for (const c of this.cities) {
      if (holy.has(c.id)) continue;
      const pressure = new Map<ReligionKey, number>();
      for (const o of this.cities) {
        if (!o.religion || o === c) continue;
        const d = this.approxDist(c.tile, o.tile);
        if (d > PRESSURE_REACH) continue;
        const strength = ((holy.has(o.id) ? HOLY_PRESSURE : CITY_PRESSURE)
          + BUILDING_PRESSURE * (Number(o.buildings.has('shrine')) + Number(o.buildings.has('temple'))))
          * (1 + total(this.effectsOf(this.players[o.owner]!), 'pressure') / 100);
        pressure.set(o.religion, (pressure.get(o.religion) ?? 0) + strength * (1 - d / (PRESSURE_REACH + 1)));
      }
      let best: ReligionKey | null = null, bestP = 0;
      for (const [r, v] of pressure) if (v > bestP) { best = r; bestP = v; }
      const own = c.religion ? (pressure.get(c.religion) ?? 0) + CONVERT_AT : 0;
      if (best && best !== c.religion && bestP >= CONVERT_AT && bestP > own) changes.push([c, best]);
    }
    for (const [c, r] of changes) {
      c.religion = r;
      this.record('converted', c.owner, { city: c.name, religion: r });
      if (c.owner === HUMAN) this.log(`${c.name} now follows ${religionDef(r).name}.`);
    }
  }

  // ---------- accounts ----------

  // A city's upkeep (economy.ts): the capital pays none.
  upkeepOf(city: City): number {
    const p = this.players[city.owner]!;
    if (p.capital === null || p.capital === city.id) return 0;
    const cap = this.cityById.get(p.capital);
    const others = this.cities.filter((c) => c.owner === p.id).length - 1;
    const dist = cap ? Math.round(this.approxDist(city.tile, cap.tile)) : 0;
    return cityUpkeep(dist, others, city.buildings.has('courthouse'), total(this.effectsOf(p), 'upkeep'), city.pop) * inflation(this.turn);
  }
  // A city's buildings' upkeep.
  buildingUpkeepOf(city: City): number {
    let n = 0;
    for (const b of city.buildings) n += buildingUpkeep(CITY_BUILDINGS[b].cost);
    return n * Math.max(0, 1 + total(this.effectsOf(this.players[city.owner]!), 'buildingUpkeep') / 100) * inflation(this.turn);
  }
  // A civ's upkeep this turn: its cities' (and their buildings'), its
  // fighting units' beyond the free ones.
  upkeep(p: Player): { cities: number; units: number } {
    const cities = this.cities.filter((c) => c.owner === p.id);
    const fighting = this.units.filter((u) => u.owner === p.id && !unitDef(u.type).civilian).length;
    return { cities: cities.reduce((s, c) => s + this.upkeepOf(c) + this.buildingUpkeepOf(c), 0), units: unitUpkeep(fighting, cities.length, total(this.effectsOf(p), 'freeUnits')) * inflation(this.turn) };
  }

  // ---------- upgrades ----------

  // What a unit could be upgraded to now (its line's next unit the civ can
  // build, the resource it needs owned), or null.
  upgradeTarget(u: Unit): UnitKey | null {
    let to = UPGRADES[u.type];
    // (Skipping what the civ never got: a warrior goes straight to a musketman once swordsmen are past.)
    const p = this.players[u.owner]!, can = this.unlocked(p);
    let best: UnitKey | null = null;
    while (to) {
      const need = unitDef(to).needs;
      if (can.has(to) && (!need || this.hasResource(p.id, need))) best = to;
      to = UPGRADES[to];
    }
    return best;
  }
  // Gold to upgrade: one and a half times the difference in cost.
  upgradeCost(u: Unit, to: UnitKey): number { return Math.max(10, Math.round(1.5 * (UNITS[to].cost - UNITS[u.type].cost))); }
  // Upgrades a unit that stands in its own territory (or is packed in an
  // army there), with moves left; it keeps its HP share and spends its turn.
  canUpgrade(u: Unit): boolean {
    const to = this.upgradeTarget(u);
    return to !== null && u.moves > 0 && this.ownerOf(u.tile) === u.owner && this.players[u.owner]!.gold >= this.upgradeCost(u, to);
  }
  upgrade(u: Unit): boolean {
    if (!this.canUpgrade(u)) return false;
    const to = this.upgradeTarget(u)!, cost = this.upgradeCost(u, to);
    this.players[u.owner]!.gold -= cost;
    this.record('upgrade', u.owner, { unit: u.type, to, cost });
    u.type = to;
    u.moves = 0;
    return true;
  }
  // The turn's accounts: upkeep paid, tithes received; a shortfall is taken
  // out of the turn's science.
  private settleAccounts(p: Player): void {
    const up = this.upkeep(p);
    let tithes = 0;
    const tithe = TITHE + total(this.effectsOf(p), 'tithe');
    for (const [r, f] of this.religions) if (f.founder === p.id) tithes += tithe * this.cities.filter((c) => c.religion === r).length;
    p.goldFrac += tithes - up.cities - up.units;
    const whole = Math.trunc(p.goldFrac);
    p.gold += whole;
    p.goldFrac -= whole;
    if (p.gold < 0) {
      const short = -p.gold;
      p.gold = 0;
      if (p.research) p.techProgress[p.research] = Math.max(0, (p.techProgress[p.research] ?? 0) - short * SHORTFALL_SCIENCE);
      this.record('shortfall', p.id, { gold: short });
      if (p.isHuman) this.log(`The treasury is empty: ${short} gold short, taken from research.`);
    }
    p.ledger = { income: this.turnIncome[p.id] ?? ZERO, cityUpkeep: up.cities, unitUpkeep: up.units, tithes, luxuries: this.turnLuxuries[p.id] ?? ZERO, trade: this.dealGold(p.id) };
  }

  // What a civ has, for the record.
  private summary(p: Player): Record<string, unknown> {
    const cities = this.cities.filter((c) => c.owner === p.id);
    return {
      cities: cities.length, pop: cities.reduce((s, c) => s + c.pop, 0), units: this.units.filter((u) => u.owner === p.id).length,
      gold: p.gold, techs: p.techs.size, politics: p.politics.size, traits: [...p.identity], era: p.era, government: p.government,
      income: p.ledger.income, upkeep: +(p.ledger.cityUpkeep + p.ledger.unitUpkeep).toFixed(2), tithes: p.ledger.tithes, luxuries: p.ledger.luxuries, trade: p.ledger.trade,
      deals: this.deals.filter((d) => d.sides.some((s) => s.civ === p.id)).length,
      wars: this.players.filter((o) => o.id !== p.id && this.atWar(p.id, o.id)).map((o) => o.id),
    };
  }

  // ---------- buying ----------

  // What finishing a city's current item costs in gold, or in faith (a
  // Shrine or Temple only); null if it can't be bought (a wonder).
  buyCost(city: City, currency: 'gold' | 'faith'): number | null {
    const k = city.building;
    if (!k || isWonder(k)) return null;
    if (currency === 'faith' && !FAITH_BUYS.includes(k)) return null;
    const left = Math.max(0, buildDef(k).cost - city.prod);
    const discount = currency === 'gold' ? Math.max(0.2, 1 + total(this.effectsOf(this.players[city.owner]!), 'buyCost') / 100) : 1;
    return Math.ceil(left * (currency === 'gold' ? GOLD_PER_PROD : FAITH_PER_PROD) * discount);
  }
  buy(city: City, currency: 'gold' | 'faith'): boolean {
    const cost = this.buyCost(city, currency), p = this.players[city.owner]!;
    if (cost === null || (currency === 'gold' ? p.gold : p.faith) < cost) return false;
    if (currency === 'gold') p.gold -= cost; else p.faith -= cost;
    this.record('bought', p.id, { city: city.name, item: city.building, currency, cost });
    city.prod = buildDef(city.building!).cost;
    return true;
  }

  // ---------- diplomacy ----------

  atWar(a: number, b: number): boolean { return a !== b && this.relations[a]![b]!.war; }
  declareWar(a: number, b: number): void {
    if (a === b || this.atWar(a, b)) return;
    this.relations[a]![b] = this.relations[b]![a] = { war: true, since: this.turn };
    this.met[a]![b] = this.met[b]![a] = 1;
    this.peaceOffers.delete(`${a}>${b}`);
    this.peaceOffers.delete(`${b}>${a}`);
    for (const d of this.deals.filter((x) => x.sides.some((s) => s.civ === a) && x.sides.some((s) => s.civ === b))) this.endDeal(d, 'war');
    for (let i = this.dealOffers.length - 1; i >= 0; i--) if (this.dealBlock(this.dealOffers[i]!.sides) !== null) this.dealOffers.splice(i, 1);
    this.record('war', a, { on: b });
    if (a === HUMAN || b === HUMAN) this.log(`${this.players[a]!.name} declared war on ${this.players[b]!.name}!`);
  }
  // Whether peace can be made yet (after MIN_WAR turns of war).
  canMakePeace(a: number, b: number): boolean { return this.atWar(a, b) && this.turn - this.relations[a]![b]!.since >= MIN_WAR; }
  makePeace(a: number, b: number): boolean {
    if (!this.canMakePeace(a, b)) return false;
    this.relations[a]![b] = this.relations[b]![a] = { war: false, since: this.turn };
    this.peaceOffers.delete(`${a}>${b}`);
    this.peaceOffers.delete(`${b}>${a}`);
    this.record('peace', a, { with: b });
    if (a === HUMAN || b === HUMAN) this.log(`${this.players[a]!.name} and ${this.players[b]!.name} made peace.`);
    // (Units left standing in the other's territory go home.)
    for (const u of this.units) {
      if (u.packedIn !== null) continue;
      const o = this.ownerOf(u.tile);
      if ((u.owner === a && o === b) || (u.owner === b && o === a)) {
        const home = this.cities.find((c) => c.owner === u.owner);
        const t = home ? this.freeTileNear(u.type, u.owner, home.tile) : null;
        if (t !== null) { u.tile = t; for (const v of this.armyOf(u)) v.tile = t; }
      }
    }
    return true;
  }
  // Offers peace: an AI answers at once (ai.ts); the human answers in the
  // diplomacy panel.
  offerPeace(from: number, to: number): boolean {
    if (!this.canMakePeace(from, to)) return false;
    this.record('peaceOffered', from, { to });
    if (!this.players[to]!.isHuman) return aiAcceptsPeace(this, this.players[to]!, from) ? this.makePeace(from, to) : false;
    this.peaceOffers.add(`${from}>${to}`);
    this.log(`${this.players[from]!.name} offers peace.`);
    return true;
  }
  // Civs meet once a unit or city of one comes within sight of the other's.
  private updateContacts(): void {
    const n = this.players.length;
    const seen = (p: number): number[] => [...this.units.filter((u) => u.owner === p).map((u) => u.tile), ...this.cities.filter((c) => c.owner === p).map((c) => c.tile)];
    const at = this.players.map((p) => (p.alive ? seen(p.id) : []));
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (this.met[a]![b]) continue;
      if (at[a]!.some((x) => at[b]!.some((y) => this.approxDist(x, y) <= 4))) {
        this.met[a]![b] = this.met[b]![a] = 1;
        if (a === HUMAN || b === HUMAN) this.log(`Met the ${this.players[a === HUMAN ? b : a]!.name}.`);
      }
    }
  }

  // ---------- turn flow ----------

  endTurn(): void {
    if (this.over) return;
    // Citizens the human left unplaced: the governor places them.
    for (const c of this.cities) if (c.growth > 0) this.autoPlace(c);
    this.dealOffers.length = 0; // (unanswered offers lapse; the computer may make new ones)
    for (const p of this.players) {
      if (!p.isHuman && p.alive) aiTurn(this, p);
    }
    this.turnIncome = [];
    this.turnLuxuries = [];
    for (const city of [...this.cities]) this.processCity(city);
    for (const p of this.players) if (p.alive) this.addLuxuries(p);
    this.settleDeals();
    for (const p of this.players) if (p.alive) this.settleAccounts(p);
    this.contestBorders();
    this.spreadReligions();
    // Cities strike nearby enemies and mend their walls; pillaged tiles are
    // repaired once no enemy stands on them.
    for (const city of this.cities) {
      this.cityStrike(city);
      city.hp = Math.min(this.cityMaxHp(city), city.hp + CITY_REGEN);
    }
    for (let t = 0; t < this.N; t++) {
      if (!this.pillaged[t]) continue;
      const o = this.ownerOf(t);
      if (o < 0 || this.use[t] !== USE.rural) { this.pillaged[t] = 0; this.useVersion++; continue; }
      if (this.units.some((u) => u.tile === t && u.owner !== o)) continue;
      if (--this.pillaged[t] === 0) this.useVersion++;
    }
    for (const u of this.units) {
      const mv = this.maxMoves(u.type, u.owner);
      if (u.moves >= mv && u.hp < 100) {
        const home = this.cityByTile.get(u.tile)?.owner === u.owner;
        u.hp = Math.min(100, u.hp + (home ? 25 : 10) + total(this.effectsOf(this.players[u.owner]!), 'heal'));
      }
      u.moves = mv;
      u.skipped = false;
    }
    for (const p of this.players) if (p.alive) this.record('summary', p.id, this.summary(p));
    this.turn++;
    for (const u of this.units.filter((x) => x.owner === HUMAN && x.goal != null)) this.continueGoto(u);
    this.checkElimination();
    this.updateContacts();
    this.updateVisibility();
    this.record('turn', -1, {});
  }

  private checkElimination(): void {
    for (const p of this.players) {
      if (!p.alive) continue;
      const hasCity = this.cities.some((c) => c.owner === p.id);
      const hasSettler = this.units.some((u) => u.owner === p.id && u.type === 'settler');
      if (!hasCity && !hasSettler) {
        p.alive = false;
        for (const u of this.units.filter((x) => x.owner === p.id)) this.removeUnit(u);
        this.log(`${p.name} has been destroyed!`);
      }
    }
    if (!this.players[HUMAN].alive) this.over = 'defeat';
    else if (this.players.every((p) => p.isHuman || !p.alive)) this.over = 'victory';
  }

  updateVisibility(): void {
    this.visible.fill(0);
    const reveal = (t: number, r: number) => { for (const x of this.tilesWithin(t, r)) this.visible[x] = 1; };
    for (const u of this.units) {
      if (u.owner !== HUMAN) continue;
      const high = this.relief[u.tile] !== 'flat';
      reveal(u.tile, (unitDef(u.type).sight ?? 2) + (high ? 1 : 0));
    }
    for (const c of this.cities) if (c.owner === HUMAN) reveal(c.tile, 2);
    // (Its territory is in sight too.)
    for (let t = 0; t < this.N; t++) if (this.ownerOf(t) === HUMAN) this.visible[t] = 1;
    for (let t = 0; t < this.N; t++) if (this.visible[t]) this.explored[t] = 1;
  }

  log(text: string): void {
    this.messages.push({ turn: this.turn, text });
    if (this.messages.length > 50) this.messages.shift();
  }

  // ---------- setup ----------

  private placeUnits(): void {
    this.players.forEach((p, i) => {
      const s = this.world.starts[i];
      if (s === undefined) return; // (a City Lab civ past the map's starts)
      // (Each on its own tile: createUnit finds the next free one.)
      this.createUnit('settler', p.id, s);
      const nb = this.tiles[s].neighbors.find((x) => !this.isWater(x)) ?? s;
      this.createUnit('warrior', p.id, nb);
      if (p.isHuman) this.createUnit('scout', p.id, nb);
    });
  }

}

// Whether two growth options are the same placement.
export const sameOption = (a: GrowthOption, b: GrowthOption): boolean =>
  a.kind === 'specialist' ? b.kind === 'specialist' && a.specialist === b.specialist : b.kind === 'rural' && a.tile === b.tile;

export const BUILDABLE: BuildKey[] = [...(Object.keys(UNITS) as UnitKey[]), ...(Object.keys(BUILDINGS) as BuildingKey[]), ...WONDER_KEYS];

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number { return this.keys.length; }

  push(key: number, val: number): void {
    const k = this.keys, v = this.vals;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const k = this.keys, v = this.vals;
    const top = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]];
  }
}
