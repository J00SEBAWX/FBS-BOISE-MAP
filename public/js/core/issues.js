/* Real-time collision warnings for the open map (OWNER RULES v3.1, rule 5): every department block checked
 * against walls, columns, stairs, sales desks, counters, doorway clearance and the other blocks with
 * core/collisions.js, summarised for the plan (red outlines), the 3D view and the status chip ("3 warnings").
 * Pure: no DOM. The check is cheap (well under a millisecond per block), so it runs on every change. */
import {checkAll} from "./collisions.js";

/**
 * collectIssues(doc, opts) -> {byId, ids (Set of block ids with a problem), issues, errors, warnings, count, label, markers}
 *   label: "3 warnings" / "1 warning" / "" when clean; errors count as warnings for the chip (a store manager
 *   reads them all as "fix this"); markers: one {x, y, severity, id} per issue (where the overlap is).
 */
export function collectIssues(doc, opts = {}) {
  const r = doc && Array.isArray(doc.items) && doc.items.length ? checkAll(doc, opts) : {issues: [], byId: {}, errors: 0, warnings: 0};
  const ids = new Set(Object.keys(r.byId));
  const count = r.issues.length;
  const markers = r.issues.filter(i => Array.isArray(i.at)).map(i => ({x: i.at[0], y: i.at[1], severity: i.severity, id: i.id, otherId: i.otherId, kind: i.kind}));
  return {byId: r.byId, ids, issues: r.issues, errors: r.errors, warnings: r.warnings, count, label: issueLabel(count), markers};
}

/** "3 warnings", "1 warning", "" for none. */
export function issueLabel(count) {
  if (!(count > 0)) return "";
  return `${count} warning${count === 1 ? "" : "s"}`;
}

/** The ids a problem touches (the block and what it hits), for highlighting both ends. */
export function issueIds(issue) {
  return [issue.id, issue.otherId].filter(Boolean);
}

/** The first block with a problem (errors first), or null: what the chip focuses. */
export function firstOffender(result) {
  if (!result || !result.issues.length) return null;
  const err = result.issues.find(i => i.severity === "error");
  return (err || result.issues[0]).id;
}
