// Meshy text-to-3D proxy, carried over from the previous fbs-boise-map Worker.
// Now reachable only by AJ's admin session, or by a tool that sends the old X-Access-Code header.
import { HttpError, json } from "./lib/http.js";
import { safeEqual } from "./lib/crypto.js";

const MAX_PROMPT_LENGTH = 600;

export function meshyAllowed(request, env, sess) {
  if (sess && sess.user.role === "admin") return true;
  const provided = request.headers.get("X-Access-Code") || "";
  return Boolean(env.SITE_ACCESS_CODE) && provided.length > 0 && safeEqual(provided, env.SITE_ACCESS_CODE);
}

export async function handleGenerate(request, env) {
  if (!env.MESHY_API_KEY) throw new HttpError(500, "Meshy API key is not configured on the server.");
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new HttpError(400, 'A "prompt" string is required.');
  if (prompt.length > MAX_PROMPT_LENGTH) throw new HttpError(400, `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).`);
  const artStyle = body.artStyle === "sculpture" ? "sculpture" : "realistic";
  let upstream;
  try {
    upstream = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.MESHY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "preview", prompt, art_style: artStyle, should_remesh: true }),
    });
  } catch {
    throw new HttpError(502, "Could not reach the Meshy API.");
  }
  if (!upstream.ok) throw new HttpError(502, `Meshy API error (${upstream.status}).`);
  const data = await upstream.json();
  return json({ taskId: data.result });
}

export async function handleStatus(env, taskId) {
  if (!env.MESHY_API_KEY) throw new HttpError(500, "Meshy API key is not configured on the server.");
  if (!taskId || !/^[A-Za-z0-9_\-]{1,80}$/.test(taskId)) throw new HttpError(400, "Missing task id.");
  let upstream;
  try {
    upstream = await fetch(`https://api.meshy.ai/openapi/v2/text-to-3d/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${env.MESHY_API_KEY}` },
    });
  } catch {
    throw new HttpError(502, "Could not reach the Meshy API.");
  }
  if (!upstream.ok) throw new HttpError(502, `Meshy API error (${upstream.status}).`);
  const data = await upstream.json();
  return json({
    status: data.status,
    progress: data.progress ?? null,
    modelUrl: data.model_urls?.glb ?? null,
    taskError: data.task_error?.message ?? null,
  });
}
