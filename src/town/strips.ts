// The strips, drawn by hand: one per pair of border types (borders.ts),
// plus each type's outskirts toward open land and its waterfront. Drawn in
// the strip frame (geometry.ts): side A below (y < 0), side B above; the
// middles' stubs sit at y = ∓0.18 (single at x = 0, double at x = ±0.081).
// Where the two sides' streets differ in width, a street changes width at
// the edge. Houses are in lots.json.

import { P, curve, type Pt, type StreetClass } from './geometry.ts';
import { sketchStrip, type StripPen, type StripSketch } from './drawings.ts';
import type { BorderType, Far } from './borders.ts';

// A street from `from` (class ca) to `to` (class cb) through `via`, its
// width changing where it crosses the edge (y = 0).
function link(s: StripPen, from: Pt, ca: StreetClass, via: readonly Pt[], to: Pt, cb: StreetClass): void {
  const pts = curve([from, ...via, to]);
  if (ca === cb) { s.street(ca, pts, false); return; }
  let i = pts.findIndex((p) => Math.sign(p.y) !== Math.sign(from.y) && p.y !== 0);
  if (i <= 0) i = Math.floor(pts.length / 2);
  // Cut at the crossing itself.
  const a = pts[i - 1]!, b = pts[i]!, t = a.y / (a.y - b.y), c = P(a.x + (b.x - a.x) * t, 0);
  s.street(ca, [...pts.slice(0, i), c], false);
  s.street(cb, [c, ...pts.slice(i)], false);
}

interface Opts {
  jog?: number;          // sideways bend of a crossing street
  laneA?: number;        // a lane along the edge in A's half: its y (negative), both ways
  laneB?: number;        // ... in B's half (positive)
  laneSide?: -1 | 1;     // only one way (toward -x or +x)
  square?: 'A' | 'B' | 'edge'; // a small paved square beside the street
  fork?: number;         // where a single street forks into a double (y)
}

// A lane along the edge at height y, from the street at x0 out to the strip's sides.
// It starts on the nearest street already drawn.
function edgeLane(s: StripPen, y: number, x0: number, side?: -1 | 1): void {
  const reach = 0.2887 * (1 - Math.abs(y) / 0.5) - 0.035;
  let from = P(x0, y), bd = Infinity;
  s.s.streets.forEach((_, i) => { const q = s.on(i, P(x0, y)); const d = Math.hypot(q.x - x0, q.y - y); if (d < bd) { bd = d; from = q; } });
  for (const dir of side ? [side] : [-1, 1] as const) s.street('lane', [from, P(from.x + dir * reach * 0.55, y + 0.006 * dir), P(dir * reach, y - 0.004)], true);
}

const SS = (a: BorderType, b: BorderType, o: Opts = {}) => sketchStrip(a, b, (s) => {
  const j = o.jog ?? 0.015;
  link(s, s.stubA(), s.clsA, [P(j, -0.07), P(-j, 0.07)], s.stubB(), s.clsB);
  if (o.laneA !== undefined) edgeLane(s, o.laneA, j * 0.9, o.laneSide);
  if (o.laneB !== undefined) edgeLane(s, o.laneB, -j * 0.9, o.laneSide);
  if (o.square === 'edge') s.square([P(0.03, -0.04), P(0.1, -0.04), P(0.1, 0.04), P(0.03, 0.04)]);
});

const SD = (a: BorderType, b: BorderType, o: Opts = {}) => sketchStrip(a, b, (s) => {
  const f = o.fork ?? -0.03, F = P(0, f);
  s.street(s.clsA, [s.stubA(), P(o.jog ?? 0.01, (f - 0.18) / 2), F]);
  s.street(s.clsB, [F, P(0.045, f + 0.09), s.stubB(0)]);
  s.street(s.clsB, [F, P(-0.045, f + 0.09), s.stubB(1)]);
  if (o.laneA !== undefined) edgeLane(s, o.laneA, 0, o.laneSide);
});

// Double on A, single on B: fork on B's side.
const DS = (a: BorderType, b: BorderType, o: Opts = {}) => sketchStrip(a, b, (s) => {
  const f = o.fork ?? 0.03, F = P(0, f);
  s.street(s.clsA, [s.stubA(0), P(-0.045, f - 0.09), F]);
  s.street(s.clsA, [s.stubA(1), P(0.045, f - 0.09), F]);
  s.street(s.clsB, [F, P(o.jog ?? -0.01, (f + 0.18) / 2), s.stubB()]);
  if (o.laneB !== undefined) edgeLane(s, o.laneB, 0, o.laneSide);
});

const DD = (a: BorderType, b: BorderType, o: Opts = {}) => sketchStrip(a, b, (s) => {
  const j = o.jog ?? 0.01;
  // A's stub at -x meets B's stub at -x (B counts along the edge the other way).
  link(s, s.stubA(0), s.clsA, [P(-0.081 - j, -0.05), P(-0.081 + j, 0.05)], s.stubB(1), s.clsB);
  link(s, s.stubA(1), s.clsA, [P(0.081 + j, -0.05), P(0.081 - j, 0.05)], s.stubB(0), s.clsB);
  // A cross lane between them, at the edge.
  s.street('lane', [P(-0.081, o.laneA ?? 0), P(0.081, o.laneA ?? 0)], false);
});

// A street (single) or a pair (double) from A ends in a lane along the edge;
// B's side is gardens.
const SC = (a: BorderType, b: Far, o: Opts = {}) => sketchStrip(a, b, (s) => {
  const y = o.laneA ?? -0.05, j = o.jog ?? 0.012;
  s.street(s.clsA, [s.stubA(), P(j, (y - 0.18) / 2), P(0, y)]);
  edgeLane(s, y, 0, o.laneSide);
});
const DC = (a: BorderType, b: Far, o: Opts = {}) => sketchStrip(a, b, (s) => {
  const y = o.laneA ?? -0.04;
  s.street(s.clsA, [s.stubA(0), P(-0.07, (y - 0.18) / 2 + 0.02), P(0, y), P(0.07, (y - 0.18) / 2 + 0.02), s.stubA(1)]);
  if (o.laneSide) edgeLane(s, y - 0.01, o.laneSide * 0.06, o.laneSide);
});
// Closed on A, open on B: the mirror of the above, drawn from B.
const CS = (a: BorderType, b: BorderType, o: Opts = {}) => sketchStrip(a, b, (s) => {
  const y = o.laneB ?? 0.05, j = o.jog ?? -0.012;
  s.street(s.clsB, [s.stubB(), P(j, (y + 0.18) / 2), P(0, y)]);
  edgeLane(s, y, 0, o.laneSide);
});
const CD = (a: BorderType, b: BorderType, o: Opts = {}) => sketchStrip(a, b, (s) => {
  const y = o.laneB ?? 0.04;
  s.street(s.clsB, [s.stubB(1), P(-0.07, (y + 0.18) / 2 - 0.02), P(0, y), P(0.07, (y + 0.18) / 2 - 0.02), s.stubB(0)]);
  if (o.laneSide) edgeLane(s, y + 0.01, o.laneSide * 0.06, o.laneSide);
});
// Two garden backs: no street.
const CC = (a: BorderType, b: BorderType) => sketchStrip(a, b, (s) => {
  s.decor('shed', -0.12, 0.03, 90); s.decor('shed', 0.15, -0.04, -90);
});

// Outskirts: the street runs on into the country.
const landS = (a: BorderType, jog: number) => sketchStrip(a, 'land', (s) => {
  s.street(s.clsA, [s.stubA(), P(jog, -0.09), P(jog * 0.4, -0.03), P(0, 0)]);
});
const landD = (a: BorderType, jog: number) => sketchStrip(a, 'land', (s) => {
  const M = P(jog, -0.045);
  s.street(s.clsA, [s.stubA(0), P(-0.06, -0.11), M]);
  s.street(s.clsA, [s.stubA(1), P(0.06, -0.11), M]);
  s.street('lane', [M, P(jog * 0.5, -0.02), P(0, 0)]);
});
const landC = (a: BorderType) => sketchStrip(a, 'land', (s) => { s.decor('shed', 0.1, -0.06, 180); });
// Waterfront: streets stop short of the water at a small quay or promenade.
const waterS = (a: BorderType) => sketchStrip(a, 'water', (s) => {
  s.street(s.clsA, [s.stubA(), P(0.01, -0.1), P(0, -0.075)]);
  s.square([P(-0.05, -0.068), P(0.05, -0.068), P(0.05, -0.035), P(-0.05, -0.035)]);
});
const waterD = (a: BorderType) => sketchStrip(a, 'water', (s) => {
  s.street(s.clsA, [s.stubA(0), P(-0.075, -0.1), P(0, -0.07), P(0.075, -0.1), s.stubA(1)]);
});
const waterC = (a: BorderType) => sketchStrip(a, 'water', (s) => { s.decor('shed', -0.08, -0.08, 0); });

export const STRIP_SKETCHES: readonly StripSketch[] = [
  // ----- low with low -----
  SS('low-single', 'low-single', { jog: 0.02 }),
  SD('low-single', 'low-double', { fork: -0.02, jog: 0.012 }),
  SC('low-single', 'low-closed', { laneA: -0.06, laneSide: 1 }),
  DD('low-double', 'low-double', { jog: 0.012 }),
  DC('low-double', 'low-closed', { laneA: -0.03 }),
  CC('low-closed', 'low-closed'),
  // ----- low with medium -----
  SS('low-single', 'medium-single', { jog: 0.012, laneB: 0.08 }),
  SD('low-single', 'medium-double', { fork: 0.0, jog: -0.01 }),
  SC('low-single', 'medium-closed', { laneA: -0.055 }),
  DS('low-double', 'medium-single', { fork: 0.04, laneB: 0.11 }),
  DD('low-double', 'medium-double', { jog: 0.008, laneA: 0.01 }),
  DC('low-double', 'medium-closed', { laneA: -0.035, laneSide: -1 }),
  CS('low-closed', 'medium-single', { laneB: 0.06 }),
  CD('low-closed', 'medium-double', { laneB: 0.04, laneSide: 1 }),
  CC('low-closed', 'medium-closed'),
  // ----- low with high -----
  SS('low-single', 'high-single', { jog: 0.01, laneB: 0.09 }),
  SD('low-single', 'high-double', { fork: 0.01 }),
  SC('low-single', 'high-closed', { laneA: -0.05, laneSide: -1 }),
  DS('low-double', 'high-single', { fork: 0.05, laneB: 0.12, laneSide: 1 }),
  DD('low-double', 'high-double', { jog: 0.006 }),
  DC('low-double', 'high-closed', { laneA: -0.04 }),
  CS('low-closed', 'high-single', { laneB: 0.07, laneSide: -1 }),
  CD('low-closed', 'high-double', { laneB: 0.05 }),
  CC('low-closed', 'high-closed'),
  // ----- medium with medium -----
  SS('medium-single', 'medium-single', { jog: 0.018, laneA: -0.09, laneB: 0.09, square: 'edge' }),
  SD('medium-single', 'medium-double', { fork: -0.04, laneA: -0.11 }),
  SC('medium-single', 'medium-closed', { laneA: -0.045 }),
  DD('medium-double', 'medium-double', { jog: 0.014 }),
  DC('medium-double', 'medium-closed', { laneA: -0.03, laneSide: 1 }),
  CC('medium-closed', 'medium-closed'),
  // ----- medium with high -----
  SS('medium-single', 'high-single', { jog: 0.012, laneA: -0.09, laneB: 0.1 }),
  SD('medium-single', 'high-double', { fork: -0.02, laneA: -0.1, laneSide: 1 }),
  SC('medium-single', 'high-closed', { laneA: -0.05, laneSide: 1 }),
  DS('medium-double', 'high-single', { fork: 0.03, laneB: 0.1 }),
  DD('medium-double', 'high-double', { jog: 0.01, laneA: -0.01 }),
  DC('medium-double', 'high-closed', { laneA: -0.035 }),
  CS('medium-closed', 'high-single', { laneB: 0.055 }),
  CD('medium-closed', 'high-double', { laneB: 0.045, laneSide: -1 }),
  CC('medium-closed', 'high-closed'),
  // ----- high with high -----
  SS('high-single', 'high-single', { jog: 0.008, laneA: -0.1, laneB: 0.1 }),
  SD('high-single', 'high-double', { fork: -0.03, laneA: -0.11, laneSide: -1 }),
  SC('high-single', 'high-closed', { laneA: -0.05 }),
  DD('high-double', 'high-double', { jog: 0.006, laneA: 0.005 }),
  DC('high-double', 'high-closed', { laneA: -0.03 }),
  CC('high-closed', 'high-closed'),
  // ----- outskirts (toward open land) -----
  landS('low-single', 0.02), landD('low-double', -0.015), landC('low-closed'),
  landS('medium-single', -0.015), landD('medium-double', 0.01), landC('medium-closed'),
  landS('high-single', 0.01), landD('high-double', -0.01), landC('high-closed'),
  // ----- waterfronts -----
  waterS('low-single'), waterD('low-double'), waterC('low-closed'),
  waterS('medium-single'), waterD('medium-double'), waterC('medium-closed'),
  waterS('high-single'), waterD('high-double'), waterC('high-closed'),
];
