// Prints the SQL that seeds the master map (version 1) from public/data/master.json, after checking the file with
// the same validation the Worker uses (src/shared/schema.js). It changes nothing by itself (like setup-code).
// Run: npm run -s seed-master > /tmp/master-seed.sql   (a file outside the repository)
// The SQL goes to stdout and the instructions to stderr, so the redirect above captures only the SQL.
// The tests seed their local databases with masterSeedSql() from this file.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateMapData } from "../src/shared/schema.js";

export const MASTER_FILE = fileURLToPath(new URL("../public/data/master.json", import.meta.url));

const sqlStr = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);

/** {sql, itemCount, label}: one INSERT that adds version 1 only while master_versions is empty. Throws if invalid. */
export function masterSeedSql({ file = MASTER_FILE, now = Date.now() } = {}) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const r = validateMapData(raw);
  if (!r.ok) throw new Error(`${file} is not a valid map: ${r.error} (field ${r.field}${r.itemId ? `, item ${r.itemId}` : ""})`);
  const label = typeof raw.version === "string" ? raw.version.slice(0, 80) : "master.json";
  const note = `Seeded from public/data/master.json (${label})`;
  const sql =
    `INSERT INTO master_versions (version, data, item_count, created_at, created_by, created_by_name, source_map_id, source_owner_name, note)\n` +
    `SELECT 1, ${sqlStr(JSON.stringify(r.data))}, ${r.data.items.length}, ${Math.floor(now)}, NULL, 'Initial survey', NULL, NULL, ${sqlStr(note)}\n` +
    `WHERE NOT EXISTS (SELECT 1 FROM master_versions);\n`;
  return { sql, itemCount: r.data.items.length, label };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let out;
  try {
    out = masterSeedSql();
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
  process.stdout.write(out.sql);
  console.error(`
Master map seed: ${out.itemCount} items from public/data/master.json (${out.label}). It validates.
The SQL above (stdout) adds master version 1 by "Initial survey" only if there is no master yet; nothing was changed.

To seed the live site (docs/DEPLOY-PHASE2.md has the whole safe order), in this folder, BEFORE the pull request is merged:
  1. npx wrangler d1 migrations apply fbs-boise-map --remote          (adds the maps tables, migration 0005)
  2. npm run -s seed-master > /tmp/master-seed.sql                      (this command; a file outside the repository)
  3. npx wrangler d1 execute fbs-boise-map --remote --file /tmp/master-seed.sql
  4. check: npx wrangler d1 execute fbs-boise-map --remote --command "SELECT version, item_count FROM master_versions ORDER BY version DESC LIMIT 1"
     (version 1 with ${out.itemCount} items), and only then merge the pull request.

(For npm run dev on your own computer use --local instead of --remote.)
`);
}
