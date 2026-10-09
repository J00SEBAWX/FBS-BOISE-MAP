/* Sign-in page: access code -> name and phone for visitors; username + password for the admin;
 * one-time setup code for setting or resetting the admin password. Talks only to this site's /api. */
(function () {
"use strict";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const mode = params.has("setup") ? "setup" : params.has("admin") ? "admin" : "code";
const PANELS = ["#step-code", "#step-details", "#admin-login", "#admin-setup"];
let code = ""; // the access code that passed step 1

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

/* ---------- step 1: access code ---------- */
$("#step-code").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, input = $("#code"), box = $("#msg-code");
  const value = input.value.trim();
  clearInvalid(form);
  if (!value) { setMsg(box, "Enter your access code."); markInvalid(input, true); input.focus(); return; }
  setMsg(box, "");
  busy(form, true, "Checking…");
  try {
    await post("/api/access/check", {code: value});
    code = value;
    $("#code-echo").textContent = prettyCode(value);
    setMsg($("#msg-details"), "");
    busy(form, false);
    show("#step-details");
    announce(`Code ${prettyCode(value)} works. One more step: enter your name and mobile phone.`);
  } catch (err) {
    busy(form, false);
    setMsg(box, err.message);
    markInvalid(input, true);
    input.focus();
    input.select();
  }
});

$("#change-code").addEventListener("click", () => {
  setMsg($("#msg-code"), "");
  show("#step-code");
  $("#code").select();
});

/* ---------- step 2: name and phone ---------- */
$("#step-details").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, box = $("#msg-details"), name = $("#name"), phone = $("#phone");
  clearInvalid(form);
  if (!name.value.trim()) { setMsg(box, "Enter your name."); markInvalid(name, true); name.focus(); return; }
  if (!phone.value.trim()) { setMsg(box, "Enter your mobile number."); markInvalid(phone, true); phone.focus(); return; }
  setMsg(box, "");
  busy(form, true, "Opening…");
  try {
    const r = await post("/api/access/redeem", {code, name: name.value, phone: phone.value});
    location.replace(r.redirect || "/");
  } catch (err) {
    busy(form, false);
    if (err.field === "code") { // the code was used or canceled in the meantime
      show("#step-code");
      setMsg($("#msg-code"), err.message);
      markInvalid($("#code"), true);
      return;
    }
    setMsg(box, err.message);
    const bad = err.field === "name" ? name : err.field === "phone" ? phone : null;
    if (bad) { markInvalid(bad, true); bad.focus(); }
  }
});

/* ---------- admin sign-in ---------- */
$("#admin-login").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, box = $("#msg-admin"), user = $("#username"), pass = $("#password");
  clearInvalid(form);
  if (!user.value.trim()) { setMsg(box, "Enter your username."); markInvalid(user, true); user.focus(); return; }
  if (!pass.value) { setMsg(box, "Enter your password."); markInvalid(pass, true); pass.focus(); return; }
  setMsg(box, "");
  busy(form, true, "Signing in…");
  try {
    const r = await post("/api/admin/login", {username: user.value, password: pass.value});
    location.replace(r.redirect || "/admin/");
  } catch (err) {
    busy(form, false);
    setMsg(box, err.message);
    pass.value = "";
    pass.focus();
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
$("#to-admin").hidden = mode !== "code";
$("#to-code").hidden = mode !== "admin";
$("#to-login").hidden = mode !== "setup";
if (mode === "setup") { document.title = "Admin setup · FBS Boise Store Map"; show("#admin-setup"); }
else if (mode === "admin") { document.title = "Admin sign-in · FBS Boise Store Map"; show("#admin-login"); }
else show("#step-code");
})();
