"""Genera la estatua con MPFB (MakeHuman para Blender) y la exporta como GLB.

Uso (Blender 4.2+ con la extensión MPFB habilitada):
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/build_statue.py -- assets/avatar/estatua.glb

Objetos exportados:
  body        cuerpo con formas de mezcla: chest, lat, delt, arm, forearm, waist, waist_thin, belly, abs, legs (todas a 0)
  hair        pelo en relieve (desde la malla auxiliar de pelo de MakeHuman)
  beard_short barba corta (banda en la mandíbula)
  beard_full  barba completa (mandíbula y mentón, con volumen)
  drape       paño de cadera (desde la malla auxiliar de falda), con pliegues
Pose: brazos bajos y relajados, ligeramente adelante.
"""
import sys
import os
import math
import bpy
from mathutils import Vector

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.exportservice import ExportService
from bl_ext.blender_org.mpfb.services.rigservice import RigService

OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'estatua.glb')

REGIONS = {
    'chest': ['torso-muscle-pectoral-incr'],
    'lat': ['torso-muscle-dorsi-incr', 'torso-vshape-incr'],
    'delt': ['l-upperarm-shoulder-muscle-incr', 'r-upperarm-shoulder-muscle-incr'],
    'arm': ['l-upperarm-muscle-incr', 'r-upperarm-muscle-incr'],
    'forearm': ['l-lowerarm-muscle-incr', 'r-lowerarm-muscle-incr'],
    'waist': ['measure-waist-circ-incr', 'hip-scale-horiz-incr'],
    'waist_thin': ['measure-waist-circ-decr'],
    'belly': ['stomach-pregnant-incr'],
    'abs': ['stomach-tone-incr'],
    'legs': ['l-upperleg-muscle-incr', 'r-upperleg-muscle-incr', 'l-lowerleg-muscle-incr', 'r-lowerleg-muscle-incr'],
}


def log(*a):
    print('[estatua]', *a, flush=True)


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def group_center(obj, group_name):
    idx = obj.vertex_groups[group_name].index
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices if any(g.group == idx for g in v.groups)]
    if not pts:
        return None
    return sum(pts, Vector()) / len(pts)


def keep_only_group(obj, group_name):
    """Deja en la malla solo los vértices del grupo (borra el resto)."""
    activate(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    idx = obj.vertex_groups[group_name].index
    for v in obj.data.vertices:
        v.select = not any(g.group == idx for g in v.groups)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')


def keep_only_selected_faces(obj, predicate):
    """Deja solo las caras cuyo centro cumple el predicado (en coordenadas de mundo)."""
    activate(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    mw = obj.matrix_world
    for p in obj.data.polygons:
        p.select = not predicate(mw @ p.center)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='FACE')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.delete_loose()
    bpy.ops.object.mode_set(mode='OBJECT')


def plain_copy(obj, name):
    """Copia sin formas de mezcla ni modificadores, lista para esculpir accesorios."""
    activate(obj)
    bpy.ops.object.duplicate()
    dup = bpy.context.view_layer.objects.active
    dup.name = name
    dup.data = dup.data.copy()
    dup.data.name = name
    if dup.data.shape_keys:
        activate(dup)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(dup.modifiers):
        dup.modifiers.remove(m)
    return dup


def add_relief(obj, thickness, noise_strength, noise_size, subdiv=1, smooth=1):
    """Grosor + rugosidad tipo relieve tallado + suavizado. Aplica los modificadores."""
    activate(obj)
    tex = bpy.data.textures.new(obj.name + '_noise', type='CLOUDS')
    tex.noise_scale = noise_size
    tex.noise_depth = 2
    if thickness > 0:
        sol = obj.modifiers.new('sol', 'SOLIDIFY')
        sol.thickness = thickness
        sol.offset = 1.0
        sol.use_even_offset = True
    if subdiv:
        sub = obj.modifiers.new('sub', 'SUBSURF')
        sub.levels = subdiv
        sub.render_levels = subdiv
    if noise_strength > 0:
        dis = obj.modifiers.new('dis', 'DISPLACE')
        dis.texture = tex
        dis.strength = noise_strength
        dis.mid_level = 0.5
    if smooth:
        sm = obj.modifiers.new('sm', 'SMOOTH')
        sm.factor = 0.6
        sm.iterations = smooth
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in obj.data.polygons:
        p.use_smooth = True


# ---------------------------------------------------------------- escena
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

macro = TargetService.get_default_macro_info_dict()
macro.update({'gender': 1.0, 'age': 0.5, 'muscle': 0.85, 'weight': 0.55, 'proportions': 0.8, 'height': 0.6})
macro['race'] = {'asian': 0.0, 'caucasian': 1.0, 'african': 0.0}
body = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
log('base', body.name, 'verts', len(body.data.vertices))
TargetService.bake_targets(body)

# ---------------------------------------------------------------- formas de mezcla por región
activate(body)
for region, targets in REGIONS.items():
    loaded = []
    for t in targets:
        path = TargetService.target_full_path(t)
        if not path or not os.path.exists(path):
            log('WARN target no encontrado', t)
            continue
        name = 'tmp_' + t
        TargetService.load_target(body, path, weight=1.0, name=name)
        loaded.append(name)
    if not loaded:
        continue
    TargetService.create_shape_key(body, region, also_create_basis=True, create_from_mix=True)
    kb = body.data.shape_keys.key_blocks
    for name in loaded:
        if name in kb:
            body.shape_key_remove(kb[name])
    kb[region].value = 0.0
log('regions', [k.name for k in body.data.shape_keys.key_blocks if k.name != 'Basis'])

# ---------------------------------------------------------------- pose: brazos bajos y relajados
rig = HumanService.add_builtin_rig(body, 'default')
activate(rig)
bpy.ops.object.mode_set(mode='POSE')


def hand_pos(side):
    bpy.context.view_layer.update()
    return RigService.find_pose_bone_tail_world_location('wrist.' + side, rig)


for side, sx in (('L', 1), ('R', -1)):
    up = rig.pose.bones['upperarm01.' + side]
    low = rig.pose.bones['lowerarm01.' + side]
    up.rotation_mode = 'XYZ'
    low.rotation_mode = 'XYZ'
    thigh = group_center(body, 'joint-' + ('l' if side == 'L' else 'r') + '-upper-leg') or Vector((sx * 0.12, 0, 0.9))
    target = Vector((sx * 0.30, thigh.y - 0.04, thigh.z - 0.10))
    best = None
    for rz in range(0, 71, 5):
        for ry in range(-30, 41, 5):
            up.rotation_euler = (0.0, math.radians(ry), math.radians(-sx * rz))
            d = (hand_pos(side) - target).length
            if best is None or d < best[0]:
                best = (d, rz, ry)
    up.rotation_euler = (0.0, math.radians(best[2]), math.radians(-sx * best[1]))
    # codo apenas flexionado hacia adelante: probamos ejes y nos quedamos con el que adelanta la mano sin subirla
    ref = hand_pos(side)
    bestl = None
    for axis in range(3):
        for sign in (1, -1):
            e = [0.0, 0.0, 0.0]
            e[axis] = sign * math.radians(14)
            low.rotation_euler = e
            h = hand_pos(side)
            score = (h.y - ref.y) + abs(h.z - ref.z) * 2  # más adelante (y menor) y sin cambiar altura
            if bestl is None or score < bestl[0]:
                bestl = (score, tuple(e))
    low.rotation_euler = bestl[1]
    log('pose', side, 'upperarm rz/ry', best[1], best[2], 'dist', round(best[0], 3), 'hand', [round(v, 3) for v in hand_pos(side)])

bpy.ops.object.mode_set(mode='OBJECT')

# Aplicar la pose a la malla conservando las formas de mezcla; después el rig sobra
arm_mods = [m.name for m in body.modifiers if m.type == 'ARMATURE']
ExportService._apply_modifiers_keep_shapekeys(body, arm_mods)
for m in list(body.modifiers):
    if m.type == 'ARMATURE':
        body.modifiers.remove(m)
bpy.data.objects.remove(rig, do_unlink=True)
log('pose applied; shape keys', [k.name for k in body.data.shape_keys.key_blocks if k.name != 'Basis'])

# ---------------------------------------------------------------- accesorios
eye_l = group_center(body, 'joint-l-eye') or Vector((0.03, -0.09, 1.72))
eye_z, eye_y = eye_l.z, eye_l.y            # el rostro mira a -Y: y menor = más adelante
top_z = max((body.matrix_world @ v.co).z for v in body.data.vertices)
skull_c = Vector((0.0, eye_y + 0.045, (top_z + eye_z) / 2 + 0.005))
skull_r = (top_z - eye_z) * 0.95 + 0.035
ears_idx = body.vertex_groups['ears'].index if 'ears' in body.vertex_groups else -1
ear_verts = {v.index for v in body.data.vertices if any(g.group == ears_idx for g in v.groups)} if ears_idx >= 0 else set()
log('head refs', 'eye_z', round(eye_z, 3), 'top_z', round(top_z, 3), 'skull_r', round(skull_r, 3), 'ear verts', len(ear_verts))


def keep_faces(obj, predicate, exclude_verts=()):
    """Deja solo las caras cuyo centro cumple el predicado y que no tocan vértices excluidos."""
    activate(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    mw = obj.matrix_world
    ex = set(exclude_verts)
    for poly in obj.data.polygons:
        try:
            keep = predicate(mw @ poly.center, poly.normal)
        except TypeError:
            keep = predicate(mw @ poly.center)
        keep = keep and not any(i in ex for i in poly.vertices)
        poly.select = not keep
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='FACE')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.delete_loose()
    bpy.ops.object.mode_set(mode='OBJECT')


def scalp_region(c):
    """Pelo corto: cráneo por encima de la línea del pelo al frente, más sienes y nuca; sin cara ni orejas."""
    if (c - skull_c).length > skull_r:
        return False
    if c.z > eye_z + 0.065:                       # coronilla y frente alta
        return True
    return c.y > eye_y + 0.065 and c.z > eye_z - 0.055   # sienes altas y nuca


hair = plain_copy(body, 'hair_short')
keep_faces(hair, scalp_region, ear_verts)
add_relief(hair, thickness=0.02, noise_strength=0.0, noise_size=0.02, subdiv=1, smooth=2)
log('hair_short verts', len(hair.data.vertices))

# Pelo largo: la malla auxiliar de MakeHuman sin los mechones sobre la cara
hair_long = plain_copy(body, 'hair_long')
keep_only_group(hair_long, 'helper-hair')
keep_faces(hair_long, lambda c: (c.z > eye_z + 0.03) or (c.y > eye_y + 0.06 and c.z > skull_c.z - 0.32))
add_relief(hair_long, thickness=0.014, noise_strength=0.010, noise_size=0.035, subdiv=1, smooth=1)
log('hair_long verts', len(hair_long.data.vertices))

# Rodete: casquete corto más una esfera arriba y atrás
hair_bun = plain_copy(hair, 'hair_bun')
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=(0, skull_c.y + 0.05, top_z - 0.005), segments=24, ring_count=16)
bun = bpy.context.view_layer.objects.active
bun.scale = (1.0, 0.85, 0.8)
bpy.ops.object.transform_apply(scale=True)
add_relief(bun, thickness=0.0, noise_strength=0.006, noise_size=0.02, subdiv=0, smooth=0)
activate(hair_bun)
bun.select_set(True)
bpy.ops.object.join()
log('hair_bun verts', len(hair_bun.data.vertices))

drape = plain_copy(body, 'drape')
keep_only_group(drape, 'helper-skirt')
knee = group_center(body, 'joint-l-knee') or Vector((0, 0, 0.55))
hip = group_center(body, 'joint-l-upper-leg') or Vector((0, 0, 0.95))
keep_only_selected_faces(drape, lambda c: knee.z + 0.16 < c.z < hip.z + 0.07)
add_relief(drape, thickness=0.012, noise_strength=0.022, noise_size=0.06, subdiv=1, smooth=1)
log('drape verts', len(drape.data.vertices))

chin_z = min((body.matrix_world @ v.co).z for v in body.data.vertices if abs((body.matrix_world @ v.co).x) < 0.02 and (body.matrix_world @ v.co).y < eye_y + 0.01 and (body.matrix_world @ v.co).z > eye_z - 0.17)
mouth_z = eye_z - 0.078
log('face refs', 'chin_z', round(chin_z, 3), 'mouth_z', round(mouth_z, 3))


def beard_region(c, n=None, full=True):
    if (c - skull_c).length > skull_r + 0.03:
        return False
    if n is not None and n.z < -0.35:               # no la cara inferior del mentón
        return False
    if c.z < chin_z - 0.006:                        # no el cuello
        return False
    if c.y > eye_y + (0.085 if full else 0.05):      # mitad delantera y costados de la mandíbula
        return False
    if c.z > mouth_z - 0.010:                       # debajo de la boca
        return False
    return True


beard_short = plain_copy(body, 'beard_short')
for m in list(beard_short.modifiers):
    beard_short.modifiers.remove(m)
keep_faces(beard_short, lambda c, n: beard_region(c, n, False))
add_relief(beard_short, thickness=0.007, noise_strength=0.0, noise_size=0.02, subdiv=1, smooth=2)
beard_full = plain_copy(body, 'beard_full')
keep_faces(beard_full, lambda c, n: beard_region(c, n, True))
add_relief(beard_full, thickness=0.02, noise_strength=0.0, noise_size=0.02, subdiv=1, smooth=3)
log('beards verts', len(beard_short.data.vertices), len(beard_full.data.vertices))

# ---------------------------------------------------------------- cuerpo: quitar auxiliares, suavizar
ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=False)
for p in body.data.polygons:
    p.use_smooth = True
body.name = 'body'
body.data.name = 'body'
log('body verts', len(body.data.vertices), 'faces', len(body.data.polygons))

# ---------------------------------------------------------------- exportar
parts = [body, hair, hair_long, hair_bun, drape, beard_short, beard_full]
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_morph=True, export_morph_normal=False, export_try_sparse_sk=True,
    export_materials='NONE', export_apply=False, export_yup=True,
    export_skins=False, export_animations=False, export_texcoords=False, export_normals=True,
)
log('exported', OUT, 'size', os.path.getsize(OUT), 'objects', [o.name for o in parts])
