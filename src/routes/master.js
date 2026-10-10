// The catalog, the master map (read by everyone signed in; changed only by the admin, never while locked),
// its history and restores, the admin's site settings (sharing, master lock) and the advisor settings.
import { HttpError, json, readJson } from "../lib/http.js";
import { audit } from "../lib/ratelimit.js";
import { requireAdmin } from "../lib/auth.js";
import { requireId } from "../lib/validate.js";
import { CATALOG, PRODUCTS } from "../shared/catalog.js";
import { ITEM_TYPES, STRUCTURE_TYPES, LIMITS } from "../shared/schema.js";
import { validateChanges, applyChanges } from "../shared/apply.js";
import { defaultAdvisorConfig, validateAdvisorConfig, ADVISOR_RULES, ADVISOR_THRESHOLDS, ADVISOR_CONFIG_MAX_BYTES } from "../shared/advisor-config.js";
import {
  MAP_BODY_MAX, SMALL_BODY_MAX, KEEP_MASTER_VERSIONS, NO_MASTER,
  writeLimit, checkData, intField, noteField, parseData, getSettings, setSetting,
  currentMaster, masterInsert, masterConflict, masterForWrite, assertUnlocked, isVersionRace,
} from "../lib/store.js";

/** GET /api/catalog: the default departments, families, palette, thresholds, product map and item types. */
export function catalog() {
  return json({
    version: CATALOG.version,
    areas: CATALOG.areas,
    families: CATALOG.families,
    customFamily: CATALOG.customFamily,
    palette: CATALOG.palette,
    thresholds: CATALOG.thresholds,
    sizing: CATALOG.sizing,
    entryAnchors: CATALOG.entryAnchors,
    placements: CATALOG.placements,
    adjacency: CATALOG.adjacency,
    products: PRODUCTS,
    structureTypes: STRUCTURE_TYPES,
    itemTypes: ITEM_TYPES,
    limits: { maxItems: LIMITS.maxItems, maxBytes: LIMITS.maxBytes, maxCategories: LIMITS.maxCategories },
  });
}

// ---------- the master ----------

/** GET /api/master (anyone signed in) */
export async function getMaster(env) {
  const [row, s] = await Promise.all([currentMaster(env), getSettings(env)]);
  if (!row) throw new HttpError(503, NO_MASTER);
  return json({
    version: row.version,
    data: parseData(row.data),
    itemCount: row.item_count,
    updatedAt: row.created_at,
    updatedByName: row.created_by_name,
    sourceOwnerName: row.source_owner_name,
    note: row.note,
    locked: s.masterLocked,
    lockedByName: s.lockedByName,
    lockedAt: s.lockedAt,
  });
}

/** Writes master version base+1 (or 409 / 423) and records it. */
async function writeMaster(env, admin, fields, action) {
  const now = Date.now();
  let res;
  try {
    res = await masterInsert(env, { ...fields, now, user: admin }).run();
  } catch (e) {
    if (!isVersionRace(e)) throw e;
    await masterConflict(env); // two writers raced for the same version: the loser is simply stale
  }
  if (res.meta?.changes !== 1) await masterConflict(env);
  const version = fields.base + 1;
  await audit(env.DB, admin.id, action, `v${version}`);
  return { version, updatedAt: now };
}

/** PUT /api/master {baseVersion, data, note?} (admin) -> {version} */
export async function putMaster(request, env, sess) {
  const admin = requireAdmin(sess);
  await writeLimit(env, admin, "master");
  await assertUnlocked(env);
  const body = await readJson(request, MAP_BODY_MAX);
  const base = intField(body.baseVersion, "baseVersion");
  const data = checkData(body.data);
  const note = noteField(body.note);
  await masterForWrite(env, base, false);
  const out = await writeMaster(env, admin, { base, data, note }, "master.edit");
  return json(out);
}

/** POST /api/master/apply {mapId, baseVersion, changes, note?} (admin) -> {version, applied} */
export async function applyToMaster(request, env, sess) {
  const admin = requireAdmin(sess);
  await writeLimit(env, admin, "master");
  await assertUnlocked(env);
  const body = await readJson(request, 256 * 1024);
  const base = intField(body.baseVersion, "baseVersion");
  const vc = validateChanges(body.changes);
  if (!vc.ok) throw new HttpError(400, vc.error, { field: vc.field, itemId: null });
  if (!vc.changes.length) throw new HttpError(400, "Pick at least one change to apply.", { field: "changes", itemId: null });
  const note = noteField(body.note);
  const mapId = requireId(body.mapId);
  const map = await env.DB.prepare(
    "SELECT m.id, m.owner_id, m.data, u.first_name AS owner_name FROM maps m LEFT JOIN users u ON u.id = m.owner_id WHERE m.id = ?1"
  )
    .bind(mapId)
    .first();
  if (!map) throw new HttpError(404, "Not found.");
  const cur = await masterForWrite(env, base);
  const r = applyChanges(cur ? parseData(cur.data) : { items: [], categories: [] }, parseData(map.data), vc.changes);
  if (!r.ok) throw new HttpError(400, r.error, { field: r.field, itemId: r.itemId ?? null, ...(r.category ? { category: r.category } : {}) });
  const data = checkData(r.data);
  const out = await writeMaster(env, admin, { base, data, note, sourceMapId: map.id, sourceOwnerId: map.owner_id, sourceOwnerName: map.owner_name || null }, "master.apply");
  return json({ ...out, applied: r.applied, addedCategories: r.addedCategories });
}

/** GET /api/master/history (admin) -> {versions: [...]} newest first */
export async function history(env, sess) {
  requireAdmin(sess);
  const { results } = await env.DB.prepare(
    `SELECT version, created_at, created_by_name, source_map_id, source_owner_name, note, item_count
       FROM master_versions ORDER BY version DESC LIMIT ?1`
  )
    .bind(KEEP_MASTER_VERSIONS)
    .all();
  return json({
    versions: (results || []).map((r) => ({
      version: r.version,
      createdAt: r.created_at,
      createdByName: r.created_by_name,
      sourceMapId: r.source_map_id,
      sourceOwnerName: r.source_owner_name,
      note: r.note,
      itemCount: r.item_count,
    })),
  });
}

/** GET /api/master/history/:version (admin) -> one old version with its data (to preview before a restore). */
export async function historyVersion(env, sess, v) {
  requireAdmin(sess);
  const version = /^[1-9][0-9]{0,9}$/.test(v) ? Number(v) : 0;
  const r = version
    ? await env.DB.prepare(
        "SELECT version, data, created_at, created_by_name, source_map_id, source_owner_name, note, item_count FROM master_versions WHERE version = ?1"
      )
        .bind(version)
        .first()
    : null;
  if (!r) throw new HttpError(404, "Not found.");
  return json({
    version: r.version,
    data: parseData(r.data),
    createdAt: r.created_at,
    createdByName: r.created_by_name,
    sourceMapId: r.source_map_id,
    sourceOwnerName: r.source_owner_name,
    note: r.note,
    itemCount: r.item_count,
  });
}

/** POST /api/master/restore {version, baseVersion} (admin) -> {version} (a new version with the old data) */
export async function restore(request, env, sess) {
  const admin = requireAdmin(sess);
  await writeLimit(env, admin, "master");
  await assertUnlocked(env);
  const body = await readJson(request, SMALL_BODY_MAX);
  const base = intField(body.baseVersion, "baseVersion");
  const which = intField(body.version, "version");
  const old = await env.DB.prepare("SELECT data FROM master_versions WHERE version = ?1").bind(which).first();
  if (!old) throw new HttpError(404, "That version isn't kept any more.");
  await masterForWrite(env, base, false);
  // re-checked so a version saved under older rules can't bring back something the rules now refuse
  const data = checkData(parseData(old.data));
  const out = await writeMaster(env, admin, { base, data, note: `Restored version ${which}` }, "master.restore");
  return json(out);
}

// ---------- admin settings ----------

/** GET /api/admin/settings (admin) */
export async function getAdminSettings(env) {
  return json(await getSettings(env));
}

/** PUT /api/admin/settings {shareMaps?, masterLocked?} (admin) */
export async function putAdminSettings(request, env, admin) {
  await writeLimit(env, admin, "settings");
  const body = await readJson(request, SMALL_BODY_MAX);
  const now = Date.now();
  const stmts = [];
  const notes = [];
  for (const k of ["shareMaps", "masterLocked"]) {
    if (body[k] !== undefined && typeof body[k] !== "boolean") throw new HttpError(400, `"${k}" must be true or false.`, { field: k });
  }
  if (body.shareMaps === undefined && body.masterLocked === undefined) throw new HttpError(400, "Nothing to change.", { field: "shareMaps" });
  if (body.shareMaps !== undefined) {
    stmts.push(setSetting(env, "share_maps", body.shareMaps ? "1" : "0", now));
    notes.push(body.shareMaps ? "settings.share_on" : "settings.share_off");
  }
  if (body.masterLocked !== undefined) {
    const was = (await getSettings(env)).masterLocked;
    if (body.masterLocked && !was) {
      stmts.push(setSetting(env, "master_locked", "1", now));
      stmts.push(setSetting(env, "master_locked_by_name", admin.first_name, now));
      stmts.push(setSetting(env, "master_locked_at", String(now), now));
      notes.push("master.lock");
    } else if (!body.masterLocked && was) {
      stmts.push(setSetting(env, "master_locked", "0", now));
      stmts.push(env.DB.prepare("DELETE FROM settings WHERE key IN ('master_locked_by_name', 'master_locked_at')"));
      notes.push("master.unlock");
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  for (const n of notes) await audit(env.DB, admin.id, n);
  return json(await getSettings(env));
}

// ---------- advisor settings ----------

async function storedAdvisor(env) {
  const row = await env.DB.prepare("SELECT value, updated_at FROM settings WHERE key = 'advisor_config'").first();
  if (row) {
    let raw = null;
    try {
      raw = JSON.parse(row.value);
    } catch {
      raw = null;
    }
    const v = raw ? validateAdvisorConfig(raw) : { ok: false };
    if (v.ok) return { config: v.config, isDefault: false, updatedAt: row.updated_at };
  }
  return { config: defaultAdvisorConfig(), isDefault: true, updatedAt: null };
}

/** GET /api/advisor-config (anyone signed in) -> {config, isDefault, updatedAt, rules, thresholds} */
export async function getAdvisorConfig(env) {
  return json({ ...(await storedAdvisor(env)), rules: ADVISOR_RULES, thresholds: ADVISOR_THRESHOLDS });
}

/** PUT /api/advisor-config {config} (admin; {reset: true} goes back to the defaults) */
export async function putAdvisorConfig(request, env, sess) {
  const admin = requireAdmin(sess);
  await writeLimit(env, admin, "settings");
  const body = await readJson(request, ADVISOR_CONFIG_MAX_BYTES);
  const now = Date.now();
  if (body.reset === true) {
    await env.DB.prepare("DELETE FROM settings WHERE key = 'advisor_config'").run();
    await audit(env.DB, admin.id, "advisor.reset");
    return json({ config: defaultAdvisorConfig(), isDefault: true, updatedAt: null });
  }
  const v = validateAdvisorConfig(body.config);
  if (!v.ok) throw new HttpError(400, v.error, { field: v.field });
  await setSetting(env, "advisor_config", JSON.stringify(v.config), now).run();
  await audit(env.DB, admin.id, "advisor.update");
  return json({ config: v.config, isDefault: false, updatedAt: now });
}
