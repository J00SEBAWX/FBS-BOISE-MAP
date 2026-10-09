// Visitors: check an access code, then redeem it with a name and mobile number to get a session.
import { HttpError, json, readJson, rateIp } from "../lib/http.js";
import { allow, uncount, audit } from "../lib/ratelimit.js";
import { normalizeCode, normalizePhone, cleanName, PHONE_ERROR, NAME_ERROR } from "../lib/validate.js";
import { newId, encryptText } from "../lib/crypto.js";
import { config, phoneHash, accessCodeHash, limitKey, createSession } from "../lib/auth.js";

const BAD_CODE = "That code doesn't work. Check it, or ask for a new one.";
const BAD_PHONE = "That phone number can't be used here.";
const TOO_MANY = "Too many tries. Wait 15 minutes and try again.";
const FAIL_LIMIT = 10; // failed checks + redeems per IP (an IPv6 /64 counts as one IP)
const FAIL_WINDOW = 15 * 60; // seconds

/** The one answer for wrong, used and canceled codes. Only this error counts against the limit. */
function badCode() {
  return new HttpError(400, BAD_CODE, { field: "code" });
}
const isBadCode = (e) => e instanceof HttpError && e.status === 400 && e.message === BAD_CODE;

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
    failed = isBadCode(e);
    throw e;
  } finally {
    if (!failed) await uncount(env.DB, key);
  }
}

function codeFrom(body) {
  return normalizeCode(typeof body.code === "string" ? body.code : "");
}

/** The id of a code nobody has used and that hasn't been canceled, or null. */
async function usableCode(env, codeHash) {
  return env.DB.prepare("SELECT id FROM access_codes WHERE code_hash = ?1 AND used_at IS NULL AND revoked_at IS NULL").bind(codeHash).first();
}

/** POST /api/access/check {code} -> {ok:true} when the code is usable. Doesn't use it up. */
export async function check(request, env) {
  config(env);
  return underLimit(env, request, async () => {
    const code = codeFrom(await readJson(request, 1024));
    if (code.length !== 8) throw badCode();
    if (!(await usableCode(env, await accessCodeHash(env, code)))) throw badCode();
    return json({ ok: true });
  });
}

/** POST /api/access/redeem {code, name, phone} -> uses the code once, creates (or reuses) the person, signs them in. */
export async function redeem(request, env) {
  const cfg = config(env);
  return underLimit(env, request, async () => {
    const body = await readJson(request, 2048);
    const code = codeFrom(body);
    if (code.length !== 8) throw badCode();
    const name = cleanName(body.name);
    if (!name) throw new HttpError(400, NAME_ERROR, { field: "name" });
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpError(400, PHONE_ERROR, { field: "phone" });

    // 1. The code must work before anything else is looked at, so a wrong code tells nothing about phone numbers.
    const codeHash = await accessCodeHash(env, code);
    if (!(await usableCode(env, codeHash))) throw badCode();

    // 2. Same phone = same person (whatever their old status). An admin's number is refused here, before the
    //    code is touched: using it up and handing it back later could revive a code a new set canceled meanwhile.
    const ph = await phoneHash(env, phone);
    const existing = await env.DB.prepare("SELECT id, role FROM users WHERE phone_hash = ?1").bind(ph).first();
    if (existing && existing.role !== "member") throw new HttpError(400, BAD_PHONE, { field: "phone" });
    const candidate = existing?.id || newId("u_");
    const now = Date.now();

    // 3. Use up the code. Only one request can win this UPDATE, so two people racing on one code can't both get in.
    const used = await env.DB.prepare(
      "UPDATE access_codes SET used_at = ?1, used_by = ?2 WHERE code_hash = ?3 AND used_at IS NULL AND revoked_at IS NULL"
    )
      .bind(now, candidate, codeHash)
      .run();
    if (used.meta?.changes !== 1) throw badCode();

    // 4. Create the member, or bring the same member back. The WHERE keeps an admin row from ever being taken over.
    let row;
    try {
      row = await env.DB.prepare(
        `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, approved_at, last_login_at)
         VALUES (?1, ?2, '', ?3, ?4, ?5, 'member', 'approved', 0, ?6, ?6, ?6, ?6)
         ON CONFLICT (phone_hash) DO UPDATE SET
           first_name = excluded.first_name, status = 'approved', needs_code = 0,
           updated_at = excluded.updated_at, approved_at = excluded.approved_at, last_login_at = excluded.last_login_at
         WHERE users.role = 'member'
         RETURNING id`
      )
        .bind(candidate, name, ph, await encryptText(cfg.phoneKey, phone), phone.slice(-4), now)
        .first();
    } catch (e) {
      await putBack(env, codeHash, now, candidate);
      throw e;
    }
    if (!row) {
      await putBack(env, codeHash, now, candidate);
      throw new HttpError(400, BAD_PHONE, { field: "phone" });
    }
    if (row.id !== candidate) {
      await env.DB.prepare("UPDATE access_codes SET used_by = ?1 WHERE code_hash = ?2").bind(row.id, codeHash).run();
    }
    const { cookie } = await createSession(env, row.id, request);
    await audit(env.DB, row.id, existing ? "member.rejoined" : "member.joined");
    return json({ ok: true, redirect: "/" }, 200, { "Set-Cookie": cookie });
  });
}

/**
 * Undoes step 3 after an unexpected failure. The code becomes usable again only while it still belongs to the
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
