# The wonders' statues (src/wonders/statues.ts) from the Meshy models in
# assets/wonders: each FBX read by Blender, welded and triangulated, turned
# to the game's axes (y up, the front +z), trimmed to the figure, its base at
# y = 0 and its feet (or pedestal) centred; then packed as int16 vertices and
# uint16 triangles in base64.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/statues.py

import base64, os, struct
import bpy, bmesh, mathutils

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'wonders')

# name, file, what to keep: 'all'; 'cut' (only above that fraction of its
# height: the figure off the pedestal Meshy gave it, the game's own pedestal
# under it); 'cristo' (the figure and the block right under it, not the rest
# of the summit that came with it).
STATUES = [
    ('COLOSSUS', 'Meshy_AI_Torchbearer_of_the_Sea_20261109_generate.fbx', ('cut', 0.12)),
    ('ZEUS', 'Meshy_AI_Throne_of_the_Thunder_King_20261109_generate.fbx', ('all',)),
    ('LIBERTY', 'Meshy_AI_Liberty_at_Twilight_20261109_generate.fbx', ('cut', 0.44)),
    ('CRISTO', 'Meshy_AI_Christ_the_Redeemer_20261110_generate (1).fbx', ('cristo',)),
    ('SAGRADA', 'Meshy_AI_Sagrada_Familia_Miniature_20261110_generate.fbx', ('largest',)),
]


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    o = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(o.matrix_world)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.verts.ensure_lookup_table()
    return bm


def islands(bm):
    seen, parts = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], set()
        seen.add(v.index)
        while stack:
            x = stack.pop()
            comp.add(x.index)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        parts.append(comp)
    return sorted(parts, key=len, reverse=True)


def mesh(name, keep):
    bm = load(os.path.join(SRC, name))
    # (Blender's z up, front -y: the game's y up, front +z.)
    verts = [(v.co.x, v.co.z, -v.co.y) for v in bm.verts]
    tris = [[v.index for v in f.verts] for f in bm.faces]
    h0 = min(v[1] for v in verts)
    h = max(v[1] for v in verts) - h0
    if keep[0] == 'cut':
        c = h0 + keep[1] * h
        tris = [t for t in tris if max(verts[i][1] for i in t) > c and min(verts[i][1] for i in t) >= c - 0.004 * h]
    elif keep[0] == 'largest':
        # (The building alone: the trees and flowers dotted round it are loose pieces of their own.)
        body = islands(bm)[0]
        tris = [t for t in tris if all(i in body for i in t)]
    elif keep[0] == 'cristo':
        parts = islands(bm)
        body, block = parts[0], parts[1]
        # (The block under the figure: the top of the summit piece, between its arms' width.)
        under = lambda t: all(i in block and abs(verts[i][0]) < 0.13 and verts[i][1] > -0.345 for i in t)
        tris = [t for t in tris if all(i in body for i in t) or under(t)]
    used = sorted({i for t in tris for i in t})
    at = {o: k for k, o in enumerate(used)}
    verts = [verts[i] for i in used]
    y0 = min(v[1] for v in verts)
    foot = [v for v in verts if v[1] < y0 + 0.05 * h]
    cx = (min(v[0] for v in foot) + max(v[0] for v in foot)) / 2
    cz = (min(v[2] for v in foot) + max(v[2] for v in foot)) / 2
    return [(x - cx, y - y0, z - cz) for x, y, z in verts], [[at[i] for i in t] for t in tris]


out = [
    '// The statues of the wonders that are figures (the Colossus, Zeus on his',
    '// throne, Liberty, Christ the Redeemer): meshes the author made with Meshy',
    '// (assets/wonders), packed by scripts/statues.py: do not edit by hand.',
    '// Each: its vertices as int16 (x, y, z; times s, the base at y = 0, the',
    '// front +z) and its triangles as uint16 indices, both base64.',
    '',
    'export interface StatueMesh { readonly s: number; readonly pos: string; readonly idx: string }',
    '',
]
for key, name, keep in STATUES:
    verts, tris = mesh(name, keep)
    s = max(abs(c) for v in verts for c in v) / 32767
    pos = b''.join(struct.pack('<hhh', *[round(c / s) for c in v]) for v in verts)
    idx = b''.join(struct.pack('<HHH', *t) for t in tris)
    out.append(f"export const {key}: StatueMesh = {{\n  s: {s!r},\n  pos: '{base64.b64encode(pos).decode()}',\n  idx: '{base64.b64encode(idx).decode()}',\n}};")
    print('STATUE', key, len(verts), 'vertices', len(tris), 'triangles')
with open(os.path.join(ROOT, 'src', 'wonders', 'statues.ts'), 'w') as f:
    f.write('\n'.join(out) + '\n')
