// Where everything stands on an improved land tile: its homestead (a house
// of one to three floors as its owner's techs take it on, a barn), its
// yards' harvest, a pasture's herd inside its fences, a farm's crops and a
// plantation's plants as tufts on its plots (rural/plots.ts, the plots the
// ground is painted with), and the stage's people, machines and works
// (rural/stages.ts), each well clear of the house and of one another.
// Pure 2D in the tile's canonical hex (tile steps), deterministic: the game
// (cityProps.ts) and the gallery place the same things. A mine's adits are
// the game's (they follow the slope), kept clear here (`keep`).

import type { ImprovementKey } from '../cities.ts';
import type { ResourceKey } from '../resources.ts';
import { STAGE_TECHS } from '../techs.ts';
import { CREATURE_SCALE } from '../creatures.ts';
import { mulberry32 } from '../rng.ts';
import { SAFE_RHO, rhoOf, pointInPoly, type Pt, type Floors } from '../town/geometry.ts';
import { paintFarm, WORK_OF, type Farm } from '../farmPainter.ts';
import { CROP_HEIGHT, CROP_PALETTE, CROP_STAND_SATURATION, PLOT_SIZES, MAX_STAGE, PLANT_ROW_W, cropIndex, plotAt } from './plots.ts';
import { SCATTER_GAP, scatterIn, type AreaLook, type CropRegion, type Fill } from './look.ts';
import { stageLook, plotStage, pastureFences, herdSize } from './stages.ts';
import { kitBoost, FIGURES, FENCE_BOOST } from './kit.ts';
import { ruralGeometry, ruralModelKind, roamOf, type RuralModel } from './models.ts';

export interface RuralItem {
  readonly model: RuralModel;
  readonly p: Pt;
  readonly heading: number;                          // where its +x faces (radians, the hex's frame)
  readonly size: readonly [number, number, number];  // its scale: tile steps to a model unit
  readonly leaf: number;                             // its leaf parts' colour
  readonly shade: number;                            // its colour's shade
}
export interface RuralSite {
  readonly free: (p: Pt) => boolean;  // open ground: off the roads, the city, a wonder's lot
  readonly depth: (p: Pt) => number;  // the water over the ground (tile steps; ≤ 0 dry)
  readonly wade: number;              // how deep a paddy's farmers may stand in it (tile steps)
  readonly ours: (p: Pt) => boolean;  // the land painted as this tile's (its fields fill it)
}
export interface RuralInput {
  readonly imp: ImprovementKey;
  readonly stage: number;
  readonly res: ResourceKey | null;    // its resource, if worked for it
  readonly region: CropRegion;
  readonly axis: number;               // farmPainter.farmAxis
  readonly salt: number;               // the plots' (the tile)
  readonly seed: number;
  readonly yard: (i: number) => AreaLook;
}
export interface RuralPlan {
  readonly house: { readonly p: Pt; readonly floors: Floors } | null;
  readonly barn: Pt | null;
  readonly items: readonly RuralItem[];
}

// A farm's crops: tufts in rows this far apart, this far along them, this
// wide; kept off the plots' edges, the hex's rim, the homestead.
export const CROP_ROW = 0.017, CROP_STEP = 0.0125, CROP_WIDTH = 0.017;
const CROP_EDGE = 0.007, CROP_REACH = 1.3, CROP_HOME_GAP = 0.06;
// A paddy's rice stands in its water, up to this share of its height.
export const PADDY_DEPTH = 0.85;
// A plantation's tufts: this far apart along every other row, this wide.
const PLANT_STEP = 0.011, PLANT_WIDTH = 0.015;
// The homestead's footprint (radius, tile steps), the barn's, and the gap
// kept between the works and machines and anything else.
const HOUSE_R = 0.036, BARN_R = 0.042, GAP = 0.02;
const HARVEST: Fill = { t: 'scatter', model: 'haystack', color: 0xc9a85a, per: 1.6 };

// The homestead's floors: one at first, three by the last stage.
export function houseFloors(imp: ImprovementKey, stage: number): Floors {
  const last = STAGE_TECHS(imp).length;
  return last <= 1 ? 1 : (1 + Math.round((2 * (Math.max(1, stage) - 1)) / (last - 1))) as Floors;
}

// The farm's layout (its homestead, its yards) on the tile's open ground.
export function planFarm(inp: RuralInput, site: RuralSite): Farm | null {
  const work = WORK_OF[inp.imp];
  return work ? paintFarm({ work, axis: inp.axis, density: stageLook(inp.imp, inp.stage, inp.res).density, seed: inp.seed, free: (p) => site.free(p) && site.depth(p) <= 0 }) : null;
}

// How far a walker's loop takes it from where it stands (tile steps, at its size `s`).
const walkOf = (m: RuralModel, s: number): number => 2 * roamOf(m) * s;
// How far a model reaches from its middle (tile steps, at its size `s`).
const reach = new Map<RuralModel, number>();
function radiusOf(m: RuralModel, s: number): number {
  let r = reach.get(m);
  if (r === undefined) {
    const g = ruralGeometry(ruralModelKind(m));
    g.computeBoundingBox();
    const b = g.boundingBox!;
    r = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
    reach.set(m, r);
  }
  return r * s;
}

export function layoutRural(inp: RuralInput, farm: Farm, site: RuralSite, keep: readonly { p: Pt; r: number }[] = []): RuralPlan {
  const { imp, stage, res } = inp, look = stageLook(imp, stage, res), worn = look.worn === true;
  const items: RuralItem[] = [];
  const u = farm.u, v = { x: -u.y, y: u.x }, along = Math.atan2(u.y, u.x);
  const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const inYard = (p: Pt) => farm.yards.some((poly) => pointInPoly(p, poly));
  const kept = (p: Pt, r = 0) => keep.some((k) => d2(p, k.p) < k.r + r);
  const dry = (p: Pt) => site.depth(p) <= 0;
  const add = (model: RuralModel, p: Pt, heading: number, s: number | readonly [number, number, number], leaf = 0xffffff, shade = 1) =>
    items.push({ model, p, heading, size: typeof s === 'number' ? [s, s, s] : s, leaf, shade });

  // The homestead: a house in the owner's style and its barn (none on a ruin), facing along the grid.
  const house = worn ? null : { p: { x: farm.home.x - 0.012 * v.x, y: farm.home.y - 0.012 * v.y }, floors: houseFloors(imp, stage) };
  const barn = !worn && look.density !== 'low' && imp !== 'camp' && imp !== 'mine' ? { x: farm.home.x + 0.03 * v.x, y: farm.home.y + 0.03 * v.y } : null;
  const taken: { p: Pt; r: number }[] = [...keep];
  if (house) taken.push({ p: house.p, r: HOUSE_R });
  if (barn) taken.push({ p: barn, r: BARN_R });

  // The yards: a crop's holds its harvest, a quarry's its stone, a camp's
  // its stumps and logs (a ruin's, nothing); a pasture's herd and a mine's
  // spoil are elsewhere.
  if (imp !== 'mine' && imp !== 'plantation' && !look.herd && !worn) farm.yards.forEach((poly, i) => {
    const al = inp.yard(i), r = mulberry32(inp.seed + i * 7 + 1);
    for (const fl of [al.fill.t === 'rows' ? HARVEST : al.fill, al.extra]) {
      if (!fl || fl.t !== 'scatter') continue;
      for (const p of scatterIn(poly, fl.per, inp.seed + i * 131 + (fl === al.extra ? 99 : 0), SCATTER_GAP[fl.model]))
        if (site.free(p) && dry(p) && !kept(p)) add(fl.model, p, r() * 6.28, 0.8 + 0.4 * r(), fl.color);
    }
  });

  // A pasture's herd, grazing over the whole tile (inside its fences once
  // it has them: round the farm, across it into paddocks).
  if (look.herd) {
    const unit = CREATURE_SCALE * FENCE_BOOST; // (a fence run's model length, tile steps)
    const fences = look.fence ? pastureFences(stage, inp.axis) : [];
    // (How near p comes to a fence: a beast's walk keeps off them all, the paddocks' too.)
    const toFence = (p: Pt) => Math.min(Infinity, ...fences.flatMap((line) => line.slice(0, -1).map((a, i) => {
      const b = line[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    })));
    for (const line of fences) line.slice(0, -1).forEach((a, i) => {
      const b = line[i + 1]!, len = d2(a, b), n = Math.max(1, Math.round(len / (unit * 3)));
      for (let k = 0; k < n; k++) {
        const p = { x: a.x + ((k + 0.5) / n) * (b.x - a.x), y: a.y + ((k + 0.5) / n) * (b.y - a.y) };
        if (site.free(p) && dry(p)) add(look.fence!, p, Math.atan2(b.y - a.y, b.x - a.x), [(len / n) / CREATURE_SCALE, FENCE_BOOST, FENCE_BOOST]);
      }
    });
    const r = mulberry32(inp.seed + 0x6e), want = herdSize(stage);
    for (let n = 0, tries = 0; n < want && tries < want * 10; tries++) {
      const p = { x: (r() - 0.5) * 1.1, y: (r() - 0.5) * 1.1 };
      const m = look.herd.models[n % look.herd.models.length]!, s = kitBoost(m) * (0.9 + 0.2 * r()), walk = walkOf(m, s);
      if (rhoOf(6, p) > SAFE_RHO - 0.1 - walk || toFence(p) < walk + radiusOf(m, s) * 0.6 || d2(p, farm.home) < 0.1 || inYard(p) || !site.free(p) || !dry(p) || kept(p, walk) || taken.some((q) => d2(p, q.p) < q.r + walk)) continue;
      add(m, p, r() * 6.28, s, look.herd.colors[n % look.herd.colors.length]!);
      taken.push({ p, r: walk });
      n++;
    }
  }

  // Crops: farms, and rice paddies (in their water: peat is only cut).
  const ps = plotStage(imp, stage);
  // (The fields fill the tile as its land is painted, past its hex's sides where its painting goes.)
  const off = (p: Pt) => rhoOf(6, p) > CROP_REACH || !site.ours(p) || d2(p, farm.home) < CROP_HOME_GAP || inYard(p) || kept(p) || !site.free(p);
  if (imp === 'farm' || (imp === 'wetland' && inp.region === 'paddy')) {
    const paddy = inp.region === 'paddy';
    const tint = CROP_PALETTE[inp.region].map((h) => {
      const r = ((h >> 16) & 255) / 255, g = ((h >> 8) & 255) / 255, b = (h & 255) / 255, l = 0.299 * r + 0.587 * g + 0.114 * b;
      const c = (x: number) => Math.round(Math.max(0, Math.min(1, l + (x - l) * CROP_STAND_SATURATION)) * 255);
      return (c(r) << 16) | (c(g) << 8) | c(b);
    });
    const rand = mulberry32(inp.seed + 0xc4);
    // (A first farm is patchy, a ruin's mostly gone to weed; a paddy is planted
    // all over its water, every plot, to the edges.)
    const thin = stage === 0 ? 0.7 : stage === 1 && !paddy ? 0.2 : 0;
    for (let x = -0.7; x <= 0.7; x += CROP_ROW) for (let y = -0.7; y <= 0.7; y += CROP_STEP) {
      const pu = x + (rand() - 0.5) * CROP_ROW * 0.3, pv = y + (rand() - 0.5) * CROP_STEP * 0.8, turn = rand() * Math.PI, shade = 0.9 + 0.2 * rand(), grow = 0.9 + 0.2 * rand();
      const p = { x: pu * u.x + pv * v.x, y: pu * u.y + pv * v.y };
      if (rand() < thin || off(p)) continue;
      const plot = plotAt(pu, pv, inp.salt, ps), k = paddy ? 0 : cropIndex(plot.h, ps), h = CROP_HEIGHT[k] * grow;
      if (h === 0 || (!paddy && plot.edge < CROP_EDGE)) continue;
      const wet = site.depth(p);
      if (paddy ? wet <= 0 || wet > PADDY_DEPTH * h : wet > 0) continue;
      add('crop', p, turn, [CROP_WIDTH, h, CROP_WIDTH], tint[k]!, shade);
    }
  }

  // A plantation's plants: tufts along every other painted row of its plots
  // (terrainMaterial.ts paints rows PLANT_ROW_W apart, the plants on their
  // green), or loose over a first one's patches (and a ruin's, thinly).
  if (look.plants) {
    const pl = look.plants, rand = mulberry32(inp.seed + 0xd7);
    const spots: { p: Pt; heading: number }[] = [];
    if (pl.rows) {
      const sx = PLOT_SIZES[Math.min(ps, MAX_STAGE)]![0];
      for (let y = -0.7; y <= 0.7; y += PLANT_STEP) {
        let last = '';
        for (let x = -0.7; x <= 0.7; x += 0.001) {
          const plot = plotAt(x, y, inp.salt, ps), row = (plot.f[0] * sx) / PLANT_ROW_W, id = `${plot.h}|${Math.floor(row)}`;
          if (Math.floor(row) % 2 || row % 1 < 0.72 || id === last) continue;
          last = id;
          if (plot.edge >= 0.01 && cropIndex(plot.h, ps) !== 3) spots.push({ p: { x: x * u.x + y * v.x, y: x * u.y + y * v.y }, heading: along + Math.PI / 2 });
        }
      }
    } else {
      // (A first plantation fills its patches loosely, a ruin's thinly.)
      for (let x = -0.7; x <= 0.7; x += 0.017) for (let y = -0.7; y <= 0.7; y += 0.015) {
        const pu = x + (rand() - 0.5) * 0.008, pv = y + (rand() - 0.5) * 0.008, plot = plotAt(pu, pv, inp.salt, ps);
        if (rand() < (worn ? 0.75 : 0.3) || plot.edge < CROP_EDGE || cropIndex(plot.h, ps) === 3) continue;
        spots.push({ p: { x: pu * u.x + pv * v.x, y: pu * u.y + pv * v.y }, heading: rand() * Math.PI });
      }
    }
    for (const { p, heading } of spots) {
      if (off(p) || !dry(p)) continue;
      const h = pl.height * (0.85 + 0.3 * rand()) * (worn ? 0.7 : 1);
      add('plant', p, heading + (rand() - 0.5) * 0.3, [PLANT_WIDTH, h, PLANT_WIDTH], pl.colors[Math.floor(rand() * pl.colors.length)]!, 0.9 + 0.2 * rand());
    }
  }

  // The stage's things: by the homestead (round it, clear of it), in a
  // yard, out in the fields; works and machines well apart from anything,
  // people a little closer.
  const r = mulberry32(inp.seed + 0x7f);
  for (const th of look.things) for (let n = 0; n < th.n; n++) {
    const m = th.model, fig = FIGURES.has(m), s = kitBoost(m) * (0.9 + 0.2 * r());
    // (A walker keeps its whole walk clear, not just where it stands.)
    const rad = radiusOf(m, s) * (fig ? 0.5 : 1) + walkOf(m, s), gap = fig ? 0.004 : GAP;
    const leaf = th.colors ? th.colors[Math.floor(r() * th.colors.length)]! : 0xffffff;
    for (let tries = 0; tries < 40; tries++) {
      let p: Pt;
      if (th.where === 'home') {
        // (Round the house, a little further out each few tries.)
        const a = r() * Math.PI * 2, dist = HOUSE_R + rad + gap + 0.005 * Math.floor(tries / 4);
        p = { x: farm.home.x + Math.cos(a) * dist, y: farm.home.y + Math.sin(a) * dist };
      } else if (th.where === 'yard' && farm.yards.length) {
        const poly = farm.yards[Math.floor(r() * farm.yards.length)]!, xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
        p = { x: Math.min(...xs) + r() * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + r() * (Math.max(...ys) - Math.min(...ys)) };
      } else p = { x: (r() - 0.5) * 1.0, y: (r() - 0.5) * 1.0 };
      if (rhoOf(6, p) > SAFE_RHO - 0.03 - rad * 0.5 || !site.free(p) || taken.some((q) => d2(p, q.p) < q.r + rad + gap)) continue;
      if (th.where === 'field' && (d2(p, farm.home) < 0.08 || inYard(p))) continue;
      const wet = site.depth(p);
      if (wet > (imp === 'wetland' && fig ? site.wade : 0)) continue;
      // (The plough and the tractor on ploughed earth, the combine in the grain.)
      if ((m === 'ploughTeam' || m === 'tractor' || m === 'combine') && tries < 30) {
        const pu = p.x * u.x + p.y * u.y, pv = p.x * v.x + p.y * v.y;
        if (cropIndex(plotAt(pu, pv, inp.salt, ps).h, ps) !== (m === 'combine' ? 0 : 3)) continue;
      }
      // (Machines and teams work along the plots; people face about.)
      add(m, p, (th.where === 'field' && !fig) || m === 'ploughTeam' ? along : r() * 6.28, s, leaf);
      taken.push({ p, r: rad });
      break;
    }
  }
  return { house, barn, items };
}

