import * as THREE from 'three';

// Globe camera with zoom-dependent tilt, in the style of Google Earth or
// Civ VI: far away it looks straight down at the globe with north up; as it
// comes closer it tilts toward the horizon, so the terrain and props are
// seen from the side. Up close the view is free: rotate and tilt it with a
// right (or middle) drag, or Q / E. Zooming out locks it back to straight
// down, and north drifts back to the top.
//
//   left drag      move across the globe
//   right drag     rotate (sideways) and tilt (up / down)
//   wheel          zoom, toward the cursor
//   W A S D        move (also the arrow keys; Shift = faster)
//   Q / E          rotate
//   T / G          tilt toward the horizon / back down (F is taken: fortify)
//   Z / X          zoom in / out

// Distances are from the camera to the point it looks at (globe radius 1).
const MIN_DIST = 0.07;
const MAX_DIST = 4;
const DEG = Math.PI / 180;
// Automatic tilt: AUTO_TILT at NEAR, easing to straight down at FAR.
const AUTO_TILT = 55 * DEG;
const NEAR = 0.06;
const FAR = 0.7;
// The user may tilt further, up to MAX_TILT up close, nothing beyond LOCK.
const MAX_TILT = 70 * DEG;
const LOCK = 1.0;
const CAMERA_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', 't', 'g', 'z', 'x', 'shift']);
const EASE = 10; // per second: how fast the view follows input
const GROUND = 1.008; // sphere used for cursor hits
const CLEARANCE = 0.015; // the camera stays this far above the terrain below it

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface View {
  target: THREE.Vector3;  // unit direction of the point looked at
  forward: THREE.Vector3; // unit tangent at target: the screen's "up" direction on the ground
  dist: number;
  tilt: number;           // user tilt on top of the automatic one (radians)
}

const cloneView = (v: View): View => ({ target: v.target.clone(), forward: v.forward.clone(), dist: v.dist, tilt: v.tilt });

export class GlobeCamera {
  private readonly cur: View;
  private readonly goal: View;
  private drag: { button: number; x: number; y: number } | null = null;
  private readonly keys = new Set<string>();
  private changed = true;
  private ground = GROUND; // eased terrain radius at the look point

  // surface(dir, highest): terrain radius at a direction, or the highest
  // terrain around it (keeps the camera above hills and mountains).
  constructor(private readonly camera: THREE.PerspectiveCamera, canvas: HTMLElement,
    private readonly surface: (dir: THREE.Vector3, highest: boolean) => number) {
    const target = new THREE.Vector3(0, 0, 1);
    this.cur = { target, forward: northAt(target), dist: 2.4, tilt: 0 };
    this.goal = cloneView(this.cur);
    this.bind(canvas);
    this.apply();
  }

  // Effective tilt from straight down, for the current distance.
  get tilt(): number { return this.tiltAt(this.cur); }
  get distance(): number { return this.cur.dist; }
  get target(): THREE.Vector3 { return this.cur.target; }

  // Fly to look at a direction, keeping the zoom.
  focus(dir: THREE.Vector3): void {
    this.goal.target.copy(dir).normalize();
  }

  // Jump straight to a view (debug, screenshots).
  jump(dir: THREE.Vector3, dist: number): void {
    this.goal.target.copy(dir).normalize();
    this.goal.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, dist));
    this.goal.forward.copy(northAt(this.goal.target));
    this.cur.target.copy(this.goal.target);
    this.cur.forward.copy(this.goal.forward);
    this.cur.dist = this.goal.dist;
    this.ground = this.surface(this.cur.target, false);
    this.changed = true;
    this.apply();
  }

  // Advances the easing; true when the camera moved.
  update(dt: number): boolean {
    const g = this.goal, c = this.cur;
    const key = (k: string) => (this.keys.has(k) ? 1 : 0);
    const rot = key('q') - key('e');
    if (rot !== 0) g.forward.applyAxisAngle(g.target, rot * 1.6 * dt);
    // Movement scales with the zoom, so it feels the same at every distance.
    const fwd = key('w') + key('arrowup') - key('s') - key('arrowdown');
    const side = key('d') + key('arrowright') - key('a') - key('arrowleft');
    if (fwd !== 0 || side !== 0) {
      const step = g.dist * 0.9 * dt * (this.keys.has('shift') ? 2.5 : 1);
      const right = g.forward.clone().cross(g.target);
      g.target.addScaledVector(g.forward, fwd * step).addScaledVector(right, side * step).normalize();
    }
    const tilt = key('t') - key('g');
    if (tilt !== 0) g.tilt = Math.min(MAX_TILT, Math.max(-AUTO_TILT, g.tilt + tilt * 0.9 * dt));
    const zoom = key('x') - key('z');
    if (zoom !== 0) g.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, g.dist * Math.exp(zoom * 1.6 * dt)));
    // Far away, north drifts back to the top and extra tilt fades.
    if (g.dist > LOCK) {
      const k = 1 - Math.exp(-dt * 2);
      g.forward.lerp(northAt(g.target), k);
      g.tilt *= 1 - k;
    }
    orthonormalize(g);

    const k = 1 - Math.exp(-dt * EASE);
    const moved = c.target.distanceTo(g.target) > 1e-6 || c.forward.distanceTo(g.forward) > 1e-5
      || Math.abs(c.dist - g.dist) > 1e-6 * c.dist || Math.abs(c.tilt - g.tilt) > 1e-5;
    if (moved) {
      c.target.lerp(g.target, k).normalize();
      c.forward.lerp(g.forward, k);
      c.dist += (g.dist - c.dist) * k;
      c.tilt += (g.tilt - c.tilt) * k;
      orthonormalize(c);
      this.changed = true;
    }
    // The look point follows the terrain height, smoothly.
    const ground = this.surface(c.target, false);
    if (Math.abs(ground - this.ground) > 1e-6) {
      this.ground += (ground - this.ground) * (1 - Math.exp(-dt * 6));
      this.changed = true;
    }
    if (!this.changed) return false;
    this.changed = false;
    this.apply();
    return true;
  }

  private tiltAt(v: View): number {
    const auto = AUTO_TILT * (1 - smoothstep(NEAR, FAR, v.dist));
    const max = MAX_TILT * (1 - smoothstep(0.15, LOCK, v.dist));
    return Math.min(max, Math.max(0, auto + v.tilt));
  }

  // Places the camera: behind and above the look point, tilted toward forward.
  private apply(): void {
    const c = this.cur;
    const tilt = this.tiltAt(c);
    const look = c.target.clone().multiplyScalar(this.ground);
    const back = c.target.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(c.forward, -Math.sin(tilt));
    const pos = look.clone().addScaledVector(back, c.dist);
    // Never dip into the terrain.
    const floor = Math.max(this.ground, this.surface(pos.clone().normalize(), true)) + CLEARANCE;
    if (pos.length() < floor) pos.setLength(floor);
    this.camera.position.copy(pos);
    this.camera.up.copy(c.forward).multiplyScalar(Math.cos(tilt)).addScaledVector(c.target, Math.sin(tilt));
    this.camera.lookAt(look);
  }

  // Ground angle (radians) covered by one pixel of screen height, roughly.
  private radiansPerPixel(el: HTMLElement): number {
    const fov = this.camera.fov * DEG;
    return (2 * this.cur.dist * Math.tan(fov / 2)) / Math.max(1, el.clientHeight);
  }

  private bind(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      this.drag = { button: e.shiftKey || e.ctrlKey ? 2 : e.button, x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointerup', (e) => {
      this.drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      const g = this.goal;
      if (this.drag.button === 0) {
        // Grab the ground: dragging right moves the view left, and so on.
        const a = this.radiansPerPixel(el);
        const right = g.forward.clone().cross(g.target);
        g.target.addScaledVector(right, -dx * a).addScaledVector(g.forward, dy * a).normalize();
        // Keep forward tangent (parallel transport).
        orthonormalize(g);
      } else {
        g.forward.applyAxisAngle(g.target, dx * 0.005);
        g.tilt = Math.min(MAX_TILT, Math.max(-AUTO_TILT, g.tilt - dy * 0.005));
      }
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const g = this.goal;
      const f = Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.0015)));
      const next = Math.min(MAX_DIST, Math.max(MIN_DIST, g.dist * f));
      // Zooming in moves toward the point under the cursor.
      if (next < g.dist) {
        const hit = this.groundUnder(el, e.clientX, e.clientY);
        if (hit) g.target.lerp(hit, 1 - next / g.dist).normalize();
        orthonormalize(g);
      }
      g.dist = next;
    }, { passive: false });
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (CAMERA_KEYS.has(k)) {
        this.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault(); // no page scrolling
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  // Direction of the ground point under a screen position, if any.
  private groundUnder(el: HTMLElement, x: number, y: number): THREE.Vector3 | null {
    const r = el.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    const { origin, direction } = ray.ray;
    const b = origin.dot(direction), c = origin.lengthSq() - GROUND * GROUND;
    const disc = b * b - c;
    if (disc < 0) return null;
    return origin.clone().addScaledVector(direction, -b - Math.sqrt(disc)).normalize();
  }
}

// The tangent at dir pointing to the north pole (any tangent at the poles).
function northAt(dir: THREE.Vector3): THREE.Vector3 {
  const n = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
  if (n.lengthSq() < 1e-6) n.set(0, 0, -1).addScaledVector(dir, dir.z);
  return n.normalize();
}

function orthonormalize(v: View): void {
  v.forward.addScaledVector(v.target, -v.forward.dot(v.target));
  if (v.forward.lengthSq() < 1e-9) v.forward.copy(northAt(v.target));
  v.forward.normalize();
}
