// Real-browser checks (Chromium through Playwright) for the touch, focus and keyboard work of round 4. They need Playwright with
// Chromium installed globally (`npm i -g playwright`, then `npx playwright install chromium`), which is NOT a dependency of the
// site, so `npm test` does not run them; they skip themselves when Playwright can't be found. Run:  npm run test:browser
// Each test drives the real page against a local Worker (wrangler dev, fresh database seeded like production) as a signed-in
// team member (a seeded session, injected as the cookie), with real mouse, keyboard and touch input:
//   1. a phone: Add > any of the 7 fixtures, in Plan and in 3D, at 390x844 and 375x667, never scrolls the stage
//   2. the stage cannot be scrolled by script at all (overflow:clip), whatever calls focus() or scrollIntoView()
//   3. inspector fields: change one, click or Tab to the next: focus lands there and typing goes into it (mouse and touch); a
//      Backspace after it never deletes the object; a button clicked right after an edit still works
//   4. Delete only removes the selection with the plan focused
//   5. placing departments from the list: pick one, draw it on the floor (that rectangle) or tap the floor (usual size there); Esc / Cancel
//      places nothing; on a phone with the sheet, and on a desktop
//   6. a department block under a fixture is grabbed by pressing it
//   7. an Undo toast never writes into another map
//   8. no console errors, page errors or CSP violations anywhere
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { startDev, hmacHex, sha256Hex, aesEncrypt, sqlStr } from "../helpers/devserver.mjs";
import { Client } from "../helpers/client.mjs";
import { masterSeedSql } from "../../scripts/seed-master.mjs";

let chromium = null;
try {
  chromium = createRequire(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() + "/")("playwright").chromium;
} catch {
  /* no Playwright: the tests below skip */
}
const SKIP = chromium ? false : "Playwright (with Chromium) isn't installed globally; these browser tests are optional";

const DAY = 86400000;
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mozilla/5.0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA };
const PHONE_SE = { ...PHONE, viewport: { width: 375, height: 667 } };
const DESK = { viewport: { width: 1366, height: 800 } };
const PEOPLE = {
  a: { id: "u_dana", name: "Dana", role: "member", phone: "+12085550301" },
  b: { id: "u_sam", name: "Sam", role: "member", phone: "+12085550302" },
};
for (const p of Object.values(PEOPLE)) p.token = crypto.randomBytes(32).toString("base64url");

let dev, browser, A;
const problems = []; // console errors, page errors, CSP violations, off-site requests
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  if (SKIP) return;
  dev = await startDev({
    seed: ({ pepper, phoneKey }) => {
      const now = Date.now();
      const rows = [];
      for (const p of Object.values(PEOPLE)) {
        rows.push(
          `INSERT INTO users (id, first_name, work_area, phone_hash, phone_enc, phone_last4, role, status, needs_code, created_at, updated_at, username)
           VALUES (${sqlStr(p.id)}, ${sqlStr(p.name)}, '', ${sqlStr(hmacHex(pepper, "phone:" + p.phone))}, ${sqlStr(aesEncrypt(phoneKey, p.phone))},
                   ${sqlStr(p.phone.slice(-4))}, ${sqlStr(p.role)}, 'approved', 0, ${now}, ${now}, NULL);`,
          `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, absolute_expires_at, user_agent)
           VALUES (${sqlStr(sha256Hex(p.token))}, ${sqlStr(p.id)}, ${now}, ${now}, ${now + 30 * DAY}, ${now + 90 * DAY}, 'test');`
        );
      }
      rows.push(masterSeedSql({ now }).sql);
      return rows.join("\n");
    },
  });
  A = new Client(dev.base, { ip: "10.88.0.1" });
  A.cookie = `__Host-fbs_s=${PEOPLE.a.token}`;
  browser = await chromium.launch({ args: ARGS });
});
after(async () => {
  if (browser) await browser.close();
  if (dev) await dev.stop();
});

async function newMap(name, from = "master") {
  const r = await A.post("/api/maps", { name, from });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.meta.id;
}
/** A signed-in page (a seeded session as the cookie) that records anything the console or the network complains about. */
async function open(device, hash) {
  const ctx = await browser.newContext(device);
  await ctx.addCookies([{ name: "__Host-fbs_s", value: PEOPLE.a.token, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Strict", expires: Math.floor(Date.now() / 1000) + 86400 }]);
  await ctx.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSPV " + e.violatedDirective + " " + e.blockedURI)));
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith("data:") && !u.startsWith("blob:") && !u.startsWith(dev.base)) problems.push(`off-site request: ${u}`); });
  await page.goto(dev.base + "/" + hash);
  await page.waitForFunction(() => window.__fbsMap && window.__fbsMap.session.layout.items.length > 0, null, { timeout: 60000 });
  await sleep(500);
  return { ctx, page };
}
const stageTop = (page) => page.evaluate(() => ({ stage: document.getElementById("stage").scrollTop, main: document.getElementById("stageMain").scrollTop }));
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? a.id || a.tagName : null; });
const blocks = (page) => page.evaluate(() => window.__fbsMap.session.layout.items.filter((i) => i.type === "area").map((i) => ({ cat: i.cat, x: i.x, y: i.y, w: i.w, d: i.d })));
const count = (page) => page.evaluate(() => window.__fbsMap.session.layout.items.length);

const FIXTURES = ["gondola", "wallunit", "rack", "counter", "table", "display", "tower"];

for (const [label, device] of [["390x844", PHONE], ["375x667", PHONE_SE]]) {
  for (const view of ["plan", "3d"]) {
    test(`phone ${label} ${view}: Add > each of the 7 fixtures never scrolls the stage or raises the keyboard`, { skip: SKIP, timeout: 240000 }, async () => {
      const id = await newMap(`Add ${label} ${view}`);
      const { ctx, page } = await open(device, `#${view}&map=${id}`);
      try {
        for (const type of FIXTURES) {
          const n = await count(page);
          await page.locator("#addBtn").tap();
          await sleep(250);
          await page.locator(`.add-row[data-type="${type}"]`).tap();
          await sleep(800);
          assert.equal(await count(page), n + 1, `${type} was added`);
          const top = await stageTop(page);
          assert.deepEqual(top, { stage: 0, main: 0 }, `${type}: the stage scrolled`);
          const a = await active(page);
          assert.ok(!/^(f-|INPUT|TEXTAREA|SELECT)/.test(a), `${type}: a field took focus (${a}), which raises the on-screen keyboard`);
          if (view === "plan") {
            const t = await page.evaluate(() => document.getElementById("planCanvas").getBoundingClientRect().top);
            assert.ok(t > 100 && t < 140, `${type}: the plan moved (top ${t})`);
          }
          await page.locator("#btnUndo").tap(); // take it away again for the next one
          await sleep(400);
        }
      } finally {
        await ctx.close();
      }
    });
  }
}

test("the stage can't be scrolled by script: scrollTop, scrollIntoView() and a plain focus() on a sheet that is off screen", { skip: SKIP }, async () => {
  const id = await newMap("Stage guard");
  const { ctx, page } = await open(PHONE, `#plan&map=${id}`);
  try {
    const r = await page.evaluate(() => {
      const stage = document.getElementById("stage");
      stage.scrollTop = 300; stage.scrollLeft = 50;
      document.getElementById("stageMain").scrollTop = 200;
      const inspector = document.getElementById("inspector");
      inspector.scrollIntoView(); // a sheet that is closed (below the screen)
      const input = document.createElement("input"); inspector.appendChild(input); input.focus(); input.remove();
      return { stage: stage.scrollTop, left: stage.scrollLeft, main: document.getElementById("stageMain").scrollTop, overflow: getComputedStyle(stage).overflow };
    });
    assert.equal(r.stage, 0); assert.equal(r.left, 0); assert.equal(r.main, 0);
    assert.match(r.overflow, /clip/);
  } finally {
    await ctx.close();
  }
});

test("desktop inspector: change a field, click or Tab to the next: focus lands there, typing stays in it, Backspace never deletes", { skip: SKIP, timeout: 240000 }, async () => {
  const id = await newMap("Desktop fields");
  const { ctx, page } = await open(DESK, `#plan&map=${id}`);
  try {
    const g = await page.evaluate(() => { const it = window.__fbsMap.session.layout.items.find((i) => i.type === "gondola"); window.__fbsMap.session.select(it.id); return it.id; });
    await sleep(300);
    const item = () => page.evaluate((i) => { const it = window.__fbsMap.session.layout.items.find((x) => x.id === i); return it && { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot || 0, name: it.name }; }, g);
    const mode = () => page.evaluate(() => window.__fbsMap.state.mode);
    const n0 = await count(page);
    // X then a click on Y
    await page.click("#f-x"); await page.keyboard.press("Control+a"); await page.keyboard.type("70");
    await page.click("#f-y");
    assert.equal(await active(page), "f-y", "the click on Y landed");
    await page.keyboard.press("Control+a"); await page.keyboard.type("40");
    assert.equal(await mode(), "planning", "typing 40 switched the mode (key 4)");
    await page.keyboard.press("Enter");
    let it = await item();
    assert.ok(Math.abs(it.x - 70) < 0.01 && Math.abs(it.y - 40) < 0.01, JSON.stringify(it));
    // X then Tab
    await page.click("#f-x"); await page.keyboard.press("Control+a"); await page.keyboard.type("75");
    await page.keyboard.press("Tab");
    assert.equal(await active(page), "f-y", "Tab moved focus to the page");
    await page.keyboard.type("45");
    assert.equal(await mode(), "planning"); assert.equal(await active(page), "f-y");
    await page.keyboard.press("Tab");
    it = await item();
    assert.ok(Math.abs(it.x - 75) < 0.01 && Math.abs(it.y - 45) < 0.01, JSON.stringify(it));
    // Name, then a click on Height, then Backspace: the object stays
    await page.click("#f-name"); await page.keyboard.press("Control+a"); await page.keyboard.type("Renamed gondola");
    await page.click("#f-h");
    assert.equal(await active(page), "f-h");
    await page.keyboard.press("Backspace");
    assert.equal(await count(page), n0, "Backspace deleted the object");
    await page.keyboard.type("5"); await page.keyboard.press("Enter");
    it = await item();
    assert.equal(it.name, "Renamed gondola"); assert.ok(Math.abs(it.h - 5) < 0.01);
    // a button clicked right after an edit still gets its click
    await page.click("#f-w"); await page.keyboard.press("Control+a"); await page.keyboard.type("12");
    const rot0 = (await item()).rot;
    await page.click('.insp-actions button:has-text("Rotate 90")');
    it = await item();
    assert.ok(Math.abs(((it.rot - rot0 + 360) % 360) - 90) < 0.01, "the Rotate click was swallowed");
    assert.ok(Math.abs(it.w - 12) < 0.01);
    // the checks of a block are patched in place, not left stale
    // page focus right after a commit: no shortcut
    await page.click("#f-x"); await page.keyboard.press("Control+a"); await page.keyboard.type("60");
    await page.click(".insp-foot");
    await page.keyboard.press("Delete"); await page.keyboard.press("Backspace"); await page.keyboard.press("4");
    await sleep(100);
    assert.equal(await count(page), n0, "Delete / Backspace on the bare page deleted the object");
    assert.equal(await mode(), "planning", "a digit on the bare page right after an edit switched the mode");
    // with the plan itself focused, Delete still removes the selection
    const pos = await page.evaluate((i) => { const o = window.__fbsMap.session.layout.items.find((x) => x.id === i); const [sx, sy] = window.__fbsMap.plan.toScreen(o.x, o.y); const r = document.getElementById("planCanvas").getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy }; }, g);
    await page.mouse.click(pos.x, pos.y);
    await page.keyboard.press("Delete");
    assert.equal(await count(page), n0 - 1, "Delete with the plan focused should remove the selected item");
  } finally {
    await ctx.close();
  }
});

test("desktop inspector: even a commit that changes the panel's structure leaves focus on the field that was clicked or Tabbed to", { skip: SKIP, timeout: 240000 }, async () => {
  const id = await newMap("Desktop settle");
  const { ctx, page } = await open(DESK, `#plan&map=${id}`);
  try {
    await page.evaluate(() => { const M = window.__fbsMap; M.session.select(M.session.layout.items.find((i) => i.type === "gondola").id); });
    await sleep(500);
    // the commit of X itself flips the Structure lock, which rebuilds the panel (it changes which controls exist)
    await page.evaluate(() => document.getElementById("f-x").addEventListener("change", () => window.__fbsMap.session.setUnlocked(!window.__fbsMap.session.unlocked)));
    await page.click("#f-x"); await page.keyboard.press("Control+a"); await page.keyboard.type("61");
    await page.click("#f-y");
    await sleep(300);
    assert.equal(await active(page), "f-y");
    await page.keyboard.type("33"); await page.keyboard.press("Enter");
    const it = await page.evaluate(() => { const M = window.__fbsMap, s = M.session.single; return { x: s.x, y: s.y, mode: M.state.mode }; });
    assert.ok(Math.abs(it.x - 61) < 0.01 && Math.abs(it.y - 33) < 0.01 && it.mode === "planning", JSON.stringify(it));
    // a department's target (its first edit stores an override, which must not look like a structural change)
    await page.evaluate(() => { const M = window.__fbsMap; M.placeDepartment("pneumatic_air"); });
    await sleep(600);
    await page.click("#f-target"); await page.keyboard.press("Control+a"); await page.keyboard.type("400");
    await page.keyboard.press("Tab");
    assert.equal(await active(page), "f-status", "Tab out of the target field dropped focus");
    assert.match(await page.textContent(".area-target"), /Target 400 sq ft/);
  } finally {
    await ctx.close();
  }
});

test("phone inspector: tap X, type, tap Y, tap Name, tap Height, Backspace: focus follows the taps and nothing is deleted", { skip: SKIP, timeout: 240000 }, async () => {
  const id = await newMap("Phone fields");
  const { ctx, page } = await open(PHONE, `#plan&map=${id}`);
  try {
    const g = await page.evaluate(() => { const it = window.__fbsMap.session.layout.items.filter((i) => i.type === "gondola")[2]; window.__fbsMap.session.select(it.id); return it.id; });
    await sleep(700);
    await page.locator("#inspector .sheet-grab").tap(); await sleep(500);
    const n0 = await count(page);
    await page.locator("#f-x").tap(); await page.keyboard.press("Control+a"); await page.keyboard.type("70");
    await page.locator("#f-y").tap();
    assert.equal(await active(page), "f-y");
    await page.keyboard.type("40");
    assert.equal(await page.evaluate(() => window.__fbsMap.state.mode), "planning");
    await page.locator("#f-name").tap(); await page.keyboard.press("Control+a"); await page.keyboard.type("Phone renamed");
    await page.locator("#f-h").tap();
    assert.equal(await active(page), "f-h");
    await page.keyboard.press("Backspace");
    assert.equal(await count(page), n0, "Backspace deleted the object");
    await page.keyboard.press("Enter");
    const it = await page.evaluate((i) => { const o = window.__fbsMap.session.layout.items.find((x) => x.id === i); return { x: o.x, y: o.y, name: o.name }; }, g);
    assert.ok(Math.abs(it.x - 70) < 0.01 && Math.abs(it.y - 40) < 0.01 && it.name === "Phone renamed", JSON.stringify(it));
    assert.deepEqual(await stageTop(page), { stage: 0, main: 0 });
  } finally {
    await ctx.close();
  }
});

/** Screen point (page coordinates) of a store point, for real mouse / touch input on the plan. */
const at = (page, x, y) => page.evaluate(([x, y]) => { const m = window.__fbsMap; const [sx, sy] = m.plan.toScreen(x, y); const r = document.getElementById("planCanvas").getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy }; }, [x, y]);
/** One finger (or the mouse) pressed at a, dragged to b in steps, lifted. */
async function drag(page, phone, a, b, steps = 8) {
  if (!phone) {
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await sleep(20); }
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }] }); await sleep(20); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

for (const [label, device] of [["desktop 1366x800", DESK], ["phone 390x844", PHONE], ["phone 375x667", PHONE_SE]]) {
  test(`placing a department (${label}): tap it in the list, draw on the floor = that rectangle; a tap on the floor = the usual size there; Esc / Cancel never places`, { skip: SKIP, timeout: 240000 }, async () => {
    const id = await newMap(`Place ${label}`, "blank");
    const { ctx, page } = await open(device, `#plan&map=${id}`);
    try {
      const phone = !!device.isMobile;
      const pick = async () => {
        if (phone) { await page.locator("#deptBtn").tap(); await sleep(700); }
        const row = page.locator(".pal-row:not(.muted) .pal-main:has(.pal-place)").first();
        const name = await row.locator("b").textContent();
        if (phone) await row.tap(); else await row.click();
        await sleep(500);
        return name;
      };
      // 1. pick, then draw a 20 x 12 ft rectangle on the open floor (store points 55,24 to 75,36)
      const first = await pick();
      assert.equal(await page.locator("#placeChip").isHidden(), false, "the chip over the plan says what to do");
      assert.match(await page.locator("#placeChip").textContent(), new RegExp(first.trim().slice(0, 8)));
      assert.equal(await page.locator("#palette.open").count(), 0, "a phone's Departments sheet closes so the floor is in reach (no sheet on a desktop)");
      assert.equal(await page.locator("#catsEmpty").isHidden(), true, "the empty-state card steps aside");
      await drag(page, phone, await at(page, 55, 24), await at(page, 75, 36));
      await sleep(600);
      let bs = await blocks(page);
      assert.equal(bs.length, 1);
      assert.deepEqual([bs[0].x, bs[0].y, bs[0].w, bs[0].d], [65, 30, 20, 12], "the block is the drawn rectangle, on the 6-inch grid");
      assert.equal(await page.locator("#placeChip").isHidden(), true, "placing is over once the block is down");
      assert.equal(await page.evaluate(() => window.__fbsMap.session.single && window.__fbsMap.session.single.type), "area", "the new block is selected");
      // 2. pick the next one, then a plain tap on the floor: its usual size, centred there
      const second = await pick();
      assert.notEqual(second, first);
      const p = await at(page, 120, 30);
      if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      await sleep(600);
      bs = await blocks(page);
      assert.equal(bs.length, 2);
      const b = bs[1];
      assert.ok(Math.abs(b.x - 120) <= 0.5 && Math.abs(b.y - 30) <= 0.5, `centred on the tap: ${b.x},${b.y}`);
      assert.ok(b.w * b.d >= 100, "the usual (catalog) size");
      // 3. pick, then Esc (desktop) or the chip's Cancel (phone): nothing is placed, the chip is gone
      await pick();
      if (phone) await page.locator("#placeChip button").tap(); else await page.keyboard.press("Escape");
      await sleep(400);
      assert.equal(await page.locator("#placeChip").isHidden(), true);
      assert.equal((await blocks(page)).length, 2, "cancel placed nothing");
      // 4. after cancelling, a drag on the floor is a plain pan/marquee again, not a block
      await drag(page, phone, await at(page, 30, 60), await at(page, 40, 70));
      await sleep(400);
      assert.equal((await blocks(page)).length, 2);
      for (const x of await blocks(page)) assert.ok(x.x - x.w / 2 >= -0.01 && x.x + x.w / 2 <= 169.01 && x.y - x.d / 2 >= -0.01 && x.y + x.d / 2 <= 80.01, `${x.cat} at ${x.x},${x.y} is outside the store`);
      assert.deepEqual(await stageTop(page), { stage: 0, main: 0 });
    } finally {
      await ctx.close();
    }
  });
}

test("a department placed from the finder while in 3D goes inside the store, beside the others", { skip: SKIP, timeout: 240000 }, async () => {
  const id = await newMap("Place 3D", "blank");
  const { ctx, page } = await open(PHONE, `#3d&map=${id}`);
  try {
    await sleep(1500);
    for (const k of ["hand_tools", "power_tools", "paint_finishing", "woodworking"]) { await page.evaluate((key) => window.__fbsMap.placeDepartment(key), k); await sleep(300); }
    const bs = await blocks(page);
    assert.equal(bs.length, 4);
    for (const b of bs) assert.ok(b.x - b.w / 2 >= -0.01 && b.x + b.w / 2 <= 169.01 && b.y - b.d / 2 >= -0.01 && b.y + b.d / 2 <= 80.01, `${b.cat} is outside the store`);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) assert.ok(Math.abs(bs[i].x - bs[j].x) >= 0.5 || Math.abs(bs[i].y - bs[j].y) >= 0.5, "two blocks on one spot");
  } finally {
    await ctx.close();
  }
});

test("a selected department block under a fixture is grabbed by pressing it; a plain click still picks the fixture on top", { skip: SKIP, timeout: 240000 }, async () => {
  const id = await newMap("Grab block");
  const { ctx, page } = await open(DESK, `#plan&map=${id}`);
  try {
    const info = await page.evaluate(() => {
      const M = window.__fbsMap, s = M.session;
      const g = s.layout.items.find((i) => i.type === "gondola" && i.w >= 8);
      M.placeDepartment("woodworking", { x: g.x, y: g.y });
      const b = s.layout.items.filter((i) => i.type === "area").pop();
      s.select(b.id);
      M.plan.fitTo([g], 200);
      return { gid: g.id, bid: b.id, gx: g.x, gy: g.y, bx: b.x, by: b.y, top: M.plan.hitItem(g.x, g.y).id };
    });
    await sleep(600);
    assert.equal(info.top, info.gid, "the fixture should be the topmost item there (this is the case being tested)");
    const at = () => page.evaluate(({ gx, gy }) => { const [sx, sy] = window.__fbsMap.plan.toScreen(gx, gy); const r = document.getElementById("planCanvas").getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy }; }, info);
    const pt = await at();
    await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(pt.x + 40, pt.y + 25, { steps: 6 }); await page.mouse.up();
    await sleep(300);
    const after = await page.evaluate(({ gid, bid }) => { const s = window.__fbsMap.session; const g = s.layout.byId.get(gid), b = s.layout.byId.get(bid); return { g: [g.x, g.y], b: [b.x, b.y], sel: s.selection }; }, info);
    assert.ok(Math.hypot(after.b[0] - info.bx, after.b[1] - info.by) > 1, "the block didn't move: " + JSON.stringify(after));
    assert.ok(Math.hypot(after.g[0] - info.gx, after.g[1] - info.gy) < 0.01, "the fixture moved instead");
    assert.deepEqual(after.sel, [info.bid]);
    const pt2 = await at();
    await page.mouse.click(pt2.x - 20, pt2.y);
    await sleep(200);
    assert.deepEqual(await page.evaluate(() => window.__fbsMap.session.selection), [info.gid], "a plain click should pick the topmost item");
  } finally {
    await ctx.close();
  }
});

test("touch plus a hardware keyboard: after a tap on the plan Delete removes the item; after a tap on the panel it does not", { skip: SKIP, timeout: 240000 }, async () => {
  const id = await newMap("Touch delete");
  const { ctx, page } = await open(PHONE, `#plan&map=${id}`);
  try {
    const g = await page.evaluate(() => { const it = window.__fbsMap.session.layout.items.find((i) => i.type === "gondola" && i.w >= 8); window.__fbsMap.plan.fitTo([it], 160); window.__fbsMap.session.clearSelection(); return it.id; });
    await sleep(600);
    const n0 = await count(page);
    const at = () => page.evaluate((i) => { const o = window.__fbsMap.session.layout.items.find((x) => x.id === i); const [sx, sy] = window.__fbsMap.plan.toScreen(o.x, o.y); const r = document.getElementById("planCanvas").getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy }; }, g);
    let pt = await at();
    await page.touchscreen.tap(pt.x, pt.y); await sleep(900);
    assert.deepEqual(await page.evaluate(() => window.__fbsMap.session.selection), [g], "the tap selected the gondola");
    // press something that is not the plan (the title of the panel), then Delete: nothing happens
    await page.locator("#inspector .insp-name").tap(); await sleep(200);
    await page.keyboard.press("Delete"); await page.keyboard.press("Backspace");
    assert.equal(await count(page), n0, "Delete after a tap on the panel deleted the item");
    // press the plan again, then Delete: the item goes
    pt = await at();
    await page.touchscreen.tap(pt.x, pt.y); await sleep(500);
    await page.keyboard.press("Delete");
    assert.equal(await count(page), n0 - 1, "Delete after a tap on the plan should remove the selected item");
  } finally {
    await ctx.close();
  }
});

test("an Undo toast is cleared when another map opens, and Undo in the same map still works", { skip: SKIP, timeout: 240000 }, async () => {
  const x = await newMap("Undo X"), y = await newMap("Undo Y");
  const { ctx, page } = await open(DESK, `#plan&map=${x}`);
  try {
    const g = await page.evaluate(() => { const it = window.__fbsMap.session.layout.items.find((i) => i.type === "gondola"); return it.id; });
    await page.evaluate((i) => { const M = window.__fbsMap; M.session.select(i); M.act.setField([i], "name", "FROM MAP X"); M.act.remove(); }, g);
    await sleep(300);
    const toast = () => page.evaluate(() => { const t = document.getElementById("toast"); return { hidden: t.hidden, text: t.textContent }; });
    assert.ok(!(await toast()).hidden);
    await page.evaluate((m) => window.__fbsMap.openMap(m), y);
    await sleep(1500);
    assert.ok((await toast()).hidden, "the Undo toast is still showing on the other map");
    const name = await page.evaluate((i) => { const it = window.__fbsMap.session.layout.items.find((o) => o.id === i); return it ? it.name : null; }, g);
    assert.notEqual(name, "FROM MAP X", "the deleted item's name was written into the other map");
    await page.evaluate((i) => { window.__fbsMap.session.select(i); window.__fbsMap.act.remove(); }, g);
    await sleep(300);
    const before = await count(page);
    await page.locator(".toast-act").click();
    await sleep(300);
    assert.equal(await count(page), before + 1, "Undo in the same map should bring the item back");
  } finally {
    await ctx.close();
  }
});

test("the page raised no console errors, page errors, CSP violations or off-site requests during all of the above", { skip: SKIP }, () => {
  assert.deepEqual(problems, []);
});
