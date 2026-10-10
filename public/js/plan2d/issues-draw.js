/* Collision warnings on the plan (OWNER RULES v3.1, rule 5): a red outline around every department block that
 * overlaps a wall, column, stairs, desk, doorway clearance or another block, a thinner red outline around what
 * it hits, and a small "!" marker where the overlap is. Drawn over everything else (plan.js extraDraw). */
import {w2s, shapeOf} from "./plan.js";

function pathShape(ctx, v, it) {
  const c = shapeOf(it).map(p => w2s(v, p[0], p[1]));
  ctx.moveTo(c[0][0], c[0][1]);
  for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]);
  ctx.closePath();
}

/**
 * drawIssues(ctx, v, layout, result, tok, opts): result from core/issues.js collectIssues; opts.markers = false
 * hides the "!" dots (e.g. on a very zoomed-out plan).
 */
export function drawIssues(ctx, v, layout, result, tok, opts = {}) {
  if (!result || !result.count) return;
  ctx.save();
  ctx.lineJoin = "round";
  // what the blocks hit (columns, desks, doorways...): a thin red outline
  const others = new Set();
  for (const i of result.issues) if (i.otherId && !result.ids.has(i.otherId)) others.add(i.otherId);
  ctx.strokeStyle = tok.danger; ctx.lineWidth = 1.25; ctx.setLineDash([4, 3]);
  for (const id of others) { const it = layout.byId.get(id); if (!it) continue; ctx.beginPath(); pathShape(ctx, v, it); ctx.stroke(); }
  ctx.setLineDash([]);
  // the offending blocks: a solid red outline
  ctx.lineWidth = 2.5;
  for (const id of result.ids) { const it = layout.byId.get(id); if (!it) continue; ctx.beginPath(); pathShape(ctx, v, it); ctx.stroke(); }
  // markers at the overlap
  if (opts.markers !== false && v.s >= 1.5) {
    const seen = [];
    ctx.font = `700 11px ${tok.fontBody}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const m of result.markers) {
      const [sx, sy] = w2s(v, m.x, m.y);
      if (seen.some(q => Math.hypot(q[0] - sx, q[1] - sy) < 14)) continue;
      seen.push([sx, sy]);
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = m.severity === "error" ? tok.danger : tok.warning; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = tok.surface; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillText("!", sx, sy + 0.5);
    }
  }
  ctx.restore();
}
