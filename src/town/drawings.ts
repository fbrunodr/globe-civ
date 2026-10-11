// Hand-drawn town tiles. A built-up tile is stamped with a middle (one of
// a few drawings per density and role), turned so its border types sit
// well against its neighbors; each edge gets the hand-drawn strip for the
// pair of border types meeting there (or the outskirts toward open land,
// or the waterfront toward water). See borders.ts.
//
// Streets, squares and spots are drawn by hand in middles.ts and strips.ts
// (with the pens below). Every lot (house, row, tower, garden tree, shed)
// is stored in lots.json: drafted once by scripts/draftTowns.ts, then kept
// and corrected by hand. Nothing here is generated at runtime.

import LOTS from './lots.json';
import {
  HALF_WIDTH, LOT_KINDS, curve, len, nearestOn, sub, arc,
  type Density, type Lot, type LotKind, type Pt, type Sides, type Spot, type Square, type Street2, type StreetClass,
} from './geometry.ts';
import { DEG } from './geometry.ts';
import {
  STUB_CLASS, middleStubs, stripStubs, typeIndex, stripKey, densityOfType, shapeOfType,
  type BorderType, type Far, type Shape,
} from './borders.ts';

export type Role = 'block' | 'center' | 'wonder';

export interface Drawing {
  readonly id: string;
  readonly streets: readonly Street2[];
  readonly squares: readonly Square[];
  readonly lots: readonly Lot[];  // decor drawn in the sketch, then lots.json
}
export interface Middle extends Drawing {
  readonly name: string;
  readonly sides: Sides;
  readonly density: Density;
  readonly role: Role;
  readonly borders: readonly Shape[]; // per side, in the drawing's own order
  readonly spots: readonly Spot[];    // building slots, in order
  readonly hall: Spot | null;
  readonly wonder: Spot | null;
}
export interface Strip extends Drawing {
  readonly a: BorderType;
  readonly b: Far;
}

// ---------- pens ----------

interface Sketch {
  streets: Street2[];
  squares: Square[];
  decor: Lot[];
}
abstract class Pen {
  readonly s: Sketch = { streets: [], squares: [], decor: [] };
  street(cls: StreetClass, pts: readonly Pt[], smooth = true): number {
    this.s.streets.push({ cls, pts: smooth ? curve(pts) : [...pts] });
    return this.s.streets.length - 1;
  }
  // The point of street i nearest to p: end a street there for a junction.
  on(i: number, p: Pt): Pt { return nearestOn(this.s.streets[i]!.pts, p); }
  square(pts: readonly Pt[], paved = true): void { this.s.squares.push({ pts, paved }); }
  round(c: Pt, r: number, paved = true): void { this.square(arc(c, r, 0, 360, 15).slice(0, -1), paved); }
  // A street ring around a round square.
  ring(c: Pt, r: number, cls: StreetClass): number { return this.street(cls, arc(c, r, 0, 360, 10), false); }
  decor(kind: LotKind, x: number, y: number, yawDeg = 0): void { this.s.decor.push({ x, y, yaw: yawDeg * DEG, kind }); }
}

export class MiddlePen extends Pen {
  spots: Spot[] = [];
  hall: Spot | null = null;
  wonder: Spot | null = null;
  constructor(readonly k: Sides, readonly d: Density, readonly borders: readonly Shape[]) { super(); }
  // Stub n of side j (along the side from corner j).
  stub(j: number, n = 0): Pt {
    const s = this.borders[j]!;
    const p = middleStubs(this.k, j, s)[n];
    if (!p) throw new Error(`side ${j} is ${s}: no stub ${n}`);
    return p;
  }
  // A street out from stub (j, n) through the given points (its width is the border's).
  out(j: number, n: number, ...via: Pt[]): number {
    const s = this.borders[j]! as Exclude<Shape, 'closed'>;
    return this.street(STUB_CLASS[this.d][s], [this.stub(j, n), ...via]);
  }
  spot(x: number, y: number, r = this.k === 6 ? 0.064 : 0.05): void { this.spots.push({ x, y, r, yaw: this.face(x, y) }); }
  hallAt(x: number, y: number, r = this.k === 6 ? 0.05 : 0.04): void { this.hall = { x, y, r, yaw: this.face(x, y) }; }
  wonderAt(x: number, y: number, r: number): void { this.wonder = { x, y, r, yaw: 0 }; }
  // Which way a spot faces: toward its nearest street.
  private face(x: number, y: number): number {
    let best: Pt = { x: x + 1, y }, bd = Infinity;
    for (const st of this.s.streets) {
      const q = nearestOn(st.pts, { x, y }), d = len(sub(q, { x, y })) - HALF_WIDTH[st.cls];
      if (d < bd) { bd = d; best = q; }
    }
    return Math.atan2(best.y - y, best.x - x);
  }
}

export class StripPen extends Pen {
  constructor(readonly a: BorderType, readonly b: Far) { super(); }
  stubA(n = 0): Pt { const p = stripStubs(shapeOfType(this.a), -1)[n]; if (!p) throw new Error(`${this.a}: no stub ${n}`); return p; }
  stubB(n = 0): Pt {
    if (this.b === 'land' || this.b === 'water') throw new Error('no far side');
    const p = stripStubs(shapeOfType(this.b), 1)[n];
    if (!p) throw new Error(`${this.b}: no stub ${n}`);
    return p;
  }
  get clsA(): StreetClass { return classOf(this.a); }
  get clsB(): StreetClass { return this.b === 'land' || this.b === 'water' ? 'lane' : classOf(this.b); }
}
const classOf = (t: BorderType): StreetClass => {
  const s = shapeOfType(t);
  return s === 'closed' ? 'lane' : STUB_CLASS[densityOfType(t)][s];
};

// ---------- the registry ----------

type LotRow = [LotKind, number, number, number] | [LotKind, number, number, number, number];
const LOT_TABLE = LOTS as unknown as Record<string, LotRow[]>;
// Lots of a drawing as stored (lots.json).
export function storedLots(id: string): Lot[] | null {
  const rows = LOT_TABLE[id];
  if (!rows) return null;
  return rows.map(([kind, x, y, yaw, spot]) => (spot === undefined ? { kind, x, y, yaw: yaw * DEG } : { kind, x, y, yaw: yaw * DEG, spot }));
}
export const isLotKind = (k: string): k is LotKind => (LOT_KINDS as readonly string[]).includes(k);

export interface MiddleSketch { id: string; name: string; sides: Sides; density: Density; role: Role; pen: MiddlePen }
export interface StripSketch { id: string; a: BorderType; b: Far; pen: StripPen }

export function sketchMiddle(id: string, name: string, sides: Sides, density: Density, role: Role, borders: readonly Shape[], draw: (m: MiddlePen) => void): MiddleSketch {
  if (borders.length !== sides) throw new Error(`${id}: ${borders.length} borders for ${sides} sides`);
  const pen = new MiddlePen(sides, density, borders);
  draw(pen);
  return { id, name, sides, density, role, pen };
}
export function sketchStrip(a: BorderType, b: Far, draw: (s: StripPen) => void): StripSketch {
  const pen = new StripPen(a, b);
  draw(pen);
  return { id: `strip:${stripKey(a, b)}`, a, b, pen };
}

export const finishMiddle = (m: MiddleSketch): Middle => ({
  id: m.id, name: m.name, sides: m.sides, density: m.density, role: m.role, borders: m.pen.borders,
  streets: m.pen.s.streets, squares: m.pen.s.squares, spots: m.pen.spots, hall: m.pen.hall, wonder: m.pen.wonder,
  lots: [...m.pen.s.decor, ...(storedLots(m.id) ?? [])],
});
export const finishStrip = (s: StripSketch): Strip => ({
  id: s.id, a: s.a, b: s.b, streets: s.pen.s.streets, squares: s.pen.s.squares,
  lots: [...s.pen.s.decor, ...(storedLots(s.id) ?? [])],
});

// A strip used the other way round: mirrored across the edge (y -> -y).
export function mirrored(s: Strip): Strip {
  const m = (p: Pt): Pt => ({ x: p.x, y: -p.y });
  return {
    ...s,
    streets: s.streets.map((st) => ({ cls: st.cls, pts: st.pts.map(m) })),
    squares: s.squares.map((q) => ({ paved: q.paved, pts: q.pts.map(m) })),
    lots: s.lots.map((l) => ({ ...l, y: -l.y, yaw: -l.yaw })),
  };
}

export { typeIndex };
