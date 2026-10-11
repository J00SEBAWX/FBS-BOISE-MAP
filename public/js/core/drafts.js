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

/** Removes every draft (sign-out, or a 401: the next person on this device must not see this person's edits).
 *  Returns how many were removed. */
export function clearAllDrafts(storage) {
  let n = 0;
  try { for (const id of draftIds(storage)) { clearDraft(storage, id); n++; } } catch { /* no storage */ }
  return n;
}

/**
 * Keeps track of WHICH document each draft holds, so a finished save only clears a draft it fully covers.
 * The editing session replaces its document on every edit, so object identity says whether anything changed
 * while a save was in flight: a save of {a} must not delete the draft of {a, b}.
 *   write(mapId, version, doc)        a change happened: keep the document on the device
 *   saved(mapId, savedDoc, newVersion, openDoc)
 *       the server now has savedDoc as newVersion; openDoc is the document in the editor if that map is still
 *       the open one (else null). Returns "cleared" (the draft was exactly savedDoc), "rebased" (the open map
 *       has newer edits: the draft is rewritten against the new version so a reload restores it) or "kept".
 *   clear(mapId)                      the person discarded it, or the map was deleted
 */
export function createDraftKeeper(storage) {
  const held = new Map(); // mapId -> the document object last written to the draft
  return {
    write(mapId, version, doc) {
      if (saveDraft(storage, mapId, {version, data: doc})) held.set(mapId, doc); else held.delete(mapId);
    },
    saved(mapId, savedDoc, newVersion, openDoc) {
      const h = held.get(mapId);
      if (h === savedDoc) { clearDraft(storage, mapId); held.delete(mapId); return "cleared"; }
      if (h && openDoc && h === openDoc) { saveDraft(storage, mapId, {version: newVersion, data: openDoc}); return "rebased"; }
      return "kept";
    },
    clear(mapId) { clearDraft(storage, mapId); held.delete(mapId); },
  };
}
