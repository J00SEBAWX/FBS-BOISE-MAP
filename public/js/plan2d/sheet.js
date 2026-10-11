/* The printable sheet for Print / PDF / Email (ui/export.js): a letter page, landscape, with a title band, the floor
 * plan (drawn by drawPlan, so it matches the screen, always in light colours), a scale bar and north arrow, and the
 * departments with their square feet against the targets. Everything is drawn on one canvas, so the PDF needs no fonts. */
import {drawPlan} from "./plan.js";
import {catMap, colourOf} from "./blocks.js";
import {summary} from "../core/areas.js";
import {formatSqft} from "../core/units.js";

export const SHEET = Object.freeze({W: 1650, H: 1275}); // letter landscape at 150 px per inch (logical pixels)

const STATUS = {ok: "On target", under: "Under target", over: "Over target", none: "Not placed"};

/** Text that fits in maxW: shortened with an ellipsis. */
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/**
 * drawSheet(ctx, {layout, doc, cats, tok, layers, title, subtitle, note, date})
 * ctx is already scaled so that one unit is one logical sheet pixel (SHEET.W x SHEET.H).
 */
export function drawSheet(ctx, o) {
  const {W, H} = SHEET, tok = o.tok, pad = 54;
  ctx.save();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

  // title band
  ctx.fillStyle = "#0b4f8a"; ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = "#ffffff"; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.font = `700 22px ${tok.fontDisplay}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillText("FBS BOISE · STORE MAP", pad, 38);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.font = `700 34px ${tok.fontDisplay}`;
  ctx.fillText(fit(ctx, o.title || "Map", W - 2 * pad - 360), pad, 78);
  ctx.textAlign = "right"; ctx.font = `500 17px ${tok.fontBody}`;
  ctx.fillText(o.subtitle || "", W - pad, 46);
  ctx.fillText(o.date || "", W - pad, 74);

  // the plan across the page, the departments in columns under it
  const L = o.layout.building.L, Wd = o.layout.building.W;
  const S = summary(o.doc, {merged: o.cats});
  const rows = S.rows.filter(r => !r.hidden);
  const cols = 3, rowH = 40, listTop = (n) => H - 92 - Math.ceil(Math.max(n, 1) / cols) * rowH - 52;
  const top = 116, planW = W - 2 * pad;
  const planH = Math.max(380, listTop(rows.length) - top - 16);
  const plan = {x: pad, y: top, w: planW, h: planH};
  const s = Math.min((plan.w - 30) / (L + 9), (plan.h - 30) / (Wd + 9));
  const v = {cx: L / 2 - 2.5, cy: Wd / 2 - 2.5, s, W: plan.w, H: plan.h};
  ctx.save();
  ctx.translate(plan.x, plan.y);
  ctx.beginPath(); ctx.rect(0, 0, plan.w, plan.h); ctx.clip();
  drawPlan(ctx, v, o.layout, tok, {layers: {...o.layers, labels: true, scanLines: false}, cats: catMap(o.cats), dark: false, faint: o.layers.faint});
  ctx.restore();
  ctx.strokeStyle = "#c9d2db"; ctx.lineWidth = 1; ctx.strokeRect(plan.x + 0.5, plan.y + 0.5, plan.w - 1, plan.h - 1);

  // north arrow (top right of the plan) and a 20 ft scale bar (bottom left)
  const nx = plan.x + plan.w - 34, ny = plan.y + 40;
  ctx.fillStyle = "#1d2b3a"; ctx.beginPath(); ctx.moveTo(nx, ny - 20); ctx.lineTo(nx + 10, ny + 8); ctx.lineTo(nx, ny + 2); ctx.lineTo(nx - 10, ny + 8); ctx.closePath(); ctx.fill();
  ctx.font = `700 15px ${tok.fontDisplay}`; ctx.textAlign = "center"; ctx.fillText("N", nx, ny + 28);
  const bar = 20 * s, bx = plan.x + 22, by = plan.y + plan.h - 22;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(bx - 8, by - 22, bar + 70, 34);
  ctx.strokeStyle = "#1d2b3a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, by - 6); ctx.lineTo(bx, by); ctx.lineTo(bx + bar, by); ctx.lineTo(bx + bar, by - 6); ctx.moveTo(bx + bar / 2, by - 4); ctx.lineTo(bx + bar / 2, by); ctx.stroke();
  ctx.fillStyle = "#1d2b3a"; ctx.font = `500 14px ${tok.fontBody}`; ctx.textAlign = "left"; ctx.fillText("20 ft", bx + bar + 8, by + 1);

  // departments
  let y = plan.y + plan.h + 34;
  ctx.textAlign = "left"; ctx.fillStyle = "#1d2b3a"; ctx.font = `700 20px ${tok.fontDisplay}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
  ctx.fillText("DEPARTMENTS", pad, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.font = `500 15px ${tok.fontBody}`; ctx.fillStyle = "#4a5a6a";
  ctx.fillText(`${S.totals.placed} of ${S.totals.total} placed · ${formatSqft(S.totals.plannedSqft)} planned · targets ${formatSqft(S.totals.targetSqft)}`, pad + 160, y);
  const colW = (W - 2 * pad) / cols;
  rows.forEach((r, i) => {
    const cx = pad + (i % cols) * colW, cy = y + 16 + Math.floor(i / cols) * rowH;
    ctx.fillStyle = colourOf({color: r.color}, false); ctx.fillRect(cx, cy + 4, 16, 16);
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 4.5, 15, 15);
    ctx.fillStyle = "#1d2b3a"; ctx.font = `600 15px ${tok.fontBody}`;
    ctx.fillText(fit(ctx, r.name, colW - 34), cx + 26, cy + 17);
    ctx.font = `400 13px ${tok.fontBody}`;
    ctx.fillStyle = r.status === "none" ? "#8a96a3" : r.status === "ok" ? "#2e7d32" : "#b26a00";
    const sq = r.placed ? `${formatSqft(r.sqft)} of ${r.targetSqft ? formatSqft(r.targetSqft) : "no target"}` : r.targetSqft ? `target ${formatSqft(r.targetSqft)}` : "";
    ctx.fillText(fit(ctx, [STATUS[r.status], sq].filter(Boolean).join(" · "), colW - 34), cx + 26, cy + 34);
  });
  if (!rows.length) { ctx.fillStyle = "#8a96a3"; ctx.font = `400 15px ${tok.fontBody}`; ctx.fillText("No departments on this map yet.", pad, y + 30); }

  // footer
  ctx.fillStyle = "#4a5a6a"; ctx.font = `400 14px ${tok.fontBody}`; ctx.textAlign = "left";
  ctx.fillText("North is up. Grid lines every 5 ft (darker every 10 ft). Sizes are approximate: check with a tape before moving fixtures.", pad, H - 52);
  ctx.fillText(o.note || "Made with the FBS Boise Store Map · franklinmap-boise.com", pad, H - 30);
  ctx.restore();
  return {v, plan};
}

