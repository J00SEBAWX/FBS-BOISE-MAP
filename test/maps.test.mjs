// End-to-end checks for store maps v3 (Phases 2-4) against a real local Worker (wrangler dev) with a fresh
// database seeded like production (migration 0005 + scripts/seed-master.mjs).
// Covers: the shared modules (byte-identical browser copies, lossless master), catalog, master read/write/apply/
// history/restore/prune, everyone's maps (permissions, sharing, validation, concurrency, limits), the master lock,
// proposals (submit, withdraw, decide, approve with selected changes), advisor settings, CSRF on every new write,
// write rate limits, and removing a person (their maps and proposals go too).
// Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { startDev, hmacHex, sha256Hex, aesEncrypt, sqlStr } from "./helpers/devserver.mjs";
import { Client } from "./helpers/client.mjs";
import { masterSeedSql, MASTER_FILE } from "../scripts/seed-master.mjs";
import { validateMapData, isStructure, STRUCTURE_TYPES, ITEM_TYPES, LIMITS } from "../src/shared/schema.js";
import { CATALOG, DEFAULT_KEYS, mergeCategories, searchProducts, getArea } from "../src/shared/catalog.js";
import { applyChanges, validateChanges } from "../src/shared/apply.js";
import { defaultAdvisorConfig, validateAdvisorConfig } from "../src/shared/advisor-config.js";
import * as CORE_MODEL from "../public/js/core/model.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MASTER_RAW = JSON.parse(fs.readFileSync(MASTER_FILE, "utf8"));
const MASTER = validateMapData(MASTER_RAW).data;
const DAY = 86400000;
const LOCKED = "The master map is locked. Unlock it first.";
const STALE_MAP = "This map was changed somewhere else. Reload it to keep going.";
const STALE_MASTER = "The master map was changed since you opened it. Reload it to keep going.";

// people seeded straight into the database, each with a ready session
const PEOPLE = {
  admin: { id: "u_admin", name: "AJ", role: "admin", phone: "+12085550100" },
  a: { id: "u_alice", name: "Alice", role: "member", phone: "+12085550201" },
  b: { id: "u_bob", name: "Bob", role: "member", phone: "+12085550202" },
  c: { id: "u_cara", name: "Cara", role: "member", phone: "+12085550203" },
  d: { id: "u_dan", name: "Dan", role: "member", phone: "+12085550204" },
};
for (const p of Object.values(PEOPLE)) p.token = crypto.randomBytes(32).toString("base64url");

let dev, anon, admin, A, B, C, D;
let ipN = 0;
const freshIp = () => `10.77.${(ipN >> 8) & 255}.${ipN++ & 255}`;
function client(p) {
  const c = new Client(dev.base, { ip: freshIp() });
  if (p) c.cookie = `__Host-fbs_s=${p.token}`;
  return c;
}
const put = (c, p, body, h) => c.req("PUT", p, body, h);

before(async () => {
  dev = await startDev({
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
      rows.push(masterSeedSql({ now }).sql);
      return rows.join("\n");
    },
  });
  anon = client(null);
  admin = client(PEOPLE.admin);
  A = client(PEOPLE.a);
  B = client(PEOPLE.b);
  C = client(PEOPLE.c);
  D = client(PEOPLE.d);
});
after(async () => {
  if (dev) await dev.stop();
});

// ---------- helpers ----------
function ok(r, what = "") {
  assert.ok(r.status >= 200 && r.status < 300, `${what} -> ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
async function newMap(c, name, from = "master", mapId) {
  return ok(await c.post("/api/maps", { name, from, ...(mapId ? { mapId } : {}) }), `new map ${name}`);
}
async function getMap(c, id) {
  return ok(await c.get(`/api/maps/${id}`), `get map ${id}`);
}
async function saveMap(c, id, data, version) {
  return put(c, `/api/maps/${id}`, { version, data });
}
async function master() {
  return ok(await A.get("/api/master"), "get master");
}
async function setSettings(body) {
  return ok(await put(admin, "/api/admin/settings", body), "settings");
}
/** A raw request (to send text JSON.stringify can't make, like 1e999). */
async function raw(c, method, path, text, headers = {}) {
  const h = { "X-FBS": "1", Origin: dev.base, "Content-Type": "application/json", "CF-Connecting-IP": c.ip, ...headers };
  if (c.cookie) h.Cookie = c.cookie;
  const res = await fetch(dev.base + path, { method, headers: h, body: text });
  const t = await res.text();
  let data = t;
  try {
    data = JSON.parse(t);
  } catch {
    /* text */
  }
  return { status: res.status, data };
}
const item = (over = {}) => ({ id: "t_" + crypto.randomBytes(4).toString("hex"), type: "display", name: "Test", x: 50, y: 40, w: 4, d: 2, h: 5, rot: 0, ...over });
const clone = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-3, `${what}: ${a} vs ${b}`);
function limitKey(kind, userId) {
  return `w:${kind}:` + hmacHex(dev.secrets.pepper, "user:" + userId).slice(0, 24);
}

// ---------- shared modules (no server) ----------
test("shared modules: browser copies are byte-identical, no imports outside src/shared", () => {
  for (const f of ["catalog.js", "schema.js", "apply.js", "advisor-config.js"]) {
    const a = fs.readFileSync(`${ROOT}src/shared/${f}`);
    const b = fs.readFileSync(`${ROOT}public/js/shared/${f}`);
    assert.ok(a.equals(b), `src/shared/${f} and public/js/shared/${f} differ`);
    for (const [, spec] of a.toString().matchAll(/^\s*import\b[^"']*["']([^"']+)["']/gm)) assert.match(spec, /^\.\/[a-z-]+\.js$/, `${f} imports ${spec}`);
  }
});

test("the master layout validates losslessly; schema types match the core model", () => {
  const r = validateMapData(MASTER_RAW);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(r.data.items, MASTER_RAW.items, "every item, field and value survives validation unchanged");
  assert.equal(r.data.items.length, MASTER_RAW.items.length);
  assert.deepEqual(r.data.building, MASTER_RAW.building);
  assert.deepEqual(r.data.categories, []);
  assert.deepEqual([...STRUCTURE_TYPES], [...CORE_MODEL.STRUCTURE_TYPES]);
  assert.deepEqual([...ITEM_TYPES].sort(), [...CORE_MODEL.ITEM_TYPES].sort());
  for (const it of MASTER_RAW.items) assert.equal(isStructure(it), CORE_MODEL.isStructure(it), it.id);
  // validating twice changes nothing
  assert.deepStrictEqual(validateMapData(r.data).data, r.data);
});

test("catalog: the 11 departments with the owner's exact names and keys; helpers", () => {
  const want = [
    ["hand_tools", "Hand Tools & Measuring"], ["safety_workwear", "Safety & Workwear"], ["access_jobsite", "Access & Jobsite Equipment"],
    ["hardware_fasteners", "Hardware & Fasteners"], ["pneumatic_air", "Pneumatic & Air Systems"], ["power_tools", "Power Tools"],
    ["paint_finishing", "Paint, Stain & Finishing"], ["decking_outdoor", "Decking & Outdoor Living"], ["woodworking", "Woodworking & Specialty Wood"],
    ["bits_blades", "Bits, Blades & Cutting Accessories"], ["simpson_strongtie", "Simpson Strong-Tie"],
  ];
  assert.deepEqual(CATALOG.areas.map((a) => [a.key, a.name]), want);
  assert.deepEqual([...DEFAULT_KEYS], want.map((w) => w[0]));
  assert.deepEqual(getArea("power_tools").groups.map((g) => g.label), ["Milwaukee", "DeWalt", "Makita"]);
  assert.equal(getArea("nope"), null);
  assert.ok(Object.isFrozen(CATALOG.areas[0].subcats), "the defaults can't be changed by accident");
  for (const a of CATALOG.areas) {
    assert.match(a.color, /^#[0-9a-fA-F]{6}$/);
    assert.ok(a.subcats.length >= 10 && a.targetSqft > 0 && a.size[0] * a.size[1] === a.targetSqft, a.key);
  }
  const merged = mergeCategories(CATALOG.areas, [{ key: "power_tools", color: "#123456", hidden: true }, { key: "c_lumber", name: "Lumber", color: "#445566", targetSqft: 300 }]);
  assert.equal(merged.length, 12);
  const pt = merged.find((c) => c.key === "power_tools");
  assert.deepEqual([pt.color, pt.hidden, pt.overridden, pt.isDefault, pt.name], ["#123456", true, true, true, "Power Tools"]);
  const lum = merged.at(-1);
  assert.deepEqual([lum.key, lum.custom, lum.family, lum.targetSqft], ["c_lumber", true, "custom", 300]);
  assert.equal(searchProducts("M18 battery")[0].department, "power_tools");
  assert.equal(searchProducts("M18 battery")[0].group, "Milwaukee");
  assert.equal(searchProducts("Diablo blade")[0].department, "bits_blades");
  assert.equal(searchProducts("Penofin")[0].department, "paint_finishing");
  assert.equal(searchProducts("harness")[0].department, "safety_workwear");
});

test("apply + advisor helpers are pure and strict", () => {
  assert.equal(validateChanges([{ id: "x", action: "move" }]).ok, false);
  assert.equal(validateChanges([{ id: "x", category: "power_tools", action: "upsert" }]).ok, false);
  assert.equal(validateChanges([{ id: "bad id!", action: "upsert" }]).ok, false);
  assert.deepEqual(validateChanges([{ id: "x", action: "delete", extra: 1 }]).changes, [{ id: "x", action: "delete" }]);
  const m = { items: [item({ id: "a" }), item({ id: "b" })], categories: [{ key: "power_tools", color: "#000000" }] };
  const src = { items: [item({ id: "a", x: 9 }), item({ id: "c" })], categories: [] };
  const before = clone(m);
  const r = applyChanges(m, src, [{ id: "a", action: "upsert" }, { id: "c", action: "upsert" }, { id: "b", action: "delete" }, { category: "power_tools", action: "upsert" }]);
  assert.deepEqual(m, before, "inputs untouched");
  assert.deepEqual(r.data.items.map((i) => [i.id, i.x]), [["a", 9], ["c", 50]]);
  assert.deepEqual(r.data.categories, [], "a default the map doesn't override goes back to default");
  assert.equal(r.applied, 4);
  assert.equal(applyChanges(m, src, [{ id: "zz", action: "upsert" }]).ok, false);
  const d = defaultAdvisorConfig();
  assert.equal(d.departments.power_tools.margin, "high");
  assert.equal(d.departments.power_tools.assumption, true);
  assert.equal(validateAdvisorConfig({ rules: { adjacency: { weight: 9 } } }).ok, false);
  assert.equal(validateAdvisorConfig({ departments: { __proto__x: {} } }).ok, false);
});

test("pruning keeps the newest 200 master versions (real SQLite, the migration's table)", async (t) => {
  let sqlite;
  try {
    sqlite = await import("node:sqlite");
  } catch {
    t.skip("node:sqlite isn't available in this Node");
    return;
  }
  const { pruneMasterVersions } = await import("../src/lib/ratelimit.js");
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(fs.readFileSync(`${ROOT}migrations/0005_maps.sql`, "utf8"));
  const ins = db.prepare("INSERT INTO master_versions (version, data, item_count, created_at) VALUES (?, '{}', 0, 0)");
  for (let v = 1; v <= 250; v++) ins.run(v);
  const d1 = { prepare: (sql) => ({ bind: (...a) => ({ run: async () => db.prepare(sql).run(...a) }) }) };
  await pruneMasterVersions(d1);
  const row = db.prepare("SELECT COUNT(*) AS n, MIN(version) AS lo, MAX(version) AS hi FROM master_versions").get();
  assert.deepEqual({ ...row }, { n: 200, lo: 51, hi: 250 });
});

// ---------- signed-in basics ----------
test("/api/me has the person's id; catalog and master need a session", async () => {
  assert.deepEqual(ok(await A.get("/api/me")), { id: "u_alice", name: "Alice", role: "member" });
  assert.deepEqual(ok(await admin.get("/api/me")), { id: "u_admin", name: "AJ", role: "admin" });
  for (const p of ["/api/catalog", "/api/master", "/api/maps", "/api/proposals", "/api/advisor-config", "/api/master/history", "/api/admin/settings"]) {
    const r = await anon.get(p);
    assert.equal(r.status, 401, p);
    assert.doesNotMatch(r.text, /items|Alice|power_tools/, p);
  }
  const cat = ok(await A.get("/api/catalog"));
  assert.deepEqual(cat.areas.map((a) => a.key), [...DEFAULT_KEYS]);
  assert.deepEqual(cat.structureTypes, [...STRUCTURE_TYPES]);
  assert.ok(cat.itemTypes.includes("area"));
  assert.ok(cat.families.tools && cat.palette.length && cat.products.length > 100);
  assert.equal(cat.limits.maxItems, 1500);
});

test("anonymous: every maps, master, proposal and settings endpoint answers 401 and leaks nothing", async () => {
  const endpoints = [
    ["GET", "/api/catalog"], ["GET", "/api/master"], ["PUT", "/api/master", { baseVersion: 1, data: { items: [] } }],
    ["POST", "/api/master/apply", { mapId: "m_x", baseVersion: 1, changes: [] }], ["GET", "/api/master/history"], ["GET", "/api/master/history/1"],
    ["POST", "/api/master/restore", { version: 1, baseVersion: 1 }], ["GET", "/api/maps"], ["POST", "/api/maps", { name: "x", from: "master" }],
    ["GET", "/api/maps/m_x"], ["PUT", "/api/maps/m_x", { version: 1, name: "x" }], ["DELETE", "/api/maps/m_x"], ["POST", "/api/maps/m_x/submit", {}],
    ["GET", "/api/proposals"], ["GET", "/api/proposals/p_x"], ["POST", "/api/proposals/p_x/withdraw", {}],
    ["POST", "/api/proposals/p_x/decision", { decision: "decline" }], ["GET", "/api/advisor-config"], ["PUT", "/api/advisor-config", { reset: true }],
    ["GET", "/api/admin/settings"], ["PUT", "/api/admin/settings", { shareMaps: true }],
  ];
  for (const [m, p, body] of endpoints) {
    const r = await anon.req(m, p, body);
    assert.equal(r.status, 401, `${m} ${p}`);
    assert.deepEqual(r.data, { error: "Please sign in." }, `${m} ${p}`);
  }
  assert.equal(ok(await admin.get("/api/admin/settings")).shareMaps, false, "nothing changed");
});

test("the master is the seeded survey; everyone signed in can read it", async () => {
  for (const c of [A, B, admin]) {
    const m = ok(await c.get("/api/master"));
    assert.equal(m.version, 1);
    assert.deepStrictEqual(m.data.items, MASTER_RAW.items);
    assert.equal(m.updatedByName, "Initial survey");
    assert.equal(m.itemCount, MASTER_RAW.items.length);
    assert.equal(m.locked, false);
    assert.equal(m.lockedByName, null);
  }
});

// ---------- maps ----------
let mapA; // Alice's main map
test("maps: start from the master, a blank store or a copy; list, rename, save, delete", async () => {
  const r = await newMap(A, "  Alice's\u0000 plan  ");
  mapA = r.meta.id;
  assert.match(mapA, /^m_[A-Za-z0-9_-]{16}$/);
  assert.deepEqual({ ...r.meta, id: 0, createdAt: 0, updatedAt: 0 }, {
    id: 0, name: "Alice's plan", base: "master", ownerName: "Alice", mine: true, itemCount: MASTER_RAW.items.length, version: 1, createdAt: 0, updatedAt: 0,
  });
  assert.deepStrictEqual(r.data.items, MASTER.items);

  const blank = await newMap(A, "Blank slate", "blank");
  assert.equal(blank.meta.base, "blank");
  const structure = MASTER.items.filter(isStructure);
  assert.ok(structure.length > 0 && structure.length < MASTER.items.length);
  assert.deepStrictEqual(blank.data.items, structure, "a blank store is exactly the structure items");
  assert.ok(blank.data.items.every((it) => STRUCTURE_TYPES.includes(it.type) || it.fixed === true));
  assert.equal(blank.meta.itemCount, structure.length);

  const copy = await newMap(A, "Copy", "map", mapA);
  assert.equal(copy.meta.base, "copy");
  assert.deepStrictEqual(copy.data, r.data);

  for (const [body, field] of [
    [{ name: "", from: "master" }, "name"],
    [{ name: "x".repeat(61), from: "master" }, "name"],
    [{ name: 5, from: "master" }, "name"],
    [{ name: "ok", from: "nowhere" }, "from"],
    [{ name: "ok", from: "constructor" }, "from"],
    [{ name: "ok", from: "__proto__" }, "from"],
    [{ name: "ok", from: ["master"] }, "from"],
    [{ name: "ok", from: "map" }, "mapId"],
  ]) {
    const e = await A.post("/api/maps", body);
    assert.equal(e.status, 400, JSON.stringify(body));
    assert.equal(e.data.field, field);
  }
  assert.equal((await A.post("/api/maps", { name: "ok", from: "map", mapId: "m_nope" })).status, 404);

  let list = ok(await A.get("/api/maps"));
  assert.deepEqual(list.mine.map((m) => m.name).sort(), ["Alice's plan", "Blank slate", "Copy"]);
  assert.deepEqual(list.team, [], "members see only their own maps while sharing is off");
  assert.ok(!("data" in list.mine[0]));

  // rename + save with optimistic concurrency
  const ren = ok(await put(A, `/api/maps/${copy.meta.id}`, { version: 1, name: "Renamed" }));
  assert.equal(ren.version, 2);
  const stale = await put(A, `/api/maps/${copy.meta.id}`, { version: 1, name: "Again" });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data, { error: STALE_MAP, currentVersion: 2 });
  const data = clone(copy.data);
  data.items = data.items.slice(0, 10);
  const saved = ok(await saveMap(A, copy.meta.id, data, 2));
  assert.equal(saved.version, 3);
  const got = await getMap(A, copy.meta.id);
  assert.equal(got.meta.name, "Renamed");
  assert.equal(got.meta.itemCount, 10);
  assert.equal(got.canEdit, true);
  assert.deepStrictEqual(got.data.items, data.items);
  assert.equal((await put(A, `/api/maps/${copy.meta.id}`, { version: 3 })).status, 400, "nothing to save");
  assert.equal((await put(A, `/api/maps/${copy.meta.id}`, { data })).status, 400, "version is required");

  assert.deepEqual(ok(await A.del(`/api/maps/${copy.meta.id}`)), { ok: true });
  assert.equal((await A.get(`/api/maps/${copy.meta.id}`)).status, 404);
  assert.equal((await A.del(`/api/maps/${copy.meta.id}`)).status, 404);
  list = ok(await A.get("/api/maps"));
  assert.equal(list.mine.length, 2);
});

test("maps: at most 30 per person", async () => {
  const now = Date.now();
  const values = Array.from({ length: 29 }, (_, i) => `('m_dan_${i}', 'u_dan', 'Old ${i}', 'blank', '{"items":[],"categories":[]}', 1, 0, ${now}, ${now})`);
  await dev.sql(`INSERT INTO maps (id, owner_id, name, base, data, version, item_count, created_at, updated_at) VALUES ${values.join(", ")}`);
  ok(await D.post("/api/maps", { name: "Thirtieth", from: "blank" }));
  const r = await D.post("/api/maps", { name: "Too many", from: "blank" });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "You have 30 maps. Delete one to make another.");
  assert.equal(ok(await D.get("/api/maps")).mine.length, 30);
  await dev.sql("DELETE FROM maps WHERE owner_id = 'u_dan'");
});

test("permissions: who may read and change a map (sharing off, then on)", async () => {
  // sharing off: Bob can't see Alice's map at all; the admin sees it but can't edit it
  for (const [m, p, body] of [
    ["GET", `/api/maps/${mapA}`],
    ["PUT", `/api/maps/${mapA}`, { version: 1, name: "Bob's now" }],
    ["DELETE", `/api/maps/${mapA}`],
    ["POST", `/api/maps/${mapA}/submit`, {}],
    ["POST", "/api/maps", { name: "steal", from: "map", mapId: mapA }],
  ]) {
    const r = await B.req(m, p, body);
    assert.equal(r.status, 404, `Bob ${m} ${p}`);
    assert.doesNotMatch(JSON.stringify(r.data), /Alice/);
  }
  const asAdmin = await getMap(admin, mapA);
  assert.equal(asAdmin.canEdit, false);
  assert.equal(asAdmin.meta.ownerName, "Alice");
  assert.equal(asAdmin.meta.mine, false);
  assert.equal((await put(admin, `/api/maps/${mapA}`, { version: 1, name: "Admin's now" })).status, 403);
  assert.equal((await admin.post(`/api/maps/${mapA}/submit`, {})).status, 403);
  const adminList = ok(await admin.get("/api/maps"));
  assert.ok(adminList.team.some((m) => m.id === mapA && m.ownerName === "Alice" && !m.mine));
  assert.equal(ok(await A.get("/api/maps")).team.length, 0);

  // only the admin manages settings
  assert.equal((await A.get("/api/admin/settings")).status, 403);
  assert.equal((await put(A, "/api/admin/settings", { shareMaps: true })).status, 403);
  assert.deepEqual(ok(await admin.get("/api/admin/settings")), { shareMaps: false, masterLocked: false, lockedByName: null, lockedAt: null });
  assert.equal((await put(admin, "/api/admin/settings", { shareMaps: "yes" })).status, 400);
  assert.equal((await put(admin, "/api/admin/settings", {})).status, 400);

  // sharing on: everyone signed in sees everyone's maps, read-only
  assert.equal((await setSettings({ shareMaps: true })).shareMaps, true);
  const bobList = ok(await B.get("/api/maps"));
  const seen = bobList.team.find((m) => m.id === mapA);
  assert.equal(seen.ownerName, "Alice");
  assert.equal(seen.mine, false);
  const bobView = await getMap(B, mapA);
  assert.equal(bobView.canEdit, false);
  assert.equal((await put(B, `/api/maps/${mapA}`, { version: 1, name: "Bob's now" })).status, 403);
  assert.equal((await B.del(`/api/maps/${mapA}`)).status, 403);
  assert.equal((await B.post(`/api/maps/${mapA}/submit`, {})).status, 403);
  const bobsCopy = await newMap(B, "Bob's copy of Alice's", "map", mapA);
  assert.equal(bobsCopy.meta.ownerName, "Bob");
  assert.deepStrictEqual(bobsCopy.data, bobView.data);
  assert.ok(ok(await A.get("/api/maps")).team.some((m) => m.id === bobsCopy.meta.id && m.ownerName === "Bob"));

  // and off again
  await setSettings({ shareMaps: false });
  assert.equal((await B.get(`/api/maps/${mapA}`)).status, 404);
  assert.equal(ok(await B.get("/api/maps")).team.length, 0);
  // the admin may delete anyone's map
  assert.deepEqual(ok(await admin.del(`/api/maps/${bobsCopy.meta.id}`)), { ok: true });
  assert.equal((await B.get(`/api/maps/${bobsCopy.meta.id}`)).status, 404);
  // still Alice's, unchanged
  assert.equal((await getMap(A, mapA)).meta.name, "Alice's plan");
});

test("validation: bad items and categories reject the whole save with {error, field, itemId}", async () => {
  const { meta, data: base } = await newMap(A, "Validation");
  let version = meta.version;
  const g = base.items.find((it) => it.type === "gondola").id;
  const bad = async (mutate, field, itemId, status = 400) => {
    const data = clone(base);
    mutate(data);
    const r = await saveMap(A, meta.id, data, version);
    assert.equal(r.status, status, `${field}: ${JSON.stringify(r.data)}`);
    if (status === 400) {
      assert.equal(r.data.field, field, JSON.stringify(r.data));
      assert.equal(r.data.itemId, itemId, JSON.stringify(r.data));
      assert.equal(typeof r.data.error, "string");
    }
  };
  const at = (data, id) => data.items.find((it) => it.id === id);
  await bad((d) => (at(d, g).type = "spaceship"), "type", g);
  await bad((d) => (at(d, g).id = "bad id!"), "id", null);
  await bad((d) => (at(d, g).id = "x".repeat(41)), "id", null);
  await bad((d) => d.items.push(clone(at(d, g))), "id", g);
  await bad((d) => (at(d, g).x = null), "x", g);
  await bad((d) => (at(d, g).x = "10"), "x", g);
  await bad((d) => (at(d, g).x = 401), "x", g);
  await bad((d) => (at(d, g).y = -101), "y", g);
  await bad((d) => (at(d, g).w = 0), "w", g);
  await bad((d) => (at(d, g).d = 400.5), "d", g);
  await bad((d) => (at(d, g).h = 61), "h", g);
  await bad((d) => (at(d, g).sky = 2.5), "sky", g);
  await bad((d) => (at(d, g).rot = "90"), "rot", g);
  await bad((d) => delete at(d, g).w, "w", g);
  await bad((d) => (at(d, g).color = "#12345"), "color", g);
  await bad((d) => (at(d, g).color = "red"), "color", g);
  await bad((d) => (at(d, g).top = "#GGGGGG"), "top", g);
  await bad((d) => (at(d, g).brand = "Mil waukee"), "brand", g);
  await bad((d) => (at(d, g).fixed = "true"), "fixed", g);
  await bad((d) => (at(d, g).name = "n".repeat(81)), "name", g);
  await bad((d) => (at(d, g).notes = "n".repeat(501)), "notes", g);
  await bad((d) => (at(d, g).status = "done"), "status", g);
  await bad((d) => (at(d, g).open = { sides: ["N", "Q"] }), "open", g);
  await bad((d) => (at(d, g).poly = [[1, 2], [3, 4]]), "poly", g);
  await bad((d) => d.items.push(item({ id: "ar1", type: "area", cat: "nope" })), "cat", "ar1");
  await bad((d) => d.items.push(item({ id: "ar1", type: "area" })), "cat", "ar1");
  await bad((d) => d.items.push(item({ id: "ar1", type: "area", cat: "power_tools", shape: "poly" })), "pts", "ar1");
  await bad((d) => d.items.push(item({ id: "ar1", type: "area", cat: "power_tools", shape: "poly", pts: [[0, 0], [1, 1]] })), "pts", "ar1");
  await bad((d) => d.items.push(item({ id: "ar1", type: "area", cat: "power_tools", shape: "poly", pts: [[0, 0], [201, 0], [0, 5]] })), "pts", "ar1");
  await bad((d) => d.items.push(item({ id: "ar1", type: "area", cat: "power_tools", shape: "oval" })), "shape", "ar1");
  await bad((d) => d.items.push(item({ id: "ar1", type: "area", cat: "power_tools", groups: [{ label: "", share: 0.5 }] })), "groups", "ar1");
  await bad((d) => d.items.push(item({ id: "ar1", type: "area", cat: "power_tools", groups: Array(7).fill({ label: "x", share: 0.1 }) })), "groups", "ar1");
  await bad((d) => (d.categories = [{ key: "lumber", name: "Lumber", color: "#123456" }]), "key", null);
  await bad((d) => (d.categories = [{ key: "c_x", color: "#123456" }]), "name", null);
  await bad((d) => (d.categories = [{ key: "c_x", name: "X", color: "blue" }]), "color", null);
  await bad((d) => (d.categories = [{ key: "c_x", name: "X", color: "#123456", family: "toys" }]), "family", null);
  await bad((d) => (d.categories = [{ key: "c_x", name: "X", color: "#123456", targetSqft: 20001 }]), "targetSqft", null);
  await bad((d) => (d.categories = [{ key: "c_x", name: "X", color: "#123456", subcats: Array(41).fill("a") }]), "subcats", null);
  await bad((d) => (d.categories = [{ key: "power_tools" }, { key: "power_tools" }]), "key", null);
  await bad((d) => (d.categories = Array.from({ length: 41 }, (_, i) => ({ key: "c_" + i, name: "C" + i, color: "#123456" }))), "categories", null);
  await bad((d) => (d.items = "nope"), "items", null);
  await bad((d) => (d.items = Array.from({ length: 1501 }, (_, i) => item({ id: "n" + i })), d.categories = []), "items", null);

  // NaN / Infinity can't be written in JSON; 1e999 parses to Infinity and is refused like any bad number
  const inf = await raw(A, "PUT", `/api/maps/${meta.id}`, JSON.stringify({ version, data: base }).replace(/"x":(\d+(\.\d+)?)/, '"x":1e999'));
  assert.equal(inf.status, 400);
  assert.equal(inf.data.field, "x");
  const nan = await raw(A, "PUT", `/api/maps/${meta.id}`, `{"version":${version},"data":{"items":[{"id":"a","type":"wall","x":NaN,"y":1,"w":1,"d":1}]}}`);
  assert.equal(nan.status, 400);
  assert.equal(nan.data.error, "The request wasn't valid JSON.");

  // too much data: over 400 KB of map data is refused; a request body over the limit is cut off before parsing
  const fat = clone(base);
  fat.items = Array.from({ length: 1100 }, (_, i) => item({ id: "f" + i, notes: "n".repeat(300) }));
  const fatBody = JSON.stringify({ version, data: fat });
  assert.ok(fatBody.length > 400 * 1024 && fatBody.length < 460 * 1024, String(fatBody.length));
  const r400 = await saveMap(A, meta.id, fat, version);
  assert.equal(r400.status, 400);
  assert.equal(r400.data.field, "data");
  fat.items = Array.from({ length: 1400 }, (_, i) => item({ id: "f" + i, notes: "n".repeat(400) }));
  assert.equal((await saveMap(A, meta.id, fat, version)).status, 413);
  const chunked = await fetch(`${dev.base}/api/maps/${meta.id}`, {
    method: "PUT",
    headers: { "X-FBS": "1", Origin: dev.base, "Content-Type": "application/json", Cookie: A.cookie },
    body: new ReadableStream({
      start(ctl) {
        for (let i = 0; i < 60; i++) ctl.enqueue(new TextEncoder().encode(" ".repeat(10000)));
        ctl.close();
      },
    }),
    duplex: "half",
  });
  assert.equal(chunked.status, 413, "a streamed body without a length is cut off too");

  // nothing above changed the map
  assert.equal((await getMap(A, meta.id)).meta.version, version);

  // what is accepted: unknown fields dropped, text cleaned but kept as text, numbers normalised, areas filled in
  const good = clone(base);
  const gi = at(good, g);
  gi.evil = "<img src=x onerror=alert(1)>";
  gi.__proto__polluted = 1;
  gi.constructor = "x";
  gi.name = "  <script>alert('hi')</script>\u0000‮  ";
  gi.notes = "line one\r\nline two\u0007";
  gi.rot = -90;
  gi.x = 12.345678;
  gi.status = "needs_review";
  good.items.push(
    item({ id: "area_pt", type: "area", cat: "power_tools", name: "Power Tools", x: 80, y: 40, w: 28, d: 25, h: undefined, groups: [{ label: "Milwaukee", share: 0.45 }], lockArea: true, status: "proposed" }),
    item({ id: "area_l", type: "area", cat: "c_lumber", shape: "poly", pts: [[-5, -5], [5, -5], [5, 5], [-5, 5.25]], x: 30, y: 30, w: 10, d: 10.25, h: 10 })
  );
  good.categories = [
    { key: "c_lumber", name: "Lumber", color: "#445566", family: "custom", subcats: ["2x4s", "  ", "Plywood"], notes: "new", targetSqft: 400, hidden: false, rogue: 1 },
    { key: "power_tools", color: "#ff0000", hidden: true },
  ];
  const saved = ok(await saveMap(A, meta.id, good, version), "good save");
  version = saved.version;
  const back = (await getMap(A, meta.id)).data;
  const bg = at(back, g);
  assert.equal(bg.evil, undefined);
  assert.equal(bg.__proto__polluted, undefined);
  assert.equal(Object.getPrototypeOf(bg), Object.prototype);
  assert.equal(Object.hasOwn(bg, "constructor"), false);
  assert.equal(bg.name, "<script>alert('hi')</script>", "script-ish text is kept as text (the page renders it with textContent)");
  assert.equal(bg.notes, "line one\nline two");
  assert.equal(bg.rot, 270);
  assert.equal(bg.x, 12.3457);
  assert.equal(bg.status, "needs_review");
  const apt = at(back, "area_pt");
  assert.deepEqual([apt.shape, apt.h, apt.lockArea, apt.cat], ["rect", 8, true, "power_tools"]);
  assert.equal(at(back, "area_l").h, 10);
  assert.deepEqual(back.categories[0], { key: "c_lumber", name: "Lumber", color: "#445566", family: "custom", subcats: ["2x4s", "Plywood"], notes: "new", targetSqft: 400, hidden: false });
  assert.deepEqual(back.categories[1], { key: "power_tools", color: "#ff0000", hidden: true });
  // fields only department blocks have are dropped from other items
  const other = clone(back);
  at(other, g).cat = "power_tools";
  at(other, g).pts = [[0, 0], [1, 0], [0, 1]];
  ok(await saveMap(A, meta.id, other, version));
  version++;
  assert.equal(at((await getMap(A, meta.id)).data, g).cat, undefined);
  assert.equal(at((await getMap(A, meta.id)).data, g).pts, undefined);
  ok(await A.del(`/api/maps/${meta.id}`));
});

test("master: the admin edits it with optimistic concurrency; members can't", async () => {
  const cur = await master();
  const data = clone(cur.data);
  data.items[0].name = "Warehouse floor (edited)";
  for (const c of [A, B]) {
    assert.equal((await put(c, "/api/master", { baseVersion: cur.version, data })).status, 403);
    assert.equal((await c.post("/api/master/apply", { mapId: mapA, baseVersion: cur.version, changes: [{ id: "i1", action: "upsert" }] })).status, 403);
    assert.equal((await c.post("/api/master/restore", { version: 1, baseVersion: cur.version })).status, 403);
    assert.equal((await c.get("/api/master/history")).status, 403);
    assert.equal((await c.get("/api/master/history/1")).status, 403);
  }
  const r = ok(await put(admin, "/api/master", { baseVersion: cur.version, data, note: "Fixed a name" }));
  assert.equal(r.version, cur.version + 1);
  const stale = await put(admin, "/api/master", { baseVersion: cur.version, data });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data, { error: STALE_MASTER, currentVersion: cur.version + 1 });
  const bad = clone(data);
  bad.items[0].w = -1;
  const br = await put(admin, "/api/master", { baseVersion: r.version, data: bad });
  assert.equal(br.status, 400);
  assert.equal(br.data.field, "w");
  const now = await master();
  assert.equal(now.version, r.version);
  assert.equal(now.data.items[0].name, "Warehouse floor (edited)");
  assert.equal(now.updatedByName, "AJ");
  assert.equal(now.note, "Fixed a name");
  // two saves at once from the same base: exactly one wins
  const [x, y] = await Promise.all([
    put(admin, "/api/master", { baseVersion: now.version, data: now.data, note: "race 1" }),
    put(admin, "/api/master", { baseVersion: now.version, data: now.data, note: "race 2" }),
  ]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  assert.equal((await master()).version, now.version + 1);
});

test("master: apply selected changes from someone's map; history; restore", async () => {
  const cur = await master();
  const { meta, data } = await getMap(A, mapA);
  const at = (d, id) => d.items.find((it) => it.id === id);
  // Alice moves a gondola, adds a display, removes a table, adds a custom department, recolours Power Tools
  at(data, "i50").x += 4;
  at(data, "i51").x += 2; // not applied
  data.items.push(item({ id: "new_disp", name: "New display" }));
  data.items = data.items.filter((it) => it.id !== "i79");
  data.items.push(item({ id: "area_lum", type: "area", cat: "c_lumber", name: "Lumber", w: 20, d: 20 }));
  data.categories = [{ key: "c_lumber", name: "Lumber", color: "#445566" }, { key: "power_tools", color: "#aa5500" }];
  const sv = ok(await saveMap(A, mapA, data, meta.version));
  assert.equal(sv.version, meta.version + 1);

  const changes = [
    { id: "i50", action: "upsert" },
    { id: "new_disp", action: "upsert" },
    { id: "i79", action: "delete" },
    { id: "area_lum", action: "upsert" },
    { category: "power_tools", action: "upsert" },
  ];
  assert.equal((await admin.post("/api/master/apply", { mapId: "m_nope", baseVersion: cur.version, changes })).status, 404);
  assert.equal((await admin.post("/api/master/apply", { mapId: mapA, baseVersion: cur.version - 1, changes })).status, 409);
  const badCh = await admin.post("/api/master/apply", { mapId: mapA, baseVersion: cur.version, changes: [{ id: "i50", action: "move" }] });
  assert.equal(badCh.status, 400);
  assert.equal(badCh.data.field, "changes");
  assert.equal((await admin.post("/api/master/apply", { mapId: mapA, baseVersion: cur.version, changes: [] })).status, 400);
  const missing = await admin.post("/api/master/apply", { mapId: mapA, baseVersion: cur.version, changes: [{ id: "not_there", action: "upsert" }] });
  assert.equal(missing.status, 400);
  assert.equal(missing.data.itemId, "not_there");

  const r = ok(await admin.post("/api/master/apply", { mapId: mapA, baseVersion: cur.version, changes, note: "Alice's gondola move" }));
  assert.deepEqual(r, { version: cur.version + 1, updatedAt: r.updatedAt, applied: 5, addedCategories: ["c_lumber"] });
  const after = await master();
  assert.equal(after.version, r.version);
  near(at(after.data, "i50").x, at(cur.data, "i50").x + 4, "i50.x");
  assert.equal(at(after.data, "i51").x, at(cur.data, "i51").x, "changes that weren't picked stay as they were");
  assert.ok(at(after.data, "new_disp"));
  assert.equal(at(after.data, "i79"), undefined);
  assert.equal(at(after.data, "area_lum").cat, "c_lumber");
  assert.deepEqual(after.data.categories, [{ key: "power_tools", color: "#aa5500" }, { key: "c_lumber", name: "Lumber", color: "#445566" }]);
  assert.equal(after.sourceOwnerName, "Alice");
  assert.equal(after.updatedByName, "AJ");
  assert.equal(after.note, "Alice's gondola move");

  // deleting a custom category the master still uses is refused (the result wouldn't validate)
  const orphan = await admin.post("/api/master/apply", { mapId: mapA, baseVersion: after.version, changes: [{ category: "c_lumber", action: "delete" }] });
  assert.equal(orphan.status, 400);
  assert.equal(orphan.data.field, "cat");

  // history: newest first, who / from whose map / note
  const h = ok(await admin.get("/api/master/history")).versions;
  assert.equal(h[0].version, after.version);
  assert.deepEqual([h[0].createdByName, h[0].sourceOwnerName, h[0].sourceMapId, h[0].note, h[0].itemCount], ["AJ", "Alice", mapA, "Alice's gondola move", after.data.items.length]);
  assert.equal(h.at(-1).version, 1);
  assert.equal(h.at(-1).createdByName, "Initial survey");
  assert.ok(h.every((v, i) => i === 0 || v.version < h[i - 1].version));
  const v1 = ok(await admin.get("/api/master/history/1"));
  assert.deepStrictEqual(v1.data.items, MASTER_RAW.items);
  for (const p of ["/api/master/history/0", "/api/master/history/999", "/api/master/history/abc", "/api/master/history/1.5"]) assert.equal((await admin.get(p)).status, 404, p);

  // restore version 1: a new version with the old data
  assert.equal((await admin.post("/api/master/restore", { version: 1, baseVersion: after.version - 1 })).status, 409);
  assert.equal((await admin.post("/api/master/restore", { version: 999, baseVersion: after.version })).status, 404);
  assert.equal((await admin.post("/api/master/restore", { version: "1", baseVersion: after.version })).status, 400);
  const rs = ok(await admin.post("/api/master/restore", { version: 1, baseVersion: after.version }));
  assert.equal(rs.version, after.version + 1);
  const restored = await master();
  assert.deepStrictEqual(restored.data.items, MASTER_RAW.items);
  assert.equal(restored.note, "Restored version 1");
  assert.equal(ok(await admin.get("/api/master/history")).versions[0].note, "Restored version 1");
});

test("master lock: nobody changes the master while it is locked, the admin included", async () => {
  const cur = await master();
  const s = await setSettings({ masterLocked: true });
  assert.equal(s.masterLocked, true);
  assert.equal(s.lockedByName, "AJ");
  assert.ok(s.lockedAt > 0);
  const m = await master();
  assert.deepEqual([m.locked, m.lockedByName, m.lockedAt], [true, "AJ", s.lockedAt]);
  for (const [p, body, method] of [
    ["/api/master", { baseVersion: cur.version, data: cur.data }, "PUT"],
    ["/api/master/apply", { mapId: mapA, baseVersion: cur.version, changes: [{ id: "i50", action: "upsert" }] }, "POST"],
    ["/api/master/restore", { version: 1, baseVersion: cur.version }, "POST"],
  ]) {
    const r = await admin.req(method, p, body);
    assert.equal(r.status, 423, p);
    assert.deepEqual(r.data, { error: LOCKED });
  }
  // approving a proposal with changes is a master write too
  const sub = ok(await A.post(`/api/maps/${mapA}/submit`, { note: "while locked" }));
  const appr = await admin.post(`/api/proposals/${sub.proposal.id}/decision`, { decision: "approve", baseVersion: cur.version, changes: [{ id: "i51", action: "upsert" }] });
  assert.equal(appr.status, 423);
  assert.equal((await A.get(`/api/proposals/${sub.proposal.id}`)).data.status, "submitted", "nothing was decided");
  assert.equal((await master()).version, cur.version, "the master didn't change");
  ok(await A.post(`/api/proposals/${sub.proposal.id}/withdraw`));
  // members still read it; unlocking clears the lock details
  assert.equal((await B.get("/api/master")).data.locked, true);
  const u = await setSettings({ masterLocked: false });
  assert.deepEqual([u.masterLocked, u.lockedByName, u.lockedAt], [false, null, null]);
  ok(await put(admin, "/api/master", { baseVersion: cur.version, data: cur.data, note: "after unlock" }));
});

test("proposals: submit, resubmit, withdraw, needs changes, decline, approve with selected changes", async () => {
  const at = (d, id) => d.items.find((it) => it.id === id);
  // Alice's map now differs from the master in several places
  const { meta, data } = await getMap(A, mapA);
  at(data, "i52").y += 3;
  at(data, "i53").name = "Renamed by Alice";
  const v = ok(await saveMap(A, mapA, data, meta.version)).version;
  const stored = (await getMap(A, mapA)).data;

  const s1 = ok(await A.post(`/api/maps/${mapA}/submit`, { note: "First try" })).proposal;
  assert.deepEqual([s1.status, s1.note, s1.mine, s1.ownerName, s1.mapName, s1.mapId, s1.mapVersion], ["submitted", "First try", true, "Alice", "Alice's plan", mapA, v]);
  assert.equal(s1.itemCount, data.items.length);
  assert.equal(s1.mapBase, "master", "the proposal says what its map started from (Review leaves a blank plan's never-had rows unticked)");
  assert.equal(s1.baseMasterVersion, (await master()).version);
  const s2 = ok(await A.post(`/api/maps/${mapA}/submit`, { note: "Second try" })).proposal;
  assert.equal(s2.id, s1.id, "submitting again updates the open proposal");
  assert.equal(s2.note, "Second try");
  assert.equal(ok(await A.get("/api/proposals?status=submitted")).proposals.length, 1);
  assert.equal((await A.post(`/api/maps/${mapA}/submit`, { note: "n".repeat(501) })).status, 400);

  // only Alice and the admin see it
  assert.equal((await B.get(`/api/proposals/${s1.id}`)).status, 404);
  assert.equal((await B.post(`/api/proposals/${s1.id}/withdraw`)).status, 404);
  assert.deepEqual(ok(await B.get("/api/proposals")).proposals, []);
  assert.equal((await B.post(`/api/proposals/${s1.id}/decision`, { decision: "decline" })).status, 403);
  assert.equal((await A.post(`/api/proposals/${s1.id}/decision`, { decision: "approve" })).status, 403);
  const adminList = ok(await admin.get("/api/proposals")).proposals;
  const mine = adminList.find((p) => p.id === s1.id);
  assert.deepEqual([mine.ownerName, mine.mine, mine.status], ["Alice", false, "submitted"]);
  assert.ok(ok(await admin.get("/api/proposals?status=withdrawn")).proposals.every((p) => p.status === "withdrawn"));
  assert.equal((await admin.get("/api/proposals?status=bogus")).status, 400);
  for (const decision of ["maybe", "constructor", "__proto__", "toString", ["approve"], null]) {
    assert.equal((await admin.post(`/api/proposals/${s1.id}/decision`, { decision })).status, 400, String(decision));
  }
  assert.equal((await admin.post(`/api/proposals/${s1.id}/decision`, { decision: "decline", changes: [{ id: "i52", action: "upsert" }] })).status, 400);
  const full = ok(await admin.get(`/api/proposals/${s1.id}`));
  assert.deepStrictEqual(full.snapshot, stored, "the snapshot is the map as submitted");
  assert.deepStrictEqual(ok(await A.get(`/api/proposals/${s1.id}`)).snapshot, stored);

  // withdraw (only while open)
  assert.equal(ok(await A.post(`/api/proposals/${s1.id}/withdraw`)).proposal.status, "withdrawn");
  assert.equal((await A.post(`/api/proposals/${s1.id}/withdraw`)).status, 409);
  assert.equal((await admin.post(`/api/proposals/${s1.id}/decision`, { decision: "approve" })).status, 409);

  // needs changes, with a note
  const s3 = ok(await A.post(`/api/maps/${mapA}/submit`, { note: "Third try" })).proposal;
  assert.notEqual(s3.id, s1.id);
  const nc = ok(await admin.post(`/api/proposals/${s3.id}/decision`, { decision: "needs_changes", note: "Move the DeWalt aisle back" })).proposal;
  assert.deepEqual([nc.status, nc.decisionNote, nc.decidedByName, nc.appliedVersion], ["needs_changes", "Move the DeWalt aisle back", "AJ", null]);
  assert.ok(nc.decidedAt > 0);
  assert.equal((await admin.post(`/api/proposals/${s3.id}/decision`, { decision: "decline" })).status, 409);
  assert.equal(ok(await A.get(`/api/proposals/${s3.id}`)).decisionNote, "Move the DeWalt aisle back");

  // decline
  const s4 = ok(await A.post(`/api/maps/${mapA}/submit`, {})).proposal;
  assert.equal(s4.note, null);
  assert.equal(ok(await admin.post(`/api/proposals/${s4.id}/decision`, { decision: "decline", note: "Not now" })).proposal.status, "declined");

  // approve with selected changes: applied from the SNAPSHOT, not from later edits to the map
  const s5 = ok(await A.post(`/api/maps/${mapA}/submit`, { note: "Final" })).proposal;
  const snapY = at(stored, "i52").y;
  const later = (await getMap(A, mapA));
  at(later.data, "i52").y += 10;
  ok(await saveMap(A, mapA, later.data, later.meta.version));
  const cur = await master();
  const changes = [{ id: "i52", action: "upsert" }];
  const stale = await admin.post(`/api/proposals/${s5.id}/decision`, { decision: "approve", baseVersion: cur.version - 1, changes });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.currentVersion, cur.version);
  assert.equal((await admin.post(`/api/proposals/${s5.id}/decision`, { decision: "approve", changes })).status, 400, "baseVersion is required with changes");
  const ap = ok(await admin.post(`/api/proposals/${s5.id}/decision`, { decision: "approve", baseVersion: cur.version, changes, note: "Approved the DeWalt move" }));
  assert.equal(ap.version, cur.version + 1);
  assert.equal(ap.applied, 1);
  assert.deepEqual([ap.proposal.status, ap.proposal.appliedVersion, ap.proposal.decisionNote], ["approved", cur.version + 1, "Approved the DeWalt move"]);
  const m = await master();
  assert.equal(m.version, cur.version + 1);
  assert.equal(at(m.data, "i52").y, snapY, "from the snapshot");
  assert.equal(at(m.data, "i53").name, at(cur.data, "i53").name, "the change that wasn't picked isn't applied");
  assert.equal(m.sourceOwnerName, "Alice");
  assert.equal(m.note, "Approved the DeWalt move");
  assert.equal((await admin.post(`/api/proposals/${s5.id}/decision`, { decision: "approve", baseVersion: m.version, changes })).status, 409, "already decided");

  // approve without changes records the approval only
  const s6 = ok(await A.post(`/api/maps/${mapA}/submit`, {})).proposal;
  const a6 = ok(await admin.post(`/api/proposals/${s6.id}/decision`, { decision: "approve", changes: [] })).proposal;
  assert.deepEqual([a6.status, a6.appliedVersion], ["approved", null]);
  assert.equal((await master()).version, m.version);

  // Alice's own list, newest first
  const own = ok(await A.get("/api/proposals")).proposals;
  assert.deepEqual(own.map((p) => p.status), ["approved", "approved", "declined", "needs_changes", "withdrawn", "withdrawn"]);
  assert.ok(own.every((p) => p.mine && p.ownerName === "Alice"));

  // deleting a map withdraws its open proposal
  const tmp = await newMap(A, "Temp");
  const s7 = ok(await A.post(`/api/maps/${tmp.meta.id}/submit`, {})).proposal;
  ok(await A.del(`/api/maps/${tmp.meta.id}`));
  const gone = ok(await admin.get(`/api/proposals/${s7.id}`));
  assert.deepEqual([gone.status, gone.mapName], ["withdrawn", null]);
});

test("advisor settings: everyone reads them, only the admin changes them, strictly checked", async () => {
  const g = ok(await B.get("/api/advisor-config"));
  assert.equal(g.isDefault, true);
  assert.deepEqual(g.config, defaultAdvisorConfig());
  assert.ok(g.rules.length >= 10 && g.thresholds.aisleMinFt);
  assert.equal((await put(B, "/api/advisor-config", { config: {} })).status, 403);
  const p = ok(
    await put(admin, "/api/advisor-config", {
      config: { thresholds: { aisleMinFt: 5 }, departments: { paint_finishing: { margin: "high" }, c_lumber: { margin: "low" } }, rules: { adjacency: { enabled: false, weight: 2 } }, junk: 1 },
    })
  );
  assert.equal(p.isDefault, false);
  assert.equal(p.config.thresholds.aisleMinFt, 5);
  assert.equal(p.config.departments.paint_finishing.margin, "high");
  assert.equal(p.config.departments.c_lumber.margin, "low");
  assert.deepEqual(p.config.rules.adjacency, { enabled: false, weight: 2 });
  assert.equal(p.config.junk, undefined);
  assert.deepEqual(ok(await A.get("/api/advisor-config")).config, p.config);
  for (const config of [{ thresholds: { aisleMinFt: 0 } }, { rules: { adjacency: { weight: 9 } } }, { departments: { nope: {} } }, { departments: { power_tools: { margin: "huge" } } }, "x"]) {
    assert.equal((await put(admin, "/api/advisor-config", { config })).status, 400, JSON.stringify(config));
  }
  assert.equal((await put(admin, "/api/advisor-config", { config: { note: "x".repeat(17000) } })).status, 413);
  assert.equal(ok(await put(admin, "/api/advisor-config", { reset: true })).isDefault, true);
  assert.equal(ok(await A.get("/api/advisor-config")).isDefault, true);
});

test("CSRF: every new write needs X-FBS, our Origin and a same-site fetch", async () => {
  const cur = await master();
  const targets = [
    [A, "POST", "/api/maps", { name: "csrf", from: "master" }],
    [A, "PUT", `/api/maps/${mapA}`, { version: 1, name: "csrf" }],
    [A, "DELETE", `/api/maps/${mapA}`, undefined],
    [A, "POST", `/api/maps/${mapA}/submit`, { note: "csrf" }],
    [A, "POST", "/api/proposals/p_x/withdraw", {}],
    [admin, "POST", "/api/proposals/p_x/decision", { decision: "decline" }],
    [admin, "PUT", "/api/master", { baseVersion: cur.version, data: cur.data }],
    [admin, "POST", "/api/master/apply", { mapId: mapA, baseVersion: cur.version, changes: [{ id: "i1", action: "upsert" }] }],
    [admin, "POST", "/api/master/restore", { version: 1, baseVersion: cur.version }],
    [admin, "PUT", "/api/admin/settings", { shareMaps: true }],
    [admin, "PUT", "/api/advisor-config", { reset: true }],
  ];
  const bad = [{ "X-FBS": null }, { "X-FBS": "0" }, { Origin: "https://evil.example" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }];
  for (const [c, m, p, body] of targets) {
    for (const h of bad) {
      const r = await c.req(m, p, body, h);
      assert.equal(r.status, 403, `${m} ${p} ${JSON.stringify(h)}`);
      assert.equal(r.data.error, "Request blocked.");
    }
  }
  // nothing happened
  assert.equal((await master()).version, cur.version);
  assert.equal(ok(await admin.get("/api/admin/settings")).shareMaps, false);
  assert.equal((await getMap(A, mapA)).meta.name, "Alice's plan");
});

test("write rate limits: past the limit a person gets 429, others are unaffected", async () => {
  const { meta, data } = await getMap(A, mapA);
  const key = limitKey("save", "u_alice");
  await dev.sql(`INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (${sqlStr(key)}, 120, ${Date.now() + 600000})`);
  const r = await saveMap(A, mapA, data, meta.version);
  assert.equal(r.status, 429);
  assert.match(r.data.error, /Wait a few minutes/);
  const bob = await newMap(B, "Bob still saves");
  ok(await saveMap(B, bob.meta.id, bob.data, 1));
  await dev.sql(`DELETE FROM rate_limits WHERE key = ${sqlStr(key)}`);
  ok(await saveMap(A, mapA, data, meta.version));
});

test("unknown paths and methods answer 404", async () => {
  for (const [m, p] of [["GET", "/api/maps/x/y/z"], ["PATCH", "/api/maps"], ["POST", "/api/master/history"], ["DELETE", "/api/master"], ["GET", "/api/proposals/x/withdraw"], ["POST", "/api/catalog"]]) {
    assert.equal((await admin.req(m, p, m === "GET" ? undefined : {})).status, 404, `${m} ${p}`);
  }
  for (const id of ["..%2F", "a.b", "x".repeat(49)]) assert.equal((await admin.get(`/api/maps/${id}`)).status, 404, id);
});

test("removing a person deletes their maps and proposals; the dashboard counts maps", async () => {
  const one = await newMap(C, "Cara's one");
  await newMap(C, "Cara's two", "blank");
  ok(await C.post(`/api/maps/${one.meta.id}/submit`, { note: "please" }));
  const o = ok(await admin.get("/api/admin/overview"));
  const cara = o.people.find((p) => p.id === "u_cara");
  assert.equal(cara.mapCount, 2);
  assert.equal(o.people.find((p) => p.id === "u_dan").mapCount, 0);
  assert.ok(ok(await admin.get("/api/proposals")).proposals.some((p) => p.ownerName === "Cara"));
  // apply one of Cara's items to the master first: the history must not keep naming her after removal
  const caraMap = ok(await C.get(`/api/maps/${one.meta.id}`));
  const firstId = caraMap.data.items.find((it) => !["floor", "zone", "wall", "door", "opening", "arch", "column", "ceiling", "stairs"].includes(it.type)).id;
  const mv = ok(await admin.get("/api/master")).version;
  ok(await admin.post("/api/master/apply", { mapId: one.meta.id, baseVersion: mv, changes: [{ id: firstId, action: "upsert" }], note: "one item applied" }));
  assert.equal(ok(await admin.get("/api/master")).sourceOwnerName, "Cara");
  ok(await admin.del("/api/admin/people/u_cara"));
  assert.equal((await C.get("/api/maps")).status, 401, "signed out");
  assert.equal(ok(await admin.get("/api/master")).sourceOwnerName, "Removed member");
  assert.ok(!JSON.stringify(ok(await admin.get("/api/master/history"))).includes("Cara"), "the history no longer names her");
  assert.deepEqual(await dev.sql("SELECT COUNT(*) AS n FROM maps WHERE owner_id = 'u_cara'"), [{ n: 0 }]);
  assert.deepEqual(await dev.sql("SELECT COUNT(*) AS n FROM proposals WHERE owner_id = 'u_cara'"), [{ n: 0 }]);
  assert.equal((await admin.get(`/api/maps/${one.meta.id}`)).status, 404);
  assert.ok(!ok(await admin.get("/api/proposals")).proposals.some((p) => p.ownerName === "Cara"));
  // other people's maps are untouched
  assert.equal((await getMap(A, mapA)).meta.ownerName, "Alice");
});

test("API responses never carry phone numbers", async () => {
  const bodies = [];
  for (const [c, p] of [[A, "/api/maps"], [admin, "/api/maps"], [admin, "/api/proposals"], [A, "/api/master"], [admin, "/api/master/history"], [A, `/api/maps/${mapA}`]]) {
    bodies.push((await c.get(p)).text);
  }
  for (const b of bodies) {
    for (const p of Object.values(PEOPLE)) {
      assert.ok(!b.includes(p.phone) && !b.includes(p.phone.slice(2)), "no phone numbers");
    }
    assert.doesNotMatch(b, /"(?:phone|tel|phone_enc|phone_hash)"/i);
  }
});

// last: it drops the new tables
test("a database without migration 0005 fails closed (503); sign-in, the dashboard and removing people keep working", async () => {
  await dev.sql("DROP TABLE proposals; DROP TABLE maps; DROP TABLE master_versions; DROP TABLE settings;");
  for (const [c, m, p, body] of [
    [A, "GET", "/api/maps"], [A, "GET", "/api/master"], [A, "POST", "/api/maps", { name: "x", from: "master" }], [A, "GET", "/api/proposals"],
    [admin, "GET", "/api/admin/settings"], [admin, "PUT", "/api/master", { baseVersion: 1, data: { items: [] } }],
  ]) {
    const r = await c.req(m, p, body);
    assert.equal(r.status, 503, `${m} ${p}`);
    assert.deepEqual(r.data, { error: "The site isn't set up yet." });
  }
  assert.equal(ok(await A.get("/api/me")).id, "u_alice");
  assert.equal(ok(await A.get("/api/catalog")).areas.length, 11);
  const o = ok(await admin.get("/api/admin/overview"));
  assert.ok(o.people.length > 0 && o.people.every((p) => p.mapCount === null));
  ok(await admin.del("/api/admin/people/u_dan"));
  assert.equal((await D.get("/api/me")).status, 401);
});
