// Shared by the import scripts (rigBody.mjs, importHeads.mjs): models read
// from FBX, textures read, keyed and written.
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) };
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');

// A model's one mesh, its corners where they are in the world, and each
// triangle's three corners in order (their index into those).
export function loadMesh(file) {
  const buf = fs.readFileSync(file);
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  root.updateMatrixWorld(true);
  let mesh; root.traverse((o) => { if (o.isMesh) mesh = o; });
  const g = mesh.geometry, pos = g.attributes.position;
  return {
    points: Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)),
    index: g.index ? Array.from(g.index.array) : [...Array(pos.count).keys()],
    uv: g.attributes.uv,
  };
}

export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// An image, `size` px at most on its longer side, as RGBA (top row first).
// (Read through an uncompressed copy: sips, BMP.)
export function readImage(png, size) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'img-')), 'i.bmp');
  execFileSync('sips', ['-Z', String(size), '-s', 'format', 'bmp', png, '--out', tmp], { stdio: 'ignore' });
  const bmp = fs.readFileSync(tmp); fs.rmSync(path.dirname(tmp), { recursive: true });
  const off = bmp.readUInt32LE(10), w = bmp.readInt32LE(18), h0 = bmp.readInt32LE(22), h = Math.abs(h0), bpp = bmp.readUInt16LE(28) / 8, row = Math.ceil((w * bpp) / 4) * 4;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // (Rows run up from the bottom (h0 > 0); BGR.)
    const o = off + (h0 > 0 ? h - 1 - y : y) * row + x * bpp, at = (y * w + x) * 4;
    rgba[at] = bmp[o + 2]; rgba[at + 1] = bmp[o + 1]; rgba[at + 2] = bmp[o]; rgba[at + 3] = 255;
  }
  return { w, h, rgba };
}

// The owner's colour, keyed in solid magenta: made grey (its shading kept)
// and marked in the alpha (0: the owner's colour, all of it). Returns the
// share of the image keyed.
export function keyMagenta({ w, h, rgba }) {
  let keyed = 0;
  for (let at = 0; at < w * h * 4; at += 4) {
    const r = rgba[at] / 255, g = rgba[at + 1] / 255, b = rgba[at + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
    // (Magenta: red and blue well over green, the hue between purple and pink.)
    let hue = 0;
    if (c > 0) hue = mx === r ? (((g - b) / c) % 6) * 60 : mx === g ? ((b - r) / c + 2) * 60 : ((r - g) / c + 4) * 60;
    if (hue < 0) hue += 360;
    const m = c < 0.08 ? 0 : smooth(0.1, 0.2, c) * smooth(0.12, 0.25, c / Math.max(mx, 1e-3)) * smooth(270, 290, hue) * smooth(352, 338, hue);
    const grey = Math.min(1, ((r + b) / 2) * 1.45);
    rgba[at] = Math.round(255 * (r + (grey - r) * m)); rgba[at + 1] = Math.round(255 * (g + (grey - g) * m)); rgba[at + 2] = Math.round(255 * (b + (grey - b) * m));
    rgba[at + 3] = 255 - Math.round(254 * m);
    if (m > 0.5) keyed++;
  }
  return keyed / (w * h);
}

// A PNG: RGBA, 8 bits, its rows unfiltered.
export function pngOf({ w, h, rgba }) {
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type), body]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(tb)); return Buffer.concat([len, tb, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
