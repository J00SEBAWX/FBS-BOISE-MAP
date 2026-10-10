/* Comparison mode (OWNER RULES v3.1, rule 4): two layout states A (the base, the master by default) and B (the
 * open map by default), side by side or as an overlay diff, with the change list from core/diff.js. Pure: no
 * DOM, no fetch; the panel (ui/compare.js) owns the elements and the app fetches the maps. */
import {diffMaps} from "./diff.js";
import {outline} from "./areas.js";
import {corners} from "./geometry.js";

export const LAYOUTS = Object.freeze(["side", "overlay"]);
export const GROUPS = Object.freeze([
  {key: "added", title: "Added", icon: "i-add"},
  {key: "removed", title: "Removed", icon: "i-minus"},
  {key: "changed", title: "Changed", icon: "i-pencil"},
  {key: "category", title: "Categories", icon: "i-blocks"},
]);

/** The state the panel and the plan share. */
export function createCompare({a = "master", b = "master", layout = "side"} = {}) {
  return {a, b, layout: LAYOUTS.includes(layout) ? layout : "side", selected: null};
}

/** One key per row: "i:<item id>" or "c:<category key>". */
export const rowKey = row => (row.group === "category" ? "c:" + row.category : "i:" + row.id);

/** The rows grouped for the list, in DESIGN order (Added, Removed, Changed, Categories); empty groups are left out. */
export function rowGroups(diff) {
  if (!diff) return [];
  return GROUPS.map(g => ({...g, rows: diff.rows.filter(r => r.group === g.key)})).filter(g => g.rows.length);
}

/** The chip icon for a row: added +, removed -, rotated-only gets the rotate icon, everything else the pencil. */
export function kindIcon(row) {
  if (row.group === "added") return "i-add";
  if (row.group === "removed") return "i-minus";
  if (row.group === "category") return row.kinds.includes("added") ? "i-add" : row.kinds.includes("removed") ? "i-minus" : "i-pencil";
  return row.kinds.length === 1 && row.kinds[0] === "rotated" ? "i-rotate" : "i-pencil";
}

/** The ghost outlines for a row: {before, after} items (null when the row has no such state), or nulls for a category row. */
export function ghostOf(row) {
  if (!row || row.group === "category") return {before: null, after: null};
  return {before: row.before || null, after: row.after || null};
}
const shape = it => (it.type === "area" ? outline(it) : it.poly || corners(it));
/** The store-feet box around a row's before and after outlines (to pan the plan there), or null for a category row. */
export function rowBounds(row) {
  const {before, after} = ghostOf(row);
  const pts = [...(before ? shape(before) : []), ...(after ? shape(after) : [])];
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return {x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2};
}

/**
 * The maps a person can pick for either side: the master, their own maps, then the team's (grouped by owner).
 * maps = {mine, team} from GET /api/maps; openMap = {id, name, ownerName, mine} so the open map is listed even
 * before the list loaded. -> [{id, label, group}]
 */
export function pickOptions(maps, openMap = null) {
  const out = [{id: "master", label: "Master map", group: "Master"}];
  const seen = new Set(["master"]);
  const mine = [...((maps && maps.mine) || [])], team = [...((maps && maps.team) || [])];
  if (openMap && openMap.id && openMap.id !== "master" && !mine.some(m => m.id === openMap.id) && !team.some(m => m.id === openMap.id)) (openMap.mine ? mine : team).push(openMap);
  for (const m of mine) { if (seen.has(m.id)) continue; seen.add(m.id); out.push({id: m.id, label: m.name || "Map", group: "My maps"}); }
  for (const m of team.sort((p, q) => String(p.ownerName || "").localeCompare(String(q.ownerName || "")) || (q.updatedAt || 0) - (p.updatedAt || 0))) {
    if (seen.has(m.id)) continue; seen.add(m.id);
    out.push({id: m.id, label: `${m.ownerName ? m.ownerName + " · " : ""}${m.name || "Map"}`, group: "Team maps"});
  }
  return out;
}

/** Can "Apply to master" run? Only the admin, only with the master on the left and a saved map on the right. */
export function canApply({isAdmin, a, b}) {
  if (!isAdmin) return {ok: false, why: "Only the admin can change the master map."};
  if (a !== "master") return {ok: false, why: "Put the master map on the left to apply changes to it."};
  if (b === "master") return {ok: false, why: "Pick a map on the right to apply its changes to the master."};
  return {ok: true, why: ""};
}

/** The sentence for an apply failure: 409 reload, 423 locked, else the server's own words. */
export function applyErrorText(status, message) {
  if (status === 409) return "The master map changed since this comparison loaded. Reload it and try again.";
  if (status === 423) return "The master map is locked. Unlock it in the admin dashboard first.";
  if (status === 404) return "That map isn't available any more.";
  if (status === 0) return "Couldn't reach the site. Check the connection and try again.";
  return message || "Couldn't apply the change.";
}

/** "8 differences" / "1 difference" / "No differences" plus the from/to names. */
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export function countText(diff, aName, bName) {
  const n = diff ? diff.count.total : 0;
  if (!n) return `No differences. ${cap(bName)} matches ${aName}.`;
  return `${n} difference${n === 1 ? "" : "s"} in ${bName} from ${aName}. Tap one to see it on the plan.`;
}

/** The diff of two map documents (A = base, B = other), or null while either is missing. */
export const compareDocs = (docA, docB) => (docA && docB ? diffMaps(docA, docB) : null);
