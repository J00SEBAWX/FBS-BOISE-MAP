/* Comparing two maps (a person's map against the master): what was added, removed and changed, in plain
 * words, plus the change list POST /api/master/apply takes. Pure: no DOM.
 *
 * diffMaps(base, other) -> {added, removed, changed, categories, rows, changes, count, text}
 *   row = {group: "added" | "removed" | "changed" | "category", id | category, type, name, kinds, text,
 *          details: [sentence], before, after, changes: [{id | category, action}]}
 *   kinds (items): moved, resized, rotated, renamed, recoloured, other
 *   kinds (categories): added, removed, renamed, recoloured, target, hidden, shown, other
 * row.changes is what "Apply to master" sends for that row (it includes anything the row can't be applied
 * without, e.g. deleting a custom category also deletes the master's blocks that use it). Float noise is
 * ignored: lengths under POS_EPS ft, angles under ANG_EPS degrees. */
import {formatFtIn} from "./units.js";
import {TYPES, displayName} from "./model.js";
import {deepEqual} from "./doc.js";
import {blockArea} from "./areas.js";
import {gridRef} from "./collisions.js";
import {CATALOG, mergeCategories} from "../shared/catalog.js";

export const POS_EPS = 0.01;  // ft
export const ANG_EPS = 0.1;   // degrees

/* ---------- words ---------- */
/** 4.5 -> 4'6"; under half an inch -> under 1". */
export function lengthText(v) {
  const s = formatFtIn(Math.abs(v), {compact: true});
  return s === "0'" ? 'under 1"' : s;
}
/** A move in compass words: "4'6\" north", "6' east and 2'6\" north" (the bigger part first). */
export function compassText(dx, dy) {
  const parts = [];
  if (Math.abs(dx) >= POS_EPS) parts.push({v: Math.abs(dx), t: `${lengthText(dx)} ${dx > 0 ? "east" : "west"}`});
  if (Math.abs(dy) >= POS_EPS) parts.push({v: Math.abs(dy), t: `${lengthText(dy)} ${dy > 0 ? "north" : "south"}`});
  parts.sort((a, b) => b.v - a.v);
  return parts.map(p => p.t).join(" and ");
}
const sqftText = v => `${Math.round(v).toLocaleString("en-US")} sq ft`;
const signedSqft = v => (Math.abs(v) < 0.5 ? "same area" : `${v > 0 ? "+" : "-"}${Math.round(Math.abs(v)).toLocaleString("en-US")} sq ft`);
const angleDiff = (a, b) => ((((b - a) % 360) + 540) % 360) - 180; // signed, in (-180, 180]
const degText = v => `${Math.round(v * 10) / 10}°`;
const q = s => `“${s}”`; // curly quotes around names (DESIGN 6), like the Review panel
const label = it => displayName(it).replace(/\s+/g, " ").trim() || (TYPES[it.type] || {}).label || "item";
const typeWord = it => (it.type === "area" ? "department block" : ((TYPES[it.type] || {}).label || it.type).toLowerCase());
const areaOf = it => (it.type === "area" ? blockArea(it) : it.w * it.d);

/* ---------- comparing values ---------- */
const GEOM = new Set(["x", "y", "w", "d", "h", "rot", "pts", "shape", "name", "color"]);
function sameValue(a, b) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < POS_EPS;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!sameValue(a[k], b[k])) return false;
    return true;
  }
  return a === b || (a === undefined && b === null) || (a === null && b === undefined);
}
// what the "other" kind calls a field
const FIELD_WORDS = {
  notes: "notes", top: "top colour", cat: "department", lockArea: "area lock", status: "status", fixed: "fixed",
  locked: "lock", brand: "brand", brand2: "second brand", kind: "kind", finish: "floor finish", style: "style",
  open: "desk openings", groups: "brand groups", ceil: "ceiling height", cham: "corner cut", lights: "lights",
  header: "header", trimTex: "trim", wainscot: "wainscot", clerestory: "clerestory", glass: "glass", sill: "sill height", ledge: "ledge height", solid: "solid", led: "LED",
  brandfloor: "brand floor", sky: "skylights", fans: "fans", fasciaN: "north fascia", fasciaE: "east fascia",
  fasciaTo: "fascia height", toConfirm: "open question", src: "source", poly: "outline", type: "type",
};

// A one-sided resize moves the centre by half the size change along the item's own axes (checked in the old
// and the new rotation, since a resize may come before or after a turn).
function resizeShift(a, b) {
  const dw = Math.abs(b.w - a.w), dd = Math.abs(b.d - a.d);
  if (dw < POS_EPS && dd < POS_EPS) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  const fits = (m, ds) => Math.abs(m) < POS_EPS || Math.abs(Math.abs(m) - ds / 2) < POS_EPS;
  return [a.rot || 0, b.rot || 0].some(rot => {
    const r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return fits(dx * c + dy * s, dw) && fits(-dx * s + dy * c, dd);
  });
}

/** Describes how one item changed: {kinds, details} (empty kinds = no real change). */
export function describeItemChange(a, b) {
  const kinds = [], details = [];
  const name = label(b);
  const reshaped = a.type === "area" && b.type === "area" && (a.shape !== b.shape || !sameValue(a.pts || null, b.pts || null));
  // moved (unless the shift is just a resize that kept one side in place)
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!reshaped && (Math.abs(dx) >= POS_EPS || Math.abs(dy) >= POS_EPS) && !resizeShift(a, b)) {
    kinds.push("moved");
    details.push(`Moved ${q(name)} ${compassText(dx, dy)}`);
  }
  // resized (and reshaped polygons)
  if (reshaped) {
    kinds.push("resized");
    const corners = b.shape === "poly" && Array.isArray(b.pts) ? `${b.pts.length} corners` : "a rectangle";
    details.push(`Reshaped ${q(name)} (now ${corners}, ${sqftText(areaOf(b))}, ${signedSqft(areaOf(b) - areaOf(a))})`);
  } else if (Math.abs(b.w - a.w) >= POS_EPS || Math.abs(b.d - a.d) >= POS_EPS) {
    kinds.push("resized");
    details.push(`Resized ${q(name)} from ${lengthText(a.w)} x ${lengthText(a.d)} to ${lengthText(b.w)} x ${lengthText(b.d)} (${signedSqft(areaOf(b) - areaOf(a))})`);
  }
  if (Math.abs((b.h ?? 0) - (a.h ?? 0)) >= POS_EPS && (a.h !== undefined || b.h !== undefined)) {
    if (!kinds.includes("resized")) kinds.push("resized");
    details.push(`Changed the height of ${q(name)} from ${lengthText(a.h ?? 0)} to ${lengthText(b.h ?? 0)}`);
  }
  // rotated
  const da = angleDiff(a.rot || 0, b.rot || 0);
  if (Math.abs(da) >= ANG_EPS) {
    kinds.push("rotated");
    details.push(`Rotated ${q(name)} ${degText(Math.abs(da))} ${da > 0 ? "counter-clockwise" : "clockwise"} (${degText(a.rot || 0)} to ${degText(b.rot || 0)})`);
  }
  // renamed, recoloured
  if ((a.name || "") !== (b.name || "")) {
    kinds.push("renamed");
    details.push(`Renamed ${q(a.name || label(a))} to ${q(b.name || label(b))}`);
  }
  if (String(a.color || "").toLowerCase() !== String(b.color || "").toLowerCase()) {
    kinds.push("recoloured");
    details.push(`Recoloured ${q(name)} from ${a.color || "the default"} to ${b.color || "the default"}`);
  }
  // everything else
  const other = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "id" || GEOM.has(k)) continue;
    if (!sameValue(a[k], b[k])) other.push(k);
  }
  if (other.length) {
    kinds.push("other");
    if (other.length === 1 && other[0] === "status") details.push(`Marked ${q(name)} ${String(b.status || "proposed").replace("_", " ")}`);
    else details.push(`Changed ${q(name)}: ${other.map(k => FIELD_WORDS[k] || k).join(", ")}`);
  }
  return {kinds, details};
}

/* ---------- categories ---------- */
function categoryRows(base, other) {
  const bRaw = new Map((base.categories || []).map(c => [c.key, c]));
  const oRaw = new Map((other.categories || []).map(c => [c.key, c]));
  const bEff = new Map(mergeCategories(CATALOG.areas, base.categories || []).map(c => [c.key, c]));
  const oEff = new Map(mergeCategories(CATALOG.areas, other.categories || []).map(c => [c.key, c]));
  const rows = [];
  const keys = [...new Set([...bRaw.keys(), ...oRaw.keys()])];
  for (const key of keys) {
    const b = bEff.get(key) || null, o = oEff.get(key) || null;
    const change = {category: key, action: oRaw.has(key) ? "upsert" : "delete"};
    if (!b && o) {
      rows.push(catRow(key, ["added"], [`New category ${q(o.name)}${o.targetSqft > 0 ? ` (target ${sqftText(o.targetSqft)})` : ""}`], null, oRaw.get(key), [change]));
      continue;
    }
    if (b && !o) {
      // the master can't keep blocks of a category it no longer has: delete them with it
      const stray = (base.items || []).filter(it => it.type === "area" && it.cat === key).map(it => ({id: it.id, action: "delete"}));
      rows.push(catRow(key, ["removed"], [`Removed category ${q(b.name)}${stray.length ? ` and its ${stray.length} block${stray.length > 1 ? "s" : ""}` : ""}`], bRaw.get(key), null, [change, ...stray]));
      continue;
    }
    if (!b || !o) continue;
    const kinds = [], details = [];
    if (b.name !== o.name) { kinds.push("renamed"); details.push(`Renamed category ${q(b.name)} to ${q(o.name)}`); }
    if (String(b.color).toLowerCase() !== String(o.color).toLowerCase()) { kinds.push("recoloured"); details.push(`Recoloured ${q(o.name)} from ${b.color} to ${o.color}`); }
    if (Math.abs((b.targetSqft || 0) - (o.targetSqft || 0)) >= 0.5) { kinds.push("target"); details.push(`Target for ${q(o.name)} ${sqftText(b.targetSqft || 0)} to ${sqftText(o.targetSqft || 0)}`); }
    if (!!b.hidden !== !!o.hidden) { kinds.push(o.hidden ? "hidden" : "shown"); details.push(o.hidden ? `Hid ${q(o.name)}` : `Showed ${q(o.name)} again`); }
    const rest = ["family", "subcats", "notes"].filter(k => !deepEqual(b[k] ?? null, o[k] ?? null));
    if (rest.length) { kinds.push("other"); details.push(`Changed ${q(o.name)}: ${rest.map(k => ({family: "family", subcats: "subcategories", notes: "notes"})[k]).join(", ")}`); }
    if (kinds.length) rows.push(catRow(key, kinds, details, bRaw.get(key) || null, oRaw.get(key) || null, [change]));
  }
  return rows;
}
const catRow = (key, kinds, details, before, after, changes) => ({group: "category", category: key, type: "category", name: (after || before || {}).name || key, kinds, text: details.join("; "), details, before, after, changes});

/* ---------- the diff ---------- */
/**
 * base: the master's data, other: the map being reviewed (both {items, categories}).
 * Rows come in map order (removed and changed in the base's order, added in the other map's order).
 */
export function diffMaps(base, other) {
  const bItems = (base && base.items) || [], oItems = (other && other.items) || [];
  const bById = new Map(bItems.map(it => [it.id, it])), oById = new Map(oItems.map(it => [it.id, it]));
  const added = [], removed = [], changed = [];
  for (const a of bItems) {
    const b = oById.get(a.id);
    if (!b) {
      removed.push({group: "removed", id: a.id, type: a.type, name: label(a), kinds: [], text: `Removed ${typeWord(a)} ${q(label(a))}`, details: [`Removed ${typeWord(a)} ${q(label(a))}`], before: a, after: null, changes: [{id: a.id, action: "delete"}]});
      continue;
    }
    const {kinds, details} = describeItemChange(a, b);
    if (kinds.length) changed.push({group: "changed", id: a.id, type: b.type, name: label(b), kinds, text: details.join("; "), details, before: a, after: b, changes: [{id: a.id, action: "upsert"}]});
  }
  for (const b of oItems) {
    if (bById.has(b.id)) continue;
    const size = b.type === "area" ? sqftText(areaOf(b)) : `${lengthText(b.w)} x ${lengthText(b.d)}`;
    const t = `Added ${typeWord(b)} ${q(label(b))} (${size}) ${gridRef(b.x, b.y)}`;
    added.push({group: "added", id: b.id, type: b.type, name: label(b), kinds: [], text: t, details: [t], before: null, after: b, changes: [{id: b.id, action: "upsert"}]});
  }
  const categories = categoryRows(base || {}, other || {});
  const rows = [...categories, ...added, ...removed, ...changed];
  const changes = dedupe(rows.flatMap(r => r.changes));
  const count = {added: added.length, removed: removed.length, changed: changed.length, categories: categories.length, total: rows.length};
  const parts = [];
  if (count.added) parts.push(`${count.added} added`);
  if (count.removed) parts.push(`${count.removed} removed`);
  if (count.changed) parts.push(`${count.changed} changed`);
  if (count.categories) parts.push(`${count.categories} category change${count.categories > 1 ? "s" : ""}`);
  return {added, removed, changed, categories, rows, changes, count, text: parts.length ? parts.join(", ") : "No differences"};
}

/** One change per item / category (the first action wins), in order: what "Apply all" sends. */
export function dedupe(changes) {
  const seen = new Set(), out = [];
  for (const c of changes) {
    const k = c.id !== undefined ? "i:" + c.id : "c:" + c.category;
    if (seen.has(k)) continue;
    seen.add(k); out.push(c);
  }
  return out;
}
/** The change list for a selection of rows (e.g. the ticked ones). */
export const changesFor = rows => dedupe(rows.flatMap(r => r.changes));
