# Scan clean-up audit - what the 3D scan got wrong, and what was kept

*For AJ - FBS Boise store map. 9 Oct 2026. Source: the Polycam / Apple RoomPlan scan (`scan.glb`, `scan.dxf`) checked against your photo survey (145 items, 5 Oct) and the building drawing notes in the handoff docs.*

Positions are in feet: **x = feet east of the inside of the west (warehouse) wall, y = feet north of the inside of the south wall.** The building is 169 ft west to east and 80 ft south to north.

## 1. The short version

- **Your photos are the boss.** Where the scan and the photos disagree, the map now follows the photos. The scan is only used where it *measured* something the photos agree with or cannot show (exact wall lines, room heights).
- **All 68 scanner "furniture" guesses are gone** - every table, chair, "bed", "fridge", "oven", "sink", shelf, cabinet and "stairs" box. The scanner (Apple RoomPlan) only knows home-furniture words, so it called pallets "tables", a crate "a bed", a soda cooler "a fridge" and the coffee counter "a sink". The real fixtures come only from your photo survey. Section 2 says what each one really was.
- **All 9 scanner floors and 19 ceilings are gone** (their room names "Kitchen", "Office" were guesses; the map already has the room heights).
- **27 of the 43 scanned walls were phantoms and are gone** - display faces read as walls (AIR GUNS wall, decking display, Simpson pergola), a corridor wall and a walled stair area that are not in your photos, the "wall" at y 60 in the old building, rack faces in the warehouse, and small scraps.
- **16 walls were kept** because each one sits on a wall in your photos (within half a foot). 8 of them needed fixing: trimmed to the real length, or a scanner door/window that is not in your photos filled in, or the real door cut in where your photos have it.
- **Doors and windows:** only Von's door was kept from the scan (it matches). The front door, will-call doors, roll-up door and white door were seen by the scanner but in the wrong place (2-5 ft off, or on a display face) - the map uses the photo positions. 5 doors, 4 windows and 2 openings the photos do not show were removed; 3 more scanner openings (grid-C wide opening, warehouse doorway, square arch) disagree with the photos in size or place, so the photo versions are used.
- **Map changes undone:** 4 scan-only changes went back to your photo numbers (front door x, soda coolers, coffee counter, decking wall), and 2 wall pieces follow the door back. Kept from the scan: the recessed front wall / covered porch (the building drawing says the same thing), the north-east step, Von's door, and the ceiling heights - all marked *to confirm*.

## 2. What was removed and why

### 2a. Scanner furniture, appliances and fixtures (68) - all removed

These were never real objects in the map; the scanner was guessing with home-furniture words. Nothing here is drawn any more. The right-hand column is what each one most likely was, so you can see the scanner was looking at real store fixtures (already in the map from your photos) or at loose pallets and carts.

| # | Scanner said | Where (x, y) | What it really is | Removed |
|---|---|---|---|---|
| 1 | Tall cabinet (`storage_cabinet_tall2_3`, fixture) | 2, 75 | Tall cabinet/rack end in the warehouse NW corner (north end of the west-wall pallet rack?) (in the map from your photos as `i67`) | yes |
| 2 | Tall cabinet (`storage_cabinet_tall2_0`, fixture) | 2, 78 | Tall cabinet/rack end in the warehouse NW corner (north end of the west-wall pallet rack?) (in the map from your photos as `i67`) | yes |
| 3 | Shelf (`storage_shelf_22`, furniture) | 30, 74 | Scaffolding cage (scan orientation N-S) (in the map from your photos as `i99`) | yes |
| 4 | Shelf (`storage_shelf_7`, furniture) | 35, 26 | Tall unit along the warehouse south wall - ladder-rack area (in the map from your photos as `ladder_wall`) | yes |
| 5 | Fridge (`refrigerator_1`, appliance) | 39, 26 | Tall unit along the warehouse south wall - part of the ladder-rack area (in the map from your photos as `ladder_wall`) | yes |
| 6 | Shelf (`storage_shelf_6`, furniture) | 41, 25 | Tall unit along the warehouse south wall - ladder-rack area (in the map from your photos as `ladder_wall`) | yes |
| 7 | Shelf (`storage_shelf_8`, furniture) | 44, 55 | Framing stud display (in the map from your photos as `i103`) | yes |
| 8 | Stairs (`stairs13_0`, fixture) | 47, 22 | Stairs up to the loft: 13 steps (not 16), 5 ft 6 in wide, rising to the south, in a corridor east of Von's office. The photos put the loft stairs inside the warehouse (i72) - kept as photographed (in the map from your photos as `i72`) | yes |
| 9 | Tall cabinet (`storage_cabinet_tall2_2`, fixture) | 48, 69 | White storage cabinet by the Milwaukee doorway (scan puts it ~4 ft further south) (in the map from your photos as `i100`) | yes |
| 10 | Shelf (`storage_shelf_21`, furniture) | 50, 16 | Simpson screw wall (in the map from your photos as `i62`) | yes |
| 11 | Shelf (`storage_shelf_26`, furniture) | 50, 25 | Simpson screw wall (north part) (in the map from your photos as `i62`) | yes |
| 12 | Shelf (`storage_shelf_3`, furniture) | 54, 1 | Millwork sample counter (west part) - scan has it against the wall (in the map from your photos as `i89`) | yes |
| 13 | Shelf (`storage_shelf_18`, furniture) | 56, 12 | Caulk gun / DAP rack (in the map from your photos as `r_caulk1`) | yes |
| 14 | Shelf (`storage_shelf_14`, furniture) | 56, 23 | West side of the paint isle (DAP / Penofin displays) (in the map from your photos as `i55`) | yes |
| 15 | Shelf (`storage_shelf_15`, furniture) | 57, 9 | South endcap of the paint isle (in the map from your photos as `i55`) | yes |
| 16 | Table (`table_dining_rect_0`, furniture) | 62, 69 | Low table/display at the west end of the Milwaukee power-tools run (in the map from your photos as `i50`) | yes |
| 17 | Shelf (`storage_shelf_23`, furniture) | 66, 79 | Milwaukee PACKOUT wall (middle section) (in the map from your photos as `i59`) | yes |
| 18 | Shelf (`storage_shelf_9`, furniture) | 67, 1 | Millwork sample counter (east part) - scan has it against the wall (in the map from your photos as `i89`) | yes |
| 19 | Table (`table_other_rect_9`, furniture) | 68, 74 | Pellet grill 2 (in the map from your photos as `i99b`) | yes |
| 20 | Shelf (`storage_shelf_27`, furniture) | 69, 34 | North endcap of the saw-blade gondola (4A/3B) (in the map from your photos as `i56`) | yes |
| 21 | Cabinet (`storage_cabinet_mid1_1`, fixture) | 73, 38 | Cabinet inside the sales desk back (SDB) (in the map from your photos as `i47`) | yes |
| 22 | Shelf (`storage_shelf_25`, furniture) | 74, 34 | Sales desk back (SDB) - south counter (west part) (in the map from your photos as `i47`) | yes |
| 23 | Shelf (`storage_shelf_16`, furniture) | 78, 29 | North endcap of the nail/screw gondola (3A) (in the map from your photos as `i57`) | yes |
| 24 | Table (`table_other_rect_8`, furniture) | 78, 46 | Sales desk back (SDB) - north counter (in the map from your photos as `i47`) | yes |
| 25 | Cabinet (`storage_cabinet_mid3_2`, fixture) | 78, 35 | Sales desk back (SDB) - south counter (in the map from your photos as `i47`) | yes |
| 26 | Tall cabinet (`storage_cabinet_tall2_1`, fixture) | 78, 41 | Cabinet inside the sales desk back (SDB) (in the map from your photos as `i47`) | yes |
| 27 | Shelf (`storage_shelf_2`, furniture) | 79, 65 | East endcap of the hand-tool / hammer gondola (in the map from your photos as `i101`) | yes |
| 28 | Shelf (`storage_shelf_17`, furniture) | 83, 36 | Sales desk back (SDB) - south-east chamfered corner (matches within 0.2 ft) (in the map from your photos as `i47`) | yes |
| 29 | Shelf (`storage_shelf_13`, furniture) | 84, 6 | South endcap of the Occidental bag gondola (in the map from your photos as `i58`) | yes |
| 30 | Shelf (`storage_shelf_24`, furniture) | 90, 28 | Raised shelf/sign 3.8-6.6 ft up by the Diablo A-frame (in the map from your photos as `diablo_af`) | yes |
| 31 | Shelf (`storage_shelf_20`, furniture) | 90, 8 | Display inside the Simpson pergola (west part) (in the map from your photos as `i78`) | yes |
| 32 | Table (`table_other_rect_4`, furniture) | 91, 10 | Maple workbench (scan ~7 ft further south than survey) (in the map from your photos as `i79`) | yes |
| 33 | Table (`table_other_rect_5`, furniture) | 91, 70 | Table/bench on the west side of the Makita row (north end) (in the map from your photos as `i53`) | yes |
| 34 | Shelf (`storage_shelf_12`, furniture) | 95, 2 | Decking display lower cabinets (white shelves of decking samples, photos decking_lower_A/B) (in the map from your photos as `i63`) | yes |
| 35 | Shelf (`storage_shelf_4`, furniture) | 96, 3 | Tall display inside the Simpson pergola (in the map from your photos as `i78`) | yes |
| 36 | Table (`table_other_rect_11`, furniture) | 96, 13 | Display table inside the Simpson pergola (in the map from your photos as `i78`) | yes |
| 37 | Cabinet (`storage_cabinet_mid5_1`, fixture) | 99, 56 | TRY-IT bench/counter in front of the AIR GUNS wall (in the map from your photos as `i61`) | yes |
| 38 | Cabinet (`storage_cabinet_low4_0`, fixture) | 99, 72 | ROLAIR compressor rack (low part) (in the map from your photos as `i104`) | yes |
| 39 | Shelf (`storage_shelf_5`, furniture) | 102, 13 | FBS mug wall (7 ft tall wall display) (in the map from your photos as `i65`) | yes |
| 40 | Cabinet (`storage_cabinet_mid1_0`, fixture) | 103, 16 | Low cabinet at the FBS mug wall (in the map from your photos as `i65`) | yes |
| 41 | Fridge (`refrigerator_0`, appliance) | 105, 13 | Soda cooler (glass-door) in the corner of the arch wall and the recessed front wall (in the map from your photos as `i85`) | yes |
| 42 | Table (`table_other_rect_1`, furniture) | 106, 54 | Cedar desk by the square arch (in the map from your photos as `i87`) | yes |
| 43 | Cabinet (`storage_cabinet_mid3_0`, fixture) | 114, 54 | East end of the cedar desk / its return (in the map from your photos as `i87`) | yes |
| 44 | Sink (`sink_0`, fixture) | 116, 13 | Sink in the refreshment counter (in the map from your photos as `i84`) | yes |
| 45 | Cabinet (`storage_cabinet_mid5_0`, fixture) | 121, 13 | Refreshment (coffee/ice/soda) counter, 15 ft run of base cabinets with a sink (in the map from your photos as `i84`) | yes |
| 46 | Shelf (`storage_shelf_10`, furniture) | 125, 40 | Buck knives case (low-medium: the scan box runs the other way and sits 1.6 ft from the photo case) (in the map from your photos as `i109`) | yes |
| 47 | Oven (`oven_0`, appliance) | 130, 13 | Appliance/shelf mounted 4.7-7.6 ft up above the east end of the coffee counter (coffee/ice equipment) (in the map from your photos as `i84`) | yes |
| 48 | Table (`table_other_rect_0`, furniture) | 6, 72 | Cart/table in the warehouse NW area - not in survey (not a fixture in your photos) | yes |
| 49 | Table (`table_other_rect_2`, furniture) | 8, 57 | Pallet/cart near the west end of warehouse rack row A (not a fixture in your photos) | yes |
| 50 | Table (`table_dining_rect_2`, furniture) | 9, 44 | Large pallet/table on the warehouse floor - not in survey (not a fixture in your photos) | yes |
| 51 | Table (`table_dining_rect_1`, furniture) | 14, 49 | Pallet/table on the warehouse floor - not in survey (not a fixture in your photos) | yes |
| 52 | Table (`table_other_rect_6`, furniture) | 15, 30 | Pallet/table on the warehouse floor - not in survey (not a fixture in your photos) | yes |
| 53 | Table (`table_other_rect_3`, furniture) | 32, 33 | Pallet/table on the warehouse floor - not in survey (not a fixture in your photos) | yes |
| 54 | Table (`table_other_rect_7`, furniture) | 38, 32 | Large crate/pallet stack in the warehouse (same spot as bed_0) - not in survey (not a fixture in your photos) | yes |
| 55 | Bed (`bed_0`, furniture) | 39, 32 | Large ~7 x 9 ft object, 7 ft tall, on the warehouse floor (pallet stack / crate / lumber display) - not a bed (not a fixture in your photos) | yes |
| 56 | Shelf (`storage_shelf_19`, furniture) | 62, 7 | Small display near the south ends of the paint/saw-blade aisles - not in survey (not a fixture in your photos) | yes |
| 57 | Shelf (`storage_shelf_1`, furniture) | 63, 18 | Section of a south-aisle gondola (between paint i55 and saw-blade i56 lines; aisles are skewed) (not a fixture in your photos) | yes |
| 58 | Shelf (`storage_shelf_11`, furniture) | 71, 25 | Section of a south-aisle gondola (between saw-blade i56 and nail i57 lines; aisles are skewed) (not a fixture in your photos) | yes |
| 59 | Cabinet (`storage_cabinet_mid3_1`, fixture) | 104, 58 | Cabinet behind the cedar desk against the arch wall - not in survey (not a fixture in your photos) | yes |
| 60 | Chair (`chair_swivel_star_back_arms_0`, furniture) | 106, 56 | Office chair at the cedar desk (not a fixture in your photos) | yes |
| 61 | Shelf (`storage_shelf_0`, furniture) | 109, 41 | Small display east of the square arch - not in survey (not a fixture in your photos) | yes |
| 62 | Stairs (`stairs7_0`, fixture) | 112, 63 | 7-step stair (rises ~5.4 ft) inside a small walled area in the front room's north part - not in survey (not a fixture in your photos) | yes |
| 63 | Table (`table_other_rect_10`, furniture) | 114, 37 | Small table beside the front desk (with chair) - not in survey (not a fixture in your photos) | yes |
| 64 | Chair (`chair_other_four_back_no_0`, furniture) | 114, 36 | Chair at the small table beside the front desk (not a fixture in your photos) | yes |
| 65 | Cabinet (`storage_cabinet_mid2_1`, fixture) | 120, 42 | Counter/display just north of the front desk's north pod - maybe part of the front desk (sdf_n) (not a fixture in your photos) | yes |
| 66 | Sink (`sink_1`, fixture) | 122, 79 | Sink in the small room north of the old-building wall (not a fixture in your photos) | yes |
| 67 | Cabinet (`storage_cabinet_mid2_0`, fixture) | 122, 78 | Sink cabinet in the small room north of the old-building wall (break room / restroom?) (not a fixture in your photos) | yes |
| 68 | Cabinet (`storage_cabinet_mid5_2`, fixture) | 136, 13 | Second base-cabinet run (8'4") along the front wall east of the coffee counter - not in survey (not a fixture in your photos) | yes |

### 2b. Scanner floors and ceilings (28) - all removed

| Scanner said | What it really is | Removed |
|---|---|---|
| "Kitchen" floor + ceiling 19 ft 3 in (`Floor_Kitchen_1`, `Ceiling_Kitchen_1_*`) | The north half of the sales floor | yes - room height kept in the map as the sales-floor ceiling (to confirm) |
| "Kitchen" floor + ceiling 10 ft (`Floor_Kitchen_2`, `Ceiling_Kitchen_2_*`) | The front room just inside the glass front wall | yes - 10 ft kept as the front-room ceiling |
| "Office" floor + ceiling 19 ft 6 in (`Floor_Office`, `Ceiling_Office`) | South half of the sales floor plus part of the front room (RoomPlan took the tallest wall; the drop ceiling over the south aisles is 10 ft 4 in) | yes |
| "Other" floors/ceilings (`Floor_Other_1..6`, `Ceiling_Other_*`) | Warehouse (20 ft 4 in), a strip behind the decking display, the Simpson pergola treated as a room, the north-east corner area, the front room north part | yes - the warehouse polygon was also half-shifted (a known defect) |

### 2c. Walls - removed (27 walls + 9 corner posts)

| Scan piece | Scanner said | What it really is | Removed |
|---|---|---|---|
| L0 (`Wall_0`) | 1'11" full-height stub at x 98.1, y 28-30 (scanner called it a wall) | A post or sign stand near the north end of the Occidental aisle - not a wall. Not in the photos (possible column - tape check). | yes |
| L1 (`Wall_1`) | 8'6" wall, 10 ft tall, at y 26.8 (x 125.9-134.4) | South edge of the 5-ft cubicle block (survey Cubicles i86). Cubicle panels, not a wall. | yes |
| L2 (`Wall_2`) | 17'10" wall, 16'7" tall, at y 60.4 in the old building (x 125.9-143.8) | No wall in the photos. The scanner closed a room outline here (mezzanine edge is at about y 47 on posts in the survey). | yes |
| L3 (`Wall_3`) | 2'11" stub at x 125.3, y 70.5-73.4 | Stub inside the north-east corner area. Not in the photos. | yes |
| L4 (`Wall_4`) | 10 ft corridor wall east of Von's office (x 44.7, y 15.3-25.3) | Not in the photos. It also belongs to the drifted warehouse part of the scan (it touches the warehouse south wall in the raw scan), so its position is unreliable. | yes |
| L5 (`Wall_5`) | 10'6" wall at x 97 (y 1.3-11.8) | West side of the Simpson pergola display (i78). The scanner treated the pergola as a small room. | yes |
| L6 (`Wall_6`) | 6'5" wall at y 1.3 (x 97-103.4) | Front face of the DECKING WALL display (i63). A display face, not a building wall; the real south wall is behind it. | yes |
| L9 (`Wall_9`) | 4'10" wall at x 116 with a door (front room, y 65.6-70.5) | Part of a small walled stair area the photos do not show. | yes |
| L10 (`Wall_10`) | 47'11" wall 2 ft inside the warehouse north wall | Duplicate line: pallet-rack / scaffold-cage faces and the roll-up door recess. The real north wall is L40. | yes |
| L11 (`Wall_11`) | 7'3" header with one 6'10" opening at the square arch | Photos show a 2'4" pier then the 4'1" square arch (i27 + i40). The scan disagrees, so the photo pier and arch (master) are used. | yes |
| L12 (`Wall_12`) | 8'9" wall at y 65.6 (x 107-116) | Part of the small walled stair area the photos do not show. | yes |
| L16 (`Wall_16`) | 2'11" return at y 45.6 (x 97-100) | Return of the AIR GUNS display outline. Not a wall. | yes |
| L17 (`Wall_17`) | 13'5" wall at y 60 (x 103-116.5) | South side of the small walled stair area the photos do not show. | yes |
| L20 (`Wall_20`) | 9'7" wall at x 120.7 with a door (y 70.5-80) | West wall of a small room the photos do not have (the photo survey shows the front room open to the north wall here). Tape check. | yes |
| L21 (`Wall_21`) | 9'7" north-wall step at x 138.9 with a 7'8" doorway | The step itself is real and the master wall i15 sits on it, but 7'8" of this 9'7" piece is a doorway the photos do not show. The master wall i15 is used instead. | yes |
| L22 (`Wall_22`) | 34'5" wall, 19 ft tall, at x 100 (y 45.6-80) | Face of the AIR GUNS / TRY IT BUY IT display (i61) and the bucket ledge, 3 ft in front of the real arch wall (x 103). | yes |
| L23 (`Wall_23`) | 5 in jog at the arch wall (x 103.2, y 20.6-21) | Tiny jog of the pergola outline. | yes |
| L26 (`Wall_26`) | 1'5" return at x 97 (y -0.1-1.3) | Return between the south wall and the decking display face. Not a wall. | yes |
| L27 (`Wall_27`) | 16'7" wall at y 1.3 (x 80.4-97) | Front face of the DECKING WALL display (i63), 1.4 ft in front of the real south wall (L15 runs behind it). | yes |
| L29 (`Wall_29`) | 2'10" return at y 45.6 (x 100-102.8) | South end of the AIR GUNS display outline. Not a wall. | yes |
| L31 (`Wall_31`) | 11'7" wall, 16'7" tall, at y 21 (x 91.6-103.2) | North edge of the Simpson pergola display (i78). Not a wall. | yes |
| L32 (`Wall_32`) | 4 in return at y 45.6 | Tiny return of the AIR GUNS outline. | yes |
| L33 (`Wall_33`) | 4 in jog at x 103.4 (y 20.6-21) | Tiny jog of the pergola outline, past the end of the arch wall. | yes |
| L34 (`Wall_34`) | 10'4" wall at x 54 in the north-west corner of the sales floor | Face of the workwear/apparel corner and Packout fixtures (i97, i59). Not in the photos as a wall. | yes |
| L35 (`Wall_35`) | 4'7" wall at y 70.5 (x 120.7-125.3) | Not in the photos: the photo survey has the front room open to the north wall here. Tape check. | yes |
| L36 (`Wall_36`) | 13'7" wall at y 70.5 (x 125.3-138.9), mostly a 12' wide opening | Lines up with the old-building north wall (i16), but 12 ft of its 13'7" is an opening the photos do not show. The master wall i16 is used instead. | yes |
| L39 (`Wall_39`) | 4'8" wall at y 70.5 (x 116-120.7) with a high window | Not in the photos (front room open to the north wall in the photo survey). Tape check. | yes |
| corner posts | 9 small corner posts (`Joint_1`, `Joint_2`, `Joint_3`, `Joint_7`, `Joint_10`, `Joint_13`, `Joint_16`, `Joint_19`, `Joint_24`) | Corner fillers of the removed walls above | yes |

### 2d. Doors, windows and openings - removed (9 doors, 4 windows, 5 openings)

| Scan piece | Scanner said | What it really is | Removed |
|---|---|---|---|
| Door_1 (L54) | Door at x 116 into a small walled area | Door of the stair area the photos do not show. | yes |
| Door_2 (L47) | Door 9'11" x 9'7" on the line 2 ft inside the warehouse north wall | The warehouse glass roll-up (i32), but drawn 2 ft inside the wall on the phantom line L10 and 1'11" wider than the photos. The master door (8 ft x 10 ft in the north wall) is used. | yes |
| Door_3 (L43) | Door 3'7" in the north wall at x 125-129 | Not in the photos. Tape check. | yes |
| Door_4 (L53) | Front door 5'7" at x 107-112.6 in the recessed front wall | The front door, but 5 ft west of where the photos and the layout notes put it (x 112-118). The photo position is used (master i30) and cut into the kept front wall. | yes |
| Door_5 (L51) | Door at x 120.7 (small room west wall) | Not in the photos (its wall L20 is not in the photos either). | yes |
| Door_6 (L44) | 7'8" doorway in the north-east step wall | Not in the photos. Tape check. | yes |
| Door_7 (L50) | Door on the AIR GUNS display face (x 100, y 76.4-79.2) | The real white door (i41), but the scanner placed it on the display face 3 ft in front of the arch wall. The master door in the arch wall is used. | yes |
| Door_8 (L55) | Doors 5'8" at x 81.2-86.9 in the north wall | The will-call doors, but 5 ft west of the photo position (x 86.5-92.5). Photos win; master i31 is used and cut into the kept north wall. | yes |
| Door_9 (L58) | Door 2'9" in the old-building north wall (x 140.7-143.5) | Not in the photos. Tape check. | yes |
| Window_0 (L60) | High window 2' (7.3-9.3 ft up) at x 120.9-122.9 | Not in the photos (its wall L35/L39 is not in the photos either). | yes |
| Window_1 (L56) | Window 3'10" in the old-building north wall (x 148.8-152.6) | Not in the photos. Tape check. | yes |
| Window_2 (L48) | High window 2'7" at x 117.9-120.5 | Not in the photos (its wall L39 is not in the photos either). | yes |
| Window_3 (L46) | High opening 8'11" wide, 12.4-20.2 ft up, in the warehouse south wall | Not in the photo survey. It may be the "large louvered opening high on a warehouse wall" an audit saw in photo p.12 - the doc does not say which wall, so it is not kept. Tape/photo check. | yes |
| Open_L28 (L52) | Opening 11'7" x 12' in the grid-C wall | Photos: 20 ft wide opening with a wood header (i37) - conflicting, photos win (cut into the kept wall at the photo size). | yes |
| Open_L42 (L57) | Doorway 5'1" in the warehouse south wall (x 22-27) | Photos: EMPLOYEES ONLY french doors at x 29-35 (i34) - conflicting, photos win. | yes |
| Open_L11 (L45) | Opening 6'10" x 9' at the square arch | Photos: pier + 4'1" square arch (i27/i40) - conflicting, photos win. | yes |
| Open_L24 (L61) | Opening 4'8" in the wall behind the front desk | Not in the photos (the partition ends at y 37.6 in the photo survey). | yes |
| Open_L36 (L49) | Opening 12' x 9'10" in the y 70.5 wall | Not in the photos. Tape check. | yes |

*The scan file's "Openings" group holds only the Doors and Windows groups; the 5 openings above are gaps the scanner left in its wall lines (DXF / overlay only).*

## 3. What was kept

Every kept piece sits on a wall or door that is in your photo survey (or in the accepted map corrections). Checked by computer: the furthest any kept piece sits from a map wall is **0.44 ft (5 in)** - the warehouse west wall, which is inside the known scanner drift.

| Scan piece | What it is (map item) | Kept as | Fix applied |
|---|---|---|---|
| L7 (`Wall_7`) | Grid-C wall / Von's area wall (i21, i22, i18) with Von's door (i35). Within 0.24 ft of the photo survey. | as scanned | - |
| L8 (`Wall_8`) | Grid-C wall north end (i20). Warehouse part, drift-corrected. | as scanned (warehouse drift fix) | - |
| L13 (`Wall_13`) | West wall (i10). Warehouse part, drift-corrected; size matches the survey. | as scanned (warehouse drift fix) | - |
| L14 (`Wall_14`) | North wall continuing east to the step (master i14, corrected from the scan, docs put the step near grid G-H). The door is not in the photos: wall shown solid. TO CONFIRM. | edited | Scanner door (x 125-129) filled - not in the photos |
| L15 (`Wall_15`) | South wall (i8), inside face within 0.12 ft. | as scanned | - |
| L18 (`Wall_18`) | Recessed front wall (glass storefront). Kept because the building drawing describes it ("enclosed wall recessed ~10 ft behind the outer piers, grid E to H"). Door opening moved to the photo position x 112-118. TO CONFIRM (porch depth). | edited | Scanner front-door hole (x 107-112.6) filled; front door cut in at the photo position x 112-118, 7 ft 2 in high |
| L19 (`Wall_19`) | Arch wall (i25), within 0.42 ft. | as scanned | - |
| L24 (`Wall_24`) | Desk back partition (mirror/TV, sdf_wall). Only the solid piece that matches the photo partition (y 26.6-34.6) is kept; the 4'8" opening and the 21 ft running north to y 60 are not in the photos. | edited | Trimmed to the solid piece y 26.6-34.6 (dropped the 4 ft 8 in opening and the 21 ft running north to y 60) |
| L25 (`Wall_25`) | North wall (i13/i14), within 0.02 ft. The will-call doors are put at the photo position x 86.5-92.5 (scan had them 5 ft further west). | edited | Scanner will-call doors (x 81-87) filled; will-call doors cut in at the photo position x 86.5-92.5 |
| L28 (`Wall_28`) | Grid-C wall north part (i18, i19, i20). Drift-corrected. Openings set to the photo survey: 20 ft wide opening with the wood header (i37, y 48.5-68.5) and the Milwaukee doorway (i36, y 71-77.5). | edited (warehouse drift fix) | Scanner's 11 ft 7 in opening replaced by the photo openings: 20 ft wide opening (y 48.5-68.5) and the Milwaukee doorway (y 71-77.5) |
| L30 (`Wall_30`) | Arch wall (i25), within 0.42 ft. | as scanned | - |
| L37 (`Wall_37`) | Old-building north wall (i16), within 0.47 ft. The door (x 140.7-143.5) and window (x 148.8-152.6) are not in the photos: wall shown solid. Tape check. | edited | Scanner door (x 140.7-143.5) and window (x 148.8-152.6) filled - not in the photos |
| L38 (`Wall_38`) | Arch wall (i28), within 0.14 ft. | as scanned | - |
| L40 (`Wall_40`) | North wall (i11, i12, i13). Drift-corrected. The man door (i33, x 27-30) and the glass roll-up (i32, x 37.5-45.5) are cut in at the photo positions. | edited (warehouse drift fix) | Man door (x 27-30) and 8 ft roll-up (x 37.5-45.5) cut in at the photo positions (the scanner put the roll-up on a false line 2 ft inside) |
| L41 (`Wall_41`) | Arch wall (i28), within 0.14 ft. | as scanned | - |
| L42 (`Wall_42`) | Warehouse south (loft) wall (i23, i24). Drift-corrected and trimmed to stop at the west wall (it ran 1.8 ft outside the building). Doorway set to the photo french doors (i34, x 29-35); the scan doorway (x 22-27) and the high opening above it are not in the photos. | edited (warehouse drift fix) | Trimmed at the west wall (ran 1.8 ft outside); scanner doorway (x 22-27) and high opening filled; french doors cut in at the photo position x 29-35 |
| L59 (`Door_0`) | Von's door (i35): y 4.3-7.2, same place as the master. | as scanned | - |
| corner posts | 16 small corner posts of the kept walls | as scanned | - |

**The clean 3D file** `scan-clean.glb` (47 KB, was 633 KB) holds only these pieces, already moved into the app's 3D frame in feet (scene = 3.280840 x scan metres + (76.897, 0, -41.754); the warehouse part also shifted by (-2.64, 0, +3.37) ft for the scanner drift). The app loads it with no extra transform. Each piece carries a note (`extras`) saying which map item it sits on and what was changed.

## 4. Map (master layout) changes undone - back to your photos

The earlier merge moved some things to where the scanner put them. Re-checked against your photos and the notes: anything that came **only** from the scan, and that the photos or docs do not support, is back to the photo number.

| Map item | What the scan merge had | Now (photo survey) | Why |
|---|---|---|---|
| `i63` DECKING WALL 23' (x) | 91.15 | 88.5 | Scan-only fixture move (measured off the display face, which is not a wall). The photo survey has the decking wall right after the millwork slatwall (x 77-100); the move opened a 2 ft 8 in gap the photos do not show. |
| `i30` FRONT DOOR (x) | 109.78 | 115 | The scan put the door 5 ft west (x 107-112.6). The photo survey and the layout notes ("front door x 112-118") put it at 112-118; a photo-matched camera (photo 35, from inside the front desk) looks straight at x ~116. Photos win. y stays in the recessed wall (docs), height 7.2 ft kept (scan measurement the photos do not contradict). |
| `i9` South wall (front, east of door) (x,w) | x 141.24, w 56.92 | x 143.85, w 51.7 | Starts again at the photo door edge x 118 (it had been stretched west to the scan door). y stays on the recessed line (docs). |
| `scan_front_w` South wall (front, west of door) (x,w) | x 105.07, w 3.43 | x 107.6775, w 8.645 | Now runs from the arch wall to the photo door edge (x 103.36-112.0) instead of to the scan door. |
| `i85` Soda coolers (x,y,rot) | x 104.65, y 14.35, rot 270 | x 109.5, y 13.5, rot 0 | The scan saw one 3 ft fridge-shaped box in the corner and the cooler bank had been turned to fit it. Photos: a 6 ft cooler bank facing north, between the arch wall and the door. Photo x and orientation restored; only the documented recess shift (+11.3 ft) kept. |
| `i84` REFRESHMENT COUNTER (x,y,w) | x 121.14, y 12.6, w 15.0 | x 124.5, y 12.9, w 13 | Scan-only length (15 ft) and position (it would now overlap the photo door position). Photo 13 ft counter east of the door restored; recess shift (+11.3 ft) kept. |
| `spin_chk` Checkout specials spinner | y 20.3 | y 20.3 (kept) | Not seen by the scan; only moved north with the recessed front wall so it is not standing on the porch. To confirm. |

**Kept from the scan (the photos do not contradict them), each marked `toConfirm` in the file:**

- **Recessed front wall / covered porch** (`i8`, `i9`, `scan_front_w`, front room `i4`/`c3`, `i5`/`c6`, east wall `i17`): the building drawing says the storefront wall is set back about 10 ft behind the outer piers from grid E to H; the scan measured 11 ft 4 in. The front door, soda coolers, coffee counter and checkout spinner keep their photo order and size but sit on the inside of that wall (moved north 11.3 ft).
- **North-east step** (`i14`, `i15`): the north wall runs to about x 139 before stepping in 9 ft 7 in (scan); the drawing puts the step near grid G-H, further east than the old x 127.
- **Von's door** (`i35`, with `i21`/`i22`): moved 1 ft 3 in north (scan y 4.3-7.2); within photo accuracy.
- **Ceiling heights**: warehouse 20 ft 4 in (was 22), sales floor 19 ft 3 in (was 15), south-aisle drop ceiling 10 ft 4 in (was 9 ft 5 in), front room 10 ft (was 9 ft 5 in). Front door height 7 ft 2 in.
- All 145 photo-survey items are still in the file (plus the one front-wall piece `scan_front_w`). Nothing was added from the scan furniture.

## 5. Still needs a tape measure

1. **Porch depth:** from the glass front wall straight out to the outer pier line. Scan 11 ft 4 in, drawing about 10 ft. Does the porch run all the way to the east end?
2. **Front door:** from the arch-wall corner (inside, by the soda coolers) east to the door's west edge. Photos/notes about 8 ft 8 in (door x 112-118); scan 3 ft 7 in (door x 107-112.6). How many soda coolers, and do they face north or east?
3. **Coffee counter:** length (photos 13 ft, scan 15 ft) and is there a second 8 ft run of base cabinets east of it (scan only)?
4. **North-east corner:** where does the north wall step in (scan x 139, old survey x 127)? What is the 18 ft x 9 ft 7 in room in that corner (scan: sink, a door in its north wall, a 7 ft 8 in doorway east, a 12 ft opening south)? Are there walls at x 120.7 and y 70.5 west of x 127 (scan), or is the front room open to the north wall there (photos)?
5. **Old-building north wall:** is there an outside door at x 140.7-143.5 and a window at x 148.8-152.6 (scan only)?
6. **Will-call doors:** from the arch wall (behind the AIR GUNS display) west to the doors. Photos x 86.5-92.5; scan x 81-87.
7. **Decking display:** does it start right where the millwork slatwall ends (photos, x 77-100) or about 2 ft 8 in further east, ending at the arch-wall corner (scan, x 80.4-103.4)?
8. **Desk back partition (mirror/TV):** where does it end to the north? Photos y 21.4-37.6; scan starts at 26.8 and has a 4 ft 8 in gap at 34.6-39.3.
9. **Square arch:** photos a 2 ft 4 in pier then a 4 ft 1 in arch; scan one 6 ft 10 in opening.
10. **Warehouse:** roll-up door width (photos 8 ft, scan 9 ft 11 in); french-door position (photos x 29-35, scan x 22-27); the wide opening in the grid-C wall (photos 20 ft, scan 11 ft 7 in); the Milwaukee doorway (scan did not see it); a high opening above the french doors into the loft (scan, 12-20 ft up - maybe the louvered opening in photo p.12?).
11. **Loft stairs:** inside the warehouse (photos, y 21.8-35.8) or in a 5 ft corridor east of Von's office (scan, 13 steps, y 15-29.5)?
12. **Front room north part:** is there a small walled area with a 7-step stair at about x 103-116, y 60-70 (scan only)? Where is the mezzanine edge (photos: posts at y ~47; scan: a 16 ft wall at y 60)?
13. **Possible post** about 2 ft wide at x 98, y 29 (north end of the Occidental aisle) - scan only.
14. **Ceilings** (laser): sales floor (scan 19 ft 3 in vs photos 15 ft), south-aisle drop ceiling (10 ft 4 in vs 9 ft 5 in), front room (10 ft vs 9 ft 5 in), warehouse to the roof structure (20 ft 4 in vs 22 ft).
15. **Not scanned at all:** east end (x 153-169: east wall, vault, restrooms, offices, stairs to the offices) and Von's office - still photo-survey numbers. A tape check of the east wall length closes the outline.

## 6. Files

- `scan-clean.glb` - the cleaned 3D scan: 16 walls, 16 corner posts and Von's door; already in the app's 3D frame (feet), no extra transform; no furniture, floors or ceilings; no textures.
- `scan-overlay.clean.json` - the same kept walls/door for the 2D plan (same format as `scan-overlay.json`; objects, floors and ceilings empty). Fixes from the independent check: dx 0.255, warehouse south wall trimmed at the west wall, half-shifted warehouse floor/ceiling polygons gone, coverage recomputed.
- `master-layout.clean.json` - the map: 146 items (all 145 photo-survey ids + `scan_front_w`); the 4 scan-only changes above undone; scan-backed changes marked with `toConfirm`; an `audit` block lists what was reverted and kept.
- `clean-top.png` (plan view), `clean-oblique-sw.png`, `clean-oblique-ne.png` (3D views): the clean scan (blue) over the map walls (grey), map doors red, openings yellow. `clean-top-front.png` close-up of the front wall and door. `clean-top-removed.png`: everything removed (red walls/doors/windows, orange furniture guesses).
