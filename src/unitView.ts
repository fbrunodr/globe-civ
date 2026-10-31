import * as THREE from 'three';
import type { ArchCiv } from './architecture.ts';
import { unitDef, type UnitKey } from './rules.ts';
import { UNIT_LOOK, figuresFor, formationSlots, unitModel, variantOf, rides, hairModel, wearsHelmet, womenShare, isMachine, colsOf, GEAR, HAIR_BY, HAIR_STYLES, RIDER_HEAD, STRIKE } from './unitModels.ts';
import { mulberry32 } from './rng.ts';

// The units on the globe, as figurines (unitModels.ts): a fighting unit is a
// formation of up to a dozen figures (FORMATION), one fewer for every 8 HP
// it has lost; the others a small party. Each stands on its tile's dry
// ground: the formation is placed where every figure is out of the water
// (another spot or facing on the tile, or closer ranks). A unit that moves
// marches to its new tile, legs swinging, turned the way it goes. A soft
// shadow lies under each figure (they cast none into the sun's shadow map,
// which would then be redrawn whenever one moved). Above each unit flies
// its flag (made by the caller), which alone shows from far away.
// In a fight (fight()), a melee unit charges at the enemy, strikes and falls
// back; archers raise their bows and loose volleys of arrows (Volleys); the
// units attacked strike back where they stand. A unit killed in a fight is
// shown until the fight is over.

// A figure's height, in tile steps (the distance between tile centers).
const FIGURE = 0.075;
// How long a march takes (seconds per tile step, and at least).
const MARCH = 0.5, MARCH_MIN = 0.35;
// The flag's height over the ground (figure heights).
const FLAG_LIFT = 1.7;
// A figure stands on dry ground: the water there no deeper than this (world units).
const DRY = 0.00005;
// The figures are drawn while at least this many pixels tall.
const MIN_PX = 3;
// A fight: how long (seconds), and how far a melee unit charges (a share of
// the way to the enemy's tile).
const FIGHT = 1.8, CHARGE = 0.42;

export interface ShownUnit {
  readonly id: number;
  readonly type: UnitKey;
  readonly civ: ArchCiv;
  readonly color: string;
  readonly tile: number;
  readonly hp: number;
  readonly suffrage: boolean; // its civ has women's suffrage (half its figures women)
}
export interface UnitViewEnv {
  readonly center: (t: number) => THREE.Vector3;               // a tile's center (unit vector)
  readonly ground: (dir: THREE.Vector3) => { ground: number; water: number }; // heights above radius 1
  readonly step: number;                                        // tile step (radians)
}

interface Figure { x: number; z: number; variant: number; female: boolean; skin: THREE.Color; hair: number; hairColor: THREE.Color; phase: number; pos: THREE.Vector3; up: THREE.Vector3 }
interface Shown {
  unit: ShownUnit;
  dir: THREE.Vector3;          // where it stands (unit vector)
  forward: THREE.Vector3;      // the way it faces (tangent)
  figures: Figure[];
  spread: number;              // ranks closed up to fit (1: full spacing)
  march: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number } | null;
  // A fight: the enemy's spot, and how far it charges (0: strikes where it stands).
  fight: { at: THREE.Vector3; home: THREE.Vector3; t0: number; charge: number; ranged: boolean; loosed: number } | null;
  gone: boolean;               // no longer in the game (shown until its fight is over)
  flag: THREE.Sprite;
  k: number;                   // its place among the units on its tile (0: the middle)
  seen: boolean;
}

const UNIT_VERTEX_DECL = /* glsl */ `
  attribute float aTeam;
  attribute float aSkin;
  attribute vec3 aLimb;
  attribute vec3 aAnim;     // per figure: phase, how much it marches, how hard it strikes (0..1)
  attribute vec3 aSkinTone; // per figure
  uniform float uTime;`;
const UNIT_VERTEX = /* glsl */ `
  {
    float beat = uTime * 9.0 + aAnim.x;
    if (aLimb.z > 0.0) {
      // (Marching: swinging to and fro; striking: thrust forward, again and again.)
      float a = aLimb.x > ${(STRIKE - 0.5).toFixed(1)} ? -aAnim.z * aLimb.z * (0.6 + 0.4 * sin(uTime * 13.0 + aAnim.x))
                                         : sin(beat) * aAnim.y * aLimb.x * aLimb.z;
      float c = cos(a), s = sin(a);
      vec2 yz = transformed.yz - vec2(aLimb.y, 0.0);
      transformed.yz = vec2(aLimb.y, 0.0) + vec2(c * yz.x - s * yz.y, s * yz.x + c * yz.y);
    }
    transformed.y += abs(sin(beat)) * 0.03 * aAnim.y;
  }`;

// The figures' material: the props' look (flat-shaded, painted), the
// owner's colour on the team parts (the instance colour), each figure's
// skin, and the limbs swinging on the march (`time`: seconds).
export function makeUnitMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${UNIT_VERTEX_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${UNIT_VERTEX}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb = mix(mix(color.rgb, aSkinTone, aSkin), color.rgb * instanceColor.rgb, aTeam);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'unit-figure';
  return mat;
}
// A model's geometry made ready for `cap` instances (their gait and skin).
export function prepareUnitGeometry(geo: THREE.BufferGeometry, cap: number): THREE.BufferGeometry {
  geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
  geo.setAttribute('aSkinTone', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
  return geo;
}

export class UnitView {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly material: THREE.MeshStandardMaterial;
  private readonly shadowGeo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);
  private readonly shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private shadows: THREE.InstancedMesh;
  private readonly shown = new Map<number, Shown>();
  private readonly volleys: Volleys;
  private readonly size: number; // a figure's height, world units

  constructor(private readonly env: UnitViewEnv, private readonly makeFlag: (u: ShownUnit) => THREE.Sprite) {
    this.size = FIGURE * env.step;
    this.material = makeUnitMaterial(this.time);
    this.shadows = this.makeShadows(256);
    this.volleys = new Volleys(this.size);
    this.group.add(this.shadows, this.volleys.lines);
  }

  // The units to show now (those in sight). A unit on a new tile marches
  // there (after its fight, if it is fighting); one gone is taken away (once
  // its fight is over).
  sync(units: readonly ShownUnit[], now: number): void {
    for (const s of this.shown.values()) s.seen = false;
    // (Units sharing a tile stand apart: the first in the middle.)
    const onTile = new Map<number, number>();
    for (const u of units) {
      const k = onTile.get(u.tile) ?? 0;
      onTile.set(u.tile, k + 1);
      let s = this.shown.get(u.id);
      if (!s || s.unit.type !== u.type || s.unit.civ !== u.civ || s.unit.suffrage !== u.suffrage) {
        if (s) this.drop(s);
        s = this.add(u, k);
      } else if (s.unit.tile !== u.tile) {
        s.unit = u;
        s.k = k;
        const from = (s.fight?.home ?? s.dir).clone(), { dir } = this.spot(u, k, s.forward);
        const start = s.fight ? s.fight.t0 + FIGHT : now;
        s.march = { from, to: dir, t0: start, dur: Math.max(MARCH_MIN, (MARCH * from.angleTo(dir)) / this.env.step) };
      } else {
        const hurt = s.unit.hp !== u.hp;
        s.unit = u;
        if (hurt || s.k !== k) { s.k = k; if (!s.march && !s.fight) this.settle(s, k); }
      }
      // (Its flag anew: it shows the unit's health and whether it is selected.)
      this.group.remove(s.flag);
      s.flag.material.dispose();
      s.flag = this.makeFlag(u);
      this.group.add(s.flag);
      s.seen = true;
    }
    for (const s of [...this.shown.values()]) {
      if (s.seen) continue;
      if (s.fight) { s.gone = true; s.flag.visible = false; } else this.drop(s);
    }
  }

  // A fight: the attacker charges at the tile (or, ranged, looses arrows at
  // it); every unit shown there strikes back where it stands. (Call before
  // the sync that follows it: the fallen are still shown.)
  fight(attacker: number, tile: number, ranged: boolean, now: number): void {
    const a = this.shown.get(attacker);
    const defenders = [...this.shown.values()].filter((s) => s.unit.tile === tile && s !== a);
    const at = defenders[0]?.dir.clone() ?? this.env.center(tile).clone();
    if (a) this.startFight(a, at, ranged ? 0 : CHARGE, ranged, now);
    for (const d of defenders) this.startFight(d, a?.dir.clone() ?? at, 0, unitDef(d.unit.type).ranged === true, now);
  }

  private startFight(s: Shown, at: THREE.Vector3, charge: number, ranged: boolean, now: number): void {
    const home = s.fight?.home ?? s.dir.clone();
    s.fight = { at, home, t0: now, charge, ranged, loosed: 0 };
    s.march = null;
  }

  // Every frame: marching and fighting units move on, and every figure is
  // drawn where it stands. `pxPerUnit`: screen pixels per world unit at
  // distance 1 (figures too small to see are not drawn).
  update(now: number, camera: THREE.Camera, pxPerUnit: number): void {
    this.time.value = now;
    const drawn: Shown[] = [], need = new Map<string, number>();
    let figures = 0;
    for (const s of [...this.shown.values()]) {
      if (s.fight) this.fighting(s, now);
      else if (s.march && now >= s.march.t0) {
        const t = Math.min(1, (now - s.march.t0) / s.march.dur);
        s.dir.copy(s.march.from).lerp(s.march.to, t).normalize();
        this.face(s, s.march.to.clone().sub(s.march.from));
        if (t >= 1) { s.march = null; this.settle(s, s.k); } else this.layout(s);
      }
      if (!this.shown.has(s.unit.id)) continue;
      const ground = this.env.ground(s.dir);
      s.flag.position.copy(s.dir).multiplyScalar(1 + Math.max(ground.ground, ground.water) + FLAG_LIFT * this.size);
      if ((this.size * pxPerUnit) / camera.position.distanceTo(s.flag.position) < MIN_PX) continue;
      drawn.push(s);
      for (const f of s.figures) {
        const key = this.key(s, f);
        need.set(key, (need.get(key) ?? 0) + 1);
        if (f.hair >= 0) need.set(`hair|${f.hair}`, (need.get(`hair|${f.hair}`) ?? 0) + 1);
      }
      figures += s.figures.length;
    }
    for (const [key, n] of need) this.mesh(key, n);
    if (this.shadows.instanceMatrix.count < figures) this.growShadows(figures);
    const counts = new Map<string, number>();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), basis = new THREE.Matrix4(), scale = new THREE.Vector3();
    const x = new THREE.Vector3(), z = new THREE.Vector3(), color = new THREE.Color(), head = new THREE.Vector3();
    let shadowN = 0;
    const put = (key: string, pos: THREE.Vector3, c: THREE.Color, f: Figure, walk: number, strike: number) => {
      const mesh = this.meshes.get(key)!, i = counts.get(key) ?? 0;
      counts.set(key, i + 1);
      mesh.setMatrixAt(i, m.compose(pos, q, scale.setScalar(this.size)));
      mesh.setColorAt(i, c);
      (mesh.geometry.getAttribute('aAnim') as THREE.InstancedBufferAttribute).setXYZ(i, f.phase, walk, strike);
      (mesh.geometry.getAttribute('aSkinTone') as THREE.InstancedBufferAttribute).setXYZ(i, f.skin.r, f.skin.g, f.skin.b);
    };
    for (const s of drawn) {
      const { walk, strike } = this.pose(s, now);
      color.set(s.unit.color);
      for (const f of s.figures) {
        const lift = rides(s.unit.type, f.variant) ? RIDER_HEAD : 0;
        // (Model axes: x = up × forward, y up, z forward.)
        x.crossVectors(f.up, s.forward).normalize();
        z.crossVectors(x, f.up).normalize();
        q.setFromRotationMatrix(basis.makeBasis(x, f.up, z));
        put(this.key(s, f), f.pos, color, f, walk, strike);
        if (f.hair >= 0) put(`hair|${f.hair}`, head.copy(f.pos).addScaledVector(f.up, lift * this.size), f.hairColor, f, walk, 0);
        // Its shadow: a soft disc on the ground under it (longer under a horse).
        m.compose(f.pos.clone().addScaledVector(f.up, 0.002 * this.size), q, scale.set(this.size * (isMachine(s.unit.type) ? 0.8 : 0.42), 1, this.size * (isMachine(s.unit.type) ? 1.4 : rides(s.unit.type, f.variant) ? 0.95 : 0.42)));
        this.shadows.setMatrixAt(shadowN++, m);
      }
    }
    for (const [key, mesh] of this.meshes) {
      mesh.count = counts.get(key) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.getAttribute('aAnim').needsUpdate = true;
      mesh.geometry.getAttribute('aSkinTone').needsUpdate = true;
    }
    this.shadows.count = shadowN;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.volleys.update(now);
  }

  // A fight going on: a melee unit charges out (the first third), holds
  // striking, and falls back home (the last quarter); an archer's volleys
  // fly at a third and at two thirds of it. Over, the fallen leave.
  private fighting(s: Shown, now: number): void {
    const f = s.fight!, t = (now - f.t0) / FIGHT;
    if (t >= 1) {
      s.fight = null;
      if (s.gone) { this.drop(s); return; }
      s.dir.copy(f.home);
      if (!s.march) this.settle(s, s.k);
      return;
    }
    const out = t < 0.3 ? smooth(t / 0.3) : t < 0.75 ? 1 : 1 - smooth((t - 0.75) / 0.25);
    s.dir.copy(f.home).lerp(f.at, f.charge * out).normalize();
    this.face(s, t < 0.75 || f.charge === 0 ? f.at.clone().sub(f.home) : f.home.clone().sub(f.at));
    this.layout(s);
    if (f.ranged && f.loosed < 2 && t > (f.loosed + 1) / 3) {
      f.loosed++;
      this.volleys.loose(s.figures.map((g) => g.pos.clone().addScaledVector(g.up, 0.75 * this.size)), f.at, this.env.step * 0.12, now, f.loosed * 7 + s.unit.id);
    }
  }

  // How a unit moves now: marching (legs), striking (arms).
  private pose(s: Shown, now: number): { walk: number; strike: number } {
    if (s.fight) {
      const t = (now - s.fight.t0) / FIGHT, moving = s.fight.charge > 0 && (t < 0.3 || t > 0.75);
      const strike = s.fight.ranged ? Math.min(1, t * 4) * (t < 0.85 ? 1 : (1 - t) / 0.15) : t > 0.2 && t < 0.8 ? 1 : 0;
      return { walk: moving ? 1 : 0, strike };
    }
    return { walk: s.march && now >= s.march.t0 ? 1 : 0, strike: 0 };
  }

  // Turned along `heading` (made tangent at the unit's spot).
  private face(s: Shown, heading: THREE.Vector3): void {
    heading.addScaledVector(s.dir, -heading.dot(s.dir));
    if (heading.lengthSq() > 1e-14) s.forward.copy(heading.normalize());
  }

  private key(s: Shown, f: Figure): string { return `${s.unit.type}|${s.unit.civ}|${f.variant}|${f.female ? 1 : 0}`; }

  dispose(): void {
    for (const s of this.shown.values()) s.flag.material.dispose();
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.material.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.volleys.dispose();
  }

  // ---- placing ----

  private add(u: ShownUnit, k: number): Shown {
    const rand = mulberry32(u.id * 7919 + 1);
    const a = rand() * Math.PI * 2, c = this.env.center(u.tile);
    const east = new THREE.Vector3(0, 1, 0).cross(c);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const north = c.clone().cross(east);
    const s: Shown = {
      unit: u, dir: c.clone(), forward: east.multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a)).normalize(),
      figures: [], spread: 1, march: null, fight: null, gone: false, flag: this.makeFlag(u), k, seen: true,
    };
    this.group.add(s.flag);
    this.shown.set(u.id, s);
    this.settle(s, k);
    return s;
  }

  private drop(s: Shown): void {
    this.group.remove(s.flag);
    s.flag.material.dispose();
    this.shown.delete(s.unit.id);
  }

  // Stands a unit on its tile: where and facing which way every figure is
  // on dry ground, the ranks closed up if need be.
  private settle(s: Shown, k: number): void {
    const { dir, forward, spread } = this.spot(s.unit, k, s.forward);
    s.dir.copy(dir);
    s.forward.copy(forward);
    s.spread = spread;
    this.dress(s);
    this.layout(s);
  }

  // The figures of a unit, in ranks (the front rank full first; a hurt
  // formation loses men from the back), each with its own skin, hair, gait
  // and (for horses) coat.
  private dress(s: Shown): void {
    const u = s.unit, rand = mulberry32(u.id * 104729 + 3);
    s.figures = formationSlots(u.type, u.hp, rand).map(([x, z], i) => ({
      x, z, variant: variantOf(u.type, i, rand), ...figureLooks(u.type, u.civ, womenShare(u.type, u.suffrage), rand),
      phase: rand() * Math.PI * 2, pos: new THREE.Vector3(), up: new THREE.Vector3(),
    }));
  }

  // Where each figure stands now: around the unit's spot, on the ground.
  private layout(s: Shown): void {
    const right = new THREE.Vector3().crossVectors(s.forward, s.dir).normalize();
    for (const f of s.figures) {
      const d = this.figureDir(s.dir, s.forward, right, f.x * s.spread, f.z * s.spread);
      const h = this.env.ground(d);
      f.up.copy(d);
      f.pos.copy(d).multiplyScalar(1 + Math.max(h.ground, h.water - 0.0004));
    }
  }

  private figureDir(c: THREE.Vector3, forward: THREE.Vector3, right: THREE.Vector3, x: number, z: number): THREE.Vector3 {
    return c.clone().addScaledVector(right, -x * this.size).addScaledVector(forward, z * this.size).normalize();
  }

  // A spot on a unit's tile where all its figures stand dry: the middle
  // first (the k-th unit on a tile a little off it), facing its way or
  // turned, then spots further out; failing that, closer ranks; failing
  // that, the spot with the most figures dry.
  private spot(u: ShownUnit, k: number, facing: THREE.Vector3): { dir: THREE.Vector3; forward: THREE.Vector3; spread: number } {
    const c = this.env.center(u.tile), look = UNIT_LOOK[u.type];
    const n = look.party === 'formation' ? figuresFor(u.hp, look.count) : look.count;
    const cols = colsOf(u.type, look.count), rows = Math.ceil(n / cols);
    const east = new THREE.Vector3(0, 1, 0).cross(c);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const north = c.clone().cross(east);
    const tangent = (a: number) => east.clone().multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a));
    const face = facing.clone().addScaledVector(c, -facing.dot(c)).normalize();
    const faceA = Math.atan2(face.dot(north), face.dot(east));
    const centres: THREE.Vector3[] = [];
    const ring = (r: number, m: number, a0: number) => { for (let i = 0; i < m; i++) centres.push(c.clone().addScaledVector(tangent(a0 + (i / m) * Math.PI * 2), r * this.env.step).normalize()); };
    if (k === 0) centres.push(c.clone());
    ring(0.14 + 0.06 * Math.min(k, 2), 6, k * 0.7);
    ring(0.26, 8, 0.3);
    let best = { dir: c.clone(), forward: face, spread: 1 }, bestDry = -1;
    for (const spread of [1, 0.8, 0.62]) {
      for (const at of centres) {
        for (const turn of [0, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI]) {
          const a = faceA + turn;
          const fwd = tangent(a).addScaledVector(at, -tangent(a).dot(at)).normalize();
          const right = new THREE.Vector3().crossVectors(fwd, at).normalize();
          let dry = 0;
          for (let i = 0; i < n; i++) {
            const r = Math.floor(i / cols), col = i % cols;
            const x = (col - (cols - 1) / 2) * look.spacing[0] * spread, z = ((rows - 1) / 2 - r) * look.spacing[1] * spread;
            const h = this.env.ground(this.figureDir(at, fwd, right, x, z));
            if (h.water - h.ground <= DRY) dry++;
          }
          if (dry > bestDry) { bestDry = dry; best = { dir: at.clone(), forward: fwd, spread }; }
          if (dry === n) return best;
        }
      }
    }
    return best;
  }

  // ---- drawing ----

  // The instanced mesh of a model (type|civ|variant, or hair|style), room
  // for `need` figures.
  private mesh(key: string, need: number): THREE.InstancedMesh {
    let mesh = this.meshes.get(key);
    if (mesh && mesh.instanceMatrix.count >= need) return mesh;
    const cap = Math.max(64, need, mesh ? mesh.instanceMatrix.count * 2 : 0);
    const [a, b, c, d] = key.split('|') as [string, string, string | undefined, string | undefined];
    const geo = mesh ? mesh.geometry : a === 'hair' ? hairModel(HAIR_STYLES[Number(b)]!) : unitModel(a as UnitKey, b as ArchCiv, Number(c), d === '1');
    prepareUnitGeometry(geo, cap);
    const next = new THREE.InstancedMesh(geo, this.material, cap);
    next.setColorAt(0, new THREE.Color());
    next.receiveShadow = true;
    next.frustumCulled = false;
    next.userData['stat'] = 'units';
    if (mesh) { this.group.remove(mesh); mesh.dispose(); }
    this.meshes.set(key, next);
    this.group.add(next);
    mesh = next;
    return mesh;
  }

  private makeShadows(cap: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, cap);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.userData['stat'] = 'units';
    return mesh;
  }

  private growShadows(need: number): void {
    const next = this.makeShadows(Math.max(need, this.shadows.instanceMatrix.count * 2));
    this.group.remove(this.shadows);
    this.shadows.dispose();
    this.shadows = next;
    this.group.add(next);
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// A figure's own looks, drawn from its civ's: a woman (with odds `women`)
// or a man, skin tone, hair style (by sex; fewer under a helmet: a beard,
// long hair, or none showing) and hair colour.
export function figureLooks(type: UnitKey, civ: ArchCiv, women: number, rand: () => number): { female: boolean; skin: THREE.Color; hair: number; hairColor: THREE.Color } {
  const g = GEAR[civ], pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const female = rand() < women, helmet = wearsHelmet(type, civ), styles = HAIR_BY[female ? 'woman' : 'man'];
  const style = pick(helmet ? styles.helmet : styles.bare);
  // (Machines: no one shows.)
  const none = isMachine(type) || (style === 'bald' && helmet);
  return { female: female && !isMachine(type), skin: new THREE.Color(pick(g.skin)), hair: none ? -1 : HAIR_STYLES.indexOf(style), hairColor: new THREE.Color(pick(g.hair)) };
}

// Arrows in flight: each volley a dozen, from the archers to around the
// target, arcing high; drawn as short dark strokes. Positions in world
// units; up: the local vertical at each arrow (the direction from the
// globe's center, or a fixed up given as `flatUp`).
export class Volleys {
  readonly lines: THREE.LineSegments;
  private readonly arrows: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number }[] = [];
  private readonly pos: Float32Array;
  private static readonly CAP = 512;

  constructor(private readonly size: number, private readonly flatUp: THREE.Vector3 | null = null) {
    this.pos = new Float32Array(Volleys.CAP * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x2a2018 }));
    this.lines.frustumCulled = false;
    this.lines.userData['stat'] = 'units';
  }

  // A volley from each of `from` at the spot `at` (scattered `spread` round it).
  loose(from: readonly THREE.Vector3[], at: THREE.Vector3, spread: number, now: number, seed: number): void {
    const rand = mulberry32(seed * 9973 + 5);
    const up = this.flatUp ?? at.clone().normalize();
    const e = new THREE.Vector3(1, 0, 0).cross(up);
    if (e.lengthSq() < 1e-8) e.set(0, 0, 1);
    e.normalize();
    const n = up.clone().cross(e);
    const ground = this.flatUp ? at : at.clone().multiplyScalar(from[0] ? from[0].length() / at.length() : 1);
    for (const f of from) {
      if (this.arrows.length >= Volleys.CAP) break;
      const to = ground.clone().addScaledVector(e, (rand() - 0.5) * 2 * spread).addScaledVector(n, (rand() - 0.5) * 2 * spread);
      this.arrows.push({ from: f.clone(), to, t0: now + rand() * 0.15, dur: 0.55 + rand() * 0.15 });
    }
  }

  update(now: number): void {
    let n = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) if (now > this.arrows[i]!.t0 + this.arrows[i]!.dur) this.arrows.splice(i, 1);
    const p = new THREE.Vector3(), q = new THREE.Vector3(), up = new THREE.Vector3();
    for (const a of this.arrows) {
      const t = (now - a.t0) / a.dur;
      if (t < 0) continue;
      const at = (u: number, out: THREE.Vector3) => {
        out.copy(a.from).lerp(a.to, u);
        up.copy(this.flatUp ?? out).normalize();
        return out.addScaledVector(up, 4 * u * (1 - u) * 0.3 * a.from.distanceTo(a.to));
      };
      at(t, p);
      at(Math.min(1, t + 0.06), q);
      const d = q.sub(p).normalize().multiplyScalar(0.35 * this.size);
      this.pos.set([p.x, p.y, p.z, p.x + d.x, p.y + d.y, p.z + d.z], n * 6);
      n++;
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
