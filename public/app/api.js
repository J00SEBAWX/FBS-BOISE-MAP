// Same-origin JSON calls. Every request carries the X-FBS header the server's CSRF check expects.
export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body || {};
  }
}

async function request(method, path, body, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body !== undefined ? { "Content-Type": "application/json", "X-FBS": "1" } : { "X-FBS": "1" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: Boolean(opts.keepalive),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401) {
    location.replace("/login");
    throw new ApiError(401, "Your session ended. Sign in again.", data);
  }
  if (!res.ok) throw new ApiError(res.status, data.error || "Something went wrong. Try again in a minute.", data);
  return data;
}

export const api = {
  get: (p) => request("GET", p),
  post: (p, b = {}) => request("POST", p, b),
  put: (p, b, o) => request("PUT", p, b, o),
  del: (p) => request("DELETE", p),
};
