// Tiny DOM helpers. All text goes through textContent, so names and notes can never inject markup.
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * h("button.btn.small", { onclick, title, dataset: { id } }, "Text", childNode)
 * Supports ".class" and "#id" in the tag string. Never sets a style attribute (blocked by the CSP).
 */
export function h(tag, attrs, ...kids) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || "div");
  for (const r of rest) {
    if (r[0] === ".") el.classList.add(r.slice(1));
    else if (r[0] === "#") el.id = r.slice(1);
  }
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = Boolean(v);
    else if (k === "style") throw new Error("Inline styles are blocked by the CSP. Use classes or el.style.prop.");
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export function clear(el) {
  el.replaceChildren();
  return el;
}

// 20px stroke icons (paths only; drawn with currentColor).
const ICONS = {
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  redo: ["m15 14 5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  bulb: ["M9 18h6", "M10 22h4", "M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"],
  map: ["m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z", "M9 3v15", "M15 6v15"],
  person: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  rotate: ["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
  lock: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
  unlock: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 7.5-2"],
  check: ["m5 12 5 5L20 7"],
  alert: ["M12 3 2 21h20z", "M12 10v4", "M12 18h.01"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  target: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"],
  hand: ["M7 11V5a2 2 0 0 1 4 0v5", "M11 10V4a2 2 0 0 1 4 0v6", "M15 10V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3 14a2 2 0 0 1 3.4-2L7 13"],
  send: ["M22 2 11 13", "M22 2 15 22l-4-9-9-4z"],
  layers: ["m12 2 10 5-10 5L2 7z", "m2 12 10 5 10-5", "m2 17 10 5 10-5"],
  plus: ["M12 5v14", "M5 12h14"],
  star: ["m12 2 3 6.5 7 .9-5 4.8 1.3 7L12 17.8 5.7 21.2 7 14.2 2 9.4l7-.9z"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  help: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3", "M12 17h.01"],
  up: ["m18 15-6-6-6 6"],
  down: ["m6 9 6 6 6-6"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  users: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M2 21a7 7 0 0 1 14 0", "M16 3.5a4 4 0 0 1 0 7", "M22 21a7 7 0 0 0-4-6.3"],
};

export function icon(name, size = 18) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ico");
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}

export function fmtSqft(v) {
  return `${Math.round(v).toLocaleString("en-US")} sq ft`;
}

export function fmtWhen(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const STATUS_LABEL = { draft: "Draft", submitted: "Submitted", reviewed: "Reviewed", needs_changes: "Needs changes" };
export const STATUS_CHIP = { draft: "", submitted: "signal", reviewed: "ok", needs_changes: "warn" };
