// The guides: the planning guide is for everyone signed in (/guides/...), the admin guide only for the admin
// (/admin/guide/..., inside the admin-only area). Signed out, neither is served.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { startDev, hmacHex, sha256Hex, aesEncrypt, sqlStr } from "./helpers/devserver.mjs";
import { Client } from "./helpers/client.mjs";

const UG = "/guides/FBS-Store-Map-Planning-Guide.pdf", AG = "/admin/guide/FBS-Store-Map-Admin-Guide.pdf";
const DAY = 86400000;
const P = { m: { id: "u_m", name: "Dana", role: "member", phone: "+12085550301", u: null }, a: { id: "u_a", name: "AJ", role: "admin", phone: "+12085550309", u: "aj" } };
for (const p of Object.values(P)) p.token = crypto.randomBytes(32).toString("base64url");
let dev;
before(async () => {
  dev = await startDev({ seed: ({ pepper, phoneKey }) => { const now = Date.now(); return Object.values(P).flatMap(p => [
    `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, username)
     VALUES (${sqlStr(p.id)}, ${sqlStr(p.name)}, '', ${sqlStr(hmacHex(pepper, "phone:" + p.phone))}, ${sqlStr(aesEncrypt(phoneKey, p.phone))}, ${sqlStr(p.phone.slice(-4))}, ${sqlStr(p.role)}, 'approved', 0, ${now}, ${now}, ${sqlStr(p.u)});`,
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, absolute_expires_at, user_agent) VALUES (${sqlStr(sha256Hex(p.token))}, ${sqlStr(p.id)}, ${now}, ${now}, ${now + 30 * DAY}, ${now + 90 * DAY}, 'test');`]).join("\n"); } });
});
after(async () => { if (dev) await dev.stop(); });
const as = who => { const c = new Client(dev.base, { ip: "10.77.0." + (who === "m" ? 1 : who === "a" ? 2 : 3) }); if (who) c.cookie = `__Host-fbs_s=${P[who].token}`; return c; };

test("the planning guide opens for anyone signed in, the admin guide only for the admin; signed out, neither", async () => {
  const out = as(null), m = as("m"), a = as("a");
  for (const path of [UG, AG]) { const r = await out.get(path); assert.notEqual(r.status, 200, `signed out: ${path}`); assert.doesNotMatch(r.headers.get("content-type") || "", /pdf/); }
  for (const c of [m, a]) { const r = await c.get(UG); assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /application\/pdf/); assert.ok(r.text.startsWith("%PDF")); }
  assert.equal((await m.get(AG)).status, 404, "a member never gets the admin guide");
  const r = await a.get(AG);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /application\/pdf/);
});

test("the links point at the files: help dialog and More (everyone), account menu and dashboard (admin)", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../public/admin/index.html", import.meta.url), "utf8");
  assert.ok(html.includes(`href="${UG}"`));
  assert.match(html, new RegExp(`id="acctAdminGuide"[^>]*hidden|href="${AG}" id="acctAdminGuide"`));
  assert.ok(admin.includes(`href="${AG}"`));
  assert.ok(readFileSync(new URL("../public/js/main.js", import.meta.url), "utf8").includes(`h("a", {href: "${UG}", download: ""})`));
  assert.ok(html.includes(`href="${UG}" download`), "downloaded, so it opens in the device's own PDF viewer");
});
