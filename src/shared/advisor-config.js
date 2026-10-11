// Merchandising advisor settings: thresholds, labelled margin-tier assumptions per department, department roles
// and which retail-flow rules run (with their weight in the overall score).
// Pure ES module (imports only ./catalog.js). GET /api/advisor-config serves the saved config (or these defaults);
// PUT /api/advisor-config (admin) stores one after validateAdvisorConfig. The browser loads the identical
// public/js/shared/advisor-config.js. The two files must stay byte-identical.
import { CATALOG, DEFAULT_KEYS } from "./catalog.js";

export const ADVISOR_CONFIG_MAX_BYTES = 16 * 1024;

/** The advisor's rules (OWNER RULES v3.1, rule 6). label/why are fixed text; the config only holds enabled + weight. */
export const ADVISOR_RULES = Object.freeze([
  { key: "decompression", label: "Decompression zone", why: "Shoppers need a few open feet inside the front door to slow down and look before they choose a direction." },
  { key: "power_wall", label: "Right-hand bias / power wall", why: "Most shoppers turn right after the entrance; the wall on the right is the most-seen wall in the store." },
  { key: "destination_back", label: "Destination departments at the back", why: "Departments people come in for (Hardware & Fasteners) pull traffic past everything else when they sit toward the back." },
  { key: "sightlines", label: "High-margin and theft-prone in sight", why: "High-margin and theft-prone departments should be visible from the sales desks and the entrance." },
  { key: "bulky_near_yard", label: "Bulky goods near the yard", why: "Heavy, bulky stock (access equipment, decking, pellets) belongs near the yard and warehouse doors." },
  { key: "adjacency", label: "Related departments together", why: "Departments shopped together (Bits & Blades next to Power Tools, Paint next to Decking) should be neighbours." },
  { key: "aisle_widths", label: "Aisle widths", why: "Aisles of at least 4 ft, main aisles of at least 6 ft and never under the 36-inch ADA minimum." },
  { key: "choke_points", label: "Choke points", why: "Narrow spots on the main paths between the front door, the sales desks, will-call and the yard doors slow everyone down." },
  { key: "door_clearance", label: "Doorway and exit clearance", why: "Doors, openings and exits must stay clear." },
  { key: "cold_corners", label: "Dead and cold corners", why: "Corners far from the main paths get little traffic; put destination or impulse departments there, not high-margin ones." },
  { key: "size_vs_target", label: "Size vs target", why: "Each department block should be close to its target square footage." },
]);
const RULE_KEYS = ADVISOR_RULES.map((r) => r.key);

/** Thresholds (feet or percent): [default, min, max, label]. */
export const ADVISOR_THRESHOLDS = Object.freeze({
  nearFt: [CATALOG.thresholds.nearFt, 1, 100, "Counts as next to (adjacency), ft"],
  anchorFt: [CATALOG.thresholds.anchorFt, 1, 100, "Counts as near an entrance or desk, ft"],
  perimeterFt: [CATALOG.thresholds.perimeterFt, 1, 50, "Counts as along a wall, ft"],
  aisleMinFt: [4, 2, 20, "Minimum aisle width, ft"],
  mainAisleMinFt: [6, 3, 30, "Minimum main aisle width, ft"],
  adaMinFt: [3, 2.5, 10, "ADA minimum passage, ft (36 in)"],
  decompressionFt: [10, 0, 40, "Open zone inside the front door, ft"],
  doorClearanceFt: [4, 0, 20, "Clearance in front of doors and openings, ft"],
  sightlineFt: [60, 5, 200, "How far staff can watch from a desk, ft"],
  sizeTolerancePct: [15, 0, 100, "Allowed difference from the target size, %"],
});

export const MARGIN_TIERS = Object.freeze(["high", "medium", "low"]);
const HIGH = new Set(["power_tools", "bits_blades", "hand_tools"]);

/** The defaults. Margin tiers are assumptions (owner rule 6 names Power Tools, Bits & Blades and Hand Tools). */
export function defaultAdvisorConfig() {
  const thresholds = {};
  for (const [k, v] of Object.entries(ADVISOR_THRESHOLDS)) thresholds[k] = v[0];
  const departments = {};
  for (const key of DEFAULT_KEYS) {
    departments[key] = { margin: HIGH.has(key) ? "high" : "medium", theftProne: HIGH.has(key), assumption: true };
  }
  const rules = {};
  for (const k of RULE_KEYS) rules[k] = { enabled: true, weight: 1 };
  return {
    version: 1,
    thresholds,
    departments,
    roles: {
      destination: ["hardware_fasteners"],
      bulky: ["access_jobsite", "decking_outdoor"],
      powerWall: ["power_tools"],
    },
    rules,
    note: "Margin tiers and theft-prone flags are assumptions (owner rule 6), not store data. Change them to match the store.",
  };
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const KEY_RE = /^(?:[a-z0-9_]{1,32})$/;
const ROLE_KEYS = ["destination", "bulky", "powerWall"];

/**
 * A config from the client -> {ok: true, config} (complete: missing parts come from the defaults, unknown
 * fields dropped) | {ok: false, error, field}.
 */
export function validateAdvisorConfig(raw) {
  const bad = (error, field) => ({ ok: false, error, field });
  if (!isObj(raw)) return bad("The advisor settings must be an object.", "config");
  const cfg = defaultAdvisorConfig();
  if (raw.thresholds !== undefined) {
    if (!isObj(raw.thresholds)) return bad("thresholds must be an object.", "thresholds");
    for (const [k, [, min, max]] of Object.entries(ADVISOR_THRESHOLDS)) {
      if (raw.thresholds[k] === undefined) continue;
      const v = raw.thresholds[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return bad(`thresholds.${k} must be between ${min} and ${max}.`, `thresholds.${k}`);
      cfg.thresholds[k] = Math.round(v * 100) / 100;
    }
  }
  if (raw.departments !== undefined) {
    if (!isObj(raw.departments)) return bad("departments must be an object.", "departments");
    const keys = Object.keys(raw.departments);
    if (keys.length > 50) return bad("Too many departments.", "departments");
    for (const k of keys) {
      if (!KEY_RE.test(k) || !(DEFAULT_KEYS.includes(k) || /^c_/.test(k))) return bad("departments names an unknown department.", "departments");
      const d = raw.departments[k];
      if (!isObj(d)) return bad(`departments.${k} must be an object.`, `departments.${k}`);
      const cur = cfg.departments[k] || { margin: "medium", theftProne: false, assumption: true };
      if (d.margin !== undefined) {
        if (!MARGIN_TIERS.includes(d.margin)) return bad("A margin tier must be high, medium or low.", `departments.${k}.margin`);
        cur.margin = d.margin;
      }
      for (const b of ["theftProne", "assumption"]) {
        if (d[b] === undefined) continue;
        if (typeof d[b] !== "boolean") return bad(`departments.${k}.${b} must be true or false.`, `departments.${k}.${b}`);
        cur[b] = d[b];
      }
      cfg.departments[k] = cur;
    }
  }
  if (raw.roles !== undefined) {
    if (!isObj(raw.roles)) return bad("roles must be an object.", "roles");
    for (const r of ROLE_KEYS) {
      if (raw.roles[r] === undefined) continue;
      const list = raw.roles[r];
      if (!Array.isArray(list) || list.length > 20 || !list.every((k) => typeof k === "string" && KEY_RE.test(k) && (DEFAULT_KEYS.includes(k) || /^c_/.test(k)))) {
        return bad(`roles.${r} must list department keys.`, `roles.${r}`);
      }
      cfg.roles[r] = [...new Set(list)];
    }
  }
  if (raw.rules !== undefined) {
    if (!isObj(raw.rules)) return bad("rules must be an object.", "rules");
    for (const k of RULE_KEYS) {
      const r = raw.rules[k];
      if (r === undefined) continue;
      if (!isObj(r)) return bad(`rules.${k} must be an object.`, `rules.${k}`);
      if (r.enabled !== undefined) {
        if (typeof r.enabled !== "boolean") return bad(`rules.${k}.enabled must be true or false.`, `rules.${k}.enabled`);
        cfg.rules[k].enabled = r.enabled;
      }
      if (r.weight !== undefined) {
        if (typeof r.weight !== "number" || !Number.isFinite(r.weight) || r.weight < 0 || r.weight > 5) return bad(`rules.${k}.weight must be between 0 and 5.`, `rules.${k}.weight`);
        cfg.rules[k].weight = Math.round(r.weight * 100) / 100;
      }
    }
  }
  if (raw.note !== undefined) {
    if (typeof raw.note !== "string") return bad("note must be text.", "note");
    const s = raw.note.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩﻿]/g, "").trim();
    if ([...s].length > 500) return bad("note must be at most 500 characters.", "note");
    cfg.note = s;
  }
  return { ok: true, config: cfg };
}
