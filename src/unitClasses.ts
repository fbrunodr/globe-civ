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
// the water can't attack, and only fighters can reach aircraft.

export type UnitClass =
  | 'civilian' | 'recon' | 'leader'         // never attack
  | 'melee' | 'antiCav' | 'gunline'         // foot that closes in: blades, spears and pikes, muskets and rifles
  | 'archer' | 'mountedArcher' | 'gun'      // shooters: bows, chariot archers, Gatling and machine guns
  | 'engine' | 'artillery'                  // siege: catapult and trebuchet; cannon and artillery
  | 'cavalry' | 'antiTank' | 'armor'
  | 'warship' | 'steamship' | 'gunship'     // at sea: rams and boards; steam and steel; bombards
  | 'fighter' | 'bomber';

export const UNIT_CLASS: Record<UnitKey, UnitClass> = {
  settler: 'civilian', scout: 'recon', commander: 'leader',
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
  fighter: 'fighter', bomber: 'bomber',
};

// How an attack plays out:
//   melee       walk in and strike
//   charge      gallop in and strike
//   volley      arrows, high and arcing
//   lob         stones from an engine, slow and high
//   shell       cannon shells, low and fast
//   fire        gunfire, flat bursts
//   fireCharge  a volley of gunfire, then in with the bayonet
//   roll        armour (or a steamship) advancing, its gun firing
//   sortie      aircraft flying out to strike and back
export type AttackStyle = 'melee' | 'charge' | 'volley' | 'lob' | 'shell' | 'fire' | 'fireCharge' | 'roll' | 'sortie';
// What flies (Volleys, unitView.ts).
export type Projectile = 'arrow' | 'stone' | 'shell' | 'bullet';

const NEVER: ReadonlySet<UnitClass> = new Set(['civilian', 'recon', 'leader']);
// What closes in to fight (the rest shoot, or fly).
const CLOSES: ReadonlySet<UnitClass> = new Set(['melee', 'antiCav', 'gunline', 'cavalry', 'armor', 'warship', 'steamship']);

// Where a fight would be: the defender at sea (a ship, or a unit embarked
// on the water), on a city's tile, the attacker embarked.
export interface Where { readonly atSea?: boolean; readonly city?: boolean; readonly embarked?: boolean }
export const isAir = (k: UnitKey): boolean => domainOf(unitDef(k)) === 'air';
export const isSea = (k: UnitKey): boolean => domainOf(unitDef(k)) === 'sea';

// Why `a` can't attack `d` (the unit that would defend), or null if it can.
// (Without `where`: as the units' own domains say, the defender on its own
// element.)
export function attackBlock(a: UnitKey, d: UnitKey, where: Where = { atSea: isSea(d) }): string | null {
  const A = UNIT_CLASS[a];
  if (NEVER.has(A)) return 'cannot attack';
  if (where.embarked) return 'cannot attack while embarked';
  if (isAir(d) && A !== 'fighter') return 'cannot reach aircraft';
  if (!isSea(a) && !isAir(a) && where.atSea && CLOSES.has(A)) return 'cannot reach ships at sea';
  if (isSea(a) && !where.atSea && !where.city && CLOSES.has(A)) return 'cannot fight on land';
  return null;
}

// How `a` attacks (as its class does), or null if it never attacks.
export function attackStyle(a: UnitKey, d: UnitKey): AttackStyle | null {
  switch (UNIT_CLASS[a]) {
    case 'melee': case 'antiCav': case 'warship': return 'melee';
    case 'cavalry': return 'charge';
    case 'archer': case 'mountedArcher': return 'volley';
    case 'engine': return 'lob';
    case 'artillery': case 'antiTank': case 'gunship': return 'shell';
    case 'gun': return 'fire';
    case 'gunline': return UNIT_CLASS[d] === 'armor' ? 'fire' : 'fireCharge';
    case 'armor': case 'steamship': return 'roll';
    case 'fighter': case 'bomber': return 'sortie';
    case 'civilian': case 'recon': case 'leader': return null;
  }
}
// How a unit attacks a city with no defender left (its walls).
export function siegeStyle(a: UnitKey): AttackStyle | null {
  return attackStyle(a, 'warrior');
}

// What a defender shoots back, or null (it strikes where it stands).
export function returnFire(d: UnitKey): Projectile | null {
  switch (UNIT_CLASS[d]) {
    case 'archer': case 'mountedArcher': return 'arrow';
    case 'gun': case 'gunline': return 'bullet';
    case 'artillery': case 'antiTank': case 'armor': case 'gunship': case 'steamship': return 'shell';
    default: return null;
  }
}
