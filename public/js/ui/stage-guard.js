/* Nothing in the app ever scrolls the stage, the views or the app shell (the plan and the 3D view are drawn to fit; only
 * the sheets, menus and lists inside them scroll). CSS already makes them overflow:clip, which cannot be scrolled at all;
 * this is the second line for browsers that predate it: if one of them ever moves (a focus() or scrollIntoView() inside
 * a phone sheet that is still sliding in used to push the plan out of view for good), it is put straight back. */
const GUARDED = ".stage, .stage-main, .view, .labels3d, .app";

/** Is this element one of the boxes that must never be scrolled? */
export function isGuarded(el) {
  return !!(el && el.nodeType === 1 && typeof el.matches === "function" && el.matches(GUARDED));
}

export function initStageGuard(doc = document) {
  // scroll events do not bubble, so listen while they travel down
  doc.addEventListener("scroll", e => {
    const t = e.target;
    if (isGuarded(t) && (t.scrollTop || t.scrollLeft)) { t.scrollTop = 0; t.scrollLeft = 0; }
  }, true);
}
