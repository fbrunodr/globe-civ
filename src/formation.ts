import { UNIT_LOOK, colsOf, isMachine, rides } from './unitModels.ts';
import { unitDef, domainOf, type UnitKey } from './rules.ts';

// How a unit's figures stand, by what it is doing (as Civ V shows them):
// at rest, in its ranks (a block); on the move, a column, two or three
// abreast (a machine in single file), long in the way it goes; shooting, a
// firing line, wide and two deep, the rear rank in the gaps of the front
// one. Each figure keeps its own place in every order: figures that stand
// to the left in the block stand to the left in the line and march in the
// left-hand file, so that reforming, they walk the shortest way, without
// crossing each other's path.
export type Order = 'block' | 'column' | 'line';

// Whether a unit changes order at all (soldiers, horsemen and guns on
// land; a party of civilians, ships and aircraft keep theirs).
export const reforms = (type: UnitKey): boolean => UNIT_LOOK[type].party === 'formation' && domainOf(unitDef(type)) === 'land';

// The block of `n` figures (as unitModels.ts formationSlots stands them, unjittered).
function blockSlots(type: UnitKey, n: number): [number, number][] {
  const look = UNIT_LOOK[type], cols = colsOf(type, look.count), rows = Math.ceil(look.count / cols);
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols), c = i % cols, inRow = r === Math.floor((n - 1) / cols) ? n - r * cols : cols;
    return [(c - (inRow - 1) / 2) * look.spacing[0], ((rows - 1) / 2 - r) * look.spacing[1]];
  });
}

const cache = new Map<string, readonly (readonly [number, number])[]>();
// The places (model units: x across, z forward) of the first `n` of a
// unit's figures in an order, in the order of their places in the block.
export function orderSlots(type: UnitKey, n: number, order: Order): readonly (readonly [number, number])[] {
  const key = `${type}|${n}|${order}`;
  let got = cache.get(key);
  if (got) return got;
  const block = blockSlots(type, n);
  if (order === 'block' || !reforms(type) || n < 2) got = block;
  else {
    const [sx, sz] = UNIT_LOOK[type].spacing, horse = rides(type, 0), machine = isMachine(type);
    const shape: [number, number][] = [];
    if (order === 'column') {
      // (Three files of men, two of horses, one of guns or engines; closer than in the block.)
      const files = Math.min(n, machine ? 1 : horse ? 2 : 3), deep = Math.ceil(n / files);
      for (let i = 0; i < n; i++) {
        const f = i % files, r = Math.floor(i / files), inRow = r === deep - 1 ? n - r * files : files;
        shape.push([(f - (inRow - 1) / 2) * sx * 0.85, ((deep - 1) / 2 - r) * sz * 0.85]);
      }
    } else {
      // (Two deep (horses and machines one), the second rank in the gaps of the first.)
      const ranks = horse || machine || n < 4 ? 1 : 2, wide = Math.ceil(n / ranks);
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / wide), c = i % wide, inRow = r === ranks - 1 ? n - r * wide : wide;
        shape.push([(c - (inRow - 1) / 2 + (r % 2 ? 0.5 : 0)) * sx * 1.05, ((ranks - 1) / 2 - r) * sz * 0.8]);
      }
    }
    // (Each figure to the place nearest its own in the block: both taken left to right, then front to back.)
    const byPlace = (ps: readonly (readonly [number, number])[]) => ps.map((_, i) => i).sort((i, j) => ps[i]![0] - ps[j]![0] || ps[j]![1] - ps[i]![1]);
    const from = byPlace(block), to = byPlace(shape), out: [number, number][] = new Array(n);
    // (The column: files taken left to right, each front to back, and the block's figures likewise.)
    if (order === 'column') {
      const files = Math.min(n, machine ? 1 : horse ? 2 : 3);
      const strips = (ps: readonly (readonly [number, number])[], cut: (i: number) => number) => ps.map((_, i) => i).sort((i, j) => cut(i) - cut(j) || ps[j]![1] - ps[i]![1]);
      const fileOf = (i: number) => {
        const rank = from.indexOf(i);
        return Math.floor((rank * files) / n);
      };
      const blockOrder = strips(block, fileOf);
      const shapeOrder = strips(shape, (i) => i % files);
      blockOrder.forEach((b, k) => { out[b] = shape[shapeOrder[k]!]!; });
    } else from.forEach((b, k) => { out[b] = shape[to[k]!]!; });
    got = out;
  }
  cache.set(key, got);
  return got;
}
