// Drafts the houses of town drawings that have none yet (src/town/lots.json),
// with the drafting pen (src/town/draft.ts). Drawings already in lots.json
// are left exactly as they are (hand corrections stay); name ids to redraft
// them: `npx tsx scripts/draftTowns.ts low-1 strip:low-single|land`.
import { writeFileSync, readFileSync } from 'node:fs';
import { MIDDLE_SKETCHES } from '../src/town/middles.ts';
import { STRIP_SKETCHES } from '../src/town/strips.ts';
import { draftLots } from '../src/town/draft.ts';
import { densityOfType } from '../src/town/borders.ts';
import { INR, RC, STRIP_DEPTH, inStrip, rhoOf, type Lot } from '../src/town/geometry.ts';

const FILE = new URL('../src/town/lots.json', import.meta.url);
const table: Record<string, unknown[]> = JSON.parse(readFileSync(FILE, 'utf8'));
const redo = new Set(process.argv.slice(2));
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const row = (l: Lot) => [l.kind, +l.x.toFixed(4), +l.y.toFixed(4), +((l.yaw * 180) / Math.PI).toFixed(1), ...(l.spot === undefined ? [] : [l.spot])];
let drafted = 0;

for (const m of MIDDLE_SKETCHES) {
  if (table[m.id] && !redo.has(m.id)) continue;
  const lots = draftLots({
    region: (p) => rhoOf(m.sides, p) <= RC - 0.0135 / INR[m.sides],
    density: () => m.density,
    streets: m.pen.s.streets, squares: m.pen.s.squares, spots: m.pen.spots,
    keepClear: [m.pen.hall, m.pen.wonder].filter((x) => x !== null),
    decor: m.pen.s.decor, seed: hash(m.id),
  });
  table[m.id] = lots.map(row);
  drafted++;
}
for (const s of STRIP_SKETCHES) {
  if (table[s.id] && !redo.has(s.id)) continue;
  const one = s.b === 'land' || s.b === 'water';
  const lots = draftLots({
    region: (p) => inStrip(p, 0.0055, one) && Math.abs(p.y) <= STRIP_DEPTH - 0.0235 && (s.b !== 'water' || p.y < -0.03),
    density: (p) => (p.y <= 0 || one ? densityOfType(s.a) : densityOfType(s.b as Exclude<typeof s.b, 'land' | 'water'>)),
    streets: s.pen.s.streets, squares: s.pen.s.squares, spots: [], keepClear: [],
    decor: s.pen.s.decor, seed: hash(s.id),
  });
  table[s.id] = lots.map(row);
  drafted++;
}
// One drawing per line block, one lot per line: easy to read and edit by hand.
const out = '{\n' + Object.entries(table).map(([id, rows]) =>
  `  ${JSON.stringify(id)}: [\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]`).join(',\n') + '\n}\n';
writeFileSync(FILE, out);
console.log(`drafted ${drafted} drawings; ${Object.keys(table).length} in lots.json`);
