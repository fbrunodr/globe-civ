// The game's pictograms: one set for the interface (inline SVG) and the map
// (drawn on the billboards' canvases, mapIcons.ts), so a sword is the same
// sword in a unit's panel and on its flag.
//
// An icon is a few layers on a 24 × 24 grid, each a path filled with the
// even-odd rule: shapes in one layer never overlap (a shape inside another
// cuts a hole in it); shapes that overlap go in layers of their own, drawn
// one over the other. One colour each (the text's, or what the caller
// sets), bold enough to read at 14 pixels.

import type { UnitKey } from './rules.ts';
import { UNIT_CLASS, type UnitClass } from './unitClasses.ts';
import type { ResourceKey } from './resources.ts';
import type { Output } from './cities.ts';

export type Icon = readonly string[];

const n = (x: number) => +x.toFixed(2);
// A circle, a polygon (x, y, x, y, ...), a rectangle (rounded by r).
const C = (x: number, y: number, r: number) => `M${n(x - r)} ${n(y)}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0Z`;
const P = (...p: number[]) => `M${p.map(n).reduce<string[]>((a, v, i) => (i % 2 ? [...a.slice(0, -1), `${a[a.length - 1]} ${v}`] : [...a, `${v}`]), []).join('L')}Z`;
const R = (x: number, y: number, w: number, h: number, r = 0) => (r <= 0
  ? `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`
  : `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${n(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}Z`);
// A polygon mirrored left to right (about x = 12).
const M = (...p: number[]) => P(...p.map((v, i) => (i % 2 ? v : 24 - v)));
// A star of k points.
const star = (x: number, y: number, R1: number, R2: number, k: number, turn = -Math.PI / 2) =>
  P(...Array.from({ length: 2 * k }, (_, i) => { const a = turn + (i * Math.PI) / k, r = i % 2 ? R2 : R1; return [x + r * Math.cos(a), y + r * Math.sin(a)]; }).flat());
// A drop, its point up.
const drop = (x: number, y: number, r: number): string[] => [C(x, y, r), P(x, y - 2.3 * r, x + 0.87 * r, y - 0.5 * r, x - 0.87 * r, y - 0.5 * r)];
const gear = (): Icon => {
  const teeth: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    const at = (r: number, w: number): [number, number] => [12 + r * c - w * s, 12 + r * s + w * c];
    teeth.push(P(...at(6, -1.7), ...at(10, -1.3), ...at(10, 1.3), ...at(6, 1.7)));
  }
  return [C(12, 12, 7) + C(12, 12, 3), ...teeth];
};

const sword: Icon = [P(12, 1.5, 14.2, 5, 14.2, 15, 9.8, 15, 9.8, 5), R(6.5, 15, 11, 2.4, 1), R(10.8, 17.4, 2.4, 3.6), C(12, 22, 1.6)];
const shield: Icon = [P(4, 3.5, 20, 3.5, 20, 12, 12, 21.5, 4, 12)];
const arrow: Icon = [P(3.5, 19.2, 4.8, 20.5, 16.6, 8.7, 15.3, 7.4), P(20.5, 3.5, 19.6, 10.4, 13.6, 4.4), P(3, 17, 7, 21, 3, 21)];
const hammer: Icon = [R(4.5, 3.5, 15, 6.5, 1.5), R(10.5, 10, 3, 11.5, 1)];
const flask: Icon = [P(9.5, 2.5, 14.5, 2.5, 14.5, 9, 20, 19.5, 18.5, 21.5, 5.5, 21.5, 4, 19.5, 9.5, 9) + C(10.5, 16.5, 1.3) + C(14, 18.5, 1)];
const sparkle: Icon = [P(12, 2, 14, 10, 22, 12, 14, 14, 12, 22, 10, 14, 2, 12, 10, 10)];
const coin: Icon = [C(12, 12, 9) + C(12, 12, 7), C(12, 12, 4.6)];
const person: Icon = [C(12, 7.5, 4.3), P(4, 21.5, 5, 16, 8.5, 13.3, 15.5, 13.3, 19, 16, 20, 21.5)];
const flag: Icon = [R(5, 3, 2, 18.5), P(7, 4, 19.5, 7.6, 7, 11.4)];
const eye: Icon = ['M1.5 12Q12 1.5 22.5 12Q12 22.5 1.5 12Z' + C(12, 12, 4.4), C(12, 12, 2.2)];
const horse: Icon = [P(7, 21.5, 17.5, 21.5, 17.5, 15, 14.5, 10.5, 18.5, 9.4, 19, 6.4, 14.5, 3.4, 12.6, 1.5, 11.8, 4, 8, 6, 5, 11, 6.6, 13.2, 9.6, 11.6, 10.2, 14, 7, 17.6)];
const cannon: Icon = [P(4, 9, 20, 5.6, 20.8, 9.6, 5, 13.4), C(10, 16, 5) + C(10, 16, 2.4)];
const ship: Icon = [P(2, 14.5, 22, 14.5, 19, 20.5, 5, 20.5), R(11.2, 2.5, 1.6, 12), P(13.6, 3.5, 19.5, 12.5, 13.6, 12.5), P(10.4, 6, 10.4, 12.5, 5, 12.5)];
const plane: Icon = [P(12, 2, 13.5, 8, 22, 13, 22, 15, 13.5, 13, 13, 18.5, 16, 21, 16, 22, 12, 21, 8, 22, 8, 21, 11, 18.5, 10.5, 13, 2, 15, 2, 13, 10.5, 8)];
const fish: Icon = [P(2.5, 12, 8, 7, 15, 7.5, 18.4, 12, 15, 16.5, 8, 17) + C(7.4, 11, 1.1), P(17, 12, 22, 7, 22, 17)];
const gem: Icon = [P(7, 4, 17, 4, 21, 9.5, 12, 21, 3, 9.5)];
const building: Icon = [R(3.5, 10, 7, 11.5) + R(5.4, 12.4, 3.2, 2.2) + R(5.4, 16.6, 3.2, 2.2), R(12, 3.5, 8.5, 18) + R(14, 6, 1.8, 2.4) + R(16.8, 6, 1.8, 2.4) + R(14, 10.5, 1.8, 2.4) + R(16.8, 10.5, 1.8, 2.4) + R(14, 15, 1.8, 2.4) + R(16.8, 15, 1.8, 2.4)];

export const ICONS = {
  // ---- yields ----
  food: [C(8.8, 14.5, 5.6), C(15.2, 14.5, 5.6), P(12.4, 9, 13.6, 4.6, 17.8, 3.4, 16.4, 7.6)],
  prod: hammer,
  gold: coin,
  science: flask,
  culture: [R(4.5, 3, 15, 3.4, 0.8), R(7, 7.6, 2.6, 10), R(10.7, 7.6, 2.6, 10), R(14.4, 7.6, 2.6, 10), R(4.5, 18.8, 15, 3, 0.8)],
  faith: sparkle,
  cohesion: [C(9, 12, 6.2) + C(9, 12, 3.8), C(15, 12, 6.2) + C(15, 12, 3.8)],
  // ---- the interface ----
  politics: [R(5.5, 2.5, 13, 19, 2) + R(8.2, 6.5, 7.6, 1.7) + R(8.2, 10.6, 7.6, 1.7) + R(8.2, 14.7, 4.6, 1.7)],
  identity: person,
  government: [P(3, 8, 7.5, 13, 12, 5, 16.5, 13, 21, 8, 19, 19.5, 5, 19.5)],
  religion: [P(12, 2.5, 21, 9, 3, 9), R(5.5, 10.4, 2.6, 8), R(10.7, 10.4, 2.6, 8), R(15.9, 10.4, 2.6, 8), R(3.5, 19.4, 17, 2.4)],
  diplomacy: [R(3, 4, 12, 9, 2), P(6, 12.5, 6, 17, 10.5, 12.5), R(10, 10, 11, 8, 2), P(18, 17.5, 18, 21.5, 14, 17.5)],
  log: [C(5, 6, 1.7) + R(9, 4.8, 11.5, 2.4, 1) + C(5, 12, 1.7) + R(9, 10.8, 11.5, 2.4, 1) + C(5, 18, 1.7) + R(9, 16.8, 11.5, 2.4, 1)],
  menu: [R(4, 5, 16, 2.6, 1.3) + R(4, 10.7, 16, 2.6, 1.3) + R(4, 16.4, 16, 2.6, 1.3)],
  close: [P(5.2, 3.8, 12, 10.6, 18.8, 3.8, 20.2, 5.2, 13.4, 12, 20.2, 18.8, 18.8, 20.2, 12, 13.4, 5.2, 20.2, 3.8, 18.8, 10.6, 12, 3.8, 5.2)],
  grid: [P(12, 2.5, 20.2, 7.2, 20.2, 16.8, 12, 21.5, 3.8, 16.8, 3.8, 7.2) + P(12, 5.5, 17.6, 8.7, 17.6, 15.3, 12, 18.5, 6.4, 15.3, 6.4, 8.7)],
  gem,
  map: [P(3, 6, 9, 4, 15, 6, 21, 4, 21, 18, 15, 20, 9, 18, 3, 20) + R(8.55, 5.6, 0.9, 12.4) + R(14.55, 7.2, 0.9, 12.4)],
  next: [P(8, 4, 17, 12, 8, 20, 6, 18, 12.4, 12, 6, 6)],
  skip: [P(4, 5, 11.5, 12, 4, 19, 2.2, 17.2, 7.6, 12, 2.2, 6.8), P(12.5, 5, 20, 12, 12.5, 19, 10.7, 17.2, 16.1, 12, 10.7, 6.8)],
  up: [P(12, 3, 20, 12, 15, 12, 15, 21, 9, 21, 9, 12, 4, 12)],
  check: [P(4, 12.5, 6.2, 10.3, 10, 14.1, 17.8, 6.3, 20, 8.5, 10, 18.5)],
  lock: [R(5, 10.5, 14, 10.5, 2), C(12, 9.5, 5) + C(12, 9.5, 3)],
  hourglass: [P(6, 3, 18, 3, 18, 5, 13.5, 12, 18, 19, 18, 21, 6, 21, 6, 19, 10.5, 12, 6, 5)],
  heart: [C(8.3, 9, 4.6), C(15.7, 9, 4.6), P(4.3, 11.2, 19.7, 11.2, 12, 20.5)],
  gear: gear(),
  star: [star(12, 12.6, 10, 4.2, 5)],
  fire: [P(12, 2, 16, 8, 15, 10.5, 18, 9, 19.2, 14, 16.5, 20, 12, 22, 7.5, 20, 4.8, 14, 8, 7, 10, 10.4)],
  moves: [P(3, 19, 8, 19, 13, 12, 8, 5, 3, 5, 8, 12), P(11, 19, 16, 19, 21, 12, 16, 5, 11, 5, 16, 12)],
  out: [P(12, 2, 16, 6.5, 13.2, 6.5, 13.2, 10.8, 17.5, 10.8, 17.5, 8, 22, 12, 17.5, 16, 17.5, 13.2, 13.2, 13.2, 13.2, 17.5, 16, 17.5, 12, 22, 8, 17.5, 10.8, 17.5, 10.8, 13.2, 6.5, 13.2, 6.5, 16, 2, 12, 6.5, 8, 6.5, 10.8, 10.8, 10.8, 10.8, 6.5, 8, 6.5)],
  road: [P(8, 3, 10.4, 3, 6.4, 21, 3, 21), M(8, 3, 10.4, 3, 6.4, 21, 3, 21), R(11.2, 3.6, 1.6, 3.6) + R(11.2, 10, 1.6, 3.8) + R(11.2, 16.6, 1.6, 4.4)],
  fort: [P(3, 21, 3, 8, 6, 8, 6, 11, 9, 11, 9, 8, 15, 8, 15, 11, 18, 11, 18, 8, 21, 8, 21, 21, 14.5, 21, 14.5, 16, 9.5, 16, 9.5, 21), P(4.5, 6.5, 4.5, 3, 7.5, 3, 7.5, 6.5), M(4.5, 6.5, 4.5, 3, 7.5, 3, 7.5, 6.5), R(10.5, 3, 3, 3.5)],
  bell: [P(12, 2.5, 14, 4, 17.5, 7.5, 18, 15, 20.5, 18.5, 3.5, 18.5, 6, 15, 6.5, 7.5, 10, 4), C(12, 20.6, 1.9)],
  sword, shield, arrow, hammer, flag, eye, person, building, coin,
  // ---- units ----
  spear: [P(11.1, 22, 11.1, 9, 12.9, 9, 12.9, 22), P(12, 1.5, 15.2, 9.6, 8.8, 9.6)],
  rifle: [P(3.2, 19.2, 4.8, 20.8, 21, 6, 19.4, 4.4), P(2.5, 18.5, 7.6, 21.8, 9.4, 17.6, 6.2, 15.2)],
  bow: ['M6.5 2.5A11.5 11.5 0 0 1 6.5 21.5L8.4 21.5A10 10 0 0 0 8.4 2.5Z', R(5.6, 2.5, 1, 19), P(2.5, 11.2, 16.5, 11.2, 16.5, 8.6, 22, 12, 16.5, 15.4, 16.5, 12.8, 2.5, 12.8)],
  horse, cannon, ship, plane,
  catapult: [P(4, 20.5, 12, 8.5, 20, 20.5, 17.4, 20.5, 12, 12.4, 6.6, 20.5), P(3.4, 6.6, 4.6, 5, 19.4, 13.4, 18.4, 15), C(4, 5, 2.4)],
  tank: [R(2.5, 12.5, 19, 6.5, 3.2), R(7.5, 7.2, 8, 5.3, 1.5), R(15.5, 8.8, 7, 1.8)],
  submarine: [P(2.5, 14, 6, 10.8, 18, 10.8, 21.5, 14, 18, 17.2, 6, 17.2), R(10, 6.6, 4, 4.2), R(11.5, 3.5, 1, 3.1)],
  carrier: [P(1.5, 12.5, 22.5, 12.5, 20, 17.8, 4, 17.8), R(13.5, 7, 4, 5.5)],
  helicopter: [R(2.5, 4, 19, 1.6), R(11.2, 5.6, 1.4, 3), P(4, 13, 6.5, 9.4, 13.5, 9.4, 16, 12, 22, 12, 22, 13.8, 16, 14.4, 13.5, 17, 6.5, 17), R(5.5, 19.4, 10.5, 1.4)],
  bomb: [C(12, 14, 7.2), R(10.9, 3, 2.2, 4.5), P(13.1, 3, 17, 1.5, 17.6, 3, 13.6, 4.6)],
  // ---- resources ----
  wheat: [R(11.3, 8, 1.4, 14.5), C(8.6, 6.2, 2.1) + C(15.4, 6.2, 2.1) + C(8.6, 11, 2.1) + C(15.4, 11, 2.1) + C(12, 3.4, 2.1)],
  rice: [P(3, 11.6, 21, 11.6, 17.5, 20, 6.5, 20), 'M5 10.6A7 5.4 0 0 1 19 10.6Z'],
  maize: [R(9, 2.5, 6, 15.5, 3), P(9, 13, 3.6, 8.5, 5.8, 18, 9.6, 20.5, 12, 18), M(9, 13, 3.6, 8.5, 5.8, 18, 9.6, 20.5, 12, 18)],
  bananas: ['M3.5 6A13 13 0 0 0 20 19L21.5 15.5A10 10 0 0 1 7 4.2Z', 'M9.5 3.6A12 12 0 0 0 21.5 13L22 9.4A9 9 0 0 1 12.6 2.5Z'],
  cattle: [C(12, 13.5, 6.2), P(6.4, 9.6, 2.4, 4.2, 5, 3.4, 9, 7.6), M(6.4, 9.6, 2.4, 4.2, 5, 3.4, 9, 7.6)],
  sheep: [C(9.4, 11, 4.2), C(14.4, 10, 4.4), C(12, 14.4, 4.4), C(16.6, 14, 3.6), C(5, 13.4, 2.7), R(9.4, 17, 1.7, 4.2), R(14, 17, 1.7, 4.2)],
  deer: [P(9.4, 12.6, 14.6, 12.6, 13.6, 21.5, 10.4, 21.5), P(10.2, 13, 8.6, 13.4, 4.6, 5, 6.3, 4.3, 7.5, 7, 9.2, 3, 10.8, 3.6, 9, 8.6), M(10.2, 13, 8.6, 13.4, 4.6, 5, 6.3, 4.3, 7.5, 7, 9.2, 3, 10.8, 3.6, 9, 8.6)],
  stone: [P(2.5, 20, 6, 10.5, 12, 8.5, 15, 20), P(13.2, 20, 15.4, 12.4, 19.2, 11.2, 21.6, 20)],
  salmon: fish,
  tuna: [...fish, P(9.6, 7.6, 13, 3.2, 15, 7.8)],
  trout: [P(2.5, 12, 8, 7, 15, 7.5, 18.4, 12, 15, 16.5, 8, 17) + C(7.4, 11, 1.1) + C(11, 10, 0.9) + C(13.6, 12.6, 0.9) + C(10.6, 14, 0.9), P(17, 12, 22, 7, 22, 17)],
  crabs: [C(12, 14, 5.2), C(4.8, 8, 2.8), C(19.2, 8, 2.8), P(7.6, 12, 5, 10.2, 6.2, 9, 9.2, 10.6), M(7.6, 12, 5, 10.2, 6.2, 9, 9.2, 10.6), P(7.6, 16.4, 3.4, 19, 4.2, 20.4, 8.6, 18), M(7.6, 16.4, 3.4, 19, 4.2, 20.4, 8.6, 18)],
  whales: [P(2.5, 13, 5.6, 8.6, 12.6, 8, 17.6, 11, 19.6, 7.6, 22, 5.6, 22, 11.4, 19.4, 14.4, 15, 18.4, 7, 18.4) + C(6.6, 12.4, 1)],
  copper: [P(6.4, 8.5, 17.6, 8.5, 21, 17.5, 3, 17.5) + P(8.4, 11, 15.6, 11, 16.6, 13.6, 7.4, 13.6)],
  wine: [P(6, 2.5, 18, 2.5, 17, 9, 13, 12.6, 13, 18.2, 17, 20, 17, 21.6, 7, 21.6, 7, 20, 11, 18.2, 11, 12.6, 7, 9)],
  incense: [P(4.6, 14, 19.4, 14, 16.2, 20.5, 7.8, 20.5), P(11, 12.4, 9.4, 8.6, 12, 6, 10.4, 2.5, 12.3, 2.5, 13.9, 6.2, 11.5, 8.8, 13.1, 12.4)],
  silk: [R(3.5, 7, 17, 10.5, 5.2) + R(7.6, 7, 1.2, 10.5) + R(11.4, 7, 1.2, 10.5) + R(15.2, 7, 1.2, 10.5)],
  spices: [P(4, 11.4, 20, 11.4, 17, 20.5, 7, 20.5), P(12.6, 10.2, 18.6, 2.6, 20.6, 4.2, 15, 11)],
  furs: [P(12, 3, 15, 5, 20, 4, 18, 9, 21, 13, 17, 14, 18, 20, 14, 18, 12, 21, 10, 18, 6, 20, 7, 14, 3, 13, 6, 9, 4, 4, 9, 5)],
  ivory: ['M5.5 21.5A17 17 0 0 0 18.6 2.5L20.6 4A13.5 13.5 0 0 1 10.4 21.5Z'],
  dyes: [...drop(7.6, 10.4, 3.3), ...drop(16.4, 10.4, 3.3), ...drop(12, 18, 3.3)],
  goldOre: [P(4, 17, 6.6, 10.6, 12.4, 8.6, 18.6, 11, 20.6, 16.6, 16, 20.6, 7.6, 20.4), star(17.6, 5.6, 3.6, 1.2, 4)],
  gems: [P(7, 4, 17, 4, 21, 9.5, 12, 21, 3, 9.5) + P(8.6, 7, 15.4, 7, 17.2, 9.6, 12, 16.4, 6.8, 9.6)],
  pearls: ['M2.5 13.6A9.5 9.5 0 0 1 21.5 13.6L18.8 13.6A6.8 6.8 0 0 0 5.2 13.6Z', C(12, 15.4, 3.4)],
  coral: [R(10.9, 11, 2.2, 10.5, 1), P(11.2, 13.6, 5.4, 9.4, 5.4, 4.4, 7.4, 4.4, 7.4, 8.4, 12.4, 11.8), M(11.2, 15.4, 5.6, 12, 5.6, 7.4, 7.6, 7.4, 7.6, 11, 12.4, 13.6), R(11, 3, 2, 9, 1)],
  salt: [P(2.5, 20.5, 12, 6.5, 21.5, 20.5), R(16.4, 3.4, 4, 4), R(4, 5.6, 3.2, 3.2)],
  cotton: [C(8.6, 8.6, 4.2), C(15.4, 8.6, 4.2), C(12, 13.2, 4.4), P(11.1, 17, 12.9, 17, 12.9, 22, 11.1, 22), P(12, 17.2, 7, 21.4, 6, 19.8, 11, 16.4), M(12, 17.2, 7, 21.4, 6, 19.8, 11, 16.4)],
  tea: [P(4, 20, 5, 11, 11, 5, 20, 4, 19, 13, 13, 19) + P(6.6, 18.3, 16.9, 6.1, 17.9, 7, 7.5, 19.2)],
  amber: drop(12, 15, 6.2),
  iron: [P(2.5, 7, 21, 7, 21, 10, 16, 11.6, 15, 15, 18, 18, 18, 20.5, 6, 20.5, 6, 18, 9, 15, 8, 11.6, 2.5, 10)],
  niter: [P(4.6, 20.5, 6.8, 8, 9.4, 4.6, 12, 8, 12, 20.5), P(12.8, 20.5, 13.8, 11.4, 16.2, 8.6, 18.6, 11.4, 19.6, 20.5)],
  coal: [P(3, 19.5, 5, 13, 10, 11.6, 13, 15, 12, 19.5), P(11, 12, 13, 6, 18.4, 5, 20.6, 9.6, 17.6, 13.6, 13.6, 13.6), P(14, 20, 15, 15, 19.6, 14.6, 21.4, 18, 19.6, 20.4)],
  oil: [R(6, 3.5, 12, 17, 2) + R(6, 8.2, 12, 1.4) + R(6, 14.4, 12, 1.4)],
} satisfies Record<string, Icon>;
export type IconKey = keyof typeof ICONS;

// An icon inline, in the text's colour (`cls`: more classes, e.g. a yield's).
export const icon = (k: IconKey, cls = ''): string =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k].map((d) => `<path fill-rule="evenodd" d="${d}"/>`).join('')}</svg>`;

// An icon on a canvas: its 24 × 24 grid drawn `size` wide, centred on (x, y), in `color`.
const paths = new Map<string, Path2D>();
export function drawIcon(ctx: CanvasRenderingContext2D, k: IconKey, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  for (const d of ICONS[k]) {
    let p = paths.get(d);
    if (!p) { p = new Path2D(d); paths.set(d, p); }
    ctx.fill(p, 'evenodd');
  }
  ctx.restore();
}

// ---- what stands for what ----

export const YIELD_ICON: Record<keyof Output, IconKey> = { food: 'food', prod: 'prod', gold: 'gold', science: 'science', culture: 'culture', faith: 'faith', cohesion: 'cohesion' };

const CLASS_ICON: Record<UnitClass, IconKey> = {
  civilian: 'flag', recon: 'eye', leader: 'star',
  melee: 'sword', antiCav: 'spear', gunline: 'rifle',
  archer: 'bow', mountedArcher: 'bow', gun: 'cannon',
  engine: 'catapult', artillery: 'cannon',
  cavalry: 'horse', antiTank: 'cannon', armor: 'tank',
  warship: 'ship', steamship: 'ship', gunship: 'ship',
  submarine: 'submarine', carrier: 'carrier',
  fighter: 'plane', bomber: 'plane', helicopter: 'helicopter', antiAir: 'cannon',
};
const UNIT_ICON: Partial<Record<UnitKey, IconKey>> = { worker: 'hammer', missionary: 'faith', atomicBomb: 'bomb', nuclearMissile: 'bomb', guidedMissile: 'bomb' };
export const unitIcon = (k: UnitKey): IconKey => UNIT_ICON[k] ?? CLASS_ICON[UNIT_CLASS[k]];

const RESOURCE_ICON: Partial<Record<ResourceKey, IconKey>> = { gold: 'goldOre', horses: 'horse' };
export const resourceIcon = (k: ResourceKey): IconKey => RESOURCE_ICON[k] ?? (k in ICONS ? (k as IconKey) : 'gem');
