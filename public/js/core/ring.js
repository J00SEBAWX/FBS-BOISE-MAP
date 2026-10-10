/* Counter rings (the octagonal sales desk): the outline as runs of counter with the staff openings cut out.
 * Pure geometry shared by the 3D builder, the plan and the walkable grid. All in the item's own frame. */
import {clamp, toLocal} from "./geometry.js";

/** The staff openings: [{side: "N"|"S"|"E"|"W", c: offset from the side's middle, w: width}]. */
export function ringGaps(it) {
  if (it.open && Array.isArray(it.open.sides)) return it.open.sides.map(sd => ({side: sd, c: 0, w: it.open.w || 3.5}));
  const g = it.gap; if (!g || !(g.b > g.a)) return [];
  const L = (g.side === "S" || g.side === "N") ? it.w : it.d;
  return [{side: g.side, c: -L / 2 + (g.a + g.b) / 2, w: g.b - g.a}];
}

/** The counter's centre line, split into runs at the openings: {runs: [{closed, pts}], h: half thickness, t: thickness}. */
export function ringRuns(it) {
  const t = it.t || 2.5, h = t / 2, X = Math.max(0.1, it.w / 2 - h), Y = Math.max(0.1, it.d / 2 - h);
  const c = it.shape === "oct" ? clamp(it.cham ?? 1.75, 0, Math.min(X, Y) * 0.95) : 0;
  const vt = c > 0 ? [[-X + c, -Y, "S"], [X - c, -Y, "SE"], [X, -Y + c, "E"], [X, Y - c, "NE"], [X - c, Y, "N"], [-X + c, Y, "NW"], [-X, Y - c, "W"], [-X, -Y + c, "SW"]]
                   : [[-X, -Y, "S"], [X, -Y, "E"], [X, Y, "N"], [-X, Y, "W"]];
  const n = vt.length, cum = [0];
  for (let i = 0; i < n; i++) { const a = vt[i], b = vt[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const P = cum[n];
  const at = u => {
    u = ((u % P) + P) % P; let i = 0; while (i < n - 1 && cum[i + 1] < u) i++;
    const a = vt[i], b = vt[(i + 1) % n], L = cum[i + 1] - cum[i] || 1, f = (u - cum[i]) / L;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  // openings = arc-length intervals centred on a side (they may spill onto the corner cuts)
  const gaps = [];
  for (const g of ringGaps(it)) {
    const i = vt.findIndex(q => q[2] === g.side); if (i < 0) continue;
    const L = cum[i + 1] - cum[i], dir = (g.side === "S" || g.side === "E") ? 1 : -1, mid = cum[i] + L / 2 + dir * (g.c || 0), ww = clamp(g.w, 0.3, P * 0.45);
    gaps.push([mid - ww / 2, mid + ww / 2]);
  }
  gaps.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const g of gaps) { const m = merged[merged.length - 1]; if (m && g[0] <= m[1]) m[1] = Math.max(m[1], g[1]); else merged.push(g.slice()); }
  const runs = [];
  if (!merged.length) runs.push({closed: true, pts: vt.map(q => [q[0], q[1]])});
  else for (let k = 0; k < merged.length; k++) {
    const u0 = merged[k][1], u1 = k + 1 < merged.length ? merged[k + 1][0] : merged[0][0] + P;
    if (u1 - u0 < 0.1) continue;
    const mids = [];
    for (let m = -1; m <= 2; m++) for (let i = 0; i < n; i++) { const u = cum[i] + m * P; if (u > u0 + 1e-6 && u < u1 - 1e-6) mids.push([vt[i][0], vt[i][1], u]); }
    mids.sort((a, b) => a[2] - b[2]);
    runs.push({closed: false, pts: [at(u0), ...mids.map(q => [q[0], q[1]]), at(u1)]});
  }
  return {runs, h, t};
}

/** Band polygon around a run's centre line: half-width hw, open ends pushed out by ext. */
export function bandPoly(run, hw, ext = 0) {
  const p = run.pts, n = p.length, cl = run.closed, segs = cl ? n : n - 1, dirs = [];
  for (let i = 0; i < segs; i++) { const a = p[i], b = p[(i + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; dirs.push([(b[0] - a[0]) / L, (b[1] - a[1]) / L]); }
  const off = i => {
    const d1 = cl ? dirs[(i - 1 + segs) % segs] : dirs[Math.max(0, i - 1)], d2 = cl ? dirs[i % segs] : dirs[Math.min(segs - 1, i)];
    const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]]; let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const ml = Math.hypot(m[0], m[1]) || 1; m = [m[0] / ml, m[1] / ml];
    const s = hw / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]); return [m[0] * s, m[1] * s];
  };
  const Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const q = p[i].slice();
    if (!cl && ext) {
      if (i === 0) { q[0] -= dirs[0][0] * ext; q[1] -= dirs[0][1] * ext; }
      if (i === n - 1) { q[0] += dirs[segs - 1][0] * ext; q[1] += dirs[segs - 1][1] * ext; }
    }
    const o = off(i); Lf.push([q[0] + o[0], q[1] + o[1]]); Rt.push([q[0] - o[0], q[1] - o[1]]);
  }
  return cl ? {outer: Lf, hole: Rt} : {outer: Lf.concat(Rt.reverse()), hole: null};
}

/** Distance from a point to a straight counter piece (flat ends, half-width hw). */
export function distBand(px, py, a, b, hw) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const qx = px - (a[0] + b[0]) / 2, qy = py - (a[1] + b[1]) / 2;
  const al = Math.abs(qx * ux + qy * uy) - L / 2, pe = Math.abs(-qx * uy + qy * ux) - hw;
  return Math.hypot(Math.max(al, 0), Math.max(pe, 0));
}

const CACHE = new WeakMap();
/** ringRuns, cached per item object. */
export function ringOf(it) {
  let r = CACHE.get(it);
  if (!r) { r = ringRuns(it); CACHE.set(it, r); }
  return r;
}

/** Is the point on the counter itself (grown by tol), not in the open middle? */
export function inRing(it, px, py, tol = 0) {
  const [lx, ly] = toLocal(it, px, py);
  if (Math.abs(lx) > it.w / 2 + tol || Math.abs(ly) > it.d / 2 + tol) return false;
  const rr = ringOf(it);
  for (const run of rr.runs) {
    const p = run.pts, n = p.length;
    for (let i = 0; i < (run.closed ? n : n - 1); i++) if (distBand(lx, ly, p[i], p[(i + 1) % n], rr.h) <= tol) return true;
  }
  return false;
}
