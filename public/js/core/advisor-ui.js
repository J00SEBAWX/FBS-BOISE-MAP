/* Advisor mode (OWNER RULES v3.1, rule 6): the pieces between core/advisor.js and the panel that need no DOM:
 * turning a recommendation's Apply into an undoable edit, the score tones, the overlay toggles, the Assumptions
 * form rows (every number labelled: which are thresholds the admin can save, which are the engine's own
 * assumptions) and what "Show me" should pan to. Pure: no DOM. */
import {commit, findItem} from "./doc.js";
import {outline} from "./areas.js";
import {corners} from "./geometry.js";
import {ADVISOR_THRESHOLDS, ADVISOR_RULES, MARGIN_TIERS} from "../shared/advisor-config.js";
import {ADVISOR_ASSUMPTIONS} from "./advisor.js";

/** The overlays the plan and the 3D view can draw, in the order of the toggles. */
export const OVERLAYS = Object.freeze([
  {key: "heat", label: "Heat: hot and cold", hint: "How much of the main traffic passes each spot", on: true},
  {key: "sightlines", label: "Sight lines", hint: "What the sales desks and the front door can see", on: false},
  {key: "paths", label: "Traffic paths", hint: "The main trips: door, desks, will-call, yard", on: true},
  {key: "chokePoints", label: "Choke points", hint: "Narrow spots on those paths", on: true},
  {key: "zones", label: "Entrance and door zones", hint: "The open zone inside the front door and the clearance at every door", on: false},
  {key: "coldSpots", label: "Cold spots", hint: "Floor far from every main path", on: false},
]);
export const defaultOverlays = () => Object.fromEntries(OVERLAYS.map(o => [o.key, o.on]));

/** "good" (80+), "ok" (55+), "poor", or "na" when a principle doesn't apply. */
export function scoreTone(score) {
  if (score === null || score === undefined || !Number.isFinite(score)) return "na";
  return score >= 80 ? "good" : score >= 55 ? "ok" : "poor";
}
export const PRIORITY_LABEL = Object.freeze({high: "High", medium: "Medium", low: "Low", info: "Note"});

/**
 * A recommendation's Apply as a doc edit (so it goes through the history and can be undone):
 * {doc, patch, inverse, ids} or {error}. Every change names an item of the map; only its listed fields change.
 */
export function fixEdits(doc, apply) {
  if (!apply || !Array.isArray(apply.changes) || !apply.changes.length) return {error: "This recommendation has no one-tap fix. Move it by hand."};
  const edits = [], ids = [];
  for (const c of apply.changes) {
    const it = findItem(doc, c.id);
    if (!it) return {error: "The item this fix moves isn't on the map any more."};
    if (!c.to || typeof c.to !== "object") return {error: "This fix is incomplete."};
    const to = {...it};
    for (const [k, v] of Object.entries(c.to)) if (v !== undefined) to[k] = v;
    edits.push({kind: "item", id: c.id, to});
    ids.push(c.id);
  }
  const r = commit(doc, edits);
  if (!r.patch.length) return {error: "Nothing to change: it is already where the fix would put it."};
  return {...r, ids};
}

const shape = it => (it.type === "area" ? outline(it) : it.poly || corners(it));
/** The store-feet box around what a recommendation shows (its items, region and points), or null. */
export function showBounds(show, layout) {
  if (!show) return null;
  const pts = [];
  for (const id of show.ids || []) { const it = layout && layout.byId ? layout.byId.get(id) : null; if (it) pts.push(...shape(it)); }
  for (const p of show.region || []) pts.push(p);
  for (const p of show.points || []) pts.push(p);
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return {x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2};
}

/* ---------- the Assumptions form ---------- */
const THRESHOLD_UNITS = {sizeTolerancePct: "%"};
/**
 * The rows of the Assumptions panel for a config (as GET /api/advisor-config returns it, merged over the
 * defaults by the engine) and the categories on the map:
 * {thresholds: [{path, key, label, value, min, max, unit, saved: true}], departments: [{key, name, margin, theftProne, assumption}],
 *  roles: [{key, label, keys}], rules: [{key, label, why, enabled, weight}], engine: [{key, label, value, min, max}]}
 */
export function configRows(config, categories = []) {
  const cfg = config || {};
  const th = cfg.thresholds || {};
  const thresholds = Object.entries(ADVISOR_THRESHOLDS).map(([key, [def, min, max, label]]) => ({path: "thresholds." + key, key, label, value: Number.isFinite(th[key]) ? th[key] : def, min, max, unit: THRESHOLD_UNITS[key] || "ft", saved: true}));
  const names = new Map((categories || []).map(c => [c.key, c.name]));
  const deps = cfg.departments || {};
  const departments = [...new Set([...(categories || []).map(c => c.key), ...Object.keys(deps)])].map(key => {
    const d = deps[key] || {margin: "medium", theftProne: false, assumption: true};
    return {key, name: names.get(key) || key, margin: MARGIN_TIERS.includes(d.margin) ? d.margin : "medium", theftProne: !!d.theftProne, assumption: d.assumption !== false};
  });
  const roles = [["destination", "Destination (pulls people to the back)"], ["bulky", "Bulky (near the yard doors)"], ["powerWall", "Power wall (right of the entrance)"]]
    .map(([key, label]) => ({key, label, keys: [...(((cfg.roles || {})[key]) || [])]}));
  const rr = cfg.rules || {};
  const rules = ADVISOR_RULES.map(r => ({key: r.key, label: r.label, why: r.why, enabled: (rr[r.key] || {}).enabled !== false, weight: Number.isFinite((rr[r.key] || {}).weight) ? rr[r.key].weight : 1}));
  const as = cfg.assumptions || {};
  const engine = Object.entries(ADVISOR_ASSUMPTIONS).map(([key, [def, min, max, label]]) => ({key, label, value: Number.isFinite(as[key]) ? as[key] : def, min, max}));
  return {thresholds, departments, roles, rules, engine};
}

/**
 * The config to PUT from the form's values: {thresholds, departments, roles, rules, note} (the server fills the
 * rest from the defaults and validates the ranges). values = {thresholds: {key: number}, departments: {key: {margin,
 * theftProne}}, roles: {key: [keys]}, rules: {key: {enabled, weight}}}. Returns {config} or {error, field}.
 */
export function buildConfig(base, values) {
  const cfg = {thresholds: {...((base && base.thresholds) || {})}, departments: {}, roles: {...((base && base.roles) || {})}, rules: {}, note: (base && base.note) || ""};
  for (const [key, [, min, max, label]] of Object.entries(ADVISOR_THRESHOLDS)) {
    const v = values.thresholds && values.thresholds[key] !== undefined ? Number(values.thresholds[key]) : cfg.thresholds[key];
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < min || v > max) return {error: `${label}: enter a number between ${min} and ${max}.`, field: "thresholds." + key};
    cfg.thresholds[key] = Math.round(v * 100) / 100;
  }
  for (const [key, d] of Object.entries({...((base && base.departments) || {}), ...(values.departments || {})})) {
    if (!/^[a-z0-9_]{1,32}$/.test(key)) continue;
    const margin = MARGIN_TIERS.includes(d.margin) ? d.margin : "medium";
    cfg.departments[key] = {margin, theftProne: !!d.theftProne, assumption: d.assumption !== false};
  }
  for (const [key, list] of Object.entries(values.roles || {})) if (Array.isArray(list)) cfg.roles[key] = [...new Set(list.filter(k => /^[a-z0-9_]{1,32}$/.test(k)))];
  for (const r of ADVISOR_RULES) {
    const v = (values.rules || {})[r.key] || {}, b = ((base && base.rules) || {})[r.key] || {};
    const weight = v.weight !== undefined ? Number(v.weight) : Number.isFinite(b.weight) ? b.weight : 1;
    if (!Number.isFinite(weight) || weight < 0 || weight > 5) return {error: `${r.label}: the weight must be between 0 and 5.`, field: "rules." + r.key + ".weight"};
    cfg.rules[r.key] = {enabled: v.enabled !== undefined ? !!v.enabled : b.enabled !== false, weight: Math.round(weight * 100) / 100};
  }
  return {config: cfg};
}
