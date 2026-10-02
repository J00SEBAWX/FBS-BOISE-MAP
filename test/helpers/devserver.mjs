// Starts an isolated local Worker (fresh D1 in a temp folder) for the integration tests.
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WIN = process.platform === "win32";
// run wrangler's own entry with node directly: no shell, so arguments with spaces stay intact on Windows too
const WRANGLER = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");

export async function startDev({ port = 8791 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fbs-test-"));
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1", NO_COLOR: "1" };
  const wr = (args) => execFileSync(process.execPath, [WRANGLER, ...args], { cwd: ROOT, env, stdio: "pipe" });
  wr(["d1", "migrations", "apply", "fbs-boise-map", "--local", "--persist-to", dir]);
  const seed = path.join(ROOT, "seed", "seed.sql");
  if (fs.existsSync(seed)) wr(["d1", "execute", "fbs-boise-map", "--local", "--persist-to", dir, "--file", seed]);
  const setupCode = crypto.randomBytes(9).toString("hex").toUpperCase().slice(0, 16);
  const hash = crypto.createHash("sha256").update("setup:" + setupCode).digest("hex");
  const now = Date.now();
  wr(["d1", "execute", "fbs-boise-map", "--local", "--persist-to", dir, "--command", `INSERT INTO setup_tokens (token_hash, created_at, expires_at) VALUES ('${hash}', ${now}, ${now + 3600000})`]);

  const pepper = crypto.randomBytes(32).toString("hex");
  const phoneKey = crypto.randomBytes(32).toString("base64");
  const proc = spawn(
    process.execPath,
    [WRANGLER, "dev", "--local", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", dir, "--var", `PEPPER:${pepper}`, "--var", `PHONE_KEY:${phoneKey}`, "--show-interactive-dev-session=false"],
    { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: !WIN }
  );
  const kill = () => {
    try {
      if (WIN) spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"]);
      else process.kill(-proc.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(base + "/login");
      if (r.status === 200) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > 60000) {
      kill();
      throw new Error("dev server didn't start:\n" + log.slice(-3000));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    base,
    setupCode,
    seeded: fs.existsSync(seed),
    log: () => log,
    async stop() {
      kill();
      await new Promise((r) => setTimeout(r, 500));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
