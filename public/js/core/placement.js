/* Where a new department block or fixture lands when the person taps "place" / "Add" (not when they click a spot in 3D).
 * Pure: no DOM (the app hands in the rectangles it measured).
 *
 *   visibleBox(box, covers)   the largest part of the map that no sheet or drawer covers (screen pixels). On a phone the
 *                             Departments sheet takes the lower three quarters of the screen and opening it moves the
 *                             middle of the canvas far off the store, so the middle of what is VISIBLE is the right place.
 *   dropSpot(doc, probe, want, {building, grid})
 *                             `want` moved inside the building, then to the nearest spot (looking outward in rings) where the
 *                             new item neither sits on another block nor on a wall, column, stairs, desk or doorway, and does
 *                             not stack exactly on one of its own kind. So each next placement goes beside the last one
 *                             instead of on top of it, and nothing lands outside the store. */
import {checkItem, prepare} from "./collisions.js";

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const areaOf = r => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);

/** The largest rectangle of `box` left after cutting away each cover that overlaps it (all {x0, y0, x1, y1}, screen px). */
export function visibleBox(box, covers = []) {
  let best = {x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1};
  for (const c of covers) {
    const x0 = Math.max(c.x0, best.x0), y0 = Math.max(c.y0, best.y0), x1 = Math.min(c.x1, best.x1), y1 = Math.min(c.y1, best.y1);
    if (x1 - x0 < 1 || y1 - y0 < 1) continue; // not over the map
    const left = [
      {x0: best.x0, y0: best.y0, x1: best.x1, y1: y0},  // above the cover
      {x0: best.x0, y0: y1, x1: best.x1, y1: best.y1},  // below it
      {x0: best.x0, y0: best.y0, x1: x0, y1: best.y1},  // to its left
      {x0: x1, y0: best.y0, x1: best.x1, y1: best.y1},  // to its right
    ].filter(r => areaOf(r) > 0);
    if (left.length) best = left.reduce((a, b) => (areaOf(b) > areaOf(a) ? b : a));
  }
  return best;
}

const NEAR_FT = 2.5;   // search step near the wanted spot (a block lands right beside the last one)
const NEAR_RINGS = 8;  // ... out to 20 ft
const FAR_FT = 5;      // then a 5 ft lattice over the whole floor, nearest first

/**
 * probe: the item about to be added, with its size (type, w, d, h, rot, cat for a block); `want`: {x, y} in store feet.
 * Returns {x, y, free}: free = nothing warns about that spot. Never throws; with no room anywhere it still returns the
 * clamped, least bad spot.
 */
export function dropSpot(doc, probe, want, {building, grid = 0, margin = 0.5} = {}) {
  const L = num(building && building.L, 169), W = num(building && building.W, 80);
  const hw = num(probe.w, 10) / 2, hd = num(probe.d, 10) / 2;
  const box = {x0: hw + margin, x1: Math.max(hw + margin, L - hw - margin), y0: hd + margin, y1: Math.max(hd + margin, W - hd - margin)};
  const inside = (x, y) => ({x: clamp(x, box.x0, box.x1), y: clamp(y, box.y0, box.y1)});
  const snap = v => (grid > 0 ? Math.round(v / grid) * grid : v);
  const P = prepare(doc);
  const stacked = (x, y) => doc.items.some(it => it.type === probe.type && Math.abs(it.x - x) < 0.5 && Math.abs(it.y - y) < 0.5);
  // Sitting on another block is far worse than brushing a wall or column, and the more of it the worse: so with no clean
  // spot left (all ten departments on a desktop) the block goes where it only nicks a wall, not on top of a neighbour.
  const weigh = list => list.reduce((c, i) => c + (i.kind === "block" ? 1000 + 5 * (i.sqft || 0) : (i.severity === "error" ? 100 : 10) + (i.sqft || 0)), 0);
  const cost = (x, y) => {
    const it = {...probe, id: "_drop", x, y};
    // the cheap test first (walls, columns, stairs, desks, doorways, blocks); the slower "outside the floor" sampling only for spots that pass it
    let c = (stacked(x, y) ? 100 : 0) + weigh(checkItem(P, it, {outside: false}));
    if (c === 0) c = weigh(checkItem(P, it));
    return c;
  };
  const p0 = inside(num(want && want.x, L / 2), num(want && want.y, W / 2));
  const seen = new Set();
  let best = null;
  /** Tries a spot; returns it when nothing warns about it. */
  const tryAt = (x, y) => {
    const c = inside(snap(x), snap(y));
    const id = c.x.toFixed(2) + "," + c.y.toFixed(2);
    if (seen.has(id)) return null;
    seen.add(id);
    const score = cost(c.x, c.y) + Math.hypot(c.x - p0.x, c.y - p0.y) * 0.01;
    if (!best || score < best.score) best = {x: c.x, y: c.y, score};
    return score < 1 ? {x: c.x, y: c.y, free: true} : null;
  };
  // 1. rings round the wanted spot, close in
  for (let r = 0; r <= NEAR_RINGS; r++) {
    const ring = [];
    if (r === 0) ring.push([0, 0]);
    else for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push([i * NEAR_FT, j * NEAR_FT]);
    ring.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    for (const [dx, dy] of ring) { const hit = tryAt(p0.x + dx, p0.y + dy); if (hit) return hit; }
  }
  // 2. every centre the block could have, on a coarser lattice, nearest to the wanted spot first
  const lattice = [];
  const nx = Math.ceil(L / FAR_FT), ny = Math.ceil(W / FAR_FT);
  for (let i = -nx; i <= nx; i++) for (let j = -ny; j <= ny; j++) {
    const x = p0.x + i * FAR_FT, y = p0.y + j * FAR_FT;
    if (x < box.x0 - 1e-9 || x > box.x1 + 1e-9 || y < box.y0 - 1e-9 || y > box.y1 + 1e-9) continue;
    lattice.push([x, y, (x - p0.x) ** 2 + (y - p0.y) ** 2]);
  }
  lattice.sort((a, b) => a[2] - b[2]);
  for (const [x, y] of lattice) { const hit = tryAt(x, y); if (hit) return hit; }
  return {x: best.x, y: best.y, free: best.score < 1};
}
