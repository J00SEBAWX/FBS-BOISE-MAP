/* The Layers menu: what the map shows. One set of switches shared by all views (Structure, Fixtures, Labels,
 * Scan lines, Snap), plus the two that differ by view: the Scan model (Off / Ghost / Solid; Ghost by default in
 * 3D, Off in Walk) and the Ceiling (off by default in 3D so you can see in, on in Walk).
 * Saved on this device (localStorage, try/catch). There is no "scan objects" layer: the scanner's furniture
 * guesses were deleted at the owner's request.
 * Keyboard: opening it moves focus to its first control you can see; Tab walks the rows (the Scan model is one
 * radio group: one Tab stop, arrow keys change it); Esc closes it and returns to the Layers button; it closes
 * when focus leaves it. */
const KEY = "fbs-layers-v1";
const DEFAULTS = {structure: true, fixtures: true, labels: true, scanLines: false, snap: true, ceiling: {"3d": false, walk: true}, scan: {"3d": "ghost", walk: "off"}};
const SCAN = ["off", "ghost", "solid"];
// a deep copy of the plain defaults (JSON, so it works on browsers without structuredClone)
const fresh = () => JSON.parse(JSON.stringify(DEFAULTS));

function load() {
  const out = fresh();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!s || typeof s !== "object") return out;
    for (const k of ["structure", "fixtures", "labels", "scanLines", "snap"]) if (typeof s[k] === "boolean") out[k] = s[k];
    for (const v of ["3d", "walk"]) {
      if (s.ceiling && typeof s.ceiling[v] === "boolean") out.ceiling[v] = s.ceiling[v];
      if (s.scan && SCAN.includes(s.scan[v])) out.scan[v] = s.scan[v];
    }
  } catch { /* no storage or a broken value: the defaults */ }
  return out;
}

/** createLayers({btn, pop, onChange(key, state)}) -> {get(view), set(key, value, view), toggle(key, view), sync(view), close(refocus)} */
export function createLayers({btn, pop, onChange}) {
  const S = load();
  let view = "3d";
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* not saved */ } };

  function get(v = view) {
    return {
      structure: S.structure, fixtures: S.fixtures, labels: S.labels, scanLines: S.scanLines, snap: S.snap,
      ceiling: v === "plan" ? false : S.ceiling[v], scan: v === "plan" ? "off" : S.scan[v],
    };
  }
  function set(key, value, v = view) {
    if (key === "ceiling" || key === "scan") { if (v === "plan") return; S[key][v] = value; }
    else S[key] = value;
    save(); sync(); onChange(key, get(v));
  }
  const toggle = (key, v = view) => set(key, !get(v)[key], v);

  /* ---------- the popover ---------- */
  const radios = () => [...pop.querySelectorAll("[data-scan]")];
  function sync(v = view) {
    view = v;
    const st = get(v);
    for (const row of pop.querySelectorAll("[data-layer]")) {
      const on = !!st[row.dataset.layer];
      row.setAttribute("aria-pressed", String(on));
      const use = row.querySelector(".eye use");
      if (use) use.setAttribute("href", "/assets/icons.svg#" + (on ? "i-eye" : "i-eye-off"));
    }
    // one Tab stop for the radio group: the checked one
    for (const b of radios()) { const on = b.dataset.scan === st.scan; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; }
  }
  const isOpen = () => !pop.hidden;
  const visible = el => !!el.offsetParent;
  function open() {
    sync(); pop.hidden = false; btn.setAttribute("aria-expanded", "true");
    // the first control that shows in this view (the Scan model row is hidden in the plan)
    const first = [...pop.querySelectorAll("button")].find(b => visible(b) && b.tabIndex >= 0);
    if (first) first.focus();
  }
  function close(refocus) { if (!isOpen()) return; pop.hidden = true; btn.setAttribute("aria-expanded", "false"); if (refocus) btn.focus(); }
  btn.addEventListener("click", () => (isOpen() ? close(false) : open()));
  for (const row of pop.querySelectorAll("[data-layer]")) row.addEventListener("click", () => toggle(row.dataset.layer));
  for (const b of radios()) b.addEventListener("click", () => set("scan", b.dataset.scan));
  // radio group: arrow keys move the choice
  const seg = pop.querySelector(".seg");
  if (seg) seg.addEventListener("keydown", e => {
    const opts = radios(), i = opts.findIndex(b => b.getAttribute("aria-checked") === "true");
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const n = opts[(i + d + opts.length) % opts.length]; set("scan", n.dataset.scan); n.focus();
  });
  pop.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); close(true); } e.stopPropagation(); });
  document.addEventListener("pointerdown", e => { if (isOpen() && !pop.contains(e.target) && !btn.contains(e.target)) close(false); }, true);
  // Tab out of the menu (or anywhere else): it closes, like the account menu
  const leaving = e => { if (isOpen() && e.relatedTarget && !pop.contains(e.relatedTarget) && !btn.contains(e.relatedTarget)) close(false); };
  pop.addEventListener("focusout", leaving);
  btn.addEventListener("focusout", leaving);

  sync();
  return {get, set, toggle, sync, close, get isOpen() { return isOpen(); }};
}
