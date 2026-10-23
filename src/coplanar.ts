// Faces that lie in the same plane and overlap, in different colors: they
// flicker (z-fighting) as the depth buffer can't tell them apart. Used by
// the models' tests (architecture.test.ts AR5).

import type * as THREE from 'three';

export interface Clash { a: number; b: number; colorA: string; colorB: string; area: number; at: [number, number, number]; plane: string }

const PLANE_EPS = 2e-5;   // how close two planes must be to fight (details stand out 2.5e-4: houseKit E)
const AREA_EPS = 2e-9;    // how much they must overlap (tile steps²) to show

type V2 = [number, number];
// A vertex color (linear) as sRGB hex, as the models' code writes it.
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)).toString(16).padStart(2, '0')).join('');
// The convex polygon (counter-clockwise) cut by the half-plane left of a→b.
function clip(poly: V2[], a: V2, b: V2): V2[] {
  const out: V2[] = [], side = (p: V2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!, sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
const area = (p: V2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const ccw = (t: V2[]) => (area(t) < 0 ? [t[0]!, t[2]!, t[1]!] : t);

// Every pair of overlapping coplanar triangles of different colors in a (non-indexed, vertex-colored) geometry.
export function coplanarClashes(g: THREE.BufferGeometry, limit = 20): Clash[] {
  const pos = g.getAttribute('position'), col = g.getAttribute('color'), n = pos.count / 3;
  const tris: { n: [number, number, number]; d: number; c: string; v: [number, number, number][]; id: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = [0, 1, 2].map((k) => [pos.getX(i * 3 + k), pos.getY(i * 3 + k), pos.getZ(i * 3 + k)] as [number, number, number]);
    const [p, q, r] = v as [[number, number, number], [number, number, number], [number, number, number]];
    const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    let nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!, ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!, nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) continue;
    nx /= len; ny /= len; nz /= len;
    // (Faces back to back are two solids touching: each hides the other's,
    // so only faces turned the same way count.)
    const c = col ? hex(col.getX(i * 3), col.getY(i * 3), col.getZ(i * 3)) : '';
    tris.push({ n: [nx, ny, nz], d: nx * p[0] + ny * p[1] + nz * p[2], c, v, id: i });
  }
  // Buckets by direction and offset; neighbors in offset checked too.
  const key = (t: (typeof tris)[number], dd = 0) => `${t.n.map((x) => Math.round(x * 500)).join(',')}|${Math.round(t.d / PLANE_EPS) + dd}`;
  const buckets = new Map<string, number[]>();
  tris.forEach((t, i) => { const k = key(t); (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i); });
  const out: Clash[] = [], seen = new Set<string>();
  for (const [i, t] of tris.entries()) {
    for (const dd of [0, 1]) for (const j of buckets.get(key(t, dd)) ?? []) {
      if (j <= i && dd === 0) continue;
      const u = tris[j]!;
      if (u.c === t.c || Math.abs(u.d - t.d) > PLANE_EPS || t.n[0] * u.n[0] + t.n[1] * u.n[1] + t.n[2] * u.n[2] < 0.9999) continue;
      const pair = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      // Project onto the plane (drop the normal's largest axis) and intersect.
      const ax = Math.abs(t.n[0]) >= Math.abs(t.n[1]) && Math.abs(t.n[0]) >= Math.abs(t.n[2]) ? 0 : Math.abs(t.n[1]) >= Math.abs(t.n[2]) ? 1 : 2;
      const to2 = (p: [number, number, number]): V2 => (ax === 0 ? [p[1], p[2]] : ax === 1 ? [p[0], p[2]] : [p[0], p[1]]);
      const A = ccw(t.v.map(to2)), B = ccw(u.v.map(to2));
      let poly: V2[] = A;
      for (let k = 0; k < 3 && poly.length; k++) poly = clip(poly, B[k]!, B[(k + 1) % 3]!);
      const ar = poly.length >= 3 ? Math.abs(area(poly)) : 0;
      if (ar > AREA_EPS) {
        out.push({ a: t.id, b: u.id, colorA: t.c, colorB: u.c, area: ar, at: t.v[0]!, plane: `${t.n.map((x) => x.toFixed(2)).join(',')} d=${t.d.toFixed(5)}` });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
