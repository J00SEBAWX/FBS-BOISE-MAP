// Admin passwords: PBKDF2-SHA256 (100,000 iterations, 16-byte salt, 32-byte output), then HMAC with PEPPER.
//   password_salt = base64url(salt)
//   password_hash = "v2$" + HMAC-SHA256(PEPPER, "pw:" + hex(PBKDF2(NFC(password), salt)))
// A stored hash that doesn't start with "v2$" (the old, unknown format) never verifies.
import { HttpError } from "./http.js";
import { pbkdf2, randomBytes, toB64Url, fromB64Url, toHex, hmacHex, safeEqual } from "./crypto.js";
import { config } from "./auth.js";

export const PW_MIN = 10;
export const PW_MAX = 200;
const DUMMY_SALT = new Uint8Array(16); // used when there is no account, so timing doesn't reveal usernames

function normalize(password) {
  return typeof password === "string" ? password.normalize("NFC") : "";
}

async function derive(env, password, salt) {
  const bits = await pbkdf2(normalize(password), salt);
  return "v2$" + (await hmacHex(config(env).pepper, "pw:" + toHex(bits)));
}

/** Checks the rules for a new password and returns it normalized, or throws a 400 with a plain message. */
export function checkNewPassword(password) {
  const pw = normalize(password);
  const len = [...pw].length;
  if (len < PW_MIN) throw new HttpError(400, `Use at least ${PW_MIN} characters for the password.`, { field: "password" });
  if (len > PW_MAX) throw new HttpError(400, `Use at most ${PW_MAX} characters for the password.`, { field: "password" });
  return pw;
}

/** Returns { hash, salt } for a new password. */
export async function hashPassword(env, password) {
  const salt = randomBytes(16);
  return { hash: await derive(env, password, salt), salt: toB64Url(salt) };
}

/** True only for a v2 hash that matches. Always runs PBKDF2 once, even without a row. */
export async function verifyPassword(env, password, row) {
  let salt = DUMMY_SALT;
  try {
    if (row && typeof row.password_salt === "string") {
      const s = fromB64Url(row.password_salt);
      if (s.length >= 8) salt = s;
    }
  } catch {
    salt = DUMMY_SALT;
  }
  const pw = normalize(password).slice(0, PW_MAX * 2);
  const got = await derive(env, pw, salt);
  const stored = row && typeof row.password_hash === "string" ? row.password_hash : "";
  if (!stored.startsWith("v2$") || salt === DUMMY_SALT) return false;
  return safeEqual(got, stored);
}
