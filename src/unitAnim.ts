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
// A figure stays on its feet: planted in one stance through an act, it
// never slides or tips as a whole (only the dead fall); its blows come from
// the body above the hips (bent, turned), its arm, elbow and grip, and its
// knees giving under its weight.

// A pose: how far the figure has stepped forward (figure heights); the
// whole of it leaned forward and turned (radians, about its feet); its body
// above the hips bent forward and turned (the shader's aPose); its striking
// arm (the shader's strike limb: 1 thrust out, past 1 raised, below 0
// drawn back; times the limb's own reach); its legs: marching (`walk`, how
// hard) or set apart (`stride`: a foot forward); its `crouch` (thighs
// forward, knees bent twice as far: radians), its striking arm's `elbow`
// bent (radians); where its weapon points (`aim`: radians from upright,
// forward: levelled at 1.5; turned in the hand whatever the arm does), and
// how far it is so aimed (`aimed`: 0, as it is made and carried, at ease);
// its shield raised (`guard`: 0 carried, 1 up before its face); its
// bowstring drawn to the cheek (`draw`, 0..1); how far it is lifted
// (`rise`, figure heights: a rearing horse on its hind legs).
export interface Pose {
  readonly lunge: number; readonly lean: number; readonly yaw: number;
  readonly bend: number; readonly twist: number; readonly arm: number;
  readonly walk: number; readonly stride: number;
  readonly crouch: number; readonly elbow: number; readonly aim: number; readonly aimed: number;
  readonly guard: number; readonly draw: number; readonly rise: number;
}
// (Aimed: what holds an aim, in a fight.)
const P = (lunge: number, lean: number, yaw: number, bend: number, twist: number, arm: number, walk: number, stride: number, crouch = 0, elbow = 0, aim?: number): Pose =>
  ({ lunge, lean, yaw, bend, twist, arm, walk, stride, crouch, elbow, aim: aim ?? 0, aimed: aim === undefined ? 0 : 1, guard: 0, draw: 0, rise: 0 });
const guarded = (p: Pose, guard: number): Pose => ({ ...p, guard });
const mix = (a: Pose, b: Pose, k: number): Pose => {
  const t = Math.max(0, Math.min(1, k)), m = (x: number, y: number) => x + (y - x) * t;
  return { ...P(m(a.lunge, b.lunge), m(a.lean, b.lean), m(a.yaw, b.yaw), m(a.bend, b.bend), m(a.twist, b.twist), m(a.arm, b.arm), m(a.walk, b.walk), m(a.stride, b.stride), m(a.crouch, b.crouch), m(a.elbow, b.elbow), m(a.aim, b.aim)), aimed: m(a.aimed, b.aimed), guard: m(a.guard, b.guard), draw: m(a.draw, b.draw), rise: m(a.rise, b.rise) };
};
const add = (a: Pose, d: Partial<Pose>): Pose => ({ ...P(a.lunge + (d.lunge ?? 0), a.lean + (d.lean ?? 0), a.yaw + (d.yaw ?? 0), a.bend + (d.bend ?? 0), a.twist + (d.twist ?? 0), a.arm + (d.arm ?? 0), a.walk, a.stride + (d.stride ?? 0), a.crouch + (d.crouch ?? 0), a.elbow + (d.elbow ?? 0), a.aim + (d.aim ?? 0)), aimed: a.aimed, guard: a.guard + (d.guard ?? 0), draw: a.draw + (d.draw ?? 0), rise: a.rise + (d.rise ?? 0) });
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const frac = (x: number) => x - Math.floor(x);

// How long a blend between acts takes; a blow (seconds).
const BLEND = 0.22, BOUT = 0.7;
// Struck down: how long it staggers, then falls (seconds); how far over it lies (radians).
const STAGGER = 0.14, FALL = 0.42, FALLEN = 1.42;
// A horse: how long it stumbles, then rolls over (seconds).
const HORSE_STUMBLE = 0.45, HORSE_ROLL = 0.5;
// After the fight: how long the winners cheer (seconds).
const CHEER = 1.6;
// How long after a fight its figures are still in it (cheering, settling down).
export const AFTER = CHEER + 0.6;

// ---- the acts ----

// Standing at ease: weight on both feet or on one (shifting from one to
// the other now and then), a breath; every so often a fidget, one of a
// few: a look to one side, a glance back over the shoulder, the weapon
// shifted on the shoulder, a lean on it, a stretch. Each figure its own
// way of standing (its phase): turned a little off its file's line, bent
// a little more or less.
function idle(now: number, phase: number): Pose {
  const own = frac(phase * 2.31), breath = 0.02 * Math.sin(now * 1.3 + phase);
  // (Weight shifted, slowly, every 9 to 15 s.)
  const shift = smooth(0.5 + 0.5 * Math.sin(now / (1.5 + frac(phase * 7.7)) + phase * 3) * 1.6);
  const easy = P(0, 0, 0, 0.03 + breath + 0.04 * own, 0.12 * (own - 0.5), 0, 0, 0, 0, 0.15);
  const hip = P(0, 0, 0, 0.06 + breath, 0.12 + 0.12 * (own - 0.5), 0.05, 0, 0.18, 0.07, 0.2);
  const base = mix(easy, hip, frac(phase * 3.7) < 0.5 ? shift : 1 - shift);
  // (A fidget: 1.6 s in every 7 or so, which one by its turn.)
  const cycle = 6.5 + 2 * frac(phase * 5.3), u = frac(now / cycle + phase), k = u < 0.23 ? Math.sin((u / 0.23) * Math.PI) : 0;
  const n = Math.floor(now / cycle + phase), way = n % 2 ? 1 : -1, kind = Math.floor(frac(Math.sin(n * 78.233 + phase * 12.9898) * 43758.5453) * 5);
  const fidget: Partial<Pose> = kind === 0 ? { twist: 0.5 * way, arm: 0.25, bend: -0.03 }           // a look aside
    : kind === 1 ? { twist: 0.95 * way, bend: -0.06 }                                                  // a glance back
    : kind === 2 ? { arm: 0.55, elbow: 0.6, twist: 0.15 * way }                                        // the weapon shifted
    : kind === 3 ? { bend: 0.16, arm: 0.35, crouch: 0.06 }                                             // a lean on it
    : { bend: -0.14, arm: 0.2, twist: -0.1 * way };                                                     // a stretch
  return add(base, Object.fromEntries(Object.entries(fidget).map(([key, v]) => [key, (v as number) * k])));
}
// On the march (`walk` 1), or at a run (more): leaning into it.
const march = (now: number, phase: number, walk: number): Pose =>
  P(0, 0, 0, 0.1 * walk + 0.03 * Math.sin(now * 18 + phase * 2), 0.06 * Math.sin(now * 9 + phase), 0.1 * walk, walk, 0, 0.1 * walk, 0.35 * walk, walk > 1.2 ? 1.2 : undefined);
// Charging home: at a run, the weapon brought down level at the enemy as
// it closes (`k`: 0 setting out, 1 upon it), the body leaning into it.
const charging = (now: number, phase: number, walk: number, k: number): Pose => {
  const run = march(now, phase, walk), t = smooth(k);
  return { ...run, bend: run.bend + 0.12 * t, arm: run.arm + (0.35 - run.arm) * t, elbow: run.elbow + (0.7 - run.elbow) * t, aim: run.aimed ? run.aim + (1.4 - run.aim) * t : 1.4 * t, aimed: Math.max(run.aimed, t) };
};
// Ready to fight: knees bent, a foot forward and planted, weapon up and
// aimed, the shoulders turned a little, weaving slowly.
const STANCE = 0.45;
const ready = (now: number, phase: number): Pose => guarded(
  P(0, 0, 0, 0.18 + 0.02 * Math.sin(now * 2.3 + phase), -0.12 + 0.07 * Math.sin(now * 1.7 + phase), 0.32 + 0.04 * Math.sin(now * 2.9 + phase + 1), 0, STANCE, 0.34, 0.7, 0.75 + 0.06 * Math.sin(now * 2.3 + phase + 1)), 0.3 + 0.05 * Math.sin(now * 1.9 + phase));
// Pulled up at the end of a run: settling into its stance, the body checked back.
const pullUp = guarded(P(0, 0, 0, -0.12, 0, 0.4, 0, STANCE + 0.05, 0.42, 0.8, 1.1), 0.45);
// Cowering under arrows or shells: down low, weapon or shield up.
const cower = (now: number, phase: number): Pose => guarded(P(0, 0, 0, 0.5 + 0.02 * Math.sin(now * 8 + phase), 0, 0.95, 0, 0.3, 0.75, 1.2, 0.25), 1.05);
// Cheering: weapon raised and shaken, head back.
const cheer = (now: number, phase: number): Pose => guarded(P(0, 0, 0, -0.12, 0.1 * Math.sin(now * 3 + phase), 1.65 + 0.18 * Math.sin(now * 10 + phase), 0, 0.15, 0.05, 0.25 + 0.2 * Math.sin(now * 10 + phase), -0.15), 0.25);

// Blows: wound up, struck (the blow lands as it ends), recovered to the
// ready stance; the feet stay where they are. A thrust: the shoulders
// turned away and the elbow drawn back, then the body turned into it and
// the arm driven out straight, the weapon levelled. From overhead: raised
// high, the body arched back, then brought down with the body bending and
// the knees giving, its point forward.
// (The shield held up as it winds up, swung aside as it strikes.)
const THRUST = { wind: guarded(P(0, 0, 0, -0.18, -0.55, -0.3, 0, STANCE, 0.38, 1.6, 1.35), 0.55), hit: guarded(P(0.04, 0, 0, 0.42, 0.38, 1.0, 0, STANCE, 0.46, 0.02, 1.6), 0.1) };
const OVERHEAD = { wind: guarded(P(0, 0, 0, -0.3, -0.28, 1.8, 0, STANCE, 0.3, 1.1, 1.7), 0.4), hit: guarded(P(0.03, 0, 0, 0.58, 0.16, 0.5, 0, STANCE, 0.5, 0.3, 2.2), 0.05) };
// When a figure's next blow lands at or after `t` (seconds), its exchange
// begun at `from` (where it starts in its round: `beat`): each lands as
// its round is 0.55 through (blows).
export const nextBlow = (t: number, from: number, beat: number): number => {
  const n = Math.ceil((t - from) / BOUT + beat - 0.55);
  return from + (n + 0.55 - beat) * BOUT;
};
// The blows of a figure `sec` seconds into its exchange (a round of BOUT
// seconds; `beat` where it starts in it). Its foe is half a round apart:
// each of its blows lands as this one is winding up, and it flinches.
function blows(sec: number, beat: number, now: number, phase: number): Pose {
  const x = sec / BOUT + beat, n = Math.floor(x), u = frac(x);
  const kind = frac(Math.sin(n * 12.9898 + beat * 78.233) * 43758.5453) < 0.5 ? THRUST : OVERHEAD, rest = ready(now, phase);
  let pose = u < 0.4 ? mix(rest, kind.wind, smooth(u / 0.4)) : u < 0.55 ? mix(kind.wind, kind.hit, 1 - (1 - (u - 0.4) / 0.15) ** 2) : mix(kind.hit, rest, smooth((u - 0.55) / 0.45));
  const f = u < 0.16 ? Math.sin((u / 0.16) * Math.PI) : 0;
  // (The foe's blow landing: the body knocked back and turned at the hips, the knees sagging.)
  // (Shield raised against it, if it has one: the knock taken on the shield.)
  if (f > 0) pose = add(pose, { bend: -0.38 * f, twist: (n % 2 ? 0.32 : -0.32) * f, crouch: 0.07 * f, elbow: 0.4 * f, aim: -0.35 * f, guard: 0.6 * f });
  return pose;
}
// Shooting: drawing (or shouldering) before each shot, loosed (a recoil),
// lowered to reload. A bow is drawn, the string hand back to the cheek; a
// sling (`whirl`) is whirled overhead, then slung; a gun (`kneel`) is fired
// from down low.
// (Between shots: the weapon lowered, a bow's arrow down at the ground before it, a sling hanging.)
const AT_EASE = (whirl: boolean) => ({ ...P(0, 0, 0, 0.06, 0, whirl ? 0.2 : 0.4, 0, 0.3, 0.15, 0.5, whirl ? Math.PI : 0.9) });
function shooting(sec: number, shots: readonly number[], whirl = false, kneel = false, gun = kneel): Pose {
  const low = (p: Pose): Pose => (kneel ? { ...p, crouch: p.crouch + 0.6, bend: p.bend + 0.08, stride: p.stride + 0.2 } : p);
  let pose = low(AT_EASE(whirl));
  for (const ts of shots) {
    const d = sec - ts;
    // (A bow drawn a little above level, for its arrow to arc; a gun levelled, kicking up as it fires.)
    const drawn = whirl ? P(0, 0, 0, -0.08, -0.2, 1.75, 0, 0.35, 0.2, 0.6, sec * 26) : { ...P(0, 0, 0, -0.06, 0.2, 1.0, 0, 0.35, 0.2, 0.15, gun ? 1.55 : 1.35), draw: gun ? 0 : 1 };
    const loosed = whirl ? P(0, 0, 0, 0.3, 0.3, 0.9, 0, 0.45, 0.3, 0.1, 1.6) : P(0, 0, 0, -0.14, 0.14, 0.85, 0, 0.35, 0.2, 0.3, gun ? 1.4 : 1.3);
    if (d > -0.45 && d <= 0) pose = mix(pose, low(drawn), smooth((d + 0.45) / 0.3));
    else if (d > 0 && d < 0.55) pose = mix(low(loosed), low(AT_EASE(whirl)), smooth(d / 0.55));
  }
  return pose;
}
// A horse in a melee: stamping, now and then rearing (on its hind legs,
// its rider striking down from up there).
function prance(pose: Pose, sec: number, beat: number): Pose {
  const rear = Math.max(0, Math.sin(sec * 2.4 + beat * 6.3)) ** 6;
  return { ...pose, lean: -0.42 * rear, rise: 0, walk: 0, stride: 0.3 * Math.sin(sec * 9 + beat * 5) * (1 - rear) + 0.5 * rear };
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
  readonly rear?: boolean; // in the rear rank of a firing line: it fires standing, over the kneeling front rank
}

// A figure's pose now: in a fight (its cue), on the march (`walk`), or at
// ease. (Struck down, it is posed by deathTurn and deathBend.)
// (`whirl`: its weapon whirled before it is loosed, a sling.)
export function poseOf(c: Cue | null, now: number, phase: number, beat: number, walk: number, rides: boolean, whirl = false): Pose {
  const acted = c ? inFight(c, now, phase, beat, whirl) : walk > 0 ? march(now, phase, walk) : idle(now, phase);
  // (On its feet: whatever lean or turn an act asks of the whole figure is the body's above the hips.)
  const pose = { ...acted, lean: 0, yaw: 0, bend: acted.bend + acted.lean * 1.5, twist: acted.twist + acted.yaw };
  // (A rider strikes from the saddle: the horse hardly moves.)
  if (!rides) return pose;
  const rider = { ...P(pose.lunge * 0.4, 0, pose.yaw * 0.5, 0, pose.twist * 0.5, pose.arm, pose.walk, 0, 0, pose.elbow, pose.aim), aimed: pose.aimed, draw: pose.draw };
  const [ex, left] = c ? exchange(c) : [-1, 0];
  return ex >= 0 ? mix(rider, prance(rider, ex, beat), Math.min(ex, left) / BLEND) : rider;
}

// How long a figure has been at it with its foe (seconds), or -1 if it
// isn't; and how long it has left.
function exchange(c: Cue): readonly [number, number] {
  if (!c.engaged || c.sec >= c.dur || c.sec >= c.fall) return [-1, 0];
  const from = c.side === 'attacker' ? (c.play.go[1] + c.delay) * c.dur : c.play.strike[0] * c.dur;
  const to = c.side === 'attacker' ? (c.play.back + c.delay * 0.4) * c.dur : c.play.strike[1] * c.dur;
  return c.sec >= from && c.sec < to ? [c.sec - from, to - c.sec] : [-1, 0];
}
function inFight(c: Cue, now: number, phase: number, beat: number, whirl: boolean): Pose {
  const { sec, dur, play, attack } = c, s = (share: number) => share * dur;
  // Over: the winners cheer, the rest stand easy again.
  if (sec >= dur) {
    const after = sec - dur, done = mix(ready(now, phase), idle(now, phase), after / 0.6);
    return c.won ? mix(done, cheer(now, phase), smooth(after / BLEND) * (after < CHEER ? 1 : 1 - smooth((after - CHEER) / 0.4))) : done;
  }
  const into = mix(idle(now, phase), ready(now, phase), sec / BLEND); // (taking its stance as the fight begins)
  if (c.side === 'attacker' && attack.close) {
    const go0 = s(play.go[0] + c.delay), met = s(play.go[1] + c.delay), back = s(play.back + c.delay * 0.4), run = play.charge > 1 ? 1.4 : 1;
    // (A volley first, if it fires before it goes in: guns levelled.)
    const opening = play.shots.length ? mix(into, shooting(sec, play.shots.map((x) => s(x.t)), whirl, false, play.shots[0]?.kind === 'bullet'), smooth(sec / 0.12)) : into;
    if (sec < go0) return opening;
    if (sec < met) return mix(opening, charging(now, phase, run, ((sec - go0) / (met - go0)) * 1.8 - 0.6), (sec - go0) / BLEND);
    if (sec < back) {
      const fight = c.engaged ? blows(sec - met, beat, now, phase) : ready(now, phase);
      return mix(mix(pullUp, charging(now, phase, run, 1), 1 - (sec - met) / 0.12), fight, (sec - met) / 0.3);
    }
    return mix(blows(back - met, beat, now, phase), march(now, phase, 1), (sec - back) / BLEND);
  }
  if (c.side === 'defender' && attack.close) {
    const met = s(play.strike[0]), part = s(play.strike[1]);
    const shot = play.shots[0];
    let pose = shot ? mix(into, shooting(sec, [s(shot.t)], whirl, shot.kind === 'bullet'), smooth(sec / BLEND)) : into;
    if (c.engaged && sec >= met && sec < part) pose = mix(pose, blows(sec - met, beat, now, phase), (sec - met) / BLEND);
    else if (c.engaged && sec >= part) pose = mix(blows(part - met, beat, now, phase), ready(now, phase), (sec - part) / BLEND);
    return pose;
  }
  if (c.side === 'defender') {
    // Shot at: cowering from the first shot until a little after the last.
    const t0 = s(attack.shots[0]?.t ?? 0.3), t1 = s(attack.shots[attack.shots.length - 1]?.t ?? 0.6) + 0.5;
    const shots = play.shots.map((x) => s(x.t));
    const base = shots.length ? shooting(sec, shots, whirl, play.shots[0]?.kind === 'bullet' && !c.rear, play.shots[0]?.kind === 'bullet') : into;
    // (Rising from its cover to take its own shots: none while it draws, looses and lowers.)
    const firing = Math.max(0, ...shots.map((t) => (sec > t - 0.6 && sec < t + 0.7 ? Math.min(1, (sec - t + 0.6) / 0.2, (t + 0.7 - sec) / 0.2) : 0)));
    return sec < t0 ? mix(into, base, sec / BLEND) : mix(base, cower(now, phase), smooth((sec - t0 + 0.15) / BLEND) * (sec < t1 ? 1 : 1 - smooth((sec - t1) / 0.3)) * (1 - firing));
  }
  // An attacker shooting (or rolling in: machines aren't posed).
  return mix(into, shooting(sec, play.shots.map((x) => s(x.t)), whirl, play.shots[0]?.kind === 'bullet' && !c.rear, play.shots[0]?.kind === 'bullet'), sec / BLEND);
}

// ---- struck down ----

// Which way a figure struck down falls (by its beat): mostly back, away
// from the blow (it faces whoever struck it), else to one side, now and
// then face down: 0 back, 1 face down, 2 left, 3 right.
const wayOf = (beat: number): number => { const r = frac(beat * 7.31); return r < 0.45 ? 0 : r < 0.55 ? 1 : r < 0.775 ? 2 : 3; };
// The turn of a figure struck down `since` seconds ago, about its feet: it
// staggers back, then goes over (faster as it falls): back, face down, or
// to either side (a horse on its side), turned a little, each its own way
// (its beat).
export function deathTurn(q: THREE.Quaternion, since: number, beat: number, rides: boolean): THREE.Quaternion {
  const r1 = frac(beat * 7.31), r2 = frac(beat * 13.7);
  // (A horse stumbles, its forelegs giving and its head going down, then rolls over onto its side.)
  if (rides) {
    const pitch = 0.42 * Math.sin(Math.min(1, since / HORSE_STUMBLE) * Math.PI);
    const f = Math.max(0, Math.min(1, (since - HORSE_STUMBLE * 0.55) / HORSE_ROLL)), over = (FALLEN + 0.1 * r2) * f * f;
    return q.setFromEuler(new THREE.Euler(pitch, (r2 - 0.5) * 0.8 * f, (r1 < 0.5 ? 1 : -1) * over, 'YXZ'));
  }
  const way = wayOf(beat);
  const reel = 0.22 * Math.sin(Math.min(1, since / STAGGER) * Math.PI);
  const f = Math.max(0, Math.min(1, (since - STAGGER * 0.6) / FALL)), over = (FALLEN + 0.14 * r2) * f * f;
  const turn = (r2 - 0.5) * 1.4 * f;
  return q.setFromEuler(way === 0 ? new THREE.Euler(-over - reel, turn, 0, 'YXZ') : way === 1 ? new THREE.Euler(over - reel, turn, 0, 'YXZ')
    : new THREE.Euler(-reel, turn, way === 2 ? over : -over, 'YXZ'));
}
// Its body folding as it falls (back: doubled up; face down: head first,
// its knees giving way; to a side: a little), its arm flung out.
export function deathBend(since: number, beat: number): { readonly bend: number; readonly arm: number; readonly crouch: number; readonly aim: number } {
  const way = wayOf(beat), f = smooth(since / (STAGGER + FALL)), buckle = smooth(since / STAGGER);
  return { bend: (way === 0 ? 0.55 : way === 1 ? 0.35 : 0.2) * f, arm: (way === 1 ? 1.4 : 0.7) * f, crouch: (way === 1 ? 0.8 : 0.3) * buckle, aim: 1.5 * f };
}
// The legs of a figure struck down (the shader's legs, as legsOf): a man's
// still; a horse's thrown about as it stumbles, kicking once it is down,
// then still.
export function deathLegs(since: number, rides: boolean): number {
  if (!rides) return 3;
  const down = HORSE_STUMBLE * 0.55 + HORSE_ROLL;
  if (since < down) return 3 + 0.45 * Math.sin((since / down) * Math.PI);
  return 3 + 0.55 * Math.sin((since - down) * 15) * Math.exp(-(since - down) * 1.6);
}
// A horse leaned back (rearing) turns on its hind hooves, HIND behind its
// middle (figure heights): how far that lifts it and moves it back.
const HIND = 0.42;
export const rearShift = (p: Pose): readonly [number, number] => [-HIND * Math.sin(p.lean), -HIND * (1 - Math.cos(p.lean))];
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

// ---- machines ----

// How a machine sits now (guns, engines, armour; ships): kicked back and
// nosed up by its own shot (`shot`: seconds since it fired), rocking on
// the swell (a ship), jolting over the ground as it rolls (`speed`, figure
// heights a second); struck down (`since`: seconds; or NaN), a wreck,
// burnt black, settled askew (a ship listing and going down). Pitch (nose
// down) and roll about its middle (radians), how far back and down it is
// (figure heights), how charred (0..1).
export interface MachinePose { readonly pitch: number; readonly roll: number; readonly back: number; readonly drop: number; readonly char: number }
export function machinePose(sea: boolean, shot: number, now: number, phase: number, speed: number, since: number): MachinePose {
  const kick = shot < 0 ? 0 : shot < 0.05 ? shot / 0.05 : Math.exp(-(shot - 0.05) * 7);
  const swell = sea ? 1 : 0, jolt = sea ? 0 : Math.min(1, speed / 2);
  let pitch = -(sea ? 0.03 : 0.07) * kick + 0.025 * swell * Math.sin(now * 0.9 + phase) + 0.012 * jolt * Math.sin(now * 23 + phase);
  let roll = 0.05 * swell * Math.sin(now * 0.7 + phase * 1.7) + (sea ? 0.04 * kick : 0) + 0.01 * jolt * Math.sin(now * 17 + phase * 3);
  let drop = 0.03 * swell * Math.sin(now * 1.1 + phase * 0.6), char = 0;
  if (since >= 0) {
    // (Burnt out at once; a ship heels over and settles, then goes down.)
    const f = smooth(since / 0.6), side = frac(phase * 3.1) < 0.5 ? 1 : -1;
    char = f;
    pitch += (sea ? 0.12 : 0.06) * f * (frac(phase * 5.7) - 0.3);
    roll += side * (sea ? 0.4 * smooth(since / 3) : 0.08 * f);
    if (sea) drop += 0.5 * smooth((since - 1) / 6);
  }
  return { pitch, roll, back: (sea ? 0.04 : 0.16) * kick, drop, char };
}
// An engine's throwing arm (a catapult's, a trebuchet's: its strike limb,
// as the shader's armOf takes it), `shot` seconds after it loosed: cocked
// until then, flung over as it looses, a moment up, then winched slowly
// back down.
export const flingOf = (shot: number): number => {
  const k = shot < 0 ? 0 : shot < 0.12 ? (shot / 0.12) ** 2 : shot < 0.45 ? 1 : 1 - smooth((shot - 0.45) / 1.6);
  return 3 + k;
};
// How long a wreck burns where it lies before it sinks away (seconds).
export const WRECK = 10;
