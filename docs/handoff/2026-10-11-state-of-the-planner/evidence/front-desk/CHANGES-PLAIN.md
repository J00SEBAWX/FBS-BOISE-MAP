# What changes on the map, in plain words (round 2)

This is a draft for you to look at. Nothing is saved in the live map yet. Everything is measured from your photos, your sketches and the laser scan, so positions can be off by about 1 to 2 feet, and in two places by more (see "One disagreement" below). The picture `render-before-after.png` shows the map before (left) and after (right).

## Most sure (what the photos clearly show)

1. **The two "SALES DESK" blocks you circled are not the front sales desk. They are Felix's desk area.** The map had them in the wrong place (in front of the door area, about 25 ft too far south) and turned the wrong way. They are now where Felix's desk really is: in the wood-paneled corner against the arch wall, in front of the TV wall.
   - The two wood counters are now the "FELIX'S DESK - WEST POD" and "EAST POD" (same items, renamed and moved).
   - The raised walkway between them now runs north-south (it was drawn east-west), with the one step at its south end (the front), the mini fridge at its north end and the TV + mirror wall behind it, facing south toward the shop.
   - The walkway, the step and the fridge are real, only their place was wrong.
2. **The front sales desk is added.** It is the checkout counter just north of the front door, about 14 ft wide and 10 ft deep, with angled corners and a walk-through gap at each short end (east and west), the same kind of counter as the back sales desk. The side with the pegboard and snack racks faces south, toward the front door. It sits about 17 ft north of the front wall and about 4.4 ft east of the arch wall. Its south side, its two ends and its width match the rectangle you drew on the map to within about half a foot. Its back (north) side and its depth are less sure (see below).
3. **The 10 ft "cedar desk" is removed.** It was a double of Felix's two wood counters.

## Fairly sure

4. **The "corridor wall (GOOD STUFF board)" at y 43.8 does not exist.** The GOOD STUFF board hangs on the arch wall, so that item is now a thin cedar layer on the east face of the arch wall, next to Felix's desk.
5. **The strap isle is now 12 ft long** (you approved this). It hangs on the west face of the grey cubicle panels, facing west toward the front desk, starting at the timber post by the cubicle entrance and running north for 12 ft. Side-to-side it sits about 2 ft further west on the map than your mark, because the laser scan puts the grey panels about 2 ft west of where the map draws the cubicles. Along the panels (north-south) it is only good to about 3 ft.

## Less sure

6. **The Buck knife stand moved** from the cubicle wall to about 6 ft north of the front desk's north-east corner, where your photos show it. It has wheels and is not in every photo, so this is only where it stood that day (it could be 4 to 5 ft further west).

## One disagreement we could not settle from photos (questions 2 and 3)

Standing in the east gap of the desk and looking east (photo 7, arrow 7), the open entrance into the cubicle area is straight ahead. But on the map, the laser scan puts that entrance about 1 to 1.5 steps (3 to 4 ft) north of the line of the desk's east gap. Either the desk is deeper than we drew it (maybe 5 steps instead of 4), or the cubicle entrance is a little further south than the scan says. The picture shows both ideas (a dotted outline for the deeper desk, a blue bar for the scan's entrance). Your answers to questions 2 and 3 settle it. Until then, the desk keeps the size you sketched and the strap isle keeps your mark.

## Looked at, not changed (a note was added on each item, and some are in the questions)

- The raised floor behind Felix's desk starts about 3.5 ft further south than the step really is, so on the map a 3.5 ft strip of "raised floor" lies in front of the step, where the photos show plain floor. Your own sketch made that outline, so I left it and asked you (question 5).
- The cubicle block on the map probably starts about 2 ft too far east (question 4).
- The front door on the map is at x 115 but the photos and the scan suggest its middle is nearer x 110, and the soda coolers on the map would then stand in front of the door (question 1). Both left as they are until you answer.
- The checkout candy spinner is within 2 to 3 ft of where the map draws it (the photo puts it about 1.5 ft east and 2 ft north), so it stays.
- Felix's two counters have a work pocket and a back counter behind them that the map does not draw (only the front counters were measured).
- Things in your photos that are not on the map, not added because they move or are minor: the knife glass case by the post, the Maverick sign, the black bucket gondola, straw-hat racks, a bench, the Tool of the Month sign, the red START HERE sign.
- The back sales desk's corner cuts may be drawn a little too large; not touched.

## Checks done (round 2)

- The draft map passes the map's own data check with both copies of the checker (160 items, no duplicate ids, nothing dropped).
- The map's overlap check shows no new overlap or warning caused by these changes (11 errors and 21 warnings exist before and after, none involve these items).
- The map's own tests: 320 pass with the draft plus two small follow-up files. The old tests expected the old three-desk layout; `test-edits.patch` fixes them. `catalog-followups.patch` points the advisor's "sales desk" at the new front desk (otherwise the advisor would treat Felix's two wood counters as sales desks and its score would drop from 79 to 64).
- Photo 8 (5eb19089) is not the front desk (a hand-tool aisle).
