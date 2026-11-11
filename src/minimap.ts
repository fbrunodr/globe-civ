// The minimap: the whole world unrolled (longitude across, latitude down,
// north at the top), in a map's colours: what the player has explored (what
// is out of sight a little darker), each civ's territory in its colour, the
// unknown as the globe shows it, old vellum. Over it the cities, the units
// in sight and the part of the world the camera looks at. A click or a drag
// on it flies the camera there.

import * as THREE from 'three';
import { HUMAN, type Game } from './game.ts';
import type { GlobeRenderer } from './render.ts';
import { paintViewColor } from './terrainMaterial.ts';

const W = 288, H = 144;
const VELLUM = [142, 124, 92] as const;

export class Minimap {
  private readonly base: HTMLCanvasElement;
  private readonly over: HTMLCanvasElement;
  private readonly tileOf: Int32Array;      // the tile under each pixel
  private readonly land: Uint8Array;        // each tile's colour (rgb)
  private readonly image: ImageData;
  private readonly scale = Math.min(2, Math.max(1, Math.round(devicePixelRatio)));

  constructor(private readonly game: Game, private readonly view: GlobeRenderer, host: HTMLElement) {
    const k = this.scale, w = W * k, h = H * k;
    this.base = document.createElement('canvas');
    this.over = document.createElement('canvas');
    for (const c of [this.base, this.over]) { c.width = w; c.height = h; host.append(c); }
    this.image = new ImageData(w, h);
    // Each pixel's tile: the nearest center, walking from the pixel before.
    this.tileOf = new Int32Array(w * h);
    const tiles = game.tiles, d = new THREE.Vector3();
    let t = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.dirAt((x + 0.5) / w, (y + 0.5) / h, d);
        for (;;) {
          let best = tiles[t]!.center.dot(d), next = -1;
          for (const nb of tiles[t]!.neighbors) { const v = tiles[nb]!.center.dot(d); if (v > best) { best = v; next = nb; } }
          if (next < 0) break;
          t = next;
        }
        this.tileOf[y * w + x] = t;
      }
    }
    this.land = new Uint8Array(game.N * 3);
    for (let i = 0; i < game.N; i++) {
      const c = paintViewColor(game.biome[i]!, game.feature[i] ?? null, game.relief[i]!);
      this.land.set([(c >> 16) & 255, (c >> 8) & 255, c & 255], i * 3);
    }
    const go = (e: PointerEvent) => {
      const r = this.over.getBoundingClientRect();
      view.focusDir(this.dirAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, new THREE.Vector3()));
    };
    this.over.addEventListener('pointerdown', (e) => { this.over.setPointerCapture(e.pointerId); go(e); });
    this.over.addEventListener('pointermove', (e) => { if (e.buttons & 1) go(e); });
    const tick = () => { this.drawOver(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // The point of the globe at a point of the map (0..1 across and down).
  private dirAt(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
    const lon = (u - 0.5) * 2 * Math.PI, lat = (0.5 - v) * Math.PI, c = Math.cos(lat);
    return out.set(c * Math.sin(lon), Math.sin(lat), c * Math.cos(lon));
  }
  private at(d: THREE.Vector3): [number, number] {
    return [(Math.atan2(d.x, d.z) / (2 * Math.PI) + 0.5) * this.over.width, (0.5 - Math.asin(Math.max(-1, Math.min(1, d.y))) / Math.PI) * this.over.height];
  }

  // The land, as the player knows it (when the game's state changed).
  redraw(): void {
    const g = this.game, px = this.image.data, land = this.land;
    const owner = new Int16Array(g.N), rgb = g.players.map((p) => { const v = parseInt(p.color.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; });
    for (let t = 0; t < g.N; t++) owner[t] = g.explored[t] ? g.ownerOf(t) : -1;
    const w = this.image.width;
    for (let i = 0; i < this.tileOf.length; i++) {
      const t = this.tileOf[i]!, o = i * 4;
      if (!g.explored[t]) {
        // (Mottled a little, as the globe's.)
        const n = ((Math.imul(t + 1, 0x9e3779b1) >>> 24) / 255) * 12 - 6;
        px[o] = VELLUM[0] + n; px[o + 1] = VELLUM[1] + n; px[o + 2] = VELLUM[2] + n; px[o + 3] = 255;
        continue;
      }
      let r = land[t * 3]!, gr = land[t * 3 + 1]!, b = land[t * 3 + 2]!;
      const ow = owner[t]!;
      if (ow >= 0) {
        // (Its owner's colour; stronger along its border.)
        const x = i % w, edge = (x > 0 && owner[this.tileOf[i - 1]!] !== ow) || (x < w - 1 && owner[this.tileOf[i + 1]!] !== ow)
          || (i >= w && owner[this.tileOf[i - w]!] !== ow) || (i + w < this.tileOf.length && owner[this.tileOf[i + w]!] !== ow);
        const c = rgb[ow]!, k = edge ? 0.95 : 0.5;
        r += (c[0]! - r) * k; gr += (c[1]! - gr) * k; b += (c[2]! - b) * k;
      }
      const dim = g.visible[t] ? 1 : 0.72;
      px[o] = r * dim; px[o + 1] = gr * dim; px[o + 2] = b * dim; px[o + 3] = 255;
    }
    this.base.getContext('2d')!.putImageData(this.image, 0, 0);
  }

  // Every frame: the cities, the units in sight, where the camera looks.
  private drawOver(): void {
    const g = this.game, c = this.over.getContext('2d')!, k = this.scale;
    c.clearRect(0, 0, this.over.width, this.over.height);
    for (const u of g.units) {
      if (!g.visible[u.tile] || u.packedIn !== null) continue;
      const [x, y] = this.at(g.tiles[u.tile]!.center);
      c.fillStyle = u.owner === HUMAN ? '#ffffff' : g.players[u.owner]!.color;
      c.fillRect(x - k, y - k, 2 * k, 2 * k);
    }
    for (const city of g.cities) {
      if (!g.explored[city.tile]) continue;
      const [x, y] = this.at(g.tiles[city.tile]!.center);
      c.beginPath();
      c.arc(x, y, 2.6 * k, 0, Math.PI * 2);
      c.fillStyle = g.players[city.owner]!.color;
      c.fill();
      c.lineWidth = k;
      c.strokeStyle = '#0b0e14';
      c.stroke();
    }
    // What the camera sees: a circle on the globe round where it looks.
    const at = this.view.looking, reach = Math.min(1.25, Math.max(0.05, this.view.viewDistance * 0.42));
    const e1 = new THREE.Vector3(0, 1, 0).cross(at);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
    e1.normalize();
    const e2 = at.clone().cross(e1), p = new THREE.Vector3();
    c.beginPath();
    let px = 0;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      p.copy(at).multiplyScalar(Math.cos(reach)).addScaledVector(e1, Math.sin(reach) * Math.cos(a)).addScaledVector(e2, Math.sin(reach) * Math.sin(a));
      const [x, y] = this.at(p);
      // (Round the back of the map: the line breaks and starts again.)
      if (i === 0 || Math.abs(x - px) > this.over.width / 2) c.moveTo(x, y); else c.lineTo(x, y);
      px = x;
    }
    c.lineWidth = 1.5 * k;
    c.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    c.shadowColor = 'rgba(0, 0, 0, 0.8)';
    c.shadowBlur = 2 * k;
    c.stroke();
    c.shadowBlur = 0;
  }
}
