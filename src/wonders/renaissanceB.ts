// Three of the Renaissance era's wonders (renaissance.ts): Florence's
// cathedral, the Templo Mayor and St Peter's, each on its 7 × 7
// site, in site units (kit.ts), the front +z.

import * as THREE from 'three';
import { gable } from '../houseKit.ts';
import {
  P, V, archPane, ball, box, cone, cyl, drumC, flat, H, pane, rod, shade, type G,
  PAD_Y,
} from './kit.ts';

const DARK = 0x3a332d, GOLD = 0xd9b24a;

// A lathed shell (a dome, a bowl): the profile's (radius, height) points
// turned round the vertical in n flat facets, a corner at phi.
function lathe(profile: readonly (readonly [number, number])[], n: number, c: number, o: { x?: number; y?: number; z?: number } = {}, phi = 0): G {
  return P(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), n, phi), c, o);
}
// Fits a building to the in-city pad: its footprint moved dz along z to
// the middle and scaled sH across; its heights raised by a two-slope map
// (a below y0, b above: the body stretched more than a dome, say), then by
// sH too. (The town is drawn taller than true, its wonders likewise.)
// Raises a group of parts by a piecewise map of height: from y = 0 each
// zone [until, slope] stretches what lies under `until` by `slope`.
function raise(parts: readonly G[], zones: readonly (readonly [number, number])[]): void {
  const map = (y: number) => {
    let at = 0, out = 0;
    for (const [until, k] of zones) { if (y <= until) return out + (y - at) * k; out += (until - at) * k; at = until; }
    return out;
  };
  for (const g of parts) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, map(p.getY(i)));
    p.needsUpdate = true;
  }
}
function fitTo(parts: G[], dz: number, sH: number, y0: number, a: number, b: number): G[] {
  for (const g of parts) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), yy = y < y0 ? y * a : y0 * a + (y - y0) * b;
      p.setXYZ(i, p.getX(i) * sH, yy * sH, (p.getZ(i) + dz) * sH);
    }
    p.needsUpdate = true;
  }
  return parts;
}
// A rib down a dome: along a profile of (radius, height) points turned to
// the bearing a round the vertical through (0, zc), w wide and standing t
// proud of the shell: its face and its two sides, mitred at each point.
function rib(prof: readonly (readonly [number, number])[], a: number, zc: number, w: number, t: number, c: number): G {
  const sx = Math.sin(a), sz = Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a);
  // (Each point's outward normal in the profile's plane, averaged over its two segments.)
  const nrm = prof.map((_, i) => {
    const [r0, y0] = prof[Math.max(0, i - 1)]!, [r1, y1] = prof[Math.min(prof.length - 1, i + 1)]!;
    const dr = r1 - r0, dy = y1 - y0, l = Math.hypot(dr, dy);
    return [dy / l, -dr / l] as const;
  });
  const at = (i: number, out: number, side: number) => {
    const [r, y] = prof[i]!, [nr, ny] = nrm[i]!, rr = r + nr * out;
    return [sx * rr + tx * side, y + ny * out, zc + sz * rr + tz * side];
  };
  const p: number[] = [];
  const quad = (A: number[], B: number[], C: number[], D: number[]) => p.push(...A, ...B, ...C, ...A, ...C, ...D);
  for (let i = 0; i < prof.length - 1; i++) {
    quad(at(i, t, -w / 2), at(i + 1, t, -w / 2), at(i + 1, t, w / 2), at(i, t, w / 2));
    for (const s of [-1, 1]) quad(at(i, -0.0004, (s * w) / 2), at(i + 1, -0.0004, (s * w) / 2), at(i + 1, t, (s * w) / 2), at(i, t, (s * w) / 2));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return P(g, c);
}
// A round window: a disc facing ry, its middle at x, y, z.
// (sy: squashed to stand round once its group is raised.)
const oculus = (r: number, c: number, x: number, y: number, z: number, ry: number, sy = 1) => P(new THREE.CircleGeometry(r, 10), c, { x, y, z, ry, sy });
// A triangle standing in a vertical plane facing ry (a gable, a pediment).
function tri(w: number, h: number, c: number, x: number, y: number, z: number, ry = 0): G {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0], 3));
  return P(g, c, { x, y, z, ry });
}
// A face of an octagon (its faces toward the axes): its outward normal and
// tangent, the apothem of an octagon of corner radius r.
const octFace = (k: number, r: number) => {
  const a = (k * Math.PI) / 4;
  return { nx: Math.sin(a), nz: Math.cos(a), tx: Math.cos(a), tz: -Math.sin(a), ry: a, ap: r * Math.cos(Math.PI / 8), w: 2 * r * Math.sin(Math.PI / 8) };
};

// ---------- Florence ----------

// Gothic outlines (after medieval.ts's Notre-Dame): a point (u, y) in a
// wall's plane.
type FlPt = readonly [number, number];
// A pointed arch from its right springing (w/2, ys) over the apex to its
// left springing (-w/2, ys): two arcs of radius k w meeting at the apex.
function flArc(w: number, ys: number, k = 0.85, n = 3): FlPt[] {
  const R = k * w, c = w / 2 - R, a1 = Math.acos(-c / R), out: FlPt[] = [];
  for (let i = 0; i <= n; i++) { const a = (a1 * i) / n; out.push([c + R * Math.cos(a), ys + R * Math.sin(a)]); }
  for (let i = 1; i <= n; i++) { const a = Math.PI - a1 + (a1 * i) / n; out.push([-c + R * Math.cos(a), ys + R * Math.sin(a)]); }
  return out;
}
// How far a pointed arch w wide rises over its springing.
const flRise = (w: number, k = 0.85) => k * w * Math.sin(Math.acos((k * w - w / 2) / (k * w)));
// A pointed opening's outline: its sill at y0, springing at ys.
const flArch = (w: number, ys: number, y0 = 0, n = 3): FlPt[] => [[-w / 2, y0], [w / 2, y0], ...flArc(w, ys, 0.85, n)];
// A pointed band (an archivolt, a hood mould): the outer arch wo wide less
// the inner wi, both springing at ys, standing on yb.
const flBand = (wo: number, wi: number, ys: number, yb: number, n = 3): FlPt[] =>
  [[-wo / 2, yb], [-wi / 2, yb], ...flArc(wi, ys, 0.85, n).reverse(), [wi / 2, yb], [wo / 2, yb], ...flArc(wo, ys, 0.85, n)];
const flShift = (pts: readonly FlPt[], dx: number, dy = 0): FlPt[] => pts.map(([u, y]) => [u + dx, y + dy] as const);
const flRect = (x0: number, y0: number, x1: number, y1: number): FlPt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const flCircle = (r: number, cx: number, cy: number, n: number, sy = 1): FlPt[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * sy * Math.sin((i / n) * Math.PI * 2)] as const);
// A wall's front from x0 to x1, y1 tall, pointed doorways cut up into it.
function flNotched(x0: number, x1: number, y1: number, notches: readonly { x: number; w: number; hs: number }[]): FlPt[] {
  const pts: FlPt[] = [[x0, 0]];
  for (const n of notches) pts.push([n.x - n.w / 2, 0], ...flShift(flArc(n.w, n.hs, 0.85, 4).reverse(), n.x), [n.x + n.w / 2, 0]);
  pts.push([x1, 0], [x1, y1], [x0, y1]);
  return pts;
}
const flShape = (pts: readonly FlPt[], holes: readonly (readonly FlPt[])[] = []) => {
  const s = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([u, y]) => new THREE.Vector2(u, y))));
  return s;
};
// A slab d thick (from z = 0 forward) of the outline, pierced by the holes.
// (back: false leaves out its back, against a wall.)
function flSlab(pts: readonly FlPt[], holes: readonly (readonly FlPt[])[], d: number, c: number, o: Parameters<typeof P>[2] = {}, back = true): G {
  const g = new THREE.ExtrudeGeometry(flShape(pts, holes), { depth: d, bevelEnabled: false, curveSegments: 1 });
  if (back) return P(g, c, o);
  // (Its lids come first, the back's faces then the front's.)
  const lid = g.groups[0]!, pos = g.getAttribute('position'), keep: number[] = [];
  for (let i = 0; i < pos.count; i++) if (i < lid.start || i >= lid.start + lid.count / 2) keep.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  const h = new THREE.BufferGeometry();
  h.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return P(h, c, o);
}
// A flat outline (glass, a shadowed recess, inlay) facing +z.
const flFlat = (pts: readonly FlPt[], c: number, o: Parameters<typeof P>[2] = {}, holes: readonly (readonly FlPt[])[] = []) => P(new THREE.ShapeGeometry(flShape(pts, holes), 1), c, o);
// Parts built facing +z about the origin, set at (x, y, z) facing ry.
function flXf(parts: G[], x: number, y: number, z: number, ry: number): G[] {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(1, 1, 1));
  return parts.map((g) => g.applyMatrix4(m));
}
// Santa Maria del Fiore: Brunelleschi's dome, eight ribs of white marble
// on red tiles rising in a pointed curve to the lantern, on its drum with
// its framed round windows; the three tribunes round the crossing with
// their chapels' Gothic windows and half domes; the nave and aisles cased
// in white marble inlaid with green-framed pink panels, Gothic windows
// under hood moulds between pilasters, round ones above, under lean-to
// roofs; the polychrome facade between its pinnacled piers: three deep
// portals with their gold lunettes under pointed gables, a row of statues
// in niches, the rose in its square frame, round windows over the aisles,
// an arcaded frieze and the gable with its medallion; Giotto's bell tower
// at its corner, its corner piers, hexagons and lozenges, statues, its
// windows growing lighter as it rises and its corbelled cornice.
// (Alone on its pad: the baptistery and the piazza left out.)
export function florenceCathedral(): G[] {
  const FA = 1.3, FD = 1.4; // how much the body and dome, and the drum, are raised (see the end)
  const MARBLE = 0xece6d8, GREEN = 0x4d6b56, PINK = 0xcc9c8c, TILE = 0xb85f3e, PAVE = 0xcdc3b0;
  const M2 = shade(MARBLE, 0.92), DEEP = shade(MARBLE, 0.55), GLASS = 0x34333c, DOOR = 0x5a4232, MOSAIC = 0xc9a24a;
  const out: G[] = [];
  const zc = -0.024, R0 = 0.022, nave = 0.04;
  // (Parts on a face, built facing +z with the face's plane at z = 0.)
  // An inlay panel w × h, its bottom middle at (u, y): a green frame round
  // a field, a lozenge in it (if lz).
  const inlay = (w: number, h: number, u: number, y: number, field = PINK, lz?: number): G[] => {
    const f = Math.min(w, h) * 0.16, r = flRect(u - w / 2 + f, y + f, u + w / 2 - f, y + h - f);
    const p = [flFlat(flRect(u - w / 2, y, u + w / 2, y + h), GREEN, { z: 0.0002 }, [r]), flFlat(r, field, { z: 0.0001 })];
    if (lz !== undefined) p.push(P(new THREE.CircleGeometry(Math.min(w * 0.36, h * 0.3), 4), lz, { x: u, y: y + h / 2, z: 0.0003, sx: 0.8 }));
    return p;
  };
  // A Gothic window w wide: its marble frame, glass, mullion (and tracery
  // ring if tr); its sill at y, springing at ys; a hood mould in `hood`.
  const win = (w: number, u: number, y: number, ys: number, tr: boolean, hood?: number, lights = 2, n = 3): G[] => {
    const f = Math.min(0.0004, w * 0.16), rise = flRise(w);
    const p = [flFlat(flShift(flArch(w + 2 * f, ys, y - f, n), u), MARBLE, { z: 0.0003 }), flFlat(flShift(flArch(w, ys, y, n), u), GLASS, { z: 0.0004 })];
    for (let i = 1; i < lights; i++) p.push(pane(w * 0.09, ys - y + rise * 0.3, MARBLE, u - w / 2 + (i * w) / lights, y, 0.0005));
    if (tr) p.push(P(new THREE.RingGeometry(w * 0.11, w * 0.19, 5), MARBLE, { x: u, y: ys + rise * 0.45, z: 0.0005 }));
    if (hood !== undefined) p.push(flFlat(flShift(flBand(w + 2 * f + 0.0008, w + 2 * f, ys, ys, n), u), hood, { z: 0.0003 }));
    return p;
  };
  // A round window r across at (u, y) (squashed by sy, to stand round once raised): green and marble rings, the glass.
  const roundel = (r: number, u: number, y: number, sy: number, n = 10, inner = true): G[] => [
    P(new THREE.RingGeometry(inner ? r * 0.84 : r * 0.7, r, n), GREEN, { x: u, y, z: 0.0003, sy }),
    ...(inner ? [P(new THREE.RingGeometry(r * 0.66, r * 0.84, n), MARBLE, { x: u, y, z: 0.0003, sy })] : []),
    P(new THREE.CircleGeometry(inner ? r * 0.66 : r * 0.7, n), GLASS, { x: u, y, z: 0.0002, sy }),
  ];
  // A statue in a niche: the shadowed arch w × h (its springing), the figure.
  const niche = (w: number, h: number, u: number, y: number, head = true): G[] => [
    flFlat(flShift(flArch(w, h, 0, 2), u, y), DEEP, { z: 0.0002 }),
    cyl(w * 0.3, w * 0.18, h * 0.82, 4, 0xf4f0e6, { x: u, y, z: 0.0006 }),
    ...(head ? [P(new THREE.OctahedronGeometry(w * 0.16), 0xf4f0e6, { x: u, y: y + h * 0.92, z: 0.0006 })] : []),
  ];
  // Green strips framing a face w wide, h tall from y0; green bands across it at ys.
  const strips = (w: number, y0: number, h: number, ys: readonly number[]): G[] => [
    ...[-1, 1].map((s) => pane(0.0008, h, GREEN, s * (w / 2 - 0.0005), y0, 0.0001)),
    ...ys.map((y) => pane(w, 0.0007, GREEN, 0, y, 0.0001)),
  ];
  // The octagon round the crossing, panelled; its three tribunes.
  out.push(drumT(R0, R0, nave, 8, MARBLE, { z: zc, ry: Math.PI / 8 }));
  out.push(P(new THREE.CylinderGeometry(R0 * 1.035, R0 * 1.035, 0.0016, 8, 1, true).translate(0, nave - 0.0006, 0), M2, { z: zc, ry: Math.PI / 8 }));
  for (let k = 1; k < 8; k++) {
    const f = octFace(k, R0), p: G[] = [];
    if (k % 2) {
      p.push(...strips(f.w, 0, nave, [0.0004, 0.0135, 0.0265]));
      p.push(...inlay(0.0126, 0.011, 0, 0.0016, PINK, GREEN));
      p.push(...win(0.0034, 0, 0.0148, 0.0225, true));
      p.push(...roundel(0.0028, 0, 0.0325, 1 / FA, 8));
    } else {
      p.push(...strips(f.w, 0.028, nave - 0.028, [0.0285]), ...roundel(0.0022, 0, 0.0335, 1 / FA, 8, false));
    }
    out.push(...flXf(p, f.nx * f.ap, 0, zc + f.nz * f.ap, f.ry));
  }
  for (const k of [2, 4, 6]) {
    const f = octFace(k, R0), x = f.nx * (R0 + 0.004), z = zc + f.nz * (R0 + 0.004), rt = 0.011, ht = 0.028;
    out.push(drumT(rt, rt, ht, 8, MARBLE, { x, z, ry: Math.PI / 8 }));
    out.push(drumT(rt * 1.05, rt * 1.05, 0.0013, 8, M2, { x, y: ht - 0.0012, z, ry: Math.PI / 8 }));
    for (const j of [k - 2, k - 1, k, k + 1, k + 2]) {
      const g = octFace(j, rt);
      const side = Math.abs(j - k) === 2;
      const p = [...strips(g.w, 0, ht, [0.0215]), ...(side ? [] : inlay(g.w * 0.62, 0.0052, 0, 0.0016)), ...win(0.0024, 0, 0.0082, 0.0158, false, side ? undefined : GREEN, 2, 2)];
      out.push(...flXf(p, x + g.nx * g.ap, 0, z + g.nz * g.ap, g.ry));
    }
    out.push(lathe(([[rt * 1.02, 0], [rt * 0.95, 0.003], [rt * 0.75, 0.0065], [rt * 0.42, 0.0092], [0.0012, 0.0102]] as const).map(([a, b]) => [a, b / FA * 1.15] as const), 8, TILE, { x, y: ht, z }, Math.PI / 8));
    out.push(drumT(0.0016, 0.0012, 0.003 / FA, 8, MARBLE, { x, y: ht + 0.0098 / FA * 1.15, z }));
  }
  // The drum: its base moulding; on each face green bands and strips, and
  // the round window in its deep moulded frame (marble and a green ring);
  // the gallery at the dome's foot.
  const iDrum = out.length;
  const Rd = 0.0192, yd = nave, hd = 0.014;
  out.push(drumT(Rd, Rd, hd, 8, MARBLE, { y: yd, z: zc, ry: Math.PI / 8 }));
  out.push(drumT(Rd * 1.03, Rd * 1.03, 0.0014, 8, M2, { y: yd, z: zc, ry: Math.PI / 8 }));
  for (let k = 0; k < 8; k++) {
    const f = octFace(k, Rd), r = 0.0034, t = 0.0009, yo = yd + hd * 0.52, sy = 1 / FD;
    const p = [
      ...strips(f.w, yd, hd, []),
      P(new THREE.CylinderGeometry(r * 1.36, r * 1.36, t, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, t / 2), M2, { y: yo, sy }),
      P(new THREE.RingGeometry(r * 1.12, r * 1.36, 10), MARBLE, { y: yo, z: t, sy }),
      P(new THREE.RingGeometry(r * 0.94, r * 1.12, 10), GREEN, { y: yo, z: t + 0.0001, sy }),
      P(new THREE.CircleGeometry(r * 0.94, 10), GLASS, { y: yo, z: 0.0002, sy }),
    ];
    out.push(...flXf(p, f.nx * f.ap, 0, zc + f.nz * f.ap, f.ry));
  }
  out.push(drumC(Rd * 1.06, Rd * 1.06, 0.0018, 8, shade(MARBLE, 0.95), { y: yd + hd, z: zc, ry: Math.PI / 8 }));
  // The dome: eight tiled sails rising in a pointed curve, white ribs on the corners.
  const Rm = Rd * 1.0, ym = yd + hd + 0.0018, hm = 0.0175;
  const prof: [number, number][] = [[1, 0], [0.985, 0.14], [0.945, 0.3], [0.87, 0.47], [0.75, 0.63], [0.58, 0.78], [0.37, 0.9], [0.2, 0.97], [0.14, 1]];
  out.push(lathe(prof.map(([a, b]) => [a * Rm, b * hm] as const), 8, TILE, { y: ym, z: zc }, Math.PI / 8));
  // (The shell's height at a fraction r of its radius.)
  const shellAt = (r: number) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [a0, b0] = prof[i]!, [a1, b1] = prof[i + 1]!;
      if (r <= a0 && r >= a1) return b0 + ((b1 - b0) * (a0 - r)) / (a0 - a1);
    }
    return 1;
  };
  for (let k = 0; k < 8; k++) out.push(rib(prof.map(([a, b]) => [a * Rm, ym + b * hm] as const), Math.PI / 8 + (k * Math.PI) / 4, zc, 0.0019, 0.0009, MARBLE));
  // The lantern: on a moulded ring at the shell's top, an octagon of tall
  // arched windows, a buttress at each corner (a marble plate standing on
  // the shell, its outer edge sweeping up in a curve to a scroll under the
  // cornice); the cornice, the fluted cone with its ribs, the gilded ball
  // and cross.
  const yl = ym + hm, rl = 0.0042, hl = 0.0085;
  out.push(drumC(0.0064, 0.006, 0.0012, 16, shade(MARBLE, 0.95), { y: ym + shellAt(0.0062 / Rm) * hm - 0.0004, z: zc }));
  out.push(drumC(rl, rl * 0.96, hl, 8, MARBLE, { y: yl, z: zc, ry: Math.PI / 8 }));
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4, rb = 0.0078;
    // (The plate's outline in its radial plane: r out from the axis, y up from yl.)
    const sh = new THREE.Shape(), base = (r: number) => ym + shellAt(r / Rm) * hm - yl - 0.0003;
    sh.moveTo(rl * 0.9, base(rl * 0.9));
    sh.lineTo(rb, base(rb));
    sh.quadraticCurveTo(rb - 0.0004, 0.0045, rl + 0.0012, 0.0066);
    // (The scroll: a small round turned under the cornice.)
    for (let j = 0; j <= 6; j++) { const t = -Math.PI / 2 + (j / 6) * Math.PI * 1.5; sh.lineTo(rl + 0.0007 + Math.cos(t) * 0.0006, 0.0072 + Math.sin(t) * 0.0006); }
    sh.lineTo(rl * 0.9, hl - 0.0004);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.001, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.0005);
    // (Shape x → outward along the bearing a, y → up, depth → across.)
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(a - Math.PI / 2));
    out.push(P(g, shade(MARBLE, 1.02), { y: yl, z: zc }));
    const f = octFace(k, rl * 0.98);
    out.push(...archPane(0.0012, 0.0045, DARK, f.nx * (f.ap + 0.0002), yl + 0.0016, zc + f.nz * (f.ap + 0.0002), f.ry));
  }
  // Over the cornice, a low round stage ringed by little pinnacles; on it
  // the tall fluted cone, its ribs, a short neck; the great gilded ball and
  // the cross.
  out.push(drumC(rl + 0.0009, rl + 0.0011, 0.0009, 8, shade(MARBLE, 0.95), { y: yl + hl, z: zc, ry: Math.PI / 8 }));
  const ys = yl + hl + 0.0009, rs = rl * 0.82, hs = 0.0018;
  out.push(drumC(rs, rs, hs, 16, MARBLE, { y: ys, z: zc }), drumC(rs + 0.0004, rs + 0.0004, 0.0004, 16, shade(MARBLE, 0.94), { y: ys + hs, z: zc }));
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, x = Math.sin(a) * (rl + 0.0003), z = zc + Math.cos(a) * (rl + 0.0003);
    out.push(drumC(0.00035, 0.0003, 0.0012, 4, MARBLE, { x, y: yl + hl + 0.0009, z }), cone(0.0004, 0.0016, 4, shade(MARBLE, 1.05), { x, y: yl + hl + 0.0021, z }));
  }
  const yc = ys + hs + 0.0004, rc = rs * 0.95, hc = 0.0105;
  out.push(P(new THREE.ConeGeometry(rc, hc, 16).translate(0, hc / 2, 0), MARBLE, { y: yc, z: zc }));
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    out.push(rod(V(Math.sin(a) * rc * 1.02, yc, zc + Math.cos(a) * rc * 1.02), V(0, yc + hc * 0.97, zc), 0.00026, shade(MARBLE, 1.07), 3));
  }
  const BRIGHT = 0xe8bf3c, yt = yc + hc - 0.0006;
  out.push(drumC(0.0006, 0.0004, 0.0012, 8, BRIGHT, { y: yt, z: zc }));
  out.push(ball(0.0019, BRIGHT, { y: yt + 0.0012 + 0.0018 / FA, z: zc, sy: 1 / FA }, 2)); // (round once the whole is raised by FA)
  out.push(rod(V(0, yt + 0.0036, zc), V(0, yt + 0.0088, zc), 0.0003, BRIGHT, 4), rod(V(-0.0015, yt + 0.0074, zc), V(0.0015, yt + 0.0074, zc), 0.00028, BRIGHT, 4));
  // The nave and its aisles, from the facade back to the octagon: four bays
  // (the true nave's length squeezed to fit a square site). Each aisle wall
  // bay between pilasters: an inlaid panel, a tall Gothic window under its
  // hood mould, a panel over it; the corbelled cornice; the lean-to roof up
  // to the clerestory, its round windows between green strips.
  const iNave = out.length;
  const zb = zc + R0 * Math.cos(Math.PI / 8) - 0.001, zf = zb + 0.027, L = zf - zb, zn = (zf + zb) / 2, aw = 0.032, nw = 0.017, ah = 0.026;
  out.push(...box(aw, ah, L, MARBLE, { z: zn }, shade(TILE, 0.85)));
  out.push(...box(nw, nave, L, MARBLE, { z: zn }));
  out.push(...gable(nw + 0.0015, L + 0.0012, 0.0075, TILE, { y: nave, z: zn }, true, MARBLE));
  out.push(box(nw + 0.0012, 0.0011, L - 0.0004, M2, { y: nave - 0.0011, z: zn })[0]!);
  out.push(...box(aw + 0.0014, 0.0013, L - 0.0004, M2, { y: ah - 0.0012, z: zn }));
  for (const s of [-1, 1]) {
    const xo = s * (aw / 2 + 0.0007), yo = ah + 0.0002, xi = s * nw / 2, yi = ah + 0.0042;
    const A = [xo, yo, zb], B = [xo, yo, zf], C = [xi, yi, zf], D = [xi, yi, zb];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? [...A, ...C, ...B, ...A, ...D, ...C] : [...A, ...B, ...C, ...A, ...C, ...D], 3));
    out.push(P(g, shade(TILE, 0.92)));
    const bay = L / 4, p: G[] = [], q: G[] = [];
    p.push(...strips(L, 0, 0, [0.0004, 0.0083, 0.0207]).slice(2));
    for (let i = 0; i < 4; i++) {
      const u = -L / 2 + (i + 0.5) * bay;
      p.push(box(0.0013, ah - 0.0012, 0.0012, MARBLE, { x: -L / 2 + i * bay, z: 0.0004 })[0]!);
      p.push(...inlay(0.0044, 0.0058, u, 0.0016), ...win(0.0026, u, 0.0094, 0.0163, true, GREEN));
      q.push(...roundel(0.0019, u, 0.0348, 1 / FA, 8, false), pane(0.0007, nave - ah, GREEN, -L / 2 + i * bay, ah, 0.0001));
    }
    q.push(pane(L, 0.0007, GREEN, 0, 0.0385, 0.0001));
    out.push(...flXf(p, s * aw / 2, 0, zn, s * Math.PI / 2), ...flXf(q, s * nw / 2, 0, zn, s * Math.PI / 2));
  }
  // The facade between four pinnacled piers: three portals (deep, under a
  // projecting archivolt and a crocketed gable, a gold mosaic in each
  // lunette), cornices across, a row of statues in niches, the rose in its
  // square frame, round windows over the aisles, panels of pink and green,
  // an arcaded frieze, the gable with its medallion.
  const fw = 0.034, fh = 0.042, zF = zf + 0.003;
  const portals = [{ x: -0.0112, w: 0.0044, hs: 0.0058 }, { x: 0, w: 0.0072, hs: 0.0085 }, { x: 0.0112, w: 0.0044, hs: 0.0058 }] as const;
  const fp: G[] = []; // (parts on the facade's front, z from zF)
  out.push(flSlab(flNotched(-fw / 2, fw / 2, fh, portals), [], 0.003, MARBLE, { z: zf }));
  for (const pt of portals) {
    const hd = pt.hs * 0.7, wo = pt.w + 0.0024, gw = wo + (pt.x === 0 ? 0.0016 : 0.0012), ga = pt.hs + 1.3 * wo;
    out.push(pane(pt.w, hd, DOOR, pt.x, 0, zf + 0.0001), box(pt.w, 0.0007, 0.0024, M2, { x: pt.x, y: hd, z: zf + 0.0012 })[0]!);
    out.push(flFlat(flShift(flArch(pt.w, pt.hs, hd + 0.0007, 4), pt.x), MOSAIC, { z: zf + 0.0001 }));
    out.push(P(new THREE.CircleGeometry(pt.w * 0.13, 6), 0x3c4f86, { x: pt.x, y: hd + 0.0007 + (pt.hs + flRise(pt.w) - hd) * 0.42, z: zf + 0.0002, sy: 1.3 / FA }));
    fp.push(flSlab(flShift(flBand(wo, pt.w, pt.hs, 0, 4), pt.x), [], 0.0008, M2, {}, false));
    fp.push(flFlat(flShift(flBand(pt.w + 0.0011, pt.w, pt.hs, 0, 4), pt.x), GREEN, { z: 0.0009 }));
    // (The gable over it: its raking copings, crocketed, from the springing
    // to the finial; its pink field over the arch; pinnacles either side.)
    for (const s of [-1, 1]) {
      fp.push(rod(V(pt.x + (s * gw) / 2, pt.hs, 0.0009), V(pt.x, ga, 0.0009), 0.00035, MARBLE, 4));
      for (const t of [0.5, 0.72]) fp.push(cone(0.0003, 0.0008, 3, MARBLE, { x: pt.x + s * (gw / 2) * (1 - t), y: pt.hs + (ga - pt.hs) * t + 0.0002, z: 0.0009 }));
      const xs = pt.x + s * (wo / 2 + 0.0004);
      fp.push(cyl(0.00045, 0.00045, pt.hs + 0.0015, 4, M2, { x: xs, z: 0.0004 }), cone(0.0006, 0.0022, 4, MARBLE, { x: xs, y: pt.hs + 0.0015, z: 0.0004 }));
    }
    const yb = pt.hs + flRise(wo) + 0.0002, k = (ga - pt.hs) / (gw / 2), hw = (ga - yb) / k - 0.0004;
    fp.push(tri(2 * hw, hw * k, PINK, pt.x, yb, 0.0006));
    fp.push(cone(0.0005, 0.0018, 4, MARBLE, { x: pt.x, y: ga - 0.0003, z: 0.0009 }));
  }
  // (The piers, the cornices across.)
  for (const [x, w, h, d] of [[-0.0158, 0.0026, fh + 0.0012, 0.0016], [-0.0068, 0.0022, fh, 0.0014], [0.0068, 0.0022, fh, 0.0014], [0.0158, 0.0026, fh + 0.0012, 0.0016]] as const) {
    fp.push(...box(w, h, d, MARBLE, { x, z: d / 2 - 0.0002 }));
    fp.push(P(new THREE.ConeGeometry(w * 0.5, 0.006, 6, 1, true).translate(0, 0.003, 0), MARBLE, { x, y: h, z: d / 2 - 0.0002 }));
    const pp = [...inlay(w * 0.62, 0.0158, x, 0.0012), ...inlay(w * 0.62, 0.009, x, 0.0265)];
    if (Math.abs(x) < 0.01) pp.push(...niche(0.0013, 0.0042, x, 0.0196, false)); else pp.push(...inlay(w * 0.62, 0.0052, x, 0.0194));
    fp.push(...flXf(pp, 0, 0, d - 0.0002, 0));
  }
  // (Their ends a little in from the facade's sides, inside the corner piers.)
  for (const y of [0.0253, 0.0358]) fp.push(...box(fw - 0.0004, 0.0008, 0.0012, M2, { y, z: 0.0003 }));
  for (const s of [-1, 1]) fp.push(...box(fw / 2 - 0.0018, 0.0008, 0.0012, M2, { x: s * (fw / 4 + 0.0007), y: 0.0182, z: 0.0003 }));
  fp.push(...box(fw + 0.0008, 0.0011, 0.0019, M2, { y: fh - 0.0009, z: 0.00035 }));
  // (The niches with their statues, the arcaded frieze.)
  for (const x of [-0.0044, -0.0022, 0.0022, 0.0044, -0.0129, -0.0095, 0.0095, 0.0129]) fp.push(...niche(0.0016, 0.0039, x, 0.0196, Math.abs(x) < 0.005));
  for (const x of [-0.0045, -0.0015, 0.0015, 0.0045, -0.0127, -0.0097, 0.0097, 0.0127]) fp.push(flFlat(flShift(flArch(0.0013, 0.0019, 0, 2), x, 0.0373), DEEP, { z: 0.0002 }));
  // (Panels: over the side portals' gables, round the aisles' round windows.)
  for (const s of [-1, 1]) {
    fp.push(...inlay(0.0054, 0.0025, s * 0.0112, 0.0153, PINK, GREEN), ...inlay(0.0054, 0.0024, s * 0.0112, 0.0263), ...inlay(0.0054, 0.0026, s * 0.0112, 0.0328));
    fp.push(...roundel(0.0022, s * 0.0112, 0.0305, 1 / FA));
    fp.push(...box(0.0066, 0.0016, 0.0009, MARBLE, { x: s * 0.0112, y: fh + 0.0002, z: -0.0006 }));
  }
  // (The rose: its square frame, the glass, rim, rings, spokes and lights.)
  {
    const r = 0.0044, h = 0.0052, rose: G[] = [];
    rose.push(flSlab(flRect(-h, -h, h, h), [flCircle(r, 0, 0, 16)], 0.0006, M2, {}, false));
    rose.push(flFlat(flRect(-h, -h, h, h), GREEN, { z: 0.0007 }, [flRect(-h + 0.0006, -h + 0.0006, h - 0.0006, h - 0.0006)]));
    rose.push(P(new THREE.CircleGeometry(r, 16), 0x3a3550, { z: 0.0001 }));
    rose.push(P(new THREE.RingGeometry(r * 0.86, r, 16), GREEN, { z: 0.0003 }));
    rose.push(P(new THREE.RingGeometry(r * 0.5, r * 0.57, 12), MARBLE, { z: 0.0003 }), P(new THREE.RingGeometry(r * 0.18, r * 0.25, 8), MARBLE, { z: 0.0003 }));
    const LIGHTS = [0x9a2a3a, 0x3f5fa8, 0xc69a3a, 0x4e7a52] as const;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, b = a + Math.PI / 12;
      rose.push(P(new THREE.PlaneGeometry(r * 0.05, r * 0.58).translate(0, r * 0.54, 0).rotateZ(a), MARBLE, { z: 0.0003 }));
      rose.push(P(new THREE.CircleGeometry(r * 0.11, 4), LIGHTS[i % 4]!, { x: Math.cos(b) * r * 0.7, y: Math.sin(b) * r * 0.7, z: 0.0002 }));
    }
    rose.push(P(new THREE.CircleGeometry(r * 0.18, 8), 0xc69a3a, { z: 0.0002 }));
    for (const g of rose) fp.push(g.scale(1, 1 / FA, 1).translate(0, 0.031, 0));
  }
  // (The gable over the middle: its pink field, the medallion, crockets up its rakes, the finial.)
  const gh = 0.011, gw2 = 0.016;
  out.push(tri(gw2, gh, MARBLE, 0, fh, zF - 0.0015), tri(gw2, gh, MARBLE, 0, fh, zF - 0.0015, Math.PI));
  out.push(rod(V(-gw2 / 2, fh, zF - 0.0015), V(0, fh + gh, zF - 0.0015), 0.0008, MARBLE, 4), rod(V(gw2 / 2, fh, zF - 0.0015), V(0, fh + gh, zF - 0.0015), 0.0008, MARBLE, 4));
  out.push(tri(0.012, 0.0072, PINK, 0, fh + 0.0012, zF + 0.0002 - 0.0015));
  out.push(P(new THREE.RingGeometry(0.0017, 0.0023, 10), GREEN, { y: fh + 0.0042, z: zF - 0.0012, sy: 1 / FA }), P(new THREE.CircleGeometry(0.0017, 10), MOSAIC, { y: fh + 0.0042, z: zF - 0.0012, sy: 1 / FA }));
  out.push(P(new THREE.CircleGeometry(0.0007, 6), 0x3c4f86, { y: fh + 0.0042, z: zF - 0.0011, sy: 1.3 / FA }));
  for (const s of [-1, 1]) for (let i = 1; i <= 4; i++) { const t = i / 5; out.push(cone(0.0003, 0.0009, 3, MARBLE, { x: s * (gw2 / 2) * (1 - t), y: fh + gh * t + 0.0004, z: zF - 0.0015 })); }
  out.push(cone(0.0006, 0.0026, 4, MARBLE, { y: fh + gh, z: zF - 0.0015 }));
  out.push(...flXf(fp, 0, 0, zF, 0));
  const iTower = out.length;
  // Giotto's bell tower at the facade's right corner: its corner piers;
  // cornices between its storeys; hexagons and lozenges on pink, statues in
  // niches; then pairs of windows twice, a tall three-light window at the
  // top, each under its hood mould; the corbelled cornice and the parapet
  // of blind arches.
  const cx = 0.0225, cz = zf - 0.0055, cw = 0.0098, ch = 0.084;
  out.push(...box(cw, ch, cw, MARBLE, { x: cx, z: cz }, shade(MARBLE, 0.92)));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(cyl(0.001, 0.001, 0.082, 6, shade(MARBLE, 1.03), { x: cx + (sx * cw) / 2, z: cz + (sz * cw) / 2 }));
  for (const y of [0.0115, 0.0215, 0.0298, 0.0438, 0.0578]) out.push(...box(cw + 0.0016, 0.0007, cw + 0.0016, M2, { x: cx, y, z: cz }));
  out.push(box(cw + 0.0014, 0.0016, cw + 0.0014, M2, { x: cx, y: 0.0804, z: cz })[0]!);
  out.push(...box(cw + 0.0034, 0.0012, cw + 0.0034, M2, { x: cx, y: 0.082, z: cz }), ...box(cw + 0.003, 0.0024, cw + 0.003, MARBLE, { x: cx, y: 0.0832, z: cz }, shade(MARBLE, 0.85)));
  for (let k = 0; k < 4; k++) {
    const ry = (k * Math.PI) / 2, p: G[] = [], sy = 1 / 1.22;
    p.push(...inlay(cw - 0.0024, 0.0098, 0, 0.0009, PINK));
    for (const u of [-0.0024, 0, 0.0024]) p.push(P(new THREE.CircleGeometry(0.001, 6), GREEN, { x: u, y: 0.0058, z: 0.0003, sy, rz: Math.PI / 6 }), P(new THREE.CircleGeometry(0.0007, 6), MARBLE, { x: u, y: 0.0058, z: 0.0004, sy, rz: Math.PI / 6 }));
    p.push(...inlay(cw - 0.0024, 0.0082, 0, 0.0127, PINK));
    for (const u of [-0.0024, 0, 0.0024]) p.push(P(new THREE.CircleGeometry(0.0011, 4), GREEN, { x: u, y: 0.0168, z: 0.0003, sy: 1.2 }), P(new THREE.CircleGeometry(0.0007, 4), MARBLE, { x: u, y: 0.0168, z: 0.0004, sy: 1.2 }));
    for (const u of [-0.0033, -0.0011, 0.0011, 0.0033]) p.push(...niche(0.0014, 0.0049, u, 0.0226, false));
    for (const y0 of [0.0305, 0.0445]) for (const u of [-0.0019, 0.0019]) p.push(...win(0.0017, u, y0 + 0.0016, y0 + 0.0093, false, GREEN, 2, 2));
    p.push(...win(0.0044, 0, 0.0602, 0.0742, true, GREEN, 3));
    for (const u of [-0.0039, -0.0013, 0.0013, 0.0039]) p.push(flFlat(flShift(flArch(0.0012, 0.0016, 0, 2), u, 0.0838), DEEP, { z: 0.0017 }));
    out.push(...flXf(p, cx + Math.sin(ry) * cw / 2, 0, cz + Math.cos(ry) * cw / 2, ry));
  }
  // Raised (the town is drawn taller than true): the body and the dome by
  // FA, the drum between them more, the bell tower to about three quarters
  // of the dome's height; then fitted to its pad.
  raise([...out.slice(0, iDrum), ...out.slice(iNave, iTower)], [[1, FA]]);
  raise(out.slice(iDrum, iNave), [[nave, FA], [ym, FD], [1, FA]]);
  raise(out.slice(iTower), [[1, 1.22]]);
  return [flat(2 * H, 2 * H, PAVE, 0, 0, PAD_Y), ...fitTo(out, 0.0177, 1.68, 1, 1, 1)];
}

// ---------- St Peter's ----------

// Michelangelo's basilica: the dome on its drum of paired columns, ribbed
// in lead, its lantern; the two small domes beside it; the cross of nave,
// arms and apses under a balustrade; Maderno's facade of giant columns and
// statues; its steps. (Alone on its pad: Bernini's piazza left out; the
// nave drawn long enough to fill the square site front to back.)
// A closed drum without its floor (standing on something), on y = o.y.
function drumT(r0: number, r1: number, h: number, n: number, c: number, o: { x?: number; y?: number; z?: number; ry?: number } = {}): G {
  const g = new THREE.CylinderGeometry(r1, r0, h, n, 1, false), b = g.groups[g.groups.length - 1]!;
  g.setIndex(Array.from(g.getIndex()!.array).slice(0, b.start));
  return P(g.translate(0, h / 2, 0), c, o);
}
// A dormer's block w × h × d facing ry, its back (into a roof) left open.
function lucarne(w: number, h: number, d: number, c: number, x: number, y: number, z: number, ry: number): G {
  const X = w / 2, Z = d / 2, g = new THREE.BufferGeometry();
  const q = (a: number[], b: number[], cc: number[], dd: number[]) => [...a, ...b, ...cc, ...a, ...cc, ...dd];
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    ...q([-X, 0, Z], [X, 0, Z], [X, h, Z], [-X, h, Z]), ...q([X, 0, Z], [X, 0, -Z], [X, h, -Z], [X, h, Z]),
    ...q([-X, 0, -Z], [-X, 0, Z], [-X, h, Z], [-X, h, -Z]), ...q([-X, h, Z], [X, h, Z], [X, h, -Z], [-X, h, -Z]),
  ], 3));
  return P(g, c, { x, y, z, ry });
}
// A stone statue h tall standing on y.
const spStatue = (x: number, y: number, z: number, h: number, c: number): G[] => [
  cyl(h * 0.15, h * 0.09, h * 0.74, 5, c, { x, y, z }),
  P(new THREE.OctahedronGeometry(h * 0.1), shade(c, 1.05), { x, y: y + h * 0.84, z }),
];
export function stPeters(): G[] {
  const SA = 1.5; // how much the body is raised (see the end)
  const S = 1.5, DZ = 0.0275; // its fit to the pad: scaled S, moved DZ back to front
  const TRAV = 0xe6dcc6, LEAD = 0x8e979c, PAVE = 0xc9bea8, ROOF = 0x9a8f80, RIB = 0xd8d2c4;
  const out: G[] = [];
  const zF = 0.012, fw = 0.064, fh = 0.032, fy = 0.003;
  // The steps up to the facade.
  // (Each runs back into the facade a little further than the one under it.)
  for (let i = 0; i < 3; i++) { const zf = zF + 0.009 - i * 0.002, zb = zF - 0.0002 - i * 0.0004; out.push(...box(0.05 - i * 0.004, 0.001 * (i + 1), zf - zb, shade(TRAV, 1 - i * 0.02), { z: (zf + zb) / 2 })); }
  // The facade: giant columns and pilasters, its pediment, attic and statues, windows and the loggia, clocks at its ends.
  out.push(...box(fw, fh, 0.008, TRAV, { y: fy, z: zF - 0.004 }));
  out.push(...box(fw + 0.002, 0.0026, 0.0096, shade(TRAV, 0.95), { y: fy + fh, z: zF - 0.004 }));
  out.push(...box(fw, 0.0055, 0.008, TRAV, { y: fy + fh + 0.0026, z: zF - 0.004 }, ROOF));
  for (let i = 0; i < 13; i++) out.push(...spStatue(-0.024 + i * 0.004, fy + fh + 0.0081, zF - 0.001, 0.0048, 0xf0e8d6));
  for (let i = 0; i < 8; i++) {
    const x = [-0.026, -0.019, -0.0095, -0.004, 0.004, 0.0095, 0.019, 0.026][i]!;
    out.push(cyl(0.0021, 0.0018, fh - 0.003, 6, shade(TRAV, 1.04), { x, y: fy, z: zF + 0.0006 }));
    out.push(...box(0.005, 0.0028, 0.0034, shade(TRAV, 1.03), { x, y: fy + fh - 0.003, z: zF + 0.0006 }));
  }
  out.push(tri(0.02, 0.0055, TRAV, 0, fy + fh + 0.0026, zF + 0.0022), tri(0.016, 0.0038, shade(TRAV, 0.9), 0, fy + fh + 0.0034, zF + 0.0024));
  for (const [x, w] of [[-0.0142, 0.0055], [0.0142, 0.0055], [0, 0.0044], [-0.0225, 0.0035], [0.0225, 0.0035]] as const) {
    out.push(...archPane(w, 0.0085, DARK, x, fy + 0.001, zF + 0.0003));
    out.push(pane(w * 0.75, 0.0045, DARK, x, fy + 0.017, zF + 0.0003));
    out.push(pane(w * 0.6, 0.003, DARK, x, fy + 0.026, zF + 0.0003));
  }
  out.push(...archPane(0.006, 0.0068, 0x4a3a30, 0, fy + 0.0145, zF + 0.0004), ...box(0.008, 0.0008, 0.002, TRAV, { y: fy + 0.0142, z: zF + 0.001 }));
  for (const s of [-1, 1]) {
    out.push(...box(0.008, 0.009, 0.008, TRAV, { x: s * 0.03, y: fy + fh, z: zF - 0.004 }, ROOF));
    out.push(oculus(0.0024, 0xf2ead6, s * 0.03, fy + fh + 0.0045, zF + 0.0003, 0, 1 / SA), oculus(0.0017, 0x3a3a3a, s * 0.03, fy + fh + 0.0045, zF + 0.0005, 0, 1 / SA));
  }
  // The body: nave and arms under balustrades, three apses, pilasters and windows.
  const zc = -0.046, bh = 0.03;
  out.push(...box(0.034, bh, zF - 0.008 - zc, TRAV, { z: (zF - 0.008 + zc) / 2 }, ROOF));
  out.push(...gable(0.032, zF - 0.008 - zc, 0.006, LEAD, { y: bh, z: (zF - 0.008 + zc) / 2 }, true, TRAV));
  // (The nave's flanks: pilasters and two rows of windows, bay by bay.)
  {
    const z0 = zc + 0.016, z1 = zF - 0.008, n = Math.round((z1 - z0) / 0.0062);
    for (const s of [-1, 1]) for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      out.push(pane(0.0012, bh, shade(TRAV, 1.05), s * 0.0172, 0, z, s * Math.PI / 2));
      if (i < n) {
        const zm = z + (z1 - z0) / n / 2;
        out.push(pane(0.0024, 0.008, DARK, s * 0.0173, 0.008, zm, s * Math.PI / 2), pane(0.0018, 0.003, DARK, s * 0.0173, 0.021, zm, s * Math.PI / 2));
      }
    }
  }
  out.push(...box(0.07, bh, 0.032, TRAV, { z: zc }, ROOF));
  for (const [x, z] of [[-0.035, zc], [0.035, zc], [0, zc - 0.016]] as const) {
    const rr = 0.014;
    out.push(cyl(rr, rr, bh - 0.0002, 20, TRAV, { x, z }), P(new THREE.CircleGeometry(rr, 20).rotateX(-Math.PI / 2), ROOF, { x, y: bh + 0.00005, z }));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, nx = Math.sin(a), nz = Math.cos(a);
      if (x === 0 ? nz > 0.3 : x * nx < -0.3 * Math.abs(x)) continue;
      out.push(pane(0.0012, bh, shade(TRAV, 1.05), x + nx * (rr + 0.0002), 0, z + nz * (rr + 0.0002), a));
      if (i % 2) out.push(pane(0.0022, 0.007, DARK, x + nx * (rr + 0.0004), 0.009, z + nz * (rr + 0.0004), a), pane(0.0018, 0.003, DARK, x + nx * (rr + 0.0004), 0.021, z + nz * (rr + 0.0004), a));
    }
  }
  // Raised (the town is drawn taller than true) and fitted to its pad;
  // the domes are built after, at their drawn size, so keep true shape.
  raise(out, [[1, SA]]);
  fitTo(out, DZ, S, 1, 1, 1);
  // A Michelangelo dome, R its drum's radius, on the roof at (cx, y, cz):
  // a stepped base; the drum ringed by n buttresses, each fronted by
  // columns (a pair on the great dome), windows between under pediments,
  // triangular and segmental in turn; the entablature, the attic with its
  // pilasters; the lead shell rising a little pointed, n white ribs (tiers
  // of lucarnes between them on the great dome); the lantern of columns,
  // its cupola, spike, golden ball and cross.
  const cupola = (cx: number, cz: number, y: number, R: number, n: number, hd: number, hm: number, big: boolean) => {
    const N = 2 * n, e = 0.0002, ap = R * Math.cos(Math.PI / N);
    const at = (a: number, r: number) => [cx + Math.sin(a) * r, cz + Math.cos(a) * r] as const;
    let yy = y - 0.0003;
    out.push(drumT(R * 1.24, R * 1.24, R * 0.08, N, shade(TRAV, 0.92), { x: cx, y: yy, z: cz }));
    yy += R * 0.08 - e;
    out.push(drumT(R * 1.14, R * 1.14, R * 0.1, N, TRAV, { x: cx, y: yy, z: cz }));
    yy += R * 0.1 - e;
    // The drum.
    const yd = yy;
    out.push(cyl(R, R, hd, N, TRAV, { x: cx, y: yd, z: cz }));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = a + Math.PI / n;
      { const [x, z] = at(a, R * 1.08); out.push(box(R * 0.17, hd * 0.9, R * 0.2, shade(TRAV, 0.93), { x, y: yd, z, ry: a })[0]!); }
      if (big) { const [x, z] = at(a, R * 1.14); out.push(box(R * 0.24, hd * 0.08, R * 0.22, shade(TRAV, 0.97), { x, y: yd, z, ry: a })[0]!); }
      for (const s of big ? [-1, 1] : [0]) {
        const [x0, z0] = at(a, R * 1.2), x = x0 + Math.cos(a) * s * R * 0.06, z = z0 - Math.sin(a) * s * R * 0.06;
        out.push(cyl(R * 0.045, R * 0.038, hd * 0.8 + e, big ? 6 : 4, shade(TRAV, 1.08), { x, y: yd + hd * 0.08 - e, z }));
      }
      { const [x, z] = at(a, R * 1.2); out.push(box(big ? R * 0.22 : R * 0.1, hd * 0.045, R * 0.1, shade(TRAV, 1.04), { x, y: yd + hd * 0.84, z, ry: a })[0]!); }
      // The window between, its frame and its pediment.
      { const [x, z] = at(b, ap + 0.0001); out.push(pane(R * 0.19, hd * 0.5, shade(TRAV, 1.07), x, yd + hd * 0.17, z, b)); }
      { const [x, z] = at(b, ap + 0.0002); out.push(pane(R * 0.12, hd * 0.42, DARK, x, yd + hd * 0.2, z, b)); }
      const [px, pz] = at(b, ap + 0.0003);
      if (i % 2) out.push(tri(R * 0.24, hd * 0.08, shade(TRAV, 1.07), px, yd + hd * 0.69, pz, b));
      else out.push(P(new THREE.CircleGeometry(R * 0.12, 5, 0, Math.PI).scale(1, 0.6, 1), shade(TRAV, 1.07), { x: px, y: yd + hd * 0.69, z: pz, ry: b }));
    }
    out.push(drumT(R * 1.28, R * 1.28, hd * 0.12 + 0.0001, N, shade(TRAV, 0.96), { x: cx, y: yd + hd * 0.88, z: cz }));
    // The attic: pilasters over the buttresses, little windows between, its cornice.
    const ya = yd + hd - e, ha = R * 0.26;
    out.push(cyl(R * 1.02, R * 1.02, ha, N, TRAV, { x: cx, y: ya, z: cz }));
    const apA = R * 1.02 * Math.cos(Math.PI / N);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = a + Math.PI / n;
      { const [x, z] = at(a, apA + R * 0.02); out.push(box(R * 0.13, ha * 0.9, R * 0.06, shade(TRAV, 1.04), { x, y: ya + e, z, ry: a })[0]!); }
      { const [x, z] = at(b, apA + 0.0002); out.push(pane(R * 0.09, ha * 0.36, DARK, x, ya + ha * 0.3, z, b)); }
    }
    out.push(drumT(R * 1.08, R * 1.08, R * 0.04, N, shade(TRAV, 0.95), { x: cx, y: ya + ha - e, z: cz }));
    // The shell, its ribs and lucarnes.
    const ym = ya + ha + R * 0.04 - 2 * e, Rm = R * 0.99;
    const prof: [number, number][] = big
      ? [[1, 0], [0.99, 0.1], [0.96, 0.22], [0.9, 0.36], [0.8, 0.51], [0.67, 0.65], [0.5, 0.78], [0.35, 0.89], [0.25, 0.96], [0.21, 1]]
      : [[1, 0], [0.96, 0.22], [0.8, 0.51], [0.55, 0.75], [0.33, 0.9], [0.21, 1]];
    out.push(lathe(prof.map(([a, b]) => [a * Rm, b * hm] as const), N, LEAD, { x: cx, y: ym, z: cz }));
    const ribProf = prof.map(([a, b]) => [a * Rm, ym + b * hm] as const);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      out.push(rib(ribProf, a, cz, R * 0.07, R * 0.035, RIB).translate(cx, 0, 0));
      if (!big) continue;
      const b = a + Math.PI / n;
      for (const [f, h, s] of [[0.955, 0.24, 1], [0.83, 0.47, 0.85], [0.64, 0.68, 0.7]] as const) {
        const r = f * Rm - R * 0.03, [x, z] = at(b, r), [wx, wz] = at(b, r + R * 0.04 * s + 0.0002);
        out.push(lucarne(R * 0.09 * s, R * 0.08 * s, R * 0.08 * s, RIB, x, ym + h * hm, z, b));
        out.push(pane(R * 0.05 * s, R * 0.05 * s, DARK, wx, ym + h * hm + R * 0.012 * s, wz, b));
      }
    }
    // The lantern.
    const yl = ym + hm - R * 0.02, rl = R * 0.23, hl = R * 0.42, nL = big ? 16 : 8;
    out.push(cyl(rl, rl, hl * 0.86 + e, nL, TRAV, { x: cx, y: yl, z: cz }));
    const nl = big ? 8 : 4;
    for (let i = 0; i < nl; i++) {
      const a = (i / nl) * Math.PI * 2, b = a + Math.PI / nl;
      for (const s of big ? [-1, 1] : [0]) {
        const [x0, z0] = at(a, rl + R * 0.035), x = x0 + Math.cos(a) * s * R * 0.03, z = z0 - Math.sin(a) * s * R * 0.03;
        out.push(cyl(R * 0.018, R * 0.016, hl * 0.86, 4, shade(TRAV, 1.05), { x, y: yl, z }));
      }
      const [x, z] = at(b, rl * Math.cos(Math.PI / nL) + 0.0002);
      out.push(...archPane(R * 0.06, hl * 0.42, DARK, x, yl + hl * 0.2, z, b));
    }
    out.push(drumT(rl * 1.3, rl * 1.3, R * 0.04, nL, shade(TRAV, 0.96), { x: cx, y: yl + hl * 0.86, z: cz }));
    const yc = yl + hl * 0.86 + R * 0.04 - e;
    out.push(cyl(rl, rl, R * 0.05, nL, TRAV, { x: cx, y: yc, z: cz }));
    out.push(lathe([[rl * 1.02, 0], [rl * 0.92, R * 0.06], [rl * 0.7, R * 0.12], [rl * 0.35, R * 0.16], [rl * 0.12, R * 0.175]], nL, LEAD, { x: cx, y: yc + R * 0.05 - e, z: cz }));
    const ys = yc + R * 0.05 + R * 0.17;
    out.push(cone(R * 0.04, R * 0.14, big ? 6 : 4, TRAV, { x: cx, y: ys, z: cz }));
    out.push(ball(R * 0.045, GOLD, { x: cx, y: ys + R * 0.16, z: cz }));
    out.push(rod(V(cx, ys + R * 0.19, cz), V(cx, ys + R * 0.32, cz), R * 0.011, GOLD, 3), rod(V(cx - R * 0.04, ys + R * 0.27, cz), V(cx + R * 0.04, ys + R * 0.27, cz), R * 0.009, GOLD, 3));
  };
  const Zc = (zc + DZ) * S, Y0 = bh * SA * S;
  cupola(0, Zc, Y0, 0.0295, 16, 0.036, 0.037, true);
  // The two small domes over the side chapels, at the crossing's front corners.
  for (const s of [-1, 1]) cupola(s * 0.03 * S, (zc + 0.013 + DZ) * S, Y0, 0.0085, 8, 0.009, 0.0102, false);
  return [flat(2 * H, 2 * H, PAVE, 0, 0, PAD_Y), ...out];
}

// ---------- Tenochtitlan ----------

// An Aztec serpent's head, s across, its chin on the ground at the origin,
// facing +z (set in place with flXf): the skull, the open jaws with the red
// mouth between, the snout's ridge, eyes and fangs; (if `full`) the brows
// and the scales of the neck.
function serpentHead(s: number, stone: number, mouth: number, full: boolean): G[] {
  const p: G[] = [
    ...box(s, s * 0.5, s * 1.1, stone, { y: s * 0.32 }),
    ...box(s * 0.86, s * 0.22, s * 1.0, shade(stone, 0.9), { z: s * 0.05 }),
    ...box(s * 0.8, s * 0.1, s * 0.9, mouth, { y: s * 0.22, z: -s * 0.04 }),
  ];
  if (!full) return p;
  p.push(...box(s * 0.56, s * 0.16, s * 0.4, shade(stone, 1.06), { y: s * 0.82, z: s * 0.32 }));
  for (const t of [-1, 1]) {
    p.push(P(new THREE.OctahedronGeometry(s * 0.13), 0xf2ead8, { x: t * s * 0.32, y: s * 0.7, z: s * 0.36 }));
    p.push(...box(s * 0.3, s * 0.1, s * 0.34, shade(stone, 1.08), { x: t * s * 0.32, y: s * 0.82, z: s * 0.2 }));
    p.push(P(new THREE.ConeGeometry(s * 0.07, s * 0.16, 3).rotateX(Math.PI), 0xf2ead8, { x: t * s * 0.26, y: s * 0.26, z: s * 0.47 }));
  }
  for (let i = 0; i < 2; i++) p.push(...box(s * 0.9 - i * s * 0.12, s * 0.12, s * 0.22, shade(stone, 0.95 + i * 0.08), { y: s * 0.82, z: -s * 0.2 - i * s * 0.26 }));
  // (The forked tongue out over the ground, the pupils.)
  for (const t of [-1, 1]) {
    p.push(P(new THREE.PlaneGeometry(s * 0.1, s * 0.5).rotateX(-Math.PI / 2).rotateY(t * 0.3), mouth, { x: t * s * 0.06, y: s * 0.03, z: s * 0.78 }));
    p.push(P(new THREE.CircleGeometry(s * 0.06, 4), 0x2a2420, { x: t * s * 0.32, y: s * 0.7, z: s * 0.36 + s * 0.131 }));
  }
  return p;
}
// The Great Temple of Tenochtitlan on its walled platform. The pyramid of
// four tiers, each a sloping talud of stone courses under a tablero
// painted blue on Tlaloc's half and red on Huitzilopochtli's, set with
// rings and skulls; the twin stairs, the balustrades between and beside
// them rising to their steep dados, great feathered serpents' heads at
// their feet; the Coyolxauhqui stone at the foot of Huitzilopochtli's
// stair, braziers either side. On top the twin shrines: Tlaloc's (rain;
// left) striped blue and white, his goggle eyes and fangs over the door,
// its crest of blue and white slabs with rings, the Chac Mool before it;
// Huitzilopochtli's (war; right) red with its racks of skulls, its crest
// of stepped white merlons, the sacrificial stone before it; braziers
// burning. Round the platform the coatepantli, the serpent wall: merlons
// along its coping, serpents' bodies undulating along it and their heads
// jutting out.
export function temploMayor(): G[] {
  const STUCCO = 0xe6d6b4, STONE = 0xb2a58c, RED = 0xb3392b, BLUE = 0x3b6db0, PLAZA = 0xcfc2a2, WHITE = 0xf0ece0, JADE = 0x4a8a6a, FIRE = 0xf0a040;
  const SY = 1 / 1.37; // (circles squashed to stand round once the whole is raised)
  const out: G[] = [];
  // The temple's platform and the serpent wall round it.
  const pz = -0.0215, pw = 0.086;
  out.push(...box(pw, 0.004, pw, STONE, { z: pz }, PLAZA));
  const wallH = 0.0045, y0 = 0.004;
  for (const [x, z, w, d] of [[0, pz - pw / 2 + 0.0015, pw - 0.002, 0.002], [-pw / 2 + 0.0015, pz, 0.002, pw - 0.002], [pw / 2 - 0.0015, pz, 0.002, pw - 0.002], [-0.0255, pz + pw / 2 - 0.0015, 0.033, 0.002], [0.0255, pz + pw / 2 - 0.0015, 0.033, 0.002]] as const) {
    out.push(...box(w, wallH, d, STUCCO, { x, y: y0, z }));
    out.push(...box(w + 0.0008, 0.0006, d + 0.0008, shade(STUCCO, 0.92), { x, y: y0 + wallH, z }));
    // (Along the wall: u along it, its outer face facing ry.)
    const along = w > d, len = along ? w : d, ry = along ? (z < pz ? Math.PI : 0) : x < 0 ? -Math.PI / 2 : Math.PI / 2;
    const n = Math.round(len / 0.0062), p: G[] = [];
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (i + 0.5) * (len / n);
      p.push(...box(0.0018, 0.0012, 0.0012, STUCCO, { x: u, y: wallH + 0.0006, z: -0.001 }), ...box(0.001, 0.0011, 0.0012, STUCCO, { x: u, y: wallH + 0.0018, z: -0.001 }));
    }
    // (The serpents' bodies: a zigzag band; their heads every few paces.)
    const zz: FlPt[] = [], k = Math.round(len / 0.007), hb = 0.0011;
    for (let i = 0; i <= k; i++) zz.push([-len / 2 + (i * len) / k, wallH * 0.48 + (i % 2 ? hb : -hb)]);
    for (let i = k; i >= 0; i--) zz.push([-len / 2 + (i * len) / k, wallH * 0.48 + (i % 2 ? hb : -hb) + 0.0009]);
    p.push(flFlat(zz, JADE, { z: 0.0001 }));
    const nh = Math.round(len / 0.0125);
    for (let i = 0; i < nh; i++) p.push(...flXf(serpentHead(0.0016, STUCCO, RED, false), -len / 2 + (i + 0.5) * (len / nh), 0.0008, 0, 0));
    out.push(...flXf(p, x + Math.sin(ry) * 0.001, y0, z + Math.cos(ry) * 0.001, ry));
  }
  // The Great Temple: four tiers (a talud of three courses, a painted
  // tablero with its rings or skulls), the twin stairs, the twin shrines.
  const tz = -0.03, tw = 0.07, td = 0.058, n = 4, th = 0.0105, yt = y0 + n * th;
  let topB: readonly [number, number] = [0, 0];
  for (let i = 0; i < n; i++) {
    const k = i / n, wi = tw * (1 - k * 0.5), di = td * (1 - k * 0.5), wn = tw * (1 - (k + 1 / n) * 0.5), dn = td * (1 - (k + 1 / n) * 0.5), y = y0 + i * th;
    const a = [wi / 2, di / 2] as const, b = [wn / 2 + (wi - wn) * 0.12, dn / 2 + (di - dn) * 0.12] as const, hh = th * 0.74;
    topB = b;
    for (let c = 0; c < 3; c++) {
      const t0 = c / 3, t1 = (c + 1) / 3, X0 = a[0] + (b[0] - a[0]) * t0, Z0 = a[1] + (b[1] - a[1]) * t0, X1 = a[0] + (b[0] - a[0]) * t1, Z1 = a[1] + (b[1] - a[1]) * t1, y1 = hh * t0, y2 = hh * t1;
      const q = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number) => [x0, y1, z0, x1, y1, z1, x2, y2, z2, x0, y1, z0, x2, y2, z2, x3, y2, z3];
      const talud = new THREE.BufferGeometry();
      talud.setAttribute('position', new THREE.Float32BufferAttribute([
        ...q(-X0, Z0, X0, Z0, X1, Z1, -X1, Z1), ...q(X0, -Z0, -X0, -Z0, -X1, -Z1, X1, -Z1),
        ...q(X0, Z0, X0, -Z0, X1, -Z1, X1, Z1), ...q(-X0, -Z0, -X0, Z0, -X1, Z1, -X1, -Z1),
      ], 3));
      out.push(P(talud, shade(STUCCO, 0.97 - i * 0.01 + (c % 2 ? 0.03 : 0)), { y, z: tz }));
    }
    out.push(...box(b[0] * 2 + 0.0006, th - hh, b[1] * 2 + 0.0006, shade(STUCCO, 1.02), { y: y + hh, z: tz }, shade(STONE, 1.05)));
    // (The painted band round the tablero, blue on the left half and red on
    // the right; Tlaloc's jade rings and Huitzilopochtli's skulls along it.)
    const yb = y + hh + (th - hh) * 0.2, hb = (th - hh) * 0.6, ym = yb + hb / 2, X = b[0] + 0.0004, Z = b[1] + 0.0004;
    const item = (s: number, x: number, z: number, ry: number) => [
      P(new THREE.CircleGeometry(hb * 0.42, 5), WHITE, { x, y: ym, z, ry, sy: SY * 1.2 }),
      P(new THREE.CircleGeometry(hb * 0.2, 4), s < 0 ? JADE : DARK, { x: x + Math.sin(ry) * 0.0001, y: ym, z: z + Math.cos(ry) * 0.0001, ry, sy: SY * 1.2 }),
    ];
    for (const s of [-1, 1]) {
      const c = s > 0 ? RED : BLUE;
      out.push(pane(X, hb, c, (s * X) / 2, yb, tz + Z), pane(X, hb, c, (s * X) / 2, yb, tz - Z, Math.PI));
      out.push(pane(Z * 2, hb, c, s * X, yb, tz, (s * Math.PI) / 2));
      const e = 0.0002, m = Math.max(1, Math.round((X - 0.0175) / 0.0052));
      for (let j = 0; j < m; j++) out.push(...item(s, s * (X - (j + 0.5) * ((X - 0.0165) / m)), tz + Z + e, 0));
      const ms = Math.round((2 * Z) / 0.0058);
      for (let j = 0; j < ms; j++) out.push(...item(s, s * (X + e), tz - Z + (j + 0.5) * ((2 * Z) / ms), (s * Math.PI) / 2));
      const mb = Math.round(X / 0.0058);
      for (let j = 0; j < mb; j++) out.push(...item(s, s * (j + 0.5) * (X / mb), tz - Z - e, Math.PI));
    }
  }
  // The twin stairs from the plaza up to the top's front edge, step by
  // step; the balustrades beside and between them (sloping, then steep at
  // the dado, its cap painted); serpents' heads at their feet.
  const z0 = tz + td / 2 + 0.012, z1 = tz + topB[1] + 0.0003, ns = 24, run = (z0 - z1) / ns, rise = (yt + 0.0002 - y0) / ns, slope = rise / run;
  for (const s of [-1, 1]) {
    const x = s * 0.0085, w = 0.0118;
    for (let i = 0; i < ns; i++) {
      const zf = z0 - i * run, y = y0 + i * rise;
      out.push(pane(w, rise, shade(STUCCO, 0.98), x, y, zf), P(new THREE.PlaneGeometry(w, run).rotateX(-Math.PI / 2), shade(STUCCO, 1.08), { x, y: y + rise, z: zf - run / 2 }));
    }
  }
  const zA = z0 + 0.0008, yB = y0 + 0.0028, yC = yt - 0.006, zC = zA - (yC - yB) / slope, zD = zC - 0.0014, yD = yt + 0.0034, zE = z1 - 0.0016;
  for (const [x, bw, cap] of [[-0.0156, 0.0024, BLUE], [0, 0.0052, WHITE], [0.0156, 0.0024, RED]] as const) {
    const g = new THREE.ExtrudeGeometry(flShape([[zA, y0], [zA, yB], [zC, yC], [zD, yD], [zE, yD], [zE, y0]]), { depth: bw, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x + bw / 2, 0, 0);
    out.push(P(g, shade(STUCCO, 1.03)));
    out.push(...box(bw + 0.0003, 0.0009, zD - zE + 0.0004, cap, { x, y: yD, z: (zD + zE) / 2 }));
    for (const hx of x === 0 ? [-0.0021, 0.0021] : [x]) out.push(...flXf(serpentHead(0.0038, STONE, RED, true), hx, y0, zA + 0.0012, 0));
  }
  // Serpents undulating along the foot of the pyramid either side of the
  // stairs, their heads to the front.
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) pts.push(V(s * (0.0215 + i * 0.0021), y0 + 0.0009, 0.0028 + Math.sin(i * 1.4) * 0.0011));
    for (let i = 0; i < 6; i++) out.push(rod(pts[i]!, pts[i + 1]!, 0.0009 - i * 0.00005, i % 2 ? shade(JADE, 1.1) : JADE, 5));
    for (let i = 1; i < 6; i++) out.push(ball(0.00095 - i * 0.00005, JADE, { x: pts[i]!.x, y: pts[i]!.y, z: pts[i]!.z, sy: 0.9 }));
    out.push(...flXf(serpentHead(0.0024, JADE, RED, true), s * 0.0212, y0, 0.0034, -s * 0.5));
  }
  // The Coyolxauhqui stone at the foot of Huitzilopochtli's stair; braziers either side of the stairs.
  out.push(P(new THREE.CircleGeometry(0.0026, 14).rotateX(-Math.PI / 2), 0xc9ab8a, { x: 0.0085, y: y0 + 0.00012, z: 0.0168 }));
  out.push(P(new THREE.RingGeometry(0.0022, 0.0026, 14).rotateX(-Math.PI / 2), 0x9a7a62, { x: 0.0085, y: y0 + 0.0002, z: 0.0168 }));
  for (const [dx, dz, r] of [[0, 0, 0.0007], [0.0012, 0.0006, 0.0004], [-0.0011, 0.0008, 0.0004], [0.0009, -0.0011, 0.0004], [-0.001, -0.001, 0.0004]] as const) out.push(P(new THREE.CircleGeometry(r, 5).rotateX(-Math.PI / 2), 0x8a5a4a, { x: 0.0085 + dx, y: y0 + 0.0002, z: 0.0168 + dz }));
  const brazier = (x: number, y: number, z: number, r: number) => [
    drumT(r * 0.8, r, r * 2.2, 8, STONE, { x, y, z }), drumT(r * 1.04, r * 1.04, r * 0.5, 8, RED, { x, y: y + r * 1.4, z }),
    cone(r * 0.85, r * 1.1, 5, FIRE, { x, y: y + r * 2.2, z }), cone(r * 0.45, r * 1.6, 4, 0xf6d050, { x, y: y + r * 2.2, z }),
  ];
  for (const s of [-1, 1]) out.push(...brazier(s * 0.031, y0, 0.0105, 0.0018));
  // The shrines: their plinths, walls and doors; Tlaloc's (left) striped
  // blue and white with his goggle eyes and fangs over the door, his crest
  // of slabs with rings; Huitzilopochtli's (right) red with racks of skulls,
  // its crest of stepped merlons; roof bands; braziers before them, the
  // Chac Mool before Tlaloc's, the sacrificial stone before Huitzilopochtli's.
  const sz = tz - 0.004, sw = 0.0155, sd = 0.014, sh = 0.0145, ys = yt + 0.0012;
  for (const s of [-1, 1]) {
    const x = s * 0.0092, wall = s > 0 ? RED : WHITE, trim = s > 0 ? WHITE : BLUE, zf = sz + sd / 2, sh2 = sh - 0.0012;
    out.push(...box(sw + 0.0016, 0.0012, sd + 0.0016, STONE, { x, y: yt, z: sz }, shade(STONE, 1.08)));
    out.push(box(sw, sh2, sd, wall, { x, y: ys, z: sz })[0]!);
    out.push(pane(0.0044, 0.0074, DARK, x, ys, zf + 0.0002));
    for (const t of [-1, 1]) out.push(box(0.001, 0.0082, 0.0008, trim, { x: x + t * 0.0027, y: ys, z: zf + 0.0002 })[0]!);
    out.push(...box(0.0066, 0.0011, 0.0009, trim, { x, y: ys + 0.0082, z: zf + 0.0002 }));
    if (s < 0) {
      for (const u of [-0.0062, -0.0045, 0.0045, 0.0062]) out.push(pane(0.0009, sh2, BLUE, x + u, ys, zf + 0.0001));
      for (const t of [-1, 1]) for (const u of [-0.0045, -0.0015, 0.0015, 0.0045]) out.push(pane(0.0009, sh2, BLUE, x + t * (sw / 2 + 0.0001), ys, sz + u, (t * Math.PI) / 2));
      for (const t of [-1, 1]) {
        out.push(P(new THREE.RingGeometry(0.0009, 0.0014, 8), WHITE, { x: x + t * 0.0016, y: ys + 0.0112, z: zf + 0.0002, sy: SY }), P(new THREE.CircleGeometry(0.0009, 8), BLUE, { x: x + t * 0.0016, y: ys + 0.0112, z: zf + 0.0002, sy: SY }));
      }
      for (const u of [-0.0008, 0, 0.0008]) out.push(tri(0.0005, -0.0012, WHITE, x + u, ys + 0.0097, zf + 0.0003));
    } else {
      for (const t of [-1, 1]) {
        out.push(pane(0.0034, 0.0062, shade(RED, 0.6), x + t * 0.0055, ys + 0.0012, zf + 0.0001));
        for (let r = 0; r < 3; r++) for (const u of [-0.0008, 0.0008]) out.push(P(new THREE.CircleGeometry(0.00055, 5), WHITE, { x: x + t * 0.0055 + u, y: ys + 0.0024 + r * 0.0019, z: zf + 0.0002, sy: SY }));
        out.push(pane(sd - 0.002, 0.0026, shade(RED, 0.6), x + t * (sw / 2 + 0.0001), ys + 0.0085, sz, (t * Math.PI) / 2));
        for (const u of [-0.0045, -0.0015, 0.0015, 0.0045]) out.push(P(new THREE.CircleGeometry(0.00055, 5), WHITE, { x: x + t * (sw / 2 + 0.0002), y: ys + 0.0098, z: sz + u, ry: (t * Math.PI) / 2, sy: SY }));
      }
    }
    // (The roof: a band, a step, the crest along its front.)
    const yr = ys + sh2;
    out.push(...box(sw + 0.0012, 0.0026, sd + 0.0012, s > 0 ? shade(RED, 0.82) : BLUE, { x, y: yr, z: sz }, STUCCO));
    out.push(...box(sw - 0.0008, 0.001, sd - 0.0024, STUCCO, { x, y: yr + 0.0026, z: sz - 0.0004 }, shade(STUCCO, 0.9)));
    if (s < 0) for (let i = 0; i < 4; i++) out.push(P(new THREE.RingGeometry(0.00055, 0.001, 8), WHITE, { x: x - 0.0054 + i * 0.0036, y: yr + 0.0013, z: zf + 0.0007, sy: SY }));
    else for (let i = 0; i < 6; i++) out.push(P(new THREE.CircleGeometry(0.0005, 5), WHITE, { x: x - 0.0063 + i * 0.00252, y: yr + 0.0013, z: zf + 0.0007, sy: SY }));
    const yc = yr + 0.0036, zc = zf - 0.0012;
    for (let i = 0; i < 5; i++) {
      const u = x - sw / 2 + 0.0019 + i * 0.0029;
      if (s < 0) {
        const c = i % 2 ? WHITE : shade(BLUE, 1.1);
        out.push(...box(0.0021, 0.0042, 0.0009, c, { x: u, y: yc, z: zc }));
        out.push(P(new THREE.RingGeometry(0.0003, 0.0006, 6), i % 2 ? BLUE : WHITE, { x: u, y: yc + 0.0025, z: zc + 0.00056, sy: SY }));
      } else {
        out.push(...box(0.0023, 0.0022, 0.0009, WHITE, { x: u, y: yc, z: zc }), ...box(0.0012, 0.0019, 0.0009, WHITE, { x: u, y: yc + 0.0022, z: zc }));
        out.push(P(new THREE.CircleGeometry(0.00045, 5), RED, { x: u, y: yc + 0.0011, z: zc + 0.00056, sy: SY }));
      }
    }
    for (const t of [-1, 1]) out.push(...brazier(x + t * 0.0052, yt + 0.0012, zf + 0.0028, 0.0009));
    if (s < 0) {
      // (The Chac Mool: reclining, knees up, the bowl on its belly, its head turned to the stair.)
      const cx = x, cz = zf + 0.0034, yy = yt + 0.0012;
      out.push(...box(0.0024, 0.0006, 0.0046, STONE, { x: cx, y: yy, z: cz }));
      out.push(...box(0.0018, 0.0011, 0.0018, shade(STONE, 1.1), { x: cx, y: yy + 0.0006, z: cz - 0.0012 }));
      out.push(...box(0.0013, 0.0012, 0.0011, RED, { x: cx, y: yy + 0.0012, z: cz - 0.0019 }));
      for (const t of [-1, 1]) out.push(...box(0.0006, 0.0016, 0.0007, shade(STONE, 1.1), { x: cx + t * 0.0005, y: yy + 0.0006, z: cz + 0.0013 }));
      out.push(drumT(0.0006, 0.0007, 0.0004, 6, BLUE, { x: cx, y: yy + 0.0017, z: cz - 0.0001 }));
    } else out.push(drumT(0.0009, 0.0006, 0.0018, 4, 0x6a6058, { x, y: yt + 0.0012, z: zf + 0.0034, ry: Math.PI / 4 }));
  }
  // (On its pad, filling it: about 4 cells tall.)
  return [flat(2 * H, 2 * H, PLAZA, 0, 0, PAD_Y), ...fitTo(out, 0.0215, 1.67, 0, 1.37, 1.37)];
}
