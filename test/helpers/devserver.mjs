// Starts an isolated local Worker (wrangler dev, fresh D1 in a temp folder, throwaway secrets) for the tests.
import { spawn, execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
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

/** True if nothing is listening on 127.0.0.1:port right now. */
function portIsFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.unref();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

/** A port the system says is free (listen on port 0, read it, close). */
function systemPort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// Test files run in separate processes at the same time, so a port is also reserved with a lock file that every
// process checks (a lock left by a process that has died is taken over).
const LOCK_DIR = path.join(os.tmpdir(), "fbs-test-ports");
const held = new Set();
function lockPort(port) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const file = path.join(LOCK_DIR, `${port}.lock`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: "wx" });
      held.add(port);
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const pid = Number(fs.readFileSync(file, "utf8")) || 0;
      let alive = pid === process.pid;
      if (!alive && pid > 0) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch (err) {
          alive = err.code === "EPERM";
        }
      }
      if (alive) return false;
      fs.rmSync(file, { force: true });
    }
  }
  return false;
}
function unlockPort(port) {
  if (!held.delete(port)) return;
  fs.rmSync(path.join(LOCK_DIR, `${port}.lock`), { force: true });
}
process.on("exit", () => {
  for (const port of held) fs.rmSync(path.join(LOCK_DIR, `${port}.lock`), { force: true });
});

/**
 * A free local port, reserved for this process until releasePort(). By default the system picks one (listen on
 * port 0, close, use it); FBS_TEST_PORTS=8900-8999 keeps the choice inside that range instead. Either way suites
 * running at the same time never get the same port.
 */
export async function freePort() {
  const range = /^(\d+)-(\d+)$/.exec(process.env.FBS_TEST_PORTS || "");
  for (let i = 0; i < 300; i++) {
    const port = range ? Number(range[1]) + crypto.randomInt(Number(range[2]) - Number(range[1]) + 1) : await systemPort();
    if (held.has(port) || !lockPort(port)) continue;
    if (await portIsFree(port)) return port;
    unlockPort(port);
  }
  throw new Error("no free port for the dev server");
}
export const releasePort = unlockPort;

/**
 * startDev({ port, seed, secrets }) -> { base, secrets, stop() }
 * `port` defaults to a free one (see freePort); the devtools inspector gets its own free port too.
 * `seed(secrets)` returns SQL that is run on the fresh database before the Worker starts.
 * `secrets` ({pepper, phoneKey}) replaces the random throwaway ones (e.g. to test bad values).
 */
export async function startDev({ port, seed, secrets: given } = {}) {
  if (!port) port = await freePort();
  const inspectorPort = await freePort();
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
    [WRANGLER, "dev", "--local", "--port", String(port), "--ip", "127.0.0.1", "--inspector-port", String(inspectorPort), "--persist-to", dir,
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
  let exited = false;
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  proc.on("exit", () => (exited = true));
  const release = () => {
    releasePort(port);
    releasePort(inspectorPort);
  };
  const base = `http://127.0.0.1:${port}`;
  // ready = OUR wrangler says it listens on this port (so a server some other process started there can't be
  // mistaken for ours) and the Worker answers
  const ours = new RegExp(`Ready on https?://[^\\s]*:${port}(?!\\d)`);
  const t0 = Date.now();
  for (;;) {
    if (exited) {
      release();
      throw new Error("dev server exited:\n" + log.slice(-3000));
    }
    if (ours.test(log)) {
      try {
        const r = await fetch(base + "/api/health");
        if (r.status === 200) break;
      } catch {
        /* not up yet */
      }
    }
    if (Date.now() - t0 > 90000) {
      kill();
      release();
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
      release();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
