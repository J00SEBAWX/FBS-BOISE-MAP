// Applies a small, named change (scripts/master-patches/*.json) to the LIVE master map as a new master version, the way
// an admin edit in the app would: it reads the newest master from the database, replaces or adds the patch's items
// (matched by id), removes the ids it lists, checks the result with the Worker's own validation, and saves it as
// version N+1 only if the master is still version N and isn't locked. Edits made in the app since are kept; nothing
// is ever deleted (every master version stays in Review > History and can be restored).
//
// Run it from this folder (you need to be logged in to Cloudflare once: npx wrangler login):
//   npm run master-patch -- scripts/master-patches/2026-10-11-sales-columns.json            shows what would change
//   npm run master-patch -- scripts/master-patches/2026-10-11-sales-columns.json --apply    saves the new version
// --local [--persist-to <dir>] works on a local database instead of the live one (npm run dev, the tests).
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateMapData } from "../src/shared/schema.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const sqlStr = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);

/**
 * applyPatch(data, patch) -> {data, changed: [{id, what: "moved" | "added" | "removed" | "changed"}]}. Pure: the input
 * is not modified. Items in patch.set replace the item with the same id (in place) or are added after the last
 * column; ids in patch.remove are dropped. An item already exactly as the patch has it is not listed.
 */
export function applyPatch(data, patch) {
  const items = data.items.map((it) => ({ ...it }));
  const changed = [];
  for (const want of patch.set || []) {
    const i = items.findIndex((it) => it.id === want.id);
    if (i >= 0) {
      if (JSON.stringify(items[i]) === JSON.stringify(want)) continue;
      const moved = items[i].x !== want.x || items[i].y !== want.y;
      items[i] = { ...want };
      changed.push({ id: want.id, name: want.name, what: moved ? "moved" : "changed" });
    } else {
      let at = items.length;
      for (let k = items.length - 1; k >= 0; k--) if (items[k].type === want.type) { at = k + 1; break; }
      items.splice(at, 0, { ...want });
      changed.push({ id: want.id, name: want.name, what: "added" });
    }
  }
  for (const id of patch.remove || []) {
    const i = items.findIndex((it) => it.id === id);
    if (i < 0) continue;
    changed.push({ id, name: items[i].name, what: "removed" });
    items.splice(i, 1);
  }
  return { data: { ...data, items }, changed };
}

/** The SQL that adds version base+1 only while the master is still `base` and unlocked (as the app's own save does). */
export function insertSql({ base, data, now, note }) {
  return (
    `INSERT INTO master_versions (version, data, item_count, created_at, created_by, created_by_name, source_map_id, source_owner_name, note, source_owner_id)\n` +
    `SELECT ${base + 1}, ${sqlStr(JSON.stringify(data))}, ${data.items.length}, ${Math.floor(now)}, NULL, 'Map update', NULL, NULL, ${sqlStr(note)}, NULL\n` +
    ` WHERE (SELECT COALESCE(MAX(version), 0) FROM master_versions) = ${base}\n` +
    `   AND COALESCE((SELECT value FROM settings WHERE key = 'master_locked'), '0') = '0';\n`
  );
}

function wrangler(target, args) {
  return execFileSync(process.execPath, [WRANGLER, "d1", "execute", "fbs-boise-map", ...target, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function query(target, sql) {
  const out = wrangler(target, ["--json", "--command", sql]);
  const parsed = JSON.parse(out.slice(out.indexOf("[")));
  return parsed[parsed.length - 1].results || [];
}

async function main(argv) {
  const file = argv.find((a) => a.endsWith(".json"));
  if (!file) throw new Error("Which change? Give the patch file, e.g. scripts/master-patches/2026-10-11-sales-columns.json");
  const apply = argv.includes("--apply");
  const local = argv.includes("--local");
  const pi = argv.indexOf("--persist-to");
  const target = local ? ["--local", ...(pi >= 0 ? ["--persist-to", argv[pi + 1]] : [])] : ["--remote"];
  const where = local ? "the local database" : "the live site";
  const patch = JSON.parse(readFileSync(file, "utf8"));

  const [row] = query(target, "SELECT version, data FROM master_versions ORDER BY version DESC LIMIT 1");
  if (!row) throw new Error(`There is no master map on ${where} yet (seed it first: npm run seed-master).`);
  const [lock] = query(target, "SELECT value FROM settings WHERE key = 'master_locked'");
  const { data, changed } = applyPatch(JSON.parse(row.data), patch);

  console.log(`The master map on ${where} is version ${row.version}.`);
  if (!changed.length) { console.log(`"${patch.name}" is already on it: nothing to do.`); return 0; }
  console.log(`"${patch.name}" changes ${changed.length} item(s):`);
  for (const c of changed) console.log(`  - ${c.what} ${c.name} (${c.id})`);
  const v = validateMapData(data);
  if (!v.ok) throw new Error(`The result would not be a valid map (${v.error}, field ${v.field}${v.itemId ? `, item ${v.itemId}` : ""}). Nothing was changed.`);
  if (lock && lock.value === "1") { console.log("\nThe master map is LOCKED. Unlock it in the app (account menu > Map settings), then run this again. Nothing was changed."); return 1; }
  if (!apply) { console.log(`\nNothing was changed. To save this as version ${row.version + 1}, run the same command with --apply at the end.`); return 0; }

  const dir = mkdtempSync(join(tmpdir(), "fbs-master-patch-"));
  try {
    const sqlFile = join(dir, "patch.sql");
    writeFileSync(sqlFile, insertSql({ base: row.version, data: v.data, now: Date.now(), note: patch.note }));
    wrangler(target, ["--file", sqlFile]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const [after] = query(target, "SELECT COALESCE(MAX(version), 0) AS v FROM master_versions");
  if (after.v !== row.version + 1) { console.log(`\nNothing was saved: the master changed (or was locked) while this ran. Run it again.`); return 1; }
  console.log(`\nSaved: the master map is now version ${after.v}. Reload the map to see it. (The old version stays in Review > History.)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(String(e.message || e)); process.exit(1); });
}
