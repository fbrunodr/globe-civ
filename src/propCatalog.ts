import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Prop models (trees, shrubs, ground cover, rocks...), drawn as instanced
// meshes over the terrain and viewable in the prop gallery (gallery.html).
// Low-poly on purpose (at most 40 triangles each, tested): primitives only,
// no hidden caps or bases. Colors live in a per-vertex `color` attribute so
// trunks and leaves differ inside one instanced mesh. Sizes are for the
// reference tile (edge 0.07); callers pass a scale.
//
// Each prop has a main "leaf" color and an optional "accent" color (berries,
// flowers, coral). The leaf parts are marked per vertex (`leafMask`), so an
// instance can be retinted without new geometry (autumn maples, dry-season
// teak, golden or green grass).

export type Layer = 'Canopy' | 'Understory' | 'Ground' | 'Accent';
export interface Palette { leaf: number; accent: number }
// Where a prop may stand relative to water (depth = water level - ground):
//   wade:  on the ground, in water up to `depth` deep;
//   float: on the water surface where it is up to `maxDepth` deep (dry
//          ground too unless `needWater`);
//   bed:   on the ground under at least `minDepth` of water.
export type WaterUse =
  | { kind: 'wade'; depth: number }
  | { kind: 'float'; maxDepth: number; needWater: boolean }
  | { kind: 'bed'; minDepth: number };
const wade = (depth: number): WaterUse => ({ kind: 'wade', depth });

export interface CatalogEntry {
  name: string;
  layer: Layer;
  leaf: number;
  accent?: number;
  water?: WaterUse; // default: dry ground only
  build: (p: Palette) => THREE.BufferGeometry[];
}

const UP = new THREE.Vector3(0, 1, 0);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const TRUNK = 0x7a5a3c;

interface Tf { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; s?: number; sx?: number; sy?: number; sz?: number }
const tf = (o: Tf) => new THREE.Matrix4().compose(
  V(o.x ?? 0, o.y ?? 0, o.z ?? 0),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)),
  V(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1));

function part(geo: THREE.BufferGeometry, color: number, m?: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (m) g.applyMatrix4(m);
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---- shape helpers ----
const cyl = (r0: number, r1: number, h: number, n: number, color: number, o: Tf = {}) =>
  part(new THREE.CylinderGeometry(r1, r0, h, n, 1, true).translate(0, h / 2, 0), color, tf(o));
const cone = (r: number, h: number, n: number, color: number, o: Tf = {}) =>
  part(new THREE.ConeGeometry(r, h, n, 1, true).translate(0, h / 2, 0), color, tf(o));
const ico = (r: number, color: number, o: Tf = {}) => part(new THREE.IcosahedronGeometry(r, 0), color, tf(o));
const oct = (r: number, color: number, o: Tf = {}) => part(new THREE.OctahedronGeometry(r, 0), color, tf(o));
const tet = (r: number, color: number, o: Tf = {}) => part(new THREE.TetrahedronGeometry(r, 0), color, tf(o));
const disc = (r: number, n: number, color: number, o: Tf = {}) => part(new THREE.CircleGeometry(r, n), color, tf(o));

// A tapered cylinder from a to b (bottom radius r0, top r1).
function seg(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, n: number, color: number) {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, n, 1, true).translate(0, len / 2, 0);
  return part(g, color, new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), V(1, 1, 1)));
}

// A flat leaf (a squashed 3-sided cone) from `at`, pointing out at angle
// `ang` around the vertical; tilt > 0 droops it below horizontal, < 0 raises it.
function frond(at: THREE.Vector3, ang: number, len: number, w: number, tilt: number, color: number) {
  const leaf = new THREE.ConeGeometry(w, len, 3, 1, true).scale(1, 1, 0.3).translate(0, len / 2, 0);
  const m = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)
    .multiply(new THREE.Matrix4().makeRotationY(ang))
    .multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 - tilt));
  return part(leaf, color, m);
}

// A flat rectangle leaf rising from `at`, tilted out by `tilt` from vertical.
function blade4(at: THREE.Vector3, ang: number, len: number, w: number, tilt: number, color: number) {
  const g = new THREE.PlaneGeometry(w, len).translate(0, len / 2, 0);
  const m = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)
    .multiply(new THREE.Matrix4().makeRotationY(ang))
    .multiply(new THREE.Matrix4().makeRotationX(tilt));
  return part(g, color, m);
}

// One triangle of grass: base width w, height h, tip leaning by `lean`.
function blade(x: number, z: number, ang: number, w: number, h: number, lean: number, color: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, h, lean], 3));
  return part(g, color, tf({ x, z, ry: ang }));
}

// Deterministic lumpy jitter of a blob's vertices (shared corners move together).
function lumpy(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = Math.sin(Math.round(x * 1e5) * 12.9898 + Math.round(y * 1e5) * 78.233 + Math.round(z * 1e5) * 37.719 + seed) * 43758.5453;
    const f = 1 + amount * ((h - Math.floor(h)) * 2 - 1);
    pos.setXYZ(i, x * f, y * f, z * f);
  }
  g.computeVertexNormals();
  return g;
}
const rock = (r: number, color: number, seed: number, o: Tf = {}) =>
  part(lumpy(new THREE.IcosahedronGeometry(r, 0).toNonIndexed(), 0.25, seed), color, tf(o));
const shard = (r: number, color: number, seed: number, o: Tf = {}) =>
  part(lumpy(new THREE.OctahedronGeometry(r, 0).toNonIndexed(), 0.35, seed), color, tf(o));

const ring = (k: number, i: number, phase = 0) => (i / k) * Math.PI * 2 + phase;

export const CATALOG = {
  // ---------- conifers ----------
  fir: { name: 'Fir', layer: 'Canopy', leaf: 0x2f6a40, build: (p) => [
    cyl(0.001, 0.0007, 0.005, 4, TRUNK),
    cone(0.0048, 0.013, 6, p.leaf, { y: 0.004 }),
    cone(0.0035, 0.011, 6, p.leaf, { y: 0.011 }),
  ] },
  spruce: { name: 'Spruce', layer: 'Canopy', leaf: 0x2f5e3f, build: (p) => [
    cyl(0.0007, 0.0005, 0.003, 3, TRUNK),
    cone(0.0036, 0.0065, 6, p.leaf, { y: 0.0022 }),
    cone(0.0029, 0.006, 6, p.leaf, { y: 0.0055, ry: 0.5 }),
    cone(0.002, 0.0055, 6, p.leaf, { y: 0.0088 }),
  ] },
  pine: { name: 'Pine', layer: 'Canopy', leaf: 0x4c7a3e, build: (p) => [
    cyl(0.0006, 0.0004, 0.0095, 3, 0x8a5a3a),
    oct(0.0032, p.leaf, { y: 0.0095, x: 0.0008, sy: 0.55 }),
    oct(0.0024, p.leaf, { y: 0.0112, x: -0.0011, z: 0.0006, sy: 0.6 }),
  ] },
  stonePine: { name: 'Stone pine', layer: 'Canopy', leaf: 0x557d3a, build: (p) => [
    seg(V(0, 0, 0), V(0.0008, 0.0072, 0), 0.0006, 0.0004, 3, 0x8a5a3a),
    ico(0.0062, p.leaf, { x: 0.0008, y: 0.0078, sy: 0.25 }),
  ] },
  larch: { name: 'Larch', layer: 'Canopy', leaf: 0x9ab352, build: (p) => [
    cyl(0.0006, 0.0004, 0.004, 3, TRUNK),
    cone(0.0032, 0.011, 6, p.leaf, { y: 0.0025 }),
    cone(0.0018, 0.005, 5, p.leaf, { y: 0.0105 }),
  ] },
  giantCedar: { name: 'Giant cedar / redwood', layer: 'Canopy', leaf: 0x2e5c38, build: (p) => [
    cyl(0.0014, 0.0008, 0.013, 4, 0x8b4a2b),
    cone(0.0048, 0.008, 6, p.leaf, { y: 0.009 }),
    cone(0.0038, 0.008, 6, p.leaf, { y: 0.0135, ry: 0.5 }),
    cone(0.0024, 0.0065, 6, p.leaf, { y: 0.018 }),
  ] },
  cypress: { name: 'Cypress', layer: 'Canopy', leaf: 0x2f5130, build: (p) => [
    cone(0.0017, 0.0028, 5, p.leaf, { y: 0.0031, rx: Math.PI }),
    cone(0.0017, 0.0105, 5, p.leaf, { y: 0.0031 }),
  ] },
  baldCypress: { name: 'Bald cypress', layer: 'Canopy', leaf: 0x6b7f45, water: wade(0.0004), build: (p) => [
    cone(0.0018, 0.0035, 5, 0x7a6a55),
    cyl(0.0007, 0.0005, 0.008, 3, 0x7a6a55),
    ico(0.0046, p.leaf, { y: 0.0085, sy: 0.4 }),
  ] },
  juniper: { name: 'Juniper', layer: 'Understory', leaf: 0x4f6f5a, build: (p) => [
    oct(0.0022, p.leaf, { y: 0.0024, sy: 1.25 }),
    oct(0.0016, p.leaf, { x: 0.0017, y: 0.0016, z: 0.0006, sy: 1.1 }),
  ] },
  araucaria: { name: 'Araucaria', layer: 'Canopy', leaf: 0x2f5a35, build: (p) => [
    cyl(0.0006, 0.0004, 0.0115, 3, 0x6e5a48),
    cone(0.0036, 0.0013, 5, p.leaf, { y: 0.0072 }),
    cone(0.0029, 0.0013, 5, p.leaf, { y: 0.0091, ry: 0.6 }),
    cone(0.002, 0.0015, 5, p.leaf, { y: 0.0108 }),
  ] },
  kauri: { name: 'Kauri / podocarp', layer: 'Canopy', leaf: 0x4a7039, build: (p) => [
    cyl(0.0012, 0.0009, 0.0095, 4, 0xb8a58a),
    oct(0.0032, p.leaf, { x: 0.0022, y: 0.0105, sy: 0.6 }),
    oct(0.003, p.leaf, { x: -0.0018, y: 0.0102, z: 0.0014, sy: 0.6 }),
    oct(0.0028, p.leaf, { y: 0.0118, z: -0.0016, sy: 0.6 }),
  ] },

  // ---------- broadleaf ----------
  beechMaple: { name: 'Beech / maple', layer: 'Canopy', leaf: 0x5fa040, build: (p) => [
    cyl(0.0009, 0.0006, 0.004, 4, TRUNK),
    ico(0.0052, p.leaf, { y: 0.0075, sy: 0.85 }),
  ] },
  oak: { name: 'Oak', layer: 'Canopy', leaf: 0x557f35, build: (p) => [
    cyl(0.0011, 0.0008, 0.0035, 4, 0x6a4e36),
    ico(0.0058, p.leaf, { y: 0.0064, sy: 0.68 }),
    oct(0.0034, p.leaf, { x: 0.0034, y: 0.0056, z: 0.001, sy: 0.75 }),
  ] },
  birch: { name: 'Birch', layer: 'Canopy', leaf: 0x8dbb4f, build: (p) => [
    cyl(0.0005, 0.00035, 0.0085, 3, 0xe8e4da),
    oct(0.0022, p.leaf, { y: 0.0078, sy: 1.35 }),
    oct(0.0016, p.leaf, { x: 0.0013, y: 0.0058, sy: 1.2 }),
  ] },
  willow: { name: 'Willow / alder', layer: 'Canopy', leaf: 0x8fae5a, water: wade(0.0002), build: (p) => [
    cyl(0.0008, 0.0006, 0.0045, 3, 0x6a5a45),
    ico(0.004, p.leaf, { y: 0.0068, sy: 0.7 }),
    cone(0.0052, 0.0052, 6, p.leaf, { y: 0.0022 }),
  ] },
  poplar: { name: 'Poplar', layer: 'Canopy', leaf: 0x6f9d3d, build: (p) => [
    cyl(0.0006, 0.0004, 0.003, 3, TRUNK),
    oct(0.0018, p.leaf, { y: 0.0092, sy: 3.4 }),
  ] },
  olive: { name: 'Olive / holm oak', layer: 'Canopy', leaf: 0x8fa07a, build: (p) => [
    seg(V(0, 0, 0), V(0.0012, 0.0042, 0.0004), 0.0007, 0.0004, 3, 0x6b5a48),
    ico(0.0042, p.leaf, { x: 0.0012, y: 0.0052, sy: 0.55 }),
  ] },
  southernBeech: { name: 'Southern beech', layer: 'Canopy', leaf: 0x3e6b3a, build: (p) => [
    cyl(0.0006, 0.0004, 0.0095, 3, 0x5f4c3a),
    oct(0.0035, p.leaf, { x: 0.0015, y: 0.0065, sy: 0.3 }),
    oct(0.003, p.leaf, { x: -0.0012, y: 0.0082, z: 0.0008, sy: 0.3 }),
    oct(0.0022, p.leaf, { y: 0.0099, sy: 0.32 }),
  ] },
  eucalyptus: { name: 'Eucalyptus', layer: 'Canopy', leaf: 0x7f9a6a, build: (p) => [
    cyl(0.0006, 0.0004, 0.0125, 3, 0xd8d0c0),
    oct(0.0022, p.leaf, { x: 0.0014, y: 0.0112, sy: 0.7 }),
    oct(0.0019, p.leaf, { x: -0.0012, y: 0.0127, z: 0.0006, sy: 0.7 }),
    oct(0.0017, p.leaf, { x: 0.0002, y: 0.0094, z: -0.0014, sy: 0.7 }),
  ] },

  // ---------- tropical ----------
  jungleTree: { name: 'Jungle tree', layer: 'Canopy', leaf: 0x3a8a34, water: wade(0.00025), build: (p) => [
    cyl(0.001, 0.0006, 0.007, 4, TRUNK),
    ico(0.0058, p.leaf, { y: 0.009, sy: 0.7 }),
    oct(0.0036, p.leaf, { x: 0.0025, y: 0.0118, z: 0.001, sy: 0.75 }),
  ] },
  kapok: { name: 'Kapok emergent', layer: 'Canopy', leaf: 0x3f8a3c, build: (p) => [
    cyl(0.001, 0.0007, 0.0165, 4, 0x9a8a78),
    tet(0.0022, 0x9a8a78, { y: 0.0008, sx: 1.4, sz: 0.4 }),
    ico(0.0075, p.leaf, { y: 0.0168, sy: 0.3 }),
  ] },
  palm: { name: 'Palm', layer: 'Canopy', leaf: 0x5ea63c, build: (p) => [
    cyl(0.0007, 0.00045, 0.011, 4, 0x7a6040),
    ...Array.from({ length: 6 }, (_, i) => frond(V(0, 0.011, 0), ring(6, i), 0.0075, 0.0016, 0.2, p.leaf)),
  ] },
  coconutPalm: { name: 'Coconut palm', layer: 'Canopy', leaf: 0x6cb445, build: (p) => {
    const mid = V(0.0012, 0.006, 0), top = V(0.0042, 0.0115, 0);
    return [
      seg(V(0, 0, 0), mid, 0.0007, 0.0005, 3, 0x8a7050),
      seg(mid, top, 0.0005, 0.0004, 3, 0x8a7050),
      ...Array.from({ length: 5 }, (_, i) => frond(top, ring(5, i, 0.3), 0.0068, 0.0015, 0.3, p.leaf)),
    ];
  } },
  fanPalm: { name: 'Fan palm (buriti)', layer: 'Canopy', leaf: 0x6d9c48, water: wade(0.00025), build: (p) => [
    cyl(0.0006, 0.0005, 0.0105, 3, 0x7a6a55),
    part(new THREE.CircleGeometry(0.0034, 6, 0, Math.PI), p.leaf, tf({ y: 0.0102 })),
    part(new THREE.CircleGeometry(0.0034, 6, 0, Math.PI), p.leaf, tf({ y: 0.0102, ry: Math.PI / 2, rx: -0.3 })),
  ] },
  banana: { name: 'Banana', layer: 'Understory', leaf: 0x7cc04a, build: (p) => [
    cyl(0.0006, 0.0005, 0.0025, 3, 0x8a9a50),
    ...Array.from({ length: 5 }, (_, i) => blade4(V(0, 0.0022, 0), ring(5, i), 0.0055, 0.0016, 0.9, p.leaf)),
  ] },
  bamboo: { name: 'Bamboo clump', layer: 'Understory', leaf: 0x9bb34a, build: (p) => [
    ...[[0, 0, 0.016], [0.0012, 0.0006, 0.013], [-0.001, 0.001, 0.014], [0.0004, -0.0013, 0.012], [-0.0012, -0.0006, 0.0125]]
      .map(([x, z, h]) => cone(0.00028, h, 3, 0x9a9a50, { x, z, rz: x * 30, rx: -z * 30 })),
    tet(0.0022, p.leaf, { y: 0.0125, x: 0.0018, sy: 0.6 }),
    tet(0.002, p.leaf, { y: 0.011, x: -0.0018, z: 0.0008, sy: 0.6 }),
  ] },
  treeFern: { name: 'Tree fern', layer: 'Understory', leaf: 0x4f8f3c, build: (p) => [
    cyl(0.0005, 0.0003, 0.0058, 3, 0x5a4632),
    ...Array.from({ length: 6 }, (_, i) => frond(V(0, 0.0058, 0), ring(6, i), 0.0048, 0.0013, -0.15, p.leaf)),
  ] },
  mangrove: { name: 'Mangrove', layer: 'Canopy', leaf: 0x3f7d4f, water: wade(0.0006), build: (p) => [
    ico(0.0045, p.leaf, { y: 0.0058, sy: 0.7 }),
    ...Array.from({ length: 3 }, (_, i) => {
      const a = ring(3, i);
      return cone(0.0005, 0.0045, 4, 0x4a3a2a, { x: Math.cos(a) * 0.0022, z: Math.sin(a) * 0.0022, rx: Math.sin(a) * 0.45, rz: -Math.cos(a) * 0.45 });
    }),
  ] },

  // ---------- arid ----------
  acacia: { name: 'Acacia', layer: 'Canopy', leaf: 0x7f8c3b, build: (p) => [
    cyl(0.0007, 0.0004, 0.007, 4, TRUNK),
    ico(0.0062, p.leaf, { y: 0.0075, sy: 0.28 }),
  ] },
  baobab: { name: 'Baobab', layer: 'Canopy', leaf: 0x6f8a45, build: (p) => [
    cyl(0.0022, 0.0013, 0.0062, 5, 0x9a8470),
    cone(0.0005, 0.0024, 3, 0x9a8470, { y: 0.0058, x: 0.0008, rz: -0.6 }),
    cone(0.0005, 0.0024, 3, 0x9a8470, { y: 0.0058, x: -0.0008, rz: 0.6 }),
    oct(0.0032, p.leaf, { y: 0.0072, sy: 0.35 }),
  ] },
  saguaro: { name: 'Saguaro', layer: 'Canopy', leaf: 0x4f7d45, build: (p) => [
    cyl(0.0008, 0.0007, 0.011, 4, p.leaf),
    cone(0.0007, 0.0006, 4, p.leaf, { y: 0.011 }),
    seg(V(0, 0.0042, 0), V(0.0021, 0.0046, 0), 0.0005, 0.0005, 3, p.leaf),
    seg(V(0.0021, 0.0045, 0), V(0.0021, 0.0083, 0), 0.0005, 0.00045, 3, p.leaf),
    seg(V(0, 0.0058, 0), V(-0.0019, 0.0061, 0.0004), 0.0005, 0.0005, 3, p.leaf),
    seg(V(-0.0019, 0.006, 0.0004), V(-0.0019, 0.0088, 0.0004), 0.0005, 0.00045, 3, p.leaf),
  ] },
  joshuaTree: { name: 'Joshua tree', layer: 'Canopy', leaf: 0x5d7a3e, build: (p) => {
    const fork = V(0, 0.0042, 0);
    const tips = [V(0.0026, 0.0072, 0.0004), V(-0.0022, 0.0078, 0.0008), V(0.0004, 0.0082, -0.0024)];
    return [
      seg(V(0, 0, 0), fork, 0.0007, 0.0006, 3, 0x6e5f4c),
      ...tips.map((t) => seg(fork, t, 0.0005, 0.0004, 3, 0x6e5f4c)),
      ...tips.map((t) => tet(0.0014, p.leaf, { x: t.x, y: t.y + 0.0005, z: t.z, sy: 1.3 })),
    ];
  } },
  dragonTree: { name: 'Dragon tree', layer: 'Canopy', leaf: 0x4d6e3c, build: (p) => [
    cyl(0.0008, 0.0006, 0.0045, 3, 0x9a8a78),
    seg(V(0, 0.0042, 0), V(0.0016, 0.0062, 0), 0.0004, 0.0003, 3, 0x9a8a78),
    seg(V(0, 0.0042, 0), V(-0.0014, 0.0062, 0.0006), 0.0004, 0.0003, 3, 0x9a8a78),
    cone(0.0052, 0.0028, 6, p.leaf, { y: 0.0088, rx: Math.PI }),
    disc(0.0052, 6, p.leaf, { y: 0.0088, rx: -Math.PI / 2 }),
  ] },
  euphorbia: { name: 'Euphorbia candelabra', layer: 'Understory', leaf: 0x6c8f4a, build: (p) => [
    cyl(0.0007, 0.0006, 0.0025, 3, 0x7a7050),
    ...[[0.0012, 0, 0.0085], [-0.0011, 0.0005, 0.0078], [0.0002, 0.0013, 0.007], [0.0003, -0.0012, 0.0092]]
      .map(([x, z, h]) => seg(V(0, 0.0022, 0), V(x, h, z), 0.0004, 0.00035, 3, p.leaf)),
  ] },
  pricklyPear: { name: 'Prickly pear', layer: 'Understory', leaf: 0x7a9a4a, build: (p) => [
    oct(0.0014, p.leaf, { y: 0.0014, sx: 0.85, sz: 0.25 }),
    oct(0.0012, p.leaf, { x: 0.0011, y: 0.0031, ry: 0.4, rz: -0.5, sx: 0.85, sz: 0.25 }),
    oct(0.0011, p.leaf, { x: -0.001, y: 0.003, ry: -0.6, rz: 0.4, sx: 0.85, sz: 0.25 }),
  ] },
  saxaul: { name: 'Saxaul', layer: 'Understory', leaf: 0x8a9a6a, build: (p) => [
    seg(V(0, 0, 0), V(0.0008, 0.0022, 0.0003), 0.0005, 0.0004, 3, 0x7a6a58),
    seg(V(0.0008, 0.0022, 0.0003), V(-0.0004, 0.0042, 0), 0.0004, 0.0003, 3, 0x7a6a58),
    oct(0.0018, p.leaf, { x: -0.0004, y: 0.0045, sy: 0.6 }),
    oct(0.0014, p.leaf, { x: 0.0014, y: 0.0028, z: 0.0006, sy: 0.6 }),
  ] },

  // ---------- shrubs and ground cover ----------
  shrub: { name: 'Shrub', layer: 'Understory', leaf: 0x8a9447, build: (p) => [
    oct(0.0028, p.leaf, { y: 0.0014, sy: 0.7 }),
    oct(0.002, p.leaf, { x: 0.0022, y: 0.001, z: 0.001, sy: 0.7, ry: 0.4 }),
  ] },
  sagebrush: { name: 'Sagebrush', layer: 'Understory', leaf: 0x9aa58f, build: (p) => [
    oct(0.0022, p.leaf, { y: 0.001, sy: 0.55 }),
    oct(0.0017, p.leaf, { x: 0.0018, y: 0.0008, z: -0.0008, sy: 0.55, ry: 0.5 }),
  ] },
  dryBush: { name: 'Dry bush', layer: 'Ground', leaf: 0x9a8a6a, build: (p) => [
    oct(0.0018, p.leaf, { y: 0.0009, sy: 0.6, ry: 0.3 }),
  ] },
  berryBush: { name: 'Berry bush', layer: 'Understory', leaf: 0x5c7d3d, accent: 0xc0303a, build: (p) => [
    oct(0.0021, p.leaf, { y: 0.0013, sy: 0.75 }),
    tet(0.00045, p.accent, { x: 0.0015, y: 0.0016, z: 0.0006 }),
    tet(0.00045, p.accent, { x: -0.0011, y: 0.0019, z: 0.0012 }),
    tet(0.00045, p.accent, { x: 0.0002, y: 0.0022, z: -0.0014 }),
  ] },
  grassTuft: { name: 'Grass tuft', layer: 'Ground', leaf: 0x8fae55, build: (p) =>
    Array.from({ length: 5 }, (_, i) => blade(Math.cos(ring(5, i)) * 0.0004, Math.sin(ring(5, i)) * 0.0004, ring(5, i, 0.4), 0.0006, 0.0022 + 0.0004 * (i % 2), 0.0006, p.leaf)) },
  tallGrass: { name: 'Tall grass', layer: 'Ground', leaf: 0xc8b060, build: (p) =>
    Array.from({ length: 7 }, (_, i) => blade(Math.cos(ring(7, i)) * 0.0006, Math.sin(ring(7, i)) * 0.0006, ring(7, i, 0.2), 0.0007, 0.0042 + 0.0008 * (i % 3), 0.0012, p.leaf)) },
  flowers: { name: 'Flowers', layer: 'Ground', leaf: 0x7fa850, accent: 0xe05a8a, build: (p) => {
    const dots = [p.accent, 0xf2d24a, 0xf4f0ea, p.accent];
    return [
      ...Array.from({ length: 4 }, (_, i) => blade(Math.cos(ring(4, i)) * 0.0005, Math.sin(ring(4, i)) * 0.0005, ring(4, i, 0.7), 0.0006, 0.0018, 0.0004, p.leaf)),
      ...dots.map((c, i) => tet(0.0004, c, { x: Math.cos(ring(4, i, 0.4)) * 0.0011, y: 0.0021, z: Math.sin(ring(4, i, 0.4)) * 0.0011 })),
    ];
  } },
  fernClump: { name: 'Fern clump', layer: 'Ground', leaf: 0x4f8a3a, build: (p) =>
    Array.from({ length: 5 }, (_, i) => frond(V(0, 0.0003, 0), ring(5, i, 0.3), 0.0032, 0.0009, -0.55, p.leaf)) },
  heather: { name: 'Heather', layer: 'Ground', leaf: 0x8a5a8a, build: (p) => [
    oct(0.0026, p.leaf, { y: 0.0005, sy: 0.32, ry: 0.3 }),
  ] },
  moss: { name: 'Moss / lichen mound', layer: 'Ground', leaf: 0x6f8f4a, build: (p) => [
    oct(0.002, p.leaf, { y: 0.0002, sy: 0.32, ry: 0.7 }),
  ] },
  cottonGrass: { name: 'Cotton grass', layer: 'Ground', leaf: 0x8a9a5a, accent: 0xf6f6f0, build: (p) => [
    ...Array.from({ length: 4 }, (_, i) => blade(Math.cos(ring(4, i)) * 0.0004, Math.sin(ring(4, i)) * 0.0004, ring(4, i, 0.3), 0.0005, 0.0024, 0.0005, p.leaf)),
    ...Array.from({ length: 3 }, (_, i) => tet(0.00045, p.accent, { x: Math.cos(ring(3, i)) * 0.0006, y: 0.0028, z: Math.sin(ring(3, i)) * 0.0006 })),
  ] },
  reeds: { name: 'Reeds', layer: 'Ground', leaf: 0xa9b85e, water: wade(0.0007), build: (p) =>
    [[0, 0], [0.0018, 0.0009], [-0.0015, 0.0013], [0.0008, -0.0018], [-0.0017, -0.0009], [0.002, -0.0006]].map(([x, z], i) => {
      const h = 0.0075 + 0.002 * (i % 3);
      return cone(0.0005, h, 4, i % 2 ? 0xbcc56c : p.leaf, { x, z });
    }) },
  cattail: { name: 'Cattail', layer: 'Ground', leaf: 0x7d9a4a, accent: 0x6a4a2a, water: wade(0.0006), build: (p) => {
    const st = [[0, 0, 0.0062], [0.0011, 0.0006, 0.0052], [-0.0009, 0.0009, 0.0056], [0.0003, -0.0011, 0.0048]];
    return [
      ...st.map(([x, z, h]) => cone(0.0003, h, 3, p.leaf, { x, z })),
      ...st.slice(0, 3).map(([x, z, h]) => tet(0.00045, p.accent, { x, y: h * 0.78, z, sx: 0.6, sz: 0.6, sy: 2.2 })),
    ];
  } },
  papyrus: { name: 'Papyrus', layer: 'Ground', leaf: 0x8fb850, accent: 0x6f9a40, water: wade(0.0006), build: (p) => {
    const st = [[0, 0, 0.0085], [0.0013, 0.0007, 0.0072], [-0.0011, 0.001, 0.0078], [0.0004, -0.0013, 0.0068]];
    return [
      ...st.map(([x, z, h]) => cone(0.00028, h, 3, p.accent, { x, z })),
      ...st.map(([x, z, h]) => cone(0.0016, 0.0012, 5, p.leaf, { x, y: h - 0.0001, z, rx: Math.PI })),
    ];
  } },
  lilyPads: { name: 'Lily pads', layer: 'Ground', leaf: 0x4f8a3a, accent: 0xf0a0c0, water: { kind: 'float', maxDepth: 0.0009, needWater: true }, build: (p) => [
    disc(0.0014, 6, p.leaf, { y: 0.00005, rx: -Math.PI / 2 }),
    disc(0.0011, 6, p.leaf, { x: 0.0022, y: 0.00005, z: 0.0009, rx: -Math.PI / 2 }),
    disc(0.0009, 6, p.leaf, { x: -0.0012, y: 0.00005, z: 0.0019, rx: -Math.PI / 2 }),
    tet(0.0004, p.accent, { x: 0.0021, y: 0.0003, z: 0.0008 }),
  ] },

  // ---------- rock and deadwood ----------
  boulder: { name: 'Boulder', layer: 'Ground', leaf: 0x8a877d, build: (p) => [
    rock(0.0022, p.leaf, 3, { y: 0.0008, sy: 0.7 }),
  ] },
  tor: { name: 'Tor / outcrop', layer: 'Accent', leaf: 0x8f8a80, build: (p) => [
    part(new THREE.BoxGeometry(0.005, 0.0022, 0.0042), p.leaf, tf({ y: 0.0008, ry: 0.2 })),
    part(new THREE.BoxGeometry(0.0038, 0.002, 0.0032), p.leaf, tf({ x: 0.0004, y: 0.0028, ry: 0.7, rz: 0.06 })),
    part(new THREE.BoxGeometry(0.0024, 0.0016, 0.0022), p.leaf, tf({ x: -0.0002, y: 0.0045, ry: 1.3 })),
  ] },
  rockSpire: { name: 'Rock spire', layer: 'Accent', leaf: 0xb07850, build: (p) => [
    cone(0.0018, 0.012, 5, p.leaf),
    cone(0.0011, 0.006, 4, p.leaf, { x: 0.0019, z: 0.0006, ry: 0.4 }),
  ] },
  scree: { name: 'Scree', layer: 'Ground', leaf: 0x8d8b84, build: (p) => [
    tet(0.0008, p.leaf, { y: 0.0003, ry: 0.2 }),
    tet(0.0006, p.leaf, { x: 0.0014, y: 0.0002, z: 0.0005, rx: 0.8 }),
    tet(0.0007, p.leaf, { x: -0.0009, y: 0.0002, z: 0.0012, rz: 0.5 }),
  ] },
  fallenLog: { name: 'Fallen log', layer: 'Ground', leaf: 0x6a5038, build: (p) => [
    cyl(0.0006, 0.0005, 0.0065, 4, p.leaf, { y: 0.0005, x: -0.0032, rz: -Math.PI / 2 + 0.05 }),
  ] },
  stump: { name: 'Stump', layer: 'Ground', leaf: 0x6a5038, accent: 0xb89a70, build: (p) => [
    cyl(0.0009, 0.0007, 0.0012, 4, p.leaf),
    disc(0.0007, 4, p.accent, { y: 0.0012, rx: -Math.PI / 2, rz: Math.PI / 4 }),
  ] },
  snag: { name: 'Snag (dead tree)', layer: 'Understory', leaf: 0x8a8580, build: (p) => [
    cyl(0.0006, 0.0003, 0.0095, 3, p.leaf),
    seg(V(0, 0.005, 0), V(0.0017, 0.0066, 0), 0.0002, 0.0001, 3, p.leaf),
    seg(V(0, 0.0068, 0), V(-0.0013, 0.0081, 0.0006), 0.0002, 0.0001, 3, p.leaf),
  ] },
  termiteMound: { name: 'Termite mound', layer: 'Accent', leaf: 0xb07a4a, build: (p) => [
    cone(0.0014, 0.0062, 6, p.leaf),
    cone(0.0009, 0.0035, 5, p.leaf, { x: 0.0011, z: 0.0003 }),
  ] },
  iceSerac: { name: 'Ice serac', layer: 'Ground', leaf: 0xdff0fa, build: (p) => [
    shard(0.0022, p.leaf, 5, { y: 0.0012, sy: 1.2 }),
    shard(0.0015, p.leaf, 9, { x: 0.0022, y: 0.0007, z: 0.0008, sy: 1.4 }),
  ] },

  // ---------- under water ----------
  coralHeads: { name: 'Coral heads', layer: 'Ground', leaf: 0xe07a6a, accent: 0x9a6ad0, water: { kind: 'bed', minDepth: 0.0003 }, build: (p) => [
    oct(0.0011, p.leaf, { y: 0.0003, sy: 0.6 }),
    oct(0.0009, 0xd8b04a, { x: 0.0016, y: 0.0003, z: 0.0006, sy: 0.6 }),
    oct(0.0008, p.accent, { x: -0.0009, y: 0.0002, z: 0.0014, sy: 0.6 }),
  ] },
  branchingCoral: { name: 'Branching coral', layer: 'Ground', leaf: 0xf08a3a, water: { kind: 'bed', minDepth: 0.0003 }, build: (p) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = ring(5, i);
      return cone(0.00022, 0.0012 + 0.0003 * (i % 2), 3, p.leaf, { x: Math.cos(a) * 0.0003, z: Math.sin(a) * 0.0003, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 });
    }) },
  kelp: { name: 'Kelp strand', layer: 'Ground', leaf: 0x5a6a2a, water: { kind: 'bed', minDepth: 0.0006 }, build: (p) => [
    part(new THREE.PlaneGeometry(0.0007, 0.0034, 1, 1).translate(0, 0.0017, 0), p.leaf, tf({ ry: 0.3, rz: 0.08 })),
    part(new THREE.PlaneGeometry(0.0006, 0.003, 1, 1).translate(0, 0.0015, 0), p.leaf, tf({ x: 0.0006, ry: 1.6, rx: 0.1 })),
  ] },
  iceFloe: { name: 'Ice floe / berg', layer: 'Accent', leaf: 0xeef6fa, water: { kind: 'float', maxDepth: Infinity, needWater: false }, build: (p) => [
    shard(0.0055, p.leaf, 2, { y: 0, sy: 0.22 }),
  ] },
} satisfies Record<string, CatalogEntry>;

export type CatalogKind = keyof typeof CATALOG;
export const CATALOG_KINDS = Object.keys(CATALOG) as CatalogKind[];
export const catalogEntry = (k: CatalogKind): CatalogEntry => CATALOG[k];

// Marks leaf parts: built with this color as the leaf, then recolored.
const LEAF_PROBE = new THREE.Color(0x010203);

export function buildCatalogGeometry(kind: CatalogKind, palette?: Partial<Palette>): THREE.BufferGeometry {
  const e: CatalogEntry = CATALOG[kind];
  const merged = mergeGeometries(e.build({ leaf: LEAF_PROBE.getHex(), accent: palette?.accent ?? e.accent ?? e.leaf }));
  if (!merged) throw new Error(`Could not build prop ${kind}`);
  const leaf = new THREE.Color(palette?.leaf ?? e.leaf);
  const col = merged.getAttribute('color');
  const mask = new Float32Array(col.count);
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(col.getX(i) - LEAF_PROBE.r) + Math.abs(col.getY(i) - LEAF_PROBE.g) + Math.abs(col.getZ(i) - LEAF_PROBE.b) > 1e-4) continue;
    mask[i] = 1;
    col.setXYZ(i, leaf.r, leaf.g, leaf.b);
  }
  merged.setAttribute('leafMask', new THREE.BufferAttribute(mask, 1));
  return merged;
}

// The game's geometry for a prop, at a scale.
export const buildPropGeometry = (kind: CatalogKind, scale: number): THREE.BufferGeometry =>
  buildCatalogGeometry(kind).scale(scale, scale, scale);

export const triangles = (g: THREE.BufferGeometry): number =>
  (g.index ? g.index.count : g.getAttribute('position').count) / 3;
