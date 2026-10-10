# Independent check of the scan clean-up (SCAN-AUDIT)

*9 Oct 2026. I re-checked the work with my own scripts in `scratchpad/sav/`: `glb.py`, `holes.py`, `gridcmp.py`, `onmaster.py`, `render.cjs` and `plan2d.py`. I did not reuse any of the auditor's scripts. Ground truth is the photo survey (`survey-current.json`, 145 items) plus the building-drawing notes in `docs/handoff`. Units are store feet: x runs east from the inside of the west wall, and y runs north from the inside of the south wall.*

## Verdict

**The clean-up passes.** The GLB holds no furniture, floors or ceilings. Every kept scan piece sits on a master wall or door, and no real photo-survey wall was lost. The four reverts to the photo survey are justified.

I found one small mistake:

- **The `toConfirm` flag was missing on three items.** SCAN-AUDIT.md says Von's door (`i35`, with `i21` and `i22`) is "marked toConfirm in the file". It was not. All three items have `src: "scan"` and no flag.
- **Fixed in `master-layout.clean.verified.json`.** The flag is added to all three. An `audit.verification` note is also added. Nothing else changed: same 146 items, same order, same values.
- **The other two outputs are unchanged.** `scan-clean.verified.glb` and `scan-overlay.clean.verified.json` are byte-identical copies.

## 1. scan-clean.glb (checked with my own glTF parser)

- **Structure:** a root `ScanClean` with `Walls` and `Doors`, 36 nodes and 33 meshes. There is no Furniture, Appliances, Fixtures, Objects, Floors, Ceilings or Windows node.
  - Walls (16): Wall_7, 8, 13, 14, 15, 18, 19, 24, 25, 28, 30, 37, 38, 40, 41, 42.
  - Corner posts (16): Joint_0, 4, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 22, 23.
  - Door (1): Door_0, Von's door.
- **Original for comparison:** the source has 43 walls, 25 joints, 10 doors and 4 windows (under Openings), 9 floors, 19 ceilings and 68 objects (3 appliances, 19 fixtures, 46 furniture). Removed: 27 walls, 9 joints, 9 doors, 4 windows, all objects, floors and ceilings. These counts match the auditor's.
- **Frame:** no node has a transform. Overall bounds are x 0.00 to 152.98, height -0.33 to 20.32, z -80.19 to 0.30. That is the scene frame `(store_x, height, -store_y)` in feet.
- **Unchanged pieces:** Walls 7, 8, 13, 15, 19, 30, 38 and 41, all 16 joints and Door_0 match the original vertices put through `3.280840*(X,Y,Z)+(76.897,0,-41.754)` to **0.000 ft**. The warehouse pieces add `(-2.64,0,+3.37)`.
- **Loader test:** I loaded it in three.js **r128** with GLTFLoader. This copy is byte-identical to the app's `public/vendor/three.min.js`. It ran in headless Chromium/SwiftShader with 0 console errors or warnings: 33 meshes, with the same bounds as above.
- **Khronos validator 2.0.0-dev.3.10:** 0 errors, 0 warnings, 0 infos, 0 hints. 980 vertices, 502 triangles, POSITION and NORMAL attributes, 2 materials, no textures.

**Edited walls.** I rasterised the face coverage of the original and the clean meshes (0.1 ft along the wall by 0.5 ft in height) and compared them. Every difference is one of the declared edits:

| Wall | Filled (scan only, not in the photos) | Cut in (photo survey) | Trimmed |
|---|---|---|---|
| L14 | door x 125.1-128.7 | - | ends to the corner posts |
| L18 | door x 107.0-112.0 | front door `i30` x 112-118, h 7.2 | - |
| L24 | - | - | y 34.6-60.6 removed (kept 26.6-34.55, inside `sdf_wall` 21.4-37.6) |
| L25 | door x 81.2-86.5 | will-call `i31` x 86.5-92.5, h 7.9 | - |
| L28 | - | `i37` y 48.7-68.5, h 12.6; `i36` y 71-77.5, h 8.5 | - |
| L37 | door x 140.7-143.5; window x 148.8-152.6 | - | - |
| L40 | - | man door `i33` x 27-30, h 7; roll-up `i32` x 37.5-45.5, h 10 | - |
| L42 | doorway x 22.2-27.3; high opening x 18-26.9 (12.4-20.2 ft up) | french doors `i34` x 29-35, h 7.5 | x -1.8 to 0 removed |

**Wall heights are unchanged** on all eight edited walls (top heights identical).

## 2. Every kept piece against the master (distance; share of its length lying on master structure)

| Piece | Plane | Span | Master item(s) | Distance | On master | On photo survey |
|---|---|---|---|---|---|---|
| L7 | x 49.76 | y 2.16-44.28 | i21, i35 (door), i22, i18 | 0 | 100% | 100% |
| L8 | x 49.54 | y 77.9-80.1 | i20 | 0.11 | 96% | 96% |
| L13 | x 0.44 | y 23.2-80.1 | i10 | 0.44 (drift residual) | 100% | 100% |
| **L14** | y 80.02 | x 120.85-138.72 | i14 (scan-extended) | 0 | 100% | **34%** (x 127-138.7 lies beyond the survey's x 127 step) |
| L15 | y -0.13 | x 48.1-97.2 | i8 | 0 | 100% | 100% |
| **L18** | y 11.29 | x 103.6-140.6 | scan_front_w, i30 (door), i9 | 0 | 100% | **0%** (survey front wall at y 0) |
| L19 / L30 | x 103.41 | y 1.1-20.6 | i25 (+0.2 ft into i38) | 0.06 | 100% | 100% |
| L24 | x 125.93 | y 26.6-34.55 | sdf_wall | 0 | 100% | 100% |
| L25 | y 79.97 | x 54.2-99.8 | i13, i31 (door), i14 | 0.03 | 100% | 100% |
| L28 | x 49.54 | y 48.7-77.7 | i37, i19, i36, i20 | 0.11 | 100% | 100% |
| L37 | y 70.46 | x 138.9-153.0 | i16 | 0 | 100% | 100% |
| L38 / L41 | x 103.13 | y 45.4-67.5 | i28 (+0.3 ft into i40) | 0 | 100% | 100% |
| L40 | y 79.92 | x 0.6-49.4 | i11, i33, i12, i32, i13 | 0.08 | 100% | 100% |
| L42 | y 21.90 | x 0-41.85 | i23, i34, i24 | 0.05 | 100% | 100% |
| Door_0 | x 49.76 | y 4.27-7.24 | i35 | 0 | 100% | 100% |
| 16 joints | - | - | each on a kept wall's master item | max 0.11 | - | - |

- **No kept piece is a phantom.** The worst offset is 0.44 ft (L13), as the auditor reported.
- **Two pieces do not sit on the photo survey.** They sit on accepted master corrections, are flagged `toConfirm`, and both have two independent sources:
  - **L18, the recessed storefront wall.** Drawing note: "enclosed wall recessed ~10 ft behind the outer piers, grid E to H". The scan puts it at 11.3 ft.
  - **L14, the north wall running past x 127 to the step at x 139.** The scanner was physically inside a room at x 120.7-139, y 70.5-80; it recorded a sink at x 121.7, inside the survey's own front room. The drawing puts the step "near grid G-H", which is east of the survey's x 127.
- **Cosmetic only:** L30 and Joint_12 reach 0.2-0.56 ft into the Arch 1 opening. L41 and Joint_8 reach 0.3 ft into the square-arch opening. Both are within the scan's ±0.4 ft fit, so I left them.

## 3. Every deleted wall, door, window and opening against the photo survey and docs

I looked for any deleted piece that lies on a photo-survey wall. There are only four, and in each case the master item stays:

- **L11** (square-arch header; mostly a 6'10" opening) lies on i27, i39 and i40. The master pier and arch stay.
- **L21** (north-east step; 7'8" of it is a doorway) lies on i15. Master i15 stays.
- **L36** (12-ft opening) lies on i16. Master i16 stays.
- **L23 and L33** are 0.5-ft jogs on i25 and i38.

**No photo-survey wall was lost.**

Everything else deleted either has no survey wall at all, or is a display or rack face 1.25-3 ft in front of a real wall:

- **Display or rack faces:**
  - L22 is the AIR GUNS face, 2.67 ft west of i28.
  - L27 and L6 are the decking face, 1.25 ft in front of i8; L26 is its return.
  - L5 and L31 are the pergola sides.
  - L16, L29 and L32 are the AIR GUNS outline.
  - L10 is the rack faces, 2.1 ft inside L40.
  - L34 is the apparel / Packout corner.
  - L1 is the cubicle edge.
- **No survey wall nearby:**
  - L2, the y 60.4 room-closure line.
  - L0, a 1.9 ft stub.
  - L3, L4, L9, L12, L17, L20, L35 and L39.

Doors, windows and openings:

- **Wrong position or plane.** The photo version is used instead:
  - Door_2, Door_4, Door_7 and Door_8.
  - Open_L28, Open_L42 and Open_L11.
- **Unsupported:**
  - Door_1, Door_3, Door_5, Door_6 and Door_9.
  - Window_0 to Window_3.
  - Open_L24 and Open_L36.

Two caveats for AJ. Neither needs a file change:

- **Windows:** the photo survey has **no `window` items at all**, so "not in the photos" is weak evidence for a window. Window_1 (x 148.8-152.6, 2.8-ft sill) and Door_9 (x 140.7-143.5), both in the old-building north wall, and Window_3 (the high opening into the loft, 12.4-20.2 ft up) could be real.
- **Why the files can still stay as they are:** these are filled solid in the scan shell, so the shell agrees with the master. The auditor listed them as tape checks. A real window drawn as solid wall misleads less than a phantom would.

## 4. master-layout.clean.json

- **Valid:** 146 items. All 145 survey ids are present in their original order, plus `scan_front_w`. There are no duplicates and no NaN or infinite values. `i90` has `h: null`, inherited from the survey.
- **Changes against the earlier `master-layout.verified.json`:** only the documented reverts (i63, i30, i85, i84), the follow-on changes (i9, scan_front_w) and the `toConfirm` texts.
- **Front wall chain:** -0.695 to 103.355 (i8), then 103.355 to 112.0 (scan_front_w), 112 to 118 (i30), 118 to 169.7 (i9) at y 10.6-11.3. The east wall i17 runs y 11.3-70. The chain is continuous.
- **Placement:**
  - Nothing stands on the porch: no non-wall item with x > 103.4 and y < 10.6.
  - Nothing stands outside the north-east step.
  - Nothing stands in the corner pocket.
  - Coolers (106.45-112.55 x 12.2-14.8), counter (118-131 x 11.6-14.2) and spinner keep the survey layout, shifted by +11.3 ft.
- **Reverts are justified:**
  - **i63 decking:** the scan face really is only 80.4-97.0 (L27). Its 23.0 ft "match" added L6, which is the pergola room's south edge after the L26 return at x 97. So the scan does not establish 79.65-102.65, and the photo position 77-100 (right after the millwork at 77.0) stands.
  - **i30 front door:** follows the photo survey and the layout note "front door x 112-118". **This is the top tape check:** the scan measured a door hole at 107-112.6.
  - **i85 coolers and i84 counter:** survey sizes, order and orientation are restored; only the documented recess shift is applied.
- **Scan-sourced items that remain** (no new scan-only fixtures or furniture were added):
  - The recess set: i4, i5, i8, i9, i17, c3, c6 and scan_front_w (drawing note plus scan).
  - The north-east step: i14 and i15.
  - Ceiling heights: c1, c2, c4, i1 and i3.
  - Von's door: i35, i21 and i22.
  - **All now carry `toConfirm`** (22 items).
- **Open note, not a phantom:**
  - Moving the north-east step to x 139.24 leaves a pocket with no floor or ceiling item: x 127-139.24, y 70.35-80. It is walled south by i16 (which still starts at x 127), east by i15 and north by i14, and open to the front room.
  - It was already in the earlier verified master.
  - I recorded it in `audit.verification.openNotes`. It is answered by the north-east-corner tape check.

## 5. Renders (my own: three r128, the clean GLB in blue over the master: walls grey, doors red, openings yellow)

- `verify2-top.png` (plan), `verify2-oblique-sw.png`, `verify2-oblique-ne.png`, `verify2-front.png` (storefront and door) and `verify2-ne-corner.png`.
- `verify2-plan-kept-vs-removed.png`: the original scan over the clean master. Kept walls are blue, deleted walls red, original scan doors magenta and RoomPlan objects orange.
- **What I saw:**
  - Every blue wall lies on a grey master wall, and every cut-in door lines up with a red or yellow master opening.
  - Nothing is floating, and there is no furniture, floor or ceiling.
  - The deleted red lines are visibly display faces (AIR GUNS, decking, pergola), the duplicate warehouse line, or rooms outside the photo survey.
  - The only visual oddity is the floorless north-east pocket noted above.

## Files

- `scan-clean.verified.glb`: identical to `scan-clean.glb`.
- `scan-overlay.clean.verified.json`: identical to `scan-overlay.clean.json`. Lines and Door_0 match the original overlay geometry. L24 and L42 are trimmed as stated, `dx` is 0.255, and the objects, floors and ceilings arrays are empty.
- `master-layout.clean.verified.json`: the auditor's file plus `toConfirm` on i35, i21 and i22, and the `audit.verification` block.
