/* Account control in the map's header: who is signed in, the admin dashboard (admins only) and Sign out.
 * A menu button: Enter, Space or Down opens it, the arrow keys move, Esc closes.
 * Members are asked before signing out (their code is used up, so they'd need a new one to come back).
 * The session is checked again whenever the tab comes back into view (and every few minutes while it's
 * visible), so someone the admin removed doesn't keep an open map. */
(function () {
"use strict";

const box = document.getElementById("acct"), btn = document.getElementById("acctBtn"), menu = document.getElementById("acctMenu");
const nameEl = document.getElementById("acctName"), fullEl = document.getElementById("acctFull");
const adminItem = document.getElementById("acctAdmin"), outItem = document.getElementById("acctOut");
const dlg = document.getElementById("signout");
if (!box || !btn || !menu) return;
let role = "member";

const items = () => [...menu.querySelectorAll("[role=menuitem]")].filter(el => !el.hidden);
const isOpen = () => !menu.hidden;

function open(focus) {
  menu.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  const list = items();
  const el = focus === "last" ? list[list.length - 1] : list[0];
  if (el) el.focus();
}

function close(refocus) {
  if (!isOpen()) return;
  menu.hidden = true;
  btn.setAttribute("aria-expanded", "false");
  if (refocus) btn.focus();
}

btn.addEventListener("click", () => { if (isOpen()) close(false); else open("first"); });

// the map listens for keys on window (walking, M, ?); keys used here stop at this box
btn.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); e.stopPropagation();
    open(e.key === "ArrowUp" ? "last" : "first");
  }
});
menu.addEventListener("keydown", e => {
  const list = items(), i = list.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); close(true); }
  else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
  else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
  else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
  else if (e.key === "Tab") { close(false); return; }
  else if (e.key === " " && document.activeElement && document.activeElement.tagName === "A") { e.preventDefault(); document.activeElement.click(); }
  e.stopPropagation();
});

// close when clicking or tapping anywhere else, or when focus leaves the control
document.addEventListener("pointerdown", e => { if (isOpen() && !box.contains(e.target)) close(false); }, true);
box.addEventListener("focusout", e => { if (isOpen() && e.relatedTarget && !box.contains(e.relatedTarget)) close(false); });

/* ---------- signing out ---------- */
async function signOut() {
  outItem.disabled = true;
  try {
    await fetch("/api/logout", {method: "POST", credentials: "same-origin", cache: "no-store", headers: {"X-FBS": "1"}});
  } catch { /* the cookie may still be cleared; go to the sign-in page either way */ }
  location.replace("/login");
}

// members: ask first (in a modal, so the map's keys don't fire behind it)
function askSignOut() {
  if (!dlg || typeof dlg.showModal !== "function") {
    if (window.confirm("Sign out? You'll need a new code from the person who sent you the link to get back in.")) signOut();
    return;
  }
  dlg.returnValue = "";
  dlg.showModal();
  document.getElementById("signoutCancel").focus();
}
if (dlg) {
  dlg.addEventListener("keydown", e => e.stopPropagation());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close("cancel"); }); // click on the backdrop
  dlg.addEventListener("close", () => { if (dlg.returnValue === "ok") signOut(); else btn.focus(); });
}

outItem.addEventListener("click", () => {
  close(false);
  if (role === "admin") signOut();
  else askSignOut();
});

/* ---------- who is signed in (and are they still?) ---------- */
let checking = false;
function check(first) {
  if (checking) return;
  checking = true;
  fetch("/api/me", {credentials: "same-origin", cache: "no-store"})
    .then(r => {
      if (r.status === 401) { location.replace("/login"); return null; } // signed out or removed
      return r.ok ? r.json() : null;
    })
    .then(me => {
      if (!first || !me || typeof me.name !== "string") return;
      role = me.role === "admin" ? "admin" : "member";
      nameEl.textContent = me.name.split(" ")[0] || me.name;
      fullEl.textContent = me.name;
      btn.setAttribute("aria-label", `Account: ${me.name}`);
      btn.title = `Signed in as ${me.name}`;
      adminItem.hidden = role !== "admin";
      box.hidden = false;
    })
    .catch(() => { /* offline: the map works without it; try again next time */ })
    .finally(() => { checking = false; });
}
check(true);
document.addEventListener("visibilitychange", () => { if (!document.hidden) check(false); });
window.addEventListener("pageshow", e => { if (e.persisted) check(false); }); // back/forward cache
setInterval(() => { if (!document.hidden) check(false); }, 5 * 60000);
})();
