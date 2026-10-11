// Phase 3 front-end logic that runs without a DOM: the view modes, the hash with a mode, the collision
// summary, the comparison state and the advisor panel helpers.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseHash, buildHash, MODES, VIEWS } from "../public/js/core/route.js";
import { modeAllows, modeLayers, modeNotice, MODE_INFO, isMode } from "../public/js/core/modes.js";
import { collectIssues, issueLabel, firstOffender, issueIds } from "../public/js/core/issues.js";
import { createCompare, rowGroups, rowKey, kindIcon, ghostOf, rowBounds, pickOptions, canApply, applyErrorText, countText, compareDocs } from "../public/js/core/compare.js";
import { fixEdits, scoreTone, showBounds, configRows, buildConfig, OVERLAYS, defaultOverlays } from "../public/js/core/advisor-ui.js";
import { normalizeDoc, applyPatch } from "../public/js/core/doc.js";
import { toLayout } from "../public/js/core/session.js";
import { analyse, defaultConfig } from "../public/js/core/advisor.js";
import { CATALOG } from "../public/js/shared/catalog.js";
import { validateAdvisorConfig } from "../public/js/shared/advisor-config.js";

const master = JSON.parse(readFileSync(new URL("../public/data/master.json", import.meta.url), "utf8"));
const block = (id, cat, x, y, w = 20, d = 20, extra = {}) => ({ id, type: "area", cat, shape: "rect", x, y, w, d, h: 8, rot: 0, ...extra });

/* ======================================================================= route.js with modes */
describe("route: modes in the hash", () => {
  test("parses view, mode and map in any order; the default mode is left out when built", () => {
    assert.deepEqual(parseHash("#plan&advisor&map=m_1"), { view: "plan", mode: "advisor", map: "m_1" });
    assert.deepEqual(parseHash("#comparison&3d&master"), { view: "3d", mode: "comparison", map: "master" });
    assert.deepEqual(parseHash("#walk"), { view: "walk", mode: null, map: null });
    assert.equal(buildHash({ view: "plan", mode: "planning", map: "m_1" }), "#plan&map=m_1");
    assert.equal(buildHash({ view: "3d", mode: "blank", map: "master" }), "#3d&blank&master");
    for (const m of MODES) assert.equal(parseHash(buildHash({ view: "plan", mode: m })).mode, m === "planning" ? null : m);
    for (const v of VIEWS) assert.equal(parseHash("#" + v).view, v);
  });
  test("the Phase 2 #categories hash opens the plan in Area planning; junk is ignored", () => {
    assert.deepEqual(parseHash("#categories&map=m_abc"), { view: "plan", mode: "planning", map: "m_abc" });
    assert.deepEqual(parseHash("#nope&map=%E0%A4%A&blank"), { view: null, mode: "blank", map: null });
  });
});

/* ======================================================================= modes.js */
describe("modes: what each mode shows and allows", () => {
  test("only Area planning edits; Blank slate hides fixtures and departments; Current layout shows the master's fixtures, never department areas", () => {
    assert.equal(MODES.filter(m => modeAllows(m).edit).join(), "planning");
    assert.equal(modeAllows("blank").showsBlocks, false);
    assert.equal(modeAllows("current").usesMaster, true);
    assert.equal(modeAllows("current").showsBlocks, false, "department areas live in Area planning only");
    assert.equal(modeAllows("planning").showsBlocks, true);
    assert.equal(modeAllows("comparison").panel, "compare");
    assert.equal(modeAllows("advisor").panel, "advisor");
    assert.ok(isMode("advisor") && isMode("review") && !isMode("nope")); // review is the Phase 4 admin mode
    for (const m of MODES) assert.ok(MODE_INFO[m].label && MODE_INFO[m].icon && MODE_INFO[m].hint);
  });
  test("modeLayers applies the rules over the person's choices", () => {
    const L = { structure: true, fixtures: true, faint: false, categories: false, labels: true };
    assert.deepEqual(modeLayers("blank", L), { ...L, fixtures: false, faint: false, categories: false });
    assert.deepEqual(modeLayers("current", { ...L, fixtures: false, faint: true }), { ...L, fixtures: true, faint: false, categories: false }, "the store as it stands: fixtures on, no areas");
    assert.equal(modeLayers("planning", L).categories, false);
    assert.equal(modeLayers("planning", { ...L, fixtures: false, categories: true }).fixtures, false, "planning keeps the blank-slate look the person chose");
    assert.equal(modeLayers("advisor", { ...L, fixtures: false, faint: true }).faint, true);
  });
  test("a read-only notice for every mode but Area planning", () => {
    assert.equal(modeNotice("planning"), null);
    for (const m of ["blank", "current", "comparison", "advisor"]) assert.match(modeNotice(m), /\w/);
  });
});

/* ======================================================================= issues.js */
describe("issues: the collision summary", () => {
  const column = master.items.find(it => it.type === "column");
  const door = master.items.find(it => it.type === "door");
  test("a block over a column is a warning; one clear of everything is not; the label counts them", () => {
    const doc = normalizeDoc({ items: [...master.items, block("b1", "power_tools", column.x, column.y, 12, 12)] });
    const r = collectIssues(doc);
    assert.ok(r.ids.has("b1"));
    assert.ok(r.issues.some(i => i.kind === "column" && /column/i.test(i.message)));
    assert.equal(r.label, issueLabel(r.count));
    assert.match(r.label, /^\d+ warnings?$/);
    assert.ok(r.markers.every(m => Number.isFinite(m.x) && Number.isFinite(m.y)));
    assert.equal(firstOffender(r), "b1");
    assert.deepEqual(issueIds(r.issues[0]).slice(0, 1), ["b1"]);
    const clean = collectIssues(normalizeDoc({ items: master.items }));
    assert.equal(clean.count, 0); assert.equal(clean.label, ""); assert.equal(firstOffender(clean), null);
  });
  test("a block across a door blocks it with the clearance in the message; errors come first", () => {
    const doc = normalizeDoc({ items: [...master.items, block("b2", "hand_tools", door.x, door.y, 10, 10)] });
    const r = collectIssues(doc);
    assert.ok(r.byId.b2.some(i => i.kind === "door" && /keep .* clear/.test(i.message)));
    assert.equal(r.issues[0].severity, "error");
  });
  test("issueLabel: 1 warning, 3 warnings, nothing for 0", () => {
    assert.equal(issueLabel(1), "1 warning"); assert.equal(issueLabel(3), "3 warnings"); assert.equal(issueLabel(0), "");
  });
});

/* ======================================================================= compare.js */
describe("compare: two layouts and the change list", () => {
  const A = normalizeDoc({ items: [...master.items, block("keep", "power_tools", 60, 40, 20, 20, { name: "Power Tools" }), block("gone", "hand_tools", 100, 40)], categories: [] });
  const B = normalizeDoc({ items: [...master.items.map(it => (it.type === "gondola" ? it : it)), block("keep", "power_tools", 64.5, 40, 20, 20, { name: "Power Tools" }), block("new", "bits_blades", 120, 50, 10, 10)],
    categories: [{ key: "c_seasonal", name: "Seasonal", color: "#db5471", family: "custom", subcats: [], notes: "", targetSqft: 100, hidden: false }] });
  const diff = compareDocs(A, B);
  test("rows grouped Added / Removed / Changed / Categories with plain-language text and keys", () => {
    const groups = rowGroups(diff);
    assert.deepEqual(groups.map(g => g.key), ["added", "removed", "changed", "category"]);
    const added = groups[0].rows[0], removed = groups[1].rows[0], changed = groups[2].rows[0], cat = groups[3].rows[0];
    assert.equal(rowKey(added), "i:new"); assert.equal(rowKey(cat), "c:c_seasonal");
    assert.match(changed.text, /Moved “Power Tools” 4'6" east/);
    assert.match(removed.text, /Removed department block/);
    assert.match(cat.text, /New category “Seasonal”/);
    assert.equal(kindIcon(added), "i-add"); assert.equal(kindIcon(removed), "i-minus"); assert.equal(kindIcon(changed), "i-pencil"); assert.equal(kindIcon(cat), "i-add");
    assert.equal(kindIcon({ group: "changed", kinds: ["rotated"] }), "i-rotate");
    assert.deepEqual(ghostOf(cat), { before: null, after: null });
    assert.equal(ghostOf(removed).after, null); assert.equal(ghostOf(added).before, null);
    const b = rowBounds(changed);
    assert.ok(b.x0 < 60 && b.x1 > 64.5 && Math.abs(b.cy - 40) < 1e-9);
    assert.equal(rowBounds(cat), null);
    assert.match(countText(diff, "the master map", "Dana's map"), /^4 differences in Dana's map from the master map/);
    assert.match(countText(compareDocs(A, A), "A", "B"), /^No differences/);
    // the sentence after the count starts capitalised even when the name is "the master map"
    assert.equal(countText(compareDocs(A, A), "the master map", "the master map"), "No differences. The master map matches the master map.");
    assert.equal(compareDocs(null, B), null);
  });
  test("state, pickers, who may apply and the error sentences", () => {
    const st = createCompare({ b: "m_1", layout: "nope" });
    assert.deepEqual(st, { a: "master", b: "m_1", layout: "side", selected: null });
    const opts = pickOptions({ mine: [{ id: "m_1", name: "Mine" }], team: [{ id: "m_2", name: "Theirs", ownerName: "Tom" }] }, { id: "m_3", name: "Open", mine: true });
    assert.deepEqual(opts.map(o => o.id), ["master", "m_1", "m_3", "m_2"]);
    assert.equal(opts[3].label, "Tom · Theirs"); assert.equal(opts[3].group, "Team maps");
    assert.equal(canApply({ isAdmin: true, a: "master", b: "m_1" }).ok, true);
    assert.equal(canApply({ isAdmin: false, a: "master", b: "m_1" }).ok, false);
    assert.match(canApply({ isAdmin: true, a: "m_1", b: "master" }).why, /master map on the left/);
    assert.match(canApply({ isAdmin: true, a: "master", b: "master" }).why, /Pick a map/);
    assert.match(applyErrorText(409), /changed since/); assert.match(applyErrorText(423), /locked/); assert.equal(applyErrorText(400, "Bad."), "Bad.");
  });
});

/* ======================================================================= advisor-ui.js */
describe("advisor-ui: fixes through the history, tones, bounds, the assumptions form", () => {
  test("fixEdits turns a Move into a patch that undoes; a missing item or empty fix is refused", () => {
    const doc = normalizeDoc({ items: [...master.items, block("pt", "power_tools", 60, 40)] });
    const apply = { op: "move", changes: [{ id: "pt", from: { x: 60, y: 40 }, to: { x: 70, y: 44 } }], text: "Move" };
    const r = fixEdits(doc, apply);
    assert.ok(!r.error); assert.deepEqual(r.ids, ["pt"]);
    const moved = r.doc.items.find(it => it.id === "pt");
    assert.equal(moved.x, 70); assert.equal(moved.y, 44); assert.equal(moved.cat, "power_tools");
    const back = applyPatch(r.doc, r.inverse).items.find(it => it.id === "pt");
    assert.equal(back.x, 60);
    assert.match(fixEdits(doc, { changes: [{ id: "zz", to: { x: 1 } }] }).error, /isn't on the map/);
    assert.match(fixEdits(doc, null).error, /no one-tap fix/);
    assert.match(fixEdits(doc, { changes: [{ id: "pt", to: { x: 60, y: 40 } }] }).error, /already/);
  });
  test("a real recommendation from the engine applies and the principle improves", () => {
    const door = master.items.find(it => /front\s*door/i.test(it.name || "")) || master.items.find(it => it.type === "door");
    const doc = normalizeDoc({ items: [...master.items, block("pt", "power_tools", door.x, door.y + 8, 16, 12)] });
    const r1 = analyse(doc, CATALOG, defaultConfig());
    const rec = r1.recommendations.find(x => x.principleId === "decompression" && x.apply);
    assert.ok(rec, "a Move out of the entrance zone is offered");
    const fixed = fixEdits(doc, rec.apply);
    assert.ok(!fixed.error);
    const r2 = analyse(fixed.doc, CATALOG, defaultConfig());
    const p1 = r1.principles.find(p => p.id === "decompression"), p2 = r2.principles.find(p => p.id === "decompression");
    assert.ok(p2.score > p1.score, `${p1.score} -> ${p2.score}`);
    const b = showBounds(rec.show, toLayout(doc));
    assert.ok(b && b.x1 > b.x0 && b.y1 > b.y0);
    assert.equal(showBounds(null), null); assert.equal(showBounds({ ids: ["nope"] }, toLayout(doc)), null);
  });
  test("score tones and overlay defaults", () => {
    assert.equal(scoreTone(null), "na"); assert.equal(scoreTone(95), "good"); assert.equal(scoreTone(60), "ok"); assert.equal(scoreTone(10), "poor");
    const d = defaultOverlays();
    assert.deepEqual(Object.keys(d), OVERLAYS.map(o => o.key));
    assert.equal(d.heat, true); assert.equal(d.sightlines, false);
  });
  test("configRows labels every number; buildConfig round-trips through the server's validation and rejects bad ranges", () => {
    const cfg = defaultConfig();
    const rows = configRows(cfg, CATALOG.areas);
    assert.equal(rows.thresholds.length, 10);
    assert.ok(rows.thresholds.every(t => t.label && Number.isFinite(t.value) && t.unit));
    assert.equal(rows.departments.find(d => d.key === "power_tools").margin, "high");
    assert.ok(rows.departments.every(d => d.assumption === true));
    assert.equal(rows.rules.length, 11); assert.ok(rows.rules.every(r => r.enabled && r.weight === 1 && r.why));
    assert.ok(rows.engine.length > 10 && rows.engine.every(e => e.label));
    const built = buildConfig(cfg, { thresholds: { aisleMinFt: 5 }, departments: { power_tools: { margin: "medium", theftProne: false } }, rules: { cold_corners: { enabled: false, weight: 2 } }, roles: { bulky: ["access_jobsite"] } });
    assert.ok(!built.error);
    const v = validateAdvisorConfig(built.config);
    assert.ok(v.ok, v.error);
    assert.equal(v.config.thresholds.aisleMinFt, 5);
    assert.equal(v.config.departments.power_tools.margin, "medium");
    assert.equal(v.config.rules.cold_corners.enabled, false); assert.equal(v.config.rules.cold_corners.weight, 2);
    assert.deepEqual(v.config.roles.bulky, ["access_jobsite"]);
    assert.equal(v.config.departments.bits_blades.margin, "high", "untouched departments keep their tier");
    assert.match(buildConfig(cfg, { thresholds: { aisleMinFt: 99 } }).error, /between 2 and 20/);
    assert.match(buildConfig(cfg, { rules: { adjacency: { weight: 9 } } }).error, /between 0 and 5/);
  });
});
