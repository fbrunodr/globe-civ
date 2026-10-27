// Trees' shadows, baked: only trees and shrubs cast shadows, and always
// onto the ground. So each model's shadow is worked out once, at load: its
// silhouette (leaf cards cut out to their leaves) thrown onto flat ground
// by a sun SUN_HEIGHT up, into a cell of one atlas. Each tree then draws
// its shadow as one flat quad on the ground under it, turned toward where
// the sun is now (shadowMaterial's vertex shader), sharing the tree's own
// instance data. No shadow map, no second pass: two triangles a tree.

import * as THREE from 'three';
import { CARD_TEXEL, cardTextures } from './propMaterial.ts';

// The atlas: CELLS × CELLS shadows of CELL texels each.
const CELL = 128, CELLS = 8;
// How dark a full shadow is (its alpha over the ground), and its tint.
const STRENGTH = 0.42, TINT = 0x1c2433;
// How far over the ground a shadow lies (world units: clear of the terrain's
// own triangles), and how far toward the camera it is drawn in depth (world
// units: a flat quad on a slope would sink into it; pulled forward, it shows
// over the slope it lies on, still behind hills and trees in front of it).
const LIFT = 0.00012, PULL = 0.003;
// Softness: the blur's radius (atlas texels) at a shadow's foot and at its
// far end (shadows soften with distance from what casts them).
const SOFT_NEAR = 1, SOFT_FAR = 5;
// Each shadow's square in the atlas: its footprint and a margin round it
// (a share of the footprint), wide enough for the blur at its far end.
const MARGIN = 1.25;

// Where a model's shadow lies in its own frame, the sun coming from -x:
// the quad's middle and its half size (model units), and its atlas cell.
interface Baked { cx: number; cz: number; half: number; cell: number }

export class TreeShadows {
  readonly material: THREE.ShaderMaterial;
  private readonly atlas: THREE.WebGLRenderTarget;
  private readonly baked = new Map<string, Baked>();
  private readonly quads = new Map<string, THREE.BufferGeometry>();

  // `models`: each casting model by its kind (as drawn, before each tree's
  // own scale); `sunDir` (kept up to date by the caller): toward the sun.
  constructor(renderer: THREE.WebGLRenderer, models: ReadonlyMap<string, THREE.BufferGeometry>, sunDir: THREE.Vector3, sunHeight: number) {
    if (models.size > CELLS * CELLS) throw new Error(`tree shadows: ${models.size} models, room for ${CELLS * CELLS}`);
    const cot = 1 / Math.tan((sunHeight * Math.PI) / 180);
    this.atlas = new THREE.WebGLRenderTarget(CELL * CELLS, CELL * CELLS, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    // The bake: each vertex thrown onto the ground (y 0) along the sun, seen
    // from straight above, into its cell; the cards cut to their leaves.
    const center = { value: new THREE.Vector2() }, half = { value: 1 };
    const bake = new THREE.ShaderMaterial({
      uniforms: { uCot: { value: cot }, uCenter: center, uHalf: half, ...cardTextures() },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 cardUv;
        uniform float uCot; uniform vec2 uCenter; uniform float uHalf;
        varying vec3 vCard;
        void main() {
          vCard = cardUv;
          vec2 g = vec2(position.x + max(position.y, 0.0) * uCot, position.z);
          gl_Position = vec4((g - uCenter) / uHalf, 0.5, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCard;
        ${CARD_TEXEL}
        void main() {
          if (vCard.z > 0.5 && cardTexel(vCard).a < 0.5) discard;
          gl_FragColor = vec4(1.0);
        }`,
    });
    const scene = new THREE.Scene(), cam = new THREE.Camera();
    // (Cleared once: a clear wipes the whole atlas, not just a cell.)
    const prev = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear };
    renderer.setRenderTarget(this.atlas);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.autoClear = false;
    let cell = 0;
    for (const [kind, geo] of models) {
      // The footprint: every vertex thrown onto the ground, a square round it.
      const pos = geo.getAttribute('position');
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + Math.max(pos.getY(i), 0) * cot, z = pos.getZ(i);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      // (A margin round it, room for the blur: a quad's border must stay clear of its shadow.)
      const b: Baked = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, half: (Math.max(x1 - x0, z1 - z0) / 2) * MARGIN, cell };
      center.value.set(b.cx, b.cz);
      half.value = b.half;
      const mesh = new THREE.Mesh(geo, bake);
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.atlas.viewport.set((cell % CELLS) * CELL, Math.floor(cell / CELLS) * CELL, CELL, CELL);
      renderer.setRenderTarget(this.atlas);
      renderer.render(scene, cam);
      scene.remove(mesh);
      this.baked.set(kind, b);
      cell++;
    }
    this.atlas.viewport.set(0, 0, CELL * CELLS, CELL * CELLS);
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(prev.color, prev.alpha);
    renderer.autoClear = prev.autoClear;
    bake.dispose();

    // The quads: each tree's, laid on the ground at its foot (its instance's
    // place and scale), turned so its shadow falls away from the sun.
    this.material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: this.atlas.texture }, uSunDir: { value: sunDir }, uTint: { value: new THREE.Color(TINT) } },
      // (Drawn in the opaque pass right after the ground and the roads, before
      // anything that stands on them: trees and buildings cover their
      // shadows' pulled-forward edges. render.ts sets the order: SHADOW_ORDER.)
      transparent: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform vec3 uSunDir;
        attribute float along;
        varying vec2 vUv;
        varying float vAlong;
        void main() {
          vUv = uv;
          vAlong = along;
          vec3 o = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sc = length((instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
          vec3 up = normalize(o);
          vec3 t = uSunDir - up * dot(uSunDir, up);
          vec3 away = length(t) > 1e-6 ? -normalize(t) : normalize(cross(up, vec3(0.0, 0.0, 1.0)));
          vec3 side = cross(away, up); // (the model's z, as baked)
          vec3 p = o + (away * position.x + side * position.z) * sc + up * ${LIFT.toFixed(6)};
          vec4 view = viewMatrix * vec4(p, 1.0);
          view.xyz *= max(0.0, 1.0 - ${PULL.toFixed(4)} / length(view.xyz));
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        uniform vec3 uTint;
        varying vec2 vUv;
        varying float vAlong;
        void main() {
          // A blur widening from the foot to the far end: eight taps round a
          // circle, from a blurrier mipmap further out.
          float r = mix(${SOFT_NEAR.toFixed(1)}, ${SOFT_FAR.toFixed(1)}, vAlong) / ${(CELL * CELLS).toFixed(1)};
          float bias = 1.5 * vAlong, a = 0.0;
          for (int i = 0; i < 8; i++) {
            float t = float(i) * 0.785398;
            a += texture2D(uAtlas, vUv + r * vec2(cos(t), sin(t)), bias).a;
          }
          a /= 8.0;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uTint, a * ${STRENGTH.toFixed(3)});
        }`,
    });
  }

  // The quad a model's shadow is drawn on (null for a model with none).
  quad(kind: string): THREE.BufferGeometry | null {
    const b = this.baked.get(kind);
    if (!b) return null;
    let g = this.quads.get(kind);
    if (!g) {
      const u0 = (b.cell % CELLS) / CELLS, v0 = Math.floor(b.cell / CELLS) / CELLS, w = 1 / CELLS;
      // (x along the shadow, away from the sun; z across; the atlas cell's
      // u along x and v along z, as baked.)
      const xs = [b.cx - b.half, b.cx + b.half], zs = [b.cz - b.half, b.cz + b.half];
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([xs[0]!, 0, zs[0]!, xs[1]!, 0, zs[0]!, xs[1]!, 0, zs[1]!, xs[0]!, 0, zs[1]!], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u0 + w, v0, u0 + w, v0 + w, u0, v0 + w], 2));
      // (How far along the shadow from the foot, 0..1, for its softness.)
      const along = (x: number) => Math.max(0, x) / Math.max(1e-9, xs[1]!);
      g.setAttribute('along', new THREE.Float32BufferAttribute([along(xs[0]!), along(xs[1]!), along(xs[1]!), along(xs[0]!)], 1));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      this.quads.set(kind, g);
    }
    return g;
  }
}
