// Checks the hand-drawn town sketches (src/town) while drawing: every
// border stub is the end of a street of its width, the streets of a
// drawing form one network, spots clear of streets, squares, each other
// and the edge (with the nearest place that would fit). Lots: see the tests.
import { MIDDLES, STRIPS } from '../src/town/index.ts';
import { middleStubs, stripStubs, shapeOfType, stubClass, STUB_CLASS } from '../src/town/borders.ts';
import { HALF_WIDTH, RC, INR, distToLine, layoutProblems, pointInPoly, reaches, rhoOf, inStrip, STRIP_DEPTH, type Pt, type Spot, type Sides } from '../src/town/geometry.ts';

let bad = 0;
const say = (s: string) => { bad++; console.log(s); };
const inside = (k: Sides, c: Pt, r: number) => {
  for (let j = 0; j < k; j++) { const a = (2 * Math.PI * j) / k; if (c.x * Math.cos(a) + c.y * Math.sin(a) + r > (RC - 0.024 / INR[k] * 0.5) * INR[k]) return false; }
  return true;
};
for (const m of MIDDLES) {
  const stubs: { p: Pt; cls: string }[] = [];
  m.borders.forEach((s, j) => { if (s !== 'closed') middleStubs(m.sides, j, s).forEach((p) => stubs.push({ p, cls: STUB_CLASS[m.density][s] })); });
  for (const st of stubs) {
    const hit = m.streets.find((s) => [s.pts[0]!, s.pts[s.pts.length - 1]!].some((q) => Math.hypot(q.x - st.p.x, q.y - st.p.y) < 1e-6));
    if (!hit) say(`${m.id}: stub ${st.p.x.toFixed(3)},${st.p.y.toFixed(3)} not reached`);
    else if (hit.cls !== st.cls) say(`${m.id}: stub ${st.p.x.toFixed(3)},${st.p.y.toFixed(3)} street ${hit.cls}, border wants ${st.cls}`);
  }
  if (!reaches(m.streets, [], true)) say(`${m.id}: streets not one network`);
  for (const s of m.streets) for (const p of s.pts) if (rhoOf(m.sides, p) > RC + 1e-6) { say(`${m.id}: street outside the middle at ${p.x.toFixed(3)},${p.y.toFixed(3)}`); break; }
  const all: { s: Spot; name: string }[] = [...m.spots.map((s, i) => ({ s, name: `spot ${i}` })), ...(m.hall ? [{ s: m.hall, name: 'hall' }] : []), ...(m.wonder ? [{ s: m.wonder, name: 'wonder' }] : [])];
  const fits = (c: Pt, r: number, name: string, isHall: boolean) => {
    if (!inside(m.sides, c, r)) return 'outside';
    for (const st of m.streets) if (distToLine(c, st.pts) < r + HALF_WIDTH[st.cls] + 0.004) return 'on a street';
    if (!isHall) for (const q of m.squares) if (q.paved && pointInPoly(c, q.pts)) return 'on a square';
    for (const o of all) if (o.name !== name && Math.hypot(o.s.x - c.x, o.s.y - c.y) < o.s.r + r + 0.006) return `on ${o.name}`;
    return null;
  };
  for (const { s, name } of all) {
    const why = fits(s, s.r, name, name !== `spot ${m.spots.indexOf(s)}`);
    if (!why) continue;
    let best: Pt | null = null, bd = Infinity;
    for (let dx = -0.16; dx <= 0.1601; dx += 0.005) for (let dy = -0.16; dy <= 0.1601; dy += 0.005) {
      const c = { x: s.x + dx, y: s.y + dy }, d = Math.hypot(dx, dy);
      if (d < bd && !fits(c, s.r, name, name !== `spot ${m.spots.indexOf(s)}`)) { best = c; bd = d; }
    }
    say(`${m.id}: ${name} ${why}${best ? ` -> try (${best.x.toFixed(3)}, ${best.y.toFixed(3)})` : ' (no room nearby)'}`);
  }
  const lp = layoutProblems((p) => rhoOf(m.sides, p) <= RC - 0.012 / INR[m.sides], m.streets, m.lots, m.spots, m.squares);
  if (lp.length) say(`${m.id}: lots: ${lp.slice(0, 3).join('; ')} (${lp.length})`);
}
for (const s of STRIPS) {
  const ends = [...stripStubs(shapeOfType(s.a), -1), ...(s.b === 'land' || s.b === 'water' ? [] : stripStubs(shapeOfType(s.b), 1))];
  for (const p of ends) {
    const hit = s.streets.find((st) => [st.pts[0]!, st.pts[st.pts.length - 1]!].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6));
    const want = p.y < 0 ? stubClass(s.a) : s.b === 'land' || s.b === 'water' ? null : stubClass(s.b);
    if (!hit) say(`${s.id}: stub ${p.x.toFixed(3)},${p.y.toFixed(3)} not reached`);
    else if (hit.cls !== want) say(`${s.id}: stub street ${hit.cls}, border wants ${want}`);
  }
  for (const st of s.streets) for (const p of st.pts) if (!inStrip(p, -1e-6)) { say(`${s.id}: street outside the strip at ${p.x.toFixed(3)},${p.y.toFixed(3)}`); break; }
  const one = s.b === 'land' || s.b === 'water';
  const lp = layoutProblems((p) => inStrip(p, 0.004, one) && Math.abs(p.y) <= STRIP_DEPTH - 0.022, s.streets, s.lots, [], s.squares);
  if (lp.length) say(`${s.id}: lots: ${lp.slice(0, 3).join('; ')} (${lp.length})`);
}
console.log(bad ? `${bad} problems` : `all ${MIDDLES.length} middles and ${STRIPS.length} strips sound`);
