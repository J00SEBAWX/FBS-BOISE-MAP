-- Access codes for visitors: the admin hands out one code per person, each works once,
-- and at most 5 are usable at a time (a new set cancels the unused ones).
--   code_hash = HMAC-SHA256(PEPPER, "access:" + code without dash, uppercase)  (lookups)
--   code_enc  = AES-GCM(PHONE_KEY, "XXXX-XXXX")  (so the admin can see unused codes again)
--   used_by   = users.id of the person who used it; plain TEXT on purpose (no foreign key), so
--               removing a person keeps the history of which code was used.
-- Additive and safe to run more than once: it is applied to production by hand
-- (npx wrangler d1 migrations apply fbs-boise-map --remote).

CREATE TABLE IF NOT EXISTS access_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  code_enc TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_access_codes_batch ON access_codes (batch_id);
