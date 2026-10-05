import * as THREE from 'three';

// Walk mode: explore the surface in first person, at the size of a small
// character (a tree is a few times taller than you).
//
//   W A S D / arrows   walk (Shift = run)
//   mouse              look (click the view to capture the mouse; drag also works)
//   V or Esc           back to the map
//
// The character stands on the ground, or wades on the water surface where
// that is higher (no swimming under).

const EYE = 0.0011;   // eye height above the ground
const WALK = 0.0035;  // speed, globe radii per second
const RUN = 4;        // Shift multiplier
const LOOK = 0.0022;  // radians per pixel of mouse movement
const MAX_PITCH = 1.35;
const KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);

export class WalkCamera {
  active = false;
  private readonly pos = new THREE.Vector3(0, 0, 1); // unit direction under the character
  private readonly heading = new THREE.Vector3(0, 1, 0); // unit tangent: where the body faces
  private pitch = 0;
  private eye = 1 + EYE; // eased eye radius
  private readonly keys = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  private changed = true;

  // surface(dir): ground and water radius at a direction.
  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly canvas: HTMLCanvasElement,
    private readonly surface: (dir: THREE.Vector3) => { ground: number; water: number }, signal: AbortSignal) {
    const opts = { signal };
    addEventListener('keydown', (e) => {
      if (!this.active || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (KEYS.has(k)) { this.keys.add(k); e.preventDefault(); }
    }, opts);
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), opts);
    addEventListener('blur', () => this.keys.clear(), opts);
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      if (document.pointerLockElement !== canvas) {
        this.drag = { x: e.clientX, y: e.clientY };
        canvas.requestPointerLock?.()?.catch?.(() => {});
      }
    }, opts);
    canvas.addEventListener('pointerup', () => { this.drag = null; }, opts);
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (document.pointerLockElement === canvas) this.look(e.movementX, e.movementY);
      else if (this.drag) {
        this.look(e.clientX - this.drag.x, e.clientY - this.drag.y);
        this.drag = { x: e.clientX, y: e.clientY };
      }
    }, opts);
  }

  // Start walking at dir, facing forward (a tangent there).
  enter(dir: THREE.Vector3, forward: THREE.Vector3): void {
    this.active = true;
    this.pos.copy(dir).normalize();
    this.heading.copy(forward).addScaledVector(this.pos, -forward.dot(this.pos)).normalize();
    this.pitch = -0.08;
    this.eye = this.standing() + EYE;
    this.keys.clear();
    this.changed = true;
    this.apply();
  }

  exit(): void {
    this.active = false;
    this.keys.clear();
    this.drag = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  get position(): THREE.Vector3 { return this.pos; }
  get facing(): THREE.Vector3 { return this.heading; }

  // Advances the walk; true when the view moved.
  update(dt: number): boolean {
    const key = (k: string) => (this.keys.has(k) ? 1 : 0);
    const fwd = key('w') + key('arrowup') - key('s') - key('arrowdown');
    const side = key('d') + key('arrowright') - key('a') - key('arrowleft');
    if (fwd !== 0 || side !== 0) {
      const step = WALK * (this.keys.has('shift') ? RUN : 1) * dt / Math.hypot(fwd, side);
      const right = this.heading.clone().cross(this.pos);
      this.pos.addScaledVector(this.heading, fwd * step).addScaledVector(right, side * step).normalize();
      // Keep the heading tangent (parallel transport).
      this.heading.addScaledVector(this.pos, -this.heading.dot(this.pos)).normalize();
      this.changed = true;
    }
    // The eye follows the ground smoothly (steps up faster than down).
    const target = this.standing() + EYE;
    if (Math.abs(target - this.eye) > 1e-7) {
      const rate = target > this.eye ? 14 : 7;
      this.eye += (target - this.eye) * (1 - Math.exp(-dt * rate));
      this.changed = true;
    }
    if (!this.changed) return false;
    this.changed = false;
    this.apply();
    return true;
  }

  private standing(): number {
    const s = this.surface(this.pos);
    return Math.max(s.ground, s.water);
  }

  private look(dx: number, dy: number): void {
    this.heading.applyAxisAngle(this.pos, -dx * LOOK);
    this.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, this.pitch - dy * LOOK));
    this.changed = true;
  }

  private apply(): void {
    const eyePos = this.pos.clone().multiplyScalar(this.eye);
    const view = this.heading.clone().multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.pos, Math.sin(this.pitch));
    this.camera.position.copy(eyePos);
    this.camera.up.copy(this.pos);
    this.camera.lookAt(eyePos.add(view));
  }
}

// The sky seen from near the ground: a gradient from a pale horizon to a
// deeper blue overhead, with a glow around the sun. It fades in as the
// camera comes down (space stays black from orbit). Drawn first, behind
// everything (first among the opaque objects, without depth), on a sphere
// that follows the camera; it blends toward space itself, so it needs no
// transparency.
export function makeSky(): { mesh: THREE.Mesh; update(camera: THREE.Camera, sunDir: THREE.Vector3, amount: number): void } {
  const uniforms = {
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uAmount: { value: 0 },
    uSpace: { value: new THREE.Color(0x04050a) },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uUp;
        uniform vec3 uSun;
        uniform float uAmount;
        uniform vec3 uSpace;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = dot(d, uUp);
          vec3 horizon = vec3(0.74, 0.83, 0.93), zenith = vec3(0.28, 0.5, 0.86);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
          col = mix(col, vec3(0.55, 0.62, 0.7), smoothstep(0.0, -0.35, h));
          float s = max(dot(d, uSun), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(mix(uSpace, col, uAmount), 1.0);
        }`,
    }),
  );
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(camera, sunDir, amount) {
      mesh.position.copy(camera.position);
      uniforms.uUp.value.copy(camera.position).normalize();
      uniforms.uSun.value.copy(sunDir);
      uniforms.uAmount.value = amount;
      mesh.visible = amount > 0.001;
    },
  };
}

export const HAZE = new THREE.Color(0.74, 0.83, 0.93);
