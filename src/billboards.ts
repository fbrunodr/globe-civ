// Billboards drawn all at once: labels a fixed size on screen (as
// THREE.Sprite with sizeAttenuation off; or that size up close and a fixed
// size in the world from further off: setWorldSize), each a picture from an atlas, all
// of one kind in a single draw. A Sprite each was a draw (and a material)
// each: 2,000 units' flags were 2,000 draws.
//
// Pictures are drawn once per key into a cell of the atlas (a canvas) and
// shared; a cell no billboard uses any more is drawn over by the next new
// key. The atlas grows (in rows) when full. Billboards are drawn back to
// front, as sprites are sorted, so their soft edges blend over those
// behind.

import * as THREE from 'three';

export interface Billboard {
  readonly position: THREE.Vector3;
  visible: boolean;
  dispose(): void;
}

interface Cell { readonly index: number; key: string; users: number }
interface Board extends Billboard { cell: Cell; live: boolean }

const VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aCell;
  uniform vec2 uScale;
  uniform vec2 uWorld;
  uniform vec2 uCellUv;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = (aCell + uv) * uCellUv;
    vec4 mvPosition = viewMatrix * vec4(aCenter, 1.0);
    // (A fixed size on screen, as large at any distance; but never larger
    // in the world than uWorld: from far off it shrinks with the land it
    // stands on, so a crowd of them does not pile up.)
    mvPosition.xy += position.xy * min(uScale * -mvPosition.z, uWorld);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = texture2D(uMap, vUv);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class Billboards {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly quad: THREE.BufferGeometry;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly cells = new Map<string, Cell>();
  private readonly free: Cell[] = [];
  private readonly boards = new Set<Board>();
  private rows: number;
  private used = 0;
  private dirty = false;
  private readonly view = new THREE.Vector3();

  // w × h: a picture's size (pixels), `cols` to a row of the atlas; scale:
  // its size on screen (as a Sprite's scale, sizeAttenuation off).
  constructor(private readonly w: number, private readonly h: number, private readonly cols: number, scale: readonly [number, number], renderOrder: number, depthTest = true) {
    this.rows = Math.max(1, Math.floor(2048 / h));
    this.canvas.width = w * cols;
    this.canvas.height = h * this.rows;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.flipY = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uScale: { value: new THREE.Vector2() }, uWorld: { value: new THREE.Vector2(1e9, 1e9) }, uCellUv: { value: new THREE.Vector2() } }]),
      vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, fog: true, depthTest,
    });
    this.material.uniforms['uMap']!.value = this.texture;
    (this.material.uniforms['uScale']!.value as THREE.Vector2).set(scale[0], scale[1]);
    this.setCellUv();
    // (A quad -0.5..0.5, its uv down the atlas: the canvas's rows top down, unflipped.)
    this.quad = new THREE.PlaneGeometry(1, 1);
    const uv = this.quad.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.mesh = new THREE.Mesh(this.instances(256), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  // The largest its billboards may be in the world (globe radii): past the distance where their fixed size on screen is that large, they shrink.
  setWorldSize(w: number, h: number): void { (this.material.uniforms['uWorld']!.value as THREE.Vector2).set(w, h); }

  // A billboard showing `key`'s picture (drawn by `draw` the first time).
  add(key: string, draw: (ctx: CanvasRenderingContext2D) => void): Billboard {
    let cell = this.cells.get(key);
    if (!cell) {
      cell = this.free.pop() ?? this.newCell();
      if (cell.key) this.cells.delete(cell.key);
      cell.key = key;
      this.cells.set(key, cell);
      this.paint(cell, draw);
    } else if (cell.users === 0) this.free.splice(this.free.indexOf(cell), 1);
    cell.users++;
    const board: Board = {
      position: new THREE.Vector3(), visible: true, cell, live: true,
      dispose: () => {
        if (!board.live) return;
        board.live = false;
        this.boards.delete(board);
        // (Its cell kept, with its picture, until a new key needs the room.)
        if (--board.cell.users === 0) this.free.push(board.cell);
      },
    };
    this.boards.add(board);
    return board;
  }

  // Every frame: the visible billboards, back to front from the camera.
  update(camera: THREE.Camera): void {
    if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; }
    const shown: { b: Board; z: number }[] = [];
    const m = camera.matrixWorldInverse;
    for (const b of this.boards) if (b.visible) shown.push({ b, z: this.view.copy(b.position).applyMatrix4(m).z });
    shown.sort((a, b) => a.z - b.z);
    if (shown.length > this.capacity()) this.grow(shown.length * 2);
    const geo = this.mesh.geometry;
    const center = geo.getAttribute('aCenter') as THREE.InstancedBufferAttribute, cell = geo.getAttribute('aCell') as THREE.InstancedBufferAttribute;
    shown.forEach(({ b }, i) => {
      center.setXYZ(i, b.position.x, b.position.y, b.position.z);
      cell.setXY(i, b.cell.index % this.cols, Math.floor(b.cell.index / this.cols));
    });
    // (Sent only as far as the billboards shown.)
    for (const a of [center, cell]) { a.clearUpdateRanges(); a.addUpdateRange(0, shown.length * a.itemSize); a.needsUpdate = true; }
    geo.instanceCount = shown.length;
  }

  private capacity(): number { return (this.mesh.geometry.getAttribute('aCenter') as THREE.InstancedBufferAttribute).count; }
  // (A new geometry when it grows: three.js holds an instanced geometry to
  // as many instances as its attributes had when first drawn.)
  private grow(n: number): void {
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.instances(n);
  }
  private instances(n: number): THREE.InstancedBufferGeometry {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(this.quad.getIndex());
    geo.setAttribute('position', this.quad.getAttribute('position'));
    geo.setAttribute('uv', this.quad.getAttribute('uv'));
    geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    return geo;
  }

  private setCellUv(): void { (this.material.uniforms['uCellUv']!.value as THREE.Vector2).set(1 / this.cols, 1 / this.rows); }
  private newCell(): Cell {
    if (this.used === this.cols * this.rows) {
      // (Full: twice the rows, what was drawn kept.)
      const old = document.createElement('canvas');
      old.width = this.canvas.width; old.height = this.canvas.height;
      old.getContext('2d')!.drawImage(this.canvas, 0, 0);
      this.rows *= 2;
      this.canvas.height = this.h * this.rows;
      this.ctx.drawImage(old, 0, 0);
      this.texture.dispose();
      this.setCellUv();
      this.dirty = true;
    }
    return { index: this.used++, key: '', users: 0 };
  }
  private paint(cell: Cell, draw: (ctx: CanvasRenderingContext2D) => void): void {
    const x = (cell.index % this.cols) * this.w, y = Math.floor(cell.index / this.cols) * this.h;
    this.ctx.save();
    this.ctx.clearRect(x, y, this.w, this.h);
    this.ctx.beginPath();
    this.ctx.rect(x, y, this.w, this.h);
    this.ctx.clip();
    this.ctx.translate(x, y);
    draw(this.ctx);
    this.ctx.restore();
    this.dirty = true;
  }
}
