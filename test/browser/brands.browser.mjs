// Real-browser check (Chromium through Playwright) of brand sections (core/brands.js). Optional like the other browser
// tests: it skips itself without Playwright. Run: npm run test:browser
// With SHOTS=<folder> it also saves the pictures the Planning guide uses (the brand picker, the plan and the 3D view).
//   1. Place on Power Tools opens "Which brand is this section?"; Cancel places nothing
//   2. picking DeWalt arms the placing ("Power Tools · DeWalt"); a tap on the floor places a DeWalt section at
//      DeWalt's share of the target (30% of 700 sq ft)
//   3. the panel shows its brand and can change it; the plan label says the brand
//   4. Simpson Strong-Tie places straight away (it is Simpson's department)
//   5. the 3D view builds a brand zone (tiles, light, sign) for each section, and the logos load
//   6. no console errors, page errors or CSP violations anywhere
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

const at = (page, x, y) => page.evaluate(([x, y]) => { const [sx, sy] = window.__fbsMap.plan.toScreen(x, y); const r = document.getElementById("planCanvas").getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy }; }, [x, y]);
const areas = (page) => page.evaluate(() => window.__fbsMap.session.doc.items.filter((i) => i.type === "area").map((i) => ({ id: i.id, cat: i.cat, brand: i.brand || null, sqft: Math.round(i.w * i.d) })));
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, ...opts }); };

test("Power Tools: pick the brand, place the section, change it; Simpson places straight away; 3D builds the zones", { skip: SKIP, timeout: 240000 }, async () => {
  const api = new Client(dev.base, { ip: "10.88.0.21" });
  api.cookie = `__Host-fbs_s=${TOKEN}`;
  const made = await api.post("/api/maps", { name: "Brand sections", from: "blank" });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "__Host-fbs_s", value: TOKEN, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Strict", expires: Math.floor(Date.now() / 1000) + 86400 }]);
  await ctx.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSPV " + e.violatedDirective + " " + e.blockedURI)));
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  await page.goto(dev.base + `/#plan&map=${made.data.meta.id}`);
  await page.waitForFunction(() => window.__fbsMap && window.__fbsMap.session.layout.items.length > 0, null, { timeout: 60000 });
  await page.click("#mode-planning");
  await page.waitForTimeout(400);

  // 1. Place on Power Tools asks for the brand; Cancel places nothing and arms nothing
  const row = page.locator("#palette .pal-row", { hasText: "Power Tools" });
  await row.locator(".pal-main").click();
  await page.waitForSelector("dialog.brand-dlg[open]");
  assert.deepEqual(await page.locator("dialog.brand-dlg .brand-pick-name").allTextContents(), ["Milwaukee", "DeWalt", "Makita"]);
  // the logos load (same-origin files)
  await page.waitForFunction(() => [...document.querySelectorAll("dialog.brand-dlg img")].every((i) => i.complete && i.naturalWidth > 0));
  await shot(page, "u19-brand-picker");
  await page.locator("dialog.brand-dlg").getByRole("button", { name: "Cancel" }).click();
  assert.equal(await page.evaluate(() => window.__fbsMap.state.placing), null);
  assert.deepEqual(await areas(page), []);

  // 2. DeWalt, then a tap on the open sales floor
  await row.locator(".pal-main").click();
  await page.waitForSelector("dialog.brand-dlg[open]");
  await page.locator("dialog.brand-dlg .brand-pick", { hasText: "DeWalt" }).click();
  await page.waitForFunction(() => window.__fbsMap.state.placing && window.__fbsMap.state.placing.brand === "dewalt");
  assert.match(await page.locator("#placeChip").textContent(), /Power Tools · DeWalt/);
  let p = await at(page, 80, 48);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.__fbsMap.session.doc.items.some((i) => i.type === "area"));
  let list = await areas(page);
  assert.equal(list.length, 1);
  assert.equal(list[0].cat, "power_tools");
  assert.equal(list[0].brand, "dewalt");
  assert.ok(Math.abs(list[0].sqft - 210) <= 20, `DeWalt's 30% of 700 sq ft: ${list[0].sqft}`);

  // 3. the panel: its brand, and a change of brand
  const brandSel = page.locator("#inspector select[data-field=brand]");
  await brandSel.waitFor();
  assert.equal(await brandSel.inputValue(), "dewalt");
  assert.match(await page.locator("#inspector .area-target").textContent(), /DeWalt's 30% of Power Tools/);
  await brandSel.selectOption("makita");
  await page.waitForFunction(() => window.__fbsMap.session.doc.items.find((i) => i.type === "area").brand === "makita");
  await brandSel.selectOption("dewalt");

  // a Milwaukee and a Makita section beside it, through the same picker
  for (const [brand, label, x] of [["milwaukee", "Milwaukee", 62], ["makita", "Makita", 96]]) {
    await row.locator(".pal-main").click();
    await page.waitForSelector("dialog.brand-dlg[open]");
    await page.locator("dialog.brand-dlg .brand-pick", { hasText: label }).click();
    await page.waitForFunction((b) => window.__fbsMap.state.placing && window.__fbsMap.state.placing.brand === b, brand);
    p = await at(page, x, 48);
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction((b) => window.__fbsMap.session.doc.items.some((i) => i.type === "area" && i.brand === b), brand);
  }

  // 4. Simpson Strong-Tie: no question, it is Simpson's department
  await page.locator("#palette .pal-row", { hasText: "Simpson Strong-Tie" }).locator(".pal-main").click();
  assert.equal(await page.locator("dialog.brand-dlg[open]").count(), 0, "no brand question for Simpson");
  p = await at(page, 75, 66);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.__fbsMap.session.doc.items.some((i) => i.type === "area" && i.cat === "simpson_strongtie"));
  list = await areas(page);
  assert.deepEqual(list.map((a) => [a.cat, a.brand]).sort(), [["power_tools", "dewalt"], ["power_tools", "makita"], ["power_tools", "milwaukee"], ["simpson_strongtie", null]]);
  await page.evaluate(() => window.__fbsMap.session.clearSelection());
  await page.waitForTimeout(300);
  await shot(page, "u20-brand-plan");

  // 5. 3D: one zone per section (tiles, light, sign), signs drawn once the logos load
  await page.evaluate(() => window.__fbsMap.setView("3d"));
  await page.waitForFunction(() => { const R = window.__fbsMap.R; const g = R && R.scene.getObjectByName("brand-zones"); return g && g.children.length === 4; }, null, { timeout: 60000 });
  const parts = await page.evaluate(() => {
    const g = window.__fbsMap.R.scene.getObjectByName("brand-zones");
    return g.children.map((z) => ({ lights: z.children.filter((c) => c.isLight).length, meshes: z.children.filter((c) => c.isMesh).length, groups: z.children.filter((c) => c.isGroup).length }));
  });
  for (const z of parts) {
    assert.equal(z.lights, 1, JSON.stringify(z));
    assert.ok(z.meshes >= 5, `tiles + 4 cove bars: ${JSON.stringify(z)}`);
    assert.equal(z.groups, 1, "the sign");
  }
  await page.waitForTimeout(2500);
  await shot(page, "u21-brand-3d");

  assert.deepEqual(problems, []);
});
