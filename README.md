# FBS Boise Store Map

A website that lets you look around the FBS Boise store the way a customer
would. It lives at **https://franklinmap-boise.com**.

There are two views:

- **Walk** (opens first): you stand just inside the front door at eye height
  and can look and walk around the store in 3D. The card in the top-right
  corner tells you which part of the store you are in and what you are near.
  The small map in the bottom-left shows where you are; tap it to walk there.
- **Map**: the floor plan from above. Click any fixture to see what it is and
  its size, then press **Go look at it** to walk over and face it.

The site is view only. Nobody can change the layout from the website.

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

## Changing the store layout

Everything in the store (walls, doors, shelves, desks) is listed in
`public/js/store-data.js`, one line per item. Each line gives the item's
position (`x` = feet from the west wall, `y` = feet from the south wall),
its size (`w` long, `d` deep, `h` tall) and its rotation in degrees (`rot`).
Change the numbers, save the file, and the change shows up the next time the
site is deployed (see below). The photos used on shelves and desks are in
`public/tex/`.

## Running it on your own computer

You need [Node.js](https://nodejs.org) installed. Then, in this folder:

```bash
npm install
npm run dev
```

and open http://localhost:8787 in your browser. `npm run check` runs a quick
self-check of the site files.

## How it gets published

The site is a Cloudflare **Worker** called `fbs-boise-map` that only serves
the files in `public/` (there is no server code). Cloudflare Workers Builds
watches this repository: when a change is merged into the `main` branch, it
deploys the Worker `fbs-boise-map`, which serves franklinmap-boise.com.
Nothing else needs to be done by hand.

## Make it team-only

To let only your team see the site, put it behind Cloudflare Access. In the
Cloudflare dashboard:

0. If Cloudflare asks you to set up Zero Trust first, do that (the free plan
   is fine).
1. Go to **Workers & Pages** and open **fbs-boise-map**.
2. Open the **Access** tab.
3. Click **Protect this Worker behind Access**.
4. Choose **All traffic**.
5. Choose who can sign in: add the specific email addresses of the people
   who should have access.
6. Click **Apply Access**.

This covers franklinmap-boise.com, the workers.dev address and preview links.

If your team members don't have Cloudflare logins, turn on email codes once:
**Zero Trust → Integrations → Identity providers → Add new identity provider →
One-time PIN**. People on the list can then sign in with a code sent to their
email.

Note: every deploy switches the workers.dev address
(`fbs-boise-map.<your-subdomain>.workers.dev`) back on. Access protects it too,
so this is fine. If you want the site to answer only at franklinmap-boise.com,
add the line `workers_dev = false` to `wrangler.toml`.

## Old settings you can delete

The site used to have a server part that called the paid Meshy AI service.
That is gone, so these Worker secrets are no longer used: `MESHY_API_KEY`,
`SITE_ACCESS_CODE`, `PEPPER`, `PHONE_KEY`, `NTFY_TOPIC` and any other old
ones. You can delete them in the Cloudflare dashboard under **Workers &
Pages → fbs-boise-map → Settings → Variables and Secrets**.

## What's in this folder

- `public/` – the website itself (`index.html`, `css/`, `js/`, the store
  photos in `tex/`, and self-hosted copies of three.js and the fonts).
- `public/_headers` – security settings sent with every page.
- `wrangler.toml` – tells Cloudflare to serve `public/`.
- `scripts/check.mjs` – the self-check behind `npm run check`.
- `docs/` – background notes from earlier work.
