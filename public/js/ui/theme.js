/* Theme: System (follows the device), Light or Dark. Saved on this device only (localStorage, try/catch:
 * private windows may block it). Applied as <html data-theme="light|dark">; tokens.css does the rest.
 * /assets/theme-boot.js applies the saved choice before the first paint on every page (same key, same metas);
 * this module changes it while the map is open and tells the views. */
const KEY = "fbs-theme";
const listeners = new Set();
const darkMq = matchMedia("(prefers-color-scheme: dark)");

export function getTheme() {
  try { const t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; }
}
export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
  // the browser bar: forced themes use their own colour; System keeps the light / dark pair from the page
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    if (!m.hasAttribute("data-content")) m.dataset.content = m.content; // the page's own light / dark pair
    m.content = t === "light" ? "#ffffff" : t === "dark" ? "#0f1a26" : m.dataset.content;
  }
}
export function setTheme(t) {
  try { if (t === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* not saved; still applied */ }
  applyTheme(t);
  for (const fn of listeners) fn(t);
}
/** Is the page dark right now (chosen, or following a dark device)? */
export const isDark = () => { const t = getTheme(); return t === "dark" || (t === "system" && darkMq.matches); };
/** Called when the theme or the device's colour scheme changes. */
export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
if (darkMq.addEventListener) darkMq.addEventListener("change", () => { for (const fn of listeners) fn(getTheme()); });
