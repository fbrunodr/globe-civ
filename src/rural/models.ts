// The small things the countryside is made of (rural/look.ts says which
// stand where): animals, spoil heaps, stone
// blocks, logs, haystacks, a mine's adit; Machu Picchu's houses; and what
// the resources show (resourceModels.ts). Built in tile steps at true size,
// like the town's lot models (houses.ts), cached; the leaf parts (the
// fleece, the heap) take each instance's own colour, so one model serves
// every herd and every rock. Kept to a handful of triangles each: a farm
// tile holds hundreds of them.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cone, cyl, part, tf, type Tf } from '../propCatalog.ts';
import { RESOURCE_MODELS, RESOURCE_MODEL_KEYS } from './resourceModels.ts';

export const RURAL_MODELS = ['crop', 'sheep', 'cow', 'heap', 'block', 'logs', 'stump', 'haystack', 'adit', 'rack', 'incaHouse', 'incaShrine', ...RESOURCE_MODEL_KEYS] as const;
export type RuralModel = (typeof RURAL_MODELS)[number];
export type RuralModelKind = `rural|${RuralModel}`;
export const ruralModelKind = (m: RuralModel): RuralModelKind => `rural|${m}`;
export const isRuralModelKind = (k: string): k is RuralModelKind => k.startsWith('rural|');

// The leaf colour (marked per vertex, taken from the instance).
const LEAF = 0x010203;
const TRUNK = 0x6a5038, TIMBER = 0x7a5f45, DARK = 0x2a2622, WHITE = 0xe8e2d6;
const P = (g: THREE.BufferGeometry, c: number, o: Tf = {}) => part(g, c, tf(o));
const box = (w: number, h: number, d: number, c: number, o: Tf = {}) => P(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, o);

// A prism along x: a gable (w along x, d across, h high), its ridge on top.
function prism(w: number, d: number, h: number, c: number, o: Tf = {}): THREE.BufferGeometry {
  const x = w / 2, z = d / 2;
  const v = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, h, 0], [x, h, 0]];
  const f = [[0, 4, 5], [0, 5, 1], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 5, 2]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(f.flatMap((t) => t.flatMap((i) => v[i]!)), 3));
  return P(g, c, o);
}
// A trapezoid (narrower at the top: the Inca doorway and niche), flat on a wall's face (+z).
function trapezoid(wb: number, wt: number, h: number, c: number, o: Tf = {}): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-wb / 2, 0, 0, wb / 2, 0, 0, wt / 2, h, 0, -wb / 2, 0, 0, wt / 2, h, 0, -wt / 2, h, 0], 3));
  return P(g, c, o);
}
// Machu Picchu's houses (cityProps.ts summit), a city cell each: dressed
// granite walls on a darker course, trapezoidal doors and niches, steep
// thatch on stone gables; and a roofless shrine with trapezoidal windows.
const GRANITE = 0xa8a294, COURSE = 0x8a8476, THATCH = 0xa88d52, RIDGE = 0x8a7240;
function incaHouse(): THREE.BufferGeometry[] {
  const w = 0.021, d = 0.014, h = 0.0075;
  const out = [box(w + 0.0016, 0.0016, d + 0.0016, COURSE), box(w, h, d, GRANITE, { y: 0.0016 })];
  // The stone gables, and the thatch over them (eaves overhanging).
  out.push(prism(w, d, 0.009, GRANITE, { y: 0.0016 + h }));
  out.push(prism(w + 0.0024, d + 0.0034, 0.0104, THATCH, { y: 0.0011 + h }), box(w + 0.0026, 0.0009, 0.0012, RIDGE, { y: 0.0011 + h + 0.0099 }));
  out.push(trapezoid(0.0042, 0.003, 0.0058, DARK, { y: 0.0016, z: d / 2 + 0.00005 }));
  for (const x of [-0.0065, 0.0065]) out.push(trapezoid(0.0022, 0.0016, 0.0028, DARK, { x, y: 0.0046, z: d / 2 + 0.00005 }));
  // Its stone pegs (the roof was lashed to them).
  for (const x of [-0.008, 0, 0.008]) out.push(box(0.0006, 0.0006, 0.0016, COURSE, { x, y: 0.0016 + h - 0.001, z: d / 2 + 0.0006 }));
  return out;
}
function incaShrine(): THREE.BufferGeometry[] {
  const w = 0.02, d = 0.016, h = 0.0105, t = 0.0022;
  const out = [box(w + 0.003, 0.0022, d + 0.003, COURSE)];
  // Three walls (open to the front), windows in the back one.
  out.push(box(w, h, t, GRANITE, { y: 0.0022, z: -d / 2 + t / 2 }), box(t, h, d, GRANITE, { x: -w / 2 + t / 2, y: 0.0022 }), box(t, h, d, GRANITE, { x: w / 2 - t / 2, y: 0.0022 }));
  for (const x of [-0.0055, 0, 0.0055]) out.push(trapezoid(0.0026, 0.0018, 0.0034, DARK, { x, y: 0.0062, z: -d / 2 + t + 0.00005 }));
  out.push(box(0.008, 0.0024, 0.0045, GRANITE, { y: 0.0022, z: -0.002 }));   // the altar stone
  return out;
}

const MODELS: Record<Exclude<RuralModel, 'crop'>, () => THREE.BufferGeometry[]> = {
  ...RESOURCE_MODELS, incaHouse, incaShrine,
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

// A tuft of a crop: three crossed cards (a unit tall and across, stretched
// per instance) showing slim stalks (propMaterial.ts: cardUv z 2, the blade
// texture), lit from above on both sides as a lawn is, all leaf (the
// instance's colour), swaying in the wind. Drawn with the flora.
const TUFT_LEAN = 0.35; // (a share of its height)
function cropTuft(): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  for (let k = 0; k < 3; k++) {
    // (Each card leans out a little, alternately, as a tuft splays: seen
    // from above it still covers its ground.)
    const a = (k * Math.PI) / 3, cx = Math.cos(a) / 2, cz = Math.sin(a) / 2, lean = (k % 2 ? 1 : -1) * TUFT_LEAN;
    for (const [s, t] of [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]] as const) { pos.push(s * cx - t * lean * Math.sin(a), t, s * cz + t * lean * Math.cos(a)); uv.push((s + 1) / 2, t, 2); }
  }
  const n = pos.length / 3, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [0, 1, 0]).flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array<number>(n * 3).fill(1), 3));
  g.setAttribute('leafMask', new THREE.Float32BufferAttribute(new Array<number>(n).fill(1), 1));
  g.setAttribute('cardUv', new THREE.Float32BufferAttribute(uv, 3));
  return g;
}
export const isFloraRural = (k: RuralModelKind): boolean => k === 'rural|crop';

const cache = new Map<RuralModelKind, THREE.BufferGeometry>();
export function ruralGeometry(kind: RuralModelKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (!g && kind === 'rural|crop') { g = cropTuft(); cache.set(kind, g); }
  if (!g) {
    const parts = MODELS[kind.slice('rural|'.length) as Exclude<RuralModel, 'crop'>]().map((p) => (p.index ? p.toNonIndexed() : p));
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
