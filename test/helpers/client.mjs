// Minimal HTTP client with a one-cookie jar for the integration tests.
// `ip` sets CF-Connecting-IP so rate limits can be tested per client (Cloudflare overwrites it in production).
export class Client {
  constructor(base, { ip } = {}) {
    this.base = base;
    this.cookie = null;
    this.ip = ip || null;
  }
  async req(method, path, body, headers = {}) {
    const h = { "X-FBS": "1", Origin: this.base, ...headers };
    if (this.ip) h["CF-Connecting-IP"] = this.ip;
    if (this.cookie) h.Cookie = this.cookie;
    if (body !== undefined) h["Content-Type"] = "application/json";
    for (const [k, v] of Object.entries(h)) if (v === null) delete h[k];
    const res = await fetch(this.base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    const sc = res.headers.get("set-cookie");
    if (sc) {
      const m = sc.match(/__Host-fbs_s=([^;]*)/);
      if (m) this.cookie = m[1] ? `__Host-fbs_s=${m[1]}` : null;
    }
    let data = null;
    const text = method === "HEAD" ? "" : await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers, text };
  }
  get(p, headers) {
    return this.req("GET", p, undefined, headers);
  }
  head(p, headers) {
    return this.req("HEAD", p, undefined, headers);
  }
  post(p, b = {}, headers) {
    return this.req("POST", p, b, headers);
  }
  del(p, headers) {
    return this.req("DELETE", p, undefined, headers);
  }
}
