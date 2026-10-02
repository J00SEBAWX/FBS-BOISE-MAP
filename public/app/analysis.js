// Area-planning advisor: collision, adjacency, entry, placement and size checks, plus Jerry's tips.
// Pure functions (no DOM, no network) so the planner, AJ's dashboard and the unit tests share them.
// `catalog` is the catalog payload from /api/bootstrap (areas, entryAnchors, nearFt, anchorFt, perimeterFt).
import { overlapArea, rectDist, pointRectDist, clearanceRect, bbox, isAxisAligned } from "./geometry.js";

export const OPENING_TYPES = new Set(["door", "opening", "arch"]);
export const PLACE_ORDER = [
  "power_tools", "bits_blades", "hardware_fasteners", "hand_tools", "safety_workwear",
  "pneumatic_air", "paint_finishing", "decking_outdoor", "woodworking", "access_jobsite",
];
export const POWER_BRANDS = ["Milwaukee", "DeWalt", "Makita"];

const WALL_EPS = 0.05; // sq ft: a block flush against a wall face doesn't count
const HARD_EPS = 0.5; // sq ft: ignore rounding slivers against desks, stairs and door clearances
const AREA_EPS = 1; // sq ft of overlap between two area blocks

const round = (v) => Math.round(v);
const half = (v) => Math.round(v * 2) / 2;
const fmt = (v) => Math.round(v).toLocaleString("en-US");

/** Adds a byKey index to the catalog payload (idempotent). */
export function prepCatalog(catalog) {
  if (catalog && catalog.byKey) return catalog;
  const areas = (catalog && catalog.areas) || [];
  return { ...catalog, areas, byKey: Object.fromEntries(areas.map((a) => [a.key, a])) };
}

/** "SALES DESK BACK (SDB)" -> "Sales Desk Back (SDB)". Leaves mixed-case names alone. */
export function nice(name) {
  const s = String(name || "").trim();
  if (!s || s !== s.toUpperCase()) return s;
  return s
    .split(" ")
    .map((w) => (/^\(.*\)$/.test(w) || !/[A-Z]{2,}/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

export function areaName(block, cat) {
  return (block && block.name) || (cat && cat.byKey && cat.byKey[block.key] && cat.byKey[block.key].name) || "Area";
}

/** Short anchor label for sentences: "Sales desks (front and back)" -> "the sales desks". */
export function anchorShort(anchor) {
  const label = String((anchor && anchor.label) || "").split(" (")[0].toLowerCase();
  return label ? "the " + label : "its entry point";
}

/** Where an entry anchor is in this layout: the centers of the doors or desks it names. */
export function anchorPoints(anchor, ctx) {
  if (!anchor) return [];
  const pts = [];
  if (Array.isArray(anchor.items) && ctx && ctx.byId) {
    for (const id of anchor.items) {
      const it = ctx.byId.get(id);
      if (it) pts.push([it.x, it.y]);
    }
  }
  if (Array.isArray(anchor.points)) pts.push(...anchor.points);
  if (typeof anchor.x === "number" && typeof anchor.y === "number") pts.push([anchor.x, anchor.y]);
  return pts;
}

export function anchorDist(block, anchor, ctx) {
  let best = Infinity;
  for (const [px, py] of anchorPoints(anchor, ctx)) best = Math.min(best, pointRectDist(block, px, py));
  return best;
}

// ---------- context ----------

function entry(it) {
  return { it, bb: bbox(it), aligned: isAxisAligned(it) };
}

/** Overlap with a bbox early-out and an exact fast path for axis-aligned pairs. */
function quick(a, abb, aAligned, e) {
  const b = e.bb;
  if (abb[2] <= b[0] || b[2] <= abb[0] || abb[3] <= b[1] || b[3] <= abb[1]) return 0;
  if (aAligned && e.aligned) return (Math.min(abb[2], b[2]) - Math.max(abb[0], b[0])) * (Math.min(abb[3], b[3]) - Math.max(abb[1], b[1]));
  return overlapArea(a, e.it);
}

/** Pre-sorts a layout's items into the groups the advisor checks against. */
export function buildContext(items = []) {
  const floors = [], walls = [], openings = [], desks = [], stairs = [], clear = [];
  const byId = new Map();
  for (const it of items) {
    if (!it) continue;
    byId.set(it.id, it);
    if (it.type === "floor") floors.push(entry(it));
    else if (it.type === "wall") walls.push(entry(it));
    else if (it.type === "stairs") stairs.push(entry(it));
    else if ((it.type === "ring" || it.type === "counter") && (it.fixed || it.locked)) desks.push(entry(it));
    else if (OPENING_TYPES.has(it.type)) {
      openings.push(entry(it));
      const r = clearanceRect(it);
      clear.push({ ...entry(r), op: it });
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of floors) {
    x0 = Math.min(x0, f.bb[0]);
    y0 = Math.min(y0, f.bb[1]);
    x1 = Math.max(x1, f.bb[2]);
    y1 = Math.max(y1, f.bb[3]);
  }
  if (!floors.length) [x0, y0, x1, y1] = [0, 0, 169, 80];
  return { floors, walls, openings, desks, stairs, clear, byId, bounds: [x0, y0, x1, y1] };
}

/** Which kind of floor a block mostly sits on, and how much of it hangs outside the building. */
export function zoneOf(block, ctx, bb = bbox(block), aligned = isAxisAligned(block)) {
  const by = { warehouse: 0, showroom: 0, office: 0 };
  const floorsHit = [];
  let inside = 0;
  for (const f of ctx.floors) {
    const a = quick(block, bb, aligned, f);
    if (a > 0) {
      const k = f.it.kind || "showroom";
      by[k] = (by[k] || 0) + a;
      inside += a;
      floorsHit.push({ floor: f.it, area: a });
    }
  }
  const total = block.w * block.d;
  const outside = Math.max(0, total - inside);
  let kind = "outside", best = 0;
  for (const [k, v] of Object.entries(by)) {
    if (v > best) {
      best = v;
      kind = k;
    }
  }
  if (outside > best) kind = "outside";
  floorsHit.sort((a, b) => b.area - a.area);
  return { kind, by, outside, total, floors: floorsHit };
}

export function minWallDist(block, ctx) {
  let best = Infinity;
  for (const w of ctx.walls) best = Math.min(best, rectDist(block, w.it));
  return best;
}

/** True when a block hits nothing hard: walls, fixed desks, door clearances, stairs, other blocks, offices or the outside. */
export function isClear(block, ctx, others) {
  const bb = bbox(block);
  const al = isAxisAligned(block);
  for (const w of ctx.walls) if (quick(block, bb, al, w) > WALL_EPS) return false;
  for (const d of ctx.desks) if (quick(block, bb, al, d) > HARD_EPS) return false;
  for (const c of ctx.clear) if (quick(block, bb, al, c) > HARD_EPS) return false;
  for (const s of ctx.stairs) if (quick(block, bb, al, s) > HARD_EPS) return false;
  for (const o of others) if (quick(block, bb, al, entry(o)) > AREA_EPS) return false;
  const z = zoneOf(block, ctx, bb, al);
  return z.outside <= 1 && z.by.office <= 1;
}

// ---------- per-area checks ----------

/** Full check of one area block against the layout and the other blocks. */
export function analyzeArea(block, ctx, areas, catalog) {
  const cat = prepCatalog(catalog);
  const c = cat.byKey[block.key] || {};
  const name = areaName(block, cat);
  const bb = bbox(block);
  const al = isAxisAligned(block);
  const collisions = [];
  const warnings = [];

  for (const d of ctx.desks) if (quick(block, bb, al, d) > HARD_EPS) collisions.push({ kind: "desk", id: d.it.id, rect: d.it, label: `Overlaps ${nice(d.it.name) || "a sales desk"}` });
  for (const w of ctx.walls) if (quick(block, bb, al, w) > WALL_EPS) collisions.push({ kind: "wall", id: w.it.id, rect: w.it, label: `Crosses the ${nice(w.it.name) || "wall"}` });
  for (const e of ctx.clear) if (quick(block, bb, al, e) > HARD_EPS) collisions.push({ kind: "entrance", id: e.op.id, rect: e.it, label: `Blocks the clear space at the ${nice(e.op.name) || "doorway"}` });
  for (const s of ctx.stairs) if (quick(block, bb, al, s) > HARD_EPS) collisions.push({ kind: "stairs", id: s.it.id, rect: s.it, label: `Overlaps the ${nice(s.it.name) || "stairs"}` });
  for (const o of areas) {
    if (o.id === block.id) continue;
    if (quick(block, bb, al, entry(o)) > AREA_EPS) collisions.push({ kind: "area", id: o.id, rect: o, label: `Overlaps ${areaName(o, cat)}` });
  }

  const zone = zoneOf(block, ctx, bb, al);
  if (zone.outside > 1) collisions.push({ kind: "outside", label: "Hangs outside the building" });
  if (zone.by.office > 1) {
    const office = zone.floors.find((f) => f.floor.kind === "office");
    warnings.push({ kind: "office", label: `Sits in ${office ? nice(office.floor.name) : "the offices"}` });
  }

  // adjacency: first tag is the primary neighbor
  const tags = Array.isArray(block.adjacency) ? block.adjacency : c.adjacency || [];
  const adjacency = tags.map((key, i) => {
    const others = areas.filter((o) => o.key === key && o.id !== block.id);
    if (!others.length) return { key, primary: i === 0, placed: false, dist: null, ok: false, otherId: null };
    let best = Infinity, bestId = null;
    for (const o of others) {
      const dist = rectDist(block, o);
      if (dist < best) {
        best = dist;
        bestId = o.id;
      }
    }
    return { key, primary: i === 0, placed: true, dist: best, ok: best <= cat.nearFt, otherId: bestId };
  });
  const primary = adjacency[0];
  if (primary && primary.placed && !primary.ok) {
    warnings.push({ kind: "adjacency", key: primary.key, label: `Not next to ${(cat.byKey[primary.key] || {}).name || primary.key} (${round(primary.dist)} ft apart)` });
  }

  // entry anchor
  const entryKey = block.entry || c.entry || "none";
  const anchor = (cat.entryAnchors || {})[entryKey];
  let entryCheck = { key: entryKey, dist: null, ok: true };
  if (anchor && anchorPoints(anchor, ctx).length) {
    const dist = anchorDist(block, anchor, ctx);
    entryCheck = { key: entryKey, dist, ok: dist <= cat.anchorFt };
    if (!entryCheck.ok) warnings.push({ kind: "entry", label: `${round(dist)} ft from ${anchorShort(anchor)} (aim for ${cat.anchorFt} or less)` });
  }

  // placement preference
  const pref = block.placement || c.placement || "showroom";
  const wallDist = minWallDist(block, ctx);
  let placementOk = true;
  if (pref === "warehouse") placementOk = zone.kind === "warehouse";
  else if (pref === "showroom") placementOk = zone.kind === "showroom";
  else if (pref === "perimeter") placementOk = wallDist <= cat.perimeterFt;
  else if (pref === "central") placementOk = wallDist > cat.perimeterFt;
  if (!placementOk) {
    const msg = {
      warehouse: "Prefers the warehouse",
      showroom: "Prefers the showroom floor",
      perimeter: `Prefers a wall (nearest is ${round(wallDist)} ft away)`,
      central: "Prefers open floor away from the walls",
    }[pref];
    warnings.push({ kind: "placement", label: msg || "Placement preference not met" });
  }

  // size: count every block of this key together
  const sqft = block.w * block.d;
  const total = areas.filter((o) => o.key === block.key).reduce((s, o) => s + o.w * o.d, 0);
  const [min, max] = c.sqft || [0, Infinity];
  const sizeOk = total >= min && total <= max;
  if (total < min) warnings.push({ kind: "size", label: `Small: ${fmt(total)} sq ft (aim for ${fmt(min)}–${fmt(max)})` });
  else if (total > max) warnings.push({ kind: "size", label: `Large: ${fmt(total)} sq ft (aim for ${fmt(min)}–${fmt(max)})` });

  return {
    id: block.id,
    key: block.key,
    name,
    sqft,
    zone,
    collisions,
    warnings,
    adjacency,
    entry: entryCheck,
    placement: { pref, ok: placementOk, wallDist },
    size: { sqft, total, min, max, ok: sizeOk },
    state: collisions.length ? "issues" : warnings.length ? "warn" : "ok",
  };
}

/** Checks every block and rolls the results up per department for the quest log. */
export function analyzeBuild(data, catalog) {
  const cat = prepCatalog(catalog);
  const items = (data && data.items) || [];
  const areas = (data && data.areas) || [];
  const ctx = buildContext(items);
  const results = new Map();
  for (const a of areas) results.set(a.id, analyzeArea(a, ctx, areas, cat));

  const byKey = cat.areas.map((c) => {
    const blocks = areas.filter((a) => a.key === c.key);
    if (!blocks.length) return { key: c.key, name: c.name, color: c.color, state: "unplaced", blocks: [], sqft: 0, collisions: 0, warnings: 0 };
    const rs = blocks.map((b) => results.get(b.id));
    const collisions = rs.reduce((s, r) => s + r.collisions.length, 0);
    const warnings = rs.reduce((s, r) => s + r.warnings.length, 0);
    const confirmed = blocks.every((b) => b.status === "confirmed");
    const needsReview = blocks.some((b) => b.status === "needs_review");
    const state = collisions ? "issues" : confirmed ? "confirmed" : warnings ? "warn" : "placed";
    return {
      key: c.key,
      name: blocks[0].name || c.name,
      color: blocks[0].color || c.color,
      state,
      needsReview,
      blocks: blocks.map((b) => b.id),
      sqft: blocks.reduce((s, b) => s + b.w * b.d, 0),
      collisions,
      warnings,
    };
  });
  const placed = byKey.filter((k) => k.state !== "unplaced" && k.state !== "issues").length;
  const confirmed = byKey.filter((k) => k.state === "confirmed").length;
  const collisionCount = byKey.reduce((s, k) => s + k.collisions, 0);
  const warningCount = byKey.reduce((s, k) => s + k.warnings, 0);
  return {
    ctx,
    results,
    byKey,
    progress: { placed, confirmed, total: cat.areas.length, collisions: collisionCount, warnings: warningCount, complete: placed === cat.areas.length },
  };
}

// ---------- finding space ----------

const OFFSETS = new Map();
function offsets(maxR, step) {
  const k = `${maxR}:${step}`;
  let o = OFFSETS.get(k);
  if (!o) {
    o = [];
    const n = Math.floor(maxR / step);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const dx = i * step, dy = j * step, d2 = dx * dx + dy * dy;
        if (d2 <= maxR * maxR + 1e-9) o.push([d2, dx, dy]);
      }
    }
    o.sort((a, b) => a[0] - b[0]);
    OFFSETS.set(k, o);
  }
  return o;
}

/**
 * Spiral search for the nearest clear spot for `block` (same size and rotation).
 * opts: center [x, y], maxR (ft), step (ft), predicate(test) extra rule,
 * collect n candidates and return the one closest to `near` [x, y].
 */
export function findSpot(block, ctx, areas, opts = {}) {
  const others = areas.filter((a) => a.id !== block.id);
  const [cx, cy] = opts.center || [block.x, block.y];
  const collect = Math.max(1, opts.collect || 1);
  const found = [];
  const test = { ...block };
  for (const [, dx, dy] of offsets(opts.maxR ?? 40, opts.step ?? 1)) {
    test.x = half(cx + dx);
    test.y = half(cy + dy);
    if (!isClear(test, ctx, others)) continue;
    if (opts.predicate && !opts.predicate(test)) continue;
    found.push({ x: test.x, y: test.y });
    if (found.length >= collect) break;
  }
  if (!found.length) return null;
  if (collect === 1 || !opts.near) return found[0];
  const [nx, ny] = opts.near;
  found.sort((a, b) => Math.hypot(a.x - nx, a.y - ny) - Math.hypot(b.x - nx, b.y - ny));
  return found[0];
}

/** Pulls an axis-aligned block fully inside the floor it mostly sits on when it hangs over by a little. */
export function fitToZone(block, ctx, maxPush = 2.5) {
  if (!isAxisAligned(block)) return { x: block.x, y: block.y };
  const z = zoneOf(block, ctx);
  const home = z.floors[0] && z.floors[0].floor;
  if (!home) return { x: block.x, y: block.y };
  const [fx0, fy0, fx1, fy1] = bbox(home);
  const [x0, y0, x1, y1] = bbox(block);
  let dx = 0, dy = 0;
  if (x1 - x0 <= fx1 - fx0) {
    if (x0 < fx0 && fx0 - x0 <= maxPush) dx = fx0 - x0;
    else if (x1 > fx1 && x1 - fx1 <= maxPush) dx = fx1 - x1;
  }
  if (y1 - y0 <= fy1 - fy0) {
    if (y0 < fy0 && fy0 - y0 <= maxPush) dy = fy0 - y0;
    else if (y1 > fy1 && y1 - fy1 <= maxPush) dy = fy1 - y1;
  }
  return { x: block.x + dx, y: block.y + dy };
}

/** Snap lines for dragging an area block: wall faces, floor edges, door clearances, desks and other blocks. */
export function snapLines(ctx, areas, skipId) {
  const xs = [], ys = [];
  const add = (bb) => {
    xs.push(bb[0], bb[2]);
    ys.push(bb[1], bb[3]);
  };
  for (const g of [ctx.walls, ctx.floors, ctx.clear, ctx.desks, ctx.stairs]) for (const e of g) add(e.bb);
  for (const a of areas) if (a.id !== skipId) add(bbox(a));
  return { xs, ys };
}

// ---------- Jerry's tips ----------

function moveTip(mover, spot, cta, extra) {
  if (!spot) return null;
  return { action: { type: "move", areaId: mover.id, x: spot.x, y: spot.y }, cta, focus: [spot.x, spot.y], ...extra };
}

/**
 * Ordered tips for Jerry's thought bubble: fix collisions, then place missing departments,
 * then neighbors, entry, placement, size, brand groups, confirmation and submitting.
 * opts: limit (tips that get a one-tap action, default 3), focusKey, focusAreaId, buildStatus.
 */
export function suggestions(report, data, catalog, suggested, opts = {}) {
  const cat = prepCatalog(catalog);
  const { ctx, results, byKey } = report;
  const areas = (data && data.areas) || [];
  const limit = opts.limit ?? 3;
  const sugBy = Object.fromEntries(((suggested && suggested.areas) || []).map((a) => [a.key, a]));
  const order = [...PLACE_ORDER.filter((k) => cat.byKey[k]), ...cat.areas.map((a) => a.key).filter((k) => !PLACE_ORDER.includes(k))];
  const rank = (key) => {
    const i = order.indexOf(key);
    return i < 0 ? 99 : i;
  };
  const sortedAreas = [...areas].sort((a, b) => rank(a.key) - rank(b.key));
  const list = [];

  // 1. collisions
  for (const a of sortedAreas) {
    const r = results.get(a.id);
    if (!r || !r.collisions.length) continue;
    const more = r.collisions.length > 1 ? ` (and ${r.collisions.length - 1} more)` : "";
    list.push({
      id: `fix:${a.id}`,
      tone: "bad",
      areaId: a.id,
      key: a.key,
      title: `${r.name} needs a clear spot`,
      text: `${r.collisions[0].label}${more}.`,
      focus: [a.x, a.y],
      resolve: () =>
        moveTip(a, findSpot(a, ctx, areas, { maxR: 40 }), "Nudge it clear") || {
          action: { type: "select", areaId: a.id },
          cta: "Show me",
          note: "There's no clear spot nearby at this size. Try shrinking it or clearing space.",
        },
    });
  }

  // 2. departments not placed yet
  for (const key of order) {
    if (areas.some((a) => a.key === key)) continue;
    const c = cat.byKey[key];
    const s = sugBy[key];
    const [cx, cy] = s ? [s.x, s.y] : [(ctx.bounds[0] + ctx.bounds[2]) / 2, (ctx.bounds[1] + ctx.bounds[3]) / 2];
    const probe = { id: "_probe", key, x: cx, y: cy, w: s ? s.w : c.size[0], d: s ? s.d : c.size[1], rot: (s && s.rot) || 0 };
    list.push({
      id: `place:${key}`,
      tone: "info",
      key,
      title: `Next up: ${c.name}`,
      text: (s && s.why) || c.note || "Drag it from the list onto the floor.",
      focus: [cx, cy],
      resolve: () => {
        const place = (x, y) => ({ type: "place", key, x, y, w: probe.w, d: probe.d, rot: probe.rot, groups: s && s.groups });
        if (s && isClear(probe, ctx, areas)) return { action: place(probe.x, probe.y), cta: "Place it there", focus: [probe.x, probe.y] };
        const spot = findSpot(probe, ctx, areas, { center: [cx, cy], maxR: 60 });
        if (spot) return { action: place(spot.x, spot.y), cta: "Place it there", focus: [spot.x, spot.y], note: s ? "My usual spot is taken in your build, so this is the closest clear space." : "" };
        return { action: null, cta: null, note: "There's no clear space that big right now. Make room or shrink a block first." };
      },
    });
  }

  // 3. primary neighbor too far (move the smaller block)
  const movedForAdj = new Set();
  for (const a of sortedAreas) {
    const r = results.get(a.id);
    if (!r || r.collisions.length) continue;
    const p = r.adjacency[0];
    if (!p || !p.placed || p.ok) continue;
    const nb = areas.find((o) => o.id === p.otherId);
    if (!nb) continue;
    const mover = a.w * a.d <= nb.w * nb.d ? a : nb;
    const anchor = mover === a ? nb : a;
    if (movedForAdj.has(mover.id)) continue;
    movedForAdj.add(mover.id);
    list.push({
      id: `adj:${a.id}`,
      tone: "warn",
      areaId: a.id,
      key: a.key,
      title: `Pair ${r.name} with ${areaName(nb, cat)}`,
      text: `${r.name} sells best right next to ${areaName(nb, cat)}. They're ${round(p.dist)} ft apart.`,
      focus: [(a.x + nb.x) / 2, (a.y + nb.y) / 2],
      resolve: () =>
        moveTip(
          mover,
          findSpot(mover, ctx, areas, { center: [anchor.x, anchor.y], maxR: 50, collect: 40, near: [mover.x, mover.y], predicate: (t) => rectDist(t, anchor) <= cat.nearFt - 0.5 }),
          `Move ${areaName(mover, cat)} closer`
        ) || { action: { type: "select", areaId: a.id }, cta: "Show me", note: "I couldn't find a clear spot next to it. Shuffle a neighbor first." },
    });
  }

  // 4. entry anchor too far
  for (const a of sortedAreas) {
    const r = results.get(a.id);
    if (!r || r.collisions.length || r.entry.ok || r.entry.dist === null) continue;
    const anchor = cat.entryAnchors[r.entry.key];
    const pts = anchorPoints(anchor, ctx);
    const near = pts.reduce((b, p) => (pointRectDist(a, p[0], p[1]) < pointRectDist(a, b[0], b[1]) ? p : b), pts[0]);
    list.push({
      id: `entry:${a.id}`,
      tone: "warn",
      areaId: a.id,
      key: a.key,
      title: `${r.name} wants to be near ${anchorShort(anchor)}`,
      text: `It's ${round(r.entry.dist)} ft away. Shoppers find it faster within ${cat.anchorFt} ft.`,
      focus: near,
      resolve: () =>
        moveTip(a, findSpot(a, ctx, areas, { center: near, maxR: 40, collect: 40, near: [a.x, a.y], predicate: (t) => anchorDist(t, anchor, ctx) <= cat.anchorFt - 0.5 }), "Move it closer") || {
          action: { type: "select", areaId: a.id },
          cta: "Show me",
          note: "There's no clear spot that close right now.",
        },
    });
  }

  // 5. placement preference
  for (const a of sortedAreas) {
    const r = results.get(a.id);
    if (!r || r.collisions.length || r.placement.ok) continue;
    const pref = r.placement.pref;
    const s = sugBy[a.key];
    let predicate, center = [a.x, a.y];
    if (pref === "warehouse" || pref === "showroom") {
      predicate = (t) => zoneOf(t, ctx).kind === pref;
      if (s) center = [s.x, s.y];
      else {
        const f = ctx.floors.find((e) => (e.it.kind || "showroom") === pref);
        if (f) center = [f.it.x, f.it.y];
      }
    } else if (pref === "perimeter") predicate = (t) => minWallDist(t, ctx) <= cat.perimeterFt;
    else predicate = (t) => minWallDist(t, ctx) > cat.perimeterFt;
    const label = { warehouse: "the warehouse", showroom: "the showroom floor", perimeter: "a wall", central: "open floor" }[pref] || "its preferred spot";
    list.push({
      id: `placement:${a.id}`,
      tone: "warn",
      areaId: a.id,
      key: a.key,
      title: `${r.name} belongs on ${label}`,
      text: r.warnings.find((w) => w.kind === "placement")?.label + ".",
      focus: center,
      resolve: () =>
        moveTip(a, findSpot(a, ctx, areas, { center, maxR: 60, collect: pref === "warehouse" || pref === "showroom" ? 1 : 30, near: [a.x, a.y], predicate }), "Move it there") || {
          action: { type: "select", areaId: a.id },
          cta: "Show me",
          note: "I couldn't find a clear spot like that at this size.",
        },
    });
  }

  // 6. size (single-block departments)
  for (const a of sortedAreas) {
    const r = results.get(a.id);
    if (!r || r.collisions.length || r.size.ok) continue;
    if (areas.filter((o) => o.key === a.key).length > 1) continue;
    const target = r.size.total < r.size.min ? r.size.min * 1.05 : r.size.max * 0.95;
    const f = Math.sqrt(target / (a.w * a.d));
    const w = Math.max(2, half(a.w * f)), d = Math.max(2, half(a.d * f));
    const grow = r.size.total < r.size.min;
    list.push({
      id: `size:${a.id}`,
      tone: "warn",
      areaId: a.id,
      key: a.key,
      title: grow ? `${r.name} is a bit tight` : `${r.name} has room to spare`,
      text: `${r.warnings.find((x) => x.kind === "size")?.label}.`,
      focus: [a.x, a.y],
      resolve: () => {
        const others = areas.filter((o) => o.id !== a.id);
        if (isClear({ ...a, w, d }, ctx, others)) return { action: { type: "resize", areaId: a.id, w, d }, cta: grow ? `Grow it to ${fmt(w * d)} sq ft` : `Trim it to ${fmt(w * d)} sq ft` };
        return { action: { type: "select", areaId: a.id }, cta: "Show me", note: grow ? "There isn't room to grow it where it is." : "" };
      },
    });
  }

  // 7. Power Tools keeps its brand groups
  for (const a of sortedAreas) {
    if (a.key !== "power_tools") continue;
    const labels = (a.groups || []).map((g) => String(g.label || "").toLowerCase());
    const missing = POWER_BRANDS.filter((b) => !labels.includes(b.toLowerCase()));
    if (!missing.length) continue;
    list.push({
      id: `groups:${a.id}`,
      tone: "info",
      areaId: a.id,
      key: a.key,
      title: "Keep the brands together",
      text: `Power Tools should keep Milwaukee, DeWalt and Makita as groups inside it. Missing: ${missing.join(", ")}.`,
      focus: [a.x, a.y],
      resolve: () => ({ action: { type: "groups", areaId: a.id }, cta: "Add the brand groups" }),
    });
  }

  // 8. wrap-up
  const allSet = byKey.every((k) => k.state !== "unplaced" && k.state !== "issues");
  if (allSet && byKey.length) {
    const unconfirmed = sortedAreas.find((a) => a.status !== "confirmed");
    if (unconfirmed) {
      list.push({
        id: "confirm",
        tone: "good",
        areaId: unconfirmed.id,
        key: unconfirmed.key,
        title: "Every department has a home",
        text: "Mark the areas you're sure about as Confirmed so AJ knows what's settled.",
        focus: [unconfirmed.x, unconfirmed.y],
        resolve: () => ({ action: { type: "select", areaId: unconfirmed.id }, cta: `Review ${areaName(unconfirmed, cat)}` }),
      });
    }
    const status = opts.buildStatus || "draft";
    if (status === "draft" || status === "needs_changes") {
      list.push({ id: "submit", tone: "good", title: "Ready for AJ", text: "All 10 departments are placed with no collisions. Send it to AJ for review whenever you're happy with it.", resolve: () => ({ action: { type: "submit" }, cta: "Submit build" }) });
    } else if (status === "submitted") {
      list.push({ id: "submitted", tone: "good", title: "Sent to AJ", text: "AJ has this build for review. Any change moves it back to draft until you submit again.", resolve: () => ({ action: null, cta: null }) });
    }
  }

  // focus requests jump the queue
  const score = (s) => (opts.focusKey && s.key === opts.focusKey && !s.areaId ? -2 : opts.focusAreaId && s.areaId === opts.focusAreaId ? -1 : 0);
  const ordered = list.map((s, i) => ({ s, i })).sort((a, b) => score(a.s) - score(b.s) || a.i - b.i).map((x) => x.s);

  return ordered.map((s, i) => {
    const { resolve, ...rest } = s;
    const want = opts.resolveId ? s.id === opts.resolveId : i < limit;
    if (!want || !resolve) return { ...rest, action: null, cta: null, pending: Boolean(resolve) };
    const r = resolve() || {};
    return { ...rest, action: r.action || null, cta: r.cta || null, note: r.note || "", focus: r.focus || rest.focus || null };
  });
}

/** Resolves the one-tap action for a single tip (used when Jerry pages to a tip past the limit). */
export function resolveTip(report, data, catalog, suggested, id, opts = {}) {
  return suggestions(report, data, catalog, suggested, { ...opts, resolveId: id }).find((s) => s.id === id) || null;
}
