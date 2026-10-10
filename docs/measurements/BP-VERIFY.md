# BP-VERIFY: independent check of the blueprint reconciliation

*9 Oct 2026. This reviews `BLUEPRINT-RECON.md`, `master-layout.bp.json`, `scan-clean.bp.glb` and `scan-overlay.bp.json`. Everything was written only inside `scratchpad/scan/bp/`; my working files are in `bp/verify/`. Nothing in `scan/out`, the repo, git or production was touched. The blueprint image was not copied anywhere else.*

## Verdict

**The reconciliation passes with 7 fixes** (4 of them in the data, listed below).

- **Calibration.** I redid it independently: my own traced grid lines and a different model. It reproduces the reconciler's calibration to **0.53 ft at most** over 45 test features. Every owner-markup position agrees with the reconciler's within the stated uncertainty.
- **Master layout.** Of the 21 additions and 12 edits/removals, **20 additions and all edits pass the evidence rules**. One addition breaks the "no RoomPlan object restored" rule and was removed. Two door decisions went against the position rule, and one wall height was a modelling error. All are fixed.
- **3D scan file.** The GLB is correct and was copied unchanged.
  - Every restored piece matches the original scan vertex for vertex.
  - No RoomPlan object is in it.
  - The Khronos validator reports 0 errors, 0 warnings, 0 infos and 0 hints.
  - It loads in three r128 with no console errors and no node transforms.
- **Overlay.** Correct and copied unchanged.
- **The report (`BLUEPRINT-RECON.md`)** had accuracy problems. They are fixed in `BLUEPRINT-RECON.verified.md`.

**Counts**

| | Reconciler (`.bp`) | Verified (`.bp.verified`) |
|---|---|---|
| Master items | 166 | **165** |
| Added vs the clean master | 21 | 20 (`bp_stairs_front` removed) |
| Removed vs the clean master | 1 (`i71`, justified) | 1 |
| Items edited by this check | – | 6 (`bp_von_part`, `i35`, `i21`, `i22`, `i34`, `i91`) |
| GLB meshes | 47 | 47 (byte-identical copy) |
| Overlay lines / doors | 27 / 5 | same (byte-identical copy) |
| Tape questions | 17 | 18 |

## 1. Independent calibration

**Method.** This deliberately differs from the reconciler's thin-plate spline on 38 hand-picked crossings (`verify/mycal.py`, `verify/follow.py`).

- The grid lines are followed automatically along their whole length, on a map of the dark drawing ink. The owner's blue marker ink and the grey redactions are masked out.
  - The walls on lines A, C, E and H are followed as the middle of their double line.
  - Where the grey patches cut a line, I added numeric profile reads.
  - The column squares (D3, E3, F3, F4 and G4) were found by template matching.
  - Extra anchors are the grid lines *outside* the building (west of A, south of row 5), which no owner ink or blotch covers.
- Each pixel's store position comes from where it sits between the traced grid curves, interpolated straight across. No spline is used.
- **Anchor set R** uses the same grid values as the reconciler. **Anchor set N** puts E–H at the drawing's nominal 23 ft bays from E = 103 (F 126, G 149, H 172), as a sensitivity test.

**Grid nodes.** 38 nodes compared.

- 28 are within 2.5 px (about 0.25 ft) of the reconciler's.
- The other 10 are 2.8–4.2 px out, about 0.3–0.45 ft:
  - A4, B4, C2, C3, C4, D3, D4, E3, F3 and H1.
  - The row-3 column squares (D3, E3, F3) are 3–4 px south of the reconciler's picks.
  - H1 is 4 px north: I used the north wall's centre line, while the reconciler used the column square.
- Two corrections to my own first pass:
  - Row 2 at grid E: my first trace followed a different dashed line. A zoom confirmed the reconciler's E2 (row 2 runs along the stair-core south wall, y about 650 px), and I corrected my trace.
  - Row 4 west of x 550 px: the printed line is under the owner's blue marker. I anchored it on the line outside the west wall (y 1071–1072 px).

**Drawing conventions found** (all under 0.5 ft):

- Grid A runs on the west wall's centre line, as the reconciler assumed.
- The row-5 line runs on the south wall's *outer* face, about 0.3 ft from its centre.
- Grids C and E run on the *west* face of their walls, about 0.35–0.45 ft from the centre.

**Store positions: rec TPS vs my fit (R).** Same pixels, so this is the model difference only.

| Feature | Rec | Mine (R) | Mine (N) x | Note |
|---|---|---|---|---|
| Von partition (top / mid / bottom) | x 18.00 / 19.00 / 19.57 | 18.13 / 19.00 / 19.62 | same | rec 18.5–19.4, mean 19.0 ✓ |
| Row-4 owner line | y 19.4–19.7 | 19.3–19.9 | – | rec 19.2–19.5 ✓ |
| TOM box: outer W / inner (hatch) W / E | x 47.8–48.1 / 50.0–50.5 / 57.7 | 47.8–48.2 / 50.1–50.4 / 57.4 | – | deck modelled at 50.35–58.3; E edge 0.6–0.9 ft east of the line, inside the ±1.5 tolerance |
| TOM box: N outer / N hatch inner / S | y 41.8 / 39.3 / 26.05 | 42.2 / 39.6 / 26.5 | – | deck y 26.3–42.3 ✓ |
| SE chamfer | (54.9, 26.2) to (57.6, 29.8) | (54.7, 26.7) to (57.3, 30.4) | – | poly (54.8, 26.3) to (58.3, 29.8) ✓ |
| 2 STEPS UP arrow tip | (58.3, 33.5) | (58.0, 34.0) | – | ✓ |
| LASER DECK arrow tips | (47.0, 40.8), (53.9, 43.4) | (47.0, 41.3), (53.7, 43.7) | – | they land on the W hatched strip and the N hatched strip (see §4) |
| Will-call "B" span / arrow tip | 78.0–91.4 / 83.9 | 78.1–91.3 / 83.9 | – | centre about 84.5 ✓ |
| French-door loops | x 27.9–33.0 | 27.9–33.1 | – | ✓ |
| Von's door symbol (along the wall) | y 1.74–5.25 | 1.68–5.20 | – | ✓ (but see fix F2) |
| "1 STEP" outline S / E / N | y 49.2 / x 117.9 / y 59.3 | 49.0–49.3 / 117.9 / 59.1 | 118.5 | ✓ |
| Stair-core S wall (L17 at 60.0) | 59.70 | 59.72 | – | 0.3 |
| Wall between flights (L12 at 65.6) | 64.74 | 64.42 | – | 0.9–1.2 (the reconciler said 0.9) |
| Stair-core E wall (L9 at 116.03) | 115.58 | 115.50 | 116.00 | 0.0–0.5 |
| MEN S wall (L39 at 70.47) | 70.35 | 70.13 | – | 0.1–0.35 |
| MEN E wall (L20 at 120.69) | 121.43 | 121.22 | 121.95 | 0.5–1.3 (the reconciler said 0.3) |
| Old-building N wall (i16 at 70.35) | 70.21 | 69.96 | – | 0.1–0.4 |
| Old-N door swing (Door_9 140.73–143.50) | 139.3–142.0 | 139.2–142.0 | **140.7–143.5** | 1.4 (R) / 0.0 (N) |
| Drawing front doors 1+2 | 108.2–114.9 | 108.2–114.9 | 108.4–115.4 | ✓ |
| Porch pier squares F / G / H | 125.1 / 147.2 / 169.3 | 125.1 / 147.3 / 169.3 | 126.0 / 149.0 / 172.0 | y 0.5–0.7 ✓ |
| Columns i42 / c_s2 / B3 / D3 | (55.3, 19.7) / (55.3, 9.7) / (24.8, 40.1) / (76.6, 39.5) | (55.3, 19.8) / (55.5, 9.7) / (24.8, 40.1) / (76.5, 39.9) | – | ✓ |

**Differences above the stated uncertainty:** none.

**Systematic issue to know about (not a calibration mistake).**

- The reconciler pins grid H to the east wall at x 169.35, and the scan never reached the east wall. That value comes from the photo survey and the drawing's own 169 ft chain.
- The scan puts the arch wall (grid E) at x 103. The drawing's nominal grid has E at x 100.
- So either the bays E–H are really about 22.1 ft each, or the building is about 172 ft long.
- Everything east of x 125 therefore carries an extra 1–3 ft east–west doubt. That covers the porch piers, the old-N door match and the MEN east wall.
- `calibration.json` and the reconciler's summary call H "pinned to a master wall the scan measured". That is inaccurate. Corrected in the `.verified.md`, and covered by tape question 18.

## 2. Every change checked against the evidence rules

**Additions, edits and removal in the master.**

| Id | Rule used | Check | Result |
|---|---|---|---|
| `i91` laser deck (resize), `i92` steps (move) | 1 (+2) | owner box 47.8–57.7 × 26.1–42.2 (both fits); steps on the E side ✓ | pass. Alternative reading added as a question (§4) |
| `i71` removed | 1 | owner places LASER DECK at the TOM box; the photo deck (x 43.6–50, y 36.5–49.5) is outside the owner's box | pass (justified, asked) |
| `c_laser`, `i49` toConfirm | 2 | ✓ | pass |
| `bp_von_part` | 1 | x 19.0 ±1.5 ✓ (mine 18.1–19.6) | pass. **Height fixed (F1)** |
| `i2` / `bp_room_w` split | 1 | ✓ | pass |
| `i35` / `i21` / `i22` "confirmed, toConfirm cleared" | 1 + 3 | owner door at y 1.7–5.2 (centre 3.4, ±2) vs scan 4.27–7.24 (centre 5.75): 2.35 ft apart, more than the reconciler's own ±2 tolerance. Photos (3–6) are closer to the owner. Position rule says "otherwise keep the value **and add a tape question**". | **fixed (F2)** |
| `i34` french doors "answered" | 1 + 2 | owner 27.9–33.1 agrees with photos 29–35; the measured scan doorway 22.2–27.3 is 5 ft off. Position rule "otherwise" says keep and tape. | **fixed (F2b)**: tape question restored |
| `i23` / `i24` loft wall | 1 + 3 | owner line y 19.3–19.9 vs scan 21.5 (sketch traced on the printed grid line). Kept as scanned. | pass |
| `i31` will-call + `i13` / `i14` / `i95` / `i96` / `i59` | position rule | owner 84.5 ±2.5 agrees with scan Door_8 (centre 84.0), not with photo (89.5) → scan position | pass |
| `i30` front door unchanged + note | 4 only | no owner mark; drawing between scan and photo → keep and tape | pass |
| `bp_stair_s` / `_mid` / `_e1` / `_e2` / `_door` | 3 + 4 | L17, L12, L9 and Door_1 are within 0.0–1.2 ft of drawing walls and doors (both fits); the scan saw them | pass |
| **`bp_stairs_front`** | "4 blueprint + 3 scan" | footprint x 108.2–116.1, y 60.3–65.3 and rise 5.44 ft copied from the **RoomPlan object `stairs7_0`** (deleted category, "never restore"). Without it the stair rests on the 1990s drawing alone (rule 4: corroboration only). | **fixed (F3)**: removed, asked as question 7 |
| `bp_step_plat` | 1 | owner outline ✓ (S 49.0–49.3, E 117.9, N 59.1–59.3) | pass |
| `bp_men_s` (L39), `bp_back_s` (L35), `bp_men_e1` / `_e2` + `bp_men_e_door` (L20, Door_5) | 3 + 4 | drawing walls within 0.1–0.7 ft (R) / 1.3 ft (N); L35's scan high window and the drawing's old door are both left out (the wall line agrees) | pass |
| `bp_back_floor` / `bp_back_ceil` | 3 + 4 | fills the floorless pocket that the earlier verifier flagged, inside walls the master already has; 10.9 ft = height of the scanned walls L20 / L21 / L14, not a RoomPlan ceiling | pass |
| `bp_oldN_w` / `bp_oldN_door` / `i16` split | 3 + 4 | Door_9 within 1.4 ft (R) / 0.0 ft (N) of the drawing door | pass |
| `bp_pier_F` / `G` / `H` | 4 (columns) + porch | rule 4 allows the drawing "for the structural grid, exterior walls and columns". The scan confirms the recess. Not on any floor item, but they stand on the app's ground plane outside the storefront (not floating). | pass. x uncertainty 1–3 ft noted |
| `c_s2` rename, `i42` / `i45` / `i46` src | 2 + 4 | columns within 0.15–1.5 ft | pass |

**Scan pieces restored in the GLB.**

| Piece | In the current scan? | On the blueprint? | Sits on a master wall? |
|---|---|---|---|
| L17, L12, L9 (+ Joint_2, Joint_24) | ✓ identical vertices | ✓ | ✓ |
| L39, L35 (+ Joint_13, Joint_10) | ✓ (high windows filled) | ✓ | ✓ |
| L20 (+ Door_5) | ✓ identical | ✓ | ✓ |
| Door_1 | ✓ | ✓ | ✓ |
| L25 + Door_8 | ✓ as scanned | owner mark | ✓ (`i13` / `i31` / `i14`) |
| L37 + Door_9 | ✓ (window still filled) | ✓ | ✓ |

- No RoomPlan object, floor or ceiling is in the GLB or the overlay: overlay objects / floors / ceilings are 0 / 0 / 0, and the removed lists still hold 68 / 9 / 19.
- The 31 untouched pieces are identical. Only `Wall_25` and `Wall_37` changed.

**Rejected leads.** All 17 are consistent with the rules. Two notes:

- Door_3 is 2.8 ft from the drawing door (worse under N), so it is correctly not restored.
- The "dashed overhead edge at y ≈ 60" that the reconciler cites is probably just the dash-dot row-2 grid line east of F. Either way it is not a wall.

## 3. `master-layout.bp.verified.json` checks

- Valid JSON with 165 unique ids, all types allowed.
- All x / y / w / d / h / rot values are finite and in range (x, y from -100 to 400; w, d over 0 and up to 400; h 0–60; rot 0–360).
- Colours are valid hex, and `poly` values are finite.
- **Wall chains have no gaps:**
  - front: `scan_front_w` 103.355–112 | `i30` 112–118 | `i9` 118–169.7
  - north: `i11` | `i33` | `i12` | `i32` | `i13` (45.5–81.21) | `i31` (81.21–86.87) | `i14` (86.87–139.595)
  - old north: `bp_oldN_w` 127–140.73 | `bp_oldN_door` 140.73–143.5 | `i16` 143.5–169.7
- **Off-floor items:** only the three porch piers (exterior, on the ground plane).
- **Overlaps:** the new overlaps are only the intended ones (desks on the laser deck and on the 1-step floor). The others (`i59` / `i20`, `c_laser` / `i18`, `i45` / `i47`, `i24` / `i72`) were already there.
- **All 146 original ids are present except `i71`**, whose removal is justified in the report.
- **The app's own loader** (`public/js/core/model.js` `normalizeLayout`) reads all 165 items and drops none. The start pose is inside the front door (`i30`). Every new wall is drawn at its own height (`heightToCeiling`), including `bp_von_part` at 9.

## 4. Renders (looked at)

- `verify/app-plan.png` and `verify/app-3d.png` come from **the real app** (`public/`, read-only), served with the verified master, GLB and overlay through request interception.
  - The app showed no console errors.
  - Plan: Von's partition, the laser deck, the will-call doors with a lightbox on each side, the 1-step floor, the stair-core and MEN walls, the back room and the three piers are all in place.
  - 3D: nothing floats, and no scanner furniture is shown.
- `verify/vv_plan.png`, `vv_obl_sw.png`, `vv_obl_ne.png`, `vv_zoom_tom_von.png` and `vv_zoom_front.png` come from my own three r128 renderer. It loaded the GLB with 47 meshes, no node transforms, bounds x 0–152.98 and y -0.3–80.19 (store ft), height up to 20.3 ft, and no console errors.
- `verify/v_von_before.png` and `v_von_after.png` show the partition poking through the loft deck before fix F1, and not after it.
- **Interpretation note (not changed).** The two LASER DECK arrows land one on each hatched leg: the W strip at x 47.8–50.4, straddling the grid-C wall line, and the N strip at y 39.3–42.2.
  - That also fits "laser deck = the hatched L, with Tom's raised office inside it". In that reading the photo survey's low warehouse-side Milwaukee laser display would be part of the W leg.
  - The reconciler's reading (the whole TOM box is the laser deck, 2 steps up) was kept, as instructed.
  - The other reading is now asked in `i91.toConfirm` and in question 4.

## 5. `BLUEPRINT-RECON.md` accuracy (fixed in `BLUEPRINT-RECON.verified.md`)

1. It said the photo was aligned on "walls the scan measured … and the east wall". The east wall was not scanned. It also listed the anchor walls themselves as "confirmed", which is circular. Both corrected, and the F/G/H uncertainty (1–3 ft) is now explained.
2. "Old-building north wall within 0.1 ft" is now "within about half a foot". The MEN-wall match "0.1–0.3 ft" is now 0.1–0.7. The stair-core match "0.3–0.9 ft" is now 0.3–1.2.
3. "Von's door … answered" and "french doors … answered" were wrong under the position rule. Both are back as tape questions 5 and 6.
4. It said the front-room stair was "real" and listed a stair flight in the table. Now only the walls and the door are real; the stair is question 7.
5. Added: the laser-deck reading (question 4) and whether the Von partition continues into the loft (question 5). Tape question 18 now says the east wall tape also fixes the F/G/H positions.
6. The rest checks out against the data, including every question's numbers. The areas table (1,144 + 8,669 + 3,843 = 13,656) is re-read from the photo and is plausible.

## 6. Fixes made

| # | Item | Change | Why |
|---|---|---|---|
| F1 | `bp_von_part` | h 14 → **9**; toConfirm asks whether it continues into the loft | At 14 ft it pierced the loft deck (zone `i7`, slab 9.5–10 ft) and stood 4 ft up in the loft. Von's ceiling `c5` is 9 ft, and no source shows a wall in the loft. |
| F2 | `i35`, `i21`, `i22` | toConfirm restored. It now records the owner's sketch (y 1.7–5.2), the scan (4.27–7.24) and the photo (3–6) | Position rule: the owner's mark does not agree with the scan within tolerance, so keep the value and keep the tape question |
| F2b | `i34` | toConfirm added (scan doorway 22.2–27.3 vs owner and photo about 28–35) | Position rule "otherwise" branch: keep the value and add a tape question |
| F3 | `bp_stairs_front` | **removed** (question 7) | Geometry copied from the RoomPlan object `stairs7_0` ("never restore"); otherwise blueprint-only |
| F4 | `i91` | toConfirm: added the hatched-L reading of LASER DECK | Ambiguity in the owner's two arrows |
| F5 | `audit.blueprint` | `added` no longer lists `bp_stairs_front`; a `verification` block records F1–F4 | Bookkeeping |
| F6 | `BLUEPRINT-RECON.verified.md` | corrections in §5 | Accuracy |
| – | GLB and overlay | none (byte-identical `.verified` copies) | Correct as delivered |

## 7. Not fixed (outside this job, for follow-up)

- **The app labels the grid rows upside down.** `public/js/plan2d/plan.js:190` has `GY = {1: 0, …, 5: 80}`, so the plan shows row 1 at the south wall. The original drawing has **row 1 at the north wall** and row 5 on the south and pier line.
  - The app's `GX` also uses D 75, F 123, G 146 and H 169, where the calibrated drawing gives D ≈ 76.5, F ≈ 125.1 and G ≈ 147.2 (with E at 103).
  - This needs a repo change, which was out of scope here.
- **The app ignores `poly` and does not stack items on platforms.**
  - The chamfered outlines of `i91` and `bp_step_plat` are drawn as rectangles.
  - Tom's desk returns and the cedar desk start at floor level inside the raised floors, so they look 1.3 ft and 0.6 ft shorter than they are.
  - This is only a display limitation; the data is right.
- **The reconciler's `calibration.json` still says grid H is pinned to a scan-measured wall.** It is left as the reconciler's working file; this report and the `.verified.md` give the correct statement.

**Files.**

- `bp/master-layout.bp.verified.json`
- `bp/scan-clean.bp.verified.glb`
- `bp/scan-overlay.bp.verified.json`
- `bp/BLUEPRINT-RECON.verified.md`
- `bp/BP-VERIFY.md`
- Working files: `bp/verify/` (`mycal.py`, `follow.py`, `lines_follow.json`, `mycalibration.json`, `compare.json`, `fixes.json`, `fix_master.py`, `validate.py`, `checks.py`, `loadtest.mjs`, `appshot.cjs`, `myrender.cjs`, and the renders).
