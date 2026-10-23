// Labels as objects in the scene (dev pages: buildings, gallery, town
// designs): a sign drawn on a canvas, shown on a sprite of a fixed height in
// world units. It turns to face the camera, but shrinks with distance and
// hides behind models like anything else there.

import * as THREE from 'three';

export interface LabelLine { readonly text: string; readonly bold?: boolean; readonly color?: string; readonly small?: boolean }
export interface LabelStyle { readonly focus?: boolean }

const PX = 4;                  // canvas pixels per CSS pixel (sharp up close)
const PAD = 7, GAP = 2, RADIUS = 6;
const BG = 'rgba(14,17,26,0.82)', TEXT = '#e8ecf3', FOCUS = '#5b9dff';
const font = (l: LabelLine) => `${l.bold ? 600 : 400} ${(l.small ? 11 : 13) * PX}px system-ui, -apple-system, sans-serif`;

// The sign's picture.
function draw(lines: readonly LabelLine[], style: LabelStyle): THREE.CanvasTexture {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  const sizes = lines.map((l) => { g.font = font(l); return { w: g.measureText(l.text).width, h: (l.small ? 11 : 13) * PX * 1.25 }; });
  c.width = Math.ceil(Math.max(...sizes.map((s) => s.w)) + 2 * PAD * PX);
  c.height = Math.ceil(sizes.reduce((a, s) => a + s.h, 0) + (lines.length - 1) * GAP * PX + 2 * PAD * PX * 0.7);
  g.fillStyle = BG;
  g.beginPath();
  g.roundRect(PX, PX, c.width - 2 * PX, c.height - 2 * PX, RADIUS * PX);
  g.fill();
  if (style.focus) { g.lineWidth = 2 * PX; g.strokeStyle = FOCUS; g.stroke(); }
  let y = PAD * PX * 0.7;
  lines.forEach((l, i) => {
    g.font = font(l);
    g.fillStyle = l.color ?? (l.small ? '#9aa4b5' : TEXT);
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(l.text, c.width / 2, y + sizes[i]!.h * 0.1);
    y += sizes[i]!.h + GAP * PX;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class WorldLabel extends THREE.Sprite {
  onClick: (() => void) | undefined;
  constructor(private readonly lines: readonly LabelLine[], private readonly height: number, style: LabelStyle = {}) {
    super(new THREE.SpriteMaterial({ map: draw(lines, style), transparent: true, depthWrite: false }));
    this.fit();
    this.renderOrder = 2;
  }
  // Redrawn (with or without the focus ring).
  setStyle(style: LabelStyle): void {
    this.material.map?.dispose();
    this.material.map = draw(this.lines, style);
    this.material.needsUpdate = true;
    this.fit();
  }
  private fit(): void {
    const img = this.material.map!.image as HTMLCanvasElement;
    // (Each line's share of the height stays the same whatever the line count.)
    const h = this.height * (img.height / (13 * PX * 1.25 + 2 * PAD * PX * 0.7));
    this.scale.set(h * (img.width / img.height), h, 1);
  }
  override dispose(): void { this.material.map?.dispose(); this.material.dispose(); super.dispose(); }
}

// Disposes every label under a group.
export function disposeLabels(g: THREE.Object3D): void {
  g.traverse((o) => { if (o instanceof WorldLabel) o.dispose(); });
}

// Clicks on labels that have an onClick (a click, not the end of a drag).
export function clickableLabels(canvas: HTMLCanvasElement, camera: THREE.Camera, root: () => THREE.Object3D): void {
  const ray = new THREE.Raycaster(), down = new THREE.Vector2();
  canvas.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY));
  canvas.addEventListener('click', (e) => {
    if (down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(root(), true).find((h) => h.object instanceof WorldLabel && h.object.onClick);
    (hit?.object as WorldLabel | undefined)?.onClick?.();
  });
}
