// Quick, dependency-free checks for the static site in public/. Run: npm run check
import {readFileSync, readdirSync, statSync, existsSync} from "node:fs";
import {join, relative, resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const problems = [];
const fail = msg => problems.push(msg);

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(pub);

// 1. every script of ours parses (public/**/*.js, except the vendored three.js)
for (const f of files.filter(f => f.endsWith(".js") && !/^vendor[\\/]/.test(relative(pub, f)))) {
  try { new vm.Script(readFileSync(f, "utf8"), {filename: f}); }
  catch (e) { fail(`${relative(root, f)}: syntax error: ${e.message}`); }
}

// 2. nothing published mentions the old walk-around character
// (the pattern is written as j[e]rry so this file doesn't match a plain-text search for the name)
const OLD_CHARACTER = /j[e]rry/i;
for (const f of files) {
  if (OLD_CHARACTER.test(readFileSync(f, "latin1"))) fail(`${relative(root, f)} mentions the old walk-around character`);
}

// 3. index.html has no inline script, inline style or inline event handler (the CSP blocks them)
const html = readFileSync(join(pub, "index.html"), "utf8");
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (m[2].trim()) fail("index.html has an inline <script> body");
  if (!/\bsrc\s*=/.test(m[1])) fail("index.html has a <script> without src");
}
if (/<style\b/i.test(html)) fail("index.html has a <style> element");
if (/\sstyle\s*=/i.test(html)) fail("index.html has a style= attribute");
if (/\son[a-z]+\s*=/i.test(html)) fail("index.html has an inline event handler (on...=)");

// 4. every src/href in index.html points at a file in public/
for (const m of html.matchAll(/\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
  const url = m[1] ?? m[2] ?? m[3];
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) { fail(`index.html links off-site: ${url}`); continue; }
  const p = join(pub, url.split(/[?#]/)[0].replace(/^\//, ""));
  if (!existsSync(p) || !statSync(p).isFile()) fail(`index.html: ${url} is not a file in public/`);
}

if (problems.length) {
  console.error("check failed:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`check passed (${files.length} files in public/)`);
