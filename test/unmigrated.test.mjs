// Deploy order: the new map page may reach visitors before the database migration (0005) is applied or the master
// map is seeded (merging to main publishes the Worker and the page at once). Against a real local Worker whose
// database has migrations 0001-0004 only, this checks that nothing breaks for the people using the site:
//   - signing in, /api/me, the dashboard and removing a person still work;
//   - every maps call answers a calm 503 JSON (never 500, never a stack), which the page turns into
//     "Editing isn't switched on yet" and the static master map (public/js/core/readiness.js);
//   - the static /data/master.json the page falls back to is served to signed-in people;
//   - once the operator applies migration 0005 and the seed, the same running site starts serving the master
//     from the database, with no redeploy.
// Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { startDev, hmacHex, sha256Hex, aesEncrypt, sqlStr } from "./helpers/devserver.mjs";
import { Client } from "./helpers/client.mjs";
import { masterSeedSql } from "../scripts/seed-master.mjs";
import { apiNotReady } from "../public/js/core/readiness.js";

const DAY = 86400000;
const MASTER_FILE = new URL("../public/data/master.json", import.meta.url);
const PEOPLE = {
  admin: { id: "u_admin", name: "AJ", role: "admin", phone: "+12085550100" },
  member: { id: "u_alice", name: "Alice", role: "member", phone: "+12085550201" },
  other: { id: "u_bob", name: "Bob", role: "member", phone: "+12085550202" },
};
for (const p of Object.values(PEOPLE)) p.token = crypto.randomBytes(32).toString("base64url");

let dev, admin, member, anon;
let ipN = 0;
const client = (p) => {
  const c = new Client(dev.base, { ip: `10.88.0.${ipN++ & 255}` });
  if (p) c.cookie = `__Host-fbs_s=${p.token}`;
  return c;
};

before(async () => {
  dev = await startDev({
    omitMigrations: ["0005_maps.sql"],
    seed: ({ pepper, phoneKey }) => {
      const now = Date.now();
      const rows = [];
      for (const p of Object.values(PEOPLE)) {
        rows.push(
          `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, username)
           VALUES (${sqlStr(p.id)}, ${sqlStr(p.name)}, '', ${sqlStr(hmacHex(pepper, "phone:" + p.phone))}, ${sqlStr(aesEncrypt(phoneKey, p.phone))},
                   ${sqlStr(p.phone.slice(-4))}, ${sqlStr(p.role)}, 'approved', 0, ${now}, ${now}, ${p.role === "admin" ? "'boss'" : "NULL"});`,
          `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, absolute_expires_at, user_agent)
           VALUES (${sqlStr(sha256Hex(p.token))}, ${sqlStr(p.id)}, ${now}, ${now}, ${now + 30 * DAY}, ${now + 90 * DAY}, 'test');`
        );
      }
      return rows.join("\n");
    },
  });
  anon = client(null);
  admin = client(PEOPLE.admin);
  member = client(PEOPLE.member);
});
after(async () => {
  if (dev) await dev.stop();
});

test("the database really is behind: none of the map tables exist", async () => {
  const rows = await dev.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('maps', 'master_versions', 'settings', 'proposals')");
  assert.deepEqual(rows, []);
});

test("signing in and the page itself work as before: /api/me, the app, the scripts, the static master map", async () => {
  const me = await member.get("/api/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.name, "Alice");
  assert.equal(me.data.role, "member");
  assert.equal((await member.get("/", { Accept: "text/html" })).status, 200);
  assert.equal((await member.get("/js/main.js")).status, 200);
  assert.equal((await member.get("/js/core/readiness.js")).status, 200);
  const stat = await member.get("/data/master.json");
  assert.equal(stat.status, 200);
  const file = JSON.parse(fs.readFileSync(MASTER_FILE, "utf8"));
  assert.equal(stat.data.items.length, file.items.length, "the page's fallback is the same file the seed uses");
  assert.deepEqual(stat.data.building, file.building);
  assert.equal((await member.get("/data/scan-overlay.json")).status, 200);
});

test("every maps call answers a calm 503 (never 500), and the page's decision function reads it as 'not ready'", async () => {
  const calls = [
    ["GET", "/api/master"],
    ["GET", "/api/maps"],
    ["GET", "/api/maps/m_abc123"],
    ["POST", "/api/maps", { name: "Mine", from: "master" }],
    ["GET", "/api/proposals"],
    ["GET", "/api/advisor-config"],
  ];
  for (const [m, p, body] of calls) {
    const r = await member.req(m, p, body);
    assert.equal(r.status, 503, `${m} ${p} -> ${r.status} ${JSON.stringify(r.data)}`);
    assert.equal(typeof r.data.error, "string", `${m} ${p}`);
    assert.equal(r.data.error, "The site isn't set up yet.");
    assert.doesNotMatch(JSON.stringify(r.data), /no such table|SQLITE|stack|D1_ERROR/i, "no database words reach the browser");
    assert.equal(apiNotReady({ status: r.status }, { master: p === "/api/master" }), true);
  }
  for (const [m, p, body] of [["GET", "/api/admin/settings"], ["PUT", "/api/admin/settings", { shareMaps: true }], ["GET", "/api/master/history"]]) {
    const r = await admin.req(m, p, body);
    assert.equal(r.status, 503, `${m} ${p} -> ${r.status} ${JSON.stringify(r.data)}`);
    assert.doesNotMatch(JSON.stringify(r.data), /no such table|SQLITE|stack|D1_ERROR/i);
  }
});

test("the admin dashboard and removing a person keep working before the migration", async () => {
  const o = await admin.get("/api/admin/overview");
  assert.equal(o.status, 200);
  const names = o.data.people.filter((p) => p.role === "member").map((p) => p.name).sort();
  assert.deepEqual(names, ["Alice", "Bob"]);
  for (const p of o.data.people) assert.equal(p.mapCount, null, "no map counts without the maps table");
  const gone = await admin.del(`/api/admin/people/${PEOPLE.other.id}`);
  assert.ok(gone.status >= 200 && gone.status < 300, `remove -> ${gone.status} ${JSON.stringify(gone.data)}`);
  assert.equal((await client(PEOPLE.other).get("/api/me")).status, 401);
});

test("signed-out visitors still get nothing: 401 for the API, the sign-in page for the app", async () => {
  assert.equal((await anon.get("/api/master")).status, 401);
  assert.equal((await anon.get("/data/master.json")).status, 401);
});

test("applying migration 0005 alone leaves the master missing: still a calm 503, and the maps list works but has no master to copy", async () => {
  await dev.sqlFile(fs.readFileSync(new URL("../migrations/0005_maps.sql", import.meta.url), "utf8"));
  const r = await member.get("/api/master");
  assert.equal(r.status, 503);
  assert.equal(r.data.error, "The master map isn't set up yet.");
  assert.equal(apiNotReady({ status: r.status }, { master: true }), true);
  const list = await member.get("/api/maps");
  assert.equal(list.status, 200, "the tables exist now");
  const make = await member.post("/api/maps", { name: "Mine", from: "master" });
  assert.equal(make.status, 503, "a copy of the master can't be made before the seed");
});

test("after the seed the same running site serves the master from the database (no redeploy)", async () => {
  await dev.sqlFile(masterSeedSql({ now: Date.now() }).sql);
  const r = await member.get("/api/master");
  assert.equal(r.status, 200);
  assert.equal(r.data.version, 1);
  const file = JSON.parse(fs.readFileSync(MASTER_FILE, "utf8"));
  assert.equal(r.data.data.items.length, file.items.length);
  assert.equal(r.data.locked, false);
  const make = await member.post("/api/maps", { name: "Mine", from: "master" });
  assert.equal(make.status, 200);
});
