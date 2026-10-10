// Unit checks for input rules and the documented hashing formulas (no server needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { normalizeCode, normalizePhone, formatPhone, cleanName, cleanUsername } from "../src/lib/validate.js";
import { randomCode, encryptText, decryptText, hmacHex as workerHmac } from "../src/lib/crypto.js";
import { hashPassword, verifyPassword, checkNewPassword } from "../src/lib/password.js";
import { accessCodeHash, phoneHash, setupTokenHash, configured, loadSession } from "../src/lib/auth.js";
import { ipBucket } from "../src/lib/http.js";
import { hmacHex, sha256Hex, passwordFields } from "./helpers/devserver.mjs";
import { mockDb } from "./helpers/mockdb.mjs";

const env = { PEPPER: crypto.randomBytes(32).toString("hex"), PHONE_KEY: crypto.randomBytes(32).toString("base64") };

test("normalizeCode: uppercase, only A-Z and 0-9", () => {
  assert.equal(normalizeCode(" abcd-ef23 "), "ABCDEF23");
  assert.equal(normalizeCode("AB CD.EF_23"), "ABCDEF23");
  assert.equal(normalizeCode(null), "");
});

test("normalizePhone follows the rules exactly", () => {
  const ok = {
    "2085550123": "+12085550123",
    "208-555-0123": "+12085550123",
    "(208) 555-0123": "+12085550123",
    "208.555.0123": "+12085550123",
    "1 208 555 0123": "+12085550123",
    "+1 (208) 555-0123": "+12085550123",
    "+44 20 7946 0958": "+442079460958",
    "+12345678": "+12345678",
    "+123456789012345": "+123456789012345",
  };
  for (const [input, want] of Object.entries(ok)) assert.equal(normalizePhone(input), want, input);
  for (const bad of ["", "12345", "20855501234", "22085550123", "+1234567", "+1234567890123456", "208-555-CALL", "++12085550123", "208/555/0123", null, undefined]) {
    assert.equal(normalizePhone(bad), null, String(bad));
  }
  assert.equal(formatPhone("+12085550123"), "(208) 555-0123");
  assert.equal(formatPhone("+442079460958"), "+442079460958");
});

test("names: letters with spaces, apostrophes, periods and hyphens, up to 60", () => {
  assert.equal(cleanName("  Zoë   O’Brien-Smith Jr. "), "Zoë O’Brien-Smith Jr.");
  assert.equal(cleanName("José"), "José");
  assert.equal(cleanName("José"), "José", "NFC");
  assert.equal(cleanName("D'Angelo"), "D'Angelo");
  assert.equal(cleanName("A".repeat(60)), "A".repeat(60));
  for (const bad of ["", "  ", "A".repeat(61), "<b>x</b>", "Ann2", "-Ann", "'Ann", "Ann;", "Ann\u0000", 42, null]) assert.equal(cleanName(bad), null, String(bad));
  // nothing visible: Hangul fillers count as letters, zero-width characters as nothing
  for (const blank of ["\u3164", "\u115F", "\u1160", "\uFFA0", "\u3164 \u3164", "\u200B", "\u200B\u200C\u200D\u2060\uFEFF", "\u00AD"]) {
    assert.equal(cleanName(blank), null, `U+${blank.codePointAt(0).toString(16)}`);
  }
  // invisible characters are dropped from real names
  assert.equal(cleanName("\u200BJo\u3164 Ann\u200D"), "Jo Ann");
  assert.equal(cleanName("Ann\u00AD\u2060Marie"), "AnnMarie");
  // accents: up to 3 on one letter (e.g. Hebrew with points, Thai tone marks), not a tower of them
  assert.equal(cleanName("Ann" + "\u0334\u0335\u0336"), "Ann" + "\u0334\u0335\u0336"); // overlay marks: no precomposed forms
  assert.equal(cleanName("\u05E9\u05B8\u05BC\u05C1\u05D9"), "\u05E9\u05B8\u05BC\u05C1\u05D9");
  assert.equal(cleanName("A" + "\u0301".repeat(59)), null);
  assert.equal(cleanName("Ann" + "\u0334\u0335\u0336\u0337"), null);
  // NFC first, so a precomposed accent typed as two characters is still fine
  assert.equal(cleanName("Rene\u0301e"), "Ren\u00E9e");
});

test("per-IP rate limits: whole IPv4 address, IPv6 /64 network", () => {
  assert.equal(ipBucket("203.0.113.9"), "203.0.113.9");
  assert.equal(ipBucket("2001:db8:1:2::5"), "2001:db8:1:2::/64");
  assert.equal(ipBucket("2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(ipBucket("2001:db8:1:2:aaaa::1%eth0"), "2001:db8:1:2::/64");
  assert.equal(ipBucket("2001:db8::"), "2001:db8:0:0::/64");
  assert.equal(ipBucket("::1"), "0:0:0:0::/64");
  assert.equal(ipBucket("2001:db8:1:3::5"), "2001:db8:1:3::/64");
  assert.equal(ipBucket("64:ff9b::192.0.2.33"), "64:ff9b:0:0::/64");
  assert.equal(ipBucket("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(ipBucket("0:0:0:0:0:ffff:cb00:7109"), "203.0.113.9");
  for (const odd of ["local", "", "not:an:ip:::", "1:2:3:4:5:6:7:8:9", "2001:db8::g", "::ffff:300.1.1.1"]) assert.equal(ipBucket(odd), odd.toLowerCase(), odd);
});

test("usernames: 3 to 40 of A-Z a-z 0-9 . _ -", () => {
  assert.equal(cleanUsername(" boss.2_x-y "), "boss.2_x-y");
  for (const bad of ["ab", "a".repeat(41), "bo ss", "boss!", "bössi", ""]) assert.equal(cleanUsername(bad), null, bad);
});

test("access codes look like XXXX-XXXX from the no-look-alike alphabet", () => {
  for (let i = 0; i < 200; i++) assert.match(randomCode(2, 4), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  assert.match(randomCode(4, 4), /^([A-Z2-9]{4}-){3}[A-Z2-9]{4}$/);
});

test("the Worker's hashes match the documented formulas", async () => {
  assert.equal(await accessCodeHash(env, "abcd-ef23"), hmacHex(env.PEPPER, "access:ABCDEF23"));
  assert.equal(await phoneHash(env, "+12085550123"), hmacHex(env.PEPPER, "phone:+12085550123"));
  assert.equal(await setupTokenHash("abcd-efgh-jkmn-pqrs"), sha256Hex("setup:ABCDEFGHJKMNPQRS"));
  assert.equal(await workerHmac("k".repeat(32), "x"), hmacHex("k".repeat(32), "x"));
});

test("AES-GCM text round trip, and Node-made ciphertext decrypts in the Worker code", async () => {
  const enc = await encryptText(env.PHONE_KEY, "+12085550123");
  assert.match(enc, /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  assert.equal(await decryptText(env.PHONE_KEY, enc), "+12085550123");
  const { aesEncrypt } = await import("./helpers/devserver.mjs");
  assert.equal(await decryptText(env.PHONE_KEY, aesEncrypt(env.PHONE_KEY, "ABCD-EF23")), "ABCD-EF23");
});

test("passwords: v2 PBKDF2 + pepper, rules, and old hashes never verify", async () => {
  const pw = await hashPassword(env, "correct horse battery");
  assert.match(pw.hash, /^v2\$[0-9a-f]{64}$/);
  assert.equal(Buffer.from(pw.salt, "base64url").length, 16);
  assert.equal(pw.hash, passwordFields(env.PEPPER, "correct horse battery", Buffer.from(pw.salt, "base64url")).hash, "matches the formula");
  const row = { password_hash: pw.hash, password_salt: pw.salt };
  assert.equal(await verifyPassword(env, "correct horse battery", row), true);
  assert.equal(await verifyPassword(env, "correct horse batterY", row), false);
  assert.equal(await verifyPassword(env, "correct horse battery", { ...row, password_hash: pw.hash.slice(3) }), false, "no v2$ prefix");
  assert.equal(await verifyPassword(env, "correct horse battery", { ...row, password_hash: "$2b$10$abcdefghijklmnopqrstuv" }), false);
  assert.equal(await verifyPassword(env, "correct horse battery", null), false);
  assert.equal(await verifyPassword(env, "", { password_hash: null, password_salt: null }), false);
  // NFC: the same password typed with a combining accent still matches
  const accented = await hashPassword(env, "café crème brûlée");
  assert.equal(await verifyPassword(env, "café crème brûlée", { password_hash: accented.hash, password_salt: accented.salt }), true);
  assert.throws(() => checkNewPassword("123456789"), /at least 10/);
  assert.throws(() => checkNewPassword("x".repeat(201)), /at most 200/);
  assert.equal(checkNewPassword("x".repeat(200)), "x".repeat(200));
});

test("secrets are required", () => {
  assert.equal(configured(env), true);
  assert.equal(configured({}), false);
  assert.equal(configured({ PEPPER: "short", PHONE_KEY: env.PHONE_KEY }), false);
  assert.equal(configured({ PEPPER: env.PEPPER, PHONE_KEY: Buffer.alloc(16).toString("base64") }), false);
  assert.equal(configured({ PEPPER: env.PEPPER, PHONE_KEY: "not base64 at all!" }), false);
});

test("a session's last visit slides at most every 10 minutes, and only the first of parallel requests writes", async () => {
  const token = "t".repeat(43), now = Date.now();
  const request = new Request("https://map.test/js/main.js", { headers: { Cookie: `__Host-fbs_s=${token}` } });
  for (const [lastSeen, writes] of [[now - 11 * 60000, 1], [now - 60000, 0]]) {
    const db = mockDb((s) => (s.sql.startsWith("SELECT") ? { token_hash: "h", last_seen_at: lastSeen, absolute_expires_at: now + 86400000 * 60, id: "u", first_name: "A", role: "member", status: "approved" } : { meta: { changes: 1 } }));
    const sess = await loadSession({ ...env, DB: db }, request);
    assert.equal(sess.user.id, "u");
    const updates = db.log.filter((s) => s.sql.startsWith("UPDATE"));
    assert.equal(updates.length, writes, `last seen ${(now - lastSeen) / 60000} min ago`);
    if (writes) {
      // the write is conditional: a request that arrives with the same old row changes nothing
      assert.match(updates[0].sql, /WHERE token_hash = \?3 AND last_seen_at < \?4$/);
      assert.ok(Math.abs(updates[0].args[3] - (updates[0].args[0] - 10 * 60000)) < 5, "last_seen_at < now - 10 minutes");
    }
  }
});
