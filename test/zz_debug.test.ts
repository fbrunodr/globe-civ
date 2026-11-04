import { it } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../src/world.ts';
import { buildPaintData, fanCoords, fanFrames, paintAt, warpAt, FAN_COORDS } from '../src/paint.ts';
import { riverCurve } from '../src/riverCurve.ts';
import { locate } from '../src/terrainMesh.ts';
it('d', () => {
  for (const [size, seed, ri, js] of [['medium', 4, 3, [43]], ['medium', 4, 7, [18, 69]], ['large', 6, 0, [17]], ['large', 6, 21, [71]]] as const) {
  const w = generateWorld(size, seed); const paint = buildPaintData(w.globe, w.map, seed); const frames = fanFrames(w.globe);
  const r0 = paint.params.r0, co = new Float32Array(FAN_COORDS);
  const owner = (d: THREE.Vector3) => { const l = locate(w.globe, d); const fanId = paint.fanStart[l.t] + l.i, fan = paint.fans[fanId];
    fanCoords(frames[fanId], fan, warpAt(paint.params, d.x, d.y, d.z), d.x, d.y, d.z, co); const pw = paintAt(paint, fanId, co).w; let o = 0; for (let c = 1; c < 4; c++) if (pw[c] > pw[o]) o = c; return fan.ids[o]; };
  const pts = riverCurve(w.globe, paint, w.map.rivers[ri]!);
  for (const j of js) { const a = pts[j]!.dir, b = pts[j + 1]!.dir, p = a.clone().add(b).normalize(); const ac = p.clone().cross(b.clone().sub(a)).normalize();
    const os = [-0.08, -0.05, -0.03, -0.01, 0.01, 0.03, 0.05, 0.08].map((x) => owner(p.clone().addScaledVector(ac, x * r0).normalize()));
    const t1 = a.clone().sub(pts[j - 1]!.dir), t2 = b.clone().sub(a), t3 = pts[j + 2]!.dir.clone().sub(b);
    const ang = (u: THREE.Vector3, v: THREE.Vector3) => (Math.acos(Math.min(1, u.dot(v) / (u.length() * v.length()))) * 180 / Math.PI).toFixed(0);
    process.stdout.write(`${size}${seed} r${ri} s${j} e${pts[j]!.edge}/${pts[j + 1]!.edge} len ${(a.distanceTo(b) / r0).toFixed(3)} turns ${ang(t1, t2)} ${ang(t2, t3)} owners ${os.join(',')}\n`); }
  }
});
