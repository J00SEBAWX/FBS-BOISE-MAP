// Fixed-window rate limits and the audit log, both stored in D1.

/** Counts one attempt. Returns true while the count is within the limit. */
export async function allow(db, key, limit, windowSec) {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at < ?3 THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at < ?3 THEN ?2 ELSE rate_limits.reset_at END
       RETURNING count`
    )
    .bind(key, now + windowSec * 1000, now)
    .first();
  return (row?.count ?? 1) <= limit;
}

/** Gives back one attempt counted by allow() (for limits that only count failures). Never throws. */
export async function uncount(db, key) {
  try {
    await db.prepare("UPDATE rate_limits SET count = MAX(count - 1, 0) WHERE key = ?1").bind(key).run();
  } catch {
    /* the worst case is one extra counted attempt */
  }
}

/** Records an action. Never stores secrets, codes or phone numbers. */
export async function audit(db, actorId, action, target = null, detail = null) {
  try {
    await db
      .prepare("INSERT INTO audit_log (at, actor_id, action, target, detail) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(Date.now(), actorId, action, target, detail ? String(detail).slice(0, 300) : null)
      .run();
  } catch {
    /* auditing must never break the request */
  }
}

/** Housekeeping: clears expired rows. Called from normal traffic (see worker.js). */
export async function prune(db) {
  const now = Date.now();
  const day = 86400000;
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at < ?1 OR absolute_expires_at < ?1").bind(now),
    db.prepare("DELETE FROM login_codes WHERE expires_at < ?1").bind(now - 7 * day),
    db.prepare("DELETE FROM rate_limits WHERE reset_at < ?1").bind(now - day),
    db.prepare("DELETE FROM audit_log WHERE at < ?1").bind(now - 365 * day),
    db.prepare("DELETE FROM setup_tokens WHERE expires_at < ?1").bind(now - 30 * day),
  ]);
  // separate statement: keeps the rest working on a database that doesn't have access_codes yet
  await db.prepare("DELETE FROM access_codes WHERE revoked_at IS NOT NULL AND revoked_at < ?1").bind(now - 90 * day).run();
  await pruneMasterVersions(db);
}

/** Keeps the newest `keep` master versions (the current master is always the newest). Never throws. */
export async function pruneMasterVersions(db, keep = 200) {
  try {
    await db.prepare("DELETE FROM master_versions WHERE version <= (SELECT MAX(version) FROM master_versions) - ?1").bind(keep).run();
  } catch {
    /* no master_versions table yet (migration 0005 not applied) */
  }
}
