/* Department blocks in 3D (OWNER RULES v3.1 rule 2, docs/DESIGN.md 5): translucent coloured volumes (8 ft by
 * default, editable) over their footprint (rectangle or polygon), a crisp edge outline, and a hanging sign with the
 * department's name as a DOM label (textContent) projected from the top of the block. Also: which block a pointer
 * ray hits (for selecting and dragging in the Orbit view) and a dashed ghost while placing one. Meshes are rebuilt
 * only for blocks whose geometry changed. */
import {lin} from "./scene.js";
import {outline, blockArea} from "../core/areas.js";
import {rayPrism} from "../core/geometry.js";
import {colourOf} from "../plan2d/blocks.js";
import {formatSqft} from "../core/units.js";

export function createBlocks3D(R, host) {
  const THREE = R.THREE;
  const group = new THREE.Group(); group.name = "blocks"; group.renderOrder = 6;
  R.scene.add(group);
  const byId = new Map(); // id -> {sig, mesh, edges, label, item}
  const v = new THREE.Vector3();
  let shown = true, selected = new Set(), ghost = null, dark = false, issues = new Set(), issueColour = "#C42B2B";

  function geometryFor(it) {
    const pts = outline(it);
    // the prism in the item's own frame is simpler, but a polygon's corners are already world points: extrude in world
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ExtrudeGeometry(shape, {depth: Math.max(0.2, it.h || 8), bevelEnabled: false});
    geo.rotateX(-Math.PI / 2); // extrude goes along +z; rotateX(-90) maps (x, y, depth) to (x, depth, -y) = three.js (east, up, -north)
    return geo;
  }
  function makeEntry(it, col) {
    const geo = geometryFor(it);
    const mat = new THREE.MeshStandardMaterial({color: lin(col), transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.9, metalness: 0, side: THREE.DoubleSide});
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 6; mesh.userData.blockId = it.id;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), new THREE.LineBasicMaterial({color: lin(col), transparent: true, opacity: 0.9}));
    edges.renderOrder = 7;
    const label = document.createElement("span"); label.className = "lbl3d sign"; label.style.setProperty("--c", col);
    const b = document.createElement("b"); const s = document.createElement("span"); label.append(b, s);
    host.appendChild(label);
    return {mesh, edges, label, geo, mat};
  }
  function sig(it) { return [it.x, it.y, it.w, it.d, it.h, it.rot, it.shape, JSON.stringify(it.pts || null)].join("|"); }
  function dispose(e) { group.remove(e.mesh, e.edges); e.geo.dispose(); e.mat.dispose(); e.edges.geometry.dispose(); e.edges.material.dispose(); e.label.remove(); }

  /** Rebuilds what changed. cats = Map key -> merged category; isDark picks the colour. */
  function update(layout, cats, isDark) {
    dark = !!isDark;
    const seen = new Set();
    for (const it of layout.items) {
      if (it.type !== "area") continue;
      seen.add(it.id);
      const cat = cats.get(it.cat), col = colourOf(cat, dark), s = sig(it) + "|" + col;
      let e = byId.get(it.id);
      if (e && e.sig !== s) { dispose(e); e = null; }
      if (!e) { e = makeEntry(it, col); e.sig = s; byId.set(it.id, e); group.add(e.mesh, e.edges); }
      e.item = it; e.cat = cat;
      e.label.firstChild.textContent = String((cat && cat.name) || it.name || "Department").toUpperCase();
      e.label.lastChild.textContent = formatSqft(blockArea(it));
      e.top = new THREE.Vector3(it.x, (it.h || 8) + 0.6, -it.y);
    }
    for (const [id, e] of byId) if (!seen.has(id)) { dispose(e); byId.delete(id); }
    applySelection();
    R.requestRender();
  }
  function applySelection() {
    for (const [id, e] of byId) {
      const on = selected.has(id), bad = issues.has(id);
      e.mat.opacity = on ? 0.45 : 0.32;
      // a block with a collision warning (OWNER RULES v3.1 rule 5) keeps a red edge even while selected
      e.edges.material.color.copy(lin(bad ? issueColour : on ? "#006CB4" : colourOf(e.cat, dark)));
      e.edges.material.opacity = on || bad ? 1 : 0.9;
      e.edges.material.linewidth = 1;
      e.label.classList.toggle("selected", on);
      e.label.classList.toggle("warn", bad);
    }
  }
  function setSelected(ids) { selected = new Set(ids || []); applySelection(); R.requestRender(); }
  /** The blocks with a collision warning: red outline (colour = the --danger token's value). */
  function setIssues(ids, colour) { issues = new Set(ids || []); if (colour) issueColour = colour; applySelection(); R.requestRender(); }

  /* ---------- the ghost while placing ---------- */
  let ghostEntry = null;
  function setGhost(it, cats) {
    if (ghostEntry) { group.remove(ghostEntry.mesh, ghostEntry.edges); ghostEntry.geo.dispose(); ghostEntry.mat.dispose(); ghostEntry.edges.geometry.dispose(); ghostEntry.edges.material.dispose(); ghostEntry.label.remove(); ghostEntry = null; }
    ghost = it || null;
    if (it) {
      const cat = cats.get(it.cat), col = colourOf(cat, dark);
      ghostEntry = makeEntry(it, col);
      ghostEntry.mat.opacity = 0.22;
      ghostEntry.label.classList.add("ghost");
      ghostEntry.label.firstChild.textContent = String((cat && cat.name) || "Department").toUpperCase();
      ghostEntry.label.lastChild.textContent = "Click to place";
      ghostEntry.top = new THREE.Vector3(it.x, (it.h || 8) + 0.6, -it.y);
      group.add(ghostEntry.mesh, ghostEntry.edges);
    }
    R.requestRender();
  }

  /** The block a ray (plan coordinates, z up) hits first, or null: {item, t}. */
  function pick(o, d) {
    let best = null;
    for (const e of byId.values()) {
      const it = e.item, t = rayPrism(o, d, outline(it), 0, Math.max(0.2, it.h || 8));
      if (t !== null && (!best || t < best.t)) best = {item: it, t};
    }
    return best;
  }

  /** Places the hanging signs for this camera (after each render). */
  function updateLabels(camera, w, h) {
    const entries = [...byId.values()]; if (ghostEntry) entries.push(ghostEntry);
    const placed = [];
    for (const e of entries) {
      const l = e.label;
      if (!shown) { l.hidden = true; continue; }
      v.copy(e.top).project(camera);
      let vis = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      if (vis) {
        if (!l.dataset.w) { l.hidden = false; l.dataset.w = l.offsetWidth || 80; l.dataset.h = l.offsetHeight || 24; }
        const lw = +l.dataset.w, lh = +l.dataset.h;
        const box = {x0: x - lw / 2 - 4, x1: x + lw / 2 + 4, y0: y - lh / 2 - 2, y1: y + lh / 2 + 2};
        if (box.x0 < 0 || box.y0 < 0 || box.x1 > w || box.y1 > h) vis = false;
        else if (placed.some(b => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) vis = false;
        else placed.push(box);
      }
      l.hidden = !vis;
      if (!vis) continue;
      l.style.setProperty("--x", x.toFixed(1)); l.style.setProperty("--y", y.toFixed(1));
    }
  }
  return {
    group, update, setSelected, setIssues, setGhost, pick, updateLabels,
    show(on) { shown = on; group.visible = on; if (!on) for (const e of byId.values()) e.label.hidden = true; R.requestRender(); },
    get ghost() { return ghost; },
    dispose() { for (const e of byId.values()) dispose(e); byId.clear(); setGhost(null, new Map()); R.scene.remove(group); },
  };
}
