# FBS map v8/v9 pipeline (cloud Blender) — Sep 28, 2026

Rebuild order in a fresh container: pip install bpy==5.0.1 --break-system-packages; npm install three@0.128.0 (copy build/three.min.js, examples/js/exporters/GLTFExporter.js, examples/js/utils/BufferGeometryUtils.js into game/lib); Artifact read the game's index.html + tex/*; ArtifactData get layouts/main → db/layouts/main.json; patch index.html → game/index_local.html (see run_export.py notes); then run_export.py → build_v8.py → upgrade_v9.py → render_v9.py <pct> <samples> <outdir> [camera names].

index_local.html patches: local three/GLTFExporter/BufferGeometryUtils scripts; P() push gets id:it.id; g.userData.itemId=it.id; disable box batching (if(false)); window.__PRODS={prods,cans} and skip instanced products.

## export_items.js

```
// Runs inside the patched game page. Builds the store from S.items and returns a GLB (base64)
// with ONE mesh per layout item (structure + its products merged, multi-material), so every
// fixture stays a single movable object in Blender.
async (layoutItems) => {
  S.items = layoutItems;
  init3D();
  buildStore();
  // wait for photo textures (the exporter needs loaded images)
  photoTex("prod_atlas.jpg");
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const all = Object.values(TEXL);
    let ok = all.every(t => t.image && t.image.complete !== false && (t.image.width || t.image.naturalWidth));
    matCache.forEach(m => { if (m.map && !(m.map.image && (m.map.image.width || m.map.image.naturalWidth))) ok = false; });
    if (ok) break;
    await new Promise(r => setTimeout(r, 200));
  }

  const hex = c => "#" + c.clone().convertLinearToSRGB().getHexString();
  const photoName = m => { const src = m.map && m.map.image && (m.map.image.currentSrc || m.map.image.src || ""); const f = src ? src.split("/").pop() : "canvas"; return f; };
  let seq = 0;
  const nameMat = m => {
    if (m.name) return m;
    if (m.map && m.map.isCanvasTexture) m.name = (m.roughness < 0.5 ? "Floor concrete " : "Ceiling tile ") + hex(m.color) + " #" + (seq++);
    else if (m.map) m.name = "Photo " + photoName(m).replace(/\.jpg$/, "") + " #" + (seq++);
    else if (m.transparent) m.name = "Glass " + hex(m.color);
    else if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01) m.name = "LED " + hex(m.color);
    else m.name = "Paint " + hex(m.color);
    return m;
  };

  // one shared atlas material + side colours for products
  const atlasTex = photoTex("prod_atlas.jpg");
  const prodFront = new THREE.MeshStandardMaterial({ color: 0xffffff, map: atlasTex, roughness: 0.55, metalness: 0, name: "Packaging photo (atlas)" });
  const prodSide = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0, name: "Packaging sides (vertex colour)" });
  const prodCan = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.25, name: "Cans (vertex colour)" });

  // normalise a geometry to non-indexed position/normal/uv/color
  const norm = (geo, colorLin) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) { const c = new Float32Array(n * 3); const cl = colorLin || { r: 1, g: 1, b: 1 }; for (let i = 0; i < n; i++) { c[i * 3] = cl.r; c[i * 3 + 1] = cl.g; c[i * 3 + 2] = cl.b; } g.setAttribute("color", new THREE.BufferAttribute(c, 3)); }
    g.clearGroups();
    return g;
  };
  const bakeUv = (g, tex) => {
    if (!tex) return;
    const rx = tex.repeat.x, ry = tex.repeat.y, ox = tex.offset.x, oy = tex.offset.y;
    if (rx === 1 && ry === 1 && ox === 0 && oy === 0) return;
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx + ox, uv.getY(i) * ry + oy);
  };

  const P = window.__PRODS || { prods: [], cans: [] };
  const prodBy = new Map(); for (const p of P.prods) { if (!prodBy.has(p.id)) prodBy.set(p.id, []); prodBy.get(p.id).push(p); }
  const canBy = new Map(); for (const p of P.cans) { if (!canBy.has(p.id)) canBy.set(p.id, []); canBy.get(p.id).push(p); }
  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();   // face order: +x -x +y -y +z -z, 6 verts each
  const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 16).toNonIndexed();
  const G = ATLAS.grid || 16;

  const out = new THREE.Scene();
  const itemsById = new Map(S.items.map(i => [i.id, i]));
  const stats = [];
  R.store.updateMatrixWorld(true);
  for (const grp of R.store.children) {
    const id = grp.userData.itemId; if (!id) continue;
    const it = itemsById.get(id);
    const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
    const buckets = new Map();   // material -> [geo]
    const add = (m, g) => { if (!buckets.has(m)) buckets.set(m, []); buckets.get(m).push(g); };
    grp.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const m = nameMat(Array.isArray(o.material) ? o.material[0] : o.material);
      const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const g = norm(o.geometry); g.applyMatrix4(rel);
      if (rel.determinant() < 0) { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) { for (const a of Object.values(g.attributes)) { const s = a.itemSize; for (let k = 0; k < s; k++) { const t = a.array[(i + 1) * s + k]; a.array[(i + 1) * s + k] = a.array[(i + 2) * s + k]; a.array[(i + 2) * s + k] = t; } } } }
      bakeUv(g, m.map);
      add(m, g);
    });
    // products: front/back faces show an atlas cell, other faces the cell's average colour
    for (const p of (prodBy.get(id) || [])) {
      const cs = ATLAS.cells[p.br] || ATLAS.cells.boxes, e = p.m.elements;
      const hsh = Math.abs(Math.sin(e[12] * 12.9898 + e[13] * 4.1414 + e[14] * 78.233) * 43758.5453) % 1;
      const k = cs[Math.floor(hsh * cs.length)], cx = k % G, cy = Math.floor(k / G);
      const col = new THREE.Color(ATLAS.avg[k] || p.c || "#999999").convertSRGBToLinear();
      const rel = new THREE.Matrix4().multiplyMatrices(inv, p.m);
      const g = norm(unitBox, col); g.applyMatrix4(rel);
      const uv = g.attributes.uv;
      // front/back: this product's packaging photo; sides/top: a neighbouring packaging photo of the same brand (no flat-colour faces)
      const k2 = cs[(cs.indexOf(k) + 1 + Math.floor(hsh * 7)) % cs.length], cx2 = k2 % G, cy2 = Math.floor(k2 / G);
      for (let i = 0; i < 36; i++) { const u = uv.getX(i), v = uv.getY(i); const [X, Y] = i >= 24 ? [cx, cy] : [cx2, cy2];
        uv.setXY(i, (X + 0.04 + u * 0.92) / G, (G - 1 - Y + 0.04 + v * 0.92) / G); }
      const mk = src => { const ng = new THREE.BufferGeometry(); for (const [n, a] of Object.entries(src.attributes)) ng.setAttribute(n, new THREE.BufferAttribute(a.array, a.itemSize)); return ng; };
      add(prodFront, mk(g));
    }
    for (const p of (canBy.get(id) || [])) {
      const col = new THREE.Color(p.c || "#cccccc").convertSRGBToLinear();
      const g = norm(unitCyl, col); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, p.m)); add(prodCan, g);
    }
    // one single-material child mesh per material (multi-material glTF primitives duplicate faces in r128)
    const node = new THREE.Group();
    node.name = `${it.name || it.type} [${id}]`;
    node.position.copy(grp.position); node.quaternion.copy(grp.quaternion);
    node.userData = { fbs_id: id, fbs_type: it.type, fbs_name: it.name || "", fbs_brand: it.brand || "", fbs_brand2: it.brand2 || "", fbs_locked: !!it.locked, fbs_w: it.w, fbs_d: it.d, fbs_h: it.h || 0 };
    let tris = 0;
    for (const [m, list] of buckets) { const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(list, false); if (!merged) continue; const cm = new THREE.Mesh(merged, m); cm.name = node.name + " | " + m.name; node.add(cm); tris += merged.attributes.position.count / 3; }
    if (!node.children.length) continue;
    out.add(node);
    stats.push([id, it.type, tris, node.children.length]);
  }

  // ceilings (one mesh per floor area) — lamp panels named so Blender can make them emit
  R.ceil.updateMatrixWorld(true);
  let ci = 0;
  for (const grp of R.ceil.children) {
    const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert(); const buckets = new Map();
    grp.traverse(o => { if (!o.isMesh) return; let m = o.material; if (m.isMeshBasicMaterial) { m.name = "Ceiling light panel"; } else nameMat(m);
      const g = norm(o.geometry); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); bakeUv(g, m.map); if (!buckets.has(m)) buckets.set(m, []); buckets.get(m).push(g); });
    const floors = S.items.filter(i => i.type === "floor" && i.ceil); const f = floors[ci++];
    const node = new THREE.Group(); node.name = `Ceiling - ${f ? f.name : ci}`; node.position.copy(grp.position); node.quaternion.copy(grp.quaternion); node.userData = { fbs_ceiling: true };
    for (const [m, l] of buckets) { const cm = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(l, false), m); cm.name = node.name + " | " + m.name; node.add(cm); }
    out.add(node);
  }

  // Jerry (scale figure) — keep his hierarchy; Blender joins it
  if (R.jerry) { const j = R.jerry.clone(true); j.name = "Jerry (6ft 3in scale figure)"; j.position.set(0, 0, 0); j.rotation.set(0, 0, 0); j.traverse(o => { if (o.isMesh && !o.material.name) o.material.name = "Jerry " + hex(o.material.color); }); out.add(j); }

  const glb = await new Promise((res, rej) => new THREE.GLTFExporter().parse(out, res, { binary: true, onlyVisible: false, maxTextureSize: 4096 }));
  const bytes = new Uint8Array(glb); let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return { b64: btoa(bin), stats, prods: P.prods.length, cans: P.cans.length, mats: matCache.size };
}
```

## run_export.py

```
import base64, json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright

ROOT = "/home/claude/work/game"
PORT = 8765
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
items = json.load(open("/home/claude/work/db/layouts/main.json"))["items"]
js = open("/home/claude/work/export_items.js").read()
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={"width": 1280, "height": 800})
        logs = []
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        pg.goto(f"http://127.0.0.1:{PORT}/index_local.html", wait_until="load", timeout=60000)
        pg.wait_for_timeout(1500)
        res = pg.evaluate(js, items)
        glb = base64.b64decode(res["b64"])
        open("/home/claude/work/fbs_v8_items.glb", "wb").write(glb)
        print("GLB bytes", len(glb), "items", len(res["stats"]), "prods", res["prods"], "cans", res["cans"], "mats", res["mats"])
        print("biggest", sorted(res["stats"], key=lambda s: -s[2])[:6])
        for l in logs[-15:]: print(l[:300])
        b.close()
finally:
    srv.terminate()
```

## build_v8.py

```
"""Build 'FBS Boise Store Map v8.blend' from the game's exported layout (one object per fixture)."""
import bpy, math, sys
from mathutils import Vector

GLB = "/home/claude/work/fbs_v8_items.glb"
OUT = "/home/claude/work/out/FBS Boise Store Map v8.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.name = "FBS Boise"
# import FIRST (the glTF importer rescales by the scene unit scale), then switch the display to feet
bpy.ops.import_scene.gltf(filepath=GLB, merge_vertices=False, import_shading="FLAT", import_scene_extras=True)
us = sc.unit_settings
us.system = "IMPERIAL"; us.scale_length = 0.3048; us.length_unit = "FEET"   # 1 Blender unit = 1 ft

# ---------- collections ----------
def coll(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in [x.name for x in (parent or sc.collection).children]:
        (parent or sc.collection).children.link(c)
    return c
C_FIX = coll("1 Fixed - walls, doors, desks (locked)")
C_FLR = coll("2 Floors, zones, stairs")
C_MOV = coll("3 Fixtures - movable")
C_CEI = coll("4 Ceilings (render only)")
C_PPL = coll("5 People")
C_CAM = coll("6 Cameras + lights")
C_OFF = coll("0 Imported (empty)")

def move_to(o, c):
    for u in list(o.users_collection): u.objects.unlink(o)
    c.objects.link(o)

FIXED_TYPES = {"wall", "door", "opening", "arch", "column", "ring"}
FLOOR_TYPES = {"floor", "zone", "stairs", "platform"}

# ---------- Jerry: join his parts ----------
jerry_root = next((o for o in bpy.data.objects if o.name.startswith("Jerry")), None)
if jerry_root:
    parts = [o for o in jerry_root.children_recursive if o.type == "MESH"]
    empties = [o for o in jerry_root.children_recursive if o.type != "MESH"] + [jerry_root]
    for p in parts:
        mw = p.matrix_world.copy(); p.parent = None; p.matrix_world = mw
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts, selected_objects=parts):
        bpy.ops.object.join()
    J = parts[0]; J.name = "Jerry (6ft 3in scale figure)"
    # put his origin at his feet so he stands on the floor
    with bpy.context.temp_override(active_object=J, selected_editable_objects=[J], selected_objects=[J]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    from mathutils import Matrix
    xs = [v.co.x for v in J.data.vertices]; ys = [v.co.y for v in J.data.vertices]; zs = [v.co.z for v in J.data.vertices]
    J.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    for e in empties: bpy.data.objects.remove(e, do_unlink=True)
    J.name = "Jerry (6ft 3in scale figure)"; J.data.name = J.name
    move_to(J, C_PPL)
    J.location = (86.0, 45.5, 0.0); J.rotation_euler = (0, 0, math.radians(90))   # facing the SDB (west)

# ---------- join each item's per-material parts into ONE object (origin = the item's centre) ----------
for e in [o for o in bpy.data.objects if o.type == "EMPTY" and ("fbs_id" in o.keys() or o.get("fbs_ceiling"))]:
    kids = [k for k in e.children if k.type == "MESH"]
    if not kids: continue
    with bpy.context.temp_override(active_object=kids[0], selected_editable_objects=kids, selected_objects=kids):
        if len(kids) > 1: bpy.ops.object.join()
    k = kids[0]; mw = k.matrix_world.copy(); k.parent = None; k.matrix_world = mw
    for key in e.keys(): k[key] = e[key]
    nm = e.name; bpy.data.objects.remove(e, do_unlink=True); k.name = nm

# ---------- sort fixtures ----------
n = {"fix": 0, "flr": 0, "mov": 0, "cei": 0}
for o in list(bpy.data.objects):
    if o.type != "MESH" or o.name.startswith("Jerry"): continue
    t = o.get("fbs_type", "")
    if o.get("fbs_ceiling"):
        move_to(o, C_CEI); n["cei"] += 1; continue
    name = o.get("fbs_name", o.name)
    fixed = t in FIXED_TYPES or "TOM'S DESK" in name.upper() or bool(o.get("fbs_locked"))
    if fixed:
        move_to(o, C_FIX); n["fix"] += 1
        o.lock_location = (True, True, True); o.lock_rotation = (True, True, True); o.lock_scale = (True, True, True)
    elif t in FLOOR_TYPES:
        move_to(o, C_FLR); n["flr"] += 1
        if t == "floor": o.lock_location = (True, True, True); o.lock_rotation = (True, True, True)
    else:
        move_to(o, C_MOV); n["mov"] += 1
    o.data.name = o.name
# drop leftover empties from the importer
for o in list(bpy.data.objects):
    if o.type == "EMPTY" and not o.children: bpy.data.objects.remove(o, do_unlink=True)
if not C_OFF.objects: bpy.data.collections.remove(C_OFF)
print("sorted", n)

# ceilings hidden in the viewport (so you can see in from above) but on for renders
vl = bpy.context.view_layer
vl.layer_collection.children[C_CEI.name].hide_viewport = True

# ---------- materials ----------
def principled(m):
    return next((nd for nd in m.node_tree.nodes if nd.type == "BSDF_PRINCIPLED"), None) if m.use_nodes else None

for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; N = nt.nodes; L = nt.links
    if m.name.startswith("Ceiling light panel"):
        N.clear(); out = N.new("ShaderNodeOutputMaterial"); em = N.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (1.0, 0.975, 0.93, 1); em.inputs["Strength"].default_value = 9.0
        L.new(em.outputs[0], out.inputs["Surface"]); continue
    bs = principled(m)
    if bs is None: continue
    if m.name.startswith(("Packaging sides", "Cans")):
        base = bs.inputs["Base Color"]
        if not base.is_linked:
            ca = N.new("ShaderNodeVertexColor"); ca.layer_name = "Color"
            L.new(ca.outputs["Color"], base)
    if m.name.startswith("Glass"):
        bs.inputs["Roughness"].default_value = 0.05
        bs.inputs["Transmission Weight"].default_value = 0.0
    if m.name.startswith("Floor concrete"):
        bs.inputs["Roughness"].default_value = 0.38
        bs.inputs["Specular IOR Level"].default_value = 0.5
    # keep photo emission subtle (the photos already contain the store's light)
    if m.name.startswith("Photo"):
        es = bs.inputs.get("Emission Strength")
        if es is not None and es.default_value > 0: es.default_value = min(es.default_value, 0.35)

# ---------- world + sun (the sun only matters for the aerial views, ceilings block it inside) ----------
w = bpy.data.worlds.new("Store world"); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.78, 0.8, 0.83, 1); bg.inputs[1].default_value = 0.45
sun_d = bpy.data.lights.new("Sun (aerial views)", "SUN"); sun_d.energy = 3.2; sun_d.angle = math.radians(2.5); sun_d.color = (1, 0.96, 0.9)
sun = bpy.data.objects.new("Sun (aerial views)", sun_d); sun.rotation_euler = (math.radians(24), math.radians(-10), math.radians(-30)); C_CAM.objects.link(sun)

# ---------- cameras ----------
def cam(name, loc, look, lens=24, ortho=None):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_start = 0.3; cd.clip_end = 1500
    if ortho: cd.type = "ORTHO"; cd.ortho_scale = ortho
    o = bpy.data.objects.new(name, cd); C_CAM.objects.link(o)
    o.location = loc
    d = Vector(look) - Vector(loc); o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o
E = 5.6   # eye height
cams = [
    cam("CAM 01 Front door looking in", (114.0, 3.0, E), (98.0, 38.0, 4.2), 22),
    cam("CAM 02 Arches to SDB", (100.8, 46.2, E + 0.4), (70.0, 43.0, 3.0), 22),
    cam("CAM 03 SDB and aisles", (92.0, 33.5, E + 0.6), (66.0, 48.0, 3.0), 20),
    cam("CAM 04 Into warehouse", (47.0, 60.0, E + 0.4), (6.0, 44.0, 5.0), 20),
    cam("CAM 05 Packout wall aisle", (84.0, 74.0, E), (52.0, 77.5, 4.0), 22),
    cam("CAM 06 Decking wall", (85.5, 5.2, E - 0.2), (54.0, 1.8, 4.2), 22),
    cam("CAM 07 Aerial dollhouse (no ceilings)", (118.0, -58.0, 118.0), (84.0, 40.0, 0.0), 30),
    cam("CAM 08 Plan top-down (no ceilings)", (84.5, 40.0, 220.0), (84.5, 40.0, 0.0), 50, ortho=176),
]
sc.camera = cams[0]

# ---------- render settings ----------
sc.render.engine = "CYCLES"
cy = sc.cycles
cy.device = "CPU"; cy.samples = 40; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.03
cy.use_denoising = True
try: cy.denoiser = "OPENIMAGEDENOISE"
except Exception: pass
cy.max_bounces = 6; cy.diffuse_bounces = 3; cy.glossy_bounces = 2; cy.transmission_bounces = 4; cy.transparent_max_bounces = 8
cy.sample_clamp_indirect = 8.0
sc.render.resolution_x = 1600; sc.render.resolution_y = 900; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = "AgX"
try: sc.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass
sc.view_settings.exposure = 0.0

# ---------- readme inside the file ----------
txt = bpy.data.texts.new("READ ME - FBS map v8")
txt.write("""FBS Boise Store Map v8 - built from the saved layout in the FBS Boise Store Walk game (87 pieces).

Units: 1 Blender unit = 1 foot (Scene > Units is set to Imperial, feet). X runs west->east (0 = west wall),
Y runs south->north (0 = south wall / front door side), Z is up.

Collections (Outliner):
  1 Fixed      - walls, doors, openings, arches, columns, both sales desks, Tom's desk. Transforms are LOCKED
                 (the remodel doesn't move these). To unlock: N panel > Item > click the padlocks.
  2 Floors     - floor areas, loft/mezzanine zones, stairs, laser deck.
  3 Fixtures   - gondolas, wall units, racks, displays, towers, tables, counters. One object per fixture,
                 products included. Select one, press G to move, R Z 90 to rotate.
  4 Ceilings   - hidden in the viewport (eye icon) so you can see in; they still render. Turn the camera icon off
                 for aerial/plan renders.
  5 People     - Jerry, 6'3" scale figure.
  6 Cameras    - CAM 01-08. Numpad 0 looks through the active camera; right-click a camera > Set Active Camera.

Each object keeps its game data as custom properties (Object > Custom Properties): fbs_id, fbs_type,
fbs_brand, width/depth/height in feet.
Render: Cycles, 40 samples + denoise. F12 renders the active camera.
""")

# ---------- save ----------
import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print("saved", OUT, "objects", len(bpy.data.objects), "materials", len(bpy.data.materials), "images", len(bpy.data.images))
```

## upgrade_v9.py

```
"""v9 high-end pass on top of v8: no blocky edges, real materials, calibrated lighting.
usage: python3 upgrade_v9.py   (reads out/...v8.blend, writes out/...v9.blend)"""
import bpy, math, re

SRC = "/home/claude/work/out/FBS Boise Store Map v8.blend"
OUT = "/home/claude/work/out/FBS Boise Store Map v9.blend"
bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene

def hexcol(h):
    h = h.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), 1.0)

def bsdf(m):
    return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)

def texcoord(nt):
    tc = next((n for n in nt.nodes if n.type == "TEX_COORD"), None)
    return tc or nt.nodes.new("ShaderNodeTexCoord")

def add_bump(m, scale=30.0, strength=0.04, distance=0.02):
    nt = m.node_tree; b = bsdf(m)
    if b is None or b.inputs["Normal"].is_linked: return
    tc = texcoord(nt); nz = nt.nodes.new("ShaderNodeTexNoise"); bu = nt.nodes.new("ShaderNodeBump")
    nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = 4.0
    bu.inputs["Strength"].default_value = strength; bu.inputs["Distance"].default_value = distance
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"]); nt.links.new(nz.outputs["Fac"], bu.inputs["Height"])
    nt.links.new(bu.outputs["Normal"], b.inputs["Normal"])

def rough_variation(m, lo, hi, scale=0.35):
    nt = m.node_tree; b = bsdf(m)
    tc = texcoord(nt); nz = nt.nodes.new("ShaderNodeTexNoise"); mr = nt.nodes.new("ShaderNodeMapRange")
    nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = 6.0; nz.inputs["Roughness"].default_value = 0.6
    mr.inputs["To Min"].default_value = lo; mr.inputs["To Max"].default_value = hi
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"]); nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])

def wood(m, base_hex, grain=3.0, contrast=0.35):
    """procedural wood grain driven off object coordinates (feet)"""
    nt = m.node_tree; b = bsdf(m); L = nt.links
    tc = texcoord(nt); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.35, 0.35, 4.0)
    wv = nt.nodes.new("ShaderNodeTexWave"); wv.wave_type = "BANDS"; wv.bands_direction = "X"
    wv.inputs["Scale"].default_value = grain; wv.inputs["Distortion"].default_value = 9.0; wv.inputs["Detail"].default_value = 4.0; wv.inputs["Detail Scale"].default_value = 1.5
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 18.0; nz.inputs["Detail"].default_value = 8.0
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "FLOAT"; mx.inputs["Factor"].default_value = 0.25
    cr = nt.nodes.new("ShaderNodeValToRGB")
    c = hexcol(base_hex)
    dark = tuple(max(0, v * (1 - contrast)) for v in c[:3]) + (1,); light = tuple(min(1, v * (1 + contrast * 0.8)) for v in c[:3]) + (1,)
    cr.color_ramp.elements[0].color = dark; cr.color_ramp.elements[1].color = light
    L.new(tc.outputs["Object"], mp.inputs["Vector"]); L.new(mp.outputs["Vector"], wv.inputs["Vector"]); L.new(mp.outputs["Vector"], nz.inputs["Vector"])
    L.new(wv.outputs["Fac"], mx.inputs[2]); L.new(nz.outputs["Fac"], mx.inputs[3]); L.new(mx.outputs[0], cr.inputs["Fac"])
    L.new(cr.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.52
    bu = nt.nodes.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = 0.08; bu.inputs["Distance"].default_value = 0.01
    L.new(wv.outputs["Fac"], bu.inputs["Height"]); L.new(bu.outputs["Normal"], b.inputs["Normal"])

SHELF_WHITES = {"#e9e9e6", "#f2f1ec", "#efefec", "#f1f1ee", "#f2f2ee", "#d5d9db", "#c9ccce"}
WOODS = {"#8a5a34": 3.0, "#9a6a3c": 2.4, "#5b3a1e": 2.0, "#d9b98a": 4.0, "#cdbf9f": 4.0}
METALS = {"#9aa0a4", "#a7aaac", "#b8bdc0", "#6b6d70", "#6b6f73", "#6d7275"}
for m in bpy.data.materials:
    if not m.node_tree or m.name.startswith("Jerry"): continue
    b = bsdf(m); nt = m.node_tree
    hx = (re.search(r"#([0-9a-f]{6})", m.name) or [None, None])[1]
    hx = "#" + hx if hx else None
    if m.name.startswith("Ceiling light panel"):
        em = next(n for n in nt.nodes if n.type == "EMISSION"); bb = nt.nodes.new("ShaderNodeBlackbody"); bb.inputs[0].default_value = 5000
        nt.links.new(bb.outputs[0], em.inputs["Color"]); em.inputs["Strength"].default_value = 8.5
        continue
    if b is None: continue
    if m.name.startswith("Paint"):
        if hx in WOODS:
            wood(m, hx, WOODS[hx])
        elif hx in METALS:
            b.inputs["Metallic"].default_value = 0.65; b.inputs["Roughness"].default_value = 0.38; add_bump(m, 60, 0.015, 0.005)
        elif hx in SHELF_WHITES:
            b.inputs["Roughness"].default_value = 0.42; add_bump(m, 80, 0.012, 0.004)       # powder-coated steel
        else:
            b.inputs["Roughness"].default_value = 0.78; add_bump(m, 28, 0.035, 0.02)        # painted drywall / MDF
    elif m.name.startswith("Floor concrete"):
        rough_variation(m, 0.16, 0.48, 0.25)
        b.inputs["Coat Weight"].default_value = 0.25; b.inputs["Coat Roughness"].default_value = 0.08
        add_bump(m, 6, 0.008, 0.006)
    elif m.name.startswith("Glass"):
        for inp in ("Alpha",):
            if b.inputs[inp].is_linked: nt.links.remove(b.inputs[inp].links[0])
        b.inputs["Alpha"].default_value = 1.0
        b.inputs["Transmission Weight"].default_value = 1.0; b.inputs["Roughness"].default_value = 0.02; b.inputs["IOR"].default_value = 1.5
        b.inputs["Base Color"].default_value = (0.9, 0.96, 0.97, 1)
        base = b.inputs["Base Color"]
        if base.is_linked: nt.links.remove(base.links[0])
    elif m.name.startswith(("Packaging", "Cans")):
        b.inputs["Roughness"].default_value = 0.4 if m.name.startswith("Packaging") else 0.3
        b.inputs["Coat Weight"].default_value = 0.12
    elif m.name.startswith("Ceiling tile"):
        b.inputs["Roughness"].default_value = 0.92; add_bump(m, 120, 0.05, 0.01)

# ---------- pegboard backs on gondolas / wall units (their own material copy, so door frames etc. stay plain) ----------
def pegboard(m):
    nt = m.node_tree; b = bsdf(m); L = nt.links
    tc = texcoord(nt); vo = nt.nodes.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 12.0   # 1" hole grid
    vo.inputs["Randomness"].default_value = 0.0
    cr = nt.nodes.new("ShaderNodeValToRGB"); cr.color_ramp.interpolation = "CONSTANT"
    cr.color_ramp.elements[0].position = 0.0; cr.color_ramp.elements[0].color = (0.02, 0.02, 0.02, 1)
    cr.color_ramp.elements[1].position = 0.16; cr.color_ramp.elements[1].color = (1, 1, 1, 1)
    L.new(tc.outputs["Object"], vo.inputs["Vector"]); L.new(vo.outputs["Distance"], cr.inputs["Fac"])
    base = b.inputs["Base Color"]; src = base.links[0].from_socket if base.is_linked else None
    mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1.0
    if src: L.new(src, mul.inputs["A"])
    else: mul.inputs["A"].default_value = base.default_value
    L.new(cr.outputs["Color"], mul.inputs["B"]); L.new(mul.outputs["Result"], base)
    bu = nt.nodes.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = 0.4; bu.inputs["Distance"].default_value = 0.01
    L.new(cr.outputs["Color"], bu.inputs["Height"])
    if b.inputs["Normal"].is_linked: nt.links.remove(b.inputs["Normal"].links[0])
    L.new(bu.outputs["Normal"], b.inputs["Normal"])
peg_cache = {}
for o in bpy.data.collections["3 Fixtures - movable"].objects:
    if o.get("fbs_type") not in ("gondola", "wallunit") or o.get("fbs_brand") in ("decking", "mugs"): continue
    for s in o.material_slots:
        m = s.material
        if not m or not m.name.startswith("Paint #"): continue
        hx = m.name[6:13]
        if hx not in ("#c9ccce", "#1c1c1c", "#0b6f78", "#1846a8", "#a3101a"): continue
        if m.name not in peg_cache:
            pm = m.copy(); pm.name = "Pegboard " + hx; pegboard(pm); peg_cache[m.name] = pm
        s.material = peg_cache[m.name]
print("pegboard materials:", list(peg_cache))

# ---------- real stairs (treads, risers, stringers, handrail) + rubber cove base on every wall ----------
import bmesh
from mathutils import Vector, Matrix

def mat_named(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; bb = bsdf(m)
    bb.inputs["Base Color"].default_value = color; bb.inputs["Roughness"].default_value = rough; bb.inputs["Metallic"].default_value = metal
    return m

def quad_box(bm, corners, mi):
    """corners: 8 Vectors (bottom 4 then top 4, same winding)"""
    vs = [bm.verts.new(c) for c in corners]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    for f in faces:
        fc = bm.faces.new([vs[i] for i in f]); fc.material_index = mi

def abox(bm, x0, x1, y0, y1, z0, z1, mi):
    quad_box(bm, [Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0)),
                  Vector((x0, y0, z1)), Vector((x1, y0, z1)), Vector((x1, y1, z1)), Vector((x0, y1, z1))], mi)

def slope_box(bm, xa, za, xb, zb, y0, y1, depth, mi):
    """a board whose top edge runs from (xa,za) to (xb,zb), 'depth' tall, spanning y0..y1"""
    c = [Vector((xa, y0, za - depth)), Vector((xb, y0, zb - depth)), Vector((xb, y1, zb - depth)), Vector((xa, y1, za - depth)),
         Vector((xa, y0, za)), Vector((xb, y0, zb)), Vector((xb, y1, zb)), Vector((xa, y1, za))]
    quad_box(bm, c, mi)

wood = bpy.data.materials.get("Paint #8a5a34")
steel = mat_named("Powder-coat black steel", (0.018, 0.018, 0.02, 1), 0.35, 0.8)
drywall = bpy.data.materials.get("Paint #e6dcc6") or mat_named("Drywall", (0.78, 0.74, 0.66, 1), 0.8)
cove = mat_named("Rubber cove base", (0.035, 0.035, 0.037, 1), 0.55)
stairs_done = 0
for o in list(bpy.data.objects):
    if o.get("fbs_type") != "stairs": continue
    w, d, h = float(o["fbs_w"]), float(o["fbs_d"]), float(o["fbs_h"] or 10)
    n = max(4, round(h / 0.62)); run = w / n; rise = h / n
    me = bpy.data.meshes.new(o.name + " (stairs)"); bm = bmesh.new()
    for k in range(n):
        u0 = -w / 2 + k * run; top = (k + 1) * rise
        abox(bm, u0 - 0.09, u0 + run, -d / 2 + 0.12, d / 2 - 0.12, top - 0.11, top, 0)            # tread with nosing
        abox(bm, u0, u0 + 0.06, -d / 2 + 0.12, d / 2 - 0.12, top - rise, top - 0.11, 0)          # riser
    for yy in (-d / 2, d / 2 - 0.12):                                                            # stringers
        slope_box(bm, -w / 2 - 0.1, rise * 0.9, w / 2, h + 0.05, yy, yy + 0.12, 1.1, 0)
    # handrail on the open side: posts + sloped top rail + mid rail
    ry = d / 2 - 0.06; posts = max(2, int(w / 3.5) + 1)
    for i in range(posts):
        u = -w / 2 + 0.3 + i * (w - 0.6) / (posts - 1); zb = (int((u + w / 2) / run) + 1) * rise
        abox(bm, u - 0.06, u + 0.06, ry - 0.06, ry + 0.06, zb, zb + 3.0, 1)
    slope_box(bm, -w / 2 + 0.2, rise + 3.1, w / 2, h + 3.1, ry - 0.09, ry + 0.09, 0.16, 1)
    slope_box(bm, -w / 2 + 0.2, rise + 1.6, w / 2, h + 1.6, ry - 0.04, ry + 0.04, 0.08, 1)
    abox(bm, -w / 2, w / 2, -d / 2 - 0.1, -d / 2, 0, h + 3, 2)                                  # wall side
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    ca = me.color_attributes.new("Color", "BYTE_COLOR", "CORNER")   # imported paints multiply by this attribute
    for dt in ca.data: dt.color = (1, 1, 1, 1)
    for m in (wood, steel, drywall): me.materials.append(m)
    no = bpy.data.objects.new(o.name, me); no.matrix_world = o.matrix_world.copy()
    for k in o.keys(): no[k] = o[k]
    for c in o.users_collection: c.objects.link(no)
    bpy.data.objects.remove(o, do_unlink=True); no.name = no.name.replace(".001", "")
    stairs_done += 1
cove_done = 0
for o in list(bpy.data.objects):
    if o.get("fbs_type") != "wall": continue
    w, d = float(o["fbs_w"]), float(o["fbs_d"])
    me = bpy.data.meshes.new(o.name + " cove base"); bm = bmesh.new()
    abox(bm, -w / 2, w / 2, -d / 2 - 0.025, d / 2 + 0.025, 0, 0.33, 0); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free(); me.materials.append(cove)
    cb = bpy.data.objects.new(o.name + " - cove base", me); cb.matrix_world = o.matrix_world.copy()
    for c in o.users_collection: c.objects.link(cb)
    cb.parent = o; cb.matrix_parent_inverse = o.matrix_world.inverted()
    cove_done += 1
print("stairs rebuilt:", stairs_done, "cove base on walls:", cove_done)

# ---------- no blocky edges: weld split faces, then bevel + harden normals ----------
BEVEL_COLLS = ["1 Fixed - walls, doors, desks (locked)", "3 Fixtures - movable"]
count = 0
for cname in BEVEL_COLLS + ["2 Floors, zones, stairs"]:
    for o in bpy.data.collections[cname].objects:
        if o.type != "MESH": continue
        if cname.startswith("2") and o.get("fbs_type") not in ("stairs", "zone", "platform"): continue
        w = o.modifiers.new("Weld (join split faces)", "WELD"); w.merge_threshold = 0.0008
        bv = o.modifiers.new("Bevel (soft edges)", "BEVEL")
        bv.width = 0.028; bv.segments = 2; bv.limit_method = "ANGLE"; bv.angle_limit = math.radians(35)
        bv.use_clamp_overlap = True; bv.harden_normals = True; bv.miter_outer = "MITER_ARC"
        for p in o.data.polygons: p.use_smooth = True
        count += 1
print("bevelled objects:", count)

# ---------- Jerry stays out of renders until the realistic (MPFB) Jerry replaces him ----------
for o in bpy.data.collections["5 People"].objects: o.hide_render = True

# ---------- render quality ----------
cy = sc.cycles
cy.samples = 96; cy.adaptive_threshold = 0.015; cy.use_denoising = True
cy.max_bounces = 8; cy.diffuse_bounces = 4; cy.glossy_bounces = 4; cy.transmission_bounces = 8
cy.sample_clamp_indirect = 6.0; cy.use_light_tree = True
sc.render.resolution_x = 1920; sc.render.resolution_y = 1080; sc.render.resolution_percentage = 100
sc.render.film_transparent = False
w = sc.world; w.node_tree.nodes["Background"].inputs[1].default_value = 0.3

bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print("saved", OUT)
```

## render_v9.py

```
"""Render selected cameras from the v8 file.  usage: python3 render_v8.py <pct> <samples> <outdir> <cam-substring>..."""
import bpy, sys, os, re, time
pct, spp, outdir = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
wanted = sys.argv[4:]
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/out/FBS Boise Store Map v9.blend")
sc = bpy.context.scene
sc.render.resolution_percentage = pct; sc.cycles.samples = spp
sc.render.image_settings.file_format = "JPEG"; sc.render.image_settings.quality = 92
ceil = bpy.data.collections["4 Ceilings (render only)"]
os.makedirs(outdir, exist_ok=True)
for cam in sorted((o for o in bpy.data.objects if o.type == "CAMERA"), key=lambda o: o.name):
    if wanted and not any(w.lower() in cam.name.lower() for w in wanted): continue
    sc.camera = cam
    ceil.hide_render = "no ceilings" in cam.name
    fn = re.sub(r'[^A-Za-z0-9 ._()-]', '', cam.name) + ".jpg"
    sc.render.filepath = os.path.join(outdir, fn)
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f"RENDERED {fn} in {time.time()-t:.0f}s", flush=True)
ceil.hide_render = False
```
