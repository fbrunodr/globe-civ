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
import { kitModel, KIT_MODELS, type KitModel } from './kit.ts';

export const RURAL_MODELS = ['crop', 'heap', 'block', 'logs', 'stump', 'haystack', 'rack', 'incaHouse', 'incaHall', ...RESOURCE_MODEL_KEYS, ...KIT_MODELS] as const;
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
// Machu Picchu's houses (cityProps.ts summit), a city cell each, as the
// Inca built them: walls of dressed granite, battered (leaning in) on a
// darker footing course; stone gables rising at both ends past a thick
// thatch laid between them, its eaves over the long walls; trapezoidal
// doors under a stone lintel, trapezoidal niches, and the stone pegs the
// roof was lashed to jutting from the gables. Two plans: the house, its
// door on a long side; the hall, longer, its door in a gable end.
const GRANITE = 0xb2ac9e, COURSE = 0x8e887b, LINTEL = 0xc4beb0, THATCH = 0xb0954f, THATCH_DARK = 0x8c7438;
// A battered block: w by d at the foot, `inset` narrower each side at the top.
function battered(w: number, h: number, d: number, inset: number, c: number, o: Tf = {}): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > h / 2) {
    pos.setX(i, pos.getX(i) * (w - 2 * inset) / w);
    pos.setZ(i, pos.getZ(i) * (d - 2 * inset) / d);
  }
  return P(g, c, o);
}
// One Inca house of w by d (walls h, gables rising gh more); the door on
// the long side (+z), or in the gable end (+x).
function incaBuilding(w: number, d: number, h: number, gh: number, doorInGable: boolean): THREE.BufferGeometry[] {
  const foot = 0.0014, inset = 0.0006, t = 0.0018, top = foot + h;
  const wt = w - 2 * inset, dt = d - 2 * inset;     // the walls' top
  const out = [box(w + 0.0018, foot, d + 0.0018, COURSE), battered(w, h, d, inset, GRANITE, { y: foot })];
  // The gables: stone triangles on the end walls, a little proud of the thatch.
  for (const x of [-wt / 2 + t / 2, wt / 2 - t / 2]) out.push(prism(t, dt, gh + 0.0006, GRANITE, { x, y: top }));
  // The thatch, thick, between the gables, its eaves out past the long walls.
  const eave = 0.0022, slope = gh / (dt / 2);
  out.push(prism(wt - 2 * t, dt + 2 * eave, gh + eave * slope, THATCH, { y: top - eave * slope + 0.0003 }));
  out.push(box(wt - 2 * t, 0.0008, 0.0014, THATCH_DARK, { y: top + gh - 0.0002 }));   // the ridge, bound
  // The door under its lintel, and the niches, on the battered face: built
  // on a +z face at `half` from the middle, turned to +x for a gable end.
  const lean = Math.atan2(inset, h), onFace = (y: number, half: number) => half - inset * (y - foot) / h + 0.00006;
  const openings = (half: number, door: boolean, niches: readonly number[]) => {
    const g: THREE.BufferGeometry[] = [];
    if (door) g.push(trapezoid(0.0040, 0.0028, 0.0056, DARK, { y: foot, z: onFace(foot, half), rx: -lean }), box(0.0048, 0.0009, 0.0012, LINTEL, { y: foot + 0.0056, z: onFace(foot + 0.006, half) - 0.0003 }));
    for (const x of niches) g.push(trapezoid(0.0022, 0.0016, 0.0026, DARK, { x, y: foot + 0.0032, z: onFace(foot + 0.0032, half), rx: -lean }));
    return g;
  };
  if (doorInGable) {
    out.push(...openings(w / 2, true, []).map((g) => g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2))));
    out.push(...openings(d / 2, false, [-w / 4, w / 4]));
  } else out.push(...openings(d / 2, true, [-w / 2 + 0.0045, w / 2 - 0.0045]));
  // The gables' stone pegs, in a row under the eaves line.
  for (const s of [-1, 1]) for (const z of [-dt / 4, dt / 4]) out.push(box(0.0014, 0.0007, 0.0007, COURSE, { x: s * (wt / 2 + 0.0005), y: top + gh - Math.abs(z) * slope - 0.0022, z }));
  return out;
}
const incaHouse = (): THREE.BufferGeometry[] => incaBuilding(0.020, 0.0135, 0.0098, 0.0072, false);
const incaHall = (): THREE.BufferGeometry[] => incaBuilding(0.023, 0.0125, 0.0106, 0.0068, true);

const MODELS: Record<Exclude<RuralModel, 'crop'>, () => THREE.BufferGeometry[]> = {
  ...RESOURCE_MODELS, incaHouse, incaHall,
  ...(Object.fromEntries(KIT_MODELS.map((k) => [k, () => kitModel(k)])) as Record<KitModel, () => THREE.BufferGeometry[]>),
  heap: () => [cone(0.018, 0.015, 7, LEAF), cone(0.009, 0.008, 6, LEAF, { x: 0.012, z: 0.006 })],
  block: () => [box(0.011, 0.0065, 0.008, LEAF), box(0.008, 0.005, 0.006, LEAF, { x: 0.004, y: 0.0065, ry: 0.3 })],
  logs: () => [[0, 0, -1], [0, 0, 0], [0, 0, 1], [1, 0, -0.5], [1, 0, 0.5], [2, 0, 0]].map(([row, , k]) => P(new THREE.CylinderGeometry(0.0022, 0.0022, 0.02, 6).rotateZ(Math.PI / 2), TIMBER, { y: 0.0022 + row! * 0.0038, z: k! * 0.0044 })),
  stump: () => [cyl(0.0028, 0.0024, 0.003, 6, TRUNK), P(new THREE.CircleGeometry(0.0024, 6).rotateX(-Math.PI / 2), 0xc9a878, { y: 0.0031 })],
  haystack: () => [cyl(0.0034, 0.0034, 0.003, 7, LEAF), cone(0.0034, 0.003, 7, LEAF, { y: 0.003 })],
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
// The kit's models are round (people, animals, plants): smooth-shaded.
const KIT_SET: ReadonlySet<string> = new Set(KIT_MODELS);
export const isSmoothRural = (k: RuralModelKind): boolean => KIT_SET.has(k.slice('rural|'.length));

const cache = new Map<RuralModelKind, THREE.BufferGeometry>();
export function ruralGeometry(kind: RuralModelKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (!g && kind === 'rural|crop') { g = cropTuft(); cache.set(kind, g); }
  if (!g) {
    // Each part unindexed, with its normals (a round part keeps its smooth
    // ones) and its leaf mask: given (the kit's), or the parts painted LEAF,
    // which then turn white (the instance's colour shows through).
    const probe = new THREE.Color(LEAF);
    const parts = MODELS[kind.slice('rural|'.length) as Exclude<RuralModel, 'crop'>]().map((p0) => {
      const p = p0.index ? p0.toNonIndexed() : p0;
      if (p.getAttribute('uv')) p.deleteAttribute('uv');
      if (!p.getAttribute('normal')) p.computeVertexNormals();
      if (!p.getAttribute('leafMask')) {
        const col = p.getAttribute('color'), mask = new Float32Array(col.count);
        for (let i = 0; i < col.count; i++) {
          if (Math.abs(col.getX(i) - probe.r) + Math.abs(col.getY(i) - probe.g) + Math.abs(col.getZ(i) - probe.b) > 1e-4) continue;
          mask[i] = 1;
          col.setXYZ(i, 1, 1, 1);
        }
        p.setAttribute('leafMask', new THREE.BufferAttribute(mask, 1));
      }
      return p;
    });
    g = mergeGeometries(parts)!;
    if (!g) throw new Error(`rural model ${kind}`);
    for (const p of parts) p.dispose();
    cache.set(kind, g);
  }
  return g;
}
