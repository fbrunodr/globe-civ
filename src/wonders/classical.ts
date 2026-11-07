// The Classical era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z.

import type { Models } from './kit.ts';
import { colosseum, greatLibrary, parthenon, persepolis, terracottaArmy } from './classicalA.ts';
import { colossus, mausoleum, petra, statueOfZeus, templeOfSolomon } from './classicalB.ts';

export const CLASSICAL: Models<'parthenon' | 'persepolis' | 'colosseum' | 'greatLibrary' | 'terracottaArmy' | 'petra' | 'colossus' | 'mausoleum' | 'statueOfZeus' | 'templeOfSolomon'> = {
  parthenon,
  persepolis,
  colosseum,
  greatLibrary,
  terracottaArmy,
  petra,
  colossus,
  mausoleum,
  statueOfZeus,
  templeOfSolomon,
};
