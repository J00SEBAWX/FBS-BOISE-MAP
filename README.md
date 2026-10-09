# FBS Boise Store Map

A private website that lets you look around the FBS Boise store the way a
customer would. It lives at **https://franklinmap-boise.com**.

There are two views:

- **Walk** (opens first): you stand just inside the front door at eye height
  and can look and walk around the store in 3D. The card in the top-right
  corner tells you which part of the store you are in and what you are near.
  The small map in the bottom-left shows where you are; tap it to walk there.
- **Map**: the floor plan from above. Click any fixture to see what it is and
  its size, then press **Go look at it** to walk over and face it.

The map is view only. Nobody can change the layout from the website.

## How people get in

Nobody can see the map without signing in. Everything (the pages, the 3D
store, the photos, the floor plan) stays locked until they do.

1. **Send them the link** (https://franklinmap-boise.com) **and one access
   code each.** Codes look like `ABCD-EF23`. Each code works **once**.
2. They enter the code, then their **name** and **mobile number**. Then the
   map opens, and they stay signed in on that phone or computer (for up to
   90 days, as long as they come back at least once a month).
3. Only you can see their name and number, in your admin dashboard.

In the dashboard (**https://franklinmap-boise.com/admin/**):

- **Access codes**: there are **5 codes at a time**. Each one shows
  *Available* (with **Copy** and **Copy invite** buttons; the invite is a
  ready-to-send text with the link and the code) or *Used by* someone.
- **Make a new set of 5**: cancels the codes nobody has used yet and makes 5
  new ones. People who are already signed in keep their access.
- **People with access**: everyone who used a code, with their phone number
  and when they last visited. **Remove** signs that person out right away;
  they need a new code to come back.

If someone gets a new phone, just give them a new code. If they use the same
mobile number, they stay one person in your list. The same goes for anyone who
taps **Sign out** (the map asks them first): their code is used up, so they
need a new one to come back.

After you tap **Copy** or **Copy invite**, that code is marked *Copied ·
waiting for them to sign up* (on that phone or computer), so you don't send
the same code to two people.

## Your admin sign-in

Sign in at **https://franklinmap-boise.com/login?admin=1** (or tap
**Admin sign-in** at the bottom of the sign-in page) with your **username and
password**. Change your password any time under **Your account** in the
dashboard (that signs you out on your other devices).

**First time, or forgot your password?** You need a one-time setup code:

1. Ask for one, or make one yourself: in this folder run `npm run setup-code`.
   It prints a code and one command. Run that command once (it adds the code
   to the live database; you need to be logged in to Cloudflare with
   `npx wrangler login`). The code works once and expires after 72 hours.
2. Open **https://franklinmap-boise.com/login?setup=1**, enter the setup
   code, your username and a new password (at least 10 characters).

This keeps your existing admin account; it only sets a new username and
password and signs you out everywhere else.

**Cloudflare Access must be off for this site.** An older version of this page
said to "Protect this Worker behind Access". If you did that, visitors without
a Cloudflare login are stopped before they ever see the sign-in page. To turn
it off, in the Cloudflare dashboard open **Workers & Pages → fbs-boise-map**,
then the **Access** tab, and remove the protection (if Cloudflare instead shows
an Access application for franklinmap-boise.com under **Zero Trust → Access →
Applications**, delete that). The site's own sign-in keeps the map private now.

## Secrets the site needs

The site uses two secrets stored on the Cloudflare Worker (Cloudflare dashboard
→ **Workers & Pages → fbs-boise-map → Settings → Variables and Secrets**):

- `PEPPER` scrambles codes, passwords and phone numbers before they are saved.
- `PHONE_KEY` locks the saved phone numbers (and the unused codes) so only the
  site can read them.

**Never delete or change these two.** If they change, every saved phone number,
password and code stops working. If either one is missing, the site stays
locked and says "The site isn't set up yet."

These old secrets are no longer used and can be deleted: `MESHY_API_KEY`,
`SITE_ACCESS_CODE`, `NTFY_TOPIC`, `NTFY_SERVER` and any `TWILIO_*` ones.

## Controls

| On a computer | |
| --- | --- |
| Drag with the mouse | Look around |
| W A S D or the arrow keys | Walk (hold Shift to go faster) |
| Q / E | Turn left / right |
| Double-click the floor | Walk there |
| Mouse wheel | Zoom in or out |
| Space | Slow 360° look |
| M | Switch between Walk and Map |
| F (in Map) | Fit the whole store on screen |
| ? | Show the controls |

On a phone or tablet: drag to look around, tap the floor to walk there, and
pinch to zoom. In the Map, drag to move around, pinch to zoom, tap a fixture
for details and double-tap the floor to walk there.

The button with your name (or the person icon on a phone) in the top-right
corner has **Sign out**, and for you, **Admin dashboard**.

## Changing the store layout

Everything in the store (walls, doors, shelves, desks) is listed in
`public/js/store-data.js`, one line per item. Each line gives the item's
position (`x` = feet from the west wall, `y` = feet from the south wall),
its size (`w` long, `d` deep, `h` tall) and its rotation in degrees (`rot`).
Change the numbers, save the file, and the change shows up the next time the
site is deployed (see below). The photos used on shelves and desks are in
`public/tex/`.

## Running it on your own computer

You need [Node.js](https://nodejs.org) 22 or newer. Then, in this folder:

```bash
npm install
cp .dev.vars.example .dev.vars   # throwaway local secrets
npm run db:local                 # creates the local database
npm run dev
```

and open http://localhost:8787. To sign in as admin locally, run
`npm run setup-code`, run the printed command with `--local` instead of
`--remote`, then open http://localhost:8787/login?setup=1.

- `npm run check` runs a quick self-check of the files.
- `npm test` starts a private local copy of the site with an empty database
  and checks the sign-in rules, codes, removing people and security settings.

## How it gets published

The site is a Cloudflare **Worker** called `fbs-boise-map` with a **D1**
database (also called `fbs-boise-map`). Cloudflare Workers Builds watches this
repository: when a change is merged into the `main` branch, it deploys the
Worker, which serves franklinmap-boise.com.

Database changes are **not** applied automatically. When a new file appears in
`migrations/`, apply it by hand once:

```bash
npx wrangler d1 migrations apply fbs-boise-map --remote
```

(The access-code feature needs `migrations/0004_access_codes.sql`; the
dashboard's codes don't work until it has been applied.
https://franklinmap-boise.com/api/health shows `"accessCodesTable": true`
once it has.)

## What's in this folder

- `public/` – the website: the map (`index.html`, `css/`, `js/`, the store
  photos in `tex/`, three.js in `vendor/`), the sign-in page (`login.*`), the
  dashboard (`admin/`) and the shared fonts and styles (`assets/`).
- `src/` – the Worker: it checks every request before anything is served
  (`worker.js`), plus sign-in, codes and dashboard code (`routes/`, `lib/`).
- `migrations/` – the database tables.
- `wrangler.jsonc` – the Worker and database settings for Cloudflare.
- `scripts/` – `check.mjs` (`npm run check`) and `setup-code.mjs`
  (`npm run setup-code`).
- `test/` – the automatic checks behind `npm test`.
- `docs/` – background notes from earlier work.
