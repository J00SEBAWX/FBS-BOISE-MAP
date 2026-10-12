# FBS Boise Store Map v3: UI design spec

This is the look and behaviour of the v3 app described in the product spec (maps, Walk / Plan / Categories /
Review). Build pages from these files; do not invent new colours, sizes or icons:

| File | What it is |
|---|---|
| `public/assets/tokens.css` | Every colour, size, radius, shadow, z-index, font and motion value, light + dark. Load it **first** on every page (map app, sign-in, admin, 404). It also declares the self-hosted `@font-face`s. |
| `public/assets/icons.svg` | SVG sprite, 50 icons in one stroke style. `<svg class="i" aria-hidden="true" focusable="false"><use href="/assets/icons.svg#i-undo"/></svg>` |
| `public/assets/brand/fbs-logo.png` | Official logo, transparent outside the oval, 196 x 160 (use at 80px tall or less). |
| `public/assets/brand/fbs-logo-64.png` | Same, 78 x 64 (header: shown 30-34px tall, so it stays sharp at 2x). |
| `public/assets/brand/favicon-32.png` | Browser tab icon (logo on transparent). |
| `public/assets/brand/favicon-192.png` | Android / manifest icon (logo on white, inside the 80% safe zone). |
| `public/assets/brand/apple-touch-icon.png` | iOS home-screen icon, 180 x 180, logo centred on white with padding. |

Principles, in order:

1. **Calm and plain.** White panels, cool greys, one blue. Words a store manager would use ("Make my own copy",
   not "Fork"). No emoji, no decorative gradients, no animation that is not feedback.
2. **Blue means "this is the tool talking".** FBS Blue `#006CB4` is primary actions, the active tab, links, focus,
   the selection outline, dimension readouts and the measure tool. FBS Sky `#609CD8` is highlights and the
   selection fill. Nothing else on the page is blue except a department that happens to be cyan or indigo.
3. **Red only means "destructive" or "error".** Delete, Remove, the conflict banner, error text. The old red accent
   `#c8102e` is retired everywhere (map app, sign-in, admin, 404, favicon).
4. **Touch first, mouse fast.** Every tappable thing is at least 44 x 44 on touch screens (`--hit`). Nothing depends
   on hover: hover only adds an outline or a tooltip for something that is also reachable by tap/keyboard.
   With a mouse, toolbars are denser (36px controls) and every action has a keyboard shortcut.
5. **Never colour alone.** States carry an icon or a word too (lock icon + "Structure locked", check icon + "Placed",
   warning icon + sentence in Checks, "View only" badge).
6. **Same plan everywhere.** Walk, Plan, Categories and Review all draw the same map with the same tokens; only the
   layers and the chrome change.

---

## 1. Brand

### Logo

- Use the PNGs as they are: no recolouring, no stretching, no effects, no cropping to "just FBS". Scale uniformly.
- The logo's inside is **white** (the band inside the ring, the letters, the ring gap). On white or very light
  surfaces (`--surface`, `--surface-2`, `--bg` light) put it directly on the page.
- **On any dark or coloured background (dark mode header, `#0f1a26`, FBS Blue) put it on a white rounded badge:**
  `background:#fff; border-radius:10px; padding:3px 5px;` (badge radius ~ 30% of the logo height). Without the badge
  the white interior reads as a hole and the right-hand ring gap shows as a white notch. The badge is always white,
  in both themes (it is the logo's own background, not a surface token).
- Minimum size: 28px tall (below that "100% EMPLOYEE OWNED" turns to mush; use the favicon instead).
- Clear space: at least 8px (or the badge padding) on every side; never place text or icons inside the badge.
- `alt="Franklin Building Supply"` when it is the only identification; `alt=""` (decorative) when the wordmark
  text "FBS Boise Store Map" sits right next to it.

### Wordmark (header)

Two lines next to the logo: `FBS BOISE` (Barlow Condensed 600, 12px, `--tracking-caps`, `--ink-muted`) over
`STORE MAP` (Barlow Condensed 700, `--display-md` 20px, `--ink-heading`). Hidden on phones (the logo alone is enough).

### Favicons and theme colour (every page, including sign-in, admin and 404)

```html
<link rel="icon" href="/assets/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/assets/brand/favicon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1a26" media="(prefers-color-scheme: dark)">
```

`public/favicon.svg` (the red tile) and the inline red-tile `.logo` SVGs in `login.html`, `admin/index.html` and
`src/worker.js` (404 page) are replaced by the logo image (badge in dark mode).

---

## 2. Tokens (`public/assets/tokens.css`)

Light is the default. Dark follows `prefers-color-scheme` unless the page sets `<html data-theme="light|dark">`
(the two dark blocks in the file must stay identical). Components only ever use **semantic** tokens
(`--surface`, `--ink`, `--accent`...), never the raw ramps (`--fbs-blue-300`, `--grey-600`), so dark mode is free.

| Group | Tokens | Use |
|---|---|---|
| Brand | `--fbs-blue` `--fbs-sky` `--fbs-navy` `--fbs-blue-50…900` `--grey-25…900` `--night-500…950` | Raw palette; reference only through semantic tokens. |
| Surfaces | `--bg` `--surface` `--surface-2` `--surface-3` `--surface-sunken` `--surface-inverse` `--scrim` | App background, panels, inputs/rows, hover, tab/segment tracks, toasts, dialog backdrop. |
| Ink | `--ink` `--ink-heading` `--ink-muted` `--ink-subtle` `--ink-disabled` `--ink-inverse` | Body, headings (navy), labels/meta, placeholders/captions, disabled only, text on inverse. |
| Lines | `--line` (decorative dividers) `--line-strong` (control outlines, 3:1) | |
| Accent | `--accent` `--accent-hover` `--accent-pressed` `--accent-ink` `--accent-text` `--accent-soft` `--accent-soft-ink` `--accent-line` `--focus` `--focus-halo` | Primary buttons, active tab, links, selected rows/chips, focus ring. |
| Status | `--danger*` `--warning*` `--success*` (each: base for icons/fills, `-text`, `-soft`, `-soft-ink`; danger also `-ink` + `-hover`) | Errors/destructive, checks and retries, saved/placed. |
| Plan | `--plan-bg` `--plan-floor` `--plan-grid` `--plan-grid-major` `--plan-wall` `--plan-structure` `--plan-door` `--plan-fixture-fill` `--plan-fixture-stroke` `--plan-item-mix` `--plan-label` `--plan-label-halo` `--plan-scan` `--plan-scan-obj` `--plan-measure` `--plan-dim-bg` `--plan-dim-ink` `--plan-ghost-before` `--plan-ghost-after` `--plan-faint` | Canvas drawing (read with `getComputedStyle`, see 4.4). |
| Selection | `--sel-stroke` `--sel-fill` `--sel-handle` `--sel-handle-stroke` `--sel-hover` `--sel-marquee-fill` `--sel-marquee-stroke` `--snap-guide` | |
| Categories | `--cat-01` … `--cat-12`, `--cat-fill-alpha` | Department blocks, swatches, hanging signs. |
| Space | `--space-1…9` = 4, 8, 12, 16, 24, 32, 40, 48, 64; `--gutter` 16 | Everything snaps to 4, layout to 8. |
| Size | `--hit` 44, `--control-h` 36 (44 on `pointer:coarse`), `--control-h-lg` 44, `--header-h` 56, `--toolbar-h` 48, `--statusbar-h` 32, `--bottombar-h` 64, `--inspector-w` 320, `--palette-w` 280, `--icon-sm/md/lg` 16/20/24, `--icon-stroke` 1.75, `--handle` 8 (12 on touch) | |
| Radius | `--radius-xs` 4, `-sm` 6, `-md` 8, `-lg` 12, `-xl` 16, `-full` | chips/handles, inputs/icon buttons, buttons/rows, popovers/panels, dialogs/sheets. |
| Elevation | `--shadow-1` (floating buttons), `-2` (menus, popovers), `-3` (dialogs, sheets, toasts), `--shadow-inset` (inputs) | Dark mode uses deeper shadows plus the 1px `--line` border that every raised surface already has. |
| Z-index | `--z-canvas` 0, `--z-canvas-ui` 10, `--z-panel` 20, `--z-header` 30, `--z-sheet` 40, `--z-dropdown` 50, `--z-scrim` 60, `--z-dialog` 70, `--z-toast` 80, `--z-tooltip` 90 | Never use a number outside this scale. |
| Type | see section 3 | |
| Motion | `--dur-fast` 150ms (hover, press, toggles), `--dur-base` 200ms (menus, popovers), `--dur-slow` 250ms (sheets, dialogs, toasts); `--ease-standard`, `--ease-enter`, `--ease-exit` | Durations become 0ms under `prefers-reduced-motion`; keep the state change, drop the movement. Never animate the plan camera longer than `--dur-slow`. |

**Legacy names.** `tokens.css` maps the v2 names (`--paper`, `--panel`, `--panel-2`, `--muted`, `--accent-fill`,
`--ok`, `--warn`, `--map-*`, `--display`, `--body`, `--mono`, `--gut`, `--shadow`) to the new tokens so
`base.css`, `app.css`, `admin.css` and `login.css` pick up the new palette as soon as their own `:root` token blocks
are deleted. **But** v2 used `--accent`, `--accent-text` and `--accent-soft` (red) for errors as well; those names
now mean blue. Every error / destructive use must move to `--danger`, `--danger-text`, `--danger-soft`
(`.notice.error`, `.input[aria-invalid]`, `.btn.danger`, admin "Remove", sign-out confirm).

**CSP (`style-src 'self'`).** No `style="…"` attributes in HTML and no `<style>` inside SVG. Per-item colours
(department swatches, item colours) are set from JS with CSSOM: `el.style.setProperty("--c", value)`, which CSP
allows. The sprite and all assets are same-origin.

---

## 3. Typography

Fonts are self-hosted: Barlow Condensed 600/700 (headings, always UPPERCASE) and IBM Plex Sans 400/500/600
(everything else). Use `font-variant-numeric: var(--numeric)` (tabular) for coordinates, sizes, counts, zoom.

| Role | Font | Size / line | Weight | Notes |
|---|---|---|---|---|
| Eyebrow / section label | Barlow Condensed | `--display-xs` 13 / 1 | 600 | UPPERCASE, `--tracking-caps`, `--ink-muted` ("POSITION & SIZE", "MASTER") |
| Panel title | Barlow Condensed | `--display-sm` 16 / 1 | 700 | UPPERCASE, `--tracking-caps`, `--ink-heading` ("DEPARTMENTS") |
| Item name, dialog title | Barlow Condensed | `--display-md` 20 (22 in phone sheets) / 1.1 | 700 | UPPERCASE, `--ink-heading` |
| Wordmark, page title | Barlow Condensed | `--display-lg` 24 | 700 | |
| Empty-state / sign-in headline | Barlow Condensed | `--display-xl` 32 (20 inside panels) | 700 | |
| Dense UI (desktop) | IBM Plex Sans | `--text-md` 14 / 20 | 400-600 | buttons 600, list names 500 |
| Labels, meta | IBM Plex Sans | `--text-sm` 13 / 18 or `--text-xs` 12 / 16 | 500 / 400 | field labels 12/500 `--ink-muted` |
| Phone body, all inputs on phones | IBM Plex Sans | `--text-lg` 16 / 24 | 400 | 16px inputs stop iOS from zooming |
| Plan labels | IBM Plex Sans | 9.5-11px (scale with zoom, clamp 9-13) | 500 | always with the halo (4.4) |
| Plan department labels | Barlow Condensed | 12px (10 on phones) | 700 | UPPERCASE + area in Plex 10px |

Never go below 12px for UI text (11px only inside the sprite-sized badges "View only", "Current").

---

## 3a. Icons (`public/assets/icons.svg`)

One style: 24 x 24 grid, 1.75px stroke, round caps and joins, `stroke="currentColor"`, no fills (only the tiny dots
in warning / info / help / more). The icon takes the colour of its control; secondary icons use `--ink-muted`.

```html
<button class="tbtn" type="button" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
  <svg class="i" aria-hidden="true" focusable="false"><use href="/assets/icons.svg#i-undo"/></svg>
</button>
```
```css
.i{width:var(--icon-md);height:var(--icon-md);flex:none;display:block}
```

Sizes: 14-16px in the status bar, chips and inline text; 18px in labelled buttons, tabs and menus; 20px in icon-only
toolbar buttons; 22px in the phone bottom bar and sheet tiles; 28px inside empty-state tiles.

| Id | Meaning | Id | Meaning |
|---|---|---|---|
| `i-select` | Select tool | `i-hand` | Pan tool |
| `i-measure` | Measure tool | `i-add` / `i-minus` | Add, zoom in / zoom out, removed row |
| `i-undo` / `i-redo` | Undo / Redo | `i-duplicate` | Duplicate, Split into two |
| `i-delete` | Delete, Remove | `i-rotate` | Rotate 90° |
| `i-lock` / `i-unlock` | Structure / item locked / unlocked | `i-pencil` | Rename, changed row |
| `i-snap` | Snap | `i-layers` | Layers menu |
| `i-eye` / `i-eye-off` | Layer shown / hidden, read-only banner | `i-grid` | Grid layer |
| `i-zoom-in` / `i-zoom-out` | Zoom (if a magnifier is wanted) | `i-fit` | Fit to store |
| `i-crosshair` | Cursor coordinates | `i-walk` | Walk tab |
| `i-plan` | Plan tab | `i-blocks` | Categories tab, Departments button |
| `i-review` | Review tab | `i-map` | A map (own maps) |
| `i-star` | The master map | `i-history` | Master history, Restore |
| `i-user` | A person's maps | `i-sign-out` | Sign out |
| `i-search` | Find a map | `i-keyboard` | Shortcuts |
| `i-cloud-check` | Saved | `i-cloud-off` | Offline |
| `i-sync` | Saving | `i-check` | Done, placed, passed check |
| `i-warning` | Warning, failed check, not saved | `i-error` | Error, conflict |
| `i-info` | Hint | `i-help` | Help |
| `i-close` | Close, dismiss | `i-reload` | Reload, try again |
| `i-chevron` (+ `-up`, `-right`, `-left`) | Menus, disclosure | `i-arrow-left` | Back (phone sub-screens) |
| `i-more` | More actions | `i-grip` | Sheet / row drag handle |

---

## 4. Plan editor (the Plan tab)

### 4.1 Desktop layout (≥ 1024px wide)

```
+-- header 56 ---------------------------------------------------------------------------------+
| [logo] FBS BOISE / STORE MAP | [star Master map v / maker . when] [Walk|Plan|Categories|Review] |
|                                                     ... [cloud Saved] [?] [AJ v]           |
+-- toolbar 48 ---------------------------------------------------------+-- inspector 320 -----+
| [select][pan][measure] | [+ Add v] | [undo][redo] | [dup][rot][del]   | GONDOLA              |
|                         ... [lock Structure locked] [Snap] [Layers v] | MAKITA ROW 25'6"     |
+-- canvas -------------------------------------------------------------+ Position & size      |
|                                                             (N)       | Name & colour        |
|                         plan                                          | Gondola details      |
| [10 ft scale]                                                         | [Duplicate][Rotate]  |
+-- status bar 32 ------------------------------------------------------+ [del]   (sticky)     |
| x 71' 3"  y 48' 6" . 1 selected . Makita row ... hints  [-] 109% [+] [fit]                  |
+-----------------------------------------------------------------------+----------------------+
```
CSS grid: `grid-template-columns: minmax(0,1fr) var(--inspector-w)`; the canvas column is
`grid-template-rows: var(--toolbar-h) minmax(0,1fr) var(--statusbar-h)`. The page never scrolls; panels scroll
inside themselves.

**Header** (`--header-h` 56, `--surface`, bottom `--line`), left to right with 12px gaps:

1. Logo (`fbs-logo-64.png` at 34px tall; badge in dark mode) + wordmark, as one link to the default view.
2. 1px divider 28px tall.
3. **Map switcher** button (2 lines, 44px tall, max 300px, `--radius-md`, `--line` border): a 28px icon chip
   (`i-star` on `--accent-soft` for the master, `i-map` for own maps, `i-user` for someone else's), map name
   (`--text-md` 600 `--ink-heading`, ellipsis) over `maker · last changed` (`--text-xs` `--ink-muted`; for the master
   "Confirmed layout · AJ · 2 h ago"), `i-chevron`. Opens the map menu (section 8).
4. **View tabs**: segmented control, `role="tablist"`, track `--surface-sunken` with 3px padding, `--radius-md`.
   Each tab 36px tall, 18px icon (`i-walk`, `i-plan`, `i-blocks`, `i-review`) + label, 600 14px. Selected:
   `--accent` fill, `--accent-ink` text, `--shadow-1`. Unselected hover: `--surface`. Review only renders for the
   admin. Arrow keys move between tabs; the URL hash reflects the tab (`#plan`, `#categories`...).
5. Spacer.
6. **Save status** (`role="status"`, `aria-live="polite"`), 13px, icon 18px:
   - Saved: `i-cloud-check` in `--success`, "Saved" in `--ink-muted`.
   - Saving…: `i-sync` in `--accent-text` (rotates 1 turn/s; static under reduced motion), "Saving…".
   - Not saved: `i-warning` in `--warning`, "Not saved · retrying" in `--warning-text`.
   - Offline: `i-cloud-off` in `--ink-muted`, "Offline · kept on this device".
   - Read-only map: nothing here (the banner says it).
7. Help (`i-help`, 44px ghost icon button) → shortcuts dialog (section 9).
8. Account: 32px initials avatar (`--accent-soft` / `--accent-soft-ink`) + `i-chevron` → menu: "Signed in as
   <first name>", Admin dashboard (admin), Theme (System / Light / Dark), Sign out.

**Toolbar** (`--toolbar-h` 48, `--surface`, bottom `--line`, `role="toolbar"`, 2px gaps, 8px side padding,
groups separated by a 1px x 24px `--line` divider with 6px margins):

| Group | Controls (`--control-h` square icon buttons: 36px with a mouse, 44px on touch screens; `--radius-sm`, 20px icons) | State |
|---|---|---|
| Tools | Select `i-select` (V), Pan `i-hand` (H / hold Space), Measure `i-measure` (M) | radio-like: active tool `aria-pressed="true"` = `--accent-soft` fill, `--accent-soft-ink` icon, 1px `--accent-line` inset ring |
| Add | Primary button "Add" with `i-add` + `i-chevron` (36px tall) | opens the Add palette (4.6) |
| History | Undo `i-undo` (Ctrl+Z), Redo `i-redo` (Ctrl+Shift+Z / Ctrl+Y) | disabled = `--ink-disabled`, no hover |
| Selection | Delete `i-delete` (Del, icon in `--danger-text`); Duplicate (Ctrl+D) and Rotate 90° (R) are in **More** and the inspector | disabled with no selection |
| (spacer) | | |
| Toggles (label buttons, 36px, 13px 500, 18px icon) | **Layers** (`i-layers` + chevron), **More** (`i-more`: Structure locked / unlocked, Snap, Duplicate, Rotate 90°, Dimensions, help; the same menu as the phone's More sheet, so the bar keeps only what a first-time planner needs) | Structure locked = neutral pressed (`--surface-2`, `--line` border) because locked is the safe default; unlocked = `--warning-soft` fill, `--warning-soft-ink` text + `i-unlock`, so it is obvious structure can now move. Snap on = accent-soft pressed. |

Every icon button has `aria-label` and a `title` tooltip with its shortcut ("Undo (Ctrl+Z)"). Tooltips appear after
500ms hover or on keyboard focus, `--surface-inverse` / `--ink-inverse`, 12px, `--radius-sm`, `--z-tooltip`.
Below 1180px the toggle labels collapse to icons (keep `aria-label` + `aria-pressed`).

**Status bar** (`--statusbar-h` 32, `--surface`, top `--line`, 12px `--ink-muted`, tabular figures), left to right:
cursor position `i-crosshair` "x 71' 3"  y 48' 6"" (feet from the south-west outside corner), selection summary
("1 selected · Makita row 25' 6" × 4' 0"", "3 selected", or the hovered item name), a contextual hint with
`.kbd` keycaps (hidden below 1280px), then right-aligned zoom: `i-minus` / percentage / `i-add` / `i-fit`
(28 x 26 buttons; desktop pointer only, so 24px+ is enough). 100% = the whole store fits the canvas.

**Canvas overlays**: north marker `N` (36px circle, top-right, `--shadow-1`); scale bar bottom-left (10 ft, or
5/25/50 ft as zoom changes, on 88% `--surface`); on-canvas banners (read-only, conflict, offline) top-centre,
max 640px wide, 12px from the toolbar (section 8). Floating elements use `--z-canvas-ui`.

### 4.2 Inspector (right panel, 320px)

`--surface`, left `--line`, scrolls on its own; the action row is `position: sticky; bottom: 0` so Duplicate /
Rotate / Delete never scroll away.

- **Header** (16px padding, bottom `--line`): eyebrow with the item type ("GONDOLA", "WALL", "DEPARTMENT · TOOLS");
  a `Locked` chip (`i-lock`, 22px, `--surface-2`) only when the item or structure is locked; item name in
  `--display-md`; meta "Changed by you · 4 min ago" (`--text-xs` `--ink-muted`).
- **Position & size** (2-column field grid, 10px row gap, 12px column gap): X (from west), Y (from south), Length,
  Depth, Height, Rotation (°). Fields are text inputs (`inputmode="decimal"`) that show ft-in (`25' 6"`) and accept
  `25.5`, `25'6`, `25' 6"`, `306"` or `7.77m`; Enter or blur commits (one undo step), Esc reverts, Up/Down step 1",
  Shift 6". Invalid input: `aria-invalid`, `--danger` border and a one-line `--danger-text` message under the field.
- **Name & colour**: Name (max length from the server limits). Colour: radio group of 26px swatches (the store's
  common fixture colours: fixture grey, white, black, Milwaukee red, DeWalt yellow, Makita teal, Kreg blue, wood)
  + "Other" (`i-add`, opens a native `<input type="color">`). Selected swatch: 2px `--accent-text` ring with 2px offset.
- **Type details**: only the allow-listed fields for that type (gondola brand, shelf faces, door swing, stairs
  direction, ceiling height, platform height...). Booleans are switches (36 x 20 track, `--line-strong` off,
  `--accent` on, label on the left, whole row tappable).
- **Actions** (sticky): Duplicate, Rotate 90° (secondary buttons) and an icon-only Delete (`--danger-text`,
  `aria-label="Delete"`).
- **Re-drawing**: an edit, an undo or a target change never rebuilds the panel while the same thing is selected: values,
  the area readout and the Checks are patched in place, so the field the person clicks or Tabs into next (a field commits
  as it loses focus) is still there and keeps focus. It is rebuilt only when its structure changes (another selection,
  the Structure lock, Edit shape, a department change), and then the focused control, its caret and the scroll position
  are put back. A field that commits never makes the following keystrokes shortcuts (core/keys.js).
- **Footer**: item id + a one-line tip (`--text-xs` `--ink-subtle`).
- **Multi-select**: header "3 ITEMS SELECTED"; only shared fields (rotation, colour, height) + Align (left, centre,
  right, top, middle, bottom) + Distribute; actions apply to all.
- **Nothing selected**: map summary card (name, maker, item counts by type, last changed), "How to edit" tips
  (Tap an item to select it · Drag to move · Corner handles resize · Top handle rotates), and the layers list.
- **Structure item while locked**: fields render read-only (plain text, no input chrome) with an inline notice
  "Structure is locked. Unlock it in More to change walls, doors, columns, floors and stairs." and an
  "Unlock structure" button.

### 4.3 Phone layout (< 768px; also any `pointer: coarse` window under 1024px)

```
+-- header 56: [logo badge] [star Master map v / AJ . 2 h ago  (flex)] [cloud] [AJ] --+
+-- tabs 52: [ Walk | Plan | Categories | Review ]  (full width, labels only) --------+
| [10 ft]                                                             [fit]           |
|                          plan (full bleed)                          [layers]        |
|                                                                                     |
+-- bottom sheet (inspector / palette), over the canvas ------------------------------+
+-- bottom toolbar 64 + safe area: [Undo] [Redo] [(+) Add] [Measure] [More] ----------+
```
- Header: logo badge (30px logo) · map switcher takes the remaining width (name + "maker · when") · save status as an
  icon-only 44px status (its text stays in an `sr-only` span and in the switcher menu) · avatar. Help moves into
  More. Wordmark hidden.
- Tabs row: full-width 4-column segmented control, 38px segments, labels only (13px 600), `--surface` band with
  bottom `--line`.
- Floating canvas buttons (44 x 44, `--surface`, `--line`, `--shadow-1`, `--radius-md`), top-right stack: Fit
  (`i-fit`), Layers (`i-layers`). Scale bar top-left. No zoom buttons: pinch to zoom.
- **Bottom toolbar** (`--bottombar-h` 64 + `env(safe-area-inset-bottom)`, `--surface`, top `--line`, always visible,
  5 equal slots, each ≥ 44px with a 22px icon over a 12px 500 label): Undo, Redo, **Add** (centre, 48 x 32
  `--accent` pill around the icon, label in `--accent-text`), Measure, More. Add stays in every Plan; in Area
  planning (the v3.1 merge of Plan and Categories) **Departments** (`i-blocks`) is a sixth slot after Add, a little
  wider than the others so its label fits (the bar is then 6 slots, each ≥ 44px down to 320px wide), and opens the
  palette sheet. The palette and the mode panels (Comparison, Advisor, Review) are bottom sheets that scroll as one
  piece (head, list and foot together; a foot with actions, such as Review's Approve / Needs changes / Decline row,
  stays pinned at the bottom): *peek* is 76% of the canvas, *expanded* 92%, switched by the 36 x 4 grab bar; in
  landscape they dock to the left edge, 340px wide, full height.
- **More** sheet (a menu under the More button on a computer too): Structure locked/unlocked switch, Snap switch, Select several (multi-select mode, since there is
  no Shift key), Layers, Keyboard & help, Fit to store.
- **Gestures** (no hover, no right-click): tap = select (tap empty floor = clear); drag a selected item = move;
  drag on empty floor or on an unselected item = pan; two-finger pinch/drag = zoom/pan; long-press (500ms) on an
  item = add it to the selection (also "Select several" in More). Handles are 12px visual squares
  (`--handle`) with a 44px invisible hit area; when the selection box is narrower than 3 handles on an axis, its
  middle handles on that axis are hidden (corners still resize). The rotate handle sits 30px above the top edge.
- **Bottom sheet inspector** (`--surface`, top corners `--radius-xl`, `--shadow-3`, `--z-sheet`, above the bottom
  toolbar): 20px grab bar (36 x 4 `--line-strong` pill), then three snap heights:
  - *Peek* (46% of the canvas; opens on selection): eyebrow + name (22px) with a 44px close `i-close` at top right;
    quick actions as four 56px tiles (icon over label): Rotate 90°, Duplicate, Lock, Delete (`--danger-text`); then
    the Position & size fields (44px tall, 16px text).
  - *Expanded* (max 88% of the canvas): every inspector section, scrolling inside.
  - *Closed*: tap the close button, tap empty floor, or swipe down.
  The sheet pans the plan so the selection stays visible above it.

### 4.3b Tablets and narrow windows (768-1023px)

Desktop structure with three changes: the toolbar toggles show icons only (Structure, Snap, Layers keep
`aria-label` + `aria-pressed`) and the status-bar hints are hidden; the inspector becomes a right-hand drawer
(320px, `--shadow-3`, `--z-sheet`, slides in on selection with `--dur-slow`, closes with `i-close` or Esc) instead
of a fixed column; the Categories palette becomes a 280px left drawer opened from the "Departments" toolbar button.
On touch tablets `--control-h` is 44px automatically (`pointer: coarse`), and the phone gestures in 4.3 apply.

### 4.4 Drawing the plan (canvas)

Read colours once per theme change (`matchMedia('(prefers-color-scheme: dark)')` change event + `data-theme`
changes) with `getComputedStyle(document.documentElement).getPropertyValue('--plan-floor').trim()`. Canvas cannot
read `color-mix()`: mix item colours in JS (`mix(item.color, planFloor, parseFloat(--plan-item-mix)/100)`).

Draw order (bottom to top), stroke widths in screen pixels (do not scale with zoom):

1. `--plan-bg` everywhere; building outline filled `--plan-floor`.
2. Grid (layer "Grid"), clipped to the building: 5 ft lines `--plan-grid`, 10 ft lines `--plan-grid-major`,
   1 ft lines only when they are ≥ 12px apart; never draw lines closer than 8px.
3. Floors: 1px `--plan-structure` outline; room names (WAREHOUSE, SALES FLOOR, FRONT ROOM, VON'S AREA) in
   Barlow Condensed 600 12px, letter-spacing .14em, `--ink-subtle`, skipped where a department block covers them.
4. Zones: 1px dashed (4 4) `--plan-door`.
5. Department blocks (layer "Categories"): fill `--cat-NN` at `--cat-fill-alpha`, 2px `--cat-NN` stroke, 2px radius.
6. Fixtures: fill = item colour mixed into `--plan-floor` at `--plan-item-mix` (45% light, 30% dark), 1px
   `--plan-fixture-stroke`, 1px radius (4px for the octagonal sales desk); platforms dashed (3 2); stairs get tread
   lines every ~6px. In Categories they draw at `--plan-faint` opacity when "Show fixtures faintly" is on, else not at all.
7. Structure: walls and columns solid `--plan-wall` (min 2px thick on screen); doors / openings / arches cut the wall
   with `--plan-floor`, show 1.5px jamb ticks, doors add a 1px `--plan-door` swing arc into the room, openings a
   dashed (3 3) centre line.
8. Overlays: "Scan lines" (DXF) 1px dashed `--plan-scan`; "Scan objects" 1px dashed `--plan-scan-obj` boxes with a
   10px label "Scan: storage shelf" in the same colour (labels are RoomPlan guesses; always prefix "Scan:").
9. Labels (layer "Labels"): item name, IBM Plex Sans 500, 9.5-11px, `--plan-label` with a 3px `--plan-label-halo`
   stroke behind (`paint-order: stroke`), centred, rotated with the item's long axis (never upside down). If the
   name is wider than the item minus 6px, use its first two words; if that still does not fit, no label (hover /
   select shows it in the status bar or sheet).
10. Selection: `--sel-fill` + 2px `--sel-stroke` (fixtures; department blocks get the stroke only, so their colour
    stays readable); 8 square handles `--handle` (8px mouse / 12px touch), `--sel-handle` fill, 1.5px
    `--sel-handle-stroke`, 2px radius; rotate handle = 6px (8px touch) circle on a 1.5px stem 24px (30px touch)
    above the top edge. Hover (mouse only): 1.5px `--sel-hover` outline. Marquee: `--sel-marquee-fill` +
    1px dashed `--sel-marquee-stroke`.
11. Live readouts while dragging/resizing/rotating (layer "Dimensions" also shows them for the selection at rest):
    size pill on the long edge, distance to the nearest wall on each axis as a 1.25px dashed `--plan-measure` line
    ending at the wall with a pill at its middle, angle pill while rotating ("90°", snapping every 15°, Shift = free).
    Pill = 20px tall, `--radius-full`, `--plan-dim-bg`, 11px 600 `--plan-dim-ink`, ft-in.
12. Snap guides: 1px `--snap-guide` line across the canvas for 600ms when an edge snaps to another edge or wall.
13. Measure tool: tap/click point A then B: 1.5px `--plan-measure` line with 6px end ticks and a pill
    "23' 4"" at the middle; stays until Esc or a new measurement; a third tap starts again.

### 4.5 Layers menu

Popover from the Layers button (phone: from the floating Layers button, as a sheet). One row per layer, 40px
(44px touch): a 20 x 12 legend key drawn in that layer's token, the name (+ a one-line explanation for the scan
layers), and an eye toggle (`i-eye` / `i-eye-off` in `--ink-subtle`, `aria-pressed`). Layers: **Labels**,
**Dimensions**, **Scan lines** ("Walls traced by the 3D scan"), **Scan objects** ("Boxes the scanner found,
labelled"), **Categories**, **Grid**. Defaults: Plan = Labels, Categories, Grid on; Categories tab = Labels,
Categories, Grid on and fixtures faint off. Saved per device (localStorage, try/catch).

### 4.6 Add palette

Popover from "Add" (phone: sheet from the Add tab button). Two groups in a 2-column grid of 40px rows: a 30 x 22
proportional preview of the item (drawn with plan tokens) + name. **Fixtures**: Gondola, Wall unit, Rack, Counter,
Table, Display, Tower, Platform, Zone. **Structure**: Wall, Column, Door, Opening, Stairs. While structure is
locked the structure rows show `i-lock` and are `aria-disabled` with the hint "Unlock **Structure** in More
to add walls, doors, columns, openings or stairs." Choosing an item drops it in the middle of the visible plan with
the store's default size for that type, selected, so the inspector opens; one undo step.

---
## 5. Categories (the "blank slate" tab)

Same shell and toolbar as Plan, with a **Departments palette** on the left (desktop) and a department inspector on
the right. Grid: `var(--palette-w) minmax(0,1fr) var(--inspector-w)`.

- Plan drawing: structure only (walls, doors, openings, arches, columns, floors, stairs, zones). Fixtures hidden;
  "Show fixtures faintly" draws them at `--plan-faint`. Department blocks on top (4.4 step 5), labelled with the
  department name (Barlow Condensed 700 12px UPPERCASE, first word only when the full name does not fit) and the
  area ("613 sq ft", Plex 500 10px), both with the halo.
- Brand sections (`core/brands.js`): **Place** on Power Tools first asks "Which brand is this section?" (a dialog
  with three logo buttons: Milwaukee, DeWalt, Makita; Cancel places nothing). The block keeps `brand`, starts at the
  brand's share of the target (the catalog's groups: 45 / 30 / 25%), is labelled "POWER TOOLS · MILWAUKEE" and is
  measured against its share. The row keeps its Place button ("2 of 3 brands") until all three are down. Simpson
  Strong-Tie is its own department. A brand section is floored with the brand's 12" x 12" tiles (a checkerboard of
  its colour and #1C1C1C on the store's 1 ft grid) on the plan and in 3D; in 3D it also gets a soft PointLight in the
  brand's light colour, an LED cove line at 8' 9" and a two-sided neon sign at the back of the section (logo on a
  backlit panel, the name in neon). Colours: Milwaukee #DB011C, DeWalt #FEBD17, Makita #008290, Simpson #FF5308.
- Toolbar: the Add button becomes "+ Department" (opens the same list as the palette); Structure toggle hidden
  (structure is never editable here); Snap and Layers stay.
- **Overlap check on the plan**: the shared rectangle of two overlapping blocks is hatched (45°, 2.5px
  `--warning` stripes every 6px over `--warning-soft` at 70%) with a 1.5px `--warning` outline, so the problem is
  visible without opening the inspector. A block that blocks a doorway/stairs or leaves the building gets the same
  hatch on the offending part.

**Palette** (`--surface`, right `--line`, scrolls inside):

- Header: "DEPARTMENTS" (`--display-sm`), progress "**7 of 10** departments placed" (14px) and a 6px progress bar
  (`--surface-sunken` track with a 1px `--line` inset, `--accent` fill, `role="progressbar"`), then the
  "Show fixtures faintly" switch.
- One row per catalog department (52px min, `--radius-md`, whole row is one button): 18px swatch (2px `--cat-NN`
  border, fill = the same colour at `--cat-fill-alpha`), name (14px 500, wraps to 2 lines, never truncated) over
  meta (12px `--ink-muted`: "613 sq ft" or "Not placed yet"), and on the right either a `--success` `i-check`
  (with sr-only "Placed") or a "+ Place" affordance (28px, `--accent-line` border, `--accent-text`). Selected
  department row: `--accent-soft` with a 1px `--accent-line` inset.
- Tap a not-placed department (or Place on any row): arms it. Its row turns `--accent-soft` with the meta "Tap the
  floor where it goes" and a Cancel affordance; a chip at the top of the plan (`--accent-soft`, swatch + name + "Click the
  floor where it goes (or drag to draw its size)." + Cancel) says what to do; the cursor is a crosshair; on a phone
  the Departments sheet closes and the plan fits the screen. The next press on the floor draws the block (finger or
  mouse): a dashed rectangle in the department's colour with a pill "20' 0" × 12' 0" · 240 sq ft" at its centre, corners
  on the 6-inch grid while Snap is on (Alt = free). Lifting creates exactly that block, kept inside the walls, and selects it
  (toast "Power Tools placed · 240 sq ft. 9 more to go."). A tap, or anything smaller than 2 × 2 ft, drops the catalog
  starting size centred on the tap instead. Esc, Cancel, the row again or a second finger (pinch) cancels. In the 3D view the
  same pick + click-the-floor flow with a ghost block applies. Tap a placed one: selects it and pans to it. A department can
  be placed more than once (Split into two); the meta then reads "2 spots · 640 sq ft".
- Footer hint: "Press Place next to a department, then tap the floor where it goes. Drag the block to move it; pull a corner to resize it."
  (Dragging on the floor while a department is waiting still draws exactly that rectangle.)
- Above the list on a computer: "Shelves, racks and displays (Hide for a blank slate)" with **Show / Faint / Hide**. Hide is the
  blank slate: there is no separate Blank slate mode; a map started from "A blank store" is the other way to get one.

**Department inspector**: header = swatch + eyebrow "DEPARTMENT · <family>", name, "Placed by AJ · 12 min ago".
Sections: **Area** (big number "613 sq ft" in Barlow Condensed 700 28px + "24' 6" × 25' 0"", and "Suggested size for
this department: 450 to 1,000 sq ft"); **Checks** (list, 18px icon + sentence, 13px):
`i-warning`/`--warning` + bold `--warning-text` lead ("**Overlaps Hand Tools & Measuring** by 18 sq ft. Move one of
them or make it smaller."), `i-check`/`--success` for passed checks ("Keeps doorways, arches and stairs clear",
"Inside the building"), `i-info`/`--accent-text` for near-rule hints ("Best next to Bits, Blades & Cutting (it is)
and Pneumatic & Air Systems (not placed yet).") Failed checks come first. **Subcategories** (first 4, "Show all
6" link); **Notes** (textarea, placeholder "Anything the team should know about this spot"); **Position & size**;
sticky actions **Split into two** (duplicate) and **Remove** (`--danger-text`, undo toast).

**Phone**: the palette is a bottom sheet over the canvas (opened by the Departments button; peek = header +
progress + first rows, expanded = whole list, 56px rows). Selecting a block swaps the sheet to the department
inspector (same peek/expanded behaviour as 4.3, quick actions: Split, Rotate, Remove).

**Department colours** (default mapping; keeps the old catalog's hue families, red moved to orange because red
means error). Two departments never share a colour; departments 11-12 are spare.

| Slot | Light | Dark | Hue | Department (key) |
|---|---|---|---|---|
| `--cat-01` | `#CD5811` | `#FC9252` | orange | Power Tools (`power_tools`) |
| `--cat-02` | `#B98918` | `#F6C755` | gold | Bits, Blades & Cutting Accessories (`bits_blades`) |
| `--cat-03` | `#60991D` | `#A5E060` | lime | Safety & Workwear (`safety_workwear`) |
| `--cat-04` | `#206F33` | `#4CB86A` | green | Access & Jobsite Equipment (`access_jobsite`) |
| `--cat-05` | `#0F9B89` | `#5ADDC7` | teal | Hardware & Fasteners (`hardware_fasteners`) |
| `--cat-06` | `#086082` | `#42A4CF` | cyan | Decking & Outdoor Living (`decking_outdoor`) |
| `--cat-07` | `#4449C6` | `#7E8EF4` | indigo | Hand Tools & Measuring (`hand_tools`) |
| `--cat-08` | `#A167CF` | `#DCAEFE` | violet | Paint, Stain & Finishing (`paint_finishing`) |
| `--cat-09` | `#9E197B` | `#EA66BF` | magenta | Pneumatic & Air Systems (`pneumatic_air`) |
| `--cat-10` | `#DB5471` | `#FE9EAD` | rose | (spare) |
| `--cat-11` | `#714725` | `#AE815D` | brown | Woodworking & Specialty Wood (`woodworking`) |
| `--cat-12` | `#677A8B` | `#AEC0D0` | slate | (spare) |

Store the slot key (`"cat-01"`) on the area item, not a hex value, so blocks follow the theme. In the 3D Walk the
floor tint uses the light value at 35% opacity and the hanging sign uses the light value as its background with
white Barlow Condensed 700 text: every light value gives at least 3:1 with white, the AA minimum for large text,
so sign text must stay large; anything smaller uses `--plan-label` on a white sign with a 6px colour bar).

---

## 6. Review (admin only)

Desktop: two columns under the toolbar-less shell: a 400px **changes panel** on the left, the plan on the right
(read-only, with ghosts). Phone: the changes panel is the main screen; tapping a row opens the plan with the ghost
and a bottom sheet holding that row's Apply button.

- Panel header: "REVIEW CHANGES" + a map picker (44px select listing every non-master map as "Dana · Safety by the
  yard door") + "8 differences from the master map. Tap one to see it on the plan."
- Groups in this order, each with an eyebrow and count: **Added**, **Removed**, **Changed**. Row (52px min,
  top `--line`): a 22px kind chip (`i-add` on `--success-soft`/`--success-text`, `i-minus` on
  `--danger-soft`/`--danger-text`, `i-pencil` or `i-rotate` on `--accent-soft`/`--accent-soft-ink`), a
  plain-language sentence (13px) with names in curly quotes ("Moved “SAFETY ISLE” 4' 6" north", "Rotated “KREG 8'”
  90°", "Resized “Laser deck” to 13' 0" × 8' 0"", "Renamed …", "Recoloured …"), a 12px detail line (type, was/now),
  and an **Apply** button (32px, secondary; primary on the selected row). Selected row: `--accent-soft`.
- Plan ghost for the selected row: *before* = 1.5px dashed `--plan-ghost-before` outline with a "Before" chip;
  *after* = 2px `--plan-ghost-after` outline with `--sel-fill`; a pill with the change ("4' 6" north"). Removed items
  show only the before ghost, added items only the after box. The plan pans to fit both.
- Footer (sticky, `--surface-2`): "Applying saves a new master version." + primary **Apply all 8**. Applying shows
  the toast "Applied 3 changes to the master map." and removes those rows.
- **Master history** (below the list on desktop, its own section on phone): rows "AJ applied 3 changes from Tom's
  map “Paint wall idea”" / "Today 4:12 pm · note"; the current version has a `--success-soft` "Current" tag; older
  ones a **Restore** button (`i-history`) that asks to confirm ("Restore the master map to Oct 7, 9:40 am? This
  saves a new master version; nothing is deleted.").
- Empty: "No differences. This map matches the master." with `i-check`.

---

## 7. Map switcher menu

Popover under the switcher (`--shadow-2`, `--radius-lg`, 340px; phone: full-height sheet). 

- Search field ("Find a map", 36px, `i-search`) when more than 8 maps are visible.
- **MASTER**: one row (`i-star` on `--accent-soft`), "Master map", "Confirmed layout · AJ · 2 h ago".
- **MY MAPS · 3 of 30**: own maps newest first (`i-map` chip, name, "Changed 5 min ago"); each row has a `i-more`
  menu (Rename, Make a copy, Delete…) shown on focus/hover and always on touch; then **+ New map** (accent text).
  At 30 maps, New map is disabled with "You have 30 maps, the most allowed. Delete one to make a new one."
- **TEAM MAPS** (admin, or everyone when sharing is on): grouped by person (eyebrow = first name), `i-user` chip,
  map name, "Changed 1 h ago", and a "View only" badge for maps you can't change.
- The current map row: `--surface-2` with a 3px `--accent` left bar and `i-check`. Rows 48px (56px touch),
  `role="menuitemradio"`; arrow keys move, type-ahead jumps, Esc closes and returns focus to the switcher.

**New map dialog** (`role="dialog"`, `aria-modal`, 440px, `--radius-xl`, `--shadow-3`, `--scrim` behind; phone:
full-width sheet): title "NEW MAP"; **Name** (44px, 16px text, focused, prefilled "My map 4"); **Start from** radio
cards: "The master map" (A full copy of the confirmed layout), "A blank store" (Walls, doors, columns, floors and
stairs only), "A copy of another map" (a select of maps you can see appears inside the card). Selected card:
`--accent` border + inset, `--accent-soft` fill, `--accent-soft-ink` text, filled radio dot. Hint "You have 3 of 30
maps. Only you can change your maps." Footer: ghost **Cancel**, primary **Create map** (shows "Creating…" and
disables while saving). Rename = the same dialog with only Name. **Delete map** confirm: "Delete “Front room
reset”? This can't be undone." with **Cancel** and danger **Delete map**.

---

## 8. Banners, toasts, empty and error states

**Canvas banners** (top-centre over the plan, `--radius-md`, `--shadow-1`, 20px icon, 14px text, max 640px; phone:
full width under the tabs row). They do not auto-dismiss.

| Banner | Look | Copy | Action |
|---|---|---|---|
| Read-only | `--accent-soft` / `--accent-soft-ink`, `--accent-line` border, `i-eye` | "**Viewing Dana's map** (read-only)" (master for members: "**Viewing the master map** (read-only)") | primary **Start my own plan** on the master (opens New map, starting from a blank store), **Make my own copy** on someone else's map. In Area planning the team sees the master as the empty store (structure and built-in desks) with "**The empty store**: start your own plan to place departments, aisles and displays." |
| Conflict (409) | `--danger-soft` / `--danger-soft-ink`, `i-error`, `role="alert"` | "This map was changed somewhere else. Reload it to keep going. Your unsaved edits are kept on this device." | secondary **Reload** |
| Offline | `--warning-soft` / `--warning-soft-ink`, `i-cloud-off` (`--warning`) | "You're offline. Changes are kept on this device and saved when you're back." | none |
| Not saved | same as offline with `i-warning` | "Couldn't save. Trying again in 10 s." | **Try now** |

While read-only, the toolbar's editing controls are hidden (Select, Pan, Measure, Layers stay), the inspector shows
values as text, and the phone bottom bar shows Measure, Layers, More plus a primary **Make my own copy**.

**Toasts** (`--surface-inverse` / `--ink-inverse`, `--radius-md`, `--shadow-3`, `--z-toast`, bottom-centre 16px above
the status bar or the phone bottom bar, max 420px, `role="status"`): one at a time, newest replaces older.
"Deleted “SAFETY ISLE 32'6"”." + **Undo** (underlined button) + `i-close`, 6 s; info/success toasts ("Applied 3
changes to the master map.", `i-check` in `--success`) 4 s. Hovering or focusing a toast pauses its timer. Enter /
leave: 8px rise + fade, `--dur-slow`, `--ease-enter` / `--ease-exit` (fade only under reduced motion).

**Empty states** (centred in the panel or canvas: 56px `--radius-xl` icon tile on `--accent-soft`, `--display-md`
headline, one 14px `--ink-muted` sentence ≤ 34ch, one primary action):

- No own maps: `i-map`, "NO MAPS OF YOUR OWN YET", "Make a copy of the master map or start from a blank store. Only
  you can change it.", **New map**.
- Categories with nothing placed: `i-blocks`, "NO DEPARTMENTS PLACED YET", "Press **Place** next to a department in the list,
  then tap the floor where it goes.", (phone) **Show departments**.
- Review with no other maps: `i-review`, "NOTHING TO REVIEW YET", "When someone saves a map, you can compare it with
  the master here."
- Nothing selected (inspector): see 4.2.

**Error states** (same layout, icon tile `--danger-soft` / `--danger-text`):

- Map failed to load: `i-warning`, "THIS MAP DIDN'T LOAD", "Check the connection and try again. Nothing you saved is
  lost.", secondary **Try again** (`i-reload`).
- Map not found / no longer shared: "THIS MAP ISN'T AVAILABLE", "It was deleted, or it isn't shared with you any
  more.", **Open the master map**.
- Field errors: inline under the field (see 4.2). Server validation errors on save become the "Not saved" banner
  with the server's plain message.
- 3D not available (Walk): keep the existing "The 3D walk can't start here" card, restyled with these tokens.

---

## 9. Keyboard shortcuts

Shown in the help dialog (`i-help` in the header; phone: More → Keyboard & help) as `.kbd` keycaps
(`--surface-2`, 1px `--line` with a 2px bottom border, 11px 500). Shortcuts never fire while typing in a field.

| Keys | Action |
|---|---|
| V / H / M | Select / Pan / Measure tool (hold Space to pan temporarily) |
| Click, Shift+click, drag on empty floor | Select, add/remove from selection, marquee select |
| Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) | Undo / Redo (Cmd on Mac) |
| Ctrl+D | Duplicate |
| Delete / Backspace | Delete (Undo in the toast); only with the plan or the 3D view focused, never from a field, a menu or the bare page |
| R / Shift+R | Rotate 90° clockwise / counter-clockwise |
| Arrows / Shift+Arrows | Nudge 6" / 5' |
| Alt while dragging | Ignore snapping for this drag |
| Shift while rotating | Free rotation (no 15° snap) |
| S / L / G | Snap on/off, Labels on/off, Grid on/off |
| N / Shift+N | Select the next / previous item (keyboard way to reach every item) |
| Enter | Focus the inspector's first field for the selection |
| + / − / F / 0 | Zoom in / out / fit the store / fit the selection |
| Esc | Clear selection, cancel a drag or measurement, close a menu |
| ? | Shortcuts dialog |

---

## 10. Accessibility checklist

- Focus: `outline: 2px solid var(--focus); outline-offset: 2px` on `:focus-visible` everywhere (inputs add the 3px
  `--focus-halo`). Never remove an outline without this replacement.
- The plan canvas has `tabindex="0"`, an `aria-label` that explains the keys, and an `aria-live="polite"`
  description of the selection ("Makita row, gondola, 25 feet 6 by 4 feet, at 94 feet 6 east, 62 feet north");
  the inspector is the accessible way to edit everything the canvas does.
- Tabs: `role="tablist"`/`tab`/`aria-selected`; toolbar: `role="toolbar"` with roving tabindex; toggles use
  `aria-pressed`; menus `role="menu"` + `menuitem`/`menuitemradio`; dialogs trap focus and restore it on close;
  sheets are `role="dialog"` with `aria-modal="false"` at peek.
- Save status and toasts are `role="status"`; the conflict banner and field errors are `role="alert"`.
- Icons are `aria-hidden="true" focusable="false"`; the button carries the name.
- Touch targets ≥ 44 x 44 (`--hit`) with ≥ 8px between neighbours on touch; mouse-only targets ≥ 24 x 24.
- Text never under 12px; users can zoom the page to 200% (the layout reflows; the plan keeps its own zoom).
- Reduced motion: durations are 0 via tokens; also turn off the Walk's auto-spin and smooth camera moves.
- Colour is never the only signal (icons + words for state; hatching for overlaps; "View only" badges).
- Every text/background and UI/background pair below is AA in both themes.

---

## 11. Integration notes for the builder

1. `src/worker.js` serves only allow-listed files before sign-in. Add to the public list (the sign-in page and 404
   page need them): `/assets/tokens.css` (SHORT cache), `/assets/icons.svg` (SHORT), and the five files in
   `/assets/brand/` (LONG), e.g. a `BRAND_RE = /^\/assets\/brand\/[a-z0-9-]+\.png$/` next to `FONT_RE`.
2. Load order on every page: `tokens.css`, then the page CSS (`base.css` / `app.css` / `admin.css` /
   `login.css`) with their own `:root` token blocks and `@font-face` rules deleted.
3. Replace `#c8102e` in `public/js/app.js` (`TOK.accent` fallbacks: walk marker, map highlight) with the tokens:
   the walk marker and map highlight become `--sel-stroke`.
4. `theme-color` metas and favicon links as in section 1, in `index.html`, `login.html`, `admin/index.html` and the
   404 HTML inside `src/worker.js`. Delete `public/favicon.svg` once nothing links to it.
5. No inline styles (CSP). Category and item colours: `el.style.setProperty('--c', ...)` from JS.
6. The sprite is fetched once and cached; reference it with an absolute path (`/assets/icons.svg#i-…`) so pages in
   sub-folders (`/admin/`) work.

---

## 12. Contrast (checked from `tokens.css`)

Every pair the components above use, computed from the actual token values (WCAG 2.x relative luminance;
translucent tokens blended over their background first). Text needs 4.5:1, UI strokes, icons and focus rings
3:1. **All pass in light and dark.** Re-check any pair whose token you change.

| Pair | Use | Need | Light | Dark |
|---|---|---|---|---|
| `--ink` on `--bg` | body text on app background | 4.5 | 14.37 (#15212D / #EDF1F5) | 15.80 (#E4EBF2 / #08111A) |
| `--ink` on `--surface` | body text on panels | 4.5 | 16.31 (#15212D / #FFFFFF) | 14.60 (#E4EBF2 / #0F1A26) |
| `--ink` on `--surface-2` | body text in inputs / rows | 4.5 | 15.20 (#15212D / #F5F7FA) | 13.40 (#E4EBF2 / #142231) |
| `--ink` on `--surface-3` | text on hovered row | 4.5 | 13.85 (#15212D / #E8EDF2) | 11.97 (#E4EBF2 / #1B2B3D) |
| `--ink-heading` on `--surface` | headings on panels | 4.5 | 13.99 (#0C2D4E / #FFFFFF) | 16.31 (#F3F7FB / #0F1A26) |
| `--ink-heading` on `--surface-2` | headings on rows | 4.5 | 13.04 (#0C2D4E / #F5F7FA) | 14.97 (#F3F7FB / #142231) |
| `--ink-heading` on `--bg` | headings on app background | 4.5 | 12.33 (#0C2D4E / #EDF1F5) | 17.65 (#F3F7FB / #08111A) |
| `--ink-muted` on `--bg` | secondary text on app background | 4.5 | 5.52 (#526273 / #EDF1F5) | 8.87 (#A3B3C4 / #08111A) |
| `--ink-muted` on `--surface` | secondary text / labels on panels | 4.5 | 6.26 (#526273 / #FFFFFF) | 8.20 (#A3B3C4 / #0F1A26) |
| `--ink-muted` on `--surface-2` | units, meta in rows / status bar | 4.5 | 5.84 (#526273 / #F5F7FA) | 7.52 (#A3B3C4 / #142231) |
| `--ink-muted` on `--surface-3` | secondary text on hovered row | 4.5 | 5.32 (#526273 / #E8EDF2) | 6.72 (#A3B3C4 / #1B2B3D) |
| `--ink` on `--surface-sunken` | inactive tab label in the track | 4.5 | 13.85 (#15212D / #E8EDF2) | 15.80 (#E4EBF2 / #08111A) |
| `--ink-muted` on `--surface-sunken` | secondary text in the track | 4.5 | 5.32 (#526273 / #E8EDF2) | 8.87 (#A3B3C4 / #08111A) |
| `--ink-subtle` on `--surface` | placeholder / caption on panels | 4.5 | 4.85 (#647384 / #FFFFFF) | 6.32 (#8C9DB0 / #0F1A26) |
| `--ink-subtle` on `--surface-2` | placeholder in inputs | 4.5 | 4.52 (#647384 / #F5F7FA) | 5.81 (#8C9DB0 / #142231) |
| `--ink-inverse` on `--surface-inverse` | toast / tooltip text | 4.5 | 15.15 (#F3F7FB / #15212D) | 13.57 (#15212D / #E4EBF2) |
| `--accent-ink` on `--accent` | primary button, active tab | 4.5 | 5.52 (#FFFFFF / #006CB4) | 5.52 (#FFFFFF / #006CB4) |
| `--accent-ink` on `--accent-hover` | primary button hover | 4.5 | 7.54 (#FFFFFF / #005793) | 4.69 (#FFFFFF / #0B78C2) |
| `--accent-ink` on `--accent-pressed` | primary button pressed | 4.5 | 10.20 (#FFFFFF / #064373) | 7.54 (#FFFFFF / #005793) |
| `--accent-text` on `--surface` | links, accent text on panels | 4.5 | 5.52 (#006CB4 / #FFFFFF) | 8.30 (#7CB8EC / #0F1A26) |
| `--accent-text` on `--surface-2` | accent text in rows | 4.5 | 5.14 (#006CB4 / #F5F7FA) | 7.62 (#7CB8EC / #142231) |
| `--accent-text` on `--bg` | accent text on app background | 4.5 | 4.86 (#006CB4 / #EDF1F5) | 8.98 (#7CB8EC / #08111A) |
| `--accent-soft-ink` on `--accent-soft` | selected row / info banner text | 4.5 | 6.60 (#00558F / #E1EEF9) | 8.44 (#A9D1F5 / #10304E) |
| `--danger-ink` on `--danger` | destructive button | 4.5 | 5.63 (#FFFFFF / #C42B2B) | 5.63 (#FFFFFF / #C42B2B) |
| `--danger-ink` on `--danger-hover` | destructive button hover | 4.5 | 7.17 (#FFFFFF / #A82323) | 4.73 (#FFFFFF / #D33A3A) |
| `--danger-text` on `--surface` | error text on panels | 4.5 | 6.55 (#B42323 / #FFFFFF) | 7.92 (#FF8E87 / #0F1A26) |
| `--danger-text` on `--surface-2` | error text in rows | 4.5 | 6.10 (#B42323 / #F5F7FA) | 7.27 (#FF8E87 / #142231) |
| `--danger-soft-ink` on `--danger-soft` | error banner / toast | 4.5 | 7.16 (#9A1D1D / #FDECEC) | 9.75 (#FFB8B2 / #3A1618) |
| `--warning-text` on `--surface` | warning text on panels | 4.5 | 6.86 (#8A4A00 / #FFFFFF) | 9.87 (#F2B860 / #0F1A26) |
| `--warning-soft-ink` on `--warning-soft` | read-only / check banner | 4.5 | 7.41 (#7A4100 / #FFF3E0) | 9.90 (#F7CB86 / #33240C) |
| `--success-text` on `--surface` | success text on panels | 4.5 | 6.12 (#19703F / #FFFFFF) | 9.56 (#6AD3A0 / #0F1A26) |
| `--success-soft-ink` on `--success-soft` | success banner | 4.5 | 6.70 (#14603A / #E6F4EC) | 9.44 (#8FE0B8 / #0F2E20) |
| `--success-text` on `--success-soft` | "Current" tag, added-row icon chip | 4.5 | 5.40 (#19703F / #E6F4EC) | 7.99 (#6AD3A0 / #0F2E20) |
| `--danger-text` on `--danger-soft` | removed-row icon chip, delete hover | 4.5 | 5.74 (#B42323 / #FDECEC) | 7.24 (#FF8E87 / #3A1618) |
| `--accent-text` on `--accent-soft` | radio dot / ring on a selected option | 3.0 | 4.68 (#006CB4 / #E1EEF9) | 6.38 (#7CB8EC / #10304E) |
| `--accent-soft-ink` on `--surface` | avatar initials, map icon chip | 4.5 | 7.79 (#00558F / #FFFFFF) | 10.97 (#A9D1F5 / #0F1A26) |
| `--plan-label` on `--plan-floor` | item label on the plan floor | 4.5 | 15.88 (#15212D / #FBFCFD) | 14.31 (#E4EBF2 / #101C29) |
| `--plan-label` on `--plan-bg` | label outside the building | 4.5 | 13.72 (#15212D / #E7ECF1) | 15.80 (#E4EBF2 / #08111A) |
| `--plan-label` on `--plan-fixture-fill` | label on a fixture | 4.5 | 12.72 (#15212D / #DDE4EB) | 10.29 (#E4EBF2 / #22364B) |
| `--plan-dim-ink` on `--plan-dim-bg` | dimension readout pill | 4.5 | 5.52 (#FFFFFF / #006CB4) | 5.52 (#FFFFFF / #006CB4) |
| `--ink-subtle` on `--plan-floor` | room names on the plan | 4.5 | 4.72 (#647384 / #FBFCFD) | 6.20 (#8C9DB0 / #101C29) |
| `--line-strong` on `--surface` | input / control outline on panels | 3.0 | 3.49 (#7D8B99 / #FFFFFF) | 3.79 (#5F7790 / #0F1A26) |
| `--line-strong` on `--surface-2` | input outline on rows | 3.0 | 3.25 (#7D8B99 / #F5F7FA) | 3.48 (#5F7790 / #142231) |
| `--focus` on `--surface` | focus ring on panels | 3.0 | 5.52 (#006CB4 / #FFFFFF) | 8.30 (#7CB8EC / #0F1A26) |
| `--focus` on `--surface-2` | focus ring on rows | 3.0 | 5.14 (#006CB4 / #F5F7FA) | 7.62 (#7CB8EC / #142231) |
| `--focus` on `--bg` | focus ring on app background | 3.0 | 4.86 (#006CB4 / #EDF1F5) | 8.98 (#7CB8EC / #08111A) |
| `--focus` on `--plan-floor` | focus ring on the plan | 3.0 | 5.37 (#006CB4 / #FBFCFD) | 8.13 (#7CB8EC / #101C29) |
| `--accent` on `--surface` | active tab / toggle shape on panels | 3.0 | 5.52 (#006CB4 / #FFFFFF) | 3.18 (#006CB4 / #0F1A26) |
| `--accent` on `--surface-sunken` | active segment in the tab track | 3.0 | 4.69 (#006CB4 / #E8EDF2) | 3.44 (#006CB4 / #08111A) |
| `--accent` on `--bg` | progress fill / toggle on app background | 3.0 | 4.86 (#006CB4 / #EDF1F5) | 3.44 (#006CB4 / #08111A) |
| `--ink-muted` on `--surface` | default icon colour | 3.0 | 6.26 (#526273 / #FFFFFF) | 8.20 (#A3B3C4 / #0F1A26) |
| `--danger` on `--surface` | error icon | 3.0 | 5.63 (#C42B2B / #FFFFFF) | 3.12 (#C42B2B / #0F1A26) |
| `--warning` on `--surface` | warning icon / check badge | 3.0 | 4.67 (#B25E00 / #FFFFFF) | 8.08 (#E8A23A / #0F1A26) |
| `--warning` on `--warning-soft` | warning icon in banner | 3.0 | 4.26 (#B25E00 / #FFF3E0) | 6.91 (#E8A23A / #33240C) |
| `--success` on `--surface` | saved tick icon | 3.0 | 5.01 (#1E7F4A / #FFFFFF) | 7.93 (#4CC38A / #0F1A26) |
| `--plan-wall` on `--plan-floor` | walls on floor | 3.0 | 14.01 (#1F2B37 / #FBFCFD) | 12.39 (#D2DCE6 / #101C29) |
| `--plan-wall` on `--plan-bg` | walls on outside | 3.0 | 12.11 (#1F2B37 / #E7ECF1) | 13.68 (#D2DCE6 / #08111A) |
| `--plan-fixture-stroke` on `--plan-floor` | fixture outline | 3.0 | 5.10 (#5E6E7E / #FBFCFD) | 6.48 (#8DA1B6 / #101C29) |
| `--plan-fixture-stroke` on `--plan-fixture-fill` | fixture outline vs its fill | 3.0 | 4.09 (#5E6E7E / #DDE4EB) | 4.66 (#8DA1B6 / #22364B) |
| `--plan-door` on `--plan-floor` | door swing | 3.0 | 6.10 (#526273 / #FBFCFD) | 8.03 (#A3B3C4 / #101C29) |
| `--plan-scan` on `--plan-floor` | scan lines layer | 3.0 | 5.94 (#8E3BB5 / #FBFCFD) | 7.35 (#CE93E8 / #101C29) |
| `--plan-scan` on `--plan-bg` | scan lines outside | 3.0 | 5.13 (#8E3BB5 / #E7ECF1) | 8.11 (#CE93E8 / #08111A) |
| `--plan-measure` on `--plan-floor` | measure line | 3.0 | 5.37 (#006CB4 / #FBFCFD) | 8.13 (#7CB8EC / #101C29) |
| `--sel-stroke` on `--plan-floor` | selection outline | 3.0 | 5.37 (#006CB4 / #FBFCFD) | 8.13 (#7CB8EC / #101C29) |
| `--sel-stroke` on `--plan-fixture-fill` | selection outline on a fixture | 3.0 | 4.30 (#006CB4 / #DDE4EB) | 5.85 (#7CB8EC / #22364B) |
| `--sel-handle-stroke` on `--plan-floor` | resize handle | 3.0 | 5.37 (#006CB4 / #FBFCFD) | 8.13 (#7CB8EC / #101C29) |
| `--sel-hover` on `--plan-floor` | hover outline (mouse only) | 3.0 | 3.94 (#2B83C9 / #FBFCFD) | 5.94 (#609CD8 / #101C29) |
| `--plan-ghost-before` on `--plan-floor` | review: before ghost | 3.0 | 4.29 (#6A7A8B / #FBFCFD) | 6.20 (#8C9DB0 / #101C29) |
| `--plan-ghost-after` on `--plan-floor` | review: after ghost | 3.0 | 5.37 (#006CB4 / #FBFCFD) | 8.13 (#7CB8EC / #101C29) |
| `--snap-guide` on `--plan-floor` | snap guide | 3.0 | 5.04 (#C2410C / #FBFCFD) | 8.22 (#FF9A5C / #101C29) |

| Category | Light stroke: on floor / on panel / label on block | Dark stroke: on floor / on panel / label on block |
|---|---|---|
| `--cat-01` | #CD5811: 4.09 / 4.20 / 10.43 | #FC9252: 7.68 / 7.84 / 7.32 |
| `--cat-02` | #B98918: 3.07 / 3.16 / 11.46 | #F6C755: 10.83 / 11.05 / 6.08 |
| `--cat-03` | #60991D: 3.37 / 3.46 / 11.21 | #A5E060: 11.01 / 11.23 / 5.97 |
| `--cat-04` | #206F33: 6.04 / 6.21 / 9.79 | #4CB86A: 6.86 / 7.00 / 7.51 |
| `--cat-05` | #0F9B89: 3.37 / 3.46 / 11.00 | #5ADDC7: 10.33 / 10.54 / 6.13 |
| `--cat-06` | #086082: 6.80 / 6.99 / 9.48 | #42A4CF: 6.10 / 6.22 / 7.85 |
| `--cat-07` | #4449C6: 6.78 / 6.97 / 9.51 | #7E8EF4: 5.79 / 5.90 / 8.03 |
| `--cat-08` | #A167CF: 3.82 / 3.92 / 10.89 | #DCAEFE: 9.45 / 9.64 / 6.45 |
| `--cat-09` | #9E197B: 7.10 / 7.29 / 8.94 | #EA66BF: 5.86 / 5.98 / 8.31 |
| `--cat-10` | #DB5471: 3.70 / 3.81 / 10.68 | #FE9EAD: 8.78 / 8.95 / 6.79 |
| `--cat-11` | #714725: 7.77 / 7.98 / 9.37 | #AE815D: 5.00 / 5.10 / 8.66 |
| `--cat-12` | #677A8B: 4.32 / 4.44 / 10.73 | #AEC0D0: 9.22 / 9.41 / 6.48 |

light: closest category pairs (OKLab distance stroke / fill): 01-10 0.104/0.044, 05-12 0.111/0.043, 01-02 0.116/0.040, 03-05 0.120/0.052; selection fill vs nearest category fill: 0.061 (--cat-12)
dark: closest category pairs (OKLab distance stroke / fill): 01-10 0.105/0.047, 06-07 0.106/0.042, 05-12 0.112/0.044, 08-12 0.112/0.044; selection fill vs nearest category fill: 0.050 (--cat-06)

light: fixture label on the worst item colour (grey 0, mixed into the floor at --plan-item-mix): 4.76 (before the halo)
dark: fixture label on the worst item colour (grey 255, mixed into the floor at --plan-item-mix): 5.30 (before the halo)

Notes on the table: "on floor / on panel" is the department colour as a stroke or swatch against `--plan-floor`
and `--surface` (3:1); "label on block" is `--plan-label` on the department fill (colour at `--cat-fill-alpha` over
the floor; 4.5:1, before the label halo). The closest pairs line is the OKLab distance between department colours
(stroke / translucent fill): every pair of fills is at least 0.040 apart (light) and 0.042 (dark), roughly twice a
just-noticeable difference, and the selection fill is further from every department fill than that, so a selected
item never looks like a department. The fixture line is the worst case over every grey from black to white: the
label stays readable on any item colour even before its halo.
