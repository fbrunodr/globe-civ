// The Information era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z.

import * as THREE from 'three';
import { prism } from '../houseKit.ts';
import {
  P, V, box, cone, cyl, drumC, flat, pane, rnd, rod, shade, type G, type Models,
} from './kit.ts';

const PAVING = 0xd8d2c4;

// The outline of a wing of a tower's plan: from just behind the middle
// (cx, cz) out along (dx, dz) to a round tip, w wide, L long.
function wing(cx: number, cz: number, dx: number, dz: number, w: number, L: number, n = 4): [number, number][] {
  const px = -dz, pz = dx, s0 = -w * 0.35, h = w / 2, pts: [number, number][] = [];
  pts.push([cx + dx * s0 - px * h, cz + dz * s0 - pz * h], [cx + dx * L - px * h, cz + dz * L - pz * h]);
  for (let i = 1; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI, c = Math.cos(a), s = Math.sin(a);
    pts.push([cx + dx * (L + c * h) + px * s * h, cz + dz * (L + c * h) + pz * s * h]);
  }
  pts.push([cx + dx * L + px * h, cz + dz * L + pz * h], [cx + dx * s0 + px * h, cz + dz * s0 + pz * h]);
  return pts;
}
// The triangles of a geometry kept by `keep` (their index): to colour a
// surface's panels in two tones.
function someTris(g: THREE.BufferGeometry, keep: (i: number) => boolean): THREE.BufferGeometry {
  const src = (g.index ? g.toNonIndexed() : g).getAttribute('position'), out: number[] = [];
  for (let i = 0; i < src.count / 3; i++) if (keep(i)) for (let k = 0; k < 3; k++) out.push(src.getX(i * 3 + k), src.getY(i * 3 + k), src.getZ(i * 3 + k));
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return r;
}

// ---------- Dubai ----------

// The Burj Khalifa: a needle over everything in town, the three wings of
// its Y-shaped plan stepping back one by one in a spiral up the tower,
// glass between stainless fins, steel bands at the setbacks; the core
// rising on alone, ringed, to the spire and its needle; its podium. (On a
// plain pad the size of its site: a city fits it by that.)
function burjKhalifa(): G[] {
  const out: G[] = [flat(0.148, 0.148, PAVING, 0, 0, 0.0003)];
  const GLASS = 0x8ea6ba, STEEL = 0xd2d8de, FIN = 0xe6eaee;
  const cx = 0, cz = 0.002;
  out.push(...prism(wing(cx, cz, 0, -1, 0.034, 0.036, 6).map(([x, z]) => [x, z] as [number, number]), 0.004, shade(STEEL, 0.85), {}, shade(PAVING, 0.95)));
  for (const d of [[Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)], [-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]] as const) out.push(...prism(wing(cx, cz, d[0], d[1], 0.034, 0.036, 6), 0.004, shade(STEEL, 0.85), {}, shade(PAVING, 0.95)));
  // The wings: back, front-right, front-left, each shortened in turn.
  const dirs = [[0, -1], [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)], [-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]] as const;
  const K = 30, L0 = 0.03, Lmin = 0.0045, w0 = 0.0155, top = 0.66;
  const len = [L0, L0, L0];
  let y = 0.004;
  for (let k = 0; k < K; k++) {
    const th = ((top - 0.004) * (1 - 0.45 * (k / K))) / (K * (1 - 0.45 * 0.5)), w = w0 * (1 - 0.42 * (k / K));
    const band = Math.min(0.0016, th * 0.08);
    for (let j = 0; j < 3; j++) {
      const [dx, dz] = dirs[j]!, L = len[j]!;
      const outline = wing(cx, cz, dx, dz, w, L);
      out.push(...prism(outline, th - band, k % 2 ? GLASS : shade(GLASS, 1.04), { y }, STEEL));
      out.push(...prism(outline, band, STEEL, { y: y + th - band }, shade(STEEL, 1.05)));
      // Stainless fins up the wing's sides and round its tip: tall pinstripes.
      const px = -dz, pz = dx, n = Math.max(1, Math.floor((L - 0.003) / 0.0045));
      for (let i = 0; i < n; i++) {
        const s = 0.003 + (i + 0.5) * ((L - 0.003) / n);
        for (const sd of [-1, 1]) out.push(pane(0.0006, th - band, FIN, cx + dx * s + sd * px * (w / 2 + 0.0002), y, cz + dz * s + sd * pz * (w / 2 + 0.0002), Math.atan2(sd * px, sd * pz)));
      }
      out.push(pane(0.0008, th - band, FIN, cx + dx * (L + w / 2 + 0.0002), y, cz + dz * (L + w / 2 + 0.0002), Math.atan2(dx, dz)));
    }
    y += th;
    const j = k % 3;
    len[j] = Math.max(Lmin, len[j]! - (L0 - Lmin) / 10);
  }
  // The core going on alone, ringed, then the spire and its needle.
  const segs = [[0.0068, 0.006, 0.04], [0.0058, 0.0048, 0.036], [0.0046, 0.0036, 0.03]] as const;
  for (const [r0, r1, h] of segs) {
    out.push(drumC(r0, r1, h, 12, GLASS, { x: cx, y, z: cz }));
    for (let i = 1; i <= 3; i++) out.push(drumC(r0 - ((r0 - r1) * i) / 4 + 0.0004, r0 - ((r0 - r1) * i) / 4 + 0.0004, 0.0012, 12, STEEL, { x: cx, y: y + (h * i) / 4 - 0.0006, z: cz }));
    out.push(drumC(r1 * 1.1, r1 * 1.1, 0.0016, 12, STEEL, { x: cx, y: y + h, z: cz }));
    y += h + 0.0016;
  }
  out.push(cyl(0.0034, 0.0012, 0.17, 8, STEEL, { x: cx, y, z: cz }));
  for (let i = 0; i < 9; i++) out.push(drumC(0.0034 - i * 0.00024, 0.0034 - i * 0.00024, 0.0014, 8, FIN, { x: cx, y: y + 0.008 + i * 0.017, z: cz }));
  out.push(cone(0.0012, 0.05, 6, FIN, { x: cx, y: y + 0.17, z: cz }));
  return out;
}

// ---------- Guizhou ----------

// FAST, the five-hundred-metre dish: its reflector of triangular panels set
// into a bowl among karst peaks, the ring beam at its rim; six towers on the
// hills round it, their cables holding the receiver cabin over the dish,
// tie cables down to the dish.
function fastTelescope(): G[] {
  const r = rnd(41), out: G[] = [];
  const PANEL = 0xd6dde2, PANEL2 = 0xb9c3ca, BEAM = 0x8a929a, FOREST = 0x4f7a3a, ROCK = 0x9a978e;
  // The reflector: a spherical cap, its panels in two tones.
  const a = 0.054, theta = (56 * Math.PI) / 180, Rc = a / Math.sin(theta), sag = Rc * (1 - Math.cos(theta)), y0 = 0.0012, yr = y0 + sag;
  const cap = new THREE.SphereGeometry(Rc, 44, 11, 0, Math.PI * 2, Math.PI - theta, theta).translate(0, Rc + y0, 0);
  out.push(P(someTris(cap, (i) => (i + Math.floor(i / 88)) % 2 === 0), PANEL), P(someTris(cap, (i) => (i + Math.floor(i / 88)) % 2 === 1), PANEL2));
  // Its ring beam, and the skirt of ground from the rim down to the bowl's floor.
  out.push(P(new THREE.TorusGeometry(a, 0.0011, 4, 48).rotateX(Math.PI / 2), BEAM, { y: yr }));
  out.push(cyl(a + 0.016, a + 0.0008, yr - 0.0003, 36, shade(FOREST, 1.05), {}));
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    out.push(rod(V(Math.cos(t) * a, yr, Math.sin(t) * a), V(Math.cos(t) * (a + 0.006), 0.0006 + yr * 0.55, Math.sin(t) * (a + 0.006)), 0.0004, BEAM, 3));
  }
  // The ring of karst peaks hemming the bowl in, higher than its rim: steep, wooded, rock showing on some.
  const towers = Array.from({ length: 6 }, (_, k) => (k / 6) * Math.PI * 2 + Math.PI / 6);
  const peak = (x: number, z: number, rr: number, hh: number, c: number) =>
    P(new THREE.SphereGeometry(rr, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, hh / rr, 1), c, { x, z, ry: r() * 6 });
  for (let i = 0; i < 26; i++) {
    const t = ((i + r() * 0.5) / 26) * Math.PI * 2;
    const rr = 0.0085 + r() * 0.0035, d = Math.min(a + 0.01 + r() * 0.005, 0.0775 - rr);
    out.push(peak(Math.cos(t) * d, Math.sin(t) * d, rr, yr + 0.004 + r() * 0.014, r() < 0.18 ? shade(ROCK, 0.9 + r() * 0.2) : shade(FOREST, 0.85 + r() * 0.3)));
  }
  // The towers on their peaks, the cables to the cabin, the cabin.
  const cabin = V(0, yr + 0.004, 0), tops: THREE.Vector3[] = [];
  for (let k = 0; k < 6; k++) {
    const t = towers[k]!, R = 0.064, x = Math.cos(t) * R, z = Math.sin(t) * R, base = yr + 0.008, h = 0.036;
    out.push(peak(x, z, 0.0105, base + 0.002, shade(FOREST, 0.95 + r() * 0.1)));
    for (const [ux, uz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.push(rod(V(x + ux * 0.0028, base - 0.002, z + uz * 0.0028), V(x + ux * 0.001, base + h, z + uz * 0.001), 0.00035, 0xe6e6e0, 3));
    for (let lv = 1; lv <= 4; lv++) {
      const f = lv / 5, s = 0.0028 - f * 0.0018, yy = base - 0.002 + f * (h + 0.002);
      for (const [p, q] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) out.push(rod(V(x + p[0] * s, yy, z + p[1] * s), V(x + q[0] * s, yy, z + q[1] * s), 0.00022, 0xe6e6e0, 3));
    }
    out.push(drumC(0.0016, 0.0016, 0.0016, 6, 0xc04a3a, { x, y: base + h, z }));
    const tp = V(x, base + h + 0.0008, z);
    tops.push(tp);
    out.push(rod(tp, cabin, 0.00028, 0x2a2a2a, 3));
  }
  // The cabin: a hexagonal drum under its dome, its feed below; tie cables down to the dish.
  out.push(drumC(0.004, 0.004, 0.0024, 6, 0xe8e8e2, { y: cabin.y - 0.0012 }), P(new THREE.SphereGeometry(0.004, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0xc8ccd0, { y: cabin.y + 0.0012 }));
  out.push(cone(0.0022, 0.003, 6, 0x6a6a6a, { y: cabin.y - 0.0042 }));
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2, d = 0.02, yd = y0 + Rc - Math.sqrt(Rc * Rc - d * d);
    out.push(rod(V(Math.cos(t) * 0.003, cabin.y - 0.0012, Math.sin(t) * 0.003), V(Math.cos(t) * d, yd + 0.0004, Math.sin(t) * d), 0.0002, 0x2a2a2a, 3));
  }
  // Lesser peaks beyond, to the site's edge.
  for (let i = 0; i < 60; i++) {
    const x = (r() - 0.5) * 0.136, z = (r() - 0.5) * 0.136, d = Math.hypot(x, z);
    if (d < a + 0.024) continue;
    if (towers.some((u) => Math.hypot(x - Math.cos(u) * 0.064, z - Math.sin(u) * 0.064) < 0.014)) continue;
    const rr = 0.005 + r() * 0.006;
    if (Math.max(Math.abs(x), Math.abs(z)) > 0.0775 - rr) continue;
    out.push(peak(x, z, rr, rr * (1.4 + r() * 1.4), r() < 0.2 ? shade(ROCK, 0.9 + r() * 0.2) : shade(FOREST, 0.85 + r() * 0.3)));
  }
  return out;
}

// ---------- Geneva ----------

// CERN: the Globe of Science and Innovation, a sphere of wooden arches;
// beside it the hall of a detector, its front and half its roof cut away to
// show it (the eight great toroid coils round its barrel, the muon
// chambers, its end wheels), a crane above; the collider's ring traced
// across the ground behind. (On a plain pad the size of its site.)
function cern(): G[] {
  const out: G[] = [flat(0.148, 0.148, PAVING, 0, 0, 0.0003)];
  const WOOD = 0xa36a3c, WOOD2 = 0x7a4c2a, CONCRETE = 0xd6d2c8, RING = 0x9aa6ae;
  // The collider's ring: an arc of a great circle across the back of the site.
  const C = V(0.0, 0, 0.46), R = 0.528;
  out.push(P(new THREE.RingGeometry(R - 0.0022, R + 0.0022, 24, 1, Math.PI / 2 - 0.142, 0.284).rotateX(-Math.PI / 2), RING, { x: C.x, y: 0.0006, z: C.z }));
  // The Globe: a sphere of wooden arches, the meridian ribs and rings over its shell, its door.
  const gx = -0.034, gz = 0.012, gr = 0.038, gy = gr * 0.82;
  out.push(P(new THREE.SphereGeometry(gr, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.81), WOOD, { x: gx, y: gy, z: gz }));
  const onGlobe = (lat: number, lon: number, k = 1.015) => V(gx + Math.cos(lat) * Math.cos(lon) * gr * k, gy + Math.sin(lat) * gr * k, gz + Math.cos(lat) * Math.sin(lon) * gr * k);
  const latMin = -Math.asin(0.82) + 0.02;
  for (let m = 0; m < 24; m++) {
    const lon = (m / 24) * Math.PI * 2;
    for (let i = 0; i < 10; i++) {
      const l0 = latMin + ((Math.PI / 2 - latMin) * i) / 10, l1 = latMin + ((Math.PI / 2 - latMin) * (i + 1)) / 10;
      out.push(rod(onGlobe(l0, lon), onGlobe(l1, lon), 0.0008, WOOD2, 3));
    }
  }
  for (const lat of [-0.4, 0.05, 0.45, 0.85, 1.2]) {
    for (let m = 0; m < 28; m++) out.push(rod(onGlobe(lat, (m / 28) * Math.PI * 2), onGlobe(lat, ((m + 1) / 28) * Math.PI * 2), 0.0007, WOOD2, 3));
  }
  out.push(...box(0.011, 0.012, 0.01, 0x3a2a20, { x: gx, z: gz + gr * 0.74 }));
  out.push(pane(0.009, 0.0112, 0xb07a4a, gx, 0, gz + gr * 0.74 + 0.0052));
  // The detector hall, its front and half its roof cut away: the detector inside.
  const hx = 0.04, hz = 0.008, hw = 0.064, hd = 0.07, hh = 0.098;
  out.push(flat(hw - 0.003, hd - 0.003, 0x9a9a92, hx, hz, 0.0009));
  out.push(...box(hw - 0.003, hh, 0.0024, CONCRETE, { x: hx, z: hz - hd / 2 }));
  for (const s of [-1, 1]) {
    const side = new THREE.BufferGeometry();
    // (Each end wall cut away on a slant toward the front.)
    side.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -hd / 2, 0, 0, hd / 2, 0, hh * 0.3, hd / 2, 0, 0, -hd / 2, 0, hh * 0.3, hd / 2, 0, hh, -hd / 2], 3));
    out.push(P(side, shade(CONCRETE, 0.95), { x: hx + s * hw / 2, z: hz }));
    for (let i = 1; i < 6; i++) out.push(rod(V(hx + s * (hw / 2 + 0.0006), 0, hz - hd / 2 + (i * hd) / 6), V(hx + s * (hw / 2 + 0.0006), hh * (0.3 + 0.7 * (1 - i / 6)), hz - hd / 2 + (i * hd) / 6), 0.0008, shade(CONCRETE, 0.85), 4));
  }
  out.push(...box(hw - 0.003, 0.002, hd * 0.42, shade(CONCRETE, 0.85), { x: hx, y: hh, z: hz - hd * 0.29 }));
  for (let i = 0; i < 7; i++) {
    const x = hx - hw / 2 + 0.003 + i * ((hw - 0.006) / 6);
    out.push(rod(V(x, hh, hz - hd * 0.08), V(x, hh * 0.3 + 0.002, hz + hd / 2 - 0.001), 0.0007, 0x8a8a84, 4));
  }
  // The overhead crane on its rails.
  for (const s of [-1, 1]) out.push(rod(V(hx + s * (hw / 2 - 0.003), hh - 0.012, hz - hd * 0.45), V(hx + s * (hw / 2 - 0.003), hh - 0.012, hz + hd * 0.2), 0.0009, 0xe0b020, 4));
  out.push(...box(hw - 0.008, 0.003, 0.005, 0xe0b020, { x: hx, y: hh - 0.017, z: hz - 0.01 }));
  out.push(rod(V(hx, hh - 0.017, hz - 0.01), V(hx, hh - 0.03, hz - 0.01), 0.0003, 0x2a2a2a, 3));
  // The detector: its barrel along x, eight toroid coils round it, the muon chambers, the end wheels.
  const ax = V(hx, 0.042, hz), Rt = 0.03, l = 0.022;
  out.push(P(new THREE.CylinderGeometry(0.014, 0.014, 2 * l - 0.002, 20).rotateZ(Math.PI / 2), 0x5a6a7a, { x: ax.x, y: ax.y, z: ax.z }));
  out.push(P(new THREE.CylinderGeometry(0.009, 0.009, 2 * l + 0.0015, 16).rotateZ(Math.PI / 2), 0xc08030, { x: ax.x, y: ax.y, z: ax.z }));
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2 + Math.PI / 8, cy = Math.cos(t), cz2 = Math.sin(t);
    const p = (s: number, rr: number) => V(ax.x + s, ax.y + cy * rr, ax.z + cz2 * rr);
    const r0 = 0.0158, r1 = Rt;
    for (const [a1, b1] of [[p(-l, r0), p(l, r0)], [p(-l, r1), p(l, r1)], [p(-l, r0), p(-l, r1)], [p(l, r0), p(l, r1)]] as const) out.push(rod(a1, b1, 0.0024, 0xb8c0c8, 6));
    out.push(rod(p(-l * 0.4, r1), p(-l * 0.4, Rt + 0.004), 0.001, 0x6a6a6a, 4), rod(p(l * 0.4, r1), p(l * 0.4, Rt + 0.004), 0.001, 0x6a6a6a, 4));
  }
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2;
    out.push(P(new THREE.BoxGeometry(2 * l + 0.004, 0.0024, 0.009), 0x3a6ab0, { x: ax.x, y: ax.y + Math.cos(t) * (Rt + 0.0055), z: ax.z + Math.sin(t) * (Rt + 0.0055), rx: t }));
  }
  for (const s of [-1, 1]) {
    out.push(P(new THREE.CylinderGeometry(0.032, 0.032, 0.0024, 20).rotateZ(Math.PI / 2), 0x9aa8b6, { x: ax.x + s * (l + 0.0045), y: ax.y, z: ax.z }));
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2;
      out.push(rod(V(ax.x + s * (l + 0.006), ax.y, ax.z), V(ax.x + s * (l + 0.006), ax.y + Math.cos(t) * 0.031, ax.z + Math.sin(t) * 0.031), 0.0008, 0x3a6ab0, 3));
    }
  }
  // Its cradle.
  for (const s of [-1, 1]) out.push(...box(0.008, ax.y - 0.0345, 0.05, 0x6a6a64, { x: ax.x + s * 0.016, y: 0.0009, z: ax.z }));
  return out;
}

// ---------- Cape Canaveral ----------

// Launch Complex 39 in the days of Apollo: the pad's raised hardstand, its
// ramp and the flame trench through it; on it the mobile launcher, its deck
// over the trench, the red umbilical tower with its swing arms reaching to
// the rocket and the hammerhead crane on top; and the Saturn V standing
// ready: its first stage's black roll pattern, fins and engine fairings,
// the second and third stages, the instrument ring, the adapter, the
// Apollo spacecraft and its escape tower. (Beside its city, on the bare
// ground: metres turned to site units, 0.12 for the rocket's 110 m.)
function launchComplex39(): G[] {
  const out: G[] = [], u = 0.12 / 110;
  const CONC = 0xc9c5bb, CONC2 = 0xb2ada2, STEEL = 0x8c9196, RED = 0xb8402e, WHITE = 0xeeeeea, BLACK = 0x26262a, SILVER = 0xc4c8cc, SOOT = 0x3a3836;
  // The hardstand: a low platform, a ramp up to it from the crawlerway, the trench's dark mouths.
  const hs = 0.1, hh = 0.007;
  out.push(...box(hs, hh, hs, CONC2, {}, CONC));
  {
    // (The ramp: a wedge falling from the hardstand's edge to the ground.)
    const z0 = hs / 2, z1 = z0 + 0.024, w = 0.015;
    const g = new THREE.BufferGeometry();
    const p = [-w, hh, z0, w, hh, z0, w, 0, z1, -w, hh, z0, w, 0, z1, -w, 0, z1,
      -w, 0, z0, -w, hh, z0, -w, 0, z1, w, hh, z0, w, 0, z0, w, 0, z1];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    out.push(P(g, CONC2));
  }
  for (const s of [-1, 1]) out.push(pane(0.024, hh * 0.8, SOOT, 0, 0, s * (hs / 2 + 0.0002), s > 0 ? 0 : Math.PI));
  out.push(flat(0.02, hs - 0.02, SOOT, 0, 0, hh + 0.0002));
  // The mobile launcher: its deck (49 × 41 m, 7.6 m deep) on six steel legs over the trench.
  const mw = 49 * u, md = 41 * u, mh = 7.6 * u, legs = 6 * u, yd = hh + legs;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0]] as const) out.push(...box(0.003, legs, 0.003, STEEL, { x: x * (mw / 2 - 0.003), y: hh, z: z * (md / 2 - 0.003) }));
  out.push(...box(mw, mh, md, STEEL, { y: yd }, shade(STEEL, 1.08)));
  for (let k = 0; k < 6; k++) out.push(pane(mw - 0.004, 0.0005, shade(STEEL, 0.8), 0, yd + mh * (0.2 + k * 0.12), md / 2 + 0.0002));
  const y0 = yd + mh;
  // The umbilical tower: 18 bays of red lattice to 120 m over the deck, the crane on top.
  const tx = 0.024, tz = 0, tw = 12 * u, th = 120 * u, bays = 18;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push(...box(0.0011, th, 0.0011, RED, { x: tx + a * tw / 2, y: y0, z: tz + b * tw / 2 }));
  for (let k = 0; k < bays; k++) {
    const ya = y0 + (k * th) / bays, yb = y0 + ((k + 1) * th) / bays;
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
      const A = V(tx + (ax * tw) / 2, ya, tz + (az * tw) / 2), B = V(tx + (bx * tw) / 2, yb, tz + (bz * tw) / 2);
      out.push(rod(A, B, 0.00035, RED, 3));
      out.push(rod(V(A.x, yb, A.z), V(B.x, yb, B.z), 0.0004, RED, 3));
    }
  }
  out.push(...box(tw + 0.002, 0.0014, tw + 0.002, RED, { x: tx, y: y0 + th, z: tz }));
  out.push(...box(0.003, 0.012, 0.003, RED, { x: tx, y: y0 + th + 0.0014, z: tz }));
  out.push(...box(0.026, 0.0022, 0.0026, RED, { x: tx - 0.005, y: y0 + th + 0.011, z: tz }));
  // The rocket, its stages from the bottom (heights and diameters in metres).
  const R1 = 5 * u, Rt = 3.3 * u;
  let y = y0 + 1.5 * u;
  // (The hold-down posts and the engine bells' skirt under the first stage.)
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; out.push(...box(0.0025, 1.5 * u, 0.0025, STEEL, { x: Math.cos(a) * R1, y: y0, z: Math.sin(a) * R1 })); }
  const band = (r: number, h: number, c: number) => { out.push(cyl(r, r, h, 20, c, { y })); y += h; };
  const s1 = 42 * u;
  const y1 = y;
  band(R1, s1 * 0.16, WHITE); band(R1, s1 * 0.12, BLACK); band(R1, s1 * 0.42, WHITE); band(R1, s1 * 0.1, BLACK); band(R1, s1 * 0.2, WHITE);
  // The roll pattern: black panels round the white bands, in turn.
  for (const [f0, f1] of [[0, 0.16], [0.7, 0.9]] as const) for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    out.push(P(new THREE.CylinderGeometry(R1 + 0.0001, R1 + 0.0001, s1 * (f1 - f0), 10, 1, true, a, Math.PI / 4).translate(0, (s1 * (f1 - f0)) / 2, 0), BLACK, { y: y1 + s1 * f0 }));
  }
  // The fins and the engine fairings at its foot.
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, cx = Math.cos(a), cz = Math.sin(a);
    out.push(cone(1.3 * u, 7 * u, 8, WHITE, { x: cx * R1, y: y1 - 1.3 * u, z: cz * R1 }));
    out.push(...box(0.0005, 4.5 * u, 3.5 * u, WHITE, { x: cx * (R1 + 2.2 * u), y: y1 - 1.3 * u, z: cz * (R1 + 2.2 * u), ry: -a }));
  }
  // The second stage, its interstage black, and the third: white, its upper half's black stripes.
  band(R1, 2.5 * u, BLACK); band(R1, 22 * u, WHITE);
  out.push(P(new THREE.CylinderGeometry(Rt, R1, 3 * u, 20, 1, true).translate(0, 1.5 * u, 0), WHITE, { y })); y += 3 * u;
  band(Rt, 3 * u, BLACK); band(Rt, 7 * u, WHITE); band(Rt, 2 * u, BLACK); band(Rt, 3 * u, WHITE);
  band(Rt, 1 * u, SILVER);
  // The adapter tapering to the service module; the command module; the escape tower and its rocket.
  out.push(P(new THREE.CylinderGeometry(2 * u, Rt, 8.5 * u, 20, 1, true).translate(0, 4.25 * u, 0), WHITE, { y })); y += 8.5 * u;
  band(2 * u, 7.5 * u, SILVER);
  out.push(cone(2 * u, 3.6 * u, 16, WHITE, { y })); y += 3.6 * u;
  out.push(rod(V(0, y - 0.6 * u, 0), V(0, y + 4 * u, 0), 0.6 * u, RED, 4)); y += 4 * u;
  out.push(cyl(0.6 * u, 0.6 * u, 4 * u, 8, WHITE, { y }), cone(0.6 * u, 1.5 * u, 8, RED, { y: y + 4 * u }));
  // The swing arms, from the tower to the stages they serve.
  for (const [ya, w] of [[0.06, 1], [0.32, 1], [0.6, 1], [0.66, 0.8], [0.72, 0.8], [0.8, 0.7], [0.86, 0.7], [0.9, 0.6], [0.95, 0.6]] as const) {
    const yy = y0 + 110 * u * ya * (0.95 + 0.05 * w), x0 = tx - tw / 2, x1 = ya < 0.7 ? R1 : Rt;
    out.push(...box(x0 - x1, 0.0016, 0.0024 * w, RED, { x: (x0 + x1) / 2, y: yy, z: tz }, shade(RED, 1.1)));
  }
  // (The whole moved a little toward the tower's side, to sit in the middle.)
  return out.map((g) => g.translate(-0.006, 0, 0));
}

export const INFORMATION: Models<'burjKhalifa' | 'fastTelescope' | 'cern' | 'launchComplex39'> = { burjKhalifa, fastTelescope, cern, launchComplex39 };
