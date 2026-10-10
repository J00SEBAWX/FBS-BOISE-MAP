/* The two 3D cameras.
 *  Walk: the customer's-eye first-person view (ported from v2): drag to look, W A S D / arrows to walk,
 *        Q / E to turn, tap or double-click the floor to walk there along a clear path, wheel / pinch to zoom.
 *  Orbit: the bird's-eye 3D view on three.js OrbitControls: drag to orbit, right-drag or two fingers to pan,
 *        wheel or pinch to zoom, double-click to focus a point, the arrow keys to pan, reset and north-up top view.
 * Plan feet map to three.js as (x, height, -y). Yaw 0 faces north (+y). */
import {clamp, deg, rad, wrapAngle, inItem} from "../core/geometry.js";
import {TYPES, isFloorAt, startPose, ceilingAt, platformTopAt, baseOf, outlineOf, heightToCeiling} from "../core/model.js";
import {lookSpot} from "../core/nav.js";
import {inRing} from "../core/ring.js";
import {lin} from "./scene.js";

export const EYE_H = 5.5;                 // customer eye height (ft)
const FOV_MIN = 35, FOV_MAX = 75;         // walk zoom range (degrees)
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* ======================================================================================= */
/* Walk                                                                                     */
/* ======================================================================================= */
export function createWalk({R, layout, nav, toast, onArrive}) {
  const THREE = R.THREE;
  // the open map can change (Phase 2: editing, switching maps): setLayout swaps these in place
  const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 900);
  const start = startPose(layout);
  const ME = {x: start.x, y: start.y, z: 0, yaw: start.yaw, look: 0, heading: start.yaw, path: [], target: null, face: null};
  const CAM = {fov: 62, halfH: rad(45), zoomed: false, aspect: 1.6};
  const S = {spin: false, dragging: false, ceilingOn: true, moved: true};
  const keys = new Set();
  let walls = layout.items.filter(it => it.type === "wall");
  let solids = layout.items.filter(it => (TYPES[it.type] || {}).blocks || it.type === "door" || it.type === "opening" || it.type === "arch");

  // destination ring on the floor (FBS Blue: "the tool talking")
  const markerGeo = new THREE.RingGeometry(0.7, 1.0, 40), markerMat = new THREE.MeshBasicMaterial({color: lin("#006CB4"), transparent: true, opacity: 0.9, side: THREE.DoubleSide});
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.renderOrder = 5;
  R.scene.add(marker);

  const markMoved = () => { S.moved = true; R.requestRender(); };

  /* ---------- field of view (zoom) ---------- */
  // The zoom value is the vertical field of view; on a tall (portrait) screen it is the horizontal one, so
  // phones still see a wide view. On portrait the widest zoom is capped where the vertical view reaches 90 degrees.
  function fovMax() { const a = CAM.aspect; return a < 1 ? clamp(deg(2 * Math.atan(a)), FOV_MIN, FOV_MAX) : FOV_MAX; }
  function applyFov() {
    const a = CAM.aspect;
    if (!CAM.zoomed) CAM.fov = a < 1 ? FOV_MIN + 0.7 * (fovMax() - FOV_MIN) : 62;
    CAM.fov = clamp(CAM.fov, FOV_MIN, fovMax());
    let vf = CAM.fov;
    if (a < 1) vf = Math.min(90, deg(2 * Math.atan(Math.tan(rad(CAM.fov) / 2) / a)));
    CAM.halfH = Math.atan(Math.tan(rad(vf) / 2) * a);
    camera.fov = vf; camera.aspect = a; camera.updateProjectionMatrix(); R.requestRender();
  }
  function setFov(f) { CAM.zoomed = true; CAM.fov = clamp(f, FOV_MIN, fovMax()); applyFov(); markMoved(); }

  /* ---------- walking somewhere ---------- */
  // plan a walk to (x, y); opts.face = [x, y] to turn toward on arrival
  function walkTo(x, y, opts) {
    if (!isFloorAt(layout, x, y, 1)) { toast("That spot is outside the store."); return false; } // 1 ft of slack for taps on an outer wall
    const p = nav.plan(ME.x, ME.y, x, y);
    if (!p) { toast("There's no clear path to that spot."); return false; }
    [ME.x, ME.y] = p.start;
    ME.path = p.path; ME.target = p.goal; ME.face = (opts && opts.face) || null; ME.heading = ME.yaw;
    setSpin(false);
    if (reducedMotion.matches) jumpToEnd(); // no gliding camera when the system asks for less motion
    markMoved();
    return true;
  }
  function jumpToEnd() {
    const last = ME.path[ME.path.length - 1], prev = ME.path.length > 1 ? ME.path[ME.path.length - 2] : [ME.x, ME.y];
    if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > 1e-3) ME.yaw = Math.atan2(-(last[0] - prev[0]), last[1] - prev[1]);
    ME.x = last[0]; ME.y = last[1]; ME.path = []; ME.target = null;
    if (ME.face) { ME.yaw = Math.atan2(-(ME.face[0] - ME.x), ME.face[1] - ME.y); ME.look = -0.08; ME.face = null; }
    ME.heading = ME.yaw; if (onArrive) onArrive();
  }
  /** Walk to a good spot in front of a fixture and face it. */
  function goLook(it) {
    const p = lookSpot(nav, walls, it, ME.x, ME.y);
    if (!p) { toast("There's no clear path to that spot."); return false; }
    return walkTo(p[0], p[1], {face: [it.x, it.y]});
  }
  /** Walk to a floor spot, or to a fixture there. */
  function goTo(x, y, item) {
    if (item && (TYPES[item.type] || {}).blocks) return goLook(item);
    return walkTo(x, y);
  }
  function setSpin(on) { S.spin = on; if (on) ME.face = null; if (api.onSpin) api.onSpin(on); }

  /* ---------- tap / double-click: the floor spot under the pointer, or up to the first thing in the way ---------- */
  const caster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function solidAt(x, y, z) {
    for (const it of solids) {
      const top = it.h || 8;
      if (it.type === "door" || it.type === "opening" || it.type === "arch") { if (z > top && inItem(it, x, y)) return true; continue; }
      const z1 = it.type === "wall" ? Math.max(top, 30) : baseOf(layout, it) + top;
      if (z <= z1 && (it.type === "ring" ? inRing(it, x, y, 0) : inItem(it, x, y))) return true;
    }
    return false;
  }
  function tapWalk(cx, cy) {
    const r = R.renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); caster.setFromCamera(ndc, camera);
    const o = caster.ray.origin, d = caster.ray.direction;
    const tEnd = d.y < -1e-4 ? Math.min(240, -o.y / d.y) : 240;
    let last = null, hit = null;
    for (let t = 0.6; t <= tEnd; t += 0.25) {
      const x = o.x + d.x * t, y = -(o.z + d.z * t), z = o.y + d.y * t;
      if (S.ceilingOn && z >= ceilingAt(layout, x, y)) return; // tapped the ceiling
      if (solidAt(x, y, z)) { hit = last || [x, y]; break; }
      last = [x, y];
    }
    if (!hit) { if (d.y >= -1e-4) return; hit = [o.x + d.x * tEnd, -(o.z + d.z * tEnd)]; }
    walkTo(hit[0], hit[1]);
  }

  /* ---------- input (attached only while the Walk view is open) ---------- */
  let off = [];
  function attach(el) {
    detach();
    const ptr = new Map(); let st = null, lastDown = "";
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };
    on(el, "pointerdown", e => {
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      lastDown = e.pointerType; ptr.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (ptr.size === 2) { const [a, b] = [...ptr.values()]; st = {pinch: Math.hypot(a.x - b.x, a.y - b.y) || 1, fov: CAM.fov}; }
      else if (ptr.size === 1) st = {x: e.clientX, y: e.clientY, t: performance.now(), moved: false};
      S.dragging = true; el.classList.add("dragging"); ME.face = null; setSpin(false);
    });
    on(el, "pointermove", e => {
      if (!ptr.has(e.pointerId)) return; const prev = ptr.get(e.pointerId); ptr.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (!st) return;
      if (st.pinch) { if (ptr.size < 2) return; const [a, b] = [...ptr.values()]; setFov(st.fov * st.pinch / (Math.hypot(a.x - b.x, a.y - b.y) || 1)); return; }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y; if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) st.moved = true;
      const k = CAM.fov / 62; // look slower when zoomed in
      ME.yaw -= dx * 0.006 * k; ME.look = clamp(ME.look - dy * 0.005 * k, -1.2, 1.2); markMoved();
    });
    const up = e => {
      if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId);
      if (st && !st.pinch && !st.moved && e.type === "pointerup" && e.pointerType !== "mouse" && performance.now() - st.t < 350) tapWalk(e.clientX, e.clientY);
      if (!ptr.size) { st = null; S.dragging = false; el.classList.remove("dragging"); }
    };
    on(el, "pointerup", up); on(el, "pointercancel", up);
    on(el, "dblclick", e => { if (lastDown === "mouse") tapWalk(e.clientX, e.clientY); }); // touch taps are handled in "up"
    on(el, "touchend", e => e.preventDefault(), {passive: false}); // no emulated mouse clicks after a tap
    on(el, "wheel", e => { e.preventDefault(); setFov(CAM.fov * Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.03 : 0.001))); }, {passive: false});
    on(window, "keyup", e => keys.delete(e.code));
    on(window, "blur", () => keys.clear());
  }
  function detach() { for (const f of off) f(); off = []; keys.clear(); S.dragging = false; }

  const WALK_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  /** Keyboard while the Walk view is open. Returns true when the key was used. */
  function keydown(e, onControl, pointerFocus) {
    const t = e.target;
    if (WALK_KEYS.has(e.code)) {
      if (onControl && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return false;
      keys.add(e.code);
      if (e.code !== "ShiftLeft" && e.code !== "ShiftRight") { setSpin(false); ME.face = null; e.preventDefault(); }
      return true;
    }
    // Space = 360-degree look, unless a button was reached with the keyboard (then Space presses that button)
    if (e.code === "Space" && (!onControl || (t.tagName === "BUTTON" && pointerFocus))) { e.preventDefault(); setSpin(!S.spin); return true; }
    if (e.code === "Equal" || e.code === "NumpadAdd") { setFov(CAM.fov / 1.12); return true; }
    if (e.code === "Minus" || e.code === "NumpadSubtract") { setFov(CAM.fov * 1.12); return true; }
    return false;
  }

  /* ---------- simulation: one frame ---------- */
  function step(dt) {
    let changed = false;
    let f = 0, s = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) f += 1; if (keys.has("KeyS") || keys.has("ArrowDown")) f -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) s += 1; if (keys.has("KeyA") || keys.has("ArrowLeft")) s -= 1;
    if (keys.has("KeyQ")) { ME.yaw += 1.8 * dt; changed = true; } if (keys.has("KeyE")) { ME.yaw -= 1.8 * dt; changed = true; }
    if (f || s) {
      ME.path = []; ME.target = null; ME.face = null;
      const sp = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 9 : 5) * dt;
      const fx = -Math.sin(ME.yaw), fy = Math.cos(ME.yaw), rx = Math.cos(ME.yaw), ry = Math.sin(ME.yaw);
      let dx = fx * f + rx * s, dy = fy * f + ry * s; const L = Math.hypot(dx, dy) || 1; dx *= sp / L; dy *= sp / L;
      // slide along walls and shelves instead of stopping dead
      if (!nav.blockedAt(ME.x + dx, ME.y + dy)) { ME.x += dx; ME.y += dy; } else if (!nav.blockedAt(ME.x + dx, ME.y)) ME.x += dx; else if (!nav.blockedAt(ME.x, ME.y + dy)) ME.y += dy;
      ME.heading = ME.yaw; changed = true;
    }
    // following a planned path; the view turns smoothly toward the direction of travel
    if (ME.path.length) {
      let remaining = 0, px = ME.x, py = ME.y; for (const p of ME.path) { remaining += Math.hypot(p[0] - px, p[1] - py); px = p[0]; py = p[1]; }
      const [tx, ty] = ME.path[0], dx = tx - ME.x, dy = ty - ME.y, L = Math.hypot(dx, dy), sp = clamp(remaining * 0.3, 5.2, 11) * dt;
      if (L <= sp) { ME.x = tx; ME.y = ty; ME.path.shift(); } else { ME.x += dx / L * sp; ME.y += dy / L * sp; }
      if (L > 1e-3) { const want = Math.atan2(-dx, dy); ME.heading += wrapAngle(want - ME.heading) * Math.min(1, dt * 10); }
      if (!S.spin && !S.dragging && !keys.has("KeyQ") && !keys.has("KeyE")) ME.yaw += wrapAngle(ME.heading - ME.yaw) * Math.min(1, dt * 4);
      if (!ME.path.length) { ME.target = null; if (onArrive) onArrive(); }
      changed = true;
    } else if (ME.face && !S.dragging && !S.spin) {
      // arrived: turn to look at the fixture
      const want = Math.atan2(-(ME.face[0] - ME.x), ME.face[1] - ME.y), dyaw = wrapAngle(want - ME.yaw), dlook = -0.08 - ME.look;
      ME.yaw += dyaw * Math.min(1, dt * 3.5); ME.look += dlook * Math.min(1, dt * 3.5);
      if (Math.abs(dyaw) < 0.003 && Math.abs(dlook) < 0.003) ME.face = null;
      changed = true;
    }
    if (S.spin) { ME.yaw += 0.35 * dt; changed = true; }
    ME.yaw = wrapAngle(ME.yaw); ME.heading = wrapAngle(ME.heading);
    // step up onto raised floors (their own outline when they have one)
    const gz = platformTopAt(layout, ME.x, ME.y);
    if (Math.abs(gz - ME.z) > 1e-4) { ME.z = reducedMotion.matches ? gz : ME.z + (gz - ME.z) * Math.min(1, dt * 14); changed = true; }
    if (changed) markMoved();
    return changed;
  }
  /** Puts the camera where the customer stands. Returns true when it moved. */
  function applyCamera() {
    if (!S.moved) return false;
    const eye = EYE_H + ME.z;
    camera.position.set(ME.x, eye, -ME.y);
    camera.lookAt(ME.x - Math.sin(ME.yaw) * Math.cos(ME.look), eye + Math.sin(ME.look), -ME.y - Math.cos(ME.yaw) * Math.cos(ME.look));
    const tgt = ME.path.length ? ME.target : null; marker.visible = !!tgt; if (tgt) marker.position.set(tgt[0], 0.05, -tgt[1]);
    S.moved = false;
    return true;
  }
  function reset() { const p = startPose(layout); Object.assign(ME, {x: p.x, y: p.y, z: 0, yaw: p.yaw, look: 0, heading: p.yaw, path: [], target: null, face: null}); setSpin(false); markMoved(); }

  const api = {
    camera, ME, CAM, S, onSpin: null,
    attach, detach, keydown, step, applyCamera, walkTo, goLook, goTo, tapWalk, reset,
    setSpin, toggleSpin: () => setSpin(!S.spin), setFov,
    setCeiling(on) { S.ceilingOn = on; },
    resize(w, h) { CAM.aspect = w / h || 1.6; applyFov(); markMoved(); },
    show(on) { marker.visible = on && !!(ME.path.length && ME.target); if (on) markMoved(); },
    /** A new layout (and its walkable grid): the walker stays where it is, but stops any path it was on. */
    setLayout(l, n) {
      layout = l; nav = n;
      walls = l.items.filter(it => it.type === "wall");
      solids = l.items.filter(it => (TYPES[it.type] || {}).blocks || it.type === "door" || it.type === "opening" || it.type === "arch");
      ME.path = []; ME.target = null; marker.visible = false; markMoved();
    },
    dispose() { detach(); R.scene.remove(marker); markerGeo.dispose(); markerMat.dispose(); },
  };
  return api;
}

/* ======================================================================================= */
/* Orbit                                                                                    */
/* ======================================================================================= */
export function createOrbit({R, layout}) {
  const THREE = R.THREE;
  const {L, W} = layout.building;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  const center = new THREE.Vector3(L / 2, 0, -W / 2);
  const lastTarget = center.clone(); // kept while the Orbit view is closed, so coming back shows the same view
  let controls = null, anim = null, off = [];

  function makeControls(el) {
    controls = new THREE.OrbitControls(camera, el);
    controls.enableDamping = !reducedMotion.matches;
    controls.dampingFactor = 0.14;
    controls.screenSpacePanning = false;      // pan across the floor, not toward the sky
    controls.minDistance = 6;
    controls.maxDistance = 520;
    controls.maxPolarAngle = Math.PI / 2 - 0.04; // never below the floor
    controls.zoomSpeed = 1.1;
    controls.rotateSpeed = 0.8;
    controls.panSpeed = 1;
    controls.keys = {LEFT: "", UP: "", RIGHT: "", BOTTOM: ""}; // our own keyboard panning (below)
    controls.target.copy(lastTarget);
    controls.addEventListener("change", () => R.requestRender());
    controls.addEventListener("start", () => { anim = null; });
  }
  /* ---------- framing the whole building ---------- */
  // the building's box: every floor, wall and column (porch piers included), up to the roof
  const BOX = (() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, top = 12;
    for (const it of layout.items) {
      if (it.type === "ceiling") top = Math.max(top, it.h + 0.75);
      if (it.type !== "floor" && it.type !== "wall" && it.type !== "column") continue;
      if (it.type !== "floor") top = Math.max(top, heightToCeiling(layout, it));
      for (const [x, y] of outlineOf(it)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = L; y1 = W; }
    const pts = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [0, top]) pts.push(new THREE.Vector3(x, z, -y));
    return {pts, center: new THREE.Vector3((x0 + x1) / 2, 0, -(y0 + y1) / 2)};
  })();
  /**
   * Where to put the camera so all 8 corners of the building's box are on screen (inside +/- margin of the
   * view) when looking from this angle: the shortest such distance (bisection), with the target moved so the
   * box sits in the middle of the screen. Returns {target, dist}.
   */
  function frameBuilding(polar, azimuth, margin = 0.92) {
    const cam = camera.clone(); cam.aspect = camera.aspect || 1.6; cam.updateProjectionMatrix();
    const dir = new THREE.Vector3().setFromSphericalCoords(1, polar, azimuth), v = new THREE.Vector3();
    const target = BOX.center.clone();
    const extent = d => {
      cam.position.copy(target).addScaledVector(dir, d); cam.up.set(0, 1, 0); cam.lookAt(target); cam.updateMatrixWorld(true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of BOX.pts) {
        v.copy(p).project(cam);
        if (!(v.z > -1 && v.z < 1)) return null; // behind the camera or past the far plane
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      return {x0, x1, y0, y1};
    };
    const fits = d => { const e = extent(d); return !!e && Math.max(-e.x0, e.x1, -e.y0, e.y1) <= margin; };
    const shortest = () => {
      let lo = 2, hi = 1500;
      if (!fits(hi)) return hi;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
      return hi;
    };
    let dist = shortest();
    for (let pass = 0; pass < 3; pass++) {
      const e = extent(dist); if (!e) break;
      const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
      if (Math.abs(cx) < 0.005 && Math.abs(cy) < 0.005) break;
      const tanV = Math.tan(rad(cam.fov) / 2), right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      target.addScaledVector(right, cx * dist * tanV * cam.aspect).addScaledVector(up, cy * dist * tanV);
      dist = shortest();
    }
    return {target, dist};
  }
  function placeSpherical(target, dist, polar, azimuth, smooth) {
    const to = new THREE.Vector3().setFromSphericalCoords(dist, polar, azimuth).add(target);
    moveTo(to, target.clone(), smooth);
  }
  // a short, eased camera move (never longer than --dur-slow, 250 ms); instant with reduced motion
  function moveTo(pos, target, smooth = true) {
    if (!controls) { camera.position.copy(pos); camera.lookAt(target); lastTarget.copy(target); return; }
    if (!smooth || reducedMotion.matches) {
      anim = null; camera.position.copy(pos); controls.target.copy(target); controls.update(); R.requestRender(); return;
    }
    anim = {t0: performance.now(), dur: 250, p0: camera.position.clone(), p1: pos, q0: controls.target.clone(), q1: target};
  }
  function reset(smooth = true) {
    // a three-quarter view from the south-west (the front of the store), the whole building in view;
    // on a tall (portrait) screen the camera stands to the west so the store's long side runs up the screen
    const [polar, az] = (camera.aspect || 1.6) < 1 ? [rad(48), rad(-112)] : [rad(52), rad(-28)];
    const f = frameBuilding(polar, az);
    placeSpherical(f.target, f.dist, polar, az, smooth);
  }
  function topView(smooth = true) {
    // straight down, north at the top of the screen
    const f = frameBuilding(1e-4, 0, 0.94);
    placeSpherical(f.target, f.dist, 1e-4, 0, smooth);
  }
  /** Keep the target and look at a floor point from the same angle (double-click to focus). */
  function focus(p, smooth = true) {
    if (!controls) return;
    const t = new THREE.Vector3(p.x, 0, -p.y), offset = camera.position.clone().sub(controls.target);
    const dist = Math.min(offset.length(), Math.max(28, offset.length() * 0.6));
    offset.setLength(dist);
    moveTo(t.clone().add(offset), t, smooth);
  }
  /** Arrow keys: slide across the floor in the direction the camera faces. */
  function pan(dx, dy) {
    if (!controls) return;
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const step = Math.max(2, camera.position.distanceTo(controls.target) * 0.06);
    const move = right.multiplyScalar(dx * step).add(fwd.multiplyScalar(dy * step));
    anim = null; camera.position.add(move); controls.target.add(move); clampTarget(); controls.update(); R.requestRender();
  }
  function clampTarget() {
    const t = controls.target, m = 30;
    const cx = clamp(t.x, -m, L + m), cz = clamp(t.z, -W - m, m);
    if (cx !== t.x || cz !== t.z) { const dv = new THREE.Vector3(cx - t.x, 0, cz - t.z); t.add(dv); camera.position.add(dv); }
  }
  function attach(el) {
    detach();
    makeControls(el);
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };
    on(el, "contextmenu", e => e.preventDefault());
    return on;
  }
  function detach() {
    for (const f of off) f(); off = [];
    if (controls) {
      if (anim) { camera.position.copy(anim.p1); controls.target.copy(anim.q1); }
      lastTarget.copy(controls.target); controls.dispose(); controls = null;
    }
    anim = null;
  }
  // the arrow keys move the view (S is Snap, as in the plan; W A S D walk only in the Walk view)
  const PAN_KEYS = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]};
  function keydown(e, onControl) {
    if (onControl && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return false;
    const k = PAN_KEYS[e.code];
    if (k) { e.preventDefault(); pan(k[0] * (e.shiftKey ? 3 : 1), k[1] * (e.shiftKey ? 3 : 1)); return true; }
    if (e.code === "Equal" || e.code === "NumpadAdd") { dolly(0.8); return true; }
    if (e.code === "Minus" || e.code === "NumpadSubtract") { dolly(1.25); return true; }
    return false;
  }
  function dolly(f) {
    if (!controls) return;
    const off2 = camera.position.clone().sub(controls.target);
    off2.setLength(clamp(off2.length() * f, controls.minDistance, controls.maxDistance));
    moveTo(controls.target.clone().add(off2), controls.target.clone(), true);
  }
  /** One frame: finishes a camera move and lets the controls settle. Returns true when the camera moved. */
  function update(now) {
    if (!controls) return false;
    if (anim) {
      const k = clamp((now - anim.t0) / anim.dur, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.q0, anim.q1, e);
      if (k >= 1) anim = null;
      controls.update(); R.requestRender(); return true;
    }
    const moved = controls.update();
    if (moved) { clampTarget(); R.requestRender(); }
    return moved;
  }
  reset(false);
  return {
    camera, get controls() { return controls; },
    attach, detach, keydown, update, reset, topView, focus, pan, dolly,
    resize(w, h) { camera.aspect = w / h || 1.6; camera.updateProjectionMatrix(); R.requestRender(); },
    /** Where the camera looks (plan feet), for the status bar. */
    target() { const t = controls ? controls.target : center; return {x: t.x, y: -t.z}; },
    dispose() { detach(); },
  };
}
