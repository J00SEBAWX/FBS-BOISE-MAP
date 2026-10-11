/* Account control in the map's header: who is signed in (initials avatar), the admin dashboard and admin guide (admins only),
 * the planning guide and the Nerdy Documents (everyone),
 * the theme (System / Light / Dark) and Sign out.
 * A menu button: Enter, Space or Down opens it, the arrow keys move, Esc closes.
 * Members are asked before signing out (they need their username and password, or a reset code, to come back).
 * The session is checked again whenever the tab comes back into view (and every few minutes while it's
 * visible), so someone the admin removed doesn't keep an open map. */
import {getTheme, setTheme} from "./ui/theme.js";
import {focusEl} from "./ui/dom.js";
import {clearAllDrafts} from "./core/drafts.js";

export function initAccount() {
  const box = document.getElementById("acct"), btn = document.getElementById("acctBtn"), menu = document.getElementById("acctMenu");
  const initialsEl = document.getElementById("acctInitials"), fullEl = document.getElementById("acctFull");
  const adminItem = document.getElementById("acctAdmin"), adminGuide = document.getElementById("acctAdminGuide"), outItem = document.getElementById("acctOut");
  const dlg = document.getElementById("signout");
  if (!box || !btn || !menu) return;
  let role = "member";

  const items = () => [...menu.querySelectorAll("[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]")].filter(el => !el.hidden);
  const isOpen = () => !menu.hidden;
  function open(focus) {
    syncTheme();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    const list = items(), el = focus === "last" ? list[list.length - 1] : list[0];
    focusEl(el);
  }
  function close(refocus) {
    if (!isOpen()) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (refocus) focusEl(btn, {reveal: false});
  }
  btn.addEventListener("click", () => { if (isOpen()) close(false); else open("first"); });
  // the map listens for keys on window; keys used here stop at this box
  btn.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); open(e.key === "ArrowUp" ? "last" : "first"); }
  });
  menu.addEventListener("keydown", e => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); focusEl(list[(i + 1) % list.length]); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusEl(list[(i - 1 + list.length) % list.length]); }
    else if (e.key === "Home") { e.preventDefault(); focusEl(list[0]); }
    else if (e.key === "End") { e.preventDefault(); focusEl(list[list.length - 1]); }
    else if (e.key === "Tab") { close(false); return; }
    else if (e.key === " " && document.activeElement && document.activeElement.tagName === "A") { e.preventDefault(); document.activeElement.click(); }
    e.stopPropagation();
  });
  // close when clicking or tapping anywhere else, or when focus leaves the control
  document.addEventListener("pointerdown", e => { if (isOpen() && !box.contains(e.target)) close(false); }, true);
  box.addEventListener("focusout", e => { if (isOpen() && e.relatedTarget && !box.contains(e.relatedTarget)) close(false); });

  /* ---------- theme ---------- */
  function syncTheme() {
    const t = getTheme();
    for (const b of menu.querySelectorAll("[data-theme-choice]")) b.setAttribute("aria-checked", String(b.dataset.themeChoice === t));
  }
  for (const b of menu.querySelectorAll("[data-theme-choice]")) b.addEventListener("click", () => { setTheme(b.dataset.themeChoice); syncTheme(); });

  /* ---------- signing out ---------- */
  async function signOut() {
    outItem.disabled = true;
    try { await fetch("/api/logout", {method: "POST", credentials: "same-origin", cache: "no-store", headers: {"X-FBS": "1"}}); }
    catch { /* the cookie may still be cleared; go to the sign-in page either way */ }
    // unsaved drafts hold this person's map edits: never leave them for the next person on this device
    try { clearAllDrafts(localStorage); } catch { /* no storage */ }
    location.replace("/login");
  }
  // members: ask first (in a modal, so the map's keys don't fire behind it)
  function askSignOut() {
    if (!dlg || typeof dlg.showModal !== "function") {
      if (window.confirm("Sign out? To get back in, sign in with your username and password.")) signOut();
      return;
    }
    dlg.returnValue = "";
    dlg.showModal();
    focusEl(document.getElementById("signoutCancel"), {reveal: false});
  }
  if (dlg) {
    dlg.addEventListener("keydown", e => e.stopPropagation());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close("cancel"); }); // click on the backdrop
    dlg.addEventListener("close", () => { if (dlg.returnValue === "ok") signOut(); else focusEl(btn, {reveal: false}); });
  }
  outItem.addEventListener("click", () => { close(false); if (role === "admin") signOut(); else askSignOut(); });

  /* ---------- who is signed in (and are they still?) ---------- */
  let checking = false;
  function check(first) {
    if (checking) return;
    checking = true;
    fetch("/api/me", {credentials: "same-origin", cache: "no-store"})
      .then(r => {
        if (r.status === 401) { try { clearAllDrafts(localStorage); } catch { /* no storage */ } location.replace("/login"); return null; } // signed out or removed
        return r.ok ? r.json() : null;
      })
      .then(m => {
        if (!first) return;
        if (!m || typeof m.name !== "string") return;
        role = m.role === "admin" ? "admin" : "member";
        const parts = m.name.trim().split(/\s+/);
        initialsEl.textContent = ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
        fullEl.textContent = m.name;
        btn.setAttribute("aria-label", `Account: ${m.name}`);
        btn.title = `Signed in as ${m.name}`;
        adminItem.hidden = role !== "admin";
        if (adminGuide) adminGuide.hidden = role !== "admin";
        box.hidden = false;
      })
      .catch(() => { /* offline: the map works without it; try again next time */ })
      .finally(() => { checking = false; });
  }
  check(true);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(false); });
  window.addEventListener("pageshow", e => { if (e.persisted) check(false); }); // back/forward cache
  setInterval(() => { if (!document.hidden) check(false); }, 5 * 60000);
}
