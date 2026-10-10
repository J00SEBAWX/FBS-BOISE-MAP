# Independent verification of the scan / survey reconciliation

Reviewer: independent re-check, 9 Oct 2026. Everything below was recomputed with my own parsers and scripts (`scratchpad/verify/`: `vparse.py` DXF, `vglb.py` glTF, `vfit_glb.py`, `vfit_store.py`, `vransac.py`, `vlabels.py`, `vmeasure.py`, `vdiff.py`, `voverlay_num.py`, `vobb.py`, `vrender.py`). None of the analyst's scripts were reused. Survey = `survey-current.json` (145 items). Master = `out/master-layout.json`.

## Verdict

**The reconciliation passes, with minor corrections.** The transform, the porch, the north-east step and the warehouse-drift conclusions all hold up. `master-layout.json` is valid and matches the change table exactly. `scan-overlay.json` is in store coordinates.

I found no value in the master that needs changing, so **`master-layout.verified.json` is a byte-identical copy of `master-layout.json`**.

What is wrong is in the report, the status labels and the overlay metadata (all listed in section 7):

- One evidence statement is false: the front wall W18 is 16.6 ft tall, not 10.0.
- Two confidence labels and several "confirmed" statuses are overstated.
- One object call is overconfident, and the stair riser count is wrong.
- One scanned opening is missing from the open questions.
- The warehouse polygons in the overlay are hybrids of shifted and unshifted vertices.

## 1. Transform (recomputed from scratch)

**GLB to DXF.** I parsed the glTF myself: node TRS chain and POSITION accessors, giving world bounding boxes. All 43 `Wall_i` meshes are axis-aligned and map one-to-one to DXF Lines-layer entities `L0`-`L42` (`Wall_i` = `L_i`).

- Free least-squares fit: scale 3.28002 ft/m (0.02% from 3.280840), offset 76.646 / -50.739. With the scale fixed at 3.280840: **DXF_x = 3.280840·X + 76.642, DXF_y = -3.280840·Z - 50.740.**
- Centre-line RMS is 0.056 ft (max 0.17).
- Each wall's DXF length differs from its mesh length by 0.16 ft per end. That is half the model wall *thickness* of 0.10 m. The analyst's wording ("0.1 m half-thickness") is slightly off; the conclusion stands.
- The analyst's composite is confirmed: **GLB to store x = 3.280840·X + 76.897, y = -3.280840·Z + 41.754.**

**DXF to store.**

- With the analyst's 9 anchor lines (length-weighted least squares) I get exactly **dx = 0.255, dy = 92.494**. Unweighted RMS is 0.281 ft and the worst residual is +0.472 (L37). Residuals: L15 -0.12, L25 -0.02, L37 +0.47, L19/L30 +0.42, L41/L38 +0.14, L11 -0.17, L7 -0.24.
- **Anchor-free check:** I voted every DXF wall line of at least 4 ft against every survey wall face and centre of the same orientation, at a tolerance of 0.2 ft:
  - x plateau: -0.05 to +0.38, picking the same 7 lines (L7, L11, L19, L24, L30, L38, L41).
  - y plateau: 92.32 to 92.81, picking L14, L15, L25, L36 and L37.
  - The analyst's (0.255, 92.494) lies inside both plateaus, so the translation is good to about ±0.25 ft.
- **Rotation and scale:** a free similarity fit gives scale 0.9964, rotation -0.28° and RMS 0.15. That is not material, so rotation 0 and scale 1 are fine.
- **No mirror:** in both data sets the warehouse is at the west, the will-call and roll-up doors are in the north wall and the front door is at the south.
- **Fit-independent width:** the spacing from L15 to L25 is **80.10 ft** (survey 80.0).

**Warehouse drift.**

- Reproduced: offset (-2.64, -3.37). Residuals after it: L13 +0.44, L28 -0.45, L40 -0.07, L42 +0.06. Scan warehouse size is **49.11 x 58.02 ft** (survey 49.65 x 58.15).
- A one-piece x fit including the warehouse needs a 2.9% stretch and still leaves 0.74 ft RMS. The one-piece y fit fails outright (RMS 1.62). Two independent jogs (grid C L7/L28 2.4 ft apart; north wall L25/L40 3.3 ft apart) vanish under one translation, and the drawings show a straight north wall and a 169-ft length. **Drift is the right reading.**
- Caveat: the drift is probably not a pure translation:
  - Two warehouse north lines run 2.0 ft apart (L10 and L40), and the roll-up door sits on L10.
  - L42 runs 2.3 ft past the west wall.
  - The corridor wall L4 and the loft stairs are connected to L42 in the raw scan but were left in the main block.
  - Treat the drift-corrected warehouse overlay as ±2 ft. Keeping the survey warehouse walls in the master was the right call.

## 2. Re-measured walls, openings and doors (27 checks)

All 34 Polycam dimension labels match the length of their line to within 0.05 ft (34 of 34). Store feet, analyst transform.

| # | Scan element | Scan | Master | Survey | Result |
|---|---|---|---|---|---|
| 1 | L15 south wall (sales), inner face | y -0.12 | 0.00 | 0.00 | OK -0.12 |
| 2 | L25 north wall (sales), inner face | y 79.98 | 80.00 | 80.00 | OK -0.02 |
| 3 | L37 old-building north wall, inner face | y 70.47 | 70.00 | 70.00 | OK +0.47 |
| 4 | L19/L30 arch wall, south solid part | x 103.42, y 1.26-20.63 | 103.00 (centre) | same | OK +0.42 |
| 5 | L41/L38 arch wall, front-room side | x 103.14 | 103.00 | same | OK +0.14 |
| 6 | L11/L45 square arch | opening y 38.37-45.19 (6.82 wide) | i27 pier 39.28-41.60 + i40 41.60-45.68 | same | Conflict, survey kept: OK |
| 7 | L7 grid C south / Von's wall | x 49.76 | 50.00 | same | OK -0.24 |
| 8 | L59 / Door_0 Von's door | y 4.28-7.25 (2.97 wide, 6.99 tall) | 4.25-7.25, h 7 | 3.00-6.00 | Corrected: OK |
| 9 | L18 front wall (porch), 37'2" | inner face y 11.31, x 103.42-140.57 | i9 inner face 11.30 (x 112.78-169.70) + scan_front_w 103.355-106.785 | inner face 0.00 | Corrected: OK (+0.01) |
| 10 | L53 / Door_4 front door | x 107.00-112.57 (5.57 wide), h 7.21 | 106.78-112.78, h 7.2 | 112-118, h 7.9 | Corrected: OK (same centre 109.78) |
| 11 | L14 north wall, east part, 18'2" | y 80.04, x 120.69-138.89 | i14 to x 139.595 at inner face 80.0 | stops at 127 | Corrected: OK |
| 12 | L21 north-east step, 9'7" | west face x 138.89, y 70.47-80.04 | i15 west face 138.89, y 70.0-80.7 | 127.00 | Corrected: OK (0.00) |
| 13 | L27 + L6 decking face | x 80.40-103.42 = 23.02 ft at y 1.26 | i63 79.65-102.65 | 77-100 | Corrected: OK (set 0.77 west so it ends at the survey arch-wall face) |
| 14 | L24 desk-back partition, 33'7" | x 125.93, y 26.78-60.41, opening 34.56-39.32 | sdf_wall 125.60, y 21.4-37.6 | same | x +0.33, but extent conflicts (see 7c) |
| 15 | L55 / Door_8 will-call doors | x 81.21-86.87 | 86.50-92.50 | same | Conflict (-5.3 ft), survey kept: OK |
| 16 | L50 / Door_7 white door | y 76.36-79.17, h 6.80 | 76.30-79.30, h 6.9 | same | y OK; scan x is 99.99 (on the L22 plane) |
| 17 | L22 AIR GUNS face, 34'5" | x 99.99, y 45.56-79.98 | i61 face 100.80 | same | -0.81, check only: OK |
| 18 | L13 west wall (drift-corrected) | x 0.44 | 0.00 | same | +0.44 (position assumed) |
| 19 | L40 warehouse north wall (drift-corrected) | y 79.93 | 80.00 | same | -0.07 (position assumed) |
| 20 | L42 warehouse south wall (drift-corrected) | y 21.91 | north face 21.85 | same | +0.06 (position assumed) |
| 21 | L28 grid C, north part (drift-corrected) | x 49.55 | 50.00 | same | -0.45 (position assumed) |
| 22 | L47 / Door_2 roll-up door | x 37.05-46.96 (9.92 wide x 9.58 tall) | 37.5-45.5 (8 x 10) | same | Centre +0.5; width conflict, survey kept: OK |
| 23 | L52 wide opening (wood header) | y 54.83-66.44 (11.61 wide) | 48.5-68.5 (20) | same | Conflict, survey kept: OK |
| 24 | L57 french doors | x 22.21-27.31 (5.11 wide) | 29-35 | same | Conflict, survey kept: OK |
| 25 | L0 stub, 1.93 ft long, 15.65 ft tall | (98.14, 27.92-29.85) | none | none | Possible column; open question 15: OK, not added |
| 26 | Width, L15 to L25 | 80.10 | 80.0 | 80.0 | OK |
| 27 | Warehouse size, L13-L28 x L42-L40 | 49.11 x 58.02 | 49.65 x 58.15 | same | OK |

**Every "high" change checked:**

- **i8:** OK.
- **i9:** OK where scanned (x 103.4-140.6). The extension from x 140.6 to 169.7 rests only on the drawing note, which I confirmed in `docs/handoff/audits/model-council-claude_opus_5_0.md:64-65`: "grid E to H" and the step "near grid G-H". The changes JSON should split the confidence the way the report table does (7b).
- **i4 and c3:** The extent is OK (11.3 to 80). The ceiling evidence is partly false and the height should be medium confidence (7a).

## 3. master-layout.json validity

- It parses. There are 146 items: all 145 survey ids are present in the original order, plus 1 added (`scan_front_w`). No duplicate ids. No null, NaN or infinite numbers. No survey field is lost; the only new field is `src`, on changed items. `building` {169, 80} is kept.
- A programmatic diff against `survey-current.json` finds **exactly 22 changed items**. Each one's changed-field set equals the report's `field` list, and every from/to number matches the report (**0 mismatches**). The 23rd row (`scan_front_w`) is the only new item: a 3.43-ft wall piece measured from L18 between the arch wall and the door. It is not invented.
- Wall chain at the front: i8 ends at 103.355; scan_front_w runs 103.355-106.785; door 106.78-112.78; i9 runs 112.78-169.70; east wall i17 runs y 11.3-70.0. The chain is continuous; the 0.005 ft rounding gaps are immaterial.
- No master item is left on the porch (x > 103.36, y < 10.6) or outside the north-east step.

## 4. scan-overlay.json frame (rendered and inspected)

- **Lines:** recomputed from my own DXF parse with (0.255, 92.494), plus (-2.64, -3.37) where block = warehouse. Maximum difference is 0.007 ft for all 62 lines.
- **Objects:** centres recomputed from my own GLB parse. Maximum difference is 0.011 ft for all 68 objects. All 14 GLB doors and windows match to within 0.01 ft. **It is in store coordinates.**
- **Renders:** `verify-overlay-all.png` and close-ups `-front`, `-ne`, `-wh`. Scan walls are blue, spans and doors green, objects orange, master walls black, changed master walls green, the original survey positions of changed items pink. Looking at them:
  - The scan walls sit on the master walls along the sales floor, the arch wall and the north wall.
  - L18 sits on the moved front wall, with the door, cooler and counter on their scan boxes.
  - L14 and L21 sit on the moved i14 and i15.
  - The drift-corrected warehouse walls sit within half a foot of the survey walls.
- **Overlay defects** (not frame errors):
  - `transform.dxfToStore.dx` says **0.25**. The coordinates actually use 0.255, so the metadata should say 0.255.
  - `Floor_Other_1` and `Ceiling_Other_1_1` mix shifted and unshifted vertices. That produces slanted edges (0.44, 21.9)→(44.65, 25.26) and (52.18, 44.27)→(49.55, 48.72); the faint diagonal is visible in `overlay-check.png`.
  - L4 and `stairs13_0` (main block) end 3.4 ft north of the shifted L42, which they touch in the raw scan.
  - L42 runs to x -1.82, outside the west wall.
  - `coverage.xMin` 0.45 ignores the -1.82.

## 5. Object identification table

- The totals are correct: 3 appliances + 19 fixtures + 46 furniture = 68 objects; 47 matched and 21 unmatched.
- These calls check out against the geometry:
  - `storage_cabinet_mid5_0` + `sink_0` (x 113.65-128.62, along L18) = refreshment counter.
  - `refrigerator_0` (2.5 x 3.2 ft, 6.5 ft tall, in the corner) = soda cooler.
  - `storage_cabinet_low4_0` (97.8-99.8 x 67.4-75.7) = ROLAIR rack.
  - `table_other_rect_1` = cedar desk.
  - `storage_shelf_12` (88.2-101.9 x 1.4-2.8, 3.6 ft tall) = decking lower shelves; consistent with `public/tex/decking_lower_A.jpg`.
  - `bed_0` = 7.1 x 9.2 x 7 ft block on the warehouse floor.
- **storage_shelf_17:** the box is rotated 47°. Its centre line passes **0.2 ft** from the centre of the survey's south-east sales desk back (SDB) chamfer. Confirmed.
- **Wrong or overstated calls:**
  - **`storage_shelf_10` = Buck knives case is labelled "high". It should be low to medium.** The scan box is 0.8 x 1.7 ft running N-S; the survey case is 2.5 x 1.0 ft running E-W, and the centres are 1.6 ft apart.
  - **`stairs13_0` "16 risers" is wrong.** The mesh has **13 treads**: rises of about 0.69 ft (8.3 in) from 0.2 to 9.2 ft, which also matches the RoomPlan name `stairs13`. The top is at the south end (y ≈ 15), so the stairs rise toward the loft. The "16 steps" in open question 12 should read 13.
  - SDB "confirmed" is generous. The scanned SDB parts span y 33.4-47.4 (14 ft) and x 70.0-85.8, against the survey's 10 x 15.4 ft. The analyst noted the south counter but not the north one (`table_other_rect_8`, y 45.3-47.4).
  - No other call is obviously wrong. The low-confidence calls are labelled low.

## 6. Building outline

The outline conclusions are confirmed:

- **Width:** 80 ft is confirmed independently of the fit (80.10).
- **Length:** 169 ft cannot be checked. The scan's east limit is x 153.0 (L37 and Window_1), and the warehouse's west wall position depends on the drift assumption. Keeping 169 was correct.
- **Porch:**
  - L18 is 16.6 ft tall and holds the front door, cooler, counter and a second cabinet run, so it is the storefront.
  - Nothing south of it was scanned east of the arch wall.
  - The drawing note independently gives the recess at about 10 ft from E to H.
  - Recess: 11.31 ft at the inner faces (11 ft 5 in from L15).
- **North-east step:** confirmed. The scanner was inside a room at x 120.7-138.9, y 70.5-80.0 whose north wall L14 is collinear with the sales north wall (80.04 against 79.98). The wall east of it has a 7'8" door (Door_6), and the wall L37 continuing east has an exterior door and a 2.8-ft-sill window. The analyst's corrected x 139.24 is right.

Open items on the outline:

- The corner room (x 127.35-139.24, y 70.35-80) has no floor or ceiling item. This is flagged as open question 3.
- See 7d for the opening into it.

## 7. What is wrong (with numbers) and the corrections

a. **i4 / c3 ceiling evidence is false in part.** The report says every front-room wall is 10.0 ft, including W18. In fact **W18 (L18, the recessed front wall) = 5.065 m = 16.62 ft**; the overlay itself stores h 16.62. The other cited walls (W41, W24, W17, W12, W9) are 9.96 ft, and RoomPlan's ceiling over the entry room is 9.96 / 10.91.
   - Correction: keep 10.0; set the confidence for the height to **medium**, not high; fix the evidence text.

b. **i9 confidence is "high" for the whole wall in changes.json and the summary.** It should be **high for x 103.4-140.6 and medium for x 140.6-169.7** (drawing note only), as the report table already says.

c. **Status table over-claims:**
   - **i29** "confirmed" should be **not covered**. There is no scan geometry on the arch line at y 76-80; only L22, 3 ft west.
   - **sdf_wall** "confirmed" should be **conflicting**. x agrees (+0.33), but the scan wall runs y 26.8-60.4 against 21.4-37.6.
   - **i10, i11, i12, i20, i23, i24 and i32** "confirmed" should be **size confirmed, position assumed**. The drift offset was fitted on these same walls, so their positions are not independent evidence.
   - **i38** confirms only the south edge.
   - Corrected totals: confirmed 16 (7 of them position-assumed), corrected 16, conflicting 11, not covered 35.

d. **Missing open question.** The y 70.47 wall line west of the step carries a scanned **12'0" x 9'10" opening (L49, x 125.6-137.6)** between the old building and the corner room. It also continues west to x 116 (L39, L35) with two high windows (sill 7.3 ft).
   - The master keeps i16 solid and starting at x 127. That is acceptable (survey kept), but it belongs in open question 3.

e. **Objects:** Buck knives confidence; stairs riser count (13, not 16; also in open question 12). See section 5.

f. **Overlay:** dx 0.255; hybrid warehouse polygons; L4 and stairs block boundary; L42 west end. See section 4.

g. **Small text slips:**
   - Open question 5 says "19 ft 4 in"; the scan value is 19.26 ft = **19 ft 3 in**.
   - The GLB-to-DXF RMS is 0.06 ft on centre lines (reported 0.11; harmless).
   - The SPEC says the origin is the south-west *outside* corner. The survey walls actually sit outside 0 (centres at -0.35), so the report's "inside faces" wording matches the data.

## 8. Notes and recommendations (not applied)

**Ceiling heights (c1 19.3, c2 10.3, c3 10.0, c4 20.3).** The scan wall heights cluster exactly by room:

- 6.193 m for all 5 warehouse walls.
- 5.870 m for all 7 sales-north walls.
- 3.037 m for 11 front-room partitions.

They are therefore RoomPlan's per-room ceiling estimates, not independent per-wall heights. They support the ceiling changes at **medium** confidence, but they are not evidence of where partitions stop, so leaving wall `h` at the survey values was right.

c1 (15 → 19.3) is the most debatable change. I accept it at medium confidence, because RoomPlan could not see 19.3 ft of wall above a 15-ft solid ceiling. The admin should still answer open question 5 before Phase 1 relies on it.

**Phase 1 builder: gaps between wall tops and ceilings.** After c1 and c4, the grid-C walls i18-i20 (h 18) sit 1.3-2.3 ft below the ceilings on both sides. The current `public/js/app.js` fills the step between floors only from the lower to the higher ceiling (19.3→20.3 at grid C), so an open band from 18 to 19.3 would show. Also, `ceil > 18` makes the old renderer draw the "vaulted tile" sales ceiling as open structure. The 3D builder should carry walls and fascia up to the adjacent ceiling.

**Fixtures I agree with (forced or measured):** the cooler, counter, spinner (low confidence), front door, decking wall, and the new 3.43-ft wall piece. The cooler bank keeps the survey's 6.1 ft although the scan sees one 3.2-ft unit; this is open question 2. That is acceptable under the "keep survey, list it" rule.

## Files

- `out/master-layout.verified.json`: identical copy of `out/master-layout.json`; no values changed.
- `out/verify-overlay-all.png`, `out/verify-overlay-front.png`, `out/verify-overlay-ne.png`, `out/verify-overlay-wh.png`: my renders of the overlay over the master.
- `scratchpad/verify/*.py`: the scripts used for this review.
