// A body made elsewhere (a low-poly character, rigged; scripts/importBody.mjs
// turns it into src/bodies/*.json) dressed and posed as people.ts poses its
// own, for the units: the same parts (skin, the owner's colour, plain),
// moving the same way (limb, joint, skirt), its hands where its weapons go.
//
// Its parts are its separate surfaces, told apart by where they are: the
// head and torso (the tunic's body; the head skin in front, hair behind),
// the skirt, the trousers (or bare legs), the shoes, the forearms and
// hands, the belt. Its arms are posed as asked (ArmPose: the upper arm,
// then the forearm turned to point so), each corner moved by its weights
// on the bones it hangs from, so the shoulders and elbows bend smoothly;
// then each corner goes with the limb it hangs from most (the units'
// shader swings limbs whole).

import * as THREE from 'three';
import { KNEE, SKIN_PAINT, CLOTH_PAINT, type ArmPose, type Dress, type Part, type PartTag } from './people.ts';
import wanderer from './bodies/wanderer.json';
import tribal from './bodies/tribal.json';
import ancient from './bodies/ancient.json';
import heads from './bodies/heads.json';

interface BodyData {
  readonly uv?: readonly number[]; // (each triangle's corners, in order: textured bodies)
  readonly team?: readonly number[]; // (each triangle: 1 if the owner's cloth)
  readonly limbs: readonly string[];
  readonly joints: Readonly<Record<string, readonly number[]>>;
  readonly verts: readonly (readonly number[])[];
  readonly weights: readonly (readonly number[])[];
  readonly part: readonly number[];
  readonly tris: readonly number[];
  // (Its owner's colour keyed in its texture (scripts/rigBody.mjs): marked
  // in the texture's alpha, painted pixel by pixel, not by triangle.)
  readonly key?: 'magenta';
}
// The bodies, by name: the pilot (rigged by Mixamo), and those rigged here
// (scripts/rigBody.mjs) from the shape: B1, a tribal warrior; B2, an ancient soldier.
export type BodyName = 'wanderer' | 'tribal' | 'ancient';
const BODIES: Record<BodyName, BodyData> = { wanderer: wanderer as BodyData, tribal: tribal as BodyData, ancient: ancient as BodyData };

const TRIM = 0x6e6e6e, SHOE = 0x3a2a1e, BELT = 0x4a3424, HAIR = 0x5a4632;
type Piece = 'torso' | 'skirt' | 'legs' | 'shoe' | 'forearm' | 'belt';

// Which piece each part is, by its corners: how high, how far out, how many.
function pieces(b: BodyData): Piece[] {
  const n = Math.max(...b.part) + 1, out: Piece[] = [];
  for (let p = 0; p < n; p++) {
    let lo = Infinity, hi = -Infinity, x = 0, c = 0;
    b.verts.forEach((v, i) => { if (b.part[i] !== p) return; lo = Math.min(lo, v[1]!); hi = Math.max(hi, v[1]!); x += Math.abs(v[0]!); c++; });
    out.push(hi > 0.95 ? 'torso' : hi < 0.12 ? 'shoe' : lo < 0.12 ? 'legs' : x / c > 0.15 ? 'forearm' : c < 24 ? 'belt' : 'skirt');
  }
  return out;
}
const PIECES = new Map<BodyData, Piece[]>();

// The heads (scripts/importHeads.mjs: docs/asset-prompts.md's H1…), set on
// a body in place of its own: each 1 tall from its neck's foot, centred on
// its skull; their textures in one image (u from 1 to 2: the units' shader
// reads it there).
interface HeadData { readonly chin: number; readonly verts: readonly (readonly number[])[]; readonly tris: readonly number[]; readonly uv: readonly number[] }
export type HeadName = keyof typeof heads;
const HEADS: Record<HeadName, HeadData> = heads;
export const HEAD_NAMES = Object.keys(heads) as HeadName[];
// Where a head goes on a body: as big as a head is on a figure (HEAD: from
// its crown to its chin, of the figure's height; the classical 1 in 7.5),
// its crown where the body's is, over its own (the skull's middle); and how high the body's own is cut
// off: up under the new one's jaw, its neck there inside the new one's (the
// two overlap: no gap under the chin).
const HEAD = 0.133;
function headFit(b: BodyData, h: HeadData): { s: number; base: THREE.Vector3; cut: number; axis: number } {
  const axis = b.joints['Head']![2]!;
  const own = b.verts.filter((p) => p[1]! > 0.9 && Math.hypot(p[0]!, p[2]! - axis) < 0.1);
  const top = Math.max(...own.map((p) => p[1]!));
  const s = HEAD / (1 - h.chin);
  return { s, base: new THREE.Vector3(0, top - s, axis), cut: top - s * 0.7, axis };
}

const v = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

export interface ImportedBody { readonly parts: Part[]; readonly texture?: string; hand(side: 1 | -1): THREE.Vector3; elbow(side: 1 | -1): THREE.Vector3 }
// The body, `name` (with `newHead` in place of its own, if given), dressed (`d`: its legs bare or trousered, its skirt) and its arms
// posed; `swing`, as person()'s: how its legs and arms move.
export function importedPerson(name: BodyName, newHead: HeadName | null, d: Dress, armL: ArmPose, armR: ArmPose, swing: { legs: (side: number) => readonly [number, number, number]; arms: (side: number) => readonly [number, number, number] | undefined }): ImportedBody {
  const b = BODIES[name], J = b.joints;
  const L = Object.fromEntries(b.limbs.map((limb, i) => [limb, i])) as Record<string, number>;
  const PIECE = PIECES.get(b) ?? PIECES.set(b, pieces(b)).get(b)!;
  // The arms posed: for each side, the upper arm turned about the shoulder
  // to point along the pose, then the forearm about the (moved) elbow.
  const turns = ([1, -1] as const).map((side) => {
    const s = side === 1 ? 'Left' : 'Right', pose = side === 1 ? armL : armR;
    const sh = v(J[`${s}Arm`]!), el = v(J[`${s}ForeArm`]!), wr = v(J[`${s}Hand`]!);
    const U = new THREE.Vector3(...pose.upper).normalize(), F = new THREE.Vector3(...pose.fore).normalize();
    U.x *= side; F.x *= side;
    const r1 = new THREE.Quaternion().setFromUnitVectors(el.clone().sub(sh).normalize(), U);
    const el1 = sh.clone().add(el.clone().sub(sh).applyQuaternion(r1));
    const f1 = wr.clone().sub(el).applyQuaternion(r1);
    const r2 = new THREE.Quaternion().setFromUnitVectors(f1.clone().normalize(), F);
    const wr1 = el1.clone().add(f1.applyQuaternion(r2));
    // (The grip: in the palm, a little past the wrist.)
    return { side, sh, el, el1, wr1, grip: wr1.clone().addScaledVector(F, 0.04), r1, r12: r2.clone().multiply(r1) };
  });
  const [left, right] = turns as [typeof turns[0], typeof turns[0]];
  const moved = b.verts.map((p0, i) => {
    const p = v(p0), w = b.weights[i]!, out = new THREE.Vector3();
    let rest = 1;
    for (const t of turns) {
      const wa = w[t.side === 1 ? L['armL']! : L['armR']!]!, wf = w[t.side === 1 ? L['foreL']! : L['foreR']!]!;
      if (wa) out.addScaledVector(p.clone().sub(t.sh).applyQuaternion(t.r1).add(t.sh), wa);
      // (The forearm: turned with the upper arm, then about the elbow.)
      if (wf) out.addScaledVector(p.clone().sub(t.el).applyQuaternion(t.r12).add(t.el1), wf);
      rest -= wa + wf;
    }
    return out.addScaledVector(p, rest);
  });
  // Each corner's chain (a leg, an arm: its upper and lower piece) and how
  // much it hangs from it, and from its lower piece within it: so a corner
  // at a joint turns part of the way (blend: the units' shader), and hips,
  // knees, shoulders and elbows bend smoothly, not tearing. (The forearm
  // pieces: all forearm.)
  const CHAINS = [['thighL', 'shinL'], ['thighR', 'shinR'], ['armL', 'foreL'], ['armR', 'foreR']].map(([u, l]) => [L[u!]!, L[l!]!] as const);
  const chainOf = (i: number): { chain: number; on: number; lower: number } => {
    const w = b.weights[i]!;
    if (PIECE[b.part[i]!] === 'forearm') return { chain: b.verts[i]![0]! > 0 ? 2 : 3, on: 1, lower: 1 };
    let best = -1, on = 0;
    CHAINS.forEach(([u, l], k) => { const x = w[u]! + w[l]!; if (x > on) { on = x; best = k; } });
    if (best < 0 || on < 0.02) return { chain: -1, on: 0, lower: 0 };
    const [u, l] = CHAINS[best]!;
    return { chain: best, on, lower: w[l]! / (w[u]! + w[l]!) };
  };
  // The tunic's skirt, down to its hem.
  let hem = Infinity;
  b.verts.forEach((p, i) => { if (PIECE[b.part[i]!] === 'skirt') hem = Math.min(hem, p[1]!); });
  // (The trousers under the skirt drawn in towards each leg's line, so they
  // never poke out through it: down to the hem, easing back to their own below.)
  if (hem < Infinity) b.verts.forEach((_, i) => {
    if (PIECE[b.part[i]!] !== 'legs') return;
    const p = moved[i]!, k = Math.max(0, Math.min(1, (p.y - (hem - 0.03)) / 0.05));
    if (k === 0) return;
    const s = p.x >= 0 ? 'Left' : 'Right', hip = v(J[`${s}UpLeg`]!), knee = v(J[`${s}Leg`]!);
    const t = Math.max(0, Math.min(1, (hip.y - p.y) / (hip.y - knee.y))), axis = hip.clone().lerp(knee, t);
    const f = 1 - 0.3 * k;
    p.x = axis.x + (p.x - axis.x) * f; p.z = axis.z + (p.z - axis.z) * f;
  });
  const bare = d.legs === undefined || d.legs === 'bare';
  // (The head: its face skin, the rest of it hair; below the neck, the tunic.)
  const neck = J['Neck']![1]!, head = v(J['Head']!);
  const textured = b.uv !== undefined;
  const paintOf = (piece: Piece, p: THREE.Vector3, n: THREE.Vector3, team = false): [number, PartTag] => {
    // (Textured: the texture's own colours (white paint); the tunic in the owner's colour over it.)
    // (Textured: what the texture paints in the team garment's off-white (scripts/importBody.mjs), not on the legs or feet.)
    // (Low on the torso, well below any beard or hair, all of it is the tunic, however shaded.)
    // (Keyed: the texture marks the owner's colour itself.)
    if (b.key) return [0xffffff, 'plain'];
    if (textured) return [0xffffff, (team || (piece === 'torso' && p.y < 0.72) || piece === 'skirt') && piece !== 'legs' && piece !== 'shoe' ? 'team' : 'plain'];
    switch (piece) {
      case 'torso': return p.y < neck + 0.01 ? [CLOTH_PAINT, 'team'] : n.z > 0.35 && p.y < head.y + 0.11 && p.z > head.z ? [SKIN_PAINT, 'skin'] : [HAIR, 'plain'];
      case 'skirt': return p.y < hem + 0.015 ? [TRIM, 'team'] : [CLOTH_PAINT, 'team'];
      case 'legs': return bare ? [SKIN_PAINT, 'skin'] : [d.legs as number, 'plain'];
      case 'shoe': return [d.shoes ?? SHOE, 'plain'];
      case 'forearm': return d.sleeves === 'long' ? [CLOTH_PAINT, 'team'] : [SKIN_PAINT, 'skin'];
      case 'belt': return [d.belt ?? BELT, 'plain'];
    }
  };
  // How each limb moves, and its joint (knee, elbow): the body's own.
  const knee = (s: 'Left' | 'Right') => [J[`${s}Leg`]![1]!, J[`${s}Leg`]![2]! + KNEE[1]] as const;
  const motion = (chain: number): { limb?: readonly [number, number, number]; joint?: readonly [number, number] } => {
    if (chain < 0) return {};
    const side = chain % 2 === 0 ? 1 : -1;
    if (chain < 2) {
      const lm = swing.legs(side);
      return { limb: [lm[0], lm[1], lm[2]], joint: knee(side === 1 ? 'Left' : 'Right') };
    }
    const lm = swing.arms(side), t = side === 1 ? left : right;
    // (About the caller's shoulder, as what the hand holds turns: they stay together.)
    return { ...(lm ? { limb: lm } : {}), joint: [t.el1.y, t.el1.z] as const };
  };
  // The parts: one geometry for each chain, paint and tag (a triangle goes
  // with the chain any of its corners hangs from most; a corner off it, not
  // hanging from it at all, stays with the body).
  const groups = new Map<string, { pos: number[]; col: number[]; uv: number[]; blend: number[]; tag: PartTag; limb: number; skirt: boolean }>();
  const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), col = new THREE.Color();
  // (With another head: the body's own left off, above where the new one's neck goes in.)
  const fitted = newHead ? headFit(b, HEADS[newHead]) : null;
  const offHead = (i0: number, i1: number, i2: number): boolean => {
    if (!fitted) return false;
    const [p, q, r] = [b.verts[i0]!, b.verts[i1]!, b.verts[i2]!];
    return (p[1]! + q[1]! + r[1]!) / 3 > fitted.cut && Math.hypot((p[0]! + q[0]! + r[0]!) / 3, (p[2]! + q[2]! + r[2]!) / 3 - fitted.axis) < 0.085;
  };
  for (let t = 0; t < b.tris.length; t += 3) {
    const [i0, i1, i2] = [b.tris[t]!, b.tris[t + 1]!, b.tris[t + 2]!];
    if (offHead(i0, i1, i2)) continue;
    a.copy(moved[i0]!); bb.copy(moved[i1]!); c.copy(moved[i2]!);
    nrm.copy(bb).sub(a).cross(c.clone().sub(a)).normalize();
    const piece = PIECE[b.part[i0]!]!, mid = a.clone().add(bb).add(c).divideScalar(3);
    const [paint, tag] = paintOf(piece, mid, nrm, b.team?.[t / 3] === 1);
    // (The skirt hangs from the hips and follows the legs, as people.ts's does.)
    const skirt = piece === 'skirt', cs = [i0, i1, i2].map(chainOf);
    const top = cs.reduce((m, x) => (x.on > m.on ? x : m), cs[0]!), limb = skirt ? 0 : top.chain;
    const key = `${limb}|${paint}|${tag}|${skirt}`;
    let gr = groups.get(key);
    if (!gr) groups.set(key, gr = { pos: [], col: [], uv: [], blend: [], tag, limb, skirt });
    col.set(paint);
    [a, bb, c].forEach((p, k) => {
      gr!.pos.push(p.x, p.y, p.z); gr!.col.push(col.r, col.g, col.b);
      if (b.uv) gr!.uv.push(b.uv[(t + k) * 2]!, b.uv[(t + k) * 2 + 1]!);
      const x = cs[k]!.chain === limb ? cs[k]! : { on: 0, lower: 0 };
      gr!.blend.push(skirt ? 1 : x.on, skirt ? 0 : x.lower);
    });
  }
  // The new head: on the body's neck, with the body (not with a limb).
  if (newHead && fitted) {
    const h = HEADS[newHead], gr = { pos: [] as number[], col: [] as number[], uv: [] as number[], blend: [] as number[], tag: 'plain' as PartTag, limb: -1, skirt: false };
    h.tris.forEach((i, k) => {
      const p = h.verts[i]!;
      gr.pos.push(fitted.base.x + p[0]! * fitted.s, fitted.base.y + p[1]! * fitted.s, fitted.base.z + p[2]! * fitted.s);
      gr.col.push(1, 1, 1); gr.uv.push(h.uv[k * 2]!, h.uv[k * 2 + 1]!);
    });
    groups.set('head', gr);
  }
  const parts: Part[] = [];
  for (const gr of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gr.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(gr.col, 3));
    if (textured) geo.setAttribute('uv', new THREE.Float32BufferAttribute(gr.uv, 2));
    geo.setAttribute('leafMask', new THREE.Float32BufferAttribute(new Array(gr.pos.length / 3).fill(0), 1));
    geo.computeVertexNormals();
    if (!gr.skirt && gr.limb >= 0) geo.setAttribute('aBlend', new THREE.Float32BufferAttribute(gr.blend, 2));
    // (The skirt hangs from the hips, swung as the legs go (unitModels.ts tagged): no knee.)
    const m = gr.skirt ? { limb: swing.legs(1) } : motion(gr.limb);
    parts.push({ geo, tag: gr.tag, ...(m.limb ? { limb: m.limb } : {}), ...(m.joint ? { joint: m.joint } : {}), ...(gr.skirt ? { skirt: hem } : {}) });
  }
  return { parts, ...(textured ? { texture: `bodies/${name}.png` } : {}), hand: (side) => (side === 1 ? left : right).grip.clone(), elbow: (side) => (side === 1 ? left : right).el1.clone() };
}
