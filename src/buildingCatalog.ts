import * as THREE from 'three';
import { CATALOG, buildCatalogGeometry, buildModel, cone, cyl, part, seg, tf, V, type CatalogKind, type Palette, type Tf } from './propCatalog.ts';
import { houseGeometry, isHouseKind, type HouseKind } from './houses.ts';
import { isWonderModelKind, wonderGeometry, type WonderModelKind } from './wonderModels.ts';
import { isRuralModelKind, ruralGeometry, type RuralModelKind } from './rural/models.ts';

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


// A house: walls plus a gable roof with a small overhang.
function house(w: number, d: number, h: number, roofH: number, wall: number, roof: number, o: Tf = {}): THREE.BufferGeometry[] {
  return [walls(w, d, h, wall, o), gable(w * 1.08, d * 1.18, roofH, roof, { ...o, y: (o.y ?? 0) + h })];
}

export const BUILDINGS_CATALOG = {
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
  // ---------- Machu Picchu (on its summit, a wild tile), and a wonder's scaffolding ----------
  machuPicchu: { name: 'Machu Picchu', leaf: 0x7a7468, build: (p) => [
    walls(0.006, 0.0045, 0.0035, 0xa49e8e, { x: -0.003 }), hip(0.0068, 0.0052, 0.0032, p.leaf, { x: -0.003, y: 0.0035 }),
    ...[[0.006, -0.005], [0.007, 0.004], [-0.007, 0.006], [0.0, 0.009], [-0.008, -0.006]].flatMap(([x, z]) => [
      walls(0.0036, 0.0028, 0.0024, 0xa49e8e, { x, z }), gable(0.004, 0.0032, 0.0018, p.leaf, { x, y: 0.0024, z }),
    ]),
  ] },
  scaffold: { name: 'Scaffolding', leaf: TIMBER, build: (p) => [
    ...[[-0.008, -0.008], [0.008, -0.008], [-0.008, 0.008], [0.008, 0.008]].map(([x, z]) => seg(V(x!, 0, z!), V(x! * 0.8, 0.012, z! * 0.8), 0.0003, 0.00025, 3, p.leaf)),
    seg(V(0.011, 0, 0.002), V(0.011, 0.02, 0.002), 0.00035, 0.0003, 3, IRON),
    seg(V(0.011, 0.02, 0.002), V(-0.004, 0.019, 0.002), 0.00025, 0.0002, 3, IRON),
  ] },
  // ---------- foundations (under buildings on slopes; stretched per instance, colored by civ) ----------
  foundation: { name: 'Foundation', leaf: 0x8d877c, build: (p) => [
    part(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 1.06, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(0.01, 0.01, 0.01), p.leaf),
    flat(0.01, 0.01, p.leaf, { y: 0.01 }),
  ] },
  // ---------- war ----------
  ruins: { name: 'Ruins', leaf: 0x8d877c, build: (p) => [
    walls(0.006, 0.0045, 0.0022, p.leaf),
    ...block(0.0016, 0.0016, 0.0042, 0x9a948a, { x: 0.004, z: 0.003 }),
    cone(0.003, 0.0014, 5, 0x7f796f, { x: -0.004, z: -0.002 }),
    ...block(0.0035, 0.0012, 0.0012, p.leaf, { x: -0.001, z: 0.005, ry: 0.6 }),
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

// Any model a town places: a catalog building, or a lot model (a house,
// houses.ts, a wonder, wonderModels.ts, or a rural model, rural/models.ts:
// in tile steps, cached; the others at prop scale, built anew).
export type LotModelKind = HouseKind | WonderModelKind | RuralModelKind;
export const isLotModel = (k: string): k is LotModelKind => isHouseKind(k) || isWonderModelKind(k) || isRuralModelKind(k);
export type ModelKind = BuildingKind | LotModelKind;
// What a town places: a model, or a plant of the flora (its trees are its tile's own).
export type PlacedKind = ModelKind | CatalogKind;
export const isFloraModel = (k: PlacedKind): k is CatalogKind => k in CATALOG;
// Where a placed thing may stand on water (catalog buildings: boats, shore huts; none else).
// (The countryside's boats float; its fish and shells are at the surface.)
const AFLOAT = new Set(['rural|canoe', 'rural|sailboat', 'rural|trawler', 'rural|fishSchool', 'rural|oysters', 'rural|boat', 'rural|raft']);
export const waterRule = (k: PlacedKind): BuildingEntry['water'] => (AFLOAT.has(k) ? 'float' : isFloraModel(k) || isLotModel(k) ? undefined : buildingEntry(k).water);
// Its geometry before scaling (the flora's and the catalog's at reference size; lot models in tile steps).
export const placedGeometry = (k: PlacedKind): THREE.BufferGeometry => (isFloraModel(k) ? buildCatalogGeometry(k) : modelGeometry(k));
export const modelGeometry = (kind: ModelKind, palette?: Partial<Palette>): THREE.BufferGeometry =>
  isHouseKind(kind) ? houseGeometry(kind) : isWonderModelKind(kind) ? wonderGeometry(kind) : isRuralModelKind(kind) ? ruralGeometry(kind) : buildBuildingGeometry(kind, palette);

// Roof colors by roof kind: an instance picks one (muted, realistic).
export const ROOFS = {
  terracotta: [0x8a5a44, 0x96604a, 0x7e5242, 0x9a6a52],
  slate: [0x5a5a5e, 0x63605c, 0x55524f],
  thatch: [0xa08a5a, 0x9a8458, 0x8f7c55],
} as const;
