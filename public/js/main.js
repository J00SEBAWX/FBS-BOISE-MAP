/* FBS Boise Store Map: entry point (a native ES module; no build step, CSP script-src 'self').
 * Loads the master layout and the scan overlay, then wires the three displays together:
 *   Plan  - the floor plan from above (plan2d/), view only in this phase
 *   3D    - orbit around the store with the cleaned 3D scan as a ghost (view3d/)
 *   Walk  - the customer's-eye walk (view3d/cameras.js)
 * plus the Layers menu, the Measure / place tool (core/snap.js), the account menu and the help dialog. */
import {normalizeLayout, displayName, categoryOf, TYPES, isStructure, heightToCeiling, baseOf, platformTopAt} from "./core/model.js";
import {buildNav} from "./core/nav.js";
import {buildSnapTargets, snapPoint} from "./core/snap.js";
import {createMeasure} from "./core/measure.js";
import {clamp, deg} from "./core/geometry.js";
import {formatFtIn} from "./core/units.js";
import {webglAvailable, createScene, disposeTree} from "./view3d/scene.js";
import {createStoreBuilder} from "./view3d/structure.js";
import {createScanModel} from "./view3d/scan-model.js";
import {createWalk, createOrbit} from "./view3d/cameras.js";
import {createPicker} from "./view3d/picking.js";
import {createCursor3D} from "./view3d/cursor.js";
import {createLabels3D} from "./view3d/labels.js";
import {createPlanView} from "./plan2d/plan.js";
import {initTabs, initialView} from "./ui/header.js";
import {initToolbar} from "./ui/toolbar.js";
import {createLayers} from "./ui/layers.js";
import {toast} from "./ui/toast.js";
import {initHelp} from "./ui/dialog.js";
import {onThemeChange, isDark} from "./ui/theme.js";
import {createWalkHud} from "./ui/walk-hud.js";
import {createReadout} from "./ui/readout.js";
import {initAccount} from "./account.js";

// (the saved theme is already applied by /assets/theme-boot.js in <head>, before the page is drawn)
const $ = s => document.querySelector(s);
const app = $("#app");
const announce = msg => { const el = $("#srLive"); el.textContent = ""; requestAnimationFrame(() => { el.textContent = msg; }); };

/* ================= loading the data ================= */
async function loadJson(url) {
  const r = await fetch(url, {credentials: "same-origin", cache: "no-cache"});
  if (r.status === 401) { location.replace("/login"); throw new Error("signed out"); }
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
function stageError(title, text) {
  // the card lives in the 3D view: show that view whatever was open
  $("#view3d").hidden = false; $("#viewPlan").hidden = true;
  const box = $("#noGl"), card = box.querySelector(".nogl-card");
  card.querySelector("h2").textContent = title;
  card.querySelector("p").textContent = text;
  const b = $("#noGlPlan"); b.textContent = "Try again"; b.addEventListener("click", () => location.reload(), {once: true});
  box.hidden = false;
}

boot().catch(e => {
  console.warn("map did not start:", e && e.message);
  stageError("This map didn't start", "Something went wrong while drawing the store. Try again; if it keeps happening, tell the person who sent you the link.");
});

async function boot() {
  initAccount();
  let layout, overlay = null;
  try {
    const [raw, ov] = await Promise.all([loadJson("data/master.json"), loadJson("data/scan-overlay.json").catch(() => null)]);
    layout = normalizeLayout(raw);
    overlay = ov;
  } catch (e) {
    if (e && e.message === "signed out") return;
    stageError("This map didn't load", "Check the connection and try again. Nothing you saved is lost.");
    return;
  }
  start(layout, overlay); // a failure here is caught above and shows the same "Try again" card
}

function start(layout, overlay) {
  const state = {view: initialView(), tool: "look", has3D: false, sel: null};
  const targets = buildSnapTargets(layout.items);
  const nav = buildNav(layout);
  const measure = createMeasure();
  const readout = createReadout();
  const help = initHelp();
  let lastSnap = null;

  /* ---------- 3D ---------- */
  let R = null, builder = null, groups = null, scan = null, walk = null, orbit = null, picker = null, cursor = null, labels3d = null, hud = null;
  function init3D() {
    R = createScene($("#three"), layout.building);
    R.setSky(isDark());
    builder = createStoreBuilder(R);
    groups = builder.build(layout);
    for (const g of Object.values(groups)) R.scene.add(g);
    R.renderer.shadowMap.needsUpdate = true;
    scan = createScanModel(R, "data/scan.glb");
    walk = createWalk({R, layout, nav, toast, onArrive: () => hud && hud.arrived()});
    walk.onSpin = on => $("#btnSpin").setAttribute("aria-pressed", String(on));
    orbit = createOrbit({R, layout});
    picker = createPicker(R, layout);
    cursor = createCursor3D(R);
    labels3d = createLabels3D(R, $("#labels3d"), layout);
    hud = createWalkHud({layout, walk, getLayers: () => layers.get("walk"), announce});
    state.has3D = true;
  }
  // Staying in the plan for a while: free the GPU copies of the store (geometry, programs, textures). three.js
  // uploads them again on the next frame drawn, so the 3D view comes back as it was. Only after a minute in the
  // plan, so quick switches back and forth don't recompile every shader.
  let releaseTimer = 0, gpuReleased = false;
  function releaseGpuSoon() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      if (!R || gpuReleased || state.view !== "plan") return;
      disposeTree(R.scene);
      R.renderer.renderLists.dispose();
      gpuReleased = true;
    }, 60000);
  }
  function keepGpu() { clearTimeout(releaseTimer); gpuReleased = false; }

  /* ---------- layers ---------- */
  const layers = createLayers({btn: $("#layersBtn"), pop: $("#layersPop"), onChange: key => applyLayers(key)});
  function applyLayers(key) {
    const v = state.view;
    $("#toolSnap").setAttribute("aria-pressed", String(layers.get().snap));
    if (R) {
      const L3 = layers.get(v === "plan" ? "3d" : v);
      groups.structure.visible = L3.structure; groups.fixtures.visible = L3.fixtures; groups.ceiling.visible = L3.ceiling;
      walk.setCeiling(L3.ceiling);
      labels3d.show(v === "3d" && L3.labels);
      if (!key || key === "structure" || key === "fixtures") R.renderer.shadowMap.needsUpdate = true;
      if (v !== "plan") setScan(L3.scan);
      R.requestRender();
      if (hud && (key === "structure" || key === "fixtures")) hud.invalidate();
    }
    plan.draw();
    if (state.sel && key && !selectionVisible(state.sel)) select(null);
  }
  const selectionVisible = it => (isStructure(it) ? layers.get().structure : layers.get().fixtures);
  let scanToken = 0;
  async function setScan(mode) {
    const banner = $("#scanBanner"), my = ++scanToken;
    if (mode !== "off" && !scan.loaded && !scan.failed) { banner.className = "banner"; banner.textContent = "Loading the 3D scan…"; banner.hidden = false; }
    const ok = await scan.setMode(mode);
    if (my !== scanToken) return;
    if (mode !== "off" && !ok) { banner.className = "banner error"; banner.textContent = "The 3D scan didn't load. Everything else still works."; banner.hidden = false; setTimeout(() => { banner.hidden = true; }, 6000); }
    else banner.hidden = true;
  }

  /* ---------- plan ---------- */
  const plan = createPlanView({
    canvas: $("#planCanvas"), layout,
    overlay: () => overlay,
    getLayers: () => layers.get("plan"),
    getTool: () => state.tool,
    getWalker: () => (walk ? {ME: walk.ME, halfH: walk.CAM.halfH} : null),
    measure,
    snapAt: (x, y, tol) => snapPoint({x, y}, targets, {tol: clamp(tol, 0.2, 3), snap: layers.get().snap}),
    onSelect: it => select(it, "plan"),
    onGo: (x, y, item) => goWalk(x, y, item),
    onPointer: p => readout.pointer(p),
    onMeasure: snap => {
      lastSnap = snap;
      if (!snap) { readout.hide(); return; }
      const [sx, sy] = [(snap.x - plan.V.cx) * plan.V.s + plan.V.W / 2, plan.V.H / 2 - (snap.y - plan.V.cy) * plan.V.s];
      readout.show($("#viewPlan"), snap, sx, sy, measure.state);
    },
    onViewChange: V => updateScale(V),
  });
  let fitScale = 0;
  function updateScale(V) {
    if (!fitScale || !V.fitted) fitScale = V.s;
    $("#zPct").textContent = Math.round(V.s / fitScale * 100) + "%";
    let ft = 5; for (const f of [5, 10, 25, 50, 100]) { ft = f; if (f * V.s >= 50) break; }
    $("#scalebarBar").style.setProperty("--w", (ft * V.s).toFixed(1));
    $("#scalebarText").textContent = ft + " ft";
  }
  $("#zIn").addEventListener("click", () => plan.zoomAt(1.25));
  $("#zOut").addEventListener("click", () => plan.zoomAt(1 / 1.25));
  $("#zFit").addEventListener("click", () => { plan.fit(); fitScale = plan.V.s; });

  /* ---------- selection (Plan and 3D) and its details card ---------- */
  const info = $("#info");
  function select(it, from) {
    const hadFocus = info.contains(document.activeElement);
    state.sel = it || null;
    if (from !== "plan" && plan.selected !== state.sel) plan.select(state.sel);
    outline3D();
    if (it) {
      $("#infoKind").textContent = (TYPES[it.type] && (it.type === "wall" || it.type === "column" || it.type === "door") ? TYPES[it.type].label : categoryOf(it)) + (isStructure(it) ? " · structure" : "");
      $("#infoName").textContent = displayName(it);
      const h = drawnHeight(it);
      $("#infoSize").textContent = `${formatFtIn(it.w)} × ${formatFtIn(it.d)}` + (h >= 1 ? ` · ${formatFtIn(h)} tall` : "") + ` · at x ${formatFtIn(it.x)}, y ${formatFtIn(it.y)}`;
      const note = typeof it.toConfirm === "string" ? it.toConfirm : "";
      $("#infoNote").textContent = note ? "To check in the store: " + note : "";
      $("#infoNote").hidden = !note;
      $("#infoGo").hidden = !canGoLook(it);
      info.hidden = state.view === "walk";
      readout.selection(`${displayName(it)} · ${formatFtIn(it.w)} × ${formatFtIn(it.d)}`);
    } else {
      info.hidden = true;
      readout.selection("");
      if (hadFocus) (state.view === "plan" ? $("#planCanvas") : $("#three")).focus();
    }
  }
  const drawnHeight = it => (it.type === "wall" || it.type === "column" ? heightToCeiling(layout, it) : it.h || 0);
  // the selection's outline in the 3D view (from the raised floor it stands on, if any)
  function outline3D() {
    if (!cursor) return;
    const it = state.view === "3d" ? state.sel : null;
    cursor.select(it, it ? drawnHeight(it) : 0, it ? baseOf(layout, it) : 0);
  }
  // "Go look at it": a fixture, desk, door or column, never a wall or a ceiling (nowhere to stand in front of it)
  const canGoLook = it => !!(it && state.has3D && walk && it.type !== "wall" && it.type !== "ceiling");
  function goLook(it) { if (canGoLook(it) && walk.goLook(it)) setView("walk"); }
  $("#infoClose").addEventListener("click", () => select(null));
  $("#infoGo").addEventListener("click", () => goLook(state.sel));
  function goWalk(x, y, item) {
    if (!walk) { toast("The walk needs 3D graphics, which this device doesn't have."); return; }
    if (walk.goTo(x, y, item)) setView("walk");
  }

  /* ---------- tools ---------- */
  function setTool(t) {
    state.tool = t;
    app.dataset.tool = t;
    $("#toolMeasure").setAttribute("aria-pressed", String(t === "measure"));
    if (t !== "measure") { measure.clear(); lastSnap = null; readout.hide(); if (cursor) cursor.hide(); }
    plan.draw();
    hint();
  }
  $("#toolMeasure").addEventListener("click", () => setTool(state.tool === "measure" ? "look" : "measure"));
  $("#toolSnap").addEventListener("click", () => layers.toggle("snap"));
  $("#btnReset").addEventListener("click", () => { if (state.view === "plan") { plan.fit(); fitScale = plan.V.s; } else if (orbit) orbit.reset(); });
  $("#btnTop").addEventListener("click", () => orbit && orbit.topView());
  $("#btnSpin").addEventListener("click", () => walk && walk.toggleSpin());
  $("#btnStart").addEventListener("click", () => { if (walk) { walk.reset(); hud.refresh(); } });
  function hint() {
    if (!state.has3D && state.view !== "plan") { readout.hint(""); return; }
    const m = state.tool === "measure";
    readout.hint({
      plan: m ? "Click to set A, click again for B · Esc clears" : "Click a fixture for details · double-click the floor to walk there · N steps through the fixtures",
      "3d": m ? "Click to set A, click again for B · drag still turns the view · Esc clears" : "Drag to turn · right-drag to move · scroll to zoom · double-click to focus",
      walk: "W A S D to walk · drag to look · double-click the floor to walk there",
    }[state.view]);
  }

  /* ---------- 3D pointer: status bar, Measure / place cursor, click to pick, double-click to focus ---------- */
  const visibleLayers = () => { const L3 = layers.get(state.view === "walk" ? "walk" : "3d"); return {structure: L3.structure, fixtures: L3.fixtures, ceiling: L3.ceiling}; };
  function feetPerPixel(p) {
    const cam = orbit.camera, dist = cam.position.distanceTo(new R.THREE.Vector3(p.x, 0, -p.y));
    return dist * 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, R.h);
  }
  // The floor spot the pointer means: where its ray meets the floor, or the foot of the wall, column or fixture
  // it meets first (never a spot hidden behind it). Nothing when it meets an upper deck or the ceiling first.
  function pointerFloor(clientX, clientY) {
    const hit = picker.pick(clientX, clientY, orbit.camera, visibleLayers());
    if (!hit.point || hit.hit === "deck" || hit.hit === "ceiling" || hit.hit === null) return null;
    const p = hit.hit === "floor" ? hit.floor : {x: hit.point.x, y: hit.point.y};
    const {L, W} = layout.building;
    return Math.abs(p.x - L / 2) > L || Math.abs(p.y - W / 2) > W ? null : p;
  }
  function cursorAt(clientX, clientY) {
    const fl = pointerFloor(clientX, clientY);
    if (!fl) return null;
    const fpp = feetPerPixel(fl);
    return snapPoint(fl, targets, {tol: clamp(12 * fpp, 0.2, 3), snap: layers.get().snap});
  }
  const floorZ = p => platformTopAt(layout, p.x, p.y); // the cursor sits on a raised floor's top
  function showCursor3D(snap) {
    lastSnap = snap;
    if (!snap) { cursor.update({cursor: null, a: measure.state.a, b: measure.state.b, snap: null}); readout.hide(); return; }
    const d = orbit.camera.position.distanceTo(new R.THREE.Vector3(snap.x, 0, -snap.y));
    cursor.update({...measure.state, snap, z: floorZ(snap)}, clamp(d / 45, 0.6, 4));
    placeReadout3D();
  }
  function placeReadout3D() {
    if (!lastSnap || state.tool !== "measure" || state.view !== "3d") return;
    const v = new R.THREE.Vector3(lastSnap.x, floorZ(lastSnap), -lastSnap.y).project(orbit.camera);
    readout.show($("#view3d"), lastSnap, (v.x + 1) / 2 * R.w, (1 - v.y) / 2 * R.h, measure.state);
  }
  function bindOrbitInput() {
    const el = R.renderer.domElement;
    const on = orbit.attach(el);
    let down = null;
    on(el, "pointerdown", e => { down = {x: e.clientX, y: e.clientY, button: e.button, t: performance.now()}; });
    on(el, "pointermove", e => {
      readout.pointer(pointerFloor(e.clientX, e.clientY));
      if (state.tool === "measure" && e.pointerType === "mouse" && !(down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4)) {
        const snap = cursorAt(e.clientX, e.clientY);
        measure.move(snap ? {x: snap.x, y: snap.y} : null);
        showCursor3D(snap);
      }
    });
    on(el, "pointerleave", e => { if (e.pointerType === "mouse") readout.pointer(null); });
    on(el, "pointerup", e => {
      const d = down; down = null;
      if (!d || d.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600) return;
      if (state.tool === "measure") {
        const snap = cursorAt(e.clientX, e.clientY);
        if (!snap) return;
        measure.click({x: snap.x, y: snap.y});
        showCursor3D(snap);
        return;
      }
      const hit = picker.pick(e.clientX, e.clientY, orbit.camera, visibleLayers());
      select(hit.item);
    });
    on(el, "dblclick", e => {
      if (state.tool === "measure") return;
      const hit = picker.pick(e.clientX, e.clientY, orbit.camera, visibleLayers());
      const p = hit.item ? {x: hit.item.x, y: hit.item.y} : hit.point ? {x: hit.point.x, y: hit.point.y} : null;
      if (p) orbit.focus(p);
    });
  }

  /* ---------- switching views ---------- */
  const tabs = initTabs({onSelect: v => setView(v)});
  const toolbar = initToolbar($("#toolbar"));
  let shownView = null;
  function setView(v) {
    if (v === shownView) return; // already open: keep the camera, the measurement and the controls as they are
    shownView = v;
    state.view = v;
    app.dataset.view = v;
    tabs.set(v);
    $("#view3d").setAttribute("aria-labelledby", v === "walk" ? "tab-walk" : "tab-3d");
    toolbar.sync();
    layers.sync(v);
    layers.close(false);
    $("#view3d").hidden = v === "plan";
    $("#viewPlan").hidden = v !== "plan";
    readout.hide(); readout.pointer(null); lastSnap = null;
    if (v === "walk" && state.tool === "measure") setTool("look");
    measure.clear();
    if (!state.has3D) {
      $("#noGl").hidden = v === "plan";
      plan.setActive(v === "plan");
      hint(); applyLayers(null); return;
    }
    if (v === "plan") {
      orbit.detach(); walk.detach(); cursor.hide(); cursor.select(null);
      releaseGpuSoon();
      plan.setActive(true);
    } else {
      plan.setActive(false);
      keepGpu();
      R.renderer.shadowMap.needsUpdate = true;
      R.setHaze(v === "walk");
      if (v === "3d") { walk.detach(); walk.show(false); bindOrbitInput(); outline3D(); }
      else { orbit.detach(); cursor.hide(); cursor.select(null); walk.attach(R.renderer.domElement); walk.show(true); hud.refresh(); }
      sizeChanged = true;
    }
    if (v === "walk") info.hidden = true; else if (state.sel) info.hidden = false;
    hint();
    applyLayers(null);
    R && R.requestRender();
  }
  $("#noGlPlan").addEventListener("click", () => setView("plan"));
  $("#brandLink").addEventListener("click", e => { e.preventDefault(); setView("3d"); });

  /* ---------- keyboard ---------- */
  let pointerFocus = false;
  window.addEventListener("pointerdown", () => { pointerFocus = true; }, true);
  window.addEventListener("keydown", e => {
    if (e.key === "Tab") pointerFocus = false;
    if (help.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, onControl = t && t !== document.body && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(t.tagName);
    if (onControl && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (e.key === "?") { e.preventDefault(); help.open(); return; }
    const views = {Digit1: "plan", Digit2: "3d", Digit3: "walk"};
    if (views[e.code]) { setView(views[e.code]); return; }
    if (e.code === "Escape") {
      if (state.tool === "measure" && (measure.state.a || measure.state.cursor)) { measure.clear(); readout.hide(); if (cursor) cursor.update({}); plan.draw(); return; }
      if (state.tool === "measure") { setTool("look"); return; }
      select(null); return;
    }
    if (e.code === "KeyL") { layers.toggle("labels"); return; }
    if (state.view === "walk") { if (walk) walk.keydown(e, onControl, pointerFocus); return; }
    // Plan and 3D share M (Measure / place) and S (Snap); the arrow keys move the view
    if (e.code === "KeyM") { setTool(state.tool === "measure" ? "look" : "measure"); return; }
    if (e.code === "KeyS" && !e.shiftKey) { layers.toggle("snap"); return; }
    if (e.code === "Enter" && state.sel && (t === $("#three") || t === $("#planCanvas"))) { e.preventDefault(); goLook(state.sel); return; }
    if (state.view === "3d") {
      if (!orbit) return;
      if (e.code === "KeyF") { orbit.reset(); return; }
      if (e.code === "KeyT") { orbit.topView(); return; }
      orbit.keydown(e, onControl);
      return;
    }
    // plan
    if (plan.keydown(e, onControl) && e.code === "KeyF") fitScale = plan.V.s;
  });

  /* ---------- size and theme ---------- */
  let sizeChanged = true;
  const ro = new ResizeObserver(entries => {
    for (const en of entries) {
      if (en.target === $("#planCanvas")) { if (state.view === "plan") plan.resize(); }
      else if (en.target === $("#mini")) { if (hud) hud.refresh(); }
      else sizeChanged = true;
    }
  });
  ro.observe($("#planCanvas")); ro.observe($("#mini")); ro.observe($("#three"));
  onThemeChange(() => { plan.retheme(); if (hud) hud.refresh(); if (R) R.setSky(isDark()); if (scan) scan.retheme(); });
  if (document.fonts && document.fonts.load) {
    Promise.all(["600 12px 'Barlow Condensed'", "700 15px 'Barlow Condensed'", "500 11px 'IBM Plex Sans'", "600 11px 'IBM Plex Sans'"].map(f => document.fonts.load(f)))
      .then(() => { plan.retheme(); if (hud) hud.refresh(); }, () => {});
  }

  /* ---------- the frame loop: draws only when something changed ---------- */
  let lastT = performance.now(), firstOrbit = true;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (!R || state.view === "plan") return;
    if (sizeChanged) {
      sizeChanged = false;
      if (R.size() || firstOrbit) {
        orbit.resize(R.w, R.h); walk.resize(R.w, R.h);
        if (firstOrbit && R.w > 1) { orbit.reset(false); firstOrbit = false; }
      }
    }
    if (state.view === "walk") {
      walk.step(dt);
      walk.applyCamera();
      R.render(walk.camera);
      hud.frame(now);
    } else {
      orbit.update(now);
      if (R.render(orbit.camera)) {
        labels3d.update(orbit.camera, R.w, R.h);
        const az = Math.atan2(orbit.camera.position.x - orbit.controls.target.x, orbit.camera.position.z - orbit.controls.target.z);
        $("#north3d").style.setProperty("--rot", deg(az).toFixed(1));
        placeReadout3D();
      }
    }
  }

  /* ---------- go ---------- */
  if (webglAvailable()) {
    try { init3D(); }
    catch (e) {
      console.warn("3D view unavailable:", e && e.message);
      if (R) { try { R.dispose(); } catch { /* already gone */ } }
      R = null; state.has3D = false;
    }
  }
  if (!state.has3D) {
    app.classList.add("no-3d");
    for (const el of document.querySelectorAll("#view3d .float, #north3d")) el.hidden = true;
  }
  setTool("look");
  setView(state.view);
  requestAnimationFrame(tick);
  // A handle for automated browser checks only (navigator.webdriver is true under Playwright / WebDriver); real
  // visitors never get a global.
  if (navigator.webdriver === true) {
    Object.defineProperty(window, "__fbsMap", {value: Object.freeze({state, layout, get frames() { return R ? R.frames : 0; }, get orbit() { return orbit; }, get walk() { return walk; },
      get scan() { return scan; }, get R() { return R; }, plan, layers, measure, setView, setTool, snapPoint: p => snapPoint(p, targets, {tol: 0.75}),
      pick: (cx, cy, opts) => (picker ? picker.pick(cx, cy, orbit.camera, opts) : null)})});
  }
}
