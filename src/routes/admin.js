// Admin-only endpoints. Every handler is reached only after requireAdmin() in the router.
import { HttpError, json } from "../lib/http.js";
import { audit } from "../lib/ratelimit.js";
import { formatPhone, requireId } from "../lib/validate.js";
import { newId, randomCode, encryptText, decryptText } from "../lib/crypto.js";
import { config, accessCodeHash } from "../lib/auth.js";

export const SET_SIZE = 5;

async function decrypt(env, payload) {
  try {
    return await decryptText(config(env).phoneKey, payload);
  } catch {
    return null;
  }
}

/** GET /api/admin/overview -> the current set of codes and everyone with access. */
export async function overview(env) {
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
    `SELECT u.id, u.first_name, u.phone_enc, u.created_at, u.last_login_at,
            (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
       FROM users u
      WHERE u.role = 'member' AND u.status = 'approved'
      ORDER BY u.created_at DESC`
  ).all();
  // map counts come from the maps table (migration 0005); without it the dashboard still works (mapCount null)
  let counts = null;
  try {
    const { results } = await env.DB.prepare("SELECT owner_id, COUNT(*) AS n FROM maps GROUP BY owner_id").all();
    counts = new Map((results || []).map((r) => [r.owner_id, r.n]));
  } catch {
    counts = null;
  }
  const people = [];
  for (const u of members) {
    const e164 = (await decrypt(env, u.phone_enc)) || "";
    people.push({
      id: u.id,
      name: u.first_name,
      phone: formatPhone(e164),
      tel: e164,
      joinedAt: u.created_at,
      lastSeenAt: Math.max(u.last_seen_at || 0, u.last_login_at || 0) || null,
      mapCount: counts ? counts.get(u.id) || 0 : null,
    });
  }
  return json({ codes, batchCreatedAt: latest ? latest.created_at : null, people });
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
 * DELETE /api/admin/people/:id: removes a member and signs them out at once, and deletes their maps and
 * proposals. The admin can't be removed.
 */
export async function removePerson(env, admin, id) {
  requireId(id);
  const u = await env.DB.prepare("SELECT id FROM users WHERE id = ?1 AND role = 'member'").bind(id).first();
  if (!u) throw new HttpError(404, "Not found.");
  // the maps tables exist once migration 0005 is applied; removing people must keep working before that
  const { results: tables } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('maps', 'proposals')").all();
  const has = new Set((tables || []).map((t) => t.name));
  // Sessions first, then their maps and proposals, then anything left from the old planner (in case foreign
  // keys aren't enforced), then the person. One transaction.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id),
    ...(has.has("proposals") ? [env.DB.prepare("DELETE FROM proposals WHERE owner_id = ?1").bind(id)] : []),
    ...(has.has("maps") ? [env.DB.prepare("DELETE FROM maps WHERE owner_id = ?1").bind(id)] : []),
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
