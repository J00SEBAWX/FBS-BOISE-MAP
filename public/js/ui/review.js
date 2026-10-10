/* The Review mode's panel (admin only; OWNER RULES v3.1 rule 7, docs/DESIGN.md 6): the team's proposals (newest
 * first, with a status filter), any map against the master, and the master's history. Opening a proposal shows
 * its SNAPSHOT's differences from the current master with before/after ghosts on the plan; the admin approves
 * (all rows or just the ticked ones), asks for changes, or declines, each with a note. An old master version can
 * be previewed and restored. Names and notes come from people and are always set with textContent. The server
 * checks every permission again. */
import {h, icon, clear, relTime} from "./dom.js";
import {rowGroups, rowKey, kindIcon, pickOptions, compareDocs} from "../core/compare.js";
import {changesFor} from "../core/diff.js";
import {toLayout} from "../core/session.js";
import {TYPES} from "../core/model.js";
import {FILTERS, filterProposals, statusInfo, proposalLines, decisionLine, reviewErrorText, historyLines, restoreConfirmText, approveLabel, keepChecked} from "../core/review.js";

/**
 * createReviewPanel({el, toast, announce, isTouch(), setSheet("peek" | "expanded"), onClose(), confirm({title, text, ok, danger, onOk}),
 *   loadProposals(), loadProposal(id), decide(id, body), listMaps(), loadMap(id), loadMasterMeta() (GET /api/master),
 *   history(), historyVersion(v), restore(version, baseVersion), onChange("docs" | "selection"),
 *   onMasterChanged(), onCompare(mapId)})
 */
export function createReviewPanel(o) {
  const {el} = o;
  const layouts = new WeakMap();
  const S = {
    proposals: [], filter: "open", maps: {mine: [], team: []}, history: [], master: null,
    openItem: null, diff: null, selected: null, checked: new Set(), note: "",
    loading: false, error: "", busy: false, notice: null,
  };
  let token = 0;
  const head = h("div", {class: "mp-head"}), body = h("div", {class: "mp-body"}), foot = h("div", {class: "mp-foot"});
  el.append(head, body, foot);
  // the app's shortcuts listen on window; keys typed in the panel's fields stay here
  el.addEventListener("keydown", e => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) e.stopPropagation(); });

  /* ---------- loading ---------- */
  async function open() {
    const my = ++token;
    S.loading = true; S.error = ""; render();
    try {
      const [master, proposals, maps, history] = await Promise.all([
        o.loadMasterMeta(), o.loadProposals(), o.listMaps(), o.history(),
      ]);
      if (my !== token) return;
      S.master = master;
      S.proposals = proposals.proposals || [];
      S.maps = maps;
      S.history = history.versions || [];
      if (S.openItem) await reopen(my);
    } catch (e) { if (my !== token) return; S.error = reviewErrorText(e && e.status, e && e.message); }
    if (my !== token) return;
    S.loading = false;
    recompute();
    render();
    o.onChange("docs");
  }
  /** The open proposal / map / version again (after a master change its diff moves). */
  async function reopen(my) {
    const it = S.openItem;
    if (it.kind === "proposal") { const r = await o.loadProposal(it.id); if (my !== token) return; setProposalItem(r); }
    else if (it.kind === "map") { const r = await o.loadMap(it.id); if (my !== token) return; S.openItem = {kind: "map", id: it.id, name: r.meta.name, ownerName: r.meta.ownerName, doc: r.data}; }
    else if (it.kind === "version") { const r = await o.historyVersion(it.version); if (my !== token) return; S.openItem = {kind: "version", version: it.version, meta: r, doc: r.data}; }
  }
  function setProposalItem(r) {
    S.openItem = {kind: "proposal", id: r.id, p: r, doc: r.snapshot};
  }
  function recompute() {
    const it = S.openItem;
    S.diff = it && it.doc && S.master ? compareDocs(S.master.data, it.doc) : null;
    if (S.diff) {
      S.checked = keepChecked(S.checked, S.diff.rows, rowKey);
      if (S.selected && !S.diff.rows.some(r => rowKey(r) === S.selected)) S.selected = null;
    } else { S.selected = null; }
  }

  /* ---------- opening a proposal / map / old version ---------- */
  async function openProposal(id) {
    const my = ++token;
    S.loading = true; S.error = ""; S.notice = null; S.selected = null; S.note = ""; render();
    try {
      const [r, master] = await Promise.all([o.loadProposal(id), o.loadMasterMeta()]);
      if (my !== token) return;
      S.master = master;
      setProposalItem(r);
      S.checked = null; // ticked below: everything, once the diff exists
      expand(true);
    } catch (e) { if (my !== token) return; S.loading = false; S.error = reviewErrorText(e && e.status, e && e.message); render(); return; }
    S.loading = false;
    recomputeAllChecked();
    render();
    o.onChange("docs");
  }
  async function openMapItem(id) {
    const my = ++token;
    S.loading = true; S.error = ""; S.notice = null; S.selected = null; render();
    try {
      const [r, master] = await Promise.all([o.loadMap(id), o.loadMasterMeta()]);
      if (my !== token) return;
      S.master = master;
      S.openItem = {kind: "map", id, name: r.meta.name, ownerName: r.meta.ownerName, doc: r.data};
      expand(true);
    } catch (e) { if (my !== token) return; S.loading = false; S.error = reviewErrorText(e && e.status, e && e.message); render(); return; }
    S.loading = false;
    recompute();
    render();
    o.onChange("docs");
  }
  async function openVersion(version) {
    const my = ++token;
    S.loading = true; S.error = ""; S.notice = null; S.selected = null; render();
    try {
      const [r, master] = await Promise.all([o.historyVersion(version), o.loadMasterMeta()]);
      if (my !== token) return;
      S.master = master;
      S.openItem = {kind: "version", version, meta: r, doc: r.data};
      expand(true);
    } catch (e) { if (my !== token) return; S.loading = false; S.error = reviewErrorText(e && e.status, e && e.message); render(); return; }
    S.loading = false;
    recompute();
    render();
    o.onChange("docs");
  }
  function recomputeAllChecked() {
    S.checked = new Set();
    recompute();
    if (S.diff) S.checked = new Set(S.diff.rows.map(rowKey));
  }
  /** A phone reads the rows in the tall sheet; the list view goes back to the short one. */
  function expand(on) { if (o.isTouch() && o.setSheet) o.setSheet(on ? "expanded" : "peek"); }
  function backToList() {
    token++;
    expand(false);
    S.openItem = null; S.diff = null; S.selected = null; S.notice = null; S.busy = false;
    render();
    o.onChange("docs");
    open();
  }

  /* ---------- selection on the plan ---------- */
  function select(key) {
    S.selected = S.selected === key ? null : key;
    render();
    o.onChange("selection");
  }
  const selectedRow = () => (S.diff && S.selected ? S.diff.rows.find(r => rowKey(r) === S.selected) || null : null);
  function reveal(key) { const r = body.querySelector(`.cmp-row[data-key="${CSS.escape(key)}"]`); if (r && r.scrollIntoView) r.scrollIntoView({block: "nearest"}); }

  /* ---------- the decisions ---------- */
  async function decide(decision) {
    const it = S.openItem;
    if (!it || it.kind !== "proposal" || S.busy) return;
    const note = S.note.trim();
    const body2 = {decision};
    if (note) body2.note = note;
    if (decision === "approve") {
      const rows = S.diff ? S.diff.rows.filter(r => S.checked.has(rowKey(r))) : [];
      const changes = changesFor(rows);
      if (changes.length) { body2.changes = changes; body2.baseVersion = S.master.version; }
    }
    S.busy = true; S.notice = null; render();
    try {
      const r = await o.decide(it.id, body2);
      S.busy = false;
      const applied = r && r.applied;
      o.toast(decision === "approve"
        ? (applied ? `Approved. ${applied} change${applied === 1 ? "" : "s"} applied to the master map.` : "Approved without changes.")
        : decision === "needs_changes" ? "Sent back: needs changes." : "Declined.", {icon: "i-check"});
      if (decision === "approve" && applied && o.onMasterChanged) o.onMasterChanged();
      S.note = "";
      await open();
    } catch (e) {
      S.busy = false;
      S.notice = {text: reviewErrorText(e && e.status, e && e.message), reload: e && e.status === 409};
      render();
      if (o.announce) o.announce(S.notice.text);
    }
  }
  function confirmRestore(version, meta) {
    o.confirm({
      title: "Restore the master map",
      text: restoreConfirmText({version}, meta ? relTime(meta.createdAt) : ""),
      ok: "Restore", danger: false,
      onOk: async () => {
        const r = await o.restore(version, S.master ? S.master.version : 0).catch(e => { throw new Error(reviewErrorText(e && e.status, e && e.message)); });
        o.toast(`Master restored to version ${version} (new version ${r.version}).`, {icon: "i-check"});
        if (o.onMasterChanged) o.onMasterChanged();
        backToList();
      },
    });
  }

  /* ---------- rendering ---------- */
  const mapsOptions = () => pickOptions(S.maps).filter(x => x.id !== "master");
  function statusChip(status) {
    const s = statusInfo(status);
    return h("span", {class: "prop-status rv-status " + s.cls}, icon(s.icon, "i i-sm"), h("b", {text: s.label}));
  }
  function listView() {
    // ----- proposals -----
    const filterSel = h("select", {class: "input rv-filter", aria: {label: "Which proposals to list"}});
    for (const f of FILTERS) filterSel.appendChild(h("option", {value: f.key, text: f.label, selected: S.filter === f.key}));
    filterSel.addEventListener("change", () => { S.filter = filterSel.value; render(); });
    body.appendChild(h("div", {class: "rv-sec-head"}, h("h3", {class: "eyebrow mp-group", text: "Proposals"}), filterSel));
    const list = filterProposals(S.proposals, S.filter);
    if (!list.length) body.appendChild(h("p", {class: "mp-state", text: S.filter === "open" ? "No open proposals. When someone submits a map for review, it shows up here." : "Nothing with this status yet."}));
    for (const p of list) {
      const lines = proposalLines(p, relTime);
      body.appendChild(h("button", {type: "button", class: "rv-row", disabled: !p.mapName && !p.id, onclick: () => openProposal(p.id)},
        h("span", {class: "cmp-chip " + (p.status === "submitted" ? "changed" : p.status === "approved" ? "added" : p.status === "declined" ? "removed" : "category")}, icon(statusInfo(p.status).icon, "i i-sm")),
        h("span", {class: "cmp-text"},
          h("span", {class: "cmp-sentence", text: lines.title}),
          h("span", {class: "cmp-detail", text: lines.meta + (p.note ? ` · “${p.note}”` : "")})),
        icon("i-chevron-right", "i rv-go")));
    }
    // ----- any map -----
    body.appendChild(h("h3", {class: "eyebrow mp-group", text: "Any map"}));
    const opts = mapsOptions();
    if (!opts.length) body.appendChild(h("p", {class: "mp-state", text: "Nobody has saved a map yet."}));
    else {
      const sel = h("select", {class: "input rv-mapsel", aria: {label: "A map to compare with the master"}});
      sel.appendChild(h("option", {value: "", text: "Pick a map to compare with the master…", selected: true}));
      let group = null;
      for (const x of opts) { if (x.group !== group) { group = x.group; sel.appendChild(h("optgroup", {label: group})); } sel.lastChild.appendChild(h("option", {value: x.id, text: x.label})); }
      sel.addEventListener("change", () => { if (sel.value) openMapItem(sel.value); });
      body.appendChild(h("div", {class: "rv-pick"}, sel));
    }
    // ----- master history -----
    body.appendChild(h("h3", {class: "eyebrow mp-group", text: "Master history"}));
    if (!S.history.length) body.appendChild(h("p", {class: "mp-state", text: "No master versions yet."}));
    const cur = S.master ? S.master.version : (S.history[0] || {}).version;
    for (const v of S.history.slice(0, 50)) {
      const lines = historyLines(v, cur, relTime);
      body.appendChild(h("div", {class: "cmp-row rv-hist", data: {version: v.version}},
        h("button", {type: "button", class: "cmp-main", title: "Preview this version on the plan", aria: {label: `Preview version ${v.version}: ${lines.title}`}, onclick: () => openVersion(v.version)},
          h("span", {class: "cmp-chip category"}, icon("i-history", "i i-sm")),
          h("span", {class: "cmp-text"}, h("span", {class: "cmp-sentence", text: lines.title}), h("span", {class: "cmp-detail", text: lines.meta}))),
        lines.current ? h("span", {class: "badge rv-current", text: "Current"}) : h("button", {type: "button", class: "btn small", onclick: () => confirmRestore(v.version, v)}, icon("i-history", "i i-sm"), "Restore")));
    }
    clear(foot);
  }
  const backLink = () => h("button", {type: "button", class: "rv-back", onclick: backToList}, icon("i-arrow-left", "i i-sm"), "All proposals and history");
  function detailHead(it) {
    if (!o.isTouch()) body.appendChild(backLink()); // on a phone the link is in the sheet's title row instead
    if (it.kind === "proposal") {
      const p = it.p;
      body.appendChild(h("div", {class: "rv-detail-head"},
        h("div", {class: "rv-title-row"}, h("h3", {class: "rv-title", text: p.mapName || "Map deleted"}), statusChip(p.status)),
        h("p", {class: "cmp-detail", text: [`From ${p.ownerName || "someone"}`, `sent ${relTime(p.createdAt) || "just now"}`, p.itemCount != null ? `${p.itemCount} items` : ""].filter(Boolean).join(" · ")}),
        p.note ? h("p", {class: "prop-note", text: `“${p.note}”`}) : null,
        p.status !== "submitted" ? h("p", {class: "cmp-detail", text: decisionLine(p, relTime)}) : null,
        p.status !== "submitted" && p.decisionNote ? h("p", {class: "prop-note prop-answer", text: `Note: ${p.decisionNote}`}) : null));
    } else if (it.kind === "map") {
      body.appendChild(h("div", {class: "rv-detail-head"},
        h("div", {class: "rv-title-row"}, h("h3", {class: "rv-title", text: it.name || "Map"})),
        h("p", {class: "cmp-detail", text: [it.ownerName ? `${it.ownerName}'s map` : "", "as saved right now"].filter(Boolean).join(" · ")}),
        o.onCompare ? h("p", {class: "pal-hint"}, "To put changes from this map on the master, ", h("button", {type: "button", class: "btn-link", onclick: () => o.onCompare(it.id)}, "open it in Comparison"), ".") : null));
    } else {
      const m = it.meta || {};
      const lines = historyLines({...m, version: it.version}, S.master ? S.master.version : null, relTime);
      body.appendChild(h("div", {class: "rv-detail-head"},
        h("div", {class: "rv-title-row"}, h("h3", {class: "rv-title", text: `Version ${it.version} preview`}), lines.current ? h("span", {class: "badge rv-current", text: "Current"}) : null),
        h("p", {class: "cmp-detail", text: lines.meta})));
    }
  }
  function detailRows(it) {
    const ticking = it.kind === "proposal" && it.p.status === "submitted";
    if (!S.diff) return;
    const n = S.diff.rows.length;
    const countText = n ? `${n} difference${n === 1 ? "" : "s"} from the master map (version ${S.master ? S.master.version : "?"}). Tap one to see it on the plan.` : (it.kind === "version" ? "This version matches today's master." : "No differences. This matches the master map.");
    const tickAll = ticking && n ? h("button", {type: "button", class: "btn small rv-tickall", onclick: () => { if (S.checked.size === n) S.checked.clear(); else S.checked = new Set(S.diff.rows.map(rowKey)); render(); }}, S.checked.size === n ? "Untick all" : "Tick all") : null;
    body.appendChild(h("div", {class: "rv-countrow"}, h("p", {class: "cmp-count", text: countText}), tickAll));
    if (S.notice) body.appendChild(h("div", {class: "notice error cmp-notice", role: "alert"}, h("span", {text: S.notice.text}),
      S.notice.reload ? h("button", {type: "button", class: "btn small", onclick: () => { S.notice = null; open(); }}, icon("i-reload"), "Reload") : null));
    if (!n && it.kind === "proposal" && it.p.status === "submitted") body.appendChild(h("p", {class: "pal-hint", text: "You can still approve it (nothing changes), ask for changes or decline it."}));
    for (const g of rowGroups(S.diff)) {
      body.appendChild(h("h3", {class: "eyebrow mp-group", text: `${g.title} · ${g.rows.length}`}));
      for (const r of g.rows) {
        const key = rowKey(r), on = S.selected === key;
        const typeLabel = r.group === "category" ? "Category" : r.type === "area" ? "Department block" : (TYPES[r.type] || {}).label || r.type;
        const detail = r.group === "category" ? r.details.slice(1).join(" · ") : [typeLabel, ...r.details.slice(1)].join(" · ");
        const row = h("div", {class: "cmp-row" + (on ? " selected" : ""), data: {key}});
        if (ticking) {
          const cb = h("input", {type: "checkbox", checked: S.checked.has(key), aria: {label: `Apply when approving: ${r.text}`}});
          cb.addEventListener("change", () => { if (cb.checked) S.checked.add(key); else S.checked.delete(key); renderFoot(); });
          row.appendChild(h("label", {class: "rv-check"}, cb));
        }
        row.appendChild(h("button", {type: "button", class: "cmp-main", aria: {pressed: on}, onclick: () => select(key)},
          h("span", {class: "cmp-chip " + r.group}, icon(kindIcon(r), "i i-sm")),
          h("span", {class: "cmp-text"}, h("span", {class: "cmp-sentence", text: r.text}), detail ? h("span", {class: "cmp-detail", text: detail}) : null)));
        body.appendChild(row);
      }
    }
  }
  /** The decision note and the one-line hints: the end of the scrolling part, where the reviewer has just read the rows. */
  function endNotes() {
    const it = S.openItem;
    if (!it) return;
    if (it.kind === "proposal" && it.p.status === "submitted") {
      const noteIn = h("textarea", {class: "input", id: "rvNote", rows: 2, maxlength: 500, placeholder: "Looks good · Move Paint first · …"});
      noteIn.value = S.note;
      noteIn.addEventListener("input", () => { S.note = noteIn.value; });
      body.appendChild(h("div", {class: "field rv-note"}, h("label", {for: "rvNote", text: `Note for ${it.p.ownerName || "them"} (optional)`}), noteIn));
      body.appendChild(h("p", {class: "pal-hint rv-hint", text: "Approving with changes saves a new master version and records it here."}));
    } else if (it.kind === "version") {
      const cur = S.master && S.master.version === it.version;
      body.appendChild(h("p", {class: "pal-hint rv-hint", text: cur ? "This is the current master version." : "Restoring saves a new master version; nothing is deleted."}));
    }
    if (it.kind === "proposal") body.appendChild(h("p", {class: "pal-hint rv-hint", text: "This is the map as it was when it was submitted. The ghosts on the plan show before (dashed) and after."}));
    else if (it.kind === "version") body.appendChild(h("p", {class: "pal-hint rv-hint", text: "The plan shows this old version. The list above is what restoring it would change on today's master."}));
  }
  /** The decisions: one compact, always-visible row (the note and hints scroll with the rows above it). */
  function renderFoot() {
    clear(foot);
    const it = S.openItem;
    if (!it) return;
    if (it.kind === "proposal" && it.p.status === "submitted") {
      const nChecked = S.diff ? S.diff.rows.filter(r => S.checked.has(rowKey(r))).length : 0;
      foot.appendChild(h("div", {class: "rv-foot-row"},
        h("button", {type: "button", class: "btn primary rv-approve", disabled: S.busy, title: approveLabel(nChecked), onclick: () => decide("approve")},
          icon("i-check", "i i-sm"), S.busy ? "Working…" : nChecked > 0 ? `Approve ${nChecked} change${nChecked === 1 ? "" : "s"}` : "Approve, no changes"),
        h("button", {type: "button", class: "btn", disabled: S.busy, onclick: () => decide("needs_changes")}, "Needs changes"),
        h("button", {type: "button", class: "btn danger", disabled: S.busy, onclick: () => decide("decline")}, "Decline")));
    } else if (it.kind === "version") {
      const cur = S.master && S.master.version === it.version;
      if (!cur) foot.appendChild(h("button", {type: "button", class: "btn primary wide", disabled: S.busy, onclick: () => confirmRestore(it.version, it.meta)}, icon("i-history", "i i-sm"), "Restore this version"));
    }
  }
  function render() {
    clear(head);
    const detailOnPhone = o.isTouch() && S.openItem && !S.loading && !S.error;
    head.appendChild(h("div", {class: "pal-title-row"}, detailOnPhone ? backLink() : h("h2", {class: "pal-title", text: "Review"}),
      o.isTouch() ? h("button", {type: "button", class: "icon-btn", aria: {label: "Close"}, onclick: () => o.onClose && o.onClose()}, icon("i-close")) : null));
    if (!S.openItem) head.appendChild(h("p", {class: "pal-hint", text: "Proposals from the team, any map against the master, and the master's history."}));
    clear(body);
    if (S.loading) { body.appendChild(h("p", {class: "mp-state", text: "Loading…"})); clear(foot); return; }
    if (S.error) { body.appendChild(h("div", {class: "mp-state"}, h("p", {text: S.error}), h("button", {type: "button", class: "btn small", onclick: () => (S.openItem ? backToList() : open())}, icon("i-reload"), "Try again"))); clear(foot); return; }
    if (!S.openItem) { listView(); return; }
    detailHead(S.openItem);
    detailRows(S.openItem);
    endNotes();
    renderFoot();
  }

  return {
    open, render, select, reveal, selectedRow, backToList,
    openProposal,
    get state() { return S; },
    get diff() { return S.diff; },
    /** The document the plan shows in Review: the open snapshot / map / version, else the current master. */
    shownDoc: () => (S.openItem && S.openItem.doc) || (S.master && S.master.data) || null,
    shownLayout() { const d = this.shownDoc(); if (!d) return null; let l = layouts.get(d); if (!l) { l = toLayout(d); layouts.set(d, l); } return l; },
  };
}
