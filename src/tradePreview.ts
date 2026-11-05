// Shops and works (dev tool, /trade.html): one style's buildings side by
// side, to draw its shop and works by (styles/trade), textured as the game
// textures them. Columns: its home (variant 1), its two shops (3, 4), its
// works (5); a row per footprint (b22, b23, b33) and height it has.
//   ?style=mediterranean   the style
//   &view=front|game|back  three-quarters from the street (default), from
//                          high up as the game sees a town, or from behind
//   &only=shop|works       just those columns (and the home beside them)
//   &fp=b23&floors=2       just that footprint and height (larger)
// The page sets document.body.dataset.ready once drawn (scripts/tradeShots.mjs).

import * as THREE from 'three';
import { STYLES, STYLE_NAME, styleFloors, type Style } from './architecture.ts';
import { CELL, FOOTPRINT_CELLS, wallHeight, type Footprint } from './town/geometry.ts';
import { houseGeometry, houseKind } from './houses.ts';
import { makePropMaterial, instanceGeometry } from './propMaterial.ts';

const q = new URLSearchParams(location.search);
const style = (STYLES as readonly string[]).includes(q.get('style') ?? '') ? (q.get('style') as Style) : 'mediterranean';
const view = q.get('view') ?? 'front';
const only = q.get('only');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.4));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.position.set(-30, 60, 40);
scene.add(sun);
const mat = makePropMaterial(0.32, 0.6, undefined, undefined, false, undefined, wallHeight(1));

const FPS: readonly Footprint[] = q.get('fp') ? [q.get('fp') as Footprint] : ['b22', 'b23', 'b33'];
const cols = [0, 2, 3, 4].filter((v) => !only || v === 0 || (only === 'shop' ? v === 2 || v === 3 : v === 4));
const floors = styleFloors(style).filter((f) => f !== 12 && (!q.get('floors') || f === Number(q.get('floors'))));
const GAP = 0.02;
let z = 0;
const box = new THREE.Box3();
for (const f of floors) for (const fp of FPS) {
  const [cw, cd] = FOOTPRINT_CELLS[fp], w = cw * CELL, d = cd * CELL;
  let x = 0;
  for (const v of cols) {
    const g = houseGeometry(houseKind(style, fp, f, v));
    const mesh = new THREE.InstancedMesh(instanceGeometry(g, 1), mat, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x + w / 2, 0, z + d / 2));
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(mesh);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w + GAP * 0.8, d + GAP * 0.8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a8a78 }));
    ground.position.set(x + w / 2, -0.0004, z + d / 2);
    scene.add(ground);
    box.expandByPoint(new THREE.Vector3(x, 0, z)).expandByPoint(new THREE.Vector3(x + w, wallHeight(f) * 1.6, z + d));
    x += w + GAP;
  }
  z += d + GAP;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f8a4b }));
floor.position.y = -0.0008;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.001, 50);
const mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
const r = Math.max(size.x, size.z) * 1.05;
// (The street side is +z: each building's front faces it.)
const dir = view === 'game' ? new THREE.Vector3(-0.25, 1.1, 0.75) : view === 'back' ? new THREE.Vector3(0.6, 0.45, -0.9) : new THREE.Vector3(-0.55, 0.42, 0.95);
camera.position.copy(mid).addScaledVector(dir.normalize(), r * 1.2);
camera.lookAt(mid);
renderer.render(scene, camera);
(document.getElementById('cap') as HTMLElement).textContent = `${STYLE_NAME[style]} · ${view} · columns: home, shop, shop, works · rows: ${floors.map((f) => `${f} floor${f > 1 ? 's' : ''}`).join(', ')} × ${FPS.join(', ')}`;
document.body.dataset['ready'] = '1';
