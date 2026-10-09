-- Admin password columns.
-- Reconstructed on 2026-10-08 from the production schema (sqlite_master of D1 database fbs-boise-map),
-- because the original 0002_passwords.sql was applied from a laptop and never committed.
-- Applied to an empty database after 0001, it gives exactly the production users table.

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN password_set_at INTEGER;
ALTER TABLE users ADD COLUMN pw_attempts INTEGER NOT NULL DEFAULT 0;
