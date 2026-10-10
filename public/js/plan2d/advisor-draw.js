/* Advisor overlays on the plan (OWNER RULES v3.1, rule 6): heat (hot / cold traffic), sight-line cones from
 * the sales desks and the front door, the main traffic paths, choke points, the entrance / door zones and the
 * cold spots; plus the "Show me" highlight of a recommendation (its items, region and points). Pure canvas. */
import {w2s, shapeOf} from "./plan.js";

const rgbOf = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) return [128, 128, 128]; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${a})`; };
function pathPoly(ctx, v, pts) {
  const c = pts.map(p => w2s(v, p[0], p[1]));
  ctx.moveTo(c[0][0], c[0][1]);
  for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]);
  ctx.closePath();
}
function pathShape(ctx, v, it) { pathPoly(ctx, v, shapeOf(it)); }
function pill(ctx, x, y, text, bg, ink, tok) {
  ctx.font = `600 11px ${tok.fontBody}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 14, h = 20, r = 10;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + r, y - h / 2); ctx.lineTo(x + w / 2 - r, y - h / 2); ctx.arc(x + w / 2 - r, y, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x - w / 2 + r, y + h / 2); ctx.arc(x - w / 2 + r, y, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  ctx.fillStyle = bg; ctx.fill(); ctx.fillStyle = ink; ctx.fillText(text, x, y + 0.5);
}
/** Heat colour: cold (slate, faint) through warm to hot (orange, strong). */
export function heatColour(value, tok) {
  const t = Math.max(0, Math.min(1, value));
  if (t < 0.12) return rgba(tok.cat12, 0.22 * (1 - t / 0.12) + 0.04);
  return rgba(tok.cat01, 0.07 + 0.36 * ((t - 0.12) / 0.88));
}

/**
 * drawOverlays(ctx, v, overlays, toggles, tok): overlays from core/advisor.js analyse().overlays, toggles
 * {heat, sightlines, paths, chokePoints, zones, coldSpots} (core/advisor-ui.js OVERLAYS).
 */
export function drawOverlays(ctx, v, overlays, toggles, tok) {
  if (!overlays || !toggles) return;
  ctx.save(); ctx.lineJoin = "round";
  // 1. heat: one cell per coarse grid square (the engine already averaged it)
  if (toggles.heat && overlays.heat) {
    const H = overlays.heat, side = H.cell * v.s;
    for (let j = 0; j < H.ny; j++) for (let i = 0; i < H.nx; i++) {
      const val = H.values[j * H.nx + i];
      if (val < 0) continue;
      const [sx, sy] = w2s(v, H.x0 + i * H.cell, H.y0 + (j + 1) * H.cell);
      ctx.fillStyle = heatColour(val / 100, tok);
      ctx.fillRect(sx, sy, side + 0.5, side + 0.5);
    }
  }
  // 2. cold spots: dashed slate boxes
  if (toggles.coldSpots) for (const c of overlays.coldSpots || []) {
    if (!c.polygon || c.polygon.length < 3) continue;
    ctx.beginPath(); pathPoly(ctx, v, c.polygon);
    ctx.fillStyle = rgba(tok.cat12, 0.16); ctx.fill();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = tok.cat12; ctx.stroke(); ctx.setLineDash([]);
    if (v.s >= 2) pill(ctx, ...w2s(v, c.x, c.y), "Cold spot", tok.cat12, "#fff", tok);
  }
  // 3. entrance and door zones
  if (toggles.zones) for (const z of overlays.zones || []) {
    if (!z.polygon || z.polygon.length < 3) continue;
    ctx.beginPath(); pathPoly(ctx, v, z.polygon);
    ctx.fillStyle = rgba(tok.planDoor, z.kind === "decompression" ? 0.14 : 0.08); ctx.fill();
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1.25; ctx.strokeStyle = tok.planDoor; ctx.stroke(); ctx.setLineDash([]);
  }
  // 4. sight lines: cones from the desks and the front door
  if (toggles.sightlines) for (const s of overlays.sightlines || []) {
    if (!s.polygon || s.polygon.length < 3) continue;
    ctx.beginPath(); pathPoly(ctx, v, s.polygon);
    ctx.fillStyle = rgba(tok.accent, s.kind === "desk" ? 0.13 : 0.09); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(tok.accent, 0.5); ctx.stroke();
    const [ox, oy] = w2s(v, s.origin[0], s.origin[1]);
    ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fillStyle = tok.accent; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = tok.surface; ctx.stroke();
  }
  // 5. paths: the main trips, thicker for the busier ones
  if (toggles.paths) for (const p of overlays.paths || []) {
    if (!p.points || p.points.length < 2) continue;
    ctx.beginPath();
    p.points.forEach((q, i) => { const s = w2s(v, q[0], q[1]); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
    ctx.lineWidth = 1.5 + 2.5 * Math.min(1, p.weight || 0.3); ctx.strokeStyle = rgba(tok.accent, 0.85); ctx.lineCap = "round"; ctx.stroke();
  }
  // 6. choke points: a ring with the width
  if (toggles.chokePoints) for (const c of overlays.chokePoints || []) {
    const [sx, sy] = w2s(v, c.x, c.y), col = c.severity === "high" ? tok.danger : tok.warning;
    ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    if (v.s >= 6 || (v.s >= 4 && c.severity === "high")) pill(ctx, sx, sy - 20, widthText(c.widthFt), col, "#fff", tok);
  }
  ctx.restore();
}
const widthText = ft => { const f = Math.floor(ft), i = Math.round((ft - f) * 12); return i === 12 ? `${f + 1}' wide` : i ? `${f}' ${i}" wide` : `${f}' wide`; };

/**
 * "Show me": the recommendation's items outlined in the selection colour, its region filled, its points ringed.
 * show = {ids?, region?, points?}; layout gives the items by id.
 */
export function drawHighlight(ctx, v, show, layout, tok) {
  if (!show) return;
  ctx.save(); ctx.lineJoin = "round";
  if (show.region && show.region.length >= 3) {
    ctx.beginPath(); pathPoly(ctx, v, show.region);
    ctx.fillStyle = rgba(tok.accent, 0.16); ctx.fill();
    ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = tok.accent; ctx.stroke(); ctx.setLineDash([]);
  }
  for (const id of show.ids || []) {
    const it = layout && layout.byId ? layout.byId.get(id) : null;
    if (!it) continue;
    ctx.beginPath(); pathShape(ctx, v, it);
    ctx.lineWidth = 3; ctx.strokeStyle = tok.selStroke; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = tok.surface; ctx.stroke();
  }
  for (const p of show.points || []) {
    const [sx, sy] = w2s(v, p[0], p[1]);
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = tok.accent; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = tok.surface; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 16, sy); ctx.lineTo(sx - 12, sy); ctx.moveTo(sx + 12, sy); ctx.lineTo(sx + 16, sy); ctx.moveTo(sx, sy - 16); ctx.lineTo(sx, sy - 12); ctx.moveTo(sx, sy + 12); ctx.lineTo(sx, sy + 16);
    ctx.lineWidth = 2; ctx.strokeStyle = tok.accent; ctx.stroke();
  }
  ctx.restore();
}
