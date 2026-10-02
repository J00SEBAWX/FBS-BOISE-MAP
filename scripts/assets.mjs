// Rebuilds the self-hosted browser assets from npm packages: Three.js bundle and web fonts.
// Usage: npm run assets   (run after npm install; the outputs are committed so deploys need no build step)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const nm = (...p) => path.join(ROOT, "node_modules", ...p);
const out = (...p) => path.join(ROOT, "public", ...p);

await build({
  entryPoints: [nm("three", "build", "three.module.js")],
  bundle: true,
  minify: true,
  format: "esm",
  legalComments: "eof",
  outfile: out("vendor", "three.module.min.js"),
  logLevel: "warning",
});

const fonts = [
  ["barlow-condensed", ["latin-600-normal", "latin-700-normal"]],
  ["ibm-plex-sans", ["latin-400-normal", "latin-500-normal", "latin-600-normal"]],
];
fs.mkdirSync(out("assets", "fonts"), { recursive: true });
for (const [pkg, files] of fonts) {
  for (const f of files) fs.copyFileSync(nm("@fontsource", pkg, "files", `${pkg}-${f}.woff2`), out("assets", "fonts", `${pkg}-${f}.woff2`));
  fs.copyFileSync(nm("@fontsource", pkg, "LICENSE"), out("assets", "fonts", `LICENSE-${pkg}.txt`));
}
console.log("assets ok: three", JSON.parse(fs.readFileSync(nm("three", "package.json"), "utf8")).version, "+ fonts");
