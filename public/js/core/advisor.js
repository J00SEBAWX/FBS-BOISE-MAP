/* Suggested Merchandising Advisor (OWNER RULES v3.1, rule 6).
 *
 * analyse(map, catalog, config) scores a map's department plan against retail-flow principles and returns
 *   {overall, principles: [{id, title, why, enabled, weight, applicable, score, reasoning, findings}],
 *    recommendations: [{id, rank, principleId, priority, title, why, show: {ids?, region?, points?}, apply?}],
 *    overlays: {heat, sightlines, paths, chokePoints, zones, coldSpots}, stats}
 * Principles (ids = the rule keys of shared/advisor-config.js): decompression, power_wall, destination_back,
 * sightlines, bulky_near_yard, adjacency, aisle_widths, choke_points, door_clearance, cold_corners, size_vs_target.
 * Each one can be turned off or weighted in the config; every number it uses is a threshold or a labelled
 * assumption (ADVISOR_THRESHOLDS in shared/advisor-config.js, ADVISOR_ASSUMPTIONS here), never a hidden constant.
 * An "apply" is offered only where a concrete fix exists (move a block out of the entrance zone or a doorway,
 * into view of the desks, next to its partner, near the yard; resize to target; nudge a fixture that pinches
 * an aisle) and only after the new position was checked: on the floor, not across walls, stairs or fixed
 * desks, not into the entrance zone or a doorway, not onto another department.
 *
 * The structure-only part (walk grid, routes, traffic, sight lines, zones) depends only on the walls and
 * fixtures, so it is cached: moving department blocks re-runs only the principles.
 * Pure: no DOM; Node imports it for the tests. */
import {toWorld, polygonArea} from "./geometry.js";
import {normalizeItem, displayName} from "./model.js";
import {formatFtIn} from "./units.js";
import {CATALOG, mergeCategories} from "../shared/catalog.js";
import {ADVISOR_RULES, ADVISOR_THRESHOLDS, MARGIN_TIERS, defaultAdvisorConfig} from "../shared/advisor-config.js";
import * as W from "./walkgrid.js";

const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());

/** The advisor engine's own assumptions: [default, min, max, label]. Editable like the thresholds. */
export const ADVISOR_ASSUMPTIONS = Object.freeze({
  decompressionSideFt: [5, 0, 30, "The entrance zone reaches this far past each side of the front door, ft"],
  openingClearanceFt: [3, 0, 20, "Clearance in front of openings and arches, ft"],
  doorMinFt: [2.67, 2, 6, "Narrowest clear door width (ADA 32 in), ft"],
  sightBlockFt: [5, 2, 20, "Fixtures at least this tall block the view, ft"],
  deskSightShare: [0.7, 0, 1, "Sight-line score: share that comes from the sales desks (the rest: the entrance)"],
  rightShare: [0.7, 0, 1, "Power-wall score: share that comes from being right of the entrance (the rest: being near it)"],
  backShare: [0.6, 0.1, 1, "Counts as at the back: this share of the walk from the front door to the yard doors"],
  passByTarget: [3, 0, 10, "Departments a trip to a destination department should walk past"],
  coldFt: [25, 5, 100, "Counts as cold: walking distance from the main paths, ft"],
  coldMinSqft: [60, 10, 1000, "Smallest cold spot worth reporting, sq ft"],
  heatFalloffFt: [12, 2, 60, "Traffic fades over this walking distance from a main path, ft"],
  customerZoneFt: [15, 2, 60, "Aisles are checked within this walk of a main path or inside a department, ft"],
  minAisleFt: [2, 0.5, 4, "Gaps narrower than this are not aisles (not checked), ft"],
  minAisleLenFt: [1, 0, 10, "A narrow spot must run at least this far to count as a narrow aisle, ft"],
  minOccupySqft: [2.5, 0, 50, "A fixture or department must cover at least this much of a doorway's clearance to count, sq ft"],
  searchRadiusFt: [36, 6, 120, "How far an Apply may move a department, ft"],
  tripFrontDesk: [1, 0, 5, "Main trips: front door to the sales desks (relative weight)"],
  tripDeskYard: [0.5, 0, 5, "Main trips: sales desks to the yard doors (relative weight)"],
  tripDeskWillCall: [0.4, 0, 5, "Main trips: sales desks to will-call (relative weight)"],
  tripFrontYard: [0.3, 0, 5, "Main trips: front door to the yard doors (relative weight)"],
  tripFrontWillCall: [0.3, 0, 5, "Main trips: front door to will-call (relative weight)"],
  cellFt: [W.WALK_DEFAULTS.cellFt, 0.25, 2, W.WALK_LABELS.cellFt],
  walkRadiusFt: [W.WALK_DEFAULTS.walkRadiusFt, 0.1, 2, W.WALK_LABELS.walkRadiusFt],
  clearCapFt: [W.WALK_DEFAULTS.clearCapFt, 4, 30, W.WALK_LABELS.clearCapFt],
  platformStepFt: [W.WALK_DEFAULTS.platformStepFt, 0, 2, W.WALK_LABELS.platformStepFt],
  centreBias: [W.WALK_DEFAULTS.centreBias, 0, 10, W.WALK_LABELS.centreBias],
  preferClearFt: [W.WALK_DEFAULTS.preferClearFt, 0, 10, W.WALK_LABELS.preferClearFt],
});
/** Adjacency pairs the owner named (OWNER RULES v3.1 rule 6): they count double. */
export const OWNER_PAIRS = Object.freeze([["bits_blades", "power_tools"], ["decking_outdoor", "paint_finishing"]]);
const SEVERITY = {high: 3, medium: 2, low: 1, info: 0};

/* ---------- config ---------- */
/** The default advisor settings for a catalog (shared defaults + this engine's assumptions). */
export function defaultConfig(catalog = CATALOG) {
  const cfg = defaultAdvisorConfig();
  const th = (catalog && catalog.thresholds) || {};
  for (const k of ["nearFt", "anchorFt", "perimeterFt"]) if (Number.isFinite(th[k])) cfg.thresholds[k] = th[k];
  cfg.assumptions = {};
  for (const [k, v] of Object.entries(ADVISOR_ASSUMPTIONS)) cfg.assumptions[k] = v[0];
  cfg.closedDoors = [];
  return cfg;
}
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const inRange = (v, [, lo, hi]) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
/** Merges a (possibly partial or stale) config over the defaults; anything out of range or unknown is ignored. */
export function resolveConfig(raw, catalog = CATALOG) {
  const cfg = defaultConfig(catalog);
  if (!isObj(raw)) return cfg;
  if (isObj(raw.thresholds)) for (const [k, spec] of Object.entries(ADVISOR_THRESHOLDS)) if (inRange(raw.thresholds[k], spec)) cfg.thresholds[k] = raw.thresholds[k];
  if (isObj(raw.assumptions)) for (const [k, spec] of Object.entries(ADVISOR_ASSUMPTIONS)) if (inRange(raw.assumptions[k], spec)) cfg.assumptions[k] = raw.assumptions[k];
  if (isObj(raw.departments)) for (const [k, d] of Object.entries(raw.departments)) {
    if (!/^[a-z0-9_]{1,32}$/.test(k) || !isObj(d)) continue;
    const cur = cfg.departments[k] || {margin: "medium", theftProne: false, assumption: true};
    if (MARGIN_TIERS.includes(d.margin)) cur.margin = d.margin;
    if (typeof d.theftProne === "boolean") cur.theftProne = d.theftProne;
    cfg.departments[k] = cur;
  }
  if (isObj(raw.roles)) for (const r of Object.keys(cfg.roles)) {
    const list = raw.roles[r];
    if (Array.isArray(list) && list.length <= 20 && list.every(k => typeof k === "string" && /^[a-z0-9_]{1,32}$/.test(k))) cfg.roles[r] = [...new Set(list)];
  }
  if (isObj(raw.rules)) for (const k of Object.keys(cfg.rules)) {
    const r = raw.rules[k];
    if (!isObj(r)) continue;
    if (typeof r.enabled === "boolean") cfg.rules[k].enabled = r.enabled;
    if (typeof r.weight === "number" && Number.isFinite(r.weight) && r.weight >= 0 && r.weight <= 5) cfg.rules[k].weight = r.weight;
  }
  if (Array.isArray(raw.closedDoors)) cfg.closedDoors = raw.closedDoors.filter(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(id)).slice(0, 50);
  return cfg;
}

/* ---------- small helpers ---------- */
const ft = v => formatFtIn(v);
const sq = v => `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} sq ft`;
const pct = v => `${Math.round(100 * v)}%`;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const r2 = v => Math.round(v * 100) / 100;
const snap = v => Math.round(v * 2) / 2; // the 6-inch grid
function compass(dx, dy) {
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return "";
  const names = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];
  return names[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
}
const moveText = (dx, dy) => `${ft(Math.hypot(dx, dy))} ${compass(dx, dy)}`;
const list = names => (names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]);
const na = reasoning => ({applicable: false, score: null, reasoning, findings: []});

/* ---------- the structure-only environment (cached) ---------- */
let ENV_CACHE = {key: null, env: null};

function frameOf(G, door, spot) {
  // inward normal: from the door towards the side its standing spot is on
  const r = (door.rot || 0) * Math.PI / 180, ny = [-Math.sin(r), Math.cos(r)];
  const side = (spot.x - door.x) * ny[0] + (spot.y - door.y) * ny[1] >= 0 ? 1 : -1;
  const n = [ny[0] * side, ny[1] * side], u = [n[1], -n[0]]; // u = to the right when walking in along n
  const f = [door.x + n[0] * door.d / 2, door.y + n[1] * door.d / 2];
  return {f, n, u, hw: door.w / 2};
}
const toFrame = (fr, x, y) => [(x - fr.f[0]) * fr.u[0] + (y - fr.f[1]) * fr.u[1], (x - fr.f[0]) * fr.n[0] + (y - fr.f[1]) * fr.n[1]];
const fromFrame = (fr, s, t) => [fr.f[0] + fr.u[0] * s + fr.n[0] * t, fr.f[1] + fr.u[1] * s + fr.n[1] * t];
/** Floor cells inside a rectangle of the frame (s in [s0, s1], t in [t0, t1]). */
function frameCells(G, fr, s0, s1, t0, t1) {
  const pts = [fromFrame(fr, s0, t0), fromFrame(fr, s1, t0), fromFrame(fr, s1, t1), fromFrame(fr, s0, t1)];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), out = [];
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.floor((Math.max(...xs) - G.x0) / G.cell));
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - G.y0) / G.cell)), j1 = Math.min(G.ny - 1, Math.floor((Math.max(...ys) - G.y0) / G.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * G.nx + i;
    if (!G.floor[k]) continue;
    const [x, y] = W.cellCentre(G, k), [s, t] = toFrame(fr, x, y);
    if (s >= s0 && s <= s1 && t >= t0 && t <= t1) out.push(k);
  }
  return {cells: out, polygon: pts.map(([x, y]) => [r2(x), r2(y)])};
}

/** The anchors with these ids that are on the map: where people stand to use them. Unreachable ones go to `blocked`. */
function anchorList(G, items, ids, comp, prefer, blocked = null, key = "") {
  const byId = new Map(items.map(it => [it.id, it])), out = [];
  for (const id of ids || []) {
    const it = byId.get(id);
    if (!it) continue;
    const spot = W.standingSpot(G, it, {comp, prefer});
    if (spot) out.push({id, name: displayName(it), item: it, ...spot});
    else if (blocked) blocked.push({key, id, name: displayName(it), x: it.x, y: it.y});
  }
  return out;
}

function environment(items, catalog, cfg) {
  const T = cfg.thresholds, A = cfg.assumptions;
  const struct = items.filter(it => it.type !== "area");
  const key = JSON.stringify([struct, A, T, cfg.closedDoors, catalog.entryAnchors || null]);
  if (ENV_CACHE.key === key) return ENV_CACHE.env;
  const t0 = now(), timings = {};
  let tm = t0;
  const mark = label => { const t = now(); timings[label] = Math.round((t - tm) * 10) / 10; tm = t; };
  const G = W.buildWalkGrid({items: struct}, {
    cellFt: A.cellFt, walkRadiusFt: A.walkRadiusFt, clearCapFt: A.clearCapFt, platformStepFt: A.platformStepFt,
    centreBias: A.centreBias, preferClearFt: A.preferClearFt, closedDoors: cfg.closedDoors,
  });
  mark("grid");
  const EA = catalog.entryAnchors || {};
  const missing = [];
  // the front door: the catalog's anchor, else a door named "front door", else the first door
  let frontIds = ((EA.front_door || {}).items || []).filter(id => struct.some(it => it.id === id));
  if (!frontIds.length) {
    const doors = struct.filter(it => it.type === "door");
    const fd = doors.find(it => /front\s*door/i.test(it.name || "")) || doors[0];
    if (fd) frontIds = [fd.id];
    missing.push("front_door");
  }
  const front = anchorList(G, struct, frontIds, 0, null);
  let mainComp = front.length ? G.comp[front[0].k] : 0;
  if (!mainComp || G.compSize[mainComp] < 0.1 * Math.max(...G.compSize)) mainComp = G.compSize.indexOf(Math.max(...G.compSize));
  const prefer = front.length ? [front[0].x, front[0].y] : null;
  const anchors = {front_door: front.filter(a => G.comp[a.k] === mainComp)};
  const blocked = [];
  for (const k of ["sales_desk", "will_call", "yard_doors"]) {
    anchors[k] = anchorList(G, struct, (EA[k] || {}).items, mainComp, prefer, blocked, k);
    const want = ((EA[k] || {}).items || []).filter(id => struct.some(it => it.id === id)).length;
    if (anchors[k].length < want || !want) missing.push(k);
  }
  const mainCells = G.compSize[mainComp] || 0;

  // walking fields from the front door, will-call and each yard door; the main trips between the anchors
  const field = a => W.dijkstra(G, [a.k]);
  const fFront = anchors.front_door.length ? field(anchors.front_door[0]) : null;
  const fWill = anchors.will_call.map(field), fYard = anchors.yard_doors.map(field);
  mark("anchorsAndFields");
  const routes = [];
  // field: a walking field whose source is `to` ("to") or `from` ("from"); routes read from -> to
  const addRoute = (from, to, field, fieldAt, weight) => {
    let cells = W.traceRoute(field, fieldAt === "to" ? from.k : to.k);
    if (cells && fieldAt === "from") cells.reverse();
    const id = `${from.id}>${to.id}`, label = `${from.name} to ${to.name}`;
    routes.push(cells ? {id, from, to, weight, cells, lengthFt: W.routeLength(G, cells), label} : {id, from, to, weight, cells: null, label});
  };
  const desks = anchors.sales_desk, nD = Math.max(1, desks.length), nY = Math.max(1, anchors.yard_doors.length), nW = Math.max(1, anchors.will_call.length);
  const front0 = anchors.front_door[0];
  if (fFront) for (const d of desks) addRoute(front0, d, fFront, "from", A.tripFrontDesk / nD);
  for (const d of desks) {
    anchors.will_call.forEach((w, i) => addRoute(d, w, fWill[i], "to", A.tripDeskWillCall / nD / nW));
    anchors.yard_doors.forEach((y, i) => addRoute(d, y, fYard[i], "to", A.tripDeskYard / nD / nY));
  }
  if (front0) {
    anchors.will_call.forEach((w, i) => addRoute(front0, w, fWill[i], "to", A.tripFrontWillCall / nW));
    anchors.yard_doors.forEach((y, i) => addRoute(front0, y, fYard[i], "to", A.tripFrontYard / nY));
  }
  for (const r of routes) if (r.cells) r.points = W.simplifyRoute(G, r.cells);

  mark("routes");
  // traffic: every cell gets the weight of the busiest main path near it, fading with the walk from it
  const onPath = new Float32Array(G.N);
  for (const r of routes) if (r.cells) { const seen = new Set(); for (const k of r.cells) if (!seen.has(k)) { seen.add(k); onPath[k] += r.weight; } }
  let wMax = 0;
  const src = [];
  for (let k = 0; k < G.N; k++) if (onPath[k] > 0) { src.push({k, d0: 0, w: onPath[k]}); if (onPath[k] > wMax) wMax = onPath[k]; }
  const tf = src.length ? W.walkDistance(G, src) : null;
  const dPath = tf ? tf.dist : new Float32Array(G.N).fill(Infinity);
  const heat = new Float32Array(G.N);
  if (tf) for (let k = 0; k < G.N; k++) if (Number.isFinite(dPath[k])) heat[k] = (tf.carry[k] / wMax) * Math.exp(-dPath[k] / A.heatFalloffFt);

  mark("traffic");
  // rooms customers walk through (floor items crossed by a main path): the area for aisle and cold-spot checks
  const custRoom = new Uint8Array(G.N);
  const floors = struct.filter(it => it.type === "floor").map(W.itemGeo).filter(Boolean);
  const onRoute = [];
  for (const r of routes) if (r.cells) for (let q = 0; q < r.cells.length; q += 4) onRoute.push(W.cellCentre(G, r.cells[q]));
  for (const g of floors) {
    const t = rectTest(g);
    if (!onRoute.some(([x, y]) => t(x, y))) continue;
    const ext = Math.hypot(g.w, g.d) / 2;
    const i0 = Math.max(0, Math.floor((g.x - ext - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.floor((g.x + ext - G.x0) / G.cell));
    const j0 = Math.max(0, Math.floor((g.y - ext - G.y0) / G.cell)), j1 = Math.min(G.ny - 1, Math.floor((g.y + ext - G.y0) / G.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * G.nx + i;
      if (G.comp[k] === mainComp && !custRoom[k] && t(G.x0 + (i + 0.5) * G.cell, G.y0 + (j + 0.5) * G.cell)) custRoom[k] = 1;
    }
  }
  if (!floors.length) for (let k = 0; k < G.N; k++) if (G.comp[k] === mainComp) custRoom[k] = 1;

  mark("rooms");
  // zones: the entrance (decompression) zone and the clearance in front of every door, opening and arch
  const keep = new Uint8Array(G.N), zones = {decompression: [], doors: []};
  for (const a of anchors.front_door) {
    const fr = frameOf(G, a.item, a), hw = fr.hw + A.decompressionSideFt;
    const z = frameCells(G, fr, -hw, hw, 0, T.decompressionFt);
    for (const k of z.cells) keep[k] |= 1;
    zones.decompression.push({id: a.id, name: a.name, frame: {...fr, hw}, depth: T.decompressionFt, ...z, areaSqft: z.cells.length * G.cell * G.cell});
  }
  const anchorIds = new Set(Object.values(anchors).flat().map(a => a.id));
  G.passages.forEach(p => {
    const clearFt = p.type === "door" ? T.doorClearanceFt : A.openingClearanceFt;
    if (!(clearFt > 0)) return;
    const r = p.rot * Math.PI / 180, ny = [-Math.sin(r), Math.cos(r)];
    const sides = [];
    for (const sd of [1, -1]) {
      const fr = {f: [p.x + ny[0] * sd * p.d / 2, p.y + ny[1] * sd * p.d / 2], n: [ny[0] * sd, ny[1] * sd], hw: p.w / 2};
      fr.u = [fr.n[1], -fr.n[0]];
      const z = frameCells(G, fr, -fr.hw, fr.hw, 0, clearFt);
      const full = Math.max(1, (p.w * clearFt) / (G.cell * G.cell));
      if (z.cells.length >= 0.3 * full) sides.push({frame: fr, depth: clearFt, ...z});
    }
    if (!sides.length) return;
    for (const s of sides) for (const k of s.cells) keep[k] |= 2;
    zones.doors.push({id: p.id, name: displayName(p.src), type: p.type, exterior: sides.length === 1, anchor: anchorIds.has(p.id), sides});
  });

  // where a department block may not go: walls, stairs, fixed desks and platforms (columns are fine inside one)
  const hard = new Uint8Array(G.N);
  for (let k = 0; k < G.N; k++) {
    if (!G.floor[k]) { hard[k] = 1; continue; }
    const oi = G.inside[k] >= 0 ? G.inside[k] : G.clear[k] < G.cell / 2 ? G.near[k] : -1;
    if (oi < 0) continue;
    const ob = G.obstacles[oi];
    if (ob.type === "wall" || ob.type === "stairs" || (ob.fixed && ob.type !== "column")) hard[k] = 1;
  }

  mark("zones");
  // sight lines from the sales desks (staff) and the entrance
  const sight = {desk: [], entrance: []};
  const blockers = W.sightBlockers(G, {minHeight: A.sightBlockFt});
  for (const a of desks) {
    const g = W.itemGeo(a.item), pts = [[g.x, g.y]];
    if (a.item.type === "ring") for (const s of [-1, 1]) pts.push(toWorld(g, s * g.w / 4, 0));
    for (const [x, y] of pts) {
      if (blockers.some(b => W.obDist(b, x, y) <= 0)) continue;
      sight.desk.push({id: a.id, name: a.name, kind: "desk", vis: W.visibility(blockers, x, y, T.sightlineFt)});
    }
  }
  for (const a of anchors.front_door) sight.entrance.push({id: a.id, name: a.name, kind: "entrance", vis: W.visibility(blockers, a.x, a.y, T.sightlineFt)});

  mark("sight");
  // main-path widths and choke points
  const widthCache = new Float32Array(G.N).fill(NaN), sideCache = new Map();
  const widthOf = k => {
    if (Number.isNaN(widthCache[k])) { const w = W.widthAt(G, k); widthCache[k] = w.width; sideCache.set(k, [w.a ? w.a.i : null, w.b ? w.b.i : null]); }
    return widthCache[k];
  };
  const chokes = chokePoints(G, routes, widthOf, sideCache, T, A);
  // narrow aisles anywhere customers go (the principle filters them to the customer zone)
  const aisleMask = new Uint8Array(G.N);
  for (let k = 0; k < G.N; k++) if (custRoom[k]) aisleMask[k] = 1;
  mark("chokes");
  const aisleCells = W.ridgeCells(G, aisleMask);
  const narrow = W.narrowAisles(G, {maxWidth: T.aisleMinFt, minWidth: A.minAisleFt, mask: aisleMask, ridges: aisleCells});
  mark("aisles");

  const env = {G, anchors, blocked, missing, mainComp, mainCells, fields: {front: fFront, will: fWill, yard: fYard}, routes, dPath, heat, custRoom,
    zones, keep, hard, sight, chokes, narrow, aisleCells, widthOf, floors, ms: now() - t0};
  // the nearest-yard-door walk for every cell
  env.yardDist = new Float32Array(G.N).fill(Infinity);
  for (const f of fYard) for (let k = 0; k < G.N; k++) if (f.dist[k] < env.yardDist[k]) env.yardDist[k] = f.dist[k];
  // how deep "the back" is: the walk from the front door to the yard doors / will-call
  const far = [...anchors.yard_doors, ...anchors.will_call].map(a => (fFront ? fFront.dist[a.k] : Infinity)).filter(Number.isFinite);
  env.backRef = far.length ? Math.max(...far) : 0;
  mark("rest");
  env.timings = timings;
  ENV_CACHE = {key, env};
  return env;
}
/** A point-in-rectangle test for one item (trigonometry done once). */
function rectTest(g) {
  const r = -g.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), hw = g.w / 2 + 1e-6, hd = g.d / 2 + 1e-6;
  return (x, y) => { const dx = x - g.x, dy = y - g.y; return Math.abs(dx * c - dy * s) <= hw && Math.abs(dx * s + dy * c) <= hd; };
}
/** The test for the floor area (room) under a point, or null when the point is on no floor item. */
function roomTest(env, x, y) {
  for (const g of env.floors || []) { const t = rectTest(g); if (t(x, y)) return t; }
  return null;
}
/** Mean of f(k) over the walkable cells under a block's samples with its centre at (cx, cy); null when none. */
function sampleMean(G, blk, cx, cy, f) {
  let s = 0, n = 0;
  for (const [dx, dy] of blk.samples) {
    const k = W.cellAt(G, cx + dx, cy + dy);
    if (k < 0 || !G.walk[k]) continue;
    const v = f(k);
    if (v === null) return null;
    s += v; n++;
  }
  return n ? s / n : null;
}

/** Narrow spots along the main routes, merged across routes. */
function chokePoints(G, routes, widthOf, sideCache, T, A) {
  const spots = [];
  const tol = 0.1; // ft (about an inch): below what the survey can tell apart
  const classify = (k, w) => {
    if (!Number.isFinite(w)) return null;
    if (G.doorway[k] >= 0) return w < A.doorMinFt - tol ? "high" : null;
    return w < T.adaMinFt - tol ? "high" : w < T.aisleMinFt - tol ? "medium" : w < T.mainAisleMinFt - tol ? "low" : null;
  };
  for (const r of routes) {
    if (!r.cells) continue;
    let cur = null;
    r.minWidthFt = Infinity;
    for (const k of r.cells) {
      const w = widthOf(k);
      if (w < r.minWidthFt) r.minWidthFt = w;
      const sev = classify(k, w);
      if (!sev) { cur = null; continue; }
      if (cur && cur.sevRank >= SEVERITY[sev] - 1) {
        cur.cells.push(k);
        if (w < cur.widthFt) { cur.widthFt = w; cur.k = k; cur.severity = sev; cur.sevRank = SEVERITY[sev]; }
        continue;
      }
      cur = {k, widthFt: w, severity: sev, sevRank: SEVERITY[sev], cells: [k], routes: [r.label], doorway: G.doorway[k] >= 0 ? G.passages[G.doorway[k]].id : null};
      spots.push(cur);
    }
  }
  // merge the same spot seen from several routes
  const out = [];
  for (const s of spots.sort((a, b) => a.widthFt - b.widthFt)) {
    const [x, y] = W.cellCentre(G, s.k);
    const sides = sideCache.get(s.k) || [null, null], pair = [...sides].sort().join(",");
    const dup = out.find(o => Math.hypot(o.x - x, o.y - y) < 3 || o.cellSet.has(s.k) || (o.pair === pair && Math.hypot(o.x - x, o.y - y) < 10));
    if (dup) { for (const r of s.routes) if (!dup.routes.includes(r)) dup.routes.push(r); continue; }
    out.push({x: r2(x), y: r2(y), k: s.k, widthFt: r2(s.widthFt), severity: s.severity, routes: s.routes.slice(), lengthFt: s.cells.length * G.cell,
      doorway: s.doorway, sides, pair, cellSet: new Set(s.cells)});
  }
  for (const o of out) { delete o.cellSet; delete o.pair; }
  return out;
}

/* ---------- department blocks ---------- */
function blockShape(it) {
  const local = it.shape === "poly" && Array.isArray(it.pts) && it.pts.length >= 3 ? it.pts : [[-it.w / 2, -it.d / 2], [it.w / 2, -it.d / 2], [it.w / 2, it.d / 2], [-it.w / 2, it.d / 2]];
  return {local, outline: local.map(([a, b]) => toWorld(it, a, b)), area: polygonArea(local)};
}
/** Sample offsets (from the block centre, world orientation) covering a shape: ~1 per sq ft up to ~160, plus its corners and edge midpoints. */
function samplesFor(it, outline) {
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const area = Math.max(1, (x1 - x0) * (y1 - y0)), step = Math.max(0.75, Math.sqrt(area / 160));
  const out = [];
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) if (W.pointInPolygon(x, y, outline)) out.push([x - it.x, y - it.y]);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    // corners and edge points pulled 0.1 ft inside so a block that just touches a wall still fits
    const cx = it.x, cy = it.y;
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t, L = Math.hypot(cx - px, cy - py) || 1;
      out.push([px + (cx - px) * 0.1 / L - cx, py + (cy - py) * 0.1 / L - cy]);
    }
  }
  return out;
}
function rasterPoly(G, poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), out = [];
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.floor((Math.max(...xs) - G.x0) / G.cell));
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - G.y0) / G.cell)), j1 = Math.min(G.ny - 1, Math.floor((Math.max(...ys) - G.y0) / G.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * G.nx + i, [x, y] = W.cellCentre(G, k);
    if (W.pointInPolygon(x, y, poly)) out.push(k);
  }
  return out;
}
function prepareBlocks(env, items, catBy) {
  const G = env.G, blocks = [], mask = new Int16Array(G.N);
  for (const it of items) {
    if (it.type !== "area") continue;
    const cat = catBy.get(it.cat) || null;
    const {local, outline, area} = blockShape(it);
    const cells = rasterPoly(G, outline);
    const b = {idx: blocks.length, id: it.id, it, cat, key: it.cat || null, name: cat ? cat.name : displayName(it), local, outline, area, cells,
      x: it.x, y: it.y, samples: samplesFor(it, outline)};
    b.halfDiag = Math.max(...outline.map(([x, y]) => Math.hypot(x - it.x, y - it.y)));
    for (const k of cells) if (!mask[k]) mask[k] = b.idx + 1;
    blocks.push(b);
  }
  return {list: blocks, mask};
}

/* ---------- placing a block somewhere else ---------- */
/** Is the block (with these sample offsets) allowed with its centre at (cx, cy)? keepMask: 1 entrance zone, 2 doorways. */
function placementOk(ctx, blk, cx, cy, {samples = blk.samples, keepMask = 3, others = true} = {}) {
  const {G, keep, hard} = ctx.env, mask = ctx.blocks.mask;
  for (let q = 0; q < samples.length; q++) {
    const k = W.cellAt(G, cx + samples[q][0], cy + samples[q][1]);
    if (k < 0 || hard[k] || (keep[k] & keepMask)) return false;
    if (others) { const b = mask[k]; if (b && b !== blk.idx + 1) return false; }
  }
  return true;
}
/** The best allowed centre within radius of `around` (lattice of `step` ft on the 6-inch grid). */
function findSpot(ctx, blk, {around = [blk.x, blk.y], radius, step = 2, score, samples = blk.samples, keepMask = 3}) {
  let best = null;
  const ax = snap(around[0]), ay = snap(around[1]), n = Math.floor(radius / step);
  for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
    if (a * a + b * b > n * n) continue;
    const cx = ax + a * step, cy = ay + b * step;
    if (!placementOk(ctx, blk, cx, cy, {samples, keepMask})) continue;
    const s = score(cx, cy);
    if (s === null || s === undefined || !Number.isFinite(s)) continue;
    const move = Math.hypot(cx - blk.x, cy - blk.y), v = s - 0.01 * move;
    if (!best || v > best.v) best = {x: cx, y: cy, s, v, move};
  }
  return best;
}
const moveApply = (blk, x, y) => ({
  op: "move", changes: [{id: blk.id, from: {x: blk.x, y: blk.y}, to: {x: r2(x), y: r2(y)}}],
  text: `Move ${blk.name} ${moveText(x - blk.x, y - blk.y)}`,
});

/** Applies a recommendation's patch to a map: a new map (items replaced), the input untouched. */
export function applyFix(map, apply) {
  if (!map || !apply || !Array.isArray(apply.changes)) return map;
  const byId = new Map(apply.changes.map(c => [c.id, c.to]));
  return {...map, items: (map.items || []).map(it => (byId.has(it.id) ? {...it, ...byId.get(it.id)} : it))};
}

/* ---------- fixtures that pinch a passage ---------- */
/**
 * Moves a movable fixture away from a point by `by` ft when that is safe: still on the floor, not into any
 * other obstacle, and without making any other passage narrower than min(it was, aisleMinFt).
 */
function nudgeFixture(ctx, oi, px, py, by) {
  const {G} = ctx.env, ob = G.obstacles[oi];
  if (!ob || !ob.movable || ob.ring) return null;
  const q = W.obNearest(ob, px, py), L = Math.hypot(q[0] - px, q[1] - py);
  if (L < 1e-6) return null;
  // move along the fixture's own axis closest to "away from the point" (a gondola slides sideways or endways, not diagonally)
  const ux = (q[0] - px) / L, uy = (q[1] - py) / L, along = ux * ob.c + uy * ob.s, across = -ux * ob.s + uy * ob.c;
  const [ax, ay] = Math.abs(along) >= Math.abs(across) ? [Math.sign(along) * ob.c, Math.sign(along) * ob.s] : [-Math.sign(across) * ob.s, Math.sign(across) * ob.c];
  const dx = ax * by, dy = ay * by;
  const moved = {...ob, x: ob.x + dx, y: ob.y + dy, x0: ob.x0 + dx, x1: ob.x1 + dx, y0: ob.y0 + dy, y1: ob.y1 + dy};
  const cs = W.obCorners(moved);
  for (const [x, y] of cs) { const k = W.cellAt(G, x, y); if (k < 0 || !G.floor[k]) return null; }
  const before = W.obCorners(ob), reach = ctx.T.aisleMinFt + by + 1;
  for (const other of G.obstacles) {
    if (other.i === oi || other.x1 < moved.x0 - reach || other.x0 > moved.x1 + reach || other.y1 < moved.y0 - reach || other.y0 > moved.y1 + reach) continue;
    const oc = other.ring ? W.obCorners(other) : other.cs || (other.cs = W.obCorners(other));
    const dAfter = W.polyDist(cs, oc), dBefore = W.polyDist(before, oc);
    if (dAfter <= 0.05) return null;
    if (dAfter < dBefore - 1e-6 && dAfter < ctx.T.aisleMinFt) return null;
  }
  const it = ob.item;
  return {op: "move", changes: [{id: ob.id, from: {x: it.x, y: it.y}, to: {x: r2(it.x + dx), y: r2(it.y + dy)}}],
    text: `Move ${displayName(it)} ${moveText(dx, dy)}`};
}
const obName = (G, i) => (i === null || i === undefined || i < 0 ? "open floor" : displayName(G.obstacles[i].item));
/** Map item ids of obstacles (the floor's edge has none). */
const obIds = (G, list) => list.filter(i => i !== null && i !== undefined && i >= 0 && !G.obstacles[i].edge).map(i => G.obstacles[i].id);

/* ---------- the principles ---------- */
function blocksOf(ctx, keys) {
  const set = new Set(keys);
  return ctx.blocks.list.filter(b => set.has(b.key));
}
const catName = (ctx, key) => (ctx.catBy.get(key) || {}).name || key;
function rec(ctx, r) { ctx.recs.push(r); }

function pDecompression(ctx) {
  const {env, T} = ctx, zs = env.zones.decompression;
  if (!zs.length) return na("No front door was found on this map, so there is no entrance zone to check.");
  const findings = [];
  let occTotal = 0, cellsTotal = 0;
  const G = env.G, cellA = G.cell * G.cell;
  for (const z of zs) {
    const occ = new Set(), perBlock = new Map(), perFix = new Map(), fixed = new Set();
    for (const k of z.cells) {
      const b = ctx.blocks.mask[k];
      if (b) { occ.add(k); perBlock.set(b - 1, (perBlock.get(b - 1) || 0) + 1); }
      const oi = G.inside[k];
      if (oi >= 0) {
        const ob = G.obstacles[oi];
        if (ob.movable) { occ.add(k); perFix.set(oi, (perFix.get(oi) || 0) + 1); } else fixed.add(displayName(ob.item));
      }
    }
    occTotal += occ.size; cellsTotal += z.cells.length;
    for (const [bi, n] of perBlock) {
      const blk = ctx.blocks.list[bi], area = n * cellA, share = n / z.cells.length;
      findings.push({severity: share > 0.25 ? "high" : "medium", text: `${blk.name} covers ${sq(area)} of the entrance zone inside ${z.name}.`, ids: [blk.id], region: z.polygon});
      let apply = pushOut(ctx, blk, z.frame, z.depth);
      rec(ctx, {principleId: "decompression", severity: share > 0.25 ? "high" : "medium", title: `Move ${blk.name} out of the entrance zone`,
        why: `The first ${ft(z.depth)} inside ${z.name} should stay open so shoppers can slow down and look around; ${blk.name} takes ${sq(area)} of it.`
          + (apply ? ` ${apply.text} clears it.` : " No clear spot nearby: move it by hand."),
        show: {ids: [blk.id], region: z.polygon}, apply});
    }
    for (const [oi, n] of perFix) {
      const ob = G.obstacles[oi], nm = displayName(ob.item);
      findings.push({severity: "low", text: `${nm} stands in the entrance zone (${sq(n * cellA)}).`, ids: [ob.id], region: z.polygon});
      rec(ctx, {principleId: "decompression", severity: "low", title: `Clear ${nm} from the entrance zone`,
        why: `${nm} takes ${sq(n * cellA)} of the open zone inside ${z.name}. Small fixtures here are passed by before shoppers have slowed down.`,
        show: {ids: [ob.id], region: z.polygon}});
    }
    if (fixed.size) findings.push({severity: "info", text: `Fixed in the zone (not counted): ${list([...fixed])}.`});
  }
  const occFrac = cellsTotal ? occTotal / cellsTotal : 0;
  const z = zs[0];
  return {applicable: true, score: Math.round(100 * (1 - occFrac) ** 2), findings,
    reasoning: `The entrance zone is the first ${ft(z.depth)} inside ${z.name}, ${ft(2 * z.frame.hw)} wide (${sq(z.areaSqft)} of floor). `
      + (occFrac > 0 ? `${pct(occFrac)} of it holds merchandise.` : "It is clear.")};
}
/** Moves a block out of a zone of a door frame (s within +-hw, t within [0, depth]): the shortest allowed push, else the nearest allowed spot. */
function pushOut(ctx, blk, fr, depth) {
  const loc = blk.outline.map(([x, y]) => toFrame(fr, x, y));
  const minT = Math.min(...loc.map(p => p[1])), minS = Math.min(...loc.map(p => p[0])), maxS = Math.max(...loc.map(p => p[0]));
  const cands = [[0, depth + 0.5 - minT], [fr.hw + 0.5 - minS, 0], [-fr.hw - 0.5 - maxS, 0]].filter(([s, t]) => Math.abs(s) + Math.abs(t) > 1e-6)
    .sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  for (const [s, t] of cands) {
    const x = snap(blk.x + fr.u[0] * s + fr.n[0] * t), y = snap(blk.y + fr.u[1] * s + fr.n[1] * t);
    for (const [ex, ey] of [[0, 0], [fr.n[0] * 0.5, fr.n[1] * 0.5], [fr.n[0], fr.n[1]]]) {
      if (placementOk(ctx, blk, x + ex, y + ey)) return moveApply(blk, x + ex, y + ey);
    }
  }
  const best = findSpot(ctx, blk, {radius: ctx.A.searchRadiusFt, score: () => 0});
  return best ? moveApply(blk, best.x, best.y) : null;
}

function pPowerWall(ctx) {
  const {env, A, T} = ctx, z = env.zones.decompression[0];
  if (!z) return na("No front door was found on this map, so left and right of the entrance can't be told apart.");
  const keys = ctx.cfg.roles.powerWall || [];
  const placed = keys.filter(k => blocksOf(ctx, [k]).length);
  if (!placed.length) return na(`${list(keys.map(k => catName(ctx, k)))} ${keys.length > 1 ? "aren't" : "isn't"} placed yet.`);
  const fr = z.frame, findings = [], scores = [];
  for (const key of placed) {
    const bl = blocksOf(ctx, [key]);
    let n = 0, right = 0, near = 0, sSum = 0;
    for (const b of bl) for (const k of b.cells) {
      const [x, y] = W.cellCentre(env.G, k), [s, t] = toFrame(fr, x, y);
      n++; sSum += s;
      if (s > 0) right++;
      if (Math.hypot(s, t) <= T.sightlineFt) near++;
    }
    const rf = n ? right / n : 0, nf = n ? near / n : 0, sc = Math.round(100 * (A.rightShare * rf + (1 - A.rightShare) * nf));
    scores.push(sc);
    const side = n ? sSum / n : 0;
    findings.push({severity: sc < 40 ? "medium" : sc < 70 ? "low" : "info", ids: bl.map(b => b.id),
      text: `${catName(ctx, key)}: ${pct(rf)} of it is right of the front door (on average ${ft(Math.abs(side))} to the ${side >= 0 ? "right" : "left"}), ${pct(nf)} within ${ft(T.sightlineFt)} of it.`});
    if (sc < 60) {
      const s0 = fr.hw, region = [fromFrame(fr, s0, 0), fromFrame(fr, s0 + 30, 0), fromFrame(fr, s0 + 30, 30), fromFrame(fr, s0, 30)].map(p => p.map(r2));
      // a concrete move when the department is one block and there is room for it right of the entrance (outside the entrance zone)
      let apply;
      if (bl.length === 1) {
        const b = bl[0];
        const at = (cx, cy) => {
          let n = 0, right = 0, near = 0;
          for (const [dx, dy] of b.samples) { const [s, t] = toFrame(fr, cx + dx, cy + dy); n++; if (s > 0) right++; if (Math.hypot(s, t) <= T.sightlineFt) near++; }
          return n ? 100 * (A.rightShare * right / n + (1 - A.rightShare) * near / n) : null;
        };
        const around = fromFrame(fr, fr.hw + A.decompressionSideFt + b.halfDiag, z.depth + b.halfDiag);
        const spot = findSpot(ctx, b, {around, radius: A.searchRadiusFt, step: 3, score: at});
        if (spot && spot.s >= 80 && spot.s >= sc + 20) apply = moveApply(b, spot.x, spot.y);
      }
      rec(ctx, {principleId: "power_wall", severity: sc < 40 ? "medium" : "low", title: `Consider the right-hand side of the entrance for ${catName(ctx, key)}`,
        why: `Most shoppers drift right after they come in, so the first wall on the right is the most-seen wall in the store. Only ${pct(rf)} of ${catName(ctx, key)} is on that side.`
          + (apply ? ` ${apply.text} puts it there.` : ""),
        show: {ids: bl.map(b => b.id), region, points: [fr.f.map(r2)]}, apply});
    }
  }
  const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return {applicable: true, score, findings,
    reasoning: `Right of the entrance means right of the line straight in from ${z.name}. Score: ${pct(A.rightShare)} for being on the right, ${pct(1 - A.rightShare)} for being within ${ft(T.sightlineFt)} of the door.`};
}

function pDestination(ctx) {
  const {env, A, T, G} = ctx, keys = ctx.cfg.roles.destination || [];
  if (!env.fields.front) return na("No front door was found on this map, so the walk into the store can't be measured.");
  const placed = keys.filter(k => blocksOf(ctx, [k]).length);
  if (!placed.length) return na(`${list(keys.map(k => catName(ctx, k)))} ${keys.length > 1 ? "aren't" : "isn't"} placed yet.`);
  const fd = env.fields.front.dist, ref = env.backRef || maxFinite(fd, G, env.mainComp) * 0.8;
  if (!(ref > 0)) return na("The yard doors and will-call can't be reached from the front door on this map.");
  const findings = [], scores = [];
  for (const key of placed) {
    const bl = blocksOf(ctx, [key]);
    let sum = 0, n = 0, kNear = -1, dNear = Infinity;
    for (const b of bl) for (const k of b.cells) if (Number.isFinite(fd[k])) { sum += fd[k]; n++; if (fd[k] < dNear) { dNear = fd[k]; kNear = k; } }
    if (!n) { findings.push({severity: "high", text: `${catName(ctx, key)} can't be reached on foot from the front door.`, ids: bl.map(b => b.id)}); scores.push(0); continue; }
    const depth = sum / n, frac = depth / ref, ds = clamp01((frac - 0.25) / Math.max(0.05, A.backShare - 0.25));
    // the departments a shopper walks past on the way there (within 2 ft either side of the route)
    const route = W.traceRoute(env.fields.front, kNear) || [], passed = new Set(), own = new Set(bl.map(b => b.idx + 1)), R = Math.round(2 / G.cell);
    for (let q = 0; q < route.length; q += 2) {
      const k = route[q], i = k % G.nx, j = (k - i) / G.nx;
      for (let dj = -R; dj <= R; dj += 2) for (let di = -R; di <= R; di += 2) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= G.nx || jj >= G.ny) continue;
        const b = ctx.blocks.mask[jj * G.nx + ii];
        if (b && !own.has(b)) { const blk = ctx.blocks.list[b - 1]; if (blk.key !== key) passed.add(blk.name); }
      }
    }
    const ps = A.passByTarget > 0 ? clamp01(passed.size / A.passByTarget) : 1;
    const sc = Math.round(100 * (0.7 * ds + 0.3 * ps));
    scores.push(sc);
    findings.push({severity: sc < 40 ? "medium" : sc < 70 ? "low" : "info", ids: bl.map(b => b.id),
      text: `${catName(ctx, key)} is on average a ${ft(depth)} walk in from the front door (${pct(frac)} of the way to the yard doors); the walk there passes ${passed.size ? list([...passed]) : "no other department"}.`});
    if (sc < 60) {
      const deep = deepestPoint(env, G);
      // a concrete move when the department is one block: the deepest allowed spot in the room it is in now
      // (the deepest point of the store may be another room, e.g. the warehouse), if that is far enough back
      let apply;
      if (bl.length === 1) {
        const b = bl[0], room = roomTest(env, b.x, b.y);
        const at = (cx, cy) => (room && !room(cx, cy) ? null : sampleMean(G, b, cx, cy, k => (Number.isFinite(fd[k]) ? fd[k] : null)));
        const spots = [findSpot(ctx, b, {radius: A.searchRadiusFt, step: 3, score: at})];
        if (deep) spots.push(findSpot(ctx, b, {around: deep, radius: A.searchRadiusFt, step: 3, score: at}));
        const spot = spots.filter(Boolean).sort((p, q) => q.s - p.s)[0];
        if (spot && spot.s / ref >= A.backShare && spot.s > depth + 0.1 * ref) apply = moveApply(b, spot.x, spot.y);
      }
      rec(ctx, {principleId: "destination_back", severity: sc < 40 ? "medium" : "low", title: `Move ${catName(ctx, key)} further back`,
        why: `People come in for ${catName(ctx, key)}; deep in the store it pulls them past other departments. Now it sits ${pct(frac)} of the way back and the walk passes ${passed.size} department${passed.size === 1 ? "" : "s"}.`
          + (apply ? ` ${apply.text}: ${pct(Math.min(1, (depth + 0.1 * ref) / ref))} or more of the way back.` : ""),
        show: {ids: bl.map(b => b.id), points: deep ? [deep] : []}, apply});
    }
  }
  return {applicable: true, score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), findings,
    reasoning: `"At the back" is measured as the walk from the front door: ${ft(ref)} to the farthest yard or will-call door is 100%. Full marks from ${pct(A.backShare)} of the way back; 30% of the score is for walking past ${A.passByTarget} other departments on the way.`};
}
function maxFinite(arr, G, comp) { let m = 0; for (let k = 0; k < G.N; k++) if (G.comp[k] === comp && Number.isFinite(arr[k]) && arr[k] > m) m = arr[k]; return m; }
function deepestPoint(env, G) {
  const fd = env.fields.front.dist;
  let best = -1, bd = -1;
  for (let k = 0; k < G.N; k++) if (env.custRoom[k] && Number.isFinite(fd[k]) && fd[k] <= env.backRef && fd[k] > bd && G.clear[k] >= 3) { bd = fd[k]; best = k; }
  return best >= 0 ? W.cellCentre(G, best).map(r2) : null;
}

/** Visible share of a block's samples from the desks and the entrance, with its centre at (cx, cy). */
function visShare(ctx, blk, cx, cy, max = 80) {
  const {G, sight} = ctx.env;
  let n = 0, d = 0, e = 0;
  const step = Math.max(1, Math.floor(blk.samples.length / max));
  for (let q = 0; q < blk.samples.length; q += step) {
    const x = cx + blk.samples[q][0], y = cy + blk.samples[q][1], k = W.cellAt(G, x, y);
    if (k < 0 || !G.floor[k] || G.inside[k] >= 0) continue; // inside a fixture: its faces are what is seen
    n++;
    if (sight.desk.some(v => W.canSee(v.vis, x, y))) d++;
    if (sight.entrance.some(v => W.canSee(v.vis, x, y))) e++;
  }
  return n ? {desk: d / n, door: e / n} : {desk: 0, door: 0};
}
function pSightlines(ctx) {
  const {env, A, T} = ctx, deps = ctx.cfg.departments;
  if (!env.sight.desk.length && !env.sight.entrance.length) return na("No sales desk or front door was found on this map.");
  const keys = Object.keys(deps).filter(k => deps[k].margin === "high" || deps[k].theftProne);
  const placed = keys.filter(k => blocksOf(ctx, [k]).length);
  if (!placed.length) return na(`None of the high-margin or theft-prone departments (${list(keys.map(k => catName(ctx, k)))}) is placed yet.`);
  const findings = [], scores = [], wD = A.deskSightShare;
  for (const key of placed) {
    let aSum = 0, sSum = 0;
    for (const b of blocksOf(ctx, [key])) {
      const v = visShare(ctx, b, b.x, b.y), sc = 100 * (wD * v.desk + (1 - wD) * v.door);
      aSum += b.area; sSum += sc * b.area;
      findings.push({severity: sc < 40 ? "high" : sc < 70 ? "medium" : "info", ids: [b.id],
        text: `${b.name}: ${pct(v.desk)} can be seen from a sales desk, ${pct(v.door)} from the entrance (within ${ft(T.sightlineFt)}).`});
      if (v.desk < 0.5 || sc < 40) {
        let best = findSpot(ctx, b, {radius: A.searchRadiusFt, step: 3, score: (cx, cy) => { const w = visShare(ctx, b, cx, cy, 32); return 100 * (wD * w.desk + (1 - wD) * w.door); }});
        if (best) { const w = visShare(ctx, b, best.x, best.y); best = {...best, s: 100 * (wD * w.desk + (1 - wD) * w.door)}; }
        const ok = best && best.s >= sc + 15 && best.s >= 50;
        rec(ctx, {principleId: "sightlines", severity: sc < 40 ? "high" : "medium", title: `Move ${b.name} into view of the sales desks`,
          why: `${b.name} is ${deps[key].margin === "high" ? "high-margin" : "theft-prone"} (an assumption you can change); staff at the desks can see ${pct(v.desk)} of it.`
            + (ok ? ` ${moveText(best.x - b.x, best.y - b.y)} from here they would see enough to score ${Math.round(best.s)} instead of ${Math.round(sc)}.` : " No allowed spot nearby is clearly better: consider lower fixtures or turning the gondolas to face the desk."),
          show: {ids: [b.id], points: env.sight.desk.map(v => [r2(v.vis.x), r2(v.vis.y)])}, apply: ok ? moveApply(b, best.x, best.y) : undefined});
      }
    }
    scores.push(aSum ? sSum / aSum : 0);
  }
  return {applicable: true, score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), findings,
    reasoning: `Departments marked high-margin or theft-prone (${list(placed.map(k => catName(ctx, k)))}) should be in sight of staff. Visibility is ray-cast from ${env.sight.desk.length} desk viewpoint${env.sight.desk.length === 1 ? "" : "s"} and the entrance, blocked by walls, doors and fixtures at least ${ft(A.sightBlockFt)} tall. Score: ${pct(wD)} desks, ${pct(1 - wD)} entrance.`};
}

function pBulky(ctx) {
  const {env, A, T, G} = ctx, keys = ctx.cfg.roles.bulky || [];
  if (!env.anchors.yard_doors.length) return na("No yard or warehouse doors were found on this map.");
  const placed = keys.filter(k => blocksOf(ctx, [k]).length);
  if (!placed.length) return na(`${list(keys.map(k => catName(ctx, k)))} ${keys.length > 1 ? "aren't" : "isn't"} placed yet.`);
  const yd = env.yardDist, near = T.anchorFt, far = 4 * T.anchorFt;
  const distAt = (b, cx, cy) => {
    let m = Infinity;
    for (const [dx, dy] of b.samples) { const k = W.cellAt(G, cx + dx, cy + dy); if (k >= 0 && yd[k] < m) m = yd[k]; }
    return m;
  };
  const scoreOf = d => (d <= near ? 100 : Math.round(100 * clamp01(1 - (d - near) / (far - near))));
  const findings = [], scores = [];
  for (const key of placed) {
    const bl = blocksOf(ctx, [key]);
    let best = null;
    for (const b of bl) { const d = distAt(b, b.x, b.y), s = scoreOf(d); if (!best || s > best.s) best = {b, d, s}; }
    scores.push(best.s);
    findings.push({severity: best.s < 40 ? "medium" : best.s < 70 ? "low" : "info", ids: bl.map(b => b.id),
      text: Number.isFinite(best.d) ? `${catName(ctx, key)} is a ${ft(best.d)} walk from the nearest yard door.` : `${catName(ctx, key)} can't be reached from the yard doors.`});
    if (best.s < 60) {
      const b = best.b, door = env.anchors.yard_doors.reduce((m, a) => (Math.hypot(a.x - b.x, a.y - b.y) < Math.hypot(m.x - b.x, m.y - b.y) ? a : m));
      const spot = findSpot(ctx, b, {around: [door.x, door.y], radius: near + b.halfDiag, step: 1.5, score: (cx, cy) => -distAt(b, cx, cy)});
      const ok = spot && -spot.s <= near;
      rec(ctx, {principleId: "bulky_near_yard", severity: best.s < 40 ? "medium" : "low", title: `Move ${b.name} near the yard doors`,
        why: `Heavy, bulky stock loads straight out when it sits by the yard; ${b.name} is a ${ft(best.d)} walk from ${door.name}.`
          + (ok ? ` There is room ${ft(-spot.s)} from it.` : " There is no free spot by the doors big enough for it: consider a smaller second block for the bulky stock."),
        show: {ids: [b.id], points: [[r2(door.x), r2(door.y)]]}, apply: ok ? moveApply(b, spot.x, spot.y) : undefined});
    }
  }
  return {applicable: true, score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), findings,
    reasoning: `Bulky departments (${list(placed.map(k => catName(ctx, k)))}) score full marks within a ${ft(near)} walk of a yard or warehouse door, nothing beyond ${ft(far)}; the closest block of each counts.`};
}

function pAdjacency(ctx) {
  const {T, A} = ctx, pairs = (ctx.catalog.adjacency || []).filter(([a, b]) => ctx.catBy.has(a) && ctx.catBy.has(b));
  const evald = pairs.filter(([a, b]) => blocksOf(ctx, [a]).length && blocksOf(ctx, [b]).length);
  if (!evald.length) return na("Place both departments of at least one catalog pair (e.g. Bits & Blades and Power Tools) to check adjacency.");
  const isOwner = (a, b) => OWNER_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const gapOf = (A1, B1) => Math.min(...A1.flatMap(p => B1.map(q => W.polyDist(p.outline, q.outline))));
  const findings = [];
  let wSum = 0, sSum = 0;
  for (const [a, b] of evald) {
    const bA = blocksOf(ctx, [a]), bB = blocksOf(ctx, [b]), gap = gapOf(bA, bB), w = isOwner(a, b) ? 2 : 1;
    const s = gap <= T.nearFt ? 1 : clamp01(1 - (gap - T.nearFt) / (2 * T.nearFt));
    wSum += w; sSum += w * s;
    const nA = catName(ctx, a), nB = catName(ctx, b);
    if (s >= 1) { findings.push({severity: "info", text: `${nA} and ${nB} are neighbours (${ft(gap)} apart).`, ids: [...bA, ...bB].map(x => x.id)}); continue; }
    findings.push({severity: isOwner(a, b) ? "high" : "medium", text: `${nA} and ${nB} are ${ft(gap)} apart (next to means within ${ft(T.nearFt)}).`, ids: [...bA, ...bB].map(x => x.id)});
    // move the smaller department (when it is one block) next to the other
    const [mKey, pKey] = bA.reduce((t, x) => t + x.area, 0) <= bB.reduce((t, x) => t + x.area, 0) ? [a, b] : [b, a];
    const movers = blocksOf(ctx, [mKey]), partners = blocksOf(ctx, [pKey]);
    let apply;
    if (movers.length === 1) {
      const m = movers[0], p = partners.reduce((x, y) => (y.area > x.area ? y : x));
      const myPairs = pairs.filter(([x, y]) => x === mKey || y === mKey).map(([x, y]) => (x === mKey ? y : x)).filter(k => k !== pKey && blocksOf(ctx, [k]).length);
      const metNow = myPairs.filter(k => gapOf([m], blocksOf(ctx, [k])) <= T.nearFt).length;
      const moved = (cx, cy) => ({outline: m.outline.map(([x, y]) => [x + cx - m.x, y + cy - m.y])});
      const spot = findSpot(ctx, m, {around: [p.x, p.y], radius: Math.min(A.searchRadiusFt * 2, p.halfDiag + m.halfDiag + T.nearFt), step: 2, score: (cx, cy) => {
        const mm = moved(cx, cy);
        if (Math.min(...partners.map(q => W.polyDist(mm.outline, q.outline))) > T.nearFt) return null;
        const met = myPairs.filter(k => Math.min(...blocksOf(ctx, [k]).map(q => W.polyDist(mm.outline, q.outline))) <= T.nearFt).length;
        return met >= metNow ? met : null;
      }});
      if (spot) apply = moveApply(m, spot.x, spot.y);
    }
    rec(ctx, {principleId: "adjacency", severity: isOwner(a, b) ? "high" : "medium", title: `Put ${nA} next to ${nB}`,
      why: `They are shopped together (catalog adjacency${isOwner(a, b) ? ", named in the owner's rules" : ""}) but are ${ft(gap)} apart.` + (apply ? ` ${apply.text} keeps its other neighbours.` : ""),
      show: {ids: [...bA, ...bB].map(x => x.id)}, apply});
  }
  return {applicable: true, score: Math.round((100 * sSum) / wSum), findings,
    reasoning: `${evald.length} catalog pair${evald.length === 1 ? "" : "s"} placed; a pair passes within ${ft(T.nearFt)} and scores nothing beyond ${ft(3 * T.nearFt)}. The owner's pairs (Bits & Blades with Power Tools, Paint with Decking) count double.`};
}

function pAisles(ctx) {
  const {env, T, G} = ctx;
  const inZone = k => env.custRoom[k] && (env.dPath[k] <= ctx.A.customerZoneFt || ctx.blocks.mask[k] > 0);
  const spots = env.narrow.filter(s => s.lengthFt >= ctx.A.minAisleLenFt && s.cells.some(inZone));
  let ridge = 0;
  for (const k of env.aisleCells) if (inZone(k)) ridge++;
  const findings = [];
  let badLen = 0, nHigh = 0;
  spots.forEach((s, idx) => {
    const sev = s.widthFt < T.adaMinFt ? "high" : "medium";
    if (sev === "high") nHigh++;
    badLen += s.lengthFt * (sev === "high" ? 2 : 1);
    const names = s.sides.map(i => obName(G, i));
    findings.push({severity: sev, text: `${ft(s.widthFt)} between ${names[0]} and ${names[1]} for about ${ft(Math.max(s.lengthFt, G.cell))}${sev === "high" ? " (under the 36-inch ADA minimum)" : ""}.`,
      points: [[r2(s.x), r2(s.y)]], ids: obIds(G, s.sides)});
    if (idx < 8) {
      const need = T.aisleMinFt - s.widthFt + 0.25;
      const apply = s.sides.map(i => (i >= 0 ? nudgeFixture(ctx, i, s.x, s.y, snap(need + 0.24)) : null)).find(Boolean);
      rec(ctx, {principleId: "aisle_widths", severity: sev, title: `Widen the aisle between ${names[0]} and ${names[1]}`,
        why: `It is ${ft(s.widthFt)} wide; aisles should be at least ${ft(T.aisleMinFt)} and never under 36 in (ADA).` + (apply ? ` ${apply.text} makes it ${ft(T.aisleMinFt)}.` : ""),
        show: {points: [[r2(s.x), r2(s.y)]], ids: obIds(G, s.sides)}, apply: apply || undefined});
    }
  });
  const aisleLen = Math.max(1, ridge * G.cell);
  const score = spots.length ? Math.round(100 * clamp01(1 - badLen / aisleLen)) : 100;
  return {applicable: true, score, findings,
    reasoning: spots.length
      ? `${spots.length} narrow spot${spots.length === 1 ? "" : "s"} where customers shop (${nHigh} under the ADA 36 in). Widths are measured from the obstacle on one side to the one on the other; gaps under ${ft(ctx.A.minAisleFt)} are not counted as aisles. The score is the share of aisle length that is wide enough (spots under 36 in count double).`
      : `Every aisle where customers shop is at least ${ft(T.aisleMinFt)} wide.`};
}

function pChokes(ctx) {
  const {env, T, G} = ctx;
  if (!env.routes.length && !env.blocked.length) return na("No main routes: the front door, sales desks, will-call and yard doors were not found on this map.");
  const findings = [];
  let pen = 0;
  for (const b of env.blocked) {
    pen += 30;
    findings.push({severity: "high", text: `${b.name} can't be reached from the front door: nobody can walk up to it.`, ids: [b.id]});
    rec(ctx, {principleId: "choke_points", severity: "high", title: `Open a route to ${b.name}`,
      why: `Every way to ${b.name} is blocked (a fixture or department in front of it, or no opening into its room).`, show: {ids: [b.id], points: [[r2(b.x), r2(b.y)]]}});
  }
  for (const r of env.routes) if (!r.cells) {
    pen += 30;
    findings.push({severity: "high", text: `No walkable route from ${r.from.name} to ${r.to.name}.`, ids: [r.from.id, r.to.id]});
    rec(ctx, {principleId: "choke_points", severity: "high", title: `Open a route from ${r.from.name} to ${r.to.name}`,
      why: "Something blocks every way between them (a fixture across a doorway or an aisle).", show: {ids: [r.from.id, r.to.id], points: [[r2(r.from.x), r2(r.from.y)], [r2(r.to.x), r2(r.to.y)]]}});
  }
  env.chokes.forEach((c, idx) => {
    pen += c.severity === "high" ? 20 : c.severity === "medium" ? 10 : 4;
    const names = c.sides.map(i => obName(G, i)), door = c.doorway ? G.passages.find(p => p.id === c.doorway) : null, doorName = door ? displayName(door.src) : "";
    const where = door ? `${doorName} (between ${names[0]} and ${names[1]})` : `${names[0]} and ${names[1]}`;
    const goal = c.doorway ? ctx.A.doorMinFt : T.mainAisleMinFt;
    findings.push({severity: c.severity, text: `${ft(c.widthFt)} wide at ${where} on the way from ${list(c.routes.slice(0, 3))}${c.routes.length > 3 ? " and more" : ""}.`, points: [[c.x, c.y]],
      ids: obIds(G, c.sides).concat(door ? [door.id] : [])});
    if (idx < 10) {
      const want = (c.doorway ? ctx.A.doorMinFt : T.mainAisleMinFt) - c.widthFt;
      const apply = want > 0 ? c.sides.map(i => (i !== null && i >= 0 ? nudgeFixture(ctx, i, c.x, c.y, snap(want + 0.24)) : null)).find(Boolean) : null;
      rec(ctx, {principleId: "choke_points", severity: c.severity, title: door ? `Clear the way through ${doorName}` : `Widen the main path between ${names[0]} and ${names[1]}`,
        why: `${ft(c.widthFt)} wide on a main path (${c.routes.length} of the store's main trips use it); ${c.doorway ? `a door needs at least ${ft(ctx.A.doorMinFt)} clear (ADA 32 in)` : `main aisles should be at least ${ft(T.mainAisleMinFt)}`}.` + (apply ? ` ${apply.text} gives ${ft(goal)}.` : ` Target: ${ft(goal)}.`),
        show: {points: [[c.x, c.y]], ids: obIds(G, c.sides).concat(door ? [door.id] : [])}, apply: apply || undefined});
    }
  });
  const ok = env.routes.filter(r => r.cells).length;
  return {applicable: true, score: Math.max(0, 100 - pen), findings,
    reasoning: `${ok} of ${env.routes.length} main trips (front door, sales desks, will-call, yard doors) were walked on the 6-inch grid. A narrow spot under ${ft(T.mainAisleMinFt)} costs 4 points, under ${ft(T.aisleMinFt)} 10, under 36 in (or a door under ${ft(ctx.A.doorMinFt)}) 20, a missing route 30.`};
}

function pDoors(ctx) {
  const {env, T, A, G} = ctx, zs = env.zones.doors;
  if (!zs.length) return na("No doors, openings or arches were found on this map.");
  const findings = [], cellA = G.cell * G.cell;
  let wSum = 0, sSum = 0;
  for (const z of zs) {
    const w = z.exterior || z.anchor ? 2 : 1;
    let total = 0, occ = 0;
    const blocks = new Map(), fixtures = new Map();
    for (const side of z.sides) for (const k of side.cells) {
      total++;
      const b = ctx.blocks.mask[k], oi = G.inside[k];
      const mov = oi >= 0 && G.obstacles[oi].movable && G.obstacles[oi].type !== "area";
      if (b || mov) occ++;
      if (b) blocks.set(b - 1, {side, n: ((blocks.get(b - 1) || {}).n || 0) + 1});
      if (mov) fixtures.set(oi, {side, n: ((fixtures.get(oi) || {}).n || 0) + 1});
    }
    // something nipping the corner of the clearance by a square foot or two doesn't count
    const minCells = Math.min(A.minOccupySqft / cellA, 0.1 * total);
    for (const [key, v] of [...blocks]) if (v.n < minCells) { blocks.delete(key); occ -= v.n; }
    for (const [key, v] of [...fixtures]) if (v.n < minCells) { fixtures.delete(key); occ -= v.n; }
    const frac = total ? Math.max(0, occ) / total : 0, s = 1 - clamp01(2 * frac);
    wSum += w; sSum += w * s;
    if (!blocks.size && !fixtures.size) continue;
    const depth = z.sides[0].depth;
    for (const [bi, {side, n}] of blocks) {
      const blk = ctx.blocks.list[bi];
      findings.push({severity: z.exterior || z.anchor ? "high" : "medium", text: `${blk.name} covers ${sq(n * cellA)} of the ${ft(depth)} clearance at ${z.name}.`, ids: [blk.id, z.id], region: side.polygon});
      const apply = pushOut(ctx, blk, side.frame, depth);
      rec(ctx, {principleId: "door_clearance", severity: z.exterior || z.anchor ? "high" : "medium", title: `Keep ${z.name} clear of ${blk.name}`,
        why: `Doors, openings and exits need ${ft(depth)} of open floor in front of them${z.exterior ? " (this one is an exit)" : ""}.` + (apply ? ` ${apply.text} clears it.` : ""),
        show: {ids: [blk.id, z.id], region: side.polygon}, apply: apply || undefined});
    }
    for (const [oi, {side, n}] of fixtures) {
      const ob = G.obstacles[oi], nm = displayName(ob.item);
      findings.push({severity: z.exterior || z.anchor ? "high" : "medium", text: `${nm} stands in the ${ft(depth)} clearance at ${z.name} (${sq(n * cellA)}).`, ids: [ob.id, z.id], region: side.polygon});
      // push the fixture straight out of the zone, along the door's normal
      const loc = W.obCorners(ob).map(([x, y]) => toFrame(side.frame, x, y)), need = depth + 0.25 - Math.min(...loc.map(p => p[1]));
      const far = fromFrame(side.frame, toFrame(side.frame, ob.x, ob.y)[0], -1000);
      const apply = need > 0 && need < 12 ? nudgeFixture(ctx, oi, far[0], far[1], snap(need + 0.24)) : null;
      rec(ctx, {principleId: "door_clearance", severity: z.exterior || z.anchor ? "high" : "medium", title: `Move ${nm} out of the way of ${z.name}`,
        why: `It stands in the ${ft(depth)} that should stay clear in front of ${z.name}.` + (apply ? ` ${apply.text} clears it.` : ""),
        show: {ids: [ob.id, z.id], region: side.polygon}, apply: apply || undefined});
    }
  }
  return {applicable: true, score: Math.round((100 * sSum) / wSum), findings,
    reasoning: `${zs.length} doors, openings and arches checked: ${ft(T.doorClearanceFt)} clear in front of doors, ${ft(A.openingClearanceFt)} in front of openings and arches, on both sides; exits and the main anchors count double. A doorway half covered scores nothing.`};
}

function pCold(ctx) {
  const {env, A, G} = ctx, deps = ctx.cfg.departments, dest = new Set(ctx.cfg.roles.destination || []);
  const coldSpots = env.coldSpots || [];
  if (!ctx.blocks.list.length) return {...na("No departments are placed yet."), findings: coldSpots.map(c => ({severity: "info", text: `Cold spot of about ${sq(c.areaSqft)} (${ft(c.distFt)} from the nearest main path).`, region: c.polygon}))};
  if (!env.routes.some(r => r.cells)) return na("No main routes, so traffic can't be estimated.");
  const findings = [];
  let wSum = 0, pSum = 0;
  for (const b of ctx.blocks.list) {
    let n = 0, cold = 0, heat = 0;
    for (const k of b.cells) if (G.walk[k]) { n++; heat += env.heat[k]; if (!(env.dPath[k] <= A.coldFt)) cold++; }
    if (!n) continue;
    const cf = cold / n, margin = (deps[b.key] || {}).margin || "medium";
    const pw = dest.has(b.key) ? 0 : margin === "high" ? 1 : margin === "medium" ? 0.5 : 0.25;
    wSum += pw * b.area; pSum += pw * b.area * cf;
    if (cf > 0.3) {
      const good = dest.has(b.key);
      findings.push({severity: good ? "info" : margin === "high" ? "high" : "low", ids: [b.id],
        text: `${pct(cf)} of ${b.name} is more than ${ft(A.coldFt)} from the main paths (traffic ${Math.round(100 * heat / n)}/100)${good ? ": fine for a destination department, it pulls people there." : "."}`});
      if (!good && margin === "high") {
        // a concrete move: the busiest allowed spot nearby where at most a tenth of the block is cold
        const at = (cx, cy) => {
          let n = 0, coldN = 0, h = 0;
          for (const [dx, dy] of b.samples) { const k = W.cellAt(G, cx + dx, cy + dy); if (k < 0 || !G.walk[k]) continue; n++; h += env.heat[k]; if (!(env.dPath[k] <= A.coldFt)) coldN++; }
          return !n || coldN / n > 0.1 ? null : 100 * h / n;
        };
        const spot = findSpot(ctx, b, {radius: A.searchRadiusFt, step: 3, score: at});
        const apply = spot ? moveApply(b, spot.x, spot.y) : undefined;
        rec(ctx, {principleId: "cold_corners", severity: "medium", title: `Bring ${b.name} out of the cold corner`,
          why: `${pct(cf)} of it is far from the main paths, where few shoppers pass; put a destination department (${list([...dest].map(k => catName(ctx, k)))}) there instead.`
            + (apply ? ` ${apply.text} puts it on the main paths (traffic ${Math.round(spot.s)}/100).` : ""),
          show: {ids: [b.id]}, apply});
      }
    }
  }
  for (const c of coldSpots.slice(0, 3)) {
    const used = c.cells.some(k => ctx.blocks.mask[k]);
    findings.push({severity: "info", text: `Cold spot of about ${sq(c.areaSqft)} (up to ${ft(c.distFt)} from the nearest main path)${used ? "" : ", with no department in it"}.`, region: c.polygon, points: [[c.x, c.y]]});
    if (!used && dest.size) rec(ctx, {principleId: "cold_corners", severity: "low", title: "Use the cold corner for a destination department",
      why: `About ${sq(c.areaSqft)} here is far from every main path. A destination department (${list([...dest].map(k => catName(ctx, k)))}) placed here pulls traffic into it.`,
      show: {region: c.polygon, points: [[c.x, c.y]]}});
  }
  return {applicable: true, score: wSum ? Math.round(100 * (1 - pSum / wSum)) : 100, findings,
    reasoning: `Cold = more than a ${ft(A.coldFt)} walk from the main paths. High-margin departments in cold spots cost the most, medium ones half; destination departments are meant to be there.`};
}
function coldSpots(env, A) {
  const {G} = env, cold = new Uint8Array(G.N);
  for (let k = 0; k < G.N; k++) if (env.custRoom[k] && G.walk[k] && !(env.dPath[k] <= A.coldFt)) cold[k] = 1;
  const seen = new Uint8Array(G.N), out = [], minCells = A.coldMinSqft / (G.cell * G.cell);
  for (let s = 0; s < G.N; s++) {
    if (!cold[s] || seen[s]) continue;
    const st = [s], cells = []; seen[s] = 1;
    while (st.length) {
      const k = st.pop(); cells.push(k);
      const i = k % G.nx;
      for (const m of [i > 0 ? k - 1 : -1, i < G.nx - 1 ? k + 1 : -1, k - G.nx, k + G.nx]) if (m >= 0 && m < G.N && cold[m] && !seen[m]) { seen[m] = 1; st.push(m); }
    }
    if (cells.length < minCells) continue;
    let sx = 0, sy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, dMax = 0;
    for (const k of cells) {
      const [x, y] = W.cellCentre(G, k);
      sx += x; sy += y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (Number.isFinite(env.dPath[k]) && env.dPath[k] > dMax) dMax = env.dPath[k];
    }
    const h = G.cell / 2;
    out.push({x: r2(sx / cells.length), y: r2(sy / cells.length), areaSqft: Math.round(cells.length * G.cell * G.cell), distFt: Math.round(dMax), cells,
      polygon: [[x0 - h, y0 - h], [x1 + h, y0 - h], [x1 + h, y1 + h], [x0 - h, y1 + h]].map(p => p.map(r2))});
  }
  return out.sort((a, b) => b.areaSqft - a.areaSqft);
}

function pSize(ctx) {
  const {T} = ctx, tol = T.sizeTolerancePct / 100, findings = [], scores = [];
  for (const c of ctx.cats) {
    const bl = blocksOf(ctx, [c.key]);
    if (!bl.length) { if (!c.hidden && c.isDefault) findings.push({severity: "info", text: `${c.name} isn't placed yet.`}); continue; }
    if (!(c.targetSqft > 0)) continue;
    const area = bl.reduce((t, b) => t + b.area, 0), diff = (area - c.targetSqft) / c.targetSqft, ad = Math.abs(diff);
    const s = ad <= tol ? 1 : clamp01(1 - (ad - tol) / 0.5);
    scores.push(s);
    if (ad <= tol) { findings.push({severity: "info", text: `${c.name}: ${sq(area)} (target ${sq(c.targetSqft)}).`, ids: bl.map(b => b.id)}); continue; }
    const sev = ad > tol + 0.35 ? "medium" : "low";
    findings.push({severity: sev, ids: bl.map(b => b.id), text: `${c.name}: ${sq(area)}, ${pct(ad)} ${diff > 0 ? "over" : "under"} its target of ${sq(c.targetSqft)}.`});
    let apply;
    if (bl.length === 1) apply = resizeApply(ctx, bl[0], c.targetSqft, diff < 0);
    rec(ctx, {principleId: "size_vs_target", severity: sev, title: `Size ${c.name} to its target`,
      why: `It has ${sq(area)} against a target of ${sq(c.targetSqft)} (allowed: within ${pct(tol)}).` + (bl.length > 1 ? " It has several blocks: resize them by hand." : apply ? "" : " There isn't room to grow it where it is."),
      show: {ids: bl.map(b => b.id)}, apply});
  }
  if (!scores.length) return {...na("No department with a target size is placed yet."), findings};
  return {applicable: true, score: Math.round((100 * scores.reduce((a, b) => a + b, 0)) / scores.length), findings,
    reasoning: `Each placed department's total area against its target (catalog or the map's own); within ${pct(tol)} scores full marks, ${pct(tol + 0.5)} off scores nothing.`};
}
function resizeApply(ctx, blk, target, grow) {
  const it = blk.it, s = Math.sqrt(target / blk.area);
  const to = {w: r2(it.w * s), d: r2(it.d * s)};
  if (it.shape === "poly" && Array.isArray(it.pts)) to.pts = it.pts.map(([a, b]) => [Math.round(a * s * 1e4) / 1e4, Math.round(b * s * 1e4) / 1e4]);
  const scaled = {...it, ...to}, {outline} = blockShape(scaled), samples = samplesFor(scaled, outline);
  const from = {w: it.w, d: it.d};
  if (to.pts) from.pts = it.pts;
  if (placementOk(ctx, blk, it.x, it.y, {samples, keepMask: grow ? 3 : 0, others: grow}))
    return {op: "resize", changes: [{id: blk.id, from, to}], text: `Resize ${blk.name} to ${sq(target)}`};
  if (!grow) return undefined;
  const spot = findSpot(ctx, blk, {radius: 10, step: 1, samples, score: () => 0});
  if (!spot) return undefined;
  return {op: "resize", changes: [{id: blk.id, from: {...from, x: it.x, y: it.y}, to: {...to, x: r2(spot.x), y: r2(spot.y)}}],
    text: `Resize ${blk.name} to ${sq(target)} and move it ${moveText(spot.x - it.x, spot.y - it.y)}`};
}

const EVALUATORS = {
  decompression: pDecompression, power_wall: pPowerWall, destination_back: pDestination, sightlines: pSightlines, bulky_near_yard: pBulky,
  adjacency: pAdjacency, aisle_widths: pAisles, choke_points: pChokes, door_clearance: pDoors, cold_corners: pCold, size_vs_target: pSize,
};

/* ---------- overlays ---------- */
function heatOverlay(env, coarse = 2) {
  const {G} = env, f = Math.max(1, Math.round(coarse / G.cell)), nx = Math.ceil(G.nx / f), ny = Math.ceil(G.ny / f);
  const values = new Array(nx * ny).fill(-1);
  for (let J = 0; J < ny; J++) for (let I = 0; I < nx; I++) {
    let s = 0, n = 0;
    for (let j = J * f; j < Math.min(G.ny, (J + 1) * f); j++) for (let i = I * f; i < Math.min(G.nx, (I + 1) * f); i++) {
      const k = j * G.nx + i;
      if (G.walk[k] && G.comp[k] === env.mainComp) { s += env.heat[k]; n++; }
    }
    if (n) values[J * nx + I] = Math.round(100 * s / n);
  }
  return {x0: G.x0, y0: G.y0, cell: f * G.cell, nx, ny, values};
}

/* ---------- the analysis ---------- */
/**
 * Scores a map. map: {items, categories?}; catalog: the catalog (CATALOG); config: the advisor settings
 * (anything missing comes from defaultConfig). Returns {overall, principles, recommendations, overlays, stats, config}.
 */
export function analyse(map, catalog = CATALOG, config = null) {
  const t0 = now();
  catalog = catalog || CATALOG;
  const cfg = resolveConfig(config, catalog);
  const items = ((map && map.items) || []).map(normalizeItem).filter(Boolean);
  const cats = mergeCategories(catalog.areas || CATALOG.areas, (map && map.categories) || []);
  const catBy = new Map(cats.map(c => [c.key, c]));
  for (const c of cats) if (!cfg.departments[c.key]) cfg.departments[c.key] = {margin: "medium", theftProne: false, assumption: true};
  const cached = ENV_CACHE.env;
  let env;
  try {
    env = environment(items, catalog, cfg);
  } catch (e) {
    // a map with nothing to walk on (no floor areas or walls): every principle is "not applicable"
    const why = "The map has no floor areas or walls, so there is nothing to walk or measure.";
    return {
      overall: null, recommendations: [],
      principles: ADVISOR_RULES.map(rule => ({id: rule.key, title: rule.label, why: rule.why, enabled: (cfg.rules[rule.key] || {}).enabled !== false,
        weight: (cfg.rules[rule.key] || {}).weight ?? 1, ...na(why)})),
      overlays: {heat: null, sightlines: [], paths: [], chokePoints: [], zones: [], coldSpots: []},
      stats: {ms: Math.round((now() - t0) * 10) / 10, error: why}, config: {thresholds: cfg.thresholds, assumptions: cfg.assumptions, roles: cfg.roles, departments: cfg.departments},
    };
  }
  const envMs = env === cached ? 0 : env.ms;
  if (!env.coldSpots) env.coldSpots = coldSpots(env, cfg.assumptions);
  const blocks = prepareBlocks(env, items, catBy);
  const ctx = {cfg, T: cfg.thresholds, A: cfg.assumptions, catalog, items, cats, catBy, env, G: env.G, blocks, recs: []};

  const principles = [];
  for (const rule of ADVISOR_RULES) {
    const rc = cfg.rules[rule.key] || {enabled: true, weight: 1}, fn = EVALUATORS[rule.key];
    const before = ctx.recs.length;
    const res = !rc.enabled ? na("Turned off in the advisor settings.") : fn ? fn(ctx) : na("Not available.");
    if (!rc.enabled) ctx.recs.length = before;
    principles.push({id: rule.key, title: rule.label, why: rule.why, enabled: rc.enabled, weight: rc.weight, ...res});
  }
  let wSum = 0, sSum = 0;
  for (const p of principles) if (p.enabled && p.applicable && p.weight > 0) { wSum += p.weight; sSum += p.weight * p.score; }
  const overall = wSum ? Math.round(sSum / wSum) : null;

  // rank: severity x how badly its principle scores x its weight; a concrete fix breaks ties
  const pBy = new Map(principles.map(p => [p.id, p]));
  const recs = ctx.recs.map(r => {
    const p = pBy.get(r.principleId), gap = p && p.applicable ? (100 - p.score) / 100 : 0.5;
    const impact = SEVERITY[r.severity] * (0.5 + gap) * ((p && p.weight) || 1) + (r.apply ? 0.25 : 0);
    const target = (r.show.ids || []).join("+") || (r.show.points || []).map(q => q.join(",")).join("+") || "x";
    return {id: `${r.principleId}:${target}`.slice(0, 120), principleId: r.principleId, priority: r.severity, impact, title: r.title, why: r.why, show: r.show,
      ...(r.apply ? {apply: r.apply} : {})};
  }).sort((a, b) => b.impact - a.impact);
  const seen = new Set(), recommendations = [];
  for (const r of recs) {
    let id = r.id, n = 2;
    while (seen.has(id)) id = `${r.id}#${n++}`;
    seen.add(id);
    recommendations.push({...r, id, rank: recommendations.length + 1, impact: Math.round(r.impact * 100) / 100});
  }

  const overlays = {
    heat: heatOverlay(env),
    sightlines: [...env.sight.desk, ...env.sight.entrance].map(v => ({kind: v.kind, id: v.id, name: v.name, origin: [r2(v.vis.x), r2(v.vis.y)], range: v.vis.range, polygon: W.visibilityPolygon(v.vis)})),
    paths: env.routes.filter(r => r.cells).map(r => ({id: r.id, from: r.from.id, to: r.to.id, label: r.label, weight: r2(r.weight), lengthFt: r2(r.lengthFt), minWidthFt: r2(r.minWidthFt), points: r.points})),
    chokePoints: env.chokes.map(c => ({x: c.x, y: c.y, widthFt: c.widthFt, severity: c.severity, doorway: c.doorway, routes: c.routes,
      between: c.sides.map(i => obName(env.G, i))})),
    zones: [...env.zones.decompression.map(z => ({kind: "decompression", id: z.id, polygon: z.polygon})),
      ...env.zones.doors.flatMap(z => z.sides.map(s => ({kind: "door", id: z.id, polygon: s.polygon})))],
    coldSpots: env.coldSpots.map(c => ({x: c.x, y: c.y, areaSqft: c.areaSqft, distFt: c.distFt, polygon: c.polygon})),
  };
  const anchors = {};
  for (const [k, v] of Object.entries(env.anchors)) anchors[k] = v.map(a => ({id: a.id, name: a.name, x: r2(a.x), y: r2(a.y)}));
  return {
    overall, principles, recommendations, overlays,
    stats: {ms: Math.round((now() - t0) * 10) / 10, structureMs: Math.round(envMs * 10) / 10, timings: env.timings, cached: env === cached, cells: env.G.N, cellFt: env.G.cell,
      routes: env.routes.length, blocks: blocks.list.length, anchors, missingAnchors: env.missing, blockedAnchors: env.blocked.map(b => b.id)},
    config: {thresholds: cfg.thresholds, assumptions: cfg.assumptions, roles: cfg.roles, departments: cfg.departments},
  };
}
/** Drops the cached structure analysis (the next analyse() rebuilds the walk grid). */
export function clearCache() { ENV_CACHE = {key: null, env: null}; }
