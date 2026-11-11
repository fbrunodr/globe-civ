// What the map's billboards show (render.ts, billboards.ts), drawn on their
// atlas's canvas: a unit's flag, a city's banner, a resource's medallion, a
// tile's yields. The interface's own look (game.css): dark enamel, a brass
// rim, the pictograms of icons.ts.

import { drawIcon, type IconKey } from './icons.ts';

const BRASS = '#d9b56a', ENAMEL = 'rgba(14, 18, 26, 0.92)';
const HP = (f: number) => (f > 0.6 ? '#6fcf73' : f > 0.3 ? '#f2c14e' : '#ef6a5a');

// Whether text reads better dark or light on a colour.
function luminance(color: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return 0;
  const v = parseInt(m[1]!, 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
export const inkOn = (color: string): string => (luminance(color) > 0.62 ? '#151a24' : '#ffffff');

// A unit's flag (a 128 × 128 cell): a disc in its civ's colour (a civilian's:
// a rounded square), its kind's pictogram, its health under it; a brass rim
// when selected, a shield's notch of gold when fortified; an army's count.
export function drawUnitFlag(ctx: CanvasRenderingContext2D, color: string, glyph: IconKey, civilian: boolean, stack: number, hp: number, selected: boolean, fortified: boolean): void {
  const cx = 64, cy = 56, r = 40;
  const shape = (grow: number) => {
    ctx.beginPath();
    if (civilian) ctx.roundRect(cx - r - grow + 3, cy - r - grow + 3, 2 * (r + grow) - 6, 2 * (r + grow) - 6, 16 + grow);
    else ctx.arc(cx, cy, r + grow, 0, Math.PI * 2);
  };
  if (selected) {
    shape(13);
    ctx.fillStyle = 'rgba(255, 226, 150, 0.35)';
    ctx.fill();
    shape(8);
    ctx.fillStyle = '#ffe9ad';
    ctx.fill();
  }
  shape(4);
  ctx.fillStyle = fortified ? BRASS : 'rgba(10, 13, 20, 0.95)';
  ctx.fill();
  shape(0);
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, color);
  g.addColorStop(1, shade(color, 0.72));
  ctx.fillStyle = g;
  ctx.fill();
  // (A light from above.)
  ctx.save();
  shape(0);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.75, r * 1.1, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const ink = inkOn(color);
  drawIcon(ctx, glyph, cx + 1.5, cy + 2.5, 50, ink === '#ffffff' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.3)');
  drawIcon(ctx, glyph, cx, cy, 50, ink);
  // Health: a bar under the flag, only once hurt.
  if (hp < 100) {
    ctx.fillStyle = 'rgba(8, 10, 16, 0.9)';
    ctx.beginPath();
    ctx.roundRect(22, 106, 84, 13, 6);
    ctx.fill();
    ctx.fillStyle = HP(hp / 100);
    ctx.beginPath();
    ctx.roundRect(25, 109, 78 * Math.max(0.04, hp / 100), 7, 3.5);
    ctx.fill();
  }
  if (stack > 1) {
    ctx.beginPath();
    ctx.arc(104, 22, 19, 0, Math.PI * 2);
    ctx.fillStyle = ENAMEL;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = BRASS;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 25px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(stack), 104, 23.5);
  }
}

// A colour darkened (k < 1).
function shade(color: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const v = parseInt(m[1]!, 16);
  const c = (s: number) => Math.round(((v >> s) & 255) * k).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

export interface CityBanner {
  readonly name: string;
  readonly pop: number;
  readonly color: string;
  readonly capital: boolean;
  readonly hp: number;                 // 0..1
  readonly growth: number | null;      // 0..1 toward its next citizen (null: not shown, another civ's)
  readonly production: number | null;  // 0..1 of what it builds (null: nothing, or another civ's)
  readonly glyph: IconKey | null;      // what it builds
}

// A city's banner (a 512 × 112 cell): its size in a roundel, its name on its
// civ's colour (a star before a capital's), what it builds at the right;
// under the name two thin bars, growth and production (its owner's eyes
// only), and its health in red over them once it is hurt.
export function drawCityBanner(ctx: CanvasRenderingContext2D, b: CityBanner): void {
  ctx.font = '600 38px Cinzel, Georgia, serif';
  const label = b.name.toUpperCase();
  const star = b.capital ? 34 : 0, glyph = b.glyph ? 54 : 0;
  const textW = Math.min(330 - star, ctx.measureText(label).width);
  const w = 74 + star + textW + 26 + glyph, h = 64;
  const x = (512 - w) / 2, y = 14;
  const ink = inkOn(b.color);
  // The plate.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = 'rgba(8, 11, 17, 0.96)';
  ctx.beginPath();
  ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 36);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, b.color);
  g.addColorStop(1, shade(b.color, 0.7));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 32);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(x, y, w, h * 0.42);
  // Growth and production along the bottom.
  if (b.growth !== null) {
    ctx.fillStyle = 'rgba(8, 11, 17, 0.6)';
    ctx.fillRect(x, y + h - 12, w, 12);
    ctx.fillStyle = '#8fd47f';
    ctx.fillRect(x + 62, y + h - 11, (w - 62) * Math.min(1, Math.max(0, b.growth)), 5);
    ctx.fillStyle = '#e2a25a';
    ctx.fillRect(x + 62, y + h - 5, (w - 62) * Math.min(1, Math.max(0, b.production ?? 0)), 5);
  }
  ctx.restore();
  // Its size.
  ctx.beginPath();
  ctx.arc(x + 32, y + h / 2, 30, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 13, 20, 0.96)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = BRASS;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '700 34px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(b.pop), x + 32, y + h / 2 + 2);
  // Its name.
  let tx = x + 74;
  const ty = y + h / 2 - (b.growth !== null ? 4 : 0);
  if (b.capital) { drawIcon(ctx, 'star', tx + 13, ty, 28, ink); tx += star; }
  ctx.font = '600 38px Cinzel, Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = ink === '#ffffff' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.35)';
  ctx.fillText(label, tx + 1.5, ty + 4.5, textW);
  ctx.fillStyle = ink;
  ctx.fillText(label, tx, ty + 2.5, textW);
  if (b.glyph) {
    const gx = x + w - 34;
    ctx.beginPath();
    ctx.arc(gx, ty, 21, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 13, 20, 0.85)';
    ctx.fill();
    drawIcon(ctx, b.glyph, gx, ty, 26, '#f0d9a0');
  }
  // Its health, once hurt.
  if (b.hp < 1) {
    ctx.fillStyle = 'rgba(8, 10, 16, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x + 40, y + h + 8, w - 80, 14, 7);
    ctx.fill();
    ctx.fillStyle = HP(b.hp);
    ctx.beginPath();
    ctx.roundRect(x + 43, y + h + 11, (w - 86) * Math.max(0.03, b.hp), 8, 4);
    ctx.fill();
  }
}

// A resource's medallion (a 96 × 96 cell): its pictogram on dark enamel, a
// rim of its kind's colour (bonus, luxury, strategic).
export function drawResourceIcon(ctx: CanvasRenderingContext2D, glyph: IconKey, color: string): void {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(48, 46, 36, 0, Math.PI * 2);
  ctx.fillStyle = ENAMEL;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  drawIcon(ctx, glyph, 48, 46, 44, '#f4efe2');
}

// A tile's yields (a 192 × 64 cell): each kind's pictogram in its colour,
// as many as it yields (past three: one, with the figure).
export const YIELD_COLOR = { food: '#8fd47f', prod: '#e2a25a', gold: '#f0cc5a', science: '#7fb6ee', culture: '#c79be8', faith: '#e9e2c0', cohesion: '#6cc9bb' } as const;
export function drawTileYields(ctx: CanvasRenderingContext2D, yields: readonly (readonly [keyof typeof YIELD_COLOR, number])[]): void {
  const S = 26, items: { k: keyof typeof YIELD_COLOR; n: number; w: number }[] = [];
  for (const [k, v] of yields) if (v > 0) items.push({ k, n: v, w: v <= 3 ? S + (v - 1) * 13 : S + 20 });
  if (!items.length) return;
  const gap = 8, total = items.reduce((a, i) => a + i.w, 0) + gap * (items.length - 1);
  const w = Math.min(188, total + 20), x0 = (192 - w) / 2;
  ctx.fillStyle = 'rgba(10, 13, 20, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x0, 14, w, 36, 18);
  ctx.fill();
  let x = x0 + 10;
  const k = Math.min(1, (w - 20) / total);
  for (const it of items) {
    const c = YIELD_COLOR[it.k];
    if (it.n <= 3) for (let i = 0; i < it.n; i++) drawIcon(ctx, it.k, x + (S / 2 + i * 13) * k, 32, S * k, c);
    else {
      drawIcon(ctx, it.k, x + (S / 2) * k, 32, S * k, c);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(22 * k)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(it.n), x + (S + 2) * k, 33.5);
    }
    x += (it.w + gap) * k;
  }
}
