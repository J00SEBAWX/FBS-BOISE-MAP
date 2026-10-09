/* FBS Boise store map: the surveyed store layout and the fixed constants the map needs.
 *
 * Units are feet. Plan x runs east (0 = west wall), plan y runs north (0 = south wall).
 * Each item has a centre (x, y), a length w, a depth d, a height h and a rotation in
 * degrees (rot). The "front" of an item is its +d side before rotation.
 *
 * To change the layout, edit the numbers in ITEMS below and reload the page.
 * Types: floor, zone (upper level), wall, door, opening, arch, column, ring (sales desk),
 * counter, gondola, wallunit, rack, platform, stairs, tower, display, table.
 * Optional fields: color / top (hex colours), brand / brand2 (product keys from PAL below,
 * front and back side), ceil (ceiling height of a floor area), solid (a door with no glass),
 * led (lit desk front), shape / cham / open (sales desk outline and staff openings),
 * style (display kind), locked (a fixed main desk; its map label is drawn bold).
 */
"use strict";

(function () {
  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }

  // Building footprint (feet).
  const BLD = {L: 169, W: 80};

  // The surveyed layout.
  const ITEMS = [
    {id: "i1", type: "floor", name: "Warehouse floor", x: 25, y: 50.75, w: 50, d: 58.5, h: 0, rot: 0, color: "#9a9c97", ceil: 22},
    {id: "i2", type: "floor", name: "Von's area", x: 25, y: 10.75, w: 50, d: 21.5, h: 0, rot: 0, color: "#b7b6b0", ceil: 9},
    {id: "i3", type: "floor", name: "Sales floor", x: 76.5, y: 40, w: 53, d: 80, h: 0, rot: 0, color: "#c3c5c1", ceil: 15},
    {id: "i4", type: "floor", name: "Front room", x: 115, y: 40, w: 24, d: 80, h: 0, rot: 0, color: "#c9a36f", ceil: 9.4},
    {id: "i5", type: "floor", name: "Front room east", x: 148, y: 35, w: 42, d: 70, h: 0, rot: 0, color: "#c9a36f", ceil: 12},
    {id: "i6", type: "zone", name: "Mezzanine (offices above)", x: 148.5, y: 62, w: 41, d: 16, h: 9.5, rot: 0, color: "#8a5a34"},
    {id: "i7", type: "zone", name: "Loft above Von's area", x: 24.65, y: 10.55, w: 49.3, d: 21.1, h: 10, rot: 0, color: "#8a5a34"},
    {id: "i8", type: "wall", name: "South wall", x: 55.65, y: -0.35, w: 112.7, d: 0.7, h: 16, rot: 0, color: "#b9ae9c"},
    {id: "i9", type: "wall", name: "South wall", x: 143.85, y: -0.35, w: 51.7, d: 0.7, h: 16, rot: 0, color: "#b9ae9c"},
    {id: "i10", type: "wall", name: "West wall", x: -0.35, y: 40, w: 80, d: 0.7, h: 20, rot: 90, color: "#b9ae9c"},
    {id: "i11", type: "wall", name: "North wall", x: 13.15, y: 80.35, w: 27.7, d: 0.7, h: 18, rot: 0, color: "#b9ae9c"},
    {id: "i12", type: "wall", name: "North wall", x: 33.75, y: 80.35, w: 7.5, d: 0.7, h: 18, rot: 0, color: "#b9ae9c"},
    {id: "i13", type: "wall", name: "North wall", x: 66, y: 80.35, w: 41, d: 0.7, h: 18, rot: 0, color: "#b9ae9c"},
    {id: "i14", type: "wall", name: "North wall", x: 109.75, y: 80.35, w: 34.5, d: 0.7, h: 18, rot: 0, color: "#b9ae9c"},
    {id: "i15", type: "wall", name: "North wall (notch)", x: 127.35, y: 75.35, w: 10.7, d: 0.7, h: 16, rot: 90, color: "#b9ae9c"},
    {id: "i16", type: "wall", name: "North wall (old building)", x: 148.35, y: 70.35, w: 42.7, d: 0.7, h: 16, rot: 0, color: "#b9ae9c"},
    {id: "i17", type: "wall", name: "East wall", x: 169.35, y: 35, w: 70, d: 0.7, h: 16, rot: 90, color: "#b9ae9c"},
    {id: "i18", type: "wall", name: "Warehouse wall (grid C)", x: 50, y: 35, w: 27, d: 0.7, h: 18, rot: 90, color: "#e2dccf"},
    {id: "i19", type: "wall", name: "Warehouse wall (grid C)", x: 50, y: 69.75, w: 2.5, d: 0.7, h: 18, rot: 90, color: "#e2dccf"},
    {id: "i20", type: "wall", name: "Warehouse wall (grid C)", x: 50, y: 78.75, w: 2.5, d: 0.7, h: 18, rot: 90, color: "#e2dccf"},
    {id: "i21", type: "wall", name: "Von's area wall", x: 50, y: 1.5, w: 3, d: 0.7, h: 14, rot: 90, color: "#e2dccf"},
    {id: "i22", type: "wall", name: "Von's area wall", x: 50, y: 13.75, w: 15.5, d: 0.7, h: 14, rot: 90, color: "#e2dccf"},
    {id: "i23", type: "wall", name: "Warehouse south wall", x: 14.5, y: 21.5, w: 29, d: 0.7, h: 18, rot: 0, color: "#e2dccf"},
    {id: "i24", type: "wall", name: "Warehouse south wall", x: 42.33, y: 21.5, w: 14.65, d: 0.7, h: 18, rot: 0, color: "#e2dccf"},
    {id: "i25", type: "wall", name: "Arch wall (grid E)", x: 103, y: 10.2, w: 20.4, d: 0.7, h: 16, rot: 90, color: "#e6dcc6"},
    {id: "i26", type: "wall", name: "Arch wall (grid E)", x: 103, y: 30.01, w: 2.38, d: 0.7, h: 16, rot: 90, color: "#e6dcc6"},
    {id: "i27", type: "wall", name: "Arch wall (grid E)", x: 103, y: 40.44, w: 2.32, d: 0.7, h: 16, rot: 90, color: "#e6dcc6"},
    {id: "i28", type: "wall", name: "Arch wall (grid E)", x: 103, y: 60.99, w: 30.62, d: 0.7, h: 16, rot: 90, color: "#e6dcc6"},
    {id: "i29", type: "wall", name: "Arch wall (grid E)", x: 103, y: 79.65, w: 0.7, d: 0.7, h: 16, rot: 90, color: "#e6dcc6"},
    {id: "i30", type: "door", name: "FRONT DOOR", x: 115, y: -0.35, w: 6, d: 0.7, h: 7.9, rot: 0, color: "#1c1c1c"},
    {id: "i31", type: "door", name: "WILL CALL DOORS", x: 89.5, y: 80.35, w: 6, d: 0.7, h: 7.9, rot: 0, color: "#3b2616"},
    {id: "i32", type: "door", name: "Warehouse glass roll-up", x: 41.5, y: 80.35, w: 8, d: 0.7, h: 10, rot: 0, color: "#1c1c1c"},
    {id: "i33", type: "door", name: "Warehouse man door", x: 28.5, y: 80.35, w: 3, d: 0.7, h: 7, rot: 0, color: "#6b6f73", solid: true},
    {id: "i34", type: "opening", name: "EMPLOYEES ONLY doorway", x: 32, y: 21.5, w: 6, d: 0.7, h: 7.5, rot: 0, color: "#2f55c4"},
    {id: "i35", type: "door", name: "Von's door", x: 50, y: 4.5, w: 3, d: 0.7, h: 7, rot: 90, color: "#f2f2ee", solid: true},
    {id: "i36", type: "opening", name: "Milwaukee doorway", x: 50, y: 74.25, w: 6.5, d: 0.7, h: 8.5, rot: 90, color: "#3b2616"},
    {id: "i37", type: "opening", name: "Wide opening (wood header)", x: 50, y: 58.5, w: 20, d: 0.7, h: 12.6, rot: 90, color: "#3b2616"},
    {id: "i38", type: "arch", name: "ARCH 1 8'5\"", x: 103, y: 24.61, w: 8.42, d: 0.7, h: 10.5, rot: 90, color: "#b9bcbc"},
    {id: "i39", type: "arch", name: "ARCH 2 8'1\"", x: 103, y: 35.24, w: 8.08, d: 0.7, h: 10.5, rot: 90, color: "#b9bcbc"},
    {id: "i40", type: "opening", name: "SQUARE ARCH 4'1\"", x: 103, y: 43.64, w: 4.08, d: 0.7, h: 8.5, rot: 90, color: "#b9bcbc"},
    {id: "i41", type: "door", name: "White door", x: 103, y: 77.8, w: 3, d: 0.7, h: 6.9, rot: 90, color: "#f2f2ee", solid: true},
    {id: "i42", type: "column", name: "Column", x: 54.5, y: 20, w: 1.2, d: 1.2, h: 10.5, rot: 0, color: "#f1f1ee"},
    {id: "i43", type: "column", name: "Column", x: 71.2, y: 20, w: 1.2, d: 1.2, h: 10.5, rot: 0, color: "#f1f1ee"},
    {id: "i44", type: "column", name: "Column", x: 80, y: 20, w: 1.2, d: 1.2, h: 10.5, rot: 0, color: "#f1f1ee"},
    {id: "i45", type: "column", name: "SDB column (TV)", x: 75, y: 40, w: 1.6, d: 1.6, h: 16, rot: 0, color: "#f1f1ee"},
    {id: "i46", type: "column", name: "Warehouse post", x: 25, y: 40, w: 1, d: 1, h: 20, rot: 0, color: "#5b3a1e"},
    {id: "i47", type: "ring", name: "SALES DESK BACK (SDB)", x: 76.5, y: 40.5, w: 15.4, d: 10, h: 3.4, rot: 0, color: "#f3f3f1", top: "#1a1a1c", locked: false, led: true, shape: "oct", cham: 1.75, open: {sides: ["E", "W"], w: 3.5}},
    {id: "i48", type: "ring", name: "SALES DESK FRONT (SDF)", x: 117, y: 29, w: 20, d: 10, h: 3.4, rot: 0, color: "#a7aaac", top: "#d8d2c4", locked: true, shape: "oct", cham: 1.75, open: {sides: ["E", "W"], w: 3.5}},
    {id: "i49", type: "counter", name: "TOM'S DESK", x: 54.45, y: 37.41, w: 6.6, d: 20.83, h: 3.85, rot: 0, color: "#8a5a34", top: "#1a1a1c", locked: true},
    {id: "i50", type: "gondola", name: "MILWAUKEE / HAMMER ISLE 28'", x: 65.5, y: 70.25, w: 27.5, d: 3, h: 6.5, rot: 0, color: "#c9ccce", brand: "milwaukee", brand2: "hammer"},
    {id: "i51", type: "gondola", name: "SAFETY ISLE 32'6\"", x: 66, y: 61.25, w: 32.5, d: 2.5, h: 6, rot: 0, color: "#c9ccce", brand: "safety", brand2: "safety"},
    {id: "i52", type: "gondola", name: "DEWALT ISLE 21'8\"", x: 62.44, y: 54, w: 25.5, d: 3, h: 6.5, rot: 0, color: "#1c1c1c", brand: "dewalt", brand2: "dewalt"},
    {id: "i53", type: "gondola", name: "MAKITA ROW 25'6\"", x: 94.5, y: 62, w: 25.5, d: 4, h: 6.5, rot: 90, color: "#0b6f78", brand: "makita", brand2: "makita"},
    {id: "i54", type: "gondola", name: "KREG 8'", x: 94, y: 41, w: 8, d: 4, h: 6, rot: 0, color: "#1846a8", brand: "kreg", brand2: "kreg"},
    {id: "i55", type: "gondola", name: "PAINT ISLE 17'6\"", x: 58.5, y: 15.75, w: 17.5, d: 4, h: 6, rot: 90, color: "#c9ccce", brand: "paint", brand2: "paint"},
    {id: "i56", type: "gondola", name: "SAW BLADE/BITS 27' (4A/3B)", x: 66.8, y: 20, w: 25, d: 4, h: 6, rot: 90, color: "#c9ccce", brand: "diablo", brand2: "diablo"},
    {id: "i57", type: "gondola", name: "NAIL/SCREW 23'4\" (3A)", x: 75.5, y: 19.17, w: 23.33, d: 4, h: 6, rot: 90, color: "#c9ccce", brand: "nails", brand2: "nails"},
    {id: "i58", type: "gondola", name: "OCCIDENTAL BAG ISLE 23'4\"", x: 86, y: 19.17, w: 23.33, d: 4, h: 6, rot: 90, color: "#c9ccce", brand: "occidental", brand2: "occidental"},
    {id: "i59", type: "wallunit", name: "MILWAUKEE PACKOUT WALL 24'", x: 66.25, y: 78.35, w: 32.5, d: 2.5, h: 8, rot: 180, color: "#a3101a", brand: "milwaukee"},
    {id: "i60", type: "wallunit", name: "WOODWORKING (KREG/BORA)", x: 95.8, y: 78.7, w: 6, d: 1.8, h: 7, rot: 180, color: "#1846a8", brand: "kreg"},
    {id: "i61", type: "wallunit", name: "AIR GUNS 30' (TRY IT BUY IT)", x: 101.7, y: 61.2, w: 30, d: 1.8, h: 7.5, rot: 90, color: "#1c1c1c", brand: "airguns"},
    {id: "i62", type: "wallunit", name: "SIMPSON SCREW WALL 19'10\"", x: 51.3, y: 15.89, w: 19.83, d: 1.8, h: 7, rot: 270, color: "#1c1c1c", brand: "simpson"},
    {id: "i63", type: "wallunit", name: "DECKING WALL 50'", x: 75.4, y: 1.3, w: 50, d: 1.8, h: 8, rot: 0, color: "#e9e9e6", brand: "decking"},
    {id: "i64", type: "wallunit", name: "SIMPSON ORNAMENTAL 13'9\"", x: 101, y: 7, w: 13.75, d: 1.8, h: 7.5, rot: 90, color: "#1c1c1c", brand: "simpson_orn"},
    {id: "i65", type: "wallunit", name: "FBS MUG WALL 5'", x: 101.7, y: 16.45, w: 5, d: 1.8, h: 7, rot: 90, color: "#8a5a34", brand: "mugs"},
    {id: "i66", type: "wallunit", name: "STRAP ISLE 12'", x: 128, y: 46, w: 12, d: 1.8, h: 6, rot: 90, color: "#1c1c1c", brand: "straps"},
    {id: "i67", type: "rack", name: "PALLET RACK - WEST WALL", x: 2.5, y: 50, w: 52, d: 4, h: 14, rot: 90, color: "#1f5a47"},
    {id: "i68", type: "rack", name: "PALLET RACK - PAINT", x: 16, y: 77.75, w: 20, d: 3.5, h: 14, rot: 0, color: "#1f5a47"},
    {id: "i69", type: "rack", name: "PALLET RACK - SOUTH", x: 11, y: 24, w: 10, d: 4, h: 14, rot: 0, color: "#1f5a47"},
    {id: "i71", type: "platform", name: "Laser deck", x: 46.6, y: 42.3, w: 12, d: 6, h: 0.35, rot: 90, color: "#1b2f7a", brand: "milwaukee"},
    {id: "i72", type: "stairs", name: "Stairs up to loft", x: 47.5, y: 28.8, w: 14, d: 3.8, h: 10, rot: 270, color: "#8a5a34"},
    {id: "i73", type: "stairs", name: "Stairs to offices", x: 110, y: 62.5, w: 14, d: 4.2, h: 9.5, rot: 180, color: "#8a5a34"},
    {id: "i74", type: "tower", name: "Hardhat tower 1", x: 101.3, y: 19.55, w: 1, d: 1.5, h: 7.2, rot: 0, color: "#59b52a"},
    {id: "i75", type: "tower", name: "Hardhat tower 2", x: 101.3, y: 30, w: 1, d: 1.5, h: 7.2, rot: 0, color: "#59b52a"},
    {id: "i76", type: "tower", name: "Hardhat tower 3", x: 101.3, y: 40.45, w: 1, d: 1.5, h: 7.2, rot: 0, color: "#59b52a"},
    {id: "i77", type: "tower", name: "Hardhat tower 4", x: 104.7, y: 46.6, w: 1, d: 1.5, h: 7.2, rot: 0, color: "#59b52a"},
    {id: "i78", type: "display", name: "Simpson pergola display", x: 95, y: 11.5, w: 17.5, d: 14.5, h: 9.3, rot: 270, color: "#9a6a3c", style: "pergola"},
    {id: "i79", type: "table", name: "Maple workbench", x: 94.65, y: 17, w: 6, d: 2.3, h: 3.1, rot: 90, color: "#d9b98a"},
    {id: "i83", type: "table", name: "Milwaukee workbench displays", x: 75.25, y: 72, w: 10.5, d: 2, h: 3.4, rot: 0, color: "#262626"},
    {id: "i84", type: "counter", name: "Coffee / soda counter", x: 134, y: 1.53, w: 16, d: 2.45, h: 3.1, rot: 0, color: "#f1f1ee", top: "#9c968a"},
    {id: "i85", type: "display", name: "Soda coolers", x: 104.5, y: 4, w: 6.1, d: 2.6, h: 6.6, rot: 270, color: "#202124", style: "coolers"},
    {id: "i86", type: "display", name: "Cubicles", x: 137.25, y: 35, w: 16.5, d: 39, h: 5, rot: 0, color: "#cdbf9f", style: "cubicles"},
    {id: "i87", type: "counter", name: "Cedar desk by square arch", x: 108.5, y: 55, w: 10, d: 2.5, h: 3.75, rot: 0, color: "#8a5a34", top: "#d8d2c4"},
    {id: "i99", type: "display", name: "Scaffolding cage", x: 33.9, y: 77.65, w: 6.2, d: 2.7, h: 7.4, rot: 0, color: "#e3b21a", style: "cage"},
    {id: "i100", type: "display", name: "White storage cabinet", x: 49, y: 74, w: 3.5, d: 1, h: 7, rot: 270, color: "#efefec"},
    {id: "n10015m49", type: "counter", name: "Cedar desk by square arch", x: 113.5, y: 58, w: 3.5, d: 1, h: 3.75, rot: 90, color: "#8a5a34", top: "#d8d2c4", locked: false},
    {id: "n10027j02", type: "stairs", name: "Stairs to offices", x: 108, y: 67, w: 9.5, d: 4, h: 9.5, rot: 0, color: "#8a5a34", locked: false}
  ];

  // What each kind of item is called, and whether you can walk through it.
  const TYPES = {
    floor:    {label: "Floor area",    blocks: false},
    zone:     {label: "Upper level",   blocks: false},
    wall:     {label: "Wall",          blocks: true},
    door:     {label: "Door",          blocks: false},
    opening:  {label: "Opening",       blocks: false},
    arch:     {label: "Arch",          blocks: false},
    column:   {label: "Column",        blocks: true},
    gondola:  {label: "Shelving aisle", blocks: true},
    wallunit: {label: "Wall shelving", blocks: true},
    rack:     {label: "Pallet rack",   blocks: true},
    pallet:   {label: "Pallet stack",  blocks: true},
    ring:     {label: "Sales desk",    blocks: true},
    counter:  {label: "Counter",       blocks: true},
    table:    {label: "Table",         blocks: true},
    display:  {label: "Display",       blocks: true},
    tower:    {label: "Hardhat tower", blocks: true},
    platform: {label: "Platform",      blocks: false},
    stairs:   {label: "Stairs",        blocks: true}
  };

  // Product colours per brand (used for shelf stock in 3D and fixture colours on the map).
  const PAL = {
    milwaukee: ["#b3121f", "#c41b1b", "#1d1d1d", "#e8e8e8", "#8f0d16"],
    hammer: ["#f2c200", "#1d1d1d", "#a3101a", "#7a5231"],
    safety: ["#cde21a", "#f07e14", "#333333", "#e9e9e4", "#d9a31a", "#657079"],
    dewalt: ["#f2b705", "#f2b705", "#141414", "#f7cc26"],
    makita: ["#008a95", "#00a2ad", "#161616", "#d9d9d9"],
    kreg: ["#1846a8", "#2c5fc9", "#e6e6e6", "#f0be1a"],
    paint: ["#ececec", "#a6a6ab", "#1d3e8f", "#8a5a2c", "#c7c2b8"],
    diablo: ["#b0101a", "#d11f24", "#ececec", "#151515"],
    nails: ["#ececea", "#d11f1f", "#304f99", "#9a9a9a"],
    occidental: ["#5a2e14", "#1a1a1a", "#7a4a24", "#9a7442"],
    simpson: ["#ececea", "#2a6a3a", "#e8590d", "#9a9a9a"],
    simpson_orn: ["#151515", "#4a4a4a", "#b09a74"],
    decking: ["#8a5a34", "#6a4c38", "#a3101a", "#f0c21a", "#4a4a4a"],
    airguns: ["#ececea", "#d11f1f", "#1a1a1a", "#1f7a44"],
    straps: ["#151515", "#f07e14", "#4dbd33", "#e9e9e9"],
    mugs: ["#e0337f", "#1a9a9a", "#f2f2f2", "#26262e", "#e59a1a"],
    boxes: ["#a07850", "#b08a60", "#e8e6e0", "#f2b705", "#9a1a1a", "#1a7a80"]
  };

  // Friendly names for the brand / product keys above.
  const BRAND_NAMES = {
    milwaukee: "Milwaukee",
    hammer: "Hammers / hand tools",
    safety: "Safety & PPE",
    dewalt: "DeWalt",
    makita: "Makita",
    kreg: "Kreg",
    paint: "Paint",
    diablo: "Diablo blades & bits",
    nails: "Nails & screws",
    occidental: "Occidental Leather",
    simpson: "Simpson Strong-Tie",
    simpson_orn: "Simpson Outdoor Accents",
    decking: "Decking",
    airguns: "Air tools",
    straps: "Straps & tie-downs",
    mugs: "FBS mugs",
    boxes: "Boxed stock"
  };

  // Layout of tex/prod_atlas.jpg: a 16x16 grid of packaging photos, 14 cells per brand
  // in this order, plus the average colour of every cell.
  const ATLAS_ORDER = ["milwaukee", "hammer", "safety", "dewalt", "makita", "kreg", "paint", "diablo", "nails", "occidental", "simpson", "simpson_orn", "airguns", "straps", "mugs", "decking", "boxes", "cardboard"];
  const ATLAS = {
    grid: 16,
    cells: {},
    avg: [
      "#af504f","#673d3c","#614e4e","#6a575e","#746c7a","#666167","#53545b","#8d525e","#b7595a","#904340","#74595e","#75322e","#825152","#5b3b44",
      "#56565b","#8d7b87","#434346","#777678","#444142","#ab6a6e","#3f4149","#7d7d85","#817c80","#737983","#241e1f","#b9a892","#8c8886","#535662",
      "#76612d","#797579","#a9aba7","#73655f","#895f4c","#996243","#6d582a","#a4a19a","#7b7272","#534241","#75685f","#636537","#8a7254","#6e6865",
      "#54462a","#7b653b","#6d6759","#8e7e5e","#3a3429","#463c2a","#7a726c","#302c25","#65635b","#79663f","#6b6762","#7a6640","#4c483d","#554f41",
      "#203d4a","#264969","#2d5667","#3e5d6a","#2d4b5a","#294b68","#35454e","#274757","#8b939b","#26495a","#4f7786","#687069","#30424d","#1e4160",
      "#4f5c78","#5b6167","#72a3e2","#59637a","#5c687f","#617faf","#505b72","#5f5f63","#5f656c","#4a5674","#515a6b","#4e596d","#485674","#78ace2",
      "#58524f","#6b6066","#6e6c6a","#68574e","#634333","#7f7072","#878e8b","#3e3b4a","#69564e","#776f67","#6b4f49","#7b4627","#66575a","#764c33",
      "#694040","#6d4644","#795b5a","#8d7270","#605b56","#8d4d4e","#7d736f","#7c4140","#7e5857","#855856","#88625b","#797370","#8e726a","#8c6764",
      "#797472","#75757b","#99a6a9","#b1b3ac","#7e7569","#767172","#606265","#4f4849","#6a5d54","#6f675d","#b0b5b0","#827d74","#897e7d","#3b352f",
      "#5b5b5e","#606661","#37383d","#676d72","#9a998a","#918f86","#716b69","#333638","#5f5f65","#252429","#525863","#22252c","#675f59","#7c7977",
      "#773d33","#846668","#846e6f","#714638","#4a4646","#7d4135","#796b71","#7d514b","#584346","#925e56","#847a7f","#8f6a6b","#8c7475","#6d3a32",
      "#3f3a30","#23262a","#5e6673","#5d4e40","#575f64","#303030","#807769","#3e4347","#191c1f","#656057","#444646","#65727d","#4b5157","#6a5943",
      "#a19d7c","#ad9fab","#75747a","#9c9499","#7c776b","#456596","#9e7a5f","#957560","#9a7f64","#84807c","#7d94b6","#93a8b9","#706c6b","#878a86",
      "#818285","#7a6f66","#64272a","#693033","#5c3f37","#63272a","#3f1c1b","#a5aeb2","#3a362c","#5b4b4b","#452121","#8a847c","#847667","#6f2f35",
      "#756b78","#7d6351","#969996","#575252","#695e55","#785e45","#666865","#7b7d7b","#696764","#745c4c","#918c84","#76787e","#8d6c46","#524d4b",
      "#adaaac","#7e7670","#928e85","#706a63","#8c7d6d","#6a625b","#beb8b2","#777062","#9c8e80","#79604f","#7f6f69","#67605c","#98938b","#c4beb7",
      "#587182","#726e68","#879089","#617549","#574a49","#6d6768","#938d8f","#23343f","#7c807d","#938584","#4d4140","#31373f","#50504c","#314955",
      "#667074","#717975","#475669","#5a6770","#4d585c","#727b79","#586878","#516172","#778277","#768078","#5e7488","#6b7d87","#878775","#525e6b"
    ]
  };
  ATLAS_ORDER.forEach(function (b, i) {
    const list = [];
    for (let k = 0; k < 14; k++) list.push(i * 14 + k);
    ATLAS.cells[b] = list;
  });

  window.FBS_STORE = deepFreeze({BLD: BLD, ITEMS: ITEMS, TYPES: TYPES, PAL: PAL, BRAND_NAMES: BRAND_NAMES, ATLAS: ATLAS});
})();
