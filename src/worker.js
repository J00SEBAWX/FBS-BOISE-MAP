// FBS Boise store planner: private, sign-in-only Worker.
// Every request runs through this file first (assets.run_worker_first), so no page,
// script or store data is served to anyone without a valid session.
import { HttpError, json, redirect, notFound, secure, checkCsrf } from "./lib/http.js";
import { loadSession, requireUser, requireAdmin } from "./lib/auth.js";
import { prune } from "./lib/ratelimit.js";
import * as A from "./routes/auth.js";
import * as B from "./routes/builds.js";
import * as ADM from "./routes/admin.js";
import { meshyAllowed, handleGenerate, handleStatus } from "./meshy.js";

const PUBLIC_FILES = new Set(["/login", "/login.js", "/login.css", "/assets/base.css", "/favicon.svg", "/robots.txt"]);
const PUBLIC_PREFIXES = ["/assets/fonts/"];

function wantsHtml(request) {
  return (request.headers.get("Accept") || "").includes("text/html");
}

async function serveAsset(request, env, pathname, cacheControl) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  const res = await env.ASSETS.fetch(new Request(url.toString(), { method: "GET", headers: request.headers }));
  if (res.status === 404) return notFound();
  const h = new Headers(res.headers);
  const type = h.get("Content-Type") || "";
  h.set("Cache-Control", type.includes("text/html") ? "no-store" : cacheControl);
  return new Response(request.method === "HEAD" ? null : res.body, { status: res.status, headers: h });
}

async function api(request, env, ctx, url) {
  const path = url.pathname;
  const m = request.method;
  const externalMeshy = path.startsWith("/api/meshy/") && request.headers.has("X-Access-Code");
  if (!externalMeshy) checkCsrf(request);

  // ----- public sign-in endpoints -----
  if (m === "POST" && path === "/api/auth/request") return A.requestAccess(request, env, ctx);
  if (m === "POST" && path === "/api/auth/verify") return A.verifyCode(request, env);
  if (m === "POST" && path === "/api/auth/setup") return A.adminSetup(request, env);
  if (m === "POST" && path === "/api/auth/admin-code") return A.adminCode(request, env, ctx);
  if (m === "POST" && path === "/api/auth/recover") return A.recover(request, env);

  const sess = await loadSession(env, request);
  if (m === "POST" && path === "/api/auth/logout") return A.logout(env, sess);
  if (m === "GET" && path === "/api/auth/me") return A.me(sess);

  // ----- Meshy proxy (admin or legacy access code) -----
  if (path.startsWith("/api/meshy/")) {
    if (!meshyAllowed(request, env, sess)) throw new HttpError(401, "Not allowed.");
    if (m === "POST" && path === "/api/meshy/generate") return handleGenerate(request, env);
    const sm = path.match(/^\/api\/meshy\/status\/([^/]+)$/);
    if (m === "GET" && sm) return handleStatus(env, decodeURIComponent(sm[1]));
    throw new HttpError(404, "Not found.");
  }

  // ----- signed-in team members -----
  const user = requireUser(sess);
  if (m === "GET" && path === "/api/bootstrap") return B.bootstrap(env, user);
  if (path === "/api/builds") {
    if (m === "GET") return json({ builds: await B.listOwn(env, user), shared: await B.listShared(env, user) });
    if (m === "POST") return B.createBuild(request, env, user);
  }
  let mm = path.match(/^\/api\/builds\/([^/]+)$/);
  if (mm) {
    if (m === "GET") return B.getBuild(env, user, mm[1]);
    if (m === "PUT") return B.updateBuild(request, env, user, mm[1]);
    if (m === "DELETE") return B.deleteBuild(env, user, mm[1]);
  }
  mm = path.match(/^\/api\/builds\/([^/]+)\/(submit|duplicate)$/);
  if (mm && m === "POST") {
    if (mm[2] === "submit") return B.submitBuild(request, env, user, mm[1], ctx);
    return B.duplicateBuild(env, user, mm[1]);
  }

  // ----- AJ only -----
  if (path.startsWith("/api/admin/")) {
    const admin = requireAdmin(sess);
    const p = path.slice("/api/admin".length);
    if (m === "GET" && p === "/overview") return ADM.overview(env);
    if (m === "GET" && p === "/users") return ADM.listUsers(env);
    if (m === "GET" && p === "/builds") return ADM.listAllBuilds(env, url);
    if (m === "GET" && p === "/grants") return ADM.listGrants(env);
    if (m === "POST" && p === "/grants") return ADM.createGrant(request, env, admin);
    if (m === "GET" && p === "/audit") return ADM.listAudit(env, url);
    if (m === "POST" && p === "/test-alert") return ADM.testAlert(request, env, admin);
    if (m === "POST" && p === "/recovery-codes") return ADM.newRecoveryCodes(env, admin);
    if (m === "POST" && p === "/sign-out-others") return ADM.signOutOthers(env, admin, sess);
    let am = p.match(/^\/users\/([^/]+)\/(approve|code|deny|revoke|restore)$/);
    if (am && m === "POST") {
      const [, id, act] = am;
      if (act === "approve") return ADM.approveUser(request, env, admin, id);
      if (act === "code") return ADM.newCode(request, env, admin, id);
      if (act === "deny") return ADM.denyUser(env, admin, id);
      if (act === "revoke") return ADM.revokeUser(env, admin, id);
      return ADM.restoreUser(env, admin, id);
    }
    am = p.match(/^\/users\/([^/]+)$/);
    if (am && m === "DELETE") return ADM.deleteUser(env, admin, am[1]);
    am = p.match(/^\/builds\/([^/]+)\/review$/);
    if (am && m === "POST") return ADM.reviewBuild(request, env, admin, am[1]);
    am = p.match(/^\/grants\/([^/]+)$/);
    if (am && m === "DELETE") return ADM.revokeGrant(env, admin, am[1]);
  }
  throw new HttpError(404, "Not found.");
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith("/api/")) return api(request, env, ctx, url);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  if (PUBLIC_FILES.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    if (path === "/login") {
      const sess = await loadSession(env, request);
      if (sess) return redirect(sess.user.role === "admin" ? "/admin/" : "/app/");
    }
    return serveAsset(request, env, path, "public, max-age=3600");
  }
  if (path === "/login.html") return redirect("/login");

  const sess = await loadSession(env, request);
  if (path === "/") return redirect(sess ? (sess.user.role === "admin" ? "/admin/" : "/app/") : "/login");
  if (path === "/app" || path === "/admin") return redirect(path + "/");

  if (path.startsWith("/app/") || path.startsWith("/vendor/")) {
    if (!sess) return wantsHtml(request) ? redirect("/login") : new Response("Sign in required", { status: 401 });
    return serveAsset(request, env, path, "private, no-cache");
  }
  if (path.startsWith("/admin/")) {
    if (!sess || sess.user.role !== "admin") return notFound();
    return serveAsset(request, env, path, "private, no-cache");
  }
  return notFound();
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
    try {
      maybePrune(env, ctx);
      return secure(await route(request, env, ctx));
    } catch (e) {
      if (e instanceof HttpError) return secure(json({ error: e.message, ...(e.extra || {}) }, e.status));
      console.error("unhandled error:", e && e.message ? e.message : String(e));
      return secure(json({ error: "Something went wrong on the server. Try again in a minute." }, 500));
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(prune(env.DB));
  },
};
