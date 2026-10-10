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

The header's map switcher opens the **master map** (the confirmed layout; only the admin changes it) or any of
your own maps (**New map**: a copy of the master, a blank store, or a copy of any map you can see). Your maps save
by themselves about 1.5 s after each change ("Saved" in the header); unsaved edits are also kept on your device.

Next to the switcher are two controls. The **view mode** (keys 1 to 6):

| Mode | What it shows |
| --- | --- |
| **Blank slate** | Only the building's structure: walls, columns, doors, stairs and the sales desks. Read-only. |
| **Current layout** | The master map as confirmed today, with its departments and fixtures. Read-only. |
| **Area planning** | Edit this map: place and shape the departments (the list on the left), move fixtures, unlock the structure. Blocks that overlap a wall, column, stairs, desk, doorway clearance or another block get a red outline, a message in the panel's Checks and a "3 warnings" chip that takes you to the first one. |
| **Comparison** | Two layouts (the master and this map by default; any two you can see) side by side with the plans locked together, or as an overlay (green = added, grey dashed = removed, blue = moved / resized / rotated), with every difference listed in plain words. The admin can **Apply** a row, or **Apply all**, to the master. |
| **Advisor** | Retail-flow checks on this map: an overall score, each principle with its reasoning, ranked recommendations with **Show me** (highlights the spot) and **Apply** (a one-tap move or resize you can undo), overlays (heat, sight lines, traffic paths, choke points, door zones, cold spots) and the assumptions behind every number (the admin can change and save them). |
| **Review** (admin only) | The team's proposals (filter by status), any map against the master, and the master's history. Opening a proposal shows its differences from today's master with before/after ghosts; tick the rows to apply and **Approve**, or send it back with **Needs changes** or **Decline**, each with a note. Old master versions can be previewed and **Restored** (a restore saves a new version; nothing is deleted). |

and the **display** (Shift+1 / 2 / 3): **Plan** (the floor from above), **3D** (orbit around the store) or **Walk**
(a customer's eye height). Every mode works in every display.

| On a computer | |
| --- | --- |
| 1 / 2 / 3 / 4 / 5 / 6 | Blank slate / Current layout / Area planning / Comparison / Advisor / Review (admin) |
| Shift+1 / 2 / 3 | Plan / 3D / Walk |
| Click, Shift-click, drag on the floor (Plan) | Select, add to the selection, marquee select |
| Arrows / Shift+arrows (something selected) | Nudge 6" / 5' |
| Ctrl+Z / Ctrl+Shift+Z, Ctrl+D, Delete, R | Undo / redo, duplicate, delete, rotate 90° |
| V / H / M | Select / Pan / Measure tool |
| Drag, right-drag, wheel (3D) | Turn around the store, move across it, zoom |
| Arrow keys | Move the view (3D, Plan) |
| W A S D or the arrow keys (Walk) | Walk (hold Shift to go faster) |
| Q / E (Walk) | Turn left / right |
| Double-click | Focus that spot (3D) or walk there (Plan, Walk) |
| F / T (3D) | Reset the view / top view, north up |
| M | Measure / place (click A, then B; Esc clears) |
| S | Snap on / off (3D, Plan) |
| L / G | Labels / grid on / off |
| Space (Walk) | Slow 360° look |
| ? | Show the controls |

On a phone or tablet the modes scroll sideways under the header and the tools are along the bottom of the
screen: drag to turn or look around, two fingers to move, pinch to zoom, tap a fixture for details, tap the floor
to walk there (Walk) or to place A and B (Measure). In Area planning the bottom bar has **Add** (fixtures,
structure, a department block) and **Departments** (your progress, Find a product, New category). In Comparison,
Advisor and Review the **Changes** / **Advisor** / **Review** button opens the list as a sheet. Every sheet scrolls
as one piece; pull the grab bar at its top to make it taller or shorter.

The button with your name (or the person icon on a phone) in the top-right corner has **Sign out**, and for you,
**Admin dashboard** and the two **Map settings** switches (sharing, master lock).

## How the planner works (for the team)

- **Everyone gets their own maps.** Tap the map name in the header, then **New map**: a full copy of the master,
  a blank store (walls, doors, columns, floors and stairs only), or a copy of any map you can see. You can have
  30; rename or delete them from the same menu. Only you can change your maps, and they save by themselves —
  "Saved" in the header means it's on the site, and unsaved edits are kept on your device even offline.
- **The master map is the confirmed layout** the store will actually use. Everyone can open it (it's read-only
  for members); only the admin can change it, and every change makes a new numbered version, so nothing is ever
  lost.
- **Propose your idea.** On a map of your own, press **Submit for review** in the header, say what you changed,
  and send it. The chip then shows where it stands: **Submitted**, **Approved**, **Needs changes** or
  **Declined**, with the admin's note. You can withdraw or re-submit any time; your map stays yours throughout.
- **The admin reviews in the Review mode** (key 6): every proposal is listed with its differences from today's
  master in plain words ("Moved 'SAFETY ISLE' 4' 6" north"). The admin can approve all of it, tick just the rows
  to apply, ask for changes, or decline — always with a note back to you. Approved rows land on the master as a
  new version that records whose map it came from.
- **The master lock**: the admin can lock the master (admin dashboard or the account menu) so nobody — the admin
  included — can change it while the team talks something over. The header shows a **Locked** badge and every
  save answers "The master map is locked."
- **Sharing**: normally you see only your own maps and the master. The admin can turn on "Share everyone's maps
  with the team"; then everyone can open everyone's maps read-only (with a **View only** badge) and copy them.
  The admin always sees all maps.
- **View modes**: Blank slate to picture the empty floor, Current layout for today's confirmed store, Area
  planning to edit, Comparison to see two layouts' differences, Advisor for retail-flow scores and one-tap
  fixes, Review (admin) for proposals and history. The Plan / 3D / Walk displays work in every mode.

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

`public/data/master.json` seeds master version 1 (locally by `npm run seed-master`, in production by the steps
in `docs/DEPLOY-PHASE2.md`); after that the layout lives in the database and is changed in the app (the admin
edits the master or approves proposals — every change is a new version).

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
