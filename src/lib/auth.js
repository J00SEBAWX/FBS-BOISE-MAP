// Sessions and server-side identity checks.
import { HttpError, parseCookies, SESSION_COOKIE, sessionCookie } from "./http.js";
import { randomBytes, toB64Url, sha256Hex, hmacHex, fromB64 } from "./crypto.js";

const DAY = 86400000;
export const SESSION_DAYS = 30;
export const ABSOLUTE_DAYS = 90;

/** Fails closed when the server secrets are missing or malformed. */
export function config(env) {
  const pepper = env.PEPPER || "";
  const phoneKey = env.PHONE_KEY || "";
  let keyOk = false;
  try {
    keyOk = fromB64(phoneKey).length === 32;
  } catch {
    keyOk = false;
  }
  if (pepper.length < 32 || !keyOk) {
    throw new HttpError(503, "The planner isn't set up yet. AJ needs to finish the server setup.");
  }
  return { pepper, phoneKey };
}

export async function phoneHash(env, e164) {
  return hmacHex(config(env).pepper, "phone:" + e164);
}

export async function ipHash(env, ip) {
  return (await hmacHex(config(env).pepper, "ip:" + ip)).slice(0, 24);
}

export async function codeHash(env, userId, code) {
  return hmacHex(config(env).pepper, `code:${userId}:${code}`);
}

export function publicUser(u) {
  return { id: u.id, firstName: u.first_name, workArea: u.work_area, role: u.role };
}

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
  return { cookie: sessionCookie(token, SESSION_DAYS * 86400), hash };
}

/** Returns { user, tokenHash } for a valid session, otherwise null. Never trusts anything but the DB. */
export async function loadSession(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || token.length < 30 || token.length > 64 || !/^[A-Za-z0-9_\-]+$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.last_seen_at, s.absolute_expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND s.absolute_expires_at > ?2 AND u.status = 'approved'`
  )
    .bind(hash, now)
    .first();
  if (!row) return null;
  if (now - row.last_seen_at > 6 * 3600 * 1000) {
    const exp = Math.min(now + SESSION_DAYS * DAY, row.absolute_expires_at);
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ?1, expires_at = ?2 WHERE token_hash = ?3").bind(now, exp, hash).run();
  }
  return { user: row, tokenHash: hash };
}

export function requireUser(sess) {
  if (!sess) throw new HttpError(401, "Please sign in.");
  return sess.user;
}

export function requireAdmin(sess) {
  const u = requireUser(sess);
  if (u.role !== "admin") throw new HttpError(403, "Only AJ can do that.");
  return u;
}

export async function destroySession(env, tokenHash) {
  if (tokenHash) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
}

export async function destroyUserSessions(env, userId) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(userId).run();
}
