/* Comparison mode on the plan (OWNER RULES v3.1 rule 4; docs/DESIGN.md 6): the overlay diff draws every
 * difference between A (the base) and B colour-coded (added = green outline, removed = grey dashed ghost,
 * moved / resized / rotated = grey dashed "before" + blue "after"), and the side-by-side plans draw the selected
 * row's ghost on each side with a "Before" / "After" chip and the change in a pill. Pure canvas; no DOM. */
import {w2s, shapeOf} from "./plan.js";
import {rowKey, ghostOf} from "../core/compare.js";

function pathShape(ctx, v, it) {
  const c = shapeOf(it).map(p => w2s(v, p[0], p[1]));
  ctx.moveTo(c[0][0], c[0][1]);
  for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]);
  ctx.closePath();
}
function centre(v, it) { return w2s(v, it.x, it.y); }
function pill(ctx, x, y, text, bg, ink, tok, size = 11) {
  ctx.font = `600 ${size}px ${tok.fontBody}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 14, h = 20, r = 10;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + r, y - h / 2); ctx.lineTo(x + w / 2 - r, y - h / 2); ctx.arc(x + w / 2 - r, y, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x - w / 2 + r, y + h / 2); ctx.arc(x - w / 2 + r, y, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = ink; ctx.fillText(text, x, y + 0.5);
}
/** The colours of the three kinds, from the plan tokens. */
export const diffColours = tok => ({added: tok.success, removed: tok.planGhostBefore, changed: tok.planGhostAfter});

/**
 * The overlay diff: every row of the diff on one plan (which shows B). opts.selected = the selected row's key,
 * drawn stronger with its chips and change pill; the others are quieter.
 */
export function drawDiffOverlay(ctx, v, diff, tok, opts = {}) {
  if (!diff) return;
  const col = diffColours(tok), sel = opts.selected || null;
  ctx.save(); ctx.lineJoin = "round";
  const rows = diff.rows.filter(r => r.group !== "category");
  const quiet = rows.filter(r => rowKey(r) !== sel), loud = rows.find(r => rowKey(r) === sel);
  for (const r of quiet) drawRow(ctx, v, r, tok, col, false);
  if (loud) drawRow(ctx, v, loud, tok, col, true);
  ctx.restore();
}
function drawRow(ctx, v, r, tok, col, strong) {
  const {before, after} = ghostOf(r);
  const a = strong ? 1 : 0.75;
  ctx.globalAlpha = a;
  if (r.group === "removed" && before) {
    ctx.beginPath(); pathShape(ctx, v, before);
    ctx.fillStyle = col.removed; ctx.globalAlpha = a * 0.12; ctx.fill(); ctx.globalAlpha = a;
    ctx.setLineDash([5, 4]); ctx.lineWidth = strong ? 2.5 : 1.5; ctx.strokeStyle = col.removed; ctx.stroke(); ctx.setLineDash([]);
  } else if (r.group === "added" && after) {
    ctx.beginPath(); pathShape(ctx, v, after);
    ctx.fillStyle = col.added; ctx.globalAlpha = a * 0.14; ctx.fill(); ctx.globalAlpha = a;
    ctx.lineWidth = strong ? 3 : 2; ctx.strokeStyle = col.added; ctx.stroke();
  } else if (before && after) {
    ctx.beginPath(); pathShape(ctx, v, before);
    ctx.setLineDash([5, 4]); ctx.lineWidth = strong ? 2 : 1.25; ctx.strokeStyle = col.removed; ctx.stroke(); ctx.setLineDash([]);
    if (strong) { const [ax, ay] = centre(v, before), [bx, by] = centre(v, after); if (Math.hypot(bx - ax, by - ay) > 6) arrow(ctx, ax, ay, bx, by, col.changed); }
    ctx.beginPath(); pathShape(ctx, v, after);
    ctx.fillStyle = tok.selFill; ctx.globalAlpha = a * (strong ? 1 : 0.5); ctx.fill(); ctx.globalAlpha = a;
    ctx.lineWidth = strong ? 3 : 2; ctx.strokeStyle = col.changed; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (strong) chips(ctx, v, r, tok, col);
}
function arrow(ctx, ax, ay, bx, by, colour) {
  const ang = Math.atan2(by - ay, bx - ax);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineWidth = 1.5; ctx.strokeStyle = colour; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 8 * Math.cos(ang - 0.4), by - 8 * Math.sin(ang - 0.4)); ctx.lineTo(bx - 8 * Math.cos(ang + 0.4), by - 8 * Math.sin(ang + 0.4)); ctx.closePath();
  ctx.fillStyle = colour; ctx.fill();
}
/** "Before" / "After" chips above the ghosts and the change text in a pill under them. */
function chips(ctx, v, r, tok, col) {
  const {before, after} = ghostOf(r);
  const top = it => { const ys = shapeOf(it).map(p => w2s(v, p[0], p[1])[1]); return Math.min(...ys); };
  const bottom = it => { const ys = shapeOf(it).map(p => w2s(v, p[0], p[1])[1]); return Math.max(...ys); };
  if (before && (r.group === "removed" || after)) pill(ctx, centre(v, before)[0], top(before) - 14, r.group === "removed" ? "Removed" : "Before", col.removed, "#fff", tok);
  if (after) pill(ctx, centre(v, after)[0], top(after) - 14 - (before && after && Math.abs(centre(v, after)[0] - centre(v, before)[0]) < 60 && Math.abs(top(after) - top(before)) < 20 ? 22 : 0), r.group === "added" ? "Added" : "After", r.group === "added" ? col.added : col.changed, "#fff", tok);
  const anchor = after || before;
  const text = shortChange(r);
  if (anchor && text) pill(ctx, centre(v, anchor)[0], bottom(anchor) + 14, text, tok.planDimBg, tok.planDimInk, tok);
}
/** The change in a few words for the pill: "4'6\" north", "13' x 8'", "90°", "Renamed". */
export function shortChange(r) {
  const d = r.details && r.details[0] ? r.details[0] : r.text || "";
  let m = /^Moved .*? (\d.*?)$/.exec(d); if (m) return m[1];
  m = /^Resized .*? to (.+?) \(/.exec(d); if (m) return m[1];
  m = /^Rotated .*? (\d+(?:\.\d+)?°) /.exec(d); if (m) return m[1];
  m = /^Reshaped/.exec(d); if (m) return "Reshaped";
  if (r.group === "added") return "";
  if (r.group === "removed") return "";
  const k = (r.kinds || [])[0];
  return k ? k[0].toUpperCase() + k.slice(1) : "";
}

/**
 * Side by side: on plan A draw the selected row's "before" (removed / changed), on plan B its "after"
 * (added / changed), each with its chip. side = "a" | "b".
 */
export function drawSideGhost(ctx, v, row, side, tok) {
  if (!row || row.group === "category") return;
  const col = diffColours(tok), {before, after} = ghostOf(row);
  const it = side === "a" ? before : after;
  ctx.save(); ctx.lineJoin = "round";
  if (it) {
    ctx.beginPath(); pathShape(ctx, v, it);
    const c = side === "a" ? (row.group === "removed" ? col.removed : col.removed) : (row.group === "added" ? col.added : col.changed);
    ctx.fillStyle = c; ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ctx.strokeStyle = c; if (side === "a") ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    const ys = shapeOf(it).map(p => w2s(v, p[0], p[1])[1]);
    pill(ctx, centre(v, it)[0], Math.min(...ys) - 14, side === "a" ? (row.group === "removed" ? "Removed" : "Before") : (row.group === "added" ? "Added" : "After"), c, "#fff", tok);
    const text = shortChange(row);
    if (side === "b" && text) pill(ctx, centre(v, it)[0], Math.max(...ys) + 14, text, tok.planDimBg, tok.planDimInk, tok);
  } else if (side === "a" && after) {
    // added in B: show where it will be, faintly, on A
    ctx.beginPath(); pathShape(ctx, v, after); ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = col.added; ctx.globalAlpha = 0.6; ctx.stroke();
  } else if (side === "b" && before) {
    ctx.beginPath(); pathShape(ctx, v, before); ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = col.removed; ctx.globalAlpha = 0.6; ctx.stroke();
  }
  ctx.restore();
}
