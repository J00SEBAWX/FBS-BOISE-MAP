/* Department blocks on the plan (docs/DESIGN.md 4.4 step 5 and section 5): translucent coloured footprints
 * (rectangles or polygons) with a two-line label (NAME / "612 sq ft / 600"), drawn in the category's colour
 * (light or dark value) at --cat-fill-alpha. Pure canvas drawing; no DOM. */
import {outline, blockArea, blockTitle, blockTarget, brandOf} from "../core/areas.js";
import {w2s} from "./plan.js";

/** The colour a category draws in for this theme (custom categories have one colour). */
export function colourOf(cat, dark) {
  if (!cat) return "#677a8b";
  return (dark && cat.colorDark) || cat.color || "#677a8b";
}
/**
 * The colour a block draws in: the department colour, and for a brand block a step of the same hue (the first brand
 * is the department colour, the next ones a little lighter / darker in turn) so brands read as one family.
 */
export function blockColour(it, cat, dark) {
  const base = colourOf(cat, dark);
  const b = brandOf(it, cat);
  if (!b || b.index <= 0) return base;
  const STEPS = [0, 0.22, -0.2, 0.42, -0.36, 0.6];
  return shade(base, STEPS[b.index % STEPS.length]);
}
/** Mixes a #rrggbb colour toward white (t > 0) or black (t < 0) by |t|. */
export function shade(hex, t) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m || !t) return hex;
  const n = parseInt(m[1], 16), to = t > 0 ? 255 : 0, k = Math.min(1, Math.abs(t));
  const ch = v => Math.round(v + (to - v) * k);
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
export const catMap = cats => new Map((cats || []).map(c => [c.key, c]));

function pathOutline(ctx, v, pts) {
  const c = pts.map(p => w2s(v, p[0], p[1]));
  ctx.moveTo(c[0][0], c[0][1]);
  for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]);
  ctx.closePath();
}

/**
 * Draws every block: fill at --cat-fill-alpha, 2px stroke. opts: {dark, cats (Map key -> category), alpha (override),
 * selIds (Set: selected blocks get a selection stroke instead of the fill), ghost (an item drawn dashed)}.
 */
export function drawBlocks(ctx, v, layout, tok, opts = {}) {
  const cats = opts.cats || new Map();
  const alpha = opts.alpha ?? (parseFloat(tok.catFillAlpha) || 0.32);
  ctx.save();
  ctx.lineJoin = "round";
  for (const it of layout.items) {
    if (it.type !== "area") continue;
    const col = blockColour(it, cats.get(it.cat), opts.dark);
    const pts = outline(it);
    ctx.beginPath(); pathOutline(ctx, v, pts);
    ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
  }
  if (opts.ghost) {
    const g = opts.ghost, col = blockColour(g, cats.get(g.cat), opts.dark);
    ctx.beginPath(); pathOutline(ctx, v, outline(g));
    ctx.globalAlpha = alpha * 0.6; ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

/** The label lines for a block: [NAME, "612 sq ft / 600"]; a brand block: [BRAND, "Power Tools · 310 sq ft / 315"]. */
export function blockLines(it, cat) {
  const name = String(blockTitle(it, cat)).toUpperCase();
  const a = Math.round(blockArea(it)).toLocaleString("en-US");
  const target = blockTarget(it, cat);
  const t = target > 0 ? ` / ${Math.round(target).toLocaleString("en-US")}` : "";
  const dept = brandOf(it, cat) && cat ? `${cat.name} · ` : "";
  return [name, `${dept}${a} sq ft${t}`];
}

const overlaps = (a, b, pad = 2) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

/**
 * Labels for the blocks (Barlow Condensed 700 12px UPPERCASE over Plex 500 10px, with the halo), centred on the
 * block's bounding box; the first word only when the name doesn't fit, nothing when even that doesn't.
 * `placed` collects the screen boxes used so later labels can keep clear.
 */
export function drawBlockLabels(ctx, v, layout, tok, opts = {}) {
  const cats = opts.cats || new Map(), placed = opts.placed || [], small = !!opts.small;
  const nameSize = small ? 10 : 12, areaSize = small ? 9.5 : 10;
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  for (const it of layout.items) {
    if (it.type !== "area") continue;
    const pts = outline(it);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const wpx = (x1 - x0) * v.s, hpx = (y1 - y0) * v.s;
    if (wpx < 30 || hpx < 16) continue;
    const [name, area] = blockLines(it, cats.get(it.cat));
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.6px";
    ctx.font = `700 ${nameSize}px ${tok.fontDisplay}`;
    let n = name;
    if (ctx.measureText(n).width > wpx - 8) n = name.split(/\s+/)[0];
    if (ctx.measureText(n).width > wpx - 8) continue;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.font = `500 ${areaSize}px ${tok.fontBody}`;
    const showArea = hpx >= 30 && ctx.measureText(area).width <= wpx - 8;
    const [sx, sy] = w2s(v, (x0 + x1) / 2, (y0 + y1) / 2);
    const tw = Math.max(ctx.measureText(showArea ? area : "").width, ctx.measureText(n).width) + 6, th = showArea ? nameSize + areaSize + 6 : nameSize + 4;
    const box = {x0: sx - tw / 2, y0: sy - th / 2, x1: sx + tw / 2, y1: sy + th / 2};
    if (placed.some(b => overlaps(b, box))) continue;
    placed.push(box);
    const y = showArea ? sy - areaSize / 2 - 1 : sy;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.6px";
    ctx.font = `700 ${nameSize}px ${tok.fontDisplay}`;
    ctx.lineWidth = 3; ctx.strokeStyle = tok.planLabelHalo; ctx.strokeText(n, sx, y);
    ctx.fillStyle = tok.planLabel; ctx.fillText(n, sx, y);
    if (showArea) {
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.font = `500 ${areaSize}px ${tok.fontBody}`;
      const y2 = y + nameSize / 2 + areaSize / 2 + 2;
      ctx.strokeText(area, sx, y2); ctx.fillText(area, sx, y2);
    }
  }
  ctx.restore();
}
