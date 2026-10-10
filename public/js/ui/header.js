/* The header's display tabs (Plan | 3D | Walk): a tablist, arrow keys move between tabs, the URL hash
 * reflects the tab (#plan, #3d, #walk), and the last view is remembered on this device. */
export const VIEWS = ["plan", "3d", "walk"];
const KEY = "fbs-view";

/** The view to open first: the URL hash, else the last one used here, else 3D. */
export function initialView() {
  const h = location.hash.replace("#", "");
  if (VIEWS.includes(h)) return h;
  try { const v = localStorage.getItem(KEY); if (VIEWS.includes(v)) return v; } catch { /* no storage */ }
  return "3d";
}

/** initTabs({onSelect(view)}) -> {set(view)} : marks the tab selected (no callback). */
export function initTabs({onSelect}) {
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  function set(view) {
    for (const t of tabs) { const on = t.dataset.view === view; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; }
    if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    try { localStorage.setItem(KEY, view); } catch { /* not saved */ }
  }
  for (const t of tabs) {
    t.addEventListener("click", () => onSelect(t.dataset.view));
    t.addEventListener("keydown", e => {
      const i = tabs.indexOf(t), d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      let n = null;
      if (d) n = tabs[(i + d + tabs.length) % tabs.length];
      else if (e.key === "Home") n = tabs[0];
      else if (e.key === "End") n = tabs[tabs.length - 1];
      if (!n) return;
      e.preventDefault(); e.stopPropagation();
      n.focus(); onSelect(n.dataset.view);
    });
  }
  window.addEventListener("hashchange", () => { const h = location.hash.replace("#", ""); if (VIEWS.includes(h)) onSelect(h); });
  return {set};
}
