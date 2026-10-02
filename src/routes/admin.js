// AJ-only endpoints. Every handler is reached only after requireAdmin() in the router.
import { HttpError, json, readJson } from "../lib/http.js";
import { audit } from "../lib/ratelimit.js";
import { notifyAdmin, alertsConfigured } from "../lib/notify.js";
import { cleanNote, requireId, formatPhone } from "../lib/validate.js";
import { newId, randomDigits, decryptText } from "../lib/crypto.js";
import { config, codeHash, destroyUserSessions } from "../lib/auth.js";
import { summary } from "./builds.js";
import { makeRecoveryCodes } from "./auth.js";

const HOUR = 3600000;
const CODE_HOURS = 72;

async function phoneOf(env, u) {
  try {
    return await decryptText(config(env).phoneKey, u.phone_enc);
  } catch {
    return "";
  }
}

async function userView(env, u) {
  const phone = await phoneOf(env, u);
  return {
    id: u.id,
    firstName: u.first_name,
    workArea: u.work_area,
    role: u.role,
    status: u.status,
    needsCode: !!u.needs_code,
    phone: formatPhone(phone),
    phoneE164: phone,
    createdAt: u.created_at,
    approvedAt: u.approved_at,
    lastLoginAt: u.last_login_at,
    lastRequestAt: u.last_request_at,
    builds: u.build_count ?? undefined,
    activeSessions: u.session_count ?? undefined,
  };
}

async function getUser(env, id) {
  requireId(id);
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first();
  if (!u) throw new HttpError(404, "Not found.");
  return u;
}

export async function listUsers(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT u.*,
            (SELECT COUNT(*) FROM builds b WHERE b.owner_id = u.id) AS build_count,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?1) AS session_count
       FROM users u
      ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, u.needs_code DESC, u.last_request_at DESC, u.created_at DESC`
  )
    .bind(now)
    .all();
  const users = [];
  for (const u of results) users.push(await userView(env, u));
  return json({ users, alerts: alertsConfigured(env) });
}

async function issueCode(request, env, admin, u, purpose) {
  const code = randomDigits(6);
  const now = Date.now();
  const expiresAt = now + CODE_HOURS * HOUR;
  const h = await codeHash(env, u.id, code);
  await env.DB.batch([
    env.DB.prepare("UPDATE login_codes SET revoked_at = ?1 WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL").bind(now, u.id),
    env.DB.prepare("INSERT INTO login_codes (id, user_id, code_hash, purpose, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(
      newId("c_"), u.id, h, purpose, now, expiresAt
    ),
    env.DB.prepare("UPDATE users SET needs_code = 0, updated_at = ?1 WHERE id = ?2").bind(now, u.id),
  ]);
  await audit(env.DB, admin.id, "code.issued", u.id, purpose);
  const phone = await phoneOf(env, u);
  const site = new URL(request.url).origin;
  return {
    code,
    expiresAt,
    firstName: u.first_name,
    phone: formatPhone(phone),
    phoneE164: phone,
    smsBody: `Hi ${u.first_name}, your FBS Store Planner code is ${code}. Open ${site}/login, tap "I have a code" and enter it with this phone number. It works once and expires in 3 days.`,
  };
}

export async function approveUser(request, env, admin, id) {
  const u = await getUser(env, id);
  if (u.role === "admin") throw new HttpError(400, "That's your own admin account.");
  const now = Date.now();
  const firstTime = u.status !== "approved";
  await env.DB.prepare("UPDATE users SET status = 'approved', approved_at = COALESCE(approved_at, ?1), updated_at = ?1 WHERE id = ?2").bind(now, u.id).run();
  await audit(env.DB, admin.id, "access.approved", u.id, `${u.first_name} · ${u.work_area}`);
  return json(await issueCode(request, env, admin, { ...u, status: "approved" }, firstTime ? "setup" : "login"));
}

export async function newCode(request, env, admin, id) {
  const u = await getUser(env, id);
  if (u.status !== "approved") throw new HttpError(400, "Approve this person first.");
  if (u.role === "admin") throw new HttpError(400, "Use 'Text me a code' on the sign-in page for your own account.");
  return json(await issueCode(request, env, admin, u, "login"));
}

export async function denyUser(env, admin, id) {
  const u = await getUser(env, id);
  if (u.role === "admin") throw new HttpError(400, "You can't deny your own admin account.");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status = 'denied', needs_code = 0, updated_at = ?1 WHERE id = ?2").bind(now, u.id),
    env.DB.prepare("UPDATE login_codes SET revoked_at = ?1 WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL").bind(now, u.id),
  ]);
  await destroyUserSessions(env, u.id);
  await audit(env.DB, admin.id, "access.denied", u.id);
  return json({ ok: true });
}

export async function revokeUser(env, admin, id) {
  const u = await getUser(env, id);
  if (u.role === "admin") throw new HttpError(400, "You can't revoke your own admin account.");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status = 'revoked', needs_code = 0, updated_at = ?1 WHERE id = ?2").bind(now, u.id),
    env.DB.prepare("UPDATE login_codes SET revoked_at = ?1 WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL").bind(now, u.id),
    env.DB.prepare("UPDATE grants SET revoked_at = ?1 WHERE viewer_id = ?2 AND revoked_at IS NULL").bind(now, u.id),
  ]);
  await destroyUserSessions(env, u.id);
  await audit(env.DB, admin.id, "access.revoked", u.id);
  return json({ ok: true });
}

export async function restoreUser(env, admin, id) {
  const u = await getUser(env, id);
  const now = Date.now();
  await env.DB.prepare("UPDATE users SET status = 'approved', updated_at = ?1 WHERE id = ?2").bind(now, u.id).run();
  await audit(env.DB, admin.id, "access.restored", u.id);
  return json({ ok: true });
}

export async function deleteUser(env, admin, id) {
  const u = await getUser(env, id);
  if (u.id === admin.id || u.role === "admin") throw new HttpError(400, "You can't delete your own admin account.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM grants WHERE viewer_id = ?1 OR owner_id = ?1").bind(u.id),
    env.DB.prepare("DELETE FROM grants WHERE build_id IN (SELECT id FROM builds WHERE owner_id = ?1)").bind(u.id),
    env.DB.prepare("DELETE FROM builds WHERE owner_id = ?1").bind(u.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(u.id),
    env.DB.prepare("DELETE FROM login_codes WHERE user_id = ?1").bind(u.id),
    env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?1").bind(u.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(u.id),
  ]);
  await audit(env.DB, admin.id, "user.deleted", u.id, u.first_name);
  return json({ ok: true });
}

export async function listAllBuilds(env, url) {
  const full = url.searchParams.get("full") === "1";
  const cols = full ? "b.*" : "b.id, b.name, b.status, b.version, b.created_at, b.updated_at, b.submitted_at, b.reviewed_at, b.submit_note, b.review_note, b.owner_id";
  const { results } = await env.DB.prepare(
    `SELECT ${cols}, u.first_name AS owner_name, u.work_area AS owner_area FROM builds b JOIN users u ON u.id = b.owner_id ORDER BY b.updated_at DESC`
  ).all();
  return json({
    builds: results.map((r) => {
      const s = summary(r);
      if (full) {
        try {
          s.data = JSON.parse(r.data);
        } catch {
          s.data = null;
        }
      }
      return s;
    }),
  });
}

export async function reviewBuild(request, env, admin, id) {
  requireId(id);
  const body = await readJson(request, 8192);
  const status = body.status === "reviewed" || body.status === "needs_changes" ? body.status : null;
  if (!status) throw new HttpError(400, "Pick Reviewed or Needs changes.");
  const b = await env.DB.prepare("SELECT id, name FROM builds WHERE id = ?1").bind(id).first();
  if (!b) throw new HttpError(404, "Not found.");
  const note = cleanNote(body.note, 2000);
  const now = Date.now();
  await env.DB.prepare("UPDATE builds SET status = ?1, review_note = ?2, reviewed_at = ?3, version = version + 1 WHERE id = ?4").bind(status, note, now, id).run();
  await audit(env.DB, admin.id, "build.review", id, status);
  return json({ ok: true, status, reviewedAt: now });
}

export async function listGrants(env) {
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.viewer_id, g.owner_id, g.build_id, g.created_at, g.revoked_at,
            v.first_name AS viewer_name, v.work_area AS viewer_area, o.first_name AS owner_name, b.name AS build_name
       FROM grants g
       JOIN users v ON v.id = g.viewer_id
       JOIN users o ON o.id = g.owner_id
       LEFT JOIN builds b ON b.id = g.build_id
      ORDER BY g.revoked_at IS NOT NULL, g.created_at DESC LIMIT 300`
  ).all();
  return json({
    grants: results.map((g) => ({
      id: g.id,
      viewerId: g.viewer_id,
      viewerName: g.viewer_name,
      viewerArea: g.viewer_area,
      ownerId: g.owner_id,
      ownerName: g.owner_name,
      buildId: g.build_id,
      buildName: g.build_name,
      createdAt: g.created_at,
      revokedAt: g.revoked_at,
    })),
  });
}

export async function createGrant(request, env, admin) {
  const body = await readJson(request, 2048);
  const viewer = await getUser(env, body.viewerId);
  const owner = await getUser(env, body.ownerId);
  if (viewer.id === owner.id) throw new HttpError(400, "Pick two different people.");
  if (viewer.status !== "approved" || owner.status !== "approved") throw new HttpError(400, "Both people need approved access.");
  let buildId = null;
  if (body.buildId) {
    requireId(body.buildId);
    const b = await env.DB.prepare("SELECT id FROM builds WHERE id = ?1 AND owner_id = ?2").bind(body.buildId, owner.id).first();
    if (!b) throw new HttpError(400, "That build doesn't belong to the person you picked.");
    buildId = b.id;
  }
  const dupe = await env.DB.prepare(
    "SELECT id FROM grants WHERE viewer_id = ?1 AND owner_id = ?2 AND revoked_at IS NULL AND ((build_id IS NULL AND ?3 IS NULL) OR build_id = ?3)"
  )
    .bind(viewer.id, owner.id, buildId)
    .first();
  if (dupe) return json({ ok: true, id: dupe.id, existing: true });
  const id = newId("g_");
  await env.DB.prepare("INSERT INTO grants (id, viewer_id, owner_id, build_id, granted_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id, viewer.id, owner.id, buildId, admin.id, Date.now())
    .run();
  await audit(env.DB, admin.id, "share.granted", id, `${viewer.first_name} → ${owner.first_name}${buildId ? " (one build)" : " (all builds)"}`);
  return json({ ok: true, id }, 201);
}

export async function revokeGrant(env, admin, id) {
  requireId(id);
  const res = await env.DB.prepare("UPDATE grants SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL").bind(Date.now(), id).run();
  if (!res.meta || res.meta.changes !== 1) throw new HttpError(404, "That share is already off.");
  await audit(env.DB, admin.id, "share.revoked", id);
  return json({ ok: true });
}

export async function listAudit(env, url) {
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit")) || 200));
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.at, a.action, a.target, a.detail, a.actor_id, u.first_name AS actor_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?1`
  )
    .bind(limit)
    .all();
  return json({ events: results });
}

export async function overview(env) {
  const now = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'approved' AND needs_code = 1 AND role != 'admin'"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'approved'"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM builds"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM builds WHERE status = 'submitted'"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE revoked_at IS NULL"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?1").bind(now),
  ]);
  const n = (i) => r[i].results[0]?.n ?? 0;
  return json({
    pending: n(0),
    needCodes: n(1),
    approved: n(2),
    builds: n(3),
    submitted: n(4),
    activeShares: n(5),
    activeSessions: n(6),
    alerts: alertsConfigured(env),
  });
}

export async function testAlert(request, env, admin) {
  if (!alertsConfigured(env)) throw new HttpError(400, "Push alerts aren't set up yet.");
  const r = await notifyAdmin(env, {
    title: "Test alert",
    message: "Push alerts for the FBS Store Planner are working.",
    click: new URL(request.url).origin + "/admin/",
    priority: 3,
    tags: ["white_check_mark"],
  });
  await audit(env.DB, admin.id, "alert.test");
  if (!r.delivered) throw new HttpError(502, "The alert service didn't accept the message. Check the topic and try again.");
  return json({ ok: true });
}

export async function newRecoveryCodes(env, admin) {
  const codes = await makeRecoveryCodes(env, admin.id);
  await audit(env.DB, admin.id, "recovery.regenerated");
  return json({ recoveryCodes: codes });
}

export async function signOutOthers(env, admin, sess) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2").bind(admin.id, sess.tokenHash).run();
  await audit(env.DB, admin.id, "sessions.others_revoked");
  return json({ ok: true });
}
