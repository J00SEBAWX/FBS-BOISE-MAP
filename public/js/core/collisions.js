/* Real-time collision checks for department blocks and fixtures. Pure: no DOM.
 * Shapes are exact: rotated rectangles, the sales desk's octagon and polygon blocks (split into convex pieces),
 * tested with the separating-axis theorem; a bounding-box test runs first so a whole map checks in well under
 * a millisecond per block. Touching is not overlapping: anything that goes less than OVERLAP_TOL into another
 * shape (a block snapped flush against a wall face) is fine.
 *
 * An issue is {id, severity: "error" | "warning", otherId, kind, message, at: [x, y], sqft}
 *   kind: wall | column | stairs | desk | counter | door | opening | block | fixture | outside
 * Assumptions (labelled, editable through opts.clearance): doors need CLEARANCE.door ft clear on both sides
 * of the door, openings and arches CLEARANCE.opening / CLEARANCE.arch ft; the clearance zone is as wide as
 * the doorway. */
import {bbox, inItem, pointInPoly, polygonArea, signedArea, toWorld} from "./geometry.js";
import {formatFtIn} from "./units.js";
import {displayName} from "./model.js";
import {localPts} from "./areas.js";

export const CLEARANCE = Object.freeze({door: 4, opening: 3, arch: 3}); // ft, ASSUMPTION (advisor-config doorClearanceFt = 4)
export const OVERLAP_TOL = 0.05;                                        // ft (about 5/8 inch)

/**
 * The building's grid lines in store feet, from the calibrated original floor plan
 * (scan/bp/calibration.json gridStoreFt): columns A-H west to east, rows 1 (north wall) to 5 (south wall).
 */
export const BUILDING_GRID = Object.freeze({
  x: Object.freeze({A: -0.35, B: 24.825, C: 50, D: 76.5, E: 103, F: 125.117, G: 147.233, H: 169.35}),
  y: Object.freeze({1: 80.35, 2: 60.175, 3: 40, 4: 19.825, 5: -0.35}),
});
/** "at grid D3" (within 3 ft of a grid intersection) or "near grid D3". */
export function gridRef(x, y) {
  const near = (lines, v) => {
    let best = {k: "", d: Infinity};
    for (const [k, at] of Object.entries(lines)) if (Math.abs(at - v) < best.d) best = {k, d: Math.abs(at - v)};
    return best;
  };
  const gx = near(BUILDING_GRID.x, x), gy = near(BUILDING_GRID.y, y);
  return `${Math.hypot(gx.d, gy.d) <= 3 ? "at" : "near"} grid ${gx.k}${gy.k}`;
}

/* ---------- shapes ---------- */
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function isConvex(p) {
  let sign = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const o = orient(p[i], p[(i + 1) % n], p[(i + 2) % n]);
    if (Math.abs(o) < 1e-12) continue;
    if (!sign) sign = Math.sign(o); else if (Math.sign(o) !== sign) return false;
  }
  return true;
}
function inTri(p, a, b, c) {
  return orient(a, b, p) >= -1e-12 && orient(b, c, p) >= -1e-12 && orient(c, a, p) >= -1e-12;
}
/** Ear-clipping triangulation of a simple counter-clockwise polygon (up to 24 corners). */
export function triangulate(pts) {
  const idx = pts.map((_, i) => i), tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 2000) {
    let cut = false;
    for (let k = 0, n = idx.length; k < n; k++) {
      const i0 = idx[(k - 1 + n) % n], i1 = idx[k], i2 = idx[(k + 1) % n];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      if (orient(a, b, c) <= 1e-12) continue;
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inTri(pts[j], a, b, c))) continue;
      tris.push([a, b, c]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break; // not simple: fall back to a fan below
  }
  if (idx.length === 3) tris.push(idx.map(i => pts[i]));
  else for (let k = 1; k + 1 < idx.length; k++) tris.push([pts[idx[0]], pts[idx[k]], pts[idx[k + 1]]]);
  return tris.filter(t => Math.abs(orient(t[0], t[1], t[2])) > 1e-12);
}
function octagon(it) {
  const X = it.w / 2, Y = it.d / 2, c = Math.max(0, Math.min(it.cham ?? 1.75, Math.min(X, Y) * 0.95));
  return [[-X + c, -Y], [X - c, -Y], [X, -Y + c], [X, Y - c], [X - c, Y], [-X + c, Y], [-X, Y - c], [-X, -Y + c]];
}
function makeShape(it, local) {
  let outline = local.map(([a, b]) => toWorld(it, a, b));
  if (signedArea(outline) < 0) outline = outline.slice().reverse();
  const box = bbox(outline);
  return {outline, pieces: isConvex(outline) ? [outline] : triangulate(outline), box, area: polygonArea(outline)};
}
const shapeCache = new WeakMap();
const sig = it => `${it.type}|${it.x}|${it.y}|${it.w}|${it.d}|${it.rot}|${it.shape}|${it.cham}|${it.type === "area" && it.pts ? JSON.stringify(it.pts) : ""}`;
/**
 * An item's footprint: {outline (store coords, counter-clockwise), pieces (convex parts), box, area}.
 * Blocks use their rectangle or polygon, an octagonal sales desk its octagon, everything else its rectangle.
 * Cached per item object (re-made if the item was changed in place).
 */
export function shapeOf(it) {
  const s = sig(it), c = shapeCache.get(it);
  if (c && c.sig === s) return c.shape;
  const local = it.type === "area" ? localPts(it)
    : it.type === "ring" && it.shape === "oct" ? octagon(it)
    : [[-it.w / 2, -it.d / 2], [it.w / 2, -it.d / 2], [it.w / 2, it.d / 2], [-it.w / 2, it.d / 2]];
  const shape = makeShape(it, local);
  shapeCache.set(it, {sig: s, shape});
  return shape;
}
const zoneCache = new WeakMap();
/** The clearance zone of a door / opening / arch: as wide as the doorway, clear ft out on both sides. */
export function clearanceShape(it, clear) {
  const s = sig(it) + "|" + clear, c = zoneCache.get(it);
  if (c && c.sig === s) return c.shape;
  const D = it.d / 2 + clear;
  const shape = makeShape(it, [[-it.w / 2, -D], [it.w / 2, -D], [it.w / 2, D], [-it.w / 2, D]]);
  zoneCache.set(it, {sig: s, shape});
  return shape;
}

/* ---------- overlap tests ---------- */
const boxesMeet = (a, b, tol = 0) => a.x0 < b.x1 - tol && b.x0 < a.x1 - tol && a.y0 < b.y1 - tol && b.y0 < a.y1 - tol;
/** Separating-axis test for two convex polygons: true when they overlap by more than tol on every axis. */
export function convexOverlap(A, B, tol = OVERLAP_TOL) {
  for (const P of [A, B]) {
    for (let i = 0, n = P.length; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      let nx = a[1] - b[1], ny = b[0] - a[0];
      const L = Math.hypot(nx, ny);
      if (L < 1e-12) continue;
      nx /= L; ny /= L;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const q of A) { const v = q[0] * nx + q[1] * ny; if (v < a0) a0 = v; if (v > a1) a1 = v; }
      for (const q of B) { const v = q[0] * nx + q[1] * ny; if (v < b0) b0 = v; if (v > b1) b1 = v; }
      if (Math.min(a1, b1) - Math.max(a0, b0) <= tol) return false;
    }
  }
  return true;
}
/** Do two shapes (from shapeOf / clearanceShape) overlap by more than tol? */
export function shapesOverlap(sa, sb, tol = OVERLAP_TOL) {
  if (!boxesMeet(sa.box, sb.box, tol)) return false;
  for (const p of sa.pieces) for (const q of sb.pieces) if (convexOverlap(p, q, tol)) return true;
  return false;
}
// Sutherland-Hodgman: subject polygon clipped by a convex counter-clockwise polygon
function clip(subject, C) {
  let out = subject;
  for (let i = 0, n = C.length; i < n && out.length; i++) {
    const a = C[i], b = C[(i + 1) % n], inp = out;
    out = [];
    for (let j = 0, m = inp.length; j < m; j++) {
      const P = inp[(j + m - 1) % m], Q = inp[j];
      const pin = orient(a, b, P) >= 0, qin = orient(a, b, Q) >= 0;
      if (qin) { if (!pin) out.push(cross(P, Q, a, b)); out.push(Q); }
      else if (pin) out.push(cross(P, Q, a, b));
    }
  }
  return out;
}
function cross(P, Q, a, b) {
  const d1 = orient(a, b, P), d2 = orient(a, b, Q), t = d1 / (d1 - d2 || 1e-300);
  return [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
}
/** Overlap of two shapes: {sqft, at: [x, y] (middle of the overlap) | null}. */
export function overlapArea(sa, sb) {
  let A = 0, cx = 0, cy = 0;
  if (!boxesMeet(sa.box, sb.box)) return {sqft: 0, at: null};
  for (const p of sa.pieces) for (const q of sb.pieces) {
    const r = clip(p, q);
    if (r.length < 3) continue;
    const a = polygonArea(r);
    if (a <= 0) continue;
    let mx = 0, my = 0;
    for (const v of r) { mx += v[0]; my += v[1]; }
    A += a; cx += a * mx / r.length; cy += a * my / r.length;
  }
  return A > 0 ? {sqft: A, at: [cx / A, cy / A]} : {sqft: 0, at: null};
}

/* ---------- what an item is, for the checks ---------- */
const FIXTURE_TYPES = new Set(["gondola", "wallunit", "rack", "pallet", "tower", "display", "table", "counter", "ring"]);
const isSalesDesk = it => it.type === "ring" || (it.type === "counter" && (it.fixed === true || /sales\s*desk/i.test(it.name || "")));
/** The obstacle class of an item (null = not an obstacle). */
function classOf(it) {
  switch (it.type) {
    case "wall": return "wall";
    case "column": return "column";
    case "stairs": return "stairs";
    case "door": return "door";
    case "opening": case "arch": return "opening";
    case "area": return "block";
    case "floor": return "floor";
    default: return isSalesDesk(it) ? "desk" : it.type === "counter" ? "counter" : FIXTURE_TYPES.has(it.type) ? "fixture" : null;
  }
}
// severity by [the checked thing][the obstacle]; missing = not checked
const SEVERITY = {
  block: {wall: "error", column: "warning", stairs: "error", desk: "error", counter: "warning", door: "error", opening: "warning", block: "error"},
  fixture: {wall: "error", column: "error", stairs: "error", desk: "error", counter: "warning", door: "error", opening: "warning", fixture: "warning"},
};

/* ---------- plain-language messages ---------- */
const nameOf = it => displayName(it).replace(/\s+/g, " ").trim();
const q = s => `'${s}'`;
const clearText = c => (Math.abs(c - Math.round(c)) < 1e-9 ? `${Math.round(c)} ft` : formatFtIn(c, {compact: true}));
function message(kind, other, at, sqft, clear) {
  const n = nameOf(other), g = at ? gridRef(at[0], at[1]) : "";
  switch (kind) {
    case "wall": return /^wall$/i.test(n) ? `Overlaps a wall ${g}` : `Overlaps the wall ${q(n)} ${g}`;
    case "column": return /^(column|post)$/i.test(n) ? `Overlaps the column ${g}` : `Overlaps the column ${q(n)} ${g}`;
    case "stairs": return `Covers the stairs ${q(n)} - keep stairs clear`;
    case "desk": return `Overlaps the sales desk ${q(n)}`;
    case "counter": return `Overlaps the counter ${q(n)}`;
    case "door": {
      const allCaps = n === n.toUpperCase() && /[A-Z]/.test(n);
      if (/^doors?$/i.test(n)) return `Blocks a door ${g} - keep ${clearText(clear)} clear`;
      if (allCaps && /\bdoors?\b/i.test(n)) return `Blocks the ${n.toLowerCase()} - keep ${clearText(clear)} clear`;
      if (/^[A-Z][\w-]*'s\s+doors?$/i.test(n)) return `Blocks ${n} - keep ${clearText(clear)} clear`;
      return `Blocks the door ${q(n)} - keep ${clearText(clear)} clear`;
    }
    case "opening": {
      const what = other.type === "arch" ? "arch" : "opening";
      return /^(opening|arch)$/i.test(n) ? `Blocks an ${what} ${g} - keep ${clearText(clear)} clear` : `Blocks the ${what} ${q(n)} - keep ${clearText(clear)} clear`;
    }
    case "block": return `Overlaps ${q(n)} by ${Math.max(1, Math.round(sqft)).toLocaleString("en-US")} sq ft`;
    default: return `Overlaps ${q(n)}`;
  }
}

/* ---------- outside the building ---------- */
const inAnyFloor = (floors, x, y, tol) => floors.some(f => inItem(f, x, y, tol));
/** How much of a shape is off the floor: {sqft, frac, cornersOut}. Sampled on a grid of up to ~300 points. */
export function outsideFloor(shape, floors) {
  const near = floors.filter(f => boxesMeet(shapeOf(f).box, shape.box, -0.5));
  const {x0, y0, x1, y1} = shape.box;
  const step = Math.max(0.25, Math.sqrt(Math.max(shape.area, 0.01) / 300));
  let n = 0, out = 0;
  for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
    if (!pointInPoly(x, y, shape.outline)) continue;
    n++;
    if (!inAnyFloor(near, x, y, 0.05)) out++;
  }
  const cornersOut = shape.outline.filter(([x, y]) => !inAnyFloor(near, x, y, 0.25)).length;
  if (!n) { n = 1; const c = shape.outline.reduce((s, p) => [s[0] + p[0] / shape.outline.length, s[1] + p[1] / shape.outline.length], [0, 0]); out = inAnyFloor(near, c[0], c[1], 0.05) ? 0 : 1; }
  return {sqft: shape.area * out / n, frac: out / n, cornersOut};
}

/* ---------- the checks ---------- */
/**
 * Prepares a map for repeated checks (call once per doc; a drag can reuse it while only the dragged item moves):
 * the obstacles with their shapes, grouped by class.
 */
export function prepare(doc) {
  const groups = {wall: [], column: [], stairs: [], desk: [], counter: [], door: [], opening: [], block: [], fixture: [], floor: []};
  for (const it of doc.items) {
    const k = classOf(it);
    if (k && groups[k]) groups[k].push(it);
  }
  return {doc, groups};
}

/**
 * Checks one block or fixture (an item object, which may be a moved copy not yet in the doc, or an id) against
 * the map (a doc or prepare(doc)). Only blocks and fixtures (shelving, racks, counters, desks, displays, tables,
 * towers) are checked; structure, floors and platforms return [].
 * opts: clearance {door, opening, arch} (ft), tol (ft), outside (false = skip the outside-the-building check).
 * Errors come first, then warnings, each sorted by overlap size.
 */
export function checkItem(map, item, opts = {}) {
  const P = map && map.groups ? map : prepare(map);
  const it = typeof item === "string" ? P.doc.items.find(x => x.id === item) : item;
  if (!it) return [];
  const self = it.type === "area" ? "block" : FIXTURE_TYPES.has(it.type) ? "fixture" : null;
  if (!self) return [];
  const sev = SEVERITY[self];
  const tol = opts.tol ?? OVERLAP_TOL;
  const clear = {...CLEARANCE, ...(opts.clearance || {})};
  const S = shapeOf(it);
  const issues = [];
  for (const kind of Object.keys(sev)) {
    for (const o of P.groups[kind]) {
      if (o.id === it.id) continue;
      let os;
      let c = 0;
      if (kind === "door" || kind === "opening") {
        c = kind === "door" ? clear.door : (o.type === "arch" ? clear.arch : clear.opening);
        if (!(c >= 0)) continue;
        os = clearanceShape(o, c);
      } else os = shapeOf(o);
      if (!boxesMeet(S.box, os.box, tol) || !shapesOverlap(S, os, tol)) continue;
      const ov = overlapArea(S, os);
      const at = ov.at || [o.x, o.y];
      issues.push({id: it.id, severity: sev[kind], otherId: o.id, kind, message: message(kind, o, at, ov.sqft, c), at, sqft: ov.sqft});
    }
  }
  if (opts.outside !== false && P.groups.floor.length) {
    const o = outsideFloor(S, P.groups.floor);
    if (o.frac > 0.999) issues.push({id: it.id, severity: "error", otherId: null, kind: "outside", message: "Outside the building", at: [it.x, it.y], sqft: o.sqft});
    else if (o.frac >= 0.5) issues.push({id: it.id, severity: "error", otherId: null, kind: "outside", message: `Mostly outside the building (about ${Math.round(o.sqft).toLocaleString("en-US")} sq ft)`, at: [it.x, it.y], sqft: o.sqft});
    else if (o.sqft >= 1 || o.cornersOut > 0) issues.push({id: it.id, severity: "warning", otherId: null, kind: "outside", message: `About ${Math.max(1, Math.round(o.sqft)).toLocaleString("en-US")} sq ft is outside the building`, at: [it.x, it.y], sqft: o.sqft});
  }
  return issues.sort((a, b) => (a.severity === b.severity ? b.sqft - a.sqft : a.severity === "error" ? -1 : 1));
}

/**
 * Checks every department block (opts.fixtures = true also checks every fixture).
 * Returns {issues (flat), byId: {id: [issue]}, errors, warnings}.
 */
export function checkAll(doc, opts = {}) {
  const P = prepare(doc);
  const subjects = opts.fixtures ? doc.items.filter(it => it.type === "area" || FIXTURE_TYPES.has(it.type)) : P.groups.block;
  const byId = {}, issues = [];
  for (const it of subjects) {
    const list = checkItem(P, it, opts);
    if (list.length) { byId[it.id] = list; issues.push(...list); }
  }
  return {issues, byId, errors: issues.filter(i => i.severity === "error").length, warnings: issues.filter(i => i.severity === "warning").length};
}
