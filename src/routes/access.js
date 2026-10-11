// Visitors: check a code from the admin, then either make a profile (an access code: name, username, password)
// or pick a new password (a reset code the admin made for one person). No phone numbers.
import { HttpError, json, readJson, rateIp } from "../lib/http.js";
import { allow, uncount, audit } from "../lib/ratelimit.js";
import { normalizeCode, cleanName, cleanUsername, NAME_ERROR } from "../lib/validate.js";
import { newId, encryptText, hmacHex } from "../lib/crypto.js";
import { config, accessCodeHash, resetCodeHash, limitKey, createSession } from "../lib/auth.js";
import { checkNewPassword, hashPassword } from "../lib/password.js";

const BAD_CODE = "That code doesn't work. Check it, or ask for a new one.";
const TOO_MANY = "Too many tries. Wait 15 minutes and try again.";
export const USERNAME_RULES = "Pick a username of 3 to 40 letters, numbers, dots, dashes or underscores.";
export const USERNAME_TAKEN = "That username belongs to another account. Pick a different one.";
const FAIL_LIMIT = 10; // failed checks + redeems per IP (an IPv6 /64 counts as one IP)
const FAIL_WINDOW = 15 * 60; // seconds

/** The one answer for wrong, used, expired and canceled codes. */
function badCode() {
  return new HttpError(400, BAD_CODE, { field: "code" });
}
function usernameTaken() {
  return new HttpError(400, USERNAME_TAKEN, { field: "username" });
}
// Only these count against the limit: a wrong code, and a taken username (so a working code can't be used to
// test usernames one after another without limit).
const counts = (e) => e instanceof HttpError && e.status === 400 && (e.message === BAD_CODE || e.message === USERNAME_TAKEN);

/**
 * Runs one code attempt under the per-IP limit of 10 failures per 15 minutes.
 * The attempt is counted before anything else, in one atomic statement, so a burst of requests sent at
 * the same moment can't all slip in under the limit. It is given back afterwards unless the code was
 * wrong, used or canceled: only failures count.
 */
async function underLimit(env, request, attempt) {
  const key = "acc:ip:" + (await limitKey(env, "ip", rateIp(request)));
  if (!(await allow(env.DB, key, FAIL_LIMIT, FAIL_WINDOW))) throw new HttpError(429, TOO_MANY);
  let failed = false;
  try {
    return await attempt();
  } catch (e) {
    failed = counts(e);
    throw e;
  } finally {
    if (!failed) await uncount(env.DB, key);
  }
}

function codeFrom(body) {
  return normalizeCode(typeof body.code === "string" ? body.code : "");
}

/** The id of an access code nobody has used and that hasn't been canceled, or null. */
async function usableCode(env, codeHash) {
  return env.DB.prepare("SELECT id FROM access_codes WHERE code_hash = ?1 AND used_at IS NULL AND revoked_at IS NULL").bind(codeHash).first();
}

/**
 * A reset code the admin made for one member (login_codes, purpose 'login'), unused, not canceled, not expired,
 * whose member still has access: {id, user_id, first_name, username}, or null.
 */
async function usableReset(env, codeHash, now) {
  return env.DB.prepare(
    `SELECT lc.id, lc.user_id, u.first_name, u.username
       FROM login_codes lc JOIN users u ON u.id = lc.user_id
      WHERE lc.code_hash = ?1 AND lc.purpose = 'login' AND lc.used_at IS NULL AND lc.revoked_at IS NULL AND lc.expires_at > ?2
        AND u.role = 'member' AND u.status = 'approved'`
  )
    .bind(codeHash, now)
    .first();
}

/** True when another account already has this username (any letter case). */
async function taken(env, username, exceptId) {
  return !!(await env.DB.prepare("SELECT id FROM users WHERE lower(username) = lower(?1) AND id != ?2").bind(username, exceptId).first());
}

/**
 * POST /api/access/check {code} -> {ok:true, kind:"join"} for an access code, or
 * {ok:true, kind:"reset", name, username} for a reset code. Doesn't use the code up.
 */
export async function check(request, env) {
  config(env);
  return underLimit(env, request, async () => {
    const code = codeFrom(await readJson(request, 1024));
    if (code.length !== 8) throw badCode();
    if (await usableCode(env, await accessCodeHash(env, code))) return json({ ok: true, kind: "join" });
    const reset = await usableReset(env, await resetCodeHash(env, code), Date.now());
    if (reset) return json({ ok: true, kind: "reset", name: reset.first_name, username: reset.username || "" });
    throw badCode();
  });
}

/**
 * POST /api/access/redeem {code, name, username, password} -> uses the access code once, makes the person's
 * profile and signs them in. Next time they sign in with the username and password (POST /api/login).
 */
export async function redeem(request, env) {
  const cfg = config(env);
  return underLimit(env, request, async () => {
    const body = await readJson(request, 2048);
    const code = codeFrom(body);
    if (code.length !== 8) throw badCode();
    const name = cleanName(body.name);
    if (!name) throw new HttpError(400, NAME_ERROR, { field: "name" });
    const username = cleanUsername(body.username);
    if (!username) throw new HttpError(400, USERNAME_RULES, { field: "username" });
    const password = checkNewPassword(body.password);

    // 1. The code must work before anything else is looked at, so a wrong code tells nothing about usernames.
    const codeHash = await accessCodeHash(env, code);
    if (!(await usableCode(env, codeHash))) throw badCode();
    const id = newId("u_");
    if (await taken(env, username, id)) throw usernameTaken();
    const pw = await hashPassword(env, password);
    const now = Date.now();

    // 2. Use up the code. Only one request can win this UPDATE, so two people racing on one code can't both get in.
    const used = await env.DB.prepare(
      "UPDATE access_codes SET used_at = ?1, used_by = ?2 WHERE code_hash = ?3 AND used_at IS NULL AND revoked_at IS NULL"
    )
      .bind(now, id, codeHash)
      .run();
    if (used.meta?.changes !== 1) throw badCode();

    // 3. Make the member. There is no phone number: phone_hash gets a unique placeholder no phone can produce
    //    (the column is NOT NULL UNIQUE from the first version of the site), phone_enc an encrypted empty string.
    try {
      await env.DB.prepare(
        `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at,
                            approved_at, last_login_at, username, password_hash, password_salt, password_set_at, pw_attempts)
         VALUES (?1, ?2, '', ?3, ?4, '', 'member', 'approved', 0, ?5, ?5, ?5, ?5, ?6, ?7, ?8, ?5, 0)`
      )
        .bind(id, name, await hmacHex(cfg.pepper, "member:" + id), await encryptText(cfg.phoneKey, ""), now, username, pw.hash, pw.salt)
        .run();
    } catch (e) {
      await putBack(env, codeHash, now, id);
      if (/UNIQUE/i.test(String(e && e.message))) throw usernameTaken(); // someone took the username a moment ago
      throw e;
    }
    const { cookie } = await createSession(env, id, request);
    await audit(env.DB, id, "member.joined");
    return json({ ok: true, redirect: "/" }, 200, { "Set-Cookie": cookie });
  });
}

/**
 * POST /api/access/reset {code, username, password} -> uses the member's reset code once, sets their username and
 * password, signs out their other devices and signs them in here. Their maps and proposals stay theirs.
 */
export async function reset(request, env) {
  config(env);
  return underLimit(env, request, async () => {
    const body = await readJson(request, 2048);
    const code = codeFrom(body);
    if (code.length !== 8) throw badCode();
    const username = cleanUsername(body.username);
    if (!username) throw new HttpError(400, USERNAME_RULES, { field: "username" });
    const password = checkNewPassword(body.password);

    const now = Date.now();
    const row = await usableReset(env, await resetCodeHash(env, code), now);
    if (!row) throw badCode();
    if (await taken(env, username, row.user_id)) throw usernameTaken();
    const pw = await hashPassword(env, password);

    // use up the code (only one request can win this UPDATE)
    const used = await env.DB.prepare("UPDATE login_codes SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?1")
      .bind(now, row.id)
      .run();
    if (used.meta?.changes !== 1) throw badCode();
    try {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE users SET username = ?1, password_hash = ?2, password_salt = ?3, password_set_at = ?4, pw_attempts = 0,
                  updated_at = ?4, last_login_at = ?4
            WHERE id = ?5 AND role = 'member'`
        ).bind(username, pw.hash, pw.salt, now, row.user_id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(row.user_id), // signs out every old session
      ]);
    } catch (e) {
      await env.DB.prepare("UPDATE login_codes SET used_at = NULL WHERE id = ?1 AND used_at = ?2").bind(row.id, now).run();
      if (/UNIQUE/i.test(String(e && e.message))) throw usernameTaken();
      throw e;
    }
    const { cookie } = await createSession(env, row.user_id, request);
    await audit(env.DB, row.user_id, "member.password_reset");
    return json({ ok: true, redirect: "/" }, 200, { "Set-Cookie": cookie });
  });
}

/**
 * Undoes step 2 of redeem after an unexpected failure. The code becomes usable again only while it still belongs to the
 * newest set; if a new set was made in the meantime it is canceled instead, so there are never more than 5
 * usable codes (and never one the dashboard doesn't show).
 */
async function putBack(env, codeHash, usedAt, usedBy) {
  await env.DB.prepare(
    `UPDATE access_codes
        SET used_at = NULL, used_by = NULL,
            revoked_at = CASE WHEN batch_id = (SELECT batch_id FROM access_codes ORDER BY created_at DESC, rowid DESC LIMIT 1)
                              THEN NULL ELSE ?4 END
      WHERE code_hash = ?1 AND used_at = ?2 AND used_by = ?3`
  )
    .bind(codeHash, usedAt, usedBy, Date.now())
    .run();
}
