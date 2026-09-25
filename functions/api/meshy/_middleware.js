// Applies to every request under /api/meshy/*.
//
// Right now this endpoint has no login in front of it: whoever has the
// site's URL can trigger Meshy generations and spend real paid credits.
// Setting SITE_ACCESS_CODE (via `wrangler pages secret put
// SITE_ACCESS_CODE`, or the Pages dashboard) requires callers to send it
// back as the X-Access-Code header. Leaving it unset changes nothing —
// this is opt-in, not a default requirement.
//
// This is a shared-secret speed bump, not real auth (no per-user
// identity, no revocation without rotating the code). For anything more
// than "keep it off search engines and stray links," put the whole site
// behind Cloudflare Access instead (Cloudflare dashboard -> Zero Trust ->
// Access -> Applications) — that's account-level config, not something
// this repo can set up on its own.

export async function onRequest(context) {
  const { request, env, next } = context;

  if (env.SITE_ACCESS_CODE) {
    const provided = request.headers.get("X-Access-Code");
    if (provided !== env.SITE_ACCESS_CODE) {
      return Response.json({ error: "Invalid or missing access code." }, { status: 401 });
    }
  }

  return next();
}
