# Globe Civ

A Civilization-style 4X game played on a **Goldberg polyhedron**: a sphere
tiled with hexagons plus exactly 12 pentagons. A globe of frequency `n` has
`10n² + 2` tiles.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # strict TypeScript, no emit
npm test           # unit tests + every map guarantee on 1,000 maps per size (~20 s)
npm run mapcheck    # deep check: 30,000 random maps per size, all CPU cores
npm run guarantees                  # print every map guarantee with its limits
npm run shots -- <dir> --sheet      # render fixed reference scenes for before/after review
npm run paintcheck                  # the shader paints with the same noise as paint.ts (headless Chrome)
npm run build
```

## Map guarantees

Every generated map must satisfy a set of rules (continents, connected seas,
polar caps, feature counts and spacing, fair starts, ...). Each rule is written
once, in `src/mapChecks.ts`: a title, a description built from the live limits
in `src/mapRules.ts`, and the check itself. `npm run guarantees` prints them.
The generator meets almost all of them by construction; if a seed cannot, it
retries with a seed derived deterministically from the original (`src/world.ts`).
Seeds that ever fail the deep check are saved in `test/regressions.json` and
re-run by `npm test` forever.

## Terrain painting

Tiles are the game truth; what is drawn is derived from them (`src/paint.ts`).
Every tile border becomes a wobbly curve inside a thin band around the real
edge, so each tile's core is 100% its own terrain and every tile keeps at least
75% of its area. Relief is one height field (`src/relief.ts`): mountain ranges
follow a ridge skeleton between adjacent mountain tiles, and rivers carve
shallow valleys. Rivers are drawn along the painted borders with rounded turns
(`src/riverCurve.ts`). These promises (P1–P9) are tested in
`test/paint.test.ts` and `npm run paintcheck`. All of it is a pure function of
the seed, so reloads look identical.

URL params: `?seed=123`, `?size=small|medium|large`, `?reveal` (debug: show the whole map).

## Map sizes (matched to Civ VI)

| Size   | n  | Tiles | Civs | Civ VI equivalent           |
|--------|----|-------|------|-----------------------------|
| Small  | 17 | 2,892 | 6    | Small 66×42 = 2,772         |
| Medium | 21 | 4,412 | 8    | Standard 84×54 = 4,536      |
| Large  | 24 | 5,762 | 10   | Large 96×60 = 5,760         |

## Code layout

| File                     | Responsibility                                                     |
|--------------------------|--------------------------------------------------------------------|
| `src/goldberg.ts`        | Builds the polyhedron: tiles, ordered corners, neighbors            |
| `src/mapgen.ts`          | Continents, elevation, climate (°C, mm rain, wind, rain shadow), drainage, biomes, features |
| `src/mapRules.ts`        | Map definitions (continent, world ocean, ...) and limits per size  |
| `src/mapChecks.ts`       | One pure check per map guarantee                                    |
| `src/rivers.ts`          | Rivers along tile edges: priority-flood drainage over tile corners  |
| `src/starts.ts`          | Fair start placement                                                |
| `src/world.ts`           | Map + starts + validation, with deterministic retries               |
| `src/terrain.ts`         | Terrain gameplay: biome × relief × feature, yields, movement, defense |
| `src/rules.ts`           | Units, buildings, civs, map sizes                                   |
| `src/game.ts`            | Game state and rules (no rendering): movement, A*, combat, cities, turns, fog |
| `src/ai.ts`              | Simple AI opponents                                                 |
| `src/look.ts`            | How each terrain looks: colors, rock, heights, shader detail, props |
| `src/paint.ts`           | Terrain painting: wobbly tile borders, pair rules, per-pixel weights |
| `src/relief.ts`          | Height field: ridges, hill bumps, river valleys                     |
| `src/riverCurve.ts`      | Drawn river courses: painted borders plus rounded turns             |
| `src/terrainMesh.ts`     | Watertight globe mesh (finer on hills and mountains), split per fan |
| `src/terrainMaterial.ts` | Terrain shader: painting, hex grid, procedural detail, bump, water, fog |
| `src/props.ts`           | Low-poly trees, shrubs, palms, reeds                                |
| `src/render.ts`          | Three.js scene, units, cities, borders, picking                     |
| `src/ui.ts`              | HTML panels and typed player actions                                |
| `src/main.ts`            | Start screen, input, wiring                                         |

Debug URL params: `?reveal` shows the whole map; `?look=jungle` (any biome, relief or feature key; combine with `+`, e.g. `?look=coldDesert+hills`) flies the camera to the first match.
