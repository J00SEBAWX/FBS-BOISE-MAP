// Layout differences for Comparison mode. Pure functions shared with AJ's dashboard and the tests.
import { overlapArea } from "./geometry.js";

const close = (a, b, t = 0.05) => Math.abs((a || 0) - (b || 0)) <= t;

export function rotDiff(a, b) {
  const d = Math.abs((((a || 0) - (b || 0)) % 360 + 360) % 360);
  return Math.min(d, 360 - d);
}

/** Fixture and structure changes, matched by id. */
export function diffItems(baseItems = [], mineItems = []) {
  const base = new Map(baseItems.map((i) => [i.id, i]));
  const mine = new Map(mineItems.map((i) => [i.id, i]));
  const moved = [], resized = [], added = [], removed = [];
  for (const [id, m] of mine) {
    const b = base.get(id);
    if (!b) {
      added.push(m);
      continue;
    }
    const dist = Math.hypot(m.x - b.x, m.y - b.y);
    const turn = rotDiff(m.rot, b.rot);
    if (dist > 0.05 || turn > 0.5) moved.push({ id, name: m.name, type: m.type, from: b, to: m, dist, turn });
    if (!close(m.w, b.w) || !close(m.d, b.d) || !close(m.h, b.h)) resized.push({ id, name: m.name, type: m.type, from: b, to: m });
  }
  for (const [id, b] of base) if (!mine.has(id)) removed.push(b);
  const changed = new Set([...moved.map((x) => x.id), ...resized.map((x) => x.id), ...added.map((x) => x.id), ...removed.map((x) => x.id)]);
  return { moved, resized, added, removed, count: changed.size };
}

function centroid(blocks) {
  let sx = 0, sy = 0, s = 0;
  for (const b of blocks) {
    const a = b.w * b.d;
    sx += b.x * a;
    sy += b.y * a;
    s += a;
  }
  return s ? [sx / s, sy / s] : [0, 0];
}

/**
 * Department changes, matched by key. `share` is how much of the larger footprint the two
 * versions have in common (1 = same spot and size, 0 = no overlap at all).
 */
export function diffAreas(baseAreas = [], mineAreas = [], order = []) {
  const keys = [...new Set([...order, ...baseAreas.map((a) => a.key), ...mineAreas.map((a) => a.key)])].filter(
    (k) => baseAreas.some((a) => a.key === k) || mineAreas.some((a) => a.key === k)
  );
  const rows = keys.map((key) => {
    const b = baseAreas.filter((a) => a.key === key);
    const m = mineAreas.filter((a) => a.key === key);
    const baseSqft = b.reduce((s, a) => s + a.w * a.d, 0);
    const mineSqft = m.reduce((s, a) => s + a.w * a.d, 0);
    if (!b.length) return { key, change: "added", base: b, mine: m, baseSqft, mineSqft, dist: null, share: 0 };
    if (!m.length) return { key, change: "missing", base: b, mine: m, baseSqft, mineSqft, dist: null, share: 0 };
    let common = 0;
    for (const x of b) for (const y of m) common += overlapArea(x, y);
    const share = Math.min(1, common / Math.max(baseSqft, mineSqft, 1e-6));
    const [bx, by] = centroid(b);
    const [mx, my] = centroid(m);
    const dist = Math.hypot(mx - bx, my - by);
    const same = dist < 1 && Math.abs(mineSqft - baseSqft) < 5 && share > 0.95;
    return { key, change: same ? "same" : "changed", base: b, mine: m, baseSqft, mineSqft, dist, share, from: [bx, by], to: [mx, my] };
  });
  return rows;
}

/** One number for the HUD: average footprint agreement across every department in either plan. */
export function matchScore(rows) {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + (r.change === "same" ? 1 : r.share), 0) / rows.length;
}
