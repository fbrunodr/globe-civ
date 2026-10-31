import { buildFlora, type Flora } from './flora.ts';
import type { ArchCiv } from './architecture.ts';
import type { Globe, Tile } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import { generateWorld, type World } from './world.ts';
import { tileYieldOf } from './mapRules.ts';
import { mulberry32, type Rng } from './rng.ts';
import {
  unitDef, buildDef, isUnitKey, isWonder, UNITS, BUILDINGS, CIVS, growthCost,
  type UnitKey, type BuildingKey, type BuildKey, type MapSizeKey, type MapScriptKey,
} from './rules.ts';
import {
  isWaterBiome, terrainMoveCost, terrainDefense,
  type BiomeKey, type ReliefKey, type FeatureKey, type TileTerrain, type Yields,
} from './terrain.ts';
import { aiTurn } from './ai.ts';
import {
  USE, FOOD_PER_CITIZEN, ZERO, CITY_REACH, START_REACH, tileCost, GROWTH_TURNS, SPECIALIST_KINDS, AQUEDUCT_KEEP, BUILDINGS as CITY_BUILDINGS,
  addOut, scaleOut, centerYield, ruralYield, improvementFor, governorScore, specialistsWanted,
  buildingsYield, withPercents, wonderBeside, specialistYield, specialistSlots, buildingAllowed, weigh, WONDERS, WONDER_KEYS, ERAS, eraOf,
  type FocusKey, type GrowthOption, type TileUse, type Output, type SpecialistKind, type WonderKey, type WonderSite, type EraIndex, type ImprovementKey,
} from './cities.ts';
import { IMPROVEMENTS } from './cities.ts';

const IMPROVEMENT_NAME = (t: TileTerrain): string => {
  const k = improvementFor(t);
  return k ? IMPROVEMENTS[k].name.toLowerCase() : 'land';
};

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
  science: number; // totals so far (the science, culture and faith systems come later)
  culture: number;
  faith: number;
  era: EraIndex;
  citiesFounded: number;
  offensive: boolean; // AI only
}

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
      isHuman: id === HUMAN, alive: true, gold: 0, science: 0, culture: 0, faith: 0, era: 0, citiesFounded: 0, offensive: false,
    }));

    this.placeUnits();
    this.updateVisibility();
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

  isEnemyOccupied(t: number, owner: number): boolean {
    const city = this.cityByTile.get(t);
    if (city && city.owner !== owner) return true;
    return this.units.some((u) => u.tile === t && u.packedIn === null && u.owner !== owner);
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
    if (this.isWater(goal)) return null;
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
      if (moves <= 0) { turns++; moves = unitDef(u.type).mv; }
      moves -= this.moveCost(t);
    }
    return turns;
  }

  // ---------- actions ----------

  // A new unit on `tile`, or (one unit per tile) the nearest free tile.
  createUnit(type: UnitKey, owner: number, tile: number): Unit {
    tile = this.freeTileNear(type, owner, tile) ?? tile;
    const u: Unit = { id: this.nextId++, type, owner, tile, packedIn: null, moves: UNITS[type].mv, hp: 100,
      fortified: false, skipped: false, goal: null, dead: false, aiTarget: null };
    this.units.push(u);
    return u;
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
    if (role === 'atk') return combatStrength(u.type, 'atk', u.hp, 0);
    let bonus = this.defenseBonus(tile);
    const city = this.cityByTile.get(tile);
    if (city) bonus += 0.5 + (city.buildings.has('walls') ? 1 : 0) + 0.25 * (Number(city.buildings.has('barracks')) + Number(city.buildings.has('stable')));
    if (u.fortified) bonus += FORTIFY_BONUS;
    return combatStrength(u.type, 'def', u.hp, bonus);
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
    this.onBattle?.(u, tile, ranged);
    const d = this.bestDefender(tile, u.owner);
    if (d) {
      const after = fightRounds(u.hp, d.hp, this.unitStrength(u, 'atk', tile), this.unitStrength(d, 'def', tile), ranged, this.rng);
      u.hp = after.attacker;
      d.hp = after.defender;
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
  cityStrength(c: City): number {
    const garrison = Number(c.buildings.has('barracks')) + Number(c.buildings.has('stable'));
    return 2.5 + 0.3 * c.pop + (c.buildings.has('walls') ? 3 : 0) + garrison;
  }

  // A unit attacks a city with no defenders: a few exchanges with its walls.
  private siege(u: Unit, city: City, ranged: boolean): void {
    const A = this.unitStrength(u, 'atk', city.tile), D = this.cityStrength(city);
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
      if (u.owner === city.owner || unitDef(u.type).civilian || !near.has(u.tile)) continue;
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
    return o >= 0 && o !== u.owner && this.use[t] === USE.rural && this.pillaged[t] === 0;
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
      this.log(`${this.players[u.owner].name} pillaged ${city ? `${city.name}'s` : 'a'} ${IMPROVEMENT_NAME(this.terrainAt(t))}.`);
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
      hp: CITY_HP, founder: u.owner, razing: false };
    this.cities.push(city);
    this.cityById.set(city.id, city);
    this.cityByTile.set(city.tile, city);
    this.tileCity[city.tile] = city.id;
    this.setUse(city.tile, USE.center);
    this.claimTerritory(city);
    this.removeUnit(u);
    if (p.isHuman) this.log(`Founded ${name}.`);
    else if (this.explored[city.tile]) this.log(`${p.name} founded ${name}.`);
    this.updateVisibility();
    return city;
  }

  // A new city owns the tiles around its center (those no one owns yet).
  private claimTerritory(city: City): void {
    for (const t of this.tilesWithin(city.tile, START_REACH)) {
      if (this.tileCity[t] === -1) this.tileCity[t] = city.id;
    }
  }

  // ---------- buying tiles ----------

  // The tiles a city could buy: within its reach, owned by no one, touching
  // a tile of its own.
  buyableTiles(city: City): number[] {
    return this.tilesWithin(city.tile, CITY_REACH).filter((t) => this.tileCity[t] === -1
      && this.tiles[t].neighbors.some((n) => this.tileCity[n] === city.id));
  }
  tilePrice(city: City): number { return tileCost(city.bought); }
  canBuyTile(city: City, t: number): boolean {
    return this.players[city.owner]!.gold >= this.tilePrice(city) && this.buyableTiles(city).includes(t);
  }
  // The governor's pick of a tile to buy: what it would yield worked, for
  // the city's focus (ties to the lower tile).
  governorTileToBuy(city: City): number | null {
    let best: number | null = null, bestS = -Infinity;
    for (const t of this.buyableTiles(city)) {
      const k = improvementFor(this.terrainAt(t));
      const s = k ? weigh(city.focus, ruralYield(this.terrainAt(t), this.map.riverTile[t] === 1, this.eraAt(t))) : -1;
      if (s > bestS) { best = t; bestS = s; }
    }
    return best;
  }
  buyTile(city: City, t: number): boolean {
    if (!this.canBuyTile(city, t)) return false;
    this.players[city.owner]!.gold -= this.tilePrice(city);
    this.tileCity[t] = city.id;
    city.bought++;
    this.useVersion++;
    return true;
  }

  private captureCity(city: City, newOwner: number): void {
    const old = this.players[city.owner];
    const p = this.players[newOwner];
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
    return this.cityTiles(city, USE.rural).filter((t) => !this.pillaged[t] && improvementFor(this.terrainAt(t)) === k).length;
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

  // What a developed tile adds to its city (wild tiles add nothing).
  tileOutput(t: number): Output {
    const terrain = this.terrainAt(t), river = this.map.riverTile[t] === 1;
    const u = this.use[t];
    if (u === USE.rural) return addOut(this.pillaged[t] ? ZERO : ruralYield(terrain, river, this.eraAt(t)), this.wondersAt(t).reduce((o, w) => addOut(o, WONDERS[w].yields), ZERO));
    const wonders = this.wondersAt(t).reduce((o, w) => addOut(o, WONDERS[w].yields), ZERO);
    if (u === USE.wild) return wonders; // a wonder beside the city
    // The center: the city, its buildings, wonders and specialists.
    const city = this.cityByTile.get(t);
    if (!city) return ZERO;
    const specialists = SPECIALIST_KINDS.reduce((o, k) => addOut(o, scaleOut(specialistYield(k), city.specialists[k])), ZERO);
    return addOut(addOut(addOut(centerYield(terrain, river), buildingsYield(city.buildings, city.pop, (k) => this.worked(city, k))), wonders), specialists);
  }

  // A tile an enemy unit stands on yields nothing to its city.
  private blockedFor(city: City, t: number): boolean {
    return this.units.some((u) => u.tile === t && u.owner !== city.owner);
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
    return { ...sum, surplus: sum.food - FOOD_PER_CITIZEN * city.pop };
  }

  // Where the city's next citizen may go: a wild tile it owns with an
  // improvement (rural), or a specialist in one of its buildings with room.
  growthOptions(city: City): GrowthOption[] {
    const out: GrowthOption[] = [];
    for (const t of this.tilesWithin(city.tile, CITY_REACH)) {
      if (this.tileCity[t] !== city.id || this.blockedFor(city, t) || this.use[t] !== USE.wild) continue;
      const improvement = improvementFor(this.terrainAt(t));
      if (improvement) out.push({ kind: 'rural', tile: t, improvement });
    }
    for (const k of SPECIALIST_KINDS) if (this.specialistRoom(city, k) > 0) out.push({ kind: 'specialist', specialist: k });
    return out;
  }

  // What an option adds to the city.
  optionYield(o: GrowthOption): Output {
    if (o.kind === 'specialist') return specialistYield(o.specialist);
    return ruralYield(this.terrainAt(o.tile), this.map.riverTile[o.tile] === 1, this.eraAt(o.tile));
  }

  // The governor's pick for the city's focus (ties go to the lower tile, so
  // it is deterministic), or null if the city has nowhere to grow.
  governorPick(city: City): GrowthOption | null {
    const surplus = this.cityYields(city).surplus - FOOD_PER_CITIZEN;
    const short = this.specialistCount(city) < specialistsWanted(city.pop + 1);
    const want = growthCost(city.pop + 1) / GROWTH_TURNS;
    let best: GrowthOption | null = null, bestS = -Infinity;
    for (const o of this.growthOptions(city)) {
      const gain = this.optionYield(o);
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

  // A building can be queued once per city, and only while it has a place to go.
  canBuild(city: City, key: BuildKey): boolean {
    if (isUnitKey(key)) return true;
    if (isWonder(key)) return !this.wondersBuilt.has(key) && (this.wonderSpots(city, key).length > 0 || city.wonderTile !== null && city.building === key);
    return buildingAllowed(key, city.buildings, this.cityRiver(city), this.cityCoast(city));
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
    const cost = growthCost(city.pop + city.growth);
    if (city.food >= cost) {
      if (!this.growthOptions(city).length) {
        city.food = cost; // nowhere to put a new citizen: the city stagnates
      } else {
        city.growth++;
        city.food = city.buildings.has('aqueduct') ? Math.floor(cost * AQUEDUCT_KEEP) : 0;
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
      city.prod += y.prod;
      if (city.prod >= item.cost) {
        if (key === 'settler' && city.pop < 2) {
          city.prod = item.cost; // wait until the city can spare a citizen
        } else {
          city.prod -= item.cost;
          if (isUnitKey(key)) {
            this.createUnit(key, city.owner, city.tile);
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
            city.building = null;
            if (p.isHuman) this.log(`${city.name} completed ${item.name}.`);
          }
        }
      }
    } else {
      p.gold += y.prod; // nothing to build: production becomes gold
    }
    p.gold += y.gold;
    p.science += y.science;
    p.culture += y.culture;
    p.faith += y.faith;
    const era = eraOf(p.science);
    if (era > p.era) {
      p.era = era;
      this.useVersion++; // towns restyle
      if (p.isHuman || this.explored[city.tile]) this.log(`${p.name} entered the ${ERAS[era].name} era.`);
    }
  }

  // ---------- turn flow ----------

  endTurn(): void {
    if (this.over) return;
    // Citizens the human left unplaced: the governor places them.
    for (const c of this.cities) if (c.growth > 0) this.autoPlace(c);
    for (const p of this.players) {
      if (!p.isHuman && p.alive) aiTurn(this, p);
    }
    for (const city of [...this.cities]) this.processCity(city);
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
      const mv = unitDef(u.type).mv;
      if (u.moves === mv && u.hp < 100) {
        const home = this.cityByTile.get(u.tile)?.owner === u.owner;
        u.hp = Math.min(100, u.hp + (home ? 25 : 10));
      }
      u.moves = mv;
      u.skipped = false;
    }
    this.turn++;
    for (const u of this.units.filter((x) => x.owner === HUMAN && x.goal != null)) this.continueGoto(u);
    this.checkElimination();
    this.updateVisibility();
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
