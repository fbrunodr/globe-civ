import * as THREE from 'three';

// Smoke and fire (design doc "Cities: Feel & Play", war and life): columns
// of puffs rising from damaged or burning cities, pillaged fields and forge
// chimneys. One point cloud; each puff loops along its column in the vertex
// shader, so animating it costs nothing on the CPU.

export type SmokeKind = 'smoke' | 'fire' | 'chimney';
export interface Emitter {
  pos: THREE.Vector3; // on the ground (or a chimney top)
  kind: SmokeKind;
}

const PUFFS: Record<SmokeKind, number> = { smoke: 12, fire: 6, chimney: 6 };
const KIND_CODE: Record<SmokeKind, number> = { smoke: 0, fire: 1, chimney: 2 };

export interface Smoke {
  points: THREE.Points;
  set(emitters: readonly Emitter[]): void;
  update(seconds: number, pxPerUnit: number): void;
}

// `scale`: world size of a tile relative to the reference tile.
export function makeSmoke(scale: number): Smoke {
  const uTime = { value: 0 }, uPx = { value: 800 }, uScale = { value: scale };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uPx, uScale },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 seed; // phase, kind (0 smoke, 1 fire, 2 chimney)
      uniform float uTime, uPx, uScale;
      varying float vT;
      varying float vKind;
      void main() {
        float fire = step(0.5, seed.y) * step(seed.y, 1.5), chimney = step(1.5, seed.y);
        float speed = mix(mix(0.22, 1.4, fire), 0.3, chimney);
        float t = fract(uTime * speed * (0.8 + 0.4 * fract(seed.x * 7.3)) + seed.x);
        vec3 up = normalize(position);
        vec3 side = normalize(cross(up, vec3(0.3, 1.0, 0.2)));
        float rise = mix(mix(0.02, 0.004, fire), 0.012, chimney) * uScale;
        vec3 p = position + up * (t * rise) + side * (sin(seed.x * 40.0 + t * 3.0) * 0.0012 + t * 0.005 * (1.0 - fire)) * uScale;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(mix(0.003 + 0.008 * t, 0.0028 * (1.0 - 0.5 * t), fire), 0.0012 + 0.004 * t, chimney) * uScale;
        gl_PointSize = size * uPx / -mv.z;
        vT = t;
        vKind = seed.y;
      }`,
    fragmentShader: /* glsl */ `
      varying float vT;
      varying float vKind;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        if (r > 0.5) discard;
        float soft = smoothstep(0.5, 0.1, r);
        vec3 c; float a;
        if (vKind > 0.5 && vKind < 1.5) { c = mix(vec3(1.0, 0.82, 0.4), vec3(0.85, 0.25, 0.05), vT); a = soft * (1.0 - vT); }
        else if (vKind > 1.5) { c = vec3(0.78, 0.77, 0.75); a = soft * (1.0 - vT) * 0.35; }
        else { c = mix(vec3(0.16, 0.15, 0.14), vec3(0.45, 0.44, 0.42), vT); a = soft * (1.0 - vT) * 0.6; }
        gl_FragColor = vec4(c, a);
      }`,
  });
  const geo = new THREE.BufferGeometry();
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return {
    points,
    set(emitters) {
      const pos: number[] = [], seed: number[] = [];
      emitters.forEach((e, ei) => {
        const n = PUFFS[e.kind];
        for (let i = 0; i < n; i++) {
          pos.push(e.pos.x, e.pos.y, e.pos.z);
          seed.push(i / n + 0.137 * ei, KIND_CODE[e.kind]);
        }
      });
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 2));
      geo.computeBoundingSphere();
    },
    update(seconds, pxPerUnit) {
      uTime.value = seconds;
      uPx.value = pxPerUnit;
    },
  };
}
