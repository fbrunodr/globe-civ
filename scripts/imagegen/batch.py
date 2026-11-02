# Images of every asset in docs/asset-prompts.md, in volume and varied, made
# locally (Z-Image-Turbo through mflux, Apple Silicon; Apache-2.0), for picking
# the best and turning them into 3D. Round after round, each round one new image
# of every asset (so all are covered early), each its own variation of the
# asset's prompt (for a body: the people, build, age, wear; a head: hair,
# beard, age; gear: material, wear, decoration; a horse: its coat), until
# stopped (or `--rounds`). Written to assets/ai/images/gen/<id>/r<round>.png,
# each with its prompt and seed in gen/manifest.jsonl. Run with the imagegen
# environment (~/funspace/imagegen/.venv, mflux):
#   python scripts/imagegen/batch.py [--rounds N] [--only B2,H1,...] [--steps 8]
# Stop it by creating assets/ai/images/gen/STOP (it finishes the image it is on).
import argparse, json, os, random, re, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/ai/images/gen'

ap = argparse.ArgumentParser()
ap.add_argument('--rounds', type=int, default=10**6)
ap.add_argument('--only', default='')
ap.add_argument('--steps', type=int, default=8)
args = ap.parse_args()

# The prompts: each **ID** · used-by line, then its prompt in a code block.
doc = (ROOT / 'docs/asset-prompts.md').read_text()
ASSETS = [(m.group(1), m.group(2).strip()) for m in re.finditer(r'\*\*([A-Z]\d+)\*\*[^\n]*\n```\n(.+?)\n```', doc)]
if args.only: ASSETS = [a for a in ASSETS if a[0] in args.only.split(',')]

PEOPLES = [
    ('a northern European man', 'fair skin', ['light brown hair', 'blond hair', 'red hair', 'dark brown hair']),
    ('a Scandinavian man', 'very fair skin', ['blond hair', 'light red hair']),
    ('a Mediterranean man', 'olive skin', ['dark brown curly hair', 'black hair']),
    ('a West Asian man', 'light brown skin', ['black hair', 'dark brown hair']),
    ('a North African man', 'brown skin', ['short black hair']),
    ('a South Asian man', 'brown skin', ['black hair']),
    ('an East African man', 'dark brown skin', ['short black curly hair']),
    ('a West African man', 'deep dark skin', ['short black hair']),
    ('an East Asian man', 'light tan skin', ['black hair']),
    ('a Central Asian steppe man', 'weathered tan skin', ['black hair']),
    ('a Mesoamerican man', 'copper-brown skin', ['straight black hair']),
]
BUILDS = ['lean athletic build', 'stocky muscular build', 'tall wiry build', 'broad-shouldered build', 'average build']
AGES = ['in his twenties', 'in his thirties', 'in his forties', 'young']
WEAR = ['clean new clothing', 'worn, patched clothing', 'battle-worn, scuffed clothing', 'well-kept clothing with fine stitching']
POSE = 'standing in a clear A-pose, both arms held straight out and down at 45 degrees from the body, hands open and away from the hips, feet shoulder-width apart, symmetric, facing the viewer, no jewelry, no necklace'
BEARDS = ['clean-shaven', 'short stubble', 'short beard', 'full beard', 'moustache']
HAIRCUTS = ['short hair', 'hair tied back', 'cropped hair', 'shaved head', 'hair in a bun']
METALS = ['bronze', 'polished bronze', 'dark iron', 'weathered steel', 'bright steel']
MATERIAL_WEAR = ['brand new', 'lightly worn', 'battle-worn with dents and scratches', 'old and weathered']
DECOR = ['plain', 'with simple engraved lines', 'with a decorated rim', 'with rivets']
COATS = ['bay', 'chestnut', 'black', 'dapple grey', 'white', 'dun', 'dark brown']
STYLE = 'game asset concept art, clean even studio lighting, no shadow on the background, the whole subject in frame with margin all round'

def vary(aid: str, prompt: str, rng: random.Random) -> str:
    """One variation of an asset's prompt."""
    kind = aid[0]
    if kind == 'B':
        who, skin, hairs = rng.choice(PEOPLES)
        if 'woman' in prompt: who = who.replace('man', 'woman')
        p = prompt.replace('short cropped hair, clean-shaven, medium skin tone', f'{skin}, {rng.choice(hairs)} cropped short, {rng.choice(BEARDS) if "woman" not in prompt else "no facial hair"}')
        p = p.replace('hair tied in a bun, medium skin tone', f'{skin}, {rng.choice(hairs)} tied in a bun')
        p = p.replace('realistic proportions', f'realistic proportions, {who}, {rng.choice(AGES)}, {rng.choice(BUILDS)}')
        p = p.replace('A-pose', POSE)
        return f'{p}, {rng.choice(WEAR)}, {STYLE}'
    if kind in 'HF':
        p = re.sub(r'(short |straight |hair )?[^,]*hair[^,]*', lambda m: m.group(0) if rng.random() < 0.5 else rng.choice(HAIRCUTS), prompt, count=1)
        if kind == 'H' and rng.random() < 0.5: p = re.sub(r'(clean-shaven|short beard|full [^,]*beard|thin [^,]*moustache|moustache)', rng.choice(BEARDS), p, count=1)
        return f'{p}, {rng.choice(AGES).replace("his", "her") if kind == "F" else rng.choice(AGES)}, {STYLE}'
    if kind in 'GPS':
        p = prompt
        for metal in ('bronze', 'steel', 'iron'):
            if metal in p and rng.random() < 0.6: p = p.replace(metal, rng.choice(METALS), 1); break
        return f'{p}, {rng.choice(MATERIAL_WEAR)}, {rng.choice(DECOR)}, {STYLE}'
    if kind == 'M':
        return f'{prompt.replace("brown riding horse", f"{rng.choice(COATS)} riding horse")}, {STYLE}'
    return f'{prompt}, {STYLE}'

def size(aid: str) -> tuple[int, int]:
    """Width, height: figures and weapons tall, heads, helmets and shields square, horses wide."""
    return {'B': (768, 1024), 'P': (640, 1024), 'M': (1024, 768)}.get(aid[0], (832, 832))

from mflux.models.common.config.model_config import ModelConfig
from mflux.models.z_image.variants.z_image import ZImage
model = ZImage(quantize=8, model_config=ModelConfig.z_image_turbo())
OUT.mkdir(parents=True, exist_ok=True)
manifest = (OUT / 'manifest.jsonl').open('a')
start = time.time(); n = 0
for rnd in range(args.rounds):
    for aid, prompt in ASSETS:
        if (OUT / 'STOP').exists(): print('stopped'); raise SystemExit
        path = OUT / aid / f'r{rnd:03d}.png'
        if path.exists(): continue
        rng = random.Random(f'{aid}-{rnd}')
        p, seed = vary(aid, prompt, rng), rng.randrange(2**31)
        w, h = size(aid)
        path.parent.mkdir(parents=True, exist_ok=True)
        model.generate_image(seed=seed, prompt=p, width=w, height=h, num_inference_steps=args.steps).save(path=str(path))
        manifest.write(json.dumps({'id': aid, 'round': rnd, 'seed': seed, 'w': w, 'h': h, 'steps': args.steps, 'prompt': p, 'file': str(path.relative_to(ROOT))}) + '\n'); manifest.flush()
        n += 1
        print(f'{aid} r{rnd:03d}  {n} images, {(time.time() - start) / n:.1f} s each', flush=True)
