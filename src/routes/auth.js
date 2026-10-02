// Public sign-in endpoints: request access, verify a 6-digit code, AJ's first-time setup and recovery.
import { HttpError, json, readJson, clientIp, clearSessionCookie } from "../lib/http.js";
import { allow, audit } from "../lib/ratelimit.js";
import { notifyAdmin, alertsConfigured } from "../lib/notify.js";
import { normalizePhone, cleanFirstName, cleanWorkArea, cleanCode } from "../lib/validate.js";
import { newId, encryptText, sha256Hex, safeEqual, randomDigits, randomCode, hmacHex } from "../lib/crypto.js";
import { config, phoneHash, ipHash, codeHash, createSession, destroySession, publicUser } from "../lib/auth.js";

const MIN = 60000;
const BAD_CODE = "That code didn't work. Check the 6 digits, or ask AJ for a new one.";

function origin(request) {
  return new URL(request.url).origin;
}

export async function requestAccess(request, env, ctx) {
  const cfg = config(env);
  const iph = await ipHash(env, clientIp(request));
  if (!(await allow(env.DB, "req:ip:" + iph, 6, 3600))) {
    throw new HttpError(429, "Too many requests from this device. Try again in an hour.");
  }
  const body = await readJson(request, 4096);
  const firstName = cleanFirstName(body.firstName);
  const workArea = cleanWorkArea(body.workArea);
  const phone = normalizePhone(body.phone);
  if (!firstName) throw new HttpError(400, "Enter your first name using letters only.");
  if (!workArea) throw new HttpError(400, "Choose the area you work in.");
  if (!phone) throw new HttpError(400, "Enter a 10-digit US mobile number.");

  const ph = await phoneHash(env, phone);
  // Quietly cap repeat requests for one number; the answer looks the same either way.
  if (!(await allow(env.DB, "req:ph:" + ph.slice(0, 24), 4, 86400))) return json({ ok: true });

  const now = Date.now();
  const user = await env.DB.prepare("SELECT * FROM users WHERE phone_hash = ?1").bind(ph).first();
  let alert = null;
  const recently = (u) => u.last_request_at && now - u.last_request_at < 15 * MIN;

  if (!user) {
    const id = newId("u_");
    const phoneEnc = await encryptText(cfg.phoneKey, phone);
    await env.DB.prepare(
      `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, last_request_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'member', 'pending', 1, ?7, ?7, ?7)`
    )
      .bind(id, firstName, workArea, ph, phoneEnc, phone.slice(-4), now)
      .run();
    await audit(env.DB, null, "access.requested", id, `${firstName} · ${workArea}`);
    alert = { title: "New access request", message: `${firstName} (${workArea}) wants into the store planner. Open your dashboard to approve or deny.` };
  } else if (user.status === "pending") {
    await env.DB.prepare("UPDATE users SET first_name = ?1, work_area = ?2, last_request_at = ?3, updated_at = ?3 WHERE id = ?4")
      .bind(firstName, workArea, now, user.id)
      .run();
    if (!recently(user)) alert = { title: "Access request reminder", message: `${firstName} (${workArea}) is still waiting for approval.` };
  } else if (user.status === "approved") {
    await env.DB.prepare("UPDATE users SET needs_code = 1, last_request_at = ?1, updated_at = ?1 WHERE id = ?2").bind(now, user.id).run();
    await audit(env.DB, user.id, "code.requested");
    if (!recently(user)) alert = { title: "New sign-in code needed", message: `${user.first_name} (${user.work_area}) needs a new sign-in code.` };
  } else {
    await env.DB.prepare("UPDATE users SET last_request_at = ?1 WHERE id = ?2").bind(now, user.id).run();
    await audit(env.DB, user.id, "access.retry", null, user.status);
  }
  if (alert) ctx.waitUntil(notifyAdmin(env, { ...alert, click: origin(request) + "/admin/#requests" }));
  return json({ ok: true });
}

export async function verifyCode(request, env) {
  config(env);
  const iph = await ipHash(env, clientIp(request));
  if (!(await allow(env.DB, "ver:ip:" + iph, 20, 900))) throw new HttpError(429, "Too many tries. Wait 15 minutes and try again.");
  const body = await readJson(request, 2048);
  const phone = normalizePhone(body.phone);
  const code = cleanCode(body.code);
  if (!phone || !code) throw new HttpError(400, BAD_CODE);
  const ph = await phoneHash(env, phone);
  if (!(await allow(env.DB, "ver:ph:" + ph.slice(0, 24), 10, 3600))) throw new HttpError(429, "Too many tries. Wait an hour, or ask AJ for a new code.");

  const user = await env.DB.prepare("SELECT * FROM users WHERE phone_hash = ?1 AND status = 'approved'").bind(ph).first();
  if (!user) {
    await codeHash(env, "nobody", code); // keep timing similar
    throw new HttpError(400, BAD_CODE);
  }
  const now = Date.now();
  const { results: codes } = await env.DB.prepare(
    `SELECT id, code_hash, attempts, purpose FROM login_codes
      WHERE user_id = ?1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
      ORDER BY created_at DESC LIMIT 3`
  )
    .bind(user.id, now)
    .all();
  const h = await codeHash(env, user.id, code);
  const match = codes.find((c) => safeEqual(c.code_hash, h));
  if (!match) {
    if (codes[0]) {
      const tries = codes[0].attempts + 1;
      await env.DB.prepare("UPDATE login_codes SET attempts = ?1, revoked_at = CASE WHEN ?1 >= 5 THEN ?2 ELSE NULL END WHERE id = ?3")
        .bind(tries, now, codes[0].id)
        .run();
    }
    await audit(env.DB, user.id, "login.failed");
    throw new HttpError(400, BAD_CODE);
  }
  if (match.purpose === "admin" && user.role !== "admin") throw new HttpError(400, BAD_CODE);
  await env.DB.batch([
    env.DB.prepare("UPDATE login_codes SET used_at = ?1 WHERE id = ?2").bind(now, match.id),
    env.DB.prepare("UPDATE login_codes SET revoked_at = ?1 WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL").bind(now, user.id),
    env.DB.prepare("UPDATE users SET last_login_at = ?1, needs_code = 0, updated_at = ?1 WHERE id = ?2").bind(now, user.id),
  ]);
  const { cookie } = await createSession(env, user.id, request);
  await audit(env.DB, user.id, "login", null, match.purpose);
  return json({ ok: true, redirect: user.role === "admin" ? "/admin/" : "/app/" }, 200, { "Set-Cookie": cookie });
}

async function makeRecoveryCodes(env, userId) {
  const cfg = config(env);
  const codes = Array.from({ length: 8 }, () => randomCode(2, 4));
  const now = Date.now();
  const stmts = [env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?1").bind(userId)];
  for (const c of codes) {
    const h = await hmacHex(cfg.pepper, `rec:${userId}:${c.replace(/-/g, "")}`);
    stmts.push(env.DB.prepare("INSERT INTO recovery_codes (code_hash, user_id, created_at) VALUES (?1, ?2, ?3)").bind(h, userId, now));
  }
  await env.DB.batch(stmts);
  return codes;
}
export { makeRecoveryCodes };

/** AJ's one-time setup. Only works while no admin exists, with a setup code created on the server. */
export async function adminSetup(request, env) {
  const cfg = config(env);
  const iph = await ipHash(env, clientIp(request));
  if (!(await allow(env.DB, "setup:ip:" + iph, 10, 3600))) throw new HttpError(429, "Too many tries. Wait an hour.");
  const hasAdmin = await env.DB.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").first();
  if (hasAdmin) throw new HttpError(404, "Not found.");
  const body = await readJson(request, 2048);
  const setup = String(body.setupCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const firstName = cleanFirstName(body.firstName);
  const phone = normalizePhone(body.phone);
  if (!firstName) throw new HttpError(400, "Enter your first name using letters only.");
  if (!phone) throw new HttpError(400, "Enter a 10-digit US mobile number.");
  if (setup.length < 12) throw new HttpError(400, "That setup code didn't work.");
  const now = Date.now();
  const tokenHash = await sha256Hex("setup:" + setup);
  const tok = await env.DB.prepare("SELECT token_hash FROM setup_tokens WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2")
    .bind(tokenHash, now)
    .first();
  if (!tok) throw new HttpError(400, "That setup code didn't work.");

  const ph = await phoneHash(env, phone);
  const phoneEnc = await encryptText(cfg.phoneKey, phone);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE phone_hash = ?1").bind(ph).first();
  const id = existing?.id || newId("u_");
  const stmts = [env.DB.prepare("UPDATE setup_tokens SET used_at = ?1 WHERE token_hash = ?2").bind(now, tokenHash)];
  if (existing) {
    stmts.push(
      env.DB.prepare("UPDATE users SET role = 'admin', status = 'approved', first_name = ?1, work_area = 'Management', needs_code = 0, approved_at = ?2, updated_at = ?2, last_login_at = ?2 WHERE id = ?3").bind(firstName, now, id)
    );
  } else {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, approved_at, last_login_at)
         VALUES (?1, ?2, 'Management', ?3, ?4, ?5, 'admin', 'approved', 0, ?6, ?6, ?6, ?6)`
      ).bind(id, firstName, ph, phoneEnc, phone.slice(-4), now)
    );
  }
  await env.DB.batch(stmts);
  const recoveryCodes = await makeRecoveryCodes(env, id);
  const { cookie } = await createSession(env, id, request);
  await audit(env.DB, id, "admin.setup");
  return json({ ok: true, redirect: "/admin/", recoveryCodes }, 200, { "Set-Cookie": cookie });
}

/** AJ asks for a sign-in code, delivered to his own phone through the alert channel. */
export async function adminCode(request, env, ctx) {
  config(env);
  const iph = await ipHash(env, clientIp(request));
  if (!(await allow(env.DB, "acode:ip:" + iph, 5, 3600))) throw new HttpError(429, "Too many tries. Wait an hour.");
  const body = await readJson(request, 1024);
  const phone = normalizePhone(body.phone);
  if (!phone) return json({ ok: true });
  const ph = await phoneHash(env, phone);
  if (!(await allow(env.DB, "acode:ph:" + ph.slice(0, 24), 3, 3600))) return json({ ok: true });
  const admin = await env.DB.prepare("SELECT * FROM users WHERE phone_hash = ?1 AND role = 'admin' AND status = 'approved'").bind(ph).first();
  if (admin && alertsConfigured(env)) {
    const code = randomDigits(6);
    const now = Date.now();
    const h = await codeHash(env, admin.id, code);
    await env.DB.batch([
      env.DB.prepare("UPDATE login_codes SET revoked_at = ?1 WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL").bind(now, admin.id),
      env.DB.prepare("INSERT INTO login_codes (id, user_id, code_hash, purpose, created_at, expires_at) VALUES (?1, ?2, ?3, 'admin', ?4, ?5)").bind(
        newId("c_"), admin.id, h, now, now + 10 * MIN
      ),
    ]);
    ctx.waitUntil(
      notifyAdmin(env, {
        title: "Your sign-in code",
        message: `${code} is your FBS Store Planner sign-in code. It expires in 10 minutes. If you didn't ask for it, you can ignore this.`,
        priority: 5,
        tags: ["key"],
      })
    );
    await audit(env.DB, admin.id, "admin.code.sent");
  }
  return json({ ok: true });
}

export async function recover(request, env) {
  const cfg = config(env);
  const iph = await ipHash(env, clientIp(request));
  if (!(await allow(env.DB, "rec:ip:" + iph, 5, 3600))) throw new HttpError(429, "Too many tries. Wait an hour.");
  const body = await readJson(request, 1024);
  const phone = normalizePhone(body.phone);
  const rc = String(body.recoveryCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const FAIL = new HttpError(400, "That recovery code didn't work.");
  if (!phone || rc.length !== 8) throw FAIL;
  const ph = await phoneHash(env, phone);
  const admin = await env.DB.prepare("SELECT * FROM users WHERE phone_hash = ?1 AND role = 'admin' AND status = 'approved'").bind(ph).first();
  if (!admin) throw FAIL;
  const h = await hmacHex(cfg.pepper, `rec:${admin.id}:${rc}`);
  const row = await env.DB.prepare("SELECT code_hash FROM recovery_codes WHERE code_hash = ?1 AND user_id = ?2 AND used_at IS NULL").bind(h, admin.id).first();
  if (!row) {
    await audit(env.DB, admin.id, "recovery.failed");
    throw FAIL;
  }
  const now = Date.now();
  await env.DB.prepare("UPDATE recovery_codes SET used_at = ?1 WHERE code_hash = ?2").bind(now, h).run();
  const { cookie } = await createSession(env, admin.id, request);
  await audit(env.DB, admin.id, "recovery.used");
  return json({ ok: true, redirect: "/admin/" }, 200, { "Set-Cookie": cookie });
}

export async function logout(env, sess) {
  if (sess) {
    await destroySession(env, sess.tokenHash);
    await audit(env.DB, sess.user.id, "logout");
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

export function me(sess) {
  if (!sess) throw new HttpError(401, "Please sign in.");
  return json({ user: publicUser(sess.user) });
}
