// The units' pixel sheet: one painted texture, drawn here pixel by pixel
// (no image file), sampled unfiltered close up, as the PS1 dressed its
// models: faces (each civ its own eight: four men, four women), a tunic's
// body (cloth, a modern uniform, mail, plate), its skirt (undyed cloth in
// folds with a hem in the owner's colour; under mail or plate, the owner's
// colour), the shields' devices.
//
// A pixel's alpha says whether the owner's colour (or the figure's skin
// tone) tints it: 255 tinted (the pixel a shade of it), 0 its own colour
// (an eye's white, a belt's leather, undyed cloth, steel, a device's pale
// paint); the units' shader: unitView.ts makeUnitMaterial.
//
// Texture coordinates: a pixel (x, y) is at (x / SHEET, y / SHEET): row 0
// is v = 0 (the data's first row).

import * as THREE from 'three';
import { ARCH_CIVS, type ArchCiv } from './architecture.ts';

export const SHEET = 1024;
// The models' key for it (a geometry's userData.texture: unitView.ts textureOf).
export const UNIT_SHEET = 'sheet:units';
// A region: its corner and size, pixels.
export type Rect = readonly [x: number, y: number, w: number, h: number];
// The faces: 64 pixels square; a civ's eight side by side (four men, then
// four women), two civs a row. A model's face is its civ's first of its
// sex; each figure's own is so many faces along (FACE_VARIANTS: the units'
// shader moves it, unitView.ts).
export const FACE = 64, FACE_VARIANTS = 4, FACES_END = Math.ceil(ARCH_CIVS.length / 2) * FACE;
const faceRect = (civ: ArchCiv, woman: boolean, variant = 0): Rect => {
  const c = ARCH_CIVS.indexOf(civ);
  return [(c % 2) * 8 * FACE + ((woman ? FACE_VARIANTS : 0) + variant) * FACE, Math.floor(c / 2) * FACE, FACE, FACE];
};
const Y0 = FACES_END;
export const REGION = {
  torso: [0, Y0, 64, 48], uniform: [64, Y0, 64, 48], mail: [128, Y0, 64, 48], plate: [192, Y0, 64, 48],
  skirt: [0, Y0 + 64, 64, 40], mailSkirt: [64, Y0 + 64, 64, 40], plateSkirt: [128, Y0 + 64, 64, 40],
  round: [320, Y0, 48, 48], tall: [368, Y0, 32, 56], kite: [400, Y0, 32, 56],
} as const satisfies Record<string, Rect>;
export type Region = keyof typeof REGION;
// What a body wears over its tunic, and the sheet's regions for it (the tunic's body, its skirt).
export type Armor = 'mail' | 'plate';
export const ARMOR_STEEL: Record<Armor, number> = { mail: 0x8a8e94, plate: 0xa6abb2 };

// What the face is drawn over, model units: the head's width (half) and
// its chin and crown (people.ts FINE_HEAD, its jaw tilted down in front).
export const FACE_HALF = 0.068, FACE_TOP = 0.99, FACE_BOTTOM = 0.86;
// The tunic's body, top to bottom (people.ts: the torso's rings).
export const TORSO_TOP = 0.857, TORSO_BOTTOM = 0.46;
// Undyed cloth: the skirt's and sleeves' (the sheet's and the models' alike).
export const LINEN = 0xcfc09c;
// The shade of the owner's colour that cloth is (people.ts CLOTH_PAINT, as a share of white).
const CLOTH = 0xa4 / 0xff;
const LEATHER = 0x5a3d26, PALE = 0xe8dcc0;
// Cloth round the body (mapRound): its seam down a corner at the back (the
// bodies' rings are eight-sided, flat in front: a corner an eighth of a
// turn each side of the back's middle), so no face lies across it; the
// front then this far across the region.
const ROUND_TURN = Math.PI / 8, ROUND_FRONT = 0.5 + ROUND_TURN / (2 * Math.PI);

// How a civ's faces are drawn: the eyes' shape, the irises its people have
// (a face takes one), how dark the brows; and what its people put on them.
interface FaceLook {
  readonly eyes: 'round' | 'almond' | 'narrow';
  readonly iris: readonly [number, number, number, number];
  readonly brow: number;      // (how dark, as a share of the skin's tone)
  readonly ruddy?: boolean;   // (cheeks flushed: the north's fair skins)
  readonly kohl?: boolean;    // (the eyes lined dark, the line drawn out past the corner)
  readonly paint?: number;    // (a band of war paint across the cheeks, on some)
  readonly bindi?: boolean;   // (a mark between a woman's brows)
  readonly beards?: boolean;  // (men's cheeks and chins shadowed dark on most, a moustache on the rest)
}
const DARK_EYES = [0x3a2618, 0x4a3220, 0x2e1e14, 0x402a1a] as const, FAIR_EYES = [0x4a6a8a, 0x5a3c26, 0x5a7a52, 0x6a7a80] as const, MIXED_EYES = [0x4a3220, 0x5a4a2e, 0x3a2618, 0x5a6a52] as const;
const NORTH: FaceLook = { eyes: 'round', iris: FAIR_EYES, brow: 0.55, ruddy: true };
const SOUTH: FaceLook = { eyes: 'round', iris: MIXED_EYES, brow: 0.42 };
const WEST: FaceLook = { eyes: 'almond', iris: DARK_EYES, brow: 0.36 };
const EAST: FaceLook = { eyes: 'narrow', iris: DARK_EYES, brow: 0.4 };
const FACES: Record<ArchCiv, FaceLook> = {
  Romans: SOUTH, Greeks: { ...SOUTH, beards: true }, Spanish: { ...SOUTH, brow: 0.38 },
  Egyptians: { ...WEST, kohl: true }, Babylonians: { ...WEST, beards: true, kohl: true }, Persians: { ...WEST, beards: true }, Hebrews: { ...WEST, beards: true },
  Indians: { ...WEST, bindi: true }, Ethiopians: { eyes: 'almond', iris: DARK_EYES, brow: 0.5 },
  Chinese: EAST, Japanese: { ...EAST, brow: 0.36 }, Mongols: { ...EAST, ruddy: true },
  Aztecs: { eyes: 'almond', iris: DARK_EYES, brow: 0.4, paint: 0x9a2a22 },
  English: NORTH, French: { ...NORTH, iris: MIXED_EYES, brow: 0.48 }, Germans: NORTH, Russians: { ...NORTH, beards: true }, Vikings: { ...NORTH, brow: 0.62, beards: true },
};

type RGB = readonly [number, number, number];
const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
// (A steady hash of a pixel, 0..1: the weave.)
const noise = (x: number, y: number): number => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

let made: Uint8Array | null = null;
// The sheet's pixels: RGBA, SHEET by SHEET, rows from v = 0.
export function unitSheet(): Uint8Array {
  if (made) return made;
  const d = new Uint8Array(SHEET * SHEET * 4).fill(255);
  // (In a region: a pixel set to a colour of its own (alpha 0) or a tinted shade (alpha 255); one darkened.)
  const pen = (r: Rect) => {
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= r[2] || y >= r[3] ? -1 : ((r[1] + y) * SHEET + r[0] + x) * 4);
    const put = (x: number, y: number, c: RGB, a: number) => { const i = at(x, y); if (i >= 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; } };
    return {
      own: (x: number, y: number, hex: number, k = 1) => { const c = rgb(hex); put(x, y, [c[0] * k, c[1] * k, c[2] * k], 0); },
      tint: (x: number, y: number, shade: number) => put(x, y, [shade * 255, shade * 255, shade * 255], 255),
      tinted: (x: number, y: number, c: RGB) => put(x, y, [c[0] * 255, c[1] * 255, c[2] * 255], 255),
      dim: (x: number, y: number, k: number) => { const i = at(x, y); if (i >= 0) for (let c = 0; c < 3; c++) d[i + c] = d[i + c]! * k; },
    };
  };
  type Pen = ReturnType<typeof pen>;

  // ---- the faces ----
  // (Rows: the brow at 25, the eyes at 31, the nose's base at 42, the mouth at 48, the chin at 58.)
  // A man's: a heavy level brow low over smaller eyes, a wide flat mouth,
  // the jaw shadowed; a woman's: thin arched brows well above large lashed
  // eyes, full coloured lips, a clear jaw. `v`: which of the four.
  const face = (p: Pen, look: FaceLook, woman: boolean, v: number) => {
    const old = v === 3, browK = look.brow * (woman ? 1.15 : 0.9), brow: RGB = [browK, browK * 0.8, browK * 0.68];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if (Math.abs(x - 31.5) > 22) p.dim(x, y, 0.93);
      if (y >= 59) p.dim(x, y, 0.88);
    }
    for (const ex of [20, 43]) {
      const out = ex < 32 ? -1 : 1; // (the outer corner's side)
      // (The socket.)
      for (let x = ex - 5; x <= ex + 5; x++) { p.dim(x, 29, woman ? 0.94 : 0.84); if (!woman) p.dim(x, 28, 0.9); p.dim(x, 34, 0.92); }
      // (The brow.)
      for (let x = ex - 5; x <= ex + 5; x++) {
        if (woman) {
          const arch = Math.round(Math.abs(x - ex - out) * 0.35);
          p.tinted(x, 23 + arch, brow);
          if (Math.abs(x - ex) < 2) p.tinted(x, 24 + arch, brow);
        } else {
          const drop = v === 1 && (x - ex) * out < -2 ? 1 : 0; // (knitted: lower towards the nose)
          for (let y = 25; y <= (v === 1 ? 27 : 26); y++) p.tinted(x, y + drop, brow);
          if (Math.abs(x - ex) < 4) p.tinted(x, 27 + drop, brow);
        }
      }
      // (The eye: its lash line, the white, the iris and its pupil, the lower lid. A woman's a row taller.)
      const iris = look.iris[v % 4]!, narrow = look.eyes === 'narrow', top = woman ? 29 : 30, w = woman || look.eyes === 'almond' ? 5 : 4;
      const tilt = (x: number) => (narrow || look.eyes === 'almond') && (x - ex) * out >= 3 ? -1 : 0; // (the outer corner turned up)
      for (let x = ex - w; x <= ex + w; x++) { p.own(x, top + tilt(x), 0x241a16); if (woman || look.kohl) p.own(x, top + 1 + tilt(x), 0x241a16); }
      const y0 = top + (woman || look.kohl ? 2 : 1), y1 = narrow ? y0 : y0 + 1;
      for (let y = y0; y <= y1; y++) for (let x = ex - w + 1; x <= ex + w - 1; x++) p.own(x, y, Math.abs(x - ex) >= w - 1 ? 0xcfc4b4 : 0xece6da);
      for (let y = y0; y <= y1; y++) for (let x = ex - 1; x <= ex + 1; x++) p.own(x, y, iris);
      p.own(ex, y0, 0x18100c); if (!narrow) p.own(ex, y1, 0x18100c);
      for (let x = ex - w + 1; x <= ex + w - 1; x++) p.tinted(x, y1 + 1, look.kohl ? [0.3, 0.24, 0.22] : [0.72, 0.62, 0.58]);
      // (Lashes swept out from a woman's outer corner; kohl's line drawn out past it.)
      if (woman) { p.own(ex + out * (w + 1), top - 1, 0x241a16); p.own(ex + out * (w + 1), top, 0x241a16); if (v === 1) p.own(ex + out * (w + 2), top - 2, 0x241a16); }
      if (look.kohl) for (let k = 1; k <= 4; k++) p.own(ex + out * (w + k), top + 1, 0x241a16);
      if (narrow) for (let x = ex - w; x <= ex + w; x++) p.dim(x, top - 1, 0.88); // (the lid's fold)
      // (Flushed cheeks; a woman's, and the north's; freckles on one.)
      if (woman || look.ruddy) for (let y = 37; y <= 40; y++) for (let x = ex - 3; x <= ex + 3; x++) if (Math.abs(x - ex) + Math.abs(y - 38.5) < 4.5) p.tinted(x, y, look.ruddy ? [1, 0.84, 0.82] : [1, 0.9, 0.88]);
      if (woman && v === 2) for (const [fx, fy] of [[-3, 36], [0, 35], [3, 36], [-1, 38], [2, 39]] as const) p.dim(ex + fx, fy, 0.8);
      // (Age: lines out from the eyes' corners, under them.)
      if (old) { p.dim(ex + out * (w + 2), 33, 0.78); p.dim(ex + out * (w + 3), 34, 0.78); for (let x = ex - 3; x <= ex + 2; x++) p.dim(x, 36, 0.86); }
    }
    if (old) for (let x = 22; x <= 41; x++) { if (x % 7 !== 0) p.dim(x, 19, 0.85); if (x % 5 !== 0 && !woman) p.dim(x, 16, 0.88); }
    if (look.bindi && woman) for (const [x, y] of [[31, 21], [32, 21], [31, 22], [32, 22]] as const) p.own(x, y, 0xa82a22);
    // (War paint: a band across the cheeks and the nose's bridge.)
    if (look.paint !== undefined && (v === 1 || v === 2)) for (let y = 35; y <= (v === 1 ? 38 : 36); y++) for (let x = 6; x <= 57; x++) p.own(x, y, look.paint);
    // (Beside the nose (itself a solid: untextured) and under it.)
    for (let y = 36; y <= 41; y++) { p.dim(27, y, 0.92); p.dim(36, y, 0.92); }
    for (let x = 28; x <= 35; x++) p.dim(x, 43, 0.82);
    p.dim(29, 42, 0.6); p.dim(34, 42, 0.6);
    if (old) for (let y = 43; y <= 50; y++) { p.dim(24 - Math.round((y - 43) * 0.4), y, 0.82); p.dim(39 + Math.round((y - 43) * 0.4), y, 0.82); }
    // (The mouth: the line between the lips, the lips, the shadow under them.)
    if (woman) {
      const lip: RGB = v === 1 ? [0.78, 0.36, 0.38] : old ? [0.84, 0.58, 0.56] : [0.82, 0.45, 0.46], line: RGB = [0.5, 0.22, 0.24];
      for (let x = 28; x <= 35; x++) p.tinted(x, 46, lip);
      for (let x = 27; x <= 36; x++) p.tinted(x, 47, lip);
      p.dim(31, 46, 0.9); p.dim(32, 46, 0.9);
      for (let x = 26; x <= 37; x++) p.tinted(x, 48, line);
      for (let x = 27; x <= 36; x++) p.tinted(x, 49, lip);
      for (let x = 28; x <= 35; x++) p.tinted(x, 50, lip);
      for (let x = 29; x <= 34; x++) p.dim(x, 52, 0.9);
    } else {
      for (let x = 25; x <= 38; x++) p.tinted(x, 48, [0.48, 0.32, 0.29]);
      for (let x = 27; x <= 36; x++) p.tinted(x, 49, [0.84, 0.68, 0.64]);
      for (let x = 28; x <= 35; x++) p.dim(x, 51, 0.84);
      // (The jaw: shadowed along its line and under the cheekbones; stubble, a moustache or a beard's shadow on some.)
      for (let y = 40; y <= 58; y++) for (let x = 0; x < 64; x++) if (Math.abs(x - 31.5) > 17 + (58 - y) * 0.25) p.dim(x, y, 0.9);
      const hair = look.beards ? (v === 0 ? 'stubble' : v === 2 ? 'moustache' : 'beard') : v === 1 ? 'stubble' : v === 2 ? 'moustache' : 'none';
      if (hair === 'stubble' || hair === 'beard') for (let y = 44; y <= 63; y++) for (let x = 6; x <= 57; x++) {
        const jaw = Math.abs(x - 31.5) > 9 || y > 52 || (y <= 47 && Math.abs(x - 31.5) > 2);
        if (jaw && (y > 46 || Math.abs(x - 31.5) > 12)) p.dim(x, y, hair === 'beard' ? 0.5 + 0.12 * noise(x, y) : (x + y) % 2 ? 0.8 : 0.9);
      }
      if (hair === 'moustache' || hair === 'beard') for (let x = 24; x <= 39; x++) for (const y of [45, 46, 47]) if (y > 45 || Math.abs(x - 31.5) < 6) p.dim(x, y, 0.5);
      if (hair === 'moustache') { p.dim(23, 48, 0.55); p.dim(40, 48, 0.55); p.dim(23, 49, 0.6); p.dim(40, 49, 0.6); }
    }
    // (A scar down one cheek, on an old soldier.)
    if (old && !woman) for (let y = 33; y <= 44; y++) p.tinted(47 + (y > 38 ? 1 : 0), y, [0.86, 0.66, 0.62]);
  };
  for (const civ of ARCH_CIVS) for (const woman of [false, true]) for (let v = 0; v < FACE_VARIANTS; v++) face(pen(faceRect(civ, woman, v)), FACES[civ], woman, v);

  // ---- the tunic's body ----
  // (Round the body: the front at x = F, the sides a quarter round from it, the seam at the back (mapRound).)
  const F = ROUND_FRONT * 64, rowOf = (y: number) => Math.round((TORSO_TOP - y) / (TORSO_TOP - TORSO_BOTTOM) * 48);
  const b0 = rowOf(0.662), b1 = rowOf(0.628);
  // (A belt: its edges darker, stitched; a buckle in front.)
  const belt = (p: Pen, color: number, buckle: number) => {
    for (let y = b0; y <= b1; y++) for (let x = 0; x < 64; x++) p.own(x, y, color, y === b0 || y === b1 ? 0.7 : x % 4 === 1 && y === b0 + 2 ? 1.3 : 1);
    for (let y = b0; y <= b1; y++) for (let x = F - 2; x <= F + 2; x++) p.own(x, y, y === b0 || y === b1 || x === F - 2 || x === F + 2 ? buckle : 0x2a1c12);
  };
  const cloth = (p: Pen, h: number) => { for (let y = 0; y < h; y++) for (let x = 0; x < 64; x++) p.tint(x, y, CLOTH * (0.9 + 0.1 * noise(x, y))); };
  {
    const p = pen(REGION.torso);
    cloth(p, 48);
    // (The seams under the arms, a fold under the chest.)
    for (let y = 8; y < 46; y++) { p.dim(F - 16, y, 0.84); p.dim(F + 16, y, 0.84); }
    for (let x = 0; x < 64; x++) p.dim(x, rowOf(0.7), 0.92);
    // (The neckline: an undershirt in a V, its edge stitched dark; the lacing below it.)
    for (let y = 0; y <= 9; y++) {
      const w = Math.round((9 - y) * 0.6);
      for (let x = F - w; x <= F - 1 + w; x++) p.own(x, y, LINEN);
      p.tint(F - 1 - w, y, CLOTH * 0.55); p.tint(F + w, y, CLOTH * 0.55);
    }
    for (let y = 11; y <= 17; y += 2) { p.tint(F - 1, y, CLOTH * 0.5); p.tint(F, y, CLOTH * 0.5); }
    belt(p, LEATHER, 0xc2b68e);
    // (A jerkin's hem, where no skirt hides it.)
    for (let x = 0; x < 64; x++) { p.dim(x, 45, 0.72); p.dim(x, 46, 0.86); }
  }
  {
    // (A modern uniform: a collar, a row of buttons, breast pockets, a webbing belt.)
    const p = pen(REGION.uniform);
    cloth(p, 48);
    for (let y = 8; y < 46; y++) { p.dim(F - 16, y, 0.86); p.dim(F + 16, y, 0.86); }
    for (let y = 0; y <= 3; y++) for (let x = 0; x < 64; x++) p.dim(x, y, y === 3 ? 0.6 : 0.8);
    for (let y = 4; y < 46; y++) p.dim(F, y, 0.8);
    for (let y = 6; y < b0; y += 5) p.own(F - 1, y, 0xb8a468);
    for (const px of [F - 12, F + 5]) for (let y = 11; y <= 18; y++) for (let x = px; x <= px + 6; x++) if (y === 11 || y === 18 || x === px || x === px + 6 || y === 13) p.dim(x, y, 0.72);
    belt(p, 0x6e6a4e, 0x8a8468);
    for (let x = 0; x < 64; x++) { p.dim(x, 45, 0.72); p.dim(x, 46, 0.86); }
  }
  // (Mail: rings in rows, each row's set off half a ring from the last.)
  const rings = (p: Pen, x: number, y: number, k = 1) => p.own(x, y, ARMOR_STEEL.mail, k * ((x + (y >> 1)) % 2 ? (y % 2 ? 0.74 : 0.9) : y % 2 ? 1.08 : 1.2));
  {
    // (A mail shirt: a padded collar, a baldric across the chest, a belt.)
    const p = pen(REGION.mail);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) rings(p, x, y, Math.abs(x - F) > 14 && Math.abs(x - F) < 18 ? 0.86 : 1);
    for (let y = 0; y <= 2; y++) for (let x = 0; x < 64; x++) p.own(x, y, LINEN, y === 2 ? 0.7 : 1);
    for (let y = 3; y < b0; y++) { const x = Math.round(F - 11 + (y - 3) * 1.05); for (let k = 0; k < 3; k++) p.own(x + k, y, LEATHER, k === 1 ? 1.15 : 0.85); }
    belt(p, LEATHER, 0xc2b68e);
    for (let x = 0; x < 64; x++) if (x % 4 < 2) { p.dim(x, 46, 0.5); p.dim(x, 47, 0.5); }
  }
  // (Plate: steel, lit down one side of the middle; lines where plates meet; rivets.)
  const steel = (p: Pen, x: number, y: number, k = 1) => p.own(x, y, ARMOR_STEEL.plate, k * (1 + 0.04 * noise(x, y)));
  {
    // (A cuirass: a gorget, the breastplate ridged down its middle and lit beside it, straps at the sides, the fauld's lames below the waist.)
    const p = pen(REGION.plate);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
      const dx = x - F, lit = dx >= -8 && dx <= -5 && y > 5 && y < b0 - 1 ? 1.16 : dx >= 4 && dx <= 10 && y > 5 && y < b0 ? 0.9 : 1;
      steel(p, x, y, lit);
    }
    for (let y = 4; y < b0; y++) { p.dim(F, y, 0.62); p.dim(F - 1, y, 1); }
    for (let x = 0; x < 64; x++) { p.dim(x, 4, 0.58); p.dim(x, 3, 0.85); if (x % 6 === 2) p.own(x, 2, 0xd8dce0); }
    // (The breastplate's lower edge: curved down to the middle in front.)
    for (let x = 0; x < 64; x++) { const y = b0 - 1 - Math.round(Math.max(0, 1 - Math.abs(x - F) / 14) * -2); p.dim(x, y, 0.6); }
    for (const sx of [F - 16, F + 16]) for (let y = 8; y < b0; y++) { p.dim(sx, y, 0.6); if (y % 6 === 2) { p.own(sx - 1, y, LEATHER); p.own(sx + 1, y, LEATHER); p.own(sx, y, 0xd8dce0); } }
    for (let y = b0; y < 48; y++) for (let x = 0; x < 64; x++) { if ((y - b0) % 5 === 4) p.dim(x, y, 0.58); else if ((y - b0) % 5 === 0) p.dim(x, y, 1.1); if ((y - b0) % 5 === 2 && x % 8 === 3) p.own(x, y, 0xd8dce0); }
  }

  // ---- the skirt ----
  // (Waist at the top row, hem at the bottom.)
  const HEM = 32;
  // (The hem: the owner's colour, darker along its edges, chequered between.)
  const hem = (p: Pen) => { for (let y = HEM; y < 40; y++) for (let x = 0; x < 64; x++) p.tint(x, y, y === HEM || y >= 38 ? 0.43 : (x + (y >> 1) * 2) % 4 < 2 && y > HEM + 1 && y < 37 ? 0.52 : CLOTH); };
  // (Folds: every few pixels round, deeper towards the hem; a lit edge beside each.)
  const folds = (p: Pen, from: number) => {
    for (let x = 0; x < 64; x++) {
      if (x % 5 !== (x > 31 ? 3 : 1)) continue;
      for (let y = from; y < HEM - 1; y++) { p.dim(x, y, y < from + 9 ? 0.9 : 0.8); if (y > from + 7) p.dim(x + 1, y, 0.92); }
    }
  };
  {
    // (Undyed cloth in folds, a stitched line, the hem in the owner's colour.)
    const p = pen(REGION.skirt);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) p.own(x, y, LINEN, 0.92 + 0.08 * noise(x + 70, y));
    folds(p, 3);
    for (let x = 0; x < 64; x += 2) p.dim(x, HEM - 2, 0.6);
    hem(p);
    for (let x = 0; x < 64; x++) p.dim(x, 0, 0.8);
  }
  for (const armor of ['mail', 'plate'] as const) {
    // (Under armour: the tunic's skirt in the owner's colour; over its top the mail's dagged edge, or the tassets' lames.)
    const p = pen(REGION[armor === 'mail' ? 'mailSkirt' : 'plateSkirt']);
    cloth(p, 40);
    folds(p, 10);
    hem(p);
    for (let x = 0; x < 64; x++) {
      const end = armor === 'mail' ? 15 + (x % 6 < 3 ? x % 3 : 2 - (x % 3)) : Math.abs(x - F) < 2 ? 4 : 13 - (Math.abs(x - F) % 16 < 2 ? 2 : 0);
      for (let y = 0; y <= end; y++) {
        if (armor === 'mail') rings(p, x, y);
        else { steel(p, x, y, y % 5 === 4 || y === end ? 0.58 : y % 5 === 0 ? 1.1 : 1); if (y % 5 === 2 && x % 8 === 3) p.own(x, y, 0xd8dce0); }
      }
      p.dim(x, end + 1, 0.6);
    }
  }

  // ---- the shields' devices ----
  // (The face the owner's colour; the device pale, its own; an edge a darker shade.)
  {
    // (Round: a pale ring, eight rays out from it, the middle darker round the boss.)
    const p = pen(REGION.round), c = 23.5;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const spoke = Math.abs(((a / (Math.PI / 4)) % 1 + 1.5) % 1 - 0.5) * r; // (how far off the nearest ray, pixels)
      if (r > 21.5) p.tint(x, y, 0.5);
      else if (r >= 12 && r <= 14.5) p.own(x, y, PALE);
      else if (r > 14.5 && r <= 20 && spoke < 1.4) p.own(x, y, PALE);
      else if (r < 8) p.tint(x, y, 0.66);
      else if (r < 9) p.tint(x, y, 0.5);
    }
  }
  {
    // (Tall (a scutum, a pavise): a pale border, a lozenge at the middle, a bar above and below.)
    const p = pen(REGION.tall);
    for (let y = 0; y < 56; y++) for (let x = 0; x < 32; x++) {
      const edge = Math.min(x, y, 31 - x, 55 - y), lz = Math.abs(x - 15.5) / 9 + Math.abs(y - 27.5) / 13;
      if (edge < 1) p.tint(x, y, 0.5);
      else if (edge >= 2 && edge < 4) p.own(x, y, PALE);
      else if (lz <= 1 && lz > 0.72) p.own(x, y, PALE);
      else if (lz <= 0.72) p.tint(x, y, 0.7);
      else if ((y === 9 || y === 10 || y === 45 || y === 46) && x > 7 && x < 24) p.own(x, y, PALE);
    }
  }
  {
    // (A kite: a pale cross, its bar a third of the way down.)
    const p = pen(REGION.kite);
    for (let y = 0; y < 56; y++) for (let x = 0; x < 32; x++) {
      if (Math.abs(x - 15.5) < 2.5 || (y >= 13 && y <= 17)) p.own(x, y, PALE);
      else if (y < 2) p.tint(x, y, 0.55);
    }
  }
  return made = d;
}

// ---- texture coordinates ----
// Texture coordinates for a geometry's triangles (unindexed: three corners
// each): `of` gives each triangle's three, or null to leave it untextured (-1).
export function mapTriangles(g: THREE.BufferGeometry, of: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => readonly (readonly [number, number])[] | null): THREE.BufferGeometry {
  const pos = g.getAttribute('position'), uv = new Float32Array(pos.count * 2).fill(-1);
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    for (let k = 0; k < 3; k++) v[k as 0 | 1 | 2].fromBufferAttribute(pos, t + k);
    const m = of(v[0], v[1], v[2]);
    if (m) m.forEach(([x, y], k) => { uv[(t + k) * 2] = x; uv[(t + k) * 2 + 1] = y; });
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.userData['texture'] = UNIT_SHEET;
  return g;
}
// (A place in a region (0..1 across and down, kept half a pixel inside it) as texture coordinates.)
const inRegion = (r: Rect, u: number, v: number): readonly [number, number] =>
  [(r[0] + 0.5 + Math.min(1, Math.max(0, u)) * (r[2] - 1)) / SHEET, (r[1] + 0.5 + Math.min(1, Math.max(0, v)) * (r[3] - 1)) / SHEET];

// A head's face: seen from in front (x across, y down), on the triangles of
// its front half; its civ's first of its sex (each figure's own: FACE_VARIANTS).
export function mapFace(g: THREE.BufferGeometry, civ: ArchCiv, woman: boolean): THREE.BufferGeometry {
  const r = faceRect(civ, woman);
  return mapTriangles(g, (a, b, c) => ((a.z + b.z + c.z) / 3 < 0.03 ? null
    : [a, b, c].map((p) => inRegion(r, 0.5 + p.x / (2 * FACE_HALF), (FACE_TOP - p.y) / (FACE_TOP - FACE_BOTTOM)))));
}
// Cloth round the body (its axis upright through x = z = 0): round it
// across the region (the front at its middle), `down` (0..1 by height) down it.
export function mapRound(g: THREE.BufferGeometry, region: Region, down: (y: number) => number): THREE.BufferGeometry {
  const r = REGION[region];
  return mapTriangles(g, (a, b, c) => {
    const ang = [a, b, c].map((p) => (p.x * p.x + p.z * p.z < 1e-10 ? null : Math.atan2(p.x, p.z) + ROUND_TURN));
    const ref = ang.find((x) => x !== null) ?? 0;
    // (A triangle at the seam: all its corners on one side of it.)
    const un = ang.map((x) => (x === null ? null : x - ref > Math.PI ? x - 2 * Math.PI : x - ref < -Math.PI ? x + 2 * Math.PI : x));
    const known = un.filter((x): x is number => x !== null), mean = known.reduce((s, x) => s + x, 0) / Math.max(1, known.length);
    const shift = mean > Math.PI ? -2 * Math.PI : mean < -Math.PI ? 2 * Math.PI : 0;
    return [a, b, c].map((p, k) => inRegion(r, ((un[k] ?? mean) + shift) / (2 * Math.PI) + 0.5, down(p.y)));
  });
}
// A shield's face: its own outline (x across, y down) across the region.
export function mapFlat(g: THREE.BufferGeometry, region: Region): THREE.BufferGeometry {
  const r = REGION[region];
  g.computeBoundingBox();
  const bb = g.boundingBox!, w = Math.max(1e-6, bb.max.x - bb.min.x), h = Math.max(1e-6, bb.max.y - bb.min.y);
  return mapTriangles(g, (a, b, c) => [a, b, c].map((p) => inRegion(r, (p.x - bb.min.x) / w, (bb.max.y - p.y) / h)));
}
