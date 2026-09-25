// This Worker only ever sees /api/* requests — wrangler.toml routes
// everything else straight to the static assets in public/ via
// assets.run_worker_first, so there's no ASSETS.fetch() fallback to write.

import { checkAccessCode } from "./access.js";
import { handleGenerate, handleStatus } from "./meshy.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const accessError = checkAccessCode(request, env);
    if (accessError) return accessError;

    if (request.method === "POST" && url.pathname === "/api/meshy/generate") {
      return handleGenerate(request, env);
    }

    const statusMatch = url.pathname.match(/^\/api\/meshy\/status\/([^/]+)$/);
    if (request.method === "GET" && statusMatch) {
      return handleStatus(env, decodeURIComponent(statusMatch[1]));
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
