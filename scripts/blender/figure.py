# The units' figure, built low-poly round a base human (scripts/blender/human.py):
# rings round each part (the torso, the neck, each arm, hand, leg and foot,
# the head), each ring's corners where rays from the part's line out meet
# the human's skin; the parts as separate pieces, as the units' shader moves
# them (each limb whole about its joint). The neck ends in the standard
# ring (NECK_SIDES corners round, the same ellipse on every body and head),
# where a head is set on a body. Run headless:
#   Blender -b --factory-startup -P scripts/blender/figure.py -- <human dir> <out dir>
# Writes <out>/body.glb, <out>/head.glb (Y up, facing +Z, 1 m units) and
# <out>/review.png (the figure beside the human it was built round: front,
# side, back, three-quarter) plus <out>/report.json (triangles, silhouette
# overlap with the human, front and side).
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
# (How it is dressed: '' bare; 'b2' an ancient soldier (docs/asset-prompts.md): a
# leather cuirass over a tunic, short sleeves, the tunic's skirt to mid-thigh, a crested helmet.)
DRESS = args[2] if len(args) > 2 else ''
os.makedirs(out, exist_ok=True)
H = json.load(open(os.path.join(src, 'human.json')))
J = {k: (Vector(v[0]), Vector(v[1])) for k, v in H['joints'].items()}
skin = BVHTree.FromPolygons([Vector(v) for v in H['verts']], H['faces'])
TALL = max(v[2] for v in H['verts'])

# The skin split by part: each corner to the bone it is nearest (less how
# thick that part is, so a thick part claims what is near it), each face to
# its corners' part; a part's rings meet only its own skin.
PARTS = {'torso': ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'], 'neck': ['neck_01'], 'head': ['head']}
for s_ in 'lr':
    PARTS.update({f'upperarm_{s_}': [f'upperarm_{s_}'], f'lowerarm_{s_}': [f'lowerarm_{s_}'], f'hand_{s_}': [b for b in J if b.endswith('_' + s_) and (b.startswith('hand') or b.split('_')[0] in ('index', 'middle', 'ring', 'pinky', 'thumb'))],
                  f'thigh_{s_}': [f'thigh_{s_}'], f'calf_{s_}': [f'calf_{s_}'], f'foot_{s_}': [f'foot_{s_}', f'ball_{s_}']})
THICK = {'torso': 0.13, 'neck': 0.05, 'head': 0.09, 'upperarm': 0.045, 'lowerarm': 0.04, 'hand': 0.025, 'thigh': 0.08, 'calf': 0.055, 'foot': 0.04}
def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared))); return (p - (a + ab * t)).length
verts = [Vector(v) for v in H['verts']]
segs = [(part, J[b][0], J[b][1], THICK[part.split('_')[0]]) for part, bones in PARTS.items() for b in bones]
label = [min(segs, key=lambda sg: seg_dist(p, sg[1], sg[2]) - sg[3])[0] for p in verts]
from collections import Counter
part_faces = {}
for f in H['faces']:
    part_faces.setdefault(Counter(label[i] for i in f).most_common(1)[0][0], []).append(f)
SKIN = {part: BVHTree.FromPolygons(verts, fs) for part, fs in part_faces.items()}
# (The torso's skin takes in the neck's, for its top.)
SKIN['torso'] = BVHTree.FromPolygons(verts, part_faces['torso'] + part_faces.get('neck', []))
SKIN['head'] = BVHTree.FromPolygons(verts, part_faces['head'] + part_faces.get('neck', []))
# (The hips: the torso's skin and the thighs' tops, so its lowest rings wrap both legs.)
SKIN['hips'] = BVHTree.FromPolygons(verts, part_faces['torso'] + part_faces['thigh_l'] + part_faces['thigh_r'])

NECK_SIDES, NECK_RX, NECK_RY = 12, 0.032, 0.0245  # (of the figure's height: the standard ring, a man's neck under the jaw)

for o in list(bpy.data.objects): bpy.data.objects.remove(o)

PART = None  # (the part being built: its own skin; None: all of it)
def hit(o, d, far=0.4):
    """How far out from o, along d, the skin is (the nearest of it, from inside)."""
    loc, nrm, idx, dist = (SKIN[PART] if PART else skin).ray_cast(o, d, far)
    return dist

def frame(axis, front=Vector((0, -1, 0))):
    """Two directions square to the line `axis`: one towards the front, one to the side."""
    a = axis.normalized()
    f = (front - a * front.dot(a))
    if f.length < 1e-4: f = Vector((1, 0, 0)) - a * a.x
    f.normalize()
    return f, a.cross(f).normalized()

def ring(o, axis, n, phase=0.0, scale=1.0, pad=0.0, front=Vector((0, -1, 0)), last=None, recentre=True, clamp=None, smooth=0.85):
    """A ring of n corners round the line through o along axis, on the skin
    (pushed out by pad); first moved to the middle of the part there (between
    its skin in front and behind, either side), as a bone runs off its middle.
    `clamp`: no corner farther out to either side than that from x = 0."""
    f, s = frame(axis, front)
    if recentre:
        for d in (f, s):
            a, b = hit(o, d), hit(o, -d)
            if a is not None and b is not None: o = o + d * ((a - b) / 2)
    dirs = [(f * math.cos((k + phase) / n * math.tau) + s * math.sin((k + phase) / n * math.tau)).normalized() for k in range(n)]
    rs = []
    for k, d in enumerate(dirs):
        r = hit(o, d)
        if r is None: r = (last[k] - o).length if last and len(last) == n else None
        rs.append(r)
    known = [r for r in rs if r is not None] or [0.03]
    rs = [r if r is not None else sum(known) / len(known) for r in rs]
    # (No corner sunk well below those either side: holes in the skin (the eyes', set
    # in separately) and deep folds filled, as a low shape should be.)
    rs = [max(r, smooth * (rs[k - 1] + rs[(k + 1) % n]) / 2) for k, r in enumerate(rs)]
    pts = []
    for k, d in enumerate(dirs):
        r = rs[k]
        p = o + d * (r * scale + pad)
        if clamp is not None and abs(p.x) > clamp: p = o + d * ((clamp - abs(o.x)) / max(1e-6, abs(d.x)))
        pts.append(p)
    return pts

def tube(name, rings, cap0=True, cap1=True):
    """A mesh of the rings joined in order, capped at either end (True: flat;
    a point: a fan to it). Rings of different counts are zipped, each corner
    to the nearest round the line."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    for a, b in zip(vs, vs[1:]):
        n, m = len(a), len(b)
        if n == m:
            for k in range(n): bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
            continue
        i = j = 0
        while i < n or j < m:
            if j >= m or (i < n and (i + 1) / n <= (j + 1) / m): bm.faces.new((a[i % n], a[(i + 1) % n], b[j % m])); i += 1
            else: bm.faces.new((a[i % n], b[(j + 1) % m], b[j % m])); j += 1
    for cap, r, flip in ((cap0, vs[0], True), (cap1, vs[-1], False)):
        if cap is True: bm.faces.new(list(reversed(r)) if flip else r)
        elif cap:
            c = bm.verts.new(cap)
            for k in range(len(r)): bm.faces.new((r[(k + 1) % len(r)], r[k], c) if flip else (r[k], r[(k + 1) % len(r)], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob

def lerp(a, b, t): return a + (b - a) * t
def along(bone, t): h, tl = J[bone]; return lerp(h, tl, t)
def mid_x(p): return Vector((0, p.y, p.z))

# The torso: up the spine, from the crotch to the base of the neck. (Rays
# level, from the spine's line: the nearest skin, so not the arms.)
UP = Vector((0, 0, 1))
spine = [J['pelvis'][0], J['spine_01'][0], J['spine_02'][0], J['spine_03'][0], J['spine_03'][1], J['neck_01'][0]]
def spine_at(z):
    for a, b in zip(spine, spine[1:]):
        if a.z <= z <= b.z: return lerp(a, b, (z - a.z) / max(1e-6, b.z - a.z))
    return spine[0] if z < spine[0].z else spine[-1]
hip = J['thigh_l'][0].z
# (Over the chest, no wider than the shoulders' joints: past them is the arm.)
shoulder = J['upperarm_l'][0].x - 0.02
levels = [hip - 0.06, hip - 0.025, hip + 0.02] + ([J['spine_01'][0].z - 0.012] if DRESS == 'b2' else []) + [ J['spine_01'][0].z, J['spine_02'][0].z, J['spine_03'][0].z + 0.04,
          J['spine_03'][0].z + 0.1, J['spine_03'][1].z + 0.03, J['clavicle_l'][0].z - 0.02, J['neck_01'][0].z - 0.005]
PART = 'torso'
torso_rings = []
for z in levels:
    c = mid_x(spine_at(z)); c.z = z
    PART = 'hips' if z < J['spine_01'][0].z else 'torso'
    # (The cuirass: the torso itself, pushed out over it, from the waist up to the collar.)
    # (Its lower edge standing off, flared: the cuirass ends there, over the tunic.)
    pad = (0.026 if z < J['spine_01'][0].z else 0.012) if DRESS == 'b2' and J['spine_01'][0].z - 0.015 < z < J['neck_01'][0].z - 0.02 else 0.0
    torso_rings.append(ring(c, UP, 12, last=torso_rings[-1] if torso_rings else None, clamp=shoulder + 0.03 + pad, pad=pad))
# (The crotch: the bottom drawn down to a point between the legs.)
crotch = mid_x(spine_at(hip)); crotch.z = hip - 0.07
# The neck: from the torso's top to the standard ring (under the jaw), round
# the neck's own middle there (not the bone's: it runs near the throat).
nb = lerp(J['neck_01'][0], J['neck_01'][1], 0.3)
PART = None
fy, by = hit(nb, Vector((0, -1, 0))), hit(nb, Vector((0, 1, 0)))
nz = Vector((0, nb.y + (by - fy) / 2, nb.z))
# (Its corners from the front round towards +x, as every ring's.)
std = [Vector((NECK_RX * TALL * math.sin(k / NECK_SIDES * math.tau), nz.y - NECK_RY * TALL * math.cos(k / NECK_SIDES * math.tau), nz.z)) for k in range(NECK_SIDES)]
torso = tube('torso', torso_rings + [std], cap0=crotch, cap1=False)

# The head: from the standard ring up, round its own middle at each height
# (the face and the back of the skull either side), HEAD_SIDES round,
# closed at the crown.
HEAD_SIDES = 16
PART = 'head'
hb, ht = J['head']
top = ht.z - 0.004
import numpy as np
HEADV = np.array([tuple(verts[i]) for i, l in enumerate(label) if l in ('head', 'neck')])
def envelope(z, dz, n, last=None):
    """A ring round the head at height z: in each of n slices round it (from
    the front, towards +x), the skin's farthest point out within dz of z, the
    middle being the middle of the head there. (Not a ray's first hit: the
    eyes' sockets are open, a ray falls in.)"""
    band = HEADV[np.abs(HEADV[:, 2] - z) < dz]
    cy = (band[:, 1].min() + band[:, 1].max()) / 2
    ang = np.arctan2(band[:, 0], -(band[:, 1] - cy)) % math.tau
    rad = np.hypot(band[:, 0], band[:, 1] - cy)
    pts = []
    for k in range(n):
        a = k / n * math.tau
        near = np.abs((ang - a + math.pi) % math.tau - math.pi) < math.pi / n
        # (Towards the face its farthest point (the nose, the chin); round the
        # sides and back where a ray from the middle meets the skin (the scalp
        # behind the ears, not the ears).)
        d = Vector((math.sin(a), -math.cos(a), 0))
        # (The rays from inside the neck or skull, behind the mouth: from the
        # middle, at the mouth's height, they would meet the inside of it.)
        o = Vector((0, max(cy, band[:, 1].max() - 0.06), z))
        ray = skin.ray_cast(o, d, 0.3)[3] if math.cos(a) <= 0.7 else None
        if ray is not None: pts.append(o + d * ray); continue
        r = float(rad[near].max()) if near.any() else ((last[k] - Vector((0, cy, z))).length if last else 0.05)
        pts.append(Vector((math.sin(a) * r, cy - math.cos(a) * r, z)))
    # (No corner sunk well below those either side, out from the middle: where
    # the face's envelope meets the rays, or a ray found a crease.)
    c = Vector((0, cy, z))
    for _ in range(2):
        for k in range(n):
            a_, b_ = pts[k - 1] - c, pts[(k + 1) % n] - c
            want = 0.9 * (a_.length + b_.length) / 2
            v = pts[k] - c
            if v.length < want: pts[k] = c + v * (want / v.length)
    return pts
head_rings = [std]
ts = (0.07, 0.13, 0.19, 0.25, 0.31, 0.37, 0.44, 0.52, 0.6, 0.68, 0.76, 0.83, 0.89, 0.94, 0.975)
for i, t in enumerate(ts):
    z = nz.z + (top - nz.z) * t
    dz = (top - nz.z) * (0.015 if t < 0.3 else 0.03)
    head_rings.append(envelope(z, dz, HEAD_SIDES, last=head_rings[-1] if len(head_rings[-1]) == HEAD_SIDES else None))
crown = Vector((0, sum(p.y for p in head_rings[-1]) / HEAD_SIDES, top + 0.001))
head = tube('head', head_rings, cap0=False, cap1=crown)

# The limbs: rings square to each bone, through it.
def limb(name, segs, n, phase=0.0, pads=None):
    # (A limb's rings meet the whole skin: from inside it, its own is always met first.)
    global PART
    PART = None
    rings = []
    for bone, ts in segs:
        h, t = J[bone]
        for u in ts: rings.append(ring(lerp(h, t, u), t - h, n, phase, last=rings[-1] if rings else None, pad=(pads(u) if pads else 0.0)))
    return tube(name, rings)
for s in 'lr':
    # (The sleeve: the upper arm pushed out over its top half, its hem standing off it.)
    limb(f'upperarm_{s}', [(f'upperarm_{s}', (0.05, 0.3, 0.45, 0.47, 0.6, 0.9, 1.04) if DRESS == 'b2' else (0.05, 0.3, 0.6, 0.9, 1.04))], 8, 0.5,
         pads=(lambda u: 0.008 if 0.2 < u <= 0.45 else 0.0) if DRESS == 'b2' else None)
    limb(f'lowerarm_{s}', [(f'lowerarm_{s}', (-0.05, 0.1, 0.4, 0.75, 0.98))], 8, 0.5)
    # (The hand, a mitten: from the wrist to the fingers' middle joints.)
    h0 = J[f'hand_{s}'][0]; tip = J[f'middle_02_{s}'][1]
    PART = f'hand_{s}'
    hand_rings = [ring(lerp(h0, tip, u), tip - h0, 6, 0.5) for u in (0.05, 0.4, 0.75, 0.97)]
    tube(f'hand_{s}', hand_rings)
    limb(f'thigh_{s}', [(f'thigh_{s}', (0.04, 0.2, 0.42, 0.68, 0.92, 1.05))], 8, 0.5)
    limb(f'calf_{s}', [(f'calf_{s}', (-0.07, 0.08, 0.3, 0.6, 0.86, 0.98))], 8, 0.5)
    # (The foot: from the heel to the toes, along the ground.)
    fa, fb = J[f'foot_{s}'][0], J[f'ball_{s}'][1]
    heel = Vector((fa.x, fa.y + 0.05, 0.035)); toe = Vector((fb.x, fb.y - 0.02, 0.03))
    PART = f'foot_{s}'
    foot_rings = [ring(lerp(heel, toe, u) + Vector((0, 0, 0.01 if u < 0.5 else 0.0)), toe - heel, 6, 0.5, front=Vector((0, 0, 1))) for u in (0.02, 0.3, 0.6, 0.85, 0.98)]
    tube(f'foot_{s}', foot_rings)

def outer(c, n, z, part, pad, last=None):
    """A ring round the line up through c at height z, round the outside of
    `part`'s skin (rays in from far out: the skin's outermost, round both legs)."""
    pts = []
    for k in range(n):
        a = k / n * math.tau
        d = Vector((math.sin(a), -math.cos(a), 0))
        o = Vector((c.x, c.y, z)) + d * 0.5
        dist = SKIN[part].ray_cast(o, -d, 0.5)[3]
        r = (0.5 - dist) if dist is not None else ((last[k] - Vector((c.x, c.y, z))).length if last else 0.1)
        pts.append(Vector((c.x, c.y, z)) + d * (r + pad))
    # (Hanging across any hollow (between the legs): no corner in from the line
    # between those either side of it.)
    o = Vector((c.x, c.y, z))
    for _ in range(3):
        for k in range(n):
            a_, b_ = pts[k - 1] - o, pts[(k + 1) % n] - o
            want = (a_.length + b_.length) / 2 * math.cos(math.pi / n)
            v = pts[k] - o
            if v.length < want: pts[k] = o + v * (want / v.length)
    return pts
if DRESS == 'b2':
    # The tunic's skirt: from the waist, round the hips and both thighs, flaring a
    # little to its hem at mid-thigh; open below.
    top_z, hem_z = hip + 0.04, lerp(J['thigh_l'][0], J['thigh_l'][1], 0.5).z
    sk = []
    for i in range(5):
        t = i / 4; z = top_z + (hem_z - top_z) * t
        c = mid_x(spine_at(max(z, spine[0].z)))
        sk.append(outer(c, 16, z, 'hips', 0.025 + 0.012 * t * t, last=sk[-1] if sk else None))
    # (Its hem a little wider still, and level all round.)
    skirt = tube('skirt', sk, cap0=False, cap1=False)
    # The helmet: a shell over the head from the brow up (standing off it), its
    # cheek guards down the sides of the face, the neck guard behind, a crest
    # front to back over the crown.
    helm_rings = []
    for i, r in enumerate(head_rings):
        if r[0].z < nz.z + (top - nz.z) * 0.6: continue
        cy_ = sum(p.y for p in r) / len(r)
        helm_rings.append([Vector((p.x * 1.0, cy_ + (p.y - cy_), p.z)) + (Vector((p.x, p.y - cy_, 0)).normalized() * 0.012) for p in r])
    # (Down the sides and back: the guards, from the brow's ring down to the jaw, open at the face.)
    helm = tube('helmet', helm_rings, cap0=False, cap1=Vector((0, sum(p.y for p in helm_rings[-1]) / len(helm_rings[-1]), top + 0.014)))
    hm = helm.data; bm = bmesh.new(); bm.from_mesh(hm)
    lowest = helm_rings[0]; n = len(lowest)
    guard_depth = (top - nz.z) * 0.36
    # (Guards: the lowest ring's corners round the sides and back, pulled down.)
    ext = []
    vs_low = [v for v in bm.verts if abs(v.co.z - lowest[0].z) < 1e-5]
    for v in vs_low:
        ang = math.atan2(v.co.x, -(v.co.y - sum(p.y for p in lowest) / n))
        if abs(ang) > math.radians(50):
            ext.append(v)
    res = bmesh.ops.extrude_vert_indiv(bm, verts=ext) if False else None
    edges = [e for e in bm.edges if all(v in ext for v in e.verts)]
    ret = bmesh.ops.extrude_edge_only(bm, edges=edges)
    for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
        v.co.z -= guard_depth
        # (The cheek guards curving in over the cheeks, towards the front.)
        if v.co.y < 0: v.co.y -= 0.01; v.co.x *= 0.9
    # The crest: a ridge from the brow over the crown to the back, standing up.
    crest_h, crest_w = 0.05, 0.02
    path = [p for p in (min(r, key=lambda q: abs(q.x) + (q.y > 0)) for r in helm_rings)]
    front_path = sorted([min(r, key=lambda q: abs(q.x) - q.y * 0) for r in helm_rings], key=lambda p: p.z)
    bm.to_mesh(hm); bm.free()
    # (The crest as its own piece: a fin along the helmet's middle line, front to back over the top.)
    mid = []
    for a in range(0, 181, 30):
        t = math.radians(a)
        d = Vector((0, -math.cos(t), math.sin(t)))
        o = Vector((0, sum(p.y for p in helm_rings[0]) / n, helm_rings[0][0].z))
        dist = None
        hb2 = BVHTree.FromObject(helm, bpy.context.evaluated_depsgraph_get())
        far = o + d * 0.4
        h2 = hb2.ray_cast(far, -d, 0.4)
        if h2[3] is not None: mid.append(far - d * h2[3])
    crest_rings = []
    for i, p in enumerate(mid):
        d = (p - Vector((0, sum(q.y for q in helm_rings[0]) / n, helm_rings[0][0].z))).normalized()
        hgt = crest_h * math.sin(math.pi * (0.15 + 0.7 * i / max(1, len(mid) - 1)))
        crest_rings.append([p + Vector((-crest_w, 0, 0)), p + Vector((crest_w, 0, 0)), p + Vector((crest_w * 0.6, 0, 0)) + d * hgt, p + Vector((-crest_w * 0.6, 0, 0)) + d * hgt])
    tube('crest', crest_rings)

body_parts = [o for o in bpy.data.objects if o.name not in ('head', 'helmet', 'crest')]
tris = {o.name: len(o.data.polygons) for o in bpy.data.objects}

# Export: glTF, Y up, facing +Z (Blender's -Y front becomes +Z).
def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_yup=True, export_apply=True)
# (Each piece unwrapped, for its texture: Meshy paints to these.)
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02); bpy.ops.object.mode_set(mode='OBJECT')
export(body_parts, os.path.join(out, 'body.glb'))
# (And all of it as one figure, to upload for texturing.)
export([o for o in bpy.data.objects if o.type == 'MESH'], os.path.join(out, 'figure.glb'))
export([head], os.path.join(out, 'head.glb'))
if DRESS == 'b2': export([bpy.data.objects['helmet'], bpy.data.objects['crest']], os.path.join(out, 'helmet.glb'))

# Review: the figure (warm) beside the human (grey), ortho, workbench.
me = bpy.data.meshes.new('human'); me.from_pydata([Vector(v) for v in H['verts']], [], H['faces']); hu = bpy.data.objects.new('human', me)
bpy.context.collection.objects.link(hu)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'OBJECT'; scene.display.shading.show_object_outline = True
scene.display.shading.show_cavity = False
scene.render.resolution_x, scene.render.resolution_y = 520, 760
for o in bpy.data.objects:
    o.color = (0.55, 0.55, 0.58, 1) if o.name == 'human' else {'head': (0.75, 0.55, 0.5, 1), 'skirt': (0.8, 0.2, 0.55, 1), 'helmet': (0.75, 0.6, 0.3, 1), 'crest': (0.8, 0.2, 0.55, 1)}.get(o.name, (0.85, 0.62, 0.45, 1))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); scene.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = TALL * 1.08
views = {'front': 0, 'side': 90, 'back': 180, 'three': 35}
import numpy as np
shots, masks = [], {}
for which in ('figure', 'human'):
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_render = (o.name == 'human') != (which == 'human')
    for name, deg in views.items():
        a = math.radians(deg)
        cam.location = (math.sin(a) * 6, -math.cos(a) * 6, TALL / 2); cam.rotation_euler = (math.pi / 2, 0, a)
        path = os.path.join(out, f'_{which}_{name}.png'); scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path); px = np.array(img.pixels[:]).reshape(img.size[1], img.size[0], 4)
        bg = px[0, 0, :3]; masks[(which, name)] = np.abs(px[:, :, :3] - bg).sum(axis=2) > 0.04
        shots.append((which, name, px)); bpy.data.images.remove(img)
# (Close-ups of the head: the figure's beside the human's, front, side and three-quarter.)
cam.data.ortho_scale = 0.36
head_shots = []
for which in ('figure', 'human'):
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_render = (o.name == 'human') != (which == 'human')
    for name, deg in (('front', 0), ('side', 90), ('three', 35), ('back', 180)):
        a = math.radians(deg)
        cam.location = (math.sin(a) * 6, -math.cos(a) * 6 + J['head'][0].y, J['head'][0].z + 0.02); cam.rotation_euler = (math.pi / 2, 0, a)
        path = os.path.join(out, f'_h_{which}_{name}.png'); scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path); head_shots.append((which, name, np.array(img.pixels[:]).reshape(img.size[1], img.size[0], 4))); bpy.data.images.remove(img); os.remove(path)
iou = {n: float((masks[('figure', n)] & masks[('human', n)]).sum() / max(1, (masks[('figure', n)] | masks[('human', n)]).sum())) for n in ('front', 'side')}
# (The sheet: the figure's four views over the human's.)
w, h = scene.render.resolution_x, scene.render.resolution_y
sheet = np.ones((h * 4, w * 4, 4))
for which, name, px in head_shots:
    r = 3 if which == 'figure' else 2; c = ['front', 'side', 'three', 'back'].index(name)
    sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = px
for which, name, px in shots:
    r = 1 if which == 'figure' else 0; c = list(views).index(name)
    sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = px
img = bpy.data.images.new('sheet', w * 4, h * 4, alpha=True); img.pixels = sheet.ravel().tolist()
img.filepath_raw = os.path.join(out, 'review.png'); img.file_format = 'PNG'; img.save()
for which, name, _ in shots: os.remove(os.path.join(out, f'_{which}_{name}.png'))
report = {'tris': tris, 'total_body': sum(v for k, v in tris.items() if k not in ('head', 'helmet', 'crest')), 'head': tris['head'], 'silhouette_iou': iou}
json.dump(report, open(os.path.join(out, 'report.json'), 'w'), indent=1)
print('REPORT', json.dumps(report))
