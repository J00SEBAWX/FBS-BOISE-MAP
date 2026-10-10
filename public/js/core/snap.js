/* Snapping for placing and measuring on the floor: a 6" grid, wall faces and ends, column faces, and any
 * list of rectangles (department blocks in a later phase), all within a tolerance in feet.
 * Pure: no DOM, no three.js. The 2D plan and the 3D view both call snapPoint with the floor point under
 * the pointer and draw what it returns. */
import {closestOnSegment, corners, inItem, lineIntersection, rectEdges, rayToSegment, toWorld, EPS} from "./geometry.js";

export const GRID = 0.5;           // 6 inches
export const DEFAULT_TOL = 0.75;   // feet (callers usually pass ~12 screen pixels converted to feet)

const SIN_PARALLEL = Math.sin(Math.PI / 90); // 2 degrees
const SIN_CROSSING = Math.sin(Math.PI / 9);  // 20 degrees: two faces that cross at least this much make a corner

/**
 * Collects what can be snapped to.
 *  faces:   [{a, b, n, len, kind, owner, id, name, side}] kind: "wall-face" (long sides), "wall-edge" (ends),
 *           "column-face", "rect-edge"
 *  corners: [{x, y, kind: "corner", owner, id, name}]
 * opts.rects: extra rectangles ({id, name, x, y, w, d, rot}); opts.exclude: ids to leave out.
 */
export function buildSnapTargets(items, opts = {}) {
  const exclude = new Set(opts.exclude || []);
  const faces = [], cornerList = [];
  const add = (it, owner) => {
    if (exclude.has(it.id)) return;
    const long = it.w >= it.d;
    for (const e of rectEdges(it)) {
      let kind;
      if (owner === "wall") kind = (e.side === "back" || e.side === "front") === long ? "wall-face" : "wall-edge";
      else if (owner === "column") kind = "column-face";
      else kind = "rect-edge";
      faces.push({...e, kind, owner, id: it.id, name: it.name || ""});
    }
    for (const [x, y] of corners(it)) cornerList.push({x, y, kind: "corner", owner, id: it.id, name: it.name || ""});
  };
  for (const it of items) {
    if (it.type === "wall") add(it, "wall");
    else if (it.type === "column") add(it, "column");
  }
  for (const r of opts.rects || []) add(r, "rect");
  // a corner buried inside another wall or column (a stub wall running into a wall) is not a corner anyone sees
  const solids = items.filter(it => (it.type === "wall" || it.type === "column") && !exclude.has(it.id));
  const visible = cornerList.filter(c => !solids.some(it => it.id !== c.id && inItem(it, c.x, c.y, -1e-6)));
  return {faces, corners: visible, walls: faces.filter(f => f.owner === "wall")};
}

/** Round to the grid (6" by default). */
export const toGrid = (v, grid = GRID) => Math.round(v / grid) * grid;

/**
 * Snaps a floor point.
 * opts: grid (ft, 0 = no grid), tol (ft), cornerTol (ft, default 0.6 x tol), snap (false = only measure distances),
 *       owners (["wall", "column", "rect"]).
 * Returns {x, y, raw: {x, y}, snappedTo: [{kind, owner, id, name, side}], guides: [{a, b, kind}],
 *          distances: {toNearestWall, nearestWall: {id, name, point, side} | null, toNearestColumn, axis: {east, west, north, south}}}
 * Order of preference: a corner, then two faces crossing (an inside corner), then one face (sliding along it on
 * the grid), then the grid.
 */
export function snapPoint(p, targets, opts = {}) {
  const grid = opts.grid ?? GRID, tol = opts.tol ?? DEFAULT_TOL, cornerTol = opts.cornerTol ?? tol * 0.6;
  const owners = new Set(opts.owners || ["wall", "column", "rect"]);
  const raw = {x: p.x, y: p.y};
  let x = p.x, y = p.y, snappedTo = [], guides = [];
  const faces = targets.faces.filter(f => owners.has(f.owner));

  if (opts.snap !== false) {
    const res = snapToCorner(raw, targets.corners.filter(c => owners.has(c.owner)), faces, cornerTol)
      || snapToCrossing(raw, faces, tol)
      || snapToFace(raw, faces, tol, grid)
      || snapToGrid(raw, grid);
    if (res) ({x, y, snappedTo, guides} = res);
  }
  return {x, y, raw, snappedTo, guides, distances: distancesFrom(x, y, targets)};
}

function snapToCorner(p, cornerList, faces, tol) {
  let best = null, bd = tol;
  for (const c of cornerList) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d <= bd) { bd = d; best = c; } }
  if (!best) return null;
  const touching = faces.filter(f => f.id === best.id && (near(f.a, best) || near(f.b, best)));
  return {
    x: best.x, y: best.y,
    snappedTo: [{kind: "corner", owner: best.owner, id: best.id, name: best.name}],
    guides: touching.map(f => ({a: f.a, b: f.b, kind: "snap"})),
  };
}
const near = (pt, c) => Math.hypot(pt[0] - c.x, pt[1] - c.y) < 1e-6;

function snapToCrossing(p, faces, tol) {
  const close = faces.map(f => ({f, c: closestOnSegment(p.x, p.y, f.a[0], f.a[1], f.b[0], f.b[1])})).filter(o => o.c.d <= tol);
  let best = null, bd = tol;
  for (let i = 0; i < close.length; i++) for (let j = i + 1; j < close.length; j++) {
    const f = close[i].f, g = close[j].f;
    if (f.id === g.id) continue; // a rectangle's own corners are handled as corners
    const ux = (f.b[0] - f.a[0]) / f.len, uy = (f.b[1] - f.a[1]) / f.len, vx = (g.b[0] - g.a[0]) / g.len, vy = (g.b[1] - g.a[1]) / g.len;
    if (Math.abs(ux * vy - uy * vx) < SIN_CROSSING) continue;
    const X = lineIntersection(f.a, f.b, g.a, g.b);
    if (!X) continue;
    // the crossing must lie on both faces (allowing tol past their ends)
    if (closestOnSegment(X[0], X[1], f.a[0], f.a[1], f.b[0], f.b[1]).d > tol || closestOnSegment(X[0], X[1], g.a[0], g.a[1], g.b[0], g.b[1]).d > tol) continue;
    const d = Math.hypot(X[0] - p.x, X[1] - p.y);
    if (d <= bd) { bd = d; best = {X, f, g}; }
  }
  if (!best) return null;
  return {
    x: best.X[0], y: best.X[1],
    snappedTo: [ref(best.f), ref(best.g)],
    guides: [{a: best.f.a, b: best.f.b, kind: "snap"}, {a: best.g.a, b: best.g.b, kind: "snap"}],
  };
}

function snapToFace(p, faces, tol, grid) {
  let best = null;
  for (const f of faces) {
    const c = closestOnSegment(p.x, p.y, f.a[0], f.a[1], f.b[0], f.b[1]);
    // prefer the face itself over an end cap of the same thickness when both are equally close
    const score = c.d + (f.kind === "wall-edge" ? 1e-3 : 0);
    if (c.d <= tol && (!best || score < best.score)) best = {f, c, score};
  }
  if (!best) return null;
  const {f} = best;
  let {x, y} = best.c;
  const snappedTo = [ref(f)];
  // slide along the face to the nearest grid step (measured from the face's start for a slanted face)
  if (grid > 0) {
    const ux = (f.b[0] - f.a[0]) / f.len, uy = (f.b[1] - f.a[1]) / f.len;
    let along;
    if (Math.abs(uy) < EPS) along = toGridAlong(x, f.a[0], ux, grid);          // east-west face: round x
    else if (Math.abs(ux) < EPS) along = toGridAlong(y, f.a[1], uy, grid);     // north-south face: round y
    else along = Math.round(((x - f.a[0]) * ux + (y - f.a[1]) * uy) / grid) * grid;
    if (along >= -1e-9 && along <= f.len + 1e-9) {
      const gx = f.a[0] + ux * along, gy = f.a[1] + uy * along;
      if (Math.hypot(gx - p.x, gy - p.y) <= tol + grid) { x = gx; y = gy; snappedTo.push({kind: "grid"}); }
    }
  }
  return {x, y, snappedTo, guides: [{a: f.a, b: f.b, kind: "snap"}]};
}
// distance along a face (from its start a, direction sign u) to the grid line nearest to coordinate v
function toGridAlong(v, a, u, grid) { return (Math.round(v / grid) * grid - a) * Math.sign(u); }

function snapToGrid(p, grid) {
  if (!(grid > 0)) return null;
  return {x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid, snappedTo: [{kind: "grid"}], guides: []};
}

const ref = f => ({kind: f.kind, owner: f.owner, id: f.id, name: f.name, side: f.side});

/**
 * Distances from a point: to the nearest wall face (and which one), to the nearest column, and straight east,
 * west, north and south to the first wall face ({d, point} or null when no wall is that way).
 */
export function distancesFrom(x, y, targets) {
  let toNearestWall = Infinity, nearestWall = null, toNearestColumn = Infinity, nearestColumn = null;
  for (const f of targets.faces) {
    if (f.owner !== "wall" && f.owner !== "column") continue;
    const c = closestOnSegment(x, y, f.a[0], f.a[1], f.b[0], f.b[1]);
    if (f.owner === "wall" && c.d < toNearestWall) { toNearestWall = c.d; nearestWall = {id: f.id, name: f.name, side: f.side, kind: f.kind, point: [c.x, c.y]}; }
    if (f.owner === "column" && c.d < toNearestColumn) { toNearestColumn = c.d; nearestColumn = {id: f.id, name: f.name, side: f.side, point: [c.x, c.y]}; }
  }
  const axis = {};
  for (const [k, ux, uy] of [["east", 1, 0], ["west", -1, 0], ["north", 0, 1], ["south", 0, -1]]) {
    let d = Infinity;
    // only faces that look back toward the point count: a point standing on a face is 0 from it on that side,
    // and the face behind it (or the wall's far face) doesn't stop the ray
    for (const f of targets.walls) {
      if (f.n[0] * ux + f.n[1] * uy > -1e-9) continue;
      const t = rayToSegment(x, y, ux, uy, f.a, f.b);
      if (t < d) d = t;
    }
    axis[k] = Number.isFinite(d) ? {d, point: [x + ux * d, y + uy * d]} : null;
  }
  return {toNearestWall, nearestWall, toNearestColumn, nearestColumn, axis};
}

/**
 * Snaps a rectangle ({x, y, w, d, rot}) so its edges sit flush on nearby parallel faces (wall faces, column
 * faces, other rectangles), separately along its own two axes; an axis with no face nearby snaps its lower
 * edge to the grid (only when the rectangle is square to the building). Returns {x, y, snappedTo, guides}.
 * An edge only sits against a face that looks back at it (the wall's near face, never its far face), so a
 * block can't be pulled into a wall.
 */
export function snapRect(rect, targets, opts = {}) {
  const grid = opts.grid ?? GRID, tol = opts.tol ?? DEFAULT_TOL;
  const owners = new Set(opts.owners || ["wall", "column", "rect"]);
  const faces = targets.faces.filter(f => owners.has(f.owner) && f.id !== rect.id);
  const edges = rectEdges(rect);
  const best = {u: null, v: null}; // u: along the rect's length axis (left/right edges), v: depth axis (back/front)
  for (const e of edges) {
    const axis = e.side === "left" || e.side === "right" ? "u" : "v";
    const ex = (e.b[0] - e.a[0]) / e.len, ey = (e.b[1] - e.a[1]) / e.len;
    for (const f of faces) {
      const fx = (f.b[0] - f.a[0]) / f.len, fy = (f.b[1] - f.a[1]) / f.len;
      if (Math.abs(ex * fy - ey * fx) > SIN_PARALLEL) continue;
      if (e.n[0] * f.n[0] + e.n[1] * f.n[1] > -0.9) continue; // facing each other, not back to back
      // signed gap from the edge line to the face line, along the edge's outward normal
      const off = (f.a[0] - e.a[0]) * e.n[0] + (f.a[1] - e.a[1]) * e.n[1];
      if (Math.abs(off) > tol) continue;
      // the two must overlap along the edge
      const t0 = (f.a[0] - e.a[0]) * ex + (f.a[1] - e.a[1]) * ey, t1 = (f.b[0] - e.a[0]) * ex + (f.b[1] - e.a[1]) * ey;
      if (Math.max(t0, t1) < -tol || Math.min(t0, t1) > e.len + tol) continue;
      if (!best[axis] || Math.abs(off) < Math.abs(best[axis].off)) best[axis] = {off, n: e.n, f};
    }
  }
  let x = rect.x, y = rect.y;
  const snappedTo = [], guides = [];
  for (const axis of ["u", "v"]) {
    const b = best[axis];
    if (b) { x += b.n[0] * b.off; y += b.n[1] * b.off; snappedTo.push(ref(b.f)); guides.push({a: b.f.a, b: b.f.b, kind: "snap"}); }
  }
  const square = Math.abs(((rect.rot || 0) % 90 + 90) % 90) < 1e-6;
  if (grid > 0 && square) {
    // an axis with nothing to sit against: put the rectangle's lower edge on the grid along that world axis
    const cs = corners({...rect, x, y}), xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
    const worldAxis = a => { const [ax, ay] = toWorld({...rect, x: 0, y: 0}, a === "u" ? 1 : 0, a === "v" ? 1 : 0); return Math.abs(ax) > Math.abs(ay) ? "x" : "y"; };
    for (const axis of ["u", "v"]) {
      if (best[axis]) continue;
      if (worldAxis(axis) === "x") { const lo = Math.min(...xs); x += toGrid(lo, grid) - lo; }
      else { const lo = Math.min(...ys); y += toGrid(lo, grid) - lo; }
      if (!snappedTo.some(s => s.kind === "grid")) snappedTo.push({kind: "grid"});
    }
  }
  return {x, y, snappedTo, guides};
}

/** Plain words for a snap result ("Wall face · South wall", "Corner · Column", "Grid"). */
export function describeSnap(snappedTo) {
  if (!snappedTo || !snappedTo.length) return "";
  const s = snappedTo[0];
  const what = {corner: "Corner", "wall-face": "Wall face", "wall-edge": "Wall end", "column-face": "Column face", "rect-edge": "Edge", grid: "Grid"}[s.kind] || s.kind;
  if (snappedTo.length > 1 && snappedTo[1].kind !== "grid") return `Corner · ${clean(s.name)} / ${clean(snappedTo[1].name)}`;
  return s.name ? `${what} · ${clean(s.name)}` : what;
}
const clean = n => String(n || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
