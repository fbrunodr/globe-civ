// The small things the countryside is made of (rural/look.ts says which
// stand where): animals, spoil heaps, stone
// blocks, logs, haystacks, a mine's adit. Built in tile steps at true size,
// like the town's lot models (houses.ts), cached; the leaf parts (the
// fleece, the heap) take each instance's own colour, so one model serves
// every herd and every rock. Kept to a handful of triangles each: a farm
// tile holds hundreds of them.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cone, cyl, part, tf, type Tf } from '../propCatalog.ts';

export const RURAL_MODELS = ['sheep', 'cow', 'heap', 'block', 'logs', 'stump', 'haystack', 'adit', 'rack'] as const;
export type RuralModel = (typeof RURAL_MODELS)[number];
export type RuralModelKind = `rural|${RuralModel}`;
export const ruralModelKind = (m: RuralModel): RuralModelKind => `rural|${m}`;
export const isRuralModelKind = (k: string): k is RuralModelKind => k.startsWith('rural|');

// The leaf colour (marked per vertex, taken from the instance).
const LEAF = 0x010203;
const TRUNK = 0x6a5038, TIMBER = 0x7a5f45, DARK = 0x2a2622, WHITE = 0xe8e2d6;
const P = (g: THREE.BufferGeometry, c: number, o: Tf = {}) => part(g, c, tf(o));
const box = (w: number, h: number, d: number, c: number, o: Tf = {}) => P(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, o);

const MODELS: Record<RuralModel, () => THREE.BufferGeometry[]> = {
  sheep: () => [box(0.0042, 0.0026, 0.0026, LEAF, { y: 0.0012 }), box(0.0014, 0.0014, 0.0014, DARK, { x: 0.0026, y: 0.0024 }), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(0.0005, 0.0012, 0.0005, DARK, { x: a! * 0.0014, z: b! * 0.0008 }))],
  cow: () => [box(0.0065, 0.0034, 0.0032, LEAF, { y: 0.0018 }), box(0.002, 0.0022, 0.0022, LEAF, { x: 0.0042, y: 0.0034 }), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(0.0007, 0.0018, 0.0007, DARK, { x: a! * 0.0024, z: b! * 0.0011 }))],
  heap: () => [cone(0.018, 0.015, 7, LEAF), cone(0.009, 0.008, 6, LEAF, { x: 0.012, z: 0.006 })],
  block: () => [box(0.011, 0.0065, 0.008, LEAF), box(0.008, 0.005, 0.006, LEAF, { x: 0.004, y: 0.0065, ry: 0.3 })],
  logs: () => [[0, 0, -1], [0, 0, 0], [0, 0, 1], [1, 0, -0.5], [1, 0, 0.5], [2, 0, 0]].map(([row, , k]) => P(new THREE.CylinderGeometry(0.0022, 0.0022, 0.02, 6).rotateZ(Math.PI / 2), TIMBER, { y: 0.0022 + row! * 0.0038, z: k! * 0.0044 })),
  stump: () => [cyl(0.0028, 0.0024, 0.003, 6, TRUNK), P(new THREE.CircleGeometry(0.0024, 6).rotateX(-Math.PI / 2), 0xc9a878, { y: 0.0031 })],
  haystack: () => [cyl(0.0034, 0.0034, 0.003, 7, LEAF), cone(0.0034, 0.003, 7, LEAF, { y: 0.003 })],
  adit: () => [box(0.002, 0.011, 0.002, TIMBER, { x: -0.0055 }), box(0.002, 0.011, 0.002, TIMBER, { x: 0.0055 }), box(0.014, 0.002, 0.0024, TIMBER, { y: 0.011 }), box(0.009, 0.0098, 0.0012, DARK, { z: -0.001 }), box(0.016, 0.004, 0.012, 0x6a6258, { z: -0.007 })],
  rack: () => [box(0.001, 0.009, 0.001, TIMBER, { x: -0.006 }), box(0.001, 0.009, 0.001, TIMBER, { x: 0.006 }), box(0.0135, 0.0008, 0.0008, TIMBER, { y: 0.0085 }), box(0.011, 0.005, 0.0004, WHITE, { y: 0.003 })],
};

const cache = new Map<RuralModelKind, THREE.BufferGeometry>();
export function ruralGeometry(kind: RuralModelKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (!g) {
    const parts = MODELS[kind.slice('rural|'.length) as RuralModel]().map((p) => (p.index ? p.toNonIndexed() : p));
    g = mergeGeometries(parts)!;
    if (!g) throw new Error(`rural model ${kind}`);
    for (const p of parts) p.dispose();
    // The leaf parts: marked, and white (the instance's colour shows through).
    const col = g.getAttribute('color'), mask = new Float32Array(col.count), probe = new THREE.Color(LEAF);
    for (let i = 0; i < col.count; i++) {
      if (Math.abs(col.getX(i) - probe.r) + Math.abs(col.getY(i) - probe.g) + Math.abs(col.getZ(i) - probe.b) > 1e-4) continue;
      mask[i] = 1;
      col.setXYZ(i, 1, 1, 1);
    }
    g.setAttribute('leafMask', new THREE.BufferAttribute(mask, 1));
    g.computeVertexNormals();
    cache.set(kind, g);
  }
  return g;
}
