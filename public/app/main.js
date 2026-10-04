// Store Planner: wires the 3D scene, Jerry, the advisor, editing and the HUD together.
import { api, ApiError } from "./api.js";
import { createState } from "./state.js";
import { createScene } from "./scene3d.js";
import { NavGrid } from "./nav.js";
import { analyzeBuild, analyzeArea, suggestions, prepCatalog, anchorPoints, nice } from "./analysis.js";
import { diffAreas, diffItems, matchScore } from "./compare.js";
import { createEditor, areaFromCatalog, FIXTURE_TEMPLATES, STRUCTURE_TEMPLATES } from "./edit.js";
import { attachInput } from "./input.js";
import { createJoystick } from "./joystick.js";
import { createHud } from "./hud.js";
import { createPanels } from "./panels.js";
import { createInspector } from "./inspector.js";
import { drawPlan, shortName } from "./plan2d.js";
import { pointRectDist } from "./geometry.js";
import { $ } from "./h.js";

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("fbs:" + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("fbs:" + k, JSON.stringify(v));
    } catch {
      /* private mode: fine */
    }
  },
};

const app = {
  api,
  canvas: $("#view"),
  ui: {
    mode: store.get("mode", "areas"),
    selection: null,
    carry: null,
    handle: null,
    structureUnlocked: false,
    layers: { areas: true, fixtures: true, structure: true, labels: true, clearances: true, ...store.get("layers", {}) },
    lowGfx: store.get("lowGfx", false),
    compareTarget: "suggested",
    tipIndex: 0,
    lastActivity: performance.now(),
    dismissedTip: null,
    focusKey: null,
  },
  report: null,
  tips: [],
  store,
};

let scene, state, editor, input, hud, panels, inspector, nav, joystick;
let navSig = "";
const compareCache = new Map();

// ---------- boot ----------

async function boot() {
  hudLoading("Loading the store…");
  let boot;
  try {
    boot = await api.get("/api/bootstrap");
  } catch (e) {
    if (e.status !== 401) hudLoading(e.message || "Couldn't load. Refresh to try again.");
    return;
  }
  app.user = boot.user;
  app.catalog = prepCatalog(boot.catalog);
  app.current = boot.current || { items: [], version: "" };
  app.suggested = boot.suggested || { areas: [] };
  app.builds = boot.builds || [];
  app.shared = boot.shared || [];
  app.suggestedBlocks = (app.suggested.areas || [])
    .filter((a) => app.catalog.byKey[a.key])
    .map((a) => ({ ...areaFromCatalog(app.catalog.byKey[a.key], a.x, a.y, a.w, a.d, a.rot || 0, a.groups), id: "s_" + a.key, why: a.why || "" }));
  app.suggestedReport = analyzeBuild({ items: app.current.items, areas: app.suggestedBlocks }, app.catalog);

  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 64px "Barlow Condensed"'), document.fonts.load('600 38px "IBM Plex Sans"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fonts are optional */
  }

  state = createState(api);
  app.state = state;
  scene = createScene(app.canvas);
  app.scene = scene;
  scene.setQuality(app.ui.lowGfx);
  editor = createEditor(app);
  app.editor = editor;
  hud = createHud(app);
  app.hud = hud;
  panels = createPanels(app);
  app.panels = panels;
  inspector = createInspector(app);
  app.inspector = inspector;
  input = attachInput(app);
  app.input = input;
  joystick = createJoystick($("#stick"), $("#knob"));

  const dark = matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = () => {
    const t = document.documentElement.dataset.theme;
    const isDark = t ? t === "dark" : dark.matches;
    scene.setTheme(isDark);
    app.planTheme = isDark ? "dark" : "light";
  };
  applyTheme();
  dark.addEventListener("change", applyTheme);

  state.on("change", onChange);
  state.on("status", (s) => hud.updateSave(s));
  state.on("history", () => hud.updateHistory());
  state.on("load", (b) => hud.updateBuild(b));
  state.on("saved", ({ statusChanged }) => {
    if (statusChanged && state.build.status === "draft") hud.toast("Changes saved. This build is a draft again, so submit it when you're ready.");
  });
  state.on("conflict", () => hud.openConflict());
  state.on("gone", () => hud.toast("This build no longer exists. Open another from My builds.", "warn"));
  state.on("save-error", (e) => hud.updateSave(e.status === 0 ? "offline" : "error"));

  window.addEventListener("resize", onResize);
  onResize();
  // working anywhere (panels included) counts as activity, so Jerry doesn't interrupt
  document.addEventListener("pointerdown", (e) => !e.target.closest("#thought") && app.noteActivity(), true);
  document.addEventListener("keydown", () => app.noteActivity(), true);

  const urlBuild = new URLSearchParams(location.search).get("build");
  let opened = false;
  if (urlBuild) {
    opened = await openBuild(urlBuild);
    history.replaceState(null, "", location.pathname);
  }
  if (!opened) {
    const pick = pickStartBuild();
    if (pick) opened = await openBuild(pick, { silent: true });
  }
  if (!opened) await createFirstBuild();

  scene.setCameraMode(store.get("cam", "jerry"));
  hud.setCamera(scene.camMode);
  scene.fitMap();
  setMode(app.ui.mode, { initial: true });
  scene.warmup();
  placeJerryStart();
  hudLoading(null);
  requestAnimationFrame(loop);

  window.addEventListener("beforeunload", (e) => {
    if (["dirty", "saving", "error", "offline"].includes(state.status)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") state.flush({ keepalive: true });
  });

  if (!store.get("introSeen", false)) {
    store.set("introSeen", true);
    setTimeout(() => hud.showIntro(), 600);
  }
}

function hudLoading(text) {
  const el = $("#loading");
  if (!el) return;
  if (text === null) el.hidden = true;
  else {
    el.hidden = false;
    $("#loading-text").textContent = text;
  }
}

function pickStartBuild() {
  const last = store.get("lastBuild", null);
  if (last && app.builds.some((b) => b.id === last)) return last;
  if (app.builds.length) return app.builds[0].id;
  return null;
}

async function createFirstBuild() {
  const r = await api.post("/api/builds", { name: `${app.user.firstName}'s store plan` });
  app.builds = [summaryOf(r.build), ...app.builds];
  state.load(r.build);
  store.set("lastBuild", r.build.id);
}

function summaryOf(b) {
  const { data, ...rest } = b;
  return rest;
}

app.openBuild = openBuild;
async function openBuild(id, opts = {}) {
  if (state.build && state.build.id === id && !opts.reload) return true;
  try {
    if (state.build) await state.flush();
    const r = await api.get(`/api/builds/${encodeURIComponent(id)}`);
    if (app.ui.carry) editor.cancelCarry();
    app.ui.selection = null;
    state.load(r.build);
    if (r.build.canEdit) store.set("lastBuild", id);
    if (!opts.silent) hud.toast(r.build.canEdit ? `Opened ${r.build.name}` : `Viewing ${r.build.ownerName || "a teammate"}'s build (read only)`);
    return true;
  } catch (e) {
    hud.toast(e.status === 404 ? "That build isn't available to you." : e.message, "warn");
    return false;
  }
}

app.refreshBuildLists = async function () {
  const r = await api.get("/api/builds");
  app.builds = r.builds || [];
  app.shared = r.shared || [];
  return r;
};

// ---------- change handling ----------

function onChange(ev) {
  app.report = analyzeBuild(state.data, app.catalog);
  if (ev && ev.load) {
    compareCache.clear();
    if (app.ui.mode === "compare") prepareCompare();
  }
  syncScene();
  panels.render();
  inspector.render();
  hud.updateHistory();
  hud.updateProgress(app.report.progress);
  if (ev && ev.history) hud.toast(ev.label);
  scheduleTips();
}

let tipTimer = 0;
function scheduleTips() {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(refreshTips, 180);
}

function refreshTips() {
  if (!state.data) return;
  if (app.ui.mode === "suggested") {
    app.tips = [
      {
        id: "sug:intro",
        tone: "info",
        title: app.suggested.title || "My suggested plan",
        text: app.suggested.summary || "Tap a block to see why I put it there.",
        action: { type: "copy-all" },
        cta: "Copy it into my build",
      },
    ];
  } else {
    app.tips = suggestions(app.report, state.data, app.catalog, app.suggested, {
      limit: 3,
      buildStatus: state.build.status,
      focusKey: app.ui.focusKey,
      focusAreaId: app.ui.selection && app.ui.selection.kind === "area" ? app.ui.selection.id : null,
    });
    if (!state.build.canEdit) {
      const reviewing = app.user && app.user.role === "admin";
      app.tips = [{ id: "readonly", tone: "info", title: `${state.build.ownerName || "A teammate"}'s build`, text: reviewing ? "You're reviewing this build. Look around and compare it with yours; review notes and sharing live in your dashboard." : "You're viewing this build because AJ shared it with you. You can look around and compare, but not change it.", action: null, cta: null }];
    }
    if (!(app.current.items || []).length) app.tips = [{ id: "no-layout", tone: "warn", title: "The store layout isn't loaded", text: "This server has no store geometry yet, so nothing can be placed or walked. AJ: load the seed folder (node scripts/pull-seed.mjs, then npm run db:seed) and refresh.", action: null, cta: null }];
  }
  hud.updateTips(app.tips);
}

function sceneLayout() {
  if (app.ui.mode === "suggested") return { items: app.current.items || [], areas: app.suggestedBlocks, report: app.suggestedReport };
  return { items: state.data.items, areas: state.data.areas, report: app.report };
}

function areaInfoFn(report) {
  return (a) => {
    const r = report.results.get(a.id);
    const c = app.catalog.byKey[a.key] || {};
    const sqft = Math.round(a.w * a.d).toLocaleString("en-US");
    const st = r ? (r.collisions.length ? "issues" : a.status === "confirmed" ? "confirmed" : r.warnings.length ? "warn" : "ok") : "ok";
    const sub = st === "issues" ? `${sqft} sq ft · ${r.collisions.length} conflict${r.collisions.length > 1 ? "s" : ""}` : st === "confirmed" ? `${sqft} sq ft · confirmed` : `${sqft} sq ft`;
    return { color: a.color || c.color || "#888888", name: shortName(a, c.name), sub, state: st };
  };
}

function syncScene() {
  const { items, areas, report } = sceneLayout();
  scene.setLayout(items, areas, { mode: app.ui.mode, layers: app.ui.layers, areaInfo: areaInfoFn(report) });
  scene.setClearances(app.ui.mode === "areas" && app.ui.layers.clearances ? report.ctx.clear.map((c) => c.it) : null);
  updateLinks();
  if (app.ui.mode === "compare") drawCompare();
  else scene.setGhosts(null);
  const sig = JSON.stringify(items.map((i) => [i.id, i.x, i.y, i.w, i.d, i.rot, i.type]));
  if (sig !== navSig) {
    navSig = sig;
    nav = new NavGrid(items);
    app.nav = nav;
  }
}

app.rebuildNav = function (skipId) {
  const { items } = sceneLayout();
  nav = new NavGrid(items, { skip: skipId || null });
  app.nav = nav;
  navSig = skipId ? "" : JSON.stringify(items.map((i) => [i.id, i.x, i.y, i.w, i.d, i.rot, i.type]));
};

/** Dashed lines from the selected block to its neighbors and its entry point. */
function updateLinks() {
  const sel = app.ui.selection;
  if (!sel || sel.kind !== "area" || (app.ui.mode !== "areas" && app.ui.mode !== "suggested")) {
    scene.setLinks(null, null);
    return;
  }
  const { areas, report } = sceneLayout();
  const a = areas.find((x) => x.id === sel.id);
  const r = a && report.results.get(a.id);
  if (!r) {
    scene.setLinks(null, null);
    return;
  }
  const links = [];
  for (const adj of r.adjacency) {
    if (!adj.placed) continue;
    const o = areas.find((x) => x.id === adj.otherId);
    if (!o) continue;
    links.push({ from: [a.x, a.y], to: [o.x, o.y], ok: adj.ok, label: `${shortName(o, (app.catalog.byKey[o.key] || {}).name)} · ${Math.round(adj.dist)} ft${adj.primary ? " ★" : ""}` });
  }
  const anchor = app.catalog.entryAnchors[r.entry.key];
  const anchors = anchorPoints(anchor, report.ctx).map(([x, y]) => ({ x, y, ok: r.entry.ok, label: String(anchor.label || "").split(" (")[0] }));
  scene.setLinks(links, anchors);
}

// ---------- compare ----------

app.setCompareTarget = async function (target) {
  app.ui.compareTarget = target;
  await prepareCompare();
  syncScene();
  panels.render();
};

async function prepareCompare() {
  const t = app.ui.compareTarget;
  if (t === "suggested" || t === "current" || compareCache.has(t)) return;
  try {
    const r = await api.get(`/api/builds/${encodeURIComponent(t)}`);
    compareCache.set(t, r.build);
  } catch (e) {
    hud.toast(e.message, "warn");
    app.ui.compareTarget = "suggested";
  }
}

app.compareData = function () {
  const t = app.ui.compareTarget;
  let base, label;
  if (t === "suggested") {
    base = { items: app.current.items || [], areas: app.suggestedBlocks };
    label = "Suggested";
  } else if (t === "current") {
    base = { items: app.current.items || [], areas: [] };
    label = "Store today";
  } else {
    const b = compareCache.get(t);
    if (!b) return null;
    base = { items: b.data.items || [], areas: b.data.areas || [] };
    label = b.canEdit ? b.name : `${b.ownerName}'s`;
  }
  const order = app.catalog.areas.map((a) => a.key);
  const areas = diffAreas(base.areas, state.data.areas, order);
  const items = diffItems(base.items, state.data.items);
  return { label, base, areas, items, score: base.areas.length ? matchScore(areas) : null };
};

function drawCompare() {
  const cd = app.compareData();
  if (!cd) {
    scene.setGhosts(null);
    return;
  }
  const ghosts = [];
  for (const row of cd.areas) {
    const color = (app.catalog.byKey[row.key] || {}).color || "#888888";
    for (const b of row.base) ghosts.push({ rect: b, color, label: row.base.length && b === row.base[0] && row.change !== "same" ? cd.label : null });
    if (row.change === "changed" && row.dist > 1) ghosts.push({ from: row.from, to: row.to, color });
  }
  for (const m of cd.items.moved) ghosts.push({ box: { ...m.from, h: Math.min(m.from.h || 3, 8) }, color: "#8a9199", from: [m.from.x, m.from.y], to: [m.to.x, m.to.y] });
  for (const r of cd.items.removed) if (r.type !== "floor" && r.type !== "zone") ghosts.push({ box: { ...r, h: Math.min(r.h || 3, 8) }, color: "#e5484d" });
  for (const a of cd.items.added) ghosts.push({ box: { ...a, w: a.w + 0.4, d: a.d + 0.4, h: Math.min((a.h || 3) + 0.3, 8.3) }, color: "#2fbf71" });
  scene.setGhosts(ghosts);
}

// ---------- selection, modes, camera ----------

app.select = function (sel, opts = {}) {
  if (app.ui.carry && !opts.keepCarry) editor.dropCarry();
  app.ui.selection = sel;
  app.ui.focusKey = null;
  const canEdit = sel && state.build.canEdit && ((sel.kind === "area" && app.ui.mode === "areas") || (sel.kind === "item" && app.ui.mode === "current"));
  scene.setSelected(sel, canEdit && sel && editor.canMove(sel.kind, editor.objOf(sel.kind, sel.id)).ok);
  updateLinks();
  inspector.render();
  panels.highlight(sel);
  if (sel && sel.kind === "area") scheduleTips();
};

app.setMode = setMode;
function setMode(m, opts = {}) {
  if (!["current", "areas", "compare", "suggested"].includes(m)) m = "areas";
  if (app.ui.carry) editor.dropCarry();
  if (!opts.initial && app.ui.mode === m) return;
  app.ui.mode = m;
  store.set("mode", m);
  app.ui.selection = null;
  scene.setSelected(null, false);
  hud.setMode(m);
  const after = () => {
    syncScene();
    panels.render();
    inspector.render();
    refreshTips();
  };
  if (m === "compare") prepareCompare().then(after);
  else after();
}

app.toggleCamera = function () {
  const next = scene.camMode === "map" ? "jerry" : "map";
  scene.setCameraMode(next);
  store.set("cam", next);
  hud.setCamera(next);
  if (next === "map") scene.fitMap();
};

app.focusSelection = function () {
  const sel = app.ui.selection;
  if (!sel) return;
  const o = sel.kind === "area" ? sceneLayout().areas.find((a) => a.id === sel.id) : sceneLayout().items.find((i) => i.id === sel.id);
  if (o) app.focusOn(o.x, o.y);
};

/** "Show me": the map pans there; in Jerry cam, Jerry walks over. */
app.focusOn = function (x, y) {
  if (scene.camMode === "map") scene.focus(x, y);
  else app.walkTo(x, y);
};

app.walkTo = function (x, y, opts = {}) {
  if (!nav) return false;
  const js = scene.jerry.state;
  const path = nav.path(js.x, js.y, x, y);
  if (!path) {
    if (!opts.quiet) hud.toast("Jerry can't get there from here.", "warn");
    return false;
  }
  scene.jerry.walk(path, opts.onArrive);
  return true;
};

function placeJerryStart() {
  const p = nav ? nav.nearestFree(86, 45.5, 10) : [86, 45.5];
  if (p) scene.jerry.setPose(p[0], p[1], Math.PI / 2);
}

app.noteActivity = function () {
  app.ui.lastActivity = performance.now();
  hud.hideThought();
};

app.toast = (msg, kind) => hud.toast(msg, kind);

app.undo = function () {
  if (app.ui.carry) editor.cancelCarry();
  if (!state.undo()) hud.toast("Nothing to undo.");
};
app.redo = function () {
  if (!state.redo()) hud.toast("Nothing to redo.");
};

app.grabOrDrop = function () {
  if (app.ui.carry) {
    editor.dropCarry();
    return;
  }
  const js = scene.jerry.state;
  const { areas, items } = sceneLayout();
  let best = null, bd = 3.5;
  if (app.ui.mode === "areas") {
    for (const a of areas) {
      const d = pointRectDist(a, js.x, js.y);
      if (d < bd) {
        bd = d;
        best = { kind: "area", id: a.id };
      }
    }
  } else if (app.ui.mode === "current") {
    for (const it of items) {
      if (it.type === "floor" || it.type === "zone") continue;
      const d = pointRectDist(it, js.x, js.y);
      if (d < bd && editor.canMove("item", it).ok) {
        bd = d;
        best = { kind: "item", id: it.id };
      }
    }
  } else {
    hud.toast("Switch to Current layout or Area planning to move things.", "warn");
    return;
  }
  if (!best) {
    hud.toast(app.ui.mode === "areas" ? "Walk Jerry onto a department block, then press E to grab it." : "Walk Jerry up to a fixture, then press E to grab it.");
    return;
  }
  if (editor.startCarry(best, null, "jerry")) hud.toast("Got it. Walk to move it, R to rotate, E to drop.");
};

app.rotateCarried = function (deg) {
  const c = app.ui.carry;
  if (!c) return;
  const o = editor.objOf(c.kind, c.id);
  if (!o) return;
  state.live(() => {
    o.rot = Math.round(((((o.rot || 0) + deg) % 360) + 360) % 360);
  });
  scene.moveObject(c.kind, o);
  app.onLiveMove(c.kind, o);
};

let liveAt = 0;
app.onLiveMove = function (kind, o) {
  const now = performance.now();
  if (now - liveAt < 70) return;
  liveAt = now;
  if (kind === "area") {
    const r = analyzeArea(o, app.report.ctx, state.data.areas, app.catalog);
    const sq = `${Math.round(o.w * o.d).toLocaleString("en-US")} sq ft`;
    hud.liveStatus(`${r.name} · ${sq}`, r.collisions.length ? r.collisions[0].label : r.warnings.length ? r.warnings[0].label : "Clear spot", r.collisions.length ? "bad" : r.warnings.length ? "warn" : "ok");
  } else {
    hud.liveStatus(nice(o.name) || o.type, `${Math.round(o.x * 10) / 10}, ${Math.round(o.y * 10) / 10} ft · ${Math.round(o.rot || 0)}°`, "ok");
  }
};

/** Game feedback after a block lands. */
app.afterPlace = function (kind, o, opts = {}) {
  if (kind !== "area") return;
  const r = app.report.results.get(o.id);
  if (!r) return;
  const p = app.report.progress;
  if (r.collisions.length) hud.toast(`${r.name}: ${r.collisions[0].label.toLowerCase()}.`, "warn");
  else {
    hud.toast(`${opts.placed ? "Placed" : "Moved"} ${r.name} · ${p.placed}/${p.total} set`, "ok");
    if (opts.placed || r.state === "ok") scene.jerry.wave();
    if (p.complete && opts.placed) setTimeout(() => hud.celebrate(), 400);
  }
};

// ---------- palette drag-and-drop ----------

app.paletteGhost = function (spec, pt) {
  if (!spec || !pt) {
    scene.setPaletteGhost(null);
    return;
  }
  if (spec.kind === "area") {
    const c = app.catalog.byKey[spec.key];
    scene.setPaletteGhost({ x: pt[0], y: pt[1], w: c.size[0], d: c.size[1], rot: 0 }, c.color);
  } else {
    scene.setPaletteGhost({ x: pt[0], y: pt[1], w: spec.tpl.w, d: spec.tpl.d, rot: 0 }, "#f2c14e");
  }
};

app.paletteDrop = function (spec, pt) {
  if (spec.kind === "area") {
    if (app.ui.mode !== "areas") setMode("areas");
    const existing = state.data.areas.find((a) => a.key === spec.key);
    if (existing) {
      // already placed: move the existing block instead of making a second one
      const ok = state.change(`Move ${existing.name}`, () => {
        existing.x = Math.round(pt[0] * 2) / 2;
        existing.y = Math.round(pt[1] * 2) / 2;
      });
      if (ok) {
        app.select({ kind: "area", id: existing.id });
        app.afterPlace("area", existing);
      }
      return;
    }
    editor.placeArea(spec.key, pt[0], pt[1]);
  } else {
    if (app.ui.mode !== "current") setMode("current");
    editor.addItem(spec.tpl, pt[0], pt[1]);
  }
};

app.dropAtJerry = function (spec) {
  const js = scene.jerry.state;
  app.paletteDrop(spec, [js.x, js.y]);
};

app.templates = { fixtures: FIXTURE_TEMPLATES, structure: STRUCTURE_TEMPLATES };

// ---------- Jerry's tips ----------

app.askJerry = function (opts = {}) {
  app.ui.focusKey = opts.focusKey || null;
  refreshTips();
  app.ui.tipIndex = 0;
  hud.openBubble(0);
};

app.applyTip = async function (tip) {
  if (!tip) return;
  let a = tip.action;
  if (!a && tip.pending) {
    const resolved = suggestions(app.report, state.data, app.catalog, app.suggested, { resolveId: tip.id, buildStatus: state.build.status }).find((s) => s.id === tip.id);
    a = resolved && resolved.action;
  }
  if (!a) return;
  if (a.type === "submit") return hud.openSubmit();
  if (a.type === "copy-all") return app.copySuggestedAll();
  if (!state.build.canEdit) return hud.toast("This build is read-only.", "warn");
  if (app.ui.mode !== "areas") setMode("areas");
  const area = a.areaId ? state.data.areas.find((x) => x.id === a.areaId) : null;
  if (a.type === "place") {
    const b = editor.placeArea(a.key, a.x, a.y, { w: a.w, d: a.d, rot: a.rot, groups: a.groups, snap: false });
    if (b) app.focusOn(b.x, b.y);
  } else if (a.type === "move" && area) {
    state.change(`Move ${area.name}`, () => {
      area.x = a.x;
      area.y = a.y;
    });
    app.select({ kind: "area", id: area.id });
    app.afterPlace("area", area);
    app.focusOn(a.x, a.y);
  } else if (a.type === "resize" && area) {
    state.change(`Resize ${area.name}`, () => {
      area.w = a.w;
      area.d = a.d;
    });
    app.select({ kind: "area", id: area.id });
    app.afterPlace("area", area);
  } else if (a.type === "groups" && area) {
    const c = app.catalog.byKey[area.key];
    state.change("Add brand groups", () => {
      area.groups = (c.groups || []).map((g) => ({ ...g }));
    });
    app.select({ kind: "area", id: area.id });
  } else if (a.type === "select" && area) {
    app.select({ kind: "area", id: area.id });
    app.focusOn(area.x, area.y);
  }
  scheduleTips();
};

app.copySuggestedAll = async function () {
  if (!state.build.canEdit) return hud.toast("This build is read-only.", "warn");
  if (!app.suggestedBlocks.length) return hud.toast("The suggested plan isn't loaded on this server yet, so there's nothing to copy.", "warn");
  const ok = await hud.confirm({
    title: "Copy my plan into this build?",
    text: "This replaces the department blocks in your build with the 10 blocks from my suggested plan. Your fixtures stay the same, and you can undo it.",
    ok: "Copy all 10",
  });
  if (!ok) return;
  state.change("Copy suggested plan", (d) => {
    d.areas = app.suggestedBlocks.map((s) => {
      const { why, ...rest } = s;
      return { ...JSON.parse(JSON.stringify(rest)), id: areaFromCatalog(app.catalog.byKey[s.key], 0, 0, 1, 1).id };
    });
  });
  setMode("areas");
  hud.toast("Copied. Now make it yours.");
};

app.useSuggestedArea = function (key) {
  if (!state.build.canEdit) return hud.toast("This build is read-only.", "warn");
  const s = app.suggestedBlocks.find((b) => b.key === key);
  if (!s) return;
  const { why, ...rest } = JSON.parse(JSON.stringify(s));
  const existing = state.data.areas.find((a) => a.key === key);
  const c = app.catalog.byKey[key];
  state.change(`Use suggested ${c.name}`, (d) => {
    if (existing) Object.assign(existing, { x: rest.x, y: rest.y, w: rest.w, d: rest.d, rot: rest.rot, groups: rest.groups });
    else d.areas.push({ ...rest, id: areaFromCatalog(c, 0, 0, 1, 1).id });
  });
  hud.toast(`${c.name} now uses my suggested spot.`, "ok");
};

app.startFromSuggested = async function () {
  try {
    await state.flush();
    const r = await api.post("/api/builds", { name: "From Claude's suggested plan", from: "suggested" });
    app.builds = [summaryOf(r.build), ...app.builds];
    state.load(r.build);
    store.set("lastBuild", r.build.id);
    setMode("areas");
    hud.toast("New build started from the suggested plan.");
  } catch (e) {
    hud.toast(e.message, "warn");
  }
};

// ---------- layers & graphics ----------

app.setLayer = function (k, v) {
  app.ui.layers[k] = v;
  store.set("layers", app.ui.layers);
  syncScene();
};
app.setLowGfx = function (v) {
  app.ui.lowGfx = v;
  store.set("lowGfx", v);
  scene.setQuality(v);
};
app.setStructureUnlocked = function (v) {
  app.ui.structureUnlocked = v;
  app.select(app.ui.selection);
  panels.render();
};

// ---------- frame loop ----------

function onResize() {
  scene.resize();
  const compact = COMPACT.matches;
  document.body.classList.toggle("compact", compact);
  const left = compact ? 0 : ($("#left").offsetWidth || 0) + 16;
  const right = compact ? 0 : ($("#right").offsetWidth || 0) + 16;
  scene.setInsets({ left, right, top: compact ? 100 : 64, bottom: compact ? 140 : 24 });
  hud.layout();
}

const COMPACT = matchMedia("(max-width: 899px), (max-width: 1199px) and (pointer: coarse)");
COMPACT.addEventListener("change", () => onResize());
let last = performance.now();
let miniAt = 0;
let thoughtCheckAt = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const kv = input.keyVector();
  const jv = joystick.vector;
  const fwd = kv.fwd + jv.y, right = kv.right + jv.x;
  let mx = 0, my = 0;
  if (fwd || right) {
    const b = scene.moveBasis();
    mx = b.f[0] * fwd + b.r[0] * right;
    my = b.f[1] * fwd + b.r[1] * right;
    app.ui.lastActivity = now;
  }
  const js = scene.jerry.state;
  const bx = js.x, by = js.y;
  scene.jerry.update(dt, t, { mx, my, run: kv.run || Math.hypot(jv.x, jv.y) > 0.92 }, nav);
  const c = app.ui.carry;
  if (c && c.how === "jerry" && (js.x !== bx || js.y !== by)) editor.moveCarry([js.x, js.y]);
  if (scene.camMode === "map" && (mx || my)) keepJerryInView();
  scene.render(dt, t);
  hud.placeBubble(scene.project(js.x, js.y, 7.4));
  if (now - miniAt > 120) {
    miniAt = now;
    drawMinimap();
  }
  if (now - thoughtCheckAt > 500) {
    thoughtCheckAt = now;
    hud.maybeThink(now - app.ui.lastActivity);
  }
  requestAnimationFrame(loop);
}

function keepJerryInView() {
  const js = scene.jerry.state;
  const p = scene.project(js.x, js.y, 0);
  const r = app.canvas.getBoundingClientRect();
  const m = 90;
  if (p.x < m || p.y < m + 40 || p.x > r.width - m || p.y > r.height - m) scene.focus(js.x, js.y);
}

const mini = $("#minimap");
function drawMinimap() {
  if (!mini || mini.offsetParent === null) return;
  const w = mini.clientWidth, h = mini.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (mini.width !== Math.round(w * dpr)) {
    mini.width = Math.round(w * dpr);
    mini.height = Math.round(h * dpr);
  }
  const g = mini.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { items, areas } = sceneLayout();
  const js = scene.jerry.state;
  const fov = scene.camMode === "jerry" ? 1.2 : 0;
  const heading = scene.camMode === "jerry" ? Math.atan2(scene.moveBasis().f[1], scene.moveBasis().f[0]) : js.heading;
  app.miniTransform = drawPlan(g, {
    items,
    areas: app.ui.layers.areas ? areas : [],
    catalog: app.catalog,
    width: w,
    height: h,
    theme: app.planTheme,
    labels: false,
    pad: 4,
    jerry: { x: js.x, y: js.y, heading, fov },
    highlightId: app.ui.selection ? app.ui.selection.id : null,
  });
}
mini &&
  mini.addEventListener("click", (e) => {
    if (!app.miniTransform) return;
    const r = mini.getBoundingClientRect();
    const [x, y] = app.miniTransform.toFt(e.clientX - r.left, e.clientY - r.top);
    if (scene.camMode === "map") scene.focus(x, y);
    else app.walkTo(x, y);
  });

boot().catch((e) => {
  console.error(e);
  hudLoading(e instanceof ApiError ? e.message : "Something went wrong loading the planner. Refresh to try again.");
});
