/* The header's two segmented controls: the view MODE (Blank slate | Current layout | Area planning | Comparison |
 * Advisor; OWNER RULES v3.1 rule 4) and the DISPLAY (Plan | 3D | Walk). Both are tablists: arrow keys move
 * between the tabs, the URL hash reflects the display, the mode and the open map (core/route.js), and the last
 * display and mode are remembered on this device. */
import {VIEWS, MODES, DEFAULT_MODE, parseHash, buildHash} from "../core/route.js";
import {focusEl} from "./dom.js";
export {VIEWS, MODES};
const KEY = "fbs-view", MODE_KEY = "fbs-mode";

/** The display to open first: the URL hash, else the last one used here, else 3D. */
export function initialView() {
  const h = parseHash(location.hash);
  if (h.view) return h.view;
  try { const v = localStorage.getItem(KEY); if (VIEWS.includes(v)) return v; } catch { /* no storage */ }
  return "3d";
}
/** The mode to open first: the URL hash, else the last one used here, else Area planning. */
export function initialMode() {
  const h = parseHash(location.hash);
  if (h.mode) return h.mode;
  try { const m = localStorage.getItem(MODE_KEY); if (MODES.includes(m)) return m; } catch { /* no storage */ }
  return DEFAULT_MODE;
}

function tablist(all, attr, onSelect) {
  // the keys move between the tabs that show right now: some are hidden for a while (Review for members, the modes
  // that need the server while it isn't ready), so the list is read at key time
  const shown = () => all.filter(t => !t.hidden);
  for (const t of all) {
    t.addEventListener("click", () => onSelect(t.dataset[attr]));
    t.addEventListener("keydown", e => {
      const tabs = shown(), i = tabs.indexOf(t), d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      let n = null;
      if (d && i >= 0) n = tabs[(i + d + tabs.length) % tabs.length];
      else if (e.key === "Home") n = tabs[0];
      else if (e.key === "End") n = tabs[tabs.length - 1];
      if (!n) return;
      e.preventDefault(); e.stopPropagation();
      focusEl(n, {reveal: false}); onSelect(n.dataset[attr]);
    });
  }
  return v => { for (const t of all) { const on = t.dataset[attr] === v; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; } };
}

/**
 * initTabs({onSelect(view), onMode(mode), getMap()}) -> {set(view), setMode(mode), writeHash()} : marks the tabs
 * selected (no callback) and keeps the hash in step; getMap() returns "master" | map id | null for the hash.
 * A hash typed by hand is handled by the app (main.js, core/route.js planHashChange): the map first, then the
 * display and the mode.
 */
export function initTabs({onSelect, onMode, getMap}) {
  const views = [...document.querySelectorAll('.tabs [role="tab"][data-view]')];
  const modes = [...document.querySelectorAll('.modes [role="tab"][data-mode]')];
  let view = null, mode = DEFAULT_MODE;
  function writeHash() {
    const h = buildHash({view, mode, map: getMap ? getMap() : null});
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  const markView = tablist(views, "view", onSelect), markMode = tablist(modes, "mode", onMode);
  function set(v) {
    view = v; markView(v); writeHash();
    try { localStorage.setItem(KEY, v); } catch { /* not saved */ }
  }
  function setMode(m) {
    mode = m; markMode(m); writeHash();
    try { localStorage.setItem(MODE_KEY, m); } catch { /* not saved */ }
    // keep the selected mode in view when the row scrolls (phones)
    const t = modes.find(x => x.dataset.mode === m);
    if (t && t.scrollIntoView) { try { t.scrollIntoView({block: "nearest", inline: "nearest"}); } catch { /* old browser */ } }
  }
  return {set, setMode, writeHash};
}
