// FBS Boise default catalog: the 10 departments (OWNER RULES v3.1 names and keys), their subcategories,
// colours, starting sizes, adjacency, entry anchors and thresholds, plus the product -> department map.
// GENERATED from the verified catalog (catalog.verified.json + product-map.verified.json, catalog-2026-10-09-reviewed).
// Pure ES module, no imports. The Worker uses src/shared/catalog.js; the browser loads public/js/shared/catalog.js.
// The two files must stay byte-identical (a test checks it): edit both, or regenerate both.

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export const CATALOG = deepFreeze({
  "version": "catalog-2026-10-09-reviewed",
  "title": "FBS Boise default departments (verified)",
  "families": {
    "tools": {
      "label": "Tools",
      "note": "Power, cutting, hand and air tools"
    },
    "jobsite": {
      "label": "Jobsite",
      "note": "Safety, workwear, access and jobsite gear"
    },
    "building": {
      "label": "Building materials",
      "note": "Fasteners, hardware, woodworking and millwork"
    },
    "finish": {
      "label": "Finishing & outdoor",
      "note": "Paint, stain, decking and outdoor living"
    }
  },
  "customFamily": "custom",
  "areas": [
    {
      "key": "hand_tools",
      "order": 1,
      "name": "Hand Tools & Measuring",
      "family": "tools",
      "color": "#4449C6",
      "colorDark": "#7E8EF4",
      "token": "cat-07",
      "size": [
        25,
        8
      ],
      "targetSqft": 200,
      "sqft": [
        120,
        360
      ],
      "adjacency": [
        "power_tools",
        "safety_workwear",
        "hardware_fasteners"
      ],
      "entry": "sales_desk",
      "placement": "showroom",
      "subcats": [
        "Hammers and nail pullers (hammer gondola)",
        "Squares and levels",
        "Tape measures and measuring devices",
        "Pliers and cutters",
        "Nail sets",
        "Chisels and screwdrivers",
        "Plumb bobs (Stanley)",
        "Buck Knives pocket knives (locked case)",
        "Milwaukee hand tools: tapes, knives, pliers (Milwaukee vendor panel)",
        "Utility knives, chalk lines and carpenter pencils (typical - confirm)",
        "Pry bars and wrecking bars (typical - confirm)",
        "Hammer tackers and manual staplers (typical - confirm)",
        "Laser measures and levels, non-platform (typical - confirm)",
        "Trowels, floats and taping knives (typical - confirm)"
      ],
      "rules": [
        "Shopped by task: striking, measuring and layout, cutting, prying.",
        "Within sight of a sales desk (owner rule: theft-prone); measuring and layout at eye level on the path to the yard.",
        "Brand hand tools follow the hybrid rule: the Milwaukee hand tool panel stays intact as a brand block here. Replacement utility blades go to Bits, Blades & Cutting Accessories."
      ],
      "notes": "Today: the hand tool / hammer gondola (24'), the Milwaukee hand tool panel by the square arch and the Buck Knives case by the front sales desk.",
      "groups": [],
      "fixtures": [
        "i101",
        "i109",
        "i108"
      ],
      "fixtureSqft": 101
    },
    {
      "key": "safety_workwear",
      "order": 2,
      "name": "Safety & Workwear",
      "family": "jobsite",
      "color": "#60991D",
      "colorDark": "#A5E060",
      "token": "cat-03",
      "size": [
        26,
        20
      ],
      "targetSqft": 520,
      "sqft": [
        300,
        750
      ],
      "adjacency": [
        "hand_tools",
        "access_jobsite"
      ],
      "entry": "yard_doors",
      "placement": "showroom",
      "subcats": [
        "Hard hats (hardhat towers)",
        "Work gloves: leather and hi-vis",
        "Knee pads",
        "Hi-vis shirts and safety apparel",
        "Hi-vis vests (typical - confirm)",
        "Work jackets and workwear (apparel corner)",
        "Work boots (boot lightboxes; Muck Boot Company)",
        "Occidental Leather tool belts, bags and work belts",
        "Safety harnesses (fall protection)",
        "Lanyards, anchors and fall-arrest kits (typical - confirm)",
        "Safety glasses and hearing protection (typical - confirm)",
        "Respirators and dust masks (typical - confirm)",
        "First aid kits for sale (typical - confirm)",
        "Rain gear (typical - confirm)"
      ],
      "rules": [
        "On the path between the yard doors and the tool areas so pros grab gloves, glasses and hi-vis on the way through.",
        "Fall protection (harnesses) lives here with the other PPE; Access & Jobsite gets a sign pointing to it.",
        "The Occidental Leather bag aisle stays together as a brand block inside this department."
      ],
      "notes": "Today: the safety isle (32'6\"), the Occidental bag isle, four hardhat towers, the workwear & apparel corner and two boot lightboxes by the will-call doors. The first aid / AED station is store safety equipment, not merchandise.",
      "groups": [],
      "fixtures": [
        "i51",
        "i58",
        "i74",
        "i75",
        "i76",
        "i77",
        "i97",
        "i95",
        "i96"
      ],
      "fixtureSqft": 239
    },
    {
      "key": "access_jobsite",
      "order": 3,
      "name": "Access & Jobsite Equipment",
      "family": "jobsite",
      "color": "#206F33",
      "colorDark": "#4CB86A",
      "token": "cat-04",
      "size": [
        20,
        24
      ],
      "targetSqft": 480,
      "sqft": [
        250,
        900
      ],
      "adjacency": [
        "safety_workwear",
        "decking_outdoor"
      ],
      "entry": "yard_doors",
      "placement": "warehouse",
      "subcats": [
        "Ladders (ladder wall rack)",
        "Step, extension and multi-position ladders (typical - confirm)",
        "Scaffolding (scaffolding cage)",
        "Pump jack systems",
        "Brooms, push brooms, shovels, long-handle tools (broom wall)",
        "Straps and tie-downs (strap isle)",
        "Tarps and rope (typical - confirm)",
        "Contractor bags and cleanup supplies (typical - confirm)",
        "Sawhorses and work supports (typical - confirm)",
        "Extension cords, power distribution and work lights (typical - confirm)",
        "Shop vacs and dust extraction, non-platform (typical - confirm)",
        "Household and non-platform batteries (typical - confirm)",
        "Jobsite boxes and gang boxes (typical - confirm)",
        "Seasonal endcap: ice melt, heaters, fans (typical - confirm)"
      ],
      "rules": [
        "Bulky stock: keep it by the yard doors or the warehouse roll-up so it loads straight out.",
        "Battery-platform vacs, lights and radios stay with their power-tool brand.",
        "Harnesses live in Safety & Workwear; put a sign here pointing to them."
      ],
      "notes": "Today: the ladder wall rack and the scaffolding cage are in the warehouse, the broom / long-handle wall stands inside the Simpson pergola display's footprint, and the strap isle is in the east front room.",
      "groups": [],
      "fixtures": [
        "ladder_wall",
        "i99",
        "broom_wall",
        "i66"
      ],
      "fixtureSqft": 62
    },
    {
      "key": "hardware_fasteners",
      "order": 4,
      "name": "Hardware & Fasteners",
      "family": "building",
      "color": "#0F9B89",
      "colorDark": "#5ADDC7",
      "token": "cat-05",
      "size": [
        25,
        18
      ],
      "targetSqft": 450,
      "sqft": [
        250,
        700
      ],
      "adjacency": [
        "decking_outdoor",
        "pneumatic_air",
        "woodworking"
      ],
      "entry": "none",
      "placement": "central",
      "subcats": [
        "Simpson Strong-Tie screws (Simpson screw wall)",
        "Simpson Outdoor Accents decorative connectors and screws",
        "Simpson Strong-Tie connectors, hangers and post bases (typical - confirm)",
        "Deck and exterior wood screws (DeckFast tubs on the decking wall)",
        "Misc. screws",
        "Wood, drywall and sheathing screws (typical - confirm)",
        "Boxed nails, hand-drive (bulk nails stay in the warehouse W24-W26)",
        "Hillman hardware and specialty fasteners",
        "Concrete screws and wedge anchors (typical - confirm)",
        "Drywall and hollow-wall anchors (Rocket Anchor)",
        "Loctite threadlockers",
        "Super glue and small-format adhesives (typical - confirm)",
        "Powder-actuated fasteners and loads (typical - confirm)",
        "Building envelope: flashing tape, house-wrap tape, sill seal (typical - confirm)",
        "Hinges, latches, gate and door hardware (typical - confirm)"
      ],
      "rules": [
        "Destination aisle: keep it deep in the store so fastener trips walk past other departments.",
        "Bulk and pallet fasteners stay in the warehouse (W24-W26); the showroom carries boxed and packaged.",
        "Gun nails and staples go to Pneumatic & Air Systems; pocket screws go to Woodworking with Kreg.",
        "Deck screws stay here (the email says so); a small duplicate facing on the decking wall is optional."
      ],
      "notes": "Today: the nail/screw gondola (aisle 3A), the Simpson screw wall and the 6 ft Simpson Strong-Tie Fastening Systems unit beside it (it was 'Simpson Ornamental 13'9\"' by the pergola on Oct 1; the Outdoor Accents boxes now appear on the pergola display's shelving).",
      "groups": [],
      "fixtures": [
        "i57",
        "i62",
        "i64"
      ],
      "fixtureSqft": 141
    },
    {
      "key": "pneumatic_air",
      "order": 5,
      "name": "Pneumatic & Air Systems",
      "family": "tools",
      "color": "#9E197B",
      "colorDark": "#EA66BF",
      "token": "cat-09",
      "size": [
        30,
        8
      ],
      "targetSqft": 240,
      "sqft": [
        120,
        380
      ],
      "adjacency": [
        "power_tools",
        "hardware_fasteners"
      ],
      "entry": "none",
      "placement": "perimeter",
      "subcats": [
        "Air nailers and staplers, all brands (TRY IT BEFORE YOU BUY IT wall)",
        "Framing, finish, brad, roofing and siding nailers (typical - confirm)",
        "Cap staplers (Stinger CS150B)",
        "Cap nailers (typical - confirm)",
        "Crown and narrow-crown staplers and staples (typical - confirm)",
        "Compressors (Rolair compressor rack)",
        "Air hose, fittings and couplers",
        "Air tool oil and lubricants",
        "Misc. nailer and stapler repair parts",
        "Collated gun nails and staples sold by the box (typical - confirm)"
      ],
      "rules": [
        "Every air tool, whatever the brand, lives on the try-it wall so pros can test before buying.",
        "Nailer, collated nails and fittings in one trip: gun nails and staples sit next to the guns (bulk pallets stay in the warehouse W24-W26).",
        "Cordless (battery) nailers stay with their power-tool brand."
      ],
      "notes": "The TRY IT BEFORE YOU BUY IT air-gun wall (with the CURIOUS ABOUT A TOOL banner) is a strong existing feature; the Rolair compressor rack stands in front of its north end.",
      "groups": [],
      "fixtures": [
        "i61",
        "i104"
      ],
      "fixtureSqft": 82
    },
    {
      "key": "power_tools",
      "order": 6,
      "name": "Power Tools",
      "family": "tools",
      "color": "#CD5811",
      "colorDark": "#FC9252",
      "token": "cat-01",
      "size": [
        28,
        25
      ],
      "targetSqft": 700,
      "sqft": [
        450,
        1000
      ],
      "adjacency": [
        "bits_blades",
        "pneumatic_air",
        "hand_tools"
      ],
      "entry": "sales_desk",
      "placement": "showroom",
      "subcats": [
        "Milwaukee M18 / M18 FUEL cordless tools",
        "Milwaukee M12 tools (typical - confirm)",
        "Milwaukee batteries, chargers and kits",
        "Milwaukee PACKOUT storage, organizers and rolling boxes",
        "Milwaukee lasers, tripods and cases (laser deck)",
        "Milwaukee workbench displays",
        "DeWalt cordless tools, batteries and kits",
        "DeWalt green-beam line lasers",
        "DeWalt 20V MAX XR and FLEXVOLT 60V lines (typical - confirm)",
        "DeWalt ToughSystem / TSTAK storage (typical - confirm)",
        "Makita cordless tools: drills, grinders, saws",
        "Makita batteries, chargers and jobsite radios",
        "Makita cases and interlocking storage",
        "Makita cordless blower",
        "Makita 18V LXT and 40V XGT lines (typical - confirm)",
        "Cordless nailers on a battery platform (typical - confirm)",
        "Platform-only accessories (fit one brand's tools) (typical - confirm)"
      ],
      "rules": [
        "Milwaukee, DeWalt and Makita are child groups: a pro on one battery platform finds everything for it in one place.",
        "Batteries, chargers, platform storage (PACKOUT, ToughSystem, MAKPAC), brand lasers and platform-only accessories stay with their brand.",
        "Hybrid accessory rule: universal-fit bits, blades, hole saws and abrasives go to Bits, Blades & Cutting Accessories whatever the brand.",
        "Pneumatic (air) nailers of every brand go to Pneumatic & Air Systems; cordless nailers stay with their battery brand.",
        "Brand vacuums, work lights and radios on a battery platform stay with the brand, not Access & Jobsite.",
        "Milwaukee hand tools (tapes, knives, pliers on the vendor panel) fit any job and no battery, so they sit in Hand Tools & Measuring as an intact Milwaukee block (AJ to confirm)."
      ],
      "notes": "Group shares follow today's shelf footage (Milwaukee gondola + PACKOUT wall + workbench about 45%, DeWalt isle + warehouse display about 30%, Makita row about 25%). The Milwaukee laser deck and the DeWalt warehouse display are in the warehouse today.",
      "groups": [
        {
          "label": "Milwaukee",
          "share": 0.45
        },
        {
          "label": "DeWalt",
          "share": 0.3
        },
        {
          "label": "Makita",
          "share": 0.25
        }
      ],
      "fixtures": [
        "i50",
        "i59",
        "i83",
        "i71",
        "i52",
        "i102",
        "i53"
      ],
      "fixtureSqft": 465
    },
    {
      "key": "paint_finishing",
      "order": 7,
      "name": "Paint, Stain & Finishing",
      "family": "finish",
      "color": "#A167CF",
      "colorDark": "#DCAEFE",
      "token": "cat-08",
      "size": [
        20,
        10
      ],
      "targetSqft": 200,
      "sqft": [
        120,
        360
      ],
      "adjacency": [
        "decking_outdoor",
        "woodworking",
        "hardware_fasteners"
      ],
      "entry": "none",
      "placement": "perimeter",
      "subcats": [
        "Spray paint",
        "Marking paint (typical - confirm)",
        "Interior and exterior paint in cans (typical - confirm)",
        "Penofin wood finishes (red-, blue- and green-label cans)",
        "Other exterior stains and sealers (typical - confirm)",
        "Paint accessories and sundries",
        "Brushes, rollers, trays, drop cloths and painter's tape (typical - confirm)",
        "Caulk, caulk guns and DAP patching (caulk gun / DAP rack)",
        "Wood filler and putty (wood filler rack)",
        "Construction adhesive and sealant cartridges (typical - confirm)",
        "Spray foam sealant (typical - confirm)",
        "Solvents, thinners and cleaners (typical - confirm)",
        "Paint and stain back stock (warehouse paint pallet rack)"
      ],
      "rules": [
        "Penofin and deck stains face Decking & Outdoor Living so a deck job is boards, screws and stain in one trip.",
        "One tube section: caulk, sealants, construction adhesive and spray foam with the caulk guns, built around the existing caulk gun / DAP rack (recommended, AJ to confirm).",
        "Threadlockers and super glue stay in Hardware; wood glue stays in Woodworking."
      ],
      "notes": "Today: the paint isle, the caulk gun / DAP rack, the wood filler rack and the Penofin stand on the west side of the south aisles; back stock on the warehouse paint pallet rack.",
      "groups": [],
      "fixtures": [
        "i55",
        "r_penofin",
        "r_caulk1",
        "r_caulk2",
        "i68"
      ],
      "fixtureSqft": 156
    },
    {
      "key": "decking_outdoor",
      "order": 8,
      "name": "Decking & Outdoor Living",
      "family": "finish",
      "color": "#DB5471",
      "colorDark": "#FE9EAD",
      "token": "cat-10",
      "size": [
        30,
        15
      ],
      "targetSqft": 450,
      "sqft": [
        250,
        700
      ],
      "adjacency": [
        "paint_finishing",
        "hardware_fasteners"
      ],
      "entry": "yard_doors",
      "placement": "perimeter",
      "subcats": [
        "Composite decking samples: Trex (Enhance, Select, Transcend), TimberTech",
        "Brochures: Fiberon, MAXIMO Thermo, Moso Bamboo Outdoor, Sylvanix, CINCH",
        "Composite decking boards, sold from the yard (samples on the decking wall)",
        "Railing systems (typical - confirm)",
        "Hidden deck fasteners and colour-matched plugs (typical - confirm)",
        "Siding/trim samples: TruWood, LP SmartSide, AZEK, UltraShield, cedar, T1-11",
        "Stone veneer and Cedar Valley shingle panel samples",
        "Pellet grills (the owner's 'grilles'): floor models and the warehouse demo",
        "Grill pellets (bulk pallets best kept by the warehouse roll-up)",
        "Grill and decking accessories (the email's 'Accessories')",
        "Simpson Outdoor Accents pergola display (outdoor living vignette)",
        "Post caps and deck/fence accents (typical - confirm)",
        "FBS logo drinkware: tumblers, can coolers, pint glasses (mug wall)"
      ],
      "rules": [
        "Showroom holds samples, literature and floor models; deck boards, siding and pellet pallets stay in the yard or warehouse.",
        "Bulky stock (pellet pallets, boxed grills) goes by the yard doors / warehouse roll-up (owner advisor rule; email: \"pellets and grills are heavy\"). The decking wall's samples can stay at the front as a second block (Split into two).",
        "Penofin stays in Paint (email) but faces this area; deck screws stay in Hardware (email)."
      ],
      "notes": "The owner's word is \"grilles\"; the store sells pellet grills (owner rules v3.1), so the open question is closed. Today: the decking wall (decking samples below, siding/trim samples above, DeckFast tubs) and the Simpson pergola display near the front; the pergola's footprint also holds the broom wall, the maple workbench and the FBS mug wall. Two pellet grills stand by the PACKOUT wall and a demo grill is in the warehouse.",
      "groups": [],
      "fixtures": [
        "i63",
        "i78",
        "i98",
        "i99b",
        "grill_wh",
        "i79",
        "i65"
      ],
      "fixtureSqft": 325
    },
    {
      "key": "woodworking",
      "order": 9,
      "name": "Woodworking & Specialty Wood",
      "family": "building",
      "color": "#714725",
      "colorDark": "#AE815D",
      "token": "cat-11",
      "size": [
        24,
        15
      ],
      "targetSqft": 360,
      "sqft": [
        150,
        500
      ],
      "adjacency": [
        "bits_blades",
        "paint_finishing",
        "hardware_fasteners"
      ],
      "entry": "none",
      "placement": "showroom",
      "subcats": [
        "Kreg pocket-hole jigs and accessories",
        "Kreg pocket-hole screws",
        "Kreg clamps",
        "BORA (on the Oct 1 survey's Kreg/BORA wall; confirm still carried)",
        "Bar, F-style and quick-grip clamps (typical - confirm)",
        "Dowels and pins",
        "Biscuits and joinery plates (typical - confirm)",
        "Wood glue",
        "Safety push blocks",
        "Hardwood boards",
        "Slab wood (Les Bois Milling)",
        "Millwork samples (millwork slatwall + sample counter)",
        "Interior doors, mouldings and stair parts samples (typical - confirm)",
        "Trim and moulding lengths (A-frame trim cart)"
      ],
      "rules": [
        "Kreg, its pocket screws, clamps, dowels and wood glue stay together so a cabinet or trim job is one stop.",
        "Millwork is special-order: the showroom holds samples and the counter; stock lives in the warehouse or yard.",
        "Wood filler sits with Paint, Stain & Finishing (on the existing wood filler rack), not here."
      ],
      "notes": "Today: the Kreg 8' gondola, the millwork slatwall + sample counter on the south wall, and the trim cart in the warehouse. Hardwood and Les Bois slabs have no fixture in the Oct 5 survey (ask where they live). The maple workbench stands inside the Simpson pergola display's footprint, so it now goes with that vignette (Decking & Outdoor Living) until AJ says what it is.",
      "groups": [],
      "fixtures": [
        "i54",
        "i88",
        "i89",
        "i107"
      ],
      "fixtureSqft": 156
    },
    {
      "key": "bits_blades",
      "order": 10,
      "name": "Bits, Blades & Cutting Accessories",
      "family": "tools",
      "color": "#B98918",
      "colorDark": "#F6C755",
      "token": "cat-02",
      "size": [
        25,
        8
      ],
      "targetSqft": 200,
      "sqft": [
        120,
        320
      ],
      "adjacency": [
        "power_tools",
        "woodworking"
      ],
      "entry": "sales_desk",
      "placement": "showroom",
      "subcats": [
        "Diablo circular saw blades: framing and non-stick coated",
        "Finish and fine-cut circular blades (typical - confirm)",
        "Diablo fiber-cement (HardieBlade) blades",
        "Diablo metal-cutting blades",
        "Diablo reciprocating blades",
        "Jig saw and oscillating blades (typical - confirm)",
        "Utility knife and scraper replacement blades (typical - confirm)",
        "Diablo bits and bit sets",
        "Milwaukee bits and blades (hybrid rule)",
        "DeWalt saw blades (hybrid rule)",
        "Misc. bits and blades, other brands",
        "Makita bits and blades (hybrid rule) (typical - confirm)",
        "Hole saws, spade and auger bits (typical - confirm)",
        "Masonry and SDS concrete bits (typical - confirm)",
        "Router bits (typical - confirm)",
        "Abrasives: sandpaper, sanding discs and flap discs (typical - confirm)",
        "Grinding and cut-off wheels (typical - confirm)"
      ],
      "rules": [
        "Pros shop blades by the job (\"7-1/4 framing blade\", \"Hardie blade\"), so every brand's universal bits and blades live here, sorted by job first, brand second.",
        "Aisle signs 4A and 3B on the saw blade/bits gondola belong to this department; the Diablo A-frame is its feature fixture.",
        "Sits next to Power Tools so a saw sale picks up the blade.",
        "Owner rule: universal bits, blades, abrasives and cutting consumables come here strictly, including replacement utility and scraper blades (the knives stay in Hand Tools)."
      ],
      "notes": "The email lists Milwaukee bits & blades both here and (as 'accessories, decision pending') under Milwaukee. Recommended: universal-fit bits and blades here (hybrid rule).",
      "groups": [],
      "fixtures": [
        "i56",
        "diablo_af"
      ],
      "fixtureSqft": 106
    }
  ],
  "adjacency": [
    [
      "hand_tools",
      "power_tools"
    ],
    [
      "hand_tools",
      "safety_workwear"
    ],
    [
      "hand_tools",
      "hardware_fasteners"
    ],
    [
      "access_jobsite",
      "safety_workwear"
    ],
    [
      "access_jobsite",
      "decking_outdoor"
    ],
    [
      "decking_outdoor",
      "hardware_fasteners"
    ],
    [
      "hardware_fasteners",
      "pneumatic_air"
    ],
    [
      "hardware_fasteners",
      "woodworking"
    ],
    [
      "pneumatic_air",
      "power_tools"
    ],
    [
      "bits_blades",
      "power_tools"
    ],
    [
      "decking_outdoor",
      "paint_finishing"
    ],
    [
      "paint_finishing",
      "woodworking"
    ],
    [
      "hardware_fasteners",
      "paint_finishing"
    ],
    [
      "bits_blades",
      "woodworking"
    ]
  ],
  "entryAnchors": {
    "front_door": {
      "label": "Front door (main customer entrance)",
      "items": [
        "i30"
      ]
    },
    "yard_doors": {
      "label": "Yard doors (Milwaukee doorway and warehouse roll-up)",
      "items": [
        "i36",
        "i32"
      ]
    },
    "sales_desk": {
      "label": "Sales desks (front checkout desk and back desk)",
      "items": [
        "fd_front_desk",
        "i47"
      ]
    },
    "will_call": {
      "label": "Will-call doors",
      "items": [
        "i31"
      ]
    },
    "none": {
      "label": "No preference",
      "items": []
    }
  },
  "placements": {
    "showroom": "Showroom (sales floor and front room)",
    "warehouse": "Warehouse",
    "perimeter": "Perimeter (along a wall)",
    "central": "Central (away from walls)"
  },
  "palette": [
    {
      "token": "cat-01",
      "light": "#CD5811",
      "dark": "#FC9252",
      "hue": "orange"
    },
    {
      "token": "cat-02",
      "light": "#B98918",
      "dark": "#F6C755",
      "hue": "gold"
    },
    {
      "token": "cat-03",
      "light": "#60991D",
      "dark": "#A5E060",
      "hue": "lime"
    },
    {
      "token": "cat-04",
      "light": "#206F33",
      "dark": "#4CB86A",
      "hue": "green"
    },
    {
      "token": "cat-05",
      "light": "#0F9B89",
      "dark": "#5ADDC7",
      "hue": "teal"
    },
    {
      "token": "cat-06",
      "light": "#086082",
      "dark": "#42A4CF",
      "hue": "cyan",
      "spare": true,
      "avoid": "Reads like FBS Blue / the selection colour (dE2000 9.3 to #006CB4; 8.2 to #609CD8 in dark mode)."
    },
    {
      "token": "cat-07",
      "light": "#4449C6",
      "dark": "#7E8EF4",
      "hue": "indigo"
    },
    {
      "token": "cat-08",
      "light": "#A167CF",
      "dark": "#DCAEFE",
      "hue": "violet"
    },
    {
      "token": "cat-09",
      "light": "#9E197B",
      "dark": "#EA66BF",
      "hue": "magenta"
    },
    {
      "token": "cat-10",
      "light": "#DB5471",
      "dark": "#FE9EAD",
      "hue": "rose"
    },
    {
      "token": "cat-11",
      "light": "#714725",
      "dark": "#AE815D",
      "hue": "brown"
    },
    {
      "token": "cat-12",
      "light": "#677A8B",
      "dark": "#AEC0D0",
      "hue": "slate",
      "spare": true,
      "avoid": "Reads like the fixture grey on the plan (dE2000 4.7 to the fixture stroke #5E6E7E)."
    }
  ],
  "thresholds": {
    "nearFt": 12,
    "anchorFt": 15,
    "perimeterFt": 6
  },
  "sizing": {
    "basis": "targetSqft and sqft include the fixtures plus the shopping aisle in front of them (about 4 ft per shopping face). size [len, depth] multiplies to targetSqft, so a freshly dropped block starts at target.",
    "floorSqft": {
      "salesFloor_i3": 4240,
      "frontRoom_i4": 1920,
      "frontRoomEast_i5_mostlyOffices": 2940,
      "warehouse_i1": 2925
    },
    "totalTargetSqft": 3800
  }
});

export const PRODUCTS = deepFreeze([
 {
  "item": "MILWAUKEE POWER TOOLS 28'",
  "kind": "fixture",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Milwaukee tool gondola: Milwaukee child group.",
  "surveyIds": [
   "i50"
  ],
  "confidence": "high"
 },
 {
  "item": "MILWAUKEE PACKOUT WALL 24'",
  "kind": "fixture",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Milwaukee PACKOUT storage is platform storage, which stays with the brand (hybrid rule).",
  "surveyIds": [
   "i59"
  ],
  "confidence": "high"
 },
 {
  "item": "Milwaukee workbench displays",
  "kind": "fixture",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Milwaukee demo displays belong to the Milwaukee group.",
  "surveyIds": [
   "i83"
  ],
  "confidence": "high"
 },
 {
  "item": "MILWAUKEE HAND TOOL PANEL",
  "kind": "fixture",
  "department": "hand_tools",
  "group": null,
  "why": "Milwaukee vendor panel (tapes, knives, pliers): universal hand tools, so Hand Tools & Measuring as an intact Milwaukee block (hybrid rule).",
  "surveyIds": [
   "i108"
  ],
  "confidence": "medium"
 },
 {
  "item": "Laser deck",
  "kind": "fixture",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Warehouse laser deck with Milwaukee laser cases and tripods (docs photo 02): brand lasers stay with the brand.",
  "surveyIds": [
   "i71"
  ],
  "confidence": "medium"
 },
 {
  "item": "DEWALT ISLE 21'8\"",
  "kind": "fixture",
  "department": "power_tools",
  "group": "DeWalt",
  "why": "DeWalt tool gondola: DeWalt child group.",
  "surveyIds": [
   "i52"
  ],
  "confidence": "high"
 },
 {
  "item": "DEWALT WAREHOUSE DISPLAY 12'",
  "kind": "fixture",
  "department": "power_tools",
  "group": "DeWalt",
  "why": "DeWalt display in the warehouse: DeWalt child group.",
  "surveyIds": [
   "i102"
  ],
  "confidence": "high"
 },
 {
  "item": "MAKITA ROW 25'6\"",
  "kind": "fixture",
  "department": "power_tools",
  "group": "Makita",
  "why": "Makita gondola (tools on teal pegboard): Makita child group.",
  "surveyIds": [
   "i53"
  ],
  "confidence": "high"
 },
 {
  "item": "SAW BLADE/BITS 27' (4A/3B)",
  "kind": "fixture",
  "department": "bits_blades",
  "group": null,
  "why": "Saw blade / bits gondola (aisles 4A and 3B, Diablo): the core of Bits & Blades.",
  "surveyIds": [
   "i56"
  ],
  "confidence": "high"
 },
 {
  "item": "DIABLO BLADE A-FRAME",
  "kind": "fixture",
  "department": "bits_blades",
  "group": null,
  "why": "Diablo blade A-frame: feature fixture for blades.",
  "surveyIds": [
   "diablo_af"
  ],
  "confidence": "high"
 },
 {
  "item": "KREG 8'",
  "kind": "fixture",
  "department": "woodworking",
  "group": null,
  "why": "Kreg is on the email's Woodworking list.",
  "surveyIds": [
   "i54"
  ],
  "confidence": "high"
 },
 {
  "item": "MILLWORK SLATWALL 26'",
  "kind": "fixture",
  "department": "woodworking",
  "group": null,
  "why": "Millwork sample wall: specialty wood / finish-carpentry samples.",
  "surveyIds": [
   "i88"
  ],
  "confidence": "medium"
 },
 {
  "item": "MILLWORK SAMPLE COUNTER",
  "kind": "fixture",
  "department": "woodworking",
  "group": null,
  "why": "Millwork sample counter (special orders) goes with the millwork samples.",
  "surveyIds": [
   "i89"
  ],
  "confidence": "medium"
 },
 {
  "item": "A-FRAME TRIM CART",
  "kind": "fixture",
  "department": "woodworking",
  "group": null,
  "why": "Trim and moulding lengths are millwork / specialty wood.",
  "surveyIds": [
   "i107"
  ],
  "confidence": "medium"
 },
 {
  "item": "Maple workbench",
  "kind": "fixture",
  "department": "decking_outdoor",
  "group": null,
  "why": "Stands inside the Simpson pergola display's footprint, so it goes with that outdoor living vignette until AJ says what it is.",
  "surveyIds": [
   "i79"
  ],
  "confidence": "low"
 },
 {
  "item": "AIR GUNS 30' (TRY IT BUY IT)",
  "kind": "fixture",
  "department": "pneumatic_air",
  "group": null,
  "why": "Every brand of air tool on the try-it wall (email: all brands of air tools).",
  "surveyIds": [
   "i61"
  ],
  "confidence": "high"
 },
 {
  "item": "ROLAIR COMPRESSOR RACK",
  "kind": "fixture",
  "department": "pneumatic_air",
  "group": null,
  "why": "Rolair compressors are air systems.",
  "surveyIds": [
   "i104"
  ],
  "confidence": "high"
 },
 {
  "item": "NAIL/SCREW 23'4\" (3A)",
  "kind": "fixture",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Nail / screw gondola (aisle 3A): boxed nails, misc. screws, Hillman.",
  "surveyIds": [
   "i57"
  ],
  "confidence": "high"
 },
 {
  "item": "SIMPSON SCREW WALL 19'10\"",
  "kind": "fixture",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Simpson screws are on the email's Hardware list.",
  "surveyIds": [
   "i62"
  ],
  "confidence": "high"
 },
 {
  "item": "SIMPSON STRONG-TIE FASTENING SYSTEMS",
  "kind": "fixture",
  "department": "hardware_fasteners",
  "group": null,
  "why": "6 ft Simpson Strong-Tie fastening unit beside the Simpson screw wall (renamed from 'SIMPSON ORNAMENTAL 13'9\"' by the pergola on Oct 1; brand key still simpson_orn). Simpson is a Hardware line in the email.",
  "surveyIds": [
   "i64"
  ],
  "confidence": "medium"
 },
 {
  "item": "PAINT ISLE 17'6\"",
  "kind": "fixture",
  "department": "paint_finishing",
  "group": null,
  "why": "Paint isle.",
  "surveyIds": [
   "i55"
  ],
  "confidence": "high"
 },
 {
  "item": "Penofin stand",
  "kind": "fixture",
  "department": "paint_finishing",
  "group": null,
  "why": "Penofin is on the email's Paint list.",
  "surveyIds": [
   "r_penofin"
  ],
  "confidence": "high"
 },
 {
  "item": "Caulk gun / DAP rack",
  "kind": "fixture",
  "department": "paint_finishing",
  "group": null,
  "why": "Caulk and DAP patching are finishing products and the rack sits on the paint isle.",
  "surveyIds": [
   "r_caulk1"
  ],
  "confidence": "medium"
 },
 {
  "item": "Wood filler rack",
  "kind": "fixture",
  "department": "paint_finishing",
  "group": null,
  "why": "Wood filler is a finishing product and the rack sits on the paint isle.",
  "surveyIds": [
   "r_caulk2"
  ],
  "confidence": "medium"
 },
 {
  "item": "PALLET RACK - PAINT",
  "kind": "fixture",
  "department": "paint_finishing",
  "group": null,
  "why": "Warehouse back stock of paint and stain (Penofin cans on orange racking in the photos).",
  "surveyIds": [
   "i68"
  ],
  "confidence": "medium"
 },
 {
  "item": "DECKING WALL 23'",
  "kind": "fixture",
  "department": "decking_outdoor",
  "group": null,
  "why": "Decking wall: Trex/TimberTech samples, decking literature, siding/trim samples, DeckFast tubs.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "high"
 },
 {
  "item": "Simpson pergola display",
  "kind": "fixture",
  "department": "decking_outdoor",
  "group": null,
  "why": "Outdoor living vignette by the decking wall (Outdoor Accents hardware shown in use; the boxes appear on its shelving). Its footprint also holds the broom wall, the maple workbench and the mug wall.",
  "surveyIds": [
   "i78"
  ],
  "confidence": "medium"
 },
 {
  "item": "PELLET GRILL",
  "kind": "fixture",
  "department": "decking_outdoor",
  "group": null,
  "why": "Pellet grill floor model (owner rules v3.1: the owner's 'grilles' are the pellet grills the store sells).",
  "surveyIds": [
   "i98"
  ],
  "confidence": "high"
 },
 {
  "item": "PELLET GRILL 2",
  "kind": "fixture",
  "department": "decking_outdoor",
  "group": null,
  "why": "Pellet grill floor model (owner rules v3.1: the owner's 'grilles' are the pellet grills the store sells).",
  "surveyIds": [
   "i99b"
  ],
  "confidence": "high"
 },
 {
  "item": "PELLET GRILL (demo)",
  "kind": "fixture",
  "department": "decking_outdoor",
  "group": null,
  "why": "Pellet grill demo in the warehouse (owner rules v3.1: the owner's 'grilles' are the pellet grills the store sells).",
  "surveyIds": [
   "grill_wh"
  ],
  "confidence": "medium"
 },
 {
  "item": "HAND TOOL / HAMMER GONDOLA 24'",
  "kind": "fixture",
  "department": "hand_tools",
  "group": null,
  "why": "Hand tool / hammer gondola: hammers, squares, tapes, pliers.",
  "surveyIds": [
   "i101"
  ],
  "confidence": "high"
 },
 {
  "item": "BUCK KNIVES CASE",
  "kind": "fixture",
  "department": "hand_tools",
  "group": null,
  "why": "Buck Knives pocket knives are hand tools; the locked case stays near a sales desk.",
  "surveyIds": [
   "i109"
  ],
  "confidence": "medium"
 },
 {
  "item": "SAFETY ISLE 32'6\"",
  "kind": "fixture",
  "department": "safety_workwear",
  "group": null,
  "why": "Safety isle: gloves, knee pads, glasses, hi-vis.",
  "surveyIds": [
   "i51"
  ],
  "confidence": "high"
 },
 {
  "item": "OCCIDENTAL BAG ISLE 23'4\"",
  "kind": "fixture",
  "department": "safety_workwear",
  "group": null,
  "why": "Occidental bags are on the email's Safety & Wearables list.",
  "surveyIds": [
   "i58"
  ],
  "confidence": "high"
 },
 {
  "item": "Hardhat towers 1-4",
  "kind": "fixture",
  "department": "safety_workwear",
  "group": null,
  "why": "Hard hats are on the email's Safety list.",
  "surveyIds": [
   "i74",
   "i75",
   "i76",
   "i77"
  ],
  "confidence": "high"
 },
 {
  "item": "WORKWEAR & APPAREL CORNER",
  "kind": "fixture",
  "department": "safety_workwear",
  "group": null,
  "why": "Workwear and hi-vis apparel are wearables.",
  "surveyIds": [
   "i97"
  ],
  "confidence": "high"
 },
 {
  "item": "FBS BOOT LIGHTBOX (WEST and EAST)",
  "kind": "fixture",
  "department": "safety_workwear",
  "group": null,
  "why": "Work boots are workwear (Muck Boot Company seen in store photos).",
  "surveyIds": [
   "i95",
   "i96"
  ],
  "confidence": "medium"
 },
 {
  "item": "FBS MUG WALL 5'",
  "kind": "fixture",
  "department": "decking_outdoor",
  "group": null,
  "why": "FBS logo drinkware (tumblers, can coolers, pint glasses) sells with grills and outdoor living, and the mug wall stands inside the Simpson pergola display's footprint.",
  "surveyIds": [
   "i65"
  ],
  "confidence": "low"
 },
 {
  "item": "LADDER WALL RACK 10'",
  "kind": "fixture",
  "department": "access_jobsite",
  "group": null,
  "why": "Ladders are on the email's Ladders, Scaffolds & Pump Jacks list.",
  "surveyIds": [
   "ladder_wall"
  ],
  "confidence": "high"
 },
 {
  "item": "Scaffolding cage",
  "kind": "fixture",
  "department": "access_jobsite",
  "group": null,
  "why": "Scaffolding is on the email's Ladders, Scaffolds & Pump Jacks list.",
  "surveyIds": [
   "i99"
  ],
  "confidence": "high"
 },
 {
  "item": "BROOM / LONG-HANDLE WALL 11'",
  "kind": "fixture",
  "department": "access_jobsite",
  "group": null,
  "why": "Brooms, shovels and rakes (red fiberglass handles in the photos) are jobsite cleanup and digging. The wall stands inside the Simpson pergola display's footprint today.",
  "surveyIds": [
   "broom_wall"
  ],
  "confidence": "medium"
 },
 {
  "item": "STRAP ISLE 12'",
  "kind": "fixture",
  "department": "access_jobsite",
  "group": null,
  "why": "Straps and tie-downs secure the load for the trip out of the yard.",
  "surveyIds": [
   "i66"
  ],
  "confidence": "medium"
 },
 {
  "item": "PALLET RACK - WEST WALL",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Warehouse pallet rack: back stock for several departments, not a sales department.",
  "surveyIds": [
   "i67"
  ],
  "confidence": "medium"
 },
 {
  "item": "PALLET RACK - SOUTH",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Warehouse pallet rack: back stock, not a sales department.",
  "surveyIds": [
   "i69"
  ],
  "confidence": "medium"
 },
 {
  "item": "WAREHOUSE RACK ROW A and ROW B",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Warehouse racks (Stinger, Tytan and other boxed stock in the photos): back stock, not a sales department.",
  "surveyIds": [
   "i105",
   "i106"
  ],
  "confidence": "medium"
 },
 {
  "item": "FRAMING STUD DISPLAY",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Unknown contents; not placed in a department until AJ says what it shows.",
  "surveyIds": [
   "i103"
  ],
  "confidence": "low"
 },
 {
  "item": "CHECKOUT SPECIALS SPINNER",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Front-end impulse fixture with rotating specials from several departments.",
  "surveyIds": [
   "spin_chk"
  ],
  "confidence": "medium"
 },
 {
  "item": "REFRESHMENT COUNTER (coffee/ice/soda)",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Customer refreshment counter (coffee, ice, soda): an amenity, not a building-supply department.",
  "surveyIds": [
   "i84"
  ],
  "confidence": "high"
 },
 {
  "item": "Soda coolers",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Soda coolers: front-end refreshment, not a building-supply department.",
  "surveyIds": [
   "i85"
  ],
  "confidence": "high"
 },
 {
  "item": "FBS MINI FRIDGE",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Staff mini fridge behind the front desk.",
  "surveyIds": [
   "sdf_fridge"
  ],
  "confidence": "high"
 },
 {
  "item": "Popcorn desk",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Popcorn desk (customer amenity).",
  "surveyIds": [
   "pop_desk"
  ],
  "confidence": "high"
 },
 {
  "item": "FIRST AID / AED STATION",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Store first aid / AED station: safety equipment, not merchandise (first aid kits for sale belong to Safety & Workwear).",
  "surveyIds": [
   "fa_station"
  ],
  "confidence": "high"
 },
 {
  "item": "Cubicles and cubicle panels",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Office cubicles.",
  "surveyIds": [
   "i86",
   "cub_line"
  ],
  "confidence": "high"
 },
 {
  "item": "Cedar desk by square arch + return",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Staff desk.",
  "surveyIds": [
   "sdf_s",
   "sdf_n",
   "n10015m49"
  ],
  "confidence": "high"
 },
 {
  "item": "Receiving desk",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Receiving desk.",
  "surveyIds": [
   "rec_desk"
  ],
  "confidence": "high"
 },
 {
  "item": "White storage cabinet",
  "kind": "fixture",
  "department": null,
  "group": null,
  "why": "Storage cabinet.",
  "surveyIds": [
   "i100"
  ],
  "confidence": "high"
 },
 {
  "item": "Aisle signs 4A and 3B (saw blade/bits gondola)",
  "kind": "doc",
  "department": "bits_blades",
  "group": null,
  "why": "Docs: the aisle signs hang on the north end of the blade/bit gondola; they mark Bits & Blades faces.",
  "surveyIds": [
   "i56"
  ],
  "confidence": "high"
 },
 {
  "item": "Aisle sign 3A (nail/screw gondola)",
  "kind": "doc",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Docs: aisle 3A is the nail/screw gondola.",
  "surveyIds": [
   "i57"
  ],
  "confidence": "high"
 },
 {
  "item": "TRY IT BEFORE YOU BUY IT banner + CURIOUS ABOUT A TOOL banner",
  "kind": "doc",
  "department": "pneumatic_air",
  "group": null,
  "why": "Docs: banners on the arch wall above the air-gun wall.",
  "surveyIds": [
   "i61"
  ],
  "confidence": "high"
 },
 {
  "item": "Occidental Leather logo sign (soffit)",
  "kind": "doc",
  "department": "safety_workwear",
  "group": null,
  "why": "Docs: brand sign above the Occidental bag aisle; it moves with the bags.",
  "surveyIds": [
   "i58"
  ],
  "confidence": "high"
 },
 {
  "item": "Laser wall (cedar planks, shelves of red Milwaukee cases) + laser deck tripods",
  "kind": "doc",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Docs photo 02: Milwaukee laser display in the warehouse.",
  "surveyIds": [
   "i71"
  ],
  "confidence": "medium"
 },
 {
  "item": "Makita tools on teal pegboard (drills, grinders, saws)",
  "kind": "doc",
  "department": "power_tools",
  "group": "Makita",
  "why": "Docs photos 07/08/11: Makita gondola contents.",
  "surveyIds": [
   "i53"
  ],
  "confidence": "high"
 },
 {
  "item": "SDB front pegboard with products (photo 01)",
  "kind": "doc",
  "department": null,
  "group": null,
  "why": "Docs: impulse pegboard on the back sales desk (Rocket Anchor, Stanley plumb bob, screwdrivers). The desk is structure; the items' home departments are Hardware and Hand Tools.",
  "surveyIds": [
   "i47"
  ],
  "confidence": "medium"
 },
 {
  "item": "SDF snack pegboard (photo 39)",
  "kind": "doc",
  "department": null,
  "group": null,
  "why": "Docs: snacks on the front sales desk: front-end impulse, not a building-supply department.",
  "surveyIds": [
   "fd_front_desk"
  ],
  "confidence": "high"
 },
 {
  "item": "Lumber pergola display with lime-green product bins (warehouse, photo 02)",
  "kind": "doc",
  "department": null,
  "group": null,
  "why": "Docs v10 build; not in the Oct 5 survey.",
  "surveyIds": [],
  "confidence": "low"
 },
 {
  "item": "FBS flag buckets on the ledge above the air-tools wall",
  "kind": "doc",
  "department": null,
  "group": null,
  "why": "Docs: decor on a ledge (unless the buckets are sold).",
  "surveyIds": [
   "i61"
  ],
  "confidence": "low"
 },
 {
  "item": "START HERE LED sign (front sales desk)",
  "kind": "doc",
  "department": null,
  "group": null,
  "why": "Docs: wayfinding sign, not merchandise.",
  "surveyIds": [
   "fd_front_desk"
  ],
  "confidence": "high"
 },
 {
  "item": "Shadow box - Kennatrack apron",
  "kind": "doc",
  "department": null,
  "group": null,
  "why": "Docs: framed decor on the soffit; not merchandise.",
  "surveyIds": [],
  "confidence": "high"
 },
 {
  "item": "Decor: B&W logging photos, antique tool plaques, vintage-label shadow box, 'Evolution of the framing hammer' sign, FBS hat shelf (Tom's board)",
  "kind": "doc",
  "department": null,
  "group": null,
  "why": "Docs/photos: wall decor, not merchandise.",
  "surveyIds": [],
  "confidence": "high"
 },
 {
  "item": "hi-vis (older store model node)",
  "kind": "doc",
  "department": "safety_workwear",
  "group": null,
  "why": "Audit lists a hi-vis fixture in the older model: hi-vis apparel is Safety & Workwear.",
  "surveyIds": [
   "i51",
   "i97"
  ],
  "confidence": "high"
 },
 {
  "item": "hardware-ppe (older store model node)",
  "kind": "doc",
  "department": "safety_workwear",
  "group": null,
  "why": "Older model kept PPE in a 'hardware' gondola; PPE belongs to Safety & Workwear.",
  "surveyIds": [
   "i51"
  ],
  "confidence": "medium"
 },
 {
  "item": "hardware-longtools (older store model node)",
  "kind": "doc",
  "department": "access_jobsite",
  "group": null,
  "why": "Older model kept long-handle tools in a 'hardware' gondola; today they are on the broom / long-handle wall.",
  "surveyIds": [
   "broom_wall"
  ],
  "confidence": "medium"
 },
 {
  "item": "hardware-adhesives (older store model node)",
  "kind": "doc",
  "department": "paint_finishing",
  "group": null,
  "why": "Older model kept adhesives in a 'hardware' gondola; recommended home is one tube section in Paint.",
  "surveyIds": [
   "r_caulk1"
  ],
  "confidence": "medium"
 },
 {
  "item": "hand-tools-a / hand-tools-b (older store model nodes)",
  "kind": "doc",
  "department": "hand_tools",
  "group": null,
  "why": "Older model's hand tool gondolas = today's hand tool / hammer gondola.",
  "surveyIds": [
   "i101"
  ],
  "confidence": "high"
 },
 {
  "item": "milwaukee-wall (older store model; 'yard doors beside the Milwaukee wall')",
  "kind": "doc",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Docs: the Milwaukee wall by the yard doors = today's PACKOUT wall.",
  "surveyIds": [
   "i59"
  ],
  "confidence": "high"
 },
 {
  "item": "sample-timbertech (older store model node)",
  "kind": "doc",
  "department": "decking_outdoor",
  "group": null,
  "why": "Docs: TimberTech sample display = decking wall.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "high"
 },
 {
  "item": "Squares & levels",
  "kind": "email",
  "department": "hand_tools",
  "group": null,
  "why": "Email: Hand Tools.",
  "surveyIds": [
   "i101"
  ],
  "confidence": "high"
 },
 {
  "item": "Hammers & nail pullers",
  "kind": "email",
  "department": "hand_tools",
  "group": null,
  "why": "Email: Hand Tools.",
  "surveyIds": [
   "i101"
  ],
  "confidence": "high"
 },
 {
  "item": "Tapes & measuring devices",
  "kind": "email",
  "department": "hand_tools",
  "group": null,
  "why": "Email: Hand Tools (Milwaukee tapes on the Milwaukee vendor panel come here too).",
  "surveyIds": [
   "i101"
  ],
  "confidence": "high"
 },
 {
  "item": "Pliers & cutters",
  "kind": "email",
  "department": "hand_tools",
  "group": null,
  "why": "Email: Hand Tools.",
  "surveyIds": [
   "i101"
  ],
  "confidence": "high"
 },
 {
  "item": "Nail sets",
  "kind": "email",
  "department": "hand_tools",
  "group": null,
  "why": "Email: Hand Tools.",
  "surveyIds": [
   "i101"
  ],
  "confidence": "high"
 },
 {
  "item": "Utility knives, blades, chalk lines & pencils",
  "kind": "email",
  "department": "hand_tools",
  "group": null,
  "why": "Added suggestion under Hand Tools: knives, chalk lines and pencils here; replacement blades go to Bits, Blades & Cutting Accessories (owner rule: cutting consumables).",
  "surveyIds": [
   "i101"
  ],
  "confidence": "medium"
 },
 {
  "item": "Hammer tackers",
  "kind": "email",
  "department": "hand_tools",
  "group": null,
  "why": "Added suggestion under Hand Tools.",
  "surveyIds": [
   "i101"
  ],
  "confidence": "medium"
 },
 {
  "item": "Occidental bags",
  "kind": "email",
  "department": "safety_workwear",
  "group": null,
  "why": "Email: Safety & Wearables.",
  "surveyIds": [
   "i58"
  ],
  "confidence": "high"
 },
 {
  "item": "Hard hats",
  "kind": "email",
  "department": "safety_workwear",
  "group": null,
  "why": "Email: Safety & Wearables.",
  "surveyIds": [
   "i74",
   "i75",
   "i76",
   "i77"
  ],
  "confidence": "high"
 },
 {
  "item": "Gloves",
  "kind": "email",
  "department": "safety_workwear",
  "group": null,
  "why": "Email: Safety & Wearables (also a checkout impulse item).",
  "surveyIds": [
   "i51"
  ],
  "confidence": "high"
 },
 {
  "item": "Knee pads",
  "kind": "email",
  "department": "safety_workwear",
  "group": null,
  "why": "Email: Safety & Wearables.",
  "surveyIds": [
   "i51"
  ],
  "confidence": "high"
 },
 {
  "item": "Safety harnesses",
  "kind": "email",
  "department": "safety_workwear",
  "group": null,
  "why": "Email: Safety & Wearables.",
  "surveyIds": [
   "i51"
  ],
  "confidence": "medium"
 },
 {
  "item": "Ladders",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Email: Ladders, Scaffolds & Pump Jacks.",
  "surveyIds": [
   "ladder_wall"
  ],
  "confidence": "high"
 },
 {
  "item": "Scaffolds",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Email: Ladders, Scaffolds & Pump Jacks.",
  "surveyIds": [
   "i99"
  ],
  "confidence": "high"
 },
 {
  "item": "Pump jack systems",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Email: Ladders, Scaffolds & Pump Jacks (no fixture named in the survey).",
  "surveyIds": [],
  "confidence": "high"
 },
 {
  "item": "Simpson screws",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Email: Hardware.",
  "surveyIds": [
   "i62"
  ],
  "confidence": "high"
 },
 {
  "item": "Simpson Outdoor Accents",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Email: Hardware.",
  "surveyIds": [
   "i64"
  ],
  "confidence": "high"
 },
 {
  "item": "Hillman hardware",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Email: Hardware (bins/drawers on the nail/screw gondola).",
  "surveyIds": [
   "i57"
  ],
  "confidence": "high"
 },
 {
  "item": "Misc. screws & deck screws",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Email: Hardware. DeckFast deck-screw tubs sit on the decking wall today.",
  "surveyIds": [
   "i57",
   "i62",
   "i63"
  ],
  "confidence": "high"
 },
 {
  "item": "Nails (boxed)",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Email: Hardware. Bulk nails stay in the warehouse (W24-W26).",
  "surveyIds": [
   "i57"
  ],
  "confidence": "medium"
 },
 {
  "item": "All brands of air tools",
  "kind": "email",
  "department": "pneumatic_air",
  "group": null,
  "why": "Email: Air Tools & Accessories.",
  "surveyIds": [
   "i61"
  ],
  "confidence": "high"
 },
 {
  "item": "Air hose & fittings",
  "kind": "email",
  "department": "pneumatic_air",
  "group": null,
  "why": "Email: Air Tools & Accessories.",
  "surveyIds": [
   "i61"
  ],
  "confidence": "high"
 },
 {
  "item": "Oil & lubes",
  "kind": "email",
  "department": "pneumatic_air",
  "group": null,
  "why": "Email: Air Tools & Accessories.",
  "surveyIds": [
   "i61"
  ],
  "confidence": "high"
 },
 {
  "item": "Misc. gun repair parts",
  "kind": "email",
  "department": "pneumatic_air",
  "group": null,
  "why": "Email: Air Tools & Accessories.",
  "surveyIds": [
   "i61"
  ],
  "confidence": "high"
 },
 {
  "item": "Cap & crown staplers, staples",
  "kind": "email",
  "department": "pneumatic_air",
  "group": null,
  "why": "Added suggestion under Air Tools (Stinger cap staplers seen in the warehouse).",
  "surveyIds": [
   "i61"
  ],
  "confidence": "medium"
 },
 {
  "item": "Milwaukee tools & batteries",
  "kind": "email",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Email: Milwaukee.",
  "surveyIds": [
   "i50",
   "i59",
   "i83"
  ],
  "confidence": "high"
 },
 {
  "item": "Milwaukee accessories (decision pending in the email)",
  "kind": "email",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Platform-only accessories stay with Milwaukee; universal bits/blades go to Bits & Blades (hybrid rule).",
  "surveyIds": [
   "i50",
   "i59"
  ],
  "confidence": "medium"
 },
 {
  "item": "DeWalt tools & batteries",
  "kind": "email",
  "department": "power_tools",
  "group": "DeWalt",
  "why": "Email: DeWalt.",
  "surveyIds": [
   "i52",
   "i102"
  ],
  "confidence": "high"
 },
 {
  "item": "DeWalt accessories (decision pending in the email)",
  "kind": "email",
  "department": "power_tools",
  "group": "DeWalt",
  "why": "Same hybrid rule as Milwaukee.",
  "surveyIds": [
   "i52"
  ],
  "confidence": "medium"
 },
 {
  "item": "Makita tools & batteries",
  "kind": "email",
  "department": "power_tools",
  "group": "Makita",
  "why": "Email: Makita.",
  "surveyIds": [
   "i53"
  ],
  "confidence": "high"
 },
 {
  "item": "Makita accessories (decision pending in the email)",
  "kind": "email",
  "department": "power_tools",
  "group": "Makita",
  "why": "Same hybrid rule as Milwaukee.",
  "surveyIds": [
   "i53"
  ],
  "confidence": "medium"
 },
 {
  "item": "Spray paint",
  "kind": "email",
  "department": "paint_finishing",
  "group": null,
  "why": "Email: Paints, Stains & Accessories.",
  "surveyIds": [
   "i55"
  ],
  "confidence": "high"
 },
 {
  "item": "Penofin",
  "kind": "email",
  "department": "paint_finishing",
  "group": null,
  "why": "Email: Paints, Stains & Accessories.",
  "surveyIds": [
   "r_penofin",
   "i55",
   "i68"
  ],
  "confidence": "high"
 },
 {
  "item": "All associated accessories & sundries (paint)",
  "kind": "email",
  "department": "paint_finishing",
  "group": null,
  "why": "Email: Paints, Stains & Accessories.",
  "surveyIds": [
   "i55"
  ],
  "confidence": "high"
 },
 {
  "item": "Grilles (the owner's word: pellet grills)",
  "kind": "email",
  "department": "decking_outdoor",
  "group": null,
  "why": "Email: Decking & Outdoor. Owner rules v3.1 settle it: the store sells pellet grills.",
  "surveyIds": [
   "i98",
   "i99b",
   "grill_wh"
  ],
  "confidence": "high"
 },
 {
  "item": "Pellets",
  "kind": "email",
  "department": "decking_outdoor",
  "group": null,
  "why": "Email: Decking & Outdoor (bulk pallets by the warehouse roll-up).",
  "surveyIds": [],
  "confidence": "high"
 },
 {
  "item": "Decking & outdoor accessories",
  "kind": "email",
  "department": "decking_outdoor",
  "group": null,
  "why": "Email: Decking & Outdoor.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "high"
 },
 {
  "item": "Kreg",
  "kind": "email",
  "department": "woodworking",
  "group": null,
  "why": "Email: Woodworking.",
  "surveyIds": [
   "i54"
  ],
  "confidence": "high"
 },
 {
  "item": "Hardwood",
  "kind": "email",
  "department": "woodworking",
  "group": null,
  "why": "Email: Woodworking (no fixture in the Oct 5 survey).",
  "surveyIds": [],
  "confidence": "high"
 },
 {
  "item": "Dowels & pins",
  "kind": "email",
  "department": "woodworking",
  "group": null,
  "why": "Email: Woodworking.",
  "surveyIds": [
   "i54"
  ],
  "confidence": "high"
 },
 {
  "item": "Wood glue",
  "kind": "email",
  "department": "woodworking",
  "group": null,
  "why": "Email: Woodworking.",
  "surveyIds": [
   "i54"
  ],
  "confidence": "high"
 },
 {
  "item": "Slab wood (Les Bois Milling)",
  "kind": "email",
  "department": "woodworking",
  "group": null,
  "why": "Email: Woodworking (no fixture in the Oct 5 survey).",
  "surveyIds": [],
  "confidence": "high"
 },
 {
  "item": "Clamps",
  "kind": "email",
  "department": "woodworking",
  "group": null,
  "why": "Added suggestion under Woodworking (Kreg clamps seen).",
  "surveyIds": [
   "i54"
  ],
  "confidence": "medium"
 },
 {
  "item": "Diablo bits & blades",
  "kind": "email",
  "department": "bits_blades",
  "group": null,
  "why": "Email: Bits & Blades.",
  "surveyIds": [
   "i56",
   "diablo_af"
  ],
  "confidence": "high"
 },
 {
  "item": "Milwaukee bits & blades",
  "kind": "email",
  "department": "bits_blades",
  "group": null,
  "why": "Email: Bits & Blades (also listed as Milwaukee accessories).",
  "surveyIds": [
   "i56"
  ],
  "confidence": "high"
 },
 {
  "item": "Misc. bits & blades",
  "kind": "email",
  "department": "bits_blades",
  "group": null,
  "why": "Email: Bits & Blades.",
  "surveyIds": [
   "i56"
  ],
  "confidence": "high"
 },
 {
  "item": "Construction adhesive",
  "kind": "email",
  "department": "paint_finishing",
  "group": null,
  "why": "Added 'Adhesives, Caulks & Sealants' area (near paint): one tube section.",
  "surveyIds": [
   "r_caulk1"
  ],
  "confidence": "medium"
 },
 {
  "item": "Caulk",
  "kind": "email",
  "department": "paint_finishing",
  "group": null,
  "why": "Added 'Adhesives, Caulks & Sealants' area; the caulk gun / DAP rack is on the paint isle.",
  "surveyIds": [
   "r_caulk1"
  ],
  "confidence": "high"
 },
 {
  "item": "Spray foam",
  "kind": "email",
  "department": "paint_finishing",
  "group": null,
  "why": "Added 'Adhesives, Caulks & Sealants' area.",
  "surveyIds": [
   "r_caulk1"
  ],
  "confidence": "medium"
 },
 {
  "item": "Flashing tape",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Added 'Building Envelope' area: envelope tapes go with framing/sheathing hardware.",
  "surveyIds": [],
  "confidence": "low"
 },
 {
  "item": "House wrap tape",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Added 'Building Envelope' area.",
  "surveyIds": [],
  "confidence": "low"
 },
 {
  "item": "Sill seal",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Added 'Building Envelope' area.",
  "surveyIds": [],
  "confidence": "low"
 },
 {
  "item": "Tapcons & wedge anchors",
  "kind": "email",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Added 'Concrete, Masonry & Anchors' area: anchors are fasteners.",
  "surveyIds": [
   "i57"
  ],
  "confidence": "medium"
 },
 {
  "item": "Masonry bits",
  "kind": "email",
  "department": "bits_blades",
  "group": null,
  "why": "Added 'Concrete, Masonry & Anchors' area: bits go to Bits & Blades.",
  "surveyIds": [
   "i56"
  ],
  "confidence": "medium"
 },
 {
  "item": "Trowels & floats",
  "kind": "email",
  "department": "hand_tools",
  "group": null,
  "why": "Added 'Concrete, Masonry & Anchors' area: hand tools.",
  "surveyIds": [
   "i101"
  ],
  "confidence": "low"
 },
 {
  "item": "Extension cords",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Jobsite Power & Light' area.",
  "surveyIds": [],
  "confidence": "medium"
 },
 {
  "item": "Work lights",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Jobsite Power & Light' area (non-platform; brand lights stay with the brand).",
  "surveyIds": [],
  "confidence": "medium"
 },
 {
  "item": "Non-platform batteries",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Jobsite Power & Light' area (household/AA batteries; also a checkout impulse item).",
  "surveyIds": [],
  "confidence": "low"
 },
 {
  "item": "Shop vacs",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Cleanup & Jobsite Supplies' area (non-platform).",
  "surveyIds": [],
  "confidence": "medium"
 },
 {
  "item": "Brooms",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Cleanup & Jobsite Supplies' area; the broom / long-handle wall exists today.",
  "surveyIds": [
   "broom_wall"
  ],
  "confidence": "medium"
 },
 {
  "item": "Contractor bags",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Cleanup & Jobsite Supplies' area.",
  "surveyIds": [],
  "confidence": "medium"
 },
 {
  "item": "Tarps, rope & straps",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Cleanup & Jobsite Supplies' area; straps are on the strap isle.",
  "surveyIds": [
   "i66"
  ],
  "confidence": "medium"
 },
 {
  "item": "Sawhorses",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Cleanup & Jobsite Supplies' area.",
  "surveyIds": [],
  "confidence": "medium"
 },
 {
  "item": "Seasonal endcap: ice melt, heaters, fans (rotating)",
  "kind": "email",
  "department": "access_jobsite",
  "group": null,
  "why": "Added 'Seasonal Endcap' suggestion (by the front door).",
  "surveyIds": [],
  "confidence": "low"
 },
 {
  "item": "Checkout impulse: gloves, blades, pencils, tape, batteries",
  "kind": "email",
  "department": null,
  "group": null,
  "why": "Added 'Checkout Impulse' suggestion: small duplicates of items whose home is Safety, Bits & Blades, Hand Tools and Access & Jobsite.",
  "surveyIds": [
   "spin_chk",
   "i47",
   "fd_front_desk"
  ],
  "confidence": "medium"
 },
 {
  "item": "Milwaukee (M18 FUEL tools, PACKOUT, lasers)",
  "kind": "brand",
  "department": "power_tools",
  "group": "Milwaukee",
  "why": "Battery-platform brand: child group in Power Tools.",
  "surveyIds": [
   "i50",
   "i59",
   "i83",
   "i71"
  ],
  "confidence": "high"
 },
 {
  "item": "Milwaukee hand tools (tapes, knives, pliers on the vendor panel)",
  "kind": "brand",
  "department": "hand_tools",
  "group": null,
  "why": "Universal hand tools (hybrid rule): an intact Milwaukee block inside Hand Tools & Measuring.",
  "surveyIds": [
   "i108"
  ],
  "confidence": "medium"
 },
 {
  "item": "DeWalt (cordless tools, lasers, saw blades)",
  "kind": "brand",
  "department": "power_tools",
  "group": "DeWalt",
  "why": "Battery-platform brand: child group in Power Tools. Its universal blades go to Bits & Blades.",
  "surveyIds": [
   "i52",
   "i102"
  ],
  "confidence": "high"
 },
 {
  "item": "Makita (cordless tools, radio, blower, cases)",
  "kind": "brand",
  "department": "power_tools",
  "group": "Makita",
  "why": "Battery-platform brand: child group in Power Tools.",
  "surveyIds": [
   "i53"
  ],
  "confidence": "high"
 },
 {
  "item": "Diablo / Freud (saw blades, recip blades, bits, HardieBlade)",
  "kind": "brand",
  "department": "bits_blades",
  "group": null,
  "why": "Universal cutting accessories.",
  "surveyIds": [
   "i56",
   "diablo_af"
  ],
  "confidence": "high"
 },
 {
  "item": "Kreg (pocket-hole jigs, screws, clamps)",
  "kind": "brand",
  "department": "woodworking",
  "group": null,
  "why": "Email: Woodworking.",
  "surveyIds": [
   "i54"
  ],
  "confidence": "high"
 },
 {
  "item": "BORA",
  "kind": "brand",
  "department": "woodworking",
  "group": null,
  "why": "On the Oct 1 survey as WOODWORKING (KREG/BORA) wall (i60, gone on Oct 5) and the old catalog.",
  "surveyIds": [],
  "confidence": "low"
 },
 {
  "item": "Les Bois Milling (slab wood)",
  "kind": "brand",
  "department": "woodworking",
  "group": null,
  "why": "Email: Woodworking.",
  "surveyIds": [],
  "confidence": "high"
 },
 {
  "item": "Occidental Leather (tool belts, bags, work belts)",
  "kind": "brand",
  "department": "safety_workwear",
  "group": null,
  "why": "Email: Safety & Wearables.",
  "surveyIds": [
   "i58"
  ],
  "confidence": "high"
 },
 {
  "item": "Muck Boot Company (work boots)",
  "kind": "brand",
  "department": "safety_workwear",
  "group": null,
  "why": "Work boots are workwear.",
  "surveyIds": [
   "i95",
   "i96",
   "i97"
  ],
  "confidence": "medium"
 },
 {
  "item": "Simpson Strong-Tie (screws, connectors)",
  "kind": "brand",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Email: Hardware.",
  "surveyIds": [
   "i62"
  ],
  "confidence": "high"
 },
 {
  "item": "Simpson Strong-Tie Outdoor Accents",
  "kind": "brand",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Email: Hardware. The Outdoor Accents boxes appear on the pergola display's shelving in the photos; stock them with the Simpson line and keep a demo on the pergola.",
  "surveyIds": [
   "i64",
   "i78"
  ],
  "confidence": "high"
 },
 {
  "item": "Hillman",
  "kind": "brand",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Email: Hardware.",
  "surveyIds": [
   "i57"
  ],
  "confidence": "high"
 },
 {
  "item": "DeckFast (deck / exterior wood screws)",
  "kind": "brand",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Deck screws are on the email's Hardware list; tubs sit on the decking wall today.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "medium"
 },
 {
  "item": "Loctite (threadlockers)",
  "kind": "brand",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Small-format glues and threadlockers seen on the fastener aisle.",
  "surveyIds": [
   "i57"
  ],
  "confidence": "medium"
 },
 {
  "item": "Rocket Anchor (drywall anchors)",
  "kind": "brand",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Anchors are fasteners; seen on the back sales desk pegboard.",
  "surveyIds": [
   "i47"
  ],
  "confidence": "medium"
 },
 {
  "item": "Ramset (powder-actuated, unclear in photo)",
  "kind": "brand",
  "department": "hardware_fasteners",
  "group": null,
  "why": "Powder-actuated fasteners are fasteners.",
  "surveyIds": [],
  "confidence": "low"
 },
 {
  "item": "Stanley (plumb bob)",
  "kind": "brand",
  "department": "hand_tools",
  "group": null,
  "why": "Layout hand tool; seen on the back sales desk pegboard.",
  "surveyIds": [
   "i47"
  ],
  "confidence": "medium"
 },
 {
  "item": "Buck Knives",
  "kind": "brand",
  "department": "hand_tools",
  "group": null,
  "why": "Pocket knives are hand tools; locked case.",
  "surveyIds": [
   "i109"
  ],
  "confidence": "medium"
 },
 {
  "item": "Rolair (compressors)",
  "kind": "brand",
  "department": "pneumatic_air",
  "group": null,
  "why": "Compressors are air systems.",
  "surveyIds": [
   "i104"
  ],
  "confidence": "high"
 },
 {
  "item": "Stinger (CS150B cap staplers)",
  "kind": "brand",
  "department": "pneumatic_air",
  "group": null,
  "why": "Cap staplers are air tools; boxes in the warehouse racks.",
  "surveyIds": [
   "i105",
   "i106"
  ],
  "confidence": "medium"
 },
 {
  "item": "Tytan (boxed warehouse stock)",
  "kind": "brand",
  "department": null,
  "group": null,
  "why": "Product line not readable in the photo.",
  "surveyIds": [
   "i105",
   "i106"
  ],
  "confidence": "low"
 },
 {
  "item": "Penofin (red-, blue- and green-label finishes)",
  "kind": "brand",
  "department": "paint_finishing",
  "group": null,
  "why": "Email: Paints, Stains & Accessories.",
  "surveyIds": [
   "r_penofin",
   "i55",
   "i68"
  ],
  "confidence": "high"
 },
 {
  "item": "DAP (patching, caulk)",
  "kind": "brand",
  "department": "paint_finishing",
  "group": null,
  "why": "Caulk gun / DAP rack on the paint isle.",
  "surveyIds": [
   "r_caulk1"
  ],
  "confidence": "medium"
 },
 {
  "item": "Trex (Enhance, Select, Transcend samples)",
  "kind": "brand",
  "department": "decking_outdoor",
  "group": null,
  "why": "Decking samples on the decking wall.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "high"
 },
 {
  "item": "TimberTech (decking samples and header)",
  "kind": "brand",
  "department": "decking_outdoor",
  "group": null,
  "why": "Decking samples on the decking wall.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "high"
 },
 {
  "item": "Fiberon, MAXIMO Thermo, Moso Bamboo Outdoor (decking literature)",
  "kind": "brand",
  "department": "decking_outdoor",
  "group": null,
  "why": "Brochures in the decking wall rack.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "medium"
 },
 {
  "item": "Sylvanix, CINCH (brochures on the decking wall rack)",
  "kind": "brand",
  "department": "decking_outdoor",
  "group": null,
  "why": "Brochures in the decking wall literature rack; product lines not confirmed.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "low"
 },
 {
  "item": "UltraShield Naturale (composite siding/cladding)",
  "kind": "brand",
  "department": "decking_outdoor",
  "group": null,
  "why": "Boxed siding samples on the decking wall.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "medium"
 },
 {
  "item": "TruWood, LP SmartSide, AZEK trim, cedar, T1-11 (siding/trim sample boards)",
  "kind": "brand",
  "department": "decking_outdoor",
  "group": null,
  "why": "Siding, soffit and exterior trim sample boards above the decking samples.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "medium"
 },
 {
  "item": "Cedar Valley shingle panels, stone veneer samples",
  "kind": "brand",
  "department": "decking_outdoor",
  "group": null,
  "why": "Exterior cladding samples on the decking wall.",
  "surveyIds": [
   "i63"
  ],
  "confidence": "medium"
 },
 {
  "item": "Kennatrack",
  "kind": "brand",
  "department": null,
  "group": null,
  "why": "Only seen as a framed apron in a decor shadow box (docs).",
  "surveyIds": [],
  "confidence": "medium"
 },
 {
  "item": "FBS logo merch (tumblers, can coolers, pint glasses)",
  "kind": "brand",
  "department": "decking_outdoor",
  "group": null,
  "why": "Logo drinkware sells with grills and outdoor living (mug wall inside the pergola footprint).",
  "surveyIds": [
   "i65"
  ],
  "confidence": "low"
 }
]);

/** The 10 default department keys, in the owner's order. */
export const DEFAULT_KEYS = Object.freeze(CATALOG.areas.map((a) => a.key));
const DEFAULT_SET = new Set(DEFAULT_KEYS);
/** Family keys a category may use ("custom" included). */
export const FAMILY_KEYS = Object.freeze([...Object.keys(CATALOG.families), CATALOG.customFamily]);

export const isDefaultKey = (key) => DEFAULT_SET.has(key);
/** Custom category keys start with "c_" (and are never one of the defaults). */
export const isCustomKey = (key) => typeof key === "string" && /^c_[a-z0-9_]{1,30}$/.test(key) && !DEFAULT_SET.has(key);

/** The default department with this key, or null. */
export function getArea(key) {
  return CATALOG.areas.find((a) => a.key === key) || null;
}

// fields a map's CategoryDef may change on a default department
const OVERRIDABLE = ["name", "color", "family", "subcats", "notes", "targetSqft", "hidden"];

/** A starting [length, depth] (ft) for a block of this many square feet: 2:1, rounded to 6 inches. */
export function sizeForSqft(sqft) {
  const s = Number.isFinite(sqft) && sqft > 0 ? sqft : 100;
  const d = Math.max(2, Math.round(Math.sqrt(s / 2) * 2) / 2);
  return [Math.max(2, Math.round((s / d) * 2) / 2), d];
}

/**
 * The categories a map actually uses: the 10 defaults (with the map's overrides applied) followed by the map's
 * custom categories. mapCategories is the map's validated "categories" array (CategoryDef[]); defaults is
 * normally CATALOG.areas. Each result has isDefault / custom / overridden flags. New objects; inputs untouched.
 */
export function mergeCategories(defaults = CATALOG.areas, mapCategories = []) {
  const list = Array.isArray(mapCategories) ? mapCategories : [];
  const byKey = new Map();
  for (const c of list) if (c && typeof c.key === "string") byKey.set(c.key, c);
  const out = [];
  const defaultKeys = new Set();
  for (const d of defaults) {
    defaultKeys.add(d.key);
    const o = byKey.get(d.key);
    const m = {
      ...d,
      subcats: [...(d.subcats || [])],
      groups: (d.groups || []).map((g) => ({ ...g })),
      notes: d.notes ?? "",
      hidden: false,
      isDefault: true,
      custom: false,
      overridden: !!o,
    };
    if (o) {
      for (const k of OVERRIDABLE) if (o[k] !== undefined) m[k] = Array.isArray(o[k]) ? [...o[k]] : o[k];
      if (o.color !== undefined && String(o.color).toLowerCase() !== String(d.color).toLowerCase()) m.colorDark = o.color;
    }
    out.push(m);
  }
  let order = out.length;
  for (const c of list) {
    if (!c || typeof c.key !== "string" || defaultKeys.has(c.key)) continue;
    const target = Number.isFinite(c.targetSqft) ? c.targetSqft : 0;
    out.push({
      key: c.key,
      order: ++order,
      name: c.name || c.key,
      family: c.family || CATALOG.customFamily,
      color: c.color,
      colorDark: c.color,
      token: null,
      size: sizeForSqft(target),
      targetSqft: target,
      sqft: null,
      adjacency: [],
      entry: "none",
      placement: null,
      subcats: [...(c.subcats || [])],
      rules: [],
      notes: c.notes || "",
      groups: [],
      fixtures: [],
      fixtureSqft: 0,
      hidden: !!c.hidden,
      isDefault: false,
      custom: true,
      overridden: false,
    });
  }
  return out;
}

/**
 * Product finder: "M18 battery", "Diablo blade", "Penofin", "harness" -> ranked PRODUCTS entries with their
 * department (and brand group). Case-insensitive word match on the product line, its reason and its group.
 */
export function searchProducts(query, limit = 12) {
  const words = String(query ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((w) => w.length > 1);
  if (!words.length) return [];
  const scored = [];
  for (const p of PRODUCTS) {
    const head = (p.item + " " + (p.group || "")).toLowerCase();
    const text = head + " " + p.why.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (new RegExp("\\b" + w).test(head)) score += 3;
      else if (text.includes(w)) score += 1;
      else if (w.length > 3 && w.endsWith("s") && text.includes(w.slice(0, -1))) score += 1;
    }
    if (score) scored.push({ p, score: score + (p.kind === "brand" ? 0.5 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => ({ ...s.p, area: getArea(s.p.department) ? getArea(s.p.department).name : null }));
}
