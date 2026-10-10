/* The 3D placement cursor for the "Measure / place" tool: a ring and crosshair on the snapped floor point,
 * the snapped wall or column face lit in the snap-guide colour, a dashed line to the nearest wall, and the
 * A-B measuring line. Drawn on top of everything (it is the tool talking, not part of the store). */
import {lin} from "./scene.js";

export function createCursor3D(R) {
  const THREE = R.THREE;
  const group = new THREE.Group(); group.name = "cursor"; group.visible = false; group.renderOrder = 20;
  R.scene.add(group);
  const geos = [], mats = [];
  const M = (color, opacity = 1, dashed) => {
    const m = dashed ? new THREE.LineDashedMaterial({color: lin(color), dashSize: 0.6, gapSize: 0.4, transparent: true, opacity, depthTest: false})
      : new THREE.MeshBasicMaterial({color: lin(color), transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide});
    mats.push(m); return m;
  };
  const blue = "#006CB4", guide = "#C2410C";
  const mBlue = M(blue), mHalo = M("#ffffff", 0.85), mGuide = M(guide, 0.9), mGuideWall = M(guide, 0.22);
  const flat = (geo, m) => { geos.push(geo); const o = new THREE.Mesh(geo, m); o.rotation.x = -Math.PI / 2; o.renderOrder = 21; return o; };

  /* ---------- the cursor itself: halo ring, blue ring, crosshair, centre dot ---------- */
  const reticle = new THREE.Group();
  reticle.add(flat(new THREE.RingGeometry(0.42, 0.78, 48), mHalo));
  reticle.add(flat(new THREE.RingGeometry(0.5, 0.68, 48), mBlue));
  for (const [w, h, x, z] of [[0.9, 0.09, -0.95, 0], [0.9, 0.09, 0.95, 0], [0.09, 0.9, 0, -0.95], [0.09, 0.9, 0, 0.95]]) {
    const arm = flat(new THREE.PlaneGeometry(w, h), mBlue); arm.position.set(x, 0, z); reticle.add(arm);
  }
  reticle.add(flat(new THREE.CircleGeometry(0.1, 16), mBlue));
  reticle.children.forEach(c => { c.position.y = 0.06; });
  group.add(reticle);

  /* ---------- pins A and B ---------- */
  const pin = () => {
    const g = new THREE.Group();
    g.add(flat(new THREE.CircleGeometry(0.32, 24), mBlue));
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3, 0.06), mBlue); geos.push(stick.geometry); stick.position.y = 1.5; stick.renderOrder = 21; g.add(stick);
    g.children[0].position.y = 0.05;
    g.visible = false; group.add(g); return g;
  };
  const pinA = pin(), pinB = pin();

  /* ---------- lines: measuring line, distance-to-wall line, snapped face ---------- */
  const line = (m, dashed) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)); geos.push(geo);
    const l = new THREE.Line(geo, m); l.renderOrder = 22; l.frustumCulled = false; l.visible = false; l.userData.dashed = dashed; group.add(l); return l;
  };
  const measureLine = line(new THREE.LineBasicMaterial({color: lin(blue), depthTest: false, transparent: true}));
  const wallLine = line(M(blue, 0.95, true), true);
  mats.push(measureLine.material);
  const setLine = (l, a, b, y = 0.08) => {
    const p = l.geometry.attributes.position;
    p.setXYZ(0, a[0], y, -a[1]); p.setXYZ(1, b[0], y, -b[1]); p.needsUpdate = true; l.geometry.computeBoundingSphere();
    if (l.userData.dashed) l.computeLineDistances();
    l.visible = true;
  };
  // the snapped face: a strip on the floor plus a faint band up the wall
  const faceStrip = flat(new THREE.PlaneGeometry(1, 0.16), mGuide); faceStrip.visible = false; group.add(faceStrip);
  const faceBand = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mGuideWall); geos.push(faceBand.geometry); faceBand.visible = false; faceBand.renderOrder = 20; group.add(faceBand);
  const extraStrips = [];

  function placeFace(strip, band, g) {
    const ax = g.a[0], ay = g.a[1], bx = g.b[0], by = g.b[1], len = Math.hypot(bx - ax, by - ay) || 0.01, ang = Math.atan2(by - ay, bx - ax);
    strip.scale.set(len, 1, 1); strip.position.set((ax + bx) / 2, 0.07, -(ay + by) / 2); strip.rotation.set(-Math.PI / 2, 0, ang); strip.visible = true;
    if (band) { band.scale.set(len, 6, 1); band.position.set((ax + bx) / 2, 3, -(ay + by) / 2); band.rotation.set(0, ang, 0); band.visible = true; }
  }

  /**
   * update({cursor, a, b, snap, z}) with plan points {x, y}; snap = the snapPoint result for the cursor; z = the
   * floor's height there (the top of a raised floor). scale: the cursor's size factor (bigger when far away).
   */
  function update(st, scale = 1) {
    const {cursor, a, b, snap} = st;
    group.visible = !!(cursor || a);
    reticle.visible = !!cursor;
    if (cursor) { reticle.position.set(cursor.x, st.z || 0, -cursor.y); reticle.scale.setScalar(scale); }
    for (const [p, pt] of [[pinA, a], [pinB, b]]) { p.visible = !!pt; if (pt) { p.position.set(pt.x, 0, -pt.y); p.scale.set(scale, Math.max(1, scale * 0.8), scale); } }
    const end = b || cursor;
    if (a && end) setLine(measureLine, [a.x, a.y], [end.x, end.y]); else measureLine.visible = false;
    faceStrip.visible = faceBand.visible = false;
    for (const s of extraStrips) s.visible = false;
    if (cursor && snap) {
      const guides = snap.guides || [];
      if (guides[0]) placeFace(faceStrip, faceBand, guides[0]);
      for (let i = 1; i < guides.length; i++) {
        if (!extraStrips[i - 1]) { const s = flat(new THREE.PlaneGeometry(1, 0.16), mGuide); group.add(s); extraStrips.push(s); }
        placeFace(extraStrips[i - 1], null, guides[i]);
      }
      const nw = snap.distances && snap.distances.nearestWall;
      if (nw && snap.distances.toNearestWall > 0.05 && snap.distances.toNearestWall < 60) setLine(wallLine, [cursor.x, cursor.y], nw.point, 0.09); else wallLine.visible = false;
    } else wallLine.visible = false;
    R.requestRender();
  }
  function hide() { group.visible = false; R.requestRender(); }

  /* ---------- the selected item: its box outlined in the selection colour ---------- */
  const selMat = new THREE.LineBasicMaterial({color: lin(blue), depthTest: false, transparent: true}); mats.push(selMat);
  let selBox = null;
  /** Outlines the selected item: its box (or its own polygon, extruded) from base to base + height. */
  function select(it, height, base = 0) {
    if (selBox) { R.scene.remove(selBox); selBox.geometry.dispose(); selBox = null; }
    if (it) {
      const h = Math.max(0.2, height || it.h || 1);
      if (it.poly) {
        const P = it.poly, v = [];
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length];
          for (const z of [base, base + h + 0.05]) v.push(a[0], z, -a[1], b[0], z, -b[1]);
          v.push(a[0], base, -a[1], a[0], base + h + 0.05, -a[1]);
        }
        const eg = new THREE.BufferGeometry(); eg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
        selBox = new THREE.LineSegments(eg, selMat);
      } else {
        const bg = new THREE.BoxGeometry(it.w + 0.1, h + 0.05, it.d + 0.1), eg = new THREE.EdgesGeometry(bg); bg.dispose();
        selBox = new THREE.LineSegments(eg, selMat);
        selBox.position.set(it.x, base + h / 2, -it.y); selBox.rotation.y = (it.rot || 0) * Math.PI / 180;
      }
      selBox.renderOrder = 23;
      R.scene.add(selBox);
    }
    R.requestRender();
  }
  return {
    group, update, hide, select,
    dispose() { select(null); R.scene.remove(group); geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); },
  };
}
