# Contact sheets of the images scripts/imagegen/batch.py has made, to pick from:
# one per asset (every image of it so far, numbered by round) and one overview
# (each asset's latest image, labelled with its id). Run with the imagegen
# environment:
#   python scripts/imagegen/sheets.py   ->  assets/ai/images/gen/_sheets/
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / 'assets/ai/images/gen'
OUT = GEN / '_sheets'
OUT.mkdir(exist_ok=True)
CELL = 256

def sheet(items: list[tuple[str, Path]], cols: int, path: Path) -> None:
    """A grid of the images, each fitted in a CELL square on white, its label under it."""
    rows = (len(items) + cols - 1) // cols
    img = Image.new('RGB', (cols * CELL, rows * (CELL + 18)), 'white')
    d = ImageDraw.Draw(img)
    for k, (label, p) in enumerate(items):
        im = Image.open(p).convert('RGB'); im.thumbnail((CELL, CELL))
        x, y = (k % cols) * CELL, (k // cols) * (CELL + 18)
        img.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
        d.text((x + 4, y + CELL + 2), label, fill='black')
    img.save(path)

ids = sorted([p for p in GEN.iterdir() if p.is_dir() and not p.name.startswith('_')], key=lambda p: (p.name[0], int(p.name[1:])))
latest = []
for d in ids:
    files = sorted(d.glob('r*.png'))
    if not files: continue
    sheet([(f.stem, f) for f in files], 8, OUT / f'{d.name}.png')
    latest.append((f'{d.name} ({len(files)})', files[-1]))
if latest: sheet(latest, 10, OUT / '_overview.png')
print(f'{len(latest)} assets, {sum(len(list(d.glob("r*.png"))) for d in ids)} images -> {OUT}')
