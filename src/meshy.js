// Meshy text-to-3D proxy. The Meshy API key stays server-side — it's read
// from the MESHY_API_KEY secret bound to this Worker and never sent to
// the browser.

const MAX_PROMPT_LENGTH = 600;

export async function handleGenerate(request, env) {
  if (!env.MESHY_API_KEY) {
    return jsonError("Meshy API key is not configured on the server.", 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return jsonError('A "prompt" string is required.', 400);
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return jsonError(`Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).`, 400);
  }

  const artStyle = body.artStyle === "sculpture" ? "sculpture" : "realistic";

  let upstream;
  try {
    upstream = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "preview",
        prompt,
        art_style: artStyle,
        should_remesh: true,
      }),
    });
  } catch {
    return jsonError("Could not reach the Meshy API.", 502);
  }

  if (!upstream.ok) {
    return jsonError(`Meshy API error (${upstream.status}).`, 502);
  }

  const data = await upstream.json();
  return Response.json({ taskId: data.result });
}

export async function handleStatus(env, taskId) {
  if (!env.MESHY_API_KEY) {
    return jsonError("Meshy API key is not configured on the server.", 500);
  }
  if (!taskId) {
    return jsonError("Missing task id.", 400);
  }

  let upstream;
  try {
    upstream = await fetch(
      `https://api.meshy.ai/openapi/v2/text-to-3d/${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${env.MESHY_API_KEY}` } }
    );
  } catch {
    return jsonError("Could not reach the Meshy API.", 502);
  }

  if (!upstream.ok) {
    return jsonError(`Meshy API error (${upstream.status}).`, 502);
  }

  const data = await upstream.json();
  return Response.json({
    status: data.status,
    progress: data.progress ?? null,
    modelUrl: data.model_urls?.glb ?? null,
    taskError: data.task_error?.message ?? null,
  });
}

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}
