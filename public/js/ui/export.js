/* Print / PDF / Email: the "Print or share" dialog. It draws the map as it is shown (plan2d/sheet.js, always in
 * light colours), shows a preview, and offers: Download PDF, Print (the browser's print, where "Save as PDF" also
 * works) and Email or share (the phone's share sheet with the PDF attached; on a computer the PDF downloads and an
 * email opens, ready for it to be attached). Nothing is sent anywhere by the site itself. */
import {h, icon, modal} from "./dom.js";
import {readPlanTokens} from "../plan2d/plan.js";
import {drawSheet, SHEET} from "../plan2d/sheet.js";
import {imagesToPdf, exportFileName} from "../core/pdf.js";

const SCALE = 1.6; // canvas pixels per sheet pixel: 240 dpi on paper

/** The plan colours of the light theme, whatever theme is on screen (the paper is white). */
function lightTokens() {
  const root = document.documentElement, had = root.hasAttribute("data-theme"), old = root.getAttribute("data-theme");
  root.setAttribute("data-theme", "light");
  try { return readPlanTokens(); } finally { if (had) root.setAttribute("data-theme", old); else root.removeAttribute("data-theme"); }
}

/** {canvas, blob (JPEG)} of the sheet. */
async function renderSheet(data) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(SHEET.W * SCALE); canvas.height = Math.round(SHEET.H * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* draw with what is loaded */ } }
  drawSheet(ctx, {...data, tok: lightTokens()});
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("This browser couldn't make the picture of the map.");
  return {canvas, blob};
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h("a", {href: url, download: name});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * createExport({getData() -> {layout, doc, cats, layers, title, subtitle, link}, toast(msg, opts)}) -> {open(opener)}
 */
export function createExport(o) {
  let current = null; // {pdf: Blob, jpeg: Blob, name, title, link, url}
  const preview = h("img", {class: "exp-preview", alt: "Preview of the printed map"});
  const status = h("p", {class: "exp-status", role: "status", text: "Making the page…"});
  const btnPdf = h("button", {type: "button", class: "btn primary", disabled: true}, icon("i-print"), "Download PDF");
  const btnPrint = h("button", {type: "button", class: "btn", disabled: true}, "Print");
  const btnShare = h("button", {type: "button", class: "btn", disabled: true}, "Email or share");
  const btnClose = h("button", {type: "button", class: "btn ghost"}, "Close");
  const dlgEl = h("dialog", {class: "small-dialog export-dlg", aria: {labelledby: "expTitle"}},
    h("div", {class: "dialog"},
      h("div", {class: "dialog-head"}, h("h2", {id: "expTitle", tabindex: -1, text: "Print or share this map"})),
      h("p", {class: "exp-hint", text: "This is the map as you see it now, on one letter-size page. Download it, print it, or send it by email."}),
      h("div", {class: "exp-frame"}, preview),
      status,
      h("div", {class: "foot spread"}, h("span", {class: "foot-left"}, btnClose), h("span", {class: "exp-actions"}, btnShare, btnPrint, btnPdf))));
  document.body.appendChild(dlgEl);
  const dlg = modal(dlgEl, {onClose: () => { if (current && current.url) URL.revokeObjectURL(current.url); current = null; }});
  btnClose.addEventListener("click", () => dlg.close());

  // the page the browser prints: only this sheet (css: .print-sheet, @media print)
  const printImg = h("img", {alt: ""});
  const printBox = h("div", {class: "print-sheet", aria: {hidden: true}}, printImg);
  document.body.appendChild(printBox);

  const busy = on => { for (const b of [btnPdf, btnPrint, btnShare]) b.disabled = on; };

  async function open() {
    busy(true);
    status.hidden = false; status.textContent = "Making the page…";
    preview.removeAttribute("src");
    dlg.open(dlgEl.querySelector("h2"));
    try {
      const data = o.getData();
      const {canvas, blob} = await renderSheet(data);
      const jpeg = new Uint8Array(await blob.arrayBuffer());
      const pdfBytes = imagesToPdf([{jpeg, width: canvas.width, height: canvas.height}], {title: `FBS Boise Store Map: ${data.title}`});
      const url = URL.createObjectURL(blob);
      current = {pdf: new Blob([pdfBytes], {type: "application/pdf"}), jpeg: blob, name: exportFileName(data.title), title: data.title, link: data.link, url};
      preview.src = url;
      status.hidden = true;
      busy(false);
      btnPdf.focus({preventScroll: true});
    } catch (e) {
      status.textContent = (e && e.message) || "The page couldn't be made. Try again.";
    }
  }

  btnPdf.addEventListener("click", () => {
    if (!current) return;
    download(current.pdf, current.name);
    o.toast(`Downloaded ${current.name}`, {icon: "i-check"});
  });

  btnPrint.addEventListener("click", async () => {
    if (!current) return;
    printImg.src = current.url;
    try { await printImg.decode(); } catch { /* print anyway */ }
    dlg.close();
    window.print();
  });

  btnShare.addEventListener("click", async () => {
    if (!current) return;
    const file = new File([current.pdf], current.name, {type: "application/pdf"});
    const text = `The FBS Boise store map "${current.title}" is attached.${current.link ? ` Open it on the site: ${current.link}` : ""}`;
    if (navigator.canShare && navigator.canShare({files: [file]})) {
      try { await navigator.share({files: [file], title: `Store map: ${current.title}`, text}); return; }
      catch (e) { if (e && e.name === "AbortError") return; /* else fall back to email below */ }
    }
    download(current.pdf, current.name);
    const mail = `mailto:?subject=${encodeURIComponent(`Store map: ${current.title}`)}&body=${encodeURIComponent(`${text}\n\n(Attach ${current.name} from your Downloads folder.)`)}`;
    const a = h("a", {href: mail}); document.body.appendChild(a); a.click(); a.remove();
    o.toast(`The PDF downloaded. Attach ${current.name} to the email.`, {ms: 7000});
  });

  return {open};
}
