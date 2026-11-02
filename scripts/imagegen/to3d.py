# Every image scripts/imagegen/batch.py makes, turned into a low-poly textured
# model as it comes (Stable Fast 3D: Stability AI Community Licence, free under
# $1M a year), watching for new ones until stopped: about 800 triangles
# (TARGET_VERTICES), its texture baked at TEXTURE px. On the CPU: SF3D's Apple
# GPU path crashes; the CPU is quick enough (~16 s) and leaves the GPU to the
# images. Written to assets/ai/models3d/<id>/r<round>.glb (with the cut-out
# input beside it). Run with SF3D's environment:
#   ~/funspace/stable-fast-3d/.venv/bin/python scripts/imagegen/to3d.py
# Stop it by creating assets/ai/models3d/STOP.
import os, sys, time
from pathlib import Path

SF3D = Path.home() / 'funspace/stable-fast-3d'
sys.path.insert(0, str(SF3D))
import rembg, torch
from PIL import Image
from sf3d.system import SF3D as Model
from sf3d.utils import remove_background, resize_foreground

ROOT = Path(__file__).resolve().parents[2]
GEN, OUT = ROOT / 'assets/ai/images/gen', ROOT / 'assets/ai/models3d'
TARGET_VERTICES, TEXTURE = 450, 1024

model = Model.from_pretrained('stabilityai/stable-fast-3d', config_name='config.yaml', weight_name='model.safetensors')
model.to('cpu'); model.eval()
session = rembg.new_session()
OUT.mkdir(parents=True, exist_ok=True)
n, start = 0, time.time()
while not (OUT / 'STOP').exists():
    todo = [p for p in sorted(GEN.glob('[A-Z]*/r*.png')) if not (OUT / p.parent.name / f'{p.stem}.glb').exists()]
    if not todo: time.sleep(20); continue
    src = todo[0]
    dst = OUT / src.parent.name / f'{src.stem}.glb'
    dst.parent.mkdir(parents=True, exist_ok=True)
    image = resize_foreground(remove_background(Image.open(src).convert('RGBA'), session), 0.85)
    image.save(dst.with_suffix('.input.png'))
    with torch.no_grad():
        mesh, _ = model.run_image([image], bake_resolution=TEXTURE, remesh='triangle', vertex_count=TARGET_VERTICES)
    (mesh[0] if isinstance(mesh, list) else mesh).export(str(dst), include_normals=True)
    n += 1
    print(f'{src.parent.name}/{src.stem}  {n} models, {(time.time() - start) / n:.1f} s each', flush=True)
