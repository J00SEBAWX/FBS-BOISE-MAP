/* The walkable grid used by the merchandising advisor (Phases 2-3).
 *
 * 6-inch cells over the store's floor areas. A cell is blocked when it is off the floor or closer than
 * walkRadiusFt to an obstacle: walls, columns, fixtures, counters, sales desks, stairs and raised platforms
 * (doors, openings and arches are passable, unless their id is listed in closedDoors). Obstacles are rotated
 * rectangles, the ring-shaped sales desk, or the exact `poly` outline an item carries (model.js: chamfered
 * raised floors) so a cut-off corner stays open floor. Every cell gets its
 * clearance: the exact distance to the nearest obstacle or the edge of the floor (capped at clearCapFt).
 * On top of that: walking routes between anchors (Dijkstra; routes prefer the middle of aisles the way
 * people walk), the width of the passage at a point (distance to the obstacles on BOTH sides), narrow
 * aisles and the sight-line ray caster used for the visibility polygons.
 *
 * Every number in WALK_DEFAULTS is a labelled, editable assumption. Pure: no DOM; Node imports it. */
import {rad, rayToSegment} from "./geometry.js";
import {TYPES} from "./model.js";
import {ringOf} from "./ring.js";

export const WALK_DEFAULTS = Object.freeze({
  cellFt: 0.5,            // grid cell (6 in)
  walkRadiusFt: 0.5,      // a cell is walkable when nothing is closer than this, so gaps under 1 ft are not passable
  clearCapFt: 8,          // clearance is measured up to this distance; passages wider than 2x this count as open floor
  platformStepFt: 0.25,   // platforms at least this high are a step up (blocked); thinner ones are floor finishes
  centreBias: 2,          // routing: up to 3x the cost for walking hard against a fixture (keeps routes mid-aisle)
  preferClearFt: 3,       // routing: clearance below this costs extra (half of a 6 ft main aisle)
  doorwayPadFt: 1.5,      // cells this close to a door, opening or arch count as "in the doorway"
  closedDoors: Object.freeze([]), // ids of doors that are kept closed (they block walking)
  blocksAsObstacles: false,       // department blocks are footprints you walk through, not obstacles
});
export const WALK_LABELS = Object.freeze({
  cellFt: "Walk grid cell, ft (6 in)",
  walkRadiusFt: "Gaps narrower than twice this are not walkable, ft",
  clearCapFt: "Clearance is measured up to this distance, ft",
  platformStepFt: "Platforms at least this high are a step (not walkable), ft",
  centreBias: "Routes prefer the middle of aisles (extra cost near fixtures)",
  preferClearFt: "Routes avoid passing closer than this to fixtures when they can, ft",
  doorwayPadFt: "Counts as in a doorway within this distance of the door, ft",
});

const PASSAGES = new Set(["door", "opening", "arch"]);
const NOT_OBSTACLE = new Set(["floor", "zone", "ceiling", "area", "door", "opening", "arch", "platform"]);
const STRUCTURAL = new Set(["wall", "column", "stairs", "door", "opening", "arch", "floor", "zone", "ceiling"]);
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** A map item -> plain geometry (finite numbers, a height), or null when it can't be used. */
export function itemGeo(it) {
  if (!it || typeof it !== "object" || typeof it.type !== "string") return null;
  const x = num(it.x, NaN), y = num(it.y, NaN), w = num(it.w, NaN), d = num(it.d, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(w > 0) || !(d > 0)) return null;
  const t = TYPES[it.type];
  // an exact outline in plan feet (model.js: chamfered raised floors and the like), else the rectangle
  const poly = Array.isArray(it.poly) && it.poly.length >= 3 && it.poly.length <= 64
    && it.poly.every(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])) ? it.poly.map(q => [q[0], q[1]]) : null;
  return {
    src: it, id: String(it.id ?? ""), type: it.type, name: typeof it.name === "string" ? it.name : "",
    x, y, w, d, rot: ((num(it.rot, 0) % 360) + 360) % 360, h: num(it.h, t ? t.h : 0), fixed: it.fixed === true, poly,
  };
}

/* ---------- obstacles (rotated rectangles, plus the ring-shaped sales desk) ---------- */
function rectOb(g, x, y, w, d, rotDeg, extra = {}) {
  const r = rad(rotDeg), c = Math.cos(r), s = Math.sin(r), hw = w / 2, hd = d / 2;
  const ex = Math.abs(c) * hw + Math.abs(s) * hd, ey = Math.abs(s) * hw + Math.abs(c) * hd;
  return {
    id: g.id, type: g.type, name: g.name, h: g.h, fixed: g.fixed, item: g.src,
    movable: !g.fixed && !STRUCTURAL.has(g.type) && g.type !== "ring" && g.type !== "platform" && g.type !== "area",
    x, y, c, s, hw, hd, rot: rotDeg, x0: x - ex, x1: x + ex, y0: y - ey, y1: y + ey, ring: null, ...extra,
  };
}
/** World outline of an obstacle, counter-clockwise: the rectangle's four corners, or the polygon's points. */
export function obCorners(o) {
  if (o.poly) return o.poly.pts.map(p => [p[0], p[1]]);
  const out = [];
  for (const [a, b] of [[-o.hw, -o.hd], [o.hw, -o.hd], [o.hw, o.hd], [-o.hw, o.hd]]) out.push([o.x + a * o.c - b * o.s, o.y + a * o.s + b * o.c]);
  return out;
}
/** An obstacle with an exact polygon outline (world feet): its bounding box plays the rectangle's part; never nudged. */
function polyOb(g) {
  let pts = g.poly;
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area2 += a[0] * b[1] - b[0] * a[1]; }
  if (area2 < 0) pts = [...pts].reverse(); // counter-clockwise, like the rectangles (the sight-line caster relies on it)
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const o = rectOb(g, (x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, 1e-3), Math.max(y1 - y0, 1e-3), 0);
  o.poly = {pts, segs: pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [p[0], p[1], q[0], q[1]]; })};
  o.movable = false;
  return o;
}
function ringOb(g) {
  const o = rectOb(g, g.x, g.y, g.w, g.d, g.rot);
  const rr = ringOf(g.src);
  const segs = [];
  for (const run of rr.runs) {
    const p = run.pts, n = p.length;
    for (let i = 0; i < (run.closed ? n : n - 1); i++) segs.push([p[i][0], p[i][1], p[(i + 1) % n][0], p[(i + 1) % n][1]]);
  }
  o.ring = {segs, hw: rr.h};
  return o;
}
/** Nearest point of a segment (local frame) to (px, py): [qx, qy, distance]. */
function segNear(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t, qy = ay + dy * t;
  return [qx, qy, Math.hypot(px - qx, py - qy)];
}
/** Distance from a point to an obstacle (0 inside). */
export function obDist(o, px, py) {
  if (o.poly) {
    if (inPoly(px, py, o.poly.pts)) return 0;
    let best = Infinity;
    for (const s of o.poly.segs) { const d = segNear(px, py, s[0], s[1], s[2], s[3])[2]; if (d < best) best = d; }
    return best;
  }
  const dx = px - o.x, dy = py - o.y, lx = dx * o.c + dy * o.s, ly = -dx * o.s + dy * o.c;
  if (!o.ring) {
    const ex = Math.abs(lx) - o.hw, ey = Math.abs(ly) - o.hd;
    if (ex <= 0 && ey <= 0) return 0;
    return Math.hypot(ex > 0 ? ex : 0, ey > 0 ? ey : 0);
  }
  let best = Infinity;
  for (const s of o.ring.segs) { const q = segNear(lx, ly, s[0], s[1], s[2], s[3]); if (q[2] < best) best = q[2]; }
  return Math.max(0, best - o.ring.hw);
}
/** Nearest point of an obstacle to (px, py): [x, y, distance]. */
export function obNearest(o, px, py) {
  if (o.poly) {
    if (inPoly(px, py, o.poly.pts)) return [px, py, 0];
    let best = null;
    for (const s of o.poly.segs) { const q = segNear(px, py, s[0], s[1], s[2], s[3]); if (!best || q[2] < best[2]) best = q; }
    return best;
  }
  const dx = px - o.x, dy = py - o.y, lx = dx * o.c + dy * o.s, ly = -dx * o.s + dy * o.c;
  let qx, qy;
  if (!o.ring) {
    qx = Math.max(-o.hw, Math.min(o.hw, lx)); qy = Math.max(-o.hd, Math.min(o.hd, ly));
  } else {
    let best = null;
    for (const s of o.ring.segs) { const q = segNear(lx, ly, s[0], s[1], s[2], s[3]); if (!best || q[2] < best[2]) best = q; }
    const L = best[2] || 1, k = best[2] > o.ring.hw ? o.ring.hw / L : 1;
    qx = best[0] + (lx - best[0]) * k; qy = best[1] + (ly - best[1]) * k;
  }
  const wx = o.x + qx * o.c - qy * o.s, wy = o.y + qx * o.s + qy * o.c;
  return [wx, wy, Math.hypot(px - wx, py - wy)];
}

/** Cuts the gaps for passages (doors, openings, arches) out of a wall: the wall pieces as obstacles. */
function wallPieces(g, passages) {
  const r = rad(g.rot), c = Math.cos(r), s = Math.sin(r), hw = g.w / 2, hd = g.d / 2;
  let ivs = [[-hw, hw]];
  for (const p of passages) {
    const dx = p.x - g.x, dy = p.y - g.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (Math.abs(Math.sin(rad(p.rot - g.rot))) > 0.2) continue;           // not along this wall
    if (Math.abs(ly) > hd + p.d / 2 + 0.6 || Math.abs(lx) > hw + p.w / 2) continue;
    const a = lx - p.w / 2, b = lx + p.w / 2, next = [];
    for (const [u, v] of ivs) {
      if (b <= u || a >= v) { next.push([u, v]); continue; }
      if (a > u) next.push([u, a]);
      if (b < v) next.push([b, v]);
    }
    ivs = next;
  }
  return ivs.filter(([u, v]) => v - u > 0.02).map(([u, v]) => {
    const m = (u + v) / 2;
    return rectOb(g, g.x + m * c, g.y + m * s, v - u, g.d, g.rot);
  });
}

/* ---------- the grid ---------- */
const cellRange = (G, a, b, o0, n) => [Math.max(0, Math.floor((a - o0) / G.cell)), Math.min(n - 1, Math.floor((b - o0) / G.cell))];

/** Floor mask: cells whose centre is on a floor area. */
function rasterFloor(G, floors) {
  const {nx, x0, y0, cell} = G, floor = new Uint8Array(G.N);
  for (const g of floors) {
    const ob = g.poly ? polyOb(g) : rectOb(g, g.x, g.y, g.w, g.d, g.rot), [i0, i1] = cellRange(G, ob.x0, ob.x1, x0, nx), [j0, j1] = cellRange(G, ob.y0, ob.y1, y0, G.ny);
    const {c, s, hw, hd} = ob;
    if (ob.poly) { // an exact outline: cells whose centres are inside the polygon
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inPoly(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell, ob.poly.pts)) floor[j * nx + i] = 1;
      continue;
    }
    if (Math.abs(c * s) < 1e-9) { // axis-aligned: whole runs of cells whose centres are inside
      const a = Math.ceil((ob.x0 - x0) / cell - 0.5 - 1e-6), b = Math.floor((ob.x1 - x0) / cell - 0.5 + 1e-6);
      const lo = Math.max(0, a), hi = Math.min(nx - 1, b);
      if (hi < lo) continue;
      for (let j = j0; j <= j1; j++) {
        const yc = y0 + (j + 0.5) * cell;
        if (yc < ob.y0 - 1e-6 || yc > ob.y1 + 1e-6) continue;
        floor.fill(1, j * nx + lo, j * nx + hi + 1);
      }
      continue;
    }
    for (let j = j0; j <= j1; j++) {
      const dy = y0 + (j + 0.5) * cell - ob.y;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + (i + 0.5) * cell - ob.x;
        if (Math.abs(dx * c + dy * s) <= hw + 1e-6 && Math.abs(-dx * s + dy * c) <= hd + 1e-6) floor[j * nx + i] = 1;
      }
    }
  }
  return floor;
}

/**
 * The edge of the floor as thin obstacles: every run of cell sides between a floor cell and an off-floor cell
 * becomes one segment (type "edge"). Walls normally stand on these lines; where none does (an exterior door,
 * a gap between floor areas) the edge still stops people walking off the floor.
 */
function floorEdges(G, floor) {
  const {nx, ny, x0, y0, cell} = G, out = [];
  const EDGE = {src: {id: "_edge", type: "edge", name: "the edge of the floor"}, id: "_edge", type: "edge", name: "the edge of the floor", h: 0, fixed: true};
  // a door, opening or arch on the edge is the way out, not a side: cut it out like a wall's gap
  const seg = (xa, ya, xb, yb) => {
    const g = {...EDGE, x: (xa + xb) / 2, y: (ya + yb) / 2, w: Math.max(Math.abs(xb - xa), Math.abs(yb - ya)), d: 1e-4, rot: xa === xb ? 90 : 0};
    for (const ob of wallPieces(g, G.passages)) { ob.edge = true; ob.movable = false; out.push(ob); }
  };
  for (let j = 0; j < ny - 1; j++) { // between rows j and j + 1
    let start = 0, side = 0;
    for (let i = 0; i <= nx; i++) {
      let sd = 0;
      if (i < nx) { const a = floor[j * nx + i], b = floor[(j + 1) * nx + i]; sd = a === b ? 0 : a ? 1 : -1; }
      if (sd !== side) { if (side) seg(x0 + start * cell, y0 + (j + 1) * cell, x0 + i * cell, y0 + (j + 1) * cell); start = i; side = sd; }
    }
  }
  for (let i = 0; i < nx - 1; i++) { // between columns i and i + 1
    let start = 0, side = 0;
    for (let j = 0; j <= ny; j++) {
      let sd = 0;
      if (j < ny) { const a = floor[j * nx + i], b = floor[j * nx + i + 1]; sd = a === b ? 0 : a ? 1 : -1; }
      if (sd !== side) { if (side) seg(x0 + (i + 1) * cell, y0 + start * cell, x0 + (i + 1) * cell, y0 + j * cell); start = j; side = sd; }
    }
  }
  return out;
}

/**
 * Clearance of every floor cell: exact distance to the nearest obstacle (or the edge of the floor), capped.
 * Each obstacle seeds the cells round its own outline; the nearest obstacle then spreads across the grid in
 * a forward and a backward raster pass, every cell testing its neighbours' nearest obstacles with the exact
 * distance (checked against brute force on the master: identical).
 */
function clearance(G, floor) {
  const {nx, ny, N, cell, x0, y0, cap, obstacles} = G;
  const clear = new Float32Array(N), near = new Int32Array(N).fill(-2), inside = new Int32Array(N).fill(-1);
  for (let k = 0; k < N; k++) if (floor[k]) clear[k] = cap;
  const pad = 1.5 * cell;
  for (const ob of obstacles) {
    const [i0, i1] = cellRange(G, ob.x0 - pad, ob.x1 + pad, x0, nx), [j0, j1] = cellRange(G, ob.y0 - pad, ob.y1 + pad, y0, ny);
    for (let j = j0; j <= j1; j++) {
      const py = y0 + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (!floor[k] || inside[k] >= 0) continue;
        const d = obDist(ob, x0 + (i + 0.5) * cell, py);
        if (d < clear[k]) { clear[k] = d; near[k] = ob.i; if (d <= 0 && !ob.edge) inside[k] = ob.i; }
      }
    }
  }
  // one forward and one backward raster pass: each cell tries its already-visited neighbours' nearest obstacles
  // (most neighbours share the cell's own nearest obstacle, so the exact distance is rarely needed)
  const test = (k, a, px, py) => {
    const d = obDist(obstacles[a], px, py);
    if (d < clear[k]) { clear[k] = d; near[k] = a; }
  };
  let a;
  for (let j = 1; j < ny - 1; j++) {
    const py = y0 + (j + 0.5) * cell, row = j * nx;
    for (let i = 1; i < nx - 1; i++) {
      const k = row + i;
      if (!floor[k] || inside[k] >= 0) continue;
      const px = x0 + (i + 0.5) * cell;
      if ((a = near[k - 1]) >= 0 && a !== near[k]) test(k, a, px, py);
      if ((a = near[k - nx - 1]) >= 0 && a !== near[k]) test(k, a, px, py);
      if ((a = near[k - nx]) >= 0 && a !== near[k]) test(k, a, px, py);
      if ((a = near[k - nx + 1]) >= 0 && a !== near[k]) test(k, a, px, py);
    }
    for (let i = nx - 2; i >= 1; i--) {
      const k = row + i;
      if (floor[k] && inside[k] < 0 && (a = near[k + 1]) >= 0 && a !== near[k]) test(k, a, x0 + (i + 0.5) * cell, py);
    }
  }
  for (let j = ny - 2; j >= 1; j--) {
    const py = y0 + (j + 0.5) * cell, row = j * nx;
    for (let i = nx - 2; i >= 1; i--) {
      const k = row + i;
      if (!floor[k] || inside[k] >= 0) continue;
      const px = x0 + (i + 0.5) * cell;
      if ((a = near[k + 1]) >= 0 && a !== near[k]) test(k, a, px, py);
      if ((a = near[k + nx + 1]) >= 0 && a !== near[k]) test(k, a, px, py);
      if ((a = near[k + nx]) >= 0 && a !== near[k]) test(k, a, px, py);
      if ((a = near[k + nx - 1]) >= 0 && a !== near[k]) test(k, a, px, py);
    }
    for (let i = 1; i < nx - 1; i++) {
      const k = row + i;
      if (floor[k] && inside[k] < 0 && (a = near[k - 1]) >= 0 && a !== near[k]) test(k, a, x0 + (i + 0.5) * cell, py);
    }
  }
  const walk = new Uint8Array(N), wr = G.opts.walkRadiusFt;
  for (let k = 0; k < N; k++) {
    if (clear[k] > cap) { clear[k] = cap; near[k] = -2; }
    if (floor[k] && clear[k] >= wr) walk[k] = 1;
  }
  return {clear, near, inside, walk};
}

/**
 * Builds the walkable grid for a map {items}. Options: WALK_DEFAULTS (each can be overridden).
 * Returns G: {cell, x0, y0, nx, ny, N, floor, walk, clear, inside, near, doorway, comp, obstacles, passages,
 * items, opts, ...}. Cell k = j * nx + i has its centre at (x0 + (i + 0.5) cell, y0 + (j + 0.5) cell).
 *   floor[k]   1 on a floor area          walk[k]    1 walkable
 *   clear[k]   clearance in ft (0 blocked) inside[k]  index of the obstacle the cell is inside, or -1
 *   near[k]    nearest obstacle index (-2 = nothing within clearCapFt; the floor's edge is type "edge")
 *   doorway[k] index into passages, or -1  comp[k]    connected walkable component id (0 = not walkable)
 */
export function buildWalkGrid(map, opts = {}) {
  const o = {...WALK_DEFAULTS, ...opts};
  const cell = o.cellFt, cap = o.clearCapFt;
  const closed = new Set(o.closedDoors || []);
  const items = ((map && map.items) || []).map(itemGeo).filter(Boolean);

  // passages and obstacles
  const passages = items.filter(g => PASSAGES.has(g.type) && !(g.type === "door" && closed.has(g.id)));
  const obstacles = [];
  for (const g of items) {
    if (g.type === "wall") { obstacles.push(...wallPieces(g, passages)); continue; }
    if (g.type === "door" && closed.has(g.id)) { obstacles.push(rectOb(g, g.x, g.y, g.w, Math.max(g.d, 0.7), g.rot)); continue; }
    if (g.type === "platform") { if (g.h >= o.platformStepFt) obstacles.push(g.poly ? polyOb(g) : rectOb(g, g.x, g.y, g.w, g.d, g.rot)); continue; }
    if (g.type === "area") { if (o.blocksAsObstacles) obstacles.push(rectOb(g, g.x, g.y, g.w, g.d, g.rot)); continue; }
    if (NOT_OBSTACLE.has(g.type) || !(TYPES[g.type] || {}).blocks) continue;
    obstacles.push(g.type === "ring" ? ringOb(g) : g.poly ? polyOb(g) : rectOb(g, g.x, g.y, g.w, g.d, g.rot));
  }
  obstacles.forEach((ob, i) => { ob.i = i; });

  // extent: the floors (else the walls), plus a margin so the border cells are off the floor
  let floors = items.filter(g => g.type === "floor");
  const extentOf = list => {
    let a = Infinity, b = Infinity, c2 = -Infinity, d2 = -Infinity;
    for (const g of list) { const ob = rectOb(g, g.x, g.y, g.w, g.d, g.rot); a = Math.min(a, ob.x0); b = Math.min(b, ob.y0); c2 = Math.max(c2, ob.x1); d2 = Math.max(d2, ob.y1); }
    return [a, b, c2, d2];
  };
  let ext;
  if (floors.length) ext = extentOf(floors);
  else {
    const walls = items.filter(g => g.type === "wall");
    if (!walls.length) throw new Error("The map has no floor areas or walls to walk on.");
    ext = extentOf(walls);
    floors = [{...walls[0], id: "_hull", type: "floor", x: (ext[0] + ext[2]) / 2, y: (ext[1] + ext[3]) / 2, w: ext[2] - ext[0], d: ext[3] - ext[1], rot: 0}];
  }
  const x0 = Math.floor(ext[0]) - 1, y0 = Math.floor(ext[1]) - 1;
  const nx = Math.ceil((ext[2] + 1 - x0) / cell), ny = Math.ceil((ext[3] + 1 - y0) / cell), N = nx * ny;
  if (N > 2_000_000) throw new Error("The map is too large for the walk grid.");
  const G = {cell, x0, y0, nx, ny, N, obstacles, passages, items, opts: o, cap};
  const cx = i => x0 + (i + 0.5) * cell, cy = j => y0 + (j + 0.5) * cell;
  const rangeI = (a, b) => cellRange(G, a, b, x0, nx), rangeJ = (a, b) => cellRange(G, a, b, y0, ny);

  const floor = rasterFloor(G, floors);
  for (const ob of floorEdges(G, floor)) { ob.i = obstacles.length; obstacles.push(ob); }
  // obstacle buckets (4 ft), each obstacle listed in every bucket within clearCapFt of it (used by widthAt)
  const B = 4, bnx = Math.ceil((nx * cell) / B), bny = Math.ceil((ny * cell) / B);
  const buckets = Array.from({length: bnx * bny}, () => []);
  for (const ob of obstacles) {
    const i0 = Math.max(0, Math.floor((ob.x0 - cap - x0) / B)), i1 = Math.min(bnx - 1, Math.floor((ob.x1 + cap - x0) / B));
    const j0 = Math.max(0, Math.floor((ob.y0 - cap - y0) / B)), j1 = Math.min(bny - 1, Math.floor((ob.y1 + cap - y0) / B));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[j * bnx + i].push(ob.i);
  }
  const NONE = [];
  G.bucketOf = (x, y) => {
    const i = Math.floor((x - x0) / B), j = Math.floor((y - y0) / B);
    return i < 0 || j < 0 || i >= bnx || j >= bny ? NONE : buckets[j * bnx + i];
  };
  const {clear, near, inside, walk} = clearance(G, floor);
  // doorways
  const doorway = new Int32Array(N).fill(-1);
  passages.forEach((p, pi) => {
    const ob = rectOb(p, p.x, p.y, p.w, p.d + 2 * o.doorwayPadFt, p.rot), [i0, i1] = rangeI(ob.x0, ob.x1), [j0, j1] = rangeJ(ob.y0, ob.y1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (obDist(ob, cx(i), cy(j)) <= 0) doorway[j * nx + i] = pi;
  });
  // connected components (4-neighbour)
  const comp = new Int32Array(N), queue = new Int32Array(N);
  let nComp = 0;
  const compSize = [0];
  for (let s = 0; s < N; s++) {
    if (!walk[s] || comp[s]) continue;
    const id = ++nComp; let h = 0, t = 0; queue[t++] = s; comp[s] = id;
    while (h < t) {
      const k = queue[h++], i = k % nx;
      if (i > 0 && walk[k - 1] && !comp[k - 1]) { comp[k - 1] = id; queue[t++] = k - 1; }
      if (i < nx - 1 && walk[k + 1] && !comp[k + 1]) { comp[k + 1] = id; queue[t++] = k + 1; }
      if (k >= nx && walk[k - nx] && !comp[k - nx]) { comp[k - nx] = id; queue[t++] = k - nx; }
      if (k + nx < N && walk[k + nx] && !comp[k + nx]) { comp[k + nx] = id; queue[t++] = k + nx; }
    }
    compSize.push(t);
  }
  Object.assign(G, {floor, walk, clear, inside, near, doorway, comp, compSize});
  return G;
}

/* ---------- cells ---------- */
/** Cell index at a point, or -1 off the grid. */
export function cellAt(G, x, y) {
  const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((y - G.y0) / G.cell);
  return i < 0 || j < 0 || i >= G.nx || j >= G.ny ? -1 : j * G.nx + i;
}
/** Centre [x, y] of cell k. */
export function cellCentre(G, k) {
  const i = k % G.nx, j = (k - i) / G.nx;
  return [G.x0 + (i + 0.5) * G.cell, G.y0 + (j + 0.5) * G.cell];
}
/** The walkable cell nearest to (x, y) within maxFt (optionally in component comp, optionally passing test(k)), or -1. */
export function nearestWalkable(G, x, y, maxFt = 6, comp = 0, test = null) {
  const k0 = cellAt(G, x, y);
  const ok = k => k >= 0 && G.walk[k] && (!comp || G.comp[k] === comp) && (!test || test(k));
  if (ok(k0)) return k0;
  const i0 = Math.floor((x - G.x0) / G.cell), j0 = Math.floor((y - G.y0) / G.cell), R = Math.ceil(maxFt / G.cell);
  for (let r = 1; r <= R; r++) {
    let best = -1, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) continue;
      const k = j * G.nx + i;
      if (!ok(k)) continue;
      const [px, py] = cellCentre(G, k), d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/**
 * Where a person stands to use an item: for a door, opening or arch its middle (or just inside it when the
 * middle is not walkable); for a desk or fixture the closest walkable cell outside it, preferring the side
 * facing `prefer` ([x, y], e.g. the front door). Returns {k, x, y} or null.
 */
export function standingSpot(G, it, {comp = 0, prefer = null, maxFt = 6} = {}) {
  const g = itemGeo(it);
  if (!g) return null;
  const spot = k => (k >= 0 ? {k, x: cellCentre(G, k)[0], y: cellCentre(G, k)[1]} : null);
  if (PASSAGES.has(g.type)) {
    const k = nearestWalkable(G, g.x, g.y, 0, comp);
    if (k >= 0) return spot(k);
    const r = rad(g.rot), nx = -Math.sin(r), ny = Math.cos(r); // the door's local +y (its front) in the world
    for (const off of [0.5, 1, 1.5, 2]) for (const sd of [1, -1]) {
      const reach = g.d / 2 + off, px = g.x + nx * reach * sd, py = g.y + ny * reach * sd;
      const kk = cellAt(G, px, py);
      if (kk >= 0 && G.walk[kk] && (!comp || G.comp[kk] === comp)) return spot(kk);
    }
    // somewhere else in the doorway; nothing within reach means the door is blocked
    return spot(nearestWalkable(G, g.x, g.y, Math.min(maxFt, g.d / 2 + 2.5), comp));
  }
  const ob = rectOb(g, g.x, g.y, g.w, g.d, g.rot);
  const i0 = Math.max(0, Math.floor((ob.x0 - maxFt - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.floor((ob.x1 + maxFt - G.x0) / G.cell));
  const j0 = Math.max(0, Math.floor((ob.y0 - maxFt - G.y0) / G.cell)), j1 = Math.min(G.ny - 1, Math.floor((ob.y1 + maxFt - G.y0) / G.cell));
  let best = -1, bs = Infinity;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * G.nx + i;
    if (!G.walk[k] || (comp && G.comp[k] !== comp)) continue;
    const [px, py] = cellCentre(G, k), d = obDist(ob, px, py);
    if (d <= 0 || d > maxFt) continue;
    const s = d + (prefer ? 0.02 * Math.hypot(px - prefer[0], py - prefer[1]) : 0);
    if (s < bs) { bs = s; best = k; }
  }
  return spot(best);
}

/* ---------- shortest walking routes ---------- */
/** Indexed binary min-heap over cell ids (decrease-key in place, so it never holds more than N entries). Reused between calls. */
class Heap {
  constructor(N) { this.N = N; this.key = new Float64Array(N); this.val = new Int32Array(N); this.pos = new Int32Array(N).fill(-1); this.n = 0; }
  reset() { for (let q = 0; q < this.n; q++) this.pos[this.val[q]] = -1; this.n = 0; }
  push(v, k) { // insert or lower the key of v
    let i = this.pos[v];
    if (i < 0) { i = this.n++; }
    else if (this.key[i] <= k) return;
    const K = this.key, V = this.val, P = this.pos;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; P[V[i]] = i; i = p; }
    K[i] = k; V[i] = v; P[v] = i;
  }
  pop() {
    const K = this.key, V = this.val, P = this.pos, v = V[0];
    P[v] = -1;
    const n = --this.n;
    if (n > 0) {
      const lk = K[n], lv = V[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= lk) break;
        K[i] = K[c]; V[i] = V[c]; P[V[i]] = i; i = c;
      }
      K[i] = lk; V[i] = lv; P[lv] = i;
    }
    return v;
  }
}
let HEAP = null;
const heapFor = N => { if (!HEAP || HEAP.N !== N) HEAP = new Heap(N); else HEAP.reset(); return HEAP; };
function costMul(G, bias, pref) {
  const key = bias + ":" + pref;
  G._mul = G._mul || {};
  if (G._mul[key]) return G._mul[key];
  const m = new Float32Array(G.N);
  for (let k = 0; k < G.N; k++) m[k] = bias > 0 && pref > 0 ? 1 + bias * Math.max(0, (pref - G.clear[k]) / pref) : 1;
  return (G._mul[key] = m);
}
/**
 * Dijkstra over the walkable cells (8 neighbours, no cutting corners) from one or more sources
 * (cell indices, or {k, d0, w}). opts: {bias, preferClearFt, targets: [k] (stop once all are reached),
 * carry: true (each cell remembers the w of the source that reached it)}.
 * -> {dist (Float32Array, cost in ft-equivalents; Infinity unreachable), prev (Int32Array), carry?}
 */
export function dijkstra(G, sources, opts = {}) {
  const {nx, ny, N, walk, cell} = G;
  const bias = opts.bias ?? G.opts.centreBias, pref = opts.preferClearFt ?? G.opts.preferClearFt;
  const mul = costMul(G, bias, pref);
  const dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const carry = opts.carry ? new Float32Array(N) : null;
  const heap = heapFor(N);
  for (const s of sources) {
    const k = typeof s === "number" ? s : s.k, d0 = typeof s === "number" ? 0 : s.d0 || 0;
    if (!(k >= 0) || !walk[k] || d0 >= dist[k]) continue;
    dist[k] = d0; if (carry) carry[k] = typeof s === "number" ? 1 : s.w ?? 1;
    heap.push(k, d0);
  }
  let remaining = 0;
  const targets = opts.targets ? new Uint8Array(N) : null;
  if (targets) for (const t of opts.targets) if (t >= 0 && !targets[t]) { targets[t] = 1; remaining++; }
  const D = cell * Math.SQRT2;
  while (heap.n) {
    const k = heap.pop();
    if (done[k]) continue;
    done[k] = 1;
    if (targets && targets[k] && --remaining <= 0) break;
    const dk = dist[k], i = k % nx, j = (k - i) / nx, mk = mul[k];
    const L = i > 0 && walk[k - 1] === 1, R = i < nx - 1 && walk[k + 1] === 1, Dn = j > 0 && walk[k - nx] === 1, U = j < ny - 1 && walk[k + nx] === 1;
    // the 8 neighbours (diagonals only when both sides are open: no cutting corners)
    for (let q = 0; q < 8; q++) {
      let m, len;
      switch (q) {
        case 0: if (!L) continue; m = k - 1; len = cell; break;
        case 1: if (!R) continue; m = k + 1; len = cell; break;
        case 2: if (!Dn) continue; m = k - nx; len = cell; break;
        case 3: if (!U) continue; m = k + nx; len = cell; break;
        case 4: if (!(L && Dn)) continue; m = k - nx - 1; len = D; break;
        case 5: if (!(R && Dn)) continue; m = k - nx + 1; len = D; break;
        case 6: if (!(L && U)) continue; m = k + nx - 1; len = D; break;
        default: if (!(R && U)) continue; m = k + nx + 1; len = D;
      }
      if (done[m] || walk[m] !== 1) continue;
      const nd = dk + len * (mk + mul[m]) * 0.5;
      if (nd < dist[m]) { dist[m] = nd; prev[m] = k; if (carry) carry[m] = carry[k]; heap.push(m, nd); }
    }
  }
  return {dist, prev, carry};
}
/**
 * Walking distance (ft) from many sources at once, without the mid-aisle preference: Dial's bucket queue with
 * chamfer steps (straight 2, diagonal 3 half-cells; within 6% of the true distance), much cheaper than
 * dijkstra(). sources: [{k, w}]; each cell also gets the w of the source that reached it.
 * -> {dist: Float32Array (Infinity unreachable), carry: Float32Array}
 */
export function walkDistance(G, sources) {
  const {nx, ny, N, walk, cell} = G;
  const di = new Int32Array(N).fill(-1), carry = new Float32Array(N);
  let buckets = [[]];
  for (const s of sources) if (s.k >= 0 && walk[s.k] && di[s.k] !== 0) { di[s.k] = 0; carry[s.k] = s.w ?? 1; buckets[0].push(s.k); }
  for (let d = 0; d < buckets.length; d++) {
    const b = buckets[d];
    if (!b) continue;
    for (let q = 0; q < b.length; q++) {
      const k = b[q];
      if (di[k] !== d) continue;
      const i = k % nx, j = (k - i) / nx;
      const L = i > 0 && walk[k - 1] === 1, R = i < nx - 1 && walk[k + 1] === 1, Dn = j > 0 && walk[k - nx] === 1, U = j < ny - 1 && walk[k + nx] === 1;
      for (let e = 0; e < 8; e++) {
        let m, c;
        switch (e) {
          case 0: if (!L) continue; m = k - 1; c = 2; break;
          case 1: if (!R) continue; m = k + 1; c = 2; break;
          case 2: if (!Dn) continue; m = k - nx; c = 2; break;
          case 3: if (!U) continue; m = k + nx; c = 2; break;
          case 4: if (!(L && Dn) || walk[k - nx - 1] !== 1) continue; m = k - nx - 1; c = 3; break;
          case 5: if (!(R && Dn) || walk[k - nx + 1] !== 1) continue; m = k - nx + 1; c = 3; break;
          case 6: if (!(L && U) || walk[k + nx - 1] !== 1) continue; m = k + nx - 1; c = 3; break;
          default: if (!(R && U) || walk[k + nx + 1] !== 1) continue; m = k + nx + 1; c = 3;
        }
        const nd = d + c;
        if (di[m] >= 0 && di[m] <= nd) continue;
        di[m] = nd; carry[m] = carry[k];
        while (buckets.length <= nd) buckets.push(null);
        (buckets[nd] || (buckets[nd] = [])).push(m);
      }
    }
    buckets[d] = null;
  }
  const dist = new Float32Array(N);
  for (let k = 0; k < N; k++) dist[k] = di[k] < 0 ? Infinity : di[k] * cell / 2;
  return {dist, carry};
}

/** The route from cell k back to the field's source: cells from k to the source, or null when unreachable. */
export function traceRoute(field, k) {
  if (!(k >= 0) || !Number.isFinite(field.dist[k])) return null;
  const out = [];
  for (let n = k, guard = 0; n !== -1 && guard < field.prev.length; n = field.prev[n], guard++) out.push(n);
  return out;
}
/** Walking length of a list of cells (ft). */
export function routeLength(G, cells) {
  let L = 0;
  for (let q = 1; q < cells.length; q++) { const a = cellCentre(G, cells[q - 1]), b = cellCentre(G, cells[q]); L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return L;
}
/**
 * The width of the passage along a route, cell by cell: the clearance (distance to the nearest obstacle or
 * the floor's edge), twice it (the aisle width when the route runs down the middle) and the measured width
 * from obstacle to obstacle on both sides (widthAt; Infinity on open floor).
 * -> {cells: [{k, x, y, clearFt, twiceClearFt, widthFt}], minWidthFt, minAt: {x, y} | null}
 */
export function pathWidths(G, cells) {
  const out = [];
  let minWidthFt = Infinity, minAt = null;
  for (const k of cells || []) {
    if (!(k >= 0) || k >= G.N) continue;
    const [x, y] = cellCentre(G, k), c = G.clear[k], w = widthAt(G, k).width;
    out.push({k, x, y, clearFt: c, twiceClearFt: 2 * c, widthFt: w});
    if (w < minWidthFt) { minWidthFt = w; minAt = {x, y}; }
  }
  return {cells: out, minWidthFt, minAt};
}
/** Cells -> a simplified polyline (Douglas-Peucker, tolerance in ft). */
export function simplifyRoute(G, cells, tol = 0.75) {
  const pts = cells.map(k => cellCentre(G, k));
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let bi = -1, bd = tol;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    for (let q = a + 1; q < b; q++) { const d = segNear(pts[q][0], pts[q][1], ax, ay, bx, by)[2]; if (d > bd) { bd = d; bi = q; } }
    if (bi >= 0) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, q) => keep[q]).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}

/* ---------- widths ---------- */
/**
 * Width of the passage at cell k: the distance to the nearest obstacle (or the edge of the floor) plus the
 * distance to the nearest one on the opposite side (at least 120 degrees round). Width is Infinity when the
 * other side is open floor (nothing within clearCapFt). -> {width, a: {x, y, i}, b: {x, y, i}|null} (i = obstacle
 * index; the edge of the floor is an obstacle of type "edge").
 */
export function widthAt(G, k) {
  const [px, py] = cellCentre(G, k);
  if (!G.floor[k] || G.inside[k] >= 0) return {width: 0, a: {x: px, y: py, i: G.inside[k]}, b: null};
  const cap = G.cap, c = [], inDoor = G.doorway[k] >= 0;
  for (const oi of G.bucketOf(px, py)) {
    const ob = G.obstacles[oi];
    if (inDoor && ob.edge) continue; // in a doorway the floor's edge is the way out, not a side
    if (px < ob.x0 - cap || px > ob.x1 + cap || py < ob.y0 - cap || py > ob.y1 + cap) continue;
    const q = obNearest(ob, px, py);
    if (q[2] <= cap) c.push({x: q[0], y: q[1], d: q[2], i: oi});
  }
  if (!c.length) return {width: Infinity, a: null, b: null};
  let a = c[0];
  for (const q of c) if (q.d < a.d) a = q;
  if (a.d <= 1e-9) return {width: 0, a, b: null};
  const ux = (a.x - px) / a.d, uy = (a.y - py) / a.d;
  let b = null;
  for (const q of c) {
    if (q === a || q.d <= 1e-9) continue;
    if (((q.x - px) * ux + (q.y - py) * uy) / q.d > -0.5) continue;
    if (!b || q.d < b.d) b = q;
  }
  return {width: b ? a.d + b.d : Infinity, a, b};
}

/** Is cell k on the middle line of a passage (its clearance peaks across the passage)? -> sharpness 0..1 */
function ridge(G, k) {
  const {nx, ny, clear, cell} = G, i = k % nx, j = (k - i) / nx, b = clear[k];
  let best = 0;
  for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const i1 = i - di, j1 = j - dj, i2 = i + di, j2 = j + dj;
    const a = i1 >= 0 && j1 >= 0 && i1 < nx && j1 < ny ? clear[j1 * nx + i1] : 0;
    const c = i2 >= 0 && j2 >= 0 && i2 < nx && j2 < ny ? clear[j2 * nx + i2] : 0;
    if (a > b + 1e-6 || c > b + 1e-6) continue;
    const s = (b - (a + c) / 2) / (cell * (di && dj ? Math.SQRT2 : 1));
    if (s > best) best = s;
  }
  return best;
}

/** The middle lines of all bounded passages (walkable cells where the clearance peaks across, below clearCapFt), optionally within mask. */
export function ridgeCells(G, mask = null) {
  const out = [];
  for (let k = 0; k < G.N; k++) if (G.walk[k] && G.clear[k] < G.cap && (!mask || mask[k]) && ridge(G, k) >= 0.2) out.push(k);
  return Int32Array.from(out);
}

/**
 * Narrow passages: cells on the middle line of a passage whose width is at least minWidth and under maxWidth,
 * grouped into spots. opts: {maxWidth, minWidth, mask (Uint8Array of cells to check), skipDoorways,
 * ridges (the ridgeCells() list, when already computed)}.
 * -> [{k, x, y, widthFt, cells, lengthFt, sides: [obstacle index | -1, ...]}] narrowest first.
 */
export function narrowAisles(G, {maxWidth, minWidth = 1.5, mask = null, skipDoorways = true, ridges = null} = {}) {
  const {N, nx, walk, clear, cell} = G, hit = new Float32Array(N);
  const lim = maxWidth / 2 + cell;
  const test = k => {
    if (!walk[k] || clear[k] >= lim || (mask && !mask[k]) || (skipDoorways && G.doorway[k] >= 0)) return;
    if (!ridges && ridge(G, k) < 0.2) return;
    const w = widthAt(G, k).width;
    if (w >= minWidth && w < maxWidth) hit[k] = w;
  };
  if (ridges) for (const k of ridges) test(k);
  else for (let k = 0; k < N; k++) test(k);
  const seen = new Uint8Array(N), out = [];
  for (let s = 0; s < N; s++) {
    if (!hit[s] || seen[s]) continue;
    const stack = [s], cells = []; seen[s] = 1;
    while (stack.length) {
      const k = stack.pop(); cells.push(k);
      const i = k % nx;
      for (const dk of [-1, 1, -nx, nx, -nx - 1, -nx + 1, nx - 1, nx + 1]) {
        const m = k + dk, mi = m % nx;
        if (m < 0 || m >= N || Math.abs(mi - i) > 1 || seen[m] || !hit[m]) continue;
        seen[m] = 1; stack.push(m);
      }
    }
    let kmin = cells[0];
    for (const k of cells) if (hit[k] < hit[kmin]) kmin = k;
    const w = widthAt(G, kmin), [x, y] = cellCentre(G, kmin);
    const sides = [w.a ? w.a.i : -1, w.b ? w.b.i : -1], pair = [...sides].sort((p, q) => p - q).join(",");
    const same = out.find(o => o.pair === pair && Math.hypot(o.x - x, o.y - y) < 4);
    if (same) {
      same.cells.push(...cells); same.lengthFt += cells.length * cell;
      if (hit[kmin] < same.widthFt) Object.assign(same, {k: kmin, x, y, widthFt: hit[kmin]});
      continue;
    }
    out.push({k: kmin, x, y, widthFt: hit[kmin], cells, lengthFt: cells.length * cell, sides, pair});
  }
  for (const o of out) delete o.pair;
  return out.sort((p, q) => p.widthFt - q.widthFt);
}

/* ---------- sight lines ---------- */
/**
 * What blocks the view: the grid's obstacles at least minHeight tall (walls with their openings and arches
 * cut out, columns, tall fixtures) plus doors (assumed closed for sight). exclude: ids to leave out.
 */
export function sightBlockers(G, {minHeight = 5, exclude = []} = {}) {
  const ex = new Set(exclude), out = [];
  for (const ob of G.obstacles) if (!ob.ring && ob.h >= minHeight && !ex.has(ob.id)) out.push(ob);
  for (const p of G.passages) if (p.type === "door" && !ex.has(p.id)) out.push(rectOb(p, p.x, p.y, p.w, Math.max(p.d, 0.3), p.rot));
  for (const ob of out) if (!ob.cs) ob.cs = obCorners(ob);
  return out;
}
/** Ray-cast visibility from (vx, vy): {x, y, range, rays, r: Float32Array (free distance per ray)}. */
export function visibility(blockers, vx, vy, range, rays = 360) {
  const r = new Float32Array(rays).fill(range), step = (2 * Math.PI) / rays, TWO = 2 * Math.PI;
  for (const b of blockers) {
    if (b.x1 < vx - range || b.x0 > vx + range || b.y1 < vy - range || b.y0 > vy + range) continue;
    if (obDist(b, vx, vy) <= 0) continue; // standing inside it: ignore it
    const cs = b.cs || (b.cs = obCorners(b)), nE = cs.length;
    for (let e = 0; e < nE; e++) {
      const a = cs[e], c = cs[(e + 1) % nE];
      if ((c[0] - a[0]) * (vy - a[1]) - (c[1] - a[1]) * (vx - a[0]) > 0) continue; // faces away
      let ta = Math.atan2(a[1] - vy, a[0] - vx), tc = Math.atan2(c[1] - vy, c[0] - vx);
      let lo = Math.min(ta, tc), hi = Math.max(ta, tc);
      if (hi - lo > Math.PI) { const t = lo; lo = hi; hi = t + TWO; } // wraps round +-PI
      const i0 = Math.ceil(lo / step - 1e-9), i1 = Math.floor(hi / step + 1e-9);
      for (let q = i0 - 1; q <= i1 + 1; q++) {
        const idx = ((q % rays) + rays) % rays, th = q * step;
        const t = rayToSegment(vx, vy, Math.cos(th), Math.sin(th), a, c);
        if (t < r[idx]) r[idx] = t;
      }
    }
  }
  return {x: vx, y: vy, range, rays, r};
}
/** Can the viewpoint see (px, py)? (conservative between two rays) */
export function canSee(vis, px, py) {
  const dx = px - vis.x, dy = py - vis.y, d = Math.hypot(dx, dy);
  if (d > vis.range) return false;
  if (d < 0.5) return true;
  let f = Math.atan2(dy, dx) / ((2 * Math.PI) / vis.rays);
  if (f < 0) f += vis.rays;
  const i = Math.floor(f) % vis.rays, j = (i + 1) % vis.rays;
  return d <= Math.min(vis.r[i], vis.r[j]) + 0.05;
}
/** The visibility polygon (points round the viewpoint; runs along the range circle thinned out). */
export function visibilityPolygon(vis) {
  const out = [], step = (2 * Math.PI) / vis.rays;
  for (let q = 0; q < vis.rays; q++) {
    const atRange = vis.r[q] >= vis.range - 1e-3, prevR = vis.r[(q + vis.rays - 1) % vis.rays] >= vis.range - 1e-3, nextR = vis.r[(q + 1) % vis.rays] >= vis.range - 1e-3;
    if (atRange && prevR && nextR && q % 6) continue;
    const th = q * step;
    out.push([Math.round((vis.x + Math.cos(th) * vis.r[q]) * 10) / 10, Math.round((vis.y + Math.sin(th) * vis.r[q]) * 10) / 10]);
  }
  return out;
}

/* ---------- polygons ---------- */
function segsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Shortest distance between two polygons ([[x, y]...]); 0 when they touch or overlap. */
export function polyDist(A, B) {
  if (inPoly(A[0][0], A[0][1], B) || inPoly(B[0][0], B[0][1], A)) return 0;
  let best = Infinity;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const c = B[j], d = B[(j + 1) % B.length];
      if (segsCross(a, b, c, d)) return 0;
      best = Math.min(best, segNear(a[0], a[1], c[0], c[1], d[0], d[1])[2], segNear(c[0], c[1], a[0], a[1], b[0], b[1])[2]);
    }
  }
  return best;
}
export {inPoly as pointInPolygon};
