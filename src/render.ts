import type { AttackStyle } from './unitClasses.ts';
import * as THREE from 'three';
import { unitDef } from './rules.ts';
import { GlobeCamera } from './camera.ts';
import { HUMAN, type Game, type Unit, type City } from './game.ts';
import { GROUND_COVERS, SEA_TINT, SNOW, tileLook, type GroundCover, type TileLook } from './look.ts';
import { buildTerrainMesh, locate, newSample, type TerrainMesh } from './terrainMesh.ts';
import { makeTerrainMaterial, makeTerrainDepthMaterial, setTerrainHoles, holeFragment, MAX_HOLES, type TerrainHole, paintViewColor, makeTable, FAN_ROWS, TILE_ROWS, IMPROVEMENT_CODE, BURNT_CODE, CROP_CODE, STAGE_STEP, ROAD_DIRT, ROAD_GRAIN, type TerrainMaterial } from './terrainMaterial.ts';
import { makeSmoke, type Emitter, type Smoke } from './smoke.ts';
import { buildPaintData, fanCoords, fanFrames, paintAt, paintDelta, softAt, warpAt, FAN_COORDS, FINE_MAX, FINE_WAVELENGTH, type PaintData, type FanFrame } from './paint.ts';
import { buildRelief, CONE_RADIUS, CRATER, CRATER_DEPTH, type Relief } from './relief.ts';
import { buildSurface, meshLevels, type SurfaceLayers } from './surface.ts';
import { cityGround } from './terraform.ts';
import { makeWaterMaterial, type WaterMaterial } from './water.ts';
import { WalkCamera } from './walk.ts';
import { makeSky, makeHalo, installHaze, HAZE, HAZE_DENSITY, AIR } from './sky.ts';
import { makeWeather, type Weather } from './weather.ts';
import { buildPropGeometry, catalogEntry, CATALOG, CATALOG_KINDS, type CatalogKind, type Layer } from './propCatalog.ts';
import { FLORA_KEEP } from './floraData.ts';
import { BUILDING_KINDS, buildBuildingGeometry, type BuildingKind } from './buildingCatalog.ts';
import { useOf } from './houseKit.ts';
import { WORKS_VARIANT, houseFarGeometry, houseGeometry, houseSmoke, isHouseKind, parseHouseKind, type HouseKind } from './houses.ts';
import { isWonderModelKind, wonderGeometry, type WonderModelKind } from './wonderModels.ts';
import { isFloraRural, isCropRural, isSmoothRural, roamOf, isRuralModelKind, ruralGeometry, ruralModelKind, type RuralModelKind } from './rural/models.ts';
import { CityProps, tileFrame, SUMMIT_FLAT, SUMMIT_HOUSES, type CitySpot, type SinkSheet } from './cityProps.ts';
import { CITY_CELL } from './cityPainter.ts';
import { CELL, wallHeight } from './town/geometry.ts';
import { resourceLook } from './rural/resourceModels.ts';
import { placeResource } from './rural/resourcePlace.ts';
import { RESOURCE_IMPROVEMENT } from './resources.ts';
import { plotStage } from './rural/stages.ts';
import { farmAxis } from './farmPainter.ts';
import { cropRegion } from './rural/look.ts';
import { roadLines, ROAD_HALF_WIDTH } from './roads.ts';
import { Vegetation, type SpotEnv } from './vegetation.ts';
import { mulberry32, makePerlin } from './rng.ts';
import { USE, WONDERS, type EraIndex } from './cities.ts';
import { farGeometry, makeFloraDepthMaterial, makePropMaterial, makeRoamDepthMaterial, instanceGeometry } from './propMaterial.ts';
import { GpuTimer } from './gpuTimer.ts';
import { Billboards, type Billboard } from './billboards.ts';
import { resourceDef } from './resources.ts';
import { unitIcon, resourceIcon } from './icons.ts';
import { drawUnitFlag, drawCityBanner, drawResourceIcon, drawTileYields } from './mapIcons.ts';
import { isUnitKey, isWonder, buildDef, type BuildKey } from './rules.ts';
import { UnitView, type FightResult, type ShownUnit } from './unitView.ts';
import { loadGroundTextures, groundUniform, GROUND_LAYER } from './groundTextures.ts';

const FOG = new THREE.Color(0x0b0e15);
// How far into an unexplored tile the known land's edge slopes away and fades (of a tile's edge).
const FOG_REACH = 0.5;
// Clouds are the far view's: none over the map as it is played (they hid the land), gathering as the camera pulls back toward orbit (altitudes, of the air's height).
const CLOUDS_FROM = 1.3, CLOUDS_FULL = 2.6;

// Pixels per CSS pixel the renderer may use (setResolution).
export const RESOLUTIONS = [2, 1.5, 1] as const;
export type Resolution = typeof RESOLUTIONS[number];

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
const PROP_CHUNKS = 48;
// Trees are drawn with their far models (farGeometry) once under this many
// (device) pixels tall.
const FAR_PX = 16;
// A town's buildings go far this much farther off than the trees (they stand taller).
const HOUSE_FAR = 1.6;
// The countryside's small models (haystacks, herds, heaps, fences) go when
// a tree would be this many times smaller than FAR_PX: a pixel or two.
const RURAL_GONE = 2.5;
// A cap on the frame rate (0: none): frames evenly spaced on whole
// refreshes (a 120 Hz screen shows each for two) look smoother than more of
// them, unevenly (a frame of 10–14 ms held for one refresh, then two or three).
const FPS_CAP = 60;
// Multisampling (MSAA) off where the ground's fine triangles are under this
// many pixels across (the camera far out): there nearly every pixel is on
// an edge, shaded once per triangle touching it, about a third of the
// frame, for edges too small to see. On again past MSAA_ABOVE_PX (apart, so
// it doesn't flicker at the threshold).
const MSAA_BELOW_PX = 10, MSAA_ABOVE_PX = 12;
// The share of a chimney's puffs that show, by its owner's era: a fire lit
// now and then before the industrial age, every stack pouring in it, less
// as the modern and information ages clean up.
const SMOKE_RATE: Record<EraIndex, number> = { 0: 0.1, 1: 0.1, 2: 0.1, 3: 0.1, 4: 1, 5: 0.5, 6: 0.2 };
// A home's chimney, in any era: a white wisp now and then (homes never look like works).
const HOME_SMOKE = 1 / 30;
// What lies on the ground is drawn before what stands on it (the opaque
// pass, by renderOrder): after the sky (-10, sky.ts: drawn first, no depth
// test), the ground and the roads over it, then everything else (0).
const GROUND_ORDER = -8, ROAD_ORDER = -6;
// A farm's crops stand within this many tiles of the camera (propMaterial.ts).
const CROP_FAR = 16;

// Flora and city buildings share the chunks; town lots (houses.ts) are
// models of their own, made on first use.
type PropKind = CatalogKind | BuildingKind | HouseKind | WonderModelKind | RuralModelKind;
const PROP_KINDS: readonly PropKind[] = [...CATALOG_KINDS, ...BUILDING_KINDS];
const isFloraKind = (k: PropKind): k is CatalogKind => k in CATALOG;
// The triangle counter's category for a prop kind.
const statOf = (k: PropKind): string =>
  isFloraKind(k) ? `flora · ${CATALOG[k].layer.toLowerCase()}` : isRuralModelKind(k) ? (isFloraRural(k) ? 'crops' : 'rural') : isHouseKind(k) ? 'houses'
    : isWonderModelKind(k) ? 'wonders' : 'buildings';

// A chunk of the globe: its props, and its share of the ground and water
// (drawn per chunk too), all hidden when beyond the horizon or off screen.
interface PropChunk {
  dir: THREE.Vector3;  // chunk center
  radius: number;      // angular radius, with a margin for prop size
  tiles: number[];
  meshes: Map<PropKind, THREE.InstancedMesh>;
  surface: THREE.Mesh[]; // its ground and water
  farHouses: THREE.Mesh | null; // its houses' far models, all in one (mergeFarHouses)
}

interface PlacedProp {
  kind: PropKind;
  matrix: THREE.Matrix4;
  color: THREE.Color; // per-instance shade and slight hue shift
  leaf: THREE.Color;  // leaf color (the model's own, or a variant's tint)
  wander?: number;    // a walker's circle (model units: propMaterial.ts ROAM)
}

// Reference tile spacing (radians) that unit/city sizes were tuned for.
const REF_EDGE = 0.07;

export type DebugView = 'normal' | 'height' | 'water' | 'paint' | 'strategic';

// A banana tile's trees (canopy and understory): a third of them are bananas (the only place they grow).
const BANANA_IN: ReadonlySet<Layer> = new Set<Layer>(['Canopy', 'Understory']);

// Roads between cities, and streets: dirt, then paving from the Classical era.
// (A little darker than the terrain's own: the roads' material lights it brighter.)
const ROAD_SHADE = 0.8;
const ROAD_RGB = ROAD_DIRT.map((c) => c * ROAD_SHADE) as unknown as readonly [number, number, number];
const DIRT_RGB = [0.55, 0.49, 0.39] as const;
const PAVED_RGB = [0.5, 0.46, 0.41] as const;
// Road surfaces: points across the width (shares of the half width: edges,
// kerbs or worn edges, ruts, the middle), and points along at least every
// ROAD_STEP tile steps.
const ROAD_ACROSS = [-1, -0.88, -0.45, 0, 0.45, 0.88, 1] as const;
const ROAD_MID = 3;
const ROAD_STEP = 0.012;
const ROAD_LIFT = 0.00004; // nearly flush with the ground
// How far a road's surface may stray from the ground between the points
// kept along it (drape), and the most steps it may run straight.
const ROAD_TOL = 0.000025, ROAD_RUN = 16, ROAD_BEND = 0.08;
// A wonder's water (cityProps.ts SinkSheet), standing in its basin: how
// deep the water shader takes it to be (a formal basin's: still, a lake's
// colour, no foam at its sides).
const WONDER_WATER_DEPTH = 0.0009;
const ROAD_SURFACE = 0.84;  // the surface layer's share of the street's width (the rest shows the edges)
const ROAD_LAYER = 0.00002; // how far the surface sits above the edges
const PAINT_LAYER = 0.00001; // how far each layer of what a wonder lays on the ground sits over the one under it
const ROAD_KERB = [0.62, 0.59, 0.54] as const;
// What the road material draws (roadUv.z): a track's packed earth, paved
// streets, a town's paving, asphalt, a railway (ballast, sleepers, rails).
const ROAD_KIND = { dirt: 0, paved: 1, square: 2, asphalt: 3, rail: 4 } as const;
const ASPHALT_RGB = [0.27, 0.27, 0.28] as const, ASPHALT_EDGE = [0.48, 0.46, 0.42] as const;
const BALLAST_RGB = [0.45, 0.42, 0.38] as const, BALLAST_EDGE = [0.38, 0.35, 0.31] as const;
// A railway's half width: this share of a road's.
const RAIL_WIDTH = 0.8;
// A track's packed earth, as a farm's lanes (terrainMaterial.ts): the
// land's own colour well toward its soil and the roads' dirt; its edge
// halfway back to the land.
const TRACK_EARTH = 0.65, TRACK_PACKED = 0.68, TRACK_EDGE = 0.45;
const SQUARE_GROW = 0.022; // squares reach this far (tile steps) under the streets round them
const WALK_FOV = 55;
// The look: a 35° lens from further back (flatter perspective, less of a
// small planet); a maquette's light: a warm sun fairly high, casting
// shadows that read clearly (the pale sky fill, at about half the sun,
// keeps them from going black; chosen by eye); no tone mapping.
const LENS = 35;
// The sun's shadow map (texels a side) and its normal offset in texels.
// (Its size by the resolution setting: the sharpest gets the finest shadows.)
const SHADOW_MAP: Record<Resolution, number> = { 2: 4096, 1.5: 2048, 1: 2048 };
const SHADOW_NORMAL_TEXELS = 1.5;
// How far the shadows' edges are blurred, in world units (the same however
// much ground the map covers), and the most and least that is in texels.
const SHADOW_BLUR = 0.0004, SHADOW_BLUR_TEXELS = [1, 3] as const;
// The depth the shadow camera covers round the view (world units: the
// ground in view, curving away, and what stands on it).
const SHADOW_DEPTH = 1;
// The shadow map covers SHADOW_PAD times the ground in view, and is redrawn
// once the view has moved SHADOW_SLACK of its half width, or the sun turned
// SHADOW_TURN degrees (updateSun).
const SHADOW_PAD = 1.6, SHADOW_SLACK = 0.3, SHADOW_TURN = 1.5;
// The largest the shadow map's half width gets (world units: a hemisphere).
const SHADOW_MAX_HALF = 1.15;
// Warm sun, cool shade: the sun a little golden and the sky fill a little
// blue, so lit ground glows and shadows lean blue-grey (both chosen by eye:
// the brightness as in the earlier neutral colours, sun 1.75 and fill 1).
const LIGHT = { sunColor: 0xffedd3, sun: 1.85, sunHeight: 40, fill: 1.05, fillSky: 0xd9e9fc, fillGround: 0x6a5a40 };
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
// Machu Picchu's summit cut (levelSummit), tile steps: how far from the
// tile's middle its middle may lie, how far past its flat it eases into
// the slopes.
const SUMMIT_CENTRE = 0.18, SUMMIT_EASE = 0.165;
type Ground = (d: THREE.Vector3) => { t: number; ground: number; water: number; land: number };
interface Bridges { pos: number[]; col: number[] }
// (roadUv: across the road (-1..1), along it (tile steps), and its kind: 0 dirt, 1 paved, 2 a town's paving.)
interface Batch { pos: number[]; col: number[]; uv: number[] }
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
  private readonly maxLift: number; // highest ground above radius 1
  private readonly treeHeight: number; // a typical tree's height, world units
  private readonly farGeo = new Map<CatalogKind, THREE.BufferGeometry>();
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly chunkSphere = new THREE.Sphere();

  private readonly terrain: TerrainMesh;
  private readonly terrainMat: TerrainMaterial;
  private readonly waterMat: WaterMaterial;
  private readonly waterMesh: THREE.Group;
  private readonly looks: TileLook[];
  private readonly globeMesh: THREE.Group;
  private readonly baseColors: THREE.Color[];
  private readonly prevDrained: Uint8Array;
  // Fog of war as a smooth field on the surface's shared vertices
  // (updateFog), and each tile's shared vertices.
  private readonly fogField: Float32Array;
  private readonly tileShared: Int32Array[];
  private readonly fogSample = newSample();
  private readonly playerColors: THREE.Color[];
  private readonly paint: PaintData;
  private readonly frames: FanFrame[];
  private readonly relief: Relief;
  private readonly tileTex: THREE.DataTexture;
  private readonly propNoise = makePerlin(mulberry32(0x7ee5));
  private prevExplored: Uint8Array;
  private prevVisible: Uint8Array;
  private prevOwner: Int32Array;

  private readonly floraTime = { value: 0 };
  private readonly cropFar = { value: 1 };
  private readonly floraUniforms = { time: this.floraTime, cropFar: this.cropFar, eye: { value: new THREE.Vector3() } };
  private readonly propMat = makePropMaterial(0, 0.85, this.sunDir, this.floraUniforms);
  private readonly floraDepth = makeFloraDepthMaterial(this.floraUniforms);
  private shadowsDirty = true;
  // Where the shadow map was last drawn: round what, for which sun, how far (setShadows, updateSun).
  private shadowAt: { center: THREE.Vector3; dir: THREE.Vector3; half: number } | null = null;
  // (Built surfaces textured at a storey's size: a single floor's walls, as
  // a town's houses stand, a tile step about avgEdgeAngle · √3.)
  private readonly buildingMat = makePropMaterial(0.32, 0.6, this.sunDir);
  // (Only the walls textured, as stone: propMaterial.ts SURFACE_FRAGMENT, at a storey's size; their
  // towers plain, one colour: on their narrow faces the courses only made stripes.)
  private readonly wallMat: THREE.MeshStandardMaterial;
  // (People, animals, plants: round, smooth-shaded.)
  private readonly smoothMat = makePropMaterial(0.25, 0.7, this.sunDir, undefined, true, this.floraTime);
  private readonly roamDepth = makeRoamDepthMaterial(this.floraTime);
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
  // The forts workers build (game.ts fort): a small stone work on its tile.
  private readonly forts = new THREE.Group();
  private fortsKey = '';
  private fortGeo: THREE.BufferGeometry | null = null;
  private readonly fortMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly unitsGroup = new THREE.Group();
  private unitView!: UnitView;
  private selUnit: Unit | null = null;
  private readonly citiesGroup = new THREE.Group();
  // Labels drawn a kind at a time (billboards.ts): units' flags, cities' labels, resources' badges.
  private readonly unitFlags = new Billboards(128, 128, 16, [0.031, 0.031], 5);
  private readonly cityLabels = new Billboards(512, 112, 4, [0.152, 0.03325], 10);
  private readonly resourceBadges = new Billboards(96, 96, 21, [0.032, 0.032], 4);
  // The yields lens (setYields): each tile's yields near where the camera looks.
  private readonly yieldBadges = new Billboards(192, 64, 10, [0.084, 0.028], 3);
  private yieldBoards: Billboard[] = [];
  private yieldsKey = '';
  private yieldsReach = 0;
  private readonly yieldsAt = new THREE.Vector3();
  // (Bumped once the banner's typeface has loaded: banners drawn before are drawn again.)
  private fontEpoch = 0;
  private cityBoards: Billboard[] = [];
  private resourceBoards: Billboard[] = [];
  // Resource badges (resources.ts) on explored tiles, shown from play distance.
  private readonly resourcesGroup = new THREE.Group();
  private resourcesShown = -1;
  private readonly overlayGroup = new THREE.Group();
  private borders: THREE.Mesh | null = null;
  private cityProps: CityProps;
  private readonly smoke: Smoke;
  private groundVersion = -1;
  private readonly levelled = new Set<number>();
  private roads: THREE.Group[] = [];
  // The road layers' materials: edges below, the surface above (see drape).
  // Edges (kerbs) and surfaces. Kerbs draw first and leave the depth alone,
  // so any surface covers any kerb where they overlap (a street running
  // into a square or another street): kerbs show only round the outside of
  // the joined network, never as lines across it.
  private readonly roadMats = [makeRoadMaterial(-2, false), makeRoadMaterial(-4, true)];
  private bridges: THREE.Group | null = null;
  private wonderSinks: THREE.Group | null = null;
  // The ground's shadow material: plain, and cut by wonders' holes (holeChunks).
  private readonly groundDepth = [makeTerrainDepthMaterial(), makeTerrainDepthMaterial(true)] as const;
  private sheetMat: THREE.MeshPhysicalMaterial | null = null;
  private readonly bridgeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private roadsKey = '';
  private readonly prevUse: Uint8Array;
  private readonly prevBuilt: Int8Array; // (the improvement each tile had: drawn where built)
  // City ground (terraform.ts): the surface's layers, the heights as built,
  // the vertices reshaped so far, what they were reshaped for.
  private readonly layers: SurfaceLayers;
  private readonly origHeight: Float32Array;
  private reshaped = new Set<number>();
  private groundKey = '';

  private pointer = { x: 0, y: 0, dirty: false };
  private downAt: { x: number; y: number } | null = null;
  private hoverTile = -1;

  // Frames drawn far off: without multisampling, then copied to the canvas
  // (a full-screen quad: one cheap pass). Marked as an XR target so three.js
  // gives it what it gives the canvas (sRGB out, tone mapping), stored as
  // the canvas is (plain RGBA8: the colours already encoded). (The canvas's
  // own multisampling costs next to nothing on tiled GPUs, Apple's; a
  // multisampled target of our own cost the near frames twice as much.)
  private readonly flat = Object.assign(new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace, internalFormat: 'RGBA8' }), { isXRRenderTarget: true });
  private readonly flatCopy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, uniforms: { uMap: { value: this.flat.texture } },
    vertexShader: 'in vec3 position; in vec2 uv; out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'precision highp float; uniform sampler2D uMap; in vec2 vUv; out vec4 outColor; void main() { outColor = texture(uMap, vUv); }',
  }));
  private readonly copyCam = new THREE.OrthographicCamera();
  private msaaOn = true;
  private readonly bufferSize = new THREE.Vector2();
  private readonly abort = new AbortController();
  private readonly fpsEl: HTMLElement | null = document.getElementById('fps');
  private gpuTimer!: GpuTimer;
  private fpsFrames = 0;
  private fpsWork = 0;
  private fpsTris = 0;
  private fpsSince = performance.now();
  // Triangles drawn per category this frame, tallied by hooks on every mesh
  // (installed at each counter refresh).
  private readonly statTris = new Map<string, number>();
  // Whether the counter shows the breakdown (clicking it toggles; remembered per viewer).
  // Categories hidden by clicking their rows in the counter (to see what each costs the GPU).
  private readonly hiddenStats = new Set<string>();
  private statsOpen = ((): boolean => { try { return localStorage.getItem('trisBreakdown') === '1'; } catch { return false; } })();

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.game = game;
    this.wallMat = makePropMaterial(0.32, 0.6, this.sunDir, undefined, false, undefined, wallHeight(1) * (CITY_CELL / CELL) * game.globe.avgEdgeAngle * Math.sqrt(3));
    this.scale = game.globe.avgEdgeAngle / REF_EDGE;
    this.cropFar.value = CROP_FAR * game.globe.avgEdgeAngle;
    // (Multisampled on the canvas: near, frames are drawn straight to it;
    // far off, into `flat` and copied to it (MSAA_BELOW_PX).)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.gpuTimer = new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
    // The ground's material textures, compressed for this GPU (they fill in once loaded).
    loadGroundTextures(this.renderer);
    // Full Retina sharpness (up to 2 pixels per CSS pixel; setResolution).
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.resolution));
    // No tone mapping: the colours as they are lit.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene.background = new THREE.Color(0x04050a);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.005, 200);
    this.camera.position.set(0, 0, 3.4);
    this.scene.add(this.camera);
    // The sun keeps a fixed angle to the camera (behind it, a little to the
    // left) so the visible side is always lit (updateSun). Its shadows
    // (setShadows): a shadow map fitted to what is on screen, re-rendered
    // only when the view or the world changes.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sun);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP[this.resolution], SHADOW_MAP[this.resolution]);
    // (The bias is in the shadow camera's depth, 0..1 over its near..far: a
    // tenth of a millimetre of world over SHADOW_DEPTH. Larger, short things,
    // houses, would cast nothing.)
    this.sun.shadow.bias = -0.0001 / SHADOW_DEPTH;
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
    this.sky.mesh.userData['stat'] = 'sky';
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
    for (let t = 0; t < N; t++) this.writeTileLook(t);
    const fanTex = makeTable(this.paint.fans.length * FAN_ROWS);
    const fd = fanTex.image.data as Float32Array;
    this.paint.fans.forEach((f, i) => {
      const o = i * FAN_ROWS * 4;
      fd.set(f.ids, o);
      fd.set(f.round.slice(0, 4), o + 4);
      fd.set([f.round[4], ...f.river], o + 8);
      fd.set(f.warp.slice(0, 4), o + 12);
      fd.set([f.warp[4], f.sim[4], f.sim[5], (f.riverAcross[0] ? 1 : 0) + (f.riverAcross[1] ? 2 : 0)], o + 16);
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
    geo.setAttribute('dim', new THREE.BufferAttribute(new Float32Array(V), 1));

    this.terrainMat = makeTerrainMaterial({
      tileTex: this.tileTex, fanTex,
      r0: params.r0, fine: FINE_MAX * params.r0, fineFreq: 1 / (FINE_WAVELENGTH * params.r0),
    });
    // The globe in chunks (props, ground and water alike), spread evenly
    // over the sphere (a golden-angle spiral); each tile goes to the
    // nearest chunk center.
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < PROP_CHUNKS; k++) {
      const y = 1 - (2 * (k + 0.5)) / PROP_CHUNKS, rr = Math.sqrt(1 - y * y);
      this.chunks.push({ dir: new THREE.Vector3(Math.cos(golden * k) * rr, y, Math.sin(golden * k) * rr), radius: 0, tiles: [], meshes: new Map(), surface: [], farHouses: null });
    }
    for (const tile of g.tiles) {
      let best = 0;
      for (let k = 1; k < PROP_CHUNKS; k++) if (this.chunks[k].dir.dot(tile.center) > this.chunks[best].dir.dot(tile.center)) best = k;
      const c = this.chunks[best];
      c.tiles.push(tile.id);
      this.tileChunk[tile.id] = c;
      c.radius = Math.max(c.radius, c.dir.angleTo(tile.center) + 2 * g.globe.avgEdgeAngle);
    }
    // (The highest the ground reaches, for the horizon: peaks show past it.)
    this.maxLift = this.terrain.vertRadius.reduce((m, r) => Math.max(m, r), 1) - 1;
    this.globeMesh = this.chunkedSurface(this.terrain.geometry, this.terrain.triToTile, this.terrainMat.material, (m) => {
      m.renderOrder = GROUND_ORDER;
      m.customDepthMaterial = this.groundDepth[0];
      // (Everything casts shadows but the farms' crops; everything receives them.)
      m.castShadow = true;
      m.receiveShadow = true;
    });
    this.globeMesh.userData['stat'] = 'terrain';
    this.scene.add(this.globeMesh);
    // The water surface, hidden under fog of war like the ground.
    const W = this.terrain.waterVerts.length;
    this.terrain.water.setAttribute('unexplored', new THREE.BufferAttribute(new Float32Array(W).fill(1), 1));
    this.terrain.water.setAttribute('dim', new THREE.BufferAttribute(new Float32Array(W), 1));
    this.waterMat = makeWaterMaterial();
    this.waterMesh = this.chunkedSurface(this.terrain.water, this.terrain.waterTriToTile, this.waterMat.material, (m) => {
      m.renderOrder = 1;
      m.receiveShadow = true;
    });
    this.waterMesh.userData['stat'] = 'water';
    this.scene.add(this.waterMesh);
    this.weather = makeWeather(g.globe, g.map.rainfall, g.map.temperature, params.r0, g.seed);
    this.weather.group.userData['stat'] = 'clouds & rain';
    this.scene.add(this.weather.group);
    this.prevExplored = new Uint8Array(N).fill(255);
    {
      const owners = this.terrain.topo.owners, lists: number[][] = g.tiles.map(() => []);
      for (let v = 0; v < this.terrain.topo.V; v++) for (let k = 0; k < 3; k++) { const o = owners[v * 3 + k]!; if (o >= 0) lists[o]!.push(v); }
      this.tileShared = lists.map((l) => Int32Array.from(l));
      this.fogField = new Float32Array(this.terrain.topo.V).fill(1);
    }
    this.prevDrained = new Uint8Array(N);
    this.prevVisible = new Uint8Array(N).fill(255);
    this.prevOwner = new Int32Array(N).fill(-2);
    this.buildBackdrop();

    const s = this.scale;
    // Props are drawn per chunk of the globe, one instanced mesh per kind, so
    // chunks behind the horizon or off screen cost nothing.
    for (const kind of CATALOG_KINDS) this.propGeo.set(kind, buildPropGeometry(kind, s * 1.5 * PROP_SIZE));
    // (A broadleaf's height, for when trees turn to their far models.)
    this.treeHeight = this.propHeight('beechMaple');
    this.craters.userData['stat'] = 'craters';
    this.scene.add(this.craters);
    this.forts.userData['stat'] = 'forts';
    this.scene.add(this.forts);
    for (const kind of BUILDING_KINDS) this.propGeo.set(kind, buildBuildingGeometry(kind).scale(s * 1.5 * PROP_SIZE, s * 1.5 * PROP_SIZE, s * 1.5 * PROP_SIZE));
    this.prevUse = new Uint8Array(N);
    this.prevBuilt = new Int8Array(N).fill(-1);
    let hint = 0;
    this.cityProps = new CityProps(g, (t, i, wa, wb) => this.citySpot(t, i, wa, wb), (d) => {
      const l = locate(g.globe, d, hint);
      hint = l.t;
      return { ...this.citySpot(l.t, l.i, l.wa, l.wb), t: l.t };
    }, s);
    this.unitsGroup.userData['stat'] = 'units';
    // The units, as figurines on the ground (unitView.ts), each under its flag.
    let unitHint = 0;
    this.unitView = new UnitView({
      center: (t) => g.tiles[t].center,
      ground: (d) => {
        const l = locate(g.globe, d, unitHint);
        unitHint = l.t;
        const lv = this.terrain.at(l.t, l.i, l.wa, l.wb);
        return { ground: lv.ground - 1, water: lv.water - 1 };
      },
      step: g.globe.avgEdgeAngle,
    }, (u) => this.unitFlag(u));
    this.unitsGroup.add(this.unitView.group, this.unitFlags.mesh);
    this.citiesGroup.add(this.cityLabels.mesh);
    this.resourcesGroup.add(this.resourceBadges.mesh);
    // (Yields and resources: their size on screen up close; from further off they keep to their tile, shrinking with it, and the land hides them as it does a city's banner.)
    const tile = game.globe.avgEdgeAngle;
    this.yieldBadges.setWorldSize(1.5 * tile, 0.5 * tile);
    this.resourceBadges.setWorldSize(0.62 * tile, 0.62 * tile);
    this.yieldBadges.mesh.userData['stat'] = 'yield icons';
    this.scene.add(this.yieldBadges.mesh);
    void document.fonts?.load('600 38px Cinzel').then(() => { this.fontEpoch++; this.updateCities(); });
    g.onBattle = (u, t, style, result) => this.unitView.fight(u.id, t, style, performance.now() / 1000, result);
    g.onStep = (u, from, to) => this.unitView.step(u.id, from, to);
    this.citiesGroup.userData['stat'] = 'city markers';
    this.resourcesGroup.userData['stat'] = 'resource badges';
    this.scene.add(this.resourcesGroup);
    this.overlayGroup.userData['stat'] = 'overlays';
    this.scene.add(this.unitsGroup, this.citiesGroup, this.overlayGroup);
    this.smoke = makeSmoke(s);
    this.scene.add(this.smoke.points);

    this.bindInput(canvas);
    this.fpsEl?.addEventListener('click', (e) => {
      // (A category's row clicked: it is hidden, or shown again, to see what it costs.)
      const row = (e.target as HTMLElement).closest('tr[data-stat]');
      if (row) {
        const k = row.getAttribute('data-stat')!;
        if (!this.hiddenStats.delete(k)) this.hiddenStats.add(k);
        return;
      }
      this.statsOpen = !this.statsOpen;
      try { localStorage.setItem('trisBreakdown', this.statsOpen ? '1' : '0'); } catch { /* (not remembered) */ }
    }, { signal: this.abort.signal });
    const resize = () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    };
    addEventListener('resize', resize, { signal: this.abort.signal });
    resize();
    this.cam.setLens(LENS);
    // (At most FPS_CAP frames a second, each on a whole refresh: the 4 ms of
    // slack lets a refresh that comes a little early still draw.)
    let lastDrawn = 0;
    this.renderer.setAnimationLoop((t) => {
      if (FPS_CAP > 0 && t - lastDrawn < 1000 / FPS_CAP - 4) return;
      lastDrawn = t;
      this.frame();
    });
  }

  // ---------- public API ----------

  // Stops drawing and frees the GPU resources.
  dispose(): void {
    this.abort.abort();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
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
    const changed = [...new Set([...this.changedTiles(), ...this.drainedTiles()])];
    if (changed.length) {
      this.updateColors(changed);
      this.updateBorders();
    }
    // City tiles: the ground, the flora that yields to them, the buildings.
    const dirty = new Set<PropChunk>();
    const g = this.game;
    let useChanged = false;
    for (let t = 0; t < g.N; t++) {
      if (g.use[t] === this.prevUse[t] && g.improved[t] === this.prevBuilt[t]) continue;
      this.prevUse[t] = g.use[t];
      this.prevBuilt[t] = g.improved[t]!;
      useChanged = true;
      for (const x of [t, ...g.tiles[t].neighbors]) { this.propCache.delete(x); dirty.add(this.tileChunk[x]!); }
    }
    if (useChanged || this.groundVersion !== g.useVersion) { this.groundVersion = g.useVersion; this.updateCityGround(); }
    // Built-up ground is drained (before anything is placed there).
    for (const t of this.terraform()) { this.propCache.delete(t); dirty.add(this.tileChunk[t]!); }
    // Summits levelled for wonders standing on them (before anything is placed there).
    for (const [w, t] of g.wondersBuilt) {
      if (WONDERS[w].site !== 'mountainTop' || this.levelled.has(t) || t < 0) continue;
      this.levelSummit(t);
      for (const x of [t, ...g.tiles[t].neighbors]) { this.propCache.delete(x); dirty.add(this.tileChunk[x]!); }
    }
    const townChanged = this.cityProps.changed();
    // (The flora on a town's tiles stays clear of what the town builds.)
    for (const t of townChanged) for (const x of [t, ...g.tiles[t].neighbors]) { this.propCache.delete(x); dirty.add(this.tileChunk[x]!); }
    if (changed.length) this.updateProps(); else if (dirty.size) this.updateProps(dirty);
    // (What casts real shadows changed: they re-render.)
    if (changed.length || dirty.size || useChanged || townChanged.length) this.shadowsDirty = true;
    this.updateRoads(changed.length > 0 || townChanged.length > 0);
    this.updateSmoke();
    this.updateForts();
    this.updateCities();
    this.updateResources();
    this.updateUnits(sel);
    if (!this.warmed) { this.warmed = true; this.warmUp(); }
  }

  // Everything drawn once as the world is ready (still loading), so nothing
  // stalls the first time a stretch of the globe comes into sight: the
  // first draw of each kind of mesh compiles its programs, uploads its
  // buffers and builds the GPU's pipeline for it (ANGLE on Metal makes
  // those at the first draw), seconds for a whole new region in one frame.
  // Every mesh, hidden and out of view as much as in it, and a city wall's
  // piece (walls have their own material) even if no city has walls yet.
  private warmed = false;
  private warmUp(): void {
    const wall = new THREE.InstancedMesh(instanceGeometry(this.geometryOf('wallSegment'), 1), this.wallMat, 1);
    wall.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(wall);
    const hidden: THREE.Object3D[] = [], culled: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) { hidden.push(o); o.visible = true; }
      if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
    });
    // (The shadow map drawn in the same render, first: without it every
    // material receiving shadows samples no depth texture, and WebGL turns
    // each of their draws away, leaving them unprepared.)
    this.updateSun();
    this.renderer.shadowMap.needsUpdate = true;
    // (Both ways a frame is drawn: on Metal each has pipelines of its own.)
    this.draw(false);
    this.draw(true);
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    // (Drawn with everything in it, hidden too: drawn again as it should be.)
    this.shadowsDirty = true;
    this.scene.remove(wall);
    wall.geometry.dispose();
  }

  // Redraw selection ring, hover ring, path preview and tile marks.
  syncOverlay(sel: Selection, hover: number, path: number[] | null, marks: readonly TileMark[] = []): void {
    for (const o of this.overlayGroup.children) if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
    this.overlayGroup.clear();
    for (const m of marks) this.overlayGroup.add(this.ring(m.tile, m.color, m.opacity));
    const selTile = sel?.kind === 'unit' ? sel.unit.tile : sel?.kind === 'city' ? sel.city.tile : sel?.kind === 'tile' ? sel.tile : -1;
    if (selTile >= 0) this.overlayGroup.add(this.ring(selTile, 0xffe9ad, 0.95, 0.985, 0.95));
    if (hover >= 0 && hover !== selTile) this.overlayGroup.add(this.ring(hover, 0xffffff, 0.5, 0.985, 0.96));
    if (path && path.length > 1) {
      const pts: THREE.Vector3[] = [];
      const lift = 0.01 * this.scale;
      for (let k = 0; k + 1 < path.length; k++) {
        const a = path[k], b = path[k + 1];
        const da = this.game.tiles[a].center, db = this.game.tiles[b].center;
        const ra = this.shownCenter(a), rb = this.shownCenter(b);
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
  // Debug views of the terrain: the height map (contours, no water), the
  // water (colored by source, steps in red) or the painting's tiles (each
  // tile's painted land, edges drawn, no water). Props and clouds are hidden.
  view: DebugView = 'normal';
  setView(mode: DebugView): void {
    this.view = mode;
    const m = mode === 'normal' ? 0 : mode === 'height' ? 1 : mode === 'water' ? 2 : mode === 'paint' ? 3 : 4;
    this.terrainMat.setView(m);
    this.waterMat.setView(m);
    this.waterMesh.visible = mode === 'normal' || mode === 'water';
    this.weather.group.visible = mode === 'normal' && this.clouds;
    // (Units and their flags too: the debug views show the land alone; the
    // strategic view keeps the flags, the banners and the medallions.)
    this.unitsGroup.visible = mode === 'normal' || mode === 'strategic';
    this.unitView.group.visible = mode === 'normal';
    this.forts.visible = mode === 'normal';
    this.shadowsDirty = true;
  }

  // The lenses: the hex grid (setGrid), each tile's yields, the resources' medallions.
  get gridOn(): boolean { return this.grid; }
  yieldsOn = false;
  setYields(on: boolean): void { this.yieldsOn = on; this.yieldsKey = ''; }
  resourcesOn = true;
  setResourceIcons(on: boolean): void { this.resourcesOn = on; }

  // Fly to look at a point of the globe (a unit vector), keeping the zoom.
  focusDir(dir: THREE.Vector3): void { this.cam.focus(dir); }
  // How far the camera stands from the point it looks at (globe radii).
  get viewDistance(): number { return this.cam.distance; }

  // Clouds and rain on or off (the debug views always hide them).
  clouds = true;
  // Shadows on or off (on by default): the sun's shadow map, everything but
  // the farms' crops casting onto everything (redrawn only now and then,
  // updateSun).
  get shadows(): boolean { return this.sun.castShadow; }
  setShadows(on: boolean): void {
    this.sun.castShadow = on;
    this.shadowsDirty = true;
  }

  // Neutral tone mapping on or off (off by default, as on the City samples
  // page; three recompiles the materials itself).
  get toneMapped(): boolean { return this.renderer.toneMapping !== THREE.NoToneMapping; }
  setToneMapping(on: boolean): void { this.renderer.toneMapping = on ? THREE.NeutralToneMapping : THREE.NoToneMapping; }

  // Rendering resolution: at most this many pixels per CSS pixel (screens
  // with fewer get theirs). Fewer pixels are the quickest relief for a weak
  // GPU: most of its work is per pixel.
  resolution: Resolution = 2;
  setResolution(r: Resolution): void {
    this.resolution = r;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, r));
    this.renderer.setSize(innerWidth, innerHeight);
    // (And the shadow map's size: made anew at the next redraw.)
    const size = SHADOW_MAP[r];
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(size, size);
      this.shadowsDirty = true;
    }
  }

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

  // A tile's center as drawn: under the fog of war, at sea level like its ground.
  private shownCenter(t: number): number { return this.game.explored[t] ? this.terrain.centerRadius[t]! : 1; }
  private surface(t: number, lift = 0): THREE.Vector3 {
    return this.game.tiles[t].center.clone().multiplyScalar(this.shownCenter(t) + lift);
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

    this.halo.mesh.userData['stat'] = 'sky';
    this.scene.add(this.halo.mesh);
  }

  // Tiles whose fog or ownership changed since the last sync.
  // A tile's static rows of the tile table (terrainMaterial.ts) from its
  // look: its painting's detail, patches, rock, wetness, beach; its frame,
  // its crops and its farm's axis.
  private writeTileLook(t: number): void {
    const g = this.game, l = this.looks[t]!;
    const td = this.tileTex.image.data as Float32Array, o = t * TILE_ROWS * 4;
    td.set([l.detail.grain, l.detail.patch, l.detail.strata, l.detail.dunes], o + 4);
    td.set([l.patchColor.r, l.patchColor.g, l.patchColor.b, l.detail.bump], o + 8);
    td.set([l.rockColor.r, l.rockColor.g, l.rockColor.b, l.rock], o + 12);
    td[o + 3] = l.wet;
    td[o + 19] = l.beach;
    td[o + 21] = this.paint.group[t];
    // The tile's own frame (cityProps.onTile), its crops and its farm's axis.
    const f = tileFrame(g, t);
    td.set([f.c.x, f.c.y, f.c.z, f.k, f.e1.x, f.e1.y, f.e1.z, CROP_CODE[cropRegion(g.builtAt(t) ?? g.improvementAt(t), g.biome[t]!, g.feature[t] ?? null, g.map.temperature[t]!)], f.e2.x, f.e2.y, f.e2.z, farmAxis(t)], o + 28);
    // What the ground is made of: the soil's color and the main cover
    // material (the largest share), alone: the shader shows one material
    // per tile, fading into its neighbours' across borders.
    const cover = l.ground.cover;
    const main = GROUND_COVERS.reduce((a, k) => ((cover[k] ?? 0) > (cover[a] ?? 0) ? k : a));
    const share = (k: GroundCover) => (k === main ? 1 : 0);
    const soil = new THREE.Color(l.ground.soil);
    td.set([soil.r, soil.g, soil.b, share('grass'), share('dry'), share('soil'), share('sand'), share('litter'), share('moss'), share('snow'), paintViewColor(g.biome[t]!, g.feature[t] ?? null, g.map.relief[t]!), g.feature[t] === 'floodplain' ? 1 : 0], o + 40);
    // (No straight sides until it is farmed: updateTiles.)
    for (let r = 13; r < 19; r++) td.set([0, 0, -1, 0], o + r * 4);
    this.tileTex.needsUpdate = true;
  }

  // Bogs drained since last looked at (game.ts): their look is their land's
  // now (their ground dries out in terraform).
  private drainedTiles(): number[] {
    const g = this.game, out: number[] = [];
    for (let t = 0; t < g.N; t++) {
      if (g.drained[t] === this.prevDrained[t]) continue;
      this.prevDrained[t] = g.drained[t];
      this.looks[t] = tileLook(g.map, t);
      this.baseColors[t] = this.looks[t]!.color;
      this.writeTileLook(t);
      out.push(t);
    }
    return out;
  }

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
    // (Out of sight, the shader grays and darkens all of it: the dim attribute.)
    return out;
  }

  private updateColors(changed: number[]): void {
    const { vertTiles, tileVerts } = this.terrain;
    const g = this.game;
    if (changed.some((t) => g.explored[t])) this.weather.setSeen(g.explored);
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
    const touched = this.updateFog(changed);
    const fogAttr = this.terrain.geometry.getAttribute('unexplored') as THREE.BufferAttribute;
    const fogArr = fogAttr.array as Float32Array;
    const dimAttr = this.terrain.geometry.getAttribute('dim') as THREE.BufferAttribute, dimArr = dimAttr.array as Float32Array;
    const vertShared = this.terrain.vertShared, field = this.fogField;
    const dirty = new Set<number>();
    for (const t of touched) for (const v of tileVerts[t]!) dirty.add(v);
    for (const v of dirty) {
      let n = 0, hidden = 0, unseen = 0;
      for (let s = 0; s < 3; s++) {
        const t = vertTiles[v * 3 + s]!;
        if (t < 0) continue;
        if (!g.explored[t]) hidden++;
        else if (!g.visible[t]) unseen++;
        n++;
      }
      fogArr[v] = field[vertShared[v]!]!;
      dimArr[v] = unseen / Math.max(1, n - hidden);
    }
    fogAttr.needsUpdate = true;
    dimAttr.needsUpdate = true;
    // Water: per shared vertex, from the tiles it touches.
    const owners = this.terrain.topo.owners;
    const wFog = this.terrain.water.getAttribute('unexplored') as THREE.BufferAttribute;
    const wDim = this.terrain.water.getAttribute('dim') as THREE.BufferAttribute;
    const wf = wFog.array as Float32Array, wd = wDim.array as Float32Array;
    this.terrain.waterVerts.forEach((sv, n) => {
      let count = 0, hidden = 0, unseen = 0;
      for (let s = 0; s < 3; s++) {
        const t = owners[sv * 3 + s]!;
        if (t < 0) continue;
        count++;
        if (!g.explored[t]) hidden++;
        else if (!g.visible[t]) unseen++;
      }
      wf[n] = field[sv]!;
      wd[n] = unseen / Math.max(1, count - hidden);
    });
    wFog.needsUpdate = true;
    wDim.needsUpdate = true;
  }

  // The fog of war's field, where it may have changed (the changed tiles
  // and those next to them; returned): 0 on every vertex of an explored
  // tile, and on an unexplored one rising with its distance from the
  // nearest explored tile's edge, to 1 at FOG_REACH (of a tile's edge) and
  // beyond. The ground sinks to sea level and turns to the unknown's
  // colour by it (terrainMaterial.ts): the known land whole, no cliff at
  // its edge, and nothing of the unknown's shape past a short slope.
  private updateFog(changed: readonly number[]): Set<number> {
    const g = this.game, topo = this.terrain.topo, owners = topo.owners, dir = topo.dir, field = this.fogField;
    const reach = FOG_REACH * g.globe.avgEdgeAngle;
    const tiles = new Set<number>();
    for (const t of changed) { tiles.add(t); for (const nb of g.tiles[t]!.neighbors) tiles.add(nb); }
    // (An unexplored tile's vertices on an explored tile's edge: where its slope starts.)
    const lit = new Map<number, number[]>();
    const litOf = (t: number): number[] => {
      let l = lit.get(t);
      if (!l) {
        l = [];
        for (const v of this.tileShared[t]!) for (let k = 0; k < 3; k++) { const o = owners[v * 3 + k]!; if (o >= 0 && g.explored[o]) { l.push(v); break; } }
        lit.set(t, l);
      }
      return l;
    };
    for (const t of tiles) {
      for (const v of this.tileShared[t]!) {
        let known = false;
        for (let k = 0; k < 3 && !known; k++) { const o = owners[v * 3 + k]!; known = o >= 0 && g.explored[o] === 1; }
        if (known) { field[v] = 0; continue; }
        let d2 = Infinity;
        const x = dir[v * 3]!, y = dir[v * 3 + 1]!, z = dir[v * 3 + 2]!;
        for (let k = 0; k < 3; k++) {
          const o = owners[v * 3 + k]!;
          if (o < 0) continue;
          for (const l of litOf(o)) {
            const dx = dir[l * 3]! - x, dy = dir[l * 3 + 1]! - y, dz = dir[l * 3 + 2]! - z;
            d2 = Math.min(d2, dx * dx + dy * dy + dz * dz);
          }
        }
        field[v] = smoothstep(0, reach, Math.sqrt(d2));
      }
    }
    return tiles;
  }

  // The radius the surface is drawn at, at a fan point: the ground (or the
  // water over it), sunk toward sea level under the fog of war as the
  // ground itself is.
  private shownRadius(t: number, i: number, wa: number, wb: number): number {
    const lv = this.terrain.at(t, i, wa, wb), r = Math.max(lv.ground, lv.water);
    if (this.game.explored[t]) return r;
    const s = this.terrain.topo.sample(t, i, wa, wb, this.fogSample);
    const f = s.w[0] * this.fogField[s.v[0]]! + s.w[1] * this.fogField[s.v[1]]! + s.w[2] * this.fogField[s.v[2]]!;
    return r + (1 - r) * f;
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
      const delta = [0, 0, 0, 0];
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
      // (A tile's walking beasts, where they stand and how far their walk takes them, world units.)
      const near = new Map<number, { at: THREE.Vector3; r: number }[]>();
      const walkers = (u: number) => {
        let l = near.get(u);
        if (!l) {
          const k = tileFrame(g, u).k;
          l = this.resourceProps(u).flatMap((p) => {
            const m = p.kind.slice('rural|'.length), at = new THREE.Vector3().setFromMatrixPosition(p.matrix);
            const s = new THREE.Vector3().setFromMatrixColumn(p.matrix, 0).length() / k;
            return roamOf(m) > 0 ? [{ at: at.normalize(), r: (2 * roamOf(m) * s + 0.02) * k }] : [];
          });
          near.set(u, l);
        }
        return l;
      };
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
            fanCoords(this.frames[fanId], fan, paintDelta(this.paint.params, d.x, d.y, d.z, delta), d.x, d.y, d.z, co);
            const ps = paintAt(this.paint, fanId, co);
            // Which tile's props show here.
            let u = fan.ids[0], acc = 0;
            for (let c = 0; c < 4; c++) { acc += ps.w[c]; if (pick < acc) { u = fan.ids[c]; break; } }
            if (veg.maxDensity(u) === 0) continue;
            // (Clear of the walks of a resource's beasts: they never walk into a tree.)
            if (walkers(u).some((w) => w.at.distanceTo(d) < w.r)) continue;
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
            const picked = veg.pick(env, mulberry32(Math.floor(seed * 4294967296)), ancient && u === t);
            if (!picked) continue;
            // (Bananas grow only where the resource is: a third of its trees.)
            const prop = g.resources[u] === 'bananas' && BANANA_IN.has(CATALOG[picked.kind].layer) && rand() < 1 / 3 ? { ...picked, kind: 'banana' as const, size: 1, leaf: undefined, ancient: false } : picked;
            // Flora yields to cities.
            const use = g.use[u];
            // (What grows in the water, mangroves and reeds, stays: no house stands there.)
            // (Not in a worked wetland: its paddies and peat beds are cleared.)
            const inWater = env.water - env.ground > 0 && catalogEntry(prop.kind).water !== undefined
              && !(g.builtAt(u) === 'wetland' && g.ownerOf(u) >= 0);
            // On built ground the tile's own flora stays where it stands clear of
            // the buildings and streets (a town keeps its trees, never adds any).
            // A rural tile keeps a share of it (fields keep hedgerow trees),
            // and that clear of what stands on the farm too.
            if (use !== USE.center && g.builtAt(u) && g.ownerOf(u) >= 0 && !inWater) {
              const imp = g.builtAt(u);
              if (rand() >= FLORA_KEEP[imp ?? 'urban'][CATALOG[prop.kind].layer]) continue;
              // (Nothing grows on a mine's spoil, nor near it: rural/wear.ts.)
              if (imp === 'mine' && this.cityProps.nearWear(u, d)) continue;
            }
            if (this.cityProps.keepsFloraClear(u) && !inWater) {
              if (!this.cityProps.floraClear(u, d)) continue;
            } else if (use !== USE.wild && use !== USE.rural && !inWater) {
              if (rand() >= FLORA_KEEP.urban[CATALOG[prop.kind].layer]) continue;
            }
            // (A neighbor's flora feathering in never stands among the
            // buildings of the tile it is on: a city's center keeps clear.)
            if (u !== t && !inWater && g.use[t] === USE.center && (!this.cityProps.keepsFloraClear(t) || !this.cityProps.floraClear(t, d))) continue;
            // (Nor on a road between cities, but what grows in the water under a bridge.)
            if (!inWater && !this.cityProps.offRoads(d)) continue;
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
    if (!g) { g = isWonderModelKind(kind) ? wonderGeometry(kind) : isRuralModelKind(kind) ? ruralGeometry(kind) : houseGeometry(kind as HouseKind); this.propGeo.set(kind, g); }
    return g;
  }

  // A tree's far model (farGeometry), made when first needed.
  private farGeometryOf(kind: CatalogKind): THREE.BufferGeometry {
    let g = this.farGeo.get(kind);
    if (!g) { g = farGeometry(this.geometryOf(kind)); this.farGeo.set(kind, g); }
    return g;
  }

  // Height of a prop model as drawn (before per-instance scaling).
  private propHeight(kind: CatalogKind): number {
    const g = this.propGeo.get(kind)!;
    if (!g.boundingBox) g.computeBoundingBox();
    return g.boundingBox!.max.y;
  }

  // What a resource shows on its tile (rural/resourceModels.ts), once the
  // player knows of it: a few small models in a patch toward one corner
  // (under its badge), a little larger than life so they read from the
  // board; where rural/resourcePlace.ts puts them (the tile's painted
  // land), never in a city's center.
  private readonly resourceCache = new Map<number, { key: string; items: PlacedProp[] }>();
  // Wild, it shows the resource as nature has it; worked for it (its
  // improvement the resource's), only its own touches: the rest is the
  // improvement's look (the farm, the pasture, the mine: cityProps.ts).
  private resourceProps(t: number): PlacedProp[] {
    const g = this.game, r = g.resourceFor(t, HUMAN);
    // (A wonder standing there works it: none of its models shown.)
    if (!r || g.use[t] === USE.center || g.wondersAt(t).length) return [];
    const worked = g.ownerOf(t) >= 0 && g.builtAt(t) === RESOURCE_IMPROVEMENT[r] && !g.pillaged[t];
    const key = `${r}|${worked}`;
    const hit = this.resourceCache.get(t);
    if (hit && hit.key === key) return hit.items;
    const look = resourceLook(r, worked, g.isWater(t));
    if (!look) { this.resourceCache.set(t, { key, items: [] }); return []; }
    const rand = mulberry32((t + 11) * 2246822519);
    let hint = t;
    const sampleDir = (d: THREE.Vector3) => { const l = locate(g.globe, d, hint); hint = l.t; return { ...this.citySpot(l.t, l.i, l.wa, l.wb), t: l.t }; };
    const items: PlacedProp[] = [];
    for (const m of placeResource(g, t, r, look, rand, sampleDir)) {
      const q = new THREE.Quaternion().setFromUnitVectors(UP, m.dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, m.yaw));
      const sc = m.k * m.s, shade = 0.92 + 0.12 * rand();
      items.push({ kind: ruralModelKind(m.model), matrix: new THREE.Matrix4().compose(m.dir.clone().multiplyScalar(1 + (look.wade ? m.spot.ground : Math.max(m.spot.ground, m.spot.water)) - 0.00004 * this.scale), q, new THREE.Vector3(sc, sc, sc)),
        color: new THREE.Color(shade, shade, shade), leaf: new THREE.Color(m.color ?? 0xffffff), wander: m.wander / m.s });
    }
    this.resourceCache.set(t, { key, items });
    return items;
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
        for (const p of this.resourceProps(t)) add(p, dim);
      }
      // (Every kind this chunk shows now, or showed before: those get emptied.)
      for (const kind of new Set<PropKind>([...PROP_KINDS, ...lists.keys(), ...chunk.meshes.keys()])) {
        const items = lists.get(kind) ?? [];
        let mesh = chunk.meshes.get(kind);
        if (!mesh || mesh.instanceMatrix.count < items.length) {
          if (mesh) {
            this.scene.remove(mesh); mesh.dispose(); mesh.geometry.getAttribute('leafTint')?.array && mesh.geometry.deleteAttribute('leafTint');
            const far = mesh.userData['far'] as THREE.InstancedMesh | undefined;
            if (far) { this.scene.remove(far); far.dispose(); }
          }
          if (items.length === 0) { chunk.meshes.delete(kind); continue; }
          const cap = Math.ceil(items.length * 1.3) + 8;
          // (A farm's crops are drawn with the flora, and hide from high up as its understory does.)
          // (Shrubs and fences of cards are drawn with it too, casting their shadows as trees do.)
          const cards = isRuralModelKind(kind) && isFloraRural(kind), crop = cards && isCropRural(kind);
          mesh = new THREE.InstancedMesh(instanceGeometry(this.geometryOf(kind), cap), isFloraKind(kind) || cards ? this.propMat : isRuralModelKind(kind) && isSmoothRural(kind) ? this.smoothMat : kind === 'wallSegment' || kind === 'wallGate' ? this.wallMat : this.buildingMat, cap);
          mesh.userData['hideAbove'] = isFloraKind(kind) ? HIDE_ABOVE[CATALOG[kind].layer] : Infinity;
          // (Crops hide once the camera is higher than they reach, cullProps.)
          if (crop) mesh.userData['crop'] = true;
          if (isRuralModelKind(kind) && !cards) mesh.userData['goneAt'] = RURAL_GONE;
          // Everything casts shadows but the farms' crops (a sea of stalks
          // the eye reads as a field anyway); flora's cut to its leaves and
          // swaying with them (makeFloraDepthMaterial). Everything receives
          // them.
          mesh.castShadow = !crop;
          mesh.receiveShadow = true;
          if (isFloraKind(kind) || cards) mesh.customDepthMaterial = this.floraDepth;
          else if (isRuralModelKind(kind) && isSmoothRural(kind)) mesh.customDepthMaterial = this.roamDepth;
          mesh.userData['stat'] = statOf(kind);
          chunk.meshes.set(kind, mesh);
          this.scene.add(mesh);
        }
        const leaf = mesh.geometry.getAttribute('leafTint') as THREE.InstancedBufferAttribute, wander = mesh.geometry.getAttribute('wander') as THREE.InstancedBufferAttribute;
        items.forEach(({ p, dim }, i) => {
          mesh.setMatrixAt(i, p.matrix);
          wander.setX(i, p.wander ?? 0);
          mesh.setColorAt(i, color.copy(p.color).multiplyScalar(dim));
          // Out of sight, leaves lose their color like the ground does.
          const k = dim < 1 ? 0.6 : 0, gray = (p.leaf.r + p.leaf.g + p.leaf.b) / 3;
          leaf.setXYZ(i, p.leaf.r + (gray - p.leaf.r) * k, p.leaf.g + (gray - p.leaf.g) * k, p.leaf.b + (gray - p.leaf.b) * k);
        });
        mesh.count = items.length;
        mesh.instanceMatrix.needsUpdate = true;
        leaf.needsUpdate = wander.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        // Trees also get a far twin (farGeometry: a few triangles), drawn
        // instead when they are a few pixels tall (cullChunks); it shares
        // their instances (matrices, colors, leaf colors). So do the
        // towns' buildings (houses.ts houseFarGeometry: their details left
        // out), a little farther off (HOUSE_FAR).
        const house = isHouseKind(kind);
        if (house || (isFloraKind(kind) && CATALOG[kind].layer === 'Canopy')) {
          let far = mesh.userData['far'] as THREE.InstancedMesh | undefined;
          if (!far) {
            const geo = new THREE.BufferGeometry();
            for (const [name, attr] of Object.entries((house ? houseFarGeometry(kind) : this.farGeometryOf(kind as CatalogKind)).attributes)) geo.setAttribute(name, attr);
            geo.setAttribute('leafTint', leaf);
            far = new THREE.InstancedMesh(geo, house ? this.buildingMat : this.propMat, mesh.instanceMatrix.count);
            if (house) mesh.userData['farAt'] = HOUSE_FAR;
            far.instanceMatrix = mesh.instanceMatrix;
            far.userData['stat'] = `${statOf(kind)} (far)`;
            far.receiveShadow = true;
            far.visible = false;
            mesh.userData['far'] = far;
            this.scene.add(far);
          }
          far.instanceColor = mesh.instanceColor;
          far.count = mesh.count;
          far.boundingSphere = mesh.boundingSphere;
        }
      }
      this.mergeFarHouses(chunk);
    }
    this.updateCraters();
  }

  // A chunk's houses' far models merged into one mesh, placed (each house's
  // matrix applied, its colours baked in): far off, a town of a hundred
  // kinds of house is one draw, not a hundred. (Their instanced far twins
  // stay, for the shadow map's sake and as a fallback; they aren't drawn.)
  private mergeFarHouses(chunk: PropChunk): void {
    if (chunk.farHouses) { this.scene.remove(chunk.farHouses); chunk.farHouses.geometry.dispose(); chunk.farHouses = null; }
    let n = 0;
    const parts: { geo: THREE.BufferGeometry; mesh: THREE.InstancedMesh }[] = [];
    for (const [kind, mesh] of chunk.meshes) {
      if (!isHouseKind(kind) || mesh.count === 0) continue;
      const geo = houseFarGeometry(kind);
      parts.push({ geo, mesh });
      n += geo.getAttribute('position').count * mesh.count;
    }
    if (n === 0) return;
    const pos = new Float32Array(n * 3), col = new Uint8Array(n * 4);
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), ic = new THREE.Color(), lt = new THREE.Vector3();
    let o = 0;
    for (const { geo, mesh } of parts) {
      const p = geo.getAttribute('position'), c = geo.getAttribute('color'), mask = geo.getAttribute('leafMask'), shade = geo.getAttribute('leafShade');
      const leaf = mesh.geometry.getAttribute('leafTint') as THREE.InstancedBufferAttribute;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        mesh.getColorAt(i, ic);
        lt.fromBufferAttribute(leaf, i);
        for (let k = 0; k < p.count; k++, o++) {
          v.fromBufferAttribute(p, k).applyMatrix4(m);
          pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
          // (As the prop material colours an instance: the model's colour, its leaves tinted, times the instance's.)
          const lm = mask ? mask.getX(k) : 0, f = 1 - (shade ? shade.getX(k) : 0);
          col[o * 4] = Math.round(255 * Math.min(1, (c.getX(k) + (lt.x - c.getX(k)) * lm) * ic.r * f));
          col[o * 4 + 1] = Math.round(255 * Math.min(1, (c.getY(k) + (lt.y - c.getY(k)) * lm) * ic.g * f));
          col[o * 4 + 2] = Math.round(255 * Math.min(1, (c.getZ(k) + (lt.z - c.getZ(k)) * lm) * ic.b * f));
          col[o * 4 + 3] = 255;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.buildingMat);
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.userData['stat'] = 'houses (far)';
    chunk.farHouses = mesh;
    this.scene.add(mesh);
  }

  // A geometry drawn whole, split into one mesh per chunk: the meshes share
  // its buffers (updates to them show in every chunk), its triangles
  // regrouped by chunk so each draws its own range.
  private chunkedSurface(geo: THREE.BufferGeometry, triTile: Int32Array, mat: THREE.Material, setup: (m: THREE.Mesh) => void): THREE.Group {
    const src = geo.index!.array, n = triTile.length;
    const chunkOf = new Map(this.chunks.map((c, k) => [c, k]));
    const count = new Int32Array(this.chunks.length);
    const triChunk = Int32Array.from(triTile, (t) => chunkOf.get(this.tileChunk[t]!)!);
    for (let tr = 0; tr < n; tr++) count[triChunk[tr]!]++;
    const start = new Int32Array(this.chunks.length);
    for (let k = 1; k < start.length; k++) start[k] = start[k - 1]! + count[k - 1]!;
    const fill = start.slice(), index = new Uint32Array(src.length);
    for (let tr = 0; tr < n; tr++) {
      const o = fill[triChunk[tr]!]++ * 3;
      index[o] = src[tr * 3]!; index[o + 1] = src[tr * 3 + 1]!; index[o + 2] = src[tr * 3 + 2]!;
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    const group = new THREE.Group();
    this.chunks.forEach((chunk, k) => {
      if (count[k] === 0) return;
      const part = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geo.attributes)) part.setAttribute(name, attr);
      part.setIndex(geo.index);
      part.setDrawRange(start[k]! * 3, count[k]! * 3);
      const mesh = new THREE.Mesh(part, mat);
      // (Culled per chunk by cullChunks: the geometry's own bounds are the globe's.)
      mesh.frustumCulled = false;
      setup(mesh);
      chunk.surface.push(mesh);
      group.add(mesh);
    });
    return group;
  }

  // Per frame: hide chunks (their props, ground and water) beyond the
  // horizon or out of the camera's view; they could not be seen.
  private cullChunks(): void {
    const cam = this.camera.position;
    const dist = cam.length();
    const camDir = cam.clone().divideScalar(dist);
    // (Past the horizon of the sphere, as far as the highest ground could
    // still rise into sight.)
    const horizon = Math.acos(Math.min(1, 1 / dist)) + Math.acos(1 / (1 + this.maxLift + 0.01));
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    // Small props vanish when they would be under a pixel or so.
    const altitude = (dist - 1) / this.scale;
    const lensView = this.view === 'normal' || this.view === 'strategic';
    this.resourcesGroup.visible = this.resourcesOn && lensView;
    this.yieldBadges.mesh.visible = this.yieldsOn && lensView;
    if (this.yieldBadges.mesh.visible) this.updateYields();
    // Beyond farDist a tree is under FAR_PX tall on screen.
    const pxPerUnit = this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const farDist = (this.treeHeight * pxPerUnit) / FAR_PX;
    for (const chunk of this.chunks) {
      // (Its bounds: the cap of the sphere it covers, up to the highest ground.)
      this.chunkSphere.center.copy(chunk.dir);
      this.chunkSphere.radius = 2 * Math.sin(Math.min(chunk.radius, Math.PI / 2) / 2) + this.maxLift + 0.01;
      const seen = camDir.angleTo(chunk.dir) < horizon + chunk.radius && this.frustum.intersectsSphere(this.chunkSphere);
      // (Roads and bridges only in the normal view: the debug views show the land.)
      for (const mesh of chunk.surface) mesh.visible = seen && (this.view === 'normal' || mesh.userData['overlay'] !== true);
      // (Its trees go far when even its nearest are under FAR_PX tall.)
      const away = cam.distanceTo(this.chunkSphere.center) - this.chunkSphere.radius;
      for (const mesh of chunk.meshes.values()) {
        const show = this.view === 'normal' && seen && altitude < (mesh.userData['hideAbove'] as number)
          && (mesh.userData['crop'] !== true || dist - 1 < this.cropFar.value);
        const twin = mesh.userData['far'] as THREE.InstancedMesh | undefined;
        const far = away > farDist * ((mesh.userData['farAt'] as number | undefined) ?? 1);
        const gone = away > farDist * ((mesh.userData['goneAt'] as number | undefined) ?? Infinity);
        // (Houses far off are drawn merged, chunk.farHouses.)
        mesh.visible = show && !gone && !(twin && far);
        if (twin) twin.visible = show && far && !(chunk.farHouses && mesh.userData['farAt'] === HOUSE_FAR);
      }
      if (chunk.farHouses) chunk.farHouses.visible = this.view === 'normal' && seen && away > farDist * HOUSE_FAR;
    }
  }

  // A fort's model, once: a square of stone curtain walls with a tower at
  // each corner and a gate, wide enough for its garrison to stand in its yard
  // (y up, on the ground at 0). A first, plain model: to be drawn properly.
  private fortGeometry(): THREE.BufferGeometry {
    if (this.fortGeo) return this.fortGeo;
    const e = this.game.globe.avgEdgeAngle, L = 0.86 * e, wallH = 0.1 * e, thick = 0.04 * e, tower = 0.13 * e, towerH = 0.17 * e;
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
      const geo = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed();
      const c = new THREE.Color(color), n = geo.getAttribute('position').count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(geo);
    };
    const STONE = 0xc2b9a4, DARK = 0xa59c88, CAP = 0x857f72, WOOD = 0x6b4f35, h = L / 2;
    // The curtain walls (the front one in two, for the gate), their walks' merlons.
    for (const z of [-h, h]) {
      if (z > 0) { box(L * 0.38, wallH, thick, -L * 0.31, 0, z, STONE); box(L * 0.38, wallH, thick, L * 0.31, 0, z, STONE); box(L * 0.24, wallH * 0.75, thick * 0.5, 0, 0, z, WOOD); box(L * 0.3, wallH * 0.3, thick * 1.2, 0, wallH, z, DARK); }
      else box(L, wallH, thick, 0, 0, z, STONE);
      for (let k = -3; k <= 3; k++) if (k !== 0 || z < 0) box(L * 0.07, wallH * 0.28, thick, k * L * 0.14, wallH, z, DARK);
    }
    for (const x of [-h, h]) {
      box(thick, wallH, L, x, 0, 0, STONE);
      for (let k = -3; k <= 3; k++) box(thick, wallH * 0.28, L * 0.07, x, wallH, k * L * 0.14, DARK);
    }
    // The corner towers, capped.
    for (const x of [-h, h]) for (const z of [-h, h]) { box(tower, towerH, tower, x, 0, z, DARK); box(tower * 1.2, towerH * 0.14, tower * 1.2, x, towerH, z, CAP); }
    // (The yard left open: its garrison stands in it.)
    const pos: number[] = [], col: number[] = [], nor: number[] = [];
    for (const g of parts) {
      pos.push(...(g.getAttribute('position').array as Float32Array)); col.push(...(g.getAttribute('color').array as Float32Array)); nor.push(...(g.getAttribute('normal').array as Float32Array));
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return (this.fortGeo = geo);
  }
  // The forts on explored tiles, each standing on its tile's ground, turned by its tile.
  private updateForts(): void {
    const g = this.game;
    let seen = 0;
    for (let t = 0; t < g.N; t++) if (g.fort[t] && g.explored[t]) seen += t + 1;
    const key = `${g.fortVersion}|${seen}`;
    if (key === this.fortsKey) return;
    this.fortsKey = key;
    this.forts.clear();
    const up = new THREE.Vector3(0, 1, 0);
    for (let t = 0; t < g.N; t++) {
      if (!g.fort[t] || !g.explored[t]) continue;
      const m = new THREE.Mesh(this.fortGeometry(), this.fortMat);
      m.position.copy(this.surface(t));
      m.quaternion.setFromUnitVectors(up, g.tiles[t]!.center).multiply(new THREE.Quaternion().setFromAxisAngle(up, (t * 2.399) % (Math.PI / 2)));
      m.castShadow = true;
      m.receiveShadow = true;
      this.forts.add(m);
    }
    this.shadowsDirty = true;
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
      return this.terrain.samplePoint(t, i, wa, wb).setLength(this.shownRadius(t, i, wa, wb) + lift);
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
        this.edgeRibbon(t, i, 0.985, 0.915, 0.0015, pos);
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
    this.borders.userData['stat'] = 'borders';
    this.scene.add(this.borders);
  }

  // Reshapes built-up ground (terraform.ts: drained wetlands; hills kept
  // whole) when what is built up changed. Returns the tiles whose ground moved.
  private terraform(): number[] {
    const g = this.game;
    const built = (t: number) => g.use[t] === USE.center || g.ruins[t] === 1 || g.drained[t] === 1;
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
    const tiles = new Set<number>();
    for (const v of changes.keys()) tiles.add(topo.tile[v]!);
    for (const t of [...tiles]) for (const n of g.tiles[t].neighbors) tiles.add(n);
    return [...tiles];
  }

  // Cuts the top of a mountain tile for a wonder (Machu Picchu): round the
  // highest ground near the tile's middle (so the town stands on its own
  // tile, a higher peak at the tile's edge left towering over it), what
  // stands above a level is cut down to it, easing back into the slopes
  // beyond (nothing is built up: the mountain keeps its shape). The level:
  // the highest that leaves the town at least SUMMIT_HOUSES houses
  // (cityProps.ts summitLots: the lots it would build on that ground),
  // found by bisection between the peak and the lowest ground under the
  // town (cut to which, all of it is flat).
  private levelSummit(t: number): void {
    this.levelled.add(t);
    const g = this.game, topo = this.terrain.topo, H = this.terrain.fields.height;
    const near = new Set([t, ...g.tiles[t].neighbors]);
    const { c, k } = tileFrame(g, t);
    const angTo = (p: THREE.Vector3, v: number) => Math.acos(Math.min(1, p.x * topo.dir[v * 3]! + p.y * topo.dir[v * 3 + 1]! + p.z * topo.dir[v * 3 + 2]!));
    let peak = -1, any = -1;
    for (let v = 0; v < topo.V; v++) {
      if (topo.tile[v] !== t) continue;
      if (any < 0 || H[v]! > H[any]!) any = v;
      if (angTo(c, v) <= SUMMIT_CENTRE * k && (peak < 0 || H[v]! > H[peak]!)) peak = v;
    }
    if (peak < 0) peak = any;
    if (peak < 0) return;
    const P = new THREE.Vector3(topo.dir[peak * 3]!, topo.dir[peak * 3 + 1]!, topo.dir[peak * 3 + 2]!);
    const R = SUMMIT_FLAT * k, OUT = R + SUMMIT_EASE * k;
    const ring = new Map<number, number>();
    let low = Infinity, high = -Infinity;
    for (let v = 0; v < topo.V; v++) {
      if (!near.has(topo.tile[v]!)) continue;
      const ang = angTo(P, v);
      if (ang >= OUT) continue;
      ring.set(v, smoothstep(OUT, R, ang));
      if (ang <= R) { low = Math.min(low, H[v]!); high = Math.max(high, H[v]!); }
    }
    if (low === Infinity) return;
    // (A vertex's height once cut to `cut`.)
    const cutTo = (v: number, cut: number) => { const s = ring.get(v); return s === undefined || H[v]! <= cut ? H[v]! : H[v]! - s * (H[v]! - cut); };
    const smp = newSample();
    let hint = t;
    const houses = (cut: number) => this.cityProps.summitLots(t, P, cut, (d) => {
      const l = locate(g.globe, d, hint);
      hint = l.t;
      topo.sample(l.t, l.i, l.wa, l.wb, smp);
      let h = 0;
      for (let j = 0; j < 3; j++) h += smp.w[j]! * cutTo(smp.v[j]!, cut);
      return h;
    }).length;
    let cut = high;
    if (houses(high) < SUMMIT_HOUSES) {
      let lo = low, hi = high;
      for (let n = 0; n < 12; n++) { const mid = (lo + hi) / 2; if (houses(mid) >= SUMMIT_HOUSES) lo = mid; else hi = mid; }
      cut = lo;
    }
    const changes = new Map<number, { height: number; up: number }>();
    for (const [v, s] of ring) if (H[v]! > cut) changes.set(v, { height: cutTo(v, cut), up: s });
    this.terrain.reshape(changes);
    this.cityProps.setSummit(t, P, cut);
  }

  // City ground in the tile table (row 5, see terrainMaterial.ts): urban
  // and center tiles, and each rural tile's improvement pattern.
  private updateCityGround(): void {
    const g = this.game;
    const td = this.tileTex.image.data as Float32Array;
    for (let t = 0; t < g.N; t++) {
      const o = t * TILE_ROWS * 4 + 20;
      const u = g.use[t];
      const imp = u !== USE.center && g.ownerOf(t) >= 0 ? g.builtAt(t) : null;
      td[o] = u === USE.center ? 1 : 0;
      td[o + 2] = g.pillaged[t] ? BURNT_CODE : imp ? IMPROVEMENT_CODE[imp] : IMPROVEMENT_CODE.none;
      td[o + 3] = u === USE.center ? 1 : 0;
      // Its crops (the resource's own, if a farm of it) and its farm's stage (its owner's techs).
      // Its fields' straight sides (none for a pasture, or along water).
      const sides = imp === 'farm' || imp === 'plantation' || imp === 'wetland' ? this.cityProps.farmShape(t) : [];
      for (let j = 0; j < 6; j++) { const sd = sides[j]; td.set(sd ? [sd.nx, sd.ny, sd.c, sd.water ? 1 : 0] : [0, 0, -1, 0], t * TILE_ROWS * 4 + (13 + j) * 4); }
      td[t * TILE_ROWS * 4 + 35] = CROP_CODE[cropRegion(imp ?? g.improvementAt(t), g.biome[t]!, g.feature[t] ?? null, g.map.temperature[t]!, g.resourceFor(t, g.ownerOf(t)))] + STAGE_STEP * plotStage(imp, g.stageAt(t));
    }
    this.tileTex.needsUpdate = true;
  }

  // Smoke and fire in sight: damaged and burning cities, pillaged fields.
  private updateSmoke(): void {
    const g = this.game;
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
    }
    for (let t = 0; t < g.N; t++) {
      if (!g.pillaged[t] || !g.visible[t]) continue;
      out.push({ pos: at(t, 0, 0.2, 0.2), kind: 'smoke' }, { pos: at(t, 3, 0.3, 0.1), kind: 'fire' });
    }
    // Chimneys: a wisp from each forge, kiln and stove in sight (houses.ts
    // houseSmoke); a works' stacks in the industrial age pour it out.
    const p = new THREE.Vector3();
    for (const c of g.cities) {
      const era = g.players[c.owner]!.era, industrial = era >= 4, rate = SMOKE_RATE[era];
      // (A works' plume: soot from the industrial age, white steam in the information age.)
      const plume = era >= 6 ? 'steam' : 'factory';
      for (const t of [c.tile, ...g.cityTiles(c, USE.rural)]) {
        if (!g.visible[t]) continue;
        for (const b of this.cityProps.place(t)) {
          if (!isHouseKind(b.kind)) continue;
          const hk = parseHouseKind(b.kind), works = hk.variant === WORKS_VARIANT, home = useOf(hk.variant, hk.floors) === 'home';
          // (How often a chimney puffs: a home's HOME_SMOKE, always; a shop's or
          // a works' SMOKE_RATE, by its owner's era.)
          for (const [x, y, z] of houseSmoke(b.kind)) out.push({ pos: p.set(x, y, z).applyMatrix4(b.matrix).clone(), kind: works && industrial ? plume : 'chimney', rate: home ? HOME_SMOKE : rate });
        }
      }
    }
    this.smoke.set(out);
  }

  // Roads between cities (roads.ts), draped on the ground as dirt tracks
  // with soft edges. Rebuilt when the cities change (or what is explored).
  private updateRoads(force: boolean): void {
    const g = this.game;
    // (And what each civ lays: lays below.)
    const key = `${g.roadVersion}|` + g.cities.map((c) => `${c.id}:${c.owner}`).join(',') + '|' + g.players.map((p) => `${p.techs.has('railroad') ? 'r' : ''}${p.techs.has('combustion') ? 'a' : ''}`).join(',');
    if (key === this.roadsKey && !force) return;
    this.roadsKey = key;
    const halfW = ROAD_HALF_WIDTH * g.globe.avgEdgeAngle, lift = ROAD_LIFT * this.scale;
    const batches: RoadBatches = { edge: { pos: [], col: [], uv: [] }, top: { pos: [], col: [], uv: [] } };
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
    // A track's packed earth on tile t (TRACK_*: the tile table's land and soil).
    const td = this.tileTex.image.data as Float32Array;
    const earth = new Map<number, readonly [readonly number[], readonly number[]]>();
    const dirt = (t: number) => {
      let e = earth.get(t);
      if (!e) {
        const o = t * TILE_ROWS * 4, land = [td[o]!, td[o + 1]!, td[o + 2]!], soil = [td[o + 40]!, td[o + 41]!, td[o + 42]!];
        const packed = land.map((c, i) => (c + ((soil[i]! + (ROAD_DIRT[i]! - soil[i]!) * TRACK_EARTH) - c) * TRACK_PACKED) * ROAD_SHADE);
        e = [packed, packed.map((c, i) => c + (land[i]! * ROAD_SHADE - c) * TRACK_EDGE)];
        earth.set(t, e);
      }
      return e;
    };
    // What a civ lays (as in Civ V): tracks, asphalt from Combustion; a
    // railway once it knows the Railroad, in the road's place.
    const lays = (owner: number) => { const p = g.players[owner]; return { rail: p?.techs.has('railroad') ?? false, asphalt: p?.techs.has('combustion') ?? false }; };
    for (const road of roadLines(g)) {
      // Stone bridges once either end has left the Ancient era.
      const stone = [road.a, road.b].some((id) => { const c = g.cityById.get(id); return c !== undefined && g.players[c.owner]!.era > 0; });
      // (On into the towns at its ends, through their gates: cityProps.ts approach.)
      const first = road.ends[0] === null ? null : this.cityProps.approach(road.ends[0], road.points[0]!);
      const last = road.ends[1] === null ? null : this.cityProps.approach(road.ends[1], road.points[road.points.length - 1]!);
      const head = first ? [...first].reverse().slice(0, -1) : [], tail = last ? last.slice(1) : [];
      const pts = [...head, ...road.points, ...tail];
      // Each point as laid by the owner of its ground (no one's: the city nearer it).
      // (A stretch the workers laid has no cities of its own: on no one's ground, a plain track.)
      const ca = g.cityById.get(road.a), cb = g.cityById.get(road.b);
      const how = pts.map((d) => {
        const o = g.ownerOf(at(d).t);
        return lays(o >= 0 ? o : !ca || !cb ? -1 : d.angleTo(g.tiles[ca.tile].center) < d.angleTo(g.tiles[cb.tile].center) ? ca.owner : cb.owner);
      });
      const middle = (k: number) => (how[k]!.rail ? ROAD_KIND.rail : how[k]!.asphalt ? ROAD_KIND.asphalt : ROAD_KIND.dirt);
      // (In runs of one kind, each overlapping the next by a point.)
      for (let k = 0; k < pts.length; ) {
        let e = k;
        while (e + 1 < pts.length && middle(e + 1) === middle(k)) e++;
        const kind = middle(k), run = pts.slice(k, Math.min(pts.length, e + 2));
        if (run.length > 1) {
          if (kind === ROAD_KIND.dirt) this.drape(run, halfW, ROAD_RGB, batches, at, lift, bridges, stone, kind, dirt);
          else this.drape(run, kind === ROAD_KIND.rail ? halfW * RAIL_WIDTH : halfW, kind === ROAD_KIND.rail ? BALLAST_RGB : ASPHALT_RGB, batches, at, lift, bridges, stone, kind);
        }
        k = e + 1;
      }
    }
    // Streets and squares inside towns (cityProps.ts lays them out).
    for (const st of this.cityProps.streets()) this.drape(st.points, st.halfWidth, st.paved ? PAVED_RGB : DIRT_RGB, batches, at, lift, bridges, st.paved);
    for (const pv of this.cityProps.pavings()) {
      const n0 = batches.top.pos.length;
      this.pave(pv.points, pv.rgb ?? (pv.paved ? PAVED_RGB : DIRT_RGB), at, lift + (ROAD_LAYER + (pv.layer ?? 0) * PAINT_LAYER) * this.scale, batches.top.pos, batches.top.col, pv.exact);
      for (let i = n0; i < batches.top.pos.length; i += 3) batches.top.uv.push(0, 0, 2);
    }
    for (const grp of [...this.roads, ...(this.bridges ? [this.bridges] : []), ...(this.wonderSinks ? [this.wonderSinks] : [])]) this.dropChunked(grp);
    this.wonderSinks = this.sinkSheets(this.cityProps.sinks(), at, lift);
    this.roads = [batches.edge, batches.top].map((bt, i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bt.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(bt.col, 3));
      geo.setAttribute('roadUv', new THREE.Float32BufferAttribute(bt.uv, 3));
      windOutward(geo);
      geo.computeVertexNormals();
      const grp = this.chunkedSoup(geo, this.roadMats[i]!, (m) => {
        m.renderOrder = ROAD_ORDER + i;
        m.receiveShadow = true;
      });
      grp.userData['stat'] = 'roads & fields';
      this.scene.add(grp);
      return grp;
    });
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bridges.pos, 3));
    bgeo.setAttribute('color', new THREE.Float32BufferAttribute(bridges.col, 3));
    windOutward(bgeo);
    bgeo.computeVertexNormals();
    this.bridges = this.chunkedSoup(bgeo, this.bridgeMat, (m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });
    this.bridges.userData['stat'] = 'roads & fields';
    this.scene.add(this.bridges);
  }

  // Wonders' sinks (cityProps.ts SinkSheet): the ground's surface cut over
  // each (the terrain shader's holes: setTerrainHoles), its sides drawn
  // from the ground's edge (`lift` over it, so no crack shows between
  // them) down to its floor, darkening as they go down; the floor; in a
  // basin, its water drawn by the game's water material as standing water
  // WONDER_WATER_DEPTH deep, a lake's colour. (Explored ground only; at
  // most MAX_HOLES holes in the world.)
  private sinkSheets(sinks: readonly SinkSheet[], at: Ground, lift: number): THREE.Group | null {
    const holes: TerrainHole[] = [], dug: number[] = [], dugCol: number[] = [], pos: number[] = [];
    const push = (to: number[], ...ps: THREE.Vector3[]) => { for (const p of ps) to.push(p.x, p.y, p.z); };
    for (const sk of sinks) {
      if (!sk.rim[0] || !this.game.explored[at(sk.rim[0]).t] || holes.length + sk.holes.length > MAX_HOLES) continue;
      holes.push(...sk.holes);
      const n = sk.rim.length;
      const top = sk.rim.map((d) => d.clone().multiplyScalar(at(d).ground + lift)), bot = sk.rim.map((d, i) => d.clone().multiplyScalar(1 + sk.floor[i]!));
      const [r, g, b] = sk.side, dark = 0.62;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        push(dug, top[i]!, top[j]!, bot[j]!, top[i]!, bot[j]!, bot[i]!);
        for (const k of [1, 1, dark, 1, dark, dark]) dugCol.push(r * k, g * k, b * k);
      }
      for (const k of sk.tris) { push(dug, bot[k]!); dugCol.push(...sk.bottom); }
      if (sk.water !== null) for (const k of sk.tris) push(pos, sk.rim[k]!.clone().multiplyScalar(1 + sk.water[k]!));
    }
    setTerrainHoles(holes);
    this.holeChunks(holes);
    if (!dug.length) return null;
    const grp = new THREE.Group();
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.Float32BufferAttribute(dug, 3));
    dgeo.setAttribute('color', new THREE.Float32BufferAttribute(dugCol, 3));
    dgeo.computeVertexNormals();
    // (Shown in the debug views too, as the ground they are dug into is.)
    const sides = this.chunkedSoup(dgeo, this.bridgeMat, (m) => { m.castShadow = true; m.receiveShadow = true; m.userData['overlay'] = false; });
    for (const m of [...sides.children]) grp.add(m);
    grp.userData['stat'] = 'terrain';
    this.scene.add(grp);
    if (!pos.length) return grp;
    const n = pos.length / 3, tint = new THREE.Color(SEA_TINT.lake.deep);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('depth', new THREE.Float32BufferAttribute(new Float32Array(n).fill(WONDER_WATER_DEPTH), 1));
    const tints = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) tints.set([tint.r, tint.g, tint.b, SEA_TINT.lake.murk], v * 4);
    geo.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 4));
    // (Still: no flow; no grid line; in sight; a pool's, wsrc 2.)
    geo.setAttribute('flow', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    for (const name of ['ring', 'unexplored', 'dim', 'wstep']) geo.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute('wsrc', new THREE.Float32BufferAttribute(new Float32Array(n).fill(2), 1));
    windOutward(geo);
    // (The water's material.)
    if (!this.sheetMat) {
      const base = this.waterMat.material;
      this.sheetMat = base.clone();
      this.sheetMat.onBeforeCompile = base.onBeforeCompile;
      Object.assign(this.sheetMat, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
    const water = this.chunkedSoup(geo, this.sheetMat, (m) => {
      m.renderOrder = 1;
      m.receiveShadow = true;
      m.userData['stat'] = 'water';
    });
    for (const m of [...water.children]) grp.add(m);
    return grp;
  }

  // The ground's chunks within reach of a hole take the holed material
  // (and shadow material); the rest keep theirs, which never discards.
  private holeChunks(holes: readonly TerrainHole[]): void {
    for (const chunk of this.chunks) {
      const near = holes.some((h) => h.c.angleTo(chunk.dir) < chunk.radius + 2 * Math.hypot(h.hu, h.hv));
      for (const m of chunk.surface) {
        if (m.material !== this.terrainMat.material && m.material !== this.terrainMat.holed) continue;
        m.material = near ? this.terrainMat.holed : this.terrainMat.material;
        m.customDepthMaterial = this.groundDepth[near ? 1 : 0];
      }
    }
  }

  // A triangle soup (unindexed: roads, bridges), split into one mesh per
  // chunk (each triangle to the chunk nearest its middle), culled with the
  // chunk (cullChunks).
  private chunkedSoup(geo: THREE.BufferGeometry, mat: THREE.Material, setup: (m: THREE.Mesh) => void): THREE.Group {
    const pos = geo.getAttribute('position'), n = pos.count / 3;
    const triChunk = new Int32Array(n), count = new Int32Array(this.chunks.length);
    const mid = new THREE.Vector3();
    for (let tr = 0; tr < n; tr++) {
      mid.set(0, 0, 0);
      for (let c = 0; c < 3; c++) mid.x += pos.getX(tr * 3 + c), mid.y += pos.getY(tr * 3 + c), mid.z += pos.getZ(tr * 3 + c);
      let best = 0;
      for (let k = 1; k < this.chunks.length; k++) if (this.chunks[k]!.dir.dot(mid) > this.chunks[best]!.dir.dot(mid)) best = k;
      triChunk[tr] = best; count[best]++;
    }
    const group = new THREE.Group();
    this.chunks.forEach((chunk, k) => {
      if (count[k] === 0) return;
      const part = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geo.attributes)) {
        const size = attr.itemSize, src = attr.array, out = new Float32Array(count[k]! * 3 * size);
        let o = 0;
        for (let tr = 0; tr < n; tr++) {
          if (triChunk[tr] !== k) continue;
          for (let j = 0; j < 3 * size; j++) out[o++] = src[tr * 3 * size + j]!;
        }
        part.setAttribute(name, new THREE.BufferAttribute(out, size));
      }
      const mesh = new THREE.Mesh(part, mat);
      mesh.frustumCulled = false;
      mesh.userData['overlay'] = true;
      setup(mesh);
      chunk.surface.push(mesh);
      group.add(mesh);
    });
    geo.dispose();
    return group;
  }

  // Removes a chunked group (chunkedSoup) from the scene and its chunks.
  private dropChunked(group: THREE.Group): void {
    this.scene.remove(group);
    for (const m of group.children) {
      if (!(m instanceof THREE.Mesh)) continue;
      m.geometry.dispose();
      for (const chunk of this.chunks) {
        const i = chunk.surface.indexOf(m);
        if (i >= 0) chunk.surface.splice(i, 1);
      }
    }
  }

  // A paved square: a fan from its middle, each point on the ground.
  // Squares are part of the street surface: the streets' own color, and
  // grown a little so they overlap the streets round them (no kerb between).
  // (`exact`: as given, not grown under the streets round it: a painted city's roads.)
  private pave(corners: readonly THREE.Vector3[], rgb: readonly [number, number, number], at: Ground, lift: number, pos: number[], col: number[], exact = false): void {
    if (corners.length < 3 || !this.game.explored[at(corners[0]!).t]) return;
    const mid = corners.reduce((a, p) => a.add(p), new THREE.Vector3()).normalize();
    const grow = exact ? 0 : SQUARE_GROW * this.game.globe.avgEdgeAngle;
    const pts = corners.map((p) => { const out = p.clone().sub(mid); return p.clone().addScaledVector(out, grow / Math.max(1e-9, out.length())).normalize(); });
    const on = (d: THREE.Vector3) => { const h = at(d); return d.clone().multiplyScalar(Math.max(h.ground, h.water) + lift); };
    // A fine fan (rings in from the edge, the edge subdivided) so the paving
    // follows the ground: big flat triangles would dip under bumps and let
    // the kerbs of the streets under them show through. (Unless the ground
    // under it is flat enough: then a plain fan from its middle, if every
    // point of the fine one keeps within ROAD_TOL of it.)
    const SUB = 4, RINGS = 4;
    const ring: THREE.Vector3[] = [];
    pts.forEach((p, k) => { const q = pts[(k + 1) % pts.length]!; for (let s = 0; s < SUB; s++) ring.push(p.clone().lerp(q, s / SUB).normalize()); });
    const point = (p: THREE.Vector3, r: number) => (r === 0 ? mid : mid.clone().lerp(p, r / RINGS).normalize());
    const lvl = (d: THREE.Vector3) => { const h = at(d); return Math.max(h.ground, h.water); };
    const hMid = lvl(mid), hCorner = pts.map(lvl), tol = ROAD_TOL * this.scale;
    let flat = true;
    for (let k = 0; k < ring.length && flat; k++) {
      const c = Math.floor(k / SUB), f = (k % SUB) / SUB, he = hCorner[c]! + (hCorner[(c + 1) % pts.length]! - hCorner[c]!) * f;
      for (let r = 1; r <= RINGS; r++) if (Math.abs(hMid + (he - hMid) * (r / RINGS) - lvl(point(ring[k]!, r))) > tol) { flat = false; break; }
    }
    if (flat) {
      const m0 = on(mid);
      pts.forEach((p, k) => {
        const a = on(p), b = on(pts[(k + 1) % pts.length]!);
        pos.push(m0.x, m0.y, m0.z, a.x, a.y, a.z, b.x, b.y, b.z);
        for (let n = 0; n < 3; n++) col.push(rgb[0], rgb[1], rgb[2]);
      });
      return;
    }
    const inner = (p: THREE.Vector3, r: number) => on(point(p, r));
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
  // (`kind`: the road's, as the road material draws it (ROAD_KIND); `dirt`:
  // a track's packed earth by the tile it crosses, in place of `rgb`.)
  private drape(pts: readonly THREE.Vector3[], halfWidth: number | readonly number[], rgb: readonly [number, number, number], roads: RoadBatches,
    at: Ground, lift: number, bridges?: Bridges, stone = false, kind: number = rgb === PAVED_RGB ? ROAD_KIND.paved : ROAD_KIND.dirt,
    dirt?: (t: number) => readonly [readonly number[], readonly number[]]): void {
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
    // (Then thinned: a point dropped where the strip, straight from the
    // last kept to the next, would keep within ROAD_TOL of the ground along
    // its middle and both edges, and the road keep its line: fine where the
    // ground or the road bends, long straight runs where neither does. Every
    // point near water or unexplored ground kept, for the bridges and the ends.)
    {
      const m = fine.length, hs = fine.map((d) => at(d));
      const lvl = (h: { ground: number; water: number }) => Math.max(h.ground, h.water);
      const sideAt = (k: number) => fine[k]!.clone().cross(fine[Math.min(m - 1, k + 1)]!.clone().sub(fine[Math.max(0, k - 1)]!)).normalize().multiplyScalar(fineW[k]!);
      const prof = fine.map((d, k) => { const sd = sideAt(k); return [lvl(hs[k]!), lvl(at(d.clone().add(sd).normalize())), lvl(at(d.clone().sub(sd).normalize()))]; });
      const dist = [0];
      for (let k = 1; k < m; k++) dist.push(dist[k - 1]! + fine[k]!.angleTo(fine[k - 1]!));
      const tol = ROAD_TOL * this.scale;
      const pin = (k: number) => !g.explored[hs[k]!.t] || [k - 1, k, k + 1].some((j) => j >= 0 && j < m && hs[j]!.water > hs[j]!.ground);
      const kept = [0];
      let a = 0;
      for (let b = 1; b < m; b++) {
        const fits = (end: number) => {
          // (Off the straight line from a to end by no more than a little of
          // its width: the given points dropped only where the road runs straight.)
          const nrm = fine[a]!.clone().cross(fine[end]!);
          if (nrm.lengthSq() < 1e-24) return false;
          nrm.normalize();
          for (let i = a + 1; i < end; i++) {
            if (Math.abs(fine[i]!.dot(nrm)) > ROAD_BEND * fineW[i]!) return false;
            const t = (dist[i]! - dist[a]!) / Math.max(1e-12, dist[end]! - dist[a]!);
            for (let j = 0; j < 3; j++) if (Math.abs(prof[a]![j]! + (prof[end]![j]! - prof[a]![j]!) * t - prof[i]![j]!) > tol) return false;
          }
          return true;
        };
        if (pin(b) || b === m - 1 || !fits(b + 1) || b - a >= ROAD_RUN) { kept.push(b); a = b; }
      }
      pts = kept.map((k) => fine[k]!);
      fineW.splice(0, fineW.length, ...kept.map((k) => fineW[k]!));
    }
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
    const edgeRgb = kind === ROAD_KIND.paved ? ROAD_KERB : kind === ROAD_KIND.asphalt ? ASPHALT_EDGE : kind === ROAD_KIND.rail ? BALLAST_EDGE : rgb.map((c) => c * 0.82);
    // (A track's colours, surface and edge, each point's averaged over its
    // neighbours': no step where it crosses into the next tile.)
    const SMOOTH = 12;
    const own = dirt ? here.map((h) => dirt(h.t)) : null;
    const colorAt = (k: number, edge: boolean): readonly number[] => {
      if (!own) return edge ? edgeRgb : rgb;
      const c = [0, 0, 0];
      let w = 0;
      for (let j = Math.max(0, k - SMOOTH); j <= Math.min(n - 1, k + SMOOTH); j++) { const o = own[j]![edge ? 1 : 0]; c[0] += o[0]!; c[1] += o[1]!; c[2] += o[2]!; w++; }
      return [c[0]! / w, c[1]! / w, c[2]! / w];
    };
    const surfaceRgb = own ? Array.from({ length: n }, (_, k) => colorAt(k, false)) : null;
    const shoulderRgb = own ? Array.from({ length: n }, (_, k) => colorAt(k, true)) : null;
    const heightAt = (k: number, q: THREE.Vector3, center: boolean) => {
      if (deck[k] !== null) return deck[k]!;
      const o = center ? here[k]! : at(q);
      return Math.max(o.ground, o.water);
    };
    // (How far along the road each point is, tile steps: the texture runs along it.)
    const along: number[] = [0];
    for (let k = 1; k < n; k++) along.push(along[k - 1]! + pts[k]!.angleTo(pts[k - 1]!) / g.globe.avgEdgeAngle);
    const layer = (share: number, up: number, color: readonly number[], perPoint: readonly (readonly number[])[] | null, out: Batch) => {
      type UV = readonly [number, number];
      const tri = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, u0: UV, u1: UV, u2: UV, k0 = -1, k1 = k0, k2 = k1) => {
        out.pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        for (const k of [k0, k1, k2]) { const c = perPoint && k >= 0 ? perPoint[k]! : color; out.col.push(c[0]!, c[1]!, c[2]!); }
        out.uv.push(u0[0], u0[1], kind, u1[0], u1[1], kind, u2[0], u2[1], kind);
      };
      const cap = (k: number, row: THREE.Vector3[], dir: number) => {
        // A half disc beyond the end, at the end's height.
        const d = pts[k]!, mid = row[ROAD_MID]!, r = mid.length(), w = hwAt(k) * share;
        const tan = pts[Math.min(n - 1, k + 1)]!.clone().sub(pts[Math.max(0, k - 1)]!).normalize().multiplyScalar(dir * w);
        const side = d.clone().cross(tan).normalize().multiplyScalar(w);
        const ring: THREE.Vector3[] = [], ruv: UV[] = [], wt = w / g.globe.avgEdgeAngle;
        for (let i = 0; i <= 8; i++) {
          const t = (i / 8) * Math.PI;
          ring.push(d.clone().addScaledVector(side, Math.cos(t)).addScaledVector(tan, Math.sin(t)).normalize().multiplyScalar(r));
          ruv.push([Math.cos(t), along[k]! + dir * Math.sin(t) * wt]);
        }
        for (let i = 0; i < 8; i++) tri(mid, ring[i]!, ring[i + 1]!, [0, along[k]!], ruv[i]!, ruv[i + 1]!, k);
      };
      let prev: THREE.Vector3[] | null = null, prevK = 0;
      for (let k = 0; k < n; k++) {
        const d = pts[k]!;
        const tan = pts[Math.min(n - 1, k + 1)]!.clone().sub(pts[Math.max(0, k - 1)]!);
        if (tan.lengthSq() < 1e-14) continue;
        if (!g.explored[here[k]!.t]) { if (prev) cap(prevK, prev, 1); prev = null; continue; }
        const side = d.clone().cross(tan).normalize().multiplyScalar(hwAt(k) * share);
        const row = ROAD_ACROSS.map((u, j) => {
          const q = d.clone().addScaledVector(side, u).normalize();
          return q.multiplyScalar(heightAt(k, q, j === ROAD_MID) + lift + up);
        });
        if (!prev) cap(k, row, -1);
        else {
          const a0 = along[prevK]!, a1 = along[k]!;
          for (let j = 0; j + 1 < row.length; j++) {
            const ua = ROAD_ACROSS[j]!, ub = ROAD_ACROSS[j + 1]!;
            tri(prev[j]!, prev[j + 1]!, row[j + 1]!, [ua, a0], [ub, a0], [ub, a1], prevK, prevK, k);
            tri(prev[j]!, row[j + 1]!, row[j]!, [ua, a0], [ub, a1], [ua, a1], prevK, k, k);
          }
        }
        prev = row; prevK = k;
      }
      if (prev) cap(prevK, prev, 1);
    };
    layer(1, 0, edgeRgb, shoulderRgb, roads.edge);
    layer(ROAD_SURFACE, ROAD_LAYER * s, rgb, surfaceRgb, roads.top);
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
    fanCoords(this.frames[fanId], fan, paintDelta(this.paint.params, dir.x, dir.y, dir.z), dir.x, dir.y, dir.z, this.spotCo);
    const w = softAt(this.paint, fanId, this.spotCo), pw = paintAt(this.paint, fanId, this.spotCo).w;
    this.terrain.topo.sample(t, i, wa, wb, this.spotSmp);
    let owner = 0;
    for (let c = 1; c < 4; c++) if (pw[c]! > pw[owner]!) owner = c;
    let urban = 0;
    for (let c = 0; c < 4; c++) {
      const u = g.use[fan.ids[c]];
      if (u === USE.center) urban += w[c];
    }
    const lv = this.terrain.at(t, i, wa, wb);
    let slope = 0, bank = 0, coast = 0;
    const banks = this.terrain.fields.ground['bank']!;
    for (let c = 0; c < 3; c++) {
      const v = this.spotSmp.v[c], wv = this.spotSmp.w[c];
      slope += wv * this.vertSlope[v]; bank += wv * banks[v]!; coast += wv * this.vertCoast[v];
    }
    return { dir, ground: lv.ground - 1, water: lv.water - 1, slope, urban, owner: fan.ids[owner]!, own: w[owner]!, bank, coast: coast / this.paint.params.r0 };
  }

  private ring(t: number, color: number, opacity: number, outer = 0.95, inner = 0.85): THREE.Mesh {
    const pos: number[] = [];
    for (let i = 0; i < this.game.tiles[t].corners.length; i++) this.edgeRibbon(t, i, outer, inner, 0.002, pos);
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

  // A fight shown without the game's rules (dev views): a unit attacking a tile.
  showBattle(unit: number, tile: number, style: AttackStyle, result?: FightResult): void { this.unitView.fight(unit, tile, style, performance.now() / 1000, result); }

  // Where the camera looks (a unit vector).
  get looking(): THREE.Vector3 { return (this.walk.active ? this.walk.position : this.cam.target).clone().normalize(); }

  // The units in sight, to the unit view (fighting units first on a shared
  // tile: they stand in the middle).
  private updateUnits(sel: Selection): void {
    const g = this.game;
    this.selUnit = sel?.kind === 'unit' ? sel.unit : null;
    // (Units packed in an army are carried by their commander, not shown.)
    const shown: ShownUnit[] = g.units
      .filter((u) => g.visible[u.tile] && u.packedIn === null)
      .sort((a, b) => Number(unitDef(a.type).civilian ?? false) - Number(unitDef(b.type).civilian ?? false))
      .map((u) => ({ id: u.id, type: u.type, civ: g.players[u.owner].name, color: g.players[u.owner].color, tile: u.tile, hp: u.hp, suffrage: g.players[u.owner].politics.has('womensSuffrage'), embarked: g.isEmbarked(u), fortified: u.fortified }));
    this.unitView.sync(shown, performance.now() / 1000);
  }

  // A unit's flag: its icon and health in its owner's colour, a fixed size
  // on screen.
  private unitFlag(s: ShownUnit): Billboard {
    const g = this.game, u = g.units.find((x) => x.id === s.id);
    const icon = unitIcon(s.type), civilian = unitDef(s.type).civilian === true, selected = u !== undefined && u === this.selUnit, fortified = u?.fortified ?? false;
    // (A commander's flag counts it and its army.)
    const count = u?.type === 'commander' ? 1 + g.armyOf(u).length : 1;
    const key = `u|${s.color}|${icon}|${civilian}|${count}|${Math.ceil(s.hp / 10)}|${selected}|${fortified}`;
    return this.unitFlags.add(key, (ctx) => drawUnitFlag(ctx, s.color, icon, civilian, count, s.hp, selected, fortified));
  }

  // A badge over each explored tile's resource the player knows of (a
  // strategic one once revealed: resources.ts): its code on a dark chip, a
  // bar of its kind's colour (bonus, luxury, strategic). Rebuilt when more
  // of the map is explored, or a tech reveals more.
  private updateResources(): void {
    const g = this.game;
    let n = 0;
    for (let t = 0; t < g.N; t++) if (g.explored[t] && g.resourceFor(t, HUMAN)) n++;
    if (n === this.resourcesShown) return;
    // (More known: their models too.)
    if (this.resourcesShown >= 0) this.updateProps();
    this.resourcesShown = n;
    for (const b of this.resourceBoards) b.dispose();
    this.resourceBoards = [];
    for (let t = 0; t < g.N; t++) {
      const r = g.explored[t] ? g.resourceFor(t, HUMAN) : null;
      if (!r) continue;
      const d = resourceDef(r);
      const badge = this.resourceBadges.add(`res|${r}`, (ctx) => drawResourceIcon(ctx, resourceIcon(r), RESOURCE_COLORS[d.kind]));
      // (Off the center, toward a corner: units and cities stand in the middle.)
      const tile = g.tiles[t];
      const dir = tile.center.clone().lerp(g.globe.triCenters[tile.corners[2 % tile.corners.length]!]!, 0.45).normalize();
      badge.position.copy(dir).multiplyScalar(this.terrain.centerRadius[t] + 0.012 * this.scale);
      this.resourceBoards.push(badge);
    }
  }

  // The yields lens: what each explored tile near where the camera looks
  // yields (worked land: what it gives its city; the rest: its terrain's
  // and its known resource's), over the tile, away from its resource's
  // medallion. Made again when the camera has moved on, or the land changed.
  private updateYields(): void {
    const g = this.game, at = this.cam.target;
    const key = `${g.turn}|${g.useVersion}|${this.resourcesShown}`;
    // (As far round where the camera looks as it sees: more tiles from higher up.)
    const reach = Math.round(Math.min(34, Math.max(YIELDS_REACH, (this.cam.distance * 0.75) / g.globe.avgEdgeAngle)));
    if (key === this.yieldsKey && reach === this.yieldsReach && at.distanceTo(this.yieldsAt) < 0.3 * reach * g.globe.avgEdgeAngle) return;
    this.yieldsReach = reach;
    this.yieldsKey = key;
    this.yieldsAt.copy(at);
    for (const b of this.yieldBoards) b.dispose();
    this.yieldBoards = [];
    const from = this.nearestTile(at.clone().normalize(), this.hoverTile >= 0 ? this.hoverTile : 0);
    for (const t of g.tilesWithin(from, reach)) {
      if (!g.explored[t]) continue;
      let food: number, prod: number, gold: number;
      if (g.use[t] !== USE.wild) ({ food, prod, gold } = g.tileOutput(t));
      else {
        const y = g.tileYield(t), r = g.resourceFor(t, HUMAN), ry = r ? resourceDef(r).yields : null;
        food = y.food + (ry?.food ?? 0); prod = y.prod + (ry?.prod ?? 0); gold = y.gold + (ry?.gold ?? 0);
      }
      if (food + prod + gold <= 0) continue;
      const board = this.yieldBadges.add(`y|${food}|${prod}|${gold}`, (ctx) => drawTileYields(ctx, [['food', food], ['prod', prod], ['gold', gold]]));
      const tile = g.tiles[t]!, k = tile.corners.length;
      const dir = tile.center.clone().lerp(g.globe.triCenters[tile.corners[(2 + (k >> 1)) % k]!]!, 0.4).normalize();
      board.position.copy(dir).multiplyScalar(this.terrain.centerRadius[t]! + 0.011 * this.scale);
      this.yieldBoards.push(board);
    }
  }

  private updateCities(): void {
    const g = this.game;
    for (const b of this.cityBoards) b.dispose();
    this.cityBoards = [];
    const s = this.scale;
    for (const city of g.cities) {
      if (!g.explored[city.tile]) continue;
      const tile = g.tiles[city.tile];
      const color = g.players[city.owner].color;
      const hp = Math.round((10 * city.hp) / g.cityMaxHp(city)) / 10;
      // (Its growth and what it builds: its owner's to see.)
      const mine = city.owner === HUMAN, item = city.building;
      const growth = mine ? Math.round(12 * Math.min(1, city.food / Math.max(1, g.growthCostOf(city, city.pop + city.growth)))) / 12 : null;
      const production = mine && item ? Math.round(12 * Math.min(1, city.prod / buildCost(item))) / 12 : null;
      const glyph = !mine || !item ? null : isUnitKey(item) ? unitIcon(item) : isWonder(item) ? 'star' as const : 'building' as const;
      const capital = g.players[city.owner]!.capital === city.id;
      const key = `c|${this.fontEpoch}|${color}|${city.pop}|${city.name}|${hp}|${capital}|${growth}|${production}|${glyph}`;
      const board = this.cityLabels.add(key, (ctx) => drawCityBanner(ctx, { name: city.name, pop: city.pop, color, capital, hp, growth, production, glyph }));
      board.position.copy(tile.center).multiplyScalar(this.terrain.centerRadius[city.tile] + 0.03 * s);
      this.cityBoards.push(board);
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

  // Places the sun and the sky fill above where we look, and keeps the
  // shadow map current. The sun belongs to the place, not the camera
  // (sunAt): turning, tilting or zooming leaves the shadows as they are.
  // The shadow map covers a padded square round the view and is redrawn only
  // when the view leaves it or outgrows it, shrinks well inside it (a
  // tighter one is crisper), the sun has turned more than SHADOW_TURN since
  // (panning far east or west) or the world changed.
  private updateSun(): void {
    const cam = this.camera;
    this.floraUniforms.eye.value.copy(cam.position);
    const focus = (this.walk.active ? this.walk.position : this.cam.target).clone().normalize();
    const dir = sunAt(focus, LIGHT.sunHeight);
    this.sunDir.copy(dir);
    // The sky fill's up is the ground's up where we look (a hemisphere light
    // has one up: left at the world's +y it lit the far side of the globe
    // with its ground colour, muddying every colour there).
    this.fill.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(dir, 3);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    if (!this.sun.castShadow) return;
    // The ground in view (more of it when tilted): tight when zoomed in
    // (crisp shadows), the whole hemisphere from afar.
    const span = this.cam.distance * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * Math.max(1, cam.aspect) * 1.3;
    const want = this.walk.active ? 0.05 : Math.min(SHADOW_MAX_HALF, Math.max(0.08, span * (1 + 1.5 * Math.sin(this.cam.tilt))));
    const last = this.shadowAt;
    // (A map already at its largest can't outgrow the view: from afar it
    // would otherwise be redrawn every frame.)
    const stale = this.shadowsDirty || !last
      || focus.angleTo(last.center) > SHADOW_SLACK * last.half
      || (want > last.half * 0.9 && last.half < SHADOW_MAX_HALF) || want < (last.half / SHADOW_PAD) * 0.6
      || dir.angleTo(last.dir) > (SHADOW_TURN * Math.PI) / 180;
    if (!stale) return;
    const half = Math.min(SHADOW_MAX_HALF, want * SHADOW_PAD);
    this.shadowAt = { center: focus, dir, half };
    this.shadowsDirty = false;
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    // (A tight depth range round the view, the sun 3 away: precise depths.)
    sc.near = 3 - SHADOW_DEPTH / 2; sc.far = 3 + SHADOW_DEPTH / 2;
    sc.updateProjectionMatrix();
    // The normal offset follows the shadow map's texel size: enough to keep
    // slopes free of acne, small enough up close for houses to shadow the
    // ground beside them.
    const texel = (2 * half) / this.sun.shadow.mapSize.x;
    this.sun.shadow.normalBias = SHADOW_NORMAL_TEXELS * texel;
    this.sun.shadow.radius = Math.min(SHADOW_BLUR_TEXELS[1], Math.max(SHADOW_BLUR_TEXELS[0], SHADOW_BLUR / texel));
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
    // The haze only from high up (the planet's atmosphere seen from orbit):
    // over the board and walking there is none, so nothing is veiled.
    (this.scene.fog as THREE.FogExp2).density = this.walk.active ? 0 : HAZE_DENSITY * smoothstep(0.25, 0.7, alt / AIR.height);
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

    // Every display frame: water, clouds and rain keep moving smoothly.
    const now = performance.now();
    this.updateSun();
    this.updateAir();
    this.cullChunks();
    this.unitView.update(now / 1000, this.camera, this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.terrainMat.setTime(now / 1000);
    this.floraTime.value = now / 1000;
    this.camera.updateMatrixWorld();
    for (const b of [this.unitFlags, this.cityLabels, this.resourceBadges, this.yieldBadges]) if (b.mesh.visible) b.update(this.camera);
    this.smoke.update(now / 1000, this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.smoke.points.visible = this.view === 'normal';
    this.waterMat.setTime(now / 1000);
    // Clouds show from orbit and overhead when walking, never over the board (CLOUDS_FROM).
    const fog = this.scene.fog as THREE.FogExp2;
    const alt = this.viewAltitude();
    this.weather.update(now / 1000, this.sunDir, this.walk.active ? [0, 0] : [0.15, 0.6],
      this.walk.active ? 1 : smoothstep(CLOUDS_FROM, CLOUDS_FULL, alt / AIR.height), { color: fog.color, density: fog.density });
    for (const k of this.statTris.keys()) this.statTris.set(k, 0);
    const t0 = performance.now();
    this.gpuTimer.frame(t0);
    this.gpuTimer.begin();
    // (A fine triangle of the ground on screen: a tile's edge over the lattice's steps, SUBDIV × 2, where the camera looks.)
    const triPx = (this.game.globe.avgEdgeAngle / (SUBDIV * 2)) * this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(1e-6, this.camera.position.length() - 1);
    this.msaaOn = this.walk.active || triPx > (this.msaaOn ? MSAA_BELOW_PX : MSAA_ABOVE_PX);
    // (The categories hidden from the counter's table: left out of this frame.)
    const hid: THREE.Object3D[] = [];
    if (this.hiddenStats.size) this.scene.traverse((o) => { if (o.visible && this.hiddenStats.has(o.userData['stat'])) { o.visible = false; hid.push(o); } });
    const tris = this.draw(this.msaaOn);
    for (const o of hid) o.visible = true;
    this.gpuTimer.end();
    this.countFrame(performance.now() - t0, tris);
  }

  // A frame, multisampled (straight to the canvas) or not (into `flat`,
  // then copied to it). Its triangles (the copy's left out).
  private draw(multisampled: boolean): number {
    if (multisampled) { this.renderer.render(this.scene, this.camera); return this.renderer.info.render.triangles; }
    const size = this.renderer.getDrawingBufferSize(this.bufferSize);
    if (this.flat.width !== size.x || this.flat.height !== size.y) this.flat.setSize(size.x, size.y);
    this.renderer.setRenderTarget(this.flat);
    this.renderer.render(this.scene, this.camera);
    const tris = this.renderer.info.render.triangles;
    this.renderer.setRenderTarget(null);
    this.flatCopy.frustumCulled = false;
    this.renderer.render(this.flatCopy, this.copyCam);
    return tris;
  }

  // FPS counter: frames drawn per second, CPU and GPU time per frame (the
  // GPU's where the browser can time it, gpuTimer.ts) and triangles drawn
  // per frame.
  private countFrame(ms: number, tris: number): void {
    if (!this.fpsEl) return;
    this.fpsFrames++;
    this.fpsWork += ms;
    this.fpsTris = tris;
    const now = performance.now();
    if (now - this.fpsSince < 500) return;
    const fps = (this.fpsFrames * 1000) / (now - this.fpsSince);
    // The last frame's triangles by category (what no hook saw yet: other).
    const gpu = this.gpuTimer.ms;
    const head = `${this.statsOpen ? '▾' : '▸'} ${fps.toFixed(0)} fps · ${(this.fpsWork / this.fpsFrames).toFixed(1)} ms CPU${gpu === null ? '' : ` · ${gpu.toFixed(1)} ms GPU`} · ${fmtTris(this.fpsTris)} tris`;
    if (!this.statsOpen) this.fpsEl.textContent = head;
    else {
      const rows = [...this.statTris].filter(([k, v]) => v > 0 || this.hiddenStats.has(k)).sort((a, b) => b[1] - a[1]);
      const other = this.fpsTris - rows.reduce((a, [, v]) => a + v, 0);
      if (other > 0) rows.push(['other', other]);
      this.fpsEl.innerHTML = `<div>${head}</div><table class="tris">`
        + `${rows.map(([k, v]) => `<tr data-stat="${k}"${this.hiddenStats.has(k) ? ' class="off"' : ''}><th>${k}</th><td>${this.hiddenStats.has(k) ? 'hidden' : fmtTris(v)}</td></tr>`).join('')}</table>`;
    }
    this.fpsFrames = 0; this.fpsWork = 0; this.fpsSince = now;
    this.hookStats();
  }

  // Hooks every mesh not yet hooked to add the triangles it draws (the
  // renderer's count before and after) to its category: its own, or its
  // nearest tagged ancestor's.
  private hookStats(): void {
    const info = this.renderer.info.render;
    this.scene.traverse((o) => {
      if (o.userData['statHooked'] || !(o instanceof THREE.Mesh)) return;
      o.userData['statHooked'] = true;
      let a: THREE.Object3D | null = o, stat = 'other';
      for (; a; a = a.parent) if (typeof a.userData['stat'] === 'string') { stat = a.userData['stat']; break; }
      if (!this.statTris.has(stat)) this.statTris.set(stat, 0);
      let before = 0;
      o.onBeforeRender = () => { before = info.triangles; };
      o.onAfterRender = () => { this.statTris.set(stat, this.statTris.get(stat)! + info.triangles - before); };
    });
  }
}

// Where the sun shines from at a point of the globe (a unit direction):
// `height` degrees above the local horizon, from the local south-west, so
// shadows fall to the north-east (upper right when north is up): a camera
// looking north, tilted, sees the sunlit south faces. A smooth
// field but at the poles (no north there), where no trees grow to cast a
// shadow. The world's: the camera does not move it.
//   sun(p) = normalize(up · sin h − (north + east) / √2 · cos h),
//   up = p, north = northAt(p), east = north × up.
function sunAt(p: THREE.Vector3, height: number): THREE.Vector3 {
  const up = p.clone().normalize(), north = northAt(up), east = north.clone().cross(up);
  const h = (height * Math.PI) / 180;
  return up.multiplyScalar(Math.sin(h)).add(north.add(east).normalize().multiplyScalar(-Math.cos(h))).normalize();
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

function fmtTris(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;
}


// A resource's medallion (mapIcons.ts): its rim, by kind.
const RESOURCE_COLORS = { bonus: '#8fd47f', luxury: '#c79be8', strategic: '#e8a94f' } as const;
// The yields lens covers the tiles this many steps round where the camera looks, at the least.
const YIELDS_REACH = 9;
const buildCost = (k: BuildKey): number => buildDef(k).cost;

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
// normals point up, for the light.
// Walls (no clear outside) are left as they are.
function windOutward(geo: THREE.BufferGeometry): void {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(d.clone().sub(a));
    const up = n.dot(a) / (n.length() * a.length() || 1);
    if (up >= -0.3) continue;
    // Swap the last two vertices (and all they carry).
    for (const attr of Object.values(geo.attributes) as THREE.BufferAttribute[]) {
      for (let k = 0; k < attr.itemSize; k++) {
        const t = attr.getComponent(i + 1, k);
        attr.setComponent(i + 1, k, attr.getComponent(i + 2, k));
        attr.setComponent(i + 2, k, t);
      }
    }
  }
}

// Road material, by kind (ROAD_KIND): a track as a farm's lanes are,
// packed earth of the land it crosses (the soil scan along it,
// groundTextures.ts; the outer edge ragged into the ground), a paved
// street its stones' grain, a town's paving the grain alone, asphalt, a
// railway; vertex colors. `top`: the surface layer (its edge ragged too,
// over the shoulders below). The grain comes
// from the world position (the same wherever streets overlap, so joins
// never show); polygon offset keeps it over the ground.
const ROAD_TEX_REPEAT = 0.05; // the soil scan's repeat along a road (tile steps)
// A railway (tile steps; across, shares of its half width): the ballast
// scan's repeat, a sleeper every RAIL_SLEEPER, sleepers RAIL_TIE_SPAN
// across, the rails RAIL_GAUGE out from the middle; asphalt's dashes.
const RAIL_TEX_REPEAT = 0.03, RAIL_SLEEPER = 0.006, RAIL_TIE_SPAN = 0.62, RAIL_GAUGE = 0.36;
const ASPHALT_DASH = 0.03;
function makeRoadMaterial(offset: number, depthWrite: boolean): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset, depthWrite });
  const top = depthWrite;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uGround'] = groundUniform();
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 roadUv;\nvarying vec3 vRoadPos;\nvarying vec3 vRoadUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadPos = position; vRoadUv = roadUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler2DArray uGround;
        varying vec3 vRoadPos;
        varying vec3 vRoadUv;
        float roadHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float roadNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(roadHash(i), roadHash(i + vec3(1, 0, 0)), f.x), mix(roadHash(i + vec3(0, 1, 0)), roadHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(roadHash(i + vec3(0, 0, 1)), roadHash(i + vec3(1, 0, 1)), f.x), mix(roadHash(i + vec3(0, 1, 1)), roadHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = 0.9 + 0.12 * roadNoise(vRoadPos * 9000.0) + 0.06 * roadNoise(vRoadPos * 1800.0);
        float kind = vRoadUv.z;
        float u = vRoadUv.x, a = abs(u);
        if (kind > 1.5 && kind < 2.5) diffuseColor.rgb *= grain;
        else if (kind > 3.5) {
          // A railway: a bed of ballast (gravel), sleepers across it, two
          // steel rails along them; seen from far, the ballast alone with a
          // darker line where the track is.
          vec4 t = texture(uGround, vec3(vec2(u * ${ROAD_HALF_WIDTH}, vRoadUv.y) / ${RAIL_TEX_REPEAT}, ${GROUND_LAYER.rock}.0));
          diffuseColor.rgb *= (0.75 + 0.5 * t.r) * grain;
          ${top ? `float fw = fwidth(vRoadUv.y) / ${RAIL_SLEEPER};
          float sharp = 1.0 - smoothstep(0.25, 0.6, fw);
          float sleeper = (1.0 - step(${RAIL_TIE_SPAN}, a)) * step(0.62, fract(vRoadUv.y / ${RAIL_SLEEPER}));
          float rail = 1.0 - smoothstep(0.035, 0.035 + fwidth(u) * 1.5, abs(a - ${RAIL_GAUGE}));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.72, vec3(0.3, 0.22, 0.16), sharp), sleeper * (1.0 - step(${RAIL_TIE_SPAN}, a)) * mix(0.5, 1.0, sharp));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.64), rail * mix(0.4, 1.0, sharp));` : ''}
        } else if (kind > 2.5) {
          // Asphalt: dark and even, finely grained; a dashed pale line down
          // its middle (gone when too fine to make out).
          diffuseColor.rgb *= 0.94 + 0.12 * roadNoise(vRoadPos * 20000.0);
          ${top ? `float fw = fwidth(vRoadUv.y) / ${ASPHALT_DASH};
          float dash = (1.0 - smoothstep(0.05, 0.05 + fwidth(u) * 1.5, a)) * step(0.5, fract(vRoadUv.y / ${ASPHALT_DASH})) * (1.0 - smoothstep(0.25, 0.6, fw));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.82, 0.7), dash * 0.8);` : ''}
        } else {
          // (The edge ragged: eaten in by the ground, a little more here and there.)
          float rag = 0.12 + 0.2 * roadNoise(vRoadPos * 2600.0) + 0.08 * roadNoise(vRoadPos * 9000.0);
          if (a > 1.0 - rag) discard;
          if (kind < 0.5) {
            // A track: packed earth, as a farm's lanes (its colour from the
            // land it crosses: the vertex colour), the soil's grain at half
            // its contrast.
            vec4 t = texture(uGround, vec3(vec2(u * ${ROAD_HALF_WIDTH}, vRoadUv.y) / ${ROAD_TEX_REPEAT}, ${GROUND_LAYER.soil}.0));
            diffuseColor.rgb *= 1.0 + (2.0 * t.r - 1.0) * 0.5;
          } else {
            // (Paving: the soil scan laid along it, half its contrast.)
            vec4 t = texture(uGround, vec3(vec2(u * ${ROAD_HALF_WIDTH}, vRoadUv.y) / ${ROAD_TEX_REPEAT}, ${GROUND_LAYER[ROAD_GRAIN]}.0));
            diffuseColor.rgb *= mix(2.0 * t.r, 1.0, 0.5) * grain;
          }
        }`);
    // (Cut where a wonder digs into the ground, as the ground is.)
    holeFragment(shader, 'vRoadPos', false);
  };
  mat.customProgramCacheKey = () => `road-${top}`;
  return mat;
}
