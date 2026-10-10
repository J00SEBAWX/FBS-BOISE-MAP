/* The inspector (docs/DESIGN.md 4.2 and 5): what is selected, with every editable field (feet-and-inches text
 * inputs: Enter or blur commits one undo step, Esc reverts, Up / Down step 1", Shift 6"), the name and colour,
 * type details, notes and status; for a department block the area, target, Size to target, Lock area, Edit shape,
 * the checks and the subcategories; several items share rotation, colour and height; nothing selected shows the
 * map summary and how-to tips; a locked structure item shows its values as text with an Unlock button. On phones
 * the same panel is the bottom sheet (peek / expanded / closed). Every value is set with textContent / .value. */
import {h, icon, clear, relTime} from "./dom.js";
import {formatFtIn, formatSqft} from "../core/units.js";
import {TYPES, BRAND_NAMES, displayName, categoryOf, isStructure} from "../core/model.js";
import {blockArea, categoryFor} from "../core/areas.js";
import {checkItem} from "../core/collisions.js";
import {ITEM_STATUSES} from "../shared/schema.js";

export const FIXTURE_SWATCHES = Object.freeze([
  ["Fixture grey", "#c9ccce"], ["White", "#f1f1ee"], ["Black", "#1d1d1d"], ["Milwaukee red", "#b3121f"],
  ["DeWalt yellow", "#f2b705"], ["Makita teal", "#008a95"], ["Kreg blue", "#1846a8"], ["Wood", "#8a5a34"],
]);
const STATUS_LABEL = {proposed: "Proposed", confirmed: "Confirmed", needs_review: "Needs review"};
const SHELVING = new Set(["gondola", "wallunit", "rack", "display", "tower", "counter", "table"]);
const LENGTH = {x: "X (from west)", y: "Y (from south)", w: "Length", d: "Depth", h: "Height"};

/**
 * createInspector({el, session, editor, canEdit(), isTouch(), mapInfo(), modeNotice() -> sentence | null (a read-only mode),
 *   issues() -> {count, label} | null (the map's collision warnings), onIssues() (show the first one),
 *   act: {setField(ids, field, value) -> error | null, duplicate(), rotate(deg), remove(), sizeToTarget(id), lockArea(id, on),
 *   setCategory(id, key), editCategory(key), setTarget(key, sqft), unlock(), goLook(item), toRectangle(id), fit(items)}})
 */
export function createInspector(o) {
  const {el, session} = o;
  let key = "", sheet = "closed", lastSel = "";
  const canEdit = () => o.canEdit();

  /* ---------- fields ---------- */
  function lengthField(ids, field, label, value, opts = {}) {
    const id = "f-" + field, msg = h("span", {class: "f-msg", id: id + "-msg", hidden: true});
    if (!opts.editable) return h("div", {class: "field ro"}, h("span", {class: "f-label", text: label}), h("span", {class: "f-value", text: field === "rot" ? `${Math.round((value || 0) * 100) / 100}°` : formatFtIn(value)}));
    const input = h("input", {class: "input f-in", id, type: "text", inputmode: "decimal", autocomplete: "off", spellcheck: "false", data: {field},
      value: field === "rot" ? String(Math.round((value || 0) * 100) / 100) : formatFtIn(value), aria: {describedby: id + "-msg"}});
    const commit = () => {
      const raw = input.value.trim();
      const was = input.dataset.was;
      if (raw === was) return;
      const err = o.act.setField(ids, field, raw);
      if (err) { input.setAttribute("aria-invalid", "true"); msg.textContent = err; msg.hidden = false; }
      else { input.removeAttribute("aria-invalid"); msg.hidden = true; }
    };
    input.dataset.was = input.value;
    input.addEventListener("focus", () => { input.dataset.was = input.value; input.select(); });
    input.addEventListener("change", commit);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); commit(); input.dataset.was = input.value; }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); input.value = input.dataset.was; input.removeAttribute("aria-invalid"); msg.hidden = true; input.blur(); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = session.single ? session.single[field] : null;
        const step = field === "rot" ? (e.shiftKey ? 15 : 1) : (e.shiftKey ? 0.5 : 1 / 12);
        const next = (Number.isFinite(cur) ? cur : 0) + (e.key === "ArrowUp" ? step : -step);
        const err = o.act.setField(ids, field, field === "rot" ? String(Math.round(next * 100) / 100) : String(Math.round(next * 10000) / 10000));
        if (!err) { input.value = field === "rot" ? String(Math.round(next * 100) / 100) : formatFtIn(next); input.dataset.was = input.value; }
      }
      e.stopPropagation();
    });
    return h("div", {class: "field"}, h("label", {class: "f-label", for: id, text: label}), input, msg);
  }
  function textField(ids, field, label, value, opts = {}) {
    const id = "f-" + field, multiline = field === "notes";
    if (!opts.editable) return value ? h("div", {class: "field ro wide"}, h("span", {class: "f-label", text: label}), h("span", {class: "f-value pre", text: value})) : null;
    const input = multiline
      ? h("textarea", {class: "input f-in", id, rows: 3, maxlength: 500, placeholder: opts.placeholder || "", data: {field}, value: value || ""})
      : h("input", {class: "input f-in", id, type: "text", maxlength: opts.max || 80, autocomplete: "off", data: {field}, value: value || ""});
    const msg = h("span", {class: "f-msg", hidden: true});
    const commit = () => { if (input.value === input.dataset.was) return; const err = o.act.setField(ids, field, input.value); if (err) { input.setAttribute("aria-invalid", "true"); msg.textContent = err; msg.hidden = false; } else { input.removeAttribute("aria-invalid"); msg.hidden = true; input.dataset.was = input.value; } };
    input.dataset.was = input.value;
    input.addEventListener("change", commit);
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); } else if (e.key === "Escape") { input.value = input.dataset.was; input.blur(); } e.stopPropagation(); });
    return h("div", {class: "field wide"}, h("label", {class: "f-label", for: id, text: label}), input, msg);
  }
  function selectField(ids, field, label, value, options, opts = {}) {
    const id = "f-" + field;
    if (!opts.editable) { const cur = options.find(x => x[0] === value); return h("div", {class: "field ro"}, h("span", {class: "f-label", text: label}), h("span", {class: "f-value", text: cur ? cur[1] : (value || "–")})); }
    const sel = h("select", {class: "input f-in", id, data: {field}}, options.map(([v, t]) => h("option", {value: v, text: t, selected: v === (value ?? "")})));
    sel.addEventListener("change", () => { const err = o.act.setField(ids, field, sel.value === "" ? null : sel.value); if (err) o.toast && o.toast(err); });
    sel.addEventListener("keydown", e => e.stopPropagation());
    return h("div", {class: "field" + (opts.wide ? " wide" : "")}, h("label", {class: "f-label", for: id, text: label}), sel);
  }
  function switchRow(label, on, onChange, opts = {}) {
    const b = h("button", {type: "button", class: "switch-row", role: "switch", aria: {checked: !!on}, disabled: !!opts.disabled, onclick: () => onChange(b.getAttribute("aria-checked") !== "true")},
      h("span", {class: "sw-label", text: label}), h("span", {class: "sw-track", aria: {hidden: true}}, h("span", {class: "sw-knob"})));
    return b;
  }
  function colourField(ids, value, editable) {
    const cur = String(value || "").toLowerCase();
    if (!editable) return null;
    const group = h("div", {class: "swatches", role: "radiogroup", aria: {label: "Colour"}});
    let matched = false;
    for (const [name, hex] of FIXTURE_SWATCHES) {
      const on = cur === hex;
      matched = matched || on;
      const b = h("button", {type: "button", class: "swatch" + (on ? " on" : ""), role: "radio", aria: {checked: on, label: name}, title: name, style: {"--c": hex},
        onclick: () => { const err = o.act.setField(ids, "color", hex); if (err && o.toast) o.toast(err); }});
      group.appendChild(b);
    }
    const other = h("input", {type: "color", class: "swatch-other", value: /^#[0-9a-f]{6}$/.test(cur) ? cur : "#c9ccce", aria: {label: "Other colour"}, title: "Other colour"});
    other.addEventListener("input", () => { const err = o.act.setField(ids, "color", other.value); if (err && o.toast) o.toast(err); });
    group.appendChild(h("span", {class: "swatch-wrap" + (!matched && cur ? " on" : "")}, other, icon("i-add", "i swatch-plus")));
    return h("div", {class: "field wide"}, h("span", {class: "f-label", text: "Colour"}), group);
  }
  const section = (title, ...kids) => h("section", {class: "insp-sec"}, title ? h("h3", {class: "eyebrow", text: title}) : null, ...kids);
  const grid = (...kids) => h("div", {class: "f-grid"}, ...kids);
  const btn = (label, ico, onclick, cls = "btn", extra = {}) => h("button", {type: "button", class: cls, onclick, ...extra}, ico ? icon(ico) : null, label);

  /* ---------- the item views ---------- */
  function header(eyebrow, name, meta, locked) {
    return h("div", {class: "insp-head"},
      h("div", {class: "insp-eyebrow"}, h("span", {class: "eyebrow", text: eyebrow}), locked ? h("span", {class: "chip"}, icon("i-lock", "i i-sm"), "Locked") : null),
      h("h2", {class: "insp-name", text: name}),
      meta ? h("p", {class: "insp-meta", text: meta}) : null,
      o.isTouch() ? h("button", {type: "button", class: "icon-btn insp-close", aria: {label: "Close"}, onclick: () => { session.clearSelection(); setSheet("closed"); }}, icon("i-close")) : null);
  }
  function positionSection(ids, it, editable) {
    return section("Position & size", grid(
      lengthField(ids, "x", LENGTH.x, it.x, {editable}), lengthField(ids, "y", LENGTH.y, it.y, {editable}),
      lengthField(ids, "w", LENGTH.w, it.w, {editable}), lengthField(ids, "d", LENGTH.d, it.d, {editable}),
      lengthField(ids, "h", LENGTH.h, it.h, {editable}), lengthField(ids, "rot", "Rotation (°)", it.rot || 0, {editable})));
  }
  function catField(it, catOpts) {
    const sel = h("select", {class: "input f-in", id: "f-cat"}, catOpts.map(([v, t]) => h("option", {value: v, text: t, selected: v === it.cat})));
    sel.addEventListener("change", () => { const err = o.act.setCategory(it.id, sel.value); if (err && o.toast) o.toast(err); });
    sel.addEventListener("keydown", e => e.stopPropagation());
    return h("div", {class: "field"}, h("label", {class: "f-label", for: "f-cat", text: "Department"}), sel);
  }
  function statusField(ids, it, editable) { return selectField(ids, "status", "Status", it.status || "", [["", "Not set"], ...ITEM_STATUSES.map(s => [s, STATUS_LABEL[s]])], {editable}); }

  function fixtureView(it) {
    const ids = [it.id], locked = session.isLocked(it), editable = canEdit() && !locked;
    const typeLabel = (TYPES[it.type] || {}).label || it.type;
    const kids = [header(typeLabel.toUpperCase() + (isStructure(it) ? " · STRUCTURE" : ""), displayName(it), categoryOf(it) !== typeLabel ? categoryOf(it) : "", locked)];
    if (locked && canEdit()) kids.push(h("div", {class: "notice warn insp-notice"}, h("p", {text: "Structure is locked. Unlock it in the toolbar to change walls, doors, columns, floors and stairs."}), btn("Unlock structure", "i-unlock", () => o.act.unlock(), "btn small")));
    kids.push(positionSection(ids, it, editable));
    const brandOpts = [["", "None"], ...Object.entries(BRAND_NAMES)];
    kids.push(section("Name & colour", textField(ids, "name", "Name", it.name, {editable, max: 80}), colourField(ids, it.color, editable)));
    const details = [];
    if (SHELVING.has(it.type)) { details.push(selectField(ids, "brand", "Brand / stock", it.brand || "", brandOpts, {editable})); details.push(selectField(ids, "brand2", "Second brand", it.brand2 || "", brandOpts, {editable})); }
    if (it.type === "floor") details.push(lengthField(ids, "ceil", "Ceiling height", it.ceil ?? 0, {editable}));
    details.push(statusField(ids, it, editable));
    kids.push(section(`${typeLabel} details`, grid(...details), textField(ids, "notes", "Notes", it.notes, {editable, placeholder: "Anything the team should know"})));
    if (it.toConfirm) kids.push(section("To check in the store", h("p", {class: "insp-check", text: it.toConfirm})));
    if (editable && o.canGoLook && o.canGoLook(it)) kids.push(section(null, h("div", {class: "btn-row"}, btn("Go look at it", "i-walk", () => o.act.goLook(it), "btn small"))));
    kids.push(actions(it, editable, false));
    kids.push(h("p", {class: "insp-foot", text: `Item ${it.id} · Drag to move · corner handles resize · the top handle rotates`}));
    return kids;
  }

  function blockView(it) {
    const ids = [it.id], editable = canEdit() && !session.isLocked(it);
    const cat = categoryFor(session.doc, it.cat, session.categories);
    const name = (cat && cat.name) || it.name || "Department";
    const family = cat && cat.family ? (cat.family === "custom" ? "custom" : cat.family) : "";
    const area = blockArea(it), target = cat ? cat.targetSqft || 0 : 0;
    const kids = [header(`DEPARTMENT${family ? " · " + family.toUpperCase() : ""}`, name, it.status ? STATUS_LABEL[it.status] : "", false)];
    // area
    const range = cat && Array.isArray(cat.sqft) && cat.sqft[0] > 0 ? `Suggested size for this department: ${cat.sqft[0].toLocaleString("en-US")} to ${cat.sqft[1].toLocaleString("en-US")} sq ft` : "";
    const over = target > 0 ? (area > target * 1.1 ? "Over the target" : area < target * 0.9 ? "Under the target" : "On target") : "";
    kids.push(section("Area",
      h("div", {class: "area-big"}, h("b", {text: formatSqft(area)}), h("span", {text: `${formatFtIn(it.w)} × ${formatFtIn(it.d)}${it.shape === "poly" ? ` · ${(it.pts || []).length} corners` : ""}`})),
      target > 0 ? h("p", {class: "area-target", text: `Target ${formatSqft(target)} · ${over}`}) : h("p", {class: "area-target", text: "No target set for this department."}),
      range ? h("p", {class: "insp-hint", text: range}) : null,
      editable ? h("div", {class: "btn-row"},
        btn("Size to target", "i-fit", () => o.act.sizeToTarget(it.id), "btn small", {disabled: !(target > 0), title: target > 0 ? `Resize to ${formatSqft(target)} keeping the proportions` : "Set a target first"}),
        btn(o.editor.shapeEdit ? "Done editing shape" : "Edit shape", "i-pencil", () => { o.editor.setShapeEdit(!o.editor.shapeEdit); render(true); }, "btn small" + (o.editor.shapeEdit ? " pressed" : ""), {aria: {pressed: o.editor.shapeEdit}})) : null,
      editable ? switchRow("Lock area (keep the sq ft while resizing)", !!it.lockArea, on => o.act.lockArea(it.id, on)) : null,
      editable && o.editor.shapeEdit ? h("div", {class: "btn-row"},
        btn("Remove corner", "i-minus", () => o.editor.removeCorner(), "btn small", {disabled: o.editor.cornerSel < 0, title: "Tap a corner first"}),
        btn("Back to a rectangle", "i-grid", () => { o.editor.setShapeEdit(false); o.act.toRectangle(it.id); }, "btn small")) : null,
      editable && o.editor.shapeEdit ? h("p", {class: "insp-hint", text: "Drag a corner to move it. Tap + on an edge to add a corner. Tap a corner, then Remove corner."}) : null));
    // category + target
    const catOpts = session.categories.filter(c => !c.hidden || c.key === it.cat).map(c => [c.key, c.name]);
    const targetIn = h("input", {class: "input f-in", id: "f-target", type: "number", min: 0, max: 20000, step: 10, inputmode: "numeric", value: target ? String(Math.round(target)) : ""});
    targetIn.addEventListener("change", () => { const v = Number(targetIn.value); if (cat) { const err = o.act.setTarget(cat.key, Number.isFinite(v) ? v : 0); if (err && o.toast) o.toast(err); } });
    targetIn.addEventListener("keydown", e => e.stopPropagation());
    kids.push(section("Department", grid(
      editable ? catField(it, catOpts) : h("div", {class: "field ro"}, h("span", {class: "f-label", text: "Department"}), h("span", {class: "f-value", text: name})),
      editable ? h("div", {class: "field"}, h("label", {class: "f-label", for: "f-target", text: "Target sq ft"}), targetIn) : h("div", {class: "field ro"}, h("span", {class: "f-label", text: "Target sq ft"}), h("span", {class: "f-value", text: target ? String(Math.round(target)) : "–"})),
      statusField(ids, it, editable)),
      cat ? h("div", {class: "btn-row"}, btn(canEdit() ? "Edit category…" : "Category details", "i-pencil", () => o.act.editCategory(cat.key), "btn small")) : null));
    // checks (the live collision result when the app has one, else a fresh check of this block)
    const issues = (o.issuesFor && o.issuesFor(it.id)) || checkItem(session.doc, it);
    const nearKeys = (cat && cat.adjacency) || [];
    const placedKeys = new Set(session.doc.items.filter(x => x.type === "area").map(x => x.cat));
    const near = nearKeys.map(k => { const c = categoryFor(session.doc, k, session.categories); return c ? `${c.name} (${placedKeys.has(k) ? "placed" : "not placed yet"})` : null; }).filter(Boolean);
    const checks = h("ul", {class: "checks"});
    for (const i of issues) checks.appendChild(h("li", {class: "chk " + i.severity}, icon(i.severity === "error" ? "i-error" : "i-warning"), h("span", {text: i.message})));
    if (!issues.some(i => i.kind === "door" || i.kind === "opening" || i.kind === "stairs")) checks.appendChild(h("li", {class: "chk ok"}, icon("i-check"), h("span", {text: "Keeps doorways, arches and stairs clear"})));
    if (!issues.some(i => i.kind === "outside")) checks.appendChild(h("li", {class: "chk ok"}, icon("i-check"), h("span", {text: "Inside the building"})));
    if (!issues.some(i => i.kind === "block")) checks.appendChild(h("li", {class: "chk ok"}, icon("i-check"), h("span", {text: "Doesn't overlap another department"})));
    if (near.length) checks.appendChild(h("li", {class: "chk info"}, icon("i-info"), h("span", {text: `Best next to ${near.join(", ")}.`})));
    const checksSec = section("Checks", checks);
    checksSec.classList.add("insp-checks"); checksSec.tabIndex = -1; checksSec.setAttribute("aria-label", issues.length ? `Checks: ${issues.length} warning${issues.length === 1 ? "" : "s"}` : "Checks: all clear");
    kids.push(checksSec);
    // subcategories
    const subs = (cat && cat.subcats) || [];
    if (subs.length) {
      const list = h("ul", {class: "subcats"}, subs.slice(0, 4).map(s => h("li", {text: s})));
      const more = subs.length > 4 ? h("button", {type: "button", class: "link small", text: `Show all ${subs.length}`, onclick: () => { clear(list); for (const s of subs) list.appendChild(h("li", {text: s})); more.remove(); }}) : null;
      kids.push(section("Subcategories", list, more));
    }
    kids.push(section("Notes", textField(ids, "notes", "Notes for this spot", it.notes, {editable, placeholder: "Anything the team should know about this spot"})));
    kids.push(positionSection(ids, it, editable));
    kids.push(actions(it, editable, true));
    kids.push(h("p", {class: "insp-foot", text: `Block ${it.id} · Double-tap a block to fine-tune it`}));
    return kids;
  }

  function actions(it, editable, block) {
    if (!editable) return canEdit() ? null : h("div", {class: "insp-actions"}, o.act.goLook && it.type !== "wall" && it.type !== "ceiling" && it.type !== "area" ? btn("Go look at it", "i-walk", () => o.act.goLook(it), "btn") : null);
    return h("div", {class: "insp-actions"},
      btn(block ? "Split into two" : "Duplicate", "i-duplicate", () => o.act.duplicate(), "btn"),
      btn("Rotate 90°", "i-rotate", () => o.act.rotate(90), "btn"),
      h("button", {type: "button", class: "btn danger icon-only", aria: {label: block ? "Remove" : "Delete"}, title: block ? "Remove (Delete)" : "Delete (Del)", onclick: () => o.act.remove()}, icon("i-delete")));
  }

  function multiView(items) {
    const ids = items.map(it => it.id);
    const editable = canEdit() && items.some(it => !session.isLocked(it));
    const first = items[0];
    const same = f => items.every(it => it[f] === first[f]);
    return [
      header(`${items.length} ITEMS SELECTED`, items.map(displayName).slice(0, 3).join(", ") + (items.length > 3 ? "…" : ""), items.some(it => session.isLocked(it)) ? "Locked structure in the selection stays put." : "", false),
      section("Shared fields", grid(
        lengthField(ids, "rot", "Rotation (°)", same("rot") ? first.rot || 0 : 0, {editable}),
        lengthField(ids, "h", "Height", same("h") ? first.h : 0, {editable})),
        colourField(ids, same("color") ? first.color : "", editable)),
      editable ? h("div", {class: "insp-actions"},
        btn("Duplicate", "i-duplicate", () => o.act.duplicate(), "btn"),
        btn("Rotate 90°", "i-rotate", () => o.act.rotate(90), "btn"),
        h("button", {type: "button", class: "btn danger icon-only", aria: {label: "Delete"}, title: "Delete (Del)", onclick: () => o.act.remove()}, icon("i-delete"))) : null,
      h("p", {class: "insp-foot", text: "Shift-click (or Select several) adds to the selection · arrows nudge everything"}),
    ];
  }

  function emptyView() {
    const m = o.mapInfo();
    const counts = new Map();
    for (const it of session.layout.items) { const k = it.type === "area" ? "Departments" : (TYPES[it.type] || {}).label || it.type; counts.set(k, (counts.get(k) || 0) + 1); }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const notice = o.modeNotice ? o.modeNotice() : null;
    const iss = o.issues ? o.issues() : null;
    return [
      h("div", {class: "insp-head"}, h("span", {class: "eyebrow", text: m.master ? "MASTER MAP" : "MAP"}), h("h2", {class: "insp-name", text: m.name}),
        h("p", {class: "insp-meta", text: [m.ownerName ? (m.master ? `Confirmed layout · ${m.ownerName}` : `Made by ${m.ownerName}`) : "", m.updatedAt ? `changed ${relTime(m.updatedAt)}` : ""].filter(Boolean).join(" · ")})),
      notice ? h("div", {class: "notice insp-notice mode-notice"}, h("p", {text: notice})) : null,
      iss && iss.count ? section("Warnings", h("ul", {class: "checks"}, h("li", {class: "chk error"}, icon("i-warning"), h("span", {text: `${iss.label} on this map: department blocks that overlap walls, columns, stairs, desks, doorways or each other.`}))),
        h("div", {class: "btn-row"}, btn("Show the first", "i-eye", () => o.onIssues && o.onIssues(), "btn small"))) : null,
      section("What's on it", h("ul", {class: "counts"}, top.map(([k, n]) => h("li", {}, h("b", {text: String(n)}), ` ${k}`)))),
      canEdit() ? section("How to edit", h("ul", {class: "tips"},
        h("li", {text: "Tap an item to select it"}), h("li", {text: "Drag to move · corner handles resize"}), h("li", {text: "The top handle rotates (15° steps, Shift for free)"}),
        h("li", {text: "Shift-click adds to the selection · arrows nudge 6\" (Shift 5')"}), h("li", {text: "Structure is locked until you unlock it in the toolbar"}))) :
        notice ? null : section("View only", h("p", {class: "insp-hint", text: m.master ? "Only the admin changes the master map. Make your own copy to try ideas." : "This map belongs to someone else. Make your own copy to change it."})),
    ];
  }

  /* ---------- render ---------- */
  function render(force) {
    const items = session.selected();
    const k = [items.map(it => it.id).join(","), session.unlocked, canEdit(), o.editor.shapeEdit, o.editor.cornerSel, items.map(it => it.type + ":" + it.cat + ":" + it.shape).join(","), o.modeNotice ? o.modeNotice() : ""].join("|");
    const focusInside = el.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!force && k === key && focusInside) { sync(); return; }
    key = k;
    clear(el);
    const kids = !items.length ? emptyView() : items.length === 1 ? (items[0].type === "area" ? blockView(items[0]) : fixtureView(items[0])) : multiView(items);
    const body = h("div", {class: "insp-body"}, ...kids);
    if (o.isTouch()) {
      const grab = h("button", {type: "button", class: "sheet-grab", aria: {label: sheet === "expanded" ? "Collapse" : "Expand"}, onclick: () => setSheet(sheet === "expanded" ? "peek" : "expanded")}, h("span", {class: "grab-bar"}));
      el.appendChild(grab);
    }
    el.appendChild(body);
    const selKey = items.map(it => it.id).join(",");
    if (o.isTouch()) { if (!items.length) setSheet("closed"); else if (selKey !== lastSel || sheet === "closed") setSheet("peek"); }
    lastSel = selKey;
  }
  /** Updates field values without rebuilding (keeps the focused field as it is). */
  function sync() {
    const single = session.single;
    if (!single) return;
    for (const input of el.querySelectorAll("[data-field]")) {
      if (input === document.activeElement) continue;
      const f = input.dataset.field;
      if (input.tagName === "SELECT") { input.value = single[f] ?? ""; continue; }
      if (f in LENGTH) { input.value = formatFtIn(single[f]); input.dataset.was = input.value; }
      else if (f === "rot") { input.value = String(Math.round((single.rot || 0) * 100) / 100); input.dataset.was = input.value; }
      else if (f === "name" || f === "notes") { input.value = single[f] || ""; input.dataset.was = input.value; }
    }
    const big = el.querySelector(".area-big b"); if (big && single.type === "area") big.textContent = formatSqft(blockArea(single));
    const dims = el.querySelector(".area-big span"); if (dims && single.type === "area") dims.textContent = `${formatFtIn(single.w)} × ${formatFtIn(single.d)}${single.shape === "poly" ? ` · ${(single.pts || []).length} corners` : ""}`;
  }
  function setSheet(s) {
    sheet = s;
    el.dataset.sheet = s;
    el.setAttribute("aria-modal", "false");
    if (o.onSheet) o.onSheet(s);
    const grab = el.querySelector(".sheet-grab"); if (grab) grab.setAttribute("aria-label", s === "expanded" ? "Collapse" : "Expand");
  }
  /** Focuses the first field (Enter on the plan). */
  function focusFirst() { const f = el.querySelector("input, select, textarea, button.btn"); if (f) f.focus(); if (o.isTouch()) setSheet("expanded"); }
  /** Scrolls to and focuses the Checks list of the selected block (the "3 warnings" chip). */
  function focusChecks() {
    render(true);
    const sec = el.querySelector(".insp-checks");
    if (!sec) return false;
    if (o.isTouch()) setSheet("expanded");
    sec.scrollIntoView({block: "start", behavior: "auto"});
    sec.focus({preventScroll: true});
    return true;
  }
  return {render, sync, setSheet, focusFirst, focusChecks, get sheet() { return sheet; }};
}
