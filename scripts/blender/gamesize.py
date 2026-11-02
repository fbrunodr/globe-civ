# A figure (scripts/blender/figure.py's glb files) as the game shows it: a
# few of them in a row, seen from the units' camera (high, looking down),
# about as big as on screen (some 40 px tall), and blown up 4x, pixel for
# pixel, to look at:
#   Blender -b --factory-startup -P scripts/blender/gamesize.py -- <out.png> <a.glb> [<b.glb> ...]
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
out, files = a[0], a[1:]
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
for f in files: bpy.ops.import_scene.gltf(filepath=f)
parts = [o for o in bpy.data.objects if o.type == 'MESH']
cols = {'skirt': (0.75, 0.15, 0.15, 1), 'crest': (0.75, 0.15, 0.15, 1), 'helmet': (0.7, 0.55, 0.25, 1), 'torso': (0.45, 0.3, 0.18, 1)}
for o in parts: o.color = cols.get(o.name.split('.')[0], (0.8, 0.6, 0.45, 1))
# (Five of them in a row, a little apart.)
for i in range(1, 5):
    for o in parts:
        c = o.copy(); c.data = o.data; c.location.x += i * 0.7; c.location.y += (i % 2) * 0.4; bpy.context.collection.objects.link(c)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'OBJECT'
world = bpy.data.worlds.new('w'); scene.world = world; world.color = (0.45, 0.5, 0.35)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50
cam.location = (1.4, -7.5, 6.0); cam.rotation_euler = (math.radians(52), 0, 0)
scene.render.resolution_x, scene.render.resolution_y = 220, 110
scene.render.filepath = out; bpy.ops.render.render(write_still=True)
# (Blown up 4x, each pixel a block, to look at.)
import numpy as np
img = bpy.data.images.load(out); w, h = img.size
px = np.array(img.pixels[:]).reshape(h, w, 4).repeat(4, axis=0).repeat(4, axis=1)
big = bpy.data.images.new('big', w * 4, h * 4, alpha=True); big.pixels = px.ravel().tolist(); big.filepath_raw = out; big.file_format = 'PNG'; big.save()
