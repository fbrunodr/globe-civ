import * as THREE from 'three';
import { buildModel, cone, cyl, part, seg, tf, V, type Palette, type Tf } from './propCatalog.ts';

// City models: houses, rural structures, quarter buildings and wonders,
// drawn as instanced props like the flora (render.ts) and shown in the prop
// gallery. Same rules as the flora catalog: low-poly primitives, no hidden
// faces, per-vertex colors; the roof is the "leaf" part so each instance can
// get its own roof color (terracotta, slate, thatch). Sizes are for the
// reference tile (edge 0.07) before the prop scale: a cottage is about a
// quarter of a fir's height.
//
// Materials are realistic and muted: buildings are told apart by their
// shapes, never by bright colors.

export interface BuildingEntry {
  name: string;
  leaf: number; // roof
  accent?: number;
  water?: 'float' | 'shore'; // float: on the water surface (boats); shore: on land or in shallow water
  build: (p: Palette) => THREE.BufferGeometry[];
}

const PLASTER = 0xcfc2a8;
const STONE = 0xb8b0a0;
const DARK_STONE = 0x8d877c;
const TIMBER = 0x7a5f45;
const BRICK = 0x9a6a55;
const MARBLE = 0xd8d2c4;
const IRON = 0x4a4744;

// Four walls (open box: no floor, the roof covers the top), w along x, d along z.
function walls(w: number, d: number, h: number, color: number, o: Tf = {}): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w, h, d);
  return part(g, color, tf(o));
}

// A closed block (walls and a flat top).
function block(w: number, d: number, h: number, color: number, o: Tf = {}): THREE.BufferGeometry[] {
  return [walls(w, d, h, color, o), flat(w, d, color, { ...o, y: (o.y ?? 0) + h })];
}

// A flat roof or slab at height 0.
function flat(w: number, d: number, color: number, o: Tf = {}): THREE.BufferGeometry {
  return part(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), color, tf(o));
}

// A gable roof over w × d with its ridge along x, h high (6 triangles).
function gable(w: number, d: number, h: number, color: number, o: Tf = {}): THREE.BufferGeometry {
  const x = w / 2, z = d / 2;
  const p = [
    -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0, // front slope
    x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0, // back slope
    -x, 0, -z, -x, 0, z, -x, h, 0, // gables
    x, 0, z, x, 0, -z, x, h, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return part(g, color, tf(o));
}

// A hipped (pyramid) roof over w × d, h high (4 triangles).
function hip(w: number, d: number, h: number, color: number, o: Tf = {}): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w, h, d);
  return part(g, color, tf(o));
}

// A dome (half sphere) of radius r, 6 × 2 faces (18 triangles).
function dome(r: number, color: number, o: Tf = {}): THREE.BufferGeometry {
  return part(new THREE.SphereGeometry(r, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2), color, tf(o));
}

// A column (3-sided, 6 triangles).
const column = (h: number, r: number, color: number, o: Tf = {}) => cyl(r, r * 0.85, h, 3, color, o);

// A house: walls plus a gable roof with a small overhang.
function house(w: number, d: number, h: number, roofH: number, wall: number, roof: number, o: Tf = {}): THREE.BufferGeometry[] {
  return [walls(w, d, h, wall, o), gable(w * 1.08, d * 1.18, roofH, roof, { ...o, y: (o.y ?? 0) + h })];
}

export const BUILDINGS_CATALOG = {
  // ---------- houses ----------
  cottage: { name: 'Cottage', leaf: 0x8a5a44, build: (p) => house(0.0045, 0.0032, 0.0026, 0.0017, PLASTER, p.leaf) },
  longhouse: { name: 'Long house', leaf: 0x7d5a48, build: (p) => house(0.0072, 0.0033, 0.0024, 0.0017, 0xc4b498, p.leaf) },
  townhouse: { name: 'Town house', leaf: 0x6a5a55, build: (p) => house(0.0038, 0.0036, 0.0052, 0.0019, 0xd6cab2, p.leaf) },
  cornerHouse: { name: 'Corner house', leaf: 0x86564a, build: (p) => [
    ...house(0.0046, 0.0034, 0.0034, 0.0017, 0xcbbd9f, p.leaf),
    ...house(0.0034, 0.003, 0.0026, 0.0015, 0xcbbd9f, p.leaf, { x: 0.0006, z: 0.0028, ry: Math.PI / 2 }),
  ] },
  hut: { name: 'Hut', leaf: 0xa08a5a, build: (p) => [
    cyl(0.0019, 0.0019, 0.0018, 6, 0xa58d6c),
    cone(0.0024, 0.0022, 6, p.leaf, { y: 0.0018 }),
  ] },
  // ---------- city center ----------
  hall: { name: 'City hall', leaf: 0x5f5650, build: (p) => [
    walls(0.011, 0.0075, 0.0055, STONE),
    hip(0.0118, 0.0083, 0.0032, p.leaf, { y: 0.0055 }),
    ...block(0.0032, 0.0032, 0.011, STONE, { x: -0.0035 }),
    hip(0.0036, 0.0036, 0.0045, p.leaf, { x: -0.0035, y: 0.011 }),
  ] },
  // ---------- rural ----------
  farmstead: { name: 'Farmstead', leaf: 0x8a5a44, build: (p) => [
    ...house(0.0042, 0.003, 0.0024, 0.0016, PLASTER, p.leaf),
    ...house(0.0056, 0.0034, 0.0028, 0.002, TIMBER, 0x6a5a48, { x: 0.0004, z: -0.0048 }),
  ] },
  mineHead: { name: 'Mine head', leaf: 0x5a4a3a, build: (p) => [
    seg(V(-0.0016, 0, -0.0012), V(0, 0.0085, 0), 0.00035, 0.00025, 3, TIMBER),
    seg(V(0.0016, 0, -0.0012), V(0, 0.0085, 0), 0.00035, 0.00025, 3, TIMBER),
    seg(V(0, 0, 0.0018), V(0, 0.0085, 0), 0.00035, 0.00025, 3, TIMBER),
    ...house(0.0036, 0.0028, 0.0022, 0.0013, TIMBER, p.leaf, { x: 0.0045, z: 0.001 }),
    cone(0.0035, 0.0022, 6, 0x6e6458, { x: -0.0045, z: 0.0025 }),
  ] },
  quarryStones: { name: 'Quarry stones', leaf: STONE, build: (p) => [
    ...block(0.0034, 0.0024, 0.0016, p.leaf),
    ...block(0.0024, 0.002, 0.0011, p.leaf, { x: 0.0034, z: 0.0012, ry: 0.4 }),
    ...block(0.002, 0.0018, 0.0022, DARK_STONE, { x: -0.001, z: 0.0034, ry: 0.9 }),
  ] },
  lodge: { name: 'Hunting lodge', leaf: 0x5f6a48, build: (p) => [
    ...house(0.0046, 0.0032, 0.0022, 0.0019, TIMBER, p.leaf),
    cyl(0.0003, 0.0003, 0.0018, 3, 0x6a5038, { x: 0.004, z: 0.002, rz: 1.4 }),
  ] },
  stiltHut: { name: 'Stilt hut', leaf: 0xa89260, build: (p) => [
    cyl(0.0003, 0.0003, 0.0016, 3, TIMBER, { x: -0.0012, z: -0.001 }),
    cyl(0.0003, 0.0003, 0.0016, 3, TIMBER, { x: 0.0012, z: 0.001 }),
    ...house(0.0034, 0.0028, 0.0016, 0.0016, 0x9a805c, p.leaf, { y: 0.0016 }),
  ] },
  // ---------- signature buildings (one per building, cities.ts BUILDINGS) ----------
  library: { name: 'Library', leaf: 0x7f8a86, build: (p) => [
    walls(0.0085, 0.0065, 0.0042, STONE), flat(0.0085, 0.0065, STONE, { y: 0.0042 }),
    dome(0.0028, p.leaf, { y: 0.0042 }),
  ] },
  academy: { name: 'Academy', leaf: 0x8a5a44, build: (p) => [
    walls(0.0075, 0.0045, 0.0042, MARBLE, { z: -0.0012 }),
    gable(0.0092, 0.0078, 0.0024, p.leaf, { y: 0.0042 }),
    ...[-0.0033, -0.0011, 0.0011, 0.0033].map((x) => column(0.0042, 0.00035, MARBLE, { x, z: 0.0028 })),
  ] },
  market: { name: 'Market hall', leaf: 0x86564a, build: (p) => [
    gable(0.0105, 0.0062, 0.0022, p.leaf, { y: 0.0034 }),
    ...[[-0.0045, -0.0024], [0.0045, -0.0024], [-0.0045, 0.0024], [0.0045, 0.0024]].map(([x, z]) => column(0.0034, 0.0003, TIMBER, { x, z })),
    flat(0.0034, 0.0022, 0xb08a5a, { x: -0.006, z: 0.004, y: 0.0016 }),
    flat(0.0034, 0.0022, 0x8a9a6a, { x: 0.006, z: -0.004, y: 0.0016 }),
  ] },
  countingHouse: { name: 'Counting house', leaf: 0x5f5a58, build: (p) => [
    walls(0.0058, 0.0052, 0.0072, 0xc9bca2), hip(0.0062, 0.0056, 0.0026, p.leaf, { y: 0.0072 }),
    ...house(0.0046, 0.0036, 0.0042, 0.0018, 0xc9bca2, p.leaf, { x: 0.0052 }),
  ] },
  workshop: { name: 'Workshop', leaf: 0x6a5a50, build: (p) => [
    ...house(0.0085, 0.0055, 0.0034, 0.002, BRICK, p.leaf),
    cyl(0.0007, 0.0006, 0.0085, 4, BRICK, { x: 0.0032, z: -0.0012 }),
  ] },
  smithy: { name: 'Smithy', leaf: 0x55504c, build: (p) => [
    ...house(0.0068, 0.005, 0.0028, 0.0018, DARK_STONE, p.leaf),
    cyl(0.0011, 0.0008, 0.0075, 4, DARK_STONE, { x: -0.0028 }),
    ...block(0.0016, 0.001, 0.0012, IRON, { x: 0.0052, z: 0.002 }),
  ] },
  lighthouse: { name: 'Lighthouse', leaf: 0x7a4a3a, water: 'shore', build: (p) => [
    cone(0.0042, 0.0024, 6, DARK_STONE),
    cyl(0.0021, 0.0014, 0.0125, 6, MARBLE, { y: 0.0016 }),
    cyl(0.0014, 0.0014, 0.0018, 6, 0xf3e3a8, { y: 0.0141 }),
    cone(0.0018, 0.0022, 6, p.leaf, { y: 0.0159 }),
  ] },
  shipyard: { name: 'Shipyard', leaf: 0x6a4a32, water: 'float', build: (p) => [
    flat(0.012, 0.0055, TIMBER, { y: 0.0004 }),
    part(new THREE.ConeGeometry(0.0018, 0.0095, 4, 1, true).rotateZ(Math.PI / 2).scale(1, 0.6, 1), p.leaf, tf({ y: 0.0012 })),
    seg(V(-0.005, 0.0004, -0.0022), V(-0.005, 0.0105, -0.0022), 0.00025, 0.0002, 3, IRON),
    seg(V(-0.005, 0.0105, -0.0022), V(0.002, 0.0098, -0.0022), 0.0002, 0.00015, 3, IRON),
  ] },
  shrine: { name: 'Shrine', leaf: 0x7a5a48, build: (p) => [
    walls(0.0042, 0.0042, 0.0032, STONE), hip(0.0052, 0.0052, 0.0028, p.leaf, { y: 0.0032 }),
    cone(0.0005, 0.0018, 4, 0xcfb06a, { y: 0.006 }),
  ] },
  temple: { name: 'Temple', leaf: 0x8a6a55, build: (p) => [
    walls(0.006, 0.0085, 0.0048, MARBLE),
    gable(0.0085, 0.0112, 0.0024, p.leaf, { y: 0.0048, ry: Math.PI / 2 }),
    ...[-0.0028, 0.0028].flatMap((x) => [0.0044, -0.0044].map((z) => column(0.0048, 0.0004, MARBLE, { x: x * 1.25, z: z * 1.15 }))),
  ] },
  amphitheater: { name: 'Amphitheater', leaf: 0xb8a88a, build: (p) => [
    part(new THREE.CylinderGeometry(0.0078, 0.0058, 0.0026, 8, 1, true, 0, Math.PI), p.leaf, tf({ y: 0.0013 })),
    part(new THREE.CylinderGeometry(0.0058, 0.0042, 0.0016, 8, 1, true, 0, Math.PI), STONE, tf({ y: 0.0008 })),
  ] },
  odeon: { name: 'Odeon', leaf: 0x6f6660, build: (p) => [
    cyl(0.0048, 0.0048, 0.0045, 8, MARBLE),
    cone(0.0055, 0.0028, 8, p.leaf, { y: 0.0045 }),
  ] },
  barracks: { name: 'Barracks', leaf: 0x5f5650, build: (p) => [
    ...house(0.0105, 0.0042, 0.0032, 0.0018, STONE, p.leaf, { z: -0.002 }),
    cyl(0.0085, 0.0085, 0.0014, 6, DARK_STONE),
  ] },
  stable: { name: 'Stable', leaf: 0x7a6a50, build: (p) => [
    ...house(0.0095, 0.0045, 0.0026, 0.0019, TIMBER, p.leaf),
    ...[-0.004, 0, 0.004].map((x) => column(0.0012, 0.00022, TIMBER, { x, z: 0.0055 })),
  ] },
  granary: { name: 'Granary', leaf: 0xa08a5a, build: (p) => [
    cyl(0.0022, 0.0022, 0.0055, 6, 0xc9b896, { x: -0.0024 }), cone(0.0026, 0.0024, 6, p.leaf, { x: -0.0024, y: 0.0055 }),
    cyl(0.0019, 0.0019, 0.0045, 6, 0xc9b896, { x: 0.0024 }), cone(0.0023, 0.0021, 6, p.leaf, { x: 0.0024, y: 0.0045 }),
  ] },
  monument: { name: 'Monument', leaf: MARBLE, build: (p) => [
    ...block(0.0034, 0.0034, 0.0012, DARK_STONE),
    cone(0.0012, 0.0115, 4, p.leaf, { y: 0.0012, ry: Math.PI / 4 }),
  ] },
  waterMill: { name: 'Water mill', leaf: 0x7a5a48, build: (p) => [
    ...house(0.0058, 0.0046, 0.0034, 0.002, STONE, p.leaf),
    part(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0008, 8, 1, true).rotateX(Math.PI / 2), TIMBER, tf({ y: 0.0024, z: 0.0029 })),
  ] },
  aqueduct: { name: 'Aqueduct', leaf: 0xbcae96, build: (p) => [
    ...[-0.0055, 0, 0.0055].map((x) => walls(0.0014, 0.0014, 0.0068, p.leaf, { x })),
    ...block(0.0135, 0.0018, 0.0012, p.leaf, { y: 0.0068 }),
  ] },
  // ---------- walls (around the center) ----------
  wallSegment: { name: 'Wall segment', leaf: 0xa49c8c, build: (p) => block(0.01, 0.0016, 0.0042, p.leaf) },
  wallTower: { name: 'Wall tower', leaf: 0x6a625a, build: (p) => [
    cyl(0.0022, 0.0022, 0.0062, 6, 0xa49c8c), cone(0.0027, 0.0028, 6, p.leaf, { y: 0.0062 }),
  ] },
  fishingBoat: { name: 'Fishing boat', leaf: 0xe6dfcf, water: 'float', build: (p) => [
    part(new THREE.ConeGeometry(0.0012, 0.0062, 4, 1, true).rotateZ(Math.PI / 2).scale(1, 0.55, 1), 0x6a4a32, tf({ y: 0.0003 })),
    cyl(0.00012, 0.00012, 0.0048, 3, TIMBER),
    part(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.0012, 0, 0, 0.0047, 0, 0.0026, 0.0012, 0], 3)), p.leaf, tf({ x: 0.0002 })),
  ] },
} satisfies Record<string, BuildingEntry>;

export type BuildingKind = keyof typeof BUILDINGS_CATALOG;
export const BUILDING_KINDS = Object.keys(BUILDINGS_CATALOG) as BuildingKind[];
export const buildingEntry = (k: BuildingKind): BuildingEntry => BUILDINGS_CATALOG[k];

export const buildBuildingGeometry = (kind: BuildingKind, palette?: Partial<Palette>): THREE.BufferGeometry =>
  buildModel(BUILDINGS_CATALOG[kind], kind, palette);

// Roof colors by roof kind: an instance picks one (muted, realistic).
export const ROOFS = {
  terracotta: [0x8a5a44, 0x96604a, 0x7e5242, 0x9a6a52],
  slate: [0x5a5a5e, 0x63605c, 0x55524f],
  thatch: [0xa08a5a, 0x9a8458, 0x8f7c55],
} as const;
