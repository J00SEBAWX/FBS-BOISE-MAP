# FBS Boise Store Map: API (store maps v3, Phases 2-4)

Everything here is JSON over `fetch` from our own pages. The Worker (`src/worker.js`) enforces every rule below;
the browser is never trusted.

## Ground rules (every endpoint)

- **Session.** Every endpoint in this file needs a signed-in session (the `__Host-fbs_s` cookie). Without one:
  `401 {"error": "Please sign in."}`.
- **Writes** (`POST`, `PUT`, `DELETE`) must send `X-FBS: 1`, and the browser's `Origin` / `Sec-Fetch-Site` must be
  our own site; otherwise `403 {"error": "Request blocked."}` and nothing happens.
- **Errors** are always `{"error": "<plain sentence to show the person>", ...}`. Extra fields:
  - `400` validation: `{error, field, itemId}` (`itemId` is the item's id or `null`; a bad category adds `category`).
  - `409` stale version: `{error, currentVersion}`.
  - `413` body too big, `429` too many writes (`Wait a few minutes`), `423` master locked,
    `503` site not set up (secrets missing, migration 0005 not applied, or no master seeded yet).
- **Hidden means 404.** Anything a person may not see (someone else's map with sharing off, someone else's
  proposal) answers `404 {"error": "Not found."}`, exactly like something that doesn't exist. Something they can
  see but not change answers `403`.
- **Rate limits** per person (fixed 10-minute windows): map saves 120, new/deleted maps 60, master writes and
  decisions 60, proposal submits/withdrawals 30, settings 30.
- **Body limits** are checked before parsing (Content-Length and while streaming): map/master data 460 KB
  (the map itself may be at most 400 KB), apply 256 KB, decisions 128 KB, advisor settings 16 KB, the rest 4 KB.
- **Phone numbers never appear** in any of these responses. A person's first name (`ownerName`) is only sent
  with maps and proposals the caller is allowed to see.
- Timestamps are milliseconds since 1970 (UTC). Ids: maps `m_...`, proposals `p_...`, people `u_...`.

## Map data (what a map / the master holds)

```json
{"items": [Item, ...], "categories": [CategoryDef, ...], "building": {"length": 169, "width": 80}}
```

Validated by `validateMapData` in `src/shared/schema.js` (the browser has the identical
`public/js/shared/schema.js`; use it to check before saving). Unknown fields are dropped; one bad item or
category rejects the whole save with `400 {error, field, itemId}`. Limits: 1,500 items, 400 KB (UTF-8 JSON),
40 category entries. Numbers must be finite and are rounded to 0.0001 ft.

**Item** (store feet; origin = the building's south-west outside corner; x east, y north; x/y = centre):

| field | rule |
|---|---|
| `id` (required) | `/^[A-Za-z0-9_-]{1,40}$/`, unique in the map |
| `type` (required) | `floor zone ceiling wall door opening arch column stairs ring counter gondola wallunit rack pallet platform tower display table area` |
| `x`, `y` (required) | -100 to 400 |
| `w`, `d` (required) | over 0, up to 400 |
| `h` | 0 to 60 (department blocks default to 8) |
| `rot` | any finite angle within ±3600, stored normalised to [0, 360) |
| `ceil`, `fasciaTo` | 0 to 60; `cham` 0 to 20; `sky`, `fans` whole numbers 0 to 20 |
| `name` | text ≤ 80; `src` text ≤ 80 (where a value came from); `notes` text ≤ 500 (newlines kept); `toConfirm` text ≤ 2000 (open question for AJ) |
| `color`, `top` | `#rrggbb` |
| `kind finish header trimTex style lights brand brand2` | `/^[a-z0-9_]{1,24}$/` |
| `shape` | department blocks: `rect` (default) or `poly`; other items: `/^[a-z0-9_]{1,24}$/` (e.g. `oct`) |
| `fixed wainscot clerestory solid locked led brandfloor fasciaN fasciaE` | booleans |
| `status` | `proposed`, `confirmed` or `needs_review` (any item) |
| `open` | `{sides: some of ["N","S","E","W"], w: over 0 up to 20}` |
| `poly` | 3-64 `[x, y]` points in store coordinates (-100 to 400), e.g. a chamfered platform outline |

Text is trimmed and cleaned of control characters, bidi overrides and the BOM; it is never HTML-escaped by the
server, so always render it with `textContent`.

**Department block** = an item with `type: "area"`, plus:
`cat` (required: a default department key, or a custom key defined in this map's `categories`),
`shape` `rect`|`poly`, `pts` (3-24 `[x, y]` corners, LOCAL coordinates relative to the item centre, unrotated,
|x|,|y| ≤ 200; required for `poly`; for `poly`, `w`/`d` are the bounding box), `lockArea` (boolean),
`groups` (≤ 6 `{label ≤ 40, share 0..1}`, e.g. Milwaukee / DeWalt / Makita). `cat`, `pts`, `lockArea` and
`groups` are dropped from other item types.

**CategoryDef** (custom categories and overrides of the 10 defaults; same key = override):
`key` (`/^[a-z0-9_]{1,32}$/`; a default key, or a custom key starting with `c_`), `name` ≤ 40, `color` `#rrggbb`,
`family` (`tools`, `jobsite`, `building`, `finish` or `custom`), `subcats` ≤ 40 texts ≤ 80 (blank ones dropped),
`notes` ≤ 500, `targetSqft` 0-20,000, `hidden` boolean. A custom category needs `name` and `color`; an override
may carry any subset. Use `mergeCategories(CATALOG.areas, data.categories)` from `/js/shared/catalog.js` to get the
effective list (each with `isDefault`, `custom`, `overridden`).

**Structure** (`STRUCTURE_TYPES` / `isStructure` in schema.js): types `floor zone wall door opening arch column
ceiling stairs`, or any item with `fixed: true`. A "blank store" keeps only these (plus the master's category
definitions and building size).

## Shared browser modules (`/js/shared/`, byte-identical to `src/shared/`)

- `catalog.js`: `CATALOG` (`areas` = the 10 departments in the owner's order with `key name family color
  colorDark token size targetSqft sqft adjacency entry placement subcats rules notes groups fixtures fixtureSqft`;
  `families`, `customFamily`, `palette`, `thresholds`, `sizing`, `entryAnchors`, `placements`, `adjacency` pairs),
  `PRODUCTS` (product line -> `department` (or `null` when it isn't a department) + `group`), `DEFAULT_KEYS`,
  `FAMILY_KEYS`, `getArea(key)`, `isDefaultKey`, `isCustomKey`, `mergeCategories(defaults, mapCategories)`,
  `sizeForSqft(sqft)`, `searchProducts(query, limit)` (the "Find a product" search).
- `schema.js`: `validateMapData`, `LIMITS`, `ITEM_TYPES`, `STRUCTURE_TYPES`, `isStructure`, `structureOnly`,
  `cleanText`, `cleanMapName`, `normRot`, `ID_RE`, `CATEGORY_KEY_RE`, `COLOR_RE`.
- `apply.js`: `validateChanges(changes)`, `applyChanges(master, source, changes)` (the exact function the server
  uses for apply and approve; use it to preview the result).
- `advisor-config.js`: `defaultAdvisorConfig()`, `validateAdvisorConfig(cfg)`, `ADVISOR_RULES`,
  `ADVISOR_THRESHOLDS`, `MARGIN_TIERS`.

## Endpoints

### Who am I
`GET /api/me` (any session) -> `{id, name, role}` (`role` is `admin` or `member`).

### Catalog
`GET /api/catalog` (signed in) -> `{version, areas, families, customFamily, palette, thresholds, sizing,
entryAnchors, placements, adjacency, products, structureTypes, itemTypes, limits: {maxItems, maxBytes, maxCategories}}`.

### The master map
- `GET /api/master` (signed in) -> `{version, data, itemCount, updatedAt, updatedByName, sourceOwnerName, note,
  locked, lockedByName, lockedAt}`. `503` until the master is seeded.
- `PUT /api/master {baseVersion, data, note?}` (admin) -> `{version, updatedAt}`.
  `400` bad data, `409 {error, currentVersion}` if `baseVersion` isn't current, `423` while locked.
- `POST /api/master/apply {mapId, baseVersion, changes, note?}` (admin) -> `{version, updatedAt, applied,
  addedCategories}`. `changes` (1-2000): `{id, action: "upsert"|"delete"}` or `{category, action: "upsert"|"delete"}`.
  Item upsert copies the map's item into the master (replace in place or add at the end); item delete removes it
  from the master; category upsert copies the map's definition (a default the map doesn't override goes back to
  the default); category delete removes the master's definition. A department block whose custom category the
  master lacks brings that category along (listed in `addedCategories`). The result is validated (deleting a
  custom category the master still uses is a `400`). The new version records `sourceMapId` and the map owner's
  name. `404` unknown map, `409` stale, `423` locked, `400` bad changes (`field: "changes"`, `itemId` for an item
  the map doesn't have).
- `GET /api/master/history` (admin) -> `{versions: [{version, createdAt, createdByName, sourceMapId,
  sourceOwnerName, note, itemCount}]}`, newest first, at most 200 (older versions are pruned).
- `GET /api/master/history/:version` (admin) -> the same fields plus `data` (to preview before restoring). `404`.
- `POST /api/master/restore {version, baseVersion}` (admin) -> `{version, updatedAt}`: a new version with that old
  version's data, note `Restored version N`. `404` version not kept, `409`, `423`.

### Everyone's maps
`Meta = {id, name, base: "master"|"blank"|"copy", ownerName, mine, itemCount, version, createdAt, updatedAt}`

- `GET /api/maps` (signed in) -> `{mine: [Meta], team: [Meta]}`. `team` (other people's maps) is filled for the
  admin always, and for everyone while sharing is on; otherwise `[]`.
- `POST /api/maps {name, from: "master"|"blank"|"map", mapId?}` (signed in) -> `{meta, data}`.
  `blank` = the current master's structure items; `map` copies a map the caller may see (`404` otherwise).
  Name 1-60 characters (control characters removed, spaces collapsed). At 30 maps: `400 "You have 30 maps.
  Delete one to make another."`. `503` if there is no master yet (for master/blank).
- `GET /api/maps/:id` (owner, admin, or anyone while sharing is on) -> `{meta, data, canEdit}`; `canEdit` is true
  only for the owner.
- `PUT /api/maps/:id {version, data?, name?}` (owner only) -> `{version, updatedAt}`. `409 {error: "This map was
  changed somewhere else. Reload it to keep going.", currentVersion}` when `version` is stale. `403` for someone
  who can see the map but doesn't own it.
- `DELETE /api/maps/:id` (owner or admin) -> `{ok: true}`. Its open proposal (if any) becomes `withdrawn` with the
  note "The map was deleted."

### Proposals
`ProposalMeta = {id, mapId, mapName, ownerName, mine, status, note, createdAt, decidedAt, decidedByName,
decisionNote, appliedVersion, baseMasterVersion, mapVersion, itemCount}`; `status` is `submitted`, `approved`,
`needs_changes`, `declined` or `withdrawn`. `mapName` is `null` once the map is deleted.

- `POST /api/maps/:id/submit {note?}` (owner only) -> `{proposal}`. The snapshot is the map's saved data right
  now (save first). At most one open proposal per map: submitting again while it is `submitted` updates that one
  (snapshot, note, versions, `createdAt`). `503` if there is no master.
- `POST /api/proposals/:id/withdraw` (owner) -> `{proposal}`; `409` if it isn't open any more.
- `GET /api/proposals[?status=...]` -> `{proposals: [ProposalMeta]}` newest first (at most 200): the admin gets
  everyone's, others only their own. Unknown status: `400`.
- `GET /api/proposals/:id` (owner or admin) -> `{...ProposalMeta, snapshot}`.
- `POST /api/proposals/:id/decision {decision: "approve"|"needs_changes"|"decline", note?, changes?, baseVersion?}`
  (admin) -> `{proposal}` (approve with changes also returns `version, applied, addedCategories`).
  Approve with a non-empty `changes` list applies them from the SNAPSHOT to the master with exactly the
  `/api/master/apply` rules (`baseVersion` required; `409` stale, `423` locked) and sets `appliedVersion`; the
  master version notes the owner as source. Approve with no changes, `needs_changes` and `decline` only record
  the decision and note. `409` if already decided or withdrawn; `400` for `changes` on a non-approval.

### Admin settings
- `GET /api/admin/settings` (admin) -> `{shareMaps, masterLocked, lockedByName, lockedAt}`.
- `PUT /api/admin/settings {shareMaps?, masterLocked?}` (admin, booleans, at least one) -> the same.
  Locking records the admin's name and the time. While locked, every master write (PUT, apply, restore,
  approve with changes) answers `423 {"error": "The master map is locked. Unlock it first."}` (the admin too);
  maps, proposals and decisions without changes keep working.
- `GET /api/admin/overview` (existing) people entries gain `mapCount` (`null` before migration 0005).
- `DELETE /api/admin/people/:id` (existing) also deletes that person's maps and proposals (one transaction).

### Advisor settings
- `GET /api/advisor-config` (signed in) -> `{config, isDefault, updatedAt, rules, thresholds}`.
  `config = {version, thresholds: {nearFt, anchorFt, perimeterFt, aisleMinFt, mainAisleMinFt, adaMinFt,
  decompressionFt, doorClearanceFt, sightlineFt, sizeTolerancePct}, departments: {<key>: {margin:
  "high"|"medium"|"low", theftProne, assumption}}, roles: {destination, bulky, powerWall}, rules: {<rule>:
  {enabled, weight 0-5}}, note}`. `rules` / `thresholds` in the response describe each rule (label, why) and
  each threshold (default, min, max, label). Margin tiers default to labelled assumptions (Power Tools, Bits &
  Blades, Hand Tools high and theft-prone; the rest medium).
- `PUT /api/advisor-config {config}` (admin, ≤ 16 KB) -> `{config, isDefault: false, updatedAt}`. Missing parts
  come from the defaults; unknown fields are dropped; out-of-range values are a `400` naming the field.
  `PUT /api/advisor-config {reset: true}` goes back to the defaults.

## Database and operations

Migration `migrations/0005_maps.sql` (additive, idempotent) adds `maps`, `master_versions` (current master =
MAX(version); the newest 200 are kept by the housekeeping in `prune()`), `settings` (`share_maps`,
`master_locked`, `master_locked_by_name`, `master_locked_at`, `advisor_config`) and `proposals` (one open
proposal per map, enforced by a partial unique index).

Production, once, **before** the pull request that ships this API is merged (merging to `main` publishes the
Worker automatically; the database is never changed by a deploy). The full safe order is in
`docs/DEPLOY-PHASE2.md`:

1. `npx wrangler d1 migrations apply fbs-boise-map --remote` (additive: the site that is live now ignores the new
   tables)
2. `npm run -s seed-master > /tmp/master-seed.sql` (checks `public/data/master.json` with the same validation and
   prints one INSERT of master version 1 by "Initial survey"; it does nothing if a master already exists), then
   `npx wrangler d1 execute fbs-boise-map --remote --file /tmp/master-seed.sql`
3. A read-only check: `SELECT version, item_count FROM master_versions ORDER BY version DESC LIMIT 1` shows version 1.
4. Merge the pull request, then look at the live site.

While the tables are missing the new endpoints answer `503 {"error": "The site isn't set up yet."}`, and until the
master is seeded `GET /api/master` answers `503 {"error": "The master map isn't set up yet."}`; sign-in and the
dashboard work throughout. The map page treats exactly these answers (a 503 on any maps call, or a 404 on
`GET /api/master`) as "not ready yet": it shows the static `public/data/master.json` read-only under the note
"Editing isn't switched on yet. You're viewing the master map as it stands.", with New map, editing, proposals,
Comparison, Advisor, Review and the admin's map settings switched off, and it starts using the API as soon as the
answers change (the note's **Check again** button, or a reload). A merge that happens before steps 1 to 3 is
therefore harmless.
