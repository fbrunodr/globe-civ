// Wonders, each built on a square of 7 × 7 cells (SITE_HALF) and never
// stretched: each fills the square with room to spare, its front +z. A
// painted city scales it to its rectangle (cityDress.ts). Scaffolding
// stands there while one is built. (Machu Picchu stands on a mountain top
// instead: buildingCatalog.ts.)
//
// Units are tile steps (the lot models' units, houseKit.ts); the origin is
// the middle of the site on the ground.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cone, cyl } from './propCatalog.ts';
import { CELL } from './town/geometry.ts';
import type { WonderKey } from './cities.ts';
import { P, box, chamfered, drum, frustum, gable, hip, patch, ring, shade, shrub, type G } from './houseKit.ts';

export const SITE_HALF = (7 * CELL) / 2; // 0.07875
// What stands on a site: a wonder, or the scaffolding of one being built.
export type SiteModel = Exclude<WonderKey, 'machuPicchu'> | 'scaffold';
export type WonderModelKind = `wonder|${SiteModel}`;
export const wonderModelKind = (m: SiteModel): WonderModelKind => `wonder|${m}`;
export const isWonderModelKind = (k: string): k is WonderModelKind => k.startsWith('wonder|');

const LIMESTONE = 0xe2d6b8, SANDSTONE = 0xc9ad7f, MARBLE = 0xddd6c6, STONE = 0xb8b0a0, DARK = 0x8d877c;
const GRASS = 0x7f9a58, LEAF = 0x5b7a3a, WATER = 0x6f97a8, TIMBER = 0x7a5f45, IRON = 0x4a4744, BRONZE = 0x9a7a4a;
const H = SITE_HALF * 0.94; // the most a wonder spreads from the middle

const seg = (a: THREE.Vector3, b: THREE.Vector3, r: number, c: number): G => {
  const l = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, l, 3, 1, true).translate(0, l / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())));
  return P(g.translate(a.x, a.y, a.z), c);
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const MODELS: Record<SiteModel, () => G[]> = {
  // Giza: the great pyramid at the back, two queens' pyramids before it,
  // on a paved desert terrace (as high as 0.64 of its base).
  pyramids: () => {
    const b = 2 * H;
    return [
      hip(b, b, 0.64 * b, LIMESTONE),
      hip(0.012, 0.012, 0.0077, 0xd9b45a, { y: 0.64 * b - 0.0077 }),
    ];
  },
  // Pharos: a square tower, an octagonal one on it, a round lantern with
  // its fire, on a walled platform.
  greatLighthouse: () => [
    ...box(2 * H, 0.006, 2 * H, STONE, {}, shade(STONE, 1.05)),
    ring(2 * H, 0.012, 2 * H, DARK, { y: 0.006 }),
    ...frustum(0.06, 0.06, 0.05, 0.05, 0.075, LIMESTONE, { y: 0.006 }, shade(LIMESTONE, 0.95)),
    ...chamfered(0.036, 0.04, 0.036, 0.3, LIMESTONE, { y: 0.081 }),
    ...drum(0.012, 0.011, 0.022, 10, LIMESTONE, { y: 0.121 }),
    cone(0.013, 0.012, 10, BRONZE, { y: 0.143 }),
    P(new THREE.OctahedronGeometry(0.006, 0), 0xf2b65a, { y: 0.16 }),
    ...[-1, 1].flatMap((s) => box(0.012, 0.03, 0.012, LIMESTONE, { x: s * 0.06, y: 0.006, z: 0.06 })),
  ],
  // Babylon: terraces stepping up, planted on every level, a stair up the front.
  hangingGardens: () => {
    const out: G[] = [patch(2 * H, 2 * H, GRASS)];
    const tiers = [0.14, 0.108, 0.078, 0.05];
    tiers.forEach((w, i) => {
      out.push(...box(w, 0.016, w * 0.9, SANDSTONE, { y: i * 0.016 }, LEAF));
      const r = 0.004, n = 3 + (3 - i);
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n - 0.5;
        out.push(shrub(a * w * 0.9, w * 0.42, r, 0x4f7034), shrub(a * w * 0.9, -w * 0.42, r, 0x4f7034));
      }
      out.push(P(new THREE.OctahedronGeometry(0.005, 0), 0x4f7034, { x: w * 0.42, y: (i + 1) * 0.016 + 0.004, z: 0, sy: 1.4 }));
      out.push(P(new THREE.OctahedronGeometry(0.005, 0), 0x4f7034, { x: -w * 0.42, y: (i + 1) * 0.016 + 0.004, z: 0, sy: 1.4 }));
    });
    out.push(...frustum(0.018, 0.024, 0.018, 0.002, 0.048, shade(SANDSTONE, 1.08), { z: 0.058 }));
    out.push(patch(0.07, 0.006, WATER, 0, 0.0735, 0.0004)); // a canal before it
    return out;
  },
  // Alexandria: a colonnaded hall on a podium, its roof gabled, a reading dome behind.
  greatLibrary: () => {
    const out: G[] = [
      ...box(0.15, 0.008, 0.12, MARBLE, {}, shade(MARBLE, 1.04)),
      ...box(0.12, 0.034, 0.072, MARBLE, { y: 0.008, z: -0.01 }),
      ...gable(0.128, 0.104, 0.018, shade(MARBLE, 0.9), { y: 0.042, z: -0.006 }),
      ...drum(0.02, 0.02, 0.012, 12, MARBLE, { y: 0.042, z: -0.03 }),
      P(new THREE.SphereGeometry(0.021, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a8f8a, { y: 0.054, z: -0.03 }),
      ...frustum(0.06, 0.02, 0.06, 0.004, 0.008, shade(MARBLE, 0.95), { z: 0.068 }),
    ];
    for (let k = 0; k < 8; k++) out.push(cyl(0.0026, 0.0022, 0.034, 6, MARBLE, { x: -0.056 + (k * 0.112) / 7, y: 0.008, z: 0.043 }));
    return out;
  },
  // Salisbury Plain: a ring of sarsens with their lintels, a horseshoe of
  // trilithons inside, the bank and ditch round them on the grass.
  stonehenge: () => {
    const out: G[] = [P(new THREE.CircleGeometry(H, 24).rotateX(-Math.PI / 2), GRASS, { y: 0.0003 })];
    out.push(cyl(H, H * 0.97, 0.004, 24, shade(GRASS, 0.85)));
    const n = 16, r = 0.05;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(...box(0.008, 0.024, 0.005, 0x9a958a, { x: Math.cos(a) * r, z: Math.sin(a) * r, ry: -a + Math.PI / 2 }));
      const b = a + Math.PI / n;
      out.push(...box(0.021, 0.004, 0.005, 0x8f8a80, { x: Math.cos(b) * r, y: 0.024, z: Math.sin(b) * r, ry: -b + Math.PI / 2 }));
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.25 + (1.5 * i) / 4), rr = 0.026;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, ry = -a + Math.PI / 2;
      out.push(...box(0.007, 0.03, 0.006, 0x9a958a, { x: x + Math.cos(ry) * 0.006, z: z - Math.sin(ry) * 0.006, ry }));
      out.push(...box(0.007, 0.03, 0.006, 0x9a958a, { x: x - Math.cos(ry) * 0.006, z: z + Math.sin(ry) * 0.006, ry }));
      out.push(...box(0.02, 0.005, 0.006, 0x8f8a80, { x, y: 0.03, z, ry }));
    }
    out.push(...box(0.006, 0.014, 0.004, DARK, { z: 0.068 })); // the heel stone
    return out;
  },
  // Rome: the oval of arcades, three tiers and an attic, the arena inside.
  colosseum: () => {
    const sx = 1, sz = 0.82, R = H * 0.98, h = 0.05;
    const oval = (g: THREE.BufferGeometry) => g.scale(sx, 1, sz);
    const out: G[] = [patch(2 * H, 2 * H, shade(STONE, 1.08))];
    const tiers = [[0, 0.015, 0xc9b896], [0.015, 0.015, 0xbfae8c], [0.03, 0.013, 0xc9b896], [0.043, 0.007, 0xb5a483]] as const;
    for (const [y, th, c] of tiers) out.push(P(oval(new THREE.CylinderGeometry(R, R, th, 28, 1, true).translate(0, y + th / 2, 0)), c));
    // The arcades: dark arches between piers, on each of the lower tiers.
    for (const y of [0.003, 0.018, 0.033]) {
      out.push(P(oval(new THREE.CylinderGeometry(R + 0.0003, R + 0.0003, 0.009, 28, 1, true).translate(0, y + 0.0045, 0)), 0x6e6455));
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        out.push(...box(0.0035, 0.01, 0.002, 0xc9b896, { x: Math.cos(a) * (R + 0.0006) * sx, y, z: Math.sin(a) * (R + 0.0006) * sz, ry: -a + Math.PI / 2 }));
      }
    }
    out.push(P(oval(new THREE.CylinderGeometry(R * 0.62, R * 0.95, h * 0.85, 24, 1, true).translate(0, h * 0.425, 0)), 0xa89878));
    out.push(P(oval(new THREE.CircleGeometry(R * 0.62, 24).rotateX(-Math.PI / 2).translate(0, 0.0012, 0)), 0xc9a974));
    out.push(P(oval(new THREE.RingGeometry(R * 0.95, R, 28).rotateX(-Math.PI / 2).translate(0, h, 0)), 0xb5a483));
    return out;
  },
  // A wonder going up: poles and boards round the site, a crane.
  scaffold: () => {
    const out: G[] = [patch(2 * H * 0.9, 2 * H * 0.9, 0xa08a6a)];
    const c = H * 0.8, top = 0.05;
    for (const [x, z] of [[-c, -c], [c, -c], [-c, c], [c, c], [0, -c], [0, c], [-c, 0], [c, 0]] as const) out.push(seg(V(x, 0, z), V(x, top, z), 0.0012, TIMBER));
    for (const y of [0.016, 0.033, top]) {
      for (const [a, b] of [[[-c, -c], [c, -c]], [[c, -c], [c, c]], [[c, c], [-c, c]], [[-c, c], [-c, -c]]] as const) out.push(seg(V(a[0], y, a[1]), V(b[0], y, b[1]), 0.0009, TIMBER));
    }
    out.push(...box(c * 1.4, 0.022, c * 1.4, STONE, {}, shade(STONE, 0.95)));
    out.push(seg(V(c * 0.6, 0, -c * 0.5), V(c * 0.6, 0.11, -c * 0.5), 0.0016, IRON));
    out.push(seg(V(c * 0.6, 0.11, -c * 0.5), V(-c * 0.7, 0.105, -c * 0.5), 0.0012, IRON));
    out.push(seg(V(-c * 0.5, 0.105, -c * 0.5), V(-c * 0.5, 0.06, -c * 0.5), 0.0003, IRON));
    out.push(...box(0.01, 0.006, 0.01, STONE, { x: -c * 0.5, y: 0.054, z: -c * 0.5 }));
    return out;
  },
};

const cache = new Map<WonderModelKind, G>();
export function wonderGeometry(kind: WonderModelKind): G {
  let g = cache.get(kind);
  if (!g) {
    const m = kind.slice('wonder|'.length) as SiteModel;
    const parts = MODELS[m]().map((p) => (p.index ? p.toNonIndexed() : p));
    g = mergeGeometries(parts)!;
    if (!g) throw new Error(`wonder ${kind}`);
    for (const p of parts) p.dispose();
    g.setAttribute('leafMask', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
    g.computeVertexNormals();
    cache.set(kind, g);
  }
  return g;
}
export const SITE_MODELS = Object.keys(MODELS) as SiteModel[];
