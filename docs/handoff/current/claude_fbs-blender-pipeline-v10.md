# FBS Blender pipeline — v10 + Jerry v2 clean-cut (Sep 29, 2026)

Rebuild: `python3 upgrade_v10.py`. Jerry v2: git clone https://github.com/animate1978/MB-Lab (male assets), `ln -s <repo> ~/.config/blender/5.0/scripts/addons/MB_Lab`; in jerry2/: mb_a.py (see header), `python3 build_b1.py -- '{"rot": [["lowerarm_L","X",-12],["lowerarm_R","X",-12],["neck","Z",3],["head","Z",6],["head","Y",2.5]]}'`, `python3 build_b2.py`, `python3 build_b3.py -- 36`; then `python3 add_jerry2.py`, `python3 slim_jerry.py <blend>`, `TIME_LIMIT=300 python3 render_v10.py 100 64 renders10 <cams>` in the background (~6 min per view).

## upgrade_v10.py — v9 -> v10 photo-matched pass
```python
"""v10: photo-matched pass on top of v9 (from AJ's 40 store photos + walkthrough video).
Ceilings (tile grid, dome pendants, track, fans, ducts, skylights, south soffit + troffers), front-room stained
concrete + knotty pine, wall decor/banners cut from the photos, aisle signs, bucket ledge, START HERE sign,
warehouse yellow lines + strip lights, blue rack uprights, wood baseboards, photo-matched cameras."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

SRC = "/home/claude/work/out/FBS Boise Store Map v9.blend"
OUT = "/home/claude/work/out/FBS Boise Store Map v10.blend"
TEX = "/home/claude/work/tex10/"
bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene

def coll(name):
    c = bpy.data.collections.get(name)
    if not c: c = bpy.data.collections.new(name); sc.collection.children.link(c)
    return c
C_CEI = bpy.data.collections["4 Ceilings (render only)"]
C_FIX = bpy.data.collections["1 Fixed - walls, doors, desks (locked)"]
C_FLR = bpy.data.collections["2 Floors, zones, stairs"]
C_DEC = coll("7 Signs + decor (from photos)")
C_CAM = bpy.data.collections["6 Cameras + lights"]

def bsdf(m): return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)

def pmat(name, hexc, rough=0.6, metal=0.0, emit=0.0, emit_hex=None, trans=0.0, coat=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; b = bsdf(m)
    b.inputs["Base Color"].default_value = srgb(hexc); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if trans: b.inputs["Transmission Weight"].default_value = trans
    if coat: b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = srgb(emit_hex or hexc); b.inputs["Emission Strength"].default_value = emit
    return m

def emit_mat(name, kelvin, strength):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    o = N.new("ShaderNodeOutputMaterial"); e = N.new("ShaderNodeEmission"); bb = N.new("ShaderNodeBlackbody")
    bb.inputs[0].default_value = kelvin; e.inputs["Strength"].default_value = strength
    L.new(bb.outputs[0], e.inputs["Color"]); L.new(e.outputs[0], o.inputs["Surface"]); return m

def img_mat(name, file, emission=0.25, rough=0.7, alpha=False):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; N = m.node_tree.nodes; L = m.node_tree.links; b = bsdf(m)
    t = N.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(TEX + file); t.interpolation = "Cubic"
    L.new(t.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = rough
    if emission:
        L.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = emission
    if alpha:
        L.new(t.outputs["Alpha"], b.inputs["Alpha"])
    return m

def tiled_img_mat(name, file, tile_w, tile_h, rough=0.55, bump=0.0):
    """image repeated in world units (feet) using object-space box projection"""
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; N = m.node_tree.nodes; L = m.node_tree.links; b = bsdf(m)
    tc = N.new("ShaderNodeTexCoord"); mp = N.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1 / tile_w, 1 / tile_w, 1 / tile_h)
    t = N.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(TEX + file); t.projection = "BOX"; t.projection_blend = 0.2
    L.new(tc.outputs["Generated"] if False else tc.outputs["Object"], mp.inputs["Vector"]); L.new(mp.outputs["Vector"], t.inputs["Vector"])
    L.new(t.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = rough
    if bump:
        bu = N.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = bump; bu.inputs["Distance"].default_value = 0.01
        L.new(t.outputs["Color"], bu.inputs["Height"]); L.new(bu.outputs["Normal"], b.inputs["Normal"])
    return m

def tile_ceiling_mat(name, w=2.0, h=4.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; N = m.node_tree.nodes; L = m.node_tree.links; b = bsdf(m)
    tc = N.new("ShaderNodeTexCoord"); br = N.new("ShaderNodeTexBrick")
    br.offset = 0.0; br.offset_frequency = 1; br.squash = 1.0
    br.inputs["Color1"].default_value = srgb("#eeede8"); br.inputs["Color2"].default_value = srgb("#e6e5df"); br.inputs["Mortar"].default_value = srgb("#b9bab6")
    br.inputs["Scale"].default_value = 1.0; br.inputs["Mortar Size"].default_value = 0.035; br.inputs["Mortar Smooth"].default_value = 0.0
    br.inputs["Brick Width"].default_value = w; br.inputs["Row Height"].default_value = h
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 90.0; nz.inputs["Detail"].default_value = 8.0
    bu = N.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = 0.12; bu.inputs["Distance"].default_value = 0.004
    L.new(tc.outputs["Object"], br.inputs["Vector"]); L.new(br.outputs["Color"], b.inputs["Base Color"])
    L.new(tc.outputs["Object"], nz.inputs["Vector"]); L.new(nz.outputs["Fac"], bu.inputs["Height"]); L.new(bu.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.92
    return m

# ---------- geometry helpers ----------
class MB:
    """collect boxes / primitives with material slots, then build one object"""
    def __init__(self): self.bm = bmesh.new(); self.mats = []
    def mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    def box(self, x0, x1, y0, y1, z0, z1, m, M=None):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r["verts"]
        S = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((abs(x1 - x0) or 0.001, abs(y1 - y0) or 0.001, abs(z1 - z0) or 0.001, 1))
        bmesh.ops.transform(self.bm, matrix=(M @ S) if M else S, verts=vs)
        idx = self.mi(m)
        for f in {f for v in vs for f in v.link_faces}: f.material_index = idx
    def cyl(self, x, y, z0, z1, r, m, seg=16, r2=None):
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0,
                                    matrix=Matrix.Translation((x, y, (z0 + z1) / 2)))
        idx = self.mi(m)
        for f in {f for v in res["verts"] for f in v.link_faces}: f.material_index = idx
    def dome(self, x, y, z, r, m, flat=0.75):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=24, v_segments=12, radius=r)
        vs = res["verts"]; low = [v for v in vs if v.co.z < -1e-4]
        bmesh.ops.delete(self.bm, geom=low, context="VERTS")
        vs = [v for v in vs if v.is_valid]
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((x, y, z)) @ Matrix.Diagonal((1, 1, flat, 1)), verts=vs)
        idx = self.mi(m)
        for f in {f for v in vs for f in v.link_faces}: f.material_index = idx
    def disc(self, x, y, z, r, m, seg=24):
        res = bmesh.ops.create_circle(self.bm, cap_ends=True, segments=seg, radius=r, matrix=Matrix.Translation((x, y, z)))
        idx = self.mi(m)
        for f in {f for v in res["verts"] for f in v.link_faces}: f.material_index = idx
    def seg(self, p0, p1, r, m, n=6):
        p0, p1 = Vector(p0), Vector(p1); d = p1 - p0; dn = d.normalized()
        q = dn.to_track_quat("Z", "Y" if abs(dn.y) < 0.9 else "X")
        M = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=n, radius1=r, radius2=r, depth=d.length, matrix=M)
        idx = self.mi(m)
        for f in {f for v in res["verts"] for f in v.link_faces}: f.material_index = idx
    def build(self, name, collection, smooth=False):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(name); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        ca = me.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
        for d in ca.data: d.color = (1, 1, 1, 1)
        if smooth:
            for p in me.polygons: p.use_smooth = True
        o = bpy.data.objects.new(name, me); collection.objects.link(o); return o

def image_plane(name, collection, center, w, h, facing, m):
    """vertical (or ceiling-hung) image quad; facing = '+x','-x','+y','-y' = direction the picture faces"""
    cx, cy, cz = center; hw, hh = w / 2, h / 2
    if facing == "+y":   vs = [(cx - hw, cy, cz - hh), (cx + hw, cy, cz - hh), (cx + hw, cy, cz + hh), (cx - hw, cy, cz + hh)]
    elif facing == "-y": vs = [(cx + hw, cy, cz - hh), (cx - hw, cy, cz - hh), (cx - hw, cy, cz + hh), (cx + hw, cy, cz + hh)]
    elif facing == "+x": vs = [(cx, cy + hw, cz - hh), (cx, cy - hw, cz - hh), (cx, cy - hw, cz + hh), (cx, cy + hw, cz + hh)]
    else:                vs = [(cx, cy - hw, cz - hh), (cx, cy + hw, cz - hh), (cx, cy + hw, cz + hh), (cx, cy - hw, cz + hh)]
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], [(0, 1, 2, 3)]); me.update()
    uv = me.uv_layers.new(name="UVMap")
    for i, c in enumerate([(1, 0), (0, 0), (0, 1), (1, 1)]): uv.data[i].uv = c      # u runs left->right as seen from the facing side
    me.materials.append(m)
    o = bpy.data.objects.new(name, me); collection.objects.link(o); return o

# ---------- 1. remove the old flat-panel ceilings (keep Von's) ----------
for n in ("Ceiling - Warehouse floor", "Ceiling - Sales floor", "Ceiling - Front room", "Ceiling - Front room east"):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)

tile = tile_ceiling_mat("Ceiling tile grid 2x4")
tile22 = tile_ceiling_mat("Ceiling tile grid 2x2", 2.0, 2.0)
alu = pmat("Brushed aluminium", "#c9ccce", 0.35, 0.9)
white_plastic = pmat("White enamel", "#f1f1ee", 0.35)
galv = pmat("Galvanised duct", "#9fa3a6", 0.42, 0.75)
black_metal = pmat("Powder-coat black steel", "#050505", 0.35, 0.8)
fan_blade = pmat("Fan blade (light grey)", "#d9d9d6", 0.5)
troffer = emit_mat("Troffer lens 5000K", 5000, 7.5)
pendant_lens = emit_mat("Pendant lens 4000K", 4200, 26.0)
pendant_glass = pmat("Prismatic dome", "#f4f4f2", 0.28, 0.0, emit=2.2, emit_hex="#fff6e8", trans=0.35)
track_lens = emit_mat("Track spot lens", 3500, 18.0)
skylight = emit_mat("Skylight daylight", 6500, 5.0)
strip = emit_mat("Warehouse strip light", 4000, 16.0)
drywall = bpy.data.materials.get("Paint #e6dcc6")

def troffers(mb, x0, x1, y0, y1, z, dx=8.0, dy=8.0):
    x = x0 + dx / 2
    while x < x1 - 1:
        y = y0 + dy / 2
        while y < y1 - 1:
            mb.box(x - 1, x + 1, y - 2, y + 2, z - 0.07, z - 0.02, troffer)                   # 2x4 lens (long side N-S)
            for (a, b_, c, d) in ((x - 1.05, x + 1.05, y - 2.05, y - 1.98), (x - 1.05, x + 1.05, y + 1.98, y + 2.05),
                                  (x - 1.05, x - 0.98, y - 2.05, y + 2.05), (x + 0.98, x + 1.05, y - 2.05, y + 2.05)):
                mb.box(a, b_, c, d, z - 0.1, z - 0.01, alu)
            y += dy
        x += dx

def fan(mb, x, y, zc, drop=1.6, span=2.2):
    z = zc - drop
    mb.cyl(x, y, z + 0.2, zc, 0.035, alu, 8)                  # downrod
    mb.cyl(x, y, z - 0.18, z + 0.2, 0.33, alu, 20, 0.22)       # motor housing
    for k in range(5):
        a = k * 2 * math.pi / 5
        M = Matrix.Translation((x, y, z - 0.05)) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(math.radians(9), 4, "X")
        mb.box(0.35, 0.35 + span, -0.24, 0.24, -0.015, 0.015, fan_blade, M)

def pendant(mb, x, y, zc, drop=3.4):
    z = zc - drop
    mb.cyl(x, y, z + 0.55, zc, 0.02, black_metal, 6)          # cord
    mb.cyl(x, y, z + 0.3, z + 0.6, 0.22, white_plastic, 16)    # cap
    mb.dome(x, y, z - 0.2, 0.95, pendant_glass, 0.62)          # prismatic dome (open bottom)
    mb.disc(x, y, z - 0.18, 0.9, pendant_lens)                 # glowing lens

# ---- sales floor, high part (y 33 → 80) ----
Z_HI, Z_LO = 15.0, 10.0
mb = MB()
mb.box(50.35, 102.65, 33.0, 79.95, Z_HI, Z_HI + 0.25, tile)
for (sx, sy) in ((60.0, 58.0), (77.0, 66.0), (92.0, 52.0)):                                     # skylight wells
    mb.box(sx - 2, sx + 2, sy - 4, sy + 4, Z_HI + 0.25, Z_HI + 0.3, skylight)
    for (a, b_, c, d) in ((sx - 2.05, sx + 2.05, sy - 4.05, sy - 3.95), (sx - 2.05, sx + 2.05, sy + 3.95, sy + 4.05),
                          (sx - 2.05, sx - 1.95, sy - 4.05, sy + 4.05), (sx + 1.95, sx + 2.05, sy - 4.05, sy + 4.05)):
        mb.box(a, b_, c, d, Z_HI - 0.9, Z_HI + 0.3, drywall)
for px in (56.0, 66.0, 76.0, 86.0, 96.0):                                                         # dome pendants
    for py in (38.5, 48.0, 57.5, 67.0, 76.0):
        if abs(px - 76.5) < 3 and abs(py - 40.5) < 2: continue
        pendant(mb, px, py, Z_HI)
for (fx, fy) in ((61.0, 43.0), (81.0, 43.0), (61.0, 62.0), (86.0, 72.0), (98.0, 62.0), (71.0, 72.0)):   # ceiling fans
    fan(mb, fx, fy, Z_HI)
for ty in (44.0, 61.5, 73.5):                                                                     # track rails + spots
    mb.box(54.0, 100.0, ty - 0.06, ty + 0.06, Z_HI - 1.25, Z_HI - 1.13, white_plastic)
    for k in range(4): mb.cyl(56 + k * 14, ty, Z_HI - 1.13, Z_HI, 0.012, alu, 6)
    x = 55.0
    while x < 99.5:
        mb.cyl(x, ty, Z_HI - 1.55, Z_HI - 1.25, 0.11, white_plastic, 12)
        mb.disc(x, ty, Z_HI - 1.56, 0.08, track_lens, 12); x += 3.1
for dxs in (64.5, 88.0):                                                                           # galvanised ducts N-S
    mb.box(dxs - 0.9, dxs + 0.9, 33.3, 79.6, Z_HI - 1.2, Z_HI - 0.1, galv)
ceil_hi = mb.build("Ceiling - Sales floor (tile, pendants, fans, track, ducts)", C_CEI)

# ---- sales floor, south part under the soffit (y 0 → 33) + the soffit face ----
mb = MB()
mb.box(50.35, 102.65, 0.35, 33.0, Z_LO, Z_LO + 0.2, tile)
troffers(mb, 50.35, 102.65, 0.35, 33.0, Z_LO, 8.5, 8.0)
ceil_lo = mb.build("Ceiling - South aisles (drop ceiling + troffers)", C_CEI)
mb = MB()
mb.box(50.35, 102.65, 32.75, 33.25, Z_LO, Z_HI + 0.05, drywall)                                 # soffit / bulkhead
mb.cyl(80.5, 34.2, Z_LO + 0.2, Z_HI, 0.6, galv, 20)                                               # round duct drop (photo 06)
soffit = mb.build("Soffit over south aisles", C_FIX)

# ---- front rooms: tile + troffers + fans ----
mb = MB()
mb.box(103.35, 127.0, 0.35, 79.95, 9.4, 9.6, tile)
troffers(mb, 103.35, 127.0, 0.35, 79.95, 9.4, 8.0, 8.0)
mb.box(127.0, 168.95, 0.35, 69.95, 12.0, 12.2, tile)
troffers(mb, 127.0, 168.95, 0.35, 53.5, 12.0, 8.4, 8.0)
for (fx, fy) in ((115.0, 16.0), (115.0, 44.0), (140.0, 22.0), (156.0, 40.0)): fan(mb, fx, fy, 12.0 if fx > 127 else 9.4, 1.0, 1.9)
mb.build("Ceiling - Front rooms (tile, troffers, fans)", C_CEI)

# ---- warehouse: open deck + strip lights + fans ----
deck = pmat("Warehouse deck (white)", "#e3e2dc", 0.8, emit=0.35, emit_hex="#efe6d6")   # high-bay spill lights the deck (photo 02)
mb = MB()
mb.box(0.0, 49.65, 21.85, 79.95, 22.0, 22.3, deck)
for k in range(9):                                                                                 # joists
    x = 3 + k * 5.6; mb.box(x - 0.12, x + 0.12, 21.85, 79.95, 20.6, 22.0, deck)
for x in (8.0, 20.0, 32.0, 44.0):
    for y in (28.0, 40.0, 52.0, 64.0, 75.0):
        mb.box(x - 0.35, x + 0.35, y - 4, y + 4, 19.9, 20.1, white_plastic); mb.box(x - 0.25, x + 0.25, y - 3.9, y + 3.9, 19.85, 19.9, strip)
for (fx, fy) in ((14.0, 45.0), (36.0, 60.0)): fan(mb, fx, fy, 20.6, 1.5, 2.6)
mb.build("Ceiling - Warehouse (deck, strip lights, fans)", C_CEI)
# warehouse walls run all the way up to the deck (photo 02) - no gap to the sky
wup = pmat("Warehouse upper wall (cream)", "#e7ddc8", 0.85)
mb = MB()
mb.box(-0.7, 0.0, 21.15, 80.7, 17.9, 22.3, wup); mb.box(0.0, 50.35, 80.0, 80.7, 17.9, 22.3, wup)
mb.box(49.65, 50.35, 21.15, 80.7, 17.9, 22.3, wup); mb.box(0.0, 50.35, 21.15, 21.85, 17.9, 22.3, wup)
mb.build("Warehouse walls up to the deck", C_FIX)

# ---------- 2. floors ----------
def retint_floor(m, hex_a, hex_b, lo, hi, coat):
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = bsdf(m)
    base = b.inputs["Base Color"]
    for l in list(base.links): nt.links.remove(l)
    tc = next((n for n in N if n.type == "TEX_COORD"), None) or N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 0.18; nz.inputs["Detail"].default_value = 10.0; nz.inputs["Roughness"].default_value = 0.62
    cr = N.new("ShaderNodeValToRGB"); cr.color_ramp.elements[0].position = 0.35; cr.color_ramp.elements[0].color = srgb(hex_a)
    cr.color_ramp.elements[1].position = 0.7; cr.color_ramp.elements[1].color = srgb(hex_b)
    L.new(tc.outputs["Object"], nz.inputs["Vector"]); L.new(nz.outputs["Fac"], cr.inputs["Fac"]); L.new(cr.outputs["Color"], base)
    b.inputs["Coat Weight"].default_value = coat
    rough = b.inputs["Roughness"]
    if rough.is_linked:
        mr = rough.links[0].from_node
        if mr.type == "MAP_RANGE": mr.inputs["To Min"].default_value = lo; mr.inputs["To Max"].default_value = hi
    else: rough.default_value = (lo + hi) / 2
for m in bpy.data.materials:
    if m.name.startswith("Floor concrete #b08f61"):          # front rooms: tan stained concrete (photos 28-39)
        retint_floor(m, "#8c7052", "#a8896a", 0.22, 0.42, 0.3)
    elif m.name.startswith(("Floor concrete #abada9", "Floor concrete #878984", "Floor concrete #a1a09a")):
        retint_floor(m, "#79766f", "#9a958c", 0.3, 0.6, 0.1)             # sales + warehouse: mid-grey sealed concrete (photos 08, 15, 22)

yellow = pmat("Floor paint - safety yellow", "#e5bd18", 0.5)
mb = MB()
for (x0, x1, y0, y1) in ((5.1, 5.45, 24.5, 76.0), (6.0, 26.0, 75.3, 75.65), (6.0, 16.0, 26.4, 26.75),
                         (8.0, 49.6, 51.3, 51.65), (8.0, 49.6, 65.6, 65.95), (22.0, 44.0, 36.8, 37.15)):
    mb.box(x0, x1, y0, y1, 0.0, 0.006, yellow)
mb.build("Warehouse floor safety lines", C_FLR)

# ---------- 3. walls: knotty pine in the front rooms, wood baseboards ----------
pine = tiled_img_mat("Knotty pine paneling (photo 40)", "pine_paneling.jpg", 5.0, 4.3, 0.55, 0.03)
mb = MB()
mb.box(103.35, 112.0, 0.0, 0.07, 0.0, 9.4, pine); mb.box(118.0, 127.0, 0.0, 0.07, 0.0, 9.4, pine)
mb.box(127.0, 168.95, 0.0, 0.07, 0.0, 12.0, pine)
mb.box(168.88, 168.95, 0.0, 69.95, 0.0, 12.0, pine)
mb.box(127.7, 168.95, 69.93, 70.0, 0.0, 12.0, pine)
mb.box(103.35, 127.0, 79.93, 80.0, 0.0, 9.4, pine)
mb.box(112.0, 118.0, 0.0, 0.07, 7.9, 9.4, pine)                                     # over the entrance doors
mb.box(103.35, 169.0, 0.07, 0.6, 9.0, 9.4, pine)                                    # pine soffit band (photo 40)
mb.build("Knotty pine paneling - front rooms", C_FIX)
cove = bpy.data.materials.get("Rubber cove base")
if cove:
    cove.name = "Wood baseboard"; b = bsdf(cove); b.inputs["Base Color"].default_value = srgb("#6a4629"); b.inputs["Roughness"].default_value = 0.45

rack = bpy.data.materials.get("Paint #1f5a47")
if rack: bsdf(rack).inputs["Base Color"].default_value = srgb("#2c5f8a"); rack.name = "Rack uprights (blue)"
for m in bpy.data.materials:
    if m.name.startswith("Paint #b9ae9c") or m.name.startswith("Paint #e6dcc6") or m.name.startswith("Paint #e2dccf"):
        bsdf(m).inputs["Base Color"].default_value = srgb("#e7ddc8")                 # cream walls as in photos

# ---------- 4. decor + signs cut from the photos ----------
def framed(name, file, center, w, h, facing, emission=0.18, depth=0.08):
    m = img_mat("Photo " + name, file, emission, 0.35)
    image_plane(name, C_DEC, center, w, h, facing, m)
    cx, cy, cz = center; d = {"+y": (0, -1), "-y": (0, 1), "+x": (-1, 0), "-x": (1, 0)}[facing]
    mb = MB(); back = pmat("Frame backing", "#2a2622", 0.6)
    ox, oy = d[0] * depth / 2, d[1] * depth / 2
    if facing in ("+y", "-y"): mb.box(cx - w / 2, cx + w / 2, cy + oy - depth / 2, cy + oy + depth / 2 - 0.004, cz - h / 2, cz + h / 2, back)
    else: mb.box(cx + ox - depth / 2, cx + ox + depth / 2 - 0.004, cy - w / 2, cy + w / 2, cz - h / 2, cz + h / 2, back)
    mb.build(name + " (backing)", C_DEC)

Y_N = 79.9      # north wall interior face (sales floor), pictures face south (-y)
framed("B&W logging photo 1", "bw_photo_1.jpg", (73.0, Y_N, 11.3), 3.6, 3.05, "-y", 0.6)
framed("Antique drill plaque", "plaque_1.jpg", (77.6, Y_N, 11.2), 2.1, 1.35, "-y")
framed("B&W logging photo 2", "bw_photo_2.jpg", (82.3, Y_N, 11.35), 3.8, 2.95, "-y", 0.6)
framed("Antique plane plaque", "plaque_2.jpg", (87.6, Y_N, 11.3), 2.6, 1.3, "-y")
framed("B&W logging photo 3", "bw_photo_3.jpg", (94.6, Y_N, 11.35), 3.7, 3.05, "-y", 0.6)
X_A = 102.6     # arch wall west face (sales floor side), faces west (-x)
framed("Banner - TRY IT BEFORE YOU BUY IT", "banner_tryit.jpg", (X_A, 61.0, 8.9), 9.0, 2.7, "-x", 0.22, 0.02)
framed("Banner - CURIOUS ABOUT A TOOL", "banner_curious.jpg", (X_A, 74.0, 8.6), 7.0, 2.1, "-x", 0.22, 0.02)
Y_S = 33.3      # soffit north face, faces north (+y)
framed("Shadow box - Kennatrack apron", "shadowbox_1.jpg", (82.2, Y_S, 12.6), 2.2, 3.8, "+y")
framed("Shadow box - vintage labels", "shadowbox_2.jpg", (78.8, Y_S, 12.7), 2.4, 3.6, "+y")
framed("Occidental Leather logo", "occidental_logo.jpg", (86.4, Y_S, 12.2), 2.6, 2.6, "+y", 0.1, 0.01)
framed("Sign - Evolution of the framing hammer", "sign_evolution_hammer.jpg", (60.8, Y_S, 13.0), 2.9, 2.5, "+y")
framed("Antique plane plaque (soffit)", "plaque_2.jpg", (64.6, Y_S, 12.9), 2.6, 1.3, "+y")

# aisle signs on the north ends of the gondolas (photos 06, 23)
def aisle_sign(code, x, y, z=7.2):
    m = img_mat("Aisle sign " + code, f"aisle_{code}.png", 0.15, 0.4, alpha=True)
    image_plane(f"Aisle sign {code}", C_DEC, (x, y, z), 1.75, 2.75, "+y", m)
    image_plane(f"Aisle sign {code} (back)", C_DEC, (x, y - 0.03, z), 1.75, 2.75, "-y", m)
    mb = MB(); mb.box(x - 0.03, x + 0.03, y - 0.05, y + 0.05, 6.0, z - 1.0, black_metal); mb.build(f"Aisle sign {code} post", C_DEC)
g56 = bpy.data.objects.get("SAW BLADE/BITS 27' (4A/3B) [i56]"); g57 = bpy.data.objects.get("NAIL/SCREW 23'4\" (3A) [i57]")
if g56:
    ny = g56.matrix_world.translation.y + 12.5; aisle_sign("3B", 65.8, ny + 0.2); aisle_sign("4A", 67.8, ny + 0.2)
if g57:
    ny = g57.matrix_world.translation.y + 11.66; aisle_sign("3A", 75.5, ny + 0.2)

# START HERE LED sign over the front sales desk (photo 39)
sh = img_mat("START HERE LED sign", "start_here.jpg", 1.6, 0.4)
mb = MB(); mb.box(115.3, 118.7, 25.55, 25.85, 7.6, 8.25, black_metal)
for x in (115.6, 118.4): mb.cyl(x, 25.7, 8.25, 9.4, 0.012, alu, 6)
mb.build("START HERE sign housing", C_DEC)
image_plane("START HERE sign (south face)", C_DEC, (117.0, 25.53, 7.925), 3.3, 0.58, "-y", sh)

# FBS flag buckets on a ledge above the air-tools wall (photos 07, 08)
decal = img_mat("FBS bucket decal", "bucket_decal.jpg", 0.12, 0.35)
bucket_white = pmat("Bucket (white HDPE)", "#f3f3f0", 0.32)
mb = MB(); mb.box(101.6, 102.65, 47.0, 79.6, 10.2, 10.35, pmat("Ledge (painted wood)", "#d9d1bf", 0.6))
mb2 = MB()
y = 47.6
while y < 79.2:
    for row, (zb, off) in enumerate(((10.35, 0.0), (11.55, 0.5))):
        yy = y + off
        if yy > 79.1: continue
        mb.cyl(102.1, yy, zb, zb + 1.15, 0.5, bucket_white, 20, 0.45); mb.cyl(102.1, yy, zb + 1.15, zb + 1.2, 0.52, bucket_white, 20)
        mb2.box(101.585, 101.59, yy - 0.26, yy + 0.26, zb + 0.35, zb + 0.8, decal)
    y += 1.02
mb.build("FBS flag buckets + ledge", C_DEC)
dec = mb2.build("FBS flag bucket decals", C_DEC)
# UVs for the decal quads (each box's -x face gets the full image)
me = dec.data; uv = me.uv_layers.new(name="UVMap")
for p in me.polygons:
    n = p.normal
    cs = [me.vertices[me.loops[li].vertex_index].co for li in p.loop_indices]
    y0 = min(c.y for c in cs); y1 = max(c.y for c in cs); z0 = min(c.z for c in cs); z1 = max(c.z for c in cs)
    for li, c in zip(p.loop_indices, cs):
        uv.data[li].uv = ((y1 - c.y) / max(1e-6, y1 - y0), (c.z - z0) / max(1e-6, z1 - z0))


# ---------- 4b. fixes from the photo comparison (round 2) ----------
# products: the glTF import multiplied every packaging photo by its average colour (double-darkened boxes) -> use the photo as-is
am = bpy.data.materials.get("Packaging photo (atlas)")
if am:
    nt = am.node_tree; b = bsdf(am); tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
    for l in list(b.inputs["Base Color"].links): nt.links.remove(l)
    hsv = nt.nodes.new("ShaderNodeHueSaturation"); hsv.inputs["Saturation"].default_value = 1.08; hsv.inputs["Value"].default_value = 1.06
    nt.links.new(tex.outputs["Color"], hsv.inputs["Color"]); nt.links.new(hsv.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.38

def tiled_photo(name, file, tw, th, z0=0.0, rough=0.55):
    m = tiled_img_mat(name, file, tw, th, rough)
    mp = next(n for n in m.node_tree.nodes if n.type == "MAPPING"); mp.inputs["Location"].default_value = (0.0, 0.0, -z0 / th)
    return m

# front sales desk (photos 35 + 39): beige laminate top, snack pegboard outside, walnut drawers inside
sdf = bpy.data.objects.get("SALES DESK FRONT (SDF) [i48]")
if sdf:
    me = sdf.data; n = len(me.vertices)
    ctr = Vector((sum(v.co.x for v in me.vertices) / n, sum(v.co.y for v in me.vertices) / n, 0))
    top = pmat("SDF counter top (beige laminate)", "#c7bba9", 0.35)
    outer = tiled_photo("SDF front - snack pegboard (photo 39)", "sdf_snacks.jpg", 5.6, 2.7, 0.55, 0.5)
    inner = tiled_photo("SDF inside - walnut drawers (photo 35)", "sdf_drawers.jpg", 4.6, 3.0, 0.25, 0.45)
    names = [s.material.name if s.material else "" for s in sdf.material_slots]
    body = next(i for i, nm in enumerate(names) if nm.startswith("Paint #a7aaac"))
    ctop = next(i for i, nm in enumerate(names) if nm.startswith("Paint #d8d2c4"))
    sdf.material_slots[ctop].material = top
    sdf.material_slots[body].material = outer
    me.materials.append(inner); ii = len(me.materials) - 1
    moved = 0
    for p in me.polygons:
        if p.material_index != body: continue
        rad = p.center - ctr; rad.z = 0
        if abs(p.normal.z) < 0.3 and rad.length > 1e-3 and p.normal.dot(rad.normalized()) < -0.3: p.material_index = ii; moved += 1
    print("SDF: inner faces -> drawers", moved)

# warehouse (photo 02): cedar-plank laser wall behind the laser deck, tripods + red cases, lumber pergola display
cedar = tiled_img_mat("Cedar planks (photo 20)", "cedar_planks.jpg", 4.0, 4.4, 0.6, 0.02)
dark_wood = pmat("Dark stained trim", "#3b2a1d", 0.5)
red_case = pmat("Milwaukee red (tool case)", "#b3121f", 0.42)
mb = MB()
mb.box(49.5, 49.64, 36.0, 48.45, 0.0, 12.6, cedar)
mb.box(49.4, 49.64, 35.9, 48.55, 12.6, 12.85, dark_wood)
for (y0, y1, z) in ((37.0, 40.2, 6.3), (42.4, 46.6, 6.3), (38.4, 41.6, 8.4), (43.4, 47.2, 8.4)):
    mb.box(48.75, 49.5, y0, y1, z - 0.08, z, dark_wood)
    yy = y0 + 0.25
    while yy + 0.55 <= y1: mb.box(48.95, 49.45, yy, yy + 0.55, z, z + 0.6, red_case); yy += 0.85
mb.build("Laser wall - cedar planks + shelves (photo 02)", C_FIX)
mb = MB(); DT = 0.35
for (tx, ty, h) in ((45.2, 38.6, 4.9), (46.9, 41.6, 5.3), (45.0, 44.6, 4.6), (47.3, 46.9, 5.6)):
    head = Vector((tx, ty, DT + h - 0.15))
    for k in range(3):
        a = k * 2.094 + 0.4
        mb.seg(head, (tx + 1.05 * math.cos(a), ty + 1.05 * math.sin(a), DT), 0.035, alu)
    mb.cyl(tx, ty, DT + h - 0.2, DT + h, 0.18, black_metal, 12)
    mb.box(tx - 0.2, tx + 0.2, ty - 0.2, ty + 0.2, DT + h, DT + h + 0.42, red_case)
    mb.cyl(tx, ty, DT + h + 0.42, DT + h + 0.5, 0.1, black_metal, 10)
mb.box(47.4, 48.8, 38.2, 39.1, DT, DT + 0.55, red_case); mb.box(44.0, 45.3, 46.9, 47.8, DT, DT + 0.5, red_case)
mb.build("Laser deck - tripods + cases (photo 02)", C_DEC)

lumber = pmat("Pine lumber (2x4)", "#cfa877", 0.72)
lime = pmat("Lime-green product bins", "#6cc524", 0.45)
gx0, gx1, gy0, gy1, H, RIDGE = 45.4, 48.9, 61.2, 65.4, 7.6, 9.7
mb = MB()
for (x0, x1, y0, y1) in ((gx0, gx1, gy0, gy0 + 0.46), (gx0, gx1, gy1 - 0.46, gy1), (gx0, gx0 + 0.46, gy0, gy1), (gx1 - 0.46, gx1, gy0, gy1)):
    mb.box(x0, x1, y0, y1, 0.0, 0.46, lumber)                                          # 2x6 base frame
for x in (gx0, gx1 - 0.29):
    for y in (gy0, gy1 - 0.29): mb.box(x, x + 0.29, y, y + 0.29, 0.46, H, lumber)   # 4x4 posts
for y in (gy0, gy1 - 0.29): mb.box(gx0, gx1, y, y + 0.29, H, H + 0.29, lumber)        # top plates
ym = (gy0 + gy1) / 2
for x in (gx0 + 0.07, (gx0 + gx1) / 2, gx1 - 0.07):                                   # gable rafters facing the warehouse
    mb.seg((x, gy0 + 0.1, H + 0.2), (x, ym, RIDGE), 0.07, lumber, 4); mb.seg((x, gy1 - 0.1, H + 0.2), (x, ym, RIDGE), 0.07, lumber, 4)
mb.box(gx0 - 0.2, gx1 + 0.2, ym - 0.06, ym + 0.06, RIDGE - 0.1, RIDGE + 0.15, lumber)
for z in (2.2, 3.8, 5.4, 7.0):                                                          # slats on both long sides
    for y in (gy0 - 0.05, gy1 - 0.03): mb.box(gx0, gx1, y, y + 0.08, z, z + 0.25, lumber)
for x in (gx0 - 0.05, gx1 - 0.03):
    mb.seg((x, gy0 + 0.3, 0.6), (x, gy1 - 0.3, 3.4), 0.05, lumber, 4)
mb.box(gx0 + 0.3, gx1 - 0.3, gy0 + 0.35, gy1 - 0.35, 2.0, 2.08, lumber)               # shelf
for (x0, y0) in ((gx0 + 0.45, gy0 + 0.5), (gx0 + 0.45, ym + 0.1)):
    for k in range(6): mb.box(x0, x0 + 2.4, y0, y0 + 1.5, 0.46 + k * 0.25, 0.46 + k * 0.25 + 0.22, lime)
    for k in range(4): mb.box(x0, x0 + 2.4, y0, y0 + 1.5, 2.08 + k * 0.25, 2.08 + k * 0.25 + 0.22, lime)
mb.build("Pergola display - lumber frame (photo 02)", C_DEC)

ld = bpy.data.lights.new("Daylight through glass roll-up door", "AREA"); ld.shape = "RECTANGLE"; ld.size = 8.0; ld.size_y = 9.5
ld.energy = 900; ld.color = (1.0, 0.97, 0.92)
lo = bpy.data.objects.new(ld.name, ld); C_CAM.objects.link(lo); lo.location = (41.5, 79.55, 5.0); lo.rotation_euler = (math.radians(-90), 0, 0)


# ---------- 4c. round 3: Makita gondola shows tools hanging on teal pegboard (photos 07, 08, 11; video frame 41) ----------
mk = bpy.data.objects.get("MAKITA ROW 25'6\" [i53]")
if mk:
    names = [sl.material.name if sl.material else "" for sl in mk.material_slots]
    prod = {i for i, nm in enumerate(names) if nm.startswith(("Packaging photo", "Cans"))}
    shelf = {i for i, nm in enumerate(names) if nm.startswith("Paint #e9e9e6")}
    peg = {i for i, nm in enumerate(names) if nm.startswith("Pegboard")}
    bm = bmesh.new(); bm.from_mesh(mk.data); W = mk.matrix_world
    kill = []; pegx = []
    for f in bm.faces:
        zs = [(W @ v.co).z for v in f.verts]; zc = sum(zs) / len(zs)
        if f.material_index in prod and zc > 2.2: kill.append(f)
        elif f.material_index in shelf and zc > 2.2 and max(zs) - min(zs) < 0.09: kill.append(f)
        elif f.material_index in peg and zc > 3.0:
            n = (W.to_3x3() @ f.normal); 
            if abs(n.x) > 0.9: pegx.append(((W @ f.calc_center_median()).x, 1 if n.x > 0 else -1))
    bmesh.ops.delete(bm, geom=kill, context="FACES"); bm.to_mesh(mk.data); bm.free()
    print("Makita: removed faces", len(kill), "pegboard faces", sorted(set((round(x, 2), s_) for x, s_ in pegx)))
    teal = pmat("Makita teal (tool body)", "#138c9c", 0.35)
    grip = pmat("Tool grip (black rubber)", "#111111", 0.6)
    steel = pmat("Saw blade (steel)", "#b8bcc0", 0.28, 1.0)
    tag = pmat("Price tag (white)", "#f2f2ef", 0.5)
    mb = MB()
    faces = {}
    cxo = mk.matrix_world.translation.x
    for x, sd in pegx:
        if abs(x - cxo) < 0.5: faces.setdefault(sd, []).append(x)          # centre spine only
    import random; rnd = random.Random(7)
    for sd, xs_ in faces.items():
        xf = (max(xs_) if sd > 0 else min(xs_)) + sd * 0.01          # outer surface of the pegboard on this side
        y = 49.9
        row_z = (5.5, 4.2, 2.95)
        while y < 74.1:
            for zr in row_z:
                kind = rnd.choice(("drill", "drill", "impact", "grinder", "saw", "drill"))
                yy = y + rnd.uniform(-0.15, 0.15); zz = zr + rnd.uniform(-0.12, 0.12); d = sd
                mb.box(min(xf, xf + d * 0.35), max(xf, xf + d * 0.35), yy - 0.015, yy + 0.015, zz + 0.25, zz + 0.28, steel)   # hook
                mb.box(min(xf, xf + d * 0.04), max(xf, xf + d * 0.04), yy - 0.1, yy + 0.1, zz - 0.95, zz - 0.8, tag)            # price tag
                cx = xf + d * 0.2
                if kind in ("drill", "impact"):
                    L = 0.6 if kind == "drill" else 0.46
                    mb.seg((cx, yy - L / 2, zz + 0.14), (cx, yy + L / 2, zz + 0.14), 0.105, teal, 14)            # motor housing
                    mb.seg((cx, yy + L / 2, zz + 0.14), (cx, yy + L / 2 + 0.04, zz + 0.14), 0.09, grip, 14)       # rear cap
                    mb.seg((cx, yy - L / 2 - 0.13, zz + 0.14), (cx, yy - L / 2, zz + 0.14), 0.055, grip, 12)      # chuck
                    mb.seg((cx, yy - L / 2 - 0.26, zz + 0.14), (cx, yy - L / 2 - 0.13, zz + 0.14), 0.012, steel, 6)
                    mb.seg((cx, yy + L / 2 - 0.12, zz + 0.06), (cx, yy + L / 2 - 0.2, zz - 0.4), 0.06, grip, 10)  # grip
                    mb.box(cx - 0.13, cx + 0.13, yy + L / 2 - 0.4, yy + L / 2 + 0.02, zz - 0.58, zz - 0.4, grip)   # battery
                    mb.box(cx - 0.135, cx + 0.135, yy + L / 2 - 0.41, yy + L / 2 + 0.03, zz - 0.47, zz - 0.44, teal)
                elif kind == "grinder":
                    mb.seg((cx, yy - 0.45, zz + 0.1), (cx, yy + 0.5, zz + 0.1), 0.1, teal, 14)
                    mb.seg((cx, yy + 0.5, zz + 0.1), (cx, yy + 0.66, zz + 0.1), 0.085, grip, 14)
                    mb.box(cx - 0.09, cx + 0.09, yy - 0.66, yy - 0.45, zz, zz + 0.2, grip)
                    mb.seg((cx - 0.02, yy - 0.56, zz - 0.02), (cx + 0.02, yy - 0.56, zz - 0.02), 0.2, steel, 20)   # guard / wheel
                else:
                    mb.seg((cx - 0.015, yy, zz - 0.1), (cx + 0.015, yy, zz - 0.1), 0.42, steel, 28)            # blade
                    mb.seg((cx + 0.015, yy + 0.05, zz - 0.02), (cx + 0.2, yy + 0.05, zz - 0.02), 0.16, teal, 16)  # motor
                    mb.box(cx + 0.01, cx + 0.22, yy - 0.2, yy + 0.35, zz + 0.2, zz + 0.3, grip)                  # handle
                    mb.box(cx + 0.01, cx + 0.05, yy - 0.45, yy + 0.45, zz - 0.52, zz - 0.48, steel)              # shoe plate
            y += 1.15
    to = mb.build("Makita tools on pegboard (from photos)", C_DEC)
    for p_ in to.data.polygons: p_.use_smooth = True
    bv = to.modifiers.new("Bevel", "BEVEL"); bv.width = 0.025; bv.segments = 3; bv.limit_method = "ANGLE"; bv.use_clamp_overlap = True; bv.harden_normals = True


# ---------- 4d. back sales desk faces: real pegboard + hanging products (photo 01), floor reflections calmer ----------
sdb = bpy.data.objects.get("SALES DESK BACK (SDB) [i47]")
if sdb:
    peg_sdb = tiled_photo("SDB front - pegboard with products (photo 01)", "sdb_pegboard.jpg", 1.6, 3.1, 0.35, 0.5)
    for sl in sdb.material_slots:
        if sl.material and sl.material.name.startswith("Photo sdb_face"): sl.material = peg_sdb
for m in bpy.data.materials:
    if m.name.startswith("Floor concrete"):
        b_ = bsdf(m)
        if b_: b_.inputs["Coat Roughness"].default_value = 0.14
sc.cycles.blur_glossy = 1.0; sc.cycles.sample_clamp_indirect = 8.0

# ---------- 5. photo-matched cameras ----------
def cam(name, loc, look, lens):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_start = 0.3; cd.clip_end = 1500
    o = bpy.data.objects.new(name, cd); C_CAM.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); return o
cam("CAM 09 Match photo 08 - north wall from SDB", (84.0, 46.8, 5.6), (86.0, 80.0, 8.4), 14)
cam("CAM 10 Match photo 02 - warehouse to wide opening", (22.0, 54.0, 5.4), (60.0, 57.0, 6.2), 14)
cam("CAM 11 Match photo 07 - TRY IT wall", (86.0, 55.0, 5.6), (103.0, 64.0, 8.0), 14)
def portrait(o, shift=0.0): o["res"] = [720, 1280]; o.data.shift_y = shift; o.data.sensor_fit = "AUTO"
portrait(cam("CAM 12 Aisle 3A from the back desk (photo 23 area)", (80.6, 35.3, 5.3), (79.0, 10.0, 5.3), 12.5), 0.12)
portrait(cam("CAM 13 Match photo 35 - inside front desk to front door", (116.6, 30.6, 5.2), (116.0, 0.0, 5.2), 15), 0.06)
portrait(cam("CAM 14 Match photo 39 - START HERE and front desk", (116.8, 19.5, 5.3), (117.0, 40.0, 5.3), 15), 0.08)

# ---------- 6. bevel the new fixed geometry, save ----------
for o in (soffit,):
    w = o.modifiers.new("Weld", "WELD"); w.merge_threshold = 0.0008
    bv = o.modifiers.new("Bevel", "BEVEL"); bv.width = 0.02; bv.segments = 2; bv.limit_method = "ANGLE"; bv.use_clamp_overlap = True
sc.cycles.samples = 96
sc.view_settings.use_white_balance = True; sc.view_settings.white_balance_temperature = 4400   # like the phone camera: neutral whites under warm store lights
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print("saved", OUT, "objects", len(bpy.data.objects))
```

## jerry2/mb_a.py — MB-Lab character (MB-Lab repo symlinked as ~/.config/blender/5.0/scripts/addons/MB_Lab)
```python
"""Jerry v2 stage A: MB-Lab realistic male (free, AGPL add-on from github.com/animate1978/MB-Lab), shaped + finalized."""
import bpy, addon_utils, sys
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
addon_utils.enable("MB_Lab", default_set=True)
import MB_Lab
sc = bpy.context.scene
sc.mblab_character_name = "m_ca01"; sc.mblab_use_cycles = True; sc.mblab_use_lamps = False
bpy.ops.mbast.init_character()
body = [o for o in bpy.data.objects if o.type == "MESH"][0]
bpy.context.view_layer.objects.active = body; body.select_set(True)
H = MB_Lab.mblab_humanoid
print("defaults", {k: round(getattr(body, k), 2) for k in ("Expressions_mouthSmile", "Expressions_eyeSquintL", "Jaw_ScaleX", "Body_Size", "Neck_Length", "Eyebrows_PosZ")})
body.preset = "type_normobody"
body.ethnic = "euromediterranean"
body.character_age = float(sys.argv[-3]) if len(sys.argv) > 3 else 0.1
body.character_mass = 0.15
body.character_tone = 0.1
tweaks = {  # 0.5 = neutral
    "Legs_UpperlegLength": 0.57, "Legs_LowerlegLength": 0.57, "Neck_Length": 0.47,
    "Cheeks_Mass": 0.46, "Face_Ellipsoid": 0.47, "Chin_SizeZ": 0.53, "Jaw_Prominence": 0.55, "Chin_Prominence": 0.53,
    "Eyebrows_Ridge": 0.52, "Nose_SizeY": 0.5, "Eyes_Size": 0.56, "Neck_Length": 0.4, "Neck_Mass": 0.55,
}
for k, v in tweaks.items():
    if hasattr(body, k): setattr(body, k, v)
    else: print("missing", k)
mats = {"skin_melanin": 0.4, "skin_hue": 0.5, "skin_oil": 0.22, "skin_bump": 0.65, "skin_veins": 0.12, "skin_freckles": 0.05, "skin_blush": 0.15,
        "eyes_hue": 0.07, "eyes_saturation": 0.55, "eyes_value": 0.55}
for k, v in mats.items(): setattr(body, k, v)
H.update_character(mode="update_all")
r = bpy.ops.mbast.finalize_character()
print("finalize", r, [(o.name, o.type, tuple(round(v, 3) for v in o.dimensions)) for o in bpy.data.objects])
import os
for im in bpy.data.images:
    fp = bpy.path.abspath(im.filepath) if im.filepath else ""
    if im.source == "FILE" and fp and not os.path.exists(fp):
        alt = "/home/claude/mblab/data/textures/" + os.path.basename(fp)
        if os.path.exists(alt): im.filepath = alt; im.reload()
    print("img", im.name, im.source, im.size[:], im.filepath)
for im in bpy.data.images:
    try:
        if not im.packed_file and im.source in ("FILE", "GENERATED") and (im.has_data or im.source == "FILE"): im.pack()
    except Exception as e: print("pack fail", im.name, e)
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[-1])
print("saved", sys.argv[-1])
```

## jerry2/build_b1.py — expression, pose, bake, scale to feet
```python
"""Jerry v2 stage B1: friendly expression + relaxed standing pose on the MB-Lab character, baked to a static mesh
and scaled to feet (6'3"). Keeps MB-Lab's textured skin, eyes, teeth, lashes; re-adds subdivision + skin displacement."""
import bpy, json, math, sys
from mathutils import Vector, Quaternion, Matrix
SRC = "/home/claude/work/jerry2/jerry_mb_a.blend"; OUT = "/home/claude/work/jerry2/jerry_b1.blend"
POSE = "/home/claude/mblab/data/poses/male_poses/standing_in_lab.json"
HEIGHT_FT = 6.25
bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene
body = next(o for o in bpy.data.objects if o.type == "MESH"); arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")

# ---- expression: relaxed, friendly closed-mouth smile ----
for k, v in {"Expressions_mouthSmile_max": 0.62, "Expressions_eyeSquintL_max": 0.3, "Expressions_eyeSquintR_max": 0.3,
             "Expressions_browOutVertL_max": 0.2, "Expressions_browOutVertR_max": 0.2, "Expressions_mouthSmileL_max": 0.05}.items():
    kb = body.data.shape_keys.key_blocks.get(k)
    if kb: kb.value = v

# ---- pose ----
d = json.load(open(POSE))
for pb in arm.pose.bones: pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = (1, 0, 0, 0)
for bn, q in d.items():
    if bn in arm.pose.bones: arm.pose.bones[bn].rotation_quaternion = Quaternion(q)
P = arm.pose.bones
for bn in ("head", "neck"):
    if bn in P: P[bn].rotation_quaternion = (1, 0, 0, 0)          # keep his gaze level (the lab pose looks up)
def rot_world(pb, axis, deg):
    """rotate a pose bone about a world axis through its head"""
    bpy.context.view_layer.update()
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()
extra = json.loads(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else {}
for bn, ax, deg in extra.get("rot", []):
    if bn in P: rot_world(P[bn], ax, deg)
bpy.context.view_layer.update()

# joints (posed, world) for later stages
J = {pb.name: [list(arm.matrix_world @ pb.head), list(arm.matrix_world @ pb.tail)] for pb in P}

# ---- bake: armature + corrective smooth + shape keys, without subdivision/displacement ----
keep = {}
for m in body.modifiers:
    if m.type in ("SUBSURF", "DISPLACE"): keep[m.type] = m; m.show_viewport = False; m.show_render = False
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
me.name = "Jerry body (MB-Lab)"
jb = bpy.data.objects.new("Jerry body", me); sc.collection.objects.link(jb)
jb.data.transform(body.matrix_world)
zmin = min(v.co.z for v in me.vertices); zmax = max(v.co.z for v in me.vertices)
k = HEIGHT_FT / (zmax - zmin)
M = Matrix.Scale(k, 4) @ Matrix.Translation((0, 0, -zmin))
jb.data.transform(M)
J = {n: [list(M @ Vector(h)), list(M @ Vector(t))] for n, (h, t) in J.items()}
print("raw height m", round(zmax - zmin, 3), "scale", round(k, 3))
# re-add subdivision + skin displacement (strength scaled with the mesh)
sd = jb.modifiers.new("Subdivision", "SUBSURF"); sd.levels = 1; sd.render_levels = 2
src_d = keep.get("DISPLACE")
if src_d:
    dm = jb.modifiers.new("Skin displacement", "DISPLACE"); dm.texture = src_d.texture; dm.texture_coords = "UV"
    dm.strength = src_d.strength * k; dm.mid_level = src_d.mid_level
    if src_d.vertex_group: dm.vertex_group = src_d.vertex_group
for p in jb.data.polygons: p.use_smooth = True
# unit fixes in every shader (distances are in scene units, which are now feet and 3.5x bigger)
seen = set()
def fix_tree(nt):
    if nt is None or nt.name in seen: return
    seen.add(nt.name)
    for n in nt.nodes:
        for i in n.inputs:
            if i.is_linked or not hasattr(i, "default_value") or hasattr(i.default_value, "__len__"): continue
            if (n.type == "BSDF_PRINCIPLED" and i.name == "Subsurface Scale") or (n.type == "SUBSURFACE_SCATTERING" and i.name == "Scale") \
               or (n.type == "BUMP" and i.name == "Distance") or (n.type == "DISPLACEMENT" and i.name == "Scale"):
                i.default_value *= k
        if n.type == "TEX_COORD":
            for l in list(nt.links):
                if l.from_node == n and l.from_socket.name == "Object":
                    vm = nt.nodes.new("ShaderNodeVectorMath"); vm.operation = "SCALE"; vm.inputs["Scale"].default_value = 1.0 / k
                    to = l.to_socket; nt.links.remove(l); nt.links.new(n.outputs["Object"], vm.inputs[0]); nt.links.new(vm.outputs[0], to)
        if n.type == "GROUP": fix_tree(n.node_tree)
for m in jb.data.materials:
    if m and m.node_tree: fix_tree(m.node_tree)
jb["joints"] = J; jb["mb_scale"] = k
bpy.data.objects.remove(body, do_unlink=True); bpy.data.objects.remove(arm, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("saved", OUT, "verts", len(me.vertices), "height ft", round(max(v.co.z for v in me.vertices), 3))
```

## jerry2/build_b2.py — skin shader, hair, brows, goatee, glasses
```python
"""Jerry v2 stage B2: grooming + glasses on the posed MB-Lab body (feet).
Short dark-brown men's cut (real strands, clumped, side part), natural brows, short goatee, scalp + stubble shading
in the skin, square black acetate glasses."""
import bpy, bmesh, math, random, json, bisect
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/jerry2/jerry_b1.blend")
sc = bpy.context.scene
body = bpy.data.objects["Jerry body"]; me = body.data
J = {k: (Vector(v[0]), Vector(v[1])) for k, v in body["joints"].items()}
col = bpy.data.collections.new("Jerry (realistic)"); sc.collection.children.link(col)
for c in body.users_collection: c.objects.unlink(body)
col.objects.link(body)
def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)
def bsdf(m): return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
MI = {m.name.split("1790")[0]: i for i, m in enumerate(me.materials)}

# ---------- landmarks ----------
V = me.vertices
eyeset = {MI["MBlab_human_eyes"], MI["MBlab_cornea"], MI["MBLab_Iris_V4"], MI["MBlab_pupil"]}
eye_v = {i for p in me.polygons if p.material_index in eyeset for i in p.vertices}
EL = sum((V[i].co for i in eye_v if V[i].co.x > 0), Vector()) / max(1, sum(1 for i in eye_v if V[i].co.x > 0))
ER = sum((V[i].co for i in eye_v if V[i].co.x < 0), Vector()) / max(1, sum(1 for i in eye_v if V[i].co.x < 0))
RE = max((V[i].co - (EL if V[i].co.x > 0 else ER)).length for i in eye_v)
eye_front = min(V[i].co.y for i in eye_v)
skin_i = MI["MBLab_skin3"]
skin_v = {i for p in me.polygons if p.material_index == skin_i for i in p.vertices}
# lips from MB-Lab's lip map (UV space)
img = bpy.data.images.load("/home/claude/mblab/data/textures/human_male_lipmap.png"); w, h = img.size
px = np.array(img.pixels[:]).reshape(h, w, img.channels)[..., 0]
uvl = me.uv_layers["UVMap"].data
lipv = np.zeros(len(V))
for p in me.polygons:
    if p.material_index != skin_i: continue
    for li in p.loop_indices:
        u, v = uvl[li].uv; x = min(w - 1, max(0, int(u * w))); y = min(h - 1, max(0, int(v * h)))
        vi = me.loops[li].vertex_index; lipv[vi] = max(lipv[vi], px[y, x])
lips = [V[i].co for i in range(len(V)) if lipv[i] > 0.5]
MC = sum(lips, Vector()) / len(lips); lip_top = max(p.z for p in lips); lip_bot = min(p.z for p in lips)
mouth_w = max(p.x for p in lips) - min(p.x for p in lips)
headv = [V[i].co for i in skin_v if V[i].co.z > EL.z - 0.45]
xmax = max(abs(p.x) for p in headv)
ears = {s: [p for p in headv if abs(p.x) > xmax * 0.86 and (p.x > 0) == (s > 0) and abs(p.z - EL.z) < 0.25] for s in (1, -1)}
print("eyes", EL, ER, "RE", round(RE, 3), "mouth", MC, "w", round(mouth_w, 3), "lips z", round(lip_bot, 3), round(lip_top, 3), "ears", len(ears[1]), len(ears[-1]))

# ---------- regions ----------
scalp_faces = set(json.load(open("/home/claude/mblab/data/Particle_Hair/m_ca01_hair.json")))
scalp_faces = {f for f in scalp_faces if not (me.polygons[f].normal.y < -0.35 and me.polygons[f].center.z < EL.z + 0.29)}
scalp_v = {i for f in scalp_faces for i in me.polygons[f].vertices}
def beard_w(p, n):
    if n.y > -0.2 or p.y > MC.y + 0.08: return 0.0
    dx = abs(p.x - MC.x)
    must = (lip_top + 0.004 <= p.z <= lip_top + 0.045) and dx < mouth_w * 0.52 - (p.z - lip_top) * 0.6
    chin = (lip_bot - 0.19 <= p.z <= lip_bot - 0.004) and dx < 0.062 + (p.z - (lip_bot - 0.19)) * 0.18
    conn = (lip_bot - 0.03 <= p.z <= lip_top + 0.01) and mouth_w * 0.42 <= dx <= mouth_w * 0.6
    return 1.0 if (must or chin or conn) else 0.0
def jaw_w(p, n):   # light stubble shadow along cheeks/jaw
    if p.z > MC.z - 0.02 or p.z < lip_bot - 0.36 or n.y > 0.35 or abs(p.x - MC.x) > 0.34: return 0.0
    return 1.0 if p.y < MC.y + 0.3 else 0.0

# ---------- skin: scalp shade + stubble in the albedo ----------
ca = me.color_attributes.new("Jerry masks", "FLOAT_COLOR", "POINT")
for v in V:
    r = 1.0 if v.index in scalp_v else 0.0
    g = beard_w(v.co, v.normal) if v.index in skin_v else 0.0
    b = jaw_w(v.co, v.normal) if v.index in skin_v else 0.0
    ca.data[v.index].color = (r, g, b, 1.0)
skin = me.materials[skin_i]; nt = skin.node_tree; N = nt.nodes; L = nt.links
alb = N["Human_mblab_skn_albedo"]; grp = next(n for n in N if n.type == "GROUP")
at = N.new("ShaderNodeAttribute"); at.attribute_name = "Jerry masks"; sep = N.new("ShaderNodeSeparateColor")
L.new(at.outputs["Color"], sep.inputs[0])
m1 = N.new("ShaderNodeMix"); m1.data_type = "RGBA"; m1.blend_type = "MULTIPLY"; m1.inputs["B"].default_value = srgb("#3a2a20")
mf1 = N.new("ShaderNodeMath"); mf1.operation = "MULTIPLY"; mf1.inputs[1].default_value = 0.9
L.new(sep.outputs[0], mf1.inputs[0]); L.new(mf1.outputs[0], m1.inputs["Factor"]); L.new(alb.outputs["Color"], m1.inputs["A"])
m2 = N.new("ShaderNodeMix"); m2.data_type = "RGBA"; m2.blend_type = "MULTIPLY"; m2.inputs["B"].default_value = srgb("#6d5d58")
add = N.new("ShaderNodeMath"); add.operation = "MULTIPLY_ADD"; add.inputs[1].default_value = 0.55
jw = N.new("ShaderNodeMath"); jw.operation = "MULTIPLY"; jw.inputs[1].default_value = 0.12
L.new(sep.outputs[2], jw.inputs[0]); L.new(sep.outputs[1], add.inputs[0]); L.new(jw.outputs[0], add.inputs[2])
L.new(add.outputs[0], m2.inputs["Factor"]); L.new(m1.outputs["Result"], m2.inputs["A"])
L.new(m2.outputs["Result"], grp.inputs["Albedo Map"])
# MB-Lab's skin group renders far too dark under the store's overhead lights, so drive a plain Principled skin
# from the same MB-Lab texture set (albedo + masks, roughness map, 4K bump) - predictable, physically sane values
pbs = N.new("ShaderNodeBsdfPrincipled")
hsv = N.new("ShaderNodeHueSaturation"); hsv.inputs["Saturation"].default_value = 0.72; hsv.inputs["Value"].default_value = 1.03
L.new(m2.outputs["Result"], hsv.inputs["Color"]); L.new(hsv.outputs["Color"], pbs.inputs["Base Color"])
rimg = N.new("ShaderNodeTexImage"); rimg.image = bpy.data.images.load("/home/claude/mblab/data/textures/human_male_roughness.png"); rimg.image.colorspace_settings.name = "Non-Color"
bimg = N.new("ShaderNodeTexImage"); bimg.image = bpy.data.images.load("/home/claude/mblab/data/textures/human_male_bump.png"); bimg.image.colorspace_settings.name = "Non-Color"
uvn = N.new("ShaderNodeUVMap"); uvn.uv_map = "UVMap"
for t_ in (rimg, bimg): L.new(uvn.outputs["UV"], t_.inputs["Vector"])
rmr = N.new("ShaderNodeMapRange"); rmr.inputs["To Min"].default_value = 0.34; rmr.inputs["To Max"].default_value = 0.62
L.new(rimg.outputs["Color"], rmr.inputs["Value"]); L.new(rmr.outputs["Result"], pbs.inputs["Roughness"])
bmp = N.new("ShaderNodeBump"); bmp.inputs["Strength"].default_value = 0.5; bmp.inputs["Distance"].default_value = 0.0025
L.new(bimg.outputs["Color"], bmp.inputs["Height"]); L.new(bmp.outputs["Normal"], pbs.inputs["Normal"])
pbs.inputs["Subsurface Weight"].default_value = 0.3; pbs.inputs["Subsurface Radius"].default_value = (1.0, 0.36, 0.2); pbs.inputs["Subsurface Scale"].default_value = 0.012
pbs.inputs["Specular IOR Level"].default_value = 0.5; pbs.inputs["Coat Weight"].default_value = 0.04; pbs.inputs["Coat Roughness"].default_value = 0.3
for o_ in [n for n in N if n.type == "OUTPUT_MATERIAL"]:
    for l in list(o_.inputs["Surface"].links): L.remove(l)
    for l in list(o_.inputs["Displacement"].links): L.remove(l)
    L.new(pbs.outputs["BSDF"], o_.inputs["Surface"])

# ---------- hair strands ----------
hair_m = bpy.data.materials.new("Jerry hair (dark brown)"); hair_m.use_nodes = True; hn = hair_m.node_tree; hn.nodes.clear()
hb = hn.nodes.new("ShaderNodeBsdfHairPrincipled"); hb.parametrization = "MELANIN"
hb.inputs["Melanin"].default_value = 0.9; hb.inputs["Melanin Redness"].default_value = 0.22; hb.inputs["Roughness"].default_value = 0.5
hb.inputs["Radial Roughness"].default_value = 0.65; hb.inputs["Coat"].default_value = 0.0; hb.inputs["Random Roughness"].default_value = 0.3
hi = hn.nodes.new("ShaderNodeHairInfo"); rr = hn.nodes.new("ShaderNodeMapRange"); rr.inputs["To Min"].default_value = 0.85; rr.inputs["To Max"].default_value = 0.94
hn.links.new(hi.outputs["Random"], rr.inputs["Value"]); hn.links.new(rr.outputs["Result"], hb.inputs["Melanin"])
ho = hn.nodes.new("ShaderNodeOutputMaterial"); hn.links.new(hb.outputs[0], ho.inputs["Surface"])
def sample(faces, count, seed, weight=None):
    r = random.Random(seed); fl = list(faces); ar = [me.polygons[f].area * (weight(f) if weight else 1.0) for f in fl]
    acc = []; a_ = 0
    for a in ar: a_ += a; acc.append(a_)
    out = []
    for _ in range(count):
        p = me.polygons[fl[min(len(fl) - 1, bisect.bisect_left(acc, r.random() * a_))]]
        vs = [V[i].co for i in p.vertices]; u, v_ = r.random(), r.random()
        if len(vs) == 4: q = (vs[0] * (1 - u) + vs[1] * u) * (1 - v_) + (vs[3] * (1 - u) + vs[2] * u) * v_
        else:
            if u + v_ > 1: u, v_ = 1 - u, 1 - v_
            q = vs[0] + (vs[1] - vs[0]) * u + (vs[2] - vs[0]) * v_
        out.append((q, p.normal.copy()))
    return out
def make_curves(name, strands, radius, mat):
    npts = len(strands[0]); cv = bpy.data.hair_curves.new(name); cv.add_curves([npts] * len(strands))
    pos = []; rad = []
    for s in strands:
        for k, q in enumerate(s): pos.extend(q); rad.append(radius * (1 - 0.65 * k / (npts - 1)))
    cv.position_data.foreach_set("vector", pos); ra = cv.attributes.new("radius", "FLOAT", "POINT"); ra.data.foreach_set("value", rad)
    cv.materials.append(mat); o = bpy.data.objects.new(name, cv); col.objects.link(o); return o
HC = (J["head"][0] + J["head"][1]) / 2
HC = Vector((HC.x, HC.y + 0.02, EL.z + 0.05))
PART_X = MC.x + 0.13                                      # soft side part on his left
# fringe faces around the scalp get sparser, shorter hair so the hairline isn't a hard edge
adj = set()
for f in scalp_faces:
    for i in me.polygons[f].vertices: pass
vf = {}
for p in me.polygons:
    if p.material_index == skin_i:
        for i in p.vertices: vf.setdefault(i, []).append(p.index)
for f in scalp_faces:
    for i in me.polygons[f].vertices:
        for g in vf.get(i, []):
            if g not in scalp_faces: adj.add(g)
adj = {f for f in adj if me.polygons[f].normal.y > -0.2 and (me.polygons[f].center.z > EL.z - 0.02 or me.polygons[f].center.y > HC.y)}
rnd = random.Random(11)
roots = sample(scalp_faces, 72000, 1) + sample(adj, 7000, 2)
fringe_n = 7000
def comb(p, n):
    top = max(0.0, min(1.0, (n.z - 0.3) / 0.55))
    side = Vector((0, 0.4, -1)).normalized()
    over = Vector((-0.3, 0.35, 0.9)).normalized()                            # short, tidy top: up and a little back (clean-cut crop)
    front = max(0.0, min(1.0, (HC.y - p.y - 0.05) / 0.2))                     # front: lifted up, then over (soft volume)
    d = (side * (1 - top) + over * top).normalized()
    up_over = Vector((-0.2, -0.1, 1.0)).normalized()
    d = (d * (1 - front) + up_over * front).normalized()
    return d, front
def hlen(p, n):
    top = max(0.0, min(1.0, (n.z - 0.2) / 0.6))
    back_low = max(0.0, min(1.0, (EL.z + 0.05 - p.z) / 0.3))
    front = max(0.0, min(1.0, (HC.y - p.y - 0.05) / 0.2))
    return (0.032 + 0.06 * top + 0.02 * front * top) * (1 - 0.5 * back_low)
kd = KDTree(len(roots))
for i, (p, n) in enumerate(roots): kd.insert(p, i)
kd.balance()
clumps = list(range(0, len(roots), 22)); kc = KDTree(len(clumps))
for j, ci in enumerate(clumps): kc.insert(roots[ci][0], j)
kc.balance()
cjit = [Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.35 for _ in clumps]
NP = 6
strands = []
for idx, (p, n) in enumerate(roots):
    d, front = comb(p, n)
    _, j, _ = kc.find(p); d = (d + cjit[j] * 0.6).normalized()
    d = (d - n * d.dot(n)).normalized()
    Ls = hlen(p, n) * rnd.uniform(0.8, 1.15) * (0.55 if idx >= len(roots) - fringe_n else 1.0)
    lift = 0.01 + 0.016 * max(0.0, min(1.0, (n.z - 0.3) / 0.55)) + 0.008 * front      # short hair stands a little, not slicked
    R0 = (p - HC).length; s = []
    for k in range(NP):
        t = k / (NP - 1)
        q = p + d * (Ls * t)
        q = HC + (q - HC).normalized() * (R0 + 0.0015 + lift * math.sin(math.pi * min(1.0, t * 1.15)) * (1 - 0.35 * t))
        q += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.0012 * t
        s.append(q)
    strands.append(s)
# clumping: pull each strand's outer points toward its clump leader's shape
for idx, s in enumerate(strands):
    _, j, dist = kc.find(roots[idx][0]); lead = strands[clumps[j]]
    if dist > 0.03: continue
    off = roots[idx][0] - roots[clumps[j]][0]
    for k in range(2, NP):
        t = k / (NP - 1); target = lead[k] + off * (1 - 0.6 * t)
        s[k] = s[k].lerp(target, 0.55 * t)
hair = make_curves("Jerry hair", strands, 0.00045, hair_m)
print("hair strands", len(strands))

# ---------- eyebrows ----------
brow = []
for E, sg in ((EL, 1), (ER, -1)):
    cand = [p.index for p in me.polygons if p.material_index == skin_i and p.normal.y < -0.3]
    def ok(fi, E=E, sg=sg):
        c = me.polygons[fi].center; u = (c.x - E.x) * sg / 0.095
        if not (-0.95 < u < 1.05) or c.y > eye_front + 0.15: return False
        zc = E.z + RE * 0.95 + 0.028 + 0.012 * (1 - u * u) - 0.008 * max(0.0, u); th = 0.016 - 0.007 * max(0.0, u)
        return abs(c.z - zc) < th + 0.012
    fs = [f for f in cand if ok(f)]
    pts = sample(fs, 1700, 5 + sg)
    for (p, n) in pts:
        u = (p.x - E.x) * sg / 0.095
        zc = E.z + RE * 0.95 + 0.028 + 0.012 * (1 - u * u) - 0.008 * max(0.0, u); th = 0.016 - 0.007 * max(0.0, u)
        if abs(p.z - zc) > th * rnd.uniform(0.7, 1.0): continue
        d = Vector((sg, 0, 0.45 if u < -0.3 else 0.12)); d = (d - n * d.dot(n)).normalized()
        Lb = 0.02 * rnd.uniform(0.8, 1.2); s = []
        for k in range(4):
            t = k / 3; s.append(p + d * Lb * t + n * (0.001 + 0.0012 * math.sin(math.pi * t)))
        brow.append(s)
make_curves("Jerry eyebrows", brow, 0.0003, hair_m)
print("brow hairs", len(brow))

# ---------- short goatee ----------
bf = [p.index for p in me.polygons if p.material_index == skin_i and beard_w(p.center, p.normal) > 0]
gt = []
for (p, n) in sample(bf, 9000, 9):
    if beard_w(p, n) <= 0: continue
    edge = sum(1 for dx, dz in ((0.014, 0), (-0.014, 0), (0, 0.014), (0, -0.014)) if beard_w(p + Vector((dx, 0, dz)), n) <= 0)
    if edge and rnd.random() < 0.1 + 0.08 * edge: continue                     # soft, sparser border like a real goatee
    d = Vector((0.0, -0.1, -1.0)); d = (d - n * d.dot(n)).normalized()
    Lg = 0.012 * rnd.uniform(0.75, 1.15); s = []
    for k in range(4):
        t = k / 3; s.append(p + d * Lg * t + n * (0.0012 + 0.0035 * math.sin(math.pi * t * 0.8)))
    gt.append(s)
make_curves("Jerry goatee", gt, 0.00028, hair_m)
print("goatee hairs", len(gt))

# ---------- glasses ----------
frame_m = bpy.data.materials.new("Jerry glasses - black acetate"); frame_m.use_nodes = True; b = bsdf(frame_m)
b.inputs["Base Color"].default_value = srgb("#0b0b0c"); b.inputs["Roughness"].default_value = 0.45; b.inputs["Coat Weight"].default_value = 0.12; b.inputs["Coat Roughness"].default_value = 0.2
lens_m = bpy.data.materials.new("Jerry glasses - lens"); lens_m.use_nodes = True; b = bsdf(lens_m)
b.inputs["Base Color"].default_value = (0.9, 0.95, 1, 1); b.inputs["Roughness"].default_value = 0.02; b.inputs["Alpha"].default_value = 0.06; b.inputs["Coat Weight"].default_value = 1.0
W_, H_, R_ = 0.178, 0.128, 0.028
def rrect(cx, cz, y):
    pts = []
    for (qx, qz, a0) in ((W_ / 2 - R_, H_ / 2 - R_, 0), (-(W_ / 2 - R_), H_ / 2 - R_, 90), (-(W_ / 2 - R_), -(H_ / 2 - R_), 180), (W_ / 2 - R_, -(H_ / 2 - R_), 270)):
        for k in range(5):
            a = math.radians(a0 + k * 22.5); pts.append(Vector((cx + qx + R_ * math.cos(a), y, cz + qz + R_ * math.sin(a))))
    return pts
cu = bpy.data.curves.new("Jerry glasses frame", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.0092; cu.bevel_resolution = 4
lens_bm = bmesh.new()
YG = eye_front - 0.036
for E, sg in ((EL, 1), (ER, -1)):
    cx = E.x + sg * 0.012; cz = E.z + 0.006
    pts = rrect(cx, cz, YG); R = Matrix.Rotation(math.radians(-7 * sg), 3, "Z"); c0 = Vector((cx, YG, cz))
    pts = [c0 + R @ (p - c0) for p in pts]
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1); sp.use_cyclic_u = True
    for i, p in enumerate(pts): sp.points[i].co = (p.x, p.y, p.z, 1)
    cen = sum(pts, Vector()) / len(pts)
    lv = [lens_bm.verts.new(cen + (p - cen) * 0.93 + Vector((0, 0.002, 0))) for p in pts]; lens_bm.faces.new(lv)
    ear = ears[sg]; etop = max(ear, key=lambda p: p.z); eback = max(ear, key=lambda p: p.y)
    hinge = Vector((cx + sg * W_ / 2, YG + 0.01, cz + H_ / 2 - 0.028))
    armp = [hinge, hinge + Vector((sg * 0.015, 0.06, 0)), Vector((etop.x + sg * 0.008, etop.y, etop.z + 0.008)), Vector((eback.x - sg * 0.012, eback.y + 0.012, etop.z - 0.11))]
    sp = cu.splines.new("POLY"); sp.points.add(len(armp) - 1)
    for i, p in enumerate(armp): sp.points[i].co = (p.x, p.y, p.z, 1)
b0 = Vector((EL.x + 0.012 - W_ / 2 + 0.005, YG, EL.z + 0.032)); b1 = Vector((ER.x - 0.012 + W_ / 2 - 0.005, YG, ER.z + 0.032))
sp = cu.splines.new("POLY"); sp.points.add(2)
for i, p in enumerate((b0, (b0 + b1) / 2 + Vector((0, -0.004, 0.004)), b1)): sp.points[i].co = (p.x, p.y, p.z, 1)
cu.materials.append(frame_m); col.objects.link(bpy.data.objects.new("Jerry glasses frame", cu))
lm = bpy.data.meshes.new("Jerry glasses lenses"); lens_bm.to_mesh(lm); lens_bm.free(); lm.materials.append(lens_m)
lo = bpy.data.objects.new("Jerry glasses lenses", lm); col.objects.link(lo)
body["landmarks"] = {"EL": list(EL), "ER": list(ER), "MC": list(MC), "eye_front": eye_front, "lip_bot": lip_bot, "lip_top": lip_top}
bpy.ops.wm.save_as_mainfile(filepath="/home/claude/work/jerry2/jerry_b2.blend")
print("saved b2")
```

## jerry2/build_b3.py — cloth-simulated polo + trousers, belt, shoes
```python
"""Jerry v2 stage B3: clothes with real drape.  Red FBS polo (tucked, collar, placket, buttons) and charcoal trousers
are built as loose garments and settled with Blender's cloth simulation against his body (gravity + excess fabric
-> natural folds), then belt, buckle and leather shoes.  Input jerry_b2.blend, output jerry.blend."""
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/jerry2/jerry_b2.blend")
sc = bpy.context.scene
body = bpy.data.objects["Jerry body"]; me = body.data; col = bpy.data.collections["Jerry (realistic)"]
J = {k: (Vector(v[0]), Vector(v[1])) for k, v in body["joints"].items()}
LM = body["landmarks"]
FRAMES = int(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else 36
def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)
def bsdf(m): return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
MI = {m.name.split("1790")[0]: i for i, m in enumerate(me.materials)}
skin_i = MI["MBLab_skin3"]; V = me.vertices; gen_i = MI.get("MBlab_generic", -1)

# ---------- segmentation by dominant bone weight ----------
gname = {g.index: g.name for g in body.vertex_groups}
def dom(v):
    best = ("", 0.0)
    for e in v.groups:
        n = gname[e.group]
        if n in ("visible skin",): continue
        if e.weight > best[1]: best = (n, e.weight)
    return best[0]
DOM = [dom(v) for v in V]
def seg_t(p, a, b):
    ab = b - a; return max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
NECKZ = J["neck"][0].z
hipz = (J["thigh_L"][0].z + J["thigh_R"][0].z) / 2
WAIST = hipz + 0.3
NC = J["neck"][0]
def ring_z(x, y):
    d = Vector((x - NC.x, y - NC.y)); d = d.normalized() if d.length > 1e-6 else Vector((0, -1))
    return NECKZ + 0.03 - 0.17 * max(0.0, -d.y) ** 2
SLEEVE_T = 0.5
def label(i):
    d = DOM[i]; p = V[i].co; s = "L" if d.endswith("_L") else ("R" if d.endswith("_R") else ("L" if p.x > 0 else "R"))
    if d.startswith(("spine", "pelvis", "clavicle")): return ("torso", 0.0)
    if d.startswith("upperarm"): return ("uarm" + s, seg_t(p, J["upperarm_" + s][0], J["lowerarm_" + s][0]))
    if d.startswith(("lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky")): return ("farm" + s, 0.0)
    if d.startswith("thigh"): return ("thigh" + s, 0.0)
    if d.startswith("calf"): return ("calf" + s, seg_t(p, J["calf_" + s][0], J["foot_" + s][0]))
    if d.startswith(("foot", "toes")): return ("foot" + s, 0.0)
    if d.startswith("neck"): return ("neck", 0.0)
    return ("head", 0.0)
skin_v = {i for p in me.polygons if p.material_index in (skin_i, gen_i) for i in p.vertices}   # the underwear counts as body for fitting
LAB = [label(i) if i in skin_v else ("other", 0.0) for i in range(len(V))]
def region(i):
    k, t = LAB[i]; co = V[i].co
    if k in ("torso", "neck"):
        if co.z > ring_z(co.x, co.y): return "skin"
        return "shirt" if co.z >= WAIST - 0.22 else "pants"
    if k.startswith("uarm"): return "shirt" if t < SLEEVE_T + 0.1 else "skin"
    if k.startswith("thigh"): return "pants"
    if k.startswith("calf"): return "pants" if t < 0.9 else "shoe"
    if k.startswith("foot"): return "shoe"
    return "skin"
REG = [region(i) for i in range(len(V))]
print("regions", {r: REG.count(r) for r in set(REG)}, "waist", round(WAIST, 2), "neck", round(NECKZ, 2))

# collision proxy of the body (no subdivision) and its BVH
dg = bpy.context.evaluated_depsgraph_get()
for m in body.modifiers: m.show_viewport = False
body_ev_me = bpy.data.meshes.new_from_object(body.evaluated_get(bpy.context.evaluated_depsgraph_get()))
for m in body.modifiers: m.show_viewport = True
bvh_body = BVHTree.FromPolygons([v.co for v in body_ev_me.vertices], [tuple(p.vertices) for p in body_ev_me.polygons])

def fabric(name, hexc, rough, sheen, knit):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links; b = bsdf(m)
    b.inputs["Roughness"].default_value = rough; b.inputs["Sheen Weight"].default_value = sheen; b.inputs["Sheen Roughness"].default_value = 0.5
    b.inputs["Sheen Tint"].default_value = [min(1, x * 2.2) for x in srgb(hexc)[:3]] + [1]
    tc = N.new("ShaderNodeTexCoord")
    if knit == "pique":
        t1 = N.new("ShaderNodeTexVoronoi"); t1.inputs["Scale"].default_value = 520; t1.feature = "F1"
        L.new(tc.outputs["Object"], t1.inputs["Vector"]); hgt = t1.outputs["Distance"]
    else:
        t1 = N.new("ShaderNodeTexWave"); t1.inputs["Scale"].default_value = 380; t1.bands_direction = "DIAGONAL"; t1.inputs["Distortion"].default_value = 0.6
        L.new(tc.outputs["Object"], t1.inputs["Vector"]); hgt = t1.outputs["Fac"]
    bu = N.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = 0.18; bu.inputs["Distance"].default_value = 0.0015
    L.new(hgt, bu.inputs["Height"]); L.new(bu.outputs["Normal"], b.inputs["Normal"])
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 3.0; nz.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    cr = N.new("ShaderNodeValToRGB"); cr.color_ramp.elements[0].color = srgb(hexc); c2 = [min(1, x * 1.12) for x in srgb(hexc)[:3]] + [1]
    cr.color_ramp.elements[1].color = c2; L.new(nz.outputs["Fac"], cr.inputs["Fac"])
    ao = N.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = 0.12
    mc = N.new("ShaderNodeMix"); mc.data_type = "RGBA"; mc.blend_type = "MULTIPLY"; mc.inputs["Factor"].default_value = 0.4
    L.new(cr.outputs["Color"], mc.inputs["A"]); L.new(ao.outputs["Color"], mc.inputs["B"]); L.new(mc.outputs["Result"], b.inputs["Base Color"])
    return m
polo_m = fabric("Jerry polo - FBS red pique", "#a80d22", 0.86, 0.15, "pique")
pants_m = fabric("Jerry trousers - charcoal twill", "#26292e", 0.72, 0.08, "twill")

def shell(name, keep, offset, smooth_iter, min_gap, hem=None, extend=None):
    bm = bmesh.new(); bm.from_mesh(body_ev_me); bm.verts.ensure_lookup_table(); bm.normal_update()
    lay = bm.verts.layers.int.new("orig")
    for v in bm.verts: v[lay] = v.index
    nrm = [v.normal.copy() for v in bm.verts]
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(keep(v.index) for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    for v in bm.verts: v.co += nrm[v[lay]] * offset
    for _ in range(smooth_iter):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if hem:
        for v in bm.verts:
            if v.is_boundary: hem(v, v[lay])
        for _ in range(3):
            bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary and any(e.other_vert(v).is_boundary for e in v.link_edges)], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if extend: extend(bm)
    for v in bm.verts:
        loc, n, idx, dist = bvh_body.find_nearest(v.co)
        if loc is not None and ((v.co - loc).dot(n) < 0 or dist < min_gap): v.co = loc + n * min_gap
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=0.6)
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    for p in m.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, m); col.objects.link(o); return o

def shirt_hem(v, i):
    k, t = LAB[i]
    if k.startswith("uarm"):
        s = k[-1]; a, b = J["upperarm_" + s][0], J["lowerarm_" + s][0]; n = (b - a).normalized(); p0 = a + (b - a) * SLEEVE_T
        v.co -= n * (v.co - p0).dot(n)
        c = p0 + n * (v.co - p0).dot(n); r = v.co - c                     # loose short sleeve: open up the hem a little
        v.co = c + r * 1.12
    elif v.co.z > NECKZ - 0.5 and (Vector((v.co.x, v.co.y)) - Vector((NC.x, NC.y))).length < 0.45:
        v.co.z = ring_z(v.co.x, v.co.y)
shin = [V[i].co.z for i in range(len(V)) if LAB[i][0].startswith("calf") and 0.85 < LAB[i][1] < 0.9]
CUFF_Z = sum(shin) / len(shin) if shin else 0.55
def pants_hem(v, i):
    if v.co.z < 1.4: v.co.z = CUFF_Z
    elif v.co.z > WAIST - 0.3: v.co.z = WAIST + 0.1                       # clean, level waistband
def pants_extend(bm):
    """lengthen the legs past the ankle so the cuffs break over the shoes"""
    bnd = [e for e in bm.edges if e.is_boundary and all(v.co.z < 1.0 for v in e.verts)]
    ex = bmesh.ops.extrude_edge_only(bm, edges=bnd)
    nv = [g for g in ex["geom"] if isinstance(g, bmesh.types.BMVert)]
    for v in nv: v.co.z = 0.34
    for s in (1, -1):
        side = [v for v in nv if (v.co.x > 0) == (s > 0)]
        if not side: continue
        c = sum((v.co for v in side), Vector()) / len(side)
        for v in side:
            r = Vector((v.co.x - c.x, v.co.y - c.y, 0)); v.co.x = c.x + r.x * 1.04; v.co.y = c.y + r.y * 1.04 + 0.01
# legs: straight trouser legs (min radius around each leg axis)
def straighten(o):
    for v in o.data.vertices:
        for s in "LR":
            for a, b, rmin in ((J["thigh_" + s][0], J["calf_" + s][0], 0.0), (J["calf_" + s][0], J["foot_" + s][0], 0.215)):
                ab = b - a; t = (v.co - a).dot(ab) / ab.length_squared
                if -0.05 <= t <= 1.2 and (v.co.x > 0) == (s == "L"):
                    c = a + ab * t; r = v.co - c; r.z = 0
                    rm = rmin if rmin else (0.24 if t > 0.5 else 0.0)
                    if 0 < r.length < rm: v.co = Vector((c.x, c.y, v.co.z)) + r.normalized() * rm

shirt = shell("Jerry polo shirt", lambda i: REG[i] == "shirt", 0.06, 10, 0.04, hem=shirt_hem)
pants = shell("Jerry trousers", lambda i: REG[i] == "pants" or (REG[i] == "shirt" and V[i].co.z < WAIST + 0.12 and LAB[i][0] == "torso"),
              0.075, 12, 0.06, hem=pants_hem, extend=pants_extend)
straighten(pants)

# ---------- shoes (before the cloth sim so the cuffs can rest on them) ----------
leather = bpy.data.materials.new("Jerry shoes - black leather"); leather.use_nodes = True; b = bsdf(leather)
b.inputs["Base Color"].default_value = srgb("#111111"); b.inputs["Roughness"].default_value = 0.28; b.inputs["Coat Weight"].default_value = 0.35; b.inputs["Coat Roughness"].default_value = 0.12
sole_m = bpy.data.materials.new("Jerry shoes - rubber sole"); sole_m.use_nodes = True; b = bsdf(sole_m)
b.inputs["Base Color"].default_value = srgb("#1c1b1a"); b.inputs["Roughness"].default_value = 0.8
shoes = []
for s in "LR":
    idx = [i for i in range(len(V)) if REG[i] == "shoe" and ((V[i].co.x > 0) == (s == "L"))]
    bm = bmesh.new(); vs = []
    for i in idx:
        co = V[i].co + V[i].normal * 0.05
        co.z = max(0.0, co.z)
        vs.append(bm.verts.new(co))
    bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    sm = bpy.data.meshes.new("Jerry shoe " + s); bm.to_mesh(sm); bm.free(); sm.materials.append(leather); sm.materials.append(sole_m)
    so = bpy.data.objects.new("Jerry shoe " + s, sm); col.objects.link(so)
    r = so.modifiers.new("Remesh", "REMESH"); r.mode = "VOXEL"; r.voxel_size = 0.018
    smm = so.modifiers.new("Smooth", "SMOOTH"); smm.factor = 0.9; smm.iterations = 8
    dg = bpy.context.evaluated_depsgraph_get(); nm = bpy.data.meshes.new_from_object(so.evaluated_get(dg)); so.modifiers.clear(); so.data = nm
    nm.materials.clear(); nm.materials.append(leather); nm.materials.append(sole_m)
    for p in nm.polygons:
        p.use_smooth = True
        if p.center.z < 0.075: p.material_index = 1
    for v in nm.vertices: v.co.z = max(0.0, v.co.z)
    ss = so.modifiers.new("Subdiv", "SUBSURF"); ss.levels = 1; ss.render_levels = 2
    shoes.append(so)

# ---------- cloth simulation (in real-world metres: objects scaled by 0.3048) ----------
col_body = bpy.data.objects.new("_collider body", body_ev_me.copy()); col.objects.link(col_body)
SC = 0.3048
for o in [col_body, shirt, pants] + shoes: o.scale = (SC, SC, SC)
col_body.modifiers.new("Collision", "COLLISION"); col_body.collision.thickness_outer = 0.004; col_body.collision.cloth_friction = 8
for so in shoes: so.modifiers.new("Collision", "COLLISION"); so.collision.thickness_outer = 0.003
def pin_group(o, fn):
    g = o.vertex_groups.new(name="pin")
    for v in o.data.vertices:
        w = fn(v.co)
        if w > 0: g.add([v.index], min(1.0, w), "REPLACE")
    return g
zt_p = max(v.co.z for v in pants.data.vertices)
_bm = bmesh.new(); _bm.from_mesh(shirt.data)
sleeve_hem = {v.index for v in _bm.verts if v.is_boundary and abs(v.co.x - NC.x) > 0.55}
_bm.free()
for i in sleeve_hem: pass
pin_group(shirt, lambda c: max(1.0 if c.z > NECKZ - 0.35 and abs(c.x - NC.x) < 0.42 else 0.0,
                               1.0 if c.z < WAIST + 0.05 else 0.0,
                               max(0.0, 1 - (NECKZ - 0.35 - c.z) / 0.3) * (1.0 if abs(c.x - NC.x) < 0.5 else 0.0)))
pin_group(pants, lambda c: 1.0 if c.z > zt_p - 0.22 else max(0.0, 1 - (zt_p - 0.22 - c.z) / 0.25))
shirt.vertex_groups["pin"].add(list(sleeve_hem), 1.0, "REPLACE")
def cloth(o, mass, tens, bend, shrink):
    m = o.modifiers.new("Cloth", "CLOTH"); s = m.settings
    s.quality = 7; s.mass = mass; s.tension_stiffness = tens; s.compression_stiffness = tens; s.shear_stiffness = tens * 0.5
    s.bending_stiffness = bend; s.air_damping = 1.5; s.vertex_group_mass = "pin"; s.pin_stiffness = 1.0
    s.shrink_min = shrink
    m.collision_settings.distance_min = 0.004; m.collision_settings.use_self_collision = False; m.collision_settings.collision_quality = 3
    m.point_cache.frame_start = 1; m.point_cache.frame_end = FRAMES
    return m
cloth(shirt, 0.15, 8.0, 0.05, -0.05)
cloth(pants, 0.35, 40.0, 2.5, -0.006)
sc.frame_start = 1; sc.frame_end = FRAMES
for f in range(1, FRAMES + 1):
    sc.frame_set(f)
    if f % 6 == 0: print("sim frame", f, flush=True)
dg = bpy.context.evaluated_depsgraph_get()
for o in (shirt, pants):
    nm = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); nm.name = o.data.name
    o.modifiers.clear(); o.data = nm
for o in [shirt, pants] + shoes:
    o.scale = (1, 1, 1)
    for m in list(o.modifiers):
        if m.type == "COLLISION": o.modifiers.remove(m)
bpy.data.objects.remove(col_body, do_unlink=True)
# tuck: everything of the shirt below the trouser waistband stays inside the trousers
for v in shirt.data.vertices:
    if v.co.z < zt_p - 0.03:
        loc, n, idx, dist = bvh_body.find_nearest(v.co)
        if loc is not None and dist > 0.03: v.co = loc + n * 0.03
# post: never inside the body
for o, gap in ((shirt, 0.012), (pants, 0.02)):
    for v in o.data.vertices:
        loc, n, idx, dist = bvh_body.find_nearest(v.co)
        if loc is not None and ((v.co - loc).dot(n) < 0 or dist < gap): v.co = loc + n * gap
    o.data.materials.clear(); o.data.materials.append(polo_m if o is shirt else pants_m)
    so = o.modifiers.new("Fabric thickness", "SOLIDIFY"); so.thickness = 0.012; so.offset = 1.0
    sd = o.modifiers.new("Subdiv", "SUBSURF"); sd.levels = 1; sd.render_levels = 1
    for p in o.data.polygons: p.use_smooth = True

# ---------- polo details: collar, placket, buttons; belt + buckle ----------
_bm = bmesh.new(); _bm.from_mesh(shirt.data)
ring = [v.co.copy() for v in _bm.verts if v.is_boundary and v.co.z > NECKZ - 0.4]
_bm.free()
AX = sum(abs(p.x - NC.x) for p in ring) / len(ring) * 1.22 + 0.012; AY = sum(abs(p.y - NC.y) for p in ring) / len(ring) * 1.22 + 0.012
bm = bmesh.new(); rows = []; NS = 56
for k in range(NS + 1):
    th = math.radians(-90 + 14 + (360 - 28) * k / NS); d = Vector((math.cos(th), math.sin(th), 0))
    base = Vector((NC.x + AX * d.x, NC.y + AY * d.y, 0)); base.z = ring_z(base.x, base.y)
    top = base + Vector((0, 0, 0.11)) + d * 0.006
    flap = base + d * 0.08 + Vector((0, 0, 0.02 + 0.03 * max(0.0, -d.y)))
    rows.append([bm.verts.new(base - Vector((0, 0, 0.01))), bm.verts.new(top), bm.verts.new(flap)])
for k in range(NS):
    a0, a1 = rows[k], rows[k + 1]; bm.faces.new((a0[0], a1[0], a1[1], a0[1])); bm.faces.new((a0[1], a1[1], a1[2], a0[2]))
cm = bpy.data.meshes.new("Jerry polo collar"); bm.to_mesh(cm); bm.free(); cm.materials.append(polo_m)
for p in cm.polygons: p.use_smooth = True
collar = bpy.data.objects.new("Jerry polo collar", cm); col.objects.link(collar)
s_ = collar.modifiers.new("t", "SOLIDIFY"); s_.thickness = 0.014; s_.offset = 0; collar.modifiers.new("s", "SUBSURF").levels = 1
dg = bpy.context.evaluated_depsgraph_get()
bvh_shirt = BVHTree.FromObject(shirt, dg)
def front(x, z, bvh): return bvh.ray_cast(Vector((x, -4.0, z)), Vector((0, 1, 0)))[0]
dark_red = bpy.data.materials.new("Jerry polo placket"); dark_red.use_nodes = True; bsdf(dark_red).inputs["Base Color"].default_value = srgb("#920b1d"); bsdf(dark_red).inputs["Roughness"].default_value = 0.85
bm = bmesh.new(); prow = []
z0 = ring_z(NC.x, NC.y - 1) + 0.005
for k in range(10):
    hit = front(NC.x, z0 - k * 0.045, bvh_shirt)
    if hit: prow.append([bm.verts.new(hit + Vector((dx, -0.02, 0))) for dx in (-0.055, 0.055)])
for k in range(len(prow) - 1): bm.faces.new((prow[k][0], prow[k][1], prow[k + 1][1], prow[k + 1][0]))
pl = bpy.data.meshes.new("Jerry polo placket"); bm.to_mesh(pl); bm.free(); pl.materials.append(dark_red)
po = bpy.data.objects.new("Jerry polo placket", pl); col.objects.link(po); s_ = po.modifiers.new("t", "SOLIDIFY"); s_.thickness = 0.006
button_m = bpy.data.materials.new("Jerry buttons"); button_m.use_nodes = True; bsdf(button_m).inputs["Base Color"].default_value = srgb("#ece6dc"); bsdf(button_m).inputs["Roughness"].default_value = 0.22
bm = bmesh.new()
for k in range(2):
    hit = front(NC.x, z0 - 0.08 - k * 0.2, bvh_shirt)
    if hit: bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=0.017, matrix=Matrix.Translation(hit + Vector((0, -0.03, 0))) @ Matrix.Diagonal((1, 0.4, 1, 1)))
bt = bpy.data.meshes.new("Jerry buttons"); bm.to_mesh(bt); bm.free(); bt.materials.append(button_m)
for p in bt.polygons: p.use_smooth = True
col.objects.link(bpy.data.objects.new("Jerry buttons", bt))
belt_m = bpy.data.materials.new("Jerry belt - black leather"); belt_m.use_nodes = True; b = bsdf(belt_m); b.inputs["Base Color"].default_value = srgb("#141312"); b.inputs["Roughness"].default_value = 0.38
steel = bpy.data.materials.new("Jerry buckle steel"); steel.use_nodes = True; b = bsdf(steel); b.inputs["Base Color"].default_value = srgb("#c8cacc"); b.inputs["Metallic"].default_value = 1; b.inputs["Roughness"].default_value = 0.2
dg = bpy.context.evaluated_depsgraph_get()
pv = [v.co for v in pants.data.vertices]; zt = max(p.z for p in pv)
bvh_p = BVHTree.FromPolygons(pv, [tuple(p.vertices) for p in pants.data.polygons])
PC = Vector((J["pelvis"][0].x, J["pelvis"][0].y, 0))
bm = bmesh.new(); NB = 72; rows = []
for k in range(NB):
    a = 2 * math.pi * k / NB; d = Vector((math.cos(a), math.sin(a), 0)); row = []
    for z in (zt - 0.16, zt - 0.03):
        hit = bvh_p.ray_cast(Vector((PC.x, PC.y, z)) + d * 3.0, -d)[0]
        if hit is None:
            loc, n_, i_, dd = bvh_p.find_nearest(Vector((PC.x, PC.y, z)) + d * 0.6); hit = loc
        q = hit + d * 0.024
        q.z = z; row.append(bm.verts.new(q))
    rows.append(row)
for k in range(NB):
    a0, a1 = rows[k], rows[(k + 1) % NB]; bm.faces.new((a0[0], a1[0], a1[1], a0[1]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
for _ in range(2): bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=False)
bl = bpy.data.meshes.new("Jerry belt"); bm.to_mesh(bl); bm.free(); bl.materials.append(belt_m)
for p in bl.polygons: p.use_smooth = True
belt = bpy.data.objects.new("Jerry belt", bl); col.objects.link(belt); s_ = belt.modifiers.new("t", "SOLIDIFY"); s_.thickness = 0.014; s_.offset = 1
dg = bpy.context.evaluated_depsgraph_get(); bvh_b = BVHTree.FromObject(belt, dg)
hit = front(PC.x, zt - 0.095, bvh_b)
if hit:
    bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.transform(bm, matrix=Matrix.Translation(hit + Vector((0, -0.014, 0))) @ Matrix.Diagonal((0.2, 0.022, 0.15, 1)), verts=r["verts"])
    bk = bpy.data.meshes.new("Jerry belt buckle"); bm.to_mesh(bk); bm.free(); bk.materials.append(steel)
    ob = bpy.data.objects.new("Jerry belt buckle", bk); col.objects.link(ob); bv = ob.modifiers.new("b", "BEVEL"); bv.width = 0.018; bv.segments = 3

# hide skin that is fully covered (faster, no poke-through)
vis = body.vertex_groups.new(name="visible skin")
vis.add([i for i in range(len(V)) if REG[i] == "skin" or i not in skin_v or (REG[i] == "shirt" and V[i].co.z > NECKZ - 0.35) or LAB[i][0].startswith("uarm")], 1.0, "REPLACE")
mk = body.modifiers.new("Hide under clothes", "MASK"); mk.vertex_group = "visible skin"
body.modifiers.move(len(body.modifiers) - 1, 0)
sc.frame_set(1)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath="/home/claude/work/jerry2/jerry.blend")
print("saved jerry.blend", [o.name for o in col.objects])
```

## add_jerry2.py — Jerry v2 into the store + collision check + fill light + CAM 17
```python
"""Swap the old Jerry in the v10 store file for Jerry v2 (MB-Lab based, jerry2/jerry.blend).
Everything is parented to one empty so he moves as one piece; collision check against walls/fixtures; a soft
fill light that only lights Jerry (light linking) for the close-up cameras."""
import bpy, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
F = "/home/claude/work/out/FBS Boise Store Map v10.blend"
bpy.ops.wm.open_mainfile(filepath=F)
sc = bpy.context.scene
old_root = bpy.data.objects.get("Jerry (realistic, 6ft 3in) - move me")
people = old_root.users_collection[0] if old_root else bpy.data.collections.new("5 People (Jerry - realistic)")
if old_root:
    for o in list(old_root.children_recursive): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.objects.remove(old_root, do_unlink=True)
for o in [o for o in bpy.data.objects if o.name.startswith("Jerry ")]: bpy.data.objects.remove(o, do_unlink=True)
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.hair_curves, bpy.data.images):
    for d in list(blk):
        if d.users == 0: blk.remove(d)
with bpy.data.libraries.load("/home/claude/work/jerry2/jerry.blend", link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n.startswith("Jerry ")]
root = bpy.data.objects.new("Jerry (realistic, 6ft 3in) - move me", None); root.empty_display_type = "ARROWS"; root.empty_display_size = 1.5
people.objects.link(root)
root.location = (86.3, 43.6, 0.0); root.rotation_euler = (0, 0, math.radians(100))
jcol = bpy.data.collections.get("Jerry v2 parts") or bpy.data.collections.new("Jerry v2 parts")
if jcol.name not in [c.name for c in people.children]: people.children.link(jcol)
for o in dst.objects:
    jcol.objects.link(o); o.parent = root
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
jm = [o for o in dst.objects if o.type == "MESH"]
def bvh_world(o):
    ev = o.evaluated_get(dg); me = ev.to_mesh(); mw = o.matrix_world
    vs = [mw @ v.co for v in me.vertices]; ps = [tuple(p.vertices) for p in me.polygons]; ev.to_mesh_clear()
    return BVHTree.FromPolygons(vs, ps), vs
jb = [bvh_world(o) for o in jm]
xs = [v.x for _, vs in jb for v in vs]; ys = [v.y for _, vs in jb for v in vs]
box = (min(xs) - 0.5, max(xs) + 0.5, min(ys) - 0.5, max(ys) + 0.5)
hits = []
for o in bpy.data.objects:
    if o.type != "MESH" or o in jm or o.hide_render or o.name.startswith("Ceiling") or "floor" in o.name.lower() or o.name.startswith(("Front room", "Von's", "Sales floor")): continue
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    if max(p.x for p in bb) < box[0] or min(p.x for p in bb) > box[1] or max(p.y for p in bb) < box[2] or min(p.y for p in bb) > box[3]: continue
    ob, _ = bvh_world(o)
    for (t, _), j in zip(jb, jm):
        if t.overlap(ob): hits.append((j.name, o.name))
print("Jerry v2 footprint", [round(v, 2) for v in box], "overlaps:", hits or "none", "lowest z", round(min(v.z for _, vs in jb for v in vs), 3))
# soft fill that only lights Jerry (like a photographer's bounce card), for readable eyes under top-down store lights
ld = bpy.data.lights.get("Jerry fill (lights only Jerry)") or bpy.data.lights.new("Jerry fill (lights only Jerry)", "AREA")
ld.shape = "RECTANGLE"; ld.size = 3.5; ld.size_y = 3.5; ld.energy = 140; ld.color = (1.0, 0.96, 0.9)
lo = bpy.data.objects.get("Jerry fill (lights only Jerry)") or bpy.data.objects.new("Jerry fill (lights only Jerry)", ld)
if not lo.users_collection: people.objects.link(lo)
lo.location = (91.3, 43.2, 7.0); lo.rotation_euler = (Vector((86.3, 43.6, 5.2)) - lo.location).to_track_quat("-Z", "Y").to_euler()
lo.visible_camera = False
try:
    lo.light_linking.receiver_collection = jcol
except Exception as e: print("light linking not available:", e)
rd = bpy.data.lights.get("Jerry rim (lights only Jerry)") or bpy.data.lights.new("Jerry rim (lights only Jerry)", "AREA")
rd.size = 2.0; rd.energy = 70; rd.color = (1.0, 0.97, 0.92)
ro = bpy.data.objects.get("Jerry rim (lights only Jerry)") or bpy.data.objects.new("Jerry rim (lights only Jerry)", rd)
if not ro.users_collection: people.objects.link(ro)
ro.location = (82.8, 45.8, 8.6); ro.rotation_euler = (Vector((86.3, 43.6, 5.6)) - ro.location).to_track_quat("-Z", "Y").to_euler(); ro.visible_camera = False
try: ro.light_linking.receiver_collection = jcol
except Exception as e: print("rim link", e)
c3 = bpy.data.objects.get("CAM 17 Jerry waist-up (3/4)")
if not c3:
    cd3 = bpy.data.cameras.new("CAM 17 Jerry waist-up (3/4)"); cd3.lens = 35; cd3.clip_start = 0.2
    c3 = bpy.data.objects.new("CAM 17 Jerry waist-up (3/4)", cd3); bpy.data.collections["6 Cameras + lights"].objects.link(c3)
c3.location = (91.2, 47.6, 5.6); t3 = Vector((86.3, 43.6, 4.95)); c3.rotation_euler = (t3 - c3.location).to_track_quat("-Z", "Y").to_euler()
c3.data.dof.use_dof = True; c3.data.dof.focus_distance = (Vector((86.3, 43.6, 5.6)) - c3.location).length; c3.data.dof.aperture_fstop = 2.8
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=F, compress=True)
print("saved with Jerry v2")
```

## slim_jerry.py — shrink .blend under the 20 MB transfer cap
```python
"""Shrink a .blend that contains Jerry v2 so it fits the 20 MB device-transfer limit: drop MB-Lab shader nodes we no
longer use, purge orphan images, and re-pack big PNG textures as JPEGs (2K max). usage: python3 slim_jerry.py <file.blend>"""
import bpy, sys, os
F = sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=F)
body = bpy.data.objects.get("Jerry body")
if body:
    for m in body.data.materials:
        if m and m.name.startswith("MBLab_skin3"):
            nt = m.node_tree
            for n in list(nt.nodes):
                if n.type == "GROUP" or n.type == "VALUE" or n.type == "FRAME": nt.nodes.remove(n)
            used = set()
            for l in nt.links: used.add(l.from_node.name)
            for n in list(nt.nodes):
                if n.type == "TEX_IMAGE" and n.name not in used: nt.nodes.remove(n)
for blk in (bpy.data.node_groups, bpy.data.images, bpy.data.textures):
    for _ in range(3):
        for d in list(blk):
            if d.users == 0: blk.remove(d)
os.makedirs("/home/claude/work/slim", exist_ok=True)
for im in list(bpy.data.images):
    if not im.packed_file or im.source != "FILE" or im.packed_file.size < 600_000: continue
    if im.name.startswith("Image_"): continue                      # store atlas/photos: already compact
    w, h = im.size
    if max(w, h) > 2048: im.scale(2048, int(2048 * h / w))
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in im.name)
    path = f"/home/claude/work/slim/{safe}.jpg"
    im.file_format = "JPEG"; im.save(filepath=path, quality=88)
    cs = im.colorspace_settings.name
    im.unpack(method="REMOVE") if im.packed_file else None
    im.filepath = path; im.source = "FILE"; im.reload(); im.colorspace_settings.name = cs; im.pack()
    print("jpeg", im.name, im.size[:], round(im.packed_file.size / 1e6, 2), "MB")
bpy.ops.wm.save_as_mainfile(filepath=F, compress=True)
print("saved", F, round(os.path.getsize(F) / 1e6, 1), "MB")
```

## render_v10.py — renders
```python
"""Render selected cameras from the v10 file.  usage: python3 render_v10.py <pct> <samples> <outdir> <cam-substring>..."""
import bpy, sys, os, re, time
pct, spp, outdir = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
wanted = sys.argv[4:]
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/out/FBS Boise Store Map v10.blend")
sc = bpy.context.scene
sc.render.resolution_percentage = pct; sc.cycles.samples = spp
sc.render.image_settings.file_format = "JPEG"; sc.render.image_settings.quality = 92
ceil = bpy.data.collections["4 Ceilings (render only)"]
RX, RY = sc.render.resolution_x, sc.render.resolution_y
os.makedirs(outdir, exist_ok=True)
cams = sorted((o for o in bpy.data.objects if o.type == "CAMERA"), key=lambda o: o.name)
if wanted: cams = [c for w in wanted for c in cams if w.lower() in c.name.lower()]
tl = float(os.environ.get("TIME_LIMIT", "0"))
if tl: sc.cycles.time_limit = tl
sc.render.use_persistent_data = True
sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.015
for cam in cams:
    sc.camera = cam
    sc.view_settings.exposure = float(cam.get("exposure", 0.0))
    r = cam.get("res"); sc.render.resolution_x, sc.render.resolution_y = (int(r[0]), int(r[1])) if r else (RX, RY)
    ceil.hide_render = "no ceilings" in cam.name
    fn = re.sub(r'[^A-Za-z0-9 ._()-]', '', cam.name) + ".jpg"
    sc.render.filepath = os.path.join(outdir, fn)
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f"RENDERED {fn} in {time.time()-t:.0f}s", flush=True)
ceil.hide_render = False
```

## compare.py — photo vs render sheets
```python
"""Side-by-side: AJ's photo (left) vs render (right). usage: python3 compare.py <renderdir> <outfile> <photo#:camprefix>..."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
REF = "/mnt/user-data/uploads/FBS Store Map/reference photos (Word doc)/"
rdir, out, pairs = sys.argv[1], sys.argv[2], sys.argv[3:]
H = 560
rows = []
try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
except Exception: font = ImageFont.load_default()
for p in pairs:
    num, cam = p.split(":")
    ph = Image.open(os.path.join(REF, f"{int(num):02d} - image{int(num)}.jpg")).convert("RGB")
    rf = [f for f in os.listdir(rdir) if f.startswith(cam)][0]
    rd = Image.open(os.path.join(rdir, rf)).convert("RGB")
    ph = ph.resize((int(ph.width * H / ph.height), H)); rd = rd.resize((int(rd.width * H / rd.height), H))
    row = Image.new("RGB", (ph.width + rd.width + 12, H + 30), "white")
    row.paste(ph, (0, 30)); row.paste(rd, (ph.width + 12, 30))
    d = ImageDraw.Draw(row); d.text((4, 4), f"Photo {num}", fill="black", font=font); d.text((ph.width + 16, 4), rf[:-4], fill="black", font=font)
    rows.append(row)
W = max(r.width for r in rows); sheet = Image.new("RGB", (W, sum(r.height + 10 for r in rows)), "white")
y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 10
sheet.save(out, quality=88); print(out, sheet.size)
```
