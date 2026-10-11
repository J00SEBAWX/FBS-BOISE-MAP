/* The site's API from the browser (docs/API.md): same-origin JSON, the CSRF header on every write, errors as
 * plain sentences. A 401 clears this device's drafts and sends the person to the sign-in page.
 * Nothing here touches the DOM. */
import {clearAllDrafts} from "./drafts.js";
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
  if (r.status === 401) {
    // signed out (or removed): this person's drafts must not stay on a shared device
    try { clearAllDrafts(localStorage); } catch { /* no storage */ }
    location.replace("/login");
    throw new ApiError(401, {error: "Please sign in."});
  }
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
  /** Sharing and the master lock (admin): {shareMaps?, masterLocked?} -> the same plus lockedByName/lockedAt. */
  putSettings: s => call("PUT", "/api/admin/settings", s),
  /** Proposals (OWNER RULES v3.1 rule 7): submit an own map for review, withdraw, list, read, decide. */
  submitProposal: (mapId, note) => call("POST", `/api/maps/${encodeURIComponent(mapId)}/submit`, note ? {note} : {}),
  withdrawProposal: id => call("POST", `/api/proposals/${encodeURIComponent(id)}/withdraw`),
  proposals: status => call("GET", "/api/proposals" + (status ? `?status=${encodeURIComponent(status)}` : "")),
  proposal: id => call("GET", `/api/proposals/${encodeURIComponent(id)}`),
  decideProposal: (id, body) => call("POST", `/api/proposals/${encodeURIComponent(id)}/decision`, body),
  /** Master history (admin): the list, one version with its data, restore an old version as a new one. */
  masterHistory: () => call("GET", "/api/master/history"),
  masterVersion: v => call("GET", `/api/master/history/${encodeURIComponent(v)}`),
  restoreMaster: (version, baseVersion) => call("POST", "/api/master/restore", {version, baseVersion}),
  /** Comparison: copy these changes ({id | category, action}) from a map into the master (admin). */
  applyToMaster: (mapId, baseVersion, changes, note) => call("POST", "/api/master/apply", {mapId, baseVersion, changes, ...(note ? {note} : {})}),
  /** The advisor's settings: thresholds, margin tiers, roles and rule weights (anyone may read; the admin saves). */
  advisorConfig: () => call("GET", "/api/advisor-config"),
  putAdvisorConfig: config => call("PUT", "/api/advisor-config", {config}),
  resetAdvisorConfig: () => call("PUT", "/api/advisor-config", {reset: true}),
};
