# Renders textured models (glb) from the front, side, back and three-quarter,
# to judge generated 3D: one PNG per model and view, and each model's triangles:
#   Blender -b --factory-startup -P scripts/blender/turntable.py -- <out dir> <a.glb> [<b.glb> ...]
import bpy, sys, os, math, json
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
out, files = a[0], a[1:]
os.makedirs(out, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x, scene.render.resolution_y = 300, 400
world = bpy.data.worlds.new('w'); scene.world = world; world.color = (0.82, 0.82, 0.82)
counts = {}
for k, f in enumerate(files):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    bpy.ops.import_scene.gltf(filepath=f)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    counts[f] = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo, hi = Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
    mid, size = (lo + hi) / 2, max(hi - lo)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 1.1
    for name, deg in (('front', 0), ('side', 90), ('back', 180), ('three', 35)):
        r = math.radians(deg)
        cam.location = mid + Vector((math.sin(r) * size * 3, -math.cos(r) * size * 3, 0)); cam.rotation_euler = (math.pi / 2, 0, r)
        scene.render.filepath = os.path.join(out, f'{k}_{name}.png'); bpy.ops.render.render(write_still=True)
json.dump(counts, open(os.path.join(out, 'tris.json'), 'w'), indent=1)
print('TRIS', json.dumps(counts))
