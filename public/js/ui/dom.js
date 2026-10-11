/* Tiny DOM helpers for the panels built from data. Everything that comes from a person or the API is set with
 * textContent (never innerHTML), and per-item colours go through el.style.setProperty("--c", ...) (CSP). */

/** The states whose "false" is information (a toggle that is off, a collapsed menu): they are always written. */
const ARIA_STATES = new Set(["pressed", "checked", "selected", "expanded", "current"]);
/**
 * The string an aria-<name> attribute should get, or null for "leave it off". undefined / null are skipped; a
 * false state (pressed, checked, selected, expanded, current) is written as "false" because a screen reader
 * announces a toggle as "not pressed" / "not checked" only when the attribute exists (WCAG 4.1.2); for every
 * other attribute false still means "not set".
 */
export function ariaValue(name, v) {
  if (v === undefined || v === null) return null;
  if (v === false) return ARIA_STATES.has(name) ? "false" : null;
  return String(v);
}

/** h("button", {class: "btn", type: "button", onclick: fn, aria: {label: "x"}, data: {id: "1"}}, "text", child...) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = String(v);
    else if (k === "html") throw new Error("no innerHTML");
    else if (k === "aria") { for (const [a, b] of Object.entries(v)) { const val = ariaValue(a, b); if (val !== null) el.setAttribute("aria-" + a, val); } }
    else if (k === "data") { for (const [a, b] of Object.entries(v)) if (b !== undefined && b !== null) el.dataset[a] = String(b); }
    else if (k === "style") { for (const [a, b] of Object.entries(v)) el.style.setProperty(a, String(b)); }
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "hidden" || k === "disabled" || k === "checked" || k === "selected" || k === "required" || k === "readOnly") el[k] = !!v;
    else if (k === "value") el.value = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

/** An icon from the sprite: <svg class="i" aria-hidden><use href="/assets/icons.svg#i-name"/></svg> */
export function icon(name, cls = "i") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "/assets/icons.svg#" + name);
  svg.appendChild(use);
  return svg;
}
/** Swaps the icon shown by an existing <svg class="i"><use/></svg>. */
export function setIcon(svg, name) { const u = svg && svg.querySelector("use"); if (u) u.setAttribute("href", "/assets/icons.svg#" + name); }

/**
 * Moves keyboard focus to `el` WITHOUT letting the browser scroll anything: a plain focus() scrolls every scrollable
 * ancestor to bring the element on screen, and a phone's bottom sheet is still translated below the screen when it
 * opens, so that used to push the (overflow:hidden) stage up for good and the plan / 3D view disappeared. Instead
 * the nearest scrolling box that really holds the element (a menu or a sheet) is nudged just enough to show it.
 */
export function focusEl(el, {reveal = true} = {}) {
  if (!el || typeof el.focus !== "function") return;
  el.focus({preventScroll: true});
  if (reveal) revealIn(el);
}
/** Scrolls the nearest scrollable ancestor of el (below the stage) so el is inside it; nothing else moves. */
export function revealIn(el) {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (p.id === "stage" || p.id === "stageMain" || p.id === "app") return;
    if (p.scrollHeight <= p.clientHeight + 1) continue;
    const oy = getComputedStyle(p).overflowY;
    if (oy !== "auto" && oy !== "scroll") continue;
    const r = el.getBoundingClientRect(), b = p.getBoundingClientRect();
    if (!r.height || !b.height) return;
    if (r.top < b.top) p.scrollTop -= b.top - r.top + 4;
    else if (r.bottom > b.bottom) p.scrollTop += r.bottom - b.bottom + 4;
    return;
  }
}

/** Removes every child. */
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** "just now", "5 min ago", "2 h ago", "Yesterday", "Oct 3" */
export function relTime(ms, now = Date.now()) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = now - ms;
  if (d < 45000) return "just now";
  if (d < 3600000) return `${Math.max(1, Math.round(d / 60000))} min ago`;
  if (d < 86400000) return `${Math.round(d / 3600000)} h ago`;
  if (d < 2 * 86400000) return "Yesterday";
  const dt = new Date(ms);
  return dt.toLocaleDateString(undefined, {month: "short", day: "numeric"}) + (now - ms > 300 * 86400000 ? ` ${dt.getFullYear()}` : "");
}

/** Keyboard roving inside a menu: Up / Down / Home / End move between the items, Esc calls onEscape. */
export function menuKeys(menu, itemsOf, onEscape) {
  menu.addEventListener("keydown", e => {
    const list = itemsOf(), i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); onEscape(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); focusEl(list[(i + 1) % list.length] || list[0]); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusEl(list[(i - 1 + list.length) % list.length] || list[0]); }
    else if (e.key === "Home") { e.preventDefault(); focusEl(list[0]); }
    else if (e.key === "End") { e.preventDefault(); focusEl(list[list.length - 1]); }
    else return;
    e.stopPropagation();
  });
}

/**
 * A native <dialog> as a modal: opens with showModal(), traps focus, Esc closes, focus goes back to the opener.
 * The map's keys don't fire behind it (keydown stops at the dialog). Returns {open(first), close(value), el}.
 */
export function modal(dlg, {onClose} = {}) {
  let opener = null;
  dlg.addEventListener("keydown", e => e.stopPropagation());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close("cancel"); });
  dlg.addEventListener("close", () => { if (onClose) onClose(dlg.returnValue); if (opener && opener.focus && document.contains(opener)) focusEl(opener, {reveal: false}); opener = null; });
  return {
    el: dlg,
    open(first) {
      opener = document.activeElement;
      dlg.returnValue = "";
      if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
      const f = first || dlg.querySelector("input, select, textarea, button");
      if (f) f.focus({preventScroll: true});
    },
    close(v = "cancel") { if (typeof dlg.close === "function") { if (dlg.open) dlg.close(v); } else dlg.removeAttribute("open"); },
    get isOpen() { return dlg.open; },
  };
}
