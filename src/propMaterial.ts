// The material and instanced geometry shared by every prop (flora and
// buildings): render.ts and the design sheet.

import * as THREE from 'three';
import { GRADE_GLSL } from './terrainMaterial.ts';

// How far leaves sway in the wind (a share of their height in the model).
const WIND = 0.04;

// The stalks on a crop's card (rural/models.ts, cropTuft): slim tapering
// blades of varied height, darker at the foot (in the crop's shade) and
// lighter at the tip, transparent between them. Made once, in code.
const BLADE_W = 64, BLADE_H = 128, BLADES = 22;
let bladeTex: THREE.DataTexture | null = null;
function bladeTexture(): THREE.DataTexture {
  if (bladeTex) return bladeTex;
  const W = BLADE_W, H = BLADE_H, data = new Uint8Array(W * H * 4).fill(232);
  for (let o = 3; o < data.length; o += 4) data[o] = 0;
  let h = 0xb1ade;
  const rand = () => { h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return (h >>> 8) / 16777216; };
  for (let n = 0; n < BLADES; n++) {
    const x0 = 3 + rand() * (W - 6), top = H * (0.55 + 0.45 * rand()), lean = (rand() - 0.5) * 10, w0 = 1.6 + 1.2 * rand();
    for (let y = 0; y < top; y++) {
      const t = y / top, cx = x0 + lean * t * t, half = w0 * (1 - 0.85 * t);
      const shade = Math.round(255 * (0.6 + 0.4 * Math.min(1, t * 1.4)));
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        if (x < 0 || x >= W) continue;
        const o = (y * W + x) * 4; // (row 0 is v 0, the foot)
        data[o] = data[o + 1] = data[o + 2] = shade;
        data[o + 3] = 255;
      }
    }
  }
  bladeTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  bladeTex.generateMipmaps = true;
  bladeTex.minFilter = THREE.LinearMipmapLinearFilter;
  bladeTex.magFilter = THREE.LinearFilter;
  bladeTex.needsUpdate = true;
  return bladeTex;
}

// The leaves on a leaf card (propCatalog.ts, clumpCards): a cloud of small
// leaves, denser toward the middle, in shades of white (the instance's leaf
// color shows through), transparent between them. Made once, in code.
const LEAF_TEX = 128, LEAVES = 420;
let leafTex: THREE.DataTexture | null = null;
function leafTexture(): THREE.DataTexture {
  if (leafTex) return leafTex;
  // (Between the leaves: transparent, but leaf-colored, so the blurred
  // mipmaps seen from afar don't darken toward black.)
  const N = LEAF_TEX, data = new Uint8Array(N * N * 4).fill(232);
  for (let o = 3; o < data.length; o += 4) data[o] = 0;
  let h = 0x51ea7;
  const rand = () => { h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return (h >>> 8) / 16777216; };
  for (let n = 0; n < LEAVES; n++) {
    const r = 0.46 * N * Math.sqrt(rand()) ** 1.3, t = rand() * Math.PI * 2;
    const cx = N / 2 + r * Math.cos(t), cy = N / 2 + r * Math.sin(t);
    const a = rand() * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const len = 5 + 3 * rand(), wid = 2.6 + 1.4 * rand(), shade = Math.round(255 * (0.88 + 0.12 * rand()));
    for (let y = Math.floor(cy - len); y <= cy + len; y++) for (let x = Math.floor(cx - len); x <= cx + len; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const u = ((x - cx) * ca + (y - cy) * sa) / len, v = (-(x - cx) * sa + (y - cy) * ca) / wid;
      if (u * u + v * v > 1) continue;
      const o = (y * N + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = shade;
      data[o + 3] = 255;
    }
  }
  leafTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  leafTex.generateMipmaps = true;
  leafTex.minFilter = THREE.LinearMipmapLinearFilter;
  leafTex.magFilter = THREE.LinearFilter;
  leafTex.needsUpdate = true;
  return leafTex;
}

// Prop material: per-vertex colors, with the leaf parts (leafMask) taking
// each instance's leaf color (leafTint), times the instance's color.
// `bounce`: light bounced off the ground onto walls (buildings, whose walls
// would otherwise sit dark under a high sun). `saturation`: how much color
// the lit result keeps. `sunDir` (on the globe, the sun's direction, kept up
// to date by the caller): the planet's shadow, worked out instead of looked
// up in the shadow map (props receive no shadow-map shadows, for speed): no
// direct sun where the sun is below a prop's horizon.
//
// `flora` (trees, shrubs, ground cover): smooth shading over the models'
// clump normals (propCatalog.ts: fluffy foliage), crowns darker underneath
// (leafShade), and the leaves stirring in the wind (`time`, seconds, kept
// up to date by the caller). Buildings stay flat-shaded.
// `flora.cropFar` (world units): a farm's crops (cardUv z 2) shrink into
// the ground as they near this distance from the camera, and are gone past
// it (the painted plots go on alone, at no cost).
export function makePropMaterial(bounce = 0, saturation = 0.6, sunDir?: THREE.Vector3, flora?: { time: { value: number }; cropFar?: { value: number } }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: !flora, side: THREE.DoubleSide });
  const day = sunDir !== undefined;
  mat.onBeforeCompile = (shader) => {
    if (day) shader.uniforms['uSunDir'] = { value: sunDir };
    if (flora) { shader.uniforms['uCropFar'] = flora.cropFar ?? { value: 1e9 }; shader.uniforms['uTime'] = flora.time; shader.uniforms['uLeaves'] = { value: leafTexture() }; shader.uniforms['uBlades'] = { value: bladeTexture() }; }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float leafMask;
        attribute float leafShade;
        attribute vec3 leafTint;
        attribute vec3 cardUv;
        varying vec3 vCard;
        varying float vDay;
        ${day ? 'uniform vec3 uSunDir;' : ''}
        ${flora ? 'uniform float uTime; uniform float uCropFar;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCard = cardUv;
        ${flora ? `#ifdef USE_INSTANCING
          // Wind: leaves sway with their height in the model, each prop in its own phase.
          {
            vec3 o = instanceMatrix[3].xyz;
            float ph = dot(o, vec3(4100.0, 3700.0, 2900.0));
            float gust = sin(uTime * 1.7 + ph) + 0.5 * sin(uTime * 2.9 + ph * 1.3);
            transformed.xz += leafMask * transformed.y * ${WIND.toFixed(3)} * gust * vec2(1.0, 0.6);
            if (cardUv.z > 1.5) {
              float far = distance((modelMatrix * vec4(o, 1.0)).xyz, cameraPosition) / uCropFar;
              transformed *= 1.0 - smoothstep(0.6, 1.0, far);
            }
          }
        #endif` : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz = mix(color.xyz, leafTint, leafMask) * instanceColor.xyz * (1.0 - leafShade);
        #endif
        vDay = 1.0;
        ${day ? `#ifdef USE_INSTANCING
          // The sun's height over this prop's horizon (the globe is centered on the origin).
          vDay = smoothstep(-0.03, 0.08, dot(normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz), uSunDir));
        #endif` : ''}`);
    let frag = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vDay;
        varying vec3 vCard;
        ${flora ? 'uniform sampler2D uLeaves; uniform sampler2D uBlades;' : ''}
        ${GRADE_GLSL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= vDay;
        reflectedLight.directSpecular *= vDay;`)
      .replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * ${bounce.toFixed(3)} * vDay;
        outgoingLight = grade(outgoingLight, ${saturation.toFixed(3)}) * 0.9;
        #include <opaque_fragment>`);
    // (A card's two sides share its outward normal, so light never falls
    // into the clump; a flat leaf's (vCard.z -1) share its normal up.)
    if (flora) frag = frag.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (abs(vCard.z) > 0.5) normal *= faceDirection;`);
    if (flora) frag = frag.replace('#include <color_fragment>', `#include <color_fragment>
        // A leaf card: its leaves cut out of it; seen edge-on it thins out
        // and goes (no hard edges); far off, its leaves are kept from
        // fading away in the blurred mipmaps.
        if (vCard.z > 0.5) {
          // (z 2: a crop's stalks, rural/models.ts; else a crown's leaves.)
          vec4 lt = vCard.z > 1.5 ? texture2D(uBlades, vCard.xy) : texture2D(uLeaves, vCard.xy);
          vec2 dx = dFdx(vCard.xy) * ${LEAF_TEX}.0, dy = dFdy(vCard.xy) * ${LEAF_TEX}.0;
          float lod = 0.5 * log2(max(dot(dx, dx), dot(dy, dy)));
          lt.a *= 1.0 + 0.3 * max(lod, 0.0);
          vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          float facing = abs(dot(fn, normalize(vViewPosition)));
          if (lt.a < mix(0.97, 0.5, smoothstep(0.12, 0.4, facing))) discard;
          diffuseColor.rgb *= lt.r;
        }`);
    shader.fragmentShader = frag;
  };
  // Distinct programs per bounce, saturation and sun.
  mat.customProgramCacheKey = () => `prop-${bounce}-${saturation}-${day}-${!!flora}`;
  return mat;
}

// A geometry sharing a prop model's buffers, with its own per-instance leaf colors.
export function instanceGeometry(model: THREE.BufferGeometry, capacity: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(model.attributes)) g.setAttribute(name, attr);
  g.setAttribute('leafTint', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  return g;
}
