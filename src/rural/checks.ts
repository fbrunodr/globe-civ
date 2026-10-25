// What makes a rural drawing sound (the tests and the rural editor ask the
// same): every stub has one track ending at it; the tracks form one network
// and keep off the rim but at their stubs; the spot stands in the safe zone
// off the tracks; worked areas stay inside AREA_INNER, off the tracks, the
// lots, the spot and each other; lots stay in the lot area, off the tracks,
// the spot and each other.

import { SAFE_RHO, distToLine, inSpot, layoutProblems, len, lotSamples, pointInPoly, rhoOf, spotCorners, spotOutline, sub, LOT_INNER, type Pt } from '../town/geometry.ts';
import { components } from '../town/skeleton.ts';
import { AREA_INNER, TRACK_HALF, inLot, polysOverlap, tracksAsStreets, type RuralDrawing } from './index.ts';

export interface Problem { readonly text: string; readonly at?: Pt }

const middle = (poly: readonly Pt[]): Pt => ({ x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length });

export function ruralProblems(d: RuralDrawing): Problem[] {
  const out: Problem[] = [];
  d.stubs.forEach((s, i) => {
    const n = d.tracks.filter((t) => t.ends.includes(i)).length;
    if (n !== 1) out.push({ text: n === 0 ? `stub ${i + 1} (side ${s.side}) has no track` : `stub ${i + 1} has ${n} tracks`, at: s.p });
  });
  if (!d.tracks.length) out.push({ text: 'no track at all' });
  const parts = components(d.tracks.map((t) => ({ pts: t.pts, rank: 'lane' as const, ends: t.ends })));
  if (parts.length > 1) out.push({ text: `the tracks are ${parts.length} separate networks (they must all meet)` });
  for (const t of d.tracks) {
    for (const p of t.pts) {
      if (rhoOf(6, p) > 1 + 1e-9) { out.push({ text: 'a track leaves the tile', at: p }); break; }
      const nearOwn = t.ends.some((e) => e !== null && len(sub(p, d.stubs[e]!.p)) < 0.09);
      if (!nearOwn && rhoOf(6, p) > 0.9) { out.push({ text: 'a track runs along the rim (only stubs may reach it)', at: p }); break; }
    }
  }
  if (!spotCorners(d.spot).every((q) => rhoOf(6, q) <= SAFE_RHO + 1e-9)) out.push({ text: 'the building spot reaches past the safe zone', at: d.spot });
  if (d.tracks.some((t) => spotOutline(d.spot).some((q) => distToLine(q, t.pts) < TRACK_HALF - 1e-9) || t.pts.some((q) => inSpot(q, d.spot)))) out.push({ text: 'the building spot is on a track', at: d.spot });
  d.areas.forEach((a, i) => {
    const at = middle(a);
    if (!a.every((p) => rhoOf(6, p) <= AREA_INNER + 1e-9)) out.push({ text: `area ${i + 1} reaches the rim (worked land keeps inside ${AREA_INNER})`, at });
    const edge = a.flatMap((p, k) => [p, { x: (p.x + a[(k + 1) % a.length]!.x) / 2, y: (p.y + a[(k + 1) % a.length]!.y) / 2 }]);
    if (d.tracks.some((t) => edge.some((p) => distToLine(p, t.pts) < TRACK_HALF - 1e-9) || t.pts.some((q) => pointInPoly(q, a)))) out.push({ text: `area ${i + 1} is on a track`, at });
    if (spotCorners(d.spot).some((q) => pointInPoly(q, a)) || a.some((p) => inSpot(p, d.spot))) out.push({ text: `area ${i + 1} is on the building spot`, at });
    d.lots.forEach((l, j) => { if (lotSamples(l).some((q) => pointInPoly(q, a)) || a.some((p) => inLot(p, l))) out.push({ text: `area ${i + 1} is on lot ${j}`, at }); });
    for (let j = i + 1; j < d.areas.length; j++) if (polysOverlap(a, d.areas[j]!)) out.push({ text: `areas ${i + 1} and ${j + 1} overlap`, at });
  });
  for (const t of layoutProblems((p) => rhoOf(6, p) <= LOT_INNER + 1e-9, tracksAsStreets(d.tracks), d.lots, [d.spot])) {
    const m = /lots? (\d+)/.exec(t);
    const l = m ? d.lots[Number(m[1])] : undefined;
    out.push(l ? { text: t, at: l } : { text: t });
  }
  return out;
}
