/* Plan geometry in store feet: x runs east, y runs north, origin at the inside of the south-west corner.
 * An item is a rotated rectangle: centre (x, y), length w along its own axis, depth d, rotation rot in
 * degrees (counter-clockwise, seen from above). Pure functions only: no DOM, no three.js, so Node can
 * import this file for the unit tests. */

/* ---------- numbers and angles ---------- */
export const EPS = 1e-9;
export const rad = d => d * Math.PI / 180;
export const deg = r => r * 180 / Math.PI;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Angle in radians folded into (-PI, PI]. */
export function wrapAngle(a) {
  a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a === -Math.PI ? Math.PI : a;
}
/** Rotation in degrees folded into [0, 360). */
export const normDeg = d => ((d % 360) + 360) % 360;

/* ---------- rotated rectangles (items) ---------- */
/** World point -> the item's own frame (lx along its length, ly toward its front). */
export function toLocal(it, px, py) {
  const r = -rad(it.rot || 0), dx = px - it.x, dy = py - it.y, c = Math.cos(r), s = Math.sin(r);
  return [dx * c - dy * s, dx * s + dy * c];
}
/** The item's own frame -> world point. */
export function toWorld(it, lx, ly) {
  const r = rad(it.rot || 0), c = Math.cos(r), s = Math.sin(r);
  return [it.x + lx * c - ly * s, it.y + lx * s + ly * c];
}
/** The four corners in order: back-left, back-right, front-right, front-left (counter-clockwise). */
export function corners(it) {
  const w = it.w / 2, d = it.d / 2;
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([a, b]) => toWorld(it, a, b));
}
/** Is the point inside the item's rectangle (grown by tol feet on every side)? */
export function inItem(it, px, py, tol = 0) {
  const [lx, ly] = toLocal(it, px, py);
  return Math.abs(lx) <= it.w / 2 + tol && Math.abs(ly) <= it.d / 2 + tol;
}
/** Distance from a point to the item's rectangle (0 inside). */
export function distToItem(it, px, py) {
  const [lx, ly] = toLocal(it, px, py);
  return Math.hypot(Math.max(0, Math.abs(lx) - it.w / 2), Math.max(0, Math.abs(ly) - it.d / 2));
}
/** The four edges as segments with outward unit normals: [{a, b, n, side}] (side: "back" | "right" | "front" | "left"). */
export function rectEdges(it) {
  const c = corners(it), out = [], sides = ["back", "right", "front", "left"];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // corners run counter-clockwise, so the outward normal is the edge direction turned clockwise
    out.push({a, b, n: [(b[1] - a[1]) / L, -(b[0] - a[0]) / L], side: sides[i], len: L});
  }
  return out;
}

/* ---------- boxes and polygons ---------- */
/** Axis-aligned bounds of a list of [x, y] points. */
export function bbox(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return {x0, y0, x1, y1, w: x1 - x0, h: y1 - y0};
}
export const itemBBox = it => bbox(corners(it));
/** Signed area by the shoelace formula (positive = counter-clockwise). */
export function signedArea(pts) {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]; s += x0 * y1 - x1 * y0; }
  return s / 2;
}
/** Polygon area in square feet (shoelace formula). */
export const polygonArea = pts => Math.abs(signedArea(pts));
/** Even-odd point in polygon test (points exactly on an edge may land either way). */
export function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a polygon's outline (its edges). */
export function distToPolyEdge(px, py, pts) {
  let d = Infinity;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const e = closestOnSegment(px, py, a[0], a[1], b[0], b[1]).d;
    if (e < d) d = e;
  }
  return d;
}

/* ---------- segments ---------- */
/** Closest point on segment AB to P: {x, y, t (0..1 along AB), d (distance)}. */
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 < EPS ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
  const x = ax + dx * t, y = ay + dy * t;
  return {x, y, t, d: Math.hypot(px - x, py - y)};
}
export const segmentDistance = (px, py, ax, ay, bx, by) => closestOnSegment(px, py, ax, ay, bx, by).d;
/** Projection of P on the infinite line through A and B: {x, y, t (unclamped), d}. */
export function projectOnLine(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 < EPS ? 0 : ((px - ax) * dx + (py - ay) * dy) / L2;
  const x = ax + dx * t, y = ay + dy * t;
  return {x, y, t, d: Math.hypot(px - x, py - y)};
}
/** Intersection of the infinite lines AB and CD, or null when they are (nearly) parallel. */
export function lineIntersection(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  const lr = Math.hypot(r[0], r[1]), ls = Math.hypot(s[0], s[1]);
  if (Math.abs(den) < 1e-6 * lr * ls || lr < EPS || ls < EPS) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}
/** Distance along a ray from (px, py) in unit direction (ux, uy) to segment AB, or Infinity if it misses. */
export function rayToSegment(px, py, ux, uy, a, b) {
  const sx = b[0] - a[0], sy = b[1] - a[1], den = ux * sy - uy * sx;
  if (Math.abs(den) < EPS) return Infinity;
  const qx = a[0] - px, qy = a[1] - py;
  const t = (qx * sy - qy * sx) / den, u = (qx * uy - qy * ux) / den;
  return t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
}

/* ---------- 3D: rays against item boxes ---------- */
/**
 * Where a 3D ray first enters an item's box. Plan coordinates with z up: origin {x, y, z}, direction {x, y, z}.
 * The box is the item's rectangle from height z0 to z1. Returns the distance t along the ray, or null.
 */
export function rayItemBox(o, d, it, z0, z1) {
  const r = -rad(it.rot || 0), c = Math.cos(r), s = Math.sin(r);
  const ox = (o.x - it.x) * c - (o.y - it.y) * s, oy = (o.x - it.x) * s + (o.y - it.y) * c;
  const dx = d.x * c - d.y * s, dy = d.x * s + d.y * c;
  let t0 = -Infinity, t1 = Infinity;
  for (const [org, dir, lo, hi] of [[ox, dx, -it.w / 2, it.w / 2], [oy, dy, -it.d / 2, it.d / 2], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dir) < EPS) { if (org < lo || org > hi) return null; continue; }
    let a = (lo - org) / dir, b = (hi - org) / dir;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  return t0 >= 0 ? t0 : 0;
}
/**
 * Where a 3D ray first enters an upright prism: the polygon pts (plan feet) from height z0 to z1.
 * Returns the distance t along the ray (0 when it starts inside), or null when it misses.
 */
export function rayPrism(o, d, pts, z0, z1) {
  if (!(z1 > z0) || pts.length < 3) return null;
  if (o.z >= z0 && o.z <= z1 && pointInPoly(o.x, o.y, pts)) return 0;
  let best = Infinity;
  // the top and the bottom
  if (Math.abs(d.z) > EPS) for (const z of [z0, z1]) {
    const t = (z - o.z) / d.z;
    if (t >= 0 && t < best && pointInPoly(o.x + d.x * t, o.y + d.y * t, pts)) best = t;
  }
  // the sides: the ray (in plan) against each edge, then the height at that point
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], sx = b[0] - a[0], sy = b[1] - a[1], den = d.x * sy - d.y * sx;
    if (Math.abs(den) < EPS) continue;
    const qx = a[0] - o.x, qy = a[1] - o.y, t = (qx * sy - qy * sx) / den, u = (qx * d.y - qy * d.x) / den;
    if (t < 0 || u < -1e-9 || u > 1 + 1e-9 || t >= best) continue;
    const z = o.z + d.z * t;
    if (z >= z0 - 1e-9 && z <= z1 + 1e-9) best = t;
  }
  return Number.isFinite(best) ? best : null;
}
/** Where a 3D ray meets the horizontal plane at height z, or null (parallel or behind). */
export function rayPlaneZ(o, d, z = 0) {
  if (Math.abs(d.z) < EPS) return null;
  const t = (z - o.z) / d.z;
  return t >= 0 ? {t, x: o.x + d.x * t, y: o.y + d.y * t} : null;
}
