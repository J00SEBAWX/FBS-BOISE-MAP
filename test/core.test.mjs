// Unit tests for the map's pure modules (public/js/core/*): geometry, units, snapping, the layout model,
// picking, the walkable grid and the sales-desk rings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as G from "../public/js/core/geometry.js";
import { formatFtIn, parseLength, formatSqft } from "../public/js/core/units.js";
import { buildSnapTargets, snapPoint, snapRect, distancesFrom, describeSnap, GRID } from "../public/js/core/snap.js";
import {
  normalizeLayout, normalizeItem, startPose, frontDoor, heightToCeiling, ceilingAt, isStructure, isFloorAt, outlineOf, inOutline,
  platformTopAt, baseOf, passageTop, FOUNDATION_GRID,
} from "../public/js/core/model.js";
import { buildPickBoxes, pickRay } from "../public/js/core/pick.js";
import { buildNav, lookSpot, sees } from "../public/js/core/nav.js";
import { ringRuns, ringGaps, inRing, bandPoly } from "../public/js/core/ring.js";
import { createMeasure } from "../public/js/core/measure.js";
import { createStore } from "../public/js/core/events.js";

const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ""} expected ${b}, got ${a}`);

// ---------- geometry ----------
test("toLocal and toWorld undo each other at any rotation", () => {
  const it = { x: 12.5, y: -3, w: 6, d: 2, rot: 37 };
  for (const [lx, ly] of [[0, 0], [3, 1], [-2.5, 0.75], [10, -4]]) {
    const [wx, wy] = G.toWorld(it, lx, ly);
    const [bx, by] = G.toLocal(it, wx, wy);
    close(bx, lx); close(by, ly);
  }
});

test("corners run counter-clockwise and edges point outward", () => {
  const it = { x: 0, y: 0, w: 4, d: 2, rot: 90 };
  const c = G.corners(it);
  close(c[0][0], 1); close(c[0][1], -2); // back-left of a north-pointing item
  assert.ok(G.signedArea(c) > 0, "counter-clockwise");
  close(G.polygonArea(c), 8);
  for (const e of G.rectEdges(it)) {
    const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    assert.ok(!G.inItem(it, mid[0] + e.n[0] * 0.01, mid[1] + e.n[1] * 0.01), `${e.side} normal points out`);
    assert.ok(G.inItem(it, mid[0] - e.n[0] * 0.01, mid[1] - e.n[1] * 0.01), `${e.side} normal points out`);
  }
});

test("inItem, distToItem and bbox", () => {
  const it = { x: 10, y: 5, w: 4, d: 2, rot: 0 };
  assert.ok(G.inItem(it, 11.9, 5.9));
  assert.ok(!G.inItem(it, 12.2, 5));
  assert.ok(G.inItem(it, 12.2, 5, 0.25));
  close(G.distToItem(it, 15, 5), 3);
  close(G.distToItem(it, 15, 10), 5);
  const b = G.itemBBox({ x: 0, y: 0, w: 2, d: 2, rot: 45 });
  close(b.w, 2 * Math.SQRT2, 1e-12);
});

test("shoelace area and point in polygon", () => {
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]; // an L-shape
  close(G.polygonArea(L), 64);
  close(G.polygonArea([...L].reverse()), 64);
  assert.ok(G.signedArea([...L].reverse()) < 0);
  assert.ok(G.pointInPoly(2, 8, L));
  assert.ok(!G.pointInPoly(8, 8, L));
  assert.ok(G.pointInPoly(8, 2, L));
});

test("segment distance, projection and line crossing", () => {
  const c = G.closestOnSegment(5, 3, 0, 0, 10, 0);
  close(c.x, 5); close(c.y, 0); close(c.d, 3); close(c.t, 0.5);
  close(G.segmentDistance(-4, 3, 0, 0, 10, 0), 5); // clamped to the end
  close(G.projectOnLine(-4, 3, 0, 0, 10, 0).x, -4);  // not clamped
  assert.deepEqual(G.lineIntersection([0, 0], [1, 0], [5, -1], [5, 1]), [5, 0]);
  assert.equal(G.lineIntersection([0, 0], [1, 0], [0, 1], [1, 1]), null);
  close(G.rayToSegment(0, 0, 1, 0, [5, -1], [5, 1]), 5);
  assert.equal(G.rayToSegment(0, 0, -1, 0, [5, -1], [5, 1]), Infinity);
});

test("3D rays hit item boxes and the floor", () => {
  const shelf = { x: 10, y: 0, w: 4, d: 2, rot: 0 };
  const o = { x: 0, y: 0, z: 3 }, d = { x: 1, y: 0, z: 0 };
  close(G.rayItemBox(o, d, shelf, 0, 6), 8);
  assert.equal(G.rayItemBox(o, d, shelf, 0, 2), null, "passes over a 2 ft counter");
  const turned = { ...shelf, rot: 90 };
  close(G.rayItemBox(o, d, turned, 0, 6), 9);
  const down = G.rayPlaneZ({ x: 0, y: 0, z: 10 }, { x: 0.6, y: 0, z: -0.8 }, 0);
  close(down.x, 7.5); close(down.y, 0);
  assert.equal(G.rayPlaneZ({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 1 }, 0), null);
});

test("angles wrap", () => {
  close(G.wrapAngle(3 * Math.PI), Math.PI);
  close(G.wrapAngle(-Math.PI / 2 - 2 * Math.PI), -Math.PI / 2);
  assert.equal(G.normDeg(-90), 270);
  assert.equal(G.normDeg(720), 0);
});

// ---------- units ----------
test("feet and inches are written the way people read them", () => {
  assert.equal(formatFtIn(25.5), `25' 6"`);
  assert.equal(formatFtIn(0.5), `0' 6"`);
  assert.equal(formatFtIn(11.999), `12' 0"`);
  assert.equal(formatFtIn(-3.25), `-3' 3"`);
  assert.equal(formatFtIn(0), `0' 0"`);
  assert.equal(formatFtIn(12, { compact: true }), `12'`);
  assert.equal(formatFtIn(25.5, { compact: true }), `25'6"`);
  assert.equal(formatFtIn(1 + 0.5 / 12, { fraction: 2 }), `1' 0 1/2"`);
  assert.equal(formatFtIn(6.5 / 12 + 3, { fraction: 4 }), `3' 6 1/2"`);
  assert.equal(formatFtIn(NaN), "–");
  assert.equal(formatSqft(612.4), "612 sq ft");
  assert.equal(formatSqft(12500), "12,500 sq ft");
});

test("lengths are read the way people type them", () => {
  const cases = [
    ["25.5", 25.5], ["25", 25], [".5", 0.5], ["25'", 25], ["25'6", 25.5], [`25' 6"`, 25.5], [`25'6"`, 25.5], [`306"`, 25.5],
    ["306 in", 25.5], ["25 ft 6 in", 25.5], ["25ft", 25], [`6 1/2"`, 6.5 / 12], [`25' 6 1/2"`, 25 + 6.5 / 12], [`1/2"`, 0.5 / 12],
    ["-2'", -2], [`25’ 6”`, 25.5], ["2.5m", 2.5 * 3.280839895], ["300cm", 3 * 3.280839895], [`25' 6.5"`, 25 + 6.5 / 12],
  ];
  for (const [s, v] of cases) close(parseLength(s), v, 1e-6, s);
  for (const bad of ["", "abc", "25'14", "1/0\"", "5 apples", "--3", null, undefined]) assert.equal(parseLength(bad), null, String(bad));
  assert.equal(parseLength(7), 7);
});

test("formatting then reading a length lands within half an inch", () => {
  for (let v = -20; v <= 200; v += 3.37) close(parseLength(formatFtIn(v)), v, 1 / 24 + 1e-9, String(v));
});

// ---------- snapping ----------
// A south wall whose inside face is y = 0 (x 0..20), a west wall whose inside face is x = 0 (y 0..20),
// a stub wall that runs into the south wall (a T), a column, and a wall turned 45 degrees.
const ITEMS = [
  { id: "ws", type: "wall", name: "South wall", x: 10, y: -0.35, w: 20, d: 0.7, rot: 0 },
  { id: "ww", type: "wall", name: "West wall", x: -0.35, y: 10, w: 20, d: 0.7, rot: 90 },
  { id: "wt", type: "wall", name: "Stub wall", x: 15, y: 4.825, w: 10.35, d: 0.5, rot: 90 },
  { id: "c1", type: "column", name: "Column", x: 10, y: 10, w: 1, d: 1, rot: 0 },
  { id: "wr", type: "wall", name: "Slanted wall", x: 30, y: 10, w: 10, d: 0.5, rot: 45 },
  { id: "g1", type: "gondola", name: "Not a snap target", x: 6, y: 14, w: 8, d: 3, rot: 0 },
];
const T = buildSnapTargets(ITEMS);

test("snap targets: wall faces and ends, column faces, corners; fixtures are ignored", () => {
  assert.equal(T.faces.filter(f => f.id === "ws" && f.kind === "wall-face").length, 2);
  assert.equal(T.faces.filter(f => f.id === "ws" && f.kind === "wall-edge").length, 2);
  assert.equal(T.faces.filter(f => f.id === "c1" && f.kind === "column-face").length, 4);
  assert.equal(T.faces.filter(f => f.id === "g1").length, 0);
  // 4 corners each for 5 walls/columns, minus the stub wall's two corners buried in the south wall
  assert.equal(T.corners.length, 4 * 5 - 2);
  // a turned wall's long sides are still its faces
  assert.equal(T.faces.filter(f => f.id === "ww" && f.kind === "wall-face").length, 2);
});

test("grid snap: a point in the open lands on the 6-inch grid", () => {
  const s = snapPoint({ x: 5.13, y: 5.27 }, T, { tol: 0.75 });
  assert.equal(s.x, 5); assert.equal(s.y, 5.5);
  assert.deepEqual(s.snappedTo.map(t => t.kind), ["grid"]);
  assert.equal(GRID, 0.5);
});

test("wall-face snap: lands on the inside face and slides to the grid along it", () => {
  const s = snapPoint({ x: 5.13, y: 0.3 }, T, { tol: 0.75 });
  close(s.y, 0); close(s.x, 5);
  assert.equal(s.snappedTo[0].kind, "wall-face");
  assert.equal(s.snappedTo[0].id, "ws");
  assert.equal(s.snappedTo[0].side, "front");
  assert.equal(s.guides.length, 1);
  close(s.distances.toNearestWall, 0);
  assert.match(describeSnap(s.snappedTo), /^Wall face · South wall/);
  // with the grid off it keeps its position along the face
  const free = snapPoint({ x: 5.13, y: 0.3 }, T, { tol: 0.75, grid: 0 });
  close(free.x, 5.13); close(free.y, 0);
});

test("tolerance: just outside it the grid wins, just inside it the face wins", () => {
  const out = snapPoint({ x: 5.13, y: 0.9 }, T, { tol: 0.75 });
  assert.equal(out.snappedTo[0].kind, "grid");
  assert.equal(out.y, 1);
  const inside = snapPoint({ x: 5.13, y: 0.9 }, T, { tol: 1 });
  assert.equal(inside.snappedTo[0].kind, "wall-face");
  close(inside.y, 0);
  const none = snapPoint({ x: 5.13, y: 0.3 }, T, { snap: false });
  close(none.x, 5.13); close(none.y, 0.3);
  assert.equal(none.snappedTo.length, 0);
});

test("corner snap: the inside corner where two walls meet", () => {
  const s = snapPoint({ x: 0.3, y: 0.2 }, T, { tol: 0.75 });
  close(s.x, 0); close(s.y, 0);
  assert.equal(s.snappedTo[0].kind, "corner");
  assert.ok(s.guides.length >= 1);
});

test("crossing snap: a wall face running into another wall's face (a T)", () => {
  const s = snapPoint({ x: 14.55, y: 0.18 }, T, { tol: 0.75 });
  close(s.x, 14.75); close(s.y, 0);
  assert.equal(s.snappedTo.length, 2);
  assert.deepEqual(new Set(s.snappedTo.map(t => t.id)), new Set(["ws", "wt"]));
  assert.equal(s.guides.length, 2);
});

test("column faces snap like wall faces", () => {
  const s = snapPoint({ x: 10.68, y: 10.05 }, T, { tol: 0.75 });
  close(s.x, 10.5); close(s.y, 10);
  assert.equal(s.snappedTo[0].kind, "column-face");
  assert.equal(s.snappedTo[0].id, "c1");
  close(s.distances.toNearestColumn, 0);
  // the column's corner wins when the point is near it
  const c = snapPoint({ x: 10.6, y: 10.6 }, T, { tol: 0.75 });
  close(c.x, 10.5); close(c.y, 10.5);
  assert.equal(c.snappedTo[0].kind, "corner");
});

test("rotated walls: the point lands on the slanted face, on a 6-inch step along it", () => {
  const wr = ITEMS.find(i => i.id === "wr");
  const [px, py] = G.toWorld(wr, 1.03, 0.6);
  const s = snapPoint({ x: px, y: py }, T, { tol: 0.75 });
  assert.equal(s.snappedTo[0].id, "wr");
  assert.equal(s.snappedTo[0].kind, "wall-face");
  const [lx, ly] = G.toLocal(wr, s.x, s.y);
  close(ly, 0.25, 1e-9, "on the front face");
  const fromStart = lx + wr.w / 2; // along the face from its first corner
  close(fromStart / 0.5, Math.round(fromStart / 0.5), 1e-9, "on a 6-inch step");
});

test("distances to the nearest wall and along each axis", () => {
  const d = distancesFrom(5, 3, T);
  close(d.toNearestWall, 3);
  assert.equal(d.nearestWall.id, "ws");
  close(d.nearestWall.point[1], 0);
  close(d.axis.south.d, 3);
  close(d.axis.west.d, 5);
  close(d.axis.east.d, 9.75); // the stub wall's west face at x 14.75
  assert.equal(d.axis.north, null);
});

test("extra rectangles (department blocks later) are snap targets too", () => {
  const t = buildSnapTargets(ITEMS, { rects: [{ id: "z1", name: "Power Tools", x: 40, y: 40, w: 10, d: 10, rot: 0 }] });
  const s = snapPoint({ x: 45.3, y: 41.2 }, t, { tol: 0.75 });
  close(s.x, 45); close(s.y, 41);
  assert.equal(s.snappedTo[0].kind, "rect-edge");
  const ex = buildSnapTargets(ITEMS, { rects: [{ id: "z1", x: 40, y: 40, w: 10, d: 10, rot: 0 }], exclude: ["z1", "c1"] });
  assert.equal(ex.faces.some(f => f.id === "z1" || f.id === "c1"), false);
});

test("rectangles snap flush to a wall face and to the grid", () => {
  const r = snapRect({ id: "blk", x: 5.2, y: 2.3, w: 4, d: 4, rot: 0 }, T, { tol: 0.75 });
  close(r.y, 2); // back edge on the wall face y = 0
  close(r.x, 5); // lower edge (x 3.2) to the grid (x 3)
  assert.equal(r.snappedTo[0].kind, "wall-face");
});

test("a rectangle never snaps onto a wall's far face (into the wall)", () => {
  // back edge at y -0.45: inside the 0.7 ft south wall, 0.25 from its far (outer) face at y -0.7
  const r = snapRect({ id: "blk", x: 5.2, y: 1.55, w: 4, d: 4, rot: 0 }, T, { tol: 0.75 });
  close(r.y, 2, 1e-9, "pushed onto the near face y = 0, not pulled to y -0.7");
  assert.equal(r.snappedTo[0].side, "front");
  const r2 = snapRect({ id: "blk", x: 5.2, y: 1.4, w: 4, d: 4, rot: 0 }, T, { tol: 0.75 });
  close(r2.y, 2);
  // a block just outside the building, its front edge near the wall's outer face, sits against that face
  const out = snapRect({ id: "out", x: 5.2, y: -2.9, w: 4, d: 4, rot: 0 }, T, { tol: 0.75 });
  close(out.y, -2.7);
  assert.equal(out.snappedTo[0].side, "back");
});

test("rectangles snap to turned walls and to other rectangles (department blocks)", () => {
  const wr = ITEMS.find(i => i.id === "wr");
  // a block turned like the slanted wall, its back edge 0.4 ft off the wall's front face
  const [cx, cy] = G.toWorld(wr, 0, 0.25 + 0.4 + 1);
  const r = snapRect({ id: "b", x: cx, y: cy, w: 3, d: 2, rot: 45 }, T, { tol: 0.75, grid: 0 });
  const [, ly] = G.toLocal(wr, r.x, r.y);
  close(ly, 0.25 + 1, 1e-9, "back edge flush on the slanted face");
  assert.equal(r.snappedTo[0].id, "wr");
  // a block beside another block lines up flush with it (east face of z1 at x 45)
  const t = buildSnapTargets(ITEMS, { rects: [{ id: "z1", name: "Power Tools", x: 40, y: 40, w: 10, d: 10, rot: 0 }] });
  const b = snapRect({ id: "z2", x: 47.3, y: 40.2, w: 4, d: 4, rot: 0 }, t, { tol: 0.75 });
  close(b.x, 47);
  assert.equal(b.snappedTo[0].id, "z1");
  assert.equal(b.snappedTo[0].kind, "rect-edge");
  // a block overlapping the other one isn't pulled further into it
  const c = snapRect({ id: "z3", x: 44.5, y: 40.2, w: 4, d: 4, rot: 0 }, t, { tol: 0.75 });
  assert.ok(!c.snappedTo.some(s => s.id === "z1" && s.side === "left"), "not onto z1's far (west) face");
});

test("snap edge cases: owners filter, corner tolerance, crossings past a segment end, inside a wall", () => {
  // only columns: a point near the south wall falls back to the grid
  const s = snapPoint({ x: 5.13, y: 0.3 }, T, { tol: 0.75, owners: ["column"] });
  assert.equal(s.snappedTo[0].kind, "grid");
  // corner tolerance: 0.4 from the inside corner wins with the default (0.6 x tol = 0.45) but not with 0.3
  const near = { x: 0.3, y: 0.28 };
  assert.equal(snapPoint(near, T, { tol: 0.75 }).snappedTo[0].kind, "corner");
  const noCorner = snapPoint(near, T, { tol: 0.75, cornerTol: 0.3 });
  assert.notEqual(noCorner.snappedTo[0].kind, "corner");
  close(noCorner.x, 0); close(noCorner.y, 0); // still the inside corner, found as two faces crossing
  assert.equal(noCorner.snappedTo.length, 2);
  assert.match(describeSnap(noCorner.snappedTo), /^Corner · (South wall \/ West wall|West wall \/ South wall)$/);
  // a crossing more than tol past the end of a face doesn't count
  const lone = buildSnapTargets([
    { id: "a", type: "wall", name: "A", x: 5, y: 0, w: 10, d: 0.5, rot: 0 },
    { id: "b", type: "wall", name: "B", x: 13, y: 5, w: 8, d: 0.5, rot: 90 }, // its west face x 12.75 would cross A's faces at x 12.75, 2.75 ft past A's end
  ]);
  const p = snapPoint({ x: 12.6, y: 0.4 }, lone, { tol: 0.75 });
  assert.ok(p.snappedTo.length < 2 || p.snappedTo[1].kind === "grid", "no corner out in the open");
  // a point inside a wall lands on one of its faces (the nearer one)
  const inside = snapPoint({ x: 5.13, y: -0.25 }, T, { tol: 0.75 });
  close(inside.y, 0); assert.equal(inside.snappedTo[0].id, "ws");
  const inside2 = snapPoint({ x: 5.13, y: -0.5 }, T, { tol: 0.75 });
  close(inside2.y, -0.7); assert.equal(inside2.snappedTo[0].side, "back");
});

test("axis distances: a point on a wall face is 0 from that wall and measures across the room the other way", () => {
  const room = buildSnapTargets([
    { id: "s", type: "wall", name: "S", x: 15, y: -0.35, w: 31.4, d: 0.7, rot: 0 },
    { id: "n", type: "wall", name: "N", x: 15, y: 20.35, w: 31.4, d: 0.7, rot: 0 },
    { id: "w", type: "wall", name: "W", x: -0.35, y: 10, w: 20, d: 0.7, rot: 90 },
    { id: "e", type: "wall", name: "E", x: 30.35, y: 10, w: 20, d: 0.7, rot: 90 },
  ]);
  const s = snapPoint({ x: 0.3, y: 9.9 }, room, { tol: 0.75 });
  close(s.x, 0); close(s.y, 10);
  const a = s.distances.axis;
  close(a.east.d, 30); close(a.west.d, 0); close(a.north.d, 10); close(a.south.d, 10);
  const d = distancesFrom(15, 0, room).axis;
  close(d.north.d, 20); close(d.south.d, 0); close(d.east.d, 15); close(d.west.d, 15);
});

// ---------- outlines, raised floors, the foundation grid ----------
test("items can carry their own polygon outline", () => {
  const deck = normalizeItem({ id: "d", type: "platform", x: 5, y: 5, w: 10, d: 10, h: 1, poly: [[0, 0], [10, 0], [10, 6], [6, 10], [0, 10]] });
  assert.equal(outlineOf(deck).length, 5);
  assert.ok(inOutline(deck, 5, 5));
  assert.ok(!inOutline(deck, 8.6, 8.6), "the chamfered corner is outside");
  assert.ok(inOutline(deck, 8.6, 8.6, 1), "but within 1 ft of it");
  assert.ok(!inOutline(deck, 0.2, 5, -0.5), "a negative tolerance shrinks it");
  assert.equal(normalizeItem({ id: "x", type: "platform", poly: [[0, 0], [1, 1]] }).poly, undefined, "two points are not an outline");
  assert.equal(normalizeItem({ id: "x", type: "platform", poly: [[0, 0], [1, NaN], [1, 1]] }).poly, undefined);
  close(G.distToPolyEdge(5, 5, outlineOf(deck)), 6 / Math.SQRT2, 1e-9, "to the chamfer");
});

test("a ray enters an extruded polygon through its top or its sides", () => {
  const P = [[0, 0], [10, 0], [10, 6], [6, 10], [0, 10]];
  close(G.rayPrism({ x: 5, y: 5, z: 10 }, { x: 0, y: 0, z: -1 }, P, 0, 2), 8); // from above: the top at z 2
  close(G.rayPrism({ x: -5, y: 5, z: 1 }, { x: 1, y: 0, z: 0 }, P, 0, 2), 5); // from the side: x 0
  assert.equal(G.rayPrism({ x: 9.5, y: 9.5, z: 10 }, { x: 0, y: 0, z: -1 }, P, 0, 2), null, "the cut corner is empty");
  assert.equal(G.rayPrism({ x: -5, y: 5, z: 3 }, { x: 1, y: 0, z: 0 }, P, 0, 2), null, "passes over it");
  assert.equal(G.rayPrism({ x: 5, y: 5, z: 1 }, { x: 1, y: 0, z: 0 }, P, 0, 2), 0, "starts inside");
});

test("what stands on a raised floor starts on top of it", () => {
  const lay = normalizeLayout({ building: { length: 40, width: 40 }, items: [
    { id: "f", type: "floor", x: 20, y: 20, w: 40, d: 40 },
    { id: "deck", type: "platform", x: 10, y: 10, w: 10, d: 10, h: 1.3, poly: [[5, 5], [15, 5], [15, 11], [11, 15], [5, 15]] },
    { id: "desk", type: "counter", x: 8, y: 8, w: 4, d: 2, h: 3 },
    { id: "corner", type: "counter", x: 14, y: 14, w: 1, d: 1, h: 3 }, // inside the rectangle, outside the chamfer
    { id: "shelf", type: "gondola", x: 30, y: 30, w: 8, d: 4, h: 6 },
    { id: "steps", type: "stairs", x: 8, y: 8, w: 2, d: 2, h: 1.3 },
  ] });
  close(platformTopAt(lay, 8, 8), 1.3);
  close(platformTopAt(lay, 14, 14), 0);
  close(baseOf(lay, lay.byId.get("desk")), 1.3);
  close(baseOf(lay, lay.byId.get("corner")), 0);
  close(baseOf(lay, lay.byId.get("shelf")), 0);
  close(baseOf(lay, lay.byId.get("steps")), 0, 0, "stairs rise from the floor");
  close(baseOf(lay, lay.byId.get("deck")), 0);
  // picking: the desk's box starts on the deck
  const box = buildPickBoxes(lay).find(b => b.it.id === "desk");
  close(box.z0, 1.3); close(box.z1, 4.3);
});

test("the foundation grid is the calibrated drawing grid: row 1 north, row 5 south", () => {
  assert.deepEqual(Object.keys(FOUNDATION_GRID.columns), ["A", "B", "C", "D", "E", "F", "G", "H"]);
  close(FOUNDATION_GRID.rows[1], 80.35); close(FOUNDATION_GRID.rows[5], -0.35);
  assert.ok(FOUNDATION_GRID.rows[1] > FOUNDATION_GRID.rows[2] && FOUNDATION_GRID.rows[4] > FOUNDATION_GRID.rows[5], "rows run north to south");
  close(FOUNDATION_GRID.columns.D, 76.5); close(FOUNDATION_GRID.columns.F, 125.12); close(FOUNDATION_GRID.columns.G, 147.23);
});

// ---------- picking (3D) ----------
// a 30 x 20 room: a wall with a door and an arch in it, a ceiling, a mezzanine deck, a shelf
const ROOM = normalizeLayout({ building: { length: 30, width: 20 }, items: [
  { id: "fl", type: "floor", x: 15, y: 10, w: 30, d: 20 },
  { id: "c", type: "ceiling", x: 15, y: 10, w: 30, d: 20, h: 12 },
  { id: "w1", type: "wall", name: "Wall", x: 5, y: 10, w: 10, d: 0.5, h: 12 },
  { id: "dr", type: "door", name: "Door", x: 12, y: 10, w: 4, d: 0.5, h: 7 },
  { id: "w2", type: "wall", name: "Wall", x: 17, y: 10, w: 6, d: 0.5, h: 12 },
  { id: "ar", type: "arch", name: "Arch", x: 23, y: 10, w: 6, d: 0.5, h: 9 },
  { id: "w3", type: "wall", name: "Wall", x: 28, y: 10, w: 4, d: 0.5, h: 12 },
  { id: "mz", type: "zone", name: "Mezzanine", x: 25, y: 16, w: 10, d: 8, h: 8 },
  { id: "sh", type: "gondola", name: "Shelf", x: 6, y: 4, w: 8, d: 3, h: 6 },
] });
const BOXES = buildPickBoxes(ROOM), CEILS = ROOM.items.filter(i => i.type === "ceiling");
const across = (x, z) => pickRay(BOXES, CEILS, { x, y: 2, z }, { x: 0, y: 1, z: 0 }, { structure: true, fixtures: true });

test("picking: doors from the floor to the wall's top; openings only above the hole; decks block but aren't selected", () => {
  close(passageTop(ROOM, ROOM.byId.get("dr")), 12);
  const door = BOXES.find(b => b.it.id === "dr"), arch = BOXES.find(b => b.it.id === "ar");
  close(door.z0, 0); close(door.z1, 12);
  close(arch.z0, 9); close(arch.z1, 12);
  assert.equal(across(12, 3).item.id, "dr", "the door leaf");
  assert.equal(across(12, 10).item.id, "dr", "the header above the door");
  assert.equal(across(23, 4).item, null, "through the arch's opening ...");
  assert.equal(across(23, 4).hit, null, "... to nothing (a level ray)");
  assert.equal(across(23, 10.5).item.id, "ar", "the header above the arch");
  assert.equal(across(5, 8).item.id, "w1");
  assert.equal(across(5, 3).item.id, "sh", "the shelf in front of the wall");
  // looking down at the mezzanine: the deck stops the ray, nothing is selected
  const down = pickRay(BOXES, CEILS, { x: 25, y: 16, z: 30 }, { x: 0, y: 0, z: -1 }, { structure: true, fixtures: true });
  assert.equal(down.hit, "deck"); assert.equal(down.item, null); close(down.point.z, 8);
  // with the structure layer off it isn't there
  assert.equal(pickRay(BOXES, CEILS, { x: 25, y: 16, z: 30 }, { x: 0, y: 0, z: -1 }, { structure: false }).hit, "floor");
  // the ceiling, when shown, is hit before the floor
  const up = pickRay(BOXES, CEILS, { x: 2, y: 2, z: 30 }, { x: 0, y: 0, z: -1 }, { ceiling: true });
  assert.equal(up.hit, "ceiling");
  // a fixture's top, from above
  const shelf = pickRay(BOXES, CEILS, { x: 6, y: 4, z: 30 }, { x: 0, y: 0, z: -1 }, {});
  assert.equal(shelf.item.id, "sh"); close(shelf.point.z, 6);
});

// ---------- the walkable grid (Walk view) ----------
// two rooms split by a wall with a doorway, a shelf in the east room, nothing outside
const NAVL = normalizeLayout({ building: { length: 30, width: 12 }, items: [
  { id: "f", type: "floor", x: 15, y: 6, w: 30, d: 12 },
  { id: "wa", type: "wall", x: 15, y: 2.5, w: 5, d: 0.5, h: 10, rot: 90 },
  { id: "dr", type: "door", x: 15, y: 6.5, w: 3, d: 0.5, h: 7, rot: 90 },
  { id: "wb", type: "wall", x: 15, y: 10, w: 4, d: 0.5, h: 10, rot: 90 },
  { id: "sh", type: "gondola", x: 24, y: 6, w: 6, d: 2, h: 6 },
] });
const NAV = buildNav(NAVL);

test("walkable grid: walls, fixtures and the outside are blocked; the doorway is open", () => {
  assert.ok(NAV.blockedAt(15, 2.5), "in the wall");
  assert.ok(NAV.blockedAt(15.9, 2.5), "within the body radius of the wall");
  assert.ok(NAV.blockedAt(24, 6), "in the shelf");
  assert.ok(NAV.blockedAt(-1, 6) && NAV.blockedAt(0.3, 6), "outside, and too close to the outside");
  assert.ok(!NAV.blockedAt(15, 6.5), "the doorway");
  assert.ok(!NAV.blockedAt(5, 6));
  // every free cell is on the floor and away from the solids
  for (let j = 0; j < NAV.G.ny; j++) for (let i = 0; i < NAV.G.nx; i++) {
    if (!NAV.free(i, j)) continue;
    const [x, y] = NAV.cellC(i, j);
    assert.ok(isFloorAt(NAVL, x, y), `free cell ${x},${y} is on the floor`);
    for (const it of NAVL.items) if (it.type === "wall" || it.type === "gondola") assert.ok(!G.inItem(it, x, y, 0.5), `free cell ${x},${y} clear of ${it.id}`);
  }
});

test("walkable grid: paths go through the doorway, every straight leg is clear, unreachable spots fail", () => {
  const p = NAV.plan(5, 3, 26, 3);
  assert.ok(p, "a path from the west room to the east room");
  const pts = [p.start, ...p.path];
  for (let k = 1; k < pts.length; k++) assert.ok(NAV.los(pts[k - 1], pts[k]), `leg ${k} is clear`);
  assert.ok(pts.some(q => Math.abs(q[0] - 15) < 2.5 && q[1] > 5 && q[1] < 8), "it goes through the door");
  close(p.goal[0], 26, 0.5); close(p.goal[1], 3, 0.5);
  assert.equal(NAV.los([5, 3], [26, 3]), false, "not straight through the wall");
  const reach = NAV.reachable(5, 3);
  const [i, j] = NAV.cellOf(26, 3);
  assert.equal(reach[j * NAV.G.nx + i], 1, "the east room is reachable");
  // seal the doorway: no way across
  const sealed = buildNav(normalizeLayout({ building: { length: 30, width: 12 }, items: [...NAVL.items.filter(it => it.id !== "dr"), { id: "wc", type: "wall", x: 15, y: 6.5, w: 3, d: 0.5, rot: 90 }] }));
  assert.equal(sealed.plan(5, 3, 26, 3), null);
});

test("look spot: in front of a fixture, reachable, with no wall in between", () => {
  const sh = NAVL.byId.get("sh");
  const spot = lookSpot(NAV, NAVL.items.filter(i => i.type === "wall"), sh, 5, 3);
  assert.ok(spot);
  const [lx, ly] = G.toLocal(sh, spot[0], spot[1]);
  assert.ok(ly > sh.d / 2 && Math.abs(lx) <= sh.w / 2 + 0.01, "in front of the shelf");
  assert.ok(!NAV.blockedAt(spot[0], spot[1]));
  assert.ok(sees(NAVL.items.filter(i => i.type === "wall"), sh, spot[0], spot[1]));
  assert.equal(sees(NAVL.items.filter(i => i.type === "wall"), sh, 5, 2.5), false, "the wall hides it from the west room");
});

// ---------- sales-desk rings ----------
test("rings: an octagon with a staff opening is one open run; with no opening it is one closed loop", () => {
  const base = { x: 0, y: 0, w: 16, d: 10, rot: 0, t: 2.5, shape: "oct", cham: 1.75 };
  const closed = ringRuns(base);
  assert.equal(closed.runs.length, 1); assert.equal(closed.runs[0].closed, true); assert.equal(closed.runs[0].pts.length, 8);
  close(closed.h, 1.25);
  const open = { ...base, gap: { side: "S", a: 6, b: 10 } };
  assert.deepEqual(ringGaps(open), [{ side: "S", c: 0, w: 4 }]);
  const r = ringRuns(open);
  assert.equal(r.runs.length, 1); assert.equal(r.runs[0].closed, false);
  const ends = [r.runs[0].pts[0], r.runs[0].pts[r.runs[0].pts.length - 1]];
  for (const e of ends) close(e[1], -3.75, 1e-9, "the run ends on the south side's centre line");
  close(Math.abs(ends[0][0] - ends[1][0]), 4, 1e-9, "4 ft opening");
  // two openings make two runs
  assert.equal(ringRuns({ ...base, open: { sides: ["N", "S"], w: 3 } }).runs.length, 2);
  // standing in the opening or in the middle is free; on the counter is not
  assert.ok(!inRing(open, 0, -3.75)); assert.ok(!inRing(open, 0, 0)); assert.ok(inRing(open, -5, -3.75)); assert.ok(inRing(base, 0, -3.75));
  // the band around a closed loop has a hole; an open run's band doesn't
  assert.ok(bandPoly(closed.runs[0], 1.25).hole); assert.equal(bandPoly(r.runs[0], 1.25).hole, null);
});

// ---------- the master layout (public/data/master.json is the one copy) ----------
const RAW = JSON.parse(readFileSync(new URL("../public/data/master.json", import.meta.url)));
const master = normalizeLayout(RAW);

test("the master layout loads: every item, ids unique, all numbers finite", () => {
  assert.ok(RAW.items.length > 100);
  assert.equal(master.items.length, RAW.items.length, "no item dropped");
  assert.equal(master.byId.size, RAW.items.length, "ids are unique");
  for (const it of master.items) for (const k of ["x", "y", "w", "d", "h", "rot"]) assert.ok(Number.isFinite(it[k]), `${it.id}.${k}`);
  assert.equal(master.building.L, 169);
});

test("the walk starts just inside the moved front door, facing into the store", () => {
  const door = frontDoor(master);
  assert.equal(door.id, "i30");
  close(door.y, 10.95);
  const p = startPose(master);
  assert.ok(p.y > door.y + 1 && p.y < door.y + 8, `y ${p.y}`);
  close(p.x, door.x, 1e-6);
  close(p.yaw, 0, 1e-9); // facing north
  assert.ok(isFloorAt(master, p.x, p.y));
});

test("blueprint data: outlines, raised floors, the north-east back room, walking in from the front door", () => {
  // the chamfered laser deck and 1-step floor keep their outlines
  assert.equal(outlineOf(master.byId.get("i91")).length, 6);
  assert.equal(outlineOf(master.byId.get("bp_step_plat")).length, 5);
  // Tom's south desk return stands on the laser deck, the cedar desks on the 1-step floor
  close(baseOf(master, master.byId.get("i90")), 1.3);
  close(baseOf(master, master.byId.get("i87")), 0.6);
  close(baseOf(master, master.byId.get("n10015m49")), 0.6);
  close(baseOf(master, master.byId.get("i50")), 0);
  // the old floorless pocket (x 127-139, y 70-80) is a room now, with a ceiling
  assert.ok(isFloorAt(master, 133, 75));
  close(ceilingAt(master, 133, 75), 10.9);
  // walking: from the start, through the new walls, into the store's rooms
  const nav = buildNav(master), p0 = startPose(master);
  assert.ok(!nav.blockedAt(p0.x, p0.y), "the start spot is free");
  for (const [x, y, what] of [[76, 50, "sales floor"], [140, 40, "front room"], [133, 75, "back room"], [30, 60, "warehouse"], [110, 52, "1-step floor"]]) {
    const p = nav.plan(p0.x, p0.y, x, y);
    assert.ok(p, `a path to the ${what}`);
    const pts = [p.start, ...p.path];
    for (let k = 1; k < pts.length; k++) assert.ok(nav.los(pts[k - 1], pts[k]), `${what}: leg ${k} is clear`);
  }
  // no free cell inside a wall or a column
  const solids = master.items.filter(it => it.type === "wall" || it.type === "column");
  for (let j = 0; j < nav.G.ny; j += 2) for (let i = 0; i < nav.G.nx; i += 2) {
    if (!nav.free(i, j)) continue;
    const [x, y] = nav.cellC(i, j);
    for (const it of solids) assert.ok(!G.inItem(it, x, y), `free cell ${x},${y} inside ${it.id}`);
  }
});

test("walls reach the ceiling above them; structure is what SPEC-v3-API says", () => {
  close(heightToCeiling(master, master.byId.get("i18")), 20.3); // 18 ft grid-C wall under the 20.3 ft warehouse deck
  close(heightToCeiling(master, master.byId.get("i13")), 20.3);
  close(heightToCeiling(master, master.byId.get("i28")), 19.3); // arch wall next to the 19.3 ft sales floor
  close(heightToCeiling(master, master.byId.get("i8")), 16);    // already above the 10.3 ft drop ceiling
  close(heightToCeiling(master, master.byId.get("c_laser")), 12.6); // a short post in a tall room stays a post
  close(ceilingAt(master, 76, 50), 19.3);
  close(ceilingAt(master, 150, 60), 9);  // under the mezzanine
  assert.ok(isStructure(master.byId.get("i42")));  // column
  assert.ok(isStructure(master.byId.get("i47")));  // fixed sales desk
  assert.ok(isStructure(master.byId.get("c1")));   // ceiling
  assert.ok(!isStructure(master.byId.get("i50"))); // gondola
});

// ---------- small state helpers ----------
test("measure tool: A, then B, then start again", () => {
  const m = createMeasure();
  assert.equal(m.state.distance, null);
  m.move({ x: 1, y: 1 });
  assert.equal(m.click({ x: 0, y: 0 }), "a");
  m.move({ x: 3, y: 4 });
  close(m.state.distance, 5);
  assert.equal(m.click({ x: 6, y: 8 }), "b");
  close(m.state.distance, 10);
  m.move({ x: 100, y: 100 });
  close(m.state.distance, 10, 1e-9, "B stays put");
  assert.equal(m.click({ x: 1, y: 1 }), "restart");
  assert.equal(m.state.b, null);
  m.clear();
  assert.equal(m.state.a, null);
});

test("store: set merges and notifies once with the changed keys", () => {
  const s = createStore({ view: "3d", n: 1 });
  const calls = [];
  s.subscribe((st, changed) => calls.push(changed));
  s.set({ view: "3d" });
  s.set({ view: "plan", n: 1 });
  assert.deepEqual(calls, [["view"]]);
  assert.equal(s.get().view, "plan");
  assert.throws(() => { s.get().view = "x"; });
});
