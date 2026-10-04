// AJ's dashboard: approve people, hand out codes, review builds and control sharing.
// Every action here is re-checked on the server (admin-only routes); this page is just the controls.
import { api } from "/app/api.js";
import { h, $, $$, clear, fmtWhen, STATUS_LABEL, STATUS_CHIP } from "/app/h.js";
import { analyzeBuild, prepCatalog } from "/app/analysis.js";
import { diffAreas, diffItems, matchScore } from "/app/compare.js";
import { drawPlan, shortName } from "/app/plan2d.js";

const main = $("#main");
const S = { catalog: null, current: null, suggested: null, users: [], builds: [], grants: [], events: [], overview: null, buildFilter: "submitted", buildSearch: "", selBuild: null, me: null };

const ACTIONS = {
  "access.requested": "Asked for access",
  "access.retry": "Asked for access again",
  "code.requested": "Asked for a new code",
  "access.approved": "Approved",
  "access.denied": "Denied",
  "access.revoked": "Revoked access",
  "access.restored": "Restored access",
  "code.issued": "Made a sign-in code",
  login: "Signed in",
  "login.failed": "Wrong code",
  "admin.setup": "Set up the admin account",
  "admin.code.sent": "Admin code sent",
  "recovery.used": "Used a recovery code",
  "recovery.failed": "Wrong recovery code",
  "recovery.regenerated": "Made new recovery codes",
  "sessions.others_revoked": "Signed out other devices",
  logout: "Signed out",
  "build.create": "Created a build",
  "build.delete": "Deleted a build",
  "build.duplicate": "Duplicated a build",
  "build.submit": "Submitted a build",
  "build.review": "Reviewed a build",
  "share.granted": "Shared builds",
  "share.revoked": "Took back a share",
  "user.deleted": "Deleted a person",
  "alert.test": "Sent a test alert",
};

function toast(msg, kind = "") {
  const t = h("div.toast", { role: "status" }, msg);
  if (kind) t.classList.add(kind);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), 3600);
}

async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    toast(e.message || "That didn't work.", "warn");
    return null;
  }
}

// ---------- dialog ----------
const dlg = $("#dlg");
let dlgResolve = null;
function openDialog(title, body, actions = []) {
  const box = clear($("#dlg-body"));
  box.append(
    h("div.dlg-head", h("h2", title), h("button.icon-btn", { type: "button", "aria-label": "Close", onclick: () => closeDialog(null) }, "✕")),
    h("div.dlg-main", body),
    actions.length ? h("div.dlg-foot", actions) : null
  );
  if (!dlg.open) dlg.showModal();
  return new Promise((r) => (dlgResolve = r));
}
function closeDialog(v) {
  if (dlg.open) dlg.close();
  const r = dlgResolve;
  dlgResolve = null;
  r && r(v);
}
dlg.addEventListener("cancel", () => {
  const r = dlgResolve;
  dlgResolve = null;
  r && r(null);
});
function confirmBox(title, text, ok = "OK", danger = false) {
  return openDialog(title, h("p", text), [
    h("button.btn", { type: "button", onclick: () => closeDialog(false) }, "Cancel"),
    h(`button.btn.${danger ? "danger" : "primary"}`, { type: "button", onclick: () => closeDialog(true) }, ok),
  ]).then((v) => v === true);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied.");
  } catch {
    toast("Couldn't copy. Select the text instead.", "warn");
  }
}

/** Shows a fresh sign-in code once, with a one-tap text message from AJ's own phone. */
function showCode(r) {
  const smsHref = `sms:${r.phoneE164}?&body=${encodeURIComponent(r.smsBody)}`;
  return openDialog(
    `Code for ${r.firstName}`,
    h(
      "div.stack",
      h("div.code-big.num", { "aria-label": `Code ${r.code.split("").join(" ")}` }, r.code),
      h("p", `Text it to ${r.firstName} at `, h("span.phone", r.phone), `. It works once and expires ${new Date(r.expiresAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`),
      h("div.sms-preview", r.smsBody),
      h("p.muted", "This code is only shown now. If it gets lost, make a new one (the old one stops working).")
    ),
    [
      h("button.btn", { type: "button", onclick: () => copy(r.smsBody) }, "Copy message"),
      h("button.btn", { type: "button", onclick: () => copy(r.code) }, "Copy code"),
      h("a.btn.primary", { href: smsHref }, "Text it from my phone"),
    ]
  );
}

// ---------- data ----------
async function loadOverview() {
  const o = await api.get("/api/admin/overview");
  S.overview = o;
  const rq = o.pending + o.needCodes;
  const b1 = $("#b-requests"), b2 = $("#b-builds");
  b1.hidden = !rq;
  b1.textContent = String(rq);
  b2.hidden = !o.submitted;
  b2.textContent = String(o.submitted);
  return o;
}
async function loadUsers() {
  const r = await api.get("/api/admin/users");
  S.users = r.users;
  S.alerts = r.alerts;
}
async function loadBuilds() {
  const r = await api.get("/api/admin/builds?full=1");
  S.builds = r.builds;
}
async function loadGrants() {
  const r = await api.get("/api/admin/grants");
  S.grants = r.grants;
}

// ---------- requests ----------
async function renderRequests() {
  await Promise.all([loadUsers(), loadOverview()]);
  const pending = S.users.filter((u) => u.status === "pending");
  const needCode = S.users.filter((u) => u.status === "approved" && u.needsCode && u.role !== "admin");
  const card = (u, kind) =>
    h(
      "article.card",
      h("h3", u.firstName),
      h(
        "div.meta",
        h("span", u.workArea || "No area given"),
        h("span.phone", u.phone || "—"),
        h("span.muted", kind === "new" ? `Asked ${fmtWhen(u.lastRequestAt || u.createdAt)}` : `Asked for a new code ${fmtWhen(u.lastRequestAt)}`)
      ),
      h(
        "div.actions",
        kind === "new"
          ? [
              h("button.btn.primary.small", { type: "button", onclick: () => approve(u) }, "Approve & make code"),
              h("button.btn.danger.small", { type: "button", onclick: () => deny(u) }, "Deny"),
            ]
          : [h("button.btn.primary.small", { type: "button", onclick: () => makeCode(u) }, "Make a new code"), h("button.btn.small", { type: "button", onclick: () => revoke(u) }, "Revoke instead")]
      )
    );
  clear(main).append(
    h("div.sec-head", h("div", h("h1", "Requests"), h("p", "People who asked for access. Approving makes a 6-digit code that you text from your own phone. Nobody gets in without it."))),
    h("h2", `Waiting for approval (${pending.length})`),
    pending.length ? h("div.cards", pending.map((u) => card(u, "new"))) : h("p.empty", "No one is waiting."),
    h("h2", `Need a new sign-in code (${needCode.length})`),
    needCode.length ? h("div.cards", needCode.map((u) => card(u, "code"))) : h("p.empty", "Nobody needs a code right now.")
  );
}

async function approve(u) {
  const r = await run(() => api.post(`/api/admin/users/${u.id}/approve`, {}));
  if (!r) return;
  await showCode(r);
  route();
}
async function makeCode(u) {
  const r = await run(() => api.post(`/api/admin/users/${u.id}/code`, {}));
  if (!r) return;
  await showCode(r);
  route();
}
async function deny(u) {
  if (!(await confirmBox(`Deny ${u.firstName}?`, "They won't get a code and can't sign in. If you change your mind, restore them from the Team tab.", "Deny", true))) return;
  await run(() => api.post(`/api/admin/users/${u.id}/deny`, {}), "Denied.");
  route();
}
async function revoke(u) {
  if (!(await confirmBox(`Revoke ${u.firstName}'s access?`, "They're signed out everywhere right now, their codes stop working, and any builds you shared with them are hidden again. Their own builds stay saved.", "Revoke", true))) return;
  await run(() => api.post(`/api/admin/users/${u.id}/revoke`, {}), "Access revoked.");
  route();
}
async function restore(u) {
  await run(() => api.post(`/api/admin/users/${u.id}/restore`, {}), "Restored. Make them a new code to sign in.");
  route();
}
async function removeUser(u) {
  if (!(await confirmBox(`Delete ${u.firstName} for good?`, `This deletes ${u.firstName}'s profile, all of their builds and every share involving them. It can't be undone.`, "Delete everything", true))) return;
  await run(() => api.del(`/api/admin/users/${u.id}`), "Deleted.");
  route();
}

// ---------- team ----------
async function renderTeam() {
  await loadUsers();
  const rows = S.users.map((u) => {
    const st = u.role === "admin" ? "admin" : u.status;
    const chip = { admin: "signal", approved: "ok", pending: "warn", revoked: "bad", denied: "bad" }[st] || "";
    let actions = [];
    if (u.role !== "admin") {
      if (u.status === "approved") actions = [h("button.btn.small", { type: "button", onclick: () => makeCode(u) }, "New code"), h("button.btn.small.danger", { type: "button", onclick: () => revoke(u) }, "Revoke")];
      else if (u.status === "pending") actions = [h("button.btn.small.primary", { type: "button", onclick: () => approve(u) }, "Approve"), h("button.btn.small.danger", { type: "button", onclick: () => deny(u) }, "Deny")];
      else actions = [h("button.btn.small", { type: "button", onclick: () => restore(u) }, "Restore"), h("button.btn.small.danger", { type: "button", onclick: () => removeUser(u) }, "Delete")];
    }
    return h(
      "tr",
      h("td", h("strong", u.firstName), h("div.muted", u.workArea || "")),
      h("td", h(`span.chip.${chip}`, st === "admin" ? "You (admin)" : st[0].toUpperCase() + st.slice(1))),
      h("td", h("span.phone", u.phone || "—")),
      h("td", u.lastLoginAt ? fmtWhen(u.lastLoginAt) : h("span.muted", "Never")),
      h("td.num", String(u.builds ?? 0)),
      h("td.num", String(u.activeSessions ?? 0)),
      h("td", h("div.row-actions", actions))
    );
  });
  clear(main).append(
    h("div.sec-head", h("div", h("h1", "Team"), h("p", "Everyone who has asked for access. Revoking signs a person out everywhere at once."))),
    h(
      "div.tbl-wrap",
      h(
        "table",
        h("thead", h("tr", h("th", "Person"), h("th", "Access"), h("th", "Phone"), h("th", "Last sign-in"), h("th.num", "Builds"), h("th.num", "Signed in"), h("th", ""))),
        h("tbody", rows.length ? rows : h("tr", h("td", { colspan: "7" }, "No one yet.")))
      )
    )
  );
}

// ---------- builds ----------
function buildStats(b) {
  if (!b.data) return null;
  const rep = analyzeBuild(b.data, S.catalog);
  const fx = diffItems(S.current.items || [], b.data.items || []);
  const order = S.catalog.areas.map((a) => a.key);
  const vsSug = diffAreas((S.suggested.areas || []).map((a, i) => ({ ...a, id: "s" + i })), b.data.areas || [], order);
  return { rep, fx, match: matchScore(vsSug) };
}

async function renderBuilds() {
  await Promise.all([loadBuilds(), loadUsers(), loadOverview()]);
  const counts = {};
  for (const b of S.builds) counts[b.status] = (counts[b.status] || 0) + 1;
  const filters = [["submitted", "Submitted"], ["needs_changes", "Needs changes"], ["reviewed", "Reviewed"], ["draft", "Drafts"], ["all", "All"]];
  const search = h("input.input", { type: "search", placeholder: "Search builds or people", value: S.buildSearch, "aria-label": "Search builds" });
  search.addEventListener("input", () => {
    S.buildSearch = search.value;
    renderBuildTable();
  });
  const tableHost = h("div");
  const detailHost = h("div");
  function renderBuildTable() {
    const q2 = S.buildSearch.toLowerCase();
    const rows = S.builds
      .filter((b) => (S.buildFilter === "all" || b.status === S.buildFilter) && (!q2 || b.name.toLowerCase().includes(q2) || (b.ownerName || "").toLowerCase().includes(q2)))
      .map((b) => {
        const st = buildStats(b);
        const tr = h(
          `tr.clickable${S.selBuild === b.id ? ".sel" : ""}`,
          { tabindex: "0", onclick: () => select(b.id), onkeydown: (e) => e.key === "Enter" && select(b.id) },
          h("td", h("strong", b.name), b.submitNote ? h("div.muted", `“${b.submitNote.slice(0, 80)}${b.submitNote.length > 80 ? "…" : ""}”`) : null),
          h("td", b.ownerName || "", h("div.muted", b.ownerArea || "")),
          h("td", h(`span.chip.${STATUS_CHIP[b.status] || ""}`, STATUS_LABEL[b.status] || b.status)),
          h("td.num", st ? `${st.rep.progress.placed}/${st.rep.progress.total}` : "—"),
          h("td.num", st ? h("span", { class: st.rep.progress.collisions ? "bad" : "ok" }, String(st.rep.progress.collisions)) : "—"),
          h("td.num", st ? `${Math.round(st.match * 100)}%` : "—"),
          h("td", fmtWhen(b.submittedAt || b.updatedAt))
        );
        return tr;
      });
    clear(tableHost).append(
      h(
        "div.tbl-wrap",
        h(
          "table",
          h("thead", h("tr", h("th", "Build"), h("th", "By"), h("th", "Status"), h("th.num", "Set"), h("th.num", "Conflicts"), h("th.num", "Matches mine"), h("th", "When"))),
          h("tbody", rows.length ? rows : h("tr", h("td", { colspan: "7" }, "Nothing here.")))
        )
      )
    );
  }
  function select(id) {
    S.selBuild = id;
    renderBuildTable();
    renderDetail(detailHost, S.builds.find((b) => b.id === id));
    detailHost.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  clear(main).append(
    h(
      "div.sec-head",
      h("div", h("h1", "Builds"), h("p", "Every build saved by the team. Click one to see its plan, check each department and leave a review.")),
      h(
        "div.row-actions",
        h("button.btn.small", { type: "button", onclick: () => exportCsv(S.builds) }, "Export all (CSV)"),
        h("button.btn.small", { type: "button", onclick: () => printReports(S.builds.filter((b) => b.status === "submitted" || b.status === "reviewed" || b.status === "needs_changes")) }, "Print review packet")
      )
    ),
    h(
      "div.filters",
      filters.map(([k, label]) =>
        h(
          "button.chip",
          { type: "button", "aria-pressed": String(S.buildFilter === k), onclick: () => ((S.buildFilter = k), renderBuilds()) },
          `${label}${k === "all" ? ` (${S.builds.length})` : counts[k] ? ` (${counts[k]})` : ""}`
        )
      ),
      search
    ),
    tableHost,
    detailHost
  );
  renderBuildTable();
  if (S.selBuild && S.builds.some((b) => b.id === S.selBuild)) renderDetail(detailHost, S.builds.find((b) => b.id === S.selBuild));
}

function planCanvas(b, theme) {
  const c = h("canvas.plan-canvas", { role: "img", "aria-label": `Plan of ${b.name}` });
  requestAnimationFrame(() => {
    const w = c.clientWidth || 640, hgt = c.clientHeight || 320;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(hgt * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlan(g, { items: b.data.items || [], areas: b.data.areas || [], catalog: S.catalog, width: w, height: hgt, theme, labels: true, pad: 8 });
  });
  return c;
}

function areaRows(b, rep) {
  const byKey = Object.fromEntries(S.catalog.areas.map((a) => [a.key, a]));
  return S.catalog.areas.map((c) => {
    const blocks = (b.data.areas || []).filter((a) => a.key === c.key);
    if (!blocks.length) return h("tr", h("td", c.name), h("td", { colspan: "6" }, h("span.muted", "Not placed")));
    const a = blocks[0];
    const r = rep.results.get(a.id);
    const adj = r.adjacency[0];
    const mark = (ok) => h("span", { class: ok ? "ok" : "warn" }, ok ? "✓" : "!");
    return h(
      "tr",
      h("td", h("strong", a.name || c.name), blocks.length > 1 ? h("div.muted", `${blocks.length} blocks`) : null, a.note ? h("div.muted", a.note.slice(0, 120)) : null),
      h("td.num", Math.round(r.size.total).toLocaleString("en-US")),
      h("td", (S.catalog.statuses || {})[a.status] || a.status),
      h("td", mark(r.placement.ok), " ", (S.catalog.placements || {})[r.placement.pref]?.split(" (")[0] || r.placement.pref),
      h("td", r.entry.dist === null ? h("span.muted", "—") : [mark(r.entry.ok), ` ${Math.round(r.entry.dist)} ft`]),
      h("td", adj ? (adj.placed ? [mark(adj.ok), ` ${byKey[adj.key]?.name || adj.key} · ${Math.round(adj.dist)} ft`] : h("span.muted", `${byKey[adj.key]?.name || adj.key} not placed`)) : "—"),
      h("td", r.collisions.length ? h("span.bad", r.collisions.map((x) => x.label).join("; ")) : h("span.ok", "None"))
    );
  });
}

function renderDetail(host, b) {
  if (!b) return clear(host);
  if (!b.data) return clear(host).append(h("p.empty", "This build's data couldn't be read."));
  const st = buildStats(b);
  const rep = st.rep;
  const theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const note = h("textarea.input", { rows: "3", maxlength: "2000", placeholder: "Feedback for the builder (they see it on their build)" });
  note.value = b.reviewNote || "";
  const review = async (status) => {
    const r = await run(() => api.post(`/api/admin/builds/${b.id}/review`, { status, note: note.value }), status === "reviewed" ? "Marked reviewed." : "Sent back for changes.");
    if (r) {
      b.status = r.status;
      b.reviewNote = note.value;
      route();
    }
  };
  const viewers = S.users.filter((u) => u.status === "approved" && u.id !== b.ownerId && u.role !== "admin");
  const viewerSel = h("select.input", { "aria-label": "Share with" }, h("option", { value: "" }, "Pick a person"), viewers.map((u) => h("option", { value: u.id }, `${u.firstName} · ${u.workArea || ""}`)));
  const legend = h(
    "div.legend",
    S.catalog.areas.map((c) => {
      const i = h("i");
      i.style.background = c.color;
      return h("span", i, shortName({ key: c.key }, c.name));
    })
  );
  clear(host).append(
    h(
      "div.detail",
      h(
        "section.card",
        h("div.sec-head", h("div", h("h2", b.name), h("p", `${b.ownerName} · ${b.ownerArea || ""} · updated ${fmtWhen(b.updatedAt)}`)), h(`span.chip.${STATUS_CHIP[b.status] || ""}`, STATUS_LABEL[b.status] || b.status)),
        planCanvas(b, theme),
        legend,
        h(
          "div.stats",
          h("div.stat", h("strong.num", `${rep.progress.placed}/${rep.progress.total}`), h("span", "departments set")),
          h("div.stat", { class: rep.progress.collisions ? "stat hot" : "stat" }, h("strong.num", String(rep.progress.collisions)), h("span", "conflicts")),
          h("div.stat", h("strong.num", String(rep.progress.confirmed)), h("span", "confirmed")),
          h("div.stat", h("strong.num", String(st.fx.count)), h("span", "fixture changes")),
          h("div.stat", h("strong.num", `${Math.round(st.match * 100)}%`), h("span", "matches my plan"))
        )
      ),
      h(
        "section.card",
        h("h3", "Their notes"),
        b.submitNote ? h("div", h("span.eyebrow", "With the submission"), h("div.note-box", b.submitNote)) : null,
        b.data.notes ? h("div", h("span.eyebrow", "Build notes"), h("div.note-box", b.data.notes)) : null,
        !b.submitNote && !b.data.notes ? h("p.muted", "No notes.") : null,
        h("h3", "Your review"),
        note,
        h(
          "div.row-actions",
          h("button.btn.primary.small", { type: "button", onclick: () => review("reviewed") }, "Mark reviewed"),
          h("button.btn.small", { type: "button", onclick: () => review("needs_changes") }, "Ask for changes")
        ),
        h("h3", "Share this build"),
        h("p.muted", "Lets one person view this build only (read only). Take it back any time under Sharing."),
        h(
          "div.row-actions",
          viewerSel,
          h(
            "button.btn.small",
            {
              type: "button",
              onclick: async () => {
                if (!viewerSel.value) return toast("Pick a person first.", "warn");
                await run(() => api.post("/api/admin/grants", { viewerId: viewerSel.value, ownerId: b.ownerId, buildId: b.id }), "Shared.");
              },
            },
            "Share"
          )
        ),
        h("h3", "Documents"),
        h(
          "div.row-actions",
          h("a.btn.small", { href: `/app/?build=${encodeURIComponent(b.id)}` }, "Open in planner"),
          h("button.btn.small", { type: "button", onclick: () => exportJson(b) }, "Export JSON"),
          h("button.btn.small", { type: "button", onclick: () => exportCsv([b]) }, "Export CSV"),
          h("button.btn.small", { type: "button", onclick: () => printReports([b]) }, "Print report")
        )
      )
    ),
    h(
      "div.tbl-wrap",
      h(
        "table",
        h("thead", h("tr", h("th", "Department"), h("th.num", "Sq ft"), h("th", "Status"), h("th", "Placement"), h("th", "Entry"), h("th", "Main neighbor"), h("th", "Conflicts"))),
        h("tbody", areaRows(b, rep))
      )
    )
  );
}

// ---------- exports ----------
function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const safeName = (s) => String(s || "build").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "build";

function exportJson(b) {
  const out = { build: b.name, by: b.ownerName, area: b.ownerArea, status: b.status, updatedAt: new Date(b.updatedAt).toISOString(), submitNote: b.submitNote, reviewNote: b.reviewNote, data: b.data };
  download(`${safeName(b.name)}.json`, "application/json", JSON.stringify(out, null, 2));
}

/** CSV cell: quoted, with formula-looking values neutralized so spreadsheets can't run them. */
function cell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
function exportCsv(builds) {
  const head = ["build", "by", "work_area", "build_status", "department_key", "department", "sq_ft", "x_ft", "y_ft", "length_ft", "depth_ft", "rotation", "status", "placement", "placement_ok", "entry", "entry_ok", "neighbors", "groups", "subcategories", "confidence", "source", "note", "conflicts", "tips"];
  const lines = [head.map(cell).join(",")];
  for (const b of builds) {
    if (!b.data) continue;
    const rep = analyzeBuild(b.data, S.catalog);
    for (const a of b.data.areas || []) {
      const r = rep.results.get(a.id);
      lines.push(
        [
          b.name, b.ownerName, b.ownerArea, b.status, a.key, a.name, Math.round(a.w * a.d), a.x, a.y, a.w, a.d, a.rot || 0, a.status, a.placement, r.placement.ok ? "yes" : "no", a.entry,
          r.entry.dist === null ? "" : r.entry.ok ? "yes" : "no", (a.adjacency || []).join("; "), (a.groups || []).map((g) => `${g.label} ${Math.round(g.share * 100)}%`).join("; "),
          (a.subcats || []).join("; "), a.confidence, a.source, a.note, r.collisions.map((c) => c.label).join("; "), r.warnings.map((w) => w.label).join("; "),
        ]
          .map(cell)
          .join(",")
      );
    }
  }
  download(builds.length === 1 ? `${safeName(builds[0].name)}.csv` : "fbs-builds.csv", "text/csv", lines.join("\r\n"));
}

function printReports(builds) {
  const list = builds.filter((b) => b.data);
  if (!list.length) return toast("No builds to print yet.", "warn");
  const area = clear($("#print"));
  for (const b of list) {
    const rep = analyzeBuild(b.data, S.catalog);
    const c = document.createElement("canvas");
    c.width = 1690;
    c.height = 840;
    drawPlan(c.getContext("2d"), { items: b.data.items || [], areas: b.data.areas || [], catalog: S.catalog, width: 1690, height: 840, theme: "light", labels: true, pad: 16 });
    area.append(
      h(
        "section.report",
        h("h1", b.name),
        h("p", `${b.ownerName} · ${b.ownerArea || ""} · ${STATUS_LABEL[b.status] || b.status} · updated ${new Date(b.updatedAt).toLocaleDateString("en-US")}`),
        h("img", { src: c.toDataURL("image/png"), alt: `Plan of ${b.name}` }),
        h("p", `${rep.progress.placed}/${rep.progress.total} departments set · ${rep.progress.collisions} conflicts · ${rep.progress.confirmed} confirmed`),
        b.submitNote ? h("p", h("strong", "Their note: "), b.submitNote) : null,
        b.data.notes ? h("p", h("strong", "Build notes: "), b.data.notes) : null,
        b.reviewNote ? h("p", h("strong", "Review: "), b.reviewNote) : null,
        h("table", h("thead", h("tr", h("th", "Department"), h("th", "Sq ft"), h("th", "Status"), h("th", "Placement"), h("th", "Entry"), h("th", "Main neighbor"), h("th", "Conflicts"))), h("tbody", areaRows(b, rep)))
      )
    );
  }
  setTimeout(() => window.print(), 100);
}

// ---------- sharing ----------
async function renderSharing() {
  await Promise.all([loadGrants(), loadUsers(), loadBuilds()]);
  const people = S.users.filter((u) => u.status === "approved");
  const opt = (u) => h("option", { value: u.id }, `${u.firstName}${u.role === "admin" ? " (you)" : ""} · ${u.workArea || ""}`);
  const viewer = h("select.input", { "aria-label": "Viewer" }, h("option", { value: "" }, "Pick a person"), people.filter((u) => u.role !== "admin").map(opt));
  const owner = h("select.input", { "aria-label": "Whose builds" }, h("option", { value: "" }, "Pick a person"), people.map(opt));
  const scope = h("select.input", { "aria-label": "Which builds" }, h("option", { value: "" }, "All of their builds"));
  owner.addEventListener("change", () => {
    clear(scope).append(h("option", { value: "" }, "All of their builds"), S.builds.filter((b) => b.ownerId === owner.value).map((b) => h("option", { value: b.id }, `Only “${b.name}”`)));
  });
  const share = async () => {
    if (!viewer.value || !owner.value) return toast("Pick both people.", "warn");
    const r = await run(() => api.post("/api/admin/grants", { viewerId: viewer.value, ownerId: owner.value, buildId: scope.value || undefined }));
    if (r) {
      toast(r.existing ? "That share was already on." : "Shared.");
      route();
    }
  };
  const active = S.grants.filter((g) => !g.revokedAt);
  const past = S.grants.filter((g) => g.revokedAt).slice(0, 30);
  const row = (g) =>
    h(
      "tr",
      h("td", h("strong", g.viewerName), h("div.muted", g.viewerArea || "")),
      h("td", "can see"),
      h("td", h("strong", `${g.ownerName}'s`), " ", g.buildId ? `“${g.buildName || "deleted build"}”` : "builds (all)"),
      h("td", fmtWhen(g.createdAt)),
      h(
        "td",
        g.revokedAt
          ? h("span.muted", `Taken back ${fmtWhen(g.revokedAt)}`)
          : h(
              "button.btn.small.danger",
              {
                type: "button",
                onclick: async () => {
                  await run(() => api.del(`/api/admin/grants/${g.id}`), "Share taken back.");
                  route();
                },
              },
              "Take back"
            )
      )
    );
  clear(main).append(
    h("div.sec-head", h("div", h("h1", "Sharing"), h("p", "Builds are private to the person who made them. Only you can let someone see another person's builds, and taking a share back works right away."))),
    h("section.card", h("h3", "Share builds"), h("div.share-form", h("div.field", h("label", "Let"), viewer), h("div.field", h("label", "See"), owner), h("div.field", h("label", "Which"), scope), h("button.btn.primary", { type: "button", onclick: share }, "Share"))),
    h("h2", `Active shares (${active.length})`),
    active.length ? h("div.tbl-wrap", h("table", h("tbody", active.map(row)))) : h("p.empty", "Nothing is shared. Everyone only sees their own builds."),
    past.length ? h("details", h("summary", `Past shares (${past.length})`), h("div.tbl-wrap", h("table", h("tbody", past.map(row))))) : null
  );
}

// ---------- activity ----------
async function renderActivity() {
  const r = await api.get("/api/admin/audit?limit=300");
  const rows = r.events.map((e) =>
    h("tr", h("td", new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), h("td", e.actor_name || h("span.muted", "Someone signing in")), h("td", ACTIONS[e.action] || e.action), h("td", h("span.muted", e.detail || "")))
  );
  clear(main).append(
    h("div.sec-head", h("div", h("h1", "Activity"), h("p", "Sign-ins, approvals, shares and submissions, newest first. Kept for a year."))),
    h("div.tbl-wrap", h("table", h("thead", h("tr", h("th", "When"), h("th", "Who"), h("th", "What"), h("th", "Detail"))), h("tbody", rows.length ? rows : h("tr", h("td", { colspan: "4" }, "Nothing yet.")))))
  );
}

// ---------- settings ----------
async function renderSettings() {
  const o = await loadOverview();
  clear(main).append(
    h("div.sec-head", h("div", h("h1", "Settings"), h("p", "Alerts, your recovery codes and your own sign-ins."))),
    h(
      "div.stats",
      h("div.stat", h("strong.num", String(o.approved)), h("span", "people with access")),
      h("div.stat", h("strong.num", String(o.activeSessions)), h("span", "signed-in devices")),
      h("div.stat", h("strong.num", String(o.builds)), h("span", "builds saved")),
      h("div.stat", h("strong.num", String(o.activeShares)), h("span", "active shares"))
    ),
    h(
      "div.cards",
      h(
        "section.card",
        h("h3", "Push alerts"),
        h("p", o.alerts ? "Set up. You'll get a push alert for each new request, each code request and each submitted build. Alerts never include phone numbers." : "Not set up yet. Requests still show up here, but you won't get a push alert."),
        h("div.actions", h("button.btn.small", { type: "button", disabled: !o.alerts, onclick: () => run(() => api.post("/api/admin/test-alert", {}), "Test alert sent. Check your phone.") }, "Send a test alert"))
      ),
      h(
        "section.card",
        h("h3", "Recovery codes"),
        h("p", "If you can't get a code on your phone, each recovery code signs you in once. Making new ones cancels the old ones."),
        h(
          "div.actions",
          h(
            "button.btn.small",
            {
              type: "button",
              onclick: async () => {
                if (!(await confirmBox("Make new recovery codes?", "Your old recovery codes stop working right away.", "Make new codes"))) return;
                const r = await run(() => api.post("/api/admin/recovery-codes", {}));
                if (!r) return;
                const list = h("ol.codes", r.recoveryCodes.map((c) => h("li", c)));
                await openDialog("Save these somewhere private", h("div.stack", h("p", "They won't be shown again."), list), [
                  h("button.btn", { type: "button", onclick: () => copy(r.recoveryCodes.join("\n")) }, "Copy"),
                  h("button.btn.primary", { type: "button", onclick: () => closeDialog(true) }, "I saved them"),
                ]);
              },
            },
            "Make new recovery codes"
          )
        )
      ),
      h(
        "section.card",
        h("h3", "Your devices"),
        h("p", "Signs you out of the planner on every other phone or computer. This one stays signed in."),
        h("div.actions", h("button.btn.small", { type: "button", onclick: () => run(() => api.post("/api/admin/sign-out-others", {}), "Other devices signed out.") }, "Sign out other devices"))
      ),
      h(
        "section.card",
        h("h3", "How it stays private"),
        h(
          "ul",
          h("li", "Every page and file is behind sign-in, checked on the server."),
          h("li", "Phone numbers are encrypted at rest. Codes and sessions are stored only as one-way hashes."),
          h("li", "People only ever see their own builds unless you share them here."),
          h("li", "Wrong codes lock out after 5 tries, and sign-ins are rate limited.")
        )
      )
    )
  );
}

// ---------- routing ----------
const VIEWS = { requests: renderRequests, team: renderTeam, builds: renderBuilds, sharing: renderSharing, activity: renderActivity, settings: renderSettings };
async function route() {
  const tab = (location.hash || "#requests").slice(1);
  const view = VIEWS[tab] ? tab : "requests";
  for (const a of $$(".tabs a")) a.toggleAttribute("aria-current", a.dataset.tab === view), a.dataset.tab === view && a.setAttribute("aria-current", "page");
  try {
    await VIEWS[view]();
  } catch (e) {
    clear(main).append(h("p.empty", e.message || "Couldn't load this section."));
  }
}
window.addEventListener("hashchange", () => {
  route();
  main.focus({ preventScroll: true });
});
$("#logout").addEventListener("click", async () => {
  try {
    await api.post("/api/auth/logout", {});
  } catch {
    /* ignore */
  }
  location.replace("/login");
});

(async function init() {
  try {
    const boot = await api.get("/api/bootstrap");
    S.me = boot.user;
    S.catalog = prepCatalog(boot.catalog);
    S.current = boot.current || { items: [] };
    S.suggested = boot.suggested || { areas: [] };
  } catch (e) {
    clear(main).append(h("p.empty", e.message));
    return;
  }
  await route();
  setInterval(() => document.visibilityState === "visible" && loadOverview().catch(() => {}), 60000);
})();
