// Small crypto toolkit on top of WebCrypto (available in Workers and Node 20+).
const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export function toHex(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

export function toB64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function toB64Url(bytes) {
  let s = toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_");
  while (s.endsWith("=")) s = s.slice(0, -1);
  return s;
}

export function fromB64Url(str) {
  let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return fromB64(s);
}

/** Opaque random id, e.g. for users and access codes. */
export function newId(prefix = "") {
  return prefix + toB64Url(randomBytes(12));
}

// Crockford-style alphabet without look-alike characters (no I, L, O, 0, 1).
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Random code like "ABCD-EF23" (groups of `size` characters, no modulo bias). */
export function randomCode(groups = 4, size = 4) {
  const parts = [];
  for (let g = 0; g < groups; g++) {
    let p = "";
    while (p.length < size) {
      const buf = randomBytes(16);
      for (const x of buf) {
        if (x < 248) {
          p += ALPHA[x % 31];
          if (p.length === size) break;
        }
      }
    }
    parts.push(p);
  }
  return parts.join("-");
}

export async function sha256Hex(str) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return toHex(d);
}

const hmacKeys = new Map();
async function hmacKey(secret) {
  let k = hmacKeys.get(secret);
  if (!k) {
    k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    hmacKeys.set(secret, k);
  }
  return k;
}

export async function hmacHex(secret, message) {
  if (!secret) throw new Error("missing secret");
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(message));
  return toHex(sig);
}

/** Constant-time string comparison (equal length strings). */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** PBKDF2-SHA256 with 100,000 iterations (the most Workers allows), 32-byte output. */
export const PBKDF2_ITERATIONS = 100000;
export async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

const aesKeys = new Map();
async function aesKey(keyB64) {
  let k = aesKeys.get(keyB64);
  if (!k) {
    const raw = fromB64(keyB64);
    if (raw.length !== 32) throw new Error("PHONE_KEY must be 32 bytes (base64)");
    k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    aesKeys.set(keyB64, k);
  }
  return k;
}

/** AES-GCM with a fresh 12-byte IV: "<iv b64>.<ciphertext b64>". */
export async function encryptText(keyB64, text) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyB64), enc.encode(text));
  return toB64(iv) + "." + toB64(ct);
}

export async function decryptText(keyB64, payload) {
  const [ivB64, ctB64] = String(payload).split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, await aesKey(keyB64), fromB64(ctB64));
  return dec.decode(pt);
}
