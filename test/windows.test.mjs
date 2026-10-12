// The sales floor as the owner's 12 Oct photos show it (and the 6 Oct scan agrees; no server, no DOM):
//   1. the drop-ceiling soffit ends at the north row of columns, not 11 ft further north
//   2. the arch wall is open (no glass) above the arches to the offices over the front room: "window" items, open
//   3. two glass windows in the soffit's fascia, above the column area on the retail side
//   4. no windows on the north part of the arch wall; it has a ledge where the FBS buckets stand
//   5. a high window is never an obstacle (walking, collisions), the plan draws it dashed, the 3D view cuts it out
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateMapData, STRUCTURE_TYPES } from "../src/shared/schema.js";
import { TYPES, normalizeLayout, ceilingAt } from "../public/js/core/model.js";
import { buildWalkGrid } from "../public/js/core/walkgrid.js";
import { checkAll } from "../public/js/core/collisions.js";
import { buildPickBoxes } from "../public/js/core/pick.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const master = JSON.parse(read("public/data/master.json"));
const byId = (id) => master.items.find((it) => it.id === id);
const edges = (it) => ({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y - it.d / 2, y1: it.y + it.d / 2 });
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

test("a high window is a structure item with a sill, a head (h) and glass or not; nonsense is refused", () => {
  assert.ok(STRUCTURE_TYPES.includes("window"));
  assert.equal(TYPES.window.blocks, false);
  const doc = (extra) => ({ items: [{ id: "w1", type: "window", x: 10, y: 10, w: 6, d: 0.7, h: 18, rot: 90, sill: 15, ...extra }] });
  const ok = validateMapData(doc({ glass: true }));
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(ok.data.items[0].sill, 15);
  assert.equal(ok.data.items[0].glass, true);
  assert.equal(validateMapData(doc({ sill: 99 })).ok, false, "sill out of range");
  assert.equal(validateMapData(doc({ glass: "yes" })).ok, false, "glass must be a boolean");
  const wall = { items: [{ id: "a", type: "wall", x: 0, y: 0, w: 10, d: 0.7, h: 16, rot: 0, ledge: 13.2 }] };
  assert.equal(validateMapData(wall).data.items[0].ledge, 13.2);
});

test("the master: the soffit ends at the north column row; the vaulted ceiling starts there", () => {
  assert.ok(validateMapData(master).ok);
  const c1 = edges(byId("c1")), c2 = edges(byId("c2"));
  const northRow = master.items.filter((it) => it.type === "column" && it.x > 48 && it.x < 100 && it.y > 15 && it.y < 25);
  assert.equal(northRow.length, 3);
  for (const c of northRow) assert.ok(near(c.y, c2.y1), `${c.id} on the soffit line`);
  assert.ok(near(c2.y0, 0) && near(c2.y1, 21.5), "drop ceiling y 0-21.5");
  assert.ok(near(c1.y0, 21.5) && near(c1.y1, 80), "vaulted ceiling y 21.5-80");
  assert.ok(byId("c2").fasciaN && byId("c2").fasciaTo === byId("c1").h);
  const L = normalizeLayout(master);
  assert.equal(ceilingAt(L, 75, 20), byId("c2").h);
  assert.equal(ceilingAt(L, 75, 25), byId("c1").h, "aisle ends (y 25-31) are under the tall ceiling now");
});

test("the master: open above the arches, two glass windows in the soffit, the bucket ledge instead of windows", () => {
  const wins = master.items.filter((it) => it.type === "window");
  const open = wins.filter((w) => !w.glass), glass = wins.filter((w) => w.glass);
  assert.equal(open.length, 3);
  assert.equal(glass.length, 2);
  const arches = ["i38", "i39", "i40"].map(byId), top = byId("c1").h;
  for (const w of open) {
    assert.equal(w.x, 103, "on the arch wall");
    assert.equal(w.rot, 90);
    assert.ok(w.sill > Math.max(...arches.map((a) => a.h)) + 2 && w.h < top && w.sill < w.h, w.id);
    assert.ok(arches.some((a) => Math.abs(a.y - w.y) < a.w / 2 + 1), `${w.id} sits over an arch`);
  }
  // the three openings don't overlap and leave piers between them
  const spans = open.map((w) => [w.y - w.w / 2, w.y + w.w / 2]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] - spans[i - 1][1] >= 1, "a pier between openings");
  for (const w of glass) {
    assert.equal(w.y, 21.5, "in the soffit's fascia");
    assert.equal(w.rot, 0);
    assert.ok(w.x - w.w / 2 > 78 && w.x + w.w / 2 < 102, "east of aisle 3B (the owner's photo there shows none)");
    assert.ok(w.sill > byId("c2").h && w.h < top);
  }
  const i28 = byId("i28");
  assert.equal(i28.clerestory, undefined, "no windows on the north part of the arch wall");
  assert.ok(i28.ledge > 12 && i28.ledge < 15, "the bucket ledge");
  assert.ok(!master.items.some((it) => it.clerestory), "no clerestory anywhere");
  // the live patch carries exactly these items
  const patch = JSON.parse(read("scripts/master-patches/2026-10-12-soffit-windows-ledge.json"));
  for (const it of patch.set) assert.deepEqual(it, byId(it.id), it.id);
  assert.deepEqual(patch.remove, []);
});

test("a high window is no obstacle: the walk grid, the collision checks and 3D picking", () => {
  const without = { ...master, items: master.items.filter((it) => it.type !== "window") };
  const G1 = buildWalkGrid(master), G0 = buildWalkGrid(without);
  assert.equal(G1.obstacles.length, G0.obstacles.length);
  const { issues } = checkAll(master, { fixtures: true }), before = checkAll(without, { fixtures: true });
  assert.ok(!issues.some((i) => /^win_/.test(i.otherId || "")), "no collision issue involves a window");
  assert.equal(issues.length, before.issues.length);
  const box = buildPickBoxes(normalizeLayout(master)).find((b) => b.it.id === "win_arch2");
  assert.ok(box && box.z0 === byId("win_arch2").sill && box.z1 === byId("win_arch2").h, "picked only in the hole itself");
});

test("the plan draws high windows dashed; the 3D view cuts them out of walls, arches, fascias and ceiling steps", () => {
  const plan = read("public/js/plan2d/plan.js");
  assert.match(plan, /it\.type !== "window"\) continue;[\s\S]{0,200}ctx\.lineTo/);
  const s = read("public/js/view3d/structure.js");
  assert.match(s, /holeyBox\(g, -w \/ 2, w \/ 2, -d \/ 2, d \/ 2, 0, top, col, undefined, itemHoles\(layout, it\)\)/, "walls");
  assert.match(s, /if \(top < full\) holeyBox\(g, -RR, RR/, "arches stop at the sill");
  assert.match(s, /if \(c\.fasciaN\) slab\(layout, cg/, "fascias");
  assert.match(s, /slab\(layout, cg, ex, y0, ex, y1, 0\.3, lo, hi, col\)/, "ceiling steps");
  assert.match(s, /case "window": buildWindow\(g, it, layout\)/);
  assert.match(s, /buildLedge\(g, it, layout\)/);
});
