/* One toast at a time (newest replaces older), bottom-centre, role="status" (docs/DESIGN.md 8). Hovering or
 * focusing pauses its timer. toast(msg) or toast(msg, ms) for a plain message; toast(msg, {ms, action: {label,
 * onClick}, icon}) adds an underlined action button ("Undo") and a close button. All text goes in with textContent. */
let el = null, timer = 0, left = 0, started = 0;

function hide() { if (el) el.hidden = true; }
function arm(ms) { clearTimeout(timer); left = ms; started = Date.now(); timer = setTimeout(hide, ms); }
function pause() { clearTimeout(timer); left = Math.max(800, left - (Date.now() - started)); }
function resume() { if (el && !el.hidden) arm(left); }

function init() {
  el = document.getElementById("toast");
  if (!el) return false;
  el.addEventListener("pointerenter", pause);
  el.addEventListener("pointerleave", resume);
  el.addEventListener("focusin", pause);
  el.addEventListener("focusout", resume);
  return true;
}
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "i"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "/assets/icons.svg#" + name);
  svg.appendChild(use);
  return svg;
}

/** toast("That spot is outside the store.") shows for 3.2 s; see the file comment for the options form. */
export function toast(msg, opts = 3200) {
  if (!el && !init()) return;
  const o = typeof opts === "number" ? {ms: opts} : (opts || {});
  const ms = o.ms || (o.action ? 6000 : o.icon ? 4000 : 3200);
  el.textContent = "";
  el.classList.toggle("has-action", !!o.action);
  if (o.icon) { const i = icon(o.icon); i.classList.add("toast-ico"); el.appendChild(i); }
  const text = document.createElement("span"); text.className = "toast-text"; text.textContent = String(msg); el.appendChild(text);
  if (o.action) {
    const b = document.createElement("button"); b.type = "button"; b.className = "toast-act"; b.textContent = o.action.label;
    b.addEventListener("click", () => { hide(); try { o.action.onClick(); } catch { /* the action's own problem */ } });
    el.appendChild(b);
    const x = document.createElement("button"); x.type = "button"; x.className = "toast-x"; x.setAttribute("aria-label", "Dismiss"); x.appendChild(icon("i-close"));
    x.addEventListener("click", hide);
    el.appendChild(x);
  }
  el.hidden = false;
  arm(ms);
}
/** Hides the toast (e.g. the wait it announced is over). */
export function hideToast() { clearTimeout(timer); hide(); }
