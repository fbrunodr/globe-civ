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
import { wonderBeside, type WonderKey } from './cities.ts';
import { P, box, chamfered, dome, drum, frustum, gable, hip, onion, patch, shade, shrub, spire, type G } from './houseKit.ts';

export const SITE_HALF = (7 * CELL) / 2; // 0.07875
// What stands on a site: a wonder, or the scaffolding of one being built.
export type SiteModel = Exclude<WonderKey, 'machuPicchu'> | 'scaffold';
export type WonderModelKind = `wonder|${SiteModel}`;
// Wonders that stand on the bare ground, sunk into a slope rather than
// raised on a foundation (cityProps.ts standLot).
export const ON_BARE_GROUND: ReadonlySet<string> = new Set<SiteModel>(['stonehenge']);
export const wonderModelKind = (m: SiteModel): WonderModelKind => `wonder|${m}`;
export const isWonderModelKind = (k: string): k is WonderModelKind => k.startsWith('wonder|');

const LIMESTONE = 0xe2d6b8, SANDSTONE = 0xc9ad7f, MARBLE = 0xddd6c6, STONE = 0xb8b0a0, DARK = 0x8d877c;
const ROCK = 0x7d776c, GRASS = 0x7f9a58, LEAF = 0x5b7a3a, WATER = 0x6f97a8, TIMBER = 0x7a5f45, IRON = 0x4a4744, BRONZE = 0x9a7a4a;
const H = SITE_HALF * 0.94; // the most a wonder spreads from the middle
// The least a wonder rises (site units): drawn in a city at about three
// quarters of its size, above a three-storey house's eaves.
export const MIN_HEIGHT = 0.14;

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
  // its fire, on a rocky islet in the sea (its origin at the water line:
  // it stands beside a coastal city, cityProps.ts).
  greatLighthouse: () => [
    P(new THREE.CylinderGeometry(0.068, 0.075, 0.0078, 9).translate(0, 0.0021, 0), ROCK, { ry: 0.3 }),
    ...[[0.06, 0.025, 1.1], [-0.045, 0.05, 0.9], [-0.03, -0.058, 1], [0.035, -0.055, 0.8]].map(([x, z, s]) =>
      P(new THREE.DodecahedronGeometry(0.011 * s!, 0).scale(1, 0.7, 1), shade(ROCK, 0.9 + 0.1 * s!), { x: x!, y: 0.0065, z: z!, ry: x! * 40 })),
    ...frustum(0.06, 0.06, 0.05, 0.05, 0.075, LIMESTONE, { y: 0.006 }, shade(LIMESTONE, 0.95)),
    ...chamfered(0.036, 0.04, 0.036, 0.3, LIMESTONE, { y: 0.081 }),
    ...drum(0.012, 0.011, 0.022, 10, LIMESTONE, { y: 0.121 }),
    cone(0.013, 0.012, 10, BRONZE, { y: 0.143 }),
    P(new THREE.OctahedronGeometry(0.006, 0), 0xf2b65a, { y: 0.16 }),
    ...[-1, 1].flatMap((s) => box(0.01, 0.026, 0.01, LIMESTONE, { x: s * 0.042, y: 0.006, z: 0.042 })),
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
  // trilithons inside, standing straight on the grass (no platform:
  // ON_BARE_GROUND).
  stonehenge: () => {
    const out: G[] = [];
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
  // Rhodes: the bronze sun god on a high pedestal by the harbour, torch raised.
  colossus: () => {
    const B = 0x9a7a4a, G2 = shade(B, 0.85);
    return [
      patch(2 * H, 2 * H, shade(STONE, 1.05)),
      ...frustum(0.07, 0.07, 0.056, 0.056, 0.05, STONE, {}, shade(STONE, 1.05)),
      seg(V(-0.012, 0.05, 0), V(-0.008, 0.1, 0), 0.006, B), seg(V(0.012, 0.05, 0), V(0.008, 0.1, 0), 0.006, B),
      cyl(0.012, 0.014, 0.045, 7, B, { y: 0.098 }),
      P(new THREE.IcosahedronGeometry(0.008, 0), B, { y: 0.152 }),
      ...[-1, 1].map((sx) => cone(0.0016, 0.008, 3, G2, { x: sx * 0.005, y: 0.156, rz: -sx * 0.6 })),
      seg(V(0.013, 0.135, 0), V(0.024, 0.19, 0.004), 0.0035, B),
      seg(V(-0.013, 0.135, 0), V(-0.02, 0.105, 0.006), 0.0032, B),
      P(new THREE.OctahedronGeometry(0.006, 0), 0xf2b65a, { x: 0.025, y: 0.197, z: 0.004, sy: 1.4 }),
    ];
  },
  // Angkor: a temple mountain in three stepped tiers, its five lotus towers
  // (the middle one highest), a moat round it.
  angkorWat: () => {
    const S = 0xb7a17c, out: G[] = [patch(2 * H, 2 * H, WATER), patch(0.13, 0.13, shade(STONE, 1.05), 0, 0, 0.0006)];
    [[0.12, 0], [0.095, 0.018], [0.07, 0.036]].forEach(([w, y]) => out.push(...box(w!, 0.018, w!, S, { y: y! }, shade(S, 1.06))));
    const tower = (x: number, z: number, h: number, r: number) => [
      ...drum(r, r * 0.9, h * 0.35, 8, S, { x, y: 0.054, z }),
      cone(r * 0.95, h * 0.65, 8, shade(S, 0.95), { x, y: 0.054 + h * 0.35, z }),
    ];
    out.push(...tower(0, 0, 0.11, 0.012));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...tower(x * 0.026, z * 0.026, 0.07, 0.008));
    out.push(...frustum(0.02, 0.03, 0.02, 0.002, 0.054, shade(S, 1.05), { z: 0.05 }));
    return out;
  },
  // Constantinople: the great dome on its block, half domes, four minarets.
  hagiaSophia: () => {
    const W = 0xcf9f7c, out: G[] = [patch(2 * H, 2 * H, shade(STONE, 1.05))];
    out.push(...box(0.1, 0.05, 0.09, W, {}, shade(W, 1.05)));
    out.push(...drum(0.03, 0.03, 0.012, 16, W, { y: 0.05 }));
    out.push(dome(0.034, 0x8a8f96, { y: 0.062 }, 14));
    for (const z of [-0.042, 0.042]) out.push(dome(0.02, 0x8a8f96, { y: 0.05, z }, 10));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      out.push(cyl(0.004, 0.0035, 0.14, 8, MARBLE, { x: x * 0.064, z: z * 0.058 }));
      out.push(cone(0.0045, 0.022, 8, 0x8a8f96, { x: x * 0.064, y: 0.14, z: z * 0.058 }));
    }
    return out;
  },
  // Paris: a long gothic nave under a steep roof, two square towers on the
  // west front, a slender spire over the crossing.
  notreDame: () => {
    const S = 0xd2c8b4, R = 0x6f7a80, out: G[] = [patch(2 * H, 2 * H, shade(STONE, 1.05))];
    out.push(...box(0.05, 0.06, 0.12, S, { z: -0.01 }));
    out.push(...gable(0.054, 0.124, 0.03, R, { y: 0.06, z: -0.01 }, true, S));
    out.push(...box(0.11, 0.045, 0.03, S, { z: -0.02 }));
    for (const x of [-0.019, 0.019]) out.push(...box(0.024, 0.12, 0.026, S, { x, z: 0.058 }, shade(S, 1.05)));
    out.push(...box(0.016, 0.07, 0.004, shade(S, 1.04), { z: 0.072 }));
    out.push(P(new THREE.CircleGeometry(0.008, 12), 0x7d5a8a, { y: 0.08, z: 0.0735 }));
    out.push(spire(0.008, 0.11, R, { y: 0.075, z: -0.025 }));
    return out;
  },
  // Agra: the white tomb on its plinth, its onion dome on a drum, small
  // domed kiosks, four minarets at the plinth's corners, the long pool.
  tajMahal: () => {
    const Wm = 0xf1ece0, out: G[] = [patch(2 * H, 2 * H, GRASS), patch(0.018, 0.07, WATER, 0, 0.042, 0.0006)];
    out.push(...box(0.11, 0.01, 0.11, Wm, {}, shade(Wm, 0.97)));
    out.push(...chamfered(0.066, 0.05, 0.066, 0.22, Wm, { y: 0.01 }));
    out.push(...drum(0.022, 0.022, 0.014, 14, Wm, { y: 0.06 }));
    out.push(...onion(0.028, Wm, { y: 0.07 }));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      out.push(dome(0.009, Wm, { x: x * 0.022, y: 0.06, z: z * 0.022 }, 8));
      out.push(cyl(0.0045, 0.004, 0.1, 8, Wm, { x: x * 0.05, y: 0.01, z: z * 0.05 }));
      out.push(dome(0.006, Wm, { x: x * 0.05, y: 0.11, z: z * 0.05 }, 8));
    }
    return out;
  },
  // Westminster: the clock tower, its four faces and gilded spire, beside a
  // long gothic palace front.
  bigBen: () => {
    const S = 0xc9b48a, out: G[] = [patch(2 * H, 2 * H, shade(STONE, 1.05))];
    out.push(...box(0.13, 0.036, 0.04, S, { z: -0.03 }, shade(S, 0.9)));
    for (let k = 0; k < 7; k++) out.push(spire(0.006, 0.014, shade(S, 0.9), { x: -0.06 + k * 0.02, y: 0.036, z: -0.012 }));
    out.push(...box(0.026, 0.15, 0.026, S, { x: 0.035, z: 0.02 }, shade(S, 1.05)));
    for (const [dx, dz, ry] of [[0, 0.0135, 0], [0, -0.0135, Math.PI], [0.0135, 0, Math.PI / 2], [-0.0135, 0, -Math.PI / 2]] as const) {
      out.push(P(new THREE.CircleGeometry(0.009, 12), 0xf0e6c8, { x: 0.035 + dx, y: 0.128, z: 0.02 + dz, ry }));
    }
    out.push(...box(0.028, 0.012, 0.028, shade(S, 0.95), { x: 0.035, y: 0.15, z: 0.02 }));
    out.push(spire(0.024, 0.06, 0x5d6a62, { x: 0.035, y: 0.162, z: 0.02 }));
    out.push(cone(0.002, 0.012, 4, 0xd9b45a, { x: 0.035, y: 0.22, z: 0.02 }));
    return out;
  },
  // Paris: four iron legs arching in to the first platform, the second,
  // and the tall shaft to the top.
  eiffelTower: () => {
    const I = 0x7a5e48, out: G[] = [patch(2 * H, 2 * H, GRASS), patch(0.09, 0.09, shade(STONE, 1.05), 0, 0, 0.0006)];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      out.push(seg(V(x * 0.055, 0.005, z * 0.055), V(x * 0.03, 0.05, z * 0.03), 0.006, I));
      out.push(seg(V(x * 0.03, 0.05, z * 0.03), V(x * 0.014, 0.11, z * 0.014), 0.0045, I));
      out.push(seg(V(x * 0.014, 0.11, z * 0.014), V(0, 0.21, 0), 0.003, I));
    }
    out.push(...box(0.07, 0.006, 0.07, I, { y: 0.047 }));
    out.push(...box(0.034, 0.005, 0.034, I, { y: 0.108 }));
    out.push(...box(0.012, 0.01, 0.012, I, { y: 0.2 }));
    out.push(cone(0.002, 0.03, 4, I, { y: 0.21 }));
    return out;
  },
  // New York: the green lady on her star fort and pedestal, torch high,
  // tablet in the other arm, rays on her crown.
  statueOfLiberty: () => {
    const Cu = 0x7fae9c, out: G[] = [patch(2 * H, 2 * H, GRASS)];
    out.push(...box(0.1, 0.012, 0.1, shade(STONE, 0.95), { ry: Math.PI / 4 }));
    out.push(...frustum(0.05, 0.05, 0.04, 0.04, 0.06, STONE, { y: 0.012 }, shade(STONE, 1.05)));
    out.push(cone(0.019, 0.06, 8, Cu, { y: 0.072, sx: 1, sz: 0.8 }));
    out.push(cyl(0.009, 0.007, 0.03, 8, Cu, { y: 0.1 }));
    out.push(P(new THREE.IcosahedronGeometry(0.0065, 0), Cu, { y: 0.136 }));
    for (let k = 0; k < 5; k++) out.push(cone(0.0012, 0.008, 3, Cu, { y: 0.14, x: Math.cos(k * 1.26) * 0.004, z: Math.sin(k * 1.26) * 0.004, rz: Math.cos(k * 1.26) * 0.7, rx: -Math.sin(k * 1.26) * 0.7 }));
    out.push(seg(V(0.008, 0.122, 0), V(0.014, 0.17, 0), 0.0028, Cu));
    out.push(P(new THREE.OctahedronGeometry(0.005, 0), 0xf2b65a, { x: 0.0145, y: 0.176, sy: 1.4 }));
    out.push(...box(0.008, 0.012, 0.003, Cu, { x: -0.011, y: 0.11, z: 0.006, rz: 0.3 }));
    return out;
  },
  // Rio: the robed figure with open arms on a rocky crag.
  cristoRedentor: () => {
    const Wt = 0xe8e4d8, out: G[] = [patch(2 * H, 2 * H, GRASS)];
    out.push(P(new THREE.DodecahedronGeometry(0.05, 0).scale(1.2, 0.8, 1.1), ROCK, { y: 0.04 }));
    out.push(...box(0.024, 0.02, 0.024, STONE, { y: 0.075 }));
    out.push(cyl(0.012, 0.009, 0.06, 8, Wt, { y: 0.095 }));
    out.push(...box(0.085, 0.008, 0.008, Wt, { y: 0.143 }));
    out.push(P(new THREE.IcosahedronGeometry(0.0065, 0), Wt, { y: 0.16 }));
    return out;
  },
  // New York: the setback tower, stepping in as it rises, its mast.
  empireState: () => {
    const L = 0xb9b2a4, out: G[] = [patch(2 * H, 2 * H, shade(STONE, 0.95))];
    const tiers = [[0.1, 0.024], [0.064, 0.05], [0.05, 0.07], [0.034, 0.03], [0.02, 0.016]] as const;
    let y = 0;
    tiers.forEach(([w, h], i) => { out.push(...box(w, h, w * 0.82, shade(L, 1 - i * 0.03), { y }, shade(L, 1.05))); y += h; });
    out.push(cyl(0.004, 0.002, 0.04, 6, 0x9aa0a6, { y }));
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
    // (Every wonder in a city stands out over the town: as tall as
    // MIN_HEIGHT at least, stretched up if lower. One beside its city, in
    // the open (the Pyramids, Stonehenge, the Great Lighthouse), keeps its
    // own proportions; scaffolding is as it is.)
    g.computeBoundingBox();
    const top = g.boundingBox!.max.y;
    if (m !== 'scaffold' && !wonderBeside(m) && top < MIN_HEIGHT) g.scale(1, MIN_HEIGHT / top, 1);
    g.setAttribute('leafMask', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
    g.computeVertexNormals();
    cache.set(kind, g);
  }
  return g;
}
export const SITE_MODELS = Object.keys(MODELS) as SiteModel[];
