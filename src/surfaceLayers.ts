// The surface textures (surfaces.ts): what each layer of the texture array
// is, shared by the bake (scripts/surfaceTextures.ts) and the game.
//
// A layer is a brightness pattern only (its mean 1): the models keep their
// own colours (a wall's paint, a tunic's team colour) and the texture
// shades them, as a PS1 game's textures did a palette: brick courses, roof
// tiles, thatch, planks, woven cloth, hammered metal. Most are scans
// (assets/surfaces, CC0, see CREDITS.md); hair, skin and the face are
// painted in the bake.

export const SURFACE_TEX = 128; // texels across a layer

export interface SurfaceLayer {
  readonly key: string;
  // A scan in assets/surfaces (`${key}.webp` and `${key}_normal.webp`), or painted in the bake.
  readonly scan: boolean;
  // How strongly its pattern shows (1: as scanned).
  readonly contrast: number;
  // How much its relief is lit from the upper left (the normal map), PS1-style baked light.
  readonly relief: number;
  // The size of one repeat, in metres (scans: as measured, where known).
  readonly metres: number;
}

const scan = <K extends string>(key: K, metres: number, contrast = 1, relief = 0.35) => ({ key, scan: true, contrast, relief, metres });
const painted = <K extends string>(key: K, metres: number) => ({ key, scan: false, contrast: 1, relief: 0, metres });

export const SURFACE_LAYERS = [
  painted('none', 1),
  // Buildings
  scan('plaster', 2.4, 1.5, 0.3),
  scan('brick', 2.4, 1.1),
  scan('fieldstone', 2.4, 1.1, 0.45),
  scan('ashlar', 2.4, 1, 0.4),
  scan('siding', 2, 1),
  scan('clayTile', 2.9, 1.1, 0.45),
  scan('slate', 2, 0.55, 0.2),
  scan('shingle', 2.9, 0.9),
  scan('thatch', 2, 1.5, 0.5),
  scan('corrugated', 2, 0.9, 0.5),
  scan('concrete', 3, 0.8, 0.2),
  scan('cobbles', 1.15, 1, 0.45),
  scan('marble', 2, 0.8, 0.1),
  scan('scales', 2, 0.6, 0.25),
  // Units
  scan('cloth', 0.35, 1.8, 0.4),
  scan('leather', 0.45, 1.5, 0.4),
  scan('metal', 0.4, 2.6, 0.3),
  scan('chainmail', 0.25, 1, 0.4),
  scan('wood', 0.6, 1.7, 0.25),
  scan('plates', 2, 1, 0.4),
  scan('planks', 2, 1),
  painted('hair', 0.25),
  painted('skin', 0.3),
  painted('face', 1),
] as const satisfies readonly SurfaceLayer[];

export type Surf = (typeof SURFACE_LAYERS)[number]['key'];
export const SURF: Record<Surf, number> = Object.fromEntries(SURFACE_LAYERS.map((l, i) => [l.key, i])) as Record<Surf, number>;
export const surfaceLayer = (s: Surf): SurfaceLayer => SURFACE_LAYERS[SURF[s]]!;

// The face's layer is drawn over the front of a head (people.ts: a figure
// 1 tall, its head about HEAD_Y 0.93): the layer's width spans x ±half, its
// height y from `bottom` to `top`.
export const FACE_BOX = { half: 0.07, bottom: 0.855, top: 0.995 } as const;
