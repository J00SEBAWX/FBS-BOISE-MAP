# Model Council synthesis — FBS Boise 3D planning studio audit

**Council:** Claude Opus 5, GPT-5.6 Sol, Gemini 3.1 Pro
**Question:** Extremely audit this to be as accurate as possible. Presentation is key with accuracy and visual quality.
**Verdict:** The app is honest, safe, and visually strong. It is not yet an accurate model of the Boise store, and the current handoff will leak the reference photos to GitHub. Ship-blocking work is small and specific.

---

## Where Models Agree

| Finding | Claude Opus 5 | GPT-5.6 Sol | Gemini 3.1 Pro | Evidence |
|---|:---:|:---:|:---:|---|
| Fixed features (walls, doors, desks, columns) are enforced in the model layer, not just the UI | ✓ | ✓ | ✓ | `src/model.js:86-100`, `src/model.js:111-119`, `src/model.js:179-185`, `src/FloorPlan.jsx:19`, `src/App.jsx:75-86` |
| Scenario histories are independent and undo/redo work per scenario | ✓ | ✓ | ✓ | `src/model.js:248-261`, `src/App.jsx:127-140` |
| The 3D app runs standalone; local Pascal is not a runtime dependency | ✓ | ✓ | ✓ | `src/App.jsx:111-118`, `src/Scene3D.jsx:1-13`, `vite.config.js:4-15` |
| Visual system meets the design bar: restrained motion, no cursor trails, Satoshi + Nexus/green palette, `prefers-reduced-motion` collapses transitions | ✓ | ✓ | ✓ | `src/style.css:2`, `src/style.css:302`, `src/Scene3D.jsx:19-21` |
| The 180 ft × 80 ft envelope headline is not a verified inside dimension — it is at best a bounding proxy | ✓ | ✓ | ✓ | `public/model.pascal.json` `metadata.fbs.note`, PDF pp. 6, 8; `src/App.jsx:274` |
| The current git checkout will publish the reference photos when pushed | ✓ | ✓ | ✓ | `git ls-tree -r HEAD` shows `fbs-boise-store-photos.pdf` still tracked at repo root |

## Where Models Disagree

| Topic | Claude Opus 5 | GPT-5.6 Sol | Gemini 3.1 Pro | Why They Differ |
|---|---|---|---|---|
| Severity of the length discrepancy (169 ft chain vs 180 ft cover) | Mostly resolvable: 4×25 to grid E plus 3×23 to grid H = 169 ft of new footing, with "(VERIFY)" at H and "align with existing" — 180 ft is defensible as an outside dimension | Not audited directly | High-risk unknown — the app should be tested on-site with a laser measure before it is used in a sales meeting | Opus read the actual dimension chain off the plan sheet at 400 dpi; Gemini treated the app's own hedge language as the ground truth |
| Real ship-blocker (what would you refuse to send) | The invented 72 ft warehouse boundary — the entire remodel premise is quantified from a number that appears in neither drawing | The accessibility overclaim: small muted text at ~4.34:1 and light focus ring at ~2.5:1 fail WCAG AA and the docs say AA | The git tracking of the store PDF at the repo root — the private photos ride a normal `git push` straight to GitHub | Each auditor prioritized the risk closest to their assigned axis; all three are true simultaneously |
| Whether the fixture library is expressive enough | Missing columns and ceilings are the largest visual-credibility gap — 3D pitch without columns reads as a game level | Procedural geometry is a "provisional schematic," not photorealism; either wire the bundled GLBs into `Scene3D` or drop them from the web build | Presentation "pass, with distinction" — leaves fidelity headroom to a later pass | Opus compared to real photos and drawings; GPT audited the bundled assets vs what `Scene3D` actually calls; Gemini reacted to the delivered aesthetic |
| Import validation | Not focused on this axis | Outer shell is permissive; malformed `collections`/`rootNodeIds` are silently discarded so the "valid Pascal scene" claim is broader than the code proves | Not focused on this axis | Only Sol read `readGraph` and `mergeImportedGraph` line by line |
| How much of the p. 8 blueprint is exploitable | The AREAS schedule in the title block contains SALES/WAREHOUSE/TOTAL sq-ft rows — one straight-on phone photo would end the boundary argument | Not audited | Not audited | Opus specifically hunted for architect's own square-footage numbers; the other two treated the PDF as opaque |

## Unique Discoveries

| Model | Unique Finding | Why It Matters |
|---|---|---|
| Claude Opus 5 | Under the cover text's own 100 ft warehouse reading, the locked Tom's desk (x = 75.5–82.5 ft) sits 18–25 ft **inside** the warehouse. Either the boundary is wrong, or Tom's desk position is wrong — the app never surfaces the choice. | The user's hardest constraint is "desks cannot move." A locked desk in the wrong room is worse than an unlocked one. |
| Claude Opus 5 | Scene has **zero interior columns, zero windows, zero ceilings**, against a documented A–H × 1–5 grid and photos dominated by columns (pp. 10, 14, 34–41). One "column" node exists; ~18 are expected. | Columns constrain where a rack can go — their absence silently invalidates every rearrangement the tool proposes. |
| Claude Opus 5 | The `confidence` field is hardcoded to `'estimated'` at `modeling/build-scene.mjs:41`, so the "Drawing reference" and "Photo referenced" branches at `src/App.jsx:68` can never render. Every caveat reads the same, so viewers ignore all of them. | A uniform caveat is decoration — the two truly soft numbers (warehouse boundary, stairs) get no extra weight, and drawing-grade features (front door, transverse grid) are under-claimed. |
| Claude Opus 5 | The proposal moves 5 of 45 fixtures. Zero warehouse racks reposition, and the proposed hand-tool runs at x = 34 land in bays the existing racks still occupy. | The remodel *is* the pitch. A before/after where 24 of 29 movable fixtures stand still is a nudge, not a vision. |
| Claude Opus 5 | Two locked "immovable" sales counters (`item_0xs9qbvqg674ibdx` × `item_p1lq2af9zbnx781c`) geometrically intersect by 1.25 × 0.75 ft — the app's own overlap checker will flag it live in front of an audience. | Verified: north wing centered (37.49, 10.36), east wing centered (39.62, 11.58) rotated 90°. `verify_scene` already lists this. |
| GPT-5.6 Sol | Small muted text (`--muted:#677360` on `--bg:#edf0e6`) computes to ~4.34:1 and the light-theme focus outline (`#77ac79`) to ~2.5:1. WCAG AA requires 4.5:1 for body text and 3:1 for focus indicators. | The QA docs claim WCAG AA; the CSS does not deliver it. A management-facing tool cannot claim compliance it does not meet. |
| GPT-5.6 Sol | Arrow-key nudge is not implemented. The global handler covers Escape and undo/redo only; a "keyboard editing" hint in `FloorPlan.jsx:56-58` is misleading. | Standard expectation in any layout editor. Tab-to-nudge-button is not the same as arrow-to-move. |
| GPT-5.6 Sol | The eleven bundled GLBs (~622 KiB in `dist/`) are never loaded by the app; `Scene3D` builds procedural geometry from `src/geometry.js`. QA row "native GLB serving" tests a Pascal server that is not part of the deployment. | Dead weight and a misleading QA claim. Decide: use the GLBs, or drop them. |
| GPT-5.6 Sol | Walls and doors are pointer-selectable but not reachable via the keyboard sidebar (`src/App.jsx:161-164`), so inspection is not keyboard-equivalent. | Combined with the missing arrow-key nudge, the app is not truly keyboard-operable. |
| Gemini 3.1 Pro | The `.git` repository is at `/files/.git`, not inside `/files/fbs-map/`, so `git push` from the current working tree uploads the store PDF and reference notes. `docs/CLOUDFLARE.md` does not warn about this. | Verified. This is the single change that turns a private handoff into a data leak. |
| Gemini 3.1 Pro | Cloudflare Access must protect **both** production and preview URLs — Pages preview environments are public by default. | The privacy plan only works if the preview isn't the leak. |

## Comprehensive Analysis

### What is actually solid

All three auditors converged on the app's core engineering. The lock model does its job: `src/model.js:37-52` builds a trusted authority from the startup graph, then every mutation path — position, rotation, scale, name, category, note, delete, duplicate, proposal apply, import merge — checks that authority before acting. The UI reinforces but does not substitute for those checks. The 2D drag handler exits early on locked nodes at `src/FloorPlan.jsx:19`, the 3D scene has no transform controls at all, and imports rebuild from the trusted baseline rather than trusting the uploaded lock flags. The unit tests exercise wall, door, and locked-fixture protection paths (`tests/model.test.js:21-28`) plus a roundtrip of the actual saved Boise scene (`tests/model.test.js:107-120`), and all ten pass. Scenario histories are strictly separate, the file-size cap and prototype-key rejection close the obvious upload footguns, and `prefers-reduced-motion` is honored globally. On presentation, the palette-and-motion story lands: Satoshi via Fontshare, the Nexus/Franklin-green surfaces, calm transitions, and the correct North arrow behavior on the 2D plan all read as an intentional design, not an AI template. Mobile fits at 375 px without horizontal overflow. If the ask were only "does this work and does it look right," the answer would be yes.

### Where the accuracy claim breaks

The three highest-signal accuracy findings all came from Opus's spatial pass and I verified each against the source files.

First, the warehouse boundary. The scene puts the department wall at x = 72 ft (`wall_c92no990pqfb07vg`, `zone_4o0w03cajcw7q9wt`), a value that appears in neither drawing. The reference PDF gives two explicit anchors: a 2-hour fire-rated area-separation wall between `WAREHOUSE [101]` and `SALES [102]` around grid C at ~50 ft (p. 8), and a 5"/4" slab-thickness break at grid E = 100 ft (p. 6, matching the p. 1 cover text). Those two documents are not contradicting each other — a fire-rated occupancy boundary and a slab-pour boundary answer different questions — but the model splits the difference silently, and `modeling/layout-spec.json` limitation 3 calls x = 72 a "chosen working control line, not an inferred measurement." The remodel's entire premise is quantified from that number, so the app currently cannot answer the first question a store manager will ask: "how much retail floor do we gain?" The honest answer is a 4,000–8,000 sq ft band, and even that range is more persuasive than an unstated 5,760.

Second, structure. Opus counted zero column nodes against a documented A–H × 1–5 grid with "6×6 POST" annotations on the plan and columns visible as the dominant interior feature in more than a dozen photo pages (pp. 10, 14, 34–41). Zero ceilings, against a suspended-tile lay-in that defines the aisle volume in pp. 26–31 and the open structural volume that defines the counter/arches area in pp. 32–33. Zero windows, against the wood-framed transom on the old-store wall (pp. 34–35) and the louvered warehouse opening (p. 12). In a 3D walkthrough this is what stops the model from being convincing — columns constrain where racks can go, so their absence quietly invalidates every rearrangement the tool proposes.

Third, calibration. `modeling/build-scene.mjs:41` hardcodes `confidence:'estimated'` for every node, so the two branches at `src/App.jsx:68` labeled "Drawing reference" and "Photo referenced" are unreachable. Every reference note reads identically, which is worse than no caveats — viewers learn to ignore them, so genuinely soft numbers (warehouse boundary, stairs placeholder locked at (6, 63) contradicting the p. 8 grid-C stairs) get no extra weight and drawing-grade features (front customer door within a few feet of the documented FOYER, transverse grid, west overhead door corroborated by a caged roof-access ladder in p. 18) are quietly under-claimed. On top of that, two "immovable" sales-desk records (`item_0xs9qbvqg674ibdx` × `item_p1lq2af9zbnx781c`) actually intersect by ~1.25 × 0.75 ft — I confirmed the coordinates directly, and the app's own `verify_scene` output already lists the overlap. The scenario story is thin in the same way: only 5 of 45 fixtures move under "Try warehouse expansion" and none of them are warehouse racks.

### Where the presentation and code claims overreach

GPT-5.6 Sol audited the CSS and keyboard model line by line. Two accessibility gaps are real: the small `--muted:#677360` on `--bg:#edf0e6` computes to about 4.34:1 against the 4.5:1 body-text threshold, and the universal light-theme focus ring at `#77ac79` computes to about 2.5:1 against adjacent light surfaces where WCAG 2.2 focus-appearance calls for 3:1. Both are one-line CSS changes but the docs currently promise WCAG AA, and that claim cannot ship as-is. Arrow-key nudge is genuinely missing — the tab-to-nudge-button flow is not the standard "select then arrow-move" that any layout editor is expected to offer. Walls and doors have no keyboard route into the sidebar list. And the eleven GLB fixtures shipped in `dist/` are dead weight because `Scene3D.jsx` builds procedural boxes from `src/geometry.js`; the QA row for "native GLB serving" tests the local Pascal server, not the deployed app. Docs also outrun evidence in several rows of `docs/QA.md` that reference behavior not actually recorded in `docs/browser-checks.json`.

### The delivery risk is one command away from being live

Gemini caught the single change that turns this from a private handoff into a data leak. The git repo is initialized at `/files/.git`, one level above `/files/fbs-map/`, and `git ls-tree -r HEAD` confirms `fbs-boise-store-photos.pdf` and `reference/store-reconstruction.md` are already tracked. `docs/CLOUDFLARE.md` recommends pushing "the fbs-map repo" without noting that the working tree needs to be `fbs-map/` itself. The remedy is to initialize a separate git repo *inside* `fbs-map/` and push only that folder, then enforce Cloudflare Access on both the production hostname and the auto-generated preview hostnames (Pages previews are public by default). Nothing prevents these two steps; they just aren't yet baked into the delivery flow.

### Recommendation

Take the "audit-ready" pass in this order before any GitHub push:

1. Move the git root inside `fbs-map/` and confirm `fbs-boise-store-photos.pdf` and `reference/` are not in the tree. Update `docs/CLOUDFLARE.md` to warn that Cloudflare Access must be enforced on production *and* preview URLs, and that only the `fbs-map/` subtree is the repo.
2. Fix the two accessibility contrast values and either remove the AA claim or verify the ring/text meet AA after the change. Add arrow-key nudge for movable selections and expose walls/doors in the sidebar.
3. Fix the two overlapping sales-desk records so `verify_scene` returns zero live-audience overlaps.
4. Replace `confidence:'estimated'` in `build-scene.mjs` with per-node `drawing` / `observed` / `estimated`, and rewrite the About text so the warehouse-boundary range (~4,000–8,000 sq ft) is the headline uncertainty. This is a small change that materially raises the trust the tool earns.
5. Add ~18 columns on the A–H × 1–5 grid, an aisle-tile ceiling plane, and unlock the warehouse-stairs placeholder. This is the largest single visual-credibility jump per unit of effort.
6. Deepen the expansion scenario so the warehouse racks actually move — the before/after is the pitch.
7. Retire or wire up the bundled GLBs and update the "native GLB serving" QA row to match reality.

Items 1–3 are ship-blocking. 4–6 are the accuracy-and-vision work that lets the tool actually sell the remodel. 7 is polish.

---

## Sources

- Individual auditor reports: `model-council-claude_opus_5_0.md`, `model-council-gpt_5_6_sol.md`, `model-council-gemini_3_1_pro.md`
- Reference material: `projects/fbs-map-UDEjwEPFTx6OFs1.XgiSKA/files/fbs-boise-store-photos.pdf` (blueprint pp. 6, 8; interior photo pp. 2, 9, 10, 12, 14, 26–37, 38–49)
- Live evidence: `pplx project files sync` confirms all 16 LFS files materialized; `git -C files ls-tree -r HEAD` confirms PDF still tracked at repo root
- WCAG references: [W3C Understanding SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum), [W3C Understanding SC Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- Pascal local editor architecture: [Pascal local editor documentation](https://editor.pascal.app/docs/developers/local-editor)
- Franklin Building Supply Boise store location: [FBS locations page](https://franklinbuildingsupply.com/locations) and [Boise store page](https://franklinbuildingsupply.com/locations/boise)
