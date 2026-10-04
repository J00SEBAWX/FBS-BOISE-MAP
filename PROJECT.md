# FBS Boise Store Planner — the one-page project guide

This file replaces the scattered chat threads. It says what the project is, what is done, what is
not, and exactly how to run it. Update it when something changes; nothing else needs to be re-explained.

## The goal

A private web app for the Franklin Building Supply Boise store reset. Team members sign in with a
code AJ sends them, walk the store as Jerry, drop the 10 department territories where they think
they belong, move fixtures and walls, and submit their version. AJ reviews every build in one
dashboard, decides who may see whose build, and uses the results to organize the store.

Two rules sit above everything else: nobody sees another person's build unless AJ shares it, and
nothing about the store or the team is reachable without signing in.

## Where things stand (October 4, 2026)

| Thing | State |
|---|---|
| Code | This branch is the live app. It runs on the Cloudflare Worker `fbs-boise-map` with the D1 database `fbs-boise-map`. |
| Deploys | Cloudflare Workers Builds watches this repo and the production branch is `main`. `npm run deploy` and `npm run go-live` also deploy straight from a laptop. |
| Address | **https://franklinmap-boise.com** is the site address. The Worker is also reachable at its `workers.dev` address (and as branch previews while preview links are on); all of them share one database and one sign-in. To keep a single front door, turn off the `workers.dev` address and preview links in the Worker settings under Domains & Routes once the domain works for you. |
| Database | Schema applied. Store layout loaded (`current` = surveyed store, `suggested` = Claude's area plan). No people yet. |
| AJ's account | **Not set up yet.** One unused setup code exists (expires about October 6, 2026). Until AJ finishes first-time setup, nobody can sign in. If the code expired, run `npm run go-live` again: it only makes a new setup code while no admin exists and never rotates secrets. |
| Phone alerts | ntfy push is set up by the go-live script. SMS (Twilio) is optional. See "Alerts" below. |
| Tests | `npm run check` (60 files), `npm test` (21 unit tests), `npm run test:security` (15 end-to-end tests: gating, CSRF, codes, isolation, sharing, revoke, delete) all pass. |
| Other branches | `claude/add-store-walk`, `claude/add-handoff-docs`, `claude/meshy-llms-docs-*` are merged history. A parallel login-and-planner attempt from a later session was discarded in favor of this one, so there is a single line of work. |

## The checklist from the brief, item by item

| Asked for | Status | Where |
|---|---|---|
| Make the public site private | Done | Every page, script, texture and API route needs a session; only `/login` and its assets are public. `/admin/` is a 404 for non-admins. `src/worker.js` |
| Request access with first name, FBS work area, phone | Done | `/login` → Request access. `public/login.html`, `src/routes/auth.js` |
| AJ gets a text when someone asks | Done (push, SMS optional) | ntfy push by default; Twilio SMS if `TWILIO_*` + `ADMIN_SMS_TO` are set. Alerts carry first name and work area only, never numbers. `src/lib/notify.js` |
| AJ approves and a random code is generated | Done, 6 digits | Approve mints a one-time 6-digit code (72 h, 5 wrong tries, newer code cancels older). AJ texts it from his own phone with one tap. The brief said 5 digits in one place and 6 in another; 6 won. |
| Private saved profiles / builds | Done | Builds autosave to the person's profile; up to several builds each. Server checks ownership on every read and write. `src/routes/builds.js` |
| Only AJ grants viewing between users; taking a share back works | Done, proven by tests | Grants are admin-only, one-way, read-only, and re-checked on every request. `test/security.test.mjs` |
| Server-side permission checks | Done | Same files as above; no client-only checks. |
| As secure as possible, no leakage | Done | Phones encrypted (AES-GCM) and looked up by keyed hash; codes, sessions and recovery codes stored as hashes; `__Host-` cookie; strict CSP with no inline code and no third-party scripts; CSRF header + origin checks; rate limits; `noindex` everywhere. |
| Jerry walks the store; double-tap/double-click to move any item | Done | 3D store with Jerry (placeholder model until Jerry v3), WASD or thumbstick, tap-to-walk, minimap. Double-click or double-tap picks up a block (Area planning) or a fixture (Current layout). Walls, doors, desks and floors move once "Unlock structure" is on. |
| Department blocks: snapping, scale, drag, rotate | Done | Edges snap to walls, floor edges, doorway clearances, desks and other blocks; 8 resize handles; rotate by handle, key or two-finger twist. |
| Game feel, placeholder Jerry until v3 | Done | `public/app/jerry.js` is the stand-in. Jerry v3 (the stylised Blender character in `docs/handoff`) still needs simplifying and animating. |
| Structural editing, build submissions, review dashboard with sharing only AJ controls | Done | Unlock structure in Current layout. Submit from the app; Builds tab in `/admin/` reviews, marks Reviewed / Needs changes, shares, exports CSV, prints a review packet. |
| 10 top-level areas with keys, subcategories, colour, footprint, adjacency, entry anchor, placement preference, status, note, confidence, square footage, collision warnings | Done | `src/shared/catalog.js` defines them; the details panel edits every field; collisions cover desks, walls, doorway clear zones, stairs, other blocks and outside the building. Colours are per department (the four families exist but have no colour of their own). |
| Power Tools with Milwaukee / DeWalt / Makita child groups and the hybrid accessory rule | Done | Child groups are labelled strips inside the block; the rule is shown in the panel and reflected in the subcategory lists. |
| Decking & Outdoor Living includes decking, grills, pellets, accessories | Done | Catalog subcategories. The manager's email said "grilles"; assumed grills. |
| View modes: Current Layout, Area Planning, Comparison, Suggested | Done | Keys 1–4. Comparison overlays today's store, the suggested plan, your other builds or builds shared with you, with a match score. |
| Suggested: Claude's ideas for flow and organization | Done as a reasoned plan | The `suggested` layout in the database is Claude's plan with a "why" for every area. The app does not generate new layouts from scratch; "Ask Jerry" does the next-step reasoning. |
| Jerry's thinking bubble after you organize; Ask Jerry for the next move | Done | Tips recompute after every change and pop up after a short pause (hidden in map view and on phones, where the Ask button glows instead). Ask Jerry ranks: collisions → unplaced departments → neighbours → entry anchor → placement → size → brand groups → confirm → submit, each with a one-tap fix. `public/app/analysis.js` |
| Before inviting anyone: prove isolation and revoke | Done | `npm run test:security`. |

## How access works

1. A person opens the site and asks for access with first name, work area and mobile number.
2. AJ's phone gets a push (ntfy app) saying who asked. No phone numbers in the alert.
3. AJ opens `/admin/` → Requests → **Approve & make code**. The app shows a 6-digit code and an
   "sms:" link that opens AJ's messaging app with the code pre-filled.
4. The person signs in with phone + code. The code works once and expires in 72 hours.
5. Their session lasts 30 days of use (90 days hard limit). To sign in again later they ask for a
   new code; AJ makes one from the Team tab.

AJ's own sign-in: "AJ sign-in" on the login page pushes a 10-minute code to the ntfy app, or a
recovery code works once. Recovery codes can be regenerated in Settings.

## First-time setup (AJ)

**Windows (the supported path):**

```powershell
npm ci
npm run go-live
```

It signs in to Cloudflare, applies the schema, loads `seed/` if present, sets any missing secrets
with random values, deploys, makes a one-time setup code and writes your notes (ntfy topic + setup
code) to `FBS-planner-setup.txt` on your Desktop. Then open `https://franklinmap-boise.com/login`, click
**AJ sign-in → First-time setup**, enter the code, your first name and mobile number, and save the
8 recovery codes. Delete the Desktop file afterwards.

**Mac/Linux (manual, same steps):**

```bash
npm ci && npm run check && npm test
npx wrangler login
npx wrangler d1 migrations apply fbs-boise-map --remote
npm run db:seed                                   # only if seed/seed.sql is present
openssl rand -hex 32   | npx wrangler secret put PEPPER       # only on a brand-new deployment
openssl rand -base64 32 | npx wrangler secret put PHONE_KEY   # never rotate these once people exist
echo "fbs-$(openssl rand -hex 12)" | npx wrangler secret put NTFY_TOPIC
npx wrangler deploy
```

Then make a setup code: pick 12+ uppercase letters/digits, compute the SHA-256 of `setup:CODE`, and
insert it with `npx wrangler d1 execute fbs-boise-map --remote --command "INSERT INTO setup_tokens
(token_hash, created_at, expires_at) VALUES ('<hash>', <now_ms>, <now_ms + 48h>)"`. Subscribe the
ntfy app to the topic you set.

## Day to day

- **Invite someone:** send them the site link. Approve them in Requests, text the code.
- **Review:** Builds tab. Open a build in the planner (read-only), compare it with yours, leave a
  review note, mark it Reviewed or Needs changes.
- **Share:** Sharing tab. Let X see Y's builds (all, or one). Take it back there too; it stops at once.
- **Remove someone:** Team tab → Revoke (signs them out everywhere, hides shares) or Delete (also
  erases their builds).

## Alerts and one caveat

The ntfy topic is the owner's private alert channel. Besides access requests it also carries AJ's
own 10-minute sign-in codes, so the topic name is effectively a password: keep it only in the ntfy
app. If you want codes off ntfy, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` and
`ADMIN_SMS_TO` (then every alert also goes by SMS) or self-host ntfy with `NTFY_SERVER` + `NTFY_TOKEN`.

## Local development

```bash
npm ci
cp .dev.vars.example .dev.vars        # fill PEPPER and PHONE_KEY with throwaway random values
npm run seed:pull                     # pulls the store layout from the live database into seed/ (git-ignored)
npm run dev                           # http://127.0.0.1:8787
npm run test:all
```

Without `seed/`, the planner opens but shows Jerry's "store layout isn't loaded" notice and nothing
can be placed. The store geometry lives in the database on purpose, not in the repo.

## Open decisions (from the catalog notes)

- Hardware & Fasteners: confirm "Nails" means boxed retail nails. Bulk nails stay on the warehouse racks.
- Safety & Workwear: harnesses could live with Access & Jobsite Equipment instead. Pick one home.
- Decking & Outdoor Living: "grilles" in the email was read as grills.
- Department-family colours: each department has its own colour today. If you want the four
  families (Tools, Jobsite, Building, Finishing & outdoor) to share colours, that is a small change.

## What's next, in order

1. AJ finishes first-time setup and invites two people to try it.
2. Walk the store in the planner and fix anything the survey got wrong (desks, arches, the warehouse wall).
3. Collect submissions, review them, and settle the open decisions above.
4. Jerry v3: simplify the Blender character and animate it, then swap out `public/app/jerry.js`.
5. Optional: family colours; a Mac/Linux `go-live` script if anyone deploys from one.
