// A flat sheet for the dev pages (City samples, Buildings) with the game's
// models at the game's scale (a tile step is 1 here): coloured triangles
// for the ground and roads, instanced models for what stands on them.

import * as THREE from 'three';
import { modelGeometry, type ModelKind } from './buildingCatalog.ts';
import { makePropMaterial, instanceGeometry } from './propMaterial.ts';

// Catalog models (walls): render.ts draws them at 1.5 × PROP_SIZE (0.276)
// of a tile edge of 0.07, and towns at HOUSE_SCALE 1.5 over that.
const MODEL = (1.5 * 0.276) / 0.07;
export const HOUSE = 1.5 * MODEL;

const OUTSIDE = new THREE.Color(0x6f8a4b);
const buildingMat = makePropMaterial(0.32);
const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

export class FlatPainter {
  private pos: number[] = [];
  private col: number[] = [];
  private readonly instances = new Map<string, { kind: ModelKind; roof: number; mats: THREE.Matrix4[]; cols: THREE.Color[] }>();

  // A triangle of the ground.
  tri(c: THREE.Color, ...ps: THREE.Vector3[]): void { for (const p of ps) { this.pos.push(p.x, p.y, p.z); this.col.push(c.r, c.g, c.b); } }
  // A ground plane under everything.
  floor(x0: number, z0: number, x1: number, z1: number): void {
    const y = -0.002, a = new THREE.Vector3(x0, y, z0), b = new THREE.Vector3(x1, y, z0), c = new THREE.Vector3(x1, y, z1), d = new THREE.Vector3(x0, y, z1);
    this.tri(OUTSIDE, a, b, c); this.tri(OUTSIDE, a, c, d);
  }
  // A model at `at`, turned by yaw (radians, around up), scaled (x, y, z).
  model(kind: ModelKind, at: THREE.Vector3, yaw: number, scale: THREE.Vector3, roof: number, shade = 1): void {
    const key = `${kind}|${roof}`;
    let e = this.instances.get(key);
    if (!e) { e = { kind, roof, mats: [], cols: [] }; this.instances.set(key, e); }
    e.mats.push(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), scale));
    e.cols.push(new THREE.Color(shade, shade, shade));
  }

  // Everything painted so far, into `group` (the painter starts over).
  flush(group: THREE.Group): number {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, flatMat));
    let count = 0;
    for (const e of this.instances.values()) {
      const model = modelGeometry(e.kind, { leaf: e.roof });
      const mesh = new THREE.InstancedMesh(instanceGeometry(model, e.mats.length), buildingMat, e.mats.length);
      const leaf = mesh.geometry.getAttribute('leafTint') as THREE.InstancedBufferAttribute;
      const lc = new THREE.Color(e.roof);
      e.mats.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, e.cols[i]!); leaf.setXYZ(i, lc.r, lc.g, lc.b); });
      group.add(mesh);
      count += e.mats.length;
    }
    this.pos = []; this.col = [];
    this.instances.clear();
    return count;
  }
}

// Disposes a group's meshes.
export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
}
