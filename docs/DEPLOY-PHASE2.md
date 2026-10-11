# Putting the maps release (Phases 2-4) live

These are the steps for the **operator**: the person who looks after the Cloudflare account that hosts the site.
They are not run for you, and nothing in the repository runs them by itself. Everything runs from the repository
root, in a terminal that is logged in to the same Cloudflare account the Worker `fbs-boise-map` lives in
(`npx wrangler whoami` shows it; `npx wrangler login` signs in).

## The one rule: the database first, the merge last

The site is published by **Cloudflare Workers Builds the moment the pull request is merged into `main`** (see
`wrangler.jsonc` and "How it gets published" in the README). The database is **not** touched by a deploy: its
changes are applied by hand. The new map page reads the master map from the database, so the database has to be
ready *before* the merge:

| Step | What | Who sees it |
| --- | --- | --- |
| 1 | Apply migration `0005_maps.sql` to the live database | Nobody: it only adds tables, and the site that is live now ignores them |
| 2 | Seed master version 1 from `public/data/master.json` | Nobody |
| 3 | Check both with a read-only query | Nobody |
| 4 | **Merge the pull request** (this publishes the new site) | Everyone gets the new map page, working from the first minute |
| 5 | Look at the live site | |

## What people see if the merge happens before steps 1 to 3

Nothing breaks. The new page asks the server for the master map; while the tables or the seed are missing the
server answers "not set up yet" and the page falls back to the file `public/data/master.json`, exactly as the
first version of the site worked:

- A blue note across the top of the map: **"Editing isn't switched on yet. You're viewing the master map as it
  stands."** with a **Check again** button.
- Plan, 3D, Walk, Layers and Measure keep working, in the two modes that only read the master (**Blank slate** and
  **Current layout**).
- **New map**, editing, Area planning, Comparison, Advisor, Review, Submit for review and the admin's map settings
  are switched off (the other modes' buttons are hidden, the map menu says "once editing is switched on").
- Signing in, the access codes and the admin dashboard are not affected.
- No error text, database words or error numbers are shown.

When steps 1 to 3 are done afterwards, nothing has to be published again: **Check again** (or a reload) switches
everything on.

## 0. Before you start

```bash
npm install
npm run check
npm test          # all green
npx wrangler d1 migrations list fbs-boise-map --remote
```

The last command should list `0005_maps.sql` as the only migration that is not applied yet (0001 to 0004 are
live).

**If it lists more than 0005** (for example 0002 to 0005, because an earlier migration was applied by hand with
`d1 execute` instead of `d1 migrations apply`, so Cloudflare's own list of applied migrations lacks it), do **not**
run `migrations apply`: it would try 0002 first and stop with "duplicate column name", and 0005 would never run.
Go to step 1 and use the "by file" form there instead.

## 1. Apply the migration to the live database

```bash
npx wrangler d1 migrations apply fbs-boise-map --remote
```

It is additive and safe to run more than once (`CREATE TABLE IF NOT EXISTS` only; no existing row is touched).
Answer `y` when it lists `0005_maps.sql`. The site that is live now never reads these tables, so nothing changes
for anyone.

**By file, when step 0 listed more than 0005.** Run just this migration directly:

```bash
npx wrangler d1 execute fbs-boise-map --remote --file migrations/0005_maps.sql
```

`0005_maps.sql` only creates tables and indexes that are missing (`IF NOT EXISTS`), so it is safe whatever was applied
before and whether it runs once or twice. Do not run 0002 or 0003 by file: they are not repeatable (0002 adds columns,
0003 creates a unique index without `IF NOT EXISTS`), and production already has what they add. Then continue with
step 2.

## 2. Seed master version 1

```bash
npm run -s seed-master > /tmp/master-seed.sql
npx wrangler d1 execute fbs-boise-map --remote --file /tmp/master-seed.sql
rm /tmp/master-seed.sql
```

The first command checks `public/data/master.json` with the same rules the server uses and prints one `INSERT`
for master version 1 (made by "Initial survey"). It also tells you how many items the file has: remember that
number for step 3. The `INSERT` does nothing if a master version already exists, so running it twice is safe. The
file is written outside the repository so an interrupted run leaves nothing behind in it (on Windows use any
folder outside the repository, for example `%TEMP%\master-seed.sql`).

## 3. Check it with a read-only query

```bash
npx wrangler d1 execute fbs-boise-map --remote --command "SELECT version, item_count, created_by_name FROM master_versions ORDER BY version DESC LIMIT 1"
npx wrangler d1 execute fbs-boise-map --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('maps', 'master_versions', 'settings', 'proposals') ORDER BY name"
```

Expected: the first shows `version` 1, `item_count` equal to the number `seed-master` printed, and
`created_by_name` "Initial survey"; the second lists all four tables. Both only read.

If the first one shows no row, the seed did not run: repeat step 2. If it is missing the tables, repeat step 1.

## 4. Merge the pull request

Merging into `main` is what publishes the site: Workers Builds builds and deploys it within a few minutes. (Merge
only after step 3 shows what it should.) Watch the build under **Workers & Pages → fbs-boise-map → Deployments**
in the Cloudflare dashboard.

## 5. Look at the live site

Signed out, the API stays closed:

```bash
curl -s https://franklinmap-boise.com/api/master   # -> 401 {"error":"Please sign in."}
```

Then in a browser, signed in as the admin:

1. The map opens **without** the "Editing isn't switched on yet" note, and the header shows the map switcher with
   "Master map" and its version.
2. **New map** in the switcher makes a copy of the master; changing something shows "Saved" after a moment.
3. The admin dashboard shows the **Map settings** section with both switches, and the people list shows how many
   maps each person has.
4. Review (key 6) opens with "No open proposals" and the master's history showing version 1.
5. Signed in as a team member: the master opens read-only, with **Make my own copy**.

## If something is wrong

- **`migrations apply` stops with "duplicate column name" (or "index ... already exists"):** an earlier migration was
  applied by hand and Cloudflare's list does not know it. Nothing was damaged and 0005 was not applied: use the "by
  file" command in step 1.
- **A bad deploy:** in the Cloudflare dashboard (**Workers & Pages → fbs-boise-map → Deployments**) roll back to the
  previous deployment, or run `npx wrangler rollback`. The database changes are additive and harmless to the old
  code, so the rollback needs nothing else.
- **People see "Editing isn't switched on yet":** the database is not ready. Run the checks in step 3 and repeat
  step 1 or 2, then press **Check again**.
- **`GET /api/master` answers 503 after step 2:** the seed did not insert (it only inserts when there is no master
  yet, so first look at `SELECT COUNT(*) FROM master_versions`), or step 1 was skipped.
- Never run destructive SQL against `fbs-boise-map` (id `782b142f-bd23-434b-83a4-2bdb956c23f2`); every fix above is
  additive.
