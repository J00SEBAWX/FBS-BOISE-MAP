// Map data validation: the one allow-list for what a store map may contain.
// Pure ES module (imports only ./catalog.js). The Worker uses src/shared/schema.js on every save; the browser
// loads public/js/shared/schema.js to check a map before sending it. The two files must stay byte-identical.
//
// validateMapData(data) -> {ok: true, data} | {ok: false, error, field, itemId}
//   data = {items: [Item...], categories?: [CategoryDef...], building?: {length, width}}
//   Unknown fields are dropped; any bad item or category rejects the whole map. Numbers must be finite and
//   in range (rounded to 0.0001 ft), strings are trimmed, cleaned of control characters and length-capped.
import { DEFAULT_KEYS, FAMILY_KEYS } from "./catalog.js";

export const LIMITS = Object.freeze({
  maxItems: 1500,
  maxBytes: 400 * 1024, // the stored JSON (UTF-8)
  maxCategories: 40,
  maxSubcats: 40,
  maxGroups: 6,
  maxPolyPoints: 64,
  minPts: 3,
  maxPts: 24,
  ptsAbs: 200,
  mapNameMax: 60,
  noteMax: 500,
});

/** Every item type a map may hold (public/js/core/model.js TYPES uses the same list). */
export const ITEM_TYPES = Object.freeze([
  "floor", "zone", "ceiling", "wall", "door", "opening", "arch", "column", "stairs", "ring", "counter", "gondola",
  "wallunit", "rack", "pallet", "platform", "tower", "display", "table", "area",
]);
const TYPE_SET = new Set(ITEM_TYPES);

/** Structure: the building itself. A "blank store" keeps only these, plus anything marked fixed:true. */
export const STRUCTURE_TYPES = Object.freeze(["floor", "zone", "wall", "door", "opening", "arch", "column", "ceiling", "stairs"]);
const STRUCT_SET = new Set(STRUCTURE_TYPES);
export const isStructure = (it) => !!it && (STRUCT_SET.has(it.type) || it.fixed === true);

export const ITEM_STATUSES = Object.freeze(["proposed", "confirmed", "needs_review"]);
export const AREA_SHAPES = Object.freeze(["rect", "poly"]);
export const AREA_DEFAULT_H = 8;

export const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const CATEGORY_KEY_RE = /^[a-z0-9_]{1,32}$/;
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TOKEN_RE = /^[a-z0-9_]{1,24}$/;
const SIDES = new Set(["N", "S", "E", "W"]);
const DEFAULTS = new Set(DEFAULT_KEYS);
const FAMILIES = new Set(FAMILY_KEYS);

// ---------- small helpers (exported for the routes and the browser) ----------

// C0/C1 control characters, bidi overrides/isolates and the BOM: never stored
const CTRL_ALL = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩﻿]/g;
const INVISIBLE = /\p{Cf}/gu;
const CTRL_KEEP_NL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩﻿]/g;

/**
 * A user string, cleaned: control characters removed (newlines kept when multiline), trimmed, then checked
 * against max (in characters). Returns the string, or null when it isn't a string or is too long.
 */
export function cleanText(v, max, multiline = false) {
  if (typeof v !== "string") return null;
  let s = multiline ? v.replace(/\r\n?/g, "\n").replace(CTRL_KEEP_NL, "") : v.replace(CTRL_ALL, "");
  s = s.replace(INVISIBLE, "").trim(); // zero-width and other format characters would make a blank-looking name
  if ([...s].length > max) return null;
  return s;
}

/** UTF-8 size of a string in bytes. */
export function byteLength(s) {
  return new TextEncoder().encode(s).length;
}

const round4 = (v) => {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
};
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Degrees in [0, 360). */
export function normRot(v) {
  const r = round4(((v % 360) + 360) % 360);
  return r >= 360 ? 0 : r;
}

// ---------- item fields ----------
// kind: num [min, max, minExclusive], int [min, max], text [max, multiline], token, color, bool, plus specials.
const NUM = (min, max, openMin = false) => ({ kind: "num", min, max, openMin });
const ITEM_FIELDS = new Map([
  ["x", NUM(-100, 400)],
  ["y", NUM(-100, 400)],
  ["w", NUM(0, 400, true)],
  ["d", NUM(0, 400, true)],
  ["h", NUM(0, 60)],
  ["rot", { kind: "rot" }],
  ["ceil", NUM(0, 60)],
  ["cham", NUM(0, 20)],
  ["fasciaTo", NUM(0, 60)],
  ["sky", { kind: "int", min: 0, max: 20 }],
  ["fans", { kind: "int", min: 0, max: 20 }],
  ["name", { kind: "text", max: 80 }],
  ["notes", { kind: "text", max: 500, multiline: true }],
  ["src", { kind: "text", max: 80 }], // where a value came from ("survey", "scan+owner-markup", ...)
  ["toConfirm", { kind: "text", max: 2000, multiline: true }], // open question for the owner
  ["color", { kind: "color" }],
  ["top", { kind: "color" }],
  ["kind", { kind: "token" }],
  ["finish", { kind: "token" }],
  ["header", { kind: "token" }],
  ["trimTex", { kind: "token" }],
  ["style", { kind: "token" }],
  ["lights", { kind: "token" }],
  ["brand", { kind: "token" }],
  ["brand2", { kind: "token" }],
  ["shape", { kind: "shape" }],
  ["fixed", { kind: "bool" }],
  ["wainscot", { kind: "bool" }],
  ["clerestory", { kind: "bool" }],
  ["solid", { kind: "bool" }],
  ["locked", { kind: "bool" }],
  ["led", { kind: "bool" }],
  ["brandfloor", { kind: "bool" }],
  ["fasciaN", { kind: "bool" }],
  ["fasciaE", { kind: "bool" }],
  ["status", { kind: "status" }],
  ["open", { kind: "open" }],
  ["poly", { kind: "poly" }], // outline in store coordinates (survey items with a chamfered corner)
  // department blocks (type "area") only
  ["cat", { kind: "cat", area: true }],
  ["pts", { kind: "pts", area: true }],
  ["lockArea", { kind: "bool", area: true }],
  ["groups", { kind: "groups", area: true }],
]);
const REQUIRED = ["x", "y", "w", "d"];

class Bad extends Error {
  constructor(error, field, extra = {}) {
    super(error);
    this.field = field;
    this.extra = extra;
  }
}

function point(p, lo, hi, field) {
  if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1]) || p[0] < lo || p[0] > hi || p[1] < lo || p[1] > hi) {
    throw new Bad(`A corner point is out of range.`, field);
  }
  return [round4(p[0]), round4(p[1])];
}

function fieldValue(k, rule, v, item, cats) {
  switch (rule.kind) {
    case "num": {
      if (!isNum(v)) throw new Bad(`"${k}" must be a number.`, k);
      const r = round4(v);
      if (r > rule.max || r < rule.min || (rule.openMin && r <= rule.min)) throw new Bad(`"${k}" is out of range.`, k);
      return r;
    }
    case "int":
      if (!Number.isInteger(v) || v < rule.min || v > rule.max) throw new Bad(`"${k}" must be a whole number from ${rule.min} to ${rule.max}.`, k);
      return v;
    case "rot":
      if (!isNum(v) || Math.abs(v) > 3600) throw new Bad(`"rot" must be an angle in degrees.`, k);
      return normRot(v);
    case "text": {
      const s = cleanText(v, rule.max, rule.multiline);
      if (s === null) throw new Bad(`"${k}" must be text of at most ${rule.max} characters.`, k);
      return s;
    }
    case "color":
      if (typeof v !== "string" || !COLOR_RE.test(v)) throw new Bad(`"${k}" must be a colour like #006cb4.`, k);
      return v;
    case "token":
      if (typeof v !== "string" || !TOKEN_RE.test(v)) throw new Bad(`"${k}" has a value the map doesn't know.`, k);
      return v;
    case "bool":
      if (typeof v !== "boolean") throw new Bad(`"${k}" must be true or false.`, k);
      return v;
    case "status":
      if (!ITEM_STATUSES.includes(v)) throw new Bad(`"status" must be proposed, confirmed or needs_review.`, k);
      return v;
    case "shape":
      if (item.type === "area") {
        if (!AREA_SHAPES.includes(v)) throw new Bad(`A department's shape must be rect or poly.`, k);
      } else if (typeof v !== "string" || !TOKEN_RE.test(v)) throw new Bad(`"shape" has a value the map doesn't know.`, k);
      return v;
    case "open": {
      if (!isObj(v)) throw new Bad(`"open" must describe the open sides.`, k);
      const o = {};
      if (has(v, "sides")) {
        if (!Array.isArray(v.sides) || v.sides.length > 4 || !v.sides.every((s) => SIDES.has(s)) || new Set(v.sides).size !== v.sides.length) {
          throw new Bad(`"open.sides" must list some of N, S, E, W.`, k);
        }
        o.sides = [...v.sides];
      }
      if (has(v, "w")) {
        if (!isNum(v.w) || round4(v.w) <= 0 || round4(v.w) > 20) throw new Bad(`"open.w" is out of range.`, k);
        o.w = round4(v.w);
      }
      return o;
    }
    case "poly": {
      if (!Array.isArray(v) || v.length < 3 || v.length > LIMITS.maxPolyPoints) throw new Bad(`"poly" must have 3 to ${LIMITS.maxPolyPoints} corners.`, k);
      return v.map((p) => point(p, -100, 400, k));
    }
    case "pts": {
      if (!Array.isArray(v) || v.length < LIMITS.minPts || v.length > LIMITS.maxPts) throw new Bad(`A department shape must have ${LIMITS.minPts} to ${LIMITS.maxPts} corners.`, k);
      return v.map((p) => point(p, -LIMITS.ptsAbs, LIMITS.ptsAbs, k));
    }
    case "cat":
      if (typeof v !== "string" || !CATEGORY_KEY_RE.test(v) || !(DEFAULTS.has(v) || cats.has(v))) throw new Bad(`This department block uses a category the map doesn't have.`, k);
      return v;
    case "groups": {
      if (!Array.isArray(v) || v.length > LIMITS.maxGroups) throw new Bad(`"groups" can have at most ${LIMITS.maxGroups} entries.`, k);
      return v.map((g) => {
        if (!isObj(g)) throw new Bad(`A group must have a label and a share.`, k);
        const label = cleanText(g.label, 40);
        if (!label) throw new Bad(`A group label must be 1 to 40 characters.`, k);
        if (!isNum(g.share) || g.share < 0 || g.share > 1) throw new Bad(`A group share must be between 0 and 1.`, k);
        return { label, share: round4(g.share) };
      });
    }
    default:
      throw new Bad(`"${k}" isn't allowed.`, k);
  }
}

/** One item -> a clean copy (allow-listed fields only). Throws Bad. `cats` = custom category keys of the map. */
function cleanItem(raw, cats) {
  if (!isObj(raw)) throw new Bad("Every item must be an object.", "items");
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) throw new Bad("An item has a missing or bad id (letters, numbers, - and _, up to 40).", "id");
  if (typeof raw.type !== "string" || !TYPE_SET.has(raw.type)) throw new Bad("An item has a type the map doesn't know.", "type");
  const out = {};
  for (const k of Object.keys(raw)) {
    if (k === "id" || k === "type") {
      out[k] = raw[k];
      continue;
    }
    const rule = ITEM_FIELDS.get(k);
    if (!rule || (rule.area && raw.type !== "area")) continue; // unknown field: dropped
    if (raw[k] === undefined) continue;
    out[k] = fieldValue(k, rule, raw[k], raw, cats);
  }
  for (const k of REQUIRED) if (!has(out, k)) throw new Bad(`"${k}" is missing.`, k);
  if (raw.type === "area") {
    if (!has(out, "cat")) throw new Bad("A department block needs a category.", "cat");
    if (!has(out, "shape")) out.shape = "rect";
    if (out.shape === "poly" && !has(out, "pts")) throw new Bad("A polygon department needs its corners.", "pts");
    if (!has(out, "h")) out.h = AREA_DEFAULT_H;
  }
  return out;
}

// ---------- categories ----------

/** One CategoryDef -> a clean copy. Throws Bad. Defaults may be overridden by key; custom keys start with c_. */
function cleanCategory(raw) {
  if (!isObj(raw)) throw new Bad("Every category must be an object.", "categories");
  const key = raw.key;
  if (typeof key !== "string" || !CATEGORY_KEY_RE.test(key)) throw new Bad("A category has a missing or bad key.", "key");
  const isDefault = DEFAULTS.has(key);
  if (!isDefault && !/^c_[a-z0-9_]{1,30}$/.test(key)) throw new Bad("A new category's key must start with c_.", "key", { category: key });
  const out = { key };
  const fail = (msg, field) => {
    throw new Bad(msg, field, { category: key });
  };
  if (has(raw, "name")) {
    const s = cleanText(raw.name, 40);
    if (!s) fail("A category name must be 1 to 40 characters.", "name");
    out.name = s;
  }
  if (has(raw, "color")) {
    if (typeof raw.color !== "string" || !COLOR_RE.test(raw.color)) fail("A category colour must look like #006cb4.", "color");
    out.color = raw.color;
  }
  if (has(raw, "family")) {
    if (!FAMILIES.has(raw.family)) fail("A category family must be one of the catalog families or custom.", "family");
    out.family = raw.family;
  }
  if (has(raw, "subcats")) {
    if (!Array.isArray(raw.subcats) || raw.subcats.length > LIMITS.maxSubcats) fail(`A category can list at most ${LIMITS.maxSubcats} subcategories.`, "subcats");
    const list = [];
    for (const s of raw.subcats) {
      const t = cleanText(s, 80);
      if (t === null) fail("Each subcategory must be text of at most 80 characters.", "subcats");
      if (t) list.push(t);
    }
    out.subcats = list;
  }
  if (has(raw, "notes")) {
    const s = cleanText(raw.notes, 500, true);
    if (s === null) fail("Category notes must be at most 500 characters.", "notes");
    out.notes = s;
  }
  if (has(raw, "targetSqft")) {
    if (!isNum(raw.targetSqft) || raw.targetSqft < 0 || raw.targetSqft > 20000) fail("A target must be 0 to 20,000 sq ft.", "targetSqft");
    out.targetSqft = round4(raw.targetSqft);
  }
  if (has(raw, "hidden")) {
    if (typeof raw.hidden !== "boolean") fail('"hidden" must be true or false.', "hidden");
    out.hidden = raw.hidden;
  }
  if (!isDefault) {
    if (!out.name) fail("A new category needs a name.", "name");
    if (!out.color) fail("A new category needs a colour.", "color");
  }
  return out;
}

// ---------- the whole map ----------

/**
 * Validates and cleans a map's data. Returns {ok: true, data} with a new object, or
 * {ok: false, error, field, itemId} (plus `category` for a bad category) without throwing.
 */
export function validateMapData(data) {
  let itemId = null;
  try {
    if (!isObj(data)) throw new Bad("The map data must be an object.", "data");
    if (!Array.isArray(data.items)) throw new Bad("The map data needs an items list.", "items");
    if (data.items.length > LIMITS.maxItems) throw new Bad(`A map can hold at most ${LIMITS.maxItems} items.`, "items");
    const out = { items: [], categories: [] };

    // categories first: area items may use the map's own custom categories
    const custom = new Set();
    if (has(data, "categories") && data.categories !== undefined) {
      if (!Array.isArray(data.categories)) throw new Bad("categories must be a list.", "categories");
      if (data.categories.length > LIMITS.maxCategories) throw new Bad(`A map can have at most ${LIMITS.maxCategories} category entries.`, "categories");
      const seen = new Set();
      for (const raw of data.categories) {
        const c = cleanCategory(raw);
        if (seen.has(c.key)) throw new Bad("Two categories have the same key.", "key", { category: c.key });
        seen.add(c.key);
        if (!DEFAULTS.has(c.key)) custom.add(c.key);
        out.categories.push(c);
      }
    }

    const ids = new Set();
    for (const raw of data.items) {
      itemId = isObj(raw) && typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : null;
      const it = cleanItem(raw, custom);
      if (ids.has(it.id)) throw new Bad("Two items have the same id.", "id");
      ids.add(it.id);
      out.items.push(it);
    }
    itemId = null;

    if (has(data, "building") && data.building !== undefined) {
      const b = data.building;
      if (!isObj(b)) throw new Bad("building must give the length and width.", "building");
      const nb = {};
      for (const k of ["length", "width"]) {
        if (!has(b, k)) continue;
        if (!isNum(b[k]) || round4(b[k]) <= 0 || round4(b[k]) > 400) throw new Bad(`building.${k} is out of range.`, "building");
        nb[k] = round4(b[k]);
      }
      out.building = nb;
    }

    if (byteLength(JSON.stringify(out)) > LIMITS.maxBytes) throw new Bad("This map is too big to save (over 400 KB).", "data");
    return { ok: true, data: out };
  } catch (e) {
    if (!(e instanceof Bad)) return { ok: false, error: "The map data isn't valid.", field: "data", itemId };
    return { ok: false, error: e.message, field: e.field, itemId, ...e.extra };
  }
}

/** A blank store made from a map: only the structure items (and the map's category definitions). */
export function structureOnly(data) {
  const out = { items: (data.items || []).filter(isStructure).map((it) => ({ ...it })), categories: (data.categories || []).map((c) => ({ ...c })) };
  if (data.building) out.building = { ...data.building };
  return out;
}

/** "  My   map " -> "My map"; null unless 1-60 characters. */
export function cleanMapName(v) {
  const s = cleanText(v, LIMITS.mapNameMax);
  if (!s) return null;
  return s.replace(/\s+/g, " ");
}
