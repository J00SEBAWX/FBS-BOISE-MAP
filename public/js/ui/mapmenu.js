/* The map switcher in the header (docs/DESIGN.md 7): the current map's name and maker on the button, a popover
 * with the Master map, My maps (+ New map, Rename, Make a copy, Delete) and Team maps grouped by person, the save
 * status, and the New map / Rename / Delete dialogs. Names come from the API and are set with textContent. */
import {h, icon, setIcon, clear, relTime, menuKeys, modal, focusEl} from "./dom.js";
import {statusInfo, proposalFor} from "../core/review.js";

const MAX_MAPS = 30;

/**
 * createMapMenu({onOpen(id | "master"), onCreate({name, from, mapId}) -> Promise, onRename(id, name) -> Promise,
 *                onDelete(id) -> Promise, onCopy(id), me: () => {id, name, role}, list: () => Promise<{mine, team}>})
 */
export function createMapMenu(o) {
  const btn = document.getElementById("mapBtn"), menu = document.getElementById("mapMenu");
  const nameEl = document.getElementById("mapName"), metaEl = document.getElementById("mapMeta"), icoEl = document.getElementById("mapBtnIcon");
  const status = document.getElementById("saveStatus"), statusIcon = document.getElementById("saveIcon"), statusText = document.getElementById("saveText");
  let maps = {mine: [], team: []}, current = {id: "master"}, loaded = false, sharing = false, proposals = [], legacy = false;

  /* ---------- the button ---------- */
  function setCurrent(c) {
    current = c;
    const master = c.id === "master";
    nameEl.textContent = master ? "Master map" : (c.name || "Map");
    const when = c.updatedAt ? relTime(c.updatedAt) : "";
    metaEl.textContent = master ? ["Confirmed layout", c.ownerName, when].filter(Boolean).join(" · ") : [c.ownerName, when ? "changed " + when : ""].filter(Boolean).join(" · ");
    setIcon(icoEl, master ? "i-star" : c.mine ? "i-map" : "i-user");
    icoEl.parentElement.classList.toggle("is-master", master);
    btn.setAttribute("aria-label", `Open map: ${nameEl.textContent}. Switch maps`);
    render();
  }

  /* ---------- save status ---------- */
  const STATUS = {
    saved: ["i-cloud-check", "Saved", "ok"], dirty: ["i-sync", "Saving…", "busy"], saving: ["i-sync", "Saving…", "busy"],
    retry: ["i-warning", "Not saved · retrying", "warn"], offline: ["i-cloud-off", "Offline · kept on this device", "muted"],
    rejected: ["i-warning", "Not saved", "warn"], conflict: ["i-error", "Not saved · reload", "warn"], locked: ["i-lock", "Not saved · master locked", "warn"],
    readonly: [null, "", ""], hidden: [null, "", ""],
  };
  function setStatus(state) {
    const s = STATUS[state] || STATUS.hidden;
    status.hidden = !s[0];
    status.className = "save-status " + s[2];
    if (s[0]) { setIcon(statusIcon, s[0]); statusText.textContent = s[1]; status.title = s[1]; }
    else statusText.textContent = "";
  }

  /* ---------- the menu ---------- */
  const isOpen = () => !menu.hidden;
  const items = () => [...menu.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')].filter(el => !el.hidden && el.offsetParent);
  function row(m, kind) {
    const mine = kind === "mine", master = kind === "master";
    const id = master ? "master" : m.id;
    const selected = current.id === id;
    const b = h("button", {type: "button", class: "mm-row" + (selected ? " current" : ""), role: "menuitemradio", aria: {checked: selected}, tabindex: -1, data: {id},
      onclick: () => { close(false); o.onOpen(id); }},
      h("span", {class: "mm-ico" + (master ? " master" : "")}, icon(master ? "i-star" : mine ? "i-map" : "i-user")),
      h("span", {class: "mm-text"},
        h("b", {text: master ? "Master map" : m.name}),
        h("span", {text: master ? [m.ownerName ? `${m.ownerName}` : "Confirmed layout", m.updatedAt ? relTime(m.updatedAt) : ""].filter(Boolean).join(" · ") : `Changed ${relTime(m.updatedAt) || "recently"}${m.itemCount != null ? ` · ${m.itemCount} items` : ""}`})),
      selected ? icon("i-check", "i mm-check") : null,
      !mine && !master ? h("span", {class: "badge", text: "View only"}) : null,
      mine ? propBadge(m.id) : null);
    if (!mine) return h("div", {class: "mm-item"}, b);
    // own maps: a More menu (Rename, Make a copy, Delete)
    const more = h("button", {type: "button", class: "mm-more", role: "menuitem", tabindex: -1, aria: {label: `More actions for ${m.name}`, haspopup: "menu", expanded: false},
      onclick: e => { e.stopPropagation(); openRowMenu(m, more); }}, icon("i-more"));
    return h("div", {class: "mm-item"}, b, more);
  }
  /** The review status of a map of your own ("Submitted", "Approved"…), as a small badge on its row. */
  function propBadge(id) {
    const p = proposalFor(id, proposals);
    if (!p) return null;
    const s = statusInfo(p.status);
    return h("span", {class: "badge prop-badge " + s.cls, title: p.decisionNote ? `${s.label}: ${p.decisionNote}` : s.label}, icon(s.icon, "i i-sm"), s.label);
  }
  let rowMenu = null;
  function openRowMenu(m, anchor) {
    closeRowMenu();
    rowMenu = h("div", {class: "menu mm-rowmenu", role: "menu"},
      h("button", {type: "button", role: "menuitem", onclick: () => { close(false); closeRowMenu(); renameDlg.start(m); }}, icon("i-pencil"), "Rename"),
      h("button", {type: "button", role: "menuitem", onclick: () => { close(false); closeRowMenu(); newDlg.start({from: "map", mapId: m.id, name: `Copy of ${m.name}`.slice(0, 60)}); }}, icon("i-duplicate"), "Make a copy"),
      h("button", {type: "button", role: "menuitem", class: "danger", onclick: () => { close(false); closeRowMenu(); confirmDelete(m); }}, icon("i-delete"), "Delete…"));
    anchor.parentElement.appendChild(rowMenu);
    anchor.setAttribute("aria-expanded", "true");
    focusEl(rowMenu.querySelector("button"));
    menuKeys(rowMenu, () => [...rowMenu.querySelectorAll("button")], () => { closeRowMenu(); focusEl(anchor, {reveal: false}); });
    rowMenu.addEventListener("focusout", e => { if (rowMenu && !rowMenu.contains(e.relatedTarget)) closeRowMenu(); });
  }
  function closeRowMenu() {
    if (!rowMenu) return;
    const m = rowMenu; rowMenu = null; // cleared first: removing the focused item fires focusout, which calls this again
    const a = m.parentElement && m.parentElement.querySelector(".mm-more"); if (a) a.setAttribute("aria-expanded", "false");
    m.remove();
  }

  function render() {
    clear(menu);
    const me = o.me();
    menu.appendChild(h("p", {class: "mm-label", role: "none", text: "Master"}));
    menu.appendChild(row(maps.master || {}, "master"));
    if (legacy) {
      // the server's maps aren't ready yet (core/readiness.js): the master is all there is, and New map waits
      menu.appendChild(h("p", {class: "mm-empty", role: "none", text: "Your own maps and the team's maps show up here once editing is switched on."}));
      menu.appendChild(h("button", {type: "button", class: "mm-new", role: "menuitem", tabindex: -1, disabled: true, aria: {disabled: true},
        title: "Editing isn't switched on yet."}, icon("i-add"), "New map"));
      return;
    }
    const mine = [...maps.mine].sort((a, b) => b.updatedAt - a.updatedAt);
    menu.appendChild(h("p", {class: "mm-label", role: "none", text: `My maps · ${mine.length} of ${MAX_MAPS}`}));
    if (!loaded) menu.appendChild(h("p", {class: "mm-empty", role: "none", text: "Loading your maps…"}));
    else if (!mine.length) menu.appendChild(h("p", {class: "mm-empty", role: "none", text: "No maps of your own yet. Start from a blank store (or a copy of the master map); only you can change it."}));
    for (const m of mine) menu.appendChild(row(m, "mine"));
    const full = mine.length >= MAX_MAPS;
    menu.appendChild(h("button", {type: "button", class: "mm-new", role: "menuitem", tabindex: -1, disabled: full, aria: {disabled: full},
      title: full ? `You have ${MAX_MAPS} maps, the most allowed. Delete one to make a new one.` : "",
      onclick: () => { close(false); newDlg.start({from: "blank"}); }}, icon("i-add"), "New map"));
    if (full) menu.appendChild(h("p", {class: "mm-empty", role: "none", text: `You have ${MAX_MAPS} maps, the most allowed. Delete one to make a new one.`}));
    const team = [...maps.team].sort((a, b) => b.updatedAt - a.updatedAt);
    if (team.length || (me && me.role === "admin") || sharing) {
      menu.appendChild(h("p", {class: "mm-label", role: "none", text: "Team maps"}));
      if (!team.length) menu.appendChild(h("p", {class: "mm-empty", role: "none", text: loaded ? "Nobody else has saved a map yet." : "Loading…"}));
      const byOwner = new Map();
      for (const m of team) { const k = m.ownerName || "Someone"; if (!byOwner.has(k)) byOwner.set(k, []); byOwner.get(k).push(m); }
      for (const [owner, list] of byOwner) {
        menu.appendChild(h("p", {class: "mm-owner", role: "none", text: owner}));
        for (const m of list) menu.appendChild(row(m, "team"));
      }
    }
  }
  function open() {
    render();
    menu.hidden = false; btn.setAttribute("aria-expanded", "true");
    const cur = menu.querySelector(".mm-row.current") || items()[0];
    focusEl(cur);
    refresh();
  }
  function close(refocus) { if (!isOpen()) return; closeRowMenu(); menu.hidden = true; btn.setAttribute("aria-expanded", "false"); if (refocus) focusEl(btn, {reveal: false}); }
  btn.addEventListener("click", () => (isOpen() ? close(false) : open()));
  btn.addEventListener("keydown", e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); open(); } });
  menuKeys(menu, items, () => close(true));
  menu.addEventListener("keydown", e => {
    // type-ahead: a letter jumps to the next map starting with it
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      const list = items(), i = list.indexOf(document.activeElement), k = e.key.toLowerCase();
      for (let n = 1; n <= list.length; n++) { const el = list[(i + n) % list.length], t = (el.querySelector("b") || el).textContent.trim().toLowerCase(); if (t.startsWith(k)) { focusEl(el); break; } }
    }
  });
  document.addEventListener("pointerdown", e => { if (isOpen() && !menu.contains(e.target) && !btn.contains(e.target)) close(false); }, true);
  const leaving = e => { if (isOpen() && e.relatedTarget && !menu.contains(e.relatedTarget) && !btn.contains(e.relatedTarget)) close(false); };
  menu.addEventListener("focusout", leaving);

  let refreshing = null;
  async function refresh() {
    if (legacy || refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const r = await o.list();
        maps = {...maps, mine: r.mine || [], team: r.team || []};
        loaded = true;
        if (isOpen()) { const f = document.activeElement; const id = f && f.dataset && f.dataset.id; render(); const again = id && menu.querySelector(`[data-id="${CSS.escape(id)}"]`); focusEl(again); }
      } catch { /* offline: the menu shows what it has */ }
      refreshing = null;
    })();
    return refreshing;
  }

  /* ---------- New map / rename dialog ---------- */
  const dlg = document.getElementById("newMapDlg"), form = dlg.querySelector("form");
  const nameIn = dlg.querySelector("#nmName"), fromBox = dlg.querySelector("#nmFrom"), copySel = dlg.querySelector("#nmCopy"), title = dlg.querySelector("#nmTitle");
  const hint = dlg.querySelector("#nmHint"), err = dlg.querySelector("#nmErr"), submit = dlg.querySelector("#nmSubmit");
  let mode = "new", renaming = null;
  const newDlg = modal(dlg);
  function fillCopyList() {
    clear(copySel);
    const all = [{id: "master", name: "Master map", ownerName: ""}, ...maps.mine, ...maps.team];
    for (const m of all) copySel.appendChild(h("option", {value: m.id, text: m.id === "master" ? "Master map" : `${m.ownerName ? m.ownerName + " · " : ""}${m.name}`}));
  }
  function syncFrom() {
    const v = form.elements.from.value;
    for (const card of fromBox.querySelectorAll(".card-radio")) card.classList.toggle("on", card.querySelector("input").value === v);
    copySel.closest(".nm-copy").hidden = v !== "map";
  }
  fromBox.addEventListener("change", syncFrom);
  newDlg.start = ({from = "blank", mapId = null, name = ""} = {}) => {
    mode = "new"; renaming = null;
    title.textContent = "New map";
    nameIn.value = name || `My map ${maps.mine.length + 1}`;
    fillCopyList();
    form.elements.from.value = mapId ? "map" : from;
    if (mapId) copySel.value = mapId;
    fromBox.hidden = false;
    hint.textContent = `You have ${maps.mine.length} of ${MAX_MAPS} maps. Only you can change your maps.`;
    err.hidden = true; err.textContent = ""; submit.textContent = "Create map"; submit.disabled = false;
    syncFrom();
    newDlg.open(nameIn); nameIn.select();
  };
  const renameDlg = {start(m) {
    mode = "rename"; renaming = m;
    title.textContent = "Rename map";
    nameIn.value = m.name; fromBox.hidden = true; hint.textContent = "";
    err.hidden = true; err.textContent = ""; submit.textContent = "Rename"; submit.disabled = false;
    newDlg.open(nameIn); nameIn.select();
  }};
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const name = nameIn.value.replace(/\s+/g, " ").trim();
    if (!name || name.length > 60) { err.textContent = "Give the map a name of 1 to 60 characters."; err.hidden = false; focusEl(nameIn); return; }
    submit.disabled = true; submit.textContent = mode === "new" ? "Creating…" : "Renaming…"; err.hidden = true;
    try {
      if (mode === "new") { const from = form.elements.from.value; await o.onCreate({name, from, mapId: from === "map" ? copySel.value : undefined}); }
      else await o.onRename(renaming.id, name);
      newDlg.close("ok");
      refresh();
    } catch (ex) {
      err.textContent = (ex && ex.message) || "Something went wrong."; err.hidden = false;
      submit.disabled = false; submit.textContent = mode === "new" ? "Create map" : "Rename";
    }
  });
  dlg.querySelector("#nmCancel").addEventListener("click", () => newDlg.close("cancel"));

  /* ---------- delete confirm ---------- */
  const cdlg = document.getElementById("confirmDlg"), confirmDlg = modal(cdlg);
  const cTitle = cdlg.querySelector("#cfTitle"), cText = cdlg.querySelector("#cfText"), cOk = cdlg.querySelector("#cfOk"), cCancel = cdlg.querySelector("#cfCancel");
  let onConfirm = null;
  cOk.addEventListener("click", async () => { cOk.disabled = true; try { if (onConfirm) await onConfirm(); confirmDlg.close("ok"); } catch (ex) { cText.textContent = (ex && ex.message) || "Something went wrong."; } cOk.disabled = false; });
  cCancel.addEventListener("click", () => confirmDlg.close("cancel"));
  /** A generic confirm: confirm({title, text, ok, danger}) -> Promise<boolean> (also used by the app for other confirms). */
  function confirm({title: t, text, ok = "OK", danger = false, onOk}) {
    cTitle.textContent = t; cText.textContent = text; cOk.textContent = ok; cOk.className = "btn " + (danger ? "danger solid" : "primary"); cOk.disabled = false;
    return new Promise(resolve => {
      onConfirm = onOk || null;
      const done = v => { cdlg.removeEventListener("close", done); resolve(cdlg.returnValue === "ok" || v === true); };
      cdlg.addEventListener("close", done);
      confirmDlg.open(cCancel);
    });
  }
  function confirmDelete(m) {
    confirm({title: "Delete map", text: `Delete “${m.name}”? This can't be undone.`, ok: "Delete map", danger: true, onOk: async () => { await o.onDelete(m.id); refresh(); }});
  }

  return {
    setCurrent, setStatus, refresh, close, confirm,
    newMap: opts => newDlg.start(opts || {}),
    rename: m => renameDlg.start(m),
    delete: m => confirmDelete(m),
    get maps() { return maps; },
    setMaster(meta) { maps = {...maps, master: meta}; if (current.id === "master") setCurrent({...current, ...meta, id: "master"}); },
    setSharing(on) { sharing = !!on; },
    /** The server's maps aren't ready: the menu shows the master only, and New map is off. */
    setLegacy(on) { legacy = !!on; if (isOpen()) render(); },
    /** The person's own proposals, so their map rows show "Submitted" / "Approved" / … */
    setProposals(list) { proposals = list || []; if (isOpen()) render(); },
    /** The meta of a map in the lists (mine or team), or null. */
    find: id => maps.mine.find(m => m.id === id) || maps.team.find(m => m.id === id) || null,
  };
}
