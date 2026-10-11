// Secrets, keyed hashes, and sessions. Nothing here trusts anything but the database.
import { HttpError, parseCookies, SESSION_COOKIE, sessionCookie } from "./http.js";
import { randomBytes, toB64Url, sha256Hex, hmacHex, fromB64 } from "./crypto.js";
import { normalizeCode } from "./validate.js";

const DAY = 86400000;
export const SESSION_DAYS = 30;
export const ABSOLUTE_DAYS = 90;
const SLIDE_EVERY = 10 * 60000; // refresh last_seen_at / expires_at at most every 10 minutes

// ---------- secrets ----------

function readConfig(env) {
  const pepper = typeof env.PEPPER === "string" ? env.PEPPER : "";
  const phoneKey = typeof env.PHONE_KEY === "string" ? env.PHONE_KEY : "";
  let keyOk = false;
  try {
    keyOk = fromB64(phoneKey).length === 32;
  } catch {
    keyOk = false;
  }
  return pepper.length >= 32 && keyOk ? { pepper, phoneKey } : null;
}

/** True when PEPPER and PHONE_KEY look right. */
export function configured(env) {
  return readConfig(env) !== null;
}

/** Fails closed (503) when the server secrets are missing or malformed. */
export function config(env) {
  const cfg = readConfig(env);
  if (!cfg) throw new HttpError(503, "The site isn't set up yet.");
  return cfg;
}

// ---------- keyed hashes (the operator creates production rows by hand with these exact formulas) ----------

/** access_codes.code_hash = HMAC-SHA256(PEPPER, "access:" + normalized code) */
export function accessCodeHash(env, code) {
  return hmacHex(config(env).pepper, "access:" + normalizeCode(code));
}

/** login_codes.code_hash of a member's password reset code = HMAC-SHA256(PEPPER, "reset:" + normalized code) */
export function resetCodeHash(env, code) {
  return hmacHex(config(env).pepper, "reset:" + normalizeCode(code));
}

/** setup_tokens.token_hash = SHA-256("setup:" + normalized code) (no secret, so it can be made offline) */
export function setupTokenHash(code) {
  return sha256Hex("setup:" + normalizeCode(code));
}

/** Short keyed hash of an IP address or another identifier, for rate-limit keys. */
export async function limitKey(env, kind, value) {
  return (await hmacHex(config(env).pepper, kind + ":" + value)).slice(0, 24);
}

// ---------- sessions ----------

export async function createSession(env, userId, request) {
  const token = toB64Url(randomBytes(32));
  const hash = await sha256Hex(token);
  const now = Date.now();
  const ua = (request.headers.get("User-Agent") || "").slice(0, 160);
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, absolute_expires_at, user_agent) VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6)"
  )
    .bind(hash, userId, now, now + SESSION_DAYS * DAY, now + ABSOLUTE_DAYS * DAY, ua)
    .run();
  // The cookie is kept for the full 90 days; the server ends the session sooner after 30 days without a visit
  // (expires_at slides on every visit). A 30-day cookie would be dropped 30 days after sign-in, however often
  // the person came back, and a member then needs a new single-use code.
  return { cookie: sessionCookie(token, ABSOLUTE_DAYS * 86400), hash };
}

/**
 * Returns { user, tokenHash } for a valid session, otherwise null.
 * The users row is joined on every request, so a removed person is signed out on their next request.
 */
export async function loadSession(env, request) {
  config(env);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || token.length < 30 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.last_seen_at, s.absolute_expires_at, u.id, u.first_name, u.role, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND s.absolute_expires_at > ?2 AND u.status = 'approved'`
  )
    .bind(hash, now)
    .first();
  if (!row) return null;
  if (now - row.last_seen_at > SLIDE_EVERY) {
    // only the first of several requests arriving together writes: the others find last_seen_at already moved
    const exp = Math.min(now + SESSION_DAYS * DAY, row.absolute_expires_at);
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ?1, expires_at = ?2 WHERE token_hash = ?3 AND last_seen_at < ?4")
      .bind(now, exp, hash, now - SLIDE_EVERY)
      .run();
  }
  return { user: row, tokenHash: hash };
}

export function requireUser(sess) {
  if (!sess) throw new HttpError(401, "Please sign in.");
  return sess.user;
}

export function requireAdmin(sess) {
  const u = requireUser(sess);
  if (u.role !== "admin") throw new HttpError(403, "Only the site's admin can do that.");
  return u;
}

export async function destroySession(env, tokenHash) {
  if (tokenHash) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
}
