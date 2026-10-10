/* Unsaved edits kept on this device, one per map, until the server has them (SPEC v3: "local unsaved edits are
 * kept in localStorage per map so nothing is lost"). Pure: the storage is passed in (localStorage in the app,
 * a Map-like object in the tests); every call is tolerant of a missing or full storage. */
export const DRAFT_PREFIX = "fbs-draft-v1:";
const MAX_BYTES = 450 * 1024; // a little over the map limit (400 KB) so a map at the limit still fits

const key = mapId => DRAFT_PREFIX + String(mapId);

/** Keeps {version, data} for mapId. Returns true when stored. */
export function saveDraft(storage, mapId, {version, data}, now = Date.now()) {
  if (!storage || !mapId || !data) return false;
  try {
    const s = JSON.stringify({version, data, at: now});
    if (s.length > MAX_BYTES) return false;
    storage.setItem(key(mapId), s);
    return true;
  } catch { return false; } // private window, quota, or no storage at all
}

/** The draft for mapId: {version, data, at} or null. A broken value is removed. */
export function loadDraft(storage, mapId) {
  if (!storage || !mapId) return null;
  let s = null;
  try { s = storage.getItem(key(mapId)); } catch { return null; }
  if (!s) return null;
  let d = null;
  try { d = JSON.parse(s); } catch { d = null; }
  if (!d || typeof d !== "object" || !d.data || typeof d.data !== "object" || !Array.isArray(d.data.items)) { clearDraft(storage, mapId); return null; }
  return {version: Number.isFinite(d.version) ? d.version : null, data: d.data, at: Number.isFinite(d.at) ? d.at : 0};
}

export function clearDraft(storage, mapId) {
  if (!storage || !mapId) return;
  try { storage.removeItem(key(mapId)); } catch { /* nothing to clear */ }
}

/** Every map id with a draft (to clean up drafts of deleted maps). */
export function draftIds(storage) {
  const out = [];
  try {
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(DRAFT_PREFIX)) out.push(k.slice(DRAFT_PREFIX.length)); }
  } catch { /* no storage */ }
  return out;
}
