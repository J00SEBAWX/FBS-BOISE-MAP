/* FBS Boise Store Map: applies the theme chosen in the map's account menu (System / Light / Dark, saved on this
 * device only) before the page is drawn, so a dark choice never flashes light first. Loaded in <head>, right
 * after the theme-color metas, on every page: the map, the sign-in page, the admin dashboard and the 404 page.
 * The map's js/ui/theme.js does the same thing when the choice changes. A plain script (no module): it must
 * run before the first paint. */
(function () {
  "use strict";
  var t = null;
  try { t = localStorage.getItem("fbs-theme"); } catch (e) { /* storage blocked: follow the device */ }
  if (t !== "light" && t !== "dark") return;
  document.documentElement.setAttribute("data-theme", t);
  // the browser bar: a chosen theme uses its own colour on both metas (the page's light / dark pair is kept
  // in data-content for going back to System)
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) {
    if (!metas[i].hasAttribute("data-content")) metas[i].setAttribute("data-content", metas[i].getAttribute("content"));
    metas[i].setAttribute("content", t === "light" ? "#ffffff" : "#0f1a26");
  }
})();
