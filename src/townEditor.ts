// Town editor (dev tool, /town_editor.html): draw the town drawings by
// hand, SimCity style: roads first (from the red stubs on the rim, where
// the neighbors' roads come in), then buildings that front onto them
// (footprints of 2×2 to 4×4 terrain cells, single to skyscraper), props,
// squares, and the building spots, hall or wonder.
//
// Drawings are files: per role and density, each of the 13 edge classes
// (town/edges.ts) has its generated draft and any number of variants by
// hand (the game picks among a class's variants tile by tile). Editing the
// draft makes a new variant. What is drawn is shown as the game would stamp
// it, with the problems the tests would find. Saving writes
// src/town/drawings.json through the dev server.

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CELL, LOT_SIZE, FLOOR_HEIGHT, FOOTPRINT_CELLS, HALF_WIDTH, corner, distToLine, nearestOn, len, sub, lotsOverlap, lotSamples, pointInPoly, rhoOf, isBuilding,
  type Density, type Floors, type Footprint, type Lot, type LotKind, type Pt, type Spot,
} from './town/geometry.ts';
import { CLASSES, STUB_U, parseKey, stubsOf, type Stub } from './town/edges.ts';
import { edgeClass, RANK_CLASS, HALL_RADIUS, type Rank, type Role, type Skeleton } from './town/skeleton.ts';
import { assemble, skeletonFor, recordKey, setRecord, storedRecord, allRecords, streetPath, variantsOf, fromRecord, clearance, LOT_INNER, type DrawingRecord, type Drawing } from './town/index.ts';
import { drawingProblems } from './town/checks.ts';
import { stamp } from './cityStamp.ts';
import { FlatPainter, disposeGroup, OUTSIDE, RIM } from './flatTown.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const DEG = Math.PI / 180;

// ---------- the scene ----------

const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
const camera = new THREE.PerspectiveCamera(30, 1, 0.005, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minPolarAngle = 0;
controls.maxPolarAngle = 1.35;
// Left button draws; right turns and tilts (with shift: pans); the wheel zooms.
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.target.set(0, 0, 0);
camera.position.set(0, 2.7, 0.001);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.4));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.position.set(-30, 60, 20);
scene.add(sun);
let world = new THREE.Group();
scene.add(world);
const overlay = new THREE.Group();
scene.add(overlay);
const ghost = new THREE.Group();
scene.add(ghost);
const paint = new FlatPainter();

// The drawing frame (canonical, y up the page) and the plane (y to -z).
const toPlane = (p: Pt, y = 0) => new THREE.Vector3(p.x, y, -p.y);
const fromPlane = (v: THREE.Vector3): Pt => ({ x: v.x, y: -v.z });

// ---------- the drawing being edited ----------

interface Doc {
  streets: { ctrl: Pt[]; rank: Rank }[];
  squares: { pts: Pt[]; paved: boolean }[];
  spots: Spot[];
  hall: Spot | null;
  wonder: Spot | null;
  lots: Lot[];
}

let key = CLASSES[CLASSES.length - 1]!;
let role: Role = 'block';
let density: Density = 'medium';
let variant = 0; // 0: the generated draft
let doc: Doc = { streets: [], squares: [], spots: [], hall: null, wonder: null, lots: [] };
let stubs: Stub[] = [];
let drawn: Drawing | null = null; // the doc as the game reads it
const dirty = new Set<string>();
let undo: string[] = [], redo: string[] = [];

const rk = (v = variant) => recordKey(key, role, density, v);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const spotRec = (s: Spot | null): [number, number, number, number] | null => (s ? [r4(s.x), r4(s.y), r4(s.r), Math.round(s.yaw / DEG)] : null);
const spotOf = (a: [number, number, number, number] | null): Spot | null => (a ? { x: a[0], y: a[1], r: a[2], yaw: a[3] * DEG } : null);

function recordOf(d: Doc): DrawingRecord {
  return {
    streets: d.streets.map((s) => ({ ctrl: s.ctrl.map((p) => [r4(p.x), r4(p.y)] as [number, number]), rank: s.rank })),
    squares: d.squares.map((q) => ({ pts: q.pts.map((p) => [r4(p.x), r4(p.y)] as [number, number]), paved: q.paved })),
    spots: d.spots.map((s) => spotRec(s)!), hall: spotRec(d.hall), wonder: spotRec(d.wonder),
    lots: d.lots.map((l) => {
      const row: (string | number)[] = [l.kind, r4(l.x), r4(l.y), Math.round(l.yaw / DEG)];
      if (isBuilding(l.kind) || l.spot !== undefined) row.push(l.floors ?? 1);
      if (l.spot !== undefined) row.push(l.spot);
      return row;
    }),
  };
}
function docOf(r: DrawingRecord): Doc {
  return {
    streets: r.streets.map((s) => ({ ctrl: s.ctrl.map(([x, y]) => ({ x, y })), rank: s.rank })),
    squares: r.squares.map((q) => ({ pts: q.pts.map(([x, y]) => ({ x, y })), paved: q.paved })),
    spots: r.spots.map((a) => spotOf(a)!), hall: spotOf(r.hall), wonder: spotOf(r.wonder),
    lots: r.lots.map((row) => {
      const [kind, x, y, yaw, floors, sp] = row as [LotKind, number, number, number, number?, number?];
      return { kind, x, y, yaw: yaw * DEG, ...(isBuilding(kind) ? { floors: (floors ?? 1) as Floors } : {}), ...(sp !== undefined ? { spot: sp } : {}) };
    }),
  };
}
// The generated draft, as something to edit: its roads through every third
// point, and lots drafted along those.
function draftDoc(k: string, r: Role, d: Density): Doc {
  const sk = skeletonFor(k, r);
  const out: Doc = {
    streets: sk.streets.map((s) => {
      const p = s.pts, n = p.length;
      return { ctrl: n <= 4 ? [...p] : [p[0]!, ...p.slice(1, -1).filter((_, i) => i % 3 === 2), p[n - 1]!], rank: s.rank };
    }),
    squares: sk.squares.map((q) => ({ pts: [...q.pts], paved: q.paved })),
    spots: [...sk.spots], hall: sk.hall && { ...sk.hall, r: HALL_RADIUS[d] }, wonder: sk.wonder, lots: [],
  };
  // A road that ended on another ends on that road's new curve (a curve
  // through fewer points runs a little differently).
  const st = stubsOf(parseKey(k));
  for (let pass = 0; pass < 4; pass++) {
    const paths = out.streets.map((x) => streetPath(x.ctrl, st).pts);
    out.streets.forEach((x, i) => {
      for (const e of [0, x.ctrl.length - 1]) {
        const p = x.ctrl[e]!;
        if (st.some((u) => len(sub(u.p, p)) < 1e-4)) continue;
        let best: Pt | null = null, bd = 0.015;
        paths.forEach((path, j) => { if (j === i) return; const q = nearestOn(path, p), dd = len(sub(q, p)); if (dd < bd) { bd = dd; best = q; } });
        if (best) x.ctrl[e] = best;
      }
    });
  }
  out.lots = lotsAlong(out, k, r, d);
  return out;
}
function lotsAlong(dc: Doc, k: string, r: Role, d: Density): Lot[] {
  const st = stubsOf(parseKey(k));
  const sk: Skeleton = {
    key: k, role: r, stubs: st,
    streets: dc.streets.filter((s) => s.ctrl.length >= 2).map((s) => { const { pts, ends } = streetPath(s.ctrl, st); return { pts, rank: s.rank, ends }; }),
    squares: dc.squares, spots: dc.spots, hall: dc.hall, wonder: dc.wonder,
  };
  return [...assemble(sk, d).lots];
}

// Opens a file: a variant by hand, or the draft (variant 0).
function open(k: string, v: number): void {
  key = k; variant = v;
  stubs = stubsOf(parseKey(key));
  const rec = v > 0 ? storedRecord(rk()) : null;
  doc = rec ? docOf(rec) : draftDoc(key, role, density);
  if (!rec) variant = 0;
  undo = []; redo = [];
  drawing = null;
  selected = null;
  reveal = true;
  rebuild();
  renderTree();
}
const nextVariant = () => Math.max(0, ...variantsOf(key, role, density)) + 1;

// Every change goes through here (the draft, once changed, becomes a new variant).
function commit(before: string): void {
  if (variant === 0) variant = nextVariant();
  undo.push(before);
  if (undo.length > 200) undo.shift();
  redo = [];
  setRecord(rk(), recordOf(doc));
  dirty.add(rk());
  rebuild();
  renderTree();
}
const snapshot = () => JSON.stringify(doc);
function restore(s: string): void {
  doc = JSON.parse(s) as Doc;
  if (variant > 0) { setRecord(rk(), recordOf(doc)); dirty.add(rk()); }
  selected = null;
  rebuild();
  renderTree();
}

// ---------- drawing it ----------

const SEL = new THREE.Color(0xffd23f), BAD = new THREE.Color(0xff4a3d);
let problems: { text: string; at?: Pt }[] = [];

function rebuild(): void {
  scene.remove(world);
  disposeGroup(world);
  world = new THREE.Group();
  scene.add(world);
  paint.tiles.clear();
  const f = { id: 0, cx: 0, cz: 0 };
  paint.tiles.set(0, f);
  // The six neighbors, open land, so the rim shows.
  for (let j = 0; j < 6; j++) {
    const n = { id: 1 + j, cx: Math.cos(j * 60 * DEG), cz: -Math.sin(j * 60 * DEG) };
    paint.tiles.set(n.id, n);
    paint.ground(n, OUTSIDE, RIM);
  }
  paint.ground(f);
  const c = parseKey(key);
  drawn = fromRecord(key, role, density, recordOf(doc));
  paint.stamp(stamp([{ tile: 0, colouring: c, edgeCls: c.map((v) => (v ? edgeClass(v, density, density) : null)), role, density, walled: false, drawing: drawn }]), { spots: true });
  paint.marks(f, c);
  paint.floor(-2.5, -2.5, 2.5, 2.5);
  paint.flush(world);
  problems = drawingProblems(drawn);
  drawOverlay();
  refreshPanel();
}

function line(pts: readonly Pt[], color: THREE.Color, closed = true, y = 0.004, opacity = 0.95): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints([...pts, ...(closed && pts.length ? [pts[0]!] : [])].map((p) => toPlane(p, y)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity }));
}
const circle = (c: Pt, r: number, n = 32): Pt[] => Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((i / n) * 6.283), y: c.y + r * Math.sin((i / n) * 6.283) }));
function lotOutline(l: Pick<Lot, 'kind' | 'x' | 'y' | 'yaw'>): Pt[] {
  const [hw, hd] = LOT_SIZE[l.kind];
  const fv = { x: Math.cos(l.yaw), y: Math.sin(l.yaw) }, s = { x: -fv.y, y: fv.x };
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => ({ x: l.x + s.x * a! * hw + fv.x * b! * hd, y: l.y + s.y * a! * hw + fv.y * b! * hd }));
}
// A flat band along points (previews).
function band(pts: readonly Pt[], hw: number, color: number, opacity: number): THREE.Mesh {
  const pos: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, d = sub(b, a), l = len(d);
    if (l < 1e-9) continue;
    const n = { x: (-d.y / l) * hw, y: (d.x / l) * hw };
    const q = [{ x: a.x + n.x, y: a.y + n.y }, { x: a.x - n.x, y: a.y - n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: b.x + n.x, y: b.y + n.y }].map((p) => toPlane(p, 0.005));
    for (const v of [q[0]!, q[1]!, q[2]!, q[0]!, q[2]!, q[3]!]) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, side: THREE.DoubleSide }));
}

function drawOverlay(): void {
  overlay.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) o.geometry.dispose(); });
  overlay.clear();
  // The terrain grid, inside the tile.
  if (snap) {
    const seg: THREE.Vector3[] = [];
    for (let i = -24; i <= 24; i++) {
      for (const horiz of [false, true]) {
        let start: Pt | null = null, prev: Pt | null = null;
        for (let t = 0; t <= 96; t++) {
          const u = -0.6 + 1.2 * (t / 96), p = horiz ? { x: u, y: i * CELL } : { x: i * CELL, y: u };
          const inside = rhoOf(6, p) <= 0.995;
          if (inside && !start) start = p;
          if (!inside && start) { seg.push(toPlane(start, 0.0025), toPlane(prev!, 0.0025)); start = null; }
          prev = p;
        }
        if (start) seg.push(toPlane(start, 0.0025), toPlane(prev!, 0.0025));
      }
    }
    overlay.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 })));
  }
  // Road points (for dragging), spots, squares.
  const pts: THREE.Vector3[] = [];
  if (tool === 'select' || tool === 'street') doc.streets.forEach((s) => s.ctrl.forEach((p) => pts.push(toPlane(p, 0.006))));
  overlay.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xffffff, size: 6, sizeAttenuation: false, depthTest: false })));
  doc.spots.forEach((s) => overlay.add(line(circle(s, s.r), new THREE.Color(0x7fd3ff))));
  if (doc.hall) overlay.add(line(circle(doc.hall, doc.hall.r), new THREE.Color(0xffb36b)));
  if (doc.wonder) overlay.add(line(circle(doc.wonder, doc.wonder.r), new THREE.Color(0xe58cff)));
  for (const q of doc.squares) overlay.add(line(q.pts, new THREE.Color(q.paved ? 0xd8d0c0 : 0x9fd06a)));
  // Every building's front, as a short mark in front of it.
  for (const l of doc.lots) {
    if (!isBuilding(l.kind)) continue;
    const hd = LOT_SIZE[l.kind][1], f = { x: Math.cos(l.yaw), y: Math.sin(l.yaw) };
    overlay.add(line([{ x: l.x + f.x * hd, y: l.y + f.y * hd }, { x: l.x + f.x * (hd + 0.008), y: l.y + f.y * (hd + 0.008) }], new THREE.Color(0xffffff), false, 0.006, 0.6));
  }
  // The selection.
  if (selected) {
    if (selected.t === 'lot') { const l = doc.lots[selected.i]; if (l) overlay.add(line(lotOutline(l), SEL)); }
    if (selected.t === 'street') { const s = doc.streets[selected.i]; if (s) overlay.add(line(streetPath(s.ctrl, stubs).pts, SEL, false, 0.007)); }
    if (selected.t === 'ctrl') { const p = doc.streets[selected.s]?.ctrl[selected.i]; if (p) overlay.add(line(circle(p, 0.01, 12), SEL)); }
    if (selected.t === 'spot') { const s = spotRef(selected.which); if (s) overlay.add(line(circle(s, s.r + 0.005), SEL)); }
    if (selected.t === 'square' || selected.t === 'vertex') { const q = doc.squares[selected.t === 'square' ? selected.i : selected.s]; if (q) overlay.add(line(q.pts, SEL)); }
  }
  // Problems, where they are.
  for (const p of problems) if (p.at) overlay.add(line(circle(p.at, 0.018, 12), BAD));
  // A road being drawn: as wide as it will be.
  if (tool === 'street' && drawing && drawing.length) {
    const ctrl = [...drawing, ...(hover ? [snapStreet(hover).p] : [])];
    const path = ctrl.length >= 2 ? streetPath(ctrl, stubs).pts : ctrl;
    overlay.add(band(path, HALF_WIDTH[RANK_CLASS[density][rank]], 0xffd23f, 0.55));
  }
  if (tool === 'square' && drawing && drawing.length) overlay.add(line([...drawing, ...(hover ? [grid(hover)] : [])], SEL, false));
  // Where the next road point would land.
  if (tool === 'street' && hover) {
    const s = snapStreet(hover);
    overlay.add(line(circle(s.p, s.on ? 0.014 : 0.008, 16), s.on === 'stub' ? new THREE.Color(0xff6b5f) : s.on === 'street' ? SEL : new THREE.Color(0xffffff)));
  }
}

// ---------- picking ----------

type Sel = { t: 'lot'; i: number } | { t: 'street'; i: number } | { t: 'ctrl'; s: number; i: number }
  | { t: 'spot'; which: number | 'hall' | 'wonder' } | { t: 'square'; i: number } | { t: 'vertex'; s: number; i: number };
let selected: Sel | null = null;

const spotRef = (w: number | 'hall' | 'wonder'): Spot | null => (w === 'hall' ? doc.hall : w === 'wonder' ? doc.wonder : doc.spots[w] ?? null);
function setSpot(w: number | 'hall' | 'wonder', s: Spot | null): void {
  if (w === 'hall') doc.hall = s;
  else if (w === 'wonder') doc.wonder = s;
  else if (s) { while (doc.spots.length < w) doc.spots.push({ ...s }); doc.spots[w] = s; } else doc.spots.splice(w, 1);
}
function inLot(l: Lot, p: Pt): boolean {
  const [hw, hd] = LOT_SIZE[l.kind];
  const fv = { x: Math.cos(l.yaw), y: Math.sin(l.yaw) }, d = sub(p, l);
  return Math.abs(d.x * -fv.y + d.y * fv.x) <= hw && Math.abs(d.x * fv.x + d.y * fv.y) <= hd;
}
function pick(p: Pt): Sel | null {
  for (let si = 0; si < doc.streets.length; si++) {
    const c = doc.streets[si]!.ctrl;
    for (let i = 0; i < c.length; i++) if (len(sub(c[i]!, p)) < 0.012) return { t: 'ctrl', s: si, i };
  }
  for (let si = 0; si < doc.squares.length; si++) {
    const q = doc.squares[si]!.pts;
    for (let i = 0; i < q.length; i++) if (len(sub(q[i]!, p)) < 0.012) return { t: 'vertex', s: si, i };
  }
  for (let i = doc.lots.length - 1; i >= 0; i--) if (inLot(doc.lots[i]!, p)) return { t: 'lot', i };
  for (const w of [...doc.spots.map((_, i) => i), 'hall', 'wonder'] as (number | 'hall' | 'wonder')[]) {
    const s = spotRef(w);
    if (s && len(sub(s, p)) < s.r) return { t: 'spot', which: w };
  }
  for (let i = doc.streets.length - 1; i >= 0; i--) {
    const s = doc.streets[i]!;
    if (distToLine(p, streetPath(s.ctrl, stubs).pts) < HALF_WIDTH[RANK_CLASS[density][s.rank]] + 0.006) return { t: 'street', i };
  }
  for (let i = doc.squares.length - 1; i >= 0; i--) if (pointInPoly(p, doc.squares[i]!.pts)) return { t: 'square', i };
  return null;
}

// ---------- snapping ----------

let snap = true;
const grid = (p: Pt, step = CELL / 2): Pt => (snap ? { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step } : p);
// A road point: a stub, else a point on a road, else the grid.
function snapStreet(p: Pt, skip = -1): { p: Pt; on: 'stub' | 'street' | null } {
  let best: Stub | null = null, bd = 0.035;
  for (const s of stubs) { const d = len(sub(s.p, p)); if (d < bd) { bd = d; best = s; } }
  if (best) return { p: best.p, on: 'stub' };
  let q: Pt | null = null, qd = 0.022;
  doc.streets.forEach((s, i) => {
    if (i === skip) return;
    const n = nearestOn(streetPath(s.ctrl, stubs).pts, p), d = len(sub(n, p));
    if (d < qd) { qd = d; q = n; }
  });
  return q ? { p: q, on: 'street' } : { p: grid(p), on: null };
}
// The nearest road to p: the point, the way along it, its half width there.
function nearestRoad(p: Pt): { q: Pt; along: Pt; hw: number; d: number } | null {
  if (!drawn) return null;
  let best: { q: Pt; along: Pt; hw: number; d: number } | null = null;
  for (const s of clearance(drawn.streets, drawn.stubs)) {
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const a = s.pts[i]!, b = s.pts[i + 1]!, ab = sub(b, a), l2 = ab.x * ab.x + ab.y * ab.y;
      if (l2 < 1e-12) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
      const q = { x: a.x + ab.x * t, y: a.y + ab.y * t }, d = len(sub(p, q)), hw = HALF_WIDTH[s.cls];
      // (Where two overlap, the wider one counts.)
      if (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) < 0.002 && hw > best.hw)) best = { q, along: { x: ab.x / Math.sqrt(l2), y: ab.y / Math.sqrt(l2) }, hw, d };
    }
  }
  return best;
}
// The yaw that turns a lot's front toward its nearest road.
function faceRoad(p: Pt): number | null { const r = nearestRoad(p); return r ? Math.atan2(r.q.y - p.y, r.q.x - p.x) : null; }

// ---------- tools ----------

type Tool = 'select' | 'street' | 'building' | 'prop' | 'square' | 'spot' | 'erase';
let tool: Tool = 'select';
let rank: Rank = 'side';
let footprint: Footprint = 'b22';
let floors: Floors = 1;
let propKind: LotKind = 'tree';
let paved = true;
let spotWhich: number | 'hall' | 'wonder' = 0;
let ghostYaw = Math.PI / 2;
let drawing: Pt[] | null = null;
let hover: Pt | null = null;

function setTool(t: Tool): void {
  tool = t;
  document.body.dataset['tool'] = t;
  document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((b) => b.classList.toggle('on', b.dataset['tool'] === t));
  drawing = null;
  updateGhost();
  drawOverlay();
}

// Where a new lot would go, and whether it may: inside the lot area, off
// the roads, squares, hall and wonder (it replaces the lots it lands on).
// A building near a road fronts onto it, set just back from its edge.
function ghostLot(p: Pt): Lot {
  const kind: LotKind = tool === 'building' ? footprint : propKind;
  const [, hd] = LOT_SIZE[kind];
  if (tool === 'building' && $<HTMLInputElement>('toRoad').checked) {
    const r = nearestRoad(p);
    if (r && r.d < r.hw + 2 * hd + 0.03) {
      let n = { x: -r.along.y, y: r.along.x };
      if ((p.x - r.q.x) * n.x + (p.y - r.q.y) * n.y < 0) n = { x: -n.x, y: -n.y };
      const off = r.hw + 0.004 + hd;
      return { kind, x: r.q.x + n.x * off, y: r.q.y + n.y * off, yaw: Math.atan2(-n.y, -n.x), floors };
    }
  }
  const at = grid(p);
  return { kind, x: at.x, y: at.y, yaw: ghostYaw, ...(tool === 'building' ? { floors } : {}) };
}
function lotOk(l: Lot): boolean {
  if (!drawn) return false;
  const pts = lotSamples(l);
  if (!pts.every((q) => rhoOf(6, q) <= LOT_INNER + 1e-9)) return false;
  for (const s of clearance(drawn.streets, drawn.stubs)) if (pts.some((q) => distToLine(q, s.pts) < HALF_WIDTH[s.cls])) return false;
  const furniture = l.kind === 'fountain' || l.kind === 'stall' || l.kind === 'tree' || l.kind === 'well';
  if (!furniture && doc.squares.some((q) => q.paved && pts.some((v) => pointInPoly(v, q.pts)))) return false;
  for (const s of [doc.hall, doc.wonder]) if (s && pts.some((v) => len(sub(v, s)) < s.r)) return false;
  return true;
}
// A new lot replaces whatever it lands on; inside a building spot it is
// one of the spot's own lots (gone once a building stands there).
function placeLot(l: Lot, skip = -1): void {
  const spot = doc.spots.findIndex((s) => len(sub(l, s)) < s.r);
  const { spot: _old, ...rest } = l;
  const lot: Lot = spot >= 0 ? { ...rest, spot } : rest;
  const keep = doc.lots.filter((o, i) => i !== skip && !lotsOverlap(o, lot, 0.001));
  doc.lots = [...keep, lot];
}
// Where a spot (building spot, hall, wonder) would go: like a building,
// fronting the nearest road (kept clear of it at its widest), or free and
// turned by hand.
const spotRadius = (w: number | 'hall' | 'wonder') => (w === 'hall' ? HALL_RADIUS[density] : spotRef(w)?.r ?? (w === 'wonder' ? 0.16 : 0.062));
function ghostSpot(p: Pt): Spot {
  const r = spotRadius(spotWhich);
  if ($<HTMLInputElement>('spotToRoad').checked) {
    const road = nearestRoad(p);
    if (road && road.d < road.hw + 2 * r + 0.03) {
      let n = { x: -road.along.y, y: road.along.x };
      if ((p.x - road.q.x) * n.x + (p.y - road.q.y) * n.y < 0) n = { x: -n.x, y: -n.y };
      const off = HALF_WIDTH.avenue + 0.006 + r;
      return { x: road.q.x + n.x * off, y: road.q.y + n.y * off, r, yaw: Math.atan2(-n.y, -n.x) };
    }
  }
  const at = grid(p);
  return { x: at.x, y: at.y, r, yaw: ghostYaw };
}
function spotOk(s: Spot): boolean {
  if (!drawn) return false;
  if (rhoOf(6, s) + s.r / 0.5 > LOT_INNER + 1e-9) return false;
  if (drawn.streets.some((st) => distToLine(s, st.pts) < s.r + HALF_WIDTH[RANK_CLASS.high[st.rank]])) return false;
  if (spotWhich !== 'hall' && spotWhich !== 'wonder' && doc.squares.some((q) => q.paved && pointInPoly(s, q.pts))) return false;
  return true;
}

function updateGhost(): void {
  ghost.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose(); });
  ghost.clear();
  if (hover && tool === 'spot') {
    const s = ghostSpot(hover), ok = spotOk(s);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 0.02, 40), new THREE.MeshBasicMaterial({ color: ok ? 0x4cc27a : 0xef5b4f, transparent: true, opacity: 0.45, depthWrite: false }));
    disc.position.copy(toPlane(s, 0.01));
    ghost.add(disc);
    const f = { x: Math.cos(s.yaw), y: Math.sin(s.yaw) };
    ghost.add(line([s, { x: s.x + f.x * (s.r + 0.012), y: s.y + f.y * (s.r + 0.012) }], new THREE.Color(0xffffff), false, 0.03));
    // What it would push aside: the lots inside it become its own (they give way to its building).
    return;
  }
  if (!hover || (tool !== 'building' && tool !== 'prop')) return;
  const l = ghostLot(hover), ok = lotOk(l);
  const [hw, hd] = LOT_SIZE[l.kind];
  const h = isBuilding(l.kind) ? (l.floors ?? 1) * FLOOR_HEIGHT + 0.012 : 0.02;
  const m = new THREE.Mesh(new THREE.BoxGeometry(2 * hw, h, 2 * hd), new THREE.MeshBasicMaterial({ color: ok ? 0x4cc27a : 0xef5b4f, transparent: true, opacity: 0.5, depthWrite: false }));
  m.position.copy(toPlane(l, h / 2));
  // (Its width runs across the way its front faces.)
  m.rotation.y = l.yaw - Math.PI / 2;
  ghost.add(m);
  // The front: a door-sized mark.
  if (isBuilding(l.kind)) {
    const f = { x: Math.cos(l.yaw), y: Math.sin(l.yaw) };
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.004), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }));
    door.position.copy(toPlane({ x: l.x + f.x * hd, y: l.y + f.y * hd }, 0.004));
    door.rotation.y = l.yaw - Math.PI / 2;
    ghost.add(door);
  }
  // What it would replace.
  for (const o of doc.lots) if (lotsOverlap(o, l, 0.001)) ghost.add(line(lotOutline(o), new THREE.Color(0xe6a23c)));
}

// Roads bulldoze the lots they run over (as in SimCity).
function clearRoads(): void {
  const d = fromRecord(key, role, density, recordOf(doc));
  const cl = clearance(d.streets, d.stubs);
  doc.lots = doc.lots.filter((l) => !lotSamples(l).some((q) => cl.some((s) => distToLine(q, s.pts) < HALF_WIDTH[s.cls])));
}
function finishStreet(): void {
  if (drawing && drawing.length >= 2) {
    const before = snapshot();
    doc.streets.push({ ctrl: drawing, rank });
    drawing = null;
    clearRoads();
    commit(before);
  } else { drawing = null; drawOverlay(); }
}
function finishSquare(): void {
  if (drawing && drawing.length >= 3) {
    const before = snapshot();
    doc.squares.push({ pts: drawing, paved });
    drawing = null;
    commit(before);
  } else { drawing = null; drawOverlay(); }
}
function remove(s: Sel): void {
  if (s.t === 'lot') doc.lots.splice(s.i, 1);
  else if (s.t === 'street') doc.streets.splice(s.i, 1);
  else if (s.t === 'ctrl') { const c = doc.streets[s.s]!.ctrl; if (c.length > 2) c.splice(s.i, 1); else doc.streets.splice(s.s, 1); }
  else if (s.t === 'square' || s.t === 'vertex') { const i = s.t === 'square' ? s.i : s.s; const q = doc.squares[i]!; if (s.t === 'vertex' && q.pts.length > 3) q.pts.splice(s.i, 1); else doc.squares.splice(i, 1); }
  else if (s.t === 'spot') setSpot(s.which, null);
}

// ---------- the mouse ----------

const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function at(e: Pick<MouseEvent, 'clientX' | 'clientY'>): Pt | null {
  // (The camera's matrices only follow the controls when a frame is drawn.)
  controls.update();
  camera.updateMatrixWorld();
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const v = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, v) ? fromPlane(v) : null;
}

let drag: { sel: Sel; before: string; from: Pt; moved: boolean } | null = null;

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const p = at(e);
  if (!p) return;
  switch (tool) {
    case 'select': {
      selected = pick(p);
      if (selected) drag = { sel: selected, before: snapshot(), from: p, moved: false };
      syncBuildingButtons();
      drawOverlay();
      break;
    }
    case 'street': {
      const s = snapStreet(p);
      if (!drawing) { drawing = [s.p]; drawOverlay(); break; }
      if (len(sub(s.p, drawing[drawing.length - 1]!)) < 0.004) break; // (the second click of a double-click)
      drawing.push(s.p);
      if (s.on) finishStreet(); else drawOverlay();
      break;
    }
    case 'square': {
      const q = grid(p);
      if (drawing && drawing.length >= 3 && len(sub(q, drawing[0]!)) < 0.015) { finishSquare(); break; }
      (drawing ??= []).push(q);
      drawOverlay();
      break;
    }
    case 'building': case 'prop': {
      const l = ghostLot(p);
      if (!lotOk(l)) break;
      const before = snapshot();
      placeLot(l);
      commit(before);
      updateGhost();
      break;
    }
    case 'spot': {
      const s = ghostSpot(p);
      if (!spotOk(s)) break;
      const before = snapshot();
      setSpot(spotWhich, s);
      // The lots it covers become its own (gone once its building stands).
      if (typeof spotWhich === 'number') {
        const k = spotWhich;
        doc.lots = doc.lots.map((l) => (len(sub(l, s)) < s.r ? { ...l, spot: k } : l.spot === k && len(sub(l, s)) >= s.r ? (({ spot: _s, ...rest }) => rest)(l) : l));
      } else doc.lots = doc.lots.filter((l) => !lotSamples(l).some((v) => len(sub(v, s)) < s.r));
      commit(before);
      updateGhost();
      break;
    }
    case 'erase': {
      const s = pick(p);
      if (!s) break;
      const before = snapshot();
      remove(s);
      commit(before);
      break;
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  const p = at(e);
  hover = p;
  if (drag && p) {
    const d = sub(p, drag.from);
    if (!drag.moved && len(d) < 0.003) return;
    drag.moved = true;
    const s = drag.sel;
    if (s.t === 'lot') { const l = doc.lots[s.i]!, q = grid(p); doc.lots[s.i] = { ...l, x: q.x, y: q.y }; }
    else if (s.t === 'ctrl') doc.streets[s.s]!.ctrl[s.i] = snapStreet(p, s.s).p;
    else if (s.t === 'vertex') doc.squares[s.s]!.pts[s.i] = grid(p);
    else if (s.t === 'spot') { const sp = spotRef(s.which)!, q = grid(p); setSpot(s.which, { ...sp, x: q.x, y: q.y }); }
    else if (s.t === 'square') { doc.squares[s.i]!.pts = doc.squares[s.i]!.pts.map((v) => ({ x: v.x + d.x, y: v.y + d.y })); drag.from = p; }
    else return;
    rebuild();
    return;
  }
  if (tool === 'street' || tool === 'square') drawOverlay();
  updateGhost();
});

addEventListener('mouseup', () => {
  if (!drag) return;
  const { sel, before, moved } = drag;
  drag = null;
  if (!moved) return;
  // A building dropped on others replaces them; a road moved over lots clears them.
  if (sel.t === 'lot') placeLot(doc.lots[sel.i]!, sel.i);
  if (sel.t === 'ctrl') clearRoads();
  if (sel.t === 'spot') { const sp = spotRef(sel.which)!; setSpot(sel.which, { ...sp, yaw: faceRoad(sp) ?? sp.yaw }); }
  selected = null;
  commit(before);
});

canvas.addEventListener('dblclick', (e) => {
  if (tool === 'street') { finishStreet(); return; }
  if (tool === 'square') { finishSquare(); return; }
  if (tool !== 'select') return;
  // A new point on a road, where it was double-clicked.
  const p = at(e);
  const s = p ? pick(p) : null;
  if (!p || s?.t !== 'street') return;
  const st = doc.streets[s.i]!, before = snapshot();
  let bi = 1, bd = Infinity;
  for (let i = 0; i + 1 < st.ctrl.length; i++) { const d = distToLine(p, [st.ctrl[i]!, st.ctrl[i + 1]!]); if (d < bd) { bd = d; bi = i + 1; } }
  st.ctrl.splice(bi, 0, p);
  commit(before);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- the camera ----------

let tilted = false;
function setTilt(t: boolean): void {
  tilted = t;
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  s.phi = t ? 0.95 : 0.001;
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
  $('top').classList.toggle('on', !t);
  $('tilt').classList.toggle('on', t);
}
function turn(by: number): void {
  const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), by);
  camera.position.copy(controls.target).add(off);
}

// ---------- keys ----------

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); void save(); return; }
  if (e.ctrlKey || e.metaKey) return;
  const tools: Record<string, Tool> = { 1: 'select', 2: 'street', 3: 'building', 4: 'prop', 5: 'square', 6: 'spot', 7: 'erase' };
  if (tools[k]) { setTool(tools[k]!); return; }
  if (k === 't') { setTilt(!tilted); return; }
  if (k === 'g') { setSnap(!snap); return; }
  if (k === 'enter') { if (tool === 'street') finishStreet(); else if (tool === 'square') finishSquare(); return; }
  if (k === 'escape') { drawing = null; selected = null; drawOverlay(); return; }
  if (k === 'delete' || k === 'backspace') { if (selected) { const before = snapshot(); remove(selected); selected = null; commit(before); } return; }
  if (k === 'r') {
    const by = (e.shiftKey ? -15 : 15) * DEG;
    if (selected?.t === 'lot') { const before = snapshot(); const l = doc.lots[selected.i]!; placeLot({ ...l, yaw: l.yaw + by }, selected.i); selected = { t: 'lot', i: doc.lots.length - 1 }; commit(before); }
    else if (selected?.t === 'spot') { const before = snapshot(); const s = spotRef(selected.which)!; setSpot(selected.which, { ...s, yaw: s.yaw + by }); commit(before); }
    else { ghostYaw += by; updateGhost(); }
    return;
  }
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function doUndo(): void { const s = undo.pop(); if (s) { redo.push(snapshot()); restore(s); } }
function doRedo(): void { const s = redo.pop(); if (s) { undo.push(snapshot()); restore(s); } }

let lastT = performance.now();
function keyboard(): void {
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  // Forward on the ground: where the camera looks (straight down: its up).
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0);
  fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const move = new THREE.Vector3();
  if (keys.has('w')) move.add(fwd);
  if (keys.has('s')) move.sub(fwd);
  if (keys.has('d')) move.add(right);
  if (keys.has('a')) move.sub(right);
  if (move.lengthSq()) {
    move.normalize().multiplyScalar(camera.position.distanceTo(controls.target) * 0.6 * dt);
    camera.position.add(move);
    controls.target.add(move);
  }
  if (keys.has('q')) turn(1.2 * dt);
  if (keys.has('e')) turn(-1.2 * dt);
}

// ---------- the files ----------

const openClasses = new Set<string>();
let reveal = true; // scroll the open file into view on the next render
// A class's hex with its stubs: its icon.
function glyph(k: string): string {
  const c = parseKey(k), R = 18, cx = 11, cy = 11;
  const X = (p: Pt) => (cx + p.x * R).toFixed(1), Y = (p: Pt) => (cy - p.y * R).toFixed(1);
  const hex = Array.from({ length: 6 }, (_, j) => { const p = corner(6, j); return `${X(p)},${Y(p)}`; }).join(' ');
  const ticks = c.flatMap((v, j) => STUB_U[v].map((u) => {
    const a = corner(6, j), b = corner(6, j + 1), p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, q = { x: p.x * 0.5, y: p.y * 0.5 };
    return `<line x1="${X(q)}" y1="${Y(q)}" x2="${X(p)}" y2="${Y(p)}" stroke="#e2d2ae" stroke-width="1.7"/>`;
  }));
  return `<svg width="22" height="22" viewBox="0 0 22 22"><polygon points="${hex}" fill="#5f7d45" stroke="#88a868" stroke-width="0.8"/>${ticks.join('')}</svg>`;
}
function renderTree(): void {
  const only = $<HTMLInputElement>('onlyDrawn').checked;
  let drawnCount = 0;
  const rows: string[] = [];
  for (const k of CLASSES) {
    const vs = variantsOf(k, role, density);
    drawnCount += vs.length;
    if (only && !vs.length) continue;
    const isOpen = openClasses.has(k) || k === key;
    rows.push(`<div class="cls${isOpen ? ' open' : ''}" data-cls="${k}">${glyph(k)}<span class="name">${k}</span><span class="badge${vs.length ? ' drawn' : ''}">${vs.length ? `${vs.length} drawn` : 'draft'}</span></div>`);
    if (!isOpen) continue;
    const cur = (v: number) => (k === key && variant === v ? ' cur' : '');
    rows.push(`<div class="file${cur(0)}" data-cls="${k}" data-v="0">⚙️ draft (generated)</div>`);
    for (const v of vs) rows.push(`<div class="file${cur(v)}" data-cls="${k}" data-v="${v}">📄 variant ${v}${dirty.has(recordKey(k, role, density, v)) ? ' <span class="dot">●</span>' : ''}</div>`);
    if (k === key) {
      rows.push(`<div class="fileActions"><button data-act="new">+ New from draft</button>${variant > 0 ? '<button data-act="dup">Duplicate</button><button data-act="del">Delete</button>' : ''}<button data-act="copy">Copy from ${density === 'medium' ? 'low' : 'medium'}</button></div>`);
    }
  }
  $('tree').innerHTML = rows.join('');
  if (reveal) { reveal = false; $('tree').querySelector('.file.cur')?.scrollIntoView({ block: 'nearest' }); }
  $('counts').textContent = `${drawnCount} drawn · ${CLASSES.length} classes`;
}
$('tree').addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-cls]');
  if (!el) return;
  const act = el.dataset['act'];
  if (act) { fileAction(act); return; }
  const k = el.dataset['cls']!;
  if (el.classList.contains('file')) { open(k, Number(el.dataset['v'])); return; }
  // A class: open it (its first variant, or the draft); click it again to fold it.
  if (k === key && openClasses.has(k)) { openClasses.delete(k); renderTree(); return; }
  openClasses.add(k);
  open(k, variantsOf(k, role, density)[0] ?? 0);
});
function fileAction(act: string): void {
  if (act === 'new') {
    const v = nextVariant();
    setRecord(recordKey(key, role, density, v), recordOf(draftDoc(key, role, density))); dirty.add(recordKey(key, role, density, v));
    open(key, v);
  } else if (act === 'dup' && variant > 0) {
    const v = nextVariant();
    setRecord(recordKey(key, role, density, v), recordOf(doc)); dirty.add(recordKey(key, role, density, v));
    open(key, v);
  } else if (act === 'del' && variant > 0) {
    if (!confirm(`Delete ${key} ${role} ${density} variant ${variant}?`)) return;
    setRecord(rk(), null); dirty.add(rk());
    open(key, variantsOf(key, role, density)[0] ?? 0);
  } else if (act === 'copy') {
    // The same class drawn at another density (its first variant, or its draft), as a new variant here.
    const from: Density = density === 'medium' ? 'low' : 'medium';
    const vs = variantsOf(key, role, from), rec = vs.length ? storedRecord(recordKey(key, role, from, vs[0]!)) : null;
    const v = nextVariant();
    setRecord(recordKey(key, role, density, v), rec ?? recordOf(draftDoc(key, role, from))); dirty.add(recordKey(key, role, density, v));
    open(key, v);
  }
}

function refreshPanel(): void {
  $('title').innerHTML = `${key} · ${role} · ${density}<small>${variant ? `variant ${variant}${dirty.has(rk()) ? ' (unsaved)' : ''}` : 'generated draft: editing makes a variant'} · ${doc.lots.length} lots</small>`;
  $('save').classList.toggle('dirty', dirty.size > 0);
  $('saveInfo').textContent = dirty.size ? `${dirty.size} unsaved` : '';
  $('problems').innerHTML = problems.length
    ? problems.slice(0, 30).map((p) => `<li>${p.text}</li>`).join('') + (problems.length > 30 ? `<li>… ${problems.length - 30} more</li>` : '')
    : '<li class="ok">none: the game can use it</li>';
}
function syncBuildingButtons(): void {
  if (selected?.t !== 'lot') return;
  const l = doc.lots[selected.i];
  if (!l || !isBuilding(l.kind)) return;
  document.querySelectorAll<HTMLButtonElement>('[data-fp]').forEach((b) => b.classList.toggle('on', b.dataset['fp'] === l.kind));
  document.querySelectorAll<HTMLButtonElement>('[data-floors]').forEach((b) => b.classList.toggle('on', Number(b.dataset['floors']) === (l.floors ?? 1)));
}

// Footprint buttons: their cells, the front (toward the road) at the bottom.
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-fp]')) {
  const [w, d] = FOOTPRINT_CELLS[b.dataset['fp'] as Footprint], s = 6;
  const cells = Array.from({ length: w * d }, (_, i) => `<rect x="${1 + (i % w) * s}" y="${1 + Math.floor(i / w) * s}" width="${s - 1}" height="${s - 1}" fill="#c9b79a"/>`).join('');
  b.innerHTML = `<svg width="${w * s + 1}" height="${d * s + 4}">${cells}<rect x="1" y="${d * s + 1}" width="${w * s - 1}" height="2" fill="#ffd23f"/></svg>`;
}

function group(attr: string, apply: (v: string) => void): void {
  // (Buttons only: the body carries data-tool too.)
  document.querySelectorAll<HTMLButtonElement>(`button[data-${attr}]`).forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>(`button[data-${attr}]`).forEach((x) => x.classList.toggle('on', x === b));
    apply(b.dataset[attr]!);
    b.blur();
  }));
}
group('tool', (v) => setTool(v as Tool));
group('rank', (v) => { rank = v as Rank; });
// Size and height: for the next building, and the selected one.
const restyle = (f: (l: Lot) => Lot) => {
  if (selected?.t !== 'lot') return;
  const l = doc.lots[selected.i];
  if (!l || !isBuilding(l.kind)) return;
  const before = snapshot();
  placeLot(f(l), selected.i);
  selected = { t: 'lot', i: doc.lots.length - 1 };
  commit(before);
};
group('fp', (v) => { footprint = v as Footprint; restyle((l) => ({ ...l, kind: footprint })); updateGhost(); });
group('floors', (v) => { floors = Number(v) as Floors; restyle((l) => ({ ...l, floors })); updateGhost(); });
group('prop', (v) => { propKind = v as LotKind; updateGhost(); });
group('paved', (v) => { paved = v === '1'; });
group('spot', (v) => { spotWhich = v === 'hall' || v === 'wonder' ? v : Number(v); });
group('role', (v) => { role = v as Role; open(key, variantsOf(key, role, density)[0] ?? 0); });
group('density', (v) => { density = v as Density; open(key, variantsOf(key, role, density)[0] ?? 0); });
$('onlyDrawn').addEventListener('change', renderTree);

function setSnap(s: boolean): void { snap = s; $('gridBtn').classList.toggle('on', s); drawOverlay(); }
$('top').addEventListener('click', () => setTilt(false));
$('tilt').addEventListener('click', () => setTilt(true));
$('gridBtn').addEventListener('click', () => setSnap(!snap));
$('undo').addEventListener('click', doUndo);
$('redo').addEventListener('click', doRedo);
$('redraft').addEventListener('click', () => { const before = snapshot(); doc.lots = lotsAlong(doc, key, role, density); commit(before); });
$('clearLots').addEventListener('click', () => { const before = snapshot(); doc.lots = []; commit(before); });
$('save').addEventListener('click', () => { void save(); });

async function save(): Promise<void> {
  const res = await fetch('/__town/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(allRecords()) });
  if (!res.ok) { $('saveInfo').textContent = `save failed: ${await res.text()}`; return; }
  dirty.clear();
  const { saved } = await res.json() as { saved: number };
  $('saveInfo').textContent = `saved · ${saved} drawings`;
  $('save').classList.remove('dirty');
  renderTree();
  refreshPanel();
}
addEventListener('beforeunload', (e) => { if (dirty.size) e.preventDefault(); });

// ---------- go ----------

const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();
open(key, variantsOf(key, role, density)[0] ?? 0);
renderer.setAnimationLoop(() => {
  keyboard();
  controls.update();
  renderer.render(scene, camera);
});
if (import.meta.env.DEV) {
  Object.assign(window, { __editor: {
    camera, controls, at, setTool, setTilt,
    get doc() { return doc; }, get drawing() { return drawing; }, get tool() { return tool; },
    open: (k: string, v = 0, r: Role = role, d: Density = density) => { role = r; density = d; open(k, v); },
  } });
}
