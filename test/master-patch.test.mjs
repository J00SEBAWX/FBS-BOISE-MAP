// scripts/master-patch.mjs: a named change to the live master as a new version (the 11 Oct sales-floor columns).
//   1. applyPatch moves, adds and removes by id, leaves its input alone, and a second run changes nothing
//   2. against a real local database: a dry run changes nothing; --apply adds version N+1 with the change AND keeps an
//      edit made in the app after the seed; running it again does nothing; a locked master is never changed
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPatch } from "../scripts/master-patch.mjs";
import { masterSeedSql, MASTER_FILE } from "../scripts/seed-master.mjs";
import { startDev } from "./helpers/devserver.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PATCH_FILE = join(ROOT, "scripts", "master-patches", "2026-10-11-sales-columns.json");
const patch = JSON.parse(readFileSync(PATCH_FILE, "utf8"));
const current = JSON.parse(readFileSync(MASTER_FILE, "utf8"));
const byId = (d, id) => d.items.find((it) => it.id === id);

/** The master as it was before the fix: no col_garden, i42 at (54.5, 20), and the two columns the scan doesn't show. */
function oldMaster() {
  const d = structuredClone(current);
  d.items = d.items.filter((it) => it.id !== "col_garden");
  Object.assign(byId(d, "i42"), { x: 54.5, y: 20 });
  d.items.push({ ...byId(d, "i43"), id: "i44", name: "Column", x: 80, y: 20 }, { ...byId(d, "i43"), id: "c_pipe", name: "Steel pipe column", x: 94.5, y: 22.5, w: 0.7, d: 0.7 });
  return d;
}

test("applyPatch: moves, adds and removes by id; the input is untouched; a second run is a no-op", () => {
  const old = oldMaster();
  const before = JSON.stringify(old);
  const { data, changed } = applyPatch(old, patch);
  assert.equal(JSON.stringify(old), before, "input not modified");
  const what = Object.fromEntries(changed.map((c) => [c.id, c.what]));
  assert.equal(what.i42, "moved");
  assert.equal(what.col_garden, "added");
  assert.equal(what.i44, "removed");
  assert.equal(what.c_pipe, "removed");
  assert.deepEqual([byId(data, "col_garden").x, byId(data, "col_garden").y], [90.7, 21.5]);
  assert.ok(!byId(data, "i44") && !byId(data, "c_pipe"));
  assert.equal(applyPatch(data, patch).changed.length, 0, "already applied: nothing to do");
  // the patch's items are exactly what the repo's master.json has
  for (const it of patch.set) assert.deepEqual(it, byId(current, it.id), it.id);
  assert.equal(data.items.filter((it) => it.type === "column" && it.x > 48 && it.x < 100 && it.y < 25).length, 6, "six sales-floor columns");
});

let dev, tmp;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "fbs-patch-test-"));
  const oldFile = join(tmp, "old-master.json");
  writeFileSync(oldFile, JSON.stringify(oldMaster()));
  dev = await startDev({ seed: () => masterSeedSql({ file: oldFile, now: Date.now() }).sql });
});
after(async () => {
  if (dev) await dev.stop();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const run = (...args) =>
  new Promise((resolve) =>
    execFile(process.execPath, ["scripts/master-patch.mjs", PATCH_FILE, "--local", "--persist-to", dev.dir, ...args], { cwd: ROOT },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr }))
  );
const latest = async () => (await dev.sql("SELECT version, data FROM master_versions ORDER BY version DESC LIMIT 1"))[0];

test("on a real database: dry run, apply (keeping a later app edit), again, and never while locked", async () => {
  // an edit made in the app after the seed: version 2 renames the paint isle
  const v1 = await latest();
  const d2 = JSON.parse(v1.data);
  byId(d2, "i55").name = "PAINT AISLE (renamed in the app)";
  await dev.sqlFile(`INSERT INTO master_versions (version, data, item_count, created_at, created_by_name, note) VALUES (2, '${JSON.stringify(d2).replace(/'/g, "''")}', ${d2.items.length}, ${Date.now()}, 'Admin', 'app edit');`);

  let r = await run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /version 2/);
  assert.match(r.out, /added Column \(garden row, Simpson side\)/);
  assert.match(r.out, /Nothing was changed/);
  assert.equal((await latest()).version, 2, "the dry run saved nothing");

  await dev.sqlFile("INSERT INTO settings (key, value, updated_at) VALUES ('master_locked', '1', 0) ON CONFLICT(key) DO UPDATE SET value = '1';");
  r = await run("--apply");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /LOCKED/);
  assert.equal((await latest()).version, 2, "locked: nothing saved");
  await dev.sqlFile("UPDATE settings SET value = '0' WHERE key = 'master_locked';");

  r = await run("--apply");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /now version 3/);
  const v3 = await latest();
  assert.equal(v3.version, 3);
  const d3 = JSON.parse(v3.data);
  assert.equal(byId(d3, "i55").name, "PAINT AISLE (renamed in the app)", "the later app edit is kept");
  assert.deepEqual([byId(d3, "i42").x, byId(d3, "i42").y], [54.5, 21.5]);
  assert.ok(byId(d3, "col_garden") && !byId(d3, "i44") && !byId(d3, "c_pipe"));

  // the site serves it
  const res = await fetch(dev.base + "/api/master");
  assert.ok(res.status === 401 || res.status === 200, "the master endpoint answers"); // signed out here: 401 is fine

  r = await run("--apply");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /already on it/);
  assert.equal((await latest()).version, 3, "a second run saves nothing");
});
