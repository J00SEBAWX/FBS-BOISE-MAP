// With missing or malformed secrets the site fails closed: no sign-in, no sessions, no map.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDev } from "./helpers/devserver.mjs";
import { Client } from "./helpers/client.mjs";

let dev;
before(async () => {
  // deliberately bad values (a short PEPPER and a PHONE_KEY that isn't 32 bytes); they override any .dev.vars
  dev = await startDev({ port: 8794, secrets: { pepper: "too-short", phoneKey: "bm90LTMyLWJ5dGVz" } });
});
after(async () => {
  if (dev) await dev.stop();
});

test("without valid secrets every sign-in and session check answers 503", async () => {
  const c = new Client(dev.base);
  const health = await c.get("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.data, { ok: true, db: true, configured: false, accessCodesTable: true });
  for (const [m, p, body] of [
    ["POST", "/api/access/check", { code: "ABCD-EFGH" }],
    ["POST", "/api/access/redeem", { code: "ABCD-EFGH", name: "Ann", phone: "2085550101" }],
    ["POST", "/api/admin/login", { username: "boss", password: "correct horse battery" }],
    ["POST", "/api/admin/setup", { setupCode: "ABCD-EFGH-JKMN-PQRS", username: "boss", password: "correct horse battery" }],
    ["GET", "/api/me"],
    ["GET", "/api/admin/overview"],
    ["GET", "/"],
    ["GET", "/js/main.js"],
    ["GET", "/data/scan.glb"],
    ["GET", "/admin/"],
  ]) {
    const r = await c.req(m, p, body);
    assert.equal(r.status, 503, `${m} ${p}`);
    assert.equal(r.data.error, "The site isn't set up yet.");
  }
  // the sign-in page itself still loads (and shows the error when used)
  assert.equal((await c.get("/login", { Accept: "text/html" })).status, 200);
});
