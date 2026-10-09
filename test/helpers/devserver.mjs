// Starts an isolated local Worker (wrangler dev, fresh D1 in a temp folder, throwaway secrets) for the tests.
import { spawn, execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WIN = process.platform === "win32";
// run wrangler's own entry with node directly: no shell, so arguments with spaces stay intact on Windows too
const WRANGLER = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");

// ---------- the documented formulas, written independently with node:crypto (to cross-check the Worker) ----------
export const normalizeCode = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hmacHex = (key, msg) => crypto.createHmac("sha256", key).update(msg).digest("hex");
export const sha256Hex = (msg) => crypto.createHash("sha256").update(msg).digest("hex");
export function aesEncrypt(keyB64, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final(), c.getAuthTag()]);
  return iv.toString("base64") + "." + ct.toString("base64");
}
export function passwordFields(pepper, password, salt = crypto.randomBytes(16)) {
  const derived = crypto.pbkdf2Sync(password.normalize("NFC"), salt, 100000, 32, "sha256").toString("hex");
  return { hash: "v2$" + hmacHex(pepper, "pw:" + derived), salt: salt.toString("base64url") };
}
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function randomCode(groups, size) {
  const parts = [];
  for (let g = 0; g < groups; g++) {
    let p = "";
    for (let i = 0; i < size; i++) p += ALPHA[crypto.randomInt(ALPHA.length)];
    parts.push(p);
  }
  return parts.join("-");
}
export const sqlStr = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);

/**
 * startDev({ port, seed, secrets }) -> { base, secrets, stop() }
 * `seed(secrets)` returns SQL that is run on the fresh database before the Worker starts.
 * `secrets` ({pepper, phoneKey}) replaces the random throwaway ones (e.g. to test bad values).
 */
export async function startDev({ port = 8795, seed, secrets: given } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fbs-test-"));
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1", NO_COLOR: "1" };
  const wr = (args) => execFileSync(process.execPath, [WRANGLER, ...args], { cwd: ROOT, env, stdio: "pipe" });
  wr(["d1", "migrations", "apply", "fbs-boise-map", "--local", "--persist-to", dir]);

  const secrets = given || { pepper: crypto.randomBytes(32).toString("hex"), phoneKey: crypto.randomBytes(32).toString("base64") };
  if (seed) {
    const file = path.join(dir, "seed.sql");
    fs.writeFileSync(file, seed(secrets));
    wr(["d1", "execute", "fbs-boise-map", "--local", "--persist-to", dir, "--file", file]);
  }

  const proc = spawn(
    process.execPath,
    [WRANGLER, "dev", "--local", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", dir,
      "--var", `PEPPER:${secrets.pepper}`, "--var", `PHONE_KEY:${secrets.phoneKey}`, "--show-interactive-dev-session=false"],
    { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: !WIN }
  );
  const kill = () => {
    try {
      if (WIN) spawn(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"), ["/pid", String(proc.pid), "/T", "/F"]);
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
      const r = await fetch(base + "/api/health");
      if (r.status === 200) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > 90000) {
      kill();
      throw new Error("dev server didn't start:\n" + log.slice(-3000));
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return {
    base,
    secrets,
    log: () => log,
    /** Runs SQL on the running server's local database (to age sessions and the like) and returns the rows. */
    async sql(query) {
      const out = await new Promise((resolve, reject) =>
        execFile(process.execPath, [WRANGLER, "d1", "execute", "fbs-boise-map", "--local", "--persist-to", dir, "--json", "--command", query], { cwd: ROOT, env },
          (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message))) : resolve(stdout)))
      );
      const parsed = JSON.parse(out.slice(out.indexOf("[")));
      return parsed[parsed.length - 1].results || [];
    },
    async stop() {
      kill();
      await new Promise((r) => setTimeout(r, 500));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
