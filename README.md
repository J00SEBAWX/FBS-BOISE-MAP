# FBS Boise Remodel Viewer

A 3D viewer for the Franklin Building Supply Boise store, used to lay out
and manipulate store aisles while planning the remodel. Static frontend
plus a small Cloudflare Worker backend.

## Stack

- Plain HTML/CSS/JS frontend, [Three.js](https://threejs.org) for the 3D
  scene (loaded via CDN, no build step needed), served as static assets
  from `public/`.
- A single [Cloudflare Worker](https://developers.cloudflare.com/workers/)
  (`src/worker.js`) as a thin server-side proxy to the
  [Meshy AI](https://www.meshy.ai) API, so the Meshy API key never reaches
  the browser. Only `/api/*` requests reach this Worker — everything else
  is served directly from `public/` (`wrangler.toml`'s
  `assets.run_worker_first`).
- `.mcp.json` wires up the official Meshy MCP server for interactive use
  while developing in Claude Code (separate from the production proxy
  above — see `docs/meshy-api-notes.md`).

This is deployed as a **Worker**, not a Pages project — the Cloudflare
resource behind this repo's Git integration is a Workers service
(`workers/services/view/fbs-boise-map`), so `wrangler.toml` uses `main` +
`[assets]` rather than Pages' `pages_build_output_dir`. Mixing the two
config styles is what caused the first build to fail (`wrangler deploy`
refuses to run against a Pages-style config).

## What it does

- Renders the store floor as a 3D scene with aisles you can click to
  select, drag to reposition, and resize/recolor from the side panel.
- Add/delete aisles; layout persists in the browser (`localStorage`) — no
  database required for a single-user planning tool.
- Per aisle, generate a 3D model from a text description via Meshy AI and
  drop it into the scene in place of the placeholder box.

The actual served site lives in `public/` — repo files like
`package.json`, `docs/`, and `wrangler.toml` itself stay outside it, so
they can't end up published as part of the live website.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in your real MESHY_API_KEY, not committed
npm run dev
```

`npm run dev` runs `wrangler dev`, which serves `public/` and runs
`src/worker.js` for `/api/*`, same as production.

## Deploying to Cloudflare

This repo is already connected to Cloudflare's Git integration
(Workers Builds), so pushes to the deployed branch build and deploy
automatically. If setting this up fresh instead:

1. `npm run deploy` (needs `wrangler login` first), or connect the repo to
   a Workers project in the Cloudflare dashboard.
2. Set the `MESHY_API_KEY` secret on the Worker (dashboard -> Workers &
   Pages -> fbs-boise-map -> Settings -> Variables and Secrets -> add as
   "Secret", or `wrangler secret put MESHY_API_KEY`). Never commit this key.
3. **Before making the site public**, do one of these — right now there is
   no login, so anyone with the URL could trigger Meshy generations and
   spend your paid credits:
   - Set a `SITE_ACCESS_CODE` secret (`wrangler secret put
     SITE_ACCESS_CODE`). The site will prompt for it once and remember it.
     This is a shared-secret speed bump, not real per-user auth.
   - Or, for real access control, put the whole site behind
     [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
     in the Cloudflare dashboard — that's account-level configuration, not
     something in this repo, but it's the stronger option.

## Using the Meshy MCP server while developing

`.mcp.json` in this repo configures the official `@meshy-ai/meshy-mcp-server`
for Claude Code. Set `MESHY_API_KEY` in your environment before opening this
project (e.g. `export MESHY_API_KEY=msy_...` in your shell profile) — the
config reads it from the environment and never stores it in the repo.

## Security notes

- The Meshy API key lives only in two places: your local `.dev.vars`
  (gitignored) and the Worker's "Secret" binding on Cloudflare. It is
  never in git, never sent to the browser, and `src/meshy.js` never echoes
  upstream error bodies that could leak it.
- `docs/meshy-api-notes.md` has more detail on the API integration,
  including a caveat that the exact Meshy REST shape used here wasn't
  verified against live docs (network-restricted environment) and should be
  double-checked before heavy production use.
- The app itself has no login yet — see the `SITE_ACCESS_CODE` / Cloudflare
  Access note above before deploying somewhere reachable by the public.
