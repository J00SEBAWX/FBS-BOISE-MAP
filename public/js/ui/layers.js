/* The Layers menu: what the map shows. One set of switches shared by all displays (Structure, Fixtures, Labels,
 * Departments, Grid, Dimensions, Scan lines, Snap), plus the ones that differ by display: the Scan model (Off /
 * Ghost / Solid; Ghost by default in 3D, Off in Walk), the Ceiling (off by default in 3D so you can see in, on in
 * Walk) and, on the plan, the fixtures as Shown / Faint (a backdrop you can't select) / Hidden.
 * Saved on this device (localStorage, try/catch).
 * Keyboard: opening it moves focus to its first control you can see; Tab walks the rows (the Scan model is one
 * radio group: one Tab stop, arrow keys change it); Esc closes it and returns to the Layers button; it closes
 * when focus leaves it. */
import {focusEl} from "./dom.js";
const KEY = "fbs-layers-v2";
const BOOLS = ["structure", "fixtures", "labels", "categories", "grid", "dimensions", "scanLines", "snap", "faint"];
// fixtures start hidden: Area planning is the blank slate (walls, columns, desks) with the department areas on it; the
// Fixtures switch brings them back shown or faint, and Current layout always shows them (core/modes.js)
const DEFAULTS = {structure: true, fixtures: false, labels: true, categories: true, grid: true, dimensions: false, scanLines: false, snap: true, faint: false,
  ceiling: {"3d": false, walk: true}, scan: {"3d": "ghost", walk: "off"}};
const SCAN = ["off", "ghost", "solid"];
// a deep copy of the plain defaults (JSON, so it works on browsers without structuredClone)
const fresh = () => JSON.parse(JSON.stringify(DEFAULTS));

function load() {
  const out = fresh();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!s || typeof s !== "object") return out;
    for (const k of BOOLS) if (typeof s[k] === "boolean") out[k] = s[k];
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
  const is3D = v => v === "3d" || v === "walk";

  /** The layers as the given display sees them (faint fixtures only exist on the plan, and only while fixtures are hidden). */
  function get(v = view) {
    return {
      structure: S.structure, fixtures: S.fixtures, labels: S.labels, categories: S.categories, grid: S.grid, dimensions: S.dimensions,
      scanLines: S.scanLines, snap: S.snap, faint: v === "plan" && !S.fixtures && S.faint,
      ceiling: is3D(v) ? S.ceiling[v] : false, scan: is3D(v) ? S.scan[v] : "off",
    };
  }
  /** The plan's three-way fixtures choice: "on" | "faint" | "off". */
  const fixMode = () => (S.fixtures ? "on" : S.faint ? "faint" : "off");
  function setFixtures(mode) {
    S.fixtures = mode === "on"; S.faint = mode === "faint";
    save(); sync(); onChange("fixtures", get(view));
  }
  function set(key, value, v = view) {
    if (key === "ceiling" || key === "scan") { if (!is3D(v)) return; S[key][v] = value; }
    else if (BOOLS.includes(key)) S[key] = value;
    else return;
    save(); sync(); onChange(key, get(v));
  }
  const toggle = (key, v = view) => set(key, !(key === "ceiling" ? S.ceiling[v] : key === "scan" ? false : S[key]), v);

  /* ---------- the popover ---------- */
  const radios = () => [...pop.querySelectorAll("[data-scan]")];
  function sync(v = view) {
    view = v;
    const st = get(v);
    for (const row of pop.querySelectorAll("[data-layer]")) {
      const k = row.dataset.layer;
      const on = !!st[k];
      row.setAttribute("aria-pressed", String(on));
      const use = row.querySelector(".eye use");
      if (use) use.setAttribute("href", "/assets/icons.svg#" + (on ? "i-eye" : "i-eye-off"));
    }
    // one Tab stop per radio group: the checked one
    for (const b of radios()) { const on = b.dataset.scan === st.scan; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; }
    for (const b of fixRadios()) { const on = b.dataset.fix === fixMode(); b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; }
  }
  const fixRadios = () => [...pop.querySelectorAll("[data-fix]")];
  const isOpen = () => !pop.hidden;
  // getClientRects, not offsetParent: the popover is position:fixed on phones (a bottom sheet), where offsetParent is null
  const visible = el => el.getClientRects().length > 0;
  function open() {
    sync(); pop.hidden = false; btn.setAttribute("aria-expanded", "true");
    const first = [...pop.querySelectorAll("button")].find(b => visible(b) && b.tabIndex >= 0);
    focusEl(first);
  }
  function close(refocus) { if (!isOpen()) return; pop.hidden = true; btn.setAttribute("aria-expanded", "false"); if (refocus) focusEl(btn, {reveal: false}); }
  btn.addEventListener("click", () => (isOpen() ? close(false) : open()));
  for (const row of pop.querySelectorAll("[data-layer]")) row.addEventListener("click", () => toggle(row.dataset.layer));
  for (const b of radios()) b.addEventListener("click", () => set("scan", b.dataset.scan));
  for (const b of fixRadios()) b.addEventListener("click", () => setFixtures(b.dataset.fix));
  // radio groups: arrow keys move the choice
  for (const [seg, opts, pick] of [[pop.querySelector(".seg-scan"), radios, b => set("scan", b.dataset.scan)], [pop.querySelector(".seg-fix"), fixRadios, b => setFixtures(b.dataset.fix)]]) {
    if (!seg) continue;
    seg.addEventListener("keydown", e => {
      const list = opts(), i = list.findIndex(b => b.getAttribute("aria-checked") === "true");
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      const n = list[(i + d + list.length) % list.length]; pick(n); focusEl(n);
    });
  }
  pop.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); close(true); } e.stopPropagation(); });
  document.addEventListener("pointerdown", e => { if (isOpen() && !pop.contains(e.target) && !btn.contains(e.target)) close(false); }, true);
  // Tab out of the menu (or anywhere else): it closes, like the account menu
  const leaving = e => { if (isOpen() && e.relatedTarget && !pop.contains(e.relatedTarget) && !btn.contains(e.relatedTarget)) close(false); };
  pop.addEventListener("focusout", leaving);
  btn.addEventListener("focusout", leaving);

  sync();
  return {get, set, toggle, sync, close, open, setFixtures, fixMode, get isOpen() { return isOpen(); }, get raw() { return S; }};
}
