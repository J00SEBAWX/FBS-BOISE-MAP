// Optional shared-secret gate for /api/meshy/*. See README for details.
// Returns a 401 Response if the check fails, or null if the request may
// proceed (including when SITE_ACCESS_CODE isn't configured at all).
export function checkAccessCode(request, env) {
  if (!env.SITE_ACCESS_CODE) return null;

  const provided = request.headers.get("X-Access-Code");
  if (provided !== env.SITE_ACCESS_CODE) {
    return Response.json({ error: "Invalid or missing access code." }, { status: 401 });
  }
  return null;
}
