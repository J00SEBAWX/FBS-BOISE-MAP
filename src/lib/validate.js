// Input validation and sanitizing. Everything stored is whitelisted field by field.
import { HttpError } from "./http.js";
import { AREA_KEYS, ENTRY_ANCHORS, PLACEMENTS, STATUSES, CONFIDENCE, WORK_AREAS } from "../shared/catalog.js";

export function normalizePhone(input) {
  const digits = String(input ?? "").replace(/\D/g, "");
  let d = digits;
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  if (d[0] < "2" || d[3] < "2") return null; // NANP: area code and exchange can't start with 0/1
  return "+1" + d;
}

export function formatPhone(e164) {
  const d = String(e164 || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164 || "";
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const NAME_RE = /^[\p{L}][\p{L}\p{M} .'\-]{0,29}$/u;
export function cleanFirstName(input) {
  const s = String(input ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!s || s.length > 30 || !NAME_RE.test(s)) return null;
  return s;
}

const FREE_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} &/,.'()\-]{0,39}$/u;
export function cleanWorkArea(input) {
  const s = String(input ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const hit = WORK_AREAS.find((w) => w.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  if (s.length > 40 || !FREE_RE.test(s)) return null;
  return s;
}

export function cleanCode(input) {
  const s = String(input ?? "").replace(/\s|-/g, "");
  return /^\d{6}$/.test(s) ? s : null;
}

// ---------- build data ----------
const ITEM_TYPES = new Set([
  "floor", "zone", "wall", "door", "opening", "arch", "column", "gondola", "wallunit", "rack",
  "pallet", "ring", "counter", "table", "display", "tower", "platform", "stairs",
]);
const ID_RE = /^[A-Za-z0-9_\-]{1,48}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const WORD_RE = /^[a-z_]{1,24}$/;

const num = (v, lo, hi, dflt) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n * 1000) / 1000));
};
const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max) : "");
const bool = (v) => v === true;
const rot = (v) => {
  const n = num(v, -100000, 100000, 0);
  return Math.round((((n % 360) + 360) % 360) * 1000) / 1000;
};

function cleanItem(it) {
  if (!it || typeof it !== "object") return null;
  if (!ID_RE.test(String(it.id || ""))) return null;
  if (!ITEM_TYPES.has(it.type)) return null;
  const out = {
    id: it.id,
    type: it.type,
    name: str(it.name, 80),
    x: num(it.x, -300, 500, 0),
    y: num(it.y, -300, 500, 0),
    w: num(it.w, 0.1, 250, 1),
    d: num(it.d, 0.1, 250, 1),
    h: num(it.h, 0, 60, 0),
    rot: rot(it.rot),
  };
  if (HEX_RE.test(it.color || "")) out.color = it.color;
  if (HEX_RE.test(it.top || "")) out.top = it.top;
  if (WORD_RE.test(it.brand || "")) out.brand = it.brand;
  if (WORD_RE.test(it.brand2 || "")) out.brand2 = it.brand2;
  if (WORD_RE.test(it.style || "")) out.style = it.style;
  if (WORD_RE.test(it.kind || "")) out.kind = it.kind;
  if (bool(it.locked)) out.locked = true;
  if (bool(it.fixed)) out.fixed = true;
  if (bool(it.led)) out.led = true;
  if (bool(it.solid)) out.solid = true;
  if (it.ceil !== undefined) out.ceil = num(it.ceil, 0, 60, 0);
  if (it.shape === "oct" || it.shape === "rect") out.shape = it.shape;
  if (it.cham !== undefined) out.cham = num(it.cham, 0, 20, 1.75);
  if (it.t !== undefined) out.t = num(it.t, 0.5, 10, 2.5);
  if (it.open && typeof it.open === "object") {
    const sides = Array.isArray(it.open.sides) ? it.open.sides.filter((s) => ["N", "S", "E", "W"].includes(s)) : [];
    out.open = { sides: [...new Set(sides)], w: num(it.open.w, 0.3, 20, 3.5) };
  }
  return out;
}

function cleanArea(a) {
  if (!a || typeof a !== "object") return null;
  if (!ID_RE.test(String(a.id || ""))) return null;
  if (!AREA_KEYS.includes(a.key)) return null;
  const adj = Array.isArray(a.adjacency) ? a.adjacency.filter((k) => AREA_KEYS.includes(k) && k !== a.key) : [];
  const subcats = Array.isArray(a.subcats) ? a.subcats.map((s) => str(s, 90).trim()).filter(Boolean).slice(0, 40) : [];
  const groups = Array.isArray(a.groups)
    ? a.groups
        .map((g) => ({ label: str(g?.label, 40).trim(), share: num(g?.share, 0.05, 1, 0.33) }))
        .filter((g) => g.label)
        .slice(0, 6)
    : [];
  return {
    id: a.id,
    key: a.key,
    name: str(a.name, 60).trim(),
    x: num(a.x, -300, 500, 0),
    y: num(a.y, -300, 500, 0),
    w: num(a.w, 1, 200, 10),
    d: num(a.d, 1, 200, 10),
    rot: rot(a.rot),
    color: HEX_RE.test(a.color || "") ? a.color : undefined,
    status: Object.hasOwn(STATUSES, a.status) ? a.status : "proposed",
    confidence: Object.hasOwn(CONFIDENCE, a.confidence) ? a.confidence : "medium",
    source: str(a.source, 160),
    note: str(a.note, 1000),
    entry: Object.hasOwn(ENTRY_ANCHORS, a.entry) ? a.entry : "none",
    placement: Object.hasOwn(PLACEMENTS, a.placement) ? a.placement : "showroom",
    adjacency: [...new Set(adj)].slice(0, 9),
    subcats,
    groups,
  };
}

/** Validates and whitelists a build's data blob. Throws HttpError(400) if unusable. */
export function sanitizeBuildData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "Build data is missing.");
  const items = Array.isArray(data.items) ? data.items : [];
  const areas = Array.isArray(data.areas) ? data.areas : [];
  if (items.length > 800) throw new HttpError(400, "That build has too many fixtures (800 max).");
  if (areas.length > 60) throw new HttpError(400, "That build has too many area blocks (60 max).");
  const seen = new Set();
  const cleanItems = [];
  for (const it of items) {
    const c = cleanItem(it);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      cleanItems.push(c);
    }
  }
  const cleanAreas = [];
  for (const a of areas) {
    const c = cleanArea(a);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      cleanAreas.push(c);
    }
  }
  return {
    v: 1,
    baseVersion: str(data.baseVersion, 40),
    notes: str(data.notes, 4000),
    items: cleanItems,
    areas: cleanAreas,
  };
}

export function cleanBuildName(input) {
  const s = String(input ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return s || null;
}

export function cleanNote(input, max = 1000) {
  return String(input ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function requireId(v) {
  if (typeof v !== "string" || !ID_RE.test(v)) throw new HttpError(404, "Not found.");
  return v;
}
