# Handoff: FBS Boise store planner (state on 11 Oct 2026)

For: another assistant (for example Perplexity) picking this up with the store manager.
Written by: Claude Code, at the owner's request.

## 0. Read this first (privacy)

This file is meant to be pasted into another service. It was written to be safe for that:

- **Nothing secret is in it.** No passwords, no admin setup code, no access codes, no API tokens, no Worker secrets, no email or phone numbers. Those live only on the Cloudflare account and with the owner. **Never ask the owner to paste any of them into a chat.** If a task seems to need one, stop and tell the owner to do that step themselves.
- **No photos and no blueprint.** The owner's phone photos show employees and the building drawing is private. They are not in the repository and must never be added to it. This file only refers to them by short IDs (like `76e35a7c`).
- The site is **private** (sign-in only). Do not describe its inner workings in public places.
- The owner's standing rules: be direct and plain, no jargon; privacy and security first; **ask before touching anything that could expose, move, store, share or alter sensitive data** (the production database, accounts, access codes); prefer the smallest approach that works; if something isn't working, say so and change course.

## 1. What this is, in plain words

A private website for Franklin Building Supply, Boise (franklinmap-boise.com). It shows the real store as a floor plan and in 3D (built from a LiDAR scan of the building), and lets the team **plan where each department goes**: make their own map, add/move/delete things, place the ten merchandise departments, see warnings when things collide or block a doorway, compare two layouts, and get advice (the "advisor"). One **master map** is the confirmed layout; the admin approves changes to it.

Goal behind it (owner's words): stable income now, a better long-term income later. Keep it simple and dependable.

## 2. Where things stand (11 Oct 2026)

**Live and merged to `main`** (GitHub repo `J00SEBAWX/FBS-BOISE-MAP`, private):
- Sign-in, 3D viewer, Plan view, Walk view, Measure (earlier phases).
- The planner (PR #14): own maps, editing with delete, the ten departments with exact sizes, custom departments, view modes (Blank slate, Current layout, Area planning, Comparison, Advisor), live collision warnings, review/approval of proposals, master lock and sharing.
- Master-map corrections from the owner (PRs #13, #15, #16): the DeWalt warehouse display, both Milwaukee-area pellet grills, the warehouse pellet grill demo and the Diablo A-frame are gone; the "Milwaukee doorway" is a solid wall (it is a drink storage closet); the strap isle is 12 ft on the west face of the cubicle panels facing the front desk; **the front sales desk was added** (octagon-shaped counter with staff gaps, same family as the back sales desk); **the two blocks that were labelled "SALES DESK" are Felix's desk area** and were moved onto the raised floor beside the carpeted stair.

**Database (Cloudflare D1, done today with the owner's OK):** migration `0005_maps.sql` applied and recorded; master map version 1 loaded (160 items). A read-only check confirmed 160 items, a checksum identical to the file in the repo, and that the owner's sign-in data was untouched. Editing and "create your own map" should now be switched on for signed-in users. **Not yet confirmed from the live site** (the build sandbox cannot reach it): the owner should open it, press **Check again** on the blue note if it is still there, and try **New map**.

**Quality:** `npm run check` passes; `npm test` passes 320 of 320; `wrangler deploy --dry-run` passes.

## 3. What is left, in priority order

1. **Owner verifies the live site** (see above). If the blue "Editing isn't switched on yet" note stays after Check again, look at Section 6 first.
2. **Five questions only the owner can answer** (they settle the front desk; plain-language versions with step counts are in `evidence/front-desk/QUESTIONS.md`): steps from the front door straight north to the desk; the desk's depth (4 or 5 steps); whether the open entrance into the cubicles is straight ahead of the desk's east gap (the scan and one photo disagree by about 3.5 ft); where the cubicle wall really is (the scan says about 2 ft further west than the map); whether Felix's raised floor starts at the counters' front ends or 1.5 steps further south. Their answers change numbers in `public/data/master.json` (item `fd_front_desk`, `i66`, `i86`, `bp_step_plat`).
3. **The rest of the north-east / east correction** (stairs, back room, balcony, cubicle block size, Owners board, dispatch counter and others) is drafted but **not applied**: `evidence/north-east-draft/` (read `CHANGES-PLAIN.md` and `QUESTIONS.md`, evidence in `EVIDENCE.md`, the machine-readable patch in `draft-patch.json`). It was built before the front-desk work and overlaps it (its `ne_checkout`, Felix's desk and strap isle changes are now superseded by what is merged), so rebase it onto `main`, drop the duplicates, apply only what the owner confirms, and open a data-only pull request. Items marked "Sure" in that file are well supported; "Not sure" ones need a tape measure or the owner's step counts.
4. **Optional:** the master loaded into the database is a copy; later changes to `public/data/master.json` do **not** reach the live master by themselves. A new master version has to be added (through the app as admin, or a one-off SQL insert, which needs the owner's OK).
5. **Optional, recommended:** add a small GitHub Action that runs `npm run check` and `npm test` on every pull request. As far as could be seen, only Cloudflare builds run today, so a bad master file was able to reach `main` once (a note over 80 characters failed the data check; fixed in PR #15).
6. **Owner-only housekeeping:** delete the two old unused branches `claude/nifty-faraday-tff6ix` and `claude/secure-planner` on GitHub. Separately, the owner holds a one-time admin password setup code that expires on the afternoon of 12 Oct 2026 (Mountain time); if it lapses, a new one is made with `npm run setup-code` on the owner's own computer. That code is secret and is deliberately not in this file.

## 4. How the project is built (just enough)

- **Hosting:** one Cloudflare Worker named `fbs-boise-map` serving static files from `public/` plus an API from `src/`. Data in a Cloudflare D1 database `fbs-boise-map`. Publishing happens when a pull request is merged into `main` (Cloudflare Workers Builds runs `wrangler deploy`). Database changes are **never** applied by a deploy; they are done by hand and only with the owner's OK. Secrets are stored on the Worker; they are not in the repository and not in this file.
- **Sign-in:** one-time access codes for visitors, username + password for the admin (hashed), a session cookie, and an extra header + origin check on every change. Details: `README.md`, `docs/API.md`.
- **The map data:** one file, `public/data/master.json` (version string, building size 169 x 80 ft, an `items` list, an `audit` block). Coordinates are feet from the south-west inside corner (x east, y north). Each item has a position (centre), size, rotation and optional notes (`src` = where the value came from, at most 80 characters; `toConfirm` = what to measure). The shared data check is `public/js/shared/schema.js` (and an identical copy in `src/shared/`); the server and tests use it. A valid-looking master that fails that check will not load, so always run the tests after editing it.
- **Facing rule:** rotation 0 = faces north, 90 = west, 180 = south, 270 = east.
- **Ring item:** the octagon counters (the back sales desk `i47`, the front sales desk `fd_front_desk`) are `type: "ring"` with `shape: "oct"`, `cham` (corner cut), and `open: {sides, w}` (staff gaps). `w`/`d` are outside sizes; the band is a fixed 2.5 ft.
- **Commands:** `npm run check`, `npm test` (about a minute; needs free ports, set `FBS_TEST_PORTS=9100-9199` if the default is taken), `npx wrangler deploy --dry-run`, `npm run seed-master` (prints the SQL that seeds master version 1; changes nothing by itself).
- **Docs worth reading:** `README.md` (what the site does), `docs/DESIGN.md` (look and behaviour), `docs/API.md`, `docs/DEPLOY-PHASE2.md` (database steps), `docs/measurements/` (how the scan, blueprint and photos were reconciled).

## 5. Evidence rules for any map change

- Photos decide **what exists, what is next to what, which way it faces**. The LiDAR scan decides **measured positions** where it covers (it covers x 0 to 153 only). The owner's marks on screenshots give camera positions and what is wrong.
- Never invent an item. Every added or moved item needs evidence and, where the position is only estimated, a plain `toConfirm` note saying what to measure.
- Photos can only be described, never copied into the repository, and the people in them are to be ignored.
- Names the owner uses: **front sales desk** = the angled checkout counter just north of the front door; **back sales desk** = the octagon counter in the middle of the sales floor (`i47`); **Felix's desk area** = the two wood-paneled desks with the raised walkway against the arch wall beside the carpeted stair.

## 6. Known issues and gotchas

- **Cloudflare branch-preview builds fail within seconds on every new branch** (red "Workers Builds" check on pull requests). Production builds from `main` work. Cause not visible from the sandbox (the log is only in the Cloudflare dashboard). Worth researching (see Section 7); it does not block merging.
- The build sandbox cannot reach the live site or `workers.dev`, so live checks must be done by the owner.
- If the live site still shows the "Editing isn't switched on yet" note: confirm in the Cloudflare dashboard that the latest production deployment finished; then confirm (read-only) that the table `master_versions` has one row and `d1_migrations` lists `0005_maps.sql`. Both were true on 11 Oct.
- Do not run destructive SQL against the production database. Everything done so far was additive.
- Front-desk numbers are estimates (about 1 to 2 ft; up to 3.5 ft on the desk's north side and the cubicle entrance). They are written on the items as `toConfirm` and in `evidence/front-desk/EVIDENCE.md`.

## 7. Good research questions for Perplexity (no secrets needed)

1. Why might Cloudflare Workers Builds fail instantly on non-production branches for a Worker with static assets, a D1 binding and an empty `previews` block, with wrangler 4.14x? What are the documented fixes?
2. Best practice for applying a Cloudflare D1 migration and a large one-off data insert safely in production (staging rows, checksums, idempotent guards).
3. A minimal GitHub Actions workflow for a Cloudflare Worker repo that runs `node --test` and `wrangler deploy --dry-run` on pull requests.
4. Ways to reconcile a LiDAR scan (Polycam/RoomPlan) with phone photos and a hand tape measure to get reliable shop-floor dimensions.

Anything that needs the repository, the live site or the database goes back to the owner or to Claude Code; Perplexity cannot reach them.

## 8. Paste-ready starter prompt

> I'm picking up a small private website for a building-supply store (a floor-plan and 3D planner on Cloudflare). A previous assistant wrote the attached handoff. Please: (1) read it, (2) summarize in 10 lines where things stand, (3) answer research questions 1 to 4 in Section 7 with sources and plain language, and (4) list anything in the handoff that is unclear or risky. Do not ask me for passwords, tokens, access codes or photos, and do not suggest any change to the live database without telling me exactly what it does first. Keep answers short and in plain language.
