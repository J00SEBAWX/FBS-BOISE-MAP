// FBS Boise Store Map: private, sign-in-only Worker.
// Every request runs through this file first (assets.run_worker_first), so no page, script, texture or
// store data is served to anyone without a valid session. Only the sign-in page and what it needs are public.
import { HttpError, json, text, redirect, notFound, secure, checkCsrf } from "./lib/http.js";
import { configured, loadSession, requireUser, requireAdmin } from "./lib/auth.js";
import { prune } from "./lib/ratelimit.js";
import * as ACCESS from "./routes/access.js";
import * as ACCOUNT from "./routes/account.js";
import * as ADMIN from "./routes/admin.js";
import * as MAPS from "./routes/maps.js";
import * as MASTER from "./routes/master.js";
import * as PROPOSALS from "./routes/proposals.js";

// ---------- what is public ----------
const SHORT = "public, max-age=300"; // sign-in page assets: short, so a deploy shows up quickly
const LONG = "public, max-age=86400";
const PRIVATE = "private, no-cache"; // signed-in assets: browser only, revalidated every time
const PUBLIC_FILES = new Map([
  ["/login.js", SHORT],
  ["/login.css", SHORT],
  ["/assets/base.css", SHORT],
  ["/favicon.svg", LONG],
  ["/robots.txt", LONG],
]);
const FONT_RE = /^\/assets\/fonts\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
// signed-in asset paths: plain segments only (no empty, dot-leading or encoded segments)
const SAFE_PATH = /^\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*(?:[A-Za-z0-9_-][A-Za-z0-9._-]*)?$/;
// The admin folder however it is named: /admin, /admin/..., and also /admin.html, /admin.htm, /admin. ...
// (the asset server answers /admin.html with admin/index.html). Any first segment that is "admin" before a
// dot or slash, in any case, is admin-only, so another name for the dashboard can't slip past the check.
const ADMIN_AREA = /^\/admin(?:[./]|$)/i;
// names of the dashboard page itself: an admin is sent to its one address, /admin/
const ADMIN_PAGE_ALIAS = /^\/admin(?:\.html?)?$/i;

function wantsHtml(request) {
  return (request.headers.get("Accept") || "").includes("text/html") || request.headers.get("Sec-Fetch-Dest") === "document";
}

// What a browser gets for a page that doesn't exist (or that this person can't see: a member at /admin/ gets
// exactly this, so they can't tell the dashboard is there). Only public styles, nothing inline (CSP).
const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>Page not found · FBS Boise Store Map</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/base.css">
  <link rel="stylesheet" href="/login.css">
</head>
<body class="auth">
<main class="auth-wrap">
  <section class="auth-card solo" aria-labelledby="nf-title">
    <header class="auth-head">
      <span class="logo" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><rect width="32" height="32" rx="7" fill="#c8102e"/><rect x="6" y="7" width="20" height="3" rx="1.5" fill="#fff"/><rect x="6" y="14.5" width="12" height="3" rx="1.5" fill="#fff"/><rect x="6" y="22" width="12" height="3" rx="1.5" fill="#fff"/></svg></span>
      <span class="eyebrow">FBS Boise &middot; Store Map</span>
    </header>
    <div class="panel">
      <h1 id="nf-title">This page doesn't exist.</h1>
      <p class="lead">The link may be mistyped or out of date.</p>
      <a class="btn primary wide" href="/">Open the store map</a>
    </div>
  </section>
</main>
</body>
</html>
`;

function notFoundPage() {
  return new Response(NOT_FOUND_HTML, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Serves a file from public/ through the assets binding, with our own caching rules. */
async function serveAsset(request, env, pathname, cacheControl) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  const res = await env.ASSETS.fetch(new Request(url.toString(), { method: "GET", headers: request.headers }));
  if (res.status === 404) return notFound();
  if (res.status >= 300 && res.status < 400 && res.status !== 304) {
    // canonical-URL redirects from the asset server (e.g. /index.html -> /): same site only
    const to = new URL(res.headers.get("Location") || "/", url);
    if (to.origin !== url.origin || !SAFE_PATH.test(to.pathname)) return notFound();
    return redirect(to.pathname);
  }
  const h = new Headers(res.headers);
  const type = h.get("Content-Type") || "";
  h.set("Cache-Control", type.includes("text/html") ? "no-store" : cacheControl);
  return new Response(res.body, { status: res.status, headers: h });
}

// ---------- API ----------
async function health(env) {
  let db = false;
  let accessCodesTable = false;
  try {
    db = (await env.DB.prepare("SELECT 1 AS one").first())?.one === 1;
    accessCodesTable = !!(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'access_codes'").first());
  } catch {
    /* reported as false */
  }
  return json({ ok: true, db, configured: configured(env), accessCodesTable });
}

async function api(request, env, url, ctx) {
  const path = url.pathname;
  const m = request.method;
  checkCsrf(request);

  // ----- public -----
  if (path === "/api/health" && (m === "GET" || m === "HEAD")) return health(env);
  if (m === "POST" && path === "/api/access/check") return ACCESS.check(request, env);
  if (m === "POST" && path === "/api/access/redeem") return ACCESS.redeem(request, env);
  if (m === "POST" && path === "/api/admin/login") return ACCOUNT.adminLogin(request, env, ctx);
  if (m === "POST" && path === "/api/admin/setup") return ACCOUNT.adminSetup(request, env);

  // ----- any session -----
  const sess = await loadSession(env, request);
  if (m === "POST" && path === "/api/logout") return ACCOUNT.logout(env, sess);
  if (m === "GET" && path === "/api/me") return ACCOUNT.me(sess);
  const me = requireUser(sess);

  // ----- store maps, the master map, proposals (each handler checks who may do what) -----
  const v3 = await mapsApi(request, env, url, sess, me);
  if (v3) return v3;

  // ----- admin only -----
  if (path.startsWith("/api/admin/")) {
    const admin = requireAdmin(sess);
    const p = path.slice("/api/admin".length);
    if (m === "GET" && p === "/overview") return ADMIN.overview(env);
    if (m === "GET" && p === "/settings") return MASTER.getAdminSettings(env);
    if (m === "PUT" && p === "/settings") return MASTER.putAdminSettings(request, env, admin);
    if (m === "POST" && p === "/codes/new-set") return ADMIN.newSet(env, admin);
    if (m === "POST" && p === "/password") return ACCOUNT.changePassword(request, env, sess);
    const pm = p.match(/^\/people\/([^/]+)$/);
    if (pm && m === "DELETE") return ADMIN.removePerson(env, admin, pm[1]);
  }
  throw new HttpError(404, "Not found.");
}

/** The maps / master / proposals API for a signed-in person, or null when the path isn't one of these. */
async function mapsApi(request, env, url, sess, me) {
  const path = url.pathname;
  const m = request.method;
  if (path === "/api/catalog") return m === "GET" ? MASTER.catalog() : null;
  if (path === "/api/advisor-config") {
    if (m === "GET") return MASTER.getAdvisorConfig(env);
    if (m === "PUT") return MASTER.putAdvisorConfig(request, env, sess);
    return null;
  }
  if (path === "/api/master") {
    if (m === "GET") return MASTER.getMaster(env);
    if (m === "PUT") return MASTER.putMaster(request, env, sess);
    return null;
  }
  if (m === "POST" && path === "/api/master/apply") return MASTER.applyToMaster(request, env, sess);
  if (m === "POST" && path === "/api/master/restore") return MASTER.restore(request, env, sess);
  if (m === "GET" && path === "/api/master/history") return MASTER.history(env, sess);
  let r = path.match(/^\/api\/master\/history\/([^/]+)$/);
  if (r && m === "GET") return MASTER.historyVersion(env, sess, r[1]);

  if (path === "/api/maps") {
    if (m === "GET") return MAPS.list(env, me);
    if (m === "POST") return MAPS.create(request, env, me);
    return null;
  }
  if ((r = path.match(/^\/api\/maps\/([^/]+)$/))) {
    if (m === "GET") return MAPS.get(env, me, r[1]);
    if (m === "PUT") return MAPS.update(request, env, me, r[1]);
    if (m === "DELETE") return MAPS.remove(env, me, r[1]);
    return null;
  }
  if ((r = path.match(/^\/api\/maps\/([^/]+)\/submit$/)) && m === "POST") return PROPOSALS.submit(request, env, me, r[1]);

  if (path === "/api/proposals" && m === "GET") return PROPOSALS.list(env, me, url);
  if ((r = path.match(/^\/api\/proposals\/([^/]+)$/)) && m === "GET") return PROPOSALS.get(env, me, r[1]);
  if ((r = path.match(/^\/api\/proposals\/([^/]+)\/withdraw$/)) && m === "POST") return PROPOSALS.withdraw(env, me, r[1]);
  if ((r = path.match(/^\/api\/proposals\/([^/]+)\/decision$/)) && m === "POST") return PROPOSALS.decide(request, env, sess, r[1]);
  return null;
}

// ---------- pages and files ----------
async function loginPage(request, env, url) {
  // already signed in: go straight on (unless asking for the admin form or a setup/reset)
  if (configured(env)) {
    const sess = await loadSession(env, request);
    const q = url.searchParams;
    if (sess && !q.has("setup")) {
      if (sess.user.role === "admin") return redirect("/admin/");
      if (!q.has("admin")) return redirect("/");
    }
  }
  return serveAsset(request, env, "/login", "no-store");
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return api(request, env, url, ctx);
  const res = await files(request, env, url);
  return res.status === 404 && wantsHtml(request) ? notFoundPage() : res;
}

async function files(request, env, url) {
  const path = url.pathname;
  if (request.method !== "GET" && request.method !== "HEAD") return text("Method not allowed", 405, { Allow: "GET, HEAD" });

  // ----- public: the sign-in page and what it needs -----
  if (path === "/login") return loginPage(request, env, url);
  if (path === "/login.html") return redirect("/login" + url.search);
  const publicCache = PUBLIC_FILES.get(path) || (FONT_RE.test(path) ? LONG : null);
  if (publicCache) return serveAsset(request, env, path, publicCache);

  // ----- everything else needs a session -----
  const sess = await loadSession(env, request);
  if (ADMIN_AREA.test(path)) {
    if (!sess) return redirect("/login?admin=1");
    if (sess.user.role !== "admin") return notFound();
    if (!path.startsWith("/admin/")) return ADMIN_PAGE_ALIAS.test(path) ? redirect("/admin/") : notFound();
    if (!SAFE_PATH.test(path)) return notFound();
    return serveAsset(request, env, path, PRIVATE);
  }
  if (!sess) return wantsHtml(request) ? redirect("/login") : text("Sign in required", 401);
  if (!SAFE_PATH.test(path)) return notFound();
  return serveAsset(request, env, path, PRIVATE);
}

// Housekeeping runs off normal traffic (at most every 6 hours per Worker instance), so no cron trigger is needed.
// Expired sessions and codes are already refused on every request; this only clears old rows.
let lastPrune = 0;
function maybePrune(env, ctx) {
  const now = Date.now();
  if (now - lastPrune < 6 * 3600000) return;
  lastPrune = now;
  ctx.waitUntil(prune(env.DB).catch(() => {}));
}

export default {
  async fetch(request, env, ctx) {
    let res;
    try {
      maybePrune(env, ctx);
      res = await route(request, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message, ...(e.extra || {}) }, e.status);
      else if (/no such table/i.test(String(e && e.message))) {
        // a database without the newest migration: fail closed, like missing secrets
        console.error("database not migrated");
        res = json({ error: "The site isn't set up yet." }, 503);
      } else {
        console.error("unhandled error:", e && e.message ? e.message : String(e));
        res = json({ error: "Something went wrong on the server. Try again in a minute." }, 500);
      }
    }
    res = secure(res);
    if (request.method === "HEAD") res = new Response(null, { status: res.status, headers: res.headers });
    return res;
  },
};
