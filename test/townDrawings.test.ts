// Guarantees of the town drawings themselves (src/town): the edge classes
// and every drawing of every class, role and density. (How they are laid
// on the globe: cityDesigns.test.ts.)

import { describe, it, expect } from 'vitest';
import { CLASSES, TURNS, STUB_U, classOf, key, parseKey, underTurn, type EdgeValue } from '../src/town/edges.ts';
import { drawingFor, skeletonFor, clearance, LOT_INNER } from '../src/town/index.ts';
import { ROLES, WIDEST_CLASS, components } from '../src/town/skeleton.ts';
import { drawingProblems, spotOnStreet } from '../src/town/checks.ts';
import { DENSITIES, HALF_WIDTH, HOMES, LOT_SIZE, MAX_SPOTS, SAFE_RHO, SPOTS, layoutProblems, spotOutline, spotsOverlap, distToLine, len, sub, rhoOf } from '../src/town/geometry.ts';

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
  it('every skeleton has its site and three building spots, clear of the streets at their widest and of each other', () => {
    const bad: string[] = [];
    for (const k of CLASSES) for (const role of ROLES) {
      const sk = skeletonFor(k, role);
      if (sk.spots.length !== MAX_SPOTS) bad.push(`${k} ${role}: ${sk.spots.length} spots`);
      const placed = [sk.site, ...sk.spots];
      placed.forEach((sp, i) => {
        if (sk.streets.some((st) => spotOnStreet(sp, st.pts, HALF_WIDTH[WIDEST_CLASS[st.rank]]))) bad.push(`${k} ${role}: ${i ? `spot ${i}` : 'the site'} on a street`);
        for (const o of placed.slice(i + 1)) if (spotsOverlap(sp, o)) bad.push(`${k} ${role}: ${i ? `spot ${i}` : 'the site'} overlaps another`);
      });
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
        // (The town thins away from its sides with no street, town/field.ts:
        // homes by the streets that come in.)
        const sides = [...k].filter((c) => c === '1').length;
        const need = 4 * sides;
        if (homes < need) bad.push(`${k} ${role}: only ${homes} homes (${need} wanted)`);
        if (dr.spots.length !== SPOTS[d]) bad.push(`${k} ${role}: ${dr.spots.length} spots`);
        const lp = layoutProblems((p) => rhoOf(6, p) <= LOT_INNER + 1e-9, clearance(dr.streets, dr.stubs), dr.lots, dr.spots, dr.squares);
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

describe('TD5: every building fronts a street', () => {
  for (const d of DENSITIES) {
    it(`${d}: each building's front is at a street's edge`, () => {
      const bad: string[] = [];
      for (const k of CLASSES) for (const role of ROLES) {
        const dr = drawingFor(k, role, d);
        for (const l of dr.lots) {
          if (!HOMES.has(l.kind)) continue;
          const [, hd] = LOT_SIZE[l.kind];
          const front = { x: l.x + Math.cos(l.yaw) * hd, y: l.y + Math.sin(l.yaw) * hd };
          const gap = Math.min(...dr.streets.map((s) => distToLine(front, s.pts) - HALF_WIDTH[s.cls]));
          // (Set back 0.004 from a street at its widest: up to 0.018 from a narrower one.)
          if (gap > 0.02) bad.push(`${k} ${role}: a ${l.kind} ${gap.toFixed(3)} back from the nearest street`);
        }
      }
      expect(bad.slice(0, 10)).toEqual([]);
    });
  }
});

describe('TD6: what a player builds keeps inside the safe zone', () => {
  it('building spots and the site lie wholly inside SAFE_RHO (no river reaches them)', () => {
    const bad: string[] = [];
    for (const k of CLASSES) for (const role of ROLES) for (const d of DENSITIES) {
      const dr = drawingFor(k, role, d);
      for (const sp of [dr.site, ...dr.spots]) {
        if (spotOutline(sp).some((p) => rhoOf(6, p) > SAFE_RHO + 1e-9)) bad.push(`${k} ${role} ${d}: a spot past the safe zone`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
