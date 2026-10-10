/* "Submit for review" on a map of your own (OWNER RULES v3.1 rule 7): the status chip in the header (and the
 * floating chip on phones) and the proposal dialog (submit with a note, the admin's answer, withdraw, submit
 * again). Notes and names come from people, so everything is set with textContent. The server checks every rule
 * again (docs/API.md Proposals). */
import {h, icon, setIcon, clear, relTime, modal} from "./dom.js";
import {statusInfo, chipFor, proposalFor, decisionLine, reviewErrorText} from "../core/review.js";

/**
 * createProposalControl({chip, fab, dlg, toast, announce, flushSave() -> Promise,
 *   submit(mapId, note) -> Promise<{proposal}>, withdraw(id) -> Promise<{proposal}>, refresh() -> Promise (re-fetch
 *   the person's proposals), getMap() -> {id, name, mine, master, canEdit}, onChanged(proposal | null)})
 */
export function createProposalControl(o) {
  const dlgBox = modal(o.dlg);
  const body = o.dlg.querySelector(".dialog");
  let proposals = [], map = {id: "master", mine: false, master: true}, busy = false, err = "";

  const current = () => proposalFor(map.id, proposals);

  /* ---------- the chips ---------- */
  function renderChip() {
    const c = chipFor({mine: !!map.mine, master: map.id === "master"}, current());
    for (const el of [o.chip, o.fab]) {
      if (!el) continue;
      el.hidden = !c;
      if (!c) continue;
      el.className = (el === o.fab ? "prop-chip float-chip prop-fab " : "prop-chip ") + c.cls;
      setIcon(el.querySelector("svg"), c.icon);
      el.querySelector("span").textContent = c.label;
      el.title = c.cls === "none" ? "Ask the admin to put this map's changes on the master map" : `Review status: ${c.label}`;
      el.setAttribute("aria-label", c.cls === "none" ? "Submit this map for review" : `Review status: ${c.label}. Open the details`);
    }
  }

  /* ---------- the dialog ---------- */
  function render() {
    renderChip();
    if (!o.dlg.open) return;
    const p = current();
    clear(body);
    const close = h("button", {type: "button", class: "icon-btn", aria: {label: "Close"}, onclick: () => dlgBox.close("cancel")}, icon("i-close"));
    body.appendChild(h("div", {class: "dialog-head"}, h("h2", {text: p ? "Review status" : "Submit for review", tabindex: -1}), close));
    body.appendChild(h("p", {class: "prop-map muted", text: map.name || "This map"}));
    if (err) body.appendChild(h("p", {class: "notice error", role: "alert", text: err}));
    if (p) {
      const s = statusInfo(p.status);
      body.appendChild(h("p", {class: "prop-status " + s.cls}, icon(s.icon, "i i-sm"), h("b", {text: s.label}),
        h("span", {text: p.status === "submitted" ? `· sent ${relTime(p.createdAt) || "just now"}` : `· ${decisionLine(p, relTime)}`})));
      if (p.note) body.appendChild(h("p", {class: "prop-note", text: `Your note: ${p.note}`}));
      if (p.status !== "submitted" && p.decisionNote) body.appendChild(h("p", {class: "prop-note prop-answer", text: `${p.decidedByName || "The admin"} says: ${p.decisionNote}`}));
      body.appendChild(h("p", {class: "hint", text: p.status === "submitted"
        ? "The admin sees this map's differences from the master and can approve all of them or just some."
        : p.status === "approved" ? "The approved changes are on the master map now." : "You can keep editing this map and submit it again."}));
    } else {
      body.appendChild(h("p", {class: "hint", text: "The admin compares this map with the master and can put its changes on the master map. Saying what you changed and why helps."}));
    }
    const canSubmit = !p || p.status !== "submitted";
    const field = h("div", {class: "field"},
      h("label", {for: "propNote", text: p && p.status === "submitted" ? "Change your note (sends it again)" : "Note for the admin (optional)"}),
      h("textarea", {class: "input", id: "propNote", rows: 3, maxlength: 500, placeholder: "Moved Safety next to the yard door…"}));
    field.querySelector("textarea").value = (p && p.status === "submitted" && p.note) || "";
    body.appendChild(field);
    const row = h("div", {class: "foot spread"});
    const left = h("span", {class: "foot-left"});
    if (p && p.status === "submitted") left.appendChild(h("button", {type: "button", class: "btn danger", disabled: busy, onclick: () => act(() => o.withdraw(p.id), "Withdrawn. This map is yours again; the admin won't see it in Review.")}, "Withdraw"));
    row.appendChild(left);
    row.appendChild(h("span", {},
      h("button", {type: "button", class: "btn ghost", onclick: () => dlgBox.close("cancel")}, "Cancel"), " ",
      h("button", {type: "button", class: "btn primary", id: "propSubmit", disabled: busy,
        onclick: () => act(async () => { if (o.flushSave) await o.flushSave(); return o.submit(map.id, field.querySelector("textarea").value.trim()); },
          canSubmit ? "Submitted. The admin will see it in Review." : "Sent again with your new note."),
      }, busy ? "Sending…" : !p ? "Submit for review" : p.status === "submitted" ? "Send again" : "Submit again")));
    body.appendChild(row);
  }
  async function act(fn, done) {
    if (busy) return;
    busy = true; err = ""; render();
    try {
      await fn();
      busy = false;
      if (o.refresh) await o.refresh();
      dlgBox.close("ok");
      o.toast(done, {icon: "i-check"});
      if (o.announce) o.announce(done);
    } catch (e) {
      busy = false;
      err = reviewErrorText(e && e.status, e && e.message);
      render();
      if (o.announce) o.announce(err);
    }
  }
  function open() {
    if (map.id === "master" || !map.mine) return;
    err = ""; busy = false;
    dlgBox.open();
    render();
    const f = body.querySelector("h2"); if (f) f.focus();
  }
  if (o.chip) o.chip.addEventListener("click", open);
  if (o.fab) o.fab.addEventListener("click", open);

  return {
    open,
    /** The person's own proposals (GET /api/proposals, mine only). */
    setProposals(list) { proposals = (list || []).filter(p => p.mine !== false); render(); if (o.onChanged) o.onChanged(current()); },
    setMap(m) { map = m || map; render(); },
    get current() { return current(); },
    get proposals() { return proposals; },
  };
}
