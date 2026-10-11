# North-east / east half of the master map: final reconciliation (alpha + bravo + re-check)

Files in this folder: `draft-patch.json` (10 removed, 25 changed, 11 added), `draft-master.json` (baseline with the patch applied, 161 items, passes the repo's `validateMapData`), `render-before-after.png`, `CHANGES-PLAIN.md`, `QUESTIONS.md`, and the scripts that made them (`build_patch.py`, `render.py`, `work/`).

Coordinates are feet from the inside south-west corner, x east, y north. "Photo N" = the numbered blue arrow on the render (1 = 884835b8, 2 = e00542bc, 3 = 6afa6e17, 4 = aefebb5e, 5 = a84828ae, 6 = 56f6a89a, 7 = 4ce75b9d, 8 = 700cac09, 9 = 54f91b85, 10 = 76e35a7c, 11 = 364e948c). Confidence: H = two independent sources agree within about 2 ft, M = photos and scan agree on the thing but the position is +/-2-4 ft, L = photos only, +/-5 ft or worse. People in the photos were ignored; wall art is decor.

## 0. How the final was chosen

1. Read both reconstructions and listed where they agree (section 1) and disagree (section 2).
2. For every disagreement I did NOT trust either one's arithmetic. I rebuilt a small pinhole-camera model (focal length 736 px on the 1126 px-wide display copy, camera height 5 ft), read pixel positions of named landmarks off each photo with a grid overlay, and fitted each camera's position and heading to landmarks that the scan measured (walls, the stair-core corner, doorway jambs, the first-aid column stub, cabinet run ends). I recomputed the scan numbers from the mesh and the scan overlay (ceiling slabs by height, wall planes, the stub at x 125.28) rather than reading the reconstructors' summaries.
3. The final keeps a change only if it is supported by photo + scan, or by two independent photo readings. Where the two reconstructions drew different shapes and neither could be proved, the final draws only the part both agree on and puts the rest in the item's plain-words `toConfirm`.
4. Section 3 projects the final layout back into each photo from its fitted camera and compares left-to-right positions (58 landmarks, 25 of them not used to place the camera).

## 1. Where alpha and bravo AGREE (kept, high confidence)

| Topic | Both say |
|---|---|
| Felix's desk | The wood two-pod desk with the one-step raised walkway, TV + mirror wall and mini fridge is Felix's desk. It stands against the arch wall beside the carpeted stair, x 103.4-117.4, y 52.6-59.5, on the owner's "1 STEP" raised floor, not at x 116-125, y 21-38. The survey's duplicate "cedar desk" items (i87, n10015m49) are the same desk. |
| Checkout counter | The real customer checkout counter ("front sales desk") was missing from the map; the old pods stood in its place. It is an octagon-type counter near x 108-122, y 28-39. The owner's purple box and the door photo agree on its place. |
| Carpeted stair | A carpeted stair is inside the stair core (x 103-116, y 60-65.6), mouth facing east at x 116, supply-closet door at its foot. The survey's second "SUPPLY CLOSET" door at x 150.3 is the same door. |
| Owners board | On the north wall line y 70.47 between the stair-core corner and the wide doorway, faces south, not at x 150. |
| Back room | The LVP floor, sink, men's door and first-aid board are in the north-east back room x 120.7-138.9, y 70.5-80, entered through a 12 ft wooden doorway at x 125.57-137.57. The survey wall `bp_oldN_w` that closed the doorway is shortened. The four "vault" walls at x 152-164 and the restroom wall at x 166.5 have no support and go. |
| Two stairs, two upper floors | A separate OPEN WOODEN stair is in the south-east; a north deck (south edge y 60.4) AND a south balcony both exist. |
| Cubicles | The scan's wall corner (125.93, 60.4) and photos 5, 8, 10 put the NW corner of the cubicle block and the big timber post at the north end, not at y 45.5. The panel line `cub_line` moves from y 46.5 to y about 60. |
| Strap isle | Faces west on the cubicle panels, north end by the timber post; not at y 42-50 as drawn on the live map. |
| South run 2 | The scan has a second cabinet run (x 131.5-139.9) east of the ice machine that the map lacks; the popcorn machine stands on the east end of the cabinets, the wood dispatch counter just east of it. |

## 2. Where they DISAGREE, and how each was settled

| # | Topic | alpha | bravo | My re-derivation | Final |
|---|---|---|---|---|---|
| 1 | Camera 11 (photo 11) | (131.4, 17.6), 82 deg | (113, 19), 85 deg | The white cabinet run's east end is the scan's x 139.9; in the photo it is about 8 ft ahead and 4.7 ft right, so the camera is near x 131-132 (bravo's x 113 would put the cabinets 27 ft away). The camera is tilted UP about 8 deg (the far wall base lands 38-40 ft away only at that tilt). Heading from the vanishing point of the balcony beam is about 92 deg, not 82. | (131.6, 18.7), 92 deg |
| 2 | Open wooden stair foot | x 152.6, y 22-26 | x 140.5-155 (centre 146), y 21 | With the tilt above the foot is 20-22 ft ahead and the two ends of its bottom step come out 3.9 ft apart (the survey says 4 ft); at 10 deg tilt they come out 4.6 ft, at 6 deg 3.4 ft, so tilt 8 and x 152.5 are self-consistent. Bravo's 146 needs the stair to be only 3 ft wide at 14 ft. | foot x 152.5 (+/-3), y 19.5-23.5; stair centre (158.0, 21.4) |
| 3 | Camera 9 (photo 9) | (141.9, 23.0), 259 | (150, 30), 250 | Fit to ice machine, front door, glass fridge and coffee-run west end: (139.5, 22.5), 252, 13 px rms. Bravo's camera does not reproduce the ice machine/door spacing. | (139.5, 22.5), 252 |
| 4 | Camera 10 and the front door | (109.0, 11.5), 7 | (113.5, 10), 7 | Fit to the TV, Owners sign, NW post and two arch jambs: (109.2, 11.5), 8 deg, 6.5 px rms. Bravo's x is not supported by the arch jambs. | (109.2, 11.5), 8 |
| 5 | South balcony depth | strip y 11.3-17 (+ SE block) | one slab y 11.3-26.8 | The long railing in photo 11 and the beam/rail in photo 9 both land at y 14-15.5 when back-projected (balcony deck underside at 10 ft, camera fits above). The scan ceiling slab to y 26.8 is one flat RoomPlan polygon at 10.91 ft (two triangles, 4.9 x 15.5 ft), so it shows a surface exists, not where the deck edge is. Photo 9's right-hand railing (running toward y 28) lines up with the east edge of the FRONT-ROOM ceiling (x about 126), where the master's own ceiling `c3` already has an east fascia; that is an upper floor over the front room, not this strip. | strip x 132.4-169.35, y 11.3-15.5, plus a SE block x 163-169.35, y 15.5-24 where the stair lands. Rest in `toConfirm`. |
| 6 | North deck west end | x 116.5 | x 103.35 | The stair turns right (north) at the top (photo 7); the only room is above the supply closet, so the upper flight rises east to x 116 and the deck floor starts there. | x 116.4 |
| 7 | Carpeted stair | two flights drawn | lower flight only | The lower flight is scan + photo 7. The upper flight is inferred from "turns right at the top" and the wall layout; nothing shows its size. | lower flight only; upper flight in the note |
| 8 | `sdf_nwall` (GOOD STUFF "corridor wall", y 43.8) | moved onto the arch wall as a 0.3 ft overlay | removed | Photo 10 looks straight up the line where an E-W wall at y 43.8 would stand and shows none; the scan has none. The board hangs on the arch wall's east face (photo 4, y about 46-52), which already exists. | removed |
| 9 | Felix TV wall | y 59.75, 12.3 x 0.3 | y 59.45, 14.1 x 0.6 | It is the south face of the stair-core wall (scan y 60.0). Photo 3 sees it between the arch wall and the stair-core end: x 103.75-116.5. | thin face at y 59.65, 12.75 long |
| 10 | Walkway width | 2.3 | 3.4 | Scan counter-top gap 2.05; by the fridge-width comparison in photos 2 and 3 the floor gap is about 3.1; the counters overhang. Photos 2 and 3 are the same spot (110.5, 47.5): photo 2 is a 1.7x zoom, and both place the step 5.2-5.5 ft ahead and the fridge 11.4 ft ahead, which fits step-to-fridge 5.85 ft. | 2.45 between the pod bodies |
| 11 | Which duplicate door id | keeps `bp_stair_door`, `bp_men_e_door` | keeps `d_closet`, `d_mens` | The scan-measured records (`bp_*`) already have the right size and position. | keep `bp_*`, remove `d_closet`, `d_mens` |
| 12 | First-aid board | board (125.6, 72.0) + a 3 x 2.7 column | board (125.0, 71.2), no column | The scan has a wall stub at x 125.28, y 70.5-73.4; photo 1's four near landmarks (column edges, men's-door edges) fit with that stub as the column's east face at 9 px rms. | board on a 2.0 x 2.73 ft column, face east |
| 13 | Strap isle | y 57.4, left 5 ft long | y 48 (centre of the owner's mark), 12 ft | Photo 5 (pegboard starts right at the post) and photos 8 and 10 put the NORTH end at the post (y 59.9). Owner approved 12 ft (the item name says 12'). | 12 ft, y 47.9-59.9, x 125.5 |
| 14 | Cubicle block | north edge 60.4, west edge 128 | north edge left at 45.5, west edge 125.93, added a panel line | The scan's closed outline (west x 125.93, south y 26.8, north y 60.4) is measured. Photo 5 puts the rack front at x 125.2 and the rack about 1.5 ft deep, so the panel face is behind the scan plane. | block x 126.85-146, y 26.8-59.6; panels at x 126.25-126.85 |
| 15 | Timber post | `c_dark` to the NW post | `c_dark` to (143.8, 60.4) + new NW post | The NW post is certain (photo 5 base 5.5 ft ahead, scan corner, building drawing grid F). A SECOND post east of it is seen in photo 10, but its x is 138-147 depending on the source. | `c_dark` = NW post; second post NOT drawn (question) |
| 16 | Line at y 60 | new 10 ft "hall south wall" | the panel line `cub_line` | Photos 8 and 10 show tan 5-6 ft panels with a wood and window band above; one item cannot be both 6 ft and 10 ft. | `cub_line` only, note about the band |
| 17 | Checkout counter | rectangle (114.8, 33.6) 13.6 x 9.6 | octagon ring (116, 33) 14 x 10 | Re-projected from photo 10 (camera fitted): south face y about 30.5 (+/-1.5), outer ends x 106.7-121.5. Photo 8's camera is inside it. The master's own `i47` (back desk) is an octagon ring with E/W openings and the handoff notes say both desks are octagons. | octagon ring (114.5, 34.4) 14.4 x 10, E/W openings |
| 18 | Popcorn / dispatch | `pop_desk` = machine (140.3, 13.0); `ne_dispatch` (142.25, 15.65) 2.5 x 3.3 | `pop_desk` = dispatch (146.5, 13.8) 9 x 3.5; machine (133.9, 12.6) | The machine is at the right edge of photo 11, about 8.5 ft ahead of a camera at x 131.6, i.e. x 138-141 on the east end of the cabinets. The dispatch counter's west face is at x 141-142, y 13-17 (both ends of the face fit within 21 px). Its length is unknown. | `pop_desk` = machine (138.6, 12.8); `ne_dispatch` (144.5, 15.0) 6 x 4 |
| 19 | Coffee run 2 length | 11.5 ft to x 143 | 8.4 ft, scan | The scan covers to x 153 and ends the run at 139.9. | 8.4 ft |
| 20 | North steel door | added | not added | Scan door x 125.2-128.7; photo 1's right edge; wall split so the gap shows. | door + split wall |

## 3. Cameras and the projection test

Final camera poses (placed from scan-measured landmarks; 11 = from the coffee-run end):

| Photo | x, y | Looks (compass) | Tilt | Landmarks used to place it |
|---|---|---|---|---|
| 1 | 135.5, 78.1 | 249 | -8 | first-aid column edges (stub x 125.28), men's-door edges |
| 2 | 110.6, 47.1 | 2 (1.7x zoom) | -15 | walkway step ends, fridge |
| 3 | 110.5, 47.8 | 357 | -18 | step ends, fridge, TV-wall ends |
| 4 | 115.8, 49.3 | 291 | -8 | not fitted (alpha's pose kept) |
| 5 | 124.1, 55.9 | 355 | -14 | stair-core corner, closet door edges, NW post base |
| 6 | 123.3, 67.8 | 63 | -18 | doorway jambs, room corner |
| 7 | 122.5, 61.2 | 280 | +2 | stair mouth edges, closet door |
| 8 | 116.0, 34.5 | 16 | 0 | inside the checkout counter (fit says y 34-38) |
| 9 | 139.5, 22.5 | 252 | -1 | ice machine, door, fridge, run-1 end |
| 10 | 109.2, 11.5 | 8 | -15 | TV, Owners sign, NW post, two arch jambs |
| 11 | 131.6, 18.7 | 92 | +8 | coffee-run end, dispatch-counter face ends |

Predicted-vs-observed horizontal pixel position (display copy, 1126 px wide; "placed" = used to fit the camera, "check" = not used):

| Photo | Landmark (final layout) | Observed | Predicted | Diff | |
|---|---|---|---|---|---|
| 1 | carpeted stair foot (116.0, 62.7) | 345 | 338 | -7 | check |
| 1 | east pod NE corner (117.35, 59.4) | 225 | 223 | -2 | check |
| 1 | NW timber post (126.3, 60.4) | 142 | -65 | -207 | check, FAILS (see below) |
| 3 | TV centre | 575 | 570 | -5 | check |
| 3 | "Ladies Room" sign | 922 | 921 | -1 | check |
| 2 | mini fridge | 520 | 517 | -3 | check |
| 2 | TV centre | 440 | 436 | -4 | check |
| 4 | arch/TV wall corner | 845 | 820 | -25 | check |
| 4 | Buck sign | 897 | 886 | -11 | check |
| 4 | arch wall at y 46 | 60 | 59 | -1 | check |
| 4 | east pod SW corner | 683 | 785 | +102 | check, off 1.7 ft (camera 4 is not fitted) |
| 5 | doorway west jamb (125.6, 70.47) | 745 | 697 | -48 | check |
| 6 | RECEIVING counter (166.5, 66) | 1060 | 985 | -75 | check; counter looks nearer y 62 |
| 6 | east wall (169.35, 66) | 1040 | 990 | -50 | check |
| 7 | stair-core south wall east end | 280 | 283 | +3 | check |
| 8 | TV right edge | 208 | 230 | +22 | check |
| 8 | "Ladies Room" sign | 314 | 313 | -1 | check |
| 8 | Owners sign | 450 | 457 | +7 | check |
| 8 | NW timber post | 661 | 636 | -25 | check |
| 8 | mini fridge | 108 | 159 | +51 | check |
| 10 | checkout counter west end (107.3, 31.5) | 370 | 391 | +21 | check |
| 10 | checkout counter east end (121.7, 30.1) | 905 | 908 | +3 | check |
| 11 | open stair foot south (152.5, 19.5) | 520 | 513 | -7 | check |
| 11 | open stair foot north (152.5, 23.4) | 375 | 369 | -6 | check |
| 11 | far end of the block's south panels (152, 28) | 215 | 187 | -28 | check |

Result: 58 landmarks over 11 photos, 3 more than 60 px off (7 degrees at 30 ft is about 100 px): the NW post in photo 1, the east pod corner in photo 4 (unfitted camera) and the RECEIVING counter in photo 6 (far, 45 ft). Left-to-right order is correct in 9 of 11 photos; photo 1 (the post) and photo 6 (counter vs far wall, 5 px apart) differ.

Unresolved in photo 1: a timber post with a grey cubicle panel at the picture's left edge (u 0-165). Under the fitted pose the NW post is 15 deg outside the picture. A post at about (120-123, 57-59) fits the pixels, which could be the stair-core's own corner post (116.5, 60.1; photo 7 shows a post there) or the panel line's north end. It does not change the plan; it is one of the items to confirm on site.

## 4. Changed items (one row each)

### A. Felix's desk (owner, 11 Oct: "This is Felix's desk area")
| id | Change | Photos show | Scan shows | Method / error | Conf |
|---|---|---|---|---|---|
| `sdf_s` | "SALES DESK (SOUTH POD)" (120.3, 24.9) 9x7 -> "FELIX'S DESK - WEST POD" (106.4, 56.0) 6.0 x 6.8 | photos 2, 3, 4: wood-panelled pod with grey top left of the walkway, against the arch wall; photo 4's board wall (arch wall) stops right at its west end | "cedar desk" table box (106.4, 54.2) 6.25 x 3.4, south face y 52.5 | south face y 52.6 from scan and photo 3/4; width from scan box; depth to the wall face (59.5). +/-1.5 ft | M |
| `sdf_n` | -> "EAST POD (glass-topped end, by the stair)" (114.6, 56.0) 5.5 x 6.8 | photos 3, 4: right pod; photos 7, 1: its glass-divider counter beside the stair mouth | cabinet box (114.1, 54.2) 4.9 x 3.3 | east end 117.35 is the least sure edge. +/-1.5 ft | M |
| `sdf_w` | walkway runs N-S now: (110.625, 56.0) 2.45 x 6.8, raised 0.45 | photos 2, 3: rubber mat, one step at the south end | 2.05 ft gap between the two scan counter tops | see section 2 row 10 | M |
| `sdf_step` | (110.625, 52.1) 1.0 x 2.45 rises north | photos 2, 3: one step board | - | same | M |
| `sdf_wall` | -> thin south face of the stair-core wall (110.12, 59.65) 12.75 x 0.3 | TV, mirror (it reflects the arch wall, START HERE sign and coffee area, so it faces south), printer shelf, "Ladies Room Upstairs" sign (photos 2, 3, 8, 10) | stair-core south wall y 60.0, x 103.35-116.53 (already `bp_stair_s`) | projected from camera 3: TV wall ends land within 26 px; photo 10 sees the TV at the fitted bearing | H |
| `sdf_fridge` | (110.6, 58.3) 1.7 sq | photos 2, 3 (north end of the walkway); photo 8 at the left edge | - | photos 2 and 3 agree on its distance from the step (5.85 ft) | M |
| `bp_step_plat` | name and note only (owner's outline kept) | one step only (photos 2, 3) | - | owner outline x 103.4-117.7, y 49-59.8 | M |
| `sdf_nwall` | REMOVED | photo 10 shows no E-W wall at y 43.8; the board hangs on the arch wall | no wall at y 43.8 | section 2 row 8 | H |
| `i87`, `n10015m49` | REMOVED | the only cedar-coloured desk in photos 2-4 is Felix's desk | the two scan "cedar desk" boxes are the two pods | duplicates occupying the same floor | M-H |

### B. Front sales desk (customer checkout)
| id | Change | Photos show | Scan shows | Method / error | Conf |
|---|---|---|---|---|---|
| `ne_checkout` NEW | octagon ring (114.5, 34.4) 14.4 x 10.0, E/W openings 3.5 | photo 10: angled front corners, snack pegboard, candy racks, "Checkout specials" sign, START HERE sign over it; photo 8: taken inside it | nothing reliable | camera 10 fitted on scan landmarks: south face y 30.5 +/-1.5, ends x 106.7-121.5; owner's purple box x 107.8-121.9, y 28.1-37.8; photo 8 camera y 34-38; depth 10 assumed. Predicted ends land 21 and 3 px from the photo. +/-2 ft | M |

### C. Carpeted stair, closet, Owners board
| id | Change | Photos show | Scan shows | Method / error | Conf |
|---|---|---|---|---|---|
| `ne_stair_a` NEW | stairs (112.0, 62.8) 7.8 x 5.2 rises west to 5.4 ft | photo 7 head-on, about 9 treads; photo 5 left edge; photo 1 distance | stairs7_0 (112.2, 62.7) 7.9 x 5.4, rise 5.4; walls y 60.0, 65.6, x 116.03 | stair mouth edges fit camera 7 to 21 px | H (place), M (shape) |
| `bp_stair_door` | name/note | photos 7, 5: "SUPPLY CLOSET - PLEASE KEEP DOOR CLOSED" | door x 116.03, y 66.87-69.42 | camera 5 fits both door edges within 9 px | H |
| `d_closet` | REMOVED | duplicate | | | H |
| `w_plaque` | (150.3, 52) rot 90 -> (120.9, 70.12) 9.0 x 0.3 rot 0, faces south | photo 5: face-on, 15 ft ahead; photo 10: sign at 11.0 deg east of north | wall y 70.47 solid x 116.0-125.3 | camera 5 + corner and jamb; width 8-9 ft by eye | H |

### D. Back room
| id | Change | Photos show | Scan shows | Method / error | Conf |
|---|---|---|---|---|---|
| `v_floor` | (158, 66) 12x8 -> (129.8, 75.25) 18.2 x 9.5 | LVP planks in photos 1, 5, 6, 8 | room x 120.7-138.9, y 70.5-80 | | M-H |
| `v_n`, `v_e`, `v_s`, `v_w` | REMOVED | photo 6: the hall runs open to RECEIVING where the "vault" stood | nothing at x 152-164 (not scanned beyond 153) | steel finish is on the back room's east and north walls (photo 6) | M-H |
| `ne_back_open` NEW | 12.0 x 9.84 opening at x 125.57-137.57 | photos 1, 5, 6, 8: wood header and jamb posts, open | Open_L36 | camera 6 fits the jambs to 11 px | H |
| `bp_oldN_w` | x 133.865, w 13.73 -> x 139.15, w 3.16 | | | removes the wall that closed the doorway | H |
| `ne_firstaid_col` NEW | column (124.3, 72.035) 2.0 x 2.73 | photo 1: board on a wood-clad pier | stub x 125.28, y 70.5-73.4 | camera 1 fits both edges of the east face to 4 px; depth guess | M |
| `fa_station` | (155.5, 56.8) -> (125.45, 72.0) 2.4 x 0.3, faces east | photos 1, 5, 6 | | | M-H |
| `bp_men_e_door` | name/note | photo 1: grey door + MEN sign beside the sink | door y 71.15-73.87, x 120.69 | camera 1 fits both frame edges to 22 px | H |
| `d_mens`, `w_mens` | REMOVED | no photo shows a restroom at x 164-167 | | | M |
| `ne_back_door_n` NEW | door (126.95, 80.35) 3.5 wide | photo 1 right edge: grey steel door with a small window | Door_3 x 125.2-128.7 | predicted at the right edge | M-H |
| `i14` + `ne_wall_n_east` NEW | north wall split at the door | | | | H |

### E. Cubicles, post, strap isle
| id | Change | Photos show | Scan shows | Method / error | Conf |
|---|---|---|---|---|---|
| `c_dark` | (145, 46.5) -> (126.3, 60.4) 1.0 sq | photo 5 base (126.4, 60.9); photo 10 thin post at 717 px (predicted 717) | wall corner (125.93, 60.4); building drawing grid F | three views agree to 1 ft | H |
| `i86` | (137, 36) 18x19 -> (136.425, 43.2) 19.15 x 32.8 | photos 5, 8, 10 panels along the west and north; photo 11 south panels end about x 152 | closed outline x 125.93, y 26.78, 60.41 | east edge kept at the survey's 146 (scan north wall stops at 143.76) | M |
| `cub_line` | (136, 46.5) 15 -> (135.28, 59.9) 16.96 | photos 8, 10 | wall y 60.41 x 125.93-143.76 | | M |
| `ne_cub_west` NEW | panel line (126.55, 49.575) x 20.65 long | photos 5, 8, 10 | wall plane x 125.93 with a 4 ft 8 in gap at y 34.55-39.25 | face 1 ft behind the scan plane (rack front at x 125.2) | M |
| `i66` | (127.1, 46.2) 5x1.8 -> (125.5, 53.9) 12 x 1.5, faces west | photo 5, 8, 10: pegboard starts at the post | | camera 5 floor projection puts the rack front at x 125.0-125.4 | M (x, face, north end), L (south end) |

### F. Upper floors, south-east
| id | Change | Photos show | Scan shows | Method / error | Conf |
|---|---|---|---|---|---|
| `i6` | (148.5, 58.5) 41x23 -> (142.875, 65.4) 52.95 x 10 | photos 8, 10 fascia, rail, banner; 6 joist ceiling | ceilings 9.5-10.9 ft y 60-70.5; wall y 60.41 | west end from stair turn; east end unscanned | M |
| `ne_mezz_s` NEW | zone x 132.4-169.35, y 11.3-15.5, 10.4 ft | photos 9, 11 | ceiling steps 9.96 -> 10.91 at x 132.4 | north edge from back-projection of two photos +/-1.5; west end may be ~127 | L-M |
| `ne_mezz_s2` NEW | block x 163-169.35, y 15.5-24 | photo 11 landing | - | +/-5 ft | L |
| `i73` | (156.5, 59.5) -> (158.0, 21.4) 11x4 | photo 11 | - | foot x 152.5 +/-3 | M-L |
| `stair_land` | -> (165.0, 21.4) | photo 11 | - | +/-3 | L |
| `pop_desk` | "Popcorn desk" (147.5, 65) -> machine (138.6, 12.8) 2.4 x 2.2 | photo 11 right edge | cabinet run to 139.9 | +/-3 ft in x | L-M |
| `ne_dispatch` NEW | (144.5, 15.0) 6x4 | photo 11 | not scanned | west face x 141-142, y 13-17 fits 21 px; length unknown | L |
| `ne_refr_run2` NEW | (135.7, 12.6) 8.4 x 2.3 | photos 9, 11 | cabinet run 2 | scan | H |

### G. Notes only (nothing moved)
`rec_desk` (photo 6 puts it nearer y 62 than the 66 drawn, +/-2.5; left), `c_boxed` (not in any photo), `i30` front door (see section 6).

## 5. Hypotheses

| H | Verdict | Evidence |
|---|---|---|
| H1 mezzanine along the SOUTH wall, not the north | HALF RIGHT. A south balcony exists (photos 9, 11; scan ceiling step at x 132.4). A north deck exists too: its south edge is the scan wall y 60.41 (fascia beam, the 250 YEARS railing, joist ceiling over the hall: photos 6, 8, 10). The baseline zone was wrong in size and edge (y 47, x 128), not in existence. | rows 5, 6 |
| H2 two stairs | SUPPORTED. Carpeted stair at the stair core (photo 7, scan); open wooden stair in the south-east (photo 11). | |
| H3 restroom, first aid and sink with the LVP floor in the north-east back room | SUPPORTED. | section 4D |
| H4 Owners board and supply-closet door by the carpeted stair | SUPPORTED. | section 4C |
| H5 dispatch counter + popcorn machine on the south wall east of the coffee run | SUPPORTED for the side and neighbours; positions L-M (+/-3 ft). | |
| H6 Felix's desk is a cubicle | CONTRADICTED. | owner's words, photos 2-4 |
| H7 other east-half items fine | PARTLY CONTRADICTED: cubicle block edges, `cub_line`, `c_dark`, strap isle y, `bp_oldN_w`, coffee run 2 missing, front door x doubtful. Not changed: coffee run 1 `i84` (scan has it 4.4 ft further west), `i85`, `spin_chk` (photo 10 puts it at (110.1, 22.2); baseline (108.5, 20.3)), `i109` (the Maverick case in photos 5 and 8 is at y about 51, not matched to `i109`). | |
| H8 pods are Felix's desk, front sales desk missing | SUPPORTED (with the twist that the pods were drawn on the checkout counter's spot). | |
| H9 strap isle on the west face of the cubicle panels | SUPPORTED for face and facing; y moved to the post end. | |

## 6. Findings neither reconstruction reported

* **Front door x.** Camera 10 (taken from the doorway) fits at x 109.2 and camera 9's door landmark fits at x 109.8 (6 px rms) against 11 px at x 112 and 20 px at x 115. Both favour the scan door (x 107-112.6) over the baseline door (112-118). It is not moved here (outside this rebuild, and the earlier audit kept the survey on purpose); `i30` carries the note and question 1 asks for a tape check. If the scan is right, the soda coolers `i85` (106.5-112.6) would block the door; the scan puts the cooler at x 105.
* **Photos 2 and 3 are one spot** (110.5, 47.5): photo 2 is a 1.7x zoom (focal length 1238 against 736). Both reconstructors put them 1.5 ft apart at different y.
* **The master's front-room ceiling `c3` already has an east fascia** (`fasciaE`, to 12 ft). The beam and rail in photo 9 line up with it (x about 126), so the south "balcony" may be joined to an upper floor over the front room. Not drawn (see `ne_mezz_s` note and question 6).
* **Photo 11's camera is pitched up 8 deg.** Bravo's open stair x and alpha's other readings depended on that; the stair width test (3.9 ft) confirms it.
* **Baseline file did not validate** (`i66` `src` was 217 characters, limit 80). Fixed in the patch.

## 7. Validation

* `node` + `wt-backend/public/js/shared/schema.js` `validateMapData`: draft-master.json valid, 161 items, ids unique, no field dropped. (The baseline itself fails on `i66`.)
* Collision check (`wt-backend/public/js/core/collisions.js`, `checkAll` with fixtures): baseline 35 issues (10 errors), draft 35 issues (8 errors). Inside x 98-172: baseline 9, draft 9. Gone: `fa_station` blocking the survey closet door, `rec_desk` overlapping the vault wall. New: `pop_desk` on `ne_refr_run2` (4.9 sq ft, on purpose, the machine stands on the cabinets). Not mine and unchanged: `i65`/`i78`, `i74-76` vs the arches, `i85` vs the front door, `i108` vs the arch wall.
* `shapeOf` + `overlapArea` over every pair involving a changed item: 19 overlaps above 0.05 sq ft, all of them platform/floor under an item (raised floor under the pods, LVP floor under the back-room walls), the intended popcorn-on-cabinets overlap, and two wall corners that already overlapped in the baseline (`i15` with the north walls).

## 8. Not settled (stays as a note on the item)

Upper flight of the carpeted stair; south balcony depth and west end; whether an upper floor covers the front room; second timber post along the beam; the post and panel at the left edge of photo 1; open stair foot (+/-3 ft); dispatch counter length; RECEIVING counter side; the east edge of the cubicle block (146 here, 143.8 by the scan, about 152 by photo 11); the 7 ft 8 in doorway in the back room's east wall (the scan has it; photo 6 shows that wall unbroken, so it is not drawn); finish of the back-room walls.
