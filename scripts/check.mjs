// Pre-deploy checks: syntax, CSP-safe markup, no unsafe DOM sinks, and no store data or secrets in public files.
// Usage: node scripts/check.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const problems = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".wrangler", ".git", "seed", "test-results"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// only the planner's own folders (docs/, legacy/ and old handoff files are not deployed and not checked)
const files = ["src", "public", "scripts", "test", "migrations"].filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) => walk(path.join(ROOT, d)));
for (const f of ["package.json", "wrangler.jsonc", ".gitignore"]) if (fs.existsSync(path.join(ROOT, f))) files.push(path.join(ROOT, f));
const rel = (p) => path.relative(ROOT, p);
const ours = (p) => !p.includes(`${path.sep}vendor${path.sep}`);

// 1. syntax
for (const f of files.filter((p) => /\.(m?js)$/.test(p) && ours(p))) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    problems.push(`${rel(f)}: syntax error\n${String(e.stderr || e.message).trim()}`);
  }
}

// 2. markup the CSP would block
for (const f of files.filter((p) => p.endsWith(".html"))) {
  const html = fs.readFileSync(f, "utf8");
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push(`${rel(f)}: inline <script> (blocked by CSP)`);
  if (/<style[\s>]/i.test(html)) problems.push(`${rel(f)}: inline <style> (blocked by CSP)`);
  if (/\sstyle\s*=/i.test(html)) problems.push(`${rel(f)}: style="" attribute (blocked by CSP)`);
  if (/\son[a-z]+\s*=/i.test(html)) problems.push(`${rel(f)}: inline event handler (blocked by CSP)`);
  if (/(src|href)\s*=\s*["']https?:\/\//i.test(html)) problems.push(`${rel(f)}: external resource (everything must be self-hosted)`);
}

// 3. unsafe DOM sinks in our browser code
for (const f of files.filter((p) => p.includes(`${path.sep}public${path.sep}`) && p.endsWith(".js") && ours(p))) {
  const js = fs.readFileSync(f, "utf8");
  for (const [re, why] of [
    [/\.innerHTML\s*=/, "innerHTML assignment"],
    [/\.outerHTML\s*=/, "outerHTML assignment"],
    [/insertAdjacentHTML\s*\(/, "insertAdjacentHTML"],
    [/document\.write\s*\(/, "document.write"],
    [/\beval\s*\(/, "eval"],
    [/new\s+Function\s*\(/, "new Function"],
    [/style\.cssText/, "style.cssText (blocked by CSP)"],
    [/setAttribute\(\s*["']style["']/, "setAttribute('style') (blocked by CSP)"],
    [/__fbsDebug/, "debug hook left in"],
  ]) {
    if (re.test(js)) problems.push(`${rel(f)}: ${why}`);
  }
}

// 4. no store layout data or secrets shipped as public files or committed
const ignored = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
for (const must of ["seed/", ".dev.vars", ".wrangler/"]) if (!ignored.includes(must)) problems.push(`.gitignore must list ${must}`);
for (const f of files.filter((p) => p.includes(`${path.sep}public${path.sep}`) && p.endsWith(".json"))) problems.push(`${rel(f)}: JSON in public/ (layout data belongs in D1)`);
for (const f of files.filter((p) => /\.(m?js|jsonc?|html|css|md|sql|toml)$/.test(p) && ours(p) && !p.endsWith(".dev.vars"))) {
  const t = fs.readFileSync(f, "utf8");
  if (/PEPPER\s*=\s*\S{8,}|PHONE_KEY\s*=\s*\S{8,}|NTFY_TOPIC\s*=\s*\S{4,}/.test(t) && !rel(f).startsWith("scripts")) problems.push(`${rel(f)}: looks like a secret value`);
  if (/"type"\s*:\s*"gondola"/.test(t) && !rel(f).startsWith("test")) problems.push(`${rel(f)}: contains store fixture data`);
}

if (problems.length) {
  console.error(`check failed (${problems.length}):\n- ` + problems.join("\n- "));
  process.exit(1);
}
console.log(`check ok: ${files.length} files`);
