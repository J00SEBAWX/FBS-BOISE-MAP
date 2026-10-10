/* Proposals and the Review dashboard (OWNER RULES v3.1 rule 7): the pure pieces. No DOM, no fetch; ui/proposals.js
 * (the member's "Submit for review" chip) and ui/review.js (the admin's Review mode) own the elements, and the
 * server (docs/API.md Proposals) enforces every rule again. */

/** What each proposal status looks like: the chip's words, icon and tone (the CSS class). */
export const STATUS_INFO = Object.freeze({
  submitted: Object.freeze({label: "Submitted", icon: "i-sync", cls: "info", sentence: "Waiting for the admin to review it."}),
  approved: Object.freeze({label: "Approved", icon: "i-check", cls: "ok", sentence: "The admin approved it."}),
  needs_changes: Object.freeze({label: "Needs changes", icon: "i-warning", cls: "warn", sentence: "The admin asked for changes."}),
  declined: Object.freeze({label: "Declined", icon: "i-error", cls: "err", sentence: "The admin declined it."}),
  withdrawn: Object.freeze({label: "Withdrawn", icon: "i-close", cls: "muted", sentence: "It was withdrawn."}),
});
export const statusInfo = s => STATUS_INFO[s] || STATUS_INFO.withdrawn;

/** The Review list's status filters, in order. "open" (the default) = submitted. */
export const FILTERS = Object.freeze([
  Object.freeze({key: "open", label: "Open"}),
  Object.freeze({key: "all", label: "All"}),
  Object.freeze({key: "approved", label: "Approved"}),
  Object.freeze({key: "needs_changes", label: "Needs changes"}),
  Object.freeze({key: "declined", label: "Declined"}),
  Object.freeze({key: "withdrawn", label: "Withdrawn"}),
]);
export function filterProposals(list, filter) {
  const all = Array.isArray(list) ? list : [];
  if (filter === "all" || !filter) return all;
  if (filter === "open") return all.filter(p => p.status === "submitted");
  return all.filter(p => p.status === filter);
}

/**
 * The proposal the open map's chip talks about: its open proposal, else its newest decided one (withdrawn ones
 * stay out of the way). proposals = the person's own list from GET /api/proposals.
 */
export function proposalFor(mapId, proposals) {
  const mine = (Array.isArray(proposals) ? proposals : []).filter(p => p.mapId === mapId && p.status !== "withdrawn");
  if (!mine.length) return null;
  const open = mine.find(p => p.status === "submitted");
  return open || mine.reduce((a, b) => ((b.decidedAt || b.createdAt || 0) > (a.decidedAt || a.createdAt || 0) ? b : a));
}

/**
 * The header chip for the open map: {label, icon, cls, open} or null when there is nothing to show and nothing
 * to submit. A map of your own with no proposal gets the quiet "Submit for review" affordance.
 */
export function chipFor({mine, master}, proposal) {
  if (master || !mine) return null;
  if (!proposal) return {label: "Submit for review", icon: "i-review", cls: "none", open: false};
  const s = statusInfo(proposal.status);
  return {label: s.label, icon: s.icon, cls: s.cls, open: proposal.status === "submitted"};
}

/** One proposal row's two lines for a list: {title, meta} ("Dana · Paint wall idea", "Submitted · 2 h ago · 311 items"). */
export function proposalLines(p, relTime, {withOwner = true} = {}) {
  const name = p.mapName || "Map deleted";
  const title = withOwner && p.ownerName ? `${p.ownerName} · ${name}` : name;
  const s = statusInfo(p.status);
  const when = p.status === "submitted" ? p.createdAt : p.decidedAt || p.createdAt;
  const meta = [s.label, relTime ? relTime(when) : "", p.itemCount != null ? `${p.itemCount} items` : ""].filter(Boolean).join(" · ");
  return {title, meta};
}

/** The sentence under a decided proposal: who decided and what they said. */
export function decisionLine(p, relTime) {
  if (!p || p.status === "submitted" || !p.decidedAt) return "";
  const s = statusInfo(p.status);
  const who = p.decidedByName ? ` by ${p.decidedByName}` : "";
  const when = relTime ? relTime(p.decidedAt) : "";
  return `${s.label}${who}${when ? ` · ${when}` : ""}${p.status === "approved" && p.appliedVersion ? ` · master version ${p.appliedVersion}` : ""}`;
}

/** The plain sentence for a failed submit / withdraw / decision / restore. */
export function reviewErrorText(status, message) {
  if (status === 409) return message || "This proposal changed somewhere else. Reload and try again.";
  if (status === 423) return "The master map is locked. Unlock it in the settings first.";
  if (status === 404) return "That isn't available any more.";
  if (status === 0) return "Couldn't reach the site. Check the connection and try again.";
  return message || "Something went wrong.";
}

/** One master-history row's two lines (DESIGN 6: whose map it came from, then version · who · when · note). */
export function historyLines(v, currentVersion, relTime) {
  const title = v.sourceOwnerName ? `Changes from ${v.sourceOwnerName}'s map` : (v.note || "Saved directly");
  const meta = [`Version ${v.version}`, v.createdByName || "", relTime ? relTime(v.createdAt) : "",
    v.itemCount != null ? `${v.itemCount} items` : "", v.sourceOwnerName && v.note ? `“${v.note}”` : ""].filter(Boolean).join(" · ");
  return {title, meta, current: v.version === currentVersion};
}

/** The Restore confirm (docs/DESIGN.md 6): nothing is deleted, an old master becomes a new version. */
export function restoreConfirmText(v, when) {
  return `Restore the master map to version ${v.version}${when ? ` (${when})` : ""}? This saves a new master version; nothing is deleted.`;
}

/** What the Approve button says for n ticked changes. */
export const approveLabel = n => (n > 0 ? `Approve: apply ${n} change${n === 1 ? "" : "s"}` : "Approve without changes");

/** Row keys (compare.rowKey) -> the ticked rows, dropping keys whose row is gone after a re-diff. */
export function keepChecked(checked, rows, rowKeyFn) {
  const live = new Set(rows.map(rowKeyFn));
  return new Set([...checked].filter(k => live.has(k)));
}
