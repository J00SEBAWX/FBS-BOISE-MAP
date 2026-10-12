// Brand sections (owner, Oct 12; no server, no DOM): every Power Tools block is one brand's section (Milwaukee, DeWalt
// or Makita, picked before it is placed), and Simpson Strong-Tie is its own department. A section starts at its brand's
// share of the target, is measured against that share, and gets the brand's tiles, light and neon sign.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { validateMapData } from "../public/js/shared/schema.js";
import { CATALOG, PRODUCTS, getArea } from "../public/js/shared/catalog.js";
import * as A from "../public/js/core/areas.js";
import { find } from "../public/js/core/finder.js";
import { BRANDS, POWER_BRANDS, brandOf, missingBrand, brandSuffix, needsBrand } from "../public/js/core/brands.js";
import { blockLines } from "../public/js/plan2d/blocks.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const store = () => ({ items: [{ id: "f1", type: "floor", name: "Sales floor", x: 30, y: 20, w: 60, d: 40, h: 0, rot: 0, kind: "showroom", fixed: true }] });
const close = (a, b, eps = 0.6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test("Power Tools needs a brand: Milwaukee, DeWalt or Makita; Simpson Strong-Tie is Simpson's", () => {
  assert.deepEqual([...POWER_BRANDS], ["milwaukee", "dewalt", "makita"]);
  assert.equal(needsBrand("power_tools"), true);
  for (const k of ["simpson_strongtie", "hardware_fasteners", "c_custom"]) assert.equal(needsBrand(k), false, k);
  const pt = (brand) => ({ id: "a1", type: "area", cat: "power_tools", ...(brand ? { brand } : {}) });
  assert.equal(brandOf(pt("milwaukee")).name, "Milwaukee");
  assert.equal(brandOf(pt("dewalt")).name, "DeWalt");
  assert.equal(brandOf(pt("makita")).name, "Makita");
  assert.equal(brandOf(pt(null)), null);
  assert.equal(brandOf(pt("kreg")), null, "only the three Power Tools brands");
  assert.equal(brandOf({ id: "s", type: "area", cat: "simpson_strongtie" }).name, "Simpson Strong-Tie");
  assert.equal(brandOf({ id: "h", type: "area", cat: "hardware_fasteners", brand: "milwaukee" }), null, "a brand on another department does nothing");
  assert.equal(brandOf({ id: "g", type: "gondola", brand: "milwaukee" }), null, "fixtures keep their own brand colours");
  assert.equal(missingBrand(pt(null)), true);
  assert.equal(missingBrand(pt("makita")), false);
  assert.equal(brandSuffix(pt("milwaukee")), "MILWAUKEE");
  assert.equal(brandSuffix(pt(null)), "PICK A BRAND");
  assert.equal(brandSuffix({ id: "s", type: "area", cat: "simpson_strongtie" }), "", "the department already says Simpson");
  assert.deepEqual(blockLines(pt("dewalt"), getArea("power_tools"))[0], "POWER TOOLS · DEWALT");
});

test("the brands' colours are the ones their own websites use, and every logo file is there", () => {
  assert.equal(BRANDS.milwaukee.primary, "#DB011C");
  assert.equal(BRANDS.dewalt.primary, "#FEBD17");
  assert.equal(BRANDS.makita.primary, "#008290");
  assert.equal(BRANDS.simpson.primary, "#FF5308");
  for (const b of Object.values(BRANDS)) {
    assert.match(b.logo, /^\/assets\/brands\/[a-z]+\.(svg|png)$/);
    assert.ok(existsSync(new URL("../public" + b.logo, import.meta.url)), b.logo);
    assert.equal(b.tiles.length, 2);
    for (const c of [...b.tiles, b.light, b.primary]) assert.match(c, /^#[0-9A-F]{6}$/i);
  }
  // the SVG logos are plain shapes: nothing that could run
  for (const f of ["milwaukee.svg", "simpson.svg"]) assert.doesNotMatch(read("public/assets/brands/" + f), /<script|on[a-z]+=|href=/i, f);
  assert.match(read("public/assets/brands/README.md"), /Wikimedia Commons/);
});

test("a brand section starts at its share of the target and is measured against it", () => {
  const cat = A.categoryFor(store(), "power_tools");
  assert.deepEqual(cat.groups.map((g) => [g.label, g.share]), [["Milwaukee", 0.45], ["DeWalt", 0.3], ["Makita", 0.25]]);
  for (const [brand, share] of [["milwaukee", 0.45], ["dewalt", 0.3], ["makita", 0.25]]) {
    const r = A.createBlock(store(), "power_tools", { x: 30, y: 20 }, { brand });
    const it = r.doc.items.find((x) => x.id === r.id);
    assert.equal(it.brand, brand);
    close(it.w * it.d, 700 * share, 700 * share * 0.08); // rounded to 6 inches
    assert.equal(A.blockTarget(cat, it), Math.round(700 * share));
    assert.ok(validateMapData(r.doc).ok, "the brand is a field the map may store");
    const sized = A.sizeToTarget(r.doc, r.id).doc.items.find((x) => x.id === r.id);
    close(sized.w * sized.d, 700 * share, 1);
  }
  // no brand: the department's own size and target
  const plain = A.createBlock(store(), "power_tools", { x: 30, y: 20 });
  const it = plain.doc.items.find((x) => x.id === plain.id);
  assert.equal(it.brand, undefined);
  close(it.w * it.d, 700, 1);
  assert.equal(A.blockTarget(cat, it), 700);
  // a drawn size wins over the share
  const drawn = A.createBlock(store(), "power_tools", { x: 30, y: 20 }, { brand: "makita", size: [10, 8] }).doc.items.at(-1);
  assert.deepEqual([drawn.w, drawn.d, drawn.brand], [10, 8, "makita"]);
  // nonsense never lands in the map
  assert.equal(A.createBlock(store(), "power_tools", { x: 30, y: 20 }, { brand: "<b>" }).doc.items.at(-1).brand, undefined);
});

test("Simpson Strong-Tie is its own department: the screw wall, the Strong-Tie unit and the pergola display", () => {
  const s = getArea("simpson_strongtie");
  assert.equal(s.name, "Simpson Strong-Tie");
  assert.equal(s.family, "building");
  assert.deepEqual([...s.fixtures], ["i62", "i64", "i78"]);
  assert.equal(s.targetSqft, 400);
  assert.ok(s.adjacency.includes("hardware_fasteners") && s.adjacency.includes("decking_outdoor"));
  // nothing of Simpson's is left in the departments it came from
  for (const k of ["hardware_fasteners", "decking_outdoor"]) {
    const a = getArea(k);
    assert.ok(!a.subcats.some((x) => /simpson/i.test(x)), k);
    assert.ok(!a.fixtures.includes("i62") && !a.fixtures.includes("i64") && !a.fixtures.includes("i78"), k);
  }
  assert.ok(PRODUCTS.filter((p) => /simpson/i.test(p.item)).every((p) => p.department === "simpson_strongtie"));
  assert.equal(CATALOG.sizing.totalTargetSqft, CATALOG.areas.reduce((t, a) => t + a.targetSqft, 0));
  for (const q of ["Simpson Strong-Tie", "Simpson screws", "Outdoor Accents", "strong tie hanger"]) assert.equal(find(q)[0].key, "simpson_strongtie", q);
  // deck screws stay in Hardware (the email says so)
  assert.equal(find("deck screws")[0].key, "hardware_fasteners");
});

test("placing Power Tools asks for the brand first; the panel can change it; the 3D view gets tiles, light and sign", () => {
  const main = read("public/js/main.js");
  assert.match(main, /if \(needsBrand\(key\) && !brand\) \{ brandPicker\.pick\(cat\.name\)\.then\(b => \{ if \(b\) startPlacing\(key, b\); \}\); return; \}/);
  assert.match(main, /if \(needsBrand\(key\) && !brand\) \{ brandPicker\.pick\(cat\.name\)\.then\(b => \{ if \(b\) placeDepartment\(key, at, b\); \}\); return; \}/);
  const picker = read("public/js/ui/brand-picker.js");
  assert.match(picker, /Cancel/);
  assert.match(picker, /POWER_BRANDS\.map/);
  const insp = read("public/js/ui/inspector.js");
  assert.match(insp, /selectField\(ids, "brand", "Brand"/);
  const zones = read("public/js/view3d/brand-zones.js");
  assert.match(zones, /new THREE\.PointLight/);
  assert.match(zones, /CanvasTexture\(tileCanvas\(brand\)\)/);
  assert.match(zones, /drawSign\(canvas, brand, img\)/);
  assert.match(read("public/js/view3d/blocks.js"), /zones\.update\(layout\)/);
});
