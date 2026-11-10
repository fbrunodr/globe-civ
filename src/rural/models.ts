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
import { buildModel, burst, cone, cyl, oct, part, seg, tf, type Tf } from '../propCatalog.ts';
import { FENCE_BANDS } from '../propMaterial.ts';
import { CREATURE_SCALE } from '../creatures.ts';
import { RESOURCE_MODELS, RESOURCE_MODEL_KEYS } from './resourceModels.ts';
import { kitModel, KIT_MODELS, FIGURES, SPECIES_OF, CRAB, type KitModel } from './kit.ts';

// (The flora-drawn ones first: cards, as the trees' crowns are.)
// (The leaf-card plants: a resource's in the wild.)
export const SHRUBS = ['teaShrub', 'spiceShrub', 'cottonBush', 'indigoBush', 'wildVine', 'mulberryBush', 'incenseTree'] as const;
export type ShrubModel = (typeof SHRUBS)[number];
export const FLORA_RURAL = ['crop', 'plant', 'grainPatch', 'tallPatch', ...SHRUBS, ...FENCE_BANDS] as const;
export const RURAL_MODELS = [...FLORA_RURAL, 'heap', 'block', 'logs', 'stump', 'haystack', 'rack', 'incaHouse', 'incaHall', ...RESOURCE_MODEL_KEYS, ...KIT_MODELS] as const;
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

const MODELS: Record<Exclude<RuralModel, FloraRural>, () => THREE.BufferGeometry[]> = {
  ...RESOURCE_MODELS, incaHouse, incaHall,
  ...(Object.fromEntries(KIT_MODELS.map((k) => [k, () => kitModel(k)])) as Record<KitModel, () => THREE.BufferGeometry[]>),
  heap: () => [cone(0.018, 0.015, 7, LEAF), cone(0.009, 0.008, 6, LEAF, { x: 0.012, z: 0.006 })],
  block: () => [box(0.011, 0.0065, 0.008, LEAF), box(0.008, 0.005, 0.006, LEAF, { x: 0.004, y: 0.0065, ry: 0.3 })],
  logs: () => [[0, 0, -1], [0, 0, 0], [0, 0, 1], [1, 0, -0.5], [1, 0, 0.5], [2, 0, 0]].map(([row, , k]) => P(new THREE.CylinderGeometry(0.0022, 0.0022, 0.02, 6).rotateZ(Math.PI / 2), TIMBER, { y: 0.0022 + row! * 0.0038, z: k! * 0.0044 })),
  // (Its cut face a slice of its own trunk, so their sides line up.)
  stump: () => [cyl(0.0028, 0.0024, 0.003, 6, TRUNK), P(new THREE.CylinderGeometry(0.0024, 0.0024, 0.0002, 6), 0xc9a878, { y: 0.003 })],
  haystack: () => [cyl(0.0034, 0.0034, 0.003, 7, LEAF), cone(0.0034, 0.003, 7, LEAF, { y: 0.003 })],
  rack: () => [box(0.001, 0.009, 0.001, TIMBER, { x: -0.006 }), box(0.001, 0.009, 0.001, TIMBER, { x: 0.006 }), box(0.0135, 0.0008, 0.0008, TIMBER, { y: 0.0085 }), box(0.011, 0.005, 0.0004, WHITE, { y: 0.003 })],
};

// A tuft of a crop: two crossed cards (a unit tall and across, stretched
// per instance) showing slim stalks (propMaterial.ts: cardUv z 2, the blade
// texture), lit from above on both sides as a lawn is, all leaf (the
// instance's colour), swaying in the wind. Drawn with the flora. A
// plantation's (`lean` small) stand up straighter, in tidier rows.
type FloraRural = (typeof FLORA_RURAL)[number];
function tuft(lean: number, at: readonly [number, number] = [0, 0], size = 1, height = 1, turn = 0): { pos: number[]; uv: number[] } {
  const pos: number[] = [], uv: number[] = [];
  for (let k = 0; k < 2; k++) {
    // (Each card leans out a little, alternately, as a tuft splays: seen
    // from above it still covers its ground.)
    const a = turn + (k * Math.PI) / 2, cx = Math.cos(a) / 2, cz = Math.sin(a) / 2, l = (k % 2 ? 1 : -1) * lean;
    for (const [s, t] of [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]] as const) {
      pos.push(at[0] + size * (s * cx - t * l * Math.sin(a)), t * height, at[1] + size * (s * cz + t * l * Math.cos(a)));
      uv.push((s + 1) / 2, t, 2);
    }
  }
  return { pos, uv };
}
// A card geometry: all leaf, lit from above, its cards' coordinates.
function cards(pos: number[], uv: number[], leaf = 1): THREE.BufferGeometry {
  const n = pos.length / 3, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [0, 1, 0]).flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array<number>(n * 3).fill(1), 3));
  g.setAttribute('leafMask', new THREE.Float32BufferAttribute(new Array<number>(n).fill(leaf), 1));
  g.setAttribute('cardUv', new THREE.Float32BufferAttribute(uv, 3));
  g.setAttribute('leafShade', new THREE.Float32BufferAttribute(new Array<number>(n).fill(0), 1));
  return g;
}
// A wild stand of grain (the resource, unworked): a patch of tufts as a
// farm's (a unit across, its tufts PATCH_TUFT of it, `tall` high), lower
// toward its edge.
const PATCH_TUFT = 0.22;
function patch(n: number, salt: number, tall: number): THREE.BufferGeometry {
  let h = salt;
  const rand = () => { h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return (h >>> 8) / 16777216; };
  const pos: number[] = [], uv: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, r = 0.5 * Math.sqrt((i + 0.5) / n), t = tuft(0.3, [Math.cos(a) * r, Math.sin(a) * r], PATCH_TUFT * (0.85 + 0.3 * rand()), tall * (1 - 0.35 * (r / 0.5) ** 2) * (0.85 + 0.3 * rand()), rand() * Math.PI);
    pos.push(...t.pos); uv.push(...t.uv);
  }
  return cards(pos, uv);
}
// A bay of fence along x, a unit long (instances stretch it, and shear it
// so it runs from post to post on the ground: cityProps.ts), 1.2 m tall:
// one card, its posts and rails or wattle drawn on it (propMaterial.ts
// fenceTexture, z 5, a bay to a unit of the texture), weathered wood's
// light grey-brown. Lit as if facing up a little (the ground's light), so
// it reads the same from either side.
function fenceCard(kind: (typeof FENCE_BANDS)[number]): THREE.BufferGeometry {
  const b = FENCE_BANDS.indexOf(kind), v0 = (b * 42) / 128, v1 = ((b + 1) * 42 - 1) / 128, h = 1.2 * CREATURE_SCALE, w = 0.5 * CREATURE_SCALE;
  const pos: number[] = [], uv: number[] = [];
  for (const [s, t] of [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]] as const) { pos.push(s * w, t * h, 0); uv.push((s + 1) / 2, t ? v1 : v0, 5); }
  const g = cards(pos, uv, 0), col = g.getAttribute('color') as THREE.BufferAttribute, c = new THREE.Color(kind === 'wire' ? 0xa49482 : kind === 'rails' ? 0xab8e68 : 0xb09468);
  for (let i = 0; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 0.8, 0.6]).flat(), 3));
  return g;
}
// The wild plants, of leaf cards (the trees' crowns' way: propCatalog.ts),
// metres, in tile steps: a tea bush, round and clipped; a spice bush and a
// cotton bush, an indigo bush, a vine over a bush, their berries, bolls,
// flowers and grapes in bursts on the crown; a mulberry and an incense
// tree on their trunks. Leaves the instance's colour.
const shrub = (name: string, build: (leaf: number) => THREE.BufferGeometry[]): THREE.BufferGeometry =>
  buildModel({ layer: 'Understory', leaf: 0xffffff, build: (p) => build(p.leaf) }, name).scale(CREATURE_SCALE, CREATURE_SCALE, CREATURE_SCALE);
// Bursts of `color` on a crown (an ellipsoid at c, radii r), on its upper
// side and round it, half sunk in its leaves.
function bursts(n: number, c: readonly [number, number, number], r: readonly [number, number, number], size: number, color: number): THREE.BufferGeometry[] {
  return Array.from({ length: n }, (_, i) => {
    const a = i * 2.39996, e = 0.6 - 0.9 * ((i + 0.5) / n);
    return burst(size, color, { x: c[0] + 0.85 * r[0] * Math.cos(a) * Math.cos(e), y: c[1] + 0.85 * r[1] * Math.sin(e), z: c[2] + 0.85 * r[2] * Math.sin(a) * Math.cos(e) });
  });
}
const trunk = (pts: readonly (readonly [number, number, number])[], r0: number, r1: number, color: number) =>
  pts.slice(0, -1).map((p, i) => seg(new THREE.Vector3(...p), new THREE.Vector3(...pts[i + 1]!), r0 + ((r1 - r0) * i) / (pts.length - 1), r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1), 4, color));
const BARK = 0x5a4632;
const SHRUB_MODELS: Record<ShrubModel, () => THREE.BufferGeometry> = {
  teaShrub: () => shrub('teaShrub', (leaf) => [cyl(0.05, 0.04, 0.3, 4, BARK),
    oct(0.55, leaf, { y: 0.6, sy: 0.62 }), oct(0.4, leaf, { x: 0.42, y: 0.5, z: 0.15, sy: 0.6, ry: 0.5 }), oct(0.38, leaf, { x: -0.36, y: 0.48, z: -0.2, sy: 0.6, ry: 1.1 })]),
  spiceShrub: () => shrub('spiceShrub', (leaf) => [cyl(0.04, 0.03, 0.3, 4, BARK),
    oct(0.52, leaf, { y: 0.66, sy: 0.85 }), oct(0.38, leaf, { x: 0.32, y: 0.48, z: 0.2, sy: 0.8, ry: 0.4 }), ...bursts(6, [0, 0.66, 0], [0.44, 0.38, 0.44], 0.1, 0xb8402a)]),
  cottonBush: () => shrub('cottonBush', (leaf) => [cyl(0.03, 0.025, 0.45, 4, BARK),
    oct(0.48, leaf, { y: 0.75, sy: 0.9 }), ...bursts(9, [0, 0.75, 0], [0.4, 0.4, 0.4], 0.09, 0xf2eee4)]),
  indigoBush: () => shrub('indigoBush', (leaf) => [cyl(0.03, 0.02, 0.35, 4, BARK),
    oct(0.48, leaf, { y: 0.62, sy: 0.85 }), ...bursts(6, [0, 0.62, 0], [0.4, 0.38, 0.4], 0.08, 0x6a4a9a)]),
  wildVine: () => shrub('wildVine', (leaf) => [oct(1.0, leaf, { y: 0.85, sy: 0.85 }), oct(0.65, leaf, { x: 0.3, y: 1.45, z: 0.2, sy: 0.7, ry: 0.6 }),
    ...bursts(6, [0, 0.85, 0], [0.85, 0.72, 0.85], 0.12, 0x4a2a5a)]),
  // (Its trunk runs up into its crown.)
  mulberryBush: () => shrub('mulberryBush', (leaf) => [...trunk([[0, 0, 0], [0.05, 0.7, 0], [0, 1.5, 0]], 0.1, 0.06, 0x6a5038),
    oct(0.9, leaf, { y: 1.55, sy: 0.62 }), oct(0.55, leaf, { x: 0.5, y: 1.35, z: 0.3, sy: 0.6, ry: 0.7 })]),
  incenseTree: () => shrub('incenseTree', (leaf) => [...trunk([[0, 0, 0], [0.2, 0.8, 0], [0, 1.4, 0.1]], 0.16, 0.1, 0x8a7a64),
    ...trunk([[0, 1.3, 0.1], [-0.5, 1.9, 0.1], [-0.8, 2.2, 0.2]], 0.08, 0.04, 0x8a7a64), ...trunk([[0, 1.3, 0.1], [0.5, 2.0, -0.1], [0.7, 2.2, -0.2]], 0.08, 0.04, 0x8a7a64),
    oct(0.62, leaf, { x: -0.8, y: 2.35, z: 0.2, sy: 0.5 }), oct(0.58, leaf, { x: 0.7, y: 2.38, z: -0.2, sy: 0.5, ry: 0.5 })]),
};
const FLORA_MODELS: Record<FloraRural, () => THREE.BufferGeometry> = {
  crop: () => { const t = tuft(0.35); return cards(t.pos, t.uv); },
  plant: () => { const t = tuft(0.1); return cards(t.pos, t.uv); },
  grainPatch: () => patch(18, 0x9a1, 0.4), tallPatch: () => patch(12, 0x7a3, 0.62),
  ...SHRUB_MODELS,
  wattle: () => fenceCard('wattle'), rails: () => fenceCard('rails'), wire: () => fenceCard('wire'),
};
const FLORA_SET: ReadonlySet<string> = new Set(FLORA_RURAL);
export const isFloraRural = (k: RuralModelKind): boolean => FLORA_SET.has(k.slice('rural|'.length));
// (Of those, the stalks: crops, plantations' plants, wild grain. They shrink away from afar.)
export const isCropRural = (k: RuralModelKind): boolean => k === 'rural|crop' || k === 'rural|plant' || k === 'rural|grainPatch' || k === 'rural|tallPatch';
// The kit's models are round (people, animals, plants): smooth-shaded.
const KIT_SET: ReadonlySet<string> = new Set(KIT_MODELS);
export const isSmoothRural = (k: RuralModelKind): boolean => KIT_SET.has(k.slice('rural|'.length));

// The beasts walk a loop of ROAM_BEAST metres' radius, the people a smaller
// one (model units); all else stands still (a cart or a plough team would
// drive through what stands by it). Their whole loop lies within twice
// that of where they stand: rural/layout.ts keeps that clear.
const ROAM_BEAST = 1.1 * CREATURE_SCALE, ROAM_PERSON = 0.6 * CREATURE_SCALE;
export const roamOf = (m: string): number => (SPECIES_OF[m as KitModel] || swims(m) ? ROAM_BEAST : FIGURES.has(m as KitModel) && m !== 'ploughTeam' && m !== 'haycart' ? ROAM_PERSON : 0);
// Swimmers (the material's `roam` negative for them: they never stop):
// their pace (their loop's time against a shoal's: a tuna's quicker, a
// whale's slower), whether they dive and come up for air (a whale: its
// back breaks the water now and then), how far they wander (tile steps).
// (`turns`: it goes round where it stands, not off about its water: the
// crabs round their rock, which stays: only the parts of the crab colour move.)
const SWIM: Partial<Record<KitModel, { pace: number; dives: boolean; wander: number; turns?: true }>> = {
  salmonShoal: { pace: 1, dives: false, wander: 0.12 }, troutShoal: { pace: 1.1, dives: false, wander: 0.1 },
  tunaShoal: { pace: 0.6, dives: false, wander: 0.15 }, whale: { pace: 2.2, dives: true, wander: 0.22 },
  crabRock: { pace: 1.4, dives: false, wander: 0, turns: true },
};
const swims = (m: string): boolean => SWIM[m as KitModel] !== undefined;
// (How far a diver rises to breathe: a share of its height.)
const DIVE = 0.25;
// Given room, a walker wanders further: from one spot to the next within a
// circle round where it stands (the material's `wander`), as large as fits
// (wanderIn): beasts over a good part of their pasture, people about their
// work, fish about their water. At most this far (tile steps).
const WANDER_BEAST = 0.14, WANDER_PERSON = 0.07;
export const wanderMax = (m: string): number => SWIM[m as KitModel]?.wander ?? (SPECIES_OF[m as KitModel] ? WANDER_BEAST : roamOf(m) ? WANDER_PERSON : 0);
// The largest circle round p (tile steps), up to `max`, that `ok` holds all
// over (checked round its rim and halfway in); 0 if none does (it walks its
// small loop: roamOf).
export function wanderIn(p: { readonly x: number; readonly y: number }, max: number, ok: (q: { x: number; y: number }) => boolean): number {
  for (let r = max; max > 0 && r >= max * 0.2; r *= 0.75) {
    let fits = true;
    for (let j = 0; fits && j < 16; j++) {
      const a = (j / 8) * Math.PI, d = j % 2 ? r / 2 : r;
      fits = ok({ x: p.x + d * Math.cos(a), y: p.y + d * Math.sin(a) });
    }
    if (fits) return r;
  }
  return 0;
}
// How a walker's legs swing (the material's `gait`: per vertex, how far
// below the hips, model units, and which leg: +1 or -1). A person's legs
// are its two sides; a beast's go in diagonal pairs, as at a walk. A
// swimmer's: its pace and how far it rises to breathe (SWIM; model units).
function gaitOf(g: THREE.BufferGeometry, m: string): Float32Array {
  const pos = g.getAttribute('position'), out = new Float32Array(pos.count * 2);
  const swim = SWIM[m as KitModel];
  if (swim) {
    g.computeBoundingBox();
    // (gait.y: how far it rises to breathe; negative: it turns where it stands.)
    const rise = swim.turns ? -1 : swim.dives ? DIVE * (g.boundingBox!.max.y - g.boundingBox!.min.y) : 0;
    for (let i = 0; i < pos.count; i++) { out[i * 2] = swim.pace; out[i * 2 + 1] = rise; }
    return out;
  }
  if (!roamOf(m)) return out;
  g.computeBoundingBox();
  const b = g.boundingBox!, beast = !!SPECIES_OF[m as KitModel];
  const hip = b.min.y + (b.max.y - b.min.y) * (beast ? 0.42 : 0.5), mx = (b.min.x + b.max.x) / 2, half = (b.max.x - b.min.x) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // (A beast's head, down to graze, swings not: only what is under its body.)
    if (y >= hip || (beast && Math.abs(x - mx) > half * 0.7)) continue;
    out[i * 2] = hip - y;
    out[i * 2 + 1] = (z >= 0 ? 1 : -1) * (beast ? (x >= mx ? 1 : -1) : 1);
  }
  return out;
}
const cache = new Map<RuralModelKind, THREE.BufferGeometry>();
export function ruralGeometry(kind: RuralModelKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  const m = kind.slice('rural|'.length);
  if (!g && FLORA_SET.has(m)) { g = FLORA_MODELS[m as FloraRural](); cache.set(kind, g); }
  if (!g) {
    // Each part unindexed, with its normals (a round part keeps its smooth
    // ones) and its leaf mask: given (the kit's), or the parts painted LEAF,
    // which then turn white (the instance's colour shows through).
    const probe = new THREE.Color(LEAF);
    const parts = MODELS[m as Exclude<RuralModel, FloraRural>]().map((p0) => {
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
  // (How far it roams: its walk's radius, the material's `roam`; negative for a swimmer.)
  if (!g.getAttribute('roam')) {
    const roam = new Float32Array(g.getAttribute('position').count).fill(roamOf(m) * (swims(m) ? -1 : 1));
    // (Of a turner, only the crabs move: their colour.)
    if (SWIM[m as KitModel]?.turns) {
      const col = g.getAttribute('color'), crab = new THREE.Color(CRAB);
      for (let i = 0; i < roam.length; i++) if (Math.abs(col.getX(i) - crab.r) + Math.abs(col.getY(i) - crab.g) + Math.abs(col.getZ(i) - crab.b) > 1e-3) roam[i] = 0;
    }
    g.setAttribute('roam', new THREE.Float32BufferAttribute(roam, 1));
    g.setAttribute('gait', new THREE.Float32BufferAttribute(gaitOf(g, m), 2));
  }
  return g;
}
// What of a model meets the ground (tile steps a model unit): the box of its
// parts near its foot (in the lowest eighth of its height), x and z. Its
// footing on a slope is judged on this, not on what it holds up overhead (a
// windpump's wheel and vane, a headframe's sheave): cityProps.ts,
// rural/layout.ts.
export interface Footing { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
const footings = new Map<RuralModelKind, Footing>();
export function footingOf(kind: RuralModelKind): Footing {
  let f = footings.get(kind);
  if (!f) {
    const pos = ruralGeometry(kind).getAttribute('position');
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)); }
    const top = y0 + (y1 - y0) / 8;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > top) continue;
      x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i)); z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i));
    }
    f = { x0, x1, z0, z1 };
    footings.set(kind, f);
  }
  return f;
}
