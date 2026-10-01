# FBS Boise Blender map: build notes (v10, Sep 28, 2026)

## Newest: v10 = photo-matched pass + realistic Jerry (Sep 28, 2026)
- Built from AJ's 40 Word-doc photos + the walkthrough video (every 2 s = 52 frames). Local copies on his laptop: `Documents\FBS Store Map\reference photos (Word doc)\` and `...\reference photos (video)\`; texture crops in `textures v10\`.
- **Fixes found by comparing renders to photos:**
  - Every product box was double-darkened (glTF import multiplied each packaging photo by its average colour) -> products now show true packaging colours.
  - All photo-textured signs/banners were mirrored (UVs) -> fixed.
  - Colour: white balance 4400 K in the file (like a phone camera), so floors read grey, walls cream, ceilings white.
- **Added from photos:** real ceilings (2x4/2x2 tile grid, dome pendants, ceiling fans, track lights, galvanised ducts, skylights, drop ceiling + troffers over the south aisles with a soffit); knotty-pine paneling in the front rooms; tan stained-concrete front floor, grey sealed concrete elsewhere; framed B&W logging photos + antique tool plaques on the north wall; TRY IT BUY IT and CURIOUS banners; FBS flag buckets on the ledge above the air-tools wall; shadow boxes, Occidental Leather logo and evolution-of-the-hammer sign on the soffit (placed from photos 22–24); aisle signs 3A/3B/4A; START HERE LED sign (black back); front desk (SDF) with beige laminate top, snack pegboard outside (photo 39) and walnut drawers inside (photo 35); Makita gondola shows drills/grinders/saws hanging on teal pegboard instead of shelves of boxes; warehouse cedar-plank laser wall with tripods and red cases, lumber pergola display, yellow safety lines, daylight through the glass roll-up door, warehouse walls carried up to the deck (no gap).
- **Cameras:** CAM 01–08 as before; CAM 09–14 line up with photos 08, 02, 07, 23 (aisle 3A), 35, 39; CAM 15 Jerry at the back desk; CAM 16 Jerry close-up. Portrait cameras carry a custom property `res` = [720, 1280]; render script honours `res` and `exposure`.
- **CURRENT: Jerry v3 (Sep 29) - brand-new stylised character, built from scratch.** AJ: "redo him all together and start from scratch", "don't make Jerry anything like what was already made", then picked *Premium stylized* and "Nothing" stays the same (not the height, glasses, goatee or red polo).
  - Look (my design, all original): ~6'0" (6.06 ft in the store), copper-auburn hair in a soft swept-up quiff with a side part on his left, clean-shaven, big friendly green-hazel eyes, warm closed-mouth smile, light freckles; chambray work shirt (sleeves rolled to the elbow, open collar), heather-grey tee in the V, khaki work trousers, brown leather belt, brown leather work boots; charcoal canvas bib apron (tan leather neck straps, brass rivets, contrast stitching, 3-pocket front with a pencil + small notepad, waist ties with a bow at the back) and a white name tag reading JERRY. Style = modern animated-film, not photo-real (deliberate, to avoid the "gross" uncanny look of v1/v2).
  - How: every part is sculpted as signed-distance shapes in numpy (smooth-blended ellipsoids/capsules/boxes) and meshed with marching cubes (skimage); hair/brows are hundreds of tapered clumps with carved strand grooves; apron is a fitted sheet computed from the real shirt/trouser surfaces (never inside them; hangs straight below the chest, cinched at the ties). Blender side: `jerry3/j3lib.py` builds materials (SSS skin with painted blush/lips/freckles, painted eyes + glossy cornea, anisotropic hair using the clump flow, canvas with stitching) and assembles him.
  - In the store: empty **"Jerry - move me (6ft)"** at (86.3, 43.6), rot z 100 deg, scale 3.28084 (he is modelled in metres). Collision check = no overlaps, feet at z 0. Jerry-only fill + rim lights (light linking). Eyes aimed at CAM 16 for eye contact. CAM 16/17 re-aimed for his height.
  - File-size: sculpt meshes are decimated to ~200k verts (targets in `place_jerry3.py`) + plain Catmull-Clark at render. **Gotcha:** Blender 5.0 subdivision with "Use Limit Surface" on (default) ate ~1-2 GB per object and got the render OOM-killed -> set `use_limit_surface=False, quality=1`.
  - Scripts (jerry3/): `sdf.py` (kit), `head.py`, `hair.py` (hair, brows, lashes), `body.py` (shirt, tee, trousers, belt, boots, forearms+hands), `apron.py`, `j3lib.py`; then `place_jerry3.py` (store + standalone), `render_v10.py`. Full code in `claude/fbs-jerry-v3-pipeline.md`.
  - Delivered Sep 29 to `Documents\FBS Store Map\`: `FBS Boise Store Map v10.blend` (Jerry v3 inside), `Jerry v3 (stylised).blend`, renders CAM 02/03/15/16/17 in `FBS map v10 renders\` + `Jerry v3 vs earlier Jerrys.jpg`.
- **History - Jerry v2 (Sep 28 late, replaces the MPFB Jerry):** AJ said the first realistic Jerry "needs to be way better". Rebuilt on **MB-Lab** (free AGPL add-on, github.com/animate1978/MB-Lab, runs headless in Blender 5.0 as legacy add-on `MB_Lab`): real skin texture set (albedo, 4K bump, roughness), textured eyes, teeth, eyelash cards. Caucasian male m_ca01, phenotype euromediterranean, preset type_normobody, age 0.2, mass 0.05, tone 0.1, longer legs, slight friendly smile (shape keys Expressions_mouthSmile_max 0.42, eyeSquint 0.22). Pose = MB-Lab standing_in_lab with level head, head turned 6 deg, soft elbows. Baked static and scaled to 6'3" (feet).
  - MB-Lab's own skin node group renders far too dark under the store's overhead lights -> skin uses a plain Principled BSDF fed by the MB-Lab textures (+ my scalp/stubble masks).
  - Groom: ~79k real hair strands (clumped, side part, combed back, soft hairline), strand eyebrows, short goatee with soft edges, scalp + stubble shading in the albedo.
  - Clothes: red pique polo (collar, placket, 2 buttons, short sleeves) and charcoal twill trousers settled with Blender cloth simulation against his body (real drape/folds), clean belt ring + steel buckle, black leather shoes with rubber soles.
  - In the store: parented to the empty **"Jerry (realistic, 6ft 3in) - move me"** at (86.3, 43.6), facing the square arch; collision check = no overlaps, feet at z 0. A soft fill light (light-linked to Jerry only) keeps his eyes readable under the top-down store lights. Cameras CAM 15 (back desk), CAM 16 (close-up, 720x900), CAM 17 (waist-up 3/4).
  - Delivered Sep 29 to `Documents\FBS Store Map\`: updated `FBS Boise Store Map v10.blend` (Jerry v2 inside, slimmed to 19.6 MB with JPEG-packed textures because device transfers cap at 20 MB), `Jerry realistic v2 (6ft 3in).blend`, new renders CAM 02/03/15/16/17 + `Jerry before vs after.jpg`.
  - **Clean-cut pass (Sep 29):** AJ found v2 "gross" and asked for a cartoon/TV-character lookalike (declined: copyrighted characters and a real actor's likeness). He chose an original, clean-cut real look: short tidy dark-brown crop (no slick), neater fuller goatee, warmer smile (mouthSmile 0.62, eyeSquint 0.3), younger/fuller healthier face (age 0.1, mass 0.15, cheeks 0.46, jaw 0.55), less-grey skin (saturation 0.72), plus a rim light linked to Jerry only. Re-delivered both .blend files, CAM 02/03/15/16/17 and `Jerry clean-cut before vs after.jpg`.
  - Honest limits: still reads as high-quality CG up close, not a photo; brows a bit heavy/dark; goatee side connections slightly thin. Next easy tweaks if asked: lighter/thinner brows, fuller goatee sides.
  - Scripts: `jerry2/mb_a.py` (MB-Lab create + finalize), `jerry2/build_b1.py` (pose/expression/bake/scale), `jerry2/build_b2.py` (skin, hair, brows, goatee, glasses), `jerry2/build_b3.py` (cloth-sim clothes, belt, shoes), `add_jerry2.py` (into the store).
- Delivered Sep 28 to AJ's `Documents\FBS Store Map\`: `FBS Boise Store Map v10.blend`, `Jerry realistic (6ft 3in).blend`, `FBS map v10 renders\` (16 views at 1920x1080 + `Photo vs render comparison.jpg`).
- Known gaps vs photos: Makita tools are simple shapes; warehouse is emptier than photo 02 (no carts/ladders/DeWalt displays). Jerry v3 is intentionally stylised (animated-film look).
- Pipeline: `upgrade_v10.py` (v9 -> v10), `jerry/build_jerry.py` + `jerry/jerry_stage2.py` (Jerry), `add_jerry.py` (puts Jerry in v10), `render_v10.py`, `compare.py` (photo vs render sheets). All in `claude/fbs-blender-pipeline.md`.

## Open questions for AJ
- Photo 23 looks like it was taken 8–10 ft back from the aisle ends, but the plan has only ~3 ft between the back sales desk (SDB) and the soffit/aisle ends (SDB centre y 40.5). Is the SDB further north than the plan shows?
- Still open from before: the 50' SDB figure, laser deck 27'6" vs ~12 ft, where the white door leads, desk tape-measure numbers.

## v8 / v9 (Sep 27–28, 2026)
- **v8** = the game's saved layout (`layouts/main`, 87 pieces) as an editable Blender file: one object per fixture (products merged in), named "NAME [id]", custom properties fbs_id / fbs_type / fbs_brand / fbs_w / fbs_d / fbs_h. 1 Blender unit = 1 ft.
  - Collections: 1 Fixed (locked), 2 Floors/zones/stairs, 3 Fixtures (movable), 4 Ceilings (render only), 5 People (Jerry), 6 Cameras + lights, 7 Signs + decor (v10).
- **v9** = high-end pass: weld + bevel on everything, polished concrete, wood grain, real glass, pegboard holes, packaging on all product faces, troffers, real stairs, cove base.
- Gotchas: new meshes need a white "Color" attribute (imported paints multiply by it); glTF importer rescales by unit scale (import first, then set feet); r128 GLTFExporter duplicates faces on multi-material meshes.

## Game physics (artifact version 6, Sep 28)
- Collision existed already; added camera collision (no seeing through walls) and step-up onto the laser deck. Verified headless.

## Laptop Blender link (MCP)
- Official Blender Lab MCP connector is set up but every call times out (60 s) as of Sep 28 evening. The community "MCP for Blender" add-on (from my earlier wrong `uvx blender-mcp` steps) grabs the same port 9876 — untick it, restart Claude desktop + Blender.
- Material Preview on this scene froze his Blender: keep his viewport in Solid; render in the cloud.

## Store game: "FBS Boise Store Walk"
- Private artifact (https://claude.ai/artifact/K16yRf2hubwcR3wLs1Sh91): 2D plan editor + 3D walk with Jerry; AJ's saved layout = page database `layouts/main`.
- Confirmed by AJ: both sales desks are octagons, staff openings east + west.
- Free tools only ("do NOT buy anything").

## Key layout (feet)
- Warehouse x 0–50; grid-C wall x 50 with wide opening y 48.5–68.5 and Milwaukee doorway y 71–77.5; laser deck x 43.6–49.6, y 36.3–48.3.
- Arch wall x 103 (Arch 1 y 20.4–28.8, Arch 2 y 31.2–39.3, square arch y 41.6–45.7, air guns y 46.2–76.2, white door y 76.3–79.3).
- South aisles: gondolas i55 paint (x 56.5–60.5), i56 saw blades (x 64.8–68.8, signs 4A/3B), i57 nails/screws (x 73.5–77.5, sign 3A), i58 Occidental bags (x 84–88); soffit at y 33, drop ceiling south of it.
- SDB octagon centre (76.5, 40.5) 15'5" x 10'; SDF octagon centre (117, 29) 20 x 10; front door x 112–118 on the south wall.
