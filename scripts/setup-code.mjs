// Makes a one-time admin setup code for first-time setup or a forgotten password.
// It only PRINTS the code and the command that adds it to the database; it changes nothing by itself.
// Run: npm run setup-code
import { randomCode } from "../src/lib/crypto.js";
import { setupTokenHash } from "../src/lib/auth.js";

const HOURS = 72;
const code = randomCode(4, 4);
const hash = await setupTokenHash(code); // SHA-256("setup:" + code without dashes)
const now = Date.now();
const expires = now + HOURS * 3600 * 1000;
const sql = `INSERT INTO setup_tokens (token_hash, created_at, expires_at) VALUES ('${hash}', ${now}, ${expires})`;

console.log(`
One-time admin setup code (shown only now; works once; expires in ${HOURS} hours):

    ${code}

1. Add it to the live site's database by running this once, in this folder:

    npx wrangler d1 execute fbs-boise-map --remote --command "${sql}"

2. Open https://franklinmap-boise.com/login?setup=1, enter the code, your username and a new password.

(To try it on your own computer with npm run dev, run the same command with --local instead of --remote.)
`);
