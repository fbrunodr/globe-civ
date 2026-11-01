import * as THREE from 'three';
import type { Play } from './unitView.ts';

// How a figure moves, as a small machine of acts, blended one into the
// next (unitView.ts and the Units page draw it). Out of a fight a figure
// idles (two ways of standing, a fidget now and then: a look about, its
// weapon shifted) or marches. In a fight it takes its ready stance; in a
// melee it runs at its foe, pulls up, and trades blows with it (a thrust
// or a blow from overhead), flinching as each of its foe's lands; shot at,
// it cowers; shooting, it draws, looses and reloads; struck down, it
// staggers and falls (one way or another) and lies there; its side the
// winner, it raises its weapon. A pose is a pure function of the time
// (all figures alike, each its own phase and beat).

// A pose: how far the figure has stepped forward (figure heights); the
// whole of it leaned forward and turned (radians, about its feet); its body
// above the hips bent forward and turned (the shader's aPose); its striking
// arm (the shader's strike limb: 1 thrust out, past 1 raised, below 0
// drawn back; times the limb's own reach); its legs: marching (`walk`, how
// hard) or set apart (`stride`: a foot forward); its `crouch` (thighs
// forward, knees bent twice as far: radians), its striking arm's `elbow`
// bent (radians); where its weapon points (`aim`: radians from upright,
// forward: levelled at 1.5; turned in the hand whatever the arm does), and
// how far it is so aimed (`aimed`: 0, as it is made and carried, at ease).
export interface Pose {
  readonly lunge: number; readonly lean: number; readonly yaw: number;
  readonly bend: number; readonly twist: number; readonly arm: number;
  readonly walk: number; readonly stride: number;
  readonly crouch: number; readonly elbow: number; readonly aim: number; readonly aimed: number;
}
// (Aimed: what holds an aim, in a fight.)
const P = (lunge: number, lean: number, yaw: number, bend: number, twist: number, arm: number, walk: number, stride: number, crouch = 0, elbow = 0, aim?: number): Pose =>
  ({ lunge, lean, yaw, bend, twist, arm, walk, stride, crouch, elbow, aim: aim ?? 0, aimed: aim === undefined ? 0 : 1 });
const mix = (a: Pose, b: Pose, k: number): Pose => {
  const t = Math.max(0, Math.min(1, k)), m = (x: number, y: number) => x + (y - x) * t;
  return { ...P(m(a.lunge, b.lunge), m(a.lean, b.lean), m(a.yaw, b.yaw), m(a.bend, b.bend), m(a.twist, b.twist), m(a.arm, b.arm), m(a.walk, b.walk), m(a.stride, b.stride), m(a.crouch, b.crouch), m(a.elbow, b.elbow), m(a.aim, b.aim)), aimed: m(a.aimed, b.aimed) };
};
const add = (a: Pose, d: Partial<Pose>): Pose => ({ ...P(a.lunge + (d.lunge ?? 0), a.lean + (d.lean ?? 0), a.yaw + (d.yaw ?? 0), a.bend + (d.bend ?? 0), a.twist + (d.twist ?? 0), a.arm + (d.arm ?? 0), a.walk, a.stride + (d.stride ?? 0), a.crouch + (d.crouch ?? 0), a.elbow + (d.elbow ?? 0), a.aim + (d.aim ?? 0)), aimed: a.aimed });
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const frac = (x: number) => x - Math.floor(x);

// How long a blend between acts takes; a blow (seconds).
const BLEND = 0.22, BOUT = 0.7;
// Struck down: how long it staggers, then falls (seconds); how far over it lies (radians).
const STAGGER = 0.14, FALL = 0.42, FALLEN = 1.42;
// After the fight: how long the winners cheer (seconds).
const CHEER = 1.6;
// How long after a fight its figures are still in it (cheering, settling down).
export const AFTER = CHEER + 0.6;

// ---- the acts ----

// Standing at ease: weight on both feet or on one, a breath; every so
// often a fidget (a look to one side, the weapon shifted).
function idle(now: number, phase: number): Pose {
  const easy = frac(phase * 3.7) < 0.5, breath = 0.02 * Math.sin(now * 1.3 + phase);
  const base = easy ? P(0, 0, 0, 0.03 + breath, 0, 0, 0, 0, 0, 0.15) : P(0, 0.02, 0.08, 0.05 + breath, 0.06, 0.05, 0, 0.18, 0.07, 0.2);
  // (A fidget: 1.6 s in every 7 or so, a look one way or the other.)
  const cycle = 6.5 + 2 * frac(phase * 5.3), u = frac(now / cycle + phase), k = u < 0.23 ? Math.sin((u / 0.23) * Math.PI) : 0;
  const way = Math.floor(now / cycle + phase) % 2 ? 1 : -1;
  return add(base, { twist: 0.42 * way * k, yaw: 0.1 * way * k, arm: 0.25 * k, bend: -0.03 * k });
}
// On the march (`walk` 1), or at a run (more): leaning into it.
const march = (now: number, phase: number, walk: number): Pose =>
  P(0, 0.02 * walk, 0, 0.1 * walk + 0.03 * Math.sin(now * 18 + phase * 2), 0.06 * Math.sin(now * 9 + phase), 0.1 * walk, walk, 0, 0.1 * walk, 0.35 * walk, walk > 1.2 ? 1.2 : undefined);
// Ready to fight: crouched a little, feet apart, weapon up, bouncing on its feet.
const ready = (now: number, phase: number): Pose =>
  P(0, 0.03, 0, 0.16 + 0.03 * Math.sin(now * 6 + phase), 0.05 * Math.sin(now * 2.1 + phase), 0.32 + 0.05 * Math.sin(now * 6 + phase + 1), 0, 0.35, 0.32 + 0.04 * Math.sin(now * 6 + phase), 0.7, 0.75 + 0.05 * Math.sin(now * 6 + phase + 1));
// Pulled up at the end of a run: rocking back on its heels.
const pullUp = P(-0.05, -0.04, 0, -0.08, 0, 0.4, 0, 0.5, 0.45, 0.8, 1.1);
// Cowering under arrows or shells: down low, weapon or shield up.
const cower = (now: number, phase: number): Pose => P(-0.03, 0.06, 0, 0.45 + 0.03 * Math.sin(now * 8 + phase), 0, 0.95, 0, 0.3, 0.75, 1.2, 0.25);
// Cheering: weapon raised and shaken, head back.
const cheer = (now: number, phase: number): Pose => P(0, -0.02, 0, -0.12, 0.1 * Math.sin(now * 3 + phase), 1.65 + 0.18 * Math.sin(now * 10 + phase), 0, 0.15, 0.05, 0.25 + 0.2 * Math.sin(now * 10 + phase), -0.15);

// Blows: wound up, struck (the blow lands as it ends), recovered to the
// ready stance. A thrust: drawn back and low, lunging in. From overhead:
// raised high, leaning back, then brought down hard.
// (A thrust drives out from a bent elbow to a straight arm, the weapon
// levelled; a blow from overhead stabs down with the knees, its point
// forward.)
const THRUST = { wind: P(-0.07, -0.03, 0, -0.14, -0.32, -0.3, 0, -0.2, 0.42, 1.5, 1.35), hit: P(0.3, 0.06, 0, 0.34, 0.24, 1.0, 0, 0.8, 0.3, 0.02, 1.6) };
const OVERHEAD = { wind: P(-0.04, -0.04, 0, -0.24, -0.16, 1.8, 0, 0.1, 0.2, 1.1, 1.7), hit: P(0.2, 0.07, 0, 0.5, 0.1, 0.5, 0, 0.6, 0.45, 0.3, 2.2) };
// The blows of a figure `sec` seconds into its exchange (a round of BOUT
// seconds; `beat` where it starts in it). Its foe is half a round apart:
// each of its blows lands as this one is winding up, and it flinches.
function blows(sec: number, beat: number, now: number, phase: number): Pose {
  const x = sec / BOUT + beat, n = Math.floor(x), u = frac(x);
  const kind = frac(Math.sin(n * 12.9898 + beat * 78.233) * 43758.5453) < 0.5 ? THRUST : OVERHEAD, rest = ready(now, phase);
  let pose = u < 0.4 ? mix(rest, kind.wind, smooth(u / 0.4)) : u < 0.55 ? mix(kind.wind, kind.hit, 1 - (1 - (u - 0.4) / 0.15) ** 2) : mix(kind.hit, rest, smooth((u - 0.55) / 0.45));
  // (The foe's blow landing: knocked back, turned, for a moment.)
  const f = u < 0.16 ? Math.sin((u / 0.16) * Math.PI) : 0;
  if (f > 0) pose = add(pose, { bend: -0.3 * f, lunge: -0.09 * f, lean: -0.05 * f, twist: (n % 2 ? 0.25 : -0.25) * f, crouch: 0.15 * f, elbow: 0.4 * f, aim: -0.35 * f });
  return pose;
}
// Shooting: drawing (or shouldering) before each shot, loosed (a recoil),
// lowered to reload.
function shooting(sec: number, shots: readonly number[]): Pose {
  let pose = P(0, 0, 0, 0.06, 0, 0.4, 0, 0.3, 0.15, 0.5, 0.5);
  for (const ts of shots) {
    const d = sec - ts;
    if (d > -0.4 && d <= 0) pose = mix(pose, P(0, -0.02, 0, -0.05, 0.18, 1.0, 0, 0.35, 0.2, 0.15, 1.5), smooth((d + 0.4) / 0.3));
    else if (d > 0 && d < 0.55) pose = mix(P(-0.03, -0.03, 0, -0.1, 0.12, 0.85, 0, 0.35, 0.2, 0.3, 1.3), P(0, 0, 0, 0.06, 0, 0.4, 0, 0.3, 0.15, 0.5, 0.5), smooth(d / 0.55));
  }
  return pose;
}

// ---- a figure's part in a fight ----

// What a figure is doing in a fight: seconds into it (`sec`; past `dur`, it
// is over); its side's play, and the attack being made; whether it has a
// foe in a melee; how late it set out (a share); when it is struck down
// (seconds; Infinity: never); whether its side won.
export interface Cue {
  readonly sec: number; readonly dur: number;
  readonly play: Play; readonly attack: Play; readonly side: 'attacker' | 'defender';
  readonly engaged: boolean; readonly delay: number; readonly fall: number; readonly won: boolean;
}

// A figure's pose now: in a fight (its cue), on the march (`walk`), or at
// ease. (Struck down, it is posed by deathTurn and deathBend.)
export function poseOf(c: Cue | null, now: number, phase: number, beat: number, walk: number, rides: boolean): Pose {
  const pose = c ? inFight(c, now, phase, beat) : walk > 0 ? march(now, phase, walk) : idle(now, phase);
  // (A rider strikes from the saddle: the horse hardly moves.)
  return rides ? P(pose.lunge * 0.4, 0, pose.yaw * 0.5, 0, pose.twist * 0.5, pose.arm, pose.walk, 0, 0, pose.elbow, pose.aim) : pose;
}

function inFight(c: Cue, now: number, phase: number, beat: number): Pose {
  const { sec, dur, play, attack } = c, s = (share: number) => share * dur;
  // Over: the winners cheer, the rest stand easy again.
  if (sec >= dur) {
    const after = sec - dur, done = mix(ready(now, phase), idle(now, phase), after / 0.6);
    return c.won ? mix(done, cheer(now, phase), smooth(after / BLEND) * (after < CHEER ? 1 : 1 - smooth((after - CHEER) / 0.4))) : done;
  }
  const into = mix(idle(now, phase), ready(now, phase), sec / BLEND); // (taking its stance as the fight begins)
  if (c.side === 'attacker' && attack.close) {
    const go0 = s(play.go[0] + c.delay), met = s(play.go[1] + c.delay), back = s(play.back), run = play.charge > 1 ? 1.4 : 1;
    if (sec < go0) return into;
    if (sec < met) return mix(into, march(now, phase, run), (sec - go0) / BLEND);
    if (sec < back) {
      const fight = c.engaged ? blows(sec - met, beat, now, phase) : ready(now, phase);
      return mix(mix(pullUp, march(now, phase, run), 1 - (sec - met) / 0.12), fight, (sec - met) / 0.3);
    }
    return mix(blows(back - met, beat, now, phase), march(now, phase, 1), (sec - back) / BLEND);
  }
  if (c.side === 'defender' && attack.close) {
    const met = s(play.strike[0]), part = s(play.strike[1]);
    const shot = play.shots[0];
    let pose = shot ? mix(into, shooting(sec, [s(shot.t)]), smooth(sec / BLEND)) : into;
    if (c.engaged && sec >= met && sec < part) pose = mix(pose, blows(sec - met, beat, now, phase), (sec - met) / BLEND);
    else if (c.engaged && sec >= part) pose = mix(blows(part - met, beat, now, phase), ready(now, phase), (sec - part) / BLEND);
    return pose;
  }
  if (c.side === 'defender') {
    // Shot at: cowering from the first shot until a little after the last.
    const t0 = s(attack.shots[0]?.t ?? 0.3), t1 = s(attack.shots[attack.shots.length - 1]?.t ?? 0.6) + 0.5;
    const shots = play.shots.map((x) => s(x.t));
    const base = shots.length ? shooting(sec, shots) : into;
    return sec < t0 ? mix(into, base, sec / BLEND) : mix(base, cower(now, phase), smooth((sec - t0 + 0.15) / BLEND) * (sec < t1 ? 1 : 1 - smooth((sec - t1) / 0.3)));
  }
  // An attacker shooting (or rolling in: machines aren't posed).
  return mix(into, shooting(sec, play.shots.map((x) => s(x.t))), sec / BLEND);
}

// ---- struck down ----

// The turn of a figure struck down `since` seconds ago, about its feet: it
// staggers back, then goes over (faster as it falls): back, face down, or
// to either side (a horse on its side), turned a little, each its own way
// (its beat).
export function deathTurn(q: THREE.Quaternion, since: number, beat: number, rides: boolean): THREE.Quaternion {
  const r1 = frac(beat * 7.31), r2 = frac(beat * 13.7);
  const way = rides ? 2 + Math.floor(r1 * 2) : Math.floor(r1 * 4); // (0 back, 1 face down, 2 left, 3 right)
  const reel = 0.22 * Math.sin(Math.min(1, since / STAGGER) * Math.PI);
  const f = Math.max(0, Math.min(1, (since - STAGGER * 0.6) / FALL)), over = (FALLEN + 0.14 * r2) * f * f;
  const turn = (r2 - 0.5) * 1.4 * f;
  return q.setFromEuler(way === 0 ? new THREE.Euler(-over - reel, turn, 0, 'YXZ') : way === 1 ? new THREE.Euler(over - reel, turn, 0, 'YXZ')
    : new THREE.Euler(-reel, turn, way === 2 ? over : -over, 'YXZ'));
}
// Its body folding as it falls (back: doubled up; face down: head first,
// its knees giving way; to a side: a little), its arm flung out.
export function deathBend(since: number, beat: number): { readonly bend: number; readonly arm: number; readonly crouch: number; readonly aim: number } {
  const way = Math.floor(frac(beat * 7.31) * 4), f = smooth(since / (STAGGER + FALL)), buckle = smooth(since / STAGGER);
  return { bend: (way === 0 ? 0.55 : way === 1 ? 0.35 : 0.2) * f, arm: (way === 1 ? 1.4 : 0.7) * f, crouch: (way === 1 ? 0.8 : 0.3) * buckle, aim: 1.5 * f };
}
// How far a crouch lowers the figure (figure heights: its legs fold under it).
export const dropOf = (crouch: number): number => 0.5 * (1 - Math.cos(crouch));
// The pose's turn of the whole figure about its feet.
export const poseTurn = (q: THREE.Quaternion, p: Pose): THREE.Quaternion => q.setFromEuler(new THREE.Euler(p.lean, p.yaw, 0, 'YXZ'));
// For the shader: the legs (aAnim.y: past 1.5, set apart exactly) and the
// striking arm (aAnim.z: past 1.5, exactly that arm).
export const legsOf = (p: Pose): number => (p.walk > 0 ? p.walk : 3 + p.stride);
export const armOf = (p: Pose): number => 3 + p.arm;

// The dead lie where they fell for a while, then sink into the ground.
export const CORPSE = 6, SINK = 1.2;
export const sunk = (since: number): number => Math.max(0, Math.min(1, (since - CORPSE) / SINK));
