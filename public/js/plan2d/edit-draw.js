/* What the plan draws while editing (docs/DESIGN.md 4.4 steps 10-12): the 8 resize handles and the rotate handle,
 * polygon corner handles in Edit shape, the live readouts (size pill, dashed gap lines to the nearest walls,
 * angle pill), snap guides and the marquee. Screen-pixel sizes never scale with zoom. */
import {toWorld} from "../core/geometry.js";
import {HANDLES} from "../core/doc.js";
import {outline} from "../core/areas.js";
import {formatFtIn} from "../core/units.js";
import {pill} from "./overlay.js";
import {w2s} from "./plan.js";

/** Handle sizes (px): visual square / rotate circle, stem length and hit radius, mouse vs touch. */
export const HANDLE_PX = Object.freeze({
  mouse: {size: 8, rot: 6, stem: 24, hit: 10, cornerHit: 10},
  touch: {size: 12, rot: 8, stem: 30, hit: 22, cornerHit: 22},
});

/** Screen positions of the 8 resize handles and the rotate handle for an item: {n: [sx, sy], ..., rotate: [sx, sy]}. */
export function handleScreenPoints(v, it, touch) {
  const px = touch ? HANDLE_PX.touch : HANDLE_PX.mouse, out = {};
  for (const [k, [hx, hy]] of Object.entries(HANDLES)) out[k] = w2s(v, ...toWorld(it, hx * it.w / 2, hy * it.d / 2));
  // the rotate handle sits a fixed number of pixels past the front (local +y) edge
  out.rotate = w2s(v, ...toWorld(it, 0, it.d / 2 + px.stem / v.s));
  out.stemBase = out.n;
  return out;
}

/** Which handle (if any) is under a screen point: "n" | "ne" | ... | "rotate" | null. Middle handles hide on tiny items. */
/** Which middle handles are hidden: on an axis narrower than 3 handles the two middle handles of that axis go. */
export function hiddenHandles(v, it, touch) {
  const px = touch ? HANDLE_PX.touch : HANDLE_PX.mouse, min = 3 * px.size * 1.6;
  return {ns: it.d * v.s < min, ew: it.w * v.s < min}; // n / s sit on the short (depth) axis, e / w on the length axis
}
export function handleAt(v, it, sx, sy, touch) {
  const px = touch ? HANDLE_PX.touch : HANDLE_PX.mouse, pts = handleScreenPoints(v, it, touch), hide = hiddenHandles(v, it, touch);
  if (Math.hypot(sx - pts.rotate[0], sy - pts.rotate[1]) <= px.hit) return "rotate";
  let best = null, bd = Infinity; // the nearest handle within reach (corners and middles can sit close on a thin item)
  for (const k of Object.keys(HANDLES)) {
    if ((k === "n" || k === "s") && hide.ns) continue;
    if ((k === "e" || k === "w") && hide.ew) continue;
    const p = pts[k], d = Math.hypot(sx - p[0], sy - p[1]);
    if (d <= px.hit * 1.2 && d < bd) { bd = d; best = k; }
  }
  return best;
}

/** The handles around one selected item. */
export function drawHandles(ctx, v, it, tok, touch) {
  const px = touch ? HANDLE_PX.touch : HANDLE_PX.mouse, pts = handleScreenPoints(v, it, touch), hide = hiddenHandles(v, it, touch);
  ctx.save();
  // stem + rotate handle
  ctx.strokeStyle = tok.selHandleStroke; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(pts.stemBase[0], pts.stemBase[1]); ctx.lineTo(pts.rotate[0], pts.rotate[1]); ctx.stroke();
  ctx.fillStyle = tok.selHandle;
  ctx.beginPath(); ctx.arc(pts.rotate[0], pts.rotate[1], px.rot / 2 + 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // squares
  for (const k of Object.keys(HANDLES)) {
    if ((k === "n" || k === "s") && hide.ns) continue;
    if ((k === "e" || k === "w") && hide.ew) continue;
    const [x, y] = pts[k], h = px.size / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - h, y - h, px.size, px.size, 2); else ctx.rect(x - h, y - h, px.size, px.size);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** Screen points of a polygon block's corners and edge midpoints: {corners: [[sx, sy]], mids: [[sx, sy]]}. */
export function polyScreenPoints(v, it) {
  const pts = outline(it).map(p => w2s(v, p[0], p[1]));
  const mids = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  return {corners: pts, mids};
}
/** A corner ({corner: i}) or an edge midpoint ({mid: i}) under a screen point, or null. */
export function polyHandleAt(v, it, sx, sy, touch) {
  const px = touch ? HANDLE_PX.touch : HANDLE_PX.mouse, {corners, mids} = polyScreenPoints(v, it);
  for (let i = 0; i < corners.length; i++) if (Math.hypot(sx - corners[i][0], sy - corners[i][1]) <= px.cornerHit) return {corner: i};
  for (let i = 0; i < mids.length; i++) if (Math.hypot(sx - mids[i][0], sy - mids[i][1]) <= px.cornerHit) return {mid: i};
  return null;
}
/** Edit shape: corner circles (the chosen one filled in the selection colour) and "+" squares on each edge. */
export function drawPolyHandles(ctx, v, it, tok, touch, selectedCorner = -1) {
  const px = touch ? HANDLE_PX.touch : HANDLE_PX.mouse, {corners, mids} = polyScreenPoints(v, it);
  const r = px.size / 2 + 2;
  ctx.save();
  ctx.lineWidth = 1.5; ctx.strokeStyle = tok.selHandleStroke;
  for (const [x, y] of mids) {
    const h = px.size / 2 - 1;
    ctx.fillStyle = tok.surface; ctx.beginPath(); ctx.rect(x - h, y - h, h * 2, h * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - h + 2, y); ctx.lineTo(x + h - 2, y); ctx.moveTo(x, y - h + 2); ctx.lineTo(x, y + h - 2); ctx.stroke();
  }
  corners.forEach(([x, y], i) => {
    ctx.fillStyle = i === selectedCorner ? tok.selStroke : tok.selHandle;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

/**
 * Readouts: ro = readoutsFor(...) ({size, gaps, angle}); it = the item (for the size pill's place).
 * The size pill sits past the item's back (local -y) edge; gap lines are dashed in --plan-measure with a pill
 * at their middle; the angle pill sits above the rotate handle.
 */
export function drawReadouts(ctx, v, it, ro, tok, touch) {
  ctx.save();
  const clampOpts = {clampW: v.W, clampH: v.H};
  // gaps to the nearest walls
  for (const g of [ro.gaps && ro.gaps.x, ro.gaps && ro.gaps.y]) {
    if (!g || !(g.d > 0.04)) continue;
    const p = w2s(v, g.from[0], g.from[1]), q = w2s(v, g.to[0], g.to[1]);
    ctx.strokeStyle = tok.planMeasure; ctx.lineWidth = 1.25; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]);
    // end tick at the wall
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 5, ny = dx / L * 5;
    ctx.beginPath(); ctx.moveTo(q[0] - nx, q[1] - ny); ctx.lineTo(q[0] + nx, q[1] + ny); ctx.stroke();
    if (L > 44) pill(ctx, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, formatFtIn(g.d), tok, clampOpts);
  }
  // size pill past the back edge (so it doesn't sit under the rotate handle on the front)
  const px = touch ? HANDLE_PX.touch : HANDLE_PX.mouse;
  const back = w2s(v, ...toWorld(it, 0, -it.d / 2 - (px.size + 10) / v.s));
  pill(ctx, back[0], back[1], `${formatFtIn(ro.size.w)} × ${formatFtIn(ro.size.d)}`, tok, clampOpts);
  if (ro.angle !== null && ro.angle !== undefined) {
    const rp = w2s(v, ...toWorld(it, 0, it.d / 2 + (px.stem + 18) / v.s));
    pill(ctx, rp[0], rp[1], `${Math.round(ro.angle * 10) / 10}°`, tok, clampOpts);
  }
  ctx.restore();
}

/** Snap guides: 1px lines across the canvas in --snap-guide (the editor keeps them for 600 ms). */
export function drawGuides(ctx, v, guides, tok) {
  if (!guides || !guides.length) return;
  ctx.save();
  ctx.strokeStyle = tok.snapGuide; ctx.lineWidth = 1;
  for (const g of guides) {
    const p = w2s(v, g.a[0], g.a[1]), q = w2s(v, g.b[0], g.b[1]), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, ext = Math.max(v.W, v.H);
    ctx.beginPath(); ctx.moveTo(p[0] - dx / L * ext, p[1] - dy / L * ext); ctx.lineTo(q[0] + dx / L * ext, q[1] + dy / L * ext); ctx.stroke();
  }
  ctx.restore();
}

/** The marquee rectangle (screen px). */
export function drawMarquee(ctx, r, tok) {
  ctx.save();
  const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1), w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
  ctx.fillStyle = tok.selMarqueeFill; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = tok.selMarqueeStroke; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}

/**
 * The block a person is drawing on the floor (placing a department): the rectangle in the department's colour,
 * dashed like the 3D ghost, with its size in a pill at the centre ("25' x 10' · 250 sq ft"). r is in store feet
 * (x0, y0, x1, y1 in any order); nothing is drawn below one pixel.
 */
export function drawPlaceRect(ctx, v, r, colour, text, tok) {
  const a = w2s(v, Math.min(r.x0, r.x1), Math.max(r.y0, r.y1)), b = w2s(v, Math.max(r.x0, r.x1), Math.min(r.y0, r.y1));
  const w = b[0] - a[0], h = b[1] - a[1];
  if (w < 1 || h < 1) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.28; ctx.fillStyle = colour; ctx.fillRect(a[0], a[1], w, h);
  ctx.globalAlpha = 1; ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(a[0] + 1, a[1] + 1, w - 2, h - 2); ctx.setLineDash([]);
  ctx.restore();
  if (text && w > 40 && h > 24) pill(ctx, a[0] + w / 2, a[1] + h / 2, text, tok);
  else if (text) pill(ctx, a[0] + w / 2, a[1] - 16, text, tok);
}
