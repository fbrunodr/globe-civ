import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { importedPerson, neckLine, HEADED_BODIES, HEAD_NAMES, HEAD, type BodyName, type HeadName } from '../src/importedBody.ts';
import { HANG } from '../src/people.ts';
import busts from '../src/bodies/heads.json';

// The head surgery (importedBody.ts): a body's own head taken off and
// another set on its neck, the new one's neck fitted to the body's. Each
// body with each head:
//   N1 the necks meet: every corner of the head's open edge (its neck's
//      foot) lies on the body's surface;
//   N2 nothing to see through round the neck: from all round, at every
//      height from the head's neck foot up to its chin, a line in towards
//      the neck meets the body or the head;
//   N3 the head is the right size and in place: crown to chin HEAD of the
//      figure's height (its skull as wide as that makes it), its crown at
//      the body's crown, over the neck;
//   N4 nothing of the body's own head shows: no corner of the body above the
//      new head's neck foot (where it comes down to, round the neck; past
//      the seam), near the neck, can be seen from outside, level from all
//      round or from above.
// (The seam: within this of the head's neck foot, either may show past the
// other where the foot's edge runs jagged between its corners.)
const SEAM = 0.012;
interface Tri { readonly p: THREE.Vector3[]; readonly head: boolean }
function figure(body: BodyName, head: HeadName): Tri[] {
  const swing = { legs: () => [1, 0.5, 0.45] as const, arms: () => undefined };
  const { parts } = importedPerson(body, head, { fine: true, skirt: 'knee', legs: 'bare', sleeves: 'short' }, HANG, HANG, swing);
  const out: Tri[] = [];
  for (const part of parts) {
    const pos = part.geo.getAttribute('position'), uv = part.geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i += 3) out.push({ p: [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k)), head: uv.getX(i) >= 1 });
  }
  return out;
}
const key = (p: THREE.Vector3) => `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
const meshOf = (tris: Tri[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((t) => t.p.flatMap((p) => [p.x, p.y, p.z])), 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
};

describe('N: heads set on the bodies', () => {
  for (const body of HEADED_BODIES) for (const head of HEAD_NAMES) {
    const tris = figure(body, head), heads = tris.filter((t) => t.head), bodies = tris.filter((t) => !t.head);
    const pts = heads.flatMap((t) => t.p), foot = Math.min(...pts.map((p) => p.y)), crown = Math.max(...pts.map((p) => p.y));
    // (The neck's line: straight up through the head's skull.)
    const skull = pts.filter((p) => p.y > crown - 0.06), z = (Math.min(...skull.map((p) => p.z)) + Math.max(...skull.map((p) => p.z))) / 2;
    const front = Math.max(...pts.map((p) => p.z)), chin = Math.min(...pts.filter((p) => p.z > z + (front - z) * 0.5 && Math.abs(p.x) < 0.02).map((p) => p.y));
    const ray = new THREE.Raycaster();
    // (The head's neck foot: its open edge in the lowest third of it; how high it comes down round the neck.)
    const edges = new Map<string, [THREE.Vector3, THREE.Vector3, number]>();
    for (const t of heads) for (let k = 0; k < 3; k++) {
      const a = t.p[k]!, b = t.p[(k + 1) % 3]!, ka = key(a), kb = key(b), e = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const c = edges.get(e); if (c) c[2]++; else edges.set(e, [a, b, 1]);
    }
    const low = foot + 0.35 * (crown - foot), rim = [...edges.values()].filter(([a, b, c]) => c === 1 && a.y < low && b.y < low).flatMap(([a, b]) => [a, b]);
    // (Round the neck: about the line the head was fitted round, its neck's middle.)
    const nz = neckLine(body, head);
    const ang = (p: THREE.Vector3) => Math.atan2(p.z - nz, p.x);
    // (Its height at an angle round the neck: between the two corners either side of it.)
    const rimAt = (p: THREE.Vector3) => {
      const a = ang(p), by = rim.map((c) => ({ y: c.y, d: Math.atan2(Math.sin(ang(c) - a), Math.cos(ang(c) - a)) }));
      const lo = by.filter((c) => c.d <= 0).sort((u, w) => w.d - u.d)[0], hi = by.filter((c) => c.d >= 0).sort((u, w) => u.d - w.d)[0];
      if (!lo || !hi) return (lo ?? hi)!.y;
      return hi.d - lo.d < 1e-9 ? lo.y : lo.y + ((hi.y - lo.y) * -lo.d) / (hi.d - lo.d);
    };

    it(`N1 ${body} + ${head}: the head's neck foot lies on the body all round`, () => {
      expect(rim.length, 'the head has an open neck foot').toBeGreaterThan(2);
      const triangles = bodies.map((t) => new THREE.Triangle(...t.p)), q = new THREE.Vector3();
      const off = rim.filter((p) => Math.min(...triangles.map((t) => t.closestPointToPoint(p, q).distanceTo(p))) > 0.004);
      expect([...new Set(off.map(key))]).toEqual([]);
    });

    it(`N2 ${body} + ${head}: nothing to see through round the neck`, () => {
      const all = meshOf(tris), holes: string[] = [];
      for (let k = 0; k <= 6; k++) for (let a = 0; a < 36; a++) {
        const y = foot + (chin - foot) * (k / 6), ang = (a / 36) * Math.PI * 2, d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
        ray.set(new THREE.Vector3(0, y, nz).addScaledVector(d, 0.5), d.clone().negate());
        if (!ray.intersectObject(all).some((h) => h.distance < 0.5)) holes.push(`y ${y.toFixed(3)} at ${Math.round((ang * 180) / Math.PI)}°`);
      }
      expect(holes).toEqual([]);
    });

    it(`N3 ${body} + ${head}: the head HEAD of the figure, crown at the top, over the neck`, () => {
      const top = Math.max(...bodies.flatMap((t) => t.p).filter((p) => Math.hypot(p.x, p.z - z) < 0.1).map((p) => p.y));
      expect(crown).toBeGreaterThan(top - 0.03);
      expect(crown).toBeLessThan(1.02);
      // (Its size by the skull (the fitting leaves it be): crown to chin HEAD, the bust's skull as wide for that.)
      const bust = busts[head], s = HEAD / (1 - bust.chin);
      const width = (ps: readonly (readonly number[])[]) => Math.max(...ps.map((p) => Math.abs(p[0]!)));
      expect(width(pts.filter((p) => p.y > crown - 0.3 * s).map((p) => [p.x]))).toBeCloseTo(width(bust.verts.filter((p) => p[1]! > 0.7)) * s, 3);
      expect(Math.abs(pts.reduce((sum, p) => sum + p.x, 0) / pts.length)).toBeLessThan(0.01);
    });

    it(`N4 ${body} + ${head}: nothing of the body's own head shows`, () => {
      // (Seen: a line to it from outside, level all round or from above, meets nothing before it.)
      const all = meshOf(tris), seen: string[] = [];
      const dirs = [...Array(16).keys()].flatMap((k) => { const a = (k / 16) * Math.PI * 2; return [new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), new THREE.Vector3(Math.cos(a), 1, Math.sin(a)).normalize()]; });
      for (const p of new Map(bodies.flatMap((t) => t.p).map((p) => [key(p), p])).values()) {
        if (p.y <= rimAt(p) + SEAM || Math.hypot(p.x, p.z - nz) > 0.085) continue;
        for (const d of dirs) {
          ray.set(p.clone().addScaledVector(d, 0.5), d.clone().negate());
          if (!ray.intersectObject(all).some((h) => h.distance < 0.5 - 0.003)) { seen.push(key(p)); break; }
        }
      }
      expect(seen).toEqual([]);
    });
  }
});
