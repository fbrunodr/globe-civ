// Reads the motion clips of a Mixamo-rigged FBX (assets/ai, not in git)
// and prints, per clip, the body's angles over time in the terms of our
// poses (src/unitAnim.ts): node scripts/motionClips.mjs <file.fbx> [clip…]
//   bend/twist  the chest (Spine2) against the hips: forward, turned (+: to its left)
//   armF armO   the right upper arm from hanging: raised forward, out to the side (rad)
//   elbow       the right elbow's bend (rad)
//   hand        the right hand from the shoulder (fwd, up, out: body heights)
//   blade       the right hand's grip axis (fwd, up, out), where a held blade points
//   crouch      the hips' drop from standing (body heights); kneeL/R knees' bend (rad)
//   foot        the right foot ahead of the left (body heights)
import fs from 'node:fs';
import * as THREE from 'three';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) };
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');

const [file, ...only] = process.argv.slice(2);
const buf = fs.readFileSync(file);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const bone = (n) => { let b = null; root.traverse((o) => { if (o.isBone && o.name === `mixamorig${n}`) b = o; }); if (!b) throw new Error(n); return b; };
const B = Object.fromEntries(['Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle4', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'HeadTop_End'].map((n) => [n, bone(n)]));
const P = (n) => B[n].getWorldPosition(new THREE.Vector3());
const mixer = new THREE.AnimationMixer(root);
root.updateMatrixWorld(true);
// (Standing height and hips height, from the rest pose.)
const H = P('HeadTop_End').y - Math.min(P('LeftFoot').y, P('RightFoot').y), hips0 = P('Hips').y - Math.min(P('LeftFoot').y, P('RightFoot').y);
const f2 = (x) => (x >= 0 ? ' ' : '') + x.toFixed(2);
for (const clip of root.animations) {
  if (only.length && !only.some((o) => clip.name.toLowerCase().includes(o.toLowerCase()))) continue;
  mixer.stopAllAction();
  const act = mixer.clipAction(clip); act.reset().play();
  console.log(`\n== ${clip.name} (${clip.duration.toFixed(2)} s)`);
  console.log('   t   bend twist  armF  armO elbow   hand(f,u,o)        blade(f,u,o)       crouch kneeL kneeR  foot');
  const n = Math.max(2, Math.round(clip.duration * 12));
  for (let k = 0; k <= n; k++) {
    const t = (clip.duration * k) / n;
    mixer.setTime(t); root.updateMatrixWorld(true);
    // (The body's frame from the hips: forward from the hips' facing, level; up; its left.)
    const hq = B.Hips.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(hq); fwd.y = 0; fwd.normalize();
    const up = new THREE.Vector3(0, 1, 0), left = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const loc = (v) => [v.dot(fwd), v.dot(up), -v.dot(left)]; // (fwd, up, out to its right)
    const cq = B.Spine2.getWorldQuaternion(new THREE.Quaternion());
    const cUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cq), cF = new THREE.Vector3(0, 0, 1).applyQuaternion(cq);
    const bend = Math.atan2(cUp.dot(fwd), cUp.dot(up)), twist = Math.atan2(cF.dot(left), cF.dot(fwd));
    const sh = P('RightArm'), el = P('RightForeArm'), wr = P('RightHand'), tip = P('RightHandMiddle4');
    const ua = loc(el.clone().sub(sh).normalize()), fa = el.clone().sub(sh).normalize(), fb = wr.clone().sub(el).normalize();
    const armF = Math.atan2(ua[0], -ua[1]), armO = Math.asin(Math.max(-1, Math.min(1, ua[2])));
    const elbow = Math.acos(Math.max(-1, Math.min(1, fa.dot(fb))));
    const hand = loc(wr.clone().sub(sh)).map((x) => x / H);
    // (A blade held in the fist: across the palm, square to the fingers, thumb side.)
    const hq2 = B.RightHand.getWorldQuaternion(new THREE.Quaternion());
    const blade = loc(new THREE.Vector3(1, 0, 0).applyQuaternion(hq2));
    const ground = Math.min(P('LeftFoot').y, P('RightFoot').y);
    const crouch = (hips0 - (P('Hips').y - ground)) / H;
    const knee = (a, b, c) => { const u = P(b).sub(P(a)).normalize(), v = P(c).sub(P(b)).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(v)))); };
    const foot = (P('RightFoot').sub(P('LeftFoot')).dot(fwd)) / H;
    console.log(`${t.toFixed(2).padStart(5)} ${f2(bend)} ${f2(twist)} ${f2(armF)} ${f2(armO)} ${f2(elbow)}  ${hand.map(f2).join('')}  ${blade.map(f2).join('')}  ${f2(crouch)} ${f2(knee('LeftUpLeg', 'LeftLeg', 'LeftFoot'))} ${f2(knee('RightUpLeg', 'RightLeg', 'RightFoot'))} ${f2(foot)}`);
  }
}
