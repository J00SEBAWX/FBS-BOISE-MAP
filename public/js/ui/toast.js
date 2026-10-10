/* One toast at a time (newest replaces older), bottom-centre, role="status". Hovering pauses its timer. */
let el = null, timer = 0, left = 0, started = 0;

function hide() { if (el) el.hidden = true; }
function arm(ms) { clearTimeout(timer); left = ms; started = Date.now(); timer = setTimeout(hide, ms); }

/** toast("That spot is outside the store.") — shows for ms milliseconds (default 3.2 s). */
export function toast(msg, ms = 3200) {
  if (!el) {
    el = document.getElementById("toast");
    if (!el) return;
    el.addEventListener("pointerenter", () => { clearTimeout(timer); left = Math.max(800, left - (Date.now() - started)); });
    el.addEventListener("pointerleave", () => { if (!el.hidden) arm(left); });
  }
  el.textContent = msg;
  el.hidden = false;
  arm(ms);
}
