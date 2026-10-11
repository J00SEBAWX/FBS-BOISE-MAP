/* What the page does when the site's map database is not ready yet: this front end was published before the
 * database migration (0005) was applied, or before the master map was seeded. The server then answers the maps
 * calls with 503 ("The site isn't set up yet." / "The master map isn't set up yet.") and the page falls back to the
 * static /data/master.json, read-only, exactly like the first version of the site: Plan, 3D, Walk, Layers and
 * Measure keep working; New map, editing, proposals, the Advisor, Comparison, Review and the admin's map settings
 * (everything that needs the API) are switched off, and a calm banner says why. Pure: no DOM, no fetch. */

/** The banner's words (docs/DEPLOY-PHASE2.md quotes them). */
export const LEGACY_BANNER = Object.freeze({
  title: "Editing isn't switched on yet.",
  text: " You're viewing the master map as it stands.",
});
export const LEGACY_BANNER_TEXT = LEGACY_BANNER.title + LEGACY_BANNER.text;

/** The view modes that still work without the API: they only read the master map. */
export const LEGACY_MODES = Object.freeze(["current"]);

/**
 * Does this API failure mean "the server isn't ready for maps yet" (rather than a dropped connection, a signed-out
 * session or a map that is really gone)? 503 always (the tables or the seeded master are missing, or the secrets
 * are); a 404 only when reading the master itself, which is never legitimately missing.
 */
export function apiNotReady(err, {master = false} = {}) {
  const status = err && typeof err === "object" ? err.status : undefined;
  if (status === 503) return true;
  return master && status === 404;
}

/** May this mode be used while the API is not ready? */
export const legacyAllows = mode => LEGACY_MODES.includes(mode);
/** The mode to show instead: Current layout. */
export const legacyMode = mode => (legacyAllows(mode) ? mode : "current");

/**
 * The static master file as the answer GET /api/master would have given (so the rest of the page needn't know),
 * or null when the file isn't a map. version 0 and static: true mark it as not coming from the database.
 */
export function staticMasterResponse(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray(raw.items)) return null;
  return {version: 0, data: raw, itemCount: raw.items.length, updatedAt: 0, updatedByName: "", sourceOwnerName: "", note: "", locked: false, static: true};
}
