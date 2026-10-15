// Town drawings laid out flat (the design sheet and the town editor), with
// the game's models at the game's scale: a tile step is 1 here, the
// canonical drawing frame's y runs to -z (so the plane seen from above
// keeps the drawings' turn).

import * as THREE from 'three';
import { corner, LOT_SIZE, FLOOR_HEIGHT, doorSize, isBuilding, type Footprint, type LotKind, type Pt, type Floors } from './town/geometry.ts';
import { STUB_U, type EdgeValue } from './town/edges.ts';
import type { FanPt, Stamp } from './cityStamp.ts';
import { BUILDINGS_CATALOG, ROOFS, buildBuildingGeometry, type BuildingKind } from './buildingCatalog.ts';
import { makePropMaterial, instanceGeometry } from './propMaterial.ts';
import { mulberry32 } from './rng.ts';

// Models: render.ts draws them at 1.5 × PROP_SIZE (0.276) of a tile edge of
// 0.07, and towns at HOUSE_SCALE 1.5 over that.
export const MODEL = (1.5 * 0.276) / 0.07;
export const HOUSE = 1.5 * MODEL;
// How much of its lot a building fills (cityProps.ts FIT).
const FIT = 0.92;

export interface FlatTile { id: number; cx: number; cz: number }

export const STREET_RGB = new THREE.Color(0x9a8a70), PLAZA_RGB = new THREE.Color(0xa9a194), WALL_RGB = new THREE.Color(0xa49c8c);
export const GROUND = new THREE.Color(0x7d9a55), RIM = new THREE.Color(0x76924f), OUTSIDE = new THREE.Color(0x6f8a4b), STUB = new THREE.Color(0xd9534f);
const GREEN_RGB = new THREE.Color(0x8aa860);

const ROOF_PICK = [...ROOFS.terracotta, ...ROOFS.slate];
const FURNITURE: Record<Exclude<LotKind, `b${string}`>, BuildingKind> = { tree: 'gardenTree', well: 'well', fountain: 'fountain', stall: 'stall', shed: 'shed' };
const SAMPLE: readonly BuildingKind[] = ['library', 'market', 'temple', 'workshop', 'amphitheater', 'granary', 'barracks', 'odeon'];

export const buildingMat = makePropMaterial(0.32);
export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

export class FlatPainter {
  readonly tiles = new Map<number, FlatTile>();
  private pos: number[] = [];
  private col: number[] = [];
  private readonly instances = new Map<string, { kind: BuildingKind; roof: number; mats: THREE.Matrix4[]; cols: THREE.Color[] }>();
  private readonly radius = new Map<BuildingKind, number>();

  canon(f: FlatTile, p: Pt, y = 0): THREE.Vector3 { return new THREE.Vector3(f.cx + p.x, y, f.cz - p.y); }
  toPlane(p: FanPt): THREE.Vector3 {
    const f = this.tiles.get(p.t)!;
    const A = corner(6, p.i), B = corner(6, p.i + 1);
    return this.canon(f, { x: A.x * p.wa + B.x * p.wb, y: A.y * p.wa + B.y * p.wb });
  }
  tri(c: THREE.Color, ...ps: THREE.Vector3[]): void { for (const p of ps) { this.pos.push(p.x, p.y, p.z); this.col.push(c.r, c.g, c.b); } }

  ground(f: FlatTile, inner = GROUND, rim = RIM): void {
    const c = this.canon(f, { x: 0, y: 0 });
    for (let j = 0; j < 6; j++) {
      const a = this.canon(f, corner(6, j)), b = this.canon(f, corner(6, j + 1));
      const ai = c.clone().lerp(a, 0.96), bi = c.clone().lerp(b, 0.96);
      this.tri(inner, c, ai, bi); this.tri(rim, ai, a, b); this.tri(rim, ai, b, bi);
    }
  }
  // A ground plane under everything.
  floor(x0: number, z0: number, x1: number, z1: number): void {
    const y = -0.002, a = new THREE.Vector3(x0, y, z0), b = new THREE.Vector3(x1, y, z0), c = new THREE.Vector3(x1, y, z1), d = new THREE.Vector3(x0, y, z1);
    this.tri(OUTSIDE, a, b, c); this.tri(OUTSIDE, a, c, d);
  }
  // A flat band along points (round joints), per point half widths.
  ribbon(pts: readonly THREE.Vector3[], hws: number | readonly number[], y: number, color: THREE.Color): void {
    for (let k = 0; k + 1 < pts.length; k++) {
      const p = pts[k]!, q = pts[k + 1]!, d = q.clone().sub(p);
      if (d.lengthSq() < 1e-12) continue;
      const hw = typeof hws === 'number' ? hws : hws[k + 1]!;
      const n = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(hw);
      const a0 = p.clone().add(n).setY(y), a1 = p.clone().sub(n).setY(y), b0 = q.clone().add(n).setY(y), b1 = q.clone().sub(n).setY(y);
      this.tri(color, a0, b0, b1); this.tri(color, a0, b1, a1);
      for (let s = 0; s < 6; s++) {
        const t0 = (s / 6) * Math.PI * 2, t1 = ((s + 1) / 6) * Math.PI * 2;
        this.tri(color, q.clone().setY(y), q.clone().add(new THREE.Vector3(Math.cos(t0) * hw, y, Math.sin(t0) * hw)), q.clone().add(new THREE.Vector3(Math.cos(t1) * hw, y, Math.sin(t1) * hw)));
      }
    }
  }
  polygon(pts: readonly THREE.Vector3[], y: number, color: THREE.Color): void {
    if (pts.length < 3) return;
    const m = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length).setY(y);
    pts.forEach((p, k) => this.tri(color, m, p.clone().setY(y), pts[(k + 1) % pts.length]!.clone().setY(y)));
  }
  // A tile's stubs, as little marks just outside its rim.
  marks(f: FlatTile, c: readonly EdgeValue[]): void {
    c.forEach((v, j) => {
      const a = corner(6, j), b = corner(6, j + 1);
      for (const u of STUB_U[v]) {
        const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        this.ribbon([this.canon(f, p), this.canon(f, { x: p.x * 1.08, y: p.y * 1.08 })], 0.012, 0.003, STUB);
      }
    });
  }

  private modelRadius(kind: BuildingKind): number {
    let r = this.radius.get(kind);
    if (r === undefined) {
      const g = buildBuildingGeometry(kind); g.computeBoundingBox();
      const b = g.boundingBox!;
      r = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
      this.radius.set(kind, r);
    }
    return r;
  }
  // A model at `at`, turned by yaw (radians, around up), scaled (x, y, z).
  model(kind: BuildingKind, at: THREE.Vector3, yaw: number, scale: THREE.Vector3, roof: number, shade = 1): void {
    const key = `${kind}|${roof}`;
    let e = this.instances.get(key);
    if (!e) { e = { kind, roof, mats: [], cols: [] }; this.instances.set(key, e); }
    e.mats.push(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), scale));
    e.cols.push(new THREE.Color(shade, shade, shade));
  }
  // The yaw that turns a model's front toward `face` (as cityProps.ts does).
  yawToward(at: THREE.Vector3, face: THREE.Vector3): number { const f = face.clone().sub(at); return Math.atan2(-f.z, f.x) + Math.PI / 2; }

  // A massing model on a lot: walls the footprint wide, its floors high, a
  // gable roof on low buildings (as cityProps.ts standMass).
  building(kind: Footprint, floors: Floors, at: THREE.Vector3, yaw: number, roof: number, shade = 1): void {
    const [lw, ld] = LOT_SIZE[kind];
    const unit = 0.01, w = 2 * lw * FIT, d = 2 * ld * FIT, h = floors * FLOOR_HEIGHT;
    const tall = floors > 2;
    this.model(tall ? 'massTower' : 'massWalls', at, yaw, new THREE.Vector3(w / unit, h / unit, d / unit), tall ? BUILDINGS_CATALOG.massTower.leaf : roof, shade);
    if (!tall) this.model('massGable', at.clone().setY(at.y + h), yaw, new THREE.Vector3(w / unit, (0.33 * d) / unit, d / unit), roof);
    // The door, on the front (the model's +z, toward its street).
    const [dw, dh] = doorSize(kind, floors);
    const front = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.model('massDoor', at.clone().addScaledVector(front, d / 2), yaw, new THREE.Vector3(dw / unit, dh / unit, 0.003 / unit), BUILDINGS_CATALOG.massDoor.leaf);
  }

  // A stamp (cityStamp.ts) as the game would show it.
  stamp(st: Stamp, opts: { walls?: boolean; spots?: boolean } = {}): void {
    for (const q of st.squares) this.polygon(q.pts.map((p) => this.toPlane(p)), 0.0015, q.paved ? PLAZA_RGB : GREEN_RGB);
    for (const s of st.streets) this.ribbon(s.pts.map((p) => this.toPlane(p)), s.hw, 0.002, STREET_RGB);
    const used = new Set<string>();
    if (opts.spots ?? true) {
      st.spots.forEach((sp, n) => {
        used.add(`${sp.tile}:${sp.k}`);
        const kind = SAMPLE[(sp.tile * 3 + n) % SAMPLE.length]!;
        const at = this.toPlane(sp.at), s = HOUSE * Math.min(1, (1.15 * sp.r) / (this.modelRadius(kind) * HOUSE));
        this.model(kind, at, this.yawToward(at, this.toPlane(sp.face)), new THREE.Vector3(s, s, s), BUILDINGS_CATALOG[kind].leaf);
      });
    }
    for (const h of st.halls) {
      const at = this.toPlane(h.at), s = HOUSE * Math.min(1.6, (1.15 * h.r) / (this.modelRadius('hall') * HOUSE));
      this.model('hall', at, this.yawToward(at, this.toPlane(h.face)), new THREE.Vector3(s, s * (h.tall ?? 1), s), 0x5f5650);
    }
    for (const w of st.wonders) {
      const at = this.toPlane(w.at), s = HOUSE * Math.min(1, (1.0 * w.r) / (this.modelRadius('colosseum') * HOUSE));
      this.model('colosseum', at, 0, new THREE.Vector3(s, s, s), BUILDINGS_CATALOG.colosseum.leaf);
    }
    for (const l of st.lots) {
      if (l.spot !== undefined && used.has(`${l.tile}:${l.spot}`)) continue;
      const rand = mulberry32(l.seed);
      const at = this.toPlane(l.at), yaw = this.yawToward(at, this.toPlane(l.face));
      if (!isBuilding(l.kind)) {
        const kind = FURNITURE[l.kind as Exclude<LotKind, `b${string}`>];
        const s = HOUSE * (l.kind === 'tree' ? 0.8 + 0.4 * rand() : 1);
        this.model(kind, at, l.kind === 'tree' ? rand() * 6.28 : yaw, new THREE.Vector3(s, s, s), BUILDINGS_CATALOG[kind].leaf);
        continue;
      }
      this.building(l.kind, l.floors ?? 1, at, yaw, ROOF_PICK[Math.floor(rand() * ROOF_PICK.length)]!, 0.9 + 0.15 * rand());
    }
    if (opts.walls) {
      for (const w of st.walls) {
        const pts = w.pts.map((p) => this.toPlane(p));
        this.ribbon(pts, 0.007, 0.012, WALL_RGB);
        pts.forEach((p, n) => {
          if (n === 0 || n === pts.length - 1 || w.pts[n]!.wb === 0) this.model('wallTower', p, 0, new THREE.Vector3(HOUSE, HOUSE, HOUSE), BUILDINGS_CATALOG.wallTower.leaf);
        });
      }
    }
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
      const model = buildBuildingGeometry(e.kind, { leaf: e.roof });
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
