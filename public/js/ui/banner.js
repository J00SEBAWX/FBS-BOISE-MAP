/* The banner over the plan / 3D view (docs/DESIGN.md 8): read-only, conflict, offline, not saved, locked, and
 * "editing isn't switched on yet" (the server's map tables aren't ready: core/readiness.js).
 * One at a time; it never auto-dismisses. Text goes in with textContent; names come from the API.
 * Its height goes to the stage as --banner-h so the floating buttons on phones sit below it, whatever it says. */
const KINDS = {
  readonly: {cls: "info", icon: "i-eye", role: "status"},
  legacy: {cls: "info", icon: "i-info", role: "status"},
  conflict: {cls: "error", icon: "i-error", role: "alert"},
  offline: {cls: "warn", icon: "i-cloud-off", role: "status"},
  notsaved: {cls: "warn", icon: "i-warning", role: "alert"},
  locked: {cls: "warn", icon: "i-lock", role: "alert"},
  draft: {cls: "info", icon: "i-info", role: "status"},
  info: {cls: "info", icon: "i-info", role: "status"},
};

export function createBanner(el) {
  let kind = null;
  const stage = el.parentElement;
  if (stage && typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (el.hidden) stage.style.removeProperty("--banner-h");
      else stage.style.setProperty("--banner-h", Math.ceil(el.getBoundingClientRect().height) + "px");
    }).observe(el);
  }
  function svg(name) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", "i"); s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "/assets/icons.svg#" + name); s.appendChild(u);
    return s;
  }
  /**
   * show(kind, parts, actions): parts = [{text, bold}] or a string; actions = [{label, primary, onClick}].
   */
  function show(k, parts, actions = []) {
    const def = KINDS[k] || KINDS.info;
    kind = k;
    el.textContent = "";
    el.className = "map-banner " + def.cls;
    el.setAttribute("role", def.role);
    el.appendChild(svg(def.icon));
    const p = document.createElement("p");
    for (const part of (typeof parts === "string" ? [{text: parts}] : parts)) {
      const s = document.createElement(part.bold ? "b" : "span"); s.textContent = part.text; p.appendChild(s);
    }
    el.appendChild(p);
    if (actions.length) {
      const row = document.createElement("span"); row.className = "map-banner-actions";
      for (const a of actions) {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn small" + (a.primary ? " primary" : a.danger ? " danger" : ""); b.textContent = a.label;
        b.addEventListener("click", () => a.onClick());
        row.appendChild(b);
      }
      el.appendChild(row);
    }
    el.hidden = false;
  }
  function hide(k) { if (k && kind !== k) return; el.hidden = true; kind = null; }
  return {show, hide, get kind() { return kind; }};
}
