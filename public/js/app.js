/* FBS Boise Store Map: walk the store at a customer's eye height, or look at the floor plan.
 * View only. The layout comes from js/store-data.js (window.FBS_STORE). three.js r128 is
 * loaded from vendor/three.min.js; if it or WebGL is missing, the Map view still works. */
(function () {
"use strict";

/* ================= data ================= */
const STORE = window.FBS_STORE;
const BLD = STORE.BLD, ITEMS = STORE.ITEMS, TYPES = STORE.TYPES, PAL = STORE.PAL, BRAND_NAMES = STORE.BRAND_NAMES, ATLAS = STORE.ATLAS;
const STRUCT = new Set(["floor", "zone", "wall", "door", "opening", "arch"]);
const EYE_H = 5.5;                 // customer eye height (ft)
const BODY_R = 0.85;               // clearance kept from walls and fixtures while walking (ft)
const FOV_MIN = 35, FOV_MAX = 75;  // zoom range (degrees)
const FRONT_DOOR = ITEMS.find(it => it.type === "door" && /front door/i.test(it.name)) || {x: 115, y: -0.35};

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function ftin(v) { const neg = v < 0; v = Math.abs(v); let f = Math.floor(v + 1e-6), i = Math.round((v - f) * 12); if (i === 12) { f++; i = 0; } return (neg ? "-" : "") + f + "'" + (i ? i + '"' : ""); }
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function toLocal(it, px, py) { const r = -rad(it.rot || 0), dx = px - it.x, dy = py - it.y; return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)]; }
function toWorld(it, lx, ly) { const r = rad(it.rot || 0); return [it.x + lx * Math.cos(r) - ly * Math.sin(r), it.y + lx * Math.sin(r) + ly * Math.cos(r)]; }
function corners(it) { const w = it.w / 2, d = it.d / 2; return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([a, b]) => toWorld(it, a, b)); }
function inItem(it, px, py, tol = 0) { const [lx, ly] = toLocal(it, px, py); return Math.abs(lx) <= it.w / 2 + tol && Math.abs(ly) <= it.d / 2 + tol; }
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } return `rgb(${r | 0},${g | 0},${b | 0})`; }
function hexA(hex, a) { const m = /^#([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return `rgba(200,16,46,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
// "SAFETY ISLE 32'6"" -> "SAFETY ISLE" (the size is shown separately)
function displayName(it) { const n = it.name || (TYPES[it.type] || {}).label || it.type; return n.replace(/\s+\d+'(?:\d+")?(?=\s|$)/g, "").trim() || n; }
function categoryOf(it) {
  const names = [it.brand, it.brand2].filter((b, i, a) => b && a.indexOf(b) === i && BRAND_NAMES[b]).map(b => BRAND_NAMES[b]);
  return names.length ? names.join(" · ") : ((TYPES[it.type] || {}).label || "Fixture");
}
const FLOORS = ITEMS.filter(it => it.type === "floor");
const isFloorAt = (x, y, tol = 0) => FLOORS.some(it => inItem(it, x, y, tol));
const WALLS = ITEMS.filter(it => it.type === "wall");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* ================= state ================= */
const S = {mode: "walk", labels: true, sel: null, spin: false, ceiling: true, has3D: false, dragging: false};
// "me": where the customer stands (plan feet) and where they look (yaw 0 = facing north / +y)
// start about 4 ft inside the front door, facing into the store
const ME = {x: FRONT_DOOR.x, y: FRONT_DOOR.y + 4.35, z: 0, yaw: 0, look: 0, heading: 0, path: [], target: null, face: null};
const CAM = {fov: 62, halfH: rad(45), zoomed: false}; // zoomed: the user has changed the zoom
const keys = new Set();

/* theme tokens (read once, refreshed when the colour scheme changes) */
const TOK = {};
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["map-bg", "map-grid", "map-grid-major", "map-label", "muted", "panel", "accent", "display", "body", "mono"]) TOK[k] = cs.getPropertyValue("--" + k).trim();
}

/* ---------- toast ---------- */
let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800); }

/* ================= plan drawing (shared by the Map view and the mini map) ================= */
// a view = centre (ft), pixels per foot and size in CSS pixels
const w2s = (v, x, y) => [(x - v.cx) * v.s + v.W / 2, v.H / 2 - (y - v.cy) * v.s];
const s2w = (v, sx, sy) => [(sx - v.W / 2) / v.s + v.cx, (v.H / 2 - sy) / v.s + v.cy];
function pathItem(ctx, v, it) { const c = corners(it).map(p => w2s(v, p[0], p[1])); ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); }

// The plan itself is always drawn like paper (light floors), so walls and labels stay dark in both themes.
const PLAN_INK = "#2a3035", PLAN_WALL = "#2b3035";
const DRAW_ORDER = {floor: 0, zone: 9, platform: 1};
const DRAW_LIST = ITEMS.slice().sort((a, b) => (DRAW_ORDER[a.type] ?? 5) - (DRAW_ORDER[b.type] ?? 5));
function drawItems(ctx, v, mini) {
  for (const it of DRAW_LIST) {
    if (it.type === "zone") continue;
    ctx.save();
    if (it.type === "floor") { pathItem(ctx, v, it); ctx.fillStyle = shade(it.color || "#cccccc", 0.45); ctx.fill(); ctx.restore(); continue; }
    if (it.type === "wall") { pathItem(ctx, v, it); ctx.fillStyle = PLAN_WALL; ctx.fill(); ctx.restore(); continue; }
    if (it.type === "door" || it.type === "opening" || it.type === "arch") { drawOpening(ctx, v, it, mini); ctx.restore(); continue; }
    if (it.type === "ring") { drawRing(ctx, v, it); ctx.restore(); continue; }
    pathItem(ctx, v, it);
    const base = it.type === "gondola" || it.type === "wallunit" ? (PAL[it.brand] || [it.color])[0] : (it.color || "#999999");
    ctx.fillStyle = shade(base, it.type === "platform" ? 0.35 : 0.55); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = shade(base, -0.35); ctx.stroke();
    if (it.type === "stairs") {
      const n = Math.max(4, Math.round(it.w / 1.1)); ctx.beginPath();
      for (let i = 1; i < n; i++) { const lx = -it.w / 2 + i * it.w / n; const a = w2s(v, ...toWorld(it, lx, -it.d / 2)), b = w2s(v, ...toWorld(it, lx, it.d / 2)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
    if (it.type === "wallunit") { // heavy line on the back side
      const a = w2s(v, ...toWorld(it, -it.w / 2, -it.d / 2)), b = w2s(v, ...toWorld(it, it.w / 2, -it.d / 2));
      ctx.lineWidth = 2.5; ctx.strokeStyle = shade(base, -0.5); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.restore();
  }
  // upper levels as dashed outlines
  for (const it of ITEMS) { if (it.type !== "zone") continue; ctx.save(); pathItem(ctx, v, it); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.3; ctx.strokeStyle = shade(it.color || "#8a5a34", -0.1); ctx.stroke(); ctx.restore(); }
  if (!mini && S.labels) for (const it of DRAW_LIST) drawLabel(ctx, v, it);
}
function drawOpening(ctx, v, it, mini) {
  const c = corners(it).map(p => w2s(v, p[0], p[1]));
  ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.fillStyle = TOK["map-bg"]; ctx.fill();
  const a = w2s(v, ...toWorld(it, -it.w / 2, 0)), b = w2s(v, ...toWorld(it, it.w / 2, 0));
  ctx.lineWidth = mini ? 1.5 : 3; ctx.strokeStyle = it.type === "opening" ? shade(it.color || "#3b2616", 0) : "#1f8a52";
  if (it.type === "opening") ctx.setLineDash([5, 3]);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
  if (!mini && it.type === "door" && v.s > 3) { // swing arcs into the room (+y side)
    const leaves = it.w > 4.5 ? 2 : 1, lw = it.w / leaves; ctx.lineWidth = 1; ctx.strokeStyle = "#1f8a52";
    for (let k = 0; k < leaves; k++) {
      const hx = k === 0 ? -it.w / 2 : it.w / 2, sgn = k === 0 ? 1 : -1;
      const h = w2s(v, ...toWorld(it, hx, 0)), tip = w2s(v, ...toWorld(it, hx, lw)), e = w2s(v, ...toWorld(it, hx + sgn * lw, 0));
      const r = Math.hypot(tip[0] - h[0], tip[1] - h[1]); const a0 = Math.atan2(e[1] - h[1], e[0] - h[0]), a1 = Math.atan2(tip[1] - h[1], tip[0] - h[0]);
      ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(h[0], h[1], r, a0, a1, (a1 - a0 + Math.PI * 3) % (Math.PI * 2) - Math.PI < 0); ctx.stroke();
    }
  }
  if (!mini && it.type === "arch") { const m = w2s(v, it.x, it.y); ctx.lineWidth = 1.5; ctx.strokeStyle = "#1f8a52"; ctx.beginPath(); const r = it.w / 2 * v.s; const ang = -rad(it.rot || 0); ctx.arc(m[0], m[1], r, ang - Math.PI, ang); ctx.stroke(); }
}

/* ---------- counter rings: rectangle or octagon, with staff openings ---------- */
function ringGaps(it) {
  if (it.open && Array.isArray(it.open.sides)) return it.open.sides.map(sd => ({side: sd, c: 0, w: it.open.w || 3.5}));
  const g = it.gap; if (!g || !(g.b > g.a)) return [];
  const L = (g.side === "S" || g.side === "N") ? it.w : it.d; return [{side: g.side, c: -L / 2 + (g.a + g.b) / 2, w: g.b - g.a}];
}
function ringRuns(it) {
  const t = it.t || 2.5, h = t / 2, X = Math.max(0.1, it.w / 2 - h), Y = Math.max(0.1, it.d / 2 - h);
  const c = it.shape === "oct" ? clamp(it.cham ?? 1.75, 0, Math.min(X, Y) * 0.95) : 0;
  const vt = c > 0 ? [[-X + c, -Y, "S"], [X - c, -Y, "SE"], [X, -Y + c, "E"], [X, Y - c, "NE"], [X - c, Y, "N"], [-X + c, Y, "NW"], [-X, Y - c, "W"], [-X, -Y + c, "SW"]]
                   : [[-X, -Y, "S"], [X, -Y, "E"], [X, Y, "N"], [-X, Y, "W"]];
  const n = vt.length, cum = [0]; for (let i = 0; i < n; i++) { const a = vt[i], b = vt[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const P = cum[n];
  const at = u => { u = ((u % P) + P) % P; let i = 0; while (i < n - 1 && cum[i + 1] < u) i++; const a = vt[i], b = vt[(i + 1) % n], L = cum[i + 1] - cum[i] || 1, f = (u - cum[i]) / L; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  // openings = arc-length intervals centred on a side (they may spill onto the corner cuts)
  const gaps = [];
  for (const g of ringGaps(it)) {
    const i = vt.findIndex(q => q[2] === g.side); if (i < 0) continue;
    const L = cum[i + 1] - cum[i], dir = (g.side === "S" || g.side === "E") ? 1 : -1, mid = cum[i] + L / 2 + dir * (g.c || 0), ww = clamp(g.w, 0.3, P * 0.45);
    gaps.push([mid - ww / 2, mid + ww / 2]);
  }
  gaps.sort((a, b) => a[0] - b[0]);
  const merged = []; for (const g of gaps) { const m = merged[merged.length - 1]; if (m && g[0] <= m[1]) m[1] = Math.max(m[1], g[1]); else merged.push(g.slice()); }
  const runs = [];
  if (!merged.length) runs.push({closed: true, pts: vt.map(q => [q[0], q[1]])});
  else for (let k = 0; k < merged.length; k++) {
    const u0 = merged[k][1], u1 = k + 1 < merged.length ? merged[k + 1][0] : merged[0][0] + P;
    if (u1 - u0 < 0.1) continue;
    const mids = []; for (let m = -1; m <= 2; m++) for (let i = 0; i < n; i++) { const u = cum[i] + m * P; if (u > u0 + 1e-6 && u < u1 - 1e-6) mids.push([vt[i][0], vt[i][1], u]); }
    mids.sort((a, b) => a[2] - b[2]);
    runs.push({closed: false, pts: [at(u0), ...mids.map(q => [q[0], q[1]]), at(u1)]});
  }
  return {runs, h, t};
}
// band polygon around a run's centreline: half-width hw, open ends pushed out by ext
function bandPoly(run, hw, ext = 0) {
  const p = run.pts, n = p.length, cl = run.closed, segs = cl ? n : n - 1, dirs = [];
  for (let i = 0; i < segs; i++) { const a = p[i], b = p[(i + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; dirs.push([(b[0] - a[0]) / L, (b[1] - a[1]) / L]); }
  const off = i => {
    const d1 = cl ? dirs[(i - 1 + segs) % segs] : dirs[Math.max(0, i - 1)], d2 = cl ? dirs[i % segs] : dirs[Math.min(segs - 1, i)];
    const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]]; let m = [n1[0] + n2[0], n1[1] + n2[1]]; const ml = Math.hypot(m[0], m[1]) || 1; m = [m[0] / ml, m[1] / ml];
    const s = hw / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]); return [m[0] * s, m[1] * s];
  };
  const Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const q = p[i].slice();
    if (!cl && ext) { if (i === 0) { q[0] -= dirs[0][0] * ext; q[1] -= dirs[0][1] * ext; } if (i === n - 1) { q[0] += dirs[segs - 1][0] * ext; q[1] += dirs[segs - 1][1] * ext; } }
    const o = off(i); Lf.push([q[0] + o[0], q[1] + o[1]]); Rt.push([q[0] - o[0], q[1] - o[1]]);
  }
  return cl ? {outer: Lf, hole: Rt} : {outer: Lf.concat(Rt.reverse()), hole: null};
}
// distance from a point to a straight counter piece (flat ends, half-width hw)
function distBand(px, py, a, b, hw) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const qx = px - (a[0] + b[0]) / 2, qy = py - (a[1] + b[1]) / 2; const al = Math.abs(qx * ux + qy * uy) - L / 2, pe = Math.abs(-qx * uy + qy * ux) - hw;
  return Math.hypot(Math.max(al, 0), Math.max(pe, 0));
}
const RINGS = new Map();
const ringOf = it => { if (!RINGS.has(it)) RINGS.set(it, ringRuns(it)); return RINGS.get(it); };
function inRing(it, px, py, tol = 0) {
  const [lx, ly] = toLocal(it, px, py); if (Math.abs(lx) > it.w / 2 + tol || Math.abs(ly) > it.d / 2 + tol) return false;
  const rr = ringOf(it);
  for (const run of rr.runs) { const p = run.pts, n = p.length; for (let i = 0; i < (run.closed ? n : n - 1); i++) if (distBand(lx, ly, p[i], p[(i + 1) % n], rr.h) <= tol) return true; }
  return false;
}
function drawRing(ctx, v, it) {
  const rr = ringOf(it), tr = q => w2s(v, ...toWorld(it, q[0], q[1]));
  for (const run of rr.runs) {
    const b = bandPoly(run, rr.h); ctx.beginPath();
    for (const loop of [b.outer, b.hole]) { if (!loop) continue; loop.forEach((q, i) => { const s = tr(q); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); }
    ctx.fillStyle = shade("#8a4b1f", 0.05); ctx.fill("evenodd"); ctx.strokeStyle = "#4a2508"; ctx.lineWidth = 1; ctx.stroke();
  }
}
function drawLabel(ctx, v, it) {
  if (it.type === "floor" || it.type === "wall" || (it.type === "door" && v.s < 5)) return;
  const long = Math.max(it.w, it.d) * v.s, short = Math.min(it.w, it.d) * v.s;
  if (long < 28) return;
  let size = clamp(short * 0.55, 8, 13); if (it.type === "zone" || it.type === "ring") size = Math.max(size, 11);
  let name = it.name || (TYPES[it.type] || {}).label || it.type;
  const [sx, sy] = w2s(v, it.x, it.y);
  let ang = -rad(it.rot || 0); if (it.d > it.w) ang -= Math.PI / 2;
  while (ang > Math.PI / 2) ang -= Math.PI; while (ang < -Math.PI / 2) ang += Math.PI;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
  ctx.font = `${it.type === "zone" ? "italic 500" : "500"} ${size}px ${TOK.body}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const max = long - 6;
  if (ctx.measureText(name).width > max) { while (name.length > 3 && ctx.measureText(name + "…").width > max) name = name.slice(0, -1); name += "…"; }
  if (it.type === "door" || it.type === "opening" || it.type === "arch") {
    ctx.font = `600 ${Math.max(size, 10)}px ${TOK.body}`; ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(247,247,244,.9)";
    ctx.strokeText(name, 0, -(short / 2 + 9)); ctx.fillStyle = "#15633a"; ctx.fillText(name, 0, -(short / 2 + 9));
  }
  else {
    ctx.fillStyle = it.type === "zone" ? shade(it.color || "#8a5a34", -0.1) : PLAN_INK;
    if (it.type === "ring" || (it.type === "counter" && it.locked)) ctx.font = `700 ${size + 1}px ${TOK.display}`;
    ctx.fillText(name, 0, 0);
  }
  ctx.restore();
}
// "you are here": a dot with a wedge showing which way you are looking, plus where you are heading
function drawMe(ctx, v, mini) {
  const acc = TOK.accent || "#c8102e";
  ctx.save();
  if (ME.path.length) {
    ctx.setLineDash(mini ? [2, 3] : [3, 4]); ctx.lineWidth = mini ? 1.5 : 2; ctx.strokeStyle = acc;
    ctx.beginPath(); const p0 = w2s(v, ME.x, ME.y); ctx.moveTo(p0[0], p0[1]); for (const p of ME.path) { const q = w2s(v, p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke(); ctx.setLineDash([]);
  }
  if (ME.target && ME.path.length) {
    const [tx, ty] = w2s(v, ME.target[0], ME.target[1]);
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, mini ? 4 : 7, 0, Math.PI * 2); ctx.stroke();
  }
  const [x, y] = w2s(v, ME.x, ME.y), r = mini ? 4.5 : clamp(0.9 * v.s, 7, 11);
  const ang = Math.atan2(-Math.cos(ME.yaw), -Math.sin(ME.yaw)), half = CAM.halfH, len = mini ? 26 : clamp(14 * v.s, 44, 150);
  const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, len); g.addColorStop(0, hexA(acc, mini ? 0.65 : 0.5)); g.addColorStop(1, hexA(acc, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, ang - half, ang + half); ctx.closePath(); ctx.fill();
  ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  ctx.restore();
}

/* ================= Map view ================= */
const mapCv = $("#mapCanvas"), mctx = mapCv.getContext("2d");
const MV = {cx: BLD.L / 2, cy: BLD.W / 2, s: 6, W: 0, H: 0, dpr: 1, fitted: false};
const ZMIN = 1.5, ZMAX = 60;
function resizeMap() {
  const r = mapCv.getBoundingClientRect(); MV.dpr = Math.min(window.devicePixelRatio || 1, 2); MV.W = r.width; MV.H = r.height;
  const pw = Math.max(1, Math.round(r.width * MV.dpr)), ph = Math.max(1, Math.round(r.height * MV.dpr));
  if (mapCv.width !== pw || mapCv.height !== ph) { mapCv.width = pw; mapCv.height = ph; }
  if (MV.W && !MV.fitted) fitMap(); else drawMap();
}
function fitMap() {
  if (!MV.W) return; const pad = Math.min(MV.W, MV.H) < 500 ? 16 : 48, reserve = MV.H > 500 ? 60 : 0;
  MV.s = clamp(Math.min((MV.W - pad * 2) / (BLD.L + 8), (MV.H - pad * 2 - reserve) / (BLD.W + 8)), ZMIN, ZMAX); MV.cx = BLD.L / 2; MV.cy = BLD.W / 2 - 2; MV.fitted = true; drawMap();
}
function zoomAt(f, sx = MV.W / 2, sy = MV.H / 2) { const [wx, wy] = s2w(MV, sx, sy); MV.s = clamp(MV.s * f, ZMIN, ZMAX); const [nx, ny] = s2w(MV, sx, sy); MV.cx += wx - nx; MV.cy += wy - ny; drawMap(); }
let drawQueued = false;
function drawMap() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; paintMap(); }); }
function bubble(ctx, x, y, t) { ctx.save(); ctx.fillStyle = TOK.panel; ctx.strokeStyle = TOK["map-grid-major"]; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = TOK.muted; ctx.fillText(t, x, y + 1); ctx.restore(); }
function paintMap() {
  if (S.mode !== "map" || !MV.W) return;
  const ctx = mctx, v = MV; ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); ctx.clearRect(0, 0, v.W, v.H);
  ctx.fillStyle = TOK["map-bg"]; ctx.fillRect(0, 0, v.W, v.H);
  // 5 ft grid
  const [x0, y1] = s2w(v, 0, 0), [x1, y0] = s2w(v, v.W, v.H);
  ctx.lineWidth = 1; ctx.strokeStyle = TOK["map-grid"];
  if (v.s > 3) {
    ctx.beginPath();
    for (let x = Math.floor(x0 / 5) * 5; x <= x1; x += 5) { const sx = w2s(v, x, 0)[0]; ctx.moveTo(sx + 0.5, 0); ctx.lineTo(sx + 0.5, v.H); }
    for (let y = Math.floor(y0 / 5) * 5; y <= y1; y += 5) { const sy = w2s(v, 0, y)[1]; ctx.moveTo(0, sy + 0.5); ctx.lineTo(v.W, sy + 0.5); }
    ctx.stroke();
  }
  drawItems(ctx, v, false);
  // foundation grid lines A-H / 1-5
  ctx.strokeStyle = TOK["map-grid-major"]; ctx.setLineDash([6, 5]); ctx.beginPath();
  const GX = {A: 0, B: 25, C: 50, D: 75, E: 100, F: 123, G: 146, H: 169}, GY = {1: 0, 2: 20, 3: 40, 4: 60, 5: 80};
  for (const k in GX) { const [sx, sy0] = w2s(v, GX[k], -3), sy1 = w2s(v, GX[k], BLD.W + 3)[1]; ctx.moveTo(sx, sy0); ctx.lineTo(sx, sy1); }
  for (const k in GY) { const [sx0, sy] = w2s(v, -3, GY[k]), sx1 = w2s(v, BLD.L + 3, GY[k])[0]; ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.font = "600 13px " + TOK.display; ctx.fillStyle = TOK.muted; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const k in GX) { const [sx, sy] = w2s(v, GX[k], -5.5); bubble(ctx, sx, sy, k); }
  for (const k in GY) { const [sx, sy] = w2s(v, -5.5, GY[k]); bubble(ctx, sx, sy, k); }
  // selected fixture
  if (S.sel) { ctx.save(); pathItem(ctx, v, S.sel); ctx.lineWidth = 2.5; ctx.strokeStyle = TOK.accent; ctx.stroke(); ctx.restore(); }
  drawMe(ctx, v, false);
  // north arrow + scale bar on a small card in the bottom-right corner
  const ft = v.s * 20 > 180 ? 5 : v.s * 20 > 90 ? 10 : 20, len = ft * v.s, bw = len + 72, bh = 58;
  const bx0 = v.W - 16 - bw, by0 = v.H - 16 - bh;
  ctx.save(); ctx.globalAlpha = 0.88; ctx.fillStyle = TOK.panel; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx0, by0, bw, bh, 8); else ctx.rect(bx0, by0, bw, bh);
  ctx.fill(); ctx.restore();
  const nx = bx0 + 24, ny = by0 + 32;
  ctx.fillStyle = TOK["map-label"]; ctx.beginPath(); ctx.moveTo(nx, ny - 22); ctx.lineTo(nx + 8, ny); ctx.lineTo(nx, ny - 5); ctx.lineTo(nx - 8, ny); ctx.closePath(); ctx.fill();
  ctx.font = "700 14px " + TOK.display; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("N", nx, ny + 12);
  const bx = bx0 + 52, by = by0 + 36;
  ctx.fillRect(bx, by, len, 3); ctx.fillRect(bx, by - 4, 2, 11); ctx.fillRect(bx + len - 2, by - 4, 2, 11);
  ctx.font = "500 11px " + TOK.mono; ctx.fillText(ft + " ft", bx + len / 2, by - 12);
}

/* ---------- map interaction (view only: pan, zoom, pick a fixture) ---------- */
function hitItem(wx, wy) {
  for (let i = ITEMS.length - 1; i >= 0; i--) {
    const it = ITEMS[i]; if (it.type === "floor" || it.type === "zone" || it.type === "wall") continue;
    const tol = it.type === "door" || it.type === "opening" || it.type === "arch" ? 4 / MV.s : 0;
    if (inItem(it, wx, wy, tol)) return it;
  }
  return null;
}
const mapPtr = new Map(); let mdrag = null, lastTap = {t: 0, x: 0, y: 0};
const offsetOf = (el, e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
mapCv.addEventListener("pointerdown", e => {
  try { mapCv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
  const [sx, sy] = offsetOf(mapCv, e); mapPtr.set(e.pointerId, {x: sx, y: sy});
  if (mapPtr.size === 2) { const [a, b] = [...mapPtr.values()]; mdrag = {kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: MV.s, c: s2w(MV, (a.x + b.x) / 2, (a.y + b.y) / 2)}; return; }
  if (mapPtr.size > 2) return;
  mdrag = {kind: "pan", sx, sy, cx: MV.cx, cy: MV.cy, moved: false};
});
mapCv.addEventListener("pointermove", e => {
  const [sx, sy] = offsetOf(mapCv, e);
  if (mapPtr.has(e.pointerId)) mapPtr.set(e.pointerId, {x: sx, y: sy});
  if (!mdrag) { if (e.pointerType === "mouse") mapCv.classList.toggle("over-item", !!hitItem(...s2w(MV, sx, sy))); return; }
  if (mdrag.kind === "pinch") {
    if (mapPtr.size < 2) return; const [a, b] = [...mapPtr.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    MV.s = clamp(mdrag.s0 * d / mdrag.d0, ZMIN, ZMAX); const m = s2w(MV, (a.x + b.x) / 2, (a.y + b.y) / 2); MV.cx += mdrag.c[0] - m[0]; MV.cy += mdrag.c[1] - m[1]; drawMap(); return;
  }
  if (!mdrag.moved && Math.hypot(sx - mdrag.sx, sy - mdrag.sy) > 4) { mdrag.moved = true; mapCv.classList.add("dragging"); }
  if (mdrag.moved) { MV.cx = mdrag.cx - (sx - mdrag.sx) / MV.s; MV.cy = mdrag.cy + (sy - mdrag.sy) / MV.s; drawMap(); }
});
function endMapPointer(e) {
  mapPtr.delete(e.pointerId); mapCv.classList.remove("dragging");
  if (!mdrag) return;
  if (mdrag.kind === "pinch") { if (mapPtr.size === 0) mdrag = null; return; }
  const d = mdrag; mdrag = null;
  if (d.moved || e.type === "pointercancel") return;
  const [sx, sy] = offsetOf(mapCv, e), [wx, wy] = s2w(MV, sx, sy);
  if (e.pointerType !== "mouse") { // touch / pen: double-tap = go there
    const now = performance.now();
    if (now - lastTap.t < 320 && Math.hypot(sx - lastTap.x, sy - lastTap.y) < 24) { lastTap.t = 0; mapGo(wx, wy); return; }
    lastTap = {t: now, x: sx, y: sy};
  }
  selectItem(hitItem(wx, wy));
}
mapCv.addEventListener("pointerup", endMapPointer);
mapCv.addEventListener("pointercancel", endMapPointer);
mapCv.addEventListener("dblclick", e => { const [sx, sy] = offsetOf(mapCv, e); mapGo(...s2w(MV, sx, sy)); });
// touches are handled as pointer events above; stop the browser's follow-up mouse clicks / dblclick,
// which would otherwise land on the Walk view after a double-tap switches to it
mapCv.addEventListener("touchend", e => e.preventDefault(), {passive: false});
mapCv.addEventListener("wheel", e => { e.preventDefault(); const [sx, sy] = offsetOf(mapCv, e); zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), sx, sy); }, {passive: false});
$("#zIn").addEventListener("click", () => zoomAt(1.25));
$("#zOut").addEventListener("click", () => zoomAt(1 / 1.25));
$("#zFit").addEventListener("click", fitMap);
$("#labelsBtn").addEventListener("click", () => { S.labels = !S.labels; $("#labelsBtn").setAttribute("aria-pressed", String(S.labels)); drawMap(); });

/* ---------- fixture details card ---------- */
const info = $("#info");
function selectItem(it, focusCard) {
  const hadFocus = info.contains(document.activeElement);
  S.sel = it || null;
  if (it) {
    $("#infoKind").textContent = categoryOf(it);
    $("#infoName").textContent = displayName(it);
    $("#infoSize").textContent = `${ftin(it.w)} × ${ftin(it.d)}` + (it.h >= 1 ? ` · ${ftin(it.h)} tall` : "");
    info.hidden = false;
    if (focusCard) $("#infoGo").focus();
  } else {
    info.hidden = true;
    if (hadFocus) mapCv.focus(); // don't drop keyboard focus on the page body
  }
  drawMap();
}
// keyboard: N / Shift+N steps through the fixtures in name order (and brings each into view)
const PICKABLE = ITEMS.filter(it => it.type !== "floor" && it.type !== "zone" && it.type !== "wall").sort((a, b) => displayName(a).localeCompare(displayName(b)));
function stepSelection(dir) {
  const n = PICKABLE.length, i = PICKABLE.indexOf(S.sel), it = PICKABLE[i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n];
  const [sx, sy] = w2s(MV, it.x, it.y);
  if (sx < 60 || sx > MV.W - 60 || sy < 60 || sy > MV.H - 60) { MV.cx = it.x; MV.cy = it.y; }
  selectItem(it, true);
}
$("#infoClose").addEventListener("click", () => selectItem(null));
$("#infoGo").addEventListener("click", () => { if (S.sel) goLook(S.sel); });

// Where to stand to look at a fixture: a spot you can walk to with no wall in between, in front of it if
// possible, else beside or behind it, 2.2, 3.5 or 5 ft away. If none of those work: any reachable spot with
// a clear view (about 3.5 ft away if possible), then any reachable spot near it.
function lookSpot(it) {
  const reach = reachable(), cands = [];
  for (const off of [2.2, 3.5, 5]) for (const [ux, uy, pen] of [[0, 1, 0], [1, 0, 3], [-1, 0, 3], [0, -1, 6]]) {
    const n = Math.floor((ux ? it.d : it.w) / 2 / 1.5);
    for (let k = -n; k <= n; k++) {
      const t = k * 1.5, p = ux ? toWorld(it, ux * (it.w / 2 + off), t) : toWorld(it, t, uy * (it.d / 2 + off));
      cands.push({p, score: pen + off + Math.abs(t) * 0.15});
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const ok = p => { const i = Math.floor((p[0] - G.x0) / G.cell), j = Math.floor((p[1] - G.y0) / G.cell); return free(i, j) && reach[j * G.nx + i] === 1; };
  const best = cands.find(c => ok(c.p) && sees(it, c.p[0], c.p[1]));
  if (best) return best.p;
  let bv = Infinity, pv = null, bd = Infinity, pd = null;
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    if (!reach[j * G.nx + i]) continue;
    const [x, y] = cellC(i, j), [lx, ly] = toLocal(it, x, y), d = Math.hypot(Math.max(0, Math.abs(lx) - it.w / 2), Math.max(0, Math.abs(ly) - it.d / 2));
    if (d < bd) { bd = d; pd = [x, y]; }
    if (d < 25 && Math.abs(d - 3.5) < bv && sees(it, x, y)) { bv = Math.abs(d - 3.5); pv = [x, y]; }
  }
  const any = cands.find(c => ok(c.p));
  return pv || (any && any.p) || pd;
}
// no wall between (x, y) and the nearest edge of the fixture?
function sees(it, x, y) {
  const [lx, ly] = toLocal(it, x, y), q = toWorld(it, clamp(lx, -it.w / 2, it.w / 2), clamp(ly, -it.d / 2, it.d / 2));
  const L = Math.hypot(q[0] - x, q[1] - y), n = Math.ceil(L / 0.25);
  for (let k = 0; k < n && k * L / n < L - 0.15; k++) { const px = x + (q[0] - x) * k / n, py = y + (q[1] - y) * k / n; if (WALLS.some(w => inItem(w, px, py))) return false; }
  return true;
}
function goLook(it) {
  const p = lookSpot(it);
  if (!p) { toast("There's no clear path to that spot."); return; }
  if (walkTo(p[0], p[1], {face: [it.x, it.y]}) && S.has3D) setMode("walk");
}
function mapGo(wx, wy) {
  const it = hitItem(wx, wy);
  if (it && (TYPES[it.type] || {}).blocks) { goLook(it); return; }
  if (walkTo(wx, wy) && S.has3D) setMode("walk");
}

/* ================= walkable grid + A* ================= */
const G = {cell: 0.5, x0: -6, y0: -6, nx: 0, ny: 0, blk: null};
function buildGrid() {
  G.nx = Math.ceil((BLD.L + 12) / G.cell); G.ny = Math.ceil((BLD.W + 12) / G.cell); G.blk = new Uint8Array(G.nx * G.ny);
  for (const it of ITEMS) {
    if (!(TYPES[it.type] || {}).blocks) continue;
    const cs = corners(it); const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - BODY_R - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.ceil((Math.max(...xs) + BODY_R - G.x0) / G.cell));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - BODY_R - G.y0) / G.cell)), j1 = Math.min(G.ny - 1, Math.ceil((Math.max(...ys) + BODY_R - G.y0) / G.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = G.x0 + (i + 0.5) * G.cell, py = G.y0 + (j + 0.5) * G.cell;
      if (it.type === "ring" ? inRing(it, px, py, BODY_R) : inItem(it, px, py, BODY_R)) G.blk[j * G.nx + i] = 1;
    }
  }
  // stay inside the building: block cells that are off the floor plan or within BODY_R of its outer edge
  // (this also closes the outside doors)
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    const k = j * G.nx + i; if (G.blk[k]) continue;
    const [px, py] = cellC(i, j);
    if (!isFloorAt(px, py) || !isFloorAt(px + BODY_R, py) || !isFloorAt(px - BODY_R, py) || !isFloorAt(px, py + BODY_R) || !isFloorAt(px, py - BODY_R)) G.blk[k] = 1;
  }
}
const cellOf = (x, y) => [clamp(Math.floor((x - G.x0) / G.cell), 0, G.nx - 1), clamp(Math.floor((y - G.y0) / G.cell), 0, G.ny - 1)];
const cellC = (i, j) => [G.x0 + (i + 0.5) * G.cell, G.y0 + (j + 0.5) * G.cell];
const free = (i, j) => i >= 0 && j >= 0 && i < G.nx && j < G.ny && !G.blk[j * G.nx + i];
function blockedAt(x, y) { return !free(Math.floor((x - G.x0) / G.cell), Math.floor((y - G.y0) / G.cell)); } // off the grid counts as blocked
function nearestFree(i, j) {
  if (free(i, j)) return [i, j];
  for (let r = 1; r < 60; r++) {
    let best = null, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (free(i + di, j + dj)) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i + di, j + dj]; } }
    }
    if (best) return best;
  }
  return null;
}
function astar(a, b) {
  const N = G.nx * G.ny, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [];
  const push = (f, n) => { heap.push([f, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const s = a[1] * G.nx + a[0], t = b[1] * G.nx + b[0], hx = b[0], hy = b[1];
  const H = (i, j) => { const dx = Math.abs(i - hx), dy = Math.abs(j - hy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  g[s] = 0; push(H(a[0], a[1]), s);
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let iter = 0;
  while (heap.length && iter++ < 200000) {
    const n = pop()[1]; if (n === t) break; if (closed[n]) continue; closed[n] = 1; const i = n % G.nx, j = (n / G.nx) | 0;
    for (const [di, dj, c] of nb) {
      const ni = i + di, nj = j + dj; if (!free(ni, nj)) continue; if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
      const m = nj * G.nx + ni; const ng = g[n] + c; if (ng < g[m]) { g[m] = ng; from[m] = n; push(ng + H(ni, nj), m); }
    }
  }
  if (from[t] < 0 && s !== t) return null;
  const out = []; for (let n = t; n !== -1; n = from[n]) { out.push([n % G.nx, (n / G.nx) | 0]); if (n === s) break; } return out.reverse();
}
// every cell you can walk to from where you stand (flood fill over the walkable grid)
function reachable() {
  const N = G.nx * G.ny, seen = new Uint8Array(N), here = cellOf(ME.x, ME.y), st = nearestFree(here[0], here[1]);
  if (!st) return seen;
  const q = new Int32Array(N); let h = 0, t = 0; q[t++] = st[1] * G.nx + st[0]; seen[q[0]] = 1;
  while (h < t) {
    const n = q[h++], i = n % G.nx, j = (n / G.nx) | 0;
    for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { const m = nj * G.nx + ni; if (free(ni, nj) && !seen[m]) { seen[m] = 1; q[t++] = m; } }
  }
  return seen;
}
function los(a, b) { const [x0, y0] = a, [x1, y1] = b; const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (G.cell * 0.5))); for (let k = 0; k <= steps; k++) { const x = x0 + (x1 - x0) * k / steps, y = y0 + (y1 - y0) * k / steps; const [i, j] = cellOf(x, y); if (!free(i, j)) return false; } return true; }
// plan a walk to (x, y); opts.face = [x, y] to turn toward on arrival
function walkTo(x, y, opts) {
  if (!isFloorAt(x, y, 1)) { toast("That spot is outside the store."); return false; } // 1 ft of slack for taps on an outer wall
  const here = cellOf(ME.x, ME.y), st = nearestFree(here[0], here[1]), en = nearestFree(...cellOf(x, y));
  if (!st || !en) { toast("You can't get to that spot."); return false; }
  if (st[0] !== here[0] || st[1] !== here[1]) [ME.x, ME.y] = cellC(st[0], st[1]);
  const cells = astar(st, en); if (!cells) { toast("There's no clear path to that spot."); return false; }
  const pts = cells.map(c => cellC(c[0], c[1])), goal = pts[pts.length - 1];
  const sm = []; let cur = [ME.x, ME.y], k = 0;
  while (k < pts.length - 1) { let far = k + 1; for (let m = pts.length - 1; m > k + 1; m--) { if (los(cur, pts[m])) { far = m; break; } } sm.push(pts[far]); cur = pts[far]; k = far; }
  ME.path = sm.length ? sm : [goal]; ME.target = goal; ME.face = (opts && opts.face) || null; ME.heading = ME.yaw;
  setSpin(false);
  if (reducedMotion.matches) jumpToEnd(); // no gliding camera when the system asks for less motion
  markMoved();
  return true;
}
// reduced motion: go straight to the end of the path and face the right way at once
function jumpToEnd() {
  const last = ME.path[ME.path.length - 1], prev = ME.path.length > 1 ? ME.path[ME.path.length - 2] : [ME.x, ME.y];
  if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > 1e-3) ME.yaw = Math.atan2(-(last[0] - prev[0]), last[1] - prev[1]);
  ME.x = last[0]; ME.y = last[1]; ME.path = []; ME.target = null;
  if (ME.face) { ME.yaw = Math.atan2(-(ME.face[0] - ME.x), ME.face[1] - ME.y); ME.look = -0.08; ME.face = null; }
  ME.heading = ME.yaw; arrived();
}

/* ================= 3D store ================= */
let R = null; // renderer bundle
const matCache = new Map();
const lin = c => new THREE.Color(c).convertSRGBToLinear();
function mat(c, o = {}) {
  const key = c + JSON.stringify(o);
  if (!matCache.has(key)) {
    const p = Object.assign({roughness: 0.78, metalness: 0}, o);
    if (p.emissive && p.emissive.isColor) p.emissive = p.emissive.clone().convertSRGBToLinear();
    if (p.transparent) { p.roughness = o.roughness ?? 0.08; p.depthWrite = false; }
    matCache.set(key, new THREE.MeshStandardMaterial(Object.assign({color: lin(c)}, p)));
  }
  return matCache.get(key);
}
// subtle polished-concrete texture with saw-cut joints (one tile = 12 ft)
let FLOOR_TEX = null;
function floorTex() {
  if (FLOOR_TEX) return FLOOR_TEX;
  const n = 512, cv = document.createElement("canvas"); cv.width = cv.height = n; const c = cv.getContext("2d");
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, n, n); const r = rng(7);
  for (let k = 0; k < 2600; k++) { const x = r() * n, y = r() * n, rd = 2 + r() * 26, a = r() * 0.05; c.fillStyle = `rgba(${r() < 0.5 ? "70,60,50" : "255,255,255"},${a})`; c.beginPath(); c.arc(x, y, rd, 0, Math.PI * 2); c.fill(); }
  for (let k = 0; k < 9000; k++) { c.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; c.fillRect(r() * n, r() * n, 1, 1); }
  c.fillStyle = "rgba(40,36,32,.28)"; c.fillRect(0, 0, n, 2); c.fillRect(0, 0, 2, n);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; FLOOR_TEX = t; return t;
}
function floorMat(col, w, d) {
  const key = "floor" + col + w.toFixed(1) + d.toFixed(1);
  if (!matCache.has(key)) { const t = floorTex().clone(); t.needsUpdate = true; t.repeat.set(w / 12, d / 12); matCache.set(key, new THREE.MeshStandardMaterial({color: lin(col), map: t, roughness: 0.42, metalness: 0, envMapIntensity: 0.9})); }
  return matCache.get(key);
}
function box(parent, w, h, d, x, y, z, color, o) { const m = new THREE.Mesh(R.boxG, typeof color === "string" ? mat(color, o) : color); m.scale.set(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)); m.position.set(x, y, z); parent.add(m); return m; }
// plan-local (u along length, v toward front, z up) -> three local: (u, z, -v)
function pbox(parent, u0, u1, v0, v1, z0, z1, color, o) { return box(parent, Math.abs(u1 - u0), Math.abs(z1 - z0), Math.abs(v1 - v0), (u0 + u1) / 2, (z0 + z1) / 2, -(v0 + v1) / 2, color, o); }
// unit box whose vertices carry a corner + direction, so the shader can round its edges
function roundedUnit(ws, hs) {
  const sp = new THREE.SphereGeometry(1, ws, hs), A = sp.attributes.position, n = A.count;
  const c = new Float32Array(n * 3), d = new Float32Array(n * 3), p = new Float32Array(n * 3), sg = v => Math.abs(v) < 1e-5 ? 0 : Math.sign(v);
  for (let i = 0; i < n; i++) { const x = A.getX(i), y = A.getY(i), z = A.getZ(i), cx = sg(x), cy = sg(y), cz = sg(z); c.set([cx, cy, cz], i * 3); d.set([x, y, z], i * 3); p.set([cx * 0.5, cy * 0.5, cz * 0.5], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("normal", new THREE.BufferAttribute(d, 3));
  g.setAttribute("corner", new THREE.BufferAttribute(c, 3)); g.setAttribute("rdir", new THREE.BufferAttribute(d, 3)); g.setIndex(sp.index); g.computeBoundingSphere();
  sp.dispose(); return g;
}
function roundify(m, rd, frac = 0.22) {
  if (m.userData.rounded) return m; m.userData.rounded = true; m.flatShading = true; m.needsUpdate = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uRound = {value: rd}; sh.uniforms.uFrac = {value: frac};
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n#ifdef USE_INSTANCING\nattribute vec3 corner; attribute vec3 rdir; uniform float uRound; uniform float uFrac;\n#endif")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n#ifdef USE_INSTANCING\nobjectNormal = rdir;\n#endif")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_INSTANCING\n{ vec3 sc=max(vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz)),vec3(1e-4)); float r=min(uRound,uFrac*min(sc.x,min(sc.y,sc.z))); transformed=corner*(0.5-r/sc)+rdir*(r/sc); }\n#endif");
  };
  m.customProgramCacheKey = () => "round" + rd + "_" + frac; return m;
}
/* ---------- photo textures from the store (tex/*.jpg) ---------- */
const TEXL = {};
function loadTex(file, setup) {
  const t = new THREE.TextureLoader().load("tex/" + file, () => { if (R) R.dirty = true; });
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; if (setup) setup(t); return t;
}
function photoTex(file) { if (!TEXL[file]) TEXL[file] = loadTex(file); return TEXL[file]; }
function photoMat(file, key, setup) {
  const k = "photo:" + file + (key || "");
  if (!matCache.has(k)) { const t = setup ? loadTex(file, setup) : photoTex(file); matCache.set(k, new THREE.MeshStandardMaterial({map: t, emissiveMap: t, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.32, roughness: 0.72, metalness: 0})); }
  return matCache.get(k);
}
// flat photo quad in plan-local coords: spans u0..u1 and z0..z1 at depth v; face=+1 looks toward +v, -1 toward -v; fx/fy crop the image
function photoPlane(g, file, u0, u1, z0, z1, v, face, fx = [0, 1], fy = [0, 1]) {
  const geo = new THREE.PlaneGeometry(Math.abs(u1 - u0), z1 - z0); const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, fx[0] + uv.getX(i) * (fx[1] - fx[0]), fy[0] + uv.getY(i) * (fy[1] - fy[0]));
  const m = new THREE.Mesh(geo, photoMat(file)); m.position.set((u0 + u1) / 2, (z0 + z1) / 2, -v); m.rotation.y = face > 0 ? Math.PI : 0; m.receiveShadow = true; g.add(m); return m;
}
let CEIL_TEX = null;
function ceilTex() {
  if (CEIL_TEX) return CEIL_TEX;
  const c = document.createElement("canvas"); c.width = 128; c.height = 256; const x = c.getContext("2d");
  x.fillStyle = "#efeee9"; x.fillRect(0, 0, 128, 256); const r = rng(3); for (let k = 0; k < 2500; k++) { x.fillStyle = `rgba(90,85,80,${0.05 + r() * 0.08})`; x.fillRect(r() * 128, r() * 256, 1, 1); }
  x.fillStyle = "#d6d5cf"; x.fillRect(0, 0, 128, 3); x.fillRect(0, 0, 3, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; CEIL_TEX = t; return t;
}
// product boxes: rounded edges + a real packaging patch (cut from the store photos) on the front and back faces
function prodMat() {
  const m = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.55, metalness: 0, flatShading: true}); const atlas = photoTex("prod_atlas.jpg");
  m.onBeforeCompile = sh => {
    sh.uniforms.uRound = {value: 0.03}; sh.uniforms.uFrac = {value: 0.12}; sh.uniforms.uAtlas = {value: atlas};
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 corner; attribute vec3 rdir; attribute float aCell; uniform float uRound; uniform float uFrac; varying vec2 vPUv; varying float vPFront;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = rdir;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n{ vec3 sc=max(vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz)),vec3(1e-4)); float r=min(uRound,uFrac*min(sc.x,min(sc.y,sc.z))); transformed=corner*(0.5-r/sc)+rdir*(r/sc);\n  vec2 q=clamp(transformed.xy+0.5,0.0,1.0); float cx=mod(aCell,16.0), cy=floor(aCell/16.0); vPUv=(vec2(cx,15.0-cy)+0.04+q*0.92)/16.0; vPFront=step(max(abs(rdir.x),abs(rdir.y)),abs(rdir.z)); }");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uAtlas; varying vec2 vPUv; varying float vPFront;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nif(vPFront>0.5){ diffuseColor.rgb = sRGBToLinear(texture2D(uAtlas,vPUv)).rgb*1.05; }");
  };
  m.customProgramCacheKey = () => "prodAtlas"; return m;
}

function webglAvailable() {
  if (typeof THREE === "undefined" || !window.WebGLRenderingContext) return false;
  try {
    const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    return true;
  } catch (e) { return false; }
}
function init3D() {
  const host = $("#three");
  const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: "high-performance"});
  const touch = matchMedia("(pointer:coarse)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.6 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the store and the light never move: draw the shadows once
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = lin("#d9dee0"); scene.fog = new THREE.Fog(lin("#d9dee0"), 90, 320);
  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.2, 900);
  // store lighting: soft sky fill + an overhead key light that throws gentle shadows under fixtures
  scene.add(new THREE.HemisphereLight(lin("#fbfbf8"), lin("#8c8274"), 0.55));
  const key = new THREE.DirectionalLight(lin("#fff6ea"), 1.15); key.position.set(BLD.L / 2 - 22, 110, -BLD.W / 2 + 18); key.target.position.set(BLD.L / 2, 0, -BLD.W / 2); scene.add(key); scene.add(key.target);
  key.castShadow = true; const sc = key.shadow.camera; sc.left = -100; sc.right = 100; sc.top = 56; sc.bottom = -56; sc.near = 20; sc.far = 240;
  key.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04; key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(lin("#e8eef5"), 0.3); fill.position.set(BLD.L / 2 + 70, 50, -BLD.W / 2 - 80); scene.add(fill);
  // image-based light: a bright, evenly lit room so every surface gets soft reflections
  try {
    const pm = new THREE.PMREMGenerator(renderer); const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(60, 20, 60), new THREE.MeshBasicMaterial({color: lin("#8f8a84"), side: THREE.BackSide})));
    const lampE = new THREE.MeshBasicMaterial({color: new THREE.Color(3.2, 3.1, 2.9)});
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 2.4), lampE); m.position.set(i * 11, 9.7, j * 14); env.add(m); }
    const floorE = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 60), new THREE.MeshBasicMaterial({color: lin("#b9b2a8")})); floorE.position.y = -9.8; env.add(floorE);
    scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose();
    env.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  } catch (e) { /* plain lighting still works */ }
  R = {renderer, scene, camera, host, boxG: new THREE.BoxGeometry(1, 1, 1), rboxG: roundedUnit(12, 6), rboxS: roundedUnit(8, 4), cylG: new THREE.CylinderGeometry(0.5, 0.5, 1, 16), store: null, ceil: null, marker: null, dirty: true};
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat("#8e918d")); ground.rotation.x = -Math.PI / 2; ground.position.set(84, -0.05, -40); scene.add(ground);
  // destination marker on the floor
  const mk = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 40), new THREE.MeshBasicMaterial({color: lin(TOK.accent || "#c8102e"), transparent: true, opacity: 0.9, side: THREE.DoubleSide}));
  mk.rotation.x = -Math.PI / 2; mk.visible = false; scene.add(mk); R.marker = mk;
  buildStore();
  renderer.shadowMap.needsUpdate = true;
  bindWalkInput(host);
}
function resize3D() {
  if (!R) return; const r = R.host.getBoundingClientRect(); if (!r.width || !r.height) return;
  R.renderer.setSize(r.width, r.height, false); R.camera.aspect = r.width / r.height; applyFov();
}
// The zoom value is the vertical field of view; on a tall (portrait) screen it is the horizontal one, so phones
// still see a wide view. On portrait the widest zoom is capped where the vertical view reaches 90 degrees.
function fovMax() { const a = R ? R.camera.aspect : 1.6; return a < 1 ? clamp(deg(2 * Math.atan(a)), FOV_MIN, FOV_MAX) : FOV_MAX; }
function applyFov() {
  const a = R ? R.camera.aspect : 1.6;
  if (!CAM.zoomed) CAM.fov = a < 1 ? FOV_MIN + 0.7 * (fovMax() - FOV_MIN) : 62; // default: wide, with room to zoom out a little on phones
  CAM.fov = clamp(CAM.fov, FOV_MIN, fovMax());
  let vf = CAM.fov;
  if (a < 1) vf = Math.min(90, deg(2 * Math.atan(Math.tan(rad(CAM.fov) / 2) / a)));
  CAM.halfH = Math.atan(Math.tan(rad(vf) / 2) * a);
  if (R) { R.camera.fov = vf; R.camera.updateProjectionMatrix(); R.dirty = true; }
}

function buildStore() {
  const root = new THREE.Group(); const prods = []; const cans = [];
  const q = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0);
  for (const it of ITEMS) {
    const g = new THREE.Group(); g.position.set(it.x, 0, -it.y); g.rotation.y = rad(it.rot || 0); root.add(g);
    const rnd = rng(hashStr(it.id + (it.brand || "") + (it.brand2 || "") + it.w.toFixed(1)));
    const itemM = new THREE.Matrix4().compose(g.position, q.setFromAxisAngle(yAx, g.rotation.y), new THREE.Vector3(1, 1, 1));
    let lastBr = null;
    const P = (u, z, v, sx, sz, sv, color, can) => { const br = lastBr || (color === "#a07850" ? "cardboard" : "boxes"); lastBr = null; (can ? cans : prods).push({br, m: new THREE.Matrix4().multiplyMatrices(itemM, new THREE.Matrix4().compose(new THREE.Vector3(u, z, -v), new THREE.Quaternion(), new THREE.Vector3(sx, sz, sv))), c: color}); };
    const pick = b => { lastBr = b; const p = PAL[b] || PAL.boxes; return p[Math.floor(rnd() * p.length)]; };
    const w = it.w, d = it.d, h = it.h || 0, col = it.color || "#999999";
    switch (it.type) {
      case "floor": pbox(g, -w / 2, w / 2, -d / 2, d / 2, -0.04, 0.0, floorMat(shade(col, -0.12), w, d)); break;
      case "zone": {
        if (h > 0) { pbox(g, -w / 2, w / 2, -d / 2, d / 2, h - 0.5, h, col); const n = Math.floor(w / 1.4); for (let k = 0; k <= n; k++) { const u = -w / 2 + k * w / n; pbox(g, u - 0.06, u + 0.06, -d / 2 - 0.1, -d / 2, h, h + 3.2, col); } pbox(g, -w / 2, w / 2, -d / 2 - 0.2, -d / 2, h + 3.2, h + 3.45, "#3b2616"); }
        break;
      }
      case "wall":
        pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h || 14, col);
        if (/grid C/i.test(it.name || "") && w > 20) { const u0 = 30.9 - it.y, u1 = 42 - it.y; if (u0 > -w / 2 && u1 < w / 2) photoPlane(g, "tom_board.jpg", u0, u1, 2.55, 7.3, -d / 2 - 0.01, -1); }
        break;
      case "column": pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h || 12, col); pbox(g, -w / 2 - 0.06, w / 2 + 0.06, -d / 2 - 0.06, d / 2 + 0.06, 0, 0.45, "#8a5a34"); break;
      case "door": case "opening": {
        const fh = h || 8, jt = it.type === "door" ? 0.3 : 0.45, fc = col;
        pbox(g, -w / 2, -w / 2 + jt, -d / 2 - 0.1, d / 2 + 0.1, 0, fh, fc); pbox(g, w / 2 - jt, w / 2, -d / 2 - 0.1, d / 2 + 0.1, 0, fh, fc); pbox(g, -w / 2, w / 2, -d / 2 - 0.1, d / 2 + 0.1, fh - jt, fh, fc);
        pbox(g, -w / 2, w / 2, -d / 2, d / 2, fh, Math.max(fh, wallHeightNear(it)), "#ddd5c4");
        if (it.type === "door") {
          if (it.solid) { pbox(g, -w / 2 + jt, w / 2 - jt, -0.06, 0.06, 0, fh - jt, col); pbox(g, w / 2 - jt - 0.55, w / 2 - jt - 0.2, -0.3, 0.3, 3.3, 3.45, "#9aa0a4"); }
          else { pbox(g, -w / 2 + jt, w / 2 - jt, -0.04, 0.04, 0.35, fh - jt, "#bcd6de", {transparent: true, opacity: 0.28}); if (w > 4.5) pbox(g, -0.12, 0.12, -0.1, 0.1, 0, fh - jt, fc); pbox(g, -w / 2 + jt, w / 2 - jt, -0.1, 0.1, 0, 0.35, fc); pbox(g, -w / 2 + 0.5, w / 2 - 0.5, -0.3, 0.3, 3.3, 3.42, "#b8bdc0"); }
        }
        break;
      }
      case "arch": {
        const spring = Math.max(0.5, (h || 10.5) - w / 2), top = Math.max((h || 10.5) + 0.6, wallHeightNear(it)), r = w / 2, RR = r + 0.02;
        const sh = new THREE.Shape(); sh.moveTo(-RR, 0); sh.lineTo(-RR, top); sh.lineTo(RR, top); sh.lineTo(RR, 0); sh.lineTo(r, 0); sh.lineTo(r, spring); sh.absarc(0, spring, r, 0, Math.PI, false); sh.lineTo(-r, 0); sh.lineTo(-RR, 0);
        const geo = new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: false, curveSegments: 24}); const m = new THREE.Mesh(geo, mat("#e6dcc6")); m.position.z = -d / 2; g.add(m);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.12, 0.16, 6, 32, Math.PI), mat(col)); ring.position.y = spring; for (const s of [-1, 1]) { const rr = ring.clone(); rr.position.z = s * (d / 2 + 0.05); g.add(rr); }
        for (const s of [-1, 1]) for (const t of [-1, 1]) pbox(g, s * r - 0.14, s * r + 0.14, t * (d / 2 + 0.05) - 0.04, t * (d / 2 + 0.05) + 0.04, 0, spring, col);
        break;
      }
      case "gondola": {
        const hx = w / 2 - 1.3, bk = col;
        pbox(g, -hx, hx, -d / 2, d / 2, 0, 0.45, "#e9e9e6"); pbox(g, -hx, hx, -0.1, 0.1, 0.45, h, bk); pbox(g, -hx, hx, -0.15, 0.15, h, h + 0.35, bk);
        for (const e of [-1, 1]) {
          pbox(g, e * hx, e * (hx + 1.3), -d / 2, d / 2, 0, 0.45, "#e9e9e6"); pbox(g, e * hx, e * (hx + 0.1), -d / 2, d / 2, 0.45, h, bk); for (const z of [1.7, 2.9]) pbox(g, e * hx, e * (hx + 1.2), -d / 2, d / 2, z - 0.06, z, "#e9e9e6");
          for (const z of [0.45, 1.7, 2.9]) for (let v = -d / 2 + 0.15; v < d / 2 - 0.6; v += 0.8) { const bw = 0.9, bh = 0.3 + rnd() * 0.8; P(e * (hx + 0.65), z + bh / 2, v + 0.35, bw, bh, 0.65, pick(it.brand)); }
        }
        for (const [s, br] of [[1, it.brand], [-1, it.brand2 || it.brand]]) {
          for (const z of [1.7, 2.9]) pbox(g, -hx, hx, s * 0.12, s * d / 2 * 0.92, z - 0.06, z, "#e9e9e6");
          pbox(g, -hx, hx, s * d / 2, s * (d / 2 - 0.03), 0.15, 0.42, "#d5d9db");
          const levels = [0.45, 1.7, 2.9];
          for (let i = 0; i < 3; i++) {
            const z = levels[i], zt = i < 2 ? levels[i + 1] - 0.1 : 3.8; let u = -hx + 0.05;
            while (u < hx - 0.25) {
              const pw = 0.25 + rnd() * 0.6; if (u + pw > hx - 0.05) break; const ph = Math.min(zt - z - 0.05, 0.25 + rnd() * 0.75); const pd = 0.9 + rnd() * 0.8; const can = (br === "paint" && rnd() < 0.75) || rnd() < 0.1;
              if (can) P(u + pw / 2, z + ph / 2, s * (0.15 + pd / 2), pw, ph, Math.min(pw, pd), pick(br), true); else P(u + pw / 2, z + ph / 2, s * (0.15 + pd / 2), pw, ph, pd, pick(br));
              u += pw + 0.03 + rnd() * 0.06;
            }
          }
          for (const zr of (h > 5.8 ? [4.9, 5.9] : [4.9])) { let u = -hx + 0.1; while (u < hx - 0.3) { const pw = 0.22 + rnd() * 0.25, ph = 0.3 + rnd() * 0.3; P(u + pw / 2, zr - ph / 2, s * 0.22, pw, ph, 0.09, pick(br)); u += pw + 0.08 + rnd() * 0.12; } }
        }
        break;
      }
      case "wallunit": {
        if (it.brand === "decking") {
          const cz = 2.98, top = h;
          pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, cz, "#f2f1ec"); pbox(g, -w / 2, w / 2, -d / 2, d / 2 + 0.12, cz, cz + 0.14, "#6b6d70"); pbox(g, -w / 2, w / 2, -d / 2, -d / 2 + 0.05, cz + 0.14, top, "#f2f1ec");
          const fy = Math.min(1, (top - cz - 0.14) / 6.88); let u = w / 2, k = 0;
          while (u > -w / 2 + 0.05) { const tw = Math.min(8, u + w / 2), t = "AB"[k % 2], f = tw / 8;
            photoPlane(g, `decking_upper_${t}.jpg`, u - tw, u, cz + 0.14, top, -d / 2 + 0.06, 1, [0, f], [0, fy]);
            photoPlane(g, `decking_lower_${t}.jpg`, u - tw, u, 0, cz, d / 2 + 0.006, 1, [0, f]); u -= tw; k++; }
          break;
        }
        const band = it.brand === "milwaukee" && w >= 20 && h >= 7.5;
        if (band) for (let k = 0; k < 2; k++) photoPlane(g, "packout_band.jpg", -w / 2 + k * w / 2, -w / 2 + (k + 1) * w / 2, h - 2, h, -d / 2 + 0.21, 1);
        pbox(g, -w / 2, w / 2, -d / 2, -d / 2 + 0.2, 0, h, col); pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, 0.4, "#e9e9e6");
        const levels = it.brand === "mugs" ? [0.4, 1.4, 2.4, 3.4, 4.4, 5.4] : [0.4, 1.6, 2.8];
        for (let i = 0; i < levels.length; i++) {
          const z = levels[i]; if (i) pbox(g, -w / 2, w / 2, -d / 2 + 0.2, d / 2 * 0.95, z - 0.06, z, it.brand === "simpson" ? "#e8590d" : "#e9e9e6"); const zt = i + 1 < levels.length ? levels[i + 1] - 0.1 : z + 1.1; let u = -w / 2 + 0.05;
          while (u < w / 2 - 0.25) { const pw = 0.25 + rnd() * 0.55; if (u + pw > w / 2 - 0.05) break; const ph = Math.min(zt - z - 0.05, 0.25 + rnd() * 0.7); const pd = (d - 0.3) * (0.6 + rnd() * 0.35); P(u + pw / 2, z + ph / 2, -d / 2 + 0.2 + pd / 2, pw, ph, pd, pick(it.brand), it.brand === "mugs" || rnd() < 0.08); u += pw + 0.03 + rnd() * 0.06; }
        }
        if (it.brand !== "mugs") for (const zr of (h >= 7 && !band ? [4.6, 5.6, 6.6] : [4.6, 5.6])) { let u = -w / 2 + 0.1; while (u < w / 2 - 0.3) { const pw = 0.22 + rnd() * 0.25, ph = 0.3 + rnd() * 0.3; P(u + pw / 2, zr - ph / 2, -d / 2 + 0.3, pw, ph, 0.09, pick(it.brand)); u += pw + 0.08 + rnd() * 0.12; } }
        if (it.brand === "simpson") for (const z of [3.9, 4.8, 5.7, 6.5]) pbox(g, -w / 2, w / 2, -d / 2 + 0.2, -d / 2 + 1.1, z, z + 0.08, "#e8590d");
        break;
      }
      case "rack": {
        const bays = Math.max(1, Math.round(w / 9)), bw = w / bays;
        for (let i = 0; i <= bays; i++) { const u = -w / 2 + i * bw; for (const v of [-d / 2, d / 2 - 0.25]) pbox(g, u - 0.12, u + 0.12, v, v + 0.25, 0, h, col); }
        for (const z of [0.3, 4.5, 8.5, 12.5]) {
          for (const v of [-d / 2, d / 2 - 0.3]) pbox(g, -w / 2, w / 2, v, v + 0.3, z, z + 0.4, "#e8640d"); pbox(g, -w / 2, w / 2, -d / 2, d / 2, z + 0.4, z + 0.45, "#9aa0a4");
          for (let b = 0; b < bays; b++) { let u = -w / 2 + b * bw + 0.4; while (u < -w / 2 + (b + 1) * bw - 1) { const pw = 1.2 + rnd() * 1.8, ph = 0.8 + rnd() * 2.4; if (u + pw > -w / 2 + (b + 1) * bw - 0.3) break; const pd = d - 0.4 - rnd() * 0.6; P(u + pw / 2, z + 0.45 + ph / 2, -d / 2 + 0.25 + pd / 2, pw, ph, pd, rnd() < 0.6 ? "#a07850" : pick("boxes")); u += pw + 0.15; } }
        }
        break;
      }
      case "pallet": { pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, 0.45, "#b39a73"); let z = 0.45; while (z < h) { const hh = 0.6 + rnd() * 0.5; for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) P(-w / 2 + 0.1 + a * w / 3 + w / 6 - 0.05, z + hh / 2, -d / 2 + 0.1 + b * d / 2 + d / 4 - 0.05, w / 3 - 0.1, hh, d / 2 - 0.1, pick(it.brand || "boxes")); z += hh + 0.02; } break; }
      case "ring": {
        const RG = ringOf(it), hw = RG.h;
        const layer = (off, ext, z0, z1, c, o) => {
          for (const run of RG.runs) {
            const b = bandPoly(run, hw + off, ext); const sh = new THREE.Shape(b.outer.map(p => new THREE.Vector2(p[0], p[1])));
            if (b.hole) sh.holes.push(new THREE.Path(b.hole.map(p => new THREE.Vector2(p[0], p[1]))));
            const bv = Math.min(0.035, (z1 - z0) / 4); const geo = new THREE.ExtrudeGeometry(sh, {depth: Math.max(0.001, z1 - z0 - 2 * bv), bevelEnabled: true, bevelThickness: bv, bevelSize: bv * 0.8, bevelOffset: -bv * 0.8, bevelSegments: 3, curveSegments: 4}); geo.rotateX(-Math.PI / 2); geo.translate(0, z0 + bv, 0);
            g.add(new THREE.Mesh(geo, c && c.isMaterial ? c : mat(c, Object.assign({side: THREE.DoubleSide}, o || {}))));
          }
        };
        let body = col;
        if (it.led) { const D = h - 0.15 - 0.22, bv = Math.min(0.035, D / 4); body = photoMat("sdb_face.jpg", "ring" + D.toFixed(2), t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3.3, -1 / D); t.offset.set(0, (1 + bv) / D); }); body.side = THREE.DoubleSide; body.emissiveIntensity = 0.45; }
        layer(0, 0, 0, 0.22, "#e9e9e6"); layer(-0.06, -0.06, 0.22, h - 0.15, body); layer(0.15, 0.15, h - 0.15, h, it.top || "#1a1a1c");
        if (it.led) layer(0.01, 0.01, h - 0.3, h - 0.17, "#3a6bff", {emissive: new THREE.Color("#2248ff"), emissiveIntensity: 0.9});
        for (const [u, v] of [[-w * 0.2, -d / 2 + hw], [w * 0.15, -d / 2 + hw], [-w * 0.2, d / 2 - hw], [w * 0.2, d / 2 - hw]]) pbox(g, u - 0.8, u + 0.8, v - 0.05, v + 0.05, h, h + 1.2, "#141414");
        pbox(g, -w / 2 + RG.t, w / 2 - RG.t, -d / 2 + RG.t, d / 2 - RG.t, 0, 0.03, "#1b1b1b");
        break;
      }
      case "counter": pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h - 0.15, col); pbox(g, -w / 2 - 0.1, w / 2 + 0.1, -d / 2 - 0.1, d / 2 + 0.1, h - 0.15, h, it.top || "#1a1a1c"); break;
      case "table": pbox(g, -w / 2, w / 2, -d / 2, d / 2, h - 0.15, h, col); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(g, a * (w / 2 - 0.25) - 0.07, a * (w / 2 - 0.25) + 0.07, b * (d / 2 - 0.2) - 0.07, b * (d / 2 - 0.2) + 0.07, 0, h - 0.15, "#2b2b2b"); break;
      case "platform": pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h || 0.35, col); for (let k = 0; k < Math.max(1, Math.floor(w / 6)); k++) { const u = -w / 2 + 3 + k * 6; for (const [a, b] of [[-0.6, -0.4], [0.6, -0.4], [0, 0.7]]) pbox(g, u + a - 0.04, u + a + 0.04, b - 0.04, b + 0.04, h, 5, "#9aa0a4"); pbox(g, u - 0.45, u + 0.45, -0.35, 0.35, 5, 5.6, "#b3121f"); } break;
      case "stairs": { const n = Math.max(4, Math.round((h || 10) / 0.62)); for (let k = 0; k < n; k++) { const u0 = -w / 2 + k * w / n; pbox(g, u0, u0 + w / n + 0.02, -d / 2, d / 2, 0, (k + 1) * (h || 10) / n, col); } pbox(g, -w / 2, w / 2, -d / 2 - 0.1, -d / 2, 0, (h || 10) + 3, "#6d7275"); break; }
      case "tower": { pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h, col); for (let k = 0; k < 7; k++) for (const s of [-1, 1]) P(s * (w / 2 + 0.3), 1.2 + k * 0.82 + 0.22, 0, 0.62, 0.44, 0.62, ["#f2d21a", "#f2f2f2", "#1f5fd1", "#e8431a", "#239a3a", "#ee7aa8"][Math.floor(rnd() * 6)], true); break; }
      case "display": default: buildDisplay(g, it, rnd, P, pick); break;
    }
  }
  // batch every plain box by material (hundreds of draw calls -> a few dozen)
  root.updateMatrixWorld(true); const buckets = new Map(), loose = [];
  root.traverse(o => { if (o.isMesh && !o.isInstancedMesh) loose.push(o); });
  for (const o of loose) {
    if (o.geometry === R.boxG && !o.material.transparent && !o.material.map) { if (!buckets.has(o.material)) buckets.set(o.material, []); buckets.get(o.material).push(o.matrixWorld.clone()); o.parent.remove(o); }
    else { o.castShadow = !o.material.transparent && !o.material.map; o.receiveShadow = true; }
  }
  // small pieces get softly rounded edges; long ones (walls, shelf backs) stay plain boxes: at that size the
  // rounding can't be seen, and their long sliver triangles let specks of what's behind show through
  const sc = new THREE.Vector3(), addInst = (geo, m, list) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; root.add(im); };
  for (const [m, list] of buckets) {
    const big = [], small = []; for (const mx of list) (Math.max(...sc.setFromMatrixScale(mx).toArray()) > 10 ? big : small).push(mx);
    addInst(R.boxG, m.clone(), big); // cloned before roundify() changes the shader
    addInst(R.rboxG, small.length ? roundify(m, 0.07) : m, small);
  }
  // instanced products (packaging reads slightly glossy)
  for (const [list, geo] of [[prods, R.boxG], [cans, R.cylG]]) {
    if (!list.length) continue;
    const isBox = geo === R.boxG; let ig = geo, pm;
    if (isBox) {
      ig = R.rboxS.clone(); const cellA = new Float32Array(list.length);
      list.forEach((p, i) => { const cs = ATLAS.cells[p.br] || ATLAS.cells.boxes, e = p.m.elements; const hsh = Math.abs(Math.sin(e[12] * 12.9898 + e[13] * 4.1414 + e[14] * 78.233) * 43758.5453) % 1; const k = cs[Math.floor(hsh * cs.length)]; cellA[i] = k; p.c = ATLAS.avg[k]; });
      ig.setAttribute("aCell", new THREE.InstancedBufferAttribute(cellA, 1)); pm = prodMat();
    } else pm = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.4, metalness: 0.25});
    const im = new THREE.InstancedMesh(ig, pm, list.length); const c = new THREE.Color();
    list.forEach((p, i) => { im.setMatrixAt(i, p.m); c.set(p.c).convertSRGBToLinear(); im.setColorAt(i, c); }); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; root.add(im);
  }
  R.store = root; R.scene.add(root);
  // ceiling with light panels
  const cg = new THREE.Group();
  const lampM = new THREE.MeshBasicMaterial({color: new THREE.Color(1.6, 1.58, 1.5)});
  for (const it of ITEMS) {
    if (it.type !== "floor" || !it.ceil) continue; const g = new THREE.Group(); g.position.set(it.x, 0, -it.y); g.rotation.y = rad(it.rot || 0); cg.add(g);
    pbox(g, -it.w / 2, it.w / 2, -it.d / 2, it.d / 2, it.ceil, it.ceil + 0.2, it.ceil > 18 ? "#b9bcbc" : "#ecebe6");
    if (it.ceil < 18) { const t = ceilTex().clone(); t.needsUpdate = true; t.repeat.set(it.w / 2, it.d / 4); const cm = new THREE.Mesh(new THREE.PlaneGeometry(it.w, it.d), new THREE.MeshStandardMaterial({color: 0xffffff, map: t, roughness: 0.9})); cm.rotation.x = Math.PI / 2; cm.position.y = it.ceil - 0.01; g.add(cm); }
    for (let u = -it.w / 2 + 4; u < it.w / 2 - 2; u += 9) for (let v = -it.d / 2 + 4; v < it.d / 2 - 2; v += 8) { const m = new THREE.Mesh(R.boxG, lampM); m.scale.set(4, 0.05, 2); m.position.set(u, it.ceil - 0.03, -v); g.add(m); }
  }
  closeCeilingGaps(cg);
  cg.visible = S.ceiling; R.ceil = cg; R.scene.add(cg);
}
// Where two areas with different ceiling heights meet, drop a bulkhead from the higher ceiling to the lower one,
// carry tall ceilings' outer walls up to the ceiling, and put a roof over everything, so no sky shows through.
function closeCeilingGaps(cg) {
  const edges = f => ({x0: f.x - f.w / 2, x1: f.x + f.w / 2, y0: f.y - f.d / 2, y1: f.y + f.d / 2});
  const near = (a, b) => Math.abs(a - b) < 0.05;
  const flat = FLOORS.filter(f => f.ceil && !f.rot);
  for (const a of flat) {
    const A = edges(a), col = a.ceil > 18 ? "#b9bcbc" : "#ecebe6";
    for (const b of flat) {
      if (a.ceil <= b.ceil) continue; // a has the higher ceiling
      const B = edges(b), lo = b.ceil, hi = a.ceil;
      if (near(A.x1, B.x0) || near(A.x0, B.x1)) { const ex = near(A.x1, B.x0) ? A.x1 : A.x0, y0 = Math.max(A.y0, B.y0), y1 = Math.min(A.y1, B.y1); if (y1 - y0 > 0.1) box(cg, 0.3, hi - lo, y1 - y0, ex, (lo + hi) / 2, -(y0 + y1) / 2, col); }
      if (near(A.y1, B.y0) || near(A.y0, B.y1)) { const ey = near(A.y1, B.y0) ? A.y1 : A.y0, x0 = Math.max(A.x0, B.x0), x1 = Math.min(A.x1, B.x1); if (x1 - x0 > 0.1) box(cg, x1 - x0, hi - lo, 0.3, (x0 + x1) / 2, (lo + hi) / 2, -ey, col); }
    }
    if (a.ceil > 16) { // outer walls are about 16-20 ft tall: carry them up to a taller ceiling
      // (set 0.02 ft behind the wall's inner face so the two never overlap)
      for (const [ex, ey, w, d] of [[A.x0, a.y, 0.6, a.d], [A.x1, a.y, 0.6, a.d], [a.x, A.y0, a.w, 0.6], [a.x, A.y1, a.w, 0.6]]) {
        const ox = ex === A.x0 ? -0.32 : ex === A.x1 ? 0.32 : 0, oy = ey === A.y0 ? -0.32 : ey === A.y1 ? 0.32 : 0;
        if (!isFloorAt(ex + ox * 2, ey + oy * 2)) box(cg, w, a.ceil - 15.9, d, ex + ox, (a.ceil + 15.9) / 2, -(ey + oy), "#b9ae9c");
      }
    }
  }
  const top = Math.max(...flat.map(f => f.ceil));
  box(cg, BLD.L + 2, 0.3, BLD.W + 2, BLD.L / 2, top + 0.4, -BLD.W / 2, "#b9bcbc");
}
function wallHeightNear(it) { for (const s of [1, -1]) { const [px, py] = toWorld(it, s * (it.w / 2 + 0.4), 0); for (const w of ITEMS) { if (w.type === "wall" && inItem(w, px, py, 0.2)) return w.h || 14; } } return 16; }
function buildDisplay(g, it, rnd, P, pick) {
  const w = it.w, d = it.d, h = it.h || 6, col = it.color || "#6b6f73";
  switch (it.style) {
    case "pergola":
      for (const a of [-1, 1]) for (const b of [-1, 1]) pbox(g, a * (w / 2 - 0.3) - 0.22, a * (w / 2 - 0.3) + 0.22, b * (d / 2 - 0.3) - 0.22, b * (d / 2 - 0.3) + 0.22, 0, h - 0.8, col);
      pbox(g, -w / 2, w / 2, -d / 2 + 0.1, -d / 2 + 0.5, h - 0.8, h - 0.3, col); pbox(g, -w / 2, w / 2, d / 2 - 0.5, d / 2 - 0.1, h - 0.8, h - 0.3, col); for (let u = -w / 2 + 0.3; u < w / 2; u += 1.1) pbox(g, u, u + 0.3, -d / 2 - 0.3, d / 2 + 0.3, h - 0.3, h, col);
      pbox(g, -w / 2 + 0.6, w / 2 - 0.6, -0.8, 0.8, 0, 3.2, "#1c1c1c"); for (let k = 0; k < 30; k++) P(-w / 2 + 0.9 + rnd() * (w - 1.8), 0.5 + Math.floor(rnd() * 3) * 1.0 + 0.2, -0.9 - rnd() * 0.1, 0.35, 0.3, 0.2, pick("simpson_orn"));
      break;
    case "heater": pbox(g, -0.55, 0.55, -0.55, 0.55, 0, 2.9, col); pbox(g, -0.08, 0.08, -0.08, 0.08, 2.9, 6.4, col); { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.3, 0.3, 24), mat("#b8bdc0")); m.position.y = 7.2; g.add(m); } break;
    case "clothes": for (const [cx, cz] of [[-w / 2 + 2, -d / 2 + 1], [w / 2 - 2, d / 2 - 1]]) { pbox(g, cx - 2, cx + 2, cz - 0.05, cz + 0.05, 5.3, 5.4, "#9aa0a4"); for (const e of [-1.8, 1.8]) pbox(g, cx + e - 0.05, cx + e + 0.05, cz - 1, cz + 1, 0, 5.3, "#9aa0a4"); for (let k = 0; k < 12; k++) P(cx - 1.7 + k * 0.3, 3.9, cz, 0.2, 2.6, 1.7, ["#cde21a", "#f07e14", "#9a9a9a", "#3a3a3a"][Math.floor(rnd() * 4)]); } break;
    case "cubicles":
      for (const [a, b, c, e] of [[-w / 2, -d / 2, w / 2, -d / 2 + 0.3], [-w / 2, d / 2 - 0.3, w / 2, d / 2], [-w / 2, -d / 2, -w / 2 + 0.3, d / 2], [w / 2 - 0.3, -d / 2, w / 2, d / 2], [-0.15, -d / 2, 0.15, d / 2], [-w / 2, -0.15, w / 2, 0.15]]) pbox(g, a, c, b, e, 0, h, col);
      for (const [u, v] of [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]]) { pbox(g, u - 3, u + 3, v - 1.5, v + 0.5, 2.4, 2.55, "#8a5a34"); pbox(g, u - 0.8, u + 0.8, v - 0.2, v - 0.1, 2.55, 3.9, "#141414"); }
      break;
    case "spinner": { const m = new THREE.Mesh(R.cylG, mat("#3b3f43")); m.scale.set(1.6, 0.15, 1.6); m.position.y = 0.08; g.add(m); pbox(g, -0.05, 0.05, -0.05, 0.05, 0, h, "#9aa0a4"); for (let z = 1.2; z < h; z += 1) for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; P(Math.cos(a) * 0.7, z + 0.3, Math.sin(a) * 0.7, 0.4, 0.6, 0.1, pick("safety")); } break; }
    case "coolers": for (let k = 0; k < 2; k++) { const u = -w / 2 + k * w / 2; pbox(g, u + 0.05, u + w / 2 - 0.05, -d / 2, d / 2, 0, h, col); pbox(g, u + 0.25, u + w / 2 - 0.25, d / 2, d / 2 + 0.04, 0.5, h - 0.4, "#bcd6de", {transparent: true, opacity: 0.35}); for (let z = 1.1; z < h - 0.5; z += 1.2) for (let j = 0; j < 6; j++) P(u + 0.45 + j * 0.38, z + 0.35, d / 2 - 0.4, 0.22, 0.7, 0.22, pick("safety"), true); } break;
    case "cage": for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(g, a * w / 2 - 0.07, a * w / 2 + 0.07, b * d / 2 - 0.07, b * d / 2 + 0.07, 0, 5.5, "#2b2b2b"); pbox(g, -w / 2, w / 2, -d / 2, d / 2, 5.4, 5.55, "#2b2b2b"); pbox(g, -w / 2 + 0.3, w / 2 - 0.3, -d / 2 + 0.3, d / 2 - 0.3, 0.6, 2.0, col); pbox(g, -w / 2, w / 2, d / 2 - 0.1, d / 2, 5.6, 7.4, "#f2f2ee"); break;
    default: if (it.round) { const m = new THREE.Mesh(R.cylG, mat(col)); m.scale.set(w, h, d); m.position.y = h / 2; g.add(m); } else pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h, col);
  }
}

/* ================= walk input ================= */
function setSpin(on) { S.spin = on; if (on) ME.face = null; $("#spinBtn").setAttribute("aria-pressed", String(on)); }
function setCeiling(on) { S.ceiling = on; $("#ceilBtn").setAttribute("aria-pressed", String(on)); if (R && R.ceil) { R.ceil.visible = on; R.dirty = true; } }
function setFov(f) { CAM.zoomed = true; CAM.fov = clamp(f, FOV_MIN, fovMax()); applyFov(); markMoved(); }
$("#spinBtn").addEventListener("click", () => setSpin(!S.spin));
$("#ceilBtn").addEventListener("click", () => setCeiling(!S.ceiling));

function bindWalkInput(el) {
  const ptr = new Map(); let st = null, lastDown = "";
  el.addEventListener("pointerdown", e => {
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    lastDown = e.pointerType;
    ptr.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; st = {pinch: Math.hypot(a.x - b.x, a.y - b.y) || 1, fov: CAM.fov}; }
    else if (ptr.size === 1) st = {x: e.clientX, y: e.clientY, t: performance.now(), moved: false};
    S.dragging = true; el.classList.add("dragging"); ME.face = null; setSpin(false);
  });
  el.addEventListener("pointermove", e => {
    if (!ptr.has(e.pointerId)) return; const prev = ptr.get(e.pointerId); ptr.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (!st) return;
    if (st.pinch) { if (ptr.size < 2) return; const [a, b] = [...ptr.values()]; setFov(st.fov * st.pinch / (Math.hypot(a.x - b.x, a.y - b.y) || 1)); return; }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y; if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) st.moved = true;
    const k = CAM.fov / 62; // look slower when zoomed in
    ME.yaw -= dx * 0.006 * k; ME.look = clamp(ME.look - dy * 0.005 * k, -1.2, 1.2); markMoved();
  });
  const up = e => {
    if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId);
    if (st && !st.pinch && !st.moved && e.type === "pointerup" && e.pointerType !== "mouse" && performance.now() - st.t < 350) tapWalk(e.clientX, e.clientY);
    if (!ptr.size) { st = null; S.dragging = false; el.classList.remove("dragging"); }
  };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("dblclick", e => { if (lastDown === "mouse") tapWalk(e.clientX, e.clientY); }); // touch taps are handled in "up"
  el.addEventListener("touchend", e => e.preventDefault(), {passive: false}); // no emulated mouse clicks after a tap
  el.addEventListener("wheel", e => { e.preventDefault(); setFov(CAM.fov * Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.03 : 0.001))); }, {passive: false});
}
// tap / double-click: walk to the floor spot under the pointer, or up to the first fixture the line of sight meets
const SOLIDS = ITEMS.filter(it => (TYPES[it.type] || {}).blocks || it.type === "door" || it.type === "opening" || it.type === "arch");
function solidAt(x, y, z) {
  for (const it of SOLIDS) {
    const top = it.h || 8;
    if (it.type === "door" || it.type === "opening" || it.type === "arch") { if (z > top && inItem(it, x, y)) return true; continue; }
    if (z <= top && (it.type === "ring" ? inRing(it, x, y, 0) : inItem(it, x, y))) return true;
  }
  return false;
}
function ceilingAt(x, y) { for (const it of ITEMS) if (it.type === "floor" && it.ceil && inItem(it, x, y)) return it.ceil; return Infinity; }
let ray = null, ndc = null;
function tapWalk(cx, cy) {
  if (!R) return;
  if (!ray) { ray = new THREE.Raycaster(); ndc = new THREE.Vector2(); }
  const r = R.renderer.domElement.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, R.camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  const tEnd = d.y < -1e-4 ? Math.min(240, -o.y / d.y) : 240;
  let last = null, hit = null;
  for (let t = 0.6; t <= tEnd; t += 0.25) {
    const x = o.x + d.x * t, y = -(o.z + d.z * t), z = o.y + d.y * t;
    if (S.ceiling && z >= ceilingAt(x, y)) return; // tapped the ceiling
    if (solidAt(x, y, z)) { hit = last || [x, y]; break; }
    last = [x, y];
  }
  if (!hit) { if (d.y >= -1e-4) return; hit = [o.x + d.x * tEnd, -(o.z + d.z * tEnd)]; }
  walkTo(hit[0], hit[1]);
}

/* ================= mini map ================= */
const mini = $("#mini"), mnctx = mini.getContext("2d");
const MN = {cx: BLD.L / 2, cy: BLD.W / 2, s: 1, W: 0, H: 0, pr: 1, base: null, t: 0, sig: ""};
function buildMiniBase() {
  const r = mini.getBoundingClientRect(); if (!r.width || !r.height) return false;
  MN.pr = Math.min(window.devicePixelRatio || 1, 2); MN.W = r.width; MN.H = r.height;
  MN.s = Math.min((MN.W - 8) / (BLD.L + 2), (MN.H - 8) / (BLD.W + 2)); MN.cx = BLD.L / 2; MN.cy = BLD.W / 2;
  const pw = Math.round(r.width * MN.pr), ph = Math.round(r.height * MN.pr);
  if (mini.width !== pw || mini.height !== ph) { mini.width = pw; mini.height = ph; }
  const b = MN.base || document.createElement("canvas"); b.width = pw; b.height = ph;
  const c = b.getContext("2d"); c.setTransform(MN.pr, 0, 0, MN.pr, 0, 0); c.fillStyle = TOK["map-bg"]; c.fillRect(0, 0, MN.W, MN.H); drawItems(c, MN, true);
  MN.base = b; MN.sig = ""; return true;
}
function drawMini(force) {
  if (S.mode !== "walk" || !S.has3D) return;
  if (!MN.base && !buildMiniBase()) return;
  const sig = `${ME.x.toFixed(2)},${ME.y.toFixed(2)},${ME.yaw.toFixed(3)},${ME.path.length},${CAM.halfH.toFixed(3)}`;
  if (!force && sig === MN.sig) return; MN.sig = sig;
  mnctx.setTransform(1, 0, 0, 1, 0, 0); mnctx.clearRect(0, 0, mini.width, mini.height); mnctx.drawImage(MN.base, 0, 0);
  mnctx.setTransform(MN.pr, 0, 0, MN.pr, 0, 0); drawMe(mnctx, MN, true);
}
mini.addEventListener("pointerdown", e => { if (!MN.W) return; e.preventDefault(); const [sx, sy] = offsetOf(mini, e); walkTo(...s2w(MN, sx, sy)); });

/* ================= where am I ================= */
function locate() {
  let zone = "The store";
  for (const it of ITEMS) if (it.type === "floor" && inItem(it, ME.x, ME.y)) zone = it.name;
  let best = null, bd = 25;
  for (const it of ITEMS) {
    if (STRUCT.has(it.type) && it.type !== "door" && it.type !== "arch" && it.type !== "opening") continue;
    const [lx, ly] = toLocal(it, ME.x, ME.y); const dd = Math.hypot(Math.max(0, Math.abs(lx) - it.w / 2), Math.max(0, Math.abs(ly) - it.d / 2));
    if (dd < bd) { bd = dd; best = it; }
  }
  return {zone, near: best ? "near " + displayName(best) : ""};
}
// screen readers hear zone changes and arrivals (not every new "near ..." while walking)
let lastZone = null;
function announce(msg) { const el = $("#srLive"); el.textContent = ""; requestAnimationFrame(() => { el.textContent = msg; }); }
function updateLocation() {
  const l = locate(), z = $("#locZone"), n = $("#locNear");
  if (z.textContent !== l.zone) z.textContent = l.zone;
  if (n.textContent !== l.near) n.textContent = l.near;
  if (l.zone !== lastZone) { if (lastZone !== null && !ME.path.length) announce("You are in " + l.zone); lastZone = l.zone; }
}
function arrived() { const l = locate(); lastZone = l.zone; announce(`You are in ${l.zone}${l.near ? ", " + l.near : ""}.`); }

/* ================= simulation loop ================= */
let moved = true;
const markMoved = () => { moved = true; if (R) R.dirty = true; };
function step(dt) {
  let changed = false;
  // keyboard walking (Walk view only)
  if (S.mode === "walk" && S.has3D) {
    let f = 0, s = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) f += 1; if (keys.has("KeyS") || keys.has("ArrowDown")) f -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) s += 1; if (keys.has("KeyA") || keys.has("ArrowLeft")) s -= 1;
    if (keys.has("KeyQ")) { ME.yaw += 1.8 * dt; changed = true; } if (keys.has("KeyE")) { ME.yaw -= 1.8 * dt; changed = true; }
    if (f || s) {
      ME.path = []; ME.target = null; ME.face = null;
      const sp = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 9 : 5) * dt;
      const fx = -Math.sin(ME.yaw), fy = Math.cos(ME.yaw), rx = Math.cos(ME.yaw), ry = Math.sin(ME.yaw);
      let dx = fx * f + rx * s, dy = fy * f + ry * s; const L = Math.hypot(dx, dy) || 1; dx *= sp / L; dy *= sp / L;
      // slide along walls and shelves instead of stopping dead
      if (!blockedAt(ME.x + dx, ME.y + dy)) { ME.x += dx; ME.y += dy; } else if (!blockedAt(ME.x + dx, ME.y)) ME.x += dx; else if (!blockedAt(ME.x, ME.y + dy)) ME.y += dy;
      ME.heading = ME.yaw; changed = true;
    }
  }
  // following a planned path; the view turns smoothly toward the direction of travel
  if (ME.path.length) {
    let remaining = 0, px = ME.x, py = ME.y; for (const p of ME.path) { remaining += Math.hypot(p[0] - px, p[1] - py); px = p[0]; py = p[1]; }
    const [tx, ty] = ME.path[0], dx = tx - ME.x, dy = ty - ME.y, L = Math.hypot(dx, dy), sp = clamp(remaining * 0.3, 5.2, 11) * dt;
    if (L <= sp) { ME.x = tx; ME.y = ty; ME.path.shift(); } else { ME.x += dx / L * sp; ME.y += dy / L * sp; }
    if (L > 1e-3) { const want = Math.atan2(-dx, dy); ME.heading += wrapAngle(want - ME.heading) * Math.min(1, dt * 10); }
    if (!S.spin && !S.dragging && !keys.has("KeyQ") && !keys.has("KeyE")) ME.yaw += wrapAngle(ME.heading - ME.yaw) * Math.min(1, dt * 4);
    if (!ME.path.length) { ME.target = null; arrived(); }
    changed = true;
  } else if (ME.face && !S.dragging && !S.spin) {
    // arrived: turn to look at the fixture
    const want = Math.atan2(-(ME.face[0] - ME.x), ME.face[1] - ME.y), dyaw = wrapAngle(want - ME.yaw), dlook = -0.08 - ME.look;
    ME.yaw += dyaw * Math.min(1, dt * 3.5); ME.look += dlook * Math.min(1, dt * 3.5);
    if (Math.abs(dyaw) < 0.003 && Math.abs(dlook) < 0.003) ME.face = null;
    changed = true;
  }
  if (S.spin) { ME.yaw += 0.35 * dt; changed = true; }
  ME.yaw = wrapAngle(ME.yaw); ME.heading = wrapAngle(ME.heading);
  // step up onto low platforms
  let gz = 0; for (const it of ITEMS) { if (it.type === "platform" && inItem(it, ME.x, ME.y, 0)) gz = Math.max(gz, it.h || 0.35); }
  if (Math.abs(gz - ME.z) > 1e-4) { ME.z = reducedMotion.matches ? gz : ME.z + (gz - ME.z) * Math.min(1, dt * 14); changed = true; }
  if (changed) markMoved();
}
let lastT = performance.now(), locT = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; // capped so a stalled tab doesn't jump
  step(dt);
  if (S.mode === "walk" && R) {
    if (moved) {
      const c = R.camera, eye = EYE_H + ME.z;
      c.position.set(ME.x, eye, -ME.y);
      c.lookAt(ME.x - Math.sin(ME.yaw) * Math.cos(ME.look), eye + Math.sin(ME.look), -ME.y - Math.cos(ME.yaw) * Math.cos(ME.look));
      const tgt = ME.path.length ? ME.target : null; R.marker.visible = !!tgt; if (tgt) R.marker.position.set(tgt[0], 0.05, -tgt[1]);
    }
    if (R.dirty) { R.renderer.render(R.scene, R.camera); R.dirty = false; }
    if (now - locT > 250) { locT = now; updateLocation(); }
    drawMini(false);
  } else if (S.mode === "map" && moved) drawMap();
  moved = false;
  requestAnimationFrame(tick);
}

/* ================= views, keys, dialog ================= */
function setMode(m) {
  S.mode = m; keys.clear();
  $("#tabWalk").setAttribute("aria-pressed", String(m === "walk")); $("#tabMap").setAttribute("aria-pressed", String(m === "map"));
  $("#walkView").hidden = m !== "walk"; $("#mapView").hidden = m !== "map";
  if (m === "map") resizeMap();
  else { resize3D(); markMoved(); updateLocation(); drawMini(true); }
}
$("#tabWalk").addEventListener("click", () => setMode("walk"));
$("#tabMap").addEventListener("click", () => setMode("map"));
$("#noGlMap").addEventListener("click", () => setMode("map"));

const help = $("#help"), helpBtn = $("#helpBtn");
function openHelp() {
  if (help.open) return; keys.clear();
  if (typeof help.showModal === "function") help.showModal(); else help.setAttribute("open", "");
  $("#helpTitle").focus({preventScroll: true}); help.scrollTop = 0; // start at the top, not at the "Got it" button
}
function closeHelp() { if (typeof help.close === "function") help.close(); else help.removeAttribute("open"); }
helpBtn.addEventListener("click", openHelp);
$("#helpClose").addEventListener("click", closeHelp);
help.addEventListener("click", e => { if (e.target === help) closeHelp(); }); // click on the backdrop
help.addEventListener("close", () => helpBtn.focus());

// was the focused control reached with a mouse or finger (true) or with the keyboard (false)?
let pointerFocus = false;
window.addEventListener("pointerdown", () => { pointerFocus = true; }, true);
const WALK_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
window.addEventListener("keydown", e => {
  if (e.key === "Tab") pointerFocus = false;
  if (help.open) { if (e.key === "Escape" && !help.showModal) closeHelp(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, onControl = t && t !== document.body && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(t.tagName);
  if (e.key === "?") { e.preventDefault(); openHelp(); return; }
  if (e.code === "KeyM") { setMode(S.mode === "map" ? "walk" : "map"); return; }
  if (S.mode === "walk") {
    if (!S.has3D) return;
    if (WALK_KEYS.has(e.code)) { keys.add(e.code); if (e.code !== "ShiftLeft" && e.code !== "ShiftRight") { setSpin(false); ME.face = null; e.preventDefault(); } return; }
    // Space = 360° look, unless a button was reached with the keyboard (then Space presses that button)
    if (e.code === "Space" && (!onControl || (t.tagName === "BUTTON" && pointerFocus))) { e.preventDefault(); setSpin(!S.spin); return; }
    if (e.code === "Equal" || e.code === "NumpadAdd") setFov(CAM.fov / 1.12);
    if (e.code === "Minus" || e.code === "NumpadSubtract") setFov(CAM.fov * 1.12);
    return;
  }
  // Map view
  if (e.code === "Escape") { selectItem(null); return; }
  if (e.code === "KeyN") { stepSelection(e.shiftKey ? -1 : 1); return; }
  if (e.code === "Enter" && S.sel && t === mapCv) { e.preventDefault(); goLook(S.sel); return; }
  if (e.code === "KeyF") { fitMap(); return; }
  if (e.code === "Equal" || e.code === "NumpadAdd") { zoomAt(1.25); return; }
  if (e.code === "Minus" || e.code === "NumpadSubtract") { zoomAt(1 / 1.25); return; }
  const stp = (e.shiftKey ? 120 : 40) / MV.s;
  const nd = {ArrowUp: [0, stp], ArrowDown: [0, -stp], ArrowLeft: [-stp, 0], ArrowRight: [stp, 0]}[e.code];
  if (nd) { e.preventDefault(); MV.cx += nd[0]; MV.cy += nd[1]; drawMap(); }
});
window.addEventListener("keyup", e => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => { if (document.hidden) keys.clear(); });

/* ================= resize + theme ================= */
const ro = new ResizeObserver(entries => {
  for (const en of entries) {
    if (en.target === mapCv) { if (S.mode === "map") resizeMap(); }
    else if (en.target === mini) { MN.base = null; drawMini(true); }
    else if (R && en.target === R.host) { resize3D(); markMoved(); }
  }
});
const darkMq = matchMedia("(prefers-color-scheme: dark)");
const onTheme = () => { readTokens(); MN.base = null; drawMini(true); drawMap(); if (R) { R.marker.material.color.copy(lin(TOK.accent || "#c8102e")); R.dirty = true; } };
if (darkMq.addEventListener) darkMq.addEventListener("change", onTheme);

/* ================= boot ================= */
(function boot() {
  readTokens();
  buildGrid();
  ME.heading = ME.yaw;
  if (webglAvailable()) {
    try { init3D(); S.has3D = true; }
    catch (e) { // give up on 3D cleanly; the Map view still works
      if (R) { try { R.renderer.dispose(); R.renderer.domElement.remove(); } catch (err) { /* already gone */ } }
      R = null; S.has3D = false;
    }
  }
  if (!S.has3D) {
    $("#noGl").hidden = false;
    for (const el of document.querySelectorAll("#walkView .hud")) el.hidden = true;
  }
  ro.observe(mapCv); ro.observe(mini); if (R) ro.observe(R.host);
  setMode("walk");
  // redraw canvas text once the self-hosted fonts are in
  if (document.fonts && document.fonts.load) {
    Promise.all(["600 13px 'Barlow Condensed'", "700 14px 'Barlow Condensed'", "500 12px 'IBM Plex Sans'", "600 12px 'IBM Plex Sans'"].map(f => document.fonts.load(f)))
      .then(() => { MN.base = null; drawMini(true); drawMap(); }, () => {});
  }
  requestAnimationFrame(tick);
})();
})();
