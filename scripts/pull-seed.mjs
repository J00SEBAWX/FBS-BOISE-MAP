// Pulls the store layout rows (current + suggested) out of the production database into seed/
// so local development and the real-store unit tests have geometry to work with.
// Needs `npx wrangler login` once. seed/ is git-ignored, so nothing here ends up in the repo.
// Run: npm run seed:pull      Then: npm run dev   (or npm run db:seed to load it on a fresh database)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" };

const out = execFileSync(
  process.execPath,
  [WRANGLER, "d1", "execute", "fbs-boise-map", "--remote", "--json", "--command", "SELECT id, data FROM layouts WHERE id IN ('current', 'suggested')"],
  { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
);
const rows = JSON.parse(out.slice(out.indexOf("[")))[0]?.results || [];
const byId = Object.fromEntries(rows.map((r) => [r.id, r.data]));
if (!byId.current || !byId.suggested) {
  console.error("The database has no 'current' and 'suggested' layouts yet. Load them with npm run db:seed from a seed/ folder first.");
  process.exit(1);
}
const dir = path.join(ROOT, "seed");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "current.json"), byId.current);
fs.writeFileSync(path.join(dir, "suggested.json"), byId.suggested);
const q = (s) => "'" + s.replace(/'/g, "''") + "'";
const now = Date.now();
fs.writeFileSync(
  path.join(dir, "seed.sql"),
  `INSERT OR REPLACE INTO layouts (id, data, updated_at) VALUES ('current', ${q(byId.current)}, ${now});\n` +
    `INSERT OR REPLACE INTO layouts (id, data, updated_at) VALUES ('suggested', ${q(byId.suggested)}, ${now});\n`
);
console.log(`seed/ written: current.json (${byId.current.length} bytes), suggested.json (${byId.suggested.length} bytes), seed.sql`);
