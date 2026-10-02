// Builds: every read and write checks ownership or an active admin-granted share on the server.
import { HttpError, json, readJson } from "../lib/http.js";
import { audit } from "../lib/ratelimit.js";
import { notifyAdmin } from "../lib/notify.js";
import { sanitizeBuildData, cleanBuildName, cleanNote, requireId } from "../lib/validate.js";
import { newId } from "../lib/crypto.js";
import { publicUser } from "../lib/auth.js";
import { AREAS, AREA_BY_KEY, FAMILIES, ENTRY_ANCHORS, PLACEMENTS, STATUSES, CONFIDENCE, NEAR_FT, ANCHOR_FT, PERIMETER_FT } from "../shared/catalog.js";

const MAX_BUILDS = 30;
const MAX_BODY = 700 * 1024;

const SUMMARY_COLS = "b.id, b.name, b.status, b.version, b.created_at, b.updated_at, b.submitted_at, b.reviewed_at, b.submit_note, b.review_note, b.owner_id";

export function summary(r) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    submitNote: r.submit_note || "",
    reviewNote: r.review_note || "",
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    ownerArea: r.owner_area,
  };
}

export async function listOwn(env, user) {
  const { results } = await env.DB.prepare(`SELECT ${SUMMARY_COLS} FROM builds b WHERE b.owner_id = ?1 ORDER BY b.updated_at DESC`).bind(user.id).all();
  return results.map(summary);
}

export async function listShared(env, user) {
  const { results } = await env.DB.prepare(
    `SELECT ${SUMMARY_COLS}, u.first_name AS owner_name, u.work_area AS owner_area
       FROM builds b JOIN users u ON u.id = b.owner_id
      WHERE b.owner_id != ?1
        AND EXISTS (SELECT 1 FROM grants g
                     WHERE g.viewer_id = ?1 AND g.revoked_at IS NULL AND g.owner_id = b.owner_id
                       AND (g.build_id IS NULL OR g.build_id = b.id))
      ORDER BY b.updated_at DESC`
  )
    .bind(user.id)
    .all();
  return results.map(summary);
}

/** Loads a build the user may see. Anything else is a plain 404 so ids leak nothing. */
export async function loadVisibleBuild(env, user, id) {
  requireId(id);
  const b = await env.DB.prepare(
    `SELECT b.*, u.first_name AS owner_name, u.work_area AS owner_area FROM builds b JOIN users u ON u.id = b.owner_id WHERE b.id = ?1`
  )
    .bind(id)
    .first();
  if (!b) throw new HttpError(404, "Not found.");
  if (b.owner_id === user.id || user.role === "admin") return b;
  const g = await env.DB.prepare(
    "SELECT 1 FROM grants WHERE viewer_id = ?1 AND owner_id = ?2 AND revoked_at IS NULL AND (build_id IS NULL OR build_id = ?3) LIMIT 1"
  )
    .bind(user.id, b.owner_id, b.id)
    .first();
  if (!g) throw new HttpError(404, "Not found.");
  return b;
}

async function readLayouts(env) {
  const { results } = await env.DB.prepare("SELECT id, data, updated_at FROM layouts WHERE id IN ('current', 'suggested')").all();
  const by = Object.fromEntries(results.map((r) => [r.id, r]));
  const parse = (r, fallback) => {
    try {
      return r ? JSON.parse(r.data) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    current: parse(by.current, { version: "none", items: [] }),
    suggested: parse(by.suggested, { version: "none", areas: [] }),
  };
}

export function catalogPayload() {
  return { areas: AREAS, families: FAMILIES, entryAnchors: ENTRY_ANCHORS, placements: PLACEMENTS, statuses: STATUSES, confidence: CONFIDENCE, nearFt: NEAR_FT, anchorFt: ANCHOR_FT, perimeterFt: PERIMETER_FT };
}

export async function bootstrap(env, user) {
  const [layouts, builds, shared] = await Promise.all([readLayouts(env), listOwn(env, user), listShared(env, user)]);
  return json({ user: publicUser(user), catalog: catalogPayload(), current: layouts.current, suggested: layouts.suggested, builds, shared });
}

function areaFromCatalog(key, x, y, w, d, extra = {}) {
  const c = AREA_BY_KEY[key];
  return {
    id: newId("a_"),
    key,
    name: c.name,
    x, y, w, d,
    rot: 0,
    status: "proposed",
    confidence: c.confidence,
    source: c.source,
    note: c.note,
    entry: c.entry,
    placement: c.placement,
    adjacency: [...c.adjacency],
    subcats: [...c.subcats],
    groups: (c.groups || []).map((g) => ({ ...g })),
    ...extra,
  };
}

export async function createBuild(request, env, user) {
  const body = await readJson(request, MAX_BODY);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM builds WHERE owner_id = ?1").bind(user.id).first();
  if (n >= MAX_BUILDS) throw new HttpError(400, `You can keep up to ${MAX_BUILDS} builds. Delete one to make room.`);
  const name = cleanBuildName(body.name) || "My build";
  let data;
  if (body.data) {
    data = sanitizeBuildData(body.data);
  } else {
    const { current, suggested } = await readLayouts(env);
    const areas =
      body.from === "suggested"
        ? (suggested.areas || []).filter((a) => AREA_BY_KEY[a.key]).map((a) => areaFromCatalog(a.key, a.x, a.y, a.w, a.d, { rot: a.rot || 0, groups: a.groups || AREA_BY_KEY[a.key].groups || [] }))
        : [];
    data = sanitizeBuildData({ items: current.items || [], areas, notes: "", baseVersion: current.version || "" });
  }
  const id = newId("b_");
  const now = Date.now();
  await env.DB.prepare("INSERT INTO builds (id, owner_id, name, data, status, version, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'draft', 1, ?5, ?5)")
    .bind(id, user.id, name, JSON.stringify(data), now)
    .run();
  await audit(env.DB, user.id, "build.create", id);
  return json(
    { build: { id, name, status: "draft", version: 1, createdAt: now, updatedAt: now, ownerId: user.id, ownerName: user.first_name, canEdit: true, data } },
    201
  );
}

export async function getBuild(env, user, id) {
  const b = await loadVisibleBuild(env, user, id);
  return json({ build: { ...summary(b), canEdit: b.owner_id === user.id, data: JSON.parse(b.data) } });
}

export async function updateBuild(request, env, user, id) {
  requireId(id);
  const body = await readJson(request, MAX_BODY);
  const b = await env.DB.prepare("SELECT * FROM builds WHERE id = ?1").bind(id).first();
  if (!b || b.owner_id !== user.id) throw new HttpError(404, "Not found.");
  if (typeof body.version !== "number" || body.version !== b.version) {
    throw new HttpError(409, "This build was changed in another window. Loading the latest copy.", { version: b.version });
  }
  const name = body.name !== undefined ? cleanBuildName(body.name) || b.name : b.name;
  const data = body.data !== undefined ? JSON.stringify(sanitizeBuildData(body.data)) : b.data;
  const status = body.data !== undefined && b.status !== "draft" ? "draft" : b.status;
  const now = Date.now();
  const res = await env.DB.prepare("UPDATE builds SET name = ?1, data = ?2, status = ?3, version = version + 1, updated_at = ?4 WHERE id = ?5 AND version = ?6")
    .bind(name, data, status, now, id, b.version)
    .run();
  if (!res.meta || res.meta.changes !== 1) throw new HttpError(409, "This build was changed in another window. Loading the latest copy.", { version: b.version + 1 });
  return json({ ok: true, version: b.version + 1, status, name, updatedAt: now });
}

export async function deleteBuild(env, user, id) {
  requireId(id);
  const b = await env.DB.prepare("SELECT id, owner_id, name FROM builds WHERE id = ?1").bind(id).first();
  if (!b || (b.owner_id !== user.id && user.role !== "admin")) throw new HttpError(404, "Not found.");
  await env.DB.batch([env.DB.prepare("DELETE FROM grants WHERE build_id = ?1").bind(id), env.DB.prepare("DELETE FROM builds WHERE id = ?1").bind(id)]);
  await audit(env.DB, user.id, "build.delete", id, b.name);
  return json({ ok: true });
}

export async function duplicateBuild(env, user, id) {
  const b = await loadVisibleBuild(env, user, id);
  if (b.owner_id !== user.id && user.role !== "admin") throw new HttpError(404, "Not found.");
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM builds WHERE owner_id = ?1").bind(user.id).first();
  if (n >= MAX_BUILDS) throw new HttpError(400, `You can keep up to ${MAX_BUILDS} builds. Delete one to make room.`);
  const nid = newId("b_");
  const now = Date.now();
  const from = b.owner_id === user.id ? "" : ` (from ${b.owner_name})`;
  const name = `Copy of ${b.name}${from}`.slice(0, 60);
  await env.DB.prepare("INSERT INTO builds (id, owner_id, name, data, status, version, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'draft', 1, ?5, ?5)")
    .bind(nid, user.id, name, b.data, now)
    .run();
  await audit(env.DB, user.id, "build.duplicate", nid, id);
  return json({ build: { id: nid, name, status: "draft", version: 1, createdAt: now, updatedAt: now, ownerId: user.id, canEdit: true, data: JSON.parse(b.data) } }, 201);
}

export async function submitBuild(request, env, user, id, ctx) {
  requireId(id);
  const body = await readJson(request, 8192);
  const b = await env.DB.prepare("SELECT * FROM builds WHERE id = ?1").bind(id).first();
  if (!b || b.owner_id !== user.id) throw new HttpError(404, "Not found.");
  const note = cleanNote(body.note, 1000);
  const now = Date.now();
  await env.DB.prepare("UPDATE builds SET status = 'submitted', submitted_at = ?1, submit_note = ?2, updated_at = ?1, version = version + 1 WHERE id = ?3")
    .bind(now, note, id)
    .run();
  await audit(env.DB, user.id, "build.submit", id, b.name);
  ctx.waitUntil(
    notifyAdmin(env, {
      title: "Build submitted for review",
      message: `${user.first_name} submitted "${b.name}" for review.`,
      click: new URL(request.url).origin + "/admin/#builds",
      priority: 3,
      tags: ["clipboard"],
    })
  );
  return json({ ok: true, status: "submitted", submittedAt: now, version: b.version + 1 });
}
