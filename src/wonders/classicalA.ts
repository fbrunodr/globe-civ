// Five of the Classical era's wonders (classical.ts): the Acropolis with
// its Parthenon, Persepolis, the Colosseum, the Great Library and the
// Terracotta Army. Site units (kit.ts), the front +z.

import * as THREE from 'three';
import { prism, ring, frustum } from '../houseKit.ts';
import {
  P, V, H, archPane, assemble, ball, sinkOf, box, column, cone, cyl, drumC, figure, flat, pane, peristyle, rnd, rod, shade, steps, templeRoof, type G,
} from './kit.ts';
import type { WonderGrounds, WonderPiece } from '../wonderModels.ts';

const MARBLE = 0xe8e2d4, PAVE = 0xc9c0ae, ROCK = 0xa49680, TILE = 0xb5603e, GOLD = 0xe2b84a;

// Parts turned about the vertical by ry, then moved to x, y, z.
function turned(parts: G[], ry: number, x: number, z: number, y = 0): G[] {
  const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));
  for (const p of parts) p.applyMatrix4(m);
  return parts;
}

// ---------- Athens ----------

// The Acropolis: the rock with its cliffs and the walls along its top; on
// it the Parthenon, Doric, eight columns by seventeen, its frieze painted,
// its pediments peopled with marble gods; the Erechtheion with its porch of
// maidens; the Propylaea, the little temple of Nike on its bastion; the
// ramp climbing the rock's face to the gate. (On a plain pad filling the
// site: the town's scale.)
export function parthenon(): G[] {
  const out: G[] = [flat(2 * H, 2 * H, PAVE, 0, 0, 0.0003)];
  const outline: [number, number][] = [[-0.072, 0.02], [-0.062, 0.05], [-0.02, 0.056], [0.03, 0.052], [0.068, 0.034], [0.074, -0.01], [0.07, -0.06], [0.03, -0.072], [-0.035, -0.072], [-0.072, -0.055]];
  out.push(...prism(outline, 0.04, ROCK, {}, shade(ROCK, 1.05)));
  const k = 0.95, top: [number, number][] = outline.map(([x, z]) => [x * k, z * k - 0.001]);
  out.push(...prism(top, 0.025, shade(ROCK, 1.08), { y: 0.04 }, 0xcfc3a8));
  const Y = 0.065;
  // Walls along the top's edge, open where the Propylaea stand.
  for (let i = 0; i < top.length; i++) {
    if (i === 2) continue;
    const [x0, z0] = top[i]!, [x1, z1] = top[(i + 1) % top.length]!;
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
    const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
    out.push(...box(0.0022, 0.005, len, shade(0xcfc3a8, 0.92), { x: (x0 + x1) / 2 - nx * 0.0013, y: Y, z: (z0 + z1) / 2 - nz * 0.0013, ry }));
  }
  // The Parthenon, along x at the back of the rock.
  out.push(...turned(temple(), Math.PI / 2, 0.002, -0.028, Y));
  // The Erechtheion toward the front left, the Propylaea at the head of the ramp.
  out.push(...scaled(erechtheion(0, 0, 0), 1.5, -0.046, Y, 0.026));
  out.push(...scaled(propylaea(0, 0, 0), 1.35, 0.014, Y, 0.034));
  // The bastion of Nike on the front corner, her temple on it.
  out.push(...box(0.014, Y + 0.001, 0.014, shade(ROCK, 1.02), { x: 0.052, z: 0.032 }, 0xd8ccb2));
  out.push(...miniTemple(0.052, 0.032, Y + 0.001, 0.011, 0.013));
  // The ramp up the rock's face, along the front, to a landing before the gate.
  const z0 = 0.0565, z1 = 0.068, xb = -0.062, xt = 0.006, hw = (z1 - z0) / 2, zc = (z0 + z1) / 2;
  const wedge = new THREE.BufferGeometry();
  wedge.setAttribute('position', new THREE.Float32BufferAttribute([
    xb, 0, zc + hw, xt, Y, zc + hw, xt, Y, zc - hw, xb, 0, zc + hw, xt, Y, zc - hw, xb, 0, zc - hw,
    xb, 0, zc + hw, xt, 0, zc + hw, xt, Y, zc + hw, xt, 0, zc - hw, xb, 0, zc - hw, xt, Y, zc - hw,
  ], 3));
  out.push(P(wedge, 0xd2c6ac));
  for (let i = 1; i < 16; i++) { const f = i / 16; out.push(rod(V(xb + (xt - xb) * f, Y * f + 0.0003, z0), V(xb + (xt - xb) * f, Y * f + 0.0003, z1), 0.00025, shade(0xd2c6ac, 0.82), 3)); }
  // (Its head: a spur of the rock carrying it to the gate's steps.)
  out.push(...box(0.02, Y, 0.017, ROCK, { x: 0.016, z: 0.0595 }, 0xd8ccb2));
  return out;
}
// The Parthenon itself (along z here; turned to stand along x).
function temple(): G[] {
  const out: G[] = [], C = MARBLE;
  const st = steps(0.06, 0.124, 3, 0.0022, 0.0015, shade(C, 0.96), {}, C);
  out.push(...st.parts);
  const y = st.y, h = 0.062, r = 0.0026, hw = st.w / 2 - 0.003, hd = st.d / 2 - 0.003;
  out.push(...peristyle(0, 0, hw, hd, 8, 17, (x, z) => column(x, y, z, r, h, C, 'doric')));
  // The cella and its porches, front and back.
  out.push(...box(0.032, h, 0.088, shade(C, 0.95), { y }));
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) out.push(...column(-0.0135 + i * 0.0054, y, s * (hd - 0.0085), r * 0.9, h, C, 'doric'));
  for (const s of [-1, 1]) out.push(pane(0.01, 0.04, 0x3a2e24, 0, y, s * 0.0441, s > 0 ? 0 : Math.PI));
  const roof = templeRoof(0, 0, st.w, st.d, y + h, C, shade(C, 0.97), TILE, 0x6d86a8, 0.26);
  out.push(...roof.parts);
  // The Doric frieze: blue triglyphs between the metopes, round all four sides.
  const fy = y + h + st.w * 0.045, fo = st.w * 0.002 + 0.0002;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 33; i++) out.push(pane(0.0013, st.w * 0.05, 0x34507a, s * (st.w / 2 + fo), fy, -st.d / 2 + 0.002 + i * ((st.d - 0.004) / 32), s * Math.PI / 2));
    for (let i = 0; i < 15; i++) out.push(pane(0.0013, st.w * 0.05, 0x34507a, -st.w / 2 + 0.002 + i * ((st.w - 0.004) / 14), fy, s * (st.d / 2 + fo), s > 0 ? 0 : Math.PI));
  }
  // The pediments' gods in a row under each gable.
  const yr = y + h + st.w * (0.045 + 0.05 + 0.022);
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    const x = -0.02 + i * 0.005, hh = 0.002 + (4 - Math.abs(i - 4)) * 0.0009;
    out.push(...box(0.0026, hh, 0.0012, 0xf2eee4, { x, y: yr + 0.0008, z: s * (st.d / 2 + st.w * 0.026 + 0.0011) }));
  }
  return out;
}
function erechtheion(x: number, z: number, y: number): G[] {
  const out: G[] = [], C = MARBLE;
  out.push(...box(0.014, 0.0015, 0.024, shade(C, 0.95), { x, y, z: z - 0.002 }));
  out.push(...box(0.012, 0.013, 0.018, shade(C, 0.97), { x, y: y + 0.0015, z: z - 0.004 }));
  for (let i = 0; i < 6; i++) out.push(...column(x - 0.005 + i * 0.002, y + 0.0015, z + 0.0075, 0.0007, 0.013, C, 'ionic'));
  out.push(...templeRoof(x, z - 0.001, 0.013, 0.023, y + 0.0145, C, 0x34507a, TILE, 0x6d86a8).parts);
  // The maidens' porch on the front corner: six caryatids under a slab.
  const px = x + 0.0095, pz = z + 0.004;
  out.push(...box(0.0075, 0.004, 0.0065, shade(C, 0.94), { x: px, y: y + 0.0015, z: pz }));
  for (let i = 0; i < 6; i++) out.push(...figure(px - 0.0026 + (i % 3) * 0.0026, pz + (i < 3 ? 0.0022 : -0.0012), 0.0058, 0xf2eee4, { y: y + 0.0055, skin: 0xf2eee4 }));
  out.push(...box(0.0085, 0.0014, 0.0075, C, { x: px, y: y + 0.0113, z: pz }));
  return out;
}
function propylaea(x: number, z: number, y: number): G[] {
  const out: G[] = [], C = MARBLE;
  out.push(...steps(0.032, 0.02, 2, 0.0012, 0.001, shade(C, 0.95), { x, y, z }).parts);
  const yb = y + 0.0024;
  out.push(...box(0.026, 0.014, 0.006, shade(C, 0.95), { x, y: yb, z: z - 0.004 }));
  for (let i = 0; i < 5; i++) out.push(pane(0.0028, 0.007 - Math.abs(i - 2) * 0.0012, 0x3a2e24, x - 0.009 + i * 0.0045, yb, z - 0.0009));
  for (let i = 0; i < 6; i++) out.push(...column(x - 0.0115 + i * 0.0046, yb, z + 0.006, 0.0013, 0.014, C, 'doric'));
  out.push(...templeRoof(x, z + 0.001, 0.028, 0.017, yb + 0.014, C, shade(C, 0.96), TILE, 0x6d86a8).parts);
  // The north wing (the picture gallery).
  out.push(...box(0.014, 0.011, 0.012, shade(C, 0.95), { x: x - 0.022, y, z: z - 0.002 }));
  for (let i = 0; i < 3; i++) out.push(...column(x - 0.027 + i * 0.005, y, z + 0.0058, 0.001, 0.011, C, 'doric'));
  out.push(...box(0.015, 0.0015, 0.0155, C, { x: x - 0.022, y: y + 0.011, z: z - 0.0002 }));
  return out;
}
// A small Ionic temple of four columns front and back (Athena Nike).
function miniTemple(x: number, z: number, y: number, w: number, d: number): G[] {
  const out: G[] = [], C = MARBLE, h = d * 0.85;
  out.push(...box(w, 0.0015, d, shade(C, 0.95), { x, y, z }));
  out.push(...box(w * 0.6, h, d * 0.5, shade(C, 0.96), { x, y: y + 0.0015, z }));
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) out.push(...column(x - w * 0.36 + i * w * 0.24, y + 0.0015, z + s * d * 0.38, w * 0.06, h, C, 'ionic'));
  out.push(...templeRoof(x, z, w, d, y + 0.0015 + h, C, 0x34507a, TILE, 0x6d86a8).parts);
  return out;
}
// Parts built round the origin, scaled by s and moved to x, y, z.
function scaled(parts: G[], s: number, x: number, y: number, z: number): G[] {
  const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(s, s, s));
  for (const p of parts) p.applyMatrix4(m);
  return parts;
}

// ---------- Persepolis ----------

// The terrace of the King of Kings: its great double stair; the Gate of
// All Nations between its winged bulls; the Apadana, its porticoes of tall
// columns crowned with twin bulls, its own stair carved with tribute
// bearers; the Hall of a Hundred Columns; stepped merlons and glazed bands
// under cedar roofs; the winged sun over the gate. (On a plain pad.)
export function persepolis(): G[] {
  const out: G[] = [];
  const STONE = 0xb8ac96, TOP = 0xcabea8, WALL = 0xd6c6a2, CEDAR = 0x7a5a3a, GLAZE = 0x3a8a9a, COL = 0xc7bba6;
  out.push(flat(2 * H, 2 * H, PAVE, 0, 0, 0.0003));
  // The terrace, its courses of masonry.
  const T = 0.02, tw = 0.146, td = 0.136, tz = -0.004;
  out.push(...box(tw, T, td, STONE, { z: tz }, TOP));
  for (const y of [0.005, 0.01, 0.015]) out.push(ring(tw + 0.0004, 0.0005, td + 0.0004, shade(STONE, 0.86), { y, z: tz }));
  // The great stair: two flights climbing outward along the front, a parapet each.
  const zf = tz + td / 2, n = 12;
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) out.push(...box(0.0036, ((i + 1) * T) / n - 0.0001, 0.009, shade(TOP, i % 2 ? 0.97 : 1.02), { x: s * (0.006 + i * 0.0036 + 0.0018), z: zf + 0.0047 }));
    out.push(rod(V(s * 0.006, 0.003, zf + 0.0093), V(s * (0.006 + n * 0.0036), T + 0.003, zf + 0.0093), 0.0011, shade(STONE, 0.95), 4));
  }
  const Y = T;
  // The Gate of All Nations: a square hall, winged bulls guarding its doors, merlons, the winged sun.
  const gx = -0.053, gz = 0.04, gh = 0.056;
  out.push(...box(0.03, gh, 0.026, WALL, { x: gx, y: Y, z: gz }, shade(WALL, 0.95)));
  out.push(...merlonRow(gx, gz, 0.03, 0.026, Y + gh, shade(WALL, 1.03), 1.6));
  for (const s of [-1, 1]) {
    out.push(pane(0.009, 0.03, 0x3a2e24, gx, Y, gz + s * 0.0133, s > 0 ? 0 : Math.PI));
    for (const t of [-1, 1]) out.push(...scaled(lamassu(0, 0, 0, s > 0 ? 0 : Math.PI), 1.7, gx + t * 0.0085, Y, gz + s * 0.0195));
  }
  out.push(...scaled(wingedSun(0, 0, 0), 1.6, gx, Y + 0.042, gz + 0.013));
  // The Apadana: its podium and carved stair, the hall, its corner towers, porticoes on three sides.
  const ax = 0.014, az = -0.012, P0 = 0.006, Y2 = Y + P0, colH = 0.08, cr = 0.0019;
  out.push(...box(0.096, P0, 0.094, shade(STONE, 1.02), { x: ax, y: Y, z: az }, TOP));
  for (let row = 0; row < 2; row++) for (let i = 0; i < 30; i++) out.push(pane(0.0016, 0.0019, shade(STONE, 0.78), ax - 0.0435 + i * 0.003, Y + 0.0008 + row * 0.0026, az + 0.0472));
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) out.push(...box(0.004, ((i + 1) * P0) / 5 - 0.0001, 0.008, shade(TOP, 1.02), { x: ax + s * (0.014 + i * 0.004), z: az + 0.051 }));
  out.push(...box(0.048, colH, 0.048, WALL, { x: ax, y: Y2, z: az }));
  for (const [tx, tz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...box(0.0172, colH + 0.006, 0.0172, shade(WALL, 0.96), { x: ax + tx * 0.036, y: Y2, z: az + tz2 * 0.036 }));
  const cols: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const t = -0.0225 + i * 0.009;
    cols.push([ax + t, az + 0.031], [ax + t, az + 0.04]);
    cols.push([ax - 0.031, az + t], [ax - 0.04, az + t], [ax + 0.031, az + t], [ax + 0.04, az + t]);
  }
  for (const [x, z] of cols) out.push(...persianColumn(x, Y2, z, cr, colH, COL));
  // Its roof: cedar over all, a glazed band, stepped merlons round the edge and on the towers.
  const ry = Y2 + colH;
  out.push(...box(0.088, 0.004, 0.088, CEDAR, { x: ax, y: ry, z: az }, shade(CEDAR, 1.1)));
  out.push(ring(0.0884, 0.0016, 0.0884, GLAZE, { x: ax, y: ry + 0.0012, z: az }));
  out.push(...merlonRow(ax, az, 0.088, 0.088, ry + 0.004, shade(WALL, 1.03), 1.4));
  for (const [tx, tz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...merlonRow(ax + tx * 0.036, az + tz2 * 0.036, 0.0172, 0.0172, Y2 + colH + 0.006, shade(WALL, 1.03), 1.4));
  // The Hall of a Hundred Columns at the back left, its portico.
  const hx = -0.054, hz = -0.054, hh = 0.05;
  out.push(...box(0.036, hh, 0.026, WALL, { x: hx, y: Y, z: hz - 0.004 }, CEDAR));
  for (let i = 0; i < 7; i++) out.push(...persianColumn(hx - 0.0156 + i * 0.0052, Y, hz + 0.012, cr * 0.85, hh, COL));
  out.push(...box(0.036, 0.003, 0.034, CEDAR, { x: hx, y: Y + hh, z: hz }, shade(CEDAR, 1.1)));
  out.push(...merlonRow(hx, hz, 0.036, 0.034, Y + hh + 0.003, shade(WALL, 1.03), 1.4));
  return out;
}
// A Persian column: a bell base, a tall fluted shaft, a bell and volutes,
// and the twin bulls back to back that carry the beams.
function persianColumn(x: number, y: number, z: number, r: number, h: number, c: number): G[] {
  const out: G[] = [];
  out.push(...box(r * 4.2, h * 0.02, r * 4.2, shade(c, 0.95), { x, y, z }));
  out.push(drumC(r * 2.1, r * 1.05, h * 0.05, 8, c, { x, y: y + h * 0.02, z }));
  out.push(cyl(r, r * 0.9, h * 0.72, 8, c, { x, y: y + h * 0.07, z }));
  out.push(drumC(r * 0.9, r * 1.7, h * 0.05, 8, shade(c, 0.97), { x, y: y + h * 0.79, z }));
  out.push(...box(r * 1.5, h * 0.07, r * 1.5, c, { x, y: y + h * 0.84, z }));
  // The bulls: a body across, a head at each end.
  out.push(...box(r * 6.5, h * 0.06, r * 1.8, shade(c, 0.93), { x, y: y + h * 0.91, z }));
  for (const s of [-1, 1]) {
    out.push(ball(r * 1.15, shade(c, 0.9), { x: x + s * r * 3.6, y: y + h * 0.95, z, sx: 1.3 }));
    out.push(rod(V(x + s * r * 3.9, y + h * 0.975, z - r * 0.8), V(x + s * r * 4.5, y + h * 1.0, z - r * 1.4), r * 0.18, 0x5a4a3a, 3));
  }
  return out;
}
// Stepped merlons along the top edges of a w × d roof.
function merlonRow(cx: number, cz: number, w: number, d: number, y: number, c: number, k = 1): G[] {
  const out: G[] = [], step = 0.0042 * k;
  const one = (x: number, z: number, ry: number) => {
    out.push(...box(0.0028 * k, 0.0018 * k, 0.0012 * k, c, { x, y, z, ry }), ...box(0.0016 * k, 0.0016 * k, 0.0012 * k, c, { x, y: y + 0.0018 * k, z, ry }), ...box(0.0007 * k, 0.0012 * k, 0.0012 * k, c, { x, y: y + 0.0034 * k, z, ry }));
  };
  for (let i = 0, n = Math.floor(w / step); i < n; i++) { const x = cx - w / 2 + (i + 0.5) * (w / n); one(x, cz + d / 2 - 0.0006 * k, 0); one(x, cz - d / 2 + 0.0006 * k, 0); }
  for (let i = 0, n = Math.floor(d / step); i < n; i++) { const z = cz - d / 2 + (i + 0.5) * (d / n); one(cx + w / 2 - 0.0006 * k, z, Math.PI / 2); one(cx - w / 2 + 0.0006 * k, z, Math.PI / 2); }
  return out;
}
// A winged bull with a man's head, facing ry (a lamassu), on its block.
function lamassu(x: number, z: number, y: number, ry: number): G[] {
  const c = 0xc2b6a0, cs = Math.sin(ry), cc = Math.cos(ry);
  const at = (f: number, s = 0) => ({ x: x + cs * f + cc * s, z: z + cc * f - cs * s });
  const out: G[] = [
    ...box(0.004, 0.003, 0.009, shade(c, 0.95), { x, y, z, ry }),
    ...box(0.0032, 0.006, 0.008, c, { ...at(0), y: y + 0.003, ry }),
    ...box(0.0026, 0.004, 0.003, c, { ...at(0.0045), y: y + 0.0085, ry }),
    drumC(0.0014, 0.0016, 0.0022, 6, shade(c, 0.9), { ...at(0.0048), y: y + 0.0125 }),
    ...box(0.0022, 0.0028, 0.0012, 0x5a4a3a, { ...at(0.0062), y: y + 0.0072, ry }),
  ];
  for (const s of [-1, 1]) out.push(P(new THREE.PlaneGeometry(0.008, 0.005).translate(-0.002, 0.0025, 0), shade(c, 1.04), { ...at(-0.001, s * 0.0017), y: y + 0.0075, ry: ry + Math.PI / 2, rz: 0.35 }));
  return out;
}
// The winged sun (the Faravahar) in gold on a facade facing +z.
function wingedSun(x: number, y: number, z: number): G[] {
  return [
    P(new THREE.CircleGeometry(0.0018, 10), GOLD, { x, y, z: z + 0.0003 }),
    ...[-1, 1].map((s) => P(new THREE.PlaneGeometry(0.007, 0.0016).translate(s * 0.0045, 0, 0), GOLD, { x, y, z: z + 0.0002, rz: s * 0.08 })),
  ];
}

// ---------- Rome ----------

// The Flavian amphitheatre whole: four storeys round its ellipse, three
// of arches between engaged columns, statues in the upper arches, and the
// attic with its windows and pilasters, the velarium's masts on top;
// inside, the seating falling in tiers to the podium, the emperor's box,
// the sand of the arena. (On a plain pad; its storeys near the town's.)
export function colosseum(): G[] {
  const r = rnd(9), out: G[] = [];
  const TRAV = 0xd8ccb0, DEEP = 0x4e463a, GALL = 0xc2b494;
  const a = 0.072, b = 0.06, q = b / a; // its ellipse
  const ell = (rad: number, h: number, y: number, c: number, n = 64) => P(new THREE.CylinderGeometry(rad, rad, h, n, 1, true).translate(0, y + h / 2, 0).scale(1, 1, q), c);
  out.push(flat(2 * H, 2 * H, PAVE, 0, 0, 0.0003));
  const storeys = [[0.002, 0.028], [0.03, 0.027], [0.057, 0.027]] as const, attic = [0.084, 0.024] as const, top = attic[0] + attic[1];
  out.push(ell(a * 1.008, 0.002, 0, shade(TRAV, 0.9)));
  const N = 40, bay = (2 * Math.PI * Math.sqrt((a * a + b * b) / 2)) / N;
  // Behind the arches: the galleries' walls, lit pale; the arches dark against them.
  for (const [y, h] of storeys) out.push(ell(a * 0.972, h, y, GALL));
  for (let i = 0; i < N; i++) {
    const t = ((i + 0.5) / N) * Math.PI * 2, x = Math.cos(t) * a, z = Math.sin(t) * b;
    const nx = Math.cos(t) / a, nz = Math.sin(t) / b, nl = Math.hypot(nx, nz), ry = Math.atan2(nx / nl, nz / nl);
    storeys.forEach(([y, h], k) => {
      const ow = bay * 0.6, oh = h * 0.74;
      out.push(...archPane(ow, oh - ow / 2, DEEP, x * 0.973 + (nx / nl) * 0.0003, y + h * 0.06, z * 0.973 + (nz / nl) * 0.0003, ry));
      // A statue in each arch of the two upper storeys.
      if (k === 2) out.push(drumC(h * 0.07, h * 0.05, h * 0.36, 5, 0xece6d8, { x: x * 0.982, y: y + h * 0.06, z: z * 0.982 }), ball(h * 0.06, 0xece6d8, { x: x * 0.982, y: y + h * 0.47, z: z * 0.982 }));
    });
  }
  // The piers and engaged columns, bay by bay, storey by storey; the cornices.
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, nx = Math.cos(t) / a, nz = Math.sin(t) / b, nl = Math.hypot(nx, nz), ry = Math.atan2(nx / nl, nz / nl);
    const x = Math.cos(t) * a, z = Math.sin(t) * b;
    storeys.forEach(([y, h], k) => {
      out.push(ring(bay * 0.4, h, 0.004, shade(TRAV, 0.97 + r() * 0.05), { x: x - (nx / nl) * 0.0018, y, z: z - (nz / nl) * 0.0018, ry }));
      out.push(cyl(0.0011, 0.001, h * 0.86, 6, TRAV, { x: x + (nx / nl) * 0.0004, y, z: z + (nz / nl) * 0.0004 }));
      out.push(...box(0.0034, h * 0.06, 0.0024, shade(TRAV, 1.04), { x: x + (nx / nl) * 0.0004, y: y + h * 0.86, z: z + (nz / nl) * 0.0004, ry }));
      if (k === 0) out.push(...box(0.003, h * 0.04, 0.0024, shade(TRAV, 0.95), { x: x + (nx / nl) * 0.0004, y, z: z + (nz / nl) * 0.0004, ry }));
    });
    // The attic: pilasters, windows every other bay, corbels and masts.
    out.push(...box(bay * 0.16, attic[1], 0.0009, shade(TRAV, 1.04), { x: x + (nx / nl) * 0.0006, y: attic[0], z: z + (nz / nl) * 0.0006, ry }));
    if (i % 2) out.push(pane(bay * 0.3, 0.0055, DEEP, Math.cos(t + Math.PI / N) * a + (nx / nl) * 0.0004, attic[0] + 0.009, Math.sin(t + Math.PI / N) * b + (nz / nl) * 0.0004, ry));
    out.push(...box(0.0018, 0.0016, 0.0016, shade(TRAV, 0.95), { x: x + (nx / nl) * 0.0008, y: attic[0] + 0.004, z: z + (nz / nl) * 0.0008, ry }));
    if (i % 2 === 0) out.push(rod(V(x * 0.993, top, z * 0.993), V(x * 0.993, top + 0.012, z * 0.993), 0.0005, 0x6a5038, 4));
  }
  for (const [y, h] of storeys) out.push(ell(a * 1.006, 0.0022, y + h - 0.0022, shade(TRAV, 1.05)));
  out.push(ell(a, attic[1], attic[0], shade(TRAV, 0.96)));
  out.push(ell(a * 1.007, 0.0024, top - 0.0024, shade(TRAV, 1.05)));
  // The top of the outer wall (a walk round the rim).
  out.push(P(new THREE.RingGeometry(a * 0.93, a, 64).rotateX(-Math.PI / 2).scale(1, 1, q), shade(TRAV, 0.9), { y: top }));
  // The seating: tiers falling to the podium, a wall between each, rows of seats.
  const tiers = [[0.93, 0.85, 0.1], [0.85, 0.76, 0.081], [0.76, 0.67, 0.062], [0.67, 0.58, 0.043], [0.58, 0.51, 0.024]] as const;
  tiers.forEach(([r0, r1, yTop], k) => {
    const yb = k < tiers.length - 1 ? tiers[k + 1]![2] + 0.004 : 0.012;
    out.push(P(new THREE.CylinderGeometry(a * r0, a * r1, yTop - yb, 48, 1, true).translate(0, (yTop + yb) / 2, 0).scale(1, 1, q), k % 2 ? 0xc9bb9c : 0xbfb090));
    for (let j = 1; j < 3; j++) {
      const f = j / 3, rr = a * (r0 + (r1 - r0) * f), yy = yTop - (yTop - yb) * f + 0.0003;
      out.push(P(new THREE.TorusGeometry(rr, 0.00035, 3, 40).rotateX(Math.PI / 2).scale(1, 1, q), shade(0xbfb090, 0.84), { y: yy }));
    }
    out.push(P(new THREE.CylinderGeometry(a * r1, a * r1, 0.004, 48, 1, true).translate(0, yb + 0.002, 0).scale(1, 1, q), shade(TRAV, 0.95)));
  });
  // The podium wall, the arena's sand, the emperor's box with its awning.
  out.push(ell(a * 0.51, 0.012, 0, shade(0x8a3a2a, 1.1), 48));
  out.push(P(new THREE.CircleGeometry(a * 0.51, 48).rotateX(-Math.PI / 2).scale(1, 1, q), 0xd8c08a, { y: 0.0012 }));
  out.push(...box(0.016, 0.006, 0.006, 0xe8e2d4, { y: 0.012, z: b * 0.54 }));
  out.push(...box(0.018, 0.0008, 0.009, 0x9a2a2a, { y: 0.026, z: b * 0.56 }));
  for (const s of [-1, 1]) for (const t of [-1, 1]) out.push(rod(V(s * 0.008, 0.018, b * 0.56 + t * 0.004), V(s * 0.008, 0.026, b * 0.56 + t * 0.004), 0.0003, GOLD, 3));
  return out;
}

// ---------- Alexandria ----------

// The Mouseion and its Library: a walled precinct, stoas round a paved
// court, the shelves of scrolls along their back walls; a gate with its
// pediment between two obelisks; the great hall on its podium, six Ionic
// columns across its front; a round tholos where the astronomers watched.
// (On a plain pad.)
export function greatLibrary(): G[] {
  const out: G[] = [];
  const C = 0xe8e0cc, PAV = 0xd8ccb2, SHELF = 0x5a4430, SCROLL = 0xe8dcb8;
  out.push(flat(2 * H, 2 * H, PAVE, 0, 0, 0.0003));
  out.push(...box(0.144, 0.004, 0.144, shade(C, 0.88), {}, PAV));
  const Y = 0.004;
  out.push(flat(0.1, 0.1, shade(PAV, 0.95), 0, 0, Y + 0.0003));
  // The precinct's walls (the front open for the gate), the stoas inside them.
  const W = 0.07, wallH = 0.05;
  out.push(...box(0.14, wallH, 0.003, shade(C, 0.95), { y: Y, z: -W + 0.0015 }));
  for (const s of [-1, 1]) out.push(...box(0.003, wallH, 0.14, shade(C, 0.95), { x: s * (W - 0.0015), y: Y }));
  for (const s of [-1, 1]) out.push(...box(0.05, wallH, 0.003, shade(C, 0.95), { x: s * 0.045, y: Y, z: W - 0.0015 }));
  // Outside: pilasters along the walls, small high windows, a cornice.
  for (const ry of [Math.PI, Math.PI / 2, -Math.PI / 2, 0]) {
    const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry), o = W;
    for (let i = 0; i < 12; i++) {
      const t = -0.066 + i * 0.012;
      if (ry === 0 && Math.abs(t) < 0.02) continue;
      out.push(...box(0.0026, wallH - 0.003, 0.001, shade(C, 1.03), { x: nx * (o + 0.0005) + tx * t, y: Y, z: nz * (o + 0.0005) + tz * t, ry }));
      if (i < 11 && !(ry === 0 && Math.abs(t + 0.006) < 0.02)) out.push(pane(0.0036, 0.007, 0x4a3e30, nx * (o + 0.0002) + tx * (t + 0.006), Y + wallH - 0.016, nz * (o + 0.0002) + tz * (t + 0.006), ry));
    }
  }
  out.push(ring(0.1436, 0.0024, 0.1436, shade(C, 1.04), { y: Y + wallH - 0.0024 }));
  const ci = 0.055, colH = 0.036;
  out.push(...peristyle(0, 0, ci, ci, 11, 11, (x, z) => (z > ci - 0.001 && Math.abs(x) < 0.012 ? [] : column(x, Y, z, 0.0024, colH, C, 'doric'))));
  out.push(ring(0.114, 0.004, 0.114, shade(C, 1.02), { y: Y + colH }));
  out.push(...frustum(0.114, 0.114, 0.14, 0.14, wallH - colH - 0.004, TILE, { y: Y + colH + 0.004 }));
  // The shelves along the stoas' back walls: pigeonholes of scrolls.
  for (const ry of [0, Math.PI / 2, -Math.PI / 2]) {
    const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry), len = 0.134, o = -W + 0.0031;
    const ox = ry === 0 ? 0 : -nx * o, oz = ry === 0 ? o : 0;
    for (let i = 0; i < 22; i++) for (let row = 0; row < 4; row++) {
      const t = -len / 2 + 0.006 + i * ((len - 0.012) / 21);
      const px = ox + tx * t + nx * 0.0002, pz = oz + tz * t + nz * 0.0002, y = Y + 0.005 + row * 0.0072;
      out.push(pane(0.0046, 0.0056, SHELF, px, y, pz, ry));
      if ((i + row) % 3) out.push(P(new THREE.OctahedronGeometry(0.0011, 0), SCROLL, { x: px + nx * 0.0008, y: y + 0.0018, z: pz + nz * 0.0008, sx: Math.abs(tx) > 0.5 ? 2.2 : 1, sz: Math.abs(tz) > 0.5 ? 2.2 : 1 }));
    }
  }
  // The gate: a pedimented porch of four columns, obelisks either side.
  out.push(...box(0.03, 0.002, 0.014, shade(C, 0.95), { y: Y, z: 0.063 }));
  for (let i = 0; i < 4; i++) out.push(...column(-0.0117 + i * 0.0078, Y + 0.002, 0.068, 0.0024, 0.044, C, 'ionic'));
  out.push(...templeRoof(0, 0.063, 0.032, 0.015, Y + 0.046, C, 0x3d5f8f, TILE, 0x4a6c9a).parts);
  for (const s of [-1, 1]) {
    out.push(...box(0.0055, 0.004, 0.0055, 0x9a8a7a, { x: s * 0.023, y: Y, z: 0.0725 }));
    out.push(...frustum(0.0038, 0.0038, 0.0022, 0.0022, 0.05, 0xb06a5a, { x: s * 0.023, y: Y + 0.004, z: 0.0725 }));
    out.push(cone(0.0016, 0.0034, 4, GOLD, { x: s * 0.023, y: Y + 0.054, z: 0.0725, ry: Math.PI / 4 }));
  }
  // The great hall on its podium at the back of the court.
  const hz = -0.018;
  const st = steps(0.08, 0.068, 4, 0.003, 0.002, shade(C, 0.95), { y: Y, z: hz }, C);
  out.push(...st.parts);
  const hy = st.y, hh = 0.08, cr = 0.0037;
  out.push(...box(0.046, hh, 0.04, shade(C, 0.96), { y: hy, z: hz - 0.004 }));
  out.push(pane(0.013, 0.036, 0x3a2e24, 0, hy, hz - 0.004 + 0.0202), pane(0.0146, 0.001, GOLD, 0, hy + 0.036, hz - 0.004 + 0.0205));
  for (let i = 0; i < 6; i++) out.push(...column(-0.03 + i * 0.012, hy, hz + 0.025, cr, hh, C, 'ionic'));
  for (const s of [-1, 1]) for (let j = 1; j < 5; j++) out.push(...column(s * 0.03, hy, hz + 0.025 - j * 0.0125, cr, hh, C, 'ionic'));
  out.push(...templeRoof(0, hz, st.w, st.d, hy + hh, C, 0x3d5f8f, TILE, 0x4a6c9a).parts);
  // The tholos of the astronomers, front left of the court.
  const tx = -0.032, tz = 0.034, ty = Y + 0.002, th = 0.03;
  out.push(drumC(0.0145, 0.0135, 0.002, 18, shade(C, 0.95), { x: tx, y: Y, z: tz }));
  out.push(drumC(0.0075, 0.0075, th, 14, shade(C, 0.96), { x: tx, y: ty, z: tz }));
  for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2; out.push(...column(tx + Math.cos(t) * 0.0115, ty, tz + Math.sin(t) * 0.0115, 0.0015, th, C, 'ionic')); }
  out.push(drumC(0.0132, 0.0132, 0.0026, 16, C, { x: tx, y: ty + th, z: tz }), cone(0.014, 0.011, 16, 0x8a8f8a, { x: tx, y: ty + th + 0.0026, z: tz }));
  out.push(drumC(0.0016, 0.0016, 0.003, 6, 0x8a8f8a, { x: tx, y: ty + th + 0.0136, z: tz }), ball(0.0022, GOLD, { x: tx, y: ty + th + 0.0178, z: tz }));
  return out;
}

// ---------- Xi'an ----------

// The buried army opened: three pits cut into the loess (a bank of spoil
// behind them), the first with its
// earthen walls between corridors where the soldiers stand in ranks facing
// the front, the vanguard across its head, the roof beams that covered them
// still lying at the ends; the second with chariots and their teams and
// the cavalry; the third, the command, its officers round a chariot.
export const terracottaArmy = (): G[] => assemble(terracottaGrounds());
// Its grounds (wonderModels.ts WonderGrounds): the three pits dug down
// into the ground (sinks: their earthen sides and floor the game draws),
// the bare loess round them, and in pieces, each where it stands: what
// fills each pit, on its floor; the bank of spoil along the back, on the
// ground.
const PITS: readonly (readonly [number, number, number, number])[] = [[-0.058, 0.058, -0.058, 0.018], [-0.058, -0.006, 0.028, 0.058], [0.006, 0.04, 0.03, 0.056]];
const LOESS = 0xb89a72, PIT_FLOOR = 0x6e5840, PIT_DEPTH = 0.0056;
export function terracottaGrounds(): WonderGrounds {
  const sinks = PITS.map(([x0, x1, z0, z1]) => sinkOf({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 }, PIT_DEPTH, shade(LOESS, 0.82), PIT_FLOOR));
  // (Each pit's figures on its floor: the old floor's few tenths of a
  // thousandth under them taken back, so they stand on it.)
  const down = (parts: G[]) => parts.map((g) => g.translate(0, -0.0004, 0));
  const pieces: WonderPiece[] = [{ parts: () => down(pit1()), sink: 0 }, { parts: () => down(pit2()), sink: 1 }, { parts: () => down(pit3()), sink: 2 }];
  // The bank of spoil thrown up along the back when the pits were dug, in three lengths.
  for (let k = 0; k < 3; k++) pieces.push({ parts: () => berm(-0.068 + k * 0.0453, -0.0227 + k * 0.0453) });
  return { sinks, paint: [{ x: 0, z: -0.002, hw: 0.068, hd: 0.07, color: shade(LOESS, 1.04), layer: 0 }], pieces };
}
// (A length of it: heaped earth, low mounds running into each other.)
function berm(x0: number, x1: number): G[] {
  const r = rnd(Math.round(x0 * 1000) + 77), out: G[] = [];
  for (let x = x0 + 0.005; x < x1 - 0.003; x += 0.0045) {
    const k = 0.85 + 0.3 * r();
    out.push(P(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.0085 * k, 0.0062 * k, 0.0058), shade(LOESS, 0.93 + 0.08 * r()), { x: x + (r() - 0.5) * 0.0015, y: -0.0014, z: -0.0675 + (r() - 0.5) * 0.0015, ry: (r() - 0.5) * 0.4 }));
  }
  return out;
}
// Pit 1: nine corridors between earthen walls, two files of soldiers in each.
function pit1(): G[] {
  const r = rnd(41), out: G[] = [];
  const CLAY = 0xb09884, TIMBER = 0x5a4430, WH = 0.0045;
  const [p0, p1, q0, q1] = PITS[0]!, nC = 9, wall = 0.0032, cw = (p1 - p0 - (nC + 1) * wall) / nC, front = q1 - 0.018;
  for (let i = 0; i <= nC; i++) {
    const x = p0 + wall / 2 + i * (cw + wall);
    out.push(...box(wall, WH, front - q0, shade(LOESS, 0.95 + (i % 2) * 0.04), { x, z: (q0 + front) / 2 }, shade(LOESS, 1.04)));
  }
  for (let i = 0; i < nC; i++) {
    const cx = p0 + wall + cw / 2 + i * (cw + wall);
    // The roof beams still lying across the corridors' far ends.
    for (let j = 0; j < 4; j++) out.push(rod(V(cx - cw / 2 - 0.001, WH, q0 + 0.002 + j * 0.0024), V(cx + cw / 2 + 0.001, WH, q0 + 0.002 + j * 0.0024), 0.0008, shade(TIMBER, 0.9 + r() * 0.2), 4));
    for (let k = 0; k < 11; k++) for (const f of [-1, 1]) {
      const z = front - 0.004 - k * 0.0062;
      if (z < q0 + 0.012) continue;
      if (i === 4 && k % 4 === 2) { if (f < 0) out.push(...chariot(cx, z, 0)); continue; }
      out.push(...soldier(cx + f * cw * 0.24, z, CLAY, r));
    }
  }
  // The vanguard: ranks across the head of the pit.
  for (let row = 0; row < 2; row++) for (let i = 0; i < 24; i++) out.push(...soldier(p0 + 0.004 + i * ((p1 - p0 - 0.008) / 23), q1 - 0.004 - row * 0.005, CLAY, r));
  return out;
}
// Pit 2: chariots with their teams, cavalry with their horses.
function pit2(): G[] {
  const r = rnd(42), out: G[] = [];
  const [s0, , t0, t1] = PITS[1]!;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) out.push(...chariot(s0 + 0.01 + i * 0.016, t1 - 0.008 - j * 0.013, 0));
  for (let i = 0; i < 5; i++) out.push(...horse(s0 + 0.006 + i * 0.01, t0 + 0.006, 0, r), ...soldier(s0 + 0.0095 + i * 0.01, t0 + 0.005, 0xb09884, r));
  return out;
}
// Pit 3: the command, officers round their chariot.
function pit3(): G[] {
  const r = rnd(43), out: G[] = [];
  const [u0, u1, v0, v1] = PITS[2]!;
  out.push(...chariot((u0 + u1) / 2, (v0 + v1) / 2 + 0.004, 0));
  for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2; out.push(...soldier((u0 + u1) / 2 + Math.cos(t) * 0.012, (v0 + v1) / 2 + Math.sin(t) * 0.009, shade(0xb09884, 1.05), r)); }
  return out;
}
// A clay soldier at attention, facing +z: legs and armoured body, a head
// with its topknot, slightly varied.
function soldier(x: number, z: number, c: number, r: () => number): G[] {
  const k = shade(c, 0.9 + r() * 0.18), h = 0.0042;
  // (A robe flaring to the knee, armour to the shoulders, the arms at the
  // sides, a head with its hair knotted on top.)
  return [
    ...frustum(0.0019, 0.0014, 0.0014, 0.0011, h * 0.62, k, { x, y: 0.0004, z }),
    ...box(0.0024, h * 0.16, 0.0012, shade(k, 0.92), { x, y: 0.0004 + h * 0.6, z }),
    P(new THREE.OctahedronGeometry(h * 0.13, 0), shade(k, 1.1), { x, y: 0.0004 + h * 0.9, z, sy: 0.85, ry: Math.PI / 4 }),
    P(new THREE.OctahedronGeometry(h * 0.055, 0), shade(k, 0.75), { x, y: 0.0004 + h * 1.02, z: z - 0.0002 }),
  ];
}
// A horse facing +z (ry turns it): body, neck and head, legs.
function horse(x: number, z: number, ry: number, r: () => number): G[] {
  const c = shade(0x8a6e58, 0.92 + r() * 0.12), s = Math.sin(ry), cc = Math.cos(ry), at = (f: number) => ({ x: x + s * f, z: z + cc * f });
  const out: G[] = [...box(0.0016, 0.0016, 0.0048, c, { x, y: 0.0028, z, ry }), ...box(0.0011, 0.002, 0.0012, c, { ...at(0.0026), y: 0.0036, ry }), ...box(0.0009, 0.0009, 0.0018, shade(c, 0.95), { ...at(0.0035), y: 0.0052, ry })];
  for (const f of [-0.0018, 0.0018]) out.push(...box(0.0013, 0.0024, 0.0004, shade(c, 0.85), { x: x + s * f, y: 0.0004, z: z + cc * f, ry }));
  return out;
}
// A chariot with its team of four and its two crew, facing +z.
function chariot(x: number, z: number, ry: number): G[] {
  const r = rnd(Math.round((x + z) * 10000)), out: G[] = [];
  for (let i = 0; i < 4; i++) out.push(...horse(x - 0.0027 + i * 0.0018, z + 0.004, ry, r));
  out.push(...box(0.004, 0.0018, 0.003, 0x6a5038, { x, y: 0.0022, z: z - 0.002 }));
  for (const s of [-1, 1]) out.push(P(new THREE.TorusGeometry(0.0018, 0.0003, 3, 8).rotateY(Math.PI / 2), 0x5a4430, { x: x + s * 0.0024, y: 0.0022, z: z - 0.002 }));
  out.push(rod(V(x, 0.0024, z - 0.0005), V(x, 0.0024, z + 0.006), 0.0002, 0x5a4430, 3));
  out.push(...soldier(x - 0.0013, z - 0.0025, 0xb09884, r).map((g) => g.translate(0, 0.0014, 0)), ...soldier(x + 0.0013, z - 0.0025, 0xb09884, r).map((g) => g.translate(0, 0.0014, 0)));
  return out;
}
