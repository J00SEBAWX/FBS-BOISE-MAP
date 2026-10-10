// End-to-end checks against a real local Worker (wrangler dev) with a fresh database.
// Covers: what is gated, security headers, CSRF, admin setup / sign-in / password, access codes
// (check, redeem, races, sets of 5), members vs admin, removing people, rate limits, logout.
// Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { startDev, normalizeCode, hmacHex, sha256Hex, aesEncrypt, passwordFields, randomCode, sqlStr } from "./helpers/devserver.mjs";
import { Client } from "./helpers/client.mjs";
import { mockDb, mockSecrets, jsonRequest } from "./helpers/mockdb.mjs";

const BAD_CODE = "That code doesn't work. Check it, or ask for a new one.";
const BAD_LOGIN = "That username and password don't match.";
const BAD_SETUP = "That setup code doesn't work. It may be used or expired.";
const TOO_MANY = "Too many tries. Wait 15 minutes and try again.";
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
// other ways to name the admin folder's page or files (the asset server serves admin/index.html at /admin.html)
const ADMIN_ALIASES = ["/admin.html", "/admin.html?x", "/Admin.HTML", "/admin.htm", "/admin.", "/admin.js", "/admin./admin.js", "/index/../admin.html"];
const HOUR = 3600000;
const DAY = 86400000;

// one-time setup codes seeded into the database
const SETUP_A = randomCode(4, 4);
const SETUP_B = randomCode(4, 4);
const SETUP_EXPIRED = randomCode(4, 4);
const SETUP_USED = randomCode(4, 4);
const HAND_CODE = "HNDM-ADE2"; // an access code made by hand with the documented formula
const ADMIN_PHONE = "+12085550100"; // the old admin row's phone
const OLD_MEMBER_PHONE = "+12085550188"; // the old 'denied' member
const LEGACY_PASSWORD = "legacy password 1";
const HAND_PASSWORD = "handmade password 1";

let dev, admin;
let ipN = 0;
const freshIp = () => `10.${(ipN >> 8) & 255}.${ipN++ & 255}.7`;
const visitor = () => new Client(dev.base, { ip: freshIp() });

before(async () => {
  dev = await startDev({
    seed: ({ pepper, phoneKey }) => {
      const now = Date.now();
      const tok = (code, exp, used = null) =>
        `INSERT INTO setup_tokens (token_hash, created_at, expires_at, used_at) VALUES ('${sha256Hex("setup:" + normalizeCode(code))}', ${now}, ${exp}, ${used ?? "NULL"});`;
      // the legacy admin: password hash in an old format (no "v2$"), so it must never verify
      const legacySalt = crypto.randomBytes(16);
      const legacyHash = passwordFields(pepper, LEGACY_PASSWORD, legacySalt).hash.slice(3);
      const hand = passwordFields(pepper, HAND_PASSWORD);
      const user = (id, name, role, status, phone, created, extra = {}) =>
        `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, password_hash, password_salt, username)
         VALUES (${sqlStr(id)}, ${sqlStr(name)}, 'Management', ${sqlStr(hmacHex(pepper, "phone:" + phone))}, ${sqlStr(aesEncrypt(phoneKey, phone))}, ${sqlStr(phone.slice(-4))},
                 ${sqlStr(role)}, ${sqlStr(status)}, 1, ${created}, ${created}, ${sqlStr(extra.hash)}, ${sqlStr(extra.salt)}, ${sqlStr(extra.username)});`;
      return [
        tok(SETUP_A, now + HOUR),
        tok(SETUP_B, now + HOUR),
        tok(SETUP_EXPIRED, now - 1000),
        tok(SETUP_USED, now + HOUR, now - 5000),
        user("u_legacy", "AJ", "admin", "approved", ADMIN_PHONE, 1000, { hash: legacyHash, salt: legacySalt.toString("base64url"), username: "Legacy.Boss" }),
        user("u_hand", "Second", "admin", "approved", "+12085550111", 1500, { hash: hand.hash, salt: hand.salt, username: "handmade" }),
        user("u_denied", "Old", "member", "denied", OLD_MEMBER_PHONE, 2000),
        `INSERT INTO builds (id, owner_id, name, data, created_at, updated_at) VALUES ('b_old', 'u_denied', 'Old plan', '{}', 2000, 2000);`,
        `INSERT INTO access_codes (id, code_hash, code_enc, batch_id, created_at) VALUES ('c_hand', '${hmacHex(pepper, "access:" + normalizeCode(HAND_CODE))}', ${sqlStr(
          aesEncrypt(phoneKey, HAND_CODE)
        )}, 'b_hand', ${now - 86400000});`,
      ].join("\n");
    },
  });
  admin = new Client(dev.base, { ip: freshIp() });
});
after(async () => {
  if (dev) await dev.stop();
});

// ---------- helpers ----------
async function overview() {
  const r = await admin.get("/api/admin/overview");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function availableCodes() {
  return (await overview()).codes.filter((c) => c.status === "available").map((c) => c.code);
}
async function newSet() {
  const r = await admin.post("/api/admin/codes/new-set", {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return availableCodes();
}
/** a code nobody has used yet (makes a new set when the current one runs out) */
async function takeCode() {
  const left = await availableCodes();
  return left[0] || (await newSet())[0];
}
async function join(client, name, phone) {
  const code = await takeCode();
  const r = await client.post("/api/access/redeem", { code, name, phone });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return code;
}
function assertSecurityHeaders(r, what) {
  const csp = r.headers.get("content-security-policy") || "";
  assert.match(csp, /default-src 'self'/, what);
  assert.match(csp, /script-src 'self'(;|$)/, what);
  assert.match(csp, /style-src 'self'(;|$)/, what);
  assert.match(csp, /img-src 'self' data: blob:/, what);
  assert.match(csp, /frame-ancestors 'none'/, what);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/, what);
  assert.match(r.headers.get("strict-transport-security") || "", /max-age=\d+/, what);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff", what);
  assert.equal(r.headers.get("x-frame-options"), "DENY", what);
  assert.equal(r.headers.get("referrer-policy"), "no-referrer", what);
  assert.match(r.headers.get("permissions-policy") || "", /camera=\(\)/, what);
  assert.equal(r.headers.get("cross-origin-opener-policy"), "same-origin", what);
  assert.equal(r.headers.get("cross-origin-resource-policy"), "same-origin", what);
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow, noarchive", what);
}

// ---------- public surface ----------
test("health is public and says only whether the site is ready", async () => {
  const r = await new Client(dev.base).get("/api/health");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true, db: true, configured: true, accessCodesTable: true });
  assertSecurityHeaders(r, "/api/health");
});

test("only the sign-in page and what it needs are public", async () => {
  const anon = new Client(dev.base);
  const login = await anon.get("/login", { Accept: "text/html" });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("content-type"), /text\/html/);
  assert.equal(login.headers.get("cache-control"), "no-store");
  assert.match(login.text, /This map is private\./);
  // FBS branding on the sign-in page: tokens first, the logo and favicons, no old red; all of it loads without a session
  assert.match(login.text, /<link rel="stylesheet" href="\/assets\/tokens.css">[\s\S]*<link rel="stylesheet" href="\/assets\/base.css">/);
  assert.match(login.text, /src="\/assets\/brand\/fbs-logo-64.png"/);
  assert.match(login.text, /rel="icon" href="\/assets\/brand\/favicon-32.png"/);
  assert.doesNotMatch(login.text, /c8102e|favicon\.svg/i);
  for (const [, url] of login.text.matchAll(/(?:href|src)="(\/[^"?#]+)/g)) {
    if (url === "/login") continue;
    assert.equal((await anon.get(url)).status, 200, `${url} loads without a session`);
  }
  // the theme is applied before the first paint by a public script, not inline code
  assert.match(login.text, /<script src="\/assets\/theme-boot.js"><\/script>[\s\S]*<\/head>/);
  for (const p of ["/login.js", "/login.css", "/assets/tokens.css", "/assets/base.css", "/assets/theme-boot.js", "/robots.txt", "/assets/fonts/ibm-plex-sans-latin-400-normal.woff2",
    "/assets/brand/fbs-logo-64.png", "/assets/brand/favicon-32.png", "/assets/brand/favicon-192.png", "/assets/brand/apple-touch-icon.png"]) {
    const r = await anon.get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("cache-control"), /^public, max-age=\d+$/, p);
    assertSecurityHeaders(r, p);
    assert.equal((await anon.head(p)).status, 200, `HEAD ${p}`);
  }
  const old = await anon.get("/login.html");
  assert.equal(old.status, 302);
  assert.equal(old.headers.get("location"), "/login");
});

test("everything else needs a session, whatever the path looks like", async () => {
  const anon = new Client(dev.base);
  const gated = [
    "/", "/index.html", "/js/main.js", "/js/core/model.js", "/js/view3d/structure.js", "/js/account.js", "/css/app.css", "/tex/prod_atlas.jpg",
    "/vendor/three.min.js", "/vendor/GLTFLoader.js", "/vendor/OrbitControls.js",
    // the store layout and the 3D scan are never public
    "/data/master.json", "/data/scan.glb", "/data/scan-overlay.json", "/DATA/scan.glb", "/data/../data/scan.glb", "/assets/brand/../../data/scan.glb",
    // only the brand files the sign-in and 404 pages show are public (not the full-size logo, not the icon sprite)
    "/assets/brand/", "/assets/brand/fbs-logo.png", "/assets/brand/fbs-logo.svg", "/assets/brand/FBS-logo.png", "/assets/brand/x/fbs-logo.png", "/assets/brand/-x.png",
    "/assets/brand/fbs--logo.png", "/assets/brand/favicon-32.PNG", "/assets/icons.svg", "/assets/icons.svg/", "/assets/tokens.css.map", "/favicon.svg",
    "/assets/fonts/LICENSE-ibm-plex-sans.txt", "/assets/fonts/x.woff2.map", "/assets/theme-boot.js.map",
    "//index.html", "/./js/main.js", "/%2e/js/main.js", "/js/../index.html", "/JS/main.js", "/index.html?x", "/assets/fonts/../../js/main.js",
    "/assets/", "/assets/base.css/", "/no-such-file", "/api", "/api/me", "/api/admin/overview", "/api/nope",
  ];
  for (const p of gated) {
    const html = await anon.get(p, { Accept: "text/html" });
    const any = await anon.get(p);
    const head = await anon.head(p);
    for (const [r, kind] of [[html, "html"], [any, "*/*"], [head, "HEAD"]]) {
      assert.ok([302, 401].includes(r.status), `${kind} ${p} -> ${r.status}`);
      if (r.status === 302) assert.equal(r.headers.get("location"), "/login", `${kind} ${p}`);
      assert.doesNotMatch(r.text, /FBS_STORE|THREE|acctBtn|@font-face|glTF|"items"|scan_front_w/, `${kind} ${p} leaked content`);
      assertSecurityHeaders(r, `${kind} ${p}`);
    }
    if (!p.startsWith("/api")) assert.equal(html.status, 302, `html ${p} should redirect`);
  }
  // the admin area sends people to the admin sign-in
  // (including the asset server's other names for the dashboard page, like /admin.html)
  for (const p of ["/admin", "/admin/", "/admin/index.html", "/admin/admin.js", "/admin/admin.css", "/ADMIN/admin.js", "/admin//admin.js", ...ADMIN_ALIASES]) {
    for (const r of [await anon.get(p, { Accept: "text/html" }), await anon.get(p), await anon.head(p)]) {
      assert.equal(r.status, 302, p);
      assert.equal(r.headers.get("location"), "/login?admin=1", p);
    }
  }
  assert.equal((await anon.post("/api/logout", {})).status, 200, "logout without a session is harmless");
  assert.equal((await anon.req("PUT", "/js/main.js", {})).status, 405);
});

// ---------- admin: legacy row, setup, sign-in ----------
test("the old admin password (unknown format, no v2$) never verifies", async () => {
  const c = visitor();
  for (const username of ["Legacy.Boss", "legacy.boss"]) {
    const r = await c.post("/api/admin/login", { username, password: LEGACY_PASSWORD });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, BAD_LOGIN);
  }
  assert.equal(c.cookie, null);
});

test("a password row made by hand with the documented formula works; every failure looks the same", async () => {
  const c = visitor();
  const ok = await c.post("/api/admin/login", { username: "HANDMADE", password: HAND_PASSWORD });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.redirect, "/admin/");
  assert.ok(c.cookie);
  assert.deepEqual((await c.get("/api/me")).data, { id: "u_hand", name: "Second", role: "admin" });
  assert.equal((await c.post("/api/logout", {})).status, 200);
  for (const body of [
    { username: "handmade", password: "wrong password 1" },
    { username: "nobody", password: HAND_PASSWORD },
    { username: "", password: "" },
    { username: "handmade", password: HAND_PASSWORD.normalize("NFD") + "x" },
  ]) {
    const r = await visitor().post("/api/admin/login", body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.data.error, BAD_LOGIN);
  }
});

test("setup: bad, expired and used codes all fail the same way; nothing changes", async () => {
  const c = visitor();
  for (const setupCode of ["WRONG-WRONG-WRONG-WRONG", SETUP_EXPIRED, SETUP_USED, ""]) {
    const r = await c.post("/api/admin/setup", { setupCode, username: "boss", password: "a good long password" });
    assert.equal(r.status, 400, setupCode);
    assert.equal(r.data.error, BAD_SETUP);
  }
  const weak = await c.post("/api/admin/setup", { setupCode: SETUP_A, username: "boss", password: "short" });
  assert.equal(weak.status, 400);
  assert.match(weak.data.error, /at least 10 characters/);
  const badName = await c.post("/api/admin/setup", { setupCode: SETUP_A, username: "b o", password: "a good long password" });
  assert.equal(badName.status, 400);
  const taken = await c.post("/api/admin/setup", { setupCode: SETUP_A, username: "HandMade", password: "a good long password" });
  assert.equal(taken.status, 400, "a username another admin row uses");
  assert.equal(c.cookie, null);
});

test("setup with a good code keeps the existing admin row and signs in; the code works once", async () => {
  // any case, with or without dashes
  const r = await admin.post("/api/admin/setup", { setupCode: SETUP_A.toLowerCase().replace(/-/g, " "), username: "Boss", password: "correct horse battery" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.redirect, "/admin/");
  assert.match(admin.cookie, /^__Host-fbs_s=[A-Za-z0-9_-]{40,}$/);
  // the oldest admin row (the old one, first name "AJ") got the new username and password
  assert.deepEqual((await admin.get("/api/me")).data, { id: "u_legacy", name: "AJ", role: "admin" });
  const again = await visitor().post("/api/admin/setup", { setupCode: SETUP_A, username: "mallory", password: "correct horse battery" });
  assert.equal(again.status, 400);
  assert.equal(again.data.error, BAD_SETUP);
  // sign in with the new details (username is case-insensitive); the old username is gone
  const c = visitor();
  assert.equal((await c.post("/api/admin/login", { username: "bOSS", password: "correct horse battery" })).status, 200);
  assert.equal((await visitor().post("/api/admin/login", { username: "Legacy.Boss", password: "correct horse battery" })).status, 400);
});

test("the session cookie is __Host-, Secure, HttpOnly, SameSite=Strict, and kept for the 90-day limit", async () => {
  const res = await fetch(dev.base + "/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FBS": "1", Origin: dev.base, "CF-Connecting-IP": freshIp() },
    body: JSON.stringify({ username: "boss", password: "correct horse battery" }),
  });
  assert.equal(res.status, 200);
  const sc = res.headers.get("set-cookie");
  // 90 days: the server ends a session after 30 days without a visit (sliding) or 90 days in all; a 30-day
  // cookie would be dropped by the browser 30 days after sign-in however often the person came back
  assert.match(sc, /^__Host-fbs_s=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=7776000$/);
});

test("the admin gets the dashboard; /login sends a signed-in admin there", async () => {
  const page = await admin.get("/admin/", { Accept: "text/html" });
  assert.equal(page.status, 200);
  assert.match(page.text, /Access codes/);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assertSecurityHeaders(page, "/admin/");
  const js = await admin.get("/admin/admin.js");
  assert.equal(js.status, 200);
  assert.equal(js.headers.get("cache-control"), "private, no-cache"); // the dashboard is re-checked against the session every time
  assert.equal((await admin.get("/admin")).headers.get("location"), "/admin/");
  // the dashboard has one address: its other names send the admin there
  for (const p of ["/admin.html", "/admin.html?x", "/Admin.HTML", "/admin.htm", "/ADMIN"]) {
    for (const r of [await admin.get(p, { Accept: "text/html" }), await admin.head(p)]) {
      assert.equal(r.status, 302, p);
      assert.equal(r.headers.get("location"), "/admin/", p);
    }
  }
  for (const p of ["/admin.", "/admin.js", "/admin./admin.js"]) assert.equal((await admin.get(p)).status, 404, p);
  for (const p of ["/login", "/login?admin=1"]) {
    const r = await admin.get(p, { Accept: "text/html" });
    assert.equal(r.status, 302, p);
    assert.equal(r.headers.get("location"), "/admin/", p);
  }
  assert.equal((await admin.get("/login?setup=1", { Accept: "text/html" })).status, 200);
  // the map works for the admin too
  const map = await admin.get("/", { Accept: "text/html" });
  assert.equal(map.status, 200);
  assert.match(map.text, /id="acctBtn"/);
  assert.equal((await admin.get("/no-such-file")).status, 404);
  assert.equal((await admin.get("//index.html")).status, 404);
  assert.equal((await admin.get("/api/nope")).status, 404);
});

test("CSRF: every POST and DELETE needs X-FBS, our Origin and a same-site fetch", async () => {
  const targets = [
    ["POST", "/api/access/check", { code: HAND_CODE }],
    ["POST", "/api/access/redeem", { code: HAND_CODE, name: "Eve", phone: "2085550666" }],
    ["POST", "/api/admin/login", { username: "boss", password: "correct horse battery" }],
    ["POST", "/api/admin/setup", { setupCode: SETUP_B, username: "eve", password: "correct horse battery" }],
    ["POST", "/api/logout", {}],
    ["POST", "/api/admin/codes/new-set", {}],
    ["POST", "/api/admin/password", { currentPassword: "correct horse battery", newPassword: "evil evil evil evil" }],
    ["DELETE", "/api/admin/people/u_denied", undefined],
  ];
  const bad = [{ "X-FBS": null }, { "X-FBS": "0" }, { Origin: "https://evil.example" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }];
  for (const [m, p, body] of targets) {
    for (const h of bad) {
      const r = await admin.req(m, p, body, h);
      assert.equal(r.status, 403, `${m} ${p} ${JSON.stringify(h)}`);
    }
  }
  // nothing happened: still signed in, the hand-made code is still the only one, setup code B unused
  assert.equal((await admin.get("/api/me")).status, 200);
  const o = await overview();
  assert.deepEqual(o.codes.map((c) => c.code), [HAND_CODE]);
  assert.equal(o.people.length, 0);
});

// ---------- access codes ----------
test("an access code made by hand with the documented formula works and is shown to the admin", async () => {
  const o = await overview();
  assert.equal(o.codes.length, 1);
  assert.equal(o.codes[0].code, HAND_CODE);
  assert.equal(o.codes[0].status, "available");
  assert.ok(o.batchCreatedAt);
  const c = visitor();
  for (const code of [HAND_CODE, "hndmade2", " hndm ade2 ", "HNDM.ADE2"]) {
    const r = await c.post("/api/access/check", { code });
    assert.equal(r.status, 200, code);
    assert.deepEqual(r.data, { ok: true });
  }
});

test("a new set makes exactly 5 usable codes and cancels the unused ones", async () => {
  const first = await newSet();
  assert.equal(first.length, 5);
  assert.equal(new Set(first).size, 5);
  for (const code of first) assert.match(code, CODE_RE);
  const c = visitor();
  const canceled = await c.post("/api/access/check", { code: HAND_CODE });
  assert.equal(canceled.status, 400, "the old unused code is canceled");
  assert.equal(canceled.data.error, BAD_CODE);

  const second = await newSet();
  assert.equal(second.length, 5);
  assert.ok(second.every((x) => !first.includes(x)));
  for (const code of first) {
    const r = await c.post("/api/access/check", { code });
    assert.equal(r.status, 400, "codes from the old set stop working");
    assert.equal(r.data.error, BAD_CODE);
  }
  const d = visitor();
  for (const code of second) assert.equal((await d.post("/api/access/check", { code })).status, 200);

  // two sets at the same moment still leave one set of 5
  const [a, b] = await Promise.all([admin.post("/api/admin/codes/new-set", {}), admin.post("/api/admin/codes/new-set", {})]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const now = await overview();
  assert.equal(now.codes.length, 5);
  assert.equal(now.codes.filter((x) => x.status === "available").length, 5);
  let usable = 0;
  const e = visitor();
  for (const code of [...first, ...second]) if ((await e.post("/api/access/check", { code })).status === 200) usable++;
  assert.equal(usable, 0, "older sets are all canceled");
});

test("checking a code doesn't use it; redeeming uses it exactly once", async () => {
  const [code] = await availableCodes();
  const v = visitor();
  for (let i = 0; i < 3; i++) assert.equal((await v.post("/api/access/check", { code: code.toLowerCase() })).status, 200);
  const r = await v.post("/api/access/redeem", { code, name: "Ann Example", phone: "(208) 555-0101" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data, { ok: true, redirect: "/" });
  assert.ok(v.cookie);
  const meAnn = (await v.get("/api/me")).data;
  assert.match(meAnn.id, /^u_[A-Za-z0-9_-]+$/);
  assert.deepEqual(meAnn, { id: meAnn.id, name: "Ann Example", role: "member" });

  const w = visitor();
  const again = await w.post("/api/access/redeem", { code, name: "Ben", phone: "2085550102" });
  assert.equal(again.status, 400);
  assert.equal(again.data.error, BAD_CODE);
  assert.equal(again.data.field, "code");
  assert.equal(w.cookie, null);
  assert.equal((await w.post("/api/access/check", { code })).status, 400);

  const o = await overview();
  const used = o.codes.find((c) => c.status === "used");
  assert.equal(used.code, null, "used codes are not shown again");
  assert.equal(used.usedByName, "Ann Example");
  assert.ok(used.usedAt);
  const ann = o.people.find((p) => p.name === "Ann Example");
  assert.equal(ann.phone, "(208) 555-0101");
  assert.equal(ann.tel, "+12085550101");
  assert.ok(ann.joinedAt && ann.lastSeenAt);
  assert.equal(o.codes.filter((c) => c.status === "available").length, 4);
});

test("two people racing on one code: exactly one gets in", async () => {
  const code = await takeCode();
  const before = (await overview()).people.length;
  const x = visitor(), y = visitor();
  const results = await Promise.all([
    x.post("/api/access/redeem", { code, name: "Racer One", phone: "2085550121" }),
    y.post("/api/access/redeem", { code, name: "Racer Two", phone: "2085550122" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal([x, y].filter((c) => c.cookie).length, 1);
  assert.equal((await overview()).people.length, before + 1);
});

test("name and phone are checked, and a rejected form doesn't use up the code", async () => {
  const code = await takeCode();
  const v = visitor();
  const bad = [
    [{ name: "", phone: "2085550131" }, "name"],
    [{ name: "   ", phone: "2085550131" }, "name"],
    [{ name: "<script>alert(1)</script>", phone: "2085550131" }, "name"],
    [{ name: "Robert'); DROP TABLE users;--", phone: "2085550131" }, "name"],
    [{ name: "A".repeat(61), phone: "2085550131" }, "name"],
    [{ name: "1337", phone: "2085550131" }, "name"],
    [{ name: { first: "x" }, phone: "2085550131" }, "name"],
    [{ name: "\u3164", phone: "2085550131" }, "name"], // Hangul filler: a "letter" that shows nothing
    [{ name: "\u115F\u1160 \uFFA0", phone: "2085550131" }, "name"],
    [{ name: "\u200B\u200D", phone: "2085550131" }, "name"],
    [{ name: "A" + "\u0301".repeat(59), phone: "2085550131" }, "name"], // accents stacked into a tower
    [{ name: "Ann" + "\u0334\u0335\u0336\u0337", phone: "2085550131" }, "name"],
    [{ name: "Cara", phone: "" }, "phone"],
    [{ name: "Cara", phone: "12345" }, "phone"],
    [{ name: "Cara", phone: "208-555-01234" }, "phone"],
    [{ name: "Cara", phone: "+1234567" }, "phone"],
    [{ name: "Cara", phone: "+1234567890123456" }, "phone"],
    [{ name: "Cara", phone: "208-555-CALL" }, "phone"],
    [{ name: "Cara", phone: 2085550131 }, "phone"],
    [{ name: "Cara", phone: ["2085550131"] }, "phone"],
  ];
  for (const [body, field] of bad) {
    const r = await v.post("/api/access/redeem", { code, ...body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.data.field, field, JSON.stringify(body));
  }
  assert.equal((await v.post("/api/access/check", { code })).status, 200, "still unused");
  // invisible characters are dropped, not stored
  const ok = await v.post("/api/access/redeem", { code, name: "  Zoë \u200B  O’Brien-Smith Jr.\u3164  ", phone: "+44 20 7946 0958" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await v.get("/api/me")).data.name, "Zoë O’Brien-Smith Jr.");
  const zoe = (await overview()).people.find((p) => p.name.startsWith("Zoë"));
  assert.equal(zoe.phone, "+442079460958");
  // 10 digits, 11 digits with a leading 1, dots and spaces all become the same +1 number
  const w = visitor();
  await join(w, "Dee", "1.208.555.0141");
  assert.equal((await overview()).people.find((p) => p.name === "Dee").tel, "+12085550141");
});

test("members get the map, but nothing of the admin's", async () => {
  const m = visitor();
  await join(m, "Mia Member", "2085550151");
  const page = await m.get("/", { Accept: "text/html" });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assertSecurityHeaders(page, "member /");
  for (const p of ["/js/main.js", "/js/core/model.js", "/js/account.js", "/css/app.css", "/tex/prod_atlas.jpg", "/vendor/three.min.js", "/vendor/GLTFLoader.js",
    "/vendor/OrbitControls.js", "/data/master.json", "/data/scan-overlay.json", "/data/scan.glb", "/assets/icons.svg", "/assets/brand/fbs-logo.png"]) {
    const r = await m.get(p);
    assert.equal(r.status, 200, p);
    assertSecurityHeaders(r, `member ${p}`);
    // private (never in a shared cache); code, styles and textures are kept 5 minutes like the public sign-in
    // styles, so a page's modules and tokens.css expire together; the store data is re-checked every request
    assert.equal(r.headers.get("cache-control"), p.startsWith("/data/") ? "private, no-cache" : "private, max-age=300", p);
    assert.equal((await m.head(p)).status, 200, `HEAD ${p}`);
  }
  assert.match((await m.get("/js/main.js")).headers.get("content-type"), /javascript/);
  assert.match((await m.get("/data/master.json")).headers.get("content-type"), /application\/json/);
  const master = JSON.parse((await m.get("/data/master.json")).text);
  assert.deepEqual(master, JSON.parse(readFileSync(new URL("../public/data/master.json", import.meta.url))), "the one master layout file, as is");
  assert.equal((await m.get("/js/store-data.js")).status, 404, "the old static layout is gone");
  assert.match((await m.get("/tex/prod_atlas.jpg")).headers.get("content-type"), /image\/jpeg/);
  for (const p of ["/admin/", "/admin/admin.js", "/admin/index.html", "/ADMIN/", "/admin", ...ADMIN_ALIASES]) {
    for (const r of [await m.get(p, { Accept: "text/html" }), await m.get(p), await m.head(p)]) {
      assert.equal(r.status, 404, p);
      assert.doesNotMatch(r.text, /Access codes|admin\.js|Store Map · Admin/, `${p} leaked the dashboard`);
    }
  }
  for (const [method, p, body] of [
    ["GET", "/api/admin/overview"],
    ["POST", "/api/admin/codes/new-set", {}],
    ["POST", "/api/admin/password", { currentPassword: "x", newPassword: "yyyyyyyyyyyy" }],
    ["DELETE", "/api/admin/people/u_denied"],
    ["GET", "/api/admin/nope"],
  ]) {
    const r = await m.req(method, p, body);
    assert.equal(r.status, 403, `${method} ${p}`);
  }
  assert.equal((await m.get("/login", { Accept: "text/html" })).headers.get("location"), "/");
  assert.equal((await m.get("/login?admin=1", { Accept: "text/html" })).status, 200, "a member can still open the admin sign-in form");
  assert.equal((await m.post("/api/admin/login", { username: "boss", password: "wrong password 1" })).status, 400);
});

test("a session lasts 30 days from the last visit and 90 days at most", async () => {
  const m = visitor();
  const code = await takeCode();
  const r = await m.post("/api/access/redeem", { code, name: "Lena Longtime", phone: "2085550192" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.headers.get("set-cookie"), /; Max-Age=7776000$/);
  const hash = sha256Hex(m.cookie.slice(m.cookie.indexOf("=") + 1));
  const now = Date.now();
  // joined 60 days ago and last here 20 days ago: still signed in, and this visit moves the 30 days forward
  await dev.sql(`UPDATE sessions SET created_at = ${now - 60 * DAY}, last_seen_at = ${now - 20 * DAY}, expires_at = ${now + 10 * DAY}, absolute_expires_at = ${now + 30 * DAY} WHERE token_hash = '${hash}'`);
  assert.equal((await m.get("/api/me")).status, 200);
  const [row] = await dev.sql(`SELECT expires_at, last_seen_at FROM sessions WHERE token_hash = '${hash}'`);
  assert.ok(row.last_seen_at >= now, "the visit is recorded");
  assert.ok(row.expires_at >= now + 29 * DAY && row.expires_at <= now + 30 * DAY + HOUR, `slid to the 90-day limit (${(row.expires_at - now) / DAY} days)`);
  // more than 30 days without a visit: signed out
  await dev.sql(`UPDATE sessions SET last_seen_at = ${now - 31 * DAY}, expires_at = ${now - DAY} WHERE token_hash = '${hash}'`);
  assert.equal((await m.get("/api/me")).status, 401);
  assert.equal((await m.get("/", { Accept: "text/html" })).headers.get("location"), "/login");
  // 90 days in all: signed out even after a visit yesterday
  const n = visitor();
  await join(n, "Nina Ninety", "2085550193");
  const nHash = sha256Hex(n.cookie.slice(n.cookie.indexOf("=") + 1));
  await dev.sql(`UPDATE sessions SET created_at = ${now - 90 * DAY}, last_seen_at = ${now - DAY}, expires_at = ${now + 29 * DAY}, absolute_expires_at = ${now - 1000} WHERE token_hash = '${nHash}'`);
  assert.equal((await n.get("/api/me")).status, 401);
});

test("a page that doesn't exist gets a small page with a way back, the same one members see at /admin/", async () => {
  const m = visitor();
  await join(m, "Nell Nowhere", "2085550194");
  const pages = [];
  for (const [c, p] of [[admin, "/nope"], [admin, "/admin/nope"], [admin, "/tex/nope.jpg"], [m, "/nope"], [m, "/admin/"], [m, "/admin/admin.js"], [m, "/ADMIN/"], [m, "/admin.html"]]) {
    const r = await c.get(p, { Accept: "text/html" });
    assert.equal(r.status, 404, p);
    assert.match(r.headers.get("content-type"), /^text\/html/, p);
    assert.equal(r.headers.get("cache-control"), "no-store", p);
    assertSecurityHeaders(r, `404 ${p}`);
    pages.push(r.text);
  }
  assert.ok(pages.every((t) => t === pages[0]), "one 404 page for everything, so a member can't tell the dashboard exists");
  assert.match(pages[0], /This page doesn't exist/);
  assert.match(pages[0], /<a [^>]*href="\/"[^>]*>Open the store map<\/a>/);
  assert.doesNotMatch(pages[0], /<script(?![^>]*\bsrc=)|<script[^>]*>[^<]|<style|\sstyle\s*=|\son[a-z]+\s*=/i, "nothing the CSP would block");
  // the theme chosen in the map applies here too (a public script in <head>), and the logo next to the wordmark is decorative
  assert.match(pages[0], /<script src="\/assets\/theme-boot.js"><\/script>[\s\S]*<\/head>/);
  assert.match(pages[0], /<img src="\/assets\/brand\/fbs-logo-64.png"[^>]* alt="">/);
  for (const [, href] of pages[0].matchAll(/(?:href|src)="(\/[^"]+)"/g)) assert.equal((await new Client(dev.base).get(href)).status, 200, `${href} loads without a session`);
  // FBS branding: tokens first, the logo, no old red
  assert.match(pages[0], /<link rel="stylesheet" href="\/assets\/tokens.css">[\s\S]*<link rel="stylesheet" href="\/assets\/base.css">/);
  assert.match(pages[0], /src="\/assets\/brand\/fbs-logo-64.png"/);
  assert.doesNotMatch(pages[0], /c8102e|favicon\.svg/i);
  // files that aren't pages still get a plain 404
  for (const p of ["/js/missing.js", "/nope"]) {
    const r = await m.get(p);
    assert.equal(r.status, 404, p);
    assert.match(r.headers.get("content-type"), /^text\/plain/, p);
  }
  assert.equal((await admin.get("/api/nope", { Accept: "text/html" })).headers.get("content-type").split(";")[0], "application/json");
});

test("removing a member signs them out on their very next request", async () => {
  const m = visitor();
  await join(m, "Rex Removed", "2085550161");
  assert.equal((await m.get("/js/main.js")).status, 200);
  const before = await overview();
  const rex = before.people.find((p) => p.name === "Rex Removed");
  assert.equal(before.codes.filter((c) => c.usedByName === "Rex Removed").length, 1);
  const orphansBefore = before.codes.filter((c) => c.status === "used" && c.usedByName === null).length;
  const r = await admin.del(`/api/admin/people/${rex.id}`);
  assert.equal(r.status, 200);
  assert.equal((await m.get("/js/main.js")).status, 401);
  const page = await m.get("/", { Accept: "text/html" });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get("location"), "/login");
  assert.equal((await m.get("/api/me")).status, 401);
  const after = await overview();
  assert.ok(!after.people.some((p) => p.id === rex.id));
  assert.equal(after.codes.filter((c) => c.usedByName === "Rex Removed").length, 0);
  assert.equal(after.codes.filter((c) => c.status === "used" && c.usedByName === null).length, orphansBefore + 1, "the code now reads 'person removed'");
  assert.equal((await admin.del(`/api/admin/people/${rex.id}`)).status, 404, "already gone");
  assert.equal((await admin.del("/api/admin/people/..%2F")).status, 404);
});

test("the admin can't be removed through the API", async () => {
  for (const id of ["u_legacy", "u_hand"]) assert.equal((await admin.del(`/api/admin/people/${id}`)).status, 404, id);
  assert.deepEqual((await admin.get("/api/me")).data, { id: "u_legacy", name: "AJ", role: "admin" });
});

test("the same phone with a new code reuses the person's row (even an old denied one)", async () => {
  const v = visitor();
  await join(v, "Olive", "208.555.0188");
  let o = await overview();
  const olive = o.people.find((p) => p.id === "u_denied");
  assert.ok(olive, "the old row is reused and approved");
  assert.equal(olive.name, "Olive");
  const w = visitor();
  await join(w, "Olive Two", "+1 (208) 555-0188");
  o = await overview();
  assert.equal(o.people.filter((p) => p.tel === OLD_MEMBER_PHONE).length, 1);
  assert.equal(o.people.find((p) => p.id === "u_denied").name, "Olive Two");
  assert.equal((await v.get("/api/me")).data.name, "Olive Two", "the first device stays signed in");
  // removing works even with rows left from the old planner (builds)
  assert.equal((await admin.del("/api/admin/people/u_denied")).status, 200);
  assert.equal((await w.get("/api/me")).status, 401);
  assert.equal((await v.get("/api/me")).status, 401);
  // and they can come back with another code
  const back = visitor();
  await join(back, "Olive Again", "2085550188");
  assert.equal((await overview()).people.filter((p) => p.tel === OLD_MEMBER_PHONE).length, 1);
});

test("the admin's phone can't be used, the code stays unused, and a wrong code says nothing about the phone", async () => {
  const code = await takeCode();
  const v = visitor();
  const probe = await v.post("/api/access/redeem", { code: "ZZZZ-ZZZZ", name: "Imposter", phone: "+1 208 555 0100" });
  assert.equal(probe.status, 400);
  assert.equal(probe.data.error, BAD_CODE, "without a working code, nothing tells whose phone number it is");
  const r = await v.post("/api/access/redeem", { code, name: "Imposter", phone: "+1 208 555 0100" });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "That phone number can't be used here.");
  assert.equal(v.cookie, null);
  assert.equal((await v.post("/api/access/check", { code })).status, 200, "the code still works");
  assert.equal((await overview()).codes.find((c) => c.code === code).status, "available");
  assert.deepEqual((await admin.get("/api/me")).data, { id: "u_legacy", name: "AJ", role: "admin" }, "the admin row is untouched");
});

test("wrong access codes are rate limited per IP (successes don't count)", async () => {
  const code = await takeCode();
  const good = visitor();
  for (let i = 0; i < 12; i++) assert.equal((await good.post("/api/access/check", { code })).status, 200, "successes never count");
  const bad = visitor();
  for (let i = 0; i < 6; i++) assert.equal((await bad.post("/api/access/check", { code: "ZZZZ-ZZZZ" })).status, 400);
  for (let i = 0; i < 4; i++) assert.equal((await bad.post("/api/access/redeem", { code: "ZZZZ-ZZZ" + i, name: "X", phone: "2085550171" })).status, 400);
  const blocked = await bad.post("/api/access/check", { code });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.error, TOO_MANY);
  assert.equal((await bad.post("/api/access/redeem", { code, name: "X", phone: "2085550171" })).status, 429);
  assert.equal((await visitor().post("/api/access/check", { code })).status, 200, "other people aren't affected");
  assert.equal((await good.post("/api/access/check", { code })).status, 200);
});

test("a burst of wrong codes sent all at once still stops at 10", async () => {
  const ip = freshIp();
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      new Client(dev.base, { ip }).post(i % 3 ? "/api/access/check" : "/api/access/redeem", { code: "QQQQ-QQ" + String(20 + i), name: "Burst", phone: "2085550199" })
    )
  );
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 400).length, 10, `only 10 guesses get an answer (${statuses.join(",")})`);
  assert.equal(statuses.filter((s) => s === 429).length, 20);
  assert.equal((await new Client(dev.base, { ip }).post("/api/access/check", { code: await takeCode() })).status, 429, "and the limit holds afterwards");
});

test("per-IP limits count a whole IPv6 /64 (one home or server) as one place", async () => {
  const net = `2001:db8:${(0x700 + ipN++).toString(16)}:${(ipN++).toString(16)}`;
  const from = (addr) => new Client(dev.base, { ip: addr });
  for (let i = 1; i <= 10; i++) {
    const r = await from(`${net}::${i.toString(16)}`).post("/api/access/check", { code: "VVVV-VVV" + (i % 8 + 2) });
    assert.equal(r.status, 400, `guess ${i}`);
  }
  // any other address in the same /64, however it's written
  const [a, b, c, d] = net.split(":");
  for (const addr of [`${net}:1234:5678:9abc:def0`, `${a}:${b}:${c.padStart(4, "0")}:${d.padStart(4, "0")}:0:0:0:1`, `${net.toUpperCase()}::ffff`, `${net}::1%eth0`]) {
    assert.equal((await from(addr).post("/api/access/check", { code: "VVVV-VVVV" })).status, 429, addr);
  }
  assert.equal((await from(`${a}:${b}:${c}:${(parseInt(d, 16) + 1).toString(16)}::1`).post("/api/access/check", { code: "VVVV-VVVV" })).status, 400, "the next /64 is someone else");
  // the admin sign-in limit too
  const net2 = `2001:db8:${(0x700 + ipN++).toString(16)}:0`;
  for (let i = 1; i <= 10; i++) assert.equal((await from(`${net2}::${i.toString(16)}`).post("/api/admin/login", { username: "v6user" + i, password: "wrong password 1" })).status, 400);
  assert.equal((await from(`${net2}::ff`).post("/api/admin/login", { username: "v6user99", password: "wrong password 1" })).status, 429);
  // an IPv4 address written as IPv6 is the same IPv4 address
  const v4 = `10.201.${ipN & 255}.${(ipN++ >> 8) & 255}`;
  for (let i = 0; i < 10; i++) assert.equal((await from(`::ffff:${v4}`).post("/api/access/check", { code: "WWWW-WWWW" })).status, 400);
  assert.equal((await from(v4).post("/api/access/check", { code: "WWWW-WWWW" })).status, 429);
});

test("admin sign-in is rate limited per IP and per username", async () => {
  const ip = visitor();
  for (let i = 0; i < 10; i++) assert.equal((await ip.post("/api/admin/login", { username: "user" + i, password: "wrong password 1" })).status, 400);
  const blocked = await ip.post("/api/admin/login", { username: "boss", password: "correct horse battery" });
  assert.equal(blocked.status, 429, "even the right password, from that IP");
  assert.equal(blocked.data.error, TOO_MANY);
  // 10 tries at one username from 10 different places lock that username (any case)
  for (let i = 0; i < 10; i++) assert.equal((await visitor().post("/api/admin/login", { username: i % 2 ? "Ghost.User" : "ghost.user", password: "wrong password " + i })).status, 400);
  assert.equal((await visitor().post("/api/admin/login", { username: "GHOST.USER", password: "wrong password" })).status, 429);
  // ... and a locked real account refuses even its right password
  let r, n = 0;
  do r = await visitor().post("/api/admin/login", { username: "HandMade", password: "wrong password " + n++ });
  while (r.status === 400 && n < 12);
  assert.equal(r.status, 429);
  const locked = await visitor().post("/api/admin/login", { username: "handmade", password: HAND_PASSWORD });
  assert.equal(locked.status, 429);
  assert.equal((await visitor().post("/api/admin/login", { username: "boss", password: "correct horse battery" })).status, 200, "other usernames still work");
});

test("changing the password signs out the admin's other sessions", async () => {
  const other = visitor();
  assert.equal((await other.post("/api/admin/login", { username: "boss", password: "correct horse battery" })).status, 200);
  const wrong = await admin.post("/api/admin/password", { currentPassword: "not it at all", newPassword: "a brand new password" });
  assert.equal(wrong.status, 400);
  const short = await admin.post("/api/admin/password", { currentPassword: "correct horse battery", newPassword: "short" });
  assert.equal(short.status, 400);
  assert.equal((await other.get("/api/me")).status, 200, "nothing changed yet");
  const ok = await admin.post("/api/admin/password", { currentPassword: "correct horse battery", newPassword: "a brand new password" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await admin.get("/api/me")).status, 200, "this session stays");
  assert.equal((await other.get("/api/me")).status, 401, "the other session is gone");
  assert.equal((await visitor().post("/api/admin/login", { username: "boss", password: "correct horse battery" })).status, 400);
  assert.equal((await visitor().post("/api/admin/login", { username: "boss", password: "a brand new password" })).status, 200);
});

test("setting up again (forgotten password) keeps the row and signs out every session", async () => {
  const r = await visitor().post("/api/admin/setup", { setupCode: SETUP_B, username: "boss2", password: "another fine password" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await admin.get("/api/me")).status, 401, "old admin sessions are signed out");
  const c = visitor();
  assert.equal((await c.post("/api/admin/login", { username: "boss2", password: "another fine password" })).status, 200);
  assert.deepEqual((await c.get("/api/me")).data, { id: "u_legacy", name: "AJ", role: "admin" });
  admin = c;
});

test("signing out ends the session for good", async () => {
  const m = visitor();
  await join(m, "Sam Signout", "2085550181");
  const old = m.cookie;
  const r = await m.post("/api/logout", {});
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /__Host-fbs_s=; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=0/);
  const replay = new Client(dev.base);
  replay.cookie = old;
  assert.equal((await replay.get("/api/me")).status, 401, "an old cookie doesn't work after logout");
  assert.equal((await replay.get("/", { Accept: "text/html" })).status, 302);
  // a made-up or malformed cookie is just "signed out"
  for (const bad of ["__Host-fbs_s=" + "A".repeat(43), "__Host-fbs_s=../../etc", "__Host-fbs_s="]) {
    const c = new Client(dev.base);
    c.cookie = bad;
    assert.equal((await c.get("/api/me")).status, 401);
  }
});

// ---------- handler checks with a stand-in database (exact statements, no timing noise) ----------
test("a wrong admin password is answered without waiting on a write, the same way for real and made-up usernames", async () => {
  const { adminLogin } = await import("../src/routes/account.js");
  const secrets = await mockSecrets();
  const real = passwordFields(secrets.PEPPER, "the real password 1");
  async function attempt(username) {
    const db = mockDb((s) => {
      if (s.sql.startsWith("INSERT INTO rate_limits")) return { count: 1 };
      if (s.sql.startsWith("SELECT") && s.sql.includes("FROM users")) {
        return String(s.args[0]).toLowerCase() === "boss" ? { id: "u_admin", password_hash: real.hash, password_salt: real.salt } : null;
      }
      if (/^(INSERT|UPDATE|DELETE)/.test(s.sql)) return new Promise(() => {}); // a write that never finishes
      return null;
    });
    const background = [];
    const ctx = { waitUntil: (p) => background.push(p) };
    const outcome = await Promise.race([
      adminLogin(jsonRequest("/api/admin/login", { username, password: "a wrong password 1" }), { ...secrets, DB: db }, ctx).then(
        () => "signed in",
        (e) => `${e.status} ${e.message}`
      ),
      new Promise((r) => setTimeout(() => r("still waiting on the database"), 4000)),
    ]);
    return { outcome, statements: db.log.map((s) => s.sql) };
  }
  const known = await attempt("Boss");
  const unknown = await attempt("nobody.here");
  assert.equal(known.outcome, "400 " + BAD_LOGIN, "a real username isn't held up by bookkeeping writes");
  assert.equal(unknown.outcome, "400 " + BAD_LOGIN);
  assert.deepEqual(known.statements, unknown.statements, "the same statements run either way");
});

test("an admin's phone number is refused before the access code is touched", async () => {
  const { redeem } = await import("../src/routes/access.js");
  const secrets = await mockSecrets();
  const db = mockDb((s) => {
    if (s.sql.startsWith("INSERT INTO rate_limits")) return { count: 1 };
    if (s.sql.startsWith("SELECT") && s.sql.includes("FROM rate_limits")) return null;
    if (s.sql.startsWith("SELECT") && s.sql.includes("FROM access_codes")) return { id: "c_1", batch_id: "b_1" };
    if (s.sql.startsWith("SELECT") && s.sql.includes("FROM users")) return { id: "u_admin", role: "admin" };
    if (s.sql.startsWith("INSERT INTO users")) return null; // the upsert skips an admin row
    return { meta: { changes: 1 } };
  });
  await assert.rejects(
    redeem(jsonRequest("/api/access/redeem", { code: "ABCD-EFGH", name: "Imposter", phone: "2085550100" }), { ...secrets, DB: db }),
    (e) => e.status === 400 && e.message === "That phone number can't be used here."
  );
  // using the code up and handing it back later could bring back a code that a new set canceled in between
  assert.deepEqual(db.log.filter((s) => s.sql.startsWith("UPDATE access_codes")).map((s) => s.sql), []);
});
