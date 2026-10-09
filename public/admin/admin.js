/* Admin dashboard: hand out access codes, see and remove the people who have access, change the password.
 * Every action is checked again on the server (admin-only API); this page is just the controls.
 * Names come from visitors, so all text goes in with textContent / DOM APIs, never as HTML. */
(function () {
"use strict";

const $ = s => document.querySelector(s);
const state = {data: null};

/* ---------- DOM helper: h("li.code-item", {attr: value}, child, "text", ...) ---------- */
function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name);
  if (classes.length) el.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/* ---------- API ---------- */
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body !== undefined ? {"Content-Type": "application/json", "X-FBS": "1"} : {"X-FBS": "1"},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the site. Check your connection and try again.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401) {
    location.replace("/login?admin=1");
    throw new Error("You were signed out. Sign in again.");
  }
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Try again in a minute.");
    err.field = data.field;
    throw err;
  }
  return data;
}

/* ---------- small things ---------- */
/* screen readers: #announce is always rendered and only its text changes, so every message is read out */
function announce(text) {
  const live = $("#announce");
  live.textContent = "";
  setTimeout(() => { live.textContent = text; }, 120);
}

let toastT = 0;
function toast(msg, warn) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("warn", !!warn);
  t.hidden = false;
  announce(msg);
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

/* a button that's working says what it's doing and is marked busy; the returned function puts it back */
function busy(btn, label) {
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = label;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  return () => {
    btn.textContent = btn.dataset.label;
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
  };
}

function fmtDate(ms) {
  const d = new Date(ms);
  const opts = {month: "short", day: "numeric"};
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

function fmtAgo(ms) {
  if (!ms) return "not yet";
  const diff = Date.now() - ms;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} h ago`;
  const days = Math.floor(diff / 86400000);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return fmtDate(ms);
}

/* returns true when the text is on the clipboard */
async function copyText(text, doneMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(doneMsg);
    return true;
  } catch { /* fall back below */ }
  const active = document.activeElement;
  const ta = h("textarea.sr-only", {readonly: true, "aria-hidden": "true"});
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  if (active && active.focus) active.focus();
  toast(ok ? doneMsg : "Couldn't copy. Press and hold the code to select it.", !ok);
  return ok;
}

/* ---------- confirm dialog ---------- */
const dlg = $("#confirm");
function confirmBox(title, text, okLabel, danger) {
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = text;
  const ok = $("#confirm-ok");
  ok.textContent = okLabel;
  ok.classList.toggle("primary", !danger);
  ok.classList.toggle("danger", !!danger);
  ok.classList.toggle("solid", !!danger);
  dlg.returnValue = "";
  dlg.showModal();
  $("#confirm-cancel").focus();
  return new Promise(resolve => dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), {once: true}));
}
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close("cancel"); }); // click on the backdrop

/* ---------- access codes ---------- */
const invite = code => `Here's the FBS Boise store map: ${location.origin}/  Your access code: ${code} (works once)`;

/* Codes already copied (so probably sent to someone) are marked, in this browser only, so the same code
 * isn't sent to two people. Kept in localStorage by code id; without storage the marks last until reload. */
const COPIED_KEY = "fbs-admin-copied";
let copied = {};
try { copied = JSON.parse(localStorage.getItem(COPIED_KEY) || "{}") || {}; } catch { copied = {}; }
function saveCopied() {
  try { localStorage.setItem(COPIED_KEY, JSON.stringify(copied)); } catch { /* private browsing: not kept */ }
}

function setStatus(el, isCopied) {
  el.textContent = isCopied ? "Copied · waiting for them to sign up" : "Available";
  el.classList.toggle("ok", !isCopied);
  el.classList.toggle("sent", isCopied);
}

function codeItem(c) {
  if (c.status === "used") {
    return h("li.code-item.is-used",
      null,
      h("span.used-mark", {"aria-hidden": "true"}),
      h("span.code-status", null, c.usedByName ? `Used by ${c.usedByName} on ${fmtDate(c.usedAt)}` : "Used · person removed"));
  }
  const code = c.code || "";
  const status = h("span.code-status");
  setStatus(status, !!copied[c.id]);
  // marked in place (not re-sorted) so the card doesn't jump away from the finger that just tapped it
  const copy = async (text, msg) => {
    if (!(await copyText(text, msg))) return;
    copied[c.id] = Date.now();
    saveCopied();
    setStatus(status, true);
  };
  return h("li.code-item",
    null,
    h("div.code-main", null,
      h("span.code-val", null, code || "(can't show this code)"),
      status),
    code ? h("div.code-actions", null,
      h("button.btn", {type: "button", "aria-label": `Copy code ${code}`, onclick: () => copy(code, "Code copied.")}, "Copy"),
      h("button.btn", {type: "button", "aria-label": `Copy invite with code ${code}`, onclick: () => copy(invite(code), "Invite copied. Paste it in a text message.")}, "Copy invite")) : null);
}

function renderCodes(d) {
  const has = d.batchCreatedAt !== null;
  const left = d.codes.filter(c => c.status === "available").length;
  // forget marks for codes that are used or gone; list untouched codes first, then copied ones, then used ones
  const live = new Set(d.codes.filter(c => c.status === "available").map(c => c.id));
  for (const id of Object.keys(copied)) if (!live.has(id)) delete copied[id];
  saveCopied();
  const rank = c => (c.status !== "available" ? 2 : copied[c.id] ? 1 : 0);
  const ordered = d.codes.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
  $("#codes-list").replaceChildren(...ordered.map(codeItem));
  $("#codes-list").hidden = !has;
  $("#codes-empty").hidden = has;
  const count = $("#codes-count");
  if (has) {
    const pips = h("span.pips", {"aria-hidden": "true"}, ordered.map(c => h(c.status === "available" ? "span.pip.on" : "span.pip")));
    count.replaceChildren(pips, h("span", null, `${left} of ${d.codes.length} codes left`));
    count.hidden = false;
  } else count.hidden = true;
  const btn = $("#new-set");
  btn.dataset.label = has ? "Make a new set of 5" : "Make 5 codes";
  if (btn.getAttribute("aria-busy") !== "true") {
    btn.textContent = btn.dataset.label;
    btn.disabled = false;
  }
}

$("#new-set").addEventListener("click", async () => {
  const btn = $("#new-set");
  const has = state.data && state.data.batchCreatedAt !== null;
  if (has && !(await confirmBox("Make a new set of 5?",
    "This cancels the codes nobody has used yet and makes 5 new ones. People already signed in keep access.",
    "Make new codes", false))) return;
  const done = busy(btn, "Making codes…");
  let next = btn;
  try {
    await api("POST", "/api/admin/codes/new-set", {});
    await load();
    toast("5 new codes are ready.");
    next = $("#codes-list .code-actions .btn") || btn; // the first new code's Copy button
  } catch (e) {
    toast(e.message, true);
  } finally {
    done();
    next.focus();
  }
});

/* ---------- people ---------- */
function personItem(p) {
  return h("li.person",
    null,
    h("div.person-main", null,
      h("span.person-name", null, p.name),
      p.tel ? h("a.person-phone", {href: `tel:${p.tel}`}, p.phone) : null,
      h("span.person-meta", null, `Joined ${fmtDate(p.joinedAt)} · Last visit ${fmtAgo(p.lastSeenAt)}`)),
    h("button.btn.danger", {type: "button", "aria-label": `Remove ${p.name}`, onclick: e => remove(p, e.currentTarget)}, "Remove"));
}

function renderPeople(d) {
  $("#people-list").replaceChildren(...d.people.map(personItem));
  $("#people-list").hidden = !d.people.length;
  $("#people-empty").hidden = !!d.people.length;
  $("#people-count").textContent = d.people.length === 1 ? "1 person can open the map." : `${d.people.length} people can open the map.`;
}

async function remove(p, btn) {
  if (!(await confirmBox(`Remove ${p.name}?`, "They'll be signed out right away and need a new code to come back.", "Remove", true))) return;
  const done = busy(btn, "Removing…");
  try {
    await api("DELETE", `/api/admin/people/${encodeURIComponent(p.id)}`);
    await load(); // the list is drawn again without them, so focus goes to the section heading
    toast(`${p.name} was removed.`);
    $("#people-title").focus();
  } catch (e) {
    done();
    btn.focus();
    toast(e.message, true);
  }
}

/* ---------- your account ---------- */
$("#pw-form").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, msg = $("#pw-msg");
  const cur = $("#pw-current"), p1 = $("#pw-new"), p2 = $("#pw-again");
  const say = (text, kind) => { msg.textContent = text; msg.className = "notice " + kind; msg.hidden = !text; if (text) announce(text); };
  for (const el of [cur, p1, p2]) el.removeAttribute("aria-invalid");
  const fail = (el, text) => { say(text, "error"); el.setAttribute("aria-invalid", "true"); el.focus(); };
  if (!cur.value) return fail(cur, "Enter your current password.");
  if ([...p1.value].length < 10) return fail(p1, "Use at least 10 characters for the new password.");
  if (p1.value !== p2.value) return fail(p2, "The two new passwords don't match.");
  const btn = form.querySelector("button[type=submit]");
  const done = busy(btn, "Saving…");
  try {
    await api("POST", "/api/admin/password", {currentPassword: cur.value, newPassword: p1.value});
    form.reset();
    done();
    say("Password changed. Your other devices were signed out.", "ok");
    btn.focus();
  } catch (err) {
    done();
    // the server says which field is wrong: the current password, or the new one
    const bad = {currentPassword: cur, password: p1}[err.field];
    if (bad) fail(bad, err.message);
    else { say(err.message, "error"); btn.focus(); }
  }
});

async function signOut(e) {
  busy(e.currentTarget, "Signing out…");
  try { await api("POST", "/api/logout", {}); } catch { /* signed out anyway */ }
  location.replace("/login?admin=1");
}
$("#logout").addEventListener("click", signOut);
$("#logout-2").addEventListener("click", signOut);

/* ---------- load ---------- */
async function load() {
  const d = await api("GET", "/api/admin/overview");
  state.data = d;
  $("#load-error").hidden = true;
  renderCodes(d);
  renderPeople(d);
}

load().catch(e => {
  const box = $("#load-error");
  box.textContent = e.message;
  box.hidden = false;
});
// coming back to the tab (e.g. after texting a code): show who has joined since
document.addEventListener("visibilitychange", () => { if (!document.hidden && !dlg.open) load().catch(() => {}); });
})();
