// Final-round front-end and Worker logic that runs without a DOM or a server: what the page does while the
// server's map tables are not ready (deploy order), hash changes that name a map and a mode, what Blank slate
// leaves selected, autosave waiting for a save in flight, the one "master is locked" sentence, the Add sheet's
// unlock hint, and the master version race check.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { apiNotReady, staticMasterResponse, legacyAllows, legacyMode, LEGACY_MODES, LEGACY_BANNER, LEGACY_BANNER_TEXT } from "../public/js/core/readiness.js";
import { planHashChange, parseHash, MODES } from "../public/js/core/route.js";
import { itemShownIn, modeLayers, modeNotice, unlockHint } from "../public/js/core/modes.js";
import { createAutosave } from "../public/js/core/autosave.js";
import { reviewErrorText, MASTER_LOCKED_TEXT } from "../public/js/core/review.js";
import { applyErrorText } from "../public/js/core/compare.js";
import { createSession } from "../public/js/core/session.js";
import { collectIssues } from "../public/js/core/issues.js";
import { isVersionRace } from "../src/lib/store.js";

const masterJson = JSON.parse(readFileSync(new URL("../public/data/master.json", import.meta.url), "utf8"));

/* ======================================================================= deploy order: the server isn't ready */
describe("readiness: the new page published before migration 0005 / the master seed", () => {
  test("which API failures mean 'not set up yet'", () => {
    const err = (status) => Object.assign(new Error("x"), { status });
    // the Worker answers 503 when a table is missing ("The site isn't set up yet.") or the master isn't seeded
    assert.equal(apiNotReady(err(503)), true);
    assert.equal(apiNotReady(err(503), { master: true }), true);
    // a 404 on the master itself is "not set up"; a 404 on someone's map is a deleted map
    assert.equal(apiNotReady(err(404), { master: true }), true);
    assert.equal(apiNotReady(err(404)), false);
    // a dropped connection, a signed-out visitor, a bad request or a plain server error is none of the above
    for (const s of [0, 400, 401, 403, 409, 423, 429, 500, 502]) assert.equal(apiNotReady(err(s), { master: true }), false, String(s));
    assert.equal(apiNotReady(null), false);
    assert.equal(apiNotReady(undefined, { master: true }), false);
    assert.equal(apiNotReady(new Error("no status")), false);
    assert.equal(apiNotReady("503"), false);
  });

  test("only the modes that just read the master stay; everything else becomes Current layout", () => {
    assert.deepEqual([...LEGACY_MODES], ["blank", "current"]);
    for (const m of MODES) assert.equal(legacyAllows(m), m === "blank" || m === "current", m);
    assert.equal(legacyMode("planning"), "current");
    assert.equal(legacyMode("comparison"), "current");
    assert.equal(legacyMode("advisor"), "current");
    assert.equal(legacyMode("review"), "current");
    assert.equal(legacyMode("blank"), "blank");
    assert.equal(legacyMode("current"), "current");
    assert.equal(legacyMode("junk"), "current");
  });

  test("the banner says it in plain words, with no technical terms", () => {
    assert.equal(LEGACY_BANNER_TEXT, "Editing isn't switched on yet. You're viewing the master map as it stands.");
    assert.equal(LEGACY_BANNER.title + LEGACY_BANNER.text, LEGACY_BANNER_TEXT);
    assert.doesNotMatch(LEGACY_BANNER_TEXT, /503|404|API|database|migration|error|server/i);
  });

  test("the static master file becomes a master 'response' the rest of the page can use read-only", () => {
    const m = staticMasterResponse(masterJson);
    assert.ok(m);
    assert.equal(m.static, true);
    assert.equal(m.version, 0);
    assert.equal(m.locked, false);
    assert.equal(m.itemCount, masterJson.items.length);
    assert.equal(m.data, masterJson);
    for (const bad of [null, undefined, 5, "x", [], {}, { items: "nope" }]) assert.equal(staticMasterResponse(bad), null, JSON.stringify(bad));
  });

  test("the editing session loads the static master like the first version of the site did (items, building, no categories)", () => {
    const m = staticMasterResponse(masterJson);
    const s = createSession();
    s.load(m.data, { building: m.data.building });
    assert.equal(s.layout.items.length, masterJson.items.length);
    assert.equal(s.building.L, masterJson.building.length);
    assert.equal(s.building.W, masterJson.building.width);
    assert.ok(s.categories.length >= 10, "the ten default departments are there even though the file has no categories");
    assert.equal(collectIssues(s.doc).count >= 0, true);
  });

  test("the notices for Blank slate don't send people to a mode that isn't there", () => {
    assert.match(modeNotice("blank", { master: true }), /Area planning/);
    assert.doesNotMatch(modeNotice("blank", { master: true, legacy: true }), /Area planning/);
    assert.match(modeNotice("blank", { master: true, legacy: true }), /Current layout/);
    assert.match(modeNotice("current", { master: true, legacy: true }), /can't be changed/);
  });
});

/* ======================================================================= the hash */
describe("route: a hash typed by hand", () => {
  const cur = { view: "plan", mode: "planning", map: "m_a" };
  test("names a new map and a new mode: both are applied, the map first", () => {
    assert.deepEqual(planHashChange("#plan&advisor&map=m_b", cur), { map: "m_b", view: null, mode: "advisor" });
    assert.deepEqual(planHashChange("#3d&comparison&master", cur), { map: "master", view: "3d", mode: "comparison" });
  });
  test("only the parts that differ are reported", () => {
    assert.deepEqual(planHashChange("#plan&map=m_a", cur), { map: null, view: null, mode: null });
    assert.deepEqual(planHashChange("#walk", cur), { map: null, view: "walk", mode: null });
    assert.deepEqual(planHashChange("#plan&map=m_b", cur), { map: "m_b", view: null, mode: null });
    assert.deepEqual(planHashChange("", cur), { map: null, view: null, mode: null });
    assert.deepEqual(planHashChange("#junk&map=../x", cur), { map: null, view: null, mode: null });
  });
  test("the old Phase 2 #categories link still opens the plan in Area planning", () => {
    assert.deepEqual(planHashChange("#categories", { view: "3d", mode: "blank", map: "master" }), { map: null, view: "plan", mode: "planning" });
    assert.equal(parseHash("#categories").mode, "planning");
  });
});

/* ======================================================================= Blank slate and the selection */
describe("modes: what stays selectable", () => {
  const L = (mode, over = {}) => modeLayers(mode, { structure: true, fixtures: true, categories: true, faint: false, ...over });
  const block = { id: "b1", type: "area", cat: "power-tools" };
  const gondola = { id: "g1", type: "gondola" };
  const wall = { id: "w1", type: "wall" };
  test("Blank slate draws only the structure, so a selected department block or fixture must be dropped", () => {
    const blank = L("blank");
    assert.equal(itemShownIn(block, blank), false);
    assert.equal(itemShownIn(gondola, blank), false);
    assert.equal(itemShownIn(wall, blank), true);
  });
  test("Area planning keeps them all; Current layout keeps fixtures and structure but never a department area", () => {
    for (const mode of ["planning", "current"]) {
      assert.equal(itemShownIn(block, L(mode)), mode === "planning", mode);
      assert.equal(itemShownIn(gondola, L(mode)), true, mode);
      assert.equal(itemShownIn(wall, L(mode)), true, mode);
    }
  });
  test("hidden layers: a hidden fixture can't be picked on the plan, but can in 3D", () => {
    const l = L("planning", { fixtures: false });
    assert.equal(itemShownIn(gondola, l, { plan: true }), false);
    assert.equal(itemShownIn(gondola, l, { plan: false }), true);
    assert.equal(itemShownIn(block, L("planning", { categories: false })), false);
    assert.equal(itemShownIn(wall, L("planning", { structure: false })), false);
  });
});

describe("modes: where to unlock the Structure", () => {
  test("says where the lock is on a computer and on a phone, and points the 3D view to the Plan", () => {
    assert.match(unlockHint({ touch: false, plan: true }), /in the toolbar/);
    assert.match(unlockHint({ touch: true, plan: true }), /in More/);
    assert.doesNotMatch(unlockHint({ touch: true, plan: true }), /toolbar/);
    assert.match(unlockHint({ touch: true, plan: false }), /Plan/);
    assert.match(unlockHint({ touch: false, plan: false }), /Plan/);
    assert.match(unlockHint(), /in the toolbar/);
  });
});

/* ======================================================================= one "locked" sentence */
describe("the locked master has one sentence everywhere", () => {
  test("approve, restore, apply and the comparison all say the same thing, and it names a control that exists", () => {
    assert.equal(reviewErrorText(423), MASTER_LOCKED_TEXT);
    assert.equal(applyErrorText(423), MASTER_LOCKED_TEXT);
    assert.match(MASTER_LOCKED_TEXT, /^The master map is locked\./);
    assert.match(MASTER_LOCKED_TEXT, /account menu/);
    assert.match(MASTER_LOCKED_TEXT, /Lock the master map/);
  });
});

/* ======================================================================= autosave: flush waits for the save in flight */
function fakeClock() {
  let now = 0, timers = [], n = 0;
  return {
    setTimeout: (fn, ms) => { const id = ++n; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > until) break;
        timers.shift(); now = t.at; t.fn();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      }
      now = until;
    },
  };
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe("autosave: flush really waits for everything (opening another map, submitting)", () => {
  test("flush while a save is in flight waits for it, then sends the edits made meanwhile in a second save", async () => {
    const clock = fakeClock(), calls = [], resolvers = [];
    const a = createAutosave({ save: () => { calls.push(calls.length + 1); return new Promise((r) => resolvers.push(r)); }, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
    a.change(); await clock.advance(1500); await tick();
    assert.equal(a.status(), "saving"); assert.equal(calls.length, 1);
    a.change(); // edited while the first save is out
    let done = false;
    const flushed = a.flush().then(() => { done = true; });
    await tick();
    assert.equal(done, false, "flush must not finish while the first save is still out");
    assert.equal(calls.length, 1, "and does not send a second save on top of it");
    resolvers[0]({ ok: true }); await tick();
    assert.equal(calls.length, 2, "the edits made in flight are saved right away, not 1.5 s later");
    assert.equal(done, false, "flush waits for that second save too");
    resolvers[1]({ ok: true }); await flushed;
    assert.equal(done, true);
    assert.equal(a.status(), "saved");
    assert.equal(a.pending, false);
  });
  test("flush with nothing in flight saves now, and a failed save leaves pending true for the caller to see", async () => {
    const clock = fakeClock(); let n = 0;
    const a = createAutosave({ save: async () => { n++; return { ok: false, status: 0, error: "down" }; }, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
    a.change();
    await a.flush();
    assert.equal(n, 1);
    assert.equal(a.pending, true, "submit / compare check this and refuse to go on");
    assert.equal(a.status(), "retry");
  });
  test("flush when nothing is pending does nothing; a reset while saving ends the wait", async () => {
    const clock = fakeClock(); let n = 0, resolve;
    const a = createAutosave({ save: () => { n++; return new Promise((r) => { resolve = r; }); }, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
    await a.flush();
    assert.equal(n, 0);
    a.change(); await clock.advance(1500); await tick();
    const flushed = a.flush();
    a.reset(); resolve({ ok: true });
    await flushed;
    assert.equal(a.pending, false);
    assert.equal(a.status(), "saved");
    assert.equal(n, 1);
  });
});

/* ======================================================================= the master version race (Worker) */
describe("isVersionRace: the loser of two parallel master saves gets 409, not 500", () => {
  const envAt = (versions) => {
    let i = 0;
    return { DB: { prepare: () => ({ first: async () => ({ v: versions[Math.min(i++, versions.length - 1)] }) }) } };
  };
  const noWait = async () => {};
  test("a constraint error is a race at once", async () => {
    assert.equal(await isVersionRace(envAt([3]), new Error("UNIQUE constraint failed: master_versions.version"), 3, noWait), true);
    assert.equal(await isVersionRace(envAt([3]), new Error("D1_ERROR: SQLITE_CONSTRAINT"), 3, noWait), true);
  });
  test("busy / locked errors from the database are a race too", async () => {
    assert.equal(await isVersionRace(envAt([3]), new Error("D1_ERROR: database is locked"), 3, noWait), true);
    assert.equal(await isVersionRace(envAt([3]), new Error("SQLITE_BUSY"), 3, noWait), true);
  });
  test("another error while the master has moved on is a race, even when the winner commits a moment later", async () => {
    assert.equal(await isVersionRace(envAt([4]), new Error("D1_ERROR: something odd"), 3, noWait), true);
    assert.equal(await isVersionRace(envAt([3, 3, 4]), new Error("D1_ERROR: something odd"), 3, noWait), true, "re-checked after a short wait");
  });
  test("an unrelated error with the master unchanged is not a race (it stays a 500)", async () => {
    const waits = [];
    assert.equal(await isVersionRace(envAt([3, 3, 3]), new Error("D1_ERROR: something odd"), 3, async (ms) => { waits.push(ms); }), false);
    assert.deepEqual(waits, [40, 120], "it looked again twice, over about 160 ms");
  });
  test("if the check itself fails it is not a race", async () => {
    const env = { DB: { prepare: () => ({ first: async () => { throw new Error("down"); } }) } };
    assert.equal(await isVersionRace(env, new Error("D1_ERROR: odd"), 3, noWait), false);
  });
});
