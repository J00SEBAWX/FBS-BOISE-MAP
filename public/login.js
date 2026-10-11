/* Sign-in page: username + password for everyone. A code from the admin opens either "Make your profile" (an access
 * code: name, username, password) or "Pick a new password" (a reset code made for one person). The admin's one-time
 * setup code sets or resets the admin password. No phone numbers. Talks only to this site's /api. */
(function () {
"use strict";

/* Reaching the sign-in page means nobody is signed in on this browser: whatever the last person left here (unsaved map drafts, the
 * admin's "copied" marks) goes now, so the next person on a shared device never inherits it. Sign-out already does this; this covers a
 * session that simply ended while the tab was closed. */
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith("fbs-draft-v1:") || k === "fbs-admin-copied") localStorage.removeItem(k);
} catch { /* no storage (private browsing): nothing was kept */ }

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const mode = params.has("setup") ? "setup" : params.has("admin") ? "admin" : "start";
const PANELS = ["#sign-in", "#step-code", "#step-details", "#step-reset", "#admin-setup"];
let code = ""; // the code that passed step 1
/* "This browser has signed in before": the page then opens on Sign in instead of the code. Not personal. */
const KNOWN = "fbs-has-account";
const remember = () => { try { localStorage.setItem(KNOWN, "1"); } catch { /* private browsing */ } };
const known = () => { try { return localStorage.getItem(KNOWN) === "1"; } catch { return false; } };

/* ---------- helpers ---------- */
function show(id) {
  for (const p of PANELS) $(p).hidden = p !== id;
  const first = $(id).querySelector("input");
  if (first) first.focus({preventScroll: true});
}

function setMsg(box, text) {
  box.textContent = text || "";
  box.hidden = !text;
}

/* tells screen readers about a change that isn't an error (errors are role=alert) */
function announce(text) {
  const live = $("#live");
  live.textContent = "";
  setTimeout(() => { live.textContent = text; }, 120);
}

function markInvalid(input, on) {
  if (on) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function clearInvalid(form) {
  for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
}

class ApiError extends Error {
  constructor(message, status, field) { super(message); this.status = status; this.field = field; }
}

async function post(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {"Content-Type": "application/json", "X-FBS": "1"},
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the site. Check your connection and try again.", 0);
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(data.error || "Something went wrong. Try again in a minute.", res.status, data.field);
  return data;
}

/* disables the form while a request runs; the submit button says what's happening */
function busy(form, on, label) {
  const btn = form.querySelector("button[type=submit]");
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; }
  else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  for (const el of form.querySelectorAll("button, input")) el.disabled = on;
  form.setAttribute("aria-busy", String(on));
}

const prettyCode = c => { const n = c.toUpperCase().replace(/[^A-Z0-9]/g, ""); return n.length === 8 ? n.slice(0, 4) + "-" + n.slice(4) : n; };

/* rules the server checks again; said here first so nobody waits for a round trip */
const USERNAME_OK = /^[A-Za-z0-9._-]{3,40}$/;
function checkNew(user, p1, p2, fail) {
  if (!USERNAME_OK.test(user.value.trim())) return fail(user, "Pick a username of 3 to 40 letters, numbers, dots, dashes or underscores.");
  if ([...p1.value].length < 10) return fail(p1, "Use at least 10 characters for the password.");
  if (p1.value !== p2.value) return fail(p2, "The two passwords don't match. Type the same password twice.");
  return true;
}

/* ---------- sign in (everyone) ---------- */
$("#sign-in").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, box = $("#msg-signin"), user = $("#username"), pass = $("#password");
  clearInvalid(form);
  if (!user.value.trim()) { setMsg(box, "Enter your username."); markInvalid(user, true); user.focus(); return; }
  if (!pass.value) { setMsg(box, "Enter your password."); markInvalid(pass, true); pass.focus(); return; }
  setMsg(box, "");
  busy(form, true, "Signing in…");
  try {
    const r = await post("/api/login", {username: user.value, password: pass.value});
    remember();
    location.replace(r.redirect || "/");
  } catch (err) {
    busy(form, false);
    setMsg(box, err.message);
    pass.value = "";
    pass.focus();
  }
});

function toCode() {
  setMsg($("#msg-code"), "");
  show("#step-code");
  $("#code").select();
}
$("#to-code").addEventListener("click", toCode);
$("#to-signin").addEventListener("click", () => { setMsg($("#msg-signin"), ""); show("#sign-in"); });
$("#change-code").addEventListener("click", toCode);
$("#change-code-2").addEventListener("click", toCode);

/* ---------- step 1: a code from the admin ---------- */
$("#step-code").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, input = $("#code"), box = $("#msg-code");
  const value = input.value.trim();
  clearInvalid(form);
  if (!value) { setMsg(box, "Enter your code."); markInvalid(input, true); input.focus(); return; }
  setMsg(box, "");
  busy(form, true, "Checking…");
  try {
    const r = await post("/api/access/check", {code: value});
    code = value;
    busy(form, false);
    if (r.kind === "reset") {
      $("#reset-name").textContent = r.name || "there";
      $("#reset-username").value = r.username || "";
      setMsg($("#msg-reset"), "");
      show("#step-reset");
      if (r.username) $("#reset-password").focus({preventScroll: true});
      announce("Your reset code works. Pick a new password.");
    } else {
      $("#code-echo").textContent = prettyCode(value);
      setMsg($("#msg-details"), "");
      show("#step-details");
      announce(`Code ${prettyCode(value)} works. Make your profile: your name, a username and a password.`);
    }
  } catch (err) {
    busy(form, false);
    setMsg(box, err.message);
    markInvalid(input, true);
    input.focus();
    input.select();
  }
});

/* the code was used, canceled or expired in the meantime: back to step 1 with the reason */
function codeGone(err) {
  show("#step-code");
  setMsg($("#msg-code"), err.message);
  markInvalid($("#code"), true);
}

/* ---------- step 2: make your profile ---------- */
$("#step-details").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, box = $("#msg-details"), name = $("#name");
  const user = $("#new-username"), p1 = $("#new-password"), p2 = $("#new-password2");
  clearInvalid(form);
  const fail = (input, text) => { setMsg(box, text); markInvalid(input, true); input.focus(); return false; };
  if (!name.value.trim()) return fail(name, "Enter your name.");
  if (!checkNew(user, p1, p2, fail)) return;
  setMsg(box, "");
  busy(form, true, "Saving…");
  try {
    const r = await post("/api/access/redeem", {code, name: name.value, username: user.value.trim(), password: p1.value});
    remember();
    location.replace(r.redirect || "/");
  } catch (err) {
    busy(form, false);
    if (err.field === "code") return codeGone(err);
    setMsg(box, err.message);
    const bad = {name, username: user, password: p1}[err.field];
    if (bad) { markInvalid(bad, true); bad.focus(); }
  }
});

/* ---------- step 2: pick a new password ---------- */
$("#step-reset").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, box = $("#msg-reset");
  const user = $("#reset-username"), p1 = $("#reset-password"), p2 = $("#reset-password2");
  clearInvalid(form);
  const fail = (input, text) => { setMsg(box, text); markInvalid(input, true); input.focus(); return false; };
  if (!checkNew(user, p1, p2, fail)) return;
  setMsg(box, "");
  busy(form, true, "Saving…");
  try {
    const r = await post("/api/access/reset", {code, username: user.value.trim(), password: p1.value});
    remember();
    location.replace(r.redirect || "/");
  } catch (err) {
    busy(form, false);
    if (err.field === "code") return codeGone(err);
    setMsg(box, err.message);
    const bad = {username: user, password: p1}[err.field];
    if (bad) { markInvalid(bad, true); bad.focus(); }
  }
});

/* ---------- admin setup / reset ---------- */
$("#admin-setup").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, box = $("#msg-setup");
  const sc = $("#setup-code"), user = $("#setup-username"), p1 = $("#setup-password"), p2 = $("#setup-password2");
  clearInvalid(form);
  const fail = (input, text) => { setMsg(box, text); markInvalid(input, true); input.focus(); };
  if (!sc.value.trim()) return fail(sc, "Enter the one-time setup code.");
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(user.value.trim())) return fail(user, "Pick a username of 3 to 40 letters, numbers, dots, dashes or underscores.");
  if ([...p1.value].length < 10) return fail(p1, "Use at least 10 characters for the password.");
  if (p1.value !== p2.value) return fail(p2, "The two passwords don't match. Type the same password twice.");
  setMsg(box, "");
  busy(form, true, "Saving…");
  try {
    const r = await post("/api/admin/setup", {setupCode: sc.value, username: user.value.trim(), password: p1.value});
    remember();
    location.replace(r.redirect || "/admin/");
  } catch (err) {
    busy(form, false);
    setMsg(box, err.message);
    // put the person back on the field the server named (the setup code unless said otherwise)
    const bad = {username: user, password: p1}[err.field] || sc;
    markInvalid(bad, true);
    bad.focus();
    if (bad === sc) sc.select();
  }
});

/* ---------- start ---------- */
$("#setup-foot").hidden = mode !== "setup";
$(".auth-card").classList.toggle("solo", mode !== "setup");
$("#to-setup").hidden = mode !== "admin";
if (mode === "setup") { document.title = "Admin setup · FBS Boise Store Map"; show("#admin-setup"); }
else if (mode === "admin") { document.title = "Admin sign-in · FBS Boise Store Map"; show("#sign-in"); }
else show(known() ? "#sign-in" : "#step-code");
})();
