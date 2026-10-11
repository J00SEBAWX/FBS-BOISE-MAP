/* The Add palette (docs/DESIGN.md 4.6), the Departments palette of the Categories tab (section 5), the category
 * editor dialog (create custom, edit any, hide defaults, delete custom) and the "Find a product" box. Everything
 * is built with createElement; names and colours come from the catalog or the person's own categories. */
import {h, icon, clear, modal, menuKeys, focusEl} from "./dom.js";
import {PALETTE, isStructureType} from "../core/doc.js";
import {summary, categoryFor} from "../core/areas.js";
import {CATALOG} from "../shared/catalog.js";
import {find} from "../core/finder.js";
import {colourOf} from "../plan2d/blocks.js";
import {formatSqft} from "../core/units.js";

const FIXTURES = ["gondola", "wallunit", "rack", "counter", "table", "display", "tower", "platform", "zone"];
const STRUCTURE = ["wall", "column", "door", "opening", "stairs"];

/* ======================================================================= the Add popover */
/**
 * createAddMenu({btn, pop, session, onAdd(type), onDepartment(key), isDark(), unlockHint() -> sentence}) : fixtures +
 * structure (locked rows while structure is locked) + the departments list. Opens on the button, closes on Esc /
 * outside / focus out.
 */
export function createAddMenu(o) {
  const {btn, pop} = o;
  let mode = "items"; // or "departments"
  const isOpen = () => !pop.hidden;
  function preview(type) {
    const def = PALETTE[type], w = Math.max(def.w, 0.5), d = Math.max(def.d, 0.5), s = Math.min(26 / w, 18 / d);
    return h("span", {class: "add-prev" + (isStructureType(type) ? " struct" : ""), aria: {hidden: true}}, h("span", {class: "add-prev-box", style: {"--pw": (w * s).toFixed(1), "--ph": (d * s).toFixed(1)}}));
  }
  function itemRow(type) {
    const def = PALETTE[type], locked = isStructureType(type) && !o.session.unlocked;
    return h("button", {type: "button", class: "add-row", role: "menuitem", tabindex: -1, aria: {disabled: locked}, data: {type},
      title: locked ? o.unlockHint() : `Add a ${def.label.toLowerCase()}`,
      onclick: () => { if (locked) { o.toast && o.toast(o.unlockHint()); return; } close(false); o.onAdd(type); }},
      preview(type), h("span", {class: "add-name", text: def.label}), locked ? icon("i-lock", "i i-sm add-lock") : null);
  }
  function deptRow(c, placed) {
    const col = colourOf(c, o.isDark());
    return h("button", {type: "button", class: "add-row dept", role: "menuitem", tabindex: -1, data: {key: c.key}, onclick: () => { close(false); o.onDepartment(c.key); }},
      h("span", {class: "swatch-sm", style: {"--c": col}, aria: {hidden: true}}), h("span", {class: "add-name", text: c.name}), placed ? icon("i-check", "i i-sm add-ok") : null);
  }
  function render() {
    clear(pop);
    if (mode === "departments") {
      pop.appendChild(h("div", {class: "pop-head"}, h("button", {type: "button", class: "icon-btn small", aria: {label: "Back"}, onclick: () => { mode = "items"; render(); focusFirst(); }}, icon("i-arrow-left")), h("p", {class: "pop-title", text: "Department"})));
      const placed = new Set(o.session.doc.items.filter(it => it.type === "area").map(it => it.cat));
      const list = h("div", {class: "add-list one"});
      for (const c of o.session.categories.filter(c => !c.hidden)) list.appendChild(deptRow(c, placed.has(c.key)));
      pop.appendChild(list);
      pop.appendChild(h("p", {class: "pop-hint", text: o.hint3d && o.hint3d() ? "Pick a department, then click the floor to place it." : "Pick a department, then tap the floor where it goes."}));
      return;
    }
    pop.appendChild(h("p", {class: "pop-title", text: "Add"}));
    pop.appendChild(h("p", {class: "pop-label", text: "Fixtures"}));
    pop.appendChild(h("div", {class: "add-list"}, FIXTURES.map(itemRow)));
    pop.appendChild(h("p", {class: "pop-label", text: "Structure"}));
    pop.appendChild(h("div", {class: "add-list"}, STRUCTURE.map(itemRow)));
    if (!o.session.unlocked) pop.appendChild(h("p", {class: "pop-hint", text: o.unlockHint()}));
    pop.appendChild(h("button", {type: "button", class: "add-row dept-entry", role: "menuitem", tabindex: -1, onclick: () => { mode = "departments"; render(); focusFirst(); }}, icon("i-blocks"), h("span", {class: "add-name", text: "Department block"}), icon("i-chevron-right", "i i-sm")));
  }
  const items = () => [...pop.querySelectorAll('[role="menuitem"]')];
  function focusFirst() { focusEl(items()[0]); }
  function open(m = "items") { mode = m; render(); pop.hidden = false; btn.setAttribute("aria-expanded", "true"); focusFirst(); }
  function close(refocus) { if (!isOpen()) return; pop.hidden = true; btn.setAttribute("aria-expanded", "false"); if (refocus) focusEl(btn, {reveal: false}); }
  btn.addEventListener("click", () => (isOpen() ? close(false) : open(o.startMode ? o.startMode() : "items")));
  menuKeys(pop, items, () => close(true));
  pop.addEventListener("keydown", e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const l = items(), i = l.indexOf(document.activeElement); focusEl(l[(i + (e.key === "ArrowRight" ? 1 : -1) + l.length) % l.length] || l[0]); } e.stopPropagation(); });
  document.addEventListener("pointerdown", e => { if (isOpen() && !pop.contains(e.target) && !btn.contains(e.target)) close(false); }, true);
  pop.addEventListener("focusout", e => { if (isOpen() && e.relatedTarget && !pop.contains(e.relatedTarget) && !btn.contains(e.relatedTarget)) close(false); });
  return {open, close, get isOpen() { return isOpen(); }};
}

/* ======================================================================= the Departments palette (Categories tab) */
/**
 * createDeptPalette({el, session, onPlace(key), placingKey() -> key | null, onSelectBlock(id), onEdit(key), onNew(), onFixtures(mode),
 *                    getFixtures() -> "on" | "faint" | "off", isDark(), canEdit(), onFind(result)}) -> {render()}
 * placingKey(): the department the person has picked and is about to draw on the floor; its row says so, and
 * tapping it again calls off the placing (onPlace with the same key).
 */
export function createDeptPalette(o) {
  const {el, session} = o;
  const head = h("div", {class: "pal-head"});
  const list = h("div", {class: "pal-list", role: "list"});
  const foot = h("div", {class: "pal-foot"});
  el.append(head, list, foot);
  const finder = createFinder({session, canEdit: () => o.canEdit(), onPick: r => o.onFind(r)});

  function render() {
    const S = summary(session.doc, {merged: session.categories});
    const T = S.totals;
    // On a phone the palette is a bottom sheet (or a side drawer in landscape) that scrolls as a whole: the head
    // keeps only the title, the progress and the finder so the first departments are in reach, and the totals and
    // the fixtures switch follow the list.
    const touch = o.isTouch();
    clear(head);
    head.appendChild(h("div", {class: "pal-title-row"}, h("h2", {class: "pal-title", text: "Departments"}),
      touch ? h("div", {class: "pal-title-actions"},
        o.canEdit() ? h("button", {type: "button", class: "btn small", aria: {label: "New category"}, onclick: () => o.onNew()}, icon("i-add"), "New") : null,
        h("button", {type: "button", class: "icon-btn", aria: {label: "Close"}, onclick: () => o.onClose && o.onClose()}, icon("i-close"))) : null));
    head.appendChild(h("p", {class: "pal-progress"}, h("b", {text: `${T.placed} of ${T.total}`}), ` departments placed`));
    head.appendChild(h("div", {class: "progress", role: "progressbar", aria: {valuemin: 0, valuemax: T.total, valuenow: T.placed, label: "Departments placed"}}, h("span", {class: "progress-fill", style: {"--p": T.total ? (T.placed / T.total).toFixed(3) : 0}})));
    const totals = h("p", {class: "pal-total", text: `${formatSqft(T.plannedSqft)} planned of ${formatSqft(T.availableSqft)} sales floor · targets ${formatSqft(T.targetSqft)}`, title: T.method});
    if (!touch) head.appendChild(totals);
    head.appendChild(finder.el);
    // the fixtures on the plan: shown (and selectable), a faint backdrop, or hidden (the blank slate, inside Area planning)
    const fm = o.getFixtures ? o.getFixtures() : "on";
    const seg = h("div", {class: "seg seg-wide pal-fix", role: "radiogroup", aria: {labelledby: "palFixLabel"}});
    for (const [v, label] of [["on", "Show"], ["faint", "Faint"], ["off", "Hide"]]) {
      seg.appendChild(h("button", {type: "button", role: "radio", aria: {checked: fm === v}, tabindex: fm === v ? 0 : -1, data: {fix: v}, text: label, onclick: () => o.onFixtures && o.onFixtures(v)}));
    }
    seg.addEventListener("keydown", e => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      const list = ["on", "faint", "off"], n = list[(list.indexOf(fm) + d + 3) % 3];
      o.onFixtures && o.onFixtures(n);
      focusEl(el.querySelector(`[data-fix="${n}"]`));
    });
    if (!touch) { head.appendChild(h("p", {class: "pal-fix-label", id: "palFixLabel", text: "Shelves, racks and displays (Hide for a blank slate)"})); head.appendChild(seg); }
    clear(list);
    const selIds = new Set(session.selection);
    const placingKey = o.placingKey ? o.placingKey() : null;
    for (const r of S.rows) {
      if (r.hidden) continue;
      const cat = categoryFor(session.doc, r.key, session.categories);
      const col = colourOf(cat, o.isDark());
      const selected = r.blocks.some(id => selIds.has(id));
      const placing = placingKey === r.key;
      const meta = placing ? "Drag on the floor where it goes" : !r.placed ? "Not placed yet" : `${r.blocks.length > 1 ? `${r.blocks.length} spots · ` : ""}${formatSqft(r.sqft)}${r.targetSqft > 0 ? ` of ${formatSqft(r.targetSqft).replace(" sq ft", "")}` : ""}${r.status === "under" ? " · under" : r.status === "over" ? " · over" : ""}`;
      // a placed department can still get another spot (Shift-click, or its Place again button): the main button selects it
      const row = h("div", {class: "pal-row" + (selected ? " selected" : "") + (placing ? " placing" : ""), role: "listitem"},
        h("button", {type: "button", class: "pal-main", aria: {label: `${cat.name}: ${meta}. ${placing ? "Tap again to cancel" : r.placed ? "Select it on the plan" : "Place it"}`, pressed: placing || undefined},
          onclick: () => (r.placed && !placing ? o.onSelectBlock(r.blocks[0]) : (o.canEdit() ? o.onPlace(r.key) : o.toast && o.toast("This map is view only. Make your own copy to place departments.")))},
          h("span", {class: "swatch-sm", style: {"--c": col}, aria: {hidden: true}}),
          h("span", {class: "pal-text"}, h("b", {text: cat.name}), h("span", {class: "pal-meta" + (placing ? " placing" : r.status === "under" || r.status === "over" ? " warn" : ""), text: meta})),
          placing ? h("span", {class: "pal-place on", aria: {hidden: true}}, icon("i-close", "i i-sm"), h("span", {class: "pal-place-t", text: "Cancel"}))
            : r.placed ? h("span", {class: "pal-ok"}, icon("i-check"), h("span", {class: "sr-only", text: "Placed"})) : (o.canEdit() ? h("span", {class: "pal-place", aria: {hidden: true}}, icon("i-add", "i i-sm"), h("span", {class: "pal-place-t", text: "Place"})) : null)),
        h("button", {type: "button", class: "pal-edit", aria: {label: `Edit category ${cat.name}`}, title: "Edit category", onclick: () => o.onEdit(r.key)}, icon("i-pencil")));
      list.appendChild(row);
    }
    if (S.rows.some(r => r.hidden)) {
      const hidden = S.rows.filter(r => r.hidden);
      list.appendChild(h("details", {class: "pal-hidden"}, h("summary", {text: `${hidden.length} hidden`}), ...hidden.map(r => {
        const cat = categoryFor(session.doc, r.key, session.categories);
        return h("div", {class: "pal-row muted"}, h("span", {class: "pal-main"}, h("span", {class: "swatch-sm", style: {"--c": colourOf(cat, o.isDark())}}), h("span", {class: "pal-text"}, h("b", {text: cat.name}), h("span", {class: "pal-meta", text: "Hidden"}))),
          h("button", {type: "button", class: "pal-edit", aria: {label: `Edit category ${cat.name}`}, onclick: () => o.onEdit(r.key)}, icon("i-pencil")));
      })));
    }
    clear(foot);
    if (touch) { foot.appendChild(totals); foot.appendChild(seg); }
    else if (o.canEdit()) foot.appendChild(h("button", {type: "button", class: "btn small wide", onclick: () => o.onNew()}, icon("i-add"), "New category"));
    foot.appendChild(h("p", {class: "pal-hint", text: o.canEdit() ? "Press Place next to a department, then tap the floor where it goes. Drag the block to move it; pull a corner to resize it." : "View only: tap a placed department to see it."}));
  }
  return {render};
}

/* ======================================================================= the product finder */
/** createFinder({session, canEdit(), onPick(result)}) -> {el, focus()} : type a product or brand -> ranked zones with the reason. */
export const NO_MATCH = "Nothing matched. Try the brand or the product type.";
/** Said when the product simply isn't in the catalog (lumber, plywood...): how to teach the map about it. */
export const NO_MATCH_EDIT = " Not in the list? Open a department (the pencil), add it under Subcategories, and it will be found here.";
export function createFinder(o) {
  const input = h("input", {class: "input finder-in", type: "search", placeholder: "Find a product (M18 battery, Diablo blade…)", aria: {label: "Find a product", controls: "finderResults", expanded: "false"}, autocomplete: "off", spellcheck: "false", maxlength: 100});
  const results = h("div", {class: "finder-results", id: "finderResults", role: "listbox", aria: {label: "Where it lives"}, hidden: true});
  const el = h("div", {class: "finder"}, h("span", {class: "finder-ico"}, icon("i-search")), input, results);
  let timer = 0;
  function run() {
    const q = input.value.trim();
    clear(results);
    if (!q) { results.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
    const list = find(q, CATALOG, o.session.categories, {limit: 5});
    const placed = new Set(o.session.doc.items.filter(it => it.type === "area").map(it => it.cat));
    if (!list.length) results.appendChild(h("p", {class: "finder-none", text: NO_MATCH + (o.canEdit && o.canEdit() ? NO_MATCH_EDIT : "")}));
    for (const r of list) {
      const cat = categoryFor(o.session.doc, r.key, o.session.categories);
      results.appendChild(h("button", {type: "button", class: "finder-row", role: "option", onclick: () => o.onPick({...r, placed: placed.has(r.key)})},
        h("span", {class: "swatch-sm", style: {"--c": (cat && cat.color) || "#677a8b"}, aria: {hidden: true}}),
        h("span", {class: "finder-text"},
          h("b", {text: r.zoneName + (r.group ? ` · ${r.group}` : "")}),
          r.subcat ? h("span", {class: "finder-sub", text: r.subcat}) : null,
          h("span", {class: "finder-why", text: r.why}),
          h("span", {class: "finder-state " + (placed.has(r.key) ? "ok" : "no"), text: placed.has(r.key) ? "Placed on this map" : "Not placed yet"}))));
    }
    results.hidden = false; input.setAttribute("aria-expanded", "true");
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  input.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") { input.value = ""; run(); }
    if (e.key === "ArrowDown") { const f = results.querySelector("button"); if (f) { e.preventDefault(); focusEl(f); } }
    if (e.key === "Enter") { e.preventDefault(); run(); const f = results.querySelector("button"); if (f) f.click(); }
  });
  results.addEventListener("keydown", e => {
    e.stopPropagation();
    const l = [...results.querySelectorAll("button")], i = l.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusEl(l[i + 1] || l[0]); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (i <= 0) focusEl(input); else focusEl(l[i - 1]); }
    else if (e.key === "Escape") { focusEl(input); }
  });
  return {el, focus: () => focusEl(input), clear: () => { input.value = ""; run(); }};
}

/* ======================================================================= the category editor dialog */
/**
 * createCategoryDialog({session, onSave(key | null, fields) -> error | null, onDelete(key), onReset(key), canEdit()})
 *  -> {open(key | null)} : null = a new custom category.
 */
export function createCategoryDialog(o) {
  const dlg = document.getElementById("catDlg"), form = dlg.querySelector("form");
  const title = dlg.querySelector("#cdTitle"), err = dlg.querySelector("#cdErr");
  const nameIn = dlg.querySelector("#cdName"), colorIn = dlg.querySelector("#cdColor"), swatches = dlg.querySelector("#cdSwatches"), familySel = dlg.querySelector("#cdFamily");
  const subsIn = dlg.querySelector("#cdSubs"), notesIn = dlg.querySelector("#cdNotes"), targetIn = dlg.querySelector("#cdTarget"), hiddenRow = dlg.querySelector("#cdHiddenRow"), hiddenIn = dlg.querySelector("#cdHidden");
  const save = dlg.querySelector("#cdSave"), del = dlg.querySelector("#cdDelete"), reset = dlg.querySelector("#cdReset"), cancel = dlg.querySelector("#cdCancel");
  const m = modal(dlg);
  let key = null;
  // the FBS category palette swatches (tokens --cat-01..12 in the catalog palette)
  const PAL = (Array.isArray(CATALOG.palette) ? CATALOG.palette : []).map(p => ({color: String(p.light || p.color || ""), name: p.hue || p.token || ""})).filter(p => /^#[0-9a-fA-F]{6}$/.test(p.color));
  clear(swatches);
  for (const p of PAL) {
    const b = h("button", {type: "button", class: "swatch", role: "radio", aria: {checked: false, label: p.name || p.color}, title: p.name || p.color, style: {"--c": p.color}, data: {color: String(p.color).toLowerCase()},
      onclick: () => { colorIn.value = String(p.color).toLowerCase(); syncSwatches(); }});
    swatches.appendChild(b);
  }
  function syncSwatches() { for (const b of swatches.querySelectorAll(".swatch")) { const on = b.dataset.color === colorIn.value.toLowerCase(); b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); } }
  colorIn.addEventListener("input", syncSwatches);
  clear(familySel);
  for (const [k, f] of Object.entries(CATALOG.families)) familySel.appendChild(h("option", {value: k, text: f.label}));
  familySel.appendChild(h("option", {value: CATALOG.customFamily, text: "Custom"}));

  function open(k) {
    key = k;
    const cat = k ? categoryFor(o.session.doc, k, o.session.categories) : null;
    const editable = o.canEdit();
    title.textContent = !k ? "New category" : editable ? "Edit category" : "Category";
    nameIn.value = cat ? cat.name : ""; colorIn.value = cat ? String(cat.color).toLowerCase() : (PAL[9] ? String(PAL[9].color).toLowerCase() : "#db5471");
    familySel.value = cat ? cat.family : CATALOG.customFamily;
    subsIn.value = cat ? (cat.subcats || []).join("\n") : ""; notesIn.value = cat ? cat.notes || "" : ""; targetIn.value = cat && cat.targetSqft ? String(Math.round(cat.targetSqft)) : "";
    hiddenRow.hidden = !(cat && cat.isDefault); hiddenIn.checked = !!(cat && cat.hidden);
    del.hidden = !(cat && cat.custom && editable); reset.hidden = !(cat && cat.isDefault && cat.overridden && editable);
    save.hidden = !editable; save.disabled = false; save.textContent = k ? "Save" : "Create category";
    for (const f of [nameIn, colorIn, familySel, subsIn, notesIn, targetIn, hiddenIn]) f.disabled = !editable;
    for (const b of swatches.querySelectorAll("button")) b.disabled = !editable;
    err.hidden = true; err.textContent = "";
    syncSwatches();
    m.open(nameIn);
  }
  form.addEventListener("submit", e => {
    e.preventDefault();
    const fields = {name: nameIn.value, color: colorIn.value, family: familySel.value, subcats: subsIn.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      notes: notesIn.value, targetSqft: targetIn.value === "" ? 0 : Number(targetIn.value), hidden: hiddenRow.hidden ? undefined : hiddenIn.checked};
    const error = o.onSave(key, fields);
    if (error) { err.textContent = error; err.hidden = false; return; }
    m.close("ok");
  });
  del.addEventListener("click", () => { const error = o.onDelete(key); if (error) { err.textContent = error; err.hidden = false; return; } m.close("ok"); });
  reset.addEventListener("click", () => { const error = o.onReset(key); if (error) { err.textContent = error; err.hidden = false; return; } m.close("ok"); });
  cancel.addEventListener("click", () => m.close("cancel"));
  return {open};
}

