# Surface textures

Scanned materials from [ambientCG](https://ambientcg.com), released under
CC0 (public domain). Each was taken at 1K, its colour multiplied by its
ambient occlusion, scaled to 256 px and saved as WebP here (with its GL
normal map). `npm run surfaces` (`scripts/surfaceTextures.ts`) bakes them,
with the painted layers (hair, skin, the face), into the array the game
loads, `public/surfaces/surfaces.png`. The models' shaders use only their
brightness (`src/surfaces.ts`).

| File | ambientCG asset |
|---|---|
| plaster | [Plaster003](https://ambientcg.com/view?id=Plaster003) |
| brick | [Bricks085](https://ambientcg.com/view?id=Bricks085) |
| fieldstone | [Bricks102](https://ambientcg.com/view?id=Bricks102) |
| ashlar | [Bricks066](https://ambientcg.com/view?id=Bricks066) |
| siding | [WoodSiding008](https://ambientcg.com/view?id=WoodSiding008) |
| clayTile | [RoofingTiles014A](https://ambientcg.com/view?id=RoofingTiles014A) |
| slate | [RoofingTiles003](https://ambientcg.com/view?id=RoofingTiles003) |
| shingle | [RoofingTiles013A](https://ambientcg.com/view?id=RoofingTiles013A) |
| thatch | [ThatchedRoof001A](https://ambientcg.com/view?id=ThatchedRoof001A) |
| corrugated | [CorrugatedSteel005](https://ambientcg.com/view?id=CorrugatedSteel005) |
| concrete | [Concrete031](https://ambientcg.com/view?id=Concrete031) |
| cobbles | [PavingStones070](https://ambientcg.com/view?id=PavingStones070) |
| marble | [Marble012](https://ambientcg.com/view?id=Marble012) |
| scales | [RoofingTiles001](https://ambientcg.com/view?id=RoofingTiles001) |
| cloth | [Fabric045](https://ambientcg.com/view?id=Fabric045) |
| leather | [Leather030](https://ambientcg.com/view?id=Leather030) |
| metal | [Metal009](https://ambientcg.com/view?id=Metal009) |
| chainmail | [Chainmail004](https://ambientcg.com/view?id=Chainmail004) |
| wood | [Wood049](https://ambientcg.com/view?id=Wood049) |
| plates | [MetalPlates001](https://ambientcg.com/view?id=MetalPlates001) |
| planks | [Planks023A](https://ambientcg.com/view?id=Planks023A) |
