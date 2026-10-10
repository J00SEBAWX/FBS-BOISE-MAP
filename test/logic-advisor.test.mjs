// Phases 2-3 logic (no server, no DOM): the product finder, the walkable grid and the merchandising advisor.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { CATALOG, mergeCategories } from "../public/js/shared/catalog.js";
import { ADVISOR_RULES, ADVISOR_THRESHOLDS } from "../public/js/shared/advisor-config.js";
import { find, tokens } from "../public/js/core/finder.js";
import { polygonArea } from "../public/js/core/geometry.js";
import * as W from "../public/js/core/walkgrid.js";
import * as AD from "../public/js/core/advisor.js";

const masterFile = JSON.parse(readFileSync(new URL("../public/data/master.json", import.meta.url), "utf8"));
const MASTER = masterFile.items;
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

// The 10 department blocks of the earlier suggested plan (scan/suggested-areas.json, claude-2026-10-02)
const SUGGESTED = [
  ["power_tools", 85.25, 62, 24.5, 25], ["bits_blades", 91.75, 42.25, 11.5, 12.5], ["woodworking", 91.75, 28, 11.5, 14],
  ["pneumatic_air", 100.2, 61.25, 4.4, 27.5], ["hardware_fasteners", 73, 20.5, 22, 21], ["paint_finishing", 57, 18, 8, 16],
  ["decking_outdoor", 78.75, 4.75, 46.5, 8.5], ["hand_tools", 65, 70.5, 14, 13], ["safety_workwear", 63.75, 56.25, 16.5, 13.5],
  ["access_jobsite", 34, 62.25, 20, 24.5],
].map(([cat, x, y, w, d]) => ({ id: "blk_" + cat, type: "area", cat, name: cat, x, y, w, d, h: 8, rot: 0 }));
const plan = (blocks, extra = []) => ({ items: [...MASTER, ...extra, ...blocks], categories: [] });
const swap = (blocks, cat, fields) => blocks.map((b) => (b.cat === cat ? { ...b, ...fields } : b));
const P = (r, id) => r.principles.find((p) => p.id === id);
const recsOf = (r, id) => r.recommendations.filter((x) => x.principleId === id);

/* ---------------------------------------------------------------- finder */
describe("finder: Find a product", () => {
  const top = (q, ...rest) => find(q, ...rest)[0];
  test("M18 battery -> Power Tools, Milwaukee group, the batteries subcategory (Power Tool rule)", () => {
    const r = top("M18 battery");
    assert.equal(r.key, "power_tools");
    assert.equal(r.zoneName, "Power Tools");
    assert.equal(r.group, "Milwaukee");
    assert.match(r.subcat, /batter/i);
    assert.equal(r.rule, "power_tool");
    assert.match(r.why, /Milwaukee/);
  });
  test("Diablo blade -> Bits, Blades & Cutting Accessories (Universal rule)", () => {
    const r = top("Diablo blade");
    assert.equal(r.key, "bits_blades");
    assert.equal(r.rule, "universal");
    assert.equal(r.group, null);
    assert.match(r.subcat, /Diablo/);
  });
  test("Penofin -> Paint, Stain & Finishing", () => {
    const r = top("Penofin");
    assert.equal(r.key, "paint_finishing");
    assert.match(r.subcat, /Penofin/);
  });
  test("harness -> Safety & Workwear (fall protection)", () => {
    const r = top("harness");
    assert.equal(r.key, "safety_workwear");
    assert.match(r.subcat, /harness/i);
  });
  test("PACKOUT -> Milwaukee platform storage", () => {
    for (const q of ["PACKOUT", "pack-out", "Pack out organizer"]) {
      const r = top(q);
      assert.equal(r.key, "power_tools", q);
      assert.equal(r.group, "Milwaukee", q);
      assert.match(r.subcat, /PACKOUT/, q);
    }
  });
  test("FlexVolt charger -> DeWalt group; ToughSystem -> DeWalt; MAKPAC, XGT, LXT -> Makita; M12 -> Milwaukee", () => {
    assert.deepEqual([top("FlexVolt charger").key, top("FlexVolt charger").group], ["power_tools", "DeWalt"]);
    assert.match(top("FlexVolt charger").subcat, /DeWalt/);
    assert.equal(top("ToughSystem").group, "DeWalt");
    assert.match(top("ToughSystem").subcat, /ToughSystem/);
    assert.equal(top("MAKPAC").group, "Makita");
    assert.match(top("MAKPAC").subcat, /storage|case/i);
    assert.equal(top("XGT").group, "Makita");
    assert.equal(top("18V LXT battery").group, "Makita");
    assert.equal(top("M12 impact driver").group, "Milwaukee");
  });
  test("a brand's batteries never show up under another brand", () => {
    const res = find("Makita charger");
    assert.equal(res[0].group, "Makita");
    assert.ok(res.every((r) => r.key !== "power_tools" || !r.group || r.group === "Makita"), JSON.stringify(res));
  });
  test("sandpaper and other universal consumables -> Bits, Blades & Cutting Accessories strictly, whatever the brand", () => {
    assert.equal(top("sandpaper").key, "bits_blades");
    assert.match(top("sandpaper").subcat, /abrasive|sandpaper/i);
    for (const q of ["Milwaukee drill bit", "DeWalt saw blade", "Makita sanding discs", "hole saw", "cut-off wheel", "utility blades", "router bits"]) {
      const res = find(q);
      assert.equal(res[0].key, "bits_blades", q);
      assert.equal(res[0].rule, "universal", q);
      assert.ok(!res.some((r) => r.key === "power_tools"), `${q}: ${JSON.stringify(res.map((r) => r.key))}`);
    }
    assert.match(top("Milwaukee drill bit").subcat, /Milwaukee bits/);
    assert.match(top("DeWalt saw blade").subcat, /DeWalt saw blades/);
  });
  test("pellets, grille and grill -> Decking & Outdoor Living", () => {
    assert.equal(top("pellets").key, "decking_outdoor");
    assert.match(top("pellets").subcat, /pellets/i);
    for (const q of ["grille", "grill", "Grilles", "pellet grill"]) {
      assert.equal(top(q).key, "decking_outdoor", q);
      assert.match(top(q).subcat, /grill/i, q);
    }
  });
  test("ladder, nail gun, compressor, Kreg, tape measure", () => {
    assert.equal(top("ladder").key, "access_jobsite");
    assert.match(top("ladders").subcat, /ladder/i);
    const nail = find("nail gun");
    assert.equal(nail[0].key, "pneumatic_air");
    assert.ok(nail.some((r) => r.key === "power_tools" && /cordless nailers/i.test(r.subcat || "")), "cordless nailers offered as well");
    assert.equal(top("nailgun").key, "pneumatic_air");
    assert.equal(top("compressor").key, "pneumatic_air");
    assert.match(top("compressor").subcat, /Compressor/);
    assert.equal(top("Kreg").key, "woodworking");
    assert.equal(top("tape measure").key, "hand_tools");
    assert.match(top("tape measure").subcat, /Tape measures/);
  });
  test("air tools of any brand go to Pneumatic & Air; Milwaukee hand tools stay an intact block in Hand Tools", () => {
    assert.equal(top("DeWalt air nailer").key, "pneumatic_air");
    assert.equal(top("Makita cordless nailer").key, "power_tools");
    assert.equal(top("Makita cordless nailer").group, "Makita");
    const mt = top("Milwaukee tape measure");
    assert.equal(mt.key, "hand_tools");
    assert.match(mt.subcat, /Milwaukee/);
  });
  test("tolerant matching: case, punctuation, plurals, typos", () => {
    assert.equal(top("  m-18   BATTERIES!! ").group, "Milwaukee");
    assert.equal(top("milwakee").group, "Milwaukee");
    assert.equal(top("Dewalt").group, "DeWalt");
    assert.equal(top("de walt flex volt").group, "DeWalt");
    assert.equal(top("HARNESSES").key, "safety_workwear");
    assert.deepEqual(tokens("Grilles"), ["grill"]);
  });
  test("results carry the product line and its fixtures for Show me", () => {
    const r = find("compressor")[0];
    assert.match(r.product, /ROLAIR/);
    assert.ok(r.fixtures.includes("i104"));
    assert.ok(r.color && /^#[0-9a-fA-F]{6}$/.test(r.color));
  });
  test("empty, junk and very long queries are safe", () => {
    assert.deepEqual(find(""), []);
    assert.deepEqual(find("!!! ???"), []);
    assert.deepEqual(find(null), []);
    const long = find("ladder ".repeat(500));
    assert.ok(Array.isArray(long) && long.length <= 8);
    assert.equal(long[0].key, "access_jobsite");
  });
  test("custom and renamed categories from the map are searched and named", () => {
    const cats = mergeCategories(CATALOG.areas, [
      { key: "decking_outdoor", name: "Outdoor Living" },
      { key: "c_smokers", name: "Smoker Shop", color: "#336699", family: "custom", subcats: ["Offset smokers", "Smoker wood chunks"] },
    ]);
    assert.equal(find("pellets", CATALOG, cats)[0].zoneName, "Outdoor Living");
    const sm = find("offset smoker", CATALOG, cats);
    assert.equal(sm[0].key, "c_smokers");
    assert.equal(sm[0].custom, true);
  });
  test("no brand named: batteries, chargers and a bare voltage go to Power Tools without picking a brand", () => {
    for (const q of ["batteries", "charger", "12v", "18V battery", "cordless"]) {
      const r = top(q);
      assert.equal(r.key, "power_tools", q);
      assert.equal(r.group, null, q);
      assert.equal(r.rule, "power_tool", q);
      assert.match(r.why, /Milwaukee, DeWalt or Makita|Milwaukee, DeWalt and Makita/, q);
    }
    assert.equal(top("household batteries").key, "access_jobsite");
  });
  test("Diablo alone is a cutting brand; everyday names (smoker, bbq, primer) reach their product line", () => {
    assert.equal(top("Diablo").key, "bits_blades");
    assert.equal(top("Diablo").rule, "universal");
    assert.match(top("Diablo bits").subcat, /Diablo bits/);
    for (const q of ["smoker", "bbq"]) { assert.equal(top(q).key, "decking_outdoor", q); assert.match(top(q).subcat, /grill/i, q); }
    assert.equal(top("primer").key, "paint_finishing");
  });
  test("a long word that merely starts with a catalog word is not a match (wheelbarrow is not a grinding wheel)", () => {
    const r = find("wheelbarrow");
    assert.ok(!r.some((x) => x.key === "bits_blades"), JSON.stringify(r));
    assert.equal(top("nail gun").key, "pneumatic_air", "nail / nailer still match");
  });
});

/* ---------------------------------------------------------------- walk grid */
const wall = (id, x, y, w, rot = 0, d = 0.5) => ({ id, type: "wall", name: "Wall", x, y, w, d, h: 12, rot });
// a closed 40 x 20 room
const room = (extra = []) => ({
  items: [
    { id: "f", type: "floor", name: "Floor", x: 20, y: 10, w: 40, d: 20, h: 0, rot: 0 },
    wall("ws", 20, -0.25, 40.5), wall("wn", 20, 20.25, 40.5), wall("ww", -0.25, 10, 20.5, 90), wall("we", 40.25, 10, 20.5, 90),
    ...extra,
  ],
});
const gondola = (id, x, y, w, d, rot = 0) => ({ id, type: "gondola", name: id.toUpperCase(), x, y, w, d, h: 6, rot });

describe("walkgrid: walkable grid, clearance, routes, widths", () => {
  test("6-inch cells; fixtures and walls blocked; floor walkable", () => {
    const G = W.buildWalkGrid(room([gondola("g1", 20, 10, 10, 2)]));
    assert.equal(G.cell, 0.5);
    const at = (x, y) => W.cellAt(G, x, y);
    assert.equal(G.walk[at(20, 10)], 0, "inside the gondola");
    assert.equal(G.inside[at(20, 10)] >= 0, true);
    assert.equal(G.walk[at(5, 5)], 1, "open floor");
    assert.equal(G.walk[at(-1, 5)], 0, "off the floor");
    assert.ok(Math.abs(G.clear[at(20.25, 12.25)] - 1.25) < 1e-6, "exact distance to the gondola face");
  });
  test("an item with an exact poly outline (a chamfered raised floor) blocks only its outline, not its bounding box", () => {
    const deck = { id: "deck", type: "platform", name: "Deck", x: 20, y: 10, w: 8, d: 8, h: 1.3, rot: 0 };
    const chamfer = [[16, 6], [24, 6], [24, 10], [20, 14], [16, 14]]; // the north-east corner cut off
    const rect = W.buildWalkGrid(room([deck])), poly = W.buildWalkGrid(room([{ ...deck, poly: chamfer }]));
    const at = (G, x, y) => W.cellAt(G, x, y);
    assert.equal(rect.walk[at(rect, 23.25, 13.25)], 0, "the bounding box blocks the corner");
    assert.equal(poly.walk[at(poly, 23.25, 13.25)], 1, "the cut-off corner is open floor");
    assert.equal(poly.walk[at(poly, 18.25, 12.25)], 0, "inside the deck");
    assert.ok(Math.abs(poly.clear[at(poly, 23.25, 13.25)] - 2.5 / Math.SQRT2) < 1e-6, "exact distance to the chamfer edge");
    assert.equal(poly.obstacles.find((o) => o.id === "deck").movable, false);
    // clockwise input is accepted; a thin step (below platformStepFt) is a floor finish, not an obstacle
    const cw = W.buildWalkGrid(room([{ ...deck, poly: [...chamfer].reverse() }]));
    assert.equal(cw.walk[at(cw, 23.25, 13.25)], 1);
    assert.ok(!W.buildWalkGrid(room([{ ...deck, h: 0.1, poly: chamfer }])).obstacles.some((o) => o.id === "deck"));
    // a tall triangular display blocks the view behind it, not beside it
    const tri = { id: "tri", type: "display", name: "Tri", x: 20, y: 10, w: 6, d: 6, h: 6, rot: 0, poly: [[17, 7], [23, 7], [20, 13]] };
    const vis = W.visibility(W.sightBlockers(W.buildWalkGrid(room([tri])), { minHeight: 5 }), 5, 10, 60);
    assert.equal(W.canSee(vis, 30, 10), false);
    assert.equal(W.canSee(vis, 25, 4), true);
    assert.equal(W.canSee(vis, 20, 14), true);
  });
  test("clearance is the exact distance to the nearest obstacle (rotated fixture included)", () => {
    const G = W.buildWalkGrid(room([gondola("g1", 14, 8, 8, 2, 30), gondola("g2", 28, 12, 6, 3, 75), { id: "c1", type: "column", x: 22, y: 4, w: 1, d: 1, h: 10, rot: 0 },
      { id: "deck", type: "platform", name: "Deck", x: 6, y: 15, w: 8, d: 6, h: 1.3, rot: 0, poly: [[2, 12], [10, 12], [10, 16], [8, 18], [2, 18]] }]));
    let worst = 0;
    for (let k = 0; k < G.N; k++) {
      if (!G.floor[k]) continue;
      const [x, y] = W.cellCentre(G, k);
      let best = G.cap;
      for (const ob of G.obstacles) best = Math.min(best, W.obDist(ob, x, y));
      worst = Math.max(worst, Math.abs(best - G.clear[k]));
    }
    assert.ok(worst < 1e-4, `max error ${worst}`);
  });
  test("narrow aisle detected with its width and both sides", () => {
    // g1 y 7..9, g2 y 12..14: a 3 ft aisle between them; 7 ft to the south wall, 6 ft to the north wall
    const G = W.buildWalkGrid(room([gondola("g1", 20, 8, 20, 2), gondola("g2", 20, 13, 20, 2)]));
    const narrow = W.narrowAisles(G, { maxWidth: 4 });
    assert.equal(narrow.length, 1, JSON.stringify(narrow.map((s) => [s.x, s.y, s.widthFt])));
    assert.ok(Math.abs(narrow[0].widthFt - 3) < 0.05, `width ${narrow[0].widthFt}`);
    assert.deepEqual(narrow[0].sides.map((i) => G.obstacles[i].id).sort(), ["g1", "g2"]);
    assert.ok(narrow[0].lengthFt >= 15, `length ${narrow[0].lengthFt}`);
    const wider = W.narrowAisles(G, { maxWidth: 6.5 });
    assert.equal(wider.length, 2, "the 6 ft aisle by the north wall too");
    assert.ok(wider.some((s) => Math.abs(s.widthFt - 6) < 0.05));
    assert.equal(W.narrowAisles(G, { maxWidth: 2.5 }).length, 0);
  });
  // two rooms: an interior wall at x = 20 with a 3 ft door in it
  const twoRooms = (extra = []) => room([wall("wm1", 20, 4.25, 8.5, 90), wall("wm2", 20, 15.75, 8.5, 90),
    { id: "d1", type: "door", name: "Back door", x: 20, y: 10, w: 3, d: 0.5, h: 7, rot: 90 }, ...extra]);
  test("a route is found through the door, around the fixtures, never through them", () => {
    const G = W.buildWalkGrid(twoRooms([gondola("g1", 30, 10, 2, 12, 0)]));
    const a = W.nearestWalkable(G, 5, 10), b = W.nearestWalkable(G, 35, 10);
    const field = W.dijkstra(G, [b]);
    const cells = W.traceRoute(field, a);
    assert.ok(cells && cells.length > 10, "route found");
    assert.ok(cells.every((k) => G.walk[k] === 1), "only walkable cells");
    assert.ok(cells.some((k) => G.doorway[k] >= 0), "it goes through the door");
    const L = W.routeLength(G, cells);
    assert.ok(L > 30 && L < 50, `length ${L}`);
    const pts = W.simplifyRoute(G, cells);
    assert.ok(pts.length >= 2 && pts.length < cells.length);
    const inDoor = cells.filter((k) => G.doorway[k] >= 0).map((k) => W.widthAt(G, k).width);
    assert.ok(Math.abs(Math.min(...inDoor) - 3) < 0.1, `the door is 3 ft wide (${Math.min(...inDoor)})`);
  });
  test("a closed door, or a fixture across the doorway, blocks the route", () => {
    const route = (map, opts) => {
      const G = W.buildWalkGrid(map, opts);
      return W.traceRoute(W.dijkstra(G, [W.nearestWalkable(G, 35, 10)]), W.nearestWalkable(G, 5, 10));
    };
    assert.ok(route(twoRooms()));
    assert.equal(route(twoRooms(), { closedDoors: ["d1"] }), null);
    assert.equal(route(twoRooms([{ id: "x1", type: "display", name: "Display", x: 21, y: 10, w: 2, d: 4, h: 5, rot: 0 }])), null);
  });
  test("standing spots: inside an exterior door, beside a desk", () => {
    const G = W.buildWalkGrid(room([{ id: "fd", type: "door", name: "FRONT DOOR", x: 20, y: -0.25, w: 6, d: 0.5, h: 7, rot: 0 },
      { id: "desk", type: "counter", name: "Desk", x: 20, y: 15, w: 8, d: 3, h: 3.5, rot: 0, fixed: true }]));
    const s = W.standingSpot(G, { id: "fd", type: "door", x: 20, y: -0.25, w: 6, d: 0.5, rot: 0 });
    assert.ok(s && s.y > 0 && s.y < 3 && Math.abs(s.x - 20) < 1, JSON.stringify(s));
    const dsk = W.standingSpot(G, { id: "desk", type: "counter", x: 20, y: 15, w: 8, d: 3, rot: 0 }, { prefer: [20, 1] });
    assert.ok(dsk && dsk.y < 13.5 && dsk.y > 12, JSON.stringify(dsk));
  });
  test("sight lines: tall fixtures block the view, low ones don't", () => {
    const G = W.buildWalkGrid(room([gondola("tall", 20, 10, 2, 10, 0), { id: "low", type: "table", x: 10, y: 10, w: 2, d: 6, h: 3, rot: 0 }]));
    const vis = W.visibility(W.sightBlockers(G, { minHeight: 5 }), 5, 10, 60);
    assert.equal(W.canSee(vis, 15, 10), true, "over the low table");
    assert.equal(W.canSee(vis, 30, 10), false, "behind the tall gondola");
    assert.equal(W.canSee(vis, 25, 19.5), true, "past its end");
    assert.ok(W.visibilityPolygon(vis).length > 20);
  });
  test("polygon distance", () => {
    const sqr = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
    assert.equal(W.polyDist(sqr(0, 0, 2), sqr(1, 1, 2)), 0);
    assert.ok(Math.abs(W.polyDist(sqr(0, 0, 2), sqr(5, 0, 2)) - 3) < 1e-9);
  });
  test("aisle width along a path: twice the clearance, and the measured width from side to side", () => {
    const G = W.buildWalkGrid(twoRooms([gondola("g1", 30, 10, 2, 12, 0)]));
    const cells = W.traceRoute(W.dijkstra(G, [W.nearestWalkable(G, 35, 10)]), W.nearestWalkable(G, 5, 10));
    const pw = W.pathWidths(G, cells);
    assert.equal(pw.cells.length, cells.length);
    assert.ok(Math.abs(pw.minWidthFt - 3) < 0.1, `narrowest ${pw.minWidthFt} (the 3 ft door)`);
    assert.ok(Math.abs(pw.minAt.x - 20) < 1, JSON.stringify(pw.minAt));
    for (const c of pw.cells) {
      assert.ok(c.clearFt > 0 && Math.abs(c.twiceClearFt - 2 * c.clearFt) < 1e-9);
      assert.ok(c.widthFt >= c.twiceClearFt - 1e-6, "the side-to-side width is never less than twice the clearance");
    }
    assert.deepEqual(W.pathWidths(G, []), { cells: [], minWidthFt: Infinity, minAt: null });
  });
});

/* ---------------------------------------------------------------- advisor */
describe("advisor: retail-flow principles on the real master", () => {
  test("defaultConfig: every rule, the catalog thresholds, labelled assumptions; bad values ignored", () => {
    const cfg = AD.defaultConfig(CATALOG);
    assert.deepEqual(Object.keys(cfg.rules).sort(), ADVISOR_RULES.map((r) => r.key).sort());
    assert.equal(cfg.thresholds.nearFt, CATALOG.thresholds.nearFt);
    assert.equal(cfg.thresholds.anchorFt, CATALOG.thresholds.anchorFt);
    for (const k of Object.keys(ADVISOR_THRESHOLDS)) assert.equal(typeof cfg.thresholds[k], "number", k);
    for (const [k, v] of Object.entries(AD.ADVISOR_ASSUMPTIONS)) {
      assert.equal(cfg.assumptions[k], v[0], k);
      assert.ok(typeof v[3] === "string" && v[3].length > 10, `${k} has a label`);
    }
    assert.equal(cfg.departments.power_tools.margin, "high");
    const r = AD.resolveConfig({ thresholds: { aisleMinFt: "4", mainAisleMinFt: 1e9, adaMinFt: 3.5 }, assumptions: { coldFt: -5, heatFalloffFt: 20 },
      rules: { adjacency: { enabled: "no", weight: 2 } }, departments: { hand_tools: { margin: "huge" } }, junk: 1 });
    assert.equal(r.thresholds.aisleMinFt, 4);
    assert.equal(r.thresholds.mainAisleMinFt, 6);
    assert.equal(r.thresholds.adaMinFt, 3.5);
    assert.equal(r.assumptions.coldFt, 25);
    assert.equal(r.assumptions.heatFalloffFt, 20);
    assert.equal(r.rules.adjacency.enabled, true);
    assert.equal(r.rules.adjacency.weight, 2);
    assert.equal(r.departments.hand_tools.margin, "high");
    assert.equal("junk" in r, false);
  });

  test("master + the 10-block plan: every principle scored with reasoning, ranked recommendations, overlays, under 300 ms", (t) => {
    AD.clearCache();
    const map = deepFreeze(plan(SUGGESTED));
    let t0 = performance.now();
    const r = AD.analyse(map, CATALOG);
    const cold = performance.now() - t0;
    // warm runs (cache cleared, so the walk grid, routes and sight lines are rebuilt each time)
    const warm = [];
    for (let i = 0; i < 3; i++) { AD.clearCache(); t0 = performance.now(); AD.analyse(map, CATALOG); warm.push(performance.now() - t0); }
    warm.sort((a, b) => a - b);
    t0 = performance.now();
    const again = AD.analyse(plan(swap(SUGGESTED, "power_tools", { x: 84.25 })), CATALOG);
    const cached = performance.now() - t0;
    t.diagnostic(`analyse (master ${MASTER.length} items + 10 blocks, ${r.stats.cells} cells): first call ${cold.toFixed(0)} ms, warm ${warm.map((v) => v.toFixed(0)).join("/")} ms, blocks-only change (structure cached) ${cached.toFixed(0)} ms; structure timings ${JSON.stringify(r.stats.timings)}`);
    assert.ok(Math.min(...warm) < 300, `warm analysis ${Math.min(...warm).toFixed(0)} ms`); // best of 3: the suites run in parallel
    assert.ok(cached < warm[1], "moving blocks re-uses the structure analysis");
    assert.equal(again.stats.cached, true);

    assert.ok(Number.isInteger(r.overall) && r.overall >= 0 && r.overall <= 100);
    assert.deepEqual(r.principles.map((p) => p.id), ADVISOR_RULES.map((x) => x.key));
    for (const p of r.principles) {
      assert.equal(p.applicable, true, `${p.id}: ${p.reasoning}`);
      assert.ok(Number.isInteger(p.score) && p.score >= 0 && p.score <= 100, `${p.id} score ${p.score}`);
      assert.ok(p.reasoning.length > 30, p.id);
      assert.ok(Array.isArray(p.findings));
      for (const f of p.findings) assert.ok(["high", "medium", "low", "info"].includes(f.severity) && f.text.length > 5);
    }
    // the anchors from the catalog resolve in the master
    assert.deepEqual(r.stats.anchors.front_door.map((a) => a.id), ["i30"]);
    assert.deepEqual(r.stats.anchors.sales_desk.map((a) => a.id), ["sdf_s", "sdf_n", "i47"]);
    assert.deepEqual(r.stats.missingAnchors, []);
    // recommendations: ranked, each with a principle, a reason and something to show
    assert.ok(r.recommendations.length > 5);
    r.recommendations.forEach((x, i) => {
      assert.equal(x.rank, i + 1);
      if (i) assert.ok(x.impact <= r.recommendations[i - 1].impact);
      assert.ok(ADVISOR_RULES.some((ru) => ru.key === x.principleId));
      assert.ok(["high", "medium", "low"].includes(x.priority));
      assert.ok(x.title && x.why && x.show && (x.show.ids || x.show.points || x.show.region));
      if (x.apply) {
        assert.ok(["move", "resize"].includes(x.apply.op));
        for (const c of x.apply.changes) assert.ok(map.items.some((it) => it.id === c.id), `apply targets ${c.id}`);
      }
    });
    assert.equal(new Set(r.recommendations.map((x) => x.id)).size, r.recommendations.length, "unique ids");
    // overlays
    const { heat, sightlines, paths, chokePoints, zones } = r.overlays;
    assert.equal(heat.values.length, heat.nx * heat.ny);
    assert.ok(heat.values.some((v) => v >= 90) && heat.values.some((v) => v >= 0 && v < 10) && heat.values.includes(-1));
    assert.ok(sightlines.some((s) => s.kind === "desk") && sightlines.some((s) => s.kind === "entrance"));
    assert.equal(paths.length, 15, "front door, 3 desks, will-call and 2 yard doors: 15 main trips");
    for (const p of paths) assert.ok(p.points.length >= 2 && p.lengthFt > 0);
    assert.ok(chokePoints.length > 0 && chokePoints.every((c) => c.widthFt < CATALOG.thresholds.nearFt));
    assert.ok(zones.some((z) => z.kind === "decompression"));
    // the cabinet in the Milwaukee doorway (survey data) is the worst choke point
    assert.equal(chokePoints[0].doorway, "i36");
    assert.equal(chokePoints[0].severity, "high");
    // the result is plain JSON and the input map was not touched (it is frozen)
    assert.doesNotThrow(() => JSON.stringify(r));
  });

  test("deterministic: the same map gives the same answer, cached or not", () => {
    const map = plan(SUGGESTED);
    AD.clearCache();
    const a = AD.analyse(map, CATALOG), b = AD.analyse(map, CATALOG);
    const strip = (r) => JSON.stringify({ ...r, stats: null });
    assert.equal(strip(a), strip(b));
  });

  test("a department in the entrance zone: low decompression score and a Move that clears it", () => {
    const good = AD.analyse(plan(SUGGESTED), CATALOG);
    const bad = plan(swap(SUGGESTED, "bits_blades", { x: 115, y: 17, w: 12, d: 10 }));
    const r = AD.analyse(bad, CATALOG);
    const dz = P(r, "decompression");
    assert.ok(dz.score < 20 && dz.score < P(good, "decompression").score, `score ${dz.score}`);
    assert.ok(dz.findings.some((f) => f.severity === "high" && f.ids.includes("blk_bits_blades")));
    const rec = recsOf(r, "decompression").find((x) => x.apply && x.show.ids.includes("blk_bits_blades"));
    assert.ok(rec, "a recommendation with an apply patch");
    assert.equal(rec.priority, "high");
    assert.equal(rec.apply.op, "move");
    assert.deepEqual(rec.apply.changes[0].from, { x: 115, y: 17 });
    // applying it clears the zone
    const fixed = AD.applyFix(bad, rec.apply);
    assert.notEqual(fixed, bad);
    assert.equal(bad.items.find((it) => it.id === "blk_bits_blades").x, 115, "input untouched");
    const r2 = AD.analyse(fixed, CATALOG);
    assert.equal(P(r2, "decompression").score, P(good, "decompression").score);
    assert.ok(!P(r2, "decompression").findings.some((f) => (f.ids || []).includes("blk_bits_blades")));
  });

  test("power tools out of sight of the desks: low sight-line score", () => {
    const good = AD.analyse(plan(SUGGESTED), CATALOG);
    // in the west half of the warehouse, behind the warehouse wall and the pallet racks
    const r = AD.analyse(plan(swap(SUGGESTED, "power_tools", { x: 14, y: 40, w: 20, d: 20 })), CATALOG);
    const s = P(r, "sightlines"), g = P(good, "sightlines");
    assert.ok(s.score < g.score && s.score <= 30, `${s.score} vs ${g.score}`);
    assert.ok(s.findings.some((f) => /^Power Tools: 0% can be seen from a sales desk/.test(f.text) && f.severity === "high"));
    assert.ok(recsOf(r, "sightlines").some((x) => x.show.ids.includes("blk_power_tools") && x.priority === "high"));
    // with Power Tools right by the back sales desk the score is much higher
    const near = AD.analyse(plan(swap(SUGGESTED, "power_tools", { x: 86, y: 47, w: 18, d: 8 })), CATALOG);
    assert.ok(P(near, "sightlines").score > s.score + 20);
  });

  test("a principle turned off is not scored, counted or recommended", () => {
    const r = AD.analyse(plan(SUGGESTED), CATALOG, { rules: { sightlines: { enabled: false } } });
    assert.equal(P(r, "sightlines").applicable, false);
    assert.equal(P(r, "sightlines").enabled, false);
    assert.equal(recsOf(r, "sightlines").length, 0);
    const w = AD.analyse(plan(SUGGESTED), CATALOG, { rules: { sightlines: { weight: 0 } } });
    assert.equal(r.overall, w.overall);
  });

  test("size vs target: an oversized block gets a Resize to its target", () => {
    const r = AD.analyse(plan(swap(SUGGESTED, "power_tools", { x: 85.25, y: 62, w: 40, d: 30 })), CATALOG);
    assert.ok(P(r, "size_vs_target").findings.some((f) => /Power Tools: 1,200 sq ft, 71% over/.test(f.text)));
    const rec = recsOf(r, "size_vs_target").find((x) => x.show.ids[0] === "blk_power_tools");
    assert.equal(rec.apply.op, "resize");
    const to = rec.apply.changes[0].to;
    assert.ok(Math.abs(to.w * to.d - 700) < 2, `${to.w} x ${to.d}`);
    assert.ok(Math.abs(to.w / to.d - 40 / 30) < 0.01, "keeps its proportions");
  });

  test("adjacency: Bits & Blades far from Power Tools -> a Move that puts them together", () => {
    const blocks = SUGGESTED.filter((b) => ["power_tools", "bits_blades"].includes(b.cat));
    const bad = plan(swap(blocks, "bits_blades", { x: 15, y: 40 }));
    const r = AD.analyse(bad, CATALOG);
    assert.equal(P(r, "adjacency").score, 0);
    assert.ok(P(r, "adjacency").findings.some((f) => f.severity === "high"), "an owner-named pair");
    const rec = recsOf(r, "adjacency").find((x) => x.apply);
    assert.ok(rec, "a concrete move");
    assert.equal(rec.apply.changes[0].id, "blk_bits_blades");
    assert.equal(P(AD.analyse(AD.applyFix(bad, rec.apply), CATALOG), "adjacency").score, 100);
  });

  test("bulky goods far from the yard doors -> a Move next to them", () => {
    const pellets = [{ id: "blk_pellets", type: "area", cat: "decking_outdoor", name: "Pellets", x: 80, y: 20, w: 8, d: 8, h: 8, rot: 0 }];
    const r = AD.analyse(plan(pellets), CATALOG);
    assert.ok(P(r, "bulky_near_yard").score < 30);
    const rec = recsOf(r, "bulky_near_yard").find((x) => x.apply);
    assert.ok(rec);
    assert.equal(P(AD.analyse(AD.applyFix(plan(pellets), rec.apply), CATALOG), "bulky_near_yard").score, 100);
  });

  test("a structure-only (blank) map with blocks still analyses", () => {
    const blank = MASTER.filter((it) => ["floor", "zone", "wall", "door", "opening", "arch", "column", "ceiling", "stairs"].includes(it.type) || it.fixed);
    const r = AD.analyse({ items: [...blank, ...SUGGESTED] }, CATALOG);
    assert.ok(r.overall !== null);
    assert.equal(r.overlays.paths.length, 15);
    assert.ok(P(r, "aisle_widths").score >= P(AD.analyse(plan(SUGGESTED), CATALOG), "aisle_widths").score, "no fixtures, no narrow aisles");
  });

  test("a map with nothing to walk on gives a graceful empty result", () => {
    const r = AD.analyse({ items: [] }, CATALOG);
    assert.equal(r.overall, null);
    assert.equal(r.principles.length, ADVISOR_RULES.length);
    assert.ok(r.principles.every((p) => p.applicable === false));
    assert.deepEqual(r.recommendations, []);
  });
});

describe("advisor: synthetic store (choke points, doorways)", () => {
  // 60 x 40 sales floor, front door south, desk north, yard door east; a partition at y = 16 with a 12 ft gap (x 24..36)
  const store = (extra = []) => ({
    items: [
      { id: "f", type: "floor", name: "Floor", x: 30, y: 20, w: 60, d: 40, h: 0, rot: 0 },
      wall("s1", 12.75, -0.25, 26), wall("s2", 46.75, -0.25, 26.5), wall("n", 30, 40.25, 60.5), wall("w", -0.25, 20, 40.5, 90),
      wall("e1", 60.25, 9.75, 20, 90), wall("e2", 60.25, 33.25, 14, 90), wall("p1", 12, 16, 24), wall("p2", 48, 16, 24),
      { id: "door1", type: "door", name: "FRONT DOOR", x: 29.75, y: -0.25, w: 7, d: 0.5, h: 7, rot: 0, fixed: true },
      { id: "yard1", type: "door", name: "YARD DOOR", x: 60.25, y: 23, w: 6.5, d: 0.5, h: 9, rot: 90, fixed: true },
      { id: "desk1", type: "counter", name: "DESK", x: 30, y: 34, w: 10, d: 3, h: 3.6, rot: 0, fixed: true },
      ...extra,
    ],
  });
  const cat = { ...CATALOG, entryAnchors: { front_door: { items: ["door1"] }, sales_desk: { items: ["desk1"] }, will_call: { items: [] }, yard_doors: { items: ["yard1"] } } };

  test("main routes found; a display that pinches the only gap is a choke point between it and the partition", () => {
    const open = AD.analyse(store(), cat);
    assert.equal(open.overlays.paths.length, 3, JSON.stringify(open.overlays.paths.map((p) => p.label)));
    assert.equal(P(open, "choke_points").score, 100, JSON.stringify(P(open, "choke_points").findings));
    // an 8.5 ft display at x 24..32.5 leaves 3.5 ft of the gap (x 32.5..36)
    const r = AD.analyse(store([{ id: "disp", type: "display", name: "SPECIALS DISPLAY", x: 28.25, y: 16, w: 8.5, d: 2, h: 5, rot: 0 }]), cat);
    const spot = r.overlays.chokePoints.find((x) => x.between.includes("SPECIALS DISPLAY"));
    assert.ok(spot, JSON.stringify(r.overlays.chokePoints));
    assert.ok(Math.abs(spot.widthFt - 3.5) < 0.1, `width ${spot.widthFt}`);
    assert.equal(spot.severity, "medium");
    assert.ok(spot.between.includes("Wall"));
    assert.ok(P(r, "choke_points").score < 100);
    assert.ok(recsOf(r, "choke_points").some((x) => x.show.ids.includes("disp")));
    // both routes from the front door use it
    assert.ok(spot.routes.length >= 2);
  });

  test("a fixture in front of the yard door breaks the door clearance; a door blocked from inside breaks the route", () => {
    const r = AD.analyse(store([{ id: "crate", type: "display", name: "CRATE", x: 58, y: 23, w: 3, d: 3, h: 4, rot: 0 }]), cat);
    const d = P(r, "door_clearance");
    assert.ok(d.score < 100);
    assert.ok(d.findings.some((f) => /CRATE/.test(f.text) && f.severity === "high"));
    assert.ok(recsOf(r, "door_clearance").some((x) => x.show.ids.includes("crate")));
    const blocked = AD.analyse(store([{ id: "big", type: "display", name: "BIG CRATE", x: 58.5, y: 23, w: 3, d: 9, h: 4, rot: 0 }]), cat);
    assert.deepEqual(blocked.stats.blockedAnchors, ["yard1"]);
    const ch = P(blocked, "choke_points");
    assert.ok(ch.findings.some((f) => /YARD DOOR can't be reached/.test(f.text) && f.severity === "high"), JSON.stringify(ch.findings.map((f) => f.text)));
    assert.ok(recsOf(blocked, "choke_points").some((x) => /Open a route to YARD DOOR/.test(x.title)));
  });

  test("decompression and power wall use the front door's own frame (right = east here); a Move to the right is offered", () => {
    const right = AD.analyse(store([{ id: "pt", type: "area", cat: "power_tools", x: 52, y: 12, w: 10, d: 10, h: 8, rot: 0 }]), cat);
    const leftMap = store([{ id: "pt", type: "area", cat: "power_tools", x: 8, y: 12, w: 10, d: 10, h: 8, rot: 0 }]);
    const left = AD.analyse(leftMap, cat);
    assert.ok(P(right, "power_wall").score > 90, P(right, "power_wall").score);
    assert.ok(P(left, "power_wall").score < 40, P(left, "power_wall").score);
    assert.equal(recsOf(right, "power_wall").length, 0);
    const rec = recsOf(left, "power_wall")[0];
    assert.ok(rec && rec.apply && rec.apply.op === "move" && rec.apply.changes[0].id === "pt", JSON.stringify(rec));
    assert.ok(rec.apply.changes[0].to.x > 33.25, "right of the door's own right edge");
    const after = AD.analyse(AD.applyFix(leftMap, rec.apply), cat);
    assert.ok(P(after, "power_wall").score >= 80, P(after, "power_wall").score);
    assert.equal(P(after, "decompression").score, 100, "not moved into the entrance zone");
  });

  test("destination department by the front door: a Move further back in its room, and the score follows", () => {
    const map = store([{ id: "hw", type: "area", cat: "hardware_fasteners", x: 45, y: 8, w: 10, d: 10, h: 8, rot: 0 }]);
    const r = AD.analyse(map, cat);
    const before = P(r, "destination_back");
    assert.ok(before.score < 40, before.score);
    const rec = recsOf(r, "destination_back")[0];
    assert.ok(rec && rec.apply && rec.apply.op === "move" && rec.apply.changes[0].id === "hw", JSON.stringify(rec));
    assert.ok(rec.show.points.length === 1, "shows the deepest point");
    const after = AD.analyse(AD.applyFix(map, rec.apply), cat);
    assert.ok(P(after, "destination_back").score >= 60 && P(after, "destination_back").score > before.score, P(after, "destination_back").score);
    assert.match(P(after, "destination_back").findings[0].text, /\d+% of the way to the yard doors/);
  });

  test("a high-margin department in a cold corner: a Move onto the main paths (cold distance is an editable assumption)", () => {
    const map = store([{ id: "pt", type: "area", cat: "power_tools", x: 8, y: 30, w: 10, d: 10, h: 8, rot: 0 }]);
    const cfg = { assumptions: { coldFt: 12 } };
    const r = AD.analyse(map, cat, cfg);
    assert.equal(r.config.assumptions.coldFt, 12);
    assert.ok(P(r, "cold_corners").score < 20, P(r, "cold_corners").score);
    assert.ok(P(r, "cold_corners").findings.some((f) => f.severity === "high" && /Power Tools/.test(f.text)));
    const rec = recsOf(r, "cold_corners").find((x) => x.show.ids && x.show.ids.includes("pt"));
    assert.ok(rec && rec.apply && rec.apply.op === "move", JSON.stringify(rec));
    const after = AD.analyse(AD.applyFix(map, rec.apply), cat, cfg);
    assert.ok(P(after, "cold_corners").score >= 90, P(after, "cold_corners").score);
    // with the default 25 ft the same corner is not cold enough to flag
    assert.ok(P(AD.analyse(map, cat), "cold_corners").score > P(r, "cold_corners").score);
  });

  test("polygon (L-shaped) blocks: shoelace area, the entrance-zone check and a Resize that scales the corners", () => {
    const L = { id: "poly", type: "area", cat: "hardware_fasteners", shape: "poly", pts: [[-6, -5], [6, -5], [6, 0], [0, 0], [0, 5], [-6, 5]], x: 30, y: 6, w: 12, d: 10, h: 8, rot: 0 };
    assert.equal(polygonArea(L.pts), 90);
    const inZone = AD.analyse(store([L]), cat);
    const dz = P(inZone, "decompression");
    assert.ok(dz.score < 40 && dz.findings.some((f) => f.ids.includes("poly") && /84 sq ft/.test(f.text)), JSON.stringify(dz));
    const mv = recsOf(inZone, "decompression").find((x) => x.apply);
    assert.ok(mv && mv.apply.op === "move");
    assert.equal(P(AD.analyse(AD.applyFix(store([L]), mv.apply), cat), "decompression").score, 100);
    // a custom category with its own target: the block is half its size
    const categories = [{ key: "c_special", name: "Specials", color: "#336699", family: "custom", subcats: [], targetSqft: 180 }];
    const r = AD.analyse({ items: store([{ ...L, cat: "c_special", x: 48, y: 30 }]).items, categories }, cat);
    assert.ok(P(r, "size_vs_target").findings.some((f) => /Specials: 90 sq ft, 50% under its target of 180 sq ft/.test(f.text)));
    const rec = recsOf(r, "size_vs_target").find((x) => x.show.ids.includes("poly"));
    assert.equal(rec.apply.op, "resize");
    const to = rec.apply.changes[0].to;
    assert.ok(Math.abs(polygonArea(to.pts) - 180) < 0.5, `scaled area ${polygonArea(to.pts)}`);
    assert.ok(Math.abs(to.w / to.d - 1.2) < 0.01 && to.pts.length === 6);
  });
});
