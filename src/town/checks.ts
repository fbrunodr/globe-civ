// What makes a drawing sound (the tests and the town editor ask the same):
// every stub has one street ending at it; the streets form one network;
// streets keep off the tile's rim but at their stubs; the spots a role
// needs are there and clear of the streets; lots stay in the tile's lot
// area, clear of streets, squares, spots and each other.

import { DENSITY_TALLEST, SAFE_RHO, FLOOR_NAME, HALF_WIDTH, densityAllows, distToLine, inSpot, isBuilding, layoutProblems, len, lotSamples, rhoOf, spotOutline, sub, pointInPoly, type Pt, type Spot } from './geometry.ts';
import { isWonderRole } from './wonders.ts';
import { components, hasHall, RANK_CLASS } from './skeleton.ts';
import { crossings, gateWall, GATE_HALF, TOWER_R, WALL_CLEAR, WALL_HALF } from './walls.ts';
import { clearance, LOT_INNER, type Drawing } from './index.ts';

export interface Problem { readonly text: string; readonly at?: Pt }

// A spot (round, or a wonder's rectangle) touching a street of half width hw.
export function spotOnStreet(sp: Spot, street: readonly Pt[], hw: number): boolean {
  if (sp.hw === undefined) return distToLine(sp, street) < sp.r + hw - 1e-9;
  return spotOutline(sp).some((p) => distToLine(p, street) < hw - 1e-9) || street.some((p) => inSpot(p, sp));
}
// A spot (a building spot, the hall, a wonder: what a player builds)
// reaching past the safe zone, where a river may come in.
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
  const want = isWonderRole(d.role) ? 0 : 2;
  if (d.spots.length !== want) out.push({ text: `${d.spots.length} building spots (a ${d.role} tile needs ${want})` });
  if ((d.hall !== null) !== hasHall(d.role)) out.push({ text: hasHall(d.role) ? 'the center needs its hall' : 'only the center has a hall' });
  if ((d.wonder !== null) !== isWonderRole(d.role)) out.push({ text: isWonderRole(d.role) ? 'the wonder tile needs its wonder' : 'only a wonder tile has a wonder' });
  for (const sp of [...d.spots, ...(d.hall ? [d.hall] : []), ...(d.wonder ? [d.wonder] : [])]) {
    if (d.streets.some((st) => spotOnStreet(sp, st.pts, HALF_WIDTH[RANK_CLASS.high[st.rank]]))) out.push({ text: 'a spot touches a street (at its widest)', at: sp });
    if (spotPastRim(sp)) out.push({ text: 'a spot reaches past the safe zone (a river may come in there)', at: sp });
  }
  for (const sp of d.spots) if (d.squares.some((q) => q.paved && pointInPoly(sp, q.pts))) out.push({ text: 'a building spot is on a square', at: sp });
  const spots = [...d.spots, ...(d.hall ? [d.hall] : []), ...(d.wonder ? [d.wonder] : [])];
  const lp = layoutProblems((p) => rhoOf(6, p) <= LOT_INNER + 1e-9, clearance(d.streets, d.stubs), d.lots, spots, d.squares);
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
// spots and the hall clear of them. Other tiles have none.
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
    const hw = HALF_WIDTH[RANK_CLASS.high[st.rank]];
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
  for (const sp of [...d.spots, ...(d.hall ? [d.hall] : [])]) if (nearWall(sp, sp.r + WALL_HALF + 0.004)) out.push({ text: 'a spot or the hall on a wall', at: sp });
  return out;
}
