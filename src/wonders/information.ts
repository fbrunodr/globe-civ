// The Information era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z.

import * as THREE from 'three';
import { prism } from '../houseKit.ts';
import {
  CRAG_DEPTH, P, V, box, cone, cyl, drumC, flat, pane, rod, shade, type G, type Models,
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
// A rod from a to b without its end caps (where its ends are buried: ribs
// joined end to end, lattice members meeting at the nodes), n-sided.
function rodO(a: THREE.Vector3, b: THREE.Vector3, r: number, c: number, n = 3): G {
  const l = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, l, n, 1, true).translate(0, l / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())));
  return P(g.translate(a.x, a.y, a.z), c);
}

// ---------- Dubai ----------

// The Burj Khalifa: over everything in town, broad at its foot and
// tapering steadily to the spire. The three wings of its Y-shaped plan
// spread over most of the site and step back one by one in a spiral up the
// tower, each a little narrower at each setback: glass in two tones between
// stainless fins, a steel band round every tier, steel terraces at the
// setbacks. Above the last wings the core rises on alone, ringed, to the
// spire and its needle. Its podium, and a plain pad the size of its site.
function burjKhalifa(): G[] {
  const out: G[] = [flat(0.152, 0.152, PAVING, 0, 0, 0.0003)];
  const GLASS = 0x8ea6ba, STEEL = 0xd2d8de, FIN = 0xe6eaee;
  const cx = 0, cz = 0.009;
  const dirs = [[0, -1], [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)], [-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]] as const;
  // The podium: a low Y a little wider than the tower's foot, its terrace steel-grey.
  const yP = 0.005;
  for (const [dx, dz] of dirs) out.push(...prism(wing(cx, cz, dx, dz, 0.046, 0.051, 6), yP, shade(STEEL, 0.85), {}, shade(PAVING, 0.95)));
  // Its entrances: glazed lobbies in the angles between the wings, under steel canopies.
  for (let j = 0; j < 3; j++) {
    const a = Math.atan2(dirs[j]![0], dirs[j]![1]) + Math.PI / 3, d = 0.03, x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    out.push(...box(0.014, 0.009, 0.008, shade(GLASS, 0.8), { x, y: yP, z, ry: a }, STEEL));
    out.push(...box(0.02, 0.0012, 0.013, STEEL, { x: x + Math.sin(a) * 0.002, y: yP + 0.0095, z: z + Math.cos(a) * 0.002, ry: a }, shade(STEEL, 1.05)));
  }
  // The wings: K tiers, the back, front-right and front-left wing set back in
  // turn at the top of each; a wing's length and width fall at its setbacks.
  const K = 30, top = 0.694, W0 = 0.034, W1 = 0.0145, L0 = 0.052, L1 = 0.0062, band = 0.0013, e = 0.0004;
  const tierH = (k: number) => ((top - yP) * (1 - 0.5 * (k / K))) / (K * (1 - 0.5 * ((K - 1) / 2) / K));
  const steps = K / 3;
  // (A wing's outline without its inner end, buried in the other two; walls along it.)
  const walls = (pts: [number, number][], y: number, h: number, c: number): G => {
    const q: number[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i]!, [x1, z1] = pts[i + 1]!;
      q.push(x0, y, z0, x1, y, z1, x1, y + h, z1, x0, y, z0, x1, y + h, z1, x0, y + h, z0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(q, 3));
    return P(g, c);
  };
  const capOf = (pts: [number, number][], y: number, c: number): G =>
    P(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2), c, { y });
  const stepOf = [0, 0, 0], segStart = [yP, yP, yP];
  const dims = (j: number) => {
    const f = stepOf[j]! / steps;
    return { L: L0 + (L1 - L0) * f, w: W0 + (W1 - W0) * Math.pow(f, 1.3) };
  };
  const fins = (j: number, y0: number, y1: number) => {
    const [dx, dz] = dirs[j]!, { L, w } = dims(j), px = -dz, pz = dx, h = y1 - y0;
    // Pinstripes up the wing's sides, from where it leaves the others to its tip, and round the tip.
    const s0 = w * 0.62, n = Math.max(1, Math.round((L - s0) / 0.0032));
    for (let i = 0; i <= n; i++) {
      const s = s0 + (i * (L - s0)) / n;
      for (const sd of [-1, 1]) out.push(pane(0.0006, h, FIN, cx + dx * s + sd * px * (w / 2 + 0.0002), y0, cz + dz * s + sd * pz * (w / 2 + 0.0002), Math.atan2(sd * px, sd * pz)));
    }
    for (let i = 1; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI, c = Math.cos(a), sn = Math.sin(a), r = w / 2 + 0.0002;
      const nx = dx * c + px * sn, nz = dz * c + pz * sn;
      out.push(pane(0.0007, h, FIN, cx + dx * L + nx * r, y0, cz + dz * L + nz * r, Math.atan2(nx, nz)));
    }
  };
  let y = yP;
  for (let k = 0; k < K; k++) {
    const th = tierH(k), yt = y + th, sb = k % 3;
    for (let j = 0; j < 3; j++) {
      const [dx, dz] = dirs[j]!, { L, w } = dims(j);
      if (stepOf[j]! > steps) continue;
      const open = wing(cx, cz, dx, dz, w, L, 6); // s0 left … s0 right (the closing edge left out)
      out.push(walls(open, y, th - band, k % 2 ? GLASS : shade(GLASS, 1.05)));
      const ob = wing(cx, cz, dx, dz, w + 2 * e, L, 6);
      out.push(walls(ob, yt - band, band, STEEL));
      if (j === sb) {
        // The setback: the wing's terrace, its fins up the segment now ending.
        out.push(capOf(ob, yt + 0.00005, shade(STEEL, 1.04)));
        fins(j, segStart[j]!, yt - band);
        stepOf[j]!++;
        segStart[j] = yt;
      }
    }
    y = yt;
  }
  // The core going on alone, ringed, then the spire and its needle.
  const segs = [[0.0105, 0.0088, 0.04], [0.0084, 0.0066, 0.036], [0.0062, 0.0046, 0.03]] as const;
  for (const [r0, r1, h] of segs) {
    out.push(drumC(r0, r1, h, 12, GLASS, { x: cx, y, z: cz }));
    for (let i = 1; i <= 3; i++) {
      const rr = r0 - ((r0 - r1) * i) / 4 + 0.0004;
      out.push(P(new THREE.CylinderGeometry(rr, rr, 0.0012, 12, 1, true).translate(0, 0.0006, 0), STEEL, { x: cx, y: y + (h * i) / 4 - 0.0006, z: cz }));
    }
    out.push(drumC(r1 * 1.12, r1 * 1.12, 0.0018, 12, STEEL, { x: cx, y: y + h, z: cz }));
    y += h + 0.0018;
  }
  out.push(cyl(0.0044, 0.0014, 0.17, 8, STEEL, { x: cx, y, z: cz }));
  for (let i = 0; i < 9; i++) {
    const rr = 0.0044 - i * 0.00032;
    out.push(P(new THREE.CylinderGeometry(rr, rr, 0.0014, 8, 1, true).translate(0, 0.0007, 0), FIN, { x: cx, y: y + 0.008 + i * 0.017, z: cz }));
  }
  out.push(cone(0.0014, 0.05, 6, FIN, { x: cx, y: y + 0.17, z: cz }));
  return out;
}

// ---------- Guizhou ----------

// FAST, the five-hundred-metre dish, as it stands in its hollow (the hills
// round it are the game's own): its reflector a spherical cap of triangular
// panels, open to the sky, its steel underside showing; the white truss of
// its ring beam round the rim, held up on a ring of tall slender columns
// whose feet run on down into the hill (CRAG_DEPTH), so on a slope none
// stands short of the ground; six white lattice towers round it, their legs
// as deep, their cables holding the receiver cabin over the dish, its tie
// cables down to the panels; two service sheds.
// (Its dish, shared with the clearance below: radius, angle, the sphere's
// radius, the lowest panel's height.)
const FAST_A = 0.056, FAST_THETA = (56 * Math.PI) / 180, FAST_RC = FAST_A / Math.sin(FAST_THETA), FAST_Y0 = 0.012;
// How high the dish's underside is over the point (x, z) of the model, or
// null off it (wonderModels.ts CLEARANCE: the hill must keep under it).
export function fastUnderside(x: number, z: number): number | null {
  const d = Math.hypot(x, z), back = FAST_RC + 0.0016;
  return d > FAST_A ? null : FAST_Y0 + FAST_RC - Math.sqrt(back * back - d * d);
}
function fastTelescope(): G[] {
  const out: G[] = [];
  const PANEL = 0xd3d9de, PANEL2 = 0xcad0d5, PANEL3 = 0xdadfe3, BACK = 0xa2a8ae, WHITE = 0xeceeea, COLUMN = 0xc9cac5, CABLE = 0x3a3c3e;
  const FOOT = -CRAG_DEPTH + 0.004;
  // The reflector: a spherical cap (56° from its axis to the rim), its panels
  // in three near tones; its steel back a little below it.
  const a = FAST_A, theta = FAST_THETA, Rc = FAST_RC, sag = Rc * (1 - Math.cos(theta)), y0 = FAST_Y0, yr = y0 + sag;
  const cap = new THREE.SphereGeometry(Rc, 48, 10, 0, Math.PI * 2, Math.PI - theta, theta).translate(0, Rc + y0, 0);
  const tone = (i: number) => { const h = Math.sin(i * 12.9898) * 43758.5453; return Math.floor((h - Math.floor(h)) * 5); };
  out.push(P(someTris(cap, (i) => tone(i) <= 2), PANEL), P(someTris(cap, (i) => tone(i) === 3), PANEL2), P(someTris(cap, (i) => tone(i) === 4), PANEL3));
  const back = Rc + 0.0016;
  out.push(P(new THREE.SphereGeometry(back, 32, 7, 0, Math.PI * 2, Math.PI - Math.asin(a / back), Math.asin(a / back)).translate(0, Rc + y0, 0), BACK));
  // Its back frame: ribs down the underside from the rim toward the middle.
  const under = (d: number) => y0 + Rc - Math.sqrt(back * back - d * d) - 0.0004;
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    for (let j = 0; j < 3; j++) {
      const d0 = a * (1 - j / 3), d1 = a * (1 - (j + 1) / 3) + 0.004;
      out.push(rodO(V(c * d0, under(d0), s * d0), V(c * d1, under(d1), s * d1), 0.0005, shade(BACK, 0.8), 3));
    }
  }
  // The ring beam: a white truss round the rim, its chords and diagonals.
  const ringR = a + 0.0016, rb = yr - 0.0036;
  const chord = (rr: number, y: number, tr: number) => P(new THREE.TorusGeometry(rr, tr, 3, 60).rotateX(Math.PI / 2), WHITE, { y });
  out.push(chord(a + 0.0002, yr + 0.0003, 0.0006), chord(a + 0.0032, yr + 0.0001, 0.0006), chord(ringR + 0.0008, rb, 0.0006));
  const NZ = 72;
  for (let i = 0; i < NZ; i++) {
    const t0 = (i / NZ) * Math.PI * 2, t1 = ((i + 1) / NZ) * Math.PI * 2, R0 = a + 0.0032, R1 = ringR + 0.0008;
    const [p, q] = i % 2 ? [V(Math.cos(t0) * R0, yr, Math.sin(t0) * R0), V(Math.cos(t1) * R1, rb, Math.sin(t1) * R1)] : [V(Math.cos(t0) * R1, rb, Math.sin(t0) * R1), V(Math.cos(t1) * R0, yr, Math.sin(t1) * R0)];
    out.push(rodO(p, q, 0.0003, WHITE, 3));
  }
  // The columns holding the ring up, their feet run on into the ground.
  const NC = 40;
  for (let i = 0; i < NC; i++) {
    const t = ((i + 0.5) / NC) * Math.PI * 2, x = Math.cos(t) * (ringR + 0.0008), z = Math.sin(t) * (ringR + 0.0008);
    out.push(P(new THREE.CylinderGeometry(0.0009, 0.0012, rb - FOOT, 4, 1, true).translate(0, (rb + FOOT) / 2, 0), COLUMN, { x, z, ry: -t + Math.PI / 4 }));
    out.push(drumC(0.0016, 0.0016, 0.0012, 4, WHITE, { x, y: rb - 0.0012, z, ry: -t + Math.PI / 4 }));
  }
  // The six lattice towers round the dish: four legs tapering to the top
  // (running on down into the ground), a zigzag lattice on each face, a
  // platform at the head; the cables to the cabin.
  const cabin = V(0, yr + 0.009, 0), towerTop = 0.08, R = 0.068;
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(t) * R, z = Math.sin(t) * R;
    const ex = V(Math.cos(t), 0, Math.sin(t)), ez = V(-Math.sin(t), 0, Math.cos(t));
    const half = (y: number) => 0.0012 + (0.0036 - 0.0012) * (1 - y / towerTop);
    const at = (y: number, ux: number, uz: number) => V(x, y, z).addScaledVector(ex, ux * half(y)).addScaledVector(ez, uz * half(y));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    for (const [ux, uz] of corners) out.push(rodO(at(FOOT, ux, uz), at(towerTop, ux, uz), 0.00042, WHITE, 4));
    const L = 9, ys = Array.from({ length: L + 1 }, (_, i) => -0.012 + (i / L) * (towerTop + 0.012));
    for (let lv = 0; lv < L; lv++) {
      const y = ys[lv]!, y2 = ys[lv + 1]!;
      for (let f = 0; f < 4; f++) {
        const [p, q] = [corners[f]!, corners[(f + 1) % 4]!];
        if (lv > 0) out.push(rodO(at(y, p[0], p[1]), at(y, q[0], q[1]), 0.00024, WHITE, 3));
        out.push(lv % 2 ? rodO(at(y, p[0], p[1]), at(y2, q[0], q[1]), 0.0002, WHITE, 3) : rodO(at(y, q[0], q[1]), at(y2, p[0], p[1]), 0.0002, WHITE, 3));
      }
    }
    out.push(...box(0.0034, 0.0016, 0.0034, 0xb8bcc0, { x, y: towerTop, z, ry: -t }, 0xd0d3d6));
    const tp = V(x, towerTop + 0.0012, z);
    out.push(rod(tp, cabin.clone().addScaledVector(ex, 0.003), 0.0003, CABLE, 3));
  }
  // The cabin: a hexagonal drum under its dome, its feed below, the cable
  // net round it; tie cables down to the dish.
  out.push(drumC(0.004, 0.004, 0.0026, 6, 0xe8e8e2, { y: cabin.y - 0.0013 }), P(new THREE.SphereGeometry(0.004, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), 0xc8ccd0, { y: cabin.y + 0.0013 }));
  out.push(P(new THREE.TorusGeometry(0.0046, 0.0004, 3, 12).rotateX(Math.PI / 2), 0x9aa0a6, { y: cabin.y }));
  out.push(P(new THREE.ConeGeometry(0.0024, 0.0034, 6, 1, true).rotateX(Math.PI).translate(0, -0.0017, 0), 0x6a6a6a, { y: cabin.y - 0.0013 }));
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2, d = 0.024, yd = y0 + Rc - Math.sqrt(Rc * Rc - d * d);
    out.push(rod(V(Math.cos(t) * 0.0046, cabin.y - 0.0013, Math.sin(t) * 0.0046), V(Math.cos(t) * d, yd + 0.0004, Math.sin(t) * d), 0.00018, CABLE, 3));
  }
  // Two service sheds by the dish, each on a concrete plinth run on into the
  // ground (a terrace's wall where the hill falls away): the blue-roofed one, a white one.
  for (const [t, w, d, roof] of [[Math.PI / 4 + 0.02, 0.016, 0.0065, 0x4f78b0], [Math.PI * 1.25 + 0.05, 0.011, 0.006, 0xc9ccce]] as const) {
    const rr = 0.07, x = Math.cos(t) * rr, z = Math.sin(t) * rr;
    out.push(...box(w, 0.0055, d, 0xe4e2dc, { x, z, ry: -t + Math.PI / 2 }, roof));
    out.push(P(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w + 0.0012, -FOOT, d + 0.0012), 0x9c9a92, { x, y: FOOT, z, ry: -t + Math.PI / 2 }));
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
      out.push(rodO(onGlobe(l0, lon), onGlobe(l1, lon), 0.0008, WOOD2));
    }
  }
  for (const lat of [-0.4, 0.05, 0.45, 0.85, 1.2]) {
    for (let m = 0; m < 28; m++) out.push(rodO(onGlobe(lat, (m / 28) * Math.PI * 2), onGlobe(lat, ((m + 1) / 28) * Math.PI * 2), 0.0007, WOOD2));
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

// Launch Complex 39 in the days of Apollo, its pad and its launch centre
// drawn together on the one tile (the five kilometres between them taken
// out). The pad: its raised hardstand, the flame trench through it, the
// ramp up from the crawlerway; on it the mobile launcher, its deck over the
// trench, the red umbilical tower behind the rocket with its swing arms
// reaching to it and the hammerhead crane on top; and the Saturn V standing
// ready: its first stage's black roll pattern, fins and engine fairings,
// the second and third stages, the instrument ring, the adapter, the Apollo
// spacecraft and its escape tower. The propellant spheres at the pad's
// corners. The crawlerway's two gravel lanes from the ramp to the Vehicle
// Assembly Building: its high bay, the inverted-T doors facing the pad, the
// space agency's badge on its front, the low bay behind; beside it the Launch
// Control Center, four storeys, the firing rooms' slanted windows looking
// out to the pad, the bridge across to the VAB. (Metres turned to site
// units: 0.12 for the rocket's 110 m; the buildings drawn smaller, to fit.)
function launchComplex39(): G[] {
  const pad: G[] = [], out: G[] = [], u = 0.12 / 110;
  const CONC = 0xc9c5bb, CONC2 = 0xb2ada2, STEEL = 0x8c9196, RED = 0xb8402e, WHITE = 0xeeeeea, BLACK = 0x26262a, SILVER = 0xc4c8cc, SOOT = 0x3a3836;
  // ---- The pad, drawn with the ramp toward +z and the tower toward +x, then turned to its place. ----
  // The hardstand: a low platform, the ramp up to it, the trench's dark mouths at either end.
  const hx0 = -0.036, hx1 = 0.038, hzh = 0.03, hh = 0.007;
  pad.push(...box(hx1 - hx0, hh, 2 * hzh, CONC2, { x: (hx0 + hx1) / 2 }, CONC));
  // (Its upper rim, a darker kerb.)
  pad.push(P(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(hx1 - hx0 + 0.0008, 0.0012, 2 * hzh + 0.0008), shade(CONC2, 0.85), { x: (hx0 + hx1) / 2, y: hh - 0.0012 }));
  const rw = 0.0135, rl = 0.022;
  {
    // (The ramp: a wedge falling from the hardstand's edge to the ground.)
    const z0 = hzh, z1 = z0 + rl, w = rw;
    const g = new THREE.BufferGeometry();
    const p = [-w, hh, z0, w, hh, z0, w, 0, z1, -w, hh, z0, w, 0, z1, -w, 0, z1,
      -w, 0, z0, -w, hh, z0, -w, 0, z1, w, hh, z0, w, 0, z0, w, 0, z1];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    pad.push(P(g, CONC2));
    // Its two gravel lanes, up to the deck.
    const lane = new THREE.BufferGeometry(), sl = Math.atan2(hh, rl);
    void sl;
    for (const s of [-1, 1]) {
      const a = s * 0.0085, hw = 0.0045, e = 0.0003;
      lane.setAttribute('position', new THREE.Float32BufferAttribute([a - hw, hh + e, z0, a - hw, e, z1, a + hw, e, z1, a - hw, hh + e, z0, a + hw, e, z1, a + hw, hh + e, z0], 3));
      pad.push(P(lane.clone(), 0xbdb3a0));
    }
  }
  for (const s of [-1, 1]) pad.push(pane(0.022, hh * 0.8, SOOT, s * (hx1 - hx0) / 2 + (hx0 + hx1) / 2 + s * 0.0002, 0, 0, s * Math.PI / 2));
  pad.push(flat(hx1 - hx0 - 0.016, 0.018, SOOT, (hx0 + hx1) / 2, 0, hh + 0.0002));
  // The mobile launcher: its deck (49 × 41 m, 7.6 m deep) on six steel legs over the trench.
  const mw = 49 * u, md = 41 * u, mh = 7.6 * u, legs = 6 * u, yd = hh + legs;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]] as const) pad.push(...box(0.003, legs, 0.003, STEEL, { x: x * (mw / 2 - 0.003), y: hh, z: z * (md / 2 - 0.003) }));
  pad.push(...box(mw, mh, md, STEEL, { y: yd }, shade(STEEL, 1.08)));
  for (let k = 0; k < 6; k++) for (const [ry, d, w] of [[0, md / 2, mw], [Math.PI, md / 2, mw]] as const) pad.push(pane(w - 0.004, 0.0005, shade(STEEL, 0.8), 0, yd + mh * (0.2 + k * 0.12), ry ? -d - 0.0002 : d + 0.0002, ry));
  // (The deck's exhaust hole, and the tail service masts round the rocket's foot.)
  pad.push(flat(0.0125, 0.0125, SOOT, 0, 0, yd + mh + 0.0002));
  const y0 = yd + mh;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) pad.push(...box(0.0028, 0.006, 0.0028, RED, { x: x * 0.0105, y: y0, z: z * 0.0105 }, shade(RED, 1.1)));
  // The umbilical tower: 18 bays of red lattice to 120 m over the deck, the crane on top.
  const tx = 0.024, tz = 0, tw = 12 * u, th = 120 * u, bays = 18;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) pad.push(...box(0.0011, th, 0.0011, RED, { x: tx + a * tw / 2, y: y0, z: tz + b * tw / 2 }));
  for (let k = 0; k < bays; k++) {
    const ya = y0 + (k * th) / bays, yb = y0 + ((k + 1) * th) / bays;
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
      const A = V(tx + (ax * tw) / 2, ya, tz + (az * tw) / 2), B = V(tx + (bx * tw) / 2, yb, tz + (bz * tw) / 2);
      pad.push(rodO(A, B, 0.00035, RED));
      pad.push(rodO(V(A.x, yb, A.z), V(B.x, yb, B.z), 0.0004, RED));
    }
  }
  pad.push(...box(tw + 0.002, 0.0014, tw + 0.002, RED, { x: tx, y: y0 + th, z: tz }));
  pad.push(...box(0.003, 0.012, 0.003, RED, { x: tx, y: y0 + th + 0.0014, z: tz }));
  pad.push(...box(0.026, 0.0022, 0.0026, RED, { x: tx - 0.005, y: y0 + th + 0.011, z: tz }));
  pad.push(rodO(V(tx - 0.016, y0 + th + 0.011, tz), V(tx - 0.016, y0 + th - 0.004, tz), 0.0002, 0x2a2a2a));
  // The rocket, its stages from the bottom (heights and diameters in metres).
  const R1 = 5 * u, Rt = 3.3 * u;
  let y = y0 + 1.5 * u;
  // (The hold-down posts under the first stage, its engine bells.)
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; pad.push(...box(0.0025, 1.5 * u, 0.0025, STEEL, { x: Math.cos(a) * R1, y: y0, z: Math.sin(a) * R1 })); }
  for (const [x, z] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) pad.push(cyl(1.9 * u, 0.9 * u, 1.5 * u, 8, SOOT, { x: x * 2.6 * u, y: y0, z: z * 2.6 * u }));
  const band = (r: number, h: number, c: number) => { pad.push(cyl(r, r, h, 20, c, { y })); y += h; };
  const s1 = 42 * u;
  const y1 = y;
  band(R1, s1 * 0.16, WHITE); band(R1, s1 * 0.12, BLACK); band(R1, s1 * 0.42, WHITE); band(R1, s1 * 0.1, BLACK); band(R1, s1 * 0.2, WHITE);
  // The roll pattern: black panels round the white bands, in turn.
  for (const [f0, f1] of [[0, 0.16], [0.7, 0.9]] as const) for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    pad.push(P(new THREE.CylinderGeometry(R1 + 0.0001, R1 + 0.0001, s1 * (f1 - f0), 5, 1, true, a, Math.PI / 4).translate(0, (s1 * (f1 - f0)) / 2, 0), BLACK, { y: y1 + s1 * f0 }));
  }
  // The fins and the engine fairings at its foot.
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, cx = Math.cos(a), cz = Math.sin(a);
    pad.push(cone(1.3 * u, 7 * u, 8, WHITE, { x: cx * R1, y: y1 - 1.3 * u, z: cz * R1 }));
    pad.push(...box(0.0005, 4.5 * u, 3.5 * u, WHITE, { x: cx * (R1 + 2.2 * u), y: y1 - 1.3 * u, z: cz * (R1 + 2.2 * u), ry: -a }));
  }
  // The second stage, its interstage black, and the third: white, its upper half's black stripes.
  band(R1, 2.5 * u, BLACK); band(R1, 22 * u, WHITE);
  pad.push(P(new THREE.CylinderGeometry(Rt, R1, 3 * u, 20, 1, true).translate(0, 1.5 * u, 0), WHITE, { y })); y += 3 * u;
  band(Rt, 3 * u, BLACK); band(Rt, 7 * u, WHITE); band(Rt, 2 * u, BLACK); band(Rt, 3 * u, WHITE);
  band(Rt, 1 * u, SILVER);
  // The adapter tapering to the service module; the command module; the escape tower and its rocket.
  pad.push(P(new THREE.CylinderGeometry(2 * u, Rt, 8.5 * u, 20, 1, true).translate(0, 4.25 * u, 0), WHITE, { y })); y += 8.5 * u;
  band(2 * u, 7.5 * u, SILVER);
  pad.push(cone(2 * u, 3.6 * u, 16, WHITE, { y })); y += 3.6 * u;
  pad.push(rod(V(0, y - 0.6 * u, 0), V(0, y + 4 * u, 0), 0.6 * u, RED, 4)); y += 4 * u;
  pad.push(cyl(0.6 * u, 0.6 * u, 4 * u, 8, WHITE, { y }), cone(0.6 * u, 1.5 * u, 8, RED, { y: y + 4 * u }));
  // The swing arms, from the tower to the stages they serve.
  for (const [ya, w] of [[0.06, 1], [0.32, 1], [0.6, 1], [0.66, 0.8], [0.72, 0.8], [0.8, 0.7], [0.86, 0.7], [0.9, 0.6], [0.95, 0.6]] as const) {
    const yy = y0 + 110 * u * ya * (0.95 + 0.05 * w), x0 = tx - tw / 2, x1 = ya < 0.7 ? R1 : Rt;
    pad.push(...box(x0 - x1, 0.0016, 0.0024 * w, RED, { x: (x0 + x1) / 2, y: yy, z: tz }, shade(RED, 1.1)));
  }
  // The pad turned: the tower behind the rocket, the ramp toward +x, toward the VAB.
  const PX = -0.045, PZ = -0.006;
  for (const g of pad) out.push(g.rotateY(Math.PI / 2).translate(PX, 0, PZ));
  // The propellant spheres at the pad's corners: liquid oxygen behind, liquid hydrogen in front.
  for (const [x, z, r] of [[-0.06, -0.064, 0.0085], [-0.058, 0.058, 0.0095]] as const) {
    out.push(P(new THREE.SphereGeometry(r, 14, 8), WHITE, { x, y: r * 1.25, z }));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; out.push(...box(0.0012, r * 1.05, 0.0012, STEEL, { x: x + Math.cos(a) * r * 0.82, z: z + Math.sin(a) * r * 0.82 })); }
    out.push(drumC(r * 0.9, r * 0.95, 0.0012, 12, STEEL, { x, y: r * 0.82, z }));
    out.push(flat(r * 2.6, r * 2.6, CONC, x, z, 0.0004));
  }
  out.push(rodO(V(-0.06, 0.003, -0.056), V(-0.06, 0.003, -0.04), 0.0007, SILVER), rodO(V(-0.058, 0.003, 0.049), V(-0.058, 0.003, 0.04), 0.0007, SILVER));
  // ---- The crawlerway: two gravel lanes and their verge between, ramp foot to the VAB's door. ----
  const GRAVEL = 0xc4b9a4, rampFoot = PX + hzh + rl, vabX = 0.036;
  for (const s of [-1, 1]) {
    const zc = PZ + s * 0.0085;
    out.push(flat(vabX - rampFoot + 0.004, 0.009, GRAVEL, (vabX + rampFoot) / 2, zc, 0.0004));
    out.push(flat(vabX - rampFoot + 0.004, 0.0012, shade(GRAVEL, 0.8), (vabX + rampFoot) / 2, zc + s * 0.0051, 0.00045));
  }
  // ---- The Vehicle Assembly Building: its high bay, the low bay behind. ----
  const VAB = 0xe2e2dc, VAB2 = 0xc9cbc8, PANEL = 0xa8aeb2, DOOR = 0x8a9094;
  const v0 = vabX, v1 = 0.076, vz0 = -0.046, vz1 = 0.026, vh = 0.092, vx = (v0 + v1) / 2, vzc = (vz0 + vz1) / 2;
  out.push(...box(v1 - v0, vh, vz1 - vz0, VAB, { x: vx, z: vzc }, VAB2));
  out.push(...box(v1 - v0 + 0.001, 0.0022, vz1 - vz0 + 0.001, VAB2, { x: vx, y: vh - 0.0018, z: vzc }, shade(VAB2, 0.95)));
  out.push(...box(v1 - v0 - 0.006, 0.0035, 0.008, VAB2, { x: vx + 0.004, y: vh, z: vzc - 0.012 }, shade(VAB2, 1.03)));
  out.push(...box(v1 - v0 - 0.004, 0.034, 0.03, VAB, { x: vx, z: vz0 - 0.015 + 0.0001 }, VAB2));
  // Its walls' vertical bands of louvred panels, a darker band under the roof's edge; the low bay's windows.
  const faces = [
    { n: [-1, 0], c: [v0, vzc], w: vz1 - vz0, k: 7, skip: (t: number) => Math.abs(t - (PZ - vzc)) < 0.0175 },
    { n: [1, 0], c: [v1, vzc], w: vz1 - vz0, k: 7, skip: (t: number) => Math.abs(-t - (PZ - vzc)) < 0.0175 },
    { n: [0, 1], c: [vx, vz1], w: v1 - v0, k: 5, skip: (t: number) => t > -0.019 && t < 0.02 },
    { n: [0, -1], c: [vx, vz0], w: v1 - v0, k: 5, skip: () => false },
  ] as const;
  for (const f of faces) {
    const ry = Math.atan2(f.n[0], f.n[1]), px = f.n[1], pz = -f.n[0], e = 0.0002;
    for (let i = 0; i < f.k; i++) {
      const t = -f.w / 2 + 0.004 + ((i + 0.5) / f.k) * (f.w - 0.008);
      if (f.skip(t)) continue;
      out.push(pane(0.0026, vh - 0.012, PANEL, f.c[0] + px * t + f.n[0] * e, 0.003, f.c[1] + pz * t + f.n[1] * e, ry));
    }
    out.push(pane(f.w, 0.004, PANEL, f.c[0] + f.n[0] * e, vh - 0.0075, f.c[1] + f.n[1] * e, ry));
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = vz0 - 0.026 + i * 0.0075;
    out.push(pane(0.005, 0.02, PANEL, s > 0 ? v1 - 0.002 + 0.0002 : v0 + 0.002 - 0.0002, 0.008, z, (s * Math.PI) / 2));
  }
  out.push(pane(v1 - v0 - 0.008, 0.003, PANEL, vx, 0.026, vz0 - 0.03 - 0.0002 + 0.0001, Math.PI));
  // The high bay doors, toward the pad and beyond: an inverted T, framed, their leaves banded.
  for (const s of [-1, 1]) {
    const x = s < 0 ? v0 : v1, ry = (s * Math.PI) / 2, zc = PZ, wl = 0.028, hl = 0.022, wu = 0.014, hu = 0.082, d = 0.0018;
    out.push(pane(wl, hl, DOOR, x + s * 0.0002, 0, zc, ry), pane(wu, hu - hl, DOOR, x + s * 0.0002, hl, zc, ry));
    for (let k = 1; k < 12; k++) {
      const yy = (k / 12) * hu;
      out.push(pane(yy < hl ? wl : wu, 0.0006, shade(DOOR, 0.82), x + s * 0.0004, yy, zc, ry));
    }
    // (The frame standing proud: jambs of the upper slot and the lower leaves, their heads.)
    for (const t of [-1, 1]) {
      out.push(...box(d, hu - hl, 0.002, VAB2, { x: x + (s * d) / 2, y: hl, z: zc + t * (wu / 2 + 0.001) }));
      out.push(...box(d, hl, 0.002, VAB2, { x: x + (s * d) / 2, z: zc + t * (wl / 2 + 0.001) }));
      out.push(...box(d, 0.002, (wl - wu) / 2, VAB2, { x: x + (s * d) / 2, y: hl, z: zc + t * (wu / 2 + (wl - wu) / 4) }));
    }
    out.push(...box(d, 0.002, wu + 0.004, VAB2, { x: x + (s * d) / 2, y: hu, z: zc }));
  }
  // On the roof: the plant houses, vents.
  for (const [x, z, w, d] of [[vx - 0.008, vzc + 0.016, 0.008, 0.006], [vx + 0.01, vzc + 0.018, 0.005, 0.005], [vx - 0.01, vzc - 0.02, 0.006, 0.01]] as const) out.push(...box(w, 0.0025, d, VAB2, { x, y: vh, z }, shade(VAB2, 0.92)));
  // The agency's badge on its front (an invented one): a dark blue disc in a
  // white ring, an orange orbit swooping round a pale planet, a white rocket
  // climbing across it, a star or two.
  {
    const bx = vx + 0.001, by = 0.068, z = vz1 + 0.0003, R = 0.0125, NAVY = 0x1f2d5c, ORANGE = 0xe0782a, WH = 0xf4f4f0;
    const at = (g: THREE.BufferGeometry, c: number, dz: number, x = bx, y = by) => out.push(P(g, c, { x, y, z: z + dz }));
    at(new THREE.CircleGeometry(R + 0.0014, 24), WH, 0);
    at(new THREE.CircleGeometry(R, 24), NAVY, 0.0002);
    at(new THREE.RingGeometry(R - 0.0016, R - 0.0011, 24), WH, 0.0004);
    at(new THREE.CircleGeometry(0.0042, 14), 0x8fb8d8, 0.0004, bx - 0.0028, by - 0.0026);
    // (The orbit: a tilted ring, its ends tapering off.)
    at(new THREE.RingGeometry(0.0072, 0.0082, 20, 1, 0.3, Math.PI * 1.6).scale(1, 0.42, 1).rotateZ(0.45), ORANGE, 0.0006);
    // (The rocket: its body, nose and fins, climbing to the upper right.)
    const rk = new THREE.Shape([[0, 0.0062], [0.0012, 0.0036], [0.0012, -0.0026], [0.0024, -0.0044], [0.0008, -0.0036], [0, -0.0042], [-0.0008, -0.0036], [-0.0024, -0.0044], [-0.0012, -0.0026], [-0.0012, 0.0036]].map(([x, y]) => new THREE.Vector2(x, y)));
    at(new THREE.ShapeGeometry(rk).rotateZ(-0.6), WH, 0.0012, bx + 0.0022, by + 0.0012);
    at(new THREE.CircleGeometry(0.0011, 6).scale(0.8, 1.6, 1).rotateZ(-0.6), ORANGE, 0.0008, bx - 0.0005, by - 0.0026);
    for (const [x, y] of [[-0.006, 0.0055], [0.0068, -0.004], [-0.0002, 0.0085]] as const) at(new THREE.CircleGeometry(0.0006, 4), WH, 0.001, bx + x, by + y);
  }
  // ---- The Launch Control Center: four storeys, its slanted firing-room windows toward the pad. ----
  {
    const LCC = 0xe6e4dc, LCC2 = 0xcfccc2, GL = 0x34424e;
    const x0 = 0.004, x1 = 0.044, z0 = 0.03, z1 = 0.074, st = 0.0062, ht = 4 * st, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2, L = z1 - z0;
    out.push(...box(x1 - x0, ht, L, LCC, { x: xc, z: zc }, LCC2));
    out.push(...box(x1 - x0 + 0.0008, 0.002, L + 0.0008, LCC2, { x: xc, y: ht - 0.0016, z: zc }, shade(LCC2, 0.95)));
    // Ribbon windows round the lower floors, between white spandrels; mullions.
    for (let f = 0; f < 2; f++) {
      const yy = f * st + st * 0.35, wh = st * 0.4;
      out.push(pane(L - 0.004, wh, GL, x0 - 0.0002, yy, zc, -Math.PI / 2), pane(L - 0.004, wh, GL, x1 + 0.0002, yy, zc, Math.PI / 2));
      out.push(pane(x1 - x0 - 0.004, wh, GL, xc, yy, z1 + 0.0002), pane(x1 - x0 - 0.004, wh, GL, xc, yy, z0 - 0.0002, Math.PI));
    }
    for (let i = 0; i <= 10; i++) {
      const z = z0 + 0.002 + (i * (L - 0.004)) / 10;
      out.push(pane(0.0005, st * 1.4, LCC, x0 - 0.0004, st * 0.3, z, -Math.PI / 2));
    }
    // The firing rooms' window wall on the third floor: leaning out at the top, under a deep head.
    {
      const yb = 2 * st + 0.0004, yt = 3 * st + 0.0012, out_ = 0.005, g = new THREE.BufferGeometry(), a = x0, b = x0 - out_, za = z0 + 0.002, zb = z1 - 0.002;
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        a, yb, zb, a, yb, za, b, yt, za, a, yb, zb, b, yt, za, b, yt, zb,
        a, yb, za, a, yt, za, b, yt, za, a, yb, zb, b, yt, zb, a, yt, zb,
      ], 3));
      out.push(P(g, GL));
      out.push(...box(out_ + 0.0012, 0.0014, zb - za + 0.002, LCC2, { x: x0 - (out_ + 0.0012) / 2 + 0.0002, y: yt, z: (za + zb) / 2 }, LCC));
      for (let i = 1; i < 12; i++) {
        const z = za + (i * (zb - za)) / 12;
        out.push(rodO(V(a - 0.0003, yb, z), V(b - 0.0003, yt, z), 0.00025, LCC2));
      }
    }
    // Its roof: the plant on it.
    out.push(...box(0.012, 0.004, 0.016, LCC2, { x: xc + 0.006, y: ht, z: zc + 0.006 }, shade(LCC2, 0.9)));
    out.push(...box(0.008, 0.003, 0.008, LCC2, { x: xc - 0.008, y: ht, z: zc - 0.01 }, shade(LCC2, 0.9)));
    // The bridge across to the VAB, at the third floor.
    out.push(...box(0.006, 0.005, vz1 - z0 + 0.012, LCC2, { x: 0.04, y: 2 * st, z: (vz1 + z0) / 2 + 0.002 }, LCC));
    out.push(...box(0.0018, 2 * st, 0.0018, LCC2, { x: 0.04, z: (vz1 + z0) / 2 + 0.002 }));
  }
  return out;
}

export const INFORMATION: Models<'burjKhalifa' | 'fastTelescope' | 'cern' | 'launchComplex39'> = { burjKhalifa, fastTelescope, cern, launchComplex39 };
