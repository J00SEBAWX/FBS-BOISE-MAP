# Spatial accuracy audit — FBS Boise 3D store map

**Council member:** Claude Opus 5 · **Assigned axis:** spatial accuracy + caveat calibration
**Artifacts audited:** `public/model.pascal.json` (65 nodes), `modeling/layout-spec.json`, `modeling/build-scene.mjs`, `src/*.jsx`, `src/model.js`, `reference/store-reconstruction.md`, `fbs-boise-store-photos.pdf` (55 pp., incl. blueprint pp. 6–8)
**Method:** every geometric claim below was recomputed from the scene JSON, then tested against the drawing sheets rendered at 400 dpi and against the photo pages. Blueprint pages were re-rendered and read visually, not from the extracted text layer. Node ids and `file:line` are exact.

---

### Verdict in one line

The model is honest about being a draft but **wrong about which things are uncertain**. The single most important number in the whole project — where the warehouse ends and retail begins — is documented on the drawings the user already supplied, in two different places, with two different answers, and the model silently picked a third value that appears in neither. Meanwhile several things the app flags as "unconfirmed" are actually well corroborated by the photos.

| Axis | Score | Comment |
|---|---|---|
| Envelope dimensions | 6/10 | 80 ft transverse verified; 180 ft length is a bounding proxy that overstates enclosed floor by 7–14% |
| Warehouse/retail boundary | 3/10 | Undocumented 72 ft chosen; drawings support 50 ft (fire wall) or 100 ft (slab break) |
| Perimeter fidelity | 3/10 | Documented 10-ft south porch and 10-ft NE step are absent; slab modeled as full rectangle |
| Doorway placement | 8/10 | Both customer doors land within a few feet of documented positions; west overhead door is better supported than the notes admit |
| Fixture footprints / aisles | 6/10 | Internally consistent and photo-plausible, but zero of the aisle lengths are derived from a measurable datum |
| Structure completeness | 2/10 | Zero columns, zero windows, zero ceilings, against a documented A–H × 1–5 grid and photos full of columns |
| Locked-item integrity | 4/10 | Two "immovable" sales counters geometrically intersect; the locked stairs contradict the only drawing that shows stairs |
| Caveat calibration | 5/10 | Caveats are ever-present but uniform, so they carry no information; confidence tiering is dead code |

---

### 1. The 180 vs 169 ft "unresolved conflict" is mostly resolvable, and the app should stop calling it unresolved

`modeling/layout-spec.json` limitation 1 and `src/App.jsx:287` both present the length as an open contradiction: *"The cover dimensions and the apparent drawing bay totals conflict."* Reading the foundation plan (PDF p. 6) at 400 dpi resolves most of it:

- Grid A→B→C→D→E are dimensioned **25'-0" each** → grid E sits at exactly **100 ft** from the west datum.
- Grid E→F, F→G, G→H are dimensioned **23'-0" each** → grid H sits at **169 ft**.
- The dimension leader at H carries the annotation **"(VERIFY)"** — the drafter flagged that tie-in himself, which is exactly what you expect where new footings meet an existing building.
- PDF p. 8 (Ground Level Floor Plan) labels the east end of the sheet **"ALIGN WITH CORNER OF EXISTING BUILDING"** and **"ALIGN WITH FACE OF EXISTING COLUMN."**

So 169 ft is the extent of the *new footing work* and ~11 ft of pre-existing east structure lies beyond H. 180 ft is a defensible outside dimension. This is not an irreconcilable conflict; it is a new-work chain plus an existing tie-in. **Impact:** the app's headline uncertainty is overstated, which trains the audience to discount every other caveat.

### 2. The warehouse boundary is the project's core number and the model invented it

Three anchors exist. The model uses none of them.

| Source | Boundary | Warehouse area |
|---|---|---|
| PDF p. 1 cover text: *"West 100 ft is warehouse (5 in slab). East 80 ft is retail (4 in slab)"* — corroborated on p. 6 by the **5" CONC SLAB w/ 6×6 W2.9×W2.9 WWF** callout west of grid E and **4" CONC SLAB w/ 6×6 W1.4×W1.4** east of it | x = 100 ft | 8,000 sq ft |
| PDF p. 8: the heavy **2-HOUR (U.B.C.) AREA SEPARATION WALL, 1¾ × 14" MICRO-LAM AT 16" O.C. TYPICAL AT ROOMS 101 AND 102**, drawn on grid **C** (with a 4'-1½" offset dimension at C) separating **WAREHOUSE [101]** from **SALES [102]**, with **"FIRE SHUTTER ABOVE AS SPECIFIED"** at its opening | x ≈ 50–54 ft | ~4,000 sq ft |
| The model: `wall_c92no990pqfb07vg` and `wall_0xxqlboxmlj30wyh`, both at x = 72 ft; `zone_4o0w03cajcw7q9wt` = 0–72 × 0–80 | x = 72 ft | 5,760 sq ft |

The two documents are not actually contradicting each other — they are answering different questions. **100 ft is a slab-pour boundary** (warehouse-grade 5" slab with heavier mesh, poured where forklifts and banded units land). **~50 ft is the fire-rated room boundary** between the warehouse occupancy and the sales occupancy. The model conflates them and then splits the difference without saying so. `layout-spec.json` limitation 3 calls W=72 a *"chosen working control line… not an inferred measurement"*, and limitation 1 implies the only rival anchor is the length dispute. Neither the spec nor the app ever tells the viewer that the drawings contain **two** explicit department boundaries, or that the true convertible area is somewhere in a **4,000–8,000 sq ft** band.

This matters more than anything else in the audit, because the entire remodel premise is *"we are going to utilize the warehouse on the far west side for merchandise."* The first question any manager asks is **"how much square footage do we gain?"** The app currently displays no area figure at all — safe, but it also means the deck can't answer the question, and the honest answer (a factor-of-two range, resolvable by one tape measure or one legible photo of the p. 8 title block) is far more persuasive than a silent 72.

### 3. Under the cover's own 100-ft reading, the locked Tom's desk sits inside the warehouse

If the reviewer accepts the cover text the app quotes on its own PDF page 1, these modeled retail features fall west of x = 100 and therefore inside the warehouse:

- `item_0g370i78k5r4yhlh` tom-a (X 75.5–82.5) and `item_ouhxad6ialy1j6i9` tom-b (X 75.5–82.5) — **the locked, explicitly-immovable Tom's desk, 18–25 ft inside the warehouse line**
- `item_23lagxybkct4t04w` simpson (X 74–76), `item_xr6wwhyhq0dbic4o` / `item_vxsmrpz6dxyecnwp` hand-tools-a/b (X 90–118, straddling), `item_fkiav3vhs1t1upj0` dewalt (X 91–107, straddling), `item_zzz`-class gondolas hardware-longtools (X 86.2–89.8) and hardware-ppe (X 97.2–100.8), sample-timbertech (X 84–96), hi-vis (X 85–89), `item_3k3ztw7cz10ez2cs` low-header (starts x = 72), `item_c67x8sen3n2xee2z` warehouse-header (x = 72), low-pier-a (X 91.4–92.6)

Because the user's own hard constraint is *"the only things that cannot be moved are the sales desks, Tom's desk and the walls,"* an error in the boundary propagates straight into the credibility of the locked layer. Either the boundary is ~72 ft (and the cover text on page 1 of the reference PDF is wrong), or Tom's desk is 20 ft into the warehouse. The app never surfaces the choice.

### 4. The perimeter is a rectangle where the drawing shows two significant notches

`slab` polygon is the full rectangle `[[0,0],[54.864,0],[54.864,24.384],[0,24.384]]` (= 180 × 80 ft), and the four envelope walls (`wall_3gu3vvpqifyxswhc` N, `wall_wrsh86qmwp1i9uii` E, `wall_xzj9acqsuomkcytn` S, `wall_yw4fyadly7ztfpxf` W) trace it exactly. PDF p. 6 shows otherwise on the east half:

- **South side, grid E→H:** the enclosed wall is recessed roughly **10'-0"** north of the outer pier line, with freestanding piers on the outer line and the notes **"TOP OF CONC PIER TO BE RAISED 1'-0" ABOVE SIDEWALK"** and **"RAISE WING WALL 1'-0" ABOVE SIDEWALK."** That is a ~10 ft × ~69 ft covered entry porch/canopy, ~690 sq ft, visible in the aerial (PDF p. 2) as the awning over the storefront.
- **Northeast corner:** the perimeter steps **~10'-0"** in, near grid G–H, with a 4'-2" offset dimension at the step. Another ~230 sq ft.

Net effect: enclosed floor is roughly **12,600–13,500 sq ft**, not 14,400. The app's badge says *"180 × 80 ft / Working envelope, not net area"* (`src/App.jsx:274`), which is technically true but understates the size of the error: **the model overstates usable floor by 7–14%, and it places fixtures in space that is outdoor porch.** Specifically the front-store beverage fixture (center 176, 73; X 173.5–178.5, Z 71.8–74.2) and the southeast reach of `zone_gbmxdjqxcs21eety` (150–180 × 0–80) extend into the region the drawing shows as porch or as beyond-H existing structure.

### 5. Things the model gets right that the app under-claims

Good calibration cuts both ways. These are better supported than "Estimated position" implies:

- **`door_6d5n5fy6otyd40qv` front customer entrance**, south wall, wall-local 15 → global **x = 165 ft**. PDF p. 8 places **FOYER [105]** with **COATS** and **DISPATCH [106]** at the grid-H end of the sheet, on the same side as the parking/storefront. Grid H = 169 ft. A front door at 165 ft on the south wall is within a few feet of the drawn foyer, and matches the cover's *"main entrance beside the soda station"* and the aerial's awning position (p. 2). This is drawing-grade, not estimated.
- **`door_gi0kjsmpviods5lm` yard/will-call door**, north wall, x = 141 ft. Cover: *"yard doors beside the Milwaukee wall."* `item_493hhcnag0sydn9z` milwaukee-wall spans X 112–136 on the north wall. Adjacency holds, and the aerial confirms **yard to the north**. Photo-grade.
- **`door_8a26n2ddnff9z2ib` warehouse loading door**, west wall, global z = 48 ft, 12 × 12 ft. The notes treat this as weakly supported. It is stronger than that: PDF p. 18 shows a **glazed overhead sectional door** with a **caged roof-access ladder climbing the wall immediately beside it**, and PDF p. 8 carries the note **"INSTALL SALVAGED ROOF ACCESS LADDER, VERIFY EXACT LOCATION WITH OWNER"** in the far-west A–B bay. Ladder plus overhead door plus far-west bay is a three-way match for a west-wall door. A second coiled overhead door appears in p. 9.
- **`item_jzsmzc1ulz7lsbq9` sales-post** (123, 39), 1.25 ft square, h 18 ft. PDF p. 33 shows a substantial **round column standing immediately beside the sales-desk cluster**. Correct in existence and location; wrong in shape (see §6).
- **Transverse grid.** p. 6 dimensions the 80 ft as 10/10/20/20/10/10 with grid lines 1, 3, 5 labeled, i.e. **column lines at z = 0/20/40/60/80**. Nothing in the model contradicts this — but nothing in the model uses it either.

### 6. Missing structure is the biggest visual-quality gap

The user's ask is *"a true detailed model with real functionality"* and *"presentation is key with accuracy and visual quality."* Three whole classes of geometry are absent:

- **Columns: zero.** The drawings define an A–H × 1–5 grid, i.e. roughly **18 interior columns** at x ≈ 25/50/75/100/123/146 × z = 20/40/60. p. 8 annotates **6×6 POST** at multiple interior intersections. The photos make columns the single most visually dominant interior feature: square timber posts mid-aisle in pp. 10, 14, 40, 41; round painted columns in pp. 34, 35, 36, 37; the sales-desk column in p. 33. The scene contains exactly one column-like node (`item_jzsmzc1ulz7lsbq9`) plus four 9-ft `low-pier-a/b/c/d`. A 3D walkthrough with no columns will read as a game level, not as this store — and columns are precisely what constrains where a rack can go, so their absence quietly invalidates every rearrangement the tool proposes.
- **Windows: zero window nodes.** pp. 34 and 35 clearly show a **wood-framed interior window/transom high on the old-store wall** (with a mounted plaque beside it); p. 12 shows a large **louvered opening** high on a warehouse wall. The east wood-arch wall line (`wall_yinq1lg4xerv72d8`, `wall_1v7y5sknvwab6swp`, `wall_ois5su95v3cd3fme` at x = 150) is the old exterior facade, and it is currently a blank slab.
- **Ceilings: none, anywhere.** `modeling/build-scene.mjs:74` sets `createCeiling:false`; zone `ceilingHeight` is left at the 2.7 m default for all four zones and is never read by the app. Yet the two-ceiling condition is one of the store's defining spatial facts — pp. 26–31, 33, 43–48 show a **suspended lay-in tile grid with recessed troffers, pendant globes and ceiling fans** over the aisles, versus the **tall open-structure volume** at the counter and arches (pp. 32, 33, 49). The story survives only as `item_3k3ztw7cz10ez2cs` low-header, a 78 ft × 0.8 ft × 3 ft beam floating at y = 9 with a 6-ft void above it. In a 3D pitch that reads as a bug, not as a soffit.

### 7. Locked-layer defects

- **Two "immovable" sales counters intersect.** `item_0xs9qbvqg674ibdx` sales-n (X 116–130, Z 32.8–35.2) and `item_p1lq2af9zbnx781c` sales-e (X 128.8–131.2, Z 34.5–41.5) overlap by **1.25 × 0.75 ft**. These are the exact fixtures the user named as unmovable ground truth; a visible intersection in the one part of the model that is supposed to be certain is disproportionately damaging. The app's own overlap checker will flag it live in front of an audience (`src/App.jsx:89`).
- **`item_c67x8sen3n2xee2z` low-header grazes tom-a.** low-header spans z 44.6–45.4 at y = 9; `item_0g370i78k5r4yhlh` tom-a reaches z 44.5. `tom-a` and `tom-b` also straddle the S = 45 control line, so the single desk group is split across `zone_859cqtpzhmy7ioch` and `zone_dzaddprickjv7i74`.
- **`item_b7tque6tpdk1u0ae` warehouse-stairs is a locked placeholder that contradicts the only drawing showing stairs.** Its own note admits *"exact location… unverified. Simplified placeholder."* It sits at (6, 63), i.e. the far-west end. p. 8 draws stairs with **"STAIRS Rs = 6 13/16", T = 11", HANDRAIL"** and **"REMOVE EXISTING STAIRS, STRINGERS, ECT."** hard against the grid-C separation wall near mid-depth, ~45 ft east and ~45 ft across from the modeled position, and draws a second **"EXISTING STAIRS Rs = 11, T = 11"** near grid G. Photo p. 9 shows a stair against a wood-panelled wall in the same frame as an overhead door. A placeholder is fine; a **locked** placeholder that the user cannot drag is not.
- **Scale-validation inconsistency:** `src/model.js:71` rejects any fixture dimension over 22 m (72 ft), so the scene's own 78-ft low-header would fail `validateFixture`. It survives only because locked nodes bypass validation (`src/model.js:201-204`, `:244`). The rule and the data disagree.

### 8. The flagship scenario is hollow

`src/App.jsx:187-193` and `:301-303` present "Try warehouse expansion" as the payoff. Only **5 of 45 nodes carry a `proposedPosition`**: hand-tools-a → (34, 56), hand-tools-b → (34, 65), dewalt → (54, 34), hardware-longtools → (58, 62), hardware-adhesives → (62, 18). **Zero warehouse racks move.** `item_igqmm5brf5ljgp3g` warehouse-rack-a (X 12–44, Z 8–12), rack-b (X 12–44, Z 23–27) and rack-c (X 16–40, Z 41–45) stay exactly where they are, so the proposed hand-tool runs at x = 34 land in the same bays the racks occupy in Z-adjacent rows, and the "new merchandising floor" is a warehouse still full of pallet racking. Of 29 movable fixtures, 24 don't move. For a vision-selling tool, that is the difference between a before/after and a nudge.

### 9. Caveat calibration: present everywhere, informative nowhere

The app is well-stocked with hedges: the persistent *"Reference draft · positions need confirmation"* banner (`src/App.jsx:261`), the *"Working envelope, not net area"* badge (`:274`), *"180 ft · draft envelope"* on both views (`src/FloorPlan.jsx:111`, `src/Scene3D.jsx:110`), the About text (`:287`), the coarse-overlap disclaimer (`:289`), the locked-item note (`:69`), and a Reference-notes tab with per-item photo-page chips (`:91-96`). Tone is right. Resolution is wrong.

- **Confidence tiering is dead code.** `modeling/build-scene.mjs:41` hardcodes `confidence:'estimated'` for every single node. `src/App.jsx:68` branches to *"Drawing reference"* and *"Photo referenced"* — neither branch can ever execute. So the Milwaukee wall (named in the cover text, visible in photos, adjacent to a documented door) and the admitted-placeholder stairs both read **"Estimated position."** A caveat that never varies is decoration; the viewer learns to ignore it, which is worse than no caveat, because the two genuinely soft numbers (warehouse boundary, stair location) get no extra weight.
- **The wrong claim is flagged as the headline uncertainty.** The length (§1) is largely resolvable; the department boundary (§2) is a factor-of-two unknown and is described in the same breath as the mild one.
- **Under-caveated silently:** the porch and NE step (§4) are not mentioned at all; "not net area" does not tell a viewer that fixtures may be sitting outdoors. Zero columns is not disclosed anywhere, even though it is the largest single deviation from the photos.
- **No calibration path exists**, contrary to the handoff recommendation in `reference/store-reconstruction.md` that provisional coordinates get a dedicated correction operation. **16 nodes are locked**, including the placeholder stairs, the four low piers, both headers, and the front counter — a much longer list than the user's own immovable set (walls, sales desks, Tom's desk). A sales rep who walks the floor with a tape measure cannot enter what he learns.
- **The highest-value unread datum is already in the user's possession.** The p. 8 title block contains an **AREAS schedule with four rows and four square-foot figures** (lunch/local, SALES, WAREHOUSE, TOTAL). At the supplied capture resolution (the embedded image is 844 × 1500 px, and the sheet was photographed at an angle) the digits are illegible even at 6× upsampling. One straight-on phone photo of that ~4-inch block would replace the entire 4,000–8,000 sq ft range with the architect's own numbers.

Grounding note: the store is at **11700 W Franklin Rd, Boise** ([Franklin Building Supply locations](https://franklinbuildingsupply.com/locations)), described by the company as being **"on Franklin Road between Five Mile and Cloverdale"** ([FBS Boise](https://franklinbuildingsupply.com/locations/boise)). Franklin Rd runs east–west, so a south storefront with parking toward the road and a lumber yard behind it to the north — the arrangement in the aerial on PDF p. 2 and the one the model encodes — is consistent with the real site.

---

## Fix before delivery, in priority order

1. **Expose the warehouse boundary as a documented range, not a silent 72.** Add a control that snaps the divider to **x = 50 ft (p. 8 fire wall, ~4,000 sq ft)**, **x = 72 ft (current working line, 5,760)**, and **x = 100 ft (p. 6 slab break, 8,000)**, with the citation printed next to each. Show live zone areas. This converts the audit's worst finding into the app's best feature.
2. **Get a legible photo of the p. 8 AREAS schedule** before the presentation. It likely ends the argument outright.
3. **Fix the sales-n × sales-e overlap** (1.25 × 0.75 ft). Locked geometry must be clean; the live overlap checker will otherwise indict the model in front of the audience.
4. **Add the ~18 grid columns** at x ≈ 25/50/75/100/123/146 × z = 20/40/60. Highest visual-credibility return per unit of work, and it makes every rearrangement physically meaningful.
5. **Make confidence real.** Replace the hardcoded `'estimated'` at `modeling/build-scene.mjs:41` with per-node values so the two dead branches at `src/App.jsx:68` light up: `drawing` for the envelope, both customer doors, the transverse grid; `observed` for the Milwaukee wall, sales cluster, sample walls, arches; `estimated` for everything else.
6. **Model the south porch and NE step**, or state the enclosed-area range (~12,600–13,500 sq ft) beside the 14,400 figure, and pull the beverage fixture and the front-store zone edge back inside the enclosed line.
7. **Unlock `item_b7tque6tpdk1u0ae` warehouse-stairs** and relabel it as a placeholder, or relocate it to the p. 8 candidate near grid C. Do not ship a locked guess.
8. **Deepen the expansion scenario** to move the warehouse racks. Twenty-four of 29 movable fixtures standing still is not a before/after.
9. **Add ceilings as real geometry** — a tile-grid plane at ~9 ft over the aisle zone and open structure over the counter volume — so the low/high transition reads as architecture instead of a floating beam.
10. **Add a calibration mode**: let the user type a measured dimension on site and re-anchor, per the handoff note. Also reconcile the 22 m cap at `src/model.js:71` with the 78-ft header.
11. **Add windows** on the x = 150 old-store wall (pp. 34, 35) and the high louvered opening (p. 12).
12. **Rewrite the About text** at `src/App.jsx:287`: retire "length is unresolved" (it is a 169 ft new-work chain plus ~11 ft of existing tie-in, with "(VERIFY)" written on the drawing at grid H) and promote the department boundary to the headline uncertainty.
13. **Tie fixtures to the store's existing aisle numbering.** Photos pp. 36–37 show live aisle signage (e.g. **"3B DRILL BITS"**). Matching the model's labels to signage the crew already uses is the cheapest possible credibility win for an organization pitch.

---

**Sources inside this report:** all blueprint readings from `fbs-boise-store-photos.pdf` pp. 6–8 rendered at 400 dpi from the project file at `projects/fbs-map-UDEjwEPFTx6OFs1.XgiSKA/files/fbs-boise-store-photos.pdf`; photo observations from the same file, pp. 2, 9, 10, 12, 14, 16, 18, 26–37, 38–49; store location from [Franklin Building Supply locations](https://franklinbuildingsupply.com/locations) and [FBS Boise store page](https://franklinbuildingsupply.com/locations/boise). Rendered blueprint crops used for the readings are preserved at `/home/user/workspace/pdfpages/` (`plan6_A.png`, `plan6_B.png`, `hi-08_A.png`, `hi-08_B.png`, `p8_zoomC.png`, `p8_areas3.png`, `warehouse_sheet.png`).
