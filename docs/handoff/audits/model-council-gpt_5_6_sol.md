# GPT-5.6 Sol audit — FBS Boise planning studio

**Audit date:** September 10, 2026  
**Primary angle:** code and app fidelity, with runtime verification  
**Verdict:** **Conditional pass; do not call it delivery-ready yet.** The core safety model is unusually solid: fixed features are protected in both UI and model-layer mutation paths, imports rebuild from a trusted baseline, scenario histories are separate, and the static app runs without Pascal. The biggest remaining gaps are (1) accessibility claims that do not survive a CSS/code audit, (2) the absence of a direct keyboard-nudge shortcut despite suggestive language, (3) weak proof that every exported edit remains Pascal-schema-valid, and (4) documentation that overstates what `browser-checks.json` actually records.

## Executive finding table

| Priority | Finding | Delivery impact |
|---|---|---|
| **P0** | No release-blocking fixed-feature bypass found | The essential remodel guardrail is enforced in both UI and pure model operations. |
| **P1** | WCAG AA is not yet supportable: small muted text computes to about 4.34:1 and the light-theme focus outline to about 2.3–2.5:1 | A management-facing tool should not claim AA until colors and keyboard reachability are corrected and audited. |
| **P1** | “Keyboard nudge” is not implemented as an arrow-key editing command | Keyboard users can tab to four nudge buttons and activate them, but arrow keys do not nudge the selected fixture. |
| **P1** | App exports are Pascal-shaped but not revalidated by Pascal or a bundled schema after edits | The baseline was validated, but tests only round-trip through the app’s permissive reader. |
| **P1** | Browser QA documentation contains claims absent from `browser-checks.json` | Reviewers cannot reproduce or trace several claimed checks from the stated raw evidence file. |
| **P2** | Bundled GLBs are unused by the planning app | The app is self-sufficient, but the GLB serving test is irrelevant to its runtime and the bundle carries roughly 622 KiB of dead fixture assets. |
| **P2** | Walls and doors are pointer-selectable but absent from the keyboard-accessible sidebar | Read-only wall/door inspection is not keyboard-equivalent. |
| **P2** | Import validation accepts malformed scene shells, then silently discards them | Safe in the current merge design, but “valid Pascal scene JSON” is an overstatement and the contract is confusing. |

## 1. Fixed-feature invariants

### Result: pass, with strong defense in depth

The trusted authority is created only from the startup graph. It locks every wall, every door, every item whose original `metadata.fbs.locked` is `true`, and descendants of those records; imported lock metadata is not authoritative (`src/model.js:37-52`). All non-item nodes are also treated as immutable by `isLocked`, so sites, buildings, levels, slabs, zones, walls, and doors cannot enter fixture mutation operations (`src/model.js:51-52`).

Every destructive or geometric path checks that authority before doing work:

- position, rotation, scale, name, category, and note updates: `src/model.js:86-100`;
- deletion: `src/model.js:111-119`;
- duplication: `src/model.js:120-145`;
- proposal application: `src/model.js:179-185`;
- import merge and final fixed-node overwrite: `src/model.js:193-245`.

The UI reinforces, but does not substitute for, the model checks. Fixed inspector fields are disabled, and rotate/duplicate/delete controls are not rendered (`src/App.jsx:75-86`). The rotate callback still routes through `updateFixture` (`src/App.jsx:220-222`). The 2D pointer-start handler selects a locked node but refuses to establish drag state (`src/FloorPlan.jsx:16-21`). The 3D scene has no transform controls at all—only selection and orbit (`src/Scene3D.jsx:19-33`, `src/Scene3D.jsx:129-130`).

The actual scene marks the central desk wings, Tom candidate station wings, front sales counter, columns/piers, headers, arch, and stairs as locked. Representative desk/Tom records are explicit in `modeling/layout-spec.json:65-71`; structural piers are explicit in `modeling/layout-spec.json:76-79`. Runtime inventory found **16 fixed items**, **29 movable items**, plus nine walls and three doors; the authority contained 28 locked wall/door/item records (`model-council-gpt_5_6_sol-runtime.json:35-47`).

### Test coverage: good core coverage, incomplete operation matrix

The unit test explicitly rejects update, delete, and duplicate on a wall, its door descendant, and a locked fixture (`tests/model.test.js:21-28`). Because `updateFixture` checks the lock before applying any patch, that single update assertion protects move, resize, rotate, and rename at the implementation level (`src/model.js:86-98`). Still, the test name claims “descendants” while its only descendant case is wall → door; it does not create a locked item with a child item (`tests/model.test.js:7-12`, `tests/model.test.js:21-28`).

**Recommended test hardening:** add a table-driven assertion for each prohibited operation—position, rotation, scale, rename/category/note, duplicate, delete—against one wall, one door, every fixed-desk class, Tom’s station, and a structural column from the real Boise graph. The current code passes that expected behavior, but explicit regression coverage would make the delivery claim auditable.

### Scope caution

The graph locks more than the user’s original “walls, sales desks, Tom’s desk” statement: headers, fascia, piers, an arch, and provisional stairs are also fixed (`public/model.pascal.json:3777`, `public/model.pascal.json:3854`, `public/model.pascal.json:3922-4161`, `public/model.pascal.json:4237-4391`). These are plausibly architectural, but management should confirm that the extended lock list is intentional rather than silently treating every modeled transition as immovable.

## 2. Undo/redo and scenario isolation

### Result: pass for the implemented model

Each scenario owns a distinct `{past, present, future, exported}` object (`src/model.js:248-261`), and React updates only the active scenario key (`src/App.jsx:127-140`). Switching scenarios clears selection but does not replace either history (`src/App.jsx:212-215`). The proposal is committed only to `sandbox` before switching there (`src/App.jsx:187-192`). Reset is also a normal commit, so its “undo the reset” promise is correct (`src/App.jsx:295-296`).

The unit test verifies dirty state isolation, undo, redo, and redo-branch clearing with two independent history objects (`tests/model.test.js:80-89`). Browser evidence verifies that a proposed sandbox position did not alter the current scenario (`docs/browser-checks.json:29-30`).

### Residual gap

There is no browser evidence of **both scenarios simultaneously carrying independent non-empty undo and redo stacks**, followed by alternating undo/redo after scenario switches. The pure state design is correct, but add one end-to-end regression covering that exact meeting workflow.

## 3. Import safety and recovery

### Result: fixed-feature restoration passes

Import starts from `authority.original`, not from the uploaded graph (`src/model.js:193-198`). Locked/non-item originals are never merged from the file; editable existing items receive only position, rotation, effective size, name, category, and note, while assets and canonical metadata remain trusted (`src/model.js:199-215`). New records must cite a trusted movable template and match its kind (`src/model.js:216-241`). A final overwrite makes every authority-locked original byte-equivalent (`src/model.js:243-245`).

The test tampers with a fixed item’s lock and position, removes a door, alters wall children and level native data, and confirms restoration while allowing a movable position edit (`tests/model.test.js:29-43`). The actual Boise scene is also round-tripped and every locked node compared to the baseline (`tests/model.test.js:107-120`). Browser evidence records a fixed sales desk restored from tampered X = 1 m to trusted X = 123 ft (`docs/browser-checks.json:26-30`).

### P2: permissive outer-shell validation

`readGraph` checks only that nodes, root IDs, and a `collections` property exist, plus shallow node IDs/types/children (`src/model.js:19-35`). It does **not** validate that root IDs resolve, that `collections` is an object, that parent/child references are reciprocal, or that the graph satisfies Pascal’s schema. In a targeted test, imports with `collections: null` and `rootNodeIds: ["missing"]` were accepted because the importer discards those untrusted fields and rebuilds from the original. That is safe for this merge, but the error text “Choose a Pascal scene JSON” and UI phrase “valid Pascal scene JSON” are broader than the code can establish (`src/model.js:23`, `src/App.jsx:181`).

### Security and operational footguns

- **Good:** file size is capped at 12 MB before reading; JSON is parsed without evaluation; names/notes render through React text nodes; prototype-sensitive node IDs are rejected (`src/App.jsx:175-181`, `src/model.js:27-33`, `src/model.js:74-81`).
- **Good:** imported asset URLs, hierarchy, native fields, and lock flags cannot replace trusted values (`src/model.js:188-245`).
- **Footgun:** a semantically malformed upload can be accepted and appear successful because malformed untrusted shell fields are ignored. Report “editable changes imported into the trusted baseline,” not “scene validated.”
- **Footgun:** every comparison/commit/dirty check serializes whole graphs (`src/model.js:202`, `src/model.js:214`, `src/model.js:248-261`). This is acceptable at 65 nodes, but repeated edits near the 500-fixture limit will produce avoidable main-thread work.
- **Footgun:** 3D hover mutates `document.body.style.cursor` and relies on `onPointerOut` to clean it (`src/Scene3D.jsx:19-21`). Switching views/unmounting while hovered could leave a stale pointer cursor. Add an unmount cleanup.

## 4. Export and Pascal fidelity

### Result: Pascal-shaped and baseline-preserving, but not fully proven schema-valid after arbitrary edits

Export serializes the active `graph` directly (`src/App.jsx:168-173`). Every graph begins as a clone of the validated Pascal JSON (`src/App.jsx:111-118`), and mutation helpers preserve native fields, canonical assets, parent references, and collections (`src/model.js:86-145`). Duplicate/delete/import round-trip tests confirm safe hierarchy and canonical asset preservation (`tests/model.test.js:44-54`). The saved baseline separately passed Pascal validation (`modeling/evidence/final-validation.json:8-11`).

What is **not** tested is feeding a browser-exported, edited file back into Pascal’s validator. The “actual Boise native scene” test calls the app importer and compares counts/fixed records; it does not invoke a Pascal schema (`tests/model.test.js:107-120`). Therefore:

- **Supported claim:** “Exports the full Pascal-shaped native graph while preserving trusted native fields.”
- **Not yet supported:** “Every possible exported edit is Pascal-schema-valid.”

Add a CI validator or a golden workflow that performs representative move/resize/rotate/duplicate/delete operations, exports the result, and runs Pascal `validate_scene` (or an official JSON-schema equivalent) on that exact artifact.

## 5. Snap, feet, nudge, drag, and measurement

| Feature | Audit result | Evidence |
|---|---|---|
| Feet conversion | **Pass** | `FT = 0.3048`, display rounds to two decimals (`src/model.js:4-12`); numeric inspector converts feet back to meters (`src/App.jsx:52-57`). |
| 1 ft snap | **Pass** | Drag preview applies `snapValue` independently to X/Z (`src/FloorPlan.jsx:23-30`); snap uses one foot (`src/model.js:12`). Existing browser evidence records snapped 108/16 ft and unsnapped 109.4/16.6 ft (`docs/browser-checks.json:31-38`). |
| Drag in 2D | **Pass** | Pointer capture, preview, and commit are implemented (`src/FloorPlan.jsx:16-35`). Fresh runtime moved a fixture from 29 to 34 ft with snap enabled (`model-council-gpt_5_6_sol-runtime.json:5-12`). |
| Measurement | **Pass, honestly limited** | Two in-envelope points produce Euclidean distance and feet output (`src/FloorPlan.jsx:36-55`, `src/FloorPlan.jsx:116-121`, `src/App.jsx:271`). It is straight-line draft-scale distance, not an aisle-clearance solver. |
| Nudge buttons | **Pass** | Four 1 ft buttons call the same protected model edit path (`src/App.jsx:60-63`, `src/App.jsx:78-80`). Keyboard activation of the focused east button moved 28 → 29 ft (`model-council-gpt_5_6_sol-runtime.json:8-11`). |
| Arrow-key nudge | **Fail / absent** | The global keyboard handler supports Escape and undo/redo only (`src/App.jsx:141-148`). Fresh runtime ArrowRight did not change X (`model-council-gpt_5_6_sol-runtime.json:8-10`). |

The 2D SVG’s accessible label says “Select fixtures from the list for keyboard editing” (`src/FloorPlan.jsx:56-58`). That is defensible only in the broad sense that users can tab to controls. If “keyboard nudge” means direct arrow-key movement—a normal expectation in a layout editor—it is not delivered. Implement arrows for 1 ft and Shift+arrows for a documented fine/coarse increment, while ignoring text fields and fixed selections.

## 6. Motion, cursor, accessibility, and mobile

### Motion and cursor: mostly pass

There are no cursor-trail elements, pointer-follow animations, or custom canvas cursor effects in the CSS. The only cursor mutation is the standard pointer on 3D fixture hover (`src/Scene3D.jsx:19-21`). The reduced-motion rule collapses all animation/transition durations to `.01ms` and disables smooth scrolling (`src/style.css:302`); runtime computed both tested durations as `0.00001s` (`model-council-gpt_5_6_sol-runtime.json:12-13`). This use matches the purpose of `prefers-reduced-motion`, which exposes a user request to minimize non-essential motion ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)).

### P1 accessibility issues spotted

1. **Small muted text fails the 4.5:1 threshold in the main light canvas.** `--muted: #677360` on `--bg: #edf0e6` computes to approximately **4.34:1**, and many affected labels are 12–13 px (`src/style.css:4-6`, `src/style.css:10`, `src/style.css:129-150`, `src/style.css:171-184`). WCAG 1.4.3 requires at least 4.5:1 for normal-sized text ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)).
2. **The light-theme focus ring is under 3:1 against adjacent light surfaces.** The universal ring is `#77ac79` (`src/style.css:32`), approximately 2.54:1 against `#fafbf6` and 2.29:1 against `#edf0e6`. WCAG 2.2 focus appearance calls for a focus-indicator area with at least a 3:1 change of contrast ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)).
3. **Wall/door inspection lacks a keyboard route.** The sidebar lists only `item` nodes (`src/App.jsx:161-164`, `src/App.jsx:224-235`), while walls/doors are selected only through pointer handlers in 2D/3D (`src/FloorPlan.jsx:74-87`, `src/Scene3D.jsx:67-77`). The SVG itself is an image, not a keyboard-operable control surface (`src/FloorPlan.jsx:56-59`). Add a “Building features” section or include non-item fixed records in search/results.

Positive findings: a skip link exists (`src/App.jsx:194-195`); icon buttons carry names (`src/App.jsx:10-11`); form fields are visibly labeled (`src/App.jsx:34-35`); dialogs are native modal dialogs and restore prior focus (`src/App.jsx:19-32`); the mobile drawer moves focus to its close button and traps Tab (`src/App.jsx:150-160`, fresh runtime at `model-council-gpt_5_6_sol-runtime.json:25-32`).

### Mobile 375 px: pass

At 375 × 812, document client and scroll dimensions were both exactly 375 × 812; the toolbar, model viewport, and 340 px drawer all stayed within bounds, and the drawer had no internal horizontal overflow (`model-council-gpt_5_6_sol-runtime.json:16-29`). Zone labels computed to 12 px (`model-council-gpt_5_6_sol-runtime.json:29`). The responsive CSS deliberately hides lower-priority header text, turns the sidebar into a drawer, and reserves canvas insets for stacked controls (`src/style.css:292-301`). The fresh screenshot, `fbs-audit-mobile-375.png`, confirms the open drawer remains readable.

The remaining mobile limitation is product, not overflow: initial 3D uses a cropped retail focus on small screens (`src/App.jsx:107`, `src/Scene3D.jsx:120-128`), so only a subset of zone labels is likely visible until users fit the whole store. That behavior should be explained in mobile help.

## 7. Native GLBs versus bundled fixtures

### The app is self-sufficient without Pascal—and does not use the GLBs

The only runtime fetch is `model.pascal.json` (`src/App.jsx:111-118`). `Scene3D` imports and calls the procedural `buildFixture`; it never uses `GLTFLoader`, `useGLTF`, or `asset.src` (`src/Scene3D.jsx:1-13`, `src/Scene3D.jsx:158`). `buildFixture` explicitly creates texture-free generic Three.js geometry (`src/geometry.js:4-8`) and normalizes it to a unit box (`src/geometry.js:134-149`).

The eleven GLBs are generated by `scripts/export-fixtures.js:1-19` and copied into `dist`, but they are only relevant if the JSON is opened by a native Pascal editor that resolves `/fixtures/*.glb`. The official Pascal documentation describes the Pascal editor/MCP as a loopback-only local service with scene data stored outside the app; that local service is not a deployment dependency ([Pascal local editor documentation](https://editor.pascal.app/docs/developers/local-editor)).

Consequences:

- **Good:** the Cloudflare/static app is fully independent of the local Pascal service. The production build contains its JS/CSS, model JSON, and all public assets (`vite.config.js:4-15`).
- **Misleading QA emphasis:** `docs/QA.md:61` and `docs/browser-checks.json:55-59` test whether the local Pascal host serves a GLB, but that does not test this app.
- **Dead delivery weight:** all GLBs are shipped even though the app renders procedural copies. Either load the GLBs in `Scene3D` for visual/runtime parity with native Pascal, or exclude them from the planning-app deployment and document them as optional native-editor artifacts.
- **Presentation gap:** generic texture-free shelves and boxes cannot deliver “true detailed model” fidelity by themselves (`src/geometry.js:4-6`). Their purpose is an understandable schematic, not photorealism.

## 8. `docs/QA.md` versus tests and `browser-checks.json`

### Accurate claims

- 10 tests pass and production build succeeds (`docs/QA.md:57-58`; fresh rerun at `model-council-gpt_5_6_sol-runtime.json:34-38`).
- Mobile document dimensions are 375 × 812 (`docs/QA.md:39`; `docs/browser-checks.json:46-50`).
- Fixed-tamper restoration, scenario independence, snapped/unsnapped dragging, measurement, reset/undo, and no captured page errors are all represented in raw browser data (`docs/QA.md:49-56`; `docs/browser-checks.json:26-44`, `docs/browser-checks.json:61-62`).
- Native schema validation and the nine practical issues match the saved evidence (`docs/QA.md:59-62`; `modeling/evidence/final-validation.json:8-11`; `modeling/evidence/final-verification.json:41-52`).

### Claims not actually evidenced by the named raw JSON

`docs/QA.md:68` says raw browser observations are in `docs/browser-checks.json`, but that JSON does not record:

- drawer open/close despite `docs/QA.md:40`;
- light → dark → light despite `docs/QA.md:55`;
- fit, retail focus, fade walls, labels, or help dialog despite `docs/QA.md:55`;
- wall/door read-only selection from the coverage inventory (`docs/QA.md:15`);
- import cancel or dialog keyboard-focus behavior from the coverage inventory (`docs/QA.md:21`);
- renaming/category editing from the coverage inventory (`docs/QA.md:14`).

These may have been manually exercised, but the declared raw artifact does not prove them. Add explicit booleans, before/after values, viewport bounds, focus targets, and screenshot filenames—or soften “raw observations are saved” to “selected observations are saved.”

### What code/tests do that QA does not document clearly

- The import merger accepts malformed outer shell fields because it deliberately retains the original shell; QA documents malformed JSON but not this distinction (`src/model.js:193-245`, `docs/QA.md:20`, `docs/browser-checks.json:26`).
- History is capped to the most recent 50 past states (`src/model.js:249-251`); no documentation tells users older edits expire.
- Imports and scenes are capped at 500 fixtures, graph input at 4,000 nodes, and upload size at 12 MB (`src/model.js:26`, `src/model.js:124`, `src/model.js:195`, `src/App.jsx:177`).
- The app’s 3D renderer is procedural and does not load the native GLBs; QA’s native-serving row obscures that architecture (`src/Scene3D.jsx:5-13`, `docs/QA.md:61`).
- The reduced-motion implementation is present and effective but not listed in the QA results (`src/style.css:302`).

## Prioritized “fix before delivery” list

1. **P1 — Correct accessibility blockers.** Darken `--muted` on the light canvas to meet 4.5:1, replace the light-theme focus color with a ≥3:1 indicator against both `--surface` and `--bg`, and add keyboard-accessible wall/door entries.
2. **P1 — Implement direct keyboard nudge.** Arrow keys should move the selected movable fixture with documented increments; fixed selections and form editing must remain unaffected. Add browser tests.
3. **P1 — Validate a real edited export with Pascal.** Exercise move, resize, rotate, duplicate, delete, undo/redo, export, and then run the exported artifact through Pascal validation. Preserve the resulting file and validator output.
4. **P1 — Make QA evidence match QA prose.** Record every claimed theme/navigation/dialog/drawer/focus check in `browser-checks.json`; distinguish unit, browser, and native-validator evidence.
5. **P2 — Clarify import semantics.** Rename the UI promise to “Import editable changes into the trusted baseline,” validate or explicitly ignore malformed root/collection data, and report ignored shell defects.
6. **P2 — Decide the GLB architecture.** Either render bundled GLBs in the app and test their deployed URLs, or stop shipping them with the web build and remove the irrelevant local-host GLB row from app QA.
7. **P2 — Add an explicit lock regression matrix.** Use real Boise IDs for walls, doors, each sales/Tom counter group, and columns; assert move/resize/rotate/duplicate/delete denial separately.
8. **P2 — Add full scenario-history browser coverage.** Create edits and redo stacks in both scenarios, alternate scenario switches, then confirm undo/redo never crosses.
9. **P3 — Clean minor runtime debt.** Restore the body cursor on 3D unmount, document the 50-step history cap and import limits, and consider replacing whole-graph `JSON.stringify` comparisons with revision IDs or structural sharing.

## Final delivery language

Safe claim: **“A static, account-free planning prototype built from a validated Pascal baseline. It protects the original fixed architecture and desks, supports independent current/remodel scenarios, feet-based 2D editing, measurement, undo/redo, and trusted-baseline import/export. It remains a provisional schematic—not an as-built, clearance-certified, or photoreal model.”**

Do not yet claim: **WCAG AA compliance, direct keyboard nudging, photoreal fixture fidelity, or independently validated Pascal compatibility for every edited export.**
