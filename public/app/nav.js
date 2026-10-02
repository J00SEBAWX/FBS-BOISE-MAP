// Walkable grid and A* paths so Jerry walks around fixtures instead of through them.
import { inRect, bbox, toLocal } from "./geometry.js";

const SOLID = new Set(["wall", "column", "gondola", "wallunit", "rack", "pallet", "ring", "counter", "table", "display", "tower", "stairs"]);
const OPEN = new Set(["door", "opening", "arch"]);
const SQRT2 = Math.SQRT2;

export class NavGrid {
  constructor(items = [], { cell = 0.5, radius = 0.8, skip = null } = {}) {
    this.cell = cell;
    this.radius = radius;
    this.build(items, skip);
  }

  build(items, skip = null) {
    const { cell, radius } = this;
    const floors = items.filter((i) => i.type === "floor");
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of floors) {
      const b = bbox(f);
      x0 = Math.min(x0, b[0]);
      y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2]);
      y1 = Math.max(y1, b[3]);
    }
    if (!floors.length) [x0, y0, x1, y1] = [0, 0, 169, 80];
    x0 -= 2;
    y0 -= 2;
    x1 += 2;
    y1 += 2;
    this.x0 = x0;
    this.y0 = y0;
    this.W = Math.ceil((x1 - x0) / cell);
    this.H = Math.ceil((y1 - y0) / cell);
    const g = new Uint8Array(this.W * this.H).fill(1);
    this.g = g;

    const each = (bb, pad, fn) => {
      const i0 = Math.max(0, Math.floor((bb[0] - pad - x0) / cell));
      const i1 = Math.min(this.W - 1, Math.ceil((bb[2] + pad - x0) / cell));
      const j0 = Math.max(0, Math.floor((bb[1] - pad - y0) / cell));
      const j1 = Math.min(this.H - 1, Math.ceil((bb[3] + pad - y0) / cell));
      for (let j = j0; j <= j1; j++) {
        const cy = y0 + (j + 0.5) * cell;
        for (let i = i0; i <= i1; i++) fn(i, j, x0 + (i + 0.5) * cell, cy);
      }
    };

    for (const f of floors) each(bbox(f), 0, (i, j, cx, cy) => inRect(f, cx, cy) && (g[j * this.W + i] = 0));
    for (const it of items) {
      if (!SOLID.has(it.type) || (skip && it.id === skip)) continue;
      each(bbox(it), radius, (i, j, cx, cy) => inRect(it, cx, cy, radius) && (g[j * this.W + i] = 1));
    }
    // carve doorways back open through the inflated wall
    for (const op of items) {
      if (!OPEN.has(op.type)) continue;
      const halfW = op.w / 2 - radius * 0.6;
      if (halfW <= 0) continue;
      const halfD = op.d / 2 + radius + 0.4;
      each(bbox(op), radius + 1, (i, j, cx, cy) => {
        const [lx, ly] = toLocal(op, cx, cy);
        if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfD) g[j * this.W + i] = 0;
      });
    }
  }

  idx(x, y) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((y - this.y0) / this.cell);
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return j * this.W + i;
  }

  center(k) {
    const i = k % this.W, j = (k - i) / this.W;
    return [this.x0 + (i + 0.5) * this.cell, this.y0 + (j + 0.5) * this.cell];
  }

  blocked(x, y) {
    const k = this.idx(x, y);
    return k < 0 || this.g[k] === 1;
  }

  /** Nearest walkable point within maxR feet, or null. */
  nearestFree(x, y, maxR = 8) {
    if (!this.blocked(x, y)) return [x, y];
    const steps = Math.ceil(maxR / this.cell);
    for (let r = 1; r <= steps; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const px = x + di * this.cell, py = y + dj * this.cell;
          if (this.blocked(px, py)) continue;
          const d = di * di + dj * dj;
          if (d < bd) {
            bd = d;
            best = [px, py];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Straight-line walkability check, sampled every quarter cell. */
  clearLine(ax, ay, bx, by) {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / (this.cell * 0.25)));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      if (this.blocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  /** A* from (ax, ay) to (bx, by). Returns smoothed waypoints (excluding the start) or null. */
  path(ax, ay, bx, by) {
    const start = this.nearestFree(ax, ay, 4);
    const goal = this.nearestFree(bx, by, 8);
    if (!start || !goal) return null;
    if (this.clearLine(start[0], start[1], goal[0], goal[1])) return [goal];
    const s = this.idx(start[0], start[1]), t = this.idx(goal[0], goal[1]);
    if (s < 0 || t < 0) return null;
    const W = this.W, N = this.g.length, g = this.g;
    const cost = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const ti = t % W, tj = (t - ti) / W;
    const h = (k) => {
      const i = k % W, j = (k - i) / W;
      const dx = Math.abs(i - ti), dy = Math.abs(j - tj);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    // binary heap of [f, k]
    const hf = [], hk = [];
    const push = (f, k) => {
      let n = hf.length;
      hf.push(f);
      hk.push(k);
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (hf[p] <= hf[n]) break;
        [hf[p], hf[n]] = [hf[n], hf[p]];
        [hk[p], hk[n]] = [hk[n], hk[p]];
        n = p;
      }
    };
    const pop = () => {
      const top = hk[0];
      const lf = hf.pop(), lk = hk.pop();
      if (hf.length) {
        hf[0] = lf;
        hk[0] = lk;
        let n = 0;
        for (;;) {
          const l = 2 * n + 1, r = l + 1;
          let m = n;
          if (l < hf.length && hf[l] < hf[m]) m = l;
          if (r < hf.length && hf[r] < hf[m]) m = r;
          if (m === n) break;
          [hf[m], hf[n]] = [hf[n], hf[m]];
          [hk[m], hk[n]] = [hk[n], hk[m]];
          n = m;
        }
      }
      return top;
    };
    cost[s] = 0;
    push(h(s), s);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];
    let guard = 0;
    while (hf.length && guard++ < 200000) {
      const k = pop();
      if (k === t) break;
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % W, j = (k - i) / W;
      for (const [di, dj, c] of dirs) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.H) continue;
        const nk = nj * W + ni;
        if (g[nk] || closed[nk]) continue;
        if (di && dj && (g[j * W + ni] || g[nj * W + i])) continue; // no corner cutting
        const nc = cost[k] + c;
        if (nc < cost[nk]) {
          cost[nk] = nc;
          from[nk] = k;
          push(nc + h(nk), nk);
        }
      }
    }
    if (from[t] < 0) return null;
    const cells = [];
    for (let k = t; k !== s && k >= 0; k = from[k]) cells.push(this.center(k));
    cells.reverse();
    cells[cells.length - 1] = goal;
    // string-pull: skip waypoints that are in direct line of sight
    const out = [];
    let ax0 = start[0], ay0 = start[1];
    let idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let k = cells.length - 1; k > idx; k--) {
        if (this.clearLine(ax0, ay0, cells[k][0], cells[k][1])) {
          far = k;
          break;
        }
      }
      out.push(cells[far]);
      [ax0, ay0] = cells[far];
      idx = far + 1;
    }
    return out;
  }
}
