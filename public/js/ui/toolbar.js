/* The tool bar (role="toolbar"): one Tab stop for the whole bar, and the arrow keys (Left / Right, Home / End)
 * move between the tools that show in the current view (docs/DESIGN.md 10: "role=toolbar with roving tabindex").
 * The Layers popover inside it keeps its own keys. */
import {focusEl} from "./dom.js";
export function initToolbar(bar) {
  const all = () => [...bar.querySelectorAll(":scope > button, :scope > .layers-wrap > button, :scope > .add-wrap > button, :scope > .more-wrap > button")];
  const shown = () => all().filter(b => b.offsetParent);
  let current = null;
  function sync() {
    const list = shown();
    if (!list.includes(current)) current = list[0] || null;
    for (const b of all()) b.tabIndex = b === current ? 0 : -1;
  }
  bar.addEventListener("focusin", e => { if (all().includes(e.target) && e.target !== current) { current = e.target; sync(); } });
  bar.addEventListener("keydown", e => {
    const list = shown(), i = list.indexOf(e.target);
    if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return; // inside the Layers popover: its own keys
    const n = e.key === "ArrowRight" ? list[(i + 1) % list.length] : e.key === "ArrowLeft" ? list[(i - 1 + list.length) % list.length]
      : e.key === "Home" ? list[0] : e.key === "End" ? list[list.length - 1] : null;
    if (!n) return;
    e.preventDefault(); e.stopPropagation(); // the map's own arrow keys don't fire
    focusEl(n, {reveal: false});
  });
  sync();
  return {sync};
}
