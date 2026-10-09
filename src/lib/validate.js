// Input validation. Everything stored is checked field by field; anything else in a request is ignored.
import { HttpError } from "./http.js";

/** Uppercase, then drop every character that isn't A-Z or 0-9 ("abcd-ef23 " -> "ABCDEF23"). */
export function normalizeCode(input) {
  return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Mobile number to E.164, or null.
 * Spaces, dashes, dots and parentheses are ignored. 10 digits -> +1XXXXXXXXXX; 11 digits starting
 * with 1 -> +1...; a leading + with 8-15 digits is kept as is. Anything else is rejected.
 */
export function normalizePhone(input) {
  if (typeof input !== "string") return null;
  const s = input.replace(/[\s.()\-]/g, "");
  if (/^\+\d{8,15}$/.test(s)) return s;
  if (/^\d{10}$/.test(s)) return "+1" + s;
  if (/^1\d{10}$/.test(s)) return "+" + s;
  return null;
}
export const PHONE_ERROR = "Enter a mobile number like 208-555-0123.";

/** "+12085550123" -> "(208) 555-0123"; other numbers are shown as stored. */
export function formatPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 || ""));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(e164 || "");
}

// letters (any language, with accents), spaces, apostrophes (' or ’), periods and hyphens; starts with a letter
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’\-]*$/u;
// characters that show nothing: zero-width spaces and joiners, Hangul fillers (which count as letters), etc.
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu;
// more than 3 accents piled on one letter (after NFC, real names need far fewer)
const MARK_PILE = /\p{M}{4,}/u;
export const NAME_MAX = 60;
export const NAME_ERROR = "Enter your name using letters (spaces, apostrophes, periods and hyphens are fine).";

/** Drops invisible characters, trims and collapses spaces; returns the name or null. */
export function cleanName(input) {
  const s = String(input ?? "").normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  if (!s || [...s].length > NAME_MAX || !NAME_RE.test(s) || MARK_PILE.test(s)) return null;
  return s;
}

const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;
export function cleanUsername(input) {
  const s = String(input ?? "").trim();
  return USERNAME_RE.test(s) ? s : null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,48}$/;
export function requireId(v) {
  if (typeof v !== "string" || !ID_RE.test(v)) throw new HttpError(404, "Not found.");
  return v;
}
