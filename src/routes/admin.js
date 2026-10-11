// Admin-only endpoints. Every handler is reached only after requireAdmin() in the router.
import { HttpError, json, readJson } from "../lib/http.js";
import { audit } from "../lib/ratelimit.js";
import { requireId } from "../lib/validate.js";
import { newId, randomCode, encryptText, decryptText } from "../lib/crypto.js";
import { config, accessCodeHash, resetCodeHash } from "../lib/auth.js";

export const SET_SIZE = 5;
export const RESET_DAYS = 7; // a reset code works once, for this many days

async function decrypt(env, payload) {
  try {
    return await decryptText(config(env).phoneKey, payload);
  } catch {
    return null;
  }
}

/**
 * The owner: the first admin, the one the setup code resets. Only the owner makes or removes admins.
 * Pinned in settings (owner_id) the first time it's asked for, which is always before anyone can be made an admin,
 * so a promoted member whose account is older than the admin's can never become the owner. Without the settings
 * table (migration 0005 not applied yet) it is the oldest admin row, as before.
 */
export async function ownerId(env) {
  try {
    const pinned = await env.DB.prepare(
      "SELECT u.id FROM settings s JOIN users u ON u.id = s.value WHERE s.key = 'owner_id' AND u.role = 'admin'"
    ).first();
    if (pinned) return pinned.id;
  } catch {
    /* no settings table yet */
  }
  const row = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at, id LIMIT 1").first();
  if (!row) return null;
  try {
    await env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('owner_id', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
      .bind(row.id, Date.now())
      .run();
  } catch {
    /* no settings table yet */
  }
  return row.id;
}

/** GET /api/admin/overview -> the current set of codes, everyone with access, and who is asking ({id, owner}). */
export async function overview(env, admin) {
  // the current set = the batch of the newest code; canceled codes are never shown
  const latest = await env.DB.prepare("SELECT batch_id, created_at FROM access_codes ORDER BY created_at DESC, rowid DESC LIMIT 1").first();
  const codes = [];
  if (latest) {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.code_enc, c.created_at, c.used_at, u.first_name AS used_by_name
         FROM access_codes c LEFT JOIN users u ON u.id = c.used_by
        WHERE c.batch_id = ?1 AND c.revoked_at IS NULL
        ORDER BY c.created_at, c.rowid`
    )
      .bind(latest.batch_id)
      .all();
    for (const c of results) {
      const used = c.used_at !== null;
      codes.push({
        id: c.id,
        code: used ? null : await decrypt(env, c.code_enc),
        status: used ? "used" : "available",
        usedByName: used ? c.used_by_name ?? null : null,
        usedAt: c.used_at,
        createdAt: c.created_at,
      });
    }
  }

  const { results: members } = await env.DB.prepare(
    `SELECT u.id, u.first_name, u.role, u.username, u.password_hash IS NOT NULL AS has_password, u.created_at, u.last_login_at,
            (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
       FROM users u
      WHERE u.role IN ('member', 'admin') AND u.status = 'approved'
      ORDER BY u.role = 'admin' DESC, u.created_at DESC`
  ).all();
  // map counts come from the maps table (migration 0005); without it the dashboard still works (mapCount null)
  let counts = null;
  try {
    const { results } = await env.DB.prepare("SELECT owner_id, COUNT(*) AS n FROM maps GROUP BY owner_id").all();
    counts = new Map((results || []).map((r) => [r.owner_id, r.n]));
  } catch {
    counts = null;
  }
  const owner = await ownerId(env);
  const people = [];
  for (const u of members) {
    people.push({
      id: u.id,
      name: u.first_name,
      role: u.role,
      owner: u.id === owner,
      username: u.username || null,
      hasPassword: !!u.has_password,
      joinedAt: u.created_at,
      lastSeenAt: Math.max(u.last_seen_at || 0, u.last_login_at || 0) || null,
      mapCount: counts ? counts.get(u.id) || 0 : null,
    });
  }
  return json({ codes, batchCreatedAt: latest ? latest.created_at : null, people, me: { id: admin.id, owner: admin.id === owner } });
}

/**
 * POST /api/admin/codes/new-set: cancels every unused code and makes a new set of 5, in one transaction.
 * So there are never more than 5 usable codes. People already signed in keep their access.
 */
export async function newSet(env, admin) {
  const cfg = config(env);
  const now = Date.now();
  const batchId = newId("b_");
  const fresh = new Set();
  while (fresh.size < SET_SIZE) fresh.add(randomCode(2, 4));
  const stmts = [env.DB.prepare("UPDATE access_codes SET revoked_at = ?1 WHERE used_at IS NULL AND revoked_at IS NULL").bind(now)];
  for (const code of fresh) {
    stmts.push(
      env.DB.prepare("INSERT INTO access_codes (id, code_hash, code_enc, batch_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(
        newId("c_"),
        await accessCodeHash(env, code),
        await encryptText(cfg.phoneKey, code),
        batchId,
        now
      )
    );
  }
  const results = await env.DB.batch(stmts);
  const canceled = results[0]?.meta?.changes ?? 0;
  await audit(env.DB, admin.id, "codes.new_set", batchId, `${canceled} unused canceled`);
  return json({ ok: true });
}

/**
 * POST /api/admin/people/:id/reset-code -> {code, expiresAt}: a one-time code for one member who forgot their
 * password (or who joined before usernames). It works once, for 7 days; making another cancels the last one.
 * Their old password keeps working until they use the code. Only a hash is kept, so the code is shown just once.
 */
export async function resetCode(env, admin, id) {
  requireId(id);
  const u = await env.DB.prepare("SELECT id FROM users WHERE id = ?1 AND role = 'member' AND status = 'approved'").bind(id).first();
  if (!u) throw new HttpError(404, "Not found.");
  const now = Date.now();
  const code = randomCode(2, 4);
  const expiresAt = now + RESET_DAYS * 86400000;
  await env.DB.batch([
    env.DB.prepare("UPDATE login_codes SET revoked_at = ?1 WHERE user_id = ?2 AND purpose = 'login' AND used_at IS NULL AND revoked_at IS NULL").bind(now, id),
    env.DB.prepare("INSERT INTO login_codes (id, user_id, code_hash, purpose, created_at, expires_at) VALUES (?1, ?2, ?3, 'login', ?4, ?5)").bind(
      newId("r_"),
      id,
      await resetCodeHash(env, code),
      now,
      expiresAt
    ),
  ]);
  await audit(env.DB, admin.id, "member.reset_code", id);
  return json({ ok: true, code, expiresAt });
}

/**
 * POST /api/admin/people/:id/role {role: "admin" | "member"}: the owner makes a member an admin (full admin powers:
 * codes, people, reviews, the master map) or takes those powers back. Only the owner can, the owner's own role never
 * changes, and only someone with a username and password can become an admin (admins sign in with them).
 * The change applies on the person's very next request (the session reads the role every time).
 */
export async function setRole(request, env, admin, id) {
  requireId(id);
  const body = await readJson(request, 256);
  const role = body.role === "admin" ? "admin" : body.role === "member" ? "member" : null;
  if (!role) throw new HttpError(400, "Pick admin or member.");
  const owner = await ownerId(env);
  if (admin.id !== owner) throw new HttpError(403, "Only the first admin (the owner) can make or remove admins.");
  if (id === owner) throw new HttpError(400, "The owner always stays an admin.");
  const u = await env.DB.prepare("SELECT id, role, password_hash FROM users WHERE id = ?1 AND status = 'approved' AND role IN ('member', 'admin')").bind(id).first();
  if (!u) throw new HttpError(404, "Not found.");
  if (role === "admin" && !u.password_hash) {
    throw new HttpError(400, "They need a username and password first: make them a sign-in code, and once they've used it, try again.");
  }
  if (u.role !== role) {
    // the WHERE keeps the owner row out whatever happens in between
    await env.DB.prepare("UPDATE users SET role = ?1, updated_at = ?2 WHERE id = ?3 AND id != ?4").bind(role, Date.now(), id, owner).run();
    // reset codes are for members only: none may be left waiting for a new admin
    if (role === "admin") await env.DB.prepare("UPDATE login_codes SET revoked_at = ?1 WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL").bind(Date.now(), id).run();
    await audit(env.DB, admin.id, role === "admin" ? "admin.granted" : "admin.revoked", id);
  }
  return json({ ok: true, role });
}

/**
 * DELETE /api/admin/people/:id: removes a member and signs them out at once, and deletes their maps and
 * proposals. The admin can't be removed.
 */
export async function removePerson(env, admin, id) {
  requireId(id);
  const u = await env.DB.prepare("SELECT id FROM users WHERE id = ?1 AND role = 'member'").bind(id).first();
  if (!u) throw new HttpError(404, "Not found.");
  // the maps tables exist once migration 0005 is applied; removing people must keep working before that
  const { results: tables } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('maps', 'proposals', 'master_versions')").all();
  const has = new Set((tables || []).map((t) => t.name));
  // Sessions first, then their maps and proposals, then anything left from the old planner (in case foreign
  // keys aren't enforced), then the person. One transaction.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id),
    ...(has.has("proposals") ? [env.DB.prepare("DELETE FROM proposals WHERE owner_id = ?1").bind(id)] : []),
    ...(has.has("maps") ? [env.DB.prepare("DELETE FROM maps WHERE owner_id = ?1").bind(id)] : []),
    // the master history keeps what was applied, but no longer says who the person was
    ...(has.has("master_versions") ? [
      env.DB.prepare("UPDATE master_versions SET created_by_name = 'Removed member' WHERE created_by = ?1").bind(id),
      env.DB.prepare("UPDATE master_versions SET source_owner_name = 'Removed member' WHERE source_owner_id = ?1").bind(id),
    ] : []),
    env.DB.prepare("DELETE FROM grants WHERE viewer_id = ?1 OR owner_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM grants WHERE build_id IN (SELECT id FROM builds WHERE owner_id = ?1)").bind(id),
    env.DB.prepare("DELETE FROM builds WHERE owner_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM login_codes WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ?1 AND role = 'member'").bind(id),
  ]);
  await audit(env.DB, admin.id, "member.removed", id);
  return json({ ok: true });
}
