// The middles, drawn by hand: streets, squares, greens, building spots and
// a few pieces of street furniture. Houses are in lots.json.
//
// The hexagon's sides face east (0), north-east (1), north-west (2), west
// (3), south-west (4) and south-east (5); its middle reaches 0.32 from the
// center toward each side. A pentagon's sides face 0°, 72°, 144°, 216°
// and 288°; its middle reaches 0.218. Each drawing names its border type
// per side (borders.ts) and its streets start exactly at those stubs.

import { P, type Density } from './geometry.ts';
import { sketchMiddle, type MiddleSketch } from './drawings.ts';

const D = (d: Density, rest: string) => `${d}-${rest}`;

export const MIDDLE_SKETCHES: readonly MiddleSketch[] = [
  // ======================= low density: villages =======================

  // A street village: one street winding through, a lane off it, gardens behind.
  sketchMiddle('low-1', 'Low 1: street village', 6, 'low', 'block', ['single', 'closed', 'closed', 'single', 'closed', 'closed'], (m) => {
    const main = m.out(0, 0, P(0.16, 0.035), P(0, -0.02), P(-0.17, 0.025), m.stub(3));
    m.street('lane', [m.on(main, P(-0.06, 0)), P(-0.09, 0.09), P(-0.11, 0.17)]);
    m.spot(0.07, 0.1);
    m.decor('well', 0.13, -0.06);
  }),

  // A green village: two lanes bow around a long green.
  sketchMiddle('low-2', 'Low 2: green village', 6, 'low', 'block', ['single', 'closed', 'double', 'single', 'closed', 'double'], (m) => {
    m.out(0, 0, P(0.2, 0));
    m.out(3, 0, P(-0.2, 0));
    const up = m.street('street', [P(0.2, 0), P(0.1, 0.085), P(-0.1, 0.085), P(-0.2, 0)]);
    const dn = m.street('street', [P(0.2, 0), P(0.1, -0.085), P(-0.1, -0.085), P(-0.2, 0)]);
    m.out(2, 0, P(-0.07, 0.2), m.on(up, P(-0.05, 0.09)));
    m.out(2, 1, P(-0.2, 0.15), m.on(up, P(-0.16, 0.05)));
    m.out(5, 0, P(0.07, -0.2), m.on(dn, P(0.05, -0.09)));
    m.out(5, 1, P(0.2, -0.15), m.on(dn, P(0.16, -0.05)));
    m.square([P(-0.165, 0), P(-0.08, 0.058), P(0.08, 0.058), P(0.165, 0), P(0.08, -0.058), P(-0.08, -0.058)], false);
    m.decor('tree', -0.06, 0.012); m.decor('tree', 0.045, -0.02); m.decor('tree', 0.1, 0.018); m.decor('well', -0.01, 0.02);
    m.spot(0.12, 0.19);
  }),

  // A crossroads hamlet: three roads meet off the middle, a lane runs west.
  sketchMiddle('low-3', 'Low 3: crossroads', 6, 'low', 'block', ['closed', 'single', 'closed', 'closed', 'single', 'single'], (m) => {
    const J = P(0.03, -0.06);
    m.out(1, 0, P(0.11, 0.12), J);
    m.out(4, 0, P(-0.08, -0.15), J);
    m.out(5, 0, P(0.11, -0.15), J);
    m.street('lane', [J, P(-0.1, 0), P(-0.21, 0.07)]);
    m.spot(0.17, 0.01);
    m.decor('well', -0.05, 0.05);
  }),

  // A farm loop: a lane loops in from the east around an orchard; a road from the north-west.
  sketchMiddle('low-4', 'Low 4: farm loop', 6, 'low', 'block', ['double', 'closed', 'single', 'closed', 'closed', 'closed'], (m) => {
    const loop = m.street('lane', [m.stub(0, 1), P(0.17, 0.11), P(0.03, 0.06), P(0.01, -0.05), P(0.15, -0.11), m.stub(0, 0)]);
    m.out(2, 0, P(-0.1, 0.17), m.on(loop, P(0.03, 0.06)));
    m.square([P(0.07, 0.04), P(0.16, 0.07), P(0.24, 0.055), P(0.24, -0.05), P(0.15, -0.075), P(0.06, -0.03)], false);
    for (const [x, y] of [[0.1, 0.02], [0.15, 0.03], [0.2, 0.02], [0.12, -0.03], [0.18, -0.03]] as const) m.decor('tree', x, y);
    m.spot(-0.13, -0.06);
  }),

  // Two lanes: one from the north-east to the west, one from the west to the south-east, a link between.
  sketchMiddle('low-5', 'Low 5: two lanes', 6, 'low', 'block', ['closed', 'double', 'closed', 'double', 'closed', 'single'], (m) => {
    const a = m.street('lane', [m.stub(1, 0), P(0.12, 0.12), P(-0.08, 0.085), m.stub(3, 0)]);
    m.out(1, 1, P(0.03, 0.2), m.on(a, P(0, 0.09)));
    m.street('lane', [m.stub(3, 1), P(-0.15, -0.08), P(-0.05, -0.11)]);
    const c = m.out(5, 0, P(0.08, -0.17), P(-0.05, -0.11));
    m.street('lane', [m.on(a, P(0.1, 0.11)), P(0.08, 0), m.on(c, P(0.03, -0.13))]);
    m.spot(0.21, -0.03);
  }),

  // A pentagon hamlet: a bent street, two lanes joining it.
  sketchMiddle('low-pent', 'Low pentagon', 5, 'low', 'block', ['single', 'closed', 'double', 'closed', 'single'], (m) => {
    const main = m.out(0, 0, P(0.08, 0), P(0.02, -0.08), m.stub(4));
    m.out(2, 0, P(-0.06, 0.08), m.on(main, P(0.06, -0.02)));
    m.out(2, 1, P(-0.1, 0), m.on(main, P(0.02, -0.07)));
    m.spot(-0.07, -0.11);
  }),

  // A village center: a small square ringed by a street, the hall on it.
  sketchMiddle('low-center-hex', 'Low center (hex)', 6, 'low', 'center', ['single', 'single', 'closed', 'single', 'double', 'closed'], (m) => {
    const c = P(0.02, 0.04);
    const ring = m.ring(c, 0.075, 'street');
    m.round(c, 0.061);
    m.out(0, 0, P(0.18, 0.03), m.on(ring, P(0.095, 0.04)));
    m.out(1, 0, P(0.1, 0.17), m.on(ring, P(0.05, 0.11)));
    const w = m.out(3, 0, P(-0.15, 0.01), m.on(ring, P(-0.055, 0.03)));
    m.out(4, 0, P(-0.17, -0.1), m.on(w, P(-0.15, 0.01)));
    m.out(4, 1, P(-0.03, -0.15), m.on(ring, P(0.0, -0.033)));
    m.hallAt(0.02, 0.055, 0.04);
    m.decor('well', 0.02, 0.005);
    m.spot(0.2, -0.12);
    m.spot(-0.17, 0.17);
  }),

  sketchMiddle('low-center-pent', 'Low center (pentagon)', 5, 'low', 'center', ['single', 'single', 'closed', 'double', 'closed'], (m) => {
    const ring = m.ring(P(0, 0), 0.065, 'street');
    m.round(P(0, 0), 0.051);
    m.out(0, 0, m.on(ring, P(0.065, 0)));
    m.out(1, 0, m.on(ring, P(0.02, 0.062)));
    m.out(3, 0, m.on(ring, P(-0.064, -0.011)));
    m.out(3, 1, m.on(ring, P(-0.032, -0.056)));
    m.hallAt(0, 0.015, 0.033);
    m.spot(0.12, -0.1, 0.044);
    m.spot(-0.1, 0.12, 0.044);
  }),

  ...(['low', 'medium', 'high'] as const).flatMap((d) => [
    // A wonder's square: a ring street round it, paths in from three sides.
    sketchMiddle(D(d, 'wonder-hex'), `${d[0]!.toUpperCase()}${d.slice(1)} wonder square (hex)`, 6, d, 'wonder', ['single', 'closed', 'single', 'closed', 'single', 'closed'], (m) => {
      const ring = m.ring(P(0, 0), 0.2, 'street');
      m.round(P(0, 0), 0.185, false);
      m.out(0, 0, m.on(ring, P(0.2, 0)));
      m.out(2, 0, m.on(ring, P(-0.1, 0.173)));
      m.out(4, 0, m.on(ring, P(-0.1, -0.173)));
      m.wonderAt(0, 0, 0.17);
    }),
    sketchMiddle(D(d, 'wonder-pent'), `${d[0]!.toUpperCase()}${d.slice(1)} wonder square (pentagon)`, 5, d, 'wonder', ['single', 'closed', 'single', 'closed', 'closed'], (m) => {
      const ring = m.ring(P(0, 0), 0.135, 'street');
      m.round(P(0, 0), 0.12, false);
      m.out(0, 0, m.on(ring, P(0.135, 0)));
      m.out(2, 0, m.on(ring, P(-0.109, 0.079)));
      m.wonderAt(0, 0, 0.11);
    }),
  ]),

  // ======================= medium density: towns =======================

  // A market place: a long square north of the main street, framed by streets.
  sketchMiddle('medium-1', 'Medium 1: market place', 6, 'medium', 'block', ['single', 'double', 'closed', 'single', 'double', 'closed'], (m) => {
    const main = m.out(0, 0, P(0.1, 0), P(-0.1, 0), m.stub(3));
    const north = m.street('street', [P(-0.145, 0.13), P(0.085, 0.13)], false);
    m.street('street', [P(-0.145, 0), P(-0.145, 0.13)], false);
    m.street('street', [P(0.085, 0), P(0.085, 0.13)], false);
    m.square([P(-0.13, 0.03), P(0.07, 0.03), P(0.07, 0.115), P(-0.13, 0.115)]);
    m.out(1, 0, P(0.16, 0.17), P(0.085, 0.13));
    m.out(1, 1, P(0.03, 0.22), m.on(north, P(0, 0.13)));
    m.out(4, 0, P(-0.19, -0.12), m.on(main, P(-0.18, 0)));
    m.out(4, 1, P(-0.05, -0.15), m.on(main, P(-0.04, 0)));
    m.decor('fountain', -0.03, 0.072);
    m.decor('stall', -0.09, 0.055, 90); m.decor('stall', 0.03, 0.09, -90); m.decor('stall', -0.07, 0.098, -90); m.decor('stall', 0.04, 0.052, 90);
    m.spot(0.2, -0.11);
    m.spot(-0.24, 0.11);
  }),

  // A grid quarter: two long streets east to west, cross streets, blocks between.
  sketchMiddle('medium-2', 'Medium 2: grid quarter', 6, 'medium', 'block', ['double', 'double', 'closed', 'double', 'double', 'closed'], (m) => {
    m.street('street', [m.stub(0, 1), m.stub(3, 0)], false);
    m.street('street', [m.stub(0, 0), m.stub(3, 1)], false);
    m.street('street', [m.stub(1, 0), P(0.2304, 0.0813)], false);
    m.street('street', [m.stub(1, 1), P(0.0896, 0.0813)], false);
    m.street('street', [m.stub(4, 0), P(-0.2304, -0.0813)], false);
    m.street('street', [m.stub(4, 1), P(-0.0896, -0.0813)], false);
    m.street('lane', [P(0.0896, 0.0813), P(0.0896, -0.0813)], false);
    m.street('lane', [P(-0.0896, 0.0813), P(-0.0896, -0.0813)], false);
    m.spot(0, 0);
    m.spot(-0.2, 0);
  }),

  // A high street: the main street through, back streets behind both sides.
  sketchMiddle('medium-3', 'Medium 3: high street', 6, 'medium', 'block', ['single', 'closed', 'double', 'single', 'closed', 'double'], (m) => {
    const main = m.out(0, 0, P(0.12, -0.025), P(-0.1, 0.025), m.stub(3));
    const north = m.street('street', [P(-0.25, 0.175), P(-0.05, 0.185), P(0.15, 0.175), P(0.24, 0.15)]);
    m.out(2, 0, m.on(north, P(-0.07, 0.185)));
    m.out(2, 1, m.on(north, P(-0.22, 0.18)));
    m.street('lane', [m.on(north, P(0.1, 0.18)), m.on(main, P(0.1, -0.02))], false);
    const south = m.street('street', [P(-0.24, -0.15), P(-0.15, -0.175), P(0.05, -0.185), P(0.25, -0.175)]);
    m.out(5, 0, m.on(south, P(0.08, -0.183)));
    m.out(5, 1, m.on(south, P(0.22, -0.177)));
    m.street('lane', [m.on(south, P(-0.08, -0.18)), m.on(main, P(-0.08, 0.02))], false);
    m.spot(-0.02, 0.1);
    m.spot(0.02, -0.1);
  }),

  // A crescent: a street bows round a green in the north; an arc of streets in the south.
  sketchMiddle('medium-4', 'Medium 4: crescent', 6, 'medium', 'block', ['closed', 'single', 'single', 'closed', 'double', 'double'], (m) => {
    const cres = m.out(1, 0, P(0.12, 0.16), P(0, 0.115), P(-0.12, 0.16), m.stub(2));
    m.square([P(-0.07, 0.2), P(0, 0.165), P(0.07, 0.2), P(0.04, 0.26), P(-0.04, 0.26)], false);
    m.decor('tree', -0.02, 0.2); m.decor('tree', 0.03, 0.22); m.decor('tree', 0, 0.245);
    const arc = m.street('street', [m.stub(4, 0), P(-0.13, -0.13), P(0, -0.11), P(0.13, -0.13), m.stub(5, 1)]);
    m.street('street', [m.stub(4, 1), m.on(arc, P(-0.06, -0.115))]);
    m.street('street', [m.stub(5, 0), m.on(arc, P(0.06, -0.115))]);
    m.street('street', [m.on(arc, P(0, -0.11)), m.on(cres, P(0, 0.115))], false);
    m.spot(0.15, 0);
    m.spot(-0.15, 0);
  }),

  // A church square: streets from three sides meet at a square; two from the west.
  sketchMiddle('medium-5', 'Medium 5: church square', 6, 'medium', 'block', ['single', 'single', 'closed', 'double', 'closed', 'single'], (m) => {
    const loop = m.street('street', [P(-0.015, 0), P(0.025, 0.065), P(0.135, 0.065), P(0.175, 0), P(0.135, -0.065), P(0.025, -0.065), P(-0.015, 0)], false);
    m.square([P(0.03, 0.05), P(0.13, 0.05), P(0.157, 0), P(0.13, -0.05), P(0.03, -0.05), P(0.003, 0)]);
    m.out(0, 0, m.on(loop, P(0.175, 0)));
    m.out(1, 0, P(0.14, 0.17), m.on(loop, P(0.11, 0.065)));
    m.out(5, 0, P(0.14, -0.17), m.on(loop, P(0.11, -0.065)));
    const a = m.out(3, 0, P(-0.15, 0.07), m.on(loop, P(0.003, 0.03)));
    const b = m.out(3, 1, P(-0.15, -0.07), m.on(loop, P(0.003, -0.03)));
    m.street('lane', [m.on(a, P(-0.2, 0.075)), m.on(b, P(-0.2, -0.075))], false);
    m.decor('fountain', 0.08, 0);
    m.spot(-0.14, 0.2);
    m.spot(-0.14, -0.2);
  }),

  sketchMiddle('medium-pent', 'Medium pentagon', 5, 'medium', 'block', ['single', 'double', 'closed', 'single', 'closed'], (m) => {
    const main = m.out(0, 0, P(0.06, 0.01), P(-0.06, -0.03), m.stub(3));
    m.out(1, 0, P(0.07, 0.1), m.on(main, P(0.05, 0.01)));
    m.out(1, 1, P(-0.03, 0.12), m.on(main, P(-0.05, -0.02)));
    m.spot(0.1, -0.1, 0.044);
    m.spot(-0.1, 0.06, 0.04);
  }),

  // A town center: a paved square framed by streets, the hall on its north side.
  sketchMiddle('medium-center-hex', 'Medium center (hex)', 6, 'medium', 'center', ['single', 'double', 'single', 'double', 'single', 'closed'], (m) => {
    const frame = m.street('street', [P(-0.09, -0.07), P(0.1, -0.07), P(0.1, 0.1), P(-0.09, 0.1), P(-0.09, -0.07)], false);
    m.square([P(-0.075, -0.055), P(0.085, -0.055), P(0.085, 0.085), P(-0.075, 0.085)]);
    m.out(0, 0, m.on(frame, P(0.1, 0)));
    m.out(1, 0, P(0.16, 0.15), P(0.1, 0.1));
    m.out(1, 1, P(0.05, 0.2), m.on(frame, P(0.03, 0.1)));
    m.out(2, 0, P(-0.12, 0.17), P(-0.09, 0.1));
    m.out(3, 0, m.on(frame, P(-0.09, 0.0813)));
    const sw = m.out(3, 1, P(-0.2, -0.08), P(-0.09, -0.07));
    m.out(4, 0, P(-0.1, -0.16), m.on(frame, P(-0.03, -0.07)));
    void sw;
    m.hallAt(0.005, 0.035, 0.045);
    m.decor('fountain', 0.005, -0.025);
    m.spot(0.21, -0.1);
    m.spot(0.23, 0.085);
  }),

  sketchMiddle('medium-center-pent', 'Medium center (pentagon)', 5, 'medium', 'center', ['single', 'single', 'double', 'closed', 'single'], (m) => {
    const ring = m.ring(P(0, 0), 0.07, 'street');
    m.round(P(0, 0), 0.056);
    m.out(0, 0, m.on(ring, P(0.07, 0)));
    m.out(1, 0, m.on(ring, P(0.022, 0.067)));
    m.out(2, 0, m.on(ring, P(-0.04, 0.057)));
    m.out(2, 1, m.on(ring, P(-0.066, 0.02)));
    m.out(4, 0, m.on(ring, P(0.022, -0.067)));
    m.hallAt(0, 0.012, 0.035);
    m.spot(-0.11, -0.09, 0.042);
    m.spot(0.13, 0.08, 0.04);
  }),

  // ======================= high density: cities =======================

  // A plaza: a paved plaza framed by streets, avenues in.
  sketchMiddle('high-1', 'High 1: plaza', 6, 'high', 'block', ['single', 'double', 'single', 'double', 'single', 'double'], (m) => {
    const frame = m.street('street', [P(-0.065, -0.055), P(0.125, -0.055), P(0.125, 0.095), P(-0.065, 0.095), P(-0.065, -0.055)], false);
    m.square([P(-0.05, -0.04), P(0.11, -0.04), P(0.11, 0.08), P(-0.05, 0.08)]);
    m.out(0, 0, m.on(frame, P(0.125, 0)));
    m.out(1, 0, P(0.21, 0.16), P(0.125, 0.095));
    m.out(1, 1, P(0.06, 0.2), m.on(frame, P(0.04, 0.095)));
    m.out(2, 0, P(-0.12, 0.18), P(-0.065, 0.095));
    m.out(3, 0, m.on(frame, P(-0.065, 0.0813)));
    const s4 = m.out(4, 0, P(-0.12, -0.15), P(-0.065, -0.055));
    m.out(3, 1, m.on(s4, P(-0.1, -0.1)));
    const s5 = m.out(5, 0, m.on(frame, P(0.06, -0.055)));
    m.out(5, 1, P(0.17, -0.2), m.on(s5, P(0.08, -0.17)));
    m.decor('fountain', 0.03, 0.02);
    m.decor('tree', -0.03, 0.06); m.decor('tree', 0.09, 0.06); m.decor('tree', -0.03, -0.02); m.decor('tree', 0.09, -0.02);
    m.spot(0.21, -0.1);
    m.spot(-0.2, -0.005);
  }),

  // Superblocks: two long streets, a park between, towers north and south.
  sketchMiddle('high-2', 'High 2: superblocks', 6, 'high', 'block', ['double', 'closed', 'double', 'double', 'closed', 'double'], (m) => {
    m.street('main', [m.stub(0, 1), m.stub(3, 0)], false);
    m.street('main', [m.stub(0, 0), m.stub(3, 1)], false);
    m.street('main', [m.stub(2, 0), P(-0.0896, 0.0813)], false);
    m.street('main', [m.stub(2, 1), P(-0.2304, 0.0813)], false);
    m.street('main', [m.stub(5, 0), P(0.0896, -0.0813)], false);
    m.street('main', [m.stub(5, 1), P(0.2304, -0.0813)], false);
    m.street('street', [P(0.27, 0.0813), P(0.27, -0.0813)], false);
    m.street('street', [P(-0.27, 0.0813), P(-0.27, -0.0813)], false);
    m.square([P(-0.22, -0.05), P(0.22, -0.05), P(0.22, 0.05), P(-0.22, 0.05)], false);
    for (const x of [-0.18, -0.11, -0.04, 0.03, 0.1, 0.17]) m.decor('tree', x, (x * 37) % 0.04 > 0.02 ? 0.02 : -0.02);
    m.spot(0.12, 0.18);
    m.spot(-0.12, -0.18);
  }),

  // A boulevard: a straight avenue east to west, streets from the south, a back street north.
  sketchMiddle('high-3', 'High 3: boulevard', 6, 'high', 'block', ['single', 'closed', 'closed', 'single', 'double', 'double'], (m) => {
    m.street('avenue', [m.stub(0), m.stub(3)], false);
    m.street('main', [m.stub(4, 0), P(-0.2304, 0)], false);
    m.street('main', [m.stub(4, 1), P(-0.0896, 0)], false);
    m.street('main', [m.stub(5, 0), P(0.0896, 0)], false);
    m.street('main', [m.stub(5, 1), P(0.2304, 0)], false);
    const north = m.street('street', [P(-0.25, 0.18), P(0.25, 0.18)], false);
    m.street('street', [m.on(north, P(-0.06, 0.18)), P(-0.06, 0)], false);
    m.street('street', [m.on(north, P(0.06, 0.18)), P(0.06, 0)], false);
    for (const x of [-0.27, 0.27]) m.decor('tree', x, 0.034);
    for (const x of [-0.29, -0.16, -0.025, 0.025, 0.16, 0.29]) m.decor('tree', x, -0.034);
    m.spot(0.19, 0.09);
    m.spot(-0.19, 0.09);
  }),

  // A park: a park in the middle, a street round it, towers outside.
  sketchMiddle('high-4', 'High 4: park', 6, 'high', 'block', ['double', 'single', 'closed', 'double', 'single', 'closed'], (m) => {
    const ring = m.street('street', [P(-0.145, -0.06), P(0.085, -0.06), P(0.085, 0.12), P(-0.145, 0.12), P(-0.145, -0.06)], false);
    m.square([P(-0.13, -0.045), P(0.07, -0.045), P(0.07, 0.105), P(-0.13, 0.105)], false);
    for (const [x, y] of [[-0.1, -0.02], [-0.06, 0.05], [-0.01, -0.01], [0.04, 0.07], [0.04, -0.02], [-0.1, 0.08], [-0.03, 0.09]] as const) m.decor('tree', x, y);
    m.out(0, 1, m.on(ring, P(0.085, 0.0813)));
    m.out(0, 0, P(0.2, -0.07), P(0.085, -0.06));
    m.out(1, 0, P(0.1, 0.18), m.on(ring, P(0.04, 0.12)));
    m.out(3, 0, m.on(ring, P(-0.145, 0.0813)));
    m.out(3, 1, P(-0.22, -0.07), P(-0.145, -0.06));
    m.out(4, 0, P(-0.1, -0.15), m.on(ring, P(-0.06, -0.06)));
    m.spot(0.18, -0.165);
    m.spot(0.2, 0.165);
  }),

  // A diagonal: an avenue straight across from north-east to south-west.
  sketchMiddle('high-5', 'High 5: diagonal', 6, 'high', 'block', ['single', 'single', 'closed', 'closed', 'single', 'double'], (m) => {
    const diag = m.street('avenue', [m.stub(1), m.stub(4)], false);
    const e = m.out(0, 0, P(0.15, 0.02), m.on(diag, P(0.03, 0.05)));
    m.out(5, 0, P(0.06, -0.15), m.on(diag, P(-0.02, -0.035)));
    m.out(5, 1, P(0.2, -0.1), m.on(e, P(0.2, 0.012)));
    m.street('street', [m.on(diag, P(-0.06, -0.1)), P(-0.15, -0.02), P(-0.24, 0.05)]);
    m.spot(0.2, 0.15);
    m.spot(-0.15, 0.12);
  }),

  sketchMiddle('high-pent', 'High pentagon', 5, 'high', 'block', ['double', 'closed', 'single', 'closed', 'single'], (m) => {
    m.street('main', [m.stub(0, 0), P(0.05, -0.07)], false);
    m.street('main', [m.stub(0, 1), P(0.05, 0.07)], false);
    const cross = m.street('street', [P(0.05, 0.07), P(0.05, -0.07)], false);
    void cross;
    m.out(2, 0, P(-0.06, 0.04), P(0.05, 0.03));
    m.out(4, 0, P(0.05, -0.12), P(0.05, -0.07));
    m.spot(-0.11, -0.07, 0.045);
    m.spot(0.13, 0, 0.04);
  }),

  sketchMiddle('high-center-hex', 'High center (hex)', 6, 'high', 'center', ['single', 'double', 'single', 'double', 'single', 'double'], (m) => {
    const frame = m.street('avenue', [P(-0.1, -0.08), P(0.11, -0.08), P(0.11, 0.1), P(-0.1, 0.1), P(-0.1, -0.08)], false);
    m.square([P(-0.078, -0.058), P(0.088, -0.058), P(0.088, 0.078), P(-0.078, 0.078)]);
    m.out(0, 0, m.on(frame, P(0.11, 0)));
    m.out(1, 0, P(0.19, 0.15), P(0.11, 0.1));
    m.out(1, 1, P(0.05, 0.2), m.on(frame, P(0.03, 0.1)));
    m.out(2, 0, P(-0.13, 0.17), P(-0.1, 0.1));
    m.out(3, 0, m.on(frame, P(-0.1, 0.0813)));
    const s4 = m.out(4, 0, P(-0.13, -0.17), P(-0.1, -0.08));
    m.out(3, 1, m.on(s4, P(-0.115, -0.12)));
    const s5 = m.out(5, 0, m.on(frame, P(0.07, -0.08)));
    m.out(5, 1, P(0.17, -0.21), m.on(s5, P(0.08, -0.19)));
    m.hallAt(0.005, 0.03, 0.045);
    m.decor('fountain', 0.005, -0.03);
    m.spot(0.21, -0.11);
    m.spot(-0.21, -0.005);
  }),

  sketchMiddle('high-center-pent', 'High center (pentagon)', 5, 'high', 'center', ['single', 'double', 'single', 'single', 'double'], (m) => {
    const ring = m.ring(P(0, 0), 0.075, 'street');
    m.round(P(0, 0), 0.06);
    m.out(0, 0, m.on(ring, P(0.075, 0)));
    m.out(1, 0, m.on(ring, P(0.05, 0.055)));
    m.out(1, 1, m.on(ring, P(-0.005, 0.075)));
    m.out(2, 0, m.on(ring, P(-0.061, 0.044)));
    m.out(3, 0, m.on(ring, P(-0.061, -0.044)));
    m.out(4, 0, m.on(ring, P(-0.005, -0.075)));
    m.out(4, 1, m.on(ring, P(0.05, -0.055)));
    m.hallAt(0, 0.012, 0.035);
    m.spot(0.135, 0.085, 0.035);
    m.spot(-0.09, 0.14, 0.035);
  }),
];
