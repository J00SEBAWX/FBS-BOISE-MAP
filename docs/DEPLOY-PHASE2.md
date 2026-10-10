# Putting the maps release (Phases 2-4) into production

The exact steps for the operator, in order. Nothing here was run for you: the deploy itself, the production
migration and the master seed are all manual. Everything runs from the repository root with the same Cloudflare
account the Worker `fbs-boise-map` lives in (`npx wrangler whoami` to check).

**What this release needs that production doesn't have yet:** migration `0005_maps.sql` (the `maps`,
`master_versions`, `settings` and `proposals` tables) and master version 1 seeded from `public/data/master.json`.
Until step 2 the new map endpoints answer `503 "The site isn't set up yet."`; until step 4 `GET /api/master`
answers `503 "The master map isn't set up yet."`. Sign-in, the dashboard and the existing pages keep working the
whole time, so the order below has no broken moment.

## 1. Check what would be applied

```bash
npx wrangler d1 migrations list fbs-boise-map --remote
```

Expected: `0005_maps.sql` is the only unapplied migration. (0001-0004 are already live.)

## 2. Apply the migration to the production database

```bash
npx wrangler d1 migrations apply fbs-boise-map --remote
```

It is additive and idempotent (`CREATE TABLE IF NOT EXISTS` only): no existing rows are touched. Answer `y`
when it shows `0005_maps.sql`.

## 3. Build the master seed SQL

```bash
npm run -s seed-master > master-seed.sql
```

This validates `public/data/master.json` with the same `validateMapData` the server uses and prints one
`INSERT` of master version 1 (created by "Initial survey"). The INSERT is written so it does nothing if a
master version already exists, so running it twice is safe.

## 4. Seed master version 1

```bash
npx wrangler d1 execute fbs-boise-map --remote --file master-seed.sql
rm master-seed.sql
```

## 5. Deploy the Worker and the pages

```bash
npm test          # all green before deploying
npm run check
npx wrangler deploy
```

## 6. Verify

```bash
# signed out: the API stays closed
curl -s https://franklinmap-boise.com/api/master   # -> 401 {"error":"Please sign in."}
```

Then in a browser, signed in as the admin:

1. `https://franklinmap-boise.com/api/master` answers `{"version":1, ...}` (version 1, item count ~150).
2. The map loads, the header shows the map switcher; **New map** makes a copy that autosaves ("Saved").
3. Admin dashboard: the **Map settings** section shows both switches; the people list shows map counts.
4. Review mode (key 6) opens with "No open proposals" and the master history showing version 1.

## If something is wrong

- A bad deploy: `npx wrangler rollback` returns to the previous Worker; the database changes are additive and
  harmless to old code.
- `GET /api/master` answers 503 after step 4: the seed did not insert (a master already existed, or step 2 was
  skipped) — `npx wrangler d1 execute fbs-boise-map --remote --command "SELECT COUNT(*) FROM master_versions"`.
- Never run destructive SQL against `fbs-boise-map` (id `782b142f-bd23-434b-83a4-2bdb956c23f2`); every fix
  above is additive.
