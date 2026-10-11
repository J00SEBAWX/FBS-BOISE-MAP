/* Comparison mode's panel (OWNER RULES v3.1 rule 4; docs/DESIGN.md 6): pick the two layouts (A, the base, is the
 * master by default; B is the open map), Side by side or Overlay, the change list from core/diff.js grouped
 * Added / Removed / Changed / Categories, a tap on a row highlights it on the plan, and for the admin "Apply to
 * master" per row and "Apply all" (POST /api/master/apply). Every name comes from the API and is set with
 * textContent. The app fetches the maps and draws the plans; this panel only holds the state and the list. */
import {h, icon, clear, relTime, focusEl} from "./dom.js";
import {createCompare, rowGroups, rowKey, kindIcon, pickOptions, canApply, applyErrorText, countText, compareDocs, LAYOUTS} from "../core/compare.js";
import {changesFor} from "../core/diff.js";
import {toLayout} from "../core/session.js";
import {TYPES} from "../core/model.js";
import {neverHadRows, neverHadText} from "../core/review.js";

/**
 * createComparePanel({el, isAdmin, getOpenMap() -> {id, name, ownerName, mine}, listMaps() -> Promise<{mine, team}>,
 *   loadMap(id) -> Promise<{doc, name, version, ownerName, updatedAt}> ("master" included), liveDoc(id) -> doc | null,
 *   flushSave() -> Promise, apply(mapId, baseVersion, changes) -> Promise<{version, applied}>,
 *   onChange(what: "docs" | "layout" | "selection"), toast, isTouch(), onClose()})
 */
export function createComparePanel(o) {
  const {el} = o;
  const state = createCompare();
  const docs = new Map(); // id -> {doc, name, version, ownerName, updatedAt, live}
  const layouts = new WeakMap(); // doc -> layout (the plans read it on every draw)
  let maps = {mine: [], team: []}, diff = null, loading = false, error = "", busy = false, notice = null, token = 0;
  const head = h("div", {class: "mp-head"}), body = h("div", {class: "mp-body"}), foot = h("div", {class: "mp-foot"});
  el.append(head, body, foot);

  /* ---------- the maps ---------- */
  const nameOf = id => (id === "master" ? "the master map" : (docs.get(id) || {}).name || (optionFor(id) || {}).label || "that map");
  const shortName = id => (id === "master" ? "Master map" : (docs.get(id) || {}).name || (optionFor(id) || {}).label || "Map");
  const optionFor = id => options().find(x => x.id === id) || null;
  const options = () => pickOptions(maps, o.getOpenMap());
  async function fetchDoc(id) {
    const live = o.liveDoc ? o.liveDoc(id) : null;
    const open = o.getOpenMap();
    if (live) { docs.set(id, {doc: live, name: id === "master" ? "Master map" : open.name, version: open.version, ownerName: open.ownerName, updatedAt: open.updatedAt, base: open.base || null, live: true}); return; }
    const r = await o.loadMap(id);
    docs.set(id, {doc: r.doc, name: r.name, version: r.version, ownerName: r.ownerName, updatedAt: r.updatedAt, base: r.base || null, live: false});
  }
  /** Reloads both sides (the open map is read live from the session) and recomputes the diff. */
  async function refresh() {
    const my = ++token;
    loading = true; error = ""; render();
    try {
      await Promise.all([fetchDoc(state.a), state.b === state.a ? null : fetchDoc(state.b)]);
    } catch (e) { if (my !== token) return; error = e && e.message ? e.message : "Couldn't load that map."; }
    if (my !== token) return;
    loading = false;
    recompute();
    render();
    o.onChange("docs");
  }
  /** The open map changed under us (an edit while comparing it): re-diff without a fetch. */
  function liveChanged() {
    let touched = false;
    for (const id of [state.a, state.b]) { const live = o.liveDoc ? o.liveDoc(id) : null; if (live && docs.has(id)) { docs.get(id).doc = live; touched = true; } }
    if (!touched) return;
    recompute(); render(); o.onChange("docs");
  }
  function recompute() {
    const A = docs.get(state.a), B = docs.get(state.b);
    diff = A && B ? compareDocs(A.doc, B.doc) : null;
    if (state.selected && !(diff && diff.rows.some(r => rowKey(r) === state.selected))) state.selected = null;
  }
  async function loadList() {
    try { maps = await o.listMaps(); } catch { /* keep what we have */ }
    render();
  }

  /* ---------- opening ---------- */
  function open({a, b} = {}) {
    const open = o.getOpenMap();
    state.a = a || "master";
    state.b = b || (open.id !== "master" ? open.id : "master");
    state.selected = null;
    loadList();
    return refresh();
  }

  /* ---------- selection ---------- */
  function select(key) {
    state.selected = state.selected === key ? null : key;
    render();
    o.onChange("selection");
  }
  const selectedRow = () => (diff && state.selected ? diff.rows.find(r => rowKey(r) === state.selected) || null : null);

  /* ---------- apply to the master ---------- */
  async function applyRows(rows) {
    if (busy) return;
    const gate = canApply({isAdmin: o.isAdmin, a: state.a, b: state.b});
    if (!gate.ok) { o.toast(gate.why); return; }
    const changes = changesFor(rows);
    if (!changes.length) return;
    busy = true; notice = null; render();
    try {
      const B = docs.get(state.b);
      if (B && B.live && o.flushSave) await o.flushSave(); // the server applies from the saved copy
      const A = docs.get("master");
      const r = await o.apply(state.b, A ? A.version : 0, changes);
      o.toast(`Applied ${r.applied} change${r.applied === 1 ? "" : "s"} to the master map.`, {icon: "i-check"});
      docs.delete("master");
      busy = false;
      await refresh();
    } catch (e) {
      busy = false;
      const status = e && e.status, text = applyErrorText(status, e && e.message);
      notice = {text, reload: status === 409};
      render();
    }
  }

  /* ---------- rendering ---------- */
  function picker(side, label) {
    const id = "cmp-" + side;
    const sel = h("select", {class: "input f-in", id, aria: {label: label}});
    let group = null;
    for (const opt of options()) {
      if (opt.group !== group) { group = opt.group; sel.appendChild(h("optgroup", {label: group})); }
      sel.lastChild.appendChild(h("option", {value: opt.id, text: opt.label, selected: opt.id === state[side]}));
    }
    if (!options().some(x => x.id === state[side])) sel.appendChild(h("option", {value: state[side], text: shortName(state[side]), selected: true}));
    sel.addEventListener("change", () => { state[side] = sel.value; state.selected = null; refresh(); });
    sel.addEventListener("keydown", e => e.stopPropagation());
    return h("div", {class: "field"}, h("label", {class: "f-label", for: id, text: label}), sel);
  }
  function layoutSeg() {
    const seg = h("div", {class: "seg seg-wide", role: "radiogroup", aria: {label: "How to compare"}});
    for (const [v, label] of [["side", "Side by side"], ["overlay", "Overlay"]]) {
      seg.appendChild(h("button", {type: "button", role: "radio", aria: {checked: state.layout === v}, tabindex: state.layout === v ? 0 : -1, data: {layout: v}, text: label,
        onclick: () => { if (state.layout !== v) { state.layout = v; render(); o.onChange("layout"); } }}));
    }
    seg.addEventListener("keydown", e => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      state.layout = LAYOUTS[(LAYOUTS.indexOf(state.layout) + d + LAYOUTS.length) % LAYOUTS.length];
      render(); o.onChange("layout");
      const b = seg.querySelector(`[data-layout="${state.layout}"]`); focusEl(b);
    });
    return seg;
  }
  function legend() {
    return h("ul", {class: "cmp-legend", aria: {label: "Colours on the plan"}},
      h("li", {}, h("span", {class: "cmp-key added", aria: {hidden: true}}), "Added"),
      h("li", {}, h("span", {class: "cmp-key removed", aria: {hidden: true}}), "Removed"),
      h("li", {}, h("span", {class: "cmp-key changed", aria: {hidden: true}}), "Moved, resized or rotated"));
  }
  function rowEl(r, applyOk) {
    const key = rowKey(r), on = state.selected === key;
    const typeLabel = r.group === "category" ? "Category" : r.type === "area" ? "Department block" : (TYPES[r.type] || {}).label || r.type;
    const detail = r.group === "category" ? r.details.slice(1).join(" · ") : [typeLabel, ...r.details.slice(1)].join(" · ");
    const row = h("div", {class: "cmp-row" + (on ? " selected" : ""), data: {key}},
      h("button", {type: "button", class: "cmp-main", aria: {pressed: on}, onclick: () => select(key)},
        h("span", {class: "cmp-chip " + r.group}, icon(kindIcon(r), "i i-sm")),
        h("span", {class: "cmp-text"}, h("span", {class: "cmp-sentence", text: r.text}), detail ? h("span", {class: "cmp-detail", text: detail}) : null)),
      applyOk ? h("button", {type: "button", class: "btn small" + (on ? " primary" : ""), text: "Apply", disabled: busy, title: "Apply this change to the master map", aria: {label: `Apply to master: ${r.text}`}, onclick: () => applyRows([r])}) : null);
    return row;
  }
  function render() {
    const open = o.getOpenMap();
    clear(head);
    head.appendChild(h("div", {class: "pal-title-row"}, h("h2", {class: "pal-title", text: "Comparison"}),
      o.isTouch() ? h("button", {type: "button", class: "icon-btn", aria: {label: "Close"}, onclick: () => o.onClose && o.onClose()}, icon("i-close")) : null));
    head.appendChild(h("div", {class: "cmp-pick"}, picker("a", "Compare"), picker("b", "with"),
      h("button", {type: "button", class: "btn small cmp-swap", title: "Swap the two sides", aria: {label: "Swap the two sides"}, onclick: () => { [state.a, state.b] = [state.b, state.a]; state.selected = null; refresh(); }}, icon("i-sync"), "Swap")));
    head.appendChild(layoutSeg());
    if (state.layout === "overlay") head.appendChild(legend());
    clear(body);
    const gate = canApply({isAdmin: o.isAdmin, a: state.a, b: state.b});
    if (loading) { body.appendChild(h("p", {class: "mp-state", text: "Loading the maps…"})); clear(foot); return; }
    if (error) { body.appendChild(h("div", {class: "mp-state"}, h("p", {text: error}), h("button", {type: "button", class: "btn small", onclick: () => refresh()}, icon("i-reload"), "Try again"))); clear(foot); return; }
    if (!diff) { clear(foot); return; }
    const A = docs.get(state.a), B = docs.get(state.b);
    body.appendChild(h("p", {class: "cmp-count", text: countText(diff, nameOf(state.a), state.b === open.id && open.id !== "master" ? "this map" : nameOf(state.b))}));
    if (B && B.live && B.doc && open.id !== "master" && A && !A.live) body.appendChild(h("p", {class: "pal-hint", text: "Edits you make in Area planning show here right away."}));
    if (notice) body.appendChild(h("div", {class: "notice error cmp-notice", role: "alert"}, h("span", {text: notice.text}), notice.reload ? h("button", {type: "button", class: "btn small", onclick: () => { notice = null; docs.delete("master"); refresh(); }}, icon("i-reload"), "Reload") : null));
    if (!diff.rows.length) {
      body.appendChild(h("div", {class: "mp-empty"}, h("span", {class: "empty-ico"}, icon("i-check")), h("h3", {text: "No differences"}), h("p", {text: `${shortName(state.b)} matches ${nameOf(state.a)}.`})));
      clear(foot); return;
    }
    for (const g of rowGroups(diff)) {
      body.appendChild(h("h3", {class: "eyebrow mp-group", text: `${g.title} · ${g.rows.length}`}));
      for (const r of g.rows) body.appendChild(rowEl(r, gate.ok));
    }
    clear(foot);
    if (gate.ok) {
      // a map started from a blank store never had the master's fixtures: Apply all leaves those "removed" rows out
      const never = new Set(state.a === "master" && B ? neverHadRows(diff.rows, B.base) : []);
      const allRows = diff.rows.filter(r => !never.has(r)), allCount = changesFor(allRows).length;
      if (never.size) foot.appendChild(h("p", {class: "notice warn cmp-never", text: neverHadText(never.size)}));
      foot.appendChild(h("p", {class: "pal-hint", text: `Applying saves a new master version${A && A.version ? ` (now version ${A.version})` : ""}.`}));
      foot.appendChild(h("button", {type: "button", class: "btn primary wide", disabled: busy || !allCount, onclick: () => applyRows(allRows)}, busy ? "Applying…" : `Apply all ${allCount}`));
    } else foot.appendChild(h("p", {class: "pal-hint", text: o.isAdmin ? gate.why : "Only the admin can apply changes to the master map."}));
  }
  /** Scrolls the list to a row (when a plan click picked it). */
  function reveal(key) { const r = body.querySelector(`.cmp-row[data-key="${CSS.escape(key)}"]`); if (r && r.scrollIntoView) r.scrollIntoView({block: "nearest"}); }

  return {
    open, refresh, render, select, liveChanged, selectedRow, reveal,
    get state() { return state; },
    get diff() { return diff; },
    docOf: side => (docs.get(state[side]) || {}).doc || null,
    layoutOf: side => { const d = docs.get(state[side]); if (!d || !d.doc) return null; let l = layouts.get(d.doc); if (!l) { l = toLayout(d.doc); layouts.set(d.doc, l); } return l; },
    nameOf: side => shortName(state[side]),
    metaOf: side => docs.get(state[side]) || null,
    get loading() { return loading; },
  };
}
