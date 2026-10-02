// End-to-end security checks against a real local Worker with a fresh database.
// Covers: sign-in gating, CSRF, admin setup, approval codes, code lockout, build isolation between
// users, admin-only routes, sharing and taking a share back, one-build shares, revoking people,
// version conflicts and logout.
// Run: npm run test:security
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDev } from "./helpers/devserver.mjs";
import { Client } from "./helpers/client.mjs";

let dev, admin, A, B, C;
const PHONES = { admin: "2085550100", A: "2085550101", B: "2085550102", C: "2085550103" };

before(async () => {
  dev = await startDev({ port: 8791 });
  admin = new Client(dev.base);
  A = new Client(dev.base);
  B = new Client(dev.base);
  C = new Client(dev.base);
});
after(async () => {
  if (dev) await dev.stop();
});

async function userId(name) {
  const r = await admin.get("/api/admin/users");
  return r.data.users.find((u) => u.firstName === name).id;
}
async function approveAndSignIn(client, name, phone) {
  const id = await userId(name);
  const ap = await admin.post(`/api/admin/users/${id}/approve`, {});
  assert.equal(ap.status, 200);
  assert.match(ap.data.code, /^\d{6}$/);
  const v = await client.post("/api/auth/verify", { phone, code: ap.data.code });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.ok(client.cookie, "verify should set a session cookie");
  return id;
}

test("everything is behind sign-in", async () => {
  const anon = new Client(dev.base);
  for (const p of ["/app/", "/app/main.js", "/vendor/three.module.min.js"]) {
    const r = await anon.get(p, { Accept: p.endsWith("/") ? "text/html" : "*/*" });
    assert.ok([302, 401].includes(r.status), `${p} -> ${r.status}`);
    if (r.status === 302) assert.equal(r.headers.get("location"), "/login");
  }
  assert.equal((await anon.get("/api/bootstrap")).status, 401);
  assert.equal((await anon.get("/admin/")).status, 404);
  assert.notEqual((await anon.get("/api/admin/users")).status, 200);
  assert.equal((await anon.get("/robots.txt")).status, 200);
  const login = await anon.get("/login");
  assert.equal(login.status, 200);
  const csp = login.headers.get("content-security-policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(login.headers.get("x-frame-options"), "DENY");
  assert.equal(login.headers.get("x-robots-tag")?.includes("noindex"), true);
});

test("requests without the app header or from another site are blocked", async () => {
  const anon = new Client(dev.base);
  let r = await anon.req("POST", "/api/auth/request", { firstName: "X", workArea: "Paint", phone: "2085550199" }, { "X-FBS": "" });
  assert.equal(r.status, 403);
  r = await anon.req("POST", "/api/auth/request", { firstName: "X", workArea: "Paint", phone: "2085550199" }, { Origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("admin setup works once with the setup code", async () => {
  const bad = new Client(dev.base);
  assert.equal((await bad.post("/api/auth/setup", { setupCode: "WRONGWRONGWRONG1", firstName: "AJ", phone: PHONES.admin })).status, 400);
  const r = await admin.post("/api/auth/setup", { setupCode: dev.setupCode, firstName: "AJ", phone: PHONES.admin });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.recoveryCodes.length, 8);
  assert.ok(admin.cookie);
  const again = await new Client(dev.base).post("/api/auth/setup", { setupCode: dev.setupCode, firstName: "Mallory", phone: "2085550666" });
  assert.equal(again.status, 404, "setup must be gone once an admin exists");
  const cookie = admin.cookie;
  assert.match(cookie, /^__Host-fbs_s=[A-Za-z0-9_-]{30,}$/);
});

test("access requests answer the same way whether or not the number is known", async () => {
  for (const [name, phone] of [["Ann", PHONES.A], ["Ben", PHONES.B], ["Cal", PHONES.C]]) {
    const r = await new Client(dev.base).post("/api/auth/request", { firstName: name, workArea: "Sales floor", phone });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { ok: true });
  }
  const users = (await admin.get("/api/admin/users")).data.users;
  assert.equal(users.filter((u) => u.status === "pending").length, 3);
  assert.equal(users.find((u) => u.firstName === "Ann").phone, "(208) 555-0101");
});

test("a code is required, works once, and locks after 5 wrong tries", async () => {
  // not approved yet: any code fails with the same generic message
  const early = await A.post("/api/auth/verify", { phone: PHONES.A, code: "123456" });
  assert.equal(early.status, 400);
  await approveAndSignIn(A, "Ann", PHONES.A);
  // the same code can't be reused
  const id = await userId("Ben");
  const ap = await admin.post(`/api/admin/users/${id}/approve`, {});
  const wrong = ap.data.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    const r = await B.post("/api/auth/verify", { phone: PHONES.B, code: wrong });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, early.data.error, "error text must not reveal anything");
  }
  const locked = await B.post("/api/auth/verify", { phone: PHONES.B, code: ap.data.code });
  assert.equal(locked.status, 400, "the right code must fail after 5 wrong tries");
  assert.equal(B.cookie, null);
  const fresh = await admin.post(`/api/admin/users/${id}/code`, {});
  const ok = await B.post("/api/auth/verify", { phone: PHONES.B, code: fresh.data.code });
  assert.equal(ok.status, 200);
  const reuse = await new Client(dev.base).post("/api/auth/verify", { phone: PHONES.B, code: fresh.data.code });
  assert.equal(reuse.status, 400, "codes work once");
  await approveAndSignIn(C, "Cal", PHONES.C);
});

let aBuild, aBuild2;

test("one person can't see, change, delete or list another person's build", async () => {
  const r = await A.post("/api/builds", { name: "Ann's plan" });
  assert.equal(r.status, 201);
  aBuild = r.data.build;
  const r2 = await A.post("/api/builds", { name: "Ann's second plan" });
  aBuild2 = r2.data.build;
  assert.equal((await A.get(`/api/builds/${aBuild.id}`)).status, 200);

  assert.equal((await B.get(`/api/builds/${aBuild.id}`)).status, 404);
  assert.equal((await B.put(`/api/builds/${aBuild.id}`, { version: aBuild.version, data: { items: [], areas: [] } })).status, 404);
  assert.equal((await B.post(`/api/builds/${aBuild.id}/submit`, { note: "x" })).status, 404);
  assert.equal((await B.post(`/api/builds/${aBuild.id}/duplicate`, {})).status, 404);
  assert.equal((await B.del(`/api/builds/${aBuild.id}`)).status, 404);
  const list = (await B.get("/api/builds")).data;
  assert.ok(!list.builds.some((b) => b.id === aBuild.id));
  assert.equal(list.shared.length, 0);
  const boot = (await B.get("/api/bootstrap")).data;
  assert.ok(!JSON.stringify(boot).includes(aBuild.id), "bootstrap must not leak other builds");
  assert.ok(!JSON.stringify(boot).includes("555-0101"), "bootstrap must not leak phone numbers");
  // still intact for Ann
  assert.equal((await A.get(`/api/builds/${aBuild.id}`)).data.build.name, "Ann's plan");
});

test("team members can't reach AJ's routes", async () => {
  for (const [m, p] of [["GET", "/api/admin/users"], ["GET", "/api/admin/builds"], ["GET", "/api/admin/grants"], ["POST", "/api/admin/grants"], ["GET", "/api/admin/audit"]]) {
    const r = await B.req(m, p, m === "POST" ? { viewerId: "x", ownerId: "y" } : undefined);
    assert.ok([403, 404].includes(r.status), `${m} ${p} -> ${r.status}`);
  }
  assert.equal((await B.get("/admin/", { Accept: "text/html" })).status, 404);
});

let grantId;

test("AJ can share all of Ann's builds with Ben, read-only", async () => {
  const ann = await userId("Ann"), ben = await userId("Ben");
  const g = await admin.post("/api/admin/grants", { viewerId: ben, ownerId: ann });
  assert.equal(g.status, 201);
  grantId = g.data.id;
  const r = await B.get(`/api/builds/${aBuild.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.build.canEdit, false);
  assert.equal((await B.get(`/api/builds/${aBuild2.id}`)).status, 200);
  assert.equal((await B.put(`/api/builds/${aBuild.id}`, { version: r.data.build.version, data: { items: [], areas: [] } })).status, 404, "shared builds stay read-only");
  assert.equal((await B.del(`/api/builds/${aBuild.id}`)).status, 404);
  const list = (await B.get("/api/builds")).data;
  assert.equal(list.shared.length, 2);
  // Cal still sees nothing
  assert.equal((await C.get(`/api/builds/${aBuild.id}`)).status, 404);
  assert.equal((await C.get("/api/builds")).data.shared.length, 0);
});

test("taking the share back works immediately", async () => {
  const r = await admin.del(`/api/admin/grants/${grantId}`);
  assert.equal(r.status, 200);
  assert.equal((await B.get(`/api/builds/${aBuild.id}`)).status, 404);
  assert.equal((await B.get(`/api/builds/${aBuild2.id}`)).status, 404);
  assert.equal((await B.get("/api/builds")).data.shared.length, 0);
  assert.equal((await admin.del(`/api/admin/grants/${grantId}`)).status, 404, "already off");
});

test("a one-build share covers only that build", async () => {
  const ann = await userId("Ann"), ben = await userId("Ben");
  const g = await admin.post("/api/admin/grants", { viewerId: ben, ownerId: ann, buildId: aBuild.id });
  assert.equal(g.status, 201);
  assert.equal((await B.get(`/api/builds/${aBuild.id}`)).status, 200);
  assert.equal((await B.get(`/api/builds/${aBuild2.id}`)).status, 404);
  // a build can't be shared under the wrong owner
  const cal = await userId("Cal");
  const bad = await admin.post("/api/admin/grants", { viewerId: ben, ownerId: cal, buildId: aBuild.id });
  assert.equal(bad.status, 400);
  await admin.del(`/api/admin/grants/${g.data.id}`);
  assert.equal((await B.get(`/api/builds/${aBuild.id}`)).status, 404);
});

test("saving uses version checks and strips unknown fields", async () => {
  const cur = (await A.get(`/api/builds/${aBuild.id}`)).data.build;
  const data = { ...cur.data, notes: "<img src=x onerror=alert(1)>", sneaky: true };
  data.items = [...cur.data.items, { id: "n1", type: "gondola", name: "New", x: 10, y: 10, w: 8, d: 3, h: 6, rot: 0, script: "x" }];
  const ok = await A.put(`/api/builds/${aBuild.id}`, { version: cur.version, data });
  assert.equal(ok.status, 200);
  const stale = await A.put(`/api/builds/${aBuild.id}`, { version: cur.version, data });
  assert.equal(stale.status, 409);
  const back = (await A.get(`/api/builds/${aBuild.id}`)).data.build;
  assert.equal(back.data.sneaky, undefined);
  assert.equal(back.data.items.find((i) => i.id === "n1").script, undefined);
  assert.equal(back.data.notes, "<img src=x onerror=alert(1)>", "stored as plain text; never rendered as HTML");
});

test("submitting notifies AJ's review list", async () => {
  const r = await A.post(`/api/builds/${aBuild.id}/submit`, { note: "Ready" });
  assert.equal(r.status, 200);
  const list = (await admin.get("/api/admin/builds")).data.builds;
  assert.equal(list.find((b) => b.id === aBuild.id).status, "submitted");
  const rv = await admin.post(`/api/admin/builds/${aBuild.id}/review`, { status: "needs_changes", note: "Move paint" });
  assert.equal(rv.status, 200);
  assert.equal((await A.get(`/api/builds/${aBuild.id}`)).data.build.reviewNote, "Move paint");
});

test("revoking a person signs them out everywhere and hides shares", async () => {
  const ann = await userId("Ann"), cal = await userId("Cal");
  await admin.post("/api/admin/grants", { viewerId: cal, ownerId: ann });
  assert.equal((await C.get(`/api/builds/${aBuild.id}`)).status, 200);
  const r = await admin.post(`/api/admin/users/${cal}/revoke`, {});
  assert.equal(r.status, 200);
  assert.equal((await C.get("/api/bootstrap")).status, 401);
  assert.equal((await C.get(`/api/builds/${aBuild.id}`)).status, 401);
  // restoring doesn't bring old sessions or shares back
  await admin.post(`/api/admin/users/${cal}/restore`, {});
  assert.equal((await C.get("/api/bootstrap")).status, 401);
  const grants = (await admin.get("/api/admin/grants")).data.grants.filter((g) => g.viewerId === cal && !g.revokedAt);
  assert.equal(grants.length, 0);
});

test("deleting a person removes their builds and shares", async () => {
  const ben = await userId("Ben");
  const b = await B.post("/api/builds", { name: "Ben's plan" });
  const id = b.data.build.id;
  assert.equal((await admin.del(`/api/admin/users/${ben}`)).status, 200);
  assert.equal((await admin.get("/api/admin/builds")).data.builds.some((x) => x.id === id), false);
  assert.equal((await B.get("/api/bootstrap")).status, 401);
});

test("signing out ends the session", async () => {
  assert.equal((await A.get("/api/bootstrap")).status, 200);
  const old = A.cookie;
  assert.equal((await A.post("/api/auth/logout", {})).status, 200);
  const replay = new Client(dev.base);
  replay.cookie = old;
  assert.equal((await replay.get("/api/bootstrap")).status, 401, "an old cookie must not work after logout");
});
