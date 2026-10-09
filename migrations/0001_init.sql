-- FBS Boise store planner: users, sign-in codes, sessions, builds, admin-granted shares.
-- Phone numbers are stored encrypted (AES-GCM) plus a keyed hash for lookups.
-- Codes, session tokens, setup and recovery codes are stored only as hashes.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  work_area TEXT NOT NULL,
  phone_hash TEXT NOT NULL UNIQUE,
  phone_enc TEXT NOT NULL,
  phone_last4 TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'revoked')),
  needs_code INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  approved_at INTEGER,
  last_login_at INTEGER,
  last_request_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

CREATE TABLE IF NOT EXISTS login_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('setup', 'login', 'admin')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_codes_user ON login_codes (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  absolute_expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed', 'needs_changes')),
  version INTEGER NOT NULL DEFAULT 1,
  submit_note TEXT,
  review_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  submitted_at INTEGER,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_builds_owner ON builds (owner_id);

CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  build_id TEXT REFERENCES builds (id) ON DELETE CASCADE,
  granted_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_grants_viewer ON grants (viewer_id, owner_id);

CREATE TABLE IF NOT EXISTS layouts (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS setup_tokens (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log (at);
