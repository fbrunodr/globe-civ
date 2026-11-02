// Writes a unit's figure as a GLB (rest pose, its colours per vertex) for
// texturing elsewhere: npx tsx scripts/exportModel.ts <unit> <civ> <out.glb>
// (One mesh, triangles unshared, as the game builds it: its colours guide
// the texture; the textured result is matched back to it by position.)
import { writeFileSync } from 'node:fs';
import { unitModel } from '../src/unitModels.ts';
import type { UnitKey } from '../src/rules.ts';
import type { ArchCiv } from '../src/architecture.ts';

const [unit, civ, out] = process.argv.slice(2) as [UnitKey, ArchCiv, string];
const g = unitModel(unit, civ);
const pos = g.getAttribute('position').array as Float32Array, nor = g.getAttribute('normal').array as Float32Array, col = g.getAttribute('color').array as Float32Array;
const n = pos.length / 3;
// (Colours as RGBA bytes, normalized: sRGB, as the palettes are written.)
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const rgba = new Uint8Array(n * 4);
for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) rgba[i * 4 + k] = Math.round(255 * Math.min(1, toSrgb(col[i * 3 + k]!))); rgba[i * 4 + 3] = 255; }
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, pos[i * 3 + k]!); max[k] = Math.max(max[k]!, pos[i * 3 + k]!); }
const bin = Buffer.concat([Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength), Buffer.from(nor.buffer, nor.byteOffset, nor.byteLength), Buffer.from(rgba.buffer)]);
const json = {
  asset: { version: '2.0', generator: 'globe-civ exportModel' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: `${unit}_${civ}` }],
  meshes: [{ name: `${unit}_${civ}`, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0 }] }],
  materials: [{ name: 'painted', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: nor.byteLength }, { buffer: 0, byteOffset: pos.byteLength * 2, byteLength: rgba.byteLength }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' },
    { bufferView: 2, componentType: 5121, normalized: true, count: n, type: 'VEC4' },
  ],
};
const pad = (b: Buffer, fill: number) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
const j = pad(Buffer.from(JSON.stringify(json)), 0x20), b = pad(bin, 0);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
const chunk = (data: Buffer, type: number) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
writeFileSync(out, Buffer.concat([head, chunk(j, 0x4e4f534a), chunk(b, 0x004e4942)]));
console.log(`${out}: ${n / 3} triangles`);
