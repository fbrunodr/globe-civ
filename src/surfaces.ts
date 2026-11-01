// Surface textures on the models (buildings and units): each face of a
// model says which layer of the texture array (surfaceLayers.ts) it wears
// and where it lies in it, worked out once when the model is built:
//
//   aTex  (u, v, layer, w): u, v in the layer's repeats; the layer (0: none);
//         w the model's own (units: how far a weapon points as made).
//
// A face's u runs level along it and its v up it (on a roof, up the slope;
// on a flat top, north), in the layer's repeats: so brick courses and roof
// tiles lie level, thatch and planks run as they would, and the pattern
// carries on from one face of a wall to the next. Which layer a face wears
// is the builder's to say (`pick`: from its colour and how it faces, the
// model's own rules); a head's front is drawn as a face (faceSurface).
// The shader multiplies the face's colour by the texel's brightness
// (SURFACE_GLSL): the colours stay the models' own.

import * as THREE from 'three';
import { FACE_BOX, SURFACE_LAYERS, SURFACE_TEX, SURF, type Surf } from './surfaceLayers.ts';

export { SURF, type Surf };

// (aTex.z as built: AUTO for a face whose layer is still to pick; a layer
// plus DONE for one already mapped (a head's face).)
const AUTO = -1, DONE = 64;

// A model's aTex, all faces still to pick, or all to wear `layer` (w as given).
export function autoSurface(g: THREE.BufferGeometry, w = 0, layer?: Surf): THREE.BufferAttribute {
  const n = g.getAttribute('position').count, a = new Float32Array(n * 4), z = layer === undefined ? AUTO : SURF[layer];
  for (let i = 0; i < n; i++) a.set([0, 0, z, w], i * 4);
  const attr = new THREE.BufferAttribute(a, 4);
  g.setAttribute('aTex', attr);
  return attr;
}

// A head (non-indexed): its front faces drawn as a face (the layer's
// features over the front, FACE_BOX: placed by the head's own extent, so
// the head may be moved after), the rest bare skin.
export function faceSurface(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position'), tex = autoSurface(g);
  g.computeBoundingBox();
  const box = g.boundingBox!, cx = (box.min.x + box.max.x) / 2;
  // (The chin, the lowest point, stands 0.007 over the box's foot.)
  const bottom = box.min.y - 0.007, H = FACE_BOX.top - FACE_BOX.bottom;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const nz = b.clone().sub(a).cross(c.clone().sub(a)).normalize().z;
    for (let k = i; k < i + 3; k++) {
      if (nz > 0.2) tex.setXYZ(k, 0.5 + (pos.getX(k) - cx) / (2 * FACE_BOX.half), (pos.getY(k) - bottom) / H, DONE + SURF.face);
      else tex.setXYZ(k, 0, 0, SURF.skin);
    }
  }
}

// What a face is, for a builder's pick: its colour (sRGB: hue 0..360,
// saturation and lightness 0..1, as the palettes are written), its normal
// and its middle (model units), its first vertex.
export interface FaceInfo { readonly h: number; readonly s: number; readonly l: number; readonly n: THREE.Vector3; readonly mid: THREE.Vector3; readonly i: number }
export type Pick = (f: FaceInfo) => Surf;

// Maps a merged model's faces (non-indexed; aTex already there, or made):
// each face still to pick picked, every face placed in its layer.
// `unitsPerMetre`: the model's scale; `zoom`: how much larger than life the
// patterns are drawn (a miniature's are, to be seen at all).
export function mapSurfaces(g: THREE.BufferGeometry, unitsPerMetre: number, zoom: number, pick: Pick): void {
  const pos = g.getAttribute('position'), col = g.getAttribute('color');
  const tex = (g.getAttribute('aTex') as THREE.BufferAttribute | undefined) ?? autoSurface(g);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3();
  const t = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), bt = new THREE.Vector3(), color = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const z = tex.getZ(i);
    if (z >= DONE) { for (let k = i; k < i + 3; k++) tex.setZ(k, tex.getZ(k) - DONE); continue; }
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.copy(b).sub(a).cross(t.copy(c).sub(a));
    if (n.lengthSq() < 1e-20) { for (let k = i; k < i + 3; k++) tex.setXYZ(k, 0, 0, 0); continue; }
    n.normalize();
    let layer = z;
    if (layer < 0) {
      color.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.LinearSRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
      mid.copy(a).add(b).add(c).divideScalar(3);
      layer = SURF[pick({ h: hsl.h * 360, s: hsl.s, l: hsl.l, n, mid, i })];
    }
    // (Level along the face, and up it; a flat face: east and north.)
    if (Math.abs(n.y) > 0.97) { t.set(1, 0, 0); bt.set(0, 0, -Math.sign(n.y)); }
    else { t.crossVectors(up, n).normalize(); bt.crossVectors(n, t); }
    const k0 = 1 / (unitsPerMetre * zoom * SURFACE_LAYERS[layer]!.metres);
    for (let k = i; k < i + 3; k++) {
      const p = k === i ? a : k === i + 1 ? b : c;
      tex.setXYZ(k, p.dot(t) * k0, p.dot(bt) * k0, layer);
    }
  }
  tex.needsUpdate = true;
}

// ---------- buildings ----------

// The materials of a building's style: what its plain walls are built of
// (masonry: the light or grey walls; red ones are brick, brown ones wood,
// whatever the style), and its roofs, if one material (else told from
// their colour).
export interface BuildingSurfaces { readonly masonry?: Surf; readonly roof?: Surf; readonly flat?: Surf }

// (Leaves, lawns and glass: no texture.)
const greenery = (f: FaceInfo) => f.h > 70 && f.h < 175 && f.s > 0.18;
const glassy = (f: FaceInfo) => f.h > 180 && f.h < 260 && f.s > 0.25;
const reddish = (f: FaceInfo) => (f.h < 28 || f.h > 340) && f.s > 0.3;
const woody = (f: FaceInfo) => f.h >= 14 && f.h < 48 && f.s > 0.2 && f.s < 0.7 && f.l < 0.45;

// A building's faces: walls (upright), roofs (sloped), flat tops and the
// ground about it (yards, paths), each by its colour.
export const buildingPick = (st: BuildingSurfaces = {}): Pick => (f) => {
  if (greenery(f) || f.l < 0.17 || f.n.y < -0.5) return 'none';
  if (f.n.y > 0.97) {
    // (The ground: a yard's paving; a flat roof, or a terrace.)
    if (f.mid.y < 0.0015) return f.s < 0.25 && f.l > 0.3 ? 'cobbles' : 'none';
    if (woody(f)) return 'planks';
    return st.flat ?? (f.s < 0.08 && f.l < 0.7 ? 'concrete' : 'plaster');
  }
  if (f.n.y > 0.25) {
    if (glassy(f)) return 'none';
    if (st.roof) return st.roof;
    if (reddish(f) || (f.h < 40 && f.s > 0.45)) return 'clayTile';
    if (f.h >= 30 && f.h < 65 && f.s > 0.2 && f.l > 0.3) return 'thatch';
    if (woody(f)) return 'shingle';
    return f.s < 0.15 && f.l > 0.55 ? 'concrete' : 'slate';
  }
  if (glassy(f) || f.l < 0.2) return 'none';
  // (A dark red-brown is a door or timber, not brick.)
  if (woody(f) && f.l < 0.33) return 'siding';
  if (reddish(f) && f.l < 0.62) return 'brick';
  if (woody(f)) return 'siding';
  return st.masonry ?? (f.s < 0.1 && f.l < 0.55 ? 'ashlar' : 'plaster');
};

// Buildings: their models are in tile steps, a door about 0.009 (2.2 m).
export const BUILDING_SCALE = 0.004, BUILDING_ZOOM = 2.6;

// ---------- the texture ----------

// The shader's uniforms for the array: a flat stand-in until the file has
// loaded (and for good where there is none: tests). `crisp`: magnified
// texel by texel (the units, as a PS1 drew them), else smoothly (buildings).
const L = SURFACE_LAYERS.length, N = SURFACE_TEX;
const uniforms = new Map<boolean, { value: THREE.Texture }>();
let pixels: Uint8Array | null = null;
const toArray = (data: Uint8Array, crisp: boolean, size: number) => {
  const tex = new THREE.DataArrayTexture(data, size, size, L);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = crisp ? THREE.NearestFilter : THREE.LinearFilter;
  tex.generateMipmaps = size > 1;
  tex.anisotropy = crisp ? 1 : 4;
  tex.needsUpdate = true;
  return tex;
};
export function surfaceUniform(crisp: boolean): { value: THREE.Texture } {
  let u = uniforms.get(crisp);
  if (u) return u;
  u = { value: pixels ? toArray(pixels, crisp, N) : toArray(new Uint8Array(4 * L).fill(128), crisp, 1) };
  uniforms.set(crisp, u);
  if (!pixels) loadSurfaces();
  return u;
}

// Loads public/surfaces/surfaces.png (once): its layers stacked top to
// bottom, each with its rows running down (the array's run up).
let loading = false;
function loadSurfaces(): void {
  if (loading || typeof document === 'undefined') return;
  loading = true;
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N * L;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const src = ctx.getImageData(0, 0, N, N * L).data, out = new Uint8Array(N * N * L * 4);
    for (let l = 0; l < L; l++) for (let y = 0; y < N; y++) out.set(src.subarray(((l * N) + N - 1 - y) * N * 4, ((l * N) + N - y) * N * 4), (l * N + y) * N * 4);
    pixels = out;
    for (const [crisp, u] of uniforms) { u.value.dispose(); u.value = toArray(out, crisp, N); }
  };
  img.onerror = (e) => console.error('surface textures failed to load', e);
  img.src = `${import.meta.env.BASE_URL}surfaces/surfaces.png`;
}

// The shader's side: the vertex shader passes aTex on (SURFACE_VERTEX, in
// its main), the fragment shader darkens or lightens the colour by the
// texel (surfaceDetail(), with SURFACE_FRAGMENT declared).
export const SURFACE_VERTEX_DECL = `attribute vec4 aTex; varying vec3 vTex;`;
export const SURFACE_VERTEX = `vTex = aTex.xyz;`;
export const SURFACE_FRAGMENT = `
  uniform highp sampler2DArray uSurfaces;
  varying vec3 vTex;
  float surfaceDetail() {
    if (vTex.z < 0.5) return 1.0;
    return 2.0 * texture(uSurfaces, vec3(vTex.xy, floor(vTex.z + 0.5))).r;
  }`;
