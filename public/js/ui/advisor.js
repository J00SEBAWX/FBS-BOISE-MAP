/* Advisor mode's panel (OWNER RULES v3.1, rule 6): the overall score, the ranked recommendations with "Show me"
 * and "Apply", every principle's score with its reasoning (expandable), the overlay toggles and the Assumptions
 * panel (thresholds, margin tiers, roles and rule weights: the admin edits and saves them through
 * PUT /api/advisor-config, everyone else sees them read-only; the engine's own assumptions are listed as such).
 * Every number is labelled; all text goes in with textContent. The engine (core/advisor.js) runs here on the
 * open map; the app draws the overlays. */
import {h, icon, clear, relTime} from "./dom.js";
import {analyse} from "../core/advisor.js";
import {CATALOG} from "../shared/catalog.js";
import {OVERLAYS, defaultOverlays, scoreTone, PRIORITY_LABEL, configRows, buildConfig} from "../core/advisor-ui.js";

const KEY = "fbs-advisor-overlays-v1";
const SEV_ICON = {high: "i-error", medium: "i-warning", low: "i-warning", info: "i-info"};

/**
 * createAdvisorPanel({el, isAdmin, getDoc(), getCategories(), loadConfig() -> Promise<{config, isDefault, updatedAt}>,
 *   saveConfig(config) -> Promise, resetConfig() -> Promise, onOverlays(toggles), onShow(rec | null),
 *   applyFix(rec) -> error | null, toast, isTouch(), onClose()})
 */
export function createAdvisorPanel(o) {
  const {el} = o;
  let result = null, server = null, draft = null, shownId = null, busy = false, cfgError = "", configOpen = false, analysing = false;
  const openP = new Set();
  let toggles = (() => { const t = defaultOverlays(); try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object") for (const k of Object.keys(t)) if (typeof s[k] === "boolean") t[k] = s[k]; } catch { /* defaults */ } return t; })();
  const head = h("div", {class: "mp-head"}), body = h("div", {class: "mp-body"}), foot = h("div", {class: "mp-foot"});
  el.append(head, body, foot);

  /* ---------- the engine ---------- */
  const currentConfig = () => (draft ? draft.config : server ? server.config : null);
  function run() {
    const doc = o.getDoc();
    if (!doc) return;
    analysing = true;
    try { result = analyse(doc, CATALOG, currentConfig()); }
    catch (e) { result = null; cfgError = "The advisor couldn't analyse this map: " + (e && e.message ? e.message : "unknown problem"); }
    analysing = false;
    if (shownId && !(result && result.recommendations.some(r => r.id === shownId))) { shownId = null; o.onShow(null); }
    render();
  }
  async function loadConfig() {
    try { server = await o.loadConfig(); draft = null; cfgError = ""; }
    catch (e) { cfgError = "Couldn't load the advisor settings; using the defaults. " + ((e && e.message) || ""); server = null; }
    run();
  }

  /* ---------- actions ---------- */
  function show(rec) {
    shownId = shownId === rec.id ? null : rec.id;
    render();
    o.onShow(shownId ? rec : null);
  }
  function apply(rec) {
    const err = o.applyFix(rec);
    if (err) { o.toast(err); return; }
    if (shownId === rec.id) { shownId = null; o.onShow(null); }
    o.toast(`${rec.apply.text}. Undo with Ctrl+Z.`, {icon: "i-check"});
  }
  function setToggle(key, on) {
    toggles = {...toggles, [key]: on};
    try { localStorage.setItem(KEY, JSON.stringify(toggles)); } catch { /* not saved */ }
    render();
    o.onOverlays(toggles);
  }
  /* the assumptions form: edits land in a draft (the analysis follows right away), Save sends it */
  function edit(fn) {
    const base = draft ? draft.values : {thresholds: {}, departments: {}, rules: {}, roles: {}};
    const values = JSON.parse(JSON.stringify(base));
    fn(values);
    const built = buildConfig(server ? server.config : null, values);
    if (built.error) { cfgError = built.error; render(); return; }
    cfgError = "";
    draft = {values, config: built.config};
    run();
  }
  async function save() {
    if (!draft || busy) return;
    busy = true; render();
    try { server = await o.saveConfig(draft.config); draft = null; cfgError = ""; o.toast("Advisor settings saved for everyone.", {icon: "i-check"}); }
    catch (e) { cfgError = (e && e.message) || "Couldn't save the settings."; }
    busy = false; run();
  }
  async function reset() {
    if (busy) return;
    busy = true; render();
    try { server = await o.resetConfig(); draft = null; cfgError = ""; o.toast("Advisor settings are back to the defaults.", {icon: "i-check"}); }
    catch (e) { cfgError = (e && e.message) || "Couldn't reset the settings."; }
    busy = false; run();
  }

  /* ---------- rendering ---------- */
  const scoreChip = (score, cls = "") => h("span", {class: `score ${scoreTone(score)} ${cls}`, text: score === null || score === undefined ? "n/a" : String(score), aria: {label: score === null || score === undefined ? "not applicable" : `score ${score} of 100`}});
  function recRow(r) {
    const on = shownId === r.id;
    return h("div", {class: "adv-rec" + (on ? " shown" : ""), data: {id: r.id}},
      h("div", {class: "adv-rec-top"}, h("span", {class: "adv-rank", text: String(r.rank), aria: {hidden: true}}),
        h("span", {class: "adv-prio " + r.priority, text: PRIORITY_LABEL[r.priority] || r.priority}),
        h("span", {class: "adv-rec-title", text: r.title})),
      h("p", {class: "adv-why", text: r.why}),
      h("div", {class: "btn-row"},
        h("button", {type: "button", class: "btn small" + (on ? " pressed" : ""), aria: {pressed: on}, onclick: () => show(r)}, icon("i-eye"), on ? "Showing" : "Show me"),
        r.apply ? h("button", {type: "button", class: "btn small primary", title: r.apply.text, disabled: !o.canEdit(), onclick: () => apply(r)}, icon("i-check"), "Apply") : h("span", {class: "adv-byhand", text: "No one-tap fix"})));
  }
  function principleRow(p) {
    const open = openP.has(p.id);
    const det = h("details", {class: "adv-prin" + (p.enabled ? "" : " off"), open});
    det.addEventListener("toggle", () => { if (det.open) openP.add(p.id); else openP.delete(p.id); });
    det.appendChild(h("summary", {class: "adv-prin-sum"},
      h("span", {class: "adv-prin-title", text: p.title}),
      h("span", {class: "adv-bar", aria: {hidden: true}}, h("span", {class: "adv-bar-fill " + scoreTone(p.score), style: {"--p": p.applicable && p.score !== null ? (p.score / 100).toFixed(2) : 0}})),
      scoreChip(p.applicable ? p.score : null),
      icon("i-chevron", "i i-sm adv-chev")));
    det.appendChild(h("div", {class: "adv-prin-body"},
      h("p", {class: "adv-prin-why", text: p.why}),
      h("p", {class: "adv-reason", text: p.reasoning || ""}),
      p.findings && p.findings.length ? h("ul", {class: "checks"}, p.findings.slice(0, 12).map(f => h("li", {class: "chk " + (f.severity === "high" ? "error" : f.severity === "medium" || f.severity === "low" ? "warning" : "info")}, icon(SEV_ICON[f.severity] || "i-info"), h("span", {text: f.text})))) : null,
      h("p", {class: "insp-hint", text: `Weight in the overall score: ${p.weight}${p.enabled ? "" : " (turned off)"}.`})));
    return det;
  }
  function overlaysSection() {
    const sec = h("section", {class: "insp-sec"}, h("h3", {class: "eyebrow", text: "Overlays on the plan and in 3D"}));
    for (const ov of OVERLAYS) {
      const on = !!toggles[ov.key];
      sec.appendChild(h("button", {type: "button", class: "switch-row", role: "switch", aria: {checked: on}, title: ov.hint, onclick: () => setToggle(ov.key, !on)},
        h("span", {class: "sw-label"}, h("b", {text: ov.label}), h("span", {class: "sw-hint", text: ov.hint})), h("span", {class: "sw-track", aria: {hidden: true}}, h("span", {class: "sw-knob"}))));
    }
    return sec;
  }
  function numberField(id, label, value, {min, max, step = 0.5, unit = "", editable, onChange}) {
    if (!editable) return h("div", {class: "field ro"}, h("span", {class: "f-label", text: label}), h("span", {class: "f-value", text: `${value}${unit === "%" ? "%" : " " + unit}`}));
    const input = h("input", {class: "input f-in", id, type: "number", min, max, step, inputmode: "decimal", value: String(value), aria: {describedby: id + "-u"}});
    input.addEventListener("change", () => onChange(input.value));
    input.addEventListener("keydown", e => e.stopPropagation());
    return h("div", {class: "field"}, h("label", {class: "f-label", for: id, text: label}), h("span", {class: "f-unit"}, input, h("span", {class: "f-unit-text", id: id + "-u", text: unit})));
  }
  function assumptionsSection() {
    const cfg = currentConfig(), rows = configRows(cfg, o.getCategories());
    const editable = o.isAdmin;
    const det = h("details", {class: "adv-config", open: configOpen});
    det.addEventListener("toggle", () => { configOpen = det.open; });
    det.appendChild(h("summary", {class: "adv-config-sum"}, h("span", {class: "eyebrow", text: "Assumptions and settings"}), h("span", {class: "badge", text: server && !server.isDefault ? "Changed by the admin" : "Defaults"}), icon("i-chevron", "i i-sm adv-chev")));
    const wrap = h("div", {class: "adv-config-body"});
    wrap.appendChild(h("p", {class: "insp-hint", text: editable ? "Every number here is an assumption the store can change. Edits preview at once; Save keeps them for everyone." : "Every number here is an assumption. Only the admin can change them."}));
    if (cfgError) wrap.appendChild(h("p", {class: "notice error", role: "alert", text: cfgError}));
    // thresholds
    wrap.appendChild(h("h4", {class: "eyebrow adv-sub", text: "Distances and sizes"}));
    const grid = h("div", {class: "f-grid"});
    for (const t of rows.thresholds) grid.appendChild(numberField("adv-" + t.key, t.label, t.value, {min: t.min, max: t.max, step: t.unit === "%" ? 1 : 0.5, unit: t.unit, editable, onChange: v => edit(d => { d.thresholds[t.key] = v; })}));
    wrap.appendChild(grid);
    // departments: margin tiers and roles
    wrap.appendChild(h("h4", {class: "eyebrow adv-sub", text: "Departments: margin, theft, roles"}));
    wrap.appendChild(h("p", {class: "insp-hint", text: "Margin tiers and theft-prone flags are assumptions (owner rule 6), not store data."}));
    const roleOf = (key, role) => rows.roles.find(r => r.key === role).keys.includes(key);
    for (const d of rows.departments) {
      const card = h("div", {class: "adv-dept"});
      const sel = h("select", {class: "input f-in adv-margin", id: "adv-m-" + d.key, aria: {label: `${d.name}: margin tier`}, disabled: !editable},
        ["high", "medium", "low"].map(m => h("option", {value: m, text: m[0].toUpperCase() + m.slice(1) + " margin", selected: m === d.margin})));
      sel.addEventListener("change", () => edit(v => { v.departments[d.key] = {...(v.departments[d.key] || {margin: d.margin, theftProne: d.theftProne}), margin: sel.value}; }));
      sel.addEventListener("keydown", e => e.stopPropagation());
      card.appendChild(h("div", {class: "adv-dept-top"}, h("b", {text: d.name}), d.assumption ? h("span", {class: "badge", text: "Assumption"}) : null));
      const chips = h("div", {class: "adv-chips"}, sel);
      const chip = (label, on, onToggle) => h("button", {type: "button", class: "adv-chip" + (on ? " on" : ""), role: "checkbox", aria: {checked: on}, disabled: !editable, onclick: () => onToggle(!on)}, on ? icon("i-check", "i i-sm") : null, label);
      chips.appendChild(chip("Theft-prone", d.theftProne, on => edit(v => { v.departments[d.key] = {...(v.departments[d.key] || {margin: d.margin, theftProne: d.theftProne}), theftProne: on}; })));
      for (const [role, label] of [["destination", "Destination"], ["bulky", "Bulky"], ["powerWall", "Power wall"]]) {
        chips.appendChild(chip(label, roleOf(d.key, role), on => edit(v => {
          const cur = v.roles[role] || rows.roles.find(r => r.key === role).keys.slice();
          v.roles[role] = on ? [...new Set([...cur, d.key])] : cur.filter(k => k !== d.key);
        })));
      }
      card.appendChild(chips);
      wrap.appendChild(card);
    }
    // rules
    wrap.appendChild(h("h4", {class: "eyebrow adv-sub", text: "Rules and their weight"}));
    for (const r of rows.rules) {
      const row = h("div", {class: "adv-rule"});
      row.appendChild(h("button", {type: "button", class: "switch-row", role: "switch", aria: {checked: r.enabled}, disabled: !editable, title: r.why, onclick: () => edit(v => { v.rules[r.key] = {...(v.rules[r.key] || {weight: r.weight}), enabled: !r.enabled}; })},
        h("span", {class: "sw-label"}, h("b", {text: r.label})), h("span", {class: "sw-track", aria: {hidden: true}}, h("span", {class: "sw-knob"}))));
      row.appendChild(numberField("adv-w-" + r.key, "Weight", r.weight, {min: 0, max: 5, step: 0.5, unit: "× ", editable, onChange: v => edit(d => { d.rules[r.key] = {...(d.rules[r.key] || {enabled: r.enabled}), weight: v}; })}));
      wrap.appendChild(row);
    }
    // the engine's own assumptions
    wrap.appendChild(h("h4", {class: "eyebrow adv-sub", text: "Built into the engine (labelled assumptions)"}));
    wrap.appendChild(h("dl", {class: "adv-engine"}, rows.engine.map(e => [h("dt", {text: e.label}), h("dd", {text: String(e.value)})])));
    if (editable) {
      wrap.appendChild(h("div", {class: "btn-row adv-cfg-actions"},
        h("button", {type: "button", class: "btn primary small", disabled: !draft || busy, onclick: save}, busy ? "Saving…" : "Save for everyone"),
        h("button", {type: "button", class: "btn small", disabled: busy || (server && server.isDefault && !draft), onclick: reset}, "Back to the defaults"),
        draft ? h("button", {type: "button", class: "btn ghost small", onclick: () => { draft = null; cfgError = ""; run(); }}, "Discard edits") : null));
    }
    wrap.appendChild(h("p", {class: "insp-hint", text: server && server.updatedAt ? `Saved settings from ${relTime(server.updatedAt)}.` : "Using the default settings."}));
    det.appendChild(wrap);
    return det;
  }
  function render() {
    clear(head);
    head.appendChild(h("div", {class: "pal-title-row"}, h("h2", {class: "pal-title", text: "Advisor"}),
      o.isTouch() ? h("button", {type: "button", class: "icon-btn", aria: {label: "Close"}, onclick: () => o.onClose && o.onClose()}, icon("i-close")) : null));
    if (result) {
      const n = result.recommendations.length;
      head.appendChild(h("div", {class: "adv-overall"},
        h("span", {class: "adv-overall-score " + scoreTone(result.overall), text: result.overall === null ? "–" : String(result.overall)}),
        h("span", {class: "adv-overall-text"}, h("b", {text: result.overall === null ? "Nothing to score yet" : "Overall score, out of 100"}),
          h("span", {text: n ? `${n} recommendation${n === 1 ? "" : "s"}, best first` : "No recommendations: nothing to fix on this map"}))));
      const miss = (result.stats && result.stats.missingAnchors) || [];
      if (miss.length) head.appendChild(h("p", {class: "insp-hint adv-miss", text: `Not found on this map: ${miss.map(k => ({front_door: "the front door", sales_desk: "a sales desk", will_call: "will-call", yard_doors: "the yard doors"})[k] || k).join(", ")}. Principles that need them are marked not applicable.`}));
    } else head.appendChild(h("p", {class: "mp-state", text: analysing ? "Analysing…" : cfgError || "Loading…"}));
    clear(body);
    if (result) {
      body.appendChild(h("h3", {class: "eyebrow mp-group", text: "Recommendations"}));
      if (!result.recommendations.length) body.appendChild(h("p", {class: "pal-hint", text: result.overall === null ? "Place departments in Area planning, then come back." : "Nothing to recommend. The plan follows every rule that applies."}));
      for (const r of result.recommendations) body.appendChild(recRow(r));
      body.appendChild(h("h3", {class: "eyebrow mp-group", text: "Principles"}));
      for (const p of result.principles) body.appendChild(principleRow(p));
      body.appendChild(overlaysSection());
      body.appendChild(assumptionsSection());
    }
    clear(foot);
    if (result && result.stats) foot.appendChild(h("p", {class: "pal-hint", text: `Analysed in ${result.stats.ms} ms on a ${result.stats.cellFt * 12}-inch walking grid.`}));
  }
  function reveal(id) { const r = body.querySelector(`.adv-rec[data-id="${CSS.escape(id)}"]`); if (r && r.scrollIntoView) r.scrollIntoView({block: "nearest"}); }

  return {
    run, render, loadConfig, reveal,
    get result() { return result; },
    get overlays() { return toggles; },
    get shown() { return shownId && result ? result.recommendations.find(r => r.id === shownId) || null : null; },
    clearShow() { if (shownId) { shownId = null; render(); } },
  };
}
