# FBS Boise Store Map

A private website that shows the FBS Boise store in 3D and on a floor plan,
in Franklin Building Supply's colours. It lives at
**https://franklinmap-boise.com**.

The header has three displays:

- **3D** (opens first): the whole store from above. Drag to turn around it,
  right-drag (or two fingers) to move, scroll or pinch to zoom, double-click to
  focus a spot. **Top view** looks straight down with north at the top;
  **Reset view** goes back to the whole store. The 3D scan of the store is
  drawn as a translucent purple "ghost" over the walls so you can see they line
  up.
- **Plan**: the floor plan from above. Click any fixture to see what it is,
  its size and where it is, then press **Go look at it** to walk over and face it.
- **Walk**: you stand just inside the front door at a customer's eye height and
  can look and walk around. The card in the top-right corner tells you which
  part of the store you are in; tap the small map to walk there.

**Measure / place** (in 3D and Plan) puts a cursor on the floor that snaps to
the 6-inch grid, to wall faces and to columns, and shows where it is and how
far it is to the nearest wall; click once for A and again for B to measure.
**Layers** turns things on and off: the scan (Off / Ghost / Solid), structure,
fixtures, ceiling, labels and (in Plan) the scan lines. The account menu has
Theme (System / Light / Dark).

The map is view only for now. Nobody can change the layout from the website yet.

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
| 1 / 2 / 3 | Plan / 3D / Walk |
| Drag, right-drag, wheel (3D) | Turn around the store, move across it, zoom |
| Arrow keys | Move the view (3D, Plan) |
| W A S D or the arrow keys (Walk) | Walk (hold Shift to go faster) |
| Q / E (Walk) | Turn left / right |
| Double-click | Focus that spot (3D) or walk there (Plan, Walk) |
| F / T (3D) | Reset the view / top view, north up |
| M | Measure / place (click A, then B; Esc clears) |
| S | Snap on / off (3D, Plan) |
| L | Labels on / off |
| Space (Walk) | Slow 360° look |
| ? | Show the controls |

On a phone or tablet the tools are along the bottom of the screen: drag to
turn or look around, two fingers to move, pinch to zoom, tap a fixture for
details, tap the floor to walk there (Walk) or to place A and B (Measure).

The button with your name (or the person icon on a phone) in the top-right
corner has **Sign out**, and for you, **Admin dashboard**.

## How the map is built

1. **The photo survey is the source of truth** for what is in the store: every
   wall, door, column, shelf, rack, desk and display, with its position
   (`x` = feet east of the inside of the west wall, `y` = feet north of the
   inside of the south wall), size (`w` long, `d` deep, `h` tall) and
   rotation (`rot`, degrees).
2. **The 3D scan (Polycam / Apple RoomPlan) measured the building**: wall lines,
   the recessed front wall with its covered porch, the north-east step,
   Von's door and the ceiling heights. Where the scan agrees with the photos it
   confirmed them; where it clearly measured something the photos can't show,
   the master uses the scan and marks the item `src` and `toConfirm`. The
   scanner's furniture guesses ("tables", "chairs", a "bed", a "fridge") and
   its phantom walls (display faces it took for walls) were deleted: they are
   never shown. Every change and every open question is in
   `docs/measurements/` (start with its README).
3. **The owner's marked-up original blueprint** (kept private, not in this
   repository) was lined up with the map and used to confirm walls, doors and
   raised floors the photos could not show: the stair core and old restroom
   walls behind the cedar desk, Von's partition, the 1-step floor, the porch
   piers and the north-east back room. See `docs/measurements/BLUEPRINT-RECON.md`.
4. **The master layout** is the result: `public/data/master.json`, the one and
   only copy (the database will be seeded from this same file later). The 3D
   store, the plan and the walk are all drawn from it.
5. **What is immutable**: the cleaned scan (`public/data/scan.glb`, and its plan
   lines in `public/data/scan-overlay.json`) is the fixed reference. It is
   drawn as it was measured, can only be shown or hidden (Off / Ghost /
   Solid), and is never selectable or editable. The photos on shelves and desks
   are in `public/tex/`.

To change the layout today, edit `public/data/master.json` and deploy.

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
- `npm test` checks the map's geometry, measuring and snapping code, then starts
  a private local copy of the site with an empty database and checks the
  sign-in rules, codes, removing people and security settings.

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

- `public/` – the website: the map (`index.html`, `css/app.css`, and `js/`:
  `main.js` plus small ES modules in `core/` (geometry, feet and inches,
  the layout model, snapping; no browser code, so the tests can load them),
  `view3d/` (3D store, scan, cameras, picking), `plan2d/` (floor plan) and
  `ui/`), the data in `data/`, the store photos in `tex/`, three.js r128 and
  its glTF loader and orbit controls in `vendor/`, the sign-in page
  (`login.*`), the dashboard (`admin/`) and the FBS design tokens, icons,
  logo, fonts and shared styles (`assets/`, see `docs/DESIGN.md`).
- `src/` – the Worker: it checks every request before anything is served
  (`worker.js`), plus sign-in, codes and dashboard code (`routes/`, `lib/`).
- `migrations/` – the database tables.
- `wrangler.jsonc` – the Worker and database settings for Cloudflare.
- `scripts/` – `check.mjs` (`npm run check`) and `setup-code.mjs`
  (`npm run setup-code`).
- `test/` – the automatic checks behind `npm test`.
- `docs/` – the UI design spec (`DESIGN.md`), the scan measurements
  (`measurements/`) and background notes from earlier work (`handoff/`).
