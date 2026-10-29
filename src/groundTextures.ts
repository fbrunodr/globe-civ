import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// Ground materials: small tileable close-up textures of what the ground is
// made of (grass, dry grass, soil, sand, litter, moss, rock, snow). The
// terrain shader (terrainMaterial.ts) lays them over the painting, so the
// ground has the same fine detail as the props on it, and catches the same sun.
//
// One layer per material in a texture array, built offline (npm run
// textures, scripts/groundTextures.ts) from scans (assets/ground, CC0) into
// one compressed file, public/ground/ground.ktx2. Each texel holds
//   r  brightness / 2   (1 = the material's own color; mean 1 over the layer)
//   g  height           (0..1: blends one material into the next)
//   b, a  normal x, y   (0.5 = flat)
// Brightness only: the colors come from the tile (look.ts GroundLook), so
// the same grass is green on a prairie and khaki on a steppe.

export const GROUND_LAYERS = ['grass', 'dry', 'soil', 'sand', 'litter', 'moss', 'rock', 'snow'] as const;
export type GroundLayer = typeof GROUND_LAYERS[number];
export const GROUND_LAYER = Object.fromEntries(GROUND_LAYERS.map((k, i) => [k, i])) as Record<GroundLayer, number>;

export const GROUND_TEX = 512;

// The shader's uniform for the array: a flat stand-in (every material its
// plain color) until the file has loaded (loadGroundTextures), and for good
// where there is no renderer to load it for (tests).
let uniform: { value: THREE.Texture } | null = null;
export function groundUniform(): { value: THREE.Texture } {
  if (uniform) return uniform;
  const L = GROUND_LAYERS.length;
  const flat = new THREE.DataArrayTexture(new Uint8Array(4 * L).fill(128), 1, 1, L);
  flat.needsUpdate = true;
  uniform = { value: flat };
  return uniform;
}

// Loads the array (once) for this renderer, which picks the compressed GPU
// format it can use (the Basis transcoder in public/basis is three's own:
// copy it again from three/examples/jsm/libs/basis when three is updated).
let loading = false;
export function loadGroundTextures(renderer: THREE.WebGLRenderer): void {
  if (loading) return;
  loading = true;
  const base = import.meta.env.BASE_URL;
  const loader = new KTX2Loader().setTranscoderPath(`${base}basis/`).detectSupport(renderer);
  loader.load(`${base}ground/ground.ktx2`, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    groundUniform().value = tex;
    loader.dispose();
  }, undefined, (e: unknown) => console.error('ground textures failed to load', e));
}
