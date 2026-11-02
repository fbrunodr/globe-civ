# A base human from MPFB (MakeHuman for Blender; its humans are CC0), its
# joints from the game-engine rig: the shape the units' bodies and heads
# are built round (scripts/blender/figure.py). Run headless:
#   Blender -b --factory-startup -P scripts/blender/human.py -- <out_dir> [gender age muscle weight asian caucasian african]
import bpy, sys, os, json, addon_utils

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
vals = [float(x) for x in args[1:]] or [1.0, 0.5, 0.6, 0.5, 0.0, 1.0, 0.0]
addon_utils.enable('bl_ext.blender_org.mpfb', default_set=True)
from bl_ext.blender_org.mpfb.services.humanservice import HumanService

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
g, age, muscle, weight, asian, cauc, afr = vals
macro = {'gender': g, 'age': age, 'muscle': muscle, 'weight': weight, 'proportions': 0.5, 'height': 0.5, 'cupsize': 0.5, 'firmness': 0.5,
         'race': {'asian': asian, 'caucasian': cauc, 'african': afr}}
human = HumanService.create_human(scale=0.1, macro_detail_dict=macro)
rig = HumanService.add_builtin_rig(human, 'game_engine', import_weights=True)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
ev = human.evaluated_get(dg)
me = ev.to_mesh()
# (Only the body: the helpers (the eyes' and the clothes' guides) masked off.)
vs = [tuple(ev.matrix_world @ v.co) for v in me.vertices]
fs = [list(p.vertices) for p in me.polygons]
joints = {b.name: [list(rig.matrix_world @ b.head_local), list(rig.matrix_world @ b.tail_local)] for b in rig.data.bones}
os.makedirs(out, exist_ok=True)
with open(os.path.join(out, 'human.json'), 'w') as f:
    json.dump({'macro': macro, 'verts': vs, 'faces': fs, 'joints': joints}, f)
print('HUMAN', len(vs), 'verts', len(fs), 'faces', 'height', max(v[2] for v in vs) - min(v[2] for v in vs), 'bones', list(joints)[:60])
