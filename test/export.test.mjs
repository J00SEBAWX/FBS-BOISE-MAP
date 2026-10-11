// The map export: core/pdf.js writes a valid one-image-per-page PDF (header, objects at the offsets its xref lists,
// trailer), names the file plainly, and the Print / share control is wired (toolbar on a computer, More everywhere).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { imagesToPdf, exportFileName, pdfString } from "../public/js/core/pdf.js";

const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// a tiny but real JPEG (1x1 px, white)
const JPEG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=", "base64"));

test("imagesToPdf: a PDF whose xref points at every object, one page per image, letter landscape", () => {
  const bytes = imagesToPdf([{ jpeg: JPEG, width: 2640, height: 2040 }, { jpeg: JPEG, width: 100, height: 200 }], { title: "Dana's plan (v2)" });
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  const [, first, count] = /xref\n(\d+) (\d+)\n/.exec(text.slice(startxref)).map(Number);
  assert.equal(first, 0);
  assert.equal(count, 4 + 2 * 3);
  const rows = text.slice(startxref).split("\n").slice(3, 3 + count - 1);
  rows.forEach((row, i) => {
    const off = Number(row.slice(0, 10));
    assert.equal(text.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1} is where the xref says`);
  });
  assert.match(text, /\/Type \/Pages \/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 792 612\]/);
  assert.match(text, /\/Filter \/DCTDecode \/Length 125/);
  assert.match(text, /\/Title \(FBS Boise Store Map: \)|\/Title \(Dana's plan \\\(v2\\\)\)/);
  // the image keeps its shape on the page: 2640x2040 is limited by the height (576 pt inside quarter-inch margins), centred
  assert.match(text, /q 745\.41 0 0 576\.00 23\.29 18\.00 cm \/Im0 Do Q/);
});

test("imagesToPdf refuses an empty list; strings are escaped and kept ASCII", () => {
  assert.throws(() => imagesToPdf([]), /Nothing/);
  assert.equal(pdfString("a(b)c\\d"), "(a\\(b\\)c\\\\d)");
  assert.equal(pdfString("Café"), "(Caf?)");
});

test("exportFileName: plain, dated, safe for every computer", () => {
  const d = new Date(2026, 9, 11);
  assert.equal(exportFileName("Dana's plan / v2", d), "FBS-Boise-Danas-plan-v2-2026-10-11.pdf");
  assert.equal(exportFileName("", d), "FBS-Boise-map-2026-10-11.pdf");
  assert.equal(exportFileName("Master map", d), "FBS-Boise-Master-map-2026-10-11.pdf");
});

test("the Print / share control is on the toolbar (computer) and in More (everywhere), and prints only the sheet", () => {
  const html = file("../public/index.html"), main = file("../public/js/main.js"), css = file("../public/css/app.css");
  assert.match(html, /id="btnExport"[^>]*title="Print, save as PDF or email this map"/);
  assert.match(main, /moreRow\("Print, PDF or email", "i-print"/);
  assert.match(main, /\$\("#btnExport"\)\.addEventListener\("click", \(\) => exporter\.open\(\)\)/);
  assert.match(file("../public/assets/icons.svg"), /id="i-print"/);
  assert.match(css, /@media print\{[\s\S]*body > \*:not\(\.print-sheet\)\{display:none!important;\}/);
});
