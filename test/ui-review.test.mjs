// Phase 4 front-end logic that runs without a DOM: proposal statuses and chips, the Review mode's helpers,
// the master-history lines, and the review mode wired into routes and modes.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { STATUS_INFO, statusInfo, FILTERS, filterProposals, proposalFor, chipFor, proposalLines, decisionLine, reviewErrorText, historyLines, restoreConfirmText, approveLabel, keepChecked } from "../public/js/core/review.js";
import { parseHash, buildHash, MODES } from "../public/js/core/route.js";
import { modeAllows, modeLayers, modeNotice, MODE_INFO } from "../public/js/core/modes.js";
import { rowKey } from "../public/js/core/compare.js";
import { diffMaps, changesFor } from "../public/js/core/diff.js";

const rel = () => "2 h ago";
const prop = (over = {}) => ({
  id: "p_1", mapId: "m_1", mapName: "Paint wall idea", ownerName: "Dana", mine: true, status: "submitted",
  note: "Moved paint", createdAt: 1000, decidedAt: null, decidedByName: null, decisionNote: null,
  appliedVersion: null, baseMasterVersion: 3, mapVersion: 7, itemCount: 12, ...over,
});

describe("review: statuses, filters and the open map's chip", () => {
  test("every status has a label, icon, tone and sentence; unknown falls back to withdrawn", () => {
    for (const s of ["submitted", "approved", "needs_changes", "declined", "withdrawn"]) {
      assert.ok(STATUS_INFO[s].label && STATUS_INFO[s].icon && STATUS_INFO[s].cls && STATUS_INFO[s].sentence, s);
      assert.equal(statusInfo(s), STATUS_INFO[s]);
    }
    assert.equal(statusInfo("??"), STATUS_INFO.withdrawn);
  });
  test("the filters cover open / all / each decided status", () => {
    const list = [prop(), prop({id: "p_2", status: "approved", decidedAt: 2000}), prop({id: "p_3", status: "declined", decidedAt: 3000}), prop({id: "p_4", status: "withdrawn"})];
    assert.deepEqual(filterProposals(list, "open").map(p => p.id), ["p_1"]);
    assert.equal(filterProposals(list, "all").length, 4);
    assert.deepEqual(filterProposals(list, "declined").map(p => p.id), ["p_3"]);
    assert.ok(FILTERS.some(f => f.key === "open") && FILTERS.some(f => f.key === "needs_changes"));
  });
  test("proposalFor picks the map's open proposal, else the newest decision, never a withdrawn one", () => {
    const open = prop(), oldOk = prop({id: "p_2", status: "approved", decidedAt: 500});
    assert.equal(proposalFor("m_1", [oldOk, open]), open);
    const newer = prop({id: "p_3", status: "declined", decidedAt: 900});
    assert.equal(proposalFor("m_1", [oldOk, newer]).id, "p_3");
    assert.equal(proposalFor("m_1", [prop({status: "withdrawn"})]), null);
    assert.equal(proposalFor("m_other", [open]), null);
  });
  test("the chip: nothing on the master or someone else's map; Submit for review on an own map; the status after", () => {
    assert.equal(chipFor({mine: false, master: true}, null), null);
    assert.equal(chipFor({mine: false, master: false}, null), null);
    assert.deepEqual(chipFor({mine: true, master: false}, null), {label: "Submit for review", icon: "i-review", cls: "none", open: false});
    const c = chipFor({mine: true, master: false}, prop());
    assert.deepEqual([c.label, c.cls, c.open], ["Submitted", "info", true]);
    assert.equal(chipFor({mine: true, master: false}, prop({status: "needs_changes", decidedAt: 1}))?.label, "Needs changes");
  });
  test("proposal rows and decision lines read like sentences", () => {
    assert.deepEqual(proposalLines(prop(), rel), {title: "Dana · Paint wall idea", meta: "Submitted · 2 h ago · 12 items"});
    assert.equal(proposalLines(prop({mapName: null}), rel).title, "Dana · Map deleted");
    assert.equal(decisionLine(prop(), rel), "");
    assert.equal(decisionLine(prop({status: "approved", decidedAt: 5, decidedByName: "AJ", appliedVersion: 9}), rel), "Approved by AJ · 2 h ago · master version 9");
  });
});

describe("review: errors, history and approve", () => {
  test("the error sentences: stale, locked, gone, offline, the server's own words", () => {
    assert.match(reviewErrorText(423), /locked/);
    assert.match(reviewErrorText(409, "Already decided."), /Already decided/);
    assert.match(reviewErrorText(409), /Reload/);
    assert.match(reviewErrorText(404), /isn't available/);
    assert.match(reviewErrorText(0), /connection/);
    assert.equal(reviewErrorText(400, "Bad changes."), "Bad changes.");
  });
  test("history rows: the note or the source, version meta, the Current tag; the restore confirm never deletes", () => {
    const v = {version: 7, createdAt: 1, createdByName: "AJ", sourceOwnerName: "Tom", note: "", itemCount: 150};
    const l = historyLines(v, 7, rel);
    assert.deepEqual([l.title, l.current], ["Changes from Tom's map", true]);
    assert.equal(l.meta, "Version 7 · AJ · 2 h ago · 150 items");
    assert.equal(historyLines({...v, note: "Paint reset"}, 9, rel).meta, "Version 7 · AJ · 2 h ago · 150 items · “Paint reset”");
    assert.equal(historyLines({...v, sourceOwnerName: null, note: "Paint reset"}, 9, rel).title, "Paint reset");
    assert.equal(historyLines({...v, sourceOwnerName: null}, 9, rel).title, "Saved directly");
    assert.match(restoreConfirmText({version: 5}, "Yesterday"), /version 5 \(Yesterday\)\? This saves a new master version; nothing is deleted\./);
  });
  test("the Approve button counts the ticked rows; keepChecked drops keys whose row went away", () => {
    assert.equal(approveLabel(0), "Approve without changes");
    assert.equal(approveLabel(1), "Approve: apply 1 change");
    assert.equal(approveLabel(3), "Approve: apply 3 changes");
    const rows = [{group: "added", id: "a"}, {group: "category", category: "c_x"}];
    const kept = keepChecked(new Set(["i:a", "i:gone", "c:c_x"]), rows, rowKey);
    assert.deepEqual([...kept].sort(), ["c:c_x", "i:a"]);
  });
  test("ticked rows -> the decision's changes payload, through the same diff the server applies", () => {
    const base = {items: [{id: "g1", type: "gondola", x: 10, y: 10, w: 8, d: 4}], categories: []};
    const snap = {items: [{id: "g1", type: "gondola", x: 20, y: 10, w: 8, d: 4}, {id: "b1", type: "area", cat: "power_tools", shape: "rect", x: 40, y: 20, w: 20, d: 20, h: 8}], categories: []};
    const diff = diffMaps(base, snap);
    assert.equal(diff.rows.length, 2);
    const one = changesFor(diff.rows.filter(r => r.id === "b1"));
    assert.deepEqual(one, [{id: "b1", action: "upsert"}]);
    const all = changesFor(diff.rows);
    assert.equal(all.length, 2);
  });
});

describe("review: the sixth mode", () => {
  test("review is an admin mode: in MODES, the hash, MODE_INFO (adminOnly) and modeAllows", () => {
    assert.ok(MODES.includes("review"));
    assert.equal(parseHash("#plan&review").mode, "review");
    assert.equal(buildHash({view: "plan", mode: "review", map: "master"}), "#plan&review&master");
    assert.equal(MODE_INFO.review.adminOnly, true);
    const a = modeAllows("review");
    assert.deepEqual([a.edit, a.select, a.panel, a.usesMaster], [false, false, "review", true]);
    assert.equal(modeLayers("review", {categories: false, fixtures: true}).categories, true);
    assert.match(modeNotice("review"), /proposal/i);
  });
});
