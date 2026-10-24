// What makes a drawing sound (the tests and the town editor ask the same):
// every stub has one street ending at it; the streets form one network;
// streets keep off the tile's rim but at their stubs; the site and the
// building spots (as many as the density has, each with its house) stand
// inside the safe zone, clear of the streets and of each other; lots stay
// in the tile's lot area, clear of streets, squares, spots and each other
// (houses may stand on the site: they give way to the hall or a wonder).

import {
  DENSITY_TALLEST, SAFE_RHO, SPOTS, SPOT_HOUSE, FLOOR_NAME, HALF_WIDTH, densityAllows, distToLine, inSpot, isBuilding, layoutProblems, len, lotSamples, rhoOf, spotOutline, spotsOverlap, sub, pointInPoly,
  type Pt, type Spot,
} from './geometry.ts';
import { components, WIDEST_CLASS } from './skeleton.ts';
import { crossings, gateWall, GATE_HALF, TOWER_R, WALL_CLEAR, WALL_HALF } from './walls.ts';
import { clearance, LOT_INNER, type Drawing } from './index.ts';

export interface Problem { readonly text: string; readonly at?: Pt }

// A spot (round, or a square) touching a street of half width hw.
export function spotOnStreet(sp: Spot, street: readonly Pt[], hw: number): boolean {
  if (sp.hw === undefined) return distToLine(sp, street) < sp.r + hw - 1e-9;
  return spotOutline(sp).some((p) => distToLine(p, street) < hw - 1e-9) || street.some((p) => inSpot(p, sp));
}
// A spot (a building spot, the site: what a player builds) reaching past
// the safe zone, where a river may come in.
export function spotPastRim(sp: Spot): boolean {
  if (sp.hw === undefined) return rhoOf(6, sp) + sp.r / 0.5 > SAFE_RHO + 1e-9;
  return spotOutline(sp).some((p) => rhoOf(6, p) > SAFE_RHO + 1e-9);
}

export function drawingProblems(d: Drawing): Problem[] {
  const out: Problem[] = [];
  d.stubs.forEach((s, i) => {
    const n = d.streets.filter((st) => st.ends.includes(i)).length;
    if (n !== 1) out.push({ text: n === 0 ? `stub ${i + 1} (side ${s.side}) has no street` : `stub ${i + 1} has ${n} streets`, at: s.p });
  });
  if (d.streets.length === 0) out.push({ text: 'no street at all' });
  const parts = components(d.streets);
  if (parts.length > 1) out.push({ text: `the streets are ${parts.length} separate networks (they must all meet)` });
  for (const st of d.streets) {
    for (const p of st.pts) {
      if (rhoOf(6, p) > 1 + 1e-9) { out.push({ text: 'a street leaves the tile', at: p }); break; }
      const nearOwn = st.ends.some((e) => e !== null && len(sub(p, d.stubs[e]!.p)) < 0.09);
      if (!nearOwn && rhoOf(6, p) > 0.9) { out.push({ text: 'a street runs along the rim (only stubs may reach it)', at: p }); break; }
    }
  }
  const want = SPOTS[d.density];
  if (d.spots.length !== want) out.push({ text: `${d.spots.length} building spots (a ${d.density} tile has ${want})` });
  const placed: { sp: Spot; what: string }[] = [{ sp: d.site, what: 'the site' }, ...d.spots.map((sp, k) => ({ sp, what: `spot ${k + 1}` }))];
  placed.forEach(({ sp, what }, i) => {
    if (d.streets.some((st) => spotOnStreet(sp, st.pts, HALF_WIDTH[WIDEST_CLASS[st.rank]]))) out.push({ text: `${what} touches a street (at its widest)`, at: sp });
    if (spotPastRim(sp)) out.push({ text: `${what} reaches past the safe zone (a river may come in there)`, at: sp });
    if (d.squares.some((q) => q.paved && (pointInPoly(sp, q.pts) || q.pts.some((p) => inSpot(p, sp))))) out.push({ text: `${what} is on a square`, at: sp });
    for (const o of placed.slice(i + 1)) if (spotsOverlap(sp, o.sp)) out.push({ text: `${what} and ${o.what} overlap`, at: sp });
  });
  // Each spot's house: one, as large as the spot, at its middle.
  d.spots.forEach((sp, k) => {
    const own = d.lots.filter((l) => l.spot === k);
    if (own.length !== 1 || own[0]!.kind !== SPOT_HOUSE || len(sub(own[0]!, sp)) > 1e-3) out.push({ text: `spot ${k + 1} needs its one ${SPOT_HOUSE} house, at its middle`, at: sp });
  });
  d.lots.forEach((l, i) => { if (l.spot !== undefined && l.spot >= d.spots.length) out.push({ text: `lot ${i} belongs to a spot the tile does not have`, at: l }); });
  const lp = layoutProblems((p) => rhoOf(6, p) <= LOT_INNER + 1e-9, clearance(d.streets, d.stubs), d.lots, d.spots, d.squares);
  for (const t of lp) {
    const m = /lots? (\d+)/.exec(t);
    const l = m ? d.lots[Number(m[1])] : undefined;
    out.push(l ? { text: t, at: l } : { text: t });
  }
  // A density holds buildings up to a height.
  d.lots.forEach((l, i) => {
    if (isBuilding(l.kind) && !densityAllows(d.density, l.floors ?? 1)) out.push({ text: `lot ${i}: a ${FLOOR_NAME[l.floors ?? 1]} needs a denser tile (${d.density} holds up to ${FLOOR_NAME[DENSITY_TALLEST[d.density]]}s)`, at: l });
  });
  out.push(...wallProblems(d));
  return out;
}

// The walled center's walls: inside the tile, gates on them, every street
// through a gate (wide enough for it beside the gate's towers), and lots,
// spots and the site clear of them. Other tiles have none.
function wallProblems(d: Drawing): Problem[] {
  const out: Problem[] = [];
  if (d.role !== 'walled') {
    if (d.walls.length || d.gates.length) out.push({ text: 'only the walled center has walls' });
    return out;
  }
  if (!d.walls.some((w) => w.length >= 2)) out.push({ text: 'the walled center needs its walls' });
  for (const w of d.walls) {
    const p = w.find((q) => rhoOf(6, q) > 1 + 1e-9);
    if (p) out.push({ text: 'a wall leaves the tile', at: p });
  }
  for (const g of d.gates) if (gateWall(d.walls, g) < 0) out.push({ text: 'a gate is not on a wall', at: g });
  for (const st of d.streets) {
    // (At its widest: near a stub it takes its edge's width.)
    const hw = HALF_WIDTH[WIDEST_CLASS[st.rank]];
    for (const w of d.walls) {
      for (const x of crossings(st.pts, w)) {
        if (!d.gates.some((g) => len(sub(x, g)) + hw <= GATE_HALF - 0.85 * TOWER_R + 1e-9)) out.push({ text: 'a street crosses a wall with no gate (or too narrow a gate for it)', at: x });
      }
    }
  }
  const nearWall = (p: Pt, clear: number) => d.walls.some((w) => w.length >= 2 && distToLine(p, w) < clear);
  d.lots.forEach((l, i) => {
    if (lotSamples(l).some((p) => nearWall(p, WALL_CLEAR))) out.push({ text: `lot ${i} (${l.kind}) on a wall`, at: l });
  });
  for (const sp of [d.site, ...d.spots]) {
    if (spotOutline(sp).some((p) => nearWall(p, WALL_HALF + 0.004))) out.push({ text: 'a spot or the site on a wall', at: sp });
  }
  return out;
}
