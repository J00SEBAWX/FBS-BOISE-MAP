// GET /api/meshy/status/:id
// Polls a Meshy text-to-3D task. Same server-side-only key handling as
// functions/api/meshy/generate.js.

export async function onRequestGet(context) {
  const { params, env } = context;
  const taskId = params.id;

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
