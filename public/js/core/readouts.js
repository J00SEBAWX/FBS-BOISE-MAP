/* Live dimension readouts while moving, resizing or rotating an item (docs/DESIGN.md 4.4 step 11): its size, and
 * the gap from its outline to the nearest wall on each axis (east or west, north or south), with the points to
 * draw the dashed measure line between. Pure: no DOM. */
import {corners} from "./geometry.js";
import {outline as blockOutline} from "./areas.js";
import {rayToSegment} from "./geometry.js";

const MAX_GAP = 120; // ft: further than this is not worth a line

/** The item's outline in store feet (a department block's polygon, a chamfered platform, or the rectangle). */
export function outlineOf(it) {
  if (it.type === "area") return blockOutline(it);
  if (Array.isArray(it.poly) && it.poly.length >= 3) return it.poly;
  return corners(it);
}

/**
 * Gaps to the nearest wall face straight east, west, north and south of the item's bounding box, measured
 * from the box's side on that axis (rays from the middle of that side). targets = snap.buildSnapTargets(...).
 * Returns {x: {dir, d, from, to} | null, y: {...} | null} with the nearer side on each axis.
 */
export function wallGaps(it, targets) {
  const pts = outlineOf(it);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const walls = (targets && targets.walls) || [];
  const shoot = (px, py, ux, uy) => {
    let d = Infinity;
    for (const f of walls) {
      if (f.n[0] * ux + f.n[1] * uy > -1e-9) continue; // only faces that look back at the item
      const t = rayToSegment(px, py, ux, uy, f.a, f.b);
      if (t < d) d = t;
    }
    return d;
  };
  const probes = [
    {dir: "east", d: shoot(x1, cy, 1, 0), from: [x1, cy], axis: "x"},
    {dir: "west", d: shoot(x0, cy, -1, 0), from: [x0, cy], axis: "x"},
    {dir: "north", d: shoot(cx, y1, 0, 1), from: [cx, y1], axis: "y"},
    {dir: "south", d: shoot(cx, y0, 0, -1), from: [cx, y0], axis: "y"},
  ];
  const out = {x: null, y: null};
  for (const p of probes) {
    if (!Number.isFinite(p.d) || p.d > MAX_GAP) continue;
    const u = {east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1]}[p.dir];
    const g = {dir: p.dir, d: p.d, from: p.from, to: [p.from[0] + u[0] * p.d, p.from[1] + u[1] * p.d]};
    if (!out[p.axis] || g.d < out[p.axis].d) out[p.axis] = g;
  }
  return out;
}

/** Everything the plan draws while a gesture is on: size, wall gaps and (while rotating) the angle. */
export function readoutsFor(it, targets, opts = {}) {
  return {size: {w: it.w, d: it.d}, gaps: wallGaps(it, targets), angle: opts.rotating ? (it.rot || 0) : null};
}
