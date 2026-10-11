// Round 4 front-end logic that runs without a DOM or a server: which keys are shortcuts and which are typing (so a field that
// commits as it loses focus can never turn the next keystrokes into "switch mode" or "delete"), where a new department block
// or fixture lands (the middle of what is visible, inside the building, beside rather than on top of what is there), the
// product finder's honesty rules, the stage guard, the master's item count read from the file, and the deploy notes.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { isTyping, isSurface, isPage, ignoreShortcut, deleteAllowed, COMMIT_QUIET_MS } from "../public/js/core/keys.js";
import { visibleBox, dropSpot } from "../public/js/core/placement.js";
import { find, tokens, normalizeText, WEAK_RATIO } from "../public/js/core/finder.js";
import { lockedDeleteHint, unlockHint } from "../public/js/core/modes.js";
import { isGuarded } from "../public/js/ui/stage-guard.js";
import { NO_MATCH, NO_MATCH_EDIT } from "../public/js/ui/palette.js";
import * as A from "../public/js/core/areas.js";
import * as D from "../public/js/core/doc.js";
import { checkAll } from "../public/js/core/collisions.js";
import { validateMapData, isStructure } from "../public/js/shared/schema.js";

const file = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const masterFile = JSON.parse(file("../public/data/master.json"));

/* a stand-in for a DOM element: just what keys.js reads */
const el = (tagName, { id = "", closest = [], editable = false } = {}) => ({
  nodeType: 1, tagName, id, isContentEditable: editable,
  closest: (sel) => (closest.some((c) => sel.includes(c)) ? {} : null),
});
const BODY = { nodeType: 1, tagName: "BODY", id: "", closest: () => null };
const doc = { body: BODY, documentElement: { nodeType: 1, tagName: "HTML", id: "", closest: () => null } };

/* ======================================================================= keys.js */
describe("keys: shortcuts versus typing", () => {
  test("fields, editable boxes and things inside menus, lists and open dialogs are typing", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(isTyping(el(tag)), true, tag);
    assert.equal(isTyping(el("DIV", { editable: true })), true);
    assert.equal(isTyping(el("DIV", { closest: ['[contenteditable]'] })), true);
    assert.equal(isTyping(el("BUTTON", { closest: ['[role="menu"]'] })), true);
    assert.equal(isTyping(el("BUTTON", { closest: ["dialog[open]"] })), true);
    for (const t of [null, undefined, BODY, el("BUTTON"), el("CANVAS", { id: "planCanvas" }), { nodeType: 3 }]) assert.equal(isTyping(t), false);
  });

  test("the plan (either one) and the 3D view are the drawing surfaces; the bare page and buttons are not", () => {
    assert.equal(isSurface(el("CANVAS", { id: "planCanvas" })), true);
    assert.equal(isSurface(el("CANVAS", { id: "planCanvasA" })), true);
    assert.equal(isSurface(el("DIV", { id: "three" })), true);
    assert.equal(isSurface(el("CANVAS", { closest: ["#three"] })), true);
    for (const t of [BODY, el("BUTTON"), el("INPUT"), el("DIV", { id: "inspector" }), null]) assert.equal(isSurface(t), false);
    assert.equal(isPage(BODY, doc), true);
    assert.equal(isPage(doc.documentElement, doc), true);
    assert.equal(isPage(null, doc), true);
    assert.equal(isPage(el("DIV"), doc), false);
  });

  test("Delete / Backspace remove the selection only from the plan or the 3D view, never from the page at large", () => {
    assert.equal(deleteAllowed(el("CANVAS", { id: "planCanvas" })), true);
    assert.equal(deleteAllowed(el("DIV", { id: "three" })), true);
    for (const t of [BODY, el("INPUT"), el("BUTTON"), el("SELECT"), el("DIV"), null]) assert.equal(deleteAllowed(t, { doc }), false);
  });

  test("on a touch screen a tap on the plan leaves the page focused: Delete works from the page only until something else is pressed", () => {
    assert.equal(deleteAllowed(BODY, { doc, surfaceActive: true }), true, "the last press was on the plan or 3D view");
    assert.equal(deleteAllowed(BODY, { doc, surfaceActive: false }), false, "the last press was elsewhere (the inspector, a field)");
    for (const t of [el("INPUT"), el("TEXTAREA"), el("SELECT"), el("BUTTON")]) assert.equal(deleteAllowed(t, { doc, surfaceActive: true }), false, t.tagName + " is never a place to delete from");
    // main.js keeps surfaceActive from pointerdown (is it on a surface?) and clears it when focus goes anywhere that is not one
    const main = file("../public/js/main.js");
    assert.match(main, /surfaceActive = isSurface\(e\.target\)/);
    assert.match(main, /focusin", e => \{ if \(!isSurface\(e\.target\)\) surfaceActive = false; \}/);
    assert.match(main, /deleteAllowed\(t, \{doc: document, surfaceActive\}\)/);
  });

  test("right after a field of the inspector committed, keys aimed at the bare page are ignored (focus is between two fields)", () => {
    const now = 100000;
    const key = (code, extra = {}) => ({ code, ctrlKey: false, metaKey: false, ...extra });
    const fresh = { doc, lastCommitAt: now - 50, now };
    for (const code of ["Digit4", "Digit5", "Backspace", "Delete", "KeyR", "KeyM", "ArrowUp"]) assert.equal(ignoreShortcut(key(code), BODY, fresh), true, code);
    assert.equal(ignoreShortcut(key("Escape"), BODY, fresh), false, "Escape always works");
    assert.equal(ignoreShortcut(key("KeyZ", { ctrlKey: true }), BODY, fresh), false, "Ctrl+Z (undo the edit just made) always works");
    // later, or aimed at the canvas, the map's keys are back
    assert.equal(ignoreShortcut(key("Digit4"), BODY, { doc, lastCommitAt: now - COMMIT_QUIET_MS - 1, now }), false);
    assert.equal(ignoreShortcut(key("Digit4"), BODY, { doc, now }), false, "no commit yet");
    assert.equal(ignoreShortcut(key("Digit4"), el("CANVAS", { id: "planCanvas" }), fresh), false);
    // typing into any field is never a shortcut, whenever
    assert.equal(ignoreShortcut(key("Digit4"), el("INPUT"), { doc, now }), true);
    assert.equal(ignoreShortcut(key("Backspace"), el("TEXTAREA"), { doc, now }), true);
  });

  test("the quiet time is short enough not to be felt (2 s) and the shortcuts are wired through these helpers in main.js", () => {
    assert.equal(COMMIT_QUIET_MS, 2000);
    const main = file("../public/js/main.js");
    assert.match(main, /ignoreShortcut\(e, t, \{doc: document, lastCommitAt: fieldCommitAt, now: performance\.now\(\)\}\)/);
    assert.match(main, /deleteAllowed\(t, \{doc: document, surfaceActive\}\)/);
    assert.match(main, /onCommit: \(\) => \{ fieldCommitAt = performance\.now\(\); \}/);
  });
});

/* ======================================================================= the stage never scrolls */
describe("the stage is never scrolled by a focus() or a scrollIntoView()", () => {
  test("the stage, the views and the shell are guarded; sheets and lists (which do scroll) are not", () => {
    const m = (sel) => ({ nodeType: 1, matches: (s) => s.split(",").map((x) => x.trim()).includes(sel) });
    for (const c of ["stage", "stage-main", "view", "labels3d", "app"]) assert.equal(isGuarded(m("." + c)), true, c);
    for (const c of ["inspector", "palette", "pal-list", "mp-body"]) assert.equal(isGuarded(m("." + c)), false, c);
    assert.equal(isGuarded(null), false);
  });

  test("the CSS makes them overflow:clip (not just hidden), which cannot be scrolled at all", () => {
    const css = file("../public/css/app.css");
    for (const sel of [".stage{", ".stage-main{", ".view{", ".labels3d{"]) {
      const rule = css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
      assert.match(rule, /overflow:hidden;overflow:clip/, `${sel} keeps hidden for old browsers and adds clip`);
    }
  });

  test("no script moves focus with a plain focus() inside the map: every call goes through focusEl (preventScroll)", () => {
    const dirs = ["../public/js/", "../public/js/ui/", "../public/js/core/", "../public/js/plan2d/", "../public/js/view3d/"];
    const offenders = [];
    for (const d of dirs) {
      for (const name of readdirSync(new URL(d, import.meta.url)).filter((n) => n.endsWith(".js"))) {
        const src = file(d + name);
        src.split("\n").forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, "");
          for (const m of code.matchAll(/([\w$.\]\)]+)\.focus\(\s*\)/g)) {
            if (/^orbit\.focus$/.test(m[0].replace(/\(\s*\)/, ""))) continue; // the 3D camera's own focus()
            if (/focusEl/.test(line)) continue;
            offenders.push(`${d}${name}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
    assert.deepEqual(offenders, []);
  });
});

/* ======================================================================= placement.js */
describe("placement: the visible middle of the map", () => {
  test("nothing covering the map: the whole box", () => {
    assert.deepEqual(visibleBox({ x0: 0, y0: 0, x1: 390, y1: 670 }, []), { x0: 0, y0: 0, x1: 390, y1: 670 });
    // a cover somewhere else, or only touching, takes nothing
    assert.deepEqual(visibleBox({ x0: 0, y0: 0, x1: 390, y1: 670 }, [{ x0: 0, y0: 670, x1: 390, y1: 900 }]), { x0: 0, y0: 0, x1: 390, y1: 670 });
  });
  test("a phone's Departments sheet over the lower three quarters leaves the band above it", () => {
    const box = visibleBox({ x0: 0, y0: 114, x1: 390, y1: 780 }, [{ x0: 0, y0: 290, x1: 390, y1: 844 }]);
    assert.deepEqual(box, { x0: 0, y0: 114, x1: 390, y1: 290 });
  });
  test("a landscape side drawer leaves the map to its right; a drawer on each side leaves the larger part", () => {
    assert.deepEqual(visibleBox({ x0: 0, y0: 0, x1: 844, y1: 213 }, [{ x0: 0, y0: 0, x1: 340, y1: 390 }]), { x0: 340, y0: 0, x1: 844, y1: 213 });
    const both = visibleBox({ x0: 0, y0: 0, x1: 844, y1: 213 }, [{ x0: 0, y0: 0, x1: 340, y1: 390 }, { x0: 600, y0: 0, x1: 844, y1: 390 }]);
    assert.deepEqual(both, { x0: 340, y0: 0, x1: 600, y1: 213 });
  });
  test("a cover that hides everything changes nothing (there is nothing better to choose)", () => {
    const b = { x0: 0, y0: 0, x1: 100, y1: 100 };
    assert.deepEqual(visibleBox(b, [{ x0: -10, y0: -10, x1: 200, y1: 200 }]), b);
  });
});

describe("placement: where a new block lands", () => {
  const MASTER = validateMapData({ items: masterFile.items }).data;
  const BLANK = validateMapData({ items: masterFile.items.filter(isStructure) }).data;
  const building = { L: masterFile.building.length, W: masterFile.building.width };
  const probeFor = (docu, key) => { const [w, d] = A.startSize(A.categoryFor(docu, key)); return { type: "area", cat: key, shape: "rect", name: "", w, d, h: A.BLOCK_HEIGHT, rot: 0 }; };
  const inside = (b) => b.x - b.w / 2 >= -0.01 && b.x + b.w / 2 <= building.L + 0.01 && b.y - b.d / 2 >= -0.01 && b.y + b.d / 2 <= building.W + 0.01;

  test("a wanted spot far outside the store (the phone's off-centre view) lands inside it", () => {
    for (const want of [{ x: 84.5, y: -86.7 }, { x: 84.5, y: 3000 }, { x: -500, y: 40 }, { x: 99999, y: 99999 }, {}, null]) {
      const s = dropSpot({ ...MASTER, categories: [] }, probeFor(MASTER, "hand_tools"), want, { building, grid: 0.5 });
      const [w, d] = A.startSize(A.categoryFor(MASTER, "hand_tools"));
      assert.ok(inside({ x: s.x, y: s.y, w, d }), JSON.stringify({ want, s }));
    }
  });

  test("placing the departments one after another never stacks two on one spot, and each lands inside the store", () => {
    for (const want of [{ x: 84.5, y: 38 }, { x: 84.5, y: -86.7 }]) {
      let docu = { ...BLANK, categories: [] };
      const spots = [];
      for (const key of ["hand_tools", "safety_workwear", "access_jobsite", "hardware_fasteners", "pneumatic_air"]) {
        const s = dropSpot(docu, probeFor(docu, key), want, { building, grid: 0.5 });
        assert.equal(s.free, true, `${key} found room`);
        const r = A.createBlock(docu, key, s, { grid: 0.5 });
        docu = r.doc;
        const it = docu.items.find((x) => x.id === r.id);
        assert.ok(inside(it), key);
        for (const o of spots) assert.ok(Math.abs(o.x - it.x) >= 0.5 || Math.abs(o.y - it.y) >= 0.5, `${key} sits exactly on another block`);
        spots.push(it);
      }
      assert.equal(checkAll(docu).issues.length, 0, "five placed departments warn about nothing");
    }
  });

  test("when the floor is full the least bad spot is still inside the store and never exactly on an existing block", () => {
    let docu = { ...BLANK, categories: [] };
    const keys = ["hand_tools", "safety_workwear", "access_jobsite", "hardware_fasteners", "pneumatic_air", "power_tools", "paint_finishing", "decking_outdoor", "woodworking", "bits_blades"];
    const placed = [];
    for (const key of keys) {
      const s = dropSpot(docu, probeFor(docu, key), { x: 84.5, y: 38 }, { building, grid: 0.5 });
      const r = A.createBlock(docu, key, s, { grid: 0.5 });
      docu = r.doc;
      const it = docu.items.find((x) => x.id === r.id);
      assert.ok(inside(it), key);
      for (const o of placed) assert.ok(Math.abs(o.x - it.x) >= 0.5 || Math.abs(o.y - it.y) >= 0.5, `${key} stacked exactly`);
      placed.push(it);
    }
    assert.equal(docu.items.filter((it) => it.type === "area").length, 10, "all ten departments of the catalog placed");
    const onBlocks = checkAll(docu).issues.filter((i) => i.kind === "block");
    assert.equal(onBlocks.length, 0, "with no clean spot left a block takes a few wall or column nicks, never an overlap on another block: " + onBlocks.map((i) => i.message).join("; "));
  });

  test("fixtures use the same search: a second gondola from the same spot goes beside the first", () => {
    let docu = { ...BLANK, categories: [] };
    const def = D.PALETTE.gondola;
    const want = { x: 60, y: 30 };
    const first = dropSpot(docu, { type: "gondola", w: def.w, d: def.d, h: def.h ?? 0, rot: 0 }, want, { building, grid: 0.5 });
    docu = D.addItem(docu, "gondola", first, { grid: 0.5 }).doc;
    const second = dropSpot(docu, { type: "gondola", w: def.w, d: def.d, h: def.h ?? 0, rot: 0 }, want, { building, grid: 0.5 });
    assert.ok(Math.abs(first.x - second.x) >= 0.5 || Math.abs(first.y - second.y) >= 0.5);
    // structure (a wall) is not collision-checked, but still never lands exactly on one of its own kind
    const w1 = dropSpot(docu, { type: "wall", w: 10, d: 0.7, rot: 0 }, want, { building, grid: 0.5 });
    docu = D.addItem(docu, "wall", w1, { unlocked: true, grid: 0.5 }).doc;
    const w2 = dropSpot(docu, { type: "wall", w: 10, d: 0.7, rot: 0 }, want, { building, grid: 0.5 });
    assert.ok(Math.abs(w1.x - w2.x) >= 0.5 || Math.abs(w1.y - w2.y) >= 0.5);
  });

  test("it is quick (one spot well under 150 ms on the real master)", () => {
    const docu = { ...MASTER, categories: [] };
    const t = performance.now();
    for (const key of ["power_tools", "decking_outdoor", "bits_blades"]) dropSpot(docu, probeFor(docu, key), { x: 84.5, y: 38 }, { building, grid: 0.5 });
    assert.ok((performance.now() - t) / 3 < 150, `${((performance.now() - t) / 3).toFixed(0)} ms per spot`);
  });

  test("a tiny or odd building never throws", () => {
    const d = { items: [], categories: [] };
    const s = dropSpot(d, { type: "area", w: 30, d: 20, rot: 0 }, { x: 5, y: 5 }, { building: { L: 10, W: 8 } });
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
    const t = dropSpot(d, { type: "area", w: 30, d: 20, rot: 0 }, undefined, {});
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y));
  });

  test("the hint texts say Place, then tap the floor, in plain words, and the docs match", () => {
    const pal = file("../public/js/ui/palette.js");
    assert.match(pal, /Press Place next to a department, then tap the floor where it goes\. Drag the block to move it; pull a corner to resize it\./);
    assert.match(pal, /Pick a department, then tap the floor where it goes\./);
    assert.doesNotMatch(pal, /middle of the (map|view)/);
    assert.doesNotMatch(file("../README.md"), /middle of the map you can see/);
    assert.match(file("../README.md"), /then tap the\s+floor where it goes/);
    assert.match(file("../docs/DESIGN.md"), /Press Place next to a department, then tap the floor where it goes/);
    assert.match(file("../public/index.html"), /Press <b>Place<\/b> next to a department in the list, then tap the floor where it goes\./);
  });
});

/* ======================================================================= the finder */
describe("finder: honest answers", () => {
  const top = (q) => find(q)[0];
  test("WD-40 is found however it is typed, in the catalog's lubricants line; screw driver and ear plugs reach their lines", () => {
    for (const q of ["WD-40", "wd40", "WD 40", "wd-40 lubricant", "WD-40 oil"]) assert.match(top(q).subcat, /lubricants/i, q);
    assert.equal(normalizeText("WD-40"), "wd40");
    assert.equal(top("screw driver").key, "hand_tools");
    assert.match(top("screw drivers").subcat, /screwdrivers/i);
    for (const q of ["ear plugs", "earplugs", "ear muffs", "ear protection"]) { assert.equal(top(q).key, "safety_workwear", q); assert.match(top(q).subcat, /hearing protection/i, q); }
    assert.deepEqual(tokens("ear plugs"), ["earplug", "hearing", "protection"]);
  });

  test("products the catalog doesn't carry get no answer instead of a wrong department", () => {
    for (const q of ["lumber", "plywood", "fire extinguisher", "light bulbs", "plumbing pipe", "concrete mix"]) assert.deepEqual(find(q), [], q);
  });

  test("a multi-word query must contain its last word: the near-misses of the review are gone", () => {
    assert.ok(!find("plumbing pipe").some((r) => /Plumb bobs/.test(r.subcat || "")));
    assert.ok(!find("light bulbs").some((r) => /lightbox/i.test(r.subcat || "")));
    assert.ok(!find("concrete mix").some((r) => /Concrete screws/.test(r.subcat || "")));
    assert.ok(!find("deck screws").some((r) => /laser deck/i.test(r.subcat || "")), "deck screws are not the Milwaukee laser deck");
  });

  test("a weak hit in another department is dropped (safety glasses are not pint glasses), a weak hit beside a strong one stays", () => {
    const sg = find("safety glasses");
    assert.equal(sg[0].key, "safety_workwear");
    assert.ok(!sg.some((r) => /pint glasses/.test(r.subcat || "")), JSON.stringify(sg.map((r) => r.subcat)));
    const sl = find("step ladder");
    assert.match(sl[0].subcat, /Step, extension and multi-position ladders/);
    assert.ok(sl.some((r) => /ladder wall rack/.test(r.subcat || "")), "the ladder wall rack is the same department");
    assert.equal(WEAK_RATIO, 0.4);
  });

  test("the good answers of the review still land where they should", () => {
    const expect = {
      "M18 battery": "power_tools", "Diablo blade": "bits_blades", "ladder": "access_jobsite", "hard hat": "safety_workwear",
      "air compressor": "pneumatic_air", "pellet grill": "decking_outdoor", "Kreg": "woodworking", "Simpson Strong-Tie": "hardware_fasteners",
      "tape measure": "hand_tools", "deck screws": "hardware_fasteners", "caulk": "paint_finishing", "sandpaper": "bits_blades",
      "nail gun": "pneumatic_air", "Trex": "decking_outdoor", "work gloves": "safety_workwear", "extension cord": "access_jobsite",
      "wood glue": "woodworking", "paint brush": "paint_finishing", "utility knife": "hand_tools", "drill bit": "bits_blades",
    };
    for (const [q, key] of Object.entries(expect)) assert.equal(top(q).key, key, q);
  });

  test("the empty answer says how to teach the map the product, only to someone who can (a view-only map just says nothing matched)", () => {
    assert.match(NO_MATCH, /^Nothing matched\./);
    assert.match(NO_MATCH_EDIT, /Subcategories/);
    assert.match(NO_MATCH_EDIT, /pencil/);
    assert.doesNotMatch(NO_MATCH + NO_MATCH_EDIT, /catalog|database|error/i);
    const pal = file("../public/js/ui/palette.js");
    assert.match(pal, /NO_MATCH \+ \(o\.canEdit && o\.canEdit\(\) \? NO_MATCH_EDIT : ""\)/);
  });
});

/* ======================================================================= toasts, locks, long names */
describe("small behaviours", () => {
  test("Delete on locked structure says why, in plain words, for a computer, a phone and the 3D view", () => {
    assert.match(lockedDeleteHint({ touch: false, plan: true }), /Structure is locked.*Unlock Structure in More first/);
    assert.match(lockedDeleteHint({ touch: true, plan: true }), /in More/);
    assert.doesNotMatch(lockedDeleteHint({ touch: false, plan: true }), /toolbar/);
    assert.match(lockedDeleteHint({ touch: false, plan: false }), /Open the Plan and unlock Structure first/);
    assert.notEqual(lockedDeleteHint(), unlockHint(), "it is about deleting, not adding");
    assert.match(file("../public/js/main.js"), /toast\(lockedDeleteHint\(/);
  });

  test("an Undo toast belongs to the map it was made on, and toasts are cleared when a map opens or the mode changes", () => {
    const main = file("../public/js/main.js");
    assert.match(main, /if \(state\.map !== map \|\| !canEdit\(\) \|\| session\.doc !== after\) return; session\.applyPatch\(inverse, "Undo delete"\); session\.select\(ids\);/, "item delete");
    assert.match(main, /if \(state\.map !== map \|\| !canEdit\(\) \|\| session\.doc !== after\) return; session\.applyPatch\(inverse, "Undo delete"\); \}\}\}\);/, "category delete");
    // ... and to the moment it was offered: any other edit (toolbar Undo, a typed value) hides it, so it can't re-apply an old patch over newer work
    assert.match(main, /if \(undoGuard && session\.doc !== undoGuard\) \{ undoGuard = null; hideToast\(\); \}/, "the toast hides on any other change");
    assert.equal((main.match(/undoGuard = after;/g) || []).length, 2, "both delete toasts set the guard");
    const openMap = main.slice(main.indexOf("async function openMap("), main.indexOf("async function openMap(") + 400);
    assert.match(openMap, /hideToast\(\)/);
    const setMode = main.slice(main.indexOf("function setMode(m)"), main.indexOf("function setMode(m)") + 500);
    assert.match(setMode, /hideToast\(\)/);
  });

  test("Duplicate / Rotate / Delete are re-enabled when Structure is unlocked", () => {
    assert.match(file("../public/js/main.js"), /if \(kind === "lock"\) \{ syncLock\(\); syncToolbar\(\);/);
  });

  test("long unbroken names wrap inside the panels, the toast and the dialogs; the New map row looks disabled; toast buttons are 44 px", () => {
    const css = file("../public/css/app.css");
    assert.match(css, /\.palette,\.inspector,\.toast,dialog,\.map-banner,\.finder-results,\.pop\{overflow-wrap:anywhere;\}/);
    assert.match(css, /\.keys\{overflow-wrap:normal;\}/, "the shortcuts table keeps its words whole");
    assert.match(css, /\.pal-list\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
    assert.match(css, /\.insp-head\.has-close \.insp-name\{padding-right:44px;\}/, "a long name wraps before the Close button");
    assert.match(css, /\.finder-results\{max-height:min\(46vh,290px\);\}/, "the phone's finder list stays above the bottom bar");
    assert.match(css, /orientation:portrait\)[^{]*\{\s*\.app\[data-sheet="peek"\] #catsEmpty/, "the empty-departments card is hidden behind an open inspector sheet in portrait");
    assert.match(css, /\.menu \.mm-new:disabled,\.menu \.mm-new\[aria-disabled="true"\]\{[^}]*opacity:\.6/);
    assert.match(css, /\.toast\{[^}]*width:max-content;max-width:min\(420px,calc\(100% - 32px\)\)/, "a toast is as wide as its words up to 420 px, not squeezed into the half of the screen right of its left:50%");
    assert.match(css, /\.toast-act\{min-height:44px;min-width:44px/);
    assert.match(css, /\.toast-x\{width:44px;height:44px;\}/);
  });

  test("on a landscape phone the banner keeps clear of an open drawer", () => {
    const css = file("../public/css/app.css");
    assert.match(css, /\.stage:has\(#palette\.open\) \.map-banner\{left:calc\(min\(340px,46vw\) \+ var\(--gutter\)\);\}/);
    assert.match(css, /\.app\[data-sheet="peek"\] \.map-banner,\.app\[data-sheet="expanded"\] \.map-banner\{right:/);
  });

  test("the admin's account-menu switches are built once and never disabled while saving (focus and Esc keep working)", () => {
    const main = file("../public/js/main.js");
    const fn = main.slice(main.indexOf("function acctRow("), main.indexOf("function syncLockBadge"));
    assert.match(fn, /aria-busy/);
    assert.doesNotMatch(fn, /\.disabled = true/);
    assert.doesNotMatch(fn, /box\.textContent = ""[^]*box\.textContent = ""/, "rows are not rebuilt on every change");
    assert.match(fn, /acctRows\.share\.set\(/);
  });

  test("unsaved drafts are cleared on every way the session ends", () => {
    assert.match(file("../public/js/main.js"), /r\.status === 401\) \{ try \{ clearAllDrafts\(window\.localStorage\)/);
    assert.match(file("../public/js/core/api.js"), /r\.status === 401\) \{[^}]*clearAllDrafts\(localStorage\)/);
    assert.match(file("../public/js/account.js"), /clearAllDrafts\(localStorage\)[^]*location\.replace\("\/login"\)/);
    const admin = file("../public/admin/admin.js");
    assert.match(admin, /res\.status === 401\) \{\s*forgetDrafts\(\)/);
    assert.match(admin, /await api\("POST", "\/api\/logout", \{\}\)[^]*forgetDrafts\(\)/);
  });

  test("a department block under a fixture is grabbed by pressing it when it is selected (a plain click still picks the top item)", () => {
    const ed = file("../public/js/plan2d/editor.js");
    assert.match(ed, /plan\.contains\(x, wx, wy\)/);
    assert.match(ed, /clicked: \(top \|\| it\)\.id/);
    assert.match(file("../public/js/plan2d/plan.js"), /hitItem, contains,/);
  });
});

/* ======================================================================= the tests don't hard-code the master's size */
describe("tests: the master's item count comes from the file", () => {
  test("no test file spells out the number of items in public/data/master.json", () => {
    const n = masterFile.items.length;
    assert.ok(n > 100);
    const offenders = [];
    for (const name of readdirSync(new URL("./", import.meta.url)).filter((f) => f.endsWith(".mjs"))) {
      file(name).split("\n").forEach((line, i) => {
        // the master is edited by the owner, so its size may change: a count of items must be read from the file
        if (new RegExp(`(items\\.length|itemCount)[^\\n]*\\b${n}\\b|\\b${n}\\b[^\\n]*(items\\.length|itemCount)|${n}-item`).test(line)) offenders.push(`${name}:${i + 1}: ${line.trim()}`);
        if (/\b165\b/.test(line) && /items|master/i.test(line)) offenders.push(`${name}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(offenders, []);
  });
});

/* ======================================================================= deploy notes */
describe("DEPLOY-PHASE2: a way forward when earlier migrations were applied by hand", () => {
  const sql = file("../migrations/0005_maps.sql");
  const guide = file("../docs/DEPLOY-PHASE2.md");
  test("0005 only creates what is missing, so running it as a file is safe whatever was applied before", () => {
    const creates = sql.match(/^CREATE\b[^\n]*/gm) || [];
    assert.ok(creates.length >= 9);
    for (const c of creates) assert.match(c, /IF NOT EXISTS/, c);
    assert.doesNotMatch(sql.replace(/--[^\n]*/g, ""), /\b(ALTER|DROP|DELETE|UPDATE|INSERT|REPLACE)\b/i, "no statement that changes or removes data");
  });
  test("the guide names the by-file command, says when to use it, and warns off running 0002 / 0003 by file", () => {
    assert.match(guide, /wrangler d1 execute fbs-boise-map --remote --file migrations\/0005_maps\.sql/);
    assert.match(guide, /If it lists more than 0005/);
    assert.match(guide, /duplicate column name/);
    assert.match(guide, /Do not run 0002 or 0003 by file/);
    for (const [name, what] of [["0002_passwords.sql", /ADD COLUMN/i], ["0003_admin_username.sql", /CREATE UNIQUE INDEX(?! IF NOT EXISTS)/i]]) assert.match(file("../migrations/" + name), what, `${name} is the non-repeatable kind the guide describes`);
  });
});
