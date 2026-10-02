// Minimal API client with a cookie jar for the integration tests.
export class Client {
  constructor(base) {
    this.base = base;
    this.cookie = null;
  }
  async req(method, path, body, headers = {}) {
    const h = { "X-FBS": "1", Origin: this.base, ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(this.base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    const sc = res.headers.get("set-cookie");
    if (sc) {
      const m = sc.match(/__Host-fbs_s=([^;]*)/);
      if (m) this.cookie = m[1] ? `__Host-fbs_s=${m[1]}` : null;
    }
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }
  get(p, headers) {
    return this.req("GET", p, undefined, headers);
  }
  post(p, b = {}, headers) {
    return this.req("POST", p, b, headers);
  }
  put(p, b, headers) {
    return this.req("PUT", p, b, headers);
  }
  del(p, headers) {
    return this.req("DELETE", p, undefined, headers);
  }
}
