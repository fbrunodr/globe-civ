import { unitDef, domainOf, type UnitKey } from './rules.ts';

// Each unit belongs to a class, and a pair of classes (the attacker's, the
// defender's) says whether the attack can be made at all, and how it plays
// out (its animation, unitView.ts): a sword fight, a cavalry charge, a
// volley of arrows, stones lobbed by an engine, cannon shells, gunfire, a
// tank rolling in, ships ramming, aircraft on a sortie. What can't be made
// is a matter of where the units are, not how strong (that is game.ts
// matchup: a spearman may attack a tank, and lose): a unit on land can't
// close with a ship at sea (only shoot at it), a ship can't fight on land
// (but may assault a city on the coast, or bombard), a unit embarked on
// the water can't attack, only fighters (and anti-aircraft fire) can reach
// aircraft, and a submarine attacks only ships.

export type UnitClass =
  | 'civilian' | 'recon' | 'leader'         // never attack
  | 'melee' | 'antiCav' | 'gunline'         // foot that closes in: blades, spears and pikes, muskets and rifles
  | 'archer' | 'mountedArcher' | 'gun'      // shooters: bows, chariot archers, Gatling and machine guns
  | 'engine' | 'artillery'                  // siege: catapult and trebuchet; cannon and artillery
  | 'cavalry' | 'antiTank' | 'armor'
  | 'warship' | 'steamship' | 'gunship'     // at sea: rams and boards; steam and steel; bombards
  | 'submarine' | 'carrier'
  | 'fighter' | 'bomber' | 'helicopter' | 'antiAir';

export const UNIT_CLASS: Record<UnitKey, UnitClass> = {
  settler: 'civilian', worker: 'civilian', scout: 'recon', commander: 'leader',
  warrior: 'melee', swordsman: 'melee', longswordsman: 'melee',
  spearman: 'antiCav', pikeman: 'antiCav',
  musketman: 'gunline', rifleman: 'gunline', infantry: 'gunline',
  archer: 'archer', compositeBowman: 'archer', crossbowman: 'archer',
  chariotArcher: 'mountedArcher',
  gatlingGun: 'gun', machineGun: 'gun',
  catapult: 'engine', trebuchet: 'engine',
  cannon: 'artillery', artillery: 'artillery',
  horseman: 'cavalry', knight: 'cavalry', lancer: 'cavalry', cavalry: 'cavalry',
  antiTank: 'antiTank',
  landship: 'armor', tank: 'armor',
  galley: 'warship', trireme: 'warship', caravel: 'warship',
  ironclad: 'steamship', destroyer: 'steamship',
  galleass: 'gunship', frigate: 'gunship', battleship: 'gunship',
  cog: 'warship', cruiser: 'gunship', submarine: 'submarine', carrier: 'carrier',
  fighter: 'fighter', jetFighter: 'fighter', bomber: 'bomber', airship: 'bomber', heavyBomber: 'bomber', helicopter: 'helicopter',
  antiAircraft: 'antiAir',
  slinger: 'archer', horseArcher: 'mountedArcher', manAtArms: 'melee', explorer: 'recon', fieldCannon: 'gun', privateer: 'warship', shipOfTheLine: 'gunship',
  greatWarInfantry: 'gunline', marine: 'gunline', mechanizedInfantry: 'gunline', specialForces: 'gunline', paratrooper: 'gunline',
  modernArmor: 'armor', rocketArtillery: 'artillery', mobileSAM: 'antiAir', missileCruiser: 'gunship', nuclearSubmarine: 'submarine',
  atomicBomb: 'bomber', nuclearMissile: 'bomber',
  stealthFighter: 'fighter', stealthBomber: 'bomber', attackHelicopter: 'helicopter', drone: 'bomber', guidedMissile: 'bomber',
};

// How an attack plays out:
//   melee       walk in and strike (bows with what they have)
//   advance     gunmen closing in by fire: a firing line walking forward, shooting as it goes
//   charge      gallop in and strike
//   volley      arrows, high and arcing
//   lob         stones from an engine, slow and high
//   shell       cannon shells, low and fast
//   fire        gunfire, flat bursts
//   roll        armour (or a steamship) advancing, its gun firing
//   sortie      aircraft flying out to strike and back
export type AttackStyle = 'melee' | 'charge' | 'advance' | 'volley' | 'lob' | 'shell' | 'fire' | 'roll' | 'sortie';
// What flies (Volleys, unitView.ts).
export type Projectile = 'arrow' | 'stone' | 'shell' | 'bullet';
// An attack is made at close quarters (an assault: the attacker closes in,
// both sides fight, and if the defender falls it moves in), or by fire
// (from the next tile: the target doesn't fire back).
export type AttackMode = 'melee' | 'ranged';

const NEVER: ReadonlySet<UnitClass> = new Set(['civilian', 'recon', 'leader', 'carrier']);
// Who may close in to fight (engines, crewed guns, bombarding ships and
// aircraft only ever shoot).
const ASSAULTS: ReadonlySet<UnitClass> = new Set(['melee', 'antiCav', 'gunline', 'archer', 'mountedArcher', 'cavalry', 'armor', 'warship', 'steamship', 'submarine']);
export const canAssault = (k: UnitKey): boolean => ASSAULTS.has(UNIT_CLASS[k]) && unitDef(k).melee > 0;
export const canShoot = (k: UnitKey): boolean => !NEVER.has(UNIT_CLASS[k]) && (unitDef(k).rangedAtk ?? 0) > 0;
export const canAttackType = (k: UnitKey): boolean => canAssault(k) || canShoot(k);
// A unit's attack unless told otherwise: by fire if it can shoot.
export const defaultMode = (k: UnitKey): AttackMode => (canShoot(k) ? 'ranged' : 'melee');
// A dedicated shooter (bows, guns, engines): better at range than at close quarters.
export const isShooter = (k: UnitKey): boolean => (unitDef(k).rangedAtk ?? 0) > unitDef(k).melee;

// Where a fight would be: the defender at sea (a ship, or a unit embarked
// on the water), on a city's tile, the attacker embarked.
export interface Where { readonly atSea?: boolean; readonly city?: boolean; readonly embarked?: boolean }
export const isAir = (k: UnitKey): boolean => domainOf(unitDef(k)) === 'air';
export const isSea = (k: UnitKey): boolean => domainOf(unitDef(k)) === 'sea';

// Why `a` can't attack `d` (the unit that would defend) so (`mode`), or
// null if it can. (Without `where`: as the units' own domains say, the
// defender on its own element.)
export function attackBlock(a: UnitKey, d: UnitKey, where: Where = { atSea: isSea(d) }, mode: AttackMode = defaultMode(a)): string | null {
  const A = UNIT_CLASS[a];
  if (NEVER.has(A)) return 'cannot attack';
  if (mode === 'melee' && !canAssault(a)) return 'cannot close in';
  if (mode === 'ranged' && !canShoot(a)) return 'cannot shoot';
  if (where.embarked && !unitDef(a).amphibious) return 'cannot attack while embarked';
  if (isAir(d) && (mode === 'melee' || (A !== 'fighter' && A !== 'antiAir'))) return 'cannot reach aircraft';
  if (A === 'submarine' && !where.atSea) return 'attacks only ships';
  if (mode === 'melee' && !isSea(a) && !isAir(a) && where.atSea) return 'cannot reach ships at sea';
  if (mode === 'melee' && isSea(a) && !where.atSea && !where.city) return 'cannot fight on land';
  return null;
}

// How `a` attacks so (`mode`), as its class does (`d`: the defender, if any).
export function attackStyle(a: UnitKey, _d: UnitKey | null, mode: AttackMode = defaultMode(a)): AttackStyle | null {
  const C = UNIT_CLASS[a];
  if (NEVER.has(C)) return null;
  if (C === 'fighter' || C === 'bomber' || C === 'helicopter') return 'sortie';
  if (mode === 'ranged') {
    switch (C) {
      case 'archer': case 'mountedArcher': return 'volley';
      case 'engine': return 'lob';
      case 'artillery': case 'antiTank': case 'gunship': return 'shell';
      default: return 'fire';
    }
  }
  switch (C) {
    case 'cavalry': case 'mountedArcher': return 'charge';
    case 'gunline': return 'advance';
    case 'armor': case 'steamship': return 'roll';
    default: return 'melee';
  }
}
// How a unit attacks a city with no defender left (its walls).
export function siegeStyle(a: UnitKey, mode: AttackMode = defaultMode(a)): AttackStyle | null {
  return attackStyle(a, null, mode);
}

// Whether a unit fights at close quarters with its guns, never as with a
// blade: it fires point-blank at whoever comes at it (gunmen, crewed guns).
export const firesAtClose = (k: UnitKey): boolean => { const C = UNIT_CLASS[k]; return C === 'gunline' || C === 'gun' || C === 'antiTank' || C === 'antiAir'; };
// What a defender fires at attackers closing in on it, or null (it strikes where it stands).
export function returnFire(d: UnitKey): Projectile | null {
  switch (UNIT_CLASS[d]) {
    case 'archer': case 'mountedArcher': return 'arrow';
    case 'gun': case 'gunline': case 'antiAir': return 'bullet';
    case 'artillery': case 'antiTank': case 'armor': case 'gunship': case 'steamship': return 'shell';
    default: return null;
  }
}
