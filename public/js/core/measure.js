/* The "Measure / place" tool's state, shared by the plan and the 3D view. Pure: no DOM.
 * The cursor follows the snapped floor point; the first click pins point A, the second pins B (the
 * distance stays on screen), a third click starts again. */

export function createMeasure() {
  let cursor = null, a = null, b = null;
  return {
    get state() { return {cursor, a, b, distance: a && (b || cursor) ? dist(a, b || cursor) : null}; },
    /** The pointer moved over the floor (p = snapped point {x, y, ...} or null when off the floor). */
    move(p) { cursor = p; },
    /** A click or tap on the floor. Returns "a", "b" or "restart". */
    click(p) {
      cursor = p;
      if (a && !b) { b = p; return "b"; }
      const restarted = !!b;
      a = p; b = null;
      return restarted ? "restart" : "a";
    },
    clear() { cursor = null; a = null; b = null; },
  };
}
const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
