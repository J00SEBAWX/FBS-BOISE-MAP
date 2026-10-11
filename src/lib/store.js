// Shared pieces of the maps / master / proposals endpoints: settings, the current master, write rate limits,
// validation errors, and the one atomic way to add a master version.
import { HttpError } from "./http.js";
import { allow } from "./ratelimit.js";
import { limitKey } from "./auth.js";
import { validateMapData, cleanText } from "../shared/schema.js";

/** Request body limits (bytes). A map's data may be 400 KB; the envelope and stripped fields get some room. */
export const MAP_BODY_MAX = 460 * 1024;
export const SMALL_BODY_MAX = 4 * 1024;
export const DECISION_BODY_MAX = 128 * 1024;

export const MAX_MAPS = 30;
export const KEEP_MASTER_VERSIONS = 200;

export const STALE_MASTER = "The master map was changed since you opened it. Reload it to keep going.";
export const STALE_MAP = "This map was changed somewhere else. Reload it to keep going.";
export const LOCKED = "The master map is locked. Unlock it first.";
export const NO_MASTER = "The master map isn't set up yet.";

// per person: [limit, window in seconds]
const WRITE_LIMITS = {
  save: [120, 600], // map saves (autosave)
  maps: [60, 600], // new / deleted maps
  master: [60, 600], // master edits, applies, restores, decisions
  proposals: [30, 600], // submit / withdraw
  settings: [30, 600], // sharing, lock, advisor settings
};

/** Counts one write of this kind for this person; 429 past the limit. */
export async function writeLimit(env, user, kind) {
  const [limit, windowSec] = WRITE_LIMITS[kind];
  const key = `w:${kind}:` + (await limitKey(env, "user", user.id));
  if (!(await allow(env.DB, key, limit, windowSec))) {
    throw new HttpError(429, "That's a lot of changes in a short time. Wait a few minutes and try again.");
  }
}

/** validateMapData, as a 400 {error, field, itemId} on failure. */
export function checkData(raw) {
  const r = validateMapData(raw);
  if (!r.ok) {
    const extra = { field: r.field || "data", itemId: r.itemId ?? null };
    if (r.category) extra.category = r.category;
    throw new HttpError(400, r.error, extra);
  }
  return r.data;
}

/** A whole number >= 0 from the body, or a 400 naming the field. */
export function intField(v, field) {
  if (!Number.isInteger(v) || v < 0 || v > 2147483647) throw new HttpError(400, `"${field}" must be a whole number.`, { field });
  return v;
}

/** An optional note (<= 500 characters), or a 400. */
export function noteField(v, field = "note") {
  if (v === undefined || v === null) return null;
  const s = cleanText(v, 500, true);
  if (s === null) throw new HttpError(400, "A note can be at most 500 characters.", { field });
  return s || null;
}

/** Stored JSON -> object (rows are only ever written after validation). */
export function parseData(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : { items: [], categories: [] };
  } catch {
    return { items: [], categories: [] };
  }
}

// ---------- settings ----------

const SETTING_KEYS = ["share_maps", "master_locked", "master_locked_by_name", "master_locked_at"];

/** {shareMaps, masterLocked, lockedByName, lockedAt} (defaults when a key is missing). */
export async function getSettings(env) {
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (?1, ?2, ?3, ?4)`)
    .bind(...SETTING_KEYS)
    .all();
  const s = Object.fromEntries((results || []).map((r) => [r.key, r.value]));
  const locked = s.master_locked === "1";
  return {
    shareMaps: s.share_maps === "1",
    masterLocked: locked,
    lockedByName: locked ? s.master_locked_by_name || null : null,
    lockedAt: locked && s.master_locked_at ? Number(s.master_locked_at) || null : null,
  };
}

export function setSetting(env, key, value, now) {
  return env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(key, String(value), now);
}

// ---------- the master ----------

/** The newest master version row (with its data unless withData is false), or null when there is none yet. */
export async function currentMaster(env, withData = true) {
  return env.DB.prepare(
    `SELECT version, ${withData ? "data," : ""} item_count, created_at, created_by_name, source_map_id, source_owner_name, note
       FROM master_versions ORDER BY version DESC LIMIT 1`
  ).first();
}

/** The current master version number (0 when there is none). */
export async function masterVersion(env) {
  const row = await env.DB.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM master_versions").first();
  return row ? row.v : 0;
}

/** 423 while the master is locked. */
export async function assertUnlocked(env) {
  if ((await getSettings(env)).masterLocked) throw new HttpError(423, LOCKED);
}

/**
 * The INSERT that adds master version base+1, only if the current master is still `base` and the master isn't
 * locked (both checked inside the statement, so two writers can never both win). `also` (optional SQL, ANDed
 * into the condition) lets a caller add one more requirement; its placeholders start at ?12. Returns the prepared statement.
 */
export function masterInsert(env, { base, data, now, user, sourceMapId = null, sourceOwnerId = null, sourceOwnerName = null, note = null, also = "", alsoArgs = [] }) {
  const text = JSON.stringify(data);
  const args = [base + 1, text, data.items.length, now, user.id, user.first_name, sourceMapId, sourceOwnerName, note, base, sourceOwnerId, ...alsoArgs];
  return env.DB.prepare(
    `INSERT INTO master_versions (version, data, item_count, created_at, created_by, created_by_name, source_map_id, source_owner_name, note, source_owner_id)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?11
      WHERE (SELECT COALESCE(MAX(version), 0) FROM master_versions) = ?10
        AND COALESCE((SELECT value FROM settings WHERE key = 'master_locked'), '0') = '0'
        ${also}`
  ).bind(...args);
}

// What D1 says when two writers insert the same master version (a constraint) or one waits on the other (busy / locked).
const RACE_ERROR = /UNIQUE|PRIMARY KEY|constraint|SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i;
const RACE_RECHECKS_MS = [0, 40, 120];

/**
 * True for the error D1 raises when two writers insert the same master version at once (the loser gets 409). For any
 * other database error it asks whether the master has moved past `base`, which also means another writer won; that
 * check is repeated a few times over ~160 ms because the winner may not have committed yet when the loser fails.
 * `wait` is a test hook.
 */
export async function isVersionRace(env, e, base, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  if (RACE_ERROR.test(String((e && e.message) || e))) return true;
  for (const ms of RACE_RECHECKS_MS) {
    if (ms) await wait(ms);
    try {
      if ((await masterVersion(env)) !== base) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** After a master INSERT changed nothing: 423 if locked, else 409 with the current version. */
export async function masterConflict(env) {
  await assertUnlocked(env);
  throw new HttpError(409, STALE_MASTER, { currentVersion: await masterVersion(env) });
}

/** The checks before any master write: unlocked (423), base still current (409). Returns the current row. */
export async function masterForWrite(env, base, withData = true) {
  await assertUnlocked(env);
  const cur = await currentMaster(env, withData);
  const v = cur ? cur.version : 0;
  if (v !== base) throw new HttpError(409, STALE_MASTER, { currentVersion: v });
  return cur;
}
