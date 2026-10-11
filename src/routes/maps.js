// Everyone's own maps. Visibility: the owner and the admin always; everyone signed in when the admin has turned
// on sharing. Only the owner changes a map (and submits it as a proposal); the owner or the admin deletes it.
// Anything a person may not see answers 404, exactly like a map that doesn't exist.
import { HttpError, json, readJson } from "../lib/http.js";
import { audit } from "../lib/ratelimit.js";
import { requireId } from "../lib/validate.js";
import { newId } from "../lib/crypto.js";
import { cleanMapName, structureOnly } from "../shared/schema.js";
import {
  MAP_BODY_MAX, SMALL_BODY_MAX, MAX_MAPS, STALE_MAP, NO_MASTER,
  writeLimit, checkData, intField, parseData, getSettings, currentMaster,
} from "../lib/store.js";

const NOT_FOUND = () => new HttpError(404, "Not found.");
const BASES = { master: "master", blank: "blank", map: "copy" };
const NAME_ERROR = "Give the map a name of 1 to 60 characters.";

export function mapMeta(row, me) {
  return {
    id: row.id,
    name: row.name,
    base: row.base,
    ownerName: row.owner_name || null,
    mine: row.owner_id === me.id,
    itemCount: row.item_count,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const META_COLS = "m.id, m.owner_id, m.name, m.base, m.version, m.item_count, m.created_at, m.updated_at, u.first_name AS owner_name";

/** May this person see maps that aren't theirs? (the admin always; others only while sharing is on) */
async function seesTeam(env, me) {
  return me.role === "admin" || (await getSettings(env)).shareMaps;
}

/** The map row if this person may see it (with its data when asked), else 404. */
export async function visibleMap(env, me, id, withData = false) {
  requireId(id);
  const row = await env.DB.prepare(`SELECT ${META_COLS}, u.status AS owner_status${withData ? ", m.data" : ""} FROM maps m LEFT JOIN users u ON u.id = m.owner_id WHERE m.id = ?1`)
    .bind(id)
    .first();
  if (!row) throw NOT_FOUND();
  // someone else's map: only while sharing is on (or for the admin), and only an approved member's, like the team list
  if (row.owner_id !== me.id && (row.owner_status !== "approved" || !(await seesTeam(env, me)))) throw NOT_FOUND();
  delete row.owner_status;
  return row;
}

/** The map row if this person owns it; 404 if they can't see it, 403 if they can see it but it isn't theirs. */
export async function ownMap(env, me, id, withData = false) {
  const row = await visibleMap(env, me, id, withData);
  if (row.owner_id !== me.id) throw new HttpError(403, "Only the person who made this map can change it.");
  return row;
}

/** GET /api/maps -> {mine: [Meta], team: [Meta]} */
export async function list(env, me) {
  const { results: mine } = await env.DB.prepare(
    `SELECT ${META_COLS} FROM maps m LEFT JOIN users u ON u.id = m.owner_id WHERE m.owner_id = ?1 ORDER BY m.updated_at DESC`
  )
    .bind(me.id)
    .all();
  let team = [];
  if (await seesTeam(env, me)) {
    const r = await env.DB.prepare(
      `SELECT ${META_COLS} FROM maps m JOIN users u ON u.id = m.owner_id
        WHERE m.owner_id != ?1 AND u.status = 'approved' ORDER BY u.first_name COLLATE NOCASE, m.updated_at DESC LIMIT 1000`
    )
      .bind(me.id)
      .all();
    team = r.results || [];
  }
  return json({ mine: (mine || []).map((r) => mapMeta(r, me)), team: team.map((r) => mapMeta(r, me)) });
}

/** POST /api/maps {name, from: 'master'|'blank'|'map', mapId?} -> {meta, data} */
export async function create(request, env, me) {
  await writeLimit(env, me, "maps");
  const body = await readJson(request, SMALL_BODY_MAX);
  const name = cleanMapName(body.name);
  if (!name) throw new HttpError(400, NAME_ERROR, { field: "name" });
  const base = typeof body.from === "string" && Object.hasOwn(BASES, body.from) ? BASES[body.from] : null;
  if (!base) throw new HttpError(400, "Start from the master map, a blank store or a map you can see.", { field: "from" });
  let data;
  if (body.from === "map") {
    if (typeof body.mapId !== "string") throw new HttpError(400, "Pick the map to copy.", { field: "mapId" });
    data = parseData((await visibleMap(env, me, body.mapId, true)).data);
  } else {
    const master = await currentMaster(env);
    if (!master) throw new HttpError(503, NO_MASTER);
    data = parseData(master.data);
    if (body.from === "blank") data = structureOnly(data);
  }
  const text = JSON.stringify(data);
  const id = newId("m_");
  const now = Date.now();
  const itemCount = Array.isArray(data.items) ? data.items.length : 0;
  const res = await env.DB.prepare(
    `INSERT INTO maps (id, owner_id, name, base, data, version, item_count, created_at, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?7 WHERE (SELECT COUNT(*) FROM maps WHERE owner_id = ?2) < ?8`
  )
    .bind(id, me.id, name, base, text, itemCount, now, MAX_MAPS)
    .run();
  if (res.meta?.changes !== 1) throw new HttpError(400, `You have ${MAX_MAPS} maps. Delete one to make another.`, { field: "name" });
  await audit(env.DB, me.id, "map.create", id, base);
  const meta = mapMeta(
    { id, owner_id: me.id, name, base, version: 1, item_count: itemCount, created_at: now, updated_at: now, owner_name: me.first_name },
    me
  );
  return json({ meta, data });
}

/** GET /api/maps/:id -> {meta, data, canEdit} */
export async function get(env, me, id) {
  const row = await visibleMap(env, me, id, true);
  return json({ meta: mapMeta(row, me), data: parseData(row.data), canEdit: row.owner_id === me.id });
}

/** PUT /api/maps/:id {version, data?, name?} (owner) -> {version, updatedAt} */
export async function update(request, env, me, id) {
  await ownMap(env, me, id);
  await writeLimit(env, me, "save");
  const body = await readJson(request, MAP_BODY_MAX);
  const version = intField(body.version, "version");
  let text = null;
  let count = null;
  let name = null;
  if (body.data !== undefined) {
    const data = checkData(body.data);
    text = JSON.stringify(data);
    count = data.items.length;
  }
  if (body.name !== undefined) {
    name = cleanMapName(body.name);
    if (!name) throw new HttpError(400, NAME_ERROR, { field: "name" });
  }
  if (text === null && name === null) throw new HttpError(400, "Nothing to save.", { field: "data" });
  const now = Date.now();
  const res = await env.DB.prepare(
    `UPDATE maps SET data = COALESCE(?1, data), item_count = COALESCE(?2, item_count), name = COALESCE(?3, name),
            version = version + 1, updated_at = ?4
      WHERE id = ?5 AND owner_id = ?6 AND version = ?7`
  )
    .bind(text, count, name, now, id, me.id, version)
    .run();
  if (res.meta?.changes !== 1) {
    const cur = await env.DB.prepare("SELECT version FROM maps WHERE id = ?1 AND owner_id = ?2").bind(id, me.id).first();
    if (!cur) throw NOT_FOUND();
    throw new HttpError(409, STALE_MAP, { currentVersion: cur.version });
  }
  return json({ version: version + 1, updatedAt: now });
}

/** DELETE /api/maps/:id (owner or admin). Its open proposal, if any, is withdrawn. */
export async function remove(env, me, id) {
  const row = await visibleMap(env, me, id);
  if (row.owner_id !== me.id && me.role !== "admin") throw new HttpError(403, "Only the person who made this map can delete it.");
  await writeLimit(env, me, "maps");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE proposals SET status = 'withdrawn', decided_at = ?1, decision_note = 'The map was deleted.'
        WHERE map_id = ?2 AND status = 'submitted'`
    ).bind(now, id),
    env.DB.prepare("DELETE FROM maps WHERE id = ?1").bind(id),
  ]);
  await audit(env.DB, me.id, "map.delete", id);
  return json({ ok: true });
}
