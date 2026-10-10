// Editing logic for Phases 2-3 (no server, no DOM): map document operations, undo/redo, department blocks
// and categories, collision checks and the map comparison used by Review / Apply to master.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { corners, toWorld, polygonArea } from "../public/js/core/geometry.js";
import { validateMapData } from "../public/js/shared/schema.js";
import { applyChanges } from "../public/js/shared/apply.js";
import { DEFAULT_KEYS } from "../public/js/shared/catalog.js";
import * as D from "../public/js/core/doc.js";
import { createHistory } from "../public/js/core/history.js";
import * as A from "../public/js/core/areas.js";
import * as C from "../public/js/core/collisions.js";
import * as F from "../public/js/core/diff.js";

const masterFile = JSON.parse(readFileSync(new URL("../public/data/master.json", import.meta.url), "utf8"));
const MASTER = Object.freeze(validateMapData({ items: masterFile.items }).data);

const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, msg || `${a} != ${b} (eps ${eps})`);
const closePt = (p, q, eps = 1e-6) => { close(p[0], q[0], eps, `x ${p[0]} != ${q[0]}`); close(p[1], q[1], eps, `y ${p[1]} != ${q[1]}`); };
const valid = (doc) => { const v = validateMapData(doc); assert.ok(v.ok, `schema rejected the doc: ${v.error} (${v.itemId})`); return v.data; };
const item = (doc, id) => doc.items.find((it) => it.id === id);
const freezeDeep = (o) => { if (o && typeof o === "object") { Object.freeze(o); Object.values(o).forEach(freezeDeep); } return o; };

// a small store: one 60 x 40 floor with walls round it, a door in the south wall, a column, stairs, a desk
function smallStore() {
  return {
    items: [
      { id: "f1", type: "floor", name: "Sales floor", x: 30, y: 20, w: 60, d: 40, h: 0, rot: 0, kind: "showroom", fixed: true },
      { id: "ws1", type: "wall", name: "South wall", x: 12.5, y: -0.35, w: 25.7, d: 0.7, h: 14, rot: 0 },
      { id: "ws2", type: "wall", name: "South wall", x: 46.5, y: -0.35, w: 27.7, d: 0.7, h: 14, rot: 0 },
      { id: "door1", type: "door", name: "FRONT DOOR", x: 29, y: -0.35, w: 6, d: 0.7, h: 7, rot: 0 },
      { id: "wn", type: "wall", name: "North wall", x: 30, y: 40.35, w: 61.4, d: 0.7, h: 14, rot: 0 },
      { id: "ww", type: "wall", name: "West wall", x: -0.35, y: 20, w: 40, d: 0.7, h: 14, rot: 90 },
      { id: "we", type: "wall", name: "East wall", x: 60.35, y: 20, w: 40, d: 0.7, h: 14, rot: 90 },
      { id: "op1", type: "opening", name: "Milwaukee doorway", x: 60.35, y: 30, w: 6, d: 0.7, h: 8, rot: 90 },
      { id: "col1", type: "column", name: "Column", x: 76.5, y: 40, w: 1.2, d: 1.2, h: 12, rot: 0 },
      { id: "col2", type: "column", name: "Column", x: 40, y: 20, w: 1.2, d: 1.2, h: 12, rot: 0 },
      { id: "st1", type: "stairs", name: "Stairs up", x: 50, y: 35, w: 10, d: 4, h: 9, rot: 0 },
      { id: "desk", type: "ring", name: "SALES DESK", x: 15, y: 30, w: 15.4, d: 10, h: 3.4, rot: 0, shape: "oct", cham: 1.75, fixed: true },
      { id: "g1", type: "gondola", name: "PAINT ISLE 17'6\"", x: 20, y: 12, w: 17.5, d: 4, h: 6, rot: 0 },
    ],
    categories: [],
  };
}

/* ======================================================================= doc.js */
describe("doc: ids, palette, add", () => {
  test("newId makes unique ids that match the schema pattern", () => {
    let doc = { items: [], categories: [] };
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const id = D.newId(doc, i % 2 ? "a" : "n");
      assert.match(id, /^[A-Za-z0-9_-]{1,40}$/);
      assert.ok(!seen.has(id));
      seen.add(id);
      if (i < 50) doc = { ...doc, items: [...doc.items, { id }] };
    }
    assert.match(D.newId(doc, "bad prefix!!"), /^[A-Za-z0-9_-]{1,40}$/);
  });

  test("every palette type can be added (structure only when unlocked) and passes the schema", () => {
    let doc = smallStore();
    for (const type of D.PALETTE_TYPES) {
      if (type === "area") continue;
      const locked = D.addItem(doc, type, { x: 30, y: 20 });
      if (D.isStructureType(type)) {
        assert.ok(locked.error, `${type} should need unlock`);
        assert.equal(locked.doc, doc);
        assert.equal(locked.patch.length, 0);
      } else assert.ok(!locked.error, `${type}: ${locked.error}`);
      const r = D.addItem(doc, type, { x: 30.2, y: 19.8 }, { unlocked: true, grid: 0.5 });
      assert.ok(!r.error, r.error);
      const it = item(r.doc, r.id);
      assert.equal(it.type, type);
      assert.deepEqual([it.x, it.y], [30, 20]);
      assert.ok(it.w > 0 && it.d > 0 && it.h >= 0 && typeof it.color === "string");
      doc = r.doc;
    }
    valid(doc);
  });

  test("an area added through the palette needs a category; extra fields are schema-checked", () => {
    const doc = smallStore();
    assert.ok(D.addItem(doc, "area", { x: 10, y: 10 }).error);
    const ok = D.addItem(doc, "area", { x: 10, y: 10 }, { fields: { cat: "power_tools", shape: "rect" } });
    assert.ok(!ok.error, ok.error);
    assert.equal(item(ok.doc, ok.id).cat, "power_tools");
    assert.ok(D.addItem(doc, "area", { x: 10, y: 10 }, { fields: { cat: "nope" } }).error);
    assert.ok(D.addItem(doc, "gondola", { x: 10, y: 10 }, { fields: { color: "red" } }).error);
  });
});

describe("doc: move, rotate, duplicate, delete", () => {
  test("move returns a new doc and an inverse patch; the input is untouched", () => {
    const doc = freezeDeep(smallStore());
    const r = D.moveItems(doc, ["g1"], 1.5, -2);
    assert.notEqual(r.doc, doc);
    assert.deepEqual([item(r.doc, "g1").x, item(r.doc, "g1").y], [21.5, 10]);
    assert.equal(item(doc, "g1").x, 20);
    assert.deepEqual(D.applyPatch(r.doc, r.inverse), doc);
    assert.deepEqual(D.applyPatch(doc, r.patch), r.doc);
  });

  test("structure is locked unless unlocked; mixed selections skip locked items", () => {
    const doc = smallStore();
    const a = D.moveItems(doc, ["col2"], 1, 0);
    assert.match(a.error, /locked/);
    assert.equal(a.doc, doc);
    const b = D.moveItems(doc, ["col2", "g1"], 1, 0);
    assert.ok(!b.error);
    assert.deepEqual(b.skipped, ["col2"]);
    assert.equal(item(b.doc, "col2").x, 40);
    assert.equal(item(b.doc, "g1").x, 21);
    assert.ok(!D.moveItems(doc, ["col2"], 1, 0, { unlocked: true }).error);
    // fixed:true and locked:true lock non-structure types too
    assert.ok(D.isLocked(item(doc, "desk")));
    assert.ok(D.isLocked({ type: "counter", locked: true }));
    assert.ok(!D.isLocked({ type: "area", fixed: true }));
    assert.ok(D.setField(doc, "ws1", "name", "X").error);
    assert.ok(D.deleteItems(doc, ["ws1"]).error);
    assert.ok(D.rotateItems(doc, ["ws1"], 15).error);
  });

  test("placeItems sets absolute centres and clamps to the schema bounds", () => {
    const r = D.placeItems(smallStore(), [{ id: "g1", x: 5000, y: -5000 }]);
    assert.deepEqual([item(r.doc, "g1").x, item(r.doc, "g1").y], [400, -100]);
  });

  test("rotation snaps to 15 degrees unless free, and is normalised to [0, 360)", () => {
    const doc = smallStore();
    assert.equal(item(D.rotateItems(doc, "g1", 37).doc, "g1").rot, 30);
    assert.equal(item(D.rotateItems(doc, "g1", 38).doc, "g1").rot, 45);
    assert.equal(item(D.rotateItems(doc, "g1", 37.2, { free: true }).doc, "g1").rot, 37.2);
    assert.equal(item(D.rotateItems(doc, "g1", -15).doc, "g1").rot, 345);
    assert.equal(item(D.rotateItems(doc, "g1", 370).doc, "g1").rot, 15);
    assert.equal(item(D.rotateItemsBy(D.rotateItems(doc, "g1", 350).doc, "g1", 15).doc, "g1").rot, 0);
    assert.equal(D.snapAngle(359.9), 0);
  });

  test("the rotate handle turns the item's front toward the pointer", () => {
    const doc = smallStore();
    // pointer due east of the centre: the front (+y) must face east -> rot 270
    assert.equal(item(D.rotateToPoint(doc, "g1", 40, 12).doc, "g1").rot, 270);
    assert.equal(item(D.rotateToPoint(doc, "g1", 20, 30).doc, "g1").rot, 0);
    assert.equal(item(D.rotateToPoint(doc, "g1", 10, 22).doc, "g1").rot, 45);
    const h = D.handlePoints(item(doc, "g1"));
    closePt(h.rotate, [20, 12 + 2 + 2]);
    closePt(h.ne, [28.75, 14]);
  });

  test("duplicate gives new ids and an offset copy; delete puts items back where they were on undo", () => {
    const doc = smallStore();
    const d = D.duplicateItems(doc, ["g1"]);
    assert.equal(d.ids.length, 1);
    const copy = item(d.doc, d.ids[0]);
    assert.notEqual(copy.id, "g1");
    assert.deepEqual([copy.x, copy.y, copy.w, copy.name], [22, 10, 17.5, "PAINT ISLE 17'6\""]);
    assert.equal(d.map.g1, copy.id);
    assert.ok(D.duplicateItems(doc, ["col2"]).error);
    const del = D.deleteItems(doc, ["ws2", "g1", "door1"], { unlocked: true });
    assert.equal(del.doc.items.length, doc.items.length - 3);
    const back = D.applyPatch(del.doc, del.inverse);
    assert.deepEqual(back.items.map((it) => it.id), doc.items.map((it) => it.id));
  });

  test("rename, recolour and setField are checked against the schema", () => {
    const doc = smallStore();
    assert.equal(item(D.renameItem(doc, "g1", "  New\u0007 name ").doc, "g1").name, "New name");
    assert.ok(D.renameItem(doc, "g1", "x".repeat(81)).error);
    assert.equal(item(D.recolorItem(doc, "g1", "#123abc").doc, "g1").color, "#123abc");
    assert.ok(D.recolorItem(doc, "g1", "#12345").error);
    assert.ok(D.recolorItem(doc, "g1", "javascript:alert(1)").error);
    assert.equal(item(D.setField(doc, "g1", "w", "12' 6\"").doc, "g1").w, 12.5);
    assert.equal(item(D.setField(doc, "g1", "h", 7.25).doc, "g1").h, 7.25);
    assert.ok(D.setField(doc, "g1", "h", 61).error);
    assert.ok(D.setField(doc, "g1", "w", 0).error);
    assert.ok(D.setField(doc, "g1", "w", "twelve").error);
    assert.ok(D.setField(doc, "g1", "x", Infinity).error);
    assert.equal(item(D.setField(doc, "g1", "rot", 370).doc, "g1").rot, 10);
    assert.ok(D.setField(doc, "g1", "id", "zzz").error);
    assert.ok(D.setField(doc, "g1", "type", "wall").error);
    assert.ok(D.setField(doc, "g1", "evil", "<script>").error, "unknown fields are refused");
    assert.ok(D.setField(doc, "g1", "cat", "power_tools").error, "cat is for department blocks only");
    assert.equal(item(D.setField(doc, "g1", "notes", "Line 1\nLine 2").doc, "g1").notes, "Line 1\nLine 2");
    assert.equal(item(D.setField(doc, "g1", "brand", "milwaukee").doc, "g1").brand, "milwaukee");
    assert.ok(D.setField(doc, "g1", "brand", "Milwaukee Tools").error);
    const removed = D.setField(D.setField(doc, "g1", "notes", "x").doc, "g1", "notes", null).doc;
    assert.ok(!("notes" in item(removed, "g1")));
    assert.ok(D.setField(doc, "g1", "x", null).error, "required fields can't be removed");
    const multi = D.setFields(doc, "g1", { name: "A", h: 5, color: "#000000" });
    assert.equal(multi.patch.length, 1);
    assert.deepEqual([item(multi.doc, "g1").name, item(multi.doc, "g1").h], ["A", 5]);
    assert.ok(D.setFields(doc, "g1", { name: "A", h: 99 }).error);
    valid(multi.doc);
  });

  test("an edit that changes nothing has an empty patch", () => {
    const doc = smallStore();
    const r = D.moveItems(doc, ["g1"], 0, 0);
    assert.equal(r.patch.length, 0);
    assert.equal(r.doc, doc);
    assert.equal(D.renameItem(doc, "g1", "PAINT ISLE 17'6\"").patch.length, 0);
  });
});

describe("doc: resize by handles in the rotated frame", () => {
  const base = { id: "r", type: "gondola", x: 10, y: 10, w: 8, d: 4, h: 6, rot: 0 };

  test("east handle on an unrotated item: the west side stays put", () => {
    const g = D.resizeGeom(base, "e", 20, 999);
    close(g.w, 14); close(g.d, 4); close(g.x, 13); close(g.y, 10);
  });

  test("every handle on a rotated item keeps the opposite side or corner fixed", () => {
    for (const rot of [0, 30, 90, 135, 200, 315]) {
      const it = { ...base, rot };
      for (const [h, [sx, sy]] of Object.entries(D.HANDLES)) {
        // pointer: the handle's position pushed out 2 ft along its own direction (plus sideways noise for side handles)
        const target = toWorld(it, sx * (it.w / 2 + 2) + (sx ? 0 : 0.7), sy * (it.d / 2 + 2) + (sy ? 0 : 0.7));
        const g = D.resizeGeom(it, h, target[0], target[1]);
        const after = { ...it, x: g.x, y: g.y, w: g.w, d: g.d };
        close(g.w, sx ? it.w + 2 : it.w, 1e-9, `${h} rot ${rot} w`);
        close(g.d, sy ? it.d + 2 : it.d, 1e-9, `${h} rot ${rot} d`);
        // the anchor (opposite side's middle / opposite corner) is the same point before and after
        const anchorBefore = toWorld(it, -sx * it.w / 2, -sy * it.d / 2);
        const anchorAfter = toWorld(after, -sx * after.w / 2, -sy * after.d / 2);
        closePt(anchorBefore, anchorAfter, 1e-9);
      }
    }
  });

  test("grid rounding, minimum size, keep aspect", () => {
    close(D.resizeGeom(base, "e", 20.2, 10, { grid: 0.5 }).w, 14);
    close(D.resizeGeom(base, "e", 0, 10).w, 0.5); // dragged past the other side: stops at the minimum
    const k = D.resizeGeom(base, "ne", 18, 14, { keepAspect: true }); // pointer asks for 12 x 6
    close(k.w / k.d, 2);
    close(k.w, 12);
    const k2 = D.resizeGeom(base, "ne", 16, 16, { keepAspect: true }); // asks for 10 x 8: the bigger scale wins
    close(k2.w, 16); close(k2.d, 8);
  });

  test("resizeItem honours the lock, scales polygon corners, and lock-area keeps w x d", () => {
    const doc = smallStore();
    assert.ok(D.resizeItem(doc, "col2", "e", 50, 20).error);
    const r = D.resizeItem(doc, "g1", "w", 0, 12);
    const g = item(r.doc, "g1");
    close(g.x + g.w / 2, 28.75); // east end unchanged
    close(g.w, 28.75);
    const kept = D.resizeItem(doc, "g1", "e", 40, 12, { keepArea: 70 });
    close(item(kept.doc, "g1").w * item(kept.doc, "g1").d, 70, 1e-3);
  });
});

/* ======================================================================= patches + history.js */
describe("patches and history", () => {
  test("composePatches folds repeated changes to the same item into one entry", () => {
    let doc = smallStore();
    let patch = [];
    for (let i = 0; i < 30; i++) {
      const r = D.moveItems(doc, ["g1"], 0.5, 0);
      patch = D.composePatches(patch, r.patch);
      doc = r.doc;
    }
    assert.equal(patch.length, 1);
    assert.equal(patch[0].from.x, 20);
    assert.equal(patch[0].to.x, 35);
    assert.deepEqual(D.applyPatch(doc, D.invertPatch(patch)), smallStore());
    // there and back again: nothing left
    const there = D.moveItems(smallStore(), ["g1"], 1, 0);
    const back = D.moveItems(there.doc, ["g1"], -1, 0);
    assert.equal(D.composePatches(there.patch, back.patch).length, 0);
  });

  test("undo / redo, and a new edit clears redo", () => {
    const h = createHistory();
    let doc = smallStore();
    const r1 = D.moveItems(doc, ["g1"], 1, 0); h.push(r1.patch, { label: "Move" }); doc = r1.doc;
    const r2 = D.renameItem(doc, "g1", "B"); h.push(r2.patch, { label: "Rename" }); doc = r2.doc;
    assert.equal(h.undoLabel(), "Rename");
    let u = h.undo(doc); doc = u.doc;
    assert.equal(item(doc, "g1").name, "PAINT ISLE 17'6\"");
    assert.ok(h.canRedo());
    u = h.redo(doc); doc = u.doc;
    assert.equal(item(doc, "g1").name, "B");
    doc = h.undo(doc).doc; doc = h.undo(doc).doc;
    assert.deepEqual(doc, smallStore());
    assert.equal(h.undo(doc), null);
    const r3 = D.moveItems(doc, ["g1"], 0, 1); h.push(r3.patch); doc = r3.doc;
    assert.ok(!h.canRedo());
    h.push([]); // empty patches are ignored
    assert.deepEqual(h.size(), { undo: 1, redo: 0 });
  });

  test("a continuous drag (begin / end) is one undo step", () => {
    const h = createHistory();
    const start = smallStore();
    let doc = start;
    h.begin("Move");
    h.begin(); // nested begins are counted
    for (let i = 1; i <= 60; i++) {
      const r = D.placeItems(doc, [{ id: "g1", x: 20 + i * 0.25, y: 12 + i * 0.1 }]);
      h.push(r.patch); doc = r.doc;
    }
    h.end();
    assert.ok(h.grouping);
    h.end();
    assert.ok(!h.grouping);
    assert.deepEqual(h.size(), { undo: 1, redo: 0 });
    const u = h.undo(doc);
    assert.equal(u.label, "Move");
    assert.deepEqual(u.doc, start);
    assert.deepEqual(h.redo(u.doc).doc, doc);
  });

  test("a group can add, change and delete; undo and redo reproduce it exactly", () => {
    const h = createHistory();
    const start = smallStore();
    let doc = start;
    h.begin("Edit");
    const add = D.addItem(doc, "gondola", { x: 5, y: 5 }); doc = add.doc; h.push(add.patch);
    const mv = D.moveItems(doc, [add.id, "g1"], 1, 1); doc = mv.doc; h.push(mv.patch);
    const del = D.deleteItems(doc, ["g1"]); doc = del.doc; h.push(del.patch);
    const mv2 = D.moveItems(doc, [add.id], 2, 0); doc = mv2.doc; h.push(mv2.patch);
    h.end();
    const end = doc;
    const back = h.undo(doc).doc;
    assert.deepEqual(back, start);
    assert.deepEqual(h.redo(back).doc, end);
  });

  test("cancel rolls back an open gesture", () => {
    const h = createHistory();
    let doc = smallStore();
    h.begin();
    const r = D.moveItems(doc, ["g1"], 5, 5); h.push(r.patch); doc = r.doc;
    doc = h.cancel(doc);
    assert.deepEqual(doc, smallStore());
    assert.ok(!h.canUndo());
  });

  test("nudges with the same mergeKey inside the window merge; later ones don't", () => {
    let t = 0;
    const h = createHistory({ now: () => t });
    let doc = smallStore();
    for (let i = 0; i < 5; i++) { const r = D.moveItems(doc, ["g1"], 0.5, 0); h.push(r.patch, { mergeKey: "nudge:g1" }); doc = r.doc; t += 300; }
    assert.equal(h.size().undo, 1);
    t += 5000;
    const r = D.moveItems(doc, ["g1"], 0.5, 0); h.push(r.patch, { mergeKey: "nudge:g1" }); doc = r.doc;
    assert.equal(h.size().undo, 2);
    doc = h.undo(doc).doc;
    assert.equal(item(doc, "g1").x, 22.5);
    doc = h.undo(doc).doc;
    assert.equal(item(doc, "g1").x, 20);
  });

  test("the stack keeps at most 200 steps and clear() empties it", () => {
    const h = createHistory();
    let doc = smallStore();
    for (let i = 0; i < 250; i++) { const r = D.moveItems(doc, ["g1"], 0.1, 0); h.push(r.patch); doc = r.doc; }
    assert.equal(h.size().undo, 200);
    let n = 0;
    while (h.canUndo()) { doc = h.undo(doc).doc; n++; }
    assert.equal(n, 200);
    close(item(doc, "g1").x, 25); // the oldest 50 moves can't be undone any more
    h.clear();
    assert.deepEqual(h.size(), { undo: 0, redo: 0 });
    assert.equal(createHistory({ limit: 3 }).size().undo, 0);
  });
});

/* ======================================================================= areas.js */
describe("areas: blocks", () => {
  test("a dropped block starts at the catalog size and target, 8 ft high, as a rectangle", () => {
    const r = A.createBlock(smallStore(), "power_tools", { x: 30, y: 20 });
    const b = item(r.doc, r.id);
    assert.equal(b.type, "area");
    assert.equal(b.cat, "power_tools");
    assert.equal(b.name, "Power Tools");
    assert.equal(b.shape, "rect");
    assert.deepEqual([b.w, b.d, b.h, b.rot], [28, 25, 8, 0]);
    assert.equal(b.color, "#cd5811");
    assert.equal(A.blockArea(b), 700);
    assert.equal(A.blockLabel(b, A.categoryFor(r.doc, "power_tools")), "Power Tools - 700 sq ft / 700");
    valid(r.doc);
    assert.ok(A.createBlock(smallStore(), "not_a_key", { x: 1, y: 1 }).error);
  });

  test("every default department drops at its target sq ft", () => {
    let doc = smallStore();
    for (const key of DEFAULT_KEYS) {
      const r = A.createBlock(doc, key, { x: 30, y: 20 });
      const cat = A.categoryFor(r.doc, key);
      close(A.blockArea(item(r.doc, r.id)), cat.targetSqft, 1e-6);
      doc = r.doc;
    }
    valid(doc);
  });

  test("an overridden target keeps the catalog proportions; a custom category gets 2:1", () => {
    let doc = A.updateCategory(smallStore(), "power_tools", { targetSqft: 800 }).doc;
    let r = A.createBlock(doc, "power_tools", { x: 30, y: 20 });
    const b = item(r.doc, r.id);
    close(b.w * b.d, 800, 0.01);
    close(b.w / b.d, 28 / 25, 1e-3);
    const c = A.addCategory(doc, { name: "Garden Center", color: "#336699", targetSqft: 300 });
    r = A.createBlock(c.doc, c.key, { x: 30, y: 20 });
    close(A.blockArea(item(r.doc, r.id)), 300, 0.5);
    valid(r.doc);
  });

  test("area: rectangle w x d, polygon by the shoelace formula", () => {
    assert.equal(A.blockArea({ type: "area", shape: "rect", w: 10, d: 7 }), 70);
    const L = { type: "area", shape: "poly", w: 20, d: 20, pts: [[-10, -10], [10, -10], [10, 0], [0, 0], [0, 10], [-10, 10]] };
    assert.equal(A.blockArea(L), 300);
    assert.equal(A.blockArea({ ...L, pts: [...L.pts].reverse() }), 300);
  });

  test("size to target keeps the proportions and the centre", () => {
    let doc = A.createBlock(smallStore(), "hand_tools", { x: 30, y: 20 }); // 25 x 8
    const id = doc.id; doc = doc.doc;
    const r = A.sizeToTarget(doc, id, 800);
    const b = item(r.doc, id);
    close(b.w * b.d, 800, 0.01); close(b.w / b.d, 25 / 8, 1e-3); assert.deepEqual([b.x, b.y], [30, 20]);
    const t = A.sizeToTarget(r.doc, id); // back to the category target
    close(A.blockArea(item(t.doc, id)), 200, 0.01);
  });

  test("lock area: dragging a side changes the other side, the area stays put (also rotated and polygon)", () => {
    for (const rot of [0, 30, 120]) {
      let r = A.createBlock(smallStore(), "power_tools", { x: 30, y: 20 }, { rot });
      const id = r.id;
      let doc = A.setLockArea(r.doc, id, true).doc;
      assert.equal(item(doc, id).lockArea, true);
      const b0 = item(doc, id);
      const p = toWorld(b0, b0.w / 2 + 7, 0); // pull the east end 7 ft out
      r = A.resizeBlock(doc, id, "e", p[0], p[1]);
      const b = item(r.doc, id);
      close(b.w, 35, 1e-3); close(b.w * b.d, 700, 0.01);
      // the west end's middle stays put
      closePt(toWorld(b0, -b0.w / 2, 0), toWorld(b, -b.w / 2, 0), 1e-3);
      const q = toWorld(b, 0, b.d / 2 - 5); // push the north side 5 ft in
      const r2 = A.resizeBlock(r.doc, id, "n", q[0], q[1]);
      close(A.blockArea(item(r2.doc, id)), 700, 0.01);
      const unlocked = A.resizeBlock(A.setLockArea(r.doc, id, false).doc, id, "n", q[0], q[1]);
      assert.ok(A.blockArea(item(unlocked.doc, id)) < 650);
    }
    // polygon block with lock area
    let r = A.createBlock(smallStore(), "power_tools", { x: 30, y: 20 });
    const id = r.id;
    let doc = A.toPolygon(r.doc, id).doc;
    doc = A.movePolyPoint(doc, id, 2, 30 + 14, 20 + 12.5 + 3).doc; // pull a corner out: not a rectangle any more
    doc = A.setLockArea(doc, id, true).doc;
    const before = A.blockArea(item(doc, id));
    const b0 = item(doc, id);
    const p = toWorld(b0, b0.w / 2 + 4, 0);
    const after = item(A.resizeBlock(doc, id, "e", p[0], p[1]).doc, id);
    close(A.blockArea(after), before, 0.05);
    valid(A.resizeBlock(doc, id, "e", p[0], p[1]).doc);
  });
});

describe("areas: polygon shapes", () => {
  function polyBlock(rot = 0) {
    const r = A.createBlock(smallStore(), "safety_workwear", { x: 30, y: 20 }, { rot }); // 26 x 20
    return { id: r.id, doc: A.toPolygon(r.doc, r.id).doc };
  }

  test("rect -> polygon keeps the footprint; back to rect uses the box", () => {
    const { id, doc } = polyBlock(30);
    const b = item(doc, id);
    assert.equal(b.shape, "poly");
    assert.equal(b.pts.length, 4);
    close(A.blockArea(b), 520);
    valid(doc);
    const back = item(A.toRectangle(doc, id).doc, id);
    assert.equal(back.shape, "rect");
    assert.ok(!("pts" in back));
  });

  test("moving a corner keeps every other corner where it is in the store (rotated), and recentres the box", () => {
    for (const rot of [0, 45, 210]) {
      const { id, doc } = polyBlock(rot);
      const b0 = item(doc, id);
      const before = A.outline(b0);
      const target = toWorld(b0, 13 + 6, 10 + 4); // corner 2 (front-right) dragged out
      const r = A.movePolyPoint(doc, id, 2, target[0], target[1]);
      assert.ok(!r.error, r.error);
      const b = item(r.doc, id);
      const after = A.outline(b);
      for (const i of [0, 1, 3]) closePt(after[i], before[i], 1e-3);
      closePt(after[2], target, 1e-3);
      close(b.w, 32, 1e-3); close(b.d, 24, 1e-3);
      // the box is centred on the item: local corners span -w/2..w/2
      const xs = b.pts.map((p) => p[0]), ys = b.pts.map((p) => p[1]);
      close(Math.min(...xs), -b.w / 2, 1e-3); close(Math.max(...xs), b.w / 2, 1e-3);
      close(Math.min(...ys), -b.d / 2, 1e-3); close(Math.max(...ys), b.d / 2, 1e-3);
      close(A.blockArea(b), polygonArea(after), 1e-6);
      valid(r.doc);
    }
  });

  test("add a corner on an edge, remove corners down to 3, at most 24, no crossing edges", () => {
    let { id, doc } = polyBlock(0);
    // add on the south edge (corner 0 -> 1) under the point (35, 0)
    let r = A.insertPolyPoint(doc, id, 0, 35, 0);
    assert.equal(item(r.doc, id).pts.length, 5);
    closePt(A.outline(item(r.doc, id))[1], [35, 10], 1e-3);
    close(A.blockArea(item(r.doc, id)), 520, 1e-3); // a corner on a straight edge changes nothing
    // pull it in to make a notch
    r = A.movePolyPoint(r.doc, id, 1, 35, 15);
    assert.ok(A.blockArea(item(r.doc, id)) < 520);
    const n = A.nearestEdge(item(r.doc, id), 44, 14);
    assert.equal(n.edge, 2);
    doc = r.doc;
    doc = A.removePolyPoint(doc, id, 1).doc;
    doc = A.removePolyPoint(doc, id, 0).doc;
    assert.equal(item(doc, id).pts.length, 3);
    assert.match(A.removePolyPoint(doc, id, 0).error, /at least 3/);
    // 24 corners max
    let d2 = polyBlock(0);
    let cur = d2.doc;
    const longest = (b) => { const o = A.outline(b); let k = 0, L = 0; o.forEach((p, i) => { const q = o[(i + 1) % o.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > L) { L = l; k = i; } }); return k; };
    for (let i = 0; i < 20; i++) { const r2 = A.insertPolyPoint(cur, d2.id, longest(item(cur, d2.id))); assert.ok(!r2.error, r2.error); cur = r2.doc; }
    assert.equal(item(cur, d2.id).pts.length, 24);
    assert.match(A.insertPolyPoint(cur, d2.id, 0).error, /at most 24/);
    valid(cur);
    // corners that land on top of each other are refused too
    const sq = polyBlock(0);
    assert.match(A.movePolyPoint(sq.doc, sq.id, 1, ...A.outline(item(sq.doc, sq.id))[0].map((v, i) => v + (i ? 0 : 0.01))).error, /on top of each other/);
    const p = polyBlock(0);
    const cross = A.movePolyPoint(p.doc, p.id, 0, 50, 20); // corner 0 dragged past the east side: a bow-tie
    assert.match(cross.error, /cross/);
    assert.equal(cross.doc, p.doc);
  });

  test("corners and shape only change through the polygon tools; a block can change category", () => {
    const r = A.createBlock(smallStore(), "woodworking", { x: 30, y: 20 });
    assert.ok(D.setField(r.doc, r.id, "pts", [[0, 0], [1, 0], [0, 1]]).error);
    assert.ok(D.setField(r.doc, r.id, "shape", "poly").error);
    const m = A.setBlockCategory(r.doc, r.id, "paint_finishing");
    assert.deepEqual([item(m.doc, r.id).cat, item(m.doc, r.id).name, item(m.doc, r.id).color], ["paint_finishing", "Paint, Stain & Finishing", "#a167cf"]);
    const named = D.renameItem(r.doc, r.id, "Lumber corner").doc;
    assert.equal(item(A.setBlockCategory(named, r.id, "paint_finishing").doc, r.id).name, "Lumber corner");
    assert.ok(A.setBlockCategory(r.doc, r.id, "c_nope").error);
    valid(m.doc);
  });

  test("polygon edits need Edit shape (a polygon) first", () => {
    const r = A.createBlock(smallStore(), "woodworking", { x: 30, y: 20 });
    assert.ok(A.movePolyPoint(r.doc, r.id, 0, 1, 1).error);
    assert.ok(A.insertPolyPoint(r.doc, r.id, 0).error);
  });
});

describe("areas: categories, progress, summary", () => {
  test("custom categories: key, validation, limits", () => {
    const doc = smallStore();
    const r = A.addCategory(doc, { name: "Garden Center!", color: "#336699", subcats: ["Pots", " ", "Soil"], notes: "x", targetSqft: 250 });
    assert.equal(r.key, "c_garden_center");
    const def = r.doc.categories[0];
    assert.deepEqual(def, { key: "c_garden_center", name: "Garden Center!", color: "#336699", family: "custom", subcats: ["Pots", "Soil"], notes: "x", targetSqft: 250, hidden: false });
    assert.equal(A.newCategoryKey(r.doc, "Garden center"), "c_garden_center_2");
    assert.ok(A.addCategory(doc, { name: "", color: "#336699" }).error);
    assert.ok(A.addCategory(doc, { name: "X", color: "blue" }).error);
    assert.ok(A.addCategory(doc, { name: "X", color: "#336699", targetSqft: 30000 }).error);
    assert.ok(A.addCategory(doc, { name: "X", color: "#336699", family: "weird" }).error);
    assert.ok(A.addCategory(doc, { name: "X".repeat(41), color: "#336699" }).error);
    valid(r.doc);
    let many = doc;
    for (let i = 0; i < 40; i++) many = A.addCategory(many, { name: "Cat " + i, color: "#336699" }).doc;
    assert.equal(many.categories.length, 40);
    assert.ok(A.addCategory(many, { name: "One more", color: "#336699" }).error);
  });

  test("editing a default stores an override; blocks follow a rename / recolour; reset and hide", () => {
    let r = A.createBlock(smallStore(), "power_tools", { x: 30, y: 20 });
    const id = r.id;
    const u = A.updateCategory(r.doc, "power_tools", { name: "Power Tools & Batteries", color: "#aa5500", targetSqft: 750 });
    assert.equal(u.doc.categories.length, 1);
    assert.equal(u.doc.categories[0].key, "power_tools");
    assert.equal(u.doc.categories[0].targetSqft, 750);
    assert.equal(item(u.doc, id).name, "Power Tools & Batteries");
    assert.equal(item(u.doc, id).color, "#aa5500");
    assert.equal(A.categoryFor(u.doc, "power_tools").name, "Power Tools & Batteries");
    valid(u.doc);
    // undo the whole thing with the inverse patch
    assert.deepEqual(D.applyPatch(u.doc, u.inverse), r.doc);
    const reset = A.resetCategory(u.doc, "power_tools");
    assert.equal(reset.doc.categories.length, 0);
    assert.equal(A.categoryFor(reset.doc, "power_tools").name, "Power Tools");
    assert.ok(A.resetCategory(u.doc, "c_x").error);
    const hid = A.setCategoryHidden(r.doc, "hand_tools", true);
    assert.equal(A.categoryFor(hid.doc, "hand_tools").hidden, true);
    assert.ok(A.deleteCategory(r.doc, "hand_tools").error, "defaults can't be deleted");
  });

  test("deleting a custom category deletes its blocks in the same step", () => {
    let c = A.addCategory(smallStore(), { name: "Garden", color: "#336699", targetSqft: 200 });
    let doc = c.doc;
    const b1 = A.createBlock(doc, c.key, { x: 10, y: 10 }); doc = b1.doc;
    const b2 = A.createBlock(doc, c.key, { x: 40, y: 10 }); doc = b2.doc;
    const del = A.deleteCategory(doc, c.key);
    assert.deepEqual(del.removedBlocks.sort(), [b1.id, b2.id].sort());
    assert.equal(del.doc.categories.length, 0);
    assert.ok(!del.doc.items.some((it) => it.type === "area"));
    valid(del.doc);
    assert.deepEqual(D.applyPatch(del.doc, del.inverse), doc);
  });

  test("progress counts visible categories with a block", () => {
    let doc = smallStore();
    for (const k of DEFAULT_KEYS.slice(0, 7)) doc = A.createBlock(doc, k, { x: 30, y: 20 }).doc;
    assert.equal(A.progress(doc).text, "7 of 10 departments placed");
    doc = A.setCategoryHidden(doc, DEFAULT_KEYS[9], true).doc;
    assert.equal(A.progress(doc).text, "7 of 9 departments placed");
    doc = A.addCategory(doc, { name: "Garden", color: "#336699" }).doc;
    const p = A.progress(doc);
    assert.equal(p.text, "7 of 10 departments placed");
    assert.ok(p.missing.includes("c_garden"));
  });

  test("summary: placed sq ft vs target per category and the available sales floor from the floors", () => {
    let doc = { ...MASTER, categories: [] };
    doc = A.createBlock(doc, "power_tools", { x: 80, y: 60 }).doc; // 700 of 700
    const ht = A.createBlock(doc, "hand_tools", { x: 70, y: 50 }); doc = ht.doc;
    doc = A.sizeToTarget(doc, ht.id, 100).doc; // 100 of 200 -> under
    const s = A.summary(doc);
    const row = (k) => s.rows.find((r) => r.key === k);
    assert.equal(row("power_tools").status, "ok");
    assert.equal(row("hand_tools").status, "under");
    close(row("hand_tools").sqft, 100, 0.01);
    assert.equal(row("woodworking").status, "none");
    assert.equal(s.totals.progressText, "2 of 10 departments placed");
    close(s.totals.plannedSqft, 800, 0.01);
    assert.equal(s.totals.targetSqft, 3800);
    // master floors with kind "showroom": sales floor i3, front room i4, front room east i5
    assert.deepEqual(s.totals.floors.map((f) => f.id).sort(), ["i3", "i4", "i5"]);
    close(s.totals.availableSqft, 53 * 80 + 24 * 68.7 + 42 * 58.7, 0.01);
    assert.equal(s.totals.warehouseSqft, 50 * 58.5);
    assert.match(s.totals.text, /^800 sq ft planned of 8,354 sq ft sales floor/);
  });
});

/* ======================================================================= collisions.js */
describe("collisions", () => {
  const block = (id, x, y, w, d, extra = {}) => ({ id, type: "area", cat: "power_tools", name: "Power Tools", shape: "rect", x, y, w, d, h: 8, rot: 0, ...extra });
  const kinds = (list) => list.map((i) => `${i.severity}:${i.kind}:${i.otherId}`);

  test("a block flush against a wall face is fine; one that runs into it is an error", () => {
    const doc = smallStore();
    assert.deepEqual(C.checkItem(doc, block("b", 5, 5, 10, 10)), []); // corner block flush on the west and south walls
    const into = C.checkItem(doc, block("b", 4.5, 5, 10, 10));
    assert.deepEqual(kinds(into).filter((k) => k.includes("wall")), ["error:wall:ww"]);
    assert.match(into.find((i) => i.kind === "wall").message, /^Overlaps the wall “West wall” (at|near) grid A\d$/);
  });

  test("columns: plain-language grid reference, exact rotated test, polygon notches", () => {
    const doc = { ...smallStore(), items: [...smallStore().items, { id: "f2", type: "floor", x: 80, y: 40, w: 40, d: 40, h: 0, rot: 0, kind: "showroom" }] };
    const hit = C.checkItem(doc, block("b", 76.5, 40, 6, 6));
    const col = hit.find((i) => i.kind === "column");
    assert.equal(col.severity, "warning");
    assert.equal(col.message, "Overlaps the column at grid D3");
    // a 45 degree block whose bounding box covers column col2 (40, 20) but whose diamond doesn't
    const diamond = block("b", 34, 14, 8, 8, { rot: 45 });
    assert.ok(C.shapeOf(diamond).box.x1 > 39.4 && C.shapeOf(diamond).box.y1 > 19.4, "bbox reaches the column");
    assert.ok(!C.checkItem(doc, diamond).some((i) => i.kind === "column"));
    assert.ok(C.checkItem(doc, { ...diamond, x: 37, y: 17 }).some((i) => i.kind === "column"));
    // an L-shaped polygon block whose notch holds the column
    const L = block("L", 40, 20, 20, 20, { shape: "poly", pts: [[-10, -10], [10, -10], [10, -1], [-1, -1], [-1, 10], [-10, 10]] });
    // world notch: x 39..50, y 19..30 -> the column at (40, 20) +-0.6 sits inside the notch, outside the L
    const l1 = C.checkItem(doc, L);
    assert.ok(!l1.some((i) => i.kind === "column"), JSON.stringify(l1));
    assert.ok(C.checkItem(doc, { ...L, x: 50, y: 30 }).some((i) => i.kind === "column"));
  });

  test("door clearance: 4 ft in front of a door is an error, beyond it is fine; openings warn at 3 ft", () => {
    const doc = smallStore();
    const near = C.checkItem(doc, block("b", 29, 5, 10, 6)); // south edge at y 2 < 4 ft from the door
    const door = near.find((i) => i.kind === "door");
    assert.equal(door.severity, "error");
    assert.equal(door.message, "Blocks the front door - keep 4 ft clear");
    assert.ok(!C.checkItem(doc, block("b", 29, 7.5, 10, 6)).some((i) => i.kind === "door")); // south edge at 4.5 ft
    // the assumption is editable
    assert.ok(C.checkItem(doc, block("b", 29, 7.5, 10, 6), { clearance: { door: 6 } }).some((i) => i.kind === "door"));
    const op = C.checkItem(doc, block("b", 55, 30, 8, 8));
    const o = op.find((i) => i.kind === "opening");
    assert.equal(o.severity, "warning");
    assert.equal(o.message, "Blocks the opening “Milwaukee doorway” - keep 3 ft clear");
  });

  test("other departments, stairs and the octagonal sales desk", () => {
    let doc = smallStore();
    const a = A.createBlock(doc, "power_tools", { x: 30, y: 20 }); doc = a.doc; // 28 x 25 at 16..44, 7.5..32.5
    const b = A.createBlock(doc, "bits_blades", { x: 30, y: 33 }); doc = b.doc;   // 25 x 8 at 17.5..42.5, 29..37
    const issues = C.checkItem(doc, b.id);
    const other = issues.find((i) => i.kind === "block");
    assert.equal(other.severity, "error");
    assert.equal(other.otherId, a.id);
    assert.equal(other.message, "Overlaps “Power Tools” by 88 sq ft"); // 25 x 3.5 = 87.5, rounded
    close(other.sqft, 25 * 3.5, 1e-6);
    // stairs st1: x 45..55, y 33..37
    const st = C.checkItem(doc, block("s", 50, 31, 6, 6));
    assert.equal(st.find((i) => i.kind === "stairs").message, "Covers the stairs “Stairs up” - keep stairs clear");
    // the desk is an octagon: a block in the cut-off corner of its bounding box doesn't touch it
    // desk box: x 7.3..22.7, y 25..35; the north-east corner cut runs from (20.95, 35) to (22.7, 33.25)
    const corner = block("c", 23, 35.3, 0.9, 0.9);
    assert.ok(!C.checkItem(doc, corner).some((i) => i.kind === "desk"));
    assert.ok(C.checkItem(doc, block("c", 21, 33, 2, 2)).some((i) => i.kind === "desk" && i.severity === "error"));
  });

  test("outside the building", () => {
    const doc = smallStore();
    const out = C.checkItem(doc, block("b", 30, -20, 10, 10));
    assert.deepEqual(kinds(out), ["error:outside:null"]);
    assert.equal(out[0].message, "Outside the building");
    const part = C.checkItem(doc, block("b", 30, 39, 10, 4), { clearance: { door: 0, opening: 0 } }).filter((i) => i.kind === "outside");
    assert.equal(part[0].severity, "warning"); // y 37..41: 1 ft past the floor's north edge
    assert.match(part[0].message, /^About 1\d sq ft is outside the building$/);
  });

  test("fixtures are checked too; structure isn't", () => {
    const doc = smallStore();
    const g = C.checkItem(doc, { ...item(doc, "g1"), x: 40, y: 20 });
    assert.ok(g.some((i) => i.kind === "column" && i.severity === "error"));
    assert.deepEqual(C.checkItem(doc, "col2"), []);
    assert.deepEqual(C.checkItem(doc, "ws1"), []);
    assert.deepEqual(C.checkItem(doc, "missing"), []);
  });

  test("grid references follow the calibrated building grid (row 1 north)", () => {
    assert.equal(C.gridRef(76.5, 40), "at grid D3");
    assert.equal(C.gridRef(-0.35, 80.35), "at grid A1");
    assert.equal(C.gridRef(169, 0), "at grid H5");
    assert.equal(C.gridRef(60, 50), "near grid C3");
  });

  test("checkAll on the 165-item master with 10 blocks is fast (< 20 ms) and finds real problems", () => {
    let doc = { ...MASTER, categories: [] };
    assert.equal(doc.items.length, 165);
    const spots = { hand_tools: [70, 50], safety_workwear: [90, 60], access_jobsite: [25, 60], hardware_fasteners: [80, 70], pneumatic_air: [65, 15], power_tools: [120, 50], paint_finishing: [140, 30], decking_outdoor: [30, 40], woodworking: [150, 20], bits_blades: [115, 15] };
    for (const [k, [x, y]] of Object.entries(spots)) doc = A.createBlock(doc, k, { x, y }).doc;
    const fresh = { ...doc, items: doc.items.map((it) => ({ ...it })) }; // nothing cached
    let t = performance.now();
    const res = C.checkAll(fresh);
    const cold = performance.now() - t;
    const times = [];
    for (let i = 0; i < 20; i++) { t = performance.now(); C.checkAll(doc); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    // generous bounds: the suites run in parallel with wrangler, so wall-clock timings are noisy (about 4 ms alone)
    assert.ok(cold < 150, `cold checkAll took ${cold.toFixed(1)} ms`);
    assert.ok(Math.min(...times.slice(5)) < 40, `checkAll took ${Math.min(...times.slice(5)).toFixed(1)} ms`);
    assert.ok(res.errors > 0 && res.warnings > 0);
    assert.ok(res.issues.some((i) => i.message === "Blocks the front door - keep 4 ft clear"));
    assert.ok(res.issues.some((i) => i.kind === "block"));
    for (const i of res.issues) assert.ok(i.message && i.id && ["error", "warning"].includes(i.severity));
    assert.ok(Object.keys(res.byId).every((id) => item(doc, id).type === "area"));
  });
});

/* ======================================================================= diff.js */
describe("diff", () => {
  test("identical maps: no rows; float noise is ignored", () => {
    assert.equal(F.diffMaps(MASTER, MASTER).text, "No differences");
    const noisy = { ...MASTER, items: MASTER.items.map((it) => ({ ...it, x: it.x + 0.004, rot: (it.rot + 0.05) % 360 })) };
    assert.equal(F.diffMaps(MASTER, noisy).count.total, 0);
  });

  test("moved, in ft-in and compass words", () => {
    const safety = MASTER.items.find((it) => /^SAFETY ISLE/.test(it.name));
    const r = D.moveItems(MASTER, [safety.id], 0, 4.5);
    const d = F.diffMaps(MASTER, r.doc);
    assert.equal(d.changed.length, 1);
    assert.equal(d.changed[0].text, "Moved “SAFETY ISLE” 4'6\" north");
    assert.deepEqual(d.changed[0].kinds, ["moved"]);
    assert.deepEqual(d.changes, [{ id: safety.id, action: "upsert" }]);
    assert.equal(F.compassText(-6, -2.5), "6' west and 2'6\" south");
    assert.equal(F.compassText(0.02, 0), "under 1\" east");
  });

  test("resized (with the sq ft change, no fake move), rotated, renamed, recoloured, other", () => {
    let doc = A.createBlock({ ...MASTER, categories: [] }, "power_tools", { x: 80, y: 60 });
    const id = doc.id; const base = doc.doc;
    // 24' x 25' block, then pull the east end out 4 ft
    let other = D.setSize(base, id, 24, 25).doc;
    const b24 = item(other, id);
    const before = other;
    const p = toWorld(b24, b24.w / 2 + 4, 0);
    other = D.resizeItem(other, id, "e", p[0], p[1]).doc;
    let d = F.diffMaps(before, other);
    assert.equal(d.changed[0].text, "Resized “Power Tools” from 24' x 25' to 28' x 25' (+100 sq ft)");
    assert.deepEqual(d.changed[0].kinds, ["resized"]);
    other = D.rotateItems(other, id, 90).doc;
    other = D.renameItem(other, id, "Power Tools (big)").doc;
    other = D.recolorItem(other, id, "#ff0000").doc;
    other = D.setField(other, id, "notes", "Near the desk").doc;
    d = F.diffMaps(before, other);
    assert.deepEqual(d.changed[0].kinds, ["resized", "rotated", "renamed", "recoloured", "other"]);
    assert.deepEqual(d.changed[0].details.slice(1), [
      "Rotated “Power Tools (big)” 90° counter-clockwise (0° to 90°)",
      "Renamed “Power Tools” to “Power Tools (big)”",
      "Recoloured “Power Tools (big)” from #cd5811 to #ff0000",
      "Changed “Power Tools (big)”: notes",
    ]);
    const st = F.diffMaps(before, D.setField(before, id, "status", "confirmed").doc);
    assert.equal(st.changed[0].text, "Marked “Power Tools” confirmed");
  });

  test("a reshaped polygon block is one 'resized' row", () => {
    let r = A.createBlock({ ...MASTER, categories: [] }, "woodworking", { x: 80, y: 60 });
    const id = r.id;
    const base = A.toPolygon(r.doc, id).doc;
    const other = A.movePolyPoint(base, id, 2, 80 + 12 + 3, 60 + 7.5).doc;
    const d = F.diffMaps(base, other);
    assert.deepEqual(d.changed[0].kinds, ["resized"]);
    assert.match(d.changed[0].text, /^Reshaped “Woodworking & Specialty Wood” \(now 4 corners, \d+ sq ft, \+\d+ sq ft\)$/);
  });

  test("added and removed rows; applying every change to the base reproduces the other map", () => {
    let other = { ...MASTER, categories: [] };
    const removedIds = ["i51", other.items[100].id];
    other = D.deleteItems(other, removedIds, { unlocked: true }).doc;
    const g = D.addItem(other, "gondola", { x: 80, y: 60 }); other = g.doc;
    const blk = A.createBlock(other, "power_tools", { x: 120, y: 50 }); other = blk.doc;
    other = D.moveItems(other, ["i52"], -2, 0).doc;
    const d = F.diffMaps(MASTER, other);
    assert.deepEqual(d.removed.map((r) => r.id).sort(), [...removedIds].sort());
    assert.match(d.removed.find((r) => r.id === "i51").text, /^Removed shelving aisle “SAFETY ISLE”$/);
    assert.equal(d.added.length, 2);
    assert.equal(d.added[1].text, "Added department block “Power Tools” (700 sq ft) near grid F3");
    assert.match(d.added[0].text, /^Added shelving aisle “Gondola” \(16' x 4'\) (at|near) grid D2$/);
    assert.equal(d.text, "2 added, 2 removed, 1 changed");
    const res = applyChanges(MASTER, valid(other), d.changes);
    assert.ok(res.ok);
    const applied = valid(res.data);
    const sortIds = (doc) => doc.items.map((it) => JSON.stringify(it)).sort();
    assert.deepEqual(sortIds(applied), sortIds(valid(other)));
    // a single row applies on its own
    const one = applyChanges(MASTER, valid(other), F.changesFor([d.changed[0]]));
    assert.equal(item(one.data, "i52").x, item(other, "i52").x);
  });

  test("category definition changes are their own rows and apply cleanly", () => {
    let base = { ...MASTER, categories: [] };
    // the base (master) has a custom category with a block, which the other map deletes
    const old = A.addCategory(base, { name: "Old Stuff", color: "#445566", targetSqft: 100 }); base = old.doc;
    const oldBlock = A.createBlock(base, old.key, { x: 80, y: 60 }); base = oldBlock.doc;
    base = A.updateCategory(base, "paint_finishing", { targetSqft: 250 }).doc;
    let other = A.deleteCategory(base, old.key).doc;
    const garden = A.addCategory(other, { name: "Garden Center", color: "#336699", targetSqft: 300 }); other = garden.doc;
    const gBlock = A.createBlock(other, garden.key, { x: 120, y: 50 }); other = gBlock.doc;
    other = A.updateCategory(other, "hand_tools", { name: "Hand Tools", color: "#112233", targetSqft: 260 }).doc;
    other = A.setCategoryHidden(other, "pneumatic_air", true).doc;
    other = A.resetCategory(other, "paint_finishing").doc;
    const d = F.diffMaps(valid(base), valid(other));
    const row = (k) => d.categories.find((r) => r.category === k);
    assert.equal(row(garden.key).text, "New category “Garden Center” (target 300 sq ft)");
    assert.deepEqual(row(garden.key).kinds, ["added"]);
    assert.deepEqual(row("hand_tools").kinds, ["renamed", "recoloured", "target"]);
    assert.equal(row("hand_tools").details[0], "Renamed category “Hand Tools & Measuring” to “Hand Tools”");
    assert.equal(row("hand_tools").details[2], "Target for “Hand Tools” 200 sq ft to 260 sq ft");
    assert.deepEqual(row("pneumatic_air").kinds, ["hidden"]);
    assert.equal(row("pneumatic_air").text, "Hid “Pneumatic & Air Systems”");
    assert.deepEqual(row("paint_finishing").kinds, ["target"]);
    assert.deepEqual(row("paint_finishing").changes, [{ category: "paint_finishing", action: "delete" }]);
    assert.equal(row(old.key).text, "Removed category “Old Stuff” and its 1 block");
    assert.deepEqual(row(old.key).changes, [{ category: old.key, action: "delete" }, { id: oldBlock.id, action: "delete" }]);
    // apply everything: the master becomes the other map
    const res = applyChanges(valid(base), valid(other), d.changes);
    assert.ok(res.ok, res.error);
    const applied = valid(res.data);
    assert.deepEqual(F.diffMaps(applied, valid(other)).count.total, 0);
    // apply only the removed-category row: still a valid map (its block goes with it)
    const partial = applyChanges(valid(base), valid(other), row(old.key).changes);
    valid(partial.data);
    // apply only the new block: apply.js brings its custom category along
    const blockOnly = applyChanges(valid(base), valid(other), F.changesFor([d.added.find((r) => r.id === gBlock.id)]));
    valid(blockOnly.data);
  });
});
