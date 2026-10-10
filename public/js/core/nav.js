/* The walkable grid for the Walk view: half-foot cells, blocked where a person can't stand (fixtures,
 * walls, outside the building), with A* paths and line-of-sight checks. Pure: no DOM. */
import {clamp, corners, inItem, toLocal, toWorld} from "./geometry.js";
import {TYPES, isFloorAt} from "./model.js";
import {inRing} from "./ring.js";

export const BODY_R = 0.85; // clearance kept from walls and fixtures while walking (ft)

/** Builds the grid for a layout. Returns an object with the helpers the walk needs. */
export function buildNav(layout, {cell = 0.5, bodyR = BODY_R, margin = 6} = {}) {
  const {L, W} = layout.building;
  const G = {cell, x0: -margin, y0: -margin, nx: Math.ceil((L + 2 * margin) / cell), ny: Math.ceil((W + 2 * margin) / cell)};
  G.blk = new Uint8Array(G.nx * G.ny);
  const cellC = (i, j) => [G.x0 + (i + 0.5) * cell, G.y0 + (j + 0.5) * cell];
  const cellOf = (x, y) => [clamp(Math.floor((x - G.x0) / cell), 0, G.nx - 1), clamp(Math.floor((y - G.y0) / cell), 0, G.ny - 1)];
  const free = (i, j) => i >= 0 && j >= 0 && i < G.nx && j < G.ny && !G.blk[j * G.nx + i];

  // fixtures and walls (grown by the body radius)
  for (const it of layout.items) {
    if (!(TYPES[it.type] || {}).blocks) continue;
    const cs = corners(it), xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - bodyR - G.x0) / cell)), i1 = Math.min(G.nx - 1, Math.ceil((Math.max(...xs) + bodyR - G.x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - bodyR - G.y0) / cell)), j1 = Math.min(G.ny - 1, Math.ceil((Math.max(...ys) + bodyR - G.y0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [px, py] = cellC(i, j);
      if (it.type === "ring" ? inRing(it, px, py, bodyR) : inItem(it, px, py, bodyR)) G.blk[j * G.nx + i] = 1;
    }
  }
  // stay inside the building: off the floor plan, or within bodyR of its edge (this also closes the outside doors)
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    const k = j * G.nx + i; if (G.blk[k]) continue;
    const [px, py] = cellC(i, j);
    if (!isFloorAt(layout, px, py) || !isFloorAt(layout, px + bodyR, py) || !isFloorAt(layout, px - bodyR, py) ||
        !isFloorAt(layout, px, py + bodyR) || !isFloorAt(layout, px, py - bodyR)) G.blk[k] = 1;
  }

  const blockedAt = (x, y) => !free(Math.floor((x - G.x0) / cell), Math.floor((y - G.y0) / cell)); // off the grid = blocked
  function nearestFree(i, j) {
    if (free(i, j)) return [i, j];
    for (let r = 1; r < 60; r++) {
      let best = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (free(i + di, j + dj)) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i + di, j + dj]; } }
      }
      if (best) return best;
    }
    return null;
  }
  function astar(a, b) {
    const N = G.nx * G.ny, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (f, n) => { heap.push([f, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } }
      return top;
    };
    const s = a[1] * G.nx + a[0], t = b[1] * G.nx + b[0], hx = b[0], hy = b[1];
    const H = (i, j) => { const dx = Math.abs(i - hx), dy = Math.abs(j - hy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    g[s] = 0; push(H(a[0], a[1]), s);
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let iter = 0;
    while (heap.length && iter++ < 200000) {
      const n = pop()[1]; if (n === t) break; if (closed[n]) continue; closed[n] = 1;
      const i = n % G.nx, j = (n / G.nx) | 0;
      for (const [di, dj, c] of nb) {
        const ni = i + di, nj = j + dj; if (!free(ni, nj)) continue; if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
        const m = nj * G.nx + ni, ng = g[n] + c; if (ng < g[m]) { g[m] = ng; from[m] = n; push(ng + H(ni, nj), m); }
      }
    }
    if (from[t] < 0 && s !== t) return null;
    const out = []; for (let n = t; n !== -1; n = from[n]) { out.push([n % G.nx, (n / G.nx) | 0]); if (n === s) break; }
    return out.reverse();
  }
  /** Every cell reachable on foot from (x, y) (flood fill). */
  function reachable(x, y) {
    const N = G.nx * G.ny, seen = new Uint8Array(N), here = cellOf(x, y), st = nearestFree(here[0], here[1]);
    if (!st) return seen;
    const q = new Int32Array(N); let h = 0, t = 0; q[t++] = st[1] * G.nx + st[0]; seen[q[0]] = 1;
    while (h < t) {
      const n = q[h++], i = n % G.nx, j = (n / G.nx) | 0;
      for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { const m = nj * G.nx + ni; if (free(ni, nj) && !seen[m]) { seen[m] = 1; q[t++] = m; } }
    }
    return seen;
  }
  /** Clear straight walk between two points? */
  function los(a, b) {
    const [x0, y0] = a, [x1, y1] = b, steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (cell * 0.5)));
    for (let k = 0; k <= steps; k++) { const [i, j] = cellOf(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps); if (!free(i, j)) return false; }
    return true;
  }
  /** A smoothed path from (x0, y0) to (x1, y1): {start: [x, y] (moved off a blocked cell), path: [[x, y]...]} or null. */
  function plan(x0, y0, x1, y1) {
    const here = cellOf(x0, y0), st = nearestFree(here[0], here[1]), en = nearestFree(...cellOf(x1, y1));
    if (!st || !en) return null;
    const start = st[0] !== here[0] || st[1] !== here[1] ? cellC(st[0], st[1]) : [x0, y0];
    const cells = astar(st, en); if (!cells) return null;
    const pts = cells.map(c => cellC(c[0], c[1])), goal = pts[pts.length - 1];
    const sm = []; let cur = start, k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) if (los(cur, pts[m])) { far = m; break; }
      sm.push(pts[far]); cur = pts[far]; k = far;
    }
    return {start, path: sm.length ? sm : [goal], goal};
  }
  return {G, cellC, cellOf, free, blockedAt, nearestFree, astar, reachable, los, plan};
}

/** No wall between (x, y) and the nearest edge of item it? */
export function sees(walls, it, x, y) {
  const [lx, ly] = toLocal(it, x, y), q = toWorld(it, clamp(lx, -it.w / 2, it.w / 2), clamp(ly, -it.d / 2, it.d / 2));
  const L = Math.hypot(q[0] - x, q[1] - y), n = Math.ceil(L / 0.25);
  for (let k = 0; k < n && k * L / n < L - 0.15; k++) {
    const px = x + (q[0] - x) * k / n, py = y + (q[1] - y) * k / n;
    if (walls.some(w => inItem(w, px, py))) return false;
  }
  return true;
}

/**
 * Where to stand to look at a fixture: a spot you can walk to with no wall in between, in front of it if
 * possible, else beside or behind it, 2.2, 3.5 or 5 ft away. Then any reachable spot with a clear view
 * (about 3.5 ft away if possible), then any reachable spot near it. Returns [x, y] or null.
 */
export function lookSpot(nav, walls, it, fromX, fromY) {
  const {G} = nav, reach = nav.reachable(fromX, fromY), cands = [];
  for (const off of [2.2, 3.5, 5]) for (const [ux, uy, pen] of [[0, 1, 0], [1, 0, 3], [-1, 0, 3], [0, -1, 6]]) {
    const n = Math.floor((ux ? it.d : it.w) / 2 / 1.5);
    for (let k = -n; k <= n; k++) {
      const t = k * 1.5, p = ux ? toWorld(it, ux * (it.w / 2 + off), t) : toWorld(it, t, uy * (it.d / 2 + off));
      cands.push({p, score: pen + off + Math.abs(t) * 0.15});
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const ok = p => { const i = Math.floor((p[0] - G.x0) / G.cell), j = Math.floor((p[1] - G.y0) / G.cell); return nav.free(i, j) && reach[j * G.nx + i] === 1; };
  const best = cands.find(c => ok(c.p) && sees(walls, it, c.p[0], c.p[1]));
  if (best) return best.p;
  let bv = Infinity, pv = null, bd = Infinity, pd = null;
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    if (!reach[j * G.nx + i]) continue;
    const [x, y] = nav.cellC(i, j), [lx, ly] = toLocal(it, x, y), d = Math.hypot(Math.max(0, Math.abs(lx) - it.w / 2), Math.max(0, Math.abs(ly) - it.d / 2));
    if (d < bd) { bd = d; pd = [x, y]; }
    if (d < 25 && Math.abs(d - 3.5) < bv && sees(walls, it, x, y)) { bv = Math.abs(d - 3.5); pv = [x, y]; }
  }
  const any = cands.find(c => ok(c.p));
  return pv || (any && any.p) || pd;
}
