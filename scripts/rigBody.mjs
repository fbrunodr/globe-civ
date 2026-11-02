// Rigs a textured, unrigged low-poly character (FBX, A-pose, one surface)
// for the units (src/importedBody.ts), as scripts/importBody.mjs does a
// rigged one, its owner's colour keyed in solid magenta:
//   node scripts/rigBody.mjs <textured.fbx> <texture.png> <out.json> <out.png>
// The skeleton is found from the shape: the arms' line from the shoulder
// (where the reference body's is) to the fingertips (the farthest out), the
// elbow and wrist along it; the knees and ankles in the middle of each
// leg's slice. Each corner hangs from a limb by how near its line it is,
// eased off towards the shoulder and the hip (and, between the legs, a
// skirt's middle stays with the body), and from the limb's lower piece past
// the elbow or knee. The texture is written at 512 px, its magenta made
// grey (its shading kept) and marked in the alpha (0: the owner's colour,
// all of it; the shader paints it so, pixel by pixel).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) };
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');

const [file, png, out, pngOut] = process.argv.slice(2);
const buf = fs.readFileSync(file);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
root.updateMatrixWorld(true);
let mesh; root.traverse((o) => { if (o.isMesh) mesh = o; });
const g = mesh.geometry, pos = g.attributes.position, tuv = g.attributes.uv;
const index = g.index ? Array.from(g.index.array) : [...Array(pos.count).keys()];
const raw = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
// (Size: 1 tall, its feet on y = 0, centred on its hips.)
const box = new THREE.Box3().setFromPoints(raw), k = 1 / (box.max.y - box.min.y);
const hipsZ = (() => { const zs = raw.filter((p) => (p.y - box.min.y) * k > 0.3 && (p.y - box.min.y) * k < 0.5).map((p) => p.z); return zs.reduce((a, b) => a + b, 0) / zs.length; })();
const cx = (box.min.x + box.max.x) / 2;
const fit = (p) => new THREE.Vector3((p.x - cx) * k, (p.y - box.min.y) * k, (p.z - hipsZ) * k);
// (Unique corners, by position: the triangles index them; each triangle's corners keep their texture coordinates.)
const ids = new Map(), verts = [], tris = [], uv = [];
for (const i of index) {
  const p = fit(raw[i]), key = p.toArray().map((x) => x.toFixed(5)).join(',');
  let id = ids.get(key);
  if (id === undefined) { id = verts.length; ids.set(key, id); verts.push(p); }
  tris.push(id); uv.push(+tuv.getX(i).toFixed(5), +tuv.getY(i).toFixed(5));
}
const mean = (ps) => ps.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(Math.max(1, ps.length));
const sat = (x) => Math.max(0, Math.min(1, x)), smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// The skeleton. (The reference body's, scripts/importBody.mjs's wanderer:
// where the shoulders are, and how far along the arm its elbow and wrist.)
const J = {};
const side = (s) => verts.filter((p) => Math.sign(p.x) === s);
for (const [s, name] of [[1, 'Left'], [-1, 'Right']]) {
  const tip = side(s).reduce((a, b) => (b.x * s > a.x * s ? b : a));
  const sh = new THREE.Vector3(0.117 * s * Math.abs(tip.x) / 0.334, 0.771, 0);
  const u = tip.clone().sub(sh), len = u.length(); u.normalize();
  // (A joint: the middle of the arm's slice there, square to its line.)
  const across = (t) => mean(verts.filter((p) => { const r = p.clone().sub(sh), a = r.dot(u); return Math.abs(a - t * len) < 0.02 && r.addScaledVector(u, -a).length() < 0.08; }));
  const el = across(0.36), wr = across(0.76);
  sh.z = el.z;
  J[`${name}Arm`] = sh; J[`${name}ForeArm`] = el; J[`${name}Hand`] = wr; J[`${name}Tip`] = tip;
  // (The legs: the middle of each one's slice at the knee and the ankle.)
  const slice = (y0, y1) => mean(side(s).filter((p) => p.y > y0 && p.y < y1 && Math.abs(p.x) > 0.01));
  const knee = slice(0.22, 0.28), ankle = slice(0.05, 0.12);
  J[`${name}UpLeg`] = new THREE.Vector3(knee.x * 0.62, 0.482, knee.z); J[`${name}Leg`] = knee; J[`${name}Foot`] = ankle;
}
const mid = (y0, y1) => mean(verts.filter((p) => p.y > y0 && p.y < y1 && Math.abs(p.x) < 0.08));
// (The neck and head on the line through the face's middle: what hangs on the shoulders (a pelt) left out.)
const face = mid(0.88, 0.95).z;
J.Hips = new THREE.Vector3(0, 0.542, 0); J.Neck = new THREE.Vector3(0, 0.81, face); J.Head = new THREE.Vector3(0, 0.85, face); J.HeadTop_End = new THREE.Vector3(0, 1, face);

// The weights, on our limbs.
const LIMBS = ['body', 'armL', 'foreL', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR'];
// (How far a point is from a line through a and b, and how far along it.)
const along = (p, a, b) => { const u = b.clone().sub(a), l = u.length(); u.divideScalar(l); const r = p.clone().sub(a), t = r.dot(u); return { t, l, d: r.addScaledVector(u, -Math.max(0, Math.min(l, t))).length() }; };
const weights = verts.map((p) => {
  const w = new Array(LIMBS.length).fill(0);
  for (const [s, name, up, lo] of [[1, 'Left', 1, 2], [-1, 'Right', 3, 4]]) {
    // The arm: near its line, past the shoulder; the forearm past the elbow.
    const sh = J[`${name}Arm`], el = J[`${name}ForeArm`], { t, d } = along(p, sh, J[`${name}Tip`]);
    // (The hand all of it, past the wrist and near it, however its fingers hang from the arm's line.)
    const wr = J[`${name}Hand`], hand = Math.abs(p.x) > Math.abs(wr.x) - 0.04 && along(wr, sh, J[`${name}Tip`]).t - 0.01 < t && p.distanceTo(wr) < 0.14;
    const on = hand ? 1 : smooth(0.095, 0.07, d) * smooth(-0.01, 0.05, t), te = along(el, sh, J[`${name}Tip`]).t, lower = hand ? 1 : smooth(te - 0.025, te + 0.025, t);
    w[up] += on * (1 - lower); w[lo] += on * lower;
    // The leg: near its line, below the hip (the foot all of it); the shin below the knee.
    if (Math.sign(p.x) !== s) continue;
    const hip = J[`${name}UpLeg`], knee = J[`${name}Leg`], ankle = J[`${name}Foot`];
    const d2 = Math.min(along(p, hip, knee).d, along(p, knee, ankle).d);
    const leg = p.y < ankle.y + 0.02 ? 1 : smooth(hip.y, hip.y - 0.08, p.y) * smooth(0.11, 0.07, d2), shin = smooth(knee.y + 0.03, knee.y - 0.03, p.y);
    w[s === 1 ? 5 : 7] += leg * (1 - shin); w[s === 1 ? 6 : 8] += leg * shin;
  }
  const limbs = w.reduce((a, b) => a + b, 0);
  if (limbs > 1) for (let i = 1; i < w.length; i++) w[i] /= limbs;
  w[0] = Math.max(0, 1 - Math.min(1, limbs));
  return w.map((x) => +x.toFixed(3));
});

// The texture, at 512 px, its magenta keyed. (Read through an uncompressed
// copy: sips, BMP; written as a PNG with its alpha.)
const tmp = `${out}.tmp.bmp`;
execFileSync('sips', ['-Z', '512', '-s', 'format', 'bmp', png, '--out', tmp], { stdio: 'ignore' });
const bmp = fs.readFileSync(tmp); fs.unlinkSync(tmp);
const off = bmp.readUInt32LE(10), W = bmp.readInt32LE(18), H0 = bmp.readInt32LE(22), H = Math.abs(H0), bpp = bmp.readUInt16LE(28) / 8, row = Math.ceil((W * bpp) / 4) * 4;
const rgba = Buffer.alloc(W * H * 4);
let keyed = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  // (Rows run up from the bottom (H0 > 0); BGR.)
  const o = off + (H0 > 0 ? H - 1 - y : y) * row + x * bpp;
  const r = bmp[o + 2] / 255, gg = bmp[o + 1] / 255, b = bmp[o] / 255;
  const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), c = mx - mn;
  // (Magenta: red and blue well over green, the hue between purple and pink.)
  let hue = 0;
  if (c > 0) hue = mx === r ? (((gg - b) / c) % 6) * 60 : mx === gg ? ((b - r) / c + 2) * 60 : ((r - gg) / c + 4) * 60;
  if (hue < 0) hue += 360;
  const m = c < 0.08 ? 0 : smooth(0.1, 0.2, c) * smooth(0.12, 0.25, c / Math.max(mx, 1e-3)) * smooth(270, 290, hue) * smooth(352, 338, hue);
  const grey = Math.min(1, (r + b) / 2 * 1.45);
  const at = (y * W + x) * 4;
  rgba[at] = Math.round(255 * (r + (grey - r) * m)); rgba[at + 1] = Math.round(255 * (gg + (grey - gg) * m)); rgba[at + 2] = Math.round(255 * (b + (grey - b) * m));
  rgba[at + 3] = 255 - Math.round(254 * m);
  if (m > 0.5) keyed++;
}
fs.writeFileSync(pngOut, pngOf(W, H, rgba));
console.log(`texture: ${(100 * keyed / (W * H)).toFixed(1)}% keyed as the owner's colour`);

const r5 = (v) => [+v.x.toFixed(5), +v.y.toFixed(5), +v.z.toFixed(5)];
const joints = Object.fromEntries(Object.entries(J).filter(([n]) => !n.endsWith('Tip')).map(([n, v]) => [n, r5(v)]));
fs.writeFileSync(out, JSON.stringify({ source: file.split('/').pop(), key: 'magenta', limbs: LIMBS, joints, verts: verts.map(r5), weights, part: verts.map(() => 0), tris, uv }));
console.log(`${out}: ${verts.length} corners, ${tris.length / 3} triangles; joints`, Object.entries(joints).map(([n, v]) => `${n} ${v.map((x) => x.toFixed(2)).join(' ')}`).join(' · '));

// A PNG: RGBA, 8 bits, its rows unfiltered.
function pngOf(w, h, data) {
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type), body]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(tb)); return Buffer.concat([len, tb, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) data.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
