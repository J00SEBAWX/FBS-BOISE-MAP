# Meshy AI integration notes

## Two separate integration paths

1. **MCP server (`.mcp.json`)** — the official `@meshy-ai/meshy-mcp-server`
   package, wired up for interactive use inside Claude Code while working on
   this project (e.g. "generate a model of a steel shelving unit and check
   it"). Requires `MESHY_API_KEY` to be set in your shell/environment before
   opening this project — it is never stored in the repo.
2. **Cloudflare Pages Functions (`functions/api/meshy/`)** — the server-side
   proxy the deployed *website itself* calls when a user clicks "Generate 3D
   Model" in the browser. The key here is a Cloudflare Pages secret, set
   with `wrangler pages secret put MESHY_API_KEY` (or via the Pages
   dashboard), and is likewise never in the repo or sent to the browser.

Both call Meshy's `POST/GET https://api.meshy.ai/openapi/v2/text-to-3d`
endpoints directly (preview mode, polling for status).

## Verification caveat

The Functions code in this repo (`functions/api/meshy/generate.js` and
`functions/api/meshy/status/[id].js`) was written from general knowledge of
Meshy's v2 Text-to-3D REST API shape (endpoint paths, `mode`/`art_style`
params, polling response fields like `status`/`progress`/`model_urls.glb`).
I was not able to fetch `https://docs.meshy.ai/llms.txt` or the live API
reference to confirm this against the current docs — this environment's
network policy blocks `docs.meshy.ai`.

**Before relying on this in production**, verify the request/response shape
against the current docs at https://docs.meshy.ai, or just ask the `meshy`
MCP tools (`meshy_text_to_3d`, `meshy_get_task_status`) to confirm — they're
maintained directly by Meshy and will reflect the real current API even if
the docs site stays unreachable from here.

## Credits

Meshy generation costs credits per the MCP server's own docs: text-to-3D
preview + refine, image-to-3D, retexture, etc. each have different costs.
Check `meshy_check_balance` before doing bulk generation.
