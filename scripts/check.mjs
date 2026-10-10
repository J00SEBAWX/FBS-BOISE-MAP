// Quick, dependency-free checks for the site. Run: npm run check
//  1. every script parses (public/ ES modules with node --check and their relative imports resolve; public/
//     classic scripts with vm; Worker/test/script modules with node --check)
//  2. nothing published mentions the old walk-around character
//  3. no HTML page has inline scripts, inline styles or inline event handlers (the CSP blocks them)
//  4. every src/href in the HTML pages points at a file in public/
//  5. no unsafe DOM sinks (innerHTML and friends) in our browser code
//  6. security headers have one source: the Worker (no public/_headers)
import {readFileSync, readdirSync, statSync, existsSync} from "node:fs";
import {join, relative, resolve, dirname, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const problems = [];
const fail = msg => problems.push(msg);
const rel = p => relative(root, p).split(sep).join("/");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(pub);
const isVendor = f => /^vendor[\\/]/.test(relative(pub, f));

// 1a. browser scripts: the map's ES modules (public/js/**, they use import / export) are checked as modules
// and every relative import must point at a file; the sign-in and admin pages are classic scripts
const IS_MODULE = /^\s*(?:import\s*(?:[\w*{]|["'])|export\s)/m;
const browserModules = [];
for (const f of files.filter(f => f.endsWith(".js") && !isVendor(f))) {
  const src = readFileSync(f, "utf8");
  if (IS_MODULE.test(src)) {
    browserModules.push(f);
    try { execFileSync(process.execPath, ["--check", f], {stdio: "pipe"}); }
    catch (e) { fail(`${rel(f)}: syntax error (module)\n${String(e.stderr || e.message).trim()}`); }
    for (const m of src.matchAll(/^\s*(?:import|export)\b[^"';]*?from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm)) {
      const spec = m[1] || m[2];
      if (!spec.startsWith("./") && !spec.startsWith("../")) { fail(`${rel(f)}: import "${spec}" is not a relative path (no bare imports, no CDNs)`); continue; }
      const target = resolve(dirname(f), spec);
      if (!existsSync(target)) fail(`${rel(f)}: import "${spec}" points at a missing file`);
    }
  } else {
    try { new vm.Script(src, {filename: f}); }
    catch (e) { fail(`${rel(f)}: syntax error: ${e.message}`); }
  }
}
// 1b. Worker code, tests and scripts are ES modules: node --check
const modules = [...walk(join(root, "src")), ...walk(join(root, "test")), ...walk(join(root, "scripts"))].filter(f => /\.m?js$/.test(f));
for (const f of modules) {
  try { execFileSync(process.execPath, ["--check", f], {stdio: "pipe"}); }
  catch (e) { fail(`${rel(f)}: syntax error\n${String(e.stderr || e.message).trim()}`); }
}

// 2. nothing published or served mentions the old walk-around character
// (the pattern is written as j[e]rry so this file doesn't match a plain-text search for the name)
const OLD_CHARACTER = /j[e]rry/i;
for (const f of [...files, ...walk(join(root, "src"))]) {
  if (OLD_CHARACTER.test(readFileSync(f, "latin1"))) fail(`${rel(f)} mentions the old walk-around character`);
}

// 3 + 4. the HTML pages, with the URL each one is served at (relative links resolve against it)
const PAGES = [
  ["index.html", "/"],
  ["login.html", "/login"],
  ["admin/index.html", "/admin/"],
];
function fileFor(pathname) {
  const p = pathname.endsWith("/") ? pathname + "index.html" : pathname;
  const f = join(pub, decodeURIComponent(p).replace(/^\//, ""));
  if (existsSync(f) && statSync(f).isFile()) return f;
  if (existsSync(f + ".html")) return f + ".html"; // /login -> login.html
  return null;
}
for (const [page, served] of PAGES) {
  const file = join(pub, page);
  if (!existsSync(file)) { fail(`public/${page} is missing`); continue; }
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (m[2].trim()) fail(`${page} has an inline <script> body`);
    if (!/\bsrc\s*=/.test(m[1])) fail(`${page} has a <script> without src`);
  }
  if (/<style\b/i.test(html)) fail(`${page} has a <style> element`);
  if (/\sstyle\s*=/i.test(html)) fail(`${page} has a style= attribute`);
  if (/\son[a-z]+\s*=/i.test(html)) fail(`${page} has an inline event handler (on...=)`);
  for (const m of html.matchAll(/\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const url = m[1] ?? m[2] ?? m[3];
    const u = new URL(url, "https://site.invalid" + served);
    if (u.origin !== "https://site.invalid") { fail(`${page} links off-site: ${url}`); continue; }
    if (!fileFor(u.pathname)) fail(`${page}: ${url} is not a file in public/`);
  }
}

// 5. unsafe DOM sinks in our browser code (visitor names must only ever go in as text)
for (const f of files.filter(f => f.endsWith(".js") && !isVendor(f))) {
  const js = readFileSync(f, "utf8");
  for (const [re, why] of [
    [/\.innerHTML\s*=/, "innerHTML assignment"],
    [/\.outerHTML\s*=/, "outerHTML assignment"],
    [/insertAdjacentHTML\s*\(/, "insertAdjacentHTML"],
    [/document\.write\s*\(/, "document.write"],
    [/\beval\s*\(/, "eval"],
    [/new\s+Function\s*\(/, "new Function"],
    [/setAttribute\(\s*["']style["']/, "setAttribute('style') (blocked by the CSP)"],
  ]) {
    if (re.test(js)) fail(`${rel(f)}: ${why}`);
  }
}

// 6. one source of truth for headers
if (existsSync(join(pub, "_headers"))) fail("public/_headers exists: the Worker (src/lib/http.js) sets every header");

if (problems.length) {
  console.error("check failed:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`check passed (${files.length} files in public/, ${browserModules.length} browser modules, ${modules.length} Worker/test/script modules)`);
