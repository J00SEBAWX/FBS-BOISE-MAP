-- The site no longer asks for or shows phone numbers (members sign in with a username and password).
-- This forgets the numbers saved by the earlier sign-up: the encrypted number, its last 4 digits and its keyed hash.
-- phone_hash stays NOT NULL UNIQUE (from 0001), so it gets a placeholder no real phone can produce.
-- Nothing reads these columns any more. Safe to run more than once. It can't be undone: the numbers are gone.
-- Apply to production by hand (npx wrangler d1 migrations apply fbs-boise-map --remote).

UPDATE users
   SET phone_hash = 'none:' || id, phone_enc = '', phone_last4 = ''
 WHERE phone_hash NOT LIKE 'none:%';
