-- Store maps v3: everyone's own maps, the master map (versioned), site settings and proposals.
-- Additive and safe to run more than once. Applied to production by hand, BEFORE the release that uses it is merged
-- (docs/DEPLOY-PHASE2.md has the full safe order and the read-only check):
--   1. npx wrangler d1 migrations apply fbs-boise-map --remote
--   2. npm run -s seed-master > /tmp/master-seed.sql   (prints the SQL for master version 1; see scripts/seed-master.mjs)
--      npx wrangler d1 execute fbs-boise-map --remote --file /tmp/master-seed.sql
-- owner_id columns are plain TEXT (no foreign keys): removing a person deletes their maps and proposals explicitly.

-- A person's own store layout. data = {"items": [...], "categories": [...]} (validated by src/shared/schema.js).
CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base TEXT NOT NULL CHECK (base IN ('master', 'blank', 'copy')),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maps_owner ON maps (owner_id, updated_at);

-- The master map: every change is a new row; the current master is MAX(version). The newest 200 are kept.
CREATE TABLE IF NOT EXISTS master_versions (
  version INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  created_by_name TEXT,
  source_map_id TEXT,
  source_owner_id TEXT,
  source_owner_name TEXT,
  note TEXT
);

-- Site settings: share_maps '0'|'1', master_locked '0'|'1' (+ master_locked_by_name, master_locked_at),
-- advisor_config (JSON). A missing key means the default ('0' / the built-in advisor defaults).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- A map submitted to the admin for the master. snapshot = the map's data when it was submitted.
-- At most one open ('submitted') proposal per map; submitting again updates it.
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  map_version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  base_master_version INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'approved', 'needs_changes', 'declined', 'withdrawn')),
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  decided_by_name TEXT,
  decision_note TEXT,
  applied_version INTEGER
);
CREATE INDEX IF NOT EXISTS idx_proposals_owner ON proposals (owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals (status, created_at);
CREATE INDEX IF NOT EXISTS idx_proposals_map ON proposals (map_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_open ON proposals (map_id) WHERE status = 'submitted';
