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

export function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

export function redirect(location, status = 302, headers = {}) {
  return new Response(null, { status, headers: { Location: location, "Cache-Control": "no-store", ...headers } });
}

export function notFound() {
  return text("Not found", 404);
}

// One policy for every response. The map needs data:/blob: images (canvas textures); nothing inline is allowed.
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
 * plus a same-origin Origin header and Sec-Fetch-Site when the browser sends them.
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

/**
 * Reads a JSON object body of at most maxBytes (UTF-8). The size is checked before anything is parsed: first the
 * Content-Length, then while the body streams in (a chunked body that grows past the limit is cut off at once).
 */
export async function readJson(request, maxBytes = 16 * 1024) {
  const tooBig = () => new HttpError(413, "That's too much data.");
  const len = Number(request.headers.get("Content-Length") || "0");
  if (len > maxBytes) throw tooBig();
  let body = "";
  if (request.body) {
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* already closed */
        }
        throw tooBig();
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
    body = new TextDecoder().decode(buf);
  }
  if (!body) return {};
  try {
    const v = JSON.parse(body);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("bad");
    return v;
  } catch {
    throw new HttpError(400, "The request wasn't valid JSON.");
  }
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";
}

/** The client's address as used for per-IP rate limits (see ipBucket). */
export function rateIp(request) {
  return ipBucket(clientIp(request));
}

/**
 * Per-IP rate limits key on the whole IPv4 address, but on the /64 network of an IPv6 address: one home
 * or server is normally given a whole /64, so keying on single IPv6 addresses would give it endless tries.
 * "2001:db8:1:2::5" -> "2001:db8:1:2::/64"; "::ffff:10.0.0.1" -> "10.0.0.1". Anything unparseable is used as is.
 */
export function ipBucket(ip) {
  let s = String(ip || "").trim().toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(":")) return s;
  const h = ipv6Hextets(s);
  if (!h) return s;
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return [h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255].join(".");
  return h.slice(0, 4).map((x) => x.toString(16)).join(":") + "::/64";
}

/** "2001:db8::1" -> [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1] (also with a dotted IPv4 tail), or null if it isn't IPv6. */
function ipv6Hextets(s) {
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parts = halves.map((x) => (x ? x.split(":") : []));
  const last = parts[parts.length - 1];
  const tail = last[last.length - 1];
  if (tail && tail.includes(".")) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(tail);
    if (!m || m.slice(1).some((n) => Number(n) > 255)) return null;
    last.splice(-1, 1, ((Number(m[1]) << 8) | Number(m[2])).toString(16), ((Number(m[3]) << 8) | Number(m[4])).toString(16));
  }
  const given = parts.reduce((n, p) => n + p.length, 0);
  if (halves.length === 2 ? given > 7 : given !== 8) return null;
  const all = halves.length === 2 ? [...parts[0], ...Array(8 - given).fill("0"), ...parts[1]] : parts[0];
  if (!all.every((x) => /^[0-9a-f]{1,4}$/.test(x))) return null;
  return all.map((x) => parseInt(x, 16));
}
