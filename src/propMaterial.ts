// The material and instanced geometry shared by every prop (flora and
// buildings): render.ts and the design sheet.

import * as THREE from 'three';
import { GRADE_GLSL } from './terrainMaterial.ts';

// Prop material: per-vertex colors, with the leaf parts (leafMask) taking
// each instance's leaf color (leafTint), times the instance's color.
// `bounce`: light bounced off the ground onto walls (buildings, whose walls
// would otherwise sit dark under a high sun). `saturation`: how much color
// the lit result keeps. `sunDir` (on the globe, the sun's direction, kept up
// to date by the caller): the planet's shadow, worked out instead of looked
// up in the shadow map (props receive no shadow-map shadows, for speed): no
// direct sun where the sun is below a prop's horizon.
export function makePropMaterial(bounce = 0, saturation = 0.6, sunDir?: THREE.Vector3): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  const day = sunDir !== undefined;
  mat.onBeforeCompile = (shader) => {
    if (day) shader.uniforms['uSunDir'] = { value: sunDir };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float leafMask;
        attribute vec3 leafTint;
        varying float vDay;
        ${day ? 'uniform vec3 uSunDir;' : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz = mix(color.xyz, leafTint, leafMask) * instanceColor.xyz;
        #endif
        vDay = 1.0;
        ${day ? `#ifdef USE_INSTANCING
          // The sun's height over this prop's horizon (the globe is centered on the origin).
          vDay = smoothstep(-0.03, 0.08, dot(normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz), uSunDir));
        #endif` : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vDay;
        ${GRADE_GLSL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= vDay;
        reflectedLight.directSpecular *= vDay;`)
      .replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * ${bounce.toFixed(3)} * vDay;
        outgoingLight = grade(outgoingLight, ${saturation.toFixed(3)}) * 0.9;
        #include <opaque_fragment>`);
  };
  // Distinct programs per bounce, saturation and sun.
  mat.customProgramCacheKey = () => `prop-${bounce}-${saturation}-${day}`;
  return mat;
}

// A geometry sharing a prop model's buffers, with its own per-instance leaf colors.
export function instanceGeometry(model: THREE.BufferGeometry, capacity: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(model.attributes)) g.setAttribute(name, attr);
  g.setAttribute('leafTint', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  return g;
}
