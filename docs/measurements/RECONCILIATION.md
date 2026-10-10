# Store scan vs. photo survey - reconciliation report

*For AJ - FBS Boise store map. Prepared 9 Oct 2026 from the Polycam 3D scan (scan.dxf + scan.glb) and the photo survey of 5 Oct 2026 (survey-2026-10-05b, 145 items).*

> **Read with the later documents in this folder.** The corrections from the independent check (`VERIFY.md`, section 7)
> are applied below: the front-room ceiling evidence and confidence, the status labels and totals, the Buck knives and
> loft-stairs calls (13 treads, not 16), the missing L49 opening in question 3, and two small number slips.
> Later the same day the scan clean-up (`SCAN-AUDIT.md`, checked in `SCAN-AUDIT-VERIFY.md`) trusted the photo survey over
> scan-only numbers and put four of the changes in section 4 back to the photos: the front door x (back to x 112-118),
> the soda coolers, the coffee counter and the decking wall (rows 3, 4, 5 and 22; rows 2 and 23 follow the door). The
> map the site uses is `public/data/master.json`, which already has those reverts (and, since the blueprint step in
> `BLUEPRINT-RECON.md`, the walls, doors and floors the owner's marked-up drawing confirmed).

Positions are in feet: **x = distance east of the inside of the west (warehouse) wall, y = distance north of the inside of the south wall.** The building is 169 ft long (west to east) and 80 ft deep (south to north).

## 1. The short version

- **The scan lines up with the survey very well where it overlaps:** the sales floor, the arch wall, the north and south walls all agree to within half a foot (about 6 inches).
- **Biggest finding: the front door is not on the outside line of the building.** East of the arch wall the front wall (glass door, soda cooler, coffee counter) is set back about **11 ft 4 in** north of the sales-floor south wall line. That makes a covered entry porch along the front. The building drawings say the same thing ("enclosed wall recessed about 10 ft behind the outer piers, grid E to H"). The master map now has the front wall, front door, coolers and coffee counter in their scanned places.
- **Second: the step in the north wall is further east.** The scan finds the north wall running to x 139 ft (not 127 ft) before it steps in about 9 ft 7 in, with a small room with a sink and two doors in that corner.
- **Ceilings:** warehouse 20 ft 4 in (survey 22), south-aisle drop ceiling 10 ft 4 in (survey 9 ft 5 in), front room 10 ft 0 in (survey 9 ft 5 in), sales floor walls 19 ft 3 in tall (survey ceiling 15 ft - see question 5).
- **What the scan did not cover:** everything east of about x 153 ft (east wall, vault, restrooms, offices, stairs to the offices) and Von's office. Those parts keep the survey numbers. The building stays 169 x 80 ft.
- **Warehouse:** its size matches the survey (scan 49 ft 1 in x 58 ft 0 in, survey 49 ft 8 in x 58 ft 2 in), but in the scan file the whole warehouse sits about 2 ft 8 in too far east and 3 ft 4 in too far north compared with the rest. That is a known kind of scanner drift, so the survey walls were kept and the scan warehouse was shifted back for the overlay.
- **Nothing was invented.** 22 survey items were changed (each now carries `src`), 1 short wall piece was added (measured by the scan, needed beside the moved front door), all 145 original ids are still there. Scan furniture that does not match anything stays in the scan overlay layer, not in the master.

## 2. What the scan covered

| Area | Covered? | Notes |
|---|---|---|
| Warehouse (x 0-50, y 22-80) | Yes | Walls, roll-up door, openings to the sales floor; pallet racks are **not** captured (the scanner does not model racking), loose pallets/carts show up as "tables". |
| Corridor east of Von's office with the stairs to the loft | Yes | A 10 ft wall the survey does not have, the stairs, Von's door. |
| Von's office (x 0-44, y 0-22) and the loft | No | Kept as surveyed. |
| Sales floor (x 50-103) | Yes | All four walls, arch wall, decking wall, pergola, sales desk back (SDB), Packout wall, compressor rack, many display parts. Long gondolas are only caught in pieces. |
| Front room (x 103-126) | Mostly | Front wall + door + coolers + coffee counter, cedar desk, the wall behind the front desk. The front sales desk itself was **not** detected. |
| Old building (x 126-153) | Partly | Its north wall (door + window), the area under the mezzanine edge, the corner room with a sink. |
| East end (x 153-169): vault, restrooms, offices, stairs to offices | No | Kept as surveyed. |

## 3. How the scan was lined up

- The two scan files are the same scan: the DXF floor plan is the 3D model seen from above (no flip, no turn). They agree to 0.06 ft (RMS on the wall centre lines).
- The DXF was then slid onto the survey (no turning, no flipping, no stretching) using the long walls that are clearly the same in both: sales-floor south wall (scan 48 ft 11 in), sales-floor north wall (46 ft), old-building north wall (14 ft 1 in), the three solid parts of the arch wall (10 ft 1 in + 9 ft 4 in, 14 ft 5 in + 7 ft 6 in, 7 ft 3 in) and the grid-C wall south part (42 ft 1 in). Average miss: **0.28 ft (3 1/2 in)**, worst 0.47 ft. Allowing a stretch would only improve that to 0.15 ft, so no stretch was used.
- The scan lines are the scanner's wall surfaces, not wall centres; for outside walls that is the inside face (survey inside faces are at x 0, y 0, y 80), for inside walls it is close to the centre.

| Scan wall (length) | Survey wall | Scan position | Survey | Miss |
|---|---|---|---|---|
| L19 10' 1" | i25 arch wall (south solid) (centre) | x 103.42 | 103.00 | +0.42 (used for the fit) |
| L30 9' 4" | i25 arch wall (south solid) (centre) | x 103.42 | 103.00 | +0.42 (used for the fit) |
| L41 14' 5" | i28 arch wall (north solid) (centre) | x 103.14 | 103.00 | +0.14 (used for the fit) |
| L38 7' 6" | i28 arch wall (north solid) (centre) | x 103.14 | 103.00 | +0.14 (used for the fit) |
| L11 7' 3" | i27/i40 pier + square arch (centre) | x 102.83 | 103.00 | -0.17 (used for the fit) |
| L7 42' 1" | i21/i22/i18 grid-C / Von wall (south part) (centre) | x 49.76 | 50.00 | -0.24 (used for the fit) |
| L15 48' 11" | i8 south wall (inner face) | y -0.12 | 0.00 | -0.12 (used for the fit) |
| L25 46' | i13/i14 north wall (sales) (inner face) | y 79.98 | 80.00 | -0.02 (used for the fit) |
| L37 14' 1" | i16 north wall (old building) (inner face) | y 70.47 | 70.00 | +0.47 (used for the fit) |
| L13 56' 9" | i10 west wall (inner face) | x 3.08 | 0.00 | +3.08 (warehouse (drift)) |
| L28 29' 2" | i18/i19/i20 grid-C wall (north part) (centre) | x 52.19 | 50.00 | +2.19 (warehouse (drift)) |
| L40 49' 1" | i11-i13 north wall (warehouse) (inner face) | y 83.30 | 80.00 | +3.30 (warehouse (drift)) |
| L10 47' 11" | i11-i13 north wall (warehouse) [alt line] (inner face) | y 81.28 | 80.00 | +1.28 (warehouse (2 ft inside wall)) |
| L42 43' 10" | i23/i24 warehouse south wall (north face) | y 25.28 | 21.85 | +3.43 (warehouse (drift)) |
| L14 18' 2" | i14 north wall (east part) (inner face) | y 80.04 | 80.00 | +0.04 (check only) |
| L22 34' 5" | i28 arch wall (as seen from sales side, face of AIR GUNS wall) (centre) | x 99.99 | 103.00 | -3.01 (check only) |
| L24 33' 7" | sdf_wall desk back partition (centre) | x 125.93 | 125.60 | +0.33 (check only) |
| L18 37' 2" | i9 south wall (east part) (inner face) | y 11.31 | 0.00 | +11.31 (check only) |
| L21 9' 7" | i15 north-wall notch (inner face (west)) | x 138.89 | 127.00 | +11.89 (check only) |

The warehouse rows miss by 2-3.5 ft all in the same direction; after shifting the scan warehouse by 2.64 ft west and 3.37 ft south they miss by 0.07-0.45 ft. The last four rows are where the scan disagrees with the survey on purpose: the AIR GUNS wall face (the display is 3 ft deep), the front-desk wall (agrees), the front wall (porch) and the north-wall step.

## 4. Every change made in the master map

| # | Item | What changed | From | To | Why | Confidence |
|---|---|---|---|---|---|---|
| 1 | South wall `i8` | x,w | x 55.65, w 112.7 | x 51.33, w 104.05 | Scan: south wall inner face y -0.12 (L15, 48'11") confirms y; east of the arch wall the front wall is recessed (L18), so this wall now stops at the arch wall (x 103.35). | high |
| 2 | South wall `i9` | x,y,w | x 143.85, y -0.35, w 51.7 | x 141.24, y 10.95, w 56.92 | Scan L18 (37'2", x 103.4-140.6) = front wall with the front door, inside face y 11.30 = 11.3 ft north of the sales-floor south wall. Matches the drawing note (enclosed wall recessed ~10 ft behind the outer pier line from grid E to H). Scan stops at x 140.6; continued to the east wall per the drawing. | high (x<141) / medium (x>141) |
| 3 | FRONT DOOR `i30` | x,y,h | x 115, y -0.35, h 7.9 | x 109.78, y 10.95, h 7.2 | Scan Door_4: 5'7" wide x 7'3" tall at x 106.99-112.57 in the recessed front wall. Kept the survey width 6 ft (within 0.5). | medium |
| 4 | Soda coolers `i85` | x,y,rot | x 109.5, y 2.2, rot 0 | x 104.65, y 14.35, rot 270 | Scan refrigerator_0 (3'2" x 2'6", 6'6" tall) sits in the corner of the arch wall and the recessed front wall (x 103.7-106.3, y 11.9-15.0). Survey size kept; turned along the arch wall because a 6.1 ft bank cannot fit between the arch wall and the door. | medium-low |
| 5 | REFRESHMENT COUNTER (coffee/ice/soda) `i84` | x,y,w | x 124.5, y 1.6, w 13 | x 121.14, y 12.6, w 15.0 | Scan storage_cabinet_mid5_0 + sink_0: 15'0" run of 3 ft base cabinets with a sink along the recessed front wall, x 113.6-128.6. | medium |
| 6 | CHECKOUT SPECIALS SPINNER `spin_chk` | y | y 9 | y 20.3 | Was at y 9, which is now outside (porch). Moved north by the same 11.3 ft as the front wall; not seen by the scan. | low |
| 7 | Front room `i4` | y,d,ceil | y 40, d 80, ceil 9.4 | y 45.65, d 68.7, ceil 10.0 | Floor now starts at the recessed front wall (y 11.3). Ceiling: the front-room partitions in the scan (W41, W24, W17, W12, W9) are 9.96 ft tall and RoomPlan's ceiling over the entry room is 9.96 / 10.91 ft; the recessed front wall itself (W18) is 16.6 ft tall. | high (extent) / medium (ceiling height) |
| 8 | Front room drop ceiling `c3` | y,d,h | y 40, d 80, h 9.4 | y 45.65, d 68.7, h 10.0 | Same as i4: starts at y 11.3; scan front-room wall height 9.96 ft (survey 9.4). | high (extent) / medium (height) |
| 9 | Front room east `i5` | y,d | y 35, d 70 | y 40.65, d 58.7 | Floor now starts at the recessed front wall (y 11.3); east part beyond x 141 per the drawing (scan did not reach it). | medium |
| 10 | Old building wood ceiling `c6` | y,d | y 35, d 70 | y 40.65, d 58.7 | Starts at the recessed front wall like i5. Height 12 kept (scan heights here conflict: 10.0-10.9 ft under the mezzanine, 16.6 ft wall at y 60). | medium |
| 11 | East wall `i17` | y,w | y 35, w 70 | y 40.65, w 58.7 | East wall now starts at the recessed front wall (y 11.3) instead of y 0. Not seen by the scan; follows the drawing (porch runs to grid H). | medium-low |
| 12 | North wall `i14` | x,w | x 109.75, w 34.5 | x 116.05, w 47.09 | Scan L14 (18'2") continues the north wall at y 80.03 from x 120.7 to 138.9 (room with a sink, a door to the north and a door to the east). Wall now runs x 92.5-139.6. | medium-high |
| 13 | North wall (notch) `i15` | x | x 127.35 | x 139.24 | Scan L21 (9'7", inside face x 138.89, y 70.5-80.0) is the step in the north wall; survey had it at x 127.35. Drawing: step "near grid G-H". | medium-high |
| 14 | Von's door `i35` | y | y 4.5 | y 5.75 | Scan Door_0: 2'11" x 7'0" at y 4.27-7.24 in the grid-C wall (survey y 3-6). | medium |
| 15 | Von's area wall `i21` | y,w | y 1.5, w 3 | y 2.125, w 4.25 | Shortened to end at the scanned Von's door (y 4.25). | medium |
| 16 | Von's area wall `i22` | y,w | y 13.75, w 15.5 | y 14.375, w 14.25 | Starts at the scanned Von's door (y 7.25), ends at y 21.5 as before. | medium |
| 17 | Sales floor ceiling (vaulted tile) `c1` | h | h 15 | h 19.3 | All sales-floor north walls in the scan are 19.3 ft tall (north wall W25, AIR GUNS face W22, W34); survey 15. May be the top of a vaulted ceiling - verify. | medium |
| 18 | Sales floor `i3` | ceil | ceil 15 | ceil 19.3 | Kept equal to the sales-floor ceiling c1. | medium |
| 19 | South aisles drop ceiling `c2` | h,fasciaTo | h 9.4, fasciaTo 15 | h 10.3, fasciaTo 19.3 | South-aisle walls in the scan (south wall W15 10.36, decking face W27 10.24, W5/W6/W19/W30 10.24-10.36) put the drop ceiling at 10.3 ft (survey 9.4). Fascia now rises to the corrected 19.3 ft. | medium-high |
| 20 | Warehouse deck `c4` | h | h 22 | h 20.3 | Every warehouse wall in the scan (W13, W40, W42, W28, W8) is 20.3 ft tall; survey 22. 20.3 is where the walls meet the roof structure (deck between joists may be a little higher). | medium-high |
| 21 | Warehouse floor `i1` | ceil | ceil 22 | ceil 20.3 | Kept equal to the warehouse ceiling c4. | medium-high |
| 22 | DECKING WALL 23' `i63` | x | x 88.5 | x 91.15 | Scan decking display face = L27 (16'7") + L6 (6'5") = 23'0" exactly, x 80.4-103.4, at y 1.3 (+ white lower shelves storage_shelf_12, as in photos decking_lower_A/B). Survey had x 77-100. Placed x 79.65-102.65 so it ends against the arch wall in the survey frame (scan end 103.4 is 0.4 ft east of the survey arch-wall face). | medium |
| 23 | South wall (front, west of door) `scan_front_w` | (new item) | - | wall x 103.35-106.78 at y 10.95 (w 3.43, d 0.7, h 16) | Scan L18 runs from the arch wall (x 103.4) to the front door (x 107.0); the survey needed a piece here once the front wall moved. Measured, not invented. | medium |

## 5. Status of every structure item

Confirmed = scan agrees within about half a foot. Corrected = scan clearly measured it differently and the master uses the scan. Not covered = the scan did not see it (survey kept). Conflicting = scan and survey disagree and neither is clearly right (survey kept, see questions).

Totals (after the independent check): confirmed 16 (7 of them "size confirmed, position assumed"), corrected 16, conflicting 11, not covered 35. *Size confirmed, position assumed* = the warehouse walls whose position was used to fit the scanner-drift correction, so their position is not independent evidence.

| Item | Type | Status | Note |
|---|---|---|---|
| Warehouse floor `i1` | floor | confirmed | size confirmed (49.1 x 58.0 vs 49.65 x 58.15); ceiling corrected 22 -> 20.3 |
| Von's area `i2` | floor | not covered | Von's office not scanned |
| Sales floor `i3` | floor | confirmed | outline confirmed (walls within 0.5 ft); ceiling corrected 15 -> 19.3 |
| Front room `i4` | floor | corrected | starts at the recessed front wall; ceiling 9.4 -> 10.0 |
| Front room east `i5` | floor | corrected | starts at the recessed front wall; ceiling 12 kept (conflicting) |
| Mezzanine (offices above) `i6` | zone | conflicting | height ~10 ft confirmed (scan 9.96 vs 9.5); scan edge at y 60.4, survey 47 |
| Loft above Von's area `i7` | zone | not covered | loft not scanned; scan sees a high opening (12.4-20.2 ft) in the warehouse south wall into it |
| South wall `i8` | wall | corrected | y confirmed (-0.12 ft); now ends at the arch wall because the front wall east of it is recessed |
| South wall `i9` | wall | corrected | moved 11.3 ft north = recessed front wall (porch) |
| West wall `i10` | wall | size confirmed, position assumed | inside face within 0.45 ft (after the warehouse drift correction) |
| North wall `i11` | wall | size confirmed, position assumed | within 0.07 ft (after the warehouse drift correction) |
| North wall `i12` | wall | size confirmed, position assumed | within 0.07 ft (after the warehouse drift correction) |
| North wall `i13` | wall | confirmed | sales north wall inside face 79.98 (0.02 ft) |
| North wall `i14` | wall | corrected | y confirmed (0.03 ft); extended east to the real step at x 139.6 |
| North wall (notch) `i15` | wall | corrected | step moved from x 127.35 to 139.24 |
| North wall (old building) `i16` | wall | confirmed | y within 0.47 ft; the scan shows this wall line also continues west to x 116 (with openings) - see questions |
| East wall `i17` | wall | corrected | not scanned; now starts at the recessed front wall (drawing: porch runs to grid H) |
| Warehouse wall (grid C) `i18` | wall | confirmed | x within 0.24 ft; where it ends at the wide opening is unclear (scan wall stops at y 44.3, survey 48.5) |
| Warehouse wall (grid C) `i19` | wall | conflicting | x confirmed (after drift fix) but the scan sees no Milwaukee doorway here |
| Warehouse wall (grid C) `i20` | wall | size confirmed, position assumed | x within 0.45 ft (after drift fix) |
| Von's area wall `i21` | wall | corrected | x confirmed; length follows the scanned Von's door |
| Von's area wall `i22` | wall | corrected | x confirmed; length follows the scanned Von's door |
| Warehouse south wall `i23` | wall | size confirmed, position assumed | y within 0.07 ft (after drift fix); door opening position conflicts (see i34) |
| Warehouse south wall `i24` | wall | size confirmed, position assumed | y within 0.07 ft (after drift fix) |
| Arch wall (grid E) `i25` | wall | confirmed | x within 0.42 ft; solid part ends at y 20.66 (survey 20.4) |
| Arch wall (grid E) `i26` | wall | not covered | scan treats the whole arch run (y 20.7-38.3) as open; pier between the arches not modelled |
| Arch wall (grid E) `i27` | wall | conflicting | scan sees one 6'10" opening (y 38.4-45.2) where the survey has this pier + the 4'1" square arch |
| Arch wall (grid E) `i28` | wall | confirmed | front-room side face at x 103.14 (0.14 ft); sales side face is the AIR GUNS display, 3 ft proud |
| Arch wall (grid E) `i29` | wall | not covered | no scan geometry on the arch line at y 76-80 (only L22, the AIR GUNS display face 3 ft west) |
| FRONT DOOR `i30` | door | corrected | moved into the recessed front wall, x 109.8 (survey 115) |
| WILL CALL DOORS `i31` | door | conflicting | scan door at x 81.2-86.9 (survey 86.5-92.5); kept survey |
| Warehouse glass roll-up `i32` | door | size confirmed, position assumed | centre within 0.5 ft (after drift fix); width conflicts: scan 9'11", survey 8' |
| Warehouse man door `i33` | door | not covered | not detected (solid door) |
| EMPLOYEES ONLY french doors `i34` | door | conflicting | scan opening 5'1" wide at x 22.2-27.3 (survey 29-35) |
| Von's door `i35` | door | corrected | scan y 4.3-7.2 (survey 3-6) |
| Milwaukee doorway `i36` | opening | conflicting | scan sees no opening at y 71-77.5 |
| Wide opening (wood header) `i37` | opening | conflicting | scan opening 11'7" wide x 12' high (survey 20' x 12'7") |
| ARCH 1 8'5" `i38` | arch | confirmed (south edge only) | south edge 20.66 vs 20.4; arch run open in the scan; individual widths not resolved |
| ARCH 2 8'1" `i39` | arch | not covered | inside the open arch run; width not resolved by the scan |
| SQUARE ARCH 4'1" `i40` | opening | conflicting | north edge confirmed (45.2 vs 45.7); scan opening starts at 38.4, not 41.6 |
| White door `i41` | door | confirmed | y 76.4-79.2 (survey 76.3-79.3) |
| Column `i42` | column | not covered | RoomPlan does not model columns |
| Column `i43` | column | not covered | RoomPlan does not model columns |
| Column `i44` | column | not covered | RoomPlan does not model columns |
| SDB column (TV) `i45` | column | not covered | RoomPlan does not model columns |
| Warehouse post `i46` | column | not covered | RoomPlan does not model columns |
| Laser deck `i71` | platform | not covered |  |
| Stairs up to loft `i72` | stairs | conflicting | scan stairs: 5'6" wide, 14'4" run, y 15.1-29.5 in a corridor east of Von's office (survey 3'10" wide, y 21.8-35.8) |
| Stairs to offices `i73` | stairs | not covered |  |
| TOM'S OFFICE PLATFORM `i91` | platform | not covered |  |
| TOM'S STEPS `i92` | stairs | not covered |  |
| Sales floor ceiling (vaulted tile) `c1` | ceiling | corrected | 15 -> 19.3 (medium; may be the peak of a vaulted ceiling) |
| South aisles drop ceiling `c2` | ceiling | corrected | 9.4 -> 10.3 |
| Front room drop ceiling `c3` | ceiling | corrected | starts at the recessed front wall; 9.4 -> 10.0 |
| Warehouse deck `c4` | ceiling | corrected | 22 -> 20.3 |
| Von's area ceiling `c5` | ceiling | not covered | Von's office not scanned |
| Old building wood ceiling `c6` | ceiling | corrected | extent: starts at the recessed front wall; height 12 kept - scan heights conflict (10-10.9 under the mezzanine, 16.6 wall at y 60) |
| Column (police-car sign) `c_s1` | column | not covered | RoomPlan does not model columns |
| Column (south row, verify) `c_s2` | column | not covered | RoomPlan does not model columns |
| Column (in pergola) `c_perg` | column | not covered | RoomPlan does not model columns |
| Steel pipe column `c_pipe` | column | not covered | RoomPlan does not model columns |
| Cedar post (laser deck) `c_laser` | column | not covered | RoomPlan does not model columns |
| Timber post (mezzanine edge) `c_dark` | column | not covered | RoomPlan does not model columns |
| Boxed column (50-yr flag) `c_boxed` | column | not covered | RoomPlan does not model columns |
| Desk walkway (raised) `sdf_w` | platform | not covered |  |
| Walkway step `sdf_step` | stairs | not covered |  |
| Desk back partition (mirror/TV) `sdf_wall` | wall | conflicting | x within 0.33 ft; but the scan wall runs y 26.8-60.4 (survey 21.4-37.6) - see questions |
| Corridor wall (GOOD STUFF board) `sdf_nwall` | wall | conflicting | scan sees no wall at y 43.8 (open floor across it) |
| Stair landing `stair_land` | platform | not covered |  |
| SUPPLY CLOSET `d_closet` | door | not covered |  |
| Franklin Boise Owners plaque wall `w_plaque` | wall | not covered |  |
| Vault wall (steel) `v_n` | wall | not covered |  |
| Vault wall (steel) `v_e` | wall | not covered |  |
| Vault wall (steel) `v_s` | wall | not covered |  |
| Vault wall (steel) `v_w` | wall | not covered |  |
| LVP floor (vault room) `v_floor` | platform | not covered |  |
| MEN'S ROOM `d_mens` | door | not covered |  |
| Restroom wall `w_mens` | wall | not covered |  |
| Building outline | - | corrected (inside the 169 x 80 box) | Front wall recessed 11 ft 4 in from x 103.35 to the east wall (covered porch); north-wall step at x 139.2. Length 169 and width 80 kept: the scan stops at x 153 and does not show the east wall. |

## 6. What the scanned objects are

The scanner (Apple RoomPlan) only knows home furniture words, so "bed", "fridge", "oven", "table" are its guesses. Positions are after lining up (centre, size in ft; height in ft).

| Scan object | Scanner called it | What it really is (our identification) | Survey item | Confidence | Centre x, y | Size w x d, h |
|---|---|---|---|---|---|---|
| storage_shelf_24 | Shelf | Raised shelf/sign 3.8-6.6 ft up by the Diablo A-frame | DIABLO BLADE A-FRAME (diablo_af) | low | 89.8, 28.2 | 3.2 x 1.2, 6.6 |
| storage_cabinet_tall2_2 | Tall cabinet | White storage cabinet by the Milwaukee doorway (scan puts it ~4 ft further south) | White storage cabinet (i100) | low | 48.4, 69.5 | 3.5 x 1.7, 6.3 |
| storage_shelf_2 | Shelf | East endcap of the hand-tool / hammer gondola | HAND TOOL / HAMMER GONDOLA 24' (i101) | low | 78.7, 64.6 | 4.2 x 1.4, 4.8 |
| storage_shelf_8 | Shelf | Framing stud display | FRAMING STUD DISPLAY (i103) | medium | 44.1, 54.7 | 3.1 x 1.9, 6.4 |
| storage_cabinet_low4_0 | Cabinet | ROLAIR compressor rack (low part) | ROLAIR COMPRESSOR RACK (i104) | high | 98.8, 71.5 | 8.3 x 2.0, 1.9 |
| storage_shelf_10 | Shelf | Buck knives case (the scan box runs north-south, 0.8 x 1.7 ft; the photo case runs east-west; centres 1.6 ft apart) | BUCK KNIVES CASE (i109) | low-medium | 125.4, 40.1 | 1.7 x 0.8, 3.5 |
| storage_cabinet_mid1_1 | Cabinet | Cabinet inside the sales desk back (SDB) | SALES DESK BACK (SDB) (i47) | medium | 73.0, 38.4 | 1.9 x 1.9, 4.0 |
| storage_cabinet_mid3_2 | Cabinet | Sales desk back (SDB) - south counter | SALES DESK BACK (SDB) (i47) | high | 78.3, 35.2 | 6.3 x 2.5, 4.0 |
| storage_cabinet_tall2_1 | Tall cabinet | Cabinet inside the sales desk back (SDB) | SALES DESK BACK (SDB) (i47) | medium | 78.5, 40.8 | 2.3 x 2.2, 4.4 |
| storage_shelf_17 | Shelf | Sales desk back (SDB) - south-east chamfered corner (matches within 0.2 ft) | SALES DESK BACK (SDB) (i47) | high | 83.4, 36.2 | 5.5 x 1.6, 3.9 |
| storage_shelf_25 | Shelf | Sales desk back (SDB) - south counter (west part) | SALES DESK BACK (SDB) (i47) | medium | 74.0, 34.3 | 8.1 x 1.8, 3.9 |
| table_other_rect_8 | Table | Sales desk back (SDB) - north counter | SALES DESK BACK (SDB) (i47) | medium | 78.2, 46.3 | 6.4 x 2.2, 4.0 |
| table_dining_rect_0 | Table | Low table/display at the west end of the Milwaukee power-tools run | MILWAUKEE POWER TOOLS 28' (i50) | low | 61.7, 69.2 | 6.1 x 3.2, 2.9 |
| table_other_rect_5 | Table | Table/bench on the west side of the Makita row (north end) | MAKITA ROW 25'6" (i53) | low | 91.2, 69.8 | 6.8 x 2.2, 3.8 |
| storage_shelf_14 | Shelf | West side of the paint isle (DAP / Penofin displays) | PAINT ISLE 17'6" (i55) | low | 56.4, 23.1 | 5.7 x 1.6, 4.7 |
| storage_shelf_15 | Shelf | South endcap of the paint isle | PAINT ISLE 17'6" (i55) | low | 56.7, 8.8 | 3.6 x 1.6, 5.1 |
| storage_shelf_27 | Shelf | North endcap of the saw-blade gondola (4A/3B) | SAW BLADE/BITS 27' (4A/3B) (i56) | low | 68.7, 33.6 | 3.0 x 1.6, 3.4 |
| storage_shelf_16 | Shelf | North endcap of the nail/screw gondola (3A) | NAIL/SCREW 23'4" (3A) (i57) | low | 78.0, 28.6 | 3.1 x 1.6, 4.4 |
| storage_shelf_13 | Shelf | South endcap of the Occidental bag gondola | OCCIDENTAL BAG ISLE 23'4" (i58) | low | 84.2, 6.2 | 4.1 x 1.8, 4.1 |
| storage_shelf_23 | Shelf | Milwaukee PACKOUT wall (middle section) | MILWAUKEE PACKOUT WALL 24' (i59) | medium | 65.8, 79.0 | 9.0 x 1.6, 7.1 |
| storage_cabinet_mid5_1 | Cabinet | TRY-IT bench/counter in front of the AIR GUNS wall | AIR GUNS 30' (TRY IT BUY IT) (i61) | medium | 98.8, 56.3 | 10.5 x 2.0, 2.8 |
| storage_shelf_21 | Shelf | Simpson screw wall | SIMPSON SCREW WALL 19'10" (i62) | medium | 50.4, 16.4 | 10.2 x 1.8, 6.2 |
| storage_shelf_26 | Shelf | Simpson screw wall (north part) | SIMPSON SCREW WALL 19'10" (i62) | low | 50.4, 25.0 | 5.0 x 1.7, 5.2 |
| storage_shelf_12 | Shelf | Decking display lower cabinets (white shelves of decking samples, photos decking_lower_A/B) | DECKING WALL 23' (i63) | medium | 95.1, 2.1 | 13.7 x 1.4, 3.6 |
| storage_cabinet_mid1_0 | Cabinet | Low cabinet at the FBS mug wall | FBS MUG WALL 5' (i65) | low | 102.6, 15.9 | 2.0 x 1.6, 3.9 |
| storage_shelf_5 | Shelf | FBS mug wall (7 ft tall wall display) | FBS MUG WALL 5' (i65) | medium | 101.8, 13.1 | 3.7 x 2.1, 7.0 |
| storage_cabinet_tall2_0 | Tall cabinet | Tall cabinet/rack end in the warehouse NW corner (north end of the west-wall pallet rack?) | PALLET RACK - WEST WALL (i67) | low | 2.0, 77.8 | 3.9 x 2.2, 6.7 |
| storage_cabinet_tall2_3 | Tall cabinet | Tall cabinet/rack end in the warehouse NW corner (north end of the west-wall pallet rack?) | PALLET RACK - WEST WALL (i67) | low | 1.8, 75.3 | 3.8 x 2.1, 6.7 |
| stairs13_0 | Stairs | Stairs up to the loft (13 treads of about 8.3 in, 9.2 ft rise, 14.4 ft run, 5.5 ft wide; top at the south end) - in the corridor east of Von's office | Stairs up to loft (i72) | medium | 47.3, 22.3 | 14.3 x 5.5, 9.2 |
| storage_shelf_20 | Shelf | Display inside the Simpson pergola (west part) | Simpson pergola display (i78) | low | 90.1, 7.7 | 4.1 x 1.5, 4.1 |
| storage_shelf_4 | Shelf | Tall display inside the Simpson pergola | Simpson pergola display (i78) | low | 95.8, 3.5 | 3.6 x 2.0, 7.5 |
| table_other_rect_11 | Table | Display table inside the Simpson pergola | Simpson pergola display (i78) | low | 96.3, 12.6 | 8.4 x 2.2, 3.5 |
| table_other_rect_4 | Table | Maple workbench (scan ~7 ft further south than survey) | Maple workbench (i79) | medium | 90.9, 10.0 | 7.6 x 2.2, 3.4 |
| oven_0 | Oven | Appliance/shelf mounted 4.7-7.6 ft up above the east end of the coffee counter (coffee/ice equipment) | REFRESHMENT COUNTER (coffee/ice/soda) (i84) | low | 129.7, 12.8 | 2.7 x 2.4, 7.6 |
| sink_0 | Sink | Sink in the refreshment counter | REFRESHMENT COUNTER (coffee/ice/soda) (i84) | high | 116.5, 12.7 | 1.9 x 1.5, 3.0 |
| storage_cabinet_mid5_0 | Cabinet | Refreshment (coffee/ice/soda) counter, 15 ft run of base cabinets with a sink | REFRESHMENT COUNTER (coffee/ice/soda) (i84) | high | 121.1, 12.8 | 15.0 x 2.6, 3.0 |
| refrigerator_0 | Fridge | Soda cooler (glass-door) in the corner of the arch wall and the recessed front wall | Soda coolers (i85) | medium | 105.0, 13.4 | 3.2 x 2.5, 6.5 |
| storage_cabinet_mid3_0 | Cabinet | East end of the cedar desk / its return | Cedar desk by square arch (i87) | low | 114.1, 54.2 | 4.9 x 3.3, 3.2 |
| table_other_rect_1 | Table | Cedar desk by the square arch | Cedar desk by square arch (i87) | high | 106.4, 54.2 | 6.2 x 3.4, 3.3 |
| storage_shelf_3 | Shelf | Millwork sample counter (west part) - scan has it against the wall | MILLWORK SAMPLE COUNTER (i89) | medium | 54.2, 1.0 | 10.1 x 1.9, 3.5 |
| storage_shelf_9 | Shelf | Millwork sample counter (east part) - scan has it against the wall | MILLWORK SAMPLE COUNTER (i89) | medium | 67.0, 1.1 | 9.2 x 2.1, 3.4 |
| storage_shelf_22 | Shelf | Scaffolding cage (scan orientation N-S) | Scaffolding cage (i99) | low | 30.2, 73.9 | 7.6 x 2.0, 6.4 |
| table_other_rect_9 | Table | Pellet grill 2 | PELLET GRILL 2 (i99b) | medium | 68.1, 73.5 | 3.1 x 2.1, 2.9 |
| refrigerator_1 | Fridge | Tall unit along the warehouse south wall - part of the ladder-rack area | LADDER WALL RACK 10' (ladder_wall) | low | 39.2, 25.9 | 2.8 x 2.3, 6.4 |
| storage_shelf_6 | Shelf | Tall unit along the warehouse south wall - ladder-rack area | LADDER WALL RACK 10' (ladder_wall) | low | 41.5, 24.9 | 1.9 x 1.2, 6.6 |
| storage_shelf_7 | Shelf | Tall unit along the warehouse south wall - ladder-rack area | LADDER WALL RACK 10' (ladder_wall) | low | 35.3, 25.9 | 4.3 x 2.2, 6.7 |
| storage_shelf_18 | Shelf | Caulk gun / DAP rack | Caulk gun / DAP rack (r_caulk1) | medium | 56.1, 12.0 | 4.6 x 1.4, 3.4 |
| bed_0 | Bed | Large ~7 x 9 ft object, 7 ft tall, on the warehouse floor (pallet stack / crate / lumber display) - not a bed | unmatched (overlay only) | low | 39.1, 31.7 | 9.2 x 7.1, 7.2 |
| chair_other_four_back_no_0 | Chair | Chair at the small table beside the front desk | unmatched (overlay only) | low | 114.4, 36.1 | 1.6 x 1.4, 3.6 |
| chair_swivel_star_back_arms_0 | Chair | Office chair at the cedar desk | unmatched (overlay only) | medium | 106.4, 55.6 | 2.2 x 2.0, 4.0 |
| sink_1 | Sink | Sink in the small room north of the old-building wall | unmatched (overlay only) | medium | 121.7, 78.6 | 1.9 x 1.4, 2.8 |
| stairs7_0 | Stairs | 7-step stair (rises ~5.4 ft) inside a small walled area in the front room's north part - not in survey | unmatched (overlay only) | medium | 112.2, 62.7 | 7.9 x 5.4, 5.4 |
| storage_cabinet_mid2_0 | Cabinet | Sink cabinet in the small room north of the old-building wall (break room / restroom?) | unmatched (overlay only) | medium | 121.8, 77.9 | 4.0 x 1.9, 2.8 |
| storage_cabinet_mid2_1 | Cabinet | Counter/display just north of the front desk's north pod - maybe part of the front desk (sdf_n) | unmatched (overlay only) | low | 119.9, 42.2 | 5.0 x 3.0, 3.9 |
| storage_cabinet_mid3_1 | Cabinet | Cabinet behind the cedar desk against the arch wall - not in survey | unmatched (overlay only) | low | 104.4, 57.6 | 4.7 x 2.2, 3.1 |
| storage_cabinet_mid5_2 | Cabinet | Second base-cabinet run (8'4") along the front wall east of the coffee counter - not in survey | unmatched (overlay only) | medium | 135.7, 12.6 | 8.4 x 2.3, 3.0 |
| storage_shelf_0 | Shelf | Small display east of the square arch - not in survey | unmatched (overlay only) | low | 108.6, 40.8 | 2.2 x 2.2, 3.6 |
| storage_shelf_1 | Shelf | Section of a south-aisle gondola (between paint i55 and saw-blade i56 lines; aisles are skewed) | unmatched (overlay only) | low | 62.9, 17.7 | 6.7 x 1.6, 3.2 |
| storage_shelf_11 | Shelf | Section of a south-aisle gondola (between saw-blade i56 and nail i57 lines; aisles are skewed) | unmatched (overlay only) | low | 71.3, 24.7 | 9.1 x 1.8, 5.1 |
| storage_shelf_19 | Shelf | Small display near the south ends of the paint/saw-blade aisles - not in survey | unmatched (overlay only) | low | 61.6, 7.3 | 2.9 x 1.2, 4.9 |
| table_dining_rect_1 | Table | Pallet/table on the warehouse floor - not in survey | unmatched (overlay only) | low | 14.4, 49.3 | 3.4 x 3.0, 2.4 |
| table_dining_rect_2 | Table | Large pallet/table on the warehouse floor - not in survey | unmatched (overlay only) | low | 8.8, 44.1 | 9.3 x 4.6, 3.0 |
| table_other_rect_0 | Table | Cart/table in the warehouse NW area - not in survey | unmatched (overlay only) | low | 6.2, 72.0 | 3.7 x 1.7, 2.9 |
| table_other_rect_10 | Table | Small table beside the front desk (with chair) - not in survey | unmatched (overlay only) | low | 114.4, 37.1 | 2.4 x 2.4, 3.3 |
| table_other_rect_2 | Table | Pallet/cart near the west end of warehouse rack row A | unmatched (overlay only) | low | 8.2, 56.6 | 7.3 x 3.5, 2.9 |
| table_other_rect_3 | Table | Pallet/table on the warehouse floor - not in survey | unmatched (overlay only) | low | 32.0, 33.2 | 4.5 x 4.2, 3.1 |
| table_other_rect_6 | Table | Pallet/table on the warehouse floor - not in survey | unmatched (overlay only) | low | 15.0, 29.8 | 7.3 x 4.2, 2.8 |
| table_other_rect_7 | Table | Large crate/pallet stack in the warehouse (same spot as bed_0) - not in survey | unmatched (overlay only) | low | 38.3, 31.7 | 6.8 x 4.7, 2.8 |

Survey fixtures the scan shows somewhere clearly different (only the ones forced by the front-wall move, plus the decking wall, were changed in the master; the rest are listed for you to check):

- **Soda coolers, coffee counter, checkout spinner** - moved with the front wall (they were standing on what is really the porch).
- **Decking wall** - scan face is exactly 23 ft 0 in long and runs to the arch-wall corner; moved 2 ft 8 in east.
- **Maple workbench (i79)** - scan table at y 6-14, survey 14-20 (about 7 ft further south). Not changed.
- **Millwork sample counter (i89)** - scan has it right against the south wall (y 0-2); survey puts it 2-4.5 ft out in front of the slatwall. Not changed.
- **FBS mug wall (i65)** - scan y 11-17, survey 14-19. Not changed.
- **Ladder wall rack (ladder_wall)** - scan objects 1.5-3 ft further out from the warehouse south wall. Not changed.
- **Cedar desk (i87)** - scan desk + cabinet run about 13 ft (x 103-117) vs survey 10 ft + return. Not changed.
- **Sales desk back (SDB)** - confirmed: its south-east corner matches within 0.2 ft. Old question "is the SDB further north?" - the scan says no (if anything its south counter is 1-2 ft further south).
- **Aisles** (paint, saw blade, nail/screw, Occidental, Milwaukee, safety, DeWalt, hammer, Makita) - the scanner only picked up short pieces and endcaps, which sit up to 4-5 ft off the surveyed gondola lines. That is the expected skew; not changed.
- **Warehouse racks** - not in the scan at all (scanner limitation). The scan instead shows 7 low "tables" (pallets/carts) and one 7 x 9 ft, 7 ft tall block ("bed") on the warehouse floor that the survey does not have.

## 7. Questions to check in the store (tape or laser measure)

1. Front porch depth: outside, measure from the face of the glass front wall (at the front door) straight out (south) to the line of the building's south wall / porch piers. Scan: about 11 ft (11 ft 5 in between the inside faces). Also check that the porch runs all the way to the east end of the building - the scan stopped at about x 141.
2. Front door position: inside, measure from the arch wall (the corner where the soda cooler stands) east to the edge of the front door. Scan: about 3 ft 6 in, door 5 ft 7 in - 6 ft wide. Survey had 8 ft 8 in. How many soda coolers are there and do they face east (along the arch wall) or north?
3. North-east step: outside on the yard side, measure along the north wall from the arch-wall line east to the corner where the wall steps south. Scan: about 36 ft (step at x 139); survey: about 24 ft (x 127). The step is 9 ft 7 in deep in the scan. What is the 18 ft x 9 ft 7 in room in that corner with the sink and the doors on its north, west and east sides? The scanned wall line at y 70.5 west of the step also has a **12 ft 0 in x 9 ft 10 in opening (L49, x 125.6-137.6)** between the old building and that corner room, and continues west to x 116 (L39, L35) with two high windows (sill 7.3 ft); the map keeps the photo survey (old-building north wall solid, starting at x 127).
4. Will-call doors: measure from the arch wall (west face, behind the AIR GUNS wall) west to the east edge of the will-call doors. Scan: 15 ft 9 in (doors at x 81-87); survey: 10 ft 2 in (doors at x 86.5-92.5). The master still uses the survey.
5. Sales-floor ceiling: laser-measure the height at the north wall and in the middle of the sales floor. Scan: the walls are 19 ft 3 in tall (19.26 ft); survey ceiling 15 ft (vaulted?). The master now uses 19.3 ft - change it back if the tile ceiling is really at 15 ft.
6. Other ceilings to spot-check: south-aisle drop ceiling (scan 10 ft 4 in, survey 9 ft 5 in), front room (scan 10 ft 0 in, survey 9 ft 5 in), warehouse to the bottom of the roof structure (scan 20 ft 4 in, survey 22 ft), old building (survey 12 ft; scan 10-10 ft 11 in near the mezzanine and a 16 ft 7 in wall at y 60).
7. Mezzanine edge: the scan shows a 16 ft 7 in tall wall about 60 ft north of the south wall (x 126-144) with about 10 ft ceilings north of it; the survey has the mezzanine edge at about 47 ft (posts). Where is the edge?
8. Warehouse size and line: inside width west wall to grid-C wall (scan 49 ft 1 in, survey 49 ft 8 in), inside depth loft wall to north wall (scan 58 ft 0 in, survey 58 ft 2 in). Is the warehouse north wall in line with the sales-floor north wall? (The scan put it 3 ft further north - we think that is scanner drift.)
9. Warehouse roll-up door: scan 9 ft 11 in wide x 9 ft 7 in tall; survey 8 ft x 10 ft.
10. Openings in the grid-C (warehouse) wall: the wide opening with the wood header - scan 11 ft 7 in wide x 12 ft high, survey 20 ft x 12 ft 7 in. The Milwaukee doorway (survey 6 ft 6 in wide at 71-77.5 ft from the south wall) was not seen by the scan. Measure both from the north wall.
11. Employees-only french doors in the warehouse south (loft) wall: scan sees a 5 ft 1 in opening about 22-27 ft from the west wall; survey 29-35 ft. The scan also sees a high opening (12-20 ft up) above it into the loft.
12. Stairs to the loft: the scan puts them in a 5 ft wide corridor between a 10 ft wall (east side of Von's office) and the grid-C wall, running about 15-29.5 ft from the south wall, 5 ft 6 in wide, 14 ft 4 in long, 13 steps. Survey: 3 ft 10 in wide, 21.8-35.8 ft, inside the warehouse. Which is right, and is that corridor wall real?
13. Square arch: survey has a 2 ft 4 in pier then the 4 ft 1 in square arch (39.3-45.7 ft from the south wall); the scan sees one 6 ft 10 in x 9 ft opening (38.4-45.2 ft). Re-tape the pier and the square arch.
14. Front room walls: (a) the wall behind the front desk (mirror/TV) - the scan shows it continuing north to about 60 ft from the south wall (33 ft 7 in long, with a 4 ft 8 in opening at 35-39 ft). (b) The GOOD STUFF corridor wall at 43.8 ft - the scan saw no wall there. (c) A small walled area with a 7-step stair and a door at about x 103-116, 60-70 ft from the south wall. Confirm all three.
15. Not in the survey, seen by the scan - add them? A possible post/column about 1 ft 11 in wide at about x 98, 29 ft from the south wall (north end of the Occidental aisle); a door (x 141-143.5) and a window (x 149-152.5) in the old-building north wall; a door in the north wall at x 125-129.
16. Not scanned at all: the east end (x 153-169: east wall, vault, restrooms, offices, stairs to offices) and Von's office. These still use the survey numbers - a quick tape check of the east wall length (70 ft in the survey, now about 59 ft from the porch wall to the old north wall) would close the outline.

## 8. Files

- `master-layout.json` - the survey with these corrections (146 items; changed items carry `src`).
- `scan-overlay.json` - scan walls (with the scanner's dimension labels), doors/windows/openings, 68 objects with identifications, ceilings with heights, all in store feet, ready to draw as a map layer. The warehouse part is already drift-corrected (`block: "warehouse"`).
- `overlay-check.png` - whole store: survey walls black, replaced survey walls grey, corrected walls green, scan walls blue, scan objects orange. Close-ups: `overlay-check-front.png`, `overlay-check-sales.png`, `overlay-check-warehouse.png`. `overlay-rigid-no-drift-fix.png` shows the raw scan without the warehouse drift fix.
