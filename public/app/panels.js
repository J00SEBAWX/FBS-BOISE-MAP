// Left panel: fixture palettes, the department quest log, comparison results and the suggested plan.
import { h, $, icon, clear, fmtSqft } from "./h.js";
import { nice } from "./analysis.js";
import { isStructure } from "./edit.js";
import { shortName } from "./plan2d.js";

const STATE_LABEL = { unplaced: "Not placed", issues: "Needs a clear spot", warn: "Placed · tips", placed: "Placed", confirmed: "Confirmed" };

const FLOW_IDEAS = [
  ["One trip per project", "Keep decking, deck screws and stain within a few steps of each other near the front door, so a deck job is boards, fasteners and finish in one loop."],
  ["Pros in, pros out", "Contractors come through the yard doors. Put gloves, glasses and hi-vis on that path, then hand tools, then power tools, so they pass the add-ons on the way to the desk."],
  ["Sell the blade with the saw", "Bits, blades and abrasives belong between Power Tools and the back sales desk. The person ringing up a saw can point to the blade wall."],
  ["Keep sight lines from the desks", "High-ticket tools should be visible from a sales desk. Keep tall fixtures out of the line between the back desk and the arches."],
  ["Clear doors win", "Leave at least 5 feet clear on both sides of every door and arch. The striped zones in Area planning show where."],
  ["Bulky stays back", "Ladders, scaffolding and pump jacks live in the warehouse by the roll-up door. Put one demo unit on the floor with a sign pointing back."],
  ["Seasonal flex zone", "Use the front of Decking & Outdoor near the front door for grills and pellets in season, then swap it for winter goods."],
];

export function createPanels(app) {
  const left = $("#left");
  let fixtureTab = "fixtures";
  let filter = "";
  let highlighted = null;

  const cat = () => app.catalog;
  const data = () => app.state.data;

  function head(eyebrow, title, sub) {
    return h("header.p-head", h("span.eyebrow", eyebrow), h("h2", title), sub ? h("p.muted", sub) : null);
  }

  function paletteGrid(templates, mode) {
    const grid = h("div.palette");
    for (const tpl of templates) {
      const b = h("button.pal", { type: "button", title: `Drag onto the floor, or tap to drop at Jerry` }, h("span.pal-shape", { dataset: { type: tpl.type } }), h("span.pal-label", tpl.label));
      b.addEventListener("pointerdown", (e) => app.input.paletteDrag(e, { kind: "item", tpl, onTap: () => app.dropAtJerry({ kind: "item", tpl }) }));
      b.addEventListener("click", (e) => e.detail === 0 && app.dropAtJerry({ kind: "item", tpl })); // keyboard
      if (mode === "structure" && !app.ui.structureUnlocked) b.disabled = true;
      grid.append(b);
    }
    return grid;
  }

  function fixtureList(structure) {
    const items = data()
      .items.filter((i) => i.type !== "floor" && i.type !== "zone" && isStructure(i) === structure)
      .filter((i) => !filter || (i.name || i.type).toLowerCase().includes(filter))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const list = h("ul.rows", { "aria-label": structure ? "Structure" : "Fixtures" });
    for (const it of items) {
      const sel = highlighted && highlighted.id === it.id;
      list.append(
        h(
          "li",
          h(
            `button.row${sel ? ".sel" : ""}`,
            {
              type: "button",
              dataset: { id: it.id },
              onclick: () => {
                app.select({ kind: "item", id: it.id });
                app.focusOn(it.x, it.y);
              },
            },
            h("span.row-main", h("span.row-name", nice(it.name) || it.type), h("span.row-sub", `${it.type} · ${Math.round(it.w * 10) / 10}′ × ${Math.round(it.d * 10) / 10}′`)),
            it.locked ? h("span.row-icon", { title: "Locked" }, icon("lock", 15)) : null
          )
        )
      );
    }
    if (!items.length) list.append(h("li.empty.muted", filter ? "No matches." : "Nothing here yet."));
    return list;
  }

  function renderCurrent() {
    const tabs = h(
      "div.seg",
      { role: "tablist" },
      h("button", { type: "button", role: "tab", "aria-selected": String(fixtureTab === "fixtures"), onclick: () => { fixtureTab = "fixtures"; render(); } }, "Fixtures"),
      h("button", { type: "button", role: "tab", "aria-selected": String(fixtureTab === "structure"), onclick: () => { fixtureTab = "structure"; render(); } }, "Structure")
    );
    const search = h("input.input.small", { type: "search", placeholder: "Find…", value: filter, "aria-label": "Find a fixture" });
    search.addEventListener("input", () => {
      filter = search.value.trim().toLowerCase();
      const list = left.querySelector(".rows");
      if (list) list.replaceWith(fixtureList(fixtureTab === "structure"));
    });
    const body = [];
    if (fixtureTab === "structure") {
      const unlocked = app.ui.structureUnlocked;
      body.push(
        h(
          `div.lock-row${unlocked ? ".open" : ""}`,
          h("span.lock-ico", icon(unlocked ? "unlock" : "lock", 18)),
          h("span", h("strong", unlocked ? "Structure unlocked" : "Structure locked"), h("span.muted", unlocked ? "Walls, doors, desks and stairs can move." : "Unlock to move walls, doors, desks and stairs.")),
          h("button.btn.small", { type: "button", onclick: () => app.setStructureUnlocked(!unlocked) }, unlocked ? "Lock" : "Unlock")
        ),
        paletteGrid(app.templates.structure, "structure")
      );
    } else {
      body.push(paletteGrid(app.templates.fixtures, "fixtures"));
    }
    clear(left).append(
      head("Current layout", "Fixtures & structure", "The store as surveyed. Drag a new piece onto the floor or double-click one to move it."),
      tabs,
      ...body,
      h("div.list-head", h("span.eyebrow", fixtureTab === "structure" ? "In this build" : "Fixtures in this build"), search),
      fixtureList(fixtureTab === "structure")
    );
  }

  function questRow(k) {
    const c = cat().byKey[k.key];
    const block = k.blocks.length ? data().areas.find((a) => a.id === k.blocks[0]) : null;
    const sel = highlighted && block && highlighted.id === block.id;
    const grip = h("span.grip", { title: "Drag onto the floor", "aria-hidden": "true" }, icon("grip", 16));
    const stateIcon = { unplaced: null, issues: icon("alert", 16), warn: icon("bulb", 16), placed: icon("check", 16), confirmed: icon("check", 16) }[k.state];
    const row = h(
      `button.quest.st-${k.state}${sel ? ".sel" : ""}`,
      { type: "button", dataset: { key: k.key, id: block ? block.id : "" } },
      grip,
      h("span.swatch", { "aria-hidden": "true" }),
      h(
        "span.q-main",
        h("span.q-name", block ? block.name || c.name : c.name),
        h("span.q-sub", k.state === "unplaced" ? `Not placed · aim ${c.sqft[0].toLocaleString("en-US")}–${c.sqft[1].toLocaleString("en-US")} sq ft` : `${fmtSqft(k.sqft)} · ${STATE_LABEL[k.state]}`)
      ),
      h("span.q-state", { title: STATE_LABEL[k.state] }, stateIcon)
    );
    row.querySelector(".swatch").style.background = k.color || c.color;
    let pointerAt = 0;
    row.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" && !e.target.closest(".grip")) return; // touch: drag by the grip, tap the row
      pointerAt = performance.now();
      app.input.paletteDrag(e, { kind: "area", key: k.key, onTap: () => tapQuest(k, block) });
    });
    row.addEventListener("click", () => {
      if (performance.now() - pointerAt < 1500) return; // already handled by the drag helper
      tapQuest(k, block);
    });
    return h("li", row);
  }

  function tapQuest(k, block) {
    if (block) {
      if (app.ui.mode !== "areas") app.setMode("areas");
      app.select({ kind: "area", id: block.id });
      app.focusOn(block.x, block.y);
    } else app.askJerry({ focusKey: k.key });
  }

  function renderAreas() {
    const rep = app.report;
    const p = rep.progress;
    const bar = h("div.qbar", h("div.qbar-fill"));
    bar.firstChild.style.width = `${Math.round((p.placed / p.total) * 100)}%`;
    const list = h("ul.quests", { "aria-label": "Departments" });
    for (const k of rep.byKey) list.append(questRow(k));
    const families = Object.entries(cat().families || {});
    clear(left).append(
      head("Area planning", "Store reset", null),
      h(
        `div.quest-head${p.complete ? ".done" : ""}`,
        h("div.qh-top", h("strong.num", `${p.placed}/${p.total}`), h("span", p.complete ? "departments set. Ready to submit!" : "departments set")),
        bar,
        h("div.qh-meta", h("span", `${p.confirmed} confirmed`), h("span", `${p.collisions} conflict${p.collisions === 1 ? "" : "s"}`), h("span", `${p.warnings} tip${p.warnings === 1 ? "" : "s"}`))
      ),
      list,
      h("p.p-foot.muted", app.state.build.canEdit ? "Drag a department onto the floor (on touch, use the ⠿ grip). Tap a placed one to select it." : "Read only."),
      families.length ? h("div.legend", families.map(([key, f]) => h("span.leg", { dataset: { family: key } }, f.label))) : null
    );
  }

  function renderCompare() {
    const cd = app.compareData();
    const sel = h("select.input", { "aria-label": "Compare with" });
    const opt = (v, t) => h("option", { value: v, selected: app.ui.compareTarget === v }, t);
    sel.append(opt("suggested", "Claude's suggested plan"), opt("current", "The store today (fixtures)"));
    const mine = app.builds.filter((b) => b.id !== app.state.build.id);
    if (mine.length) sel.append(h("optgroup", { label: "My other builds" }, mine.map((b) => opt(b.id, b.name))));
    if (app.shared.length) sel.append(h("optgroup", { label: "Shared with me" }, app.shared.map((b) => opt(b.id, `${b.ownerName}: ${b.name}`))));
    sel.addEventListener("change", () => app.setCompareTarget(sel.value));
    const parts = [head("Compare", "Your build vs.", null), h("div.field", sel)];
    if (!cd) {
      parts.push(h("p.muted", "Loading…"));
      clear(left).append(...parts);
      return;
    }
    if (cd.score !== null) {
      const pct = Math.round(cd.score * 100);
      const meter = h("div.qbar", h("div.qbar-fill"));
      meter.firstChild.style.width = `${pct}%`;
      parts.push(h("div.score", h("div.score-top", h("strong.num", `${pct}%`), h("span", "footprint match")), meter));
      const list = h("ul.rows");
      for (const r of cd.areas) {
        const c = cat().byKey[r.key] || {};
        const label =
          r.change === "missing"
            ? "Not in your build"
            : r.change === "added"
              ? "Only in your build"
              : r.change === "same"
                ? "Same spot"
                : `${Math.round(r.dist)} ft away · ${r.mineSqft >= r.baseSqft ? "+" : "−"}${Math.round(Math.abs(r.mineSqft - r.baseSqft))} sq ft · ${Math.round(r.share * 100)}% overlap`;
        const row = h(
          `button.row.chg-${r.change}`,
          {
            type: "button",
            onclick: () => {
              const b = r.mine[0] || r.base[0];
              if (r.mine[0]) app.select({ kind: "area", id: r.mine[0].id });
              app.focusOn(b.x, b.y);
            },
          },
          h("span.swatch", { "aria-hidden": "true" }),
          h("span.row-main", h("span.row-name", c.name || r.key), h("span.row-sub", label))
        );
        row.querySelector(".swatch").style.background = c.color || "#888";
        list.append(h("li", row));
      }
      parts.push(h("div.list-head", h("span.eyebrow", "Departments")), list);
    } else {
      parts.push(h("p.muted", "The store today has no department blocks, so this compares fixtures and structure only."));
    }
    const it = cd.items;
    const fx = h("ul.rows");
    const addRows = (arr, label, cls) => {
      for (const x of arr.slice(0, 40)) {
        const o = x.to || x;
        fx.append(
          h(
            "li",
            h(
              `button.row.${cls}`,
              { type: "button", onclick: () => app.focusOn(o.x, o.y) },
              h("span.row-main", h("span.row-name", nice(o.name) || o.type), h("span.row-sub", label(x)))
            )
          )
        );
      }
    };
    addRows(it.moved, (m) => `Moved ${Math.round(m.dist * 10) / 10} ft${m.turn > 0.5 ? ` · turned ${Math.round(m.turn)}°` : ""}`, "chg-changed");
    addRows(it.resized.filter((r) => !it.moved.some((m) => m.id === r.id)), (r) => `Resized to ${r.to.w}′ × ${r.to.d}′`, "chg-changed");
    addRows(it.added, () => "Added in your build", "chg-added");
    addRows(it.removed.filter((r) => r.type !== "floor"), () => "Removed in your build", "chg-missing");
    parts.push(h("div.list-head", h("span.eyebrow", `Fixtures & structure · ${it.count} change${it.count === 1 ? "" : "s"}`)), it.count ? fx : h("p.muted", "No fixture changes."));
    parts.push(h("p.p-foot.muted", `Dashed outlines show where “${cd.label}” puts each department. Gray boxes show where moved fixtures used to be, red were removed, green are new.`));
    clear(left).append(...parts);
  }

  function renderSuggested() {
    const s = app.suggested;
    const cards = h("ul.sug-list");
    const order = cat().areas.map((a) => a.key);
    const blocks = [...app.suggestedBlocks].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    for (const b of blocks) {
      const c = cat().byKey[b.key];
      const sel = highlighted && highlighted.id === b.id;
      const card = h(
        `li.sug${sel ? ".sel" : ""}`,
        { dataset: { id: b.id } },
        h("div.sug-head", h("span.swatch", { "aria-hidden": "true" }), h("strong", c.name), h("span.muted.num", fmtSqft(b.w * b.d))),
        h("p", b.why),
        h(
          "div.sug-act",
          h("button.btn.small", { type: "button", onclick: () => (app.select({ kind: "area", id: b.id }), app.focusOn(b.x, b.y)) }, icon("eye", 15), "Show"),
          app.state.build.canEdit ? h("button.btn.small", { type: "button", onclick: () => app.useSuggestedArea(b.key) }, "Use in my build") : null
        )
      );
      card.querySelector(".swatch").style.background = c.color;
      cards.append(card);
    }
    clear(left).append(
      head("Suggested", s.title || "Claude's suggested plan", s.summary || null),
      app.state.build.canEdit
        ? h(
            "div.btn-row",
            h("button.btn.small.primary", { type: "button", onclick: () => app.copySuggestedAll() }, "Copy all into my build"),
            h("button.btn.small", { type: "button", onclick: () => app.startFromSuggested() }, "New build from this")
          )
        : null,
      cards,
      h("div.list-head", h("span.eyebrow", "Flow ideas")),
      h("ol.ideas", FLOW_IDEAS.map(([t, d]) => h("li", h("strong", t), h("span", d))))
    );
  }

  function render() {
    if (!app.state || !app.state.data || !app.report) return;
    const m = app.ui.mode;
    const scrollTop = left.scrollTop;
    if (m === "current") renderCurrent();
    else if (m === "areas") renderAreas();
    else if (m === "compare") renderCompare();
    else renderSuggested();
    left.scrollTop = scrollTop;
    left.dataset.mode = m;
  }

  return {
    render,
    highlight(sel) {
      highlighted = sel;
      for (const el of left.querySelectorAll(".sel")) el.classList.remove("sel");
      if (!sel) return;
      const hit = left.querySelector(`[data-id="${CSS.escape(sel.id)}"]`);
      if (hit) {
        hit.classList.add("sel");
        hit.scrollIntoView({ block: "nearest" });
      }
    },
  };
}

export { shortName };
