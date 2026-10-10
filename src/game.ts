import { buildFlora, type Flora } from './flora.ts';
import type { Globe, Tile } from './goldberg.ts';
import type { MapData } from './mapgen.ts';
import { generateWorld, type World } from './world.ts';
import { tileYieldOf } from './mapRules.ts';
import { mulberry32, type Rng } from './rng.ts';
import {
  unitDef, buildDef, isUnitKey, isWonder, UNITS, BUILDINGS, CIVS, growthCost, territoryRadius,
  type UnitKey, type BuildingKey, type BuildKey, type MapSizeKey,
} from './rules.ts';
import {
  isWaterBiome, terrainMoveCost, terrainDefense,
  type BiomeKey, type ReliefKey, type FeatureKey, type TileTerrain, type Yields,
} from './terrain.ts';
import { aiTurn } from './ai.ts';
import {
  USE, MAX_SPECIALISTS, FOOD_PER_CITIZEN, SLOTS, ZERO, FAMILIES, BUILDINGS as CITY_BUILDINGS, GROWTH_TURNS,
  addOut, scaleOut, centerYield, ruralYield, urbanYield, improvementFor, urbanAllowed, governorScore, townsfolkWanted,
  slotsYield, quarterOf, specialistYield, slotCode, slotKey, familyOf, buildingFits, weigh, WONDERS, WONDER_KEYS, ERAS, eraOf,
  type FocusKey, type GrowthOption, type TileUse, type Output, type FamilyKey, type AdjacencySource, type WonderKey, type WonderSite, type EraIndex,
} from './cities.ts';
import { isWorldOcean } from './mapRules.ts';
import { IMPROVEMENTS } from './cities.ts';

const IMPROVEMENT_NAME = (t: TileTerrain): string => {
  const k = improvementFor(t);
  return k ? IMPROVEMENTS[k].name.toLowerCase() : 'land';
};
import { BIOME_CLASS } from './paint.ts';

export const HUMAN = 0;

export type Yield = Yields;

export interface CityYield extends Output {
  surplus: number;
}

// A reason a tile's family building gains: a neighbor (or the tile itself,
// for a river) and what it is.
export interface AdjacencyHit {
  tile: number;
  source: AdjacencySource;
}

export interface Player {
  id: number;
  name: string;
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

export interface Unit {
  id: number;
  type: UnitKey;
  owner: number;
  tile: number;
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
  pendingBuilding: BuildingKey | null; // completed, waiting for the human to place it
  wonderTile: number | null;           // where the wonder being built will stand
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
  cities: City[] = [];
  readonly cityById = new Map<number, City>();
  readonly cityByTile = new Map<number, City>();
  readonly tileCity: Int32Array; // territory: owning city id, or -1
  readonly use: Uint8Array;         // TileUse of each tile (cities.ts); wild unless a city developed it
  readonly specialists: Uint8Array; // specialists living in each urban tile
  readonly slots: Uint8Array;       // SLOTS building slots per tile (cities.ts slotCode; 0 = empty)
  readonly wonderAt: Uint8Array;    // the wonder on each tile (index + 1 in WONDER_KEYS; 0 = none)
  readonly pillaged: Uint8Array;    // turns of repair left on a pillaged rural tile (0 = fine)
  readonly ruins: Uint8Array;       // 1 where a razed city's built-up tiles stood
  readonly wondersBuilt = new Map<WonderKey, number>(); // wonder -> tile
  useVersion = 0;                   // bumped whenever a tile's use changes (for the renderer)
  readonly explored: Uint8Array;
  readonly visible: Uint8Array;
  readonly messages: Message[] = [];
  readonly players: Player[];
  over: 'victory' | 'defeat' | null = null;

  constructor({ size, seed }: GameOptions) {
    this.seed = seed;
    this.world = generateWorld(size, seed);
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
    this.specialists = new Uint8Array(this.N);
    this.slots = new Uint8Array(this.N * SLOTS);
    this.wonderAt = new Uint8Array(this.N);
    this.pillaged = new Uint8Array(this.N);
    this.ruins = new Uint8Array(this.N);
    this.explored = new Uint8Array(this.N);
    this.visible = new Uint8Array(this.N);

    this.players = CIVS.slice(0, this.world.starts.length).map((civ, id) => ({
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

  unitsAt(t: number): Unit[] { return this.units.filter((u) => u.tile === t); }

  isEnemyOccupied(t: number, owner: number): boolean {
    const city = this.cityByTile.get(t);
    if (city && city.owner !== owner) return true;
    return this.units.some((u) => u.tile === t && u.owner !== owner);
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

  canFoundCity(t: number, owner: number): boolean {
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
  // the final destination (that step becomes an attack).
  findPath(u: Unit, goal: number): number[] | null {
    if (goal === u.tile) return [];
    if (this.isWater(goal)) return null;
    if (this.isEnemyOccupied(goal, u.owner) && !this.canAttack(u)) return null;

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
        if (nb !== goal && this.isEnemyOccupied(nb, u.owner)) continue;
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

  createUnit(type: UnitKey, owner: number, tile: number): Unit {
    const u: Unit = { id: this.nextId++, type, owner, tile, moves: UNITS[type].mv, hp: 100,
      fortified: false, skipped: false, goal: null, dead: false, aiTarget: null };
    this.units.push(u);
    return u;
  }

  removeUnit(u: Unit): void {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    u.dead = true;
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
      u.moves = Math.max(0, u.moves - this.moveCost(next));
      u.tile = next;
    }
    if (u.tile === u.goal) u.goal = null;
    if (u.owner === HUMAN) this.updateVisibility();
  }

  unitStrength(u: Unit, role: 'atk' | 'def', tile: number): number {
    const T = unitDef(u.type);
    let s = role === 'atk' ? T.atk : T.def;
    if (role === 'def') {
      let mult = 1 + this.defenseBonus(tile);
      const city = this.cityByTile.get(tile);
      if (city) mult += 0.5 + (city.buildings.has('walls') ? 1 : 0) + 0.25 * (Number(city.buildings.has('barracks')) + Number(city.buildings.has('stable')));
      // Built-up ground of one's own city is costly to take.
      else if (this.use[tile] === USE.urban && this.ownerOf(tile) === u.owner) mult += 0.5;
      if (u.fortified) mult += 0.5;
      s *= mult;
    }
    return s * (0.5 + 0.5 * u.hp / 100);
  }

  bestDefender(tile: number, attackerOwner: number): Unit | null {
    let best: Unit | null = null, bestS = -1;
    for (const d of this.units) {
      if (d.tile !== tile || d.owner === attackerOwner || unitDef(d.type).civilian) continue;
      const s = this.unitStrength(d, 'def', tile);
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
    const d = this.bestDefender(tile, u.owner);
    if (d) {
      const A = this.unitStrength(u, 'atk', tile), D = this.unitStrength(d, 'def', tile);
      // A ranged attack is a volley: a few exchanges, half the damage back.
      for (let round = 0; u.hp > 0 && d.hp > 0 && (!ranged || round < 3); round++) {
        const dmg = 18 + Math.floor(this.rng() * 14);
        if (this.rng() < A / (A + D)) d.hp -= dmg; else u.hp -= ranged ? Math.round(dmg / 2) : dmg;
      }
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
    // Civilians are captured and the attacker moves in.
    for (const v of this.unitsAt(tile)) {
      if (v.owner === u.owner) continue;
      if (v.owner === HUMAN || u.owner === HUMAN) this.log(`${this.players[v.owner].name} ${unitDef(v.type).name} was captured.`);
      this.removeUnit(v);
    }
    u.tile = tile;
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

  // Each city strikes the weakest enemy unit near its center (2 tiles with
  // walls) or near a Garrison quarter.
  private cityStrike(city: City): void {
    if (city.hp <= 0) return;
    const reach = city.buildings.has('walls') ? 2 : 1;
    const origins = [city.tile, ...this.cityTiles(city, USE.urban).filter((t) => quarterOf(this.slotKeys(t)) === 'garrison')];
    const near = new Set(origins.flatMap((t) => this.tilesWithin(t, reach)));
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

  private destroyCity(c: City): void {
    for (let t = 0; t < this.N; t++) {
      if (this.tileCity[t] !== c.id) continue;
      if (this.use[t] === USE.urban || this.use[t] === USE.center) this.ruins[t] = 1;
      if (this.use[t] !== USE.wild) this.setUse(t, USE.wild);
      this.slots.fill(0, t * SLOTS, t * SLOTS + SLOTS);
      this.wonderAt[t] = 0; // its wonders fall with it (never to be rebuilt)
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
      building: p.isHuman ? 'warrior' : null, buildings: new Set(), founded: this.turn, focus: 'balanced', growth: 0, pendingBuilding: null, wonderTile: null,
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

  private claimTerritory(city: City): void {
    for (const t of this.tilesWithin(city.tile, territoryRadius(city.pop))) {
      if (this.tileCity[t] === -1) this.tileCity[t] = city.id;
    }
  }

  private captureCity(city: City, newOwner: number): void {
    const old = this.players[city.owner];
    const p = this.players[newOwner];
    city.owner = newOwner;
    city.hp = Math.round(this.cityMaxHp(city) * 0.4);
    city.razing = false;
    if (city.pop > 1) this.removeCitizen(city);
    city.growth = 0;
    city.pendingBuilding = null;
    city.wonderTile = null;
    // Temples and garrisons do not survive a conquest; the rest change hands.
    for (const t of this.cityTiles(city, USE.urban).concat(city.tile)) {
      for (let k = 0; k < SLOTS; k++) {
        const b = slotKey(this.slots[t * SLOTS + k]!);
        const f = b ? familyOf(b) : null;
        if (b && (f === 'temple' || f === 'garrison')) { this.slots[t * SLOTS + k] = 0; city.buildings.delete(b); }
      }
    }
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
    return this.tilesWithin(city.tile, 3).filter((t) => this.tileCity[t] === city.id && this.use[t] === use);
  }

  // ---------- buildings ----------

  slotKeys(t: number): (BuildingKey | null)[] {
    const out: (BuildingKey | null)[] = [];
    for (let k = 0; k < SLOTS; k++) out.push(slotKey(this.slots[t * SLOTS + k]!));
    return out;
  }

  // What gives family f's buildings on tile t their adjacency: each neighbor
  // counts once, for the first source it matches (the center with walls
  // counts twice for a Garrison); a river beside the tile counts once.
  adjacencyHits(t: number, f: FamilyKey): AdjacencyHit[] {
    const hits: AdjacencyHit[] = [];
    const sources = FAMILIES[f].adjacency;
    if (sources.includes('river') && this.map.riverTile[t]) hits.push({ tile: t, source: 'river' });
    for (const n of this.tiles[t].neighbors) {
      for (const src of sources) {
        if (src === 'river') continue;
        if (this.isSource(n, src)) {
          hits.push({ tile: n, source: src });
          if (src === 'center' && sources.includes('walls') && this.cityByTile.get(n)?.buildings.has('walls')) hits.push({ tile: n, source: 'walls' });
          break;
        }
      }
    }
    return hits;
  }

  private isSource(n: number, src: AdjacencySource): boolean {
    switch (src) {
      case 'mountain': return this.relief[n] === 'mountains';
      case 'forest': return BIOME_CLASS[this.biome[n]] === 'forest' && this.relief[n] !== 'mountains' && this.use[n] !== USE.urban;
      case 'mine': case 'quarry': case 'boats': return this.use[n] === USE.rural && improvementFor(this.terrainAt(n)) === src;
      case 'center': return this.use[n] === USE.center;
      case 'walls': return false; // counted with the center
      case 'river': return false;
      case 'wonder': return this.isWonderTile(n);
      default: return this.slotKeys(n).some((k) => k !== null && familyOf(k) === src);
    }
  }

  // ---------- wonders ----------

  wonderOn(t: number): WonderKey | null { return this.wonderAt[t] ? WONDER_KEYS[this.wonderAt[t]! - 1] ?? null : null; }
  isWonderTile(t: number): boolean { return this.wonderAt[t]! > 0; }

  private siteOk(t: number, site: WonderSite): boolean {
    switch (site) {
      case 'desertOrFloodplain': return this.biome[t] === 'hotDesert' || this.biome[t] === 'coldDesert' || this.feature[t] === 'floodplain';
      case 'coast': return this.tiles[t].neighbors.some((n) => isWorldOcean(this.biome[n]));
      case 'river': return this.map.riverTile[t] === 1;
      case 'mountains': return this.tiles[t].neighbors.some((n) => this.relief[n] === 'mountains');
      case 'hills': return this.relief[t] === 'hills';
      case 'flat': return this.relief[t] === 'flat' && this.feature[t] === null;
      case 'any': return true;
    }
  }

  // Where wonder k could stand in the city: a land urban tile with no
  // buildings, or a rural tile touching the core, meeting its terrain need.
  wonderSpots(city: City, k: WonderKey): number[] {
    const out: number[] = [];
    for (const t of this.tilesWithin(city.tile, 3)) {
      if (this.tileCity[t] !== city.id || this.isWater(t) || this.blockedFor(city, t) || this.wonderAt[t]) continue;
      const u = this.use[t];
      const ok = u === USE.urban ? this.slotKeys(t).every((x) => x === null)
        : u === USE.rural ? urbanAllowed(this.terrainAt(t)) && this.touchesCore(city, t) : false;
      if (ok && this.siteOk(t, WONDERS[k].site)) out.push(t);
    }
    return out;
  }

  // Starts wonder k on tile t (the tile is kept for it; production goes on).
  startWonder(city: City, k: WonderKey, t: number): boolean {
    if (this.wondersBuilt.has(k) || !this.wonderSpots(city, k).includes(t)) return false;
    if (city.building !== k) city.building = k;
    city.wonderTile = t;
    this.useVersion++;
    return true;
  }

  governorWonderSpot(city: City, k: WonderKey): number | null {
    let best: number | null = null, bestS = -Infinity;
    for (const t of this.wonderSpots(city, k)) {
      // Keep good farms: prefer urban tiles, then the poorest rural tile.
      const s = this.use[t] === USE.urban ? 100 : -weigh(city.focus, this.tileOutput(t));
      if (s > bestS) { best = t; bestS = s; }
    }
    return best;
  }

  private completeWonder(city: City, k: WonderKey, t: number): void {
    if (this.use[t] === USE.rural) this.setUse(t, USE.urban);
    this.specialists[t] = 0;
    this.wonderAt[t] = WONDER_KEYS.indexOf(k) + 1;
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
    if (u === USE.rural) return this.pillaged[t] ? ZERO : ruralYield(terrain, river, this.eraAt(t));
    if (u !== USE.urban && u !== USE.center) return ZERO;
    const keys = this.slotKeys(t);
    const built = slotsYield(keys, (f) => this.adjacencyHits(t, f).length);
    const base = u === USE.center ? centerYield(terrain, river) : urbanYield(river);
    const w = this.wonderOn(t);
    const wonder = w ? WONDERS[w].yields : ZERO;
    return addOut(addOut(addOut(base, built), wonder), scaleOut(specialistYield(quarterOf(keys)), this.specialists[t]!));
  }

  // Where building k could go in the city now: an urban tile (or the center)
  // with a free slot, or a rural tile touching the core (it becomes urban;
  // its improvement goes). Harbor buildings stand on water, all others on land.
  buildingSpots(city: City, k: BuildingKey): number[] {
    if (CITY_BUILDINGS[k].role === 'walls') return [];
    const out: number[] = [];
    for (const t of this.tilesWithin(city.tile, 3)) {
      if (this.tileCity[t] !== city.id || this.blockedFor(city, t) || this.wonderAt[t] || t === city.wonderTile) continue;
      const u = this.use[t];
      if (!buildingFits(k, this.isWater(t), this.map.riverTile[t] === 1)) continue;
      if (u === USE.urban || u === USE.center) {
        if (this.slotKeys(t).includes(null)) out.push(t);
      } else if (u === USE.rural && urbanAllowed(this.terrainAt(t)) && this.touchesCore(city, t)) {
        out.push(t);
      }
    }
    return out;
  }

  // What placing building k on tile t would change in the city's output
  // (including its neighbors' adjacency, and a rural tile turning urban).
  buildingGain(city: City, k: BuildingKey, t: number): Output {
    const before = this.cityYields(city);
    const undo = this.putBuilding(t, k);
    const after = this.cityYields(city);
    undo();
    return addOut(after, scaleOut(before, -1));
  }

  // Puts k in t's first free slot (turning a rural tile urban); returns an undo.
  private putBuilding(t: number, k: BuildingKey): () => void {
    const slot = this.slotKeys(t).indexOf(null);
    const prevUse = this.use[t]!, prevSpec = this.specialists[t]!;
    if (prevUse === USE.rural) { this.use[t] = USE.urban; this.specialists[t] = 0; }
    this.slots[t * SLOTS + slot] = slotCode(k);
    return () => { this.slots[t * SLOTS + slot] = 0; this.use[t] = prevUse; this.specialists[t] = prevSpec; };
  }

  // The governor's tile for building k: the most valuable for the city's focus.
  governorBuildingSpot(city: City, k: BuildingKey): number | null {
    let best: number | null = null, bestS = -Infinity;
    for (const t of this.buildingSpots(city, k)) {
      const s = weigh(city.focus, this.buildingGain(city, k, t));
      if (s > bestS) { best = t; bestS = s; }
    }
    return best;
  }

  // Places a completed building on tile t. Returns false if not legal now.
  placeBuilding(city: City, k: BuildingKey, t: number): boolean {
    if (city.pendingBuilding !== k || !this.buildingSpots(city, k).includes(t)) return false;
    const wasRural = this.use[t] === USE.rural;
    this.putBuilding(t, k);
    if (wasRural) this.setUse(t, USE.urban);
    city.buildings.add(k);
    city.pendingBuilding = null;
    this.useVersion++;
    return true;
  }

  autoPlaceBuilding(city: City): void {
    const k = city.pendingBuilding;
    if (!k) return;
    const t = this.governorBuildingSpot(city, k);
    if (t === null || !this.placeBuilding(city, k, t)) city.pendingBuilding = null;
  }

  // A tile an enemy unit stands on yields nothing to its city.
  private blockedFor(city: City, t: number): boolean {
    return this.units.some((u) => u.tile === t && u.owner !== city.owner);
  }

  cityYields(city: City): CityYield {
    let sum: Output = ZERO;
    for (const t of this.tilesWithin(city.tile, 3)) {
      if (this.tileCity[t] !== city.id || this.use[t] === USE.wild) continue;
      if (t !== city.tile && this.blockedFor(city, t)) continue;
      sum = addOut(sum, this.tileOutput(t));
    }
    return { ...sum, surplus: sum.food - FOOD_PER_CITIZEN * city.pop };
  }

  // Where the city's next citizen may go: a wild tile it owns (rural, if the
  // terrain has an improvement; urban, if it touches the built-up core) or a
  // specialist in an urban tile with room.
  growthOptions(city: City): GrowthOption[] {
    const out: GrowthOption[] = [];
    for (const t of this.tilesWithin(city.tile, 3)) {
      if (this.tileCity[t] !== city.id || this.blockedFor(city, t)) continue;
      if (this.use[t] === USE.urban) {
        if (this.specialists[t] < MAX_SPECIALISTS) out.push({ kind: 'specialist', tile: t });
        continue;
      }
      const terrain = this.terrainAt(t);
      const improvement = improvementFor(terrain);
      const core = urbanAllowed(terrain) && this.touchesCore(city, t);
      if (this.use[t] === USE.rural && core) out.push({ kind: 'urban', tile: t, over: improvement });
      if (this.use[t] !== USE.wild) continue;
      if (improvement) out.push({ kind: 'rural', tile: t, improvement });
      if (core) out.push({ kind: 'urban', tile: t, over: null });
    }
    return out;
  }

  private touchesCore(city: City, t: number): boolean {
    return this.tiles[t].neighbors.some((n) => this.tileCity[n] === city.id && (this.use[n] === USE.urban || this.use[n] === USE.center));
  }

  // What an option adds to the city.
  optionYield(o: GrowthOption): Output {
    const terrain = this.terrainAt(o.tile), river = this.map.riverTile[o.tile] === 1;
    switch (o.kind) {
      case 'rural': return ruralYield(terrain, river, this.eraAt(o.tile));
      case 'urban': {
        const u = urbanYield(river);
        if (!o.over) return u;
        return addOut(addOut(u, specialistYield(null)), scaleOut(ruralYield(terrain, river, this.eraAt(o.tile)), -1));
      }
      case 'specialist': return specialistYield(quarterOf(this.slotKeys(o.tile)));
    }
  }

  // The governor's pick for the city's focus (ties go to the lower tile, so
  // it is deterministic), or null if the city has nowhere to grow.
  governorPick(city: City): GrowthOption | null {
    const surplus = this.cityYields(city).surplus - FOOD_PER_CITIZEN;
    const urban = this.cityTiles(city, USE.urban);
    const townsfolk = urban.length + urban.reduce((n, t) => n + this.specialists[t], 0);
    const short = townsfolk < townsfolkWanted(city.pop + 1);
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
    const legal = this.growthOptions(city).some((x) => x.kind === o.kind && x.tile === o.tile);
    // (an urban option's `over` is re-read from the tile, not trusted)
    if (!legal) return false;
    if (o.kind === 'specialist') this.specialists[o.tile]++;
    else if (o.kind === 'rural') this.setUse(o.tile, USE.rural);
    else {
      const over = this.use[o.tile] === USE.rural;
      this.setUse(o.tile, USE.urban);
      if (over) this.specialists[o.tile] = 1;
    }
    city.growth--;
    city.pop++;
    this.claimTerritory(city);
    return true;
  }

  // Lets the governor place every pending citizen of the city.
  autoPlace(city: City): void {
    while (city.growth > 0) {
      const o = this.governorPick(city);
      if (!o || !this.placeGrowth(city, o)) { city.growth = 0; break; }
    }
  }

  // The city loses a citizen (starvation, a settler, capture): a specialist
  // first, then its least valuable rural tile, then an urban tile whose loss
  // keeps the core in one piece. The center always stays.
  removeCitizen(city: City): void {
    if (city.pop <= 1) return;
    const value = (t: number) => weigh('balanced', this.tileOutput(t));
    const cheapest = (ts: number[]) => ts.reduce((a, b) => (value(b) < value(a) ? b : a));
    const urban = this.cityTiles(city, USE.urban);
    const withSpec = urban.filter((t) => this.specialists[t] > 0);
    const rural = this.cityTiles(city, USE.rural);
    if (withSpec.length) this.specialists[withSpec[0]]--;
    else if (rural.length) this.setUse(cheapest(rural), USE.wild);
    else {
      // An urban tile whose loss keeps the core whole; empty ones first (a
      // tile that goes wild loses its buildings).
      const leaves = urban.filter((t) => !this.wonderAt[t] && this.coreConnectedWithout(city, t));
      if (!leaves.length) return; // only wonders left to lose: the city keeps them
      const empty = leaves.filter((t) => this.slotKeys(t).every((k) => k === null));
      const t = cheapest(empty.length ? empty : leaves);
      for (const k of this.slotKeys(t)) if (k) city.buildings.delete(k);
      this.slots.fill(0, t * SLOTS, t * SLOTS + SLOTS);
      this.setUse(t, USE.wild);
    }
    city.pop--;
  }

  // Whether every urban tile still joins the center if `drop` is removed.
  private coreConnectedWithout(city: City, drop: number): boolean {
    const urban = this.cityTiles(city, USE.urban).filter((t) => t !== drop);
    const seen = new Set([city.tile]);
    const stack = [city.tile];
    while (stack.length) {
      const t = stack.pop()!;
      for (const n of this.tiles[t].neighbors) {
        if (n !== drop && !seen.has(n) && this.tileCity[n] === city.id && this.use[n] === USE.urban) { seen.add(n); stack.push(n); }
      }
    }
    return urban.every((t) => seen.has(t));
  }

  private setUse(t: number, u: TileUse): void {
    this.use[t] = u;
    if (u !== USE.urban) this.specialists[t] = 0;
    this.useVersion++;
  }

  // A building can be queued once per city, and only while it has a place to go.
  canBuild(city: City, key: BuildKey): boolean {
    if (isUnitKey(key)) return true;
    if (isWonder(key)) return !this.wondersBuilt.has(key) && (this.wonderSpots(city, key).length > 0 || city.wonderTile !== null && city.building === key);
    if (city.buildings.has(key) || city.pendingBuilding === key) return false;
    return CITY_BUILDINGS[key].role === 'walls' || this.buildingSpots(city, key).length > 0;
  }

  // A finished building waiting for a slot (a tile lost since it was queued).
  waitingForSlot(city: City): boolean {
    const k = city.building;
    if (k === null || isUnitKey(k) || isWonder(k)) return false;
    return city.prod >= buildDef(k).cost && CITY_BUILDINGS[k].role !== 'walls' && this.buildingSpots(city, k).length === 0;
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
        city.food = city.buildings.has('granary') ? Math.floor(cost / 2) : 0;
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
            // On its tile, or another if that one was lost; else it waits.
            const spots = this.wonderSpots(city, key);
            const t = city.wonderTile !== null && spots.includes(city.wonderTile) ? city.wonderTile : this.governorWonderSpot(city, key);
            if (t === null || this.wondersBuilt.has(key)) city.prod += item.cost;
            else this.completeWonder(city, key, t);
          } else if (CITY_BUILDINGS[key].role === 'walls') {
            city.buildings.add(key);
            city.building = null;
            if (p.isHuman) this.log(`${city.name} completed ${item.name}.`);
          } else if (!this.buildingSpots(city, key).length) {
            city.prod += item.cost; // nowhere to put it: it waits, production kept
          } else {
            city.building = null;
            city.pendingBuilding = key;
            if (p.isHuman) this.log(`${city.name} completed ${item.name}: place it.`);
            else this.autoPlaceBuilding(city);
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
    // Citizens and buildings the human left unplaced: the governor places them.
    for (const c of this.cities) {
      if (c.growth > 0) this.autoPlace(c);
      if (c.pendingBuilding) this.autoPlaceBuilding(c);
    }
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
      this.createUnit('settler', p.id, s);
      const nb = this.tiles[s].neighbors.find((x) => !this.isWater(x)) ?? s;
      this.createUnit('warrior', p.id, nb);
      if (p.isHuman) this.createUnit('scout', p.id, nb);
    });
  }

}

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
