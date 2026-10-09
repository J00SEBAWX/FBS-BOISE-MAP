-- Admin username (unique, case-insensitive).
-- Reconstructed on 2026-10-08 from the production schema (sqlite_master of D1 database fbs-boise-map),
-- because the original 0003_admin_username.sql was applied from a laptop and never committed.
-- Applied to an empty database after 0001 and 0002, it gives exactly the production schema.

ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX idx_users_username ON users (lower(username)) WHERE username IS NOT NULL;
