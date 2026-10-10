// Sign-in and account endpoints: admin username + password, first-time setup / reset, me, logout.
import { HttpError, json, readJson, rateIp, clearSessionCookie } from "../lib/http.js";
import { allow, audit } from "../lib/ratelimit.js";
import { normalizeCode, cleanUsername } from "../lib/validate.js";
import { newId, encryptText, hmacHex } from "../lib/crypto.js";
import { config, setupTokenHash, limitKey, createSession, destroySession, requireAdmin } from "../lib/auth.js";
import { checkNewPassword, hashPassword, verifyPassword } from "../lib/password.js";

const BAD_LOGIN = "That username and password don't match.";
const BAD_SETUP = "That setup code doesn't work. It may be used or expired.";
const TOO_MANY = "Too many tries. Wait 15 minutes and try again.";
const USERNAME_RULES = "Pick a username of 3 to 40 letters, numbers, dots, dashes or underscores.";
const USERNAME_TAKEN = "That username belongs to another account. Pick a different one.";
const badSetup = () => new HttpError(400, BAD_SETUP, { field: "setupCode" });

/** POST /api/admin/login {username, password} */
export async function adminLogin(request, env, ctx) {
  config(env);
  const ipKey = "alog:ip:" + (await limitKey(env, "ip", rateIp(request)));
  if (!(await allow(env.DB, ipKey, 10, 900))) throw new HttpError(429, TOO_MANY);
  const body = await readJson(request, 2048);
  const username = typeof body.username === "string" ? body.username.trim().slice(0, 100) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const userKey = "alog:u:" + (await limitKey(env, "user", username.toLowerCase()));
  if (!(await allow(env.DB, userKey, 10, 900))) throw new HttpError(429, TOO_MANY);

  const row = username
    ? await env.DB.prepare(
        `SELECT id, password_hash, password_salt FROM users
          WHERE lower(username) = lower(?1) AND role = 'admin' AND status = 'approved'
          ORDER BY created_at LIMIT 1`
      )
        .bind(username)
        .first()
    : null;
  // verifyPassword runs PBKDF2 even when there's no such user, so the answer takes the same time either way
  if (!(await verifyPassword(env, password, row))) {
    // The failure is noted after the answer has gone (waitUntil), with one identical audit row whether or not the
    // username exists (no actor, no username), so neither the timing nor the work done can tell the two apart.
    // Lockouts are the per-IP and per-username rate limits above; nothing is counted on the users row.
    const note = audit(env.DB, null, "admin.login_failed");
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(note);
    throw new HttpError(400, BAD_LOGIN);
  }
  await env.DB.prepare("UPDATE users SET pw_attempts = 0, last_login_at = ?1 WHERE id = ?2").bind(Date.now(), row.id).run();
  const { cookie } = await createSession(env, row.id, request);
  await audit(env.DB, row.id, "admin.login");
  return json({ ok: true, redirect: "/admin/" }, 200, { "Set-Cookie": cookie });
}

/**
 * POST /api/admin/setup {setupCode, username, password}
 * First-time setup or password reset with a one-time setup code (made with `npm run setup-code`).
 * Keeps the existing admin row (the oldest one) and only replaces its username and password.
 */
export async function adminSetup(request, env) {
  const cfg = config(env);
  const ipKey = "setup:ip:" + (await limitKey(env, "ip", rateIp(request)));
  if (!(await allow(env.DB, ipKey, 10, 3600))) throw new HttpError(429, "Too many tries. Wait an hour and try again.");
  const body = await readJson(request, 2048);
  const code = normalizeCode(typeof body.setupCode === "string" ? body.setupCode : "");
  if (!code) throw badSetup();
  const username = cleanUsername(body.username);
  if (!username) throw new HttpError(400, USERNAME_RULES, { field: "username" });
  const password = checkNewPassword(body.password);

  const now = Date.now();
  const tokenHash = await setupTokenHash(code);
  const token = await env.DB.prepare("SELECT token_hash FROM setup_tokens WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2")
    .bind(tokenHash, now)
    .first();
  if (!token) throw badSetup();

  const admin = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at, id LIMIT 1").first();
  const taken = await env.DB.prepare("SELECT id FROM users WHERE lower(username) = lower(?1) AND id != ?2")
    .bind(username, admin?.id ?? "")
    .first();
  if (taken) throw new HttpError(400, USERNAME_TAKEN, { field: "username" });
  const pw = await hashPassword(env, password);

  // Use up the setup code. Only one request can win this UPDATE.
  const used = await env.DB.prepare("UPDATE setup_tokens SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1")
    .bind(now, tokenHash)
    .run();
  if (used.meta?.changes !== 1) throw badSetup();

  let id = admin?.id;
  try {
    if (id) {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE users SET username = ?1, password_hash = ?2, password_salt = ?3, password_set_at = ?4, pw_attempts = 0,
                  status = 'approved', updated_at = ?4, last_login_at = ?4
            WHERE id = ?5`
        ).bind(username, pw.hash, pw.salt, now, id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id), // signs out every old session
      ]);
    } else {
      id = newId("u_");
      // the admin has no phone number: a unique placeholder hash that no real phone can produce
      const placeholder = await hmacHex(cfg.pepper, "admin:" + id);
      await env.DB.prepare(
        `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code,
                            created_at, updated_at, approved_at, last_login_at, password_hash, password_salt, password_set_at, pw_attempts, username)
         VALUES (?1, 'Admin', '', ?2, ?3, '', 'admin', 'approved', 0, ?4, ?4, ?4, ?4, ?5, ?6, ?4, 0, ?7)`
      )
        .bind(id, placeholder, await encryptText(cfg.phoneKey, ""), now, pw.hash, pw.salt, username)
        .run();
    }
  } catch (e) {
    // give the setup code back so it can be tried again
    await env.DB.prepare("UPDATE setup_tokens SET used_at = NULL WHERE token_hash = ?1 AND used_at = ?2").bind(tokenHash, now).run();
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(400, USERNAME_TAKEN, { field: "username" });
    throw e;
  }
  const { cookie } = await createSession(env, id, request);
  await audit(env.DB, id, "admin.setup");
  return json({ ok: true, redirect: "/admin/" }, 200, { "Set-Cookie": cookie });
}

/** POST /api/admin/password {currentPassword, newPassword} (admin session). Signs out the admin's other sessions. */
export async function changePassword(request, env, sess) {
  const admin = requireAdmin(sess);
  const key = "pwchg:u:" + (await limitKey(env, "user", admin.id));
  if (!(await allow(env.DB, key, 10, 900))) throw new HttpError(429, TOO_MANY);
  const body = await readJson(request, 2048);
  const row = await env.DB.prepare("SELECT id, password_hash, password_salt FROM users WHERE id = ?1").bind(admin.id).first();
  if (!(await verifyPassword(env, typeof body.currentPassword === "string" ? body.currentPassword : "", row))) {
    throw new HttpError(400, "Your current password isn't right.", { field: "currentPassword" });
  }
  const password = checkNewPassword(body.newPassword);
  const pw = await hashPassword(env, password);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?1, password_salt = ?2, password_set_at = ?3, pw_attempts = 0, updated_at = ?3 WHERE id = ?4").bind(
      pw.hash,
      pw.salt,
      now,
      admin.id
    ),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2").bind(admin.id, sess.tokenHash),
  ]);
  await audit(env.DB, admin.id, "admin.password");
  return json({ ok: true });
}

/** POST /api/logout: ends this session and clears the cookie. */
export async function logout(env, sess) {
  if (sess) await destroySession(env, sess.tokenHash);
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

/** GET /api/me -> {id, name, role} */
export function me(sess) {
  if (!sess) throw new HttpError(401, "Please sign in.");
  return json({ id: sess.user.id, name: sess.user.first_name, role: sess.user.role });
}
