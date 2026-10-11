// Real-browser check (Chromium through Playwright) of signing up, signing in and resetting a password, the way a new
// team member and the admin do it. Optional like the other browser tests: it skips itself without Playwright. Run:
//   npm run test:browser
// With SHOTS=<folder> it also saves the screenshots the two PDF guides use (sign-in, profile, reset, dashboard).
//   1. a new person: the page opens on "Enter your code"; the code opens "Make your profile" (name, username, password,
//      no phone number); saving opens the map
//   2. next time: this browser opens on "Sign in", and the username and password open the map
//   3. the admin signs in through the same box, sees usernames, and makes a reset code (shown once, with Copy message)
//   4. the member uses the reset code: their username is filled in, they pick a new password, and the map opens;
//      the owner makes them an admin and takes it back; the profile menu has the guides (the admin guide for admins only)
//   5. no console errors, page errors or CSP violations anywhere
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { startDev, passwordFields, sqlStr } from "../helpers/devserver.mjs";
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
const DESK = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const ADMIN_PW = "admin password 1";

let dev, browser;
const problems = [];

before(async () => {
  if (SKIP) return;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  dev = await startDev({
    seed: ({ pepper }) => {
      const now = Date.now();
      const pw = passwordFields(pepper, ADMIN_PW);
      return [
        `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, username, password_hash, password_salt)
         VALUES ('u_admin', 'AJ', '', 'none:u_admin', '', '', 'admin', 'approved', 0, ${now}, ${now}, 'aj', ${sqlStr(pw.hash)}, ${sqlStr(pw.salt)});`,
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

async function context(device) {
  const ctx = await browser.newContext(device);
  await ctx.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSPV " + e.violatedDirective + " " + e.blockedURI)));
  ctx.on("page", (page) => {
    page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  });
  return ctx;
}
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, ...opts }); };
const visible = (page, sel) => page.locator(sel).isVisible();

test("sign up with a code, sign in next time, and reset a forgotten password", { skip: SKIP, timeout: 240000 }, async () => {
  // the admin signs in through the normal sign-in box and makes codes
  const adminCtx = await context(DESK);
  const ap = await adminCtx.newPage();
  await ap.goto(dev.base + "/login?admin=1");
  assert.ok(await visible(ap, "#sign-in"), "the admin link opens Sign in");
  assert.ok(await visible(ap, "#to-setup"), "with the admin setup link");
  await ap.fill("#username", "AJ");
  await ap.fill("#password", ADMIN_PW);
  await shot(ap, "a01-admin-login");
  await ap.click("#sign-in button[type=submit]");
  await ap.waitForURL(/\/admin\/$/);
  await ap.click("#new-set");
  await ap.waitForSelector("#codes-list .code-val");
  const code = (await ap.locator("#codes-list .code-val").first().textContent()).trim();
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  // 1. a new person on a phone: the code, then their profile
  const memberCtx = await context(PHONE);
  const mp = await memberCtx.newPage();
  await mp.goto(dev.base + "/login");
  assert.ok(await visible(mp, "#step-code"), "a browser that never signed in opens on the code");
  assert.equal(await mp.locator("input[type=tel], #phone").count(), 0, "no phone number field");
  await mp.fill("#code", code.toLowerCase());
  await shot(mp, "u01a-code");
  await mp.click("#step-code button[type=submit]");
  await mp.waitForSelector("#step-details:not([hidden])");
  await mp.fill("#name", "Dana Kim");
  await mp.fill("#new-username", "dana.k");
  await mp.fill("#new-password", "blue forklift 42");
  await mp.fill("#new-password2", "blue forklift 42");
  await shot(mp, "u01b-profile", { fullPage: true });
  await mp.fill("#new-password2", "blue forklift 24");
  await mp.click("#step-details button[type=submit]");
  assert.match(await mp.locator("#msg-details").textContent(), /don't match/);
  await mp.fill("#new-password2", "blue forklift 42");
  await mp.click("#step-details button[type=submit]");
  await mp.waitForURL(dev.base + "/");
  await mp.waitForFunction(() => window.__fbsMap && window.__fbsMap.session.layout.items.length > 0, null, { timeout: 60000 });

  // 2. next time (signed out): this browser opens on Sign in
  await memberCtx.clearCookies();
  await mp.goto(dev.base + "/login");
  assert.ok(await visible(mp, "#sign-in"), "a browser that signed in before opens on Sign in");
  await mp.fill("#username", "Dana.K");
  await mp.fill("#password", "blue forklift 42");
  await shot(mp, "u01c-signin");
  await mp.fill("#password", "wrong password here");
  await mp.click("#sign-in button[type=submit]");
  await mp.waitForSelector("#msg-signin:not([hidden])");
  assert.match(await mp.locator("#msg-signin").textContent(), /don't match/);
  await mp.fill("#password", "blue forklift 42");
  await mp.click("#sign-in button[type=submit]");
  await mp.waitForURL(dev.base + "/");

  // 3. the admin sees the username and makes a reset code
  await ap.reload();
  const row = ap.locator("#people-list .person", { hasText: "Dana Kim" });
  await row.waitFor();
  assert.match(await row.textContent(), /Username: dana\.k/);
  assert.doesNotMatch(await row.textContent(), /\(\d{3}\)|\d{3}-\d{4}/, "no phone number");
  await shot(ap, "a02-dashboard");
  await shot(ap, "a03-dashboard-full", { fullPage: true });
  await row.getByRole("button", { name: /reset code/i }).click();
  await ap.waitForSelector("#reset-dlg[open]");
  const reset = (await ap.locator("#reset-code").textContent()).trim();
  assert.match(reset, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(await ap.locator("#reset-text").textContent(), /works once/);
  await shot(ap, "a10-reset-code");
  await ap.click("#reset-done");
  await ap.waitForFunction(() => !document.getElementById("reset-dlg").open && document.getElementById("reset-code").textContent === ""); // cleared once closed

  // 4. the member forgot the password: the reset code, a new password, the map
  await memberCtx.clearCookies();
  await mp.goto(dev.base + "/login");
  await mp.click("#to-code");
  await mp.fill("#code", reset);
  await mp.click("#step-code button[type=submit]");
  await mp.waitForSelector("#step-reset:not([hidden])");
  assert.equal(await mp.inputValue("#reset-username"), "dana.k", "their username is filled in");
  assert.match(await mp.locator("#reset-name").textContent(), /Dana Kim/);
  await mp.fill("#reset-password", "green pallet jack 7");
  await mp.fill("#reset-password2", "green pallet jack 7");
  await shot(mp, "u01d-reset", { fullPage: true });
  await mp.click("#step-reset button[type=submit]");
  await mp.waitForURL(dev.base + "/");

  // the owner makes Dana a second admin, then takes it back
  await ap.reload();
  const dana = ap.locator("#people-list .person", { hasText: "Dana Kim" });
  await dana.getByRole("button", { name: "Make Dana Kim an admin" }).click();
  await ap.waitForSelector("#confirm[open]");
  assert.match(await ap.locator("#confirm-text").textContent(), /same powers as you/);
  await ap.click("#confirm-ok");
  await ap.locator("#people-list .person", { hasText: "Dana Kim" }).locator(".person-tag").waitFor();
  await ap.locator("#people-sec, section[aria-labelledby=people-title]").first().screenshot(SHOTS ? { path: `${SHOTS}/a12-admins.png` } : undefined);
  await ap.locator("#people-list .person", { hasText: "Dana Kim" }).getByRole("button", { name: /admin powers/ }).click();
  await ap.click("#confirm-ok");
  await ap.waitForFunction(() => ![...document.querySelectorAll("#people-list .person")].some((li) => li.textContent.includes("Dana Kim") && li.querySelector(".person-tag")));

  // the old password no longer works; the new one does
  const other = await (await context(DESK)).newPage();
  await other.goto(dev.base + "/login");
  await other.click("#to-signin");
  await other.fill("#username", "dana.k");
  await other.fill("#password", "blue forklift 42");
  await other.click("#sign-in button[type=submit]");
  await other.waitForSelector("#msg-signin:not([hidden])");
  await other.fill("#password", "green pallet jack 7");
  await other.click("#sign-in button[type=submit]");
  await other.waitForURL(dev.base + "/");
  // the profile menu has the planning guide and the Nerdy Documents for everyone, the admin guide only for admins
  await other.waitForFunction(() => window.__fbsMap && window.__fbsMap.session.layout.items.length > 0, null, { timeout: 60000 });
  await other.waitForSelector("#acct:not([hidden])");
  await other.click("#acctBtn");
  assert.ok(await visible(other, "#acctGuide"));
  assert.ok(await visible(other, "#acctNerdy"));
  assert.ok(!(await visible(other, "#acctAdminGuide")), "no admin guide for a member");
  await shot(other, "u18-profile-menu");
  for (const href of ["/guides/FBS-Store-Map-Planning-Guide.pdf", "/guides/FBS-Store-Map-Nerdy-Documents.pdf"]) {
    assert.equal(await other.evaluate(async (u) => (await fetch(u)).status, href), 200, href);
  }
  assert.equal(await other.evaluate(async () => (await fetch("/admin/guide/FBS-Store-Map-Admin-Guide.pdf")).status), 404);

  // the two wrong passwords on purpose answer 400 and the admin guide check 404; anything else is a problem
  assert.deepEqual(problems.filter((p) => !/status of 40[014] /.test(p)), []);
});
