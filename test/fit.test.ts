import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FINE_HEAD, PLAIN_HEAD, fineHead, hairShapes, HAIR_STYLE_KEYS } from '../src/people.ts';
import { helmetModel, type Helmet } from '../src/unitModels.ts';
import { hull } from '../src/lowpoly.ts';

// F1: what is worn on the head holds it: no point of either head (the
// plain one, people.ts person; the finer one, finePerson) shows through a
// helmet's shell or through hair. From the head's middle at each point's
// height, out through the point: nothing worn may be met before it.
const HELMETS: Helmet[] = ['crest', 'cone', 'kettle', 'hat', 'feather', 'turban', 'cap', 'beret'];
const heads = {
  plain: hull(PLAIN_HEAD, 5, 0xffffff, { turn: Math.PI / 2 }),
  fine: fineHead(0xffffff),
};
// (A head's middle at a height: its rings' middles, between them.)
const middle = (y: number) => {
  const r = FINE_HEAD, i = Math.max(1, r.findIndex((x) => x.c[1] >= y));
  const a = r[Math.min(i, r.length - 1) - 1]!, b = r[Math.min(i, r.length - 1)]!, t = Math.max(0, Math.min(1, (y - a.c[1]) / (b.c[1] - a.c[1])));
  return new THREE.Vector3(0, y, a.c[2] + (b.c[2] - a.c[2]) * t);
};
function showsThrough(worn: THREE.BufferGeometry[], head: THREE.BufferGeometry): string[] {
  const meshes = worn.map((g) => new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  const pos = head.getAttribute('position'), ray = new THREE.Raycaster(), p = new THREE.Vector3(), bad: string[] = [];
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const o = middle(p.y), d = p.clone().sub(o), len = d.length();
    if (len < 1e-4) continue;
    ray.set(o, d.normalize());
    const hit = ray.intersectObjects(meshes).find((h) => h.distance < len - 1e-4);
    if (hit) bad.push(`(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) behind ${(len - hit.distance).toFixed(4)}`);
  }
  return [...new Set(bad)];
}
describe('F1: helmets and hair hold the head', () => {
  for (const [name, head] of Object.entries(heads)) {
    it(`the ${name} head inside every helmet's shell`, () => {
      for (const h of HELMETS) expect(showsThrough(helmetModel(h).filter((g) => g.userData['shell'] === true), head), `${h}`).toEqual([]);
    });
    // (Hair that wraps the head, a cap; not what hangs from it, set into it: a tail, long hair, a beard.)
    it(`the ${name} head inside every hair style`, () => {
      for (const s of HAIR_STYLE_KEYS) expect(showsThrough(hairShapes(s).filter((g) => g.userData['shell'] === true), head), `${s}`).toEqual([]);
    });
  }
  it("the plain head inside the countryside's five-sided hair", () => {
    for (const s of HAIR_STYLE_KEYS) expect(showsThrough(hairShapes(s, 5).filter((g) => g.userData['shell'] === true), heads.plain), `${s}`).toEqual([]);
  });
});
