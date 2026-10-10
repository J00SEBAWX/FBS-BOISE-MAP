/* Plan overlays: the "Scan lines" layer (the walls the cleaned 3D scan traced, public/data/scan-overlay.json)
 * and the Measure / place tool (cursor, snapped face, distance to the nearest wall, A-B measurement).
 * Everything is drawn in screen pixels on top of the plan canvas, in the plan tokens (docs/DESIGN.md 4.4). */
import {formatFtIn} from "../core/units.js";

/** Scan walls and Von's door as 1px dashed lines in --plan-scan. overlay = the parsed scan-overlay.json. */
export function drawScanLines(ctx, v, overlay, tok, w2s) {
  if (!overlay || !Array.isArray(overlay.lines)) return;
  ctx.save();
  ctx.strokeStyle = tok.planScan; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.lineCap = "butt";
  ctx.beginPath();
  for (const l of overlay.lines) {
    if (![l.x1, l.y1, l.x2, l.y2].every(Number.isFinite)) continue;
    const a = w2s(v, l.x1, l.y1), b = w2s(v, l.x2, l.y2);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  // scanned doors: a short solid tick at each jamb
  ctx.setLineDash([]); ctx.lineWidth = 1.5;
  for (const d of overlay.doors || []) {
    if (![d.x1, d.y1, d.x2, d.y2].every(Number.isFinite)) continue;
    const a = w2s(v, d.x1, d.y1), b = w2s(v, d.x2, d.y2), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 5, ny = dx / L * 5;
    ctx.beginPath();
    for (const p of [a, b]) { ctx.moveTo(p[0] - nx, p[1] - ny); ctx.lineTo(p[0] + nx, p[1] + ny); }
    ctx.stroke();
  }
  ctx.restore();
}

/** A rounded readout pill (--plan-dim-bg / --plan-dim-ink, 20px tall) centred on (x, y). */
export function pill(ctx, x, y, text, tok, opts = {}) {
  ctx.save();
  ctx.font = `600 11px ${tok.fontBody}`;
  const w = Math.ceil(ctx.measureText(text).width) + 16, h = 20;
  let px = x - w / 2, py = y - h / 2;
  if (opts.clampW) { px = Math.max(4, Math.min(opts.clampW - w - 4, px)); py = Math.max(4, Math.min(opts.clampH - h - 4, py)); }
  ctx.fillStyle = opts.bg || tok.planDimBg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(px, py, w, h, 10); else ctx.rect(px, py, w, h);
  ctx.fill();
  ctx.fillStyle = opts.ink || tok.planDimInk; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, px + w / 2, py + h / 2 + 0.5);
  ctx.restore();
}

/**
 * The Measure / place tool on the plan.
 * st = {cursor, a, b, snap} (plan points; snap = the snapPoint result for the cursor).
 */
export function drawMeasure(ctx, v, st, tok, w2s) {
  const {cursor, a, b, snap} = st;
  ctx.save();
  // snapped faces: momentary guide lines in --snap-guide, carried across the canvas
  if (cursor && snap && snap.guides) {
    ctx.strokeStyle = tok.snapGuide; ctx.lineWidth = 1;
    for (const g of snap.guides) {
      const p = w2s(v, g.a[0], g.a[1]), q = w2s(v, g.b[0], g.b[1]), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, ext = Math.max(v.W, v.H);
      ctx.beginPath(); ctx.moveTo(p[0] - dx / L * ext, p[1] - dy / L * ext); ctx.lineTo(q[0] + dx / L * ext, q[1] + dy / L * ext); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  // distance to the nearest wall: a dashed measure line ending at the wall, with a pill in the middle
  if (cursor && snap && snap.distances && snap.distances.nearestWall && snap.distances.toNearestWall > 0.05 && snap.distances.toNearestWall < 80) {
    const p = w2s(v, cursor.x, cursor.y), q = w2s(v, ...snap.distances.nearestWall.point);
    ctx.strokeStyle = tok.planMeasure; ctx.lineWidth = 1.25; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]);
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 60) pill(ctx, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, formatFtIn(snap.distances.toNearestWall), tok);
  }
  // A-B measurement: 1.5px line with 6px end ticks and the length in a pill at the middle
  const end = b || cursor;
  if (a && end) {
    const p = w2s(v, a.x, a.y), q = w2s(v, end.x, end.y), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 6, ny = dx / L * 6;
    ctx.strokeStyle = tok.planMeasure; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    for (const s of [p, q]) { ctx.moveTo(s[0] - nx, s[1] - ny); ctx.lineTo(s[0] + nx, s[1] + ny); }
    ctx.stroke();
    if (L > 24) pill(ctx, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 14, formatFtIn(Math.hypot(end.x - a.x, end.y - a.y)), tok);
  }
  // the cursor: ring + crosshair (white halo underneath so it reads on any fixture)
  if (cursor) {
    const [x, y] = w2s(v, cursor.x, cursor.y);
    for (const [col, lw] of [[tok.planLabelHalo, 4], [tok.planMeasure, 1.75]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 10, y + dy * 10); ctx.lineTo(x + dx * 16, y + dy * 16); }
      ctx.stroke();
    }
    ctx.fillStyle = tok.planMeasure; ctx.beginPath(); ctx.arc(x, y, 1.75, 0, Math.PI * 2); ctx.fill();
  }
  for (const pt of [a, b]) {
    if (!pt) continue;
    const [x, y] = w2s(v, pt.x, pt.y);
    ctx.fillStyle = tok.planMeasure; ctx.strokeStyle = tok.planLabelHalo; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
