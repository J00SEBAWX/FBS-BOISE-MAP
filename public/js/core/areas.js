/* Department blocks (items of type "area") and the categories they belong to. Pure: no DOM.
 * A block is a rectangle (shape "rect") or a polygon (shape "poly": 3-24 corners in pts, LOCAL coordinates
 * relative to the block centre, unrotated; w and d are then the corners' bounding box, centred on x, y).
 * Categories = the 10 default departments (shared/catalog.js) + this map's overrides and custom "c_" ones
 * (doc.categories, CategoryDef per SPEC-v3-API). Every edit returns {doc, patch, inverse, ...} like doc.js. */
import {polygonArea, toLocal, toWorld, closestOnSegment} from "./geometry.js";
import {formatSqft} from "./units.js";
import {commit, findItem, newId, clampGeom, resizeItem, refuseEdit, HEX_RE} from "./doc.js";
import {CATALOG, DEFAULT_KEYS, FAMILY_KEYS, isCustomKey, isDefaultKey, mergeCategories} from "../shared/catalog.js";
import {cleanText, validateMapData} from "../shared/schema.js";

export const BLOCK_HEIGHT = 8;          // ft, owner rules v3.1 rule 2 (editable per block)
export const MIN_PTS = 3, MAX_PTS = 24; // polygon corners (SPEC-v3-API)
export const MAX_LOCAL = 200;           // |x|, |y| of a polygon corner (SPEC-v3-API)
export const MAX_CATEGORIES = 40;
const r4 = v => Math.round(v * 1e4) / 1e4;
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/* ---------- categories ---------- */
/** The categories this map uses: the 10 defaults with the map's overrides, then custom ones (catalog.mergeCategories). */
export const categoriesOf = doc => mergeCategories(CATALOG.areas, (doc && doc.categories) || []);
/** One merged category by key (pass the merged list to avoid re-merging), or null. */
export function categoryFor(doc, key, merged = categoriesOf(doc)) {
  return merged.find(c => c.key === key) || null;
}
export const isBlock = it => !!it && it.type === "area";
export const blocksOf = doc => doc.items.filter(isBlock);

/**
 * A clean CategoryDef from loose input, or {error}. Only the allowed fields are kept (SPEC-v3-API):
 * key, name (1-40), color (#rrggbb), family (catalog family or "custom"), subcats (<= 40 x <= 80), notes (<= 500),
 * targetSqft (0-20000), hidden. Checked with the schema's own validator, so the server accepts what passes here.
 */
export function cleanCategory(def) {
  if (!def || typeof def !== "object") return {error: "That category isn't valid."};
  const key = String(def.key ?? "");
  if (!/^[a-z0-9_]{1,32}$/.test(key) || (!isDefaultKey(key) && !isCustomKey(key))) return {error: "That category key isn't valid."};
  const name = cleanText(String(def.name ?? "").replace(/\s+/g, " "), 40);
  if (!name) return {error: "Give the category a name of up to 40 characters."};
  const color = String(def.color ?? "");
  if (!HEX_RE.test(color)) return {error: "Pick a colour for the category."};
  const family = def.family === undefined ? CATALOG.customFamily : String(def.family);
  if (!FAMILY_KEYS.includes(family)) return {error: "Pick a family for the category."};
  const subcats = [];
  for (const s of Array.isArray(def.subcats) ? def.subcats : []) {
    const t = cleanText(String(s ?? ""), 80);
    if (t === null) return {error: "Each subcategory can be at most 80 characters."};
    if (t) subcats.push(t);
  }
  if (subcats.length > 40) return {error: "A category can list at most 40 subcategories."};
  const notes = cleanText(String(def.notes ?? ""), 500, true);
  if (notes === null) return {error: "Notes can be at most 500 characters."};
  const t = def.targetSqft === undefined || def.targetSqft === null || def.targetSqft === "" ? 0 : Number(def.targetSqft);
  if (!Number.isFinite(t) || t < 0 || t > 20000) return {error: "The target must be between 0 and 20,000 sq ft."};
  // brands: [{label, share}] or plain lines like "Milwaukee 45%" / "Makita"
  const groups = [], seenBrand = new Set();
  for (const g of Array.isArray(def.groups) ? def.groups : []) {
    const b = typeof g === "string" ? parseBrandLine(g) : g && typeof g === "object" ? {label: cleanText(String(g.label ?? ""), 40), share: Number(g.share ?? 0)} : null;
    if (!b || b.label === null) return {error: "Each brand can be at most 40 characters."};
    if (!b.label) continue;
    if (!Number.isFinite(b.share) || b.share < 0 || b.share > 1) return {error: "A brand's share must be between 0% and 100%."};
    const k = brandKey(b.label);
    if (!k) return {error: `"${b.label}" needs at least one letter or number.`};
    if (seenBrand.has(k)) return {error: `"${b.label}" is listed twice.`};
    seenBrand.add(k);
    groups.push({label: b.label, share: Math.round(b.share * 1e4) / 1e4});
  }
  if (groups.length > MAX_BRANDS) return {error: `A department can list at most ${MAX_BRANDS} brands.`};
  if (groups.reduce((a, g) => a + g.share, 0) > 1.0001) return {error: "The brand shares add up to more than 100%."};
  const out = {key, name, color: color.toLowerCase(), family, subcats, notes, targetSqft: Math.round(t * 100) / 100, hidden: def.hidden === true};
  if (def.groups !== undefined) out.groups = groups; // only when brands were given (an empty list clears a default's brands)
  const v = validateMapData({items: [], categories: [out]});
  return v.ok ? {def: v.data.categories[0]} : {error: v.error};
}

/** A new custom key from a name: "c_" + slug, unique in the map, <= 32 characters. */
export function newCategoryKey(doc, name) {
  const used = new Set([...DEFAULT_KEYS, ...((doc && doc.categories) || []).map(c => c.key)]);
  const slug = String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "category";
  let key = "c_" + slug, n = 2;
  while (used.has(key)) key = ("c_" + slug).slice(0, 32 - String(n).length - 1) + "_" + n++;
  return key;
}

/** The CategoryDef to store for a merged category (only the fields a map may hold). */
const defOf = c => ({key: c.key, name: c.name, color: c.color, family: c.family, subcats: [...(c.subcats || [])], notes: c.notes || "", targetSqft: num(c.targetSqft, 0), hidden: !!c.hidden, ...(Array.isArray(c.groups) && c.groups.length ? {groups: c.groups.map(g => ({...g}))} : {})});

/** Adds a custom category {name, color, family?, subcats?, notes?, targetSqft?}. Returns {..., key}. */
export function addCategory(doc, fields) {
  const cats = doc.categories || [];
  if (cats.length >= MAX_CATEGORIES) return refuseEdit(doc, `A map can hold at most ${MAX_CATEGORIES} category changes.`);
  const key = newCategoryKey(doc, fields && fields.name);
  const c = cleanCategory({family: CATALOG.customFamily, ...fields, key});
  if (c.error) return refuseEdit(doc, c.error);
  return {...commit(doc, [{kind: "cat", id: key, to: c.def}]), key};
}

/**
 * Changes a category's name, colour, family, subcats, notes, targetSqft or hidden. A default department gets
 * (or updates) an override in the map; a custom one is updated in place. Block names follow a rename and
 * block colours follow a recolour when they still show the old name / colour.
 */
export function updateCategory(doc, key, fields) {
  const cur = categoryFor(doc, key);
  if (!cur) return refuseEdit(doc, "That category isn't on this map.");
  const c = cleanCategory({...defOf(cur), ...pick(fields, ["name", "color", "family", "subcats", "notes", "targetSqft", "hidden", "groups"]), key});
  if (c.error) return refuseEdit(doc, c.error);
  const exists = (doc.categories || []).some(d => d.key === key);
  if (!exists && (doc.categories || []).length >= MAX_CATEGORIES) return refuseEdit(doc, `A map can hold at most ${MAX_CATEGORIES} category changes.`);
  const edits = [{kind: "cat", id: key, to: c.def}];
  for (const b of blocksOf(doc).filter(b => b.cat === key)) {
    const to = {...b};
    if (b.name === cur.name && c.def.name !== cur.name) to.name = c.def.name.slice(0, 80);
    if (String(b.color || "").toLowerCase() === String(cur.color).toLowerCase() && c.def.color !== String(cur.color).toLowerCase()) to.color = c.def.color;
    edits.push({id: b.id, to});
  }
  return {...commit(doc, edits), key};
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o && o[k] !== undefined).map(k => [k, o[k]]));

/** Hides or shows a category (defaults can't be deleted, only hidden). */
export const setCategoryHidden = (doc, key, hidden) => updateCategory(doc, key, {hidden: !!hidden});

/** Puts a default department back to the catalog version (drops the map's override). */
export function resetCategory(doc, key) {
  if (!isDefaultKey(key)) return refuseEdit(doc, "Only a default department can be reset.");
  return {...commit(doc, [{kind: "cat", id: key, to: null}]), key};
}

/** Deletes a custom category and its blocks (one undo step). Defaults can't be deleted: hide them instead. */
export function deleteCategory(doc, key) {
  if (isDefaultKey(key)) return refuseEdit(doc, "Default departments can't be deleted. Hide it instead.");
  if (!(doc.categories || []).some(c => c.key === key)) return refuseEdit(doc, "That category isn't on this map.");
  const blocks = blocksOf(doc).filter(b => b.cat === key);
  return {...commit(doc, [...blocks.map(b => ({id: b.id, to: null})), {kind: "cat", id: key, to: null}]), key, removedBlocks: blocks.map(b => b.id)};
}

/* ---------- block shape and area ---------- */
/** The block's corners in its own frame (rect: the 4 box corners counter-clockwise; poly: pts). */
export function localPts(it) {
  if (it.shape === "poly" && Array.isArray(it.pts) && it.pts.length >= MIN_PTS) return it.pts;
  const w = it.w / 2, d = it.d / 2;
  return [[-w, -d], [w, -d], [w, d], [-w, d]];
}
/** The block's outline in store coordinates. */
export const outline = it => localPts(it).map(([a, b]) => toWorld(it, a, b));
/** Area in square feet: w x d for a rectangle, the shoelace formula on the corners for a polygon. */
export const blockArea = it => (it.shape === "poly" && Array.isArray(it.pts) && it.pts.length >= MIN_PTS ? polygonArea(it.pts) : it.w * it.d);
/** "Power Tools - 612 sq ft / 700" (the block label). */
export function blockLabel(it, cat) {
  const name = blockTitle(it, cat);
  const a = Math.round(blockArea(it)).toLocaleString("en-US");
  const t = blockTarget(it, cat);
  return t > 0 ? `${name} - ${a} sq ft / ${Math.round(t).toLocaleString("en-US")}` : `${name} - ${a} sq ft`;
}

/* ---------- brands: a department's brand groups, each placeable as its own block (it.brand = the brand key) ---------- */
export const MAX_BRANDS = 6; // schema LIMITS.maxGroups
/** "Simpson Strong-Tie" -> "simpson_strong_tie" (the token stored on a block), or null when nothing is left. */
export function brandKey(label) {
  const k = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24).replace(/_+$/, "");
  return k || null;
}
/** One line of the category editor's Brands box: "Milwaukee 45%" -> {label: "Milwaukee", share: 0.45}; "Makita" -> share 0. */
export function parseBrandLine(line) {
  const m = /^(.*?)\s*(?:[-–:·]\s*)?(\d{1,3}(?:\.\d+)?)\s*%\s*$/.exec(String(line || "").trim());
  const label = cleanText((m ? m[1] : String(line || "")).trim().replace(/\s+/g, " "), 40);
  return {label, share: m ? Number(m[2]) / 100 : 0};
}
/** The brands of a category: [{key, label, share, targetSqft, index}] in catalog order (an empty list for most). */
export function brandsOf(cat) {
  const out = [], seen = new Set();
  for (const g of (cat && Array.isArray(cat.groups) ? cat.groups : [])) {
    const key = brandKey(g && g.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const share = num(g.share, 0);
    out.push({key, label: String(g.label), share, targetSqft: Math.round(num(cat.targetSqft, 0) * share), index: out.length});
  }
  return out;
}
const titleCase = k => String(k).split("_").filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
/** The brand a block is for ({key, label, share, targetSqft, index}), or null for a whole-department block. */
export function brandOf(it, cat) {
  if (!it || !it.brand) return null;
  return brandsOf(cat).find(b => b.key === it.brand) || {key: it.brand, label: titleCase(it.brand), share: 0, targetSqft: 0, index: -1};
}
/** What the block is called on the plan: the brand ("Milwaukee") or the department ("Power Tools"). */
export function blockTitle(it, cat) {
  const b = brandOf(it, cat);
  return b ? b.label : (cat && cat.name) || (it && it.name) || "Department";
}
/** The target that applies to this block: the brand's share of the department target, or the department target. */
export function blockTarget(it, cat) {
  const b = brandOf(it, cat);
  return b ? b.targetSqft : num(cat && cat.targetSqft, 0);
}

/**
 * Starting [w, d] for a category's block: the catalog size when it matches the target, otherwise the catalog
 * proportions (or 2:1 for custom categories) scaled to the target area. No target -> the catalog size or 15' x 10'.
 */
export function startSize(cat, brand) {
  const size = Array.isArray(cat && cat.size) && cat.size[0] > 0 && cat.size[1] > 0 ? cat.size : [15, 10];
  if (brand) {
    // a brand block: its share of the department, in the department's proportions; no share yet -> a modest 8' x 6'
    const b = brandsOf(cat).find(x => x.key === brand);
    const bt = b ? b.targetSqft : 0;
    if (!(bt > 0)) return [8, 6];
    const s = Math.sqrt(bt / (size[0] * size[1]));
    return [r4(size[0] * s), r4(size[1] * s)];
  }
  const t = num(cat && cat.targetSqft, 0);
  if (!(t > 0)) return [size[0], size[1]];
  const s = Math.sqrt(t / (size[0] * size[1]));
  return Math.abs(s - 1) < 1e-9 ? [size[0], size[1]] : [r4(size[0] * s), r4(size[1] * s)];
}

/** The smallest block a person can draw on the floor (ft on each side): anything smaller is taken as a tap. */
export const MIN_DRAWN = 2;

/**
 * Drops a block for category key centred at {x, y}: catalog/target size, the category's name and colour,
 * height 8 ft, rectangle, rotation opts.rot (default 0). opts.size = [w, d] (ft) uses that size instead of the
 * catalog's: what the person drew on the floor. Returns {doc, patch, inverse, id}.
 */
export function createBlock(doc, key, at = {}, opts = {}) {
  const cat = categoryFor(doc, key);
  if (!cat) return refuseEdit(doc, "That category isn't on this map.");
  const brand = opts.brand ? brandsOf(cat).find(b => b.key === opts.brand) : null;
  if (opts.brand && !brand) return refuseEdit(doc, `${cat.name} doesn't list that brand. Add it under Edit category first.`);
  let [w, d] = startSize(cat, brand ? brand.key : undefined);
  if (Array.isArray(opts.size) && num(opts.size[0], 0) >= MIN_DRAWN && num(opts.size[1], 0) >= MIN_DRAWN) [w, d] = [r4(opts.size[0]), r4(opts.size[1])];
  const id = newId(doc, "a");
  const g = opts.grid > 0 ? opts.grid : 0, snap = v => (g ? Math.round(v / g) * g : v);
  const it = clampGeom({
    id, type: "area", name: String(brand ? brand.label : cat.name).slice(0, 80), cat: key, shape: "rect",
    x: snap(num(at.x, 0)), y: snap(num(at.y, 0)), w, d, h: BLOCK_HEIGHT, rot: num(opts.rot, 0), color: String(cat.color).toLowerCase(),
  });
  if (brand) it.brand = brand.key;
  return {...commit(doc, [{id, to: it}]), id};
}

const blockOr = (doc, id) => {
  const it = findItem(doc, id);
  return it && it.type === "area" ? it : null;
};
/** Moves a block to another category; its name and colour follow when they were the old category's. */
export function setBlockCategory(doc, id, key) {
  const it = blockOr(doc, id);
  if (!it) return refuseEdit(doc, "That block is no longer on the map.");
  const merged = categoriesOf(doc);
  const to = categoryFor(doc, key, merged), from = categoryFor(doc, it.cat, merged);
  if (!to) return refuseEdit(doc, "That category isn't on this map.");
  const next = {...it, cat: key};
  const keepBrand = it.brand && brandsOf(to).some(b => b.key === it.brand);
  if (it.brand && !keepBrand) delete next.brand;
  const oldTitle = blockTitle(it, from);
  if (!from || it.name === oldTitle || !it.name) next.name = String(keepBrand ? blockTitle(next, to) : to.name).slice(0, 80);
  if (!from || String(it.color || "").toLowerCase() === String(from.color).toLowerCase() || !it.color) next.color = String(to.color).toLowerCase();
  return {...commit(doc, [{id, to: next}]), id};
}
/** Makes a block stand for one brand of its department (brand = key from brandsOf, or null for the whole department). */
export function setBlockBrand(doc, id, brand) {
  const it = blockOr(doc, id);
  if (!it) return refuseEdit(doc, "That block is no longer on the map.");
  const cat = categoryFor(doc, it.cat);
  if (!cat) return refuseEdit(doc, "That category isn't on this map.");
  const b = brand ? brandsOf(cat).find(x => x.key === brand) : null;
  if (brand && !b) return refuseEdit(doc, `${cat.name} doesn't list that brand.`);
  if ((it.brand || null) === (b ? b.key : null)) return {...commit(doc, []), id};
  const next = {...it};
  if (b) next.brand = b.key; else delete next.brand;
  if (!it.name || it.name === blockTitle(it, cat)) next.name = String(blockTitle(next, cat)).slice(0, 80);
  return {...commit(doc, [{id, to: next}]), id};
}

/** Scales a block (and its corners) by sx, sy about its centre. */
function scaled(it, sx, sy) {
  const to = clampGeom({...it, w: it.w * sx, d: it.d * sy});
  if (it.shape === "poly" && Array.isArray(it.pts)) to.pts = it.pts.map(([a, b]) => [r4(a * to.w / it.w), r4(b * to.d / it.d)]);
  return to;
}

/** Resizes the block so its area equals target (default: its category's target) keeping its proportions and centre. */
export function sizeToTarget(doc, id, target) {
  const it = blockOr(doc, id);
  if (!it) return refuseEdit(doc, "That block is no longer on the map.");
  const t = target ?? blockTarget(it, categoryFor(doc, it.cat));
  if (!(t > 0)) return refuseEdit(doc, it.brand ? "Give this brand a share first (Edit category, Brands)." : "Set a target size first.");
  const s = Math.sqrt(t / blockArea(it));
  return {...commit(doc, [{id, to: scaled(it, s, s)}]), id};
}

/** Turns "Lock area" on or off. */
export function setLockArea(doc, id, on) {
  const it = blockOr(doc, id);
  if (!it) return refuseEdit(doc, "That block is no longer on the map.");
  const to = {...it};
  if (on) to.lockArea = true; else delete to.lockArea;
  return {...commit(doc, [{id, to}]), id};
}

/**
 * Resizes a block by one of the 8 handles (doc.resizeItem). With lockArea on (or opts.lockArea), dragging a
 * side changes the other side so the area stays the same; dragging a corner changes only the proportions.
 */
export function resizeBlock(doc, id, handle, px, py, opts = {}) {
  const it = blockOr(doc, id);
  if (!it) return refuseEdit(doc, "That block is no longer on the map.");
  const lock = opts.lockArea ?? !!it.lockArea;
  return resizeItem(doc, id, handle, px, py, {...opts, keepArea: lock ? it.w * it.d : 0});
}

/* ---------- polygon editing ---------- */
/** Do any two non-neighbouring edges of the polygon cross (or touch)? */
export function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}
const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
function segmentsCross(a, b, c, d) {
  const e = 1e-9;
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (((o1 > e && o2 < -e) || (o1 < -e && o2 > e)) && ((o3 > e && o4 < -e) || (o3 < -e && o4 > e))) return true;
  const on = (p, q, r) => Math.abs(orient(p, q, r)) <= e && Math.min(p[0], q[0]) - e <= r[0] && r[0] <= Math.max(p[0], q[0]) + e && Math.min(p[1], q[1]) - e <= r[1] && r[1] <= Math.max(p[1], q[1]) + e;
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

/**
 * New block geometry for edited LOCAL corners: the corners' bounding box becomes w x d and its middle the new
 * centre, so the shape stays exactly where it is in the store. Corner order is kept.
 */
export function recentre(it, pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [a, b] of pts) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const [x, y] = toWorld(it, cx, cy);
  const out = pts.map(([a, b]) => [r4(a - cx), r4(b - cy)]);
  return {x: r4(x), y: r4(y), w: r4(x1 - x0), d: r4(y1 - y0), pts: out};
}

export const MIN_CORNER_GAP = 0.05; // ft: two corners closer than this are one corner
function polyEdit(doc, id, pts, extra = {}) {
  const it = blockOr(doc, id);
  if (!it) return refuseEdit(doc, "That block is no longer on the map.");
  if (pts.length < MIN_PTS) return refuseEdit(doc, `A shape needs at least ${MIN_PTS} corners.`);
  if (pts.length > MAX_PTS) return refuseEdit(doc, `A shape can have at most ${MAX_PTS} corners.`);
  const g = recentre(it, pts); // checks run on the rounded corners that will be stored
  if (g.pts.some((p, i) => { const q = g.pts[(i + 1) % g.pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) < MIN_CORNER_GAP; })) {
    return refuseEdit(doc, "Two corners would be on top of each other.");
  }
  if (polygonArea(g.pts) < 1) return refuseEdit(doc, "That would make the shape too small.");
  if (selfIntersects(g.pts)) return refuseEdit(doc, "The edges would cross. Move the corner somewhere else.");
  if (g.pts.some(([a, b]) => Math.abs(a) > MAX_LOCAL || Math.abs(b) > MAX_LOCAL)) return refuseEdit(doc, "That shape is too big.");
  const to = clampGeom({...it, shape: "poly", x: g.x, y: g.y, w: g.w, d: g.d});
  to.pts = g.pts;
  return {...commit(doc, [{id, to}]), id, ...extra};
}

/** Turns a rectangular block into a 4-corner polygon (same footprint) so its corners can be edited. */
export function toPolygon(doc, id) {
  const it = blockOr(doc, id);
  if (!it) return refuseEdit(doc, "That block is no longer on the map.");
  if (it.shape === "poly" && Array.isArray(it.pts) && it.pts.length >= MIN_PTS) return {...commit(doc, []), id};
  return polyEdit(doc, id, localPts({...it, shape: "rect"}));
}
/** Turns a polygon block back into a rectangle (its bounding box). */
export function toRectangle(doc, id) {
  const it = blockOr(doc, id);
  if (!it) return refuseEdit(doc, "That block is no longer on the map.");
  const to = {...it, shape: "rect"};
  delete to.pts;
  return {...commit(doc, [{id, to}]), id};
}
/** Moves corner index to world point (px, py) (snap it before calling). Refused if the edges would cross. */
export function movePolyPoint(doc, id, index, px, py) {
  const it = blockOr(doc, id);
  if (!it || it.shape !== "poly" || !Array.isArray(it.pts)) return refuseEdit(doc, "Tap Change shape first.");
  if (!(index >= 0 && index < it.pts.length)) return refuseEdit(doc, "That corner doesn't exist.");
  const pts = it.pts.map(p => [p[0], p[1]]);
  pts[index] = toLocal(it, px, py);
  return polyEdit(doc, id, pts, {index});
}
/** Adds a corner on edge index (from corner index to the next) at the point of that edge nearest (px, py), or its middle. */
export function insertPolyPoint(doc, id, edge, px, py) {
  const it = blockOr(doc, id);
  if (!it || it.shape !== "poly" || !Array.isArray(it.pts)) return refuseEdit(doc, "Tap Change shape first.");
  const n = it.pts.length;
  if (!(edge >= 0 && edge < n)) return refuseEdit(doc, "That edge doesn't exist.");
  if (n >= MAX_PTS) return refuseEdit(doc, `A shape can have at most ${MAX_PTS} corners.`);
  const a = it.pts[edge], b = it.pts[(edge + 1) % n];
  let p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (Number.isFinite(px) && Number.isFinite(py)) {
    const [lx, ly] = toLocal(it, px, py);
    const c = closestOnSegment(lx, ly, a[0], a[1], b[0], b[1]);
    p = [c.x, c.y];
  }
  const pts = it.pts.map(q => [q[0], q[1]]);
  pts.splice(edge + 1, 0, p);
  return polyEdit(doc, id, pts, {index: edge + 1});
}
/** Removes corner index (a shape keeps at least 3). */
export function removePolyPoint(doc, id, index) {
  const it = blockOr(doc, id);
  if (!it || it.shape !== "poly" || !Array.isArray(it.pts)) return refuseEdit(doc, "Tap Change shape first.");
  if (it.pts.length <= MIN_PTS) return refuseEdit(doc, `A shape needs at least ${MIN_PTS} corners.`);
  if (!(index >= 0 && index < it.pts.length)) return refuseEdit(doc, "That corner doesn't exist.");
  return polyEdit(doc, id, it.pts.filter((_, i) => i !== index));
}
/** For "add a corner": the outline edge nearest to world point (px, py): {edge, point: [x, y] (world), distance}. */
export function nearestEdge(it, px, py) {
  const pts = outline(it);
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c = closestOnSegment(px, py, a[0], a[1], b[0], b[1]);
    if (!best || c.d < best.distance) best = {edge: i, point: [c.x, c.y], distance: c.d};
  }
  return best;
}

/* ---------- progress and summary ---------- */
/** "7 of 10 departments placed": visible categories with at least one block. {placed, total, text, missing: [keys]} */
export function progress(doc, merged = categoriesOf(doc)) {
  const vis = merged.filter(c => !c.hidden);
  const used = new Set(blocksOf(doc).map(b => b.cat));
  const placed = vis.filter(c => used.has(c.key)).length;
  return {placed, total: vis.length, text: `${placed} of ${vis.length} departments placed`, missing: vis.filter(c => !used.has(c.key)).map(c => c.key)};
}

/**
 * Available sales floor, from the map's own floor items:
 *  - counted: floor items whose kind is in opts.kinds (default ["showroom"]: the sales floor and front rooms);
 *    if no floor has a kind, every floor except names containing office / warehouse
 *  - area of each floor = its w x d (floors are rectangles in the schema); floors don't overlap in the master
 *  - zones (upper levels such as the mezzanine) are NOT subtracted: they are above the ground floor and the
 *    blocks are ground-floor footprints. Fixed structure inside the rooms (columns, stairs, desks) is not
 *    subtracted either: it is small and the catalog targets already include aisles.
 * Returns {sqft, floors: [{id, name, sqft}], warehouseSqft, method}.
 */
export function availableFloor(doc, opts = {}) {
  const kinds = new Set(opts.kinds || ["showroom"]);
  const floors = doc.items.filter(it => it.type === "floor");
  const anyKind = floors.some(f => typeof f.kind === "string" && f.kind);
  const counted = floors.filter(f => (anyKind ? kinds.has(f.kind) : !/office|warehouse/i.test(f.name || "")));
  const list = counted.map(f => ({id: f.id, name: f.name || "Floor", sqft: f.w * f.d}));
  const sqft = list.reduce((s, f) => s + f.sqft, 0);
  const warehouseSqft = floors.filter(f => f.kind === "warehouse").reduce((s, f) => s + f.w * f.d, 0);
  return {sqft, floors: list, warehouseSqft, method: `Sum of the ${anyKind ? [...kinds].join("/") + " " : ""}floor areas on this map (upper levels and fixed structure not subtracted)`};
}

/**
 * Legend / summary rows: every category (hidden ones flagged) with its blocks' sq ft against its target, plus
 * totals: planned sq ft (all blocks; overlapping blocks count twice), the targets of visible categories and
 * the available sales floor (availableFloor). Status: "none" (not placed), "under" (< 90% of target),
 * "over" (> 110%), "ok"; categories without a target are "ok" once placed.
 */
export function summary(doc, opts = {}) {
  const merged = opts.merged || categoriesOf(doc);
  const blocks = blocksOf(doc);
  const rows = merged.map(c => {
    const mine = blocks.filter(b => b.cat === c.key);
    const sqft = mine.reduce((s, b) => s + blockArea(b), 0);
    const t = num(c.targetSqft, 0);
    const statusOf = (list, target, area) => (!list.length ? "none" : target > 0 && area < target * 0.9 ? "under" : target > 0 && area > target * 1.1 ? "over" : "ok");
    const status = statusOf(mine, t, sqft);
    // the department's brands, each with its own blocks and share of the target
    const brands = brandsOf(c).map(b => {
      const bl = mine.filter(x => x.brand === b.key), a = bl.reduce((s, x) => s + blockArea(x), 0);
      return {...b, placed: bl.length > 0, blocks: bl.map(x => x.id), sqft: a, status: statusOf(bl, b.targetSqft, a)};
    });
    const general = mine.filter(x => !x.brand).map(x => x.id);
    return {key: c.key, name: c.name, color: c.color, hidden: !!c.hidden, custom: !!c.custom, placed: mine.length > 0, blocks: mine.map(b => b.id), general, brands, sqft, targetSqft: t, diff: sqft - t, status};
  });
  // blocks whose category isn't on the map any more (a deleted custom category)
  const known = new Set(merged.map(c => c.key));
  const orphans = blocks.filter(b => !known.has(b.cat)).map(b => b.id);
  const vis = rows.filter(r => !r.hidden);
  const plannedSqft = blocks.reduce((s, b) => s + blockArea(b), 0);
  const targetSqft = vis.reduce((s, r) => s + r.targetSqft, 0);
  const avail = availableFloor(doc, opts);
  const p = progress(doc, merged);
  return {
    rows, orphans,
    totals: {
      plannedSqft, targetSqft, availableSqft: avail.sqft, floors: avail.floors, warehouseSqft: avail.warehouseSqft, method: avail.method,
      placed: p.placed, total: p.total, progressText: p.text,
      text: `${formatSqft(plannedSqft)} planned of ${formatSqft(avail.sqft)} sales floor (targets ${formatSqft(targetSqft)})`,
    },
  };
}
