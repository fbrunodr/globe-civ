// City halls: each civ's own, and grander as its tile grows denser. Four
// tiers: a village hall (low, medium), a city hall (dense), a grand hall
// (high), and the grand hall with a modern tower behind it (metropolitan).
// Built at true size (HALL_RADIUS: the circle its room fits, inside the
// tile's site, town/geometry.ts SITE_CELLS), never stretched.
//
// Units are tile steps, as the lot models (houseKit.ts); the origin is the
// middle of the spot on the ground, the front (+z) faces the square.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cone, cyl } from './propCatalog.ts';
import { CELL, SITE_CELLS, wallHeight, type Density } from './town/geometry.ts';
import { ARCH_CIVS, type ArchCiv } from './architecture.ts';
import {
  BAND, E, arch, bands, box, disc, dome, drum, frustum, gable, hip, merlons, onFace, onion, patch, shade, shrub, spire, strips,
  type Body, type Face, type G,
} from './houseKit.ts';

export type CivicKind = `civic|${ArchCiv}|${Density}`;
export const civicKind = (civ: ArchCiv, d: Density): CivicKind => `civic|${civ}|${d}`;
export const isCivicKind = (k: string): k is CivicKind => k.startsWith('civic|');

// The hall grows with its tile's density, within the site's square.
export const HALL_RADIUS: Record<Density, number> = { low: 0.045, medium: 0.045, dense: 0.054, high: 0.062, metropolitan: 0.075 };
export const SITE_HALF = (SITE_CELLS * CELL) / 2;

type Tier = 0 | 1 | 2 | 3;
const TIER: Record<Density, Tier> = { low: 0, medium: 0, dense: 1, high: 2, metropolitan: 3 };
// A hall's room: half width across its front and half depth (inside the
// spot's circle), its walls' height and storeys, its tier.
interface Hall { hw: number; hd: number; H: number; n: number; tier: Tier }
const hallOf = (d: Density): Hall => {
  const r = HALL_RADIUS[d], tier = TIER[d], n = [2, 3, 4, 4][tier]!;
  return { hw: 0.8 * r, hd: 0.58 * r, H: wallHeight(n as 2 | 3 | 4), n, tier };
};

const WIN = 0x2e3238, DOOR = 0x4a3426, GLASS = 0x5a6c7c, GOLD = 0xc9a24a;
const body = (w: number, d: number, h: number, x = 0, z = 0, y = 0): Body => ({ x, z, w, d, y, h });
const solid = (b: Body, c: number, top = c) => box(b.w, b.h, b.d, c, { x: b.x, y: b.y, z: b.z }, top);

// Windows floor by floor on the faces: rectangles, round-headed or pointed
// arches, about `spacing` apart (the middle of the ground floor of the
// front left for the door).
function fenestrate(b: Body, faces: readonly Face[], n: number, o: { w: number; spacing: number; kind?: 'rect' | 'arch' | 'pointed'; color?: number; from?: number; tall?: number }): G[] {
  const out: G[] = [], storey = b.h / n;
  for (const f of faces) {
    const fw = f === 'front' || f === 'back' ? b.w : b.d, k = Math.max(1, Math.floor((fw - 0.004) / o.spacing));
    for (let s = o.from ?? 0; s < n; s++) for (let i = 0; i < k; i++) {
      const along = (i - (k - 1) / 2) * (fw / k);
      if (f === 'front' && s === 0 && Math.abs(along) < fw / k / 2 + 1e-9) continue;
      const h = storey * (o.tall ?? 0.45), y = b.y + s * storey + storey * 0.28;
      if (o.kind === 'arch' || o.kind === 'pointed') out.push(...arch(b, f, along, y, o.w, h - o.w / 2, o.color ?? WIN, o.kind === 'pointed'));
      else out.push(onFace(b, f, along, y, o.w, h, o.color ?? WIN));
    }
  }
  return out;
}
const door = (b: Body, w: number, h: number, arched = false, c = DOOR) => (arched ? arch(b, 'front', 0, b.y, w, h - w / 2, c) : [onFace(b, 'front', 0, b.y, w, h, c)]);
// A clock face on a body's front at height y.
const clock = (b: Body, y: number, r: number): G[] => [disc(b, 'front', 0, y, r, 0xe8e2d0), disc(b, 'front', 0, y, r * 0.18, 0x2a2a2a, E * 2)];
// Columns along a front, depth out from it, with an entablature on them.
function colonnade(b: Body, n: number, h: number, c: number, depth: number, top = c): G[] {
  const out: G[] = [], z = b.z + b.d / 2 + depth, r = Math.min(0.0011, b.w / n / 5);
  for (let i = 0; i < n; i++) out.push(cyl(r, r * 0.85, h, 6, c, { x: b.x - b.w / 2 + b.w * (i + 0.5) / n, y: b.y, z }));
  out.push(...box(b.w, h * 0.12, depth * 2 + r * 2, top, { x: b.x, y: b.y + h, z: b.z + b.d / 2 + depth / 2 }));
  return out;
}
// A temple front: columns and a pediment over them.
function portico(b: Body, n: number, h: number, c: number, roof: number, depth = 0.008): G[] {
  const sub = { ...b, w: Math.min(b.w, n * 0.008) };
  return [
    ...colonnade(sub, n, h, c, depth),
    ...gable(sub.w + 0.002, depth * 2 + 0.003, Math.min(0.009, sub.w * 0.22), roof, { x: b.x, y: b.y + h * 1.12, z: b.z + b.d / 2 + depth / 2 }, true, c),
  ];
}
// A square tower at (x, z), w wide and h tall, with a cap.
type Cap = 'spire' | 'hip' | 'onion' | 'dome' | 'crenel' | 'tent' | 'flat';
function tower(x: number, z: number, w: number, h: number, wall: number, cap: Cap, capC: number, withClock = false): G[] {
  const b = body(w, w, h, x, z), out = solid(b, wall);
  out.push(...box(w + 0.0012, 0.001, w + 0.0012, shade(wall, 0.9), { x, y: h - 0.0012, z }));
  // A belfry opening on each face, and a clock under it.
  for (const f of ['front', 'back', 'left', 'right'] as Face[]) out.push(...arch(b, f, 0, h - w * 0.95, w * 0.4, w * 0.5, WIN));
  if (withClock) out.push(...clock(b, h - w * 1.6, w * 0.3));
  const top = h + 0.0002;
  if (cap === 'spire') out.push(spire(w * 1.05, w * 2.6, capC, { x, y: top, z }));
  else if (cap === 'tent') out.push(spire(w * 1.05, w * 1.8, capC, { x, y: top, z }));
  else if (cap === 'hip') out.push(hip(w * 1.2, w * 1.2, w * 0.7, capC, { x, y: top, z }));
  else if (cap === 'onion') out.push(...drum(w * 0.3, w * 0.3, w * 0.5, 6, wall, { x, y: top, z }), ...onion(w * 0.45, capC, { x, y: top + w * 0.5, z }));
  else if (cap === 'dome') out.push(...drum(w * 0.42, w * 0.42, w * 0.35, 8, wall, { x, y: top, z }), dome(w * 0.42, capC, { x, y: top + w * 0.35, z }));
  else if (cap === 'crenel') out.push(...merlons({ ...b, y: top }, top, w * 0.18, w * 0.3, wall));
  return out;
}
// Behind the old hall in a metropolis: the city's offices in a tower.
function annex(h: Hall, trim: number, x = 0): G[] {
  const w = h.hw * 0.85, d = h.hd * 0.6, z = -h.hd + d / 2 + 0.001, H = h.H * 1.8;
  const b = body(w, d, H, x, z), out = solid(b, GLASS, trim);
  for (const y of [0.25, 0.5, 0.75].map((k) => k * H)) out.push(...bands(b, [y], 0.0008, trim));
  out.push(...strips(b, 'front', 0, H, 0.0008, 0.006, trim, E * 2), ...strips(b, 'left', 0, H, 0.0008, 0.006, trim, E * 2), ...strips(b, 'right', 0, H, 0.0008, 0.006, trim, E * 2));
  out.push(...box(w * 0.4, 0.004, d * 0.4, trim, { x, y: H, z }));
  return out;
}
// The hall's ground: paving under it, and shrubs at its corners.
const ground = (h: Hall, c: number): G[] => [patch(h.hw * 2.05, h.hd * 2.05, c), ...[-1, 1].map((s) => shrub(s * h.hw * 0.92, h.hd * 0.9, 0.002, 0x4f7a3a))];
// The front part of the hall's room: all of it, or the front share in a
// metropolis (its tower stands behind).
const front = (h: Hall) => (h.tier === 3 ? { d: h.hd * 2 * 0.55, z: h.hd - h.hd * 0.55 } : { d: h.hd * 2, z: 0 });

type HallBuild = (h: Hall) => G[];

const HALLS: Record<ArchCiv, HallBuild> = {
  // The Curia (a tall brick hall, a pediment); then the Senator's palace with its bell tower on the Capitol.
  Romans(h) {
    const brick = 0xa8705a, trav = 0xe0d6c0, roof = 0xb5653f, f = front(h), out = ground(h, 0xcfc4ac);
    if (h.tier === 0) {
      const b = body(h.hw * 1.4, f.d, h.H * 1.25, 0, f.z);
      out.push(...solid(b, brick), ...gable(b.w + 0.002, b.d + 0.002, 0.008, roof, { y: b.h, z: b.z }, true, trav));
      out.push(...bands(b, [b.h * 0.55], 0.001, trav), ...door(b, 0.007, 0.012), ...fenestrate(b, ['front'], 1, { w: 0.003, spacing: 0.012, from: 0, tall: 0.25 }));
      out.push(...box(b.w + 0.004, 0.002, 0.006, trav, { z: b.z + b.d / 2 + 0.003 }));
      return out;
    }
    const b = body(h.hw * 2, f.d, h.H, 0, f.z);
    out.push(...solid(b, trav), ...box(b.w + 0.001, h.H / h.n, b.d + 0.001, 0xcdbfa2, { z: b.z }), hip(b.w + 0.003, b.d + 0.003, 0.006, roof, { y: b.h, z: b.z })); // (a rusticated ground floor)
    out.push(...strips(b, 'front', 0, b.h, 0.0014, b.w / 6, 0xcdbfa2, BAND), ...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.003, spacing: 0.009, kind: 'arch' }), ...door(b, 0.007, 0.012, true));
    // A double flight of steps up to the door, and the bell tower in the middle.
    out.push(...box(0.02, 0.003, 0.006, 0xcdbfa2, { z: b.z + b.d / 2 + 0.003 }));
    out.push(...tower(0, b.z - b.d * 0.1, 0.012, h.H * 1.9, trav, 'spire', 0x8a8a7a, true));
    if (h.tier === 3) out.push(...annex(h, trav));
    return out;
  },
  // The bouleuterion: a temple front; then neoclassical Athens' long hall with its portico.
  Greeks(h) {
    const marble = 0xe8e4da, roof = 0xb87a5a, f = front(h), out = ground(h, 0xd8d2c4);
    const b = body(h.hw * (h.tier === 0 ? 1.5 : 2), f.d * (h.tier === 0 ? 0.75 : 0.8), h.H * (h.tier === 0 ? 1.1 : 1), 0, f.z - f.d * 0.1);
    out.push(...box(b.w + 0.006, 0.003, b.d + 0.012, marble, { z: b.z + 0.003 }));          // stylobate
    const up = { ...b, y: 0.003 };
    out.push(...solid(up, h.tier === 0 ? marble : 0xe6d8c0), ...fenestrate(up, ['left', 'right', 'front'], h.tier === 0 ? 1 : h.n, { w: 0.003, spacing: 0.009 }));
    out.push(...gable(b.w + 0.002, b.d + 0.002, 0.007, roof, { y: up.y + b.h, z: b.z }, true, marble));
    out.push(...portico(up, h.tier === 0 ? 6 : 8, b.h, marble, roof, 0.007));
    if (h.tier === 3) out.push(...annex(h, marble));
    return out;
  },
  // A ceremonial gate (two battered pylons) before a hall of columns; the grander, the taller.
  Egyptians(h) {
    const sand = 0xd2b47e, f = front(h), out = ground(h, 0xcdb48a);
    const hall = body(h.hw * 1.6, f.d * 0.6, h.H * 0.9, 0, f.z - f.d * 0.2);
    out.push(...solid(hall, shade(sand, 0.95)), ...box(hall.w + 0.002, 0.0015, hall.d + 0.002, shade(sand, 0.85), { y: hall.h, z: hall.z }));
    const ph = h.H * 1.35, pw = h.hw * 0.75, pz = f.z + f.d / 2 - 0.006;
    for (const s of [-1, 1]) {
      out.push(...frustum(pw, 0.012, pw * 0.62, 0.007, ph, sand, { x: s * (pw / 2 + 0.004), z: pz }, sand));
      out.push(...box(pw * 0.62 + 0.002, 0.0022, 0.0085, shade(sand, 0.88), { x: s * (pw / 2 + 0.004), y: ph, z: pz }));   // the cornice
      out.push(cyl(0.0005, 0.0005, ph * 1.1, 3, 0x6a5038, { x: s * 0.006, z: pz + 0.007 }));  // flagstaffs
    }
    const gb = body(0.008, 0.011, ph * 0.7, 0, pz);
    out.push(...solid(gb, sand), onFace(gb, 'front', 0, 0, 0.005, ph * 0.5, 0x3a2c22));
    out.push(...bands({ ...gb, w: pw * 2 + 0.008 }, [ph * 0.62], 0.0015, 0x4a6a8a, ['front']));
    if (h.tier >= 2) for (const s of [-1, 1]) out.push(cone(0.002, h.H * 1.4, 4, 0xd8c08a, { x: s * (pw + 0.009), z: pz + 0.006, ry: Math.PI / 4 })); // obelisks
    if (h.tier === 3) out.push(...annex(h, sand));
    return out;
  },
  // A crenellated palace of mudbrick with a glazed blue gate; a stepped tower behind it.
  Babylonians(h) {
    const mud = 0xc4a074, blue = 0x2f5d8a, f = front(h), out = ground(h, 0xc8ac80);
    const b = body(h.hw * 2, f.d * 0.7, h.H * 0.85, 0, f.z - f.d * 0.15);
    out.push(...solid(b, mud), ...merlons(b, b.h, 0.0025, 0.005, mud), ...strips(b, 'front', 0, b.h, 0.0016, 0.006, shade(mud, 0.9), BAND));
    const g = body(0.016, b.d + 0.004, b.h * 1.3, 0, b.z + 0.003);
    out.push(...solid(g, blue), ...merlons(g, g.h, 0.0025, 0.004, blue), ...arch(g, 'front', 0, 0, 0.007, g.h * 0.45, 0x2a2018));
    out.push(...bands(g, [g.h * 0.75], 0.0012, GOLD, ['front']));
    const zh = h.H * (0.5 + 0.25 * Math.min(h.tier, 2)), zw = h.hw * 1.2;
    for (let i = 0; i < 3; i++) out.push(...box(zw * (1 - i * 0.28), zh, zw * 0.5 * (1 - i * 0.2), shade(mud, 1 - i * 0.05), { z: b.z - b.d * 0.15, y: b.h * 0.5 + i * zh }));
    if (h.tier === 3) out.push(...annex(h, mud));
    return out;
  },
  // An iwan: a tall arched portal in a tiled frame, a turquoise dome behind; minarets beside the grander ones.
  Persians(h) {
    const brick = 0xc8a878, tile = 0x2e8a96, f = front(h), out = ground(h, 0xd0bc98);
    const b = body(h.hw * 1.8, f.d * 0.75, h.H * 0.8, 0, f.z - f.d * 0.1);
    out.push(...solid(b, brick), ...fenestrate(b, ['front', 'left', 'right'], Math.min(2, h.n), { w: 0.0035, spacing: 0.009, kind: 'pointed', color: 0x24404a }));
    const p = body(h.hw * 0.8, 0.008, h.H * 1.3, 0, b.z + b.d / 2 - 0.002);
    out.push(...solid(p, brick), onFace(p, 'front', 0, 0, p.w * 0.85, p.h * 0.94, tile), ...arch(p, 'front', 0, 0, p.w * 0.55, p.h * 0.55, 0x1e2a30, true, E * 2));
    const dr = h.hw * 0.45;
    out.push(...drum(dr, dr, h.H * 0.35, 10, tile, { z: b.z - b.d * 0.1, y: b.h }), dome(dr * 1.05, tile, { z: b.z - b.d * 0.1, y: b.h + h.H * 0.35, sy: 1.25 }, 10));
    if (h.tier >= 1) for (const s of [-1, 1]) out.push(...drum(0.0022, 0.0018, h.H * 1.7, 8, brick, { x: s * (p.w / 2 + 0.0025), z: p.z }), cone(0.0024, 0.004, 8, tile, { x: s * (p.w / 2 + 0.0025), y: h.H * 1.7, z: p.z }));
    if (h.tier === 3) out.push(...annex(h, brick));
    return out;
  },
  // Jerusalem stone, arched windows, a square tower with a small dome.
  Hebrews(h) {
    const stone = 0xe2d4b4, f = front(h), out = ground(h, 0xd8ccb0);
    const b = body(h.hw * 1.8, f.d * 0.8, h.H, 0, f.z - f.d * 0.05);
    out.push(...solid(b, stone), ...box(b.w + 0.0016, 0.0012, b.d + 0.0016, shade(stone, 0.92), { y: b.h - 0.001, z: b.z }));
    out.push(...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.003, spacing: 0.009, kind: 'arch' }), ...door(b, 0.007, 0.012, true));
    // An arcade before the door.
    const a = body(b.w * 0.5, 0.006, h.H / h.n, 0, b.z + b.d / 2 + 0.003);
    out.push(...solid(a, stone), ...[-1, 0, 1].flatMap((i) => arch(a, 'front', i * a.w / 3, 0, a.w / 4.5, a.h * 0.55, 0x3a3028)));
    out.push(...tower(b.w / 2 - 0.006, b.z - b.d * 0.15, 0.011, h.H * (1.5 + 0.2 * h.tier), stone, 'dome', 0x8a9a8a, h.tier >= 1));
    if (h.tier === 3) out.push(...annex(h, stone, -h.hw * 0.2));
    return out;
  },
  // A yamen: red columns on a stone terrace under a double-eaved roof, a gate before it.
  Chinese(h) {
    const red = 0x9a3a2a, roof = h.tier >= 2 ? 0xc89a3a : 0x4f5a5a, terr = 0xbdb6a8, f = front(h), out = ground(h, 0xbab2a2);
    const t = body(h.hw * 2, f.d * 0.8, 0.004 + 0.002 * h.tier, 0, f.z - f.d * 0.05);
    out.push(...solid(t, terr), ...box(0.012, t.h * 0.6, 0.006, terr, { z: t.z + t.d / 2 + 0.003 }));
    const b = body(t.w * 0.8, t.d * 0.7, h.H * 0.75, 0, t.z, t.h);
    out.push(...solid(b, 0xd8c8a8), ...strips(b, 'front', b.y, b.h, 0.0014, b.w / 7, red, E * 2), ...strips(b, 'left', b.y, b.h, 0.0014, b.d / 3, red, E * 2), ...strips(b, 'right', b.y, b.h, 0.0014, b.d / 3, red, E * 2));
    out.push(onFace(b, 'front', 0, b.y, 0.008, b.h * 0.7, 0x5a2a20, E * 3));
    const y1 = b.y + b.h;
    out.push(hip(b.w + 0.01, b.d + 0.01, 0.006, roof, { y: y1, z: b.z }), ...box(b.w * 0.75, 0.005, b.d * 0.6, red, { y: y1 + 0.004, z: b.z }), hip(b.w * 0.85, b.d * 0.8, 0.007, roof, { y: y1 + 0.009, z: b.z }));
    if (h.tier >= 1) for (const s of [-1, 1]) out.push(...box(0.003, 0.004, 0.003, 0x9a9488, { x: s * 0.01, z: t.z + t.d / 2 + 0.006 }), ...box(0.0022, 0.004, 0.0026, 0xc8c0b0, { x: s * 0.01, y: 0.004, z: t.z + t.d / 2 + 0.006 })); // a pair of guardian lions on plinths
    if (h.tier === 3) out.push(...annex(h, red));
    return out;
  },
  // A castle keep: a battered stone base, white walls, stacked roofs (more as the city grows).
  Japanese(h) {
    const white = 0xeeece6, roof = 0x4a5458, stone = 0x8d877c, f = front(h), out = ground(h, 0xb8b0a0);
    const base = h.H * 0.35, w0 = h.hw * 1.6, d0 = f.d * 0.8;
    out.push(...frustum(w0 + 0.008, d0 + 0.008, w0, d0, base, stone, { z: f.z - f.d * 0.05 }, stone));
    const tiers = 2 + Math.min(h.tier, 2);
    let y = base, w = w0 * 0.92, d = d0 * 0.92;
    for (let i = 0; i < tiers; i++) {
      const th = (h.H * 1.1) / tiers + 0.002, b = body(w, d, th, 0, f.z - f.d * 0.05, y);
      out.push(...solid(b, white), ...fenestrate(b, ['front', 'left', 'right', 'back'], 1, { w: 0.0022, spacing: 0.007, color: 0x2a2a2a, tall: 0.3 }));
      out.push(hip(w + 0.008, d + 0.008, i === tiers - 1 ? 0.008 : 0.004, roof, { y: y + th, z: b.z }));
      if (i % 2 === 1 || i === tiers - 1) out.push(...gable(w * 0.4, 0.004, 0.004, roof, { y: y + th, z: b.z + d / 2 + 0.001 }, true, white)); // a gable dormer
      y += th + (i === tiers - 1 ? 0 : 0.002); w *= 0.78; d *= 0.8;
    }
    out.push(cone(0.0008, 0.003, 4, GOLD, { x: -w * 0.5, y: y + 0.006, z: f.z - f.d * 0.05 }), cone(0.0008, 0.003, 4, GOLD, { x: w * 0.5, y: y + 0.006, z: f.z - f.d * 0.05 })); // shachihoko
    if (h.tier === 3) out.push(...annex(h, white, h.hw * 0.3));
    return out;
  },
  // A great ger (felt, a painted band, a crown); a monastery hall in the cities.
  Mongols(h) {
    const felt = 0xece6d8, red = 0x9a3a2a, f = front(h), out = ground(h, 0xb8a882);
    if (h.tier === 0) {
      const r = Math.min(h.hw, h.hd) * 1.1;
      out.push(...drum(r, r, h.H * 0.55, 12, felt, {}, felt), cone(r * 1.06, h.H * 0.45, 12, 0xe0d8c4, { y: h.H * 0.55 }), cyl(r * 0.18, r * 0.12, 0.003, 6, red, { y: h.H }));
      out.push(...[-0.7, 0.7].flatMap((a) => drum(r * 0.45, r * 0.45, h.H * 0.35, 8, felt, { x: Math.sin(a) * r * 1.4, z: -Math.cos(a) * r * 0.5 })));
      out.push(onFace(body(r * 2, r * 2, h.H), 'front', 0, 0, 0.006, 0.009, red, E + 0.0005));
      out.push(cyl(0.0004, 0.0004, h.H * 1.6, 3, 0x6a5038, { x: r * 1.2, z: r * 1.1 }));     // the standard
      return out;
    }
    const b = body(h.hw * 1.9, f.d * 0.8, h.H, 0, f.z - f.d * 0.05);
    out.push(...frustum(b.w, b.d, b.w - 0.003, b.d - 0.003, b.h, 0xf0ece2, { z: b.z }, 0xf0ece2));
    out.push(...box(b.w - 0.0024, b.h * 0.16 - 0.0003, b.d - 0.0024, 0x7a2a22, { y: b.h * 0.84, z: b.z }));
    out.push(...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.0028, spacing: 0.008, from: 0, tall: 0.35 }));
    out.push(hip(b.w * 0.5, b.d * 0.5, 0.008, GOLD, { y: b.h, z: b.z }), ...box(b.w * 0.42, 0.004, b.d * 0.42, 0x7a2a22, { y: b.h, z: b.z }));
    out.push(hip(b.w * 0.5, b.d * 0.5, 0.008, GOLD, { y: b.h + 0.004, z: b.z }));
    if (h.tier === 3) out.push(...annex(h, 0x7a2a22));
    return out;
  },
  // Gondar: a stone castle with domed round towers at its corners, crenellated.
  Ethiopians(h) {
    const stone = 0x8a6a52, f = front(h), out = ground(h, 0xa8906c);
    const b = body(h.hw * 1.6, f.d * 0.7, h.H, 0, f.z - f.d * 0.1);
    out.push(...solid(b, stone), ...merlons(b, b.h, 0.0022, 0.005, stone), ...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.003, spacing: 0.009, kind: 'arch', color: 0x2a2018 }), ...door(b, 0.006, 0.01, true));
    const r = 0.0055 + 0.001 * h.tier, th = h.H * 1.3;
    for (const [sx, sz] of [[-1, 1], [1, 1], ...(h.tier >= 1 ? [[-1, -1], [1, -1]] : [])] as [number, number][]) {
      const x = sx * b.w / 2, z = b.z + sz * b.d / 2;
      out.push(...drum(r, r, th, 8, stone, { x, z }), dome(r * 1.02, shade(stone, 0.85), { x, y: th, z }, 8));
    }
    if (h.tier >= 2) out.push(...tower(0, b.z - b.d * 0.1, 0.011, h.H * 1.6, stone, 'crenel', stone));
    if (h.tier === 3) out.push(...annex(h, 0xc8b49a));
    return out;
  },
  // A tecpan: a hall of square pillars on a stepped platform, its stair at the front.
  Aztecs(h) {
    const lime = 0xe2d8c4, red = 0xa04a32, f = front(h), out = ground(h, 0xc0b49c);
    const steps = 2 + h.tier, sh = 0.003;
    for (let i = 0; i < steps; i++) out.push(...box(h.hw * 2 - i * 0.004, sh, f.d * 0.9 - i * 0.004, i % 2 ? lime : shade(lime, 0.92), { y: i * sh, z: f.z - f.d * 0.05 }));
    const y = steps * sh, b = body(h.hw * 1.5, f.d * 0.55, h.H * 0.7, 0, f.z - f.d * 0.1, y);
    out.push(...box(0.01, y - 0.0003, 0.008, shade(lime, 0.85), { z: f.z + f.d * 0.45 - 0.004 }));                 // the stair
    out.push(...solid(b, red), ...box(b.w + 0.002, 0.004, b.d + 0.002, lime, { y: y + b.h, z: b.z }));
    out.push(...bands(b, [y + b.h - 0.003], 0.0016, 0x2f6a6a, ['front', 'left', 'right']));
    const n = 5; for (let i = 0; i < n; i++) out.push(onFace(b, 'front', -b.w / 2 + b.w * (i + 0.5) / n, y, b.w / n * 0.55, b.h * 0.75, 0x2e2420));
    if (h.tier >= 1) out.push(...merlons({ ...b, w: b.w + 0.002, d: b.d + 0.002 }, y + b.h + 0.004, 0.002, 0.005, lime));
    if (h.tier === 3) out.push(...annex(h, lime));
    return out;
  },
  // A durbar hall of red sandstone: cusped arches, chhatris on its corners, a white dome.
  Indians(h) {
    const sand = 0xb0603e, marble = 0xece6da, f = front(h), out = ground(h, 0xc8a080);
    const b = body(h.hw * 1.8, f.d * 0.75, h.H * 0.9, 0, f.z - f.d * 0.1);
    out.push(...solid(b, sand), ...box(b.w + 0.002, 0.0015, b.d + 0.002, marble, { y: b.h, z: b.z }));
    out.push(...fenestrate(b, ['front', 'left', 'right'], Math.min(h.n, 3), { w: 0.0034, spacing: 0.008, kind: 'pointed', color: 0x2e2018 }));
    const kiosk = (x: number, z: number, s: number) => [...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => cyl(0.0003, 0.0003, 0.004 * s, 3, marble, { x: x + a! * 0.0018 * s, y: b.h, z: z + c! * 0.0018 * s })), ...box(0.0046 * s, 0.0006, 0.0046 * s, marble, { x, y: b.h + 0.004 * s, z }), dome(0.0024 * s, marble, { x, y: b.h + 0.0046 * s, z })];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as [number, number][]) out.push(...kiosk(sx * (b.w / 2 - 0.003), b.z + sz * (b.d / 2 - 0.003), 1 + 0.2 * h.tier));
    const dr = h.hw * 0.4;
    out.push(...drum(dr, dr, 0.004, 10, marble, { z: b.z, y: b.h }), dome(dr * 1.1, marble, { z: b.z, y: b.h + 0.004, sy: 1.2 }, 10), cone(0.0007, 0.004, 4, GOLD, { z: b.z, y: b.h + 0.004 + dr * 1.3 }));
    if (h.tier === 3) out.push(...annex(h, marble));
    return out;
  },
  // A Tudor guildhall on posts over its market; then the Victorian hall and its clock tower.
  English(h) {
    const f = front(h), out = ground(h, 0xb8b0a0);
    if (h.tier === 0) {
      const white = 0xe8e0cc, timber = 0x3a2c22, roof = 0x5f5a58, up = h.H * 0.45;
      const b = body(h.hw * 1.6, f.d * 0.8, h.H * 0.6, 0, f.z, up);
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1]]) out.push(...box(0.0015, up, 0.0015, timber, { x: x! * (b.w / 2 - 0.001), z: f.z + z! * (b.d / 2 - 0.001) }));
      out.push(...solid(b, white), ...strips(b, 'front', b.y, b.h, 0.0012, 0.006, timber, E * 2), ...strips(b, 'left', b.y, b.h, 0.0012, 0.006, timber, E * 2), ...strips(b, 'right', b.y, b.h, 0.0012, 0.006, timber, E * 2));
      out.push(...gable(b.w + 0.003, b.d + 0.004, 0.01, roof, { y: b.y + b.h, z: b.z }, false, white), ...box(0.004, 0.006, 0.004, white, { y: b.y + b.h + 0.008, z: b.z }), spire(0.004, 0.006, roof, { y: b.y + b.h + 0.014, z: b.z }));
      return out;
    }
    const brick = 0xa0604a, stone = 0xd2c8b0, roof = 0x5a5654;
    const b = body(h.hw * 1.9, f.d * 0.8, h.H, 0, f.z - f.d * 0.05);
    out.push(...solid(b, brick), ...bands(b, [b.h / h.n, b.h - 0.0015], 0.0012, stone), ...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.003, spacing: 0.008, kind: 'pointed' }), ...door(b, 0.007, 0.012, true));
    out.push(...gable(b.w + 0.002, b.d + 0.002, 0.012, roof, { y: b.h, z: b.z }, false, brick));
    for (const s of [-1, 1]) out.push(...gable(0.012, 0.006, 0.008, roof, { x: s * b.w * 0.3, y: b.h, z: b.z + b.d / 2 }, true, brick));
    out.push(...tower(0, b.z + b.d / 2 - 0.005, 0.013, h.H * (1.5 + 0.15 * h.tier), stone, 'spire', roof, true));
    if (h.tier === 3) out.push(...annex(h, stone));
    return out;
  },
  // An ayuntamiento: an arcade on the square, a balcony, a belfry wall with its bells.
  Spanish(h) {
    const wall = 0xead8b8, stone = 0xc8a878, roof = 0xb5653f, f = front(h), out = ground(h, 0xd8c8a8);
    const b = body(h.hw * 1.9, f.d * 0.8, h.H, 0, f.z - f.d * 0.05);
    out.push(...solid(b, wall), hip(b.w + 0.003, b.d + 0.003, 0.006, roof, { y: b.h, z: b.z }));
    const n = 5, g = body(b.w, b.d, h.H / h.n, 0, b.z);
    for (let i = 0; i < n; i++) out.push(...arch(g, 'front', -b.w / 2 + b.w * (i + 0.5) / n, 0, b.w / n * 0.6, g.h * 0.55, 0x3a3028));
    out.push(...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.003, spacing: 0.009, from: 1 }));
    out.push(...box(b.w * 0.7, 0.0008, 0.004, 0x3a3a3a, { y: h.H / h.n + 0.0008, z: b.z + b.d / 2 + 0.002 }));   // the balcony
    const e = body(0.014, 0.003, h.H * 0.55, 0, b.z + b.d / 2 - 0.004, b.h);
    out.push(...solid(e, stone), ...arch(e, 'front', -0.0035, b.h + e.h * 0.25, 0.003, e.h * 0.35, 0x2a2420), ...arch(e, 'front', 0.0035, b.h + e.h * 0.25, 0.003, e.h * 0.35, 0x2a2420));
    out.push(...gable(0.014, 0.003, 0.004, stone, { y: b.h + e.h, z: e.z }, false, stone));
    if (h.tier >= 2) out.push(...tower(b.w / 2 - 0.006, b.z - 0.004, 0.011, h.H * 1.8, stone, 'hip', roof, true));
    if (h.tier === 3) out.push(...annex(h, stone));
    return out;
  },
  // An hôtel de ville: stone, mansard roofs, a middle pavilion with a clock and a campanile.
  French(h) {
    const stone = 0xe4dccb, slate = 0x4a5058, f = front(h), out = ground(h, 0xd0c8b8);
    const b = body(h.hw * 1.95, f.d * 0.75, h.H, 0, f.z - f.d * 0.08);
    const mansard = (bb: Body, rise: number) => [...frustum(bb.w + 0.001, bb.d + 0.001, bb.w * 0.8, bb.d * 0.7, rise, slate, { x: bb.x, y: bb.y + bb.h, z: bb.z }, slate)];
    out.push(...solid(b, stone), ...mansard(b, 0.006), ...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.003, spacing: 0.008, kind: h.tier ? 'arch' : 'rect' }));
    const pv = body(b.w * 0.3, b.d + 0.004, b.h * 1.15, 0, b.z + 0.002);
    out.push(...solid(pv, stone), ...frustum(pv.w + 0.001, pv.d + 0.001, pv.w * 0.5, pv.d * 0.5, 0.009, slate, { y: pv.h, z: pv.z }, slate), ...clock(pv, pv.h * 0.85, 0.0025), ...door(pv, 0.007, 0.012, true));
    out.push(...box(0.004, 0.006, 0.004, stone, { y: pv.h + 0.009, z: pv.z }), dome(0.0024, slate, { y: pv.h + 0.015, z: pv.z }));
    if (h.tier >= 1) for (const s of [-1, 1]) { const c = body(b.w * 0.18, b.d + 0.002, b.h * 1.05, s * (b.w / 2 - b.w * 0.09), b.z + 0.001); out.push(...solid(c, stone), ...mansard(c, 0.007)); }
    if (h.tier === 3) out.push(...annex(h, stone));
    return out;
  },
  // A Rathaus: a stepped brick gable on the square, a tall tower with a spire.
  Germans(h) {
    const brick = 0x8a4a3a, stone = 0xd0c4a8, roof = 0x6a3a30, f = front(h), out = ground(h, 0xb8ac98);
    const b = body(h.hw * 1.6, f.d * 0.8, h.H, -h.hw * 0.15, f.z - f.d * 0.05);
    out.push(...solid(b, brick), ...gable(b.w + 0.002, b.d + 0.002, 0.016, roof, { x: b.x, y: b.h, z: b.z }, true, brick));
    // The stepped gable: shrinking blocks on the front.
    for (let i = 0; i < 5; i++) out.push(...box(b.w * (1 - i * 0.19), 0.0034, 0.002, brick, { x: b.x, y: b.h + i * 0.0034, z: b.z + b.d / 2 + 0.001 }));
    out.push(...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.003, spacing: 0.008, kind: 'pointed' }), ...door(b, 0.007, 0.012, true));
    out.push(...bands(b, [b.h / h.n], 0.001, stone));
    out.push(...tower(h.hw * 0.72, f.z - f.d * 0.25, 0.011, h.H * (1.9 + 0.35 * h.tier), h.tier >= 2 ? 0x9a9488 : brick, 'spire', 0x5a7a6a, true));
    if (h.tier === 3) out.push(...annex(h, stone, -h.hw * 0.3));
    return out;
  },
  // A terem: red walls and white trim, a tented tower, onion domes.
  Russians(h) {
    const red = 0xa8483a, white = 0xeee8dc, green = 0x3a6a4a, f = front(h), out = ground(h, 0xc8bca8);
    const b = body(h.hw * 1.8, f.d * 0.75, h.H, 0, f.z - f.d * 0.08);
    out.push(...solid(b, red), hip(b.w + 0.002, b.d + 0.002, 0.007, green, { y: b.h, z: b.z }), ...bands(b, [b.h / h.n, b.h - 0.0015], 0.001, white));
    out.push(...fenestrate(b, ['front', 'left', 'right'], h.n, { w: 0.003, spacing: 0.008, kind: 'arch', color: 0x2a2a2a }));
    // A porch with a tented roof before the door.
    const p = body(0.01, 0.007, h.H / h.n, 0, b.z + b.d / 2 + 0.0035);
    out.push(...solid(p, white), spire(0.011, 0.008, green, { y: p.h, z: p.z }));
    out.push(...tower(-b.w / 2 + 0.0065, b.z, 0.012, h.H * (1.5 + 0.2 * h.tier), white, 'tent', green, h.tier >= 1));
    for (const s of h.tier >= 1 ? [0, 0.3] : [0.3]) out.push(...drum(0.0022, 0.0022, 0.004, 6, white, { x: s * b.w, y: b.h + 0.005, z: b.z }), ...onion(0.0028, s ? GOLD : green, { x: s * b.w, y: b.h + 0.009, z: b.z }));
    if (h.tier === 3) out.push(...annex(h, white, h.hw * 0.3));
    return out;
  },
  // A great hall: a long timber hall under a curved shingle roof, crossed dragon gables; a stave tower later.
  Vikings(h) {
    const wood = 0x5a4232, roof = 0x3e3a32, f = front(h), out = ground(h, 0x8a9a6a);
    const b = body(h.hw * 2, f.d * 0.6, h.H * 0.55, 0, f.z - f.d * 0.05);
    out.push(...solid(b, wood), ...strips(b, 'front', 0, b.h, 0.001, 0.004, shade(wood, 0.8), E * 2));
    out.push(...gable(b.w + 0.006, b.d + 0.006, b.d * 0.75, roof, { y: b.h, z: b.z }, false, wood));
    for (const s of [-1, 1]) out.push(cone(0.0008, 0.006, 3, wood, { x: s * (b.w / 2 + 0.003), y: b.h + b.d * 0.6, z: b.z, rz: s * 0.6 })); // dragon heads
    out.push(onFace(b, 'front', 0, 0, 0.006, b.h * 0.75, 0x2a2018, E * 3));
    if (h.tier >= 1) {
      // A stave tower of stacked roofs.
      let y = 0, w = 0.014;
      const x = b.w / 2 - 0.004, z = b.z - b.d / 2 - 0.004;
      for (let i = 0; i < 2 + h.tier; i++) { out.push(...box(w, 0.006, w, wood, { x, y, z }), spire(w * 1.25, 0.006, roof, { x, y: y + 0.006, z })); y += 0.008; w *= 0.75; }
      out.push(spire(w * 1.5, 0.012, roof, { x, y, z }));
    }
    if (h.tier === 3) out.push(...annex(h, 0xb8a888, -h.hw * 0.3));
    return out;
  },
};

const cache = new Map<string, G>();
// The hall model of a civ at a density (cached), as the lot models are made.
export function civicGeometry(kind: CivicKind): G {
  let g = cache.get(kind);
  if (!g) {
    const [, civ, d] = kind.split('|') as [string, ArchCiv, Density];
    const parts = HALLS[civ](hallOf(d)).map((p) => (p.index ? p.toNonIndexed() : p));
    g = mergeGeometries(parts)!;
    if (!g) throw new Error(`hall ${kind}`);
    for (const p of parts) p.dispose();
    g.setAttribute('leafMask', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
    g.computeVertexNormals();
    cache.set(kind, g);
  }
  return g;
}
// Every hall (the tests, the buildings viewer).
export const CIVIC_KINDS: readonly CivicKind[] = ARCH_CIVS.flatMap((c) => (['low', 'dense', 'high', 'metropolitan'] as const).map((d) => civicKind(c, d)));
// A hall's half extents (across its front, deep): what it covers of its spot.
export const civicExtent = (d: Density): readonly [number, number] => { const h = hallOf(d); return [h.hw, h.hd]; };
