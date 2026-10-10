/* FBS Boise Store Map: entry point (a native ES module; no build step, CSP script-src 'self').
 * Loads the open map (the master or one of everyone's maps) from the API and wires the displays together:
 *   Plan        - the floor plan from above (plan2d/)
 *   3D          - orbit around the store with the cleaned 3D scan as a ghost; department blocks as volumes (view3d/)
 *   Walk        - the customer's-eye walk (view3d/cameras.js)
 * in one of five view modes (OWNER RULES v3.1 rule 4; core/modes.js):
 *   Blank slate | Current layout (the master, read-only) | Area planning (the editor: plan2d/editor.js, the
 *   Departments palette, the inspector) | Comparison (two layouts, the change list, Apply to master) |
 *   Advisor (core/advisor.js: scores, recommendations, overlays)
 * plus the map switcher, autosave with optimistic concurrency, real-time collision warnings (core/issues.js),
 * the Layers menu, the Measure tool, the account menu and the help dialog. Every edit goes through
 * core/session.js (doc.js + areas.js + history.js). */
import {displayName, TYPES, isStructure, heightToCeiling, baseOf, platformTopAt} from "./core/model.js";
import {buildNav} from "./core/nav.js";
import {snapPoint, snapRect, GRID} from "./core/snap.js";
import {createMeasure} from "./core/measure.js";
import {clamp, deg} from "./core/geometry.js";
import {formatFtIn, formatSqft} from "./core/units.js";
import {createSession, toLayout} from "./core/session.js";
import {createAutosave} from "./core/autosave.js";
import {loadDraft, createDraftKeeper} from "./core/drafts.js";
import {parseHash, isMapId} from "./core/route.js";
import {api, ApiError} from "./core/api.js";
import {MODE_INFO, isMode, modeAllows, modeLayers, modeNotice} from "./core/modes.js";
import {collectIssues, firstOffender} from "./core/issues.js";
import {rowKey, rowBounds} from "./core/compare.js";
import {fixEdits, showBounds} from "./core/advisor-ui.js";
import * as D from "./core/doc.js";
import * as A from "./core/areas.js";
import {webglAvailable, createScene, disposeTree} from "./view3d/scene.js";
import {createStoreBuilder} from "./view3d/structure.js";
import {createScanModel} from "./view3d/scan-model.js";
import {createWalk, createOrbit} from "./view3d/cameras.js";
import {createPicker} from "./view3d/picking.js";
import {createCursor3D} from "./view3d/cursor.js";
import {createLabels3D} from "./view3d/labels.js";
import {createBlocks3D} from "./view3d/blocks.js";
import {createOverlays3D} from "./view3d/overlays.js";
import {createPlanView} from "./plan2d/plan.js";
import {createPlanEditor} from "./plan2d/editor.js";
import {catMap} from "./plan2d/blocks.js";
import {drawIssues} from "./plan2d/issues-draw.js";
import {drawDiffOverlay, drawSideGhost} from "./plan2d/compare-draw.js";
import {drawOverlays, drawHighlight} from "./plan2d/advisor-draw.js";
import {initTabs, initialView, initialMode} from "./ui/header.js";
import {initToolbar} from "./ui/toolbar.js";
import {createLayers} from "./ui/layers.js";
import {toast} from "./ui/toast.js";
import {initHelp} from "./ui/dialog.js";
import {onThemeChange, isDark} from "./ui/theme.js";
import {createWalkHud} from "./ui/walk-hud.js";
import {createReadout} from "./ui/readout.js";
import {createBanner} from "./ui/banner.js";
import {createMapMenu} from "./ui/mapmenu.js";
import {createInspector} from "./ui/inspector.js";
import {createAddMenu, createDeptPalette, createCategoryDialog} from "./ui/palette.js";
import {createComparePanel} from "./ui/compare.js";
import {createAdvisorPanel} from "./ui/advisor.js";
import {createReviewPanel} from "./ui/review.js";
import {attachSheetGrab} from "./ui/sheet.js";
import {createProposalControl} from "./ui/proposals.js";
import {h, icon} from "./ui/dom.js";
import {initAccount} from "./account.js";

// (the saved theme is already applied by /assets/theme-boot.js in <head>, before the page is drawn)
const $ = s => document.querySelector(s);
const app = $("#app");
const announce = msg => { const el = $("#srLive"); el.textContent = ""; requestAnimationFrame(() => { el.textContent = msg; }); };
const coarse = matchMedia("(pointer:coarse)");
const isTouch = () => coarse.matches;
const phoneMq = matchMedia("(max-width:767px), (pointer:coarse) and (max-width:1023px)");
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const drafts = createDraftKeeper(storage);
const cssToken = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ================= loading the data ================= */
async function loadJson(url) {
  const r = await fetch(url, {credentials: "same-origin", cache: "no-cache"});
  if (r.status === 401) { location.replace("/login"); throw new Error("signed out"); }
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
function stageError(title, text, retry) {
  const box = $("#mapError");
  $("#mapErrorTitle").textContent = title; $("#mapErrorText").textContent = text;
  $("#mapErrorRetry").hidden = !retry;
  box.hidden = false;
  return box;
}

boot().catch(e => {
  if (e && e.message === "signed out") return;
  console.warn("map did not start:", e && e.message);
  stageError("This map didn't start", "Something went wrong while drawing the store. Try again; if it keeps happening, tell the person who sent you the link.", true);
  $("#mapErrorRetry").addEventListener("click", () => location.reload(), {once: true});
  $("#mapErrorMaster").hidden = true;
});

async function boot() {
  initAccount();
  let me, overlay = null;
  try {
    [me, overlay] = await Promise.all([api.me(), loadJson("data/scan-overlay.json").catch(() => null)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    stageError("This map didn't load", "Check the connection and try again. Nothing you saved is lost.", true);
    $("#mapErrorRetry").addEventListener("click", () => location.reload(), {once: true});
    $("#mapErrorMaster").hidden = true;
    return;
  }
  start(me, overlay); // a failure here is caught above and shows the same "Try again" card
}

function start(me, overlay) {
  const state = {view: initialView(), mode: initialMode(), tool: "select", has3D: false, placing: null, multi: false, loading: false,
    map: {id: "master", name: "Master map", version: 0, canEdit: false, ownerName: "", updatedAt: 0, mine: false, locked: false},
    master: null, // {version, data, layout, cats, updatedAt, ownerName}: the master as Current layout / Comparison show it
    issues: collectIssues({items: []})};
  const isAdmin = me.role === "admin";
  // the Review mode (proposals, master history) is the admin's; its tab is unhidden before the tabs are wired
  app.dataset.admin = String(isAdmin); // six mode tabs need more header room than five (css collapses labels)
  if (isAdmin) $("#mode-review").hidden = false;
  else if (state.mode === "review") state.mode = "planning";
  const measure = createMeasure();
  const readout = createReadout();
  const help = initHelp();
  const banner = createBanner($("#mapBanner"));
  let lastSnap = null;
  const allows = () => modeAllows(state.mode);
  const canEdit = () => !!state.map.canEdit && !state.loading && allows().edit;
  // undo / redo also work in Advisor mode (its Apply is an edit of the open map)
  const canUndo = () => !!state.map.canEdit && !state.loading && (allows().edit || state.mode === "advisor");
  const planView = () => state.view === "plan";
  const sideBySide = () => state.mode === "comparison" && planView() && comparePanel.state.layout === "side";

  /* ================= the editing session ================= */
  const session = createSession({onChange: (kind, info) => onSessionChange(kind, info)});
  const navCache = new WeakMap();
  const navFor = layout => { let n = navCache.get(layout); if (!n) { n = buildNav(layout); navCache.set(layout, n); } return n; };
  /** What the displays draw in this mode: the master (Current layout), B of the comparison, else the open map. */
  function shown() {
    if (state.mode === "current" && state.master) return {layout: state.master.layout, cats: state.master.cats, doc: state.master.data};
    if (state.mode === "comparison") { const l = comparePanel.layoutOf("b"), d = comparePanel.docOf("b"); if (l && d) return {layout: l, cats: A.categoriesOf(d), doc: d}; }
    if (state.mode === "review" && reviewPanel) { const l = reviewPanel.shownLayout(), d = reviewPanel.shownDoc(); if (l && d) return {layout: l, cats: A.categoriesOf(d), doc: d}; }
    return {layout: session.layout, cats: session.categories, doc: session.doc};
  }
  const shownLayout = () => shown().layout;
  const shownCats = () => shown().cats;
  /** The master, fetched for Current layout and Comparison (refetched when its version may have moved). */
  async function loadMaster(force) {
    if (state.master && !force && (state.map.id !== "master" || state.master.version === state.map.version)) return state.master;
    if (state.map.id === "master") {
      state.master = {version: state.map.version, data: session.doc, layout: session.layout, cats: session.categories, updatedAt: state.map.updatedAt, ownerName: state.map.ownerName};
      return state.master;
    }
    const m = await api.master();
    state.master = {version: m.version, data: m.data, layout: toLayout(m.data), cats: A.categoriesOf(m.data), updatedAt: m.updatedAt, ownerName: m.updatedByName || m.sourceOwnerName || ""};
    return state.master;
  }

  /* ================= 3D ================= */
  let R = null, builder = null, groups = null, scan = null, walk = null, orbit = null, picker = null, cursor = null, labels3d = null, hud = null, blocks3d = null, overlays3d = null;
  let dirty3D = false, rebuildTimer = 0, built3D = null;
  function init3D() {
    const layout = shownLayout();
    R = createScene($("#three"), layout.building);
    R.setSky(isDark());
    builder = createStoreBuilder(R);
    groups = builder.build(layout);
    for (const g of Object.values(groups)) R.scene.add(g);
    R.renderer.shadowMap.needsUpdate = true;
    scan = createScanModel(R, "data/scan.glb");
    walk = createWalk({R, layout, nav: navFor(layout), toast, onArrive: () => hud && hud.arrived()});
    walk.onSpin = on => $("#btnSpin").setAttribute("aria-pressed", String(on));
    orbit = createOrbit({R, layout});
    picker = createPicker(R, layout);
    cursor = createCursor3D(R);
    labels3d = createLabels3D(R, $("#labels3d"), layout);
    blocks3d = createBlocks3D(R, $("#signs3d"));
    blocks3d.update(layout, catMap(shownCats()), isDark());
    overlays3d = createOverlays3D(R);
    hud = createWalkHud({layout, walk, getLayers: () => layers.get("walk"), announce});
    built3D = layout;
    state.has3D = true;
    sync3DIssues();
  }
  /** The store meshes follow what is shown: rebuilt when a fixture or structure item changed (a little after the last change), or the mode shows another layout. */
  function rebuild3D() {
    if (!R) return;
    dirty3D = false;
    const layout = shownLayout();
    for (const g of Object.values(groups)) { R.scene.remove(g); disposeTree(g); }
    builder.dispose();
    builder = createStoreBuilder(R);
    groups = builder.build(layout);
    for (const g of Object.values(groups)) R.scene.add(g);
    R.renderer.shadowMap.needsUpdate = true;
    picker.setLayout(layout); labels3d.setLayout(layout); walk.setLayout(layout, navFor(layout)); hud.setLayout(layout);
    blocks3d.update(layout, catMap(shownCats()), isDark());
    built3D = layout;
    gpuReleased = false;
    applyLayers(null);
    outline3D();
    sync3DIssues();
    sync3DOverlays();
  }
  function scheduleRebuild() {
    if (!R || !dirty3D) return;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { if (dirty3D && !planView()) rebuild3D(); }, 450);
  }
  // Staying in the plan for a while: free the GPU copies of the store (geometry, programs, textures). three.js
  // uploads them again on the next frame drawn, so the 3D view comes back as it was.
  let releaseTimer = 0, gpuReleased = false;
  function releaseGpuSoon() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      if (!R || gpuReleased || !planView()) return;
      disposeTree(R.scene);
      R.renderer.renderLists.dispose();
      gpuReleased = true;
    }, 60000);
  }
  function keepGpu() { clearTimeout(releaseTimer); gpuReleased = false; }
  function sync3DIssues() { if (blocks3d) blocks3d.setIssues(state.mode === "planning" || state.mode === "advisor" ? state.issues.ids : [], cssToken("--danger")); }
  const overlayColours = () => ({accent: cssToken("--accent"), danger: cssToken("--danger"), warning: cssToken("--warning"), door: cssToken("--plan-door"), slate: cssToken("--cat-12"), hot: cssToken("--cat-01"), cold: cssToken("--cat-12")});
  function sync3DOverlays() {
    if (!overlays3d) return;
    const on = state.mode === "advisor" && !planView();
    const res = on ? advisorPanel.result : null;
    overlays3d.setOverlays(res ? res.overlays : null, res ? advisorPanel.overlays : null, overlayColours());
    overlays3d.setHighlight(on && advisorPanel.shown ? advisorPanel.shown.show : null, overlayColours());
    overlays3d.show(on);
  }

  /* ================= layers ================= */
  const layers = createLayers({btn: $("#layersBtn"), pop: $("#layersPop"), onChange: key => applyLayers(key)});
  const planLayers = () => modeLayers(state.mode, layers.get("plan"));
  function applyLayers(key) {
    const v = state.view;
    $("#toolSnap").setAttribute("aria-pressed", String(layers.get().snap));
    if (R) {
      const L3 = modeLayers(state.mode, layers.get(planView() ? "3d" : v));
      groups.structure.visible = L3.structure; groups.fixtures.visible = L3.fixtures; groups.ceiling.visible = L3.ceiling;
      walk.setCeiling(L3.ceiling);
      labels3d.show(v === "3d" && L3.labels);
      blocks3d.show(L3.categories && !planView());
      if (!key || key === "structure" || key === "fixtures") R.renderer.shadowMap.needsUpdate = true;
      if (!planView()) setScan(L3.scan);
      R.requestRender();
      if (hud && (key === "structure" || key === "fixtures")) hud.invalidate();
    }
    plan.draw(); if (planA.active) planA.draw();
    syncMore();
    palette.render();
    if (key === "faint" || key === "fixtures" || key === "structure" || key === "categories") { const keep = session.selected().filter(selectionVisible); if (keep.length !== session.selection.length) session.select(keep.map(it => it.id)); }
  }
  const selectionVisible = it => { const L = planLayers(); return it.type === "area" ? L.categories : isStructure(it) ? L.structure : (L.fixtures || !planView()); };
  let scanToken = 0;
  async function setScan(mode) {
    const bannerEl = $("#scanBanner"), my = ++scanToken;
    if (mode !== "off" && !scan.loaded && !scan.failed) { bannerEl.className = "banner"; bannerEl.textContent = "Loading the 3D scan…"; bannerEl.hidden = false; }
    const ok = await scan.setMode(mode);
    if (my !== scanToken) return;
    if (mode !== "off" && !ok) { bannerEl.className = "banner error"; bannerEl.textContent = "The 3D scan didn't load. Everything else still works."; bannerEl.hidden = false; setTimeout(() => { bannerEl.hidden = true; }, 6000); }
    else bannerEl.hidden = true;
  }

  /* ================= plan + editor ================= */
  const selIds = () => (allows().select ? new Set(session.selection) : new Set());
  const planOpts = {
    canvas: $("#planCanvas"), layout: session.layout,
    overlay: () => overlay,
    getLayers: () => planLayers(),
    getFaint: () => planLayers().faint,
    getCats: () => catMap(shownCats()),
    isDark,
    getSelIds: selIds,
    getTool: () => state.tool,
    getWalker: () => (walk ? {ME: walk.ME, halfH: walk.CAM.halfH} : null),
    measure,
    snapAt: (x, y, tol) => snapPoint({x, y}, session.snapTargets, {tol: clamp(tol, 0.2, 3), snap: layers.get().snap}),
    onSelect: (it, opts) => planClick(it, opts),
    onGo: (x, y, item) => goWalk(x, y, item),
    onPointer: p => readout.pointer(p),
    onMeasure: snap => {
      lastSnap = snap;
      if (!snap) { readout.hide(); return; }
      const [sx, sy] = plan.toScreen(snap.x, snap.y);
      readout.show($("#viewPlan"), snap, sx, sy, measure.state);
    },
    onViewChange: V => { updateScale(V); if (sideBySide() && planA.active) planA.setViewFrom(V); },
    extraDraw: (ctx, V, tok) => extraDraw(ctx, V, tok),
  };
  const plan = createPlanView(planOpts);
  const editor = createPlanEditor({
    plan, session, canEdit, toast,
    snapOn: () => layers.get().snap, touch: isTouch, multiMode: () => state.multi, dimensionsOn: () => layers.get().dimensions,
    onDblClick: it => { if (it) { session.select(it.id); inspector.focusFirst(); } },
    onGesture: kind => { app.dataset.gesture = kind || ""; if (!kind) syncStatus(); },
  });
  planOpts.editor = editor; // the plan reads it at event time, so the two can know each other (null in read-only modes)
  // the second plan of Comparison's side-by-side display (the base layout A), locked to the main one
  const planA = createPlanView({
    canvas: $("#planCanvasA"), layout: session.layout, overlay: () => null,
    getLayers: () => ({...planLayers(), dimensions: false}), getFaint: () => planLayers().faint,
    getCats: () => catMap(comparePanel.docOf("a") ? A.categoriesOf(comparePanel.docOf("a")) : session.categories), isDark,
    getSelIds: () => new Set(), getTool: () => (state.tool === "measure" ? "select" : state.tool), getWalker: () => null, measure,
    snapAt: (x, y) => ({x, y}), onSelect: it => { if (it) compareClick(it.id); }, onGo: () => {}, onPointer: p => readout.pointer(p), onMeasure: () => {},
    onViewChange: V => { if (sideBySide()) plan.setViewFrom(V); },
    extraDraw: (ctx, V, tok) => { if (state.mode === "comparison") drawSideGhost(ctx, V, comparePanel.selectedRow(), "a", tok); },
  });
  /** What a click on the plan does outside the editor: select (Blank slate, Advisor), pick a difference (Comparison), nothing (Current layout). */
  function planClick(it, opts) {
    if (state.mode === "comparison") { if (it) compareClick(it.id); return; }
    if (state.mode === "review") { if (it && reviewPanel) reviewClick(it.id); return; }
    if (!allows().select) return;
    if (!it) session.clearSelection(); else session.select(it.id, {toggle: !!(opts && opts.toggle)});
  }
  /** The mode's own drawing over the plan: collision outlines, the comparison diff, the advisor's overlays and highlight. */
  function extraDraw(ctx, V, tok) {
    if (state.mode === "planning") drawIssues(ctx, V, session.layout, state.issues, tok);
    else if (state.mode === "comparison") {
      if (comparePanel.state.layout === "overlay") drawDiffOverlay(ctx, V, comparePanel.diff, tok, {selected: comparePanel.state.selected});
      else drawSideGhost(ctx, V, comparePanel.selectedRow(), "b", tok);
    } else if (state.mode === "advisor") {
      const res = advisorPanel.result;
      if (res) drawOverlays(ctx, V, res.overlays, advisorPanel.overlays, tok);
      drawIssues(ctx, V, session.layout, state.issues, tok, {markers: false});
      if (advisorPanel.shown) drawHighlight(ctx, V, advisorPanel.shown.show, session.layout, tok);
    } else if (state.mode === "review" && reviewPanel && reviewPanel.diff) {
      drawDiffOverlay(ctx, V, reviewPanel.diff, tok, {selected: reviewPanel.state.selected});
    }
  }
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
  const fitPlan = () => { plan.fit(); fitScale = plan.V.s; };
  $("#zFit").addEventListener("click", fitPlan);
  $("#fabFit").addEventListener("click", fitPlan);
  $("#fabLayers").addEventListener("click", () => layers.open());

  /* ================= collision warnings (OWNER RULES v3.1 rule 5) ================= */
  function recheck() {
    state.issues = collectIssues(session.doc);
    const chip = $("#issueChip"), fab = $("#issueFab"), on = state.issues.count > 0 && (state.mode === "planning" || state.mode === "advisor");
    chip.hidden = !on; fab.hidden = !on || !planView();
    $("#issueChipText").textContent = state.issues.label; $("#issueFabText").textContent = state.issues.label;
    chip.setAttribute("aria-label", on ? `${state.issues.label}: show the first` : ""); fab.setAttribute("aria-label", on ? `${state.issues.label}: show the first` : "");
    sync3DIssues();
  }
  /** The chip: select the first offending block and open its Checks. */
  function showFirstIssue() {
    const id = firstOffender(state.issues);
    if (!id) return;
    if (state.mode !== "planning") setMode("planning");
    session.select(id);
    const it = session.layout.byId.get(id);
    if (planView() && it) plan.ensureVisible(it);
    else if (orbit && it) orbit.focus({x: it.x, y: it.y});
    inspector.focusChecks();
    announce(`${state.issues.label}. ${(state.issues.byId[id] || []).map(i => i.message).join(". ")}`);
  }
  $("#issueChip").addEventListener("click", showFirstIssue);
  $("#issueFab").addEventListener("click", showFirstIssue);

  /* ================= what the session tells the app ================= */
  let suppressSave = false, advisorTimer = 0;
  function onSessionChange(kind, info = {}) {
    if (kind === "load" || kind === "doc") {
      const layout = session.layout;
      recheck();
      if (state.mode !== "current" && state.mode !== "comparison") plan.setLayout(layout);
      if (R && state.mode !== "current" && state.mode !== "comparison") {
        blocks3d.update(layout, catMap(session.categories), isDark());
        const structural = kind === "load" || info.replaced || info.undo || info.redo || info.cancelled || !info.ids || info.ids.some(id => { const it = layout.byId.get(id); return !it || it.type !== "area"; });
        if (structural) { dirty3D = true; if (!planView()) scheduleRebuild(); }
        outline3D();
      }
      if (kind === "doc" && !suppressSave) {
        if (state.map.canEdit && !state.loading) { autosave.change(); drafts.write(state.map.id, state.map.version, session.doc); }
      }
      if (state.map.id === "master") state.master = null; // the admin edited the master: Current layout / Comparison read it again
      if (state.mode === "advisor") { clearTimeout(advisorTimer); advisorTimer = setTimeout(() => { if (state.mode === "advisor") { advisorPanel.run(); plan.draw(); sync3DOverlays(); } }, 200); }
      if (state.mode === "comparison") comparePanel.liveChanged();
      inspector.render();
      palette.render();
      syncEmpty();
      syncStatus();
    }
    if (kind === "selection") {
      plan.draw();
      inspector.render();
      palette.render();
      if (R) blocks3d.setSelected(allows().select ? session.selection : []);
      outline3D();
      syncToolbar();
      syncStatus();
      if (editor.shapeEdit && !(session.single && session.single.type === "area")) editor.setShapeEdit(false);
      if (phoneMq.matches && session.selection.length && state.mode === "planning") $("#palette").classList.remove("open");
      if (phoneMq.matches && planView() && session.single && allows().inspector) plan.revealAbove(session.single, plan.V.H * 0.46);
    }
    if (kind === "history") syncToolbar();
    if (kind === "lock") { syncLock(); inspector.render(); plan.draw(); }
  }
  function syncStatus() {
    const items = allows().select ? session.selected() : [];
    if (!items.length) { readout.selection(""); $("#planLive").textContent = ""; return; }
    if (items.length === 1) {
      const it = items[0];
      const text = it.type === "area" ? `${displayName(it)} · ${formatSqft(A.blockArea(it))} · ${formatFtIn(it.w)} × ${formatFtIn(it.d)}` : `${displayName(it)} · ${formatFtIn(it.w)} × ${formatFtIn(it.d)}`;
      const warn = state.issues.byId[it.id] ? ` · ${state.issues.byId[it.id].length} warning${state.issues.byId[it.id].length === 1 ? "" : "s"}` : "";
      readout.selection("1 selected · " + text + warn);
      $("#planLive").textContent = `${displayName(it)}, ${(TYPES[it.type] || {}).label || it.type}, ${formatFtIn(it.w)} by ${formatFtIn(it.d)}, at ${formatFtIn(it.x)} east, ${formatFtIn(it.y)} north${warn}`;
    } else { readout.selection(`${items.length} selected`); $("#planLive").textContent = `${items.length} items selected`; }
  }
  function syncEmpty() { $("#catsEmpty").hidden = !(state.mode === "planning" && planView() && canEdit() && !session.doc.items.some(it => it.type === "area")); }
  function syncToolbar() {
    const n = session.selected().filter(it => !session.isLocked(it)).length;
    $("#btnUndo").disabled = !session.history.canUndo() || !canUndo();
    $("#btnRedo").disabled = !session.history.canRedo() || !canUndo();
    for (const id of ["btnDup", "btnRot", "btnDel"]) $("#" + id).disabled = !n || !canEdit();
    $("#btnUndo").title = "Undo" + (session.history.undoLabel() ? ` ${session.history.undoLabel().toLowerCase()}` : "") + " (Ctrl+Z)";
    $("#btnRedo").title = "Redo" + (session.history.redoLabel() ? ` ${session.history.redoLabel().toLowerCase()}` : "") + " (Ctrl+Shift+Z)";
  }
  function syncLock() {
    const on = session.unlocked, b = $("#btnLock");
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Structure unlocked" : "Structure locked");
    b.title = on ? "Structure unlocked: walls, doors, columns, floors and stairs can move. Click to lock them again" : "Structure locked: walls, doors, columns, floors and stairs stay put. Click to unlock";
    $("#lockLabel").textContent = on ? "Structure unlocked" : "Structure locked";
    b.querySelector("use").setAttribute("href", "/assets/icons.svg#" + (on ? "i-unlock" : "i-lock"));
    syncMore();
  }

  /* ================= edits (shared by the inspector, toolbar, keys and menus) ================= */
  function applyOrToast(result, opts) {
    const r = session.apply(result, opts);
    if (r && r.error) { toast(r.error); return null; }
    return r;
  }
  const act = {
    /** Sets one field on these items (one undo step). Returns an error sentence or null. */
    setField(ids, field, value) {
      if (!canEdit()) return "This map is view only.";
      if (field === "cat") return act.setCategory(ids[0], value);
      session.begin(field === "name" ? "Rename" : field === "color" ? "Recolour" : field === "rot" ? "Rotate" : "Edit");
      let error = null;
      for (const id of ids) { const r = D.setField(session.doc, id, field, value, session.editOpts); if (r.error) { error = r.error; break; } session.apply(r); }
      if (error) session.cancel(); else session.end();
      return error;
    },
    duplicate() {
      const ids = session.selected().filter(it => !session.isLocked(it)).map(it => it.id);
      if (!ids.length || !canEdit()) return;
      const r = applyOrToast(D.duplicateItems(session.doc, ids, session.editOpts), {label: "Duplicate"});
      if (r) session.select(r.ids);
    },
    rotate(by) { if (canEdit()) editor.rotateBy(by); },
    remove() {
      const items = session.selected().filter(it => !session.isLocked(it));
      if (!items.length || !canEdit()) return;
      const r = applyOrToast(D.deleteItems(session.doc, items.map(it => it.id), session.editOpts), {label: "Delete"});
      if (!r) return;
      const label = items.length === 1 ? `Deleted “${displayName(items[0])}”.` : `Deleted ${items.length} items.`;
      const inverse = r.inverse, ids = r.ids;
      toast(label, {action: {label: "Undo", onClick: () => { session.applyPatch(inverse, "Undo delete"); session.select(ids); }}});
    },
    sizeToTarget(id) { applyOrToast(A.sizeToTarget(session.doc, id), {label: "Size to target"}); },
    lockArea(id, on) { applyOrToast(A.setLockArea(session.doc, id, on), {label: on ? "Lock area" : "Unlock area"}); inspector.render(true); },
    setCategory(id, key) { const r = session.apply(A.setBlockCategory(session.doc, id, key), {label: "Change department"}); return r && r.error ? r.error : null; },
    setTarget(key, sqft) { const r = session.apply(A.updateCategory(session.doc, key, {targetSqft: sqft}), {label: "Change target"}); return r && r.error ? r.error : null; },
    toRectangle(id) { applyOrToast(A.toRectangle(session.doc, id), {label: "Back to a rectangle"}); },
    editCategory(key) { catDialog.open(key); },
    unlock() { session.setUnlocked(true); toast("Structure unlocked. Walls, doors, columns, floors and stairs can move now.", {ms: 4000}); },
    goLook(it) { goLook(it); },
    fit(items) { plan.fitTo(items); fitScale = plan.V.s; },
    /** The advisor's one-tap fix: a doc edit through the history (undoable). Returns an error sentence or null. */
    applyFix(rec) {
      if (!state.map.canEdit) return "This map is view only. Make your own copy to apply fixes.";
      const r = fixEdits(session.doc, rec.apply);
      if (r.error) return r.error;
      suppressSave = false;
      session.applyPatch(r.patch, rec.apply.text || "Advisor fix");
      if (allows().select) session.select(r.ids);
      return null;
    },
  };
  /** Drops a department block in the middle of the plan (Departments palette / Add menu). */
  function placeDepartment(key, at) {
    if (!canEdit()) { toast("This map is view only. Make your own copy to place departments."); return; }
    const p = at || plan.center();
    const r = applyOrToast(A.createBlock(session.doc, key, p, {grid: layers.get().snap ? GRID : 0}), {label: "Place department"});
    if (!r) return;
    session.select(r.id);
    if (planView()) plan.ensureVisible(session.layout.byId.get(r.id));
    announce(`${(A.categoryFor(session.doc, key) || {}).name || "Department"} placed. Drag it into place.`);
  }
  function addItem(type) {
    if (!canEdit()) return;
    if (type === "area") { addMenu.open("departments"); return; }
    const r = applyOrToast(D.addItem(session.doc, type, plan.center(), {...session.editOpts, grid: layers.get().snap ? GRID : 0}), {label: `Add ${D.PALETTE[type].label.toLowerCase()}`});
    if (!r) return;
    session.select(r.id);
    if (state.view === "3d") { dirty3D = true; scheduleRebuild(); }
    inspector.focusFirst();
  }

  /* ================= panels ================= */
  const inspector = createInspector({
    el: $("#inspector"), session, editor, canEdit, isTouch: () => phoneMq.matches, toast, act, canGoLook: it => canGoLook(it),
    mapInfo: () => ({name: state.map.id === "master" ? "Master map" : state.map.name, master: state.map.id === "master", ownerName: state.map.ownerName, updatedAt: state.map.updatedAt}),
    modeNotice: () => modeNotice(state.mode, {master: state.map.id === "master", canEdit: !!state.map.canEdit}),
    issues: () => (state.mode === "planning" ? state.issues : null),
    issuesFor: id => (state.mode === "planning" || state.mode === "advisor" ? state.issues.byId[id] || [] : null),
    onIssues: () => showFirstIssue(),
    onSheet: s => { app.dataset.sheet = s; },
  });
  const palette = createDeptPalette({
    el: $("#palette"), session, canEdit, toast, isDark, isTouch: () => phoneMq.matches,
    getFixtures: () => layers.fixMode(),
    onFixtures: mode => layers.setFixtures(mode),
    onPlace: key => placeDepartment(key),
    onSelectBlock: id => { session.select(id); const it = session.layout.byId.get(id); if (it && planView()) plan.ensureVisible(it); },
    onEdit: key => catDialog.open(key),
    onNew: () => catDialog.open(null),
    onClose: () => $("#palette").classList.remove("open"),
    onFind: r => showFound(r),
  });
  const catDialog = createCategoryDialog({
    session, canEdit,
    onSave(key, fields) {
      if (!canEdit()) return "This map is view only.";
      const r = key ? A.updateCategory(session.doc, key, fields) : A.addCategory(session.doc, fields);
      const res = session.apply(r, {label: key ? "Edit category" : "New category"});
      if (res && res.error) return res.error;
      if (!key) toast(`Category “${fields.name.trim()}” added. Tap it in the list to place it.`, {icon: "i-check"});
      return null;
    },
    onDelete(key) {
      const cat = A.categoryFor(session.doc, key, session.categories);
      const r = session.apply(A.deleteCategory(session.doc, key), {label: "Delete category"});
      if (r && r.error) return r.error;
      const inverse = r.inverse;
      toast(`Deleted “${cat ? cat.name : "category"}”${r.removedBlocks && r.removedBlocks.length ? ` and its ${r.removedBlocks.length} block${r.removedBlocks.length > 1 ? "s" : ""}` : ""}.`, {action: {label: "Undo", onClick: () => session.applyPatch(inverse, "Undo delete")}});
      return null;
    },
    onReset(key) { const r = session.apply(A.resetCategory(session.doc, key), {label: "Reset category"}); return r && r.error ? r.error : null; },
  });
  const addMenu = createAddMenu({
    btn: $("#addBtn"), pop: $("#addPop"), session, toast, isDark,
    startMode: () => "items",
    hint3d: () => state.view === "3d",
    onAdd: type => addItem(type),
    onDepartment: key => { if (state.view === "3d") startPlacing(key); else placeDepartment(key); },
  });
  function showFound(r) {
    const blocks = session.doc.items.filter(it => it.type === "area" && it.cat === r.key);
    if (blocks.length) {
      session.select(blocks[0].id);
      if (planView()) plan.ensureVisible(session.layout.byId.get(blocks[0].id));
      toast(`${r.zoneName}${r.subcat ? ` · ${r.subcat}` : ""}: highlighted on the plan.`, {icon: "i-check"});
    } else if (canEdit()) toast(`${r.zoneName} isn't placed on this map yet.`, {action: {label: "Place it", onClick: () => placeDepartment(r.key)}});
    else toast(`${r.zoneName} isn't placed on this map yet.`);
  }
  $("#deptBtn").addEventListener("click", () => {
    const p = $("#palette"); const open = !p.classList.contains("open");
    p.classList.toggle("open", open); $("#deptBtn").setAttribute("aria-expanded", String(open));
    if (open) { session.clearSelection(); const b = session.building; plan.revealAbove({x: b.L / 2, y: b.W / 2}, plan.V.H * 0.72); }
  });
  $("#catsEmptyBtn").addEventListener("click", () => $("#deptBtn").click());

  /* ================= Comparison and Advisor (the mode panels) ================= */
  const openMapInfo = () => ({id: state.map.id, name: state.map.id === "master" ? "Master map" : state.map.name, ownerName: state.map.ownerName, mine: state.map.mine, version: state.map.version, updatedAt: state.map.updatedAt});
  const comparePanel = createComparePanel({
    el: $("#comparePanel"), isAdmin, toast, isTouch: () => phoneMq.matches,
    getOpenMap: openMapInfo,
    listMaps: () => api.maps(),
    loadMap: async id => {
      if (id === "master") { const m = await loadMaster(true); return {doc: m.data, name: "Master map", version: m.version, ownerName: m.ownerName, updatedAt: m.updatedAt}; }
      const r = await api.map(id);
      return {doc: r.data, name: r.meta.name, version: r.meta.version, ownerName: r.meta.ownerName, updatedAt: r.meta.updatedAt};
    },
    liveDoc: id => (id === state.map.id ? session.doc : null),
    flushSave: () => (autosave.pending ? autosave.flush() : Promise.resolve()),
    apply: (mapId, baseVersion, changes) => api.applyToMaster(mapId, baseVersion, changes),
    onChange: what => onCompareChange(what),
    onClose: () => closePanelSheet(),
  });
  function onCompareChange(what) {
    if (state.mode !== "comparison") return;
    if (what === "docs" || what === "layout") {
      syncSide();
      plan.setLayout(shownLayout());
      const la = comparePanel.layoutOf("a"); if (la) planA.setLayout(la);
      $("#sideTagA").textContent = comparePanel.nameOf("a"); $("#sideTagB").textContent = comparePanel.nameOf("b");
      if (R) { dirty3D = true; if (!planView()) rebuild3D(); }
      if (what === "docs" && state.map.id === "master" && comparePanel.state.a === "master") mapMenu.refresh();
    }
    if (what === "selection") {
      const row = comparePanel.selectedRow(), b = row ? rowBounds(row) : null;
      if (b) {
        if (planView()) { plan.fitBox({...b, x0: b.x0 - 12, x1: b.x1 + 12, y0: b.y0 - 12, y1: b.y1 + 12}); if (sideBySide()) planA.setViewFrom(plan.V); }
        else if (orbit) orbit.focus({x: b.cx, y: b.cy});
        if (R) { const id = row.id, after = row.after; blocks3d.setSelected(id && after && after.type === "area" ? [id] : []); const it = id ? shownLayout().byId.get(id) : null; cursor && cursor.select(it && it.type !== "area" ? it : null, it ? drawnHeight(it) : 0, it ? baseOf(shownLayout(), it) : 0); }
      } else if (R) { blocks3d.setSelected([]); if (cursor) cursor.select(null); }
      if (phoneMq.matches && row) closePanelSheet();
    }
    plan.draw(); if (planA.active) planA.draw();
  }
  /** A click on an item in Comparison picks its difference row, if it has one. */
  function compareClick(id) {
    const diff = comparePanel.diff; if (!diff) return;
    const row = diff.rows.find(r => r.id === id);
    if (row) { comparePanel.select(rowKey(row)); comparePanel.reveal(rowKey(row)); }
  }
  /** Side by side: the second plan (A) shows on the left half; the main plan shows B on the right. */
  let sideWas = false;
  function syncSide() {
    const on = sideBySide();
    app.dataset.side = String(on);
    $("#viewPlanA").hidden = !on;
    planA.setActive(on);
    if (on) { planA.resize(); plan.resize(); if (!sideWas) { plan.fit(); fitScale = plan.V.s; } planA.setViewFrom(plan.V); }
    else { plan.resize(); if (sideWas && planView()) { plan.fit(); fitScale = plan.V.s; } }
    sideWas = on;
  }
  const advisorPanel = createAdvisorPanel({
    el: $("#advisorPanel"), isAdmin, toast, isTouch: () => phoneMq.matches,
    getDoc: () => session.doc,
    getCategories: () => session.categories,
    canEdit: () => !!state.map.canEdit,
    loadConfig: () => api.advisorConfig(),
    saveConfig: cfg => api.putAdvisorConfig(cfg),
    resetConfig: () => api.resetAdvisorConfig(),
    onOverlays: () => { plan.draw(); sync3DOverlays(); },
    onShow: rec => {
      const b = rec ? showBounds(rec.show, session.layout) : null;
      if (rec && allows().select) session.select((rec.show.ids || []).filter(id => session.layout.byId.has(id)));
      if (b) {
        if (planView()) plan.fitBox({...b, x0: b.x0 - 10, x1: b.x1 + 10, y0: b.y0 - 10, y1: b.y1 + 10});
        else if (orbit) orbit.focus({x: b.cx, y: b.cy});
      }
      if (phoneMq.matches && rec) closePanelSheet();
      plan.draw(); sync3DOverlays();
      if (rec) announce(`Showing: ${rec.title}`);
    },
    applyFix: rec => act.applyFix(rec),
    onClose: () => closePanelSheet(),
  });
  let advisorLoaded = false;
  function openPanelSheet() { const p = $(state.mode === "comparison" ? "#comparePanel" : state.mode === "review" ? "#reviewPanel" : "#advisorPanel"); p.classList.add("open"); $("#panelBtn").setAttribute("aria-expanded", "true"); const f = p.querySelector("button:not(.sheet-grab), select, input"); if (f) f.focus(); }
  function closePanelSheet() { for (const p of [$("#comparePanel"), $("#advisorPanel"), $("#reviewPanel")]) p.classList.remove("open"); $("#panelBtn").setAttribute("aria-expanded", "false"); }
  $("#panelBtn").addEventListener("click", () => { const open = $("#panelBtn").getAttribute("aria-expanded") === "true"; if (open) closePanelSheet(); else openPanelSheet(); });

  /* ================= Review (admin): proposals, any map vs the master, master history ================= */
  let compareWith = null; // "open this map in Comparison" from the Review panel
  const reviewPanel = !isAdmin ? null : createReviewPanel({
    el: $("#reviewPanel"), toast, announce, isTouch: () => phoneMq.matches,
    setSheet: s => { if (sheets.reviewPanel) sheets.reviewPanel.set(s); },
    onClose: () => closePanelSheet(),
    confirm: opts => mapMenu.confirm(opts),
    loadProposals: () => api.proposals(),
    loadProposal: id => api.proposal(id),
    decide: (id, body) => api.decideProposal(id, body),
    listMaps: () => api.maps(),
    loadMap: id => api.map(id),
    loadMasterMeta: () => api.master(),
    history: () => api.masterHistory(),
    historyVersion: v => api.masterVersion(v),
    restore: (version, baseVersion) => api.restoreMaster(version, baseVersion),
    onChange: what => onReviewChange(what),
    onMasterChanged: () => {
      state.master = null;
      mapMenu.refresh();
      refreshProposals();
      if (state.map.id === "master" && !autosave.pending) openMap("master", {reload: true});
    },
    onCompare: id => { compareWith = id; setMode("comparison"); },
  });
  // phones: the Departments palette and the mode panels are bottom sheets with a peek / expanded grab bar
  const sheets = {};
  for (const id of ["palette", "comparePanel", "advisorPanel", ...(reviewPanel ? ["reviewPanel"] : [])]) sheets[id] = attachSheetGrab($("#" + id));
  function onReviewChange(what) {
    if (state.mode !== "review" || !reviewPanel) return;
    if (what === "docs") {
      plan.setLayout(shownLayout());
      if (R) { dirty3D = true; if (!planView()) rebuild3D(); }
    }
    if (what === "selection") {
      const row = reviewPanel.selectedRow(), b = row ? rowBounds(row) : null;
      if (b) {
        if (planView()) plan.fitBox({...b, x0: b.x0 - 12, x1: b.x1 + 12, y0: b.y0 - 12, y1: b.y1 + 12});
        else if (orbit) orbit.focus({x: b.cx, y: b.cy});
        if (R) { const id = row.id, after = row.after; blocks3d.setSelected(id && after && after.type === "area" ? [id] : []); const it = id ? shownLayout().byId.get(id) : null; cursor && cursor.select(it && it.type !== "area" ? it : null, it ? drawnHeight(it) : 0, it ? baseOf(shownLayout(), it) : 0); }
      } else if (R) { blocks3d.setSelected([]); if (cursor) cursor.select(null); }
      if (phoneMq.matches && row) closePanelSheet();
    }
    plan.draw();
  }
  /** A click on an item in Review picks its difference row, if it has one. */
  function reviewClick(id) {
    const diff = reviewPanel.diff; if (!diff) return;
    const row = diff.rows.find(r => r.id === id);
    if (row) { reviewPanel.select(rowKey(row)); reviewPanel.reveal(rowKey(row)); }
  }

  /* ================= proposals: "Submit for review" on a map of your own (rule 7) ================= */
  const propCtl = createProposalControl({
    chip: $("#propChip"), fab: null, dlg: $("#propDlg"), toast, announce,
    flushSave: () => (autosave.pending ? autosave.flush() : Promise.resolve()),
    submit: (mapId, note) => api.submitProposal(mapId, note),
    withdraw: id => api.withdrawProposal(id),
    refresh: () => refreshProposals(),
    getMap: () => ({id: state.map.id, name: state.map.name, mine: state.map.mine, master: state.map.id === "master", canEdit: state.map.canEdit}),
  });
  let proposalsLoading = null;
  function refreshProposals() {
    if (proposalsLoading) return proposalsLoading;
    proposalsLoading = (async () => {
      try {
        const r = await api.proposals();
        const mine = (r.proposals || []).filter(p => p.mine);
        propCtl.setProposals(mine);
        mapMenu.setProposals(mine);
      } catch { /* offline: the chip keeps what it has */ }
      proposalsLoading = null;
    })();
    return proposalsLoading;
  }

  /* ================= admin settings: sharing and the master lock (in the account menu) ================= */
  let adminSettings = null;
  async function loadAdminSettings() {
    if (!isAdmin) return;
    try { adminSettings = await api.settings(); renderAcctSettings(); } catch { /* the dashboard still has them */ }
  }
  function renderAcctSettings() {
    if (!isAdmin || !adminSettings) return;
    const box = $("#acctSettings");
    $("#setLabel").hidden = false;
    box.hidden = false;
    box.textContent = "";
    const row = (label, hint, on, onToggle) => {
      const b = h("button", {type: "button", class: "acct-set", role: "menuitemcheckbox", aria: {checked: on}, tabindex: -1,
        onclick: async () => { b.disabled = true; try { await onToggle(!on); } catch (e) { toast(e instanceof ApiError && e.message ? e.message : "Couldn't change that setting."); } b.disabled = false; }},
        h("span", {class: "as-text"}, h("b", {text: label}), h("span", {text: hint})),
        h("span", {class: "sw-track", aria: {hidden: true}}, h("span", {class: "sw-knob"})));
      return b;
    };
    box.appendChild(row("Share everyone's maps", adminSettings.shareMaps ? "The team sees each other's maps, read-only" : "Only you see the team's maps", !!adminSettings.shareMaps, async v => {
      adminSettings = await api.putSettings({shareMaps: v});
      renderAcctSettings(); mapMenu.refresh();
      toast(v ? "Sharing is on: everyone sees everyone's maps, read-only." : "Sharing is off: people see only their own maps and the master.", {icon: "i-check"});
    }));
    box.appendChild(row("Lock the master map", adminSettings.masterLocked ? "Nobody can change it, you included" : "Changes to the master save new versions", !!adminSettings.masterLocked, async v => {
      adminSettings = await api.putSettings({masterLocked: v});
      renderAcctSettings();
      toast(v ? "The master map is locked. Nobody can change it until you unlock it." : "The master map is unlocked.", {icon: v ? "i-lock" : "i-unlock"});
      if (state.map.id === "master") openMap("master", {reload: true});
      else syncLockBadge();
    }));
  }
  function syncLockBadge() { $("#lockBadge").hidden = !(state.map.id === "master" && state.map.locked); }
  $("#acctBtn").addEventListener("click", () => { if (isAdmin) loadAdminSettings(); });

  /* ================= maps: loading, switching, autosave ================= */
  const mapMenu = createMapMenu({
    me: () => me,
    list: () => api.maps(),
    onOpen: id => openMap(id),
    onCreate: async ({name, from, mapId}) => {
      const r = await api.createMap(name, from, mapId === "master" ? undefined : mapId);
      await openMap(r.meta.id, {fresh: r});
      if (state.mode !== "planning") setMode("planning");
      toast(`“${r.meta.name}” is ready. Only you can change it.`, {icon: "i-check"});
    },
    onRename: async (id, name) => {
      const meta = mapMenu.find(id);
      const r = await api.renameMap(id, id === state.map.id ? state.map.version : (meta ? meta.version : 1), name);
      if (id === state.map.id) { state.map.version = r.version; state.map.name = name; state.map.updatedAt = r.updatedAt; mapMenu.setCurrent({...state.map}); }
    },
    onDelete: async id => {
      await api.deleteMap(id);
      drafts.clear(id);
      if (id === state.map.id) { autosave.reset(); await openMap("master"); }
      toast("Map deleted.");
    },
  });
  mapMenu.setSharing(isAdmin);

  async function saveNow() {
    // the map and the document being saved are captured now: the response arrives later, after more edits or
    // even after the person opened another map, and only what was saved may be updated
    const map = state.map, data = session.doc;
    try {
      let version;
      if (map.id === "master") {
        const r = await api.putMaster(map.version, data);
        map.version = r.version; map.updatedAt = r.updatedAt; map.ownerName = me.name; version = r.version;
        mapMenu.setMaster({version: r.version, updatedAt: r.updatedAt, ownerName: me.name});
      } else {
        const r = await api.saveMap(map.id, map.version, data);
        map.version = r.version; map.updatedAt = r.updatedAt; version = r.version;
        if (state.map === map) mapMenu.setCurrent({...map});
      }
      drafts.saved(map.id, data, version, state.map === map ? session.doc : null);
      return {ok: true};
    } catch (e) {
      if (e instanceof ApiError) return {ok: false, status: e.status, error: e.message};
      return {ok: false, status: 0, error: "Couldn't reach the site."};
    }
  }
  const autosave = createAutosave({save: saveNow, online: () => navigator.onLine !== false, onState: s => onSaveState(s)});
  function onSaveState(s) {
    mapMenu.setStatus(state.map.canEdit ? s : "hidden");
    if (s === "conflict") banner.show("conflict", state.map.id === "master" ? "The master map was changed since you opened it. Reload it to keep going. Your unsaved edits are kept on this device." : "This map was changed somewhere else. Reload it to keep going. Your unsaved edits are kept on this device.", [{label: "Reload", onClick: () => openMap(state.map.id, {reload: true})}]);
    else if (s === "locked") banner.show("locked", "The master map is locked. Nobody can change it until the admin unlocks it. Your edits are kept on this device.", [{label: "Reload", onClick: () => openMap(state.map.id, {reload: true})}]);
    else if (s === "offline") banner.show("offline", "You're offline. Changes are kept on this device and saved when you're back.");
    else if (s === "retry") banner.show("notsaved", "Couldn't save. Trying again in 10 s.", [{label: "Try now", onClick: () => autosave.tryNow()}]);
    else if (s === "rejected") banner.show("notsaved", `Couldn't save: ${autosave.error} The edits are kept on this device; fix the item and it will try again.`, [{label: "Try now", onClick: () => autosave.tryNow()}]);
    else if (["conflict", "locked", "offline", "notsaved"].includes(banner.kind)) banner.hide();
  }
  window.addEventListener("online", () => autosave.tryNow());
  window.addEventListener("beforeunload", () => { if (autosave.pending) autosave.flush(); });

  /** The read-only banner belongs to Area planning; the other modes say what they are themselves. */
  function syncReadOnlyBanner() {
    if (banner.kind && banner.kind !== "readonly") return;
    if (state.mode !== "planning" || state.map.canEdit) { banner.hide("readonly"); return; }
    // the locked master: the admin would normally edit it here, so say why they can't (and offer the key)
    if (state.map.id === "master" && state.map.locked && isAdmin) {
      banner.show("readonly", [{text: "The master map is locked", bold: true}, {text: `${state.map.lockedByName ? ` by ${state.map.lockedByName}` : ""}. Nobody can change it until it's unlocked.`}],
        [{label: "Unlock", primary: true, onClick: async () => {
          try { adminSettings = await api.putSettings({masterLocked: false}); toast("The master map is unlocked.", {icon: "i-unlock"}); openMap("master", {reload: true}); }
          catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't unlock the master map."); }
        }}]);
      return;
    }
    const id = state.map.id, who = id === "master" ? "the master map" : `${state.map.ownerName || "someone"}'s map`;
    banner.show("readonly", [{text: `Viewing ${who}`, bold: true}, {text: " (read-only)"}], [{label: "Make my own copy", primary: true, onClick: () => mapMenu.newMap({from: id === "master" ? "master" : "map", mapId: id === "master" ? null : id, name: id === "master" ? `My master copy` : `Copy of ${state.map.name}`.slice(0, 60)})}]);
  }

  /** Opens the master ("master") or a map by id. opts: reload (after a conflict), fresh ({meta, data} just created). */
  async function openMap(id, opts = {}) {
    if (state.loading) return;
    state.loading = true;
    editor.cancelGesture(); cancelPlacing();
    $("#mapError").hidden = true;
    try {
      // edits made in the last 1.5 s are saved before the other map opens (a conflict / lock / failed save leaves them
      // in the draft kept on this device instead; a reload after a conflict starts clean on purpose)
      if (!opts.reload && state.map && state.map.canEdit && autosave.pending) await autosave.flush();
      let next;
      if (id === "master") {
        const m = opts.fresh || await api.master();
        next = {id: "master", name: "Master map", version: m.version, data: m.data, canEdit: isAdmin && !m.locked, ownerName: m.updatedByName || m.sourceOwnerName || "", updatedAt: m.updatedAt, mine: false, locked: !!m.locked, lockedByName: m.lockedByName};
        mapMenu.setMaster({version: m.version, updatedAt: m.updatedAt, ownerName: next.ownerName});
      } else {
        const m = opts.fresh || await api.map(id);
        next = {id: m.meta.id, name: m.meta.name, version: m.meta.version, data: m.data, canEdit: !!(m.canEdit ?? m.meta.mine), ownerName: m.meta.ownerName, updatedAt: m.meta.updatedAt, mine: !!m.meta.mine, locked: false};
      }
      autosave.reset();
      state.map = next;
      state.master = null;
      syncLockBadge();
      propCtl.setMap({id: next.id, name: next.name, mine: next.mine, master: next.id === "master", canEdit: next.canEdit});
      refreshProposals();
      suppressSave = true;
      session.setUnlocked(false);
      session.load(next.data, {building: next.data.building});
      suppressSave = false;
      state.loading = false; // from here on the panels render as editable (or not) for the new map
      app.dataset.edit = String(canEdit());
      mapMenu.setCurrent({...next});
      mapMenu.setStatus(next.canEdit ? "saved" : "hidden");
      tabs.writeHash();
      banner.hide();
      syncReadOnlyBanner();
      if (next.canEdit && id === "master" && isAdmin && state.mode === "planning") toast("You're editing the master map. Every change saves a new master version.", {ms: 4000});
      if (next.canEdit) restoreDraft();
      if (state.mode === "current" || state.mode === "comparison") await enterMode(state.mode);
      else plan.setLayout(session.layout);
      if (R) { rebuild3D(); if (orbit) orbit.reset(false); if (walk) walk.reset(); }
      plan.fit(); fitScale = plan.V.s;
      if (state.mode === "advisor") advisorPanel.run();
      inspector.render(true); palette.render(); syncToolbar(); syncEmpty();
      announce(`Opened ${next.name}${next.canEdit ? "" : ", view only"}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) stageError("This map isn't available", "It was deleted, or it isn't shared with you any more.", false);
      else if (e instanceof ApiError && e.status === 503) stageError("The master map isn't set up yet", e.message, true);
      else stageError("This map didn't load", "Check the connection and try again. Nothing you saved is lost.", true);
      $("#mapErrorMaster").hidden = id === "master" && !(e instanceof ApiError && e.status === 503);
    } finally { state.loading = false; }
  }
  $("#mapErrorRetry").addEventListener("click", () => openMap(state.map.id, {reload: true}));
  $("#mapErrorMaster").addEventListener("click", () => openMap("master"));
  /** Unsaved edits kept on this device for this map: restored when they match the loaded version, offered otherwise. */
  function restoreDraft() {
    const d = loadDraft(storage, state.map.id);
    if (!d) return;
    const apply = () => { suppressSave = true; session.replace(d.data); suppressSave = false; autosave.change(); drafts.write(state.map.id, state.map.version, session.doc); banner.hide("draft"); };
    if (d.version === state.map.version) { apply(); toast("Restored unsaved edits from this device.", {icon: "i-check"}); }
    else banner.show("draft", "You have unsaved edits on this device from an older copy of this map.", [
      {label: "Use my edits", primary: true, onClick: apply},
      {label: "Discard", onClick: () => { drafts.clear(state.map.id); banner.hide("draft"); }},
    ]);
  }

  /* ================= selection in 3D, Go look ================= */
  const drawnHeight = it => (it.type === "wall" || it.type === "column" ? heightToCeiling(shownLayout(), it) : it.h || 0);
  // the selection's outline in the 3D view (from the raised floor it stands on, if any); blocks draw their own
  function outline3D() {
    if (!cursor) return;
    const it = state.view === "3d" && allows().select ? session.single : null;
    const show = it && it.type !== "area" ? it : null;
    cursor.select(show, show ? drawnHeight(show) : 0, show ? baseOf(session.layout, show) : 0);
  }
  // "Go look at it": a fixture, desk, door or column, never a wall or a ceiling (nowhere to stand in front of it)
  const canGoLook = it => !!(it && state.has3D && walk && it.type !== "wall" && it.type !== "ceiling" && it.type !== "area");
  function goLook(it) { if (!canGoLook(it)) return; if (dirty3D) rebuild3D(); if (walk.goLook(it)) setView("walk"); }
  function goWalk(x, y, item) {
    if (!walk) { toast("The walk needs 3D graphics, which this device doesn't have."); return; }
    if (dirty3D) rebuild3D();
    if (walk.goTo(x, y, item)) setView("walk");
  }

  /* ================= tools ================= */
  let toolBefore = null;
  function setTool(t) {
    if (t === state.tool) { hint(); return; }
    state.tool = t;
    app.dataset.tool = t;
    for (const [id, name] of [["toolSelect", "select"], ["toolPan", "pan"], ["toolMeasure", "measure"]]) $("#" + id).setAttribute("aria-pressed", String(t === name));
    if (t !== "measure") { measure.clear(); lastSnap = null; readout.hide(); if (cursor && !state.placing) cursor.hide(); }
    editor.cancelGesture();
    plan.draw();
    hint();
  }
  $("#toolSelect").addEventListener("click", () => setTool("select"));
  $("#toolPan").addEventListener("click", () => setTool("pan"));
  $("#toolMeasure").addEventListener("click", () => setTool(state.tool === "measure" ? "select" : "measure"));
  $("#toolSnap").addEventListener("click", () => layers.toggle("snap"));
  $("#btnLock").addEventListener("click", () => session.setUnlocked(!session.unlocked));
  $("#btnUndo").addEventListener("click", () => { const r = session.undo(); if (r) announce(`Undid ${r.label || "the last change"}`); });
  $("#btnRedo").addEventListener("click", () => { const r = session.redo(); if (r) announce(`Redid ${r.label || "the change"}`); });
  $("#btnDup").addEventListener("click", () => act.duplicate());
  $("#btnRot").addEventListener("click", () => act.rotate(90));
  $("#btnDel").addEventListener("click", () => act.remove());
  $("#btnReset").addEventListener("click", () => { if (orbit) orbit.reset(); });
  $("#btnTop").addEventListener("click", () => orbit && orbit.topView());
  $("#btnSpin").addEventListener("click", () => walk && walk.toggleSpin());
  $("#btnStart").addEventListener("click", () => { if (walk) { walk.reset(); hud.refresh(); } });
  function hint() {
    if (!state.has3D && !planView()) { readout.hint(""); return; }
    const m = state.tool === "measure", edit = canEdit();
    const modeHint = {
      blank: "Blank slate · click an item for its size · switch to Area planning to change the map",
      current: "Current layout: the master map as confirmed · hover an item for its name",
      comparison: "Tap a difference in the list, or click a changed item on the plan",
      advisor: "Show me highlights a recommendation · Apply makes the change on this map",
      review: "Open a proposal in the list to see its changes against the master",
    }[state.mode];
    readout.hint({
      plan: m ? "Click to set A, click again for B · Esc clears" : modeHint || (edit ? "Click an item · drag to move · Shift-click adds · Delete removes · Ctrl+Z undoes · tap a department in the list to place it" : "Click an item for details · N steps through the items · double-click the floor to walk there"),
      "3d": state.placing ? "Click the floor to place the block · Esc cancels" : m ? "Click to set A, click again for B · drag still turns the view · Esc clears" : modeHint || (edit ? "Drag to turn · right-drag to move · click a department block to select it, drag it along the floor" : "Drag to turn · right-drag to move · scroll to zoom · double-click to focus"),
      walk: "W A S D to walk · drag to look · double-click the floor to walk there",
    }[state.view]);
  }

  /* ================= placing a department in 3D ================= */
  function startPlacing(key) {
    if (!canEdit()) { toast("This map is view only."); return; }
    const cat = A.categoryFor(session.doc, key);
    if (!cat) return;
    const [w, d] = A.startSize(cat);
    state.placing = {key, w, d};
    $("#three").classList.add("placing");
    toast(`Placing ${cat.name}: click the floor where it should go. Esc cancels.`, {ms: 4000});
    hint();
  }
  function cancelPlacing() {
    if (!state.placing) return;
    state.placing = null;
    $("#three").classList.remove("placing");
    if (blocks3d) blocks3d.setGhost(null, new Map());
    if (cursor) cursor.hide();
    hint();
  }
  function ghostAt(snap) {
    const p = state.placing;
    return {id: "ghost", type: "area", cat: p.key, shape: "rect", x: snap.x, y: snap.y, w: p.w, d: p.d, h: A.BLOCK_HEIGHT, rot: 0};
  }

  /* ================= 3D pointer: status bar, Measure cursor, click to pick, drag a block, double-click to focus ================= */
  const visibleLayers = () => { const L3 = modeLayers(state.mode, layers.get(state.view === "walk" ? "walk" : "3d")); return {structure: L3.structure, fixtures: L3.fixtures, ceiling: L3.ceiling}; };
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
    const {L, W} = session.building;
    return Math.abs(p.x - L / 2) > L || Math.abs(p.y - W / 2) > W ? null : p;
  }
  function cursorAt(clientX, clientY) {
    const fl = pointerFloor(clientX, clientY);
    if (!fl) return null;
    const fpp = feetPerPixel(fl);
    return snapPoint(fl, session.snapTargets, {tol: clamp(12 * fpp, 0.2, 3), snap: layers.get().snap});
  }
  const floorZ = p => platformTopAt(shownLayout(), p.x, p.y); // the cursor sits on a raised floor's top
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
  /** What a click in 3D lands on: a department block (nearest), else an item from the picker. */
  function pick3D(clientX, clientY) {
    const hit = picker.pick(clientX, clientY, orbit.camera, visibleLayers());
    const ray = picker.ray(clientX, clientY, orbit.camera);
    const b = modeLayers(state.mode, layers.get("3d")).categories ? blocks3d.pick(ray.o, ray.d) : null;
    if (b && (!hit.item || b.t <= hit.t + 0.01)) return b.item;
    return hit.item;
  }
  function bindOrbitInput() {
    const el = R.renderer.domElement;
    const on = orbit.attach(el);
    let down = null, blockDrag = null;
    on(el, "pointerdown", e => {
      down = {x: e.clientX, y: e.clientY, button: e.button, t: performance.now()};
      if (e.button !== 0 || state.tool !== "select" || state.placing || !canEdit()) return;
      const item = pick3D(e.clientX, e.clientY);
      if (!item || item.type !== "area" || session.isLocked(item)) return;
      const fl = picker.floorAt(e.clientX, e.clientY, orbit.camera);
      if (!fl) return;
      if (!session.isSelected(item.id)) session.select(item.id);
      blockDrag = {id: item.id, ox: item.x - fl.x, oy: item.y - fl.y, moved: false};
      orbit.controls.enabled = false;
    });
    on(el, "pointermove", e => {
      if (blockDrag) {
        if (!blockDrag.moved && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) return;
        const fl = picker.floorAt(e.clientX, e.clientY, orbit.camera);
        if (!fl) return;
        const it = session.item(blockDrag.id); if (!it) { blockDrag = null; return; }
        if (!blockDrag.moved) { blockDrag.moved = true; session.begin("Move"); el.classList.add("moving"); }
        let x = fl.x + blockDrag.ox, y = fl.y + blockDrag.oy;
        if (layers.get().snap && !e.altKey) {
          const T = session.snapTargets, rect = {id: it.id, x, y, w: it.w, d: it.d, rot: it.rot || 0};
          const r = snapRect(rect, {faces: T.faces.filter(f => f.id !== it.id), corners: T.corners, walls: T.walls}, {grid: GRID, tol: clamp(10 * feetPerPixel(fl), 0.2, 2)});
          x = r.x; y = r.y;
        }
        session.apply(D.placeItems(session.doc, [{id: it.id, x, y}], session.editOpts));
        const moved = session.item(blockDrag.id);
        readout.pointer({x: moved.x, y: moved.y});
        return;
      }
      readout.pointer(pointerFloor(e.clientX, e.clientY));
      if (state.placing && !(down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4)) {
        const snap = cursorAt(e.clientX, e.clientY);
        if (snap) { blocks3d.setGhost(ghostAt(snap), catMap(session.categories)); cursor.update({cursor: snap, snap, z: 0}, clamp(orbit.camera.position.distanceTo(new R.THREE.Vector3(snap.x, 0, -snap.y)) / 45, 0.6, 4)); }
        return;
      }
      if (state.tool === "measure" && e.pointerType === "mouse" && !(down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4)) {
        const snap = cursorAt(e.clientX, e.clientY);
        measure.move(snap ? {x: snap.x, y: snap.y} : null);
        showCursor3D(snap);
      }
    });
    on(el, "pointerleave", e => { if (e.pointerType === "mouse") readout.pointer(null); });
    const endDrag = () => { if (blockDrag) { if (blockDrag.moved) session.end(); blockDrag = null; el.classList.remove("moving"); if (orbit.controls) orbit.controls.enabled = true; } };
    on(el, "pointercancel", () => { if (blockDrag && blockDrag.moved) session.cancel(); endDrag(); down = null; });
    on(el, "pointerup", e => {
      const d = down; down = null;
      const wasDrag = blockDrag && blockDrag.moved;
      endDrag();
      if (wasDrag) return;
      if (!d || d.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600) return;
      if (state.placing) {
        const snap = cursorAt(e.clientX, e.clientY);
        if (!snap) { toast("Click inside the building."); return; }
        const key = state.placing.key;
        cancelPlacing();
        placeDepartment(key, {x: snap.x, y: snap.y});
        return;
      }
      if (state.tool === "measure") {
        const snap = cursorAt(e.clientX, e.clientY);
        if (!snap) return;
        measure.click({x: snap.x, y: snap.y});
        showCursor3D(snap);
        return;
      }
      const item = pick3D(e.clientX, e.clientY);
      planClick(item, {toggle: e.shiftKey || state.multi});
    });
    on(el, "dblclick", e => {
      if (state.tool === "measure" || state.placing) return;
      const item = pick3D(e.clientX, e.clientY);
      if (item && item.type === "area" && allows().edit) { session.select(item.id); inspector.focusFirst(); return; }
      const hit = picker.pick(e.clientX, e.clientY, orbit.camera, visibleLayers());
      const p = hit.item ? {x: hit.item.x, y: hit.item.y} : hit.point ? {x: hit.point.x, y: hit.point.y} : null;
      if (p) orbit.focus(p);
    });
  }

  /* ================= switching displays and modes ================= */
  const tabs = initTabs({onSelect: v => setView(v), onMode: m => setMode(m), getMap: () => state.map.id});
  const toolbar = initToolbar($("#toolbar"));
  let shownView = null;
  function setView(v) {
    if (v === shownView) return; // already open: keep the camera, the measurement and the controls as they are
    const wasPlan = planView();
    shownView = v;
    state.view = v;
    app.dataset.view = v;
    tabs.set(v);
    $("#view3d").setAttribute("aria-labelledby", v === "walk" ? "tab-walk" : "tab-3d");
    toolbar.sync();
    layers.sync(v);
    layers.close(false); addMenu.close(false); closeMore();
    $("#view3d").hidden = planView();
    $("#viewPlan").hidden = !planView();
    $("#palette").classList.remove("open"); $("#deptBtn").setAttribute("aria-expanded", "false");
    readout.hide(); readout.pointer(null); lastSnap = null;
    cancelPlacing();
    if (v === "walk" && state.tool === "measure") setTool("select");
    if (v === "walk") session.clearSelection();
    if (!planView()) editor.setShapeEdit(false);
    measure.clear();
    syncEmpty();
    recheck();
    if (!state.has3D) {
      $("#noGl").hidden = planView();
      plan.setActive(planView());
      syncSide();
      hint(); applyLayers(null); inspector.render(); return;
    }
    if (planView()) {
      if (!wasPlan) { orbit.detach(); walk.detach(); cursor.hide(); cursor.select(null); }
      releaseGpuSoon();
      plan.setActive(true);
    } else {
      plan.setActive(false);
      keepGpu();
      if (dirty3D || built3D !== shownLayout()) rebuild3D();
      R.renderer.shadowMap.needsUpdate = true;
      R.setHaze(v === "walk");
      if (v === "3d") { walk.detach(); walk.show(false); bindOrbitInput(); outline3D(); }
      else { orbit.detach(); cursor.hide(); cursor.select(null); walk.attach(R.renderer.domElement); walk.show(true); hud.refresh(); }
      sizeChanged = true;
    }
    syncSide();
    hint();
    applyLayers(null);
    sync3DOverlays();
    inspector.render();
    if (session.selection.length && !phoneMq.matches) { /* the inspector stays open */ } else if (phoneMq.matches && !session.selection.length) inspector.setSheet("closed");
    R && R.requestRender();
  }
  /** Switches the view mode (OWNER RULES v3.1 rule 4). The display stays; the layout shown and what is allowed follow the mode. */
  function setMode(m) {
    if (!isMode(m) || m === state.mode) return;
    if (m === "review" && !isAdmin) return;
    const was = state.mode;
    editor.cancelGesture(); cancelPlacing(); editor.setShapeEdit(false);
    layers.close(false); addMenu.close(false); closeMore(); closePanelSheet();
    $("#palette").classList.remove("open"); $("#deptBtn").setAttribute("aria-expanded", "false");
    state.mode = m;
    app.dataset.mode = m;
    tabs.setMode(m);
    const a = allows();
    if (!a.select || was === "comparison" || was === "advisor" || was === "review") session.clearSelection();
    if (was === "advisor") { advisorPanel.clearShow(); if (overlays3d) { overlays3d.setOverlays(null, null, overlayColours()); overlays3d.setHighlight(null, overlayColours()); } }
    planOpts.editor = a.edit ? editor : null;
    app.dataset.edit = String(canEdit());
    $("#panelBtnLabel").textContent = m === "comparison" ? "Changes" : m === "review" ? "Review" : "Advisor";
    $("#panelBtn").setAttribute("aria-label", m === "comparison" ? "Changes: the comparison list" : m === "review" ? "Review: the proposals and the master's history" : "Advisor: scores and recommendations");
    $("#panelBtn").querySelector("use").setAttribute("href", "/assets/icons.svg#" + (m === "advisor" ? "i-info" : m === "comparison" ? "i-duplicate" : "i-review"));
    mapMenu.setStatus(state.map.canEdit ? autosave.status() : "hidden");
    syncReadOnlyBanner();
    toolbar.sync();
    enterMode(m).catch(e => { console.warn("mode", m, e && e.message); toast(e instanceof ApiError ? e.message : "Couldn't load that view."); });
    announce(`${MODE_INFO[m].label}. ${MODE_INFO[m].hint}`);
  }
  /** Loads what a mode needs (the master, the comparison's maps, the advisor's settings) and redraws. */
  async function enterMode(m) {
    if (m === "current") { await loadMaster(false); if (state.mode !== "current") return; }
    if (m === "comparison") { const b = compareWith || (state.map.id !== "master" ? state.map.id : "master"); compareWith = null; await comparePanel.open({a: "master", b}); if (state.mode !== "comparison") return; }
    if (m === "review") { await reviewPanel.open(); if (state.mode !== "review") return; }
    if (m === "advisor") { if (!advisorLoaded) { advisorLoaded = true; await advisorPanel.loadConfig(); } else advisorPanel.run(); if (state.mode !== "advisor") return; }
    plan.setLayout(shownLayout());
    syncSide();
    if (R) { if (planView()) dirty3D = true; else rebuild3D(); blocks3d.setSelected([]); }
    recheck();
    applyLayers(null);
    sync3DOverlays();
    hint();
    inspector.render(true); palette.render(); syncToolbar(); syncEmpty(); syncStatus(); syncMore();
    if (m === "comparison") onCompareChange("docs");
    plan.draw();
  }
  $("#noGlPlan").addEventListener("click", () => setView("plan"));
  $("#brandLink").addEventListener("click", e => { e.preventDefault(); setView("3d"); });
  window.addEventListener("hashchange", () => { const hs = parseHash(location.hash); if (hs.map && hs.map !== state.map.id) openMap(hs.map); });

  /* ================= phone: the More sheet ================= */
  const moreBtn = $("#moreBtn"), morePop = $("#morePop");
  function moreRow(label, ico, onclick, pressed) {
    return h("button", {type: "button", class: "layer-row", role: pressed === undefined ? "menuitem" : "switch", aria: pressed === undefined ? {} : {checked: pressed}, onclick: () => { onclick(); syncMore(); }},
      h("span", {class: "layer-key more-key"}, icon(ico, "i i-sm")), h("span", {class: "layer-text"}, h("b", {text: label})),
      pressed === undefined ? icon("i-chevron-right", "i eye") : h("span", {class: "sw-track", aria: {hidden: true}}, h("span", {class: "sw-knob"})));
  }
  function renderMore() {
    morePop.textContent = "";
    morePop.appendChild(h("p", {class: "pop-title", text: "More"}));
    const edit = canEdit() && planView();
    if (edit) morePop.appendChild(moreRow(session.unlocked ? "Structure unlocked" : "Structure locked", session.unlocked ? "i-unlock" : "i-lock", () => session.setUnlocked(!session.unlocked), session.unlocked));
    if (state.view !== "walk" && canEdit()) morePop.appendChild(moreRow("Snap", "i-snap", () => layers.toggle("snap"), layers.get().snap));
    if ((edit || state.view === "3d") && allows().select) morePop.appendChild(moreRow("Select several", "i-select", () => { state.multi = !state.multi; }, state.multi));
    if (planView() && allows().select) morePop.appendChild(moreRow("Dimensions", "i-measure", () => layers.toggle("dimensions"), layers.get().dimensions));
    if (edit) { morePop.appendChild(moreRow("Duplicate", "i-duplicate", () => { closeMore(); act.duplicate(); })); morePop.appendChild(moreRow("Rotate 90°", "i-rotate", () => { closeMore(); act.rotate(90); })); morePop.appendChild(moreRow("Delete", "i-delete", () => { closeMore(); act.remove(); })); }
    if (state.mode === "planning" && state.map.canEdit && !planView()) morePop.appendChild(moreRow("Departments", "i-blocks", () => { closeMore(); addMenu.open("departments"); }));
    morePop.appendChild(moreRow("Layers", "i-layers", () => { closeMore(); layers.open(); }));
    if (planView()) morePop.appendChild(moreRow("Fit the store", "i-fit", () => { closeMore(); fitPlan(); }));
    if (state.view === "3d") morePop.appendChild(moreRow("Reset the view", "i-fit", () => { closeMore(); orbit && orbit.reset(); }));
    morePop.appendChild(moreRow("Controls and help", "i-help", () => { closeMore(); help.open(moreBtn); }));
  }
  const moreOpen = () => !morePop.hidden;
  function openMore() { renderMore(); morePop.hidden = false; moreBtn.setAttribute("aria-expanded", "true"); const f = morePop.querySelector("button"); if (f) f.focus(); }
  function closeMore() { if (!moreOpen()) return; morePop.hidden = true; moreBtn.setAttribute("aria-expanded", "false"); }
  function syncMore() { if (moreOpen()) { const i = [...morePop.querySelectorAll("button")].indexOf(document.activeElement); renderMore(); const b = morePop.querySelectorAll("button")[i]; if (b) b.focus(); } }
  moreBtn.addEventListener("click", () => (moreOpen() ? closeMore() : openMore()));
  morePop.addEventListener("keydown", e => { if (e.key === "Escape") { closeMore(); moreBtn.focus(); } e.stopPropagation(); });
  document.addEventListener("pointerdown", e => { if (moreOpen() && !morePop.contains(e.target) && !moreBtn.contains(e.target)) closeMore(); }, true);

  /* ================= keyboard ================= */
  let pointerFocus = false, spacePan = false;
  window.addEventListener("pointerdown", () => { pointerFocus = true; }, true);
  window.addEventListener("keyup", e => { if (e.code === "Space" && spacePan) { spacePan = false; setTool(toolBefore || "select"); toolBefore = null; } });
  window.addEventListener("keydown", e => {
    if (e.key === "Tab") pointerFocus = false;
    if (help.isOpen) return;
    const t = e.target, onControl = t && t !== document.body && /^(BUTTON|INPUT|SELECT|TEXTAREA|A|SUMMARY)$/.test(t.tagName);
    if (onControl && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      if (e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); if (canUndo()) { const r = session.undo(); if (r) announce(`Undid ${r.label || "the last change"}`); } return; }
      if ((e.code === "KeyZ" && e.shiftKey) || e.code === "KeyY") { e.preventDefault(); if (canUndo()) { const r = session.redo(); if (r) announce(`Redid ${r.label || "the change"}`); } return; }
      if (e.code === "KeyD") { e.preventDefault(); act.duplicate(); return; }
      return;
    }
    if (e.altKey) return;
    if (e.key === "?") { e.preventDefault(); help.open(); return; }
    const modeKeys = {Digit1: "blank", Digit2: "current", Digit3: "planning", Digit4: "comparison", Digit5: "advisor", Digit6: "review"};
    const viewKeys = {Digit1: "plan", Digit2: "3d", Digit3: "walk"};
    if (e.shiftKey && viewKeys[e.code]) { setView(viewKeys[e.code]); return; }
    if (modeKeys[e.code] && !e.shiftKey) { setMode(modeKeys[e.code]); return; }
    if (e.code === "Escape") {
      if (state.placing) { cancelPlacing(); return; }
      if (editor.dragging) { editor.cancelGesture(); return; }
      if (state.tool === "measure" && (measure.state.a || measure.state.cursor)) { measure.clear(); readout.hide(); if (cursor) cursor.update({}); plan.draw(); return; }
      if (state.tool !== "select") { setTool("select"); return; }
      if (editor.shapeEdit) { editor.setShapeEdit(false); inspector.render(true); return; }
      if (state.mode === "advisor" && advisorPanel.shown) { advisorPanel.clearShow(); plan.draw(); sync3DOverlays(); return; }
      if (state.mode === "comparison" && comparePanel.state.selected) { comparePanel.select(comparePanel.state.selected); return; }
      if (state.mode === "review" && reviewPanel && reviewPanel.state.selected) { reviewPanel.select(reviewPanel.state.selected); return; }
      if ($("#panelBtn").getAttribute("aria-expanded") === "true") { closePanelSheet(); return; }
      session.clearSelection(); return;
    }
    if (state.view === "walk") { if (walk) walk.keydown(e, onControl, pointerFocus); return; }
    const hasSel = session.selection.length > 0;
    if (e.code === "KeyM") { setTool(state.tool === "measure" ? "select" : "measure"); return; }
    if (e.code === "KeyV") { setTool("select"); return; }
    if (e.code === "KeyH" && planView()) { setTool("pan"); return; }
    if (e.code === "KeyS" && !e.shiftKey) { layers.toggle("snap"); return; }
    if (e.code === "KeyL" && !e.shiftKey) { layers.toggle("labels"); return; }
    if (e.code === "KeyG" && !e.shiftKey) { layers.toggle("grid"); return; }
    if (e.code === "Space" && planView() && !onControl) { e.preventDefault(); if (!spacePan && state.tool !== "pan") { spacePan = true; toolBefore = state.tool; setTool("pan"); } return; }
    if (hasSel && canEdit()) {
      if (e.code === "Delete" || e.code === "Backspace") { if (!onControl) { e.preventDefault(); if (editor.shapeEdit && editor.cornerSel >= 0) { editor.removeCorner(); inspector.render(true); } else act.remove(); } return; }
      if (e.code === "KeyR") { act.rotate(e.shiftKey ? -90 : 90); return; }
      const step = e.shiftKey ? 5 : 0.5;
      const nd = {ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0]}[e.code];
      if (nd && !onControl) { e.preventDefault(); editor.nudge(nd[0], nd[1]); return; }
    }
    if (e.code === "Enter" && hasSel && (t === $("#three") || t === $("#planCanvas"))) { e.preventDefault(); inspector.focusFirst(); return; }
    if (e.code === "Digit0" && hasSel && planView()) { act.fit(session.selected()); return; }
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

  /* ================= size and theme ================= */
  let sizeChanged = true;
  const ro = new ResizeObserver(entries => {
    for (const en of entries) {
      if (en.target === $("#planCanvas")) { if (planView()) plan.resize(); }
      else if (en.target === $("#planCanvasA")) { if (planA.active) planA.resize(); }
      else if (en.target === $("#mini")) { if (hud) hud.refresh(); }
      else sizeChanged = true;
    }
  });
  ro.observe($("#planCanvas")); ro.observe($("#planCanvasA")); ro.observe($("#mini")); ro.observe($("#three"));
  onThemeChange(() => { plan.retheme(); planA.retheme(); if (hud) hud.refresh(); if (R) { R.setSky(isDark()); blocks3d.update(shownLayout(), catMap(shownCats()), isDark()); sync3DIssues(); sync3DOverlays(); } if (scan) scan.retheme(); palette.render(); });
  if (document.fonts && document.fonts.load) {
    Promise.all(["600 12px 'Barlow Condensed'", "700 15px 'Barlow Condensed'", "500 11px 'IBM Plex Sans'", "600 11px 'IBM Plex Sans'"].map(f => document.fonts.load(f)))
      .then(() => { plan.retheme(); planA.retheme(); if (hud) hud.refresh(); }, () => {});
  }
  phoneMq.addEventListener("change", () => { inspector.render(true); palette.render(); comparePanel.render(); advisorPanel.render(); if (reviewPanel) reviewPanel.render(); });

  /* ================= the frame loop: draws only when something changed ================= */
  let lastT = performance.now(), firstOrbit = true;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (!R || planView()) return;
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
      if (R.render(walk.camera)) blocks3d.updateLabels(walk.camera, R.w, R.h);
      hud.frame(now);
    } else {
      orbit.update(now);
      if (R.render(orbit.camera)) {
        labels3d.update(orbit.camera, R.w, R.h);
        blocks3d.updateLabels(orbit.camera, R.w, R.h);
        const az = Math.atan2(orbit.camera.position.x - orbit.controls.target.x, orbit.camera.position.z - orbit.controls.target.z);
        $("#north3d").style.setProperty("--rot", deg(az).toFixed(1));
        placeReadout3D();
      }
    }
  }

  /* ================= go ================= */
  (async () => {
    const hs = parseHash(location.hash);
    app.dataset.mode = state.mode;
    tabs.setMode(state.mode);
    planOpts.editor = allows().edit ? editor : null;
    $("#panelBtnLabel").textContent = state.mode === "comparison" ? "Changes" : state.mode === "review" ? "Review" : "Advisor";
    if (isAdmin) loadAdminSettings();
    await openMap(isMapId(hs.map) ? hs.map : "master");
    if (webglAvailable() && session.layout.items.length) {
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
    syncLock(); syncToolbar();
    app.dataset.tool = state.tool;
    setView(state.view);
    if (state.mode !== "planning") enterMode(state.mode).catch(() => {});
    requestAnimationFrame(tick);
    mapMenu.refresh();
    // A handle for automated browser checks only (navigator.webdriver is true under Playwright / WebDriver); real
    // visitors never get a global.
    if (navigator.webdriver === true) {
      Object.defineProperty(window, "__fbsMap", {value: Object.freeze({state, session, get layout() { return session.layout; }, get frames() { return R ? R.frames : 0; }, get orbit() { return orbit; }, get walk() { return walk; },
        get scan() { return scan; }, get R() { return R; }, plan, planA, editor, layers, measure, autosave, setView, setMode, openMap, placeDepartment, startPlacing, act,
        get compare() { return comparePanel; }, get advisor() { return advisorPanel; }, get review() { return reviewPanel; }, get proposals() { return propCtl; }, get issues() { return state.issues; }, get shownLayout() { return shownLayout(); },
        snapPoint: p => snapPoint(p, session.snapTargets, {tol: 0.75}),
        pick: (cx, cy, opts) => (picker ? picker.pick(cx, cy, orbit.camera, opts) : null)})});
    }
  })();
}
