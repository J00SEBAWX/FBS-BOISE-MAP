# Store measurements: scan, photo survey and the owner's blueprint

How the store map's numbers were checked against the Polycam 3D scan and the owner's marked-up original building
drawing (9 Oct 2026). Read in this order:

| File | What it is |
|---|---|
| `RECONCILIATION.md` | The first comparison of the scan with the photo survey: how the scan was lined up, every change, the status of every wall, door and column, and the questions to check in the store. The independent check's corrections are applied. |
| `VERIFY.md` | The independent re-check of that comparison (recomputed with separate scripts). |
| `SCAN-AUDIT.md` | The owner-requested clean-up: the photos are the source of truth, so every scanner furniture guess (tables, chairs, "bed", "fridge"...) and every phantom wall was deleted, and four scan-only map changes went back to the photo numbers. |
| `SCAN-AUDIT-VERIFY.md` | The independent check of the clean-up. |
| `BLUEPRINT-RECON.md` | The owner's marked-up original "Ground Level FLOOR PLAN" lined up with the map: what his marks confirmed, what changed (the walls and doors behind the cedar desk, Von's partition, the laser deck, the 1-step floor, the porch piers, the north-east back room, the will-call doors), and the current tape-measure list. This is the newest list of open questions. |
| `BP-VERIFY.md` | The independent check of the blueprint step (its own calibration of the drawing, every change tested against the evidence rules, the fixes it made). Section 7 lists app issues that have since been fixed. |
| `scan-over-master-top.png` | The cleaned scan (purple) over the master map straight from above, rendered after the clean-up and before the blueprint step (so the will-call doors, Von's partition and the walls behind the cedar desk are as they were then). The site's 3D view with the scan set to Ghost shows the current state. |

The blueprint photo itself stays private: it is not in this repository, and the renders and working files the two
blueprint reports mention (`bp/...`, `verify/...`) were scratch files that are not kept here either.

What the site uses (all served only to signed-in people):

- `public/data/master.json` - the master layout, the one and only copy (`version` names the step it came from;
  the database will be seeded from this same file later). Items the scan or the blueprint changed carry `src`;
  numbers still to tape-measure carry `toConfirm` (shown in the map's details card).
- `public/data/scan.glb` - the cleaned scan: the scanned walls, corner posts and doors that the photos, the
  documentation or the owner's drawing confirm (47 pieces), already in the map's 3D frame (feet). No scanner
  furniture, floor or ceiling guesses.
- `public/data/scan-overlay.json` - the same kept scan walls and doors as plan lines (the Plan view's "Scan lines" layer).

Units everywhere: feet; x runs east from the inside of the west (warehouse) wall, y runs north from the inside of
the south wall; the building is 169 ft x 80 ft.
