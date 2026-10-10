/* Advisor overlays and the "Show me" highlight in 3D (OWNER RULES v3.1 rule 6; the display toggle works in every
 * mode): flat decals a hair above the floor. Heat is a canvas texture on a plane the size of the engine's grid;
 * sight lines, zones, cold spots and the highlight region are translucent polygons; paths are lines; choke
 * points and highlight points are rings. Plan feet map to three.js as (x, height, -y). */
import {lin} from "./scene.js";

const Y = {heat: 0.03, zone: 0.05, cold: 0.05, sight: 0.07, path: 0.09, ring: 0.11, hi: 0.13};

export function createOverlays3D(R) {
  const THREE = R.THREE;
  const group = new THREE.Group(); group.name = "overlays"; group.renderOrder = 5;
  const hiGroup = new THREE.Group(); hiGroup.name = "highlight"; hiGroup.renderOrder = 8;
  R.scene.add(group, hiGroup);
  let shown = true;
  const disposeAll = g => { for (const o of [...g.children]) { g.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } } };

  function polyMesh(pts, colour, opacity, y, order) {
    if (!pts || pts.length < 3) return null;
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
    const mat = new THREE.MeshBasicMaterial({color: lin(colour), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide});
    const m = new THREE.Mesh(geo, mat); m.renderOrder = order; return m;
  }
  function outline(pts, colour, y, order, opacity = 0.9) {
    if (!pts || pts.length < 2) return null;
    const v = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; v.push(a[0], y, -a[1], b[0], y, -b[1]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
    const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({color: lin(colour), transparent: true, opacity, depthWrite: false})); m.renderOrder = order; return m;
  }
  function polyline(pts, colour, y, order) {
    if (!pts || pts.length < 2) return null;
    const v = [];
    for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; v.push(a[0], y, -a[1], b[0], y, -b[1]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
    const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({color: lin(colour), transparent: true, opacity: 0.95, depthWrite: false})); m.renderOrder = order; return m;
  }
  function ring(x, y, r, colour, order, width = 0.35) {
    const geo = new THREE.RingGeometry(Math.max(0.05, r - width), r, 40); geo.rotateX(-Math.PI / 2); geo.translate(x, Y.ring, -y);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: lin(colour), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide})); m.renderOrder = order; return m;
  }
  function heatPlane(H, colours) {
    const c = document.createElement("canvas"); c.width = H.nx; c.height = H.ny;
    const ctx = c.getContext("2d");
    const hot = hex(colours.hot), cold = hex(colours.cold);
    const img = ctx.createImageData(H.nx, H.ny);
    for (let j = 0; j < H.ny; j++) for (let i = 0; i < H.nx; i++) {
      const val = H.values[j * H.nx + i], o = ((H.ny - 1 - j) * H.nx + i) * 4; // row 0 of the image is the north edge
      if (val < 0) { img.data[o + 3] = 0; continue; }
      const t = val / 100;
      const [r, g, b, a] = t < 0.12 ? [...cold, 0.3 * (1 - t / 0.12) + 0.05] : [...hot, 0.1 + 0.55 * ((t - 0.12) / 0.88)];
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.encoding = THREE.sRGBEncoding;
    const w = H.nx * H.cell, d = H.ny * H.cell;
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2); geo.translate(H.x0 + w / 2, Y.heat, -(H.y0 + d / 2));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide})); m.renderOrder = 4; return m;
  }
  const hex = s => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim()); const n = m ? parseInt(m[1], 16) : 0x808080; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const add = (g, m) => { if (m) g.add(m); };

  /**
   * setOverlays(overlays, toggles, colours): overlays from analyse(), toggles {heat, sightlines, paths, chokePoints,
   * zones, coldSpots}, colours {accent, danger, warning, door, slate, hot, cold} (hex, from the tokens).
   */
  function setOverlays(ov, toggles, colours) {
    disposeAll(group);
    if (ov && toggles) {
      if (toggles.heat && ov.heat) add(group, heatPlane(ov.heat, colours));
      if (toggles.coldSpots) for (const c of ov.coldSpots || []) { add(group, polyMesh(c.polygon, colours.slate, 0.18, Y.cold, 5)); add(group, outline(c.polygon, colours.slate, Y.cold + 0.01, 5)); }
      if (toggles.zones) for (const z of ov.zones || []) { add(group, polyMesh(z.polygon, colours.door, z.kind === "decompression" ? 0.18 : 0.1, Y.zone, 5)); add(group, outline(z.polygon, colours.door, Y.zone + 0.01, 5, 0.7)); }
      if (toggles.sightlines) for (const s of ov.sightlines || []) { add(group, polyMesh(s.polygon, colours.accent, s.kind === "desk" ? 0.16 : 0.1, Y.sight, 6)); add(group, ring(s.origin[0], s.origin[1], 0.9, colours.accent, 7, 0.4)); }
      if (toggles.paths) for (const p of ov.paths || []) add(group, polyline(p.points, colours.accent, Y.path, 7));
      if (toggles.chokePoints) for (const c of ov.chokePoints || []) add(group, ring(c.x, c.y, 1.6, c.severity === "high" ? colours.danger : colours.warning, 8, 0.5));
    }
    group.visible = shown;
    R.requestRender();
  }
  /** "Show me": the region as a decal and rings at the points (the items themselves are outlined by the blocks / the cursor). */
  function setHighlight(show, colours) {
    disposeAll(hiGroup);
    if (show) {
      if (show.region && show.region.length >= 3) { add(hiGroup, polyMesh(show.region, colours.accent, 0.22, Y.hi, 9)); add(hiGroup, outline(show.region, colours.accent, Y.hi + 0.01, 9)); }
      for (const p of show.points || []) { add(hiGroup, ring(p[0], p[1], 1.8, colours.accent, 9, 0.45)); add(hiGroup, ring(p[0], p[1], 0.5, colours.accent, 9, 0.5)); }
    }
    hiGroup.visible = shown;
    R.requestRender();
  }
  return {
    group, setOverlays, setHighlight,
    show(on) { shown = on; group.visible = on; hiGroup.visible = on; R.requestRender(); },
    dispose() { disposeAll(group); disposeAll(hiGroup); R.scene.remove(group, hiGroup); },
  };
}
