// Real-browser check (Chromium through Playwright) of the sales floor's soffit, high openings, soffit windows and the
// FBS bucket ledge (owner photos, 12 Oct) on the master map. Optional like the other browser tests: it skips itself
// without Playwright. Run: npm run test:browser   (SHOTS=<folder> also saves walk-view pictures)
//   1. the plan draws (high windows are dashed lines, never picked as fixtures)
//   2. the 3D view builds: the bucket row on the ledge, a lit room behind the openings, no clerestory panels
//   3. the walk view looks at the openings and the soffit windows
//   4. no console errors, page errors or CSP violations anywhere
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { startDev, sha256Hex, sqlStr } from "../helpers/devserver.mjs";
import { Client } from "../helpers/client.mjs";
import { masterSeedSql } from "../../scripts/seed-master.mjs";

let chromium = null;
try {
  chromium = createRequire(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() + "/")("playwright").chromium;
} catch {
  /* no Playwright: the test below skips */
}
const SKIP = chromium ? false : "Playwright (with Chromium) isn't installed globally; these browser tests are optional";
const SHOTS = process.env.SHOTS || "";
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const DAY = 86400000;
const TOKEN = crypto.randomBytes(32).toString("base64url");

let dev, browser;
const problems = [];

before(async () => {
  if (SKIP) return;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  dev = await startDev({
    seed: () => {
      const now = Date.now();
      return [
        `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, username)
         VALUES ('u_dana', 'Dana', '', 'none:u_dana', '', '', 'member', 'approved', 0, ${now}, ${now}, 'dana');`,
        `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, absolute_expires_at, user_agent)
         VALUES (${sqlStr(sha256Hex(TOKEN))}, 'u_dana', ${now}, ${now}, ${now + 30 * DAY}, ${now + 90 * DAY}, 'test');`,
        masterSeedSql({ now }).sql,
      ].join("\n");
    },
  });
  browser = await chromium.launch({ args: ARGS });
});
after(async () => {
  if (browser) await browser.close();
  if (dev) await dev.stop();
});

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

test("the soffit, the openings over the arches, the soffit windows and the bucket ledge build in 3D", { skip: SKIP, timeout: 240000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addCookies([{ name: "__Host-fbs_s", value: TOKEN, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Strict", expires: Math.floor(Date.now() / 1000) + 86400 }]);
  await ctx.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSPV " + e.violatedDirective + " " + e.blockedURI)));
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  await page.goto(dev.base + "/#plan");
  await page.waitForFunction(() => window.__fbsMap && window.__fbsMap.session.layout.items.length > 0, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__fbsMap.session.layout.items.filter((i) => i.type === "window").length), 5);

  // 1. a tap on an opening's line in the plan picks the arch wall or nothing, never the window
  const p = await page.evaluate(() => { const [sx, sy] = window.__fbsMap.plan.toScreen(103, 35.2); const r = document.getElementById("planCanvas").getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy }; });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  assert.ok(!(await page.evaluate(() => window.__fbsMap.session.selected().map((i) => i.type))).includes("window"));

  // 2. 3D: the bucket row, the rooms behind the openings and the soffit windows, no clerestory panels
  await page.evaluate(() => window.__fbsMap.setView("3d"));
  await page.waitForFunction(() => { const R = window.__fbsMap.R; return R && R.scene.getObjectByName("structure"); }, null, { timeout: 60000 });
  const got = await page.evaluate(() => {
    const S = window.__fbsMap.R.scene.getObjectByName("structure");
    let buckets = 0, rooms = 0;
    S.traverse((o) => { if (o.isInstancedMesh && o.geometry.type === "CylinderGeometry") buckets += o.count; if (o.isMesh && Array.isArray(o.material) && o.material.length === 6) rooms++; });
    return { buckets, rooms };
  });
  assert.ok(got.buckets >= 20, `a row of FBS buckets on the ledge: ${got.buckets}`);
  assert.equal(got.rooms, 2, "one office room behind the three openings, one space behind the two soffit windows");

  // 3. walk view: the openings over the arches, then the soffit windows
  await page.evaluate(() => window.__fbsMap.setView("walk"));
  for (const [name, x, y, yaw, look] of [["walk-openings", 82, 38, -Math.PI / 2, 0.36], ["walk-soffit", 88.5, 34, Math.PI, 0.42], ["walk-ledge", 90.3, 47, -0.3, 0.3]]) {
    await page.evaluate(([x, y, yaw, look]) => { const W = window.__fbsMap.walk; Object.assign(W.ME, { x, y, yaw, heading: yaw, look, path: [], target: null }); W.S.moved = true; window.__fbsMap.R.requestRender(); }, [x, y, yaw, look]);
    await page.waitForTimeout(1200);
    await shot(page, name);
  }
  assert.deepEqual(problems, []);
});
