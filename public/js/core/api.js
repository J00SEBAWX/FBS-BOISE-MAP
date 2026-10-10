/* The site's API from the browser (docs/API.md): same-origin JSON, the CSRF header on every write, errors as
 * plain sentences. A 401 sends the person to the sign-in page. Nothing here touches the DOM. */
export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || (status === 0 ? "Couldn't reach the site." : `Something went wrong (${status}).`));
    this.status = status;
    this.body = body || {};
  }
}

async function call(method, path, body) {
  const headers = {Accept: "application/json"};
  if (method !== "GET") { headers["X-FBS"] = "1"; if (body !== undefined) headers["Content-Type"] = "application/json"; }
  let r;
  try {
    r = await fetch(path, {method, credentials: "same-origin", cache: "no-store", headers, body: body === undefined ? undefined : JSON.stringify(body)});
  } catch (e) { throw new ApiError(0, {error: "Couldn't reach the site. Check the connection."}); }
  if (r.status === 401) { location.replace("/login"); throw new ApiError(401, {error: "Please sign in."}); }
  let data = null;
  const text = await r.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new ApiError(r.status, data || {error: `Something went wrong (${r.status}).`});
  return data;
}

export const api = {
  me: () => call("GET", "/api/me"),
  master: () => call("GET", "/api/master"),
  putMaster: (baseVersion, data, note) => call("PUT", "/api/master", {baseVersion, data, ...(note ? {note} : {})}),
  maps: () => call("GET", "/api/maps"),
  map: id => call("GET", `/api/maps/${encodeURIComponent(id)}`),
  createMap: (name, from, mapId) => call("POST", "/api/maps", {name, from, ...(mapId ? {mapId} : {})}),
  saveMap: (id, version, data) => call("PUT", `/api/maps/${encodeURIComponent(id)}`, {version, data}),
  renameMap: (id, version, name) => call("PUT", `/api/maps/${encodeURIComponent(id)}`, {version, name}),
  deleteMap: id => call("DELETE", `/api/maps/${encodeURIComponent(id)}`),
  settings: () => call("GET", "/api/admin/settings"),
  /** Comparison: copy these changes ({id | category, action}) from a map into the master (admin). */
  applyToMaster: (mapId, baseVersion, changes, note) => call("POST", "/api/master/apply", {mapId, baseVersion, changes, ...(note ? {note} : {})}),
  /** The advisor's settings: thresholds, margin tiers, roles and rule weights (anyone may read; the admin saves). */
  advisorConfig: () => call("GET", "/api/advisor-config"),
  putAdvisorConfig: config => call("PUT", "/api/advisor-config", {config}),
  resetAdvisorConfig: () => call("PUT", "/api/advisor-config", {reset: true}),
};
