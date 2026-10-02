// Unit tests for the pure modules: crypto helpers, validation, geometry, the advisor and layout diffs.
// Run: npm test   (store-geometry tests skip automatically when the private seed/ folder isn't present)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomDigits, randomCode, hmacHex, encryptText, decryptText, safeEqual, toB64 } from "../src/lib/crypto.js";
import { normalizePhone, cleanFirstName, cleanCode, sanitizeBuildData, cleanBuildName } from "../src/lib/validate.js";
import * as C from "../src/shared/catalog.js";
import { overlapArea, rectDist, corners, clip, polyArea, edgeSnap, clearanceRect, pointRectDist } from "../public/app/geometry.js";
import { analyzeBuild, suggestions, findSpot, isClear, buildContext, fitToZone, nice } from "../public/app/analysis.js";
import { diffAreas, diffItems, matchScore } from "../public/app/compare.js";
import { NavGrid } from "../public/app/nav.js";

const catalog = { areas: C.AREAS, families: C.FAMILIES, entryAnchors: C.ENTRY_ANCHORS, placements: C.PLACEMENTS, statuses: C.STATUSES, confidence: C.CONFIDENCE, nearFt: C.NEAR_FT, anchorFt: C.ANCHOR_FT, perimeterFt: C.PERIMETER_FT };
const seedDir = new URL("../seed/", import.meta.url);
const haveSeed = fs.existsSync(new URL("current.json", seedDir));
const current = haveSeed ? JSON.parse(fs.readFileSync(new URL("current.json", seedDir), "utf8")) : null;
const suggested = haveSeed ? JSON.parse(fs.readFileSync(new URL("suggested.json", seedDir), "utf8")) : null;

function block(key, x, y, w, d, extra = {}) {
  const c = C.AREA_BY_KEY[key];
  return { id: "a_" + key, key, name: c.name, x, y, w, d, rot: 0, status: "proposed", entry: c.entry, placement: c.placement, adjacency: [...c.adjacency], subcats: [...c.subcats], groups: c.groups || [], ...extra };
}

// ---------- crypto ----------
test("randomDigits makes n digits and varies", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = randomDigits(6);
    assert.match(c, /^\d{6}$/);
    seen.add(c);
  }
  assert.ok(seen.size > 190, "codes should almost never repeat");
});

test("randomCode uses the unambiguous alphabet", () => {
  for (let i = 0; i < 50; i++) assert.match(randomCode(4, 4), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}(-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}){3}$/);
});

test("hmac is keyed and stable", async () => {
  const a = await hmacHex("pepper-one-0123456789abcdef0123456789", "code:u1:123456");
  const b = await hmacHex("pepper-one-0123456789abcdef0123456789", "code:u1:123456");
  const c = await hmacHex("pepper-two-0123456789abcdef0123456789", "code:u1:123456");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(safeEqual(a, b));
  assert.ok(!safeEqual(a, c));
});

test("phone encryption round-trips and is randomized", async () => {
  const key = toB64(crypto.getRandomValues(new Uint8Array(32)));
  const e1 = await encryptText(key, "+12085550100");
  const e2 = await encryptText(key, "+12085550100");
  assert.notEqual(e1, e2, "same phone must not encrypt to the same text");
  assert.equal(await decryptText(key, e1), "+12085550100");
  const other = toB64(crypto.getRandomValues(new Uint8Array(32)));
  await assert.rejects(() => decryptText(other, e1));
});

// ---------- validation ----------
test("phone numbers normalize to US E.164", () => {
  assert.equal(normalizePhone("(208) 555-0134"), "+12085550134");
  assert.equal(normalizePhone("1-208-555-0134"), "+12085550134");
  assert.equal(normalizePhone("+1 208 555 0134"), "+12085550134");
  assert.equal(normalizePhone("555-0134"), null);
  assert.equal(normalizePhone("0085550134"), null);
});

test("names, codes and build names are cleaned", () => {
  assert.equal(cleanFirstName("  Dana "), "Dana");
  assert.equal(cleanFirstName("<script>"), null);
  assert.equal(cleanCode("12 34 56"), "123456");
  assert.equal(cleanCode("12345"), null);
  assert.equal(cleanBuildName("  My\u0000 plan  "), "My plan");
});

test("build data is whitelisted and capped", () => {
  const out = sanitizeBuildData({
    items: [{ id: "i1", type: "gondola", name: "<b>x</b>", x: 1, y: 2, w: 3, d: 4, evil: "yes", onclick: "alert(1)" }, { id: "bad id!", type: "gondola" }, { id: "i2", type: "spaceship" }],
    areas: [{ id: "a1", key: "power_tools", name: "PT", x: 1, y: 1, w: 10, d: 10, status: "weird", adjacency: ["bits_blades", "nope", "power_tools"], __proto__: { polluted: true } }],
    notes: "n",
    extra: "dropped",
  });
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].evil, undefined);
  assert.equal(out.items[0].onclick, undefined);
  assert.equal(out.items[0].name, "<b>x</b>", "text is kept as text; the UI renders it with textContent");
  assert.equal(out.areas[0].status, "proposed");
  assert.deepEqual(out.areas[0].adjacency, ["bits_blades"]);
  assert.equal(out.extra, undefined);
  assert.equal({}.polluted, undefined);
  assert.throws(() => sanitizeBuildData({ items: new Array(801).fill({ id: "x", type: "wall" }) }));
});

// ---------- geometry ----------
test("overlap area handles axis-aligned and rotated rects", () => {
  const a = { x: 0, y: 0, w: 10, d: 10, rot: 0 };
  assert.equal(overlapArea(a, { x: 5, y: 5, w: 10, d: 10, rot: 0 }), 25);
  assert.equal(overlapArea(a, { x: 20, y: 0, w: 10, d: 10, rot: 0 }), 0);
  assert.ok(Math.abs(overlapArea(a, { x: 0, y: 0, w: 10, d: 10, rot: 45 }) - 82.84) < 0.05);
  assert.equal(overlapArea(a, { x: 10, y: 0, w: 10, d: 10, rot: 0 }), 0, "touching edges don't overlap");
});

test("rect distance and point distance", () => {
  assert.equal(rectDist({ x: 0, y: 0, w: 2, d: 2 }, { x: 5, y: 0, w: 2, d: 2 }), 3);
  assert.equal(rectDist({ x: 0, y: 0, w: 2, d: 2 }, { x: 1, y: 0, w: 2, d: 2 }), 0);
  assert.equal(pointRectDist({ x: 0, y: 0, w: 2, d: 2 }, 4, 1), 3);
});

test("clip returns the intersection polygon", () => {
  const p = clip(corners({ x: 0, y: 0, w: 4, d: 4 }), corners({ x: 2, y: 2, w: 4, d: 4 }));
  assert.equal(Math.abs(polyArea(p)), 4);
});

test("edge snap pulls edges flush within the threshold", () => {
  const s = edgeSnap({ x: 10.6, y: 5, w: 4, d: 2 }, { xs: [8], ys: [] }, 1);
  assert.equal(s.x, 10);
  assert.equal(s.guides.x, 8);
  const none = edgeSnap({ x: 20, y: 5, w: 4, d: 2 }, { xs: [8], ys: [] }, 1);
  assert.equal(none.x, 20);
});

test("door clearance extends 5 ft both sides and 1 ft past each jamb", () => {
  const r = clearanceRect({ x: 0, y: 0, w: 6, d: 0.7, rot: 0 });
  assert.equal(r.w, 8);
  assert.equal(r.d, 10.7);
});

test("nice() softens all-caps names", () => {
  assert.equal(nice("SALES DESK BACK (SDB)"), "Sales Desk Back (SDB)");
  assert.equal(nice("Cedar desk"), "Cedar desk");
});

// ---------- advisor (synthetic layout, always runs) ----------
const mini = [
  { id: "f1", type: "floor", x: 50, y: 25, w: 100, d: 50, kind: "showroom", rot: 0 },
  { id: "w1", type: "wall", x: 50, y: -0.35, w: 100, d: 0.7, rot: 0 },
  { id: "w2", type: "wall", x: 50, y: 25, w: 30, d: 0.7, rot: 90 },
  { id: "i30", type: "door", x: 20, y: -0.35, w: 6, d: 0.7, rot: 0 },
  { id: "i47", type: "ring", x: 80, y: 30, w: 12, d: 8, rot: 0, fixed: true, locked: true },
];

test("collisions: wall, desk, door clearance, other block, outside", () => {
  const areas = [
    block("power_tools", 50, 25, 10, 10), // crosses the interior wall
    block("bits_blades", 80, 30, 6, 6), // on the desk
    block("hand_tools", 20, 3, 6, 4), // in front of the door
    block("safety_workwear", 30, 30, 8, 8),
    block("woodworking", 32, 32, 8, 8), // overlaps safety
    block("paint_finishing", 99, 25, 6, 6), // hangs outside
  ];
  const rep = analyzeBuild({ items: mini, areas }, catalog);
  const kinds = (k) => rep.results.get("a_" + k).collisions.map((c) => c.kind);
  assert.ok(kinds("power_tools").includes("wall"));
  assert.ok(kinds("bits_blades").includes("desk"));
  assert.ok(kinds("hand_tools").includes("entrance"));
  assert.ok(kinds("safety_workwear").includes("area"));
  assert.ok(kinds("woodworking").includes("area"));
  assert.ok(kinds("paint_finishing").includes("outside"));
  assert.equal(rep.progress.placed, 0);
});

test("findSpot finds a clear spot and Jerry offers to nudge", () => {
  const ctx = buildContext(mini);
  const b = block("bits_blades", 80, 30, 6, 6);
  const spot = findSpot(b, ctx, [b]);
  assert.ok(spot);
  assert.ok(isClear({ ...b, ...spot }, ctx, []));
  const rep = analyzeBuild({ items: mini, areas: [b] }, catalog);
  const tips = suggestions(rep, { items: mini, areas: [b] }, catalog, null, {});
  assert.equal(tips[0].id, "fix:" + b.id);
  assert.equal(tips[0].action.type, "move");
});

test("entry anchors resolve from layout item ids", () => {
  const b = block("decking_outdoor", 20, 12, 10, 4);
  const rep = analyzeBuild({ items: mini, areas: [b] }, catalog);
  const r = rep.results.get(b.id);
  assert.ok(r.entry.dist > 9 && r.entry.dist < 11, `front door distance ${r.entry.dist}`);
});

test("fitToZone pulls a block back inside its floor", () => {
  const ctx = buildContext(mini);
  const fit = fitToZone({ x: 98.5, y: 25, w: 6, d: 6, rot: 0 }, ctx);
  assert.equal(fit.x, 97);
});

test("unplaced departments get a place tip in the planned order", () => {
  const rep = analyzeBuild({ items: mini, areas: [] }, catalog);
  const tips = suggestions(rep, { items: mini, areas: [] }, catalog, null, { limit: 1 });
  assert.equal(tips[0].id, "place:power_tools");
  assert.equal(tips.filter((t) => t.id.startsWith("place:")).length, 10);
});

test("layout diffs", () => {
  const a = [{ id: "x", type: "gondola", x: 0, y: 0, w: 10, d: 3, rot: 0 }, { id: "y", type: "table", x: 5, y: 5, w: 2, d: 2 }];
  const b = [{ id: "x", type: "gondola", x: 4, y: 0, w: 10, d: 3, rot: 90 }, { id: "z", type: "table", x: 1, y: 1, w: 2, d: 2 }];
  const d = diffItems(a, b);
  assert.equal(d.moved.length, 1);
  assert.equal(d.added.length, 1);
  assert.equal(d.removed.length, 1);
  const rows = diffAreas([block("power_tools", 10, 10, 10, 10)], [block("power_tools", 10, 10, 10, 10), block("bits_blades", 30, 30, 5, 5)]);
  assert.equal(rows.find((r) => r.key === "power_tools").change, "same");
  assert.equal(rows.find((r) => r.key === "bits_blades").change, "added");
  assert.ok(matchScore(rows) > 0.49 && matchScore(rows) < 0.51);
});

// ---------- the real store (private seed) ----------
test("Claude's suggested plan is clean in the real store", { skip: !haveSeed && "no seed/ folder" }, () => {
  const areas = suggested.areas.map((a) => block(a.key, a.x, a.y, a.w, a.d, { groups: a.groups || [] }));
  const rep = analyzeBuild({ items: current.items, areas }, catalog);
  for (const [, r] of rep.results) {
    assert.deepEqual(r.collisions, [], `${r.name}: ${r.collisions.map((c) => c.label).join(", ")}`);
    assert.deepEqual(r.warnings, [], `${r.name}: ${r.warnings.map((c) => c.label).join(", ")}`);
    assert.ok(r.adjacency[0].ok, `${r.name} should be next to its primary neighbor`);
  }
  assert.equal(rep.progress.placed, 10);
  assert.ok(rep.progress.complete);
});

test("Jerry can walk between the doors in the real store", { skip: !haveSeed && "no seed/ folder" }, () => {
  const nav = new NavGrid(current.items);
  for (const [a, b] of [[[86, 45.5], [115, 5]], [[86, 45.5], [30, 60]], [[115, 5], [150, 30]]]) {
    assert.ok(nav.path(a[0], a[1], b[0], b[1]), `path ${a} -> ${b}`);
  }
});
