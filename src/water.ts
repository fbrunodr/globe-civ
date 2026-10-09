import * as THREE from 'three';
import { GRADE_GLSL, NOISE_GLSL, noiseTexture } from './terrainMaterial.ts';

// The water surface: a translucent sheet at the water level over the carved
// ground (the trick of old console games: a see-through, gently moving
// layer over a visible bed). Everything comes from the water's depth, which
// each vertex carries (water level minus ground height; linear across a
// triangle, like both surfaces):
//   - color: light and clear in the shallows, the body's deep color further out;
//   - transparency: the bed shows through shallow water and fades with depth;
//   - foam: a line where the water meets the ground, plus bands rolling in
//     toward the shore;
//   - ripples and the sun's glints, rivers' ripples drifting downstream;
//   - the sky's reflection at grazing angles (Fresnel).
//
// Per-vertex attributes:
//   depth       water level minus ground height
//   tint        deep color (rgb) and murk (a: 1 = clear sea, higher = murkier)
//   flow        downstream direction × speed (rivers), else 0
//   ring        hex grid line, as on the ground
//   unexplored  fog of war: the water is hidden
//   dim         seen before but not in sight now: grayed like the ground

export interface WaterMaterial {
  material: THREE.MeshPhysicalMaterial;
  setTime(seconds: number): void;
  setGrid(on: boolean): void;
  setView(mode: number): void; // 2 = debug water view: color by source, steps in red
}

export const SKY_COLOR = new THREE.Color(0.62, 0.76, 0.92);

export function makeWaterMaterial(): WaterMaterial {
  // A dim specular: a small sun glint, not a blinding disc.
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.1, metalness: 0, specularIntensity: 0.2, transparent: true, depthWrite: false });
  const uTime = { value: 0 };
  const uGrid = { value: 0 };
  const uView = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uTime;
    shader.uniforms['uNoise'] = { value: noiseTexture() };
    shader.uniforms['uSky'] = { value: SKY_COLOR };
    shader.uniforms['uGrid'] = uGrid;
    shader.uniforms['uView'] = uView;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float depth;
        attribute vec4 tint;
        attribute vec3 flow;
        attribute float ring;
        attribute float unexplored;
        attribute float dim;
        attribute float wsrc;
        attribute float wstep;
        varying float vSrc;
        varying float vStep;
        varying float vDepth;
        varying vec4 vTint;
        varying vec3 vFlow;
        varying float vRing;
        varying float vFog;
        varying float vDim;
        varying vec3 vObjPos;`)
      // The surface is level: its normal points straight up, away from the center.
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(position);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSrc = wsrc; vStep = wstep;
        vDepth = depth; vTint = tint; vFlow = flow; vRing = ring; vFog = unexplored; vDim = dim;
        vObjPos = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform highp sampler3D uNoise;
        uniform vec3 uSky;
        uniform float uGrid;
        uniform float uView;
        varying float vSrc;
        varying float vStep;
        varying float vDepth;
        varying vec4 vTint;
        varying vec3 vFlow;
        varying float vRing;
        varying float vFog;
        varying float vDim;
        varying vec3 vObjPos;
        float tLod;
        float foam;
        ${NOISE_GLSL}
        ${GRADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // Under the ground (past the waterline): the ground hides it anyway.
          if (vDepth < 0.0) discard;
          vec3 P = vObjPos;
          tLod = length(fwidth(P));
          float d = vDepth;
          float murk = vTint.a;
          vec3 deep = vTint.rgb;
          // Open water (murk ~1) rolls waves onto its shores; rivers and pools
          // are calmer.
          float open = clamp(1.6 / murk - 0.3, 0.0, 1.0);
          vec3 shallow = mix(deep, vec3(0.1, 0.45, 0.48), 0.65 * clamp(1.3 / murk, 0.0, 1.0));
          float k = d * murk;
          vec3 col = mix(shallow, deep, 1.0 - exp(-k / 0.0012));
          float alpha = mix(0.72, 0.97, 1.0 - exp(-k / 0.0015));

          // Rivers: ripples drifting downstream (two phases, so the pattern
          // never stretches).
          float streak = 0.0;
          float speed = length(vFlow);
          if (speed > 0.02) {
            float ph = uTime * 0.22;
            float t0 = fract(ph), t1 = fract(ph + 0.5);
            float n0 = tNoise((P - vFlow * t0 * 0.0022) * 1500.0);
            float n1 = tNoise((P - vFlow * t1 * 0.0022) * 1500.0 + 17.0);
            float n = mix(n0, n1, abs(2.0 * t0 - 1.0));
            streak = smoothstep(0.6, 0.82, n) * min(1.0, speed) * tFade(1500.0);
          }

          // Foam: a line at the waterline and bands rolling in toward it.
          float shoreW = 0.00045;
          float zone = 1.0 - smoothstep(0.0, shoreW, d);
          float line = 1.0 - smoothstep(0.0, 0.00006, d);
          float waves = sin(d / shoreW * 9.0 - uTime * 1.3 + tNoise(P * 300.0) * 6.0);
          float broken = 0.45 + 0.55 * tNoise(P * 900.0 + vec3(uTime * 0.08, 0.0, -uTime * 0.06));
          foam = max(line * mix(0.35, 0.85, open), zone * smoothstep(0.55, 0.95, waves) * broken * 0.65 * open * tFade(300.0));
          foam = max(foam, streak * 0.3);
          col = mix(col, vec3(0.93, 0.97, 1.0), foam);
          alpha = max(alpha, foam);

          // Hex grid, drawn on the surface where the ground's would be hidden.
          float fw = fwidth(vRing);
          float grid = (1.0 - smoothstep(0.0, fw * 1.5, 1.0 - vRing)) * (1.0 - smoothstep(0.05, 0.16, fw));
          col *= 1.0 - 0.15 * grid * uGrid;

          // Remembered but not in sight: grayed and darker, like the ground.
          col = mix(col, vec3(dot(col, vec3(0.333))), 0.6 * vDim) * (1.0 - 0.5 * vDim);
          diffuseColor = vec4(col, alpha);
          // Debug water view: blue = sea or lake, teal = river, magenta =
          // wetland pool; red where the surface steps (faster than a river may fall).
          if (uView > 1.5) {
            vec3 sc = vSrc < 0.5 ? vec3(0.15, 0.4, 1.0) : vSrc < 1.5 ? vec3(0.1, 0.85, 0.7) : vec3(0.9, 0.3, 0.9);
            diffuseColor = vec4(mix(sc, vec3(1.0, 0.0, 0.0), smoothstep(0.8, 1.2, vStep)), 0.9);
            foam = 0.0;
          }
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.14, 0.6, foam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Ripples: two layers of drifting noise.
          vec3 P = vObjPos;
          float h = 0.00002 * (tNoise(P * 650.0 + vec3(uTime * 0.05, uTime * 0.03, -uTime * 0.04)) - 0.5) * tFade(650.0)
                  + 0.00001 * (tNoise(P * 1600.0 - vec3(uTime * 0.09, -uTime * 0.05, uTime * 0.07)) - 0.5) * tFade(1600.0);
          normal = tPerturb(-vViewPosition, normal, h);
        }`)
      .replace('#include <opaque_fragment>', `{
          // The sky's reflection, strong at grazing angles.
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0) * (1.0 - foam);
          outgoingLight = grade(mix(outgoingLight, uSky * 0.8, fres * 0.25), 0.85);
          diffuseColor.a = max(diffuseColor.a, fres * 0.6) * (1.0 - vFog);
        }
        #include <opaque_fragment>`);
  };
  return { material: mat, setTime: (s) => { uTime.value = s; }, setGrid: (on) => { uGrid.value = on ? 1 : 0; }, setView: (m) => { uView.value = m; } };
}
