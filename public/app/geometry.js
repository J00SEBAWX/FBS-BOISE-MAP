// Plan geometry in feet. x runs east from the west wall, y runs north from the south wall.
// A rect item is { x, y, w, d, rot } with rot in degrees (counter-clockwise), centred on (x, y).

export const rad = (d) => (d * Math.PI) / 180;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function toWorld(it, lx, ly) {
  const r = rad(it.rot || 0);
  const c = Math.cos(r), s = Math.sin(r);
  return [it.x + lx * c - ly * s, it.y + lx * s + ly * c];
}

export function toLocal(it, px, py) {
  const r = -rad(it.rot || 0);
  const dx = px - it.x, dy = py - it.y;
  const c = Math.cos(r), s = Math.sin(r);
  return [dx * c - dy * s, dx * s + dy * c];
}

/** Corners in counter-clockwise order. */
export function corners(it) {
  const w = it.w / 2, d = it.d / 2;
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([a, b]) => toWorld(it, a, b));
}

export function bbox(it) {
  const cs = corners(it);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of cs) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function inRect(it, px, py, tol = 0) {
  const [lx, ly] = toLocal(it, px, py);
  return Math.abs(lx) <= it.w / 2 + tol && Math.abs(ly) <= it.d / 2 + tol;
}

export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Sutherland–Hodgman: intersection of a polygon with a convex counter-clockwise polygon. */
export function clip(subject, clipPoly) {
  let out = subject;
  for (let i = 0; i < clipPoly.length && out.length; i++) {
    const a = clipPoly[i], b = clipPoly[(i + 1) % clipPoly.length];
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9;
    const cross = (p, q) => {
      const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1];
      const x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1];
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-12) return q;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const pin = inside(p), qin = inside(q);
      if (pin && qin) out.push(q);
      else if (pin && !qin) out.push(cross(p, q));
      else if (!pin && qin) {
        out.push(cross(p, q));
        out.push(q);
      }
    }
  }
  return out;
}

/** Overlap area (sq ft) of two rect items. */
export function overlapArea(a, b) {
  const [ax0, ay0, ax1, ay1] = bbox(a);
  const [bx0, by0, bx1, by1] = bbox(b);
  if (ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0) return 0;
  const p = clip(corners(a), corners(b));
  return p.length >= 3 ? Math.abs(polyArea(p)) : 0;
}

export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointRectDist(it, px, py) {
  const [lx, ly] = toLocal(it, px, py);
  const dx = Math.max(0, Math.abs(lx) - it.w / 2);
  const dy = Math.max(0, Math.abs(ly) - it.d / 2);
  return Math.hypot(dx, dy);
}

/** Shortest distance between two rect items (0 when they touch or overlap). */
export function rectDist(a, b) {
  if (overlapArea(a, b) > 1e-6) return 0;
  const A = corners(a), B = corners(b);
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = A[i], [bx, by] = A[(i + 1) % 4];
    for (const [px, py] of B) best = Math.min(best, segDist(px, py, ax, ay, bx, by));
  }
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = B[i], [bx, by] = B[(i + 1) % 4];
    for (const [px, py] of A) best = Math.min(best, segDist(px, py, ax, ay, bx, by));
  }
  return best;
}

/** The floor in front of and behind a door, opening or arch that must stay clear. */
export function clearanceRect(op, depth = 5, side = 1) {
  return { x: op.x, y: op.y, w: op.w + side * 2, d: op.d + depth * 2, rot: op.rot || 0 };
}

export function isAxisAligned(it) {
  const r = (((it.rot || 0) % 90) + 90) % 90;
  return r < 0.01 || r > 89.99;
}

export const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

/**
 * Edge snapping for an axis-aligned block: pulls its edges flush to nearby lines.
 * lines = { xs: number[], ys: number[] }. Returns { x, y, guides: { x: number|null, y: number|null } }.
 */
export function edgeSnap(it, lines, threshold = 1.5) {
  if (!isAxisAligned(it)) return { x: it.x, y: it.y, guides: { x: null, y: null } };
  const [x0, y0, x1, y1] = bbox(it);
  let bestX = null, bestY = null;
  for (const lx of lines.xs) {
    for (const edge of [x0, x1]) {
      const d = lx - edge;
      if (Math.abs(d) <= threshold && (bestX === null || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, line: lx };
    }
  }
  for (const ly of lines.ys) {
    for (const edge of [y0, y1]) {
      const d = ly - edge;
      if (Math.abs(d) <= threshold && (bestY === null || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, line: ly };
    }
  }
  return {
    x: bestX ? it.x + bestX.d : it.x,
    y: bestY ? it.y + bestY.d : it.y,
    guides: { x: bestX ? bestX.line : null, y: bestY ? bestY.line : null },
  };
}

export function ftin(v) {
  const neg = v < 0;
  v = Math.abs(v);
  let f = Math.floor(v + 1e-6);
  let i = Math.round((v - f) * 12);
  if (i === 12) {
    f++;
    i = 0;
  }
  return (neg ? "-" : "") + f + "'" + (i ? i + '"' : "");
}
