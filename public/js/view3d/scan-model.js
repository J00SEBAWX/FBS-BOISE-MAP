/* The cleaned Polycam / RoomPlan scan (data/scan.glb) as the immutable base: the scan walls, corner posts and
 * doors that the photo survey and the owner's blueprint confirm (no scanner furniture, floors or ceilings: the
 * owner had those deleted). The file is already in scene feet, (store x, height, -store y), so it is added with
 * no transform.
 * Three looks: "off", "ghost" (translucent with its edges drawn over everything, for checking alignment) and
 * "solid". Drawn in the scan colour (--plan-scan, the same purple as the plan's "Scan lines" layer, so one dataset
 * has one colour; FBS Blue stays the tool's colour).
 * The scan's 47 pieces are merged into one wall mesh, one door mesh and one set of edges: 3 draw calls, not ~95.
 * The scan is never selectable or editable: it is excluded from picking and has no handles. */
import {lin} from "./scene.js";

export const SCAN_MODES = ["off", "ghost", "solid"];
const FALLBACK = "#8E3BB5";

/** The scan colour from the page's tokens (it changes with the theme). */
export function scanColor() {
  try { return getComputedStyle(document.documentElement).getPropertyValue("--plan-scan").trim() || FALLBACK; }
  catch { return FALLBACK; }
}
// sRGB hex mix (f = share of a)
function mixHex(a, b, f) {
  const p = parseInt(a.replace("#", ""), 16), q = parseInt(b.replace("#", ""), 16);
  const ch = s => Math.round(((p >> s) & 255) * f + ((q >> s) & 255) * (1 - f));
  return "#" + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0");
}

export function createScanModel(R, url = "data/scan.glb") {
  const THREE = R.THREE;
  const group = new THREE.Group();
  group.name = "scan";
  group.visible = false;
  group.userData.immutable = true;
  R.scene.add(group);

  let mode = "off", loaded = false, failed = false, loading = null;
  let walls = null, doors = null, edges = null;
  const ghostFill = new THREE.MeshBasicMaterial({transparent: true, opacity: 0.14, depthWrite: false, depthTest: false, side: THREE.DoubleSide});
  const ghostEdge = new THREE.LineBasicMaterial({transparent: true, opacity: 0.95, depthTest: false});
  const solidWall = new THREE.MeshStandardMaterial({roughness: 0.85, metalness: 0, side: THREE.DoubleSide});
  const solidDoor = new THREE.MeshStandardMaterial({roughness: 0.85, metalness: 0, side: THREE.DoubleSide});
  const solidEdge = new THREE.LineBasicMaterial({transparent: true, opacity: 0.6});
  function setColor(hex) {
    const c = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex : FALLBACK;
    ghostFill.color.copy(lin(c)); ghostEdge.color.copy(lin(c)); solidEdge.color.copy(lin(c));
    solidWall.color.copy(lin(mixHex(c, "#ffffff", 0.4))); solidDoor.color.copy(lin(mixHex(c, "#ffffff", 0.75)));
    R.requestRender();
  }
  setColor(scanColor());

  // many indexed meshes -> one (positions and normals already in scene feet)
  function merge(list) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let vo = 0, io = 0, haveNormals = true;
    for (const g of list) {
      const P = g.attributes.position, N = g.attributes.normal;
      if (!N) haveNormals = false;
      for (let i = 0; i < P.count; i++) {
        pos[(vo + i) * 3] = P.getX(i); pos[(vo + i) * 3 + 1] = P.getY(i); pos[(vo + i) * 3 + 2] = P.getZ(i);
        if (N) { nor[(vo + i) * 3] = N.getX(i); nor[(vo + i) * 3 + 1] = N.getY(i); nor[(vo + i) * 3 + 2] = N.getZ(i); }
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) idx[io + k] = g.index.getX(k) + vo;
      else for (let k = 0; k < P.count; k++) idx[io + k] = vo + k;
      vo += P.count; io += g.index ? g.index.count : P.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    if (haveNormals) out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); else out.computeVertexNormals();
    out.computeBoundingSphere();
    return out;
  }
  const never = () => {};

  function load() {
    if (loading) return loading;
    loading = new Promise(resolve => {
      if (!THREE.GLTFLoader) { failed = true; resolve(false); return; }
      new THREE.GLTFLoader().load(url, gltf => {
        const root = gltf.scene, wallGeos = [], doorGeos = [], lines = [];
        root.updateMatrixWorld(true);
        root.traverse(o => {
          if (!o.isMesh) return;
          const g = o.geometry.clone().applyMatrix4(o.matrixWorld); // identity for this file; kept for safety
          const isDoor = /door|window/i.test(o.name) || /door/i.test((o.material && o.material.name) || "");
          (isDoor ? doorGeos : wallGeos).push(g);
          const eg = new THREE.EdgesGeometry(g, 25);
          lines.push(eg.attributes.position.array); eg.dispose();
        });
        // the loaded file's own geometry and materials are not used: free them
        root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material || [])) m.dispose(); } });
        const mk = (geos, isDoor) => {
          if (!geos.length) return null;
          const m = new THREE.Mesh(merge(geos), ghostFill); geos.forEach(g => g.dispose());
          m.userData.isDoor = isDoor; m.userData.immutable = true; m.raycast = never; group.add(m); return m;
        };
        walls = mk(wallGeos, false); doors = mk(doorGeos, true);
        let n = 0; for (const a of lines) n += a.length;
        const all = new Float32Array(n); let o = 0; for (const a of lines) { all.set(a, o); o += a.length; }
        const eg = new THREE.BufferGeometry(); eg.setAttribute("position", new THREE.BufferAttribute(all, 3)); eg.computeBoundingSphere();
        edges = new THREE.LineSegments(eg, ghostEdge); edges.raycast = never; edges.userData.immutable = true; group.add(edges);
        loaded = true;
        apply();
        R.requestRender();
        resolve(true);
      }, undefined, () => { failed = true; resolve(false); });
    });
    return loading;
  }

  function apply() {
    group.visible = mode !== "off" && loaded;
    for (const m of [walls, doors]) {
      if (!m) continue;
      if (mode === "ghost") { m.material = ghostFill; m.renderOrder = 10; m.castShadow = false; m.receiveShadow = false; }
      else { m.material = m.userData.isDoor ? solidDoor : solidWall; m.renderOrder = 0; m.castShadow = false; m.receiveShadow = true; }
    }
    if (edges) { edges.material = mode === "ghost" ? ghostEdge : solidEdge; edges.renderOrder = mode === "ghost" ? 11 : 1; }
  }

  return {
    group,
    get mode() { return mode; },
    get loaded() { return loaded; },
    get failed() { return failed; },
    /** Draw calls the scan costs when shown (for checks). */
    get drawCalls() { return [walls, doors, edges].filter(Boolean).length; },
    /** "off" | "ghost" | "solid". Loads the file the first time it is shown. */
    async setMode(m) {
      mode = SCAN_MODES.includes(m) ? m : "off";
      apply();
      R.requestRender();
      if (mode !== "off" && !loaded && !failed) await load();
      return loaded;
    },
    /** Re-reads the scan colour (call when the theme changes). */
    retheme() { setColor(scanColor()); },
    dispose() {
      for (const o of [walls, doors, edges]) if (o) o.geometry.dispose();
      for (const m of [ghostFill, ghostEdge, solidWall, solidDoor, solidEdge]) m.dispose();
      R.scene.remove(group);
    },
  };
}
