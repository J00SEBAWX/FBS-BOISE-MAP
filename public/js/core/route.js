/* The URL hash: which display is open, which view mode and which map. Pure: no DOM.
 *   #plan                         the master map (or whatever was open), plan display, Area Planning
 *   #plan&map=m_abc123            someone's map
 *   #3d&advisor&master            the master map, 3D display, Advisor mode
 *   #plan&comparison&map=m_1      a map in Comparison mode
 * Parts may come in any order; unknown parts are ignored. The old one-word hashes (#plan, #3d, #walk) still
 * work, and the Phase 2 "#categories" opens the plan in Area Planning. */
export const VIEWS = Object.freeze(["plan", "3d", "walk"]);
export const MODES = Object.freeze(["blank", "current", "planning", "comparison", "advisor"]);
export const DEFAULT_MODE = "planning";
const MAP_ID = /^m_[A-Za-z0-9_-]{1,60}$/;

/** "#plan&advisor&map=m_1" -> {view: "plan", mode: "advisor", map: "m_1"}; map is "master", an id, or null; mode null when the hash doesn't say. */
export function parseHash(hash) {
  const out = {view: null, mode: null, map: null};
  const s = String(hash || "").replace(/^#/, "");
  if (!s) return out;
  for (const part of s.split("&")) {
    if (VIEWS.includes(part)) out.view = part;
    else if (part === "categories") { out.view = "plan"; out.mode = "planning"; }
    else if (MODES.includes(part)) out.mode = part;
    else if (part === "master") out.map = "master";
    else if (part.startsWith("map=")) { let id = ""; try { id = decodeURIComponent(part.slice(4)); } catch { id = ""; } if (MAP_ID.test(id)) out.map = id; }
  }
  return out;
}

/** {view, mode, map} -> "#plan&advisor&map=m_1" (the default mode, Area Planning, is left out; "#" alone never comes out of a known view). */
export function buildHash({view, mode, map} = {}) {
  const parts = [];
  if (VIEWS.includes(view)) parts.push(view);
  if (MODES.includes(mode) && mode !== DEFAULT_MODE) parts.push(mode);
  if (map === "master") parts.push("master");
  else if (typeof map === "string" && MAP_ID.test(map)) parts.push("map=" + encodeURIComponent(map));
  return "#" + parts.join("&");
}

/** Is this a map id the app would put in the hash? */
export const isMapId = id => typeof id === "string" && MAP_ID.test(id);
