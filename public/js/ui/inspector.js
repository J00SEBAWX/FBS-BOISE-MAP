/* The inspector (docs/DESIGN.md 4.2 and 5): what is selected, with every editable field (feet-and-inches text
 * inputs: Enter or blur commits one undo step, Esc reverts, Up / Down step 1", Shift 6"), the name and colour,
 * type details, notes and status; for a department block the area, target, Size to target, Lock area, Edit shape,
 * the checks and the subcategories; several items share rotation, colour and height; nothing selected shows the
 * map summary and how-to tips; a locked structure item shows its values as text with an Unlock button. On phones
 * the same panel is the bottom sheet (peek / expanded / closed). Every value is set with textContent / .value.
 *
 * Re-drawing: a change to what is shown (an edit of the selected item, an undo, a category target) never rebuilds
 * the panel; the values, the readouts and the checks are patched in place, so the field the person is about to
 * click or Tab into (a field commits as it loses focus) is still there when the click lands. The panel is rebuilt
 * only when its structure changes (another selection, the lock, Edit shape, a department change), and then the
 * focused control, its caret and the scroll position are put back. */
import {h, icon, clear, relTime, focusEl} from "./dom.js";
import {formatFtIn, formatSqft} from "../core/units.js";
import {TYPES, BRAND_NAMES, displayName, categoryOf, isStructure} from "../core/model.js";
import {blockArea, categoryFor, brandsOf, brandOf, blockTitle, blockTarget} from "../core/areas.js";
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
  let key = "", sheet = "closed", lastSel = "", lastCommitAt = -Infinity, settleTimer = 0;
  const canEdit = () => o.canEdit();
  const committed = () => { lastCommitAt = performance.now(); if (o.onCommit) o.onCommit(); }; // a field just committed a change (the global keys use it)

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
      committed();
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
        committed();
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
    const commit = () => { if (input.value === input.dataset.was) return; committed(); const err = o.act.setField(ids, field, input.value); if (err) { input.setAttribute("aria-invalid", "true"); msg.textContent = err; msg.hidden = false; } else { input.removeAttribute("aria-invalid"); msg.hidden = true; input.dataset.was = input.value; } };
    input.dataset.was = input.value;
    input.addEventListener("change", commit);
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); } else if (e.key === "Escape") { input.value = input.dataset.was; input.blur(); } e.stopPropagation(); });
    return h("div", {class: "field wide"}, h("label", {class: "f-label", for: id, text: label}), input, msg);
  }
  function selectField(ids, field, label, value, options, opts = {}) {
    const id = "f-" + field;
    if (!opts.editable) { const cur = options.find(x => x[0] === value); return h("div", {class: "field ro"}, h("span", {class: "f-label", text: label}), h("span", {class: "f-value", text: cur ? cur[1] : (value || "–")})); }
    const sel = h("select", {class: "input f-in", id, data: {field}}, options.map(([v, t]) => h("option", {value: v, text: t, selected: v === (value ?? "")})));
    sel.addEventListener("change", () => { committed(); const err = o.act.setField(ids, field, sel.value === "" ? null : sel.value); if (err) o.toast && o.toast(err); });
    sel.addEventListener("keydown", e => e.stopPropagation());
    return h("div", {class: "field" + (opts.wide ? " wide" : "")}, h("label", {class: "f-label", for: id, text: label}), sel);
  }
  function switchRow(label, on, onChange, opts = {}) {
    const b = h("button", {type: "button", class: "switch-row", role: "switch", aria: {checked: !!on}, disabled: !!opts.disabled, data: opts.data, onclick: () => onChange(b.getAttribute("aria-checked") !== "true")},
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
      const b = h("button", {type: "button", class: "swatch" + (on ? " on" : ""), role: "radio", aria: {checked: on, label: name}, title: name, style: {"--c": hex}, data: {hex},
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
    return h("div", {class: "insp-head" + (o.isTouch() ? " has-close" : "")},
      h("div", {class: "insp-eyebrow"}, h("span", {class: "eyebrow", text: eyebrow}), locked ? h("span", {class: "chip"}, icon("i-lock", "i i-sm"), "Locked") : null),
      h("h2", {class: "insp-name", text: name}),
      h("p", {class: "insp-meta", text: meta || "", hidden: !meta}),
      o.isTouch() ? h("button", {type: "button", class: "icon-btn insp-close", aria: {label: "Close"}, onclick: () => { session.clearSelection(); setSheet("closed"); }}, icon("i-close")) : null);
  }
  /** The panel's title and the line under it for these selected items (built once, patched when they change). */
  function headTexts(items) {
    if (items.length > 1) return {name: items.map(displayName).slice(0, 3).join(", ") + (items.length > 3 ? "…" : ""), meta: items.some(it => session.isLocked(it)) ? "Locked structure in the selection stays put." : ""};
    const it = items[0];
    if (it.type === "area") {
      const cat = categoryFor(session.doc, it.cat, session.categories), b = brandOf(it, cat);
      return {name: blockTitle(it, cat), meta: [b && cat ? `${cat.name} · brand block` : "", it.status ? STATUS_LABEL[it.status] : ""].filter(Boolean).join(" · ")};
    }
    const typeLabel = (TYPES[it.type] || {}).label || it.type;
    return {name: displayName(it), meta: categoryOf(it) !== typeLabel ? categoryOf(it) : ""};
  }
  function positionSection(ids, it, editable) {
    return section("Position & size", grid(
      lengthField(ids, "x", LENGTH.x, it.x, {editable}), lengthField(ids, "y", LENGTH.y, it.y, {editable}),
      lengthField(ids, "w", LENGTH.w, it.w, {editable}), lengthField(ids, "d", LENGTH.d, it.d, {editable}),
      lengthField(ids, "h", LENGTH.h, it.h, {editable}), lengthField(ids, "rot", "Rotation (°)", it.rot || 0, {editable})));
  }
  function brandField(it, brands, cur) {
    const opts = [["", "Whole department"], ...brands.map(b => [b.key, b.label])];
    if (cur && !brands.some(b => b.key === cur.key)) opts.push([cur.key, cur.label]);
    const sel = h("select", {class: "input f-in", id: "f-brand"}, opts.map(([v, t]) => h("option", {value: v, text: t, selected: v === (cur ? cur.key : "")})));
    sel.addEventListener("change", () => { committed(); const err = o.act.setBrand(it.id, sel.value || null); if (err && o.toast) o.toast(err); });
    sel.addEventListener("keydown", e => e.stopPropagation());
    return h("div", {class: "field"}, h("label", {class: "f-label", for: "f-brand", text: "Brand"}), sel);
  }
  function catField(it, catOpts) {
    const sel = h("select", {class: "input f-in", id: "f-cat"}, catOpts.map(([v, t]) => h("option", {value: v, text: t, selected: v === it.cat})));
    sel.addEventListener("change", () => { committed(); const err = o.act.setCategory(it.id, sel.value); if (err && o.toast) o.toast(err); });
    sel.addEventListener("keydown", e => e.stopPropagation());
    return h("div", {class: "field"}, h("label", {class: "f-label", for: "f-cat", text: "Department"}), sel);
  }
  function statusField(ids, it, editable) { return selectField(ids, "status", "Status", it.status || "", [["", "Not set"], ...ITEM_STATUSES.map(s => [s, STATUS_LABEL[s]])], {editable}); }

  /** "Go look at it" uses the item as it is NOW (the panel is patched, not rebuilt, so the item drawn here may be older). */
  const lookAt = it => o.act.goLook(session.layout.byId.get(it.id) || it);
  function fixtureView(it) {
    const ids = [it.id], locked = session.isLocked(it), editable = canEdit() && !locked;
    const typeLabel = (TYPES[it.type] || {}).label || it.type;
    const ht = headTexts([it]);
    const kids = [header(typeLabel.toUpperCase() + (isStructure(it) ? " · STRUCTURE" : ""), ht.name, ht.meta, locked)];
    if (locked && canEdit()) kids.push(h("div", {class: "notice warn insp-notice"}, h("p", {text: "Structure is locked. Unlock it to change walls, doors, columns, floors and stairs."}), btn("Unlock structure", "i-unlock", () => o.act.unlock(), "btn small")));
    kids.push(positionSection(ids, it, editable));
    const brandOpts = [["", "None"], ...Object.entries(BRAND_NAMES)];
    kids.push(section("Name & colour", textField(ids, "name", "Name", it.name, {editable, max: 80}), colourField(ids, it.color, editable)));
    const details = [];
    if (SHELVING.has(it.type)) { details.push(selectField(ids, "brand", "Brand / stock", it.brand || "", brandOpts, {editable})); details.push(selectField(ids, "brand2", "Second brand", it.brand2 || "", brandOpts, {editable})); }
    if (it.type === "floor") details.push(lengthField(ids, "ceil", "Ceiling height", it.ceil ?? 0, {editable}));
    details.push(statusField(ids, it, editable));
    kids.push(section(`${typeLabel} details`, grid(...details), textField(ids, "notes", "Notes", it.notes, {editable, placeholder: "Anything the team should know"})));
    if (it.toConfirm) kids.push(section("To check in the store", h("p", {class: "insp-check", text: it.toConfirm})));
    if (editable && o.canGoLook && o.canGoLook(it)) kids.push(section(null, h("div", {class: "btn-row"}, btn("Go look at it", "i-walk", () => lookAt(it), "btn small"))));
    kids.push(actions(it, editable, false));
    kids.push(h("p", {class: "insp-foot", text: `Item ${it.id} · Drag to move · corner handles resize · the top handle rotates`}));
    return kids;
  }

  /** The department's target in sq ft (0 = none). */
  const targetOf = cat => (cat ? cat.targetSqft || 0 : 0);
  /** The area readout of a block: the big sq ft figure, how it compares with the target, the suggested size. Rebuilt in place. */
  function areaReadout(it, cat) {
    const area = blockArea(it), target = blockTarget(it, cat), b = brandOf(it, cat);
    const range = !b && cat && Array.isArray(cat.sqft) && cat.sqft[0] > 0 ? `Suggested size for this department: ${cat.sqft[0].toLocaleString("en-US")} to ${cat.sqft[1].toLocaleString("en-US")} sq ft` : "";
    const over = target > 0 ? (area > target * 1.1 ? "Over the target" : area < target * 0.9 ? "Under the target" : "On target") : "";
    const share = b && b.share > 0 ? ` (${Math.round(b.share * 100)}% of ${cat.name})` : "";
    return [
      h("div", {class: "area-big"}, h("b", {text: formatSqft(area)}), h("span", {text: `${formatFtIn(it.w)} × ${formatFtIn(it.d)}${it.shape === "poly" ? ` · ${(it.pts || []).length} corners` : ""}${it.rot ? ` · turned ${Math.round(it.rot * 10) / 10}°` : ""}`})),
      target > 0 ? h("p", {class: "area-target", text: `Target ${formatSqft(target)}${share} · ${over}`}) : h("p", {class: "area-target", text: b ? `No share set for ${b.label} yet. Edit category, Brands: "${b.label} 30%".` : "No target set for this department."}),
      range ? h("p", {class: "insp-hint", text: range}) : null,
    ];
  }
  /** The Checks rows of a block (the live collision result when the app has one, else a fresh check of this block). */
  function checkRows(it, cat) {
    const issues = (o.issuesFor && o.issuesFor(it.id)) || checkItem(session.doc, it);
    const nearKeys = (cat && cat.adjacency) || [];
    const placedKeys = new Set(session.doc.items.filter(x => x.type === "area").map(x => x.cat));
    const near = nearKeys.map(k => { const c = categoryFor(session.doc, k, session.categories); return c ? `${c.name} (${placedKeys.has(k) ? "placed" : "not placed yet"})` : null; }).filter(Boolean);
    const rows = [];
    for (const i of issues) rows.push(h("li", {class: "chk " + i.severity}, icon(i.severity === "error" ? "i-error" : "i-warning"), h("span", {text: i.message})));
    if (!issues.some(i => i.kind === "door" || i.kind === "opening" || i.kind === "stairs")) rows.push(h("li", {class: "chk ok"}, icon("i-check"), h("span", {text: "Keeps doorways, arches and stairs clear"})));
    if (!issues.some(i => i.kind === "outside")) rows.push(h("li", {class: "chk ok"}, icon("i-check"), h("span", {text: "Inside the building"})));
    if (!issues.some(i => i.kind === "block")) rows.push(h("li", {class: "chk ok"}, icon("i-check"), h("span", {text: "Doesn't overlap another department"})));
    if (near.length) rows.push(h("li", {class: "chk info"}, icon("i-info"), h("span", {text: `Best next to ${near.join(", ")}.`})));
    return {rows, count: issues.length};
  }
  const checksLabel = n => (n ? `Checks: ${n} warning${n === 1 ? "" : "s"}` : "Checks: all clear");
  const sizeTitle = target => (target > 0 ? `Resize to ${formatSqft(target)} keeping the proportions` : "Set a target first");

  function blockView(it) {
    const ids = [it.id], editable = canEdit() && !session.isLocked(it);
    const cat = categoryFor(session.doc, it.cat, session.categories);
    const name = (cat && cat.name) || it.name || "Department";
    const family = cat && cat.family ? (cat.family === "custom" ? "custom" : cat.family) : "";
    const target = targetOf(cat);
    const ht = headTexts([it]);
    const kids = [header(`DEPARTMENT${family ? " · " + family.toUpperCase() : ""}`, ht.name, ht.meta, false)];
    // area
    kids.push(section("Area",
      h("div", {class: "area-live"}, ...areaReadout(it, cat)),
      editable ? h("div", {class: "btn-row"},
        btn("Size to target", "i-fit", () => o.act.sizeToTarget(it.id), "btn small", {disabled: !(target > 0), title: sizeTitle(target), data: {live: "size"}}),
        btn(o.editor.shapeEdit ? "Done with the shape" : "Change shape", "i-pencil", () => { o.editor.setShapeEdit(!o.editor.shapeEdit); render(true); }, "btn small" + (o.editor.shapeEdit ? " pressed" : ""), {aria: {pressed: o.editor.shapeEdit}, data: {fk: "shape"}})) : null,
      editable ? switchRow("Lock area (keep the sq ft while resizing)", !!it.lockArea, on => o.act.lockArea(it.id, on), {data: {live: "lockarea"}}) : null,
      editable && o.editor.shapeEdit ? h("div", {class: "btn-row"},
        btn("Remove corner", "i-minus", () => o.editor.removeCorner(), "btn small", {disabled: o.editor.cornerSel < 0, title: "Tap a corner first"}),
        btn("Back to a rectangle", "i-grid", () => { o.editor.setShapeEdit(false); o.act.toRectangle(it.id); }, "btn small")) : null,
      editable && o.editor.shapeEdit ? h("p", {class: "insp-hint", text: "Drag any corner where you need it: lean it, taper it, cut a notch. Tap + on an edge to add a corner. Tap a corner, then Remove corner."}) : null,
      editable && !o.editor.shapeEdit ? h("p", {class: "insp-hint", text: "Pull a corner to resize, drag the ring to turn it to any angle, or Change shape to drag single corners."}) : null));
    // category + target
    const catOpts = session.categories.filter(c => !c.hidden || c.key === it.cat).map(c => [c.key, c.name]);
    const targetIn = h("input", {class: "input f-in", id: "f-target", type: "number", min: 0, max: 20000, step: 10, inputmode: "numeric", value: target ? String(Math.round(target)) : ""});
    targetIn.addEventListener("change", () => { const v = Number(targetIn.value); if (cat) { committed(); const err = o.act.setTarget(cat.key, Number.isFinite(v) ? v : 0); if (err && o.toast) o.toast(err); } });
    targetIn.addEventListener("keydown", e => e.stopPropagation());
    const brands = brandsOf(cat), curBrand = brandOf(it, cat);
    kids.push(section("Department", grid(
      editable ? catField(it, catOpts) : h("div", {class: "field ro"}, h("span", {class: "f-label", text: "Department"}), h("span", {class: "f-value", text: name})),
      brands.length || curBrand ? (editable ? brandField(it, brands, curBrand) : h("div", {class: "field ro"}, h("span", {class: "f-label", text: "Brand"}), h("span", {class: "f-value", text: curBrand ? curBrand.label : "Whole department"}))) : null,
      editable ? h("div", {class: "field"}, h("label", {class: "f-label", for: "f-target", text: curBrand ? "Department target sq ft" : "Target sq ft"}), targetIn) : h("div", {class: "field ro"}, h("span", {class: "f-label", text: curBrand ? "Department target sq ft" : "Target sq ft"}), h("span", {class: "f-value", text: target ? String(Math.round(target)) : "–"})),
      statusField(ids, it, editable)),
      cat ? h("div", {class: "btn-row"}, btn(canEdit() ? "Edit category…" : "Category details", "i-pencil", () => o.act.editCategory(cat.key), "btn small", {data: {fk: "editcat"}})) : null));
    // checks
    const ck = checkRows(it, cat);
    const checks = h("ul", {class: "checks"}, ...ck.rows);
    const checksSec = section("Checks", checks);
    checksSec.classList.add("insp-checks"); checksSec.tabIndex = -1; checksSec.setAttribute("aria-label", checksLabel(ck.count));
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
    if (!editable) return canEdit() ? null : h("div", {class: "insp-actions"}, o.act.goLook && it.type !== "wall" && it.type !== "ceiling" && it.type !== "area" ? btn("Go look at it", "i-walk", () => lookAt(it), "btn") : null);
    return h("div", {class: "insp-actions"},
      btn(block ? "Split into two" : "Duplicate", "i-duplicate", () => o.act.duplicate(), "btn"),
      block ? btn(o.editor.shapeEdit ? "Done with the shape" : "Change shape", "i-pencil", () => { o.editor.setShapeEdit(!o.editor.shapeEdit); render(true); }, "btn" + (o.editor.shapeEdit ? " pressed" : ""), {aria: {pressed: o.editor.shapeEdit}}) : null,
      btn("Rotate 90°", "i-rotate", () => o.act.rotate(90), "btn"),
      h("button", {type: "button", class: "btn danger icon-only", aria: {label: block ? "Remove" : "Delete"}, title: block ? "Remove (Delete)" : "Delete (Del)", onclick: () => o.act.remove()}, icon("i-delete")));
  }

  function multiView(items) {
    const ids = items.map(it => it.id);
    const editable = canEdit() && items.some(it => !session.isLocked(it));
    const first = items[0];
    const same = f => items.every(it => it[f] === first[f]);
    const ht = headTexts(items);
    return [
      header(`${items.length} ITEMS SELECTED`, ht.name, ht.meta, false),
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
        h("li", {text: "Tap an item to select it"}), h("li", {text: "Drag to move · corner handles resize"}), h("li", {text: "The top handle turns it (15° steps for fixtures, 5° for a department block, Shift for free)"}),
        h("li", {text: "Shift-click adds to the selection · arrows nudge 6\" (Shift 5')"}), h("li", {text: o.isTouch() ? "Structure is locked until you unlock it in More" : "Structure is locked until you unlock it in the toolbar"}))) :
        notice ? null : section("View only", h("p", {class: "insp-hint", text: m.master ? "Only the admin changes the master map. Make your own copy to try ideas." : "This map belongs to someone else. Make your own copy to change it."})),
    ];
  }

  /* ---------- render ---------- */
  /** What decides whether the panel must be rebuilt: the selection and everything that changes which controls exist. */
  function structureKey(items) {
    const one = items.length === 1 ? items[0] : null;
    let cat = "";
    if (one && one.type === "area") {
      // a department's name, colour, family, subcategories and neighbours are drawn in the panel (its target is patched in place)
      const c = categoryFor(session.doc, one.cat, session.categories);
      cat = (c ? [c.name, c.family, String(c.color || "").toLowerCase(), (c.subcats || []).join("\u0001"), (c.adjacency || []).join(","), c.custom ? 1 : 0, c.hidden ? 1 : 0, (c.sqft || []).join("-")].join("\u0002") : "")
        + "\u0003" + session.categories.filter(x => !x.hidden || x.key === one.cat).map(x => x.key + "\u0004" + x.name).join("\u0005");
    }
    return [items.map(it => it.id).join(","), session.unlocked, canEdit(), o.editor.shapeEdit, o.editor.cornerSel, items.map(it => it.type + ":" + it.cat + ":" + (it.brand || "") + ":" + it.shape).join(","), o.modeNotice ? o.modeNotice() : "", cat].join("|");
  }
  function render(force) {
    const items = session.selected();
    const k = structureKey(items);
    // the same selection and the same controls: patch what changed, never replace an element (see the file comment)
    if (!force && items.length && k === key && el.firstChild) {
      if (o.isTouch() && sheet === "closed") setSheet("peek");
      refreshLive(items);
      return;
    }
    // A field commits as it loses focus, and for that instant focus is on the page while the browser is still moving it to the
    // control the person clicked or Tabbed to. If that very commit changes the panel's structure, rebuild once focus has landed
    // (then it is put back on whatever has it), instead of replacing the control that is about to receive it.
    if (!force && el.firstChild && document.activeElement === document.body && performance.now() - lastCommitAt < 100) {
      if (!settleTimer) settleTimer = setTimeout(() => { settleTimer = 0; render(); }, 0);
      return;
    }
    clearTimeout(settleTimer); settleTimer = 0;
    rebuild(items, k);
  }
  /** Where focus is inside the panel, so it can be put back on the same control after a rebuild. */
  function snapshotFocus() {
    const a = document.activeElement;
    if (!a || a === el || !el.contains(a)) return null;
    const snap = {tag: a.tagName, id: a.id || "", fk: (a.dataset && a.dataset.fk) || "", field: (a.dataset && a.dataset.field) || "", label: (a.getAttribute("aria-label") || a.textContent || "").trim()};
    try { if (typeof a.selectionStart === "number") { snap.start = a.selectionStart; snap.end = a.selectionEnd; snap.dir = a.selectionDirection; } } catch { /* a field type without a caret */ }
    return snap;
  }
  function restoreFocus(snap) {
    if (!snap) return;
    const q = sel => { try { return el.querySelector(sel); } catch { return null; } };
    let n = (snap.id && q("#" + CSS.escape(snap.id))) || (snap.fk && q(`[data-fk="${CSS.escape(snap.fk)}"]`)) || (snap.field && q(`[data-field="${CSS.escape(snap.field)}"]`)) || null;
    if (!n && snap.label) n = [...el.querySelectorAll(snap.tag.toLowerCase())].find(x => (x.getAttribute("aria-label") || x.textContent || "").trim() === snap.label) || null;
    if (!n) return;
    focusEl(n);
    if (typeof snap.start === "number" && n.setSelectionRange) { try { n.setSelectionRange(snap.start, snap.end, snap.dir); } catch { /* not a text field */ } }
  }
  function rebuild(items, k) {
    const focus = snapshotFocus(), scroll = el.scrollTop, prevSel = lastSel;
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
    if (selKey === prevSel) el.scrollTop = scroll; // the same thing, drawn again (a lock, Edit shape, a colour): stay where you were
    restoreFocus(focus);
  }

  /* ---------- patching in place ---------- */
  const setText = (n, text) => { if (n && n.textContent !== text) n.textContent = text; };
  /** The same selection after a change: update values, readouts and checks without touching any element that can hold focus. */
  function refreshLive(items) {
    sync();
    const ht = headTexts(items);
    setText(el.querySelector(".insp-name"), ht.name);
    const meta = el.querySelector(".insp-meta");
    if (meta) { setText(meta, ht.meta); meta.hidden = !ht.meta; }
    paintColour(items);
    if (items.length === 1 && items[0].type === "area") liveBlock(items[0]);
  }
  function paintColour(items) {
    const group = el.querySelector(".swatches");
    if (!group) return;
    const first = items[0], same = items.every(it => it.color === first.color);
    const cur = same ? String(first.color || "").toLowerCase() : "";
    let matched = false;
    for (const b of group.querySelectorAll(".swatch")) { const on = b.dataset.hex === cur; matched = matched || on; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
    const wrap = group.querySelector(".swatch-wrap");
    if (wrap) {
      wrap.classList.toggle("on", !matched && !!cur);
      const other = wrap.querySelector("input");
      if (other && other !== document.activeElement && /^#[0-9a-f]{6}$/.test(cur)) other.value = cur;
    }
  }
  function liveBlock(it) {
    const cat = categoryFor(session.doc, it.cat, session.categories), target = targetOf(cat);
    const live = el.querySelector(".area-live");
    if (live) { clear(live); for (const n of areaReadout(it, cat)) if (n) live.appendChild(n); }
    const size = el.querySelector('[data-live="size"]');
    if (size) { size.disabled = !(target > 0); size.title = sizeTitle(target); }
    const lock = el.querySelector('[data-live="lockarea"]');
    if (lock) lock.setAttribute("aria-checked", String(!!it.lockArea));
    const ul = el.querySelector(".insp-checks ul.checks");
    if (ul) {
      const ck = checkRows(it, cat);
      clear(ul); for (const r of ck.rows) ul.appendChild(r);
      ul.closest(".insp-checks").setAttribute("aria-label", checksLabel(ck.count));
    }
    const tin = el.querySelector("#f-target");
    if (tin && tin !== document.activeElement) tin.value = target ? String(Math.round(target)) : "";
  }
  /** Updates field values without rebuilding (the focused field keeps what the person is typing). */
  function sync() {
    const items = session.selected();
    if (!items.length) return;
    const first = items[0], multi = items.length > 1;
    for (const input of el.querySelectorAll("[data-field]")) {
      if (input === document.activeElement) continue;
      const f = input.dataset.field;
      const v = !multi || items.every(it => it[f] === first[f]) ? first[f] : (f === "rot" || f === "h" ? 0 : "");
      if (input.tagName === "SELECT") { input.value = v ?? ""; continue; }
      if (f === "rot") input.value = String(Math.round((v || 0) * 100) / 100);
      else if (f === "name" || f === "notes") input.value = v || "";
      else input.value = formatFtIn(v ?? 0); // x, y, w, d, h, ceil
      input.dataset.was = input.value;
    }
    const cat = el.querySelector("#f-cat");
    if (cat && !multi && cat !== document.activeElement) cat.value = first.cat || "";
  }
  function setSheet(s) {
    sheet = s;
    el.dataset.sheet = s;
    el.setAttribute("aria-modal", "false");
    if (o.onSheet) o.onSheet(s);
    const grab = el.querySelector(".sheet-grab"); if (grab) grab.setAttribute("aria-label", s === "expanded" ? "Collapse" : "Expand");
  }
  /**
   * Opens the panel for the keyboard (Enter on the plan, a double tap, a new item). A computer: the first field takes focus,
   * with its text selected. A phone: the sheet opens (expanded when {expand}) and focus goes to the title, never to a field,
   * because a field in focus raises the on-screen keyboard over the plan; the person taps the one they want.
   * Nothing here scrolls anything but the panel itself (focusEl).
   */
  function focusFirst({expand = true} = {}) {
    if (o.isTouch()) {
      if (expand) {
        setSheet("expanded");
        const t = el.querySelector(".insp-name");
        if (t) { t.tabIndex = -1; focusEl(t, {reveal: false}); }
      }
      return;
    }
    focusEl(el.querySelector("input, select, textarea, button.btn"));
  }
  /**
   * Scrolls to and focuses the Checks list of the selected block (the "3 warnings" chip). It scrolls the inspector's
   * own box and nothing else: scrollIntoView would also scroll the (overflow:hidden) stage while a phone's sheet is
   * still sliding up from below the screen, which pushed the plan out of view for good.
   */
  function focusChecks() {
    render(true);
    const sec = el.querySelector(".insp-checks");
    if (!sec) return false;
    if (o.isTouch()) setSheet("expanded");
    const grab = el.querySelector(".sheet-grab"); // the sticky grab bar (phones) would cover the heading
    el.scrollTop = Math.max(0, sec.offsetTop - (grab ? grab.offsetHeight + 4 : 0));
    sec.focus({preventScroll: true});
    return true;
  }
  return {render, sync, setSheet, focusFirst, focusChecks, get sheet() { return sheet; }};
}
