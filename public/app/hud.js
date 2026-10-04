// Heads-up display: top bar, Jerry's thought bubble, toasts and dialogs.
import { h, $, $$, icon, clear, fmtWhen, STATUS_LABEL, STATUS_CHIP } from "./h.js";

const SAVE_TEXT = {
  saved: "All changes saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save. Retrying…",
  offline: "Offline. Will retry…",
  conflict: "Changed in another window",
  readonly: "Read only",
};

export function createHud(app) {
  const el = {
    buildName: $("#build-name"),
    save: $("#save-state"),
    modes: $$(".modes [data-mode]"),
    undo: $("#btn-undo"),
    redo: $("#btn-redo"),
    cam: $("#btn-cam"),
    submit: $("#btn-submit"),
    menuBtn: $("#btn-menu"),
    menu: $("#menu"),
    banner: $("#banner"),
    bubble: $("#bubble"),
    bTitle: $("#bubble-title"),
    bText: $("#bubble-text"),
    bNote: $("#bubble-note"),
    bCta: $("#bubble-cta"),
    bShow: $("#bubble-show"),
    bNext: $("#bubble-next"),
    bClose: $("#bubble-close"),
    bCount: $("#bubble-count"),
    thought: $("#thought"),
    toasts: $("#toasts"),
    carry: $("#carry-hint"),
    hint: $("#hint"),
    dlg: $("#dlg"),
    dlgBody: $("#dlg-body"),
    askBtn: $("#btn-ask"),
    progress: $("#mode-progress"),
    sheetTabs: $$("#sheet-tabs [data-sheet]"),
  };

  el.undo.append(icon("undo"));
  el.redo.append(icon("redo"));
  el.menuBtn.append(icon("menu"));
  el.bClose.append(icon("close", 16));
  el.askBtn.prepend(icon("bulb", 16));

  for (const b of el.modes) b.addEventListener("click", () => app.setMode(b.dataset.mode));
  el.undo.addEventListener("click", () => app.undo());
  el.redo.addEventListener("click", () => app.redo());
  el.cam.addEventListener("click", () => app.toggleCamera());
  el.submit.addEventListener("click", () => hud.openSubmit());
  el.askBtn.addEventListener("click", () => (hud.bubbleOpen() ? hud.closeBubble() : app.askJerry()));
  el.buildName.addEventListener("click", () => hud.openRename());
  el.thought.addEventListener("click", () => app.askJerry());
  el.bClose.addEventListener("click", () => hud.closeBubble());
  el.bNext.addEventListener("click", () => hud.openBubble(tipIndex + 1));
  el.bShow.addEventListener("click", () => {
    const tip = currentTip();
    if (tip && tip.focus) app.focusOn(tip.focus[0], tip.focus[1]);
    if (tip && tip.areaId) app.select({ kind: "area", id: tip.areaId });
  });
  el.bCta.addEventListener("click", () => {
    if (bubbleMode === "intro") {
      app.askJerry();
      return;
    }
    if (bubbleMode === "celebrate") {
      hud.closeBubble();
      hud.openSubmit();
      return;
    }
    const tip = currentTip();
    app.applyTip(tip);
  });

  // menu
  const closeMenu = () => {
    el.menu.hidden = true;
    el.menuBtn.setAttribute("aria-expanded", "false");
  };
  el.menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.menu.hidden = !el.menu.hidden;
    el.menuBtn.setAttribute("aria-expanded", String(!el.menu.hidden));
    if (!el.menu.hidden) el.menu.querySelector("button, a")?.focus();
  });
  document.addEventListener("click", (e) => {
    if (!el.menu.hidden && !el.menu.contains(e.target)) closeMenu();
  });
  el.menu.addEventListener("keydown", (e) => e.key === "Escape" && (closeMenu(), el.menuBtn.focus()));
  el.menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    closeMenu();
    const act = b.dataset.act;
    if (act === "builds") hud.openBuilds("mine");
    else if (act === "shared") hud.openBuilds("shared");
    else if (act === "new") hud.openNew();
    else if (act === "layers") hud.openLayers();
    else if (act === "help") hud.openHelp();
    else if (act === "logout") logout();
  });
  if (app.user && app.user.role === "admin") $("#menu-admin").hidden = false;

  // compact layout: bottom sheet tabs
  for (const t of el.sheetTabs) {
    t.addEventListener("click", () => {
      const which = t.dataset.sheet;
      if (which === "jerry") {
        document.body.dataset.sheet = "";
        if (hud.bubbleOpen()) hud.closeBubble();
        else app.askJerry();
      } else {
        const open = document.body.dataset.sheet === which;
        document.body.dataset.sheet = open ? "" : which;
        if (!open) hud.closeBubble();
      }
      for (const x of el.sheetTabs) x.setAttribute("aria-pressed", String(document.body.dataset.sheet === x.dataset.sheet));
    });
  }

  // touch buttons
  $("#t-grab").addEventListener("click", () => app.grabOrDrop());
  $("#t-rot").addEventListener("click", () => (app.ui.carry ? app.rotateCarried(15) : app.editor.rotate(15)));
  const coarse = matchMedia("(pointer: coarse)");
  const touchUi = () => ($("#touch").hidden = !coarse.matches);
  touchUi();
  coarse.addEventListener("change", touchUi);

  async function logout() {
    try {
      await app.state.flush();
    } catch {
      /* ignore */
    }
    try {
      await app.api.post("/api/auth/logout", {});
    } catch {
      /* ignore */
    }
    location.replace("/login");
  }

  // ----- bubble -----
  let tips = [];
  let tipIndex = 0;
  let bubbleMode = "tips"; // tips | intro | celebrate

  function currentTip() {
    return tips[tipIndex] || null;
  }

  function renderTip() {
    if (bubbleMode !== "tips") return;
    const tip = currentTip();
    el.bubble.dataset.tone = tip ? tip.tone : "good";
    if (!tip) {
      el.bTitle.textContent = "All good here";
      el.bText.textContent = "No suggestions right now. Keep organizing however you like.";
      el.bNote.hidden = true;
      el.bCta.hidden = true;
      el.bShow.hidden = true;
      el.bNext.hidden = true;
      el.bCount.textContent = "";
      return;
    }
    el.bTitle.textContent = tip.title;
    el.bText.textContent = tip.text || "";
    el.bNote.textContent = tip.note || "";
    el.bNote.hidden = !tip.note;
    el.bCta.hidden = !(tip.cta || tip.pending);
    el.bCta.textContent = tip.cta || "Do it";
    el.bShow.hidden = !tip.focus;
    el.bNext.hidden = tips.length < 2;
    el.bCount.textContent = tips.length > 1 ? `Tip ${tipIndex + 1} of ${tips.length}` : "";
  }

  // ----- dialogs -----
  let dlgResolve = null;
  function openDialog(title, body, actions, opts = {}) {
    clear(el.dlgBody);
    el.dlg.className = "dlg" + (opts.wide ? " wide" : "");
    const head = h("div.dlg-head", h("h2", title), h("button.icon-btn.small", { type: "button", "aria-label": "Close", onclick: () => closeDialog(null) }, icon("close", 16)));
    const foot = actions && actions.length ? h("div.dlg-foot", actions) : null;
    el.dlgBody.append(head, h("div.dlg-main", body), foot);
    if (!el.dlg.open) el.dlg.showModal();
    const f = el.dlgBody.querySelector("[autofocus]") || el.dlgBody.querySelector(".dlg-main input, .dlg-main textarea, .dlg-main button, .dlg-foot .primary");
    if (f) f.focus();
    return new Promise((res) => (dlgResolve = res));
  }
  function closeDialog(v) {
    if (el.dlg.open) el.dlg.close();
    const r = dlgResolve;
    dlgResolve = null;
    if (r) r(v);
  }
  el.dlg.addEventListener("cancel", () => {
    const r = dlgResolve;
    dlgResolve = null;
    if (r) r(null);
  });
  el.dlg.addEventListener("click", (e) => {
    if (e.target === el.dlg) closeDialog(null);
  });

  const hud = {
    layout() {},

    setMode(m) {
      document.body.dataset.mode = m;
      for (const b of el.modes) b.setAttribute("aria-selected", String(b.dataset.mode === m));
      const hints = {
        current: "Double-click a fixture to pick it up · R rotates · Del deletes · WASD walks Jerry",
        areas: "Drag a department onto the floor · Double-click a block to move it · Corner handles resize",
        compare: "Dashed outlines show the other version · Arrows show what moved",
        suggested: "Tap a block to see why it goes there",
      };
      el.hint.textContent = hints[m] || "";
    },
    setCamera(cam) {
      clear(el.cam);
      el.cam.append(icon(cam === "map" ? "person" : "map", 16), h("span", cam === "map" ? "Jerry cam" : "Map view"));
      document.body.dataset.cam = cam;
    },
    updateHistory() {
      el.undo.disabled = !app.state.canUndo;
      el.redo.disabled = !app.state.canRedo;
      el.undo.title = app.state.canUndo ? `Undo: ${app.state.undoLabel} (Ctrl+Z)` : "Nothing to undo";
      el.redo.title = app.state.canRedo ? `Redo: ${app.state.redoLabel} (Ctrl+Shift+Z)` : "Nothing to redo";
    },
    updateSave(status) {
      el.save.textContent = SAVE_TEXT[status] || "";
      el.save.dataset.status = status;
    },
    updateBuild(b) {
      el.buildName.textContent = b.name;
      el.buildName.disabled = !b.canEdit;
      el.submit.hidden = !b.canEdit;
      el.submit.textContent = b.status === "submitted" ? "Submitted" : "Submit";
      el.submit.classList.toggle("primary", b.status !== "submitted");
      let msg = null, kind = "";
      if (!b.canEdit) {
        msg = `Viewing ${b.ownerName || "a teammate"}'s build (${b.name}). Read only.`;
        kind = "info";
      } else if (b.status === "needs_changes") {
        msg = `AJ asked for changes${b.reviewNote ? `: “${b.reviewNote}”` : "."}`;
        kind = "warn";
      } else if (b.status === "reviewed") {
        msg = `AJ reviewed this build${b.reviewNote ? `: “${b.reviewNote}”` : "."}`;
        kind = "ok";
      } else if (b.status === "submitted") {
        msg = "Sent to AJ for review. Any change moves it back to draft until you submit again.";
        kind = "signal";
      }
      el.banner.hidden = !msg;
      el.banner.dataset.kind = kind;
      clear(el.banner);
      if (msg) {
        el.banner.append(h("span", msg));
        if (!b.canEdit) el.banner.append(h("button.btn.small", { type: "button", onclick: () => hud.openBuilds("mine") }, "Back to my builds"));
      }
      hud.updateSave(app.state.status);
    },
    updateProgress(p) {
      el.progress.textContent = `${p.placed}/${p.total}`;
      el.progress.classList.toggle("done", p.complete);
    },

    toast(msg, kind = "") {
      const t = h("div.toast", { role: "status" }, msg);
      if (kind) t.classList.add(kind);
      el.toasts.append(t);
      while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
      setTimeout(() => t.classList.add("out"), 3200);
      setTimeout(() => t.remove(), 3700);
    },

    carryHint(on, how) {
      el.carry.hidden = !on;
      if (!on) return;
      clear(el.carry);
      el.carry.append(
        h("strong.ch-title", "Carrying"),
        h("span.ch-sub", ""),
        h("span.ch-keys", how === "jerry" ? "Walk to move · R rotate · E drop · Esc cancel" : "Move to place · tap to drop · R or two-finger twist rotates · Esc cancels")
      );
    },
    liveStatus(title, sub, tone) {
      if (el.carry.hidden) return;
      const t = el.carry.querySelector(".ch-title"), s = el.carry.querySelector(".ch-sub");
      if (t) t.textContent = title;
      if (s) {
        s.textContent = sub;
        s.dataset.tone = tone;
      }
    },

    // ----- Jerry -----
    updateTips(list) {
      const curId = currentTip() && currentTip().id;
      tips = list || [];
      if (!hud.bubbleOpen() || bubbleMode !== "tips") return;
      const i = tips.findIndex((t) => t.id === curId);
      tipIndex = i >= 0 ? i : 0;
      renderTip();
    },
    openBubble(i = 0) {
      bubbleMode = "tips";
      tipIndex = tips.length ? ((i % tips.length) + tips.length) % tips.length : 0;
      const tip = tips[tipIndex];
      if (tip && tip.pending) {
        // resolve one-tap fixes lazily for tips past the first few
        app.applyTip && (tip.cta = tip.cta || "Do it");
      }
      el.bubble.hidden = false;
      el.thought.hidden = true;
      el.askBtn.setAttribute("aria-pressed", "true");
      renderTip();
    },
    closeBubble() {
      el.bubble.hidden = true;
      el.askBtn.setAttribute("aria-pressed", "false");
      if (tips[0]) app.ui.dismissedTip = tips[0].id;
      bubbleMode = "tips";
    },
    bubbleOpen() {
      return !el.bubble.hidden;
    },
    hideThought() {
      el.thought.hidden = true;
    },
    maybeThink(idleMs) {
      const jerryTab = $('#sheet-tabs [data-sheet="jerry"]');
      const fresh = tips.length && tips[0].id !== app.ui.dismissedTip && !hud.bubbleOpen();
      el.askBtn.classList.toggle("has-tip", Boolean(fresh));
      if (jerryTab) jerryTab.classList.toggle("has-tip", Boolean(fresh));
      if (!fresh || app.ui.carry) return;
      // over the 3D store Jerry gets a thought bubble; on the map only the button glows, so nothing covers the plan
      const overPlan = document.body.dataset.cam === "map" || document.body.classList.contains("compact");
      if (idleMs > 2600 && !overPlan) el.thought.hidden = false;
      if (overPlan) el.thought.hidden = true;
    },
    placeBubble(p) {
      const vw = window.innerWidth, vh = window.innerHeight;
      const compact = document.body.classList.contains("compact");
      const leftEdge = compact ? 8 : ($("#left").offsetWidth || 0) + 20;
      const rightEdge = vw - (compact ? 8 : ($("#right").offsetWidth || 0) + 20);
      const visible = p.visible && p.x > leftEdge - 40 && p.x < rightEdge + 40 && p.y > 40 && p.y < vh;
      const mapCam = document.body.dataset.cam === "map";
      if (!el.bubble.hidden) {
        const bw = el.bubble.offsetWidth, bh = el.bubble.offsetHeight;
        const anchored = visible && !compact && !mapCam;
        let x, y;
        if (anchored) {
          x = Math.min(Math.max(p.x - bw / 2, leftEdge), rightEdge - bw);
          y = Math.min(Math.max(p.y - bh - 18, 70), vh - bh - 16);
        } else if (compact) {
          x = Math.max(8, (vw - bw) / 2);
          y = vh - bh - 150;
        } else {
          // map view: park the bubble at the bottom, clear of the minimap, so it never covers the plan
          x = Math.min(Math.max((leftEdge + rightEdge) / 2 - bw / 2, leftEdge + 240), rightEdge - bw);
          y = vh - bh - 18;
        }
        el.bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        el.bubble.classList.toggle("tailless", !anchored);
      }
      if (!el.thought.hidden) {
        const x = visible ? p.x + 14 : vw / 2;
        const y = visible ? p.y - 46 : vh - 120;
        el.thought.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    },
    showIntro() {
      bubbleMode = "intro";
      el.bubble.hidden = false;
      el.thought.hidden = true;
      el.bubble.dataset.tone = "info";
      el.bTitle.textContent = `Hi ${app.user.firstName}, I'm Jerry`;
      el.bText.textContent =
        "Let's give all 10 departments a home. Drag one from the list onto the floor, or ask me and I'll suggest a spot. Double-click any block or fixture to pick it up, and walk me around with WASD or the thumbstick.";
      el.bNote.textContent = "Your build saves to your profile as you go. Only AJ can share it with anyone else.";
      el.bNote.hidden = false;
      el.bCta.hidden = false;
      el.bCta.textContent = "Where should I start?";
      el.bShow.hidden = true;
      el.bNext.hidden = true;
      el.bCount.textContent = "";
    },
    celebrate() {
      bubbleMode = "celebrate";
      el.bubble.hidden = false;
      el.thought.hidden = true;
      el.bubble.dataset.tone = "good";
      el.bTitle.textContent = "All 10 departments are set!";
      el.bText.textContent = "Nice work. Every department has a clear spot. Mark the ones you're sure about as Confirmed, then send it to AJ.";
      el.bNote.hidden = true;
      el.bCta.hidden = !app.state.build.canEdit;
      el.bCta.textContent = "Submit build";
      el.bShow.hidden = true;
      el.bNext.hidden = true;
      el.bCount.textContent = "";
      document.body.classList.add("party");
      setTimeout(() => document.body.classList.remove("party"), 2400);
    },

    confirm({ title, text, ok = "OK", danger = false }) {
      return openDialog(title, h("p", text), [
        h("button.btn", { type: "button", onclick: () => closeDialog(false) }, "Cancel"),
        h(`button.btn.${danger ? "danger" : "primary"}`, { type: "button", onclick: () => closeDialog(true) }, ok),
      ]).then((v) => v === true);
    },

    async openRename() {
      const b = app.state.build;
      if (!b || !b.canEdit) return;
      const input = h("input.input", { type: "text", maxlength: "60", value: b.name, autofocus: true, "aria-label": "Build name" });
      const save = async () => {
        const name = input.value.trim();
        if (!name) return;
        try {
          await app.state.rename(name);
          closeDialog(true);
          hud.toast("Renamed.");
        } catch (e) {
          hud.toast(e.message, "warn");
        }
      };
      input.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), save()));
      await openDialog("Rename build", h("div.field", h("label", "Name"), input), [
        h("button.btn", { type: "button", onclick: () => closeDialog(null) }, "Cancel"),
        h("button.btn.primary", { type: "button", onclick: save }, "Save"),
      ]);
    },

    async openBuilds(tab = "mine") {
      let r;
      try {
        r = await app.refreshBuildLists();
      } catch (e) {
        hud.toast(e.message, "warn");
        return;
      }
      const list = h("div.build-list");
      const tabs = h(
        "div.seg",
        { role: "tablist" },
        h("button", { type: "button", role: "tab", "aria-selected": String(tab === "mine"), onclick: () => render("mine") }, `My builds (${r.builds.length})`),
        h("button", { type: "button", role: "tab", "aria-selected": String(tab === "shared"), onclick: () => render("shared") }, `Shared with me (${r.shared.length})`)
      );
      const render = (which) => {
        tab = which;
        for (const b of tabs.children) b.setAttribute("aria-selected", String(b.textContent.startsWith(which === "mine" ? "My" : "Shared")));
        clear(list);
        const rows = which === "mine" ? app.builds : app.shared;
        if (!rows.length) {
          list.append(h("p.muted", which === "mine" ? "No builds yet." : "Nothing shared with you yet. Only AJ can share builds."));
          return;
        }
        for (const b of rows) {
          const isOpen = app.state.build && app.state.build.id === b.id;
          const row = h(
            "div.build-row",
            h(
              "div.br-main",
              h("strong", b.name),
              h("span.muted", which === "shared" ? `${b.ownerName || "Teammate"}${b.ownerArea ? " · " + b.ownerArea : ""} · ${fmtWhen(b.updatedAt)}` : `Updated ${fmtWhen(b.updatedAt)}`)
            ),
            h(`span.chip.${STATUS_CHIP[b.status] || "x"}`, STATUS_LABEL[b.status] || b.status),
            h(
              "div.br-act",
              isOpen ? h("span.chip.ok", "Open") : h("button.btn.small.primary", { type: "button", onclick: async () => (closeDialog(true), app.openBuild(b.id)) }, which === "mine" ? "Open" : "View"),
              which === "mine"
                ? h("button.icon-btn.small", { type: "button", title: "Duplicate", "aria-label": `Duplicate ${b.name}`, onclick: () => duplicate(b) }, icon("copy", 16))
                : null,
              which === "mine" && !isOpen
                ? h("button.icon-btn.small.danger", { type: "button", title: "Delete", "aria-label": `Delete ${b.name}`, onclick: () => remove(b) }, icon("trash", 16))
                : null
            )
          );
          list.append(row);
        }
      };
      const duplicate = async (b) => {
        try {
          const res = await app.api.post(`/api/builds/${encodeURIComponent(b.id)}/duplicate`, {});
          app.builds = [{ ...res.build, data: undefined }, ...app.builds];
          hud.toast(`Made “${res.build.name}”.`);
          render("mine");
        } catch (e) {
          hud.toast(e.message, "warn");
        }
      };
      const remove = async (b) => {
        const row = [...list.children].find((x) => x.querySelector("strong")?.textContent === b.name);
        if (row && !row.classList.contains("confirming")) {
          row.classList.add("confirming");
          const bar = h(
            "div.br-confirm",
            h("span", `Delete “${b.name}” for good?`),
            h("button.btn.small", { type: "button", onclick: () => (row.classList.remove("confirming"), bar.remove()) }, "Keep"),
            h(
              "button.btn.small.danger",
              {
                type: "button",
                onclick: async () => {
                  try {
                    await app.api.del(`/api/builds/${encodeURIComponent(b.id)}`);
                    app.builds = app.builds.filter((x) => x.id !== b.id);
                    hud.toast("Deleted.");
                    render("mine");
                  } catch (e) {
                    hud.toast(e.message, "warn");
                  }
                },
              },
              "Delete"
            )
          );
          row.append(bar);
        }
      };
      render(tab);
      await openDialog("Builds", h("div.stack", tabs, list), [h("button.btn", { type: "button", onclick: () => (closeDialog(null), hud.openNew()) }, icon("plus", 16), "New build")], { wide: true });
    },

    async openNew() {
      const name = h("input.input", { type: "text", maxlength: "60", value: `${app.user.firstName}'s plan ${app.builds.length + 1}`, autofocus: true });
      const start = h("div.choice", { role: "radiogroup" });
      const opts = [
        ["blank", "Start from the store today", "All fixtures as surveyed, no departments placed yet. Best for building your own plan."],
        ["suggested", "Start from Claude's suggested plan", "All 10 departments already placed where I'd put them. Tweak from there."],
      ];
      let pick = "blank";
      for (const [v, t, d] of opts) {
        const id = "new-" + v;
        start.append(
          h(
            "label.choice-row",
            { for: id },
            h("input", { type: "radio", name: "start", id, value: v, checked: v === "blank", onchange: () => (pick = v) }),
            h("span", h("strong", t), h("span.muted", d))
          )
        );
      }
      const create = async () => {
        try {
          await app.state.flush();
          const r = await app.api.post("/api/builds", { name: name.value.trim() || "My build", from: pick === "suggested" ? "suggested" : undefined });
          closeDialog(true);
          app.builds = [{ ...r.build, data: undefined }, ...app.builds];
          app.state.load(r.build);
          app.store.set("lastBuild", r.build.id);
          app.setMode("areas");
          hud.toast(`Started “${r.build.name}”.`);
        } catch (e) {
          hud.toast(e.message, "warn");
        }
      };
      await openDialog("New build", h("div.stack", h("div.field", h("label", "Name"), name), start), [
        h("button.btn", { type: "button", onclick: () => closeDialog(null) }, "Cancel"),
        h("button.btn.primary", { type: "button", onclick: create }, "Create"),
      ]);
    },

    async openSubmit() {
      const b = app.state.build;
      if (!b || !b.canEdit) return;
      const p = app.report.progress;
      const issues = [];
      if (p.placed < p.total) issues.push(`${p.total - p.placed} department${p.total - p.placed > 1 ? "s aren't" : " isn't"} placed cleanly yet.`);
      if (p.collisions) issues.push(`${p.collisions} conflict${p.collisions > 1 ? "s" : ""} still showing (red outlines).`);
      const note = h("textarea.input", { maxlength: "1000", rows: "4", placeholder: "Anything AJ should know? What you changed and why.", autofocus: true });
      const summary = h(
        "div.submit-sum",
        h("div.ss-row", h("span", "Departments set"), h("strong.num", `${p.placed}/${p.total}`)),
        h("div.ss-row", h("span", "Confirmed"), h("strong.num", String(p.confirmed))),
        h("div.ss-row", h("span", "Fixture changes vs. store today"), h("strong.num", String(changesVsToday())))
      );
      const send = async () => {
        try {
          await app.state.flush();
          const r = await app.api.post(`/api/builds/${encodeURIComponent(b.id)}/submit`, { note: note.value });
          app.state.markSubmitted(r);
          closeDialog(true);
          hud.toast("Sent to AJ. Nice work.", "ok");
          app.scene.jerry.wave(2);
        } catch (e) {
          hud.toast(e.message, "warn");
        }
      };
      await openDialog(
        "Submit to AJ",
        h(
          "div.stack",
          h("p", `AJ gets an alert and can review “${b.name}”. Nobody else can see it unless AJ shares it.`),
          summary,
          issues.length ? h("div.notice.warn", issues.join(" "), " You can still submit.") : h("div.notice.ok", "Everything is placed with no conflicts."),
          h("div.field", h("label", "Note for AJ (optional)"), note)
        ),
        [h("button.btn", { type: "button", onclick: () => closeDialog(null) }, "Not yet"), h("button.btn.primary", { type: "button", onclick: send }, icon("send", 16), "Submit")]
      );
    },

    openHelp() {
      const row = (k, d) => h("div.key-row", h("span.keys", k), h("span", d));
      return openDialog(
        "Controls",
        h(
          "div.help-grid",
          h(
            "section",
            h("h3", "Mouse & keyboard"),
            row("W A S D / arrows", "Walk Jerry (Shift to run)"),
            row("Click floor", "Jerry walks there"),
            row("Double-click", "Pick up a block or fixture"),
            row("Click again", "Drop it (or drag while holding)"),
            row("E", "Grab or drop what Jerry is standing at"),
            row("R / Shift+R", "Rotate 15°"),
            row("Corner handles", "Resize · Shift keeps the shape · Alt fine-tunes"),
            row("Alt + arrows", "Nudge the selected thing"),
            row("Drag empty floor", "Look around (map: pan)"),
            row("Wheel", "Zoom"),
            row("Space or V", "Switch Jerry cam / map view"),
            row("1 2 3 4", "Current · Areas · Compare · Suggested"),
            row("Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"),
            row("Delete", "Remove the selected thing"),
            row("J", "Ask Jerry for a tip")
          ),
          h(
            "section",
            h("h3", "Touch"),
            row("Thumbstick", "Walk Jerry"),
            row("Tap floor", "Jerry walks there"),
            row("Double-tap and hold", "Pick up and drag; let go to drop"),
            row("Double-tap", "Pick up; drag to move; it drops when you let go"),
            row("Two-finger twist", "Rotate what you're carrying"),
            row("Pinch", "Zoom"),
            row("Drag the ⠿ grip", "Drag a department from the list onto the floor"),
            h("h3", "Good to know"),
            h("p.muted", "Department blocks are merchandise territories, not fixtures. Red outlines mean a conflict with a wall, desk, doorway clearance, stairs or another block. Your build saves to your profile automatically.")
          )
        ),
        [h("button.btn.primary", { type: "button", onclick: () => closeDialog(null) }, "Got it")],
        { wide: true }
      );
    },

    openLayers() {
      const L = app.ui.layers;
      const sw = (key, label, desc) => {
        const id = "layer-" + key;
        return h(
          "label.switch-row",
          { for: id },
          h("span", h("strong", label), desc ? h("span.muted", desc) : null),
          h("input", { type: "checkbox", id, role: "switch", checked: L[key], onchange: (e) => app.setLayer(key, e.target.checked) })
        );
      };
      return openDialog(
        "Layers & graphics",
        h(
          "div.stack",
          sw("areas", "Department blocks"),
          sw("fixtures", "Fixtures", "Gondolas, wall units, racks, tables and displays"),
          sw("structure", "Structure", "Walls, doors, desks, columns and stairs"),
          sw("labels", "Labels and signs"),
          sw("clearances", "Doorway clearances", "Striped zones that must stay clear"),
          h(
            "label.switch-row",
            { for: "gfx-low" },
            h("span", h("strong", "Battery saver"), h("span.muted", "Turns off shadows. Try this on older phones.")),
            h("input", { type: "checkbox", id: "gfx-low", role: "switch", checked: app.ui.lowGfx, onchange: (e) => app.setLowGfx(e.target.checked) })
          )
        ),
        [h("button.btn.primary", { type: "button", onclick: () => closeDialog(null) }, "Done")]
      );
    },

    async openConflict() {
      const b = app.state.build;
      const choice = await openDialog(
        "This build changed somewhere else",
        h("p", "It looks like this build was edited in another window or device. Pick which version to keep."),
        [
          h("button.btn", { type: "button", onclick: () => closeDialog("copy") }, "Save mine as a copy"),
          h("button.btn.primary", { type: "button", onclick: () => closeDialog("load") }, "Load the latest"),
        ]
      );
      if (choice === "copy") {
        try {
          const r = await app.api.post("/api/builds", { name: `${b.name} (my copy)`.slice(0, 60), data: app.state.data });
          app.builds = [{ ...r.build, data: undefined }, ...app.builds];
          app.state.load(r.build);
          app.store.set("lastBuild", r.build.id);
          hud.toast("Saved your version as a new build.");
        } catch (e) {
          hud.toast(e.message, "warn");
        }
      } else {
        await app.openBuild(b.id, { reload: true, silent: true });
        hud.toast("Loaded the latest version.");
      }
    },
  };

  function changesVsToday() {
    const base = new Map((app.current.items || []).map((i) => [i.id, i]));
    let n = 0;
    for (const it of app.state.data.items) {
      const b = base.get(it.id);
      if (!b || Math.abs(b.x - it.x) > 0.05 || Math.abs(b.y - it.y) > 0.05 || (b.rot || 0) !== (it.rot || 0) || b.w !== it.w || b.d !== it.d) n++;
    }
    for (const id of base.keys()) if (!app.state.data.items.some((i) => i.id === id)) n++;
    return n;
  }

  return hud;
}
