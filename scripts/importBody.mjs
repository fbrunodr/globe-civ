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
let uv, team;
if (texFile) {
  const tb = fs.readFileSync(texFile), troot = new FBXLoader().parse(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength), '');
  troot.updateMatrixWorld(true);
  let tm; troot.traverse((o) => { if (o.isMesh) tm = o; });
  const tp = tm.geometry.attributes.position, tuv = tm.geometry.attributes.uv;
  const tw = (i) => new THREE.Vector3().fromBufferAttribute(tp, i).applyMatrix4(tm.matrixWorld);
  let tlo = Infinity, thi = -Infinity;
  for (let i = 0; i < tp.count; i++) { const p = tw(i); tlo = Math.min(tlo, p.y); thi = Math.max(thi, p.y); }
  // (Both fitted to 1 tall, standing on y = 0, centred alike: the copies can be a little apart.)
  const center = (ps) => { const b = new THREE.Box3().setFromPoints(ps); return new THREE.Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2); };
  const tk = 1 / (thi - tlo), tpts = [];
  for (let i = 0; i < tp.count; i++) { const p = tw(i); tpts.push(new THREE.Vector3(p.x * tk, (p.y - tlo) * tk, p.z * tk)); }
  const shift = center(verts.map((v) => new THREE.Vector3(...v))).sub(center(tpts));
  tpts.forEach((p) => p.add(shift));
  // (Each corner: its texture coordinates from a textured triangle with a
  // corner there, the one sharing most corners with this triangle: the same
  // triangle mostly; where the two split a four-sided face along different
  // diagonals, its neighbour across the split, on the same island of the texture.)
  const same = (p, q) => p.distanceToSquared(q) < 1e-8;
  uv = [];
  let exact = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const ps = [0, 1, 2].map((k) => new THREE.Vector3(...verts[tris[t + k]]));
    const shares = (i) => { const t0 = i - (i % 3); return [0, 1, 2].filter((k) => ps.some((p) => same(p, tpts[t0 + k]))).length; };
    for (const p of ps) {
      const cands = [];
      for (let i = 0; i < tpts.length; i++) if (same(p, tpts[i])) cands.push(i);
      if (!cands.length) throw new Error(`no textured corner at ${p.toArray()}`);
      const best = cands.reduce((a, b) => (shares(b) > shares(a) ? b : a));
      if (shares(best) === 3) exact++;
      uv.push(+tuv.getX(best).toFixed(5), +tuv.getY(best).toFixed(5));
    }
  }
  console.log(`texture: ${exact / 3} of ${tris.length / 3} triangles matched whole`);
  execFileSync('sips', ['-Z', '512', texPng, '--out', texOut], { stdio: 'ignore' });
  team = teamCloth(texPng, uv);
  // (A lone misread (a highlight, a shadow) takes its neighbours' side: each
  // triangle as most of those it shares an edge with, twice over.)
  const edges = new Map();
  for (let t = 0; t < tris.length / 3; t++) for (let k = 0; k < 3; k++) {
    const a = tris[t * 3 + k], b = tris[t * 3 + ((k + 1) % 3)], key = a < b ? `${a}|${b}` : `${b}|${a}`;
    (edges.get(key) ?? edges.set(key, []).get(key)).push(t);
  }
  const near = Array.from({ length: tris.length / 3 }, () => []);
  for (const ts of edges.values()) for (const t of ts) for (const u of ts) if (t !== u) near[t].push(u);
  for (let pass = 0; pass < 2; pass++) {
    const next = team.slice();
    near.forEach((ns, t) => { if (ns.length >= 2) { const on = ns.filter((u) => team[u]).length; if (on * 2 > ns.length) next[t] = 1; else if (on * 2 < ns.length) next[t] = 0; } });
    team = next;
  }
}
fs.writeFileSync(out, JSON.stringify({ source: file.split('/').pop(), limbs: LIMBS, joints: J, verts, weights, part, tris, ...(uv ? { uv, team } : {}) }));

// Which triangles are the owner's cloth: those the texture paints in the
// plain off-white the models' team garment is made in (nearly grey, any
// but the darkest: its folds are painted in), seen at their corners and middle. (The texture read through a
// small uncompressed copy: sips, BMP.)
function teamCloth(png, uv) {
  const tmp = `${out}.tmp.bmp`;
  execFileSync('sips', ['-Z', '256', '-s', 'format', 'bmp', png, '--out', tmp], { stdio: 'ignore' });
  const bmp = fs.readFileSync(tmp); fs.unlinkSync(tmp);
  const off = bmp.readUInt32LE(10), w = bmp.readInt32LE(18), h = bmp.readInt32LE(22), bpp = bmp.readUInt16LE(28) / 8, row = Math.ceil((w * bpp) / 4) * 4;
  const px = (u, v) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y = Math.min(Math.abs(h) - 1, Math.max(0, Math.floor(v * Math.abs(h))));
    // (Rows run up from the bottom (h > 0), as v does; BGR.)
    const o = off + (h > 0 ? y : Math.abs(h) - 1 - y) * row + x * bpp;
    return [bmp[o + 2] / 255, bmp[o + 1] / 255, bmp[o] / 255];
  };
  const out2 = [];
  for (let t = 0; t < uv.length / 6; t++) {
    const c = [0, 1, 2].map((k) => [uv[t * 6 + k * 2], uv[t * 6 + k * 2 + 1]]);
    const pts = [...c, [(c[0][0] + c[1][0] + c[2][0]) / 3, (c[0][1] + c[1][1] + c[2][1]) / 3]];
    let r = 0, g = 0, b = 0;
    for (const [u, v] of pts) { const [pr, pg, pb] = px(u, v); r += pr / 4; g += pg / 4; b += pb / 4; }
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    // (Cloth in shade too (folds are painted in): any but the darkest; skin, hair and leather have colour.)
    out2.push(l > 0.2 && sat < 0.15 ? 1 : 0);
  }
  return out2;
}
console.log(`${out}: ${verts.length} corners, ${tris.length / 3} triangles, ${roots.length} parts`);
