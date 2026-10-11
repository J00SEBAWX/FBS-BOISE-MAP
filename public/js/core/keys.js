/* Which keyboard events are the map's shortcuts, and which belong to whatever the person is typing in. Pure: no DOM
 * access beyond the element handed in (the tests pass small stand-ins).
 *
 * A digit switches the view mode, Backspace / Delete removes the selected item, letters pick tools: all of that is only for
 * a hand that is on the map, never for text going into a field. The risk is the moment a field loses focus: a field commits
 * as it blurs, and for an instant (or for good, after a click on something that cannot take focus) focus is on the page
 * itself; the next keystrokes must not then act as shortcuts. So:
 *   - events from a field, a list, a menu or an open dialog are never shortcuts (isTyping);
 *   - for COMMIT_QUIET_MS after a field of the inspector committed a change, events aimed at the page itself are ignored too;
 *   - Delete / Backspace remove the selection only when the plan or the 3D view itself has focus (deleteAllowed), or, on a
 *     touch screen where a tap on the plan does not give it focus, when the last press anywhere was on the plan or 3D view. */

export const COMMIT_QUIET_MS = 2000;
const TYPING_TAG = /^(INPUT|SELECT|TEXTAREA)$/;
const TYPING_ROLE = '[role="textbox"], [role="combobox"], [role="listbox"], [role="menu"], [role="menubar"], [role="searchbox"], [role="spinbutton"], [contenteditable]:not([contenteditable="false"]), dialog[open]';

/** Is this event target somewhere keys mean text (a field, an editable box) or navigation inside a menu / dialog? */
export function isTyping(t) {
  if (!t || t.nodeType !== 1) return false;
  if (TYPING_TAG.test(t.tagName || "")) return true;
  if (t.isContentEditable) return true;
  return !!(typeof t.closest === "function" && t.closest(TYPING_ROLE));
}

/** The drawing surfaces: the floor plan (either one) and the 3D / walk view. */
export function isSurface(t) {
  if (!t || t.nodeType !== 1) return false;
  if (t.id === "planCanvas" || t.id === "planCanvasA" || t.id === "three") return true;
  return !!(typeof t.closest === "function" && t.closest("#three"));
}

/** Is the page itself (nothing in particular) the target? */
export const isPage = (t, doc) => !t || t === (doc && doc.body) || t === (doc && doc.documentElement);

/**
 * Should a key event be ignored by the map's shortcuts? `lastCommitAt` / `now` are performance.now() values.
 * Escape and the browser's own chords (Ctrl / Cmd) are never swallowed here.
 */
export function ignoreShortcut(e, t, {doc, lastCommitAt = -Infinity, now = 0} = {}) {
  if (isTyping(t)) return true;
  if (isPage(t, doc) && now - lastCommitAt < COMMIT_QUIET_MS && e.code !== "Escape" && !e.ctrlKey && !e.metaKey) return true;
  return false;
}

/**
 * May Delete / Backspace remove the selected item? From the plan or the 3D view, never from a field, a button or the page
 * at large. `surfaceActive` = the last press (pointerdown) landed on the plan or 3D view and nothing else has taken focus
 * since: a tap on a touch screen leaves the page itself focused, which is fine then (an iPad with a keyboard).
 */
export function deleteAllowed(t, {doc, surfaceActive = false} = {}) { return isSurface(t) || (isPage(t, doc) && !!surfaceActive); }
