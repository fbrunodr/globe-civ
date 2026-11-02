// The heads (docs/asset-prompts.md: H1–H10, F1–F10), textured busts, made
// ready to set on the imported bodies (src/importedBody.ts) in place of
// their own:
//   node scripts/importHeads.mjs <out.json> <out.png> <id>=<model.fbx> ...
// (each model's texture beside it, the same name, .png).
// Each one: 1 tall, its neck's foot on y = 0, centred on its skull; what
// it was made wearing below the neck (a collar: it flares out from the
// neck) left off. Their textures share one image, side by side (cells of
// 256 px), each one's texture coordinates moved to its own cell and on by
// 1 (u from 1 to 2: the units' shader reads it there, apart from the body's).
import fs from 'node:fs';
import * as THREE from 'three';
import { loadMesh, readImage, keyMagenta, pngOf } from './texture.mjs';

const [out, pngOut, ...specs] = process.argv.slice(2);
// (The neck's foot, of the bust's height: just under the jaw.)
const NECK = 0.22, CELL = 256, COLS = 4, rows = Math.ceil(specs.length / COLS);
const atlas = { w: CELL * COLS, h: CELL * rows, rgba: Buffer.alloc(CELL * COLS * CELL * rows * 4) };
const heads = {};
specs.forEach((spec, n) => {
  const [id, file] = spec.split('=');
  const { points, index, uv } = loadMesh(file);
  const box = new THREE.Box3().setFromPoints(points), k = 1 / (box.max.y - box.min.y);
  // (Centred on the skull: the middle of what is above the ears.)
  const skull = new THREE.Box3().setFromPoints(points.filter((p) => (p.y - box.min.y) * k > 0.6));
  const c = skull.getCenter(new THREE.Vector3());
  const fit = (p) => new THREE.Vector3((p.x - c.x) * k, (p.y - box.min.y) * k, (p.z - c.z) * k);
  const ps = points.map(fit);
  // What it wears (a collar, the top of a shirt) is all below the jaw: the
  // neck is kept from there up, every triangle whose middle is below left off.
  const keep = [];
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    if (tri.reduce((s, i) => s + ps[i].y, 0) / 3 < NECK) continue;
    keep.push(...tri);
  }
  // (Then 1 tall again, from the neck's foot that is left.)
  const lo = Math.min(...keep.map((i) => ps[i].y)), hi = Math.max(...keep.map((i) => ps[i].y)), k2 = 1 / (hi - lo);
  const verts = [], tris = [], uvs = [], ids = new Map();
  const col = n % COLS, row = Math.floor(n / COLS);
  for (const i of keep) {
    const p = ps[i], key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
    let id2 = ids.get(key);
    if (id2 === undefined) { id2 = verts.length; ids.set(key, id2); verts.push([+(p.x * k2).toFixed(5), +((p.y - lo) * k2).toFixed(5), +(p.z * k2).toFixed(5)]); }
    tris.push(id2);
    // (Its own cell: u across the columns, v up the rows (the image's top row is v = 1).)
    uvs.push(+(1 + (col + uv.getX(i)) / COLS).toFixed(5), +((rows - 1 - row + uv.getY(i)) / rows).toFixed(5));
  }
  const img = readImage(file.replace(/\.fbx$/, '.png'), CELL);
  keyMagenta(img);
  for (let y = 0; y < CELL; y++) img.rgba.copy(atlas.rgba, ((row * CELL + y) * atlas.w + col * CELL) * 4, y * CELL * 4, (y + 1) * CELL * 4);
  heads[id] = { source: file.split('/').pop(), verts, tris, uv: uvs };
  console.log(`${id}: ${tris.length / 3} triangles (of ${index.length / 3}; the rest below the neck)`);
});
fs.writeFileSync(out, JSON.stringify(heads));
fs.writeFileSync(pngOut, pngOf(atlas));
