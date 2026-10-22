// Guarantees of the town drawings themselves (src/town): the edge classes
// and every drawing of every class, role and density. (How they are laid
// on the globe: cityDesigns.test.ts.)

import { describe, it, expect } from 'vitest';
import { CLASSES, TURNS, STUB_U, classOf, key, parseKey, underTurn, type EdgeValue } from '../src/town/edges.ts';
import { drawingFor, skeletonFor, clearance, LOT_INNER } from '../src/town/index.ts';
import { ROLES, RANK_CLASS, components, hasHall } from '../src/town/skeleton.ts';
import { drawingProblems } from '../src/town/checks.ts';
import { isWonderRole } from '../src/town/wonders.ts';
import { DENSITIES, HALF_WIDTH, HOMES, layoutProblems, distToLine, len, sub, rhoOf, pointInPoly } from '../src/town/geometry.ts';

const all = (): EdgeValue[][] => Array.from({ length: 64 }, (_, n) => [0, 1, 2, 3, 4, 5].map((j) => ((n >> j) & 1) as EdgeValue));

describe('TD1: edge classes', () => {
  it('a hex has 13 colourings (street or not on each side) up to turning and mirroring', () => expect(CLASSES.length).toBe(13));
  it("every colouring is its class's drawing under the turn found for it", () => {
    for (const c of all()) {
      const { key: k, turn } = classOf(c);
      expect(CLASSES).toContain(k);
      expect(key(underTurn(c, turn))).toBe(k);
    }
  });
  it('a class is its own smallest key, whatever the turn', () => {
    for (const k of CLASSES) for (const t of TURNS) expect(classOf(underTurn(parseKey(k), t)).key).toBe(k);
  });
  it('stubs are symmetric about the side middle, so both tiles of an edge put them at the same points', () => {
    for (const v of [0, 1] as const) {
      const flipped = [...STUB_U[v]].map((u) => 1 - u).sort(), own = [...STUB_U[v]].sort();
      flipped.forEach((u, i) => expect(u).toBeCloseTo(own[i]!, 12));
    }
  });
});

describe('TD2: every skeleton is sound', () => {
  for (const role of ROLES) {
    it(`${role}: each stub has one street ending exactly at it, running straight in; one network; inside the tile`, () => {
      const bad: string[] = [];
      for (const k of CLASSES) {
        const sk = skeletonFor(k, role);
        if (sk.streets.length === 0) bad.push(`${k}: no street`);
        sk.stubs.forEach((s, i) => {
          const at = sk.streets.filter((st) => st.ends.includes(i));
          if (at.length !== 1) { bad.push(`${k}: stub ${i} has ${at.length} streets`); return; }
          const st = at[0]!, pts = st.ends[0] === i ? st.pts : [...st.pts].reverse();
          if (len(sub(pts[0]!, s.p)) > 1e-9) bad.push(`${k}: stub ${i} street starts off it`);
          // The first stretch runs square to the side (on along the neighbor's street).
          const d = sub(pts[1]!, pts[0]!), cos = (d.x * s.into.x + d.y * s.into.y) / len(d);
          if (cos < Math.cos(2 * Math.PI / 180)) bad.push(`${k}: stub ${i} leaves at ${(Math.acos(cos) * 180 / Math.PI).toFixed(1)}°`);
        });
        if (components(sk.streets).length !== 1) bad.push(`${k}: ${components(sk.streets).length} networks`);
        for (const st of sk.streets) {
          for (const p of st.pts) {
            const r = rhoOf(6, p);
            if (r > 1 + 1e-9) { bad.push(`${k}: a street leaves the tile`); break; }
            // Off its stubs, a street keeps away from the sides (no street along a side with none).
            const nearOwn = st.ends.some((e) => e !== null && len(sub(p, sk.stubs[e]!.p)) < 0.09);
            if (!nearOwn && r > 0.9) { bad.push(`${k}: a street runs at ${r.toFixed(2)} of the radius`); break; }
          }
        }
      }
      expect(bad.slice(0, 10)).toEqual([]);
    });
  }
  it('blocks and centers (walled or not) have two building spots, wonder tiles none; centers a hall, wonder tiles a wonder; all clear of the streets at their widest', () => {
    const bad: string[] = [];
    for (const k of CLASSES) for (const role of ROLES) {
      const sk = skeletonFor(k, role);
      if (sk.spots.length !== (isWonderRole(role) ? 0 : 2)) bad.push(`${k} ${role}: ${sk.spots.length} spots`);
      if ((sk.hall !== null) !== hasHall(role)) bad.push(`${k} ${role}: hall`);
      if ((sk.wonder !== null) !== (isWonderRole(role))) bad.push(`${k} ${role}: wonder`);
      for (const sp of [...sk.spots, ...(sk.hall ? [sk.hall] : [])]) {
        for (const st of sk.streets) if (distToLine(sp, st.pts) < sp.r + HALF_WIDTH[RANK_CLASS.high[st.rank]] - 1e-9) bad.push(`${k} ${role}: a spot on a street`);
        if (rhoOf(6, sp) + sp.r / 0.5 > LOT_INNER) bad.push(`${k} ${role}: a spot reaches the rim`);
      }
      for (const sp of sk.spots) for (const q of sk.squares) if (q.paved && pointInPoly(sp, q.pts)) bad.push(`${k} ${role}: a spot on the square`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});

describe('TD3: every drawing has its lots in order', () => {
  for (const d of DENSITIES) {
    it(`${d}: lots inside the tile's lot area, clear of streets (at their widest near stubs), squares, spots and each other`, () => {
      const bad: string[] = [];
      for (const k of CLASSES) for (const role of ROLES) {
        const dr = drawingFor(k, role, d);
        const homes = dr.lots.filter((l) => HOMES.has(l.kind)).length;
        // (A wonder takes the middle of its tile.)
        if (homes < (isWonderRole(role) ? 10 : 20)) bad.push(`${k} ${role}: only ${homes} homes`);
        const spots = [...dr.spots, ...(dr.hall ? [dr.hall] : []), ...(dr.wonder ? [dr.wonder] : [])];
        const lp = layoutProblems((p) => rhoOf(6, p) <= LOT_INNER + 1e-9, clearance(dr.streets, dr.stubs), dr.lots, spots, dr.squares);
        if (lp.length) bad.push(`${k} ${role}: ${lp.slice(0, 2).join('; ')}`);
      }
      expect(bad.slice(0, 10)).toEqual([]);
    });
  }
});

describe('TD4: walls', () => {
  for (const d of DENSITIES) {
    it(`${d}: every walled center's draft is sound (walls in the tile, every street through a gate, nothing on a wall), and no other tile has walls`, () => {
      const bad: string[] = [];
      for (const k of CLASSES) for (const role of ROLES) {
        const dr = drawingFor(k, role, d);
        if (role === 'walled' && !dr.walls.length) bad.push(`${k}: no walls`);
        for (const p of drawingProblems(dr)) bad.push(`${k} ${role}: ${p.text}`);
      }
      expect(bad.slice(0, 10)).toEqual([]);
    });
  }
});
