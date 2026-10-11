/* The view modes (OWNER RULES v3.1, rule 4) and what each one shows and allows. Pure: no DOM.
 *   current     Current Layout: the master map's departments and fixtures, read-only
 *   planning    Area Planning: editing the open map (the Phase 2 editor with the Departments palette). It is also the
 *               blank slate: a map started from "a blank store", or Hide fixtures in the Departments list
 *   comparison  Comparison: two layout states side by side or as an overlay diff, with the change list
 *   advisor     Advisor: the retail-flow advisor on the open map
 * The display (Plan | 3D | Walk) is independent of the mode. */
import {MODES} from "./route.js";
import {isStructure} from "./model.js";
export {MODES};

export const MODE_INFO = Object.freeze({
  current: Object.freeze({label: "Current layout", short: "Current", icon: "i-star", key: "1",
    hint: "The confirmed master map as it is today: its departments and fixtures, read-only."}),
  planning: Object.freeze({label: "Area planning", short: "Planning", icon: "i-blocks", key: "2",
    hint: "Place and shape the departments on this map; move fixtures; everything you change is saved to this map."}),
  comparison: Object.freeze({label: "Comparison", short: "Compare", icon: "i-duplicate", key: "3",
    hint: "Two layouts side by side or on top of each other, with every difference listed."}),
  advisor: Object.freeze({label: "Advisor", short: "Advisor", icon: "i-info", key: "4",
    hint: "Retail-flow checks on this map: scores, reasons and one-tap fixes."}),
  review: Object.freeze({label: "Review", short: "Review", icon: "i-review", key: "5", adminOnly: true,
    hint: "The team's proposals against the master map, and the master's history."}),
});
export const isMode = m => MODES.includes(m);

/**
 * What a mode allows: {edit (changes land on the open map), select (items can be picked), palette (the
 * Departments palette), inspector (the right panel), panel (the mode's own left panel: "compare" | "advisor" | null),
 * showsBlocks, showsFixtures, usesMaster (the shown layout is the master, not the open map)}.
 */
export function modeAllows(mode) {
  switch (mode) {
    case "current": return {edit: false, select: false, palette: false, inspector: true, panel: null, showsBlocks: true, showsFixtures: true, usesMaster: true};
    case "comparison": return {edit: false, select: false, palette: false, inspector: false, panel: "compare", showsBlocks: true, showsFixtures: true, usesMaster: false};
    case "advisor": return {edit: false, select: true, palette: false, inspector: false, panel: "advisor", showsBlocks: true, showsFixtures: true, usesMaster: false};
    case "review": return {edit: false, select: false, palette: false, inspector: false, panel: "review", showsBlocks: true, showsFixtures: true, usesMaster: true};
    default: return {edit: true, select: true, palette: true, inspector: true, panel: null, showsBlocks: true, showsFixtures: true, usesMaster: false};
  }
}

/**
 * The layers a display draws in a mode: the person's layer choices with the mode's rules applied
 * (Current Layout and Comparison always show departments). blank: Area planning on a map that can't be changed
 * here shows the blank store (structure and the built-in desks; no fixtures, no departments).
 */
export function modeLayers(mode, L, {blank = false} = {}) {
  const a = modeAllows(mode);
  const out = {...L};
  if (blank && mode === "planning") { out.fixtures = false; out.faint = false; out.categories = false; out.structure = true; }
  if (!a.showsFixtures) { out.fixtures = false; out.faint = false; }
  if (!a.showsBlocks) out.categories = false;
  else if (mode === "current" || mode === "comparison" || mode === "review") out.categories = true;
  return out;
}

/** Is this item drawn (and so selectable) with these layers? `plan`: the floor plan, where hidden fixtures can't be picked. */
export function itemShownIn(it, L, {plan = true} = {}) {
  return !!(it.type === "area" ? L.categories : isStructure(it) ? L.structure : (L.fixtures || !plan));
}

/**
 * The read-only sentence the inspector shows when nothing is selected in a mode (null in Area Planning).
 * legacy: the server isn't ready for maps (core/readiness.js), so there is no Area planning to switch to.
 */
export function modeNotice(mode, {master = false, canEdit = false, legacy = false} = {}) {
  switch (mode) {
    case "current": return "Current layout: the master map as confirmed today. It can't be changed here" + (master || !canEdit ? "." : "; your own map stays as it is.");
    case "comparison": return "Comparison: pick two layouts in the panel on the left; tap a difference to see it on the plan.";
    case "advisor": return "Advisor: the scores and recommendations are in the panel on the left. Show me highlights a spot; Apply makes the change on this map.";
    case "review": return "Review: the team's proposals are in the panel on the left. Open one to see its differences from the master map.";
    default: return null;
  }
}

/**
 * Where to unlock the Structure (walls, doors, columns, floors, stairs) so the Add sheet and the inspector can say
 * it in words that fit the screen: the lock is in More (computer and phone alike); only the Plan has the lock,
 * so the 3D view points there.
 */
export function unlockHint({plan = true} = {}) {
  if (!plan) return "Open the Plan and unlock Structure to add walls, doors, columns, openings or stairs.";
  return "Unlock Structure in More to add walls, doors, columns, openings or stairs.";
}
/** What Delete says when everything selected is locked structure (a wall, door, column, floor or stairs): why nothing happened. */
export function lockedDeleteHint({plan = true} = {}) {
  if (!plan) return "Structure is locked, so it can't be deleted. Open the Plan and unlock Structure first.";
  return "Structure is locked, so it can't be deleted. Unlock Structure in More first.";
}
