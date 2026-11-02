// Converts a Mixamo-rigged, low-poly character (FBX, its parts separate
// surfaces) into a body for the units (src/importedBody.ts), as JSON:
//   node scripts/importBody.mjs <rigged.fbx> <out.json> [<textured.fbx> <texture.png> <out.png>]
// With a textured copy of the same model (its texture coordinates; it may
// be unrigged), each triangle's corners keep theirs (`uv`, matched by
// position), and its texture is written at 512 px.
// Kept: the rest pose (scaled to 1 tall, standing on y = 0, facing +z),
// each vertex's part (its connected surface) and its weights on our
// limbs (summed over the bones of each), and where the joints are.
import fs from 'node:fs';
import * as THREE from 'three';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) };
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');

import { execFileSync } from 'node:child_process';
const [file, out, texFile, texPng, texOut] = process.argv.slice(2);
const buf = fs.readFileSync(file);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
root.updateMatrixWorld(true);
let mesh; root.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = pos.count;
const world = (i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
// (Size: 1 tall, its feet on y = 0.)
let lo = Infinity, hi = -Infinity;
for (let i = 0; i < n; i++) { const p = world(i); lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
const k = 1 / (hi - lo), fit = (p) => [+(p.x * k).toFixed(5), +((p.y - lo) * k).toFixed(5), +(p.z * k).toFixed(5)];
// Our limbs: each bone's (its name, past the side).
const LIMBS = ['body', 'armL', 'foreL', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR'];
const limbOf = (name) => {
  const b = name.replace('mixamorig', ''), side = b.startsWith('Left') ? 'L' : b.startsWith('Right') ? 'R' : '';
  if (/^(Left|Right)Arm$/.test(b)) return `arm${side}`;
  if (/^(Left|Right)(ForeArm|Hand)/.test(b)) return `fore${side}`;
  if (/^(Left|Right)UpLeg$/.test(b)) return `thigh${side}`;
  if (/^(Left|Right)(Leg|Foot|Toe)/.test(b)) return `shin${side}`;
  return 'body';
};
const boneLimb = mesh.skeleton.bones.map((b) => LIMBS.indexOf(limbOf(b.name)));
// (Unique corners, by position: the triangles index them.)
const ids = new Map(), verts = [], weights = [], tris = [];
for (let i = 0; i < n; i++) {
  const p = fit(world(i)), key = p.join(',');
  let id = ids.get(key);
  if (id === undefined) {
    id = verts.length; ids.set(key, id); verts.push(p);
    const w = new Array(LIMBS.length).fill(0);
    for (let c = 0; c < 4; c++) w[boneLimb[si.getComponent(i, c)]] += sw.getComponent(i, c);
    weights.push(w.map((x) => +x.toFixed(3)));
  }
  tris.push(id);
}
// Parts: connected surfaces.
const par = verts.map((_, i) => i), find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
for (let t = 0; t < tris.length; t += 3) { const a = find(tris[t]); par[find(tris[t + 1])] = a; par[find(tris[t + 2])] = a; }
const roots = [...new Set(verts.map((_, i) => find(i)))], part = verts.map((_, i) => roots.indexOf(find(i)));
// Joints, at rest.
const J = {};
for (const b of mesh.skeleton.bones) {
  const name = b.name.replace('mixamorig', '');
  if (/^(Left|Right)(Arm|ForeArm|Hand|UpLeg|Leg|Foot)$|^(Hips|Neck|Head|HeadTop_End)$/.test(name)) J[name] = fit(b.getWorldPosition(new THREE.Vector3()));
}
// Texture coordinates: from the textured copy, each triangle matched by
// its middle, each corner by its place (both fitted to 1 tall).
let uv;
if (texFile) {
  const tb = fs.readFileSync(texFile), troot = new FBXLoader().parse(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength), '');
  troot.updateMatrixWorld(true);
  let tm; troot.traverse((o) => { if (o.isMesh) tm = o; });
  const tp = tm.geometry.attributes.position, tuv = tm.geometry.attributes.uv;
  const tw = (i) => new THREE.Vector3().fromBufferAttribute(tp, i).applyMatrix4(tm.matrixWorld);
  let tlo = Infinity, thi = -Infinity;
  for (let i = 0; i < tp.count; i++) { const p = tw(i); tlo = Math.min(tlo, p.y); thi = Math.max(thi, p.y); }
  const tk = 1 / (thi - tlo), tfit = (p) => new THREE.Vector3(p.x * tk, (p.y - tlo) * tk, p.z * tk);
  const T = [];
  for (let t = 0; t < tp.count; t += 3) { const c = [0, 1, 2].map((k) => tfit(tw(t + k))); T.push({ t, c, mid: c[0].clone().add(c[1]).add(c[2]).divideScalar(3) }); }
  uv = [];
  for (let t = 0; t < tris.length; t += 3) {
    const c = [0, 1, 2].map((k) => new THREE.Vector3(...verts[tris[t + k]]));
    const mid = c[0].clone().add(c[1]).add(c[2]).divideScalar(3);
    let best = T[0], bd = Infinity;
    for (const x of T) { const d = x.mid.distanceToSquared(mid); if (d < bd) { bd = d; best = x; } }
    for (const p of c) {
      let k = 0, kd = Infinity;
      best.c.forEach((q, j) => { const d = q.distanceToSquared(p); if (d < kd) { kd = d; k = j; } });
      uv.push(+tuv.getX(best.t + k).toFixed(5), +tuv.getY(best.t + k).toFixed(5));
    }
  }
  execFileSync('sips', ['-Z', '512', texPng, '--out', texOut], { stdio: 'ignore' });
}
fs.writeFileSync(out, JSON.stringify({ source: file.split('/').pop(), limbs: LIMBS, joints: J, verts, weights, part, tris, ...(uv ? { uv } : {}) }));
console.log(`${out}: ${verts.length} corners, ${tris.length / 3} triangles, ${roots.length} parts`);
