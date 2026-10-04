# FBS Boise Store Planner

> Start with **[PROJECT.md](PROJECT.md)**: the goal, what is done, where things stand and how to run it, on one page.

A private, sign-in-only planner for the Franklin Building Supply Boise store reset. Team members walk the
store as Jerry, drag the 10 department areas into place, move fixtures and walls, and submit their build.
AJ approves who gets in, reviews every build, and is the only one who can share one person's builds with
someone else.

Runs on one Cloudflare Worker (`fbs-boise-map`) with a D1 database. No build step and no third-party
scripts: Three.js and the fonts are self-hosted in `public/`.

## How sign-in works

1. Someone opens the site and asks for access with their first name, work area and mobile number.
2. AJ gets a push alert (ntfy). Alerts never include phone numbers.
3. AJ approves them in the dashboard (`/admin/`), which makes a random 6-digit code. AJ texts it from his
   own phone with one tap.
4. They sign in with phone + code. The code works once, expires in 3 days and locks after 5 wrong tries.

AJ's own account is made once with a one-time setup code, and has 8 recovery codes as a backup.

## Security model

- Every page, script and API route is behind sign-in and checked on the server. Only `/login` and its
  assets are public. `/admin/` is a 404 for anyone who isn't AJ.
- Builds are private to their owner. Shares are admin-only grants (all of a person's builds, or one build),
  read-only, and taking one back works immediately. `npm run test:security` proves this end to end.
- Phone numbers are AES-GCM encrypted at rest and looked up by HMAC. Codes, recovery codes and session
  tokens are stored only as hashes. Sessions use a `__Host-` cookie (HttpOnly, Secure, SameSite=Strict).
- Strict CSP (no inline script or style, nothing loaded from other sites), HSTS, no framing, no referrer,
  `noindex` everywhere, CSRF header + same-origin checks on every write, rate limits on sign-in.
- Store geometry lives only in D1, never in git. `seed/` is git-ignored.

## Folders

| Path | What |
|---|---|
| `src/` | The Worker: routing, auth, builds, admin, Meshy proxy (admin only) |
| `src/shared/catalog.js` | The 10 department areas and advisor thresholds |
| `migrations/` | D1 schema |
| `public/login.*` | Sign-in and access requests |
| `public/app/` | The planner (3D scene, Jerry, advisor, editing, HUD) |
| `public/admin/` | AJ's dashboard: requests, team, builds and reviews, sharing, activity |
| `scripts/` | `check.mjs` (pre-deploy checks), `assets.mjs` (Three.js + fonts), `go-live.ps1` |
| `test/` | Unit tests and the end-to-end security suite |
| `scripts/pull-seed.mjs` | `npm run seed:pull`: copies the store layout from the live database into git-ignored `seed/` for local dev and the real-store tests |
| `docs/`, `legacy/`, `store-walk/` | Older handoff material. Not deployed. |

## Commands

```bash
npm ci
npm run check          # syntax, CSP-safe markup, no unsafe DOM, no secrets or store data
npm test               # unit tests (advisor, geometry, validation, crypto)
npm run test:security  # starts a throwaway local Worker and runs the isolation/sharing/revoke tests
npm run dev            # local Worker on http://127.0.0.1:8787 (needs .dev.vars, see .dev.vars.example)
npm run go-live        # Windows: first deploy (database, secrets, deploy, smoke test)
npm run deploy         # later deploys: checks + unit tests + wrangler deploy
```

## Going live the first time (Windows)

Run `npm run go-live` from this folder. It signs in to Cloudflare (one click in the browser), creates the
D1 database, applies the schema, loads the store layout from `seed/`, sets any missing secrets with random
values (never printed), deploys, makes a one-time admin setup code and checks that everything is locked.
Your setup code and alert topic are written to `FBS-planner-setup.txt` on your Desktop.

Never re-create `PEPPER` or `PHONE_KEY` once people have signed up: stored phone numbers and codes depend on
them.

## Going live from a Mac or Linux machine

`go-live` is a PowerShell script. The same steps by hand are listed in [PROJECT.md](PROJECT.md#first-time-setup-aj).

## Alerts

The ntfy topic carries access requests and AJ's own sign-in codes, so treat the topic name like a password.
Set the `TWILIO_*` + `ADMIN_SMS_TO` secrets to also get everything by SMS, or self-host ntfy with
`NTFY_SERVER` + `NTFY_TOKEN`.
