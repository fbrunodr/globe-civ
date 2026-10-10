// The material and instanced geometry shared by every prop (flora and
// buildings): render.ts and the design sheet.

import * as THREE from 'three';
import { GRADE_GLSL } from './terrainMaterial.ts';

// Prop material: per-vertex colors, with the leaf parts (leafMask) taking
// each instance's leaf color (leafTint), times the instance's color.
// `bounce`: light bounced off the ground onto walls (buildings, whose walls
// would otherwise sit dark under a high sun).
export function makePropMaterial(bounce = 0): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float leafMask;
        attribute vec3 leafTint;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz = mix(color.xyz, leafTint, leafMask) * instanceColor.xyz;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${GRADE_GLSL}`)
      .replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * ${bounce.toFixed(3)};
        outgoingLight = grade(outgoingLight, 0.6) * 0.9;
        #include <opaque_fragment>`);
  };
  // Distinct programs per bounce.
  mat.customProgramCacheKey = () => `prop-${bounce}`;
  return mat;
}

// A geometry sharing a prop model's buffers, with its own per-instance leaf colors.
export function instanceGeometry(model: THREE.BufferGeometry, capacity: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(model.attributes)) g.setAttribute(name, attr);
  g.setAttribute('leafTint', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  return g;
}
