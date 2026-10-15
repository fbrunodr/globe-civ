// What makes a drawing sound (the tests and the town editor ask the same):
// every stub has one street ending at it; the streets form one network;
// streets keep off the tile's rim but at their stubs; the spots a role
// needs are there and clear of the streets; lots stay in the tile's lot
// area, clear of streets, squares, spots and each other.

import { HALF_WIDTH, distToLine, layoutProblems, len, rhoOf, sub, pointInPoly, type Pt } from './geometry.ts';
import { components, RANK_CLASS } from './skeleton.ts';
import { clearance, LOT_INNER, type Drawing } from './index.ts';

export interface Problem { readonly text: string; readonly at?: Pt }

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
  const want = d.role === 'wonder' ? 0 : 2;
  if (d.spots.length !== want) out.push({ text: `${d.spots.length} building spots (a ${d.role} tile needs ${want})` });
  if ((d.hall !== null) !== (d.role === 'center')) out.push({ text: d.role === 'center' ? 'the center needs its hall' : 'only the center has a hall' });
  if ((d.wonder !== null) !== (d.role === 'wonder')) out.push({ text: d.role === 'wonder' ? 'the wonder tile needs its wonder' : 'only a wonder tile has a wonder' });
  for (const sp of [...d.spots, ...(d.hall ? [d.hall] : []), ...(d.wonder ? [d.wonder] : [])]) {
    if (d.streets.some((st) => distToLine(sp, st.pts) < sp.r + HALF_WIDTH[RANK_CLASS.high[st.rank]] - 1e-9)) out.push({ text: 'a spot touches a street (at its widest)', at: sp });
    if (rhoOf(6, sp) + sp.r / 0.5 > LOT_INNER + 1e-9) out.push({ text: 'a spot reaches the rim', at: sp });
  }
  for (const sp of d.spots) if (d.squares.some((q) => q.paved && pointInPoly(sp, q.pts))) out.push({ text: 'a building spot is on a square', at: sp });
  const spots = [...d.spots, ...(d.hall ? [d.hall] : []), ...(d.wonder ? [d.wonder] : [])];
  const lp = layoutProblems((p) => rhoOf(6, p) <= LOT_INNER + 1e-9, clearance(d.streets, d.stubs), d.lots, spots, d.squares);
  for (const t of lp) {
    const m = /lots? (\d+)/.exec(t);
    const l = m ? d.lots[Number(m[1])] : undefined;
    out.push(l ? { text: t, at: l } : { text: t });
  }
  return out;
}
