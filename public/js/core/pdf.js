/* A tiny PDF writer for the map export: one JPEG per page, scaled to fit a letter page (landscape by default) with
 * a margin. No fonts, no libraries: every word on the page is part of the picture. Pure (no DOM), so it runs in
 * node for the tests. */

const enc = new TextEncoder();
const PAGE = {letterLandscape: [792, 612], letterPortrait: [612, 792]}; // points (1/72 in)

/** PDF text string: ASCII only (other characters become "?"), with ( ) \ escaped. */
export function pdfString(s) {
  const ascii = String(s ?? "").replace(/[^\x20-\x7e]/g, "?");
  return "(" + ascii.replace(/([\\()])/g, "\\$1") + ")";
}

/**
 * imagesToPdf(pages, {title, page, margin}) -> Uint8Array
 *   pages: [{jpeg: Uint8Array, width, height}] (the JPEG's size in pixels)
 *   page: "letterLandscape" (default) | "letterPortrait"; margin in points (default 18 = a quarter inch)
 */
export function imagesToPdf(pages, {title = "FBS Boise Store Map", page = "letterLandscape", margin = 18} = {}) {
  if (!Array.isArray(pages) || !pages.length) throw new Error("Nothing to put in the PDF.");
  const [PW, PH] = PAGE[page] || PAGE.letterLandscape;
  const chunks = [], offsets = [];
  let length = 0;
  const push = part => { const b = typeof part === "string" ? enc.encode(part) : part; chunks.push(b); length += b.length; };
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  // object numbers: 1 catalog, 2 pages, 3 info, then per page: page, contents, image
  const pageObj = i => 4 + i * 3;
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push("\nendobj\n"); };
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] >>`);
  obj(3, `<< /Title ${pdfString(title)} /Producer ${pdfString("FBS Boise Store Map")} >>`);
  pages.forEach((p, i) => {
    const n = pageObj(i);
    const fit = Math.min((PW - 2 * margin) / p.width, (PH - 2 * margin) / p.height);
    const w = p.width * fit, h = p.height * fit, x = (PW - w) / 2, y = (PH - h) / 2;
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    obj(n + 1, [`<< /Length ${content.length} >>\nstream\n`, content, "\nendstream"]);
    obj(n + 2, [`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, "\nendstream"]);
  });
  const count = 4 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** "FBS-Boise-My-plan-2026-10-11.pdf" */
export function exportFileName(name, date = new Date()) {
  const slug = String(name || "map").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "map";
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `FBS-Boise-${slug}-${d}.pdf`;
}
