/* "Find a product": a product, brand or platform name -> the department (zone) it lives in, its brand
 * sub-group (Milwaukee | DeWalt | Makita inside Power Tools) and the closest subcategory, with the reason.
 *
 * Matching is tolerant: case, punctuation, plurals, run-together or split words ("pack out", "nailgun"),
 * platform names (M18, M12, FlexVolt, XGT, LXT, PACKOUT, ToughSystem, MAKPAC ...) and small typos in brand
 * names. The OWNER RULES v3.1 merchandising rules are applied before the text match:
 *   Universal rule   universal drill bits, blades, abrasives and cutting consumables -> Bits, Blades & Cutting
 *                    Accessories, whatever the brand.
 *   Power Tool rule  Milwaukee, DeWalt and Makita are distinct sub-groups of Power Tools; their batteries,
 *                    chargers and platform storage (PACKOUT, ToughSystem, MAKPAC) stay with their brand.
 *   Air tools        pneumatic nailers, staplers and compressors of every brand -> Pneumatic & Air Systems
 *                    (cordless nailers stay with their battery brand).
 *   Brand hand tools Milwaukee tapes, knives and pliers -> Hand Tools & Measuring (the intact Milwaukee panel).
 * Pure: no DOM. Uses the verified catalog (subcategories) and product map (shared/catalog.js). */
import {CATALOG, PRODUCTS, mergeCategories} from "../shared/catalog.js";

export const MAX_QUERY = 100;
export const PLATFORM_BRANDS = Object.freeze(["Milwaukee", "DeWalt", "Makita"]);

// run-together and split spellings -> one token (applied to the lower-case, punctuation-free text)
const PHRASES = [
  [/\bm (18|12)\b/g, "m$1"], [/\b(\d+) ?v(olt)?s?\b/g, "$1v"], [/\bpack ?outs?\b/g, "packout"], [/\bflex ?volts?\b/g, "flexvolt"],
  [/\btough ?systems?\b/g, "toughsystem"], [/\bt ?staks?\b/g, "tstak"], [/\bmak ?pacs?\b/g, "makpac"], [/\bde ?walts?\b/g, "dewalt"],
  [/\bred ?lithium\b/g, "redlithium"], [/\bone ?key\b/g, "onekey"], [/\bstrong ?tie\b/g, "strongtie"],
  [/\b(nail|brad|framing|finish|roofing|siding) ?guns?\b/g, "$1 nailer"], [/\bnailguns?\b/g, "nailer"], [/\bair ?guns?\b/g, "air nailer"],
  [/\bstaple ?guns?\b/g, "stapler"], [/\bsand ?paper\b/g, "sandpaper"], [/\bsanding (discs?|disks?|sheets?|pads?|belts?)\b/g, "abrasive sanding"],
  [/\b(flap|cut ?off|cutoff|grinding|abrasive) (discs?|disks?|wheels?)\b/g, "abrasive $1 wheel"], [/\bcut ?off\b/g, "cutoff"],
  [/\bhole ?saws?\b/g, "holesaw"], [/\bshop ?vacs?\b/g, "shopvac"], [/\bhard ?hats?\b/g, "hardhat"], [/\bhi(gh)? ?vis(ibility)?\b/g, "hivis"],
  [/\bfall (arrest|protection)\b/g, "harness fall"], [/\bpellet ?grills?\b/g, "pellet grill"], [/\btape ?measures?\b/g, "tape measure"],
  [/\bhardie ?blades?\b/g, "hardieblade blade"], [/\bpocket ?hole\b/g, "pockethole"], [/\bwood ?glue\b/g, "wood glue"],
];
const IRREGULAR = {knives: "knife", shelves: "shelf", leaves: "leaf", wolves: "wolf", disks: "disc", disk: "disc", grille: "grill", grilles: "grill"};
// one token -> extra tokens it implies (platform names imply their brand; storage lines imply storage)
const IMPLIES = {
  m18: ["milwaukee"], m12: ["milwaukee"], packout: ["milwaukee", "storage"], redlithium: ["milwaukee", "battery"], onekey: ["milwaukee"],
  flexvolt: ["dewalt"], toughsystem: ["dewalt", "storage"], tstak: ["dewalt", "storage"], atomic: ["dewalt"],
  lxt: ["makita"], xgt: ["makita"], makpac: ["makita", "storage", "case"], cxt: ["makita"],
  freud: ["diablo"], nailgun: ["nailer"], sandpaper: ["abrasive"], charger: ["battery"],
  strongtie: ["simpson"], hivis: ["hivis"], shopvac: ["vac"], vacuum: ["vac"], wd40: ["lubricant"],
  // everyday names for product lines the catalog lists under another word
  smoker: ["grill"], bbq: ["grill"], barbecue: ["grill"], primer: ["paint"], sawzall: ["saw", "reciprocating"], skilsaw: ["saw", "circular"],
};
const BRAND_OF = {milwaukee: "Milwaukee", dewalt: "DeWalt", makita: "Makita"};
// words that make a product a battery-platform item (Power Tool rule)
const PLATFORM = new Set(["battery", "charger", "tool", "drill", "driver", "impact", "wrench", "saw", "grinder", "sander", "storage", "organizer",
  "case", "box", "kit", "laser", "radio", "vac", "light", "blower", "rotary", "hammer", "multitool", "multi", "fuel", "cordless", "router",
  "nailer", "stapler", "trimmer", "packout", "toughsystem", "tstak", "makpac", "m18", "m12", "flexvolt", "lxt", "xgt", "cxt", "20v", "18v",
  "12v", "40v", "60v", "max", "xr", "brushless", "combo", "jobsite", "fan", "heater"]);
// universal cutting consumables (Universal rule)
const CONSUMABLE = new Set(["bit", "blade", "abrasive", "sandpaper", "holesaw", "cutoff", "wheel", "flap", "hardieblade"]);
// Milwaukee hand tools on the vendor panel (no battery)
const HAND = new Set(["tape", "measure", "knife", "plier", "screwdriver", "level", "square", "chisel", "hammer", "pry", "snip", "cutter"]);
const AIR = new Set(["air", "pneumatic", "compressor", "hose", "coupler", "fitting"]);
// cordless tool nouns: without a brand they still live in Power Tools (one of the three brand groups)
const TOOL_NOUNS = new Set(["drill", "driver", "impact", "saw", "grinder", "sander", "multitool", "rotary", "blower", "trimmer", "cordless", "brushless", "combo"]);
// platform names: they pick the brand, but the product word decides the subcategory
const SOFT = new Set(["milwaukee", "dewalt", "makita", "diablo", "m18", "m12", "flexvolt", "lxt", "xgt", "cxt", "fuel", "20v", "18v", "12v", "40v", "60v", "max", "xr"]);
const STOP = new Set(["the", "and", "for", "with", "a", "an", "of", "in", "on", "to", "where", "is", "are", "do", "we", "you", "sell", "find", "my", "i"]);
// typo-tolerant names (edit distance 1 from 5 letters, 2 from 8)
const FUZZY = ["milwaukee", "dewalt", "makita", "diablo", "penofin", "packout", "flexvolt", "toughsystem", "makpac", "simpson", "occidental",
  "rolair", "stinger", "hillman", "deckfast", "loctite", "timbertech", "compressor", "harness", "scaffold", "ladder", "sandpaper", "pellet"];

/** Lower-case, accent- and punctuation-free text with the run-together spellings joined. */
export function normalizeText(s) {
  let t = String(s ?? "").slice(0, 400).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  t = t.replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  return t.replace(/\s+/g, " ").trim();
}
/** One word -> its singular form (consistent for the query and the catalog text). */
export function stem(w) {
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
  return w;
}
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/** Text -> the search tokens (singular, typo-corrected, with implied tokens added). */
export function tokens(s, {expand = true, fuzzy = false} = {}) {
  const out = [];
  for (let w of normalizeText(s).split(" ")) {
    if (!w || STOP.has(w)) continue;
    w = stem(w);
    if (fuzzy && w.length >= 5 && !FUZZY.includes(w)) {
      const max = w.length >= 8 ? 2 : 1;
      const hit = FUZZY.find(f => editDist(w, f, max) <= max);
      if (hit) w = hit;
    }
    out.push(w);
    if (expand && IMPLIES[w]) for (const x of IMPLIES[w]) out.push(x);
  }
  return [...new Set(out)];
}

/* ---------- the index (built once per catalog + categories) ---------- */
const CACHE = new WeakMap();
function brandIn(text) {
  const t = text.toLowerCase();
  return PLATFORM_BRANDS.find(b => t.includes(b.toLowerCase())) || null;
}
/** The head word of a catalog line: the last word of its first phrase ("Grill pellets (bulk ...)" -> pellet). */
function headOf(text) {
  const first = String(text).split(/[(:,;]| and | or /)[0];
  const t = tokens(first, {expand: false});
  return t.length ? t[t.length - 1] : null;
}
function buildIndex(catalog, categories) {
  const cats = categories || mergeCategories(catalog.areas || CATALOG.areas, []);
  const byKey = new Map(cats.map(c => [c.key, c]));
  const docs = [];
  for (const c of cats) {
    docs.push({key: c.key, group: null, subcat: null, product: null, why: null, kind: "name", toks: tokens(c.name, {expand: false})});
    for (const s of c.subcats || []) {
      const group = c.key === "power_tools" ? brandIn(s) : null;
      docs.push({key: c.key, group, subcat: s, product: null, why: null, kind: "subcat", toks: tokens(s), head: headOf(s)});
    }
  }
  const products = catalog.products || (catalog === CATALOG ? PRODUCTS : catalog.PRODUCTS) || PRODUCTS;
  for (const p of products) {
    if (!p || !p.department || !byKey.has(p.department)) continue;
    docs.push({key: p.department, group: p.group || null, subcat: null, product: p.item, why: p.why, kind: p.kind,
      fixtures: Array.isArray(p.surveyIds) ? p.surveyIds.slice(0, 12) : [], toks: tokens(p.item + " " + (p.group || "")), head: headOf(p.item)});
  }
  const df = new Map();
  for (const d of docs) for (const t of d.toks) df.set(t, (df.get(t) || 0) + 1);
  const idf = t => Math.log(1 + docs.length / (df.get(t) || 0.5));
  return {cats, byKey, docs, idf, vocab: df};
}
function indexFor(catalog, categories) {
  if (categories) return buildIndex(catalog, categories);
  let ix = CACHE.get(catalog);
  if (!ix) { ix = buildIndex(catalog, null); CACHE.set(catalog, ix); }
  return ix;
}

/** How well a document's tokens match the query tokens (weighted by rarity; brand tokens count less). */
function match(doc, qt, idf, soft = SOFT) {
  let s = 0, hits = 0, hard = 0;
  for (const t of qt) {
    const w = idf(t) * (soft.has(t) ? 0.5 : 1);
    if (doc.toks.includes(t)) { s += doc.head === t ? 1.25 * w : w; hits++; if (!soft.has(t)) hard++; continue; }
    // a word that begins another ("nail" / "nailer", "compress" / "compressor") counts a little; a long word that merely
    // starts with a short one ("wheelbarrow" / "wheel") does not
    if (t.length >= 4 && doc.toks.some(d => d.length >= 4 && Math.abs(d.length - t.length) <= 3 && (d.startsWith(t) || t.startsWith(d)))) { s += 0.6 * w; hits++; if (!soft.has(t)) hard++; }
  }
  return {score: s * (0.5 + 0.5 * (hits / Math.max(1, qt.length))), hits, hard};
}
/** The best subcategory of a department (optionally of one brand group) for these tokens. */
function bestSubcat(ix, key, qt, group = null, prefer = null) {
  let best = null, bs = -1;
  for (const d of ix.docs) {
    if (d.kind !== "subcat" || d.key !== key) continue;
    if (group && d.group && d.group !== group) continue;
    if (group && !d.group && key === "power_tools" && !/platform|cordless nailers/i.test(d.subcat)) continue;
    let s = match(d, qt, ix.idf).score;
    if (prefer && prefer.test(d.subcat)) s += 100;
    if (group && d.group === group) s += 0.5;
    if (s > bs) { bs = s; best = d; }
  }
  return best ? best.subcat : null;
}

/**
 * Find a product. query: what the person typed; catalog: the catalog (CATALOG, with PRODUCTS from the
 * product map); categories: the map's merged categories (mergeCategories) when the map has custom or
 * renamed ones. -> ranked [{key, zoneName, group, subcat, product, why, rule, score, fixtures, color, hidden, custom}]
 */
export function find(query, catalog = CATALOG, categories = null, {limit = 8} = {}) {
  const q = String(query ?? "").slice(0, MAX_QUERY);
  const qt = tokens(q, {fuzzy: true});
  if (!qt.length) return [];
  const ix = indexFor(catalog || CATALOG, categories);
  const has = t => qt.includes(t);
  const brand = Object.keys(BRAND_OF).find(has);
  const brandName = brand ? BRAND_OF[brand] : null;
  // Diablo (Freud) makes only blades and bits, so the name alone is a cutting-consumable query
  const consumable = (qt.some(t => CONSUMABLE.has(t)) || has("diablo")) && !(has("knife") && !has("blade"));
  const air = qt.some(t => AIR.has(t));
  const cordless = qt.some(t => ["cordless", "battery", "m18", "m12", "flexvolt", "lxt", "xgt", "20v", "18v", "40v", "60v", "12v"].includes(t));
  const nailer = has("nailer") || has("stapler") || has("nail") && has("gun");
  const platform = qt.some(t => PLATFORM.has(t));
  const handTool = qt.some(t => HAND.has(t)) && !platform;
  const results = [];
  const add = (key, fields) => {
    if (!ix.byKey.has(key)) return;
    results.push({key, group: null, subcat: null, product: null, why: "", rule: null, score: 0, fixtures: [], ...fields});
  };

  // the merchandising rules first
  if (consumable) {
    const prefer = brandName ? new RegExp(brandName + " (bits|saw blades)", "i") : null;
    add("bits_blades", {subcat: bestSubcat(ix, "bits_blades", qt, null, prefer), rule: "universal", score: 100,
      why: `Universal rule: drill bits, saw blades, abrasives and cutting consumables of every brand${brandName ? `, ${brandName} included,` : ""} live in Bits, Blades & Cutting Accessories.`});
  } else if (brandName && (air && !cordless)) {
    add("pneumatic_air", {subcat: bestSubcat(ix, "pneumatic_air", qt), rule: "air", score: 100,
      why: `Air tools of every brand, ${brandName} included, live on the try-it wall in Pneumatic & Air Systems.`});
  } else if (brandName === "Milwaukee" && handTool && !platform) {
    add("hand_tools", {subcat: bestSubcat(ix, "hand_tools", qt, null, /milwaukee/i), rule: "brand_hand_tools", score: 100,
      why: "Milwaukee hand tools (tapes, knives, pliers) fit any job and no battery, so the Milwaukee panel sits in Hand Tools & Measuring."});
  } else if (brandName) {
    const sc = bestSubcat(ix, "power_tools", qt, brandName);
    const what = qt.some(t => ["battery", "charger", "redlithium"].includes(t)) ? "batteries and chargers"
      : qt.some(t => ["storage", "packout", "toughsystem", "tstak", "makpac", "case", "box", "organizer"].includes(t)) ? "platform storage"
      : nailer ? "cordless nailers" : "tools";
    add("power_tools", {group: brandName, subcat: sc, rule: "power_tool", score: 100,
      why: `Power Tool rule: ${brandName} is its own group inside Power Tools; ${brandName} ${what} stay with ${brandName}.`});
  } else if (qt.some(t => TOOL_NOUNS.has(t)) && !has("air") && !has("hand")) {
    add("power_tools", {subcat: null, rule: "power_tool", score: 100,
      why: "Cordless tools live in Power Tools, in the Milwaukee, DeWalt and Makita groups (each brand keeps its batteries, chargers and storage)."});
  } else if (!nailer && !air && cordless && !has("household")) {
    // batteries, chargers or a voltage with no brand named: the brand decides the group (Power Tool rule)
    add("power_tools", {subcat: null, rule: "power_tool", score: 100,
      why: "Batteries, chargers and platform storage stay with their brand inside Power Tools: Milwaukee, DeWalt or Makita. Add the brand to find the exact spot."});
  } else if (nailer || air) {
    if (!cordless) add("pneumatic_air", {subcat: bestSubcat(ix, "pneumatic_air", qt), rule: "air", score: 90,
      why: "Air nailers, staplers and compressors of every brand live in Pneumatic & Air Systems (try before you buy)."});
    if (nailer) add("power_tools", {subcat: bestSubcat(ix, "power_tools", qt, null, /cordless nailers/i), rule: "power_tool", score: cordless ? 95 : 60,
      why: "Cordless (battery) nailers stay with their battery brand in Power Tools."});
  }

  // then the text match over subcategories, the product map and department names
  for (const d of ix.docs) {
    const m = match(d, qt, ix.idf);
    if (!m.hits) continue;
    // a product line that only shares the brand name with the query says nothing about the product asked for
    if (d.kind !== "subcat" && !m.hard && qt.some(t => !SOFT.has(t))) continue;
    // the rules decide where brand-platform and consumable products go
    if (consumable && d.key !== "bits_blades") continue;
    if (brandName && !consumable && d.key === "power_tools" && d.group && d.group !== brandName) continue;
    let s = m.score * (d.kind === "subcat" ? 10 : d.kind === "name" ? 8 : 9);
    if (d.kind === "doc") s *= 0.6;
    const group = d.group || (brandName && !consumable && d.key === "power_tools" ? brandName : null);
    const fields = {group, subcat: d.subcat, product: d.product, why: d.why || "", score: s, fixtures: d.fixtures || []};
    if (!d.subcat) fields.subcat = bestSubcat(ix, d.key, qt.concat(tokens(d.product || "")), d.key === "power_tools" ? group : null);
    add(d.key, fields);
  }

  // merge duplicates (same department, group and subcategory), best score first
  const merged = new Map();
  for (const r of results) {
    const id = r.key + "|" + (r.group || "") + "|" + (r.subcat || "");
    const cur = merged.get(id);
    if (!cur) { merged.set(id, r); continue; }
    if (r.score > cur.score) { r.product = r.product || cur.product; r.why = r.why || cur.why; r.rule = r.rule || cur.rule; r.fixtures = r.fixtures.length ? r.fixtures : cur.fixtures; merged.set(id, r); }
    else { cur.product = cur.product || r.product; cur.why = cur.why || r.why; if (!cur.fixtures.length) cur.fixtures = r.fixtures; }
  }
  const out = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 30)));
  return out.map(r => {
    const c = ix.byKey.get(r.key);
    return {
      key: r.key, zoneName: c.name, group: r.group || null, subcat: r.subcat || null, product: r.product || null,
      why: r.why || `${r.subcat || r.product || "It"} is part of ${c.name}.`, rule: r.rule, score: Math.round(r.score * 10) / 10,
      fixtures: r.fixtures || [], color: c.color || null, hidden: !!c.hidden, custom: !!c.custom,
    };
  });
}
