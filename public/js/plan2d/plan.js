/* The top-down plan, drawn with the plan tokens from docs/DESIGN.md 4.4: floors, grid, department blocks,
 * fixtures, walls with door cuts, labels with halos, the walker, the scan-lines overlay and the Measure / place
 * tool. Pan with drag or the arrow keys, zoom with the wheel, pinch or + / -, F fits the store, N / Shift+N
 * steps through the items. Editing (select, move, resize, rotate, Edit shape) lives in editor.js and plugs in
 * through the `editor` option; the layout it draws is swapped with setLayout() whenever the open map changes. */
import {clamp, rad, toWorld, pointInPoly} from "../core/geometry.js";
import {PAL, TYPES, displayName, outlineOf, inOutline, FOUNDATION_GRID} from "../core/model.js";
import {ringOf, bandPoly} from "../core/ring.js";
import {outline as blockOutline} from "../core/areas.js";
import {drawScanLines, drawMeasure} from "./overlay.js";
import {drawBlocks, drawBlockLabels} from "./blocks.js";

/* ---------- tokens (read once per theme change; canvas can't read CSS variables) ---------- */
const TOKEN_NAMES = {
  planBg: "--plan-bg", planFloor: "--plan-floor", planGrid: "--plan-grid", planGridMajor: "--plan-grid-major", planWall: "--plan-wall",
  planStructure: "--plan-structure", planDoor: "--plan-door", planFixtureFill: "--plan-fixture-fill", planFixtureStroke: "--plan-fixture-stroke",
  planItemMix: "--plan-item-mix", planLabel: "--plan-label", planLabelHalo: "--plan-label-halo", planScan: "--plan-scan", planMeasure: "--plan-measure",
  planDimBg: "--plan-dim-bg", planDimInk: "--plan-dim-ink", planFaint: "--plan-faint", selStroke: "--sel-stroke", selFill: "--sel-fill", selHover: "--sel-hover",
  selHandle: "--sel-handle", selHandleStroke: "--sel-handle-stroke", selMarqueeFill: "--sel-marquee-fill", selMarqueeStroke: "--sel-marquee-stroke",
  snapGuide: "--snap-guide", catFillAlpha: "--cat-fill-alpha", warning: "--warning", warningSoft: "--warning-soft",
  inkSubtle: "--ink-subtle", inkMuted: "--ink-muted", surface: "--surface", fontBody: "--font-body", fontDisplay: "--font-display",
  danger: "--danger", dangerSoft: "--danger-soft", success: "--success", successSoft: "--success-soft", accent: "--accent", accentSoft: "--accent-soft",
  accentInk: "--accent-ink", planGhostBefore: "--plan-ghost-before", planGhostAfter: "--plan-ghost-after", inkInverse: "--ink-inverse", surfaceInverse: "--surface-inverse",
  cat12: "--cat-12", cat01: "--cat-01",
};
export function readPlanTokens() {
  const cs = getComputedStyle(document.documentElement), t = {};
  for (const [k, v] of Object.entries(TOKEN_NAMES)) t[k] = cs.getPropertyValue(v).trim();
  t.mix = (parseFloat(t.planItemMix) || 45) / 100;
  t.faint = parseFloat(t.planFaint) || 0.28;
  return t;
}

/* ---------- colour helpers ---------- */
const rgbOf = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) return [128, 128, 128]; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
/** color-mix(in srgb, a f, b): canvas can't do this, so mix in JS. */
export function mix(a, b, f) { const p = rgbOf(a), q = rgbOf(b); return `rgb(${Math.round(p[0] * f + q[0] * (1 - f))},${Math.round(p[1] * f + q[1] * (1 - f))},${Math.round(p[2] * f + q[2] * (1 - f))})`; }

/* ---------- view transform: centre (ft), pixels per foot, size in CSS pixels ---------- */
export const w2s = (v, x, y) => [(x - v.cx) * v.s + v.W / 2, v.H / 2 - (y - v.cy) * v.s];
export const s2w = (v, sx, sy) => [(sx - v.W / 2) / v.s + v.cx, (v.H / 2 - sy) / v.s + v.cy];
/** An item's outline in store feet: a department block's shape, an item's own polygon, else its rectangle. */
export const shapeOf = it => (it.type === "area" ? blockOutline(it) : outlineOf(it));
// an item's outline on screen
function pathItem(ctx, v, it) { const c = shapeOf(it).map(p => w2s(v, p[0], p[1])); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); }

const FIXTURE_ORDER = {platform: 0, ring: 2, stairs: 3};
const isPassage = it => it.type === "door" || it.type === "opening" || it.type === "arch";
const STRUCT_DRAW = new Set(["wall", "column"]);
// fixed desks, stairs and platforms belong to the Structure layer (SPEC-v3-API)
const isStructureLike = it => it.type === "stairs" || it.type === "column" || it.fixed === true;
const shownBy = (it, layers) => (isStructureLike(it) || STRUCT_DRAW.has(it.type) || isPassage(it) ? layers.structure !== false : layers.fixtures !== false);

/**
 * Draws the plan (everything except the tool overlays).
 * opts: {mini, layers: {labels, structure, fixtures, scanLines, grid, categories}, selIds (Set), hover, overlay (scan overlay
 *        data), cats (Map key -> category), dark, faint (fixtures at --plan-faint), ghost (a block being placed)}
 */
export function drawPlan(ctx, v, layout, tok, opts = {}) {
  const layers = opts.layers || {labels: true, structure: true, fixtures: true, scanLines: false};
  const items = layout.items, floors = items.filter(it => it.type === "floor");
  const selIds = opts.selIds || new Set();
  ctx.fillStyle = tok.planBg; ctx.fillRect(0, 0, v.W, v.H);
  // 1. the building: floors in --plan-floor
  ctx.fillStyle = tok.planFloor; ctx.beginPath(); for (const f of floors) pathItem(ctx, v, f); ctx.fill();
  // 2. grid, clipped to the building (5 ft, 10 ft major, 1 ft when zoomed in; never closer than 8px)
  if (!opts.mini && layers.grid !== false) {
    ctx.save(); ctx.beginPath(); for (const f of floors) pathItem(ctx, v, f); ctx.clip();
    const [x0, y1] = s2w(v, 0, 0), [x1, y0] = s2w(v, v.W, v.H);
    const lines = (step, col) => {
      if (step * v.s < 8) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const sx = Math.round(w2s(v, x, 0)[0]) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, v.H); }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const sy = Math.round(w2s(v, 0, y)[1]) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(v.W, sy); }
      ctx.stroke();
    };
    if (v.s >= 12) { ctx.globalAlpha = 0.55; lines(1, tok.planGrid); ctx.globalAlpha = 1; }
    lines(5, tok.planGrid); lines(10, tok.planGridMajor);
    ctx.restore();
  }
  // 3. floors: outline
  ctx.lineWidth = 1; ctx.strokeStyle = tok.planStructure;
  for (const f of floors) { ctx.beginPath(); pathItem(ctx, v, f); ctx.stroke(); }
  // 4. upper levels (zones): dashed outline
  ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = tok.planDoor;
  for (const it of items) if (it.type === "zone") { ctx.beginPath(); pathItem(ctx, v, it); ctx.stroke(); }
  ctx.restore();
  // 5. department blocks
  const blocksOn = layers.categories !== false && !opts.mini;
  if (blocksOn) drawBlocks(ctx, v, layout, tok, {dark: opts.dark, cats: opts.cats, ghost: opts.ghost});
  // 6. fixtures (and fixed desks / platforms / stairs)
  const faintFixtures = !!opts.faint;
  if (layers.fixtures !== false || layers.structure !== false || faintFixtures) {
    const list = items.filter(it => !STRUCT_DRAW.has(it.type) && !isPassage(it) && it.type !== "floor" && it.type !== "zone" && it.type !== "ceiling" && it.type !== "area")
      .filter(it => (isStructureLike(it) ? layers.structure !== false : layers.fixtures !== false || faintFixtures))
      .sort((a, b) => (FIXTURE_ORDER[a.type] ?? 5) - (FIXTURE_ORDER[b.type] ?? 5));
    for (const it of list) {
      const faint = faintFixtures && !isStructureLike(it) && layers.fixtures === false;
      if (faint) ctx.globalAlpha = tok.faint;
      drawFixture(ctx, v, it, tok, opts.mini);
      if (faint) ctx.globalAlpha = 1;
    }
  }
  // 7. structure: walls and columns solid, then door / opening / arch cuts
  if (layers.structure !== false) {
    ctx.fillStyle = tok.planWall; ctx.strokeStyle = tok.planWall; ctx.lineWidth = 1;
    for (const it of items) {
      if (!STRUCT_DRAW.has(it.type)) continue;
      ctx.beginPath(); pathItem(ctx, v, it); ctx.fill();
      if (Math.min(it.w, it.d) * v.s < 2) ctx.stroke(); // at least ~2px on screen
    }
    for (const it of items) if (isPassage(it)) drawPassage(ctx, v, it, tok, opts.mini);
  }
  // 8. scan lines
  if (layers.scanLines && opts.overlay) drawScanLines(ctx, v, opts.overlay, tok, w2s);
  // foundation grid A-H / 1-5 (the building drawings' grid; wall names refer to it)
  if (!opts.mini) drawFoundationGrid(ctx, v, layout, tok);
  // 9. labels: department blocks first, then fixtures (biggest first), then room names in a free spot, then doors;
  // a label that would overlap one already drawn is left out (selecting the item shows its name anyway)
  if (!opts.mini) {
    const placed = [];
    const shown = it => shownBy(it, layers) && !(faintFixtures && layers.fixtures === false && !isStructureLike(it) && !STRUCT_DRAW.has(it.type) && !isPassage(it));
    if (blocksOn && layers.labels !== false) drawBlockLabels(ctx, v, layout, tok, {cats: opts.cats, placed, small: v.W < 500});
    if (layers.labels !== false) {
      const list = items.filter(it => !["floor", "wall", "ceiling", "area"].includes(it.type) && !isPassage(it) && shown(it)).sort((a, b) => b.w * b.d - a.w * a.d);
      for (const it of list) drawLabel(ctx, v, it, tok, placed);
    }
    const blockers = items.filter(it => !["floor", "zone", "ceiling", "area"].includes(it.type) && shown(it)).map(it => screenBox(v, it));
    drawRoomNames(ctx, v, floors, tok, placed, blockers);
    if (layers.labels !== false) for (const it of items) if (isPassage(it) && shown(it)) drawLabel(ctx, v, it, tok, placed);
  }
  // 10. hover + selection (fixtures get the fill too; department blocks only the stroke so their colour stays readable)
  if (opts.hover && !selIds.has(opts.hover.id)) { ctx.save(); ctx.beginPath(); pathItem(ctx, v, opts.hover); ctx.lineWidth = 1.5; ctx.strokeStyle = tok.selHover; ctx.stroke(); ctx.restore(); }
  if (selIds.size) {
    ctx.save();
    for (const id of selIds) {
      const it = layout.byId.get(id); if (!it) continue;
      ctx.beginPath(); pathItem(ctx, v, it);
      if (it.type !== "area") { ctx.fillStyle = tok.selFill; ctx.fill(); }
      ctx.lineWidth = 2; ctx.strokeStyle = tok.selStroke; ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFixture(ctx, v, it, tok, mini) {
  ctx.save();
  if (it.type === "ring") { drawRing(ctx, v, it, tok); ctx.restore(); return; }
  const base = it.type === "gondola" || it.type === "wallunit" ? ((PAL[it.brand] || [])[0] || it.color || "#9a9c9e") : (it.color || "#9a9c9e");
  ctx.beginPath(); pathItem(ctx, v, it);
  ctx.fillStyle = mix(base, tok.planFloor, it.type === "platform" ? tok.mix * 0.7 : tok.mix); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = tok.planFixtureStroke;
  if (it.type === "platform") ctx.setLineDash([3, 2]);
  ctx.stroke(); ctx.setLineDash([]);
  if (it.type === "stairs" && !mini) {
    let n = Math.max(2, Math.round((it.h || 10) / 0.62)); if (it.w * v.s / n < 4) n = Math.max(2, Math.floor(it.w * v.s / 6));
    ctx.beginPath();
    for (let i = 1; i < n; i++) { const lx = -it.w / 2 + i * it.w / n; const a = w2s(v, ...toWorld(it, lx, -it.d / 2)), b = w2s(v, ...toWorld(it, lx, it.d / 2)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
  }
  if (it.type === "wallunit") { // heavy line on the back side
    const a = w2s(v, ...toWorld(it, -it.w / 2, -it.d / 2)), b = w2s(v, ...toWorld(it, it.w / 2, -it.d / 2));
    ctx.lineWidth = 2.5; ctx.strokeStyle = tok.planFixtureStroke; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.restore();
}
function drawRing(ctx, v, it, tok) {
  const rr = ringOf(it), tr = q => w2s(v, ...toWorld(it, q[0], q[1]));
  for (const run of rr.runs) {
    const b = bandPoly(run, rr.h); ctx.beginPath();
    for (const loop of [b.outer, b.hole]) { if (!loop) continue; loop.forEach((q, i) => { const s = tr(q); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); }
    ctx.fillStyle = mix(it.color || "#f3f3f1", tok.planFloor, tok.mix); ctx.fill("evenodd"); ctx.strokeStyle = tok.planFixtureStroke; ctx.lineWidth = 1; ctx.stroke();
  }
}
// doors, openings and arches cut the wall: floor-coloured gap, 1.5px jamb ticks, a swing arc (doors) or a dashed centre line (openings)
function drawPassage(ctx, v, it, tok, mini) {
  ctx.save();
  ctx.beginPath(); pathItem(ctx, v, it); ctx.fillStyle = tok.planFloor; ctx.fill();
  ctx.strokeStyle = tok.planDoor; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const s of [-1, 1]) { const a = w2s(v, ...toWorld(it, s * it.w / 2, -it.d / 2)), b = w2s(v, ...toWorld(it, s * it.w / 2, it.d / 2)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  if (it.type === "opening" || it.type === "arch") {
    const a = w2s(v, ...toWorld(it, -it.w / 2, 0)), b = w2s(v, ...toWorld(it, it.w / 2, 0));
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  if (!mini && it.type === "door" && v.s > 3) { // swing arcs into the room (+y side)
    const leaves = it.w > 4.5 ? 2 : 1, lw = it.w / leaves; ctx.lineWidth = 1;
    for (let k = 0; k < leaves; k++) {
      const hx = k === 0 ? -it.w / 2 : it.w / 2, sgn = k === 0 ? 1 : -1;
      const h = w2s(v, ...toWorld(it, hx, it.d / 2)), tip = w2s(v, ...toWorld(it, hx, it.d / 2 + lw)), e = w2s(v, ...toWorld(it, hx + sgn * lw, it.d / 2));
      const r = Math.hypot(tip[0] - h[0], tip[1] - h[1]); const a0 = Math.atan2(e[1] - h[1], e[0] - h[0]), a1 = Math.atan2(tip[1] - h[1], tip[0] - h[0]);
      ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(h[0], h[1], r, a0, a1, (a1 - a0 + Math.PI * 3) % (Math.PI * 2) - Math.PI < 0); ctx.stroke();
    }
  }
  ctx.restore();
}
// room names (WAREHOUSE, SALES, FRONT ROOM...): Barlow Condensed 600 12px, tracked out, in the first free spot
// along the room (top, bottom, middle), skipped where fixtures or labels cover every spot
function drawRoomNames(ctx, v, floors, tok, placed, blockers) {
  ctx.save();
  ctx.font = `600 12px ${tok.fontDisplay}`; ctx.fillStyle = tok.inkSubtle; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "1.7px";
  for (const f of floors) {
    const name = (f.name || "").replace(/\s+floor$/i, "").toUpperCase();
    const tw = ctx.measureText(name).width + 6, th = 16;
    if (f.w * v.s < tw + 12 || f.d * v.s < 40) continue;
    const top = w2s(v, f.x, f.y + f.d / 2)[1], bottom = w2s(v, f.x, f.y - f.d / 2)[1], cx = w2s(v, f.x, f.y)[0];
    for (const cy of [top + 14, bottom - 14, (top + bottom) / 2, top + 34, bottom - 34]) {
      const box = {x0: cx - tw / 2, y0: cy - th / 2, x1: cx + tw / 2, y1: cy + th / 2};
      if (placed.some(b => overlaps(b, box)) || blockers.some(b => overlaps(b, box))) continue;
      ctx.fillText(name, cx, cy); placed.push(box); break;
    }
  }
  ctx.restore();
}
const overlaps = (a, b, pad = 2) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
function screenBox(v, it) {
  const cs = shapeOf(it).map(p => w2s(v, p[0], p[1]));
  return {x0: Math.min(...cs.map(c => c[0])), y0: Math.min(...cs.map(c => c[1])), x1: Math.max(...cs.map(c => c[0])), y1: Math.max(...cs.map(c => c[1]))};
}
// the building drawings' grid as calibrated (core/model.js): A-H west to east, 1-5 north to south
function drawFoundationGrid(ctx, v, layout, tok) {
  if (layout.building.L < 100) return; // only the real store has this grid
  const GX = FOUNDATION_GRID.columns, GY = FOUNDATION_GRID.rows;
  ctx.save();
  ctx.strokeStyle = tok.planGridMajor; ctx.setLineDash([6, 5]); ctx.lineWidth = 1; ctx.beginPath();
  for (const k in GX) { const [sx, sy0] = w2s(v, GX[k], -3), sy1 = w2s(v, GX[k], -1)[1]; ctx.moveTo(sx, sy0); ctx.lineTo(sx, sy1); }
  for (const k in GY) { const [sx0, sy] = w2s(v, -3, GY[k]), sx1 = w2s(v, -1, GY[k])[0]; ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy); }
  ctx.stroke(); ctx.setLineDash([]);
  if (v.s >= 2.5) {
    ctx.font = `600 11px ${tok.fontDisplay}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const bubble = (x, y, t) => { ctx.fillStyle = tok.surface; ctx.strokeStyle = tok.planGridMajor; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = tok.inkMuted; ctx.fillText(t, x, y + 1); };
    for (const k in GX) { const [sx, sy] = w2s(v, GX[k], -5.5); bubble(sx, sy, k); }
    for (const k in GY) { const [sx, sy] = w2s(v, -5.5, GY[k]); bubble(sx, sy, k); }
  }
  ctx.restore();
}
function drawLabel(ctx, v, it, tok, placed) {
  if (it.type === "door" && v.s < 5) return;
  const long = Math.max(it.w, it.d) * v.s, short = Math.min(it.w, it.d) * v.s;
  if (long < 28) return;
  const size = clamp(short * 0.55, 9.5, 11) + (it.type === "zone" ? 0.5 : 0);
  let name = it.name || (TYPES[it.type] || {}).label || it.type;
  const [sx, sy] = w2s(v, it.x, it.y);
  let ang = -rad(it.rot || 0); if (it.d > it.w) ang -= Math.PI / 2;
  while (ang > Math.PI / 2 + 1e-6) ang -= Math.PI; while (ang < -Math.PI / 2 - 1e-6) ang += Math.PI; // never upside down
  const passage = isPassage(it);
  ctx.save();
  ctx.font = `${passage ? 600 : 500} ${size}px ${tok.fontBody}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  const max = passage ? Infinity : long - 6;
  if (ctx.measureText(name).width > max) { name = displayName(it); if (ctx.measureText(name).width > max) name = firstWords(name); }
  const tw = ctx.measureText(name).width;
  if (tw > max) { ctx.restore(); return; }
  const y = passage ? -(short / 2 + 9) : 0;
  // where the text lands on screen (an axis-aligned box around the turned text), to keep labels apart
  const c = Math.cos(ang), s = Math.sin(ang), hw = tw / 2 + 2, hh = size / 2 + 2, mx = sx - s * y, my = sy + c * y;
  const ex = Math.abs(c) * hw + Math.abs(s) * hh, ey = Math.abs(s) * hw + Math.abs(c) * hh;
  const box = {x0: mx - ex, y0: my - ey, x1: mx + ex, y1: my + ey};
  if (placed && placed.some(b => overlaps(b, box))) { ctx.restore(); return; }
  if (placed) placed.push(box);
  ctx.translate(sx, sy); ctx.rotate(ang);
  ctx.lineWidth = 3; ctx.strokeStyle = tok.planLabelHalo; ctx.strokeText(name, 0, y);
  ctx.fillStyle = passage ? tok.planDoor : tok.planLabel; ctx.fillText(name, 0, y);
  ctx.restore();
}
// "WORKWEAR & APPAREL CORNER" -> "WORKWEAR & APPAREL": the first two words, keeping a joining "&" or "/"
function firstWords(name) {
  const w = name.split(/\s+/);
  return (w.length > 2 && /^[&/+-]$/.test(w[1]) ? w.slice(0, 3) : w.slice(0, 2)).join(" ").replace(/[,;:]+$/, "");
}

/** "You are here": a dot with a wedge showing which way the walker looks, plus the path they are on. */
export function drawWalker(ctx, v, ME, halfH, tok, mini) {
  const acc = tok.selStroke;
  ctx.save();
  if (ME.path.length) {
    ctx.setLineDash(mini ? [2, 3] : [3, 4]); ctx.lineWidth = mini ? 1.5 : 2; ctx.strokeStyle = acc;
    ctx.beginPath(); const p0 = w2s(v, ME.x, ME.y); ctx.moveTo(p0[0], p0[1]); for (const p of ME.path) { const q = w2s(v, p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke(); ctx.setLineDash([]);
  }
  if (ME.target && ME.path.length) { const [tx, ty] = w2s(v, ME.target[0], ME.target[1]); ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, mini ? 4 : 7, 0, Math.PI * 2); ctx.stroke(); }
  const [x, y] = w2s(v, ME.x, ME.y), r = mini ? 4.5 : clamp(0.9 * v.s, 7, 11);
  const ang = Math.atan2(-Math.cos(ME.yaw), -Math.sin(ME.yaw)), len = mini ? 26 : clamp(14 * v.s, 44, 150);
  const [cr, cg, cb] = rgbOf(acc);
  const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, len); g.addColorStop(0, `rgba(${cr},${cg},${cb},${mini ? 0.6 : 0.45})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, ang - halfH, ang + halfH); ctx.closePath(); ctx.fill();
  ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  ctx.restore();
}

/* ======================================================================================= */
/* The interactive plan view                                                                */
/* ======================================================================================= */
/**
 * createPlanView({canvas, layout, overlay, getLayers, getTool, getWalker, onSelect, onGo, onPointer, onMeasure,
 *                 snapAt, measure, getSelIds, getCats, isDark, getFaint, editor, onViewChange, pickBlocks})
 *  - getTool() -> "select" | "pan" | "measure"; snapAt(x, y, tolFt) -> snap result; measure = core/measure state
 *  - onSelect(item | null, {toggle}) : a tap / click chose an item (the app owns the selection; getSelIds() reads it back)
 *  - onGo(x, y, item) : double-click / double-tap on the floor; onPointer({x, y} | null) for the status bar
 *  - editor (optional, editor.js): {down, move, up, click, dblclick, draw, cursorAt} takes over gestures while editing
 *    (set it to null to turn editing off, e.g. in a read-only mode); extraDraw(ctx, V, tok) draws a mode's own
 *    overlays (collision outlines, the comparison diff, the advisor's heat and paths) on top of the plan
 */
export function createPlanView(o) {
  const {canvas} = o;
  let layout = o.layout;
  const ctx = canvas.getContext("2d");
  const V = {cx: layout.building.L / 2, cy: layout.building.W / 2, s: 6, W: 0, H: 0, dpr: 1, fitted: false};
  const ZMIN = 1.2, ZMAX = 60;
  let tok = readPlanTokens(), hover = null, snapState = null, active = false, queued = false, ghost = null;
  const editor = () => o.editor || null;

  function resize() {
    const r = canvas.getBoundingClientRect(); V.dpr = Math.min(window.devicePixelRatio || 1, 2); V.W = r.width; V.H = r.height;
    const pw = Math.max(1, Math.round(r.width * V.dpr)), ph = Math.max(1, Math.round(r.height * V.dpr));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    if (V.W && !V.fitted) fit(); else draw();
  }
  function fit() {
    if (!V.W) return;
    const {L, W} = layout.building;
    const pad = Math.min(V.W, V.H) < 500 ? 20 : 48;
    V.s = clamp(Math.min((V.W - pad * 2) / (L + 16), (V.H - pad * 2) / (W + 16)), ZMIN, ZMAX); V.cx = L / 2 - 2; V.cy = W / 2 - 2; V.fitted = true; draw();
  }
  /** Zooms so these items fill the view (0 = fit the selection). */
  function fitTo(items, pad = 60) {
    if (!items || !items.length || !V.W) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of items) for (const [x, y] of shapeOf(it)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    V.cx = (x0 + x1) / 2; V.cy = (y0 + y1) / 2;
    V.s = clamp(Math.min((V.W - pad * 2) / Math.max(x1 - x0, 2), (V.H - pad * 2) / Math.max(y1 - y0, 2)), ZMIN, ZMAX);
    draw();
  }
  function zoomAt(f, sx = V.W / 2, sy = V.H / 2) { const [wx, wy] = s2w(V, sx, sy); V.s = clamp(V.s * f, ZMIN, ZMAX); const [nx, ny] = s2w(V, sx, sy); V.cx += wx - nx; V.cy += wy - ny; draw(); }
  function draw() { if (queued || !active) return; queued = true; requestAnimationFrame(() => { queued = false; paint(); }); }
  function paint() {
    if (!active || !V.W) return;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); ctx.clearRect(0, 0, V.W, V.H);
    const layers = o.getLayers();
    const selIds = o.getSelIds ? o.getSelIds() : new Set();
    drawPlan(ctx, V, layout, tok, {layers, selIds, hover, overlay: o.overlay(), cats: o.getCats ? o.getCats() : null, dark: o.isDark ? o.isDark() : false, faint: o.getFaint ? o.getFaint() : false, ghost});
    const w = o.getWalker && o.getWalker(); if (w) drawWalker(ctx, V, w.ME, w.halfH, tok, false);
    if (o.extraDraw) o.extraDraw(ctx, V, tok);
    const ed = editor(); if (ed) ed.draw(ctx, V, tok);
    if (o.getTool() === "measure") drawMeasure(ctx, V, {...o.measure.state, snap: snapState}, tok, w2s);
    if (o.onViewChange) o.onViewChange(V);
  }

  /* ---------- picking: the item under a plan point, topmost first ---------- */
  /**
   * Fixtures and desks first (drawn on top), then department blocks, then walls / columns / doors / stairs, upper
   * levels and floors. Hidden layers are not hit; faint fixtures are not hit (they are only a backdrop).
   */
  function hitItem(wx, wy) {
    const layers = o.getLayers();
    const faint = o.getFaint ? o.getFaint() : false;
    const items = layout.items;
    const fixturesOn = layers.fixtures !== false && !faint;
    if (fixturesOn || layers.structure !== false) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (["floor", "zone", "ceiling", "wall", "area"].includes(it.type)) continue;
        if (!(isStructureLike(it) || isPassage(it) ? layers.structure !== false : fixturesOn)) continue;
        const tol = isPassage(it) ? 4 / V.s : 0;
        if (inOutline(it, wx, wy, tol)) return it;
      }
    }
    if (layers.categories !== false) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.type === "area" && (it.shape === "poly" ? pointInPoly(wx, wy, blockOutline(it)) : inOutline(it, wx, wy, 0))) return it;
      }
    }
    if (layers.structure !== false) {
      for (const it of items) if (it.type === "wall" && inOutline(it, wx, wy, 3 / V.s)) return it;
      for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (it.type === "zone" && inOutline(it, wx, wy, 0)) return it; }
      for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (it.type === "floor" && inOutline(it, wx, wy, 0)) return it; }
    }
    return null;
  }
  /** Is this plan point inside the item's own outline (a department block's polygon included)? */
  function contains(it, wx, wy) {
    if (!it) return false;
    if (it.type === "area") return it.shape === "poly" ? pointInPoly(wx, wy, blockOutline(it)) : inOutline(it, wx, wy, 0);
    return inOutline(it, wx, wy, isPassage(it) || it.type === "wall" ? 4 / V.s : 0);
  }
  /** Items whose outline lies inside a plan rectangle (marquee). Only movable kinds: never floors, zones or ceilings. */
  function itemsIn(x0, y0, x1, y1) {
    const layers = o.getLayers(), faint = o.getFaint ? o.getFaint() : false;
    const lo = [Math.min(x0, x1), Math.min(y0, y1)], hi = [Math.max(x0, x1), Math.max(y0, y1)];
    return layout.items.filter(it => {
      if (["floor", "zone", "ceiling"].includes(it.type)) return false;
      if (it.type === "area" ? layers.categories === false : !(isStructureLike(it) || STRUCT_DRAW.has(it.type) || isPassage(it) ? layers.structure !== false : layers.fixtures !== false && !faint)) return false;
      return shapeOf(it).every(([x, y]) => x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1]);
    });
  }
  function snapFor(wx, wy) { return o.snapAt(wx, wy, 12 / V.s); }

  /* ---------- pointer: drag to pan, pinch, click / tap to pick or measure; the editor takes gestures first ---------- */
  const ptr = new Map(); let drag = null, lastTap = {t: 0, x: 0, y: 0};
  const offsetOf = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const isTouch = e => e.pointerType !== "mouse";
  canvas.addEventListener("pointerdown", e => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const [sx, sy] = offsetOf(e); ptr.set(e.pointerId, {x: sx, y: sy});
    if (ptr.size === 2) {
      if (drag && drag.kind === "edit") { editor().cancelGesture(); }
      const [a, b] = [...ptr.values()]; drag = {kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: V.s, c: s2w(V, (a.x + b.x) / 2, (a.y + b.y) / 2)}; return;
    }
    if (ptr.size > 2) return;
    if (e.button !== 0 && e.button !== undefined && e.pointerType === "mouse" && e.button !== 1) { drag = {kind: "pan", sx, sy, cx: V.cx, cy: V.cy, moved: false}; return; }
    const [wx, wy] = s2w(V, sx, sy);
    const ed = editor();
    if (ed && o.getTool() === "select" && e.button !== 1 && ed.down({e, wx, wy, sx, sy, touch: isTouch(e)})) { drag = {kind: "edit", sx, sy, moved: false}; canvas.classList.add("dragging"); return; }
    drag = {kind: "pan", sx, sy, cx: V.cx, cy: V.cy, moved: false};
  });
  canvas.addEventListener("pointermove", e => {
    const [sx, sy] = offsetOf(e);
    if (ptr.has(e.pointerId)) ptr.set(e.pointerId, {x: sx, y: sy});
    const [wx, wy] = s2w(V, sx, sy);
    if (!drag) {
      o.onPointer({x: wx, y: wy});
      if (e.pointerType === "mouse") {
        if (o.getTool() === "measure") { snapState = snapFor(wx, wy); o.measure.move({x: snapState.x, y: snapState.y}); if (o.onMeasure) o.onMeasure(snapState); canvas.classList.remove("over-item"); canvas.dataset.cursor = ""; draw(); }
        else {
          const ed = editor(), c = ed && o.getTool() === "select" ? ed.cursorAt(sx, sy) : "";
          const h = c ? null : hitItem(wx, wy);
          canvas.dataset.cursor = c || (h ? (o.getTool() === "select" && ed ? "move" : "pointer") : "");
          canvas.classList.toggle("over-item", !!h && !c);
          if (h !== hover) { hover = h; draw(); }
        }
      }
      return;
    }
    if (drag.kind === "pinch") {
      if (ptr.size < 2) return; const [a, b] = [...ptr.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      V.s = clamp(drag.s0 * d / drag.d0, ZMIN, ZMAX); const m = s2w(V, (a.x + b.x) / 2, (a.y + b.y) / 2); V.cx += drag.c[0] - m[0]; V.cy += drag.c[1] - m[1]; draw(); return;
    }
    if (!drag.moved && Math.hypot(sx - drag.sx, sy - drag.sy) > 4) { drag.moved = true; canvas.classList.add("dragging"); }
    if (drag.kind === "edit") { if (drag.moved) editor().move({e, wx, wy, sx, sy, touch: isTouch(e)}); return; }
    if (drag.moved) { V.cx = drag.cx - (sx - drag.sx) / V.s; V.cy = drag.cy + (sy - drag.sy) / V.s; draw(); }
  });
  /** A touch tap that follows another one closely in time and place is a double tap (it also records this tap). */
  function doubleTap(sx, sy) {
    const now = performance.now();
    if (now - lastTap.t < 320 && Math.hypot(sx - lastTap.x, sy - lastTap.y) < 24) { lastTap.t = 0; return true; }
    lastTap = {t: now, x: sx, y: sy};
    return false;
  }
  function endPointer(e) {
    ptr.delete(e.pointerId); canvas.classList.remove("dragging");
    if (!drag) return;
    if (drag.kind === "pinch") { if (ptr.size === 0) drag = null; return; }
    const d = drag; drag = null;
    const [sx, sy] = offsetOf(e), [wx, wy] = s2w(V, sx, sy);
    if (d.kind === "edit") {
      // the second tap of a double tap on an item that is already selected starts a move gesture (the editor claims
      // the pointer), so the double tap is recognised here: that zero-length move is dropped (no undo step) and the
      // item opens for fine-tuning
      const tapped = isTouch(e) && !d.moved && e.type !== "pointercancel";
      if (tapped && doubleTap(sx, sy)) {
        editor().up({e, wx, wy, sx, sy, moved: false, cancelled: true, touch: true});
        editor().dblclick({wx, wy, item: hitItem(wx, wy)});
        return;
      }
      editor().up({e, wx, wy, sx, sy, moved: d.moved, cancelled: e.type === "pointercancel", touch: isTouch(e)});
      return;
    }
    if (d.moved || e.type === "pointercancel") return;
    if (o.getTool() === "measure") {
      snapState = snapFor(wx, wy);
      o.measure.click({x: snapState.x, y: snapState.y});
      if (o.onMeasure) o.onMeasure(snapState);
      draw(); return;
    }
    const ed = editor();
    if (isTouch(e) && doubleTap(sx, sy)) { // touch / pen: double-tap = open / go there
      const it = hitItem(wx, wy);
      if (ed && o.getTool() === "select") ed.dblclick({wx, wy, item: it}); else o.onGo(wx, wy, it);
      return;
    }
    if (ed && o.getTool() === "select") { ed.click({e, wx, wy, sx, sy, touch: isTouch(e), item: hitItem(wx, wy)}); return; }
    o.onSelect(hitItem(wx, wy), {toggle: e.shiftKey});
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !drag) { o.onPointer(null); hover = null; canvas.dataset.cursor = ""; if (o.getTool() === "measure") { o.measure.move(null); snapState = null; if (o.onMeasure) o.onMeasure(null); } draw(); } });
  canvas.addEventListener("dblclick", e => {
    if (o.getTool() === "measure") return;
    const [sx, sy] = offsetOf(e), [wx, wy] = s2w(V, sx, sy), it = hitItem(wx, wy);
    const ed = editor();
    if (ed && o.getTool() === "select") ed.dblclick({wx, wy, item: it}); else o.onGo(wx, wy, it);
  });
  // touches are handled as pointer events above; stop the browser's follow-up mouse clicks / dblclick
  canvas.addEventListener("touchend", e => e.preventDefault(), {passive: false});
  canvas.addEventListener("wheel", e => { e.preventDefault(); const [sx, sy] = offsetOf(e); zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), sx, sy); }, {passive: false});
  canvas.addEventListener("contextmenu", e => { if (editor()) e.preventDefault(); });

  /* ---------- keyboard (while the plan is open) ---------- */
  const pickable = () => {
    const layers = o.getLayers();
    return layout.items.filter(it => !["floor", "zone", "ceiling"].includes(it.type) && (it.type === "area" ? layers.categories !== false : it.type === "wall" ? layers.structure !== false : shownBy(it, layers)))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  };
  function step(dir) {
    const list = pickable(), n = list.length; if (!n) return;
    const selIds = o.getSelIds ? [...o.getSelIds()] : [];
    const i = list.findIndex(it => it.id === selIds[selIds.length - 1]);
    const it = list[i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n];
    ensureVisible(it);
    o.onSelect(it, {});
  }
  /** Pans so the item is on screen (with a margin). */
  function ensureVisible(it) {
    const [sx, sy] = w2s(V, it.x, it.y);
    if (sx < 60 || sx > V.W - 60 || sy < 60 || sy > V.H - 60) { V.cx = it.x; V.cy = it.y; draw(); }
  }
  /** Phone: a bottom sheet covers the lowest `inset` px, so pan until the item sits in the band above it. */
  function revealAbove(it, inset) {
    if (!it || !V.W) return;
    const [sx, sy] = w2s(V, it.x, it.y), band = Math.max(80, V.H - inset);
    if (sy > band - 30 || sy < 40 || sx < 40 || sx > V.W - 40) { V.cx = it.x; V.cy = it.y - (V.H / 2 - band / 2) / V.s; draw(); }
  }
  function keydown(e, onControl) {
    if (onControl && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return false;
    if (e.code === "KeyN") { step(e.shiftKey ? -1 : 1); return true; }
    if (e.code === "KeyF") { fit(); return true; }
    if (e.code === "Equal" || e.code === "NumpadAdd") { zoomAt(1.25); return true; }
    if (e.code === "Minus" || e.code === "NumpadSubtract") { zoomAt(1 / 1.25); return true; }
    // the arrow keys move the plan when nothing is selected (the editor nudges a selection)
    const stp = (e.shiftKey ? 120 : 40) / V.s;
    const nd = {ArrowUp: [0, stp], ArrowDown: [0, -stp], ArrowLeft: [-stp, 0], ArrowRight: [stp, 0]}[e.code];
    if (nd) { e.preventDefault(); V.cx += nd[0]; V.cy += nd[1]; draw(); return true; }
    return false;
  }

  return {
    V, canvas, resize, fit, fitTo, zoomAt, draw, keydown, hitItem, contains, itemsIn, ensureVisible, revealAbove,
    /** The plan point in the middle of the view (where new items drop). */
    center: () => ({x: V.cx, y: V.cy}),
    toScreen: (x, y) => w2s(V, x, y),
    toWorld: (sx, sy) => s2w(V, sx, sy),
    /** The open map changed (edit, undo, another map): draw the new layout. */
    setLayout(l) { const fresh = !layout || layout.building.L !== l.building.L || layout.building.W !== l.building.W; layout = l; if (hover && !l.byId.has(hover.id)) hover = null; if (fresh) V.fitted = false; if (active) resize(); },
    /** A block being placed (drawn dashed), or null. */
    setGhost(g) { ghost = g; draw(); },
    /** Another plan's view (centre + zoom), for two plans locked together: copied only when it differs. */
    setViewFrom(V2) {
      if (!V2 || (Math.abs(V2.cx - V.cx) < 1e-9 && Math.abs(V2.cy - V.cy) < 1e-9 && Math.abs(V2.s - V.s) < 1e-9)) return false;
      V.cx = V2.cx; V.cy = V2.cy; V.s = V2.s; V.fitted = true; draw(); return true;
    },
    /** Pans and zooms so a store-feet box fills the view (with room around it), never closer than 8 ft across. */
    fitBox(b, pad = 60) {
      if (!b || !V.W) return;
      V.cx = b.cx; V.cy = b.cy;
      V.s = clamp(Math.min((V.W - pad * 2) / Math.max(b.x1 - b.x0, 8), (V.H - pad * 2) / Math.max(b.y1 - b.y0, 8)), ZMIN, ZMAX);
      draw();
    },
    setActive(on) { active = on; if (on) { tok = readPlanTokens(); resize(); } },
    get active() { return active; },
    retheme() { tok = readPlanTokens(); draw(); },
  };
}
