import * as THREE from 'three';
import { unitDef } from './rules.ts';
import { GlobeCamera } from './camera.ts';
import type { Game, Unit, City } from './game.ts';
import { SNOW, tileLook, type TileLook } from './look.ts';
import { buildTerrainMesh, locate, newSample, type TerrainMesh } from './terrainMesh.ts';
import { makeTerrainMaterial, makeTable, FAN_ROWS, TILE_ROWS, IMPROVEMENT_CODE, BURNT_CODE, type TerrainMaterial } from './terrainMaterial.ts';
import { makeSmoke, type Emitter, type Smoke } from './smoke.ts';
import { buildPaintData, fanCoords, fanFrames, paintAt, softAt, warpAt, FAN_COORDS, FINE_MAX, FINE_WAVELENGTH, type PaintData, type FanFrame } from './paint.ts';
import { buildRelief, CONE_RADIUS, CRATER, CRATER_DEPTH, type Relief } from './relief.ts';
import { buildSurface, meshLevels, type SurfaceLayers } from './surface.ts';
import { cityGround } from './terraform.ts';
import type { Density } from './town/geometry.ts';
import { makeWaterMaterial, type WaterMaterial } from './water.ts';
import { WalkCamera } from './walk.ts';
import { makeSky, makeHalo, installHaze, HAZE, HAZE_DENSITY, AIR } from './sky.ts';
import { makeWeather, type Weather } from './weather.ts';
import { buildPropGeometry, catalogEntry, CATALOG, CATALOG_KINDS, type CatalogKind, type Layer } from './propCatalog.ts';
import { BUILDING_KINDS, buildBuildingGeometry, type BuildingKind } from './buildingCatalog.ts';
import { houseGeometry, type HouseKind } from './houses.ts';
import { civicGeometry, isCivicKind, type CivicKind } from './civic.ts';
import { CityProps, type CitySpot } from './cityProps.ts';
import { roadLines, ROAD_HALF_WIDTH } from './roads.ts';
import { Vegetation, type SpotEnv } from './vegetation.ts';
import { mulberry32, makePerlin } from './rng.ts';
import { USE, WONDERS, improvementFor, type ImprovementKey } from './cities.ts';
import { makePropMaterial, instanceGeometry } from './propMaterial.ts';

const FOG = new THREE.Color(0x0b0e15);

const UP = new THREE.Vector3(0, 1, 0);
// Subdivisions per tile fan; higher = smoother relief, more triangles. Tiles
// near water and relief get 2× or 4× this (see the mesh levels below).
const SUBDIV = 4;
// Props: size relative to the original models, and the number of chunks they
// are grouped in for horizon culling. (Variant densities are per flat tile at
// the reference tile size.)
const PROP_SIZE = 0.276;
// Snowline of ground that never has snow (above any peak).
const NO_SNOW = 1;
// Per-instance variety: random tilt (radians) and color shift per channel.
const MAX_LEAN = (6 * Math.PI) / 180;
const HUE_JITTER = 0.12;
// Camera altitude (globe radii, at the reference tile size) above which each
// layer of props is too small to see and is not drawn.
const HIDE_ABOVE = { Canopy: Infinity, Accent: Infinity, Understory: 1.6, Ground: 0.8 } as const;
const PROP_CHUNKS = 8;

// Flora and city buildings share the chunks; town lots (houses.ts) are
// models of their own, made on first use.
type PropKind = CatalogKind | BuildingKind | HouseKind | CivicKind;
const PROP_KINDS: readonly PropKind[] = [...CATALOG_KINDS, ...BUILDING_KINDS];
const isFloraKind = (k: PropKind): k is CatalogKind => k in CATALOG;

interface PropChunk {
  dir: THREE.Vector3;  // chunk center
  radius: number;      // angular radius, with a margin for prop size
  tiles: number[];
  meshes: Map<PropKind, THREE.InstancedMesh>;
}

interface PlacedProp {
  kind: PropKind;
  matrix: THREE.Matrix4;
  color: THREE.Color; // per-instance shade and slight hue shift
  leaf: THREE.Color;  // leaf color (the model's own, or a variant's tint)
}

// Reference tile spacing (radians) that unit/city sizes were tuned for.
const REF_EDGE = 0.07;

export type DebugView = 'normal' | 'height' | 'water';

// Flora yields to cities: the share of each layer's props that stays on a
// rural tile (fields keep hedgerow trees; camps keep their forest). Built
// tiles keep whatever stands clear of their buildings and streets
// (cityProps.floraClear); `urban` is that share for a rural tile with no
// improvement.
const FLORA_KEEP: Record<'urban' | ImprovementKey, Record<Layer, number>> = {
  urban:   { Canopy: 0.06, Understory: 0.04, Ground: 0, Accent: 0 },
  farm:    { Canopy: 0.2, Understory: 0.12, Ground: 0.08, Accent: 0.3 },
  mine:    { Canopy: 0.35, Understory: 0.35, Ground: 0.35, Accent: 0.6 },
  quarry:  { Canopy: 0.35, Understory: 0.35, Ground: 0.35, Accent: 0.6 },
  camp:    { Canopy: 0.85, Understory: 0.7, Ground: 0.8, Accent: 1 },
  wetland: { Canopy: 0.6, Understory: 0.6, Ground: 0.5, Accent: 1 },
  boats:   { Canopy: 1, Understory: 1, Ground: 1, Accent: 1 },
};

// Roads between cities, and streets: dirt, then paving from the Classical era.
const ROAD_RGB = [0.62, 0.55, 0.43] as const;
const DIRT_RGB = [0.55, 0.49, 0.39] as const;
const PAVED_RGB = [0.5, 0.46, 0.41] as const;
// Road surfaces: points across the width (shares of the half width: edges,
// kerbs or worn edges, ruts, the middle), and points along at least every
// ROAD_STEP tile steps.
const ROAD_ACROSS = [-1, -0.88, -0.45, 0, 0.45, 0.88, 1] as const;
const ROAD_MID = 3;
const ROAD_STEP = 0.012;
const ROAD_LIFT = 0.00004; // nearly flush with the ground
const ROAD_SURFACE = 0.84;  // the surface layer's share of the street's width (the rest shows the edges)
const ROAD_LAYER = 0.00002; // how far the surface sits above the edges
const ROAD_KERB = [0.62, 0.59, 0.54] as const;
const SQUARE_GROW = 0.022; // squares reach this far (tile steps) under the streets round them
const SHADOW_NORMAL_TEXELS = 1.5;
const WALK_FOV = 55;
// The look (chosen by comparing in a now-removed panel): a 35° lens from
// further back (flatter perspective, less of a small planet); a white sun
// fairly low in the sky over an even, cool sky fill; the sun cooler toward
// the poles.
const LENS = 35;
const LIGHT = { sunColor: 0xffffff, sun: 2.5, sunHeight: 35, fill: 1.0, fillSky: 0xb9cdea, fillGround: 0x4f4232, exposure: 1.0, cool: 2 / 3 };
const SUN_COOL = new THREE.Color(0xe4edff);
// Bridges (heights × the world scale; spans in tile steps): the deck stands
// at least BRIDGE_CLEAR over the water and arches up to BRIDGE_ARCH more on
// a long span; parapets rise BRIDGE_PARAPET over the deck, the slab is
// BRIDGE_THICK deep; piers stand about every BRIDGE_PIER_STEP.
const BRIDGE_CLEAR = 0.0004;
const BRIDGE_ARCH = 0.0002;
const BRIDGE_PARAPET = 0.0002;
const BRIDGE_THICK = 0.00015;
const BRIDGE_PIER_STEP = 0.05;
const BRIDGE_DEPTH = 0.00015; // water at least this deep gets a bridge
const BRIDGE_SPANDREL = 0.0003; // stone arches: how far the sides reach down at the piers
const BRIDGE_TIMBER = 0x7a5f45;
const BRIDGE_STONE = 0xa49c8c;
// The ground under a direction: its tile, the ground and water as drawn,
// and the land before rivers cut into it (radii).
type Ground = (d: THREE.Vector3) => { t: number; ground: number; water: number; land: number };
interface Bridges { pos: number[]; col: number[] }
interface Batch { pos: number[]; col: number[] }
interface RoadBatches { edge: Batch; top: Batch }

// A tile highlighted in the overlay (growth placement options).
export interface TileMark {
  tile: number;
  color: number;
  opacity: number;
}

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
  // The sky fill: light from every direction (cool sky above, dark earth below).
  private readonly fill = new THREE.HemisphereLight(LIGHT.fillSky, LIGHT.fillGround, LIGHT.fill);
  private readonly lastView = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private shadowsDirty = true;
  private readonly cam: GlobeCamera;
  private readonly walk: WalkCamera;
  private readonly sky = makeSky();
  private readonly halo = makeHalo();
  private readonly weather: Weather;
  private readonly stars: THREE.PointsMaterial;
  private readonly sunDir = new THREE.Vector3();
  private walkHint: HTMLElement | null = null;
  private lastFrame = performance.now();
  private readonly raycaster = new THREE.Raycaster();
  private readonly scale: number; // world size of one tile relative to REF_EDGE

  private readonly terrain: TerrainMesh;
  private readonly terrainMat: TerrainMaterial;
  private readonly waterMat: WaterMaterial;
  private readonly waterMesh: THREE.Mesh;
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

  private readonly propMat = makePropMaterial(0, 0.85, this.sunDir);
  private readonly buildingMat = makePropMaterial(0.32, 0.6, this.sunDir);
  private readonly propGeo = new Map<PropKind, THREE.BufferGeometry>();
  private readonly vegetation: Vegetation;
  // Per terrain vertex, for prop placement: ground slope, signed distance to
  // the shore and the direction away from it.
  private readonly vertSlope: Float32Array;
  private readonly vertCoast: Float32Array;
  private readonly vertInland: Float32Array;
  private readonly chunks: PropChunk[] = [];
  private readonly tileChunk: PropChunk[] = [];
  private readonly propCache = new Map<number, PlacedProp[]>();
  private readonly craters = new THREE.Group();
  private readonly unitsGroup = new THREE.Group();
  private readonly citiesGroup = new THREE.Group();
  private readonly overlayGroup = new THREE.Group();
  private borders: THREE.Mesh | null = null;
  private cityProps: CityProps;
  private readonly smoke: Smoke;
  private groundVersion = -1;
  private readonly levelled = new Set<number>();
  private roads: THREE.Mesh[] = [];
  // The road layers' materials: edges below, the surface above (see drape).
  // Edges (kerbs) and surfaces. Kerbs draw first and leave the depth alone,
  // so any surface covers any kerb where they overlap (a street running
  // into a square or another street): kerbs show only round the outside of
  // the joined network, never as lines across it.
  private readonly roadMats = [makeRoadMaterial(-2, false), makeRoadMaterial(-4, true)];
  private bridges: THREE.Mesh | null = null;
  private readonly bridgeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private roadsKey = '';
  private readonly prevUse: Uint8Array;
  // City ground (terraform.ts): the surface's layers, the heights as built,
  // the vertices reshaped so far, what they were reshaped for.
  private readonly layers: SurfaceLayers;
  private readonly origHeight: Float32Array;
  private reshaped = new Set<number>();
  private groundKey = '';
  private readonly textures = new Map<string, THREE.CanvasTexture>();

  private pointer = { x: 0, y: 0, dirty: false };
  private downAt: { x: number; y: number } | null = null;
  private hoverTile = -1;

  private readonly abort = new AbortController();
  private readonly fpsEl: HTMLElement | null = document.getElementById('fps');
  private fpsFrames = 0;
  private fpsWork = 0;
  private fpsTris = 0;
  private fpsSince = performance.now();

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.game = game;
    this.scale = game.globe.avgEdgeAngle / REF_EDGE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // Pixels are the main cost: 1.5 keeps Retina screens sharp at about half
    // the work of 2.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    // Neutral tone mapping keeps the pastel palette saturated (ACES washes it out).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = LIGHT.exposure;
    this.scene.background = new THREE.Color(0x04050a);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.005, 200);
    this.camera.position.set(0, 0, 3.4);
    this.scene.add(this.camera);
    // The sun keeps a fixed angle to the camera (behind it, a little to the left) so the
    // visible side is always lit; it is repositioned every frame (see
    // updateSun) so its shadow map only covers what is on screen. The
    // hemisphere light fills shadows with a cool sky tone.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Shadows re-render only when the view or the world changes (laptops).
    this.renderer.shadowMap.autoUpdate = false;
    this.sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sun);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.003;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.fill);

    // Terrain radius at a direction (the tile under it), or the highest tile
    // center around it (for the camera's clearance).
    let near = 0;
    this.cam = new GlobeCamera(this.camera, canvas, (dir, highest) => {
      if (!this.terrain) return 1.008; // not built yet
      near = this.nearestTile(dir, near);
      let r = this.terrain.centerRadius[near];
      if (highest) for (const nb of this.game.tiles[near].neighbors) r = Math.max(r, this.terrain.centerRadius[nb]);
      return r;
    }, this.abort.signal);
    let walkHint = 0;
    this.walk = new WalkCamera(this.camera, canvas, (dir) => {
      const at = locate(this.game.globe, dir, walkHint);
      walkHint = at.t;
      return this.terrain.at(at.t, at.i, at.wa, at.wb);
    }, this.abort.signal);
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'v' || e.key === 'V') this.setWalking(!this.walk.active);
      else if (e.key === 'h' || e.key === 'H') this.setGrid(!this.grid);
      else if (e.key === 'Escape' && this.walk.active) this.setWalking(false);
    }, { signal: this.abort.signal });
    this.stars = new THREE.PointsMaterial({ color: 0xaab4cc, size: 1.4, sizeAttenuation: false, fog: false, transparent: true });
    this.scene.add(this.sky.mesh);
    installHaze();
    this.scene.fog = new THREE.FogExp2(HAZE.getHex(), HAZE_DENSITY);

    const g = game;
    const N = g.N;
    this.looks = g.tiles.map((t) => tileLook(g.map, t.id));
    const L = this.looks;
    this.paint = buildPaintData(g.globe, g.map, g.seed);
    this.frames = fanFrames(g.globe);
    const params = this.paint.params;
    this.relief = buildRelief(g.globe, g.map, L, g.seed, params.r0);
    const frames = this.frames, fans = this.paint.fans;
    const levels = meshLevels(g.globe, g.map, L);
    let coast: Float32Array | null = null;
    let layers: SurfaceLayers | null = null;
    this.terrain = buildTerrainMesh(g.globe, {
      level: (t) => levels[t] as 1 | 2 | 4,
      surface: (topo) => {
        const sf = buildSurface(g.globe, g.map, L, this.paint, this.relief, g.seed, topo);
        coast = sf.coast;
        layers = sf.layers;
        return sf.fields;
      },
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
    this.layers = layers!;
    this.origHeight = this.terrain.fields.height.slice();
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
      fd.set([f.warp[4], f.sim[4], f.sim[5]], o + 16);
      fd.set(f.sim.slice(0, 4), o + 20);
    });

    // Per-vertex shade (baked occlusion and a fine tint) and the snowline,
    // fixed for the whole game. Snow caps sit high on mountain crests,
    // measured against each tile's peak: glaciers are iced from about halfway
    // up, other cold peaks get a small tip, warm peaks (e.g. near the equator)
    // stay bare. The shader compares each pixel's altitude with the snowline.
    const V = this.terrain.vertRadius.length;
    const shade = new Float32Array(V);
    const snow = new Float32Array(V).fill(NO_SNOW);
    for (let v = 0; v < V; v++) {
      const x = this.terrain.vertDir[v * 3], y = this.terrain.vertDir[v * 3 + 1], z = this.terrain.vertDir[v * 3 + 2];
      const tint = Math.sin(x * 97.1 + y * 41.3) * Math.cos(z * 83.7 - x * 29.9) * Math.sin(y * 61.7 + z * 17.3);
      shade[v] = (1 + 0.07 * tint) * this.terrain.vertAO[v];
    }
    for (let t = 0; t < N; t++) {
      if (g.relief[t] !== 'mountains' || this.relief.peak[t] <= 0) continue;
      const capFrom = g.feature[t] === 'glacier' ? 0.55 : g.map.temperature[t] < 3 ? 0.8 : null;
      if (capFrom === null) continue;
      const line = this.relief.base[t] + (capFrom + 0.08) * this.relief.peak[t];
      for (const v of this.terrain.tileVerts[t]) snow[v] = Math.min(snow[v], line);
    }
    this.vegetation = new Vegetation(g.globe, g.map, g.flora, L, this.relief.base, this.relief.peak, params.r0, g.seed);
    ;[this.vertSlope, this.vertCoast, this.vertInland] = slopeAndShore(this.terrain, coast!);
    // Forest floors sit in the canopy's shade.
    for (let t = 0; t < N; t++) {
      if (!this.vegetation.isForest(t)) continue;
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
    // The water surface, hidden under fog of war like the ground.
    const W = this.terrain.waterVerts.length;
    this.terrain.water.setAttribute('unexplored', new THREE.BufferAttribute(new Float32Array(W).fill(1), 1));
    this.terrain.water.setAttribute('dim', new THREE.BufferAttribute(new Float32Array(W), 1));
    this.waterMat = makeWaterMaterial();
    this.waterMesh = new THREE.Mesh(this.terrain.water, this.waterMat.material);
    this.waterMesh.receiveShadow = true;
    this.waterMesh.renderOrder = 1;
    this.scene.add(this.waterMesh);
    this.weather = makeWeather(g.globe, g.map.rainfall, g.map.temperature, params.r0, g.seed);
    this.scene.add(this.weather.group);
    this.prevExplored = new Uint8Array(N).fill(255);
    this.prevVisible = new Uint8Array(N).fill(255);
    this.prevOwner = new Int32Array(N).fill(-2);
    this.buildBackdrop();

    const s = this.scale;
    // Props are drawn per chunk of the globe, one instanced mesh per kind, so
    // chunks behind the horizon or off screen cost nothing.
    for (const kind of CATALOG_KINDS) this.propGeo.set(kind, buildPropGeometry(kind, s * 1.5 * PROP_SIZE));
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
      this.tileChunk[tile.id] = c;
      c.radius = Math.max(c.radius, c.dir.angleTo(tile.center) + 2 * g.globe.avgEdgeAngle);
    }
    this.scene.add(this.craters);
    for (const kind of BUILDING_KINDS) this.propGeo.set(kind, buildBuildingGeometry(kind).scale(s * 1.5 * PROP_SIZE, s * 1.5 * PROP_SIZE, s * 1.5 * PROP_SIZE));
    this.prevUse = new Uint8Array(N);
    let hint = 0;
    this.cityProps = new CityProps(g, (t, i, wa, wb) => this.citySpot(t, i, wa, wb), (d) => {
      const l = locate(g.globe, d, hint);
      hint = l.t;
      return { ...this.citySpot(l.t, l.i, l.wa, l.wb), t: l.t };
    }, s);
    this.scene.add(this.unitsGroup, this.citiesGroup, this.overlayGroup);
    this.smoke = makeSmoke(s);
    this.scene.add(this.smoke.points);

    this.bindInput(canvas);
    const resize = () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    };
    addEventListener('resize', resize, { signal: this.abort.signal });
    resize();
    this.cam.setLens(LENS);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- public API ----------

  // Stops drawing and frees the GPU resources.
  dispose(): void {
    this.abort.abort();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // A density set by hand for a built-up tile (null: the rules decide).
  setDensity(t: number, d: Density | null): void {
    this.cityProps.setDensity(t, d);
  }
  densityOf(t: number): Density {
    return this.cityProps.densityOf(t);
  }

  focusOn(tile: number): void {
    this.cam.focus(this.game.tiles[tile].center);
  }


  // Jump straight to a tile at the given camera distance (debug / screenshots).
  lookAt(tile: number, distance: number): void {
    this.cam.jump(this.game.tiles[tile].center, distance - 1);
  }

  // Redraw everything that depends on game state.
  syncWorld(sel: Selection): void {
    this.shadowsDirty = true;
    const changed = this.changedTiles();
    if (changed.length) {
      this.updateColors(changed);
      this.updateBorders();
    }
    // City tiles: the ground, the flora that yields to them, the buildings.
    const dirty = new Set<PropChunk>();
    const g = this.game;
    let useChanged = false;
    for (let t = 0; t < g.N; t++) {
      if (g.use[t] === this.prevUse[t]) continue;
      this.prevUse[t] = g.use[t];
      useChanged = true;
      for (const x of [t, ...g.tiles[t].neighbors]) { this.propCache.delete(x); dirty.add(this.tileChunk[x]!); }
    }
    if (useChanged || this.groundVersion !== g.useVersion) { this.groundVersion = g.useVersion; this.updateCityGround(); }
    // Built-up ground is drained (before anything is placed there).
    for (const t of this.terraform()) { this.propCache.delete(t); dirty.add(this.tileChunk[t]!); }
    // Summits levelled for wonders standing on them (before anything is placed there).
    for (const [w, t] of g.wondersBuilt) {
      if (WONDERS[w].site !== 'mountainTop' || this.levelled.has(t) || !g.wonderAt[t]) continue;
      this.levelSummit(t);
      for (const x of [t, ...g.tiles[t].neighbors]) { this.propCache.delete(x); dirty.add(this.tileChunk[x]!); }
    }
    const townChanged = this.cityProps.changed();
    // (The flora on a town's tiles stays clear of what the town builds.)
    for (const t of townChanged) for (const x of [t, ...g.tiles[t].neighbors]) { this.propCache.delete(x); dirty.add(this.tileChunk[x]!); }
    if (changed.length) this.updateProps(); else if (dirty.size) this.updateProps(dirty);
    this.updateRoads(changed.length > 0 || townChanged.length > 0);
    this.updateSmoke();
    this.updateCities();
    this.updateUnits(sel);
  }

  // Redraw selection ring, hover ring, path preview and tile marks.
  syncOverlay(sel: Selection, hover: number, path: number[] | null, marks: readonly TileMark[] = []): void {
    for (const o of this.overlayGroup.children) if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
    this.overlayGroup.clear();
    for (const m of marks) this.overlayGroup.add(this.ring(m.tile, m.color, m.opacity));
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

  // Hex grid lines on or off (off by default, as in Civ V; selection and
  // hover rings always show).
  private grid = false;
  // Debug views of the terrain: the height map (contours, no water) or the
  // water (colored by source, steps in red). Props and clouds are hidden.
  view: DebugView = 'normal';
  setView(mode: DebugView): void {
    this.view = mode;
    const m = mode === 'normal' ? 0 : mode === 'height' ? 1 : 2;
    this.terrainMat.setView(m);
    this.waterMat.setView(m);
    this.waterMesh.visible = mode !== 'height';
    this.weather.group.visible = mode === 'normal' && this.clouds;
    this.shadowsDirty = true;
  }

  // Clouds and rain on or off (the debug views always hide them).
  clouds = true;
  setClouds(on: boolean): void {
    this.clouds = on;
    this.weather.group.visible = on && this.view === 'normal';
  }

  setGrid(on: boolean): void {
    this.grid = on;
    this.terrainMat.setGrid(on);
    this.waterMat.setGrid(on);
  }

  // Walk mode on or off: walking starts where the map view looks, facing up
  // the screen; leaving it puts the map view over where you stood.
  setWalking(on: boolean): void {
    if (on === this.walk.active) return;
    if (on) {
      const up = this.camera.up.clone();
      this.walk.enter(this.cam.target, up.addScaledVector(this.cam.target, -up.dot(this.cam.target)));
      this.camera.near = 0.00008;
      this.camera.fov = WALK_FOV; // at eye level, a natural field of view whatever the map's lens
    } else {
      this.walk.exit();
      this.cam.place(this.walk.position, this.walk.facing, 0.1);
      this.camera.near = 0.005;
      this.camera.fov = LENS;
    }
    this.cam.enabled = !on;
    this.camera.updateProjectionMatrix();
    this.shadowsDirty = true;
    if (on && !this.walkHint) {
      this.walkHint = document.createElement('div');
      this.walkHint.id = 'walkhint';
      this.walkHint.className = 'panel';
      this.walkHint.innerHTML = 'Walk mode · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run · mouse: look (click to capture) · <kbd>V</kbd>/<kbd>Esc</kbd> back to the map';
      document.body.appendChild(this.walkHint);
    }
    this.walkHint?.classList.toggle('hidden', !on);
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
    this.scene.add(new THREE.Points(sg, this.stars));

    this.scene.add(this.halo.mesh);
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

  // Color of tile t as seen by the player; `snow` shows its snow instead,
  // `tint` the owner's color (the shader mixes it in only from afar).
  private displayColor(t: number, snow: boolean, out: THREE.Color, tint = false): THREE.Color {
    const g = this.game;
    if (!g.explored[t]) return out.copy(FOG);
    const owner = g.ownerOf(t);
    out.copy(tint ? (owner >= 0 ? this.playerColors[owner]! : FOG) : snow ? SNOW : this.baseColors[t]);
    if (!g.visible[t]) {
      const gray = (out.r + out.g + out.b) / 3;
      out.setRGB(lerp(out.r, gray, 0.6) * 0.5, lerp(out.g, gray, 0.6) * 0.5, lerp(out.b, gray, 0.6) * 0.5);
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
      this.displayColor(t, false, c, true);
      td[o + 24] = c.r; td[o + 25] = c.g; td[o + 26] = c.b; td[o + 27] = g.explored[t] && g.ownerOf(t) >= 0 ? 1 : 0;
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
    // Water: per shared vertex, from the tiles it touches.
    const owners = this.terrain.topo.owners;
    const wFog = this.terrain.water.getAttribute('unexplored') as THREE.BufferAttribute;
    const wDim = this.terrain.water.getAttribute('dim') as THREE.BufferAttribute;
    const wf = wFog.array as Float32Array, wd = wDim.array as Float32Array;
    this.terrain.waterVerts.forEach((sv, n) => {
      let count = 0, hidden = 0, unseen = 0;
      for (let s = 0; s < 3; s++) {
        const t = owners[sv * 3 + s];
        if (t < 0) continue;
        count++;
        if (!g.explored[t]) hidden++;
        else if (!g.visible[t]) unseen++;
      }
      wf[n] = hidden / count;
      wd[n] = unseen / Math.max(1, count - hidden);
    });
    wFog.needsUpdate = true;
    wDim.needsUpdate = true;
  }

  // Props (trees, shrubs, rocks, reeds...) of one tile, placed once and cached.
  // Spots come from a jittered triangular lattice in each fan of the tile, so
  // props keep an even, natural spacing (no clumps). Each spot takes the props
  // of whichever tile the painting shows there, so forests feather into their
  // neighbors exactly where the ground color does; what stands there and how
  // likely a spot is used follow the ground under it (vegetation.ts).
  // Everything is fixed by the tile id, so props never move between reloads.
  private placeProps(t: number): PlacedProp[] {
    const cached = this.propCache.get(t);
    if (cached) return cached;
    const g = this.game, veg = this.vegetation, topo = this.terrain.topo;
    const out: PlacedProp[] = [];
    const tile = g.tiles[t];
    const most = Math.max(veg.maxDensity(t), ...tile.neighbors.map((u) => veg.maxDensity(u)));
    if (most > 0) {
      const co = new Float32Array(FAN_COORDS);
      const delta = [0, 0, 0];
      const q = new THREE.Quaternion(), sc = new THREE.Vector3(), axis = new THREE.Vector3();
      const smp = newSample();
      const rand = mulberry32(t * 7919 + 1);
      const k = tile.corners.length;
      const r0 = this.paint.params.r0;
      const bank = this.terrain.fields.ground['bank']!;
      let ancient = veg.hasAncientTree(t);
      // Rows of the lattice per fan: enough spots for the densest look nearby.
      const m = Math.max(1, Math.ceil((Math.sqrt(8 * (most / k) + 1) - 1) / 2));
      const spots = (k * m * (m + 1)) / 2;
      const env: SpotEnv = { t, i: 0, r: 0, u: t, dir: new THREE.Vector3(), ground: 0, water: 0, slope: 0, bank: 0, coast: 0, inland: new THREE.Vector3() };
      for (let i = 0; i < k; i++) {
        for (let a = 0; a < m; a++) {
          for (let b = 0; a + b < m; b++) {
            const pick = rand(), keep = rand(), spin = rand(), sz = rand(), tall = rand(), tint = rand(), seed = rand();
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
            if (veg.maxDensity(u) === 0) continue;
            // The ground here.
            const lv = this.terrain.at(t, i, wa, wb);
            topo.sample(t, i, wa, wb, smp);
            env.i = i; env.r = wa + wb; env.u = u; env.dir.copy(d);
            env.ground = lv.ground - 1; env.water = lv.water - 1;
            env.slope = 0; env.bank = 0; env.coast = 0; env.inland.set(0, 0, 0);
            for (let c = 0; c < 3; c++) {
              const v = smp.v[c], w = smp.w[c];
              env.slope += w * this.vertSlope[v];
              env.bank += w * bank[v];
              env.coast += w * this.vertCoast[v];
              env.inland.x += w * this.vertInland[v * 3]; env.inland.y += w * this.vertInland[v * 3 + 1]; env.inland.z += w * this.vertInland[v * 3 + 2];
            }
            env.coast /= r0;
            if (env.inland.lengthSq() > 1e-6) env.inland.normalize();
            // Gentle large-scale variation in density, never clearings.
            const vary = 0.85 + 0.3 * this.propNoise.fbm(p.x * 9, p.y * 9, p.z * 9, 2);
            if (keep >= Math.min(1, (veg.density(env) / spots) * vary)) continue;
            const prop = veg.pick(env, mulberry32(Math.floor(seed * 4294967296)), ancient && u === t);
            if (!prop) continue;
            // Flora yields to cities.
            const use = g.use[u];
            // (What grows in the water, mangroves and reeds, stays: no house stands there.)
            const inWater = env.water - env.ground > 0 && catalogEntry(prop.kind).water !== undefined;
            // On built ground the tile's own flora stays where it stands clear of
            // the buildings and streets (a town keeps its trees, never adds any).
            if ((use === USE.urban || use === USE.center) && !inWater) {
              if (!this.cityProps.floraClear(u, d)) continue;
            } else if (use !== USE.wild && !inWater) {
              const imp = use === USE.rural ? improvementFor(g.terrainAt(u)) : null;
              const keepShare = FLORA_KEEP[use === USE.rural ? imp ?? 'urban' : 'urban'][CATALOG[prop.kind].layer];
              if (rand() >= keepShare) continue;
            }
            if (prop.ancient) ancient = false;
            q.setFromUnitVectors(UP, d);
            q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin * Math.PI * 2));
            // Lean: toward the coast's wind direction, or a slight random tilt.
            const lean = prop.lean ?? axis.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).addScaledVector(d, -axis.dot(d));
            if (lean.lengthSq() > 1e-9) {
              const angle = prop.lean ? prop.leanAngle : tint * MAX_LEAN;
              q.premultiply(new THREE.Quaternion().setFromAxisAngle(d.clone().cross(lean).normalize(), angle));
            }
            const size = (0.8 + 0.45 * sz) * prop.size;
            let stretch = 0.9 + 0.3 * tall;
            // Under water (kelp, coral): the top stays under the surface.
            if (catalogEntry(prop.kind).water?.kind === 'bed') {
              const top = this.propHeight(prop.kind) * size * stretch;
              const room = 0.85 * (env.water - env.ground);
              if (top > room) stretch *= room / top;
            }
            const shade = 0.82 + 0.36 * tint;
            const color = new THREE.Color(shade * (1 + (rand() - 0.5) * HUE_JITTER), shade * (1 + (rand() - 0.5) * HUE_JITTER), shade * (1 + (rand() - 0.5) * HUE_JITTER));
            const pos = d.clone().multiplyScalar(1 + prop.height);
            out.push({
              kind: prop.kind, color,
              leaf: new THREE.Color(prop.leaf ?? CATALOG[prop.kind].leaf),
              matrix: new THREE.Matrix4().compose(pos, q, sc.set(size, size * stretch, size)),
            });
          }
        }
      }
    }
    this.propCache.set(t, out);
    return out;
  }

  // A prop's model: flora and catalog buildings made at the start (at prop
  // scale); a town lot made when first needed (in tile steps: its instances
  // carry the scale).
  private geometryOf(kind: PropKind): THREE.BufferGeometry {
    let g = this.propGeo.get(kind);
    if (!g) { g = isCivicKind(kind) ? civicGeometry(kind) : houseGeometry(kind as HouseKind); this.propGeo.set(kind, g); }
    return g;
  }

  // Height of a prop model as drawn (before per-instance scaling).
  private propHeight(kind: CatalogKind): number {
    const g = this.propGeo.get(kind)!;
    if (!g.boundingBox) g.computeBoundingBox();
    return g.boundingBox!.max.y;
  }

  // Rebuilds the instanced props (flora and city buildings) of explored
  // tiles, chunk by chunk (only `only` if given).
  private updateProps(only?: Set<PropChunk>): void {
    const g = this.game;
    const color = new THREE.Color();
    for (const chunk of this.chunks) {
      if (only && !only.has(chunk)) continue;
      const lists = new Map<PropKind, { p: PlacedProp; dim: number }[]>();
      const add = (p: PlacedProp, dim: number) => {
        let l = lists.get(p.kind);
        if (!l) { l = []; lists.set(p.kind, l); }
        l.push({ p, dim });
      };
      for (const t of chunk.tiles) {
        if (!g.explored[t]) continue;
        const dim = g.visible[t] ? 1 : 0.38;
        for (const p of this.placeProps(t)) add(p, dim);
        for (const p of this.cityProps.place(t)) add(p, dim);
      }
      // (Every kind this chunk shows now, or showed before: those get emptied.)
      for (const kind of new Set<PropKind>([...PROP_KINDS, ...lists.keys(), ...chunk.meshes.keys()])) {
        const items = lists.get(kind) ?? [];
        let mesh = chunk.meshes.get(kind);
        if (!mesh || mesh.instanceMatrix.count < items.length) {
          if (mesh) { this.scene.remove(mesh); mesh.dispose(); mesh.geometry.getAttribute('leafTint')?.array && mesh.geometry.deleteAttribute('leafTint'); }
          if (items.length === 0) { chunk.meshes.delete(kind); continue; }
          const cap = Math.ceil(items.length * 1.3) + 8;
          mesh = new THREE.InstancedMesh(instanceGeometry(this.geometryOf(kind), cap), isFloraKind(kind) ? this.propMat : this.buildingMat, cap);
          // Ground cover is too small to cast a visible shadow (and skipping it saves draw calls).
          mesh.castShadow = !isFloraKind(kind) || CATALOG[kind].layer !== 'Ground';
          mesh.userData['hideAbove'] = isFloraKind(kind) ? HIDE_ABOVE[CATALOG[kind].layer] : Infinity;
          chunk.meshes.set(kind, mesh);
          this.scene.add(mesh);
        }
        const leaf = mesh.geometry.getAttribute('leafTint') as THREE.InstancedBufferAttribute;
        items.forEach(({ p, dim }, i) => {
          mesh.setMatrixAt(i, p.matrix);
          mesh.setColorAt(i, color.copy(p.color).multiplyScalar(dim));
          // Out of sight, leaves lose their color like the ground does.
          const k = dim < 1 ? 0.6 : 0, gray = (p.leaf.r + p.leaf.g + p.leaf.b) / 3;
          leaf.setXYZ(i, p.leaf.r + (gray - p.leaf.r) * k, p.leaf.g + (gray - p.leaf.g) * k, p.leaf.b + (gray - p.leaf.b) * k);
        });
        mesh.count = items.length;
        mesh.instanceMatrix.needsUpdate = true;
        leaf.needsUpdate = true;
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
    // Small props vanish when they would be under a pixel or so.
    const altitude = (dist - 1) / this.scale;
    for (const chunk of this.chunks) {
      const seen = camDir.angleTo(chunk.dir) < horizon + chunk.radius;
      for (const mesh of chunk.meshes.values()) mesh.visible = this.view === 'normal' && seen && altitude < (mesh.userData['hideAbove'] as number);
    }
  }

  // A glowing lava pool in each explored volcano's crater (the crater itself
  // is part of the relief).
  private updateCraters(): void {
    const g = this.game;
    for (const c of this.craters.children) if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    this.craters.clear();
    const r0 = this.paint.params.r0;
    for (let t = 0; t < g.N; t++) {
      if (g.feature[t] !== 'volcano' || !g.explored[t]) continue;
      // A flat pool filling the bottom third of the crater bowl; the bowl's
      // walls rise through its rim.
      const lava = new THREE.Mesh(new THREE.CircleGeometry(0.75 * CRATER * CONE_RADIUS * r0, 20),
        new THREE.MeshBasicMaterial({ color: g.visible[t] ? 0xff6a1a : 0x7a3a1a }));
      lava.position.copy(this.surface(t, 0.33 * CRATER_DEPTH * this.relief.peak[t]));
      lava.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.tiles[t].center);
      this.craters.add(lava);
    }
  }

  // Ribbon along the inside of edge i of tile t, following the terrain.
  private edgeRibbon(t: number, i: number, outer: number, inner: number, lift: number, out: number[]): void {
    const steps = SUBDIV * 2;
    const pt = (f: number, r: number) => {
      // On the ground, or on the water where it stands above the ground.
      const wa = (1 - f) * r, wb = f * r;
      const lv = this.terrain.at(t, i, wa, wb);
      return this.terrain.samplePoint(t, i, wa, wb).setLength(Math.max(lv.ground, lv.water) + lift);
    };
    for (let s = 0; s < steps; s++) {
      const f0 = s / steps, f1 = (s + 1) / steps;
      const a0 = pt(f0, outer), b0 = pt(f1, outer), a1 = pt(f0, inner), b1 = pt(f1, inner);
      for (const v of [a0, b0, b1, a0, b1, a1]) out.push(v.x, v.y, v.z);
    }
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

  // Reshapes built-up ground (terraform.ts: drained wetlands; hills kept
  // whole) when what is built up changed. Returns the tiles whose ground moved.
  private terraform(): number[] {
    const g = this.game;
    const built = (t: number) => g.use[t] === USE.urban || g.use[t] === USE.center || g.ruins[t] === 1;
    let key = '';
    for (let t = 0; t < g.N; t++) if (built(t)) key += `${t},`;
    if (key === this.groundKey) return [];
    this.groundKey = key;
    const topo = this.terrain.topo;
    const target = cityGround(g.globe, topo, this.layers, this.origHeight, this.terrain.fields.water, built, 1);
    const changes = new Map(target);
    for (const v of this.reshaped) if (!target.has(v)) changes.set(v, { height: this.origHeight[v]!, up: 0 });
    for (const [v, c] of [...changes]) if (this.terrain.fields.height[v] === c.height) changes.delete(v);
    if (!changes.size) return [];
    this.terrain.reshape(changes);
    this.reshaped = new Set(target.keys());
    // Slopes around what moved (props and buildings read them).
    const H = this.terrain.fields.height, D = topo.dir;
    const touched = new Set<number>();
    for (const v of changes.keys()) { touched.add(v); for (let j = topo.adjStart[v]; j < topo.adjStart[v + 1]; j++) touched.add(topo.adj[j]!); }
    for (const v of touched) {
      let best = 0;
      for (let j = topo.adjStart[v]; j < topo.adjStart[v + 1]; j++) {
        const n = topo.adj[j]!;
        const l = Math.hypot(D[n * 3]! - D[v * 3]!, D[n * 3 + 1]! - D[v * 3 + 1]!, D[n * 3 + 2]! - D[v * 3 + 2]!);
        if (l > 1e-7) best = Math.max(best, Math.abs(H[n]! - H[v]!) / l);
      }
      this.vertSlope[v] = best;
    }
    this.shadowsDirty = true;
    const tiles = new Set<number>();
    for (const v of changes.keys()) tiles.add(topo.tile[v]!);
    for (const t of [...tiles]) for (const n of g.tiles[t].neighbors) tiles.add(n);
    return [...tiles];
  }

  // Levels the top of a mountain tile for a wonder: within LEVEL_R of the
  // peak the ground is cut down to LEVEL_AT of the way up, easing back into
  // the slopes beyond; the cut is flat (its normals straight up).
  private levelSummit(t: number): void {
    this.levelled.add(t);
    const topo = this.terrain.topo, H = this.terrain.fields.height;
    const near = new Set([t, ...this.game.tiles[t].neighbors]);
    let peak = -1;
    for (let v = 0; v < topo.V; v++) if (topo.tile[v] === t && (peak < 0 || H[v]! > H[peak]!)) peak = v;
    if (peak < 0) return;
    const r0 = this.paint.params.r0;
    const R = 0.42 * r0, OUT = 0.75 * r0;
    const base = this.relief.base[t]!, cut = base + 0.78 * (H[peak]! - base);
    const px = topo.dir[peak * 3]!, py = topo.dir[peak * 3 + 1]!, pz = topo.dir[peak * 3 + 2]!;
    const changes = new Map<number, { height: number; up: number }>();
    for (let v = 0; v < topo.V; v++) {
      if (!near.has(topo.tile[v]!) || H[v]! <= cut) continue;
      const ang = Math.acos(Math.min(1, px * topo.dir[v * 3]! + py * topo.dir[v * 3 + 1]! + pz * topo.dir[v * 3 + 2]!));
      if (ang >= OUT) continue;
      const k = smoothstep(OUT, R, ang);
      changes.set(v, { height: H[v]! - k * (H[v]! - cut), up: k });
    }
    this.terrain.reshape(changes);
    this.shadowsDirty = true;
  }

  // City ground in the tile table (row 5, see terrainMaterial.ts): urban
  // and center tiles, and each rural tile's improvement pattern.
  private updateCityGround(): void {
    const g = this.game;
    const td = this.tileTex.image.data as Float32Array;
    for (let t = 0; t < g.N; t++) {
      const o = t * TILE_ROWS * 4 + 20;
      const u = g.use[t];
      const imp = u === USE.rural ? improvementFor(g.terrainAt(t)) : null;
      td[o] = u === USE.urban || u === USE.center ? 1 : 0;
      td[o + 2] = g.pillaged[t] ? BURNT_CODE : imp ? IMPROVEMENT_CODE[imp] : IMPROVEMENT_CODE.none;
      td[o + 3] = u === USE.center ? 1 : 0;
    }
    this.tileTex.needsUpdate = true;
  }

  // Smoke and fire in sight: damaged and burning cities, pillaged fields,
  // forge chimneys.
  private updateSmoke(): void {
    const g = this.game, s = this.scale;
    const out: Emitter[] = [];
    const at = (t: number, i: number, wa: number, wb: number) => {
      const p = this.terrain.samplePoint(t, i, wa, wb);
      return p;
    };
    for (const c of g.cities) {
      if (!g.visible[c.tile]) continue;
      const hurt = 1 - c.hp / g.cityMaxHp(c);
      if (hurt > 0.05 || c.razing) {
        const columns = c.razing ? 4 : hurt > 0.5 ? 3 : 1;
        for (let k = 0; k < columns; k++) {
          const p = at(c.tile, (k * 2) % g.tiles[c.tile].corners.length, 0.3, 0.15);
          out.push({ pos: p, kind: 'smoke' });
          if (c.razing || hurt > 0.5) out.push({ pos: p.clone(), kind: 'fire' });
        }
      }
      // Forges smoke from their chimneys.
      for (const t of [c.tile, ...g.cityTiles(c, USE.urban)]) {
        if (!g.visible[t]) continue;
        for (const b of this.cityProps.place(t)) {
          if (b.kind !== 'workshop' && b.kind !== 'smithy') continue;
          const p = new THREE.Vector3().setFromMatrixPosition(b.matrix);
          out.push({ pos: p.addScaledVector(p.clone().normalize(), 0.0045 * s), kind: 'chimney' });
        }
      }
    }
    for (let t = 0; t < g.N; t++) {
      if (!g.pillaged[t] || !g.visible[t]) continue;
      out.push({ pos: at(t, 0, 0.2, 0.2), kind: 'smoke' }, { pos: at(t, 3, 0.3, 0.1), kind: 'fire' });
    }
    this.smoke.set(out);
  }

  // Roads between cities (roads.ts), draped on the ground as dirt tracks
  // with soft edges. Rebuilt when the cities change (or what is explored).
  private updateRoads(force: boolean): void {
    const g = this.game;
    const key = g.cities.map((c) => `${c.id}:${c.owner}`).join(',');
    if (key === this.roadsKey && !force) return;
    this.roadsKey = key;
    const halfW = ROAD_HALF_WIDTH * g.globe.avgEdgeAngle, lift = ROAD_LIFT * this.scale;
    const batches: RoadBatches = { edge: { pos: [], col: [] }, top: { pos: [], col: [] } };
    let hint = 0;
    const smp = newSample(), pre = this.layers.preRiver;
    const at: Ground = (d: THREE.Vector3) => {
      const l = locate(g.globe, d, hint);
      hint = l.t;
      const lv = this.terrain.at(l.t, l.i, l.wa, l.wb);
      this.terrain.topo.sample(l.t, l.i, l.wa, l.wb, smp);
      const land = 1 + smp.w[0] * pre[smp.v[0]]! + smp.w[1] * pre[smp.v[1]]! + smp.w[2] * pre[smp.v[2]]!;
      return { t: l.t, ground: lv.ground, water: lv.water, land };
    };
    const bridges: Bridges = { pos: [], col: [] };
    for (const road of roadLines(g)) {
      // Stone bridges once either end has left the Ancient era.
      const stone = [road.a, road.b].some((id) => { const c = g.cityById.get(id); return c !== undefined && g.players[c.owner]!.era > 0; });
      this.drape(road.points, halfW, ROAD_RGB, batches, at, lift, bridges, stone);
    }
    // Streets and squares inside towns (cityProps.ts lays them out).
    for (const st of this.cityProps.streets()) this.drape(st.points, st.halfWidth, st.paved ? PAVED_RGB : DIRT_RGB, batches, at, lift, bridges, st.paved);
    for (const pv of this.cityProps.pavings()) this.pave(pv.points, pv.paved ? PAVED_RGB : DIRT_RGB, at, lift + ROAD_LAYER * this.scale, batches.top.pos, batches.top.col);
    for (const m of this.roads) { this.scene.remove(m); m.geometry.dispose(); }
    this.roads = [batches.edge, batches.top].map((bt, i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bt.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(bt.col, 3));
      windOutward(geo);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.roadMats[i]!);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1 + i;
      this.scene.add(mesh);
      return mesh;
    });
    if (this.bridges) {
      this.scene.remove(this.bridges);
      this.bridges.geometry.dispose();
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bridges.pos, 3));
    bgeo.setAttribute('color', new THREE.Float32BufferAttribute(bridges.col, 3));
    windOutward(bgeo);
    bgeo.computeVertexNormals();
    this.bridges = new THREE.Mesh(bgeo, this.bridgeMat);
    this.bridges.castShadow = true;
    this.bridges.receiveShadow = true;
    this.scene.add(this.bridges);
  }

  // A paved square: a fan from its middle, each point on the ground.
  // Squares are part of the street surface: the streets' own color, and
  // grown a little so they overlap the streets round them (no kerb between).
  private pave(corners: readonly THREE.Vector3[], rgb: readonly [number, number, number], at: Ground, lift: number, pos: number[], col: number[]): void {
    if (corners.length < 3 || !this.game.explored[at(corners[0]!).t]) return;
    const mid = corners.reduce((a, p) => a.add(p), new THREE.Vector3()).normalize();
    const grow = SQUARE_GROW * this.game.globe.avgEdgeAngle;
    const pts = corners.map((p) => { const out = p.clone().sub(mid); return p.clone().addScaledVector(out, grow / Math.max(1e-9, out.length())).normalize(); });
    const on = (d: THREE.Vector3) => { const h = at(d); return d.clone().multiplyScalar(Math.max(h.ground, h.water) + lift); };
    // A fine fan (rings in from the edge, the edge subdivided) so the paving
    // follows the ground: big flat triangles would dip under bumps and let
    // the kerbs of the streets under them show through.
    const ring: THREE.Vector3[] = [];
    pts.forEach((p, k) => { const q = pts[(k + 1) % pts.length]!; for (let s = 0; s < 4; s++) ring.push(p.clone().lerp(q, s / 4).normalize()); });
    const RINGS = 4;
    const inner = (p: THREE.Vector3, r: number) => (r === 0 ? on(mid) : on(mid.clone().lerp(p, r / RINGS).normalize()));
    ring.forEach((p, k) => {
      const q = ring[(k + 1) % ring.length]!;
      for (let r = 0; r < RINGS; r++) {
        const a0 = inner(p, r), b0 = inner(q, r), a1 = inner(p, r + 1), b1 = inner(q, r + 1);
        if (r === 0) pos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z);
        else pos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
        for (let n = 0; n < (r === 0 ? 3 : 6); n++) col.push(rgb[0], rgb[1], rgb[2]);
      }
    });
  }

  // A ribbon along `pts` draped on the ground, three vertices across: soft
  // edge, middle, soft edge. Where it crosses water it goes over a bridge:
  // a deck arching gently from bank to bank, always clear of the water,
  // with parapets along it and piers down to the bed (timber, or stone).
  // Skips unexplored ground.
  private drape(pts: readonly THREE.Vector3[], halfWidth: number | readonly number[], rgb: readonly [number, number, number], roads: RoadBatches,
    at: Ground, lift: number, bridges?: Bridges, stone = false): void {
    const g = this.game, s = this.scale;
    // Points close enough that the surface follows the ground between them.
    const step = ROAD_STEP * g.globe.avgEdgeAngle;
    const fine: THREE.Vector3[] = [], fineW: number[] = [];
    pts.forEach((p, k) => {
      const w = typeof halfWidth === 'number' ? halfWidth : halfWidth[k]!;
      if (k > 0) {
        const q = pts[k - 1]!, m = Math.floor(q.angleTo(p) / step);
        const wq = typeof halfWidth === 'number' ? halfWidth : halfWidth[k - 1]!;
        for (let i = 1; i <= m; i++) { const t = i / (m + 1); fine.push(q.clone().lerp(p, t).normalize()); fineW.push(wq + (w - wq) * t); }
      }
      fine.push(p); fineW.push(w);
    });
    pts = fine;
    const n = pts.length;
    const hwAt = (k: number) => fineW[k]!;
    const here = pts.map((d) => at(d));
    // Bridge decks over the wet stretches: from the last dry point before to the first after.
    const deck: (number | null)[] = here.map(() => null);
    // (Only real water: shallow wet ground, a marsh's rim, is walked over.)
    const wet = here.map((h) => h.water > h.ground + BRIDGE_DEPTH * s);
    for (let k = 0; k < n; k++) {
      if (!wet[k] || (k > 0 && wet[k - 1])) continue;
      let e = k;
      while (e + 1 < n && wet[e + 1]) e++;
      const a = Math.max(0, k - 1), b = Math.min(n - 1, e + 1);
      const ha = wet[a] ? here[a]!.water : here[a]!.ground, hb = wet[b] ? here[b]!.water : here[b]!.ground;
      // Over the water, and no lower than the land was before the river cut its valley.
      let water = -Infinity, land = 0;
      for (let i = k; i <= e; i++) { water = Math.max(water, here[i]!.water); land += here[i]!.land; }
      land /= e - k + 1;
      const span = pts[a]!.angleTo(pts[b]!) / g.globe.avgEdgeAngle;
      const arch = BRIDGE_ARCH * s * Math.min(1, span / 0.12);
      for (let i = a; i <= b; i++) {
        const t = b > a ? (i - a) / (b - a) : 0.5;
        const line = ha + (hb - ha) * t + arch * Math.sin(Math.PI * t);
        // Clear of the water in the middle, easing onto the banks at the ends.
        deck[i] = i === a || i === b ? line : Math.max(line, water + BRIDGE_CLEAR * s, Math.min(land, Math.max(ha, hb) + arch));
      }
      if (bridges && g.explored[here[k]!.t]) this.bridge(pts, deck, here, a, b, Math.max(hwAt(a), hwAt(b)), stone, bridges);
      k = e;
    }
    // The surface: a solid strip across the street's width, sampled at
    // several points across so it hugs the ground (nearly flush with it);
    // kerbs (paved) or worn edges and ruts (dirt); round ends where streets
    // meet, so junctions overlap cleanly.
    // Two layers, so the network reads as one painted object: the edges
    // (full width: kerbs on paving, worn earth on dirt) and on top of them
    // the surface (a little narrower and higher, one flat color). Where
    // streets overlap, the surface is the same everywhere, so joins vanish;
    // the edge color only shows along the network's outer border. Both
    // follow the ground (sampled across the width) and end round.
    const edgeRgb = rgb === PAVED_RGB ? ROAD_KERB : rgb.map((c) => c * 0.82);
    const heightAt = (k: number, q: THREE.Vector3, center: boolean) => {
      if (deck[k] !== null) return deck[k]!;
      const o = center ? here[k]! : at(q);
      return Math.max(o.ground, o.water);
    };
    const layer = (share: number, up: number, color: readonly number[], out: Batch) => {
      const tri = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3) => {
        out.pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        for (let i = 0; i < 3; i++) out.col.push(color[0]!, color[1]!, color[2]!);
      };
      const cap = (k: number, row: THREE.Vector3[], dir: number) => {
        // A half disc beyond the end, at the end's height.
        const d = pts[k]!, mid = row[ROAD_MID]!, r = mid.length(), w = hwAt(k) * share;
        const tan = pts[Math.min(n - 1, k + 1)]!.clone().sub(pts[Math.max(0, k - 1)]!).normalize().multiplyScalar(dir * w);
        const side = d.clone().cross(tan).normalize().multiplyScalar(w);
        const ring: THREE.Vector3[] = [];
        for (let i = 0; i <= 8; i++) {
          const t = (i / 8) * Math.PI;
          ring.push(d.clone().addScaledVector(side, Math.cos(t)).addScaledVector(tan, Math.sin(t)).normalize().multiplyScalar(r));
        }
        for (let i = 0; i < 8; i++) tri(mid, ring[i]!, ring[i + 1]!);
      };
      let prev: THREE.Vector3[] | null = null;
      for (let k = 0; k < n; k++) {
        const d = pts[k]!;
        const tan = pts[Math.min(n - 1, k + 1)]!.clone().sub(pts[Math.max(0, k - 1)]!);
        if (tan.lengthSq() < 1e-14) continue;
        if (!g.explored[here[k]!.t]) { if (prev) cap(k - 1, prev, 1); prev = null; continue; }
        const side = d.clone().cross(tan).normalize().multiplyScalar(hwAt(k) * share);
        const row = ROAD_ACROSS.map((u, j) => {
          const q = d.clone().addScaledVector(side, u).normalize();
          return q.multiplyScalar(heightAt(k, q, j === ROAD_MID) + lift + up);
        });
        if (!prev) cap(k, row, -1);
        else {
          for (let j = 0; j + 1 < row.length; j++) {
            tri(prev[j]!, prev[j + 1]!, row[j + 1]!);
            tri(prev[j]!, row[j + 1]!, row[j]!);
          }
        }
        prev = row;
      }
      if (prev) cap(n - 1, prev, 1);
    };
    layer(1, 0, edgeRgb, roads.edge);
    layer(ROAD_SURFACE, ROAD_LAYER * s, rgb, roads.top);
  }

  // The solid part of a bridge over points a..b of a street (a and b on
  // the banks), on the deck heights given (radii). Stone: a deck with
  // parapet walls, arches springing from piers, abutments on the banks.
  // Timber: a plank deck with rails on posts, trestles down to the bed.
  private bridge(pts: readonly THREE.Vector3[], deck: readonly (number | null)[], here: readonly { ground: number; water: number }[],
    a: number, b: number, halfW: number, stone: boolean, out: Bridges): void {
    const s = this.scale, D = this.game.globe.avgEdgeAngle;
    const base = new THREE.Color(stone ? BRIDGE_STONE : BRIDGE_TIMBER);
    const W = halfW * 1.15;
    const quad = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, shade = 1) => {
      for (const p of [p0, p1, p2, p0, p2, p3]) out.pos.push(p.x, p.y, p.z);
      for (let i = 0; i < 6; i++) out.col.push(base.r * shade, base.g * shade, base.b * shade);
    };
    // A box around point k: `along` and `across` half sizes (radians), from radius lo to hi.
    const box = (k: number, along: number, across: number, lo: number, hi: number, shade: number) => {
      const t = pts[Math.min(pts.length - 1, k + 1)]!.clone().sub(pts[Math.max(0, k - 1)]!).normalize().multiplyScalar(along);
      const sd = sideOf(k).multiplyScalar(across);
      const c = (u: number, v: number, r: number) => pts[k]!.clone().addScaledVector(t, u).addScaledVector(sd, v).normalize().multiplyScalar(r);
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
      for (let i = 0; i < 4; i++) {
        const [u0, v0] = cs[i]!, [u1, v1] = cs[(i + 1) % 4]!;
        quad(c(u0, v0, lo), c(u1, v1, lo), c(u1, v1, hi), c(u0, v0, hi), shade * (i % 2 ? 0.9 : 1));
      }
      quad(c(-1, -1, hi), c(1, -1, hi), c(1, 1, hi), c(-1, 1, hi), shade * 1.05);
    };
    const sideOf = (k: number) => {
      const tan = pts[Math.min(pts.length - 1, k + 1)]!.clone().sub(pts[Math.max(0, k - 1)]!);
      return pts[k]!.clone().cross(tan).normalize();
    };
    const at = (k: number, v: number, r: number) => pts[k]!.clone().addScaledVector(sideOf(k), v).normalize().multiplyScalar(r);
    // Supports: the banks, and piers about every BRIDGE_PIER_STEP over the water.
    const supports = [a];
    let run = 0;
    for (let k = a + 1; k < b; k++) {
      run += pts[k]!.angleTo(pts[k - 1]!) / D;
      if (run >= BRIDGE_PIER_STEP && pts[k]!.angleTo(pts[b]!) / D >= BRIDGE_PIER_STEP * 0.6) { supports.push(k); run = 0; }
    }
    supports.push(b);
    // How far point k is between its two supports (0 at a support, 1 mid-span).
    const mid = (k: number) => {
      let i = 0;
      while (i + 1 < supports.length && supports[i + 1]! < k) i++;
      const s0 = supports[i]!, s1 = supports[Math.min(supports.length - 1, i + 1)]!;
      return s1 > s0 ? Math.sin((Math.PI * (k - s0)) / (s1 - s0)) : 0;
    };
    const thick = BRIDGE_THICK * s, top = BRIDGE_PARAPET * s;
    for (let k = a; k < b; k++) {
      const h0 = deck[k]!, h1 = deck[k + 1]!;
      // Stone: the sides reach down between supports as arches (deep at the
      // piers, thin at mid-span); timber: a straight beam.
      const lo0 = stone ? h0 - thick - BRIDGE_SPANDREL * s * (1 - mid(k)) : h0 - thick;
      const lo1 = stone ? h1 - thick - BRIDGE_SPANDREL * s * (1 - mid(k + 1)) : h1 - thick;
      const wallTop = stone ? top : 0;
      for (const sgn of [-1, 1]) quad(at(k, sgn * W, lo0), at(k + 1, sgn * W, lo1), at(k + 1, sgn * W, h1 + wallTop), at(k, sgn * W, h0 + wallTop), 0.95);
      quad(at(k, -W, lo0), at(k + 1, -W, lo1), at(k + 1, W, lo1), at(k, W, lo0), 0.7);
      if (stone) for (const sgn of [-1, 1]) {
        // The parapet's inner face and its top.
        const inner = sgn * (W - halfW * 0.18);
        quad(at(k, inner, h0), at(k + 1, inner, h1), at(k + 1, inner, h1 + wallTop), at(k, inner, h0 + wallTop), 0.85);
        quad(at(k, inner, h0 + wallTop), at(k + 1, inner, h1 + wallTop), at(k + 1, sgn * W, h1 + wallTop), at(k, sgn * W, h0 + wallTop), 1.08);
      }
    }
    // Timber rails: a beam along each side on posts.
    if (!stone) {
      // Posts at every point, on both sides.
      for (let k = a; k <= b; k++) for (const sgn of [-1, 1]) {
        const save = pts[k]!;
        (pts as THREE.Vector3[])[k] = save.clone().addScaledVector(sideOf(k), sgn * W).normalize();
        box(k, halfW * 0.08, halfW * 0.08, deck[k]!, deck[k]! + top * 1.3, 0.8);
        (pts as THREE.Vector3[])[k] = save;
      }
      for (let k = a; k < b; k++) for (const sgn of [-1, 1]) {
        const h0 = deck[k]! + top * 1.2, h1 = deck[k + 1]! + top * 1.2;
        quad(at(k, sgn * W, h0 - top * 0.25), at(k + 1, sgn * W, h1 - top * 0.25), at(k + 1, sgn * W, h1), at(k, sgn * W, h0), 0.85);
      }
    }
    // Piers down to the bed (stone: one wide pier; timber: a pair of posts), and abutments on the banks.
    for (const k of supports) {
      const bank = k === a || k === b;
      const lo = here[k]!.ground - 0.0003 * s, hi = deck[k]! - thick;
      if (bank) { if (stone) box(k, halfW * 0.5, W, lo, hi, 0.9); continue; }
      if (stone) box(k, halfW * 0.4, W * 0.95, lo, hi, 0.88);
      else for (const sgn of [-1, 1]) {
        const off = sideOf(k).multiplyScalar(sgn * W * 0.75);
        const save = pts[k]!;
        (pts as THREE.Vector3[])[k] = save.clone().add(off).normalize();
        box(k, halfW * 0.12, halfW * 0.12, lo, hi, 0.8);
        (pts as THREE.Vector3[])[k] = save;
      }
    }
  }

  // The ground at a spot of tile t (for city buildings).
  private readonly spotCo = new Float32Array(FAN_COORDS);
  private readonly spotSmp = newSample();
  private citySpot(t: number, i: number, wa: number, wb: number): CitySpot {
    const g = this.game;
    const p = this.terrain.samplePoint(t, i, wa, wb);
    const dir = p.clone().normalize();
    const fanId = this.paint.fanStart[t] + i;
    const fan = this.paint.fans[fanId];
    fanCoords(this.frames[fanId], fan, warpAt(this.paint.params, dir.x, dir.y, dir.z), dir.x, dir.y, dir.z, this.spotCo);
    const w = softAt(this.paint, fanId, this.spotCo);
    let urban = 0;
    for (let c = 0; c < 4; c++) {
      const u = g.use[fan.ids[c]];
      if (u === USE.urban || u === USE.center) urban += w[c];
    }
    const lv = this.terrain.at(t, i, wa, wb);
    this.terrain.topo.sample(t, i, wa, wb, this.spotSmp);
    let slope = 0;
    for (let c = 0; c < 3; c++) slope += this.spotSmp.w[c] * this.vertSlope[this.spotSmp.v[c]];
    return { dir, ground: lv.ground - 1, water: lv.water - 1, slope, urban };
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
      // A fixed size on screen (about 40 px tall), whatever the zoom.
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, sizeAttenuation: false }));
      sprite.scale.setScalar(0.036);
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
      const label = `${city.pop}  ${city.name}`;
      const hp = Math.round((10 * city.hp) / g.cityMaxHp(city)) / 10;
      const key = `c|${color}|${label}|${hp}`;
      const tex = this.texture(key, 512, 96, (ctx) => drawCityLabel(ctx, color, label, hp));
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, sizeAttenuation: false }));
      sprite.scale.set(0.13, 0.0244, 1);
      sprite.position.copy(tile.center).multiplyScalar(this.terrain.centerRadius[city.tile] + 0.03 * s);
      sprite.renderOrder = 10;
      this.citiesGroup.add(sprite);
    }
    // Wonders: a small banner with the name, readable from strategic zoom.
    for (const [w, t] of g.wondersBuilt) {
      if (!g.explored[t]) continue;
      const label = `★ ${WONDERS[w].name}`;
      const tex = this.texture(`w|${label}`, 512, 96, (ctx) => drawCityLabel(ctx, '#c9a94e', label));
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, sizeAttenuation: false }));
      sprite.scale.set(0.09, 0.017, 1);
      sprite.position.copy(g.tiles[t].center).multiplyScalar(this.terrain.centerRadius[t] + 0.012 * s);
      sprite.renderOrder = 9;
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
    // The sun shines from behind the camera, a little to the left (we see the
    // lit faces, shadows fall away from us, and a slant keeps faces modelled),
    // whatever the camera's tilt. Walking, it stays put in the sky (north-west).
    const walking = this.walk.active;
    const focus = (walking ? this.walk.position : this.cam.target).clone();
    const up = walking ? northAt(focus) : cam.up.clone().addScaledVector(focus, -cam.up.dot(focus)).normalize();
    const right = up.clone().cross(focus);
    // LIGHT.sunHeight above the horizon (fairly low: long shadows).
    const side = walking ? up.clone().multiplyScalar(1.4).addScaledVector(right, -1.0) : up.clone().multiplyScalar(-1.4).addScaledVector(right, -0.6);
    const dir = focus.clone().multiplyScalar(Math.tan((LIGHT.sunHeight * Math.PI) / 180) * side.length()).add(side).normalize();
    this.sunDir.copy(dir);
    // The sun cools toward the poles: white at the equator, LIGHT.cool cool
    // white at the poles, smoothly between (sin²φ of the latitude looked
    // at; the poles are on y).
    const lat = focus.clone().normalize().y;
    this.sun.color.set(LIGHT.sunColor).lerp(SUN_COOL, LIGHT.cool * lat * lat);
    this.sun.position.copy(focus).addScaledVector(dir, 3);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    // Fit the shadow map to the ground in view (more of it when tilted).
    const span = this.cam.distance * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * Math.max(1, cam.aspect) * 1.3;
    const half = walking ? 0.05 : Math.min(1.15, Math.max(0.08, span * (1 + 1.5 * Math.sin(this.cam.tilt))));
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 1; sc.far = 5;
    sc.updateProjectionMatrix();
    // The normal offset follows the shadow map's texel size: enough to keep
    // slopes free of acne, small enough up close for houses to shadow the
    // ground beside them (a fixed offset was taller than a house).
    this.sun.shadow.normalBias = SHADOW_NORMAL_TEXELS * (2 * half) / this.sun.shadow.mapSize.x;
    this.renderer.shadowMap.needsUpdate = true;
  }

  // The camera's height above sea level as the reference lens would have
  // it (a narrower lens stands further back for the same view).
  private viewAltitude(): number {
    return this.walk.active ? this.camera.position.length() - 1 : (this.camera.position.length() - 1) / this.cam.reach;
  }

  // Sky and haze come in as the camera nears the ground: black space from
  // orbit, a blue sky and hazy distance when low over the land or walking.
  private updateAir(): void {
    const alt = this.viewAltitude();
    this.sky.update(this.camera, this.sunDir, alt);
    this.halo.update(this.sunDir, smoothstep(0.1, 0.6, alt / AIR.height));
    this.stars.opacity = smoothstep(0.02, 0.3, alt / AIR.height);

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
    if (this.walk.active) this.walk.update(dt); else this.cam.update(dt);

    if (this.pointer.dirty && !this.walk.active) {
      this.pointer.dirty = false;
      const t = this.pick(this.pointer.x, this.pointer.y);
      if (t !== this.hoverTile) {
        this.hoverTile = t;
        this.onTileHover(t);
      }
    }

    // Every display frame: water, clouds and rain keep moving smoothly. (The
    // shadow map still re-renders only when the view or the world changes.)
    const now = performance.now();
    this.updateSun();
    this.updateAir();
    this.cullProps();
    this.terrainMat.setTime(now / 1000);
    this.smoke.update(now / 1000, this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.smoke.points.visible = this.view === 'normal';
    this.waterMat.setTime(now / 1000);
    // Clouds show from orbit and overhead when walking, never over the board.
    const fog = this.scene.fog as THREE.FogExp2;
    const alt = this.viewAltitude();
    this.weather.update(now / 1000, this.sunDir, this.walk.active ? [0, 0] : [0.15, 0.6],
      this.walk.active ? 1 : smoothstep(0.2, 0.55, alt / AIR.height), { color: fog.color, density: fog.density });
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.countFrame(performance.now() - t0, this.renderer.info.render.triangles);
  }

  // FPS counter: frames drawn per second, CPU time per frame and triangles
  // drawn per frame (shadow passes included).
  private countFrame(ms: number, tris: number): void {
    if (!this.fpsEl) return;
    this.fpsFrames++;
    this.fpsWork += ms;
    this.fpsTris = tris;
    const now = performance.now();
    if (now - this.fpsSince < 500) return;
    const fps = (this.fpsFrames * 1000) / (now - this.fpsSince);
    const tri = this.fpsTris >= 1e6 ? `${(this.fpsTris / 1e6).toFixed(1)}M` : `${Math.round(this.fpsTris / 1e3)}k`;
    this.fpsEl.textContent = `${fps.toFixed(0)} fps · ${(this.fpsWork / this.fpsFrames).toFixed(1)} ms · ${tri} tris`;
    this.fpsFrames = 0; this.fpsWork = 0; this.fpsSince = now;
  }
}

// The tangent at dir pointing to the north pole (any tangent at the poles).
function northAt(dir: THREE.Vector3): THREE.Vector3 {
  const n = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
  if (n.lengthSq() < 1e-6) n.set(0, 0, -1).addScaledVector(dir, dir.z);
  return n.normalize();
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }


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

// A city's banner: its size and name, with a health bar when damaged.
function drawCityLabel(ctx: CanvasRenderingContext2D, color: string, label: string, hp = 1): void {
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
  if (hp < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x + 18, 70, w - 36, 8);
    ctx.fillStyle = hp > 0.5 ? '#51cf66' : hp > 0.25 ? '#fcc419' : '#fa5252';
    ctx.fillRect(x + 18, 70, (w - 36) * Math.max(0, hp), 8);
  }
}

// Per terrain vertex: the ground's slope (height per radian, the steepest
// edge to a neighbor), the signed distance to the shore, and the unit
// tangent pointing away from the shore (zero far from any).
function slopeAndShore(terrain: TerrainMesh, coast: Float32Array): [Float32Array, Float32Array, Float32Array] {
  const { topo, fields } = terrain;
  const H = fields.height, D = topo.dir;
  const slope = new Float32Array(topo.V), inland = new Float32Array(topo.V * 3);
  for (let v = 0; v < topo.V; v++) {
    const x = D[v * 3], y = D[v * 3 + 1], z = D[v * 3 + 2];
    let best = 0, gx = 0, gy = 0, gz = 0;
    for (let j = topo.adjStart[v]; j < topo.adjStart[v + 1]; j++) {
      const n = topo.adj[j];
      const dx = D[n * 3] - x, dy = D[n * 3 + 1] - y, dz = D[n * 3 + 2] - z;
      const l2 = dx * dx + dy * dy + dz * dz;
      if (l2 < 1e-14) continue;
      best = Math.max(best, Math.abs(H[n] - H[v]) / Math.sqrt(l2));
      const dc = (coast[n] - coast[v]) / l2;
      gx += dc * dx; gy += dc * dy; gz += dc * dz;
    }
    slope[v] = best;
    const radial = gx * x + gy * y + gz * z;
    gx -= radial * x; gy -= radial * y; gz -= radial * z;
    const gl = Math.hypot(gx, gy, gz);
    if (gl > 1e-9) { inland[v * 3] = gx / gl; inland[v * 3 + 1] = gy / gl; inland[v * 3 + 2] = gz / gl; }
  }
  return [slope, coast, inland];
}

// Triangles of a ground overlay (roads, bridges) wound to face away from
// the globe's center (they are built either way round): then their
// normals point up, for the light and for the shadow lookups alike.
// Walls (no clear outside) are left as they are.
function windOutward(geo: THREE.BufferGeometry): void {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const c = geo.getAttribute('color') as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(d.clone().sub(a));
    const up = n.dot(a) / (n.length() * a.length() || 1);
    if (up >= -0.3) continue;
    // Swap the last two vertices (and their colors).
    for (const attr of [p, c]) {
      for (let k = 0; k < attr.itemSize; k++) {
        const t = attr.getComponent(i + 1, k);
        attr.setComponent(i + 1, k, attr.getComponent(i + 2, k));
        attr.setComponent(i + 2, k, t);
      }
    }
  }
}

// Road material: vertex colors, with a fine grain from the world position
// (the same wherever streets overlap, so joins never show); polygon offset
// keeps it over the ground (the surface layer over the edges).
function makeRoadMaterial(offset: number, depthWrite: boolean): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset, depthWrite });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoadPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRoadPos;
        float roadHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float roadNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(roadHash(i), roadHash(i + vec3(1, 0, 0)), f.x), mix(roadHash(i + vec3(0, 1, 0)), roadHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(roadHash(i + vec3(0, 0, 1)), roadHash(i + vec3(1, 0, 1)), f.x), mix(roadHash(i + vec3(0, 1, 1)), roadHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.9 + 0.12 * roadNoise(vRoadPos * 9000.0) + 0.06 * roadNoise(vRoadPos * 1800.0);`);
  };
  mat.customProgramCacheKey = () => 'road';
  return mat;
}
