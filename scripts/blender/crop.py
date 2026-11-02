# Crops a review sheet (scripts/blender/figure.py: four rows, bottom up: the
# human's views, the figure's, the human's head, the figure's head):
#   Blender -b --factory-startup -P scripts/blender/crop.py -- <review.png> <out.png> [heads|figure]
# heads: both head rows; figure: the figure's views alone.
import bpy, sys, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]
src, out, part = a[0], a[1], a[2] if len(a) > 2 else 'heads'
im = bpy.data.images.load(src); w, h = im.size
px = np.array(im.pixels[:]).reshape(h, w, 4)
px = px[h // 2:] if part == 'heads' else px[h // 4: h // 2]
o = bpy.data.images.new('c', w, px.shape[0], alpha=True); o.pixels = px.ravel().tolist(); o.filepath_raw = out; o.file_format = 'PNG'; o.save()
