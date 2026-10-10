// Quick, dependency-free checks for the site. Run: npm run check
//  1. every script parses: the map's ES modules are parsed and LINKED like a browser does (every relative import
//     points at a file and every named import exists in it; no bare imports), classic scripts with vm,
//     Worker/test/script modules with node --check
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

// --link-only <files...>: (run in a child with --experimental-vm-modules, below) parses each file as a browser
// module and links its imports without running anything, exactly as a browser would before the first line runs:
// a syntax error, a missing file, a bare import or `import {x}` that the target doesn't export all fail here.
if (process.argv[2] === "--link-only") {
  const cache = new Map(), errors = [];
  const where = (file, e) => Object.assign(new Error(e.message), {file}); // errors name the file they are in
  const load = f => {
    if (!cache.has(f)) {
      try { cache.set(f, new vm.SourceTextModule(readFileSync(f, "utf8"), {identifier: rel(f)})); }
      catch (e) { throw where(rel(f), e); }
    }
    return cache.get(f);
  };
  for (const f of process.argv.slice(3)) {
    try {
      const mod = load(f);
      if (mod.status !== "unlinked") continue; // already linked as another module's import
      await mod.link((spec, from) => {
        if (!spec.startsWith("./") && !spec.startsWith("../")) throw where(from.identifier, new Error(`import "${spec}" is not a relative path (no bare imports, no CDNs)`));
        const target = resolve(dirname(join(root, from.identifier)), spec);
        if (!existsSync(target)) throw where(from.identifier, new Error(`import "${spec}" points at a missing file`));
        return load(target);
      });
    } catch (e) { errors.push(`${e.file || "(linking " + rel(f) + ")"}: ${e.message}`); }
  }
  if (errors.length) { console.error([...new Set(errors)].join("\n")); process.exit(1); }
  process.exit(0);
}

// 1a. browser scripts. Modules: every file under public/js/ and everything a page loads with
// <script type="module"> (and what those import); classic scripts: the rest (sign-in, admin, theme boot).
const PAGE_FILES = ["index.html", "login.html", "admin/index.html"];
const moduleEntries = new Set(), classicSrcs = new Set();
for (const page of PAGE_FILES) {
  const file = join(pub, page);
  if (!existsSync(file)) continue;
  for (const m of readFileSync(file, "utf8").matchAll(/<script\b([^>]*)>/gi)) {
    const src = /\bsrc\s*=\s*"([^"]+)"/.exec(m[1]);
    if (!src) continue;
    const f = join(pub, new URL(src[1], "https://site.invalid/" + page).pathname.slice(1));
    (/\btype\s*=\s*"module"/.test(m[1]) ? moduleEntries : classicSrcs).add(f);
  }
}
const isModuleFile = f => moduleEntries.has(f) || relative(pub, f).split(sep)[0] === "js";
const browserModules = files.filter(f => f.endsWith(".js") && !isVendor(f) && isModuleFile(f));
for (const f of files.filter(f => f.endsWith(".js") && !isVendor(f) && !isModuleFile(f))) {
  try { new vm.Script(readFileSync(f, "utf8"), {filename: f}); }
  catch (e) { fail(`${rel(f)}: syntax error: ${e.message}`); }
}
for (const f of classicSrcs) if (isModuleFile(f)) fail(`${rel(f)} is loaded as a classic <script> but is a module (public/js/)`);
if (browserModules.length) {
  try { execFileSync(process.execPath, ["--experimental-vm-modules", "--no-warnings", fileURLToPath(import.meta.url), "--link-only", ...browserModules], {stdio: "pipe"}); }
  catch (e) { fail(`browser modules don't load:\n    ${String(e.stderr || e.message).trim().split("\n").join("\n    ")}`); }
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
if (PAGES.length !== PAGE_FILES.length) fail("scripts/check.mjs: PAGES and PAGE_FILES disagree");
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
