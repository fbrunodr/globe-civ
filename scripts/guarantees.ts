// Prints every map guarantee with its limits for each map size, straight from
// the code (src/mapChecks.ts + src/mapRules.ts).
//   npm run guarantees            all sizes
//   npm run guarantees -- large   one size
import { CHECKS, CHECK_IDS } from '../src/mapChecks.ts';
import { MAP_LIMITS } from '../src/mapRules.ts';
import { MAP_SIZES, type MapSizeKey } from '../src/rules.ts';

const sizes = (process.argv[2] ? [process.argv[2]] : Object.keys(MAP_SIZES)) as MapSizeKey[];
for (const size of sizes) {
  console.log(`\n${MAP_SIZES[size].name} map`);
  for (const id of CHECK_IDS) {
    const g = CHECKS[id];
    console.log(`  ${id.padEnd(3)} ${g.title}\n      ${g.rule(MAP_LIMITS[size])}`);
  }
}
