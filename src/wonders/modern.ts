// The Modern era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z. All stand in their city, each the
// monument alone on a plain pad the size of its site, at its height
// against the town (a storey about 0.95 cell, a tall skyscraper 14.6).

import * as THREE from 'three';
import { P, V, ball, box, cyl, disc, drumC, flat, pane, rnd, rod, shade, statue, type G, type Models } from './kit.ts';
import { CRISTO } from './statues.ts';

const PAD = 0xc9c4b8, PAVE = 0xc9c4b8;

// ---------- shared pieces ----------

// A parametric surface f(u, v), u, v in [0, 1], nu × nv cells, each cell
// coloured by color(i, j) (cells of a colour merged into one part).
function surface(f: (u: number, v: number) => THREE.Vector3, nu: number, nv: number, color: (i: number, j: number) => number): G[] {
  const by = new Map<number, number[]>();
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = f(i / nu, j / nv), b = f((i + 1) / nu, j / nv), c = f((i + 1) / nu, (j + 1) / nv), d = f(i / nu, (j + 1) / nv);
    const k = color(i, j), arr = by.get(k) ?? [];
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    by.set(k, arr);
  }
  return [...by].map(([k, p]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return P(g, k);
  });
}
// The plain pad under an in-city wonder, the whole site: its fitted size
// in a city is then fixed (a city cell about 0.039 site units).
const pad = (): G => flat(0.1574, 0.1574, PAD, 0, 0, 0.0002);
// Scales a model's parts (x, y, z) about the site's middle on the ground.
const stretch = (parts: G[], sx: number, sy: number, sz: number): G[] => parts.map((g) => g.applyMatrix4(new THREE.Matrix4().makeScale(sx, sy, sz)));
// Horizontal bands (a floor's windows) round a box's four faces.
function floors(cx: number, cz: number, w: number, d: number, y0: number, y1: number, n: number, bh: number, c: number): G[] {
  const out: G[] = [];
  for (let i = 0; i < n; i++) {
    const y = y0 + ((i + 0.5) * (y1 - y0)) / n - bh / 2;
    for (const [ry, len, o] of [[0, w, d / 2], [Math.PI, w, d / 2], [Math.PI / 2, d, w / 2], [-Math.PI / 2, d, w / 2]] as const) {
      out.push(pane(len * 0.96, bh, c, cx + Math.sin(ry) * (o + 0.00025), y, cz + Math.cos(ry) * (o + 0.00025), ry));
    }
  }
  return out;
}

// ---------- Rio ----------

// Christ the Redeemer on Corcovado: the granite crag, its bare face toward
// the city, its flanks deep in rainforest; on the summit the viewing
// terrace with its railing and tourists, the chapel in the pedestal, and
// the robed figure, arms open, head bowed a little; the rack railway's red
// tram climbing the flank.
function cristoRedentor(): G[] {
  const r = rnd(31), out: G[] = [pad()];
  const GRANITE = 0x6f6b62, SOAP = 0xe8e3d4, CH = 0.145, R0 = 0.07, R1 = 0.02;
  const radiusAt = (y: number) => R1 + (R0 - R1) * (1 - y / CH);
  // The crag: a jagged cone, its top cut for the terrace.
  const crag = new THREE.CylinderGeometry(R1, R0, CH, 14, 8, false);
  const pos = crag.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), f = (y + CH / 2) / CH;
    if (f <= 0.001 || f >= 0.999) continue;
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    // (Steeper toward the front, the famous face.)
    const front = Math.max(0, Math.sin(a)), j = 1 + (r() - 0.5) * 0.2 - front * 0.12 * f;
    pos.setX(i, pos.getX(i) * j); pos.setZ(i, pos.getZ(i) * j); pos.setY(i, y + (r() - 0.5) * 0.005);
  }
  crag.translate(0, CH / 2, 0);
  out.push(P(crag.toNonIndexed(), GRANITE));
  // Ledges of paler granite streaked down the face.
  for (let k = 0; k < 9; k++) {
    const a = Math.PI / 2 + (r() - 0.5) * 1.1, y = 0.03 + r() * 0.08, rr = radiusAt(y);
    out.push(ball(0.003 + r() * 0.0025, shade(GRANITE, 1.1 + r() * 0.15), { x: Math.cos(a) * rr * 0.92, y, z: Math.sin(a) * rr * 0.92, sy: 1.8, ry: r() * 6.28 }));
  }
  // The forest's mantle round its foot (the landform's own green, not trees one by one).
  const mantle = new THREE.CylinderGeometry(R0 * 0.8, R0 * 1.06, 0.036, 16, 2, true);
  const mp = mantle.getAttribute('position');
  for (let i = 0; i < mp.count; i++) { if (mp.getY(i) > -0.017) { const j = 1 + (r() - 0.5) * 0.1; mp.setX(i, mp.getX(i) * j); mp.setZ(i, mp.getZ(i) * j); mp.setY(i, mp.getY(i) + (r() - 0.5) * 0.008); } }
  out.push(P(mantle.translate(0, 0.018, 0).toNonIndexed(), 0x3d6a32));
  // The summit terrace.
  const yt = CH;
  out.push(drumC(0.024, 0.025, 0.003, 16, shade(PAVE, 0.95), { y: yt - 0.001 }));
  out.push(disc(0.0245, PAVE, 0, 0, yt + 0.0021, 16));
  // The statue on its pedestal, set on the terrace.
  out.push(statue(CRISTO, 0.08, SOAP, { y: yt + 0.002 }));
  return out;
}

// The Empire State Building's own pieces. A plan is an outline of [x, z]
// corners, counter-clockwise seen with x right and z up (square corners
// only); its faces are gathered by colour and merged.
type XZ = readonly [number, number];
type V3 = readonly [number, number, number];
interface Ribs { readonly step: number; readonly w: number; readonly d: number; readonly c: number }
class EsbFaces {
  private readonly by = new Map<number, number[]>();
  // A quad a b c d (in order round it) facing n.
  quad(col: number, n: V3, a: V3, b: V3, c: V3, d: V3): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
    const [p, q, r, s] = flip ? [a, d, c, b] : [a, b, c, d];
    const arr = this.by.get(col) ?? [];
    arr.push(...p, ...q, ...r, ...p, ...r, ...s);
    this.by.set(col, arr);
  }
  // A flat, upward-facing outline (holes cut) at height y.
  flat(col: number, o: readonly XZ[], y: number, holes: readonly (readonly XZ[])[] = []): void {
    const sh = new THREE.Shape(o.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, y, 0).toNonIndexed(), p = g.getAttribute('position');
    const arr = this.by.get(col) ?? [];
    for (let i = 0; i < p.count; i++) arr.push(p.getX(i), p.getY(i), p.getZ(i));
    this.by.set(col, arr);
  }
  parts(): G[] {
    return [...this.by].map(([k, p]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      return P(g, k);
    });
  }
}
const esbRect = (w: number, d: number): XZ[] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
// A w × d plan with its four corners notched n deep each way (the tower's
// recessed corners).
const esbNotched = (w: number, d: number, n: number): XZ[] => {
  const a = w / 2, b = d / 2;
  return [[-a + n, -b], [a - n, -b], [a - n, -b + n], [a, -b + n], [a, b - n], [a - n, b - n], [a - n, b], [-a + n, b], [-a + n, b - n], [-a, b - n], [-a, -b + n], [-a + n, -b + n]];
};
// Each edge of a plan: its ends, length, along and outward directions, and
// whether each end's corner stands out (convex) or in.
function esbEdges(o: readonly XZ[]) {
  const m = o.length;
  return o.map((p, i) => {
    const q = o[(i + 1) % m]!, r = o[(i + 2) % m]!, z = o[(i + m - 1) % m]!;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), tx = (q[0] - p[0]) / L, tz = (q[1] - p[1]) / L;
    const turn = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx > 0;
    return { p, q, L, tx, tz, nx: tz, nz: -tx, cvP: turn(p[0] - z[0], p[1] - z[1], tx, tz), cvQ: turn(tx, tz, r[0] - q[0], r[1] - q[1]) };
  });
}
// The plan pushed out e all round (its corners mitred).
function esbOffset(o: readonly XZ[], e: number): XZ[] {
  const ed = esbEdges(o), m = o.length;
  return o.map((p, i) => {
    const a = ed[(i + m - 1) % m]!, b = ed[i]!;
    return [p[0] + e * (a.nx + b.nx), p[1] + e * (a.nz + b.nz)] as const;
  });
}
// A block: walls of colour `wall` from y0, h high, its flat roof, and the
// limestone piers standing d proud in a row along every face (each pier
// its face and two sides; the corner piers wrapping round).
function esbBlock(f: EsbFaces, o: readonly XZ[], y0: number, h: number, wall: number, roof: number, rib: Ribs | null): void {
  const y1 = y0 + h;
  for (const e of esbEdges(o)) {
    const at = (s: number, out: number, y: number): V3 => [e.p[0] + e.tx * s + e.nx * out, y, e.p[1] + e.tz * s + e.nz * out];
    f.quad(wall, [e.nx, 0, e.nz], at(0, 0, y0), at(e.L, 0, y0), at(e.L, 0, y1), at(0, 0, y1));
    if (!rib) continue;
    const gap = rib.d + 0.0002, s0 = e.cvP ? 0 : gap, s1 = e.cvQ ? e.L : e.L - gap, use = s1 - s0;
    if (use < rib.w) continue;
    const k = Math.max(1, Math.round(use / rib.step));
    for (let j = 0; j <= k; j++) {
      const a = s0 + (j * (use - rib.w)) / k, b = j === k && e.cvQ ? e.L + rib.d : a + rib.w;
      f.quad(rib.c, [e.nx, 0, e.nz], at(a, rib.d, y0), at(b, rib.d, y0), at(b, rib.d, y1), at(a, rib.d, y1));
      if (!(j === 0 && e.cvP)) f.quad(rib.c, [-e.tx, 0, -e.tz], at(a, 0, y0), at(a, rib.d, y0), at(a, rib.d, y1), at(a, 0, y1));
      f.quad(rib.c, [e.tx, 0, e.tz], at(b, 0, y0), at(b, rib.d, y0), at(b, rib.d, y1), at(b, 0, y1));
    }
  }
  f.flat(roof, o, y1);
}
// A band round a plan, e out from its walls, from yb to yt: its face, and
// (`lip` given) its top back to the walls and, `lip` > 0, its inner face
// down to a roof at yt - lip (a parapet).
function esbBand(f: EsbFaces, o: readonly XZ[], e: number, yb: number, yt: number, c: number, lip?: number): void {
  const oo = esbOffset(o, e), ed = esbEdges(oo);
  for (const g of ed) f.quad(c, [g.nx, 0, g.nz], [g.p[0], yb, g.p[1]], [g.q[0], yb, g.q[1]], [g.q[0], yt, g.q[1]], [g.p[0], yt, g.p[1]]);
  if (lip === undefined) return;
  f.flat(c, oo, yt, [o]);
  if (lip > 0) for (const g of esbEdges(o)) f.quad(c, [-g.nx, 0, -g.nz], [g.p[0], yt - lip, g.p[1]], [g.q[0], yt - lip, g.q[1]], [g.q[0], yt, g.q[1]], [g.p[0], yt, g.p[1]]);
}

// ---------- New York ----------

// The Empire State Building (1931), Art Deco in Indiana limestone: the
// five-storey base filling its block, its great entrance on Fifth Avenue
// (the front) and a lesser one behind; the tower setting back at the 6th,
// 25th, 30th, 72nd and 81st floors, its corners notched, every face ribbed
// with limestone piers between the window columns' aluminium spandrels;
// the stepped crown with its lit bands, the observation deck on the 86th
// floor behind its parapet and railing, and the mooring mast: its four
// winged buttresses, its glazed stages to the 102nd floor's observatory,
// the lantern, and the needle.
function empireState(): G[] {
  const f = new EsbFaces(), out: G[] = [];
  const LIME = 0xd8d0bc, LITE = shade(LIME, 1.06), ROOF = shade(LIME, 0.9), WIN = 0x646e78, SHOP = 0x343a40;
  const LIT = 0xf2e2a4, MAST = 0xc8c4b4, MGLASS = 0x4c5864, ALU = 0xb4bac0;
  const FL = 0.285 / 86; // a storey
  const cornice = (o: readonly XZ[], top: number, rib: Ribs, lit = false) => {
    esbBand(f, o, rib.d + 0.0003, top - 0.0008, top + 0.0002, LITE, 0.0002);
    if (lit) esbBand(f, o, rib.d + 0.00012, top - 0.003, top - 0.0008, LIT);
  };
  // The base, five storeys, its shop fronts, string course and storey bands.
  const base = esbRect(0.128, 0.092), yb = 5 * FL, g1 = 0.0046;
  const rb: Ribs = { step: 0.0042, w: 0.0018, d: 0.0006, c: LIME };
  esbBlock(f, base, 0, yb, WIN, ROOF, rb);
  esbBand(f, base, 0.0002, 0, g1 - 0.0004, SHOP);
  esbBand(f, base, 0.0009, g1 - 0.0004, g1 + 0.0004, LITE, 0);
  for (let s = 1; s < 4; s++) esbBand(f, base, 0.0003, g1 + s * ((yb - g1) / 4) - 0.0005, g1 + s * ((yb - g1) / 4) + 0.0005, shade(LIME, 0.86));
  cornice(base, yb, rb);
  // The entrances: a stepped limestone surround standing out of the wall,
  // its glazed screen (mullions, transom) over the doors, the gilded name.
  const portal = (sgn: 1 | -1, s: number) => {
    const z0 = sgn * 0.046, h = 0.0112 * s, w = 0.016 * s, ry = sgn > 0 ? 0 : Math.PI, fz = (d: number) => z0 + sgn * d;
    for (const x of [-1, 1]) {
      out.push(...box(0.0024, h + 0.0012, 0.0024, LITE, { x: x * (w / 2 + 0.0012), z: fz(0.0012) }));
      out.push(...box(0.0011, h, 0.0018, shade(LIME, 0.94), { x: x * (w / 2 - 0.00065), z: fz(0.0009) }));
    }
    out.push(...box(w + 0.0048, 0.0016, 0.0024, LITE, { y: h, z: fz(0.0012) }));
    out.push(...box(w * 0.66, 0.0012, 0.0021, LITE, { y: h + 0.0016, z: fz(0.00105) }));
    out.push(...box(w * 0.3, 0.001, 0.0018, LITE, { y: h + 0.0028, z: fz(0.0009) }));
    const g = h * 0.55;
    out.push(pane(w - 0.0022, g, 0x2a2622, 0, 0, fz(0.0012), ry));
    out.push(pane(w - 0.0022, h - g, 0x55616c, 0, g, fz(0.0012), ry));
    for (const x of [-w / 4, 0, w / 4]) out.push(pane(0.0004, h, ALU, x, 0, fz(0.00128), ry));
    out.push(pane(w - 0.0022, 0.0005, ALU, 0, g, fz(0.00128), ry));
    out.push(pane(w * 0.62, 0.0008, 0xc0a060, 0, h + 0.0004, fz(0.00245), ry));
  };
  portal(1, 1);
  portal(-1, 0.75);
  // The tower: its setbacks (the 6th to the 25th floor, the 25th to the
  // 30th, the shaft to the 72nd, then the crown's steps to the 81st and the
  // 85th), each ribbed and corniced; lit bands under the crown's.
  const tiers: readonly [readonly XZ[], number, number, Ribs, boolean][] = [
    [esbRect(0.1, 0.07), yb, 25 * FL, { step: 0.0028, w: 0.0012, d: 0.0005, c: LIME }, false],
    [esbNotched(0.084, 0.06, 0.004), 25 * FL, 30 * FL, { step: 0.0028, w: 0.0012, d: 0.0005, c: LIME }, false],
    [esbNotched(0.064, 0.05, 0.007), 30 * FL, 72 * FL, { step: 0.0027, w: 0.0012, d: 0.0005, c: LIME }, true],
    [esbNotched(0.05, 0.04, 0.005), 72 * FL, 81 * FL, { step: 0.0025, w: 0.0011, d: 0.00045, c: LIME }, true],
    [esbNotched(0.04, 0.032, 0.004), 81 * FL, 85 * FL, { step: 0.0025, w: 0.0011, d: 0.00045, c: LIME }, true],
  ];
  for (const [o, y0, y1, rib, lit] of tiers) {
    esbBlock(f, o, y0, y1 - y0, WIN, ROOF, rib);
    cornice(o, y1, rib, lit);
  }
  // The crown's stepped corners: the outer piers rising past each step.
  for (const [o, , y1, rib] of tiers.slice(2)) {
    for (const e of esbEdges(o)) if (e.cvQ) {
      const k = (rib.d - 0.0022) / 2, ox = e.q[0] + (e.nx + e.tx) * k, oz = e.q[1] + (e.nz + e.tz) * k;
      out.push(...box(0.0022 + rib.d, 0.0036, 0.0022 + rib.d, LITE, { x: ox, y: y1 + 0.0002, z: oz }));
      out.push(...box(0.0014, 0.0016, 0.0014, LITE, { x: ox, y: y1 + 0.0038, z: oz }));
    }
  }
  // The 86th floor: the glazed observatory, the open deck round it behind
  // the parapet (risen from the 85th's cornice) and its railing.
  const deckO = tiers[4]![0], y85 = 85 * FL, ym = 86 * FL;
  const obs = esbNotched(0.028, 0.023, 0.003), ro: Ribs = { step: 0.0024, w: 0.001, d: 0.0004, c: LIME };
  esbBlock(f, obs, y85, ym - y85, MGLASS, ROOF, ro);
  cornice(obs, ym, ro);
  esbBand(f, deckO, 0.00075, y85 + 0.0002, y85 + 0.0012, LITE, 0.001);
  const rail = esbOffset(deckO, 0.0006);
  esbBand(f, esbOffset(deckO, 0.0003), 0.00005, y85 + 0.0034, y85 + 0.0037, 0x5c6064);
  for (const e of esbEdges(rail)) {
    const n = Math.max(1, Math.round(e.L / 0.003));
    for (let k = 0; k < n; k++) {
      const s = (k * e.L) / n, x = e.p[0] + e.tx * s, z = e.p[1] + e.tz * s;
      out.push(rod(V(x, y85 + 0.0012, z), V(x - e.nx * 0.0003, y85 + 0.0035, z - e.nz * 0.0003), 0.00013, 0x5c6064, 3));
    }
  }
  // The mooring mast: four winged buttresses stepping in up its first
  // stage; three glazed stages, each on its ledge, the 102nd floor's
  // observatory the third; the 103rd's balcony, the lantern, the cap; the
  // needle and its light.
  const r1 = 0.0076, wing = new THREE.Shape([
    [r1 - 0.0004, 0], [0.0112, 0], [0.0112, 0.0042], [0.0102, 0.0042], [0.0102, 0.0092], [0.0092, 0.0092], [0.0092, 0.014], [r1 - 0.0004, 0.018],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.0018, bevelEnabled: false }).translate(0, 0, -0.0009);
  for (let k = 0; k < 4; k++) out.push(P(wg.clone().rotateY((k * Math.PI) / 2 + Math.PI / 2), MAST, { y: ym - 0.0001 }));
  const stage = (r: number, y: number, h: number, c: number, pw: number, ph: number, py: number, glass: number) => {
    out.push(drumC(r, r, h, 8, c, { y }));
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * (Math.PI / 4), ap = r * Math.cos(Math.PI / 8) + 0.0002;
      out.push(pane(pw, ph, glass, Math.sin(a) * ap, y + py, Math.cos(a) * ap, a));
    }
  };
  const ledge = (r: number, y: number, h: number) => out.push(drumC(r, r * 0.96, h, 8, LITE, { y }));
  stage(r1, ym - 0.0001, 0.0181, MAST, 0.0016, 0.0155, 0.0013, MGLASS);
  ledge(0.0088, ym + 0.01805, 0.0007);
  stage(0.0064, ym + 0.0187, 0.0135, MAST, 0.0013, 0.0115, 0.001, MGLASS);
  ledge(0.0074, ym + 0.03225, 0.0006);
  stage(0.0055, ym + 0.0328, 0.0062, ALU, 0.0031, 0.0046, 0.0008, 0x3c4650);
  ledge(0.0066, ym + 0.03905, 0.0005);
  stage(0.0042, ym + 0.0395, 0.0042, 0xbfc8cc, 0.0004, 0.0042, 0, MAST);
  out.push(drumC(0.0044, 0.0028, 0.0026, 8, MAST, { y: ym + 0.04375 }));
  out.push(drumC(0.0028, 0.0016, 0.0024, 8, ALU, { y: ym + 0.0463 }));
  out.push(drumC(0.0016, 0.0011, 0.004, 6, 0x8c8c88, { y: ym + 0.04865 }));
  out.push(rod(V(0, ym + 0.0527, 0), V(0, ym + 0.069, 0), 0.0009, 0x9a9a9a, 5, 0.0006));
  out.push(rod(V(0, ym + 0.069, 0), V(0, 0.3695, 0), 0.0004, 0x9a9a9a, 4, 0.00022));
  out.push(ball(0.0007, 0xe03020, { y: 0.37 }));
  return [pad(), ...stretch([...f.parts(), ...out], 1.17, 2.01, 1.17)];
}

// ---------- Sydney ----------

// A shell: a curved triangular vault over a w-wide mouth, h high at its
// peak, its ridge running l back; tiles in chevrons of white and cream;
// its mouth glazed. Local mouth at z = 0 facing +z, turned by ry.
function shell(cx: number, cz: number, y: number, w: number, l: number, h: number, ry: number): G[] {
  const W = 0xf2efe6, CREAM = 0xdcd6c4;
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(cx, y, cz);
  const A = V(0, h, l * 0.32), B = V(0, 0, -l);
  const half = (side: number) => surface((u, v) => {
    // u along the ridge (back to peak), v from the ridge down to the base.
    const R = B.clone().lerp(A, u); R.y = h * Math.pow(u, 0.62) + 0.0004;
    const E = V(side * (w / 2) * Math.pow(u, 0.7), 0, -l + l * u);
    const p = R.clone().lerp(E, Math.pow(v, 1.15));
    const bulge = Math.sin(Math.PI * v) * (0.09 * w) * Math.pow(u, 0.6);
    p.x += side * bulge; p.y += bulge * 0.7;
    return p.applyMatrix4(m);
  }, 12, 6, (i) => (i % 2 ? W : CREAM));
  const out = [...half(-1), ...half(1)];
  // The mouth's glass wall: a fan from its foot to the arch's edge, set back.
  const pts: number[] = [];
  const edge = (side: number, v: number) => {
    const R = A.clone(); R.y = h + 0.0004;
    const E = V(side * (w / 2), 0, 0.0);
    const p = R.clone().lerp(E, Math.pow(v, 1.15)), bulge = Math.sin(Math.PI * v) * 0.09 * w;
    return V(p.x + side * bulge * 0.9, p.y + bulge * 0.7 * 0.9, p.z * 0.75 - 0.0008);
  };
  const foot = V(0, 0, -0.0006);
  for (const side of [-1, 1]) for (let k = 0; k < 6; k++) {
    const a = edge(side, k / 6), b = edge(side, (k + 1) / 6);
    pts.push(foot.x, foot.y, foot.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  out.push(P(g.applyMatrix4(m), 0x8a7c6a));
  // Its mullions: bronze ribs fanning from the foot up to the arch.
  for (const side of [-1, 1]) for (let k = 1; k < 4; k++) out.push(rod(foot.clone().applyMatrix4(m), edge(side, k / 4).applyMatrix4(m), w * 0.006, 0x5a4a3a, 3));
  return out;
}
// The Opera House on Bennelong Point: its granite podium, the grand stairs
// up from the forecourt, the two halls' shells side by side opening onto
// the harbour, the restaurant's small pair; the water round the point, a
// ferry; people on the stairs and the forecourt, fig trees.
function sydneyOperaHouse(): G[] {
  const out: G[] = [], GRANITE = 0xc9a98e;
  // The podium, its joints, the concourse's openings.
  const y0 = 0.016, pz = -0.004;
  out.push(...box(0.112, y0, 0.128, GRANITE, { z: pz }, shade(GRANITE, 1.08)));
  for (let k = 1; k < 4; k++) for (const [ry, len, o] of [[Math.PI, 0.112, 0.064], [Math.PI / 2, 0.128, 0.056], [-Math.PI / 2, 0.128, 0.056]] as const) out.push(pane(len, 0.0004, shade(GRANITE, 0.86), Math.sin(ry) * (o + 0.00025), (k * y0) / 4, pz + Math.cos(ry) * (o + 0.00025), ry));
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) out.push(pane(0.012, 0.007, 0x3a3430, s * (0.056 + 0.0003), 0.002, pz + 0.01 + k * 0.016, s * Math.PI / 2));
  // The grand stairs, the full width of the podium's front.
  const n = 10, z0 = 0.07, z1 = pz + 0.064;
  for (let k = 0; k < n; k++) {
    const zf = z0 - (k * (z0 - z1)) / n, zb = z1 - 0.0006;
    out.push(...box(0.086, (y0 * (k + 1)) / n - 0.00015, zf - zb, shade(GRANITE, 1.02), { y: 0, z: (zf + zb) / 2 }, shade(GRANITE, k % 2 ? 1.1 : 1.15)));
  }
  // The halls' shells: three opening onto the harbour, a fourth over the stairs.
  const HS = 1.75, WS = 1.3; // (the shells raised over the town, and widened with it)
  const hall = (x: number, s: number) => {
    out.push(...shell(x, -0.05, y0, WS * 0.036 * s, 1.2 * 0.03 * s, HS * 0.058 * s, Math.PI));
    out.push(...shell(x, -0.05 + 0.027 * s, y0, WS * 0.031 * s, 1.2 * 0.026 * s, HS * 0.046 * s, Math.PI));
    out.push(...shell(x, -0.05 + 0.05 * s, y0, WS * 0.026 * s, 1.2 * 0.022 * s, HS * 0.034 * s, Math.PI));
    out.push(...shell(x, 0.04, y0, WS * 0.024 * s, 1.2 * 0.017 * s, HS * 0.025 * s, 0));
  };
  hall(-0.026, 1);
  hall(0.027, 0.86);
  // The restaurant's pair at the forecourt's corner.
  out.push(...shell(-0.046, 0.05, y0, 0.014, 0.012, HS * 0.015, 0), ...shell(-0.046, 0.038, y0, 0.011, 0.01, HS * 0.011, Math.PI));
  return [pad(), ...stretch(out, 1.1, 1, 1.03)];
}

// ---------- Tokyo ----------

// Tokyo Tower: the four legs of its lattice sweeping in to the main deck,
// banded in international orange and white, X-braced between them; the
// glazed main and top decks, the antenna mast; FootTown under its legs;
// Shiba Park's trees round it, cars, people.
function tokyoTower(): G[] {
  const out: G[] = [], OR = 0xe2522a, WH = 0xf0eee8;
  // The lattice: levels from the ground to the top deck, its half-width
  // curving in.
  const hwAt = (y: number) => (y <= 0.25 ? 0.0085 + 0.05 * Math.exp(-y / 0.045) : 0.0085 - (y - 0.25) * 0.08);
  const levels = [0, 0.011, 0.022, 0.034, 0.047, 0.061, 0.076, 0.092, 0.11, 0.129, 0.148, 0.164, 0.18, 0.196, 0.212, 0.228, 0.244, 0.25, 0.264, 0.278, 0.29];
  const corner = (y: number, k: number) => { const w = hwAt(y); return V((k & 1 ? 1 : -1) * w, y, (k & 2 ? 1 : -1) * w); };
  const order = [0, 1, 3, 2];
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i]!, b = levels[i + 1]!, c = Math.floor(((a + b) / 2) / 0.0415) % 2 ? WH : OR, rr = 0.0013 * (1 - i / 30);
    for (let k = 0; k < 4; k++) out.push(rod(corner(a, k), corner(b, k), rr * 1.3, c, 4));
    for (let k = 0; k < 4; k++) {
      const p = order[k]!, q = order[(k + 1) % 4]!;
      out.push(rod(corner(b, p), corner(b, q), rr * 0.7, c, 3));
      out.push(rod(corner(a, p), corner(b, q), rr * 0.5, c, 3), rod(corner(a, q), corner(b, p), rr * 0.5, c, 3));
    }
  }
  // The great arches between the legs at the foot.
  for (let k = 0; k < 4; k++) {
    // (Each point of the arch on its face's slope: between the legs at its own height.)
    const p = order[k]!, q = order[(k + 1) % 4]!, at = (f: number) => { const y = 0.011 + Math.sin(Math.PI * f) * 0.026; return corner(y, p).lerp(corner(y, q), f); };
    for (let j = 0; j < 10; j++) out.push(rod(at(j / 10), at((j + 1) / 10), 0.001, OR, 4));
  }
  // The main deck (two storeys of glass) and the top deck.
  const deck = (y: number, w: number, h: number) => {
    out.push(...box(w, h, w, 0xd8d8d4, { y }, 0x9aa0a4));
    out.push(...floors(0, 0, w, w, y + h * 0.1, y + h * 0.9, 2, h * 0.32, 0x4a6a80));
  };
  deck(0.15, 0.03, 0.012);
  deck(0.25, 0.017, 0.006);
  // The antenna mast in red and white bands, its lights.
  for (let k = 0; k < 8; k++) out.push(cyl(0.0022 - k * 0.0002, 0.002 - k * 0.0002, 0.009, 6, k % 2 ? WH : OR, { y: 0.29 + k * 0.009 }));
  out.push(rod(V(0, 0.362, 0), V(0, 0.39, 0), 0.0006, OR, 4, 0.0003));
  out.push(ball(0.0008, 0xff3020, { y: 0.39 }));
  return [pad(), ...stretch(out, 1.3, 1.9, 1.3)];
}

// ---------- Rio ----------

// The Maracanã: the great oval, its outer wall on a ring of slanting
// concrete piers with the ramps zigzagging up between them; inside, two
// tiers of stands raked at about a third of a right angle, the upper
// overhanging the lower, in bands of blue, yellow and white seats; the
// white roof ring on its cables overhanging the upper tier; the pitch
// striped by the mower, its lines and goals. (Drawn 1.3 × tall.)
function maracana(): G[] {
  const out: G[] = [], CONC = 0xd2ccbe, DARK = 0x5a5650;
  const A = 0.074, B = 0.062;
  const ell = (s: number, a: number, y: number) => V(Math.cos(a) * A * s, y, Math.sin(a) * B * s);
  const oval = (s0: number, s1: number, h: number, y: number, c: number, open = true) => P(new THREE.CylinderGeometry(s1, s0, h, 64, 1, open).scale(A, 1, B).translate(0, y + h / 2, 0), c);
  const band = (s0: number, y0: number, s1: number, y1: number, c: number) => out.push(...surface((u, v) => ell(s0 + (s1 - s0) * v, u * Math.PI * 2, y0 + (y1 - y0) * v), 64, 1, () => c));
  // The stands: the lower tier from the pitch's edge, its back wall under
  // the overhang, the soffit and fascia, the upper tier up to the rim.
  const seats = [0x2a5aa8, 0xf0d040, 0x2a5aa8, 0xf2f2ee, 0x2a5aa8];
  const tier = (s0: number, y0: number, s1: number, y1: number, rows: number, off: number) =>
    out.push(...surface((u, v) => ell(s0 + (s1 - s0) * v, u * Math.PI * 2, y0 + (y1 - y0) * v), 64, rows, (_i, j) => seats[(j + off) % seats.length]!));
  const si = 0.446;
  out.push(oval(si, si, 0.003, 0, CONC));
  tier(si, 0.003, 0.72, 0.016, 4, 0);
  out.push(oval(0.72, 0.72, 0.01, 0.016, DARK));
  band(0.72, 0.026, 0.66, 0.026, shade(CONC, 0.85));
  out.push(oval(0.66, 0.66, 0.004, 0.026, CONC));
  tier(0.66, 0.03, 0.985, 0.047, 5, 1);
  out.push(oval(0.985, 0.985, 0.006, 0.047, shade(CONC, 0.95))); // (the upper tier's back wall, up under the roof)
  // The outer wall, leaning out: dark behind the piers, a ring beam at its
  // top and halfway, the ramps zigzagging up between the piers.
  const wallH = 0.048, w0 = 0.93, w1 = 0.99;
  const sAt = (y: number) => w0 + ((w1 - w0) * y) / wallH;
  out.push(oval(w0, w1, wallH, 0, 0xc4beb0));
  // (Its storeys' long dark openings between the slabs: the stadium's horizontal lines.)
  for (const [y0, y1] of [[0.005, 0.019], [0.029, 0.043]] as const) out.push(oval(sAt(y0) + 0.004, sAt(y1) + 0.004, y1 - y0, y0, 0x4a4d50));
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    out.push(rod(ell(w0 + 0.03, a, 0), ell(w1 + 0.03, a, wallH), 0.0013, CONC, 4));
  }
  for (const y of [wallH / 2, wallH - 0.002]) out.push(oval(sAt(y) + 0.034, sAt(y + 0.002) + 0.034, 0.002, y, shade(CONC, 1.04)));
  for (let k = 0; k < 16; k++) {
    // (Each flight climbs half the wall over three bays, the next turning back.)
    const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2, up = k % 2 === 0;
    for (const half of [0, 1]) {
      const y0 = half * wallH / 2 + 0.002, y1 = y0 + wallH / 2 - 0.004;
      const [ya, yb] = up ? [y0, y1] : [y1, y0];
      out.push(rod(ell(sAt(ya) + 0.022, a0, ya), ell(sAt(yb) + 0.022, a1, yb), 0.0011, shade(CONC, 0.94), 4));
    }
  }
  // The roof ring: posts on the wall's top, the white membrane from the
  // outer ring in over the upper tier, the inner tension ring, the cables.
  const ro = 1.04, ri = 0.72, yr0 = 0.055, yr1 = 0.053;
  out.push(...surface((u, v) => ell(ro - (ro - ri) * v, u * Math.PI * 2, yr0 - (yr0 - yr1) * v), 64, 3, () => 0xf2f2ee));
  for (let k = 0; k < 64; k++) {
    const a0 = (k / 64) * Math.PI * 2, a1 = ((k + 1) / 64) * Math.PI * 2;
    out.push(rod(ell(ri, a0, yr1 + 0.0008), ell(ro, a0, yr0 + 0.0008), 0.00025, 0x8a8a8a, 3));
    out.push(rod(ell(ri, a0, yr1 - 0.0004), ell(ri, a1, yr1 - 0.0004), 0.0006, 0x6a6a6a, 3));
    out.push(rod(ell(ro, a0, yr0 + 0.0004), ell(ro, a1, yr0 + 0.0004), 0.0008, CONC, 3));
    if (k % 2 === 0) out.push(rod(ell(w1 + 0.02, a0, wallH), ell(ro, a0, yr0), 0.0006, CONC, 4));
  }
  // The pitch, its mown stripes, lines, goals.
  const pw = 0.05, pd = 0.032, py = 0.0012;
  out.push(P(new THREE.CircleGeometry(si * 0.999, 64).rotateX(-Math.PI / 2).scale(A, 1, B), 0x4a7a3a, { y: py - 0.0006 }));
  for (let k = 0; k < 10; k++) out.push(flat(pw / 10, pd, k % 2 ? 0x5a9a44 : 0x4e8c3e, -pw / 2 + (k + 0.5) * (pw / 10), 0, py));
  const L = 0xf4f4f0, lw = 0.0005, ly = py + 0.0003;
  out.push(flat(pw, lw, L, 0, pd / 2, ly), flat(pw, lw, L, 0, -pd / 2, ly), flat(lw, pd, L, pw / 2, 0, ly), flat(lw, pd, L, -pw / 2, 0, ly), flat(lw, pd, L, 0, 0, ly));
  out.push(P(new THREE.RingGeometry(0.0047, 0.0052, 28).rotateX(-Math.PI / 2), L, { y: ly }));
  for (const s of [-1, 1]) {
    out.push(flat(lw, 0.018, L, s * (pw / 2 - 0.0076), 0, ly), flat(0.0076, lw, L, s * (pw / 2 - 0.0038), 0.009, ly), flat(0.0076, lw, L, s * (pw / 2 - 0.0038), -0.009, ly));
    const gx = s * (pw / 2 + 0.0007);
    out.push(rod(V(gx, py, -0.003), V(gx, py + 0.0022, -0.003), 0.00016, L, 3), rod(V(gx, py, 0.003), V(gx, py + 0.0022, 0.003), 0.00016, L, 3), rod(V(gx, py + 0.0022, -0.003), V(gx, py + 0.0022, 0.003), 0.00016, L, 3));
  }
  return [pad(), ...stretch(out, 1, 1.3, 1)];
}

export const MODERN: Models<'cristoRedentor' | 'empireState' | 'sydneyOperaHouse' | 'tokyoTower' | 'maracana'> = {
  cristoRedentor,
  empireState,
  sydneyOperaHouse,
  tokyoTower,
  maracana,
};
