import * as THREE from 'three';
import { unitDef } from './rules.ts';
import { GlobeCamera } from './camera.ts';
import type { Game, Unit, City } from './game.ts';
import { SNOW, tileLook, type TileLook, type PropKind } from './look.ts';
import { buildTerrainMesh, type TerrainMesh } from './terrainMesh.ts';
import { makeTerrainMaterial, makeTable, FAN_ROWS, TILE_ROWS, type TerrainMaterial } from './terrainMaterial.ts';
import { buildPaintData, fanCoords, fanFrames, paintAt, warpAt, FAN_COORDS, FINE_MAX, FINE_WAVELENGTH, type PaintData, type FanFrame } from './paint.ts';
import { buildRelief, type Relief } from './relief.ts';
import { riverCurve } from './riverCurve.ts';
import { buildPropGeometry, PROP_KINDS } from './props.ts';
import { mulberry32, makePerlin } from './rng.ts';

const FOG = new THREE.Color(0x0b0e15);

const UP = new THREE.Vector3(0, 1, 0);
// Subdivisions per tile fan; higher = smoother relief, more triangles.
const SUBDIV = 4;
// Props: size relative to the original models, density multiplier, and the
// number of chunks they are grouped in for horizon culling.
const PROP_SIZE = 0.5;
const PROP_DENSITY = 4;
const PROP_CHUNKS = 16;

interface PropChunk {
  dir: THREE.Vector3;  // chunk center
  radius: number;      // angular radius, with a margin for prop size
  tiles: number[];
  meshes: Map<PropKind, THREE.InstancedMesh>;
}

interface PlacedProp {
  kind: PropKind;
  matrix: THREE.Matrix4;
  shade: number; // brightness variation
}

// Frame rate while nothing moves (water ripples and foam still animate).
const IDLE_FPS = 15;
// Reference tile spacing (radians) that unit/city sizes were tuned for.
const REF_EDGE = 0.07;

export type Selection =
  | { kind: 'unit'; unit: Unit }
  | { kind: 'city'; city: City }
  | { kind: 'tile'; tile: number }
  | null;

// Renders the game state with Three.js and turns pointer input into tile
// clicks/hovers. All game mutations happen outside, in main.ts.
export class GlobeRenderer {
  onTileClick: (tile: number, button: number) => void = () => {};
  onTileHover: (tile: number) => void = () => {};

  private readonly game: Game;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly lastView = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private shadowsDirty = true;
  // Frames are drawn only when something changed; otherwise a slow tick keeps
  // the water moving (IDLE_FPS).
  private needsRender = true;
  private lastRender = 0;
  private readonly cam: GlobeCamera;
  private lastFrame = performance.now();
  private readonly raycaster = new THREE.Raycaster();
  private readonly scale: number; // world size of one tile relative to REF_EDGE

  private readonly terrain: TerrainMesh;
  private readonly terrainMat: TerrainMaterial;
  private readonly looks: TileLook[];
  private readonly globeMesh: THREE.Mesh;
  private readonly baseColors: THREE.Color[];
  private readonly playerColors: THREE.Color[];
  private readonly paint: PaintData;
  private readonly frames: FanFrame[];
  private readonly relief: Relief;
  private readonly tileTex: THREE.DataTexture;
  private readonly propNoise = makePerlin(mulberry32(0x7ee5));
  private prevExplored: Uint8Array;
  private prevVisible: Uint8Array;
  private prevOwner: Int32Array;

  private readonly propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  private readonly propGeo = new Map<PropKind, THREE.BufferGeometry>();
  private readonly chunks: PropChunk[] = [];
  private readonly propCache = new Map<number, PlacedProp[]>();
  private readonly craters = new THREE.Group();
  private readonly unitsGroup = new THREE.Group();
  private readonly citiesGroup = new THREE.Group();
  private readonly overlayGroup = new THREE.Group();
  private borders: THREE.Mesh | null = null;
  private riverMesh: THREE.Mesh | null = null;
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private readonly cityBase: THREE.CylinderGeometry;
  private readonly cityBlock: THREE.BoxGeometry;

  private pointer = { x: 0, y: 0, dirty: false };
  private downAt: { x: number; y: number } | null = null;
  private hoverTile = -1;

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.game = game;
    this.scale = game.globe.avgEdgeAngle / REF_EDGE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // Pixels are the main cost: 1.5 keeps Retina screens sharp at about half
    // the work of 2.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    // Neutral tone mapping keeps the pastel palette saturated (ACES washes it out).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color(0x04050a);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.005, 200);
    this.camera.position.set(0, 0, 3.4);
    this.scene.add(this.camera);
    // The sun keeps a fixed angle to the camera (from the upper left) so the
    // visible side is always lit; it is repositioned every frame (see
    // updateSun) so its shadow map only covers what is on screen. The
    // hemisphere light fills shadows with a cool sky tone.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Shadows re-render only when the view or the world changes (laptops).
    this.renderer.shadowMap.autoUpdate = false;
    this.sun = new THREE.DirectionalLight(0xffefd2, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.003;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b5a3e, 1.05));

    // Terrain radius at a direction (the tile under it), or the highest tile
    // center around it (for the camera's clearance).
    let near = 0;
    this.cam = new GlobeCamera(this.camera, canvas, (dir, highest) => {
      if (!this.terrain) return 1.008; // not built yet
      near = this.nearestTile(dir, near);
      let r = this.terrain.centerRadius[near];
      if (highest) for (const nb of this.game.tiles[near].neighbors) r = Math.max(r, this.terrain.centerRadius[nb]);
      return r;
    });

    const g = game;
    const N = g.N;
    this.looks = g.tiles.map((t) => tileLook(g.map, t.id));
    const L = this.looks;
    this.paint = buildPaintData(g.globe, g.map, g.seed);
    this.frames = fanFrames(g.globe);
    const params = this.paint.params;
    this.relief = buildRelief(g.globe, g.map, L, g.seed, params.r0, (x, y, z, out) => warpAt(params, x, y, z, out));
    const frames = this.frames, fans = this.paint.fans;
    // Mountains, hills and their neighbors get the fine mesh for smooth relief.
    const rough = (t: number) => g.relief[t] !== 'flat' && L[t].wet < 0.5;
    this.terrain = buildTerrainMesh(g.globe, {
      heightAt: this.relief.heightAt,
      fine: (t) => rough(t) || g.tiles[t].neighbors.some((nb) => g.relief[nb] === 'mountains' && L[nb].wet < 0.5),
      warp: (dir, out) => { warpAt(params, dir.x, dir.y, dir.z, out); },
      fanAttributes: [{
        name: 'pc', itemSize: FAN_COORDS + 1,
        views: [{ name: 'pc0', offset: 0, size: 4 }, { name: 'pc1', offset: 4, size: 2 }],
        compute: (fan, _t, _i, dir, delta, out, off) => {
          fanCoords(frames[fan], fans[fan], delta, dir.x, dir.y, dir.z, out, off);
          out[off + FAN_COORDS] = fan;
        },
      }],
    }, SUBDIV);
    this.baseColors = L.map((l) => l.color);
    this.playerColors = g.players.map((p) => new THREE.Color(p.color));

    // Tile table: static rows now, display rows (color, snow) in updateColors.
    this.tileTex = makeTable(N * TILE_ROWS);
    const td = this.tileTex.image.data as Float32Array;
    L.forEach((l, t) => {
      const o = t * TILE_ROWS * 4;
      td.set([l.detail.grain, l.detail.patch, l.detail.strata, l.detail.dunes], o + 4);
      td.set([l.patchColor.r, l.patchColor.g, l.patchColor.b, l.detail.bump], o + 8);
      td.set([l.rockColor.r, l.rockColor.g, l.rockColor.b, l.rock], o + 12);
      td[o + 3] = l.wet;
      td[o + 19] = l.beach;
      td[o + 20] = l.shallow;
      td[o + 21] = this.paint.group[t];
    });
    const fanTex = makeTable(this.paint.fans.length * FAN_ROWS);
    const fd = fanTex.image.data as Float32Array;
    this.paint.fans.forEach((f, i) => {
      const o = i * FAN_ROWS * 4;
      fd.set(f.ids, o);
      fd.set(f.round.slice(0, 4), o + 4);
      fd.set([f.round[4], ...f.river], o + 8);
      fd.set(f.warp.slice(0, 4), o + 12);
      fd[o + 16] = f.warp[4];
    });

    // Per-vertex shade (baked occlusion and a fine tint) and snow, fixed for
    // the whole game. Snow caps sit high on mountain crests, measured against
    // each tile's peak: glaciers are iced from about halfway up, other cold
    // peaks get a small tip, warm peaks (e.g. near the equator) stay bare.
    const V = this.terrain.vertRadius.length;
    const shade = new Float32Array(V);
    const snow = new Float32Array(V);
    for (let v = 0; v < V; v++) {
      const x = this.terrain.vertDir[v * 3], y = this.terrain.vertDir[v * 3 + 1], z = this.terrain.vertDir[v * 3 + 2];
      const tint = Math.sin(x * 97.1 + y * 41.3) * Math.cos(z * 83.7 - x * 29.9) * Math.sin(y * 61.7 + z * 17.3);
      shade[v] = (1 + 0.07 * tint) * this.terrain.vertAO[v];
    }
    for (let t = 0; t < N; t++) {
      if (g.relief[t] !== 'mountains' || this.relief.peak[t] <= 0) continue;
      const capFrom = g.feature[t] === 'glacier' ? 0.55 : g.map.temperature[t] < 3 ? 0.8 : null;
      if (capFrom === null) continue;
      for (const v of this.terrain.tileVerts[t]) {
        const frac = (this.terrain.vertRadius[v] - 1 - this.relief.base[t]) / this.relief.peak[t];
        snow[v] = Math.max(snow[v], smoothstep(capFrom, capFrom + 0.15, frac));
      }
    }
    // Forest floors sit in the canopy's shade.
    for (let t = 0; t < N; t++) {
      const trees = L[t].props.reduce((a, p) => a + (p.count >= 6 ? p.count : 0), 0);
      if (trees === 0) continue;
      for (const v of this.terrain.tileVerts[t]) shade[v] *= 0.93;
    }
    const geo = this.terrain.geometry;
    geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
    geo.setAttribute('snow', new THREE.BufferAttribute(snow, 1));
    geo.setAttribute('unexplored', new THREE.BufferAttribute(new Float32Array(V).fill(1), 1));

    this.terrainMat = makeTerrainMaterial({
      tileTex: this.tileTex, fanTex,
      r0: params.r0, fine: FINE_MAX * params.r0, fineFreq: 1 / (FINE_WAVELENGTH * params.r0),
    });
    this.globeMesh = new THREE.Mesh(this.terrain.geometry, this.terrainMat.material);
    this.globeMesh.castShadow = true;
    this.globeMesh.receiveShadow = true;
    this.scene.add(this.globeMesh);
    this.prevExplored = new Uint8Array(N).fill(255);
    this.prevVisible = new Uint8Array(N).fill(255);
    this.prevOwner = new Int32Array(N).fill(-2);
    this.buildBackdrop();

    const s = this.scale;
    // Props are drawn per chunk of the globe, one instanced mesh per kind, so
    // chunks behind the horizon or off screen cost nothing.
    for (const kind of PROP_KINDS) this.propGeo.set(kind, buildPropGeometry(kind, s * 1.5 * PROP_SIZE));
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < PROP_CHUNKS; k++) {
      const y = 1 - (2 * (k + 0.5)) / PROP_CHUNKS, rr = Math.sqrt(1 - y * y);
      this.chunks.push({ dir: new THREE.Vector3(Math.cos(golden * k) * rr, y, Math.sin(golden * k) * rr), radius: 0, tiles: [], meshes: new Map() });
    }
    for (const tile of g.tiles) {
      let best = 0;
      for (let k = 1; k < PROP_CHUNKS; k++) if (this.chunks[k].dir.dot(tile.center) > this.chunks[best].dir.dot(tile.center)) best = k;
      const c = this.chunks[best];
      c.tiles.push(tile.id);
      c.radius = Math.max(c.radius, c.dir.angleTo(tile.center) + 2 * g.globe.avgEdgeAngle);
    }
    this.scene.add(this.craters);
    this.cityBase = new THREE.CylinderGeometry(0.026 * s, 0.03 * s, 0.006 * s, 6);
    this.cityBlock = new THREE.BoxGeometry(0.011 * s, 0.016 * s, 0.011 * s);
    this.scene.add(this.unitsGroup, this.citiesGroup, this.overlayGroup);

    this.bindInput(canvas);
    const resize = () => {
      this.needsRender = true;
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    };
    addEventListener('resize', resize);
    resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- public API ----------

  focusOn(tile: number): void {
    this.cam.focus(this.game.tiles[tile].center);
  }

  // Jump straight to a tile at the given camera distance (debug / screenshots).
  lookAt(tile: number, distance: number): void {
    this.cam.jump(this.game.tiles[tile].center, distance - 1);
    this.needsRender = true;
  }

  // Redraw everything that depends on game state.
  syncWorld(sel: Selection): void {
    this.shadowsDirty = true;
    this.needsRender = true;
    const changed = this.changedTiles();
    if (changed.length) {
      this.updateColors(changed);
      this.updateProps();
      this.updateRivers();
      this.updateBorders();
    }
    this.updateCities();
    this.updateUnits(sel);
  }

  // Redraw selection ring, hover ring and path preview.
  syncOverlay(sel: Selection, hover: number, path: number[] | null): void {
    this.needsRender = true;
    for (const o of this.overlayGroup.children) if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
    this.overlayGroup.clear();
    const selTile = sel?.kind === 'unit' ? sel.unit.tile : sel?.kind === 'city' ? sel.city.tile : sel?.kind === 'tile' ? sel.tile : -1;
    if (selTile >= 0) this.overlayGroup.add(this.ring(selTile, 0xffffff, 0.9));
    if (hover >= 0 && hover !== selTile) this.overlayGroup.add(this.ring(hover, 0xffffff, 0.35));
    if (path && path.length > 1) {
      const pts: THREE.Vector3[] = [];
      const lift = 0.01 * this.scale;
      for (let k = 0; k + 1 < path.length; k++) {
        const a = path[k], b = path[k + 1];
        const da = this.game.tiles[a].center, db = this.game.tiles[b].center;
        const ra = this.terrain.centerRadius[a], rb = this.terrain.centerRadius[b];
        for (let s = 0; s < 8; s++) {
          const f = s / 8;
          pts.push(da.clone().lerp(db, f).normalize().multiplyScalar(Math.max(ra, rb) + lift));
        }
      }
      const last = path[path.length - 1];
      pts.push(this.surface(last, lift));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffe066 }));
      const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(path.slice(1).map((t) => this.surface(t, lift))),
        new THREE.PointsMaterial({ color: 0xffe066, size: 7, sizeAttenuation: false }));
      this.overlayGroup.add(line, dots);
    }
  }

  // ---------- globe ----------

  private surface(t: number, lift = 0): THREE.Vector3 {
    return this.game.tiles[t].center.clone().multiplyScalar(this.terrain.centerRadius[t] + lift);
  }

  private buildBackdrop(): void {
    const stars: number[] = [];
    const rand = mulberry32(99);
    for (let i = 0; i < 2500; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = 60 + rand() * 40;
      const s = Math.sqrt(1 - u * u);
      stars.push(s * Math.cos(th) * r, u * r, s * Math.sin(th) * r);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaab4cc, size: 1.4, sizeAttenuation: false })));

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 64, 64),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vN; void main(){ float i = smoothstep(0.0, 0.45, -vN.z); gl_FragColor = vec4(0.3, 0.55, 1.0, 1.0) * i * 0.5; }',
      }),
    );
    this.scene.add(atmosphere);
  }

  // Tiles whose fog or ownership changed since the last sync.
  private changedTiles(): number[] {
    const g = this.game;
    const out: number[] = [];
    for (let t = 0; t < g.N; t++) {
      const o = g.ownerOf(t);
      if (g.explored[t] !== this.prevExplored[t] || g.visible[t] !== this.prevVisible[t] || o !== this.prevOwner[t]) {
        out.push(t);
        this.prevExplored[t] = g.explored[t];
        this.prevVisible[t] = g.visible[t];
        this.prevOwner[t] = o;
      }
    }
    return out;
  }

  // Color of tile t as seen by the player; `snow` shows its snow instead.
  private displayColor(t: number, snow: boolean, out: THREE.Color): THREE.Color {
    const g = this.game;
    if (!g.explored[t]) return out.copy(FOG);
    out.copy(snow ? SNOW : this.baseColors[t]);
    const owner = g.ownerOf(t);
    if (owner >= 0) out.lerp(this.playerColors[owner], 0.12);
    if (!g.visible[t]) {
      const gray = (out.r + out.g + out.b) / 3;
      out.setRGB(lerp(out.r, gray, 0.5) * 0.62, lerp(out.g, gray, 0.5) * 0.62, lerp(out.b, gray, 0.5) * 0.62);
    }
    return out;
  }

  private updateColors(changed: number[]): void {
    const { vertTiles, tileVerts } = this.terrain;
    const g = this.game;
    const td = this.tileTex.image.data as Float32Array;
    const c = new THREE.Color();
    for (const t of changed) {
      const o = t * TILE_ROWS * 4;
      this.displayColor(t, false, c);
      td[o] = c.r; td[o + 1] = c.g; td[o + 2] = c.b;
      this.displayColor(t, true, c);
      td[o + 16] = c.r; td[o + 17] = c.g; td[o + 18] = c.b;
    }
    this.tileTex.needsUpdate = true;
    const fogAttr = this.terrain.geometry.getAttribute('unexplored') as THREE.BufferAttribute;
    const fogArr = fogAttr.array as Float32Array;
    const dirty = new Set<number>();
    for (const t of changed) for (const v of tileVerts[t]) dirty.add(v);
    for (const v of dirty) {
      let n = 0, hidden = 0;
      for (let s = 0; s < 3; s++) {
        const t = vertTiles[v * 3 + s];
        if (t < 0) continue;
        if (!g.explored[t]) hidden++;
        n++;
      }
      fogArr[v] = hidden / n;
    }
    fogAttr.needsUpdate = true;
  }

  // Props (trees, shrubs, reeds, palms...) of one tile, placed once and cached.
  // Spots come from a jittered triangular lattice in each fan of the tile, so
  // props keep an even, natural spacing (no clumps). Each spot takes the props
  // of whichever tile the painting shows there, so forests feather into their
  // neighbors exactly where the ground color does; sparse props skip spots at
  // random. Everything is fixed by the tile id, so props never move between
  // reloads.
  private placeProps(t: number): PlacedProp[] {
    const cached = this.propCache.get(t);
    if (cached) return cached;
    const g = this.game;
    const out: PlacedProp[] = [];
    const total = (u: number) => this.looks[u].props.reduce((a, p) => a + Math.ceil(p.count * this.looks[u].propScale), 0) * PROP_DENSITY;
    const tile = g.tiles[t];
    const most = Math.max(total(t), ...tile.neighbors.map(total));
    if (most > 0) {
      const co = new Float32Array(FAN_COORDS);
      const delta = [0, 0, 0];
      const r0 = this.paint.params.r0;
      const q = new THREE.Quaternion(), sc = new THREE.Vector3();
      const rand = mulberry32(t * 7919 + 1);
      const k = tile.corners.length;
      // Rows of the lattice per fan: enough spots for the densest look nearby.
      const m = Math.max(1, Math.ceil((Math.sqrt(8 * (most / k) + 1) - 1) / 2));
      const spots = (k * m * (m + 1)) / 2;
      for (let i = 0; i < k; i++) {
        for (let a = 0; a < m; a++) {
          for (let b = 0; a + b < m; b++) {
            const pick = rand(), keep = rand(), which = rand(), spin = rand(), sz = rand(), tall = rand(), tint = rand();
            const ja = (rand() - 0.5) * 0.6, jb = (rand() - 0.5) * 0.6;
            // Spot (a, b) of the fan's lattice, kept inside the fan.
            const wa = Math.min(0.98, Math.max(0.02, (a + 1 / 3 + ja) / m));
            const wb = Math.min(0.98 - wa, Math.max(0.02, (b + 1 / 3 + jb) / m));
            const p = this.terrain.samplePoint(t, i, wa, wb);
            const d = p.clone().normalize();
            const fanId = this.paint.fanStart[t] + i;
            const fan = this.paint.fans[fanId];
            fanCoords(this.frames[fanId], fan, warpAt(this.paint.params, d.x, d.y, d.z, delta), d.x, d.y, d.z, co);
            const ps = paintAt(this.paint, fanId, co);
            // Which tile's props show here.
            let u = fan.ids[0], acc = 0;
            for (let c = 0; c < 4; c++) { acc += ps.w[c]; if (pick < acc) { u = fan.ids[c]; break; } }
            const look = this.looks[u];
            const tu = total(u);
            if (tu === 0) continue;
            // Gentle large-scale variation in density, never clearings.
            const vary = 0.85 + 0.3 * this.propNoise.fbm(p.x * 9, p.y * 9, p.z * 9, 2);
            if (keep >= Math.min(1, (tu / spots) * vary)) continue;
            // Keep river courses clear.
            if (fan.river.some((rv, e) => rv > 0 && Math.abs(ps.s[e]) < r0 * (0.14 + 0.1 * rv))) continue;
            let spec = look.props[0];
            let cut = which * tu;
            for (const sp of look.props) { cut -= Math.ceil(sp.count * look.propScale) * PROP_DENSITY; if (cut < 0) { spec = sp; break; } }
            if (!spec) continue;
            q.setFromUnitVectors(UP, d);
            q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin * Math.PI * 2));
            const size = 0.8 + 0.45 * sz;
            out.push({ kind: spec.kind, matrix: new THREE.Matrix4().compose(p, q, sc.set(size, size * (0.9 + 0.3 * tall), size)), shade: 0.82 + 0.36 * tint });
          }
        }
      }
    }
    this.propCache.set(t, out);
    return out;
  }

  // Rebuilds the instanced props of explored tiles, chunk by chunk.
  private updateProps(): void {
    const g = this.game;
    const color = new THREE.Color();
    for (const chunk of this.chunks) {
      const lists = new Map<PropKind, { p: PlacedProp; dim: number }[]>();
      for (const t of chunk.tiles) {
        if (!g.explored[t]) continue;
        const dim = g.visible[t] ? 1 : 0.45;
        for (const p of this.placeProps(t)) {
          let l = lists.get(p.kind);
          if (!l) { l = []; lists.set(p.kind, l); }
          l.push({ p, dim });
        }
      }
      for (const kind of PROP_KINDS) {
        const items = lists.get(kind) ?? [];
        let mesh = chunk.meshes.get(kind);
        if (!mesh || mesh.instanceMatrix.count < items.length) {
          if (mesh) { this.scene.remove(mesh); mesh.dispose(); }
          if (items.length === 0) { chunk.meshes.delete(kind); continue; }
          mesh = new THREE.InstancedMesh(this.propGeo.get(kind)!, this.propMat, Math.ceil(items.length * 1.3) + 8);
          mesh.castShadow = true;
          chunk.meshes.set(kind, mesh);
          this.scene.add(mesh);
        }
        items.forEach(({ p, dim }, i) => {
          mesh.setMatrixAt(i, p.matrix);
          mesh.setColorAt(i, color.setScalar(p.shade * dim));
        });
        mesh.count = items.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
    this.updateCraters();
  }

  // Per frame: hide prop chunks beyond the horizon (they could not be seen).
  private cullProps(): void {
    const cam = this.camera.position;
    const dist = cam.length();
    const camDir = cam.clone().divideScalar(dist);
    const horizon = Math.acos(Math.min(1, 1 / dist));
    for (const chunk of this.chunks) {
      const seen = camDir.angleTo(chunk.dir) < horizon + chunk.radius;
      for (const mesh of chunk.meshes.values()) mesh.visible = seen;
    }
  }

  private updateCraters(): void {
    const g = this.game;
    for (const c of this.craters.children) if (c instanceof THREE.Mesh) c.geometry.dispose();
    this.craters.clear();
    const s = this.scale;
    for (let t = 0; t < g.N; t++) {
      if (g.feature[t] !== 'volcano' || !g.explored[t]) continue;
      const group = new THREE.Group();
      group.position.copy(this.surface(t, -0.004 * s));
      group.quaternion.setFromUnitVectors(UP, g.tiles[t].center);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.0042 * s, 0.009 * s, 0.006 * s, 9, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x2e2824, roughness: 1, side: THREE.DoubleSide }));
      rim.position.y = 0.003 * s;
      const lava = new THREE.Mesh(new THREE.CircleGeometry(0.004 * s, 12),
        new THREE.MeshBasicMaterial({ color: g.visible[t] ? 0xff6a1a : 0x7a3a1a }));
      lava.rotation.x = -Math.PI / 2;
      lava.position.y = 0.0045 * s;
      group.add(rim, lava);
      this.craters.add(group);
    }
  }

  // Ribbon along the inside of edge i of tile t, following the terrain.
  private edgeRibbon(t: number, i: number, outer: number, inner: number, lift: number, out: number[]): void {
    const steps = SUBDIV * 2;
    const pt = (f: number, r: number) => {
      const p = this.terrain.samplePoint(t, i, (1 - f) * r, f * r);
      return p.multiplyScalar(1 + lift / p.length());
    };
    for (let s = 0; s < steps; s++) {
      const f0 = s / steps, f1 = (s + 1) / steps;
      const a0 = pt(f0, outer), b0 = pt(f1, outer), a1 = pt(f0, inner), b1 = pt(f1, inner);
      for (const v of [a0, b0, b1, a0, b1, a1]) out.push(v.x, v.y, v.z);
    }
  }

  // Surface point at direction dir, which lies near edge i of tile t (on
  // either side of it).
  private surfaceNear(t: number, i: number, dir: THREE.Vector3): THREE.Vector3 {
    const g = this.game;
    const tile = g.tiles[t];
    const k = tile.corners.length;
    const solve = (tt: number, ii: number) => {
      const tl = g.tiles[tt], kk = tl.corners.length;
      const C = tl.center, A = g.globe.triCenters[tl.corners[ii]], B = g.globe.triCenters[tl.corners[(ii + 1) % kk]];
      // dir * l = C + wa (A - C) + wb (B - C)
      const ea = A.clone().sub(C), eb = B.clone().sub(C);
      const M = new THREE.Matrix3().set(dir.x, -ea.x, -eb.x, dir.y, -ea.y, -eb.y, dir.z, -ea.z, -eb.z).invert();
      const sol = C.clone().applyMatrix3(M);
      return { wa: sol.y, wb: sol.z };
    };
    let r = solve(t, i);
    if (r.wa + r.wb <= 1 + 1e-6) return this.terrain.samplePoint(t, i, Math.max(0, r.wa), Math.max(0, r.wb));
    const nb = tile.neighbors[i];
    const ntile = g.tiles[nb];
    const ci = tile.corners[i], cj = tile.corners[(i + 1) % k];
    const ni = ntile.corners.findIndex((c, j) => c === cj && ntile.corners[(j + 1) % ntile.corners.length] === ci);
    if (ni < 0) return this.terrain.samplePoint(t, i, 0.5, 0.5);
    r = solve(nb, ni);
    return this.terrain.samplePoint(nb, ni, Math.max(0, r.wa), Math.max(0, r.wb));
  }

  // Rivers: a ribbon along each river's drawn course (riverCurve.ts), resting
  // in its valley and widening downstream with the water it carries. Hidden
  // under fog of war.
  private updateRivers(): void {
    const g = this.game;
    const s = this.scale;
    const maxFlow = Math.max(1, ...g.map.rivers.flatMap((r) => r.flow));
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const river = new THREE.Color(0x4fb2cc);
    const up = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
    for (const r of g.map.rivers) {
      const curve = riverCurve(g.globe, this.paint, r);
      const pts = curve.map((c) => {
        const p = this.surfaceNear(c.tile, c.fan, c.dir);
        return p.multiplyScalar(1 + 0.0016 / p.length());
      });
      const seen = curve.map((c) => {
        const tl = g.tiles[c.tile], nb = tl.neighbors[c.fan];
        return g.explored[c.tile] || g.explored[nb] ? (g.visible[c.tile] || g.visible[nb] ? 1 : 0.5) : 0;
      });
      const width = curve.map((c) => (0.0035 + 0.007 * Math.sqrt(r.flow[c.edge] / maxFlow)) * s);
      const base = pos.length / 3;
      for (let j = 0; j < pts.length; j++) {
        const p = pts[j];
        tan.subVectors(pts[Math.min(pts.length - 1, j + 1)], pts[Math.max(0, j - 1)]).normalize();
        up.copy(p).normalize();
        side.crossVectors(up, tan).normalize().multiplyScalar(width[j] / 2);
        pos.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
        const c = river.clone().multiplyScalar(seen[j] === 0.5 ? 0.55 : 1);
        for (let v = 0; v < 2; v++) col.push(c.r, c.g, c.b);
        if (j > 0 && seen[j] > 0 && seen[j - 1] > 0) {
          const q = base + 2 * j;
          idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
        }
      }
    }
    if (this.riverMesh) {
      this.scene.remove(this.riverMesh);
      this.riverMesh.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.riverMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.45, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    this.riverMesh.receiveShadow = true;
    this.scene.add(this.riverMesh);
  }

  // Colored bands along the inside edge of each empire's territory.
  private updateBorders(): void {
    const g = this.game;
    const pos: number[] = [], col: number[] = [];
    for (let t = 0; t < g.N; t++) {
      if (!g.explored[t]) continue;
      const o = g.ownerOf(t);
      if (o < 0) continue;
      const tile = g.tiles[t];
      const color = this.playerColors[o];
      for (let i = 0; i < tile.corners.length; i++) {
        if (g.ownerOf(tile.neighbors[i]) === o) continue;
        const before = pos.length;
        this.edgeRibbon(t, i, 0.97, 0.84, 0.0015, pos);
        for (let k = before; k < pos.length; k += 3) col.push(color.r, color.g, color.b);
      }
    }
    if (this.borders) {
      this.scene.remove(this.borders);
      this.borders.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.borders = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.borders.renderOrder = 2;
    this.scene.add(this.borders);
  }

  private ring(t: number, color: number, opacity: number): THREE.Mesh {
    const pos: number[] = [];
    for (let i = 0; i < this.game.tiles[t].corners.length; i++) this.edgeRibbon(t, i, 0.95, 0.85, 0.002, pos);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    mesh.renderOrder = 3;
    return mesh;
  }

  // ---------- units & cities ----------

  private texture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    let tex = this.textures.get(key);
    if (!tex) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      draw(canvas.getContext('2d')!);
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.textures.set(key, tex);
    }
    return tex;
  }

  private updateUnits(sel: Selection): void {
    const g = this.game;
    for (const o of this.unitsGroup.children) if (o instanceof THREE.Sprite) o.material.dispose();
    this.unitsGroup.clear();
    const byTile = new Map<number, Unit[]>();
    for (const u of g.units) {
      if (!g.visible[u.tile]) continue;
      const list = byTile.get(u.tile);
      if (list) list.push(u); else byTile.set(u.tile, [u]);
    }
    const selUnit = sel?.kind === 'unit' ? sel.unit : null;
    for (const [t, list] of byTile) {
      const top = list.find((u) => u === selUnit) ?? list.find((u) => !unitDef(u.type).civilian) ?? list[0];
      const color = g.players[top.owner].color;
      const icon = unitDef(top.type).icon;
      const hp = Math.ceil(top.hp / 10);
      const selected = top === selUnit;
      const key = `u|${color}|${icon}|${list.length}|${hp}|${selected}|${top.fortified}`;
      const tex = this.texture(key, 128, 128, (ctx) => drawUnitIcon(ctx, color, icon, list.length, top.hp, selected, top.fortified));
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.setScalar(0.045 * this.scale);
      const tile = g.tiles[t];
      const dir = g.cityByTile.has(t) ? tile.center.clone().lerp(g.globe.triCenters[tile.corners[0]], 0.55).normalize() : tile.center;
      sprite.position.copy(dir).multiplyScalar(this.terrain.centerRadius[t] + 0.03 * this.scale);
      sprite.renderOrder = 5;
      this.unitsGroup.add(sprite);
    }
  }

  private updateCities(): void {
    const g = this.game;
    for (const o of this.citiesGroup.children) if (o instanceof THREE.Sprite) o.material.dispose();
    this.citiesGroup.clear();
    const s = this.scale;
    for (const city of g.cities) {
      if (!g.explored[city.tile]) continue;
      const tile = g.tiles[city.tile];
      const color = g.players[city.owner].color;
      const group = new THREE.Group();
      group.position.copy(this.surface(city.tile));
      group.quaternion.setFromUnitVectors(UP, tile.center);
      const base = new THREE.Mesh(this.cityBase, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      base.castShadow = true;
      base.position.y = 0.002 * s;
      group.add(base);
      const blockMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 });
      const blocks = Math.min(6, 2 + city.pop);
      for (let i = 0; i < blocks; i++) {
        const a = (i / blocks) * Math.PI * 2;
        const b = new THREE.Mesh(this.cityBlock, blockMat);
        b.castShadow = true;
        const hgt = 0.7 + 0.6 * fract(Math.sin((city.id * 7 + i) * 12.9898) * 43758.5453);
        b.scale.set(1, hgt, 1);
        b.position.set(Math.cos(a) * 0.013 * s, (0.005 + 0.008 * hgt) * s, Math.sin(a) * 0.013 * s);
        group.add(b);
      }
      this.citiesGroup.add(group);

      const label = `${city.pop}  ${city.name}`;
      const key = `c|${color}|${label}`;
      const tex = this.texture(key, 512, 96, (ctx) => drawCityLabel(ctx, color, label));
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.set(0.16 * s, 0.03 * s, 1);
      sprite.position.copy(tile.center).multiplyScalar(this.terrain.centerRadius[city.tile] + 0.06 * s);
      sprite.renderOrder = 10;
      this.citiesGroup.add(sprite);
    }
  }

  // ---------- input & loop ----------

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => { this.downAt = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.downAt) return;
      const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
      this.downAt = null;
      if (moved > 6) return;
      const t = this.pick(e.clientX, e.clientY);
      if (t >= 0) this.onTileClick(t, e.button);
    });
    canvas.addEventListener('pointermove', (e) => { this.pointer = { x: e.clientX, y: e.clientY, dirty: true }; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Places the sun at a fixed angle to the view and fits its shadow camera to
  // the visible patch of globe: tight when zoomed in (crisp shadows), the
  // whole hemisphere when zoomed out.
  private updateSun(): void {
    const cam = this.camera;
    const moved = cam.position.distanceToSquared(this.lastView.pos) > 1e-10 || cam.quaternion.angleTo(this.lastView.quat) > 1e-5;
    if (!moved && !this.shadowsDirty) return;
    this.lastView.pos.copy(cam.position);
    this.lastView.quat.copy(cam.quaternion);
    this.shadowsDirty = false;
    // The sun shines from the upper left of the map view, high in the sky,
    // whatever the camera's tilt.
    const focus = this.cam.target.clone();
    const up = cam.up.clone().addScaledVector(focus, -cam.up.dot(focus)).normalize();
    const right = up.clone().cross(focus);
    const dir = focus.clone().multiplyScalar(2.3).addScaledVector(up, 1.4).addScaledVector(right, -1.0).normalize();
    this.sun.position.copy(focus).addScaledVector(dir, 3);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    // Fit the shadow map to the ground in view (more of it when tilted).
    const span = this.cam.distance * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * Math.max(1, cam.aspect) * 1.3;
    const half = Math.min(1.15, Math.max(0.08, span * (1 + 1.5 * Math.sin(this.cam.tilt))));
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 1; sc.far = 5;
    sc.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;
  }

  // The tile under a screen point: intersect the view ray with a sphere at
  // ground level, walk to the nearest tile center, then repeat once at that
  // tile's own height (hills and mountains stand above the sphere).
  private pick(x: number, y: number): number {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    const hit = (r: number): THREE.Vector3 | null => {
      const b = origin.dot(direction), c = origin.lengthSq() - r * r;
      const disc = b * b - c;
      if (disc < 0) return null;
      return origin.clone().addScaledVector(direction, -b - Math.sqrt(disc)).normalize();
    };
    let p = hit(1.008);
    if (!p) return -1;
    let t = this.nearestTile(p, this.hoverTile >= 0 ? this.hoverTile : 0);
    p = hit(this.terrain.centerRadius[t]);
    if (p) t = this.nearestTile(p, t);
    return t;
  }

  // Greedy walk over neighbors toward the tile whose center is closest to dir.
  private nearestTile(dir: THREE.Vector3, start: number): number {
    const tiles = this.game.tiles;
    let t = start, best = tiles[t].center.dot(dir);
    for (;;) {
      let next = -1;
      for (const nb of tiles[t].neighbors) {
        const d = tiles[nb].center.dot(dir);
        if (d > best) { best = d; next = nb; }
      }
      if (next < 0) return t;
      t = next;
    }
  }

  private frame(): void {
    const t = performance.now();
    const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    if (this.cam.update(dt)) this.needsRender = true;

    if (this.pointer.dirty) {
      this.pointer.dirty = false;
      const t = this.pick(this.pointer.x, this.pointer.y);
      if (t !== this.hoverTile) {
        this.hoverTile = t;
        this.onTileHover(t);
      }
    }

    const now = performance.now();
    if (!this.needsRender && now - this.lastRender < 1000 / IDLE_FPS) return;
    this.needsRender = false;
    this.lastRender = now;
    this.updateSun();
    this.cullProps();
    this.terrainMat.setTime(now / 1000);
    this.renderer.render(this.scene, this.camera);
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function fract(x: number): number { return x - Math.floor(x); }

function drawUnitIcon(ctx: CanvasRenderingContext2D, color: string, icon: string, stack: number, hp: number, selected: boolean, fortified: boolean): void {
  const cx = 64, cy = 60;
  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 44, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = fortified ? '#ffd43b' : 'rgba(10,12,20,0.9)';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 5;
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(icon, cx, cy + 3);
  ctx.fillText(icon, cx, cy + 3);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(24, 112, 80, 10);
  ctx.fillStyle = hp > 60 ? '#51cf66' : hp > 30 ? '#fcc419' : '#ff6b6b';
  ctx.fillRect(26, 114, 76 * Math.max(0, hp) / 100, 6);
  if (stack > 1) {
    ctx.beginPath();
    ctx.arc(104, 22, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(String(stack), 104, 23);
  }
}

function drawCityLabel(ctx: CanvasRenderingContext2D, color: string, label: string): void {
  ctx.font = 'bold 44px system-ui, sans-serif';
  const w = Math.min(500, ctx.measureText(label).width + 40);
  const x = (512 - w) / 2;
  ctx.fillStyle = 'rgba(12,14,22,0.82)';
  ctx.beginPath();
  ctx.roundRect(x, 14, w, 68, 18);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 50);
}
