// Right panel: every attribute of the selected department block or fixture, or the build overview.
import { h, $, icon, clear, fmtSqft, fmtWhen, STATUS_LABEL, STATUS_CHIP } from "./h.js";
import { nice, POWER_BRANDS } from "./analysis.js";
import { isStructure } from "./edit.js";

const r1 = (v) => Math.round(v * 10) / 10;

export function createInspector(app) {
  const right = $("#right");
  const cat = () => app.catalog;

  function field(label, control, hint) {
    return h("div.field", h("label", { for: control.id || undefined }, label), control, hint ? h("span.hint", hint) : null);
  }

  let uid = 0;
  const nid = () => `f${++uid}`;

  function num(fieldKey, value, onCommit, o = {}) {
    const inp = h("input.input.small.num", {
      id: nid(),
      type: "number",
      inputmode: "decimal",
      step: String(o.step ?? 0.5),
      min: o.min !== undefined ? String(o.min) : undefined,
      max: o.max !== undefined ? String(o.max) : undefined,
      value: String(r1(value)),
      disabled: o.disabled,
      dataset: { field: fieldKey },
      "aria-label": o.aria || fieldKey,
    });
    inp.addEventListener("change", () => {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v)) onCommit(o.min !== undefined ? Math.max(o.min, v) : v);
    });
    return inp;
  }

  function text(fieldKey, value, onCommit, o = {}) {
    const inp = h(o.multiline ? "textarea.input" : "input.input", {
      id: nid(),
      type: o.multiline ? undefined : "text",
      maxlength: String(o.max || 80),
      rows: o.multiline ? String(o.rows || 3) : undefined,
      placeholder: o.placeholder,
      disabled: o.disabled,
      dataset: { field: fieldKey },
    });
    inp.value = value || "";
    inp.addEventListener("change", () => onCommit(inp.value.trim()));
    return inp;
  }

  function select(fieldKey, value, options, onCommit, o = {}) {
    const s = h("select.input", { id: nid(), disabled: o.disabled, dataset: { field: fieldKey } });
    for (const [v, t] of options) s.append(h("option", { value: v, selected: v === value }, t));
    s.addEventListener("change", () => onCommit(s.value));
    return s;
  }

  function checkRow(r) {
    const cls = r.ok ? "ok" : "warn";
    return h(`div.check.${cls}`, h("span.check-ico", icon(r.ok ? "check" : "alert", 15)), h("span", r.text));
  }

  // ---------- department block ----------

  function renderArea(a, report, opts) {
    const c = cat().byKey[a.key] || {};
    const r = report.results.get(a.id);
    const editable = opts.editable;
    const set = (patch, label) => app.editor.set("area", a.id, patch, label);
    const family = (cat().families || {})[c.family];
    const sqft = a.w * a.d;
    const total = r ? r.size.total : sqft;
    const [mn, mx] = c.sqft || [0, 0];

    const headEl = h(
      "header.i-head",
      h("span.i-swatch", { "aria-hidden": "true" }),
      h("div.i-titles", h("span.eyebrow", family ? family.label : "Department"), h("h2", a.name || c.name), h("code.i-key", a.key)),
      h("button.icon-btn.small", { type: "button", "aria-label": "Close details", onclick: () => app.select(null) }, icon("close", 16))
    );
    headEl.querySelector(".i-swatch").style.background = a.color || c.color;

    const parts = [headEl];
    if (opts.why) parts.push(h("div.why", h("span.eyebrow", "Why it goes here"), h("p", opts.why)));
    if (opts.note) parts.push(h("p.notice.warn", opts.note));

    // status
    const seg = h("div.seg.status-seg", { role: "radiogroup", "aria-label": "Status" });
    for (const [v, t] of Object.entries(cat().statuses || {})) {
      seg.append(h("button", { type: "button", role: "radio", "aria-checked": String((a.status || "proposed") === v), disabled: !editable, dataset: { status: v }, onclick: () => set({ status: v }, `Mark ${a.name} ${t.toLowerCase()}`) }, t));
    }
    parts.push(h("div.field", h("label", "Status"), seg));

    // issues
    if (r && (r.collisions.length || r.warnings.length)) {
      const tips = app.tips.filter((t) => t.areaId === a.id);
      const issues = h("div.issues");
      for (const col of r.collisions) issues.append(h("div.issue.bad", icon("alert", 15), h("span", col.label)));
      for (const w of r.warnings) issues.append(h("div.issue.warn", icon("bulb", 15), h("span", w.label)));
      if (editable && tips.length) {
        const t = tips[0];
        issues.append(h("button.btn.small.signal", { type: "button", onclick: () => app.applyTip(t) }, icon("bulb", 15), t.cta || "Ask Jerry"));
      } else if (editable) issues.append(h("button.btn.small", { type: "button", onclick: () => app.askJerry() }, icon("bulb", 15), "Ask Jerry"));
      parts.push(issues);
    } else if (r) parts.push(h("div.issue.ok", icon("check", 15), h("span", "Clear spot. No conflicts or tips.")));

    // footprint
    const meter = h("div.meter", h("div.meter-band"), h("div.meter-mark"));
    const span = Math.max(mx * 1.3, total * 1.05, 1);
    meter.querySelector(".meter-band").style.left = `${(mn / span) * 100}%`;
    meter.querySelector(".meter-band").style.width = `${((mx - mn) / span) * 100}%`;
    meter.querySelector(".meter-mark").style.left = `${Math.min(100, (total / span) * 100)}%`;
    parts.push(
      h(
        "section.i-sec",
        h("h3", "Footprint"),
        h("div.sqft", h("strong.num", fmtSqft(sqft)), total !== sqft ? h("span.muted", `${fmtSqft(total)} across blocks`) : null, h("span.muted", `Aim for ${mn.toLocaleString()}–${mx.toLocaleString()}`)),
        meter,
        h(
          "div.grid4",
          field("Length", num("w", a.w, (v) => set({ w: Math.max(1, v) }, `Resize ${a.name}`), { min: 1, disabled: !editable, aria: "Length in feet" })),
          field("Depth", num("d", a.d, (v) => set({ d: Math.max(1, v) }, `Resize ${a.name}`), { min: 1, disabled: !editable, aria: "Depth in feet" })),
          field("Rotate°", num("rot", a.rot || 0, (v) => set({ rot: ((v % 360) + 360) % 360 }, `Rotate ${a.name}`), { step: 5, disabled: !editable, aria: "Rotation in degrees" })),
          field(
            "Turn",
            h("button.btn.small", { type: "button", disabled: !editable, onclick: () => set({ rot: (((a.rot || 0) + 90) % 360), w: a.w, d: a.d }, `Rotate ${a.name}`) }, icon("rotate", 15), "90°")
          ),
          field("East (x)", num("x", a.x, (v) => set({ x: v }, `Move ${a.name}`), { disabled: !editable, aria: "East position in feet" })),
          field("North (y)", num("y", a.y, (v) => set({ y: v }, `Move ${a.name}`), { disabled: !editable, aria: "North position in feet" }))
        )
      )
    );

    // placement + entry
    if (r) {
      const pl = r.placement;
      const anchor = cat().entryAnchors[r.entry.key];
      parts.push(
        h(
          "section.i-sec",
          h("h3", "Placement"),
          field(
            "Preferred spot",
            select("placement", a.placement || c.placement, Object.entries(cat().placements || {}), (v) => set({ placement: v }, `Set ${a.name} placement`), { disabled: !editable })
          ),
          checkRow({ ok: pl.ok, text: pl.ok ? `Meets it (${r.zone.kind === "outside" ? "outside" : r.zone.kind} floor, ${r1(pl.wallDist)} ft from a wall)` : r.warnings.find((w) => w.kind === "placement")?.label || "Not met" }),
          field(
            "Entry anchor",
            select("entry", a.entry || c.entry, Object.entries(cat().entryAnchors || {}).map(([k, v]) => [k, v.label]), (v) => set({ entry: v }, `Set ${a.name} entry`), { disabled: !editable })
          ),
          r.entry.dist !== null ? checkRow({ ok: r.entry.ok, text: `${r1(r.entry.dist)} ft from ${String(anchor?.label || "").split(" (")[0].toLowerCase()} (aim ≤ ${cat().anchorFt})` }) : null
        )
      );
    }

    // adjacency
    const adjWrap = h("div.chips");
    const tags = a.adjacency || [];
    tags.forEach((key, i) => {
      const info = r ? r.adjacency.find((x) => x.key === key) : null;
      const name = (cat().byKey[key] || {}).name || key;
      const chip = h(
        `span.tag${i === 0 ? ".primary" : ""}${info && info.placed ? (info.ok ? ".ok" : ".far") : ""}`,
        h(
          "button.tag-main",
          { type: "button", disabled: !editable || i === 0, title: i === 0 ? "Primary neighbor" : "Make this the primary neighbor", onclick: () => set({ adjacency: [key, ...tags.filter((k) => k !== key)] }, `Set ${a.name} neighbors`) },
          i === 0 ? icon("star", 13) : null,
          name,
          info && info.placed ? h("span.tag-dist", `${Math.round(info.dist)} ft`) : h("span.tag-dist", "not placed")
        ),
        editable ? h("button.tag-x", { type: "button", "aria-label": `Remove ${name}`, onclick: () => set({ adjacency: tags.filter((k) => k !== key) }, `Set ${a.name} neighbors`) }, icon("close", 12)) : null
      );
      adjWrap.append(chip);
    });
    const remaining = cat().areas.filter((x) => x.key !== a.key && !tags.includes(x.key));
    const addAdj = editable && remaining.length ? select("adj-add", "", [["", "+ Add neighbor"], ...remaining.map((x) => [x.key, x.name])], (v) => v && set({ adjacency: [...tags, v] }, `Set ${a.name} neighbors`)) : null;
    parts.push(h("section.i-sec", h("h3", "Preferred neighbors"), h("p.hint", `The ★ neighbor should be within ${cat().nearFt} ft.`), adjWrap, addAdj));

    // brand groups
    if ((a.groups && a.groups.length) || a.key === "power_tools") {
      const groups = a.groups || [];
      const totalShare = groups.reduce((s, g) => s + (g.share || 0), 0) || 1;
      const rows = h("div.groups");
      groups.forEach((g, i) => {
        const upd = (patch) => set({ groups: groups.map((x, j) => (j === i ? { ...x, ...patch } : x)) }, "Edit brand groups");
        rows.append(
          h(
            "div.group-row",
            text(`g-label-${i}`, g.label, (v) => v && upd({ label: v.slice(0, 40) }), { max: 40, disabled: !editable }),
            h("span.pct", num(`g-share-${i}`, Math.round(((g.share || 0) / totalShare) * 100), (v) => upd({ share: Math.max(5, Math.min(100, v)) / 100 }), { step: 5, min: 5, max: 100, disabled: !editable, aria: `${g.label} share percent` }), "%"),
            editable
              ? h(
                  "span.group-act",
                  h("button.icon-btn.small", { type: "button", "aria-label": "Move up", disabled: i === 0, onclick: () => set({ groups: swap(groups, i, i - 1) }, "Reorder brand groups") }, icon("up", 14)),
                  h("button.icon-btn.small", { type: "button", "aria-label": "Move down", disabled: i === groups.length - 1, onclick: () => set({ groups: swap(groups, i, i + 1) }, "Reorder brand groups") }, icon("down", 14)),
                  h("button.icon-btn.small", { type: "button", "aria-label": `Remove ${g.label}`, onclick: () => set({ groups: groups.filter((_, j) => j !== i) }, "Remove brand group") }, icon("close", 14))
                )
              : null
          )
        );
      });
      const missing = POWER_BRANDS.filter((b) => !groups.some((g) => g.label.toLowerCase() === b.toLowerCase()));
      parts.push(
        h(
          "section.i-sec",
          h("h3", a.key === "power_tools" ? "Brand groups" : "Groups"),
          a.key === "power_tools" ? h("p.hint", "Milwaukee, DeWalt and Makita stay as child groups inside Power Tools, laid out along its long side.") : null,
          rows,
          editable
            ? h(
                "div.btn-row",
                h("button.btn.small", { type: "button", disabled: groups.length >= 6, onclick: () => set({ groups: [...groups, { label: "New group", share: 0.2 }] }, "Add brand group") }, icon("plus", 14), "Add group"),
                a.key === "power_tools" && missing.length ? h("button.btn.small", { type: "button", onclick: () => set({ groups: (c.groups || []).map((g) => ({ ...g })) }, "Reset brand groups") }, "Reset to the 3 brands") : null
              )
            : null,
          c.rules && c.rules.length ? h("ul.rules", c.rules.map((t) => h("li", t))) : null
        )
      );
    }

    // subcategories
    const subs = a.subcats || [];
    const subList = h("ul.subcats");
    subs.forEach((s, i) =>
      subList.append(
        h("li", h("span", s), editable ? h("button.icon-btn.small", { type: "button", "aria-label": `Remove ${s}`, onclick: () => set({ subcats: subs.filter((_, j) => j !== i) }, `Edit ${a.name} subcategories`) }, icon("close", 13)) : null)
      )
    );
    const addSub = h("input.input.small", { type: "text", maxlength: "90", placeholder: "Add a subcategory and press Enter", disabled: !editable, dataset: { field: "sub-add" } });
    addSub.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = addSub.value.trim();
      if (v && subs.length < 40) set({ subcats: [...subs, v] }, `Edit ${a.name} subcategories`);
    });
    parts.push(h("section.i-sec", h("h3", `Included subcategories (${subs.length})`), subList, editable ? addSub : null));

    // identity & notes
    const color = h("input.color", { type: "color", value: a.color || c.color, disabled: !editable, "aria-label": "Block color", dataset: { field: "color" } });
    color.addEventListener("change", () => set({ color: color.value }, `Recolor ${a.name}`));
    parts.push(
      h(
        "section.i-sec",
        h("h3", "Details"),
        field("Display name", text("name", a.name, (v) => set({ name: v || c.name }, `Rename ${a.name}`), { max: 60, disabled: !editable })),
        h(
          "div.grid2",
          field("Color", h("div.color-row", color, editable ? h("button.btn.small.ghost", { type: "button", onclick: () => set({ color: c.color }, `Recolor ${a.name}`) }, "Family color") : null)),
          field("Confidence", select("confidence", a.confidence || "medium", Object.entries(cat().confidence || {}), (v) => set({ confidence: v }, `Set ${a.name} confidence`), { disabled: !editable }))
        ),
        field("Source", text("source", a.source, (v) => set({ source: v.slice(0, 160) }, `Set ${a.name} source`), { max: 160, disabled: !editable, placeholder: "Where this came from" })),
        field("Area note", text("note", a.note, (v) => set({ note: v.slice(0, 1000) }, `Edit ${a.name} note`), { max: 1000, multiline: true, disabled: !editable, placeholder: "Anything the team should know about this area" }))
      )
    );

    if (editable) {
      parts.push(
        h(
          "div.btn-row.i-actions",
          h("button.btn.small", { type: "button", onclick: () => app.editor.duplicate() }, icon("copy", 15), "Split / duplicate"),
          h("button.btn.small.danger", { type: "button", onclick: () => app.editor.remove() }, icon("trash", 15), "Remove block")
        )
      );
    } else if (opts.readOnlyReason) parts.push(h("p.muted.i-foot", opts.readOnlyReason));
    return parts;
  }

  function swap(arr, i, j) {
    const out = arr.map((x) => ({ ...x }));
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }

  // ---------- fixture ----------

  function renderItem(it) {
    const can = app.editor.canMove("item", it);
    const editable = can.ok;
    const set = (patch, label) => app.editor.set("item", it.id, patch, label || `Edit ${nice(it.name) || it.type}`);
    const struct = isStructure(it);
    const parts = [
      h(
        "header.i-head",
        h("div.i-titles", h("span.eyebrow", struct ? "Structure" : "Fixture"), h("h2", nice(it.name) || it.type), h("code.i-key", it.type)),
        h("button.icon-btn.small", { type: "button", "aria-label": "Close details", onclick: () => app.select(null) }, icon("close", 16))
      ),
    ];
    if (!editable && can.reason) parts.push(h("p.notice.warn", can.reason));
    parts.push(
      h(
        "section.i-sec",
        field("Name", text("name", it.name, (v) => set({ name: v.slice(0, 80) }, "Rename"), { max: 80, disabled: !app.state.build.canEdit || app.ui.mode !== "current" })),
        h(
          "div.grid3",
          field("Length", num("w", it.w, (v) => set({ w: Math.max(0.1, v) }, "Resize"), { step: 0.25, min: 0.1, disabled: !editable })),
          field("Depth", num("d", it.d, (v) => set({ d: Math.max(0.1, v) }, "Resize"), { step: 0.25, min: 0.1, disabled: !editable })),
          field("Height", num("h", it.h || 0, (v) => set({ h: Math.max(0, v) }, "Change height"), { step: 0.25, min: 0, disabled: !editable })),
          field("East (x)", num("x", it.x, (v) => set({ x: v }, "Move"), { step: 0.25, disabled: !editable })),
          field("North (y)", num("y", it.y, (v) => set({ y: v }, "Move"), { step: 0.25, disabled: !editable })),
          field("Rotate°", num("rot", it.rot || 0, (v) => set({ rot: ((v % 360) + 360) % 360 }, "Rotate"), { step: 15, disabled: !editable }))
        ),
        h("p.hint", `${r1(it.w)}′ × ${r1(it.d)}′ footprint · ${fmtSqft(it.w * it.d)}`)
      )
    );
    const colorIn = h("input.color", { type: "color", value: it.color || "#999999", disabled: !editable, "aria-label": "Color", dataset: { field: "color" } });
    colorIn.addEventListener("change", () => set({ color: colorIn.value }, "Recolor"));
    const extra = [field("Color", colorIn)];
    if (it.top || it.type === "counter" || it.type === "ring") {
      const topIn = h("input.color", { type: "color", value: it.top || "#d8d2c4", disabled: !editable, "aria-label": "Top color", dataset: { field: "top" } });
      topIn.addEventListener("change", () => set({ top: topIn.value }, "Recolor top"));
      extra.push(field("Top", topIn));
    }
    parts.push(h("section.i-sec", h("div.grid2", extra)));
    if (app.state.build.canEdit && app.ui.mode === "current" && (struct || it.locked)) {
      const lockId = nid();
      parts.push(
        h(
          "label.switch-row",
          { for: lockId },
          h("span", h("strong", "Locked in place"), h("span.muted", "Locked pieces can't be dragged by accident.")),
          h("input", { type: "checkbox", id: lockId, role: "switch", checked: Boolean(it.locked), disabled: struct && !app.ui.structureUnlocked, onchange: (e) => set({ locked: e.target.checked || undefined }, e.target.checked ? "Lock" : "Unlock") })
        )
      );
    }
    if (editable) {
      parts.push(
        h(
          "div.btn-row.i-actions",
          h("button.btn.small", { type: "button", onclick: () => app.editor.rotate(90) }, icon("rotate", 15), "Turn 90°"),
          h("button.btn.small", { type: "button", onclick: () => app.editor.duplicate() }, icon("copy", 15), "Duplicate"),
          h("button.btn.small.danger", { type: "button", onclick: () => app.editor.remove() }, icon("trash", 15), "Delete")
        )
      );
    }
    return parts;
  }

  // ---------- overview ----------

  function renderOverview() {
    const b = app.state.build;
    const p = app.report.progress;
    const editable = b.canEdit;
    const notes = text("build-notes", app.state.data.notes, (v) => app.state.change("Edit build notes", (d) => (d.notes = v.slice(0, 4000))), {
      multiline: true,
      rows: 5,
      max: 4000,
      disabled: !editable,
      placeholder: "Your big ideas for the reset: flow, what to move first, what customers ask for…",
    });
    const parts = [
      h(
        "header.i-head",
        h("div.i-titles", h("span.eyebrow", editable ? "Your build" : `${b.ownerName || "Teammate"}'s build`), h("h2", b.name), h("span", h(`span.chip.${STATUS_CHIP[b.status] || "x"}`, STATUS_LABEL[b.status] || b.status), h("span.muted.small", ` Updated ${fmtWhen(b.updatedAt)}`)))
      ),
    ];
    if (b.reviewNote && (b.status === "needs_changes" || b.status === "reviewed")) parts.push(h("div.why", h("span.eyebrow", "Note from AJ"), h("p", b.reviewNote)));
    parts.push(
      h(
        "div.stats",
        h("div.stat", h("strong.num", `${p.placed}/${p.total}`), h("span", "set")),
        h("div.stat", h("strong.num", String(p.confirmed)), h("span", "confirmed")),
        h("div.stat", { dataset: { bad: String(p.collisions > 0) } }, h("strong.num", String(p.collisions)), h("span", "conflicts"))
      )
    );
    parts.push(h("section.i-sec", h("h3", "Build notes"), notes, h("p.hint", "Saved with your build. AJ sees these when reviewing.")));
    const tipsBtn = h("button.btn.small.signal", { type: "button", onclick: () => app.askJerry() }, icon("bulb", 15), "Ask Jerry what's next");
    parts.push(
      h(
        "div.btn-row",
        tipsBtn,
        editable ? h("button.btn.small.primary", { type: "button", onclick: () => app.hud.openSubmit() }, icon("send", 15), b.status === "submitted" ? "Resubmit" : "Submit to AJ") : null
      )
    );
    parts.push(
      h(
        "section.i-sec.help-mini",
        h("h3", "Quick controls"),
        h(
          "ul",
          h("li", h("b", "Double-click"), " a block or fixture to pick it up"),
          h("li", h("b", "WASD"), " or the thumbstick walks Jerry"),
          h("li", h("b", "R"), " rotates · ", h("b", "Del"), " removes · ", h("b", "Ctrl+Z"), " undoes"),
          h("li", h("b", "Space"), " switches Jerry cam and map view")
        ),
        h("button.btn.small.ghost", { type: "button", onclick: () => app.hud.openHelp() }, icon("help", 15), "All controls")
      )
    );
    return parts;
  }

  function render() {
    if (!app.state || !app.state.data || !app.report) return;
    const focusedField = document.activeElement && right.contains(document.activeElement) ? document.activeElement.dataset.field : null;
    const scroll = right.scrollTop;
    const sel = app.ui.selection;
    let parts;
    if (sel && sel.kind === "area") {
      if (app.ui.mode === "suggested") {
        const s = app.suggestedBlocks.find((b) => b.id === sel.id);
        parts = s
          ? renderArea(s, app.suggestedReport, { editable: false, why: s.why, readOnlyReason: "This is my suggestion. Use “Use in my build” in the list to copy it." })
          : renderOverview();
      } else {
        const a = app.state.data.areas.find((x) => x.id === sel.id);
        const editable = app.state.build.canEdit && app.ui.mode === "areas";
        parts = a
          ? renderArea(a, app.report, { editable, readOnlyReason: !app.state.build.canEdit ? "Read only." : app.ui.mode !== "areas" ? "Switch to Area planning to edit this block." : "" })
          : renderOverview();
      }
    } else if (sel && sel.kind === "item") {
      const items = app.ui.mode === "suggested" ? app.current.items : app.state.data.items;
      const it = items.find((x) => x.id === sel.id);
      parts = it ? renderItem(it) : renderOverview();
    } else parts = renderOverview();
    clear(right).append(...parts);
    right.dataset.kind = sel ? sel.kind : "overview";
    right.scrollTop = scroll;
    if (focusedField) {
      const f = right.querySelector(`[data-field="${CSS.escape(focusedField)}"]`);
      if (f) f.focus({ preventScroll: true });
    }
  }

  return { render };
}
