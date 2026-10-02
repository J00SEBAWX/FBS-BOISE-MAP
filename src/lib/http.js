// HTTP helpers: JSON responses, errors, cookies, security headers, CSRF checks.

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const SESSION_COOKIE = "__Host-fbs_s";

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function redirect(location, status = 302, headers = {}) {
  return new Response(null, { status, headers: { Location: location, "Cache-Control": "no-store", ...headers } });
}

export function notFound() {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
].join("; ");

/** Adds security headers to every response leaving the Worker. */
export function secure(res) {
  const h = new Headers(res.headers);
  h.set("Content-Security-Policy", CSP);
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export function sessionCookie(token, maxAgeSec) {
  return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

/**
 * State-changing requests must come from our own pages:
 * a custom header (forces a CORS preflight cross-site, which we never answer)
 * plus a same-origin Origin header when the browser sends one.
 */
export function checkCsrf(request) {
  const m = request.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return;
  if (request.headers.get("X-FBS") !== "1") throw new HttpError(403, "Request blocked.");
  const origin = request.headers.get("Origin");
  if (origin) {
    const self = new URL(request.url).origin;
    if (origin !== self) throw new HttpError(403, "Request blocked.");
  }
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Request blocked.");
}

export async function readJson(request, maxBytes = 64 * 1024) {
  const len = Number(request.headers.get("Content-Length") || "0");
  if (len > maxBytes) throw new HttpError(413, "That's too much data to save at once.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "That's too much data to save at once.");
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("bad");
    return v;
  } catch {
    throw new HttpError(400, "The request wasn't valid JSON.");
  }
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";
}
