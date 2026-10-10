// Front-end logic that runs without a DOM (Phase 2): the URL hash, the autosave state machine, drafts kept on
// the device, the editing session (doc + layout + selection + history + lock) and the drag readouts.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parseHash, buildHash, isMapId, VIEWS } from "../public/js/core/route.js";
import { createAutosave } from "../public/js/core/autosave.js";
import { saveDraft, loadDraft, clearDraft, draftIds, clearAllDrafts } from "../public/js/core/drafts.js";
import { createSession, toLayout } from "../public/js/core/session.js";
import { wallGaps, readoutsFor } from "../public/js/core/readouts.js";
import { buildSnapTargets } from "../public/js/core/snap.js";
import * as D from "../public/js/core/doc.js";
import * as A from "../public/js/core/areas.js";

/* ======================================================================= route.js */
describe("route: the URL hash", () => {
  test("parses views, map ids and the master in any order", () => {
    assert.deepEqual(parseHash("#plan"), { view: "plan", mode: null, map: null });
    assert.deepEqual(parseHash("#plan&map=m_abc"), { view: "plan", mode: null, map: "m_abc" });
    assert.deepEqual(parseHash("map=m_abc&categories"), { view: "plan", mode: "planning", map: "m_abc" });
    assert.deepEqual(parseHash("#3d&master"), { view: "3d", mode: null, map: "master" });
    assert.deepEqual(parseHash(""), { view: null, mode: null, map: null });
    assert.deepEqual(parseHash("#junk&map=../x&walk"), { view: "walk", mode: null, map: null });
    for (const v of VIEWS) assert.equal(parseHash("#" + v).view, v);
  });
  test("builds what it parses", () => {
    assert.equal(buildHash({ view: "plan", map: "m_1" }), "#plan&map=m_1");
    assert.equal(buildHash({ view: "walk", map: "master" }), "#walk&master");
    assert.equal(buildHash({ view: "plan", map: null }), "#plan");
    assert.equal(buildHash({ view: "nope", map: "bad id" }), "#");
    for (const h of ["#plan&map=m_1", "#walk&master", "#3d"]) assert.equal(buildHash(parseHash(h)), h);
    assert.ok(isMapId("m_abc-1"));
    assert.ok(!isMapId("master") && !isMapId("m_") && !isMapId("x_1"));
  });
});

/* ======================================================================= autosave.js */
// fake timers: a sorted list of {at, fn}
function fakeClock() {
  let now = 0, timers = [], n = 0;
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++n; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > until) break;
        timers.shift(); now = t.at; t.fn();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      }
      now = until;
    },
    pending: () => timers.length,
  };
}
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("autosave: the state machine", () => {
  test("saves 1.5 s after the last change, once", async () => {
    const clock = fakeClock(), states = [], saves = [];
    const a = createAutosave({ save: async () => { saves.push(clock.now()); return { ok: true }; }, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onState: (s) => states.push(s) });
    assert.equal(a.status(), "saved");
    a.change(); await clock.advance(500); a.change(); await clock.advance(500); a.change();
    assert.equal(a.status(), "dirty"); assert.deepEqual(saves, []);
    await clock.advance(1499); assert.deepEqual(saves, []);
    await clock.advance(1); await tick();
    assert.deepEqual(saves, [2500]);
    assert.equal(a.status(), "saved");
    assert.deepEqual(states, ["dirty", "saving", "saved"]);
    assert.equal(a.pending, false);
  });
  test("a change during a save is saved afterwards", async () => {
    const clock = fakeClock(); let resolve; let n = 0;
    const a = createAutosave({ save: () => { n++; return new Promise((r) => { resolve = r; }); }, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
    a.change(); await clock.advance(1500); await tick();
    assert.equal(a.status(), "saving"); assert.equal(n, 1);
    a.change(); // while in flight
    assert.equal(a.status(), "saving");
    resolve({ ok: true }); await tick();
    assert.equal(a.status(), "dirty"); assert.equal(a.pending, true);
    await clock.advance(1500); await tick();
    assert.equal(n, 2);
    resolve({ ok: true }); await tick();
    assert.equal(a.status(), "saved");
  });
  test("network failure retries after 10 s, keeps the edits pending, and Try now saves at once", async () => {
    const clock = fakeClock(); let fail = true; let n = 0;
    const a = createAutosave({ save: async () => { n++; return fail ? { ok: false, status: 0, error: "down" } : { ok: true }; }, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
    a.change(); await clock.advance(1500); await tick();
    assert.equal(a.status(), "retry"); assert.equal(a.error, "down"); assert.equal(a.pending, true);
    await clock.advance(10000); await tick();
    assert.equal(n, 2); assert.equal(a.status(), "retry");
    fail = false;
    await a.tryNow(); await tick();
    assert.equal(n, 3); assert.equal(a.status(), "saved"); assert.equal(clock.pending(), 0);
  });
  test("offline waits; a 5xx retries; 400 is rejected until the next change; 409 and 423 halt until reset", async () => {
    const clock = fakeClock(); let online = false; let result = { ok: false, status: 500, error: "boom" };
    const a = createAutosave({ save: async () => result, online: () => online, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
    a.change(); await clock.advance(1500); await tick();
    assert.equal(a.status(), "offline");
    online = true; await clock.advance(10000); await tick();
    assert.equal(a.status(), "retry");
    result = { ok: false, status: 400, error: "Bad item" }; await clock.advance(10000); await tick();
    assert.equal(a.status(), "rejected"); assert.equal(a.error, "Bad item"); assert.equal(clock.pending(), 0);
    result = { ok: true }; a.change(); await clock.advance(1500); await tick();
    assert.equal(a.status(), "saved");
    result = { ok: false, status: 409, error: "stale" }; a.change(); await clock.advance(1500); await tick();
    assert.equal(a.status(), "conflict");
    a.change(); await clock.advance(5000); await tick();
    assert.equal(a.status(), "conflict", "nothing is retried after a conflict");
    assert.equal(a.pending, true);
    a.reset(); assert.equal(a.status(), "saved"); assert.equal(a.pending, false);
    result = { ok: false, status: 423, error: "locked" }; a.change(); await clock.advance(1500); await tick();
    assert.equal(a.status(), "locked");
  });
  test("a save that throws counts as a network failure; flush saves now", async () => {
    const clock = fakeClock(); let n = 0;
    const a = createAutosave({ save: async () => { n++; if (n === 1) throw new Error("fetch failed"); return { ok: true }; }, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
    a.change(); await a.flush(); await tick();
    assert.equal(a.status(), "retry"); assert.equal(a.error, "fetch failed");
    await a.flush(); await tick();
    assert.equal(a.status(), "saved"); assert.equal(n, 2);
  });
});

/* ======================================================================= drafts.js */
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
describe("drafts: unsaved edits kept on the device", () => {
  test("save, load, list and clear; broken values are dropped; a missing storage never throws", () => {
    const st = memStorage();
    assert.ok(saveDraft(st, "m_1", { version: 3, data: { items: [{ id: "a" }] } }, 123));
    assert.deepEqual(loadDraft(st, "m_1"), { version: 3, data: { items: [{ id: "a" }] }, at: 123 });
    assert.deepEqual(draftIds(st), ["m_1"]);
    st.setItem("fbs-draft-v1:m_2", "{not json");
    assert.equal(loadDraft(st, "m_2"), null);
    assert.deepEqual(draftIds(st), ["m_1"]);
    clearDraft(st, "m_1");
    assert.equal(loadDraft(st, "m_1"), null);
    assert.equal(saveDraft(null, "m_1", { version: 1, data: { items: [] } }), false);
    assert.equal(loadDraft(undefined, "m_1"), null);
    clearDraft(undefined, "m_1");
    const full = { setItem() { throw new Error("QuotaExceeded"); }, getItem: () => null, removeItem() {} };
    assert.equal(saveDraft(full, "m_1", { version: 1, data: { items: [] } }), false);
  });

  test("clearAllDrafts (sign-out) removes every draft and nothing else; a missing storage never throws", () => {
    const st = memStorage();
    saveDraft(st, "m_1", { version: 1, data: { items: [] } });
    saveDraft(st, "m_2", { version: 4, data: { items: [{ id: "a" }] } });
    st.setItem("fbs-layers-v2", "{}"); // an unrelated preference stays
    assert.equal(clearAllDrafts(st), 2);
    assert.deepEqual(draftIds(st), []);
    assert.equal(st.getItem("fbs-layers-v2"), "{}");
    assert.equal(st.length, 1);
    assert.equal(clearAllDrafts(undefined), 0);
    assert.equal(clearAllDrafts({ get length() { throw new Error("blocked"); } }), 0);
  });
});

/* ======================================================================= session.js */
const store = () => ({
  items: [
    { id: "f1", type: "floor", name: "Sales floor", x: 30, y: 20, w: 60, d: 40, h: 0, rot: 0, kind: "showroom", fixed: true },
    { id: "ws", type: "wall", name: "South wall", x: 30, y: -0.35, w: 61.4, d: 0.7, h: 14, rot: 0 },
    { id: "wn", type: "wall", name: "North wall", x: 30, y: 40.35, w: 61.4, d: 0.7, h: 14, rot: 0 },
    { id: "ww", type: "wall", name: "West wall", x: -0.35, y: 20, w: 40, d: 0.7, h: 14, rot: 90 },
    { id: "we", type: "wall", name: "East wall", x: 60.35, y: 20, w: 40, d: 0.7, h: 14, rot: 90 },
    { id: "g1", type: "gondola", name: "PAINT ISLE", x: 20, y: 12, w: 17.5, d: 4, h: 6, rot: 0 },
    { id: "g2", type: "gondola", name: "TOOL ISLE", x: 40, y: 12, w: 12, d: 4, h: 6, rot: 0 },
  ],
  categories: [],
  building: { length: 60, width: 40 },
});

describe("session: doc, layout, selection, history, lock", () => {
  test("load gives a layout and categories; edits go through apply and undo/redo", () => {
    const events = [];
    const s = createSession({ onChange: (k, i) => events.push(k) });
    s.load(store());
    assert.equal(s.layout.items.length, 7);
    assert.equal(s.building.L, 60);
    assert.equal(s.categories.length, 10);
    assert.deepEqual(events, ["load"]);
    s.select("g1");
    assert.deepEqual(s.selection, ["g1"]);
    assert.equal(s.single.name, "PAINT ISLE");
    const r = s.apply(D.moveItems(s.doc, ["g1"], 2, 0, s.editOpts), { label: "Move" });
    assert.ok(!r.error);
    assert.equal(s.item("g1").x, 22);
    assert.equal(s.layout.byId.get("g1").x, 22);
    assert.ok(s.history.canUndo());
    assert.equal(s.undo().label, "Move");
    assert.equal(s.item("g1").x, 20);
    s.redo();
    assert.equal(s.item("g1").x, 22);
    assert.ok(events.includes("doc") && events.includes("selection") && events.includes("history"));
  });
  test("a refused edit changes nothing; structure is locked until unlocked", () => {
    const s = createSession();
    s.load(store());
    const r = s.apply(D.moveItems(s.doc, ["ws"], 1, 0, s.editOpts), { label: "Move" });
    assert.ok(r.error);
    assert.ok(s.isLocked("ws"));
    assert.ok(!s.history.canUndo());
    s.setUnlocked(true);
    assert.ok(!s.isLocked("ws"));
    const r2 = s.apply(D.moveItems(s.doc, ["ws"], 1, 0, s.editOpts), { label: "Move" });
    assert.ok(!r2.error);
    assert.equal(s.item("ws").x, 31);
  });
  test("a gesture is one undo step; cancel rolls it back; deleting drops the selection", () => {
    const s = createSession();
    s.load(store());
    s.select(["g1", "g2"]);
    s.begin("Move");
    for (let i = 0; i < 5; i++) s.apply(D.moveItems(s.doc, s.selection, 0.5, 0, s.editOpts));
    s.end();
    assert.equal(s.item("g1").x, 22.5);
    assert.equal(s.history.size().undo, 1);
    s.undo();
    assert.equal(s.item("g1").x, 20);
    s.begin("Move");
    s.apply(D.moveItems(s.doc, ["g1"], 5, 5, s.editOpts));
    s.cancel();
    assert.equal(s.item("g1").x, 20);
    assert.equal(s.history.size().undo, 0);
    const del = s.apply(D.deleteItems(s.doc, ["g1"], s.editOpts), { label: "Delete" });
    assert.deepEqual(s.selection, ["g2"]);
    s.applyPatch(del.inverse, "Undo delete");
    assert.ok(s.item("g1"));
  });
  test("toggle / add selection, snap targets include blocks, toLayout never throws", () => {
    const s = createSession();
    s.load(store());
    s.select("g1"); s.select("g2", { toggle: true }); assert.deepEqual(s.selection, ["g1", "g2"]);
    s.select("g1", { toggle: true }); assert.deepEqual(s.selection, ["g2"]);
    s.select(["g1"], { add: true }); assert.deepEqual(s.selection, ["g2", "g1"]);
    s.select("nope"); assert.deepEqual(s.selection, []);
    const before = s.snapTargets.faces.length;
    s.apply(A.createBlock(s.doc, "power_tools", { x: 30, y: 25 }), { label: "Place" });
    assert.equal(s.snapTargets.faces.length, before + 4);
    const empty = toLayout({ items: [] });
    assert.equal(empty.items.length, 0);
    assert.equal(empty.building.L, 169);
    s.replace({ items: [] });
    assert.equal(s.layout.items.length, 0);
    assert.ok(!s.history.canUndo());
  });
});

/* ======================================================================= readouts.js */
describe("readouts: gaps to the nearest walls", () => {
  test("a gondola in the room measures to the inside wall faces on each axis", () => {
    const doc = store();
    const targets = buildSnapTargets(doc.items);
    const g = doc.items.find((it) => it.id === "g1"); // x 11.25..28.75, y 10..14
    const gaps = wallGaps(g, targets);
    assert.equal(gaps.x.dir, "west"); assert.ok(Math.abs(gaps.x.d - 11.25) < 1e-6);
    assert.deepEqual(gaps.x.from, [11.25, 12]); assert.ok(Math.abs(gaps.x.to[0]) < 1e-6);
    assert.equal(gaps.y.dir, "south"); assert.ok(Math.abs(gaps.y.d - 10) < 1e-6);
    const r = readoutsFor({ ...g, rot: 45 }, targets, { rotating: true });
    assert.equal(r.angle, 45); assert.equal(r.size.w, 17.5);
    assert.deepEqual(wallGaps(g, { walls: [] }), { x: null, y: null });
  });
});

/* ======================================================================= plan2d/edit-draw.js + blocks.js (pure parts) */
import { handleAt, hiddenHandles, handleScreenPoints, polyHandleAt } from "../public/js/plan2d/edit-draw.js";
import { blockLines, colourOf } from "../public/js/plan2d/blocks.js";

describe("plan editing: handles and block labels", () => {
  const V = { cx: 50, cy: 25, s: 5, W: 800, H: 500 }; // 5 px per ft
  test("thin items hide the middle handles on their narrow axis; the centre is free to grab", () => {
    const thin = { x: 50, y: 25, w: 27.5, d: 3, rot: 0 };
    assert.deepEqual(hiddenHandles(V, thin, false), { ns: true, ew: false });
    assert.equal(handleAt(V, thin, 400, 250, false), null, "a click in the middle is the body, not a handle");
    const deep = { x: 50, y: 25, w: 20, d: 20, rot: 0 };
    assert.deepEqual(hiddenHandles(V, deep, false), { ns: false, ew: false });
    assert.equal(handleAt(V, deep, 400, 250 - 50, false), "n");
  });
  test("the nearest handle wins when corners and middles sit close; the rotate handle sits past the front edge", () => {
    const it = { x: 50, y: 25, w: 24, d: 4, rot: 0 }; // 120 x 20 px
    const pts = handleScreenPoints(V, it, false);
    assert.equal(handleAt(V, it, pts.e[0], pts.e[1], false), "e");
    assert.equal(handleAt(V, it, pts.ne[0] + 1, pts.ne[1] - 1, false), "ne");
    assert.ok(Math.abs(pts.rotate[1] - (pts.n[1] - 24)) < 1e-6, "rotate handle is 24 px above the front edge with a mouse");
    assert.equal(handleAt(V, it, pts.rotate[0], pts.rotate[1], false), "rotate");
    assert.equal(handleAt(V, it, pts.rotate[0], pts.rotate[1] - 40, false), null);
    const tpts = handleScreenPoints(V, it, true);
    assert.ok(Math.abs(tpts.rotate[1] - (tpts.n[1] - 30)) < 1e-6, "30 px on touch");
  });
  test("polygon corner and midpoint handles", () => {
    const poly = { x: 50, y: 25, w: 20, d: 10, rot: 0, type: "area", shape: "poly", pts: [[-10, -5], [10, -5], [10, 5], [-10, 5]] };
    const c = { corner: 0 };
    const [sx, sy] = [(40 - V.cx) * V.s + V.W / 2, V.H / 2 - (20 - V.cy) * V.s];
    assert.deepEqual(polyHandleAt(V, poly, sx, sy, false), c);
    const [mx, my] = [(50 - V.cx) * V.s + V.W / 2, V.H / 2 - (20 - V.cy) * V.s];
    assert.deepEqual(polyHandleAt(V, poly, mx, my, false), { mid: 0 });
    assert.equal(polyHandleAt(V, poly, mx, my - 100, false), null, "far above the shape is nothing");
  });
  test("block label lines and theme colour", () => {
    const cat = { name: "Power Tools", targetSqft: 700, color: "#CD5811", colorDark: "#FC9252" };
    assert.deepEqual(blockLines({ w: 28, d: 25, shape: "rect" }, cat), ["POWER TOOLS", "700 sq ft / 700"]);
    assert.deepEqual(blockLines({ w: 10, d: 10, shape: "rect", name: "Spot" }, null), ["SPOT", "100 sq ft"]);
    assert.equal(colourOf(cat, false), "#CD5811");
    assert.equal(colourOf(cat, true), "#FC9252");
    assert.equal(colourOf({ color: "#123456" }, true), "#123456");
  });
});
