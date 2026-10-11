/* Map document operations. Pure: no DOM.
 * A doc is the stored map data {items: [...], categories: [...]} (SPEC-v3-API). Docs and items are treated as
 * immutable: every operation returns a NEW doc plus a forward patch and its inverse, and leaves the input alone.
 *
 *   result = {doc, patch, inverse, id?, ids?, skipped?, error?}
 *
 * A patch is an array of entries {kind: "item" | "cat", id, from, to, at}: the item (or category definition,
 * id = its key) before and after, and its index in the list at the moment the entry applies (used to put a
 * deleted item back where it was). from = null means "added", to = null means "removed". Applying a patch
 * runs the entries in order; the inverse runs them backwards with from/to swapped. When an edit is refused
 * (locked structure, bad value) the result has error (a plain sentence for the person), the same doc and an
 * empty patch. */
import {clamp, normDeg, rad, toLocal, toWorld} from "./geometry.js";
import {TYPES, isStructure} from "./model.js";
import {parseLength} from "./units.js";
import {validateMapData} from "../shared/schema.js";

/* ---------- small helpers ---------- */
export const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** Geometry bounds from the schema (SPEC-v3-API): x, y in [-100, 400]; w, d in (0, 400]; h in [0, 60]. */
export const ITEM_LIMITS = Object.freeze({xy: [-100, 400], wd: [0, 400], h: [0, 60], minSize: 0.1});
const r4 = v => Math.round(v * 1e4) / 1e4;          // 1/10000 ft: below any visible or meaningful size
const rDeg = v => { const a = Math.round(normDeg(v) * 100) / 100; return a >= 360 ? 0 : a; };
const EMPTY = Object.freeze([]);

/** Deep equality for plain JSON-like values (items, category definitions). */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  return ka.length === kb.length && ka.every(k => deepEqual(a[k], b[k]));
}

/** A doc with both lists present (anything else on the object is kept). */
export function normalizeDoc(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {...d, items: Array.isArray(d.items) ? d.items : [], categories: Array.isArray(d.categories) ? d.categories : []};
}
export const findItem = (doc, id) => doc.items.find(it => it.id === id) || null;

/* ---------- patches ---------- */
const listKey = kind => (kind === "cat" ? "categories" : "items");
const keyOf = (kind, o) => (kind === "cat" ? o.key : o.id);

/** Applies a patch; returns a new doc (the input is untouched). Tolerant: a missing item is inserted, a missing removal is skipped. */
export function applyPatch(doc, patch) {
  if (!patch || !patch.length) return doc;
  const out = {...doc, items: doc.items ? [...doc.items] : [], categories: doc.categories ? [...doc.categories] : []};
  for (const e of patch) {
    const list = out[listKey(e.kind)];
    const i = list.findIndex(o => keyOf(e.kind, o) === e.id);
    if (e.to == null) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = e.to;
    else list.splice(clamp(e.at ?? list.length, 0, list.length), 0, e.to);
  }
  return out;
}
/** The patch that undoes this one. */
export const invertPatch = patch => (patch || EMPTY).slice().reverse().map(e => ({...e, from: e.to, to: e.from}));

/**
 * One patch with the effect of a then b. Consecutive changes to the same item collapse into one entry
 * (keeping the first "from", the last "to") as long as that is safe for the list order; entries that end
 * where they started are dropped.
 */
export function composePatches(a, b) {
  const out = (a || EMPTY).slice();
  for (const e of b || EMPTY) {
    let j = -1;
    for (let k = out.length - 1; k >= 0; k--) if (out[k].kind === e.kind && out[k].id === e.id) { j = k; break; }
    const prev = j >= 0 ? out[j] : null;
    // a change to something that exists before and after: fold it into the earlier entry for it
    if (prev && prev.to != null && e.from != null && e.to != null) {
      if (prev.from != null && deepEqual(prev.from, e.to)) {
        // back where it started: only safe to drop when nothing after it touches the same list positions
        if (j === out.length - 1) { out.pop(); continue; }
      }
      out[j] = {...prev, to: e.to};
      continue;
    }
    out.push(e);
  }
  return out;
}

/**
 * Builds a patch from edits [{kind, id, to}] applied one after the other to doc (from and at are read from
 * the doc as it is at that moment). Entries that change nothing are skipped. Returns {doc, patch, inverse}.
 */
export function commit(doc, edits) {
  const patch = [];
  let cur = doc;
  for (const ed of edits) {
    const kind = ed.kind || "item";
    const list = cur[listKey(kind)] || [];
    const at = list.findIndex(o => keyOf(kind, o) === ed.id);
    const from = at >= 0 ? list[at] : null;
    const to = ed.to ?? null;
    if (from === null && to === null) continue;
    if (from !== null && to !== null && deepEqual(from, to)) continue;
    const e = {kind, id: ed.id, from, to, at: at >= 0 ? at : clamp(ed.at ?? list.length, 0, list.length)};
    patch.push(e);
    cur = applyPatch(cur, [e]);
  }
  return {doc: patch.length ? cur : doc, patch, inverse: invertPatch(patch)};
}
/** The result of a refused edit: same doc, empty patch, a plain-language error. */
export const refuseEdit = (doc, error, extra = {}) => ({doc, patch: EMPTY, inverse: EMPTY, error, ...extra});
const refuse = refuseEdit;

/* ---------- ids ---------- */
let seq = 0;
/** A new item id that matches /^[A-Za-z0-9_-]{1,40}$/ and is not used in the doc ("n" + time + counter + random). */
export function newId(doc, prefix = "n") {
  const used = new Set((doc && doc.items || []).map(it => it.id));
  const p = String(prefix).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12) || "n";
  for (;;) {
    seq = (seq + 1) % 1679616; // 36^4
    const id = (p + Date.now().toString(36) + seq.toString(36).padStart(4, "0") + Math.floor(Math.random() * 1296).toString(36)).slice(0, 40);
    if (!used.has(id) && ID_RE.test(id)) return id;
  }
}

/* ---------- locks ---------- */
const LOCKED_MSG = "That's part of the building, so it's locked. Unlock structure to change it.";
/**
 * Locked = building structure (walls, doors, openings, arches, columns, floors, ceilings, stairs, upper levels),
 * anything marked fixed (sales desks, fixed platforms) or locked, unless opts.unlocked (the Structure toggle).
 * Department blocks (type "area") are never structure.
 */
export const isLocked = (it, opts = {}) => !!it && !opts.unlocked && it.type !== "area" && (isStructure(it) || it.locked === true);
/** Is this palette type building structure (adding one needs structure unlocked)? */
export const isStructureType = type => isStructure({type});

/* ---------- the add palette ---------- */
// Starting sizes and colours for new items (ft). Taken from typical items in the master layout; heights come
// from model.js TYPES. Everything is editable afterwards in the inspector.
export const PALETTE = Object.freeze({
  wall:     {label: "Wall",          name: "Wall",          w: 10,  d: 0.7, color: "#e9e3d6"},
  column:   {label: "Column",        name: "Column",        w: 1.2, d: 1.2, color: "#f1f1ee"},
  door:     {label: "Door",          name: "Door",          w: 3,   d: 0.7, color: "#6b6f73"},
  opening:  {label: "Opening",       name: "Opening",       w: 6,   d: 0.7, color: "#8a5a34"},
  gondola:  {label: "Gondola",       name: "Gondola",       w: 16,  d: 4,   color: "#c9ccce"},
  wallunit: {label: "Wall unit",     name: "Wall shelving", w: 8,   d: 1.8, color: "#c9ccce"},
  rack:     {label: "Rack",          name: "Pallet rack",   w: 10,  d: 3.5, color: "#1f5a47"},
  counter:  {label: "Counter",       name: "Counter",       w: 8,   d: 2.5, color: "#8a5a34", top: "#1a1a1c"},
  table:    {label: "Table",         name: "Table",         w: 6,   d: 2.5, color: "#d9b98a"},
  display:  {label: "Display",       name: "Display",       w: 4,   d: 4,   color: "#c9ccce"},
  tower:    {label: "Tower",         name: "Tower",         w: 1,   d: 1.5, color: "#59b52a"},
  platform: {label: "Platform",      name: "Platform",      w: 8,   d: 6,   color: "#8a7466"},
  stairs:   {label: "Stairs",        name: "Stairs",        w: 10,  d: 4,   color: "#8a5a34"},
  zone:     {label: "Upper level",   name: "Upper level",   w: 20,  d: 15,  color: "#8a5a34"},
  area:     {label: "Department",    name: "Department",    w: 20,  d: 10,  color: "#677a8b", h: 8},
});
export const PALETTE_TYPES = Object.freeze(Object.keys(PALETTE));

/**
 * Adds a new item of a palette type centred at {x, y}. opts: unlocked, grid (snap the centre), rot, fields
 * (extra fields, cleaned like setField), id. Department blocks normally come from areas.createBlock (which
 * fills the category); here an "area" needs fields.cat. Returns {doc, patch, inverse, id}.
 */
export function addItem(doc, type, at = {}, opts = {}) {
  const def = PALETTE[type];
  if (!def) return refuse(doc, "That kind of item can't be added.");
  if (isStructureType(type) && !opts.unlocked) return refuse(doc, "Unlock structure to add walls, columns, doors, openings, stairs or upper levels.");
  const g = opts.grid > 0 ? opts.grid : 0;
  const snap = v => (g ? Math.round(v / g) * g : v);
  const id = opts.id && ID_RE.test(opts.id) && !findItem(doc, opts.id) ? opts.id : newId(doc);
  let it = {
    id, type, name: def.name,
    x: r4(snap(num(at.x, 0))), y: r4(snap(num(at.y, 0))), w: def.w, d: def.d,
    h: def.h ?? (TYPES[type] ? TYPES[type].h : 0), rot: rDeg(num(opts.rot, 0)), color: def.color,
  };
  if (def.top) it.top = def.top;
  for (const [k, v] of Object.entries(opts.fields || {})) {
    const c = cleanField(it, k, v, doc.categories);
    if (c.error) return refuse(doc, c.error);
    it = c.item;
  }
  if (type === "area" && !it.cat) return refuse(doc, "Pick a department for the block.");
  const res = commit(doc, [{id, to: clampGeom(it)}]);
  return {...res, id};
}
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/* ---------- geometry limits ---------- */
/** Keeps x, y, w, d, h, rot inside the schema's bounds (rounded to 1/10000 ft, rotation to 0.01 degree). */
export function clampGeom(it) {
  const L = ITEM_LIMITS;
  const out = {...it};
  out.x = r4(clamp(num(it.x, 0), L.xy[0], L.xy[1]));
  out.y = r4(clamp(num(it.y, 0), L.xy[0], L.xy[1]));
  out.w = r4(clamp(num(it.w, 1), L.minSize, L.wd[1]));
  out.d = r4(clamp(num(it.d, 1), L.minSize, L.wd[1]));
  if (it.h !== undefined) out.h = r4(clamp(num(it.h, 0), L.h[0], L.h[1]));
  out.rot = rDeg(num(it.rot, 0));
  return out;
}

/* ---------- move ---------- */
function editable(doc, ids, opts) {
  const found = [], locked = [], missing = [];
  for (const id of ids) {
    const it = findItem(doc, id);
    if (!it) missing.push(id); else if (isLocked(it, opts)) locked.push(id); else found.push(it);
  }
  return {found, locked, missing};
}
const asIds = ids => (Array.isArray(ids) ? ids : [ids]);

/** Moves items by (dx, dy) feet. Locked items are skipped (listed in skipped); all locked -> error. */
export function moveItems(doc, ids, dx, dy, opts = {}) {
  const {found, locked} = editable(doc, asIds(ids), opts);
  if (!found.length) return refuse(doc, locked.length ? LOCKED_MSG : "Nothing to move.", {skipped: locked});
  const res = commit(doc, found.map(it => ({id: it.id, to: clampGeom({...it, x: it.x + num(dx, 0), y: it.y + num(dy, 0)})})));
  return {...res, ids: found.map(it => it.id), skipped: locked};
}
/** Puts items at absolute centres: [{id, x, y}] (a drag computes these from where the drag started). */
export function placeItems(doc, places, opts = {}) {
  const want = new Map(places.map(p => [p.id, p]));
  const {found, locked} = editable(doc, [...want.keys()], opts);
  if (!found.length) return refuse(doc, locked.length ? LOCKED_MSG : "Nothing to move.", {skipped: locked});
  const res = commit(doc, found.map(it => {
    const p = want.get(it.id);
    return {id: it.id, to: clampGeom({...it, x: num(p.x, it.x), y: num(p.y, it.y)})};
  }));
  return {...res, ids: found.map(it => it.id), skipped: locked};
}

/* ---------- resize ---------- */
/**
 * The 8 resize handles, named by where they sit on the item when it is not rotated: e/w = the two ends of
 * its length (local +x / -x), n/s = its front / back (local +y / -y), and the four corners. [sx, sy] is the
 * handle's direction in the item's own frame.
 */
export const HANDLES = Object.freeze({
  n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0], ne: [1, 1], nw: [-1, 1], se: [1, -1], sw: [-1, -1],
});
export const ROTATE_HANDLE_GAP = 2; // ft beyond the front edge (the plan may draw it at a fixed pixel distance instead)

/** World positions of the 8 resize handles and the rotate handle: {n: [x, y], ..., rotate: [x, y]}. */
export function handlePoints(it, gap = ROTATE_HANDLE_GAP) {
  const out = {};
  for (const [k, [sx, sy]] of Object.entries(HANDLES)) out[k] = toWorld(it, sx * it.w / 2, sy * it.d / 2);
  out.rotate = toWorld(it, 0, it.d / 2 + gap);
  return out;
}

/**
 * New geometry for dragging handle h to world point (px, py): the opposite side (or corner) stays put, all
 * in the item's rotated frame. opts: grid (round the new size), min (smallest size, ft), keepAspect (corner
 * handles keep the proportions), keepArea (sq ft: the other side adjusts so w x d stays this area; with a
 * side handle the other dimension changes symmetrically about the centre line).
 * Returns {x, y, w, d, sx, sy} (sx, sy: the scale factors applied to w and d, for polygon points).
 */
export function resizeGeom(it, h, px, py, opts = {}) {
  const dir = HANDLES[h];
  if (!dir) return {x: it.x, y: it.y, w: it.w, d: it.d, sx: 1, sy: 1};
  const [hx, hy] = dir;
  const L = ITEM_LIMITS, min = Math.max(L.minSize, opts.min ?? 0.5), max = L.wd[1], g = opts.grid > 0 ? opts.grid : 0;
  const [lx, ly] = toLocal(it, px, py);
  let w = it.w, d = it.d;
  if (hx) w = hx * lx + it.w / 2;
  if (hy) d = hy * ly + it.d / 2;
  if (g) { if (hx) w = Math.round(w / g) * g; if (hy) d = Math.round(d / g) * g; }
  if (opts.keepAspect && hx && hy) {
    const s = Math.max(w / it.w, d / it.d);
    w = it.w * s; d = it.d * s;
  }
  w = clamp(w, min, max); d = clamp(d, min, max);
  const A = opts.keepArea > 0 ? opts.keepArea : 0;
  if (A) {
    if (hy && !hx) { w = clamp(A / d, min, max); d = A / w; }
    else { d = clamp(A / w, min, max); w = A / d; }
  }
  // the fixed side stays where it was; an axis the handle doesn't pull stays centred
  const cx = hx ? -hx * it.w / 2 + hx * w / 2 : 0;
  const cy = hy ? -hy * it.d / 2 + hy * d / 2 : 0;
  const [x, y] = toWorld(it, cx, cy);
  return {x, y, w, d, sx: w / it.w, sy: d / it.d};
}

/** Scales polygon points (local, centred) by sx, sy. */
export const scalePts = (pts, sx, sy) => pts.map(([a, b]) => [r4(a * sx), r4(b * sy)]);

/**
 * Resizes one item by dragging handle h to world point (px, py) (see resizeGeom). Department blocks with
 * lockArea keep their area; polygon blocks scale their corners with the box. opts: unlocked, grid, min,
 * keepAspect, keepArea (sq ft, overrides the block's own lockArea).
 */
export function resizeItem(doc, id, h, px, py, opts = {}) {
  const it = findItem(doc, id);
  if (!it) return refuse(doc, "That item is no longer on the map.");
  if (isLocked(it, opts)) return refuse(doc, LOCKED_MSG);
  let keepArea = opts.keepArea;
  if (keepArea === undefined && it.type === "area" && it.lockArea) keepArea = it.w * it.d;
  const g = resizeGeom(it, h, px, py, {...opts, keepArea});
  const to = clampGeom({...it, x: g.x, y: g.y, w: g.w, d: g.d});
  if (Array.isArray(it.pts) && it.pts.length) to.pts = scalePts(it.pts, to.w / it.w, to.d / it.d);
  return {...commit(doc, [{id, to}]), id};
}

/** Sets the size directly (inspector fields), keeping the centre. Polygon corners scale with it. */
export function setSize(doc, id, w, d, opts = {}) {
  const it = findItem(doc, id);
  if (!it) return refuse(doc, "That item is no longer on the map.");
  if (isLocked(it, opts)) return refuse(doc, LOCKED_MSG);
  const to = clampGeom({...it, w: num(w, it.w), d: num(d, it.d)});
  if (Array.isArray(it.pts) && it.pts.length) to.pts = scalePts(it.pts, to.w / it.w, to.d / it.d);
  return {...commit(doc, [{id, to}]), id};
}

/* ---------- rotate ---------- */
export const ROTATE_STEP = 15;
/** Rounds an angle to the rotate step unless free. */
export const snapAngle = (deg, free = false, step = ROTATE_STEP) => rDeg(free ? deg : Math.round(deg / step) * step);

/** Sets rotation (degrees, counter-clockwise) for items about their own centres; 15 degree steps unless opts.free. */
export function rotateItems(doc, ids, deg, opts = {}) {
  const {found, locked} = editable(doc, asIds(ids), opts);
  if (!found.length) return refuse(doc, locked.length ? LOCKED_MSG : "Nothing to rotate.", {skipped: locked});
  const a = snapAngle(num(deg, 0), opts.free, opts.step);
  return {...commit(doc, found.map(it => ({id: it.id, to: {...it, rot: a}}))), ids: found.map(it => it.id), skipped: locked};
}
/** Turns items by a relative angle (keyboard / buttons), result snapped unless opts.free. */
export function rotateItemsBy(doc, ids, delta, opts = {}) {
  const {found, locked} = editable(doc, asIds(ids), opts);
  if (!found.length) return refuse(doc, locked.length ? LOCKED_MSG : "Nothing to rotate.", {skipped: locked});
  return {...commit(doc, found.map(it => ({id: it.id, to: {...it, rot: snapAngle((it.rot || 0) + num(delta, 0), opts.free, opts.step)}}))), ids: found.map(it => it.id), skipped: locked};
}
/** The rotate handle dragged to (px, py): the item's front turns to face the pointer. */
export function rotateToPoint(doc, id, px, py, opts = {}) {
  const it = findItem(doc, id);
  if (!it) return refuse(doc, "That item is no longer on the map.");
  if (Math.hypot(px - it.x, py - it.y) < 1e-6) return refuse(doc, "");
  const a = Math.atan2(py - it.y, px - it.x) * 180 / Math.PI - 90; // the handle sits on local +y
  return rotateItems(doc, [id], a, opts);
}

/* ---------- duplicate, delete ---------- */
/**
 * Copies items with new ids, offset by opts.dx / opts.dy (default 2 ft east, 2 ft south) so the copy is visible.
 * Structure copies need structure unlocked. Returns {doc, patch, inverse, ids (the new ids), map: {oldId: newId}}.
 */
export function duplicateItems(doc, ids, opts = {}) {
  const {found, locked} = editable(doc, asIds(ids), opts);
  if (!found.length) return refuse(doc, locked.length ? LOCKED_MSG : "Nothing to copy.", {skipped: locked});
  const dx = num(opts.dx, 2), dy = num(opts.dy, -2);
  let cur = doc;
  const edits = [], map = {};
  for (const it of found) {
    const id = newId(cur);
    const copy = clampGeom({...it, id, x: it.x + dx, y: it.y + dy});
    if (Array.isArray(it.pts)) copy.pts = it.pts.map(p => [p[0], p[1]]);
    edits.push({id, to: copy});
    map[it.id] = id;
    cur = {...cur, items: [...cur.items, copy]}; // so the next newId sees this one
  }
  const res = commit(doc, edits);
  return {...res, ids: Object.values(map), map, skipped: locked};
}

/** Deletes items. Locked ones are skipped (skipped); all locked -> error. */
export function deleteItems(doc, ids, opts = {}) {
  const {found, locked} = editable(doc, asIds(ids), opts);
  if (!found.length) return refuse(doc, locked.length ? LOCKED_MSG : "Nothing to delete.", {skipped: locked});
  return {...commit(doc, found.map(it => ({id: it.id, to: null}))), ids: found.map(it => it.id), skipped: locked};
}

/* ---------- name, colour, fields ---------- */
// inspector text for these fields is read as a length ("25' 6\"", "7.5", "300cm")
const LENGTH_FIELDS = new Set(["x", "y", "w", "d", "h", "ceil", "cham", "fasciaTo"]);
const NUMBER_FIELDS = new Set(["rot", "sky", "fans"]);

/**
 * Checks one field change against the schema (shared/schema.js validateMapData on the changed item, so the
 * allow-list, bounds, lengths, colour format and enumerations are exactly the server's). Text typed into a
 * length field is parsed as feet and inches. undefined / null removes an optional field.
 * Returns {item} (the item with only that field changed, cleaned) or {error}.
 */
export function cleanField(it, field, value, categories = []) {
  if (field === "id" || field === "type") return {error: "That can't be changed."};
  let v = value;
  if (typeof v === "string" && LENGTH_FIELDS.has(field)) { v = parseLength(v); if (v === null) return {error: "Type a length like 12' 6\" or 12.5."}; }
  else if (typeof v === "string" && NUMBER_FIELDS.has(field)) { v = v.trim() === "" ? NaN : Number(v); }
  if (field === "rot" && typeof v === "number" && Number.isFinite(v)) v = rDeg(v);
  const cand = {...it};
  if (v === undefined || v === null) delete cand[field]; else cand[field] = v;
  const res = validateMapData({items: [cand], categories});
  if (!res.ok) return {error: res.error || "That value isn't allowed."};
  const clean = res.data.items[0];
  const out = {...it};
  if (v === undefined || v === null) delete out[field];
  else if (Object.prototype.hasOwnProperty.call(clean, field)) out[field] = clean[field];
  else return {error: "That can't be changed here."};
  return {item: out};
}

/** Renames an item (trimmed, control characters removed, at most 80 characters). */
export const renameItem = (doc, id, name, opts = {}) => setField(doc, id, "name", name, opts);
/** Recolours an item (#rrggbb). */
export const recolorItem = (doc, id, color, opts = {}) => setField(doc, id, "color", color, opts);

/**
 * Sets one field, checked against the schema (shared/schema.js cleanField: allow-listed fields, finite numbers
 * in bounds, string lengths, colour format, enumerations). undefined / null / "" removes an optional field.
 * id and type can't be changed here. Geometry fields keep polygon corners in step (w / d scale them).
 */
export function setField(doc, id, field, value, opts = {}) {
  const it = findItem(doc, id);
  if (!it) return refuse(doc, "That item is no longer on the map.");
  if (isLocked(it, opts)) return refuse(doc, LOCKED_MSG);
  if (field === "id" || field === "type") return refuse(doc, "That can't be changed.");
  if (it.type === "area" && (field === "pts" || field === "shape")) return refuse(doc, "Use Change shape to change a department's corners.", {field});
  const c = cleanField(it, field, value, doc.categories);
  if (c.error) return refuse(doc, c.error, {field});
  let to = c.item;
  if ((field === "w" || field === "d") && Array.isArray(it.pts) && it.pts.length) to = {...to, pts: scalePts(it.pts, to.w / it.w, to.d / it.d)};
  return {...commit(doc, [{id, to}]), id};
}

/** Sets several fields at once (one undo step); stops at the first bad value. */
export function setFields(doc, id, fields, opts = {}) {
  let cur = doc, patch = [];
  for (const [k, v] of Object.entries(fields || {})) {
    const r = setField(cur, id, k, v, opts);
    if (r.error) return refuse(doc, r.error, {field: k});
    cur = r.doc; patch = patch.concat(r.patch);
  }
  const p = composePatches([], patch);
  return {doc: cur, patch: p, inverse: invertPatch(p), id};
}

/* ---------- rotation helpers for other modules ---------- */
/** Unit vectors of an item's own axes in the world: {u: along its length, v: toward its front}. */
export function axes(it) {
  const a = rad(it.rot || 0);
  return {u: [Math.cos(a), Math.sin(a)], v: [-Math.sin(a), Math.cos(a)]};
}
