// The Renaissance era's wonders (wonderModels.ts), each on its 7 × 7 site, in
// site units (kit.ts), the front +z.

import type { Models } from './kit.ts';
import { florenceCathedral, stPeters, temploMayor } from './renaissanceB.ts';
import { forbiddenCity, himejiCastle, stBasils, tajMahal } from './renaissanceA.ts';

export const RENAISSANCE: Models<'tajMahal' | 'stBasils' | 'himejiCastle' | 'forbiddenCity' | 'florenceCathedral' | 'temploMayor' | 'stPeters'> = {
  tajMahal,
  stBasils,
  himejiCastle,
  forbiddenCity,
  florenceCathedral,
  temploMayor,
  stPeters,
};
