// Proposals: a person submits their map (with a note) for the master; the admin approves it (applying all or
// some of its changes to the master), asks for changes, or declines it. The owner can withdraw it while open.
// A proposal is visible only to its owner and the admin; anyone else gets 404.
import { HttpError, json, readJson } from "../lib/http.js";
import { audit } from "../lib/ratelimit.js";
import { requireAdmin } from "../lib/auth.js";
import { requireId } from "../lib/validate.js";
import { newId } from "../lib/crypto.js";
import { validateChanges, applyChanges } from "../shared/apply.js";
import { ownMap } from "./maps.js";
import {
  SMALL_BODY_MAX, DECISION_BODY_MAX, NO_MASTER,
  writeLimit, checkData, intField, noteField, parseData, masterVersion, masterInsert, masterConflict, masterForWrite, assertUnlocked, isVersionRace,
} from "../lib/store.js";

const NOT_FOUND = () => new HttpError(404, "Not found.");
const DECIDED = "This proposal was already decided or withdrawn.";
const STATUSES = ["submitted", "approved", "needs_changes", "declined", "withdrawn"];
const DECISIONS = { approve: "approved", needs_changes: "needs_changes", decline: "declined" };

const COLS = `p.id, p.map_id, p.owner_id, p.map_version, p.base_master_version, p.note, p.status, p.created_at, p.decided_at,
              p.decided_by_name, p.decision_note, p.applied_version, json_array_length(p.snapshot, '$.items') AS item_count,
              m.name AS map_name, m.base AS map_base, u.first_name AS owner_name`;
const FROM = "FROM proposals p LEFT JOIN maps m ON m.id = p.map_id LEFT JOIN users u ON u.id = p.owner_id";

function meta(r, me) {
  return {
    id: r.id,
    mapId: r.map_id,
    mapName: r.map_name ?? null,
    mapBase: r.map_base ?? null, // what the map started from: "master" | "blank" | "copy"
    ownerName: r.owner_name ?? null,
    mine: r.owner_id === me.id,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decidedByName: r.decided_by_name,
    decisionNote: r.decision_note,
    appliedVersion: r.applied_version,
    baseMasterVersion: r.base_master_version,
    mapVersion: r.map_version,
    itemCount: r.item_count ?? 0,
  };
}

/** The proposal row if this person may see it (owner or admin), else 404. */
async function visible(env, me, id, withSnapshot = false) {
  requireId(id);
  const r = await env.DB.prepare(`SELECT ${COLS}${withSnapshot ? ", p.snapshot" : ""} ${FROM} WHERE p.id = ?1`).bind(id).first();
  if (!r || (r.owner_id !== me.id && me.role !== "admin")) throw NOT_FOUND();
  return r;
}

/** POST /api/maps/:id/submit {note?} (owner) -> {proposal}. Submitting again while open updates the open one. */
export async function submit(request, env, me, mapId) {
  const map = await ownMap(env, me, mapId, true);
  await writeLimit(env, me, "proposals");
  const body = await readJson(request, SMALL_BODY_MAX);
  const note = noteField(body.note);
  const base = await masterVersion(env);
  if (!base) throw new HttpError(503, NO_MASTER);
  const now = Date.now();
  const update = () =>
    env.DB.prepare(
      `UPDATE proposals SET snapshot = ?1, map_version = ?2, base_master_version = ?3, note = ?4, created_at = ?5
        WHERE map_id = ?6 AND owner_id = ?7 AND status = 'submitted' RETURNING id`
    )
      .bind(map.data, map.version, base, note, now, map.id, me.id)
      .first();
  let row = await update();
  let id = row?.id;
  if (!id) {
    id = newId("p_");
    try {
      await env.DB.prepare(
        `INSERT INTO proposals (id, map_id, owner_id, map_version, snapshot, base_master_version, note, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'submitted', ?8)`
      )
        .bind(id, map.id, me.id, map.version, map.data, base, note, now)
        .run();
    } catch (e) {
      // two submits at once: the other one made the open proposal; update that one instead
      if (!/UNIQUE/i.test(String(e && e.message))) throw e;
      row = await update();
      if (!row) throw e;
      id = row.id;
    }
  }
  await audit(env.DB, me.id, "proposal.submit", id);
  return json({ proposal: meta(await visible(env, me, id), me) });
}

/** POST /api/proposals/:id/withdraw (owner) -> {proposal} */
export async function withdraw(env, me, id) {
  const r = await visible(env, me, id);
  if (r.owner_id !== me.id) throw new HttpError(403, "Only the person who submitted this can withdraw it.");
  await writeLimit(env, me, "proposals");
  const res = await env.DB.prepare("UPDATE proposals SET status = 'withdrawn', decided_at = ?1 WHERE id = ?2 AND owner_id = ?3 AND status = 'submitted'")
    .bind(Date.now(), id, me.id)
    .run();
  if (res.meta?.changes !== 1) throw new HttpError(409, DECIDED);
  await audit(env.DB, me.id, "proposal.withdraw", id);
  return json({ proposal: meta(await visible(env, me, id), me) });
}

/** GET /api/proposals[?status=] -> {proposals} (admin: everyone's; others: their own), newest first */
export async function list(env, me, url) {
  const status = url.searchParams.get("status");
  if (status !== null && !STATUSES.includes(status)) throw new HttpError(400, "Unknown status.", { field: "status" });
  const where = [];
  const args = [];
  if (me.role !== "admin") {
    args.push(me.id);
    where.push(`p.owner_id = ?${args.length}`);
  }
  if (status) {
    args.push(status);
    where.push(`p.status = ?${args.length}`);
  }
  const sql = `SELECT ${COLS} ${FROM} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.created_at DESC LIMIT 200`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json({ proposals: (results || []).map((r) => meta(r, me)) });
}

/** GET /api/proposals/:id (owner or admin) -> {...meta, snapshot} */
export async function get(env, me, id) {
  const r = await visible(env, me, id, true);
  return json({ ...meta(r, me), snapshot: parseData(r.snapshot) });
}

/**
 * POST /api/proposals/:id/decision {decision: 'approve'|'needs_changes'|'decline', note?, changes?, baseVersion?} (admin)
 * Approving with changes applies them from the proposal's snapshot to the master (like /api/master/apply):
 * 409 when baseVersion is stale, 423 while the master is locked. The other decisions only record the note.
 */
export async function decide(request, env, sess, id) {
  const admin = requireAdmin(sess);
  await writeLimit(env, admin, "master");
  const body = await readJson(request, DECISION_BODY_MAX);
  const status = typeof body.decision === "string" && Object.hasOwn(DECISIONS, body.decision) ? DECISIONS[body.decision] : null;
  if (!status) throw new HttpError(400, "The decision must be approve, needs_changes or decline.", { field: "decision" });
  const note = noteField(body.note);
  const r = await visible(env, admin, id, true);
  if (r.status !== "submitted") throw new HttpError(409, DECIDED);
  const now = Date.now();

  let changes = [];
  if (body.changes !== undefined && body.changes !== null) {
    if (status !== "approved") throw new HttpError(400, "Only an approval applies changes.", { field: "changes" });
    const vc = validateChanges(body.changes);
    if (!vc.ok) throw new HttpError(400, vc.error, { field: vc.field, itemId: null });
    changes = vc.changes;
  }

  const decided = (extraSql = "", extraArgs = []) =>
    env.DB.prepare(
      `UPDATE proposals SET status = ?1, decided_at = ?2, decided_by = ?3, decided_by_name = ?4, decision_note = ?5, applied_version = ?6
        WHERE id = ?7 AND status = 'submitted' ${extraSql}`
    ).bind(status, now, admin.id, admin.first_name, note, ...extraArgs);

  if (!changes.length) {
    const res = await decided("", [null, id]).run();
    if (res.meta?.changes !== 1) throw new HttpError(409, DECIDED);
    await audit(env.DB, admin.id, "proposal." + body.decision, id);
    return json({ proposal: meta(await visible(env, admin, id), admin) });
  }

  // approve with changes: same rules as /api/master/apply, from the snapshot
  await assertUnlocked(env);
  const base = intField(body.baseVersion, "baseVersion");
  const cur = await masterForWrite(env, base);
  const out = applyChanges(cur ? parseData(cur.data) : { items: [], categories: [] }, parseData(r.snapshot), changes);
  if (!out.ok) throw new HttpError(400, out.error, { field: out.field, itemId: out.itemId ?? null, ...(out.category ? { category: out.category } : {}) });
  const data = checkData(out.data);
  const version = base + 1;
  const masterNote = note || `Approved ${r.owner_name ? r.owner_name + "'s" : "a"} proposal`;
  // one transaction: the new master version only if the proposal is still open, and the proposal marked approved
  // only if that exact version row went in
  let ins;
  try {
    [ins] = await env.DB.batch([
    masterInsert(env, {
      base, data, now, user: admin, sourceMapId: r.map_id, sourceOwnerId: r.owner_id, sourceOwnerName: r.owner_name || null, note: masterNote,
      also: "AND EXISTS (SELECT 1 FROM proposals WHERE id = ?12 AND status = 'submitted')", alsoArgs: [id],
    }),
    decided("AND EXISTS (SELECT 1 FROM master_versions WHERE version = ?8 AND created_at = ?2 AND created_by = ?3)", [version, id, version]),
    ]);
  } catch (e) {
    if (!(await isVersionRace(env, e, base))) throw e;
    ins = { meta: { changes: 0 } }; // another writer took this version number first: treated as a stale base
  }
  if (ins.meta?.changes !== 1) {
    const still = await env.DB.prepare("SELECT status FROM proposals WHERE id = ?1").bind(id).first();
    if (!still || still.status !== "submitted") throw new HttpError(409, DECIDED);
    await masterConflict(env);
  }
  await audit(env.DB, admin.id, "proposal.approve", id, `v${version}`);
  return json({ proposal: meta(await visible(env, admin, id), admin), version, applied: out.applied, addedCategories: out.addedCategories });
}
