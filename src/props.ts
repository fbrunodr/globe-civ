import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PropKind } from './look.ts';

// Low-poly prop models built from primitives. Colors live in a per-vertex
// `color` attribute so trunks and leaves differ inside one instanced mesh.
// Sizes are for the reference tile size; callers pass a scale.

const M = new THREE.Matrix4();
const at = (x: number, y: number, z: number) => M.clone().makeTranslation(x, y, z);

function part(geo: THREE.BufferGeometry, color: number, transform?: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (transform) g.applyMatrix4(transform);
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const TRUNK = 0x7a5a3c;

const BUILDERS: Record<PropKind, () => THREE.BufferGeometry[]> = {
  conifer: () => [
    part(new THREE.CylinderGeometry(0.0006, 0.0008, 0.003, 5), TRUNK, at(0, 0.0015, 0)),
    part(new THREE.ConeGeometry(0.0042, 0.011, 7), 0x3f7a48, at(0, 0.0075, 0)),
    part(new THREE.ConeGeometry(0.003, 0.008, 7), 0x478552, at(0, 0.012, 0)),
  ],
  tallConifer: () => [
    part(new THREE.CylinderGeometry(0.0007, 0.001, 0.005, 5), TRUNK, at(0, 0.0025, 0)),
    part(new THREE.ConeGeometry(0.0048, 0.013, 7), 0x2f6a40, at(0, 0.0105, 0)),
    part(new THREE.ConeGeometry(0.0035, 0.011, 7), 0x377548, at(0, 0.0165, 0)),
  ],
  broadleaf: () => [
    part(new THREE.CylinderGeometry(0.0006, 0.0009, 0.004, 5), TRUNK, at(0, 0.002, 0)),
    part(new THREE.IcosahedronGeometry(0.0052, 1).scale(1, 0.85, 1), 0x5fa040, at(0, 0.0075, 0)),
  ],
  jungleTree: () => [
    part(new THREE.CylinderGeometry(0.0006, 0.001, 0.007, 5), TRUNK, at(0, 0.0035, 0)),
    part(new THREE.IcosahedronGeometry(0.0058, 1).scale(1, 0.7, 1), 0x3a8a34, at(0, 0.009, 0)),
    part(new THREE.IcosahedronGeometry(0.0038, 1).scale(1, 0.75, 1), 0x46a03c, at(0.0025, 0.0118, 0.001)),
  ],
  acacia: () => [
    part(new THREE.CylinderGeometry(0.0004, 0.0007, 0.007, 5), TRUNK, at(0, 0.0035, 0)),
    part(new THREE.IcosahedronGeometry(0.0062, 1).scale(1, 0.28, 1), 0x7f8c3b, at(0, 0.0075, 0)),
  ],
  shrub: () => [
    part(new THREE.IcosahedronGeometry(0.0028, 0).scale(1, 0.7, 1), 0x8a9447, at(0, 0.0014, 0)),
    part(new THREE.IcosahedronGeometry(0.002, 0).scale(1, 0.7, 1), 0x7d8a40, at(0.0022, 0.001, 0.001)),
  ],
  palm: () => {
    const parts = [part(new THREE.CylinderGeometry(0.00045, 0.0007, 0.011, 5), 0x7a6040, at(0, 0.0055, 0))];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      // A leaf: a flat cone pointing outward and drooping.
      const leaf = new THREE.ConeGeometry(0.0016, 0.0075, 3).scale(1, 1, 0.3);
      const m = new THREE.Matrix4()
        .makeTranslation(0, 0.011, 0)
        .multiply(new THREE.Matrix4().makeRotationY(a))
        .multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 - 0.2))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0.003, 0));
      parts.push(part(leaf, i % 2 ? 0x6cb445 : 0x5ea63c, m));
    }
    return parts;
  },
  reeds: () => {
    const parts: THREE.BufferGeometry[] = [];
    const offs = [[0, 0], [0.0018, 0.0009], [-0.0015, 0.0013], [0.0008, -0.0018], [-0.0017, -0.0009], [0.002, -0.0006]];
    offs.forEach(([x, z], i) => {
      const h = 0.0075 + 0.002 * (i % 3);
      parts.push(part(new THREE.ConeGeometry(0.0005, h, 4), i % 2 ? 0xbcc56c : 0xa9b85e, at(x, h / 2, z)));
    });
    return parts;
  },
  mangroveTree: () => {
    const parts = [part(new THREE.IcosahedronGeometry(0.0045, 1).scale(1, 0.7, 1), 0x3f7d4f, at(0, 0.0055, 0))];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const m = new THREE.Matrix4()
        .makeTranslation(Math.cos(a) * 0.0012, 0.0016, Math.sin(a) * 0.0012)
        .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), 0.4));
      parts.push(part(new THREE.CylinderGeometry(0.0003, 0.0004, 0.0035, 4), 0x4a3a2a, m));
    }
    return parts;
  },
};

export function buildPropGeometry(kind: PropKind, scale: number): THREE.BufferGeometry {
  const merged = mergeGeometries(BUILDERS[kind]());
  if (!merged) throw new Error(`Could not build prop ${kind}`);
  return merged.scale(scale, scale, scale);
}

export const PROP_KINDS = Object.keys(BUILDERS) as PropKind[];
