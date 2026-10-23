// Towers (twelve floors, metropolitan tiles) in the civs' own styles
// (architecture.ts). Most are skins on the glass tower's massing (houses.ts
// modern): a podium, setbacks, a crown; the pagoda and the Tokyo tower
// are shapes of their own. (The Stalinist tower is in quads.ts.)

import * as THREE from 'three';
import { cyl } from '../propCatalog.ts';
import {
  E, P, arch, box, chamfered, faceWidth, frustum, onFace, patch, pick, place, strips, tree, ALL, type Body, type Build, type G, type Lot,
} from '../houseKit.ts';

const GLASS = 0x56687a;
// The glass tower's massing: tiers of a body's footprint, each a share of its height.
const TIERS = [[1, 0.42], [0.82, 0.36], [0.64, 0.22]] as const;
function stack(b: Body, tiers: readonly (readonly [number, number])[] = TIERS): Body[] {
  let y = b.y;
  return tiers.map(([k, share]) => { const t = { x: b.x, z: b.z, w: b.w * k, d: b.d * k, y, h: b.h * share }; y += t.h; return t; });
}
const plaza = (l: Lot, c = 0xb8b4ac) => patch(2 * l.lw * 0.98, 2 * l.ld * 0.98, c);
const lines = (from: number, to: number, step: number) => { const out: number[] = []; for (let y = from + step; y < to - step * 0.3; y += step) out.push(y); return out; };

export const TOWER_STYLES = {
  // Egyptians, Babylonians, Persians: glass behind a sandstone lattice (mashrabiya), a pointed-arch portico.
  screen(l) {
    const sand = pick(l, [0xc9a46a, 0xd2b07a, 0xbf9a60]);
    const b = place(l, 0.6, 0.6, l.ld * 0.2), out: G[] = [plaza(l, 0xc8b898)];
    for (const t of stack(b)) {
      out.push(...box(t.w, t.h, t.d, 0x3a4650, { x: t.x, y: t.y, z: t.z }, sand));
      for (const f of ALL) {
        out.push(...strips(t, f, t.y, t.h, 0.0012, 0.006, sand, E * 3));
        for (const y of lines(t.y, t.y + t.h, 0.009)) out.push(onFace(t, f, 0, y, faceWidth(t, f), 0.0009, sand, E * 3));
      }
    }
    const front = b.z + b.d / 2, pb: Body = { x: b.x, z: front + 0.003, w: b.w * 1.1, d: 0.006, y: 0, h: 0.008 };
    out.push(...box(pb.w, pb.h, pb.d, sand, { x: pb.x, z: pb.z }));
    const n = Math.max(3, Math.floor(pb.w / 0.008));
    for (let i = 0; i < n; i++) out.push(...arch(pb, 'front', (i - (n - 1) / 2) * (pb.w / n), 0, (pb.w / n) * 0.6, 0.0045, 0x3a2a20, true));
    out.push(...box(b.w * 0.64 * 0.7, 0.004, b.d * 0.64 * 0.7, sand, { x: b.x, y: b.h, z: b.z }));
    return out;
  },

  // Romans: twin towers with staggered planted balconies (Milan's vertical forest).
  verticalForest(l) {
    const concrete = pick(l, [0xd6d3cc, 0xcfccc4, 0xdcd8d0]), greens = [0x5f8a3e, 0x7aa04a, 0x4f7a34], out: G[] = [plaza(l, 0xa8b098)];
    const w = 2 * l.lw * 0.36, d = 2 * l.ld * 0.42;
    for (const [x, z, k] of [[-l.lw * 0.42, -l.ld * 0.12, 1], [l.lw * 0.44, l.ld * 0.16, 0.78]] as const) {
      const h = l.H * k;
      out.push(...box(w, h, d, GLASS, { x, z }, concrete));
      const n = Math.floor(h / 0.017);
      for (let i = 1; i <= n; i++) {
        const y = (i * h) / (n + 1), side = i % 2 ? 1 : -1;
        out.push(...box(w + 0.004, 0.0008, d + 0.004, concrete, { x, y, z }));
        out.push(P(new THREE.OctahedronGeometry(0.003, 0), greens[i % 3]!, { x: x + side * w * 0.3, y: y + 0.0019, z: z + d / 2 + 0.0012, sy: 1.1 }));
        out.push(P(new THREE.OctahedronGeometry(0.0026, 0), greens[(i + 1) % 3]!, { x: x + side * (w / 2 + 0.0012), y: y + 0.0017, z: z - side * d * 0.2, sy: 1.1 }));
      }
      out.push(...box(w * 0.4, 0.004, d * 0.4, concrete, { x, y: h, z }));
    }
    out.push(...tree(-l.lw * 0.75, l.ld * 0.75, 0.9, 0x4f7a34), ...tree(l.lw * 0.75, -l.ld * 0.75, 0.9, 0x4f7a34));
    return out;
  },

  // English: London's glass: a shard of tilted panes, or a bullet wrapped in a diamond grid.
  highTech(l) {
    const out: G[] = [plaza(l)];
    if (l.v === 1) {
      // The bullet: a lathe-turned profile, dark rings for its diagrid.
      const R = Math.min(l.lw, l.ld) * 0.55, H = l.H * 0.85;
      const prof: [number, number][] = [[0.82, 0], [0.95, 0.12], [1, 0.3], [0.96, 0.5], [0.85, 0.68], [0.65, 0.83], [0.38, 0.94], [0.02, 1]];
      out.push(P(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(R * r, H * y)), 12), 0x5f8ea0));
      for (const [r, y] of prof.slice(1, 6)) out.push(cyl(R * r + 0.0003, R * r + 0.0003, 0.0009, 12, 0x2e3e48, { y: H * y }));
      out.push(...tree(-l.lw * 0.75, l.ld * 0.75, 0.9, 0x5e8a44), ...tree(l.lw * 0.75, l.ld * 0.75, 0.9, 0x5e8a44));
      return out;
    }
    const glass = pick(l, [0x8fb3c8, 0x9cbcd0, 0x8fb3c8]), b = place(l, 0.62, 0.62, l.ld * 0.19), H = b.h * 1.05, top = 0.12;
    out.push(...box(b.w * 1.2, 0.006, b.d * 1.2, 0xb8c4cc, { x: b.x, z: b.z }));
    out.push(...frustum(b.w, b.d, b.w * top, b.d * top, H, glass, { x: b.x, y: 0.006, z: b.z }));
    // Pale floor lines up the slopes, and the shards splaying at the top.
    for (let k = 1; k <= 6; k++) {
      const f = k / 7, ww = b.w * (1 - f * (1 - top)), dd = b.d * (1 - f * (1 - top));
      out.push(...frustum(ww + 0.0006, dd + 0.0006, ww + 0.0004, dd + 0.0004, 0.0008, 0xd8e2ea, { x: b.x, y: 0.006 + H * f, z: b.z }));
    }
    for (const [dx, dz, rz, rx] of [[1, 0, -0.18, 0], [-1, 0, 0.18, 0], [0, 1, 0, 0.18], [0, -1, 0, -0.18]] as const) {
      out.push(P(new THREE.PlaneGeometry(b.w * top, 0.014).translate(0, 0.007, 0), glass, { x: b.x + dx * b.w * top * 0.45, y: 0.006 + H, z: b.z + dz * b.d * top * 0.45, rz, rx, ry: dz ? 0 : Math.PI / 2 }));
    }
    return out;
  },

  // Germans: a dark bronze slab with fine mullions behind an open plaza (Mies).
  miesian(l) {
    const bronze = pick(l, [0x3a3631, 0x34302c, 0x403a32]), b = place(l, 0.6, 0.42, l.ld * 0.36), out: G[] = [plaza(l, 0xcfc8b8)];
    const lobby = 0.006, t: Body = { ...b, y: lobby, h: b.h - lobby };
    out.push(...box(b.w * 0.86, lobby, b.d * 0.8, 0x6c7f88, { x: b.x, z: b.z }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(...box(0.0014, lobby, 0.0014, bronze, { x: b.x + sx * (b.w / 2 - 0.0007), z: b.z + sz * (b.d / 2 - 0.0007) }));
    out.push(...box(b.w, t.h, b.d, bronze, { x: b.x, y: lobby, z: b.z }, 0x2a2622));
    for (const f of ALL) out.push(...strips(t, f, lobby, t.h, 0.0006, 0.0035, 0x8a6a42));
    out.push(...box(b.w * 0.5, 0.004, b.d * 0.5, bronze, { x: b.x, y: b.h, z: b.z }));
    // Two pools on the plaza.
    out.push(patch(l.lw * 0.5, l.ld * 0.22, 0x7d9fb0, -l.lw * 0.45, l.ld * 0.78, 0.0006), patch(l.lw * 0.5, l.ld * 0.22, 0x7d9fb0, l.lw * 0.45, l.ld * 0.78, 0.0006));
    return out;
  },

  // Ethiopians, Indians: tropical modernism: a concrete frame, deep sun-breaker fins, primary-coloured panels.
  briseSoleil(l) {
    const concrete = pick(l, [0xc9c4b6, 0xc0bbac, 0xd0cabc]), colors = [0xd94a32, 0xe5b93a, 0x3f6fb0];
    const b = place(l, 0.62, 0.56, l.ld * 0.2), out: G[] = [plaza(l, 0xb8b0a0)];
    const H = b.h * 0.9;
    out.push(...box(b.w, H, b.d, 0x8e897d, { x: b.x, z: b.z }, concrete));
    // Fins on the front and the back, a slab at every other floor, panels between.
    for (const side of [1, -1]) {
      const z = b.z + side * (b.d / 2 + 0.0015), n = Math.max(3, Math.round(b.w / 0.006));
      for (let i = 0; i <= n; i++) out.push(...box(0.0007, H, 0.003, concrete, { x: b.x - b.w / 2 + (i * b.w) / n, z }));
      for (const y of lines(0, H, 0.012)) out.push(...box(b.w, 0.0007, 0.003, concrete, { x: b.x, y, z }));
    }
    const placed = new Set<string>();
    for (let k = 0; k < 6; k++) {
      const n = Math.max(3, Math.round(b.w / 0.006)), i = (k * 5 + l.v) % n, y = 0.012 * (1 + ((k * 7 + l.v * 3) % Math.max(2, Math.floor(H / 0.012) - 1)));
      // (One panel to a bay: two in one would flicker.)
      if (placed.has(`${k % 2}|${i}|${y}`)) continue;
      placed.add(`${k % 2}|${i}|${y}`);
      out.push(onFace(b, k % 2 ? 'back' : 'front', -b.w / 2 + (i + 0.5) * (b.w / n), y, b.w / n - 0.0009, 0.0105, colors[k % 3]!, E * 2));
    }
    for (const f of ['left', 'right'] as const) for (const y of lines(0, H, 0.006)) out.push(onFace(b, f, 0, y, b.d * 0.8, 0.0025, 0x3a3a36));
    // A sculptural canopy on the roof.
    out.push(P(new THREE.PlaneGeometry(b.w * 1.1, b.d * 0.7).rotateX(-Math.PI / 2 + 0.25), concrete, { x: b.x, y: H + 0.006, z: b.z }));
    for (const sx of [-1, 1]) out.push(...box(0.0012, 0.006, 0.0012, concrete, { x: b.x + sx * b.w * 0.4, y: H, z: b.z }));
    return out;
  },

  // Aztecs: a windowless block wrapped in a mosaic mural over a glass base (the UNAM library).
  mural(l) {
    const stone = 0xe8e1d0, tiles = [0xb0352b, 0x2a7a9a, 0xd9a441, 0xe8e1d0, 0x5b7f3a, 0xc66a3a];
    const b = place(l, 0.66, 0.52, l.ld * 0.24), out: G[] = [plaza(l, 0xcfc6b0)];
    const h0 = b.h * 0.22, up: Body = { ...b, y: h0, h: b.h - h0 };
    out.push(...box(b.w * 0.94, h0, b.d * 0.94, GLASS, { x: b.x, z: b.z }, stone));
    for (const f of ALL) for (const y of lines(0, h0, 0.008)) out.push(onFace({ ...b, w: b.w * 0.94, d: b.d * 0.94 }, f, 0, y, faceWidth(b, f) * 0.94, 0.0008, stone));
    out.push(...box(b.w, up.h, b.d, stone, { x: b.x, y: h0, z: b.z }));
    // The mural: a field of coloured tiles on every face.
    for (const [fi, f] of ALL.entries()) {
      const fw = faceWidth(up, f), cols = Math.max(3, Math.round(fw / 0.006)), rows = 8, cw = fw / cols, rh = up.h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k = (r * 7 + c * 3 + ((r * c + fi) % 5) + l.v) % tiles.length;
        if (tiles[k] !== stone) out.push(onFace(up, f, -fw / 2 + (c + 0.5) * cw, h0 + r * rh + 0.0004, cw * 0.96, rh * 0.94, tiles[k]!));
      }
    }
    out.push(...box(b.w * 1.4, 0.007, b.d * 1.25, 0xcfc6b0, { x: b.x, z: b.z }));
    return out;
  },

  // Vikings: a mass-timber tower: wood cladding, bands of glass, an open timber frame on top (Mjøstårnet).
  timber(l) {
    const wood = pick(l, [0xb88a5a, 0xa87a4e, 0xc49a6a]), beam = 0x8a6038;
    const b = place(l, 0.56, 0.56, l.ld * 0.22), out: G[] = [plaza(l, 0xa8a898)];
    const H = b.h * 0.92, t: Body = { ...b, h: H };
    out.push(...box(b.w * 1.5, 0.006, b.d * 1.3, 0xd8c7a5, { x: b.x, z: b.z }));
    out.push(...box(b.w, H, b.d, wood, { x: b.x, z: b.z }));
    for (const f of ALL) {
      out.push(...strips(t, f, 0.006, H - 0.006, 0.0004, 0.003, beam));
      for (const y of lines(0.006, H, 0.0105)) out.push(onFace(t, f, 0, y, faceWidth(t, f) * 0.9, 0.0035, 0x3a4650, E * 2));
    }
    // The open frame on the roof: posts, a ring beam, braces.
    const fh = 0.012;
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(...box(0.0014, fh, 0.0014, beam, { x: b.x + x * (b.w / 2 - 0.0007), y: H, z: b.z + z * (b.d / 2 - 0.0007) }));
    out.push(...box(b.w, 0.0012, 0.0012, beam, { x: b.x, y: H + fh, z: b.z + b.d / 2 - 0.0006 }), ...box(b.w, 0.0012, 0.0012, beam, { x: b.x, y: H + fh, z: b.z - b.d / 2 + 0.0006 }));
    out.push(...box(0.0012, 0.0012, b.d, beam, { x: b.x + b.w / 2 - 0.0006, y: H + fh, z: b.z }), ...box(0.0012, 0.0012, b.d, beam, { x: b.x - b.w / 2 + 0.0006, y: H + fh, z: b.z }));
    const fb: Body = { ...b, y: H, h: fh };
    for (const f of ALL) out.push(P(new THREE.PlaneGeometry(0.0009, Math.hypot(faceWidth(fb, f), fh)).rotateZ(Math.atan2(faceWidth(fb, f), fh)).translate(0, H + fh / 2, 0).rotateY(f === 'front' ? 0 : f === 'back' ? Math.PI : f === 'right' ? Math.PI / 2 : -Math.PI / 2), beam, f === 'front' || f === 'back' ? { x: b.x, z: b.z + (f === 'front' ? 1 : -1) * (b.d / 2 - 0.0006) } : { x: b.x + (f === 'right' ? 1 : -1) * (b.w / 2 - 0.0006), z: b.z }));
    out.push(...tree(-l.lw * 0.76, l.ld * 0.76, 1, 0x3f5a35), ...tree(l.lw * 0.76, -l.ld * 0.76, 1, 0x3f5a35));
    return out;
  },

  // Chinese: a tower of stacked, outward-flaring tiers, green glass, a gold spire.
  pagoda(l) {
    const glass = pick(l, [0x4f8a7a, 0x5a9a88, 0x467a6c]), b = place(l, 0.56, 0.56, l.ld * 0.22), out: G[] = [plaza(l, 0xa8b0a8)];
    const podium = b.h * 0.06, base = b.h * 0.2, nt = 8, seg = (b.h * 0.6) / nt;
    out.push(...box(b.w * 1.3, podium, b.d * 1.3, 0x9fb8b0, { x: b.x, z: b.z }));
    out.push(...frustum(b.w * 0.86, b.d * 0.86, b.w * 0.74, b.d * 0.74, base, glass, { x: b.x, y: podium, z: b.z }));
    let y = podium + base;
    for (let i = 0; i < nt; i++, y += seg) {
      out.push(...frustum(b.w * 0.62, b.d * 0.62, b.w * 0.8, b.d * 0.8, seg, glass, { x: b.x, y, z: b.z }, i === nt - 1 ? glass : undefined));
      out.push(...frustum(b.w * 0.8 + 0.0006, b.d * 0.8 + 0.0006, b.w * 0.8 + 0.0006, b.d * 0.8 + 0.0006, 0.0007, 0xd8e8e0, { x: b.x, y: y + seg - 0.0007, z: b.z }));
    }
    out.push(...box(b.w * 0.4, seg, b.d * 0.4, glass, { x: b.x, y, z: b.z }), cyl(0.0007, 0.0002, b.h * 0.12, 4, 0xd2a53a, { x: b.x, y: y + seg, z: b.z }));
    return out;
  },

  // Japanese: Tokyo's office towers. Pale cladding banded floor by floor
  // (dark glass between white spandrels), chamfered corners, a lit sign
  // podium; on top a rescue helipad, or a red-and-white lattice mast (a nod
  // to Tokyo Tower); one in three a blue glass slab with white mullions.
  tokyo(l) {
    const clad = pick(l, [0xe4e4e0, 0xd6d8d8, 0xcfd2d6]), dark = 0x3c4652, out: G[] = [plaza(l, 0xb4b0a8)];
    const b = place(l, 0.62, 0.62, l.ld * 0.18);
    // The podium: shops, signs in a row of colours.
    const pod: Body = { x: b.x, z: b.z + 0.002, w: b.w * 1.18, d: b.d * 1.12, y: 0, h: 0.012 };
    out.push(...box(pod.w, pod.h, pod.d, 0xbdbab4, { x: pod.x, z: pod.z }));
    out.push(onFace(pod, 'front', 0, 0, pod.w * 0.8, 0.006, 0x2a3038));
    const signs = [0xc8423a, 0xe0b040, 0x3a7ab8, 0xe8e8e8];
    for (let i = 0; i < 4; i++) out.push(onFace(pod, 'front', (i - 1.5) * pod.w * 0.22, 0.007, pod.w * 0.18, 0.003, signs[(i + l.v) % 4]!, E * 2));
    if (l.v === 1) {
      // A blue glass slab, white mullions, a lattice mast on top.
      const t: Body = { x: b.x, z: b.z, w: b.w, d: b.d * 0.8, y: pod.h, h: l.H - pod.h };
      out.push(...box(t.w, t.h, t.d, 0x5a7894, { x: t.x, y: t.y, z: t.z }, 0xd8dade));
      for (const f of ALL) out.push(...strips(t, f, t.y, t.h, 0.0007, 0.005, 0xeef0f2, E * 2));
      for (let y = t.y + 0.018; y < t.y + t.h - 0.005; y += 0.018) for (const f of ALL) out.push(onFace(t, f, 0, y, faceWidth(t, f), 0.0012, 0xeef0f2, E * 3));
      const top = l.H;
      out.push(...box(t.w * 0.5, 0.006, t.d * 0.5, 0xd8dade, { x: t.x, y: top, z: t.z }));
      let y = top + 0.006, w = 0.008;
      for (let i = 0; i < 4; i++) {
        const h = 0.009;
        out.push(...frustum(w, w, w * 0.72, w * 0.72, h, i % 2 ? 0xeeeeea : 0xc8402e, { x: t.x, y, z: t.z }));
        y += h; w *= 0.72;
      }
      out.push(cyl(0.0004, 0.0002, 0.012, 3, 0xc8402e, { x: t.x, y, z: t.z }));
      return out;
    }
    // Banded towers, chamfered; the second steps back once (Shinjuku).
    const tiers: [number, number][] = l.v === 2 ? [[1, 0.62], [0.72, 0.38]] : [[1, 1]];
    let y = pod.h;
    for (const [k, share] of tiers) {
      const h = (l.H - pod.h) * share, t: Body = { x: b.x, z: b.z, w: b.w * k, d: b.d * k, y, h };
      out.push(...chamfered(t.w, h, t.d, 0.14, clad, { x: t.x, y, z: t.z }, 0xc4c6c8));
      const storey = 0.0085;
      for (let yy = y + storey * 0.35; yy < y + h - storey * 0.6; yy += storey) {
        for (const f of ALL) out.push(onFace(t, f, 0, yy, faceWidth(t, f) * 0.7, storey * 0.5, dark, E * 2));
      }
      y += h;
    }
    // On the roof: plant, and a rescue helipad (a dark pad, a white ring).
    const r = Math.min(b.w, b.d) * (l.v === 2 ? 0.26 : 0.34);
    out.push(...box(b.w * 0.3, 0.004, b.d * 0.25, 0xa8aaac, { x: b.x - b.w * 0.2, y, z: b.z - b.d * 0.25 }));
    out.push(P(new THREE.CircleGeometry(r, 10).rotateX(-Math.PI / 2), 0x3e4a46, { x: b.x + b.w * 0.08, y: y + 0.0002, z: b.z + b.d * 0.06 }));
    out.push(P(new THREE.RingGeometry(r * 0.72, r * 0.84, 10).rotateX(-Math.PI / 2), 0xf2f2ee, { x: b.x + b.w * 0.08, y: y + 0.0004, z: b.z + b.d * 0.06 }));
    out.push(...tree(-l.lw * 0.75, l.ld * 0.75, 0.9, 0x5e8a44));
    return out;
  },
} satisfies Record<string, Build>;

